import { Route, Routes, useParams } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import SaleDocPage from '../sales/SaleDocPage';
import SalesPage from '../sales/SalesPage';
import { CountDocPage, CountsList } from './CountsPage';
import FlockIssuePage from './FlockIssuePage';
import ItemCardPage from './ItemCardPage';
import ItemFilePage from './ItemFilePage';
import ItemsBoardPage from './ItemsBoardPage';
import { OpeningDoc, OpeningsList } from './OpeningsPage';
import { ReceiptDocPage, ReceiptsList } from './ReceiptsPage';
import StockBoardPage from './StockBoardPage';
import StoresCardsPage from './StoresCardsPage';
import { SupplierReturnDocPage } from './SupplierReturnPage';
import { TransferDoc, TransfersList } from './TransfersPage';
import { UseDocPage, UsesList } from './UsesPage';
import WarehousePage from './WarehousePage';

// شاشات المخزون (المرحلة 1 WP4) تحت /inventory بحزمة كسولة وحدة، ومساراتها هنا (نفس طريقة AccountsRoutes بـWP3):
// بطاقات المخازن بالصفحة الأولى وداخل المخزن أقسامه بالتصنيف (تجربة الاستخدام 2026-11-02، spec ب-1 وب-2)، واللوحة
// بالوحدة لمخزن الأدوية وللمخازن العامة ولمخازن المعمل والمفقس (من صفحتي وحدتيهما، لمشغّليهما هم)، وبطاقة المادّة
// (المشتريات والوجبات والحركات)، ومستندات الافتتاح والتحويل، والصرف والإتلاف والجرد (WP5)، والاستلام من المورّدين
// (WP6) ومرتجعه (WP7). كلها تحتاج الخادم، فهي برّا التثبيت المسبق بالاسم (StockRoutes، DECISIONS «السقوف المقيسة»).
// صفحة المواد (/inventory/items) مسارها الثابت بالقشرة يغلب هذا المسار.
// «المخزن ببساطة» (كلمة المالك 2026-11-06): الصفحة الأولى بطاقات المواد (ItemsBoardPage)، والمادّة تفتح ملفّها (ItemFilePage:
// أرقامها و«سجّل شراء» وجدول مشترياتها)؛ وبطاقات المخازن انتقلت إلى /inventory/stores، وبطاقة المادّة القديمة (الوجبات ودفتر
// الحركات بالمخازن) إلى /inventory/items/:id/details. صفحة الاستلام باقية بمسارها للمدير (سجلّ وإلغاء)، بلا رابط من الطريق اليومي.
// والصرف لفوج القاعة (0019، /inventory/issue/:flockId): يُرحَّل فوراً بالخادم، فهنا لا في حزمة الحقول المحفوظة؛ وشاشة الفوج وجدول الحقل يدلّان عليه.

/** الصرف لفوج القاعة (0019) بمفتاح الفوج: الانتقال إلى فوج آخر يركّب الصفحة من جديد، فلا تبقى فيها نافذة الفوج السابق ومعرّفاته. */
function FlockIssueById() {
  const { flockId = '' } = useParams();
  return <FlockIssuePage key={flockId} />;
}

/**
 * المبيعات تحت /sales (كلمة المالك 2026-11-08: «ماكو زر يوديني للمبيعات… واكدر اسجل مبيعاتي لمنو وتطلعلي بالتقارير»): في هذه الحزمة نفسها
 * (القشرة تستوردها من هنا)، فتبقى خارج التثبيت المسبق مع المخزون: البيع يسحب من الوجبات ويُحفظ بالخادم فوراً. وفاتورة البيع للقراءة
 * (/sales/:id، عقد 0024 F8) يفتحها كشف الجهة وحركة الأموال.
 */
export function SalesRoutes() {
  return (
    <Routes>
      <Route index element={<SalesPage />} />
      <Route path=":id" element={<SaleDocPage />} />
      <Route path="*" element={<Notice tone="info" title={t('sales.not_found', 'هذه الصفحة غير موجودة في المبيعات.')} />} />
    </Routes>
  );
}

export default function StockRoutes() {
  return (
    <Routes>
      <Route index element={<ItemsBoardPage />} />
      <Route path="stores" element={<StoresCardsPage />} />
      <Route path="store/:id" element={<WarehousePage />} />
      <Route path="medicine" element={<StockBoardPage division="medicine" />} />
      <Route path="general" element={<StockBoardPage division="general" />} />
      <Route path="mill" element={<StockBoardPage division="feed_mill" />} />
      <Route path="hatchery" element={<StockBoardPage division="hatchery" />} />
      <Route path="items/:id" element={<ItemFilePage />} />
      <Route path="items/:id/details" element={<ItemCardPage />} />
      <Route path="openings" element={<OpeningsList />} />
      <Route path="openings/:id" element={<OpeningDoc />} />
      <Route path="transfers" element={<TransfersList />} />
      <Route path="transfers/:id" element={<TransferDoc />} />
      <Route path="uses" element={<UsesList />} />
      <Route path="uses/:id" element={<UseDocPage />} />
      <Route path="counts" element={<CountsList />} />
      <Route path="counts/:id" element={<CountDocPage />} />
      <Route path="receipts" element={<ReceiptsList />} />
      <Route path="receipts/:id" element={<ReceiptDocPage />} />
      <Route path="supplier-returns/:id" element={<SupplierReturnDocPage />} />
      <Route path="issue/:flockId" element={<FlockIssueById />} />
      <Route path="*" element={<Notice tone="info" title={t('stock.not_found', 'هذه الصفحة غير موجودة في المخزون.')} />} />
    </Routes>
  );
}
