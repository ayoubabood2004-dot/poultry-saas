import type { ReactNode } from 'react';
import { t } from '../../lib/i18n';
import { Button } from './Button';
import { Dialog } from './Dialog';

// خطوتان بدل ثلاث (كلمة المالك 2026-10-31): المستخدم يملأ الورقة ثم «راجع واحفظ» يطلب المراجعة من الخادم ويفتح هذه النافذة،
// وفيها الخلاصة وموافقة كل سطر (إن طلبتها الخطّة) وزرّ واحد «احفظ نهائياً» يحفظ بنفس بصمة المراجعة. حماية الخادم كما هي:
// الورقة القديمة والمراجعة القديمة تُرفضان، والزرّ معطّل حتى تجهز المراجعة بلا مشكلة.

export interface ReviewDialogProps {
  open: boolean;
  /** «راجع التحويل قبل الحفظ». */
  title: string;
  /** المراجعة جاهزة وكل سطر انوافق عليه والشبكة موجودة. */
  ready: boolean;
  busy: boolean;
  /** data-action لزرّ الحفظ (الفحوص تمسكه به). */
  action: string;
  saveLabel?: string;
  onSave: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function ReviewDialog({ open, title, ready, busy, action, saveLabel, onSave, onClose, children }: ReviewDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      locked={busy}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy} data-action="review-back">
            {t('review.back', 'ارجع إلى الورقة')}
          </Button>
          <Button disabled={!ready} busy={busy} onClick={onSave} data-action={action}>
            {saveLabel ?? t('review.save', 'احفظ نهائياً')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">{children}</div>
    </Dialog>
  );
}
