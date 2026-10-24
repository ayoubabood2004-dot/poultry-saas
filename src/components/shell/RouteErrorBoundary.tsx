import { RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { t } from '../../lib/i18n';
import { recoveryStore } from '../../lib/pwa/recovery';
import { useStore } from '../../lib/store';
import { Button } from '../ui/Button';
import { LoadFailed } from '../ui/LoadFailed';
import { Notice } from '../ui/Notice';

// React.lazy يحفظ رفض الاستيراد ويرميه بكل رسم بلا ما يعيد التحميل، فالرجوع للصفحة نفسها ما يجرّب
// من جديد: إعادة تحميل النافذة هي المحاولة، وكل حالة فشل بيها زرّها.

function ReloadButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<RefreshCw aria-hidden="true" className="size-4" />}
      onClick={() => window.location.reload()}
      data-action="reload"
    >
      {t('page.reload', 'أعد فتح الصفحة')}
    </Button>
  );
}

export function PageFailed({ error }: { error: unknown }) {
  const recovery = useStore(recoveryStore);
  if (recovery === 'recovering') {
    return <Notice tone="info" title={t('page.recovering', 'جارٍ تحميل النسخة الجديدة…')} />;
  }
  if (recovery === 'checking') {
    return (
      <Notice tone="info" title={t('page.checking', 'جارٍ التحقّق من الاتصال قبل تحميل النسخة الجديدة…')} action={<ReloadButton />}>
        {t('page.checking.detail', 'ما حُفظ على الجهاز لن يُمَسّ.')}
      </Notice>
    );
  }
  if (recovery === 'offline') {
    return (
      <Notice tone="warning" title={t('page.offline.title', 'تعذّر فتح الصفحة دون إنترنت')} action={<ReloadButton />}>
        {t('page.offline.retry', 'عند عودة الاتصال اضغط «أعد فتح الصفحة». ما حُفظ على الجهاز لم يُمَسّ.')}
      </Notice>
    );
  }
  return <LoadFailed what={t('page.what', 'الصفحة')} error={error} onRetry={() => window.location.reload()} />;
}

/** فشل صفحة ما يطيّح الشريط والرأس. ينعاد ضبطه بكل تنقّل (المفتاح من المسار). */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: unknown; failed: boolean }> {
  override state = { error: null as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  override render() {
    if (this.state.failed) return <PageFailed error={this.state.error} />;
    return this.props.children;
  }
}
