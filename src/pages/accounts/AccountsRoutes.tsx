import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import AccountsPage from './AccountsPage';
import CashPage from './CashPage';
import CashStatementPage from './CashStatementPage';
import DebtsPage from './debts/DebtsPage';
import ExpensesPage from './ExpensesPage';
import OpeningBalancesPage from './OpeningBalancesPage';
import PartyStatementPage from './PartyStatementPage';
import TransferVoucherPage from './vouchers/TransferVoucherPage';
import VoucherPage from './vouchers/VoucherPage';
import './papers.css';
import './print.css';

// شاشات الحسابات والصناديق (المرحلة 1 WP3) تحت /accounts بحزمة كسولة وحدة، ومساراتها هنا: مسار واحد بالقشرة بدل خمسة،
// فحزمة الإقلاع ومسار الجلسة الحرج ما يكبرون بكل شاشة مكتب (السقفان المقيسان، DECISIONS «السقوف المقيسة»). كلها تحتاج الخادم،
// فهي برّا التثبيت المسبق بالاسم (AccountsRoutes وaccounts-office)، وتنطبع بـprint.css.
// «المال بين يديك» (0024، الوكيل ب): قائمة الذمم، والكشف الاحترافي (المسار نفسه)، وسندا القبض والصرف وسند التحويل.

export default function AccountsRoutes() {
  return (
    <Routes>
      <Route index element={<AccountsPage />} />
      <Route path="parties/:id" element={<PartyStatementPage />} />
      <Route path="debts" element={<DebtsPage />} />
      <Route path="voucher/:id" element={<VoucherPage />} />
      <Route path="transfer/:id" element={<TransferVoucherPage />} />
      <Route path="openings" element={<OpeningBalancesPage />} />
      <Route path="cash" element={<CashPage />} />
      <Route path="cash/:id" element={<CashStatementPage />} />
      <Route path="expenses" element={<ExpensesPage />} />
      <Route path="*" element={<Notice tone="info" title={t('accounts.not_found', 'هذه الصفحة غير موجودة في الحسابات.')} />} />
    </Routes>
  );
}
