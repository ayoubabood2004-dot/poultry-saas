import type { ReactNode } from 'react';
import { t } from '../../lib/i18n';
import { Logo } from '../Logo';
import { Toaster } from '../ui/Toast';
import { AppBanners } from './AppBanners';
import { StatusChips } from './StatusChips';

// إطار شاشات ما قبل المنشأة (الدخول، أوّل دخول): بلا شريط أقسام ولا قائمة، بس شعار وحالة وتنبيهات التحديث،
// ونفس Toaster مال القشرة (القشرة ما ترتسم هنا، وبلاه toast() ما يبين).

export function BareFrame({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface-1 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 w-full max-w-xl items-center gap-3 px-4 sm:px-6">
          <Logo className="size-9 shrink-0" />
          <span className="truncate text-lg font-semibold">{t('app.name', 'نظام الدواجن')}</span>
          <div className="flex-1" />
          <StatusChips />
          {actions}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
        <AppBanners />
        {children}
      </main>
      <Toaster />
    </div>
  );
}
