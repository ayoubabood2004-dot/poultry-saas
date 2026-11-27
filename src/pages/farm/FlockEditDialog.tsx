import { useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { localDay } from '../../domain/dates';
import { parseDayText } from '../../lib/dayText';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { deleteFlock, editFlock } from '../../lib/repo/flockEdits';
import type { FlockSummary } from '../../lib/repo/flocks';
import { SectionCountsFields, sectionCountsOf } from './hallDialogs';

// تعديل الفوج وحذفه (0028، كلمة الزبون 2026-11-15: «قاعة 5: أدخلت الفوج وغلطت بتاريخ التسكين ولا أستطيع تعديله… كلّ خطوة تحتاج
// تعديلاً»): نافذة واحدة لجدول الحقل وشاشة الفوج، للمدير والمالك (flock.manage، والمنع الحقيقي بالخادم). التاريخ والعدد والعمر عند التسكين
// والسلالة تبدأ بقيمها المحفوظة، والحفظ edit_flock بنسخة الفوج ومرجع واحد للنافذة (الإعادة بعد جواب ضاع = التعديل نفسه)؛ والحذف لفوج فُتح
// غلطاً بلا أيّ سجلّ، بتأكيد يسمّيه وأثره ومرجعه الواحد.

const MAX_COUNT = 10_000_000;
/** عدد صحيح من نصّ أرقام بس، أو null (كنوافذ الحقل: القاعة والفتح). */
function wholeNumber(text: string, max = MAX_COUNT): number | null {
  const value = text.trim();
  if (!/^[0-9]+$/.test(value)) return null;
  const n = Number(value); // number-ok: عدد طيور أو أيام صحيح من نصّ أرقام بس، مو فلوس
  return n <= max ? n : null;
}

/**
 * رفوض تعني أنّ ما تعرضه الصفحة قديم: نسخة الفوج تغيّرت بعد فتح النافذة، أو أُغلق أو حُذف من جهاز آخر، أو مرجع النافذة استُعمل لقيم
 * أخرى بعد جواب ضاع (فقد يكون التعديل الأوّل حُفظ). الصفحة تقرأ من جديد، والتلميح يبقى في النافذة لتُفتح من جديد بالقيم الحالية.
 */
const REREAD: ReadonlySet<string> = new Set(['stale_flock', 'flock_not_found', 'flock_closed', 'ref_reused']);

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function problemText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

export interface FlockEditDialogProps {
  hallName: string;
  /** الفوج كما قُرئ (القيم الأولى ونسخته للحفظ والحذف). */
  flock: FlockSummary;
  onClose: () => void;
  /** حُفظ التعديل: أغلق النافذة واقرأ من جديد. */
  onSaved: () => void;
  /** حُذف الفوج (أو كان محذوفاً قبلاً): جدول الحقل يقرأ من جديد، وشاشة الفوج ترجع إلى الحقل. */
  onDeleted: () => void;
  /** ما تعرضه الصفحة قديم (REREAD): اقرأ من جديد والنافذة باقية بالتلميح. */
  onStale: () => void;
}

export function FlockEditDialog({ hallName, flock, onClose, onSaved, onDeleted, onStale }: FlockEditDialogProps) {
  const id = useId();
  const today = localDay();
  const initialDay = flock.placedOn === null ? '' : fmtDay(flock.placedOn);
  const initialCount = flock.placedCount === null ? '' : String(flock.placedCount);
  const initialAge = flock.ageDaysAtPlacement === null ? '' : String(flock.ageDaysAtPlacement);
  const initialBreed = flock.breed ?? '';
  const [day, setDay] = useState(initialDay);
  const [count, setCount] = useState(initialCount);
  // وجبة مقسومة (0038): عدد كلّ قسم بدل العدد الواحد، ومجموعها العدد الداخل.
  const initialParts = (flock.sectionCounts ?? []).map((n) => String(n)); // number-ok: عدد قسم نصّاً في خانته للتعديل، لا عرض
  const [parts, setParts] = useState<string[]>(initialParts);
  const split = initialParts.length > 0;
  const [age, setAge] = useState(initialAge);
  const [breed, setBreed] = useState(initialBreed);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // مرجع واحد لكلّ نافذة لكلّ فعل: الإعادة بعد جواب ضاع نفس التعديل أو الحذف، مو عملية ثانية.
  const editRef = useRef(crypto.randomUUID());
  const deleteRef = useRef(crypto.randomUUID());

  const placedOn = parseDayText(day);
  const dayError = placedOn === null ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') : placedOn > today ? t('day.future', 'التاريخ بعد اليوم.') : null;
  const sectionCounts = split ? sectionCountsOf(parts) : null;
  const countValue = split ? (sectionCounts ? sectionCounts.reduce((sum, n) => sum + n, 0) : null) : wholeNumber(count);
  const countError = !split && count.trim() !== '' && (countValue === null || countValue < 1) ? t('farm.open.count.bad', 'اكتب عدد الطيور عدداً صحيحاً أكبر من صفر.') : null;
  const partsChanged = split && parts.some((part, index) => part !== initialParts[index]);
  // الفارغ صفر كما في نافذة الفتح («صفر لأفراخ عمر يوم»).
  const ageValue = wholeNumber(age === '' ? '0' : age, 1000);
  const ageError = ageValue === null ? t('farm.open.age.bad', 'اكتب العمر بالأيام عدداً صحيحاً من 0 إلى 1,000.') : null;
  // بلا تغيير عن المحفوظ لا حفظ: لا نداء يرجع «لم يتغيّر شيء».
  const changed = placedOn !== flock.placedOn || countValue !== flock.placedCount || partsChanged || ageValue !== flock.ageDaysAtPlacement || breed.trim() !== initialBreed;
  const ready = placedOn !== null && !dayError && countValue !== null && countValue > 0 && ageValue !== null && changed;

  const fail = (failure: unknown) => {
    setError(problemText(failure));
    setConfirming(false);
    setBusy(null);
    if (failure instanceof RejectedError && REREAD.has(failure.code)) onStale();
  };

  const save = async () => {
    if (!ready || placedOn === null || countValue === null || ageValue === null) return;
    setBusy('save');
    setError(null);
    try {
      const saved = await editFlock(
        { flockId: flock.id, expectedVersion: flock.version, placedOn, placedCount: countValue, ageDays: ageValue, breed, ...(sectionCounts && partsChanged ? { sectionCounts } : {}) },
        editRef.current,
      );
      toast({ tone: 'success', title: t('farm.flock.edit.done', 'حُفظ تعديل فوج «{hall}»: التسكين {date} بعدد {count}.', { hall: hallName, date: fmtDay(saved.placedOn), count: fmtInt(saved.placedCount) }) });
      onSaved();
    } catch (failure) {
      fail(failure);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setError(null);
    try {
      const { deleted } = await deleteFlock(flock.id, flock.version, deleteRef.current);
      toast(
        deleted
          ? { tone: 'success', title: t('farm.flock.delete.done', 'حُذف فوج «{hall}»، والقاعة فارغة الآن.', { hall: hallName }) }
          : { tone: 'info', title: t('farm.flock.delete.gone', 'فوج «{hall}» محذوف من قبل، فلم يتغيّر شيء.', { hall: hallName }) },
      );
      onDeleted();
    } catch (failure) {
      fail(failure);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy !== null}
      dirty={day !== initialDay || count !== initialCount || partsChanged || age !== initialAge || breed !== initialBreed}
      title={t('farm.flock.edit.title', 'تعديل فوج «{hall}»', { hall: hallName })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            data-action="flock-delete"
          >
            {t('farm.flock.delete', 'احذف الفوج')}
          </Button>
          <Button onClick={() => void save()} busy={busy === 'save'} disabled={!ready || busy !== null} data-action="flock-edit-save">
            {t('farm.flock.edit.save', 'احفظ التعديل')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id={`${id}-day`} label={t('farm.open.day', 'تاريخ التسكين')} error={dayError} hint={t('farm.flock.edit.day.hint', 'يوم/شهر/سنة، ولا يكون بعد أوّل يوم سُجّل فيه شيء لهذا الفوج.')}>
          <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')} value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        {split ? (
          <SectionCountsFields id={id} values={parts} onChange={setParts} />
        ) : (
          <Field id={`${id}-count`} label={t('farm.open.count', 'عدد الطيور المسكّنة')} error={countError}>
            <input id={`${id}-count`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={count} onChange={(event) => setCount(event.target.value)} />
          </Field>
        )}
        <Field id={`${id}-age`} label={t('farm.open.age', 'العمر عند التسكين بالأيام')} error={ageError} hint={t('farm.open.age.hint', 'صفر لأفراخ عمر يوم.')}>
          <input id={`${id}-age`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={age} onChange={(event) => setAge(event.target.value)} />
        </Field>
        <Field id={`${id}-breed`} label={t('farm.open.breed', 'السلالة (اختياري)')}>
          <input id={`${id}-breed`} className="input" autoComplete="off" value={breed} onChange={(event) => setBreed(event.target.value)} />
        </Field>
        <p className="text-sm text-ink-muted">{t('farm.flock.edit.note', 'عمر الفوج ومواعيد لقاحاته وتقاريره تُحسب من التاريخ والعمر الجديدين.')}</p>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('farm.flock.delete.title', 'حذف فوج «{hall}»؟', { hall: hallName })}
        consequence={t('farm.flock.delete.consequence', 'يُحذف الفوج المسكَّن في {date} بعدد {count} وتصير القاعة فارغة، فتفتح فيها فوجاً بالتاريخ الصحيح. لا يُحذف فوج له سجلّ (جولة يومية أو صرف أو وزن أو دواء أو لقاح): عدّل تاريخه وعدده بدل ذلك.', {
          date: flock.placedOn === null ? '—' : fmtDay(flock.placedOn),
          count: flock.placedCount === null ? '—' : fmtInt(flock.placedCount),
        })}
        confirmLabel={t('farm.flock.delete', 'احذف الفوج')}
        busy={busy === 'delete'}
        action="flock-delete-confirm"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void remove()}
      />
    </Dialog>
  );
}
