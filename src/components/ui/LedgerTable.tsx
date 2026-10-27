import { balanceSide, runLedger, type LedgerEntry, type LedgerLine } from '../../domain/ledger';
import type { Fils } from '../../domain/money';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { DataTable, Num, type Column } from './DataTable';

// كشف الحساب الكلاسيكي اللي اختاره المالك (2026-10-24): التاريخ | المستند | البيان | عليه | له | الرصيد.
// خانة الجهة الفارغة تبقى فارغة مثل الدفتر الورقي (مو «0»)، والرصيد رقمه على خانة الآحاد وجهته بالطرف الثاني.

/** مبلغ الدفتر: دينار صحيح (القرار 8) إلا إذا الكشف بمرتبتين. */
function money(amount: Fils, decimals: 0 | 2) {
  return <Num>{fmtMoney(amount, decimals)}</Num>;
}

/**
 * أسماء الجهتين: «عليه | له» لكشف الجهة (DECISIONS ٢١)، و«وارد | صادر» لكشف الصندوق (Q12). كلمة جهة الرصيد للصندوق تبقى
 * فارغة: الرصيد الموجب رصيد عادي والسالب بإشارته (السالب مسموح ويّا تنبيه، Q10).
 */
export interface SideLabels {
  debit: string;
  credit: string;
  /** كلمة جهة الرصيد بجنبه، أو null بلا كلمة (الرقم بإشارته). */
  balanceDebit: string | null;
  balanceCredit: string | null;
}

export function partySides(): SideLabels {
  return {
    debit: t('ledger.debit', 'عليه'),
    credit: t('ledger.credit', 'له'),
    balanceDebit: t('ledger.side.debit', 'عليه'),
    balanceCredit: t('ledger.side.credit', 'له'),
  };
}

export function cashSides(): SideLabels {
  return { debit: t('ledger.cash.in', 'وارد'), credit: t('ledger.cash.out', 'صادر'), balanceDebit: null, balanceCredit: null };
}

function Balance({ balance, decimals, sides }: { balance: Fils; decimals: 0 | 2; sides: SideLabels }) {
  const side = balanceSide(balance);
  const word = side === 'debit' ? sides.balanceDebit : side === 'credit' ? sides.balanceCredit : null;
  // بلا كلمة جهة (الصندوق) الرقم بإشارته: السالب ما ينخفي كرصيد موجب.
  const shown = word === null ? balance : balance < 0n ? -balance : balance;
  return (
    <span className="flex items-center justify-between gap-3">
      {money(shown, decimals)}
      {word ? <span className="text-2xs font-normal text-ink-muted">{word}</span> : null}
    </span>
  );
}

interface Row extends LedgerLine {
  opening?: true;
}

export function LedgerTable({
  caption,
  entries,
  opening = 0n,
  decimals = 0,
  sides = partySides(),
}: {
  caption: string;
  entries: readonly LedgerEntry[];
  /** الرصيد قبل أوّل سطر: سطر «رصيد سابق» إذا مو صفر. */
  opening?: Fils;
  decimals?: 0 | 2;
  /** أسماء عمودي المبلغ وجهة الرصيد (الافتراض عليه | له). */
  sides?: SideLabels;
}) {
  const ledger = runLedger(entries, opening);
  const rows: Row[] =
    opening !== 0n
      ? [{ date: '', doc: '', memo: t('ledger.opening', 'رصيد سابق'), debit: 0n, credit: 0n, balance: opening, opening: true }, ...ledger.lines]
      : ledger.lines;

  const columns: Column<Row>[] = [
    { key: 'date', header: t('ledger.date', 'التاريخ'), cell: (row) => (row.opening ? null : <Num>{fmtDay(row.date)}</Num>) },
    { key: 'doc', header: t('ledger.doc', 'المستند'), cell: (row) => (row.doc ? <Num>{row.doc}</Num> : null) },
    { key: 'memo', header: t('ledger.memo', 'البيان'), wrap: true, cell: (row) => row.memo },
    {
      key: 'debit',
      header: sides.debit,
      kind: 'number',
      cell: (row) => (row.debit === 0n ? null : money(row.debit, decimals)),
      total: money(ledger.totalDebit, decimals),
    },
    {
      key: 'credit',
      header: sides.credit,
      kind: 'number',
      cell: (row) => (row.credit === 0n ? null : money(row.credit, decimals)),
      total: money(ledger.totalCredit, decimals),
    },
    {
      key: 'balance',
      header: t('ledger.balance', 'الرصيد'),
      kind: 'number',
      cell: (row) => <Balance balance={row.balance} decimals={decimals} sides={sides} />,
      total: <Balance balance={ledger.closing} decimals={decimals} sides={sides} />,
    },
  ];

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(row, index) => (row.opening ? 'opening' : `${index}-${row.doc}`)}
      empty={t('ledger.empty', 'لا توجد قيود بعد.')}
      totalLabel={t('ledger.total', 'المجموع')}
    />
  );
}
