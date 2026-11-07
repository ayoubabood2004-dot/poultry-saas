import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0012 (القاعات والأفواج والجولة اليومية والجولات المركونة والأوزان)، بنفس عقد constraints.ts: مفتاح constraint.<اسم القيد>،
// والحزمة (constraints.test) تقارن القواميس كلها سوا بكتالوج القاعدة. ينحمّل ويّا flocks.ts بس (حزم شاشات الحقول).

export const FLOCK_CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  halls_name_check: () => t('constraint.halls_name_check', 'اسم القاعة مطلوب، ولا يزيد على 80 حرفاً.'),
  halls_capacity_check: () => t('constraint.halls_capacity_check', 'سعة القاعة عدد صحيح من 1 إلى 10,000,000 طير، أو اتركها فارغة.'),
  flocks_kind_check: () => t('constraint.flocks_kind_check', 'نوع الفوج إمّا لحم أو بيّاض.'),
  flocks_breed_check: () => t('constraint.flocks_breed_check', 'اسم السلالة لا يزيد على 80 حرفاً.'),
  flocks_placed_count_check: () => t('constraint.flocks_placed_count_check', 'عدد الطيور المسكَّنة عدد صحيح من 1 إلى 10,000,000.'),
  flocks_age_check: () => t('constraint.flocks_age_check', 'عمر الطيور عند التسكين من 0 إلى 1,000 يوم.'),
  flocks_chick_source_check: () => t('constraint.flocks_chick_source_check', 'مصدر الفراخ غير معروف.'),
  flocks_status_check: () => t('constraint.flocks_status_check', 'حالة الفوج غير معروفة.'),
  flocks_placed_check: () => t('constraint.flocks_placed_check', 'الفوج القائم له تاريخ تسكين وعدد طيور، والتسكين لا يسبق فتح الفوج.'),
  flocks_closed_check: () => t('constraint.flocks_closed_check', 'تاريخ الإغلاق للفوج المغلق فقط، والفوج المغلق له تاريخ إغلاق.'),
  flocks_close_note_check: () => t('constraint.flocks_close_note_check', 'ملاحظة الإغلاق لا تزيد على 500 حرف.'),
  flock_daily_birds_check: () => t('constraint.flock_daily_birds_check', 'النافق والمستبعد أعداد صحيحة من صفر فأكثر.'),
  flock_daily_feed_check: () => t('constraint.flock_daily_feed_check', 'العلف بالكيلوغرام من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.'),
  flock_daily_water_check: () => t('constraint.flock_daily_water_check', 'الماء باللتر من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.'),
  flock_daily_temp_min_check: () => t('constraint.flock_daily_temp_min_check', 'الحرارة الصغرى من −50 إلى 70، بمرتبة عشرية واحدة على الأكثر.'),
  flock_daily_temp_max_check: () => t('constraint.flock_daily_temp_max_check', 'الحرارة العظمى من −50 إلى 70، بمرتبة عشرية واحدة على الأكثر.'),
  flock_daily_temp_order_check: () => t('constraint.flock_daily_temp_order_check', 'الحرارة الصغرى لا تزيد على العظمى.'),
  flock_daily_eggs_check: () => t('constraint.flock_daily_eggs_check', 'أعداد البيض من صفر إلى 10,000,000، والمكسور والمشعور لا يزيدان على بيض اليوم كلّه، ولا يُكتبان قبله.'),
  flock_daily_note_check: () => t('constraint.flock_daily_note_check', 'ملاحظة اليوم لا تزيد على 500 حرف.'),
  flock_day_rejects_reason_check: () => t('constraint.flock_day_rejects_reason_check', 'سبب ركن الجولة غير معروف.'),
  flock_day_rejects_decision_check: () => t('constraint.flock_day_rejects_decision_check', 'القرار على الجولة المركونة إمّا «عولجت» أو «مرفوضة».'),
  flock_weights_sample_check: () => t('constraint.flock_weights_sample_check', 'عدد طيور العيّنة من 1 إلى 100,000.'),
  flock_weights_avg_check: () => t('constraint.flock_weights_avg_check', 'معدّل وزن الطير بالغرام من 20 إلى 20,000، بمرتبة عشرية واحدة على الأكثر.'),
  // 0019: الصرف لفوج القاعة ودفتر كلفة الفوج (تكتبها دالّتا الصرف والإلغاء وحدهما).
  flock_costs_kind_check: () => t('constraint.flock_costs_kind_check', 'نوع كلفة الفوج غير معروف.'),
  flock_costs_amount_check: () => t('constraint.flock_costs_amount_check', 'مبلغ كلفة الفوج رقم محدود بمرتبتين عشريتين على الأكثر.'),
  flock_costs_doc_kind_check: () => t('constraint.flock_costs_doc_kind_check', 'مصدر كلفة الفوج غير معروف.'),
  flock_costs_expense_check: () => t('constraint.flock_costs_expense_check', 'الصرف للفوج صادر داخلي بالكلفة، فلا يُربط بمصروف.'),
  flock_issues_doc_no_check: () => t('constraint.flock_issues_doc_no_check', 'رقم الصرف للفوج بصيغة FI-السنة-الرقم.'),
  flock_issues_status_check: () => t('constraint.flock_issues_status_check', 'حالة الصرف للفوج إمّا مرحَّل أو ملغى.'),
  flock_issues_void_check: () => t('constraint.flock_issues_void_check', 'الصرف الملغى له وقت إلغاء وسببه، والمرحَّل بلا إلغاء.'),
  flock_issues_void_reason_check: () => t('constraint.flock_issues_void_reason_check', 'سبب إلغاء الصرف لا يزيد على 500 حرف.'),
  flock_issues_version_check: () => t('constraint.flock_issues_version_check', 'رقم نسخة الصرف غير صالح.'),
  flock_issue_lines_qty_check: () => t('constraint.flock_issue_lines_qty_check', 'كمية الصرف أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  flock_issue_lines_unit_check: () => t('constraint.flock_issue_lines_unit_check', 'وحدة الصرف كيلوغرام أو لتر أو قطعة، والقطع عدد صحيح.'),
  flock_issue_lines_density_check: () => t('constraint.flock_issue_lines_density_check', 'كثافة سطر الصرف للمادّة باللتر فقط، رقم أكبر من صفر بأربع مراتب عشرية على الأكثر.'),
  flock_issue_lines_cost_kind_check: () => t('constraint.flock_issue_lines_cost_kind_check', 'نوع كلفة سطر الصرف غير معروف.'),
  flock_issue_lines_line_no_check: () => t('constraint.flock_issue_lines_line_no_check', 'رقم سطر الصرف يبدأ من 1.'),
};

registerConstraintHints(FLOCK_CONSTRAINT_HINTS);
