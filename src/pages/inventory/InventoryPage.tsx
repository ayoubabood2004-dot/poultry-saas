import { Boxes, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

// المرحلة 1 (WP2): المواد وإعدادات المخازن جاهزة، ولوحة المخزون وبطاقة المادّة والمستندات تجي بحزمها.
export default function InventoryPage() {
  return (
    <PlannedPage
      title={t('nav.inventory', 'كل المخازن')}
      phase={1}
      items={[
        t('inventory.planned.board', 'لوحة المخزون لكل مخزن: الرصيد بوحدته، والقيمة للأدوار المسموحة، وتنبيه الحدّ الأدنى والانتهاء.'),
        t('inventory.planned.item', 'بطاقة المادّة: دفعاتها المتبقّية بأعمارها وكلفها، وكل حركاتها.'),
        t('inventory.planned.docs', 'الاستلام من المورّد بمصاريف نقل موزّعة لحظياً، والتحويل بين الوحدات، والجرد بالهاتف. أحجام الأكياس والكراتين تُعرَّف في الإعدادات.'),
      ]}
    >
      <nav className="flex flex-wrap gap-2" aria-label={t('inventory.ready', 'الجاهز الآن')}>
        <Link to="/inventory/items" className="card flex items-center gap-2 px-4 py-3 font-medium hover:bg-surface-2" data-action="open-items">
          <Boxes aria-hidden="true" className="size-5" />
          {t('items.title', 'المواد')}
        </Link>
        <Link to="/settings/org" className="card flex items-center gap-2 px-4 py-3 font-medium hover:bg-surface-2" data-action="open-org-settings">
          <Building2 aria-hidden="true" className="size-5" />
          {t('org.title', 'إعدادات المنشأة')}
        </Link>
      </nav>
    </PlannedPage>
  );
}
