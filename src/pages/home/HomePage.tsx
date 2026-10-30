import { ArrowLeftRight, Bird, ChevronLeft, ClipboardCheck, Fuel, HandCoins, PackageMinus, PackagePlus, Pill, Receipt, Wallet, Wheat, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { InstallCard } from '../../components/shell/InstallCard';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { PageHeader } from '../../components/PageHeader';
import type { DivisionKind } from '../../domain/divisions';
import { localDay } from '../../domain/dates';
import { can } from '../../domain/permissions';
import type { Workspace } from '../../domain/workspace';
import { describeError, NotConnectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtMoney } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import * as home from '../../lib/repo/home';
import type { HomeSummary } from '../../lib/repo/home';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';

// بطاقة لكل وحدة ضمن نطاق المستخدم بأهمّ أرقام اليوم، والحسابات (لنا وعلينا) لأدوارها بس. الوحدات التي لم تُبنَ شاشاتها بعد
// (حقول اللحم والبيض، وإنتاج المعمل ووجبات المفقس) بـplannedCards.tsx، لا تُعرض هنا: بطاقتا المعمل والمفقس بأرقام مخازنهما
// وتفتحان مخازنهما، مثل الشريط (nav.ts).
// الرقم الغايب «—» مو صفر: ما ينكال رقم إلا بعد قراءة ناجحة.

/**
 * number: رقم صافي (fmtInt، fmtMoney، نسبة) بـdd dir="ltr" حتى الفواصل والإشارة تبقى بمكانها.
 * text: جملة بيها وحدة عربية («46 طبقة + 12 بيضة»، «6.120 طن») ترث RTL: dir=ltr كان يطلّع «46» أوّل
 * و«طبقة + 12 بيضة» مقلوبة، فالقارئ يشوف 46 جنب «بيضة». وأرقام جمل الأيام («بعد 4 أيام») تنعزل بـNum.
 */
export interface Metric {
  label: string;
  kind: 'number' | 'text';
  value: ReactNode | null;
}

export interface CardSpec {
  key: DivisionKind | 'accounts';
  to: string;
  title: string;
  icon: LucideIcon;
  metrics: Metric[];
}

/** مصدّرة حتى ينفحص اتّجاه كل رقم بلا متصفّح. */
export function cardSpecs(summary: HomeSummary | null): CardSpec[] {
  // بلا ملخّص (لسّه يتحمّل أو فشل) كل رقم «—»: ملخّص فارغ بدل null حتى الفحوص أقصر (حزمة الرئيسية بالتثبيت المسبق).
  const s: HomeSummary = summary ?? {};
  const { accounts } = s;
  return [
    {
      key: 'feed_mill',
      to: '/inventory/mill',
      title: t('nav.mill_stores', 'مخازن المعمل'),
      icon: Wheat,
      metrics: [
        { label: t('home.general.low', 'تحت الحدّ الأدنى'), kind: 'number', value: s.millBelowMinimum !== undefined ? fmtInt(s.millBelowMinimum) : null },
      ],
    },
    {
      key: 'hatchery',
      to: '/inventory/hatchery',
      title: t('nav.hatchery_stores', 'مخازن المفقس'),
      icon: Bird,
      metrics: [
        { label: t('home.hatchery.old', 'أفراخ فاتها 48 ساعة'), kind: 'number', value: s.oldChicks !== undefined ? fmtInt(s.oldChicks) : null },
        { label: t('home.general.low', 'تحت الحدّ الأدنى'), kind: 'number', value: s.hatcheryBelowMinimum !== undefined ? fmtInt(s.hatcheryBelowMinimum) : null },
      ],
    },
    {
      key: 'medicine',
      to: '/inventory/medicine',
      title: t('nav.medicine', 'مخزن الأدوية'),
      icon: Pill,
      metrics: [
        { label: t('home.medicine.expiry', 'قريب الانتهاء'), kind: 'number', value: s.medicine ? fmtInt(s.medicine.nearExpiry) : null },
        { label: t('home.general.low', 'تحت الحدّ الأدنى'), kind: 'number', value: s.medicine ? fmtInt(s.medicine.belowMinimum) : null },
      ],
    },
    {
      key: 'general',
      to: '/inventory/general',
      title: t('nav.general', 'المخازن العامة'),
      icon: Fuel,
      metrics: [{ label: t('home.general.low', 'تحت الحدّ الأدنى'), kind: 'number', value: s.general ? fmtInt(s.general.belowMinimum) : null }],
    },
    {
      key: 'accounts',
      to: '/accounts',
      title: t('nav.accounts', 'الحسابات'),
      icon: Wallet,
      metrics: [
        { label: t('home.accounts.receivable', 'لنا عند الناس'), kind: 'number', value: accounts ? fmtMoney(accounts.receivable, 0) : null },
        { label: t('home.accounts.payable', 'علينا للناس'), kind: 'number', value: accounts ? fmtMoney(accounts.payable, 0) : null },
        // السالب مسموح بالصندوق ويّا تنبيه ظاهر (Q10): عدد الصناديق بالسالب.
        { label: t('home.accounts.negative_boxes', 'صناديق بالسالب'), kind: 'number', value: accounts ? fmtInt(accounts.negativeBoxes) : null },
        // القارئ المحصور (E49): الرقمان من دفاتر نطاقه بس، فالبطاقة تقول من كم دفتر.
        ...(accounts && accounts.visibleBooks < accounts.totalBooks
          ? [{ label: t('home.accounts.books', 'حسابات نطاقك'), kind: 'text' as const, value: t('home.accounts.books.n', '{visible} من المجموع {total}', { visible: fmtInt(accounts.visibleBooks), total: fmtInt(accounts.totalBooks) }) }]
          : []),
      ],
    },
  ];
}

export type HomeActionKey = 'receipt' | 'use' | 'transfer' | 'payout' | 'payment' | 'expense' | 'count';

export interface HomeAction {
  key: HomeActionKey;
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * أزرار «ماذا تريد أن تفعل؟»: كل زرّ يفتح نموذجه مباشرةً، ويظهر بنفس شرط الصفحة التي يفتحها (can بالدور، والحسابات بعلامة
 * الخادم canSeeAccounts مثل الشريط). بلا منشأة مؤكّدة (workspace = null) تظهر كلها مثل الشريط. المنع الحقيقي بالخادم.
 */
export function homeActions(workspace: Pick<Workspace, 'role' | 'canSeeAccounts'> | null): HomeAction[] {
  const allowed = (action: Parameters<typeof can>[1], accounts = false) => !workspace || ((!accounts || workspace.canSeeAccounts) && can(workspace.role, action));
  const all: [HomeAction, boolean][] = [
    [{ key: 'receipt', to: '/inventory/receipts', label: t('home.do.receipt', 'وصلتني بضاعة'), icon: PackagePlus }, allowed('receipt.draft')],
    [{ key: 'use', to: '/inventory/uses', label: t('home.do.use', 'أخرجت مادّة من المخزن'), icon: PackageMinus }, allowed('stock_use.post')],
    [{ key: 'transfer', to: '/inventory/transfers', label: t('home.do.transfer', 'نقلت بين مخزنين'), icon: ArrowLeftRight }, allowed('transfer.post')],
    [{ key: 'payout', to: '/accounts?new=payout', label: t('home.do.payout', 'دفعت لجهة'), icon: Wallet }, allowed('payment.post', true)],
    [{ key: 'payment', to: '/accounts?new=payment', label: t('home.do.payment', 'قبضت من جهة'), icon: HandCoins }, allowed('payment.post', true)],
    [{ key: 'expense', to: '/accounts/expenses?new=1', label: t('home.do.expense', 'مصروف'), icon: Receipt }, allowed('expense.post', true)],
    [{ key: 'count', to: '/inventory/counts', label: t('home.do.count', 'جرد'), icon: ClipboardCheck }, allowed('count.enter')],
  ];
  return all.filter(([, show]) => show).map(([action]) => action);
}

/** أزرار كبيرة بلمسة واحدة: عمودان على الهاتف. */
export function HomeActions({ actions }: { actions: readonly HomeAction[] }) {
  const headingId = useId();
  if (actions.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-semibold">
        {t('home.do.title', 'ماذا تريد أن تفعل؟')}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {actions.map(({ key, to, label, icon: Icon }) => (
          <Link
            key={key}
            to={to}
            data-action={'home-' + key}
            className="card flex min-h-28 flex-col items-center justify-center gap-2 p-4 text-center font-semibold transition-shadow hover:shadow-soft"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
              <Icon aria-hidden="true" className="size-6" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DivisionCard({ spec }: { spec: CardSpec }) {
  const { to, title, icon: Icon, metrics } = spec;
  return (
    <Link to={to} className="card flex flex-col gap-4 p-5 transition-shadow hover:shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
        <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-ink-subtle ltr:rotate-180" />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="truncate text-xs text-ink-muted">{metric.label}</dt>
            {/* الاثنين على بداية الصفحة: نهاية dd بـLTR هي يمين الصفحة، وبداية dd اللي يرث RTL يمينها. */}
            {metric.kind === 'number' ? (
              <dd dir="ltr" className="text-end text-lg font-semibold tabular-nums">
                {metric.value ?? '—'}
              </dd>
            ) : (
              <dd className="text-start text-lg font-semibold tabular-nums">{metric.value ?? '—'}</dd>
            )}
          </div>
        ))}
      </dl>
    </Link>
  );
}

export default function HomePage() {
  const session = useSession();
  const summary = useLoad(home.loadHomeSummary);
  const notConnected = summary.error instanceof NotConnectedError;

  const actions = homeActions(session.status === 'ready' ? session.workspace : null);
  const specs = cardSpecs(summary.data).filter((spec) => {
    if (session.status !== 'ready') return true;
    const { divisions, canSeeAccounts } = session.workspace;
    return spec.key === 'accounts' ? canSeeAccounts : divisions.includes(spec.key);
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('home.title', 'الرئيسية')}
        subtitle={
          <Trans
            k="home.subtitle"
            text="أرقام اليوم {day} لكل وحدة"
            vars={{ day: <span dir="ltr" className="tabular-nums">{fmtDay(localDay())}</span> }}
          />
        }
      />
      <HomeActions actions={actions} />
      {notConnected ? (
        <Notice tone="info" title={describeError(summary.error).title}>
          {t('home.not_connected', 'هذا هيكل النظام: الوحدات والتصميم والتثبيت. تظهر علامة «—» مكان الأرقام حتى تُربط قاعدة البيانات.')}
        </Notice>
      ) : summary.error ? (
        <LoadFailed what={t('home.what', 'أرقام اليوم')} error={summary.error} onRetry={summary.retry} />
      ) : summary.data && Object.keys(summary.data).length === 0 ? (
        <Notice tone="info" title={t('home.coming.title', 'لا أرقام بعد')}>
          {t('home.coming', 'تظهر أرقام اليوم هنا حين تُبنى الوحدات في المراحل القادمة، وتبقى «—» مكانها حتى ذلك الحين.')}
        </Notice>
      ) : null}
      <InstallCard />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {specs.map((spec) => (
          <DivisionCard key={spec.key} spec={spec} />
        ))}
      </div>
    </div>
  );
}
