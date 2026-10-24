import { Suspense } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RouteErrorBoundary } from './components/shell/RouteErrorBoundary';
import { Shell } from './components/shell/Shell';
import { t } from './lib/i18n';
import { page } from './lib/pwa/recovery';
import { SessionProvider } from './lib/session';

// كل صفحة كسولة وتمرّ من page() حتى فشل تحميل حزمتها بعد نشر جديد يمرّ من التعافي.
const HomePage = page(() => import('./pages/home/HomePage'));
const MillPage = page(() => import('./pages/mill/MillPage'));
const BroilerPage = page(() => import('./pages/broiler/BroilerPage'));
const LayersPage = page(() => import('./pages/layers/LayersPage'));
const HatcheryPage = page(() => import('./pages/hatchery/HatcheryPage'));
const InventoryPage = page(() => import('./pages/inventory/InventoryPage'));
const MedicinePage = page(() => import('./pages/inventory/MedicinePage'));
const GeneralStoresPage = page(() => import('./pages/inventory/GeneralStoresPage'));
const SalesPage = page(() => import('./pages/sales/SalesPage'));
const AccountsPage = page(() => import('./pages/accounts/AccountsPage'));
const ReportsPage = page(() => import('./pages/reports/ReportsPage'));
const SettingsPage = page(() => import('./pages/settings/SettingsPage'));
const NotFoundPage = page(() => import('./pages/NotFoundPage'));

function PageLoading() {
  return (
    <div role="status" className="py-10 text-center text-sm text-ink-muted">
      {t('page.loading', 'جارٍ الفتح…')}
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
          <Route path="/mill" element={<MillPage />} />
          <Route path="/broiler" element={<BroilerPage />} />
          <Route path="/layers" element={<LayersPage />} />
          <Route path="/hatchery" element={<HatcheryPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory/medicine" element={<MedicinePage />} />
          <Route path="/inventory/general" element={<GeneralStoresPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider>
        <Shell>
          <AppRoutes />
        </Shell>
      </SessionProvider>
    </BrowserRouter>
  );
}
