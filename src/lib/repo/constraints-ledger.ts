import { t } from '../i18n';
import { registerConstraintHints } from './constraints';

// جمل قيود 0006 (الجهات والصناديق والعدّاد والقيود والتوزيع وحركات الصناديق)، بنفس عقد constraints.ts: مفتاح
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
  party_entries_amount_check: () => t('constraint.party_entries_amount_check', 'مبلغ القيد بالدينار الصحيح ولا يكون صفراً.'),
  party_entries_kind_check: () => t('constraint.party_entries_kind_check', 'نوع قيد الجهة غير معروف.'),
  party_entries_sign_check: () => t('constraint.party_entries_sign_check', 'إشارة القيد لا تناسب نوعه: البيع والدفع «عليه»، والشراء والقبض «له»، والعكسي بالإشارة المعاكسة.'),
  party_entries_doc_check: () => t('constraint.party_entries_doc_check', 'نوع مستند القيد ومعرّفه يُذكران معاً أو يُتركان معاً.'),
  party_entries_doc_kind_check: () => t('constraint.party_entries_doc_kind_check', 'نوع مستند القيد غير صالح.'),
  party_entries_doc_no_check: () => t('constraint.party_entries_doc_no_check', 'رقم المستند بالشكل «RC-2026-0001».'),
  party_entries_reason_check: () => t('constraint.party_entries_reason_check', 'سبب القيد لا يكون فارغاً، ولا يزيد على 500 حرف.'),
  party_allocations_amount_check: () => t('constraint.party_allocations_amount_check', 'مبلغ التوزيع بالدينار الصحيح ولا يكون صفراً.'),
  party_allocations_sign_check: () => t('constraint.party_allocations_sign_check', 'التوزيع الأصلي موجب، وعكسه سالب.'),
  cash_moves_amount_check: () => t('constraint.cash_moves_amount_check', 'مبلغ حركة الصندوق بالدينار الصحيح ولا يكون صفراً.'),
  cash_moves_kind_check: () => t('constraint.cash_moves_kind_check', 'نوع حركة الصندوق غير معروف.'),
  cash_moves_sign_check: () => t('constraint.cash_moves_sign_check', 'اتّجاه الحركة لا يناسب نوعها: القبض وارد، والدفع والمصروف صادر، والعكسية بالاتّجاه المعاكس.'),
  cash_moves_doc_check: () => t('constraint.cash_moves_doc_check', 'نوع مستند الحركة ومعرّفه يُذكران معاً أو يُتركان معاً.'),
  cash_moves_doc_kind_check: () => t('constraint.cash_moves_doc_kind_check', 'نوع مستند الحركة غير صالح.'),
  cash_moves_entry_check: () => t('constraint.cash_moves_entry_check', 'حركة القبض والدفع مربوطة بقيدها في دفتر الجهة، وغيرها بلا قيد.'),
  cash_moves_note_check: () => t('constraint.cash_moves_note_check', 'ملاحظة الحركة لا تكون فارغة، ولا تزيد على 500 حرف.'),
};

registerConstraintHints(LEDGER_CONSTRAINT_HINTS);
