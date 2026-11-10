import { useCallback, useDeferredValue, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/ui/Button';
import { DataTable, Num, type Column } from '../../../components/ui/DataTable';
import { Field } from '../../../components/ui/Field';
import { LoadFailed } from '../../../components/ui/LoadFailed';
import { MoneyInput, parseMoneyText } from '../../../components/ui/MoneyInput';
import { Notice } from '../../../components/ui/Notice';
import { Segmented } from '../../../components/ui/Segmented';
import { Switch } from '../../../components/ui/Switch';
import { toast } from '../../../components/ui/Toast';
import { DIVISION_KINDS } from '../../../domain/divisions';
import { can } from '../../../domain/permissions';
import { describeError, NotConnectedError } from '../../../lib/errors';
import { fmtCounted, fmtDay, fmtInt, fmtPhone } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import * as debts from '../../../lib/repo/debts';
import type { DebtRow, DebtsCursor, DebtSide, DebtSort, DebtsOverview } from '../../../lib/repo/debts';
import * as parties from '../../../lib/repo/parties';
import type { BookRef, PartyRow } from '../../../lib/repo/parties';
import { AGING_BUCKETS, bucketOf } from '../../../lib/repo/statement';
import { useSession } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { AgeText, AgingSplit, bucketLabel, money, moneyText } from '../papers';
import { bookLabel, divisionFilterLabel, entryKindLabel, PaymentDialog, SideAmount } from '../shared';

// قائمة الذمم (عقد 0024 F3 و§4.3، الخطّة §8.1 «1-ج» و§9.4): تبويبان «لنا عند الناس» و«علينا للناس» (?side=)، وفوق الجدول المجموع وتوزيعه
// على الأعمار من الخادم للمجموعة المفلترة كلّها؛ والفلاتر: القسم أو الحساب، والحدّ الأدنى، وما تجاوز 90 يوماً (?over90=1، رابط تنبيه
// الخلاصة)، والبحث بالاسم أو الهاتف؛ والترتيب بالمبلغ أو العمر أو الاسم. صفّ لكلّ جهة: الاسم (يفتح كشفها) والرصيد وتحته رصيد كلّ حساب إن
// تعدّدت (الحسابات لا تُقاصّ)، وأعمار مفتوحها، وعمر أقدم دين بلون فئته، وآخر حركة وآخر تسديد والهاتف، وأفعال سريعة: الكشف، و«قبضت منه» أو
// «دفعت له» بنافذة القبض والدفع نفسها، و«اتّصل»، و«أرسل الكشف». الصفحات بمؤشّر الخادم وتُلحق بلا تكرار جهة.

/** الجهة كصفّ منتقٍ لنافذة القبض والدفع. */
const asParty = (row: DebtRow): PartyRow => ({ id: row.partyId, version: row.version, archived: row.archived, name: row.name, phone: row.phone, isCustomer: row.isCustomer, isSupplier: row.isSupplier });

/** خيار الفلتر: «الكل»، أو قسم (division:…)، أو حساب (book:…) للأقسام ذات الحسابات المتعدّدة (المفقس). */
export interface FilterOption {
  value: string;
  label: string;
}

export function filterOptions(books: readonly BookRef[]): FilterOption[] {
  const options: FilterOption[] = [{ value: '', label: t('debts.filter.all', 'كلّ الأقسام والحسابات') }];
  for (const kind of DIVISION_KINDS) {
    const own = books.filter((book) => book.divisionKind === kind);
    const [first] = own;
    if (!first) continue;
    options.push({ value: `division:${first.divisionId}`, label: divisionFilterLabel(kind) });
    if (own.length > 1) for (const book of own) options.push({ value: `book:${book.id}`, label: bookLabel(book) });
  }
  return options;
}

/** معامِلا القسم والحساب من قيمة الفلتر. */
export function filterArgs(value: string): { divisionId: string | null; bookId: string | null } {
  if (value.startsWith('division:')) return { divisionId: value.slice('division:'.length), bookId: null };
  if (value.startsWith('book:')) return { divisionId: null, bookId: value.slice('book:'.length) };
  return { divisionId: null, bookId: null };
}

/** صفحات تُلحق بالأولى بلا تكرار جهة (المؤشّر قد يعيد جهة تغيّر رصيدها بين صفحتين). */
export function mergeRows(first: readonly DebtRow[], extra: readonly DebtRow[]): DebtRow[] {
  const seen = new Set<string>();
  const rows: DebtRow[] = [];
  for (const row of [...first, ...extra]) {
    if (seen.has(row.partyId)) continue;
    seen.add(row.partyId);
    rows.push(row);
  }
  return rows;
}

/** رابط هاتفيّ: الرقم الموحّد (9647…) بـ+، وغيره بأرقامه. */
export function telHref(phone: string): string {
  return /^9647[0-9]{9}$/.test(phone) ? `tel:+${phone}` : `tel:${phone.replace(/[^0-9+]/g, '')}`;
}

/** طريق قائمة الذمم بتبويبها وفلتر الأعمار (رجوع الكشف إليها). */
export const debtsPath = (side: DebtSide, over90: boolean): string => `/accounts/debts?side=${side}${over90 ? '&over90=1' : ''}`;

/** كشف الجهة من القائمة: الرجوع إلى القائمة نفسها، و«أرسل» يفتح نافذة المشاركة. */
export const statementPath = (partyId: string, back: string, send = false): string => `/accounts/parties/${partyId}?${send ? 'send=1&' : ''}back=${encodeURIComponent(back)}`;

const partiesText = (n: number): string =>
  fmtCounted(BigInt(n) * 1000n, t('debts.party', 'جهة'), { one: t('debts.party.one', 'جهة واحدة'), two: t('debts.party.two', 'جهتان'), few: t('debts.party.few', 'جهات'), many: t('debts.party.many', 'جهة') });

const PILL = 'inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2';

export function DebtsTable({
  data,
  rows,
  back,
  onPay,
}: {
  data: Pick<DebtsOverview, 'side' | 'books' | 'totals'>;
  rows: readonly DebtRow[];
  /** طريق الرجوع من الكشف إلى القائمة. */
  back: string;
  /** «قبضت منه» أو «دفعت له»، أو null لمن لا يسجّل القبض والدفع. */
  onPay: ((row: DebtRow) => void) | null;
}) {
  const books = new Map(data.books.map((book) => [book.bookId, book]));
  const receivable = data.side === 'receivable';
  const columns: Column<DebtRow>[] = [
    {
      key: 'name',
      header: t('debts.col.party', 'الجهة'),
      sticky: true,
      cell: (row) => (
        <Link to={statementPath(row.partyId, back)} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="party-link">
          {row.archived ? t('party.archived.name', '{name} (مؤرشفة)', { name: row.name }) : row.name}
        </Link>
      ),
    },
    {
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (row) => (
        <span className="flex gap-1.5">
          <Link to={statementPath(row.partyId, back)} className={PILL} data-action="open-statement">
            {t('debts.statement', 'كشف')}
          </Link>
          {onPay ? (
            <Button size="sm" variant="secondary" onClick={() => onPay(row)} data-action={receivable ? 'row-payment' : 'row-payout'}>
              {receivable ? t('debts.received', 'قبضت منه') : t('debts.paid', 'دفعت له')}
            </Button>
          ) : null}
          {row.phone ? (
            <a href={telHref(row.phone)} className={PILL} data-action="call">
              {t('debts.call', 'اتّصل')}
            </a>
          ) : null}
          <Link to={statementPath(row.partyId, back, true)} className={PILL} data-action="send-statement">
            {t('debts.send', 'أرسل الكشف')}
          </Link>
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('debts.col.amount', 'الرصيد'),
      kind: 'number',
      cell: (row) => (
        <span className="flex flex-col gap-0.5" data-action="amount">
          {money(row.amount)}
          {row.cells.length > 1
            ? row.cells.map((cell) => {
                const book = books.get(cell.bookId);
                return (
                  <span key={cell.bookId} className="flex items-center justify-between gap-2 text-2xs font-normal text-ink-muted" data-action="book-cell" data-book={cell.bookId}>
                    <span>{book ? bookLabel(book) : t('debts.book.unknown', 'حساب')}</span>
                    <SideAmount amount={cell.closing} />
                  </span>
                );
              })
            : null}
        </span>
      ),
      total: money(data.totals.amount),
    },
    ...AGING_BUCKETS.map(
      (bucket): Column<DebtRow> => ({
        key: bucket,
        header: bucketLabel(bucket),
        kind: 'number',
        cell: (row) => (row.aging[bucket] > 0n ? money(row.aging[bucket]) : null),
        total: money(data.totals.aging[bucket]),
      }),
    ),
    {
      key: 'age',
      header: t('debts.col.age', 'عمر أقدم دين'),
      cell: (row) =>
        row.ageDays !== null && row.oldest ? (
          <AgeText days={row.ageDays} bucket={bucketOf(row.ageDays)}>
            <span className="block text-2xs font-normal text-ink-muted">
              <Num>{fmtDay(row.oldest)}</Num>
            </span>
          </AgeText>
        ) : (
          t('file.none', '—')
        ),
    },
    {
      key: 'last_move',
      header: t('debts.col.last_move', 'آخر حركة'),
      cell: (row) =>
        row.lastMove ? (
          <span data-action="last-move">
            <Num>{fmtDay(row.lastMove.onDate)}</Num> {entryKindLabel(row.lastMove.kind)} {row.lastMove.docNo ? <bdi dir="ltr">{row.lastMove.docNo}</bdi> : null}
          </span>
        ) : (
          t('file.none', '—')
        ),
    },
    {
      key: 'last_settlement',
      header: t('debts.col.last_settlement', 'آخر تسديد'),
      cell: (row) =>
        row.lastSettlement ? (
          <span data-action="last-settlement">
            <Num>{fmtDay(row.lastSettlement.onDate)}</Num> {t('debts.settlement', '{amount} دينار', { amount: moneyText(row.lastSettlement.amount) })}{' '}
            {row.lastSettlement.docNo ? <bdi dir="ltr">{row.lastSettlement.docNo}</bdi> : null}
          </span>
        ) : (
          t('debts.never', 'لا تسديد')
        ),
    },
    { key: 'phone', header: t('party.phone', 'الهاتف'), cell: (row) => (row.phone ? <bdi dir="ltr">{fmtPhone(row.phone)}</bdi> : t('file.none', '—')) },
  ];
  return (
    <DataTable
      caption={receivable ? t('debts.caption.receivable', 'لنا عند الناس: الجهات بأرصدتها وأعمار ديونها') : t('debts.caption.payable', 'علينا للناس: الجهات بأرصدتها وأعمار ديونها')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.partyId}
      empty={t('debts.empty', 'لا جهة بهذه الفلاتر.')}
      totalLabel={t('debts.total.label', 'المجموع ({parties})', { parties: partiesText(data.totals.parties) })}
    />
  );
}

export default function DebtsPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const canPay = workspace ? can(workspace.role, 'payment.post') : false;
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const side: DebtSide = params.get('side') === 'payable' ? 'payable' : 'receivable';
  const over90 = params.get('over90') === '1';
  const setUrl = (nextSide: DebtSide, nextOver90: boolean) => navigate({ search: `?side=${nextSide}${nextOver90 ? '&over90=1' : ''}` }, { replace: true });
  const filterId = useId();
  const searchId = useId();
  const sortId = useId();
  const minId = useId();
  const overId = useId();
  // قسم من رابط «خلاصة المال» (?division=، 0024): القائمة تبدأ بقسمه، والمستخدم يغيّره من الفلتر.
  const [filter, setFilter] = useState(() => {
    const division = params.get('division');
    return division ? `division:${division}` : '';
  });
  const [search, setSearch] = useState('');
  const [minText, setMinText] = useState('');
  const [sort, setSort] = useState<DebtSort>('amount');
  const deferredSearch = useDeferredValue(search);
  const deferredMin = useDeferredValue(minText);
  const min = parseMoneyText(deferredMin);
  const { divisionId, bookId } = filterArgs(filter);
  const books = useLoad(parties.listBooks, 'books');
  const key = [workspace?.orgId ?? 'none', side, filter, deferredSearch, sort, min === null ? '' : min.toString(), over90 ? '1' : '0'].join('|');
  const query = useCallback(
    (after: DebtsCursor | null) => debts.loadDebts({ side, divisionId, bookId, search: deferredSearch, sort, min, over90, after }),
    [side, divisionId, bookId, deferredSearch, sort, min, over90],
  );
  const loadFirst = useCallback(() => query(null), [query]);
  const first = useLoad(loadFirst, key);
  const [more, setMore] = useState<{ key: string; rows: readonly DebtRow[]; next: DebtsCursor | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paying, setPaying] = useState<DebtRow | null>(null);
  const extra = more?.key === key ? more : null;
  const rows = first.data ? mergeRows(first.data.rows, extra?.rows ?? []) : [];
  const next = extra ? extra.next : (first.data?.next ?? null);
  const back = debtsPath(side, over90);
  const refresh = () => {
    setMore(null);
    first.retry();
  };
  const loadMore = () => {
    if (!next) return;
    setLoadingMore(true);
    query(next)
      .then(
        (page) => setMore({ key, rows: [...(extra?.rows ?? []), ...page.rows], next: page.next }),
        (error: unknown) => {
          const { title, detail } = describeError(error, 'read');
          toast({ tone: 'danger', title, detail });
        },
      )
      .finally(() => setLoadingMore(false));
  };
  const header = <PageHeader title={t('debts.title', 'الذمم')} subtitle={t('debts.subtitle', 'لمن لنا وعلى من، وكم، ومنذ متى: كلّ حساب برصيده بلا مقاصّة بين حسابين.')} />;
  if (first.error instanceof NotConnectedError) {
    const { title, detail } = describeError(first.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  const totals = first.data?.totals ?? null;
  return (
    <div className="flex flex-col gap-4">
      {header}
      <Segmented<DebtSide>
        label={t('debts.side', 'الجانب')}
        options={[
          { value: 'receivable', label: t('home.accounts.receivable', 'لنا عند الناس') },
          { value: 'payable', label: t('home.accounts.payable', 'علينا للناس') },
        ]}
        value={side}
        onChange={(value) => setUrl(value, over90)}
      />
      {totals ? (
        <section className="card flex flex-col gap-3 p-4" data-action="debts-total">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-lg font-semibold">{side === 'receivable' ? t('home.accounts.receivable', 'لنا عند الناس') : t('home.accounts.payable', 'علينا للناس')}</p>
            <p className="text-2xl font-semibold" data-action="debts-amount">
              {t('debts.amount', '{amount} دينار', { amount: moneyText(totals.amount) })}
            </p>
          </div>
          <p className="text-sm text-ink-muted" data-action="debts-parties">
            {over90 ? t('debts.parties.over90', '{parties}، أقدم ديونها فوق 90 يوماً', { parties: partiesText(totals.parties) }) : partiesText(totals.parties)}
          </p>
          <AgingSplit aging={totals.aging} total={totals.amount} />
        </section>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id={filterId} label={t('debts.filter', 'القسم أو الحساب')}>
          <select id={filterId} className="input" value={filter} onChange={(event) => setFilter(event.target.value)} data-action="debts-filter">
            {filterOptions(books.data ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <MoneyInput id={minId} label={t('debts.min', 'الحدّ الأدنى للرصيد (دينار)')} value={minText} onChange={setMinText} />
        <Field id={searchId} label={t('accounts.search', 'ابحث بالاسم أو الهاتف')}>
          <input id={searchId} type="search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" data-action="debts-search" />
        </Field>
        <Field id={sortId} label={t('accounts.sort', 'الترتيب')}>
          <select id={sortId} className="input" value={sort} onChange={(event) => setSort(event.target.value as DebtSort)} data-action="debts-sort">
            <option value="amount">{t('debts.sort.amount', 'الأكبر رصيداً')}</option>
            <option value="age">{t('debts.sort.age', 'الأقدم ديناً')}</option>
            <option value="name">{t('accounts.sort.name', 'الاسم')}</option>
          </select>
        </Field>
      </div>
      <Switch id={overId} label={t('debts.over90', 'أكثر من 90 يوماً فقط')} description={t('debts.over90.detail', 'الجهات التي عمر أقدم دين مفتوح لها فوق 90 يوماً.')} checked={over90} onChange={(value) => setUrl(side, value)} />
      {books.error ? <LoadFailed what={t('book.list', 'قائمة الحسابات')} error={books.error} onRetry={books.retry} /> : null}
      {first.error ? (
        <LoadFailed what={t('debts.what', 'قائمة الذمم')} error={first.error} onRetry={refresh} />
      ) : !first.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <DebtsTable data={first.data} rows={rows} back={back} onPay={canPay ? setPaying : null} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span data-action="debts-count">{t('items.count', '{shown} من المجموع {total}', { shown: fmtInt(rows.length), total: fmtInt(first.data.totals.parties) })}</span>
            {next ? (
              <Button size="sm" variant="secondary" busy={loadingMore} onClick={loadMore} data-action="more-debts">
                {t('items.more', 'حمّل المزيد')}
              </Button>
            ) : null}
          </div>
        </>
      )}
      {paying ? (
        <PaymentDialog
          kind={side === 'receivable' ? 'payment' : 'payout'}
          party={asParty(paying)}
          onClose={() => setPaying(null)}
          onPosted={() => {
            setPaying(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
