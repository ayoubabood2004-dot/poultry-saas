import { t } from '../../lib/i18n';
import { Segmented } from './Segmented';

// جهة المبلغ بكلمة بدل الإشارة (المرحلة 1 WP3): «عليه» (الجهة مطلوبة إلنا، موجب) أو «له» (إحنا مطلوبين إلها، سالب). الرقم يبقى
// موجباً بالحقل، والإشارة من الاختيار: «−500,000» بالإدخال كان يلتبس بين «له» وغلطة كتابة.

export type Side = 'debit' | 'credit';

export function SideToggle({ label, value, onChange }: { label: string; value: Side; onChange: (side: Side) => void }) {
  return (
    <Segmented
      label={label}
      options={[
        { value: 'debit', label: t('ledger.side.debit', 'عليه') },
        { value: 'credit', label: t('ledger.side.credit', 'له') },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}
