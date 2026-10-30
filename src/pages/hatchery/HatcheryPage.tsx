import { Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

export default function HatcheryPage() {
  return (
    <PlannedPage
      title={t('nav.hatchery', 'المفقس')}
      phase={5}
      items={[
        t('hatchery.planned.board', 'لوحة الوجبات: تاريخ الإدخال والإخراج المتوقّع والفعلي و«يوم 14 من 21»، والفحص الضوئي. بيض التفقيس بالشراء أو من أفواج الأمّهات.'),
        t('hatchery.planned.out', 'الإخراج: المفقوس والمستبعد، والصالح لكل نوع فرخ، والنسب تُحسب لحظياً، ثم المراجعة والحفظ النهائي.'),
        t('hatchery.planned.chicks', 'مخزن الأفراخ بعمرها بالساعات وتنبيه بعد 48 ساعة، وزرّ «تسكين فوج».'),
        t('hatchery.planned.invoices', 'فاتورة بيع أفراخ CH، وفاتورة بيع بيض تفقيس HE (ومنه بيض الفحص الضوئي).'),
      ]}
    >
      {/* مخازن الوحدة من صفحتها (الخطّة WP4)، لمشغّلها هم: «كل المخازن» بالشريط لأدوار المخزن بس. */}
      <Link to="/inventory/hatchery" className="card flex items-center gap-2 p-4 font-medium text-brand-700 hover:bg-surface-2 dark:text-brand-200" data-action="open-division-stores">
        <Warehouse aria-hidden="true" className="size-5" />
        {t('hatchery.stores', 'مخازن المفقس: بيض التفقيس والأفراخ وتنبيه 48 ساعة')}
      </Link>
    </PlannedPage>
  );
}
