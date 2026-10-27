import { parseDecimal, toScale } from '../../domain/decimal';
import type { Fils } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { Field } from './Field';

// حقل المبلغ (المرحلة 1 WP3): الأرقام الشرقية و«٫» و«٬» غربية لحظة الكتابة، والقراءة تنعرض تحته بفواصلها («= 1,250,000 دينار»)
// حتى «0,5» ما تمرّ 5 بصمت (درس 2026-10-24). بوضع الدينار الصحيح (افتراضه) كل كسر يرفض: مبالغ دفاتر الجهات والصناديق بالدينار
// (FOUNDATION ٤٦٦، amount_not_whole_dinar)، فالشاشة تمنع قبل الإرسال.

/** المبلغ من نصّ الحقل بالفلس، أو null (فارغ أو مو رقم أو بكسر بوضع الدينار الصحيح). */
export function parseMoneyText(text: string, whole = true): Fils | null {
  if (text.trim() === '') return null;
  const value = parseDecimal(text, whole ? 0 : 2);
  return value === null ? null : toScale(value, 2);
}

export interface MoneyInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  /** الدينار الصحيح (الافتراض): لكل مبلغ يدخل دفتر جهة أو صندوق. */
  whole?: boolean;
  hint?: string;
  error?: string | null;
  autoFocus?: boolean;
}

export function MoneyInput({ id, label, value, onChange, whole = true, hint, error, autoFocus = false }: MoneyInputProps) {
  const filled = value.trim() !== '';
  const amount = parseMoneyText(value, whole);
  const problem = filled && amount === null
    ? whole
      ? t('money.input.whole', 'اكتب المبلغ بالدينار الصحيح دون كسور، والفاصلة بين كل ثلاثة أرقام فقط (1,250,000).')
      : t('money.input.invalid', 'اكتب المبلغ رقماً بمرتبتين عشريتين كحدّ أقصى، والفاصلة بين كل ثلاثة أرقام فقط.')
    : null;
  const readBack = amount !== null ? t('money.input.read_back', '= {amount} دينار', { amount: fmtMoney(amount, whole ? 0 : 2) }) : null;
  return (
    <Field id={id} label={label} error={error ?? problem} hint={readBack ?? hint}>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        className="input text-end tabular-nums"
        value={value}
        aria-invalid={problem !== null || Boolean(error) || undefined}
        onChange={(event) => onChange(toWesternDigits(event.target.value))}
        data-autofocus={autoFocus || undefined}
      />
    </Field>
  );
}
