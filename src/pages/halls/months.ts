import type { Day } from '../../domain/dates';
import { t } from '../../lib/i18n';

// الشهر بالتقويم الميلاديّ (أسماؤه كما في العراق) للتقويم الشهريّ (CalendarPage) وجدول اللقاحات بالأشهر الحقيقية (VaccinesPage، كلمة الزبون
// 2026-11-16: «جدول رزنامة اشهر حقيقية… وبداخل المربعات ترقيمات الايام من اليوم الي اني بديت حسب العمر»).

/** الشهر «YYYY-MM». */
export type Month = string;

export const monthOf = (day: Day): Month => day.slice(0, 7);
export const pad2 = (n: number): string => `${n < 10 ? '0' : ''}${n}`;
export const monthIndex = (month: Month): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
/** الشهر بعد by شهراً (سالب للخلف). */
export const shiftMonth = (month: Month, by: number): Month => {
  const index = monthIndex(month) + by;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
};
/** ترتيب اليوم في الأسبوع والسبت أوّله (0) والجمعة آخره (6). */
export const weekdayOf = (day: Day): number => (new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay() + 1) % 7;
export const dayNumber = (day: Day): number => Number(day.slice(8, 10));

export const MONTH_NAMES = (): readonly string[] => [
  t('millrep.month.01', 'كانون الثاني'),
  t('millrep.month.02', 'شباط'),
  t('millrep.month.03', 'آذار'),
  t('millrep.month.04', 'نيسان'),
  t('millrep.month.05', 'أيار'),
  t('millrep.month.06', 'حزيران'),
  t('millrep.month.07', 'تموز'),
  t('millrep.month.08', 'آب'),
  t('millrep.month.09', 'أيلول'),
  t('millrep.month.10', 'تشرين الأول'),
  t('millrep.month.11', 'تشرين الثاني'),
  t('millrep.month.12', 'كانون الأول'),
];
/** الشهر وسنته («تشرين الثاني 2026»): السنة نصّ لا رقم بفواصل. */
export const monthLabel = (month: Month): string => t('millrep.month.label', '{name} {year}', { name: MONTH_NAMES()[Number(month.slice(5, 7)) - 1] ?? month, year: month.slice(0, 4) });
export const WEEKDAYS = (): readonly string[] => [
  t('millrep.wd.sat', 'السبت'),
  t('millrep.wd.sun', 'الأحد'),
  t('millrep.wd.mon', 'الاثنين'),
  t('millrep.wd.tue', 'الثلاثاء'),
  t('millrep.wd.wed', 'الأربعاء'),
  t('millrep.wd.thu', 'الخميس'),
  t('millrep.wd.fri', 'الجمعة'),
];

/** أيّام الشهر كلّها بتواريخها، من الأوّل إلى آخره. */
export function monthDays(month: Month): Day[] {
  const next = shiftMonth(month, 1);
  const last = Number(new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, 0)).getUTCDate());
  return Array.from({ length: last }, (_, index) => `${month}-${pad2(index + 1)}`);
}

/** الأشهر من شهر first إلى شهر last بترتيبها (فارغة إن سبق last first). */
export function monthsBetween(first: Day, last: Day): Month[] {
  const from = monthIndex(monthOf(first));
  const to = monthIndex(monthOf(last));
  return to < from ? [] : Array.from({ length: to - from + 1 }, (_, index) => shiftMonth(monthOf(first), index));
}
