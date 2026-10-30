import { t } from '../i18n';
import { unknownConstraint } from './core';

// قيد check رفض الصفّ (23514): الرسالة العامة «بعض القيم غير صحيحة» خفت بـdoctorVet رفض قيد كمية حقيقي (FOUNDATION ٨٠٨)،
// فكل قيد بالقاعدة إله جملة فصيحة هنا باسمه بالضبط، بمفتاح constraint.<اسم القيد>. الحزمة (constraints.test) تقارن هالقائمة
// بكتالوج القاعدة: قيد بلا جملة أو جملة بلا قيد يفشّلها، فكل هجرة تزيد قيداً تزيد جملته هنا.
// دوالّ مو نصوص: الجملة تنحسب بلحظة الخطأ (اللغة الثانية بعدين ملف ترجمة بنفس المفاتيح).
// الملف كسول (المرحلة 1 WP3): core.ts يجيبه بـimport() لحظة رفض قيد (explained)، فالقاموس برّا مسار الجلسة الحرج (السقف المقيس،
// DECISIONS «السقوف المقيسة»). وقواميس الوحدات (constraints-stores، constraints-ledger) تسجّل نفسها هنا لمّا ينحمّل ملف وحدتها
// ويّا شاشته (inventory.ts، parties.ts)، فتبقى بحزمة الشاشة برّا التثبيت المسبق: القيد ما ينخرق إلا من شاشة حمّلت ملفّها.

export const CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  orgs_name_check: () => t('constraint.orgs_name_check', 'اسم المنشأة مطلوب، ولا يزيد على 120 حرفاً.'),
  members_role_check: () => t('constraint.members_role_check', 'الدور غير معروف. اختر دوراً من الأدوار الثمانية.'),
  members_display_name_check: () => t('constraint.members_display_name_check', 'اسم الموظف مطلوب، ولا يزيد على 80 حرفاً.'),
  members_phone_check: () => t('constraint.members_phone_check', 'رقم الهاتف يجب أن يكون رقم موبايل عراقياً صحيحاً.'),
  divisions_kind_check: () => t('constraint.divisions_kind_check', 'نوع الوحدة غير معروف.'),
  divisions_name_check: () => t('constraint.divisions_name_check', 'اسم الوحدة مطلوب، ولا يزيد على 80 حرفاً.'),
  ledger_books_code_check: () => t('constraint.ledger_books_code_check', 'نوع الحساب غير معروف.'),
  ledger_books_name_check: () => t('constraint.ledger_books_name_check', 'اسم الحساب مطلوب، ولا يزيد على 80 حرفاً.'),
  audit_log_op_check: () => t('constraint.audit_log_op_check', 'نوع العملية في سجلّ التدقيق غير معروف.'),
  invite_codes_failures_check: () => t('constraint.invite_codes_failures_check', 'أُدخل رمز الدعوة خطأً أكثر من 5 مرات، فأُوقف. اطلب رمزاً جديداً.'),
  // جدول الوحدات الثابت (0004): ما ينكتب من الواجهة، بس كل قيد إله جملته حتى لو انخرق بهجرة.
  units_dimension_check: () => t('constraint.units_dimension_check', 'نوع الوحدة يجب أن يكون كتلة أو حجماً أو عدداً.'),
  units_base_check: () => t('constraint.units_base_check', 'تُعدّ المادّة بالكيلوغرام أو باللتر أو بالعدد.'),
  units_base_dimension_check: () => t('constraint.units_base_dimension_check', 'الوحدة لا تناسب طريقة العدّ: الوزن بالكيلوغرام، والحجم باللتر، والعدد بالقطعة.'),
  units_factor_check: () => t('constraint.units_factor_check', 'معامل الوحدة يجب أن يكون أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.'),
};

// قواميس الوحدات المسجّلة (الحزمة تمنع قيداً بقاموسين، فالترتيب ما يغيّر جملة).
const registered = new Map<string, () => string>();

export function registerConstraintHints(hints: Readonly<Record<string, () => string>>): void {
  for (const [name, hint] of Object.entries(hints)) registered.set(name, hint);
}

/** جملة القيد باسمه، أو جملة عامة تسمّيه إذا القيد مو بالقائمة (الحزمة تمنع هالحالة، والشاشة ما تسكت بيها). */
export function constraintHint(name: string | null): string {
  const hint = name ? (CONSTRAINT_HINTS[name] ?? registered.get(name)) : undefined;
  return hint ? hint() : unknownConstraint(name);
}
