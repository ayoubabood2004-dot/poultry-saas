import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function BroilerPage() {
  return (
    <PlannedPage
      title={t('nav.broiler', 'حقول اللحم')}
      phase={3}
      items={[
        t('broiler.planned.halls', 'الحقول والقاعات والأفواج: فتح للتحضير، ثم تسكين من مفقسنا أو من مورّد، ونقل الطيور بين القاعات بمستند نقل.'),
        t('broiler.planned.round', 'الجولة اليومية لكل القاعات في شاشة واحدة (نافق، مستبعد، علف)، وتعمل دون إنترنت.'),
        t('broiler.planned.weigh', 'تذكرة الوزن في الحقل بالقبّان أو بميزان الأقفاص: وزن الفارغ ثم وزن الخابط بعد كل قاعة، وفاتورة BR عند المحاسب.'),
        t('broiler.planned.close', 'الصرف والإرجاع، والأوزان والعلاجات، والمؤشّرات، وإغلاق الفوج بتقرير ربحه.'),
      ]}
    />
  );
}
