import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { RoundError, RoundText } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { countForm, fmtInt, fmtMilli, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { OutboxOp } from '../../lib/outbox';
import { flockDayTransport, type DayValues } from '../../lib/repo/flocks';

// نصوص الجولة المشتركة بين الجولة اليومية (محفوظة للفتح بلا نت) وزيارة يوم من صفحة القاعة (حزمة القاعات، كلمة المالك 2026-11-16):
// ملف صغير بينهما، حتى لا تجرّ صفحة القاعة الجولة كلّها إلى حزمتها.

export const loadTransport = async () => flockDayTransport;

/** مجموع اليوم حتى الآن بخانات الجولة: النافق والمستبعد أعداد، والعلف بالآلاف، والبيض null ما لم يُسجَّل. */
export interface SoFar {
  dead: number;
  culled: number;
  feedKg: bigint | null;
  eggsTotal: number | null;
  eggsBroken: number | null;
  /**
   * 0036: سُجّلت هلاكات اليوم (تُدخل مرّة ثمّ تتضلّل): علم الخادم (dead_entered، وخادم قبل 0036: في اليوم هلاكات، كما ملأته الهجرة)، أو عملية على هذا
   * الجهاز تحملها (هلاكات اليوم، أو مجموع اليوم أو زيارة بنافق أو مستبعد).
   */
  deadEntered: boolean;
  /** على هذا الجهاز عملية لم تُرفع تحمل هلاكات اليوم. */
  deadPending: boolean;
}

const milli = (text: string | null | undefined): bigint | null => {
  const value = text ? parseDecimal(text, 3) : null;
  return value ? toScale(value, 3) : null;
};
const add = (sum: number | null, more: number | null): number | null => (more === null ? sum : (sum ?? 0) + more);
const addMilli = (sum: bigint | null, more: bigint | null): bigint | null => (more === null ? sum : (sum ?? 0n) + more);

/**
 * مجموع اليوم حتى الآن (0032): المحفوظ (صفّ اليوم) ثمّ عمليات هذا الجهاز لذلك اليوم بترتيبها — الزيارة الجديدة تُضاف، ومجموع اليوم القديم
 * (save_flock_day مخزّنة قبل 0032) يحلّ محلّ خاناته المكتوبة، وتعديل زيارة محفوظة أو إلغاؤها لا يُعرف فرقه هنا فيبقى للخادم. والزيارة الجديدة
 * في الطريق (sending) أو المجهولة (unknown) ربّما صارت في المحفوظ بقراءة بعدها، فلا تُضاف: عدّها مرّتين يرفض بالفحص قبل الحفظ رقماً صحيحاً؛
 * والمنتظرة والمعلّقة بالهويّة أو الاشتراك لم تصل الخادم يقيناً.
 * وهلاكات اليوم مرّة (set_flock_dead، 0036) تُضاف إلى نافق يوم لم تُسجَّل هلاكاته وحده، كما يفعل الخادم (يوم سُجّلت هلاكاته لا يُكتب فيه شيء): فلا تُعدّ
 * مرّتين ولو كانت في المحفوظ بقراءة بعدها؛ والغاز بنوعيه خارج مجموع اليوم.
 */
export function soFar(saved: (Pick<DayValues, 'dead' | 'culled' | 'feedKg' | 'eggsTotal' | 'eggsBroken'> & { deadEntered?: boolean | null }) | null, ops: readonly OutboxOp[]): SoFar {
  const total: SoFar = {
    dead: saved?.dead ?? 0,
    culled: saved?.culled ?? 0,
    feedKg: saved?.feedKg ?? null,
    eggsTotal: saved?.eggsTotal ?? null,
    eggsBroken: saved?.eggsBroken ?? null,
    deadEntered: saved === null ? false : (saved.deadEntered ?? (saved.dead ?? 0) + (saved.culled ?? 0) > 0),
    deadPending: false,
  };
  const enter = () => {
    total.deadEntered = true;
    total.deadPending = true;
  };
  for (const op of [...ops].sort((a, b) => a.createdAt - b.createdAt)) {
    if (op.fn === 'set_flock_gas' || op.fn === 'add_flock_gas') continue;
    if (op.fn === 'set_flock_dead') {
      if (!total.deadEntered) total.dead += op.payload.dead;
      enter();
      continue;
    }
    if (op.fn === 'save_flock_visit') {
      const visit = op.payload;
      if (!visit.void && (visit.dead !== null || visit.culled !== null)) enter();
      if (op.baseVersion !== null || visit.void || op.state === 'sending' || op.state === 'unknown') continue;
      total.dead += visit.dead ?? 0;
      total.culled += visit.culled ?? 0;
      total.feedKg = addMilli(total.feedKg, milli(visit.feed_kg));
      total.eggsTotal = add(total.eggsTotal, visit.eggs_total);
      total.eggsBroken = add(total.eggsBroken, visit.eggs_broken);
      continue;
    }
    const day = op.payload;
    if ((day.dead ?? null) !== null || (day.culled ?? null) !== null) enter();
    total.dead = day.dead ?? total.dead;
    total.culled = day.culled ?? total.culled;
    total.feedKg = milli(day.feed_kg) ?? total.feedKg;
    total.eggsTotal = day.eggs_total ?? total.eggsTotal;
    total.eggsBroken = day.eggs_broken ?? total.eggsBroken;
  }
  return total;
}

/** غاز اليوم حتى الآن (0036): المحفوظ، أو null، ثمّ عمليات هذا الجهاز لليوم بترتيبها. */
export interface GasSoFar {
  /** القناني كما يجب أن تُرى، أو null: لم يُسجَّل غاز اليوم. */
  cylinders: number | null;
  /** على هذا الجهاز عملية غاز لم تُرفع. */
  pending: boolean;
}

/**
 * التصحيح (set_flock_gas) يحلّ محلّ المجموع، والإضافة (add_flock_gas) تُضاف إليه؛ والإضافة في الطريق أو المجهولة ربّما صارت في المحفوظ بقراءة بعدها
 * فلا تُضاف (كالزيارة الجديدة)، والتصحيح يُطبَّق في كلّ حالاته (تطبيقه مرّتين القيمة نفسها).
 */
export function gasSoFar(saved: number | null, ops: readonly OutboxOp[]): GasSoFar {
  const total: GasSoFar = { cylinders: saved, pending: false };
  for (const op of [...ops].sort((a, b) => a.createdAt - b.createdAt)) {
    if (op.fn === 'set_flock_gas') {
      total.cylinders = op.payload.cylinders;
      total.pending = true;
    } else if (op.fn === 'add_flock_gas') {
      total.pending = true;
      if (op.state !== 'sending' && op.state !== 'unknown') total.cylinders = (total.cylinders ?? 0) + op.payload.add;
    }
  }
  return total;
}

/**
 * كمية العلف بوحدة أساسه بالفصحى وبفواصل الآلاف: «2,500 كغم» (الكيلو اختصار ثابت ولو تجاوز الطنّ، كعمود الورقة)، و«لتران»، و«5 لترات». هنا (محفوظ للفتح
 * بلا نت) لـ«أُرسل اليوم» في الجولة، ولإرسال العلف في حزمة القاعات.
 */
export const feedAmount = (qty: Milli, unit: BaseUnit): string => (unit === 'kg' ? t('sheet.feed.kg', '{qty} كغم', { qty: fmtMilli(qty) }) : fmtQty(qty, unit).main);

/** القناني بالفصحى: «قنينة واحدة»، «قنينتان»، «3 قناني»، «11 قنينة»، و«لا قناني» للصفر. */
export function cylindersText(n: number): string {
  if (n === 0) return t('round.gas.none_count', 'لا قناني');
  if (n === 1) return t('round.gas.one', 'قنينة واحدة');
  if (n === 2) return t('round.gas.two', 'قنينتان');
  const form = countForm(n);
  return form === 'few' ? t('round.gas.few', '{n} قناني', { n: fmtInt(n) }) : t('round.gas.many', '{n} قنينة', { n: fmtInt(n) });
}

/**
 * stale_visit بجملة (رفّ المراجعة وتنبيه الحفظ). الخادم يرجع الزيارة كما هي عنده (ملغاة: voided، إن أُلغيت من جهاز آخر)، أو null حين لا زيارة
 * بهذا المعرّف عنده (لم تصل: رُدّت إضافتها أو لم تُحفظ).
 */
export function staleVisitText(server: unknown): string {
  if (server === null || typeof server !== 'object') return t('visits.stale.missing', 'لم تصل هذه الزيارة إلى الخادم (رُدّت إضافتها أو لم تُحفظ)، فلا شيء فيه يُعدَّل أو يُلغى.');
  if ((server as { voided?: unknown }).voided === true) return t('round.review.gone_visit', 'أُلغيت هذه الزيارة من جهاز آخر قبل أن يصل طلبك، فلم يُكتب شيء.');
  return t('round.review.stale_visit', 'تغيّرت هذه الزيارة من جهاز آخر قبل أن يصل طلبك، فلم يُكتب فوقها.');
}

/** «اليوم حتى الآن» لخانة: العدد بفواصله، والعلف بالكيلو، و«—» لما لم يُسجَّل. */
export function soFarText(total: SoFar, field: keyof RoundText): string {
  if (field === 'feedKg') return total.feedKg === null ? '—' : fmtMilli(total.feedKg);
  const value = field === 'dead' ? total.dead : field === 'culled' ? total.culled : field === 'eggsTotal' ? total.eggsTotal : total.eggsBroken;
  return value === null ? '—' : fmtInt(value);
}

/** سبب ركن عملية (جواب parked وflock_day_rejects) بجملة: للجولة وورقة القاعة ورفّ المراجعة. */
export function parkText(reason: string | null): string {
  switch (reason) {
    case 'flock_closed':
      return t('sheet.park.closed', 'كانت الوجبة مغلقة حين وصل');
    case 'out_of_scope':
      return t('sheet.park.scope', 'لم يكن لمن أرسله وصول إلى القاعة');
    case 'period_locked':
      return t('sheet.park.locked', 'كان اليوم في فترة حسابات مقفلة');
    case 'date_too_old':
      return t('sheet.park.old', 'كان اليوم أقدم من سبعة أيام قبل أن يُرفع هذا الحدّ');
    default:
      return t('sheet.park.other', 'رُدّ من الخادم');
  }
}

export const amountText = (value: bigint | string | null | undefined): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'bigint') return decimalText(value, 3).replace(/\.?0+$/, '');
  return value.replace(/\.?0+$/, '');
};
export const countText = (value: number | null | undefined): string => (value === null || value === undefined ? '' : String(value));

export function errorText(error: RoundError, liveStart: number): string {
  switch (error) {
    case 'bad_count':
      return t('round.error.bad_count', 'اكتب عدداً صحيحاً: صفر أو أكثر.');
    case 'bad_amount':
      return t('round.error.bad_amount', 'اكتب كمية صحيحة بثلاث مراتب عشرية على الأكثر، مثل 1250.5.');
    case 'live_negative':
      return t('round.error.live_negative', 'النافق والمستبعد أكثر من الطيور الحيّة بداية اليوم ({live}).', { live: fmtInt(liveStart) });
    case 'eggs_need_total':
      return t('round.error.eggs_need_total', 'اكتب مجموع البيض قبل المكسور.');
    case 'eggs_over_total':
      return t('round.error.eggs_over_total', 'المكسور أكثر من مجموع البيض.');
    case 'cracked_need_total':
      return t('round.error.cracked_need_total', 'في هذه الزيارة بيض مشعور يبقى كما هو، فاكتب مجموع البيض.');
    case 'cracked_over_total':
      return t('round.error.cracked_over_total', 'المكسور والمشعور معاً أكثر من مجموع البيض (المشعور في هذه الزيارة يبقى كما هو).');
    case 'eggs_over_live':
      return t('round.error.eggs_over_live', 'البيض أكثر من الدجاج الحيّ بداية اليوم ({live})، والنسبة فوق 100% غلط إدخال.', { live: fmtInt(liveStart) });
    case 'eggs_on_broiler':
      return t('round.error.eggs_on_broiler', 'لا بيض لفوج لحم.');
  }
}
