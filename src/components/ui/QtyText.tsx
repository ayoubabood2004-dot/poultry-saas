import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { fmtQty, type QtyOptions } from '../../lib/format';

/** كمية بمنسّق fmtQty الوحيد: السطر الرئيسي، وتحته وحدة الأساس إذا العرض بالطن أو بوحدة تعبئة. */
export function QtyText({
  qty,
  unit,
  options,
  showSub = true,
  className = '',
}: {
  qty: Milli;
  unit: BaseUnit;
  options?: QtyOptions;
  showSub?: boolean;
  className?: string;
}) {
  const shown = fmtQty(qty, unit, options);
  return (
    <span className={`inline-flex flex-col tabular-nums ${className}`}>
      <span>{shown.main}</span>
      {showSub && shown.sub ? <span className="text-2xs text-ink-muted">{shown.sub}</span> : null}
    </span>
  );
}
