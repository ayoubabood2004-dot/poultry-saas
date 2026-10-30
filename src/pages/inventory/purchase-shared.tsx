import { Field } from '../../components/ui/Field';
import { MoneyText } from '../../components/ui/MoneyText';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { Fils } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { t } from '../../lib/i18n';

// حقول مال الشراء (الاستلام ومرتجعه وتصحيح سعره): كلها دنانير صحيحة (Q7). بحزمة شاشات المخزون، وشاشاتها ما تستورد حزمة الحسابات.

/** المبلغ بالدينار الصحيح من نصّ الحقل بالفلس، أو null (Q7: مبالغ الاستلام كلها دنانير صحيحة، والسالب مو مبلغ). */
export function parseDinar(text: string): Fils | null {
  const value = parseDecimal(text, 0);
  return value === null || value.units < 0n ? null : toScale(value, 2);
}

/** نصّ الحقل لمبلغ محفوظ بالدينار الصحيح («2350000»). */
export const dinarText = (amount: Fils): string => decimalText(amount / 100n, 0);

/**
 * حقل مبلغ بالدينار الصحيح (مثل MoneyInput، بلا استيراده: حزمته بحزمة الحسابات ويكبّر التثبيت المسبق): الأرقام الشرقية غربية لحظة
 * الكتابة، والقراءة تحته بفواصلها حتى «0,5» ما تمرّ 5 بصمت.
 */
export function AmountField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (text: string) => void; hint?: string }) {
  const amount = parseDinar(value);
  const problem = value.trim() !== '' && amount === null ? t('money.input.whole', 'اكتب المبلغ بالدينار الصحيح دون كسور، والفاصلة بين كل ثلاثة أرقام فقط (1,250,000).') : null;
  return (
    <Field id={id} label={label} error={problem} hint={amount !== null ? undefined : hint}>
      <input id={id} inputMode="decimal" autoComplete="off" dir="ltr" className="input text-end tabular-nums" value={value} aria-invalid={problem !== null || undefined} onChange={(event) => onChange(toWesternDigits(event.target.value))} />
      {amount !== null ? (
        <span className="text-sm text-ink-muted">
          = <MoneyText amount={amount} decimals={0} />
        </span>
      ) : null}
    </Field>
  );
}
