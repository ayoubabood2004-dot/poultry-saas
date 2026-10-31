import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { LotsPreview, creationReady, type CreatedLot } from '../../components/ui/LotsPreview';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { QtyInput, type QtyValue } from '../../components/ui/QtyInput';
import { ReviewDialog } from '../../components/ui/ReviewDialog';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { decimalText } from '../../domain/decimal';
import { localDay } from '../../domain/dates';
import type { Milli } from '../../domain/money';
import { can } from '../../domain/permissions';
import { itemAdmissible } from '../../domain/stock';
import { parseQty, toBase } from '../../domain/units';
import { parseDayText, parseMomentText } from '../../lib/dayText';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtMoney, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as inventory from '../../lib/repo/inventory';
import type { ItemRow, OpeningLine, OpeningPreview, StockDoc } from '../../lib/repo/inventory';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { canCopyDraft, CopiedNotice, CopyDraftAction, copyNext, docStatusLabel, ItemPicker, PageFooter, qtyColumns, readTime, runWithRef, unitOptions, scopedStores, StoreSelect, storeLabel, storesOf, useCopyDraft, useDocPages, useDraftIds, VoidDocDialog, type StoreRef, type VoidChoice } from './stock-shared';

// رصيد الافتتاح (الخطّة WP4، FOUNDATION ٥٤٨، DECISIONS القرار 15): المدير يكتب لكل مخزن مسوّدة بيوم التشغيل أو قبله، وسطورها
// بالكمية بوحدة الأساس والقيمة بمرتبتين (الصفر ويّا سببه بس، Q9؛ الانتهاء للمادّة اللي تتابعه، ووقت الفقس للأفراخ)، ثم معاينة
// الدفعات اللي راح تنخلق (LotsPreview) والموافقة سطراً سطراً، ثم تأكيد يسمّي المخزن والقيمة، والترحيل بمرجع ثابت. والإلغاء
// بسببه، والمسوّدة تنطوي بلا رقم ولا حركات. المعاينة والترحيل يحتاجان الشبكة: بلا نت زرّاهما معطّلان والسبب ظاهر (الخطّة WP4).

export function openingSentence(store: string, total: bigint, day: string): string {
  return t('opening.post.summary', 'الرصيد عند البداية لـ«{store}» بتاريخ {day}، بقيمة {total} دينار.', { store, day: fmtDay(day), total: fmtMoney(total) });
}

/**
 * جملة إلغاء الافتتاح (FOUNDATION ٧٦٦، مثل جملة التحويل): شنو يطلع من المخزن بالضبط، كل مادّة بكميتها، ثم شنو يصير بالدفعات.
 */
export function openingVoidSentence(store: string, lines: readonly Pick<OpeningLine, 'qty' | 'baseUnit' | 'itemName'>[]): string {
  const out = lines.map((line) => t('opening.void.line', '{qty} من «{item}»', { qty: fmtQty(line.qty, line.baseUnit).main, item: line.itemName })).join(t('list.separator', '، '));
  return t('opening.void.sentence', 'يخرج من «{store}»: {out}. تنعكس وجباته بتاريخ اليوم والأصل يبقى بيومه، وإن سُحب من وجبة منه رُفض الإلغاء باسم الورقة.', { store, out });
}

/** الدفعات اللي راح تنخلق من معاينة الخادم: مشكلة السطر جملته نفسها. */
export function createdLots(preview: OpeningPreview): CreatedLot[] {
  return preview.lines.map((line) => ({
    lineId: line.lineId,
    itemName: line.itemName,
    unit: line.baseUnit,
    qty: line.qty,
    expiryOn: line.expiryOn,
    value: line.value,
    problem: line.problem?.hint ?? null,
  }));
}

/** زرّ الترحيل: معاينة جاهزة بلا مشكلة، وكل سطر انوافق عليه، والشبكة موجودة (الترحيل ما يدخل الطابور، FOUNDATION ٢٠١). */
export function openingPostReady(preview: OpeningPreview, approved: ReadonlySet<string>, online: boolean): boolean {
  return online && preview.ready && preview.problems.length === 0 && creationReady(createdLots(preview), approved);
}

export function OpeningLinesTable({ lines, onDelete }: { lines: readonly OpeningLine[]; onDelete: ((line: OpeningLine) => void) | null }) {
  const columns: Column<OpeningLine>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    ...qtyColumns(lines, (line) => line.qty, (unit) => t('stock.col.qty_in', 'الكمية ({unit})', { unit })),
    { key: 'value', header: t('stock.col.line_value', 'القيمة'), kind: 'number', cell: (line) => (line.value === null ? '—' : <Num>{fmtMoney(line.value)}</Num>) },
    { key: 'expiry', header: t('stock.lot.expiry', 'الانتهاء'), cell: (line) => (line.expiryOn ? fmtDay(line.expiryOn) : '—') },
    { key: 'reason', header: t('opening.zero_reason', 'سبب الصفر'), wrap: true, cell: (line) => line.zeroReason ?? '—' },
  ];
  if (onDelete) {
    columns.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <IconButton label={t('opening.line.delete', 'احذف السطر')} onClick={() => onDelete(line)} data-action="delete-line">
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      ),
    });
  }
  return <DataTable caption={t('opening.lines', 'سطور الرصيد عند البداية')} columns={columns} rows={lines} rowKey={(line) => line.id} empty={t('opening.lines.empty', 'لا سطور بعد.')} />;
}

function OpeningEditor({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const copier = useCopyDraft('opening', docId);
  const load = useCallback(() => inventory.loadStockDoc('opening', docId), [docId]);
  const [tick, setTick] = useState(0);
  const doc = useLoad(load, `${docId}#${tick}`);
  const setup = useLoad(inventory.loadOrgSetup);
  const [preview, setPreview] = useState<OpeningPreview | null>(null);
  const [approved, setApproved] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<'discard' | 'void' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const closeReview = () => {
    setPreview(null);
    setApproved(new Set());
  };
  const refresh = () => {
    closeReview();
    setTick((n) => n + 1);
  };
  if (doc.error) return <LoadFailed what={t('opening.what', 'ورقة الرصيد عند البداية')} error={doc.error} onRetry={doc.retry} />;
  if (setup.error) return <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />;
  if (!doc.data || !setup.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const current: StockDoc = doc.data.doc;
  const lines = doc.data.openingLines;
  const store = storesOf(setup.data).find((s) => s.id === current.warehouseId);
  const draft = current.status === 'draft';
  const failed = failure ? describeError(failure) : null;
  const total = preview?.total ?? lines.reduce((sum, line) => sum + (line.value ?? 0n), 0n);
  const runPreview = () => {
    setBusy(true);
    setFailure(null);
    inventory
      .previewOpening(current.id)
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
    const outcome = await runWithRef(`opening-post:${current.id}`, (ref) => inventory.postOpening(ref, current.id, preview.version));
    setBusy(false);
    setConfirm(null);
    if (outcome.kind === 'failed') setFailure(outcome.error);
    else {
      toast({ tone: 'success', title: outcome.kind === 'recorded' ? t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') : t('opening.posted', 'حُفظ الرصيد عند البداية نهائياً') });
      refresh();
    }
  };
  const discard = () => {
    setBusy(true);
    inventory
      .discardDraft('opening', current.id, preview?.version ?? current.version)
      .then(() => navigate('/inventory/openings'), setFailure)
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const canCopy = canCopyDraft(workspace, 'opening', store);
  const copyNextStep = copyNext(workspace, 'opening');
  const copyFrom = t('opening.title', 'الرصيد عند البداية لـ«{store}»', { store: store?.name ?? '—' });
  const voidDoc = async (reason: string, choice: VoidChoice) => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`opening-void:${current.id}`, (ref) => inventory.voidOpening(ref, current.id, reason));
    if (outcome.kind === 'failed') {
      setBusy(false);
      setFailure(outcome.error);
      return;
    }
    // «ألغِ وافتح نسخة للتصحيح»: الإلغاء تمّ، والنسخة تنفتح؛ فشلها يبقى على هذه الصفحة ويّا «افتح نسخة للتصحيح».
    if (choice === 'copy' && (await copier.copy(copyFrom))) return;
    setBusy(false);
    setConfirm(null);
    refresh();
  };
  const deleteLine = (line: OpeningLine) => {
    setBusy(true);
    inventory
      .deleteDraftLine('opening', line.id, preview?.version ?? current.version)
      .then(refresh, setFailure)
      .finally(() => setBusy(false));
  };
  const storeName = store ? storeLabel(store) : '—';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('opening.title', 'الرصيد عند البداية لـ«{store}»', { store: store?.name ?? '—' })}
        subtitle={t('opening.subtitle', '{status} — بتاريخ {day}', { status: docStatusLabel(current.status), day: fmtDay(current.onDate) })}
        actions={
          <Link to="/inventory/openings" className="text-sm font-medium text-brand-700 dark:text-brand-200">
            {t('opening.back', 'كل أوراق الرصيد عند البداية')}
          </Link>
        }
      />
      <CopiedNotice draft={draft} next={copyNextStep} />
      {current.voidReason ? <Notice tone="warning" title={t('opening.voided', 'أُلغي هذا الرصيد')}>{current.voidReason}</Notice> : null}
      <OpeningLinesTable lines={lines} onDelete={draft ? deleteLine : null} />
      {draft && store ? (
        <AddLineFormFor
          store={store}
          docId={current.id}
          onAdded={async () => {
            refresh();
          }}
        />
      ) : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {draft ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button busy={busy && !preview} onClick={runPreview} disabled={!online} data-action="preview-opening">
              {t('opening.preview', 'راجع واحفظ')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm('discard')} data-action="discard-opening">
              {t('opening.discard', 'احذف الورقة')}
            </Button>
          </div>
          {!online ? <Notice tone="warning" title={t('transfer.offline', 'الحفظ النهائي يحتاج اتصالاً بالإنترنت؛ الورقة باقية حتى يعود الاتصال.')} /> : null}
          <ReviewDialog
            open={preview !== null}
            title={t('opening.post.title', 'راجع الرصيد عند البداية لـ«{store}»', { store: store?.name ?? '—' })}
            ready={preview !== null && openingPostReady(preview, approved, online)}
            busy={busy}
            action="post-opening"
            onSave={() => void post()}
            onClose={closeReview}
          >
            {preview ? (
              <>
                <p className="font-medium">{openingSentence(storeName, total, current.onDate)}</p>
                {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
                {preview.problems.map((problem) => (
                  <Notice key={problem.code} tone="danger" title={problem.hint} />
                ))}
                <LotsPreview
                  lots={createdLots(preview)}
                  approved={approved}
                  onToggle={(lineId, on) => {
                    const next = new Set(approved);
                    if (on) next.add(lineId);
                    else next.delete(lineId);
                    setApproved(next);
                  }}
                />
              </>
            ) : null}
          </ReviewDialog>
        </div>
      ) : current.status === 'posted' ? (
        <Button variant="danger" onClick={() => setConfirm('void')} data-action="void-opening">
          {t('opening.void', 'ألغِ الرصيد عند البداية')}
        </Button>
      ) : current.status === 'void' && current.posted && canCopy ? (
        <CopyDraftAction copier={copier} from={copyFrom} next={copyNextStep} />
      ) : null}
      <ConfirmDialog
        open={confirm === 'discard'}
        title={t('opening.discard.title', 'احذف ورقة الرصيد عند البداية لـ«{store}»', { store: store?.name ?? '—' })}
        consequence={t('opening.discard.consequence', 'تُلغى الورقة بلا رقم ولا حركات، ولا ترجع.')}
        confirmLabel={t('opening.discard', 'احذف الورقة')}
        busy={busy}
        action="confirm-discard-opening"
        onConfirm={discard}
        onCancel={() => setConfirm(null)}
      />
      {confirm === 'void' ? (
        <VoidDocDialog
          title={t('opening.void.title', 'ألغِ الرصيد عند البداية لـ«{store}»', { store: store?.name ?? '—' })}
          consequence={openingVoidSentence(store?.name ?? '—', lines)}
          busy={busy}
          failure={failure}
          choose={canCopy}
          onConfirm={(reason, choice) => void voidDoc(reason, choice)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function AddLineFormFor({ store, docId, onAdded }: { store: StoreRef; docId: string; onAdded: () => Promise<void> }) {
  const id = useId();
  const [item, setItem] = useState<ItemRow | null>(null);
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  const [packs, setPacks] = useState<readonly inventory.ItemUnitRow[] | null>(null);
  const [packsFailed, setPacksFailed] = useState<unknown>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('');
  const [born, setBorn] = useState('');
  // معرّف السطر يولد بالجهاز (مراجعة WP8): الإعادة بعد جواب ضاع 23505 = انكتب، مو سطر ثاني يضاعف الكمية والقيمة.
  const [lineId, setLineId] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const admits = useCallback((row: ItemRow) => itemAdmissible(store.kind, row.kind), [store.kind]);
  const amount = parseMoneyText(value, false);
  // مادّة ثانية تبدأ من وحداتها هي وكمية وانتهاء ووقت فقس فارغة: كانت تنرسل بوحدة تعبئة المادّة السابقة وانتهائها المخفي
  // (مراجعة WP4 الثانية).
  const pickItem = (next: ItemRow | null) => {
    setLineId(crypto.randomUUID());
    setItem(next);
    setPacks(null);
    setPacksFailed(null);
    setQty({ text: '', unitId: 'base' });
    setExpiry('');
    setBorn('');
  };
  const bornAt = born.trim() ? parseMomentText(born) : null;
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    inventory.listItemUnits(item.id).then(
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
  const units = item ? unitOptions(item, packs ?? []) : [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entered = qty.text.trim() ? parseQty(qty.text) : null;
    const unit = units.find((option) => option.id === qty.unitId);
    const converted = item && entered !== null && unit ? toBase(entered, unit.factor, item.baseUnit) : null;
    const quantity: Milli | null = converted?.ok ? converted.qty : null;
    const expiryDay = expiry.trim() ? parseDayText(expiry) : null;
    if (item?.kind === 'chick' && born.trim() && !bornAt) {
      setFailure(new RejectedError('fields', t('opening.born.invalid', 'اكتب وقت الفقس يوم/شهر/سنة ثم الساعة والدقيقة، مثل 28/10/2026 06:00.')));
      return;
    }
    if (!item || quantity === null || quantity <= 0n || amount === null || (amount === 0n && !reason.trim()) || (expiry.trim() && !expiryDay)) {
      setFailure(new RejectedError('fields', t('opening.line.fields', 'اختر المادّة واكتب الكمية والقيمة (الصفر مع سببه)، والتاريخ يوم/شهر/سنة.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    const fields = {
      item_id: item.id,
      qty_base: decimalText(quantity, 3),
      value: decimalText(amount, 2),
      zero_reason: amount === 0n ? reason.trim() : null,
      expiry_on: expiryDay,
      born_at: item.kind === 'chick' ? (bornAt?.iso ?? null) : null,
    };
    inventory
      .addOpeningLine(docId, fields, lineId)
      .catch((error: unknown) => {
        // محاولة سابقة بنفس المعرّف وصلت وضاع جوابها: نفس السطر بآخر قيم.
        if (inventory.isDuplicate(error)) return inventory.updateOpeningLine(lineId, fields);
        throw error;
      })
      .then(
        async () => {
          pickItem(null);
          setValue('');
          setReason('');
          await onAdded();
        },
        (error: unknown) => {
          // رفض أكيد: سطر جديد بمعرّف جديد؛ ونتيجة مجهولة: المعرّف يبقى فالإعادة نفس السطر (قراءة المستند هنا كانت تطوي النموذج ومعرّفه).
          if (error instanceof RejectedError) setLineId(crypto.randomUUID());
          setFailure(error);
        },
      )
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      <ItemPicker id={`${id}-item`} label={t('stock.col.item', 'المادّة')} value={item} onChange={pickItem} filter={admits} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {item && packs ? <QtyInput id={`${id}-qty`} label={t('stock.col.qty', 'الكمية')} base={item.baseUnit} units={units} value={qty} onChange={setQty} /> : <p className="text-sm text-ink-muted">{t('opening.qty.pick', 'اختر المادّة أوّلاً ثم اكتب كميتها.')}</p>}
        <MoneyInput id={`${id}-value`} label={t('opening.value', 'القيمة (دينار)')} value={value} onChange={setValue} whole={false} />
      </div>
      {amount === 0n ? (
        <Field id={`${id}-reason`} label={t('opening.zero_reason', 'سبب الصفر')}>
          <input id={`${id}-reason`} className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      ) : null}
      {item?.tracksExpiry ? (
        <Field id={`${id}-expiry`} label={t('opening.expiry', 'تاريخ الانتهاء (يوم/شهر/سنة)')}>
          <input id={`${id}-expiry`} className="input" dir="ltr" inputMode="numeric" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
        </Field>
      ) : null}
      {item?.kind === 'chick' ? (
        <Field
          id={`${id}-born`}
          label={t('opening.born', 'وقت الفقس (يوم/شهر/سنة ساعة:دقيقة)')}
          hint={bornAt ? t('opening.born.read', 'يُقرأ: {day} الساعة {time}', { day: fmtDay(bornAt.day), time: readTime(bornAt.iso) }) : t('opening.born.hint', 'مثل 28/10/2026 06:00')}
        >
          <input id={`${id}-born`} className="input" dir="ltr" value={born} onChange={(event) => setBorn(event.target.value)} />
        </Field>
      ) : null}
      {packsFailed ? <LoadFailed what={t('transfer.units.what', 'وحدات المادّة')} error={packsFailed} onRetry={() => { setPacksFailed(null); setItem(item ? { ...item } : null); }} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} icon={<Plus aria-hidden="true" className="size-4" />} data-action="add-opening-line">
        {t('opening.line.add', 'أضف السطر')}
      </Button>
    </form>
  );
}

function NewOpening({ stores }: { stores: readonly StoreRef[] }) {
  const id = useId();
  const navigate = useNavigate();
  const draftIds = useDraftIds();
  const [store, setStore] = useState('');
  const [day, setDay] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseDayText(day);
    if (!store || !parsed) {
      setFailure(new RejectedError('fields', t('opening.new.fields', 'اختر المخزن واكتب التاريخ يوم/شهر/سنة (يوم التشغيل أو قبله).')));
      return;
    }
    // معرّف الجهاز لقيم النموذج (مراجعة WP8): الإعادة بعد جواب ضاع تفتح نفس المسوّدة بدل ثانية فارغة.
    const values = JSON.stringify([store, parsed]);
    const docId = draftIds.idFor(values);
    setBusy(true);
    setFailure(null);
    inventory
      .createOpeningDraft(store, parsed, docId)
      .then(
        (doc) => navigate(`/inventory/openings/${doc.id}`),
        (error: unknown) => {
          if (inventory.isDuplicate(error)) navigate(`/inventory/openings/${docId}`);
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
      <h2 className="font-semibold">{t('opening.new', 'رصيد عند البداية لمخزن')}</h2>
      <StoreSelect id={`${id}-store`} label={t('stock.store', 'المخزن')} stores={stores.filter((s) => !s.archived)} value={store} onChange={setStore} />
      <Field id={`${id}-day`} label={t('opening.day', 'التاريخ (يوم/شهر/سنة)')} hint={t('opening.day.hint', 'يوم تشغيل الوحدة أو قبله، مثل {day}.', { day: fmtDay(localDay()) })}>
        <input id={`${id}-day`} className="input" dir="ltr" inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
      </Field>
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} data-action="new-opening">
        {t('opening.new.create', 'ابدأ')}
      </Button>
    </form>
  );
}

export function OpeningsList() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const docs = useDocPages('opening');
  const setup = useLoad(inventory.loadOrgSetup);
  const stores = setup.data ? scopedStores(storesOf(setup.data), workspace) : [];
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const allowed = workspace ? can(workspace.role, 'opening.post') : false;
  const columns: Column<StockDoc>[] = [
    { key: 'store', header: t('stock.store', 'المخزن'), cell: (doc) => <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/openings/${doc.id}`}>{names.get(doc.warehouseId) ?? '—'}</Link> },
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (doc) => fmtDay(doc.onDate) },
    { key: 'status', header: t('stock.doc.status', 'الحالة'), cell: (doc) => docStatusLabel(doc.status) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('stock.openings', 'الرصيد عند البداية')} subtitle={t('opening.list.subtitle', 'مستند لكل مخزن بيوم تشغيل وحدته أو قبله.')} />
      {!allowed ? <Notice tone="info" title={t('opening.forbidden', 'الرصيد عند البداية للمدير ومالك المنشأة.')} /> : null}
      {allowed && setup.error ? <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} /> : null}
      {allowed && setup.data ? <NewOpening stores={stores} /> : null}
      {docs.first.error ? (
        <LoadFailed what={t('opening.list.what', 'أوراق الرصيد عند البداية')} error={docs.first.error} onRetry={docs.first.retry} />
      ) : docs.first.data ? (
        <>
          <DataTable caption={t('stock.openings', 'الرصيد عند البداية')} columns={columns} rows={docs.rows} rowKey={(doc) => doc.id} empty={t('opening.list.empty', 'لا أوراق رصيد عند البداية بعد.')} />
          <PageFooter shown={docs.rows.length} total={docs.total} next={docs.next !== null} busy={docs.more.busy} error={docs.more.error} what={t('opening.list.what', 'أوراق الرصيد عند البداية')} onMore={docs.loadMore} action="more-openings" />
        </>
      ) : null}
    </div>
  );
}

export function OpeningDoc() {
  const { id = '' } = useParams();
  return <OpeningEditor key={id} docId={id} />;
}
