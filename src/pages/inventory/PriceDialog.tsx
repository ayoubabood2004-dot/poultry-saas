import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import type { Fils, Milli } from '../../domain/money';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as purchases from '../../lib/repo/purchases';
import type { PricedPurchase, PriceInput } from '../../lib/repo/purchases';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useStore } from '../../lib/store';
import { FailureNotice, UnknownNotice, useSend, type OpItem } from './ItemOps';
import { priceText, purchaseTotal } from './PurchaseDialog';
import { baseQty } from './simple-shared';

// «أكمل السعر» (0020، جواب المالك 2026-11-08: «يدخل وأكمّل السعر بعدين»): شراء دخل المخزن بلا سعر يُكتب سعره هنا بنداء واحد (price_purchase):
// دين المورّد بالمجموع، وقيمة الوجبة الباقية، وما صُرف قبل التسعير «فرق سعر شراء» مصروفاً. الزرّ يسمّي الأثر، والمرجع مرّة لكلّ نافذة.

export interface UnpricedLine {
  lineId: string;
  qty: Milli;
  partyName: string;
  receivedOn: string;
}

export function PriceDialog({ item, line, sellPrice, onClose, onAbandon, onSaved }: { item: OpItem; line: UnpricedLine; sellPrice: Fils | null; onClose: () => void; onAbandon: () => void; onSaved: (result: PricedPurchase, input: PriceInput) => void }) {
  const id = useId();
  const online = useStore(onlineStore);
  const [clientRef] = useState(() => crypto.randomUUID());
  const [price, setPrice] = useState('');
  const [sell, setSell] = useState(priceText(sellPrice));
  const [tried, setTried] = useState(false);
  const unit = baseUnitLabel(item.baseUnit);
  const unitPrice = price.trim() ? parseMoneyText(price, false) : null;
  const sellValue = sell.trim() ? parseMoneyText(sell, false) : null;
  const priceError = unitPrice === null || unitPrice <= 0n ? t('price.required', 'اكتب سعر الشراء لكل {unit} بالدينار، رقماً أكبر من صفر.', { unit }) : null;
  const sellError = sell.trim() && (sellValue === null || sellValue <= 0n) ? t('purchase.sell.invalid', 'اكتب سعر البيع بالدينار رقماً أكبر من صفر، أو اتركه فارغاً.') : null;
  const total = unitPrice !== null && unitPrice > 0n ? purchaseTotal(line.qty, unitPrice) : null;
  const zero = total !== null && total.total === 0n ? t('purchase.total.zero', 'المجموع صفر بعد التقريب لأقرب دينار؛ راجع الكمية والسعر.') : null;
  const input: PriceInput | null = !priceError && !sellError && !zero && unitPrice !== null ? { lineId: line.lineId, unitPrice, sellPrice: sellValue } : null;
  const { state, send } = useSend((sent: PriceInput) => purchases.pricePurchase(clientRef, sent), onSaved);
  const pending = state.unknown;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!online || state.busy) return;
    if (pending) {
      void send(pending);
      return;
    }
    setTried(true);
    if (input) void send(input);
  };
  const formId = `${id}-form`;
  const close = pending ? onAbandon : onClose;
  const label =
    input && total
      ? t('price.save.full', 'اكتب السعر: {total} دينار بالدين على {party}', { total: fmtMoney(total.total, 0), party: line.partyName })
      : t('price.save', 'اكتب السعر');
  return (
    <Dialog
      open
      onClose={close}
      title={t('price.title', 'أكمل سعر «{item}»', { item: item.name })}
      dirty={price.trim() !== '' && !pending}
      locked={state.busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={state.busy} data-action="price-cancel">
            {pending ? t('purchase.close', 'أغلق') : t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={state.busy} disabled={!online} data-action="save-price">
            {pending ? t('purchase.retry', 'أعد المحاولة') : label}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {!online ? <Notice tone="warning" title={t('purchase.offline', 'يحتاج اتصالاً')} /> : null}
        <p className="text-sm" data-action="price-line">
          {t('price.line', 'شراء {qty} من {party} بتاريخ {day}، دخل المخزن بلا سعر.', { qty: baseQty(line.qty, item.baseUnit), party: line.partyName, day: fmtDay(line.receivedOn) })}
        </p>
        {pending ? (
          <UnknownNotice again={state.failure !== null} />
        ) : (
          <>
            <MoneyInput id={`${id}-price`} label={t('purchase.price', 'سعر الشراء لكل {unit}', { unit })} whole={false} value={price} onChange={setPrice} error={tried ? (priceError ?? zero) : null} autoFocus />
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-lg font-semibold" data-action="price-total">
              {total ? t('purchase.total', 'المجموع: {total} دينار', { total: fmtMoney(total.total, 0) }) : t('price.total.empty', 'المجموع: اكتب السعر')}
            </p>
            <MoneyInput id={`${id}-sell`} label={t('purchase.sell', 'سعر البيع لكل {unit} (اختياري)', { unit })} whole={false} value={sell} onChange={setSell} error={tried ? sellError : null} />
            <p className="text-sm text-ink-muted">{t('price.note', 'يُكتب دين المورّد بالمجموع؛ وما صُرف من هذا الشراء قبل السعر تُحسب كلفته «فرق سعر شراء».')}</p>
          </>
        )}
        {state.failure && !pending ? <FailureNotice failure={state.failure} /> : null}
      </form>
    </Dialog>
  );
}
