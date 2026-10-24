import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function LayersPage() {
  return (
    <PlannedPage
      title={t('nav.layers', 'حقول البيض')}
      phase={4}
      items={[
        t('layers.planned.round', 'الجولة اليومية بخانة البيض (المجموع والمكسور، وخانة الدرجة الثانية للمشعور إن فُعّلت)، وتعمل دون إنترنت.'),
        t('layers.planned.store', 'مخزن بيض الحقل بالطبقات، ونسبة الإنتاج يومياً ومنحناها بعمر الفوج.'),
        t('layers.planned.invoices', 'فاتورة بيع بيض EG بالطبقة والكارتون (بأنواع كارتون تُعرَّف في الإعدادات)، وفاتورة الدجاج المستبعد SH بالرأس أو بالكيلو.'),
      ]}
    />
  );
}
