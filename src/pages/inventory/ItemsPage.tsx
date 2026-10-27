import { Plus, X } from 'lucide-react';
import { useCallback, useDeferredValue, useId, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import { decimalText, toScale } from '../../domain/decimal';
import { normalizeCode } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { BASE_UNITS, COUNTED_KINDS, dimensionOf, ITEM_KINDS, itemProblems, type ItemKind, type ItemProblem } from '../../domain/stores';
import { parseDensity, parseFactor, parseQty, type BaseUnit } from '../../domain/units';
import { describeError, NotConnectedError, ZeroRowsError } from '../../lib/errors';
import { columnDecimals, fmtInt, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { ItemCursor, ItemFields, ItemRow, ItemTwin, ItemUnitRow, OrgSetup, PackTypeRow } from '../../lib/repo/inventory';
import { useSession } from '../../lib/session';
import { baseUnitLabel, itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';

// المواد (خطّة المرحلة 1 WP2، FOUNDATION ٢٦٨–٢٧٣ و٨١٢–٨١٣): جدول بالبحث بالاسم (searchable) والرمز (normalizeCode)، وصفحات
// بالمعرّف، و«N من المجموع» من القاعدة. النموذج: النوع ووحدة الأساس والكثافة وكتلة القطعة والانتهاء والخطوة والحدّ الأدنى
// والباركود والرموز الإضافية (تنضاف وتنشال من هنا بس، ماكو «اربط رمزاً بمادّة»). قبل الحفظ التوائم: نفس الاسم تنبيه يمرّ
// بالتأكيد، ونفس الرمز رفض (الرمز يدلّ على مادّة واحدة). ووحدات التعبئة من أحجام الإعدادات أو مخصّصة، بافتراضي واحد.

const PROBLEM_TEXT: Record<ItemProblem, () => string> = {
  name: () => t('constraint.items_name_check', 'اسم المادّة مطلوب، ولا يزيد على 120 حرفاً.'),
  name_norm: () => t('constraint.items_name_norm_check', 'اكتب اسماً بحروف؛ التطويل والتشكيل وحدهما لا يكفيان للبحث.'),
  count_kind: () => t('constraint.items_count_kinds_check', 'بيض التفقيس والأفراخ وبيض المائدة تُعدّ بالقطعة دائماً.'),
  density: () => t('constraint.items_density_check', 'الكثافة أكبر من صفر، بأربع مراتب عشرية كحدّ أقصى.'),
  density_unit: () => t('constraint.items_density_unit_check', 'الكثافة للمادّة السائلة (باللتر) فقط.'),
  piece_mass: () => t('constraint.items_piece_mass_check', 'كتلة القطعة أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.'),
  piece_mass_unit: () => t('constraint.items_piece_mass_unit_check', 'كتلة القطعة للمادّة المعدودة (بالقطعة) فقط.'),
  step: () => t('constraint.items_scale_step_check', 'خطوة العدّاد أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.'),
  min_qty: () => t('constraint.items_min_qty_check', 'الحدّ الأدنى صفر أو أكثر، بثلاث مراتب عشرية كحدّ أقصى.'),
  pieces_whole: () => t('constraint.items_pieces_whole_check', 'المادّة المعدودة خطوتها وحدّها الأدنى أعداد صحيحة.'),
};

/** نصّ رقم من القاعدة للحقل (بلا فواصل: الحقل يكتبه المستخدم ويقرأه parseQty). */
const fieldText = (value: bigint | null, scale: number) => (value === null ? '' : decimalText(value, scale).replace(/\.?0+$/, ''));

export interface ItemFormState {
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  categoryId: string;
  density: string;
  pieceMass: string;
  tracksExpiry: boolean;
  step: string;
  minQty: string;
  barcode: string;
  altCodes: string[];
}

export function formOf(item: ItemRow | null): ItemFormState {
  return {
    name: item?.name ?? '',
    kind: item?.kind ?? 'raw',
    baseUnit: item?.baseUnit ?? 'kg',
    categoryId: item?.categoryId ?? '',
    density: fieldText(item?.density ?? null, 4),
    pieceMass: fieldText(item?.pieceMassKg ?? null, 3),
    tracksExpiry: item?.tracksExpiry ?? false,
    step: item ? fieldText(item.scaleStep, 3) : '0.1',
    minQty: fieldText(item?.minQty ?? null, 3),
    barcode: item?.barcode ?? '',
    altCodes: [...(item?.altCodes ?? [])],
  };
}

/** الحقول للكتابة، أو أخطاء الحقول بأسمائها (نفس قيود القاعدة، itemProblems). */
export function fieldsOf(form: ItemFormState): { fields: ItemFields; errors: Partial<Record<'name' | 'density' | 'pieceMass' | 'step' | 'minQty' | 'kind', string>> } {
  const density = form.density.trim() ? parseDensity(form.density) : null;
  const pieceMass = form.pieceMass.trim() ? parseQty(form.pieceMass) : null;
  const step = parseQty(form.step);
  const minQty = form.minQty.trim() ? parseQty(form.minQty) : null;
  const errors: ReturnType<typeof fieldsOf>['errors'] = {};
  const numberError = t('items.number.invalid', 'اكتب رقماً صحيحاً بمراتبه المسموحة.');
  if (form.density.trim() && density === null) errors.density = numberError;
  if (form.pieceMass.trim() && pieceMass === null) errors.pieceMass = numberError;
  if (step === null) errors.step = numberError;
  if (form.minQty.trim() && minQty === null) errors.minQty = numberError;
  const at: Record<ItemProblem, keyof typeof errors> = { name: 'name', name_norm: 'name', count_kind: 'kind', density: 'density', density_unit: 'density', piece_mass: 'pieceMass', piece_mass_unit: 'pieceMass', step: 'step', min_qty: 'minQty', pieces_whole: 'step' };
  for (const problem of itemProblems({ name: form.name, kind: form.kind, baseUnit: form.baseUnit, density, pieceMassKg: pieceMass, scaleStep: step ?? 1n, minQty })) {
    errors[at[problem]] ??= PROBLEM_TEXT[problem]();
  }
  return {
    errors,
    fields: {
      name: form.name.trim(),
      category_id: form.categoryId || null,
      kind: form.kind,
      base_unit: form.baseUnit,
      density_kg_per_l: density === null ? null : decimalText(density, 4),
      piece_mass_kg: pieceMass === null ? null : decimalText(pieceMass, 3),
      tracks_expiry: form.tracksExpiry,
      scale_step: decimalText(step ?? 0n, 3),
      min_qty: minQty === null ? null : decimalText(minQty, 3),
      barcode: normalizeCode(form.barcode) || null,
      alt_codes: [...new Set(form.altCodes.map(normalizeCode).filter(Boolean))],
    },
  };
}

/** الحقول المتغيّرة بس (FOUNDATION ٨١٧): التعديل يبعث اللي تغيّر عن النسخة اللي انفتحت. */
export function changedFields(before: ItemFields, after: ItemFields): Partial<ItemFields> {
  const patch: Partial<ItemFields> = {};
  for (const key of Object.keys(after) as (keyof ItemFields)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) Object.assign(patch, { [key]: after[key] });
  }
  return patch;
}

/** التوائم بعد الاستثناء: الرموز المشتركة ويّا مادّة فعّالة (رفض)، والاسم نفسه (تنبيه). */
export function twinVerdict(twins: readonly ItemTwin[], selfId: string | null): { codes: ItemTwin[]; names: ItemTwin[] } {
  const others = twins.filter((twin) => twin.id !== selfId);
  return { codes: others.filter((twin) => !twin.archived && twin.codes.length > 0), names: others.filter((twin) => twin.sameName) };
}

/**
 * الحدّ الأدنى عمود لكل وحدة أساس بالصفحة، والوحدة برأسه (قانون الجداول وE23): الكمية بـfmtQtyCell بمراتب ثابتة للعمود، ثلاث
 * للكيلو واللتر وصفر للقطع (القطع أعداد صحيحة، items_pieces_whole_check). عمود واحد لكل الوحدات كان يطلّع «10.0» قطع.
 */
function minColumns(rows: readonly ItemRow[]): Column<ItemRow>[] {
  return BASE_UNITS.filter((unit) => rows.some((row) => row.baseUnit === unit)).map((unit): Column<ItemRow> => ({
    key: `min-${unit}`,
    header: t('items.col.min.unit', 'الحدّ الأدنى ({unit})', { unit: baseUnitLabel(unit) }),
    kind: 'number',
    cell: (item) => (item.baseUnit !== unit ? '' : item.minQty === null ? '—' : <Num>{fmtQtyCell(item.minQty, unit === 'pc' ? 0 : 3)}</Num>),
  }));
}

export function ItemsTable({ rows, categories, onOpen }: { rows: readonly ItemRow[]; categories: OrgSetup['itemCategories']; onOpen?: (item: ItemRow, action: 'edit' | 'units' | 'archive') => void }) {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const columns: Column<ItemRow>[] = [
    { key: 'name', header: t('items.col.name', 'المادّة'), wrap: true, cell: (item) => (item.archived ? t('items.archived.name', '{name} (مؤرشفة)', { name: item.name }) : item.name) },
    { key: 'kind', header: t('items.col.kind', 'النوع'), cell: (item) => itemKindLabel(item.kind) },
    { key: 'category', header: t('items.col.category', 'التصنيف'), cell: (item) => (item.categoryId ? (names.get(item.categoryId) ?? '—') : '—') },
    { key: 'unit', header: t('items.col.unit', 'وحدة الأساس'), cell: (item) => baseUnitLabel(item.baseUnit) },
    { key: 'codes', header: t('items.col.codes', 'الرموز'), cell: (item) => (item.barcode || item.altCodes.length ? <bdi dir="ltr">{[item.barcode, ...item.altCodes].filter(Boolean).join(t('list.separator', '، '))}</bdi> : '—') },
    ...minColumns(rows),
  ];
  if (onOpen) {
    columns.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (item) => (
        <div className="flex gap-1.5">
          {item.archived ? null : (
            <>
              <Button size="sm" variant="secondary" onClick={() => onOpen(item, 'edit')} aria-label={t('items.edit.for', 'عدّل {name}', { name: item.name })} data-action="edit-item">
                {t('items.edit', 'عدّل')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onOpen(item, 'units')} aria-label={t('items.units.for', 'وحدات {name}', { name: item.name })} data-action="item-units">
                {t('items.units', 'وحدات التعبئة')}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => onOpen(item, 'archive')} data-action={item.archived ? 'restore-item' : 'archive-item'}>
            {item.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
          </Button>
        </div>
      ),
    });
  }
  return <DataTable caption={t('items.caption', 'المواد')} columns={columns} rows={rows} rowKey={(item) => item.id} empty={t('items.empty', 'لا موادّ بهذا البحث.')} />;
}

export function ItemForm({ form, setForm, categories, errors, id }: { form: ItemFormState; setForm: (form: ItemFormState) => void; categories: OrgSetup['itemCategories']; errors: ReturnType<typeof fieldsOf>['errors']; id: string }) {
  const [code, setCode] = useState('');
  const set = (patch: Partial<ItemFormState>) => setForm({ ...form, ...patch });
  const addCode = () => {
    const normalized = normalizeCode(code);
    if (normalized && !form.altCodes.map(normalizeCode).includes(normalized)) set({ altCodes: [...form.altCodes, normalized] });
    setCode('');
  };
  return (
    <div className="flex flex-col gap-4">
      <Field id={`${id}-name`} label={t('items.name', 'اسم المادّة')} error={errors.name}>
        <input id={`${id}-name`} className="input" maxLength={120} value={form.name} onChange={(event) => set({ name: event.target.value })} data-autofocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-kind`} label={t('items.kind', 'النوع')} error={errors.kind}>
          <select id={`${id}-kind`} className="input" value={form.kind} onChange={(event) => {
            const kind = event.target.value as ItemKind;
            set(COUNTED_KINDS.has(kind) ? { kind, baseUnit: 'pc', step: '1', density: '' } : { kind });
          }}>
            {ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {itemKindLabel(kind)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-unit`} label={t('items.base_unit', 'وحدة الأساس')} hint={t('items.base_unit.hint', 'الرصيد والحركات بهذه الوحدة دائماً.')}>
          <select id={`${id}-unit`} className="input" value={form.baseUnit} onChange={(event) => {
            const baseUnit = event.target.value as BaseUnit;
            set({ baseUnit, density: baseUnit === 'L' ? form.density : '', pieceMass: baseUnit === 'pc' ? form.pieceMass : '', step: baseUnit === 'pc' ? '1' : form.step });
          }}>
            {BASE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {baseUnitLabel(unit)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-category`} label={t('items.category', 'التصنيف')}>
          <select id={`${id}-category`} className="input" value={form.categoryId} onChange={(event) => set({ categoryId: event.target.value })}>
            <option value="">{t('items.category.none', 'دون تصنيف')}</option>
            {categories.filter((category) => !category.archived || category.id === form.categoryId).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        {form.baseUnit === 'L' ? (
          <Field id={`${id}-density`} label={t('items.density', 'الكثافة (كغم لكل لتر)')} hint={t('items.density.hint', 'أربع مراتب كحدّ أقصى، مثل 0.92.')} error={errors.density}>
            <input id={`${id}-density`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.density} onChange={(event) => set({ density: event.target.value })} />
          </Field>
        ) : null}
        {form.baseUnit === 'pc' ? (
          <Field id={`${id}-piece`} label={t('items.piece_mass', 'كتلة القطعة (كغم)')} hint={t('items.piece_mass.hint', 'اختيارية، لتوزيع مصاريف النقل بالكتلة.')} error={errors.pieceMass}>
            <input id={`${id}-piece`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.pieceMass} onChange={(event) => set({ pieceMass: event.target.value })} />
          </Field>
        ) : null}
        <Field id={`${id}-step`} label={t('items.step', 'خطوة العدّاد')} error={errors.step}>
          <input id={`${id}-step`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.step} onChange={(event) => set({ step: event.target.value })} />
        </Field>
        <Field id={`${id}-min`} label={t('items.min', 'الحدّ الأدنى للتنبيه')} hint={t('items.min.hint', 'بوحدة الأساس، للعرض فقط.')} error={errors.minQty}>
          <input id={`${id}-min`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.minQty} onChange={(event) => set({ minQty: event.target.value })} />
        </Field>
      </div>
      <Switch id={`${id}-expiry`} label={t('items.expiry', 'تتبّع تاريخ الانتهاء')} description={t('items.expiry.detail', 'السحب بالأقرب انتهاءً أوّلاً، والمنتهي لا يُسحب تلقائياً.')} checked={form.tracksExpiry} onChange={(tracksExpiry) => set({ tracksExpiry })} />
      <Field id={`${id}-barcode`} label={t('items.barcode', 'الباركود')}>
        <input id={`${id}-barcode`} dir="ltr" autoComplete="off" className="input" value={form.barcode} onChange={(event) => set({ barcode: event.target.value })} />
      </Field>
      <Field id={`${id}-code`} label={t('items.alt_codes', 'رموز إضافية')} hint={t('items.alt_codes.hint', 'تُضاف وتُحذف من هنا فقط، وكل رمز يدلّ على مادّة واحدة.')}>
        <div className="flex gap-2">
          <input
            id={`${id}-code`}
            dir="ltr"
            autoComplete="off"
            className="input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCode();
              }
            }}
          />
          <Button variant="secondary" onClick={addCode} data-action="add-code">
            {t('items.alt_codes.add', 'أضف')}
          </Button>
        </div>
      </Field>
      {form.altCodes.length ? (
        <ul className="flex flex-wrap gap-2">
          {form.altCodes.map((alt) => (
            <li key={alt} className="flex items-center gap-1 rounded-full border border-line ps-3">
              <bdi dir="ltr">{alt}</bdi>
              <IconButton label={t('items.alt_codes.remove', 'احذف الرمز {code}', { code: alt })} onClick={() => set({ altCodes: form.altCodes.filter((x) => x !== alt) })}>
                <X aria-hidden="true" className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ItemDialog({ item, setup, onClose, onSaved }: { item: ItemRow | null; setup: Pick<OrgSetup, 'itemCategories'>; onClose: () => void; onSaved: (item: ItemRow) => void }) {
  const id = useId();
  const [form, setForm] = useState(() => formOf(item));
  const [errors, setErrors] = useState<ReturnType<typeof fieldsOf>['errors']>({});
  const [twins, setTwins] = useState<{ codes: ItemTwin[]; names: ItemTwin[] } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const original = fieldsOf(formOf(item)).fields;
  const { fields, errors: found } = fieldsOf(form);
  const patch = item ? changedFields(original, fields) : fields;
  const dirty = Object.keys(item ? patch : changedFields(original, fields)).length > 0;
  // التنبيه بالاسم يمرّ بالتأكيد مرّة لنفس الاسم: تغيير الاسم بعده يرجّع الفحص.
  const confirmed = twins !== null && twins.codes.length === 0 && twins.names.length > 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (!confirmed) {
        const verdict = twinVerdict(await inventory.findItemTwins(fields.name, [fields.barcode ?? '', ...fields.alt_codes]), item?.id ?? null);
        if (verdict.codes.length || verdict.names.length) {
          setTwins(verdict);
          return;
        }
      }
      onSaved(item ? await inventory.updateItem(item.id, item.version, patch) : await inventory.createItem(fields));
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
      title={item ? t('items.edit.title', 'تعديل {name}', { name: item.name }) : t('items.new', 'مادّة جديدة')}
      dirty={dirty}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} disabled={(item !== null && !dirty) || (twins?.codes.length ?? 0) > 0} data-action={confirmed ? 'save-item-twin' : 'save-item'}>
            {confirmed ? t('items.save.twin', 'احفظ رغم التشابه') : t('org.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        <ItemForm id={id} form={form} categories={setup.itemCategories} errors={errors} setForm={(next) => {
          setForm(next);
          setTwins(null);
        }} />
        {twins?.codes.length ? (
          <Notice tone="danger" title={t('items.twin.codes', 'رمز مستعمل لمادّة أخرى')}>
            {twins.codes.map((twin) => t('items.twin.code', '«{codes}» للمادّة «{name}».', { codes: twin.codes.join(t('list.separator', '، ')), name: twin.name })).join(' ')}
          </Notice>
        ) : twins?.names.length ? (
          <Notice tone="warning" title={t('items.twin.names', 'مادّة بالاسم نفسه موجودة')}>
            {t('items.twin.names.detail', 'تشبهها: {names}. احفظ إن كانت مادّة أخرى فعلاً.', { names: twins.names.map((twin) => (twin.archived ? t('items.archived.name', '{name} (مؤرشفة)', { name: twin.name }) : twin.name)).join(t('list.separator', '، ')) })}
          </Notice>
        ) : null}
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      </form>
    </Dialog>
  );
}

/**
 * معامل وحدة المادّة بستّ مراتب (الخطّة §2.7، item_units_factor_check): من حجم التعبئة كما هو، أو المخصّص من نصّ المستخدم
 * (أمبولة 2.5 مل = 0.0025 لتر). موجب، أو null. ثلاث مراتب كانت تدفع المستخدم يكتب 0.003 فتنرحّل 1,000 أمبولة 3 لترات.
 */
export function unitFactor(pack: Pick<PackTypeRow, 'factor'> | null, text: string): bigint | null {
  if (pack) return pack.factor > 0n ? pack.factor : null;
  const value = parseFactor(text);
  return value === null ? null : toScale(value, 6);
}

/** نافذة الوحدات وسخة بأيّ حقل مكتوب: Esc والنقرة برّا وX يسألون قبل ما تضيع الكتابة (§2.9). */
export function unitsDirty(state: { packId: string; label: string; factor: string; isDefault: boolean }): boolean {
  return state.packId !== '' || state.label !== '' || state.factor !== '' || state.isDefault;
}

function UnitsDialog({ item, packs, onClose }: { item: ItemRow; packs: OrgSetup['packTypes']; onClose: () => void }) {
  const id = useId();
  const loadUnits = useCallback(() => inventory.listItemUnits(item.id), [item.id]);
  const units = useLoad(loadUnits, item.id);
  const usable = packs.filter((pack) => !pack.archived && pack.dimension === dimensionOf(item.baseUnit));
  const [packId, setPackId] = useState('');
  const [label, setLabel] = useState('');
  const [factor, setFactor] = useState('');
  const [isDefault, setDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const pack = usable.find((option) => option.id === packId) ?? null;
  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    work()
      .then(() => {
        units.retry();
        setPackId('');
        setLabel('');
        setFactor('');
        setDefault(false);
      }, setFailure)
      .finally(() => setBusy(false));
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const units6 = unitFactor(pack, factor);
    if (!(pack?.label ?? label).trim() || units6 === null) {
      setFailure(new Error('unit_fields'));
      return;
    }
    run(() =>
      inventory.createItemUnit(item.id, pack?.id ?? null, {
        label: (pack?.label ?? label).trim(),
        factor_to_base: decimalText(units6, 6),
        is_default: isDefault,
        for_purchase: true,
        for_sale: true,
        for_recipe: true,
      }),
    );
  };
  const rows = units.data ?? [];
  const decimals = columnDecimals(rows.map((unit) => unit.factor), 6);
  const columns: Column<ItemUnitRow>[] = [
    {
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (unit) => (
        <div className="flex gap-1.5">
          {!unit.archived && !unit.isDefault ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => inventory.updateItemUnit(unit.id, unit.version, { is_default: true }))} data-action="default-unit">
              {t('items.unit.make_default', 'اجعلها الافتراضية')}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => inventory.setArchived('item_units', unit.id, unit.version, !unit.archived))} data-action={unit.archived ? 'restore-unit' : 'archive-unit'}>
            {unit.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
          </Button>
        </div>
      ),
    },
    { key: 'label', header: t('items.unit.label', 'الوحدة'), cell: (unit) => (unit.isDefault ? t('items.unit.default', '{label} (الافتراضية)', { label: unit.label }) : unit.label) },
    { key: 'factor', header: t('items.unit.factor', 'تساوي ({unit})', { unit: baseUnitLabel(item.baseUnit) }), kind: 'number', cell: (unit) => <Num>{fmtScaledCell(unit.factor, 6, decimals)}</Num> },
    { key: 'status', header: t('org.status', 'الحالة'), cell: (unit) => (unit.archived ? t('org.status.archived', 'مؤرشف') : t('org.status.active', 'فعّال')) },
  ];
  const failed = failure instanceof Error && failure.message === 'unit_fields' ? { title: t('items.unit.required', 'اختر حجماً أو اكتب اسم الوحدة ومعاملها'), detail: t('items.unit.required.detail', 'المعامل رقم أكبر من صفر، بستّ مراتب عشرية كحدّ أقصى.') } : failure ? describeError(failure, 'once') : null;
  return (
    <Dialog open onClose={onClose} title={t('items.units.title', 'وحدات تعبئة {name}', { name: item.name })} dirty={unitsDirty({ packId, label, factor, isDefault })} locked={busy}>
      <div className="flex flex-col gap-4">
        {units.error ? <LoadFailed what={t('items.units', 'وحدات التعبئة')} error={units.error} onRetry={units.retry} /> : <DataTable caption={t('items.units', 'وحدات التعبئة')} columns={columns} rows={rows} rowKey={(unit) => unit.id} empty={units.data ? t('items.units.empty', 'لا وحدات تعبئة بعد؛ تُدخل الكمية بوحدة الأساس.') : t('page.loading', 'جارٍ الفتح…')} />}
        <form className="flex flex-col gap-3" onSubmit={add} noValidate>
          <Field id={`${id}-pack`} label={t('items.unit.pack', 'من أحجام التعبئة')}>
            <select id={`${id}-pack`} className="input" value={packId} onChange={(event) => setPackId(event.target.value)}>
              <option value="">{t('items.unit.custom', 'وحدة مخصّصة')}</option>
              {usable.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {pack ? null : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`${id}-label`} label={t('items.unit.label', 'الوحدة')}>
                <input id={`${id}-label`} className="input" maxLength={40} value={label} onChange={(event) => setLabel(event.target.value)} />
              </Field>
              <Field id={`${id}-factor`} label={t('items.unit.factor', 'تساوي ({unit})', { unit: baseUnitLabel(item.baseUnit) })}>
                <input id={`${id}-factor`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={factor} onChange={(event) => setFactor(event.target.value)} />
              </Field>
            </div>
          )}
          <Switch id={`${id}-default`} label={t('items.unit.default.switch', 'الوحدة الافتراضية')} description={t('items.unit.default.detail', 'تحلّ محلّ الافتراضية السابقة.')} checked={isDefault} onChange={setDefault} />
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
          <Button type="submit" busy={busy} icon={<Plus aria-hidden="true" className="size-4" />} data-action="add-unit">
            {t('items.unit.add', 'أضف الوحدة')}
          </Button>
        </form>
      </div>
    </Dialog>
  );
}

type DialogState = null | { kind: 'new' } | { kind: 'edit' | 'units' | 'archive'; item: ItemRow };

export default function ItemsPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const manage = workspace ? can(workspace.role, 'stores.manage') : false;
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const searchId = useId();
  const archivedId = useId();
  const deferred = useDeferredValue(search);
  const key = `${workspace?.orgId ?? 'none'}|${deferred}|${archived}`;
  const loadFirst = useCallback(() => inventory.listItems({ search: deferred, archived }), [deferred, archived]);
  const first = useLoad(loadFirst, key);
  const setup = useLoad(inventory.loadOrgSetup, workspace?.orgId ?? 'none');
  const [more, setMore] = useState<{ key: string; rows: readonly ItemRow[]; next: ItemCursor | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const extra = more?.key === key ? more : null;
  const rows = first.data ? [...first.data.rows, ...(extra?.rows ?? [])] : [];
  const next = extra ? extra.next : (first.data?.next ?? null);

  const refresh = () => {
    setMore(null);
    first.retry();
  };
  const loadMore = () => {
    if (!next) return;
    setLoadingMore(true);
    inventory
      .listItems({ search: deferred, archived, after: next })
      .then(
        (page) => setMore({ key, rows: [...(extra?.rows ?? []), ...page.rows], next: page.next }),
        (error: unknown) => {
          const { title, detail } = describeError(error, 'read');
          toast({ tone: 'danger', title, detail });
        },
      )
      .finally(() => setLoadingMore(false));
  };

  const header = (
    <PageHeader
      title={t('items.title', 'المواد')}
      subtitle={t('items.subtitle', 'الموادّ ووحدة أساسها ووحدات تعبئتها ورموزها.')}
      actions={
        manage && setup.data ? (
          <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setDialog({ kind: 'new' })} data-action="new-item">
            {t('items.new', 'مادّة جديدة')}
          </Button>
        ) : null
      }
    />
  );
  const error = first.error ?? setup.error;
  if (error instanceof NotConnectedError) {
    const { title, detail } = describeError(error);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Field id={searchId} label={t('items.search', 'ابحث بالاسم أو الرمز')}>
            <input id={searchId} type="search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Switch id={archivedId} label={t('items.show_archived', 'المؤرشفة أيضاً')} checked={archived} onChange={setArchived} />
      </div>
      {error ? (
        <LoadFailed what={t('items.caption', 'المواد')} error={error} onRetry={refresh} />
      ) : !first.data || !setup.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <ItemsTable rows={rows} categories={setup.data.itemCategories} onOpen={manage ? (item, kind) => setDialog({ kind, item }) : undefined} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span>{t('items.count', '{shown} من المجموع {total}', { shown: fmtInt(rows.length), total: fmtInt(first.data.total ?? rows.length) })}</span>
            {next ? (
              <Button size="sm" variant="secondary" busy={loadingMore} onClick={loadMore} data-action="more-items">
                {t('items.more', 'حمّل المزيد')}
              </Button>
            ) : null}
          </div>
        </>
      )}
      {(dialog?.kind === 'new' || dialog?.kind === 'edit') && setup.data ? (
        <ItemDialog
          item={dialog.kind === 'edit' ? dialog.item : null}
          setup={setup.data}
          onClose={() => setDialog(null)}
          onSaved={(item) => {
            setDialog(null);
            refresh();
            toast({ tone: 'success', title: t('items.saved', 'حُفظت المادّة «{name}»', { name: item.name }) });
          }}
        />
      ) : null}
      {dialog?.kind === 'units' && setup.data ? <UnitsDialog item={dialog.item} packs={setup.data.packTypes} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        tone={dialog?.kind === 'archive' && dialog.item.archived ? 'primary' : 'danger'}
        title={dialog?.kind === 'archive' ? (dialog.item.archived ? t('org.restore.title', 'إعادة «{name}»', { name: dialog.item.name }) : t('org.archive.title', 'أرشفة «{name}»', { name: dialog.item.name })) : ''}
        consequence={
          dialog?.kind === 'archive'
            ? dialog.item.archived
              ? t('items.restore.consequence', 'تعود «{name}» إلى القوائم برموزها، إن لم يأخذ رموزها غيرها.', { name: dialog.item.name })
              : t('items.archive.consequence', 'تختفي «{name}» من القوائم الجديدة وتتحرّر رموزها، ويبقى سجلّها.', { name: dialog.item.name })
            : null
        }
        confirmLabel={dialog?.kind === 'archive' && dialog.item.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
        busy={busy}
        action="confirm-archive-item"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== 'archive') return;
          setBusy(true);
          inventory
            .setArchived('items', dialog.item.id, dialog.item.version, !dialog.item.archived)
            .then(
              () => {
                setDialog(null);
                refresh();
              },
              (caught: unknown) => {
                setDialog(null);
                if (caught instanceof ZeroRowsError) refresh();
                const { title, detail } = describeError(caught, 'once');
                toast({ tone: 'danger', title, detail });
              },
            )
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
