import { useCallback } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { Fils } from '../../domain/money';
import type { FileStore, ItemFile, OverviewItem, RecordedSale, SaleInput } from '../../lib/repo/purchases';
import { useLoad } from '../../lib/useLoad';
import { ItemPickCards, newSession, sessionFor, type OpItem, type OpSession, type Pending } from '../inventory/ItemOps';
import { SaleDialog } from '../inventory/SaleDialog';

// «بيع جديد» من صفحة المبيعات (0021، كلمة المالك 2026-11-08): تختار المادّة ببطاقات وبحث (ما في المخزن منها شيء)، ثمّ نافذة «بِع» نفسها التي في
// ملفّ المادّة، بأرقام ملفّها (أين هي ومتاح كلّ مخزن، وسعر البيع الحاليّ، والصناديق).

/** البيض والأفراخ والطيور لاحقاً (جواب المالك): لا تُباع من هنا بعد. */
const NOT_SELLABLE: readonly OverviewItem['kind'][] = ['hatching_egg', 'chick', 'table_egg'];

/** «بيع جديد»: المادّة المختارة (أو لا شيء بعد)، ومعرّفات البيع ونداؤه المعلَّق (في الصفحة، فإغلاق النافذة لا يضيّعها: مراجعة 0020 H1). */
export interface SaleFlow {
  item: OpItem | null;
  call: OpSession<SaleInput>;
}

export function newSaleFlow(): SaleFlow {
  return { item: null, call: newSession<SaleInput>('') };
}

function SaleForItem({
  item,
  call,
  onPending,
  onBack,
  onClose,
  onSaved,
}: {
  item: OpItem;
  call: OpSession<SaleInput>;
  onPending: (pending: Pending<SaleInput> | null) => void;
  onBack: () => void;
  onClose: () => void;
  onSaved: (result: RecordedSale, input: SaleInput, item: OpItem) => void;
}) {
  const load = useCallback(() => purchases.loadItemFile(item.id), [item.id]);
  const file = useLoad(load, item.id);
  const dialog = (data: { today: string; sellPrice: Fils | null; stores: readonly FileStore[]; cashAccounts: ItemFile['cashAccounts'] }) => (
    <SaleDialog
      item={item}
      today={data.today}
      sellPrice={data.sellPrice}
      stores={data.stores}
      cashAccounts={data.cashAccounts}
      session={call}
      onPending={onPending}
      onStoresStale={file.retry}
      onClose={onClose}
      onAbandon={onClose}
      onSaved={(result, input) => onSaved(result, input, item)}
    />
  );
  // نداء معلَّق يُعاد كما أُرسل، ولو تغيّر الملفّ (ربّما حُفظ البيع فنفد الموجود) أو لم يُقرأ بعد.
  if (call.pending) return dialog(file.data ? { today: file.data.today, sellPrice: file.data.money?.sellPrice ?? null, stores: file.data.stores, cashAccounts: file.data.cashAccounts } : { today: call.pending.input.soldOn, sellPrice: null, stores: [], cashAccounts: null });
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
  return dialog({ today: file.data.today, sellPrice: file.data.money?.sellPrice ?? null, stores: file.data.stores, cashAccounts: file.data.cashAccounts });
}

export function NewSale({ flow, onFlow, onClose, onSaved }: { flow: SaleFlow; onFlow: (flow: SaleFlow) => void; onClose: () => void; onSaved: (result: RecordedSale, input: SaleInput, item: OpItem) => void }) {
  if (flow.item) {
    return (
      <SaleForItem
        item={flow.item}
        call={flow.call}
        onPending={(pending) => onFlow({ ...flow, call: { ...flow.call, pending } })}
        onBack={() => onFlow({ ...flow, item: null })}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
  return (
    <Dialog open onClose={onClose} title={t('sale.new.title', 'بيع جديد: ماذا تبيع؟')} size="wide">
      <ItemPickCards
        filter={(row) => row.onHand > 0n && !NOT_SELLABLE.includes(row.kind)}
        // المعرّفات للمادّة المختارة: مادّة أخرى بلا نداء معلَّق معرّفاتها جديدة.
        onPick={(row) => onFlow({ item: { id: row.id, name: row.name, kind: row.kind, baseUnit: row.baseUnit }, call: sessionFor(flow.call, row.id) })}
        emptyHint={t('sale.new.empty', 'لا مادّة في مخازنك تُباع الآن؛ اشترِ أوّلاً أو أنتج.')}
      />
    </Dialog>
  );
}
