import { parseDecimal, toScale } from './decimal';

// الفلوس بالواجهة أعداد صحيحة (bigint) بوحدة ١/١٠٠ دينار، نسمّيها «فلس» بهذا المشروع.
// الفلس الرسمي ١/١٠٠٠، فلا تاخذ المقياس من بيانات ISO أو Intl.
// كل تقريب يمرّ من roundHalfAway، وكل دالّة هنا مرآة لدالّة بالقاعدة بفحص تطابق بالفلس:
// بـdoctorVet مرآة قرّبت 70616.875 لـ.87 والقاعدة لـ.88، فقالت «ما لكينا» عن شي موجود.

/** مبلغ بوحدة ١/١٠٠ دينار. */
export type Fils = bigint;
/** كمية بوحدة ١/١٠٠٠ من وحدة الأساس: غرام، ملليلتر، أو جزء من ألف من القطعة. */
export type Milli = bigint;

export const FILS_PER_DINAR = 100n;
export const MILLI_PER_UNIT = 1000n;

/** التقريب الوحيد: numerator ÷ denominator نصفاً بعيداً عن الصفر، نفس round(numeric, n) ببوستغريس. */
export function roundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('denominator_not_positive');
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (2n * magnitude + denominator) / (2n * denominator);
  return negative ? -rounded : rounded;
}

function requirePositive(value: bigint, name: string): void {
  if (value <= 0n) throw new RangeError(`${name}_not_positive`);
}

/**
 * مرآة _mul_div_round2(q, v, l): q × v ÷ l مقرّباً للفلس بضربة تقريب وحدة.
 * q وl كميتان موجبتان، وv قيمة بأي إشارة. (القسمة ببوستغريس تقرّب لحالها، فـround(q*v/l, 2) تقريب مرّتين.)
 */
export function mulDivRound2(q: Milli, v: Fils, l: Milli): Fils {
  requirePositive(q, 'q');
  requirePositive(l, 'l');
  return roundHalfAway(q * v, l);
}

/** مرآة _mul_div_round0(q, v, l): نفسها مقرّبة لدينار صحيح، لكل مبلغ يدخل دفتر جهة أو صندوق. */
export function mulDivRound0(q: Milli, v: Fils, l: Milli): Fils {
  requirePositive(q, 'q');
  requirePositive(l, 'l');
  return roundHalfAway(q * v, l * FILS_PER_DINAR) * FILS_PER_DINAR;
}

/** يقرّب مبلغاً لدينار صحيح. */
export function roundToDinar(amount: Fils): Fils {
  return roundHalfAway(amount, FILS_PER_DINAR) * FILS_PER_DINAR;
}

export function isWholeDinar(amount: Fils): boolean {
  return amount % FILS_PER_DINAR === 0n;
}

/** مبلغ السطر = round0(الكمية بوحدة الإدخال × سعر الوحدة): ينحسب صحيحاً لحظته وينخزن صحيحاً. */
export function lineAmount(qtyInUnit: Milli, unitPrice: Fils): Fils {
  return roundHalfAway(qtyInUnit * unitPrice, MILLI_PER_UNIT * FILS_PER_DINAR) * FILS_PER_DINAR;
}

/** مبلغ من نصّ المستخدم لمرتبتين كحدّ أقصى، أو null. */
export function parseMoney(input: string): Fils | null {
  const value = parseDecimal(input, 2);
  return value === null ? null : toScale(value, 2);
}
