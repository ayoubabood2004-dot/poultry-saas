import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0028 لفاتورة الطيور BR وإيرادها لكلّ فوج، بنفس عقد constraints.ts: مفتاح constraint.<اسم القيد>، والحزمة (constraints.test) تقارن
// القواميس كلّها سويّة بكتالوج القاعدة. ينحمّل ويّا وحدة شاشاته وحدها (حزمة المبيعات خارج التثبيت المسبق).

export const BIRD_SALES_CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  bird_sales_doc_no_check: () => t('constraint.bird_sales_doc_no_check', 'رقم فاتورة الطيور بصيغة BR-السنة-الرقم.'),
  bird_sales_birds_check: () =>
    t('constraint.bird_sales_birds_check', 'فاتورة الطيور لها عدد طيور من 1 إلى 10,000,000 وصافٍ أكبر من صفر بثلاث مراتب عشرية على الأكثر.'),
  bird_sales_price_check: () => t('constraint.bird_sales_price_check', 'سعر الكيلو أكبر من صفر، بمرتبتين عشريتين على الأكثر.'),
  bird_sales_deduction_check: () => t('constraint.bird_sales_deduction_check', 'نسبة التنزيل من 0 إلى 10٪، بمرتبتين عشريتين على الأكثر.'),
  bird_sales_billed_check: () => t('constraint.bird_sales_billed_check', 'الوزن المحسوب أكبر من صفر ولا يزيد على الصافي، بثلاث مراتب عشرية على الأكثر.'),
  bird_sales_total_check: () => t('constraint.bird_sales_total_check', 'مبلغ فاتورة الطيور بالدينار الصحيح أكبر من صفر.'),
  bird_sales_paid_check: () => t('constraint.bird_sales_paid_check', 'المقبوض الآن بالدينار الصحيح من صفر حتى مبلغ الفاتورة.'),
  bird_sales_payment_check: () => t('constraint.bird_sales_payment_check', 'المقبوض الآن يُسجَّل بصندوقه وقيده وحركته معاً، ولا صندوق بلا مقبوض.'),
  bird_sales_status_check: () => t('constraint.bird_sales_status_check', 'حالة فاتورة الطيور إمّا مرحَّلة أو ملغاة.'),
  bird_sales_void_check: () => t('constraint.bird_sales_void_check', 'الفاتورة الملغاة لها وقت إلغاء وسببه، والمرحَّلة بلا إلغاء.'),
  bird_sales_void_reason_check: () => t('constraint.bird_sales_void_reason_check', 'سبب إلغاء الفاتورة حتى 500 حرف.'),
  bird_sales_note_check: () => t('constraint.bird_sales_note_check', 'ملاحظة الفاتورة حتى 500 حرف.'),
  bird_sales_version_check: () => t('constraint.bird_sales_version_check', 'رقم نسخة الفاتورة غير صالح.'),
  bird_sale_sources_qty_check: () => t('constraint.bird_sale_sources_qty_check', 'سطر الفوج في الفاتورة له طيور وصافٍ أكبر من صفر.'),
  bird_sale_sources_revenue_check: () => t('constraint.bird_sale_sources_revenue_check', 'حصّة الفوج من الفاتورة بالدينار الصحيح من صفر فأكثر.'),
};

registerConstraintHints(BIRD_SALES_CONSTRAINT_HINTS);
