import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0005 (المواقع والمخازن والمواد ووحدات التعبئة والتصنيفات ونطاق الموظف)، بنفس عقد constraints.ts: مفتاح
// constraint.<اسم القيد>، والحزمة (constraints.test) تقارن القواميس كلها سوا بكتالوج القاعدة. ينحمّل ويّا inventory.ts بس.

export const STORES_CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  member_scopes_one_target: () => t('constraint.member_scopes_one_target', 'صفّ النطاق يحدّد هدفاً واحداً بالضبط: وحدة أو موقعاً أو مخزناً.'),
  sites_name_check: () => t('constraint.sites_name_check', 'اسم الموقع مطلوب، ولا يزيد على 80 حرفاً.'),
  sites_kind_check: () => t('constraint.sites_kind_check', 'نوع الموقع غير معروف. اختر حقلاً أو معملاً أو مفقساً أو مخزناً.'),
  warehouses_name_check: () => t('constraint.warehouses_name_check', 'اسم المخزن مطلوب، ولا يزيد على 80 حرفاً.'),
  warehouses_kind_check: () => t('constraint.warehouses_kind_check', 'نوع المخزن غير معروف.'),
  pack_types_label_check: () => t('constraint.pack_types_label_check', 'اسم حجم التعبئة مطلوب، ولا يزيد على 40 حرفاً.'),
  pack_types_dimension_check: () => t('constraint.pack_types_dimension_check', 'حجم التعبئة إمّا بالكيلو أو باللتر أو بالعدد.'),
  pack_types_factor_check: () => t('constraint.pack_types_factor_check', 'حجم التعبئة أكبر من صفر، بستّ مراتب عشرية كحدّ أقصى.'),
  pack_types_count_whole_check: () => t('constraint.pack_types_count_whole_check', 'حجم التعبئة بالعدد عدد صحيح من القطع.'),
  item_categories_name_check: () => t('constraint.item_categories_name_check', 'اسم التصنيف مطلوب، ولا يزيد على 80 حرفاً.'),
  items_name_check: () => t('constraint.items_name_check', 'اسم المادّة مطلوب، ولا يزيد على 120 حرفاً.'),
  items_name_norm_check: () => t('constraint.items_name_norm_check', 'اكتب اسماً بحروف؛ التطويل والتشكيل وحدهما لا يكفيان للبحث.'),
  items_kind_check: () => t('constraint.items_kind_check', 'نوع المادّة غير معروف.'),
  items_base_unit_check: () => t('constraint.items_base_unit_check', 'تُعدّ المادّة بالكيلوغرام أو باللتر أو بالعدد.'),
  items_count_kinds_check: () => t('constraint.items_count_kinds_check', 'بيض التفقيس والأفراخ وبيض المائدة تُعدّ بالقطعة دائماً.'),
  items_density_check: () => t('constraint.items_density_check', 'الكثافة أكبر من صفر، بأربع مراتب عشرية كحدّ أقصى.'),
  items_density_unit_check: () => t('constraint.items_density_unit_check', 'الكثافة للمادّة السائلة (باللتر) فقط.'),
  items_piece_mass_check: () => t('constraint.items_piece_mass_check', 'كتلة القطعة أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.'),
  items_piece_mass_unit_check: () => t('constraint.items_piece_mass_unit_check', 'كتلة القطعة للمادّة المعدودة (بالقطعة) فقط.'),
  items_scale_step_check: () => t('constraint.items_scale_step_check', 'خطوة العدّاد أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.'),
  items_min_qty_check: () => t('constraint.items_min_qty_check', 'الحدّ الأدنى صفر أو أكثر، بثلاث مراتب عشرية كحدّ أقصى.'),
  items_pieces_whole_check: () => t('constraint.items_pieces_whole_check', 'المادّة المعدودة خطوتها وحدّها الأدنى أعداد صحيحة.'),
  items_barcode_check: () => t('constraint.items_barcode_check', 'الباركود لا يزيد على 64 حرفاً.'),
  items_alt_codes_check: () => t('constraint.items_alt_codes_check', 'الرموز الإضافية 20 رمزاً كحدّ أقصى، ولا رمز فارغ بينها.'),
  item_units_label_check: () => t('constraint.item_units_label_check', 'اسم الوحدة مطلوب، ولا يزيد على 40 حرفاً.'),
  item_units_factor_check: () => t('constraint.item_units_factor_check', 'معامل الوحدة أكبر من صفر، بستّ مراتب عشرية كحدّ أقصى.'),
  expense_categories_name_check: () => t('constraint.expense_categories_name_check', 'اسم فئة المصروف مطلوب، ولا يزيد على 80 حرفاً.'),
  expense_categories_system_code_check: () => t('constraint.expense_categories_system_code_check', 'رمز الفئة النظامية غير صالح.'),
};


registerConstraintHints(STORES_CONSTRAINT_HINTS);
