import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { FILS_PER_DINAR, type Fils, type Milli } from '../../domain/money';
import type { WeighMethod } from '../../domain/weighTicket';
import { call } from './core';
import './constraints-birdsales';
import { parseSalesOverview, parseSalesReport, type SalesGroup, type SalesOverview, type SalesReport } from './purchases';
import { parseWeighTicket, type WeighTicket } from './weighTickets';

// فاتورة الطيور BR (0028، كلمة المالك 2026-11-12 وأجوبته O1 وO6–O10، العقد §4.4–§4.5 و§5.4–§5.5 و§6): نموذج الفاتورة لتذكرة مكتملة (bird_sale_form)،
// و«أصدر الفاتورة» نداء واحد (record_bird_sale: قيد على التاجر في دفتر وحدة اللاحم، و«المقبوض الآن» إلى صندوق، وتخرج الطيور من القاعات)، والفاتورة للقراءة
// والطباعة (bird_sale_detail)، وإلغاؤها للمدير (void_bird_sale: تعود الطيور حيّة، والمقبوض يبقى رصيداً للتاجر)، ومفتاحا birds في قائمة المبيعات وتقريرها
// (المفاتيح القديمة بشكلها ومعناها، D11؛ وخادم قبل 0028 بلا المفتاح فيُقرأ null). المال نصوص عشرية بالدينار ← Fils، والكيلو بثلاث مراتب ← Milli،
// والعدد رقم صحيح، والغائب null لا صفر. والطلب الذي لا تُعرف نتيجته يبقى خارج المكوّن (sessionStorage بمفتاح المستخدم والمنشأة والتذكرة، والذاكرة إن
// تعذّر): الرجوع والعودة أو إعادة التحميل تعيد الشاشة مجمَّدة به، والإعادة به حرفاً (درس 2026-11-10). ووحدة صفحات (write-guard): تستوردها صفحات
// المبيعات وحدها، وrepo/index لا يصدّرها.

export class BirdSaleShapeError extends Error {
  constructor(readonly field: string) {
    super(`bird_sale_shape:${field}`);
    this.name = 'BirdSaleShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BirdSaleShapeError(field);
  return value as Row;
};
const optRecord = (value: unknown, field: string): Row | null => (value === null || value === undefined ? null : record(value, field));
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new BirdSaleShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new BirdSaleShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new BirdSaleShapeError(field);
  return value;
};
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new BirdSaleShapeError(field);
  return row[field] as boolean;
};
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  const value = row[field];
  if (!allowed.includes(value as T)) throw new BirdSaleShapeError(field);
  return value as T;
};
const optScaled = (row: Row, field: string, scale: number): bigint | null => {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, scale);
  if (value === null) throw new BirdSaleShapeError(field);
  return toScale(value, scale);
};
const scaled = (row: Row, field: string, scale: number): bigint => {
  const value = optScaled(row, field, scale);
  if (value === null) throw new BirdSaleShapeError(field);
  return value;
};
/** مبلغ (نصّ عشري بالدينار) بالفلس. */
const fils = (row: Row, field: string): Fils => scaled(row, field, 2);
const optFils = (row: Row, field: string): Fils | null => optScaled(row, field, 2);
/** منطقيّ اختياريّ: غيابه (خادم قبل المفتاح) = fallback. */
const optFlag = (row: Row, field: string, fallback: boolean): boolean => (row[field] === null || row[field] === undefined ? fallback : flag(row, field));
/** كيلوغرام (نصّ عشري بثلاث مراتب) بالآلاف. */
const kg = (row: Row, field: string): Milli => scaled(row, field, 3);
const optKg = (row: Row, field: string): Milli | null => optScaled(row, field, 3);

export const BIRD_SALE_STATUSES = ['posted', 'void'] as const;
export type BirdSaleStatus = (typeof BIRD_SALE_STATUSES)[number];
const METHODS: readonly WeighMethod[] = ['scale', 'crates'];

// ─── الفاتورة (bird_sale_result، العقد §5.5) ────────────────────────────────────────────────────────────────────────

/** حصّة فوج (قاعة من التذكرة) من الفاتورة: طيوره وصافيه، وإيراده بأكبر الباقي بصافي قاعته. */
export interface BirdSaleSource {
  stopId: string;
  flockId: string;
  hallId: string;
  hallName: string;
  birds: number;
  netKg: Milli;
  avgKg: Milli | null;
  /** null بلا money (القناع لمن لا يرى المال). */
  revenue: Fils | null;
}

export interface BirdSaleMoney {
  /** سعر الكيلو بالفلس. */
  unitPrice: Fils;
  /** مبلغ الفاتورة بالدينار الصحيح. */
  total: Fils;
  /** المقبوض الآن بالدينار الصحيح (صفر: بالدين كلّه). */
  paidNow: Fils;
}

export interface BirdSale {
  id: string;
  docNo: string;
  status: BirdSaleStatus;
  /** يوم الفاتورة كما يرسله الخادم في sold_on (D3: يوم التذكرة؛ والمتأخّرة بقاعدة on أدناه). */
  soldOn: Day;
  /**
   * أجوبة المالك 2026-11-13 (مراجعة 0028 O4): on يوم الفاتورة (اليوم للتذكرة الأقدم من سبعة أيّام)، وticketOn يوم التذكرة (تخرج الطيور من القاعات به)، وpaidOn
   * يوم دخول المقبوض الصندوق (يوم إصدار الفاتورة). وخادم قبلها بلا المفاتيح: الثلاثة يوم الفاتورة sold_on (كما كان).
   */
  on: Day;
  ticketOn: Day;
  paidOn: Day;
  /** المقبوض عند البيع رُدّ للتاجر («ألغِ القبض»، مراجعة 0028 M3): الخادم يقرؤه بالدين (المقبوض صفر)؛ وخادم قبلها false. */
  paymentRefunded: boolean;
  ticketId: string;
  ticketNo: string;
  siteId: string;
  siteName: string;
  partyId: string;
  partyName: string;
  bookId: string;
  birds: number;
  netKg: Milli;
  /** الوزن المحسوب بعد التنزيل (القاعدة 26). */
  billedKg: Milli;
  /** نسبة التنزيل بالمئات من الواحد بالمئة (0.50٪ = 50). */
  deduction: bigint;
  avgKg: Milli | null;
  cashAccountId: string | null;
  accountName: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  sources: readonly BirdSaleSource[];
  /** null لمن لا يرى المال (القناع). */
  money: BirdSaleMoney | null;
}

const saleMoney = (row: Row): BirdSaleMoney | null => {
  const money = optRecord(row.money, 'money');
  return money ? { unitPrice: fils(money, 'unit_price'), total: fils(money, 'total'), paidNow: fils(money, 'paid_now') } : null;
};

export function parseBirdSale(value: unknown): BirdSale {
  const json = record(value, 'bird_sale');
  const soldOn = str(json, 'sold_on');
  const on = optStr(json, 'on') ?? soldOn;
  return {
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    status: oneOf(json, 'status', BIRD_SALE_STATUSES),
    soldOn,
    on,
    ticketOn: optStr(json, 'ticket_on') ?? on,
    paidOn: optStr(json, 'paid_on') ?? on,
    paymentRefunded: optFlag(json, 'payment_refunded', false),
    ticketId: str(json, 'ticket_id'),
    ticketNo: str(json, 'ticket_no'),
    siteId: str(json, 'site_id'),
    siteName: str(json, 'site_name'),
    partyId: str(json, 'party_id'),
    partyName: str(json, 'party_name'),
    bookId: str(json, 'book_id'),
    birds: int(json, 'birds'),
    netKg: kg(json, 'net_kg'),
    billedKg: kg(json, 'billed_kg'),
    deduction: scaled(json, 'deduction_pct', 2),
    avgKg: optKg(json, 'avg_kg'),
    cashAccountId: optStr(json, 'cash_account_id'),
    accountName: optStr(json, 'account_name'),
    note: optStr(json, 'note'),
    voidedAt: optStr(json, 'voided_at'),
    voidReason: optStr(json, 'void_reason'),
    sources: list(json.sources, 'sources').map((row) => {
      const money = optRecord(row.money, 'money');
      return {
        stopId: str(row, 'stop_id'),
        flockId: str(row, 'flock_id'),
        hallId: str(row, 'hall_id'),
        hallName: str(row, 'hall_name'),
        birds: int(row, 'birds'),
        netKg: kg(row, 'net_kg'),
        avgKg: optKg(row, 'avg_kg'),
        revenue: money ? fils(money, 'revenue') : null,
      };
    }),
    money: saleMoney(json),
  };
}

// ─── الفاتورة للقراءة والطباعة (bird_sale_detail، العقد §5.5) ─────────────────────────────────────────────────────────

export interface BirdSaleDetail extends BirdSale {
  ticket: { ticketNo: string; vehicle: string | null; driver: string | null; method: WeighMethod };
  partyPhone: string | null;
  /** المتبقّي من قيد الفاتورة على التاجر اليوم (بعد ما سُدّد منه). */
  remaining: Fils | null;
  /** المقبوض الباقي رصيداً للتاجر بعد الإلغاء (FOUNDATION ٥٨٣)، أو null. */
  paymentKept: Fils | null;
  /** يوم الإلغاء بيوم الخادم (يوم قيد الإلغاء العكسيّ، مراجعة 0028 S9)، أو null (غير ملغاة، أو خادم قبله). */
  voidedOn: Day | null;
  /** تُلغى: فعل الإلغاء، ومرحَّلة، ولا فوج من أفواجها مغلق. */
  canVoid: boolean;
}

export function parseBirdSaleDetail(value: unknown): BirdSaleDetail {
  const json = record(value, 'bird_sale_detail');
  const ticket = record(json.ticket, 'ticket');
  return {
    ...parseBirdSale(json),
    ticket: { ticketNo: str(ticket, 'ticket_no'), vehicle: optStr(ticket, 'vehicle'), driver: optStr(ticket, 'driver'), method: oneOf(ticket, 'method', METHODS) },
    partyPhone: optStr(json, 'party_phone'),
    remaining: optFils(json, 'remaining'),
    paymentKept: optFils(json, 'payment_kept'),
    voidedOn: optStr(json, 'voided_on'),
    canVoid: flag(json, 'can_void'),
  };
}

export async function loadBirdSaleDetail(saleId: string): Promise<BirdSaleDetail> {
  return parseBirdSaleDetail(await call<unknown>('bird_sale_detail', { p_sale: saleId }));
}

// ─── نموذج الفاتورة (bird_sale_form، العقد §5.4) ─────────────────────────────────────────────────────────────────────

/** لماذا لا تصدر فاتورة للتذكرة: مسوّدة، أو ملغاة، أو صدرت فاتورتها، أو فوج من أفواجها مغلق، أو لا دفتر لوحدة الحقل. */
// مراجعة 0028 O4: والدفتر خارج نطاق القارئ، والفترة المقفلة: لا يُعرض ترحيل يرفضه الخادم. وtoo_old (الفاتورة بيوم تذكرتها ولا أقدم من سبعة أيّام) من
// خادم قبل أجوبة المالك 2026-11-13؛ بعدها التذكرة الأقدم تُفوتَر بتاريخ اليوم (late) ولا ترفض.
export const FORM_WHY = ['draft', 'void', 'invoiced', 'flock_closed', 'no_book', 'out_of_scope', 'period_locked', 'too_old'] as const;
export type FormWhy = (typeof FORM_WHY)[number];

/** قاعة من التذكرة بحيّها الآن: over_live = طيور التذكرة أكثر من الحيّ (الخادم يرفض الفاتورة birds_over_live). */
export interface FormFlock {
  stopId: string;
  hallName: string;
  flockId: string;
  live: number;
  birds: number;
  overLive: boolean;
}

export interface BirdSaleForm {
  /** التذكرة كما في weigh_ticket (العقد §5.1) بلا أفعالها. */
  ticket: WeighTicket;
  invoiceable: boolean;
  why: FormWhy | null;
  /** الدفتر الرئيسي لوحدة الحقل (الفاتورة تُكتب فيه)، أو null بلاه. */
  book: { id: string; name: string } | null;
  flocks: readonly FormFlock[];
  /** سعر الكيلو في آخر فاتورة طيور مرحّلة، أو null. */
  suggestedPrice: Fils | null;
  /** فاتورة التذكرة المرحّلة إن صدرت. */
  sale: BirdSale | null;
  today: Day;
  canPost: boolean;
  /**
   * أجوبة المالك 2026-11-13 (O4): التذكرة أقدم من سبعة أيّام (late) فتُكتب فاتورتها بتاريخ اليوم (invoiceOn) وتخرج الطيور من القاعات بيوم التذكرة،
   * والمقبوض الآن يدخل الصندوق يوم إصدار الفاتورة (paidOn). وخادم قبلها: الفاتورة والمقبوض بيوم التذكرة، وlate = false.
   */
  invoiceOn: Day;
  late: boolean;
  paidOn: Day;
}

/** نموذج الفاتورة يحمل التذكرة بلا أفعالها (العقد §5.4: «5.1 without can»): محلّل التذكرة نفسه بأفعال لا تُعرض هنا. */
const NO_TICKET_ACTIONS = { edit: false, finish: false, void: false, invoice: false } as const;

export function parseBirdSaleForm(value: unknown): BirdSaleForm {
  const json = record(value, 'bird_sale_form');
  const ticket = record(json.ticket, 'ticket');
  const book = optRecord(json.book, 'book');
  const parsed = parseWeighTicket(ticket.can === undefined ? { ...ticket, can: NO_TICKET_ACTIONS } : ticket);
  const invoiceOn = optStr(json, 'invoice_on') ?? parsed.onDate;
  return {
    ticket: parsed,
    invoiceable: flag(json, 'invoiceable'),
    why: json.why === null || json.why === undefined ? null : oneOf(json, 'why', FORM_WHY),
    book: book ? { id: str(book, 'id'), name: str(book, 'name') } : null,
    flocks: list(json.flocks, 'flocks').map((row) => ({
      stopId: str(row, 'stop_id'),
      hallName: str(row, 'hall_name'),
      flockId: str(row, 'flock_id'),
      live: int(row, 'live'),
      birds: int(row, 'birds'),
      overLive: flag(row, 'over_live'),
    })),
    suggestedPrice: optFils(json, 'suggested_price'),
    sale: json.sale === null || json.sale === undefined ? null : parseBirdSale(json.sale),
    today: str(json, 'today'),
    canPost: flag(json, 'can_post'),
    invoiceOn,
    late: optFlag(json, 'late', false),
    paidOn: optStr(json, 'paid_on') ?? invoiceOn,
  };
}

export async function loadBirdSaleForm(ticketId: string): Promise<BirdSaleForm> {
  return parseBirdSaleForm(await call<unknown>('bird_sale_form', { p_ticket: ticketId }));
}

// ─── «أصدر الفاتورة» (record_bird_sale، العقد §4.4) ──────────────────────────────────────────────────────────────────

/** الطلب كما يُرسل: المعرّفان والمرجع من الجهاز مرّة لكلّ فاتورة، ونسخة التذكرة التي رآها المحاسب شرطاً. */
export interface BirdSaleRequest {
  clientRef: string;
  saleId: string;
  ticketId: string;
  ticketVersion: number;
  partyId: string;
  /** سعر الكيلو بالفلس (مرتبتان). */
  unitPrice: Fils;
  /** نسبة التنزيل بالمئات من الواحد بالمئة (0 إلى 1,000 = 10٪). */
  deduction: bigint;
  /** المقبوض الآن بالدينار الصحيح (بالفلس)؛ صفر: بالدين كلّه. */
  paidNow: Fils;
  /** صندوق المقبوض، أو null بلا مقبوض. */
  cashAccountId: string | null;
  note: string | null;
}

/**
 * «أصدر الفاتورة» بنداء واحد بمفاتيح العقد بالضبط: الإعادة بالطلب نفسه ترسل النصّ نفسه (المرجع ببصمة معطياته)، فالمبالغ نصوص ثابتة المراتب (السعر
 * والنسبة بمرتبتين، والمقبوض بالدينار الصحيح)، والصندوق مع المقبوض وحده.
 */
export async function recordBirdSale(request: BirdSaleRequest): Promise<BirdSale> {
  if (request.paidNow % FILS_PER_DINAR !== 0n) throw new RangeError('paid_not_whole');
  return parseBirdSale(
    await call<unknown>('record_bird_sale', {
      p_client_ref: request.clientRef,
      p_sale_id: request.saleId,
      p_ticket: request.ticketId,
      p_ticket_version: request.ticketVersion,
      p_party: request.partyId,
      p_unit_price: decimalText(request.unitPrice, 2),
      p_deduction_pct: decimalText(request.deduction, 2),
      p_paid_now: decimalText(request.paidNow / FILS_PER_DINAR, 0),
      p_cash_account: request.paidNow > 0n ? request.cashAccountId : null,
      p_note: request.note,
    }),
  );
}

// ─── إلغاء الفاتورة (void_bird_sale، العقد §4.5) ─────────────────────────────────────────────────────────────────────

export interface VoidedBirdSale {
  id: string;
  docNo: string;
  voidedOn: Day;
  partyId: string;
  /** قيد المقبوض الباقي رصيداً للتاجر، أو null. */
  paymentEntryId: string | null;
  /** null لمن لا يرى المال (القناع). */
  total: Fils | null;
  paymentKept: Fils | null;
}

export function parseVoidedBirdSale(value: unknown): VoidedBirdSale {
  const json = record(value, 'void_bird_sale');
  oneOf(json, 'status', ['void'] as const);
  const money = optRecord(json.money, 'money');
  return {
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    voidedOn: str(json, 'voided_on'),
    partyId: str(json, 'party_id'),
    paymentEntryId: optStr(json, 'payment_entry_id'),
    total: money ? fils(money, 'total') : null,
    paymentKept: money ? fils(money, 'payment_kept') : null,
  };
}

/** الإلغاء بسبب (المدير): الطيور تعود حيّة، وقيد الفاتورة يُعكس، والمقبوض يبقى رصيداً للتاجر. */
export async function voidBirdSale(clientRef: string, saleId: string, reason: string): Promise<VoidedBirdSale> {
  return parseVoidedBirdSale(await call<unknown>('void_bird_sale', { p_sale_id: saleId, p_reason: reason.trim(), p_client_ref: clientRef }));
}

// ─── فواتير الطيور في قائمة المبيعات وتقريرها (مفتاح birds، العقد §6) ─────────────────────────────────────────────────

/** الدفع: بالدين كلّه، أو جزء مقبوض، أو مقبوض كلّه. */
export const BIRD_PAID = ['credit', 'partial', 'cash'] as const;
export type BirdPaid = (typeof BIRD_PAID)[number];

export interface BirdSaleRow {
  id: string;
  docNo: string;
  soldOn: Day;
  status: BirdSaleStatus;
  partyId: string;
  partyName: string;
  siteId: string;
  siteName: string;
  ticketId: string;
  ticketNo: string;
  birds: number;
  netKg: Milli;
  billedKg: Milli;
  deduction: bigint;
  paid: BirdPaid;
  /** المقبوض عند البيع رُدّ للتاجر (مراجعة 0028 M3): paid وmoney مصحَّحان من الخادم (بالدين)؛ وخادم قبلها false. */
  paymentRefunded: boolean;
  money: BirdSaleMoney | null;
}

/** تذكرة مكتملة بلا فاتورة مرحّلة (بلا مدّة، أحدث 100). */
export interface AwaitingTicket {
  ticketId: string;
  ticketNo: string;
  onDate: Day;
  siteName: string;
  birds: number;
  netKg: Milli;
  /**
   * تُصدر فاتورتها الآن (invoiceable)، ولماذا لا (why: الدفتر أو نطاقه أو الفترة المقفلة، مراجعة 0028 O4)، وهل هي أقدم من سبعة أيّام فتُؤرَّخ فاتورتها
   * اليوم (late، أجوبة المالك 2026-11-13). وخادم قبلها: تُصدر، بلا سبب، وlate = false.
   */
  invoiceable: boolean;
  why: FormWhy | null;
  late: boolean;
}

export interface BirdSalesSection {
  rows: readonly BirdSaleRow[];
  /** أكثر من الحدّ (1,000): المعروض أحدثها، والمجاميع للمدّة كلّها. */
  more: boolean;
  /** المرحَّل وحده (الملغى عدده في voided). */
  totals: { count: number; voided: number; birds: number; netKg: Milli; money: { revenue: Fils; paidNow: Fils; credit: Fils } | null };
  awaiting: readonly AwaitingTicket[];
  /** يصدر فواتير الطيور (sale.post). */
  canRecord: boolean;
}

/** مفتاح birds في sales_overview؛ خادم قبل 0028 بلاه: null. */
export function parseBirdSalesSection(value: unknown): BirdSalesSection | null {
  if (value === null || value === undefined) return null;
  const json = record(value, 'birds');
  const totals = record(json.totals, 'totals');
  const totalMoney = optRecord(totals.money, 'money');
  return {
    rows: list(json.rows, 'rows').map((row) => ({
      id: str(row, 'id'),
      docNo: str(row, 'doc_no'),
      soldOn: str(row, 'sold_on'),
      status: oneOf(row, 'status', BIRD_SALE_STATUSES),
      partyId: str(row, 'party_id'),
      partyName: str(row, 'party_name'),
      siteId: str(row, 'site_id'),
      siteName: str(row, 'site_name'),
      ticketId: str(row, 'ticket_id'),
      ticketNo: str(row, 'ticket_no'),
      birds: int(row, 'birds'),
      netKg: kg(row, 'net_kg'),
      billedKg: kg(row, 'billed_kg'),
      deduction: scaled(row, 'deduction_pct', 2),
      paid: oneOf(row, 'paid', BIRD_PAID),
      paymentRefunded: optFlag(row, 'payment_refunded', false),
      money: saleMoney(row),
    })),
    more: flag(json, 'more'),
    totals: {
      count: int(totals, 'count'),
      voided: int(totals, 'voided'),
      birds: int(totals, 'birds'),
      netKg: kg(totals, 'net_kg'),
      money: totalMoney ? { revenue: fils(totalMoney, 'revenue'), paidNow: fils(totalMoney, 'paid_now'), credit: fils(totalMoney, 'credit') } : null,
    },
    awaiting: list(json.awaiting, 'awaiting').map((row) => ({
      ticketId: str(row, 'ticket_id'),
      ticketNo: str(row, 'ticket_no'),
      onDate: str(row, 'on_date'),
      siteName: str(row, 'site_name'),
      birds: int(row, 'birds'),
      netKg: kg(row, 'net_kg'),
      invoiceable: optFlag(row, 'invoiceable', true),
      why: row.why === null || row.why === undefined ? null : oneOf(row, 'why', FORM_WHY),
      late: optFlag(row, 'late', false),
    })),
    canRecord: flag(json, 'can_record'),
  };
}

export interface BirdGroupRow {
  key: string;
  label: string;
  count: number;
  birds: number;
  netKg: Milli;
  revenue: Fils | null;
}

export interface BirdSalesGroups {
  rows: readonly BirdGroupRow[];
  totals: { count: number; birds: number; netKg: Milli; revenue: Fils | null };
}

/** مفتاح birds في sales_report (المرحَّل وحده مجمَّعاً بالتجميع نفسه)؛ خادم قبل 0028 بلاه: null. */
export function parseBirdSalesGroups(value: unknown): BirdSalesGroups | null {
  if (value === null || value === undefined) return null;
  const json = record(value, 'birds');
  const totals = record(json.totals, 'totals');
  const revenue = (row: Row): Fils | null => {
    const money = optRecord(row.money, 'money');
    return money ? fils(money, 'revenue') : null;
  };
  return {
    rows: list(json.rows, 'rows').map((row) => ({ key: str(row, 'key'), label: str(row, 'label'), count: int(row, 'count'), birds: int(row, 'birds'), netKg: kg(row, 'net_kg'), revenue: revenue(row) })),
    totals: { count: int(totals, 'count'), birds: int(totals, 'birds'), netKg: kg(totals, 'net_kg'), revenue: revenue(totals) },
  };
}

export interface SalesWithBirds extends SalesOverview {
  birds: BirdSalesSection | null;
}

/** قائمة المبيعات بفترة بنداء واحد (sales_overview): فواتير الموادّ كما كانت (purchases)، وفواتير الطيور وتذاكرها بانتظار الفاتورة. */
export async function loadSales(from: Day, to: Day): Promise<SalesWithBirds> {
  const json = await call<unknown>('sales_overview', { p_from: from, p_to: to });
  return { ...parseSalesOverview(json), birds: parseBirdSalesSection(record(json, 'sales_overview').birds) };
}

export interface SalesReportWithBirds extends SalesReport {
  birds: BirdSalesGroups | null;
}

/** تقرير المبيعات بنداء واحد (sales_report): الموادّ كما كانت، والطيور بالتجميع نفسه. */
export async function loadSalesReport(from: Day, to: Day, group: SalesGroup): Promise<SalesReportWithBirds> {
  const json = await call<unknown>('sales_report', { p_from: from, p_to: to, p_group: group });
  return { ...parseSalesReport(json), birds: parseBirdSalesGroups(record(json, 'sales_report').birds) };
}

// ─── الطلب المعلَّق (درس 2026-11-10) ─────────────────────────────────────────────────────────────────────────────────
// طلب record_bird_sale الذي لا تُعرف نتيجته (في الطريق، أو بعد نتيجة مجهولة) يبقى خارج المكوّن بمفتاح المستخدم والمنشأة والتذكرة: الرجوع ثمّ العودة
// (أو إعادة التحميل) تعيد الشاشة مجمَّدة بطلبها نفسه، والإعادة به وحده (لا فاتورة ثانية ولا طيور تخرج مرّتين). في sessionStorage (يبقى بعد إعادة
// التحميل في التبويب نفسه) وفي الذاكرة إن تعذّر، ويُمحى عند جواب نهائي (حُفظت، أو رفض أكيد).

/** الطلب كما أُرسل، ومعه ما رآه المحاسب في التأكيد للعرض وحده (لا يُرسل). */
export interface PendingBirdSale {
  request: BirdSaleRequest;
  ticketNo: string;
  partyName: string;
  boxName: string | null;
  /** مبلغ الفاتورة كما حسبته المرآة. */
  total: Fils;
  /** الطيور التي تخرج من كلّ قاعة. */
  halls: readonly { name: string; birds: number }[];
  /**
   * الأيّام كما قالها نموذج الفاتورة في التأكيد (أجوبة المالك 2026-11-13): يوم الفاتورة ويوم التذكرة (تخرج الطيور به) ويوم دخول المقبوض الصندوق، ويوم الخادم،
   * وهل التذكرة أقدم من سبعة أيّام. غيابه (طلب محفوظ قبلها) = الفاتورة بيوم التذكرة.
   */
  dates?: PendingDates;
}

export interface PendingDates {
  late: boolean;
  invoiceOn: Day;
  ticketOn: Day;
  paidOn: Day;
  today: Day;
}

const pendingMemory = new Map<string, string>();

/** مفتاح الطلب المعلَّق: المستخدم والمنشأة والتذكرة، فلا يعود طلب مستخدم لآخر في التبويب نفسه. */
export function birdSalePendingKey(userId: string, orgId: string, ticketId: string): string {
  return `sales.birds.pending:${userId}:${orgId}:${ticketId}`;
}

/** يحفظ الطلب المعلَّق (أو يمحوه بـnull) في sessionStorage، وفي الذاكرة إن تعذّر. */
export function storeBirdSalePending(key: string, pending: PendingBirdSale | null): void {
  if (key === '') return;
  const text = pending === null ? null : JSON.stringify(pending, (_field, entry: unknown) => (typeof entry === 'bigint' ? { big: String(entry) } : entry));
  if (text === null) pendingMemory.delete(key);
  else pendingMemory.set(key, text);
  try {
    if (text === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, text);
  } catch {
    // بلا sessionStorage (تصفّح خاصّ أو ممنوع): الذاكرة وحدها تحمي من الرجوع والعودة.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** طلب بشكل record_bird_sale كما كتبه storeBirdSalePending، وإلّا null (تخزين تالف أو من نسخة أخرى). */
function asPending(value: unknown): PendingBirdSale | null {
  if (!isRecord(value) || !isRecord(value.request) || typeof value.ticketNo !== 'string' || typeof value.partyName !== 'string' || typeof value.total !== 'bigint' || !Array.isArray(value.halls)) return null;
  const request = value.request;
  const texts = ['clientRef', 'saleId', 'ticketId', 'partyId'].every((field) => typeof request[field] === 'string' && request[field] !== '');
  const amounts = ['unitPrice', 'deduction', 'paidNow'].every((field) => typeof request[field] === 'bigint');
  const rest = typeof request.ticketVersion === 'number' && (request.cashAccountId === null || typeof request.cashAccountId === 'string') && (request.note === null || typeof request.note === 'string');
  const halls = value.halls.every((hall: unknown) => isRecord(hall) && typeof hall.name === 'string' && typeof hall.birds === 'number');
  const dates = value.dates;
  const datesOk =
    dates === undefined ||
    (isRecord(dates) && typeof dates.late === 'boolean' && ['invoiceOn', 'ticketOn', 'paidOn', 'today'].every((field) => typeof dates[field] === 'string' && dates[field] !== ''));
  return texts && amounts && rest && halls && datesOk && (value.boxName === null || typeof value.boxName === 'string') ? (value as unknown as PendingBirdSale) : null;
}

export function readBirdSalePending(key: string): PendingBirdSale | null {
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
  } catch { // swallow-ok: نصّ لم يكتبه storeBirdSalePending (تخزين تالف)؛ لا طلب معلَّق يُستعاد منه
    return null;
  }
}
