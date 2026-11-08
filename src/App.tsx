import { Suspense } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RouteErrorBoundary } from './components/shell/RouteErrorBoundary';
import { Shell } from './components/shell/Shell';
import { t } from './lib/i18n';
import { page } from './lib/pwa/recovery';
import { SessionProvider, useSession } from './lib/session';

// كل صفحة كسولة وتمرّ من page() حتى فشل تحميل حزمتها بعد نشر جديد يمرّ من التعافي.
const HomePage = page(() => import('./pages/home/HomePage'));
const MillRoutes = page(() => import('./pages/mill/MillRoutes'));
// حقول اللحم والبيض (المرحلة 2، النسخة الأولى): القاعات والأفواج والجولة اليومية بمساراتها الداخلية (pages/farm/FarmRoutes).
const BroilerPage = page(() => import('./pages/broiler/BroilerPage'));
const LayersPage = page(() => import('./pages/layers/LayersPage'));
const HatcheryPage = page(() => import('./pages/hatchery/HatcheryPage'));
// المخزون (اللوحات والبطاقة والافتتاح والتحويل) بمسار واحد وحزمة وحدة (StockRoutes، WP4)، والمواد مسارها الثابت.
const StockRoutes = page(() => import('./pages/inventory/StockRoutes'));
// المبيعات (0021، كلمة المالك 2026-11-08) في حزمة المخزون نفسها (StockRoutes، خارج التثبيت المسبق بالاسم): البيع يُحفظ بالخادم فوراً.
const SalesRoutes = page<object>(() => import('./pages/inventory/StockRoutes').then((routes) => ({ default: routes.SalesRoutes })));
// الحسابات والصناديق بمسار واحد وحزمة وحدة (AccountsRoutes، WP3): مساراتها الداخلية هناك.
const AccountsRoutes = page(() => import('./pages/accounts/AccountsRoutes'));
const ReportsPage = page(() => import('./pages/reports/ReportsPage'));
const StaffPage = page(() => import('./pages/staff/StaffPage'));
const AccountPage = page(() => import('./pages/account/AccountPage'));
const SettingsPage = page(() => import('./pages/settings/SettingsPage'));
// «إعداد المخزن» و«إعدادات المنشأة» شاشة وحدة بأقسام مختلفة، من نفس الاستيراد الكسول: الحزمة وحدة باسمها القديم
// (OrgSettingsPage، مستثناة من التثبيت المسبق بالاسم)، فما تنولد ثالثة باسم جديد يحرسه pwa-guard. والنصوص داخلها
// (حزمة كسولة) مو هنا، حتى ما تثقل حزمة الإقلاع.
const OrgSettingsPage = page(() => import('./pages/settings/OrgSettingsPage'));
const STORE_SETUP_SECTIONS = ['places', 'packs', 'categories'] as const;
// «إعدادات المنشأة» بفئات المصاريف وحدها: قسم يوم التشغيل انشال بكلمة المالك 2026-11-06 («ما النا علاقة بيوم التشغيل»).
const ORG_SECTIONS = ['expenses'] as const;
const ItemsPage = page(() => import('./pages/inventory/ItemsPage'));
const NotFoundPage = page(() => import('./pages/NotFoundPage'));
// ما قبل المنشأة: برّا القشرة (بلا شريط أقسام).
const AuthPage = page(() => import('./pages/auth/AuthPage'));
const WelcomePage = page(() => import('./pages/welcome/WelcomePage'));
const SessionFailedPage = page(() => import('./pages/auth/SessionFailedPage'));

function PageLoading() {
  return (
    <div role="status" className="py-10 text-center text-sm text-ink-muted">
      {t('page.loading', 'جارٍ الفتح…')}
    </div>
  );
}

function SessionLoading() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center px-4 text-center text-sm text-ink-muted">
      {t('session.loading', 'جارٍ التحقّق من الدخول…')}
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/mill/*" element={<MillRoutes />} />
          <Route path="/broiler/*" element={<BroilerPage />} />
          <Route path="/layers/*" element={<LayersPage />} />
          <Route path="/hatchery" element={<HatcheryPage />} />
          <Route path="/inventory/items" element={<ItemsPage />} />
          <Route path="/inventory/setup" element={<OrgSettingsPage sections={STORE_SETUP_SECTIONS} />} />
          <Route path="/inventory/*" element={<StockRoutes />} />
          <Route path="/sales/*" element={<SalesRoutes />} />
          <Route path="/accounts/*" element={<AccountsRoutes />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/org" element={<OrgSettingsPage sections={ORG_SECTIONS} />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

/** الجلسة تقرّر الشاشة: الدخول، أوّل دخول بلا منشأة، أو القشرة. بلا قاعدة (not_configured) القشرة هيكل. */
function Gate() {
  const session = useSession();
  if (session.status === 'ready' || session.status === 'not_configured') {
    return (
      <Shell>
        <AppRoutes />
      </Shell>
    );
  }
  if (session.status === 'loading') return <SessionLoading />;
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<SessionLoading />}>
        {session.status === 'signed_out' ? <AuthPage /> : session.status === 'no_org' ? <WelcomePage /> : <SessionFailedPage />}
      </Suspense>
    </RouteErrorBoundary>
  );
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  );
}
