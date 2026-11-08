import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { DayField, postingDay } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import type { Day } from '../../domain/dates';
import { MILLI_PER_UNIT } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { parseQty } from '../../domain/units';
import { fmtDay } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as purchases from '../../lib/repo/purchases';
import type { FileStore, FileTarget, RecordedTransfer, TransferInput } from '../../lib/repo/purchases';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useStore } from '../../lib/store';
import { FailureNotice, UnknownNotice, useSend, type OpItem, type OpSession, type Pending } from './ItemOps';
import { baseQty } from './simple-shared';

// «انقل» (0020، كلمة المالك 2026-11-08: «اريد ارسل مواد الى غير احد او غير كمية»، والتحويل من مخزن إلى مخزن بين أجوبته): من مخزن فيه المادّة
// (بمتاحه) إلى أيّ مخزن فعّال يقبل نوعها (وجهات الخادم في ملفّ المادّة: transfer_targets)، بخطوة واحدة تُحفظ فوراً (record_transfer على نواة
// التحويل نفسها، ويُلغى من «التحويلات»). وبين وحدتين صادر داخليّ بالكلفة كالتحويل القائم.

export interface TransferForm {
  fromWarehouseId: string;
  toWarehouseId: string;
  qty: string;
  day: string;
}

export type TransferField = 'from' | 'to' | 'qty' | 'day';

/** مخازن الوصول: وجهات الخادم (فعّالة تقبل نوع المادّة) عدا مخزن الخروج. */
export function transferTargets(targets: readonly FileTarget[], fromId: string): FileTarget[] {
  return targets.filter((store) => store.warehouseId !== fromId);
}

export function transferInput(form: TransferForm, item: OpItem, today: Day, stores: readonly FileStore[]): { input: TransferInput | null; errors: Partial<Record<TransferField, string>> } {
  const errors: Partial<Record<TransferField, string>> = {};
  const from = stores.length === 1 ? stores[0] : stores.find((row) => row.warehouseId === form.fromWarehouseId);
  if (!from) errors.from = t('transfer.from.required', 'اختر المخزن الذي تخرج منه.');
  if (!form.toWarehouseId) errors.to = t('transfer.to.required', 'اختر المخزن الذي تدخله.');
  const qty = form.qty.trim() ? parseQty(form.qty) : null;
  if (qty === null || qty <= 0n) errors.qty = t('convert.qty.required', 'اكتب الكمية ({unit}) رقماً أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', { unit: baseUnitLabel(item.baseUnit) });
  else if (item.baseUnit === 'pc' && qty % MILLI_PER_UNIT !== 0n) errors.qty = t('purchase.qty.whole', 'القطع تُعدّ عدداً صحيحاً.');
  else if (from && qty > from.available) errors.qty = t('sale.qty.over', 'الموجود {qty} فقط.', { qty: baseQty(from.available, item.baseUnit) });
  const day = postingDay(form.day, today);
  if (day.error) errors.day = day.error;
  if (Object.keys(errors).length || !from || qty === null || !day.day) return { input: null, errors };
  return { input: { itemId: item.id, qty, fromWarehouseId: from.warehouseId, toWarehouseId: form.toWarehouseId, on: day.day }, errors };
}

export function TransferDialog({
  item,
  today,
  stores,
  targets: allTargets,
  session,
  onPending,
  onClose,
  onAbandon,
  onSaved,
}: {
  item: OpItem;
  today: Day;
  stores: readonly FileStore[];
  targets: readonly FileTarget[];
  /** معرّفات النقل ونداؤه المعلَّق من الصفحة (يبقيان بعد إغلاق النافذة). */
  session: OpSession<TransferInput>;
  onPending: (pending: Pending<TransferInput> | null) => void;
  onClose: () => void;
  onAbandon: () => void;
  onSaved: (result: RecordedTransfer, input: TransferInput) => void;
}) {
  const id = useId();
  const online = useStore(onlineStore);
  const ids = session.ids;
  const [form, setForm] = useState<TransferForm>({ fromWarehouseId: '', toWarehouseId: '', qty: '', day: fmtDay(today) });
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<TransferForm>) => setForm((current) => ({ ...current, ...patch }));
  const fromId = stores.length === 1 && stores[0] ? stores[0].warehouseId : form.fromWarehouseId;
  const targets = transferTargets(allTargets, fromId);
  const { input, errors } = transferInput(form, item, today, stores);
  const shown = tried ? errors : {};
  const { state, send, pending: lifted } = useSend((sent: TransferInput) => purchases.recordTransfer(ids, sent), onSaved, undefined, { pending: session.pending, onPending });
  const pending = state.unknown;
  const names = new Map(targets.map((store) => [store.warehouseId, store.name]));
  const fromName = stores.find((row) => row.warehouseId === fromId)?.name ?? '';
  const label = input
    ? t('move.save.full', 'انقل {qty} «{item}» من «{from}» إلى «{to}»', { qty: baseQty(input.qty, item.baseUnit), item: item.name, from: fromName, to: names.get(input.toWarehouseId) ?? '' })
    : t('move.save', 'انقل');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!online || state.busy) return;
    if (pending) {
      void send(pending, '');
      return;
    }
    setTried(true);
    if (input) void send(input, t('move.sent', 'المرسَل: {label}، بتاريخ {day}.', { label, day: fmtDay(input.on) }));
  };
  const formId = `${id}-form`;
  const close = pending ? onAbandon : onClose;
  return (
    <Dialog
      open
      onClose={close}
      title={t('move.title', 'انقل «{name}» إلى مخزن آخر', { name: item.name })}
      size="wide"
      dirty={form.qty.trim() !== '' && !pending}
      locked={state.busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={state.busy} data-action="move-cancel">
            {pending ? t('purchase.close', 'أغلق') : t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={state.busy} disabled={!online} data-action="save-move">
            {pending ? t('purchase.retry', 'أعد المحاولة') : label}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {!online ? <Notice tone="warning" title={t('purchase.offline', 'يحتاج اتصالاً')} /> : null}
        {pending ? (
          <>
            <UnknownNotice again={state.failure !== null} />
            <p className="text-sm" data-action="move-sent">
              {lifted?.summary}
            </p>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2" data-action="move-grid">
            {stores.length === 1 && stores[0] ? (
              <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm" data-action="move-from">
                {t('move.from.one', 'من «{name}»: فيه {qty}', { name: stores[0].name, qty: baseQty(stores[0].available, item.baseUnit) })}
              </p>
            ) : (
              <Field id={`${id}-from`} label={t('move.from', 'من مخزن')} error={shown.from}>
                <select id={`${id}-from`} className="input" value={form.fromWarehouseId} onChange={(event) => set({ fromWarehouseId: event.target.value, toWarehouseId: '' })} data-action="move-from-store">
                  <option value="">{t('stock.store.pick', 'اختر المخزن')}</option>
                  {stores.map((store) => (
                    <option key={store.warehouseId} value={store.warehouseId}>
                      {t('issue.store_option', '{name} ({qty})', { name: store.name, qty: baseQty(store.available, item.baseUnit) })}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field id={`${id}-to`} label={t('move.to', 'إلى مخزن')} error={shown.to} hint={fromId && targets.length === 0 ? t('move.to.none', 'لا مخزن آخر فعّالاً يقبل هذه المادّة.') : undefined}>
              <select id={`${id}-to`} className="input" value={form.toWarehouseId} onChange={(event) => set({ toWarehouseId: event.target.value })} data-action="move-to-store">
                <option value="">{t('stock.store.pick', 'اختر المخزن')}</option>
                {targets.map((store) => (
                  <option key={store.warehouseId} value={store.warehouseId}>
                    {store.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${id}-qty`} label={t('purchase.qty', 'الكمية ({unit})', { unit: baseUnitLabel(item.baseUnit) })} error={shown.qty}>
              <input id={`${id}-qty`} inputMode="decimal" dir="ltr" autoComplete="off" className="input text-end tabular-nums" value={form.qty} onChange={(event) => set({ qty: toWesternDigits(event.target.value) })} data-action="move-qty" />
            </Field>
            <DayField id={`${id}-day`} label={t('purchase.day', 'التاريخ')} value={form.day} onChange={(day) => set({ day: toWesternDigits(day) })} error={shown.day} />
          </div>
        )}
        {state.failure && !pending ? <FailureNotice failure={state.failure} /> : null}
      </form>
    </Dialog>
  );
}
