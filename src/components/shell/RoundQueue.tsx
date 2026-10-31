import { CheckCheck, CloudUpload, HardDrive, Users } from 'lucide-react';
import { useEffect } from 'react';
import { can } from '../../domain/permissions';
import { hasOverviewCopy } from '../../lib/farmCopy';
import { fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { updateStore } from '../../lib/pwa/update';
import { refreshRoundQueue, roundQueueStore, stampKey, uploadRounds } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { Chip } from './StatusChips';

// الرافع على مستوى التطبيق وعدّادا الرأس (FOUNDATION ٢١٧–٢١٩)، بحزمة كسولة تنحمّل بعد الدخول (برّا الإقلاع ومسار الجلسة):
// جولات الجهاز ترتفع عند الدخول ولمّا يرجع الاتصال ولمّا يرجع التبويب، من أيّ شاشة، مو بشاشة الجولة بس؛ والرأس يقول «جولاتك
// المنتظرة: ٣» و«جولات لغيرك على هذا الجهاز» و«كل الجولات مُرسلة»؛ وعامل القاعة «غير جاهز دون اتصال» لحد ما تنحفظ أرقام حقوله
// بالجهاز (الجولة تنفتح منها بلا نت).

const loadTransport = () => import('../../lib/repo/flocks').then((module) => module.flockDayTransport);

export default function RoundQueue() {
  const session = useSession();
  const online = useStore(onlineStore);
  const { offlineReady } = useStore(updateStore);
  const queue = useStore(roundQueueStore);
  const workspace = session.status === 'ready' ? session.workspace : null;
  const userId = workspace?.userId ?? null;
  const orgId = workspace?.orgId ?? null;
  const displayName = workspace?.displayName ?? '';
  // عامل القاعة ومن يحفظ يوم الفوج بنطاقه حقل لحم أو بيض: جولته تحتاج نسخة الحقول بالجهاز.
  const rounds = Boolean(workspace && can(workspace.role, 'flock_day.save') && (workspace.divisions.includes('broiler') || workspace.divisions.includes('layer')));

  useEffect(() => {
    if (!userId || !orgId) return;
    const stamp = { userId, orgId, displayName };
    const go = () => {
      (onlineStore.get() ? uploadRounds(stamp, loadTransport) : refreshRoundQueue(stamp)).catch(() => {
        /* swallow-ok: الرفع أو العدّ فشل (شبكة أو IndexedDB)؛ الجولات باقية بالجهاز وترتفع بالمحاولة الجاية */
      });
    };
    go();
    const onVisible = () => {
      if (document.visibilityState === 'visible') go();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, orgId, displayName, online]);

  useEffect(() => {
    if (!userId || !orgId || !rounds) return;
    hasOverviewCopy({ userId, orgId, displayName }).catch(() => {
      /* swallow-ok: نسخة الجهاز ما انقرت (IndexedDB ممنوع)؛ الرأس يبقى «غير جاهز دون اتصال» وهذا صحيح */
    });
  }, [userId, orgId, displayName, rounds]);

  if (!userId || !orgId) return null;
  const key = stampKey({ userId, orgId });
  const counted = queue.key === key;
  const mine = counted ? queue.mine : 0;
  const others = counted ? queue.others : [];
  const othersCount = others.reduce((sum, entry) => sum + entry.count, 0);
  const missingCopy = rounds && offlineReady && !queue.copies.includes(key);
  return (
    <>
      {missingCopy ? (
        <Chip icon={HardDrive} tone="warning" label={t('status.not_ready', 'غير جاهز دون اتصال')} detail={t('status.not_ready.copy', 'لم تُحفظ أرقام حقولك على هذا الجهاز بعد: افتح الرئيسية أو الجولة على الإنترنت مرّة، ثم تنفتح الجولة دون اتصال.')} />
      ) : null}
      {mine > 0 ? (
        <Chip
          icon={CloudUpload}
          tone={!online || queue.held ? 'warning' : 'info'}
          label={t('status.rounds.mine', 'جولاتك المنتظرة: {n}', { n: fmtInt(mine) })}
          detail={
            queue.held === 'identity'
              ? t('status.rounds.held_identity', 'جولاتك على هذا الجهاز تنتظر: ادخل من جديد لتُرسل.')
              : queue.held === 'subscription'
                ? t('status.rounds.held_subscription', 'الاشتراك منتهٍ: الجولات محفوظة على هذا الجهاز وتُرسل بعد التجديد.')
                : online
                  ? t('status.rounds.mine.online', 'جولات لك على هذا الجهاز تُرسل الآن: {n}.', { n: fmtInt(mine) })
                  : t('status.rounds.mine.offline', 'بلا اتصال: جولات لك على هذا الجهاز تنتظر الإرسال: {n}. تُرسل حين يعود الاتصال.', { n: fmtInt(mine) })
          }
        />
      ) : null}
      {othersCount > 0 ? (
        <Chip
          icon={Users}
          tone="info"
          label={t('status.rounds.others', 'جولات لغيرك: {n}', { n: fmtInt(othersCount) })}
          detail={t('status.rounds.others.detail', 'جولات على هذا الجهاز تنتظر دخول أصحابها: {list}.', {
            list: others.map((entry) => t('status.rounds.others.item', '{name} ({n})', { name: entry.displayName, n: fmtInt(entry.count) })).join(t('list.separator', '، ')),
          })}
        />
      ) : null}
      {rounds && counted && mine === 0 && othersCount === 0 ? (
        <Chip icon={CheckCheck} tone="info" label={t('status.rounds.sent', 'كل الجولات مُرسلة')} detail={t('status.rounds.sent.detail', 'لا جولات على هذا الجهاز تنتظر الإرسال.')} />
      ) : null}
    </>
  );
}
