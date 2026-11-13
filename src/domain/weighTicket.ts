import { allocateLargestRemainder } from './allocation';
import { FILS_PER_DINAR, lineAmount, roundHalfAway, type Fils, type Milli } from './money';

// تذكرة الوزن وفاتورة الطيور (0028، كلمة المالك 2026-11-12، العقد §3 و§4.4): مرآة الشاشة لـprivate.ticket_nets ولحساب الفاتورة بالقاعدة 26، بلا
// فاصلة عائمة: الكيلو بالآلاف (Milli، ثلاث مراتب)، والمال بالفلس، ونسبة التنزيل بالمئات من الواحد بالمئة (0.50٪ = 50). الحكم بالخادم؛ والمرآة
// للمعاينة وحدها (صافي كلّ قاعة ومعدّل طيرها ومجاميع التذكرة وهي تُكتب، وما تحسبه الفاتورة قبل إرسالها)، وفحص التطابق يقارنها بالقاعدة بلا تسامح.
// مسمّيات المالك: «وزن الفارغ» أوّلاً ثمّ «وزن الخابط» بعد كلّ قاعة؛ صافي القاعة = خابطها − الخابط الذي قبلها (والفارغ قبل الأولى)، ناقص أقفاصها × وزن
// القفص إن وُزن الفارغ بلا أقفاص؛ فمجموع الصوافي = صافي التذكرة بالضبط (D:225–227). وميزان الأقفاص: خابط القاعة مجموع وزناتها، وصافيها = الخابط −
// عدد أقفاص الوزنات × وزن القفص.

export type WeighMethod = 'scale' | 'crates';

export interface WeighingInput {
  crates: number;
  grossKg: Milli;
}

export interface StopInput {
  birds: number | null;
  /** القبّان: أقفاص القاعة كما كُتبت. ميزان الأقفاص: لا يُقرأ (المجموع من الوزنات). */
  crates: number | null;
  /** القبّان: خابط السيارة بعد هذه القاعة. ميزان الأقفاص: لا يُقرأ (المجموع من الوزنات). */
  grossKg: Milli | null;
  /** ميزان الأقفاص وحده. */
  weighings: readonly WeighingInput[];
}

export interface TicketInput {
  method: WeighMethod;
  /** القبّان وحده. */
  emptyKg: Milli | null;
  /** القبّان وحده: وُزن الفارغ مع أقفاصه، فلا تُطرح أقفاص القاعات. */
  emptyWithCrates: boolean;
  crateKg: Milli | null;
  stops: readonly StopInput[];
}

/**
 * لماذا لا صافي لقاعة: نقص بترتيب جملة الخادم (ticket_incomplete: وزن الفارغ، وزن القفص، عدد الأقفاص، وزن الخابط، الوزنات؛ والخابط الذي قبلها لقاعة
 * قبلها بلا خابط)، أو رقمان معروفان لا يستقيمان: خابط لا يزيد على الذي قبله (gross_not_rising)، أو صافٍ ليس أكبر من صفر (net_not_positive).
 */
export type StopProblem = 'empty' | 'crate_kg' | 'crates' | 'gross' | 'prev_gross' | 'weighings' | 'not_rising' | 'not_positive';

export interface StopNet {
  /** القبّان: الخابط قبل هذه القاعة (الفارغ للأولى)؛ ميزان الأقفاص: null. */
  prevGrossKg: Milli | null;
  /** القبّان: المكتوب؛ ميزان الأقفاص: مجموع الوزنات (null بلا وزنة). */
  grossKg: Milli | null;
  /** القبّان: المكتوب؛ ميزان الأقفاص: مجموع أقفاص الوزنات. */
  crates: number | null;
  /** وزن الأقفاص المطروح: صفر حين وُزن الفارغ مع الأقفاص. */
  cratesKg: Milli | null;
  netKg: Milli | null;
  /** معدّل الطير بالكيلو (ثلاث مراتب): الصافي ÷ الطيور مقرّباً مرّة واحدة؛ null بلا صافٍ موجب أو بلا طيور. */
  avgKg: Milli | null;
  problem: StopProblem | null;
}

export interface TicketNets {
  stops: StopNet[];
  /** المجاميع null ما دامت قاعة ناقصة (كأعمدة الخادم). */
  birds: number | null;
  crates: number | null;
  netKg: Milli | null;
  avgKg: Milli | null;
}

const sumInts = (values: readonly (number | null)[]): number | null => (values.length && values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null);
const sumMilli = (values: readonly (Milli | null)[]): Milli | null => (values.length && values.every((value) => value !== null) ? values.reduce<Milli>((sum, value) => sum + (value ?? 0n), 0n) : null);

/** معدّل الطير: _mul_div_round(net, 1, birds, 3). */
export function averageKg(netKg: Milli | null, birds: number | null): Milli | null {
  return netKg !== null && netKg > 0n && birds !== null && birds > 0 ? roundHalfAway(netKg, BigInt(birds)) : null;
}

/** المعقول عند «أكمل التذكرة»: 0.3 إلى 6 كغم للطير (net >= 0.3 × birds و net <= 6 × birds، بلا تقريب). */
export function averageInRange(netKg: Milli, birds: number): boolean {
  const count = BigInt(birds);
  return netKg >= 300n * count && netKg <= 6000n * count;
}

/** صوافي القاعات بترتيب التحميل، كـprivate.ticket_nets، ومجاميع التذكرة. */
export function ticketNets(ticket: TicketInput): TicketNets {
  const scale = ticket.method === 'scale';
  const stops: StopNet[] = ticket.stops.map((stop, index) => {
    if (!scale) {
      const any = stop.weighings.length > 0;
      const crates = any ? stop.weighings.reduce((sum, weighing) => sum + weighing.crates, 0) : null;
      const grossKg = any ? stop.weighings.reduce<Milli>((sum, weighing) => sum + weighing.grossKg, 0n) : null;
      const cratesKg = crates !== null && ticket.crateKg !== null ? BigInt(crates) * ticket.crateKg : null;
      const netKg = grossKg !== null && cratesKg !== null ? grossKg - cratesKg : null;
      const problem: StopProblem | null = ticket.crateKg === null ? 'crate_kg' : !any ? 'weighings' : netKg !== null && netKg <= 0n ? 'not_positive' : null;
      return { prevGrossKg: null, grossKg, crates, cratesKg, netKg, avgKg: averageKg(netKg, stop.birds), problem };
    }
    const prevGrossKg = index === 0 ? ticket.emptyKg : (ticket.stops[index - 1]?.grossKg ?? null);
    const cratesKg = ticket.emptyWithCrates ? 0n : stop.crates !== null && ticket.crateKg !== null ? BigInt(stop.crates) * ticket.crateKg : null;
    const netKg = prevGrossKg !== null && stop.grossKg !== null && cratesKg !== null ? stop.grossKg - prevGrossKg - cratesKg : null;
    let problem: StopProblem | null = null;
    if (index === 0 && ticket.emptyKg === null) problem = 'empty';
    else if (!ticket.emptyWithCrates && ticket.crateKg === null) problem = 'crate_kg';
    else if (!ticket.emptyWithCrates && stop.crates === null) problem = 'crates';
    else if (stop.grossKg === null) problem = 'gross';
    else if (prevGrossKg === null) problem = 'prev_gross';
    else if (stop.grossKg <= prevGrossKg) problem = 'not_rising';
    else if (netKg !== null && netKg <= 0n) problem = 'not_positive';
    return { prevGrossKg, grossKg: stop.grossKg, crates: stop.crates, cratesKg, netKg, avgKg: averageKg(netKg, stop.birds), problem };
  });
  const birds = sumInts(ticket.stops.map((stop) => stop.birds));
  const netKg = sumMilli(stops.map((stop) => (stop.problem === null ? stop.netKg : null)));
  return { stops, birds, crates: sumInts(stops.map((stop) => stop.crates)), netKg, avgKg: averageKg(netKg, birds) };
}

// ─── الفاتورة (القاعدة 26) ───────────────────────────────────────────────────────────────────────────────────────

/** حدّ نسبة التنزيل: 10٪ بالمئات من الواحد بالمئة. */
export const MAX_DEDUCTION: bigint = 1000n;

/** الوزن المحسوب بعد التنزيل: _mul_div_round(net, 100 − pct, 100, 3). pct بالمئات من الواحد بالمئة (0.50٪ = 50)، من صفر إلى 10٪. */
export function billedKg(netKg: Milli, deduction: bigint): Milli {
  if (deduction < 0n || deduction > MAX_DEDUCTION) throw new RangeError('deduction_out_of_range');
  return roundHalfAway(netKg * (10_000n - deduction), 10_000n);
}

/** مبلغ الفاتورة بالدينار الصحيح: _mul_div_round(billed, price, 1, 0)، والسعر للكيلو بالفلس. */
export function saleTotal(billed: Milli, pricePerKg: Fils): Fils {
  return lineAmount(billed, pricePerKg);
}

/**
 * حصّة كلّ فوج من مبلغ الفاتورة بصافي قاعته، بأكبر الباقي بالدينار الصحيح (alloc_lr(total, nets, 0))، فالمجموع = المبلغ بالضبط. المبلغ بالفلس دينار
 * صحيح، والحصص كذلك.
 */
export function revenueSplit(total: Fils, nets: readonly Milli[]): Fils[] {
  if (total % FILS_PER_DINAR !== 0n) throw new RangeError('total_not_whole');
  return allocateLargestRemainder(total / FILS_PER_DINAR, nets).map((dinars) => dinars * FILS_PER_DINAR);
}
