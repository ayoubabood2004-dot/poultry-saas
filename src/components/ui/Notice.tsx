import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

// شريط تنبيه داخل الصفحة. اللون مساعد مو بديل: النص يكول الحالة دائماً.

export type NoticeTone = 'info' | 'warning' | 'danger';

const TONES: Record<NoticeTone, { className: string; Icon: typeof Info }> = {
  info: { className: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-100', Icon: Info },
  warning: { className: 'border-warn-200 bg-warn-50 text-warn-900 dark:border-warn-500/30 dark:bg-warn-500/15 dark:text-warn-100', Icon: TriangleAlert },
  danger: { className: 'border-danger-200 bg-danger-50 text-danger-900 dark:border-danger-500/30 dark:bg-danger-500/15 dark:text-danger-100', Icon: CircleAlert },
};

export interface NoticeProps {
  tone: NoticeTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function Notice({ tone, title, children, action }: NoticeProps) {
  const { className, Icon } = TONES[tone];
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${className}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          {children ? <div className="mt-0.5 text-sm opacity-90">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
