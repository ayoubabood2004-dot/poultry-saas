import { useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { localDay } from '../../domain/dates';
import { parseDayText } from '../../lib/dayText';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { createHall, openFlock, setHallSections, updateHall, type HallView, type SiteView } from '../../lib/repo/flocks';
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

/** أقسام القاعة (0038): من قاعة واحدة إلى أربعة أقسام. */
type SectionsChoice = '1' | '2' | '3' | '4';
const SECTIONS_CHOICES = (): { value: SectionsChoice; label: string }[] => [
  { value: '1', label: t('farm.hall.sections.1', 'قاعة واحدة') },
  { value: '2', label: t('farm.hall.sections.2', 'قسمان') },
  { value: '3', label: t('farm.hall.sections.3', 'ثلاثة أقسام') },
  { value: '4', label: t('farm.hall.sections.4', 'أربعة أقسام') },
];

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function failureText(failure: unknown): string {
  if (failure instanceof RejectedError && failure.hint) return failure.hint;
  const { title, detail } = describeError(failure);
  return `${title} ${detail}`;
}

/**
 * عدد كلّ قسم في قاعة مقسومة (0038، جواب المالك: يُكتب عند التسكين): خانة لكلّ قسم («عدد ق1»)، والمجموع تحتها هو العدد الداخل. values نصوص الخانات.
 */
export function SectionCountsFields({ id, values, onChange }: { id: string; values: readonly string[]; onChange: (values: string[]) => void }) {
  const counts = values.map((value) => wholeNumber(value));
  const total = counts.every((n) => n !== null) ? counts.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
  return (
    <div className="flex flex-col gap-2" data-action="section-counts">
      <div className="grid grid-cols-2 gap-3">
        {values.map((value, index) => (
          <Field
            key={index}
            id={`${id}-section-${index}`}
            label={t('farm.open.section_count', 'عدد ق{n}', { n: fmtInt(index + 1) })}
            error={value.trim() !== '' && counts[index] === null ? t('farm.open.count.bad', 'اكتب عدد الطيور عدداً صحيحاً أكبر من صفر.') : null}
          >
            <input
              id={`${id}-section-${index}`}
              className="input tabular-nums"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={value}
              onChange={(event) => onChange(values.map((old, at) => (at === index ? event.target.value : old)))}
              data-action="section-count"
            />
          </Field>
        ))}
      </div>
      <p className="text-sm" data-action="section-total">
        {total === null ? t('farm.open.sections_total_none', 'المجموع يظهر حين تُكتب أعداد الأقسام كلّها.') : t('farm.open.sections_total', 'مجموع الطيور المسكّنة: {n}', { n: fmtInt(total) })}
      </p>
    </div>
  );
}

/** أعداد الأقسام من خاناتها: كلّها أعداد صحيحة ومجموعها أكبر من صفر، أو null. */
export function sectionCountsOf(values: readonly string[]): number[] | null {
  const counts = values.map((value) => wholeNumber(value));
  if (counts.some((n) => n === null)) return null;
  const done = counts as number[];
  return done.reduce((sum, n) => sum + n, 0) > 0 ? done : null;
}

export function HallDialog({ site, hall, onClose, onSaved }: { site: SiteView; hall: HallView | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [name, setName] = useState(hall?.name ?? '');
  const initialSections = String(hall?.sections ?? 1) as SectionsChoice;
  const [sections, setSections] = useState<SectionsChoice>(initialSections);
  // مرجع واحد لتغيير الأقسام في هذه النافذة: الإعادة بعد جواب ضاع نفس التغيير.
  const sectionsRef = useRef(crypto.randomUUID());
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
      if (hall) {
        // الاسم والسعة أوّلاً بنسخة القاعة، ثمّ الأقسام بنسختها بعدهما (0038): رفضُ الأقسام (وجبة سُجّلت هلاكاتها) يُقال ويبقى ما حُفظ قبله.
        const plain = name !== hall.name || capacityValue !== hall.capacity;
        const version = plain ? await updateHall(hall.id, hall.version, name, capacityValue) : hall.version;
        if (sections !== initialSections) {
          const result = await setHallSections(hall.id, Number(sections), version, sectionsRef.current); // number-ok: عدد الأقسام من خيارات النافذة (1 إلى 4)
          if (result.status === 'stale_hall') {
            setError(t('farm.hall.sections.stale', 'تغيّرت القاعة من جهاز آخر بعد فتح هذه النافذة، فلم تتغيّر أقسامها. أغلق النافذة وافتحها من جديد.'));
            setBusy(false);
            return;
          }
        }
      } else {
        await createHall(site.id, name, capacityValue, Number(sections)); // number-ok: عدد الأقسام من خيارات النافذة (1 إلى 4)
      }
      toast({ tone: 'success', title: hall ? t('farm.hall.saved', 'حُفظت القاعة «{name}».', { name: name.trim() }) : t('farm.hall.added', 'أُضيفت القاعة «{name}».', { name: name.trim() }) });
      onSaved();
    } catch (failure) {
      setError(failureText(failure));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={name !== (hall?.name ?? '') || capacity !== initialCapacity || sections !== initialSections}
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
        {/* القاعة المقسومة (0038، جواب المالك): العلف والغاز والكاز والبيع للقاعة كلّها، والعدد والهلاكات لكلّ قسم. */}
        <div className="flex flex-col gap-2" data-action="hall-sections">
          <p className="text-sm font-medium">{t('farm.hall.sections', 'أقسام القاعة')}</p>
          <Segmented<SectionsChoice> label={t('farm.hall.sections', 'أقسام القاعة')} options={SECTIONS_CHOICES()} value={sections} onChange={setSections} />
          <p className="text-xs text-ink-muted">
            {t('farm.hall.sections.hint', 'القاعة المقسومة: العلف والغاز والكاز والبيع للقاعة كلّها، وعدد الطيور والهلاكات لكلّ قسم. تتغيّر الأقسام ما دامت وجبة القاعة بلا هلاكات مسجّلة.')}
          </p>
        </div>
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
  // قاعة مقسومة (0038): عدد لكلّ قسم بدل العدد الواحد، ومجموعها العدد الداخل.
  const split = hall.sections > 1;
  const [parts, setParts] = useState<string[]>(() => Array.from({ length: hall.sections > 1 ? hall.sections : 0 }, () => ''));
  const [age, setAge] = useState('0');
  const [breed, setBreed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // مرجع واحد لكل نافذة: الإعادة بعد جواب ضاع نفس الفتح، مو فوج ثاني.
  const ref = useRef(crypto.randomUUID());

  const placedOn = parseDayText(day);
  const dayError = placedOn === null ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') : placedOn > today ? t('day.future', 'التاريخ بعد اليوم.') : null;
  const sectionCounts = split ? sectionCountsOf(parts) : null;
  const countValue = split ? (sectionCounts ? sectionCounts.reduce((sum, n) => sum + n, 0) : null) : wholeNumber(count);
  const countError = !split && count.trim() !== '' && (countValue === null || countValue < 1) ? t('farm.open.count.bad', 'اكتب عدد الطيور عدداً صحيحاً أكبر من صفر.') : null;
  const ageValue = wholeNumber(age === '' ? '0' : age, 1000);
  const ageError = ageValue === null ? t('farm.open.age.bad', 'اكتب العمر بالأيام عدداً صحيحاً من 0 إلى 1,000.') : null;
  const ready = placedOn !== null && !dayError && countValue !== null && countValue > 0 && ageValue !== null;

  const save = async () => {
    if (!ready || placedOn === null || countValue === null || ageValue === null) return;
    setBusy(true);
    setError(null);
    try {
      await openFlock({ hallId: hall.id, placedOn, placedCount: countValue, ageDays: ageValue, breed, ...(sectionCounts ? { sectionCounts } : {}) }, ref.current);
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
      dirty={day !== initialDay || count !== '' || parts.some((part) => part !== '') || age !== '0' || breed !== ''}
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
        <p className="text-sm text-ink-muted">{t('farm.open.note', 'النسخة الأولى: الفوج يُفتح بالعدد فقط، بلا كلفة أفراخ ولا سحب من مخزن المفقس.')}</p>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
    </Dialog>
  );
}
