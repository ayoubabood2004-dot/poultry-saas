import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import AccountsPage from './AccountsPage';
import CashPage from './CashPage';
import CashStatementPage from './CashStatementPage';
import OpeningBalancesPage from './OpeningBalancesPage';
import PartyStatementPage from './PartyStatementPage';
import './print.css';

// شاشات الحسابات والصناديق (المرحلة 1 WP3) تحت /accounts بحزمة كسولة وحدة، ومساراتها هنا: مسار واحد بالقشرة بدل خمسة،
// فحزمة الإقلاع ومسار الجلسة الحرج ما يكبرون بكل شاشة مكتب (السقفان المقيسان، DECISIONS «السقوف المقيسة»). كلها تحتاج الخادم،
// فهي برّا التثبيت المسبق بالاسم (AccountsRoutes وaccounts-office)، وتنطبع بـprint.css.

export default function AccountsRoutes() {
  return (
    <Routes>
      <Route index element={<AccountsPage />} />
      <Route path="parties/:id" element={<PartyStatementPage />} />
      <Route path="openings" element={<OpeningBalancesPage />} />
      <Route path="cash" element={<CashPage />} />
      <Route path="cash/:id" element={<CashStatementPage />} />
      <Route path="*" element={<Notice tone="info" title={t('accounts.not_found', 'هذه الصفحة غير موجودة في الحسابات.')} />} />
    </Routes>
  );
}
