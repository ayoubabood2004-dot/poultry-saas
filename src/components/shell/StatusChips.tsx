import { CloudOff, HardDrive, WifiOff, type LucideIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { updateStore } from '../../lib/pwa/update';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';

// الرأس يكول الحقيقة: «مو جاهز بلا نت بعد» لحد ما تكمل الخدمة العاملة، حتى العامل ما يطلع للقاعة
// ويكتشف هناك صفحة «ماكو اتصال». وبعد الدخول: رافع جولات الجهاز وعدّاداها (RoundQueue، حزمة كسولة برّا الإقلاع).

// فشل تحميل حزمتها (نشر جديد) ما يطفي القشرة: الرأس بلاها، والتعافي يمسكه بـvite:preloadError.
const RoundQueue = lazy(() =>
  import('./RoundQueue').catch(() => ({
    default: () => null, // swallow-ok: حزمة الرافع ما انحمّلت؛ الجولات باقية بالجهاز وشاشة الجولة ترفعها
  })),
);

export function Chip({ icon: Icon, label, detail, tone }: { icon: LucideIcon; label: string; detail: string; tone: 'info' | 'warning' }) {
  const toneClass =
    tone === 'warning'
      ? 'bg-warn-50 text-warn-800 dark:bg-warn-500/15 dark:text-warn-200'
      : 'bg-surface-2 text-ink-muted';
  // بموبايل ضيّق شارة المعلومة أيقونة بس (ونصّها للقارئ الصوتي)، حتى شارات التحذير تبين كاملة.
  const labelClass = tone === 'info' ? 'sr-only sm:not-sr-only sm:truncate' : 'truncate';
  return (
    <span title={detail} className={`inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${toneClass}`}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className={labelClass}>{label}</span>
      <span className="sr-only">{detail}</span>
    </span>
  );
}

export function StatusChips() {
  const online = useStore(onlineStore);
  const { offlineReady } = useStore(updateStore);
  const session = useSession();
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {session.status === 'not_configured' ? (
        <Chip
          icon={CloudOff}
          tone="info"
          label={t('status.no_db', 'دون قاعدة بيانات')}
          detail={t('status.no_db.detail', 'النظام غير مربوط بقاعدة البيانات بعد: الهيكل فقط، دون بيانات.')}
        />
      ) : null}
      {!online ? (
        <Chip icon={WifiOff} tone="warning" label={t('status.offline', 'غير متّصل')} detail={t('status.offline.detail', 'الجهاز غير متّصل بالإنترنت.')} />
      ) : null}
      {/* مستقلّ عن «بلا نت»: الجهاز اللي طلع للقاعة قبل ما يجهز لازم يعرف إنه ما ينفتح إذا انسدّ. */}
      {!offlineReady ? (
        <Chip
          icon={HardDrive}
          tone="warning"
          label={t('status.not_ready', 'غير جاهز دون اتصال')}
          detail={
            online
              ? t('status.not_ready.detail', 'غير جاهز للعمل دون اتصال بعد — أبقِ التطبيق مفتوحاً على الإنترنت قليلاً.')
              : t('status.not_ready.offline_detail', 'لا يُفتح التطبيق على هذا الجهاز دون اتصال بعد: لا تغلقه حتى يعود الاتصال.')
          }
        />
      ) : null}
      {session.status === 'ready' ? (
        <Suspense fallback={null}>
          <RoundQueue />
        </Suspense>
      ) : null}
    </div>
  );
}
