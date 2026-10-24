// توزيع «أكبر الباقي»: الحصّة = div(المبلغ × الوزن، مجموع الأوزان)، والوحدات الباقية
// تنوزّع واحدة واحدة على أكبر البواقي، والتعادل بترتيب السطر. فالمجموع = المبلغ بالضبط.
// الوحدة يحدّدها المستدعي: فلس لحصص قيمة الدفعات، ودينار صحيح لكل ما يدخل دفتر جهة.

export function allocateLargestRemainder(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.some((w) => w < 0n)) throw new RangeError('negative_weight');
  const weightSum = weights.reduce((sum, w) => sum + w, 0n);
  if (weightSum === 0n) throw new RangeError('zero_weights');

  const negative = total < 0n;
  const magnitude = negative ? -total : total;
  const shares = weights.map((w) => (magnitude * w) / weightSum);
  const remainders = weights.map((w) => (magnitude * w) % weightSum);

  let left = magnitude - shares.reduce((sum, s) => sum + s, 0n);
  const order = weights
    .map((_, index) => index)
    .sort((a, b) => {
      const ra = remainders[a] ?? 0n;
      const rb = remainders[b] ?? 0n;
      if (ra !== rb) return ra > rb ? -1 : 1;
      return a - b;
    });
  for (const index of order) {
    if (left === 0n) break;
    shares[index] = (shares[index] ?? 0n) + 1n;
    left -= 1n;
  }
  return negative ? shares.map((s) => -s) : shares;
}
