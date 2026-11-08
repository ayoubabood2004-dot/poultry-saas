import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { OverviewItem, RecordedSale, SaleInput } from '../../lib/repo/purchases';
import { useLoad } from '../../lib/useLoad';
import { ItemPickCards, type OpItem } from '../inventory/ItemOps';
import { SaleDialog } from '../inventory/SaleDialog';

// «بيع جديد» من صفحة المبيعات (0021، كلمة المالك 2026-11-08): تختار المادّة ببطاقات وبحث (ما في المخزن منها شيء)، ثمّ نافذة «بِع» نفسها التي في
// ملفّ المادّة، بأرقام ملفّها (أين هي ومتاح كلّ مخزن، وسعر البيع الحاليّ، والصناديق).

/** البيض والأفراخ والطيور لاحقاً (جواب المالك): لا تُباع من هنا بعد. */
const NOT_SELLABLE: readonly OverviewItem['kind'][] = ['hatching_egg', 'chick', 'table_egg'];

function SaleForItem({ item, onBack, onClose, onSaved }: { item: OpItem; onBack: () => void; onClose: () => void; onSaved: (result: RecordedSale, input: SaleInput, item: OpItem) => void }) {
  const load = useCallback(() => purchases.loadItemFile(item.id), [item.id]);
  const file = useLoad(load, item.id);
  if (!file.data) {
    return (
      <Dialog open onClose={onClose} title={t('sale.title', 'بِع «{name}»', { name: item.name })}>
        {file.error ? (
          <LoadFailed what={t('file.what', 'ملفّ المادّة')} error={file.error} onRetry={file.retry} />
        ) : (
          <p role="status" className="text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )}
      </Dialog>
    );
  }
  if (!file.data.canSell) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={t('sale.title', 'بِع «{name}»', { name: item.name })}
        footer={
          <Button variant="secondary" onClick={onBack} data-action="sale-pick-again">
            {t('sale.pick_again', 'اختر مادّة أخرى')}
          </Button>
        }
      >
        <Notice tone="info" title={t('sale.cannot', 'لا يُباع «{name}» من هنا الآن: لا موجود منه في مخازن نطاقك، أو دورك لا يبيع.', { name: item.name })} />
      </Dialog>
    );
  }
  return (
    <SaleDialog
      item={item}
      today={file.data.today}
      sellPrice={file.data.money?.sellPrice ?? null}
      stores={file.data.stores}
      cashAccounts={file.data.cashAccounts}
      onClose={onClose}
      onAbandon={onClose}
      onSaved={(result, input) => onSaved(result, input, item)}
    />
  );
}

export function NewSale({ onClose, onSaved }: { onClose: () => void; onSaved: (result: RecordedSale, input: SaleInput, item: OpItem) => void }) {
  const [item, setItem] = useState<OpItem | null>(null);
  if (item) return <SaleForItem item={item} onBack={() => setItem(null)} onClose={onClose} onSaved={onSaved} />;
  return (
    <Dialog open onClose={onClose} title={t('sale.new.title', 'بيع جديد: ماذا تبيع؟')} size="wide">
      <ItemPickCards
        filter={(row) => row.onHand > 0n && !NOT_SELLABLE.includes(row.kind)}
        onPick={(row) => setItem({ id: row.id, name: row.name, kind: row.kind, baseUnit: row.baseUnit })}
        emptyHint={t('sale.new.empty', 'لا مادّة في مخازنك تُباع الآن؛ اشترِ أوّلاً أو أنتج.')}
      />
    </Dialog>
  );
}
