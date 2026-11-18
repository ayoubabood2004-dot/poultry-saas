import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { FILS_PER_DINAR, type Fils, type Milli } from '../../domain/money';
import { BASE_UNITS, ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';

// الفاتورة الاحترافيّة (عقد 0033، المرحلة ١ من docs/SALES_PLAN.md؛ أجوبة المالك 2026-11-17): موادّ المخزن القابلة للبيع (sale_catalog)، والفاتورة بعدّة سطور
// ووحدات وخصمين وسيقان دفع بنداء واحد يُحفظ فوراً (record_sale_v2، مرجع client_ref، لا يدخل الطابور بلا نت: المهارة 13)، والفاتورة للقراءة (sale_detail
// بشكله الجديد، والقديم ذو السطر الواحد يُقرأ بالمحلّل نفسه). المال نصوص عشرية بالدينار ← Fils، والكمية بثلاث مراتب ← Milli، والمعامل بستّ؛ والغائب null لا
// صفر؛ والشكل الغريب خطأ يسمّي خانته. والطلب الذي لا تُعرف نتيجته يُحفظ خارج المكوّن (sessionStorage بمفتاح المستخدم والمنشأة، والذاكرة إن تعذّر): الرجوع
// والعودة وإعادة التحميل تعيد الشاشة مجمَّدة به والإعادة ترسله حرفاً (درس 2026-11-10). وحدة صفحات (write-guard): تستوردها صفحات المبيعات وحدها.

export class SaleShapeError extends Error {
  constructor(readonly field: string) {
    super(`sale_shape:${field}`);
    this.name = 'SaleShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SaleShapeError(field);
  return value as Row;
};
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new SaleShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new SaleShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new SaleShapeError(field);
  return row[field] as boolean;
};
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new SaleShapeError(field);
  return value;
};
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  const value = row[field];
  if (!allowed.includes(value as T)) throw new SaleShapeError(field);
  return value as T;
};
const optScaled = (row: Row, field: string, scale: number): bigint | null => {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new SaleShapeError(field);
  const parsed = parseDecimal(value, scale);
  if (parsed === null) throw new SaleShapeError(field);
  return toScale(parsed, scale);
};
const scaled = (row: Row, field: string, scale: number): bigint => {
  const value = optScaled(row, field, scale);
  if (value === null) throw new SaleShapeError(field);
  return value;
};
/** مبلغ إجباريّ بالفلس. */
const fils = (row: Row, field: string): Fils => scaled(row, field, 2);
/** كمية إجباريّة بالآلاف. */
const milli = (row: Row, field: string): Milli => scaled(row, field, 3);
/**
 * خانات المال: في الصفّ نفسه أو في كائن money منه (قراءة المبيعات القائمة تضع المبلغ في money: 0021)، والصفّ أوّلاً. القيمة نفسها تُقرأ بصرامة؛ مكانها
 * وحده مرن حتى تقول العيّنات الحقيقية أين وضعته القاعدة (عقد 0033 «ج»).
 */
const moneyRow = (row: Row): Row => (row.money !== null && typeof row.money === 'object' && !Array.isArray(row.money) ? { ...(row.money as Row), ...row } : row);
/** الكلفة والربح داخل cost.money لأدوار الكلفة وحدها (strip_cost يحذف money لغيرها). */
const costOf = (row: Row): { cost: Fils; profit: Fils } | null => {
  if (row.cost === null || row.cost === undefined) return null;
  const cost = record(row.cost, 'cost');
  if (cost.money === null || cost.money === undefined) return null;
  const money = record(cost.money, 'cost.money');
  return { cost: fils(money, 'cost'), profit: fils(money, 'profit') };
};

/** مصفوفة رموز نصّية (alt_codes)؛ null من الخادم = بلا رموز. */
const codes = (row: Row, field: string): string[] => {
  const value = row[field];
  if (value === null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry === '')) throw new SaleShapeError(field);
  return value as string[];
};

/** مبلغ بالدينار الصحيح نصّاً للنداء («15000»). */
export const dinarArg = (amount: Fils): string => decimalText(amount / FILS_PER_DINAR, 0);

// ─── موادّ المخزن القابلة للبيع ─────────────────────────────────────────────────────────────────────────────────

export interface CatalogUnit {
  /** null = وحدة الأساس. */
  unitId: string | null;
  label: string;
  /** إلى وحدة الأساس بستّ مراتب. */
  factor: bigint;
  /** الوحدة الافتراضية للمادّة (item_units.is_default، 0033): لمس البطاقة يضيف واحداً بها. غائبة = لا. */
  isDefault?: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  barcode: string | null;
  /** رموز أخرى للمادّة (باركود ثانٍ لعبوة أخرى): الماسح والبحث يقرآنها كالباركود. */
  altCodes: readonly string[];
  kind: ItemKind;
  category: string | null;
  baseUnit: BaseUnit;
  /** المتاح للبيع في هذا المخزن بوحدة الأساس. */
  available: Milli;
  /** المنتهي الصلاحية في هذا المخزن بوحدة الأساس (خارج المتاح، لا يُباع). */
  expired: Milli;
  /** سعر البيع لوحدة الأساس، أو null بلا سعر. */
  sellPrice: Fils | null;
  /** وحدات البيع من الخادم (for_sale، غير مؤرشفة)؛ وحدة الأساس تضيفها الشاشة أوّلاً. */
  units: readonly CatalogUnit[];
  /** عدد فواتير البيع المحفوظة لها من هذا المخزن في 30 يوماً (sold_30d، 0033): الأكثر بيعاً أوّلاً في الشبكة. غائب = صفر. */
  sold30d: number;
}

export interface CatalogBox {
  id: string;
  name: string;
}

export interface SaleCatalog {
  items: readonly CatalogItem[];
  /**
   * الصناديق من الخادم إن أرسلها مع الموادّ (الأمين لا يقرأ جدولها: «بِع» في ملفّ المادّة كان يأخذها من item_file)، وإلّا null فتُقرأ من جدولها.
   * عقد 0033 يرسل الموادّ مصفوفةً وحدها؛ والشكل { items, cash_accounts } مقبول حتى يقرّر الدمج.
   */
  boxes: readonly CatalogBox[] | null;
}

function catalogItem(row: Row): CatalogItem {
  return {
    id: str(row, 'item_id'),
    name: str(row, 'name'),
    barcode: optStr(row, 'barcode'),
    altCodes: codes(row, 'alt_codes'),
    kind: oneOf(row, 'kind', ITEM_KINDS),
    category: optStr(row, 'category'),
    baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
    available: milli(row, 'available'),
    expired: milli(row, 'expired'),
    sellPrice: optScaled(row, 'sell_price', 2),
    units: list(row.units, 'units').map((unit) => ({ unitId: str(unit, 'unit_id'), label: str(unit, 'label'), factor: scaled(unit, 'factor', 6), isDefault: unit.is_default === undefined ? false : flag(unit, 'is_default') })),
    sold30d: row.sold_30d === undefined ? 0 : int(row, 'sold_30d'),
  };
}

export function parseSaleCatalog(value: unknown): SaleCatalog {
  if (Array.isArray(value)) return { items: list(value, 'sale_catalog').map(catalogItem), boxes: null };
  const json = record(value, 'sale_catalog');
  return {
    items: list(json.items, 'items').map(catalogItem),
    boxes: json.cash_accounts === undefined ? null : list(json.cash_accounts, 'cash_accounts').map((box) => ({ id: str(box, 'id'), name: str(box, 'name') })),
  };
}

/** موادّ المخزن القابلة للبيع بمتاحها وسعرها ووحداتها، لمن يبيع (sale.record) والمخزن في نطاقه. */
export async function loadSaleCatalog(warehouseId: string): Promise<SaleCatalog> {
  return parseSaleCatalog(await call<unknown>('sale_catalog', { p_warehouse: warehouseId }));
}

// ─── الفاتورة: النداء ونتيجته ─────────────────────────────────────────────────────────────────────────────────────

export interface SaleLineInput {
  lineId: string;
  itemId: string;
  /** null = وحدة الأساس. */
  unitId: string | null;
  /**
   * معامل الوحدة إلى الأساس كما رأته الشاشة (ستّ مراتب): الخادم يرفض unit_changed إن تغيّر تحت قفله (مراجعة 0033 C11). اختياريّ: طلب معلَّق من نسخة
   * قبله يُعاد بلا معامل.
   */
  factor?: bigint;
  /** الكمية بوحدة السطر. */
  qty: Milli;
  /** السعر لوحدة السطر. */
  unitPrice: Fils;
  /** خصم السطر بالدينار الصحيح. */
  discount: Fils;
}

export interface SalePaymentInput {
  legId: string;
  cashAccountId: string;
  /** بالدينار الصحيح. */
  amount: Fils;
}

/** ما قرّره الإنسان أمام الكاونتر وحده (المهارة القانون 1): الخادم يحسب المجاميع والخصم الموزَّع والكلفة والدين. */
export interface SaleRequest {
  clientRef: string;
  saleId: string;
  warehouseId: string;
  /** null = زبون نقديّ. */
  partyId: string | null;
  soldOn: Day;
  lines: readonly SaleLineInput[];
  invoiceDiscount: Fils;
  payments: readonly SalePaymentInput[];
  note: string | null;
}

export interface RecordedInvoiceLine {
  lineId: string;
  itemId: string;
  qtyBase: Milli;
  lineTotal: Fils;
}

export interface RecordedInvoice {
  saleId: string;
  docNo: string;
  soldOn: Day;
  total: Fils;
  discountTotal: Fils;
  paid: Fils;
  debt: Fils;
  walkIn: boolean;
  lines: readonly RecordedInvoiceLine[];
}

export function parseRecordedInvoice(value: unknown): RecordedInvoice {
  const json = moneyRow(record(value, 'record_sale_v2'));
  return {
    saleId: str(json, 'sale_id'),
    docNo: str(json, 'doc_no'),
    soldOn: str(json, 'sold_on'),
    total: fils(json, 'total'),
    discountTotal: fils(json, 'discount_total'),
    paid: fils(json, 'paid'),
    debt: fils(json, 'debt'),
    walkIn: flag(json, 'walk_in'),
    lines: list(json.lines, 'lines').map((entry) => {
      const line = moneyRow(entry);
      return { lineId: str(line, 'line_id'), itemId: str(line, 'item_id'), qtyBase: milli(line, 'qty_base'), lineTotal: fils(line, 'line_total') };
    }),
  };
}

/** الفاتورة بنداء واحد يُحفظ فوراً؛ الإعادة بالمرجع نفسه ترجع النتيجة الأولى (والمحتوى غيره id_conflict). */
export async function recordSaleV2(request: SaleRequest): Promise<RecordedInvoice> {
  return parseRecordedInvoice(
    await call<unknown>('record_sale_v2', {
      p_client_ref: request.clientRef,
      p_sale_id: request.saleId,
      p_warehouse: request.warehouseId,
      p_party: request.partyId,
      p_sold_on: request.soldOn,
      p_lines: request.lines.map((line) => ({
        line_id: line.lineId,
        item_id: line.itemId,
        unit_id: line.unitId,
        ...(line.factor === undefined ? {} : { factor: decimalText(line.factor, 6) }),
        qty: decimalText(line.qty, 3),
        unit_price: decimalText(line.unitPrice, 2),
        discount: dinarArg(line.discount),
      })),
      p_invoice_discount: dinarArg(request.invoiceDiscount),
      p_payments: request.payments.map((leg) => ({ leg_id: leg.legId, cash_account_id: leg.cashAccountId, amount: dinarArg(leg.amount) })),
      p_note: request.note,
    }),
  );
}

// ─── الفاتورة للقراءة (sale_detail) ───────────────────────────────────────────────────────────────────────────────

const STATUSES = ['posted', 'void'] as const;
export type InvoiceStatus = (typeof STATUSES)[number];

export interface InvoiceLine {
  lineId: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  /** بوحدة الأساس. */
  qty: Milli;
  /**
   * اسم وحدة السطر، أو null لوحدة الأساس (تسمّيها الشاشة بالعربية): القاعدة تكتب رمز الأساس («kg») في unit_label لسطر بلا وحدة (unit_id null)، فلا
   * يُعرض لاتينيّاً (مراجعة 0033 C1/D4).
   */
  unitLabel: string | null;
  /** الكمية بوحدة السطر. */
  unitQty: Milli;
  /** السعر لوحدة السطر. */
  unitPrice: Fils;
  gross: Fils;
  lineDiscount: Fils;
  invoiceShare: Fils;
  /** صافي السطر = الإجماليّ − الخصمين. */
  net: Fils;
  /** لأدوار الكلفة وحدها. */
  cost: { cost: Fils; profit: Fils } | null;
}

export interface InvoicePayment {
  legNo: number;
  cashAccountId: string;
  cashAccountName: string;
  amount: Fils;
  /** رُدّ مبلغ هذه الساق («ألغِ القبض» أو إلغاء فاتورة نقديّة): ليس من المدفوع الآن. */
  refunded: boolean;
}

export interface SaleInvoice {
  id: string;
  docNo: string;
  status: InvoiceStatus;
  soldOn: Day;
  partyId: string;
  partyName: string;
  walkIn: boolean;
  warehouseId: string;
  warehouseName: string;
  bookId: string;
  note: string | null;
  postedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  canVoid: boolean;
  /**
   * لماذا لا تُلغى (void_block، فحوص void_sale نفسها بترتيبها): forbidden (الدور) أو out_of_scope أو period_locked أو already_void، أو null (تُلغى أو جواب
   * قبله).
   */
  voidBlock: string | null;
  /** رُدّ شيء من المقبوض (ساق واحدة على الأقلّ، لا كلّه بالضرورة: انظر payments[].refunded)؛ المردود يُقرأ بالدين. */
  paymentRefunded: boolean;
  lines: readonly InvoiceLine[];
  payments: readonly InvoicePayment[];
  grossTotal: Fils;
  invoiceDiscount: Fils;
  discountTotal: Fils;
  total: Fils;
  /** المدفوع الآن: السيقان التي لم تُردّ. */
  paid: Fils;
  /** دين الفاتورة = الصافي − المدفوع الآن (لا يتغيّر بقبض لاحق). */
  debt: Fils;
  /** المتبقّي الآن من قيد الفاتورة بعد ما سُدّد منه لاحقاً (open). */
  open: Fils;
  /** يُستلم من الزبون الآن (الخادم: محفوظة، باسم، متبقٍّ > 0، ودور يقبض في نطاق دفترها). */
  canCollect: boolean;
  cost: { cost: Fils; profit: Fils } | null;
  /** قُرئت بشكل 0021 (سطر واحد في الجذر، بلا lines). */
  legacy: boolean;
}

/** اسم وحدة السطر: null لوحدة الأساس (unit_id null من القاعدة، أو الاسم = رمز الأساس، أو بلا اسم). */
function lineLabel(line: Row): string | null {
  const label = optStr(line, 'unit_label');
  if (label === null || line.unit_id === null || label === line.base_unit) return null;
  return label;
}

function invoiceLine(entry: Row): InvoiceLine {
  const line = moneyRow(entry);
  return {
    lineId: str(line, 'line_id'),
    itemId: str(line, 'item_id'),
    itemName: str(line, 'item_name'),
    baseUnit: oneOf(line, 'base_unit', BASE_UNITS),
    // أسماء القاعدة الحقيقية (عيّنات sales-0033.json): الكمية بالأساس qty_base، والسعر لوحدة السطر unit_price (وللأساس base_unit_price للعرض القديم).
    qty: milli(line, 'qty_base'),
    unitLabel: lineLabel(line),
    unitQty: milli(line, 'unit_qty'),
    unitPrice: fils(line, 'unit_price'),
    gross: fils(line, 'gross_total'),
    lineDiscount: fils(line, 'line_discount'),
    invoiceShare: fils(line, 'invoice_discount_share'),
    net: fils(line, 'line_total'),
    cost: costOf(entry),
  };
}

/** اسم الصندوق في الساق: cash_account_name، أو account_name (اسم فاتورة الطيور). */
const boxName = (row: Row): string => (row.cash_account_name !== undefined ? str(row, 'cash_account_name') : str(row, 'account_name'));

export function parseSaleInvoice(value: unknown): SaleInvoice {
  const json = record(value, 'sale_detail');
  const head = {
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    status: oneOf(json, 'status', STATUSES),
    soldOn: str(json, 'sold_on'),
    partyId: str(json, 'party_id'),
    partyName: str(json, 'party_name'),
    warehouseId: str(json, 'warehouse_id'),
    warehouseName: str(json, 'warehouse_name'),
    bookId: str(json, 'book_id'),
    voidedAt: optStr(json, 'voided_at'),
    voidReason: optStr(json, 'void_reason'),
    canVoid: flag(json, 'can_void'),
    voidBlock: optStr(json, 'void_block'),
    paymentRefunded: json.payment_refunded === undefined ? false : flag(json, 'payment_refunded'),
    cost: costOf(json),
  };
  if (json.lines === undefined) {
    // شكل 0021: سطر واحد في الجذر بوحدة الأساس، والمبلغ في money (unit_price وline_total وpaid_now)، بلا خصم.
    const money = record(json.money, 'money');
    const total = fils(money, 'line_total');
    const paid = fils(money, 'paid_now');
    const line: InvoiceLine = {
      lineId: str(json, 'line_id'),
      itemId: str(json, 'item_id'),
      itemName: str(json, 'item_name'),
      baseUnit: oneOf(json, 'base_unit', BASE_UNITS),
      qty: milli(json, 'qty'),
      unitLabel: null,
      unitQty: milli(json, 'qty'),
      unitPrice: fils(money, 'unit_price'),
      gross: total,
      lineDiscount: 0n,
      invoiceShare: 0n,
      net: total,
      cost: head.cost,
    };
    return {
      ...head,
      walkIn: false,
      note: null,
      postedByName: null,
      lines: [line],
      payments: [],
      grossTotal: total,
      invoiceDiscount: 0n,
      discountTotal: 0n,
      total,
      paid,
      debt: total - paid,
      open: total - paid,
      canCollect: false,
      legacy: true,
    };
  }
  const money = moneyRow(json);
  const lines = list(json.lines, 'lines').map(invoiceLine);
  return {
    ...head,
    walkIn: flag(json, 'walk_in'),
    note: optStr(json, 'note'),
    postedByName: optStr(json, 'posted_by_name'),
    lines,
    payments: list(json.payments, 'payments').map((leg) => ({
      legNo: int(leg, 'leg_no'),
      cashAccountId: str(leg, 'cash_account_id'),
      cashAccountName: boxName(leg),
      amount: fils(moneyRow(leg), 'amount'),
      refunded: flag(leg, 'refunded'),
    })),
    grossTotal: lines.reduce((sum, line) => sum + line.gross, 0n),
    invoiceDiscount: fils(money, 'invoice_discount'),
    discountTotal: fils(money, 'discount_total'),
    total: fils(money, 'total'),
    paid: fils(money, 'paid'),
    debt: fils(money, 'debt'),
    open: fils(money, 'open'),
    canCollect: flag(json, 'can_collect'),
    legacy: false,
  };
}

/** الفاتورة للقراءة: سطورها بوحداتها وخصوماتها، وسيقانها، ومجاميعها، والكلفة والربح لأدوار الكلفة وحدها. */
export async function loadSaleInvoice(saleId: string): Promise<SaleInvoice> {
  return parseSaleInvoice(await call<unknown>('sale_detail', { p_sale: saleId }));
}

// ─── الطلب المعلَّق ───────────────────────────────────────────────────────────────────────────────────────────────

/** ما يُعرض عن الطلب المجمَّد («المرسَل: …») بلا قراءة: كما رآه البائع لحظة الإرسال. */
export interface PendingSummary {
  warehouseName: string;
  /** null = زبون نقديّ. */
  partyName: string | null;
  lines: readonly { name: string; qty: string }[];
  total: Fils;
  paid: Fils;
}

export interface PendingSale {
  request: SaleRequest;
  summary: PendingSummary;
}

const pendingMemory = new Map<string, string>();

/** مفتاح الطلب المعلَّق: المستخدم والمنشأة (فاتورة واحدة في الطريق لكلّ بائع)، فلا يعود طلب مستخدم لآخر في التبويب نفسه. */
export function salePendingKey(userId: string, orgId: string): string {
  return `sales.invoice.pending:${userId}:${orgId}`;
}

/** يحفظ الطلب المعلَّق (أو يمحوه بـnull) في sessionStorage، وفي الذاكرة دائماً (تصفّح خاصّ أو تخزين ممنوع). */
export function storeSalePending(key: string, pending: PendingSale | null): void {
  if (key === '') return;
  const text = pending === null ? null : JSON.stringify(pending, (_field, entry: unknown) => (typeof entry === 'bigint' ? { big: String(entry) } : entry));
  if (text === null) pendingMemory.delete(key);
  else pendingMemory.set(key, text);
  try {
    if (text === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, text);
  } catch {
    // بلا sessionStorage: الذاكرة وحدها تحمي من الرجوع والعودة.
  }
}

const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const texts = (row: Row, fields: readonly string[]): boolean => fields.every((field) => typeof row[field] === 'string' && row[field] !== '');
const bigs = (row: Row, fields: readonly string[]): boolean => fields.every((field) => typeof row[field] === 'bigint');

/** طلب بشكل record_sale_v2 كما كتبه storeSalePending، وإلّا null (تخزين تالف أو من نسخة أخرى). */
function asPending(value: unknown): PendingSale | null {
  if (!isRecord(value) || !isRecord(value.request) || !isRecord(value.summary)) return null;
  const { request, summary } = value;
  const head = texts(request, ['clientRef', 'saleId', 'warehouseId', 'soldOn']) && (request.partyId === null || typeof request.partyId === 'string') && typeof request.invoiceDiscount === 'bigint';
  const note = request.note === null || typeof request.note === 'string';
  const lines =
    Array.isArray(request.lines) &&
    request.lines.length > 0 &&
    request.lines.every(
      (line: unknown) =>
        isRecord(line) &&
        texts(line, ['lineId', 'itemId']) &&
        (line.unitId === null || typeof line.unitId === 'string') &&
        (line.factor === undefined || typeof line.factor === 'bigint') &&
        bigs(line, ['qty', 'unitPrice', 'discount']),
    );
  const legs = Array.isArray(request.payments) && request.payments.every((leg: unknown) => isRecord(leg) && texts(leg, ['legId', 'cashAccountId']) && bigs(leg, ['amount']));
  const shown =
    typeof summary.warehouseName === 'string' &&
    (summary.partyName === null || typeof summary.partyName === 'string') &&
    bigs(summary, ['total', 'paid']) &&
    Array.isArray(summary.lines) &&
    summary.lines.every((line: unknown) => isRecord(line) && typeof line.name === 'string' && typeof line.qty === 'string');
  return head && note && lines && legs && shown ? (value as unknown as PendingSale) : null;
}

export function readSalePending(key: string): PendingSale | null {
  if (key === '') return null;
  const fromSession = (): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch { // swallow-ok: sessionStorage ممنوع (تصفّح خاصّ أو إعداد المتصفّح)؛ الطلب في الذاكرة بعده
      return null;
    }
  };
  const text = fromSession() ?? pendingMemory.get(key) ?? null;
  if (text === null) return null;
  try {
    return asPending(JSON.parse(text, (_field, entry: unknown) => (isRecord(entry) && Object.keys(entry).length === 1 && typeof entry.big === 'string' ? BigInt(entry.big) : entry)));
  } catch { // swallow-ok: نصّ لم يكتبه storeSalePending (تخزين تالف)؛ لا طلب معلَّق يُستعاد منه
    return null;
  }
}
