import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isTopModal, trapFocus } from '../../lib/focus';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { lockScroll } from '../../lib/scrollLock';
import { Button, IconButton } from './Button';

// نافذة وحدة لكل التطبيق: ورقة تطلع من جوّا بالموبايل، وبطاقة بالنص من sm فما فوك.
// مكدس نوافذ: Esc وTab للعليا بس. ونموذج مليان ما ينغلق بـEsc أو نقرة برّا بلا سؤال
// (بـdoctorVet فاتورة شراء بـ٣٠ سطر انطوت وانعادت من الذاكرة).

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** النموذج معدّل: الإغلاق يسأل أوّلاً، والتحديث ينتظر الحفظ. */
  dirty?: boolean;
  /**
   * شغل ما يوكف بدأ (الترحيل طالع للخادم): Esc والنقرة برّا وX ما يسوون شي، وX معطّل.
   * بلاه النافذة تنسدّ كأنها «لا، ارجع» والعملية تكمل وتنرحّل.
   */
  locked?: boolean;
  /**
   * false: تنسدّ من أزرارها بس (بلا Esc ولا نقرة برّا ولا X). لشي يبين مرّة وحدة ويضيع بنقرة غلط، مثل رمز الدعوة
   * (ما ينحفظ غير بصمته، فالضياع يعني رمزاً جديداً).
   */
  dismissible?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/** شنو يسوي طلب السدّ (Esc، نقرة برّا، X). دالّة صافية حتى تنفحص بلا متصفّح. */
export function closeIntent(locked: boolean, dirty: boolean, dismissible = true): 'ignore' | 'ask' | 'close' {
  if (locked || !dismissible) return 'ignore';
  return dirty ? 'ask' : 'close';
}

export function Dialog({ open, onClose, title, dirty = false, locked = false, dismissible = true, footer, children }: DialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const [askLeave, setAskLeave] = useState(false);
  useDirtyForm(open && dirty);

  const requestClose = useCallback(() => {
    const intent = closeIntent(locked, dirty, dismissible);
    if (intent === 'ask') setAskLeave(true);
    else if (intent === 'close') onClose();
  }, [locked, dirty, dismissible, onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const unlock = lockScroll();
    const release = trapFocus(panel);
    return () => {
      release();
      unlock();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopModal(panelRef.current)) return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-dialog flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-black/40" onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={locked || undefined}
        tabIndex={-1}
        className="relative flex max-h-sheet w-full animate-sheet-in flex-col overflow-hidden rounded-t-4xl border border-line bg-surface-1 shadow-raised outline-none sm:max-w-lg sm:animate-dialog-in sm:rounded-3xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line py-3 pe-3 ps-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {dismissible ? (
            <IconButton
              label={t('dialog.close', 'أغلق النافذة')}
              onClick={requestClose}
              disabled={locked}
              data-action="dialog-close"
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          ) : null}
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer> : null}
      </div>
      <Dialog
        open={askLeave}
        onClose={() => setAskLeave(false)}
        title={t('dialog.leave.title', 'الخروج دون حفظ؟')}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAskLeave(false)} data-autofocus>
              {t('dialog.leave.stay', 'عُد إلى النموذج')}
            </Button>
            <Button
              variant="danger"
              data-action="dialog-discard"
              onClick={() => {
                setAskLeave(false);
                onClose();
              }}
            >
              {t('dialog.leave.discard', 'اخرج وتجاهل التعديلات')}
            </Button>
          </div>
        }
      >
        <p className="text-ink-muted">{t('dialog.leave.detail', 'ما كتبته في «{title}» لم يُحفظ، وسيضيع إذا خرجت.', { title })}</p>
      </Dialog>
    </div>,
    document.body,
  );
}
