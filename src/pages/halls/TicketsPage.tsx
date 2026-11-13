import { useCallback, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import type { Day } from '../../domain/dates';
import { parseDayText } from '../../lib/dayText';
import { RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadWeighTickets, TICKET_FILTERS, type TicketFilter, type TicketList, type TicketRow } from '../../lib/repo/weighTickets';
import { useLoad } from '../../lib/useLoad';
import { BackLink } from './parts';
import { kgDecimals, newTicketPath, salePath, statusLabel, ticketBack, ticketBackLabel, ticketName, ticketPath, ticketsCount } from './ticketParts';

// تذاكر الوزن (0028، العقد §5.3 و§10): /halls/tickets?status=&from=&to= بقراءة weigh_tickets واحدة، جدول كلاسيكي بالأحدث أوّلاً ومجاميع غير الملغاة من
// الخادم، والحالة («بانتظار الفاتورة» مكتملة بلا فاتورة مرحّلة) والمدّة في الرابط (اليومان معاً أو لا شيء). ومنها كلّ تذكرة برجوع إلى هنا، و«تذكرة وزن
// جديدة» لمن يكتبها. بلا مال؛ والفاتورة رقمها لأدوار المبيعات وحدها (من الخادم).

const dash = () => t('halls.tickets.dash', '—');
const isDay = (value: string | null): value is Day => value !== null && /^\d{4}-\d{2}-\d{2}$/u.test(value) && parseDayText(value.split('-').reverse().join('/')) === value;

function filterLabel(filter: TicketFilter): string {
  switch (filter) {
    case 'all':
      return t('halls.tickets.filter.all', 'الكلّ');
    case 'draft':
      return t('halls.tickets.filter.draft', 'المسوّدات');
    case 'done':
      return t('halls.tickets.filter.done', 'المكتملة');
    case 'awaiting':
      return t('halls.tickets.filter.awaiting', 'بانتظار الفاتورة');
    case 'void':
      return t('halls.tickets.filter.void', 'الملغاة');
  }
}

function PeriodForm({ from, to, onApply }: { from: Day | null; to: Day | null; onApply: (from: Day | null, to: Day | null) => void }) {
  const id = useId();
  const [fromText, setFromText] = useState(from ? fmtDay(from) : '');
  const [toText, setToText] = useState(to ? fmtDay(to) : '');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (fromText.trim() === '' && toText.trim() === '') {
      onApply(null, null);
      return;
    }
    const start = parseDayText(fromText);
    const end = parseDayText(toText);
    if (!start || !end) {
      setError(t('halls.tickets.period_both', 'اكتب اليومين معاً (يوم/شهر/سنة)، أو اتركهما فارغين لكلّ الأيّام.'));
      return;
    }
    if (start > end) {
      setError(t('halls.tickets.period_order', 'أوّل المدّة بعد آخرها.'));
      return;
    }
    setError(null);
    onApply(start, end);
  };
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={submit} noValidate data-action="tickets-period">
      <Field id={`${id}-from`} label={t('halls.tickets.from', 'من')} error={error}>
        <input
          id={`${id}-from`}
          className="input w-32 tabular-nums"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')}
          value={fromText}
          onChange={(event) => setFromText(event.target.value)}
          data-action="tickets-from"
        />
      </Field>
      <Field id={`${id}-to`} label={t('halls.tickets.to', 'إلى')}>
        <input
          id={`${id}-to`}
          className="input w-32 tabular-nums"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')}
          value={toText}
          onChange={(event) => setToText(event.target.value)}
          data-action="tickets-to"
        />
      </Field>
      <Button type="submit" size="sm" variant="secondary" data-action="tickets-apply">
        {t('halls.tickets.apply', 'اعرض')}
      </Button>
    </form>
  );
}

function TicketsTable({ list, here }: { list: TicketList; here: string }) {
  const kg = kgDecimals([...list.rows.map((row) => row.netKg), list.totals.netKg]);
  const columns: Column<TicketRow>[] = [
    {
      key: 'no',
      header: t('halls.tickets.col.ticket', 'التذكرة'),
      sticky: true,
      cell: (row) => (
        <Link to={ticketPath(row.id, here)} className="font-semibold text-brand-700 dark:text-brand-200" data-action="tickets-open" data-id={row.id}>
          <bdi dir="ltr">{ticketName(row.ticketNo)}</bdi>
        </Link>
      ),
    },
    { key: 'day', header: t('halls.tickets.col.day', 'اليوم'), cell: (row) => <Num>{fmtDay(row.onDate)}</Num> },
    { key: 'site', header: t('halls.tickets.col.site', 'الحقل'), cell: (row) => row.siteName },
    { key: 'halls', header: t('halls.tickets.col.halls', 'القاعات'), wrap: true, cell: (row) => row.halls.join(t('list.separator', '، ')) },
    { key: 'birds', header: t('halls.ticket.col.birds', 'الطيور'), kind: 'number', cell: (row) => (row.birds === null ? dash() : <Num>{fmtInt(row.birds)}</Num>), total: <Num>{fmtInt(list.totals.birds)}</Num> },
    { key: 'net', header: t('halls.ticket.net', 'الصافي (كغم)'), kind: 'number', cell: (row) => (row.netKg === null ? dash() : <Num>{fmtQtyCell(row.netKg, kg)}</Num>), total: <Num>{fmtQtyCell(list.totals.netKg, kg)}</Num> },
    {
      key: 'status',
      header: t('halls.tickets.col.status', 'الحالة'),
      // بانتظار الفاتورة: الأقدم من سبعة أيّام تُؤرَّخ فاتورتها اليوم (أجوبة المالك 2026-11-13)، والممنوعة الآن بسببها (مراجعة 0028 O4).
      cell: (row) => (
        <>
          <span data-action="tickets-status">{statusLabel(row.status, row.invoiced)}</span>
          {row.status === 'done' && !row.invoiced && row.invoiceWhy === null && row.invoiceLate ? (
            <span className="block text-xs text-ink-muted" data-action="tickets-late">
              {t('halls.tickets.late', 'تُؤرَّخ فاتورتها اليوم')}
            </span>
          ) : null}
          {row.status === 'done' && !row.invoiced && row.invoiceWhy !== null ? (
            <span className="block text-xs text-ink-muted" data-action="tickets-why">
              {row.invoiceWhy === 'period_locked'
                ? t('halls.tickets.why.period_locked', 'يومها في فترة مقفلة')
                : row.invoiceWhy === 'out_of_scope'
                  ? t('halls.tickets.why.out_of_scope', 'دفتر وحدتها خارج نطاقك')
                  : t('halls.tickets.why.no_book', 'لا دفتر لوحدتها')}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'sale',
      header: t('halls.tickets.col.sale', 'الفاتورة'),
      cell: (row) =>
        row.sale ? (
          <Link to={salePath(row.sale.id)} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="tickets-sale">
            <bdi dir="ltr">{row.sale.docNo}</bdi>
            {row.sale.status === 'void' ? t('halls.tickets.sale_void', ' (ملغاة)') : null}
          </Link>
        ) : (
          dash()
        ),
    },
  ];
  return (
    <DataTable
      caption={t('halls.tickets.title', 'تذاكر الوزن')}
      columns={columns}
      rows={list.rows}
      rowKey={(row) => row.id}
      empty={t('halls.tickets.empty', 'لا تذاكر بهذا الشرط.')}
      totalLabel={t('halls.tickets.total', 'المجموع ({tickets} غير ملغاة)', { tickets: ticketsCount(list.totals.count) })}
    />
  );
}

export default function TicketsPage() {
  const [search, setSearch] = useSearchParams();
  const backParam = search.get('back');
  const back = ticketBack(backParam, '/reports');
  const statusParam = search.get('status');
  const status: TicketFilter = TICKET_FILTERS.includes(statusParam as TicketFilter) ? (statusParam as TicketFilter) : 'all';
  const fromParam = search.get('from');
  const toParam = search.get('to');
  // المدّة اليومان معاً أو لا شيء.
  const from: Day | null = isDay(fromParam) && isDay(toParam) && fromParam <= toParam ? fromParam : null;
  const to: Day | null = from !== null && isDay(toParam) ? toParam : null;
  const load = useCallback(() => loadWeighTickets(from, to, status), [from, to, status]);
  const state = useLoad(load);
  const list = state.data;
  // رجوع التذكرة إلى هذه الصفحة بحالتها ومدّتها ورجوعها هي.
  const hereParams = new URLSearchParams();
  if (status !== 'all') hereParams.set('status', status);
  if (from !== null && to !== null) {
    hereParams.set('from', from);
    hereParams.set('to', to);
  }
  if (backParam !== null && back === backParam) hereParams.set('back', backParam);
  const query = hereParams.toString();
  const here = `/halls/tickets${query ? `?${query}` : ''}`;
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearch(next);
  };
  return (
    <div className="flex flex-col gap-4" data-action="tickets-page">
      <BackLink to={back} label={ticketBackLabel(back)} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('halls.tickets.title', 'تذاكر الوزن')}</h1>
        {list?.canCreate ? (
          <Link to={newTicketPath(null, null, here)} className="inline-flex h-9 items-center rounded-full bg-brand-600 px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-700" data-action="tickets-new">
            {t('halls.ticket.new', 'تذكرة وزن جديدة')}
          </Link>
        ) : null}
      </header>
      <Segmented label={t('halls.tickets.filter', 'الحالة')} options={TICKET_FILTERS.map((value) => ({ value, label: filterLabel(value) }))} value={status} onChange={(value) => set({ status: value === 'all' ? null : value })} />
      <PeriodForm key={`${from ?? ''}|${to ?? ''}`} from={from} to={to} onApply={(start, end) => set({ from: start, to: end })} />
      {state.error ? (
        state.error instanceof RejectedError && state.error.hint ? (
          <Notice tone="warning" title={state.error.hint} />
        ) : (
          <LoadFailed what={t('halls.tickets.what', 'تذاكر الوزن')} error={state.error} onRetry={state.retry} />
        )
      ) : list ? (
        <>
          {list.more ? <Notice tone="info" title={t('halls.tickets.more', 'المعروض أحدث 500 تذكرة؛ ضيّق المدّة لترى ما قبلها.')} /> : null}
          <TicketsTable list={list} here={here} />
        </>
      ) : (
        <p role="status" className="text-sm text-ink-muted" data-action="tickets-loading">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      )}
    </div>
  );
}
