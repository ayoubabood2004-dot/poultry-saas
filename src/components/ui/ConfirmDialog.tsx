import type { ReactNode } from 'react';
import { t } from '../../lib/i18n';
import { Button } from './Button';
import { Dialog } from './Dialog';

// لا تأكيد بنافذة المتصفّح أبداً: بـdoctorVet زرّ حذف بتأكيد متصفّح انقبل بلا قراءة، والمادّة «اختفت».
// التأكيد يسمّي الشي وما راح يصير («الغِ الاستلام R-0042 — ترجع 7 مواد من المخزن»)،
// وزرّ الخطر يكول شنو يسوي، مو «نعم».

export interface ConfirmDialogProps {
  open: boolean;
  /** يسمّي الشي: «الغِ الاستلام R-0042». */
  title: string;
  /** شنو راح يصير بالضبط. */
  consequence: ReactNode;
  /** فعل الزرّ: «الغِ الاستلام». */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  action?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  busy = false,
  action = 'confirm',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // وقت الشغل ماكو رجعة: «لا، ارجع» معطّل، وEsc والنقرة برّا وX مقفولين وياه (locked).
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      locked={busy}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>
            {cancelLabel ?? t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} busy={busy} onClick={onConfirm} data-action={action}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-ink-muted">{consequence}</div>
    </Dialog>
  );
}
