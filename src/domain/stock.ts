import type { ItemKind, WarehouseKind } from './stores';

// أهلية المادّة بالمخزن والاستلام من المورّد (0007، FOUNDATION «نموذج البيانات» ٢٨٠–٢٨٦). مرآة private.item_admissible
// وprivate.receiving_kinds خانةً خانة (stock.test يقارنهما على كل الأزواج). ملف لحاله: تستورده شاشات المخزون بس، فما يكبر
// حزم البيانات الأساسية.

/** نوع المخزن ← أنواع المواد المسموحة بيه لأي حركة. */
export const ADMISSIBLE: Readonly<Record<WarehouseKind, readonly ItemKind[]>> = {
  raw: ['raw', 'additive', 'packaging', 'fuel'],
  feed: ['feed'],
  medicine: ['medicine', 'vaccine'],
  general: ['fuel', 'packaging', 'equipment', 'other'],
  hatching_egg: ['hatching_egg'],
  chick: ['chick'],
  table_egg: ['table_egg', 'packaging'],
  farm: ['feed', 'medicine', 'vaccine', 'fuel', 'packaging', 'equipment', 'other'],
};

export function itemAdmissible(warehouse: WarehouseKind, item: ItemKind): boolean {
  return ADMISSIBLE[warehouse].includes(item);
}

/** المخزن المستلم يقبل نوع مادّة واحد على الأقلّ يقبله المرسِل (وجهة تحويل ممكنة؛ الحكم لكل سطر بالخادم). */
export function sharesAdmissibleKind(from: WarehouseKind, to: WarehouseKind): boolean {
  return ADMISSIBLE[from].some((kind) => ADMISSIBLE[to].includes(kind));
}

/**
 * المخازن اللي تستلم نوع المادّة من المورّد (E22): الحدّ الأدنى ينقارن بمجموع المتاح بيها بالمنشأة، والتنبيه بلوحاتها. بيض المائدة
 * ما ينشترى (من الجولة، المرحلة 4).
 */
export const RECEIVING_KINDS: Readonly<Record<ItemKind, readonly WarehouseKind[]>> = {
  raw: ['raw'],
  additive: ['raw'],
  feed: ['feed'],
  medicine: ['medicine'],
  vaccine: ['medicine'],
  hatching_egg: ['hatching_egg'],
  chick: ['chick'],
  fuel: ['general'],
  equipment: ['general'],
  other: ['general'],
  packaging: ['raw', 'general'],
  table_egg: [],
};

/** تنبيه الفرخ بمخزن الأفراخ بعد 48 ساعة من فقسه (DECISIONS، القرار 12): تنبيه مو منع. */
export const CHICK_WARNING_HOURS = 48;
/** «قريب الانتهاء» بالأيام، للمنشأة كلها (E22). */
export const NEAR_EXPIRY_DAYS = 30;
