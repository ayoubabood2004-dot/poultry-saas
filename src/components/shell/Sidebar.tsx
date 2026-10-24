import { PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { isTopModal, trapFocus } from '../../lib/focus';
import { t } from '../../lib/i18n';
import type { NavItem } from '../../lib/nav';
import { lockScroll } from '../../lib/scrollLock';
import { sound } from '../../lib/sound';
import { IconButton } from '../ui/Button';
import { Logo } from '../Logo';

// الشريط الجانبي fixed start-0 border-e (مطوي 4.75rem). الاتجاه منطقي بس: ماكو left/right.

function NavLinks({ items, compact, onNavigate }: { items: readonly NavItem[]; compact: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label={t('shell.nav', 'أقسام النظام')} className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/' || to === '/inventory'}
          title={compact ? label : undefined}
          onClick={() => {
            sound.click();
            onNavigate?.();
          }}
          className={({ isActive }) =>
            `flex h-11 items-center gap-3 rounded-2xl text-sm font-medium transition-colors ${compact ? 'justify-center' : 'px-3'} ${
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
            }`
          }
        >
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          <span className={compact ? 'sr-only' : 'truncate'}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar({ items, collapsed, onToggle }: { items: readonly NavItem[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`fixed inset-y-0 start-0 z-bar hidden flex-col border-e border-line bg-surface-1 pt-[env(safe-area-inset-top)] md:flex ${
        collapsed ? 'w-19' : 'w-64'
      }`}
    >
      <div className={`flex h-16 items-center gap-3 ${collapsed ? 'justify-center' : 'px-5'}`}>
        <Logo className="size-9 shrink-0" />
        {collapsed ? null : <span className="truncate text-lg font-semibold">{t('app.name', 'نظام الدواجن')}</span>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavLinks items={items} compact={collapsed} />
      </div>
      <div className={`flex border-t border-line p-3 ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <IconButton label={collapsed ? t('shell.expand', 'وسّع الشريط') : t('shell.collapse', 'اطوِ الشريط')} onClick={onToggle}>
          {collapsed ? <PanelRightOpen aria-hidden="true" className="size-5" /> : <PanelRightClose aria-hidden="true" className="size-5" />}
        </IconButton>
      </div>
    </aside>
  );
}

/**
 * نفس الأقسام بالموبايل: ورقة من جهة البداية فوك الصفحة. نافذة مثل Dialog: قفل التمرير بنفس العدّاد،
 * والتركيز يدخلها ويدور بيها ويرجع لزرّ «القائمة» لمّا تنسدّ. Shell يسدّها لمّا الشاشة توصل md.
 */
export function MobileDrawer({ items, onClose }: { items: readonly NavItem[]; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const unlock = lockScroll();
    const release = trapFocus(panel);
    return () => {
      release();
      unlock();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopModal(panelRef.current)) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-sheet md:hidden">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.nav', 'أقسام النظام')}
        tabIndex={-1}
        className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col border-e border-line bg-surface-1 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-raised outline-none"
      >
        <div className="flex h-16 items-center gap-3 pe-2 ps-5">
          <Logo className="size-9 shrink-0" />
          <span className="flex-1 truncate text-lg font-semibold">{t('app.name', 'نظام الدواجن')}</span>
          <IconButton label={t('shell.close_menu', 'أغلق القائمة')} onClick={onClose}>
            <X aria-hidden="true" className="size-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks items={items} compact={false} onNavigate={onClose} />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
