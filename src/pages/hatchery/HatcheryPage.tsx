import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function HatcheryPage() {
  return (
    <PlannedPage
      title={t('nav.hatchery', 'المفقس')}
      phase={5}
      items={[
        t('hatchery.planned.board', 'لوحة الوجبات: تاريخ الإدخال والإخراج المتوقّع والفعلي و«يوم 14 من 21»، والفحص الضوئي. بيض التفقيس بالشراء أو من أفواج الأمّهات.'),
        t('hatchery.planned.out', 'الإخراج: المفقوس والمستبعد، والصالح لكل نوع فرخ، والنسب تُحسب لحظياً، ثم المعاينة والترحيل.'),
        t('hatchery.planned.chicks', 'مخزن الأفراخ بعمرها بالساعات وتنبيه بعد 48 ساعة، وزرّ «تسكين فوج».'),
        t('hatchery.planned.invoices', 'فاتورة بيع أفراخ CH، وفاتورة بيع بيض تفقيس HE (ومنه بيض الفحص الضوئي).'),
      ]}
    />
  );
}
