import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { DayField, postingDay } from '../../components/ui/DayField';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { QtyInput, type QtyUnitOption, type QtyValue } from '../../components/ui/QtyInput';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { decimalText } from '../../domain/decimal';
import { localDay } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { receiptValuation, type ReceiptValuation } from '../../domain/receipt';
import { parseQty } from '../../domain/units';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtCounted, fmtDay, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { parseDayText, parseMomentText } from '../../lib/dayText';
import { onlineStore } from '../../lib/online';
import * as inventory from '../../lib/repo/inventory';
import type { ItemRow } from '../../lib/repo/inventory';
import * as purchasing from '../../lib/repo/purchasing';
import type { BoxPick, PartyPick, ReceiptAmounts, ReceiptBundle, ReceiptCharge, ReceiptDoc, ReceiptLine, ReceiptLineAmount, ReceiptPreview } from '../../lib/repo/purchasing';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { divisionLabel } from '../../lib/roles';
import { AmountField, dinarText, parseDinar } from './purchase-shared';
import { PriceCorrectionPanel, ReceiptReturnsPanel } from './ReceiptPostedPanels';
import { docStatusLabel, ItemPicker, loadItemUnits, PageFooter, qtyColumns, readTime, runWithRef, scopedStores, StoreSelect, storesOf, unitOptions, useDraftIds, VoidDocDialog, type StoreRef } from './stock-shared';

// الاستلام من المورّد (الخطّة WP6، FOUNDATION ٣٢٨–٣٣٤، ٥٥٠–٥٥١، ٧٦٨): الأمين يكتب المسوّدة بالكميات (مخزن بنطاقه يستلم من
// المورّد، والمادّة من أنواعه، والانتهاء ووقت الفقس ورقم دفعة المورّد) وما بالشاشة له ولا خانة مال؛ وأدوار الكلفة يكتبون مبالغ
// السطور كما بالفاتورة والخصم والمدفوع وصندوقه والتحميلات (لناقل أو من صندوق، بالوزن أو بالقيمة، على كل السطور أو اختيارها)، والتقسيم
// حيّ من src/domain/receipt.ts. المعاينة من الخادم (الدفعات بقيمها والقيود والصناديق)، والموافقة لكل سطر، والترحيل بمرجع ثابت ونسخة
// المعاينة. والإلغاء بسببه وبجملة تسمّي ما يرجع، والطيّ بتأكيد يسمّي المسوّدة.

const STORE_RECEIVES: Readonly<Record<string, readonly string[]>> = {
  raw: ['raw', 'additive', 'packaging'],
  feed: ['feed'],
  medicine: ['medicine', 'vaccine'],
  general: ['fuel', 'equipment', 'other', 'packaging'],
  hatching_egg: ['hatching_egg'],
  chick: ['chick'],
};

/** أنواع المواد اللي يستلمها نوع المخزن من المورّد (FOUNDATION ٢٨٤–٢٨٦، مرآة receiving_kinds بـ0007)؛ الحقل وبيض المائدة لا شي. */
export function receivableKinds(storeKind: string): readonly string[] {
  return STORE_RECEIVES[storeKind] ?? [];
}

/** دفتر الاستلام من نوع مخزنه (القاعدة 36): للعرض بس، والخادم يكتبه. */
export function receiptBook(store: Pick<StoreRef, 'kind' | 'divisionKind'>): string {
  if (store.kind === 'hatching_egg') return t('book.hatching_eggs', 'المفقس: بيض التفقيس');
  if (store.kind === 'chick') return t('book.chicks', 'المفقس: الأفراخ');
  return divisionLabel(store.divisionKind);
}

const BAG_FORMS = { one: t('unit.bag.one', 'كيس واحد'), two: t('unit.bag.two', 'كيسان'), few: t('unit.bag.few', 'أكياس'), many: t('unit.bag.many', 'كيساً') };

/** وحدات الشراء: وحدة الأساس والطن، ووحدات التعبئة للشراء؛ والكيس بصيغ العدد («47 كيساً = 2,350 كغم»، «كيس واحد»، «كيسان»، «3 أكياس»). */
export function purchaseUnitOptions(item: Pick<ItemRow, 'baseUnit'>, packs: readonly inventory.ItemUnitRow[]): QtyUnitOption[] {
  const bought = new Set(packs.filter((pack) => pack.forPurchase).map((pack) => pack.id));
  return unitOptions(item, packs)
    .filter((option) => option.id === 'base' || option.id.startsWith('code:') || bought.has(option.id))
    .map((option) => (option.label.startsWith(t('unit.bag', 'كيس')) ? { ...option, forms: BAG_FORMS } : option));
}

const ITEM_FORMS = { one: t('receipt.items.one', 'مادّة واحدة'), two: t('receipt.items.two', 'مادّتان'), few: t('receipt.items.few', 'مواد'), many: t('receipt.items.many', 'مادّة') };

/** «ألغِ الاستلام PU-2026-0042 — ستُعاد 7 مواد من المخزن، ويبقى المدفوع للمورّد دفعةً عليه». */
export function receiptVoidSentence(docNo: string, lines: number): string {
  return t('receipt.void.sentence', 'ألغِ الاستلام {no} — ستُعاد {count} من المخزن، ويبقى المدفوع للمورّد دفعةً عليه.', {
    no: docNo,
    count: fmtCounted(BigInt(lines) * 1000n, t('receipt.items.label', 'مادّة'), ITEM_FORMS),
  });
}

/** التقسيم الحيّ (Q7، Q8، E46): مبالغ السطور والخصم والتحميلات كما بالشاشة، بنفس حساب الخادم. */
export function liveValuation(
  bundle: ReceiptBundle,
  edits: { totals?: ReadonlyMap<string, Fils>; reasons?: ReadonlyMap<string, string | null>; discount?: Fils; paidNow?: Fils; box?: string | null } = {},
): ReceiptValuation {
  const amounts = new Map(bundle.lineAmounts.map((row) => [row.lineId, row]));
  const index = new Map(bundle.lines.map((line, i) => [line.id, i]));
  return receiptValuation(
    bundle.lines.map((line) => {
      const saved = amounts.get(line.id);
      const edited = edits.totals?.get(line.id);
      return { qtyBase: line.qty, baseUnit: line.baseUnit, density: line.density, pieceMass: line.pieceMass, lineTotal: edited ?? saved?.lineTotal ?? null, zeroReason: edits.reasons?.has(line.id) ? (edits.reasons.get(line.id) ?? null) : (saved?.zeroReason ?? null) };
    }),
    {
      discount: edits.discount ?? bundle.amounts?.discount ?? 0n,
      paidNow: edits.paidNow ?? bundle.amounts?.paidNow ?? 0n,
      hasBox: (edits.box === undefined ? (bundle.amounts?.cashAccountId ?? null) : edits.box) !== null,
    },
    bundle.charges.map((charge) => ({ amount: charge.amount, allocateBy: charge.allocateBy, allLines: charge.allLines, lines: charge.lineIds.map((id) => index.get(id) ?? -1).filter((i) => i >= 0) })),
  );
}

/** منتقي المورّد: بحث بالاسم (أوّل 20 ويّا العدد)، و«مورّد جديد» لمن يضيف الجهات بعد تنبيه التوائم (Q1، Q2). */
function SupplierPicker({ id, label, value, onChange }: { id: string; label: string; value: PartyPick | null; onChange: (party: PartyPick | null) => void }) {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const load = useCallback(() => purchasing.searchSuppliers(deferred), [deferred]);
  const found = useLoad(load, deferred);
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const canCreate = workspace ? can(workspace.role, 'party.create') : false;
  const [twins, setTwins] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (value) {
    return (
      <Field id={id} label={label}>
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2">
          <span className="font-medium">{value.name}</span>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)} data-action="change-party">
            {t('party.pick.change', 'غيّر')}
          </Button>
        </div>
      </Field>
    );
  }
  const create = () => {
    const name = search.trim();
    if (!name) return;
    setBusy(true);
    setFailure(null);
    (twins === null ? purchasing.supplierTwins(name) : Promise.resolve([]))
      .then((seen) => {
        if (seen.length > 0) {
          setTwins(seen);
          return undefined;
        }
        return purchasing.createSupplier(name).then(onChange);
      })
      .catch(setFailure)
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <div className="flex flex-col gap-2">
      <Field id={id} label={label}>
        <input id={id} type="search" className="input" autoComplete="off" value={search} onChange={(event) => { setSearch(event.target.value); setTwins(null); }} placeholder={t('party.pick.search', 'ابحث بالاسم')} />
      </Field>
      {found.error ? (
        <LoadFailed what={t('party.list', 'قائمة الجهات')} error={found.error} onRetry={found.retry} />
      ) : (
        <ul className="flex max-h-48 flex-col overflow-y-auto rounded-2xl border border-line">
          {(found.data?.parties ?? []).map((party) => (
            <li key={party.id}>
              <button type="button" className="w-full px-4 py-2 text-start hover:bg-surface-2" onClick={() => onChange(party)} data-action="pick-party">
                {party.name}
              </button>
            </li>
          ))}
          {found.data && found.data.parties.length === 0 ? <li className="px-4 py-2 text-sm text-ink-muted">{t('party.pick.empty', 'لا جهة بهذا الاسم.')}</li> : null}
        </ul>
      )}
      {twins && twins.length > 0 ? <Notice tone="warning" title={t('receipt.supplier.twins', 'يشبه اسماً موجوداً: {names}. اختره من القائمة، أو اضغط «أضف المورّد» مرّة أخرى إن كان مورّداً آخر.', { names: twins.join(t('list.separator', '، ')) })} /> : null}
      {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      {canCreate && search.trim() ? (
        <Button size="sm" variant="secondary" busy={busy} onClick={create} data-action="create-supplier">
          {t('receipt.supplier.create', 'أضف المورّد «{name}»', { name: search.trim() })}
        </Button>
      ) : null}
    </div>
  );
}

function BoxPicker({ id, label, boxes, value, onChange }: { id: string; label: string; boxes: readonly BoxPick[] | null; value: string; onChange: (id: string) => void }) {
  return (
    <Field id={id} label={label} hint={boxes !== null && boxes.length === 0 ? t('cash.pick.empty', 'لا صندوق فعّالاً بعد؛ أضفه من صفحة الصناديق.') : undefined}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} data-action="pick-box">
        <option value="">{t('cash.pick.none', 'اختر الصندوق')}</option>
        {(boxes ?? []).map((box) => (
          <option key={box.id} value={box.id}>
            {box.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function enteredUnit(line: ReceiptLine): string {
  if (line.unitCode === 't') return t('unit.t', 'طن');
  return line.itemUnitId ? line.unitLabel : fmtQty(0n, line.baseUnit).main.replace(/^0\s*/u, '');
}

/** جدول السطور: الكميات للكل، والمبلغ وقيمة الدفعة لأدوار الكلفة بس (values = null للأمين). */
export function ReceiptLinesTable({ lines, values, totals, onDelete }: { lines: readonly ReceiptLine[]; values: readonly Fils[] | null; totals: ReadonlyMap<string, Fils> | null; onDelete: ((line: ReceiptLine) => void) | null }) {
  const columns: Column<ReceiptLine>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'entered', header: t('transfer.col.entered', 'كما كُتبت'), cell: (line) => fmtCounted(line.qtyInUnit, enteredUnit(line)) },
    ...qtyColumns(lines, (line) => line.qty, (unit) => t('stock.col.qty_in', 'الكمية ({unit})', { unit })),
    { key: 'expiry', header: t('receipt.col.expiry', 'الانتهاء'), cell: (line) => (line.expiryOn ? fmtDay(line.expiryOn) : '—') },
    { key: 'lot', header: t('receipt.col.lot', 'دفعة المورّد'), cell: (line) => (line.supplierLotNo ? <bdi dir="ltr">{line.supplierLotNo}</bdi> : '—') },
  ];
  if (totals && values) {
    columns.push(
      { key: 'total', header: t('receipt.col.total', 'مبلغ السطر'), kind: 'number', cell: (line) => { const total = totals.get(line.id); return total === undefined ? '—' : <MoneyText amount={total} decimals={0} />; } },
      { key: 'value', header: t('receipt.col.value', 'قيمة الدفعة'), kind: 'number', cell: (line) => { const value = values[lines.indexOf(line)]; return value === undefined ? '—' : <MoneyText amount={value} />; } },
    );
  }
  if (onDelete) {
    columns.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <IconButton label={t('transfer.line.delete', 'احذف السطر')} onClick={() => onDelete(line)} data-action="delete-line">
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      ),
    });
  }
  return <DataTable caption={t('receipt.lines', 'سطور الاستلام')} columns={columns} rows={lines} rowKey={(line) => line.id} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />;
}

function AddReceiptLine({ doc, store, onAdded }: { doc: ReceiptDoc; store: StoreRef; onAdded: () => void }) {
  const id = useId();
  const [item, setItem] = useState<ItemRow | null>(null);
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState<unknown>(null);
  const [lineId, setLineId] = useState(() => crypto.randomUUID());
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  const [expiry, setExpiry] = useState('');
  const [bornAt, setBornAt] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const kinds = receivableKinds(store.kind);
  const receivable = useCallback((row: ItemRow) => kinds.includes(row.kind), [kinds]);
  const pickItem = (next: ItemRow | null) => {
    setLineId(crypto.randomUUID());
    setItem(next);
    setPacks(null);
    setLoadFailed(null);
    setQty({ text: '', unitId: 'base' });
    setExpiry('');
    // وقت فقس الأفراخ المشتراة يبدأ بيوم الاستلام (E21).
    setBornAt(next?.kind === 'chick' ? `${fmtDay(doc.onDate)} 00:00` : '');
  };
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    loadItemUnits(item.id, true).then(
      (units) => {
        if (!cancelled) setPacks(units.filter((row) => row.itemId === item.id));
      },
      (error: unknown) => {
        if (!cancelled) setLoadFailed(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [item]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = qty.text.trim() ? parseQty(qty.text) : null;
    if (!item || amount === null || amount <= 0n) {
      setFailure(new RejectedError('fields', t('use.line.fields', 'اختر المادّة واكتب كمية أكبر من صفر.')));
      return;
    }
    const born = item.kind === 'chick' ? parseMomentText(bornAt) : null;
    if (item.kind === 'chick' && !born) {
      setFailure(new RejectedError('fields', t('opening.born.invalid', 'اكتب وقت الفقس يوم/شهر/سنة ثم الساعة والدقيقة، مثل 28/10/2026 06:00.')));
      return;
    }
    const expiryOn = item.tracksExpiry ? parseDayText(expiry) : null;
    if (item.tracksExpiry && !expiryOn) {
      setFailure(new RejectedError('expiry_required', t('receipt.line.expiry_required', 'اكتب تاريخ انتهاء «{item}».', { item: item.name })));
      return;
    }
    setBusy(true);
    setFailure(null);
    const unit = qty.unitId === 'base' ? { item_unit_id: null, unit_code: null } : qty.unitId.startsWith('code:') ? { item_unit_id: null, unit_code: qty.unitId.slice('code:'.length) } : { item_unit_id: qty.unitId, unit_code: null };
    const fields: purchasing.ReceiptLineFields = {
      item_id: item.id,
      ...unit,
      qty_in_unit: decimalText(amount, 3),
      expiry_on: expiryOn,
      born_at: born?.iso ?? null,
      supplier_lot_no: lotNo.trim() || null,
    };
    const added = () => {
      pickItem(null);
      setLotNo('');
      onAdded();
    };
    purchasing
      .addReceiptLine(doc.id, lineId, fields)
      .then(added, (error: unknown) => {
        if (inventory.isDuplicate(error)) purchasing.updateReceiptLine(lineId, fields).then(added, setFailure);
        else {
          if (error instanceof RejectedError) setLineId(crypto.randomUUID());
          setFailure(error);
        }
      })
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      <ItemPicker id={`${id}-item`} label={t('stock.col.item', 'المادّة')} value={item} onChange={pickItem} filter={receivable} />
      {loadFailed ? <LoadFailed what={t('use.item.what', 'وحدات المادّة ودفعاتها')} error={loadFailed} onRetry={() => setItem(item ? { ...item } : null)} /> : null}
      {item && packs ? <QtyInput id={`${id}-qty`} label={t('stock.col.qty', 'الكمية')} base={item.baseUnit} units={purchaseUnitOptions(item, packs)} value={qty} onChange={setQty} /> : null}
      {item?.tracksExpiry ? <DayField id={`${id}-expiry`} label={t('receipt.line.expiry', 'تاريخ الانتهاء')} value={expiry} onChange={setExpiry} hint={t('receipt.line.expiry_hint', 'كما على العبوة؛ المنتهي يوم الاستلام يرحّله المدير فقط.')} /> : null}
      {item?.kind === 'chick' ? (
        <Field
          id={`${id}-born`}
          label={t('opening.born', 'وقت الفقس (يوم/شهر/سنة ساعة:دقيقة)')}
          hint={(() => {
            const read = parseMomentText(bornAt);
            return read ? t('opening.born.read', 'يُقرأ: {day} الساعة {time}', { day: fmtDay(read.day), time: readTime(read.iso) }) : t('opening.born.hint', 'مثل 28/10/2026 06:00');
          })()}
        >
          <input id={`${id}-born`} className="input" dir="ltr" value={bornAt} onChange={(event) => setBornAt(event.target.value)} data-action="born-at" />
        </Field>
      ) : null}
      {item ? (
        <Field id={`${id}-lot`} label={t('receipt.line.lot', 'رقم دفعة المورّد (اختياري)')}>
          <input id={`${id}-lot`} className="input" value={lotNo} maxLength={60} onChange={(event) => setLotNo(event.target.value)} dir="ltr" />
        </Field>
      ) : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} disabled={!item} icon={<Plus aria-hidden="true" className="size-4" />} data-action="add-receipt-line">
        {t('use.line.add', 'أضف السطر')}
      </Button>
    </form>
  );
}

/** تعديل مبلغ سطر كما بالشاشة، ويّا صفّه المحفوظ يوم بدأ تعديله (شرط الكتابة: ما ينكتب فوق مبلغ غيّره غيرك، FOUNDATION ٨١٧). */
export interface LineEdit {
  text: string;
  reason: string;
  base: ReceiptLineAmount | null;
  /** بعد حفظ ناجح: الأساس قبل الكتابة، مقبول لحد ما توصل القراءة الجديدة (مراجعة WP7: الحقل كان يرجع للقديم وكتابة وقتها تعارض كاذب). */
  prior?: ReceiptLineAmount | null;
}

/**
 * تعديلات المبالغ اللي ما انحفظت: بمحرّر الاستلام (مو باللوحة) فتبقى لمّا يقرا المستند من جديد، وكل حقل بقيمته المحفوظة يوم بدأ
 * تعديله. الصندوق نصّ ('' بلا صندوق).
 */
export interface AmountEdits {
  lines: Readonly<Record<string, LineEdit>>;
  discount: { text: string; base: Fils; prior?: Fils } | null;
  paid: { text: string; base: Fils; prior?: Fils } | null;
  box: { value: string; base: string; prior?: string } | null;
}

export const NO_AMOUNT_EDITS: AmountEdits = { lines: {}, discount: null, paid: null, box: null };

/** الخصم والمدفوع: الفارغ صفر. */
const amountOr0 = (text: string): Fils | null => (text.trim() === '' ? 0n : parseDinar(text));
const sameRow = (a: ReceiptLineAmount | null, b: ReceiptLineAmount | null): boolean => (a === null || b === null ? a === b : a.lineTotal === b.lineTotal && a.zeroReason === b.zeroReason);

/** المطلوب كتابته للسطر: المبلغ، والسبب للصفر بس (Q9)؛ null لنصّ مو مبلغ. */
function lineTarget(edit: LineEdit): { total: Fils; reason: string | null } | null {
  const total = edit.text.trim() === '' ? null : parseDinar(edit.text);
  return total === null ? null : { total, reason: total === 0n ? edit.reason.trim() || null : null };
}

const isTarget = (target: { total: Fils; reason: string | null } | null, row: ReceiptLineAmount | null): boolean =>
  target !== null && row !== null && row.lineTotal === target.total && row.zeroReason === target.reason;

function settleField<E extends { base: V; prior?: V }, V extends bigint | string>(edit: E | null, target: V | null, saved: V, name: string, conflicts: string[]): E | null {
  if (edit === null || target === saved) return null;
  if (edit.base === saved || (edit.prior !== undefined && edit.prior === saved)) return edit;
  if (target !== edit.base) conflicts.push(name);
  return null;
}

/**
 * التعديلات على آخر قراءة: اللي انحفظ ينشال، واللي محفوظه ما تغيّر من بدأ تعديله يبقى، واللي غيّره غيرك بعدها ينشال وينذكر اسمه
 * (تنعرض قيمته المحفوظة بدل ما تنكتب فوقها).
 */
export function settleAmountEdits(edits: AmountEdits, bundle: ReceiptBundle): { edits: AmountEdits; conflicts: string[] } {
  const saved = new Map(bundle.lineAmounts.map((row) => [row.lineId, row]));
  const conflicts: string[] = [];
  const lines: Record<string, LineEdit> = {};
  for (const line of bundle.lines) {
    const edit = edits.lines[line.id];
    if (!edit) continue;
    const row = saved.get(line.id) ?? null;
    const target = lineTarget(edit);
    if (isTarget(target, row)) continue;
    if (sameRow(edit.base, row) || (edit.prior !== undefined && sameRow(edit.prior, row))) lines[line.id] = edit;
    else if (!isTarget(target, edit.base)) conflicts.push(line.itemName);
  }
  const amounts = bundle.amounts;
  return {
    edits: {
      lines,
      discount: settleField(edits.discount, edits.discount ? amountOr0(edits.discount.text) : null, amounts?.discount ?? 0n, t('receipt.amounts.discount', 'خصم الفاتورة'), conflicts),
      paid: settleField(edits.paid, edits.paid ? amountOr0(edits.paid.text) : null, amounts?.paidNow ?? 0n, t('receipt.amounts.paid', 'المدفوع عند الاستلام'), conflicts),
      box: settleField(edits.box, edits.box?.value ?? null, amounts?.cashAccountId ?? '', t('receipt.amounts.box', 'دُفع من صندوق'), conflicts),
    },
    conflicts,
  };
}

export interface AmountPlan {
  /** أوّل نصّ مو مبلغ، أو صفر بلا سببه: ما ينحفظ شي لحد ما يتصلّح. */
  problem: string | null;
  lines: { lineId: string; before: ReceiptLineAmount | null; total: Fils; reason: string | null }[];
  amounts: { before: ReceiptAmounts | null; values: purchasing.AmountValues } | null;
  live: ReceiptValuation;
}

/** ما ينكتب عند الحفظ (كل كتابة مشروطة بقيمتها يوم بدأ تعديلها)، والتقسيم الحيّ بقيم الشاشة. */
export function amountPlan(bundle: ReceiptBundle, edits: AmountEdits): AmountPlan {
  let problem: string | null = null;
  const lines: AmountPlan['lines'] = [];
  const totals = new Map<string, Fils>();
  const reasons = new Map<string, string | null>();
  for (const line of bundle.lines) {
    const edit = edits.lines[line.id];
    if (!edit) continue;
    const target = lineTarget(edit);
    if (target === null) {
      if (edit.text.trim() !== '' || edit.base !== null) problem ??= t('receipt.amounts.line_invalid', 'اكتب مبلغ «{item}» بالدينار الصحيح، أو 0 مع سببه.', { item: line.itemName });
      continue;
    }
    if (target.total === 0n && target.reason === null) problem ??= t('receipt.amounts.zero_reason', 'اكتب سبب المبلغ الصفر لـ«{item}».', { item: line.itemName });
    totals.set(line.id, target.total);
    reasons.set(line.id, target.reason);
    if (!isTarget(target, edit.base)) lines.push({ lineId: line.id, before: edit.base, total: target.total, reason: target.reason });
  }
  const saved = bundle.amounts;
  const discount = edits.discount ? amountOr0(edits.discount.text) : (saved?.discount ?? 0n);
  const paidNow = edits.paid ? amountOr0(edits.paid.text) : (saved?.paidNow ?? 0n);
  if (discount === null) problem ??= t('receipt.amounts.discount_invalid', 'اكتب الخصم بالدينار الصحيح.');
  if (paidNow === null) problem ??= t('receipt.amounts.paid_invalid', 'اكتب المدفوع بالدينار الصحيح.');
  // بلا مدفوع بلا صندوق.
  const box = paidNow === 0n ? null : (edits.box ? edits.box.value : (saved?.cashAccountId ?? '')) || null;
  let amounts: AmountPlan['amounts'] = null;
  if (discount !== null && paidNow !== null) {
    const before = saved && { ...saved, discount: edits.discount?.base ?? saved.discount, paidNow: edits.paid?.base ?? saved.paidNow, cashAccountId: edits.box ? edits.box.base || null : saved.cashAccountId };
    const from = before ?? { discount: 0n, paidNow: 0n, cashAccountId: null };
    if (from.discount !== discount || from.paidNow !== paidNow || from.cashAccountId !== box) amounts = { before, values: { discount, paidNow, cashAccountId: box } };
  }
  const live = liveValuation(bundle, { totals, reasons, discount: discount ?? saved?.discount ?? 0n, paidNow: paidNow ?? saved?.paidNow ?? 0n, box });
  return { problem, lines, amounts, live };
}

/** بعد الحفظ: اللي انكتب يصير أساس تعديله، فكتابة بعده (أثناء القراءة الجديدة) ما تنحسب تعارضاً. */
export function rebaseEdits(edits: AmountEdits, lines: readonly AmountPlan['lines'][number][], amounts: purchasing.AmountValues | null): AmountEdits {
  const next: Record<string, LineEdit> = { ...edits.lines };
  for (const line of lines) {
    const edit = next[line.lineId];
    if (edit) next[line.lineId] = { ...edit, base: { id: edit.base?.id ?? '', lineId: line.lineId, lineTotal: line.total, zeroReason: line.reason }, prior: edit.base };
  }
  return {
    lines: next,
    discount: edits.discount && amounts ? { ...edits.discount, base: amounts.discount, prior: edits.discount.base } : edits.discount,
    paid: edits.paid && amounts ? { ...edits.paid, base: amounts.paidNow, prior: edits.paid.base } : edits.paid,
    box: edits.box && amounts ? { ...edits.box, base: amounts.cashAccountId ?? '', prior: edits.box.base } : edits.box,
  };
}

/** مبالغ السطور والخصم والمدفوع (أدوار الكلفة): التعديلات بالمحرّر، والحفظ مشروط بقيمها يوم بدأ تعديلها، والتقسيم الحيّ تحته. */
function AmountsPanel({
  bundle,
  edits,
  conflicts,
  plan,
  boxes,
  busy,
  failure,
  onChange,
  onSave,
}: {
  bundle: ReceiptBundle;
  edits: AmountEdits;
  conflicts: readonly string[];
  plan: AmountPlan;
  boxes: readonly BoxPick[] | null;
  busy: boolean;
  failure: unknown;
  onChange: (next: AmountEdits) => void;
  onSave: () => void;
}) {
  const id = useId();
  const saved = new Map(bundle.lineAmounts.map((row) => [row.lineId, row]));
  const lineEdit = (line: ReceiptLine): LineEdit => {
    const row = saved.get(line.id) ?? null;
    return edits.lines[line.id] ?? { text: row ? dinarText(row.lineTotal) : '', reason: row?.zeroReason ?? '', base: row };
  };
  const editLine = (line: ReceiptLine, patch: Partial<Pick<LineEdit, 'text' | 'reason'>>) => onChange({ ...edits, lines: { ...edits.lines, [line.id]: { ...lineEdit(line), ...patch } } });
  const editAmount = (name: 'discount' | 'paid', text: string) => {
    const before = name === 'discount' ? (bundle.amounts?.discount ?? 0n) : (bundle.amounts?.paidNow ?? 0n);
    onChange({ ...edits, [name]: { ...(edits[name] ?? { base: before }), text } });
  };
  const discount = edits.discount?.text ?? (bundle.amounts ? dinarText(bundle.amounts.discount) : '');
  const paid = edits.paid?.text ?? (bundle.amounts ? dinarText(bundle.amounts.paidNow) : '');
  const box = edits.box?.value ?? bundle.amounts?.cashAccountId ?? '';
  const dirty = plan.problem !== null || plan.lines.length > 0 || plan.amounts !== null;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">{t('receipt.amounts', 'مبالغ الفاتورة')}</h2>
      {conflicts.length > 0 ? (
        <Notice tone="warning" title={t('receipt.amounts.conflict', 'تغيّر {names} من نافذة أو جهاز آخر بعد أن بدأت تعديله؛ تُعرض القيمة المحفوظة الآن.', { names: conflicts.join(t('list.separator', '، ')) })} />
      ) : null}
      {bundle.lines.map((line, i) => {
        const edit = lineEdit(line);
        const target = lineTarget(edit);
        return (
          <div key={line.id} className="flex flex-wrap gap-3">
            <AmountField id={`${id}-total-${line.id}`} label={t('receipt.amounts.line', 'مبلغ «{item}» كما في الفاتورة', { item: line.itemName })} value={edit.text} onChange={(text) => editLine(line, { text })} />
            {target?.total === 0n ? (
              <Field id={`${id}-reason-${line.id}`} label={t('receipt.amounts.zero', 'سبب المبلغ الصفر')}>
                <input id={`${id}-reason-${line.id}`} className="input" value={edit.reason} onChange={(event) => editLine(line, { reason: event.target.value })} data-action="zero-reason" />
              </Field>
            ) : null}
            {target !== null ? (
              <p className="text-sm text-ink-muted">
                {t('receipt.amounts.value', 'قيمة الدفعة')}: <MoneyText amount={plan.live.values[i] ?? 0n} />
              </p>
            ) : null}
          </div>
        );
      })}
      <AmountField id={`${id}-discount`} label={t('receipt.amounts.discount', 'خصم الفاتورة')} value={discount} onChange={(text) => editAmount('discount', text)} hint={t('receipt.amounts.discount_hint', 'يتوزّع على السطور بنسبة مبالغها، بالفلس.')} />
      <AmountField id={`${id}-paid`} label={t('receipt.amounts.paid', 'المدفوع عند الاستلام')} value={paid} onChange={(text) => editAmount('paid', text)} />
      {(amountOr0(paid) ?? 0n) > 0n ? (
        <BoxPicker id={`${id}-box`} label={t('receipt.amounts.box', 'دُفع من صندوق')} boxes={boxes} value={box} onChange={(value) => onChange({ ...edits, box: { ...(edits.box ?? { base: bundle.amounts?.cashAccountId ?? '' }), value } })} />
      ) : null}
      <p className="text-sm">
        {t('receipt.amounts.net', 'صافي المورّد')}: <MoneyText amount={plan.live.net} decimals={0} />
      </p>
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} disabled={!dirty} onClick={onSave} data-action="save-amounts">
          {t('receipt.amounts.save', 'احفظ المبالغ')}
        </Button>
        {dirty ? (
          <Button variant="ghost" disabled={busy} onClick={() => onChange(NO_AMOUNT_EDITS)} data-action="undo-amounts">
            {t('receipt.amounts.undo', 'تراجع عن التعديلات')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** التحميلات (E17، Q8): لناقل أو من صندوق، بالوزن أو بالقيمة، على كل السطور أو اختيارها (set_charge_lines). */
function ChargesPanel({ bundle, boxes, onSaved, onStale }: { bundle: ReceiptBundle; boxes: readonly BoxPick[] | null; onSaved: () => void; onStale: (error: unknown) => boolean }) {
  const id = useId();
  const [label, setLabel] = useState(t('receipt.charge.default', 'نقل'));
  const [amount, setAmount] = useState('');
  const [by, setBy] = useState<'mass' | 'value'>('mass');
  const [to, setTo] = useState<'party' | 'box'>('party');
  const [payee, setPayee] = useState<PartyPick | null>(null);
  const [box, setBox] = useState('');
  const [chargeId, setChargeId] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    work()
      .then(onSaved, (error: unknown) => {
        if (!onStale(error)) setFailure(error);
      })
      .finally(() => setBusy(false));
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const value = parseDinar(amount);
    if (value === null || value <= 0n || !label.trim() || (to === 'party' ? !payee : !box)) {
      setFailure(new RejectedError('fields', t('receipt.charge.fields', 'اكتب اسم التحميل ومبلغه، واختر الناقل أو الصندوق.')));
      return;
    }
    const fields = { label, amount: value, allocateBy: by, payeePartyId: to === 'party' ? (payee?.id ?? null) : null, cashAccountId: to === 'box' ? box : null };
    run(() =>
      purchasing
        .addCharge(bundle.doc.id, chargeId, fields)
        .catch((error: unknown) => {
          // محاولة سابقة وصلت وضاع جوابها (23505 بمعرّف الجهاز): آخر قيم النموذج تنكتب فوقها.
          if (inventory.isDuplicate(error)) return purchasing.updateCharge(chargeId, fields);
          throw error;
        })
        .then(() => {
          setChargeId(crypto.randomUUID());
          setAmount('');
        }),
    );
  };
  const toggleLine = (charge: ReceiptCharge, lineId: string, on: boolean) => {
    const base = charge.allLines ? [] : charge.lineIds;
    const next = on ? [...base, lineId] : base.filter((x) => x !== lineId);
    // الفارغ عند الخادم = كل السطور: آخر سطر مختار ما يُشال بصمت، والتوزيع على الكل بزرّه الصريح.
    if (next.length === 0) return;
    run(() => purchasing.setChargeLines(charge.id, next, bundle.doc.version));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">{t('receipt.charges', 'تحميلات الاستلام')}</h2>
      {bundle.charges.map((charge) => (
        <div key={charge.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">
              {charge.label} — <MoneyText amount={charge.amount} decimals={0} /> — {charge.allocateBy === 'mass' ? t('receipt.charge.mass', 'بالوزن') : t('receipt.charge.value', 'بالقيمة')}
            </p>
            <IconButton label={t('receipt.charge.delete', 'احذف التحميل')} onClick={() => run(() => purchasing.deleteCharge(charge.id, bundle.doc.version))} data-action="delete-charge">
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="text-ink-muted">{charge.allLines ? t('receipt.charge.all', 'على كل السطور؛ اختر سطوراً لتقصره عليها') : t('receipt.charge.some', 'على السطور المختارة')}</legend>
            {bundle.lines.map((line) => (
              <label key={line.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 accent-brand-600"
                  checked={!charge.allLines && charge.lineIds.includes(line.id)}
                  disabled={busy || (!charge.allLines && charge.lineIds.length === 1 && charge.lineIds.includes(line.id))}
                  onChange={(event) => toggleLine(charge, line.id, event.target.checked)} data-action="pick-charge-line" />
                {line.itemName}
              </label>
            ))}
          </fieldset>
          {charge.allLines ? null : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => purchasing.setChargeLines(charge.id, [], bundle.doc.version))} data-action="charge-all-lines">
              {t('receipt.charge.all_lines', 'وزّعه على كل السطور')}
            </Button>
          )}
        </div>
      ))}
      <form className="flex flex-col gap-3" onSubmit={add} noValidate>
        <Field id={`${id}-label`} label={t('receipt.charge.label', 'اسم التحميل')}>
          <input id={`${id}-label`} className="input" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <AmountField id={`${id}-amount`} label={t('receipt.charge.amount', 'مبلغ التحميل')} value={amount} onChange={setAmount} />
        <Segmented label={t('receipt.charge.by', 'التوزيع')} options={[{ value: 'mass', label: t('receipt.charge.mass', 'بالوزن') }, { value: 'value', label: t('receipt.charge.value', 'بالقيمة') }]} value={by} onChange={setBy} />
        <Segmented label={t('receipt.charge.to', 'يُدفع')} options={[{ value: 'party', label: t('receipt.charge.party', 'لناقل (بدفتره)') }, { value: 'box', label: t('receipt.charge.box', 'من صندوق الآن') }]} value={to} onChange={setTo} />
        {to === 'party' ? <SupplierPicker id={`${id}-payee`} label={t('receipt.charge.payee', 'الناقل')} value={payee} onChange={setPayee} /> : <BoxPicker id={`${id}-box`} label={t('receipt.amounts.box', 'دُفع من صندوق')} boxes={boxes} value={box} onChange={setBox} />}
        {failed ? (
          <Notice tone="danger" title={failed.title}>
            {failed.detail}
          </Notice>
        ) : null}
        <Button type="submit" variant="secondary" busy={busy} icon={<Plus aria-hidden="true" className="size-4" />} data-action="add-charge">
          {t('receipt.charge.add', 'أضف التحميل')}
        </Button>
      </form>
    </section>
  );
}

/** المعاينة: المشاكل والتحذيرات، والدفعات اللي راح تنخلق (بقيمها لأدوار الكلفة)، وصافي المورّد والتحميلات والمدفوع؛ والموافقة لكل سطر. */
export function ReceiptPreviewPanel({ preview, approved, onToggle }: { preview: ReceiptPreview; approved: ReadonlySet<string>; onToggle: (lineId: string, on: boolean) => void }) {
  const values = new Map((preview.money?.lines ?? []).map((line) => [line.lineId, line.value]));
  const columns: Column<ReceiptPreview['lines'][number]>[] = [
    {
      key: 'ok',
      header: t('preview.approve', 'موافق'),
      cell: (line) => <input type="checkbox" className="size-5 accent-brand-600" aria-label={t('preview.approve.line', 'موافق على «{item}»', { item: line.itemName })} checked={approved.has(line.lineId)} onChange={(event) => onToggle(line.lineId, event.target.checked)} data-action="approve-line" />,
    },
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    ...qtyColumns(preview.lines, (line) => line.qty, (unit) => t('stock.col.qty_in', 'الكمية ({unit})', { unit })),
    ...(preview.money ? [{ key: 'value', header: t('receipt.col.value', 'قيمة الدفعة'), kind: 'number' as const, cell: (line: ReceiptPreview['lines'][number]) => { const value = values.get(line.lineId); return value === undefined ? '—' : <MoneyText amount={value} />; } }] : []),
  ];
  return (
    <>
      {preview.problems.map((problem, i) => (
        <Notice key={`problem-${i}`} tone="danger" title={problem.hint} />
      ))}
      {preview.lines.flatMap((line) => [line.problem, line.warning].filter((x) => x !== null).map((x, k) => <Notice key={`${line.lineId}:${k}`} tone={x === line.problem ? 'danger' : 'warning'} title={x?.hint ?? ''} />))}
      <DataTable caption={t('receipt.preview.lots', 'الدفعات التي ستدخل المخزن')} columns={columns} rows={preview.lines} rowKey={(line) => line.lineId} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />
      {preview.money ? (
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            {t('receipt.preview.supplier', 'قيد المورّد (له)')}: <MoneyText amount={preview.money.net} decimals={0} />
          </li>
          {preview.money.charges.map((charge) => (
            <li key={charge.chargeId}>
              {charge.payeePartyId ? t('receipt.preview.carrier', 'قيد «{label}» على ناقله (له)', { label: charge.label }) : t('receipt.preview.box_charge', '«{label}» يُدفع من الصندوق', { label: charge.label })}: <MoneyText amount={charge.amount} decimals={0} />
            </li>
          ))}
          {preview.money.paidNow > 0n ? (
            <li>
              {t('receipt.preview.paid', 'المدفوع للمورّد من الصندوق')}: <MoneyText amount={preview.money.paidNow} decimals={0} />
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

const isStale = (error: unknown): boolean => error instanceof RejectedError && error.code === 'stale_draft';

function ReceiptEditor({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const canDraft = workspace ? can(workspace.role, 'receipt.draft') : false;
  const canPrice = workspace ? can(workspace.role, 'receipt.amounts') : false;
  const canVoid = workspace ? can(workspace.role, 'void') : false;
  const canRevalue = workspace ? can(workspace.role, 'receipt.revalue') : false;
  // آخر قراءة تبقى معروضة وهي تقرا من جديد (مو useLoad، اللي يرجّع null وهو يقرا فتنطوي اللوحات، درس WP5)؛ والقراءة لنفس المستند والدور.
  const loadKey = `${docId}#${canPrice}`;
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; bundle: ReceiptBundle | null; error: unknown }>({ key: '', bundle: null, error: null });
  useEffect(() => {
    let cancelled = false;
    purchasing.loadReceipt(docId, canPrice).then(
      (next) => {
        if (!cancelled) setLoaded({ key: loadKey, bundle: next, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setLoaded((prev) => ({ key: loadKey, bundle: prev.key === loadKey ? prev.bundle : null, error }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [docId, canPrice, loadKey, tick]);
  const setup = useLoad(inventory.loadOrgSetup);
  const loadBoxes = useCallback(() => (canPrice ? purchasing.listBoxes() : Promise.resolve(null)), [canPrice]);
  const boxes = useLoad(loadBoxes, `boxes#${canPrice}`);
  const [edits, setEdits] = useState<AmountEdits>(NO_AMOUNT_EDITS);
  const [saving, setSaving] = useState(false);
  const [amountFailure, setAmountFailure] = useState<unknown>(null);
  const [previewState, setPreviewState] = useState<{ key: string; preview: ReceiptPreview } | null>(null);
  const preview = previewState?.key === loadKey ? previewState.preview : null;
  const setPreview = (next: ReceiptPreview | null) => setPreviewState(next ? { key: loadKey, preview: next } : null);
  const [approved, setApproved] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<'void' | 'discard' | null>(null);
  const [lineToDelete, setLineToDelete] = useState<ReceiptLine | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const reload = () => setTick((n) => n + 1);
  const refresh = () => {
    setPreview(null);
    setApproved(new Set());
    reload();
  };
  /** تغيّر المستند من نافذة أو جهاز آخر (stale_draft): قراءة جديدة وتنبيه يبقى، بدل زرّ يعيد نفس النسخة للأبد. */
  const handledStale = (error: unknown): boolean => {
    if (!isStale(error)) return false;
    toast({ tone: 'warning', title: t('receipt.stale', 'تغيّر الاستلام من نافذة أو جهاز آخر'), detail: t('receipt.stale.detail', 'هذه نسخته الآن؛ راجعها وأعد المحاولة.') });
    refresh();
    return true;
  };
  const bundle = loaded.key === loadKey ? loaded.bundle : null;
  const loadError = loaded.key === loadKey ? loaded.error : null;
  if (!bundle && loadError) return <LoadFailed what={t('receipt.what', 'الاستلام')} error={loadError} onRetry={reload} />;
  if (setup.error) return <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />;
  if (!bundle || !setup.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const current = bundle.doc;
  const store = storesOf(setup.data).find((s) => s.id === current.warehouseId);
  const draft = current.status === 'draft';
  const live = canPrice ? liveValuation(bundle) : null;
  const totals = canPrice ? new Map(bundle.lineAmounts.map((row) => [row.lineId, row.lineTotal])) : null;
  const settled = canPrice ? settleAmountEdits(edits, bundle) : null;
  const plan = settled ? amountPlan(bundle, settled.edits) : null;
  const dirty = plan !== null && (plan.problem !== null || plan.lines.length > 0 || plan.amounts !== null);
  const failed = failure ? describeError(failure) : null;
  const saveAmounts = async () => {
    if (!settled || !plan) return;
    if (plan.problem) {
      setAmountFailure(new RejectedError('fields', plan.problem));
      return;
    }
    setEdits(settled.edits);
    setSaving(true);
    setAmountFailure(null);
    const done: AmountPlan['lines'] = [];
    let amountsDone = false;
    try {
      for (const line of plan.lines) {
        await purchasing.setLineTotal(line.lineId, line.before, line.total, line.reason);
        done.push(line);
      }
      if (plan.amounts) {
        await purchasing.setReceiptAmounts(current.id, plan.amounts.before, plan.amounts.values);
        amountsDone = true;
      }
    } catch (error) {
      setAmountFailure(error);
    } finally {
      setEdits((now) => rebaseEdits(now, done, amountsDone && plan.amounts ? plan.amounts.values : null));
      setSaving(false);
      refresh();
    }
  };
  const runPreview = () => {
    setBusy(true);
    setFailure(null);
    purchasing
      .previewReceipt(current.id)
      .then((next) => {
        setPreview(next);
        setApproved(new Set());
      }, setFailure)
      .finally(() => setBusy(false));
  };
  const post = async () => {
    if (!preview) return;
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`receipt-post:${current.id}`, (ref) => purchasing.postReceipt(ref, current.id, preview.version));
    setBusy(false);
    if (outcome.kind === 'failed') {
      if (!handledStale(outcome.error)) setFailure(outcome.error);
      return;
    }
    if (outcome.kind === 'done') toast({ tone: 'success', title: t('receipt.posted', 'رُحّل الاستلام {no}', { no: outcome.result.docNo ?? '' }) });
    else toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') });
    refresh();
  };
  const voidDoc = async (reason: string) => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`receipt-void:${current.id}`, (ref) => purchasing.voidReceipt(ref, current.id, reason));
    setBusy(false);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      setConfirm(null);
      refresh();
    }
  };
  const deleteLine = () => {
    if (!lineToDelete) return;
    setBusy(true);
    setFailure(null);
    purchasing
      .deleteReceiptLine(lineToDelete.id, current.version)
      .then(refresh, (error: unknown) => {
        if (!handledStale(error)) setFailure(error);
      })
      .finally(() => {
        setBusy(false);
        setLineToDelete(null);
      });
  };
  const discard = () => {
    setBusy(true);
    purchasing
      .discardReceipt(current.id, current.version)
      .then(
        () => navigate('/inventory/receipts'),
        (error: unknown) => {
          if (!handledStale(error)) setFailure(error);
        },
      )
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const ready = online && preview !== null && preview.ready && preview.problems.length === 0 && preview.lines.every((line) => approved.has(line.lineId));
  const title = current.docNo ? t('receipt.title.no', 'الاستلام {no}', { no: current.docNo }) : t('receipt.title.draft', 'مسوّدة استلام');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        subtitle={t('receipt.subtitle', '{status} — من «{party}» إلى «{store}» بتاريخ {day}، بدفتر «{book}»', {
          status: draft && canPrice && bundle.lineAmounts.length < bundle.lines.length ? t('receipt.awaiting', 'بانتظار المبالغ') : docStatusLabel(current.status),
          party: current.partyName,
          store: store?.name ?? '—',
          day: fmtDay(current.onDate),
          book: store ? receiptBook(store) : '—',
        })}
        actions={
          <Link to="/inventory/receipts" className="text-sm font-medium text-brand-700 dark:text-brand-200">
            {t('receipt.back', 'كل الاستلامات')}
          </Link>
        }
      />
      {loadError ? <LoadFailed what={t('receipt.what', 'الاستلام')} error={loadError} onRetry={reload} /> : null}
      {current.voidReason ? <Notice tone="warning" title={t('receipt.voided', 'أُلغي هذا الاستلام')}>{current.voidReason}</Notice> : null}
      <ReceiptLinesTable lines={bundle.lines} values={live ? live.values : null} totals={totals} onDelete={draft && canDraft ? setLineToDelete : null} />
      {draft && canDraft && store ? <AddReceiptLine doc={current} store={store} onAdded={refresh} /> : null}
      {current.status !== 'draft' && (canDraft || canPrice) ? <ReceiptReturnsPanel receipt={current} canDraft={canDraft} /> : null}
      {current.status === 'posted' && canRevalue && totals ? <PriceCorrectionPanel receipt={current} lines={bundle.lines} totals={totals} /> : null}
      {draft && canPrice && boxes.error ? <LoadFailed what={t('cash.boxes.what', 'قائمة الصناديق')} error={boxes.error} onRetry={boxes.retry} /> : null}
      {draft && settled && plan && bundle.lines.length > 0 ? (
        <AmountsPanel bundle={bundle} edits={settled.edits} conflicts={settled.conflicts} plan={plan} boxes={boxes.data ?? null} busy={saving} failure={amountFailure} onChange={setEdits} onSave={() => void saveAmounts()} />
      ) : null}
      {draft && canPrice && bundle.lines.length > 0 ? <ChargesPanel bundle={bundle} boxes={boxes.data ?? null} onSaved={refresh} onStale={handledStale} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {draft && (canDraft || canPrice) ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={busy && !preview} onClick={runPreview} disabled={!online} data-action="preview-receipt">
              {t('receipt.preview', 'عاين الاستلام')}
            </Button>
            {canDraft ? (
              <Button variant="ghost" onClick={() => setConfirm('discard')} disabled={busy} data-action="discard-receipt">
                {t('transfer.discard', 'اطوِ المسوّدة')}
              </Button>
            ) : null}
          </div>
          {preview ? (
            <>
              <ReceiptPreviewPanel
                preview={preview}
                approved={approved}
                onToggle={(lineId, on) => {
                  const next = new Set(approved);
                  if (on) next.add(lineId);
                  else next.delete(lineId);
                  setApproved(next);
                }}
              />
              {canPrice ? (
                <>
                  {dirty ? <Notice tone="warning" title={t('receipt.dirty', 'في المبالغ تعديل لم يُحفظ: احفظه أو تراجع عنه، ثم عاين من جديد قبل الترحيل.')} /> : null}
                  <Button disabled={!ready || dirty} busy={busy} onClick={() => void post()} data-action="post-receipt">
                    {t('receipt.post', 'رحّل الاستلام')}
                  </Button>
                </>
              ) : (
                <Notice tone="info" title={t('receipt.keeper', 'المبالغ والترحيل للمحاسب أو المدير؛ المسوّدة باقية لهما.')} />
              )}
            </>
          ) : null}
        </div>
      ) : current.status === 'posted' && canVoid ? (
        <Button variant="danger" onClick={() => setConfirm('void')} data-action="void-receipt">
          {t('receipt.void', 'ألغِ الاستلام')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={lineToDelete !== null}
        title={t('receipt.line.delete.title', 'احذف سطر «{item}»', { item: lineToDelete?.itemName ?? '' })}
        consequence={t('receipt.line.delete.consequence', 'يُحذف سطر «{item}» ({qty}) من المسوّدة مع مبلغه إن كُتب، وتُعاد معاينتها.', {
          item: lineToDelete?.itemName ?? '',
          qty: lineToDelete ? fmtCounted(lineToDelete.qtyInUnit, enteredUnit(lineToDelete)) : '',
        })}
        confirmLabel={t('transfer.line.delete', 'احذف السطر')}
        busy={busy}
        action="confirm-delete-line"
        onConfirm={deleteLine}
        onCancel={() => setLineToDelete(null)}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        title={t('receipt.discard.title', 'اطوِ مسوّدة الاستلام')}
        consequence={t('receipt.discard.consequence', 'تصير مسوّدة الاستلام من «{party}» بتاريخ {day} ملغاة بلا رقم ولا حركات، ولا ترجع.', { party: current.partyName, day: fmtDay(current.onDate) })}
        confirmLabel={t('transfer.discard', 'اطوِ المسوّدة')}
        busy={busy}
        action="confirm-discard-receipt"
        onConfirm={discard}
        onCancel={() => setConfirm(null)}
      />
      {confirm === 'void' && current.docNo ? (
        <VoidDocDialog
          title={t('receipt.void.title', 'ألغِ الاستلام {no}', { no: current.docNo })}
          consequence={receiptVoidSentence(current.docNo, bundle.lines.length)}
          busy={busy}
          failure={failure}
          onConfirm={(reason) => void voidDoc(reason)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function NewReceipt({ stores, onSaved }: { stores: readonly StoreRef[]; onSaved: (id: string) => void }) {
  const id = useId();
  const [storeId, setStoreId] = useState('');
  const [party, setParty] = useState<PartyPick | null>(null);
  const [day, setDay] = useState(fmtDay(localDay()));
  const draftIds = useDraftIds();
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const receiving = stores.filter((store) => !store.archived && receivableKinds(store.kind).length > 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const date = postingDay(day);
    if (!storeId || !party || !date.day) {
      setFailure(new RejectedError('fields', date.error ?? t('receipt.new.fields', 'اختر المخزن والمورّد واكتب التاريخ.')));
      return;
    }
    const values = JSON.stringify([storeId, party.id, date.day]);
    const docId = draftIds.idFor(values);
    setBusy(true);
    setFailure(null);
    purchasing
      .createReceiptDraft(docId, storeId, party.id, date.day)
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
  const picked = receiving.find((store) => store.id === storeId);
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      <h2 className="font-semibold">{t('receipt.new', 'استلام جديد')}</h2>
      <StoreSelect id={`${id}-store`} label={t('receipt.store', 'إلى مخزن')} stores={receiving} value={storeId} onChange={setStoreId} />
      {picked ? <p className="text-sm text-ink-muted">{t('receipt.book', 'الدفتر: «{book}» (من نوع المخزن)', { book: receiptBook(picked) })}</p> : null}
      <SupplierPicker id={`${id}-party`} label={t('receipt.party', 'المورّد')} value={party} onChange={setParty} />
      <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={day} onChange={setDay} hint={t('use.day', 'اليوم أو قبله حتى 7 أيام.')} />
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} data-action="create-receipt">
        {t('use.new.create', 'أنشئ المسوّدة')}
      </Button>
    </form>
  );
}

/** قائمة الاستلامات بصفحات (المسوّدات أوّلاً)، و«بانتظار المبالغ» (المسوّدات) لأدوار الكلفة، والمسوّدة الجديدة لمن عنده receipt.draft. */
export function ReceiptsList() {
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const [draftsOnly, setDraftsOnly] = useState(false);
  const loadFirst = useCallback(() => purchasing.listReceipts(null, draftsOnly), [draftsOnly]);
  const first = useLoad(loadFirst, `receipts#${draftsOnly}`);
  const setup = useLoad(inventory.loadOrgSetup);
  const [pages, setPages] = useState<{ draftsOnly: boolean; list: Awaited<ReturnType<typeof purchasing.listReceipts>>[] }>({ draftsOnly: false, list: [] });
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const all = first.data ? [first.data, ...(pages.draftsOnly === draftsOnly ? pages.list : [])] : [];
  const seen = new Set<string>();
  const loaded = all.flatMap((page) => page.rows).filter((doc) => (seen.has(doc.id) ? false : (seen.add(doc.id), true)));
  const next = all.at(-1)?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    const filter = draftsOnly;
    purchasing.listReceipts(next, filter).then(
      (page) => {
        setPages((current) => (current.draftsOnly === filter ? { draftsOnly: filter, list: [...current.list, page] } : current));
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };
  const stores = setup.data ? storesOf(setup.data) : [];
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const canDraft = workspace ? can(workspace.role, 'receipt.draft') : false;
  const canPrice = workspace ? can(workspace.role, 'receipt.amounts') : false;
  const columns: Column<ReceiptDoc>[] = [
    {
      key: 'no',
      header: t('ledger.doc', 'المستند'),
      cell: (doc) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/receipts/${doc.id}`}>
          {doc.docNo ? <bdi dir="ltr">{doc.docNo}</bdi> : docStatusLabel(doc.status)}
        </Link>
      ),
    },
    { key: 'party', header: t('receipt.party', 'المورّد'), cell: (doc) => doc.partyName },
    { key: 'store', header: t('receipt.store', 'إلى مخزن'), cell: (doc) => names.get(doc.warehouseId) ?? '—' },
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (doc) => fmtDay(doc.onDate) },
    { key: 'status', header: t('stock.doc.status', 'الحالة'), cell: (doc) => docStatusLabel(doc.status) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('stock.receipts', 'الاستلام من المورّدين')} subtitle={t('receipt.list.subtitle', 'الأمين يكتب الكميات، والمحاسب أو المدير يكتب المبالغ ويرحّل.')} />
      {!canDraft && !canPrice ? <Notice tone="info" title={t('receipt.forbidden', 'الاستلام لأمين المخزن والمحاسب والمدير ومالك المنشأة.')} /> : null}
      {canDraft && setup.error ? <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} /> : null}
      {canDraft && setup.data ? <NewReceipt stores={scopedStores(stores, workspace)} onSaved={(id) => navigate(`/inventory/receipts/${id}`)} /> : null}
      {canPrice ? (
        <Segmented
          label={t('use.list.show', 'اعرض')}
          options={[
            { value: 'all', label: t('use.list.all', 'الكل') },
            { value: 'drafts', label: t('receipt.awaiting', 'بانتظار المبالغ') },
          ]}
          value={draftsOnly ? 'drafts' : 'all'}
          onChange={(value) => {
            setPages({ draftsOnly: value === 'drafts', list: [] });
            setDraftsOnly(value === 'drafts');
          }}
        />
      ) : null}
      {first.error ? (
        <LoadFailed what={t('receipt.list.what', 'مستندات الاستلام')} error={first.error} onRetry={first.retry} />
      ) : first.data ? (
        <>
          <DataTable caption={t('stock.receipts', 'الاستلام من المورّدين')} columns={columns} rows={loaded} rowKey={(doc) => doc.id} empty={draftsOnly ? t('receipt.list.drafts_empty', 'لا مسوّدات بانتظار المبالغ.') : t('receipt.list.empty', 'لا استلام بعد.')} />
          <PageFooter shown={loaded.length} total={first.data.total} next={next !== null} busy={more.busy} error={more.error} what={t('receipt.list.what', 'مستندات الاستلام')} onMore={loadMore} action="more-receipts" />
        </>
      ) : null}
    </div>
  );
}

export function ReceiptDocPage() {
  const { id = '' } = useParams();
  return <ReceiptEditor key={id} docId={id} />;
}
