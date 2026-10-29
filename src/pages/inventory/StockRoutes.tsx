import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import ItemCardPage from './ItemCardPage';
import { OpeningDoc, OpeningsList } from './OpeningsPage';
import StockBoardPage from './StockBoardPage';
import { TransferDoc, TransfersList } from './TransfersPage';

// شاشات المخزون (المرحلة 1 WP4) تحت /inventory بحزمة كسولة وحدة، ومساراتها هنا (نفس طريقة AccountsRoutes بـWP3): اللوحة لكل
// المخازن ولمخزن الأدوية وللمخازن العامة ولمخازن المعمل والمفقس (من صفحتي وحدتيهما، لمشغّليهما هم)، وبطاقة المادّة، ومستندات
// الافتتاح والتحويل. كلها تحتاج الخادم، فهي برّا التثبيت المسبق
// بالاسم (StockRoutes، DECISIONS «السقوف المقيسة»). صفحة المواد (/inventory/items) مسارها الثابت بالقشرة يغلب هذا المسار.

export default function StockRoutes() {
  return (
    <Routes>
      <Route index element={<StockBoardPage />} />
      <Route path="medicine" element={<StockBoardPage division="medicine" />} />
      <Route path="general" element={<StockBoardPage division="general" />} />
      <Route path="mill" element={<StockBoardPage division="feed_mill" />} />
      <Route path="hatchery" element={<StockBoardPage division="hatchery" />} />
      <Route path="items/:id" element={<ItemCardPage />} />
      <Route path="openings" element={<OpeningsList />} />
      <Route path="openings/:id" element={<OpeningDoc />} />
      <Route path="transfers" element={<TransfersList />} />
      <Route path="transfers/:id" element={<TransferDoc />} />
      <Route path="*" element={<Notice tone="info" title={t('stock.not_found', 'هذه الصفحة غير موجودة في المخزون.')} />} />
    </Routes>
  );
}
