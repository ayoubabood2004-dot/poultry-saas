import { Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function MillPage() {
  return (
    <PlannedPage
      title={t('nav.mill', 'معمل العلف')}
      phase={2}
      items={[
        t('mill.planned.recipes', 'العلائق ونسخها: لكل طن بالكيلو أو اللتر، ومؤشّر لحظي «المجموع 995 من 1,000 كغم — ينقص 5».'),
        t('mill.planned.batch', 'وجبة إنتاج: المخطّط مع «الموجود الآن»، والفعلي من الميزان، ومراجعة السحب من الوجبات قبل الحفظ النهائي، وسبب مطلوب قبل الحفظ إذا تجاوز الهدر 3% أو كان سالباً.'),
        t('mill.planned.cost', 'سجلّ الوجبات، والهدر، وكلفة الطن لكل عليقة عبر الزمن (لأدوار الكلفة).'),
        t('mill.planned.invoice', 'فاتورة بيع علف FD بالكيس أو الطن.'),
      ]}
    >
      {/* مخازن الوحدة من صفحتها (الخطّة WP4)، لمشغّلها هم: «كل المخازن» بالشريط لأدوار المخزن بس. */}
      <Link to="/inventory/mill" className="card flex items-center gap-2 p-4 font-medium text-brand-700 hover:bg-surface-2 dark:text-brand-200" data-action="open-division-stores">
        <Warehouse aria-hidden="true" className="size-5" />
        {t('mill.stores', 'مخازن المعمل: المواد الأوّلية والعلف')}
      </Link>
    </PlannedPage>
  );
}
