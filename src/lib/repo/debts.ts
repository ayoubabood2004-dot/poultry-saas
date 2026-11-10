import type { Day } from '../../domain/dates';
import { decimalText } from '../../domain/decimal';
import type { DivisionKind } from '../../domain/divisions';
import type { Fils } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { call } from './core';
import type { BookCode, EntryKind } from './parties';
import {
  BOOK_CODES,
  divisionKind,
  entryKind,
  fils,
  flag,
  list,
  object,
  oneOf,
  optStr,
  parseAging,
  str,
  StatementShapeError,
  whole,
  type Aging,
  type Row,
} from './statement';

// قائمة الذمم «لنا عند الناس» و«علينا للناس» (عقد 0024 §4.3، الخطّة §8.1 «1-ج» و§9.4): صفّ لكلّ جهة رصيدُ جهتها في الدفاتر المختارة
// أكبر من صفر (الدفاتر لا تُقاصّ بعضها)، بأعمار مفتوحها وآخر حركة وآخر تسديد، والمجموع وتوزيعه على الأعمار للمجموعة المفلترة كلّها (لا
// للصفحة). الصفحات بمؤشّر يرجعه الخادم كما هو (درس 2026-11-09: لا برقم الصفّ). ملف كسول تستورده صفحة الذمم وحدها (write-guard).

export type DebtSide = 'receivable' | 'payable';
export type DebtSort = 'amount' | 'age' | 'name';
export const DEBT_SIDES: readonly DebtSide[] = ['receivable', 'payable'];

/** مؤشّر الصفحة التالية كما يرجعه الخادم (كائن غير مفهوم للشاشة)، ويُعاد له نفسه. */
export type DebtsCursor = Readonly<Record<string, unknown>>;

export interface DebtBook {
  bookId: string;
  divisionId: string;
  divisionKind: DivisionKind;
  code: BookCode;
  name: string;
}

export interface DebtRow {
  partyId: string;
  name: string;
  nameNorm: string;
  phone: string | null;
  archived: boolean;
  version: number;
  isCustomer: boolean;
  isSupplier: boolean;
  /** رصيد الجهة في هذا الجانب: مجموع حصّة الجانب من كلّ دفتر مفلتر. */
  amount: Fils;
  /** كلّ دفتر مفلتر رصيد الجهة فيه غير صفر، موقّعاً (موجب «عليه»، سالب «له»). */
  cells: readonly { bookId: string; closing: Fils }[];
  /** أقدم قيد مفتوح في هذا الجانب وعمره بالأيام (اليوم). */
  oldest: Day | null;
  ageDays: number | null;
  aging: Aging;
  lastMove: { onDate: Day; kind: EntryKind; docNo: string | null } | null;
  lastSettlement: { onDate: Day; amount: Fils; docNo: string | null; entryId: string } | null;
}

export interface DebtsOverview {
  side: DebtSide;
  today: Day;
  /** دفاتر النطاق بعد فلتر القسم أو الدفتر. */
  books: readonly DebtBook[];
  /** للمجموعة المفلترة كلّها (البحث والحدّ الأدنى وما فوق 90 يوماً)، لا للصفحة. */
  totals: { amount: Fils; parties: number; aging: Aging };
  rows: readonly DebtRow[];
  next: DebtsCursor | null;
}

const nullable = <T>(row: Row, field: string, read: (value: unknown) => T): T | null => (row[field] === null || row[field] === undefined ? null : read(row[field]));

function parseRow(value: unknown): DebtRow {
  const row = object(value, 'rows');
  if (typeof row.name_norm !== 'string') throw new StatementShapeError('name_norm');
  return {
    partyId: str(row, 'party_id'),
    name: str(row, 'name'),
    nameNorm: row.name_norm,
    phone: optStr(row, 'phone'),
    archived: flag(row, 'archived'),
    version: whole(row, 'version'),
    isCustomer: flag(row, 'is_customer'),
    isSupplier: flag(row, 'is_supplier'),
    amount: fils(row, 'amount'),
    cells: list(row.cells, 'cells').map((item) => {
      const cell = object(item, 'cells');
      return { bookId: str(cell, 'book_id'), closing: fils(cell, 'closing') };
    }),
    oldest: optStr(row, 'oldest'),
    ageDays: row.age_days === null || row.age_days === undefined ? null : whole(row, 'age_days'),
    aging: parseAging(row.aging),
    lastMove: nullable(row, 'last_move', (item) => {
      const move = object(item, 'last_move');
      return { onDate: str(move, 'on_date'), kind: entryKind(move), docNo: optStr(move, 'doc_no') };
    }),
    lastSettlement: nullable(row, 'last_settlement', (item) => {
      const settlement = object(item, 'last_settlement');
      return { onDate: str(settlement, 'on_date'), amount: fils(settlement, 'amount'), docNo: optStr(settlement, 'doc_no'), entryId: str(settlement, 'entry_id') };
    }),
  };
}

export function parseDebtsOverview(value: unknown): DebtsOverview {
  const json = object(value, 'debts_overview');
  const totals = object(json.totals, 'totals');
  return {
    side: oneOf(json, 'side', DEBT_SIDES),
    today: str(json, 'today'),
    books: list(json.books, 'books').map((item) => {
      const book = object(item, 'books');
      return { bookId: str(book, 'book_id'), divisionId: str(book, 'division_id'), divisionKind: divisionKind(book), code: oneOf(book, 'code', BOOK_CODES), name: str(book, 'name') };
    }),
    totals: { amount: fils(totals, 'amount'), parties: whole(totals, 'parties'), aging: parseAging(totals.aging) },
    rows: list(json.rows, 'rows').map(parseRow),
    next: json.next === null || json.next === undefined ? null : object(json.next, 'next'),
  };
}

export interface DebtsQuery {
  side: DebtSide;
  divisionId?: string | null;
  bookId?: string | null;
  /** بالاسم (مطبَّعاً مثل private.searchable) أو بأرقام الهاتف. */
  search?: string;
  sort?: DebtSort;
  /** الحدّ الأدنى للرصيد، أو null. */
  min?: Fils | null;
  /** ما تجاوز عمر أقدم دينه 90 يوماً وحده. */
  over90?: boolean;
  after?: DebtsCursor | null;
  limit?: number;
}

export const DEBTS_PAGE = 50;

/** صفحة من قائمة الذمم (as of اليوم بالخادم). */
export async function loadDebts({ side, divisionId = null, bookId = null, search = '', sort = 'amount', min = null, over90 = false, after = null, limit = DEBTS_PAGE }: DebtsQuery): Promise<DebtsOverview> {
  return parseDebtsOverview(
    await call<unknown>('debts_overview', {
      p_side: side,
      p_division: divisionId,
      p_book: bookId,
      p_search: searchable(search.trim()) || null,
      p_sort: sort,
      p_min: min === null ? null : decimalText(min, 2),
      p_over90: over90,
      p_after: after,
      p_limit: limit,
    }),
  );
}
