import { allocateLargestRemainder } from './allocation';
import { FILS_PER_DINAR, lineAmount, roundHalfAway, type Fils, type Milli } from './money';

// مرآة حساب الفاتورة الاحترافيّة (عقد 0033 «أ»، record_sale_v2) للمعاينة الحيّة في شاشة البيع وحدها: الخادم يحسب ويحفظ، وهذه تعرض قبله ما سيحسبه.
// إجماليّ السطر = round0(الكمية بوحدة السطر × سعر وحدته) بالدينار الصحيح (lineAmount، كسطر الشراء)، وخصم السطر بالدينار الصحيح ≤ إجماليّه، وخصم
// الفاتورة بالدينار الصحيح يُوزَّع على السطور بأكبر الباقي (FOUNDATION 25، allocation.ts مرآة private.alloc_lr) بوزن كلّ سطر بعد خصمه وبترتيب السطور،
// فمجموع الأنصبة = خصم الفاتورة بالضبط. وصافي السطر = إجماليّه − خصمه − نصيبه ≥ 0، والصافي = مجموعها، والدين = الصافي − المدفوع.

/** معامل وحدة البيع إلى الأساس بستّ مراتب (item_units.factor_to_base). */
export const FACTOR_SCALE = 1_000_000n;
/** وحدة الأساس نفسها: المعامل 1. */
export const BASE_FACTOR = FACTOR_SCALE;

/** الكمية بوحدة الأساس من كمية السطر بوحدته: round(qty × factor, 3) كما يحفظها الخادم على السطر. */
export function baseQtyOf(unitQty: Milli, factor: bigint): Milli {
  return roundHalfAway(unitQty * factor, FACTOR_SCALE);
}

/** السعر المقترح لوحدة السطر = سعر البيع لوحدة الأساس × المعامل، مقرّباً للفلس (اقتراح يُعدَّل، لا حساب يُحفظ). */
export function unitPriceOf(basePrice: Fils, factor: bigint): Fils {
  return roundHalfAway(basePrice * factor, FACTOR_SCALE);
}

/** سعر كتبه البائع لوحدة إلى وحدة أخرى للمادّة نفسها بالسعر نفسه للأساس: السعر × المعامل الجديد ÷ القديم، مقرّباً للفلس (اقتراح يُعدَّل). */
export function convertUnitPrice(price: Fils, fromFactor: bigint, toFactor: bigint): Fils {
  return roundHalfAway(price * toFactor, fromFactor);
}

export interface LineInput {
  /** الكمية بوحدة السطر. */
  unitQty: Milli;
  /** السعر لوحدة السطر بالفلس. */
  unitPrice: Fils;
  /** خصم السطر بالدينار الصحيح (بالفلس). */
  discount: Fils;
}

export interface InvoiceMath {
  /** إجماليّ كلّ سطر بالدينار الصحيح. */
  gross: Fils[];
  /** نصيب كلّ سطر من خصم الفاتورة، أو null حين لا يُوزَّع (خصم أكبر من المجموع، أو سطر خصمه أكبر من إجماليّه). */
  shares: Fils[] | null;
  /** صافي كلّ سطر، أو null مع shares. */
  nets: Fils[] | null;
  grossTotal: Fils;
  lineDiscounts: Fils;
  /** مجموع الخصمين (خصوم السطور وخصم الفاتورة). */
  discountTotal: Fils;
  /** صافي الفاتورة = مجموع صوافي السطور. */
  total: Fils;
  /** فهارس السطور التي خصمها أكبر من إجماليّها (bad_discount). */
  overLines: number[];
  /** خصم الفاتورة أكبر من مجموع السطور بعد خصومها (bad_discount). */
  invoiceOver: boolean;
}

/** حساب الفاتورة كما سيحسبه الخادم: السطور بترتيبها، وخصم الفاتورة بالدينار الصحيح. */
export function invoiceMath(lines: readonly LineInput[], invoiceDiscount: Fils): InvoiceMath {
  const gross = lines.map((line) => lineAmount(line.unitQty, line.unitPrice));
  const overLines = lines.flatMap((line, index) => (line.discount > (gross[index] ?? 0n) ? [index] : []));
  const afterLine = lines.map((line, index) => (gross[index] ?? 0n) - line.discount);
  const grossTotal = gross.reduce((sum, value) => sum + value, 0n);
  const lineDiscounts = lines.reduce((sum, line) => sum + line.discount, 0n);
  const base = grossTotal - lineDiscounts;
  const invoiceOver = invoiceDiscount > (base > 0n ? base : 0n);
  let shares: Fils[] | null = null;
  if (overLines.length === 0 && !invoiceOver) {
    // الأوزان بالدينار الصحيح (إجماليّ السطر وخصمه صحيحان)، والأنصبة بالدينار الصحيح ثمّ بالفلس.
    const weights = afterLine.map((value) => value / FILS_PER_DINAR);
    shares = invoiceDiscount === 0n || base === 0n ? lines.map(() => 0n) : allocateLargestRemainder(invoiceDiscount / FILS_PER_DINAR, weights).map((share) => share * FILS_PER_DINAR);
  }
  const nets = shares ? afterLine.map((value, index) => value - (shares?.[index] ?? 0n)) : null;
  const total = nets ? nets.reduce((sum, value) => sum + value, 0n) : base - invoiceDiscount;
  return { gross, shares, nets, grossTotal, lineDiscounts, discountTotal: lineDiscounts + invoiceDiscount, total, overLines, invoiceOver };
}
