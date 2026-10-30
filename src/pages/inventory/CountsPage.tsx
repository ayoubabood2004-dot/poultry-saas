import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { QtyInput, type QtyValue } from '../../components/ui/QtyInput';
import { toast } from '../../components/ui/Toast';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { localDay } from '../../domain/dates';
import type { Milli, UnitCost } from '../../domain/money';
import { can } from '../../domain/permissions';
import { itemAdmissible } from '../../domain/stock';
import { parseQty, toBase } from '../../domain/units';
import { parseDayText, parseMomentText } from '../../lib/dayText';
import type { DraftStamp } from '../../lib/drafts';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtQty, fmtQtyCell, fmtUnitCost } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as counts from '../../lib/repo/counts';
import type { CountDoc, CountLine, CountLineFields, CountPreview, CountPreviewLine, CountStatus, RefreshedLine } from '../../lib/repo/counts';
import * as inventory from '../../lib/repo/inventory';
import type { ItemRow } from '../../lib/repo/inventory';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { DayField, postingDay } from '../accounts/shared';
import { devicePending, keepPending, sendPending, underCountLock, type PendingCountLine, type PendingStore } from './countDevice';
import { ItemPicker, loadItemUnits, PageFooter, readTime, runWithRef, scopedStores, StoreSelect, storesOf, unitOptions, VoidDocDialog, type StoreRef } from './stock-shared';

// الجرد (الخطّة WP5، FOUNDATION ٥٥٥، القاعدة 17، E25، E41، E42، E48، E53، E54): العادّ يعدّ بالموبايل بيد وحدة (أهداف 44 بكسل أو
// أكبر) عدّاً أعمى (ما ينطلب رصيد الدفتر أصلاً)، بالوحدة أو بالتعبئة، والمادّة اللي تتابع الانتهاء بحقلين «صالح» و«منتهي»، والأفراخ
// بوقت فقس الزيادة، والماسح يكتب الرمز وEnter (E54). الحفظ اللي ما وصل الخادم يبقى بالجهاز لحد «أرسل المحفوظ». التسليم يجمّد العدّ.
// والمدير يراجع المسلَّم بجدول (الدفتر والمعدود والفرق، والمنتهي لحاله)، ويكتب سبب كل فرق وكلفة وحدة الزيادة بلا دفعة قياس (أربع
// مراتب)، و«أعد الحساب» يعرض الفرق القديم والجديد والمستندات بينهما، و«أعِد للعدّ» و«أغلِق دون ترحيل» بتأكيد، والموافقة = الترحيل.

export function countStatusLabel(status: CountStatus): string {
  switch (status) {
    case 'draft':
      return t('count.status.draft', 'مسوّدة');
    case 'submitted':
      return t('count.status.submitted', 'مسلَّم للمراجعة');
    case 'approved':
      return t('count.status.approved', 'موافَق عليه');
    case 'void':
      return t('count.status.void', 'ملغى');
  }
}

/** وقت الفقس المحفوظ (ISO) بنصّ الحقل «يوم/شهر/سنة ساعة:دقيقة» بتوقيت الجهاز. */
export function momentText(iso: string): string {
  return `${fmtDay(localDay(new Date(iso)))} ${readTime(iso)}`;
}

/** الفرق بإشارته للجدول: «+10.000» و«−100.000» (الزيادة والنقص)، والصفر بلا إشارة. */
export function signedQtyCell(qty: Milli, decimals: 0 | 1 | 2 | 3): string {
  if (qty === 0n) return fmtQtyCell(0n, decimals);
  return qty > 0n ? `+${fmtQtyCell(qty, decimals)}` : `\u{2212}${fmtQtyCell(-qty, decimals)}`;
}

interface LineDraft {
  item: Pick<ItemRow, 'id' | 'name' | 'kind' | 'baseUnit' | 'tracksExpiry'>;
  /** سطر الخادم المعدَّل، أو null لسطر جديد. */
  lineId: string | null;
}

/** حقول السطر من النموذج، أو رسالة المشكلة. الكميات بوحدة الأساس نصّاً بثلاث مراتب (E3). */
export function countLineFields(
  item: LineDraft['item'],
  input: { counted: Milli | null; expired: string; gainExpiry: string; gainExpiredExpiry: string; born: string },
): { fields: CountLineFields } | { problem: string } {
  if (input.counted === null || input.counted < 0n) return { problem: t('count.line.qty', 'اكتب العدد (صفر أو أكثر).') };
  let expired: Milli | null = null;
  if (item.tracksExpiry) {
    const text = input.expired.trim();
    expired = text ? parseQty(text) : 0n;
    if (expired === null || expired < 0n) return { problem: t('count.line.expired', 'اكتب المنتهي (صفر أو أكثر).') };
  }
  const gainExpiry = input.gainExpiry.trim() ? parseDayText(input.gainExpiry) : null;
  const gainExpiredExpiry = input.gainExpiredExpiry.trim() ? parseDayText(input.gainExpiredExpiry) : null;
  if ((input.gainExpiry.trim() && !gainExpiry) || (input.gainExpiredExpiry.trim() && !gainExpiredExpiry)) return { problem: t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') };
  const born = input.born.trim() ? parseMomentText(input.born) : null;
  if (input.born.trim() && !born) return { problem: t('opening.born.invalid', 'اكتب وقت الفقس يوم/شهر/سنة ثم الساعة والدقيقة، مثل 28/10/2026 06:00.') };
  return {
    fields: {
      item_id: item.id,
      counted_qty: decimalText(input.counted, 3),
      counted_expired_qty: item.tracksExpiry && expired !== null ? decimalText(expired, 3) : null,
      gain_expiry_on: item.tracksExpiry ? gainExpiry : null,
      gain_expired_expiry_on: item.tracksExpiry ? gainExpiredExpiry : null,
      gain_born_at: item.kind === 'chick' ? (born?.iso ?? null) : null,
    },
  };
}

/** نموذج سطر العدّ (جديد أو تعديل): المادّة بالبحث أو الماسح، والعدد بالوحدة أو التعبئة، والمنتهي وتواريخ الزيادة ووقت الفقس بمادّتهم. */
function CountLineForm({ store, line, busy, failure, onSave, onCancel }: { store: StoreRef; line: CountLine | null; busy: boolean; failure: unknown; onSave: (draft: LineDraft, fields: CountLineFields) => void; onCancel: (() => void) | null }) {
  const id = useId();
  const online = useStore(onlineStore);
  const [picked, setPicked] = useState<ItemRow | null>(null);
  const item: LineDraft['item'] | null = line ? { id: line.itemId, name: line.itemName, kind: line.itemKind, baseUnit: line.baseUnit, tracksExpiry: line.tracksExpiry } : picked;
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[] | null>(null);
  const [packsFailed, setPacksFailed] = useState<{ itemId: string; error: unknown } | null>(null);
  const [packsTry, setPacksTry] = useState(0);
  const [qty, setQty] = useState<QtyValue>({ text: line ? decimalText(line.counted, 3) : '', unitId: 'base' });
  const [expired, setExpired] = useState(line?.countedExpired !== null && line?.countedExpired !== undefined ? decimalText(line.countedExpired, 3) : '');
  const [gainExpiry, setGainExpiry] = useState(line?.gainExpiryOn ? fmtDay(line.gainExpiryOn) : '');
  const [gainExpiredExpiry, setGainExpiredExpiry] = useState(line?.gainExpiredExpiryOn ? fmtDay(line.gainExpiredExpiryOn) : '');
  const [born, setBorn] = useState(line?.gainBornAt ? momentText(line.gainBornAt) : '');
  const [problem, setProblem] = useState<string | null>(null);
  const admits = useCallback((row: ItemRow) => itemAdmissible(store.kind, row.kind), [store.kind]);
  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    // بلا نت: وحدات التعبئة اللي انقرت بالجلسة، أو وحدة الأساس بس.
    loadItemUnits(itemId, online).then(
      (rows) => {
        if (!cancelled) setPacks(rows.filter((row) => row.itemId === itemId));
      },
      (error: unknown) => {
        if (!cancelled) setPacksFailed({ itemId, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [itemId, online, packsTry]);
  const pick = (next: ItemRow | null) => {
    setPicked(next);
    setPacks(null);
    setQty({ text: '', unitId: 'base' });
    setExpired('');
    setGainExpiry('');
    setGainExpiredExpiry('');
    setBorn('');
  };
  const units = item && packs ? unitOptions(item, packs) : [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!item) {
      setProblem(t('count.line.item', 'اختر المادّة أو امسح رمزها.'));
      return;
    }
    const text = qty.text.trim();
    const entered = text ? parseQty(text) : null;
    const unit = units.find((option) => option.id === qty.unitId);
    const base = entered === null || !unit ? null : toBase(entered, unit.factor, item.baseUnit);
    if (base && !base.ok) {
      setProblem(t('count.line.whole', 'المعدود بالقطعة عدد صحيح.'));
      return;
    }
    const result = countLineFields(item, { counted: base ? base.qty : null, expired, gainExpiry, gainExpiredExpiry, born });
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    onSave({ item, lineId: line?.id ?? null }, result.fields);
  };
  const failed = failure ? describeError(failure, 'once') : null;
  const bornRead = born.trim() ? parseMomentText(born) : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      {line ? <h2 className="font-semibold">{t('count.line.edit', 'عدّل عدّ «{item}»', { item: line.itemName })}</h2> : <ItemPicker id={`${id}-item`} label={t('stock.col.item', 'المادّة')} value={picked} onChange={pick} filter={admits} offline={!online} />}
      {item && packsFailed?.itemId === item.id ? (
        <LoadFailed
          what={t('transfer.units.what', 'وحدات المادّة')}
          error={packsFailed.error}
          onRetry={() => {
            setPacksFailed(null);
            setPacksTry((n) => n + 1);
          }}
        />
      ) : null}
      {item && packs ? (
        <QtyInput id={`${id}-qty`} label={item.tracksExpiry ? t('count.line.valid', 'صالح') : t('count.line.counted', 'العدد')} base={item.baseUnit} units={units} value={qty} onChange={setQty} />
      ) : null}
      {item?.tracksExpiry ? (
        <>
          <Field id={`${id}-expired`} label={t('count.line.expired_qty', 'منتهي ({unit})', { unit: baseUnitLabel(item.baseUnit) })} hint={t('count.line.expired_hint', 'المنتهي يُعدّ وحده ولا يُصرف.')}>
            <input id={`${id}-expired`} className="input tabular-nums" inputMode="decimal" dir="ltr" value={expired} onChange={(event) => setExpired(event.target.value)} />
          </Field>
          <DayField id={`${id}-gain-expiry`} label={t('count.line.gain_expiry', 'انتهاء الصالح الزائد (إن زاد)')} value={gainExpiry} onChange={setGainExpiry} hint={t('count.line.gain_expiry_hint', 'يُطلب إن زاد الصالح على الدفتر.')} />
          <DayField id={`${id}-gain-expired-expiry`} label={t('count.line.gain_expired_expiry', 'انتهاء المنتهي الزائد (إن زاد)')} value={gainExpiredExpiry} onChange={setGainExpiredExpiry} hint={t('count.line.gain_expired_hint', 'تاريخ قبل يوم الجرد.')} />
        </>
      ) : null}
      {item?.kind === 'chick' ? (
        <Field
          id={`${id}-born`}
          label={t('count.line.born', 'وقت فقس الزائد (إن زاد)')}
          hint={bornRead ? t('opening.born.read', 'يُقرأ: {day} الساعة {time}', { day: fmtDay(bornRead.day), time: readTime(bornRead.iso) }) : t('opening.born.hint', 'مثل 28/10/2026 06:00')}
        >
          <input id={`${id}-born`} className="input" dir="ltr" value={born} onChange={(event) => setBorn(event.target.value)} />
        </Field>
      ) : null}
      {problem ? <Notice tone="danger" title={problem} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" busy={busy} disabled={!item} icon={<Plus aria-hidden="true" className="size-5" />} data-action="save-count-line">
          {line ? t('count.line.save', 'احفظ العدّ') : t('count.line.add', 'أضف العدّ')}
        </Button>
        {onCancel ? (
          <Button variant="secondary" size="lg" onClick={onCancel} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** سطور العادّ كبطاقات (الموبايل): المادّة والمعدود والمنتهي، بلا رصيد الدفتر (E25). */
export function CountedLines({ lines, onEdit, onDelete }: { lines: readonly CountLine[]; onEdit: ((line: CountLine) => void) | null; onDelete: ((line: CountLine) => void) | null }) {
  if (lines.length === 0) return <p className="text-sm text-ink-muted">{t('count.lines.empty', 'لم يُعدّ شيء بعد.')}</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label={t('count.lines', 'سطور الجرد')}>
      {lines.map((line) => (
        <li key={line.id} className="card flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{line.itemName}</div>
            <div className="text-sm text-ink-muted tabular-nums">
              {line.countedExpired !== null
                ? t('count.line.both', 'صالح {valid}، منتهٍ {expired}', { valid: fmtQty(line.counted, line.baseUnit).main, expired: fmtQty(line.countedExpired, line.baseUnit).main })
                : fmtQty(line.counted, line.baseUnit).main}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {onEdit ? (
              <IconButton label={t('count.line.edit_short', 'عدّل')} onClick={() => onEdit(line)} data-action="edit-count-line">
                <Pencil aria-hidden="true" className="size-5" />
              </IconButton>
            ) : null}
            {onDelete ? (
              <IconButton label={t('transfer.line.delete', 'احذف السطر')} onClick={() => onDelete(line)} data-action="delete-count-line">
                <Trash2 aria-hidden="true" className="size-5" />
              </IconButton>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** العدّ بالموبايل (المسوّدة، count.enter): أعمى، والحفظ اللي ما وصل يبقى بالجهاز، والتسليم بتأكيد. */
function CountEntry({ doc, lines, store, stamp, onChanged }: { doc: CountDoc; lines: readonly CountLine[]; store: StoreRef; stamp: DraftStamp; onChanged: () => void }) {
  const online = useStore(onlineStore);
  const [editing, setEditing] = useState<CountLine | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState<readonly PendingCountLine[]>([]);
  const [pendingFailed, setPendingFailed] = useState<unknown>(null);
  const [pendingTick, setPendingTick] = useState(0);
  const [rejected, setRejected] = useState<readonly { line: PendingCountLine; error: unknown }[]>([]);
  const [confirm, setConfirm] = useState<'submit' | null>(null);
  const local: PendingStore = devicePending(stamp, doc.id, t('count.pending.title', 'جرد «{store}» بتاريخ {day}', { store: store.name, day: fmtDay(doc.onDate) }));
  useEffect(() => {
    let cancelled = false;
    devicePending(stamp, doc.id, '')
      .read()
      .then(
        (draft) => {
          if (cancelled) return;
          setPending(draft?.payload.lines ?? []);
          setPendingFailed(null);
        },
        (error: unknown) => {
          if (!cancelled) setPendingFailed(error);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [stamp, doc.id, pendingTick]);
  const save = (draft: LineDraft, fields: CountLineFields) => {
    const line: PendingCountLine = { id: draft.lineId ?? crypto.randomUUID(), existing: draft.lineId !== null, itemName: draft.item.name, baseUnit: draft.item.baseUnit, fields };
    setBusy(true);
    setFailure(null);
    const write = line.existing ? counts.updateCountLine(line.id, { ...fields }) : counts.addCountLine(doc.id, line.id, fields);
    write
      .then(
        () => {
          setEditing(null);
          setFormKey((n) => n + 1);
          onChanged();
        },
        async (error: unknown) => {
          if (error instanceof RejectedError && error.code !== '23505') {
            setFailure(error);
            return;
          }
          if (error instanceof RejectedError) {
            // 23505: السطر انكتب بمحاولة جوابها ضاع؛ نكتب آخر قيمة فوقه.
            await counts.updateCountLine(line.id, { ...fields }).then(onChanged, setFailure);
            return;
          }
          await keepPending(local, doc.id, line);
          setEditing(null);
          setFormKey((n) => n + 1);
          setPendingTick((n) => n + 1);
          toast({ tone: 'warning', title: t('count.kept', 'حُفظ العدّ بالجهاز'), detail: t('count.kept.detail', 'لم يصل الخادم؛ أرسله من «أرسل المحفوظ» حين يعود الاتصال.') });
        },
      )
      .finally(() => setBusy(false));
  };
  const sendKept = () => {
    setBusy(true);
    setFailure(null);
    underCountLock(doc.id, () => sendPending(doc.id, local, { add: counts.addCountLine, update: counts.updateCountLine }))
      .then((result) => {
        setRejected(result.rejected);
        if (result.sent > 0) toast({ tone: 'success', title: t('count.sent', 'أُرسل المحفوظ: {n}', { n: fmtInt(result.sent) }) });
        onChanged();
      }, setFailure)
      .finally(() => {
        setBusy(false);
        setPendingTick((n) => n + 1);
      });
  };
  const deleteLine = (line: CountLine) => {
    setBusy(true);
    setFailure(null);
    counts
      .deleteCountLine(line.id, doc.version)
      .then(onChanged, setFailure)
      .finally(() => setBusy(false));
  };
  const submit = async () => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-submit:${doc.id}`, async (ref) => counts.submitCount(ref, doc.id, await counts.countVersion(doc.id)));
    setBusy(false);
    setConfirm(null);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      toast({ tone: 'success', title: t('count.submitted', 'سُلّم الجرد للمراجعة') });
      onChanged();
    }
  };
  const failed = failure ? describeError(failure) : null;
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info" title={t('count.blind', 'عدّ أعمى: اكتب ما تراه على الرفّ؛ رصيد الدفتر لا يظهر هنا.')} />
      {doc.returnReason ? <Notice tone="warning" title={t('count.returned', 'أعاد المدير الجرد للعدّ')}>{doc.returnReason}</Notice> : null}
      <CountedLines lines={lines} onEdit={(line) => setEditing(line)} onDelete={deleteLine} />
      {editing ? (
        <CountLineForm key={editing.id} store={store} line={editing} busy={busy} failure={failure} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <CountLineForm key={`new-${formKey}`} store={store} line={null} busy={busy} failure={failure} onSave={save} onCancel={null} />
      )}
      {pendingFailed ? <LoadFailed what={t('count.pending.what', 'العدّ المحفوظ بالجهاز')} error={pendingFailed} onRetry={() => setPendingTick((n) => n + 1)} /> : null}
      {pending.length > 0 ? (
        <section className="card flex flex-col gap-3 p-4" aria-labelledby="count-pending">
          <h2 id="count-pending" className="font-semibold">
            {t('count.pending', 'محفوظ بالجهاز ولم يُرسل')}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {pending.map((line) => (
              <li key={line.id}>{t('count.pending.line', '«{item}»: {qty}', { item: line.itemName, qty: fmtQty(parseQty(line.fields.counted_qty) ?? 0n, line.baseUnit).main })}</li>
            ))}
          </ul>
          <Button size="lg" busy={busy} disabled={!online} onClick={sendKept} icon={<Send aria-hidden="true" className="size-5" />} data-action="send-kept-counts">
            {t('count.pending.send', 'أرسل المحفوظ')}
          </Button>
        </section>
      ) : null}
      {rejected.map(({ line, error }) => (
        <Notice key={line.id} tone="danger" title={t('count.rejected', 'لم يُقبل عدّ «{item}»', { item: line.itemName })}>
          {describeError(error).detail}
        </Notice>
      ))}
      {failed && !editing ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button size="lg" disabled={!online || busy || lines.length === 0 || pending.length > 0} onClick={() => setConfirm('submit')} data-action="submit-count">
        {t('count.submit', 'سلّم الجرد للمراجعة')}
      </Button>
      {pending.length > 0 ? <p className="text-sm text-ink-muted">{t('count.submit.pending', 'أرسل المحفوظ بالجهاز أوّلاً، ثم سلّم الجرد.')}</p> : null}
      <ConfirmDialog
        open={confirm === 'submit'}
        tone="primary"
        title={t('count.submit.title', 'سلّم جرد «{store}»', { store: store.name })}
        consequence={t('count.submit.consequence', 'يُسلَّم {n} من السطور للمراجعة ويُجمَّد العدّ، فلا يُعدَّل إلا إذا أعاده المدير للعدّ.', { n: fmtInt(lines.length) })}
        confirmLabel={t('count.submit', 'سلّم الجرد للمراجعة')}
        busy={busy}
        action="confirm-submit-count"
        onConfirm={() => void submit()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/** سطور الجرد بلا الدفتر لغير المراجع (المسلَّم والمرحَّل للعادّ). */
function CountReadOnly({ doc, lines }: { doc: CountDoc; lines: readonly CountLine[] }) {
  return (
    <div className="flex flex-col gap-4">
      {doc.status === 'submitted' ? <Notice tone="info" title={t('count.frozen', 'الجرد مسلَّم للمراجعة؛ لا يُعدَّل إلا إذا أعاده المدير للعدّ.')} /> : null}
      {doc.voidReason ? <Notice tone="warning" title={t('count.voided', 'أُلغي هذا الجرد')}>{doc.voidReason}</Notice> : null}
      <CountedLines lines={lines} onEdit={null} onDelete={null} />
    </div>
  );
}

function columnDecimals3(line: CountPreviewLine): 0 | 1 | 2 | 3 {
  return line.baseUnit === 'pc' ? 0 : 3;
}

function qtyOrDash(qty: Milli | null, line: CountPreviewLine): string {
  return qty === null ? '—' : fmtQtyCell(qty, columnDecimals3(line));
}

/** «أعد الحساب»: الفرق القديم والجديد جنب بعض، والمستندات اللي ترحّلت بعد اللقطة باسمها وكميتها. */
function RefreshTable({ lines }: { lines: readonly RefreshedLine[] }) {
  const columns: Column<RefreshedLine>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'old', header: t('count.refresh.old', 'الفرق السابق'), kind: 'number', cell: (line) => <Num>{line.before.diff === null ? '—' : signedQtyCell(line.before.diff, line.baseUnit === 'pc' ? 0 : 3)}</Num> },
    { key: 'new', header: t('count.refresh.new', 'الفرق الآن'), kind: 'number', cell: (line) => <Num>{line.after.diff === null ? '—' : signedQtyCell(line.after.diff, line.baseUnit === 'pc' ? 0 : 3)}</Num> },
    {
      key: 'docs',
      header: t('count.refresh.docs', 'المستندات بعد العدّ'),
      cell: (line) => (line.docs.length === 0 ? '—' : line.docs.map((doc) => t('count.refresh.doc', '{label} ({qty})', { label: doc.label, qty: fmtQty(doc.qty < 0n ? -doc.qty : doc.qty, line.baseUnit).main })).join(t('list.separator', '، '))),
    },
  ];
  return <DataTable caption={t('count.refresh.caption', 'إعادة الحساب')} columns={columns} rows={lines} rowKey={(line) => line.lineId} empty={t('count.lines.empty', 'لم يُعدّ شيء بعد.')} />;
}

const costTextOf = (cost: UnitCost | null): string => (cost === null ? '' : decimalText(cost, 4));

/** مراجعة المدير (count.approve): الجدول والأسباب وكلفة الزيادة، وإعادة الحساب، والإعادة للعدّ، والإغلاق، والموافقة = الترحيل. */
function CountReview({ doc, store, onChanged }: { doc: CountDoc; store: StoreRef; onChanged: () => void }) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const load = useCallback(() => counts.previewCount(doc.id), [doc.id]);
  const [tick, setTick] = useState(0);
  const preview = useLoad(load, `${doc.id}#${doc.version}#${tick}`);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [refreshed, setRefreshed] = useState<readonly RefreshedLine[] | null>(null);
  const [confirm, setConfirm] = useState<'return' | 'close' | 'void' | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [stale, setStale] = useState<string | null>(null);
  if (preview.error) return <LoadFailed what={t('count.review.what', 'مراجعة الجرد')} error={preview.error} onRetry={preview.retry} />;
  if (!preview.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const data: CountPreview = preview.data;
  const failed = failure ? describeError(failure) : null;
  const submitted = data.status === 'submitted';
  const tracked = data.lines.some((line) => line.tracksExpiry);
  const reasonOf = (line: CountPreviewLine) => reasons[line.lineId] ?? line.reason ?? '';
  const needsReason = (line: CountPreviewLine) => (line.diff ?? 0n) !== 0n || (line.expiredDiff ?? 0n) !== 0n;
  const needsCost = (line: CountPreviewLine) => ((line.diff ?? 0n) > 0n || (line.expiredDiff ?? 0n) > 0n) && line.gainSource !== 'lot';
  const after = () => {
    setTick((n) => n + 1);
    onChanged();
  };
  const saveReview = async () => {
    setBusy(true);
    setFailure(null);
    try {
      for (const line of data.lines) {
        const reason = reasons[line.lineId];
        if (reason !== undefined && reason.trim() !== (line.reason ?? '')) await counts.setCountReason(line.lineId, reason);
        const cost = costs[line.lineId];
        if (cost !== undefined && cost.trim() !== costTextOf(line.gainUnitCost)) {
          const parsed = cost.trim() ? parseDecimal(cost, 4) : null;
          if (cost.trim() && parsed === null) throw new RejectedError('cost', t('count.cost.invalid', 'اكتب كلفة الوحدة رقماً بأربع مراتب عشرية كحدّ أقصى.'));
          await counts.setGainUnitCost(line.lineId, parsed ? toScale(parsed, 4) : null);
        }
      }
      setReasons({});
      setCosts({});
      after();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-refresh:${doc.id}`, (ref) => counts.refreshCount(ref, doc.id, data.version));
    setBusy(false);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      setRefreshed(outcome.kind === 'done' ? outcome.result.lines : null);
      setStale(null);
      after();
    }
  };
  const post = async () => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-post:${doc.id}`, (ref) => counts.postCount(ref, doc.id, data.version, data.plan));
    setBusy(false);
    if (outcome.kind === 'failed') {
      const error = outcome.error;
      if (error instanceof RejectedError && error.code === 'count_stale') {
        setStale(error.hint);
        setTick((n) => n + 1);
        return;
      }
      if (error instanceof RejectedError && error.code === 'stale_preview') setTick((n) => n + 1);
      setFailure(error);
      return;
    }
    if (outcome.kind === 'done') toast({ tone: 'success', title: t('count.posted', 'رُحّل الجرد {no}', { no: outcome.result.docNo ?? '' }) });
    else toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') });
    after();
  };
  const giveBack = async () => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-return:${doc.id}`, (ref) => counts.returnCount(ref, doc.id, data.version, returnReason.trim()));
    setBusy(false);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      setConfirm(null);
      setReturnReason('');
      after();
    }
  };
  const close = () => {
    setBusy(true);
    setFailure(null);
    counts
      .discardCount(doc.id, data.version)
      .then(() => navigate('/inventory/counts'), setFailure)
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const voidIt = async (reason: string) => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-void:${doc.id}`, (ref) => counts.voidCount(ref, doc.id, reason));
    setBusy(false);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      setConfirm(null);
      after();
    }
  };
  const columns: Column<CountPreviewLine>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'system', header: t('count.col.system', 'الدفتر'), kind: 'number', cell: (line) => <Num>{qtyOrDash(line.systemQty, line)}</Num> },
    { key: 'counted', header: t('count.col.counted', 'المعدود'), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.counted, columnDecimals3(line))}</Num> },
    { key: 'diff', header: t('count.col.diff', 'الفرق'), kind: 'number', cell: (line) => <Num>{line.diff === null ? '—' : signedQtyCell(line.diff, columnDecimals3(line))}</Num> },
    ...(tracked
      ? [
          { key: 'x_system', header: t('count.col.x_system', 'المنتهي بالدفتر'), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{qtyOrDash(line.systemExpiredQty, line)}</Num> },
          { key: 'x_counted', header: t('count.col.x_counted', 'المنتهي المعدود'), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{qtyOrDash(line.countedExpired, line)}</Num> },
          { key: 'x_diff', header: t('count.col.x_diff', 'فرق المنتهي'), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{line.expiredDiff === null ? '—' : signedQtyCell(line.expiredDiff, columnDecimals3(line))}</Num> },
        ]
      : []),
    {
      key: 'value',
      header: t('count.col.value', 'القيمة (دينار)'),
      kind: 'number',
      cell: (line) =>
        line.shortageValue === null ? (
          '—'
        ) : (
          <Num>
            {line.shortageValue > 0n ? <MoneyText amount={-line.shortageValue} /> : null}
            {line.gainValue !== null && line.gainValue > 0n ? <MoneyText amount={line.gainValue} /> : null}
          </Num>
        ),
    },
    {
      key: 'reason',
      header: t('count.col.reason', 'سبب الفرق'),
      cell: (line) =>
        needsReason(line) && submitted ? (
          <input
            className="input"
            aria-label={t('count.reason.for', 'سبب فرق «{item}»', { item: line.itemName })}
            maxLength={500}
            value={reasonOf(line)}
            onChange={(event) => setReasons({ ...reasons, [line.lineId]: event.target.value })}
            data-action="count-reason"
          />
        ) : (
          (line.reason ?? '')
        ),
    },
    {
      key: 'cost',
      header: t('count.col.cost', 'كلفة الوحدة'),
      cell: (line) =>
        needsCost(line) && submitted ? (
          <input
            className="input tabular-nums"
            dir="ltr"
            inputMode="decimal"
            aria-label={t('count.cost.for', 'كلفة وحدة زيادة «{item}» (أربع مراتب)', { item: line.itemName })}
            value={costs[line.lineId] ?? costTextOf(line.gainUnitCost)}
            onChange={(event) => setCosts({ ...costs, [line.lineId]: event.target.value })}
            data-action="count-cost"
          />
        ) : line.gainUnitCost !== null ? (
          <Num>{fmtUnitCost(line.gainUnitCost)}</Num>
        ) : (
          ''
        ),
    },
  ];
  const dirty = Object.keys(reasons).length > 0 || Object.keys(costs).length > 0;
  return (
    <div className="flex flex-col gap-4">
      {doc.voidReason ? <Notice tone="warning" title={t('count.voided', 'أُلغي هذا الجرد')}>{doc.voidReason}</Notice> : null}
      {submitted && data.stale ? (
        <Notice tone="warning" title={t('count.stale', 'تغيّر الرصيد بعد العدّ')}>
          {stale ?? t('count.stale.detail', 'ترحّل مستند على مادّة من الجرد بعد التسليم؛ اضغط «أعد الحساب» لترى الفرق الجديد قبل الترحيل.')}
        </Notice>
      ) : null}
      <DataTable caption={t('count.review', 'مراجعة الجرد')} columns={columns} rows={data.lines} rowKey={(line) => line.lineId} empty={t('count.lines.empty', 'لم يُعدّ شيء بعد.')} />
      {submitted
        ? data.lines
            .filter((line) => line.problem)
            .map((line) => <Notice key={line.lineId} tone="danger" title={line.problem?.hint ?? ''} />)
        : null}
      {data.shortageTotal !== null && (data.shortageTotal > 0n || (data.gainTotal ?? 0n) > 0n) ? (
        <p className="text-sm">
          <span>{t('count.total.short', 'النقص («فرق جرد»)')}: </span>
          <MoneyText amount={data.shortageTotal} className="font-semibold" />
          <span>{t('list.separator', '، ')}</span>
          <span>{t('count.total.gain', 'الزيادة')}: </span>
          <MoneyText amount={data.gainTotal ?? 0n} className="font-semibold" />
        </p>
      ) : null}
      {refreshed ? <RefreshTable lines={refreshed} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {submitted ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy} disabled={!dirty} onClick={() => void saveReview()} data-action="save-count-review">
            {t('count.review.save', 'احفظ الأسباب والكلف')}
          </Button>
          <Button variant="secondary" busy={busy} disabled={!online || dirty} onClick={() => void refresh()} data-action="refresh-count">
            {t('count.refresh', 'أعد الحساب')}
          </Button>
          <Button busy={busy} disabled={!online || dirty || !data.ready} onClick={() => void post()} data-action="post-count">
            {t('count.post', 'وافق ورحّل الجرد')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirm('return')} data-action="return-count">
            {t('count.return', 'أعِد للعدّ')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirm('close')} data-action="close-count">
            {t('count.close', 'أغلِق دون ترحيل')}
          </Button>
        </div>
      ) : data.status === 'approved' ? (
        <Button variant="danger" onClick={() => setConfirm('void')} data-action="void-count">
          {t('count.void', 'ألغِ الجرد')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirm === 'return'}
        title={t('count.return.title', 'أعِد جرد «{store}» للعدّ', { store: store.name })}
        consequence={
          <div className="flex flex-col gap-3">
            <p>{t('count.return.consequence', 'يرجع الجرد مسوّدة للأمين ليعيد العدّ، وتُمسح لقطة الدفتر، وتبقى أسبابك وكلفك.')}</p>
            <Field id="count-return-reason" label={t('reason', 'السبب')}>
              <input id="count-return-reason" className="input" maxLength={500} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} />
            </Field>
            {failed ? (
              <Notice tone="danger" title={failed.title}>
                {failed.detail}
              </Notice>
            ) : null}
          </div>
        }
        confirmLabel={t('count.return', 'أعِد للعدّ')}
        tone="primary"
        busy={busy}
        action="confirm-return-count"
        onConfirm={() => void (returnReason.trim() ? giveBack() : setFailure(new RejectedError('reason_required', t('reason.required', 'اكتب السبب.'))))}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'close'}
        title={t('count.close.title', 'أغلِق جرد «{store}» دون ترحيل', { store: store.name })}
        consequence={t('count.close.consequence', 'يصير الجرد بتاريخ {day} ملغى بلا رقم ولا حركات ولا مصروف، ولا يرجع.', { day: fmtDay(doc.onDate) })}
        confirmLabel={t('count.close', 'أغلِق دون ترحيل')}
        busy={busy}
        action="confirm-close-count"
        onConfirm={close}
        onCancel={() => setConfirm(null)}
      />
      {confirm === 'void' && doc.docNo ? (
        <VoidDocDialog
          title={t('count.void.title', 'ألغِ الجرد {no}', { no: doc.docNo })}
          consequence={t('count.void.consequence', 'تُعكس كل حركات الجرد {no} في «{store}» (النقص يرجع لدفعاته والزيادة تُسحب)، ويُعكس «فرق الجرد».', { no: doc.docNo, store: store.name })}
          busy={busy}
          failure={failure}
          onConfirm={(reason) => void voidIt(reason)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function CountEditor({ docId }: { docId: string }) {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const load = useCallback(() => counts.loadCount(docId), [docId]);
  const [tick, setTick] = useState(0);
  const doc = useLoad(load, `${docId}#${tick}`);
  const setup = useLoad(inventory.loadOrgSetup);
  if (doc.error) return <LoadFailed what={t('count.what', 'الجرد')} error={doc.error} onRetry={doc.retry} />;
  if (setup.error) return <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />;
  if (!doc.data || !setup.data || !workspace) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const current = doc.data.doc;
  const store = storesOf(setup.data).find((s) => s.id === current.warehouseId);
  const changed = () => setTick((n) => n + 1);
  const reviewer = can(workspace.role, 'count.approve');
  const counter = can(workspace.role, 'count.enter');
  const stamp = { userId: workspace.userId, orgId: workspace.orgId };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={current.docNo ? t('count.title.no', 'الجرد {no}', { no: current.docNo }) : t('count.title', 'جرد «{store}»', { store: store?.name ?? '—' })}
        subtitle={t('count.subtitle', '{status} — بتاريخ {day}', { status: countStatusLabel(current.status), day: fmtDay(current.onDate) })}
        actions={
          <Link to="/inventory/counts" className="text-sm font-medium text-brand-700 dark:text-brand-200">
            {t('count.back', 'كل الجرود')}
          </Link>
        }
      />
      {!store ? (
        <Notice tone="warning" title={t('count.no_store', 'مخزن هذا الجرد غير متاح.')} />
      ) : current.status === 'draft' && counter ? (
        <CountEntry doc={current} lines={doc.data.lines} store={store} stamp={stamp} onChanged={changed} />
      ) : current.status !== 'draft' && reviewer ? (
        <CountReview doc={current} store={store} onChanged={changed} />
      ) : (
        <CountReadOnly doc={current} lines={doc.data.lines} />
      )}
    </div>
  );
}

function NewCount({ stores, onSaved }: { stores: readonly StoreRef[]; onSaved: (id: string) => void }) {
  const id = useId();
  const [storeId, setStoreId] = useState('');
  const [day, setDay] = useState(fmtDay(localDay()));
  // معرّف الجرد يولد مرّة ويبقى لحد ما ينكتب: الإعادة بعد جواب ضاع 23505 = انكتب، مو جرد ثاني.
  const [docId, setDocId] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const active = stores.filter((store) => !store.archived);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const date = postingDay(day);
    if (!storeId || !date.day) {
      setFailure(new RejectedError('fields', date.error ?? t('count.new.fields', 'اختر المخزن واكتب التاريخ.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    counts
      .createCountDraft(docId, storeId, date.day)
      .then(
        (doc) => onSaved(doc.id),
        (error: unknown) => {
          if (inventory.isDuplicate(error)) onSaved(docId);
          else {
            if (error instanceof RejectedError) setDocId(crypto.randomUUID());
            setFailure(error);
          }
        },
      )
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      <h2 className="font-semibold">{t('count.new', 'جرد جديد')}</h2>
      <StoreSelect id={`${id}-store`} label={t('count.store', 'المخزن')} stores={active} value={storeId} onChange={setStoreId} />
      <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={day} onChange={setDay} hint={t('use.day', 'اليوم أو قبله حتى 7 أيام.')} />
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" size="lg" busy={busy} data-action="create-count">
        {t('count.new.create', 'ابدأ العدّ')}
      </Button>
    </form>
  );
}

export function CountsList() {
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const reviewer = workspace ? can(workspace.role, 'count.approve') : false;
  const [waiting, setWaiting] = useState(reviewer);
  const load = useCallback(() => counts.listCounts(null, waiting ? 'submitted' : null), [waiting]);
  const first = useLoad(load, waiting ? 'submitted' : 'all');
  const setup = useLoad(inventory.loadOrgSetup);
  const [pages, setPages] = useState<{ key: string; list: counts.CountPage[] }>({ key: '', list: [] });
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const key = waiting ? 'submitted' : 'all';
  const extra = pages.key === key ? pages.list : [];
  const all = first.data ? [first.data, ...extra] : [];
  const seen = new Set<string>();
  const rows = all.flatMap((page) => page.rows).filter((doc) => (seen.has(doc.id) ? false : (seen.add(doc.id), true)));
  const next = all.at(-1)?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    counts.listCounts(next, waiting ? 'submitted' : null).then(
      (page) => {
        setPages((current) => ({ key, list: [...(current.key === key ? current.list : []), page] }));
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };
  const stores = setup.data ? storesOf(setup.data) : [];
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const counter = workspace ? can(workspace.role, 'count.enter') : false;
  const columns: Column<CountDoc>[] = [
    {
      key: 'no',
      header: t('ledger.doc', 'المستند'),
      cell: (doc) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/counts/${doc.id}`}>
          {doc.docNo ? <bdi dir="ltr">{doc.docNo}</bdi> : countStatusLabel(doc.status)}
        </Link>
      ),
    },
    { key: 'store', header: t('count.store', 'المخزن'), cell: (doc) => names.get(doc.warehouseId) ?? '—' },
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (doc) => fmtDay(doc.onDate) },
    { key: 'status', header: t('stock.doc.status', 'الحالة'), cell: (doc) => countStatusLabel(doc.status) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('stock.counts', 'الجرد')} subtitle={t('count.list.subtitle', 'العادّ يعدّ ويسلّم، والمدير يراجع ويوافق؛ الموافقة ترحّل الفرق.')} />
      {!counter ? <Notice tone="info" title={t('count.forbidden', 'الجرد لأمين المخزن والمدير ومالك المنشأة.')} /> : null}
      {counter && setup.error ? <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} /> : null}
      {counter && setup.data ? <NewCount stores={scopedStores(stores, workspace)} onSaved={(id) => navigate(`/inventory/counts/${id}`)} /> : null}
      {reviewer ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-brand-600" checked={waiting} onChange={(event) => setWaiting(event.target.checked)} data-action="filter-submitted" />
          {t('count.list.waiting', 'بانتظار المراجعة فقط')}
        </label>
      ) : null}
      {first.error ? (
        <LoadFailed what={t('count.list.what', 'الجرود')} error={first.error} onRetry={first.retry} />
      ) : first.data ? (
        <>
          <DataTable caption={t('stock.counts', 'الجرد')} columns={columns} rows={rows} rowKey={(doc) => doc.id} empty={waiting ? t('count.list.none_waiting', 'لا جرد بانتظار المراجعة.') : t('count.list.empty', 'لا جرود بعد.')} />
          <PageFooter shown={rows.length} total={first.data.total} next={next !== null} busy={more.busy} error={more.error} what={t('count.list.what', 'الجرود')} onMore={loadMore} action="more-counts" />
        </>
      ) : null}
    </div>
  );
}

export function CountDocPage() {
  const { id = '' } = useParams();
  return <CountEditor key={id} docId={id} />;
}
