import { useCallback, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DayField, postingDay } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { decimalText } from '../../domain/decimal';
import { FILS_PER_DINAR, lineAmount, MILLI_PER_UNIT, type Fils, type Milli } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { RECEIVING_KINDS } from '../../domain/stock';
import { parseQty } from '../../domain/units';
import { parseDayText, parseMomentText } from '../../lib/dayText';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as inventory from '../../lib/repo/inventory';
import * as purchasing from '../../lib/repo/purchasing';
import type { BoxPick, PartyPick } from '../../lib/repo/purchasing';
import * as purchases from '../../lib/repo/purchases';
import type { ItemFile, Payment, PurchaseInput, RecordedPurchase } from '../../lib/repo/purchases';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { BoxPicker, SupplierPicker } from './purchase-shared';
import { baseQty } from './simple-shared';
import { readTime, scopedStores, StoreSelect, storesOf } from './stock-shared';

// «سجّل شراء» (كلمة المالك 2026-11-06، «المخزن ببساطة»: «اشتريت بهذا اليوم من هذا المورد هاي الكمية وبهذا السعر وراح ابيعه بهذا
// السعر»): نافذة واحدة تُحفظ فوراً بدالّة record_purchase — التاريخ والمورّد والكمية وسعر الشراء لوحدة الأساس، والمجموع حيّاً بالدينار
// الصحيح (التقريب الوحيد roundHalfAway، مرآة _mul_div_round بالخادم)، وسعر البيع (اختياري، معبّأ من الملفّ)، والدفع بالدين (الافتراضي،
// جواب المالك ١) أو نقداً من صندوق. زرّ الحفظ يسمّي أثره كاملاً. والمخزن يختاره الخادم من نوع المادّة؛ فإن كان لها أكثر من مخزن
// (store_required) تظهر قائمة المخازن ويُعاد بالمعرّفات نفسها. والمعرّفات والمرجع تولد مرّة لكلّ نافذة، فالنتيجة المجهولة (انقطع
// الاتصال بعد الإرسال) تُعاد بالشراء نفسه كما أُرسل لا بما في الحقول، ولا يُسجَّل مرّتين.
// مراجعة الجولة الأولى: إعادة نتيجة مجهولة تفشل بغير رفض (تزاحم 55P03 خلف الأصل الذي ما زال يعمل، أو انقطاع) تُبقي النتيجة مجهولة
// (م١)؛ و«تاريخ الانتهاء» لمادّة تتبّعه و«وقت الفقس» للأفراخ بقواعد سطر الاستلام نفسها (م٣)؛ وقائمة المخازن بعد store_required
// تقول «جارٍ التحميل» وتعرض فشلها بزرّ «أعد المحاولة» (ل٧).

export interface PurchaseForm {
  day: string;
  party: PartyPick | null;
  qty: string;
  price: string;
  sell: string;
  payment: Payment;
  box: string;
  /** تاريخ الانتهاء يوم/شهر/سنة، لمادّة تتبّع الانتهاء وحدها. */
  expiry: string;
  /** وقت الفقس «يوم/شهر/سنة ساعة:دقيقة»، للأفراخ وحدها. */
  born: string;
}

export type PurchaseField = 'day' | 'party' | 'qty' | 'price' | 'total' | 'sell' | 'box' | 'expiry' | 'born';

/** مجموع الشراء بالدينار الصحيح كما يحسبه الخادم، وهل قُرِّب (الكمية × السعر ليس ديناراً صحيحاً). */
export function purchaseTotal(qty: Milli, price: Fils): { total: Fils; rounded: boolean } {
  return { total: lineAmount(qty, price), rounded: (qty * price) % (MILLI_PER_UNIT * FILS_PER_DINAR) !== 0n };
}

/** نصّ سعر محفوظ في الحقل: «600» لدينار صحيح و«1.25» بكسره. */
export function priceText(price: Fils | null): string {
  if (price === null) return '';
  return price % FILS_PER_DINAR === 0n ? decimalText(price / FILS_PER_DINAR, 0) : decimalText(price, 2);
}

/** الشراء من النموذج (بلا المخزن)، أو أخطاء حقوله بأسمائها. today يوم الخادم (قاعدة التاريخ: اليوم أو قبله لحدّ 7 أيام). */
export function purchaseInput(form: PurchaseForm, file: Pick<ItemFile, 'item' | 'today'>, box: string): { input: Omit<PurchaseInput, 'warehouseId'> | null; errors: Partial<Record<PurchaseField, string>> } {
  const errors: Partial<Record<PurchaseField, string>> = {};
  const day = postingDay(form.day, file.today);
  if (day.error) errors.day = day.error;
  if (!form.party) errors.party = t('purchase.party.required', 'اختر المورّد، أو أضفه باسمه.');
  const unit = file.item.baseUnit;
  const qty = form.qty.trim() ? parseQty(form.qty) : null;
  if (qty === null || qty <= 0n) errors.qty = t('purchase.qty.required', 'اكتب الكمية ({unit}) رقماً أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', { unit: baseUnitLabel(unit) });
  else if (unit === 'pc' && qty % MILLI_PER_UNIT !== 0n) errors.qty = t('purchase.qty.whole', 'القطع تُعدّ عدداً صحيحاً.');
  const price = form.price.trim() ? parseMoneyText(form.price, false) : null;
  if (price === null || price <= 0n) errors.price = t('purchase.price.required', 'اكتب سعر الشراء لكل {unit} بالدينار، رقماً أكبر من صفر.', { unit: baseUnitLabel(unit) });
  const sell = form.sell.trim() ? parseMoneyText(form.sell, false) : null;
  if (form.sell.trim() && (sell === null || sell <= 0n)) errors.sell = t('purchase.sell.invalid', 'اكتب سعر البيع بالدينار رقماً أكبر من صفر، أو اتركه فارغاً.');
  if (form.payment === 'cash' && !box) errors.box = t('purchase.box.required', 'اختر الصندوق الذي دُفع منه.');
  // قواعد سطر الاستلام (م٣): الانتهاء إلزامي لمادّة تتبّعه، ووقت الفقس للأفراخ؛ وما بعدهما (المنتهي يوم الشراء، والفقس في المستقبل)
  // يحكمه الخادم بتلميح يسمّي الحقل.
  const expiryOn = file.item.tracksExpiry ? parseDayText(form.expiry) : null;
  if (file.item.tracksExpiry && !expiryOn) errors.expiry = t('receipt.line.expiry_required', 'اكتب تاريخ انتهاء «{item}».', { item: file.item.name });
  const born = file.item.kind === 'chick' ? parseMomentText(form.born) : null;
  if (file.item.kind === 'chick' && !born) errors.born = t('opening.born.invalid', 'اكتب وقت الفقس يوم/شهر/سنة ثم الساعة والدقيقة، مثل 28/10/2026 06:00.');
  if (qty !== null && qty > 0n && price !== null && price > 0n && !errors.qty && purchaseTotal(qty, price).total === 0n) {
    errors.total = t('purchase.total.zero', 'المجموع صفر بعد التقريب لأقرب دينار؛ راجع الكمية والسعر.');
  }
  if (Object.keys(errors).length || !day.day || !form.party || qty === null || price === null) return { input: null, errors };
  return {
    input: {
      itemId: file.item.id,
      partyId: form.party.id,
      receivedOn: day.day,
      qty,
      unitPrice: price,
      sellPrice: sell,
      payment: form.payment,
      cashAccountId: form.payment === 'cash' ? box : null,
      expiryOn,
      bornAt: born?.iso ?? null,
    },
    errors,
  };
}

/** نصّ زرّ الحفظ يسمّي أثره: «احفظ الشراء: 1,000 كغم ذرة بـ450,000 دينار بالدين على محمد علي». */
export function saveLabel(input: Omit<PurchaseInput, 'warehouseId'> | null, file: Pick<ItemFile, 'item'>, partyName: string, boxName: string | null): string {
  if (!input) return t('purchase.save', 'احفظ الشراء');
  const vars = { qty: baseQty(input.qty, file.item.baseUnit), item: file.item.name, total: fmtMoney(purchaseTotal(input.qty, input.unitPrice).total, 0), party: partyName, box: boxName ?? '' };
  if (input.payment === 'credit') return t('purchase.save.credit', 'احفظ الشراء: {qty} {item} بـ{total} دينار بالدين على {party}', vars);
  return boxName ? t('purchase.save.cash', 'احفظ الشراء: {qty} {item} بـ{total} دينار نقداً من {box}', vars) : t('purchase.save.cash_any', 'احفظ الشراء: {qty} {item} بـ{total} دينار نقداً', vars);
}

/** المخزن المختار يُرسل لمن طلب الخادم اختياره، والصندوق الوحيد يُختار وحده. */
function effectiveBox(form: PurchaseForm, boxes: readonly BoxPick[] | null): string {
  if (form.box) return form.box;
  return boxes && boxes.length === 1 && boxes[0] ? boxes[0].id : '';
}

interface SendState {
  busy: boolean;
  failure: unknown;
  /** أُرسل ولم تُعرف نتيجته: الإعادة بهذا نفسه (لا بما في الحقول). */
  unknown: PurchaseInput | null;
}

const IDLE: SendState = { busy: false, failure: null, unknown: null };

/**
 * onClose: إغلاق بلا إرسال (أو بعد رفض أكيد). وإغلاق بعد نتيجة مجهولة يمرّ بـonAbandon: ربّما حُفظ الشراء، فالملفّ يُقرأ من جديد ليظهر
 * إن كان قد حُفظ.
 */
export function PurchaseDialog({ file, onClose, onAbandon, onSaved }: { file: ItemFile; onClose: () => void; onAbandon: () => void; onSaved: (result: RecordedPurchase) => void }) {
  const id = useId();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const online = useStore(onlineStore);
  // المعرّفات والمرجع مرّة لكلّ نافذة (FOUNDATION ٥١٩): كلّ إعادة بها حتى تُعرف النتيجة.
  const [ids] = useState(purchases.newPurchaseIds);
  const unit = baseUnitLabel(file.item.baseUnit);
  // وقت فقس الأفراخ المشتراة يبدأ بيوم الشراء (E21، كورقة الاستلام).
  const [form, setForm] = useState<PurchaseForm>(() => ({
    day: fmtDay(file.today),
    party: null,
    qty: '',
    price: '',
    sell: priceText(file.money?.sellPrice ?? null),
    payment: 'credit',
    box: '',
    expiry: '',
    born: file.item.kind === 'chick' ? `${fmtDay(file.today)} 00:00` : '',
  }));
  const [tried, setTried] = useState(false);
  const [state, setState] = useState<SendState>(IDLE);
  // store_required: الخادم وجد للمادّة أكثر من مخزن يستلمها، فتظهر القائمة (من المخازن بنطاقك التي تستلم نوعها).
  const [storeHint, setStoreHint] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const pickStore = storeHint !== null;
  const loadStores = useCallback(() => (pickStore ? inventory.loadOrgSetup() : Promise.resolve(null)), [pickStore]);
  const setup = useLoad(loadStores, `${pickStore}`);
  const stores = setup.data ? scopedStores(storesOf(setup.data), workspace).filter((store) => !store.archived && RECEIVING_KINDS[file.item.kind].includes(store.kind)) : [];
  // الصناديق من الملفّ نفسه (الأمين لا يقرأ جدولها)، ومن جدولها إن لم يرسلها الخادم.
  const fromFile = file.cashAccounts;
  const wantsBoxes = form.payment === 'cash' && fromFile === null;
  const loadBoxes = useCallback(() => (wantsBoxes ? purchasing.listBoxes() : Promise.resolve(null)), [wantsBoxes]);
  const listed = useLoad(loadBoxes, `${wantsBoxes}`);
  const boxes = fromFile ?? listed.data;
  const box = effectiveBox(form, boxes);
  const set = (patch: Partial<PurchaseForm>) => setForm((current) => ({ ...current, ...patch }));

  const { input, errors } = purchaseInput(form, file, box);
  const shown = tried ? errors : {};
  const qty = form.qty.trim() ? parseQty(form.qty) : null;
  const price = form.price.trim() ? parseMoneyText(form.price, false) : null;
  const live = qty !== null && qty > 0n && price !== null && price > 0n ? purchaseTotal(qty, price) : null;
  const boxName = boxes?.find((row) => row.id === box)?.name ?? null;
  const pending = state.unknown;
  const storeMissing = pickStore && !warehouseId;

  const send = async (sent: PurchaseInput) => {
    // إعادة لنتيجة مجهولة (م١): ما لم يرفضها الخادم رفضاً أكيداً تبقى النتيجة مجهولة — 55P03 يعني أنّ الإعادة انتظرت خلف الأصل الذي ما زال
    // يعمل، والانقطاع لا يقول شيئاً عن الأصل — فلا «لم يُحفظ شيء»، والإغلاق يقرأ الملفّ من جديد.
    const retrying = pending !== null;
    setState({ busy: true, failure: null, unknown: pending });
    try {
      onSaved(await purchases.recordPurchase(ids, sent));
    } catch (error) {
      if (error instanceof RejectedError && error.code === 'store_required') {
        setStoreHint(error.hint ?? '');
        setState(IDLE);
        return;
      }
      const unknown = error instanceof UnknownOutcomeError || (retrying && !(error instanceof RejectedError));
      setState({ busy: false, failure: error, unknown: unknown ? sent : null });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!online || state.busy) return;
    if (pending) {
      void send(pending);
      return;
    }
    setTried(true);
    if (!input || storeMissing) return;
    void send({ ...input, warehouseId: pickStore ? warehouseId : null });
  };

  const formId = `${id}-form`;
  const failed = state.failure && !pending ? describeError(state.failure) : null;
  const noStore = state.failure instanceof RejectedError && state.failure.code === 'no_receiving_store';
  const canSetup = workspace ? can(workspace.role, 'stores.manage') : false;
  const dirty = form.party !== null || form.qty.trim() !== '' || form.price.trim() !== '';
  const close = pending ? onAbandon : onClose;
  return (
    <Dialog
      open
      onClose={close}
      title={t('purchase.title', 'سجّل شراء «{name}»', { name: file.item.name })}
      dirty={dirty && !pending}
      locked={state.busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={state.busy} data-action="purchase-cancel">
            {pending ? t('purchase.close', 'أغلق') : t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={state.busy} disabled={!online || (!pending && storeMissing)} data-action="save-purchase">
            {pending ? t('purchase.retry', 'أعد المحاولة') : saveLabel(input, file, form.party?.name ?? '', boxName)}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {!online ? (
          <Notice tone="warning" title={t('purchase.offline', 'يحتاج اتصالاً')}>
            {t('purchase.offline.detail', 'الشراء يُحفظ في الخادم فوراً؛ أعد المحاولة حين يعود الاتصال.')}
          </Notice>
        ) : null}
        {pending ? (
          <>
            <Notice tone="warning" title={t('purchase.unknown', 'لم يُعرف إن حُفظ؛ أعد المحاولة')}>
              {t('purchase.unknown.detail', 'أُرسل الشراء ولم يصل الردّ. «أعد المحاولة» يرسله نفسه، ولن يُسجَّل مرّتين.')}
              {state.failure ? (
                <span className="mt-1 block" data-action="purchase-retry-unknown">
                  {t('purchase.unknown.again', 'ولم تكتمل الإعادة أيضاً؛ أعد المحاولة بعد قليل، أو أغلق لترى ما حُفظ.')}
                </span>
              ) : null}
            </Notice>
            <p className="text-sm" data-action="purchase-sent">
              {t('purchase.sent', 'المرسَل: {qty} {item} بـ{total} دينار، بتاريخ {day}.', {
                qty: baseQty(pending.qty, file.item.baseUnit),
                item: file.item.name,
                total: fmtMoney(purchaseTotal(pending.qty, pending.unitPrice).total, 0),
                day: fmtDay(pending.receivedOn),
              })}
            </p>
          </>
        ) : (
          <>
            <DayField id={`${id}-day`} label={t('purchase.day', 'التاريخ')} value={form.day} onChange={(day) => set({ day: toWesternDigits(day) })} error={shown.day} />
            <SupplierPicker id={`${id}-party`} label={t('receipt.party', 'المورّد')} value={form.party} onChange={(party) => set({ party })} />
            {shown.party ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                {shown.party}
              </p>
            ) : null}
            <Field id={`${id}-qty`} label={t('purchase.qty', 'الكمية ({unit})', { unit })} error={shown.qty} hint={qty !== null && qty > 0n ? t('purchase.qty.read_back', '= {qty}', { qty: baseQty(qty, file.item.baseUnit) }) : undefined}>
              <input id={`${id}-qty`} inputMode="decimal" dir="ltr" autoComplete="off" className="input text-end tabular-nums" value={form.qty} onChange={(event) => set({ qty: toWesternDigits(event.target.value) })} data-action="purchase-qty" />
            </Field>
            <MoneyInput id={`${id}-price`} label={t('purchase.price', 'سعر الشراء لكل {unit}', { unit })} whole={false} value={form.price} onChange={(text) => set({ price: text })} error={shown.price} />
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-lg font-semibold" data-action="purchase-total">
              {live ? t('purchase.total', 'المجموع: {total} دينار', { total: fmtMoney(live.total, 0) }) : t('purchase.total.empty', 'المجموع: اكتب الكمية والسعر')}
              {live?.rounded ? <span className="ms-2 text-sm font-normal text-ink-muted">{t('purchase.total.rounded', '(مقرَّب لأقرب دينار)')}</span> : null}
            </p>
            {shown.total ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                {shown.total}
              </p>
            ) : null}
            <MoneyInput
              id={`${id}-sell`}
              label={t('purchase.sell', 'سعر البيع لكل {unit} (اختياري)', { unit })}
              hint={t('purchase.sell.hint', 'يصير سعر البيع الحالي للمادّة.')}
              whole={false}
              value={form.sell}
              onChange={(text) => set({ sell: text })}
              error={shown.sell}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('purchase.payment', 'الدفع')}</span>
              <Segmented<Payment>
                label={t('purchase.payment', 'الدفع')}
                options={[
                  { value: 'credit', label: t('purchase.payment.credit', 'بالدين على المورّد') },
                  { value: 'cash', label: t('purchase.payment.cash', 'نقداً من الصندوق') },
                ]}
                value={form.payment}
                onChange={(payment) => set({ payment })}
              />
            </div>
            {file.item.tracksExpiry ? (
              <div data-action="purchase-expiry">
                <DayField
                  id={`${id}-expiry`}
                  label={t('receipt.line.expiry', 'تاريخ الانتهاء')}
                  value={form.expiry}
                  onChange={(expiry) => set({ expiry: toWesternDigits(expiry) })}
                  hint={t('receipt.line.expiry_hint', 'كما على العبوة؛ المنتهي يوم الاستلام يحفظه المدير فقط.')}
                  error={shown.expiry}
                />
              </div>
            ) : null}
            {file.item.kind === 'chick' ? (
              <Field
                id={`${id}-born`}
                label={t('opening.born', 'وقت الفقس (يوم/شهر/سنة ساعة:دقيقة)')}
                error={shown.born}
                hint={(() => {
                  const read = parseMomentText(form.born);
                  return read ? t('opening.born.read', 'يُقرأ: {day} الساعة {time}', { day: fmtDay(read.day), time: readTime(read.iso) }) : t('opening.born.hint', 'مثل 28/10/2026 06:00');
                })()}
              >
                <input id={`${id}-born`} className="input" dir="ltr" autoComplete="off" value={form.born} onChange={(event) => set({ born: toWesternDigits(event.target.value) })} data-action="purchase-born" />
              </Field>
            ) : null}
            {form.payment === 'cash' ? (
              <>
                <BoxPicker id={`${id}-box`} label={t('purchase.box', 'الصندوق')} boxes={boxes} value={box} onChange={(value) => set({ box: value })} />
                {shown.box ? (
                  <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                    {shown.box}
                  </p>
                ) : null}
              </>
            ) : null}
            {pickStore ? (
              <div className="flex flex-col gap-2" data-action="purchase-store-pick">
                <Notice tone="info" title={t('purchase.store.pick', 'لهذه المادّة أكثر من مخزن؛ اختر المخزن الذي دخلته')}>
                  {storeHint || null}
                </Notice>
                {/* قائمة المخازن تُقرأ حين يطلبها الخادم (ل٧): «جارٍ التحميل» أثناءها، وفشلها بزرّ «أعد المحاولة» لا قائمة فارغة صامتة. */}
                {setup.error ? (
                  <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />
                ) : !setup.data ? (
                  <p role="status" className="text-sm text-ink-muted" data-action="purchase-stores-loading">
                    {t('purchase.stores.loading', 'جارٍ تحميل المخازن…')}
                  </p>
                ) : (
                  <StoreSelect id={`${id}-store`} label={t('stock.store', 'المخزن')} stores={stores} value={warehouseId} onChange={setWarehouseId} error={tried && storeMissing ? t('purchase.store.required', 'اختر المخزن.') : null} />
                )}
              </div>
            ) : null}
          </>
        )}
        {failed ? (
          <Notice tone="danger" title={failed.title}>
            <span className="flex flex-col gap-2">
              {failed.detail}
              {noStore && canSetup ? (
                <Link to="/inventory/setup" className="font-medium text-brand-700 dark:text-brand-200" data-action="open-store-setup">
                  {t('stores.setup.title', 'إعداد المخزن')}
                </Link>
              ) : null}
            </span>
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}
