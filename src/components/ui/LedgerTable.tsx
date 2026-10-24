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

function Balance({ balance, decimals }: { balance: Fils; decimals: 0 | 2 }) {
  const side = balanceSide(balance);
  const abs = balance < 0n ? -balance : balance;
  return (
    <span className="flex items-center justify-between gap-3">
      {money(abs, decimals)}
      {side ? (
        <span className="text-2xs font-normal text-ink-muted">
          {side === 'debit' ? t('ledger.side.debit', 'عليه') : t('ledger.side.credit', 'له')}
        </span>
      ) : null}
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
}: {
  caption: string;
  entries: readonly LedgerEntry[];
  /** الرصيد قبل أوّل سطر: سطر «رصيد سابق» إذا مو صفر. */
  opening?: Fils;
  decimals?: 0 | 2;
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
      header: t('ledger.debit', 'عليه'),
      kind: 'number',
      cell: (row) => (row.debit === 0n ? null : money(row.debit, decimals)),
      total: money(ledger.totalDebit, decimals),
    },
    {
      key: 'credit',
      header: t('ledger.credit', 'له'),
      kind: 'number',
      cell: (row) => (row.credit === 0n ? null : money(row.credit, decimals)),
      total: money(ledger.totalCredit, decimals),
    },
    {
      key: 'balance',
      header: t('ledger.balance', 'الرصيد'),
      kind: 'number',
      cell: (row) => <Balance balance={row.balance} decimals={decimals} />,
      total: <Balance balance={ledger.closing} decimals={decimals} />,
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
