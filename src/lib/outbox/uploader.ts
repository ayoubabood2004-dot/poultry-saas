import { publishCounts, publishRun, stampKey, type RoundResult } from '../roundUploads';
import { flush, openOutbox, summarize } from './queue';
import type { Stamp, Transport } from './types';

// الرافع الواحد لجولات الجهاز (FOUNDATION ٢١٧–٢١٩): القشرة (عند الدخول، ورجوع الاتصال، ورجوع التبويب) وشاشة الجولة (الحفظ و«أرسل
// الآن») يمرّون منه، فرفع واحد بالمرّة لكل (مستخدم، منشأة) ونتيجة كل عملية تنتشر لكل الشاشات (roundQueueStore)، مو للي طلب الرفع
// بس: رفعان بنفس الوقت كانوا يتقاسمون العمليات، فشاشة الجولة ما تعرف نتيجة عملية رفعها غيرها.

/** يعدّ طابور الداخل وغيره بهذا الجهاز وينشره؛ يرجّع عدد عمليات الداخل. */
export async function refreshQueue(stamp: Stamp): Promise<number> {
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
        results.push({ flockId: op.flockId, day: op.day, result });
        return result;
      },
    });
  } finally {
    publishRun(stampKey(stamp), results);
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
