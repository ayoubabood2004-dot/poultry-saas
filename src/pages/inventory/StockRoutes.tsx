import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import { CountDocPage, CountsList } from './CountsPage';
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
      <Route path="*" element={<Notice tone="info" title={t('stock.not_found', 'هذه الصفحة غير موجودة في المخزون.')} />} />
    </Routes>
  );
}
