import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { ZeroRowsError } from '../errors';
import type { PostgrestFailure } from './core';
import { call, classifyPostgrest, explained, send, updatedRows } from './core';
import { dinarText, filsOf, LedgerShapeError, type PostRef } from './parties';

// الصناديق (0006، Q10 وQ12): الأرصدة والكشف من دوالّ SQL (رصيد الصندوق مجموع حركاته بالقاعدة)، والصندوق نفسه كتابة مباشرة
// (cash_accounts.manage)، والرصيد الافتتاحي والنقل وإلغاؤهما دوالّ بمعرّف ومرجع. ملف كسول بحزمة الشاشات (index ما يصدّره).

type Row = Record<string, unknown>;

export type CashKind = 'cash' | 'bank' | 'wallet';
export const CASH_KINDS: readonly CashKind[] = ['cash', 'bank', 'wallet'];

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
const optStr = (row: Row, field: string): string | null => {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new LedgerShapeError(field);
  return value;
};
const flag = (row: Row, field: string): boolean => {
  const value = row[field];
  if (typeof value !== 'boolean') throw new LedgerShapeError(field);
  return value;
};
const versionOf = (row: Row): number => {
  const value = row.version;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new LedgerShapeError('version');
  return value;
};
const cashKind = (value: unknown): CashKind => {
  if (typeof value !== 'string' || !(CASH_KINDS as readonly string[]).includes(value)) throw new LedgerShapeError('kind');
  return value as CashKind;
};

export interface CashBalance {
  accountId: string;
  name: string;
  kind: CashKind;
  archived: boolean;
  version: number;
  /** رصيد افتتاحي فعّال (واحد لكل صندوق). */
  hasOpening: boolean;
  opening: Fils;
  inflow: Fils;
  outflow: Fils;
  /** الرصيد بآخر المدّة؛ السالب مسموح ويّا تنبيه ظاهر (Q10). */
  closing: Fils;
}

export interface CashBalances {
  /** آخر يوم بالمدّة (بلا to بالطلب = يوم الخادم). */
  to: Day;
  accounts: readonly CashBalance[];
  total: { opening: Fils; inflow: Fils; outflow: Fils; closing: Fils };
}

export function parseCashBalances(value: unknown): CashBalances {
  const json = object(value, 'cash');
  const total = object(json.total, 'total');
  return {
    to: str(json, 'to'),
    accounts: list(json.accounts, 'accounts').map((item) => {
      const row = object(item, 'accounts');
      return {
        accountId: str(row, 'account_id'),
        name: str(row, 'name'),
        kind: cashKind(row.kind),
        archived: flag(row, 'archived'),
        version: versionOf(row),
        hasOpening: flag(row, 'has_opening'),
        opening: filsOf(row, 'opening'),
        inflow: filsOf(row, 'inflow'),
        outflow: filsOf(row, 'outflow'),
        closing: filsOf(row, 'closing'),
      };
    }),
    total: { opening: filsOf(total, 'opening'), inflow: filsOf(total, 'inflow'), outflow: filsOf(total, 'outflow'), closing: filsOf(total, 'closing') },
  };
}

/** أرصدة الصناديق (المؤرشفة ويّاها بعلامتها)، والمنتقي يقرأ منها. to = null: لحد يوم الخادم. */
export async function loadCashBalances(from: Day, to: Day | null): Promise<CashBalances> {
  return parseCashBalances(await call<unknown>('report_cash_balances', { p_from: from, p_to: to }));
}

export type CashMoveKind = 'party_payment' | 'party_payout' | 'receipt_paid' | 'receipt_charge' | 'expense' | 'opening' | 'transfer';
const MOVE_KINDS: readonly CashMoveKind[] = ['party_payment', 'party_payout', 'receipt_paid', 'receipt_charge', 'expense', 'opening', 'transfer'];

export interface CashLine {
  moveId: string;
  onDate: Day;
  kind: CashMoveKind;
  docNo: string | null;
  party: string | null;
  note: string | null;
  reverses: boolean;
  reversed: boolean;
  inflow: Fils;
  outflow: Fils;
  balance: Fils;
}

export interface CashStatement {
  account: { id: string; name: string; kind: CashKind; archived: boolean; version: number };
  from: Day;
  to: Day;
  broughtForward: Fils;
  totalIn: Fils;
  totalOut: Fils;
  closing: Fils;
  lines: readonly CashLine[];
}

export function parseCashStatement(value: unknown): CashStatement {
  const json = object(value, 'statement');
  const account = object(json.account, 'account');
  return {
    account: { id: str(account, 'id'), name: str(account, 'name'), kind: cashKind(account.kind), archived: flag(account, 'archived'), version: versionOf(account) },
    from: str(json, 'from'),
    to: str(json, 'to'),
    broughtForward: filsOf(json, 'brought_forward'),
    totalIn: filsOf(json, 'total_in'),
    totalOut: filsOf(json, 'total_out'),
    closing: filsOf(json, 'closing'),
    lines: list(json.lines, 'lines').map((item): CashLine => {
      const row = object(item, 'lines');
      const kind = row.kind;
      if (typeof kind !== 'string' || !(MOVE_KINDS as readonly string[]).includes(kind)) throw new LedgerShapeError('kind');
      return {
        moveId: str(row, 'move_id'),
        onDate: str(row, 'on_date'),
        kind: kind as CashMoveKind,
        docNo: optStr(row, 'doc_no'),
        party: optStr(row, 'party'),
        note: optStr(row, 'note'),
        reverses: row.reverses !== null && row.reverses !== undefined,
        reversed: flag(row, 'reversed'),
        inflow: filsOf(row, 'inflow'),
        outflow: filsOf(row, 'outflow'),
        balance: filsOf(row, 'balance'),
      };
    }),
  };
}

export async function loadCashStatement(accountId: string, from: Day, to: Day): Promise<CashStatement> {
  return parseCashStatement(await call<unknown>('report_cash_statement', { p_account: accountId, p_from: from, p_to: to }));
}

// ─── الصندوق نفسه (كتابة مباشرة، Q1) ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_COLUMNS = 'id, name, kind, archived_at, version';

type Failed = PostgrestFailure & { status: number };
const failed = (error: unknown): error is Failed => typeof error === 'object' && error !== null && typeof (error as Failed).status === 'number';
const withStatus = (answer: { data: unknown; error: PostgrestFailure | null; status: number }) => ({ data: answer.data as Row | Row[] | null, error: answer.error ? { ...answer.error, status: answer.status } : null });

async function written(make: (db: SupabaseClient) => Promise<Row[]>): Promise<{ id: string; version: number }> {
  const { result, wasOnline } = await send(
    async (db): Promise<{ rows: Row[]; error: PostgrestFailure | null; status: number }> => {
      try {
        return { rows: await make(db), error: null, status: 200 };
      } catch (error) {
        if (!failed(error)) throw error;
        return { rows: [], error, status: error.status };
      }
    },
    (answer) => [answer],
  );
  if (result.error) throw await explained(classifyPostgrest(result.error, result.status, 'table', wasOnline));
  const [row] = result.rows;
  if (!row) throw new ZeroRowsError();
  return { id: str(row, 'id'), version: versionOf(row) };
}

export function createCashAccount(name: string, kind: CashKind): Promise<{ id: string; version: number }> {
  return written(async (db) => updatedRows(withStatus(await db.from('cash_accounts').insert({ name: name.trim(), kind }).select(ACCOUNT_COLUMNS))));
}

export function renameCashAccount(id: string, version: number, name: string): Promise<{ id: string; version: number }> {
  return written(async (db) => updatedRows(withStatus(await db.from('cash_accounts').update({ name: name.trim() }).eq('id', id).eq('version', version).select(ACCOUNT_COLUMNS))));
}

/** أرشفة أو إعادة بشرط النسخة (الخادم يرفض أرشفة صندوق بيه رصيد، archived_in_use). */
export function setCashArchived(id: string, version: number, archived: boolean): Promise<{ id: string; version: number }> {
  return written(async (db) => updatedRows(withStatus(await db.from('cash_accounts').update({ archived_at: archived ? 'now' : null }).eq('id', id).eq('version', version).select(ACCOUNT_COLUMNS))));
}

// ─── الافتتاح والنقل والإلغاء (Q10) ──────────────────────────────────────────────────────────────────────────────

export interface CashPosted {
  id: string;
  /** null إذا الخادم أخفى المال. */
  amount: Fils | null;
}

function parseCashPosted(value: unknown): CashPosted {
  const json = object(value, 'cash_posted');
  const money = json.money === undefined ? null : object(json.money, 'money');
  return { id: str(json, 'id'), amount: money ? filsOf(money, 'amount') : null };
}

/** الرصيد الافتتاحي للصندوق (موقّع؛ المصرف يكدر يبدي بالسالب)، بيوم تشغيل أقدم وحدة أو قبله. */
export async function recordCashOpening(ref: PostRef, input: { accountId: string; amount: Fils; onDate: Day }): Promise<CashPosted> {
  return parseCashPosted(await call<unknown>('record_cash_opening', { p_id: ref.id, p_account: input.accountId, p_amount: dinarText(input.amount), p_on_date: input.onDate, p_client_ref: ref.clientRef }));
}

/** النقل بين صندوقين: حركتان متعاكستان بمستند واحد. */
export async function transferCash(ref: PostRef, input: { fromId: string; toId: string; amount: Fils; onDate: Day; note: string | null }): Promise<CashPosted> {
  return parseCashPosted(
    await call<unknown>('transfer_cash', { p_id: ref.id, p_from: input.fromId, p_to: input.toId, p_amount: dinarText(input.amount), p_on_date: input.onDate, p_note: input.note, p_client_ref: ref.clientRef }),
  );
}

/** إلغاء رصيد افتتاحي أو نقل (الوجهين). حركات القبض والدفع تُلغى من قيدها. */
export async function voidCashMove(clientRef: string, moveId: string, reason: string): Promise<{ id: string }> {
  const json = object(await call<unknown>('void_cash_move', { p_id: moveId, p_reason: reason, p_client_ref: clientRef }), 'void_cash_move');
  return { id: str(json, 'id') };
}

// ─── المصاريف (0008، FOUNDATION ٥٥٧، Q13، Q14، E10) ─────────────────────────────────────────────────────────────
// التسجيل نقداً من صندوق أو بالدين على جهة بدفتر وحدتها (المفقس بدفتر يُسمّى صراحةً)، والإلغاء بصفّ عكسي؛ والقائمة ومجاميعها من
// report_expenses بالخادم (§2.8، مو جمع الصفوف المحمّلة). مصاريف الصرف والجرد (stock) تنعرض هنا وتُلغى من مستندها.

export type ExpenseSource = 'cash' | 'credit' | 'stock' | 'adjustment';
const EXPENSE_SOURCES: readonly ExpenseSource[] = ['cash', 'credit', 'stock', 'adjustment'];

const sourceOf = (row: Row, field: string): ExpenseSource => {
  const value = row[field];
  if (typeof value !== 'string' || !(EXPENSE_SOURCES as readonly string[]).includes(value)) throw new LedgerShapeError(field);
  return value as ExpenseSource;
};

export interface ExpenseRow {
  id: string;
  onDate: Day;
  /** الشهر اللي ينتسب إله (Q14): أوّل يوم بالشهر. */
  forMonth: Day;
  categoryId: string;
  categoryName: string;
  /** تصنيف نظامي («فرق جرد»، «إتلاف منتهي»…) أو null. */
  systemCode: string | null;
  divisionId: string;
  source: ExpenseSource;
  accountName: string | null;
  partyName: string | null;
  bookCode: string | null;
  siteName: string | null;
  docKind: string | null;
  docId: string | null;
  /** رقم مستند الصرف أو الجرد. */
  docNo: string | null;
  note: string | null;
  reason: string | null;
  /** صفّ إلغاء لمصروف سابق (مبلغه سالب). */
  reverses: string | null;
  /** أُلغي بصفّ عكسي. */
  reversed: boolean;
  amount: Fils;
}

export interface ExpenseTotals {
  total: Fils;
  count: number;
  byCategory: readonly { categoryId: string; name: string; systemCode: string | null; amount: Fils }[];
  bySource: readonly { source: ExpenseSource; amount: Fils }[];
  byMonth: readonly { forMonth: Day; amount: Fils }[];
}

export interface ExpenseReport {
  rows: readonly ExpenseRow[];
  /** مؤشّر الصفحة الجاية كما رجّعه الخادم (يرجع له كما هو)، أو null. */
  next: Row | null;
  totals: ExpenseTotals;
}

const whole = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new LedgerShapeError(field);
  return value;
};

export function parseExpenseReport(value: unknown): ExpenseReport {
  const json = object(value, 'report_expenses');
  const totals = object(json.totals, 'totals');
  return {
    rows: list(json.rows, 'rows').map((item) => {
      const row = object(item, 'rows');
      return {
        id: str(row, 'id'),
        onDate: str(row, 'on_date'),
        forMonth: str(row, 'for_month'),
        categoryId: str(row, 'category_id'),
        categoryName: str(row, 'category_name'),
        systemCode: optStr(row, 'system_code'),
        divisionId: str(row, 'division_id'),
        source: sourceOf(row, 'source'),
        accountName: optStr(row, 'account_name'),
        partyName: optStr(row, 'party_name'),
        bookCode: optStr(row, 'book_code'),
        siteName: optStr(row, 'site_name'),
        docKind: optStr(row, 'doc_kind'),
        docId: optStr(row, 'doc_id'),
        docNo: optStr(row, 'doc_no'),
        note: optStr(row, 'note'),
        reason: optStr(row, 'reason'),
        reverses: optStr(row, 'reverses'),
        reversed: flag(row, 'reversed'),
        amount: filsOf(row, 'amount'),
      };
    }),
    next: json.next === null || json.next === undefined ? null : object(json.next, 'next'),
    totals: {
      total: filsOf(totals, 'total'),
      count: whole(totals, 'count'),
      byCategory: list(totals.by_category, 'by_category').map((item) => {
        const row = object(item, 'by_category');
        return { categoryId: str(row, 'category_id'), name: str(row, 'name'), systemCode: optStr(row, 'system_code'), amount: filsOf(row, 'amount') };
      }),
      bySource: list(totals.by_source, 'by_source').map((item) => {
        const row = object(item, 'by_source');
        return { source: sourceOf(row, 'source'), amount: filsOf(row, 'amount') };
      }),
      byMonth: list(totals.by_month, 'by_month').map((item) => {
        const row = object(item, 'by_month');
        return { forMonth: str(row, 'for_month'), amount: filsOf(row, 'amount') };
      }),
    },
  };
}

export const EXPENSES_PAGE = 50;

/** المصاريف المنسوبة لأشهر المدّة (من شهر from لحد to)، بوحدة أو كلها، بصفحات؛ والمجاميع للمدّة كلها من الخادم. */
export async function loadExpenses(from: Day, to: Day, divisionId: string | null, after: Row | null = null): Promise<ExpenseReport> {
  return parseExpenseReport(await call<unknown>('report_expenses', { p_from: from, p_to: to, p_division: divisionId, p_after: after, p_limit: EXPENSES_PAGE }));
}

export interface ExpenseInput {
  categoryId: string;
  divisionId: string;
  /** بالدينار الصحيح. */
  amount: Fils;
  onDate: Day;
  /** الشهر اللي ينتسب إله (Q14): شهر التاريخ أو قبله؛ null = شهر التاريخ. */
  forMonth: Day | null;
  source: 'cash' | 'credit';
  accountId: string | null;
  partyId: string | null;
  /** null = دفتر الوحدة الرئيسي (المفقس يسمّيه صراحةً). */
  bookId: string | null;
  siteId: string | null;
  note: string | null;
}

/** تسجيل مصروف (expense.post) بمعرّف ومرجع ثابتين لحد ما تنعرف النتيجة. الفوج ووجبة الفقس يجون بالمرحلتين 3 و5 (Q13). */
export async function recordExpense(ref: PostRef, input: ExpenseInput): Promise<CashPosted> {
  return parseCashPosted(
    await call<unknown>('record_expense', {
      p_id: ref.id,
      p_category: input.categoryId,
      p_division: input.divisionId,
      p_amount: dinarText(input.amount),
      p_on_date: input.onDate,
      p_source: input.source,
      p_account: input.source === 'cash' ? input.accountId : null,
      p_party: input.source === 'credit' ? input.partyId : null,
      p_book: input.source === 'credit' ? input.bookId : null,
      p_site: input.siteId,
      p_flock: null,
      p_hatch_batch: null,
      p_note: input.note?.trim() || null,
      p_for_month: input.forMonth,
      p_client_ref: ref.clientRef,
    }),
  );
}

/** إلغاء مصروف نقدي أو بالدين (void) بصفّ عكسي؛ مصروف مستند (system_expense) يُلغى من مستنده. */
export async function voidExpense(clientRef: string, id: string, reason: string): Promise<{ id: string }> {
  const json = object(await call<unknown>('void_expense', { p_id: id, p_reason: reason, p_client_ref: clientRef }), 'void_expense');
  return { id: str(json, 'id') };
}

export interface ExpenseCategory {
  id: string;
  name: string;
  /** تصنيف نظامي يكتبه النظام بمستنداته (ما ينختار للمصروف). */
  systemCode: string | null;
  archived: boolean;
}

/** تصنيفات المصاريف (للنموذج: الفعّالة غير النظامية). قراءة بسياسة المنشأة؛ قائمة قصيرة بطبيعتها. */
export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { result, wasOnline } = await send(
    (db) => db.from('expense_categories').select('id, name, system_code, archived_at').order('name') /* unbounded: تصنيفات المنشأة، عشرات */,
    (answer) => [answer],
  );
  if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  return ((result.data ?? []) as unknown as Row[]).map((row) => ({ id: str(row, 'id'), name: str(row, 'name'), systemCode: optStr(row, 'system_code'), archived: row.archived_at !== null && row.archived_at !== undefined }));
}
