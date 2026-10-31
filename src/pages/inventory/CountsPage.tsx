import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { PostPreview, previewReady, type PreviewDraw, type PreviewLine } from '../../components/ui/PostPreview';
import { QtyInput, type QtyValue } from '../../components/ui/QtyInput';
import { ReviewDialog } from '../../components/ui/ReviewDialog';
import { toast } from '../../components/ui/Toast';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { localDay } from '../../domain/dates';
import type { Milli, UnitCost } from '../../domain/money';
import { can } from '../../domain/permissions';
import { itemAdmissible } from '../../domain/stock';
import { BASE_UNITS } from '../../domain/stores';
import { parseQty, toBase, type BaseUnit } from '../../domain/units';
import { parseDayText, parseMomentText } from '../../lib/dayText';
import type { DraftStamp } from '../../lib/drafts';
import { describeError, RejectedError, ZeroRowsError, type ErrorContext, type ErrorDescription } from '../../lib/errors';
import { fmtDay, fmtInt, fmtMoney, fmtQty, fmtQtyCell, fmtUnitCost } from '../../lib/format';
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
import { DayField, postingDay } from '../../components/ui/DayField';
import {
  clearPending,
  countAmountText,
  devicePending,
  mergeCountFields,
  pendingText,
  sendPending,
  submitUnlessKept,
  underCountLock,
  unlessKept,
  writeOrKeep,
  type CountBase,
  type CountChange,
  type PendingCountLine,
  type PendingStore,
} from './countDevice';
import { canCopyDraft, CopiedNotice, CopyDraftAction, copyNext, DraftDayField, ItemPicker, loadItemUnits, PageFooter, readTime, runWithRef, scopedStores, StoreSelect, storesOf, unitOptions, useCopyDraft, useDraftIds, VoidDocDialog, type CopyDraft, type StoreRef, type VoidChoice } from './stock-shared';

// الجرد (الخطّة WP5، FOUNDATION ٥٥٥، القاعدة 17، E25، E41، E42، E48، E53، E54): العادّ يعدّ بالموبايل بيد وحدة (أهداف 44 بكسل أو
// أكبر) عدّاً أعمى (ما ينطلب رصيد الدفتر أصلاً)، بالوحدة أو بالتعبئة، والمادّة اللي تتابع الانتهاء بحقلين «صالح» و«منتهي»، والأفراخ
// بوقت فقس الزيادة، والماسح يكتب الرمز وEnter (E54). الحفظ اللي ما وصل الخادم يبقى بالجهاز لحد «أرسل المحفوظ». التسليم يجمّد العدّ.
// والمدير يراجع المسلَّم بجدول (الدفتر والمعدود والفرق، والمنتهي لحاله)، ويكتب سبب كل فرق وكلفة وحدة الزيادة بلا دفعة قياس (أربع
// مراتب)، و«أعد الحساب» يعرض الفرق القديم والجديد والمستندات بينهما، و«أعِد للعدّ» و«أغلِق دون ترحيل» بتأكيد، والموافقة = الترحيل.

export function countStatusLabel(status: CountStatus): string {
  switch (status) {
    case 'draft':
      return t('count.status.draft', 'غير محفوظ بعد');
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

/** حقول سطر الخادم كما تنكتب (للجمع ويّا عدّ جديد). */
export function fieldsOfLine(line: CountLine): CountLineFields {
  return {
    item_id: line.itemId,
    counted_qty: decimalText(line.counted, 3),
    counted_expired_qty: line.countedExpired === null ? null : decimalText(line.countedExpired, 3),
    gain_expiry_on: line.gainExpiryOn,
    gain_expired_expiry_on: line.gainExpiredExpiryOn,
    gain_born_at: line.gainBornAt,
  };
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
  const failed = failure ? countFailure(failure, 'once') : null;
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
          {/* عناوين محايدة (عدّ أعمى، E25): «الزائد» كان يقول للعادّ إن الدفتر أقلّ من عدّه. */}
          <DayField id={`${id}-gain-expiry`} label={t('count.line.valid_expiry', 'تاريخ انتهاء الصالح المعدود')} value={gainExpiry} onChange={setGainExpiry} hint={t('count.line.valid_expiry_hint', 'من العبوة؛ يُترك فارغاً إن لم يظهر.')} />
          <DayField id={`${id}-gain-expired-expiry`} label={t('count.line.expired_expiry', 'تاريخ انتهاء المنتهي المعدود')} value={gainExpiredExpiry} onChange={setGainExpiredExpiry} hint={t('count.line.expired_expiry_hint', 'من العبوة؛ تاريخ قبل يوم الجرد.')} />
        </>
      ) : null}
      {item?.kind === 'chick' ? (
        <Field
          id={`${id}-born`}
          label={t('count.line.born_counted', 'وقت فقس الأفراخ المعدودة')}
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

/** سطور العادّ كبطاقات (الموبايل): المادّة والمعدود والمنتهي، بلا رصيد الدفتر (E25). الزرّان بمسافة تكفي الإصبع. */
export function CountedLines({ lines, onEdit, onDelete }: { lines: readonly CountLine[]; onEdit: ((line: CountLine) => void) | null; onDelete: ((line: CountLine) => void) | null }) {
  if (lines.length === 0) return <p className="text-sm text-ink-muted">{t('count.lines.empty', 'لم يُعدّ شيء بعد.')}</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label={t('count.lines', 'سطور الجرد')}>
      {lines.map((line) => (
        <li key={line.id} className="card flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{line.itemName}</div>
            <div className="text-sm text-ink-muted tabular-nums">{countedText(line)}</div>
          </div>
          <div className="flex shrink-0 gap-4">
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

function countedText(line: Pick<CountLine, 'counted' | 'countedExpired' | 'baseUnit'>): string {
  return line.countedExpired !== null
    ? t('count.line.both', 'صالح {valid}، منتهٍ {expired}', { valid: fmtQty(line.counted, line.baseUnit).main, expired: fmtQty(line.countedExpired, line.baseUnit).main })
    : fmtQty(line.counted, line.baseUnit).main;
}

export type RejectedCount = { key: string; line: PendingCountLine; error: unknown };

/** نصيحة العدّ المرفوض بسببه: المادّة معدودة بسطر (أضف إليه، مو «عدّله» فيمسح العدّ الثاني)، والسطر تغيّر (راجع قبل الإضافة). */
function rejectedAdvice(line: PendingCountLine, error: unknown): string {
  if (error instanceof RejectedError && error.code === 'item_already_counted') {
    return t('count.rejected.counted', '«{item}» معدودة بسطر من جهاز آخر في هذا الجرد؛ أضف عدّك من «أضف العدّ» فيُجمع إلى سطرها.', { item: line.itemName });
  }
  if (error instanceof ZeroRowsError) {
    return t('count.rejected.changed', 'تغيّر عدّ «{item}» على الخادم قبل أن يصل هذا (جهاز أو نافذة أخرى)؛ راجع عدّها الآن، ثم أضف ما لم يُحسب منه.', { item: line.itemName });
  }
  return countFailure(error).detail;
}

/**
 * العدّ المحفوظ اللي رفضه الخادم: يبقى معروضاً حتى بعد ما يتغيّر الجرد (التسليم يبدّل الشاشة)، وبكميته (واللي أضافه العادّ للجمع)
 * لأنه انشال من الجهاز، فالعادّ يضيفه من جديد منها (المراجعة الثالثة). والرابعة: كل رفض بتنبيهه (إرسال ثاني ما يمسح اللي قبله)،
 * وينشال بزرّه بعد ما يقراه العادّ.
 */
function RejectedNotices({ rejected, onDismiss }: { rejected: readonly RejectedCount[]; onDismiss: (key: string) => void }) {
  return (
    <>
      {rejected.map(({ key, line, error }) => (
        <Notice key={key} tone="danger" title={t('count.rejected', 'لم يُقبل عدّ {line}', { line: pendingText(line) })}>
          <p>{rejectedAdvice(line, error)}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => onDismiss(key)} data-action="dismiss-rejected-count">
            {t('count.rejected.dismiss', 'قرأته، أخفِ التنبيه')}
          </Button>
        </Notice>
      ))}
    </>
  );
}

/** المرفوض يُضاف لما قبله بمفتاح لكل حدث. */
function withRejected(now: readonly RejectedCount[], more: readonly { line: PendingCountLine; error: unknown }[]): readonly RejectedCount[] {
  return more.length === 0 ? now : [...now, ...more.map((entry) => ({ key: crypto.randomUUID(), ...entry }))];
}

/** رفض محلّي (ما انرسل شي: محفوظ ما وصل، أو تغيّر قبل الإضافة) بعنوانه، مو «الخادم رفض العملية» (المراجعة الثالثة). */
const LOCAL_REFUSALS = new Set(['kept_first', 'count_changed', 'kept_unsent']);
function countFailure(error: unknown, context: ErrorContext = 'write'): ErrorDescription {
  if (error instanceof RejectedError && LOCAL_REFUSALS.has(error.code)) return { kind: 'rejected', title: t('count.local.title', 'لم يُرسل شيء'), detail: error.hint ?? '' };
  return describeError(error, context);
}

/** المحفوظ بالجهاز لهذا الجرد (لكل مستخدم بالجهاز): يُقرأ ويُعاد قراءته بعد كل كتابة. */
function usePending(stamp: DraftStamp, docId: string) {
  const [state, setState] = useState<{ lines: readonly PendingCountLine[]; failed: unknown }>({ lines: [], failed: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    devicePending(stamp, docId, '')
      .read()
      .then(
        (draft) => {
          if (!cancelled) setState({ lines: draft?.payload.lines ?? [], failed: null });
        },
        (error: unknown) => {
          if (!cancelled) setState((current) => ({ ...current, failed: error }));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [stamp, docId, tick]);
  return { ...state, reread: () => setTick((n) => n + 1) };
}

type MergeAsk = { draft: LineDraft; base: Extract<CountBase, { fields: CountLineFields }>; added: CountLineFields; total: CountLineFields };

/**
 * جملة الجمع: العدّ قبل وبعد (والمنتهي لمادّة تتابعه)، وأساسه محفوظ بالجهاز ما وصل أو سطر الجرد، والتواريخ ووقت الفقس المكتوبة
 * الآن تحلّ محلّ السابقة. «الصالح» لمادّة تتابع الانتهاء بس، مثل عنوان حقلها (المراجعة الثالثة).
 */
export function mergeSentence(ask: MergeAsk): string {
  const item = ask.draft.item;
  const qty = (text: string | null) => fmtQty(parseQty(text ?? '0') ?? 0n, item.baseUnit).main;
  const before = ask.base.fields;
  const parts = { before: qty(before.counted_qty), added: qty(ask.added.counted_qty), total: qty(ask.total.counted_qty) };
  const valid = item.tracksExpiry ? t('count.merge.valid', 'الصالح {before} ويُضاف {added} فيصير {total}', parts) : t('count.merge.counted', '{before} ويُضاف {added} فيصير {total}', parts);
  const expired = item.tracksExpiry
    ? t('count.merge.expired', '، والمنتهي {before} ويُضاف {added} فيصير {total}', { before: qty(before.counted_expired_qty), added: qty(ask.added.counted_expired_qty), total: qty(ask.total.counted_expired_qty) })
    : '';
  const dates = item.tracksExpiry || item.kind === 'chick' ? t('count.merge.dates', '؛ والتواريخ المكتوبة الآن تحلّ محلّ السابقة') : '';
  return ask.base.kind === 'kept'
    ? t('count.merge.kept_consequence', '«{item}» معدودة من قبل بعدٍّ محفوظ بالجهاز لم يُرسل: {valid}{expired}{dates}.', { item: item.name, valid, expired, dates })
    : t('count.merge.consequence', '«{item}» معدودة من قبل: {valid}{expired}{dates}.', { item: item.name, valid, expired, dates });
}

const isStaleDraft = (error: unknown): boolean => error instanceof RejectedError && error.code === 'stale_draft';

/** الجرد تغيّر من نافذة أو جهاز ثاني (stale_draft): الشاشة تقرا نسخته، والرسالة تبقى بعد القراءة (تنبيه، مو حالة تضيع). */
function staleDraftToast() {
  toast({ tone: 'warning', title: t('count.stale_draft', 'تغيّر الجرد من نافذة أو جهاز آخر'), detail: t('count.stale_draft.detail', 'هذه نسخته الآن؛ راجعها وأعد المحاولة.') });
}

/** العدّ بالموبايل (المسوّدة، count.enter): أعمى، والحفظ اللي ما وصل يبقى بالجهاز، والتسليم بتأكيد. */
function CountEntry({
  doc,
  lines,
  store,
  stamp,
  onRejected,
  onFailure,
  onChanged,
}: {
  doc: CountDoc;
  lines: readonly CountLine[];
  store: StoreRef;
  stamp: DraftStamp;
  onRejected: Dispatch<SetStateAction<readonly RejectedCount[]>>;
  onFailure: (error: unknown) => void;
  onChanged: () => void;
}) {
  const online = useStore(onlineStore);
  const [editing, setEditing] = useState<CountLine | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  // فشل حفظ السطر بالنموذج نفسه، وفشل الأفعال (التسليم والحذف والإرسال) يرتفع للمحرّر: الشاشة تنفتح من جديد بعد القراءة.
  const [lineFailure, setLineFailure] = useState<unknown>(null);
  const pending = usePending(stamp, doc.id);
  const [confirm, setConfirm] = useState<{ kind: 'submit' } | { kind: 'delete'; line: CountLine } | { kind: 'merge'; ask: MergeAsk } | null>(null);
  const local: PendingStore = devicePending(stamp, doc.id, t('count.pending.title', 'جرد «{store}» بتاريخ {day}', { store: store.name, day: fmtDay(doc.onDate) }));
  const send = { add: counts.addCountLine, update: counts.updateCountLine };
  const failed = (error: unknown) => {
    if (isStaleDraft(error)) {
      staleDraftToast();
      onChanged();
      return;
    }
    onFailure(error);
  };
  const write = (change: CountChange, typed: CountLineFields, item: LineDraft['item']) => {
    setBusy(true);
    setLineFailure(null);
    onFailure(null);
    writeOrKeep(doc.id, local, change, send)
      .then(
        (outcome) => {
          setEditing(null);
          setFormKey((n) => n + 1);
          pending.reread();
          if (outcome.kind === 'written') {
            onChanged();
            return;
          }
          if (outcome.kind === 'dropped') {
            // جمع على عدّ محفوظ انرفض (السطر تغيّر بجهاز ثاني أو الجرد سُلّم): انشال من الجهاز وينعرض بكميته فوق الشاشة.
            onRejected((now) => withRejected(now, [{ line: outcome.line, error: outcome.error }]));
            onChanged();
            return;
          }
          toast({ tone: 'warning', title: t('count.kept', 'حُفظ العدّ بالجهاز'), detail: t('count.kept.detail', 'لم يتأكّد وصوله إلى الخادم؛ أرسله من «أرسل المحفوظ» حين يعود الاتصال، ولن يُحسب مرّتين.') });
        },
        (error: unknown) => {
          // العدّ المضاف وأساسه تغيّر (السطر من جهاز ثاني فصفر صفوف، أو المادّة صارت معدودة بسطر، أو المحفوظ بنافذة ثانية): قراءة جديدة
          // وتنبيه بكمية العادّ حتى يضيفها على العدّ الجديد.
          const recount =
            change.kind === 'add' &&
            ((error instanceof ZeroRowsError && change.base.kind === 'server') || (error instanceof RejectedError && (error.code === 'count_changed' || error.code === 'item_already_counted')));
          if (recount) {
            toast({
              tone: 'warning',
              title: t('count.merge.changed', 'تغيّر عدّ «{item}» قبل أن يُحفظ عدّك', { item: item.name }),
              detail: t('count.merge.changed_detail', 'هذا عدّها الآن؛ أضف عدّك ({qty}) من جديد.', { qty: countAmountText(typed, item.baseUnit) }),
            });
            pending.reread();
            onChanged();
            return;
          }
          setLineFailure(error);
        },
      )
      .finally(() => setBusy(false));
  };
  const save = (draft: LineDraft, fields: CountLineFields) => {
    const edited = draft.lineId === null ? undefined : lines.find((line) => line.id === draft.lineId);
    if (edited) {
      // التعديل مشروط بقيم البطاقة اللي عدّل عليها (المراجعة الرابعة: كان مطلقاً فيمسح جمعاً من جهاز ثاني).
      const seen = fieldsOfLine(edited);
      write({ kind: 'set', line: { id: edited.id, existing: true, itemName: draft.item.name, baseUnit: draft.item.baseUnit, fields }, seen }, fields, draft.item);
      return;
    }
    // المادّة معدودة (بعدّ محفوظ بالجهاز ما وصل، أو بسطر): العدّ الجديد يُضاف لعدّها بتأكيد يسمّي الأساس، والكتابة تتأكّد تحت القفل إن
    // الأساس ما تغيّر (المحفوظ بنافذة ثانية، وسطر الخادم بشرط قيمته).
    const kept = pending.lines.find((line) => line.fields.item_id === draft.item.id);
    const shown = lines.find((line) => line.itemId === draft.item.id);
    if (kept && !kept.existing && shown) {
      // سطر جديد محفوظ ما وصل، وجهاز آخر عدّ المادّة بسطر: الجمع على المحفوظ ينرفض حتماً (المادّة معدودة)، فالمحفوظ أوّلاً (المراجعة الرابعة).
      setLineFailure(new RejectedError('kept_first', t('count.kept_and_line', 'لـ«{item}» عدّ محفوظ بالجهاز لم يُرسل، وعدّها جهاز آخر بسطر في هذا الجرد؛ أرسل المحفوظ أوّلاً، ثم أضف.', { item: draft.item.name })));
      return;
    }
    const base = kept ? ({ kind: 'kept', id: kept.id, fields: kept.fields } as const) : shown ? ({ kind: 'server', id: shown.id, fields: fieldsOfLine(shown) } as const) : null;
    if (base) {
      setConfirm({ kind: 'merge', ask: { draft, base, added: fields, total: mergeCountFields(base.fields, fields) } });
      return;
    }
    write({ kind: 'add', itemName: draft.item.name, baseUnit: draft.item.baseUnit, added: fields, base: { kind: 'none', id: crypto.randomUUID() } }, fields, draft.item);
  };
  const sendKept = () => {
    setBusy(true);
    onFailure(null);
    underCountLock(doc.id, () => sendPending(doc.id, local, send))
      .then((result) => {
        // المرفوض يرجع حتى لو وقف الإرسال بعده (شبكة)، ويُضاف فوق الشاشة لما قبله (إرسال ثاني ما يمسحه، المراجعة الرابعة).
        onRejected((now) => withRejected(now, result.rejected));
        if (result.sent > 0) toast({ tone: 'success', title: t('count.sent', 'أُرسل المحفوظ: {n}', { n: fmtInt(result.sent) }) });
        if (result.failure) failed(result.failure);
        onChanged();
      }, failed)
      .finally(() => {
        setBusy(false);
        pending.reread();
      });
  };
  const deleteLine = (line: CountLine) => {
    setBusy(true);
    onFailure(null);
    unlessKept(doc.id, local, { id: line.id, itemId: line.itemId, itemName: line.itemName }, () => counts.deleteCountLine(line.id, doc.version))
      .then(onChanged, failed)
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const submit = async () => {
    setBusy(true);
    onFailure(null);
    // بالنسخة اللي شافها العادّ: سطر أضافته نافذة ثانية بعدها stale_draft، والشاشة تقرا الجرد من جديد فيشوفه قبل ما يسلّم. والمحفوظ
    // بالجهاز يُقرأ تحت القفل (نافذة ثانية ممكن حفظت عدّاً بعد العرض، والجرد المسلَّم ما يستقبله).
    const outcome = await submitUnlessKept(doc.id, local, () => runWithRef(`count-submit:${doc.id}`, (ref) => counts.submitCount(ref, doc.id, doc.version))).catch((error: unknown) => ({ kind: 'failed' as const, error }));
    setBusy(false);
    setConfirm(null);
    if (outcome.kind === 'failed') {
      pending.reread();
      failed(outcome.error);
    } else {
      toast({ tone: 'success', title: t('count.submitted', 'سُلّم الجرد للمراجعة') });
      onChanged();
    }
  };
  const ask = confirm?.kind === 'merge' ? confirm.ask : null;
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info" title={t('count.blind', 'عدّ أعمى: اكتب ما تراه على الرفّ؛ الرصيد المسجّل لا يظهر هنا.')} />
      {doc.returnReason ? <Notice tone="warning" title={t('count.returned', 'أعاد المدير الجرد للعدّ')}>{doc.returnReason}</Notice> : null}
      <DraftDayField day={doc.onDate} save={(day) => counts.updateCountDraft(doc, { day })} onSaved={onChanged} />
      <CountedLines lines={lines} onEdit={(line) => setEditing(line)} onDelete={(line) => setConfirm({ kind: 'delete', line })} />
      {editing ? (
        <CountLineForm key={editing.id} store={store} line={editing} busy={busy} failure={lineFailure} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <CountLineForm key={`new-${formKey}`} store={store} line={null} busy={busy} failure={lineFailure} onSave={save} onCancel={null} />
      )}
      {pending.failed ? <LoadFailed what={t('count.pending.what', 'العدّ المحفوظ بالجهاز')} error={pending.failed} onRetry={pending.reread} /> : null}
      {pending.lines.length > 0 ? (
        <section className="card flex flex-col gap-3 p-4" aria-labelledby="count-pending">
          <h2 id="count-pending" className="font-semibold">
            {t('count.pending', 'محفوظ بالجهاز ولم يُرسل')}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {pending.lines.map((line) => (
              <li key={line.id}>{pendingText(line)}</li>
            ))}
          </ul>
          <Button size="lg" busy={busy} disabled={!online} onClick={sendKept} icon={<Send aria-hidden="true" className="size-5" />} data-action="send-kept-counts">
            {t('count.pending.send', 'أرسل المحفوظ')}
          </Button>
        </section>
      ) : null}
      <Button size="lg" disabled={!online || busy || lines.length === 0 || pending.lines.length > 0} onClick={() => setConfirm({ kind: 'submit' })} data-action="submit-count">
        {t('count.submit', 'سلّم الجرد للمراجعة')}
      </Button>
      {pending.lines.length > 0 ? <p className="text-sm text-ink-muted">{t('count.submit.pending', 'أرسل المحفوظ بالجهاز أوّلاً، ثم سلّم الجرد.')}</p> : null}
      <ConfirmDialog
        open={confirm?.kind === 'submit'}
        tone="primary"
        title={t('count.submit.title', 'سلّم جرد «{store}»', { store: store.name })}
        consequence={t('count.submit.consequence', 'يُسلَّم {n} من السطور للمراجعة ويُجمَّد العدّ، فلا يُعدَّل إلا إذا أعاده المدير للعدّ.', { n: fmtInt(lines.length) })}
        confirmLabel={t('count.submit', 'سلّم الجرد للمراجعة')}
        busy={busy}
        action="confirm-submit-count"
        onConfirm={() => void submit()}
        onCancel={() => setConfirm(null)}
      />
      {confirm?.kind === 'delete' ? (
        <ConfirmDialog
          open
          title={t('count.delete.title', 'احذف عدّ «{item}»', { item: confirm.line.itemName })}
          consequence={t('count.delete.consequence', 'يُحذف سطر «{item}» ({qty}) من الجرد.', { item: confirm.line.itemName, qty: countedText(confirm.line) })}
          confirmLabel={t('transfer.line.delete', 'احذف السطر')}
          busy={busy}
          action="confirm-delete-count-line"
          onConfirm={() => deleteLine(confirm.line)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {ask ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('count.merge.title', 'أضف إلى عدّ «{item}»', { item: ask.draft.item.name })}
          consequence={mergeSentence(ask)}
          confirmLabel={t('count.merge', 'أضف إلى العدّ')}
          busy={busy}
          action="confirm-merge-count"
          onConfirm={() => {
            setConfirm(null);
            write({ kind: 'add', itemName: ask.draft.item.name, baseUnit: ask.draft.item.baseUnit, added: ask.added, base: ask.base }, ask.added, ask.draft.item);
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

/** سطور الجرد بلا الدفتر لغير المراجع (المسلَّم والمرحَّل للعادّ)، والمحفوظ بالجهاز اللي ما عاد يُرسل (الجرد سُلّم) يُمسح بتأكيد. */
function CountReadOnly({ doc, lines, store, stamp, copier, copyNextStep }: { doc: CountDoc; lines: readonly CountLine[]; store: StoreRef | null; stamp: DraftStamp; copier: CopyDraft | null; copyNextStep: string }) {
  const pending = usePending(stamp, doc.id);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const clear = () => {
    setBusy(true);
    setFailure(null);
    // اللي انعرض وتأكّد مسحه بس: نافذة ثانية ممكن حفظت عدّاً بعد العرض (المراجعة الثانية لـWP5).
    clearPending(
      devicePending(stamp, doc.id, store?.name ?? ''),
      doc.id,
      pending.lines.map((line) => line.id),
    )
      .then(() => setConfirm(false), setFailure)
      .finally(() => {
        setBusy(false);
        pending.reread();
      });
  };
  const failed = failure ? describeError(failure) : null;
  return (
    <div className="flex flex-col gap-4">
      {doc.status === 'submitted' ? <Notice tone="info" title={t('count.frozen', 'الجرد مسلَّم للمراجعة؛ لا يُعدَّل إلا إذا أعاده المدير للعدّ.')} /> : null}
      {doc.voidReason ? <Notice tone="warning" title={t('count.voided', 'أُلغي هذا الجرد')}>{doc.voidReason}</Notice> : null}
      <CountedLines lines={lines} onEdit={null} onDelete={null} />
      {doc.status === 'void' && doc.docNo && copier ? <CopyDraftAction copier={copier} from={t('count.title.no', 'الجرد {no}', { no: doc.docNo })} next={copyNextStep} /> : null}
      {pending.failed ? <LoadFailed what={t('count.pending.what', 'العدّ المحفوظ بالجهاز')} error={pending.failed} onRetry={pending.reread} /> : null}
      {pending.lines.length > 0 ? (
        <section className="card flex flex-col gap-3 p-4" aria-labelledby="count-kept-stuck">
          <h2 id="count-kept-stuck" className="font-semibold">
            {t('count.pending.stuck', 'عدّ محفوظ بالجهاز لم يصل قبل التسليم')}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {pending.lines.map((line) => (
              <li key={line.id}>{pendingText(line)}</li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">{t('count.pending.stuck_hint', 'لا يُرسل إلى جرد مسلَّم؛ إن كان لازماً فاطلب من المدير إعادته للعدّ قبل مسحه.')}</p>
          {failed ? (
            <Notice tone="danger" title={failed.title}>
              {failed.detail}
            </Notice>
          ) : null}
          <Button variant="secondary" busy={busy} onClick={() => setConfirm(true)} data-action="erase-kept-counts">
            {t('count.pending.clear', 'امسح المحفوظ')}
          </Button>
        </section>
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={t('count.pending.clear.title', 'امسح العدّ المحفوظ بالجهاز')}
        consequence={t('count.pending.clear.consequence', 'يُمسح من هذا الجهاز: {lines}. لا يصل الخادم بعدها.', { lines: pending.lines.map(pendingText).join(t('list.separator', '، ')) })}
        confirmLabel={t('count.pending.clear', 'امسح المحفوظ')}
        busy={busy}
        action="confirm-erase-kept-counts"
        onConfirm={clear}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

function decimalsOf(unit: BaseUnit): 0 | 3 {
  return unit === 'pc' ? 0 : 3;
}

function qtyOrDash(qty: Milli | null, unit: BaseUnit): string {
  return qty === null ? '—' : fmtQtyCell(qty, decimalsOf(unit));
}

/** السطور بوحداتها (جدول لكل وحدة أساس، والوحدة برأس العمود)، بترتيب BASE_UNITS. */
function byUnit<Row extends { baseUnit: BaseUnit }>(rows: readonly Row[]): { unit: BaseUnit; rows: Row[] }[] {
  return BASE_UNITS.map((unit) => ({ unit, rows: rows.filter((row) => row.baseUnit === unit) })).filter((group) => group.rows.length > 0);
}

/** مستند غيّر رصيد يوم الجرد بعد اللقطة: اسمه وكميته باتّجاهها (وارد يزيد الرصيد، وصادر ينقصه). */
export function refreshDocText(doc: { label: string; qty: Milli; voided: boolean }, unit: BaseUnit): string {
  const qty = fmtQty(doc.qty < 0n ? -doc.qty : doc.qty, unit).main;
  // مستند انلغى بعد اللقطة: عكسياته تنقص الوارد وتزيد الصادر، فاتّجاهه اتّجاه أصله (المراجعة الثالثة: إلغاء الوارد كان يُقرأ «صادر»).
  if (doc.voided) {
    return doc.qty < 0n ? t('count.refresh.doc_void_in', '{label} (إلغاء وارد {qty})', { label: doc.label, qty }) : t('count.refresh.doc_void_out', '{label} (إلغاء صادر {qty})', { label: doc.label, qty });
  }
  return doc.qty < 0n ? t('count.refresh.doc_out', '{label} (صادر {qty})', { label: doc.label, qty }) : t('count.refresh.doc_in', '{label} (وارد {qty})', { label: doc.label, qty });
}

/** «أعد الحساب»: الفرق القديم والجديد جنب بعض (جدول لكل وحدة)، والمستندات اللي غيّرت رصيد يوم الجرد باسمها وكميتها. */
function RefreshTable({ lines }: { lines: readonly RefreshedLine[] }) {
  return (
    <>
      {byUnit(lines).map(({ unit, rows }) => {
        const label = baseUnitLabel(unit);
        const columns: Column<RefreshedLine>[] = [
          { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
          { key: 'old', header: t('count.refresh.old_in', 'الفرق السابق ({unit})', { unit: label }), kind: 'number', cell: (line) => <Num>{line.before.diff === null ? '—' : signedQtyCell(line.before.diff, decimalsOf(unit))}</Num> },
          { key: 'new', header: t('count.refresh.new_in', 'الفرق الآن ({unit})', { unit: label }), kind: 'number', cell: (line) => <Num>{line.after.diff === null ? '—' : signedQtyCell(line.after.diff, decimalsOf(unit))}</Num> },
          {
            key: 'docs',
            header: t('count.refresh.docs', 'المستندات بعد العدّ'),
            cell: (line) => (line.docs.length === 0 ? '—' : line.docs.map((doc) => refreshDocText(doc, line.baseUnit)).join(t('list.separator', '، '))),
          },
        ];
        return <DataTable key={unit} caption={t('count.refresh.caption_in', 'إعادة الحساب ({unit})', { unit: label })} columns={columns} rows={rows} rowKey={(line) => line.lineId} empty={t('count.lines.empty', 'لم يُعدّ شيء بعد.')} />;
      })}
    </>
  );
}

const costTextOf = (cost: UnitCost | null): string => (cost === null ? '' : decimalText(cost, 4));

function lotLabel(draw: { receivedOn: string; expiryOn: string | null }): string {
  return draw.expiryOn
    ? t('count.lot.expiry', 'استُلمت {received} — تنتهي {expiry}', { received: fmtDay(draw.receivedOn), expiry: fmtDay(draw.expiryOn) })
    : t('count.lot', 'استُلمت {received}', { received: fmtDay(draw.receivedOn) });
}

/**
 * خطوط موافقة الترحيل (مثل الصرف والتحويل): لكل سطر بنقص سحبه بدفعاته (S)، وبنقص منتهٍ سحبه من المنتهي (X)، وبزيادة دفعتها الجديدة
 * بيوم الجرد (G). كل خطّ يُوافق عليه قبل الترحيل.
 */
export function countPreviewLines(preview: Pick<CountPreview, 'lines'>): PreviewLine[] {
  const out: PreviewLine[] = [];
  for (const line of preview.lines) {
    const minus = (qty: Milli | null): Milli => (qty !== null && qty < 0n ? -qty : 0n);
    const plus = (qty: Milli | null): Milli => (qty !== null && qty > 0n ? qty : 0n);
    const drawn = (draws: CountPreviewLine['draws']): Milli => draws.reduce((sum, draw) => sum + draw.qty, 0n);
    const shortOf = (draws: CountPreviewLine['draws']): PreviewDraw[] => draws.map((draw) => ({ lotId: draw.lotId, lotLabel: lotLabel(draw), qty: draw.qty, value: draw.value }));
    const short = minus(line.diff);
    if (short > 0n) {
      out.push({ lineId: `${line.lineId}:S`, itemName: t('count.preview.short', 'نقص «{item}»', { item: line.itemName }), unit: line.baseUnit, requested: short, draws: shortOf(line.draws), shortage: short > drawn(line.draws) ? short - drawn(line.draws) : 0n });
    }
    const expiredShort = minus(line.expiredDiff);
    if (expiredShort > 0n) {
      out.push({
        lineId: `${line.lineId}:X`,
        itemName: t('count.preview.expired_short', 'نقص المنتهي من «{item}»', { item: line.itemName }),
        unit: line.baseUnit,
        requested: expiredShort,
        draws: shortOf(line.expiredDraws),
        shortage: expiredShort > drawn(line.expiredDraws) ? expiredShort - drawn(line.expiredDraws) : 0n,
      });
    }
    const gain = plus(line.diff);
    const expiredGain = plus(line.expiredDiff);
    if (gain + expiredGain > 0n) {
      // القيمة لكل الزيادة (الخادم يجمع الصالح والمنتهي)، فبجزأين تنعرض بالجدول بس.
      const draws: PreviewDraw[] = [];
      if (gain > 0n) draws.push({ lotId: `${line.lineId}:gain`, lotLabel: t('count.preview.gain_lot', 'وجبة زيادة جديدة بيوم الجرد'), qty: gain, value: expiredGain > 0n ? null : line.gainValue });
      if (expiredGain > 0n) draws.push({ lotId: `${line.lineId}:gain_expired`, lotLabel: t('count.preview.gain_expired_lot', 'وجبة زيادة منتهية بيوم الجرد'), qty: expiredGain, value: gain > 0n ? null : line.gainValue });
      out.push({ lineId: `${line.lineId}:G`, itemName: t('count.preview.gain', 'زيادة «{item}»', { item: line.itemName }), unit: line.baseUnit, requested: gain + expiredGain, draws, shortage: 0n });
    }
  }
  return out;
}

/** زرّ الترحيل: معاينة جاهزة، وكل خطّ نقص أو زيادة انوافق عليه (جرد بلا فروق بلا خطوط)، والشبكة موجودة. */
export function countPostReady(preview: Pick<CountPreview, 'lines' | 'ready'>, approved: ReadonlySet<string>, online: boolean): boolean {
  const lines = countPreviewLines(preview);
  return online && preview.ready && (lines.length === 0 || previewReady(lines, approved));
}

/** مراجعة المدير (count.approve): الجدول والأسباب وكلفة الزيادة، وإعادة الحساب، والإعادة للعدّ، والإغلاق، والموافقة = الترحيل. */
function CountReview({
  doc,
  store,
  canVoid,
  copier,
  copyNextStep,
  refreshed,
  onRefreshed,
  onChanged,
}: {
  doc: CountDoc;
  store: StoreRef;
  canVoid: boolean;
  /** «ألغِ وافتح نسخة للتصحيح» لمن ينشئ جرداً بهذا المخزن (null لغيره)؛ حالته بالأب فتبقى بعد القراءة الجديدة. */
  copier: CopyDraft | null;
  /** ما بعد النسخة لدور الداخل (copyNext). */
  copyNextStep: string;
  refreshed: readonly RefreshedLine[] | null;
  onRefreshed: (lines: readonly RefreshedLine[] | null) => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const load = useCallback(() => counts.previewCount(doc.id), [doc.id]);
  const [tick, setTick] = useState(0);
  const preview = useLoad(load, `${doc.id}#${doc.version}#${tick}`);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [approval, setApproval] = useState<{ plan: string; keys: ReadonlySet<string> }>({ plan: '', keys: new Set() });
  const [confirm, setConfirm] = useState<'post' | 'return' | 'close' | 'void' | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [stale, setStale] = useState<string | null>(null);
  if (preview.error) return <LoadFailed what={t('count.review.what', 'مراجعة الجرد')} error={preview.error} onRetry={preview.retry} />;
  if (!preview.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const data: CountPreview = preview.data;
  const failed = failure ? describeError(failure) : null;
  const submitted = data.status === 'submitted';
  const reasonOf = (line: CountPreviewLine) => reasons[line.lineId] ?? line.reason ?? '';
  const needsReason = (line: CountPreviewLine) => (line.diff ?? 0n) !== 0n || (line.expiredDiff ?? 0n) !== 0n;
  const needsCost = (line: CountPreviewLine) => ((line.diff ?? 0n) > 0n || (line.expiredDiff ?? 0n) > 0n) && line.gainSource !== 'lot';
  // سبب كُتب على فرق غيّرته «أعد الحساب»: يُرسل من جديد (ولو بنفس النصّ) ليتأكّد على الفرق الحالي.
  const staleReasons = submitted ? data.lines.filter((line) => line.reasonStale && needsReason(line)) : [];
  const approved = approval.plan === data.plan ? approval.keys : new Set<string>();
  const postLines = countPreviewLines(data);
  const after = () => {
    setTick((n) => n + 1);
    onChanged();
  };
  // الجرد تغيّر من نافذة أو جهاز ثاني (stale_draft): قراءة جديدة بدل زرّ يعيد نفس النسخة للأبد (المراجعة الثانية لـWP5).
  const fail = (error: unknown) => {
    if (isStaleDraft(error)) {
      staleDraftToast();
      setFailure(null);
      after();
      return;
    }
    setFailure(error);
  };
  const saveReview = async () => {
    setBusy(true);
    setFailure(null);
    try {
      for (const line of data.lines) {
        const reason = reasons[line.lineId];
        if ((reason !== undefined && reason.trim() !== (line.reason ?? '')) || staleReasons.includes(line)) await counts.setCountReason(line.lineId, reasonOf(line), { diff: line.diff, expiredDiff: line.expiredDiff });
        const cost = costs[line.lineId];
        if (cost !== undefined && cost.trim() !== costTextOf(line.gainUnitCost)) {
          const parsed = cost.trim() ? parseDecimal(cost, 4) : null;
          if (cost.trim() && parsed === null) throw new RejectedError('cost', t('count.cost.invalid', 'اكتب كلفة الوحدة رقماً بأربع مراتب عشرية كحدّ أقصى.'));
          await counts.setGainUnitCost(line.lineId, line.gainUnitCost, parsed ? toScale(parsed, 4) : null);
        }
      }
      setReasons({});
      setCosts({});
      after();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-refresh:${doc.id}`, (ref) => counts.refreshCount(ref, doc.id, data.version));
    setBusy(false);
    if (outcome.kind === 'failed') fail(outcome.error);
    else {
      onRefreshed(outcome.kind === 'done' ? outcome.result.lines : null);
      setStale(null);
      after();
    }
  };
  const post = async () => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-post:${doc.id}`, (ref) => counts.postCount(ref, doc.id, data.version, data.plan));
    setBusy(false);
    setConfirm(null);
    if (outcome.kind === 'failed') {
      const error = outcome.error;
      if (error instanceof RejectedError && error.code === 'count_stale') {
        setStale(error.hint);
        setTick((n) => n + 1);
        return;
      }
      if (error instanceof RejectedError && error.code === 'stale_preview') setTick((n) => n + 1);
      fail(error);
      return;
    }
    if (outcome.kind === 'done') toast({ tone: 'success', title: t('count.posted', 'حُفظ الجرد {no} نهائياً', { no: outcome.result.docNo ?? '' }) });
    else toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') });
    onRefreshed(null);
    after();
  };
  const giveBack = async () => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-return:${doc.id}`, (ref) => counts.returnCount(ref, doc.id, data.version, returnReason.trim()));
    setBusy(false);
    if (outcome.kind === 'failed') fail(outcome.error);
    else {
      setConfirm(null);
      setReturnReason('');
      onRefreshed(null);
      after();
    }
  };
  const close = () => {
    setBusy(true);
    setFailure(null);
    counts
      .discardCount(doc.id, data.version)
      .then(() => navigate('/inventory/counts'), fail)
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const copyFrom = t('count.title.no', 'الجرد {no}', { no: doc.docNo ?? '' });
  const voidIt = async (reason: string, choice: VoidChoice) => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`count-void:${doc.id}`, (ref) => counts.voidCount(ref, doc.id, reason));
    if (outcome.kind === 'failed') {
      setBusy(false);
      fail(outcome.error);
      return;
    }
    // «ألغِ وافتح نسخة للتصحيح»: الإلغاء تمّ، والنسخة تنفتح؛ فشلها يبقى على هذه الصفحة ويّا «افتح نسخة للتصحيح».
    if (choice === 'copy' && copier && (await copier.copy(copyFrom))) return;
    setBusy(false);
    setConfirm(null);
    after();
  };
  const costRole = data.shortageTotal !== null;
  const columnsFor = (unit: BaseUnit, rows: readonly CountPreviewLine[]): Column<CountPreviewLine>[] => {
    const label = baseUnitLabel(unit);
    const tracked = rows.some((line) => line.tracksExpiry);
    return [
      { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
      { key: 'system', header: t('count.col.system_in', 'المسجّل ({unit})', { unit: label }), kind: 'number', cell: (line) => <Num>{qtyOrDash(line.systemQty, unit)}</Num> },
      { key: 'counted', header: t('count.col.counted_in', 'المعدود ({unit})', { unit: label }), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.counted, decimalsOf(unit))}</Num> },
      { key: 'diff', header: t('count.col.diff_in', 'الفرق ({unit})', { unit: label }), kind: 'number', cell: (line) => <Num>{line.diff === null ? '—' : signedQtyCell(line.diff, decimalsOf(unit))}</Num> },
      ...(tracked
        ? [
            { key: 'x_system', header: t('count.col.x_system_in', 'المنتهي المسجّل ({unit})', { unit: label }), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{qtyOrDash(line.systemExpiredQty, unit)}</Num> },
            { key: 'x_counted', header: t('count.col.x_counted_in', 'المنتهي المعدود ({unit})', { unit: label }), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{qtyOrDash(line.countedExpired, unit)}</Num> },
            { key: 'x_diff', header: t('count.col.x_diff_in', 'فرق المنتهي ({unit})', { unit: label }), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{line.expiredDiff === null ? '—' : signedQtyCell(line.expiredDiff, decimalsOf(unit))}</Num> },
          ]
        : []),
      ...(costRole
        ? [
            { key: 'short_value', header: t('count.col.short_value', 'قيمة النقص (دينار)'), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{line.shortageValue !== null && line.shortageValue > 0n ? <MoneyText amount={line.shortageValue} /> : null}</Num> },
            { key: 'gain_value', header: t('count.col.gain_value', 'قيمة الزيادة (دينار)'), kind: 'number' as const, cell: (line: CountPreviewLine) => <Num>{line.gainValue !== null && line.gainValue > 0n ? <MoneyText amount={line.gainValue} /> : null}</Num> },
          ]
        : []),
      {
        key: 'reason',
        header: t('count.col.reason', 'سبب الفرق'),
        cell: (line) =>
          needsReason(line) && submitted ? (
            <div className="flex flex-col gap-1">
              <input
                className="input"
                aria-label={t('count.reason.for', 'سبب فرق «{item}»', { item: line.itemName })}
                maxLength={500}
                value={reasonOf(line)}
                onChange={(event) => setReasons({ ...reasons, [line.lineId]: event.target.value })}
                data-action="count-reason"
              />
              {line.reasonStale ? <span className="text-xs text-danger-700 dark:text-danger-200">{t('count.reason.stale', 'تغيّر الفرق بعد كتابة السبب؛ راجعه واحفظه لتأكيده.')}</span> : null}
            </div>
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
  };
  const dirty = Object.keys(reasons).length > 0 || Object.keys(costs).length > 0;
  const ready = countPostReady(data, approved, online);
  const withDiff = data.lines.filter(needsReason).length;
  const postSentence =
    data.shortageTotal !== null
      ? t('count.post.consequence', 'يُحفظ جرد «{store}» بتاريخ {day} نهائياً: النقص {short} دينار («فرق جرد») والزيادة {gain} دينار، ويأخذ رقمه. لا يُعدَّل بعدها؛ الخطأ يُلغى بسببه.', {
          store: store.name,
          day: fmtDay(doc.onDate),
          short: fmtMoney(data.shortageTotal),
          gain: fmtMoney(data.gainTotal ?? 0n),
        })
      : t('count.post.consequence_qty', 'يُحفظ جرد «{store}» بتاريخ {day} نهائياً بفروق {n} من السطور، ويأخذ رقمه. لا يُعدَّل بعدها؛ الخطأ يُلغى بسببه.', { store: store.name, day: fmtDay(doc.onDate), n: fmtInt(withDiff) });
  return (
    <div className="flex flex-col gap-4">
      {doc.voidReason ? <Notice tone="warning" title={t('count.voided', 'أُلغي هذا الجرد')}>{doc.voidReason}</Notice> : null}
      {submitted && data.stale ? (
        <Notice tone="warning" title={t('count.stale', 'تغيّر الرصيد بعد العدّ')}>
          {stale ?? t('count.stale.detail', 'حُفظت ورقة غيّرت رصيد يوم الجرد بعد التسليم؛ اضغط «أعد الحساب» لترى الفرق الجديد قبل الحفظ.')}
        </Notice>
      ) : null}
      {staleReasons.length > 0 ? (
        <Notice tone="warning" title={t('count.reason.stale_title', 'أسباب تحتاج تأكيداً')}>
          {t('count.reason.stale_detail', 'تغيّر الفرق في {n} من السطور بعد كتابة أسبابها؛ راجعها ثم «احفظ الأسباب والكلف» لتأكيدها.', { n: fmtInt(staleReasons.length) })}
        </Notice>
      ) : null}
      {byUnit(data.lines).map(({ unit, rows }) => (
        <DataTable
          key={unit}
          caption={t('count.review_in', 'مراجعة الجرد ({unit})', { unit: baseUnitLabel(unit) })}
          columns={columnsFor(unit, rows)}
          rows={rows}
          rowKey={(line) => line.lineId}
          empty={t('count.lines.empty', 'لم يُعدّ شيء بعد.')}
        />
      ))}
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
          <Button variant="secondary" busy={busy} disabled={!dirty && staleReasons.length === 0} onClick={() => void saveReview()} data-action="save-count-review">
            {t('count.review.save', 'احفظ الأسباب والكلف')}
          </Button>
          <Button variant="secondary" busy={busy} disabled={!online || dirty} onClick={() => void refresh()} data-action="refresh-count">
            {t('count.refresh', 'أعد الحساب')}
          </Button>
          <Button busy={busy} disabled={dirty || !online || !data.ready} onClick={() => setConfirm('post')} data-action="post-count">
            {t('count.post', 'راجع واحفظ')}
          </Button>
          <Button variant="ghost" disabled={busy || dirty} onClick={() => setConfirm('return')} data-action="return-count">
            {t('count.return', 'أعِد للعدّ')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirm('close')} data-action="close-count">
            {t('count.close', 'أغلِق دون حفظ')}
          </Button>
        </div>
      ) : data.status === 'approved' && canVoid ? (
        <Button variant="danger" onClick={() => setConfirm('void')} data-action="void-count">
          {t('count.void', 'ألغِ الجرد')}
        </Button>
      ) : data.status === 'void' && doc.docNo && copier ? (
        <CopyDraftAction copier={copier} from={copyFrom} next={copyNextStep} />
      ) : null}
      <ReviewDialog
        open={confirm === 'post'}
        title={t('count.post.title', 'راجع جرد «{store}» قبل الحفظ', { store: store.name })}
        ready={ready && !dirty}
        busy={busy}
        action="confirm-post-count"
        onSave={() => void post()}
        onClose={() => setConfirm(null)}
      >
        <p className="font-medium">{postSentence}</p>
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        {postLines.length > 0 ? (
          <section className="flex flex-col gap-2" aria-labelledby="count-post-lines">
            <h3 id="count-post-lines" className="font-semibold">
              {t('count.post.lines', 'ما سيُحفظ: وافق على كل سطر')}
            </h3>
            <PostPreview
              lines={postLines}
              approved={approved}
              onToggle={(lineId, on) => {
                const next = new Set(approved);
                if (on) next.add(lineId);
                else next.delete(lineId);
                setApproval({ plan: data.plan, keys: next });
              }}
            />
          </section>
        ) : null}
      </ReviewDialog>
      <ConfirmDialog
        open={confirm === 'return'}
        title={t('count.return.title', 'أعِد جرد «{store}» للعدّ', { store: store.name })}
        consequence={
          <div className="flex flex-col gap-3">
            <p>{t('count.return.consequence', 'يرجع الجرد إلى الأمين ليعيد العدّ، ويُمسح الرصيد المسجّل المأخوذ، وتبقى الأسباب والكلف المحفوظة.')}</p>
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
        title={t('count.close.title', 'أغلِق جرد «{store}» دون حفظ', { store: store.name })}
        consequence={t('count.close.consequence', 'يصير الجرد بتاريخ {day} ملغى بلا رقم ولا حركات ولا مصروف، ولا يرجع.', { day: fmtDay(doc.onDate) })}
        confirmLabel={t('count.close', 'أغلِق دون حفظ')}
        busy={busy}
        action="confirm-close-count"
        onConfirm={close}
        onCancel={() => setConfirm(null)}
      />
      {confirm === 'void' && doc.docNo ? (
        <VoidDocDialog
          title={t('count.void.title', 'ألغِ الجرد {no}', { no: doc.docNo })}
          consequence={t('count.void.consequence', 'تُعكس كل حركات الجرد {no} في «{store}» (النقص يرجع لوجباته والزيادة تُسحب)، ويُعكس «فرق الجرد».', { no: doc.docNo, store: store.name })}
          busy={busy}
          failure={failure}
          choose={copier !== null}
          onConfirm={(reason, choice) => void voidIt(reason, choice)}
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
  // ما يلزم يبقى بعد القراءة الجديدة (الشاشة تنفتح من جديد بعدها): المحفوظ المرفوض، وفشل أفعال العدّ، ونتيجة «أعد الحساب».
  const [rejected, setRejected] = useState<readonly RejectedCount[]>([]);
  const [entryFailure, setEntryFailure] = useState<unknown>(null);
  const [refreshed, setRefreshed] = useState<readonly RefreshedLine[] | null>(null);
  const copier = useCopyDraft('count', docId);
  const userId = workspace?.userId ?? '';
  const orgId = workspace?.orgId ?? '';
  const stamp = useMemo(() => ({ userId, orgId }), [userId, orgId]);
  if (doc.error) return <LoadFailed what={t('count.what', 'الجرد')} error={doc.error} onRetry={doc.retry} />;
  if (setup.error) return <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />;
  if (!doc.data || !setup.data || !workspace) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const current = doc.data.doc;
  const store = storesOf(setup.data).find((s) => s.id === current.warehouseId);
  const changed = () => setTick((n) => n + 1);
  const reviewer = can(workspace.role, 'count.approve');
  const counter = can(workspace.role, 'count.enter');
  const copy = canCopyDraft(workspace, 'count', store) ? copier : null;
  const copyNextStep = copyNext(workspace, 'count');
  // فشل أفعال العدّ يخصّ المسوّدة: جرد انسلّم (أو تغيّر) بعده ما يبقى تحته «أعد المحاولة» (المراجعة الثالثة).
  const entryFailed = entryFailure && current.status === 'draft' ? countFailure(entryFailure) : null;
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
      {entryFailed ? (
        <Notice tone="danger" title={entryFailed.title}>
          {entryFailed.detail}
        </Notice>
      ) : null}
      <CopiedNotice draft={current.status === 'draft'} next={copyNextStep} />
      <RejectedNotices rejected={rejected} onDismiss={(key) => setRejected((now) => now.filter((entry) => entry.key !== key))} />
      {!store ? (
        <Notice tone="warning" title={t('count.no_store', 'مخزن هذا الجرد غير متاح.')} />
      ) : current.status === 'draft' && counter ? (
        <CountEntry doc={current} lines={doc.data.lines} store={store} stamp={stamp} onRejected={setRejected} onFailure={setEntryFailure} onChanged={changed} />
      ) : current.status !== 'draft' && reviewer ? (
        <CountReview doc={current} store={store} canVoid={can(workspace.role, 'void')} copier={copy} copyNextStep={copyNextStep} refreshed={refreshed} onRefreshed={setRefreshed} onChanged={changed} />
      ) : (
        <CountReadOnly doc={current} lines={doc.data.lines} store={store} stamp={stamp} copier={copy} copyNextStep={copyNextStep} />
      )}
    </div>
  );
}

function NewCount({ stores, onSaved }: { stores: readonly StoreRef[]; onSaved: (id: string) => void }) {
  const id = useId();
  const [storeId, setStoreId] = useState('');
  const [day, setDay] = useState(fmtDay(localDay()));
  // معرّف الجرد يولد بالجهاز لقيم النموذج ويبقى لها لحد ما ينكتب: الإعادة بعد جواب ضاع 23505 = انكتب، مو جرد ثاني.
  const draftIds = useDraftIds();
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
    const values = JSON.stringify([storeId, date.day]);
    const docId = draftIds.idFor(values);
    setBusy(true);
    setFailure(null);
    counts
      .createCountDraft(docId, storeId, date.day)
      .then(
        (doc) => onSaved(doc.id),
        (error: unknown) => {
          if (inventory.isDuplicate(error)) onSaved(docId);
          else {
            if (error instanceof RejectedError) draftIds.forget(values);
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
      <StoreSelect
        id={`${id}-store`}
        label={t('count.store', 'المخزن')}
        stores={active}
        value={storeId}
        onChange={setStoreId}
      />
      <DayField
        id={`${id}-day`}
        label={t('payment.day', 'التاريخ')}
        value={day}
        onChange={setDay}
        hint={t('use.day', 'اليوم أو قبله حتى 7 أيام.')}
      />
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
      <PageHeader title={t('stock.counts', 'الجرد')} subtitle={t('count.list.subtitle', 'العادّ يعدّ ويسلّم، والمدير يراجع ويحفظ نهائياً.')} />
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
