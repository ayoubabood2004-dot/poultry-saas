import { ensurePersisted } from '../pwa/persist';
import { enqueue, type EnqueueInput } from './queue';
import type { OutboxOp, Stamp } from './types';

// persisted() ينسأل بكل حفظ جولة للطابور مو بالإقلاع بس (FOUNDATION): المتصفّح يعيد تقييم الرفض،
// فتبويب انرفض بالإقلاع ممكن ينقبل بنصّ يوم جولات بلا نت. الشاشات تنادي saveRound، مو enqueue.

/** يحفظ الجولة بالطابور، وبعد ما تنكتب يسأل عن بقاء التخزين بلا ما يأخّر الحفظ. */
export async function saveRound(db: IDBDatabase, stamp: Stamp, input: EnqueueInput): Promise<OutboxOp> {
  const op = await enqueue(db, stamp, input);
  void ensurePersisted();
  return op;
}
