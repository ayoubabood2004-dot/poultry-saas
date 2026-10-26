import { t } from '../i18n';

// قيد check رفض الصفّ (23514): الرسالة العامة «بعض القيم غير صحيحة» خفت بـdoctorVet رفض قيد كمية حقيقي (FOUNDATION ٨٠٨)،
// فكل قيد بالقاعدة إله جملة فصيحة هنا باسمه بالضبط، بمفتاح constraint.<اسم القيد>. الحزمة (constraints.test) تقارن هالقائمة
// بكتالوج القاعدة: قيد بلا جملة أو جملة بلا قيد يفشّلها، فكل هجرة تزيد قيداً تزيد جملته هنا.
// دوالّ مو نصوص: الجملة تنحسب بلحظة الخطأ (اللغة الثانية بعدين ملف ترجمة بنفس المفاتيح).

export const CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  orgs_name_check: () => t('constraint.orgs_name_check', 'اسم المنشأة مطلوب، ولا يزيد على 120 حرفاً.'),
  members_role_check: () => t('constraint.members_role_check', 'الدور غير معروف. اختر دوراً من الأدوار الثمانية.'),
  members_display_name_check: () => t('constraint.members_display_name_check', 'اسم الموظف مطلوب، ولا يزيد على 80 حرفاً.'),
  members_phone_check: () => t('constraint.members_phone_check', 'رقم الهاتف يجب أن يكون رقم موبايل عراقياً صحيحاً.'),
  divisions_kind_check: () => t('constraint.divisions_kind_check', 'نوع الوحدة غير معروف.'),
  divisions_name_check: () => t('constraint.divisions_name_check', 'اسم الوحدة مطلوب، ولا يزيد على 80 حرفاً.'),
  ledger_books_code_check: () => t('constraint.ledger_books_code_check', 'نوع الدفتر غير معروف.'),
  ledger_books_name_check: () => t('constraint.ledger_books_name_check', 'اسم الدفتر مطلوب، ولا يزيد على 80 حرفاً.'),
  audit_log_op_check: () => t('constraint.audit_log_op_check', 'نوع العملية في سجلّ التدقيق غير معروف.'),
  invite_codes_failures_check: () => t('constraint.invite_codes_failures_check', 'أُدخل رمز الدعوة خطأً أكثر من 5 مرات، فأُوقف. اطلب رمزاً جديداً.'),
  // جدول الوحدات الثابت (0004): ما ينكتب من الواجهة، بس كل قيد إله جملته حتى لو انخرق بهجرة.
  units_dimension_check: () => t('constraint.units_dimension_check', 'نوع الوحدة يجب أن يكون كتلة أو حجماً أو عدداً.'),
  units_base_check: () => t('constraint.units_base_check', 'وحدة الأساس يجب أن تكون كغم أو لتراً أو قطعة.'),
  units_base_dimension_check: () => t('constraint.units_base_dimension_check', 'وحدة الأساس لا تناسب نوع الوحدة: الكتلة بالكيلو، والحجم باللتر، والعدد بالقطعة.'),
  units_factor_check: () => t('constraint.units_factor_check', 'معامل الوحدة يجب أن يكون أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.'),
};

/** اسم القيد من رسالة بوستغريس: «new row for relation "x" violates check constraint "x_check"». */
export function violatedConstraint(message: string | undefined): string | null {
  return /check constraint "([^"]+)"/.exec(message ?? '')?.[1] ?? null;
}

/** جملة القيد باسمه، أو جملة عامة تسمّيه إذا القيد مو بالقائمة (الحزمة تمنع هالحالة، والشاشة ما تسكت بيها). */
export function constraintHint(name: string | null): string {
  const hint = name ? CONSTRAINT_HINTS[name] : undefined;
  if (hint) return hint();
  return t('constraint.unknown', 'رفضت قاعدة البيانات قيمةً لا تحقّق القيد «{name}»، فلم يُحفظ شيء.', { name: name ?? '?' });
}
