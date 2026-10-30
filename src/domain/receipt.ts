import { allocateLargestRemainder } from './allocation';
import type { Fils, Milli } from './money';
import { toBase, type BaseUnit, type Density } from './units';

// حساب الاستلام (القواعد 10 و11 و25، FOUNDATION ٤٧٢–٤٧٣، ٤٩٣؛ Q7، Q8، E46): مرآة private.receipt_valuation بـ0009 حرفاً بحرف. الحكم
// بالقاعدة (preview_receipt وpost_receipt)، وهذي للتقسيم الحيّ بشاشة المبالغ وفحص التطابق (golden.test وproperty.test v4). حصّة
// الخصم بأكبر الباقي بالفلس حسب مبلغ السطر؛ وكل تحميل بأكبر الباقي بالفلس على سطوره بالكتلة (اللتر بكثافة لقطة السطر، والقطعة بوزن
// لقطتها) أو بالقيمة (مبلغ السطر كما بالفاتورة)؛ وقيمة الدفعة = المبلغ − حصّة الخصم + حصص التحميلات؛ وصافي المورّد = Σ السطور − الخصم.
// المشكلة الأولى بنفس ترتيب القاعدة: مبلغ سطر ناقص، ثم الخصم، ثم التحميلات بترتيبها، ثم المدفوع.

export interface ReceiptLineInput {
  qtyBase: Milli;
  baseUnit: BaseUnit;
  /** لقطة الكثافة على السطر (E46) بمقياس DENSITY_SCALE، وnull بلا كثافة. */
  density: Density | null;
  /** لقطة وزن القطعة بالكيلو، بالألف؛ null بلا وزن. */
  pieceMass: Milli | null;
  /** مبلغ السطر بالفلس (دينار صحيح، Q7)؛ null ما تسعَّر بعد. */
  lineTotal: Fils | null;
  zeroReason?: string | null;
}

export interface ReceiptChargeInput {
  amount: Fils;
  allocateBy: 'mass' | 'value';
  /** على كل السطور، وإلا على lines (مؤشّرات السطور). */
  allLines: boolean;
  lines: readonly number[];
}

export type ReceiptProblemCode =
  | 'value_required'
  | 'discount_exceeds_total'
  | 'charge_lines_required'
  | 'no_mass'
  | 'zero_weights'
  | 'paid_exceeds_total'
  | 'cash_account_required';

/** line: مؤشّر السطر (value_required، والسطر بلا كتلة لـno_mass)، وcharge: مؤشّر التحميل. */
export interface ReceiptProblem {
  code: ReceiptProblemCode;
  line?: number;
  charge?: number;
}

export interface ReceiptValuation {
  problem: ReceiptProblem | null;
  /** كتلة كل سطر بالكيلو (بالألف)، وnull بلا كتلة معروفة. */
  mass: (Milli | null)[];
  discountShares: Fils[];
  /** مجموع حصص التحميلات لكل سطر. */
  chargeShares: Fils[];
  /** لكل تحميل: سطوره وحصّة كل واحد (فارغة إذا ما توزّع لمشكلته). */
  perCharge: { lines: number[]; shares: Fils[] }[];
  values: Fils[];
  linesTotal: Fils;
  net: Fils;
}

/**
 * كتلة السطر بالكيلو (بالألف): الكيلو كما هو، واللتر × كثافة لقطته (litersToKg)، والقطعة × وزن لقطتها، كلاهما round3 بنصف بعيداً عن
 * الصفر؛ null بلا كتلة معروفة. الضرب والتقريب من toBase (نفس roundHalfAway): المعامل الكثافة بأربع مراتب أو وزن القطعة بثلاث.
 */
export function massOf(line: Pick<ReceiptLineInput, 'qtyBase' | 'baseUnit' | 'density' | 'pieceMass'>): Milli | null {
  if (line.baseUnit === 'kg') return line.qtyBase;
  const factor = line.baseUnit === 'L' ? (line.density === null ? null : { units: line.density, scale: 4 }) : line.pieceMass === null ? null : { units: line.pieceMass, scale: 3 };
  if (factor === null) return null;
  const mass = toBase(line.qtyBase, factor, 'kg');
  return mass.ok ? mass.qty : null;
}

export function receiptValuation(
  lines: readonly ReceiptLineInput[],
  amounts: { discount: Fils; paidNow: Fils; hasBox: boolean },
  charges: readonly ReceiptChargeInput[],
): ReceiptValuation {
  let problem: ReceiptProblem | null = null;
  const note = (found: ReceiptProblem) => {
    if (problem === null) problem = found;
  };
  lines.forEach((line, index) => {
    if (line.lineTotal === null) note({ code: 'value_required', line: index });
    else if (line.lineTotal === 0n && !line.zeroReason) note({ code: 'value_required', line: index });
  });
  const totals = lines.map((line) => line.lineTotal ?? 0n);
  const linesTotal = totals.reduce((sum, total) => sum + total, 0n);
  const mass = lines.map(massOf);
  const { discount, paidNow, hasBox } = amounts;
  if (discount > linesTotal) note({ code: 'discount_exceeds_total' });
  const discountShares = discount > 0n && discount <= linesTotal ? allocateLargestRemainder(discount, totals) : totals.map(() => 0n);
  const chargeShares = totals.map(() => 0n);
  const perCharge = charges.map((charge, chargeIndex) => {
    const picked = lines.map((_, index) => index).filter((index) => charge.allLines || charge.lines.includes(index));
    const missing = charge.allocateBy === 'mass' ? picked.find((index) => mass[index] === null) : undefined;
    const weights = picked.map((index) => (charge.allocateBy === 'mass' ? (mass[index] ?? 0n) : (totals[index] ?? 0n)));
    if (picked.length === 0) {
      note({ code: 'charge_lines_required', charge: chargeIndex });
      return { lines: picked, shares: [] };
    }
    if (missing !== undefined) {
      note({ code: 'no_mass', charge: chargeIndex, line: missing });
      return { lines: picked, shares: [] };
    }
    if (weights.every((weight) => weight === 0n)) {
      note({ code: 'zero_weights', charge: chargeIndex });
      return { lines: picked, shares: [] };
    }
    const shares = allocateLargestRemainder(charge.amount, weights);
    picked.forEach((index, k) => {
      chargeShares[index] = (chargeShares[index] ?? 0n) + (shares[k] ?? 0n);
    });
    return { lines: picked, shares };
  });
  const net = linesTotal - discount;
  if (paidNow > net) note({ code: 'paid_exceeds_total' });
  if (paidNow > 0n && !hasBox) note({ code: 'cash_account_required' });
  const values = totals.map((total, index) => total - (discountShares[index] ?? 0n) + (chargeShares[index] ?? 0n));
  return { problem, mass, discountShares, chargeShares, perCharge, values, linesTotal, net };
}
