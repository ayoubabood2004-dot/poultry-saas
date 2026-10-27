import type { ItemKind, SiteKind, WarehouseKind } from '../domain/stores';
import type { BaseUnit, Dimension } from '../domain/units';
import { t } from './i18n';

// أسماء أنواع المواقع والمخازن والمواد ووحدات الأساس بالعرض (0005). ملف كسول (شاشات المخازن والإعدادات بس)، فما يدخل حزمة
// الإقلاع. مفاتيح t() حرفية (i18n-guard يرفض المفتاح المركّب).

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
