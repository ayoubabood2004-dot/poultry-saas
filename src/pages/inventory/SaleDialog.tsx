import { useCallback, useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DayField, postingDay } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import type { Day } from '../../domain/dates';
import { lineAmount, MILLI_PER_UNIT, type Fils, type Milli } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { parseQty } from '../../domain/units';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as purchases from '../../lib/repo/purchases';
import type { FileStore, Payment, RecordedSale, SaleInput } from '../../lib/repo/purchases';
import * as purchasing from '../../lib/repo/purchasing';
import type { BoxPick, PartyPick } from '../../lib/repo/purchasing';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { FailureNotice, UnknownNotice, useSend, type OpItem, type OpSession, type Pending } from './ItemOps';
import { BoxPicker, SupplierPicker } from './purchase-shared';
import { priceText } from './PurchaseDialog';
import { baseQty } from './simple-shared';

// «بِع» (0021، كلمة المالك 2026-11-08: «ماكو زر يوديني للمبيعات حتى ابيع هاي المادة… واكدر اسجل مبيعاتي لمنو»، وأجوبته: أيّ مادّة في المخزن،
// والدفع يُختار كلّ مرّة بالدين افتراضاً، وسعر البيع من آخر شراء ويُعدَّل): نافذة واحدة تُحفظ فوراً بدالّة record_sale — الجهة (أو «جهة جديدة»)،
// والكمية بوحدة المادّة، والسعر معبّأ من سعر البيع الحاليّ، والمجموع حيّاً، والدفع، والصندوق للنقد، والتاريخ. والمخزن: الوحيد الذي فيه المادّة
// يختاره الخادم، وإن كانت في أكثر من مخزن تظهر القائمة بكمياتها. والسعر صفر «تسليم بلا مقابل» بتأكيد صريح (قرار بلا سؤال داخل الخطوط الحمر).

export interface SaleForm {
  party: PartyPick | null;
  qty: string;
  price: string;
  payment: Payment;
  box: string;
  day: string;
  warehouseId: string;
}

export type SaleField = 'party' | 'qty' | 'price' | 'box' | 'day' | 'store';

/**
 * البيع من النموذج أو أخطاء حقوله بأسمائها. stores: أين المادّة؛ أكثر من مخزن يطلب الاختيار، وكذلك pick (طلبه الخادم: store_required بعد أن
 * تغيّر المخزون عن الملفّ).
 */
export function saleInput(form: SaleForm, item: OpItem, today: Day, stores: readonly FileStore[], box: string, pick = false): { input: SaleInput | null; errors: Partial<Record<SaleField, string>> } {
  const errors: Partial<Record<SaleField, string>> = {};
  const unit = baseUnitLabel(item.baseUnit);
  if (!form.party) errors.party = t('sale.party.required', 'اختر الجهة التي بعتها، أو أضفها باسمها.');
  const qty = form.qty.trim() ? parseQty(form.qty) : null;
  const choose = pick || stores.length > 1;
  const store = choose ? stores.find((row) => row.warehouseId === form.warehouseId) : stores[0];
  // المتاح غير المنتهي: البيع يسحب منه وحده.
  const available = store ? store.available : stores.reduce((most, row) => (row.available > most ? row.available : most), 0n);
  if (qty === null || qty <= 0n) errors.qty = t('sale.qty.required', 'اكتب الكمية ({unit}) رقماً أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', { unit });
  else if (item.baseUnit === 'pc' && qty % MILLI_PER_UNIT !== 0n) errors.qty = t('purchase.qty.whole', 'القطع تُعدّ عدداً صحيحاً.');
  else if (stores.length > 0 && qty > available) errors.qty = t('sale.qty.over', 'الموجود {qty} فقط.', { qty: baseQty(available, item.baseUnit) });
  const price = form.price.trim() ? parseMoneyText(form.price, false) : null;
  if (price === null || price < 0n) errors.price = t('sale.price.required', 'اكتب سعر البيع لكل {unit} بالدينار (صفر للتسليم بلا مقابل).', { unit });
  else if (price > 0n && qty !== null && qty > 0n && !errors.qty && saleTotal(qty, price) === 0n) errors.price = t('sale.total.zero', 'مجموع البيع صفر بعد التقريب لأقرب دينار؛ راجع الكمية والسعر، أو اكتب السعر صفراً لتسليم بلا مقابل.');
  if (choose && !store) errors.store = t('purchase.store.required', 'اختر المخزن.');
  // التسليم بلا مقابل لا يُقبض نقداً (price_required_for_cash بالخادم): بالدين وحده.
  const payment: Payment = price === 0n ? 'credit' : form.payment;
  if (payment === 'cash' && !box) errors.box = t('purchase.box.required', 'اختر الصندوق الذي دُفع منه.');
  const day = postingDay(form.day, today);
  if (day.error) errors.day = day.error;
  if (Object.keys(errors).length || !form.party || qty === null || price === null || !day.day) return { input: null, errors };
  return {
    input: {
      partyId: form.party.id,
      itemId: item.id,
      qty,
      unitPrice: price,
      soldOn: day.day,
      payment,
      cashAccountId: payment === 'cash' ? box : null,
      warehouseId: choose ? (store?.warehouseId ?? null) : null,
    },
    errors,
  };
}

/** مبلغ البيع بالدينار الصحيح كالشراء (التقريب الوحيد roundHalfAway). */
export const saleTotal = (qty: Milli, price: Fils): Fils => lineAmount(qty, price);

/** زرّ الحفظ يسمّي أثره: «بِع 500 كغم علف بادئ لـ«أبو علي» بـ300,000 دينار بالدين». */
export function saleLabel(input: SaleInput | null, item: OpItem, partyName: string, boxName: string | null): string {
  if (!input) return t('sale.save', 'احفظ البيع');
  const vars = { qty: baseQty(input.qty, item.baseUnit), item: item.name, party: partyName, total: fmtMoney(saleTotal(input.qty, input.unitPrice), 0), box: boxName ?? '' };
  if (input.unitPrice === 0n) return t('sale.save.free', 'سلّم {qty} {item} لـ«{party}» بلا مقابل', vars);
  if (input.payment === 'credit') return t('sale.save.credit', 'بِع {qty} {item} لـ«{party}» بـ{total} دينار بالدين', vars);
  return boxName ? t('sale.save.cash', 'بِع {qty} {item} لـ«{party}» بـ{total} دينار نقداً إلى {box}', vars) : t('sale.save.cash_any', 'بِع {qty} {item} لـ«{party}» بـ{total} دينار نقداً', vars);
}

/** «المرسَل: …» لبيع لم يُعرف جوابه (والتسليم بلا مقابل بلا «بـ0 دينار»). */
export function saleSent(sent: SaleInput, item: OpItem): string {
  const vars = { qty: baseQty(sent.qty, item.baseUnit), item: item.name, day: fmtDay(sent.soldOn) };
  return sent.unitPrice === 0n
    ? t('sale.sent.free', 'المرسَل: تسليم {qty} {item} بلا مقابل، بتاريخ {day}.', vars)
    : t('sale.sent', 'المرسَل: {qty} {item} بـ{total} دينار، بتاريخ {day}.', { ...vars, total: fmtMoney(saleTotal(sent.qty, sent.unitPrice), 0) });
}

/** جملة «حُفظ البيع» من جواب الخادم نفسه (الرقم والمخزن الذي سُحب منه والمبلغ). */
export function saleDoneText(result: RecordedSale): string {
  const vars = { no: result.docNo, qty: baseQty(result.qty, result.baseUnit), item: result.itemName, party: result.partyName, store: result.warehouseName };
  if (result.free) return t('sale.done.free', 'سُلّم {qty} «{item}» لـ«{party}» من «{store}» بلا مقابل ({no}).', vars);
  if (!result.money) return t('sale.done.plain', 'حُفظ البيع {no}: {qty} «{item}» لـ«{party}» من «{store}».', vars);
  const total = fmtMoney(result.money.lineTotal, 0);
  return result.payment === 'cash'
    ? t('sale.done.cash', 'حُفظ البيع {no}: {qty} «{item}» لـ«{party}» من «{store}» بـ{total} دينار نقداً.', { ...vars, total })
    : t('sale.done.credit', 'حُفظ البيع {no}: {qty} «{item}» لـ«{party}» من «{store}» بـ{total} دينار بالدين عليها.', { ...vars, total });
}

export function SaleDialog({
  item,
  today,
  sellPrice,
  stores,
  cashAccounts,
  session,
  onPending,
  onStoresStale,
  onClose,
  onAbandon,
  onSaved,
}: {
  item: OpItem;
  today: Day;
  sellPrice: Fils | null;
  stores: readonly FileStore[];
  /** الصناديق من الخادم (الأمين لا يقرأ جدولها)، أو null فتُقرأ من جدولها. */
  cashAccounts: readonly BoxPick[] | null;
  /** معرّفات البيع ونداؤه المعلَّق من الصفحة (يبقيان بعد إغلاق النافذة). */
  session: OpSession<SaleInput>;
  onPending: (pending: Pending<SaleInput> | null) => void;
  /** store_required: تغيّر المخزون عن الملفّ، فالصفحة تقرأ أين المادّة من جديد. */
  onStoresStale: () => void;
  onClose: () => void;
  onAbandon: () => void;
  onSaved: (result: RecordedSale, input: SaleInput) => void;
}) {
  const id = useId();
  const online = useStore(onlineStore);
  const ids = session.ids;
  const [storeHint, setStoreHint] = useState<string | null>(null);
  const [form, setForm] = useState<SaleForm>({ party: null, qty: '', price: priceText(sellPrice), payment: 'credit', box: '', day: fmtDay(today), warehouseId: '' });
  const [tried, setTried] = useState(false);
  const [askFree, setAskFree] = useState(false);
  const set = (patch: Partial<SaleForm>) => setForm((current) => ({ ...current, ...patch }));
  const wantsBoxes = form.payment === 'cash' && cashAccounts === null;
  const loadBoxes = useCallback(() => (wantsBoxes ? purchasing.listBoxes() : Promise.resolve(null)), [wantsBoxes]);
  const listed = useLoad(loadBoxes, `${wantsBoxes}`);
  const boxes = cashAccounts ?? listed.data;
  const box = form.box || (boxes && boxes.length === 1 && boxes[0] ? boxes[0].id : '');
  const boxName = boxes?.find((row) => row.id === box)?.name ?? null;
  const pick = storeHint !== null;
  const { input, errors } = saleInput(form, item, today, stores, box, pick);
  const shown = tried ? errors : {};
  const { state, send } = useSend(
    (sent: SaleInput) => purchases.recordSale(ids, sent),
    onSaved,
    (error) => {
      // المادّة صارت في أكثر من مخزن بعد فتح الملفّ: قائمة المخازن من جديد، والاختيار بتلميح الخادم (لا رسالة فشل).
      if (error.code !== 'store_required') return false;
      setStoreHint(error.hint ?? '');
      onStoresStale();
      return true;
    },
    { pending: session.pending, onPending },
  );
  const pending = state.unknown;
  const qty = form.qty.trim() ? parseQty(form.qty) : null;
  const price = form.price.trim() ? parseMoneyText(form.price, false) : null;
  const live = qty !== null && qty > 0n && price !== null && price >= 0n ? saleTotal(qty, price) : null;
  const unit = baseUnitLabel(item.baseUnit);

  const go = (sent: SaleInput) => void send(sent, saleSent(sent, item));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!online || state.busy) return;
    if (pending) {
      go(pending);
      return;
    }
    setTried(true);
    if (!input) return;
    if (input.unitPrice === 0n) {
      setAskFree(true);
      return;
    }
    go(input);
  };
  const formId = `${id}-form`;
  const dirty = form.party !== null || form.qty.trim() !== '';
  const close = pending ? onAbandon : onClose;
  return (
    <Dialog
      open
      onClose={close}
      title={t('sale.title', 'بِع «{name}»', { name: item.name })}
      size="wide"
      dirty={dirty && !pending}
      locked={state.busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={state.busy} data-action="sale-cancel">
            {pending ? t('purchase.close', 'أغلق') : t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={state.busy} disabled={!online} data-action="save-sale">
            {pending ? t('purchase.retry', 'أعد المحاولة') : saleLabel(input, item, form.party?.name ?? '', boxName)}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {!online ? (
          <Notice tone="warning" title={t('purchase.offline', 'يحتاج اتصالاً')}>
            {t('sale.offline.detail', 'البيع يُحفظ في الخادم فوراً؛ أعد المحاولة حين يعود الاتصال.')}
          </Notice>
        ) : null}
        {pending ? (
          <>
            <UnknownNotice again={state.failure !== null} />
            <p className="text-sm" data-action="sale-sent">
              {saleSent(pending, item)}
            </p>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2" data-action="sale-grid">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <SupplierPicker id={`${id}-party`} label={t('sale.party', 'الجهة (لمن بعت)')} value={form.party} onChange={(party) => set({ party })} customer />
              {shown.party ? (
                <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                  {shown.party}
                </p>
              ) : null}
            </div>
            {pick ? (
              <div className="sm:col-span-2" data-action="sale-store-hint">
                <Notice tone="info" title={t('sale.store.pick', 'هذه المادّة في أكثر من مخزن؛ اختر المخزن الذي تبيع منه')}>
                  {storeHint || null}
                </Notice>
              </div>
            ) : null}
            {stores.length > 1 || pick ? (
              <Field id={`${id}-store`} label={t('sale.store', 'من أيّ مخزن')} error={shown.store}>
                <select id={`${id}-store`} className="input" value={form.warehouseId} onChange={(event) => set({ warehouseId: event.target.value })} data-action="sale-store">
                  <option value="">{t('stock.store.pick', 'اختر المخزن')}</option>
                  {stores.map((store) => (
                    <option key={store.warehouseId} value={store.warehouseId}>
                      {t('issue.store_option', '{name} ({qty})', { name: store.name, qty: baseQty(store.available, item.baseUnit) })}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field id={`${id}-qty`} label={t('purchase.qty', 'الكمية ({unit})', { unit })} error={shown.qty} hint={qty !== null && qty > 0n ? t('purchase.qty.read_back', '= {qty}', { qty: baseQty(qty, item.baseUnit) }) : undefined}>
              <input id={`${id}-qty`} inputMode="decimal" dir="ltr" autoComplete="off" className="input text-end tabular-nums" value={form.qty} onChange={(event) => set({ qty: toWesternDigits(event.target.value) })} data-action="sale-qty" />
            </Field>
            <MoneyInput
              id={`${id}-price`}
              label={t('sale.price', 'سعر البيع لكل {unit}', { unit })}
              hint={sellPrice !== null ? t('sale.price.hint', 'من سعر البيع الحاليّ؛ عدّله إن بعت بغيره.') : undefined}
              whole={false}
              value={form.price}
              onChange={(text) => set({ price: text })}
              error={shown.price}
            />
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-lg font-semibold sm:col-span-2" data-action="sale-total">
              {live === null ? t('sale.total.empty', 'المجموع: اكتب الكمية والسعر') : live === 0n ? t('sale.total.free', 'المجموع: بلا مقابل') : t('purchase.total', 'المجموع: {total} دينار', { total: fmtMoney(live, 0) })}
            </p>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('purchase.payment', 'الدفع')}</span>
              {price === 0n ? (
                <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm" data-action="sale-free">
                  {t('sale.free.payment', 'بلا مقابل: لا قبض ولا دين، وتخرج كلفتها من المخزن.')}
                </p>
              ) : (
                <Segmented<Payment>
                  label={t('purchase.payment', 'الدفع')}
                  options={[
                    { value: 'credit', label: t('sale.payment.credit', 'بالدين على الجهة') },
                    { value: 'cash', label: t('sale.payment.cash', 'نقداً إلى الصندوق') },
                  ]}
                  value={form.payment}
                  onChange={(payment) => set({ payment })}
                />
              )}
              {form.payment === 'cash' && price !== 0n ? (
                <>
                  <BoxPicker id={`${id}-box`} label={t('sale.box', 'الصندوق الذي قبضت فيه')} boxes={boxes} value={box} onChange={(value) => set({ box: value })} />
                  {shown.box ? (
                    <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                      {shown.box}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            <DayField id={`${id}-day`} label={t('purchase.day', 'التاريخ')} value={form.day} onChange={(day) => set({ day: toWesternDigits(day) })} error={shown.day} />
          </div>
        )}
        {state.failure && !pending ? <FailureNotice failure={state.failure} /> : null}
      </form>
      {askFree && input ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('sale.free.title', 'تسليم بلا مقابل؟')}
          consequence={t('sale.free.consequence', 'تخرج {qty} من «{item}» إلى «{party}» بفاتورة بيع بسعر صفر: لا دين عليها ولا قبض، وتخرج كلفتها من المخزن.', {
            qty: baseQty(input.qty, item.baseUnit),
            item: item.name,
            party: form.party?.name ?? '',
          })}
          confirmLabel={t('sale.free.confirm', 'سلّم بلا مقابل')}
          action="confirm-free-sale"
          onCancel={() => setAskFree(false)}
          onConfirm={() => {
            setAskFree(false);
            go(input);
          }}
        />
      ) : null}
    </Dialog>
  );
}
