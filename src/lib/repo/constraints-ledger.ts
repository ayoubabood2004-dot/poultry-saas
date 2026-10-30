import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0006 (الجهات والصناديق والعدّاد والقيود والتوزيع وحركات الصناديق) و0008 (المصاريف)، بنفس عقد constraints.ts: مفتاح
// constraint.<اسم القيد>، والحزمة (constraints.test) تقارن القواميس كلها سوا بكتالوج القاعدة. ينحمّل ويّا parties.ts بس (بحزمة
// شاشات الحسابات، برّا التثبيت المسبق).
// القيود والتوزيع والحركات تكتبها الدوالّ بس، فقيدها ما ينخرق من الشاشة؛ بس كل قيد إله جملته حتى لو انخرق بهجرة.

export const LEDGER_CONSTRAINT_HINTS: Readonly<Record<string, () => string>> = {
  parties_name_check: () => t('constraint.parties_name_check', 'اسم الجهة مطلوب، ولا يزيد على 120 حرفاً.'),
  parties_name_norm_check: () => t('constraint.parties_name_norm_check', 'اكتب اسم الجهة بحروف؛ التطويل والتشكيل وحدهما لا يكفيان للبحث.'),
  parties_phone_check: () => t('constraint.parties_phone_check', 'رقم هاتف الجهة لا يزيد على 40 حرفاً.'),
  cash_accounts_name_check: () => t('constraint.cash_accounts_name_check', 'اسم الصندوق مطلوب، ولا يزيد على 80 حرفاً.'),
  cash_accounts_kind_check: () => t('constraint.cash_accounts_kind_check', 'نوع الصندوق نقد أو مصرف أو محفظة.'),
  doc_counters_kind_check: () => t('constraint.doc_counters_kind_check', 'نوع المستند المرقّم غير معروف.'),
  doc_counters_year_check: () => t('constraint.doc_counters_year_check', 'سنة رقم المستند خارج المدى المقبول.'),
  doc_counters_last_no_check: () => t('constraint.doc_counters_last_no_check', 'رقم المستند يبدأ من 1.'),
  party_entries_amount_check: () => t('constraint.party_entries_amount_check', 'مبلغ الحركة بالدينار الصحيح ولا يكون صفراً.'),
  party_entries_kind_check: () => t('constraint.party_entries_kind_check', 'نوع حركة الجهة غير معروف.'),
  party_entries_sign_check: () => t('constraint.party_entries_sign_check', 'إشارة الحركة لا تناسب نوعها: البيع والدفع «عليه»، والشراء والقبض «له»، والحركة التي تلغي السابقة بالإشارة المعاكسة.'),
  party_entries_doc_check: () => t('constraint.party_entries_doc_check', 'نوع مستند الحركة ومعرّفه يُذكران معاً أو يُتركان معاً.'),
  party_entries_doc_kind_check: () => t('constraint.party_entries_doc_kind_check', 'نوع مستند الحركة غير صالح.'),
  party_entries_doc_no_check: () => t('constraint.party_entries_doc_no_check', 'رقم المستند بالشكل «RC-2026-0001».'),
  party_entries_reason_check: () => t('constraint.party_entries_reason_check', 'سبب الحركة لا يكون فارغاً، ولا يزيد على 500 حرف.'),
  party_allocations_amount_check: () => t('constraint.party_allocations_amount_check', 'مبلغ التسديد بالدينار الصحيح ولا يكون صفراً.'),
  party_allocations_sign_check: () => t('constraint.party_allocations_sign_check', 'التسديد الأصلي موجب، وإلغاؤه سالب.'),
  cash_moves_amount_check: () => t('constraint.cash_moves_amount_check', 'مبلغ حركة الصندوق بالدينار الصحيح ولا يكون صفراً.'),
  cash_moves_kind_check: () => t('constraint.cash_moves_kind_check', 'نوع حركة الصندوق غير معروف.'),
  cash_moves_sign_check: () => t('constraint.cash_moves_sign_check', 'اتّجاه الحركة لا يناسب نوعها: القبض وارد، والدفع والمصروف صادر، والعكسية بالاتّجاه المعاكس.'),
  cash_moves_doc_check: () => t('constraint.cash_moves_doc_check', 'نوع مستند الحركة ومعرّفه يُذكران معاً أو يُتركان معاً.'),
  cash_moves_doc_kind_check: () => t('constraint.cash_moves_doc_kind_check', 'نوع مستند الحركة غير صالح.'),
  cash_moves_entry_check: () => t('constraint.cash_moves_entry_check', 'حركة القبض والدفع مربوطة بحركتها في حساب الجهة، وغيرها بلا حركة جهة.'),
  cash_moves_note_check: () => t('constraint.cash_moves_note_check', 'ملاحظة الحركة لا تكون فارغة، ولا تزيد على 500 حرف.'),
  expenses_amount_check: () => t('constraint.expenses_amount_check', 'مبلغ المصروف لا يكون صفراً، بمرتبتين عشريتين كحدّ أقصى.'),
  expenses_source_check: () => t('constraint.expenses_source_check', 'مصدر المصروف غير معروف.'),
  expenses_sign_check: () => t('constraint.expenses_sign_check', 'المصروف الأصلي موجب، وصفّ إلغائه سالب.'),
  expenses_for_month_check: () => t('constraint.expenses_for_month_check', 'شهر المصروف يُكتب بأوّل يوم في الشهر.'),
  expenses_cash_check: () => t('constraint.expenses_cash_check', 'المصروف النقدي من صندوق بحركته، بلا جهة ولا حساب، وبالدينار الصحيح.'),
  expenses_credit_check: () => t('constraint.expenses_credit_check', 'المصروف بالدين على جهة بحسابها وحركتها، بلا صندوق، وبالدينار الصحيح.'),
  expenses_stock_check: () => t('constraint.expenses_stock_check', 'مصروف المخزون يكتبه الصرف أو الجرد بمستنده، بلا صندوق ولا جهة.'),
  expenses_adjustment_check: () => t('constraint.expenses_adjustment_check', 'مصروف التسوية بمستنده، بلا صندوق ولا جهة.'),
  expenses_doc_check: () => t('constraint.expenses_doc_check', 'نوع مستند المصروف ومعرّفه يُذكران معاً أو يُتركان معاً.'),
  expenses_doc_kind_check: () => t('constraint.expenses_doc_kind_check', 'نوع مستند المصروف غير صالح.'),
  expenses_note_check: () => t('constraint.expenses_note_check', 'ملاحظة المصروف لا تكون فارغة، ولا تزيد على 500 حرف.'),
  expenses_reason_check: () => t('constraint.expenses_reason_check', 'صفّ الإلغاء وحده بسبب، والسبب لا يزيد على 500 حرف.'),
};

registerConstraintHints(LEDGER_CONSTRAINT_HINTS);
