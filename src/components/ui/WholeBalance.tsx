import type { ReactNode } from 'react';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { sound } from '../../lib/sound';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from './Toast';

// الكمية الكبيرة (E31، FOUNDATION ٧٧٣، ٨١٤): سطر يسحب الرصيد المتاح كلّه يحتاج تأكيداً يسمّي المادّة والكمية والمخزن، والرصيد اللي
// يصير صفراً ينعلن بصوت. بلوك واحد لكل شاشة تسحب مخزوناً: التحويل الآن، والصرف والإتلاف ومرتجع المورّد بحزمها.

export interface WholeLine {
  itemName: string;
  qty: Milli;
  unit: BaseUnit;
}

/** جملة السطر للتأكيد: «كاز أويل: 1,000 لتر». */
function lineText(line: WholeLine): string {
  return t('whole_balance.line', '«{item}»: {qty}', { item: line.itemName, qty: fmtQty(line.qty, line.unit).main });
}

export function WholeBalanceConfirm({
  open,
  lines,
  warehouse,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  lines: readonly WholeLine[];
  warehouse: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const consequence: ReactNode = (
    <div className="flex flex-col gap-2">
      <p>{t('whole_balance.consequence', 'سيُسحب الرصيد المتاح كلّه من «{warehouse}» لهذه المواد، فيصير رصيدها هناك صفراً:', { warehouse })}</p>
      <ul className="list-disc ps-6">
        {lines.map((line) => (
          <li key={line.itemName}>{lineText(line)}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <ConfirmDialog
      open={open}
      title={t('whole_balance.title', 'سحب الرصيد كلّه')}
      consequence={consequence}
      confirmLabel={t('whole_balance.confirm', 'نعم، اسحب الرصيد كلّه')}
      tone="primary"
      busy={busy}
      action="confirm-whole-balance"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** بعد الترحيل: الرصيد اللي صار صفراً ينعلن بصوت وبرسالة تسمّي المواد والمخزن. */
export function announceZeroBalance(lines: readonly WholeLine[], warehouse: string): void {
  if (lines.length === 0) return;
  sound.warn();
  toast({
    tone: 'warning',
    title: t('whole_balance.zero', 'صار الرصيد صفراً في «{warehouse}»', { warehouse }),
    detail: lines.map((line) => line.itemName).join(t('list.separator', '، ')),
  });
}
