import type { Day } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import { DIVISION_KINDS, type DivisionKind } from '../../domain/divisions';
import type { Fils, Milli } from '../../domain/money';
import { CASH_KINDS, type CashKind } from './cash';
import { call } from './core';
import { filsOf, LedgerShapeError } from './parties';

// «المال بين يديك» (المرحلة 1 من خطّة المحاسبة، عقد 0024 §4.1 و§4.2 و§4.7): ثلاثة قرّاء بنداء واحد لكلّ واحد، كلّها بنطاق القارئ من
// الخادم — خلاصة المال (money_overview: النقد والذمم واليوم والشهر وأكبر خمسة والتنبيهات)، وحركة الأموال (money_moves: كلّ حركة نقدية بكلّ
// صندوق بفلاتر ومؤشّر صفحات مبهم يرجع كما هو، ويومية الصندوق نفسها نداء بيوم واحد)، وخلاصة الشهر التشغيلية (month_summary). ملف كسول
// تستورده صفحات pages/accounts/money مباشرةً (index ما يصدّره، فلا يدخل مسار الجلسة الحرج).
// المال نصّ عشريّ بالدينار ← Fils، والكمية نصّ بثلاث مراتب ← Milli، والتاريخ YYYY-MM-DD، والعدد رقم صحيح. المفتاح الذي قد تكون قيمته null
// بقصد (الكلفة لمن لا يرى الكلفة، والرصيد الجاري بفلتر نوع أو جهة) إلزاميّ الحضور: الغائب خطأ شكل، والـnull يُقرأ null (درس 0016).

type Row = Record<string, unknown>;

const object = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new LedgerShapeError(field);
  return value as Row;
};
const list = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new LedgerShapeError(field);
  return value;
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new LedgerShapeError(field);
  return value;
};
/** مفتاح إلزاميّ قد تكون قيمته null: null وحدها null، والغائب خطأ شكل. */
const present = (row: Row, field: string): void => {
  if (!(field in row)) throw new LedgerShapeError(field);
};
const optStr = (row: Row, field: string): string | null => {
  present(row, field);
  return row[field] === null ? null : str(row, field);
};
const flag = (row: Row, field: string): boolean => {
  const value = row[field];
  if (typeof value !== 'boolean') throw new LedgerShapeError(field);
  return value;
};
const whole = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new LedgerShapeError(field);
  return value;
};
const DAY_SHAPE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const day = (row: Row, field: string): Day => {
  const value = str(row, field);
  if (!DAY_SHAPE.test(value)) throw new LedgerShapeError(field);
  return value;
};
const optDay = (row: Row, field: string): Day | null => {
  present(row, field);
  return row[field] === null ? null : day(row, field);
};
const optFils = (row: Row, field: string): Fils | null => {
  present(row, field);
  return row[field] === null ? null : filsOf(row, field);
};
const qty = (row: Row, field: string): Milli => {
  const value = parseDecimal(str(row, field), 3);
  if (value === null) throw new LedgerShapeError(field);
  return toScale(value, 3);
};
const cashKind = (row: Row, field: string): CashKind => {
  const value = row[field];
  if (typeof value !== 'string' || !(CASH_KINDS as readonly string[]).includes(value)) throw new LedgerShapeError(field);
  return value as CashKind;
};
const divisionKind = (row: Row, field: string): DivisionKind => {
  const value = row[field];
  if (typeof value !== 'string' || !(DIVISION_KINDS as readonly string[]).includes(value)) throw new LedgerShapeError(field);
  return value as DivisionKind;
};

// ─── أصناف الحركة النقدية (العقد §5) ────────────────────────────────────────────────────────────────────────────

/** صنف الحركة النقدية بترتيبه الثابت (العقد §5): القارئ يرتّب «اليوم» به، والفلتر يقبله وحده (class_unknown لغيره). */
export type MoneyClass = 'customer_receipt' | 'cash_sale' | 'supplier_payment' | 'cash_purchase' | 'purchase_charge' | 'expense' | 'transfer' | 'opening' | 'other';
export const MONEY_CLASSES: readonly MoneyClass[] = ['customer_receipt', 'cash_sale', 'supplier_payment', 'cash_purchase', 'purchase_charge', 'expense', 'transfer', 'opening', 'other'];

const moneyClass = (row: Row, field: string): MoneyClass => {
  const value = row[field];
  if (typeof value !== 'string' || !(MONEY_CLASSES as readonly string[]).includes(value)) throw new LedgerShapeError(field);
  return value as MoneyClass;
};

// ─── الكتل المشتركة: المبيعات والمشتريات والمصاريف والتدفّق ─────────────────────────────────────────────────────

export interface SalesBlock {
  count: number;
  revenue: Fils;
  /** null لمن لا يرى الكلفة (can_see_cost). */
  cost: Fils | null;
  gross: Fils | null;
}

export interface PurchasesBlock {
  count: number;
  total: Fils;
  /** المدفوع عند الشراء وأجوره النقدية. */
  cash: Fils;
  /** الباقي بالدين. */
  credit: Fils;
}

export interface ExpenseCategoryAmount {
  categoryId: string;
  name: string;
  amount: Fils;
}

export interface ExpensesBlock {
  total: Fils;
  categories: readonly ExpenseCategoryAmount[];
}

/** النقد الداخل والخارج بلا التحويل بين الصناديق ولا الرصيد عند البداية. */
export interface CashFlow {
  inflow: Fils;
  outflow: Fils;
  net: Fils;
}

const salesBlock = (value: unknown, field: string): SalesBlock => {
  const row = object(value, field);
  return { count: whole(row, 'count'), revenue: filsOf(row, 'revenue'), cost: optFils(row, 'cost'), gross: optFils(row, 'gross') };
};
const purchasesBlock = (value: unknown, field: string): PurchasesBlock => {
  const row = object(value, field);
  return { count: whole(row, 'count'), total: filsOf(row, 'total'), cash: filsOf(row, 'cash'), credit: filsOf(row, 'credit') };
};
const expensesBlock = (value: unknown, field: string): ExpensesBlock => {
  const row = object(value, field);
  return {
    total: filsOf(row, 'total'),
    categories: list(row.categories, 'categories').map((item) => {
      const category = object(item, 'categories');
      return { categoryId: str(category, 'category_id'), name: str(category, 'name'), amount: filsOf(category, 'amount') };
    }),
  };
};
const cashFlow = (value: unknown, field: string): CashFlow => {
  const row = object(value, field);
  return { inflow: filsOf(row, 'inflow'), outflow: filsOf(row, 'outflow'), net: filsOf(row, 'net') };
};

// ─── خلاصة المال (money_overview، العقد §4.1) ──────────────────────────────────────────────────────────────────

export interface MoneyBox {
  accountId: string;
  name: string;
  kind: CashKind;
  archived: boolean;
  /** رصيد اليوم؛ السالب مسموح ويّا تنبيه ظاهر (Q10). */
  balance: Fils;
}

export interface DivisionDebts {
  divisionId: string;
  kind: DivisionKind;
  receivable: Fils;
  payable: Fils;
}

export interface ClassTotals {
  cls: MoneyClass;
  inflow: Fils;
  outflow: Fils;
  count: number;
}

export interface TopParty {
  partyId: string;
  name: string;
  phone: string | null;
  amount: Fils;
  /** أقدم دين مفتوح بهذه الجهة من الطرف نفسه، أو null. */
  oldest: Day | null;
}

export interface OldDebts {
  parties: number;
  amount: Fils;
}

export interface MoneyOverview {
  today: Day;
  monthFrom: Day;
  cash: { total: Fils; boxes: readonly MoneyBox[] };
  debts: { receivable: Fils; payable: Fils; net: Fils; divisions: readonly DivisionDebts[]; visibleBooks: number; totalBooks: number };
  day: { inflow: Fils; outflow: Fils; classes: readonly ClassTotals[] };
  month: { sales: SalesBlock; purchases: PurchasesBlock; expenses: ExpensesBlock; cash: CashFlow };
  topReceivable: readonly TopParty[];
  topPayable: readonly TopParty[];
  alerts: { negativeBoxes: readonly { accountId: string; name: string; balance: Fils }[]; oldReceivable: OldDebts; oldPayable: OldDebts };
}

const topParties = (value: unknown, field: string): TopParty[] =>
  list(value, field).map((item) => {
    const row = object(item, field);
    return { partyId: str(row, 'party_id'), name: str(row, 'name'), phone: optStr(row, 'phone'), amount: filsOf(row, 'amount'), oldest: optDay(row, 'oldest') };
  });
const oldDebts = (value: unknown, field: string): OldDebts => {
  const row = object(value, field);
  return { parties: whole(row, 'parties'), amount: filsOf(row, 'amount') };
};

export function parseMoneyOverview(value: unknown): MoneyOverview {
  const json = object(value, 'money_overview');
  const cash = object(json.cash, 'cash');
  const debts = object(json.debts, 'debts');
  const books = object(debts.books, 'books');
  const today = object(json.day, 'day');
  const month = object(json.month, 'month');
  const alerts = object(json.alerts, 'alerts');
  return {
    today: day(json, 'today'),
    monthFrom: day(json, 'month_from'),
    cash: {
      total: filsOf(cash, 'total'),
      boxes: list(cash.boxes, 'boxes').map((item) => {
        const row = object(item, 'boxes');
        return { accountId: str(row, 'account_id'), name: str(row, 'name'), kind: cashKind(row, 'kind'), archived: flag(row, 'archived'), balance: filsOf(row, 'balance') };
      }),
    },
    debts: {
      receivable: filsOf(debts, 'receivable'),
      payable: filsOf(debts, 'payable'),
      net: filsOf(debts, 'net'),
      divisions: list(debts.divisions, 'divisions').map((item) => {
        const row = object(item, 'divisions');
        return { divisionId: str(row, 'division_id'), kind: divisionKind(row, 'kind'), receivable: filsOf(row, 'receivable'), payable: filsOf(row, 'payable') };
      }),
      visibleBooks: whole(books, 'visible'),
      totalBooks: whole(books, 'total'),
    },
    day: {
      inflow: filsOf(today, 'inflow'),
      outflow: filsOf(today, 'outflow'),
      classes: list(today.classes, 'classes').map((item) => {
        const row = object(item, 'classes');
        return { cls: moneyClass(row, 'class'), inflow: filsOf(row, 'inflow'), outflow: filsOf(row, 'outflow'), count: whole(row, 'count') };
      }),
    },
    month: {
      sales: salesBlock(month.sales, 'sales'),
      purchases: purchasesBlock(month.purchases, 'purchases'),
      expenses: expensesBlock(month.expenses, 'expenses'),
      cash: cashFlow(month.cash, 'month.cash'),
    },
    topReceivable: topParties(json.top_receivable, 'top_receivable'),
    topPayable: topParties(json.top_payable, 'top_payable'),
    alerts: {
      negativeBoxes: list(alerts.negative_boxes, 'negative_boxes').map((item) => {
        const row = object(item, 'negative_boxes');
        return { accountId: str(row, 'account_id'), name: str(row, 'name'), balance: filsOf(row, 'balance') };
      }),
      oldReceivable: oldDebts(alerts.old_receivable, 'old_receivable'),
      oldPayable: oldDebts(alerts.old_payable, 'old_payable'),
    },
  };
}

/** خلاصة المال بيوم الخادم (app_today). */
export async function loadMoneyOverview(): Promise<MoneyOverview> {
  return parseMoneyOverview(await call<unknown>('money_overview'));
}

// ─── حركة الأموال ويومية الصندوق (money_moves، العقد §4.2) ─────────────────────────────────────────────────────

export type VoucherKind = 'entry' | 'transfer';

export interface MoneyMove {
  moveId: string;
  /** ترتيب الحركة داخل صندوقها (نصّ كما من الخادم). */
  seq: string;
  onDate: Day;
  accountId: string;
  accountName: string;
  cls: MoneyClass;
  /** cash_moves.kind كما هو (party_payment، receipt_paid…). */
  kind: string;
  docKind: string | null;
  docId: string | null;
  /** رقم القيد (RC/PY، أو FD/MD/MS للبيع، أو PU للشراء)، أو رقم الاستلام لأجور الشراء؛ null للمصروف والتحويل والبداية. */
  docNo: string | null;
  entryId: string | null;
  /** «entry» لسند القبض أو الصرف وعكسه، و«transfer» لوجهي التحويل وعكسهما، وإلّا null. */
  voucher: VoucherKind | null;
  /** معرّف السند الأصلي (قيد RC/PY الأصلي، أو معرّف التحويل). */
  voucherId: string | null;
  partyId: string | null;
  partyName: string | null;
  /** اسم فئة المصروف. */
  category: string | null;
  /** الصندوق الآخر في التحويل. */
  counterAccount: { id: string | null; name: string } | null;
  note: string | null;
  /** الحركة التي تلغيها هذه، أو null. */
  reverses: string | null;
  /** أُلغيت هذه الحركة لاحقاً. */
  reversed: boolean;
  inflow: Fils;
  outflow: Fils;
  /** الرصيد الجاري، أو null بفلتر نوع أو جهة. */
  balance: Fils | null;
}

export interface MoneyMovesDay {
  onDate: Day;
  inflow: Fils;
  outflow: Fils;
  count: number;
  /** رصيد آخر اليوم، أو null بفلتر نوع أو جهة. */
  closing: Fils | null;
}

/** مؤشّر الصفحة الجاية كما يرجّعه الخادم، ويرجع له نفسه (مبهم). */
export type MovesCursor = Readonly<Row>;

export interface MoneyMoves {
  from: Day;
  to: Day;
  account: { id: string; name: string; kind: CashKind; archived: boolean } | null;
  /** الرصيد الجاري ظاهر (بلا فلتر نوع ولا جهة). */
  running: boolean;
  opening: Fils | null;
  totals: { inflow: Fils; outflow: Fils; count: number };
  closing: Fils | null;
  /** مجاميع كلّ يوم ظهر في صفوف هذه الصفحة، بكامل حركاته تحت الفلاتر. */
  days: readonly MoneyMovesDay[];
  rows: readonly MoneyMove[];
  next: MovesCursor | null;
}

const VOUCHERS: readonly VoucherKind[] = ['entry', 'transfer'];

/** الصندوق الآخر في التحويل: اسمه نصّاً، أو {id, name} (العقد لا يحدّد الشكل، فالاثنان مقبولان). */
function counterOf(row: Row): MoneyMove['counterAccount'] {
  present(row, 'counter_account');
  const value = row.counter_account;
  if (value === null) return null;
  if (typeof value === 'string' && value !== '') return { id: null, name: value };
  const account = object(value, 'counter_account');
  return { id: account.id === undefined || account.id === null ? null : str(account, 'id'), name: str(account, 'name') };
}

function parseMove(value: unknown): MoneyMove {
  const row = object(value, 'rows');
  present(row, 'voucher');
  const voucher = row.voucher;
  if (voucher !== null && !(VOUCHERS as readonly unknown[]).includes(voucher)) throw new LedgerShapeError('voucher');
  return {
    moveId: str(row, 'move_id'),
    seq: str(row, 'seq'),
    onDate: day(row, 'on_date'),
    accountId: str(row, 'account_id'),
    accountName: str(row, 'account_name'),
    cls: moneyClass(row, 'class'),
    kind: str(row, 'kind'),
    docKind: optStr(row, 'doc_kind'),
    docId: optStr(row, 'doc_id'),
    docNo: optStr(row, 'doc_no'),
    entryId: optStr(row, 'entry_id'),
    voucher: voucher as VoucherKind | null,
    voucherId: optStr(row, 'voucher_id'),
    partyId: optStr(row, 'party_id'),
    partyName: optStr(row, 'party_name'),
    category: optStr(row, 'category'),
    counterAccount: counterOf(row),
    note: optStr(row, 'note'),
    reverses: optStr(row, 'reverses'),
    reversed: flag(row, 'reversed'),
    inflow: filsOf(row, 'inflow'),
    outflow: filsOf(row, 'outflow'),
    balance: optFils(row, 'balance'),
  };
}

export function parseMoneyMoves(value: unknown): MoneyMoves {
  const json = object(value, 'money_moves');
  present(json, 'account');
  const account = json.account === null ? null : object(json.account, 'account');
  const totals = object(json.totals, 'totals');
  return {
    from: day(json, 'from'),
    to: day(json, 'to'),
    account: account ? { id: str(account, 'id'), name: str(account, 'name'), kind: cashKind(account, 'kind'), archived: flag(account, 'archived') } : null,
    running: flag(json, 'running'),
    opening: optFils(json, 'opening'),
    totals: { inflow: filsOf(totals, 'inflow'), outflow: filsOf(totals, 'outflow'), count: whole(totals, 'count') },
    closing: optFils(json, 'closing'),
    days: list(json.days, 'days').map((item) => {
      const row = object(item, 'days');
      return { onDate: day(row, 'on_date'), inflow: filsOf(row, 'inflow'), outflow: filsOf(row, 'outflow'), count: whole(row, 'count'), closing: optFils(row, 'closing') };
    }),
    rows: list(json.rows, 'rows').map(parseMove),
    next: json.next === null || json.next === undefined ? null : object(json.next, 'next'),
  };
}

export interface MovesQuery {
  from: Day;
  /** null: لحد يوم الخادم. */
  to: Day | null;
  accountId?: string | null;
  cls?: MoneyClass | null;
  partyId?: string | null;
  after?: MovesCursor | null;
  limit?: number;
}

export const MOVES_PAGE = 100;
/** يومية الصندوق: يوم واحد بنداء واحد بالحدّ الأعلى (العقد §4.2). */
export const DAY_BOOK_LIMIT = 500;

export async function loadMoneyMoves({ from, to, accountId = null, cls = null, partyId = null, after = null, limit = MOVES_PAGE }: MovesQuery): Promise<MoneyMoves> {
  return parseMoneyMoves(
    await call<unknown>('money_moves', { p_from: from, p_to: to, p_account: accountId, p_class: cls, p_party: partyId, p_after: after, p_limit: limit }),
  );
}

/** يومية صندوق ليوم واحد: money_moves(day, day, box, null, null, null, 500). */
export function loadCashDay(accountId: string, on: Day): Promise<MoneyMoves> {
  return loadMoneyMoves({ from: on, to: on, accountId, limit: DAY_BOOK_LIMIT });
}

// ─── خلاصة الشهر التشغيلية (month_summary، العقد §4.7) ────────────────────────────────────────────────────────

export interface ProductionBlock {
  batches: number;
  outputKg: Milli;
  cost: Fils | null;
}

export interface FeedIssueBlock {
  issues: number;
  cost: Fils | null;
}

export interface MonthBlock {
  sales: SalesBlock;
  purchases: PurchasesBlock;
  expenses: ExpensesBlock;
  /** null لقسم بلا إنتاج. */
  production: ProductionBlock | null;
  /** null لقسم بلا صرف علف. */
  feedIssue: FeedIssueBlock | null;
}

export interface MonthSummary {
  month: Day;
  from: Day;
  to: Day;
  project: MonthBlock;
  divisions: readonly (MonthBlock & { divisionId: string; kind: DivisionKind })[];
  cash: CashFlow;
}

function monthBlock(row: Row): MonthBlock {
  present(row, 'production');
  present(row, 'feed_issue');
  const production = row.production === null ? null : object(row.production, 'production');
  const issue = row.feed_issue === null ? null : object(row.feed_issue, 'feed_issue');
  return {
    sales: salesBlock(row.sales, 'sales'),
    purchases: purchasesBlock(row.purchases, 'purchases'),
    expenses: expensesBlock(row.expenses, 'expenses'),
    production: production ? { batches: whole(production, 'batches'), outputKg: qty(production, 'output_kg'), cost: optFils(production, 'cost') } : null,
    feedIssue: issue ? { issues: whole(issue, 'issues'), cost: optFils(issue, 'cost') } : null,
  };
}

export function parseMonthSummary(value: unknown): MonthSummary {
  const json = object(value, 'month_summary');
  return {
    month: day(json, 'month'),
    from: day(json, 'from'),
    to: day(json, 'to'),
    project: monthBlock(object(json.project, 'project')),
    divisions: list(json.divisions, 'divisions').map((item) => {
      const row = object(item, 'divisions');
      return { ...monthBlock(row), divisionId: str(row, 'division_id'), kind: divisionKind(row, 'kind') };
    }),
    cash: cashFlow(json.cash, 'cash'),
  };
}

/** خلاصة الشهر: p_month أيّ يوم من الشهر (أوّله هنا)؛ شهر بعد شهر اليوم يرفضه الخادم (month_required). */
export async function loadMonthSummary(month: Day): Promise<MonthSummary> {
  return parseMonthSummary(await call<unknown>('month_summary', { p_month: month }));
}
