import { Plus, Trash2, Upload } from 'lucide-react';
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
import { QtyInput, type QtyValue } from '../../components/ui/QtyInput';
import { toast } from '../../components/ui/Toast';
import { announceZeroBalance, WholeBalanceConfirm, type WholeLine } from '../../components/ui/WholeBalance';
import { decimalText } from '../../domain/decimal';
import { localDay } from '../../domain/dates';
import { can } from '../../domain/permissions';
import { itemAdmissible, sharesAdmissibleKind } from '../../domain/stock';
import { parseQty, type BaseUnit } from '../../domain/units';
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
import { docStatusLabel, ItemPicker, loadItemUnits, qtyColumns, rememberItems, runWithRef, unitOptions, scopedStores, StoreSelect, storesOf, VoidDocDialog, type StoreRef } from './stock-shared';

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

export function wholeLines(preview: TransferPreview): WholeLine[] {
  return preview.lines.filter((line) => line.wholeBalance).map((line) => ({ itemName: line.itemName, qty: line.qty, unit: line.baseUnit }));
}

function AddTransferLine({ docId, from, to, onAdded }: { docId: string; from: StoreRef; to: StoreRef; onAdded: () => void }) {
  const id = useId();
  const [item, setItem] = useState<ItemRow | null>(null);
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[] | null>(null);
  const [packsFailed, setPacksFailed] = useState<unknown>(null);
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const admits = useCallback((row: ItemRow) => itemAdmissible(from.kind, row.kind) && itemAdmissible(to.kind, row.kind), [from.kind, to.kind]);
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    loadItemUnits(item.id, true).then(
      (rows) => {
        if (!cancelled) setPacks(rows);
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
    inventory
      .addTransferLine(docId, { item_id: item.id, ...unit, qty_in_unit: decimalText(amount, 3) })
      .then(() => {
        setItem(null);
        setPacks(null);
        setQty({ text: '', unitId: 'base' });
        onAdded();
      }, setFailure)
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      <ItemPicker id={`${id}-item`} label={t('stock.col.item', 'المادّة')} value={item} onChange={setItem} filter={admits} />
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
  const refresh = () => {
    setPreview(null);
    setApproved(new Set());
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
    const outcome = await runWithRef(`transfer-post:${current.id}`, (ref) => inventory.postTransferDoc(ref, current.id, preview.version));
    setBusy(false);
    setConfirm(null);
    if (outcome.kind === 'failed') {
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
 * للعرض على الرفّ بس؛ اللقطة (المعامل والكمية بوحدة الأساس) يكتبها الخادم لحظة الرفع (E7).
 */
export interface ShelfLine {
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  itemUnitId: string | null;
  unitCode: string | null;
  unitLabel: string;
  qtyInUnit: string;
}

export interface ShelfPayload {
  from: string;
  to: string;
  day: string;
  note: string;
  /** الرأس بعد ما ارتفع (الإعادة بعد فشل بنصّ الطريق تكمل عليه، بلا رأس ثاني). مسوّدات قبل السطور: غايب. */
  docId?: string | null;
  /** السطور الباقية على الجهاز بترتيبها (اللي ارتفعت تنشال). مسوّدات قبل السطور: غايب. */
  lines?: ShelfLine[];
}

export interface ShelfDeps {
  /** المنشأة المؤكَّدة من الخادم (my_workspace)، أو null. */
  confirm: () => Promise<DraftStamp | null>;
  createTransferDraft: (from: string, to: string, day: string, note: string | null) => Promise<{ id: string }>;
  addTransferLine: (docId: string, fields: inventory.TransferLineFields) => Promise<unknown>;
  saveDeviceDraft: (stamp: DraftStamp, draft: { id: string; kind: 'transfer'; title: string; payload: ShelfPayload }) => Promise<unknown>;
  removeDeviceDraft: (id: string) => Promise<void>;
}

/**
 * رفع مسوّدة الجهاز (FOUNDATION ١٤٢، GT-29): بعد ما الخادم يؤكّد نفس المستخدم والمنشأة بس، الرأس بملاحظته ثم السطور بترتيبها، وبعد
 * كل خطوة الباقي ينحفظ على الجهاز (الرأس المرفوع والسطور الباقية)، ففشل بنصّ الطريق ما يضيّع سطراً ولا يكرّر رأساً: الإعادة تكمل
 * منه. بعد آخر سطر تنشال من الجهاز. يرجّع معرّف المسوّدة بالخادم.
 */
export async function uploadShelfDraft(draft: DeviceDraft<ShelfPayload>, deps: ShelfDeps): Promise<string> {
  assertSameStamp(draft, await deps.confirm());
  const stamp: DraftStamp = { userId: draft.userId, orgId: draft.orgId };
  let payload: ShelfPayload = { ...draft.payload, docId: draft.payload.docId ?? null, lines: [...(draft.payload.lines ?? [])] };
  const keep = () => deps.saveDeviceDraft(stamp, { id: draft.id, kind: 'transfer', title: draft.title, payload });
  let docId = payload.docId ?? null;
  if (!docId) {
    docId = (await deps.createTransferDraft(payload.from, payload.to, payload.day, payload.note.trim() || null)).id;
    payload = { ...payload, docId };
    await keep();
  }
  for (const line of payload.lines ?? []) {
    await deps.addTransferLine(docId, { item_id: line.itemId, item_unit_id: line.itemUnitId, unit_code: line.unitCode, qty_in_unit: line.qtyInUnit });
    payload = { ...payload, lines: (payload.lines ?? []).slice(1) };
    await keep();
  }
  await deps.removeDeviceDraft(draft.id);
  return docId;
}

/** رفّ مسوّدات الجهاز: لكاتبها ومنشأته بس، وترتفع بفعل صريح بعد تأكيد المنشأة من الخادم. */
function DeviceShelf({ userId, orgId, onUploaded }: { userId: string; orgId: string; onUploaded: (docId: string) => void }) {
  const stamp: DraftStamp = useMemo(() => ({ userId, orgId }), [userId, orgId]);
  const [drafts, setDrafts] = useState<DeviceDraft<ShelfPayload>[] | null>(null);
  const [shelfFailed, setShelfFailed] = useState<unknown>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listDeviceDrafts<ShelfPayload>(stamp, 'transfer').then(
      (rows) => {
        if (!cancelled) setDrafts(rows);
      },
      (error: unknown) => {
        if (!cancelled) setShelfFailed(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [stamp, tick]);
  if (shelfFailed) return <LoadFailed what={t('shelf.title', 'مسوّدات هذا الجهاز')} error={shelfFailed} onRetry={() => { setShelfFailed(null); setTick((n) => n + 1); }} />;
  if (!drafts || drafts.length === 0) return null;
  const upload = async (draft: DeviceDraft<ShelfPayload>) => {
    setBusy(draft.id);
    setFailure(null);
    try {
      const docId = await uploadShelfDraft(draft, {
        confirm: async () => {
          const confirmed = await workspaceRepo.loadMyWorkspace();
          return confirmed.kind === 'member' ? { userId: confirmed.workspace.userId, orgId: confirmed.workspace.orgId } : null;
        },
        createTransferDraft: inventory.createTransferDraft,
        addTransferLine: inventory.addTransferLine,
        saveDeviceDraft,
        removeDeviceDraft,
      });
      onUploaded(docId);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy('');
      setTick((n) => n + 1);
    }
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label={t('shelf.title', 'مسوّدات هذا الجهاز')}>
      <h2 className="font-semibold">{t('shelf.title', 'مسوّدات هذا الجهاز')}</h2>
      <p className="text-sm text-ink-muted">{t('shelf.detail.lines', 'كُتبت بلا اتصال، ولا يراها غيرك. ارفعها لتصير مسوّدة بالخادم بسطورها، ثم عاينها ورحّلها.')}</p>
      <ul className="flex flex-col gap-2">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex items-center justify-between gap-3">
            <span>
              {draft.title}
              <span className="ms-2 text-sm text-ink-muted">{t('shelf.lines', 'السطور الباقية: {count}', { count: fmtInt((draft.payload.lines ?? []).length) })}</span>
            </span>
            <Button size="sm" variant="secondary" busy={busy === draft.id} icon={<Upload aria-hidden="true" className="size-4" />} onClick={() => void upload(draft)} data-action="upload-device-draft">
              {t('shelf.upload', 'ارفع')}
            </Button>
          </li>
        ))}
      </ul>
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
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

/** سطور مسوّدة الجهاز بلا نت: المادّة من اللي ظهرت بالجلسة، والوحدة من المحفوظة (أو الأساس والطن). */
function DeviceLines({ from, to, lines, onChange }: { from: StoreRef; to: StoreRef; lines: readonly ShelfLine[]; onChange: (lines: ShelfLine[]) => void }) {
  const id = useId();
  const [item, setItem] = useState<ItemRow | null>(null);
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  const [failure, setFailure] = useState<unknown>(null);
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[]>([]);
  const admits = useCallback((row: ItemRow) => itemAdmissible(from.kind, row.kind) && itemAdmissible(to.kind, row.kind), [from.kind, to.kind]);
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    loadItemUnits(item.id, false).then((rows) => {
      if (!cancelled) setPacks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [item]);
  const units = item ? unitOptions(item, packs) : [];
  const add = () => {
    const amount = qty.text.trim() ? parseQty(qty.text) : null;
    const unit = units.find((option) => option.id === qty.unitId);
    if (!item || amount === null || amount <= 0n || !unit) {
      setFailure(new RejectedError('fields', t('transfer.line.fields', 'اختر المادّة واكتب كمية أكبر من صفر.')));
      return;
    }
    const code = qty.unitId.startsWith('code:') ? qty.unitId.slice('code:'.length) : null;
    const pack = qty.unitId !== 'base' && !code ? qty.unitId : null;
    onChange([...lines, { itemId: item.id, itemName: item.name, baseUnit: item.baseUnit, itemUnitId: pack, unitCode: code, unitLabel: unit.label, qtyInUnit: decimalText(amount, 3) }]);
    setItem(null);
    setQty({ text: '', unitId: 'base' });
    setFailure(null);
  };
  const columns: Column<ShelfLine & { key: string }>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    { key: 'entered', header: t('transfer.col.entered', 'كما كُتبت'), cell: (line) => fmtCounted(parseQty(line.qtyInUnit) ?? 0n, line.unitLabel) },
  ];
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <div className="flex flex-col gap-3">
      <DataTable caption={t('shelf.lines.caption', 'سطور المسوّدة على هذا الجهاز')} columns={columns} rows={lines.map((line, n) => ({ ...line, key: `${n}` }))} rowKey={(line) => line.key} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />
      <ItemPicker id={`${id}-item`} label={t('stock.col.item', 'المادّة')} value={item} onChange={setItem} filter={admits} offline />
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

function NewTransfer({ sources, all, stamp }: { sources: readonly StoreRef[]; all: readonly StoreRef[]; stamp: DraftStamp }) {
  const id = useId();
  const navigate = useNavigate();
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
    inventory.listItems({}).then(
      (page) => {
        if (!cancelled) rememberItems(page.rows);
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = day.trim() ? parseDayText(day) : localDay();
    if (!source || !target || !parsed) {
      setFailure(new RejectedError('fields', t('transfer.new.fields', 'اختر المخزن المرسِل والمستلم، والتاريخ يوم/شهر/سنة.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    if (!online) {
      const payload: ShelfPayload = { from: source.id, to: target.id, day: parsed, note, docId: null, lines };
      saveDeviceDraft<ShelfPayload>(stamp, { kind: 'transfer', title: t('shelf.transfer', 'تحويل من «{from}» إلى «{to}» بتاريخ {day}', { from: source.name, to: target.name, day: fmtDay(parsed) }), payload })
        .then(() => {
          setLines([]);
          toast({ tone: 'info', title: t('shelf.saved', 'حُفظت المسوّدة على هذا الجهاز؛ ارفعها حين يعود الاتصال.') });
        }, setFailure)
        .finally(() => setBusy(false));
      return;
    }
    inventory
      .createTransferDraft(source.id, target.id, parsed, note)
      .then((doc) => navigate(`/inventory/transfers/${doc.id}`), setFailure)
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
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
      {!online && source && target ? <DeviceLines from={source} to={target} lines={lines} onChange={setLines} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} data-action="new-transfer">
        {online ? t('transfer.new.create', 'أنشئ المسوّدة') : t('transfer.new.device', 'احفظها على هذا الجهاز')}
      </Button>
    </form>
  );
}

export function TransfersList() {
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const load = useCallback(() => inventory.listStockDocs('transfer'), []);
  const docs = useLoad(load);
  const setup = useLoad(inventory.loadOrgSetup);
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
      {allowed && workspace ? <DeviceShelf userId={workspace.userId} orgId={workspace.orgId} onUploaded={(docId) => navigate(`/inventory/transfers/${docId}`)} /> : null}
      {allowed && setup.error ? <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} /> : null}
      {allowed && setup.data && stamp ? <NewTransfer sources={sources} all={all} stamp={stamp} /> : null}
      {docs.error ? (
        <LoadFailed what={t('transfer.list.what', 'التحويلات')} error={docs.error} onRetry={docs.retry} />
      ) : docs.data ? (
        <DataTable caption={t('stock.transfers', 'التحويلات')} columns={columns} rows={docs.data} rowKey={(doc) => doc.id} empty={t('transfer.list.empty', 'لا تحويلات بعد.')} />
      ) : null}
    </div>
  );
}

export function TransferDoc() {
  const { id = '' } = useParams();
  return <TransferEditor key={id} docId={id} />;
}
