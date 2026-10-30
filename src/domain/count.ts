import { compareUuid } from './fifo';
import { FILS_PER_DINAR, MILLI_PER_UNIT, mulDivRound2, roundHalfAway, UNIT_COST_SCALE, type Fils, type Milli, type UnitCost } from './money';

// قيمة زيادة الجرد (القاعدة 17، E45، E48): مرآة private.gain_reference_lot وprivate.gain_value بـ0008 حرفاً بحرف. الحكم بالقاعدة
// (preview_count وpost_count)، وهذي للمعاينة بالواجهة وفحص التطابق: الحزمة (property.test v3) تقارن قيمة كل زيادة ترحّلت بهذي على
// دفعات المنشأة كما كانت قبلها.

export interface GainLot {
  id: string;
  fifoSeq: bigint;
  /** مرآة تحويل (origin_lot_id موجود)؛ الجذر false. */
  mirror: boolean;
  /** حركتها الأصلية الموجبة انعكست (افتتاحها أو تحويلها أو جردها ملغى): ما تُقاس بها. */
  reversed: boolean;
  qtyIn: Milli;
  valueIn: Fils;
}

/** الأكبر fifo_seq أوّلاً، والتعادل (الجذر ومراياه) الجذر قبل المرآة، ثم المعرّف بترتيب بايتات uuid. */
function compareReference(a: GainLot, b: GainLot): number {
  if (a.fifoSeq !== b.fifoSeq) return a.fifoSeq > b.fifoSeq ? -1 : 1;
  if (a.mirror !== b.mirror) return a.mirror ? 1 : -1;
  return compareUuid(a.id, b.id);
}

/** دفعة القياس (E45): من دفعات المادّة بالمنشأة كلها (أيّ مصدر وأيّ مخزن، حتى المستنفدة) غير المعكوسة، أو null. */
export function pickGainReferenceLot(lots: readonly GainLot[]): GainLot | null {
  let best: GainLot | null = null;
  for (const lot of lots) {
    if (lot.reversed) continue;
    if (best === null || compareReference(lot, best) < 0) best = lot;
  }
  return best;
}

/**
 * قيمة زيادة q (موجبة): بدفعة القياس mulDivRound2(q, valueIn, qtyIn)، وبلاها بكلفة وحدة المدير (أربع مراتب، E48) q × الكلفة
 * مقرّبة للفلس مرّة وحدة: (q/1000) × (c/10000) دينار = q × c ÷ 100,000 فلس. وبلا الاثنين null (gain_cost_required).
 */
export function gainValue(qty: Milli, reference: Pick<GainLot, 'qtyIn' | 'valueIn'> | null, unitCost: UnitCost | null): Fils | null {
  if (qty <= 0n) throw new RangeError('qty_not_positive');
  if (reference !== null) return mulDivRound2(qty, reference.valueIn, reference.qtyIn);
  if (unitCost !== null) return roundHalfAway(qty * unitCost, (MILLI_PER_UNIT * UNIT_COST_SCALE) / FILS_PER_DINAR);
  return null;
}
