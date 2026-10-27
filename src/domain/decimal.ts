import { toWesternDigits } from './normalize';

/** رقم عشري مضبوط: القيمة = units ÷ 10^scale. بلا فاصلة عائمة أبداً. */
export interface Decimal {
  readonly units: bigint;
  readonly scale: number;
}

// الفاصلة مقبولة بس كفاصلة آلاف صحيحة: أوّل مجموعة 1-3 أرقام بلا صفر بالبداية وبعدها مجاميع ثلاثية.
// «2,5» بالعراق تنكتب يعني 2.5، و«٬» تشبه «٫»: شيلها بلا شرط خلّت «0,5» = 5 و«2,50» = 250 بصمت.
const DECIMAL_TEXT = /^(-)?([1-9]\d{0,2}(?:,\d{3})+|\d*)(?:\.(\d*))?$/;

/**
 * يقرا رقماً من نصّ المستخدم: أرقام شرقية، «٫» للعشري، وفواصل الآلاف (, و٬) إذا مجموعاتها صحيحة.
 * الفراغ ينشال من الطرفين بس. يرجّع null لنصّ مو رقم، لفاصلة بغير مكانها، أو لرقم بمراتب
 * معنوية أكثر من maxScale (الرفض أحسن من تقريب صامت).
 */
export function parseDecimal(input: string, maxScale: number): Decimal | null {
  const text = toWesternDigits(input).trim();
  const match = DECIMAL_TEXT.exec(text);
  if (!match) return null;
  const [, minus, grouped = '', fracRaw = ''] = match;
  const intPart = grouped.replace(/,/g, '');
  if (intPart === '' && fracRaw === '') return null;
  const frac = fracRaw.replace(/0+$/, '');
  if (frac.length > maxScale) return null;
  const magnitude = BigInt((intPart === '' ? '0' : intPart) + frac);
  return { units: minus ? -magnitude : magnitude, scale: frac.length };
}

/**
 * النصّ العشري للشبكة (E3: المال والكمية نصوص عشرية بالاتجاهين): (−2n، 2) ← «-0.02»، (25n، 0) ← «25». بلا فواصل آلاف
 * (هذا مو عرض؛ العرض من format.ts).
 */
export function decimalText(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
}

/** يحوّل لعدد مراتب ثابت بالضبط، ويرمي إذا التحويل يضيّع رقماً. */
export function toScale(value: Decimal, scale: number): bigint {
  if (value.scale === scale) return value.units;
  if (value.scale < scale) return value.units * 10n ** BigInt(scale - value.scale);
  const divisor = 10n ** BigInt(value.scale - scale);
  if (value.units % divisor !== 0n) throw new RangeError('precision_loss');
  return value.units / divisor;
}
