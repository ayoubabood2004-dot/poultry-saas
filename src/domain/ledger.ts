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
