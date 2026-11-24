import { ensurePersisted } from '../pwa/persist';
import { enqueueAll, type EnqueueInput } from './queue';
import type { OutboxOp, Stamp } from './types';

// persisted() ينسأل بكل حفظ جولة للطابور مو بالإقلاع بس (FOUNDATION): المتصفّح يعيد تقييم الرفض،
// فتبويب انرفض بالإقلاع ممكن ينقبل بنصّ يوم جولات بلا نت. الشاشات تنادي saveRound أو saveRounds، مو enqueueAll.

/**
 * «احفظ الجولة» لكلّ القاعات بمعاملة واحدة (مراجعة 0036 R3): كلّ العمليات تُكتب أو لا شيء، وبعد ما تنكتب يسأل عن بقاء التخزين بلا ما يأخّر الحفظ.
 * null لعملية: إلغاء زيارة جديدة ما انرفعت حذف عمليتها، فلا شيء يُرسل.
 */
export async function saveRounds(db: IDBDatabase, stamp: Stamp, inputs: readonly EnqueueInput[]): Promise<(OutboxOp | null)[]> {
  const ops = await enqueueAll(db, stamp, inputs);
  void ensurePersisted();
  return ops;
}

/** يحفظ عملية جولة واحدة (مجموع اليوم أو زيارة أو غاز أو هلاكات) كـsaveRounds. */
export async function saveRound(db: IDBDatabase, stamp: Stamp, input: EnqueueInput): Promise<OutboxOp | null> {
  const [op] = await saveRounds(db, stamp, [input]);
  return op ?? null;
}
