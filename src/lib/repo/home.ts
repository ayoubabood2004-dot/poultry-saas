import { parseDecimal, toScale } from '../../domain/decimal';
import type { Fils, Milli } from '../../domain/money';
import { call } from './core';

// أرقام اليوم لبطاقات الرئيسية من دالّة وحدة بالقاعدة (home_summary، E38) تكبر بكل حزمة، مو من سحب الصفوف. ملف كسول بحزمة
// الرئيسية (المرحلة 1 WP3): index ما يصدّره، فما يدخل مسار الجلسة الحرج.

/** أرقام اليوم لبطاقات الرئيسية، لكل وحدة ضمن نطاق المستخدم. */
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
  medicine?: { nearExpiry: number; belowMinimum: number };
  /** أفراخ بمخازن المفقس فاتها 48 ساعة من فقسها (E24؛ تنبيه مو منع). */
  oldChicks?: number;
  general?: { belowMinimum: number };
  /** مواد تحت الحدّ الأدنى بمخازن المعمل (المواد الأوّلية والإضافات والتعبئة، والعلف، E22). */
  millBelowMinimum?: number;
  /** مواد تحت الحدّ الأدنى بمخازن المفقس (بيض التفقيس والأفراخ، E22). */
  hatcheryBelowMinimum?: number;
  /**
   * لأدوار الحسابات بس (الخادم ما يرجّعها لغيرهم). visibleBooks من totalBooks: القارئ المحصور بوحدات (E49) أرقامه من دفاتر
   * نطاقه بس، فالبطاقة تكتب «N من المجموع».
   */
  accounts?: { receivable: Fils; payable: Fils; negativeBoxes: number; visibleBooks: number; totalBooks: number };
}

export class HomeShapeError extends Error {
  constructor(readonly field: string) {
    super(`home_shape:${field}`);
    this.name = 'HomeShapeError';
  }
}

const fils = (json: Record<string, unknown>, field: string): Fils => {
  const value = typeof json[field] === 'string' ? parseDecimal(json[field] as string, 2) : null;
  if (value === null) throw new HomeShapeError(field);
  return toScale(value, 2);
};

const record = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HomeShapeError(field);
  return value as Record<string, unknown>;
};

const count = (json: Record<string, unknown>, field: string): number => {
  const value = json[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new HomeShapeError(field);
  return value;
};

export function parseHomeSummary(value: unknown): HomeSummary {
  const json = record(value, 'summary');
  const out: HomeSummary = {};
  if (json.accounts !== undefined) {
    const accounts = record(json.accounts, 'accounts');
    const books = record(accounts.books, 'books');
    out.accounts = { receivable: fils(accounts, 'receivable'), payable: fils(accounts, 'payable'), negativeBoxes: count(accounts, 'negative_boxes'), visibleBooks: count(books, 'visible'), totalBooks: count(books, 'total') };
  }
  // تنبيهات المخزون لكل وحدة بمخازن النطاق (0007): تحت الحدّ الأدنى لكل وحدة تستلم المادّة من المورّد (E22: المعمل والأدوية
  // والعامّة والمفقس)، وقريب الانتهاء للأدوية، وأفراخ المفقس فاتها 48 ساعة. حقول اللحم والبيض ما تستلم من المورّد (صفر دائماً).
  if (json.stock !== undefined) {
    if (!Array.isArray(json.stock)) throw new HomeShapeError('stock');
    for (const entry of json.stock) {
      const row = record(entry, 'stock');
      if (row.kind === 'feed_mill') out.millBelowMinimum = count(row, 'below_min');
      if (row.kind === 'medicine') out.medicine = { nearExpiry: count(row, 'near_expiry'), belowMinimum: count(row, 'below_min') };
      if (row.kind === 'general') out.general = { belowMinimum: count(row, 'below_min') };
      if (row.kind === 'hatchery') {
        out.oldChicks = count(row, 'old_chicks');
        out.hatcheryBelowMinimum = count(row, 'below_min');
      }
    }
  }
  return out;
}

export async function loadHomeSummary(): Promise<HomeSummary> {
  return parseHomeSummary(await call<unknown>('home_summary'));
}
