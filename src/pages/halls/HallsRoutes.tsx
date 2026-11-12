import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import CalendarPage from './CalendarPage';
import CyclesPage from './CyclesPage';
import DailyPage from './DailyPage';
import GivePage from './GivePage';
import ReportPage from './ReportPage';
import VaccinesPage from './VaccinesPage';

// «القاعات بين يديك» (0026، كلمة المالك 2026-11-11، docs/HALLS_PLAN.md) بمسار واحد /halls/* وحزمة وحدة خارج التثبيت المسبق بالاسم
// (كلّها تحتاج الخادم: الصرف والتأشير والتقويم والتقرير وجدول اللقاحات)، مثل المعمل. والتذكير (Reminders) من الحزمة نفسها تستورده الجولة
// والرئيسية استيراداً كسولاً: بلا نت لا يظهر شيء، والجولة تبقى تعمل. وتقارير القاعات (0027): التقرير اليوميّ (day?on=) وتقارير الدورات (cycles)
// في الحزمة نفسها، تقرأ من الخادم وحده.
export { default as Reminders } from './Reminders';

export default function HallsRoutes() {
  return (
    <Routes>
      <Route path="give/:flockId" element={<GivePage />} />
      <Route path="calendar/:flockId" element={<CalendarPage />} />
      <Route path="report/:flockId" element={<ReportPage />} />
      <Route path="vaccines" element={<VaccinesPage />} />
      <Route path="day" element={<DailyPage />} />
      <Route path="cycles" element={<CyclesPage />} />
      <Route path="*" element={<Notice tone="info" title={t('halls.not_found', 'هذه الصفحة غير موجودة في القاعات.')} />} />
    </Routes>
  );
}
