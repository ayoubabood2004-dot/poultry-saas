import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { PostPreview, previewReady, type PreviewLine } from '../../components/ui/PostPreview';
import { QtyInput, type QtyValue } from '../../components/ui/QtyInput';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { announceZeroBalance, WholeBalanceConfirm, type WholeLine } from '../../components/ui/WholeBalance';
import { decimalText } from '../../domain/decimal';
import { localDay } from '../../domain/dates';
import { can } from '../../domain/permissions';
import { itemAdmissible } from '../../domain/stock';
import { parseQty } from '../../domain/units';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtCounted, fmtDay, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as inventory from '../../lib/repo/inventory';
import type { ExpenseCategoryRow, ItemRow, LotRow } from '../../lib/repo/inventory';
import * as uses from '../../lib/repo/uses';
import type { UseDoc, UseLine, UseListDoc, UsePreview } from '../../lib/repo/uses';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { postingDay, DayField } from '../accounts/shared';
import { docStatusLabel, ItemPicker, loadItemUnits, PageFooter, qtyColumns, runWithRef, scopedStores, StoreSelect, storesOf, unitOptions, VoidDocDialog, type StoreRef } from './stock-shared';

// الصرف لمصروف عام والإتلاف (الخطّة WP5، FOUNDATION ٣٠٥–٣٠٦، ٥٥٦، Q5، E31): الأمين ينشئ المسوّدة بمخزن بنطاقه وتصنيف مصروف،
// والسطر يسحب بالترتيب (الصالح بس)، أو يسمّي دفعة منتهية فينتظر المدير («بانتظار موافقة المدير»)، والإتلاف للمدير بدفعة منتهية
// مسمّاة بكل سطر. المعاينة تسحب بالدفعات والسحب الكامل يحتاج تأكيداً يسمّي المادّة والكمية والصفر ينعلن بصوت. قيمة المصروف لأدوار
// الكلفة بس (الخادم يشيلها للأمين). الترحيل بمرجع ثابت وبصمة المعاينة، والإلغاء بسببه، وطيّ المسوّدة بتأكيد يسمّيها.

const DESTROY = 'expired_destroy';

/** تصنيفات الصرف: الفعّالة غير النظامية، و«إتلاف منتهي» (النظامي الوحيد اللي يختاره الصرف). */
export function stockUseCategories(all: readonly ExpenseCategoryRow[]): ExpenseCategoryRow[] {
  return all.filter((c) => !c.archived && (c.systemCode === null || c.systemCode === DESTROY));
}

/** «ألغِ الصرف SU-2026-0003 — سترجع 10 لترات من «كاز أبيض» إلى «المخزن العام»، ويُعكس مصروفه». */
export function stockUseVoidSentence(docNo: string, lines: readonly Pick<UseLine, 'qty' | 'baseUnit' | 'itemName'>[], store: string): string {
  const back = lines.map((line) => t('use.void.line', '{qty} من «{item}»', { qty: fmtQty(line.qty, line.baseUnit).main, item: line.itemName })).join(t('list.separator', '، '));
  return t('use.void.sentence', 'ألغِ الصرف {no} — سترجع {back} إلى «{store}»، ويُعكس مصروفه.', { no: docNo, back, store });
}

/** خطوط المعاينة (القيمة null لدور بلا كلفة). */
export function stockUsePreviewLines(preview: UsePreview): PreviewLine[] {
  return preview.lines.map((line) => ({
    lineId: line.lineId,
    itemName: line.itemName,
    unit: line.baseUnit,
    requested: line.qty,
    draws: line.draws.map((draw) => ({
      lotId: draw.lotId,
      lotLabel: draw.expiryOn
        ? t('use.lot.expiry', '{source} — ينتهي {day}', { source: draw.source, day: fmtDay(draw.expiryOn) })
        : t('use.lot', '{source} — استُلم {day}', { source: draw.source, day: fmtDay(draw.receivedOn) }),
      qty: draw.qty,
      value: draw.value,
    })),
    shortage: line.shortage,
  }));
}

/**
 * السطور اللي تسحب المتاح كلّه (E31): الكمية مجموع سطور المادّة بالترتيب (بلا دفعة مسمّاة)، مثل التحويل. سطر يفرّغ دفعته المنتهية
 * المسمّاة ما يصفّر المادّة، فما يدخل (مراجعة WP5: كان ينجمع ويّاها فيقول «سحب الرصيد كلّه» بكمية فيها المنتهي).
 */
export function stockUseWholeLines(preview: UsePreview): WholeLine[] {
  const ordered = preview.lines.filter((line) => line.lotId === null);
  const whole = new Set(ordered.filter((line) => line.wholeBalance).map((line) => line.itemId));
  const byItem = new Map<string, WholeLine>();
  for (const line of ordered) {
    if (!whole.has(line.itemId)) continue;
    const seen = byItem.get(line.itemId);
    byItem.set(line.itemId, { itemName: line.itemName, qty: (seen?.qty ?? 0n) + line.qty, unit: line.baseUnit });
  }
  return [...byItem.values()];
}

/** زرّ الترحيل: معاينة جاهزة بلا مشكلة، والمستخدم يقدر يرحّلها (إذن المدير للإتلاف والمنتهي)، وكل سطر انوافق عليه، والشبكة موجودة. */
export function stockUsePostReady(preview: UsePreview | null, approved: ReadonlySet<string>, online: boolean): boolean {
  return online && Boolean(preview && preview.ready && preview.canPost && preview.problems.length === 0 && previewReady(stockUsePreviewLines(preview), approved));
}

/** المسوّدة تنتظر المدير (Q5): سطر يسمّي دفعة منتهية، أو تصنيفها «إتلاف منتهي». */
export function awaitsManager(doc: Pick<UseListDoc, 'status' | 'namesLot' | 'categoryId'>, destroyIds: ReadonlySet<string>): boolean {
  return doc.status === 'draft' && (doc.namesLot || (doc.categoryId !== null && destroyIds.has(doc.categoryId)));
}

/** دفعات المادّة المنتهية بتاريخ المستند وبيها متبقٍّ (للإتلاف وصرف المنتهي بإذن المدير). */
export function expiredLots(rows: readonly LotRow[], day: string): LotRow[] {
  return rows.filter((row) => row.expiryOn !== null && row.expiryOn < day && row.qtyLeft > 0n);
}

function AddUseLine({ doc, store, destroy, onAdded }: { doc: UseDoc; store: StoreRef; destroy: boolean; onAdded: () => void }) {
  const id = useId();
  const [item, setItem] = useState<ItemRow | null>(null);
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[] | null>(null);
  const [lots, setLots] = useState<readonly LotRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState<unknown>(null);
  const [named, setNamed] = useState(false);
  const [lotId, setLotId] = useState('');
  // معرّف السطر يولد مرّة ويبقى لحد ما ينكتب: الإعادة بعد جواب ضاع 23505 = انكتب، مو سطر ثاني (مراجعة WP5).
  const [lineId, setLineId] = useState(() => crypto.randomUUID());
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const admits = useCallback((row: ItemRow) => itemAdmissible(store.kind, row.kind), [store.kind]);
  const pickItem = (next: ItemRow | null) => {
    setLineId(crypto.randomUUID());
    setItem(next);
    setPacks(null);
    setLots(null);
    setLoadFailed(null);
    setLotId('');
    setQty({ text: '', unitId: 'base' });
  };
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    Promise.all([loadItemUnits(item.id, true), inventory.loadItemLots(item.id, store.id)]).then(
      ([units, found]) => {
        if (cancelled) return;
        setPacks(units.filter((row) => row.itemId === item.id));
        setLots(found.rows);
      },
      (error: unknown) => {
        if (!cancelled) setLoadFailed(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [item, store.id]);
  const nameLot = destroy || named;
  const choices = lots ? expiredLots(lots, doc.onDate) : [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = qty.text.trim() ? parseQty(qty.text) : null;
    if (!item || amount === null || amount <= 0n) {
      setFailure(new RejectedError('fields', t('use.line.fields', 'اختر المادّة واكتب كمية أكبر من صفر.')));
      return;
    }
    if (nameLot && !lotId) {
      setFailure(new RejectedError('lot_required', destroy ? t('use.line.lot_destroy', 'الإتلاف يسمّي الدفعة المنتهية؛ اختر الدفعة.') : t('use.line.lot_pick', 'اختر الدفعة المنتهية.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    const unit = qty.unitId === 'base' ? { item_unit_id: null, unit_code: null } : qty.unitId.startsWith('code:') ? { item_unit_id: null, unit_code: qty.unitId.slice('code:'.length) } : { item_unit_id: qty.unitId, unit_code: null };
    const added = () => {
      pickItem(null);
      setNamed(false);
      onAdded();
    };
    const fields = { item_id: item.id, ...unit, qty_in_unit: decimalText(amount, 3), lot_id: nameLot ? lotId : null };
    uses
      .addUseLine(doc.id, lineId, fields)
      .then(added, (error: unknown) => {
        // 23505 بمعرّف الجهاز: محاولة ضاع جوابها انكتبت؛ آخر قيمة بالنموذج تنكتب فوقها (المستخدم ممكن صحّحها قبل الإعادة).
        if (inventory.isDuplicate(error)) uses.updateUseLine(lineId, fields).then(added, setFailure);
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
      <ItemPicker id={`${id}-item`} label={t('stock.col.item', 'المادّة')} value={item} onChange={pickItem} filter={admits} />
      {loadFailed ? <LoadFailed what={t('use.item.what', 'وحدات المادّة ودفعاتها')} error={loadFailed} onRetry={() => setItem(item ? { ...item } : null)} /> : null}
      {item && packs ? <QtyInput id={`${id}-qty`} label={t('stock.col.qty', 'الكمية')} base={item.baseUnit} units={unitOptions(item, packs)} value={qty} onChange={setQty} /> : null}
      {item && lots && !destroy && item.tracksExpiry ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-brand-600" checked={named} onChange={(event) => setNamed(event.target.checked)} data-action="name-expired-lot" />
          {t('use.line.named', 'من دفعة منتهية (يرحّلها المدير)')}
        </label>
      ) : null}
      {item && lots && nameLot ? (
        <Field id={`${id}-lot`} label={t('use.line.lot', 'الدفعة المنتهية')} hint={choices.length === 0 ? t('use.line.lot_none', 'لا دفعة منتهية من هذه المادّة في المخزن بتاريخ المستند.') : undefined}>
          <select id={`${id}-lot`} className="input" value={lotId} onChange={(event) => setLotId(event.target.value)} data-action="pick-lot">
            <option value="">{t('use.line.lot_choose', 'اختر الدفعة')}</option>
            {choices.map((lot) => (
              <option key={lot.lotId} value={lot.lotId}>
                {t('use.line.lot_option', '{source} — انتهت {day} — فيها {qty}', { source: lot.source, day: fmtDay(lot.expiryOn ?? ''), qty: fmtQty(lot.qtyLeft, item.baseUnit).main })}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} disabled={!item} icon={<Plus aria-hidden="true" className="size-4" />} data-action="add-use-line">
        {t('use.line.add', 'أضف السطر')}
      </Button>
    </form>
  );
}

/** المعاينة: «بانتظار موافقة المدير» (Q5)، والمشاكل، والسحب بالدفعات، وقيمة المصروف لأدوار الكلفة بس (للأمين null من الخادم). */
export function UsePreviewPanel({ preview, approved, onToggle }: { preview: UsePreview; approved: ReadonlySet<string>; onToggle: (lineId: string, approved: boolean) => void }) {
  return (
    <>
      {preview.needsManager && !preview.canPost ? (
        <Notice tone="info" title={t('use.awaiting', 'بانتظار موافقة المدير')}>
          {preview.destroy ? t('use.awaiting.destroy', 'الإتلاف يرحّله المدير؛ المسوّدة باقية له.') : t('use.awaiting.release', 'سطر يسمّي دفعة منتهية؛ صرفها يرحّله المدير، والمسوّدة باقية له.')}
        </Notice>
      ) : null}
      {preview.problems.map((problem) => (
        <Notice key={problem.code} tone="danger" title={problem.hint} />
      ))}
      {preview.lines.filter((line) => line.problem).map((line) => (
        <Notice key={line.lineId} tone="danger" title={line.problem?.hint ?? ''} />
      ))}
      <PostPreview lines={stockUsePreviewLines(preview)} approved={approved} onToggle={onToggle} />
      {preview.total !== null ? (
        <p className="text-sm">
          {t('use.total', 'قيمة المصروف')}: <MoneyText amount={preview.total} className="font-semibold" />
        </p>
      ) : null}
    </>
  );
}

function enteredUnit(line: UseLine): string {
  if (line.unitCode === 't') return t('unit.t', 'طن');
  if (line.itemUnitId) return line.unitLabel;
  return baseUnitLabel(line.baseUnit);
}

export function UseLinesTable({ lines, onDelete }: { lines: readonly UseLine[]; onDelete: ((line: UseLine) => void) | null }) {
  const columns: Column<UseLine>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'entered', header: t('transfer.col.entered', 'كما كُتبت'), cell: (line) => fmtCounted(line.qtyInUnit, enteredUnit(line)) },
    ...qtyColumns(lines, (line) => line.qty, (unit) => t('stock.col.qty_in', 'الكمية ({unit})', { unit })),
    { key: 'lot', header: t('use.col.lot', 'الدفعة'), cell: (line) => (line.lotId ? t('use.col.lot_named', 'منتهية مسمّاة') : t('use.col.lot_order', 'بالترتيب')) },
  ];
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
  return <DataTable caption={t('use.lines', 'سطور الصرف')} columns={columns} rows={lines} rowKey={(line) => line.id} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />;
}

function isStalePreview(error: unknown): boolean {
  return error instanceof RejectedError && error.code === 'stale_preview';
}

function UseEditor({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  // الأزرار بأفعالها (مراجعة WP5): المسوّدة لمن عنده stock_use.post، والإلغاء لمن عنده void (كانت تنعرض للكل فترفض بالخادم).
  const canPost = workspace ? can(workspace.role, 'stock_use.post') : false;
  const canVoid = workspace ? can(workspace.role, 'void') : false;
  const load = useCallback(() => uses.loadUse(docId), [docId]);
  const [tick, setTick] = useState(0);
  const doc = useLoad(load, `${docId}#${tick}`);
  const setup = useLoad(inventory.loadOrgSetup);
  const [preview, setPreview] = useState<UsePreview | null>(null);
  const [approved, setApproved] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<'whole' | 'void' | 'discard' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [restaled, setRestaled] = useState(false);
  const refresh = () => {
    setPreview(null);
    setApproved(new Set());
    setRestaled(false);
    setTick((n) => n + 1);
  };
  if (doc.error) return <LoadFailed what={t('use.what', 'الصرف')} error={doc.error} onRetry={doc.retry} />;
  if (setup.error) return <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />;
  if (!doc.data || !setup.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const current = doc.data.doc;
  const lines = doc.data.lines;
  const store = storesOf(setup.data).find((s) => s.id === current.warehouseId);
  const categories = stockUseCategories(setup.data.expenseCategories);
  const category = setup.data.expenseCategories.find((c) => c.id === current.categoryId) ?? null;
  const destroy = category?.systemCode === DESTROY;
  const draft = current.status === 'draft' && canPost;
  const failed = failure ? describeError(failure) : null;
  const whole = preview ? stockUseWholeLines(preview) : [];
  const runPreview = () => {
    setBusy(true);
    setFailure(null);
    uses
      .previewUse(current.id)
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
    const outcome = await runWithRef(`use-post:${current.id}`, (ref) => uses.postUse(ref, current.id, preview.version, preview.plan));
    setBusy(false);
    setConfirm(null);
    if (outcome.kind === 'failed') {
      if (isStalePreview(outcome.error)) {
        setRestaled(true);
        runPreview();
        return;
      }
      setFailure(outcome.error);
      return;
    }
    if (outcome.kind === 'done') toast({ tone: 'success', title: t('use.posted', 'رُحّل الصرف {no}', { no: outcome.result.docNo ?? '' }) });
    else toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') });
    announceZeroBalance(whole, store?.name ?? '');
    refresh();
  };
  const voidDoc = async (reason: string) => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`use-void:${current.id}`, (ref) => uses.voidUse(ref, current.id, reason));
    setBusy(false);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      setConfirm(null);
      refresh();
    }
  };
  const deleteLine = (line: UseLine) => {
    setBusy(true);
    uses
      .deleteUseLine(line.id, preview?.version ?? current.version)
      .then(refresh, setFailure)
      .finally(() => setBusy(false));
  };
  const setCategory = (categoryId: string) => {
    setBusy(true);
    setFailure(null);
    uses
      .updateUseDraft(current, { categoryId: categoryId || null })
      .then(refresh, setFailure)
      .finally(() => setBusy(false));
  };
  const discard = () => {
    setBusy(true);
    uses
      .discardUse(current.id, preview?.version ?? current.version)
      .then(() => navigate('/inventory/uses'), setFailure)
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const ready = stockUsePostReady(preview, approved, online);
  const title = current.docNo ? t('use.title.no', 'الصرف {no}', { no: current.docNo }) : destroy ? t('use.title.destroy', 'مسوّدة إتلاف') : t('use.title.draft', 'مسوّدة صرف');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        subtitle={t('use.subtitle', '{status} — من «{store}» بتاريخ {day}، تصنيف «{category}»', {
          status: docStatusLabel(current.status),
          store: store?.name ?? '—',
          day: fmtDay(current.onDate),
          category: category?.name ?? t('use.category.none', 'بلا تصنيف'),
        })}
        actions={
          <Link to="/inventory/uses" className="text-sm font-medium text-brand-700 dark:text-brand-200">
            {t('use.back', 'كل الصرف')}
          </Link>
        }
      />
      {current.voidReason ? <Notice tone="warning" title={t('use.voided', 'أُلغي هذا الصرف')}>{current.voidReason}</Notice> : null}
      {current.status === 'draft' && !canPost ? <Notice tone="info" title={t('use.forbidden', 'الصرف لأمين المخزن والمدير ومالك المنشأة.')} /> : null}
      {draft ? (
        <Field id="use-category" label={t('use.category', 'تصنيف المصروف')} hint={t('use.category.hint', '«إتلاف منتهي» للدفعات المنتهية بدفعة مسمّاة في كل سطر، ويرحّله المدير.')}>
          <select id="use-category" className="input" value={current.categoryId ?? ''} disabled={busy} onChange={(event) => setCategory(event.target.value)} data-action="pick-category">
            <option value="">{t('use.category.pick', 'اختر التصنيف')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <UseLinesTable lines={lines} onDelete={draft ? deleteLine : null} />
      {draft && store ? <AddUseLine doc={current} store={store} destroy={destroy} onAdded={refresh} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {draft ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={busy && !preview} onClick={runPreview} disabled={!online} data-action="preview-use">
              {t('use.preview', 'عاين السحب')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm('discard')} disabled={busy} data-action="discard-use">
              {t('transfer.discard', 'اطوِ المسوّدة')}
            </Button>
          </div>
          {!online ? <Notice tone="warning" title={t('use.offline', 'الترحيل يحتاج اتصالاً بالخادم؛ المسوّدة باقية حتى يعود الاتصال.')} /> : null}
          {preview ? (
            <>
              {restaled ? (
                <Notice tone="warning" title={t('use.restaled', 'تغيّر المخزون بعد المعاينة فلم يُرحَّل الصرف')}>
                  {t('use.restaled.detail', 'هذه معاينة جديدة بالدفعات الموجودة الآن؛ راجعها ووافق على كل سطر من جديد قبل الترحيل.')}
                </Notice>
              ) : null}
              <UsePreviewPanel
                preview={preview}
                approved={approved}
                onToggle={(lineId, on) => {
                  const next = new Set(approved);
                  if (on) next.add(lineId);
                  else next.delete(lineId);
                  setApproved(next);
                }}
              />
              <Button disabled={!ready} busy={busy} onClick={() => (whole.length ? setConfirm('whole') : void post())} data-action="post-use">
                {destroy ? t('use.post.destroy', 'رحّل الإتلاف') : t('use.post', 'رحّل الصرف')}
              </Button>
            </>
          ) : null}
        </div>
      ) : current.status === 'posted' && canVoid ? (
        <Button variant="danger" onClick={() => setConfirm('void')} data-action="void-use">
          {t('use.void', 'ألغِ الصرف')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirm === 'discard'}
        title={t('use.discard.title', 'اطوِ مسوّدة الصرف')}
        consequence={t('use.discard.consequence', 'تصير مسوّدة الصرف من «{store}» بتاريخ {day} ملغاة بلا رقم ولا حركات، ولا ترجع.', { store: store?.name ?? '—', day: fmtDay(current.onDate) })}
        confirmLabel={t('transfer.discard', 'اطوِ المسوّدة')}
        busy={busy}
        action="confirm-discard-use"
        onConfirm={discard}
        onCancel={() => setConfirm(null)}
      />
      <WholeBalanceConfirm open={confirm === 'whole'} lines={whole} warehouse={store?.name ?? '—'} busy={busy} onConfirm={() => void post()} onCancel={() => setConfirm(null)} />
      {confirm === 'void' && current.docNo ? (
        <VoidDocDialog
          title={t('use.void.title', 'ألغِ الصرف {no}', { no: current.docNo })}
          consequence={stockUseVoidSentence(current.docNo, lines, store?.name ?? '—')}
          busy={busy}
          failure={failure}
          onConfirm={(reason) => void voidDoc(reason)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function NewUse({ stores, categories, onSaved }: { stores: readonly StoreRef[]; categories: readonly ExpenseCategoryRow[]; onSaved: (id: string) => void }) {
  const id = useId();
  const [storeId, setStoreId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [day, setDay] = useState(fmtDay(localDay()));
  // معرّف المسوّدة يولد مرّة ويبقى لحد ما تنكتب، ويتجدّد بتغيّر النموذج: الإعادة بنفس القيم بعد جواب ضاع 23505 = انكتبت، وبقيم
  // ثانية مسوّدة جديدة، مو فتح مسوّدة بقيم قديمة (مراجعتا WP5).
  const [docId, setDocId] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const active = stores.filter((store) => !store.archived);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const date = postingDay(day);
    if (!storeId || !categoryId || !date.day) {
      setFailure(new RejectedError('fields', date.error ?? t('use.new.fields', 'اختر المخزن والتصنيف واكتب التاريخ.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    uses
      .createUseDraft(docId, storeId, categoryId, date.day)
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
      <h2 className="font-semibold">{t('use.new', 'صرف أو إتلاف جديد')}</h2>
      <StoreSelect
        id={`${id}-store`}
        label={t('use.store', 'من مخزن')}
        stores={active}
        value={storeId}
        onChange={(next) => {
          setStoreId(next);
          setDocId(crypto.randomUUID());
        }}
      />
      <Field id={`${id}-category`} label={t('use.category', 'تصنيف المصروف')}>
        <select
          id={`${id}-category`}
          className="input"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setDocId(crypto.randomUUID());
          }}
          data-action="pick-category"
        >
          <option value="">{t('use.category.pick', 'اختر التصنيف')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <DayField
        id={`${id}-day`}
        label={t('payment.day', 'التاريخ')}
        value={day}
        onChange={(next) => {
          setDay(next);
          setDocId(crypto.randomUUID());
        }}
        hint={t('use.day', 'اليوم أو قبله حتى 7 أيام.')}
      />
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} data-action="create-use">
        {t('use.new.create', 'أنشئ المسوّدة')}
      </Button>
    </form>
  );
}

/** قائمة الصرف بصفحات (المسوّدات أوّلاً)، والمسوّدة الجديدة لمن عنده الفعل. */
export function UsesList() {
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const first = useLoad(uses.listUses);
  const setup = useLoad(inventory.loadOrgSetup);
  // «بانتظار موافقة المدير» (رابط لوحة المخزون ?awaiting=1): المسوّدات أوّل القائمة، فتنعرض بأوّل صفحة.
  const [params] = useSearchParams();
  const [onlyAwaiting, setOnlyAwaiting] = useState(params.get('awaiting') === '1');
  const [pages, setPages] = useState<Awaited<ReturnType<typeof uses.listUses>>[]>([]);
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const all = first.data ? [first.data, ...pages] : [];
  const seen = new Set<string>();
  const loaded = all.flatMap((page) => page.rows).filter((doc) => (seen.has(doc.id) ? false : (seen.add(doc.id), true)));
  const next = all.at(-1)?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    uses.listUses(next).then(
      (page) => {
        setPages((current) => [...current, page]);
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };
  const stores = setup.data ? storesOf(setup.data) : [];
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const categories = setup.data ? setup.data.expenseCategories : [];
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const destroyIds = new Set(categories.filter((c) => c.systemCode === DESTROY).map((c) => c.id));
  const rows = onlyAwaiting ? loaded.filter((doc) => awaitsManager(doc, destroyIds)) : loaded;
  const allowed = workspace ? can(workspace.role, 'stock_use.post') : false;
  const columns: Column<UseListDoc>[] = [
    {
      key: 'no',
      header: t('ledger.doc', 'المستند'),
      cell: (doc) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/uses/${doc.id}`}>
          {doc.docNo ? <bdi dir="ltr">{doc.docNo}</bdi> : docStatusLabel(doc.status)}
        </Link>
      ),
    },
    { key: 'store', header: t('use.store', 'من مخزن'), cell: (doc) => names.get(doc.warehouseId) ?? '—' },
    { key: 'category', header: t('use.category', 'تصنيف المصروف'), cell: (doc) => (doc.categoryId ? (categoryNames.get(doc.categoryId) ?? '—') : '—') },
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (doc) => fmtDay(doc.onDate) },
    { key: 'status', header: t('stock.doc.status', 'الحالة'), cell: (doc) => (awaitsManager(doc, destroyIds) ? t('use.awaiting', 'بانتظار موافقة المدير') : docStatusLabel(doc.status)) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('stock.uses', 'الصرف والإتلاف')} subtitle={t('use.list.subtitle', 'صرف لمصروف عام بالدفعات، والإتلاف للمنتهي؛ المنتهي والإتلاف يرحّلهما المدير.')} />
      {!allowed ? <Notice tone="info" title={t('use.forbidden', 'الصرف لأمين المخزن والمدير ومالك المنشأة.')} /> : null}
      {allowed && setup.error ? <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} /> : null}
      {allowed && setup.data ? <NewUse stores={scopedStores(stores, workspace)} categories={stockUseCategories(categories)} onSaved={(id) => navigate(`/inventory/uses/${id}`)} /> : null}
      <Segmented
        label={t('use.list.show', 'اعرض')}
        options={[
          { value: 'all', label: t('use.list.all', 'الكل') },
          { value: 'awaiting', label: t('use.awaiting', 'بانتظار موافقة المدير') },
        ]}
        value={onlyAwaiting ? 'awaiting' : 'all'}
        onChange={(value) => setOnlyAwaiting(value === 'awaiting')}
      />
      {first.error ? (
        <LoadFailed what={t('use.list.what', 'مستندات الصرف')} error={first.error} onRetry={first.retry} />
      ) : first.data ? (
        <>
          <DataTable
            caption={t('stock.uses', 'الصرف والإتلاف')}
            columns={columns}
            rows={rows}
            rowKey={(doc) => doc.id}
            empty={onlyAwaiting ? t('use.list.awaiting_empty', 'لا مسوّدات بانتظار موافقة المدير فيما عُرض.') : t('use.list.empty', 'لا صرف بعد.')}
          />
          <PageFooter shown={loaded.length} total={first.data.total} next={next !== null} busy={more.busy} error={more.error} what={t('use.list.what', 'مستندات الصرف')} onMore={loadMore} action="more-uses" />
        </>
      ) : null}
    </div>
  );
}

export function UseDocPage() {
  const { id = '' } = useParams();
  return <UseEditor key={id} docId={id} />;
}
