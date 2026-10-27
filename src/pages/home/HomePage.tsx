import { Bird, ChevronLeft, Drumstick, Egg, Fuel, Pill, Wallet, Wheat, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { InstallCard } from '../../components/shell/InstallCard';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { PageHeader } from '../../components/PageHeader';
import type { DivisionKind } from '../../domain/divisions';
import { localDay } from '../../domain/dates';
import { describeError, NotConnectedError } from '../../lib/errors';
import { countForm, fmtDay, fmtInt, fmtMoney, fmtQty } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import * as home from '../../lib/repo/home';
import type { HomeSummary } from '../../lib/repo/home';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';

// بطاقة لكل وحدة ضمن نطاق المستخدم بأهمّ أرقام اليوم، والحسابات (لنا وعلينا) لأدوارها بس.
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

const TRAY = 30_000n;
// صيغ المعدود بعد رقم: «5 طبقات + 5 بيضات»، «12 طبقة + 15 بيضة»، «طبقة واحدة + بيضتان».
const eggForms = () => ({ one: t('unit.egg.one', 'بيضة واحدة'), two: t('unit.egg.two', 'بيضتان'), few: t('unit.egg.few', 'بيضات'), many: t('unit.egg.many', 'بيضة') });
const trayForms = () => ({ one: t('unit.tray.one', 'طبقة واحدة'), two: t('unit.tray.two', 'طبقتان'), few: t('unit.tray.few', 'طبقات'), many: t('unit.tray.many', 'طبقة') });

/** رقم جوّا جملة عربية، معزول LTR حتى ما يتلخبط ترتيبه ويّا الكلمات والإشارات حواليه. */
function Num({ n }: { n: number }) {
  return <bdi dir="ltr">{fmtInt(n)}</bdi>;
}

/** عدد أيام بصيغته (countForm). genitive بعد حرف جرّ أو ظرف («بعد يومين»، «منذ يوم واحد»)، وبلاه مرفوع («يومان»). */
function Days({ n, genitive = false }: { n: number; genitive?: boolean }) {
  if (n === 1) return <>{t('home.days.one', 'يوم واحد')}</>;
  if (n === 2) return <>{genitive ? t('home.days.two_genitive', 'يومين') : t('home.days.two', 'يومان')}</>;
  const vars = { n: <Num n={n} /> };
  const form = countForm(n);
  if (form === 'few') return <Trans k="home.days.few" text="{n} أيام" vars={vars} />;
  if (form === 'many') return <Trans k="home.days.many" text="{n} يوماً" vars={vars} />;
  return <Trans k="home.days.hundreds" text="{n} يوم" vars={vars} />;
}

/**
 * أعمار الأفواج النشطة: «12 إلى 35 يوماً» (المعدود يتبع الرقم الأخير)، أو عمر واحد إذا كلها بنفس العمر.
 * إذا الأكبر 1 أو 2 ما ينكتب معدود بعد الرقم بالفصحى: الاسم يحمل العدد («يوم واحد إلى يومين»).
 */
function Ages({ min, max }: { min: number; max: number }) {
  if (min === max) return <Days n={min} />;
  if (max <= 2) {
    return <Trans k="home.broiler.ages_small" text="{min} إلى {max}" vars={{ min: <Days n={min} />, max: <Days n={max} genitive /> }} />;
  }
  const vars = { min: <Num n={min} />, max: <Num n={max} /> };
  const form = countForm(max);
  if (form === 'few') return <Trans k="home.broiler.ages_few" text="{min} إلى {max} أيام" vars={vars} />;
  if (form === 'many') return <Trans k="home.broiler.ages_many" text="{min} إلى {max} يوماً" vars={vars} />;
  return <Trans k="home.broiler.ages_hundreds" text="{min} إلى {max} يوم" vars={vars} />;
}

/** أقرب إخراج متوقّع بين الوجبات قيد التفقيس. سالب = فات موعده ولم يُخرَج بعد. «منذ» تجرّ مثل «بعد». */
function NextHatch({ days }: { days: number }) {
  if (days === 0) return <>{t('home.hatchery.next_today', 'اليوم')}</>;
  if (days > 0) return <Trans k="home.hatchery.next_in" text="بعد {days}" vars={{ days: <Days n={days} genitive /> }} />;
  return <Trans k="home.hatchery.next_late" text="فات موعده منذ {days}" vars={{ days: <Days n={-days} genitive /> }} />;
}

/** مصدّرة حتى ينفحص اتّجاه كل رقم بلا متصفّح. */
export function cardSpecs(summary: HomeSummary | null): CardSpec[] {
  // بلا ملخّص (لسّه يتحمّل أو فشل) كل رقم «—»: ملخّص فارغ بدل null حتى الفحوص أقصر (حزمة الرئيسية بالتثبيت المسبق).
  const s: HomeSummary = summary ?? {};
  const { accounts } = s;
  return [
    {
      key: 'feed_mill',
      to: '/mill',
      title: t('nav.mill', 'معمل العلف'),
      icon: Wheat,
      metrics: [
        { label: t('home.mill.produced', 'إنتاج اليوم'), kind: 'text', value: s.feedMill ? fmtQty(s.feedMill.producedTodayKg, 'kg').main : null },
        { label: t('home.mill.stock', 'العلف الجاهز'), kind: 'text', value: s.feedMill ? fmtQty(s.feedMill.feedInStockKg, 'kg').main : null },
      ],
    },
    {
      key: 'broiler',
      to: '/broiler',
      title: t('nav.broiler', 'حقول اللحم'),
      icon: Drumstick,
      metrics: [
        { label: t('home.broiler.active', 'الأفواج النشطة'), kind: 'number', value: s.broiler ? fmtInt(s.broiler.activeFlocks) : null },
        {
          label: t('home.broiler.ages', 'الأعمار'),
          kind: 'text',
          value: s.broiler?.ageDays ? <Ages min={s.broiler.ageDays.min} max={s.broiler.ageDays.max} /> : null,
        },
        { label: t('home.broiler.dead', 'نفوق اليوم'), kind: 'number', value: s.broiler ? fmtInt(s.broiler.deadToday) : null },
      ],
    },
    {
      key: 'layer',
      to: '/layers',
      title: t('nav.layers', 'حقول البيض'),
      icon: Egg,
      metrics: [
        { label: t('home.layer.eggs', 'بيض اليوم'), kind: 'number', value: s.layer ? fmtInt(s.layer.eggsToday) : null },
        { label: t('home.layer.hdep', 'نسبة الإنتاج'), kind: 'number', value: s.layer?.hdepPercent ? `${s.layer.hdepPercent}%` : null },
        {
          label: t('home.layer.trays', 'في المخزن'),
          kind: 'text',
          value: s.layer
            ? fmtQty(s.layer.traysInStore, 'pc', { pieceLabel: t('unit.egg', 'بيضة'), pieceForms: eggForms(), pack: { label: t('unit.tray', 'طبقة'), ...trayForms(), factor: TRAY } }).main
            : null,
        },
      ],
    },
    {
      key: 'hatchery',
      to: '/hatchery',
      title: t('nav.hatchery', 'المفقس'),
      icon: Bird,
      metrics: [
        { label: t('home.hatchery.setting', 'وجبات قيد التفقيس'), kind: 'number', value: s.hatchery ? fmtInt(s.hatchery.batchesSetting) : null },
        {
          label: t('home.hatchery.next', 'أقرب إخراج'),
          kind: 'text',
          value: s.hatchery && s.hatchery.nextHatchInDays !== null ? <NextHatch days={s.hatchery.nextHatchInDays} /> : null,
        },
        { label: t('home.hatchery.chicks', 'أفراخ في الانتظار'), kind: 'number', value: s.hatchery ? fmtInt(s.hatchery.chicksWaiting) : null },
      ],
    },
    {
      key: 'medicine',
      to: '/inventory/medicine',
      title: t('nav.medicine', 'مخزن الأدوية'),
      icon: Pill,
      metrics: [{ label: t('home.medicine.expiry', 'قريب الانتهاء'), kind: 'number', value: s.medicine ? fmtInt(s.medicine.nearExpiry) : null }],
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
          ? [{ label: t('home.accounts.books', 'دفاتر نطاقك'), kind: 'text' as const, value: t('home.accounts.books.n', '{visible} من المجموع {total}', { visible: fmtInt(accounts.visibleBooks), total: fmtInt(accounts.totalBooks) }) }]
          : []),
      ],
    },
  ];
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
