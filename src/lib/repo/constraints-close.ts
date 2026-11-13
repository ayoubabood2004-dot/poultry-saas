import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0028 للقاعات (تذاكر الوزن ووقفاتها ووزناتها، وحركات عدد الطيور، وإغلاق الدورة وسطور باقيها ومستندات الإرجاع FR ولقطة قيمها)، بنفس عقد
// constraints.ts: مفتاح constraint.<اسم القيد>، والحزمة (constraints.test) تقارن القواميس كلّها سويّة بكتالوج القاعدة. ينحمّل ويّا weighTickets.ts
// وflockClose.ts وحدهما (حزمة القاعات). وجمل فاتورة الطيور (bird_sales وbird_sale_sources) في constraints-birdsales.ts مع شاشتها.

export const CLOSE_CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  // حركات عدد الطيور (flock_counts): المباع وفرق العدّ.
  flock_counts_kind_check: () => t('constraint.flock_counts_kind_check', 'نوع حركة عدد الطيور: مباع أو فرق عدّ.'),
  flock_counts_birds_check: () => t('constraint.flock_counts_birds_check', 'عدد الطيور في الحركة غير الصفر، ولا يزيد مقداره على 10,000,000.'),
  flock_counts_sign_check: () => t('constraint.flock_counts_sign_check', 'المباع ينقص الطيور الحيّة، وعكسه يعيدها.'),
  flock_counts_net_check: () => t('constraint.flock_counts_net_check', 'صافي الوزن لحركة المباع وحدها، بثلاث مراتب عشرية وبإشارة تعاكس عدد الطيور.'),
  flock_counts_doc_check: () => t('constraint.flock_counts_doc_check', 'مصدر حركة العدد: فاتورة طيور للمباع، أو إغلاق دورة أو فرق عدّ يدويّ لفرق العدّ.'),
  flock_counts_reason_check: () => t('constraint.flock_counts_reason_check', 'فرق العدّ له سبب حتى 500 حرف.'),
  // تذكرة الوزن (weigh_tickets): بلا مال.
  weigh_tickets_method_check: () => t('constraint.weigh_tickets_method_check', 'طريقة الوزن إمّا القبّان أو ميزان الأقفاص.'),
  weigh_tickets_method_fields_check: () => t('constraint.weigh_tickets_method_fields_check', 'وزن الفارغ وحالة الأقفاص فيه للقبّان وحده.'),
  weigh_tickets_empty_check: () => t('constraint.weigh_tickets_empty_check', 'وزن الفارغ بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.'),
  weigh_tickets_crate_kg_check: () => t('constraint.weigh_tickets_crate_kg_check', 'وزن القفص الفارغ بالكيلوغرام أكبر من صفر حتى 100، بثلاث مراتب عشرية على الأكثر.'),
  weigh_tickets_totals_check: () => t('constraint.weigh_tickets_totals_check', 'مجاميع التذكرة: الطيور من 1 إلى 10,000,000، والأقفاص من صفر، والصافي أكبر من صفر بثلاث مراتب عشرية على الأكثر.'),
  weigh_tickets_status_check: () => t('constraint.weigh_tickets_status_check', 'حالة التذكرة: مسوّدة أو مكتملة أو ملغاة.'),
  weigh_tickets_no_check: () => t('constraint.weigh_tickets_no_check', 'رقم التذكرة بصيغة WT-السنة-الرقم، ويُعطى عند إكمالها.'),
  weigh_tickets_done_check: () => t('constraint.weigh_tickets_done_check', 'التذكرة المكتملة لها عدد طيور وصافٍ.'),
  weigh_tickets_void_check: () => t('constraint.weigh_tickets_void_check', 'التذكرة الملغاة لها وقت إلغاء، وسببها حتى 500 حرف.'),
  weigh_tickets_text_check: () => t('constraint.weigh_tickets_text_check', 'رقم السيارة واسم السائق حتى 40 حرفاً، والملاحظة حتى 500 حرف.'),
  weigh_tickets_version_check: () => t('constraint.weigh_tickets_version_check', 'رقم نسخة التذكرة غير صالح.'),
  // قاعات التذكرة (weigh_ticket_stops) ووزنات ميزان الأقفاص (weigh_ticket_weighings).
  weigh_ticket_stops_no_check: () => t('constraint.weigh_ticket_stops_no_check', 'ترتيب القاعة في التذكرة من 1 إلى 20.'),
  weigh_ticket_stops_birds_check: () => t('constraint.weigh_ticket_stops_birds_check', 'عدد طيور القاعة من 1 إلى 10,000,000.'),
  weigh_ticket_stops_crates_check: () => t('constraint.weigh_ticket_stops_crates_check', 'عدد أقفاص القاعة من صفر إلى 100,000.'),
  weigh_ticket_stops_gross_check: () => t('constraint.weigh_ticket_stops_gross_check', 'وزن الخابط بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.'),
  weigh_ticket_stops_net_check: () => t('constraint.weigh_ticket_stops_net_check', 'صافي القاعة أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  weigh_ticket_weighings_no_check: () => t('constraint.weigh_ticket_weighings_no_check', 'رقم الوزنة من 1 إلى 2,000.'),
  weigh_ticket_weighings_crates_check: () => t('constraint.weigh_ticket_weighings_crates_check', 'عدد أقفاص الوزنة من 1 إلى 1,000.'),
  weigh_ticket_weighings_gross_check: () => t('constraint.weigh_ticket_weighings_gross_check', 'وزن الوزنة بالكيلوغرام أكبر من صفر حتى 100,000، بثلاث مراتب عشرية على الأكثر.'),
  // إغلاق الدورة (flock_closes) وسطور الباقي (flock_close_lines).
  flock_closes_status_check: () => t('constraint.flock_closes_status_check', 'حالة الإغلاق: مغلقة أو أُعيد فتحها.'),
  flock_closes_counts_check: () => t('constraint.flock_closes_counts_check', 'أرقام الإغلاق: الحيّ قبله من صفر، وفرق العدّ عكسه، والمباع وصافيه معاً من صفر.'),
  flock_closes_reason_check: () => t('constraint.flock_closes_reason_check', 'فرق العدّ عند الإغلاق له سبب حتى 500 حرف، ولا سبب بلا فرق.'),
  flock_closes_reopen_check: () => t('constraint.flock_closes_reopen_check', 'إعادة الفتح لها وقت وسبب حتى 500 حرف.'),
  flock_closes_note_check: () => t('constraint.flock_closes_note_check', 'ملاحظة الإغلاق حتى 500 حرف.'),
  flock_close_lines_action_check: () => t('constraint.flock_close_lines_action_check', 'مصير الباقي: يرجع إلى مخزن، أو يُحسب مستهلَكاً، أو ينتقل للدورة التالية.'),
  flock_close_lines_qty_check: () => t('constraint.flock_close_lines_qty_check', 'كمية الباقي أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  flock_close_lines_unit_check: () => t('constraint.flock_close_lines_unit_check', 'وحدة الباقي كيلوغرام أو لتر أو قطعة، والقطع عدد صحيح.'),
  flock_close_lines_density_check: () => t('constraint.flock_close_lines_density_check', 'كثافة سطر الباقي للمادّة باللتر فقط، رقم أكبر من صفر بأربع مراتب عشرية على الأكثر.'),
  flock_close_lines_piece_mass_check: () => t('constraint.flock_close_lines_piece_mass_check', 'وزن القطعة في سطر الباقي للمادّة بالقطعة فقط، رقم أكبر من صفر بثلاث مراتب عشرية على الأكثر.'),
  flock_close_lines_cost_kind_check: () => t('constraint.flock_close_lines_cost_kind_check', 'نوع كلفة سطر الباقي غير معروف.'),
  flock_close_lines_line_no_check: () => t('constraint.flock_close_lines_line_no_check', 'رقم سطر الباقي من 1 إلى 100.'),
  flock_close_lines_shape_check: () => t('constraint.flock_close_lines_shape_check', 'الإرجاع له مخزن، والنقل له حالة، والمستهلَك بلا مخزن ولا حالة.'),
  flock_close_lines_carry_check: () => t('constraint.flock_close_lines_carry_check', 'النقل المطبَّق له فوج جديد ويوم تطبيق، وغيره بلاهما.'),
  // الإرجاع من القاعة (flock_returns، FR) وسطره (flock_return_lines).
  flock_returns_doc_no_check: () => t('constraint.flock_returns_doc_no_check', 'رقم الإرجاع من القاعة بصيغة FR-السنة-الرقم.'),
  flock_returns_source_check: () => t('constraint.flock_returns_source_check', 'مصدر الإرجاع: إغلاق الدورة أو العلف المنقول.'),
  flock_returns_status_check: () => t('constraint.flock_returns_status_check', 'حالة الإرجاع إمّا مرحَّل أو ملغى.'),
  flock_returns_void_check: () => t('constraint.flock_returns_void_check', 'الإرجاع الملغى له وقت إلغاء وسببه حتى 500 حرف.'),
  flock_returns_version_check: () => t('constraint.flock_returns_version_check', 'رقم نسخة الإرجاع غير صالح.'),
  flock_return_lines_qty_check: () => t('constraint.flock_return_lines_qty_check', 'كمية الإرجاع أكبر من صفر، بثلاث مراتب عشرية على الأكثر.'),
  flock_return_lines_unit_check: () => t('constraint.flock_return_lines_unit_check', 'وحدة الإرجاع كيلوغرام أو لتر أو قطعة، والقطع عدد صحيح.'),
  flock_return_lines_density_check: () => t('constraint.flock_return_lines_density_check', 'كثافة سطر الإرجاع للمادّة باللتر فقط، رقم أكبر من صفر بأربع مراتب عشرية على الأكثر.'),
  flock_return_lines_piece_mass_check: () => t('constraint.flock_return_lines_piece_mass_check', 'وزن القطعة في سطر الإرجاع للمادّة بالقطعة فقط، رقم أكبر من صفر بثلاث مراتب عشرية على الأكثر.'),
  flock_return_lines_cost_kind_check: () => t('constraint.flock_return_lines_cost_kind_check', 'نوع كلفة سطر الإرجاع غير معروف.'),
  flock_return_lines_line_no_check: () => t('constraint.flock_return_lines_line_no_check', 'رقم سطر الإرجاع يبدأ من 1.'),
  // لقطة قيم الإغلاق (flock_close_values، لأدوار الكلفة).
  flock_close_values_amounts_check: () => t('constraint.flock_close_values_amounts_check', 'قيم لقطة الإغلاق أرقام محدودة: الكلف بمرتبتين، والإيراد بالدينار الصحيح، والراجع والمنقول من صفر.'),
};

registerConstraintHints(CLOSE_CONSTRAINT_HINTS);
