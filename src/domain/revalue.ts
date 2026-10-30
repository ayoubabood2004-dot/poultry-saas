import { allocateLargestRemainder } from './allocation';
import { mulDivRound2, type Fils, type Milli } from './money';

// تصحيح سعر الاستلام بعد السحب (FOUNDATION ١٤١، ٥٥٢؛ E5، E51، E55): مرآة post_receipt_revalue وpreview_receipt_revalue بـ0010. الحكم
// بالقاعدة، وهذي للتقسيم الحيّ بنافذة التصحيح وفحص التطابق. الفرق = الجديد − الحالي (آخر تصحيح غير ملغى أو مبلغ السطر)، وما يتوزّع
// خصم الرأس من جديد (E51). حصّة المتبقّي = _mul_div_round2(Σ متبقّي العائلة، الفرق، كمية السطر)، والعائلة دفعة السطر ومراياها
// (origin_lot_id، E5) بترتيب الخادم (الجذر ثم المرايا بالمعرّف)، وتتوزّع بأكبر الباقي بالفلس على اللي متبقّيها > 0 بوزن متبقّيها؛ والباقي
// (الفرق − حصّة المتبقّي) مصروف «فرق سعر شراء»، سالب لمّا السعر ينزل.

export interface FamilyLot {
  qtyLeft: Milli;
  valueLeft: Fils;
}

export interface RevaluationSplit {
  /** حصّة المتبقّي كلّها (تدخل الدفعات). */
  lotShare: Fils;
  /** حصّة كل دفعة بترتيب العائلة (صفر للي ما بقى منها شي). */
  shares: Fils[];
  /** «فرق سعر شراء» = الفرق − حصّة المتبقّي. */
  expense: Fils;
  /** حصّة تخلّي قيمة متبقّي دفعة سالبة (negative_value، FOUNDATION ٥٥٢). */
  problem: 'negative_value' | null;
}

export function revaluationSplit(family: readonly FamilyLot[], qtyIn: Milli, diff: Fils): RevaluationSplit {
  const live = family.map((lot, index) => ({ index, qty: lot.qtyLeft })).filter((lot) => lot.qty > 0n);
  const left = live.reduce((sum, lot) => sum + lot.qty, 0n);
  if (left === 0n) return { lotShare: 0n, shares: family.map(() => 0n), expense: diff, problem: null };
  const lotShare = mulDivRound2(left, diff, qtyIn);
  const split = allocateLargestRemainder(
    lotShare,
    live.map((lot) => lot.qty),
  );
  const shares = family.map(() => 0n);
  live.forEach((lot, k) => {
    shares[lot.index] = split[k] ?? 0n;
  });
  const negative = family.some((lot, index) => lot.valueLeft + (shares[index] ?? 0n) < 0n);
  return { lotShare, shares, expense: diff - lotShare, problem: negative ? 'negative_value' : null };
}
