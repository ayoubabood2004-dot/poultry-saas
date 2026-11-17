import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { RoundError, RoundText } from '../../domain/flocks';
import { fmtInt, fmtMilli } from '../../lib/format';
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
}

const milli = (text: string | null | undefined): bigint | null => {
  const value = text ? parseDecimal(text, 3) : null;
  return value ? toScale(value, 3) : null;
};
const add = (sum: number | null, more: number | null): number | null => (more === null ? sum : (sum ?? 0) + more);
const addMilli = (sum: bigint | null, more: bigint | null): bigint | null => (more === null ? sum : (sum ?? 0n) + more);

/**
 * مجموع اليوم حتى الآن (0032): المحفوظ (صفّ اليوم) ثمّ عمليات هذا الجهاز لذلك اليوم بترتيبها — الزيارة الجديدة تُضاف، ومجموع اليوم القديم
 * (save_flock_day مخزّنة قبل 0032) يحلّ محلّ خاناته المكتوبة، وتعديل زيارة محفوظة أو إلغاؤها لا يُعرف فرقه هنا فيبقى للخادم.
 */
export function soFar(saved: Pick<DayValues, 'dead' | 'culled' | 'feedKg' | 'eggsTotal' | 'eggsBroken'> | null, ops: readonly OutboxOp[]): SoFar {
  const total: SoFar = { dead: saved?.dead ?? 0, culled: saved?.culled ?? 0, feedKg: saved?.feedKg ?? null, eggsTotal: saved?.eggsTotal ?? null, eggsBroken: saved?.eggsBroken ?? null };
  for (const op of [...ops].sort((a, b) => a.createdAt - b.createdAt)) {
    if (op.fn === 'save_flock_visit') {
      const visit = op.payload;
      if (op.baseVersion !== null || visit.void) continue;
      total.dead += visit.dead;
      total.culled += visit.culled;
      total.feedKg = addMilli(total.feedKg, milli(visit.feed_kg));
      total.eggsTotal = add(total.eggsTotal, visit.eggs_total);
      total.eggsBroken = add(total.eggsBroken, visit.eggs_broken);
      continue;
    }
    const day = op.payload;
    total.dead = day.dead ?? total.dead;
    total.culled = day.culled ?? total.culled;
    total.feedKg = milli(day.feed_kg) ?? total.feedKg;
    total.eggsTotal = day.eggs_total ?? total.eggsTotal;
    total.eggsBroken = day.eggs_broken ?? total.eggsBroken;
  }
  return total;
}

/** «اليوم حتى الآن» لخانة: العدد بفواصله، والعلف بالكيلو، و«—» لما لم يُسجَّل. */
export function soFarText(total: SoFar, field: keyof RoundText): string {
  if (field === 'feedKg') return total.feedKg === null ? '—' : fmtMilli(total.feedKg);
  const value = field === 'dead' ? total.dead : field === 'culled' ? total.culled : field === 'eggsTotal' ? total.eggsTotal : total.eggsBroken;
  return value === null ? '—' : fmtInt(value);
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
    case 'eggs_over_live':
      return t('round.error.eggs_over_live', 'البيض أكثر من الدجاج الحيّ بداية اليوم ({live})، والنسبة فوق 100% غلط إدخال.', { live: fmtInt(liveStart) });
    case 'eggs_on_broiler':
      return t('round.error.eggs_on_broiler', 'لا بيض لفوج لحم.');
  }
}
