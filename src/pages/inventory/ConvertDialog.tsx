import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { DayField, postingDay } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import type { Day } from '../../domain/dates';
import { MILLI_PER_UNIT, type Milli } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { parseQty } from '../../domain/units';
import { RejectedError } from '../../lib/errors';
import { fmtDay } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as inventory from '../../lib/repo/inventory';
import * as purchases from '../../lib/repo/purchases';
import type { ConversionInput, FileStore, RecordedConversion } from '../../lib/repo/purchases';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { SimpleItemDialog } from './ItemCreate';
import { FailureNotice, ItemPickCards, UnknownNotice, useSend, type OpItem, type OpSession, type Pending } from './ItemOps';
import { receivingStores } from './PurchaseDialog';
import { baseQty } from './simple-shared';
import { scopedStores, StoreSelect, storesOf } from './stock-shared';

// «حوّل» (0020، كلمة المالك 2026-11-08: «خلي امكانية التحويل بين احجام المواد»، وجوابه: مادّة إلى مادّة بالكلفة نفسها بلا خلطة، وتغيير حجم
// التعبئة حين تكون الأكياس والفلّ مادّتين): تختار المادّة الثانية ببطاقات وبحث (أو «أضف مادّة جديدة»)، وتكتب كم يخرج من هذه وكم يدخل من تلك
// (متساويتان افتراضاً بالوحدة نفسها)، ويُحفظ فوراً بدالّة record_conversion: سحب الأولى بالترتيب ووجبة من الثانية بقيمة المسحوب بالضبط.

/** البيض والأفراخ لا تُحوَّل ولا يُحوَّل إليها (not_convertible بالخادم). */
const NOT_CONVERTIBLE: readonly OpItem['kind'][] = ['hatching_egg', 'chick', 'table_egg'];

export interface ConvertForm {
  target: OpItem | null;
  fromQty: string;
  toQty: string;
  /** كُتبت كمية الثانية يدوياً: لا تتبع الأولى بعدها. */
  toTouched: boolean;
  day: string;
  fromWarehouseId: string;
  toWarehouseId: string;
}

export type ConvertField = 'target' | 'fromQty' | 'toQty' | 'day' | 'from' | 'to';

const qtyProblem = (text: string, unit: OpItem['baseUnit']): { qty: Milli | null; error: string | null } => {
  const qty = text.trim() ? parseQty(text) : null;
  if (qty === null || qty <= 0n) return { qty: null, error: t('convert.qty.required', 'اكتب الكمية ({unit}) رقماً أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', { unit: baseUnitLabel(unit) }) };
  if (unit === 'pc' && qty % MILLI_PER_UNIT !== 0n) return { qty: null, error: t('purchase.qty.whole', 'القطع تُعدّ عدداً صحيحاً.') };
  return { qty, error: null };
};

/**
 * التحويل من النموذج أو أخطاء حقوله. pickTo: طلب الخادم اختيار مخزن الثانية (store_required)؛ وpickFrom: طلب اختيار مخزن الأولى
 * (from_store_required: صارت في أكثر من مخزن بعد فتح الملفّ).
 */
export function conversionInput(form: ConvertForm, item: OpItem, today: Day, stores: readonly FileStore[], pickTo: boolean, pickFrom = false): { input: ConversionInput | null; errors: Partial<Record<ConvertField, string>> } {
  const errors: Partial<Record<ConvertField, string>> = {};
  if (!form.target) errors.target = t('convert.target.required', 'اختر المادّة التي تحوّل إليها.');
  const from = qtyProblem(form.fromQty, item.baseUnit);
  if (from.error) errors.fromQty = from.error;
  const chooseFrom = pickFrom || stores.length > 1;
  const store = chooseFrom ? stores.find((row) => row.warehouseId === form.fromWarehouseId) : stores[0];
  if (chooseFrom && !store) errors.from = t('purchase.store.required', 'اختر المخزن.');
  else if (from.qty !== null && store && from.qty > store.available) errors.fromQty = t('sale.qty.over', 'الموجود {qty} فقط.', { qty: baseQty(store.available, item.baseUnit) });
  const to = form.target ? qtyProblem(form.toQty, form.target.baseUnit) : { qty: null, error: null };
  if (form.target && to.error) errors.toQty = to.error;
  if (pickTo && !form.toWarehouseId) errors.to = t('purchase.store.required', 'اختر المخزن.');
  const day = postingDay(form.day, today);
  if (day.error) errors.day = day.error;
  if (Object.keys(errors).length || !form.target || from.qty === null || to.qty === null || !day.day) return { input: null, errors };
  return {
    input: {
      fromItemId: item.id,
      fromQty: from.qty,
      toItemId: form.target.id,
      toQty: to.qty,
      on: day.day,
      fromWarehouseId: chooseFrom ? (store?.warehouseId ?? null) : null,
      toWarehouseId: pickTo ? form.toWarehouseId : null,
    },
    errors,
  };
}

export function convertLabel(input: ConversionInput | null, item: OpItem, target: OpItem | null): string {
  if (!input || !target) return t('convert.save', 'حوّل');
  return t('convert.save.full', 'حوّل {from} من «{item}» إلى {to} من «{target}»', {
    from: baseQty(input.fromQty, item.baseUnit),
    item: item.name,
    to: baseQty(input.toQty, target.baseUnit),
    target: target.name,
  });
}

/**
 * مخزن المصدر أم الوجهة: from_store_required للمصدر وstore_required للوجهة؛ وقبل أن يرسل الخادم الرمز الأوّل يقول التلميح «تحوّل منه»
 * للمصدر (store_required بالرمزين معاً)، فالتلميح يفرّقهما ما دام الرمز واحداً.
 */
export function storeAsked(error: RejectedError): 'from' | 'to' | null {
  if (error.code === 'from_store_required') return 'from';
  if (error.code !== 'store_required') return null;
  return (error.hint ?? '').includes('تحوّل منه') ? 'from' : 'to'; // i18n-ok: مطابقة تلميح الخادم (لا يُعرض) حتى يصل رمز from_store_required
}

export function ConvertDialog({
  item,
  today,
  stores,
  session,
  onPending,
  onStoresStale,
  onClose,
  onAbandon,
  onSaved,
}: {
  item: OpItem;
  today: Day;
  stores: readonly FileStore[];
  /** معرّفات التحويل ونداؤه المعلَّق من الصفحة (يبقيان بعد إغلاق النافذة). */
  session: OpSession<ConversionInput>;
  onPending: (pending: Pending<ConversionInput> | null) => void;
  /** from_store_required: تغيّر المخزون عن الملفّ، فالصفحة تقرأ أين المادّة من جديد. */
  onStoresStale: () => void;
  onClose: () => void;
  onAbandon: () => void;
  onSaved: (result: RecordedConversion, input: ConversionInput, target: OpItem) => void;
}) {
  const id = useId();
  const online = useStore(onlineStore);
  const account = useSession();
  const workspace = account.status === 'ready' ? account.workspace : null;
  const ids = session.ids;
  const [fromHint, setFromHint] = useState<string | null>(null);
  const pickFrom = fromHint !== null;
  const [form, setForm] = useState<ConvertForm>({ target: null, fromQty: '', toQty: '', toTouched: false, day: fmtDay(today), fromWarehouseId: '', toWarehouseId: '' });
  const [adding, setAdding] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // store_required لمخزن الثانية: الخادم وجد لها أكثر من مخزن يستلمها، فتظهر المخازن بنطاقك التي تستلم نوعها.
  const [toHint, setToHint] = useState<string | null>(null);
  const pickTo = toHint !== null;
  const setup = useLoad(inventory.loadOrgSetup);
  const toStores = setup.data && form.target ? receivingStores(form.target.kind, scopedStores(storesOf(setup.data), workspace)) : [];
  const set = (patch: Partial<ConvertForm>) =>
    setForm((current) => {
      const next = { ...current, ...patch };
      // بالوحدة نفسها كمية الثانية تتبع الأولى حتى تُكتب يدوياً.
      if (!next.toTouched && next.target && next.target.baseUnit === item.baseUnit && patch.toQty === undefined) next.toQty = next.fromQty;
      return next;
    });
  const { input, errors } = conversionInput(form, item, today, stores, pickTo, pickFrom);
  const shown = tried ? errors : {};
  const { state, send, pending: lifted } = useSend(
    (sent: ConversionInput) => purchases.recordConversion(ids, sent),
    (result, sent) => onSaved(result, sent, form.target ?? item),
    (error: RejectedError) => {
      const asked = storeAsked(error);
      if (asked === 'from') {
        setFromHint(error.hint ?? '');
        onStoresStale();
        return true;
      }
      if (asked === 'to') {
        setToHint(error.hint ?? '');
        return true;
      }
      return false;
    },
    { pending: session.pending, onPending },
  );
  const pending = state.unknown;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!online || state.busy) return;
    if (pending) {
      void send(pending, '');
      return;
    }
    setTried(true);
    if (input) void send(input, t('convert.sent', 'المرسَل: {label}، بتاريخ {day}.', { label: convertLabel(input, item, form.target), day: fmtDay(input.on) }));
  };
  const formId = `${id}-form`;
  const close = pending ? onAbandon : onClose;
  const target = form.target;
  return (
    <Dialog
      open
      onClose={close}
      title={t('convert.title', 'حوّل «{name}» إلى مادّة أخرى', { name: item.name })}
      size="wide"
      dirty={(target !== null || form.fromQty.trim() !== '') && !pending}
      locked={state.busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={state.busy} data-action="convert-cancel">
            {pending ? t('purchase.close', 'أغلق') : t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={state.busy} disabled={!online} data-action="save-convert">
            {pending ? t('purchase.retry', 'أعد المحاولة') : convertLabel(input, item, target)}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {!online ? <Notice tone="warning" title={t('purchase.offline', 'يحتاج اتصالاً')} /> : null}
        {pending ? (
          <>
            <UnknownNotice again={state.failure !== null} />
            <p className="text-sm" data-action="convert-sent">
              {lifted?.summary}
            </p>
          </>
        ) : target === null ? (
          <div className="flex flex-col gap-2">
            <p className="font-medium">{t('convert.pick', 'إلى أيّ مادّة؟')}</p>
            <ItemPickCards exclude={item.id} filter={(picked) => !NOT_CONVERTIBLE.includes(picked.kind)} onPick={(picked) => set({ target: { id: picked.id, name: picked.name, kind: picked.kind, baseUnit: picked.baseUnit } })} onAdd={(name) => setAdding(name)} />
            {shown.target ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                {shown.target}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2" data-action="convert-grid">
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2 sm:col-span-2">
              <span className="font-medium" data-action="convert-target">
                {t('convert.to', 'إلى «{name}» ({unit})', { name: target.name, unit: baseUnitLabel(target.baseUnit) })}
              </span>
              <Button size="sm" variant="ghost" onClick={() => set({ target: null, toTouched: false, toQty: '' })} data-action="convert-change">
                {t('party.pick.change', 'غيّر')}
              </Button>
            </div>
            {pickFrom ? (
              <div className="sm:col-span-2" data-action="convert-from-hint">
                <Notice tone="info" title={t('convert.from_store.pick', '«{name}» في أكثر من مخزن؛ اختر المخزن الذي تحوّل منه', { name: item.name })}>
                  {fromHint || null}
                </Notice>
              </div>
            ) : null}
            {stores.length > 1 || pickFrom ? (
              <Field id={`${id}-from`} label={t('convert.from_store', 'يخرج من مخزن')} error={shown.from}>
                <select id={`${id}-from`} className="input" value={form.fromWarehouseId} onChange={(event) => set({ fromWarehouseId: event.target.value })} data-action="convert-from-store">
                  <option value="">{t('stock.store.pick', 'اختر المخزن')}</option>
                  {stores.map((store) => (
                    <option key={store.warehouseId} value={store.warehouseId}>
                      {t('issue.store_option', '{name} ({qty})', { name: store.name, qty: baseQty(store.available, item.baseUnit) })}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field id={`${id}-source-qty`} label={t('convert.from_qty', 'يخرج من «{name}» ({unit})', { name: item.name, unit: baseUnitLabel(item.baseUnit) })} error={shown.fromQty}>
              <input id={`${id}-source-qty`} inputMode="decimal" dir="ltr" autoComplete="off" className="input text-end tabular-nums" value={form.fromQty} onChange={(event) => set({ fromQty: toWesternDigits(event.target.value) })} data-action="convert-from-qty" />
            </Field>
            <Field
              id={`${id}-target-qty`}
              label={t('convert.to_qty', 'يدخل من «{name}» ({unit})', { name: target.name, unit: baseUnitLabel(target.baseUnit) })}
              error={shown.toQty}
              hint={target.baseUnit !== item.baseUnit ? t('convert.to_qty.hint', 'بوحدة المادّة الثانية: 20 كيساً قد تصير 1,000 كغم.') : undefined}
            >
              <input id={`${id}-target-qty`} inputMode="decimal" dir="ltr" autoComplete="off" className="input text-end tabular-nums" value={form.toQty} onChange={(event) => set({ toQty: toWesternDigits(event.target.value), toTouched: true })} data-action="convert-to-qty" />
            </Field>
            <DayField id={`${id}-day`} label={t('purchase.day', 'التاريخ')} value={form.day} onChange={(day) => set({ day: toWesternDigits(day) })} error={shown.day} />
            <p className="text-sm text-ink-muted sm:col-span-2" data-action="convert-cost">
              {t('convert.cost', 'بالكلفة نفسها: قيمة ما يدخل من «{target}» تساوي قيمة ما يخرج من «{item}» بالضبط.', { target: target.name, item: item.name })}
            </p>
            {pickTo ? (
              <div className="flex flex-col gap-2 sm:col-span-2" data-action="convert-to-store-pick">
                <Notice tone="info" title={t('convert.to_store.pick', 'لـ«{name}» أكثر من مخزن؛ اختر المخزن الذي تدخله', { name: target.name })}>
                  {toHint || null}
                </Notice>
                {setup.error ? (
                  <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />
                ) : (
                  <StoreSelect id={`${id}-to`} label={t('stock.store', 'المخزن')} stores={toStores} value={form.toWarehouseId} onChange={(toWarehouseId) => set({ toWarehouseId })} error={shown.to} />
                )}
              </div>
            ) : null}
          </div>
        )}
        {state.failure && !pending ? <FailureNotice failure={state.failure} /> : null}
      </form>
      {adding !== null ? (
        <SimpleItemDialog
          initialName={adding}
          onClose={() => setAdding(null)}
          onSaved={(created) => {
            setAdding(null);
            set({ target: { id: created.id, name: created.name, kind: created.kind, baseUnit: created.baseUnit } });
          }}
        />
      ) : null}
    </Dialog>
  );
}
