// localStorage لراحة الجهاز بس (الوضع الداكن، حجم الواجهة…). ممكن يرمي أو يرجع فارغ
// (نافذة خاصّة، تخزين ممسوح)، فكل قراءة وكتابة بـtry، والتطبيق يشتغل صحّ بلاه.

export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch { // swallow-ok: إعداد راحة؛ بلاه تنطبق القيمة الافتراضية
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* swallow-ok: إعداد راحة؛ الشاشة تشتغل بالقيمة اللي بالذاكرة */
  }
}
