import { ChevronLeft, Plus } from 'lucide-react';
import { useCallback, useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { StatStrip } from '../../components/ui/StatStrip';
import type { Fils } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { BASE_UNITS, COUNTED_KINDS, ITEM_KINDS, itemProblems, type ItemKind, type WarehouseKind } from '../../domain/stores';
import { parseFactor, parseQty, type BaseUnit } from '../../domain/units';
import { decimalText, toScale } from '../../domain/decimal';
import { describeError } from '../../lib/errors';
import { fmtInt, fmtMoney, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { CategoryRow, ItemTwin, StockBoardMoney, StockRow, StoreCard } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { useSession } from '../../lib/session';
import { itemKindLabel, warehouseKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { alerts } from './StockBoardPage';
import { StoreBadges } from './StoresCardsPage';
import { countingLabel, PageFooter, qtyColumns, unitName } from './stock-shared';

// داخل المخزن (كلمة المالك 2026-11-02: «اني شنو افتح سكشن جديد مثلا مواد الاكل، ضمن الاكل راح يندرج هواية مواد»، و«اريد
// تسويلي سعر البيع والربح المتوقع»، و«سوي طريقة اضافة المواد داخل المخزن مثل طريقة دكتور فيت»):
// مواد المخزن مجموعة في أقسام بعنوان التصنيف قابلة للطيّ، وقسم أخير «دون تصنيف»، وكل قسم بعدد مواده ومجموع قيمة المعروض
// لأدوار الكلفة. الصفوف والتصنيف والمال كلّها من stock_on_hand (0014): كلّ مادّة فعّالة يستلم المخزن نوعها تظهر ولو برصيد
// صفر — فالمادّة التي تُضاف اليوم تظهر في قسمها اليوم — ومعها قيمة المتاح وسعر البيع وقيمة البيع والربح المتوقّع لأدوار
// الكلفة، ومجاميع المخزن كلّه من الخادم (مو من جمع الصفوف، §2.8). البحث بالاسم المطبَّع، والسطر رابط لبطاقة المادّة. وبالهاتف
// بطاقة لا جدول. و«أضف مادّة» لمن يملك item.create (حكم الخادم بـcan_create_item، 0013) بنموذج بعمودين فيه الاسم والنوع
// والتصنيف وكيف تُعدّ والتعبئة والباركود والحدّ الأدنى وسعر البيع، ويّا تنبيه التوائم بـfind_item_twins قبل الحفظ.

/** قسم تصنيف واحد: معرّفه (فارغ = دون تصنيف) واسمه ومواده. */
export interface Section {
  id: string;
  name: string;
  rows: readonly StockRow[];
}

/**
 * الأقسام بترتيب التصنيفات كما وصلت من الخادم (بالاسم)، و«دون تصنيف» أخيراً، والقسم الفارغ ما ينعرض. البحث بالاسم المطبَّع
 * (نفس searchable المستعمل بالخادم) على اسم المادّة أو باركودها. وتصنيف الصفّ من القراءة نفسها (0014).
 */
export function sectionsOf(rows: readonly StockRow[], categories: readonly Pick<CategoryRow, 'id' | 'name'>[], search = ''): Section[] {
  const needle = searchable(search);
  const code = search.trim().toUpperCase();
  const shown = needle ? rows.filter((row) => searchable(row.name).includes(needle) || (row.barcode !== null && row.barcode.toUpperCase().includes(code))) : rows;
  const byCategory = new Map<string, StockRow[]>();
  for (const row of shown) {
    const key = row.categoryId ?? '';
    const list = byCategory.get(key);
    if (list) list.push(row);
    else byCategory.set(key, [row]);
  }
  const out: Section[] = [];
  for (const category of categories) {
    const found = byCategory.get(category.id);
    if (found) out.push({ id: category.id, name: category.name, rows: found });
  }
  // تصنيف ما وصل بقائمة التصنيفات (مؤرشف أو جديد بعد القراءة) ينضمّ لقسم باسمه كما وصل مع الصفّ، وإلّا «دون تصنيف».
  const known = new Set(categories.map((category) => category.id));
  const rest = [...byCategory].filter(([key]) => !known.has(key));
  for (const [key, list] of rest) {
    const name = key === '' ? t('items.category.none', 'دون تصنيف') : (list[0]?.categoryName ?? t('items.category.none', 'دون تصنيف'));
    const last = out.at(-1);
    if (key === '' || !list[0]?.categoryName) {
      if (last && last.id === '') last.rows = [...last.rows, ...list];
      else out.push({ id: '', name: t('items.category.none', 'دون تصنيف'), rows: list });
    } else out.push({ id: key, name, rows: list });
  }
  // «دون تصنيف» أخيراً دائماً.
  const none = out.findIndex((section) => section.id === '');
  if (none >= 0 && none !== out.length - 1) out.push(...out.splice(none, 1));
  return out;
}

/** مجموع قيمة المتاح لمواد القسم المحمّلة؛ null إذا المال ما وصل (دور بلا كلفة). */
export function sectionValue(rows: readonly StockRow[]): Fils | null {
  let sum = 0n;
  for (const row of rows) {
    if (!row.money) return null;
    sum += row.money.stockValue;
  }
  return rows.length ? sum : null;
}

/** سطر مادّة بالهاتف: بطاقة لا جدول. */
function ItemCardRow({ row, warehouseId, costs }: { row: StockRow; warehouseId: string; costs: boolean }) {
  const alert = alerts(row);
  const sell = row.money?.sellPrice ?? null;
  return (
    <Link to={`/inventory/items/${row.itemId}?wh=${warehouseId}`} className="card flex items-center gap-3 p-3" data-action="open-item-card">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{row.name}</span>
        <span className="text-sm text-ink-muted">{fmtQty(row.available, row.baseUnit).main}</span>
        {row.expired > 0n ? <span className="text-sm text-danger-800 dark:text-danger-100">{t('stores.row.expired', 'منتهٍ: {qty}', { qty: fmtQty(row.expired, row.baseUnit).main })}</span> : null}
        {costs && row.money ? (
          <span className="text-sm text-ink-muted">
            {t('stock.col.value', 'قيمة المتاح')}: <MoneyText amount={row.money.stockValue} />
          </span>
        ) : null}
        {costs && sell !== null ? (
          <span className="text-sm text-ink-muted">
            {t('items.sell_price', 'سعر البيع')}: <MoneyText amount={sell} />
          </span>
        ) : null}
        {alert ? <span className="text-sm text-warn-800 dark:text-warn-200">{alert}</span> : null}
      </span>
      <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-ink-muted ltr:rotate-180" />
    </Link>
  );
}

/** جدول القسم بالحاسوب: المادّة والمتاح والمنتهي وسعر البيع وقيمة المتاح وقيمة البيع والتنبيه. */
export function SectionTable({ section, warehouseId, costs }: { section: Section; warehouseId: string; costs: boolean }) {
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
    columns.push(
      {
        key: 'value',
        header: t('stock.col.value', 'قيمة المتاح'),
        kind: 'number',
        // المال كلّه من الخادم: صفّ بلا money (دور بلا كلفة) «—»، والمادّة بلا رصيد قيمتها صفر فعلاً.
        cell: (row) => (row.money ? <Num>{fmtMoney(row.money.stockValue)}</Num> : '—'),
      },
      {
        key: 'sell_price',
        header: t('items.sell_price', 'سعر البيع'),
        kind: 'number',
        cell: (row) => {
          const sell = row.money?.sellPrice ?? null;
          return sell === null ? <span className="text-xs text-ink-muted">{t('items.sell_price.none', 'بلا سعر')}</span> : <Num>{fmtMoney(sell)}</Num>;
        },
      },
      {
        key: 'sale_value',
        header: t('stock.col.sale_value', 'قيمة البيع'),
        kind: 'number',
        cell: (row) => {
          const sale = row.money?.saleValue ?? null;
          return sale === null ? '—' : <Num>{fmtMoney(sale)}</Num>;
        },
      },
    );
  }
  columns.push({ key: 'alerts', header: t('stock.col.alerts', 'تنبيه'), wrap: true, cell: (row) => <span className="text-warn-800 dark:text-warn-200">{alerts(row)}</span> });
  return <DataTable caption={t('stores.section.caption', 'مواد قسم {name}', { name: section.name })} columns={columns} rows={rows} rowKey={(row) => row.itemId} empty={t('stock.board.none', 'لا مواد.')} />;
}

/** قسم تصنيف قابل للطيّ: العنوان بعدد مواده ومجموع قيمتها لأدوار الكلفة. */
export function SectionBlock({ section, warehouseId, costs }: { section: Section; warehouseId: string; costs: boolean }) {
  const total = costs ? sectionValue(section.rows) : null;
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
          <ItemCardRow key={row.itemId} row={row} warehouseId={warehouseId} costs={costs} />
        ))}
      </div>
      <div className="hidden pt-4 sm:block">
        <SectionTable section={section} warehouseId={warehouseId} costs={costs} />
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
  barcode: string;
  sellPrice: string;
}

/** حقول المادّة من النموذج، أو أخطاء حقولها (نفس قيود القاعدة itemProblems). */
export function addItemFields(form: AddItemForm): { fields: inventory.ItemFields; sellPrice: Fils | null; errors: Partial<Record<'name' | 'minQty' | 'packFactor' | 'barcode' | 'sellPrice', string>> } {
  const minQty = form.minQty.trim() ? parseQty(form.minQty) : null;
  const factor = form.packFactor.trim() ? parseFactor(form.packFactor) : null;
  const sellPrice = form.sellPrice.trim() ? parseMoneyText(form.sellPrice, false) : null;
  const errors: ReturnType<typeof addItemFields>['errors'] = {};
  const numberError = t('items.number.invalid', 'اكتب رقماً صحيحاً بمراتبه المسموحة.');
  if (form.minQty.trim() && minQty === null) errors.minQty = numberError;
  if (form.packLabel.trim() && factor === null) errors.packFactor = t('stores.pack.factor', 'اكتب كم وحدة أساس في التعبئة، رقماً أكبر من صفر.');
  if (form.barcode.trim().length > 64) errors.barcode = t('constraint.items_barcode_check', 'الباركود لا يزيد على 64 حرفاً.');
  if (form.sellPrice.trim() && (sellPrice === null || sellPrice <= 0n)) errors.sellPrice = t('items.sell_price.invalid', 'اكتب سعر البيع بالدينار، رقماً أكبر من صفر.');
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
      barcode: form.barcode.trim() || null,
      alt_codes: [],
    },
    sellPrice: errors.sellPrice ? null : sellPrice,
    errors,
  };
}

/**
 * نافذة «أضف مادّة» بأسلوب دكتور فيت: حقول مرتّبة بعمودين — الاسم، والنوع والتصنيف، وكيف تُعدّ، والتعبئة ومعاملها،
 * والباركود والحدّ الأدنى، وسعر البيع لأدوار الكلفة. سعر البيع يُكتب بعد المادّة بدالّته (set_item_sell_price): فشله لا
 * يُلغي المادّة، ويُكتب بعدها من بطاقتها.
 */
function AddItemDialog({
  categories,
  storeKind,
  costs,
  onClose,
  onSaved,
}: {
  categories: readonly CategoryRow[];
  storeKind: WarehouseKind | undefined;
  costs: boolean;
  onClose: () => void;
  onSaved: (item: inventory.ItemRow) => void;
}) {
  const id = useId();
  const [form, setForm] = useState<AddItemForm>(() => {
    const kind = suggestedKind(storeKind);
    return { name: '', kind, baseUnit: COUNTED_KINDS.has(kind) ? 'pc' : 'kg', categoryId: '', packLabel: '', packFactor: '', minQty: '', barcode: '', sellPrice: '' };
  });
  const [errors, setErrors] = useState<ReturnType<typeof addItemFields>['errors']>({});
  const [twins, setTwins] = useState<readonly ItemTwin[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AddItemForm>) => {
    setForm({ ...form, ...patch });
    setTwins(null);
  };
  const { fields, sellPrice, errors: found } = addItemFields(form);
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
        const same = (await inventory.findItemTwins(fields.name, fields.barcode ? [fields.barcode] : [])).filter((twin) => twin.sameName || twin.codes.length > 0);
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
      if (sellPrice !== null) await inventory.setItemSellPrice(created.id, sellPrice, null).catch((caught: unknown) => setFailure(caught));
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
      dirty={form.name.trim() !== '' || form.packLabel.trim() !== '' || form.minQty.trim() !== '' || form.barcode.trim() !== '' || form.sellPrice.trim() !== ''}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-min`} label={t('items.min', 'الحدّ الأدنى للتنبيه')} hint={t('items.min.hint', 'بالوحدة التي تُعدّ بها المادّة، للتنبيه فقط.')} error={errors.minQty}>
            <input id={`${id}-min`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.minQty} onChange={(event) => set({ minQty: event.target.value })} />
          </Field>
          <Field id={`${id}-barcode`} label={t('items.barcode.optional', 'الباركود (اختياري)')} hint={t('items.barcode.hint', 'كما على العبوة، فتُبحث المادّة به.')} error={errors.barcode}>
            <input id={`${id}-barcode`} dir="ltr" className="input" maxLength={64} value={form.barcode} onChange={(event) => set({ barcode: event.target.value })} />
          </Field>
        </div>
        {costs ? (
          <MoneyInput
            id={`${id}-sell`}
            label={t('items.sell_price.for', 'سعر البيع لكل {unit} (اختياري)', { unit: unitName(form.baseUnit, null) })}
            hint={t('items.sell_price.hint', 'منه تُحسب قيمة البيع والربح المتوقّع. يُغيَّر وقت ما تريد من بطاقة المادّة.')}
            error={errors.sellPrice}
            whole={false}
            value={form.sellPrice}
            onChange={(value) => set({ sellPrice: value })}
          />
        ) : null}
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

/** شريط أرقام المخزن من مجاميع الخادم (0014): المواد، ورأس المال، وقيمة البيع، والربح المتوقّع. */
export function WarehouseStats({ items, money }: { items: number | null; money: StockBoardMoney | null }) {
  const stats = [
    ...(items === null ? [] : [{ key: 'items', label: t('stores.items_count', 'المواد'), value: fmtInt(items) }]),
    ...(money
      ? [
          { key: 'capital', label: t('stores.capital', 'رأس المال'), value: <MoneyText amount={money.stockValue} /> },
          { key: 'sale', label: t('stock.col.sale_value', 'قيمة البيع'), value: <MoneyText amount={money.saleValue} /> },
          { key: 'profit', label: t('stores.profit', 'الربح المتوقّع'), value: <MoneyText amount={money.expectedProfit} /> },
        ]
      : []),
  ];
  if (!stats.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <StatStrip stats={stats} />
      {money && money.itemsUnpriced > 0 ? (
        <p className="text-xs text-ink-muted">{t('stores.unpriced', 'قيمة البيع والربح المتوقّع لا تشملان {n} لم يُكتب لها سعر بيع.', { n: t('stores.unpriced.items', '{n} مادّة', { n: fmtInt(money.itemsUnpriced) }) })}</p>
      ) : null}
    </div>
  );
}

/** جسم الصفحة من صفوفه (دالّة عرض صافية، تنفحص بلا متصفّح). */
export function WarehouseBody({ sections, warehouseId, costs, searching }: { sections: readonly Section[]; warehouseId: string; costs: boolean; searching: boolean }) {
  if (sections.length === 0) {
    return <Notice tone="info" title={searching ? t('items.empty', 'لا موادّ بهذا البحث.') : t('stores.items.empty', 'لا مواد في هذا المخزن بعد.')} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <SectionBlock key={section.id || 'none'} section={section} warehouseId={warehouseId} costs={costs} />
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
  const loadFirst = useCallback(() => inventory.loadStockOnHand(warehouseId), [warehouseId]);
  const first = useLoad(loadFirst, warehouseId);
  const [pages, setPages] = useState<{ rows: readonly StockRow[]; next: inventory.StockCursor | null }[]>([]);
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<inventory.ItemRow | null>(null);

  const card: StoreCard | undefined = overview.data?.rows.find((row) => row.id === warehouseId);
  const allRows = [...(first.data?.rows ?? []), ...pages.flatMap((page) => page.rows)];
  // مادّة انسمّت بين صفحتين تطلع بالثانية هم: تنعرض مرّة، بأوّل ظهور (نفس قاعدة اللوحة).
  const seen = new Set<string>();
  const rows = allRows.filter((row) => (seen.has(row.itemId) ? false : (seen.add(row.itemId), true)));
  const last = pages.at(-1) ?? (first.data ? { next: first.data.next } : null);
  const next = last?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    inventory.loadStockOnHand(warehouseId, next).then(
      (board) => {
        setPages((current) => [...current, { rows: board.rows, next: board.next }]);
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };

  const sections = sectionsOf(rows, setup.data?.itemCategories ?? [], search);
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
            {t('stores.item.added.detail', 'تظهر في قسمها الآن برصيد صفر. افتح بطاقتها.')}
          </Link>
        </Notice>
      ) : null}
      {first.data ? <WarehouseStats items={first.data.total} money={costs ? first.data.money : null} /> : null}
      <Field id={`${id}-search`} label={t('stores.search', 'ابحث عن مادّة')}>
        <input id={`${id}-search`} type="search" autoComplete="off" className="input" value={search} onChange={(event) => setSearch(event.target.value)} />
      </Field>
      {card ? <StoreBadges card={card} /> : null}
      {first.error ? (
        <LoadFailed what={t('stock.board.what', 'رصيد المخزن')} error={first.error} onRetry={first.retry} />
      ) : !first.data ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <WarehouseBody sections={sections} warehouseId={warehouseId} costs={costs} searching={search.trim() !== ''} />
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
          costs={costs}
          onClose={() => setAdding(false)}
          onSaved={(item) => {
            setAdding(false);
            setAdded(item);
            first.retry();
          }}
        />
      ) : null}
    </div>
  );
}
