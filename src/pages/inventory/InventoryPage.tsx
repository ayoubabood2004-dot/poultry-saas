import { PlannedPage } from '../../components/PlannedPage';
import { t } from '../../lib/i18n';

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
    />
  );
}
