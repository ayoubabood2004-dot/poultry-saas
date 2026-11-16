import { decimalText } from '../../domain/decimal';
import type { RoundError } from '../../domain/flocks';
import { fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { flockDayTransport } from '../../lib/repo/flocks';

// نصوص الجولة المشتركة بين الجولة اليومية (محفوظة للفتح بلا نت) وجولة يوم من صفحة القاعة (حزمة القاعات، كلمة المالك 2026-11-16):
// ملف صغير بينهما، حتى لا تجرّ صفحة القاعة الجولة كلّها إلى حزمتها.

export const loadTransport = async () => flockDayTransport;

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
