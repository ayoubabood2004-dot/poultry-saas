import { ChevronLeft, Plus } from 'lucide-react';
import { useCallback, useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import type { Fils } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { BASE_UNITS, COUNTED_KINDS, ITEM_KINDS, itemProblems, type ItemKind, type WarehouseKind } from '../../domain/stores';
import { parseFactor, parseQty, type BaseUnit } from '../../domain/units';
import { decimalText, toScale } from '../../domain/decimal';
import { describeError } from '../../lib/errors';
import { fmtInt, fmtMoney, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { CategoryRow, ItemTwin, StockRow, StockValue, StoreCard } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { useSession } from '../../lib/session';
import { itemKindLabel, warehouseKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { alerts } from './StockBoardPage';
import { StoreBadges } from './StoresCardsPage';
import { countingLabel, PageFooter, qtyColumns, unitName } from './stock-shared';

// داخل المخزن (كلمة المالك 2026-11-02: «اني شنو افتح سكشن جديد مثلا مواد الاكل، ضمن الاكل راح يندرج هواية مواد»، spec ب-2):
// مواد المخزن مجموعة في أقسام بعنوان التصنيف قابلة للطيّ، وقسم أخير «دون تصنيف»، وكل قسم بعدد مواده ومجموع قيمة المعروض
// لأدوار الكلفة. الصفوف من stock_on_hand نفسها (بصفحاتها و«N من المجموع» من الخادم)، والقيم من stock_values لأدوار الكلفة؛
// والتصنيف لكل مادّة من loadItemCategoryMap (stock_on_hand ما يرجّع التصنيف، عقد 0013). البحث بالاسم المطبَّع، والسطر رابط
// لبطاقة المادّة. بالهاتف بطاقة لا جدول. و«أضف مادّة» لمن يملك item.create (حكم الخادم بـcan_create_item، 0013) بنافذة
// مختصرة ويّا تنبيه التوائم بـfind_item_twins قبل الحفظ مثل المورّدين.

/** قسم تصنيف واحد: معرّفه (فارغ = دون تصنيف) واسمه ومواده. */
export interface Section {
  id: string;
  name: string;
  rows: readonly StockRow[];
}

/**
 * الأقسام بترتيب التصنيفات كما وصلت من الخادم (بالاسم)، و«دون تصنيف» أخيراً، والقسم الفارغ ما ينعرض. البحث بالاسم المطبَّع
 * (نفس searchable المستعمل بالخادم) على اسم المادّة.
 */
export function sectionsOf(rows: readonly StockRow[], categoryOf: ReadonlyMap<string, string | null>, categories: readonly Pick<CategoryRow, 'id' | 'name'>[], search = ''): Section[] {
  const needle = searchable(search);
  const shown = needle ? rows.filter((row) => searchable(row.name).includes(needle)) : rows;
  const byCategory = new Map<string, StockRow[]>();
  for (const row of shown) {
    const key = categoryOf.get(row.itemId) ?? '';
    const list = byCategory.get(key);
    if (list) list.push(row);
    else byCategory.set(key, [row]);
  }
  const out: Section[] = [];
  for (const category of categories) {
    const found = byCategory.get(category.id);
    if (found) out.push({ id: category.id, name: category.name, rows: found });
  }
  // تصنيف ما وصل بقائمة التصنيفات (مؤرشف أو جديد بعد القراءة) ينضمّ لـ«دون تصنيف» بدل ما تختفي مادّته.
  const known = new Set(categories.map((category) => category.id));
  const rest = [...byCategory].filter(([key]) => key === '' || !known.has(key)).flatMap(([, list]) => list);
  if (rest.length) out.push({ id: '', name: t('items.category.none', 'دون تصنيف'), rows: rest });
  return out;
}

/** مجموع قيمة المتاح لمواد القسم المحمّلة؛ null إذا القيم ما وصلت (دور بلا كلفة أو قراءة ناقصة). */
export function sectionValue(rows: readonly StockRow[], values: ReadonlyMap<string, StockValue> | null): Fils | null {
  if (!values) return null;
  let sum = 0n;
  for (const row of rows) {
    const value = values.get(row.itemId);
    if (!value) return null;
    sum += value.available;
  }
  return sum;
}

/** سطر مادّة بالهاتف: بطاقة لا جدول (spec ب-2). */
function ItemCardRow({ row, value, warehouseId, costs }: { row: StockRow; value: StockValue | undefined; warehouseId: string; costs: boolean }) {
  const alert = alerts(row);
  return (
    <Link to={`/inventory/items/${row.itemId}?wh=${warehouseId}`} className="card flex items-center gap-3 p-3" data-action="open-item-card">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{row.name}</span>
        <span className="text-sm text-ink-muted">{fmtQty(row.available, row.baseUnit).main}</span>
        {row.expired > 0n ? <span className="text-sm text-danger-800 dark:text-danger-100">{t('stores.row.expired', 'منتهٍ: {qty}', { qty: fmtQty(row.expired, row.baseUnit).main })}</span> : null}
        {costs && value ? (
          <span className="text-sm text-ink-muted">
            <MoneyText amount={value.available} />
          </span>
        ) : null}
        {alert ? <span className="text-sm text-warn-800 dark:text-warn-200">{alert}</span> : null}
      </span>
      <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-ink-muted ltr:rotate-180" />
    </Link>
  );
}

/** جدول القسم بالحاسوب: المادّة والمتاح بوحدته والمنتهي إن وُجد وقيمة المتاح والتنبيه (عمود لكل وحدة أساس، الوحدة برأسه). */
export function SectionTable({ section, values, warehouseId, costs }: { section: Section; values: ReadonlyMap<string, StockValue> | null; warehouseId: string; costs: boolean }) {
  const rows = section.rows;
  const columns: Column<StockRow>[] = [
    {
      key: 'item',
      header: t('stock.col.item', 'المادّة'),
      sticky: true,
      cell: (row) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/items/${row.itemId}?wh=${warehouseId}`} data-action="open-item-card">
          {row.name}
        </Link>
      ),
    },
    ...qtyColumns(rows, (row) => row.available, (unit) => t('stock.col.available', 'المتاح ({unit})', { unit })),
  ];
  if (rows.some((row) => row.expired > 0n)) columns.push(...qtyColumns(rows, (row) => row.expired, (unit) => t('stock.col.expired', 'منتهي ({unit})', { unit })));
  if (costs) {
    columns.push({
      key: 'value',
      header: t('stock.col.value', 'قيمة المتاح'),
      kind: 'number',
      // قيمة ما انقرت بعد (صفحة قيمها ما وصلت) «—» مو 0.00؛ والمادّة بلا رصيد قيمتها صفر فعلاً (نفس قاعدة اللوحة).
      cell: (row) => {
        const value = values?.get(row.itemId);
        if (value) return <Num>{fmtMoney(value.available)}</Num>;
        return row.available === 0n && row.expired === 0n ? <Num>{fmtMoney(0n)}</Num> : '—';
      },
    });
  }
  columns.push({ key: 'alerts', header: t('stock.col.alerts', 'تنبيه'), wrap: true, cell: (row) => <span className="text-warn-800 dark:text-warn-200">{alerts(row)}</span> });
  return <DataTable caption={t('stores.section.caption', 'مواد قسم {name}', { name: section.name })} columns={columns} rows={rows} rowKey={(row) => row.itemId} empty={t('stock.board.none', 'لا مواد.')} />;
}

/** قسم تصنيف قابل للطيّ: العنوان بعدد مواده ومجموع قيمتها لأدوار الكلفة. */
export function SectionBlock({ section, values, warehouseId, costs }: { section: Section; values: ReadonlyMap<string, StockValue> | null; warehouseId: string; costs: boolean }) {
  const total = costs ? sectionValue(section.rows, values) : null;
  return (
    <details open className="card p-4">
      <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold" data-action="toggle-section">
        <span className="text-base">{section.name}</span>
        <span className="text-sm font-normal text-ink-muted">{t('stores.section.count', '{n} مادّة', { n: fmtInt(section.rows.length) })}</span>
        {total !== null ? (
          <span className="text-sm font-normal text-ink-muted">
            <MoneyText amount={total} />
          </span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-2 pt-4 sm:hidden">
        {section.rows.map((row) => (
          <ItemCardRow key={row.itemId} row={row} value={values?.get(row.itemId)} warehouseId={warehouseId} costs={costs} />
        ))}
      </div>
      <div className="hidden pt-4 sm:block">
        <SectionTable section={section} values={values} warehouseId={warehouseId} costs={costs} />
      </div>
    </details>
  );
}

/** نوع المادّة المقترح من نوع المخزن: المستخدم يقدر يغيّره، والحكم بالقاعدة. */
export function suggestedKind(kind: WarehouseKind | undefined): ItemKind {
  if (kind === 'raw') return 'raw';
  if (kind === 'feed') return 'feed';
  if (kind === 'medicine') return 'medicine';
  if (kind === 'hatching_egg') return 'hatching_egg';
  if (kind === 'chick') return 'chick';
  if (kind === 'table_egg') return 'table_egg';
  return 'other';
}

interface AddItemForm {
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  categoryId: string;
  packLabel: string;
  packFactor: string;
  minQty: string;
}

/** حقول المادّة من النموذج المختصر، أو أخطاء حقولها (نفس قيود القاعدة itemProblems). */
export function addItemFields(form: AddItemForm): { fields: inventory.ItemFields; errors: Partial<Record<'name' | 'minQty' | 'packFactor', string>> } {
  const minQty = form.minQty.trim() ? parseQty(form.minQty) : null;
  const factor = form.packFactor.trim() ? parseFactor(form.packFactor) : null;
  const errors: ReturnType<typeof addItemFields>['errors'] = {};
  const numberError = t('items.number.invalid', 'اكتب رقماً صحيحاً بمراتبه المسموحة.');
  if (form.minQty.trim() && minQty === null) errors.minQty = numberError;
  if (form.packLabel.trim() && factor === null) errors.packFactor = t('stores.pack.factor', 'اكتب كم وحدة أساس في التعبئة، رقماً أكبر من صفر.');
  const step = form.baseUnit === 'pc' ? 1000n : 100n;
  for (const problem of itemProblems({ name: form.name, kind: form.kind, baseUnit: form.baseUnit, density: null, pieceMassKg: null, scaleStep: step, minQty })) {
    if (problem === 'min_qty' || problem === 'pieces_whole') errors.minQty ??= t('constraint.items_min_qty_check', 'الحدّ الأدنى صفر أو أكثر، بثلاث مراتب عشرية كحدّ أقصى.');
    else errors.name ??= t('constraint.items_name_check', 'اسم المادّة مطلوب، ولا يزيد على 120 حرفاً.');
  }
  return {
    fields: {
      name: form.name.trim(),
      category_id: form.categoryId || null,
      kind: form.kind,
      base_unit: form.baseUnit,
      density_kg_per_l: null,
      piece_mass_kg: null,
      tracks_expiry: false,
      scale_step: decimalText(step, 3),
      min_qty: minQty === null ? null : decimalText(minQty, 3),
      barcode: null,
      alt_codes: [],
    },
    errors,
  };
}

/** نافذة «أضف مادّة» المختصرة: الاسم والنوع والتصنيف وكيف تُعدّ، والتعبئة والحدّ الأدنى اختياريان. */
function AddItemDialog({ categories, storeKind, onClose, onSaved }: { categories: readonly CategoryRow[]; storeKind: WarehouseKind | undefined; onClose: () => void; onSaved: (item: inventory.ItemRow) => void }) {
  const id = useId();
  const [form, setForm] = useState<AddItemForm>(() => {
    const kind = suggestedKind(storeKind);
    return { name: '', kind, baseUnit: COUNTED_KINDS.has(kind) ? 'pc' : 'kg', categoryId: '', packLabel: '', packFactor: '', minQty: '' };
  });
  const [errors, setErrors] = useState<ReturnType<typeof addItemFields>['errors']>({});
  const [twins, setTwins] = useState<readonly ItemTwin[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AddItemForm>) => {
    setForm({ ...form, ...patch });
    setTwins(null);
  };
  const { fields, errors: found } = addItemFields(form);
  // التنبيه بالاسم يمرّ بالتأكيد مرّة لنفس الاسم (مثل نافذة المواد): تغيير أيّ حقل يرجّع الفحص.
  const confirmed = twins !== null && twins.length > 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (!confirmed) {
        const same = (await inventory.findItemTwins(fields.name, [])).filter((twin) => twin.sameName);
        if (same.length) {
          setTwins(same);
          return;
        }
      }
      const created = await inventory.createItem(fields);
      const factor = form.packLabel.trim() ? parseFactor(form.packFactor) : null;
      if (factor) {
        // التعبئة صفّ بـitem_units: فشلها لا يلغي المادّة، وتُضاف بعدها من «التعبئة» بصفحة المواد.
        await inventory
          .createItemUnit(created.id, null, { label: form.packLabel.trim().slice(0, 40), factor_to_base: decimalText(toScale(factor, 6), 6), is_default: true, for_purchase: true, for_sale: true, for_recipe: true })
          .catch((caught: unknown) => setFailure(caught));
      }
      onSaved(created);
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const formId = `${id}-form`;
  const failed = failure ? describeError(failure, 'once') : null;
  const counted = COUNTED_KINDS.has(form.kind);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('stores.item.new', 'مادّة جديدة')}
      dirty={form.name.trim() !== '' || form.packLabel.trim() !== '' || form.minQty.trim() !== ''}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} data-action={confirmed ? 'save-new-item-twin' : 'save-new-item'}>
            {confirmed ? t('items.save.twin', 'احفظ رغم التشابه') : t('org.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        <Field id={`${id}-name`} label={t('items.name', 'اسم المادّة')} error={errors.name}>
          <input id={`${id}-name`} className="input" maxLength={120} value={form.name} onChange={(event) => set({ name: event.target.value })} data-autofocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-kind`} label={t('items.kind', 'النوع')}>
            <select
              id={`${id}-kind`}
              className="input"
              value={form.kind}
              onChange={(event) => {
                const kind = event.target.value as ItemKind;
                set(COUNTED_KINDS.has(kind) ? { kind, baseUnit: 'pc' } : { kind });
              }}
            >
              {ITEM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {itemKindLabel(kind)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${id}-category`} label={t('items.category', 'التصنيف')}>
            <select id={`${id}-category`} className="input" value={form.categoryId} onChange={(event) => set({ categoryId: event.target.value })} data-action="pick-category">
              <option value="">{t('items.category.none', 'دون تصنيف')}</option>
              {categories.filter((category) => !category.archived).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('items.base_unit', 'كيف تُعدّ هذه المادّة؟')}</span>
          <Segmented<BaseUnit>
            label={t('items.base_unit', 'كيف تُعدّ هذه المادّة؟')}
            options={(counted ? (['pc'] as const) : BASE_UNITS).map((unit) => ({ value: unit, label: countingLabel(unit) }))}
            value={form.baseUnit}
            onChange={(baseUnit) => set({ baseUnit })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-pack`} label={t('stores.pack.label', 'التعبئة (اختيارية)')} hint={t('stores.pack.hint', 'مثل «كيس» أو «طبقة»، فتظهر الكمية بها.')}>
            <input id={`${id}-pack`} className="input" maxLength={40} value={form.packLabel} onChange={(event) => set({ packLabel: event.target.value })} />
          </Field>
          <Field id={`${id}-factor`} label={t('stores.pack.factor.label', 'كم {unit} في التعبئة؟', { unit: unitName(form.baseUnit, null) })} error={errors.packFactor}>
            <input id={`${id}-factor`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.packFactor} onChange={(event) => set({ packFactor: event.target.value })} />
          </Field>
        </div>
        <Field id={`${id}-min`} label={t('items.min', 'الحدّ الأدنى للتنبيه')} hint={t('items.min.hint', 'بالوحدة التي تُعدّ بها المادّة، للتنبيه فقط.')} error={errors.minQty}>
          <input id={`${id}-min`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.minQty} onChange={(event) => set({ minQty: event.target.value })} />
        </Field>
        {twins?.length ? (
          <Notice tone="warning" title={t('items.twin.names', 'مادّة بالاسم نفسه موجودة')}>
            {t('items.twin.names.detail', 'تشبهها: {names}. احفظ إن كانت مادّة أخرى فعلاً.', { names: twins.map((twin) => (twin.archived ? t('items.archived.name', '{name} (مؤرشفة)', { name: twin.name }) : twin.name)).join(t('list.separator', '، ')) })}
          </Notice>
        ) : null}
        {failed ? (
          <Notice tone="danger" title={failed.title}>
            {failed.detail}
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}

/** جسم الصفحة من صفوفه (دالّة عرض صافية، تنفحص بلا متصفّح). */
export function WarehouseBody({ sections, values, warehouseId, costs, searching }: { sections: readonly Section[]; values: ReadonlyMap<string, StockValue> | null; warehouseId: string; costs: boolean; searching: boolean }) {
  if (sections.length === 0) {
    return <Notice tone="info" title={searching ? t('items.empty', 'لا موادّ بهذا البحث.') : t('stock.board.empty', 'لا رصيد في هذا المخزن.')} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <SectionBlock key={section.id || 'none'} section={section} values={values} warehouseId={warehouseId} costs={costs} />
      ))}
    </div>
  );
}

export default function WarehousePage() {
  const id = useId();
  const { id: warehouseId = '' } = useParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const costs = Boolean(workspace?.canSeeCost);
  const overview = useLoad(inventory.loadStoresOverview);
  const setup = useLoad(inventory.loadOrgSetup);
  const categoryMap = useLoad(inventory.loadItemCategoryMap);
  const loadFirst = useCallback(() => inventory.loadStockOnHand(warehouseId), [warehouseId]);
  const loadValues = useCallback(() => (costs ? inventory.loadStockValues(warehouseId) : Promise.resolve(null)), [warehouseId, costs]);
  const first = useLoad(loadFirst, warehouseId);
  const values = useLoad(loadValues, `${warehouseId}:${costs}`);
  const [pages, setPages] = useState<{ rows: readonly StockRow[]; next: inventory.StockCursor | null; values: ReadonlyMap<string, StockValue> | null }[]>([]);
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<inventory.ItemRow | null>(null);

  const card: StoreCard | undefined = overview.data?.rows.find((row) => row.id === warehouseId);
  const allRows = [...(first.data?.rows ?? []), ...pages.flatMap((page) => page.rows)];
  // مادّة انسمّت بين صفحتين تطلع بالثانية هم: تنعرض مرّة، بأوّل ظهور (نفس قاعدة اللوحة).
  const seen = new Set<string>();
  const rows = allRows.filter((row) => (seen.has(row.itemId) ? false : (seen.add(row.itemId), true)));
  const allValues = values.data ? new Map([...values.data, ...pages.flatMap((page) => (page.values ? [...page.values] : []))]) : null;
  const last = pages.at(-1) ?? (first.data ? { next: first.data.next } : null);
  const next = last?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    Promise.all([inventory.loadStockOnHand(warehouseId, next), costs ? inventory.loadStockValues(warehouseId, next) : Promise.resolve(null)]).then(
      ([board, pageValues]) => {
        setPages((current) => [...current, { rows: board.rows, next: board.next, values: pageValues }]);
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };

  const sections = sectionsOf(rows, categoryMap.data ?? new Map(), setup.data?.itemCategories ?? [], search);
  const title = card?.name ?? first.data?.warehouse.name ?? t('stock.store', 'المخزن');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        subtitle={card ? t('stores.where', '{site} — {division} — {kind}', { site: card.siteName, division: divisionLabel(card.divisionKind), kind: warehouseKindLabel(card.kind) }) : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {overview.data?.canCreateItem ? (
              <Button onClick={() => setAdding(true)} data-action="add-item">
                <Plus aria-hidden="true" className="size-4" />
                {t('stores.item.add', 'أضف مادّة')}
              </Button>
            ) : null}
            <Link to="/inventory" className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="back-to-stores">
              {t('stores.back', 'كل المخازن')}
            </Link>
          </div>
        }
      />
      {added ? (
        <Notice tone="info" title={t('stores.item.added', 'أُضيفت المادّة «{name}»', { name: added.name })}>
          <Link to={`/inventory/items/${added.id}?wh=${warehouseId}`} className="font-medium text-brand-700 dark:text-brand-200" data-action="open-added-item">
            {t('stores.item.added.detail', 'تظهر في قسمها بعد أوّل استلام أو رصيد بداية. افتح بطاقتها.')}
          </Link>
        </Notice>
      ) : null}
      <Field id={`${id}-search`} label={t('stores.search', 'ابحث عن مادّة')}>
        <input id={`${id}-search`} type="search" autoComplete="off" className="input" value={search} onChange={(event) => setSearch(event.target.value)} />
      </Field>
      {card ? <StoreBadges card={card} /> : null}
      {first.error ? (
        <LoadFailed what={t('stock.board.what', 'رصيد المخزن')} error={first.error} onRetry={first.retry} />
      ) : categoryMap.error ? (
        <LoadFailed what={t('stores.categories.what', 'تصنيفات المواد')} error={categoryMap.error} onRetry={categoryMap.retry} />
      ) : !first.data || !categoryMap.data ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          {costs && values.error ? <LoadFailed what={t('stock.values.what', 'قيم المخزون')} error={values.error} onRetry={values.retry} /> : null}
          <WarehouseBody sections={sections} values={costs ? allValues : null} warehouseId={warehouseId} costs={costs} searching={search.trim() !== ''} />
          <PageFooter
            shown={rows.length}
            total={first.data.total}
            next={Boolean(next)}
            busy={more.busy}
            error={more.error}
            what={t('stock.board.what', 'رصيد المخزن')}
            onMore={loadMore}
            action="more-stock"
          />
        </>
      )}
      {adding ? (
        <AddItemDialog
          categories={setup.data?.itemCategories ?? []}
          storeKind={card?.kind}
          onClose={() => setAdding(false)}
          onSaved={(item) => {
            setAdding(false);
            setAdded(item);
            categoryMap.retry();
          }}
        />
      ) : null}
    </div>
  );
}
