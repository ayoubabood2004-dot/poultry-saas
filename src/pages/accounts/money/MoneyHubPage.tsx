import { HandCoins, Landmark, Receipt, TriangleAlert, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { DataTable, Num, type Column } from '../../../components/ui/DataTable';
import { LoadFailed } from '../../../components/ui/LoadFailed';
import { Notice } from '../../../components/ui/Notice';
import type { Fils } from '../../../domain/money';
import { can, type Role } from '../../../domain/permissions';
import { describeError, NotConnectedError } from '../../../lib/errors';
import { fmtDay, fmtInt, fmtMoney, fmtPhone } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import * as money from '../../../lib/repo/money';
import type { ClassTotals, MoneyClass, MoneyOverview, TopParty } from '../../../lib/repo/money';
import { useSession } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { boxName } from '../CashPage';
import { divisionFilterLabel } from '../shared';
import { classLabel, debtsHref, dinarText, fmtDinar, LINK, moneyDecimals, PILL } from './shared';

// «خلاصة المال» (عقد 0024 §4.1 وF1، خطّة المحاسبة §8.1 1-أ و§9.9): أوّل ما يُفتح في تبويب الحسابات، بقراءة واحدة (money_overview) بيوم الخادم.
// البطاقات بترتيب الهاتف من الأعلى: النقد (المجموع وكلّ صندوق برصيده، والسالب بلون التنبيه، وكلّ صندوق يفتح كشفه)، ثمّ الذمم («لنا» و«علينا»
// والصافي، ولكلّ قسم سطر يُطوى، وكلّ رقم يفتح قائمة الذمم بطرفها)، ثمّ اليوم بأصناف الحركة، ثمّ هذا الشهر (المبيعات وكلفتها وربحها لمن يرى الكلفة،
// والمشتريات نقداً وبالدين، والمصاريف بأشرطة «أين ذهب المال»، وصافي النقد)، ثمّ أكبر خمسة بكلّ طرف (كلّ واحد يفتح كشفه)، ثمّ التنبيهات، وآخرها روابط
// صفحات الحسابات. الأرقام كلّها من الخادم كما هي، بلا جمع بالشاشة.

function Card({ title, icon, action, children }: { title: string; icon?: ReactNode; action: string; children: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-action={action}>
      <h2 className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

const ICON = 'size-5 shrink-0 text-brand-700 dark:text-brand-200';
const ROW = 'flex items-center justify-between gap-2 text-sm';
const NEGATIVE = 'font-semibold text-danger-700 dark:text-danger-300';

/** «لنا» أو «علينا» بكلمته والرقم بلا إشارة (اللون مساعد لا بديل)، والصفر «—». */
function NetAmount({ amount }: { amount: Fils }) {
  if (amount === 0n) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-ink-muted">{amount > 0n ? t('hub.net.ours', 'لنا') : t('hub.net.theirs', 'علينا')}</span>
      <Num>{fmtDinar(amount < 0n ? -amount : amount)}</Num>
    </span>
  );
}

export function CashCard({ cash }: { cash: MoneyOverview['cash'] }) {
  return (
    <Card title={t('hub.cash', 'عندك نقداً')} icon={<Wallet aria-hidden="true" className={ICON} />} action="hub-cash">
      <p className={`text-2xl font-semibold ${cash.total < 0n ? NEGATIVE : ''}`} data-action="hub-cash-total">
        <Num>{fmtDinar(cash.total)}</Num>
      </p>
      {cash.boxes.length ? (
        <ul className="flex flex-col gap-1">
          {cash.boxes.map((box) => (
            <li key={box.accountId}>
              <Link to={`/accounts/cash/${box.accountId}`} className={`${ROW} rounded-xl px-2 py-1 hover:bg-surface-2`} data-action="hub-box" data-negative={box.balance < 0n || undefined}>
                <span className="min-w-0 truncate">{boxName({ name: box.name, archived: box.archived, closing: box.balance })}</span>
                <span className={`inline-flex shrink-0 items-center gap-2 ${box.balance < 0n ? NEGATIVE : ''}`}>
                  {box.balance < 0n ? <span className="text-xs">{t('cash.negative', 'سالب')}</span> : null}
                  <Num>{fmtDinar(box.balance)}</Num>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{t('cash.empty', 'لا صناديق بعد.')}</p>
      )}
    </Card>
  );
}

export function DebtsCard({ debts }: { debts: MoneyOverview['debts'] }) {
  const partial = debts.visibleBooks < debts.totalBooks;
  return (
    <Card title={t('hub.debts', 'الذمم')} icon={<HandCoins aria-hidden="true" className={ICON} />} action="hub-debts">
      <dl className="flex flex-col gap-1">
        <div className={ROW}>
          <dt>
            <Link to={debtsHref('receivable')} className={LINK} data-action="hub-receivable">
              {t('home.accounts.receivable', 'لنا عند الناس')}
            </Link>
          </dt>
          <dd className="font-semibold">
            <Num>{fmtDinar(debts.receivable)}</Num>
          </dd>
        </div>
        <div className={ROW}>
          <dt>
            <Link to={debtsHref('payable')} className={LINK} data-action="hub-payable">
              {t('home.accounts.payable', 'علينا للناس')}
            </Link>
          </dt>
          <dd className="font-semibold">
            <Num>{fmtDinar(debts.payable)}</Num>
          </dd>
        </div>
        <div className={`${ROW} border-t border-line pt-2.5`}>
          <dt className="text-ink-muted">{t('hub.net', 'الصافي')}</dt>
          <dd className="font-semibold" data-action="hub-net">
            <NetAmount amount={debts.net} />
          </dd>
        </div>
      </dl>
      {partial ? (
        <p className="text-xs text-ink-muted">{t('accounts.scoped', 'الأرقام من حسابات نطاقك: {visible} من {total}', { visible: debts.visibleBooks, total: debts.totalBooks })}</p>
      ) : null}
      {debts.divisions.length ? (
        <details>
          <summary className="inline-flex select-none items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2" data-action="hub-divisions">
            {t('hub.divisions', 'حسب القسم')}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {debts.divisions.map((division) => (
              <li key={division.divisionId} className="flex flex-col gap-1 rounded-xl border border-line p-3 text-sm" data-action="hub-division">
                <span className="font-medium">{divisionFilterLabel(division.kind)}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <Link to={debtsHref('receivable', { division: division.divisionId })} className={LINK} data-action="hub-division-receivable">
                    {t('hub.division.receivable', 'لنا')} <Num>{fmtDinar(division.receivable)}</Num>
                  </Link>
                  <Link to={debtsHref('payable', { division: division.divisionId })} className={LINK} data-action="hub-division-payable">
                    {t('hub.division.payable', 'علينا')} <Num>{fmtDinar(division.payable)}</Num>
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

/**
 * أصناف خارج «ما دخل وما خرج» (العقد §7): التحويل بين الصناديق مال انتقل بين صناديقك، والرصيد عند البداية ليس دخلاً؛ يبقيان بسطر تحت الجدول
 * حتى يُرى أنّ اليوم فيه حركة، وصفّ المجموع من الخادم بلاهما.
 */
const OUTSIDE_TOTAL: ReadonlySet<MoneyClass> = new Set<MoneyClass>(['transfer', 'opening']);

export function TodayCard({ day, today }: { day: MoneyOverview['day']; today: string }) {
  const counted = day.classes.filter((row) => !OUTSIDE_TOTAL.has(row.cls));
  const outside = day.classes.filter((row) => OUTSIDE_TOTAL.has(row.cls));
  const decimals = moneyDecimals([day.inflow, day.outflow, ...counted.flatMap((row) => [row.inflow, row.outflow])]);
  const amount = (value: Fils) => (value === 0n ? null : <Num>{fmtMoney(value, decimals)}</Num>);
  const columns: Column<ClassTotals>[] = [
    { key: 'class', header: t('moves.col.class', 'النوع'), cell: (row) => classLabel(row.cls) },
    { key: 'in', header: t('hub.in', 'دخل'), kind: 'number', cell: (row) => amount(row.inflow), total: <Num>{fmtMoney(day.inflow, decimals)}</Num> },
    { key: 'out', header: t('hub.out', 'خرج'), kind: 'number', cell: (row) => amount(row.outflow), total: <Num>{fmtMoney(day.outflow, decimals)}</Num> },
  ];
  return (
    <Card title={t('hub.today', 'اليوم {day}', { day: fmtDay(today) })} icon={<Receipt aria-hidden="true" className={ICON} />} action="hub-today">
      <DataTable caption={t('hub.today.caption', 'ما دخل وما خرج اليوم بأصنافه')} columns={columns} rows={counted} rowKey={(row) => row.cls} empty={t('hub.today.empty', 'لا دخل ولا خرج اليوم.')} totalLabel={t('ledger.total', 'المجموع')} />
      {outside.map((row) => (
        <p key={row.cls} className="text-xs text-ink-muted" data-action="hub-today-outside">
          {t('hub.today.outside', '{label} خارج المجموع: دخل {in}، وخرج {out}.', { label: classLabel(row.cls), in: fmtDinar(row.inflow), out: fmtDinar(row.outflow) })}
        </p>
      ))}
      <Link to={`/accounts/moves?from=${today}&to=${today}`} className={`${LINK} text-sm`} data-action="hub-today-moves">
        {t('hub.today.moves', 'حركات اليوم')}
      </Link>
    </Card>
  );
}

/** شريط فئة المصروف: حصّتها من مجموع المصاريف (عرض تخطيط، والمبلغ بجانبه). */
function ShareBar({ part, whole }: { part: Fils; whole: Fils }) {
  const shown = part > 0n && whole > 0n;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
      {/* number-ok: وزن تخطيط للشريط، لا رقم معروض (المبلغ بجانبه) */}
      <span className="block bg-brand-600" style={{ flexGrow: shown ? Number(part) : 0, flexBasis: 0 }} />
      {/* number-ok: الباقي من الشريط */}
      <span className="block" style={{ flexGrow: shown ? Number(whole - part > 0n ? whole - part : 0n) : 1, flexBasis: 0 }} />
    </div>
  );
}

export function MonthCard({ month, monthFrom }: { month: MoneyOverview['month']; monthFrom: string }) {
  const { sales, purchases, expenses, cash } = month;
  return (
    <Card title={t('hub.month', 'هذا الشهر')} icon={<Landmark aria-hidden="true" className={ICON} />} action="hub-month">
      <dl className="flex flex-col gap-1" data-action="hub-sales">
        <div className={ROW}>
          <dt>{t('hub.sales', 'المبيعات ({count})', { count: fmtInt(sales.count) })}</dt>
          <dd className="font-semibold">
            <Num>{fmtDinar(sales.revenue)}</Num>
          </dd>
        </div>
        {sales.cost !== null ? (
          <div className={ROW}>
            <dt className="text-ink-muted">{t('hub.sales.cost', 'كلفتها')}</dt>
            <dd>
              <Num>{fmtDinar(sales.cost)}</Num>
            </dd>
          </div>
        ) : null}
        {sales.gross !== null ? (
          <div className={ROW} data-action="hub-gross">
            <dt className="text-ink-muted">{t('hub.sales.gross', 'الربح الإجمالي')}</dt>
            <dd className={`font-semibold ${sales.gross < 0n ? NEGATIVE : ''}`}>
              <Num>{fmtDinar(sales.gross)}</Num>
            </dd>
          </div>
        ) : null}
      </dl>
      <dl className="flex flex-col gap-1 border-t border-line pt-2.5" data-action="hub-purchases">
        <div className={ROW}>
          <dt>{t('hub.purchases', 'المشتريات ({count})', { count: fmtInt(purchases.count) })}</dt>
          <dd className="font-semibold">
            <Num>{fmtDinar(purchases.total)}</Num>
          </dd>
        </div>
        <div className={ROW}>
          <dt className="text-ink-muted">{t('hub.purchases.cash', 'نقداً')}</dt>
          <dd>
            <Num>{fmtDinar(purchases.cash)}</Num>
          </dd>
        </div>
        <div className={ROW}>
          <dt className="text-ink-muted">{t('hub.purchases.credit', 'بالدين')}</dt>
          <dd>
            <Num>{fmtDinar(purchases.credit)}</Num>
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 border-t border-line pt-2.5" data-action="hub-expenses">
        <div className={ROW}>
          <span>{t('hub.expenses', 'المصاريف: أين ذهب المال')}</span>
          <span className="font-semibold">
            <Num>{fmtDinar(expenses.total)}</Num>
          </span>
        </div>
        {expenses.categories.length ? (
          <ul className="flex flex-col gap-2">
            {expenses.categories.map((category) => (
              <li key={category.categoryId} className="flex flex-col gap-1" data-action="hub-expense">
                <span className={ROW}>
                  <span className="min-w-0 truncate text-ink-muted">{category.name}</span>
                  <Num>{fmtDinar(category.amount)}</Num>
                </span>
                <ShareBar part={category.amount} whole={expenses.total} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">{t('hub.expenses.empty', 'لا مصاريف هذا الشهر.')}</p>
        )}
      </div>
      <dl className="flex flex-col gap-1 border-t border-line pt-2.5" data-action="hub-cashflow">
        <div className={ROW}>
          <dt className="text-ink-muted">{t('hub.flow.in', 'دخل نقداً')}</dt>
          <dd>
            <Num>{fmtDinar(cash.inflow)}</Num>
          </dd>
        </div>
        <div className={ROW}>
          <dt className="text-ink-muted">{t('hub.flow.out', 'خرج نقداً')}</dt>
          <dd>
            <Num>{fmtDinar(cash.outflow)}</Num>
          </dd>
        </div>
        <div className={ROW}>
          <dt>{t('hub.flow.net', 'صافي التدفّق النقدي')}</dt>
          <dd className={`font-semibold ${cash.net < 0n ? NEGATIVE : ''}`} data-action="hub-net-flow">
            <Num>{fmtDinar(cash.net)}</Num>
          </dd>
        </div>
      </dl>
      <Link to={`/accounts/month?m=${monthFrom.slice(0, 7)}`} className={`${LINK} text-sm`} data-action="hub-month-summary">
        {t('hub.month.summary', 'خلاصة الشهر كاملة')}
      </Link>
    </Card>
  );
}

export function TopCard({ title, rows, action }: { title: string; rows: readonly TopParty[]; action: string }) {
  return (
    <Card title={title} action={action}>
      {rows.length ? (
        <ol className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.partyId}>
              <Link to={`/accounts/parties/${row.partyId}?back=/accounts`} className={`${ROW} rounded-xl px-2 py-1 hover:bg-surface-2`} data-action="hub-top-party">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{row.name}</span>
                  {row.phone || row.oldest ? (
                    <span className="text-xs text-ink-muted">
                      {row.phone ? <bdi dir="ltr">{fmtPhone(row.phone)}</bdi> : null}
                      {row.phone && row.oldest ? ' · ' : null}
                      {row.oldest ? t('hub.top.oldest', 'أقدم دين {day}', { day: fmtDay(row.oldest) }) : null}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold">
                  <Num>{fmtDinar(row.amount)}</Num>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">{t('hub.top.empty', 'لا أحد.')}</p>
      )}
    </Card>
  );
}

export function AlertsCard({ alerts }: { alerts: MoneyOverview['alerts'] }) {
  const { negativeBoxes, oldReceivable, oldPayable } = alerts;
  const none = negativeBoxes.length === 0 && oldReceivable.parties === 0 && oldPayable.parties === 0;
  return (
    <Card title={t('hub.alerts', 'تنبيهات')} icon={<TriangleAlert aria-hidden="true" className={ICON} />} action="hub-alerts">
      {none ? (
        <p className="text-sm text-ink-muted">{t('hub.alerts.none', 'لا تنبيهات: لا صندوق بالسالب، ولا دين فات عمره 90 يوماً.')}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {negativeBoxes.map((box) => (
            <li key={box.accountId}>
              <Link to={`/accounts/cash/${box.accountId}`} className={NEGATIVE} data-action="hub-alert-box">
                {t('hub.alert.box', 'صندوق بالسالب: {name}', { name: box.name })} <Num>{fmtDinar(box.balance)}</Num>
              </Link>
            </li>
          ))}
          {oldReceivable.parties > 0 ? (
            <li>
              <Link to={debtsHref('receivable', { over90: true })} className={LINK} data-action="hub-alert-receivable">
                {t('hub.alert.receivable', 'لنا عند الناس أكثر من 90 يوماً: {amount} (الجهات: {parties})', { amount: dinarText(oldReceivable.amount), parties: oldReceivable.parties })}
              </Link>
            </li>
          ) : null}
          {oldPayable.parties > 0 ? (
            <li>
              <Link to={debtsHref('payable', { over90: true })} className={LINK} data-action="hub-alert-payable">
                {t('hub.alert.payable', 'علينا للناس أكثر من 90 يوماً: {amount} (الجهات: {parties})', { amount: dinarText(oldPayable.amount), parties: oldPayable.parties })}
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}

/** روابط صفحات الحسابات (آخر الخلاصة، §9.9): «قبضنا» و«دفعنا» و«مصروف» لمن يسجّلها، ثمّ الصفحات. */
export function HubLinks({ role }: { role: Role }) {
  const links: { to: string; label: string; action: string; show: boolean }[] = [
    { to: '/accounts/parties?new=payment', label: t('home.do.payment', 'قبضت من جهة'), action: 'hub-new-payment', show: can(role, 'payment.post') },
    { to: '/accounts/parties?new=payout', label: t('home.do.payout', 'دفعت لجهة'), action: 'hub-new-payout', show: can(role, 'payment.post') },
    { to: '/accounts/expenses?new=1', label: t('home.do.expense', 'مصروف'), action: 'hub-new-expense', show: can(role, 'expense.post') },
    { to: '/accounts/moves', label: t('moves.title', 'حركة الأموال'), action: 'hub-moves', show: true },
    { to: '/accounts/cash', label: t('cash.title', 'الصناديق'), action: 'hub-boxes', show: true },
    { to: '/accounts/expenses', label: t('expense.title', 'المصاريف'), action: 'hub-expenses-page', show: true },
    { to: '/accounts/parties', label: t('hub.parties', 'كلّ الجهات'), action: 'hub-parties', show: true },
    { to: '/accounts/openings', label: t('openings.title', 'الأرصدة عند البداية'), action: 'hub-openings', show: can(role, 'opening.post') },
    { to: '/accounts/month', label: t('monthsum.title', 'خلاصة الشهر'), action: 'hub-month-page', show: true },
  ];
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t('accounts.nav', 'صفحات الحسابات')}>
      {links
        .filter((link) => link.show)
        .map((link) => (
          <Link key={link.action} to={link.to} className={PILL} data-action={link.action}>
            {link.label}
          </Link>
        ))}
    </nav>
  );
}

/** البطاقات بترتيب الهاتف (§9.9)، وعمودان من عرض الآيباد. */
export function HubCards({ data }: { data: MoneyOverview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CashCard cash={data.cash} />
      <DebtsCard debts={data.debts} />
      <TodayCard day={data.day} today={data.today} />
      <MonthCard month={data.month} monthFrom={data.monthFrom} />
      <TopCard title={t('hub.top.receivable', 'أكبر خمسة لنا عندهم')} rows={data.topReceivable} action="hub-top-receivable" />
      <TopCard title={t('hub.top.payable', 'أكبر خمسة علينا لهم')} rows={data.topPayable} action="hub-top-payable" />
      <AlertsCard alerts={data.alerts} />
    </div>
  );
}

export default function MoneyHubPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const overview = useLoad(money.loadMoneyOverview, workspace?.orgId ?? 'none');
  const header = (
    <PageHeader
      title={t('hub.title', 'خلاصة المال')}
      subtitle={overview.data ? t('hub.subtitle', 'النقد والذمم وحركة اليوم والشهر حتى {day}.', { day: fmtDay(overview.data.today) }) : t('hub.subtitle.none', 'النقد والذمم وحركة اليوم والشهر.')}
    />
  );
  if (overview.error instanceof NotConnectedError) {
    const { title, detail } = describeError(overview.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {header}
      {overview.error ? (
        <LoadFailed what={t('hub.what', 'خلاصة المال')} error={overview.error} onRetry={overview.retry} />
      ) : !overview.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <HubCards data={overview.data} />
      )}
      <HubLinks role={workspace?.role ?? 'viewer'} />
    </div>
  );
}
