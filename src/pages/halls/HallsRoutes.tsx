import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import CalendarPage from './CalendarPage';
import ClosePage from './ClosePage';
import CycleReportPage from './CycleReportPage';
import CyclesPage from './CyclesPage';
import DailyPage from './DailyPage';
import GivePage from './GivePage';
import ReportPage from './ReportPage';
import TicketPage from './TicketPage';
import TicketsPage from './TicketsPage';
import VaccinesPage from './VaccinesPage';

// «القاعات بين يديك» (0026، كلمة المالك 2026-11-11، docs/HALLS_PLAN.md) بمسار واحد /halls/* وحزمة وحدة خارج التثبيت المسبق بالاسم
// (كلّها تحتاج الخادم: الصرف والتأشير والتقويم والتقرير وجدول اللقاحات)، مثل المعمل. والتذكير (Reminders) من الحزمة نفسها تستورده الجولة
// والرئيسية استيراداً كسولاً: بلا نت لا يظهر شيء، والجولة تبقى تعمل. وتقارير القاعات (0027): التقرير اليوميّ (day?on=) وتقارير الدورات (cycles)
// في الحزمة نفسها، تقرأ من الخادم وحده. وبيع الطيور وإغلاق الدورة (0028): تذكرة الوزن (ticket/new?site=&hall= وticket/:id) وقائمتها (tickets)
// و«أغلق الدورة» (close/:flockId) في الحزمة نفسها تحتاج الخادم لتُفتح (D9)؛ وبطاقة الفوج (FlockCard) تستوردها صفحة الفوج المحفوظة كسولةً كالتذكير.
export { default as Reminders } from './Reminders';
export { default as FlockCard } from './FlockCard';
// إرسال العلف من بطاقة القاعة في الجولة (0036): يحتاج الخادم، فالجولة المحفوظة تحمّله كسولةً (pages/farm/shared: RoundFeedLazy) كالتذكير.
export { default as RoundFeed } from '../farm/RoundFeed';
// نافذة «عدّل الفوج» (0028) هنا لتُحمَّل من حزمة القاعات خارج التثبيت المسبق (pages/farm/flockEditLazy): التعديل يحتاج الخادم كلّه.
export { FlockEditDialog } from '../farm/FlockEditDialog';
// «أضف قاعة» و«عدّل القاعة» و«افتح فوجاً» لجدول الحقل (0036، سقف التثبيت المسبق): تحتاج الخادم، فتُحمَّل من هنا (pages/farm/flockEditLazy).
export { HallDialog, OpenFlockDialog } from '../farm/hallDialogs';
// «احذف القاعة» كأنّها لم تكن (0037): نافذة الحذف لجدول الحقل من هنا (pages/farm/flockEditLazy)، ونافذة «عدّل القاعة» تفتحها فوقها.
export { DeleteHallDialog } from '../farm/DeleteHallDialog';
// صفحة القاعة (كلمة المالك 2026-11-16) هنا أيضاً: كلّها من الخادم (الفوج وأيامه والجولة لأيّ يوم والوزن)، فلا تُثقل التثبيت المسبق؛ ومسارها
// /broiler/hall/:id في حزمة الحقول يحمّلها كسولةً (pages/farm/FarmRoutes).
export { default as FlockPage, HallPage } from '../farm/FlockPage';

export default function HallsRoutes() {
  return (
    <Routes>
      <Route path="give/:flockId" element={<GivePage />} />
      <Route path="calendar/:flockId" element={<CalendarPage />} />
      <Route path="report/:flockId" element={<ReportPage />} />
      <Route path="cycle/:flockId" element={<CycleReportPage />} />
      <Route path="vaccines" element={<VaccinesPage />} />
      <Route path="day" element={<DailyPage />} />
      <Route path="cycles" element={<CyclesPage />} />
      <Route path="ticket/new" element={<TicketPage />} />
      <Route path="ticket/:id" element={<TicketPage />} />
      <Route path="tickets" element={<TicketsPage />} />
      <Route path="close/:flockId" element={<ClosePage />} />
      <Route path="*" element={<Notice tone="info" title={t('halls.not_found', 'هذه الصفحة غير موجودة في القاعات.')} />} />
    </Routes>
  );
}
