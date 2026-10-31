import { decimalText, parseDecimal, toScale } from './decimal';

// خانات الجولة اليومية (FOUNDATION ٣٨٤ و٥٧٨، والقاعدتان 28 و32) منطقاً صافياً: نصّ الخانة ← قيمة الحمولة، والفحص قبل الحفظ
// (الجهاز يمنع نافقاً ومستبعداً أكثر من الحيّ، FOUNDATION ٢١٧). المرحلة 2، النسخة الأولى (كلمة المالك 2026-10-31).

export type FlockKind = 'broiler' | 'layer';

/** خانات الجولة نصّاً كما انكتبت: '' = «بلا تغيير» (null بالحمولة)، و0 = صفر. */
export interface RoundText {
  dead: string;
  culled: string;
  feedKg: string;
  waterL: string;
  eggsTotal: string;
  eggsBroken: string;
}

export const EMPTY_ROUND: RoundText = { dead: '', culled: '', feedKg: '', waterL: '', eggsTotal: '', eggsBroken: '' };

/** حمولة save_flock_day (مفاتيح FlockDayPayload بالطابور): العدد رقم صحيح، والعلف والماء نصّ عشري بثلاث مراتب. */
export interface RoundPayload {
  dead: number | null;
  culled: number | null;
  feed_kg: string | null;
  water_l: string | null;
  eggs_total: number | null;
  eggs_broken: number | null;
}

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

/** القيمة النافذة لخانة: المكتوبة، وإلا المحفوظة. */
const effective = (typed: number | null, saved: number | null) => typed ?? saved ?? 0;

/**
 * نصّ الجولة ← الحمولة، أو أوّل خطأ. saved = خانات اليوم المحفوظة (أو المنتظرة بالجهاز)، وliveStart = الحيّ بداية اليوم: النافق
 * والمستبعد مجموع اليوم، فالحيّ بعدهما ما ينزل تحت الصفر؛ والبيض للبيّاض بس، والمكسور ما يتجاوز المجموع، والمجموع ما يتجاوز الحيّ
 * بداية اليوم (فوك ١٠٠٪ غلط إدخال، القاعدة 32).
 */
export function readRound(
  text: RoundText,
  context: { kind: FlockKind; liveStart: number; saved: { dead: number | null; culled: number | null; eggsTotal: number | null; eggsBroken: number | null } },
): { payload: RoundPayload } | { error: RoundError; field: keyof RoundText } {
  const dead = count(text.dead);
  if (dead === 'bad') return { error: 'bad_count', field: 'dead' };
  const culled = count(text.culled);
  if (culled === 'bad') return { error: 'bad_count', field: 'culled' };
  const feed = amount(text.feedKg);
  if (feed === 'bad') return { error: 'bad_amount', field: 'feedKg' };
  const water = amount(text.waterL);
  if (water === 'bad') return { error: 'bad_amount', field: 'waterL' };
  const eggsTotal = count(text.eggsTotal);
  if (eggsTotal === 'bad') return { error: 'bad_count', field: 'eggsTotal' };
  const eggsBroken = count(text.eggsBroken);
  if (eggsBroken === 'bad') return { error: 'bad_count', field: 'eggsBroken' };
  const { kind, liveStart, saved } = context;
  if (effective(dead, saved.dead) + effective(culled, saved.culled) > liveStart) return { error: 'live_negative', field: dead !== null ? 'dead' : 'culled' };
  if (kind === 'broiler' && (eggsTotal !== null || eggsBroken !== null)) return { error: 'eggs_on_broiler', field: 'eggsTotal' };
  const total = eggsTotal ?? saved.eggsTotal;
  if ((eggsBroken ?? saved.eggsBroken) !== null && total === null) return { error: 'eggs_need_total', field: 'eggsTotal' };
  if (total !== null && effective(eggsBroken, saved.eggsBroken) > total) return { error: 'eggs_over_total', field: 'eggsBroken' };
  if (eggsTotal !== null && eggsTotal > liveStart) return { error: 'eggs_over_live', field: 'eggsTotal' };
  return { payload: { dead, culled, feed_kg: feed, water_l: water, eggs_total: eggsTotal, eggs_broken: eggsBroken } };
}

/** الحمولة ما بيها تغيير (كل الخانات فارغة). */
export const emptyPayload = (payload: RoundPayload): boolean => Object.values(payload).every((value) => value === null);
