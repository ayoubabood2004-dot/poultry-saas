import { parseDecimal, toScale, type Decimal } from './decimal';
import { MILLI_PER_UNIT, roundHalfAway, type Milli } from './money';

// الرصيد والحركات دائماً بوحدة الأساس: كغم للصلب، لتر للسائل، قطعة للمعدود.
// الكيس والبرميل والقنينة والطبقة والكارتون وحدات إدخال وعرض بمعامل لكل مادّة (item_units)،
// والمعامل ينحفظ على السطر لحظة الإدخال: تعديل وزن الكيس بعدين ما يغيّر سطراً قديماً.

export type BaseUnit = 'kg' | 'L' | 'pc';
export type UnitCode = 'kg' | 'g' | 't' | 'L' | 'mL' | 'pc';
export type Dimension = 'mass' | 'volume' | 'count';

/** جدول units العام الثابت (بلا org_id). المعامل لوحدة الأساس بالآلاف. الطن 1000 كغم ثابت. */
export const UNITS: Readonly<Record<UnitCode, { dimension: Dimension; base: BaseUnit; factor: Milli }>> = {
  kg: { dimension: 'mass', base: 'kg', factor: 1000n },
  g: { dimension: 'mass', base: 'kg', factor: 1n },
  t: { dimension: 'mass', base: 'kg', factor: 1_000_000n },
  L: { dimension: 'volume', base: 'L', factor: 1000n },
  mL: { dimension: 'volume', base: 'L', factor: 1n },
  pc: { dimension: 'count', base: 'pc', factor: 1000n },
};

/** كمية من نصّ المستخدم لثلاث مراتب كحدّ أقصى (غرام، ملليلتر)، أو null. */
export function parseQty(input: string): Milli | null {
  const value = parseDecimal(input, 3);
  return value === null ? null : toScale(value, 3);
}

/** معامل وحدة إدخال («كيس 50 كغم» = 50) من نصّ، موجب، أو null. */
export function parseFactor(input: string): Decimal | null {
  const value = parseDecimal(input, 6);
  return value !== null && value.units > 0n ? value : null;
}

export type BaseResult = { ok: true; qty: Milli } | { ok: false; reason: 'pieces_not_whole' };

/** qty_base = round3(qty_in_unit × factor). القطع لازم عدد صحيح، وإلا رفض. */
export function toBase(qtyInUnit: Milli, factor: Decimal, base: BaseUnit): BaseResult {
  if (factor.units <= 0n) throw new RangeError('factor_not_positive');
  const qty = roundHalfAway(qtyInUnit * factor.units, 10n ** BigInt(factor.scale));
  if (base === 'pc' && qty % MILLI_PER_UNIT !== 0n) return { ok: false, reason: 'pieces_not_whole' };
  return { ok: true, qty };
}

/** الكثافة كغم/لتر بأربع مراتب كحدّ أقصى، مخزونة بوحدة ١/١٠٠٠٠ (0.92 ← 9200). */
export type Density = bigint;
export const DENSITY_SCALE = 10_000n;

export function parseDensity(input: string): Density | null {
  const value = parseDecimal(input, 4);
  return value !== null && value.units > 0n ? toScale(value, 4) : null;
}

/** kg = round3(L × density). */
export function litersToKg(liters: Milli, density: Density): Milli {
  if (density <= 0n) throw new RangeError('density_not_positive');
  return roundHalfAway(liters * density, DENSITY_SCALE);
}

/** L = round3(kg ÷ density). */
export function kgToLiters(kg: Milli, density: Density): Milli {
  if (density <= 0n) throw new RangeError('density_not_positive');
  return roundHalfAway(kg * DENSITY_SCALE, density);
}

/** يقرّب كمية لخطوة عدّاد المادّة (scale_step، افتراضه 0.1). */
export function roundToStep(qty: Milli, step: Milli): Milli {
  if (step <= 0n) throw new RangeError('step_not_positive');
  return roundHalfAway(qty, step) * step;
}

/** يقسم كمية على وحدة تعبئة: 2,370 كغم بكيس 50 ← 47 كيس + 20 كغم. */
export function splitPacks(qty: Milli, packFactor: Milli): { packs: bigint; rest: Milli } {
  if (packFactor <= 0n) throw new RangeError('pack_not_positive');
  const negative = qty < 0n;
  const magnitude = negative ? -qty : qty;
  const packs = magnitude / packFactor;
  const rest = magnitude % packFactor;
  return negative ? { packs: -packs, rest: -rest } : { packs, rest };
}
