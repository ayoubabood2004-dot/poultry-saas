import { useCallback, useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { DayField, postingDay } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { localDay, type Day } from '../../domain/dates';
import { decimalText } from '../../domain/decimal';
import { FILS_PER_DINAR, MILLI_PER_UNIT, type Fils, type Milli } from '../../domain/money';
import { normalizeCode, searchable, toWesternDigits } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { BASE_FACTOR, baseQtyOf, convertUnitPrice, invoiceMath, unitPriceOf } from '../../domain/saleInvoice';
import type { WarehouseKind } from '../../domain/stores';
import { parseQty } from '../../domain/units';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { useDirtyForm } from '../../lib/pwa/dirty';
import * as inventory from '../../lib/repo/inventory';
import type { StoreCard, StoresOverview } from '../../lib/repo/inventory';
import * as purchasing from '../../lib/repo/purchasing';
import type { PartyPick } from '../../lib/repo/purchasing';
import {
  loadSaleCatalog,
  readSalePending,
  recordSaleV2,
  salePendingKey,
  storeSalePending,
  type CatalogItem,
  type CatalogUnit,
  type PendingSale,
  type RecordedInvoice,
  type SaleCatalog,
  type SaleRequest,
} from '../../lib/repo/sales';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { BoxPicker, SupplierPicker } from '../inventory/purchase-shared';
import { baseQty } from '../inventory/simple-shared';
import { checkoutBack, checkoutBackLabel, dinars, inputMoney, linesText, moneyText, unitQtyText } from './saleParts';

// «فاتورة بيع جديدة» (/sales/new، عقد 0033 «ب»؛ أجوبة المالك 2026-11-17: الخصم لكلّ من يبيع، والدفع الآن من صندوق أو أكثر والباقي دين، والزبون النقديّ بلا
// اسم للنقد الكامل، ولا طابعة): المخزن أوّلاً، ثمّ الموادّ بالبحث بالاسم وخانة الباركود (الماسح يكتب كالكيبورد وEnter يضيف)، والسلّة بسطورها (الوحدة والكمية
// والسعر لوحدته والخصم والصافي، وتحذير بالمتاح)، وخصم الفاتورة، والزبون (بحث، «جهة جديدة»، أو «زبون نقديّ»)، والدفع الآن بسيقان والدين حيّاً، والملاحظة
// والتاريخ؛ والمجموع ثابت أسفل الشاشة بزرّ واحد يسمّي النتيجة. المعاينة مرآة الخادم (domain/saleInvoice) والخادم يقرّر (record_sale_v2).
// قبل الحفظ تُقرأ أسعار البيع والمتاح من جديد، وما تغيّر من سعر اقترحه النظام يُعرض ويُقرّ (المهارة 11)؛ والطلب يُحفظ خارج المكوّن قبل أن يخرج (sessionStorage
// بمفتاح المستخدم والمنشأة، والذاكرة إن تعذّر)، فالنتيجة المجهولة أو الرجوع والعودة أو إعادة التحميل تعيد الشاشة مجمَّدة به و«أعد المحاولة» ترسله حرفاً،
// والرفض الأكيد يعيد ما أُرسل إلى الخانات بمرجع جديد (ومعرّفات جديدة بعد id_conflict). ولا تدخل الطابور بلا نت (المهارة 13). في حزمة المخزون الكسولة
// (خارج التثبيت المسبق)، والتخطيط الثابت بقواعد <style> بلا أصناف Tailwind جديدة.

/** مخازن يُباع منها في هذه المرحلة: الأوّلية والعلف والأدوية والعامّة (البيض والأفراخ لاحقاً، not_sellable). */
const SELLING_KINDS: readonly WarehouseKind[] = ['raw', 'feed', 'medicine', 'general'];
const MAX_LINES = 100;
const MAX_LEGS = 5;
const NOTE_MAX = 500;

/**
 * رفوض تعني أنّ ما قرأته الشاشة تغيّر (المتاح أو الوحدات أو المادّة أو مخزنها): تُقرأ الموادّ من جديد ويبقى ما كُتب. الرموز كما يرفعها record_sale_v2
 * (supabase/migrations/0033_sales_invoice.sql، مراجعة 0033 C11).
 */
const REREAD = new Set(['insufficient_stock', 'not_sellable', 'unit_mismatch', 'unit_changed', 'item_archived', 'item_not_found', 'item_kind_mismatch', 'out_of_scope']);
/** صندوق أُرشف أو حُذف بعد قراءته: تُقرأ الصناديق من جديد (مع الموادّ للأمين، أو من جدولها). */
const REREAD_BOXES = new Set(['cash_account_archived', 'cash_account_not_found']);
/** قيمة خيار «اختر الوحدة» حين غابت وحدة السطر من وحدات المادّة (لا تصادف معرّف وحدة). */
const UNIT_GONE = '-';
/** ملاحظات لا تُعدّ خطأ خانة عند البحث عن أوّل خطأ بعد «احفظ»: الملخّص نفسه وملاحظة الماسح. */
const NOT_FIELD_ERRORS = new Set(['sale-blocked', 'sale-scan-note']);

/** المجموع الثابت أسفل الشاشة: فوق الشريط السفليّ في الهاتف (h-16)، وقرب الحافّة في الحاسوب. */
// وزرّ الحفظ يطول بسطوره ولا يُقصّ (مراجعة 0033 C2: بخطّ 125٪ وعرض 360 كان النصّ ثلاثة أسطر في ارتفاع ثابت فاختفى أوّلها ودينها)، وملخّص ما يمنع
// الحفظ في سطر وحده فوق المجاميع (C4).
const CHECKOUT_STYLE = [
  '[data-action="sale-totals-bar"] { position: sticky; bottom: calc(4.5rem + env(safe-area-inset-bottom)); z-index: 20; }',
  '@media (min-width: 768px) { [data-action="sale-totals-bar"] { bottom: 0.75rem; } }',
  '@media (min-width: 640px) { [data-action="sale-totals-bar"] { flex-wrap: wrap; } }',
  '[data-action="sale-blocked"] { flex-basis: 100%; }',
  '[data-action="save-invoice"] { height: auto; min-height: 3.25rem; padding: 0.5rem 1rem; white-space: normal; line-height: 1.4; text-align: center; }',
].join(' ');

interface CartLine {
  lineId: string;
  itemId: string;
  /** اسم المادّة لحظة إضافتها (يُعرض إن غابت من الموادّ بعد قراءة جديدة). */
  name: string;
  /** null = وحدة الأساس. */
  unitId: string | null;
  qty: string;
  price: string;
  /** سعر البيع لوحدة الأساس الذي اقتُرح منه السعر، أو null حين كتبه البائع (أو لا سعر): ما يُقارن قبل الحفظ. */
  suggestedFrom: Fils | null;
  discount: string;
}

interface Leg {
  legId: string;
  boxId: string;
  amount: string;
}

type Mode = 'party' | 'walk_in';

interface Draft {
  /** '' = الافتراضيّ (المخزن من الرابط أو الوحيد). */
  warehouseId: string;
  lines: CartLine[];
  invoiceDiscount: string;
  mode: Mode;
  party: PartyPick | null;
  legs: Leg[];
  note: string;
  /** null = يوم الخادم. */
  day: string | null;
}

const EMPTY: Draft = { warehouseId: '', lines: [], invoiceDiscount: '', mode: 'party', party: null, legs: [], note: '', day: null };

/** وحدات المادّة للسطر: الأساس أوّلاً ثمّ وحدات البيع من الخادم. */
export function unitsOf(item: Pick<CatalogItem, 'baseUnit' | 'units'>): CatalogUnit[] {
  return [{ unitId: null, label: baseUnitLabel(item.baseUnit), factor: BASE_FACTOR }, ...item.units.filter((unit) => unit.unitId !== null)];
}

/** السطر الجديد لمادّة: الوحدة الأساس، والسعر من سعر البيع إن وُجد. */
function newLine(item: CatalogItem, qty = ''): CartLine {
  return {
    lineId: crypto.randomUUID(),
    itemId: item.id,
    name: item.name,
    unitId: null,
    qty,
    price: item.sellPrice === null ? '' : inputMoney(item.sellPrice),
    suggestedFrom: item.sellPrice,
    discount: '',
  };
}

/** لم يُحفظ شيء أكيداً: رفض الخادم، أو لم يخرج الطلب أو لم يصل، أو تزاحم فرجع، أو لا قاعدة ولا جلسة. وغيرها نتيجة مجهولة: ربّما حُفظت الفاتورة. */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

/** الطلب المرسَل إلى خانات النموذج (بعد رفض أكيد لطلب استُعيد من التخزين): ما أُرسل يعود كما كُتب. */
function draftOf(pending: PendingSale): Draft {
  const { request, summary } = pending;
  return {
    warehouseId: request.warehouseId,
    lines: request.lines.map((line, index) => ({
      lineId: line.lineId,
      itemId: line.itemId,
      name: summary.lines[index]?.name ?? '',
      unitId: line.unitId,
      qty: decimalText(line.qty, 3).replace(/\.?0+$/u, ''),
      price: inputMoney(line.unitPrice),
      suggestedFrom: null,
      discount: line.discount > 0n ? inputMoney(line.discount) : '',
    })),
    invoiceDiscount: request.invoiceDiscount > 0n ? inputMoney(request.invoiceDiscount) : '',
    mode: request.partyId === null ? 'walk_in' : 'party',
    party: request.partyId === null ? null : { id: request.partyId, name: summary.partyName ?? '' },
    legs: request.payments.map((leg) => ({ legId: leg.legId, boxId: leg.cashAccountId, amount: inputMoney(leg.amount) })),
    note: request.note ?? '',
    day: fmtDay(request.soldOn),
  };
}

/** «المرسَل: …» لطلب لم يُعرف جوابه: المخزن والزبون والسطور والصافي والمدفوع والدين كما رآها البائع. */
export function sentText(pending: PendingSale): string {
  const { summary } = pending;
  const items = summary.lines.map((line) => t('invoice.sent.line', '{name} {qty}', { name: line.name, qty: line.qty })).join(t('list.separator', '، '));
  const vars = { store: summary.warehouseName, party: summary.partyName ?? '', items, total: dinars(summary.total), paid: dinars(summary.paid), debt: dinars(summary.total - summary.paid) };
  if (summary.partyName === null) return t('invoice.sent.walk_in', 'فاتورة من «{store}» لزبون نقديّ: {items} — الصافي {total} مدفوع كلّه.', vars);
  if (summary.paid === 0n) return t('invoice.sent.credit', 'فاتورة من «{store}» لـ«{party}»: {items} — الصافي {total} بالدين كلّه.', vars);
  return t('invoice.sent.partial', 'فاتورة من «{store}» لـ«{party}»: {items} — الصافي {total}، المدفوع الآن {paid}، والباقي دين {debt}.', vars);
}

/** جملة «حُفظت الفاتورة» من جواب الخادم نفسه. */
export function doneText(saved: RecordedInvoice): string {
  const vars = { doc: saved.docNo, total: dinars(saved.total), paid: dinars(saved.paid), debt: dinars(saved.debt) };
  if (saved.debt === 0n) return t('invoice.done.paid', 'حُفظت الفاتورة {doc}: {total} مدفوعة كلّها.', vars);
  if (saved.paid === 0n) return t('invoice.done.credit', 'حُفظت الفاتورة {doc}: {total} بالدين كلّه.', vars);
  return t('invoice.done.partial', 'حُفظت الفاتورة {doc}: {total}، المدفوع {paid}، والباقي دين {debt}.', vars);
}

/**
 * الزرّ الواحد يسمّي النتيجة: «احفظ الفاتورة — 125,000 دينار، منها 50,000 دين» (عدد الموادّ في عنوان السطور: بخطّ 125٪ وعرض 360 كان الزرّ ثلاثة أسطر،
 * مراجعة 0033 C2؛ بلاه سطران في كلّ قياس). ولا يقول ما ليس صحيحاً والفاتورة لا تُحفظ (C8): سطر ناقص ← عدد الموادّ وحده؛ ومال لا يستقيم (خصم أكبر،
 * أو مدفوع أكثر من الصافي، أو نقديّ لم يدفع) ← الصافي بلا «مدفوعة» ولا «دين»؛ و«مدفوعة كلّها» حين المدفوع = الصافي > 0 وحده.
 */
export function saveLabel(lines: number, total: Fils, paid: Fils, state: 'ok' | 'lines' | 'money' = 'ok'): string {
  if (lines === 0) return t('invoice.save.empty', 'احفظ الفاتورة');
  const vars = { lines: linesText(lines), total: moneyText(total), debt: moneyText(total - paid) };
  if (state === 'lines' || total < 0n) return t('invoice.save.lines', 'احفظ الفاتورة — {lines}', vars);
  if (state === 'money' || paid > total) return t('invoice.save.unsettled', 'احفظ الفاتورة — {total} دينار', vars);
  if (total === 0n) return t('invoice.save.free', 'احفظ الفاتورة — {lines} بلا مقابل', vars);
  if (paid === total) return t('invoice.save.paid', 'احفظ الفاتورة — {total} دينار مدفوعة كلّها', vars);
  if (paid === 0n) return t('invoice.save.credit', 'احفظ الفاتورة — {total} دينار بالدين كلّه', vars);
  return t('invoice.save.partial', 'احفظ الفاتورة — {total} دينار، منها {debt} دين', vars);
}

/** رموز المادّة التي يقرؤها الماسح والبحث: الباركود والرموز الأخرى (alt_codes)، مطبَّعة (مراجعة 0033 C5/C6). */
const codesOf = (item: Pick<CatalogItem, 'barcode' | 'altCodes'>): string[] => [item.barcode, ...item.altCodes].flatMap((code) => (code ? [normalizeCode(code)] : []));

/** أوّل خطأ خانة في الفاتورة بترتيب الصفحة (<p role="alert">): يُمرَّر إليه وتُركَّز خانته إن كانت له (مراجعة 0033 C4). */
function focusFirstError(root: HTMLElement): void {
  const walk = (node: Element): Element | null => {
    for (const child of Array.from(node.children)) {
      if (child.tagName === 'P' && child.getAttribute('role') === 'alert' && !NOT_FIELD_ERRORS.has(child.getAttribute('data-action') ?? '')) return child;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  const alert = walk(root);
  if (!alert) return;
  if (typeof alert.scrollIntoView === 'function') alert.scrollIntoView({ block: 'center' });
  const control = Array.from(alert.parentElement?.children ?? []).find((node) => node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA');
  if (control instanceof HTMLElement) control.focus({ preventScroll: true });
}

type LineField = 'item' | 'unit' | 'qty' | 'price' | 'discount';

interface ParsedLine {
  line: CartLine;
  item: CatalogItem | null;
  unit: CatalogUnit | null;
  qty: Milli | null;
  price: Fils | null;
  discount: Fils | null;
  /** بوحدة الأساس، أو null. */
  base: Milli | null;
  errors: Partial<Record<LineField, string>>;
}

/** يقرأ سطور السلّة على الموادّ المعروضة (المتاح لكلّ مادّة بعد جمع سطورها، الخادم يفعل مثله: insufficient_stock). */
export function parseLines(lines: readonly CartLine[], catalog: SaleCatalog | null, storeName: string): ParsedLine[] {
  const byId = new Map((catalog?.items ?? []).map((item) => [item.id, item]));
  const parsed: ParsedLine[] = lines.map((line) => {
    const item = byId.get(line.itemId) ?? null;
    const errors: ParsedLine['errors'] = {};
    const unit = item ? (unitsOf(item).find((option) => option.unitId === line.unitId) ?? null) : null;
    const label = unit?.label ?? '';
    if (catalog && !item) errors.item = t('invoice.line.gone', 'لم تعد «{name}» تُباع من «{store}»؛ احذفها من الفاتورة.', { name: line.name, store: storeName });
    else if (item && !unit) errors.unit = t('invoice.line.unit', 'اختر الوحدة.');
    const qty = line.qty.trim() ? parseQty(line.qty) : null;
    let base: Milli | null = null;
    if (qty === null || qty <= 0n) errors.qty = t('invoice.line.qty', 'اكتب الكمية رقماً أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.');
    else if (unit) {
      base = baseQtyOf(qty, unit.factor);
      if (item?.baseUnit === 'pc' && base % MILLI_PER_UNIT !== 0n) errors.qty = t('purchase.qty.whole', 'القطع تُعدّ عدداً صحيحاً.');
    }
    const price = line.price.trim() ? parseMoneyText(line.price, false) : null;
    if (price === null || price < 0n) errors.price = t('invoice.line.price', 'اكتب السعر لكل {unit} بالدينار (صفر للتسليم بلا مقابل).', { unit: label });
    const discount = line.discount.trim() ? parseMoneyText(line.discount, true) : 0n;
    if (discount === null || discount < 0n) errors.discount = t('invoice.line.discount', 'الخصم بالدينار الصحيح من صفر فأكثر.');
    return { line, item, unit, qty: errors.qty ? null : qty, price: errors.price ? null : price, discount: errors.discount ? null : discount, base: errors.qty ? null : base, errors };
  });
  // المتاح لكلّ مادّة بعد جمع سطورها.
  const used = new Map<string, Milli>();
  for (const row of parsed) if (row.base !== null) used.set(row.line.itemId, (used.get(row.line.itemId) ?? 0n) + row.base);
  for (const row of parsed) {
    if (!row.item || row.base === null || row.errors.qty) continue;
    if ((used.get(row.item.id) ?? 0n) > row.item.available) {
      row.errors.qty = t('invoice.line.over', 'المتاح في «{store}» {qty} فقط؛ لا يُحفظ أكثر منه.', { store: storeName, qty: baseQty(row.item.available, row.item.baseUnit) });
    }
  }
  return parsed;
}

/** موادّ المخزن القابلة للبيع (لا شيء قبل اختيار المخزن). */
function useCatalog(warehouseId: string) {
  const load = useCallback(() => (warehouseId ? loadSaleCatalog(warehouseId) : Promise.resolve(null)), [warehouseId]);
  return useLoad(load, warehouseId);
}

/** الصناديق من جدولها حين لا يرسلها الخادم مع الموادّ. */
function useBoxes(wanted: boolean) {
  const load = useCallback(() => (wanted ? purchasing.listBoxes() : Promise.resolve(null)), [wanted]);
  return useLoad(load, `${wanted}`);
}

/** المخازن التي يُباع منها في النطاق. */
const sellingStores = (overview: StoresOverview | null): StoreCard[] => (overview?.rows ?? []).filter((row) => SELLING_KINDS.includes(row.kind));

/** المخزن الافتراضيّ قبل أن يختار البائع: المخزن من الرابط إن كان منها، أو الوحيد، وإلّا لا شيء. */
function defaultStore(rows: readonly StoreCard[], fromLink: string | null): string {
  if (fromLink !== null && rows.some((row) => row.id === fromLink)) return fromLink;
  return rows.length === 1 && rows[0] ? rows[0].id : '';
}

/** سطر في ملخّص الفاتورة (جدول المعاينة). */
interface PreviewRow {
  key: string;
  name: string;
  qty: Milli;
  unit: string;
  price: Fils;
  gross: Fils;
  lineDiscount: Fils;
  share: Fils;
  net: Fils;
}

function PreviewTable({ rows, totals }: { rows: readonly PreviewRow[]; totals: { gross: Fils; lineDiscounts: Fils; shares: Fils; total: Fils } }) {
  const qtyDecimals = columnDecimals(rows.map((row) => row.qty), 3) as 0 | 1 | 2 | 3;
  const priceDecimals = rows.some((row) => row.price % FILS_PER_DINAR !== 0n) ? 2 : 0;
  const money0 = (amount: Fils) => <Num>{fmtMoney(amount, 0)}</Num>;
  const columns: Column<PreviewRow>[] = [
    { key: 'item', header: t('sales.col.item', 'المادّة'), wrap: true, cell: (row) => row.name },
    { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.qty, qtyDecimals)}</Num> },
    { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (row) => row.unit },
    { key: 'price', header: t('sales.col.price', 'السعر'), kind: 'number', cell: (row) => <Num>{fmtMoney(row.price, priceDecimals)}</Num> },
    { key: 'gross', header: t('invoice.col.gross', 'الإجمالي'), kind: 'number', cell: (row) => money0(row.gross), total: money0(totals.gross) },
    { key: 'line_discount', header: t('invoice.col.line_discount', 'خصم السطر'), kind: 'number', cell: (row) => money0(row.lineDiscount), total: money0(totals.lineDiscounts) },
    { key: 'share', header: t('invoice.col.share', 'من خصم الفاتورة'), kind: 'number', cell: (row) => money0(row.share), total: money0(totals.shares) },
    { key: 'net', header: t('invoice.col.net', 'الصافي'), kind: 'number', cell: (row) => money0(row.net), total: money0(totals.total) },
  ];
  return <DataTable caption={t('invoice.preview.caption', 'ملخّص الفاتورة قبل الحفظ')} columns={columns} rows={rows} rowKey={(row) => row.key} empty="" totalLabel={t('sales.report.total', 'المجموع')} />;
}

/** تغيّر سعر بيع اقترحه النظام بين فتح الفاتورة والحفظ. */
interface PriceChange {
  lineId: string;
  name: string;
  unit: string;
  factor: bigint;
  before: Fils;
  after: Fils | null;
}

function Checkout({ pendingKey, back, itemParam, storeParam }: { pendingKey: string; back: string; itemParam: string | null; storeParam: string | null }) {
  const id = useId();
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const stores = useLoad(inventory.loadStoresOverview, 'stores');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [ids, setIds] = useState<{ ref: string; saleId: string }>(() => ({ ref: crypto.randomUUID(), saleId: crypto.randomUUID() }));
  const [frozen, setFrozen] = useState<PendingSale | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unreached, setUnreached] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [priceCheck, setPriceCheck] = useState<PriceChange[] | null>(null);
  const [askFree, setAskFree] = useState<PendingSale | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('');
  const [scanNote, setScanNote] = useState<string | null>(null);
  const deferred = useDeferredValue(search);
  const sending = useRef(false);
  const live = useRef(true);
  // آخر نسخة من الفاتورة المعروضة، لمن ينتظر جواباً (الحفظ بعد قراءة الأسعار).
  const latest = useRef<Draft>(EMPTY);
  useEffect(() => {
    latest.current = draft;
  });
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // مادّة من الرابط (?item=، «بِع» في ملفّ المادّة) تُضاف مرّة حين تُقرأ موادّ المخزن؛ لا بعد طلب مستعاد (سطوره تعود بالرفض الأكيد، مراجعة 0033 C7).
  const [seeded, setSeeded] = useState(itemParam === null);
  // طلب معلَّق من فتح سابق (أو قبل إعادة التحميل): تعود الشاشة مجمَّدة به. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (مرّة لكلّ مفتاح).
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (restoredFor !== pendingKey) {
    setRestoredFor(pendingKey);
    const restored = readSalePending(pendingKey);
    setFrozen(restored);
    if (restored) setSeeded(true);
  }
  const rootRef = useRef<HTMLDivElement>(null);
  // «احفظ» الذي توقّف قبل الإرسال: ما أوقفه يُقال بجانب الزرّ (stop لما ليس خطأ خانة)، وأوّل خطأ خانة يُمرَّر إليه (مراجعة 0033 C4).
  const [stop, setStop] = useState<string | null>(null);
  const [focusRound, setFocusRound] = useState(0);
  useEffect(() => {
    if (focusRound > 0 && rootRef.current) focusFirstError(rootRef.current);
  }, [focusRound]);

  // المخازن التي يُباع منها في النطاق، والمختار (المخزن من الرابط، أو الوحيد).
  const storeRows = sellingStores(stores.data);
  const warehouseId = draft.warehouseId || defaultStore(storeRows, storeParam);
  const store = storeRows.find((row) => row.id === warehouseId) ?? null;
  const storeName = store?.name ?? '';
  const today: Day = stores.data?.today ?? localDay();

  // موادّ المخزن؛ وما قُرئ قبل الحفظ يحلّ محلّها حتى قراءة أحدث.
  const catalogState = useCatalog(warehouseId);
  const [override, setOverride] = useState<{ warehouseId: string; catalog: SaleCatalog } | null>(null);
  const catalog = override && override.warehouseId === warehouseId ? override.catalog : catalogState.data;
  const rereadCatalog = () => {
    setOverride(null);
    catalogState.retry();
  };
  const wantsBoxes = catalog !== null && catalog.boxes === null;
  const boxState = useBoxes(wantsBoxes);
  const boxes = catalog?.boxes ?? boxState.data;

  if (!seeded && catalogState.data && warehouseId && !frozen) {
    setSeeded(true);
    const item = catalogState.data.items.find((row) => row.id === itemParam);
    if (draft.lines.some((line) => line.itemId === itemParam)) {
      // في الفاتورة من قبل: لا سطر ثانٍ فارغ.
    } else if (item && item.available > 0n) setDraft((current) => ({ ...current, lines: [...current.lines, newLine(item)] }));
    else setNotice(t('invoice.item_param.missing', 'المادّة المطلوبة لا يوجد منها شيء يُباع في «{store}»؛ اختر مخزناً آخر أو مادّة أخرى.', { store: storeName }));
  }

  // وحدة سطر غابت من وحدات مادّته بعد قراءة جديدة: السعر كان لها فيُمحى، والقائمة تقول «اختر الوحدة» (مراجعة 0033 C11).
  const [unitsCheckedFor, setUnitsCheckedFor] = useState<SaleCatalog | null>(null);
  if (catalog !== null && catalog !== unitsCheckedFor) {
    setUnitsCheckedFor(catalog);
    const byId = new Map(catalog.items.map((item) => [item.id, item]));
    const gone = new Set(
      draft.lines.flatMap((line) => {
        const item = byId.get(line.itemId);
        return item && line.unitId !== null && !item.units.some((unit) => unit.unitId === line.unitId) ? [line.lineId] : [];
      }),
    );
    if (gone.size > 0) setDraft((current) => ({ ...current, lines: current.lines.map((line) => (gone.has(line.lineId) ? { ...line, price: '' } : line)) }));
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const setLine = (lineId: string, patch: Partial<CartLine>) => setDraft((current) => ({ ...current, lines: current.lines.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)) }));

  // ─── الحساب ──────────────────────────────────────────────────────────────────────────────────────────────────
  const read = parseLines(draft.lines, catalog, storeName);
  const invoiceDiscount = draft.invoiceDiscount.trim() ? parseMoneyText(draft.invoiceDiscount, true) : 0n;
  const math = invoiceMath(
    read.map((row) => ({ unitQty: row.qty ?? 0n, unitPrice: row.price ?? 0n, discount: row.discount ?? 0n })),
    invoiceDiscount !== null && invoiceDiscount > 0n ? invoiceDiscount : 0n,
  );
  // خصم سطر أكبر من إجماليّه (bad_discount بالخادم) خطأ على خانته؛ وسعر فوق الصفر يُقرَّب إجماليّه إلى صفر دينار (total_zero بالخادم) خطأ على السعر (مراجعة
  // 0033 C9)، لا «تسليم بلا مقابل».
  const parsed: ParsedLine[] = read.map((row, index) => {
    const errors = { ...row.errors };
    if (math.overLines.includes(index) && !errors.discount) errors.discount = t('invoice.line.discount_over', 'الخصم أكبر من إجماليّ السطر ({gross}).', { gross: dinars(math.gross[index] ?? 0n) });
    if (row.qty !== null && row.price !== null && row.price > 0n && (math.gross[index] ?? 0n) === 0n && !errors.price) {
      errors.price = t('invoice.line.total_zero', 'مبلغ هذا السطر يُقرَّب إلى صفر دينار: راجع الكمية والسعر، أو اكتب السعر صفراً للتسليم بلا مقابل.');
    }
    return { ...row, errors };
  });
  const walkIn = draft.mode === 'walk_in';
  const legs = draft.legs.map((leg) => ({ leg, amount: leg.amount.trim() ? parseMoneyText(leg.amount, true) : null }));
  const paid = legs.reduce((sum, row) => sum + (row.amount !== null && row.amount > 0n ? row.amount : 0n), 0n);
  const debt = math.total - paid;

  const errors: Partial<Record<'store' | 'lines' | 'discount' | 'party' | 'legs' | 'walk_in' | 'note' | 'day', string>> = {};
  if (!warehouseId) errors.store = t('purchase.store.required', 'اختر المخزن.');
  if (draft.lines.length === 0) errors.lines = t('invoice.lines.required', 'أضف مادّة واحدة على الأقلّ إلى الفاتورة.');
  if (invoiceDiscount === null || invoiceDiscount < 0n) errors.discount = t('invoice.discount.invalid', 'خصم الفاتورة بالدينار الصحيح من صفر فأكثر.');
  else if (math.invoiceOver) errors.discount = t('invoice.discount.over', 'خصم الفاتورة أكبر من مجموع السطور بعد خصومها ({base}).', { base: dinars(math.grossTotal - math.lineDiscounts) });
  if (!walkIn && !draft.party) errors.party = t('invoice.party.required', 'اختر الزبون، أو أضفه باسمه، أو اختر «زبون نقديّ» إن دفع المبلغ كلّه.');
  const legErrors = legs.map(({ leg, amount }, index) => {
    if (!leg.boxId) return t('purchase.box.required', 'اختر الصندوق الذي دُفع منه.');
    if (legs.findIndex((other) => other.leg.boxId === leg.boxId) !== index) return t('invoice.leg.duplicate', 'هذا الصندوق مكتوب في دفعة أخرى؛ اجمعهما في دفعة واحدة.');
    if (amount === null || amount <= 0n) return t('invoice.leg.amount', 'اكتب المبلغ بالدينار الصحيح أكبر من صفر.');
    return null;
  });
  if (legErrors.some((problem) => problem !== null)) errors.legs = legErrors.find((problem) => problem !== null) ?? undefined;
  else if (paid > math.total) errors.legs = t('invoice.paid.over', 'المدفوع ({paid}) أكبر من صافي الفاتورة ({total}).', { paid: dinars(paid), total: dinars(math.total) });
  if (walkIn && paid !== math.total && !errors.legs) {
    errors.walk_in = t('invoice.walk_in.unpaid', 'الزبون النقديّ يدفع المبلغ كلّه الآن ({total}): اضغط «ادفع الكلّ»، أو اختر زبوناً باسمه ليبقى الباقي ديناً عليه.', { total: dinars(math.total) });
  }
  if (draft.note.trim().length > NOTE_MAX) errors.note = t('invoice.note.long', 'الملاحظة حتى 500 حرف.');
  const day = postingDay(draft.day ?? fmtDay(today), today);
  if (day.error) errors.day = day.error;
  const lineProblems = parsed.some((row) => Object.keys(row.errors).length > 0);
  const blocked = Object.keys(errors).length > 0 || lineProblems;
  const shown = tried ? errors : {};
  // المال لا يستقيم بعد: الزرّ والمجموع لا يقولان «مدفوعة» ولا ديناً سالباً (مراجعة 0033 C8).
  const moneyState: 'ok' | 'lines' | 'money' = lineProblems ? 'lines' : errors.discount || errors.legs || errors.walk_in || math.nets === null || debt < 0n ? 'money' : 'ok';
  // أوّل ما يمنع الحفظ بترتيب الصفحة، لملخّص الشريط.
  const problems = [
    errors.store,
    errors.lines,
    ...parsed.flatMap((row) => [row.errors.item, row.errors.unit, row.errors.qty, row.errors.price, row.errors.discount]),
    errors.discount,
    errors.day,
    errors.party,
    errors.legs ?? errors.walk_in,
    errors.note,
  ].filter((problem): problem is string => Boolean(problem));

  const dirty = draft.lines.length > 0 || draft.party !== null || draft.legs.length > 0 || draft.note.trim() !== '' || draft.invoiceDiscount.trim() !== '';
  useDirtyForm(dirty || busy || frozen !== null);

  // ─── الإرسال ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** نداء record_sale_v2 بطلب محفوظ: الأوّل من الحفظ، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const send = async (pending: PendingSale, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setUnreached(false);
    // الطلب محفوظ خارج المكوّن قبل أن يخرج: رجوع أو إعادة تحميل قبل الجواب تعيد الشاشة مجمَّدة به.
    storeSalePending(pendingKey, pending);
    try {
      const saved = await recordSaleV2(pending.request);
      storeSalePending(pendingKey, null);
      toast({ tone: 'success', title: doneText(saved) });
      if (!live.current) return;
      setFrozen(null);
      // الفاتورة مكان الشاشة (لا رجوع إلى فاتورة حُفظت)، ورجوعها إلى ما فُتحت منه الفاتورة الجديدة (مراجعة 0033 D9).
      navigate(back === '/sales' ? `/sales/${saved.saleId}` : `/sales/${saved.saleId}?${new URLSearchParams({ back }).toString()}`, { replace: true });
    } catch (problem) {
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن حُفظت: الشاشة تتجمّد بطلبها، والإعادة وحدها ممكنة.
        setFrozen(pending);
        setUnreached(retrying && surelyUnsaved(problem));
        if (!live.current) toast({ tone: 'warning', title: t('invoice.unknown_away', 'لا نعرف إن حُفظت الفاتورة: افتح «فاتورة بيع جديدة» وأعد المحاولة؛ لن تُسجَّل مرّتين.') });
        return;
      }
      // جواب أكيد بلا فاتورة: ما أُرسل يعود إلى الخانات، والإرسال التالي بمرجع جديد (ومعرّفات جديدة بعد id_conflict).
      storeSalePending(pendingKey, null);
      setFrozen(null);
      if (!live.current) {
        toast({ tone: 'danger', title: t('invoice.refused_away', 'لم تُحفظ الفاتورة.'), detail: failureText(problem) });
        return;
      }
      const conflict = problem instanceof RejectedError && problem.code === 'id_conflict';
      setDraft((current) => {
        const base = current.lines.length > 0 ? current : draftOf(pending);
        return conflict
          ? { ...base, lines: base.lines.map((line) => ({ ...line, lineId: crypto.randomUUID() })), legs: base.legs.map((leg) => ({ ...leg, legId: crypto.randomUUID() })) }
          : base;
      });
      setIds({ ref: crypto.randomUUID(), saleId: conflict ? crypto.randomUUID() : pending.request.saleId });
      setFailure(problem);
      if (problem instanceof RejectedError && REREAD.has(problem.code)) rereadCatalog();
      if (problem instanceof RejectedError && REREAD_BOXES.has(problem.code)) {
        rereadCatalog();
        boxState.retry();
      }
    } finally {
      sending.current = false;
      if (live.current) setBusy(false);
    }
  };

  /** الطلب من النموذج كما هو الآن (بعد الحرّاس كلّها). */
  const requestNow = (): PendingSale | null => {
    if (blocked || !warehouseId || !day.day || invoiceDiscount === null) return null;
    const lines = parsed.flatMap((row) =>
      row.item && row.unit && row.qty !== null && row.price !== null && row.discount !== null
        ? [{ lineId: row.line.lineId, itemId: row.item.id, unitId: row.unit.unitId, factor: row.unit.factor, qty: row.qty, unitPrice: row.price, discount: row.discount }]
        : [],
    );
    if (lines.length !== parsed.length) return null;
    const request: SaleRequest = {
      clientRef: ids.ref,
      saleId: ids.saleId,
      warehouseId,
      partyId: walkIn ? null : (draft.party?.id ?? null),
      soldOn: day.day,
      lines,
      invoiceDiscount,
      payments: legs.flatMap(({ leg, amount }) => (amount !== null ? [{ legId: leg.legId, cashAccountId: leg.boxId, amount }] : [])),
      note: draft.note.trim() || null,
    };
    return {
      request,
      summary: {
        warehouseName: storeName,
        partyName: walkIn ? null : (draft.party?.name ?? ''),
        lines: parsed.map((row) => ({ name: row.item?.name ?? row.line.name, qty: unitQtyText(row.qty ?? 0n, row.unit?.label ?? '') })),
        total: math.total,
        paid,
      },
    };
  };

  /** بعد إقرار الأسعار: التسليم بلا مقابل يُسأل عنه صراحةً، وغيره يُرسل. */
  const proceed = (pending: PendingSale) => {
    if (pending.summary.total === 0n) {
      setAskFree(pending);
      return;
    }
    void send(pending, false);
  };

  /** «احفظ الفاتورة»: الحرّاس، ثمّ قراءة الأسعار والمتاح من جديد (المهارة 11)، وإقرار ما تغيّر، ثمّ النداء. */
  const save = async () => {
    setTried(true);
    setNotice(null);
    setStop(null);
    if (frozen || busy || !online) return;
    if (blocked || !warehouseId) {
      setFocusRound((n) => n + 1);
      return;
    }
    const pending = requestNow();
    if (!pending) return;
    const started = draft;
    setBusy(true);
    setFailure(null);
    let fresh: SaleCatalog;
    try {
      fresh = await loadSaleCatalog(warehouseId);
    } catch (problem) {
      if (!live.current) return;
      setBusy(false);
      setFailure(problem);
      setNotice(t('invoice.recheck.failed', 'تعذّرت قراءة الأسعار والمتاح قبل الحفظ، فلم يُرسل شيء. أعد المحاولة.'));
      setStop(t('invoice.recheck.failed', 'تعذّرت قراءة الأسعار والمتاح قبل الحفظ، فلم يُرسل شيء. أعد المحاولة.'));
      return;
    }
    if (!live.current) return;
    setBusy(false);
    setOverride({ warehouseId, catalog: fresh });
    // تغيّرت الفاتورة أثناء القراءة: لا يُرسل طلبٌ غير المعروض (المهارة: «تغيّرت السلّة أثناءها ⇒ قف»).
    if (latest.current !== started) {
      setNotice(t('invoice.changed_meanwhile', 'تغيّرت الفاتورة أثناء التحقّق من الأسعار؛ راجعها ثمّ احفظ.'));
      setStop(t('invoice.changed_meanwhile', 'تغيّرت الفاتورة أثناء التحقّق من الأسعار؛ راجعها ثمّ احفظ.'));
      return;
    }
    const freshById = new Map(fresh.items.map((item) => [item.id, item]));
    // المتاح الجديد أو مادّة غابت: تظهر على سطورها بعد الرسم ويُقال ذلك بجانب الزرّ ويُمرَّر إليها (C4)، ولا يُرسل شيء.
    if (parseLines(draft.lines, fresh, storeName).some((row) => Object.keys(row.errors).length > 0)) {
      setFocusRound((n) => n + 1);
      return;
    }
    const changes: PriceChange[] = parsed.flatMap((row) => {
      const before = row.line.suggestedFrom;
      if (before === null || !row.unit) return [];
      const after = freshById.get(row.line.itemId)?.sellPrice ?? null;
      return after === before ? [] : [{ lineId: row.line.lineId, name: row.item?.name ?? row.line.name, unit: row.unit.label, factor: row.unit.factor, before, after }];
    });
    if (changes.length > 0) {
      setPriceCheck(changes);
      return;
    }
    proceed(pending);
  };

  // ─── أفعال السلّة ────────────────────────────────────────────────────────────────────────────────────────────
  const inCart = new Set(draft.lines.map((line) => line.itemId));
  // المادّة نفسها في سطر آخر (3 أكياس وفرط بسعر آخر، مراجعة 0033 C3): الخادم يجمع سطورها على المتاح.
  const addItem = (item: CatalogItem) => {
    setScanNote(null);
    if (draft.lines.length >= MAX_LINES) return;
    set({ lines: [...draft.lines, newLine(item)] });
  };
  const scan = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const wanted = normalizeCode(code);
    setCode('');
    if (!wanted || !catalog) return;
    const matches = catalog.items.filter((item) => codesOf(item).includes(wanted));
    if (matches.length !== 1 || !matches[0]) {
      setScanNote(
        matches.length === 0
          ? t('invoice.scan.none', 'لا مادّة بالباركود «{code}» تُباع من «{store}».', { code: wanted, store: storeName })
          : t('invoice.scan.many', 'الباركود «{code}» لأكثر من مادّة؛ اخترها من البطاقات.', { code: wanted }),
      );
      return;
    }
    const item = matches[0];
    const existing = draft.lines.find((line) => line.itemId === item.id);
    if (!existing) {
      if (draft.lines.length >= MAX_LINES) return;
      setScanNote(null);
      set({ lines: [...draft.lines, newLine(item, '1')] });
      return;
    }
    // مسحة ثانية للمادّة نفسها: الكمية تزيد واحدة بوحدة سطرها.
    const qty = existing.qty.trim() ? parseQty(existing.qty) : 0n;
    setScanNote(null);
    setLine(existing.lineId, { qty: decimalText((qty ?? 0n) + MILLI_PER_UNIT, 3).replace(/\.?0+$/u, '') });
  };
  const changeUnit = (line: CartLine, unitId: string | null) => {
    if (unitId === UNIT_GONE) return;
    const item = catalog?.items.find((row) => row.id === line.itemId);
    const units = item ? unitsOf(item) : [];
    const unit = units.find((option) => option.unitId === unitId);
    const before = units.find((option) => option.unitId === line.unitId);
    const typed = line.price.trim() ? parseMoneyText(line.price, false) : null;
    // السعر المقترح يتبع الوحدة؛ وما كتبه البائع يتحوّل بالسعر نفسه للأساس (700 للكيلو = 35,000 للكيس) فلا يبقى رقم الكيلو على الكيس.
    const price =
      line.suggestedFrom !== null && unit
        ? inputMoney(unitPriceOf(line.suggestedFrom, unit.factor))
        : typed !== null && typed >= 0n && unit && before
          ? inputMoney(convertUnitPrice(typed, before.factor, unit.factor))
          : line.price;
    setLine(line.lineId, { unitId, price });
  };
  const payAll = () => {
    const others = draft.legs.slice(0, -1).reduce((sum, leg) => sum + (parseMoneyText(leg.amount, true) ?? 0n), 0n);
    const rest = math.total - others;
    if (rest <= 0n) return;
    if (draft.legs.length === 0) {
      const only = boxes && boxes.length === 1 && boxes[0] ? boxes[0].id : '';
      set({ legs: [{ legId: crypto.randomUUID(), boxId: only, amount: inputMoney(rest) }] });
      return;
    }
    set({ legs: draft.legs.map((leg, index) => (index === draft.legs.length - 1 ? { ...leg, amount: inputMoney(rest) } : leg)) });
  };
  const addLeg = () => {
    if (draft.legs.length >= MAX_LEGS) return;
    const taken = new Set(draft.legs.map((leg) => leg.boxId));
    const free = (boxes ?? []).filter((box) => !taken.has(box.id));
    set({ legs: [...draft.legs, { legId: crypto.randomUUID(), boxId: free.length === 1 && free[0] ? free[0].id : '', amount: '' }] });
  };
  const pickStore = (next: string) => {
    if (next === warehouseId) return;
    if (draft.lines.length > 0) {
      setSwitchTo(next);
      return;
    }
    setOverride(null);
    set({ warehouseId: next });
  };

  const backButton = <BackButton to={back} label={checkoutBackLabel(back)} />;
  const title = t('invoice.new.title', 'فاتورة بيع جديدة');

  if (frozen) {
    return (
      <div className="flex flex-col gap-4" data-action="sale-frozen">
        {backButton}
        <PageHeader title={title} />
        <Notice
          tone="warning"
          title={
            unreached
              ? t('invoice.unreached', 'لم يصل الطلب هذه المرّة أيضاً: أعد المحاولة حين يعود الاتصال؛ لن تُسجَّل الفاتورة مرّتين.')
              : t('invoice.unknown', 'لا نعرف إن حُفظت الفاتورة: أعد المحاولة بالطلب نفسه؛ لن تُسجَّل مرّتين ولن تخرج الموادّ مرّتين.')
          }
          action={
            <Button busy={busy} disabled={!online} onClick={() => void send(frozen, true)} data-action="sale-retry">
              {t('purchase.retry', 'أعد المحاولة')}
            </Button>
          }
        >
          <span data-action="sale-sent">{t('birds.sent', 'المرسَل: {what}', { what: sentText(frozen) })}</span>
        </Notice>
        {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
      </div>
    );
  }

  // البحث بالاسم أو بالباركود والرموز الأخرى (مراجعة 0033 C5).
  const needle = searchable(deferred);
  const codeNeedle = normalizeCode(deferred);
  const wanted = needle
    ? (catalog?.items ?? []).filter((item) => searchable(item.name).includes(needle) || (codeNeedle !== '' && codesOf(item).some((code) => code.startsWith(codeNeedle))))
    : (catalog?.items ?? []);
  const previewRows: PreviewRow[] = parsed.map((row, index) => ({
    key: row.line.lineId,
    name: row.item?.name ?? row.line.name,
    qty: row.qty ?? 0n,
    unit: row.unit?.label ?? '',
    price: row.price ?? 0n,
    gross: math.gross[index] ?? 0n,
    lineDiscount: row.discount ?? 0n,
    share: math.shares?.[index] ?? 0n,
    net: math.nets?.[index] ?? 0n,
  }));
  const label = saveLabel(draft.lines.length, math.total, paid, moneyState);
  const blockedText = tried && blocked && problems[0] !== undefined
    ? problems.length === 1
      ? t('invoice.blocked.one', 'لم تُحفظ الفاتورة: {problem}', { problem: problems[0] })
      : t('invoice.blocked.many', 'لم تُحفظ الفاتورة: {problem} وصحّح كذلك ما تحته تنبيه أحمر.', { problem: problems[0] })
    : stop;

  return (
    <div ref={rootRef} className="flex flex-col gap-4" data-action="sale-checkout">
      <style>{CHECKOUT_STYLE}</style>
      {backButton}
      <PageHeader title={title} subtitle={t('invoice.new.subtitle', 'كلّ ما يشتريه الزبون من مخزن واحد في فاتورة واحدة، تُحفظ فوراً برقمها.')} />
      {!online ? (
        <Notice tone="warning" title={t('purchase.offline', 'يحتاج اتصالاً')}>
          {t('invoice.offline', 'الفاتورة تُحفظ في الخادم فوراً برقمها؛ أعد المحاولة حين يعود الاتصال.')}
        </Notice>
      ) : null}
      {notice ? (
        <div data-action="sale-notice">
          <Notice tone="info" title={notice} />
        </div>
      ) : null}

      {/* المخزن */}
      <section className="card flex flex-col gap-3 p-4" data-action="sale-store-section">
        {stores.error ? (
          <LoadFailed what={t('invoice.stores.what', 'مخازن البيع')} error={stores.error} onRetry={stores.retry} />
        ) : !stores.data ? (
          <p role="status" className="text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        ) : storeRows.length === 0 ? (
          <Notice tone="info" title={t('invoice.stores.none', 'لا مخزن في نطاقك يُباع منه.')} />
        ) : storeRows.length === 1 && store ? (
          <p className="font-semibold" data-action="sale-store-name">
            {t('invoice.store.one', 'من مخزن: {store}', { store: store.name })}
          </p>
        ) : (
          <Field id={`${id}-store`} label={t('invoice.store', 'من أيّ مخزن تبيع؟')} error={shown.store} hint={t('invoice.store.hint', 'فاتورة واحدة لكلّ مخزن؛ ما في مخزن آخر يُباع بفاتورة ثانية.')}>
            <select id={`${id}-store`} className="input" value={warehouseId} onChange={(event) => pickStore(event.target.value)} data-action="sale-store">
              <option value="">{t('stock.store.pick', 'اختر المخزن')}</option>
              {storeRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </section>

      {/* إضافة الموادّ */}
      {warehouseId ? (
        <section className="card flex flex-col gap-3 p-4" data-action="sale-add">
          <h2 className="font-semibold">{t('invoice.add.title', 'أضف الموادّ')}</h2>
          {catalogState.error && !catalog ? (
            <LoadFailed what={t('invoice.catalog.what', 'موادّ المخزن')} error={catalogState.error} onRetry={rereadCatalog} />
          ) : !catalog ? (
            <p role="status" className="text-sm text-ink-muted">
              {t('page.loading', 'جارٍ الفتح…')}
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={`${id}-search`} label={t('invoice.search', 'ابحث بالاسم')}>
                  <input id={`${id}-search`} type="search" className="input" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} data-action="sale-search" />
                </Field>
                <Field id={`${id}-code`} label={t('invoice.barcode', 'الباركود (امسح أو اكتبه ثمّ Enter)')}>
                  <input
                    id={`${id}-code`}
                    className="input tabular-nums"
                    dir="ltr"
                    autoComplete="off"
                    inputMode="numeric"
                    value={code}
                    onChange={(event) => setCode(toWesternDigits(event.target.value))}
                    onKeyDown={scan}
                    data-action="sale-barcode"
                  />
                </Field>
              </div>
              {scanNote ? (
                <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="sale-scan-note">
                  {scanNote}
                </p>
              ) : null}
              {wanted.length ? (
                <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3" data-action="sale-items">
                  {wanted.map((item) => {
                    const added = inCart.has(item.id);
                    const out = item.available <= 0n;
                    const expiredOnly = out && item.expired > 0n;
                    return (
                      <li key={item.id} className="flex">
                        <button
                          type="button"
                          className="flex w-full flex-col items-start gap-1 rounded-2xl border border-line p-3 text-start hover:bg-surface-2 disabled:opacity-50"
                          disabled={out || draft.lines.length >= MAX_LINES}
                          onClick={() => addItem(item)}
                          data-action="sale-item-card"
                          data-item={item.id}
                        >
                          <span className="font-semibold">{item.name}</span>
                          <span className="text-xs text-ink-muted">
                            {expiredOnly
                              ? t('invoice.item.expired', 'منتهية الصلاحية: {qty}', { qty: baseQty(item.expired, item.baseUnit) })
                              : out
                                ? t('invoice.item.out', 'نفد من هذا المخزن')
                                : t('invoice.item.available', 'المتاح: {qty}', { qty: baseQty(item.available, item.baseUnit) })}
                          </span>
                          {item.sellPrice !== null ? (
                            <span className="text-xs text-ink-muted">{t('invoice.item.price', '{price} لكل {unit}', { price: dinars(item.sellPrice), unit: baseUnitLabel(item.baseUnit) })}</span>
                          ) : null}
                          {added ? <span className="text-xs font-semibold">{t('invoice.item.added_more', 'في الفاتورة؛ اضغط لسطر آخر')}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted" data-action="sale-items-none">
                  {needle
                    ? t('invoice.items.none_here', 'لا مادّة باسم «{name}» تُباع من «{store}».', { name: search.trim(), store: storeName })
                    : t('invoice.items.empty', 'لا مادّة تُباع من هذا المخزن الآن؛ اشترِ أوّلاً أو أنتج.')}
                </p>
              )}
            </>
          )}
        </section>
      ) : null}

      {/* السلّة */}
      {draft.lines.length ? (
        <section className="flex flex-col gap-3" data-action="sale-cart">
          <h2 className="font-semibold">{t('invoice.cart.title', 'سطور الفاتورة ({lines})', { lines: linesText(draft.lines.length) })}</h2>
          <ul className="flex flex-col gap-3">
            {parsed.map((row, index) => {
              const { line, item } = row;
              const units = item ? unitsOf(item) : [];
              // قبل أوّل حفظ: ما يُقال حيّاً وحده (مادّة غابت، وكمية أكثر من المتاح أو قطع بكسر)؛ وبعده كلّ أخطاء السطر.
              const lineErrors: ParsedLine['errors'] = tried ? row.errors : { item: row.errors.item, qty: row.base !== null ? row.errors.qty : undefined };
              const unitLabel = row.unit?.label ?? '';
              const unitGone = item !== null && !units.some((unit) => unit.unitId === line.unitId);
              return (
                <li key={line.lineId} className="card flex flex-col gap-3 p-4" data-action="cart-line" data-item={line.itemId}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold">{item?.name ?? line.name}</span>
                      {item ? <span className="text-xs text-ink-muted">{t('invoice.item.available', 'المتاح: {qty}', { qty: baseQty(item.available, item.baseUnit) })}</span> : null}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => set({ lines: draft.lines.filter((other) => other.lineId !== line.lineId) })} data-action="cart-remove">
                      {t('invoice.line.remove', 'احذف السطر')}
                    </Button>
                  </div>
                  {lineErrors.item ? (
                    <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                      {lineErrors.item}
                    </p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field id={`${id}-unit-${index}`} label={t('invoice.line.unit_label', 'الوحدة')} error={lineErrors.unit}>
                      <select
                        id={`${id}-unit-${index}`}
                        className="input"
                        value={unitGone ? UNIT_GONE : (line.unitId ?? '')}
                        onChange={(event) => changeUnit(line, event.target.value === '' ? null : event.target.value)}
                        data-action="cart-unit"
                      >
                        {unitGone ? <option value={UNIT_GONE}>{t('invoice.line.unit_pick', 'اختر الوحدة')}</option> : null}
                        {units.map((unit) => (
                          <option key={unit.unitId ?? ''} value={unit.unitId ?? ''}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      id={`${id}-qty-${index}`}
                      label={t('invoice.line.qty_label', 'الكمية ({unit})', { unit: unitLabel })}
                      error={lineErrors.qty}
                      hint={row.base !== null && row.unit && row.unit.unitId !== null && item ? t('purchase.qty.read_back', '= {qty}', { qty: baseQty(row.base, item.baseUnit) }) : undefined}
                    >
                      <input
                        id={`${id}-qty-${index}`}
                        inputMode="decimal"
                        dir="ltr"
                        autoComplete="off"
                        className="input text-end tabular-nums"
                        value={line.qty}
                        onChange={(event) => setLine(line.lineId, { qty: toWesternDigits(event.target.value) })}
                        data-action="cart-qty"
                      />
                    </Field>
                    <Field id={`${id}-price-${index}`} label={t('invoice.line.price_label', 'السعر لكل {unit} (دينار)', { unit: unitLabel })} error={lineErrors.price}>
                      <input
                        id={`${id}-price-${index}`}
                        inputMode="decimal"
                        dir="ltr"
                        autoComplete="off"
                        className="input text-end tabular-nums"
                        value={line.price}
                        onChange={(event) => setLine(line.lineId, { price: toWesternDigits(event.target.value), suggestedFrom: null })}
                        data-action="cart-price"
                      />
                    </Field>
                    <Field id={`${id}-discount-${index}`} label={t('invoice.line.discount_label', 'خصم السطر (دينار)')} error={lineErrors.discount}>
                      <input
                        id={`${id}-discount-${index}`}
                        inputMode="numeric"
                        dir="ltr"
                        autoComplete="off"
                        className="input text-end tabular-nums"
                        value={line.discount}
                        onChange={(event) => setLine(line.lineId, { discount: toWesternDigits(event.target.value) })}
                        data-action="cart-discount"
                      />
                    </Field>
                  </div>
                  <p className="text-sm" data-action="cart-line-total">
                    {row.qty !== null && row.price !== null
                      ? (row.discount ?? 0n) > 0n
                        ? t('invoice.line.total_discount', 'الإجمالي {gross} − الخصم {discount} = {net}', {
                            gross: dinars(math.gross[index] ?? 0n),
                            discount: dinars(row.discount ?? 0n),
                            net: dinars((math.gross[index] ?? 0n) - (row.discount ?? 0n)),
                          })
                        : t('invoice.line.total', 'الإجمالي {gross}', { gross: dinars(math.gross[index] ?? 0n) })
                      : t('invoice.line.total_empty', 'الإجمالي: اكتب الكمية والسعر')}
                  </p>
                </li>
              );
            })}
          </ul>
          <PreviewTable rows={previewRows} totals={{ gross: math.grossTotal, lineDiscounts: math.lineDiscounts, shares: math.shares ? math.shares.reduce((sum, share) => sum + share, 0n) : 0n, total: math.total }} />
        </section>
      ) : warehouseId && catalog ? (
        <p className="text-sm text-ink-muted" data-action="sale-cart-empty">
          {shown.lines ?? t('invoice.cart.empty', 'الفاتورة فارغة: اضغط مادّة أو امسح باركودها.')}
        </p>
      ) : null}

      {/* الفاتورة: الخصم والزبون والدفع والملاحظة والتاريخ */}
      {draft.lines.length ? (
        <section className="card grid gap-4 p-4 sm:grid-cols-2" data-action="sale-invoice">
          <Field id={`${id}-inv-discount`} label={t('invoice.discount', 'خصم الفاتورة (دينار)')} error={shown.discount} hint={t('invoice.discount.hint', 'يُوزَّع على السطور بنسبة مبالغها، ويظهر في التقارير باسمك.')}>
            <input
              id={`${id}-inv-discount`}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              className="input text-end tabular-nums"
              value={draft.invoiceDiscount}
              onChange={(event) => set({ invoiceDiscount: toWesternDigits(event.target.value) })}
              data-action="sale-invoice-discount"
            />
          </Field>
          <DayField id={`${id}-day`} label={t('purchase.day', 'التاريخ')} value={draft.day ?? fmtDay(today)} onChange={(text) => set({ day: toWesternDigits(text) })} error={shown.day} />
          <div className="flex flex-col gap-2 sm:col-span-2" data-action="sale-customer">
            <Segmented<Mode>
              label={t('invoice.customer', 'الزبون')}
              options={[
                { value: 'party', label: t('invoice.customer.party', 'زبون باسمه') },
                { value: 'walk_in', label: t('invoice.customer.walk_in', 'زبون نقديّ (بلا اسم)') },
              ]}
              value={draft.mode}
              onChange={(mode) => set({ mode })}
            />
            {walkIn ? (
              <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm" data-action="sale-walk-in">
                {t('invoice.walk_in.note', 'زبون نقديّ: يدفع المبلغ كلّه الآن، فلا دين عليه ولا اسم.')}
              </p>
            ) : (
              <>
                <SupplierPicker id={`${id}-party`} label={t('invoice.party', 'الزبون (لمن تبيع)')} value={draft.party} onChange={(party) => set({ party })} customer />
                {shown.party ? (
                  <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                    {shown.party}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2" data-action="sale-payments">
            <h3 className="font-semibold">{t('invoice.pay.title', 'الدفع الآن')}</h3>
            {draft.legs.length === 0 ? (
              <p className="text-sm text-ink-muted" data-action="sale-pay-none">
                {t('invoice.pay.none', 'لا دفعة الآن: المبلغ كلّه دين على الزبون.')}
              </p>
            ) : null}
            {wantsBoxes && boxState.error ? <LoadFailed what={t('cash.list', 'قائمة الصناديق')} error={boxState.error} onRetry={boxState.retry} /> : null}
            {draft.legs.map((leg, index) => (
              <div key={leg.legId} className="grid gap-3 sm:grid-cols-2" data-action="pay-leg">
                <BoxPicker
                  id={`${id}-box-${index}`}
                  label={t('invoice.pay.box', 'الصندوق')}
                  boxes={boxes}
                  value={leg.boxId}
                  onChange={(boxId) => set({ legs: draft.legs.map((other) => (other.legId === leg.legId ? { ...other, boxId } : other)) })}
                />
                <div className="flex items-end gap-2">
                  <Field id={`${id}-amount-${index}`} label={t('invoice.pay.amount', 'المبلغ (دينار)')}>
                    <input
                      id={`${id}-amount-${index}`}
                      inputMode="numeric"
                      dir="ltr"
                      autoComplete="off"
                      className="input text-end tabular-nums"
                      value={leg.amount}
                      onChange={(event) => set({ legs: draft.legs.map((other) => (other.legId === leg.legId ? { ...other, amount: toWesternDigits(event.target.value) } : other)) })}
                      data-action="pay-amount"
                    />
                  </Field>
                  <Button size="sm" variant="ghost" onClick={() => set({ legs: draft.legs.filter((other) => other.legId !== leg.legId) })} data-action="pay-remove">
                    {t('invoice.pay.remove', 'احذف')}
                  </Button>
                </div>
              </div>
            ))}
            {shown.legs || shown.walk_in ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="sale-pay-error">
                {shown.legs ?? shown.walk_in}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={addLeg} disabled={draft.legs.length >= MAX_LEGS} data-action="pay-add">
                {t('invoice.pay.add', 'أضف صندوقاً')}
              </Button>
              <Button size="sm" variant="secondary" onClick={payAll} disabled={math.total <= 0n} data-action="pay-all">
                {t('invoice.pay.all', 'ادفع الكلّ')}
              </Button>
            </div>
            <p className="font-semibold" data-action="sale-debt-live">
              {math.nets === null
                ? t('invoice.debt.pending', 'الباقي يُحسب بعد تصحيح الخصم.')
                : debt < 0n
                  ? t('invoice.debt.over', 'المدفوع أكثر من الصافي بـ{over}؛ أنقص المبلغ.', { over: dinars(-debt) })
                  : walkIn
                    ? t('invoice.debt.walk_in', 'الباقي: {debt} (الزبون النقديّ لا يبقى عليه دين)', { debt: dinars(debt) })
                    : t('invoice.debt.live', 'الباقي دين على الزبون: {debt}', { debt: dinars(debt) })}
            </p>
          </div>
          <Field id={`${id}-note`} label={t('invoice.note', 'ملاحظة (اختياريّة)')} error={shown.note}>
            <input id={`${id}-note`} className="input" maxLength={NOTE_MAX} value={draft.note} onChange={(event) => set({ note: event.target.value })} data-action="sale-note" />
          </Field>
        </section>
      ) : null}

      {failure ? (
        <div data-action="sale-failure">
          <Notice tone="danger" title={failureText(failure)} />
        </div>
      ) : null}

      {/* المجموع ثابت أسفل الشاشة بزرّ واحد يسمّي النتيجة */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between print:hidden" data-action="sale-totals-bar">
        {blockedText !== null ? (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="sale-blocked">
            {blockedText}
          </p>
        ) : null}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-action="sale-totals">
          {[
            { key: 'gross', label: t('invoice.col.gross', 'الإجمالي'), value: math.grossTotal },
            { key: 'discount', label: t('invoice.col.discount', 'الخصم'), value: math.discountTotal },
            // صافٍ لا يُحسب (خصم أكبر من المجموع) أو دين لا يستقيم: «—» لا رقماً سالباً (C8).
            { key: 'net', label: t('invoice.col.net', 'الصافي'), value: math.nets === null || math.total < 0n ? null : math.total },
            { key: 'paid', label: t('invoice.totals.paid', 'المدفوع'), value: paid },
            { key: 'debt', label: t('invoice.totals.debt', 'الدين'), value: moneyState === 'money' ? null : walkIn ? 0n : debt > 0n ? debt : 0n },
          ].map((entry) => (
            <div key={entry.key} className="flex items-baseline gap-1" data-action={`sale-total-${entry.key}`}>
              <dt className="text-ink-muted">{entry.label}</dt>
              <dd className="font-semibold tabular-nums">
                <Num>{entry.value === null ? t('file.none', '—') : fmtMoney(entry.value, entry.value % FILS_PER_DINAR === 0n ? 0 : 2)}</Num>
              </dd>
            </div>
          ))}
        </dl>
        <Button size="lg" busy={busy} disabled={!online || draft.lines.length === 0} onClick={() => void save()} data-action="save-invoice">
          {label}
        </Button>
      </div>

      {/* إقرار الأسعار المتغيّرة (المهارة 11) */}
      {priceCheck ? (
        <Dialog
          open
          onClose={() => setPriceCheck(null)}
          title={t('invoice.prices.title', 'تغيّرت أسعار البيع منذ فتحت الفاتورة')}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  const changes = priceCheck;
                  setPriceCheck(null);
                  // أبقِ أسعار الفاتورة كما هي: يُقرّ البائع ما كتبه النظام سابقاً، فلا يُسأل عنه ثانيةً، ثمّ يُحفظ.
                  setDraft((current) => ({ ...current, lines: current.lines.map((line) => { const change = changes.find((c) => c.lineId === line.lineId); return change ? { ...line, suggestedFrom: change.after } : line; }) }));
                  const pending = requestNow();
                  if (pending) proceed(pending);
                }}
                data-action="prices-keep"
              >
                {t('invoice.prices.keep', 'أبقِ أسعار الفاتورة واحفظ')}
              </Button>
              <Button
                onClick={() => {
                  const changes = priceCheck;
                  setPriceCheck(null);
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((line) => {
                      const change = changes.find((c) => c.lineId === line.lineId);
                      if (!change) return line;
                      return change.after === null ? { ...line, suggestedFrom: null } : { ...line, price: inputMoney(unitPriceOf(change.after, change.factor)), suggestedFrom: change.after };
                    }),
                  }));
                  setNotice(t('invoice.prices.updated', 'حُدّثت الأسعار في الفاتورة؛ راجع المجموع ثمّ احفظ.'));
                }}
                data-action="prices-update"
              >
                {t('invoice.prices.update', 'اعتمد الأسعار الجديدة')}
              </Button>
            </div>
          }
        >
          <ul className="flex flex-col gap-2 text-sm" data-action="prices-changes">
            {priceCheck.map((change) => (
              <li key={change.lineId}>
                {change.after === null
                  ? t('invoice.prices.removed', '«{name}»: كان {before} لكل {unit}، ولم يعد له سعر بيع.', { name: change.name, unit: change.unit, before: dinars(unitPriceOf(change.before, change.factor)) })
                  : t('invoice.prices.changed', '«{name}»: كان {before} لكل {unit}، وصار {after}.', {
                      name: change.name,
                      unit: change.unit,
                      before: dinars(unitPriceOf(change.before, change.factor)),
                      after: dinars(unitPriceOf(change.after, change.factor)),
                    })}
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}

      {/* التسليم بلا مقابل يُسأل عنه صراحةً */}
      {askFree ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('sale.free.title', 'تسليم بلا مقابل؟')}
          consequence={t('invoice.free.consequence', 'صافي الفاتورة صفر: تخرج {lines} من «{store}» بلا قبض ولا دين، وتخرج كلفتها من المخزن.', { lines: linesText(askFree.request.lines.length), store: askFree.summary.warehouseName })}
          confirmLabel={t('sale.free.confirm', 'سلّم بلا مقابل')}
          action="confirm-free-invoice"
          onCancel={() => setAskFree(null)}
          onConfirm={() => {
            const pending = askFree;
            setAskFree(null);
            void send(pending, false);
          }}
        />
      ) : null}

      {/* تغيير المخزن والسلّة فيها موادّ */}
      {switchTo !== null ? (
        <ConfirmDialog
          open
          title={t('invoice.store.switch.title', 'تغيير المخزن؟')}
          consequence={t('invoice.store.switch.body', 'الفاتورة من مخزن واحد: تُفرَّغ سطورها ({lines}) وتُختار الموادّ من المخزن الجديد.', { lines: linesText(draft.lines.length) })}
          confirmLabel={t('invoice.store.switch.confirm', 'غيّر المخزن وفرّغ السطور')}
          action="confirm-store-switch"
          onCancel={() => setSwitchTo(null)}
          onConfirm={() => {
            const next = switchTo;
            setSwitchTo(null);
            setOverride(null);
            set({ warehouseId: next, lines: [] });
          }}
        />
      ) : null}
    </div>
  );
}

export default function SaleCheckoutPage() {
  const [params] = useSearchParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const back = checkoutBack(params.get('back'));
  if (!workspace) {
    return (
      <p role="status" className="py-6 text-center text-sm text-ink-muted">
        {t('page.loading', 'جارٍ الفتح…')}
      </p>
    );
  }
  if (!can(workspace.role, 'sale.record')) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton to={back} label={checkoutBackLabel(back)} />
        <Notice tone="info" title={t('invoice.forbidden', 'دورك لا يبيع: الفاتورة يحفظها المالك والمدير والمحاسب وأمين المخزن.')} />
      </div>
    );
  }
  const pendingKey = salePendingKey(workspace.userId, workspace.orgId);
  return <Checkout key={pendingKey} pendingKey={pendingKey} back={back} itemParam={params.get('item')} storeParam={params.get('store')} />;
}
