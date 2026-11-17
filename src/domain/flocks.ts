import { decimalText, parseDecimal, toScale } from './decimal';

// خانات الجولة اليومية (FOUNDATION ٣٨٤ و٥٧٨، والقاعدتان 28 و32) منطقاً صافياً: نصّ الخانة ← قيمة الزيارة، والفحص قبل الحفظ
// (الجهاز يمنع نافقاً ومستبعداً أكثر من الحيّ، FOUNDATION ٢١٧). المرحلة 2، النسخة الأولى (كلمة المالك 2026-10-31)؛ ومنذ 0032 (كلمة
// المالك 2026-11-17) الجولة زيارات تُضاف إلى مجموع اليوم: الفحص على المجموع بعد الزيارة.
// والماء خارج الجولة (كلمة المالك 2026-11-11: الماء ثابت): عمود القاعدة باقٍ لبيانات قديمة، والزيارة لا ترسل ماءً (عمليات قديمة
// بالطابور تحمله تُرسل كما هي).

export type FlockKind = 'broiler' | 'layer';

/** خانات الزيارة نصّاً كما انكتبت: '' = فارغة (لا شيء يُضاف)، و0 = صفر. */
export interface RoundText {
  dead: string;
  culled: string;
  feedKg: string;
  eggsTotal: string;
  eggsBroken: string;
}

export const EMPTY_ROUND: RoundText = { dead: '', culled: '', feedKg: '', eggsTotal: '', eggsBroken: '' };

export type RoundError = 'bad_count' | 'bad_amount' | 'live_negative' | 'eggs_need_total' | 'eggs_over_total' | 'eggs_over_live' | 'eggs_on_broiler';

const MAX_COUNT = 10_000_000;

function count(text: string): number | null | 'bad' {
  const value = text.trim();
  if (value === '') return null;
  if (!/^[0-9]+$/.test(value)) return 'bad';
  const n = Number(value); // number-ok: عدد طيور أو بيض صحيح من نصّ أرقام بس، تحت عشرة ملايين، مو فلوس
  return n > MAX_COUNT ? 'bad' : n;
}

function amount(text: string): string | null | 'bad' {
  const value = text.trim();
  if (value === '') return null;
  const parsed = parseDecimal(value, 3);
  if (parsed === null || parsed.units < 0n) return 'bad';
  return decimalText(toScale(parsed, 3), 3);
}

/**
 * محتوى زيارة من خاناتها: كلّ خانة فارغة null («لم يُسجَّل في هذه الزيارة»)، والصفر المكتوب صفر — «زرت القاعة ولا نافق» زيارةٌ تُسجَّل فتصير جولة
 * اليوم «سُجّلت» كما كانت بالمجموع (الخادم يعدّ null صفراً في العمود ويرفض الزيارة بلا أيّ خانة empty_visit). العلف نصّ بثلاث مراتب.
 */
export interface VisitValues {
  dead: number | null;
  culled: number | null;
  feed_kg: string | null;
  eggs_total: number | null;
  eggs_broken: number | null;
}

/** مجموع اليوم قبل الزيارة (المحفوظ وما على الجهاز، أو المجموع بلا الزيارة المعدَّلة): أساس فحص الحيّ والبيض بعدها. */
export interface DayTotals {
  dead: number;
  culled: number;
  eggsTotal: number | null;
}

/**
 * نصّ زيارة ← محتواها، أو أوّل خطأ. الفحوص على مجموع اليوم بعد الزيارة كما يفحصه الخادم (save_flock_visit): النافق والمستبعد معاً لا
 * يتجاوزان الحيّ بداية اليوم، والبيض للبيّاض بس ولا يتجاوز مجموعه الحيّ (فوق ١٠٠٪ غلط إدخال، القاعدة 32)؛ والمكسور يحتاج مجموع البيض ولا
 * يزيد عليه في الزيارة نفسها.
 */
export function readVisit(text: RoundText, context: { kind: FlockKind; liveStart: number; totals: DayTotals }): { values: VisitValues } | { error: RoundError; field: keyof RoundText } {
  const dead = count(text.dead);
  if (dead === 'bad') return { error: 'bad_count', field: 'dead' };
  const culled = count(text.culled);
  if (culled === 'bad') return { error: 'bad_count', field: 'culled' };
  const feed = amount(text.feedKg);
  if (feed === 'bad') return { error: 'bad_amount', field: 'feedKg' };
  const eggsTotal = count(text.eggsTotal);
  if (eggsTotal === 'bad') return { error: 'bad_count', field: 'eggsTotal' };
  const eggsBroken = count(text.eggsBroken);
  if (eggsBroken === 'bad') return { error: 'bad_count', field: 'eggsBroken' };
  const { kind, liveStart, totals } = context;
  if (totals.dead + totals.culled + (dead ?? 0) + (culled ?? 0) > liveStart) return { error: 'live_negative', field: dead ? 'dead' : 'culled' };
  if (kind === 'broiler' && (eggsTotal !== null || eggsBroken !== null)) return { error: 'eggs_on_broiler', field: 'eggsTotal' };
  if (eggsBroken !== null && eggsTotal === null) return { error: 'eggs_need_total', field: 'eggsTotal' };
  if (eggsTotal !== null && (eggsBroken ?? 0) > eggsTotal) return { error: 'eggs_over_total', field: 'eggsBroken' };
  if (eggsTotal !== null && (totals.eggsTotal ?? 0) + eggsTotal > liveStart) return { error: 'eggs_over_live', field: 'eggsTotal' };
  return { values: { dead, culled, feed_kg: feed, eggs_total: eggsTotal, eggs_broken: eggsBroken } };
}

/** زيارة بلا أيّ خانة مكتوبة (الخادم يرفضها empty_visit). الصفر المكتوب خانة: «لا نافق» يُسجَّل. */
export const emptyVisit = (values: VisitValues): boolean => values.dead === null && values.culled === null && values.feed_kg === null && values.eggs_total === null && values.eggs_broken === null;

/** في الخانات شيء مكتوب. */
export const typedRound = (text: RoundText): boolean => Object.values(text).some((value) => value.trim() !== '');
