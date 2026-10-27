import type { Day } from './dates';
import type { Fils } from './money';

// كشف الحساب الكلاسيكي «مدين ودائن ورصيد» (قانون المالك للجداول، docs/DECISIONS.md 2026-10-24):
// التاريخ | المستند | البيان | عليه | له | الرصيد. «عليه» = الجهة مطلوبة إلنا (مدين)، «له» = إحنا مطلوبين إلها (دائن).
// الرصيد الجاري = السابق + عليه − له: موجب «عليه»، سالب «له». كل سطر بجهة وحدة، مثل الدفتر الورقي.
// المجاميع هنا للعرض بس: الرصيد الحقيقي يحسبه الخادم، والكشف يتحقّق إن مجموعه يطابقه.

export interface LedgerEntry {
  date: Day;
  /** رقم المستند المعروض («CH-2026-0001»). */
  doc: string;
  memo: string;
  debit: Fils;
  credit: Fils;
}

export interface LedgerLine extends LedgerEntry {
  balance: Fils;
}

export interface Ledger {
  opening: Fils;
  lines: LedgerLine[];
  totalDebit: Fils;
  totalCredit: Fils;
  closing: Fils;
}

/** جهة الرصيد: موجب عليه، سالب له، والصفر بلا جهة. */
export type BalanceSide = 'debit' | 'credit' | null;

export function balanceSide(balance: Fils): BalanceSide {
  if (balance > 0n) return 'debit';
  if (balance < 0n) return 'credit';
  return null;
}

/** قيد بدفتره: الكشف «الكل» يكدّس الدفاتر، وكل دفتر برصيده الجاري (E50، FOUNDATION ١١٤). */
export interface BookEntry extends LedgerEntry {
  bookId: string;
}

/**
 * رصيد جارٍ لكل دفتر (runLedger لكل دفتر بترتيب قيوده)، ومدوَّر لكل دفتر اختياري. دفتر بمدوَّر بلا قيود يبقى بكشفه.
 * فحص الفصل (FOUNDATION ٧٠٣): كل دفتر برقمه، مو المجموع.
 */
export function runBooks(entries: readonly BookEntry[], openings: Readonly<Record<string, Fils>> = {}): Map<string, Ledger> {
  const byBook = new Map<string, LedgerEntry[]>();
  for (const bookId of Object.keys(openings)) byBook.set(bookId, []);
  for (const { bookId, ...entry } of entries) {
    const list = byBook.get(bookId) ?? [];
    list.push(entry);
    byBook.set(bookId, list);
  }
  return new Map([...byBook].map(([bookId, list]) => [bookId, runLedger(list, openings[bookId] ?? 0n)]));
}

/** قيد مفتوح بدفتر (من معاينة الخادم): مبلغه الموقّع ومتبقّيه المقداري وترتيبه. */
export interface OpenEntry {
  id: string;
  /** موقّع: موجب «عليه»، سالب «له». */
  amount: Fils;
  /** المتبقّي المقداري (|المبلغ| − صافي توزيعاته). */
  remaining: Fils;
  /** قيد افتتاح فعّال: يتوزّع عليه أوّلاً (E8). */
  opening: boolean;
  onDate: Day;
  seq: bigint;
}

export interface PlannedAllocation {
  entryId: string;
  /** الحصّة الموجبة. */
  amount: Fils;
}

export interface AllocationPlan {
  allocations: PlannedAllocation[];
  /** الفائض: يبقى رصيداً للجهة بنفس الدفتر. */
  surplus: Fils;
}

const sideOf = (amount: Fils): 1n | -1n => (amount > 0n ? 1n : -1n);

/**
 * مرآة private.allocation_plan (القاعدة 27، FOUNDATION ٤٩٥): مبلغ موقّع يتوزّع على القيود المفتوحة المعاكسة بنفس الدفتر: قيد
 * المستند نفسه أوّلاً (first)، ثم الافتتاح الفعّال، ثم الأقدم (التاريخ ثم seq، مو نصّ رقم المستند)، والباقي فائض. الحزمة
 * تقارنها بـpreview_party_allocation (ledger.test).
 */
export function allocationPlan(open: readonly OpenEntry[], amount: Fils, first: string | null = null): AllocationPlan {
  if (amount === 0n) return { allocations: [], surplus: 0n };
  const side = sideOf(amount);
  const candidates = open
    .filter((entry) => entry.amount !== 0n && sideOf(entry.amount) === -side && entry.remaining > 0n)
    .sort((a, b) => {
      const firstA = a.id === first ? 1 : 0;
      const firstB = b.id === first ? 1 : 0;
      if (firstA !== firstB) return firstB - firstA;
      if (a.opening !== b.opening) return a.opening ? -1 : 1;
      if (a.onDate !== b.onDate) return a.onDate < b.onDate ? -1 : 1;
      return a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0;
    });
  let left = amount < 0n ? -amount : amount;
  const allocations: PlannedAllocation[] = [];
  for (const entry of candidates) {
    if (left === 0n) break;
    const take = entry.remaining < left ? entry.remaining : left;
    allocations.push({ entryId: entry.id, amount: take });
    left -= take;
  }
  return { allocations, surplus: left };
}

/** رصيد (جهة، دفتر) بوحدته. */
export interface BookBalance {
  divisionId: string;
  balance: Fils;
}

export interface SideTotals {
  /** «لنا عند الناس»: Σ max(الرصيد، 0). */
  receivable: Fils;
  /** «علينا للناس»: Σ max(−الرصيد، 0). */
  payable: Fils;
}

/**
 * مرآة report_accounts_summary (FOUNDATION ٤٣٥) للفحوص بس: لكل وحدة «لنا» و«علينا» من أرصدة (جهة، دفتر) بلا تصافٍ بين دفترين
 * ولا جهتين، والمشروع مجموع الوحدات خانةً خانة. الشاشة تاخذ المجاميع من الخادم دائماً (§2.8)، مو من هنا.
 */
export function accountsTotals(rows: readonly BookBalance[]): { divisions: Map<string, SideTotals>; project: SideTotals } {
  const divisions = new Map<string, SideTotals>();
  const project: SideTotals = { receivable: 0n, payable: 0n };
  for (const { divisionId, balance } of rows) {
    const totals = divisions.get(divisionId) ?? { receivable: 0n, payable: 0n };
    if (balance > 0n) totals.receivable += balance;
    else totals.payable -= balance;
    divisions.set(divisionId, totals);
  }
  for (const totals of divisions.values()) {
    project.receivable += totals.receivable;
    project.payable += totals.payable;
  }
  return { divisions, project };
}

export function runLedger(entries: readonly LedgerEntry[], opening: Fils = 0n): Ledger {
  let balance = opening;
  let totalDebit = 0n;
  let totalCredit = 0n;
  const lines = entries.map((entry) => {
    if (entry.debit < 0n || entry.credit < 0n) throw new RangeError('ledger_negative_side');
    if (entry.debit !== 0n && entry.credit !== 0n) throw new RangeError('ledger_both_sides');
    totalDebit += entry.debit;
    totalCredit += entry.credit;
    balance += entry.debit - entry.credit;
    return { ...entry, balance };
  });
  return { opening, lines, totalDebit, totalCredit, closing: balance };
}
