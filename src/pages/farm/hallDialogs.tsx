import { useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { localDay } from '../../domain/dates';
import { parseDayText } from '../../lib/dayText';
import { describeError } from '../../lib/errors';
import { fmtDay, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { createHall, openFlock, updateHall, type HallView, type SiteView } from '../../lib/repo/flocks';
import { hallLabel } from './shared';

// نافذتا القاعة («أضف قاعة» و«عدّل القاعة») و«افتح فوجاً»: في جدول الحقل وفي صفحة القاعة الفارغة (كلمة المالك 2026-11-16)، من مكان واحد.

const MAX_COUNT = 10_000_000;
/** عدد صحيح من نصّ أرقام بس، أو null. */
export function wholeNumber(text: string, max = MAX_COUNT): number | null {
  const value = text.trim();
  if (!/^[0-9]+$/.test(value)) return null;
  const n = Number(value); // number-ok: عدد طيور أو أيام صحيح من نصّ أرقام بس، مو فلوس
  return n <= max ? n : null;
}

export function HallDialog({ site, hall, onClose, onSaved }: { site: SiteView; hall: HallView | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [name, setName] = useState(hall?.name ?? '');
  const initialCapacity = hall?.capacity !== null && hall?.capacity !== undefined ? String(hall.capacity) : '';
  const [capacity, setCapacity] = useState(initialCapacity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capacityValue = capacity.trim() === '' ? null : wholeNumber(capacity);
  const capacityError = capacity.trim() !== '' && (capacityValue === null || capacityValue < 1) ? t('farm.hall.capacity.bad', 'اكتب السعة عدداً صحيحاً من الطيور، أو اتركها فارغة.') : null;

  const save = async () => {
    if (name.trim() === '' || capacityError) return;
    setBusy(true);
    setError(null);
    try {
      if (hall) await updateHall(hall.id, hall.version, name, capacityValue);
      else await createHall(site.id, name, capacityValue);
      toast({ tone: 'success', title: hall ? t('farm.hall.saved', 'حُفظت القاعة «{name}».', { name: name.trim() }) : t('farm.hall.added', 'أُضيفت القاعة «{name}».', { name: name.trim() }) });
      onSaved();
    } catch (failure) {
      const { title, detail } = describeError(failure);
      setError(`${title} ${detail}`);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={name !== (hall?.name ?? '') || capacity !== initialCapacity}
      title={hall ? t('farm.hall.edit.title', 'تعديل القاعة «{name}»', { name: hallLabel(hall.name) }) : t('farm.hall.add.title', 'قاعة جديدة في «{site}»', { site: site.name })}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={name.trim() === '' || Boolean(capacityError)} data-action="hall-save">
          {t('farm.hall.save', 'احفظ القاعة')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id={`${id}-name`} label={t('farm.hall.name', 'اسم القاعة')} hint={t('farm.hall.name.hint', 'مثل: قاعة 1.')}>
          <input id={`${id}-name`} className="input" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field id={`${id}-capacity`} label={t('farm.hall.capacity', 'السعة بالطيور (اختياري)')} error={capacityError}>
          <input id={`${id}-capacity`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
        </Field>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
    </Dialog>
  );
}

export function OpenFlockDialog({ hall, onClose, onOpened }: { hall: HallView; onClose: () => void; onOpened: () => void }) {
  const id = useId();
  const today = localDay();
  const initialDay = fmtDay(today);
  const [day, setDay] = useState(initialDay);
  const [count, setCount] = useState('');
  const [age, setAge] = useState('0');
  const [breed, setBreed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // مرجع واحد لكل نافذة: الإعادة بعد جواب ضاع نفس الفتح، مو فوج ثاني.
  const ref = useRef(crypto.randomUUID());

  const placedOn = parseDayText(day);
  const dayError = placedOn === null ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') : placedOn > today ? t('day.future', 'التاريخ بعد اليوم.') : null;
  const countValue = wholeNumber(count);
  const countError = count.trim() !== '' && (countValue === null || countValue < 1) ? t('farm.open.count.bad', 'اكتب عدد الطيور عدداً صحيحاً أكبر من صفر.') : null;
  const ageValue = wholeNumber(age === '' ? '0' : age, 1000);
  const ageError = ageValue === null ? t('farm.open.age.bad', 'اكتب العمر بالأيام عدداً صحيحاً من 0 إلى 1,000.') : null;
  const ready = placedOn !== null && !dayError && countValue !== null && countValue > 0 && ageValue !== null;

  const save = async () => {
    if (!ready || placedOn === null || countValue === null || ageValue === null) return;
    setBusy(true);
    setError(null);
    try {
      await openFlock({ hallId: hall.id, placedOn, placedCount: countValue, ageDays: ageValue, breed }, ref.current);
      toast({ tone: 'success', title: t('farm.open.done', 'فُتح فوج في «{hall}»؛ عدد الطيور المسكّنة {count}.', { hall: hallLabel(hall.name), count: fmtInt(countValue) }) });
      onOpened();
    } catch (failure) {
      const { title, detail } = describeError(failure);
      setError(`${title} ${detail}`);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      // أيّ خانة تغيّرت عن أوّلها كتابة لم تُحفظ (التاريخ والعدد والعمر والسلالة)، مو العدد بس.
      dirty={day !== initialDay || count !== '' || age !== '0' || breed !== ''}
      title={t('farm.open.title', 'فوج جديد في «{hall}»', { hall: hallLabel(hall.name) })}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={!ready} data-action="flock-open-save">
          {t('farm.open.save', 'افتح الفوج')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id={`${id}-day`} label={t('farm.open.day', 'تاريخ التسكين')} error={dayError} hint={t('farm.open.day.hint', 'يوم/شهر/سنة. فوج قائم يُكتب بتاريخ تسكينه الحقيقي.')}>
          <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')} value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field id={`${id}-count`} label={t('farm.open.count', 'عدد الطيور المسكّنة')} error={countError}>
          <input id={`${id}-count`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={count} onChange={(event) => setCount(event.target.value)} />
        </Field>
        <Field id={`${id}-age`} label={t('farm.open.age', 'العمر عند التسكين بالأيام')} error={ageError} hint={t('farm.open.age.hint', 'صفر لأفراخ عمر يوم.')}>
          <input id={`${id}-age`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={age} onChange={(event) => setAge(event.target.value)} />
        </Field>
        <Field id={`${id}-breed`} label={t('farm.open.breed', 'السلالة (اختياري)')}>
          <input id={`${id}-breed`} className="input" autoComplete="off" value={breed} onChange={(event) => setBreed(event.target.value)} />
        </Field>
        <p className="text-sm text-ink-muted">{t('farm.open.note', 'النسخة الأولى: الفوج يُفتح بالعدد فقط، بلا كلفة أفراخ ولا سحب من مخزن المفقس.')}</p>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
    </Dialog>
  );
}
