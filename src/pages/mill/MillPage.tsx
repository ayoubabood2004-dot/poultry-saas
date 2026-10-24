import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function MillPage() {
  return (
    <PlannedPage
      title={t('nav.mill', 'معمل العلف')}
      phase={2}
      items={[
        t('mill.planned.recipes', 'العلائق ونسخها: لكل طن بالكيلو أو اللتر، ومؤشّر لحظي «المجموع 995 من 1,000 كغم — ينقص 5».'),
        t('mill.planned.batch', 'دفعة إنتاج: المخطّط مع «الموجود الآن»، والفعلي من الميزان، ومعاينة السحب من الدفعات قبل الترحيل، وسبب مطلوب قبل الترحيل إذا تجاوز الهدر 3% أو كان سالباً.'),
        t('mill.planned.cost', 'سجلّ الدفعات، والهدر، وكلفة الطن لكل عليقة عبر الزمن (لأدوار الكلفة).'),
        t('mill.planned.invoice', 'فاتورة بيع علف FD بالكيس أو الطن.'),
      ]}
    />
  );
}
