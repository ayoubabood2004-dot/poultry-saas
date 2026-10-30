import { ChevronDown, Plus, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { PostPreview, previewReady, type PreviewLine } from '../../components/ui/PostPreview';
import { QtyInput, type QtyUnitOption, type QtyValue } from '../../components/ui/QtyInput';
import { toast } from '../../components/ui/Toast';
import { announceZeroBalance, WholeBalanceConfirm, type WholeLine } from '../../components/ui/WholeBalance';
import { decimalText } from '../../domain/decimal';
import { localDay } from '../../domain/dates';
import { can } from '../../domain/permissions';
import { itemAdmissible, sharesAdmissibleKind } from '../../domain/stock';
import { parseQty, toBase, type BaseUnit } from '../../domain/units';
import { parseDayText } from '../../lib/dayText';
import { assertSameStamp, listDeviceDrafts, removeDeviceDraft, saveDeviceDraft, type DeviceDraft, type DraftStamp } from '../../lib/drafts';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtCounted, fmtDay, fmtInt, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { workspace as workspaceRepo } from '../../lib/repo';
import * as inventory from '../../lib/repo/inventory';
import type { ItemRow, StockDoc, TransferLine, TransferPreview } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { docStatusLabel, ItemPicker, loadItemUnits, PageFooter, qtyColumns, rememberItems, runWithRef, seenOwner, unitOptions, scopedStores, StoreSelect, storesOf, useDocPages, useDraftIds, VoidDocDialog, type StoreRef } from './stock-shared';

// التحويل والصادر الداخلي (الخطّة WP4، FOUNDATION ٥٥٤، القاعدة 15، Q4): الأمين ينشئ المسوّدة من مخزن بنطاقه لأي مخزن فعّال يقبل
// المادّة، والشاشة تكول «صادر داخلي إلى …» بين وحدتين. المعاينة تسحب بالدفعات (والنقص يبقي المسوّدة، «سجّل الاستلام أو الجرد»)،
// والسطر اللي يسحب الرصيد كلّه يحتاج تأكيداً يسمّي المادّة والكمية، والصفر ينعلن بصوت (E31). الترحيل بمرجع ثابت ويحتاج الشبكة،
// والإلغاء بتأكيد يسمّي الرقم والكمية الراجعة، وطيّ المسوّدة بتأكيد يسمّيها. وبلا نت: مسوّدة الجهاز (الرأس وسطوره) على رفّ الكاتب
// ومنشأته، وما ترتفع إلا بـ«ارفع» بعد تأكيد المنشأة من الخادم. الوجهات بالأهلية (مخزن يقبل نوعاً يقبله المرسِل).

/** «ألغِ التحويل TR-2026-0003 — ستعود 1,000 لتر إلى «المخزن العام»». */
export function transferVoidSentence(docNo: string, lines: readonly { qty: bigint; baseUnit: TransferLine['baseUnit']; itemName: string }[], from: string): string {
  const back = lines.map((line) => t('transfer.void.line', '{qty} من «{item}»', { qty: fmtQty(line.qty, line.baseUnit).main, item: line.itemName })).join(t('list.separator', '، '));
  return t('transfer.void.sentence', 'ألغِ التحويل {no} — ستعود {back} إلى «{from}».', { no: docNo, back, from });
}

/** خطوط المعاينة لـPostPreview (السحب بالدفعات، والقيمة null لدور بلا كلفة). */
export function previewLines(preview: TransferPreview): PreviewLine[] {
  return preview.lines.map((line) => ({
    lineId: line.lineId,
    itemName: line.itemName,
    unit: line.baseUnit,
    requested: line.qty,
    draws: line.draws.map((draw) => ({ lotId: draw.lotId, lotLabel: t('transfer.lot', '{source} — استُلم {day}', { source: draw.source, day: fmtDay(draw.receivedOn) }), qty: draw.qty, value: draw.value })),
    shortage: line.shortage,
  }));
}

/** زرّ الترحيل: معاينة جاهزة بلا مشكلة، وكل سطر انوافق عليه، والشبكة موجودة (الترحيل ما يدخل الطابور، FOUNDATION ٢٠١). */
export function transferPostReady(preview: TransferPreview | null, approved: ReadonlySet<string>, online: boolean): boolean {
  return online && Boolean(preview && preview.ready && preview.problems.length === 0 && previewReady(previewLines(preview), approved));
}

/**
 * المواد اللي سطورها سوا تسحب متاحها كلّه (E31): الخادم يعلّم آخر سطر للمادّة، والكمية بالتأكيد مجموع سطورها كلها (سطران 600 و400
 * لتر من 1,000 = 1,000 لتر، مو 400).
 */
export function wholeLines(preview: TransferPreview): WholeLine[] {
  const whole = new Set(preview.lines.filter((line) => line.wholeBalance).map((line) => line.itemId));
  const byItem = new Map<string, WholeLine>();
  for (const line of preview.lines) {
    if (!whole.has(line.itemId)) continue;
    const seen = byItem.get(line.itemId);
    byItem.set(line.itemId, { itemName: line.itemName, qty: (seen?.qty ?? 0n) + line.qty, unit: line.baseUnit });
  }
  return [...byItem.values()];
}

/** رفض الترحيل لأن المخزون تغيّر بعد المعاينة (بصمتها ما طابقت): الشاشة تعاين من جديد. */
function isStalePreview(error: unknown): boolean {
  return error instanceof RejectedError && error.code === 'stale_preview';
}

function AddTransferLine({ docId, from, to, onAdded }: { docId: string; from: StoreRef; to: StoreRef; onAdded: () => void }) {
  const id = useId();
  const [item, setItem] = useState<ItemRow | null>(null);
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[] | null>(null);
  const [packsFailed, setPacksFailed] = useState<unknown>(null);
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  // معرّف السطر يولد بالجهاز (مراجعة WP8): الإعادة بعد جواب ضاع 23505 = انكتب، مو سطر ثاني يضاعف الكمية.
  const [lineId, setLineId] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const admits = useCallback((row: ItemRow) => itemAdmissible(from.kind, row.kind) && itemAdmissible(to.kind, row.kind), [from.kind, to.kind]);
  // مادّة ثانية تبدأ من وحداتها هي وكمية فارغة: وحدة تعبئة المادّة السابقة كانت تنرسل ويّا المادّة الجديدة (مراجعة WP4 الثانية).
  const pickItem = (next: ItemRow | null) => {
    setLineId(crypto.randomUUID());
    setItem(next);
    setPacks(null);
    setPacksFailed(null);
    setQty({ text: '', unitId: 'base' });
  };
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    loadItemUnits(item.id, true).then(
      (rows) => {
        if (!cancelled) setPacks(rows.filter((row) => row.itemId === item.id));
      },
      (error: unknown) => {
        if (!cancelled) setPacksFailed(error);
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
      setFailure(new RejectedError('fields', t('transfer.line.fields', 'اختر المادّة واكتب كمية أكبر من صفر.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    const unit = qty.unitId === 'base' ? { item_unit_id: null, unit_code: null } : qty.unitId.startsWith('code:') ? { item_unit_id: null, unit_code: qty.unitId.slice('code:'.length) } : { item_unit_id: qty.unitId, unit_code: null };
    const fields = { item_id: item.id, ...unit, qty_in_unit: decimalText(amount, 3) };
    const added = () => {
      pickItem(null);
      onAdded();
    };
    inventory
      .addTransferLine(docId, fields, lineId)
      .catch((error: unknown) => {
        // محاولة سابقة بنفس المعرّف وصلت وضاع جوابها: نفس السطر بآخر قيم.
        if (inventory.isDuplicate(error)) return inventory.updateTransferLine(lineId, fields);
        throw error;
      })
      .then(added, (error: unknown) => {
        // رفض أكيد: سطر جديد بمعرّف جديد؛ ونتيجة مجهولة: المعرّف يبقى فالإعادة نفس السطر (قراءة المستند هنا كانت تطوي النموذج ومعرّفه).
        if (error instanceof RejectedError) setLineId(crypto.randomUUID());
        setFailure(error);
      })
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      <ItemPicker id={`${id}-item`} label={t('stock.col.item', 'المادّة')} value={item} onChange={pickItem} filter={admits} />
      {packsFailed ? <LoadFailed what={t('transfer.units.what', 'وحدات المادّة')} error={packsFailed} onRetry={() => { setPacksFailed(null); setItem(item ? { ...item } : null); }} /> : null}
      {item && packs ? <QtyInput id={`${id}-qty`} label={t('stock.col.qty', 'الكمية')} base={item.baseUnit} units={unitOptions(item, packs ?? [])} value={qty} onChange={setQty} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} disabled={!item} icon={<Plus aria-hidden="true" className="size-4" />} data-action="add-transfer-line">
        {t('transfer.line.add', 'أضف السطر')}
      </Button>
    </form>
  );
}

/** اسم وحدة السطر كما كُتب: الطن، أو وحدة التعبئة، أو وحدة الأساس. */
function enteredUnit(line: TransferLine): string {
  if (line.unitCode === 't') return t('unit.t', 'طن');
  if (line.itemUnitId) return line.unitLabel;
  return baseUnitLabel(line.baseUnit);
}

export function TransferLinesTable({ lines, onDelete }: { lines: readonly TransferLine[]; onDelete: ((line: TransferLine) => void) | null }) {
  const columns: Column<TransferLine>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'entered', header: t('transfer.col.entered', 'كما كُتبت'), cell: (line) => fmtCounted(line.qtyInUnit, enteredUnit(line)) },
    ...qtyColumns(lines, (line) => line.qty, (unit) => t('stock.col.qty_in', 'الكمية ({unit})', { unit })),
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
  return <DataTable caption={t('transfer.lines', 'سطور التحويل')} columns={columns} rows={lines} rowKey={(line) => line.id} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />;
}

function TransferEditor({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const load = useCallback(() => inventory.loadStockDoc('transfer', docId), [docId]);
  const [tick, setTick] = useState(0);
  const doc = useLoad(load, `${docId}#${tick}`);
  const setup = useLoad(inventory.loadOrgSetup);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [approved, setApproved] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<'whole' | 'void' | 'discard' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // المعاينة انعادت لأن المخزون تغيّر بعد الموافقة (stale_preview): تنبيه فوق المعاينة الجديدة لحد ما تنوافق وتترحّل.
  const [restaled, setRestaled] = useState(false);
  const refresh = () => {
    setPreview(null);
    setApproved(new Set());
    setRestaled(false);
    setTick((n) => n + 1);
  };
  if (doc.error) return <LoadFailed what={t('transfer.what', 'التحويل')} error={doc.error} onRetry={doc.retry} />;
  if (setup.error) return <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />;
  if (!doc.data || !setup.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const current: StockDoc = doc.data.doc;
  const lines = doc.data.transferLines;
  const stores = storesOf(setup.data);
  const from = stores.find((s) => s.id === current.warehouseId);
  const to = stores.find((s) => s.id === current.toWarehouseId);
  const draft = current.status === 'draft';
  const failed = failure ? describeError(failure) : null;
  const whole = preview ? wholeLines(preview) : [];
  const post = async () => {
    if (!preview) return;
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`transfer-post:${current.id}`, (ref) => inventory.postTransferDoc(ref, current.id, preview.version, preview.plan));
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
    if (outcome.kind === 'done') toast({ tone: 'success', title: t('transfer.posted', 'رُحّل التحويل {no}', { no: outcome.result.docNo ?? '' }) });
    else toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') });
    announceZeroBalance(whole, from?.name ?? '');
    refresh();
  };
  const voidDoc = async (reason: string) => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`transfer-void:${current.id}`, (ref) => inventory.voidTransferDoc(ref, current.id, reason));
    setBusy(false);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      setConfirm(null);
      refresh();
    }
  };
  const runPreview = () => {
    setBusy(true);
    setFailure(null);
    inventory
      .previewTransfer(current.id)
      .then((next) => {
        setPreview(next);
        setApproved(new Set());
      }, setFailure)
      .finally(() => setBusy(false));
  };
  const deleteLine = (line: TransferLine) => {
    setBusy(true);
    inventory
      .deleteDraftLine('transfer', line.id, preview?.version ?? current.version)
      .then(refresh, setFailure)
      .finally(() => setBusy(false));
  };
  const discard = () => {
    setBusy(true);
    inventory
      .discardDraft('transfer', current.id, preview?.version ?? current.version)
      .then(() => navigate('/inventory/transfers'), setFailure)
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const exportTo = from && to && from.divisionId !== to.divisionId ? to : null;
  const ready = transferPostReady(preview, approved, online);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={current.docNo ? t('transfer.title.no', 'التحويل {no}', { no: current.docNo }) : t('transfer.title.draft', 'مسوّدة تحويل')}
        subtitle={t('transfer.subtitle', '{status} — من «{from}» إلى «{to}» بتاريخ {day}', { status: docStatusLabel(current.status), from: from?.name ?? '—', to: to?.name ?? '—', day: fmtDay(current.onDate) })}
        actions={
          <Link to="/inventory/transfers" className="text-sm font-medium text-brand-700 dark:text-brand-200">
            {t('transfer.back', 'كل التحويلات')}
          </Link>
        }
      />
      {exportTo ? (
        <Notice tone="info" title={t('transfer.export', 'صادر داخلي إلى {division}', { division: divisionLabel(exportTo.divisionKind) })}>
          {t('transfer.export.detail', 'ينتقل بالكلفة بلا ربح ولا قيد جهة.')}
        </Notice>
      ) : null}
      {current.voidReason ? <Notice tone="warning" title={t('transfer.voided', 'أُلغي هذا التحويل')}>{current.voidReason}</Notice> : null}
      <TransferLinesTable lines={lines} onDelete={draft ? deleteLine : null} />
      {draft && from && to ? <AddTransferLine docId={current.id} from={from} to={to} onAdded={refresh} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {draft ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={busy && !preview} onClick={runPreview} disabled={!online} data-action="preview-transfer">
              {t('transfer.preview', 'عاين السحب')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm('discard')} disabled={busy} data-action="discard-transfer">
              {t('transfer.discard', 'اطوِ المسوّدة')}
            </Button>
          </div>
          {!online ? <Notice tone="warning" title={t('transfer.offline', 'الترحيل يحتاج اتصالاً بالخادم؛ المسوّدة باقية حتى يعود الاتصال.')} /> : null}
          {preview ? (
            <>
              {restaled ? (
                <Notice tone="warning" title={t('transfer.restaled', 'تغيّر المخزون بعد المعاينة فلم يُرحَّل التحويل')}>
                  {t('transfer.restaled.detail', 'هذه معاينة جديدة بالدفعات الموجودة الآن؛ راجعها ووافق على كل سطر من جديد قبل الترحيل.')}
                </Notice>
              ) : null}
              {preview.problems.map((problem) => (
                <Notice key={problem.code} tone="danger" title={problem.hint} />
              ))}
              {preview.lines.filter((line) => line.problem).map((line) => (
                <Notice key={line.lineId} tone="danger" title={line.problem?.hint ?? ''} />
              ))}
              <PostPreview
                lines={previewLines(preview)}
                approved={approved}
                onToggle={(lineId, on) => {
                  const next = new Set(approved);
                  if (on) next.add(lineId);
                  else next.delete(lineId);
                  setApproved(next);
                }}
              />
              <Button disabled={!ready} busy={busy} onClick={() => (whole.length ? setConfirm('whole') : void post())} data-action="post-transfer">
                {t('transfer.post', 'رحّل التحويل')}
              </Button>
            </>
          ) : null}
        </div>
      ) : current.status === 'posted' ? (
        <Button variant="danger" onClick={() => setConfirm('void')} data-action="void-transfer">
          {t('transfer.void', 'ألغِ التحويل')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirm === 'discard'}
        title={t('transfer.discard.title', 'اطوِ مسوّدة التحويل')}
        consequence={t('transfer.discard.consequence', 'تصير مسوّدة التحويل من «{from}» إلى «{to}» بتاريخ {day} ملغاة بلا رقم ولا حركات، ولا ترجع.', { from: from?.name ?? '—', to: to?.name ?? '—', day: fmtDay(current.onDate) })}
        confirmLabel={t('transfer.discard', 'اطوِ المسوّدة')}
        busy={busy}
        action="confirm-discard-transfer"
        onConfirm={discard}
        onCancel={() => setConfirm(null)}
      />
      <WholeBalanceConfirm open={confirm === 'whole'} lines={whole} warehouse={from?.name ?? '—'} busy={busy} onConfirm={() => void post()} onCancel={() => setConfirm(null)} />
      {confirm === 'void' && current.docNo ? (
        <VoidDocDialog
          title={t('transfer.void.title', 'ألغِ التحويل {no}', { no: current.docNo })}
          consequence={transferVoidSentence(current.docNo, lines, from?.name ?? '—')}
          busy={busy}
          failure={failure}
          onConfirm={(reason) => void voidDoc(reason)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * سطر مسوّدة الجهاز: المادّة ووحدتها وكميتها كما انكتبت (نصّ عشري بثلاث مراتب، E3)، ويرتفع سطراً سطراً بعد الرأس. الاسم والوحدة
 * للعرض على الرفّ بس؛ اللقطة (المعامل والكمية بوحدة الأساس) يكتبها الخادم لحظة الرفع (E7). المعرّف يولد بالجهاز لحظة الإضافة
 * (FOUNDATION ١٩٩): الرفع بعد جواب ضاع ينعاد بنفسه، والمكرّر يرجع 23505 مو سطراً ثانياً.
 */
export interface ShelfLine {
  id: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  itemUnitId: string | null;
  unitCode: string | null;
  unitLabel: string;
  qtyInUnit: string;
  /** رفض الخادم للسطر برمزه وتلميحه: الرفع يوقف عنده، والرفّ يعرضه ويسمح بحذفه. */
  rejected?: { code: string; hint: string | null } | null;
}

export interface ShelfPayload {
  from: string;
  to: string;
  day: string;
  note: string;
  /** معرّف الرأس بالخادم، يولد بالجهاز لحظة الحفظ (الإعادة بنفسه، 23505 = انكتب). */
  headerId?: string;
  /** الرأس بعد ما ارتفع (الإعادة بعد فشل بنصّ الطريق تكمل عليه، بلا رأس ثانٍ). */
  docId?: string | null;
  /** السطور الباقية على الجهاز بترتيبها (اللي ارتفعت تنشال). */
  lines?: ShelfLine[];
}

export interface ShelfDeps {
  /** المنشأة المؤكَّدة من الخادم (my_workspace)، أو null. */
  confirm: () => Promise<DraftStamp | null>;
  createTransferDraft: (from: string, to: string, day: string, note: string | null, id: string) => Promise<unknown>;
  addTransferLine: (docId: string, fields: inventory.TransferLineFields, id: string) => Promise<unknown>;
  saveDeviceDraft: (stamp: DraftStamp, draft: { id: string; kind: 'transfer'; title: string; payload: ShelfPayload }) => Promise<unknown>;
  removeDeviceDraft: (id: string) => Promise<void>;
  /** معرّف جديد للرأس أو السطر (crypto.randomUUID). */
  newId: () => string;
  /** معرّفات السطور اللي وصلت رأساً موجوداً بالخادم؛ ترمي إذا ما انقرا (شبكة، أو النطاق يخفيه). */
  linesOn: (docId: string) => Promise<ReadonlySet<string>>;
  /** معرّف ثابت من بذرة (نقل السطور لرأس جديد بنفس المعرّفات بكل محاولة وبكل نافذة، فالمكرّر 23505). */
  deriveId: (seed: string) => Promise<string>;
}

/** نتيجة الرفع: المسوّدة بالخادم، والرأس السابق إذا صار غير مسوّدة بنصّ الرفع وكم سطر من الجهاز كان وصله (ما ينعاد). */
export interface ShelfUpload {
  docId: string;
  previous: { docId: string; landed: number } | null;
}

/** سطر رفضه الخادم رفضاً أكيداً (مو شبكة): انعلّم على الجهاز بتلميحه، والرفّ يعرضه حتى ينحذف أو ينصلح سببه. */
export class ShelfLineRejectedError extends Error {
  constructor(
    readonly line: ShelfLine,
    readonly hint: string | null,
  ) {
    super('shelf_line_rejected');
    this.name = 'ShelfLineRejectedError';
  }
}

/** معرّف للرأس ولكل سطر قبل أوّل رفع (مسوّدة بلاها تاخذها وتنحفظ قبل ما يطلع أيّ طلب). */
function withIds(payload: ShelfPayload, newId: () => string): ShelfPayload {
  return { ...payload, headerId: payload.headerId ?? newId(), docId: payload.docId ?? null, lines: (payload.lines ?? []).map((line) => (line.id ? line : { ...line, id: newId() })) };
}

/**
 * رفع مسوّدة الجهاز (FOUNDATION ١٤٢، ١٩٩، GT-29): بعد ما الخادم يؤكّد نفس المستخدم والمنشأة بس، الرأس ثم السطور بترتيبها بمعرّفات
 * الجهاز، وبعد كل خطوة الباقي ينحفظ على الجهاز. فشل بنصّ الطريق أو جواب ضاع ما يضيّع سطراً ولا يكرّر رأساً ولا سطراً: الإعادة بنفس
 * المعرّف ترجع 23505 = انكتب. رأس صار مرحَّلاً أو مطوياً بنصّ الرفع (not_draft): السطور اللي وصلته (جوابها ضاع، أو الجهاز طفى قبل
 * حفظ الباقي؛ الحارس يرفض not_draft قبل ما يوصل فحص المعرّف) راحت ويّاه فتنشال من الجهاز، والباقي بس لرأس جديد (وإلا سطر يترحّل
 * مرّتين، مراجعة WP4 الثانية). سطر رفضه الخادم رفضاً أكيداً ينعلّم بتلميحه ويوقف الرفع عنده (ShelfLineRejectedError). بعد آخر سطر
 * تنشال من الجهاز.
 */
export async function uploadShelfDraft(draft: DeviceDraft<ShelfPayload>, deps: ShelfDeps): Promise<ShelfUpload> {
  assertSameStamp(draft, await deps.confirm());
  const stamp: DraftStamp = { userId: draft.userId, orgId: draft.orgId };
  let payload = withIds(draft.payload, deps.newId);
  const keep = () => deps.saveDeviceDraft(stamp, { id: draft.id, kind: 'transfer', title: draft.title, payload });
  const given = draft.payload.lines ?? [];
  if (payload.headerId !== draft.payload.headerId || (payload.lines ?? []).some((line, n) => line.id !== given[n]?.id)) await keep();
  let previous: ShelfUpload['previous'] = null;
  for (let round = 0; ; round += 1) {
    if (!payload.docId) {
      const headerId = payload.headerId ?? deps.newId();
      try {
        await deps.createTransferDraft(payload.from, payload.to, payload.day, payload.note.trim() || null, headerId);
      } catch (error) {
        if (!inventory.isDuplicate(error)) throw error;
      }
      payload = { ...payload, headerId, docId: headerId };
      await keep();
    }
    let gone: 'not_draft' | 'doc_not_found' | null = null;
    for (const line of [...(payload.lines ?? [])]) {
      try {
        await deps.addTransferLine(payload.docId ?? '', { item_id: line.itemId, item_unit_id: line.itemUnitId, unit_code: line.unitCode, qty_in_unit: line.qtyInUnit }, line.id);
      } catch (error) {
        if (inventory.isDuplicate(error)) {
          // انكتب بمحاولة سابقة جوابها ضاع: ينشال من الجهاز مثل الناجح.
        } else if (error instanceof RejectedError && (error.code === 'not_draft' || error.code === 'doc_not_found') && round === 0) {
          gone = error.code;
          break;
        } else if (error instanceof RejectedError) {
          payload = { ...payload, lines: (payload.lines ?? []).map((other) => (other.id === line.id ? { ...other, rejected: { code: error.code, hint: error.hint } } : other)) };
          await keep();
          throw new ShelfLineRejectedError(line, error.hint);
        } else throw error;
      }
      payload = { ...payload, lines: (payload.lines ?? []).filter((other) => other.id !== line.id) };
      await keep();
    }
    if (!gone) break;
    const goneId = payload.docId ?? '';
    // not_draft: الرأس موجود (الحارس لكاه)، فسطوره لازم تنقرا؛ قراءة فاشلة (شبكة، أو النطاق يخفيه) ترمي قبل أيّ حفظ. doc_not_found:
    // ماكو رأس بالمنشأة، فماكو سطر وصله.
    const landed = gone === 'not_draft' ? await deps.linesOn(goneId) : new Set<string>();
    const rest = (payload.lines ?? []).filter((line) => !landed.has(line.id));
    previous = { docId: goneId, landed: (payload.lines ?? []).length - rest.length };
    if (rest.length === 0) {
      await deps.removeDeviceDraft(draft.id);
      return { docId: goneId, previous };
    }
    // الباقي (اللي ما وصل الرأس السابق) لرأس جديد بمعرّفات مشتقّة من الرأس السابق والسطر: محاولتان (أو نافذتان) تنقلانه لنفس
    // المعرّفات، فالثانية ترجع 23505 بدل مسوّدة ثانية.
    const headerId = await deps.deriveId(`rehome:${goneId}`);
    const lines = await Promise.all(rest.map(async (line) => ({ ...line, id: await deps.deriveId(`rehome:${goneId}:${line.id}`), rejected: null })));
    payload = { ...payload, headerId, docId: null, lines };
    await keep();
  }
  await deps.removeDeviceDraft(draft.id);
  return { docId: payload.docId ?? '', previous };
}

/** مسوّدات الجهاز اللي ترتفع أو تنعدّل هسه بهذي النافذة: الرفّ ما يعرضها. */
const uploading = new Set<string>();

/** مسوّدة ماسكتها نافذة ثانية (رفع أو حذف بنفس اللحظة). */
export class ShelfBusyError extends Error {
  constructor() {
    super('shelf_busy');
    this.name = 'ShelfBusyError';
  }
}

/** المسوّدة (أو سطرها) ما عادت مثل ما عرضها الرفّ: رُفعت أو حُذفت أو تغيّرت بنافذة ثانية. ما يتغيّر شي هنا، والرفّ ينقرا من جديد. */
export class ShelfStaleError extends Error {
  constructor(readonly what: 'draft' | 'line') {
    super('shelf_stale');
    this.name = 'ShelfStaleError';
  }
}

const lockName = (id: string) => `device-draft:${id}`;

/**
 * يمسك المسوّدة على كل نوافذ الجهاز (Web Locks، ifAvailable) طول الرفع أو الحذف، فنافذتان ما ترفعان نفس المسوّدة ولا تحذف وحدة
 * سطراً والثانية ترفعه (مراجعة WP4 الثالثة). بلا Web Locks (متصفّح قديم أو فحص): بالنافذة بس، والمعرّفات المشتقّة تمنع التكرار.
 */
async function withDraft<T>(id: string, work: () => Promise<T>): Promise<T> {
  if (uploading.has(id)) throw new ShelfBusyError();
  const run = async () => {
    uploading.add(id);
    try {
      return await work();
    } finally {
      uploading.delete(id);
    }
  };
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return run();
  return locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
    if (!lock) throw new ShelfBusyError();
    return run();
  });
}

/**
 * المسوّدات اللي ماسكتها نافذة ثانية لحظة قراءة الرفّ (تنبيه بس: الفعل نفسه يمسكها أو يرجع ShelfBusyError)، أو فارغة بلا Web Locks.
 * الحصري بس: المشترك هو انتظار الرفّ لفلتها (whenReleased)، ينمنح ويفلت بنفس اللحظة.
 */
async function claimedElsewhere(): Promise<ReadonlySet<string>> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return new Set();
  const held = (await locks.query()).held ?? [];
  return new Set(held.flatMap((lock) => (lock.mode === 'exclusive' && lock.name?.startsWith('device-draft:') ? [lock.name.slice('device-draft:'.length)] : [])));
}

/**
 * يرجع لمّا تفلت النافذة الثانية المسوّدة (خلص رفعها أو فشل): طلب مشترك ينتظر بطابور قفلها وينمنح أوّل ما تفلتها ويفلت فوراً، فما
 * يمسكها على أحد. signal يلغي الانتظار (الرفّ انقرا من جديد أو انغلق). تنبيه «يُعمل عليها» كان لقطة يبقى للأبد (المراجعة الرابعة).
 */
function whenReleased(locks: LockManager, id: string, signal: AbortSignal): Promise<void> {
  return locks.request(lockName(id), { mode: 'shared', signal }, async () => undefined);
}

/** السجلّ الحالي للمسوّدة بالجهاز (مو نسخة الرفّ أو النموذج)، أو ShelfStaleError إذا راحت. */
async function currentDraft(draft: Pick<DeviceDraft<ShelfPayload>, 'id' | 'userId' | 'orgId'>): Promise<DeviceDraft<ShelfPayload>> {
  const current = (await listDeviceDrafts<ShelfPayload>({ userId: draft.userId, orgId: draft.orgId }, 'transfer')).find((row) => row.id === draft.id);
  if (!current) throw new ShelfStaleError('draft');
  return current;
}

async function uploadNow(draft: DeviceDraft<ShelfPayload>): Promise<ShelfUpload> {
  return withDraft(draft.id, async () => {
    // ماسكها ثم من سجلّها الحالي: نسخة الرفّ القديمة كانت ترجّع سطراً أو مسوّدة حذفتها نافذة ثانية، وترفع سطراً انحذف بالخادم
    // (23505 ما يحمي صفّاً انحذف) أو مسوّدة خلص رفعها (المراجعة الرابعة).
    const result = await uploadShelfDraft(await currentDraft(draft), shelfDeps());
    if (result.previous) {
      const remained = result.docId !== result.previous.docId;
      toast({
        tone: 'warning',
        title: t('shelf.previous', 'المسوّدة السابقة على الخادم رُحّلت أو طُويت قبل اكتمال الرفع'),
        detail: remained
          ? t('shelf.previous.detail', 'السطور التي وصلتها ({landed}) لم تُكرَّر، وصار الباقي مسوّدة جديدة.', { landed: fmtInt(result.previous.landed) })
          : t('shelf.previous.all', 'كل السطور الباقية كانت قد وصلتها ({landed})، فلم تُكرَّر ولم تُنشأ مسوّدة جديدة.', { landed: fmtInt(result.previous.landed) }),
      });
    }
    return result;
  });
}

/** كمية سطر الجهاز كما انكتبت بالفصحى: بوحدة الأساس بصيغ fmtQty («لتران»، «5 قطع»)، وبوحدة تعبئة أو طن بعددها واسمها. */
function shelfQtyText(line: Pick<ShelfLine, 'qtyInUnit' | 'unitLabel' | 'baseUnit' | 'itemUnitId' | 'unitCode'>): string {
  const qty = parseQty(line.qtyInUnit) ?? 0n;
  return line.itemUnitId || line.unitCode ? fmtCounted(qty, line.unitLabel) : fmtQty(qty, line.baseUnit).main;
}

/** اعتماديات الرفع الحقيقية (الرفّ ونموذج التحويل الجديد): المنشأة من my_workspace، والكتابة المباشرة بمعرّفات الجهاز. */
function shelfDeps(): ShelfDeps {
  return {
    confirm: async () => {
      const confirmed = await workspaceRepo.loadMyWorkspace();
      return confirmed.kind === 'member' ? { userId: confirmed.workspace.userId, orgId: confirmed.workspace.orgId } : null;
    },
    createTransferDraft: (from, to, day, note, id) => inventory.createTransferDraft(from, to, day, note, id),
    addTransferLine: (docId, fields, id) => inventory.addTransferLine(docId, fields, id),
    saveDeviceDraft,
    removeDeviceDraft,
    newId: () => crypto.randomUUID(),
    // أيّ فشل بالقراءة (شبكة، أو ZeroRowsError لأن النطاق يخفي رأساً موجوداً) يرمي ويوقف الرفع بلا ما يتنقل شي: «ما أعرف شنو
    // وصل» مو «ماكو شي وصل» (وإلا سطر وصل يترحّل مرّتين).
    linesOn: async (docId) => new Set((await inventory.loadStockDoc('transfer', docId)).transferLines.map((line) => line.id)),
    deriveId,
  };
}

/** معرّف بشكل uuid (نسخة 4، النوع 8) من أوّل 16 بايت من SHA-256 للبذرة: نفس البذرة نفس المعرّف بكل نافذة وجهاز. */
export async function deriveId(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** رسالة فشل الرفع: السطر المرفوض باسمه وتلميحه؛ وغيره (شبكة، جواب ضاع) يكول إن المرفوع باقٍ والإعادة تكمل بلا تكرار. */
export function shelfFailure(error: unknown): { title: string; detail: string } {
  if (error instanceof ShelfStaleError) {
    return error.what === 'draft'
      ? {
          title: t('shelf.stale.draft', 'رُفعت هذه المسوّدة أو حُذفت في نافذة أخرى'),
          detail: t('shelf.stale.draft.detail', 'لم يتغيّر شيء هنا. إن كانت قد رُفعت فسطورها في مسوّدة على الخادم: راجعها في القائمة واحذف منها ما لا تريده قبل الترحيل.'),
        }
      : { title: t('shelf.stale.line', 'رُفع هذا السطر أو تغيّر في نافذة أخرى'), detail: t('shelf.stale.line.detail', 'لم يُحذف شيء، وصار الرفّ مطابقاً لما على هذا الجهاز؛ راجع السطور ثم أعد.') };
  }
  if (error instanceof ShelfBusyError) {
    return { title: t('shelf.busy', 'يُعمل على هذه المسوّدة في نافذة أخرى'), detail: t('shelf.busy.detail', 'انتظر حتى ينتهي الرفع أو الحذف هناك، ثم أعد المحاولة.') };
  }
  if (error instanceof ShelfLineRejectedError) {
    return {
      title: t('shelf.rejected', 'رفض الخادم السطر «{item}»', { item: error.line.itemName }),
      detail: t('shelf.rejected.detail', '{hint} احذف السطر من هذا الجهاز أو أزل سببه، ثم ارفع الباقي؛ ما ارتفع قبله صار في المسوّدة على الخادم.', { hint: error.hint ?? '' }),
    };
  }
  const described = describeError(error);
  if (described.kind === 'network' || described.kind === 'unknown_outcome' || described.kind === 'retryable') {
    return { title: described.title, detail: t('shelf.interrupted', 'ما ارتفع قبل الانقطاع صار في المسوّدة على الخادم، والباقي محفوظ على هذا الجهاز؛ «ارفع» تكمل من حيث وقفت بلا تكرار.') };
  }
  return { title: described.title, detail: described.detail };
}

/** سطور مسوّدة جهاز على الرفّ: كما انكتبت، والمرفوض بتلميحه، وحذف السطر بتأكيد. */
function ShelfLines({ lines, busy, onRemove }: { lines: readonly ShelfLine[]; busy: boolean; onRemove: (line: { id: string | null; index: number }) => void }) {
  const rows = lines.map((line, index) => ({ ...line, index }));
  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <IconButton label={t('shelf.line.remove', 'احذف السطر من هذا الجهاز')} disabled={busy} onClick={() => onRemove({ id: line.id || null, index: line.index })} data-action="remove-device-line">
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      ),
    },
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'entered', header: t('transfer.col.entered', 'كما كُتبت'), cell: (line) => shelfQtyText(line) },
    { key: 'state', header: t('shelf.col.state', 'الحالة'), cell: (line) => (line.rejected ? (line.rejected.hint ?? line.rejected.code) : t('shelf.line.waiting', 'ينتظر الرفع')) },
  ];
  return <DataTable caption={t('shelf.lines.caption', 'سطور المسوّدة على هذا الجهاز')} columns={columns} rows={rows} rowKey={(line) => line.id || `${line.index}`} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />;
}

/**
 * رفّ مسوّدات الجهاز: لكاتبها ومنشأته بس، وترتفع بفعل صريح بعد تأكيد المنشأة من الخادم. tick من الصفحة (حفظ نموذج التحويل الجديد)،
 * والقائمة تنقرا من جديد لمّا يرجع الاتصال؛ والسطور تنعرض والمرفوض بتلميحه، وحذف السطر أو المسوّدة من الجهاز بتأكيد يسمّيهما.
 */
function DeviceShelf({ userId, orgId, tick, onUploaded, onSettled }: { userId: string; orgId: string; tick: number; onUploaded: (docId: string) => void; onSettled: () => void }) {
  const stamp: DraftStamp = useMemo(() => ({ userId, orgId }), [userId, orgId]);
  const online = useStore(onlineStore);
  const [drafts, setDrafts] = useState<DeviceDraft<ShelfPayload>[] | null>(null);
  const [shelfFailed, setShelfFailed] = useState<unknown>(null);
  const [failure, setFailure] = useState<{ draftId: string; error: unknown } | null>(null);
  const [busy, setBusy] = useState('');
  const [own, setOwn] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  // السطر بمعرّفه، وبترتيبه لمسوّدة انحفظت قبل معرّفات السطور (بلا معرّف).
  const [dropping, setDropping] = useState<{ draft: DeviceDraft<ShelfPayload>; line: { id: string | null; index: number } | null } | null>(null);
  const [elsewhere, setElsewhere] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    Promise.all([listDeviceDrafts<ShelfPayload>(stamp, 'transfer'), claimedElsewhere()]).then(
      ([rows, claimed]) => {
        if (cancelled) return;
        setDrafts(rows);
        setElsewhere(claimed);
      },
      (error: unknown) => {
        if (!cancelled) setShelfFailed(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [stamp, tick, own, online]);
  useEffect(() => {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!locks || elsewhere.size === 0) return;
    const controller = new AbortController();
    for (const id of elsewhere) {
      whenReleased(locks, id, controller.signal).then(
        () => setOwn((n) => n + 1),
        () => {
          // انلغى الانتظار (AbortError) أو رفضه المتصفّح: التنبيه يبقى لقطة القراءة، والفعل نفسه يمسكها أو يقول ShelfBusyError. ما
          // يعيد القراءة هنا، وإلا رفض يتكرّر يدوّر الرفّ بلا نهاية.
        },
      );
    }
    return () => controller.abort();
  }, [elsewhere]);
  if (shelfFailed) return <LoadFailed what={t('shelf.title', 'مسوّدات هذا الجهاز')} error={shelfFailed} onRetry={() => { setShelfFailed(null); setOwn((n) => n + 1); }} />;
  const shown = (drafts ?? []).filter((draft) => !uploading.has(draft.id));
  if (shown.length === 0) return null;
  // المسوّدة راحت من الجهاز (رُفعت أو حُذفت بنافذة ثانية): الرفّ ينقرا بدونها وتنبيهها تحتها يروح ويّاها (أو الرفّ كلّه)، فيطلع
  // إشعاراً؛ وإلا الحذف من رفّ قديم يسكت كأنه صار (المراجعة الرابعة).
  const fail = (draftId: string, error: unknown) => {
    if (error instanceof ShelfStaleError && error.what === 'draft') {
      toast({ tone: 'warning', ...shelfFailure(error) });
      return;
    }
    setFailure({ draftId, error });
    setOpen(draftId);
  };
  const upload = async (draft: DeviceDraft<ShelfPayload>) => {
    setBusy(draft.id);
    setFailure(null);
    try {
      onUploaded((await uploadNow(draft)).docId);
    } catch (error) {
      fail(draft.id, error);
    } finally {
      setBusy('');
      setOwn((n) => n + 1);
      onSettled();
    }
  };
  const drop = async () => {
    if (!dropping) return;
    const { draft, line: target } = dropping;
    setBusy(draft.id);
    try {
      // ماسكها (ما ترتفع بنافذة ثانية بنفس اللحظة)، ومن السجلّ الحالي بالجهاز (مو لقطة فتح النافذة) وبمعرّف السطر.
      // المسوّدة أو السطر ما عاد مثل ما عرضه الرفّ (رُفع أو تغيّر بنافذة ثانية): ShelfStaleError يقول هالشي بدل ما يسكت.
      await withDraft(draft.id, async () => {
        const current = await currentDraft(draft);
        if (target === null) {
          await removeDeviceDraft(draft.id);
          return;
        }
        const lines = current.payload.lines ?? [];
        // بلا معرّف (مسوّدة قبل معرّفات السطور) بترتيبه، بس إذا سطرها هناك بعده بلا معرّف: رفع بأيّ نافذة يعطيها معرّفات (withIds)
        // ويشيل الواصل فيتحرّك الترتيب، فالترتيب القديم كان يحذف سطراً ثانياً.
        const hit = (line: ShelfLine, n: number) => (target.id ? line.id === target.id : n === target.index && !line.id);
        const kept = lines.filter((line, n) => !hit(line, n));
        if (kept.length === lines.length) throw new ShelfStaleError('line');
        await saveDeviceDraft<ShelfPayload>(stamp, { id: current.id, kind: 'transfer', title: current.title, payload: { ...current.payload, lines: kept } });
      });
      setDropping(null);
      if (failure?.draftId === draft.id) setFailure(null);
    } catch (error) {
      fail(draft.id, error);
      setDropping(null);
    } finally {
      setBusy('');
      setOwn((n) => n + 1);
    }
  };
  const target = dropping?.line ?? null;
  const droppingLine = dropping && target ? ((dropping.draft.payload.lines ?? []).find((line, n) => (target.id ? line.id === target.id : n === target.index)) ?? null) : null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label={t('shelf.title', 'مسوّدات هذا الجهاز')}>
      <h2 className="font-semibold">{t('shelf.title', 'مسوّدات هذا الجهاز')}</h2>
      <p className="text-sm text-ink-muted">{t('shelf.detail.lines', 'كُتبت بلا اتصال، ولا يراها غيرك. ارفعها لتصير مسوّدة بالخادم بسطورها، ثم عاينها ورحّلها.')}</p>
      {!online ? <p className="text-sm text-ink-muted">{t('shelf.offline', 'الرفع يحتاج اتصالاً بالخادم؛ المسوّدات باقية على هذا الجهاز حتى يعود.')}</p> : null}
      <ul className="flex flex-col gap-3">
        {shown.map((draft) => {
          const lines = draft.payload.lines ?? [];
          const failed = failure?.draftId === draft.id ? shelfFailure(failure.error) : null;
          const claimed = elsewhere.has(draft.id);
          return (
            <li key={draft.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {draft.title}
                  <span className="ms-2 text-sm text-ink-muted">{t('shelf.lines', 'السطور الباقية: {count}', { count: fmtInt(lines.length) })}</span>
                  {claimed ? <span className="ms-2 text-sm text-ink-muted">{t('shelf.claimed', 'يُعمل عليها في نافذة أخرى')}</span> : null}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" icon={<ChevronDown aria-hidden="true" className="size-4" />} onClick={() => setOpen(open === draft.id ? null : draft.id)} aria-expanded={open === draft.id} data-action="show-device-lines">
                    {t('shelf.show', 'السطور')}
                  </Button>
                  <Button size="sm" variant="secondary" busy={busy === draft.id} disabled={!online || busy !== ''} icon={<Upload aria-hidden="true" className="size-4" />} onClick={() => void upload(draft)} data-action="upload-device-draft">
                    {t('shelf.upload', 'ارفع')}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== ''} onClick={() => setDropping({ draft, line: null })} data-action="drop-device-draft">
                    {t('shelf.drop', 'احذف من هذا الجهاز')}
                  </Button>
                </div>
              </div>
              {open === draft.id ? <ShelfLines lines={lines} busy={busy !== ''} onRemove={(line) => setDropping({ draft, line })} /> : null}
              {failed ? (
                <Notice tone="danger" title={failed.title}>
                  {failed.detail}
                </Notice>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={dropping !== null}
        title={droppingLine ? t('shelf.line.remove', 'احذف السطر من هذا الجهاز') : t('shelf.drop.title', 'احذف المسوّدة من هذا الجهاز')}
        consequence={
          droppingLine
            ? t('shelf.line.remove.consequence', 'يُحذف سطر «{item}» ({qty}) من مسوّدة «{title}» على هذا الجهاز ولا يرتفع، ولا يرجع.', { item: droppingLine.itemName, qty: shelfQtyText(droppingLine), title: dropping?.draft.title ?? '' })
            : t('shelf.drop.consequence', 'تُحذف مسوّدة «{title}» وسطورها الباقية ({count}) من هذا الجهاز ولا ترجع؛ ما ارتفع منها قبل يبقى في المسوّدة على الخادم.', { title: dropping?.draft.title ?? '', count: fmtInt((dropping?.draft.payload.lines ?? []).length) })
        }
        confirmLabel={droppingLine ? t('shelf.line.remove.confirm', 'احذف السطر') : t('shelf.drop.confirm', 'احذف المسوّدة')}
        busy={busy !== ''}
        action="confirm-drop-device"
        onConfirm={() => void drop()}
        onCancel={() => setDropping(null)}
      />
    </section>
  );
}

/**
 * الوجهات الممكنة من مخزن (الخطّة WP4: «the destination list is filtered by admissibility»): فعّالة، غير المرسِل، وتقبل نوع مادّة
 * واحد على الأقلّ يقبله المرسِل؛ مخزن ما يستلم ولا مادّة منه ما ينعرض (مسوّدة بمنتقي مواد فارغ دائماً).
 */
export function transferTargets(all: readonly StoreRef[], source: StoreRef | undefined): StoreRef[] {
  return all.filter((store) => !store.archived && store.id !== source?.id && (!source || sharesAdmissibleKind(source.kind, store.kind)));
}

/**
 * سطر جهاز من المادّة والوحدة والكمية، أو سبب رفضه بنفس قاعدة الحقل (QtyInput): كمية أكبر من صفر بوحدة مختارة، والمعدود عدد صحيح
 * بوحدة الأساس (toBase). سطر 1.5 قطعة كان ينقبل بلا نت ويرفضه الخادم بكل رفع (pieces_not_whole) فتنحبس المسوّدة.
 */
export function deviceLine(item: ItemRow | null, qty: QtyValue, units: readonly QtyUnitOption[], id: string): ShelfLine | { problem: string } {
  const amount = qty.text.trim() ? parseQty(qty.text) : null;
  const unit = units.find((option) => option.id === qty.unitId);
  if (!item || amount === null || amount <= 0n || !unit) return { problem: t('transfer.line.fields', 'اختر المادّة واكتب كمية أكبر من صفر.') };
  const converted = toBase(amount, unit.factor, item.baseUnit);
  if (!converted.ok) return { problem: t('qty.pieces_whole', 'يجب أن يكون عدد القطع صحيحاً') };
  if (converted.qty <= 0n) return { problem: t('transfer.line.zero_base', 'الكمية بوحدة الأساس قُرِّبت إلى صفر. اكتب كمية أكبر.') };
  const code = qty.unitId.startsWith('code:') ? qty.unitId.slice('code:'.length) : null;
  const pack = qty.unitId !== 'base' && !code ? qty.unitId : null;
  return { id, itemId: item.id, itemName: item.name, baseUnit: item.baseUnit, itemUnitId: pack, unitCode: code, unitLabel: unit.label, qtyInUnit: decimalText(amount, 3) };
}

/** سطور مسوّدة الجهاز: المادّة من اللي ظهرت بالجلسة (بلا نت)، والوحدة من المحفوظة (أو الأساس والطن). */
function DeviceLines({ from, to, lines, onChange }: { from: StoreRef; to: StoreRef; lines: readonly ShelfLine[]; onChange: (lines: ShelfLine[]) => void }) {
  const id = useId();
  const online = useStore(onlineStore);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  const [failure, setFailure] = useState<unknown>(null);
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[]>([]);
  const [packsFailed, setPacksFailed] = useState<unknown>(null);
  const admits = useCallback((row: ItemRow) => itemAdmissible(from.kind, row.kind) && itemAdmissible(to.kind, row.kind), [from.kind, to.kind]);
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    loadItemUnits(item.id, online).then(
      (rows) => {
        if (!cancelled) setPacks(rows.filter((row) => row.itemId === item.id));
      },
      (error: unknown) => {
        if (!cancelled) setPacksFailed(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [item, online]);
  const units = item ? unitOptions(item, packs) : [];
  const add = () => {
    const next = deviceLine(item, qty, units, crypto.randomUUID());
    if ('problem' in next) {
      setFailure(new RejectedError('fields', next.problem));
      return;
    }
    onChange([...lines, next]);
    setItem(null);
    setPacks([]);
    setQty({ text: '', unitId: 'base' });
    setFailure(null);
  };
  const columns: Column<ShelfLine & { key: string }>[] = [
    {
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <IconButton label={t('transfer.line.delete', 'احذف السطر')} onClick={() => onChange(lines.filter((other) => other !== lines[Number(line.key)]))} data-action="delete-device-line">
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      ),
    },
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'entered', header: t('transfer.col.entered', 'كما كُتبت'), cell: (line) => shelfQtyText(line) },
  ];
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <div className="flex flex-col gap-3">
      <DataTable caption={t('shelf.lines.caption', 'سطور المسوّدة على هذا الجهاز')} columns={columns} rows={lines.map((line, n) => ({ ...line, key: `${n}` }))} rowKey={(line) => line.key} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />
      <ItemPicker
        id={`${id}-item`}
        label={t('stock.col.item', 'المادّة')}
        value={item}
        onChange={(next) => {
          setItem(next);
          setPacks([]);
          setPacksFailed(null);
          setQty({ text: '', unitId: 'base' });
        }}
        filter={admits}
        offline={!online}
      />
      {packsFailed ? <LoadFailed what={t('transfer.units.what', 'وحدات المادّة')} error={packsFailed} onRetry={() => { setPacksFailed(null); setItem(item ? { ...item } : null); }} /> : null}
      {item ? <QtyInput id={`${id}-qty`} label={t('stock.col.qty', 'الكمية')} base={item.baseUnit} units={units} value={qty} onChange={setQty} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button variant="secondary" disabled={!item} icon={<Plus aria-hidden="true" className="size-4" />} onClick={add} data-action="add-device-line">
        {t('transfer.line.add', 'أضف السطر')}
      </Button>
    </div>
  );
}

/**
 * تحويل جديد. بلا نت: الرأس وسطوره مسوّدة على الجهاز (الرفّ). وسطور انكتبت (بلا نت ثم رجع الاتصال، أو متّصل) ما تضيع أبداً: الحفظ
 * يكتبها على الجهاز أوّلاً ثم يرفعها مثل الرفّ (بمعرّفاتها، بلا تكرار)، وفشل الرفع يبقيها على الرفّ. متّصل وبلا سطور: رأس بالخادم.
 */
function NewTransfer({ sources, all, stamp, onShelf, onSaved }: { sources: readonly StoreRef[]; all: readonly StoreRef[]; stamp: DraftStamp; onShelf: () => void; onSaved: () => void }) {
  // الحفظ بلا نت يحدّث الرفّ بس (القائمة ما تنقرا بلا نت فتطلع «تعذّر التحميل»)؛ وبعد ما يستقرّ الرفع (نجح أو فشل) onSaved
  // يحدّث الرفّ والقائمة، والرفّ ما يعرض مسوّدة ترتفع.
  const id = useId();
  const navigate = useNavigate();
  const draftIds = useDraftIds();
  const online = useStore(onlineStore);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [day, setDay] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<ShelfLine[]>([]);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // وهو متّصل: أوّل صفحة مواد تنحفظ للجلسة، فالمنتقي بلا نت يلكى بيها (رفّ الجهاز).
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const owner = seenOwner();
    inventory.listItems({}).then(
      (page) => {
        if (!cancelled) rememberItems(page.rows, owner);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [online]);
  const source = sources.find((s) => s.id === from);
  const targets = transferTargets(all, source);
  const target = targets.find((s) => s.id === to);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = day.trim() ? parseDayText(day) : localDay();
    if (!source || !target || !parsed) {
      setFailure(new RejectedError('fields', t('transfer.new.fields', 'اختر المخزن المرسِل والمستلم، والتاريخ يوم/شهر/سنة.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      if (!online || lines.length > 0) {
        const payload: ShelfPayload = { from: source.id, to: target.id, day: parsed, note, headerId: crypto.randomUUID(), docId: null, lines };
        const saved = await saveDeviceDraft<ShelfPayload>(stamp, { kind: 'transfer', title: t('shelf.transfer', 'تحويل من «{from}» إلى «{to}» بتاريخ {day}', { from: source.name, to: target.name, day: fmtDay(parsed) }), payload });
        setLines([]);
        if (!online) {
          onShelf();
          toast({ tone: 'info', title: t('shelf.saved', 'حُفظت المسوّدة على هذا الجهاز؛ ارفعها حين يعود الاتصال.') });
          return;
        }
        try {
          navigate(`/inventory/transfers/${(await uploadNow(saved)).docId}`);
        } catch (error) {
          toast({ tone: 'warning', title: t('shelf.saved_not_uploaded', 'حُفظت المسوّدة بسطورها على هذا الجهاز ولم يكتمل رفعها؛ أكملها من «مسوّدات هذا الجهاز».') });
          setFailure(error);
        } finally {
          onSaved();
        }
        return;
      }
      // رأس بلا سطور بمعرّف الجهاز لقيمه (مراجعة WP8): الإعادة بعد جواب ضاع تفتح نفس المسوّدة بدل ثانية فارغة.
      const values = JSON.stringify([source.id, target.id, parsed, note.trim()]);
      const headerId = draftIds.idFor(values);
      try {
        await inventory.createTransferDraft(source.id, target.id, parsed, note, headerId);
      } catch (error) {
        if (!inventory.isDuplicate(error)) {
          if (error instanceof RejectedError) draftIds.forget(values);
          throw error;
        }
      }
      navigate(`/inventory/transfers/${headerId}`);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };
  const failed = failure ? (failure instanceof RejectedError && failure.code === 'fields' ? describeError(failure, 'once') : shelfFailure(failure)) : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={(event) => void submit(event)} noValidate>
      <h2 className="font-semibold">{t('transfer.new', 'تحويل جديد')}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StoreSelect id={`${id}-from`} label={t('transfer.from', 'من مخزن')} stores={sources.filter((s) => !s.archived)} value={from} onChange={setFrom} />
        <StoreSelect id={`${id}-to`} label={t('transfer.to', 'إلى مخزن')} stores={targets} value={to} onChange={setTo} />
      </div>
      {source && target && source.divisionId !== target.divisionId ? (
        <p className="text-sm text-ink-muted">{t('transfer.export', 'صادر داخلي إلى {division}', { division: divisionLabel(target.divisionKind) })}</p>
      ) : null}
      <Field id={`${id}-day`} label={t('transfer.day', 'التاريخ (يوم/شهر/سنة)')} hint={t('transfer.day.hint', 'اتركه فارغاً لتاريخ اليوم {day}؛ والرجوع حتى 7 أيام.', { day: fmtDay(localDay()) })}>
        <input id={`${id}-day`} className="input" dir="ltr" inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
      </Field>
      <Field id={`${id}-note`} label={t('transfer.note', 'ملاحظة')}>
        <input id={`${id}-note`} className="input" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {(!online || lines.length > 0) && source && target ? <DeviceLines from={source} to={target} lines={lines} onChange={setLines} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} data-action="new-transfer">
        {!online ? t('transfer.new.device', 'احفظها على هذا الجهاز') : lines.length > 0 ? t('transfer.new.upload', 'ارفع المسوّدة بسطورها') : t('transfer.new.create', 'أنشئ المسوّدة')}
      </Button>
    </form>
  );
}

export function TransfersList() {
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const docs = useDocPages('transfer');
  const setup = useLoad(inventory.loadOrgSetup);
  const [shelfTick, setShelfTick] = useState(0);
  // بعد أيّ رفع (كامل أو جزئي): الرفّ يقرا من جديد، والقائمة هم (المسوّدة اللي ارتفع جزء منها تبين بيها).
  const changed = () => {
    setShelfTick((n) => n + 1);
    docs.reload();
  };
  const all = setup.data ? storesOf(setup.data) : [];
  const sources = scopedStores(all, workspace);
  const names = new Map(all.map((s) => [s.id, s.name]));
  const allowed = workspace ? can(workspace.role, 'transfer.post') : false;
  const stamp = workspace ? { userId: workspace.userId, orgId: workspace.orgId } : null;
  const columns: Column<StockDoc>[] = [
    {
      key: 'no',
      header: t('ledger.doc', 'المستند'),
      cell: (doc) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/transfers/${doc.id}`}>
          {doc.docNo ? <bdi dir="ltr">{doc.docNo}</bdi> : docStatusLabel(doc.status)}
        </Link>
      ),
    },
    { key: 'from', header: t('transfer.from', 'من مخزن'), cell: (doc) => names.get(doc.warehouseId) ?? '—' },
    { key: 'to', header: t('transfer.to', 'إلى مخزن'), cell: (doc) => (doc.toWarehouseId ? (names.get(doc.toWarehouseId) ?? '—') : '—') },
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (doc) => fmtDay(doc.onDate) },
    { key: 'status', header: t('stock.doc.status', 'الحالة'), cell: (doc) => docStatusLabel(doc.status) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('stock.transfers', 'التحويلات')} subtitle={t('transfer.list.subtitle', 'من مخزن بنطاقك إلى أيّ مخزن فعّال يقبل المادّة؛ وبين وحدتين صادر داخلي بالكلفة.')} />
      {!allowed ? <Notice tone="info" title={t('transfer.forbidden', 'التحويل لأمين المخزن والمدير ومالك المنشأة.')} /> : null}
      {allowed && workspace ? <DeviceShelf userId={workspace.userId} orgId={workspace.orgId} tick={shelfTick} onUploaded={(docId) => navigate(`/inventory/transfers/${docId}`)} onSettled={docs.reload} /> : null}
      {allowed && setup.error ? <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} /> : null}
      {allowed && setup.data && stamp ? <NewTransfer sources={sources} all={all} stamp={stamp} onShelf={() => setShelfTick((n) => n + 1)} onSaved={changed} /> : null}
      {docs.first.error ? (
        <LoadFailed what={t('transfer.list.what', 'التحويلات')} error={docs.first.error} onRetry={docs.first.retry} />
      ) : docs.first.data ? (
        <>
          <DataTable caption={t('stock.transfers', 'التحويلات')} columns={columns} rows={docs.rows} rowKey={(doc) => doc.id} empty={t('transfer.list.empty', 'لا تحويلات بعد.')} />
          <PageFooter shown={docs.rows.length} total={docs.total} next={docs.next !== null} busy={docs.more.busy} error={docs.more.error} what={t('transfer.list.what', 'التحويلات')} onMore={docs.loadMore} action="more-transfers" />
        </>
      ) : null}
    </div>
  );
}

export function TransferDoc() {
  const { id = '' } = useParams();
  return <TransferEditor key={id} docId={id} />;
}
