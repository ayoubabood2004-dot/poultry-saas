import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { fmtQty } from '../../lib/format';

// أدوات «المخزن ببساطة» (0017) المشتركة بين بطاقات المواد وملفّ المادّة ونافذة الشراء.

/**
 * الكمية بوحدة أساس المادّة دائماً («20,000 كغم» لا «20 طن»، و«0.25 كغم» لا «250 غرام»): كلمة المالك «مجموع كيلوات». fmtQty
 * يرسل الصيغة بوحدة الأساس في sub حين تختلف الرئيسية (الطنّ والغرام والملل)، وفي main حين لا تختلف.
 */
export function baseQty(qty: Milli, unit: BaseUnit): string {
  const shown = fmtQty(qty, unit);
  return shown.sub ?? shown.main;
}

/** ملفّ المادّة (وبنافذة «سجّل شراء» مفتوحة: buyPath في storeLabels). */
export function itemFilePath(itemId: string): string {
  return `/inventory/items/${itemId}`;
}
