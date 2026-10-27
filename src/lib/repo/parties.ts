import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { DIVISION_KINDS, type DivisionKind } from '../../domain/divisions';
import { FILS_PER_DINAR, type Fils } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { ZeroRowsError } from '../errors';
import './constraints-ledger';
import type { PostgrestFailure } from './core';
import { call, classifyPostgrest, explained, send, updatedRows } from './core';

// الجهات ودفاترها (0006، خطّة المرحلة 1 WP3): الدفاتر السبعة، والجهات (كتابة مباشرة بسياسة، والتوائم قبل الحفظ)، وتقارير صفحة
// الحسابات (الملخّص وجدول الجهات بالمعرّف والكشف) من دوالّ SQL مو من سحب القيود (§2.8)، والمعاينة، و«قبضنا» و«دفعنا» والافتتاح
// والتسوية والإعفاء والإلغاء. ملف كسول: الشاشات تستورده مباشرةً فيدخل حزمتها، مو مسار الجلسة الحرج (index ما يصدّره).
// المال نصوص عشرية بالاتجاهين (E3) وبالواجهة فلس bigint؛ ومبالغ الدفاتر دينار صحيح، فالإرسال بالدينار. كل ترحيل بمعرّف مولود
// بالجهاز (p_id) ومرجع (p_client_ref) يبقون نفسهم لحد ما تنعرف النتيجة (FOUNDATION ٥١٩): الشاشة تاخذهم من newRef() مرّة.

type Row = Record<string, unknown>;

/** جواب بشكل غير المتوقّع: يرمي بدل ما ينقبل بصمت (مثل RowShapeError بـinventory.ts، صنف لحاله حتى الحزم ما تتشابك). */
export class LedgerShapeError extends Error {
  constructor(readonly field: string) {
    super(`ledger_shape:${field}`);
    this.name = 'LedgerShapeError';
  }
}

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
const whole = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new LedgerShapeError(field);
  return value;
};

/** مبلغ دفتر من القاعدة (نصّ عشري بالدينار) بالفلس. */
export function filsOf(row: Row, field: string): Fils {
  const text = str(row, field);
  const value = parseDecimal(text, 2);
  if (value === null) throw new LedgerShapeError(field);
  return toScale(value, 2);
}

const optFils = (row: Row, field: string): Fils | null => (row[field] === null || row[field] === undefined ? null : filsOf(row, field));

/** مبلغ دفتر أو صندوق للإرسال: دينار صحيح نصّاً (الفلوس بالدفاتر ترفضها القاعدة، amount_not_whole_dinar). */
export function dinarText(amount: Fils): string {
  if (amount % FILS_PER_DINAR !== 0n) throw new RangeError('not_whole_dinar');
  return decimalText(amount / FILS_PER_DINAR, 0);
}

const day = (row: Row, field: string): Day => str(row, field);
const optDay = (row: Row, field: string): Day | null => optStr(row, field);

// ─── الدفاتر ───────────────────────────────────────────────────────────────────────────────────────────────────

export type BookCode = 'main' | 'chicks' | 'hatching_eggs';
const BOOK_CODES: readonly BookCode[] = ['main', 'chicks', 'hatching_eggs'];

export interface BookRef {
  id: string;
  divisionId: string;
  divisionKind: DivisionKind;
  code: BookCode;
  name: string;
  /** يوم تشغيل الوحدة (الافتتاح بيه أو قبله)، أو null. */
  goLiveOn: Day | null;
}

const kindOf = (value: unknown, field: string): DivisionKind => {
  if (typeof value !== 'string' || !(DIVISION_KINDS as readonly string[]).includes(value)) throw new LedgerShapeError(field);
  return value as DivisionKind;
};
const codeOf = (value: unknown): BookCode => {
  if (typeof value !== 'string' || !(BOOK_CODES as readonly string[]).includes(value)) throw new LedgerShapeError('code');
  return value as BookCode;
};

/** الدفاتر السبعة بترتيب الوحدات (FOUNDATION ٢٦١). جداول الإعداد بلا مال، تنقرا لكل المنشأة. */
export async function listBooks(): Promise<BookRef[]> {
  const { result, wasOnline } = await send(
    (db) =>
      Promise.all([
        db.from('ledger_books').select('id, division_id, code, name').is('archived_at', null),
        db.from('divisions').select('id, kind, go_live_on').is('archived_at', null),
      ]),
    (answers) => answers,
  );
  for (const answer of result) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  const divisions = new Map(((result[1].data ?? []) as Row[]).map((row) => [str(row, 'id'), { kind: kindOf(row.kind, 'kind'), goLiveOn: optDay(row, 'go_live_on') }]));
  const books = ((result[0].data ?? []) as Row[]).map((row): BookRef => {
    const division = divisions.get(str(row, 'division_id'));
    if (!division) throw new LedgerShapeError('division_id');
    return { id: str(row, 'id'), divisionId: str(row, 'division_id'), divisionKind: division.kind, code: codeOf(row.code), name: str(row, 'name'), goLiveOn: division.goLiveOn };
  });
  return books.sort((a, b) => DIVISION_KINDS.indexOf(a.divisionKind) - DIVISION_KINDS.indexOf(b.divisionKind) || BOOK_CODES.indexOf(a.code) - BOOK_CODES.indexOf(b.code));
}

// ─── الملخّص وجدول الجهات (FOUNDATION ٧٨٨) ───────────────────────────────────────────────────────────────────────

export interface SideTotals {
  /** «لنا عند الناس». */
  receivable: Fils;
  /** «علينا للناس». */
  payable: Fils;
}

export interface AccountsSummary {
  /** آخر يوم بالمدّة (بلا to بالطلب = يوم الخادم). */
  to: Day;
  /** وحدات نطاق القارئ بس (E49): وحدة برّا نطاقه ما ترجع، مو ترجع «0 / 0». */
  divisions: readonly (SideTotals & { divisionId: string; kind: DivisionKind; partiesNonzero: number })[];
  project: SideTotals & { partiesNonzero: number; partiesAll: number };
  /** لكل دفتر: صفّا التذييل تحت عموده. */
  books: ReadonlyMap<string, SideTotals>;
  /** الدفاتر الظاهرة من المجموع: القارئ المحصور (E49) يشوف «N من المجموع». */
  visibleBooks: number;
  totalBooks: number;
}

const sides = (row: Row): SideTotals => ({ receivable: filsOf(row, 'receivable'), payable: filsOf(row, 'payable') });

export function parseAccountsSummary(value: unknown): AccountsSummary {
  const json = object(value, 'summary');
  const project = object(json.project, 'project');
  const books = object(json.books, 'books');
  return {
    to: day(json, 'to'),
    divisions: list(json.divisions, 'divisions').map((item) => {
      const row = object(item, 'divisions');
      return { ...sides(row), divisionId: str(row, 'division_id'), kind: kindOf(row.kind, 'kind'), partiesNonzero: whole(row, 'parties_nonzero') };
    }),
    project: { ...sides(project), partiesNonzero: whole(project, 'parties_nonzero'), partiesAll: whole(project, 'parties_all') },
    books: new Map(list(json.book_totals, 'book_totals').map((item) => [str(object(item, 'book_totals'), 'book_id'), sides(object(item, 'book_totals'))])),
    visibleBooks: whole(books, 'visible'),
    totalBooks: whole(books, 'total'),
  };
}

/** to = null: لحد يوم الخادم (app_today)، فالصفحة المفتوحة من أمس تشوف ترحيل اليوم بعد التحديث. */
export async function loadAccountsSummary(from: Day, to: Day | null): Promise<AccountsSummary> {
  return parseAccountsSummary(await call<unknown>('report_accounts_summary', { p_from: from, p_to: to }));
}

export interface BookCell {
  bookId: string;
  /** المدوَّر قبل أوّل المدّة. */
  opening: Fils;
  debit: Fils;
  credit: Fils;
  /** الرصيد بآخر المدّة: موجب «عليه»، سالب «له». */
  closing: Fils;
  /** أقدم قيد مفتوح بالدفتر. */
  oldest: Day | null;
  /** الافتتاح الفعّال (قيده ومبلغه)، أو null. */
  openingEntry: { id: string; amount: Fils } | null;
}

export interface PartyBalanceRow {
  partyId: string;
  name: string;
  nameNorm: string;
  phone: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  archived: boolean;
  version: number;
  /** مجموع الدفاتر للعرض بس («المجموع»). */
  total: Fils;
  oldest: Day | null;
  cells: ReadonlyMap<string, BookCell>;
}

export type PartySort = 'balance' | 'oldest' | 'name';

/** مؤشّر الصفحة الجاية كما يرجّعه الخادم (نصوص)، ويرجع له نفسه. */
export type BalancesCursor = Readonly<Record<string, string | null>>;

export interface PartyBalancesPage {
  books: readonly { id: string; divisionId: string; divisionKind: DivisionKind; code: BookCode; name: string }[];
  rows: readonly PartyBalanceRow[];
  next: BalancesCursor | null;
  /** عدد الجهات بالفلتر والبحث، بأوّل صفحة بس. */
  total: number | null;
}

function parseCell(value: unknown): BookCell {
  const row = object(value, 'cells');
  const openingId = optStr(row, 'opening_entry_id');
  return {
    bookId: str(row, 'book_id'),
    opening: filsOf(row, 'opening'),
    debit: filsOf(row, 'debit'),
    credit: filsOf(row, 'credit'),
    closing: filsOf(row, 'closing'),
    oldest: optDay(row, 'oldest'),
    openingEntry: openingId ? { id: openingId, amount: filsOf(row, 'opening_amount') } : null,
  };
}

export function parsePartyBalances(value: unknown): PartyBalancesPage {
  const json = object(value, 'balances');
  const next = json.next === null || json.next === undefined ? null : object(json.next, 'next');
  return {
    books: list(json.books, 'books').map((item) => {
      const row = object(item, 'books');
      return { id: str(row, 'book_id'), divisionId: str(row, 'division_id'), divisionKind: kindOf(row.division_kind, 'division_kind'), code: codeOf(row.code), name: str(row, 'name') };
    }),
    rows: list(json.rows, 'rows').map((item): PartyBalanceRow => {
      const row = object(item, 'rows');
      const version = row.version;
      if (typeof version !== 'number' || !Number.isInteger(version)) throw new LedgerShapeError('version');
      if (typeof row.name_norm !== 'string') throw new LedgerShapeError('name_norm');
      return {
        partyId: str(row, 'party_id'),
        name: str(row, 'name'),
        nameNorm: row.name_norm,
        phone: optStr(row, 'phone'),
        isCustomer: flag(row, 'is_customer'),
        isSupplier: flag(row, 'is_supplier'),
        archived: flag(row, 'archived'),
        version,
        total: filsOf(row, 'total'),
        oldest: optDay(row, 'oldest'),
        cells: new Map(list(row.cells, 'cells').map((cell) => {
          const parsed = parseCell(cell);
          return [parsed.bookId, parsed];
        })),
      };
    }),
    next: next ? (Object.fromEntries(Object.entries(next).map(([key, v]) => [key, typeof v === 'string' ? v : null])) as BalancesCursor) : null,
    total: json.total === null || json.total === undefined ? null : whole(json, 'total'),
  };
}

export interface BalancesQuery {
  from: Day;
  /** null: لحد يوم الخادم. */
  to: Day | null;
  divisionId?: string | null;
  nonzero?: boolean;
  sort?: PartySort;
  search?: string;
  after?: BalancesCursor | null;
  limit?: number;
}

export const PARTIES_PAGE = 50;

/** صفحة جدول الجهات. البحث بمرآة القاعدة (searchable)، والخادم يطابق الاسم المطبَّع وأرقام الهاتف. */
export async function loadPartyBalances({ from, to, divisionId = null, nonzero = true, sort = 'balance', search = '', after = null, limit = PARTIES_PAGE }: BalancesQuery): Promise<PartyBalancesPage> {
  return parsePartyBalances(
    await call<unknown>('report_party_balances', {
      p_from: from,
      p_to: to,
      p_division: divisionId,
      p_nonzero: nonzero,
      p_sort: sort,
      p_search: searchable(search) || null,
      p_after: after,
      p_limit: limit,
    }),
  );
}

// ─── الكشف (E50) ───────────────────────────────────────────────────────────────────────────────────────────────

export type EntryKind = 'invoice' | 'purchase' | 'bill' | 'payment' | 'payout' | 'return' | 'supplier_return' | 'forgiveness' | 'opening' | 'adjustment' | 'offset';
const ENTRY_KINDS: readonly EntryKind[] = ['invoice', 'purchase', 'bill', 'payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'opening', 'adjustment', 'offset'];

export interface StatementLine {
  entryId: string;
  onDate: Day;
  kind: EntryKind;
  docNo: string | null;
  reason: string | null;
  /** القيد عكسٌ لقيد آخر. */
  reverses: boolean;
  /** القيد انعكس (أُلغي). */
  reversed: boolean;
  /** صندوق حركة القبض أو الدفع (تأكيد إلغائه يسمّيه)، أو null. */
  account: string | null;
  debit: Fils;
  credit: Fils;
  balance: Fils;
}

export interface StatementBook {
  bookId: string;
  code: BookCode;
  name: string;
  divisionKind: DivisionKind;
  broughtForward: Fils;
  totalDebit: Fils;
  totalCredit: Fils;
  closing: Fils;
  lines: readonly StatementLine[];
}

export interface PartyStatement {
  party: { id: string; name: string; phone: string | null; archived: boolean; version: number; isCustomer: boolean; isSupplier: boolean };
  from: Day;
  to: Day;
  books: readonly StatementBook[];
}

export function parseStatement(value: unknown): PartyStatement {
  const json = object(value, 'statement');
  const party = object(json.party, 'party');
  const version = party.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new LedgerShapeError('version');
  return {
    party: { id: str(party, 'id'), name: str(party, 'name'), phone: optStr(party, 'phone'), archived: flag(party, 'archived'), version, isCustomer: flag(party, 'is_customer'), isSupplier: flag(party, 'is_supplier') },
    from: day(json, 'from'),
    to: day(json, 'to'),
    books: list(json.books, 'books').map((item): StatementBook => {
      const row = object(item, 'books');
      return {
        bookId: str(row, 'book_id'),
        code: codeOf(row.code),
        name: str(row, 'name'),
        divisionKind: kindOf(row.division_kind, 'division_kind'),
        broughtForward: filsOf(row, 'brought_forward'),
        totalDebit: filsOf(row, 'total_debit'),
        totalCredit: filsOf(row, 'total_credit'),
        closing: filsOf(row, 'closing'),
        lines: list(row.lines, 'lines').map((lineItem): StatementLine => {
          const line = object(lineItem, 'lines');
          const kind = line.kind;
          if (typeof kind !== 'string' || !(ENTRY_KINDS as readonly string[]).includes(kind)) throw new LedgerShapeError('kind');
          return {
            entryId: str(line, 'entry_id'),
            onDate: day(line, 'on_date'),
            kind: kind as EntryKind,
            docNo: optStr(line, 'doc_no'),
            reason: optStr(line, 'reason'),
            reverses: line.reverses !== null && line.reverses !== undefined,
            reversed: flag(line, 'reversed'),
            account: optStr(line, 'account'),
            debit: filsOf(line, 'debit'),
            credit: filsOf(line, 'credit'),
            balance: filsOf(line, 'balance'),
          };
        }),
      };
    }),
  };
}

/** كشف الجهة بكل دفاترها الظاهرة (bookId = null) أو بدفتر واحد. */
export async function loadStatement(partyId: string, bookId: string | null, from: Day, to: Day): Promise<PartyStatement> {
  return parseStatement(await call<unknown>('report_party_statement', { p_party: partyId, p_book: bookId, p_from: from, p_to: to }));
}

// ─── الجهات (كتابة مباشرة، Q1 وQ2) ───────────────────────────────────────────────────────────────────────────────

export interface PartyFields {
  name: string;
  phone: string | null;
  is_customer: boolean;
  is_supplier: boolean;
}

export interface PartyRow {
  id: string;
  version: number;
  archived: boolean;
  name: string;
  phone: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
}

const PARTY_COLUMNS = 'id, name, phone, is_customer, is_supplier, archived_at, version';

function party(row: Row): PartyRow {
  const version = row.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new LedgerShapeError('version');
  return { id: str(row, 'id'), version, archived: row.archived_at !== null && row.archived_at !== undefined, name: str(row, 'name'), phone: optStr(row, 'phone'), isCustomer: flag(row, 'is_customer'), isSupplier: flag(row, 'is_supplier') };
}

type Failed = PostgrestFailure & { status: number };
const failed = (error: unknown): error is Failed => typeof error === 'object' && error !== null && typeof (error as Failed).status === 'number';
const withStatus = (answer: { data: unknown; error: PostgrestFailure | null; status: number }) => ({ data: answer.data as Row | Row[] | null, error: answer.error ? { ...answer.error, status: answer.status } : null });

/** كتابة مباشرة بـupdatedRows (نفس written بـinventory.ts): خطأ القاعدة يتصنّف وجملة القيد كسولة، وصفر صفوف يطلع كما هو. */
async function written(make: (db: SupabaseClient) => Promise<Row[]>): Promise<Row> {
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
  return row;
}

export function createParty(fields: PartyFields): Promise<PartyRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('parties').insert(fields).select(PARTY_COLUMNS)))).then(party);
}

/** الحقول المتغيّرة بس، بشرط النسخة اللي انفتحت (FOUNDATION ٨١٧). */
export function updateParty(id: string, version: number, patch: Partial<PartyFields>): Promise<PartyRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('parties').update(patch).eq('id', id).eq('version', version).select(PARTY_COLUMNS)))).then(party);
}

/** أرشفة أو إعادة بشرط النسخة (الخادم يرفض أرشفة جهة بيها رصيد، archived_in_use). */
export function setPartyArchived(id: string, version: number, archived: boolean): Promise<PartyRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('parties').update({ archived_at: archived ? 'now' : null }).eq('id', id).eq('version', version).select(PARTY_COLUMNS)))).then(party);
}

/** نتيجة منتقي الجهة: أوّل limit جهة، وعددها كلّه بالخادم (كل سقف بالعرض ينقال «N من المجموع»، FOUNDATION ٧٧٥). */
export interface PartySearch {
  parties: PartyRow[];
  total: number;
}

/** منتقي الجهة: بحث بالاسم المطبَّع، أوّل limit بالترتيب، والعدد الكلّي من الخادم. الجهات مو جدول مال (بلا أرصدة). */
export async function searchParties(search: string, limit = 20): Promise<PartySearch> {
  const name = searchable(search).replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { result, wasOnline } = await send(
    (db) => {
      let query = db.from('parties').select(PARTY_COLUMNS, { count: 'exact' }).is('archived_at', null);
      if (name) query = query.like('name_norm', `%${name}%`);
      return query.order('name_norm').order('id').limit(limit);
    },
    (answer) => [answer],
  );
  if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  if (typeof result.count !== 'number') throw new LedgerShapeError('count');
  return { parties: ((result.data ?? []) as Row[]).map(party), total: result.count };
}

export interface PartyTwin {
  id: string;
  name: string;
  archived: boolean;
  sameName: boolean;
  samePhone: boolean;
}

/** التوائم قبل الحفظ (Q2): نفس الاسم المطبَّع أو مفتاح الهاتف، تنبيه ثم سماح. */
export async function findPartyTwins(name: string, phone: string | null): Promise<PartyTwin[]> {
  const found = await call<unknown>('find_party_twins', { p_name: name, p_phone: phone });
  return list(found, 'find_party_twins').map((item) => {
    const row = object(item, 'find_party_twins');
    return { id: str(row, 'id'), name: str(row, 'name'), archived: flag(row, 'archived'), sameName: flag(row, 'same_name'), samePhone: flag(row, 'same_phone') };
  });
}

// ─── المعاينة والترحيل ─────────────────────────────────────────────────────────────────────────────────────────

/** معرّف القيد ومرجع العملية مولودان بالجهاز مرّة (FOUNDATION ٥١٩)، والشاشة تحتفظ بيهم لحد ما تنعرف النتيجة. */
export interface PostRef {
  id: string;
  clientRef: string;
}

export function newRef(): PostRef {
  return { id: crypto.randomUUID(), clientRef: crypto.randomUUID() };
}

export type PreviewKind = 'payment' | 'payout' | 'adjustment' | 'forgiveness' | 'opening';

export interface PlannedLine {
  entryId: string;
  kind: EntryKind;
  docNo: string | null;
  onDate: Day;
  amount: Fils;
}

export interface AllocationPreview {
  /** المبلغ موقّعاً كما ينكتب. */
  amount: Fils;
  balanceBefore: Fils;
  balanceAfter: Fils;
  allocations: readonly PlannedLine[];
  surplus: Fils;
}

export function parsePreview(value: unknown): AllocationPreview {
  const money = object(object(value, 'preview').money, 'money');
  return {
    amount: filsOf(money, 'amount'),
    balanceBefore: filsOf(money, 'balance_before'),
    balanceAfter: filsOf(money, 'balance_after'),
    allocations: list(money.allocations, 'allocations').map((item) => {
      const row = object(item, 'allocations');
      const kind = row.kind;
      if (typeof kind !== 'string' || !(ENTRY_KINDS as readonly string[]).includes(kind)) throw new LedgerShapeError('kind');
      return { entryId: str(row, 'entry_id'), kind: kind as EntryKind, docNo: optStr(row, 'doc_no'), onDate: day(row, 'on_date'), amount: filsOf(row, 'amount') };
    }),
    surplus: filsOf(money, 'surplus'),
  };
}

/** نفس محرّك الترحيل بلا كتابة (FOUNDATION ٧٧٠). amount موجب (أو موقّع للتسوية والافتتاح). */
export async function previewAllocation(partyId: string, bookId: string, kind: PreviewKind, amount: Fils): Promise<AllocationPreview> {
  return parsePreview(await call<unknown>('preview_party_allocation', { p_party: partyId, p_book: bookId, p_kind: kind, p_amount: dinarText(amount) }));
}

export interface PostedEntry {
  id: string;
  kind: EntryKind;
  docNo: string | null;
  onDate: Day;
  /** null إذا الخادم أخفى المال (دور بلا كلف). */
  amount: Fils | null;
  remaining: Fils | null;
}

export function parsePosted(value: unknown): PostedEntry {
  const json = object(value, 'posted');
  const kind = json.kind;
  if (typeof kind !== 'string' || !(ENTRY_KINDS as readonly string[]).includes(kind)) throw new LedgerShapeError('kind');
  const money = json.money === undefined ? null : object(json.money, 'money');
  return { id: str(json, 'id'), kind: kind as EntryKind, docNo: optStr(json, 'doc_no'), onDate: day(json, 'on_date'), amount: money ? filsOf(money, 'amount') : null, remaining: money ? optFils(money, 'remaining') : null };
}

export interface PaymentInput {
  partyId: string;
  bookId: string;
  /** موجب، بالدينار الصحيح. */
  amount: Fils;
  accountId: string;
  onDate: Day;
}

/** «قبضنا»: الجهة دفعتلنا (payment سالب ورقمه RC، وحركة صندوق داخلة). */
export async function recordPayment(ref: PostRef, input: PaymentInput): Promise<PostedEntry> {
  return parsePosted(
    await call<unknown>('record_party_payment', { p_id: ref.id, p_party: input.partyId, p_book: input.bookId, p_amount: dinarText(input.amount), p_account: input.accountId, p_on_date: input.onDate, p_client_ref: ref.clientRef }),
  );
}

/** «دفعنا»: إحنا دفعنا للجهة (payout موجب ورقمه PY، وحركة صندوق خارجة). */
export async function payParty(ref: PostRef, input: PaymentInput): Promise<PostedEntry> {
  return parsePosted(
    await call<unknown>('pay_party', { p_id: ref.id, p_party: input.partyId, p_book: input.bookId, p_amount: dinarText(input.amount), p_account: input.accountId, p_on_date: input.onDate, p_client_ref: ref.clientRef }),
  );
}

/** رصيد الجهة الافتتاحي بدفتر (موقّع: موجب «عليه»، سالب «له»)، بيوم التشغيل أو قبله. */
export async function recordOpeningBalance(ref: PostRef, input: { partyId: string; bookId: string; amount: Fils; onDate: Day }): Promise<PostedEntry> {
  return parsePosted(await call<unknown>('record_opening_balance', { p_id: ref.id, p_party: input.partyId, p_book: input.bookId, p_amount: dinarText(input.amount), p_on_date: input.onDate, p_client_ref: ref.clientRef }));
}

/** تسوية: debit «عليه» أو credit «له»، بسببها. */
export async function adjust(ref: PostRef, input: { partyId: string; bookId: string; direction: 'debit' | 'credit'; amount: Fils; onDate: Day; reason: string }): Promise<PostedEntry> {
  return parsePosted(
    await call<unknown>('record_party_adjustment', {
      p_id: ref.id,
      p_party: input.partyId,
      p_book: input.bookId,
      p_direction: input.direction,
      p_amount: dinarText(input.amount),
      p_on_date: input.onDate,
      p_reason: input.reason,
      p_client_ref: ref.clientRef,
    }),
  );
}

/** إعفاء من رصيد الدفتر (بعكس إشارته). */
export async function forgive(ref: PostRef, input: { partyId: string; bookId: string; amount: Fils; onDate: Day; reason: string }): Promise<PostedEntry> {
  return parsePosted(await call<unknown>('forgive_debt', { p_id: ref.id, p_party: input.partyId, p_book: input.bookId, p_amount: dinarText(input.amount), p_on_date: input.onDate, p_reason: input.reason, p_client_ref: ref.clientRef }));
}

/** إلغاء قبض أو دفع (ويّاه حركة الصندوق). */
export async function voidPayment(clientRef: string, entryId: string, reason: string): Promise<PostedEntry> {
  return parsePosted(await call<unknown>('void_party_payment', { p_id: entryId, p_reason: reason, p_client_ref: clientRef }));
}

/** إلغاء افتتاح أو تسوية أو إعفاء. */
export async function voidEntry(clientRef: string, entryId: string, reason: string): Promise<PostedEntry> {
  return parsePosted(await call<unknown>('void_party_entry', { p_id: entryId, p_reason: reason, p_client_ref: clientRef }));
}
