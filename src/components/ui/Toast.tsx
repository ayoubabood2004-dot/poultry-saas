import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { t } from '../../lib/i18n';
import { sound } from '../../lib/sound';
import { createStore, useStore } from '../../lib/store';
import { Button, IconButton } from './Button';

// أربع نغمات، و«تحذير» = نجاح جزئي. فوك كل النوافذ، وبيه زرّ فعل («حدّث القائمة») بدل «اضغط F5».

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  tone: ToastTone;
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

export interface ToastItem extends ToastInput {
  id: number;
}

const toasts = createStore<ToastItem[]>([]);
let lastId = 0;

const AUTO_DISMISS_MS: Record<ToastTone, number | null> = { info: 4000, success: 4000, warning: 9000, danger: null };

/** السقف للمعلومة والنجاح بس: يروحن وحدهن بعد ثواني، وما يغطّن الشاشة. */
const PASSING: ReadonlySet<ToastTone> = new Set<ToastTone>(['info', 'success']);
const PASSING_CAP = 3;

/**
 * يضيف تنبيه للمكدس. الخطر والتحذير ما ينشالون إلا بإيد المستخدم أو بوقتهم: سقف ٤ للكل كان يطيّح
 * «الاستلام ما انرحّل» بأربع «انحفظ» وراه، والعامل اللي باعد عينه ما يدري. المعلومة والنجاح: الأقدم يطلع أوّل.
 */
export function withToast(list: readonly ToastItem[], item: ToastItem): ToastItem[] {
  const next = [...list, item];
  const passing = next.filter((entry) => PASSING.has(entry.tone));
  if (passing.length <= PASSING_CAP) return next;
  const dropped = new Set(passing.slice(0, passing.length - PASSING_CAP));
  return next.filter((entry) => !dropped.has(entry));
}

export function dismissToast(id: number): void {
  toasts.set((list) => list.filter((item) => item.id !== id));
}

export function toast(input: ToastInput): void {
  lastId += 1;
  const id = lastId;
  toasts.set((list) => withToast(list, { ...input, id }));
  if (input.tone === 'success') sound.success();
  else if (input.tone === 'warning' || input.tone === 'danger') sound.warn();
  const delay = AUTO_DISMISS_MS[input.tone];
  if (delay !== null) setTimeout(() => dismissToast(id), delay);
}

const TONES: Record<ToastTone, { className: string; Icon: typeof Info }> = {
  info: { className: 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100', Icon: Info },
  success: { className: 'bg-success-50 text-success-800 dark:bg-success-500/15 dark:text-success-100', Icon: CircleCheck },
  warning: { className: 'bg-warn-50 text-warn-900 dark:bg-warn-500/15 dark:text-warn-100', Icon: TriangleAlert },
  danger: { className: 'bg-danger-50 text-danger-800 dark:bg-danger-500/15 dark:text-danger-100', Icon: CircleAlert },
};

export function Toaster() {
  const items = useStore(toasts);
  if (items.length === 0) return null;
  return createPortal(
    <div data-toaster className="pointer-events-none fixed inset-x-0 top-0 z-toast flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {items.map((item) => {
        const { className, Icon } = TONES[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === 'danger' || item.tone === 'warning' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-2xl border border-line p-4 shadow-raised ${className}`}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{item.title}</div>
              {item.detail ? <div className="mt-0.5 text-sm opacity-90">{item.detail}</div> : null}
              {item.action ? (
                // Button وIconButton: نفس الارتفاعات والنقرة اللي بكل التطبيق، مو هدف 28px بإيد وحدة.
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  data-action="toast-action"
                  onClick={() => {
                    item.action?.run();
                    dismissToast(item.id);
                  }}
                >
                  {item.action.label}
                </Button>
              ) : null}
            </div>
            <IconButton label={t('toast.close', 'أغلق التنبيه')} className="-me-2 -mt-2" onClick={() => dismissToast(item.id)}>
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
