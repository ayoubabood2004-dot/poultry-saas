import { lazy, Suspense, useCallback, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import type { FlockKind } from '../../domain/flocks';
import { NetworkError, UnknownOutcomeError } from '../../lib/errors';
import { keepOverview, savedOverview } from '../../lib/farmCopy';
import { fmtScaledCell } from '../../lib/format';
import { loadHalls } from '../../lib/hallsChunk';
import { t } from '../../lib/i18n';
import type { Stamp } from '../../lib/outbox';
import { quietly } from '../../lib/pwa/recovery';
import { loadOverviewJson, parseOverview, type FlockDetail, type FlockSummary, type FlocksOverview } from '../../lib/repo/flocks';
import { roundQueueStore } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';

// مشترك شاشات الحقول (المرحلة 2، النسخة الأولى): المسار والعنوان لكل نوع، وختم الهويّة للطابور، ونسخة الجهاز من قراءة الحقول
// (FOUNDATION ٢١٧: الجولة تنفتح بلا نت من آخر قراءة ناجحة لكل مستخدم ومنشأة؛ التحديث يستبدلها ما يدمجها)، وبطاقة المؤشّر.

export const farmPath = (kind: FlockKind): string => (kind === 'broiler' ? '/broiler' : '/layers');
export const farmTitle = (kind: FlockKind): string => (kind === 'broiler' ? t('nav.broiler', 'حقول اللحم') : t('nav.layers', 'حقول البيض'));

/**
 * صفحة القاعة (كلمة المالك 2026-11-16: «طريقة الدخول الها واضحة ومو مبهمة»): المكان ثابت والفوج يتغيّر كلّ دورة، فالرابط بالقاعة
 * ويفتح فوجها القائم أو يقول إنّها فارغة.
 */
export const hallPath = (kind: FlockKind, hallId: string): string => `${farmPath(kind)}/hall/${hallId}`;

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-sm font-semibold';
const CHIP_TONES = {
  ok: 'bg-success-50 text-success-800 dark:bg-success-500/15 dark:text-success-100',
  warn: 'bg-warn-50 text-warn-800 dark:bg-warn-500/15 dark:text-warn-200',
  idle: 'bg-surface-2 text-ink-muted',
} as const;

/** حالة جولة اليوم لقاعة بكلمة مكتوبة (لا لون وحده): من قراءة الخادم (flock.today ليوم الخادم). */
export function TodayChip({ flock }: { flock: FlockSummary | null }) {
  const [tone, text] =
    flock === null
      ? (['idle', t('hall.state.empty', 'فارغة')] as const)
      : flock.status !== 'active'
        ? (['idle', t('hall.state.preparing', 'قيد التجهيز')] as const)
        : flock.today !== null
          ? (['ok', t('hall.state.done', 'سُجّلت')] as const)
          : (['warn', t('hall.state.missing', 'لم تُسجَّل')] as const);
  return (
    <span className={`${CHIP} ${CHIP_TONES[tone]}`} data-action="hall-today" data-state={tone}>
      {text}
    </span>
  );
}

/** اسم القاعة كما يُقرأ: «1» وحده رقم لا اسم، فيصير «قاعة 1»؛ و«قاعة 5» أو «الشرقية» كما هما. */
export const hallLabel = (name: string): string => (/^[0-9]+$/.test(name.trim()) ? t('hall.numbered', 'قاعة {n}', { n: name.trim() }) : name);

/** الهويّة المؤكّدة للطابور: المستخدم والمنشأة اللي أكّدها الخادم (أو المحفوظة للفتح بلا نت)، وإلا null. */
export function useStamp(): Stamp | null {
  const session = useSession();
  if (session.status !== 'ready') return null;
  const { userId, orgId, displayName } = session.workspace;
  return { userId, orgId, displayName };
}

/** نسبة بالمئات («85.20%»). */
export const fmtPct = (hundredths: bigint): string => `${fmtScaledCell(hundredths, 2, 2)}%`;

// ─── نسخة الجهاز من قراءة الحقول (lib/farmCopy) ───────────────────────────────────────────────────────────────────

export interface OverviewState {
  overview: FlocksOverview;
  /** null = من الخادم الآن؛ رقم = نسخة الجهاز من ذاك الوقت (بلا نت). */
  savedAt: number | null;
}

/**
 * قراءة الحقول: من الخادم وتنحفظ بالجهاز، وفشل الشبكة يرجع لنسخة الجهاز (مختومة بالمستخدم والمنشأة). الرفض والهويّة يطلعون كما
 * هم: نسخة الجهاز للانقطاع بس. شاشات الحقول والرئيسية تقرا منها، فكل قراءة ناجحة تحفظ النسخة (FOUNDATION ٢١٧).
 */
export async function loadOverviewKept(owner: Stamp | null): Promise<OverviewState> {
  try {
    const json = await loadOverviewJson();
    const overview = parseOverview(json);
    if (owner) {
      void keepOverview(owner, json, Date.now()).catch(() => {
        /* swallow-ok: نسخة الجهاز للفتح بلا نت؛ تعذّر حفظها ما يغيّر القراءة الحالية */
      });
    }
    return { overview, savedAt: null };
  } catch (error) {
    if (!owner || !(error instanceof NetworkError || error instanceof UnknownOutcomeError)) throw error;
    let saved: { json: unknown; at: number } | null;
    try {
      saved = await savedOverview(owner);
    } catch { // swallow-ok: نسخة الجهاز ما انقرت (IndexedDB ممنوع)، فيطلع خطأ الشبكة الأصلي بزرّ «أعد المحاولة»
      throw error;
    }
    if (!saved) throw error;
    return { overview: parseOverview(saved.json), savedAt: saved.at };
  }
}

/** قراءة الحقول لشاشة، ومن جديد بعد كل رفع جولات رجّع نتائج (من أيّ شاشة أو من الخلفية). */
export function useOverview(stamp: Stamp | null) {
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  const load = useCallback(() => loadOverviewKept(userId && orgId ? { userId, orgId, displayName } : null), [userId, orgId, displayName]);
  const uploads = useStore(roundQueueStore).seq;
  return useLoad(load, String(uploads));
}

// ─── تذكير اللقاحات (0026) في الجولة والرئيسية ───────────────────────────────────────────────────────────────────────

interface HallRemindersProps {
  kind?: FlockKind;
  compact?: boolean;
  onCount?: (rows: number) => void;
}

type Halls = Awaited<ReturnType<typeof loadHalls>>;

const nothing = () => null;

/**
 * مكوّن من حزمة القاعات (خارج التثبيت المسبق): بلا نت (أو أيّ فشل في تحميلها) لا شيء، والجولة والرئيسية وصفحة الفوج تعمل كما هي. استيراد واحد لكلّ
 * فتح للشاشة: فشله يبقى لعمرها ويُعاد في الفتح التالي (رجع الاتصال)؛ كان يُعاد بكلّ رسم للجولة (كلّ حرف) ودفعاتٍ بلا توقّف (مراجعة 0026 GR-1). وهو
 * اختياريّ (quietly): فشله لا يبدأ التعافي من القشرة القديمة. وخطأ الرسم داخله يمسكه حدّ صامت في حزمته (Reminders وFlockCard)، فهنا الاستيراد وحده
 * (حجم التثبيت المسبق).
 */
const hallsLazy =
  <P,>(pick: (halls: Halls) => ComponentType<P>, fallback: ComponentType<P> = nothing) =>
  () =>
    lazy<ComponentType<P>>(() => quietly(loadHalls).then((halls) => ({ default: pick(halls) }), () => ({ default: fallback })));
const remindersLazy = hallsLazy((halls) => halls.Reminders);
const cardLazy = hallsLazy((halls) => halls.FlockCard);

/** ما يحتاج الخادم في الجولة بلا اتصال (أو فشل تحميل حزمة القاعات): جملة تقول ذلك. */
export function NeedsConnection() {
  return (
    <p className="text-sm text-ink-muted" data-action="visits-offline">
      {t('visits.offline', 'زيارات اليوم تحتاج اتصالاً بالإنترنت.')}
    </p>
  );
}
const visitsLazy = hallsLazy((halls) => halls.HallVisits, NeedsConnection);

/** تذكير اللقاحات المستحقّة: شريط الجولة (kind)، وصفّ «شغل اليوم» في الرئيسية (compact، وonCount عدد صفوفه). */
export function HallReminders(props: HallRemindersProps) {
  const [Lazy] = useState(remindersLazy);
  return (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
}

/** البيع وإغلاق الدورة في صفحة الفوج (0028، بطاقة FlockCard من حزمة القاعات). */
export function HallFlockCard(props: { flock: FlockDetail['flock']; onChanged: () => void }) {
  const [Lazy] = useState(cardLazy);
  return (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
}

/** «زيارات اليوم» لقاعة في الجولة (0032، من حزمة القاعات): بلا نت أو فشل تحميلها «تحتاج اتصالاً». */
export function HallVisitsLazy(props: ComponentProps<Halls['HallVisits']>) {
  const [Lazy] = useState(visitsLazy);
  return (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
}

/** بطاقة مؤشّر: الرقم الصافي بـdir=ltr (الفواصل والإشارة بمكانها)، والجملة العربية ترث RTL. */
export function Metric({ label, value, text = false, hint }: { label: string; value: ReactNode | null; text?: boolean; hint?: ReactNode }) {
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <dt className="truncate text-xs text-ink-muted">{label}</dt>
      {text ? (
        <dd className="text-start text-lg font-semibold tabular-nums">{value ?? '—'}</dd>
      ) : (
        <dd dir="ltr" className="text-end text-lg font-semibold tabular-nums">
          {value ?? '—'}
        </dd>
      )}
      {hint ? <dd className="text-xs text-ink-muted">{hint}</dd> : null}
    </div>
  );
}
