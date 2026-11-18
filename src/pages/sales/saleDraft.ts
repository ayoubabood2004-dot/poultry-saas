// الفاتورة المفتوحة على الجهاز (تصميم المبيعات §١ و«لا يضيع شيء»، docs/SALES_UX_PLAN.md): شاشة البيع تحفظ سلّتها كلّها (المخزن والسطور والزبون والدفع
// والخصم والملاحظة والتاريخ) بعد كلّ تغيير في localStorage بمفتاح المستخدم والمنشأة، وتعود بها حين تُفتح؛ وتُمحى حين تُحفظ الفاتورة. ومعها ملخّص صغير
// (عدد الموادّ والصافي والمخزن) تقرؤه الرئيسية لشريحة «فاتورة مفتوحة» بلا أن تحمّل شاشة البيع. الوحدة صغيرة عمداً: الرئيسية في التثبيت المسبق، وهذه
// تشاركها حزمة المخزون الكسولة؛ فالكتابة والقراءة الكاملة في sellMemory (حزمة البيع وحدها). التخزين قد يرمي أو يعود فارغاً (نافذة خاصّة، تخزين ممسوح)، فكلّ قراءة وكتابة بـtry والشاشة تعمل بلاه.

export interface SaleDraftSummary {
  /** عدد الموادّ في الفاتورة (المادّة بسطرين واحدة). */
  lines: number;
  /** الصافي كما حسبته الشاشة بالفلس (صفر حين لا يُحسب بعد). */
  total: bigint;
  storeId: string;
}

const PREFIX = 'sales.invoice.draft:';

/** مفتاح الفاتورة المفتوحة: المستخدم والمنشأة، فلا تعود فاتورة مستخدم لآخر على الجهاز نفسه. */
export const saleDraftKey = (userId: string, orgId: string): string => `${PREFIX}${userId}:${orgId}`;

/** ملخّص الفاتورة المفتوحة للرئيسية، أو null (لا فاتورة، أو شكل غير هذا). */
export function readSaleDraftSummary(userId: string, orgId: string): SaleDraftSummary | null {
  let value: unknown;
  try {
    const text = localStorage.getItem(saleDraftKey(userId, orgId));
    value = text === null ? null : (JSON.parse(text) as unknown);
  } catch { // swallow-ok: تخزين ممنوع أو تالف؛ لا فاتورة مفتوحة
    return null;
  }
  const stored = value as { v?: unknown; summary?: { lines?: unknown; total?: unknown; store?: unknown } } | null;
  const summary = stored && stored.v === 1 ? stored.summary : null;
  if (!summary) return null;
  const { lines, total, store } = summary;
  if (typeof lines !== 'number' || !Number.isInteger(lines) || lines < 1 || typeof total !== 'string' || !/^\d{1,18}$/u.test(total) || typeof store !== 'string') return null;
  return { lines, total: BigInt(total), storeId: store };
}

/** يمحو الفاتورة المفتوحة (حُفظت، أو «ابدأ من جديد»). */
export function clearSaleDraft(userId: string, orgId: string): void {
  try {
    localStorage.removeItem(saleDraftKey(userId, orgId));
  } catch {
    /* swallow-ok: لا تخزين، فلا شيء محفوظ يُمحى */
  }
}
