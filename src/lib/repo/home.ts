import type { Fils, Milli } from '../../domain/money';
import { hasBackend } from '../env';
import { notConnected } from './core';

/** أرقام اليوم لبطاقات الرئيسية، لكل وحدة ضمن نطاق المستخدم. تجي من دالّة واحدة بالقاعدة، مو من سحب الصفوف. */
export interface HomeSummary {
  feedMill?: { producedTodayKg: Milli; feedInStockKg: Milli };
  broiler?: {
    activeFlocks: number;
    deadToday: number;
    /** أصغر وأكبر عمر بالأيام بين الأفواج الشغّالة (FOUNDATION: «الأفواج الشغّالة وأعمارها»)؛ null بلا فوج. */
    ageDays: { min: number; max: number } | null;
  };
  layer?: { eggsToday: number; hdepPercent: string | null; traysInStore: Milli };
  hatchery?: {
    batchesSetting: number;
    chicksWaiting: number;
    /** أيام لأقرب إخراج متوقّع بين الوجبات بالمكينة («وأيامها الباقية»)، سالب = فات موعده؛ null بلا وجبة. */
    nextHatchInDays: number | null;
  };
  medicine?: { nearExpiry: number };
  general?: { belowMinimum: number };
  accounts?: { receivable: Fils; payable: Fils };
}

/** دالّة الملخّص تنبني ويّا المرحلة 1: لحدّها القاعدة مربوطة والأرقام فارغة («—»)، مو «غير مربوط». */
export async function loadHomeSummary(): Promise<HomeSummary> {
  if (!hasBackend()) notConnected();
  return {};
}
