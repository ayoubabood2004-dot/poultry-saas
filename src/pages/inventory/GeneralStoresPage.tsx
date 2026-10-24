import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function GeneralStoresPage() {
  return (
    <PlannedPage
      title={t('nav.general', 'المخازن العامة')}
      phase={1}
      items={[
        t('general.planned.fuel', 'الكاز والكاز أويل باللتر، والغاز بالقنينة (تبديل دون تأمين، والفارغة بالعدد)، ومواد أخرى: استلام من المورّدين.'),
        t('general.planned.issue', 'صرف لفوج (تدفئة) أو لوجبة تفقيس أو لمصروف عام بتصنيف، والغاز الواصل مباشرةً إلى الحقل استلام وصرف بمستند واحد.'),
        t('general.planned.transfer', 'تحويل إلى مخزن مواد المعمل قبل أن تسحبه دفعة إنتاج، وإتلاف المنتهي بموافقة المدير.'),
      ]}
    />
  );
}
