import { useCallback, useEffect, useState, type ReactNode } from 'react';
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

export function Shell({ children }: { children: ReactNode }) {
  const session = useSession();
  const items = visibleNav(session);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readJson(SIDEBAR_KEY) === true);
  // ثابتة حتى القائمة ما تعيد حبس التركيز وقفل التمرير ويّا كل رسم للقشرة.
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

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
      <div className={collapsed ? 'md:ps-19' : 'md:ps-64'}>
        {/* ما تنفتح قائمة ما تنشاف (md:hidden) وتقفل التمرير. */}
        <TopBar onMenu={() => setDrawerOpen(!window.matchMedia(WIDE_QUERY).matches)} />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <AppBanners />
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
