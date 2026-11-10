import { Printer } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/ui/Button';
import { DataTable, Num, type Column } from '../../../components/ui/DataTable';
import { LoadFailed } from '../../../components/ui/LoadFailed';
import { Notice } from '../../../components/ui/Notice';
import { addDays, localDay, type Day } from '../../../domain/dates';
import type { Fils } from '../../../domain/money';
import { describeError, NotConnectedError } from '../../../lib/errors';
import { fmtDay, fmtMoney } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import * as money from '../../../lib/repo/money';
import type { MoneyMove, MoneyMoves } from '../../../lib/repo/money';
import { useSession } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { cashKindLabel } from '../shared';
import { A4_PORTRAIT, dayParam, DocCell, LINK, moneyDecimals, moveMemo, PILL, printAs, Signatures, withBack } from './shared';

// «يومية الصندوق» (عقد 0024 §4.2 وF2، خطّة المحاسبة §9.3): صندوق واحد ليوم واحد بنداء واحد (money_moves(اليوم، اليوم، الصندوق، …، 500)): رصيد أوّل
// اليوم، ثمّ حركاته (رقم السند | الجهة | البيان | وارد | صادر | الرصيد)، ثمّ مجموع اليوم ورصيد آخره من الخادم، وسهمان لليوم السابق والتالي (لا يوم بعد
// اليوم)، وتُطبع A4 بعنوانها وبسطري توقيع «أمين الصندوق» و«المحاسب». عدّ الصندوق وفرقه مؤجَّلان (يحتاجان حسابات الدفتر العام، المرحلة 2).

type BookLine = { kind: 'opening'; balance: Fils | null } | { kind: 'move'; move: MoneyMove };

export function DayBook({ data }: { data: MoneyMoves }) {
  const lines: BookLine[] = [{ kind: 'opening', balance: data.opening }, ...data.rows.map((move): BookLine => ({ kind: 'move', move }))];
  const values: Fils[] = [data.totals.inflow, data.totals.outflow];
  for (const value of [data.opening, data.closing, ...data.rows.flatMap((row) => [row.inflow, row.outflow, row.balance])]) if (value !== null) values.push(value);
  const decimals = moneyDecimals(values);
  const amount = (value: Fils | null) => (value === null ? null : <Num>{fmtMoney(value, decimals)}</Num>);
  const side = (value: Fils) => (value === 0n ? null : amount(value));
  // الرجوع من كشف الجهة والسند والفاتورة والاستلام إلى يومية هذا الصندوق بيومها (backTarget في كلّ منها يقبل المسار الداخليّ بسؤاله،
  // مراجعة 0024 M4).
  const back = data.account ? `/accounts/cash/${data.account.id}/day?on=${data.from}` : '/accounts/cash';
  const columns: Column<BookLine>[] = [
    { key: 'doc', header: t('moves.col.doc', 'رقم السند'), cell: (line) => (line.kind === 'move' ? <DocCell row={line.move} back={back} /> : null) },
    {
      key: 'party',
      header: t('moves.col.party', 'الجهة'),
      cell: (line) =>
        line.kind === 'move' && line.move.partyId && line.move.partyName ? (
          <Link to={withBack(`/accounts/parties/${line.move.partyId}`, back)} className={LINK} data-action="move-party">
            {line.move.partyName}
          </Link>
        ) : null,
    },
    {
      key: 'memo',
      header: t('ledger.memo', 'البيان'),
      wrap: true,
      cell: (line) => (line.kind === 'move' ? moveMemo(line.move, true) : <span className="font-semibold">{t('cashday.opening', 'رصيد أوّل اليوم')}</span>),
    },
    { key: 'in', header: t('ledger.cash.in', 'وارد'), kind: 'number', cell: (line) => (line.kind === 'move' ? side(line.move.inflow) : null), total: amount(data.totals.inflow) },
    { key: 'out', header: t('ledger.cash.out', 'صادر'), kind: 'number', cell: (line) => (line.kind === 'move' ? side(line.move.outflow) : null), total: amount(data.totals.outflow) },
    {
      key: 'balance',
      header: t('ledger.balance', 'الرصيد'),
      kind: 'number',
      cell: (line) => amount(line.kind === 'move' ? line.move.balance : line.balance),
      total: amount(data.closing),
    },
  ];
  return (
    <DataTable
      caption={t('cashday.title', 'يومية الصندوق')}
      columns={columns}
      rows={lines}
      rowKey={(line) => (line.kind === 'move' ? line.move.moveId : 'opening')}
      empty=""
      totalLabel={t('cashday.total', 'مجموع اليوم')}
    />
  );
}

/** الأرقام الأربعة فوق اليومية: رصيد أوّل اليوم والوارد والصادر ورصيد آخره. */
function DayStats({ data }: { data: MoneyMoves }) {
  const values = [data.totals.inflow, data.totals.outflow, ...(data.opening === null ? [] : [data.opening]), ...(data.closing === null ? [] : [data.closing])];
  const decimals = moneyDecimals(values);
  const stats: { key: string; label: string; value: Fils | null }[] = [
    { key: 'opening', label: t('cashday.opening', 'رصيد أوّل اليوم'), value: data.opening },
    { key: 'in', label: t('ledger.cash.in', 'وارد'), value: data.totals.inflow },
    { key: 'out', label: t('ledger.cash.out', 'صادر'), value: data.totals.outflow },
    { key: 'closing', label: t('cashday.closing', 'رصيد آخر اليوم'), value: data.closing },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-action="cashday-stats">
      {stats.map((stat) => (
        <div key={stat.key} className="card p-3" data-action={`cashday-${stat.key}`}>
          <dt className="text-xs text-ink-muted">{stat.label}</dt>
          <dd className={`text-lg font-semibold ${stat.value !== null && stat.value < 0n ? 'text-danger-700 dark:text-danger-300' : ''}`}>{stat.value === null ? '—' : <Num>{fmtMoney(stat.value, decimals)}</Num>}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function CashDayPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const session = useSession();
  const orgId = session.status === 'ready' ? session.workspace.orgId : 'none';
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  const today = localDay();
  const on: Day = dayParam(params.get('on')) ?? today;
  const load = useCallback(() => money.loadCashDay(id, on), [id, on]);
  const book = useLoad(load, `${orgId}|${id}|${on}`);
  const account = book.data?.account ?? null;
  const title = account ? t('cashday.of', 'يومية «{name}»', { name: account.name }) : t('cashday.title', 'يومية الصندوق');
  const header = (
    <PageHeader
      title={title}
      subtitle={account ? t('cashday.subtitle', '{kind} — {day}', { kind: cashKindLabel(account.kind), day: fmtDay(on) }) : fmtDay(on)}
      actions={
        book.data ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<Printer aria-hidden="true" className="size-4" />}
            onClick={() => printAs(t('cashday.print.title', 'يومية الصندوق — {name} — {day}', { name: account?.name ?? '', day: fmtDay(on) }))}
            data-action="print-cash-day"
            data-print="hide"
          >
            {t('statement.print', 'اطبع')}
          </Button>
        ) : undefined
      }
    />
  );
  if (book.error instanceof NotConnectedError) {
    const { title: errorTitle, detail } = describeError(book.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={errorTitle}>
          {detail}
        </Notice>
      </div>
    );
  }
  const previous = addDays(on, -1);
  const next = addDays(on, 1);
  return (
    <div className="flex min-w-0 flex-col gap-4" data-print-area>
      <style>{A4_PORTRAIT}</style>
      {orgName ? <p className="hidden text-sm text-ink-muted print:block">{orgName}</p> : null}
      {header}
      <Link to={`/accounts/cash/${id}`} className={`${LINK} text-sm`} data-print="hide">
        {t('cashday.back', 'عُد إلى كشف الصندوق')}
      </Link>
      <nav className="flex flex-wrap items-center gap-2" aria-label={t('cashday.days', 'الأيام')} data-print="hide">
        <Link to={`/accounts/cash/${id}/day?on=${previous}`} className={PILL} data-action="cash-day-previous">
          {t('cashday.previous', 'اليوم السابق')}
        </Link>
        {on < today ? (
          <Link to={`/accounts/cash/${id}/day?on=${next}`} className={PILL} data-action="cash-day-next">
            {t('cashday.next', 'اليوم التالي')}
          </Link>
        ) : null}
        {on !== today ? (
          <Link to={`/accounts/cash/${id}/day`} className={`${LINK} text-sm`} data-action="cash-day-today">
            {t('cashday.today', 'اليوم')}
          </Link>
        ) : null}
      </nav>
      {book.error ? (
        <LoadFailed what={t('cashday.title', 'يومية الصندوق')} error={book.error} onRetry={book.retry} />
      ) : !book.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <DayStats data={book.data} />
          {book.data.next ? (
            <Notice tone="warning" title={t('cashday.more', 'في هذا اليوم حركات أكثر ممّا يُعرض هنا')}>
              <Link to={`/accounts/moves?account=${id}&from=${on}&to=${on}`} className={LINK}>
                {t('cashday.more.link', 'افتحها كلّها في حركة الأموال')}
              </Link>
            </Notice>
          ) : null}
          {book.data.rows.length === 0 ? <p className="text-sm text-ink-muted">{t('cashday.empty', 'لا حركة في هذا الصندوق في هذا اليوم.')}</p> : null}
          <DayBook data={book.data} />
          <Signatures names={[t('cashday.cashier', 'أمين الصندوق'), t('cashday.accountant', 'المحاسب')]} />
        </>
      )}
    </div>
  );
}
