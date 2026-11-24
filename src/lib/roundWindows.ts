import { refreshQueue, roundChannel, type Stamp } from './outbox';
import { publishRun, roundQueueStore, stampKey, type RoundResult } from './roundUploads';

// الاستماع لرفع النوافذ الأخرى (مراجعة 0036 R8): كلّ نافذة فتحت ورقة القاعة تنشر رفع غيرها في مخزنها كأنّها رفعته، فتُقرأ الورقة من جديد وتبني تعديلها
// التالي على نسخة ما حُفظ (كانت تُرسله بنسخة اليوم القديمة فيُردّ stale_day)، ويُعدّ الرأس من جديد. هنا لا في الرافع ولا في lib/outbox: الرافع في التثبيت المسبق، وما يمرّ من فهرس
// lib/outbox يلحقه في حزمته؛ وهذه الوحدة تستوردها الورقة وحدها فتبقى في حزمة القاعات الكسولة (عن السقف). ورسالة بشكل غريب (نسخة أقدم من التطبيق في تبويب آخر) لا تُنشر.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isResult = (value: unknown): value is RoundResult =>
  isRecord(value) && typeof value.flockId === 'string' && typeof value.day === 'string' && typeof value.opId === 'string' && typeof value.fn === 'string' && isRecord(value.payload) && isRecord(value.result) && typeof value.result.kind === 'string';
const isStamp = (value: unknown): value is Stamp => isRecord(value) && typeof value.userId === 'string' && typeof value.orgId === 'string' && typeof value.displayName === 'string';

/** يركّب الاستماع مرّة للنافذة (القناة نفسها التي يعلن عليها الرافع، فلا تصلها رسائلها). */
export function listenOtherWindows(): void {
  const channel = roundChannel();
  if (!channel || channel.onmessage) return;
  channel.onmessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (!isRecord(data) || !isStamp(data.stamp) || !Array.isArray(data.results) || !data.results.every(isResult)) return;
    const stamp = data.stamp;
    publishRun(stampKey(stamp), data.results);
    if (roundQueueStore.get().key === stampKey(stamp)) {
      refreshQueue(stamp).catch(() => {
        /* swallow-ok: عدّ الطابور تعذّر (IndexedDB)؛ الرأس يتحدّث بالرفع الجاي */
      });
    }
  };
}
