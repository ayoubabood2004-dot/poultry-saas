import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function ReportsPage() {
  return (
    <PlannedPage
      title={t('nav.reports', 'التقارير')}
      phase={6}
      items={[
        t('reports.planned.stock', 'قيمة المخزون بتاريخ لكل وحدة، والصادر والوارد الداخلي بالكمية والقيمة.'),
        t('reports.planned.profit', 'كلفة العلائق، ربح الأفواج والحقول، كلفة الفرخ ونسب الفقس لكل وجبة.'),
        t('reports.planned.debts', 'المبيعات والربح لكل وحدة، والديون وأعمارها لكل دفتر. كل تقرير بمدّة إلزامية وبجدول كلاسيكي بصفّ مجاميع.'),
      ]}
    />
  );
}
