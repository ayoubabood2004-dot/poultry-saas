import { ArrowLeftRight, CheckCheck, ChevronLeft, ClipboardCheck, ClipboardList, Drumstick, Egg, Factory, HandCoins, HardDrive, PackageMinus, PackagePlus, Receipt, Reply, ShoppingCart, TriangleAlert, Wallet, Warehouse, type LucideIcon } from 'lucide-react';
import { useCallback, useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { InstallCard } from '../../components/shell/InstallCard';
import { Button } from '../../components/ui/Button';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { PageHeader } from '../../components/PageHeader';
import type { DivisionKind } from '../../domain/divisions';
import { localDay } from '../../domain/dates';
import type { FlockKind } from '../../domain/flocks';
import { can, type Role } from '../../domain/permissions';
import type { Workspace } from '../../domain/workspace';
import { describeError, NotConnectedError } from '../../lib/errors';
import { countForm, fmtDay, fmtInt, fmtMoney, fmtPercent } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import { STORE_ROLES } from '../../lib/nav';
import type { FlocksOverview } from '../../lib/repo/flocks';
import * as home from '../../lib/repo/home';
import type { HomeSummary } from '../../lib/repo/home';
import { roundQueueStore } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { loadOverviewKept } from '../farm/shared';

// الرئيسية بثلاث طبقات (كلمة المالك 2026-11-02، «الاستخدام اليومي»): «شغل اليوم» أوّل شي (مهامّ اليوم بعدّاداتها، كل صفّ لمسة
// وحدة لفعله)، ثم «ماذا تريد أن تفعل؟» بأربعة أزرار بأولوية الدور والباقي خلف «أعمال أخرى»، ثم «أرقام اليوم» ببطاقة لكل وحدة
// ضمن نطاق المستخدم، والحسابات (لنا وعلينا) لأدوارها بس. حقول اللحم والبيض بأرقام قراءة الحقول (flocks_overview). الوحدات التي
// لم تُبنَ شاشاتها بعد (إنتاج المعمل ووجبات المفقس) بـplannedCards.tsx، لا تُعرض هنا: بطاقة المعمل بأرقام مخازنه وتفتح المعمل
// نفسه (0015). والمخازن ببطاقة واحدة «المخزن» تفتح التبويب الواحد (كلمة المالك 2026-11-04)، مثل الشريط (nav.ts). الرقم الغايب
// «—» مو صفر: ما ينكال رقم إلا بعد قراءة ناجحة.

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

/** رقم جوّا جملة عربية، معزول LTR حتى ما يتلخبط ترتيبه ويّا الكلمات والإشارات حواليه. */
function Num({ n }: { n: number }) {
  return <bdi dir="ltr">{fmtInt(n)}</bdi>;
}

/** أرقام بطاقتي حقول اللحم والبيض من قراءة الحقول (flocks_overview، المرحلة 2): الأفواج الشغّالة وحيّها ونافق اليوم، والبيض ونسبته. */
export interface FarmCards {
  broiler: { active: number; live: number; deadToday: number };
  /** eggsToday وliveStart للأفواج اللي انسجّل بيض يومها بس (القاعدة 32: بلا بيض مسجّل «—» مو صفر). */
  layer: { active: number; eggsToday: number | null; liveStart: number };
}

export function farmCards(overview: FlocksOverview): FarmCards {
  const cards: FarmCards = { broiler: { active: 0, live: 0, deadToday: 0 }, layer: { active: 0, eggsToday: null, liveStart: 0 } };
  for (const site of overview.sites) {
    for (const hall of site.halls) {
      const flock = hall.flock;
      if (!flock || flock.status !== 'active') continue;
      if (flock.kind === 'broiler') {
        cards.broiler.active += 1;
        cards.broiler.live += flock.live;
        cards.broiler.deadToday += flock.today?.dead ?? 0;
      } else {
        cards.layer.active += 1;
        if (flock.eggsToday !== null) {
          cards.layer.eggsToday = (cards.layer.eggsToday ?? 0) + flock.eggsToday;
          cards.layer.liveStart += flock.liveStartToday;
        }
      }
    }
  }
  return cards;
}

/** مهامّ «شغل اليوم» من نفس قراءة الحقول (قراءة وحدة للبطاقات وللمهامّ، بلا دالّة قاعدة جديدة). */
export interface FarmTasks {
  /** قاعات فوجها نشط ومسكّن اليوم أو قبله وما انحفظت جولة يومها بعد. */
  left: { broiler: number; layer: number };
  /** جولات ردّها الخادم للمدير (flock_day_rejects): تنتظر مراجعته. */
  rejects: { broiler: number; layer: number };
}

export function farmTasks(overview: FlocksOverview): FarmTasks {
  const tasks: FarmTasks = { left: { broiler: 0, layer: 0 }, rejects: { broiler: 0, layer: 0 } };
  for (const site of overview.sites) {
    for (const hall of site.halls) {
      const flock = hall.flock;
      if (!flock) continue;
      tasks.rejects[flock.kind] += flock.rejectsPending;
      if (flock.status === 'active' && flock.placedOn !== null && flock.placedOn <= overview.today && flock.today === null) tasks.left[flock.kind] += 1;
    }
  }
  return tasks;
}

/** نوع كل فوج بالقراءة: صفّ «تنتظر الإرسال» يفتح جولة نوع أوّل عملية بالجهاز. */
export function flockKinds(overview: FlocksOverview): Record<string, FlockKind> {
  const kinds: Record<string, FlockKind> = {};
  for (const site of overview.sites) for (const hall of site.halls) if (hall.flock) kinds[hall.flock.id] = hall.flock.kind;
  return kinds;
}

export type TaskKey = 'round_broiler' | 'round_layer' | 'pending' | 'rejects';

/** صفّ بـ«شغل اليوم»: رابط فعله وعدّاده. العدّاد صفر ما يصير صفّاً أبداً. */
export interface TaskRow {
  key: TaskKey;
  to: string;
  n: number;
  icon: LucideIcon;
}

export interface TodaySources {
  /** can('flock_day.save') وبنطاقه حقل من النوع (الشاشة تقترح، والمنع الحقيقي بالخادم). */
  rounds: { broiler: boolean; layer: boolean };
  /** can('flock.manage'): الجولات المردودة للمدير. */
  manage: boolean;
  /** null = ما انقرت الحقول (لسّه، أو فشلت، أو نسخة الجهاز): صفوف الخادم تُخفى بهدوء. */
  farms: FarmTasks | null;
  /** عمليات الجهاز اللي ما انرفعت (pendingOps) ونوع أوّل عملية؛ null = ما تنقرا لهذا الدور. */
  pending: { n: number; kind: FlockKind } | null;
}

/**
 * صفوف «شغل اليوم» بترتيب يومه: الجولة أوّلاً، ثم اللي بالجهاز، ثم المردود. «المخزن ببساطة» (كلمة المالك 2026-11-06): صفّ «أوراق
 * استلام تنتظر الحفظ النهائي» انشال — الشراء يُحفظ فوراً من ملفّ المادّة، فلا ورقة تنتظر أحداً.
 */
export function todayRows(sources: TodaySources): TaskRow[] {
  const { rounds, manage, farms, pending } = sources;
  const rows: TaskRow[] = [];
  if (farms) {
    if (rounds.broiler && farms.left.broiler > 0) rows.push({ key: 'round_broiler', to: '/broiler/round', n: farms.left.broiler, icon: ClipboardList });
    if (rounds.layer && farms.left.layer > 0) rows.push({ key: 'round_layer', to: '/layers/round', n: farms.left.layer, icon: ClipboardList });
  }
  if (pending && pending.n > 0) rows.push({ key: 'pending', to: pending.kind === 'layer' ? '/layers/round' : '/broiler/round', n: pending.n, icon: HardDrive });
  if (farms && manage) {
    const rejects = farms.rejects.broiler + farms.rejects.layer;
    if (rejects > 0) rows.push({ key: 'rejects', to: farms.rejects.broiler > 0 ? '/broiler' : '/layers', n: rejects, icon: Reply });
  }
  return rows;
}

/** قاعات بلا جولة اليوم بصيغة المعدود الفصيحة: «قاعة واحدة باقية»، «قاعتان باقيتان»، «5 قاعات باقية»، «12 قاعةً باقية». */
function HallsLeft({ n }: { n: number }) {
  if (n === 1) return <>{t('home.today.halls.one', 'قاعة واحدة باقية')}</>;
  if (n === 2) return <>{t('home.today.halls.two', 'قاعتان باقيتان')}</>;
  const vars = { n: <Num n={n} /> };
  const form = countForm(n);
  if (form === 'few') return <Trans k="home.today.halls.few" text="{n} قاعات باقية" vars={vars} />;
  if (form === 'many') return <Trans k="home.today.halls.many" text="{n} قاعةً باقية" vars={vars} />;
  return <Trans k="home.today.halls.hundreds" text="{n} قاعة باقية" vars={vars} />;
}

/** جولات بصيغة المعدود: «جولة واحدة»، «جولتان»، «5 جولات»، «12 جولةً». */
function Rounds({ n }: { n: number }) {
  if (n === 1) return <>{t('home.today.rounds.one', 'جولة واحدة')}</>;
  if (n === 2) return <>{t('home.today.rounds.two', 'جولتان')}</>;
  const vars = { n: <Num n={n} /> };
  const form = countForm(n);
  if (form === 'few') return <Trans k="home.today.rounds.few" text="{n} جولات" vars={vars} />;
  if (form === 'many') return <Trans k="home.today.rounds.many" text="{n} جولةً" vars={vars} />;
  return <Trans k="home.today.rounds.hundreds" text="{n} جولة" vars={vars} />;
}

function taskLabel({ key, n }: TaskRow): ReactNode {
  if (key === 'round_broiler') return <Trans k="home.today.round_broiler" text="جولة حقول اللحم: {halls}" vars={{ halls: <HallsLeft n={n} /> }} />;
  if (key === 'round_layer') return <Trans k="home.today.round_layer" text="جولة حقول البيض: {halls}" vars={{ halls: <HallsLeft n={n} /> }} />;
  if (key === 'pending') return <Trans k="home.today.pending" text="تنتظر الإرسال: {rounds}" vars={{ rounds: <Rounds n={n} /> }} />;
  return <Trans k="home.today.rejects" text="رُدّت إليك: {rounds}" vars={{ rounds: <Rounds n={n} /> }} />;
}

function TaskLink({ row }: { row: TaskRow }) {
  const { key, to, icon: Icon } = row;
  return (
    <Link
      to={to}
      data-action={'today-' + key}
      className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2 font-medium transition-colors active:bg-surface-3"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">{taskLabel(row)}</span>
      <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-ink-subtle ltr:rotate-180" />
    </Link>
  );
}

/**
 * «شغل اليوم» فوك كل شي: صفوف المهامّ بعدّاداتها، و«أنجزت شغل اليوم» إذا ماكو شي، وهيكل هادئ بلا أرقام أثناء القراءة.
 * ما تختفي أبداً: ظهورها كل يوم هو العادة. وفشل قراءة الحقول سطر بزرّ «أعد المحاولة» ما يكسر باقي الصفحة.
 */
export function TodayCard({
  rows,
  loading,
  failed,
  onRetry,
  notConnected = false,
}: {
  rows: readonly TaskRow[];
  loading: boolean;
  failed: unknown;
  onRetry: () => void;
  notConnected?: boolean;
}) {
  const headingId = useId();
  const empty = rows.length === 0;
  return (
    <section aria-labelledby={headingId} className="card flex flex-col gap-2 p-4 sm:p-6">
      <div className="flex items-baseline gap-2">
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-lg font-semibold">
          {t('home.today.title', 'شغل اليوم')}
        </h2>
        <span dir="ltr" className="shrink-0 text-xs tabular-nums text-ink-muted">
          {fmtDay(localDay())}
        </span>
      </div>
      {notConnected ? (
        <p className="text-sm text-ink-muted">{t('home.today.no_db', 'لا تظهر مهامّ اليوم حتى تُربط قاعدة البيانات.')}</p>
      ) : loading && empty ? (
        <>
          <span role="status" className="sr-only">
            {t('home.today.loading', 'جارٍ قراءة شغل اليوم…')}
          </span>
          <div aria-hidden="true" className="h-11 rounded-2xl bg-surface-2" />
          <div aria-hidden="true" className="h-11 rounded-2xl bg-surface-2" />
        </>
      ) : (
        <>
          {rows.map((row) => (
            <TaskLink key={row.key} row={row} />
          ))}
          {failed ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-danger-700 dark:text-danger-200" />
              <span className="min-w-0 flex-1">{t('home.today.failed', 'تعذّر تحميل شغل اليوم')}</span>
              <Button variant="secondary" size="sm" onClick={onRetry} data-action="today-retry">
                {t('load_failed.retry', 'أعد المحاولة')}
              </Button>
            </div>
          ) : empty ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <CheckCheck aria-hidden="true" className="size-5 shrink-0 text-success-800 dark:text-success-100" />
              {t('home.today.done', 'أنجزت شغل اليوم')}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * أرقام بطاقة «المخزن»: كلّ رقم كما أرسله الخادم لوحدة بنطاق القارئ، **بلا جمع بالشاشة** (المجاميع من SQL):
 * وحدة لم يرسلها الخادم (ليس للقارئ مخزن فيها، home_summary) لا يُرسم سطرها، فلا بطاقة
 * بسطرين «—» لمشغّل المعمل أو لمن نطاقه بلا أدوية ولا مفقس (مراجعة 2026-11-04). وقريب
 * الانتهاء وأفراخ 48 ساعة تنبيهان استثنائيان، فلا يغمران البطاقة إلا إن وجدا. وقبل أيّ
 * قراءة (ملخّص فارغ) سطر واحد بـ«—» مثل بقية البطاقات.
 */
export function storeMetrics(s: HomeSummary): Metric[] {
  const out: Metric[] = [];
  if (s.medicine && s.medicine.nearExpiry > 0) {
    out.push({ label: t('home.store.expiry', 'الأدوية — قريب الانتهاء'), kind: 'number', value: fmtInt(s.medicine.nearExpiry) });
  }
  if (s.oldChicks !== undefined && s.oldChicks > 0) {
    out.push({ label: t('home.store.old_chicks', 'المفقس — أفراخ فاتها 48 ساعة'), kind: 'number', value: fmtInt(s.oldChicks) });
  }
  if (s.general) out.push({ label: t('home.store.low.general', 'المخازن العامة — تحت الحدّ الأدنى'), kind: 'number', value: fmtInt(s.general.belowMinimum) });
  if (s.medicine) out.push({ label: t('home.store.low.medicine', 'الأدوية — تحت الحدّ الأدنى'), kind: 'number', value: fmtInt(s.medicine.belowMinimum) });
  if (s.hatcheryBelowMinimum !== undefined) {
    out.push({ label: t('home.store.low.hatchery', 'المفقس — تحت الحدّ الأدنى'), kind: 'number', value: fmtInt(s.hatcheryBelowMinimum) });
  }
  if (out.length === 0) out.push({ label: t('home.general.low', 'تحت الحدّ الأدنى'), kind: 'number', value: null });
  return out;
}

/** مصدّرة حتى ينفحص اتّجاه كل رقم بلا متصفّح. */
export function cardSpecs(summary: HomeSummary | null, farms: FarmCards | null = null): CardSpec[] {
  // بلا ملخّص (لسّه يتحمّل أو فشل) كل رقم «—»: ملخّص فارغ بدل null حتى الفحوص أقصر (حزمة الرئيسية بالتثبيت المسبق).
  const s: HomeSummary = summary ?? {};
  const { accounts } = s;
  const layer = farms?.layer;
  return [
    {
      key: 'broiler',
      to: '/broiler',
      title: t('nav.broiler', 'حقول اللحم'),
      icon: Drumstick,
      metrics: [
        { label: t('home.broiler.active', 'الأفواج النشطة'), kind: 'number', value: farms ? fmtInt(farms.broiler.active) : null },
        { label: t('home.broiler.live', 'الطيور الحيّة'), kind: 'number', value: farms ? fmtInt(farms.broiler.live) : null },
        { label: t('home.broiler.dead_today', 'نافق اليوم'), kind: 'number', value: farms ? fmtInt(farms.broiler.deadToday) : null },
      ],
    },
    {
      key: 'layer',
      to: '/layers',
      title: t('nav.layers', 'حقول البيض'),
      icon: Egg,
      metrics: [
        { label: t('home.layer.active', 'الأفواج النشطة'), kind: 'number', value: layer ? fmtInt(layer.active) : null },
        { label: t('home.layer.eggs', 'بيض اليوم'), kind: 'number', value: layer?.eggsToday !== null && layer?.eggsToday !== undefined ? fmtInt(layer.eggsToday) : null },
        { label: t('home.layer.hdep_today', 'نسبة الإنتاج اليوم'), kind: 'number', value: layer?.eggsToday !== null && layer?.eggsToday !== undefined && layer.liveStart > 0 ? `${fmtPercent(BigInt(layer.eggsToday), BigInt(layer.liveStart))}%` : null },
      ],
    },
    {
      key: 'feed_mill',
      // المعمل نفسه (خلطاته وإنتاجه)، لا مخازنه: هناك يُنتج العلف، ومخازنه داخل تبويب «المخزن» مثل باقي المخازن.
      to: '/mill',
      title: t('nav.mill', 'معمل العلف'),
      icon: Factory,
      metrics: [
        { label: t('home.general.low', 'تحت الحدّ الأدنى'), kind: 'number', value: s.millBelowMinimum !== undefined ? fmtInt(s.millBelowMinimum) : null },
      ],
    },
    {
      // بطاقة واحدة للمخازن كلها (كلمة المالك 2026-11-04: تبويب واحد اسمه «المخزن»، والمخازن الجانبية داخله)، بدل بطاقة
      // لكل وحدة. مفتاحها general لأن المفتاح نوع وحدة (CardSpec.key)، وظهورها بالدور لا بالوحدة (ظهور بندها بالشريط).
      // الرقمان من الخادم كما هما، بلا جمع بالشاشة: «تحت الحدّ الأدنى» شارة على بطاقة كل مخزن داخل التبويب، وجمعه هنا
      // عبر الوحدات يكون حساباً بالشاشة (المجاميع من SQL).
      key: 'general',
      to: '/inventory',
      title: t('nav.store', 'المخزن'),
      icon: Warehouse,
      metrics: storeMetrics(s),
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

export type HomeActionKey = 'round_broiler' | 'round_layer' | 'produce' | 'purchase' | 'sale' | 'use' | 'transfer' | 'payout' | 'payment' | 'expense' | 'count';

export interface HomeAction {
  key: HomeActionKey;
  to: string;
  label: string;
  icon: LucideIcon;
}

/** أزرار «ماذا تريد أن تفعل؟» المعروضة، والباقي خلف «أعمال أخرى» (كلمة المالك: تسعة أزرار متساوية ما تُقرأ). */
export const HOME_ACTIONS_SHOWN = 4;

/**
 * أوّل ما يلمسه كل دور بيومه (كلمة المالك 2026-11-02): أولوية ترتيب مو قائمة ظهور — الممنوع ينشال بـcan قبلها، واللي برّا
 * السطر يبقى بترتيبه الافتراضي بعد المرتّبين. أدوار بلا سطر (المشاهد ومشغّلا المعمل والمفقس) بالترتيب الافتراضي.
 */
const PRIORITY: Partial<Record<Role, readonly HomeActionKey[]>> = {
  hall_worker: ['round_broiler', 'round_layer'],
  mill_operator: ['produce'],
  storekeeper: ['purchase', 'use', 'transfer', 'count', 'sale'],
  accountant: ['payout', 'payment', 'expense', 'purchase', 'sale'],
  owner: ['round_broiler', 'round_layer', 'purchase', 'sale', 'payout', 'payment'],
  manager: ['round_broiler', 'round_layer', 'purchase', 'sale', 'payout', 'payment'],
};

/**
 * أزرار «ماذا تريد أن تفعل؟»: كل زرّ يفتح نموذجه مباشرةً، ويظهر بنفس شرط الصفحة التي يفتحها (can بالدور، والحسابات بعلامة
 * الخادم canSeeAccounts مثل الشريط). بلا منشأة مؤكّدة (workspace = null) تظهر كلها مثل الشريط. المنع الحقيقي بالخادم.
 */
export function homeActions(workspace: (Pick<Workspace, 'role' | 'canSeeAccounts'> & { divisions?: readonly DivisionKind[] }) | null): HomeAction[] {
  const allowed = (action: Parameters<typeof can>[1], accounts = false) => !workspace || ((!accounts || workspace.canSeeAccounts) && can(workspace.role, action));
  // الجولة اليومية (المرحلة 2): لمن يحفظ يوم الفوج وبنطاقه حقول من نوعها.
  const farm = (division: DivisionKind) => allowed('flock_day.save') && (!workspace?.divisions || workspace.divisions.includes(division));
  const all: [HomeAction, boolean][] = [
    [{ key: 'round_broiler', to: '/broiler/round', label: t('home.do.round_broiler', 'جولة حقول اللحم'), icon: ClipboardList }, farm('broiler')],
    [{ key: 'round_layer', to: '/layers/round', label: t('home.do.round_layer', 'جولة حقول البيض'), icon: ClipboardList }, farm('layer')],
    // «سجّل شراء» (كلمة المالك 2026-11-06، «المخزن ببساطة»): يفتح بطاقات المواد، ومنها ملفّ المادّة وشراؤها الفوري — لا ورقة الاستلام
    // المقسومة بين الأمين والمحاسب. لمن يسجّل الشراء (purchase.record: المالك والمدير والمحاسب والأمين).
    [{ key: 'purchase', to: '/inventory', label: t('home.do.purchase', 'سجّل شراء'), icon: PackagePlus }, allowed('purchase.record')],
    // «بِع» (0021، كلمة المالك 2026-11-08: «ماكو زر يوديني للمبيعات حتى ابيع»): يفتح «بيع جديد» في صفحة المبيعات، لأدوار الشراء نفسها.
    [{ key: 'sale', to: '/sales?new=1', label: t('home.do.sale', 'بِع'), icon: ShoppingCart }, allowed('sale.record')],
    [{ key: 'use', to: '/inventory/uses', label: t('home.do.use', 'أخرجت مادّة من المخزن'), icon: PackageMinus }, allowed('stock_use.post')],
    [{ key: 'transfer', to: '/inventory/transfers', label: t('home.do.transfer', 'نقلت بين مخزنين'), icon: ArrowLeftRight }, allowed('transfer.post')],
    [{ key: 'payout', to: '/accounts?new=payout', label: t('home.do.payout', 'دفعت لجهة'), icon: Wallet }, allowed('payment.post', true)],
    [{ key: 'payment', to: '/accounts?new=payment', label: t('home.do.payment', 'قبضت من جهة'), icon: HandCoins }, allowed('payment.post', true)],
    [{ key: 'expense', to: '/accounts/expenses?new=1', label: t('home.do.expense', 'مصروف'), icon: Receipt }, allowed('expense.post', true)],
    [{ key: 'count', to: '/inventory/counts', label: t('home.do.count', 'جرد'), icon: ClipboardCheck }, allowed('count.enter')],
    // إنتاج العلف (0015): لمن يسوّد الدفعة (مشغّل المعمل والمدير والمالك)؛ والمحاسب يرحّل ولا يسوّد، فلا زرّ له.
    [{ key: 'produce', to: '/mill', label: t('home.do.produce', 'أنتج علفاً'), icon: Factory }, allowed('production.draft')],
  ];
  const shown = all.filter(([, show]) => show).map(([action]) => action);
  const order = workspace ? PRIORITY[workspace.role] : undefined;
  if (!order) return shown;
  // sort بـV8 ثابت: اللي برّا الأولوية يبقى بترتيبه الافتراضي بعدها.
  const rank = (key: HomeActionKey) => {
    const index = order.indexOf(key);
    return index < 0 ? order.length : index;
  };
  return shown.sort((a, b) => rank(a.key) - rank(b.key));
}

function ActionLink({ action, lead }: { action: HomeAction; lead: boolean }) {
  const { key, to, label, icon: Icon } = action;
  return (
    <Link
      to={to}
      data-action={'home-' + key}
      className={`card flex min-h-28 flex-col items-center justify-center gap-2 p-4 text-center font-semibold transition-shadow hover:shadow-soft ${
        lead ? 'col-span-2 text-lg sm:col-span-1' : ''
      }`}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      {label}
    </Link>
  );
}

/** أزرار كبيرة بلمسة واحدة: الأوّل عريض بالهاتف وبخطّ أكبر، وأربعة بس، والباقي خلف «أعمال أخرى» مطوية. */
export function HomeActions({ actions }: { actions: readonly HomeAction[] }) {
  const headingId = useId();
  if (actions.length === 0) return null;
  const shown = actions.slice(0, HOME_ACTIONS_SHOWN);
  const rest = actions.slice(HOME_ACTIONS_SHOWN);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-semibold">
        {t('home.do.title', 'ماذا تريد أن تفعل؟')}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((action, index) => (
          <ActionLink key={action.key} action={action} lead={index === 0} />
        ))}
      </div>
      {rest.length > 0 ? (
        <details>
          <summary
            data-action="more-actions"
            className="inline-flex select-none items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2"
          >
            {t('home.do.more', 'أعمال أخرى')}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rest.map((action) => (
              <ActionLink key={action.key} action={action} lead={false} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function DivisionCard({ spec }: { spec: CardSpec }) {
  const { to, title, icon: Icon, metrics } = spec;
  return (
    <Link to={to} className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-soft sm:gap-4 sm:p-6">
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200 sm:size-11">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h3 className="min-w-0 flex-1 truncate font-semibold">{title}</h3>
        <ChevronLeft aria-hidden="true" className="hidden size-5 shrink-0 text-ink-subtle ltr:rotate-180 sm:block" />
      </div>
      {/* بالهاتف أهمّ رقمين بس (البطاقة بعمودين)، والباقي بصفحة القسم؛ ومن sm: كل الأرقام كما هي. */}
      <dl className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        {metrics.map((metric, index) => (
          <div key={metric.label} className={index < 2 ? 'min-w-0' : 'hidden min-w-0 sm:block'}>
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
  // بطاقتا الحقول ومهامّ الجولة من قراءة الحقول نفسها (قراءة وحدة)، بس لمن بنطاقه حقل لحم أو بيض (بلا منشأة مؤكّدة الهيكل
  // كلّه بلا أرقام). القراءة الناجحة تحفظ نسخة الجهاز (عامل فتح الرئيسية بالنت تنفتح جولته بالقاعة بلا نت، FOUNDATION ٢١٧)،
  // ونسخة الجهاز نفسها ما تنعرض أرقاماً ولا مهامّ لليوم: صفوف الخادم تُخفى بهدوء وصفّ الجهاز يبقى.
  const workspace = session.status === 'ready' ? session.workspace : null;
  const divisions = workspace?.divisions ?? null;
  const wantsFarms = divisions !== null && (divisions.includes('broiler') || divisions.includes('layer'));
  const userId = workspace?.userId ?? null;
  const orgId = workspace?.orgId ?? null;
  const displayName = workspace?.displayName ?? '';
  const loadFarms = useCallback(async () => {
    if (!wantsFarms) return null;
    const state = await loadOverviewKept(userId && orgId ? { userId, orgId, displayName } : null);
    const live = state.savedAt === null;
    return { cards: live ? farmCards(state.overview) : null, tasks: live ? farmTasks(state.overview) : null, kinds: flockKinds(state.overview) };
  }, [wantsFarms, userId, orgId, displayName]);
  const farms = useLoad(loadFarms);

  const allows = (action: Parameters<typeof can>[1]) => !workspace || can(workspace.role, action);
  const saves = (division: DivisionKind) => allows('flock_day.save') && (!divisions || divisions.includes(division));
  const savesBroiler = saves('broiler');
  const savesLayer = saves('layer');
  const manage = allows('flock.manage');
  // جولات الجهاز اللي ما انرفعت (الطابور نفسه، ويشتغل بلا نت)، وتُقرأ من جديد بعد كل رفع من أيّ شاشة أو من القشرة.
  const queue = useStore(roundQueueStore);
  const wantsPending = (savesBroiler || savesLayer) && userId !== null && orgId !== null;
  const loadPending = useCallback(async () => {
    if (!wantsPending || !userId || !orgId) return null;
    const outbox = await import('../../lib/outbox');
    const ops = await outbox.pendingOps(await outbox.openOutbox(), { userId, orgId, displayName });
    return { n: ops.length, flockId: ops[0]?.flockId ?? null };
  }, [wantsPending, userId, orgId, displayName]);
  const pending = useLoad(loadPending, `${queue.seq}:${queue.mine}`);

  const kindOf = (flockId: string | null): FlockKind => {
    const known = flockId ? farms.data?.kinds[flockId] : undefined;
    return known ?? (divisions && !divisions.includes('broiler') ? 'layer' : 'broiler');
  };
  const rows = todayRows({
    rounds: { broiler: savesBroiler, layer: savesLayer },
    manage,
    farms: farms.data?.tasks ?? null,
    pending: pending.data ? { n: pending.data.n, kind: kindOf(pending.data.flockId) } : null,
  });
  const needFarms = wantsFarms && (savesBroiler || savesLayer || manage);
  const todayLoading = (needFarms && farms.loading) || (wantsPending && pending.loading);
  const farmsFailed = needFarms && farms.error !== null && !(farms.error instanceof NotConnectedError);

  const actions = homeActions(session.status === 'ready' ? session.workspace : null);
  const specs = cardSpecs(summary.data, farms.data?.cards ?? null).filter((spec) => {
    if (session.status !== 'ready') return true;
    const { divisions: scope, role, canSeeAccounts } = session.workspace;
    if (spec.key === 'accounts') return canSeeAccounts;
    // بطاقة «المخزن» تفتح التبويب الواحد بكل مخازن النطاق، فظهورها بظهور بنده بالشريط (الدور) لا بوحدة واحدة: أمين مخزن
    // الأدوية نطاقه بلا «العامّة»، ولو تبعت المفتاح (general) اختفت عنه بطاقته و«قريب الانتهاء» اللي يحتاجه.
    if (spec.to === '/inventory') return STORE_ROLES.has(role);
    return scope.includes(spec.key);
  });
  const numbersId = useId();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('home.title', 'الرئيسية')} />
      <TodayCard rows={rows} loading={todayLoading} failed={farmsFailed ? farms.error : null} onRetry={farms.retry} notConnected={notConnected} />
      <HomeActions actions={actions} />
      {notConnected ? (
        <Notice tone="info" title={describeError(summary.error).title}>
          {t('home.not_connected', 'هذا هيكل النظام: الوحدات والتصميم والتثبيت. تظهر علامة «—» مكان الأرقام حتى تُربط قاعدة البيانات.')}
        </Notice>
      ) : summary.error ? (
        <LoadFailed what={t('home.what', 'أرقام اليوم')} error={summary.error} onRetry={summary.retry} />
      ) : summary.data && Object.keys(summary.data).length === 0 && !wantsFarms ? (
        <Notice tone="info" title={t('home.coming.title', 'لا أرقام بعد')}>
          {t('home.coming', 'تظهر أرقام اليوم هنا حين تُبنى الوحدات في المراحل القادمة، وتبقى «—» مكانها حتى ذلك الحين.')}
        </Notice>
      ) : null}
      {specs.length > 0 ? (
        <section aria-labelledby={numbersId} className="flex flex-col gap-3">
          <h2 id={numbersId} className="font-semibold">
            {t('home.numbers.title', 'أرقام اليوم')}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            {specs.map((spec) => (
              <DivisionCard key={spec.key} spec={spec} />
            ))}
          </div>
        </section>
      ) : null}
      {/* آخر الصفحة: التثبيت مهمّ مرّة وحدة، وشغل اليوم كل يوم. */}
      <InstallCard />
    </div>
  );
}
