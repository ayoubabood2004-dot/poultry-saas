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
  // 0028 (ملاحظات الزبون 2026-11-15): جدول لقاحات خاصّ لكلّ قاعة.
  hall_vaccine_programs_kind_check: () => t('constraint.hall_vaccine_programs_kind_check', 'جدول القاعة إمّا للّاحم أو للبيّاض، كنوع حقلها.'),
  hall_vaccine_programs_end_age_check: () => t('constraint.hall_vaccine_programs_end_age_check', 'نهاية الدورة في جدول القاعة عدد أيّام من 1 إلى 1,000.'),
  hall_vaccine_programs_version_check: () => t('constraint.hall_vaccine_programs_version_check', 'نسخة جدول القاعة تبدأ من 1.'),
  hall_vaccine_program_days_age_check: () => t('constraint.hall_vaccine_program_days_age_check', 'يوم العمر في جدول القاعة من 1 إلى 1,000.'),
  // 0031: ملاحظة يوم تحت تقرير القاعات اليومي (عقد 0031، كلمة المالك 2026-11-17).
  halls_day_notes_note_check: () => t('constraint.halls_day_notes_note_check', 'الملاحظة لا تزيد على 500 حرف، بلا فراغ في طرفيها.'),
  halls_day_notes_version_check: () => t('constraint.halls_day_notes_version_check', 'نسخة الملاحظة يكتبها الخادم.'),
  halls_day_notes_on_date_check: () => t('constraint.halls_day_notes_on_date_check', 'يوم الملاحظة يوم من التقويم.'),
  // 0012: القاعات والأفواج والأوزان (نُقلت من constraints-flocks.ts 2026-11-27: لا يكتبها الطابور، وكلّ ما يكتبها في حزمة القاعات، فجملها خارج التثبيت المسبق).
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
  flock_weights_sample_check: () => t('constraint.flock_weights_sample_check', 'عدد طيور العيّنة من 1 إلى 100,000.'),
  flock_weights_avg_check: () => t('constraint.flock_weights_avg_check', 'معدّل وزن الطير بالغرام من 20 إلى 20,000، بمرتبة عشرية واحدة على الأكثر.'),
  // 0038: القاعة بأقسام (تُكتب عند إنشائها، وتتغيّر بـset_hall_sections)، وعدد كلّ قسم في الوجبة.
  halls_sections_check: () => t('constraint.halls_sections_check', 'أقسام القاعة من 1 (غير مقسومة) إلى 4.'),
  flocks_section_counts_check: () => t('constraint.flocks_section_counts_check', 'أعداد الأقسام أعداد صحيحة من صفر فأكثر، خانة لكلّ قسم، ومجموعها عدد الطيور الداخلة.'),
};

registerConstraintHints(HALLS_CONSTRAINT_HINTS);
