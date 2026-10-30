import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function SalesPage() {
  return (
    <PlannedPage
      title={t('nav.sales', 'فواتير البيع')}
      phase={2}
      items={[
        t('sales.planned.kinds', 'شاشة واحدة بسبعة أنواع: علف FD، دجاج لحم BR، مستبعد SH، بيض مائدة EG، أفراخ CH، بيض تفقيس HE، أدوية MD.'),
        t('sales.planned.rules', 'يحدّد النوع المخزن والمواد ووحدات البيع والحساب والترقيم، ويُحفظ السعر المقترح.'),
        t('sales.planned.print', 'المرتجع والإلغاء، وطباعة A4 وحرارية.'),
      ]}
    />
  );
}
