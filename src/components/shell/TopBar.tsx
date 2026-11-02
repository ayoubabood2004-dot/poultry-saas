import { Link } from 'react-router-dom';
import { t } from '../../lib/i18n';
import { Logo } from '../Logo';
import { StatusChips } from './StatusChips';

// الشعار وشارات الحالة بس: زرّ «القائمة» انتقل للشريط السفلي بالهاتف (كلمة المالك 2026-11-02: ماكو قائمتان)،
// وبالحاسبة (md:) الأقسام بالشريط الجانبي.

export function TopBar() {
  return (
    <header className="sticky top-0 z-bar border-b border-line bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded-full md:hidden" aria-label={t('nav.home', 'الرئيسية')}>
          <Logo className="size-8" />
        </Link>
        <div className="flex-1" />
        <StatusChips />
      </div>
    </header>
  );
}
