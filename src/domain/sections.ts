// أقسام القاعة (0038، رسالة الزبون 2026-11-26: «قاعة وحدة مقسومة قسمين… الهلاكات مال القاعة واحد، والهلاكات مال القاعة اثنين، العدد همين ينقسم
// بالنص»؛ وجواب المالك: التقسيم على القاعة، من 1 إلى 4 أقسام). منطق صافٍ مرآةٌ لمساعدات الخادم: تقسيم العدد بالتساوي (الباقي للأقسام الأولى)،
// ومجموع الأقسام، وصلاحها.

/** أكثر الأقسام في القاعة (القيد halls.sections بين 1 و4). */
export const MAX_SECTIONS = 4;

/** تقسيم العدد على n قسماً بالتساوي، والباقي للأقسام الأولى (27,051 على قسمين = 13,526 + 13,525) كما يقسم open_flock. */
export function evenSplit(total: number, n: number): number[] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(n) || n < 1) return [];
  // قسمة أعداد صحيحة بلا تقريب: الباقي أوّلاً، ثمّ قسمة ما يقبل القسمة بالضبط.
  const rest = total % n;
  const base = (total - rest) / n;
  return Array.from({ length: n }, (_, index) => base + (index < rest ? 1 : 0));
}

/** مجموع أعداد الأقسام. */
export const partsSum = (parts: readonly number[]): number => parts.reduce((sum, part) => sum + part, 0);

/** أعداد أقسام صالحة: من قسمين إلى أربعة، كلّ عدد صحيح غير سالب. */
export const validParts = (parts: readonly unknown[]): parts is number[] =>
  parts.length >= 2 && parts.length <= MAX_SECTIONS && parts.every((part) => typeof part === 'number' && Number.isInteger(part) && part >= 0);
