import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast, type ToastInput } from '../../components/ui/Toast';
import { describeError, RejectedError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { deleteHall, loadDeleteHallPreview, type DeletedHall, type DeleteHallPreview, type HallBack } from '../../lib/repo/hallDelete';
import { useLoad } from '../../lib/useLoad';
import { amountText, surelyUnsaved } from '../halls/GivePage';
import { daysText } from '../halls/parts';
import { hallLabel } from './shared';

// «احذف القاعة» كأنّها لم تكن (0037، كلمة الزبون 2026-11-26 عن قاعاته التجريبية وجواب المالك، عقد 0037 الجزء H): نافذة واحدة لجدول الحقل ونافذة
// «عدّل القاعة»، من حزمة القاعات خارج التثبيت المسبق (pages/farm/flockEditLazy). تقرأ أوّلاً ما سيُحذف (delete_hall_preview): ما يمنع الحذف بجمل الخادم
// بلا زرّ حذف، أو ما يحدث — ما صُرف لفوج القاعة يرجع إلى مخزنه، وأيّامه تختفي من التقارير، والدورات المنتهية تبقى. والحذف delete_hall بنسخة القاعة
// وبصمة ما عُرض ومرجع واحد للنافذة تحمله كلّ إعادة؛ وتغيّرٌ بعد فتح النافذة (stale_plan وstale_hall أو منعٌ جديد) يُقرأ من جديد ويُقال.

/** رفوض تعني أنّ ما عُرض قبل الحذف تغيّر: النافذة تقرأ ما في القاعة من جديد وتقول ذلك، والصفحة تقرأ الحقل من جديد. */
const REREAD: ReadonlySet<string> = new Set(['stale_plan', 'stale_hall', 'hall_has_sales', 'hall_has_tickets', 'hall_has_carry', 'period_locked', 'forbidden', 'flock_void', 'hall_not_found']);

/** جمل رموز الحذف حين يرفض الخادم بلا تلميح (والتلميح أوّلاً حين يحمله). */
const FAILURE_TEXT: Readonly<Record<string, () => string>> = {
  flock_void: () => t('hall.delete.error.flock_void', 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.'),
  hall_has_sales: () => t('hall.delete.error.sales', 'في فوج القاعة بيع طيور: ألغِ فاتورته أوّلاً ثمّ احذف القاعة.'),
  hall_has_tickets: () => t('hall.delete.error.tickets', 'لفوج القاعة تذكرة وزن: ألغِها أوّلاً ثمّ احذف القاعة.'),
  hall_has_carry: () => t('hall.delete.error.carry', 'في فوج القاعة علف منقول من الدورة السابقة ما زال مطبَّقاً، فلا تُحذف القاعة الآن.'),
  stale_plan: () => t('hall.delete.error.stale_plan', 'تغيّر ما في القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.'),
  stale_hall: () => t('hall.delete.error.stale_hall', 'تغيّرت القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.'),
  period_locked: () => t('hall.delete.error.period_locked', 'يوم تسكين الفوج أو اليوم في فترة حسابات مقفلة، فلا تُحذف القاعة قبل فتح الفترة.'),
};

/** جملة رفض الحذف: تلميح الخادم حين يحمله، وإلّا جملة رمزه، وإلّا وصف الخطأ. */
export function deleteHallFailure(problem: unknown): string {
  if (problem instanceof RejectedError) {
    if (problem.hint) return problem.hint;
    const text = FAILURE_TEXT[problem.code];
    if (text) return text();
  }
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

/** «يرجع إلى «رصيد العلف» 14,000 كغم «علف م/1»». */
const backLine = (row: HallBack): string => t('hall.delete.back', 'يرجع إلى «{store}» {qty} «{item}»', { store: row.warehouse, qty: amountText(row.qty, row.baseUnit), item: row.item });

/** رسالة الحذف: ما رجع إلى المخزن مسمّى، أو «محذوفة من قبل» بلا تغيير. */
export function deletedToast(done: DeletedHall, name: string): ToastInput {
  if (done.already) return { tone: 'info', title: t('hall.delete.already', 'القاعة «{hall}» محذوفة من قبل، فلم يتغيّر شيء.', { hall: name }) };
  const title = t('hall.delete.done', 'حُذفت القاعة «{hall}».', { hall: name });
  if (done.back.length === 0) return { tone: 'success', title };
  const list = done.back.map((row) => t('hall.delete.done.row', '{qty} «{item}» إلى «{store}»', { qty: amountText(row.qty, row.baseUnit), item: row.item, store: row.warehouse }));
  return { tone: 'success', title, detail: t('hall.delete.done.back', 'رجع إلى المخزن: {list}.', { list: list.join(t('list.separator', '، ')) }) };
}

/** ما يمنع الحذف (جمل الخادم كما هي)، أو ما سيحدث سطراً سطراً. */
function Effects({ preview }: { preview: DeleteHallPreview }) {
  if (preview.blocks.length > 0) {
    return (
      <div className="flex flex-col gap-2" data-action="hall-delete-blocks">
        <p className="font-semibold">{t('hall.delete.blocked', 'لا تُحذف القاعة الآن:')}</p>
        <ul className="flex list-disc flex-col gap-1.5 ps-6">
          {preview.blocks.map((block, index) => (
            <li key={`${block.code}-${index}`} data-block={block.code}>
              {block.text}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const { flock } = preview;
  const lines: { key: string; text: string }[] = flock
    ? [
        ...flock.back.map((row) => ({ key: `back:${row.warehouseId}:${row.itemId}`, text: backLine(row) })),
        flock.days > 0
          ? { key: 'days', text: t('hall.delete.days', 'تختفي أيّامه ({days}) من كلّ التقارير', { days: daysText(flock.days) }) }
          : { key: 'days', text: t('hall.delete.no_days', 'لم تُسجَّل له أيّام بعد') },
      ]
    : [{ key: 'hall', text: t('hall.delete.empty', 'تختفي القاعة من الحقل والجولة اليومية') }];
  if (preview.ended > 0) lines.push({ key: 'ended', text: t('hall.delete.ended', 'الدورات المنتهية في القاعة ({n}) تبقى في التقارير', { n: preview.ended }) });
  return (
    <div className="flex flex-col gap-2" data-action="hall-delete-effects">
      {flock ? <p className="font-semibold">{t('hall.delete.flock', 'سيُلغى فوج القاعة كأنّه لم يكن:')}</p> : null}
      <ul className="flex list-disc flex-col gap-1.5 ps-6">
        {lines.map((line) => (
          <li key={line.key} data-line={line.key}>
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface DeleteHallDialogProps {
  /** القاعة كما في الصفحة (الاسم للعنوان قبل القراءة). */
  hall: { id: string; name: string };
  onClose: () => void;
  /** حُذفت القاعة (أو كانت محذوفة قبلاً): أغلق النافذة واقرأ الحقل من جديد. */
  onDeleted: () => void;
  /** ما تعرضه الصفحة قديم (تغيّرت القاعة أو حُذفت من جهاز آخر، أو أُغلقت النافذة ونتيجة الحذف لا تُعرف): اقرأ الحقل من جديد. */
  onStale?: () => void;
}

/** الطلب كما أُرسل: الإعادة بعد نتيجة لا تُعرف ترسله حرفاً (النسخة والبصمة نفساهما). */
interface Sent {
  version: number;
  plan: string;
}

interface Problem {
  tone: 'warning' | 'danger';
  text: string;
  /** قُرئ ما في القاعة من جديد بعدها. */
  reread: boolean;
}

export function DeleteHallDialog({ hall, onClose, onDeleted, onStale }: DeleteHallDialogProps) {
  const name = hallLabel(hall.name);
  // مرجع واحد لكلّ نافذة تُفتح: الإعادة بعد جواب ضاع، أو بعد قراءة جديدة لما في القاعة، هي الحذف نفسه لا حذف ثانٍ.
  const [clientRef] = useState(() => crypto.randomUUID());
  const staleRef = useRef(onStale);
  useEffect(() => {
    staleRef.current = onStale;
  });
  // قاعة حُذفت من جهاز آخر (hall_not_found): جدول الحقل يقرأ من جديد فتختفي منه.
  const load = useCallback(async () => {
    try {
      return await loadDeleteHallPreview(hall.id);
    } catch (error) {
      if (error instanceof RejectedError && error.code === 'hall_not_found') staleRef.current?.();
      throw error;
    }
  }, [hall.id]);
  const state = useLoad(load, hall.id);
  const preview = state.loading ? null : state.data;
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState<Sent | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const gone = state.error instanceof RejectedError && state.error.code === 'hall_not_found';
  const ready: Sent | null = preview && preview.blocks.length === 0 ? { version: preview.hall.version, plan: preview.plan } : null;
  const request = unknown ?? ready;

  const confirm = async () => {
    if (busy || request === null) return;
    setBusy(true);
    setProblem(null);
    try {
      const done = await deleteHall(hall.id, request.version, request.plan, clientRef);
      toast(deletedToast(done, name));
      onDeleted();
    } catch (failure) {
      setBusy(false);
      if (!surelyUnsaved(failure)) {
        // ربما حُذفت: لا قراءة تغيّر ما يُرسل، و«أعد المحاولة» ترسل الطلب نفسه بمرجعه.
        setUnknown(request);
        const { title, detail } = describeError(failure);
        setProblem({ tone: 'warning', text: `${title} ${detail}`, reread: false });
        return;
      }
      setUnknown(null);
      const reread = failure instanceof RejectedError && REREAD.has(failure.code);
      setProblem({ tone: reread ? 'warning' : 'danger', text: deleteHallFailure(failure), reread });
      if (reread) {
        state.retry();
        onStale?.();
      }
    }
  };

  const close = () => {
    if (unknown) onStale?.();
    onClose();
  };

  let body: ReactNode = null;
  if (unknown && state.data) body = <Effects preview={state.data} />;
  else if (state.loading) {
    body = (
      <p role="status" className="text-sm text-ink-muted" data-action="hall-delete-loading">
        {t('hall.delete.loading', 'جارٍ التحقّق ممّا في القاعة…')}
      </p>
    );
  } else if (gone) {
    body = (
      <div data-action="hall-delete-gone">
        <Notice tone="info" title={t('hall.delete.gone', 'لم تعد القاعة «{hall}» في الحقل: حُذفت من قبل.', { hall: name })} />
      </div>
    );
  } else if (state.error) body = <LoadFailed what={t('hall.delete.what', 'ما في القاعة')} error={state.error} onRetry={state.retry} />;
  else if (preview) body = <Effects preview={preview} />;

  return (
    <Dialog
      open
      onClose={close}
      locked={busy}
      title={t('hall.delete.title', 'حذف القاعة «{hall}»؟', { hall: name })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy} data-autofocus data-action="hall-delete-cancel">
            {request ? t('confirm.cancel', 'لا، تراجع') : t('hall.delete.close', 'أغلق')}
          </Button>
          {request ? (
            <Button variant="danger" busy={busy} onClick={() => void confirm()} data-action="hall-delete-confirm">
              {unknown ? t('hall.delete.retry', 'أعد المحاولة') : t('hall.delete.confirm', 'احذف القاعة')}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {problem ? (
          <div data-action="hall-delete-problem">
            <Notice tone={problem.tone} title={problem.text}>
              {problem.reread ? t('hall.delete.reread', 'قُرئ ما في القاعة من جديد، فما يظهر هنا حالها الآن.') : null}
            </Notice>
          </div>
        ) : null}
        {body}
      </div>
    </Dialog>
  );
}
