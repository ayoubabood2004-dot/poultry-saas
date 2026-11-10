import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import AccountsPage from './AccountsPage';
import CashPage from './CashPage';
import CashStatementPage from './CashStatementPage';
import DebtsPage from './debts/DebtsPage';
import ExpensesPage from './ExpensesPage';
import CashDayPage from './money/CashDayPage';
import MoneyHubPage from './money/MoneyHubPage';
import MoneyMovesPage from './money/MoneyMovesPage';
import MonthSummaryPage from './money/MonthSummaryPage';
import OpeningBalancesPage from './OpeningBalancesPage';
import PartyStatementPage from './PartyStatementPage';
import TransferVoucherPage from './vouchers/TransferVoucherPage';
import VoucherPage from './vouchers/VoucherPage';
import './papers.css';
import './print.css';

// شاشات الحسابات والصناديق (المرحلة 1 WP3) تحت /accounts بحزمة كسولة وحدة، ومساراتها هنا: مسار واحد بالقشرة بدل خمسة،
// فحزمة الإقلاع ومسار الجلسة الحرج ما يكبرون بكل شاشة مكتب (السقفان المقيسان، DECISIONS «السقوف المقيسة»). كلها تحتاج الخادم،
// فهي برّا التثبيت المسبق بالاسم (AccountsRoutes وaccounts-office)، وتنطبع بـprint.css. و«المال بين يديك» (0024): أوّل التبويب «خلاصة المال»،
// وجدول الجهات انتقل إلى /accounts/parties كما هو، وحركة الأموال ويومية الصندوق وخلاصة الشهر بمساراتها (صفحات pages/accounts/money).
// «المال بين يديك» (0024، الوكيل ب): قائمة الذمم، والكشف الاحترافي (المسار نفسه)، وسندا القبض والصرف وسند التحويل.

export default function AccountsRoutes() {
  return (
    <Routes>
      <Route index element={<MoneyHubPage />} />
      <Route path="parties" element={<AccountsPage />} />
      <Route path="parties/:id" element={<PartyStatementPage />} />
      <Route path="moves" element={<MoneyMovesPage />} />
      <Route path="month" element={<MonthSummaryPage />} />
      <Route path="debts" element={<DebtsPage />} />
      <Route path="voucher/:id" element={<VoucherPage />} />
      <Route path="transfer/:id" element={<TransferVoucherPage />} />
      <Route path="openings" element={<OpeningBalancesPage />} />
      <Route path="cash" element={<CashPage />} />
      <Route path="cash/:id" element={<CashStatementPage />} />
      <Route path="cash/:id/day" element={<CashDayPage />} />
      <Route path="expenses" element={<ExpensesPage />} />
      <Route path="*" element={<Notice tone="info" title={t('accounts.not_found', 'هذه الصفحة غير موجودة في الحسابات.')} />} />
    </Routes>
  );
}
