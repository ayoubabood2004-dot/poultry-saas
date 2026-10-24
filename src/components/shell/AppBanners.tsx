import { RefreshCw } from 'lucide-react';
import { t } from '../../lib/i18n';
import { recoveryStore } from '../../lib/pwa/recovery';
import { updateStore } from '../../lib/pwa/update';
import { useStore } from '../../lib/store';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';

/** أشرطة التحديث والتعافي فوك كل صفحة. الحفظ يبقى شغّال، والتطبيق يتحدّث لحاله بعد الحفظ. */
export function AppBanners() {
  const update = useStore(updateStore);
  const recovery = useStore(recoveryStore);

  if (recovery === 'looped') {
    return (
      <Notice
        tone="danger"
        title={t('banner.looped.title', 'تعذّر تحميل النسخة الجديدة')}
        action={
          <Button variant="secondary" size="sm" icon={<RefreshCw aria-hidden="true" className="size-4" />} onClick={() => window.location.reload()}>
            {t('banner.looped.reload', 'أعد التحميل')}
          </Button>
        }
      >
        {t('banner.looped.detail', 'أغلق التطبيق وافتحه من جديد. لم تُمَسّ جولاتك ولا ما حُفظ على الجهاز.')}
      </Notice>
    );
  }
  if (update.reloadAfterSave || recovery === 'pending_save') {
    return (
      <Notice tone="warning" title={t('banner.loaded_new.title', 'حُمّلت نسخة جديدة — احفظ عملك ثم نكمل')}>
        {t('banner.loaded_new.detail', 'الحفظ يعمل. بعد الحفظ تُحدَّث الشاشة تلقائياً.')}
      </Notice>
    );
  }
  if (update.waitingBlocked) {
    return (
      <Notice tone="info" title={t('banner.waiting.title', 'نسخة جديدة — تُطبَّق بعد الحفظ')}>
        {t('banner.waiting.detail', 'يوجد نموذج لم يُحفظ في إحدى نوافذ التطبيق. احفظه وسيُطبَّق التحديث تلقائياً.')}
      </Notice>
    );
  }
  return null;
}
