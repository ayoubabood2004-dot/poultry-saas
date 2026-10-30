import { addDays, localDay, type Day } from '../../domain/dates';
import { parseDayText } from '../../lib/dayText';
import { fmtDay } from '../../lib/format';
import { t } from '../../lib/i18n';
import { Field } from './Field';

// حقل اليوم (يوم/شهر/سنة) وتاريخ الترحيل (القرار 9) لكل شاشة مستند: كان بـpages/accounts/shared، فشاشات المخزون تحمّل حزمة
// الحسابات المشتركة كلّها (accounts-office) لحقل تاريخ. الحزمة المشتركة بين المسارين تبقى باسم accounts-office (vite.config.ts).

/** تاريخ الترحيل: اليوم أو قبله لحد 7 أيام (القرار 9). يرجّع اليوم أو رسالة الخطأ. */
export function postingDay(text: string, today: Day = localDay()): { day: Day | null; error: string | null } {
  const day = parseDayText(text);
  if (!day) return { day: null, error: t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') };
  if (day > today) return { day: null, error: t('day.future', 'التاريخ بعد اليوم.') };
  if (day < addDays(today, -7)) return { day: null, error: t('day.too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ {day}.', { day: fmtDay(addDays(today, -7)) }) };
  return { day, error: null };
}

export function DayField({ id, label, value, onChange, error, hint }: { id: string; label: string; value: string; onChange: (text: string) => void; error?: string | null; hint?: string }) {
  return (
    <Field id={id} label={label} error={error} hint={hint ?? t('day.hint', 'يوم/شهر/سنة.')}>
      <input id={id} inputMode="numeric" dir="ltr" autoComplete="off" placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')} className="input tabular-nums" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
