import type { BaseUnit } from '../../domain/units';
import { listDeviceDrafts, removeDeviceDraft, saveDeviceDraft, type DeviceDraft, type DraftStamp } from '../../lib/drafts';
import { RejectedError } from '../../lib/errors';
import type { CountLineFields } from '../../lib/repo/counts';

// سطور جرد ما وصلت الخادم (الخطّة WP5: «الحفظ يبقي المسوّدة لمّا تنقطع الشبكة»): السطر الجديد معرّفه يولد بالجهاز لحظة الإضافة
// (FOUNDATION ١٩٩)، فالإرسال اللي ينعاد بعد جواب ضاع يرجع 23505 = انكتب (وتنكتب آخر قيمة فوقه)؛ والتعديل بمعرّف سطر الخادم. اللي
// ما وصل (بلا شبكة، أو جواب ضاع) ينحفظ بمسوّدة جهاز وحدة لكل جرد (مختومة بالمستخدم والمنشأة) لحد «أرسل المحفوظ». القراءة والكتابة
// تحت قفل الجرد بكل نوافذ الجهاز (Web Locks، درس WP4: الفعل يقرا سجلّ الجهاز الحالي تحت القفل، مو لقطة الشاشة). الرفض الأكيد
// (الجرد سُلّم أو المادّة ما تتابع الانتهاء…) يشيل السطر من المحفوظ ويرجع بسببه حتى الشاشة تقوله، مو يضيع بصمت.

export interface PendingCountLine {
  /** معرّف السطر: مولود بالجهاز للجديد، أو معرّف سطر الخادم للتعديل (existing). */
  id: string;
  existing: boolean;
  itemName: string;
  baseUnit: BaseUnit;
  fields: CountLineFields;
}

export interface CountPendingPayload {
  docId: string;
  lines: PendingCountLine[];
}

export const pendingDraftId = (docId: string): string => `count:${docId}`;

/** السطر بالمحفوظ: نفس المعرّف يتبدّل بآخر قيمة، والجديد بالآخر. */
export function withPending(lines: readonly PendingCountLine[], line: PendingCountLine): PendingCountLine[] {
  return [...lines.filter((other) => other.id !== line.id), line];
}

export interface PendingStore {
  read: () => Promise<DeviceDraft<CountPendingPayload> | null>;
  /** يحفظ السطور الباقية، أو يشيل المسوّدة إذا فرغت. */
  write: (lines: readonly PendingCountLine[]) => Promise<void>;
}

export interface PendingSend {
  add: (docId: string, id: string, fields: CountLineFields) => Promise<unknown>;
  update: (id: string, patch: Omit<CountLineFields, 'item_id'>) => Promise<unknown>;
}

const patchOf = (fields: CountLineFields): Omit<CountLineFields, 'item_id'> => ({
  counted_qty: fields.counted_qty,
  counted_expired_qty: fields.counted_expired_qty,
  gain_expiry_on: fields.gain_expiry_on,
  gain_expired_expiry_on: fields.gain_expired_expiry_on,
  gain_born_at: fields.gain_born_at,
});

const isDuplicate = (error: unknown): boolean => error instanceof RejectedError && error.code === '23505';

/** يرسل سطراً واحداً: الجديد إدراج (23505 = انكتب من قبل، فتعديل بآخر قيمة)، والموجود تعديل. */
export async function sendLine(docId: string, line: PendingCountLine, send: PendingSend): Promise<void> {
  if (line.existing) {
    await send.update(line.id, patchOf(line.fields));
    return;
  }
  try {
    await send.add(docId, line.id, line.fields);
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    await send.update(line.id, patchOf(line.fields));
  }
}

/**
 * يرسل المحفوظ بالترتيب: اللي وصل ينشال، والمرفوض رفضاً أكيداً ينشال ويرجع بسببه، وأوّل فشل غير أكيد (شبكة أو جواب ضاع) يوقف
 * الإرسال ويبقي الباقي (هو وبعده) ويرمي خطأه.
 */
export async function sendPending(docId: string, store: PendingStore, send: PendingSend): Promise<{ sent: number; rejected: { line: PendingCountLine; error: unknown }[] }> {
  const draft = await store.read();
  if (!draft) return { sent: 0, rejected: [] };
  let left = [...draft.payload.lines];
  const rejected: { line: PendingCountLine; error: unknown }[] = [];
  let sent = 0;
  for (const line of draft.payload.lines) {
    try {
      await sendLine(docId, line, send);
      sent += 1;
    } catch (error) {
      if (!(error instanceof RejectedError)) {
        await store.write(left);
        throw error;
      }
      rejected.push({ line, error });
    }
    left = left.filter((other) => other.id !== line.id);
  }
  await store.write(left);
  return { sent, rejected };
}

/** المحفوظ لجرد بختم المستخدم والمنشأة (IndexedDB). */
export function devicePending(stamp: DraftStamp, docId: string, title: string): PendingStore {
  const id = pendingDraftId(docId);
  return {
    read: async () => (await listDeviceDrafts<CountPendingPayload>(stamp, 'count')).find((draft) => draft.id === id) ?? null,
    write: async (lines) => {
      if (lines.length === 0) await removeDeviceDraft(id);
      else await saveDeviceDraft<CountPendingPayload>(stamp, { id, kind: 'count', title, payload: { docId, lines: [...lines] } });
    },
  };
}

/** عمل على محفوظ الجرد تحت قفله بكل نوافذ الجهاز (ينتظر نافذة ثانية تخلص)؛ بلا Web Locks بالنافذة بس. */
export async function underCountLock<T>(docId: string, work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return work();
  return locks.request(`count-pending:${docId}`, { mode: 'exclusive' }, () => work());
}

/** يضيف سطراً للمحفوظ (أو يبدّل قيمته) تحت القفل: يقرا الحالي ويكتب فوقه، فنافذتان ما تمسحان سطر بعض. */
export async function keepPending(store: PendingStore, docId: string, line: PendingCountLine): Promise<void> {
  await underCountLock(docId, async () => {
    const draft = await store.read();
    await store.write(withPending(draft?.payload.lines ?? [], line));
  });
}
