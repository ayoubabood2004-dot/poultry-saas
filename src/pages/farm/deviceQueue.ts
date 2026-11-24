import { useCallback, useEffect, useState } from 'react';
import { openOutbox, pendingOps, reviewEntries, type OutboxOp, type ReviewEntry, type Stamp } from '../../lib/outbox';

/**
 * عمليات الجهاز ورفّ المراجعة للداخل، ومن جديد بعد كل رفع (uploads): الجولة تعرضها فوق المحفوظ، وجدول الحقل يعدّ بها «جولة اليوم» (هلاكات على هذا
 * الجهاز لم تُرفع، مراجعة 0036 R6).
 */
export function useQueue(stamp: Stamp | null, uploads: number) {
  const [state, setState] = useState<{ key: string; pending: OutboxOp[]; review: ReviewEntry[] } | null>(null);
  const [version, setVersion] = useState(0);
  const key = stamp ? `${stamp.userId}:${stamp.orgId}` : '';
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  useEffect(() => {
    if (!userId || !orgId) return;
    let cancelled = false;
    const owner = { userId, orgId, displayName };
    openOutbox()
      .then(async (db) => ({ pending: await pendingOps(db, owner), review: await reviewEntries(db, owner) }))
      .then(
        ({ pending, review }) => {
          if (!cancelled) setState({ key: `${userId}:${orgId}`, pending, review });
        },
        () => {
          /* swallow-ok: الطابور ما انقرا (IndexedDB ممنوع)؛ الجولة تعرض قيم الخادم والحفظ نفسه يبلّغ بفشله */
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, displayName, version, uploads]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  const current = state?.key === key ? state : null;
  return { pending: current?.pending ?? [], review: current?.review ?? [], loaded: current !== null, reload };
}
