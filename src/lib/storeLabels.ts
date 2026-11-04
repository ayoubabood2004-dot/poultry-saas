import { searchable } from '../domain/normalize';
import type { ItemKind, SiteKind, WarehouseKind } from '../domain/stores';
import type { BaseUnit, Dimension } from '../domain/units';
import { t } from './i18n';
import type { CategoryRow, ItemTwin } from './repo/inventory';

// أسماء أنواع المواقع والمخازن والمواد ووحدات الأساس بالعرض (0005). ملف كسول (شاشات المخازن والإعدادات بس)، فما يدخل حزمة
// الإقلاع. مفاتيح t() حرفية (i18n-guard يرفض المفتاح المركّب).
//
// ومعها أدوات المادّة المشتركة بين صفحة «المواد» ونافذة «مادّة جديدة» (الملاحظة #21: صفحة المواد بالتدفّق نفسه): رابط الشراء
// والتوائم الفعّالة والتصنيف باسم المادّة. هنا لا في stock-shared لأنّ هذا الملف بحزمة stores-admin المشتركة (المستثناة من
// التثبيت المسبق)، واستيراد stock-shared أو ItemCreate من صفحة المواد يقسمهما حزمة محفوظة تستورد المستثناة (pwa-guard).

/** ‎/inventory/receipts?new=1&wh=<المخزن>&item=<المادّة>؛ بلا مخزن يُختار المخزن بالنموذج (كلمة المالك 2026-11-04). */
export function buyPath(itemId: string, warehouseId: string | null): string {
  const params = new URLSearchParams({ new: '1' });
  if (warehouseId) params.set('wh', warehouseId);
  params.set('item', itemId);
  return `/inventory/receipts?${params.toString()}`;
}

/** التوائم التي يصحّ أن يُسجَّل لها شراء أو تُستعمل: فعّالة، بالاسم نفسه أو برمز مشترك (الرمز يدلّ على المادّة نفسها). */
export function activeTwins(twins: readonly ItemTwin[] | null): ItemTwin[] {
  return (twins ?? []).filter((twin) => !twin.archived && (twin.sameName || twin.codes.length > 0));
}

/**
 * التصنيف المختار باسم المادّة نفسه (كلمة المالك 2026-11-04: أنشأ تصنيف «ذرة» لمادّة «ذرة» وتصنيف «صويا» لـ«صويا»): التصنيف
 * قسم يجمع موادّ كثيرة، فاسمه مثل اسم المادّة علامة على أنّه أُنشئ لها وحدها. المقارنة بالاسم المطبَّع (searchable).
 */
export function categoryNamedLikeItem(itemName: string, category: Pick<CategoryRow, 'name'> | undefined): boolean {
  if (!category) return false;
  const name = searchable(itemName);
  return name !== '' && searchable(category.name) === name;
}

export function siteKindLabel(kind: SiteKind): string {
  switch (kind) {
    case 'farm':
      return t('site.kind.farm', 'حقل');
    case 'mill':
      return t('site.kind.mill', 'معمل');
    case 'hatchery':
      return t('site.kind.hatchery', 'مفقس');
    case 'store':
      return t('site.kind.store', 'مخزن');
  }
}

export function warehouseKindLabel(kind: WarehouseKind): string {
  switch (kind) {
    case 'raw':
      return t('warehouse.kind.raw', 'موادّ أوّلية');
    case 'feed':
      return t('warehouse.kind.feed', 'علف');
    case 'medicine':
      return t('warehouse.kind.medicine', 'أدوية');
    case 'general':
      return t('warehouse.kind.general', 'عامّ');
    case 'hatching_egg':
      return t('warehouse.kind.hatching_egg', 'بيض تفقيس');
    case 'chick':
      return t('warehouse.kind.chick', 'أفراخ');
    case 'table_egg':
      return t('warehouse.kind.table_egg', 'بيض مائدة');
    case 'farm':
      return t('warehouse.kind.farm', 'مخزن حقل');
  }
}

export function itemKindLabel(kind: ItemKind): string {
  switch (kind) {
    case 'raw':
      return t('item.kind.raw', 'مادّة أوّلية');
    case 'additive':
      return t('item.kind.additive', 'إضافة');
    case 'feed':
      return t('item.kind.feed', 'علف');
    case 'medicine':
      return t('item.kind.medicine', 'دواء');
    case 'vaccine':
      return t('item.kind.vaccine', 'لقاح');
    case 'fuel':
      return t('item.kind.fuel', 'وقود');
    case 'packaging':
      return t('item.kind.packaging', 'تعبئة');
    case 'hatching_egg':
      return t('item.kind.hatching_egg', 'بيض تفقيس');
    case 'chick':
      return t('item.kind.chick', 'أفراخ');
    case 'table_egg':
      return t('item.kind.table_egg', 'بيض مائدة');
    case 'equipment':
      return t('item.kind.equipment', 'معدّات');
    case 'other':
      return t('item.kind.other', 'أخرى');
  }
}

/**
 * اسم النوع بمثال لقائمة الاختيار في نموذج المادّة (كلمة المالك 2026-11-04): أنشأ «ذرة» و«صويا» و«زيت» بنوع «علف» لأنّ
 * الاسم وحده لا يقول إنّ «علف» هو العلف الجاهز من المعمل وإنّ الذرة «مادّة أوّلية». المثال يقول ما يدخل تحت كلّ نوع.
 */
export function itemKindOption(kind: ItemKind): string {
  switch (kind) {
    case 'raw':
      return t('item.kind.option.raw', 'مادّة أوّلية للعلف: ذرة، صويا، نخالة…');
    case 'additive':
      return t('item.kind.option.additive', 'إضافة للعلف: فيتامينات، أملاح، إنزيمات…');
    case 'feed':
      return t('item.kind.option.feed', 'علف جاهز: ناتج المعمل، أو علف يُشترى جاهزاً');
    case 'medicine':
      return t('item.kind.option.medicine', 'دواء: مضادّات حيوية، فيتامينات للماء…');
    case 'vaccine':
      return t('item.kind.option.vaccine', 'لقاح: نيوكاسل، كمبورو…');
    case 'fuel':
      return t('item.kind.option.fuel', 'وقود: كاز، بنزين، غاز…');
    case 'packaging':
      return t('item.kind.option.packaging', 'تعبئة: أكياس، كراتين، أطباق…');
    case 'hatching_egg':
      return t('item.kind.option.hatching_egg', 'بيض تفقيس');
    case 'chick':
      return t('item.kind.option.chick', 'أفراخ عمر يوم');
    case 'table_egg':
      return t('item.kind.option.table_egg', 'بيض مائدة');
    case 'equipment':
      return t('item.kind.option.equipment', 'معدّات: معالف، مناهل، أدوات…');
    case 'other':
      return t('item.kind.option.other', 'أخرى');
  }
}

export function baseUnitLabel(unit: BaseUnit): string {
  switch (unit) {
    case 'kg':
      return t('unit.kg', 'كغم');
    case 'L':
      return t('unit.L', 'لتر');
    case 'pc':
      return t('unit.pc', 'قطعة');
  }
}

export function dimensionLabel(dimension: Dimension): string {
  switch (dimension) {
    case 'mass':
      return t('dimension.mass', 'بالكيلو');
    case 'volume':
      return t('dimension.volume', 'باللتر');
    case 'count':
      return t('dimension.count', 'بالعدد');
  }
}
