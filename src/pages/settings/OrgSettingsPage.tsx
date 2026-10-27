import { Plus } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { toScale } from '../../domain/decimal';
import type { DivisionKind } from '../../domain/divisions';
import { parseDayText } from '../../lib/dayText';
import { can, type ScopeTarget } from '../../domain/permissions';
import { inScope } from '../../domain/scope';
import { DIVISION_ORDER, SITE_KIND_FOR, WAREHOUSE_KINDS_FOR, type WarehouseKind } from '../../domain/stores';
import { parseFactor, type BaseUnit, type Dimension } from '../../domain/units';
import { describeError, NotConnectedError, ZeroRowsError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { CategoryRow, DivisionSetup, ExpenseCategoryRow, MasterTable, OrgSetup, PackTypeRow, SiteRow, WarehouseRow } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { useSession } from '../../lib/session';
import { baseUnitLabel, dimensionLabel, siteKindLabel, warehouseKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';

// «إعدادات المنشأة» (خطّة المرحلة 1 WP2): يوم تشغيل كل وحدة (يتجمّد بعد أوّل ترحيل)، والمواقع والمخازن بكل وحدة، وأحجام
// التعبئة، وتصنيفات المواد وفئات المصاريف (النظامية للقراءة). الصلاحية من الدور (Q1): المخازن والأحجام والتصنيفات
// stores.manage، وفئات المصاريف expense_categories.manage، ويوم التشغيل opening.post؛ والحكم بالقاعدة. ماكو حذف: الأرشفة
// بتأكيد يسمّي السجلّ ونتيجته، والإعادة بنفس المعرّف.

type Renamable = 'sites' | 'warehouses' | 'pack_types' | 'item_categories' | 'expense_categories';

type DialogState =
  | null
  | { kind: 'go_live'; division: DivisionSetup }
  | { kind: 'site' }
  | { kind: 'warehouse' }
  | { kind: 'pack' }
  | { kind: 'category' }
  | { kind: 'expense' }
  | { kind: 'rename'; table: Renamable; id: string; version: number; name: string }
  | { kind: 'archive'; table: MasterTable; id: string; version: number; name: string; archived: boolean; consequence: string };

const order = (kind: DivisionKind) => DIVISION_ORDER.indexOf(kind);

/** صفوف جدول المواقع والمخازن: كل موقع وبعده مخازنه، بترتيب الوحدات الست. */
export interface PlaceRow {
  site: SiteRow;
  store: WarehouseRow | null;
  division: DivisionKind;
}

export function placeRows(setup: Pick<OrgSetup, 'divisions' | 'sites' | 'warehouses'>): PlaceRow[] {
  const kindOf = new Map(setup.divisions.map((division) => [division.id, division.kind]));
  const rows: PlaceRow[] = [];
  const sites = [...setup.sites].sort((a, b) => order(kindOf.get(a.divisionId) ?? 'general') - order(kindOf.get(b.divisionId) ?? 'general'));
  for (const site of sites) {
    const division = kindOf.get(site.divisionId) ?? 'general';
    rows.push({ site, store: null, division });
    for (const store of setup.warehouses.filter((w) => w.siteId === site.id)) rows.push({ site, store, division });
  }
  return rows;
}

const status = (archived: boolean) => (archived ? t('org.status.archived', 'مؤرشف') : t('org.status.active', 'فعّال'));

// قراءة اليوم المكتوب (يوم/شهر/سنة) بـsrc/lib/dayText.ts: نفس القراءة لحقل يوم التشغيل هنا ولحقول التاريخ بشاشات الحسابات (WP3).
export { parseDayText };

/** حجم التعبئة بستّ مراتب (pack_types_factor_check، الخطّة §2.7)، موجب، أو null. */
export function packFactor(text: string): bigint | null {
  const value = parseFactor(text);
  return value === null ? null : toScale(value, 6);
}

/**
 * حقل يوم التشغيل: نصّ بيوم/شهر/سنة بأرقام غربية، مو <input type="date"> (الجهاز يرسم قيمته ومنتقيه بلغته وأرقامه، شرقية
 * بجهاز عربي وشهر/يوم بجهاز أمريكي، برّا format.ts وdigits.ts؛ numbers-guard يرفضه).
 */
export function GoLiveField({ id, value, error, onChange }: { id: string; value: string; error: string | null; onChange: (value: string) => void }) {
  return (
    <Field id={id} label={t('org.go_live', 'يوم التشغيل')} hint={t('org.go_live.hint.text', 'يوم/شهر/سنة، مثل 30/09/2026 أو 30092026. أرصدة الافتتاح بهذا اليوم أو قبله، والمستندات العادية بعده. يثبت بعد أوّل ترحيل في الوحدة.')} error={error}>
      <input id={id} inputMode="numeric" dir="ltr" autoComplete="off" placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')} className="input tabular-nums" value={value} onChange={(event) => onChange(event.target.value)} data-autofocus />
    </Field>
  );
}

/** وحدة أساس البُعد: عمود الحجم برأسه وحدته (الكيس بالكيلو، والعبوة باللتر، والكارتون بالقطعة). */
const DIMENSION_UNIT: Readonly<Record<Dimension, BaseUnit>> = { mass: 'kg', volume: 'L', count: 'pc' };

/** «يوم التشغيل»: التاريخ، أو «لم يُحدَّد»، ومعه «ثابت» بعد أوّل ترحيل. */
export function goLiveText(division: DivisionSetup): string {
  const day = division.goLiveOn ? fmtDay(division.goLiveOn) : t('org.go_live.none', 'لم يُحدَّد');
  return division.frozen ? t('org.go_live.frozen', '{day} — ثابت: بدأ الترحيل في الوحدة', { day }) : day;
}

function RowActions({ onRename, onArchive, archived, label }: { onRename?: () => void; onArchive: () => void; archived: boolean; label: string }) {
  return (
    <div className="flex gap-1.5">
      {onRename && !archived ? (
        <Button size="sm" variant="secondary" onClick={onRename} aria-label={t('org.rename.for', 'غيّر اسم {name}', { name: label })} data-action="rename">
          {t('org.rename', 'غيّر الاسم')}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onArchive} aria-label={archived ? t('org.restore.for', 'أعِد {name}', { name: label }) : t('org.archive.for', 'أرشف {name}', { name: label })} data-action={archived ? 'restore' : 'archive'}>
        {archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
      </Button>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** نافذة واحدة لكل إنشاء وتعديل اسم ويوم تشغيل: الحقول حسب النوع، والحفظ يقفلها، والخطأ بمكانه. */
function EditDialog({
  state,
  setup,
  allowed,
  onClose,
  onSaved,
}: {
  state: Exclude<DialogState, null | { kind: 'archive' }>;
  setup: OrgSetup;
  allowed: (target: ScopeTarget) => boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const id = useId();
  // المحصور بوحدات (FOUNDATION ٥٤٤): الموقع الجديد بوحدة بنطاقه، والمخزن الجديد بموقع بنطاقه، مثل سياسات القاعدة.
  const activeSites = setup.sites.filter((site) => !site.archived && allowed({ divisionId: site.divisionId, siteId: site.id }));
  const siteDivisions = setup.divisions.filter((division) => allowed({ divisionId: division.id }));
  const kindOf = new Map(setup.divisions.map((division) => [division.id, division.kind]));
  const [name, setName] = useState(state.kind === 'rename' ? state.name : '');
  const [divisionId, setDivisionId] = useState(siteDivisions.find((division) => division.kind === 'broiler')?.id ?? siteDivisions[0]?.id ?? '');
  const [siteId, setSiteId] = useState(activeSites[0]?.id ?? '');
  const siteDivision = kindOf.get(activeSites.find((site) => site.id === siteId)?.divisionId ?? '') ?? 'general';
  const [storeKind, setStoreKind] = useState<WarehouseKind | ''>('');
  const kinds = WAREHOUSE_KINDS_FOR[siteDivision];
  const kind = storeKind && kinds.includes(storeKind) ? storeKind : (kinds[0] ?? 'general');
  const [dimension, setDimension] = useState<Dimension>('mass');
  const [factor, setFactor] = useState('');
  const initialDay = state.kind === 'go_live' && state.division.goLiveOn ? fmtDay(state.division.goLiveOn) : '';
  const [day, setDay] = useState(initialDay);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const dirty = state.kind === 'go_live' ? day !== initialDay : state.kind === 'rename' ? name !== state.name : name !== '' || factor !== '';

  const title = {
    go_live: () => t('org.go_live.title', 'يوم تشغيل {division}', { division: state.kind === 'go_live' ? divisionLabel(state.division.kind) : '' }),
    site: () => t('org.site.new', 'موقع جديد'),
    warehouse: () => t('org.warehouse.new', 'مخزن جديد'),
    pack: () => t('org.pack.new', 'حجم تعبئة جديد'),
    category: () => t('org.category.new', 'تصنيف مواد جديد'),
    expense: () => t('org.expense.new', 'فئة مصروف جديدة'),
    rename: () => t('org.rename.title', 'اسم جديد لـ{name}', { name: state.kind === 'rename' ? state.name : '' }),
  }[state.kind]();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const text = name.trim();
    const factor6 = packFactor(factor);
    const goLiveOn = state.kind === 'go_live' ? parseDayText(day) : null;
    if (state.kind === 'go_live' ? goLiveOn === null : !text) {
      setError(state.kind === 'go_live' ? t('org.go_live.required', 'اكتب يوم التشغيل يوم/شهر/سنة، مثل 30/09/2026 أو 30092026.') : t('org.name.required', 'اكتب الاسم.'));
      return;
    }
    if (state.kind === 'site' && !siteDivisions.some((division) => division.id === divisionId)) {
      setError(t('org.site.division.required', 'اختر وحدة من نطاقك.'));
      return;
    }
    if (state.kind === 'warehouse' && !activeSites.some((site) => site.id === siteId)) {
      setError(t('org.warehouse.site.required', 'أضف موقعاً فعّالاً أوّلاً، ثم أضف مخزنه.'));
      return;
    }
    if (state.kind === 'pack' && factor6 === null) {
      setError(t('org.pack.factor.required', 'اكتب حجم التعبئة رقماً أكبر من صفر، بستّ مراتب عشرية كحدّ أقصى.'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (state.kind === 'go_live') await inventory.setDivisionGoLive(state.division.id, goLiveOn ?? '');
      else if (state.kind === 'site') await inventory.createSite(divisionId, text, SITE_KIND_FOR[kindOf.get(divisionId) ?? 'general']);
      else if (state.kind === 'warehouse') await inventory.createWarehouse(activeSites.find((site) => site.id === siteId)?.divisionId ?? '', siteId, text, kind);
      else if (state.kind === 'pack') await inventory.createPackType(text, dimension, factor6 ?? 0n);
      else if (state.kind === 'category') await inventory.createItemCategory(text);
      else if (state.kind === 'expense') await inventory.createExpenseCategory(text);
      else await inventory.rename(state.table, state.id, state.version, text);
      onSaved(state.kind === 'go_live' ? t('org.go_live.saved', 'حُفظ يوم التشغيل') : t('org.saved', 'حُفظ'));
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const formId = `${id}-form`;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      dirty={dirty}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} data-action="save-setup">
            {t('org.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        {state.kind === 'go_live' ? <GoLiveField id={`${id}-day`} value={day} error={error} onChange={setDay} /> : null}
        {state.kind === 'site' ? (
          <Field id={`${id}-division`} label={t('org.division', 'الوحدة')} hint={t('org.site.kind', 'نوع الموقع: {kind}', { kind: siteKindLabel(SITE_KIND_FOR[kindOf.get(divisionId) ?? 'general']) })}>
            <select id={`${id}-division`} className="input" value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>
              {[...siteDivisions].sort((a, b) => order(a.kind) - order(b.kind)).map((division) => (
                <option key={division.id} value={division.id}>
                  {divisionLabel(division.kind)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {state.kind === 'warehouse' ? (
          <>
            <Field id={`${id}-site`} label={t('org.site', 'الموقع')}>
              <select id={`${id}-site`} className="input" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                {activeSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {t('org.site.option', '{division} — {site}', { division: divisionLabel(kindOf.get(site.divisionId) ?? 'general'), site: site.name })}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${id}-kind`} label={t('org.warehouse.kind', 'نوع المخزن')} hint={t('org.warehouse.kind.hint', 'الأنواع المسموحة لوحدة الموقع فقط.')}>
              <select id={`${id}-kind`} className="input" value={kind} onChange={(event) => setStoreKind(event.target.value as WarehouseKind)}>
                {kinds.map((option) => (
                  <option key={option} value={option}>
                    {warehouseKindLabel(option)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        {state.kind !== 'go_live' ? (
          <Field id={`${id}-name`} label={state.kind === 'pack' ? t('org.pack.label', 'اسم الحجم') : t('org.name', 'الاسم')} hint={state.kind === 'pack' ? t('org.pack.label.hint', 'مثل «كيس 25 كغم» أو «كارتون 12 طبقة».') : undefined} error={error}>
            <input id={`${id}-name`} className="input" maxLength={state.kind === 'pack' ? 40 : 80} value={name} onChange={(event) => setName(event.target.value)} data-autofocus />
          </Field>
        ) : null}
        {state.kind === 'pack' ? (
          <>
            <Field id={`${id}-dimension`} label={t('org.pack.dimension', 'يُقاس')}>
              <select id={`${id}-dimension`} className="input" value={dimension} onChange={(event) => setDimension(event.target.value as Dimension)}>
                {(['mass', 'volume', 'count'] as const).map((option) => (
                  <option key={option} value={option}>
                    {dimensionLabel(option)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${id}-factor`} label={t('org.pack.factor', 'الحجم بوحدة الأساس')} hint={t('org.pack.factor.hint', 'كم كيلو أو لتراً أو قطعة في الوحدة الواحدة. يثبت بعد الإنشاء.')}>
              <input id={`${id}-factor`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={factor} onChange={(event) => setFactor(event.target.value)} />
            </Field>
          </>
        ) : null}
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      </form>
    </Dialog>
  );
}

export function SetupTables({
  setup,
  permissions,
  allowed = () => true,
  onOpen,
}: {
  setup: OrgSetup;
  permissions: { stores: boolean; expenses: boolean; goLive: boolean };
  /** الشي بنطاق الداخل (inScope، مرآة in_scope_division وin_scope_site وin_scope_wh): أزرار الكتابة عليه بس. */
  allowed?: (target: ScopeTarget) => boolean;
  onOpen: (state: DialogState) => void;
}) {
  const archive = (table: MasterTable, row: { id: string; version: number; archived: boolean }, name: string, consequence: string) =>
    onOpen({ kind: 'archive', table, id: row.id, version: row.version, name, archived: row.archived, consequence });
  const divisions = [...setup.divisions].sort((a, b) => order(a.kind) - order(b.kind));
  const goLive: Column<DivisionSetup>[] = [
    { key: 'division', header: t('org.division', 'الوحدة'), cell: (division) => divisionLabel(division.kind) },
    { key: 'go_live', header: t('org.go_live', 'يوم التشغيل'), wrap: true, cell: (division) => goLiveText(division) },
  ];
  if (permissions.goLive) {
    goLive.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (division) =>
        division.frozen || !allowed({ divisionId: division.id }) ? null : (
          <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: 'go_live', division })} aria-label={t('org.go_live.for', 'حدّد يوم تشغيل {division}', { division: divisionLabel(division.kind) })} data-action="set-go-live">
            {t('org.go_live.set', 'حدّد')}
          </Button>
        ),
    });
  }
  const places: Column<PlaceRow>[] = [
    { key: 'division', header: t('org.division', 'الوحدة'), cell: (row) => (row.store ? '' : divisionLabel(row.division)) },
    { key: 'site', header: t('org.site', 'الموقع'), cell: (row) => (row.store ? '' : row.site.name) },
    { key: 'store', header: t('org.warehouse', 'المخزن'), cell: (row) => row.store?.name ?? '' },
    { key: 'kind', header: t('org.kind', 'النوع'), cell: (row) => (row.store ? warehouseKindLabel(row.store.kind) : siteKindLabel(row.site.kind)) },
    { key: 'status', header: t('org.status', 'الحالة'), cell: (row) => status((row.store ?? row.site).archived) },
  ];
  if (permissions.stores) {
    places.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (row) => {
        const record = row.store ?? row.site;
        const table = row.store ? 'warehouses' : 'sites';
        if (!allowed({ divisionId: row.site.divisionId, siteId: row.site.id, ...(row.store ? { warehouseId: row.store.id } : {}) })) return null;
        return (
          <RowActions
            label={record.name}
            archived={record.archived}
            onRename={() => onOpen({ kind: 'rename', table, id: record.id, version: record.version, name: record.name })}
            onArchive={() =>
              archive(
                table,
                record,
                record.name,
                record.archived
                  ? t('org.restore.consequence', 'يعود «{name}» إلى القوائم كما كان، بنفس سجلّه.', { name: record.name })
                  : row.store
                    ? t('org.archive.store', 'يختفي «{name}» من القوائم ولا يُستلم فيه بعد اليوم، وتبقى حركاته في السجلّ.', { name: record.name })
                    : t('org.archive.site', 'يختفي الموقع «{name}» من القوائم. أرشف مخازنه أوّلاً.', { name: record.name }),
              )
            }
          />
        );
      },
    });
  }
  // الحجم عمود لكل بُعد والوحدة برأسه (قانون الجداول وE23)، وكل عمود بمراتبه الثابتة: الكارتون بالقطعة عدد صحيح (360 مو 360.0).
  const dimensions = (['mass', 'volume', 'count'] as const).filter((dimension) => setup.packTypes.some((pack) => pack.dimension === dimension));
  const packs: Column<PackTypeRow>[] = [
    { key: 'label', header: t('org.pack.label', 'اسم الحجم'), cell: (pack) => pack.label },
    ...dimensions.map((dimension): Column<PackTypeRow> => {
      const decimals = columnDecimals(setup.packTypes.filter((pack) => pack.dimension === dimension).map((pack) => pack.factor), 6);
      return {
        key: `factor-${dimension}`,
        header: t('org.pack.factor.unit', 'الحجم ({unit})', { unit: baseUnitLabel(DIMENSION_UNIT[dimension]) }),
        kind: 'number',
        cell: (pack) => (pack.dimension === dimension ? <Num>{fmtScaledCell(pack.factor, 6, decimals)}</Num> : ''),
      };
    }),
    { key: 'status', header: t('org.status', 'الحالة'), cell: (pack) => status(pack.archived) },
  ];
  const named = <Row extends CategoryRow>(table: 'item_categories' | 'expense_categories', allowed: boolean, isSystem: (row: Row) => boolean): Column<Row>[] => {
    const columns: Column<Row>[] = [
      { key: 'name', header: t('org.name', 'الاسم'), cell: (row) => row.name },
      { key: 'status', header: t('org.status', 'الحالة'), cell: (row) => (isSystem(row) ? t('org.status.system', 'نظامية') : status(row.archived)) },
    ];
    if (allowed) {
      columns.unshift({
        key: 'actions',
        header: t('org.col.actions', 'إجراءات'),
        cell: (row) =>
          isSystem(row) ? (
            <span className="text-ink-muted">{t('org.system.readonly', 'للقراءة فقط')}</span>
          ) : (
            <RowActions
              label={row.name}
              archived={row.archived}
              onRename={() => onOpen({ kind: 'rename', table, id: row.id, version: row.version, name: row.name })}
              onArchive={() =>
                archive(table, row, row.name, row.archived ? t('org.restore.consequence', 'يعود «{name}» إلى القوائم كما كان، بنفس سجلّه.', { name: row.name }) : t('org.archive.named', 'يختفي «{name}» من القوائم الجديدة، ويبقى على ما سُجّل به.', { name: row.name }))
              }
            />
          ),
      });
    }
    return columns;
  };
  if (permissions.stores) {
    packs.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (pack) => (
        <RowActions
          label={pack.label}
          archived={pack.archived}
          onRename={() => onOpen({ kind: 'rename', table: 'pack_types', id: pack.id, version: pack.version, name: pack.label })}
          onArchive={() => archive('pack_types', pack, pack.label, pack.archived ? t('org.restore.consequence', 'يعود «{name}» إلى القوائم كما كان، بنفس سجلّه.', { name: pack.label }) : t('org.archive.named', 'يختفي «{name}» من القوائم الجديدة، ويبقى على ما سُجّل به.', { name: pack.label }))}
        />
      ),
    });
  }
  const add = (state: DialogState, label: string, action: string, allowed: boolean) =>
    allowed ? (
      <Button size="sm" icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => onOpen(state)} data-action={action}>
        {label}
      </Button>
    ) : undefined;
  return (
    <div className="flex flex-col gap-6">
      <Section title={t('org.divisions', 'الوحدات ويوم تشغيلها')}>
        <DataTable caption={t('org.divisions', 'الوحدات ويوم تشغيلها')} columns={goLive} rows={divisions} rowKey={(division) => division.id} empty={t('org.empty', 'لا شيء بعد.')} />
      </Section>
      <Section
        title={t('org.places', 'المواقع والمخازن')}
        action={
          <div className="flex gap-2">
            {add({ kind: 'site' }, t('org.site.new', 'موقع جديد'), 'new-site', permissions.stores)}
            {add({ kind: 'warehouse' }, t('org.warehouse.new', 'مخزن جديد'), 'new-warehouse', permissions.stores)}
          </div>
        }
      >
        <DataTable caption={t('org.places', 'المواقع والمخازن')} columns={places} rows={placeRows(setup)} rowKey={(row) => row.store?.id ?? row.site.id} empty={t('org.empty', 'لا شيء بعد.')} />
      </Section>
      <Section title={t('org.packs', 'أحجام التعبئة')} action={add({ kind: 'pack' }, t('org.pack.new', 'حجم تعبئة جديد'), 'new-pack', permissions.stores)}>
        <DataTable caption={t('org.packs', 'أحجام التعبئة')} columns={packs} rows={setup.packTypes} rowKey={(pack) => pack.id} empty={t('org.empty', 'لا شيء بعد.')} />
      </Section>
      <Section title={t('org.categories', 'تصنيفات المواد')} action={add({ kind: 'category' }, t('org.category.new', 'تصنيف مواد جديد'), 'new-category', permissions.stores)}>
        <DataTable caption={t('org.categories', 'تصنيفات المواد')} columns={named<CategoryRow>('item_categories', permissions.stores, () => false)} rows={setup.itemCategories} rowKey={(row) => row.id} empty={t('org.empty', 'لا شيء بعد.')} />
      </Section>
      <Section title={t('org.expenses', 'فئات المصاريف')} action={add({ kind: 'expense' }, t('org.expense.new', 'فئة مصروف جديدة'), 'new-expense', permissions.expenses)}>
        <DataTable
          caption={t('org.expenses', 'فئات المصاريف')}
          columns={named<ExpenseCategoryRow>('expense_categories', permissions.expenses, (row) => row.systemCode !== null)}
          rows={setup.expenseCategories}
          rowKey={(row) => row.id}
          empty={t('org.empty', 'لا شيء بعد.')}
        />
      </Section>
    </div>
  );
}

export default function OrgSettingsPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const setup = useLoad(inventory.loadOrgSetup, workspace ? `${workspace.userId}:${workspace.orgId}` : 'none');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const role = workspace?.role ?? 'viewer';
  const permissions = { stores: can(role, 'stores.manage'), expenses: can(role, 'expense_categories.manage'), goLive: can(role, 'opening.post') };
  const scopeRows = workspace?.scopes ?? [];
  const allowed = (target: ScopeTarget) => inScope(role, scopeRows, target);

  const done = (message: string) => {
    setDialog(null);
    setup.retry();
    toast({ tone: 'success', title: message });
  };
  const failed = (error: unknown) => {
    // نسخة تغيّرت بعدك (صفر صفوف): القائمة تتحدّث قبل أي إعادة.
    if (error instanceof ZeroRowsError) setup.retry();
    const { title, detail } = describeError(error, 'once');
    toast({ tone: 'danger', title, detail });
  };

  const header = <PageHeader title={t('org.title', 'إعدادات المنشأة')} subtitle={t('org.subtitle', 'الوحدات ويوم تشغيلها، والمواقع والمخازن، وأحجام التعبئة، والتصنيفات.')} />;
  if (setup.error instanceof NotConnectedError) {
    const { title, detail } = describeError(setup.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {header}
      {!permissions.stores && !permissions.expenses && !permissions.goLive ? <Notice tone="info" title={t('org.readonly', 'للقراءة فقط: التعديل للمدير أو مالك المنشأة')} /> : null}
      {setup.error ? (
        <LoadFailed what={t('org.what', 'إعدادات المنشأة')} error={setup.error} onRetry={setup.retry} />
      ) : !setup.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <SetupTables setup={setup.data} permissions={permissions} allowed={allowed} onOpen={setDialog} />
      )}
      {dialog && dialog.kind !== 'archive' && setup.data ? <EditDialog state={dialog} setup={setup.data} allowed={allowed} onClose={() => setDialog(null)} onSaved={done} /> : null}
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        tone={dialog?.kind === 'archive' && dialog.archived ? 'primary' : 'danger'}
        title={dialog?.kind === 'archive' ? (dialog.archived ? t('org.restore.title', 'إعادة «{name}»', { name: dialog.name }) : t('org.archive.title', 'أرشفة «{name}»', { name: dialog.name })) : ''}
        consequence={dialog?.kind === 'archive' ? dialog.consequence : null}
        confirmLabel={dialog?.kind === 'archive' && dialog.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
        busy={busy}
        action="confirm-archive"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== 'archive') return;
          setBusy(true);
          inventory
            .setArchived(dialog.table, dialog.id, dialog.version, !dialog.archived)
            .then(
              () => done(dialog.archived ? t('org.restored', 'أُعيد «{name}»', { name: dialog.name }) : t('org.archived', 'أُرشف «{name}»', { name: dialog.name })),
              (error: unknown) => {
                setDialog(null);
                failed(error);
              },
            )
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
