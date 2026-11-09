import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { visibleNav } from '../../lib/nav';
import { useSession } from '../../lib/session';
import { readJson, writeJson } from '../../lib/storage';
import { Toaster } from '../ui/Toast';
import { AppBanners } from './AppBanners';
import { MobileDrawer, Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const SIDEBAR_KEY = 'poultry.sidebar-collapsed';
/** نفس md بـTailwind: من هنا القائمة md:hidden والشريط الجانبي ظاهر. */
const WIDE_QUERY = '(min-width: 768px)';

// الشريط السفلي بالهاتف بحزمة كسولة (هامش حزمة الإقلاع بايتات): فشل تحميلها (نشر جديد) ما يطفي القشرة — القائمة
// بالشريط الجانبي بالحاسبة، والتعافي يمسك fetch الفاشل بـvite:preloadError.
const BottomBar = lazy((): Promise<{ default: ComponentType<{ onMenu: () => void }> }> =>
  import('./BottomBar').catch(() => ({
    default: () => null, // swallow-ok: حزمة الشريط السفلي ما انحمّلت؛ التنقّل باقي بالدرج وبالروابط
  })),
);

export function Shell({ children }: { children: ReactNode }) {
  const session = useSession();
  const items = visibleNav(session);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readJson(SIDEBAR_KEY) === true);
  // ثابتة حتى القائمة ما تعيد حبس التركيز وقفل التمرير ويّا كل رسم للقشرة.
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // ما تنفتح قائمة ما تنشاف (md:hidden) وتقفل التمرير.
  const openDrawer = useCallback(() => setDrawerOpen(!window.matchMedia(WIDE_QUERY).matches), []);

  // القائمة مفتوحة والشاشة كبرت لـmd (تدوير الموبايل): القائمة تختفي بـmd:hidden وقفلها يبقى،
  // فالصفحة كلها ما تتمرّر. تنسدّ ويّا التغيّر نفسه.
  useEffect(() => {
    if (!drawerOpen) return;
    const wide = window.matchMedia(WIDE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false);
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, [drawerOpen]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeJson(SIDEBAR_KEY, next);
  };

  return (
    <div className="min-h-dvh">
      <Sidebar items={items} collapsed={collapsed} onToggle={toggleCollapsed} />
      {drawerOpen ? <MobileDrawer items={items} onClose={closeDrawer} /> : null}
      {/* بالطباعة الصفحة وحدها (0022، تقرير الرصيد اليومي): الشريطان والأشرطة والفاصل print:hidden، والإزاحة عن الشريط الجانبي صفر. */}
      <div className={collapsed ? 'md:ps-19 print:ps-0' : 'md:ps-64 print:ps-0'}>
        <TopBar />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <AppBanners />
          {children}
          {/* فاصل بالهاتف بس: آخر الصفحة ما ينخبّى تحت الشريط السفلي (بأصناف موجودة، فما يكبر CSS الإقلاع). */}
          <div aria-hidden="true" className="h-16 md:hidden print:hidden" />
        </main>
      </div>
      <Suspense fallback={null}>
        <BottomBar onMenu={openDrawer} />
      </Suspense>
      <Toaster />
    </div>
  );
}
