import { publishCounts, publishRun, roundQueueStore, stampKey, type RoundResult } from '../roundUploads';
import { flush, openOutbox, summarize } from './queue';
import type { Stamp, Transport } from './types';

// الرافع الواحد لجولات الجهاز (FOUNDATION ٢١٧–٢١٩): القشرة (عند الدخول، ورجوع الاتصال، ورجوع التبويب) وشاشة الجولة (الحفظ و«أرسل
// الآن») يمرّون منه، فرفع واحد بالمرّة لكل (مستخدم، منشأة) ونتيجة كل عملية تنتشر لكل الشاشات (roundQueueStore)، مو للي طلب الرفع
// بس: رفعان بنفس الوقت كانوا يتقاسمون العمليات، فشاشة الجولة ما تعرف نتيجة عملية رفعها غيرها.
//
// والنتائج لكلّ نوافذ الجهاز (مراجعة 0036 R8): الطابور في IndexedDB واحد للنوافذ كلّها (تبويب ثانٍ أو التطبيق المثبّت)، فرفعٌ من نافذة أخرى يحفظ عمليات
// هذه النافذة ولا تدري، فكانت ورقة القاعة تبني تعديلها التالي على نسخة اليوم القديمة فيُردّ stale_day. كلّ رفع يُعلن نتائجه على قناة النوافذ، وكلّ نافذة
// فتحت الرافع (القشرة تفتحه مع الدخول) تنشرها في مخزنها كأنّها رفعتها: الورقة تُقرأ من جديد وتبني على نسخة ما حُفظ، والرأس يُعدّ من جديد.

const CHANNEL = 'poultry-round-uploads';
let channel: BroadcastChannel | null | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
/** نتيجة رفع من نافذة أخرى بشكلها (نسخة أقدم من التطبيق في تبويب آخر قد ترسل غيره: لا يُنشر ما لا يُقرأ). */
const isResult = (value: unknown): value is RoundResult =>
  isRecord(value) && typeof value.flockId === 'string' && typeof value.day === 'string' && typeof value.opId === 'string' && typeof value.fn === 'string' && isRecord(value.payload) && isRecord(value.result) && typeof value.result.kind === 'string';
const isStamp = (value: unknown): value is Stamp => isRecord(value) && typeof value.userId === 'string' && typeof value.orgId === 'string' && typeof value.displayName === 'string';

/** قناة النوافذ: تُفتح مع أوّل عدّ أو رفع في النافذة، ومن يومها تنشر رفع غيرها. */
function otherWindows(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  if (channel) {
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
  return channel;
}

/** يعدّ طابور الداخل وغيره بهذا الجهاز وينشره؛ يرجّع عدد عمليات الداخل. */
export async function refreshQueue(stamp: Stamp): Promise<number> {
  otherWindows();
  const summary = await summarize(await openOutbox(), stamp);
  publishCounts(stampKey(stamp), summary);
  return summary.mine;
}

async function run(stamp: Stamp, loadTransport: () => Promise<Transport>): Promise<RoundResult[]> {
  const results: RoundResult[] = [];
  try {
    // الناقل (repo/flocks) ما يتحمّل إلا وبالجهاز جولات للداخل.
    if ((await refreshQueue(stamp)) === 0) return results;
    const transport = await loadTransport();
    await flush(await openOutbox(), stamp, {
      ...transport,
      send: async (op) => {
        const result = await transport.send(op);
        results.push({ flockId: op.flockId, day: op.day, opId: op.id, fn: op.fn, payload: op.payload, result });
        return result;
      },
    });
  } finally {
    publishRun(stampKey(stamp), results);
    if (results.length > 0) {
      try {
        otherWindows()?.postMessage({ stamp: { userId: stamp.userId, orgId: stamp.orgId, displayName: stamp.displayName }, results });
      } catch {
        /* swallow-ok: نتيجة لا تُنسخ إلى نافذة أخرى (DataCloneError)؛ تلك تقرأ الطابور بعد رفعها التالي كما كانت */
      }
    }
    await refreshQueue(stamp).catch(() => {
      /* swallow-ok: العدّ بعد الرفع تعذّر (IndexedDB)؛ الرأس يبقى على آخر عدّ لحد الرفع الجاي */
    });
  }
  return results;
}

interface Slot {
  current: Promise<RoundResult[]> | null;
  next: Promise<RoundResult[]> | null;
}

const slots = new Map<string, Slot>();

/**
 * رفع واحد بالمرّة لكل (مستخدم، منشأة). طلب أثناء رفع ينتظره ثم يرفع مرّة ثانية (عملية انحفظت بعد ما خلص المسك تلحق)، والطلبات
 * أثناء الانتظار تشترك بنفس الرفع الثاني؛ والنتيجة نتائج الرفعين، حتى اللي طلب يلقى نتيجة عمليته وين ما ارتفعت.
 */
export function uploadQueue(stamp: Stamp, loadTransport: () => Promise<Transport>): Promise<RoundResult[]> {
  otherWindows();
  const key = stampKey(stamp);
  const slot = slots.get(key) ?? { current: null, next: null };
  slots.set(key, slot);
  const start = (): Promise<RoundResult[]> => {
    const running = run(stamp, loadTransport).finally(() => {
      if (slot.current === running) slot.current = null;
    });
    slot.current = running;
    return running;
  };
  if (!slot.current) return start();
  if (!slot.next) {
    const earlier = slot.current.catch((): RoundResult[] => []); /* swallow-ok: خطأ الرفع الجاري يوصل لطالبه؛ الرفع الثاني يمشي بعده بكل الأحوال */
    slot.next = earlier.then(async (first) => {
      slot.next = null;
      return [...first, ...(await start())];
    });
  }
  return slot.next;
}
