import { useCallback, type ReactNode } from 'react';
import type { FlockKind } from '../../domain/flocks';
import { NetworkError, UnknownOutcomeError } from '../../lib/errors';
import { keepOverview, savedOverview } from '../../lib/farmCopy';
import { fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { Stamp } from '../../lib/outbox';
import { loadOverviewJson, parseOverview, type FlocksOverview } from '../../lib/repo/flocks';
import { roundQueueStore } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';

// مشترك شاشات الحقول (المرحلة 2، النسخة الأولى): المسار والعنوان لكل نوع، وختم الهويّة للطابور، ونسخة الجهاز من قراءة الحقول
// (FOUNDATION ٢١٧: الجولة تنفتح بلا نت من آخر قراءة ناجحة لكل مستخدم ومنشأة؛ التحديث يستبدلها ما يدمجها)، وبطاقة المؤشّر.

export const farmPath = (kind: FlockKind): string => (kind === 'broiler' ? '/broiler' : '/layers');
export const farmTitle = (kind: FlockKind): string => (kind === 'broiler' ? t('nav.broiler', 'حقول اللحم') : t('nav.layers', 'حقول البيض'));

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
