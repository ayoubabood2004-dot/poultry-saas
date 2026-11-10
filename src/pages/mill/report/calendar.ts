import type { Day } from '../../../domain/dates';
import { roundHalfAway, type Milli } from '../../../domain/money';
import { countForm, fmtDay, fmtMilli, fmtQty } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { ReportDay } from '../../../lib/repo/millReport';

// تقويم تقرير العليقة (0023، كلمة المالك 2026-11-10): الشهر نصّ YYYY-MM والسنة نصّ YYYY واليوم YYYY-MM-DD، فلا تُعرض سنة بفواصل آلاف
// («2,026») ولا يُحوَّل يوم من ISO (date-guard). أسماء الأشهر كما تُكتب في العراق (كانون الثاني… كانون الأول)، والأسبوع يبدأ بالسبت.
// ودرجة اللون من حجم الإنتاج نسبةً إلى أكبره في العرض (أكبر شهر في السنة، أو أكبر يوم في الشهر): أربع درجات هادئة من لون العلامة.

/** شهر بشكل YYYY-MM. */
export type Month = string;

const YEAR_SHAPE = /^20\d\d$/u;
const MONTH_SHAPE = /^20\d\d-(?:0[1-9]|1[0-2])$/u;
const DAY_SHAPE = /^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;

const yearNum = (value: string): number => Number(value.slice(0, 4));
const monthNum = (value: string): number => Number(value.slice(5, 7));
const dateNum = (day: Day): number => Number(day.slice(8, 10));
const pad2 = (n: number): string => `${n < 10 ? '0' : ''}${n}`;

/** عدد أيام الشهر (اليوم صفر من الشهر التالي آخر يوم فيه). */
export function daysInMonth(month: Month): number {
  return new Date(Date.UTC(yearNum(month), monthNum(month), 0)).getUTCDate();
}

/** سنة من الرابط (2000–2099)، وإلّا null. */
export const yearParam = (value: string | null): string | null => (value !== null && YEAR_SHAPE.test(value) ? value : null);
/** شهر من الرابط، وإلّا null. */
export const monthParam = (value: string | null): Month | null => (value !== null && MONTH_SHAPE.test(value) ? value : null);
/** يوم موجود في التقويم من الرابط (لا 30 شباط)، وإلّا null. */
export const dayParam = (value: string | null): Day | null =>
  value !== null && DAY_SHAPE.test(value) && dateNum(value) <= daysInMonth(value.slice(0, 7)) ? value : null;

export const monthOf = (day: Day): Month => day.slice(0, 7);
export const yearOf = (value: string): string => value.slice(0, 4);

/** أيام الشهر بالترتيب. */
export function monthDays(month: Month): Day[] {
  return Array.from({ length: daysInMonth(month) }, (_, index) => `${month}-${pad2(index + 1)}`);
}

/** أشهر السنة الاثنا عشر بالترتيب. */
export function monthsOf(year: string): Month[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${pad2(index + 1)}`);
}

export const yearRange = (year: string): { from: Day; to: Day } => ({ from: `${year}-01-01`, to: `${year}-12-31` });
export const monthRange = (month: Month): { from: Day; to: Day } => ({ from: `${month}-01`, to: `${month}-${pad2(daysInMonth(month))}` });

/** الشهر بعد by شهراً (سالب للخلف). */
export function shiftMonth(month: Month, by: number): Month {
  const index = yearNum(month) * 12 + monthNum(month) - 1 + by;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/** ترتيب اليوم في الأسبوع والسبت أوّله (0) والجمعة آخره (6). */
export function weekdayOf(day: Day): number {
  return (new Date(Date.UTC(yearNum(day), monthNum(day) - 1, dateNum(day))).getUTCDay() + 1) % 7;
}

/** رقم اليوم في شهره (1–31). */
export const dayNumber = (day: Day): number => dateNum(day);

const MONTH_NAMES = (): readonly string[] => [
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

/** اسم الشهر وحده («تشرين الثاني»). */
export const monthName = (month: Month): string => MONTH_NAMES()[monthNum(month) - 1] ?? month;

/** الشهر وسنته («تشرين الثاني 2026»). */
export const monthLabel = (month: Month): string => t('millrep.month.label', '{name} {year}', { name: monthName(month), year: yearOf(month) });

export interface Weekday {
  /** للهاتف: «سبت». */
  short: string;
  long: string;
}

/** أيام الأسبوع من السبت. */
export const weekdays = (): readonly Weekday[] => [
  { short: t('millrep.wd.sat.short', 'سبت'), long: t('millrep.wd.sat', 'السبت') },
  { short: t('millrep.wd.sun.short', 'أحد'), long: t('millrep.wd.sun', 'الأحد') },
  { short: t('millrep.wd.mon.short', 'اثنين'), long: t('millrep.wd.mon', 'الاثنين') },
  { short: t('millrep.wd.tue.short', 'ثلاثاء'), long: t('millrep.wd.tue', 'الثلاثاء') },
  { short: t('millrep.wd.wed.short', 'أربعاء'), long: t('millrep.wd.wed', 'الأربعاء') },
  { short: t('millrep.wd.thu.short', 'خميس'), long: t('millrep.wd.thu', 'الخميس') },
  { short: t('millrep.wd.fri.short', 'جمعة'), long: t('millrep.wd.fri', 'الجمعة') },
];

/** اليوم باسمه وتاريخه («الأربعاء 04/11/2026»). */
export const dayLabel = (day: Day): string => t('millrep.day.label', '{weekday} {date}', { weekday: weekdays()[weekdayOf(day)]?.long ?? '', date: fmtDay(day) });

/** عدد الدفعات بصيغة العدد في الفصحى: «دفعة واحدة»، «دفعتان»، «3 دفعات»، «11 دفعة». */
export function batchesText(n: number): string {
  if (n === 0) return t('millrep.batches.none', 'لا دفعات');
  if (n === 1) return t('millrep.batches.one', 'دفعة واحدة');
  if (n === 2) return t('millrep.batches.two', 'دفعتان');
  return countForm(n) === 'few' ? t('millrep.batches.few', '{n} دفعات', { n }) : t('millrep.batches.many', '{n} دفعة', { n });
}

/** الكمية للبلاطة والملخّص: من الطنّ «6.120 طن» وتحته «850 كغم». */
export const qtyText = (kg: Milli): string => fmtQty(kg, 'kg').main;

/** الطنّ مختصراً لخليّة اليوم الصغيرة («2»، «0.986»): بالآلاف من الطنّ (الكيلوغرام) مقرَّبةً مرّة واحدة بـroundHalfAway، والوحدة في الدليل. */
export const tonsShort = (kg: Milli): string => fmtMilli(roundHalfAway(kg, 1000n));

export interface Produced {
  batches: number;
  outputKg: Milli;
}

/** مجموع الأيام لكلّ شهر. */
export function byMonth(days: readonly ReportDay[]): Map<Month, Produced> {
  const months = new Map<Month, Produced>();
  for (const entry of days) {
    const month = monthOf(entry.day);
    const sum = months.get(month) ?? { batches: 0, outputKg: 0n };
    months.set(month, { batches: sum.batches + entry.batches, outputKg: sum.outputKg + entry.outputKg });
  }
  return months;
}

/** مجموع أيام شهر واحد، أو null بلا إنتاج فيه. */
export function monthTotal(days: readonly ReportDay[], month: Month): Produced | null {
  return byMonth(days).get(month) ?? null;
}

export type Level = 0 | 1 | 2 | 3 | 4;
export const LEVELS: readonly Exclude<Level, 0>[] = [1, 2, 3, 4];

/** درجة اللون (1–4) من الحجم نسبةً إلى أكبر حجم في العرض، و0 بلا إنتاج: الأكبر 4 دائماً، وكلّ ربع درجة. */
export function levelOf(value: bigint, max: bigint): Level {
  if (value <= 0n || max <= 0n) return 0;
  const step = (value * 4n + max - 1n) / max;
  return step >= 4n ? 4 : step <= 1n ? 1 : step === 2n ? 2 : 3;
}

/** شفافية كلّ درجة من لون العلامة (لون حلقة التركيز: يتبدّل مع الوضع الداكن)، فيبقى النصّ مقروءاً بلونه في الوضعين. */
// الأولى 0.16 لا أقلّ (بـChromium كانت 0.12 قريبة من لون السطح المحايد للشهر الفارغ)، والرابعة 0.6 لا أكثر (النصّ الفاتح فوقها في الوضع الداكن).
const ALPHA: Readonly<Record<Exclude<Level, 0>, string>> = { 1: '0.16', 2: '0.3', 3: '0.45', 4: '0.6' };

/** لون الدرجة، أو undefined بلا إنتاج (يبقى لون السطح المحايد). */
export const tintOf = (level: Level): string | undefined => (level === 0 ? undefined : `rgb(var(--ring) / ${ALPHA[level]})`);

/** إطار «اليوم» و«هذا الشهر» بلون العلامة (ظلّ داخليّ، بلا صنف جديد في CSS الإقلاع). */
export const NOW_RING = 'inset 0 0 0 2px rgb(var(--ring))';
