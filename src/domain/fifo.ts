import type { Day } from './dates';
import { mulDivRound2, type Fils, type Milli } from './money';

// ترتيب السحب وقيمته (FOUNDATION القواعد 12–15): مرآة private.draw_plan وprivate.draw بـ0007 حرفاً بحرف، والحزمة (stock.test)
// تقارنهما على مجموعات دفعات مولّدة فيها fifo_seq متساوية (مرآة رجعت لمخزن أصلها) وانتهاءات فارغة ومتساوية. الأيام نصوص
// YYYY-MM-DD تنقارن كنصّ (بلا Date ولا منطقة، درس 2026-10-26 عن TZ). المعاينة بالواجهة من هنا، والحكم بالقاعدة.

export interface FifoLot {
  id: string;
  fifoSeq: bigint;
  receivedOn: Day;
  expiryOn: Day | null;
  qtyLeft: Milli;
  valueLeft: Fils;
}

export interface LotDraw {
  lotId: string;
  qty: Milli;
  value: Fils;
}

export interface DrawOptions {
  /** المادّة تتابع الانتهاء: المنتهي بيوم المستند ما ينسحب تلقائياً (القاعدة 14). */
  tracksExpiry: boolean;
  /** دفعة مسمّاة بالسطر (Q5): السحب منها بس. */
  lotId?: string | null;
  /** إذن المدير بسحب الدفعة المسمّاة وهي منتهية (expired.release). */
  allowExpired?: boolean;
  /**
   * كميات سطور قبله من نفس المادّة بنفس المستند بترتيبها: كل سطر سحب لحاله على الدفعات كما صارت بعد اللي قبله، مثل الترحيل
   * سطراً سطراً (قطعة وحدة مجموعة تتقرّب مرّة وحدة فتفرق فلساً عن سحبين)، فالمعاينة = الترحيل.
   */
  before?: readonly Milli[];
}

/** ترتيب uuid ببوستغريس (بايتات): النصّ الست عشري بحروف صغيرة والشرطات بمواضع ثابتة، فمقارنة النصّ نفسها. */
export function compareUuid(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** الانتهاء تصاعدياً والفارغ أخيراً، ثم fifo_seq، ثم المعرّف (order by expiry_on asc nulls last, fifo_seq, id). */
export function compareDrawOrder(a: Pick<FifoLot, 'id' | 'fifoSeq' | 'expiryOn'>, b: Pick<FifoLot, 'id' | 'fifoSeq' | 'expiryOn'>): number {
  if (a.expiryOn !== b.expiryOn) {
    if (a.expiryOn === null) return 1;
    if (b.expiryOn === null) return -1;
    return a.expiryOn < b.expiryOn ? -1 : 1;
  }
  if (a.fifoSeq !== b.fifoSeq) return a.fifoSeq < b.fifoSeq ? -1 : 1;
  return compareUuid(a.id, b.id);
}

/** الدفعات المؤهّلة بيوم المستند بترتيب السحب: متبقٍّ موجب، ومستلمة بيومه أو قبله، وغير منتهية (إلا المسمّاة بإذن). */
export function eligibleLots(lots: readonly FifoLot[], docDate: Day, options: DrawOptions): FifoLot[] {
  const named = options.lotId ?? null;
  return lots
    .filter(
      (lot) =>
        lot.qtyLeft > 0n &&
        lot.receivedOn <= docDate &&
        (named === null || lot.id === named) &&
        (!options.tracksExpiry || lot.expiryOn === null || lot.expiryOn >= docDate || (named !== null && options.allowExpired === true)),
    )
    .sort(compareDrawOrder);
}

/** قيمة سحب q من دفعة متبقّيها (ql، vl): كل المتبقّي = vl بالضبط (القاعدة 13)، وإلا _mul_div_round2. */
function drawValue(take: Milli, qtyLeft: Milli, valueLeft: Fils): Fils {
  return take === qtyLeft ? valueLeft : mulDivRound2(take, valueLeft, qtyLeft);
}

/** سحب سطر واحد من متبقّي الدفعات (يتعدّل بمكانه، مثل apply_move): القطع بترتيب السحب، والباقي اللي ما لكى دفعة. */
function drawLine(state: { lot: FifoLot; qtyLeft: Milli; valueLeft: Fils }[], qty: Milli): { draws: LotDraw[]; left: Milli } {
  let left = qty;
  const draws: LotDraw[] = [];
  for (const slot of state) {
    if (left <= 0n) break;
    if (slot.qtyLeft <= 0n) continue;
    const take = left < slot.qtyLeft ? left : slot.qtyLeft;
    const value = drawValue(take, slot.qtyLeft, slot.valueLeft);
    draws.push({ lotId: slot.lot.id, qty: take, value });
    slot.qtyLeft -= take;
    slot.valueLeft -= value;
    left -= take;
  }
  return { draws, left };
}

/**
 * خطّة السحب: القطع بترتيب السحب لحد الكمية، والنقص إذا المؤهّل ما يكفي (المستند يبقى مسوّدة). before تسحب أوّلاً سطراً سطراً
 * (سطور قبله من نفس المادّة)، فالدفعة اللي انسحب منها جزء تكمل من متبقّيها وقيمته بعد كل سحب، مثل الترحيل.
 */
export function planDraw(lots: readonly FifoLot[], qty: Milli, docDate: Day, options: DrawOptions): { draws: LotDraw[]; shortage: Milli } {
  const state = eligibleLots(lots, docDate, options).map((lot) => ({ lot, qtyLeft: lot.qtyLeft, valueLeft: lot.valueLeft }));
  for (const earlier of options.before ?? []) drawLine(state, earlier);
  const { draws, left } = drawLine(state, qty);
  return { draws, shortage: left > 0n ? left : 0n };
}

export interface TransferLinePlan {
  lineId: string;
  itemId: string;
  qty: Milli;
}

/** خطّة تحويل بسطوره: كل سطر يسحب بعد السطور قبله من نفس المادّة (before بترتيبها)، مثل الترحيل سطراً سطراً. */
export function planTransfer(
  lines: readonly TransferLinePlan[],
  lotsOf: (itemId: string) => readonly FifoLot[],
  tracksExpiryOf: (itemId: string) => boolean,
  docDate: Day,
): { lineId: string; draws: LotDraw[]; shortage: Milli }[] {
  const taken = new Map<string, Milli[]>();
  return lines.map((line) => {
    const before = taken.get(line.itemId) ?? [];
    const plan = planDraw(lotsOf(line.itemId), line.qty, docDate, { tracksExpiry: tracksExpiryOf(line.itemId), before });
    taken.set(line.itemId, [...before, line.qty]);
    return { lineId: line.lineId, ...plan };
  });
}
