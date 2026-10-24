import type { Fils } from '../../domain/money';
import { fmtMoney } from '../../lib/format';

/** مبلغ وسط النص العربي: dir="ltr" وأرقام بعرض ثابت. decimals 0 لكل ما يدخل دفتر جهة أو صندوق. */
export function MoneyText({ amount, decimals = 2, className = '' }: { amount: Fils; decimals?: 0 | 2; className?: string }) {
  return (
    <span dir="ltr" className={`tabular-nums ${className}`}>
      {fmtMoney(amount, decimals)}
    </span>
  );
}
