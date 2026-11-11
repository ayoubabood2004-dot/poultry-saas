import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0026 (القاعات بين يديك: قائمة اللقاحات وجدولها، وتسجيل الدواء، وتأشير اللقاح)، بنفس عقد constraints.ts: مفتاح
// constraint.<اسم القيد>، والحزمة (constraints.test) تقارن القواميس كلّها سويّة بكتالوج القاعدة. ينحمّل ويّا halls.ts وحده (حزمة القاعات).

export const HALLS_CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  vaccines_name_check: () => t('constraint.vaccines_name_check', 'اسم اللقاح مطلوب، ولا يزيد على 40 حرفاً، بلا فراغ في طرفيه.'),
  vaccines_color_check: () => t('constraint.vaccines_color_check', 'لون اللقاح موضع من 0 إلى 9.'),
  vaccines_version_check: () => t('constraint.vaccines_version_check', 'نسخة اللقاح تبدأ من 1.'),
  vaccine_programs_kind_check: () => t('constraint.vaccine_programs_kind_check', 'جدول اللقاحات إمّا للّاحم أو للبيّاض.'),
  vaccine_programs_end_age_check: () => t('constraint.vaccine_programs_end_age_check', 'نهاية الدورة عدد أيّام من 1 إلى 1,000.'),
  vaccine_programs_version_check: () => t('constraint.vaccine_programs_version_check', 'نسخة جدول اللقاحات تبدأ من 1.'),
  vaccine_program_days_age_check: () => t('constraint.vaccine_program_days_age_check', 'يوم العمر في جدول اللقاحات من 1 إلى 1,000.'),
  flock_logs_kind_check: () => t('constraint.flock_logs_kind_check', 'نوع التسجيل في القاعة غير معروف.'),
  flock_logs_name_check: () => t('constraint.flock_logs_name_check', 'اسم الدواء مطلوب، ولا يزيد على 80 حرفاً، بلا فراغ في طرفيه.'),
  flock_logs_dose_check: () => t('constraint.flock_logs_dose_check', 'الجرعة لا تزيد على 120 حرفاً، بلا فراغ في طرفيها، أو اتركها فارغة.'),
  flock_vaccinations_age_check: () => t('constraint.flock_vaccinations_age_check', 'يوم العمر في التأشير من 1 إلى 1,000.'),
  flock_vaccinations_status_check: () => t('constraint.flock_vaccinations_status_check', 'حالة التأشير إمّا «تمّ» أو «أُلغي».'),
  flock_vaccinations_void_check: () => t('constraint.flock_vaccinations_void_check', 'التأشير الملغى له وقت إلغاء، والسبب للملغى وحده.'),
  flock_vaccinations_void_reason_check: () => t('constraint.flock_vaccinations_void_reason_check', 'سبب إلغاء التأشير لا يزيد على 500 حرف، بلا فراغ في طرفيه.'),
  flock_vaccinations_issue_check: () => t('constraint.flock_vaccinations_issue_check', 'التأشير المصروف من المخزن له صرفه ومادّته معاً.'),
};

registerConstraintHints(HALLS_CONSTRAINT_HINTS);
