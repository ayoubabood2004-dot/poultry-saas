import { NotConnectedError, UnknownOutcomeError, ZeroRowsError } from '../errors';

// lib/repo هو الوصول الوحيد للقاعدة، ملف لكل وحدة: سياسة الأخطاء والمهلة وبوابة الاشتراك والطابور بمكان واحد.
// بـdoctorVet خلل واحد بهاي النقطة وصل ٢١ موضعاً، والإصلاح بيها صلّحهم كلهم.
// القاعدة مؤجّلة بكلمة المالك: لحد ما تنربط، كل قراءة ترمي NotConnectedError والشاشة تكول ذلك بصوت.

export const REQUEST_TIMEOUT_MS = 15_000;

/** القاعدة بعدها ما انربطت. */
export function notConnected(): never {
  throw new NotConnectedError();
}

/** كل كتابة مباشرة تمرّ من هنا: ترمي على الخطأ وعلى صفر صفوف (والمصفوفة الفارغة صفر صفوف). */
export function updatedRows<T>(result: { data: T | T[] | null; error: unknown }): T[] {
  if (result.error) throw result.error;
  const rows = result.data === null ? [] : Array.isArray(result.data) ? result.data : [result.data];
  if (rows.length === 0) throw new ZeroRowsError();
  return rows;
}

/** كل طلب بمهلة. انتهاء المهلة = «ما نعرف شنو صار»، مو «ما انحفظ». */
export function withTimeout<T>(promise: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new UnknownOutcomeError('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
