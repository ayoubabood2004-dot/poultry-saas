import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function MedicinePage() {
  return (
    <PlannedPage
      title={t('nav.medicine', 'مخزن الأدوية')}
      phase={1}
      items={[
        t('medicine.planned.in', 'الواردات من المورّدين، كل دفعة بتاريخ انتهائها.'),
        t('medicine.planned.out', 'الصادر إلى الحقول والمفقس (لفوج أو لوجبة مباشرةً) بالكلفة.'),
        t('medicine.planned.expiry', 'قريب الانتهاء بترتيب FEFO، والمنتهي في عمود منفصل: بيعه أو صرفه بتحذير وموافقة المدير، وإتلافه بموافقته.'),
        t('medicine.planned.invoice', 'فاتورة بيع أدوية MD (المرحلة 2).'),
      ]}
    />
  );
}
