import { HandCoins, Landmark, Plus, Receipt, Wallet } from 'lucide-react';
import { useCallback, useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column, type FooterRow } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import type { DivisionKind } from '../../domain/divisions';
import type { Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError, ZeroRowsError } from '../../lib/errors';
import { fmtInt, fmtMoney, fmtPhone } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as parties from '../../lib/repo/parties';
import type { AccountsSummary, BalancesCursor, BookRef, PartyBalanceRow, PartyBalancesPage, PartyRow, PartySort } from '../../lib/repo/parties';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { bookLabel, defaultPeriod, DIVISION_FILTER, divisionFilterLabel, PartyDialog, PaymentDialog, SideAmount, type PaymentKind } from './shared';

// صفحة الحسابات (خطّة المرحلة 1 WP3، FOUNDATION ١١٣ و٧٨٨، DECISIONS ٢١–٢٢ و٧٣): بالرأس «لنا عند الناس» و«علينا للناس» لكل
// وحدة وللمشروع؛ فلتر الوحدة؛ وجدول الجهات بعمود لكل دفتر بالكلمة «عليه» أو «له» دائماً، وعمود «المجموع» للعرض بس، والإجراءات
// بأوّل عمود والاسم ثابت؛ وصفّا التذييل وعدد «N من المجموع» من دوالّ الخادم، مو من الصفوف المحمّلة (§2.8، الحدّ ألف صفّ). الصفوف
// صفحات بالمعرّف (report_party_balances)، والبحث بالاسم والهاتف، والترتيب بالأكبر أو بأقدم دين أو بالاسم. الأرقام لحد يوم الخادم
// (to = null)، فصفحة مفتوحة من أمس تشوف ترحيل اليوم بعد التحديث. ووحدة الفلتر من قائمة الدفاتر مو من الملخّص: الملخّص الفاشل ما
// يقلب «المعمل» لجدول كل الدفاتر بصمت. والقارئ المحصور (E49) يشوف وحدات نطاقه بس، والمشروع «دفاتر نطاقك».

type Filter = 'all' | DivisionKind;

/** الجهة كصفّ منتقٍ (القبض والدفع والتعديل). */
export const asParty = (row: PartyBalanceRow): PartyRow => ({ id: row.partyId, version: row.version, archived: row.archived, name: row.name, phone: row.phone, isCustomer: row.isCustomer, isSupplier: row.isSupplier });

/** علامة الجهة المؤرشفة: «مؤرشفة وعليها رصيد» إذا الإلغاء خلّى رصيداً (E43)، لتُعاد أو تُسوّى. */
export function partyName(row: Pick<PartyBalanceRow, 'name' | 'archived' | 'cells'>): string {
  if (!row.archived) return row.name;
  const owing = [...row.cells.values()].some((cell) => cell.closing !== 0n);
  return owing ? t('party.archived.owing', '{name} (مؤرشفة وعليها رصيد)', { name: row.name }) : t('party.archived.name', '{name} (مؤرشفة)', { name: row.name });
}

export interface PartiesTableProps {
  page: Pick<PartyBalancesPage, 'books'>;
  rows: readonly PartyBalanceRow[];
  summary: AccountsSummary | null;
  /** الوحدة المختارة بالفلتر: تذييل «المجموع» بأرقامها، أو بأرقام المشروع للكل. */
  divisionId: string | null;
  actions?: (row: PartyBalanceRow) => ReactNode;
}

/**
 * صفّا التذييل من الملخّص (FOUNDATION ٧٨٨): كل دفتر برقمه، والمجموع بأرقام الوحدة أو المشروع. وحدة مو بالملخّص (برّا نطاق القارئ)
 * بلا تذييل، مو «0» كأن ما عليها ديون.
 */
export function summaryFooters(summary: AccountsSummary | null, bookIds: readonly string[], divisionId: string | null): FooterRow[] {
  if (!summary) return [];
  const scope = divisionId ? summary.divisions.find((division) => division.divisionId === divisionId) : summary.project;
  if (!scope) return [];
  const row = (key: 'receivable' | 'payable', label: string): FooterRow => ({
    key,
    label,
    cells: {
      ...Object.fromEntries(bookIds.map((bookId) => [bookId, <Num key={bookId}>{fmtMoney(summary.books.get(bookId)?.[key] ?? 0n, 0)}</Num>])),
      total: <Num>{fmtMoney(scope[key], 0)}</Num>,
    },
  });
  return [row('receivable', t('home.accounts.receivable', 'لنا عند الناس')), row('payable', t('home.accounts.payable', 'علينا للناس'))];
}

export function PartiesTable({ page, rows, summary, divisionId, actions }: PartiesTableProps) {
  const columns: Column<PartyBalanceRow>[] = [
    { key: 'name', header: t('party.name.col', 'الجهة'), sticky: true, cell: (row) => <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/accounts/parties/${row.partyId}`}>{partyName(row)}</Link> },
    { key: 'phone', header: t('party.phone', 'الهاتف'), cell: (row) => (row.phone ? <bdi dir="ltr">{fmtPhone(row.phone)}</bdi> : '—') },
    ...page.books.map((book): Column<PartyBalanceRow> => ({
      key: book.id,
      header: bookLabel(book),
      kind: 'number',
      cell: (row) => <SideAmount amount={row.cells.get(book.id)?.closing ?? 0n} />,
    })),
    { key: 'total', header: t('accounts.col.total', 'المجموع'), kind: 'number', cell: (row) => <SideAmount amount={row.total} /> },
  ];
  if (actions) columns.unshift({ key: 'actions', header: t('org.col.actions', 'إجراءات'), cell: actions });
  return (
    <DataTable
      caption={t('accounts.parties', 'الجهات')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.partyId}
      empty={t('accounts.parties.empty', 'لا جهة بهذا البحث.')}
      footers={summaryFooters(summary, page.books.map((book) => book.id), divisionId)}
    />
  );
}

/** بطاقات الرأس: «لنا» و«علينا» لكل وحدة بنطاق القارئ وللمشروع، والقارئ المحصور يشوف أي دفاتر يظهر له منها. */
export function SummaryCards({ summary }: { summary: AccountsSummary }) {
  const partial = summary.visibleBooks < summary.totalBooks;
  const cards: { key: string; title: string; receivable: Fils; payable: Fils }[] = [
    {
      key: 'project',
      title: partial ? t('accounts.project.scoped', 'المشروع: حسابات نطاقك فقط') : t('accounts.project', 'المشروع'),
      receivable: summary.project.receivable,
      payable: summary.project.payable,
    },
    ...summary.divisions.map((division) => ({ key: division.divisionId, title: divisionFilterLabel(division.kind), receivable: division.receivable, payable: division.payable })),
  ];
  return (
    <div className="flex flex-col gap-3">
      {partial ? (
        <Notice tone="info" title={t('accounts.scoped', 'الأرقام من حسابات نطاقك: {visible} من {total}', { visible: summary.visibleBooks, total: summary.totalBooks })}>
          {t('accounts.scoped.detail', 'نطاقك يغطّي بعض الحسابات فقط، فالمجاميع لها وحدها.')}
        </Notice>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <div key={card.key} className="card flex flex-col gap-2 p-4">
            <dt className="font-semibold">{card.title}</dt>
            <dd className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">{t('home.accounts.receivable', 'لنا عند الناس')}</span>
              <Num>{fmtMoney(card.receivable, 0)}</Num>
            </dd>
            <dd className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">{t('home.accounts.payable', 'علينا للناس')}</span>
              <Num>{fmtMoney(card.payable, 0)}</Num>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * معرّف وحدة الفلتر من قائمة الدفاتر (مو من الملخّص): null = الكل، وundefined = لسّه ما انعرف (القائمة تتحمّل أو فشلت)، فالجدول
 * ما ينطلب بلا وحدة ويبين كل الدفاتر تحت اسم «المعمل».
 */
export function filterDivision(filter: Filter, books: readonly BookRef[] | null): string | null | undefined {
  if (filter === 'all') return null;
  return books?.find((book) => book.divisionKind === filter)?.divisionId;
}

/** خيارات الفلتر: الكل ووحدات نطاق القارئ (من الملخّص لمّا يوصل؛ قبله كل الوحدات). */
export function filterOptions(summary: AccountsSummary | null): readonly Filter[] {
  return DIVISION_FILTER.filter((kind) => kind === 'all' || !summary || summary.divisions.some((division) => division.kind === kind));
}

type DialogState = null | { kind: 'payment' | 'payout'; party: PartyRow | null } | { kind: 'party'; party: PartyRow | null } | { kind: 'archive'; row: PartyBalanceRow };

export default function AccountsPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? 'viewer';
  const allowed = { pay: can(role, 'payment.post'), manage: can(role, 'parties.manage'), opening: can(role, 'opening.post') };
  const from = useMemo(() => defaultPeriod().from, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PartySort>('balance');
  const [all, setAll] = useState(false);
  const deferred = useDeferredValue(search);
  const searchId = useId();
  const sortId = useId();
  const allId = useId();
  const summaryLoad = useCallback(() => parties.loadAccountsSummary(from, null), [from]);
  const summary = useLoad(summaryLoad, workspace?.orgId ?? 'none');
  const books = useLoad(parties.listBooks, 'books');
  const divisionId = filterDivision(filter, books.data);
  const pending = divisionId === undefined;
  const key = `${workspace?.orgId ?? 'none'}|${filter}|${pending ? 'pending' : divisionId}|${deferred}|${sort}|${all}`;
  const loadFirst = useCallback(
    (): Promise<PartyBalancesPage | null> => (divisionId === undefined ? Promise.resolve(null) : parties.loadPartyBalances({ from, to: null, divisionId, nonzero: !all, sort, search: deferred })),
    [from, divisionId, all, sort, deferred],
  );
  const first = useLoad(loadFirst, key);
  const [more, setMore] = useState<{ key: string; rows: readonly PartyBalanceRow[]; next: BalancesCursor | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // زرّا الرئيسية «دفعت لجهة» و«قبضت من جهة» يفتحان النافذة مباشرةً (?new=payout أو ?new=payment)، والإغلاق يشيل العلامة.
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<DialogState>(() => {
    const wanted = params.get('new');
    return allowed.pay && (wanted === 'payment' || wanted === 'payout') ? { kind: wanted, party: null } : null;
  });
  const closePayment = () => {
    setDialog(null);
    if (params.has('new')) setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('new');
      return next;
    }, { replace: true });
  };
  const [busy, setBusy] = useState(false);
  const extra = more?.key === key ? more : null;
  const rows = first.data ? [...first.data.rows, ...(extra?.rows ?? [])] : [];
  const next = extra ? extra.next : (first.data?.next ?? null);
  const refresh = () => {
    setMore(null);
    first.retry();
    summary.retry();
  };
  const loadMore = () => {
    if (!next || divisionId === undefined) return;
    setLoadingMore(true);
    parties
      .loadPartyBalances({ from, to: null, divisionId, nonzero: !all, sort, search: deferred, after: next })
      .then(
        (page) => setMore({ key, rows: [...(extra?.rows ?? []), ...page.rows], next: page.next }),
        (error: unknown) => {
          const { title, detail } = describeError(error, 'read');
          toast({ tone: 'danger', title, detail });
        },
      )
      .finally(() => setLoadingMore(false));
  };

  const header = (
    <PageHeader
      title={t('nav.accounts', 'الحسابات')}
      subtitle={t('accounts.subtitle', 'لنا عند الناس وعلينا للناس لكل حساب، بلا مقاصّة بين حسابين.')}
      actions={
        <>
          {allowed.pay ? (
            <>
              <Button icon={<HandCoins aria-hidden="true" className="size-4" />} onClick={() => setDialog({ kind: 'payment', party: null })} data-action="new-payment">
                {t('payment.title', 'قبضنا')}
              </Button>
              <Button variant="secondary" icon={<Wallet aria-hidden="true" className="size-4" />} onClick={() => setDialog({ kind: 'payout', party: null })} data-action="new-payout">
                {t('payout.title', 'دفعنا')}
              </Button>
            </>
          ) : null}
          {allowed.manage ? (
            <Button variant="secondary" icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setDialog({ kind: 'party', party: null })} data-action="new-party">
              {t('party.new', 'جهة جديدة')}
            </Button>
          ) : null}
        </>
      }
    />
  );
  const error = first.error ?? summary.error;
  if (error instanceof NotConnectedError) {
    const { title, detail } = describeError(error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }

  const rowActions = (row: PartyBalanceRow) => (
    <div className="flex gap-1.5">
      <Link to={`/accounts/parties/${row.partyId}`} className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="open-statement">
        {t('accounts.statement', 'الكشف')}
      </Link>
      {allowed.pay ? (
        <>
          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'payment', party: asParty(row) })} data-action="row-payment">
            {t('payment.title', 'قبضنا')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'payout', party: asParty(row) })} data-action="row-payout">
            {t('payout.title', 'دفعنا')}
          </Button>
        </>
      ) : null}
      {allowed.manage ? (
        <>
          {row.archived ? null : (
            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'party', party: asParty(row) })} data-action="edit-party">
              {t('items.edit', 'عدّل')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'archive', row })} data-action={row.archived ? 'restore-party' : 'archive-party'}>
            {row.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
          </Button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {header}
      <nav className="flex flex-wrap gap-2" aria-label={t('accounts.nav', 'صفحات الحسابات')}>
        <Link to="/accounts/cash" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="open-cash">
          <Landmark aria-hidden="true" className="size-4" />
          {t('cash.title', 'الصناديق')}
        </Link>
        <Link to="/accounts/expenses" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="open-expenses">
          <Receipt aria-hidden="true" className="size-4" />
          {t('expense.title', 'المصاريف')}
        </Link>
        {allowed.opening ? (
          <Link to="/accounts/openings" className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="open-openings">
            {t('openings.title', 'الأرصدة عند البداية')}
          </Link>
        ) : null}
      </nav>
      {summary.error ? <LoadFailed what={t('accounts.summary', 'ملخّص الحسابات')} error={summary.error} onRetry={summary.retry} /> : summary.data ? <SummaryCards summary={summary.data} /> : null}
      <Segmented label={t('accounts.filter', 'الوحدة')} options={filterOptions(summary.data).map((value) => ({ value, label: divisionFilterLabel(value) }))} value={filter} onChange={setFilter} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Field id={searchId} label={t('accounts.search', 'ابحث بالاسم أو الهاتف')}>
            <input id={searchId} type="search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field id={sortId} label={t('accounts.sort', 'الترتيب')}>
          <select id={sortId} className="input" value={sort} onChange={(event) => setSort(event.target.value as PartySort)}>
            <option value="balance">{t('accounts.sort.balance', 'الأكبر رصيداً')}</option>
            <option value="oldest">{t('accounts.sort.oldest', 'أقدم دين')}</option>
            <option value="name">{t('accounts.sort.name', 'الاسم')}</option>
          </select>
        </Field>
        <Switch id={allId} label={t('accounts.all', 'كل الجهات')} description={t('accounts.all.detail', 'وبلا رصيد أيضاً.')} checked={all} onChange={setAll} />
      </div>
      {pending && books.error ? (
        <LoadFailed what={t('book.list', 'قائمة الحسابات')} error={books.error} onRetry={books.retry} />
      ) : first.error ? (
        <LoadFailed what={t('accounts.parties', 'الجهات')} error={first.error} onRetry={refresh} />
      ) : pending || !first.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <PartiesTable page={first.data} rows={rows} summary={summary.data} divisionId={divisionId ?? null} actions={rowActions} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span>{t('items.count', '{shown} من المجموع {total}', { shown: fmtInt(rows.length), total: fmtInt(first.data.total ?? rows.length) })}</span>
            {next ? (
              <Button size="sm" variant="secondary" busy={loadingMore} onClick={loadMore} data-action="more-parties">
                {t('items.more', 'حمّل المزيد')}
              </Button>
            ) : null}
          </div>
        </>
      )}
      {dialog?.kind === 'payment' || dialog?.kind === 'payout' ? (
        <PaymentDialog
          kind={dialog.kind as PaymentKind}
          party={dialog.party}
          onClose={closePayment}
          onPosted={() => {
            closePayment();
            refresh();
          }}
        />
      ) : null}
      {dialog?.kind === 'party' ? (
        <PartyDialog
          party={dialog.party}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            refresh();
            toast({ tone: 'success', title: t('party.saved', 'حُفظت الجهة «{name}»', { name: saved.name }) });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        tone={dialog?.kind === 'archive' && dialog.row.archived ? 'primary' : 'danger'}
        title={dialog?.kind === 'archive' ? (dialog.row.archived ? t('org.restore.title', 'إعادة «{name}»', { name: dialog.row.name }) : t('org.archive.title', 'أرشفة «{name}»', { name: dialog.row.name })) : ''}
        consequence={
          dialog?.kind === 'archive'
            ? dialog.row.archived
              ? t('party.restore.consequence', 'تعود «{name}» إلى القوائم، وتقبل قيوداً جديدة.', { name: dialog.row.name })
              : t('party.archive.consequence', 'تختفي «{name}» من القوائم الجديدة ولا يُسجَّل عليها دين جديد، ويبقى كشفها. لا تُؤرشف وعليها رصيد بأي حساب.', { name: dialog.row.name })
            : null
        }
        confirmLabel={dialog?.kind === 'archive' && dialog.row.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
        busy={busy}
        action="confirm-archive-party"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== 'archive') return;
          setBusy(true);
          parties
            .setPartyArchived(dialog.row.partyId, dialog.row.version, !dialog.row.archived)
            .then(
              () => {
                setDialog(null);
                refresh();
              },
              (caught: unknown) => {
                setDialog(null);
                if (caught instanceof ZeroRowsError) refresh();
                const { title, detail } = describeError(caught, 'once');
                toast({ tone: 'danger', title, detail });
              },
            )
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
