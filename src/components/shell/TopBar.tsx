import { Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { t } from '../../lib/i18n';
import { IconButton } from '../ui/Button';
import { Logo } from '../Logo';
import { StatusChips } from './StatusChips';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-bar border-b border-line bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-2 sm:px-4">
        <IconButton className="md:hidden" label={t('shell.menu', 'القائمة')} onClick={onMenu}>
          <Menu aria-hidden="true" className="size-6" />
        </IconButton>
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded-full md:hidden" aria-label={t('nav.home', 'الرئيسية')}>
          <Logo className="size-8" />
        </Link>
        <div className="flex-1" />
        <StatusChips />
      </div>
    </header>
  );
}
