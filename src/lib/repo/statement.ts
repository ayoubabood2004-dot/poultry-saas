import type { Day } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import { DIVISION_KINDS, type DivisionKind } from '../../domain/divisions';
import type { Fils, Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import type { CashKind } from './cash';
import { call } from './core';
import type { BookCode, EntryKind } from './parties';

// الكشف الاحترافي والسندات وصفحة البيع (عقد 0024 §4.4–§4.6 و§7، الخطّة §8.1 «1-د» و«1-هـ»): محلّلات أجوبة party_statement_v2
// وvoucher_detail وtransfer_detail وsale_detail بشكلها بالضبط، ونداءاتها. القرّاء definer بنطاق صريح بالخادم، والشاشة تقرأ ولا تفترض.
// المال نصوص عشرية بالدينار (E3) وبالواجهة فلس bigint، والكمية نصّ بثلاث مراتب ← Milli؛ وكلّ خانة يقول العقد إنّها قد تكون null
// تُقرأ nullable، وما سواها إجباريّ يرمي إذا غاب (جواب بشكل غير المتوقّع لا يُقبل بصمت). مفاتيح jsonb ترجع بترتيب بوستغريس، فالقراءة
// بالمفتاح دائماً (§7). ملف كسول: تستورده شاشات الحسابات وصفحة البيع مباشرةً، وindex لا يصدّره (write-guard)؛ ولا يستورد parties
// (إلّا أنواعه): صفحة البيع في حزمة المخزون، فاستيراده كان يجرّ دفاتر الجهات كلّها إليها. وفاتورة الطيور BR ومقبوضها (0028، العقد §6):
// تفصيلان جديدان bird_sale وbird_sale_payment بشكل entry_detail.

export type Row = Record<string, unknown>;

/** جواب بشكل غير المتوقّع: يرمي باسم الخانة بدل ما يُقبل بصمت (صنف لحاله مثل LedgerShapeError). */
export class StatementShapeError extends Error {
  constructor(readonly field: string) {
    super(`statement_shape:${field}`);
    this.name = 'StatementShapeError';
  }
}

export const object = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new StatementShapeError(field);
  return value as Row;
};
export const list = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new StatementShapeError(field);
  return value;
};
export const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new StatementShapeError(field);
  return value;
};
export const optStr = (row: Row, field: string): string | null => {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new StatementShapeError(field);
  return value;
};
export const flag = (row: Row, field: string): boolean => {
  const value = row[field];
  if (typeof value !== 'boolean') throw new StatementShapeError(field);
  return value;
};
/** عدد صحيح غير سالب (العدّادات والأعمار والنسخة). */
export const whole = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new StatementShapeError(field);
  return value;
};
export const oneOf = <T extends string>(row: Row, field: string, values: readonly T[]): T => {
  const value = row[field];
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) throw new StatementShapeError(field);
  return value as T;
};
const scaled = (row: Row, field: string, scale: number): bigint => {
  const value = parseDecimal(str(row, field), scale);
  if (value === null) throw new StatementShapeError(field);
  return toScale(value, scale);
};
/** مبلغ (نصّ عشري بالدينار) بالفلس. */
export const fils = (row: Row, field: string): Fils => scaled(row, field, 2);
export const optFils = (row: Row, field: string): Fils | null => (row[field] === null || row[field] === undefined ? null : fils(row, field));
/** كمية (نصّ عشري بثلاث مراتب) بالآلاف. */
export const qty = (row: Row, field: string): Milli => scaled(row, field, 3);

export const ENTRY_KINDS: readonly EntryKind[] = ['invoice', 'purchase', 'bill', 'payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'opening', 'adjustment', 'offset'];
export const BOOK_CODES: readonly BookCode[] = ['main', 'chicks', 'hatching_eggs'];
const BASE_UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const CASH_KINDS: readonly CashKind[] = ['cash', 'bank', 'wallet'];
const STATUSES = ['posted', 'void'] as const;
export type DocStatus = (typeof STATUSES)[number];
const PAYMENTS = ['cash', 'credit'] as const;
export type SalePayment = (typeof PAYMENTS)[number];

export const entryKind = (row: Row, field = 'kind'): EntryKind => oneOf(row, field, ENTRY_KINDS);
export const divisionKind = (row: Row, field = 'division_kind'): DivisionKind => oneOf(row, field, DIVISION_KINDS);

// ─── أعمار الديون (§3): الفئات الأربع بمبالغها ────────────────────────────────────────────────────────────────

export const AGING_BUCKETS = ['d0_30', 'd31_60', 'd61_90', 'd91_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export type Aging = Readonly<Record<AgingBucket, Fils>>;

export function parseAging(value: unknown, field = 'aging'): Aging {
  const row = object(value, field);
  return { d0_30: fils(row, 'd0_30'), d31_60: fils(row, 'd31_60'), d61_90: fils(row, 'd61_90'), d91_plus: fils(row, 'd91_plus') };
}

/** فئة العمر بالأيام (§3): 0–30، 31–60، 61–90، وأكثر من 90. */
export function bucketOf(ageDays: number): AgingBucket {
  if (ageDays <= 30) return 'd0_30';
  if (ageDays <= 60) return 'd31_60';
  if (ageDays <= 90) return 'd61_90';
  return 'd91_plus';
}

// ─── الكشف الاحترافي (§4.4) ─────────────────────────────────────────────────────────────────────────────────

export interface Named {
  id: string;
  name: string;
}

const named = (value: unknown, field: string): Named => {
  const row = object(value, field);
  return { id: str(row, 'id'), name: str(row, 'name') };
};
const optNamed = (value: unknown, field: string): Named | null => (value === null || value === undefined ? null : named(value, field));

/** توزيع قائم يربط القيد بقيد بالإشارة المعاكسة، بالقيد الآخر. */
export interface Allocation {
  entryId: string;
  kind: EntryKind;
  docNo: string | null;
  /** نوع مستند القيد الآخر ومعرّفه (§7: يرجعان مع العيّنات الحقيقية)، أو null لقيد بلا مستند. */
  docKind: string | null;
  docId: string | null;
  onDate: Day;
  amount: Fils;
}

export function parseAllocation(value: unknown): Allocation {
  const row = object(value, 'allocations');
  return { entryId: str(row, 'entry_id'), kind: entryKind(row), docNo: optStr(row, 'doc_no'), docKind: optStr(row, 'doc_kind'), docId: optStr(row, 'doc_id'), onDate: str(row, 'on_date'), amount: fils(row, 'amount') };
}

export interface PurchaseLine {
  lineNo: number;
  itemId: string;
  itemName: string;
  /** الكمية بوحدة الشراء (qty_in_unit). */
  qty: Milli;
  /** اسم وحدة الشراء: وحدة تعبئة، أو رمز وحدة أساس (kg، L، pc) يُعرض باسمه (§7). */
  unitLabel: string;
  /** المبلغ ÷ الكمية بمرتبتين؛ null لشراء بلا سعر. */
  unitPrice: Fils | null;
  amount: Fils | null;
}

export interface PurchaseCharge {
  label: string;
  amount: Fils;
  paid: 'cash' | 'party';
}

export interface PurchaseDetail {
  type: 'purchase';
  docId: string;
  docNo: string;
  status: DocStatus;
  receivedOn: Day;
  warehouse: Named;
  lines: readonly PurchaseLine[];
  linesTotal: Fils;
  discount: Fils;
  charges: readonly PurchaseCharge[];
  /** = المجموع − الخصم = «له» القيد (ثابت العقد). */
  net: Fils;
  paidNow: Fils;
  account: Named | null;
}

export interface PurchasePaymentDetail {
  type: 'purchase_payment';
  docId: string;
  docNo: string;
  account: Named | null;
}

export interface PurchaseChargeDetail {
  type: 'purchase_charge';
  docId: string;
  docNo: string;
  label: string;
  amount: Fils;
  warehouse: Named;
}

export interface SaleLine {
  lineNo: number;
  itemId: string;
  itemName: string;
  qty: Milli;
  baseUnit: BaseUnit;
  unitPrice: Fils;
  amount: Fils;
}

export interface SaleDetail {
  type: 'sale';
  docId: string;
  docNo: string;
  status: DocStatus;
  soldOn: Day;
  warehouse: Named;
  payment: SalePayment;
  account: Named | null;
  lines: readonly SaleLine[];
  total: Fils;
}

export interface SalePaymentDetail {
  type: 'sale_payment';
  docId: string;
  docNo: string;
  account: Named | null;
}

export interface ReturnLine {
  lineNo: number;
  itemId: string;
  itemName: string;
  qty: Milli;
  baseUnit: BaseUnit;
  amount: Fils;
}

/** فاتورة الطيور BR (0028، العقد §6): الحقل والتذكرة والطيور والصافي والتنزيل والمحسوب وسعر الكيلو والمبلغ والمقبوض وصندوقه. */
export interface BirdSaleEntryDetail {
  type: 'bird_sale';
  docId: string;
  docNo: string;
  status: DocStatus;
  soldOn: Day;
  site: Named;
  ticketNo: string;
  birds: number;
  netKg: Milli;
  /** نسبة التنزيل بالمئات من الواحد بالمئة (0.50٪ = 50). */
  deduction: bigint;
  billedKg: Milli;
  /** سعر الكيلو. */
  unitPrice: Fils;
  total: Fils;
  paidNow: Fils;
  account: Named | null;
}

/** المقبوض عند فاتورة الطيور (قيد قبض بمستندها) بصندوقه. */
export interface BirdSalePaymentEntryDetail {
  type: 'bird_sale_payment';
  docId: string;
  docNo: string;
  account: Named | null;
}

export interface SupplierReturnDetail {
  type: 'supplier_return';
  docId: string;
  docNo: string;
  status: DocStatus;
  returnedOn: Day;
  receiptId: string;
  receiptDocNo: string;
  warehouse: Named;
  lines: readonly ReturnLine[];
  total: Fils;
}

export interface ExpenseDetail {
  type: 'expense';
  expenseId: string;
  category: string;
  divisionKind: DivisionKind;
  note: string | null;
  forMonth: Day;
}

export interface RevaluationDetail {
  type: 'revaluation';
  receiptId: string;
  receiptDocNo: string;
  itemName: string;
  /** true: تسعير شراء سُجّل بلا سعر؛ false: تصحيح سعر (§7). */
  pricing: boolean;
  qty: Milli;
  unitLabel: string;
  unitPrice: Fils | null;
  oldTotal: Fils;
  newTotal: Fils;
  diff: Fils;
}

export type EntryDetail =
  | PurchaseDetail
  | PurchasePaymentDetail
  | PurchaseChargeDetail
  | SaleDetail
  | SalePaymentDetail
  | BirdSaleEntryDetail
  | BirdSalePaymentEntryDetail
  | SupplierReturnDetail
  | ExpenseDetail
  | RevaluationDetail;

const DETAIL_TYPES = ['purchase', 'purchase_payment', 'purchase_charge', 'sale', 'sale_payment', 'bird_sale', 'bird_sale_payment', 'supplier_return', 'expense', 'revaluation'] as const;

function parsePurchaseLine(value: unknown): PurchaseLine {
  const row = object(value, 'lines');
  return {
    lineNo: whole(row, 'line_no'),
    itemId: str(row, 'item_id'),
    itemName: str(row, 'item_name'),
    qty: qty(row, 'qty'),
    unitLabel: str(row, 'unit_label'),
    unitPrice: optFils(row, 'unit_price'),
    amount: optFils(row, 'amount'),
  };
}

export function parseDetail(value: unknown): EntryDetail | null {
  if (value === null || value === undefined) return null;
  const row = object(value, 'detail');
  const type = oneOf(row, 'type', DETAIL_TYPES);
  switch (type) {
    case 'purchase':
      return {
        type,
        docId: str(row, 'doc_id'),
        docNo: str(row, 'doc_no'),
        status: oneOf(row, 'status', STATUSES),
        receivedOn: str(row, 'received_on'),
        warehouse: named(row.warehouse, 'warehouse'),
        lines: list(row.lines, 'lines').map(parsePurchaseLine),
        linesTotal: fils(row, 'lines_total'),
        discount: fils(row, 'discount'),
        charges: list(row.charges, 'charges').map((item) => {
          const charge = object(item, 'charges');
          return { label: str(charge, 'label'), amount: fils(charge, 'amount'), paid: oneOf(charge, 'paid', ['cash', 'party'] as const) };
        }),
        net: fils(row, 'net'),
        paidNow: fils(row, 'paid_now'),
        account: optNamed(row.account, 'account'),
      };
    case 'purchase_payment':
    case 'sale_payment':
    case 'bird_sale_payment':
      return { type, docId: str(row, 'doc_id'), docNo: str(row, 'doc_no'), account: optNamed(row.account, 'account') };
    case 'purchase_charge':
      return { type, docId: str(row, 'doc_id'), docNo: str(row, 'doc_no'), label: str(row, 'label'), amount: fils(row, 'amount'), warehouse: named(row.warehouse, 'warehouse') };
    case 'sale':
      return {
        type,
        docId: str(row, 'doc_id'),
        docNo: str(row, 'doc_no'),
        status: oneOf(row, 'status', STATUSES),
        soldOn: str(row, 'sold_on'),
        warehouse: named(row.warehouse, 'warehouse'),
        payment: oneOf(row, 'payment', PAYMENTS),
        account: optNamed(row.account, 'account'),
        lines: list(row.lines, 'lines').map((item) => {
          const line = object(item, 'lines');
          return { lineNo: whole(line, 'line_no'), itemId: str(line, 'item_id'), itemName: str(line, 'item_name'), qty: qty(line, 'qty'), baseUnit: oneOf(line, 'base_unit', BASE_UNITS), unitPrice: fils(line, 'unit_price'), amount: fils(line, 'amount') };
        }),
        total: fils(row, 'total'),
      };
    case 'bird_sale':
      return {
        type,
        docId: str(row, 'doc_id'),
        docNo: str(row, 'doc_no'),
        status: oneOf(row, 'status', STATUSES),
        soldOn: str(row, 'sold_on'),
        site: named(row.site, 'site'),
        ticketNo: str(row, 'ticket_no'),
        birds: whole(row, 'birds'),
        netKg: qty(row, 'net_kg'),
        deduction: scaled(row, 'deduction_pct', 2),
        billedKg: qty(row, 'billed_kg'),
        unitPrice: fils(row, 'unit_price'),
        total: fils(row, 'total'),
        paidNow: fils(row, 'paid_now'),
        account: optNamed(row.account, 'account'),
      };
    case 'supplier_return':
      return {
        type,
        docId: str(row, 'doc_id'),
        docNo: str(row, 'doc_no'),
        status: oneOf(row, 'status', STATUSES),
        returnedOn: str(row, 'returned_on'),
        receiptId: str(row, 'receipt_id'),
        receiptDocNo: str(row, 'receipt_doc_no'),
        warehouse: named(row.warehouse, 'warehouse'),
        lines: list(row.lines, 'lines').map((item) => {
          const line = object(item, 'lines');
          return { lineNo: whole(line, 'line_no'), itemId: str(line, 'item_id'), itemName: str(line, 'item_name'), qty: qty(line, 'qty'), baseUnit: oneOf(line, 'base_unit', BASE_UNITS), amount: fils(line, 'amount') };
        }),
        total: fils(row, 'total'),
      };
    case 'expense':
      return { type, expenseId: str(row, 'expense_id'), category: str(row, 'category'), divisionKind: divisionKind(row), note: optStr(row, 'note'), forMonth: str(row, 'for_month') };
    case 'revaluation':
      return {
        type,
        receiptId: str(row, 'receipt_id'),
        receiptDocNo: str(row, 'receipt_doc_no'),
        itemName: str(row, 'item_name'),
        pricing: flag(row, 'pricing'),
        qty: qty(row, 'qty'),
        unitLabel: str(row, 'unit_label'),
        unitPrice: optFils(row, 'unit_price'),
        oldTotal: fils(row, 'old_total'),
        newTotal: fils(row, 'new_total'),
        diff: fils(row, 'diff'),
      };
  }
}

export interface StatementLine {
  entryId: string;
  /** ترتيب القيد داخل (الجهة، الدفتر)، نصّاً كما يرجع. */
  seq: string;
  onDate: Day;
  kind: EntryKind;
  docKind: string | null;
  docId: string | null;
  docNo: string | null;
  reason: string | null;
  /** معرّف القيد الذي يلغيه هذا السطر، أو null. */
  reverses: string | null;
  /** أُلغي هذا القيد لاحقاً. */
  reversed: boolean;
  debit: Fils;
  credit: Fils;
  /** المدوَّر + المجموع الجاري (من الخادم). */
  balance: Fils;
  /** صندوق القبض أو الدفع، أو null. */
  account: Named | null;
  /** للقبض والدفع (RC/PY) قيد السند الأصلي (ولسطر الإلغاء القيد الذي يلغيه)، وإلّا null. */
  voucherId: string | null;
  detail: EntryDetail | null;
  allocations: readonly Allocation[];
  /** ما بقي من القيد بلا توزيع. */
  unallocated: Fils;
}

export interface OpenItem {
  entryId: string;
  onDate: Day;
  kind: EntryKind;
  docKind: string | null;
  docId: string | null;
  docNo: string | null;
  /** المبلغ بقيمته المطلقة. */
  amount: Fils;
  settled: Fils;
  remaining: Fils;
  ageDays: number;
  side: 'debit' | 'credit';
}

export interface StatementBook {
  bookId: string;
  code: BookCode;
  name: string;
  divisionId: string;
  divisionKind: DivisionKind;
  broughtForward: Fils;
  totalDebit: Fils;
  totalCredit: Fils;
  closing: Fils;
  lines: readonly StatementLine[];
  /** المفتوح اليوم (لا لآخر الفترة)، الأقدم أوّلاً. */
  openItems: readonly OpenItem[];
  /** أعمار المفتوح اليوم، وجهته (null بلا مفتوح). */
  aging: Aging & { side: 'debit' | 'credit' | null };
}

export interface StatementParty {
  id: string;
  name: string;
  phone: string | null;
  archived: boolean;
  version: number;
  isCustomer: boolean;
  isSupplier: boolean;
}

export interface PartyStatement {
  orgName: string;
  party: StatementParty;
  from: Day;
  to: Day;
  /** يوم الخادم: الأعمار والمفتوح محسوبة له. */
  today: Day;
  books: readonly StatementBook[];
}

const SIDES = ['debit', 'credit'] as const;

function parseLine(value: unknown): StatementLine {
  const row = object(value, 'lines');
  return {
    entryId: str(row, 'entry_id'),
    seq: str(row, 'seq'),
    onDate: str(row, 'on_date'),
    kind: entryKind(row),
    docKind: optStr(row, 'doc_kind'),
    docId: optStr(row, 'doc_id'),
    docNo: optStr(row, 'doc_no'),
    reason: optStr(row, 'reason'),
    reverses: optStr(row, 'reverses'),
    reversed: flag(row, 'reversed'),
    debit: fils(row, 'debit'),
    credit: fils(row, 'credit'),
    balance: fils(row, 'balance'),
    account: optNamed(row.account, 'account'),
    voucherId: optStr(row, 'voucher_id'),
    detail: parseDetail(row.detail),
    allocations: list(row.allocations, 'allocations').map(parseAllocation),
    unallocated: fils(row, 'unallocated'),
  };
}

function parseOpenItem(value: unknown): OpenItem {
  const row = object(value, 'open_items');
  return {
    entryId: str(row, 'entry_id'),
    onDate: str(row, 'on_date'),
    kind: entryKind(row),
    docKind: optStr(row, 'doc_kind'),
    docId: optStr(row, 'doc_id'),
    docNo: optStr(row, 'doc_no'),
    amount: fils(row, 'amount'),
    settled: fils(row, 'settled'),
    remaining: fils(row, 'remaining'),
    ageDays: whole(row, 'age_days'),
    side: oneOf(row, 'side', SIDES),
  };
}

export function parseParty(value: unknown): StatementParty {
  const party = object(value, 'party');
  return {
    id: str(party, 'id'),
    name: str(party, 'name'),
    phone: optStr(party, 'phone'),
    archived: flag(party, 'archived'),
    version: whole(party, 'version'),
    isCustomer: flag(party, 'is_customer'),
    isSupplier: flag(party, 'is_supplier'),
  };
}

const orgName = (json: Row): string => str(object(json.org, 'org'), 'name');

export function parsePartyStatement(value: unknown): PartyStatement {
  const json = object(value, 'party_statement_v2');
  return {
    orgName: orgName(json),
    party: parseParty(json.party),
    from: str(json, 'from'),
    to: str(json, 'to'),
    today: str(json, 'today'),
    books: list(json.books, 'books').map((item): StatementBook => {
      const row = object(item, 'books');
      const aging = object(row.aging, 'aging');
      return {
        bookId: str(row, 'book_id'),
        code: oneOf(row, 'code', BOOK_CODES),
        name: str(row, 'name'),
        divisionId: str(row, 'division_id'),
        divisionKind: divisionKind(row),
        broughtForward: fils(row, 'brought_forward'),
        totalDebit: fils(row, 'total_debit'),
        totalCredit: fils(row, 'total_credit'),
        closing: fils(row, 'closing'),
        lines: list(row.lines, 'lines').map(parseLine),
        openItems: list(row.open_items, 'open_items').map(parseOpenItem),
        aging: { ...parseAging(aging), side: aging.side === null || aging.side === undefined ? null : oneOf(aging, 'side', SIDES) },
      };
    }),
  };
}

/** كشف الجهة: دفتر واحد (bookId) أو كلّ دفاتر نطاقه التي لها فيها قيد؛ to = null لحدّ يوم الخادم. */
export async function loadPartyStatement(partyId: string, bookId: string | null, from: Day, to: Day | null): Promise<PartyStatement> {
  return parsePartyStatement(await call<unknown>('party_statement_v2', { p_party: partyId, p_book: bookId, p_from: from, p_to: to }));
}

// ─── السندات (§4.5 و§4.6) ───────────────────────────────────────────────────────────────────────────────────

export interface VoidMark {
  onDate: Day;
  reason: string;
  /** اسم العضو الذي ألغاه، أو null. */
  by: string | null;
}

const parseVoid = (value: unknown): VoidMark | null => {
  if (value === null || value === undefined) return null;
  const row = object(value, 'void');
  return { onDate: str(row, 'on_date'), reason: str(row, 'reason'), by: optStr(row, 'by') };
};

export interface CashBox {
  id: string;
  name: string;
  kind: CashKind;
}

const cashBox = (value: unknown, field: string): CashBox => {
  const row = object(value, field);
  return { id: str(row, 'id'), name: str(row, 'name'), kind: oneOf(row, 'kind', CASH_KINDS) };
};

export interface VoucherDetail {
  orgName: string;
  entryId: string;
  /** receipt: سند قبض (RC)، payment: سند صرف (PY). */
  type: 'receipt' | 'payment';
  docNo: string;
  onDate: Day;
  party: { id: string; name: string; phone: string | null };
  book: { id: string; code: BookCode; name: string; divisionKind: DivisionKind };
  amount: Fils;
  account: CashBox;
  /** فارغة للملغى (الإلغاء فكّ توزيعه). */
  allocations: readonly Allocation[];
  unallocated: Fils;
  postedBy: string | null;
  postedAt: string;
  void: VoidMark | null;
}

export function parseVoucher(value: unknown): VoucherDetail {
  const json = object(value, 'voucher_detail');
  const party = object(json.party, 'party');
  const book = object(json.book, 'book');
  return {
    orgName: orgName(json),
    entryId: str(json, 'entry_id'),
    type: oneOf(json, 'type', ['receipt', 'payment'] as const),
    docNo: str(json, 'doc_no'),
    onDate: str(json, 'on_date'),
    party: { id: str(party, 'id'), name: str(party, 'name'), phone: optStr(party, 'phone') },
    book: { id: str(book, 'id'), code: oneOf(book, 'code', BOOK_CODES), name: str(book, 'name'), divisionKind: divisionKind(book) },
    amount: fils(json, 'amount'),
    account: cashBox(json.account, 'account'),
    allocations: list(json.allocations, 'allocations').map(parseAllocation),
    unallocated: fils(json, 'unallocated'),
    postedBy: optStr(json, 'posted_by'),
    postedAt: str(json, 'posted_at'),
    void: parseVoid(json.void),
  };
}

/** سند قبض أو صرف بقيده (قيد الإلغاء يوصل إلى أصله بالخادم). */
export async function loadVoucher(entryId: string): Promise<VoucherDetail> {
  return parseVoucher(await call<unknown>('voucher_detail', { p_entry: entryId }));
}

export interface TransferDetail {
  orgName: string;
  id: string;
  onDate: Day;
  from: CashBox;
  to: CashBox;
  amount: Fils;
  note: string | null;
  postedBy: string | null;
  postedAt: string;
  void: VoidMark | null;
}

export function parseTransfer(value: unknown): TransferDetail {
  const json = object(value, 'transfer_detail');
  return {
    orgName: orgName(json),
    id: str(json, 'id'),
    onDate: str(json, 'on_date'),
    from: cashBox(json.from, 'from'),
    to: cashBox(json.to, 'to'),
    amount: fils(json, 'amount'),
    note: optStr(json, 'note'),
    postedBy: optStr(json, 'posted_by'),
    postedAt: str(json, 'posted_at'),
    void: parseVoid(json.void),
  };
}

/** سند التحويل بين صندوقين بمعرّف التحويل (بلا رقم: الترقيم مؤجّل، العقد §1). */
export async function loadTransfer(id: string): Promise<TransferDetail> {
  return parseTransfer(await call<unknown>('transfer_detail', { p_id: id }));
}

// ─── صفحة البيع (sale_detail، 0021) ───────────────────────────────────────────────────────────────────────────

export interface SaleDraw {
  lotId: string;
  receivedOn: Day;
  expiryOn: Day | null;
  qty: Milli;
  /** قيمة ما سُحب من الوجبة: لأدوار الكلفة وحدها (cost.money يغيب لغيرها). */
  value: Fils | null;
}

export interface SaleDoc {
  id: string;
  docNo: string;
  status: DocStatus;
  soldOn: Day;
  /** نقداً ثمّ رُدّ مقبوضه يُقرأ بالدين (payment_refunded يقول ذلك). */
  payment: SalePayment;
  paymentRefunded: boolean;
  partyId: string;
  partyName: string;
  warehouseId: string;
  warehouseName: string;
  bookId: string;
  cashAccountId: string | null;
  lineId: string;
  itemId: string;
  itemName: string;
  qty: Milli;
  baseUnit: BaseUnit;
  /** تسليم بلا مقابل (المبلغ صفر). */
  free: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  /** null إذا أخفى الخادم المال. */
  money: { unitPrice: Fils; lineTotal: Fils; paidNow: Fils } | null;
  /** الكلفة والربح لأدوار الكلفة وحدها. */
  cost: { cost: Fils; profit: Fils } | null;
  canVoid: boolean;
  draws: readonly SaleDraw[];
  invoiceEntryId: string | null;
  paymentEntryId: string | null;
  cashMoveId: string | null;
  paymentReversed: boolean;
}

/** cost.money إن حضرت (strip_cost يحذف money لغير أدوار الكلفة ويُبقي cost كائناً فارغاً). */
const costMoney = (row: Row): Row | null => {
  if (row.cost === null || row.cost === undefined) return null;
  const money = object(row.cost, 'cost').money;
  return money === null || money === undefined ? null : object(money, 'cost.money');
};

export function parseSaleDoc(value: unknown): SaleDoc {
  const json = object(value, 'sale_detail');
  const money = json.money === null || json.money === undefined ? null : object(json.money, 'money');
  const cost = costMoney(json);
  return {
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    status: oneOf(json, 'status', STATUSES),
    soldOn: str(json, 'sold_on'),
    payment: oneOf(json, 'payment', PAYMENTS),
    paymentRefunded: flag(json, 'payment_refunded'),
    partyId: str(json, 'party_id'),
    partyName: str(json, 'party_name'),
    warehouseId: str(json, 'warehouse_id'),
    warehouseName: str(json, 'warehouse_name'),
    bookId: str(json, 'book_id'),
    cashAccountId: optStr(json, 'cash_account_id'),
    lineId: str(json, 'line_id'),
    itemId: str(json, 'item_id'),
    itemName: str(json, 'item_name'),
    qty: qty(json, 'qty'),
    baseUnit: oneOf(json, 'base_unit', BASE_UNITS),
    free: flag(json, 'free'),
    voidedAt: optStr(json, 'voided_at'),
    voidReason: optStr(json, 'void_reason'),
    money: money ? { unitPrice: fils(money, 'unit_price'), lineTotal: fils(money, 'line_total'), paidNow: fils(money, 'paid_now') } : null,
    cost: cost ? { cost: fils(cost, 'cost'), profit: fils(cost, 'profit') } : null,
    canVoid: flag(json, 'can_void'),
    draws: list(json.draws, 'draws').map((item) => {
      const draw = object(item, 'draws');
      const drawCost = costMoney(draw);
      return { lotId: str(draw, 'lot_id'), receivedOn: str(draw, 'received_on'), expiryOn: optStr(draw, 'expiry_on'), qty: qty(draw, 'qty'), value: drawCost ? fils(drawCost, 'value') : null };
    }),
    invoiceEntryId: optStr(json, 'invoice_entry_id'),
    paymentEntryId: optStr(json, 'payment_entry_id'),
    cashMoveId: optStr(json, 'cash_move_id'),
    paymentReversed: flag(json, 'payment_reversed'),
  };
}

/** فاتورة البيع للقراءة (رابطها من الكشف وحركة الأموال، العقد §5). */
export async function loadSaleDoc(saleId: string): Promise<SaleDoc> {
  return parseSaleDoc(await call<unknown>('sale_detail', { p_sale: saleId }));
}
