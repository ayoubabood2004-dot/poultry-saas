import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0015 (الخلطات ونسخها وسطورها، ودفعات الإنتاج ومدخلاتها ومالها)، بنفس عقد constraints.ts: مفتاح
// constraint.<اسم القيد>، والحزمة (constraints.test) تقارن القواميس كلّها بكتالوج القاعدة. يُحمَّل مع mill.ts وحده.

export const MILL_CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  recipes_name_check: () => t('constraint.recipes_name_check', 'اسم الخلطة مطلوب، ولا يزيد على 80 حرفاً.'),
  recipes_name_norm_check: () => t('constraint.recipes_name_norm_check', 'اسم الخلطة يحتاج حرفاً واحداً على الأقلّ غير التشكيل والتطويل.'),
  recipes_note_check: () => t('constraint.recipes_note_check', 'ملاحظة الخلطة لا تزيد على 500 حرف.'),
  recipes_version_check: () => t('constraint.recipes_version_check', 'نسخة الخلطة يكتبها الخادم.'),
  recipe_versions_basis_check: () => t('constraint.recipe_versions_basis_check', 'أساس الخلطة بالكيلوغرام أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  recipe_versions_status_check: () => t('constraint.recipe_versions_status_check', 'حالة نسخة الخلطة غير معروفة.'),
  recipe_versions_version_no_check: () => t('constraint.recipe_versions_version_no_check', 'رقم نسخة الخلطة يكتبه الخادم.'),
  recipe_versions_note_check: () => t('constraint.recipe_versions_note_check', 'ملاحظة النسخة لا تزيد على 500 حرف.'),
  recipe_versions_version_check: () => t('constraint.recipe_versions_version_check', 'نسخة الصفّ يكتبها الخادم.'),
  recipe_versions_stamp_check: () => t('constraint.recipe_versions_stamp_check', 'ختم التفعيل والتقاعد يكتبه الخادم عند تفعيل النسخة.'),
  recipe_lines_qty_check: () => t('constraint.recipe_lines_qty_check', 'كمية المادّة في الخلطة أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  recipe_lines_unit_check: () => t('constraint.recipe_lines_unit_check', 'وحدة سطر الخلطة إمّا كيلوغرام أو لتر.'),
  recipe_lines_density_check: () => t('constraint.recipe_lines_density_check', 'كثافة السائل أكبر من صفر، بأربع مراتب عشرية على الأكثر.'),
  recipe_lines_line_no_check: () => t('constraint.recipe_lines_line_no_check', 'رقم السطر يكتبه الخادم.'),
  production_batches_planned_check: () => t('constraint.production_batches_planned_check', 'كمية الإنتاج بالكيلوغرام أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  production_batches_output_qty_check: () => t('constraint.production_batches_output_qty_check', 'وزن الناتج بالكيلوغرام أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  production_batches_input_mass_check: () => t('constraint.production_batches_input_mass_check', 'كتلة المدخلات يحسبها الخادم عند الترحيل.'),
  production_batches_shrink_check: () => t('constraint.production_batches_shrink_check', 'الهدر يحسبه الخادم عند الترحيل.'),
  production_batches_status_check: () => t('constraint.production_batches_status_check', 'حالة دفعة الإنتاج غير معروفة.'),
  production_batches_version_check: () => t('constraint.production_batches_version_check', 'نسخة الدفعة يكتبها الخادم.'),
  production_batches_note_check: () => t('constraint.production_batches_note_check', 'ملاحظة الدفعة لا تزيد على 500 حرف.'),
  production_batches_shrink_reason_check: () => t('constraint.production_batches_shrink_reason_check', 'سبب الهدر من 3 إلى 500 حرف.'),
  production_batches_void_reason_check: () => t('constraint.production_batches_void_reason_check', 'سبب الإلغاء من 3 إلى 500 حرف.'),
  production_batches_draft_check: () => t('constraint.production_batches_draft_check', 'رقم الدفعة وختم ترحيلها ودفعة ناتجها يكتبها الخادم عند الترحيل.'),
  production_batches_posted_check: () => t('constraint.production_batches_posted_check', 'الدفعة المرحَّلة لها رقم ووزن ناتج ودفعة ناتج وكتلة مدخلات وهدر، يكتبها الخادم.'),
  production_batches_void_check: () => t('constraint.production_batches_void_check', 'ختم الإلغاء وسببه يكتبهما الخادم عند الإلغاء.'),
  production_batches_stores_check: () => t('constraint.production_batches_stores_check', 'مخزن المواد ومخزن العلف لا يكونان واحداً.'),
  production_batches_costs_check: () => t('constraint.production_batches_costs_check', 'ختم الكلف يكتبه الخادم عند ختمها.'),
  production_inputs_base_unit_check: () => t('constraint.production_inputs_base_unit_check', 'مواد الخلطة تُقاس بالكيلوغرام أو باللتر.'),
  production_inputs_density_check: () => t('constraint.production_inputs_density_check', 'السائل يحتاج كثافة محفوظة، وغير السائل لا كثافة له.'),
  production_inputs_planned_check: () => t('constraint.production_inputs_planned_check', 'الكمية المخطّطة أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  production_inputs_planned_mass_check: () => t('constraint.production_inputs_planned_mass_check', 'الكتلة المخطّطة يحسبها الخادم من الخلطة.'),
  production_inputs_actual_check: () => t('constraint.production_inputs_actual_check', 'الكمية الفعلية أكبر من صفر، بثلاث مراتب عشرية على الأكثر، أو اتركها فارغة لتُسحب الكمية المخطّطة.'),
  production_inputs_reason_check: () => t('constraint.production_inputs_reason_check', 'سبب المادّة البديلة من 3 إلى 500 حرف.'),
  production_inputs_line_no_check: () => t('constraint.production_inputs_line_no_check', 'رقم السطر يكتبه الخادم.'),
  production_values_input_check: () => t('constraint.production_values_input_check', 'كلفة المدخلات يحسبها الخادم من سحوباتها.'),
  production_values_extra_check: () => t('constraint.production_values_extra_check', 'الكلف اليدوية يحسبها الخادم.'),
  production_values_total_check: () => t('constraint.production_values_total_check', 'كلفة الدفعة = كلفة المدخلات + الكلف اليدوية، يحسبها الخادم.'),
  production_input_values_value_check: () => t('constraint.production_input_values_value_check', 'قيمة المدخل يحسبها الخادم من سحبه.'),
};

registerConstraintHints(MILL_CONSTRAINT_HINTS);
