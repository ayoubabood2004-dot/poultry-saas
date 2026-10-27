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
