import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { localDay } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import * as purchasing from '../../lib/repo/purchasing';
import type { ReceiptDoc, ReceiptLine, ReceiptRevaluation, RevaluePreview, SupplierReturnDoc } from '../../lib/repo/purchasing';
import { useLoad } from '../../lib/useLoad';
import { AmountField, parseDinar } from './purchase-shared';
import { docStatusLabel, qtyColumns, runWithRef, useDraftIds, VoidDocDialog } from './stock-shared';

// صفحة الاستلام المرحَّل (الخطّة WP7، FOUNDATION ٥٥٢–٥٥٣، E47): مرتجعات الاستلام و«مرتجع جديد» لمن عنده receipt.draft؛ وتصحيح سعر
// الشراء للمدير بس (receipt.revalue، مخفي لغيره): المبلغ الجديد وسببه ← معاينة العائلة (دفعة السطر ومراياها) وحصصها و«فرق سعر شراء»
// وقيد المورّد ← تأكيد يسمّي الاستلام والسطر ← ترحيل بمرجع ثابت؛ وسجلّ تصحيحات الاستلام بإلغائها.

const day = (iso: string): string => fmtDay(localDay(new Date(iso)));

/** مرتجعات الاستلام (رقمها وحالتها وتاريخها)، و«مرتجع جديد» لمسوّدة بمعرّف الجهاز (الإعادة بعد جواب ضاع 23505 = انكتبت فتنفتح). */
export function ReceiptReturnsPanel({ receipt, canDraft }: { receipt: ReceiptDoc; canDraft: boolean }) {
  const id = useId();
  const navigate = useNavigate();
  const load = useCallback(() => purchasing.listReceiptReturns(receipt.id), [receipt.id]);
  const returns = useLoad(load, receipt.id);
  const draftIds = useDraftIds();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const create = () => {
    const today = localDay();
    const values = JSON.stringify([receipt.id, today]);
    const docId = draftIds.idFor(values);
    setBusy(true);
    setFailure(null);
    purchasing
      .createSupplierReturnDraft(docId, receipt.id, today)
      .then(
        (doc) => navigate(`/inventory/supplier-returns/${doc.id}`),
        (error: unknown) => {
          if (inventory.isDuplicate(error)) navigate(`/inventory/supplier-returns/${docId}`);
          else {
            if (error instanceof RejectedError) draftIds.forget(values);
            setFailure(error);
          }
        },
      )
      .finally(() => setBusy(false));
  };
  const columns: Column<SupplierReturnDoc>[] = [
    {
      key: 'no',
      header: t('ledger.doc', 'المستند'),
      cell: (doc) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/supplier-returns/${doc.id}`} data-action="open-return">
          {doc.docNo ? <bdi dir="ltr">{doc.docNo}</bdi> : docStatusLabel(doc.status)}
        </Link>
      ),
    },
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (doc) => fmtDay(doc.onDate) },
    { key: 'status', header: t('stock.doc.status', 'الحالة'), cell: (doc) => docStatusLabel(doc.status) },
  ];
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">{t('return.section', 'المرتجع إلى المورّد')}</h2>
      {returns.error ? (
        <LoadFailed what={t('return.list.what', 'مرتجعات هذا الاستلام')} error={returns.error} onRetry={returns.retry} />
      ) : returns.data ? (
        <DataTable caption={t('return.list', 'مرتجعات هذا الاستلام')} columns={columns} rows={returns.data} rowKey={(doc) => doc.id} empty={t('return.list.empty', 'لا مرتجع من هذا الاستلام.')} />
      ) : (
        <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>
      )}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {canDraft && receipt.status === 'posted' ? (
        <Button variant="secondary" busy={busy} onClick={create} data-action="new-return">
          {t('return.new', 'مرتجع جديد من هذا الاستلام')}
        </Button>
      ) : null}
    </section>
  );
}

/** المبلغ الحالي للسطر: آخر تصحيح غير ملغى، وإلا مبلغه كما بالفاتورة. */
export function currentLineTotal(lineId: string, lineTotal: Fils | null, history: readonly ReceiptRevaluation[]): Fils | null {
  const live = history.filter((row) => row.receiptLineId === lineId && row.status === 'posted');
  return live.at(-1)?.newTotal ?? lineTotal;
}

/** معاينة التصحيح: دفعة السطر ومراياها وحصصها، وحصّة المتبقّي و«فرق سعر شراء» وقيد المورّد. */
export function RevaluePreviewPanel({ preview }: { preview: RevaluePreview }) {
  const rows = preview.family.map((lot) => ({ ...lot, baseUnit: preview.baseUnit }));
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'store', header: t('revalue.col.store', 'المخزن'), cell: (lot) => lot.warehouseName },
    ...qtyColumns(rows, (lot) => lot.qtyLeft, (unit) => t('revalue.col.left', 'المتبقّي ({unit})', { unit })),
    { key: 'value', header: t('revalue.col.value', 'قيمة المتبقّي'), kind: 'number', cell: (lot) => <MoneyText amount={lot.valueLeft} /> },
    { key: 'share', header: t('revalue.col.share', 'حصّته من الفرق'), kind: 'number', cell: (lot) => <MoneyText amount={lot.share} /> },
  ];
  return (
    <div className="flex flex-col gap-3">
      {preview.problems.map((problem, i) => (
        <Notice key={`problem-${i}`} tone="danger" title={problem.hint} />
      ))}
      <DataTable caption={t('revalue.family', 'دفعة السطر ومراياها')} columns={columns} rows={rows} rowKey={(lot) => lot.lotId} empty={t('revalue.family.empty', 'لم يبقَ من دفعة السطر شيء؛ الفرق كلّه مصروف.')} />
      <ul className="flex flex-col gap-1 text-sm">
        {preview.diff !== null ? (
          <li>
            {t('revalue.diff', 'الفرق')}: <MoneyText amount={preview.diff} decimals={0} />
          </li>
        ) : null}
        {preview.lotShare !== null ? (
          <li>
            {t('revalue.lot_share', 'يدخل الدفعات المتبقّية')}: <MoneyText amount={preview.lotShare} />
          </li>
        ) : null}
        {preview.expenseAmount !== null ? (
          <li>
            {t('revalue.expense', 'مصروف «فرق سعر شراء» (حصّة المسحوب)')}: <MoneyText amount={preview.expenseAmount} />
          </li>
        ) : null}
        {preview.supplierAdjustment !== null ? (
          <li>
            {t('revalue.adjustment', 'قيد تسوية المورّد')}: <MoneyText amount={preview.supplierAdjustment} decimals={0} />
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** نموذج تصحيح سطر: المبلغ الجديد وسببه، والمعاينة، والتأكيد يسمّي الاستلام والسطر وما ينكتب. */
function RevalueForm({ receipt, line, current, onDone, onCancel }: { receipt: ReceiptDoc; line: ReceiptLine; current: Fils | null; onDone: () => void; onCancel: () => void }) {
  const id = useId();
  const [total, setTotal] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<RevaluePreview | null>(null);
  const [seen, setSeen] = useState<Fils | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const amount = parseDinar(total);
  const runPreview = () => {
    if (amount === null) {
      setFailure(new RejectedError('fields', t('revalue.total.invalid', 'اكتب المبلغ الجديد للسطر بالدينار الصحيح.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    purchasing
      .previewReceiptRevalue(line.id, amount)
      .then((next) => {
        setPreview(next);
        setSeen(amount);
      }, setFailure)
      .finally(() => setBusy(false));
  };
  const post = async () => {
    if (!preview || seen === null || preview.plan === null) return;
    const plan = preview.plan;
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`receipt-revalue:${line.id}:${seen}:${plan}`, (ref) => purchasing.postReceiptRevalue(ref, line.id, seen, plan, reason.trim()));
    setBusy(false);
    setConfirm(false);
    if (outcome.kind === 'failed') {
      // الدفعات تغيّرت بعد المعاينة: معاينة جديدة بدل زرّ يعيد نفس القسمة القديمة للأبد.
      if (outcome.error instanceof RejectedError && outcome.error.code === 'stale_preview') runPreview();
      setFailure(outcome.error);
      return;
    }
    if (outcome.kind === 'done') toast({ tone: 'success', title: t('revalue.posted', 'رُحّل تصحيح سعر «{item}»', { item: line.itemName }) });
    else toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') });
    onDone();
  };
  // المعاينة لمبلغ غير اللي بالحقل الآن ما تنرحّل: يعاين من جديد.
  const fresh = preview !== null && seen !== null && amount === seen;
  const ready = fresh && preview.ready && preview.problems.length === 0 && reason.trim() !== '';
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-3" data-action="revalue-form">
      <p className="font-medium">
        {t('revalue.form.title', 'تصحيح سعر «{item}» في الاستلام {no}', { item: line.itemName, no: receipt.docNo ?? '' })}
      </p>
      {current !== null ? (
        <p className="text-sm text-ink-muted">
          {t('revalue.current', 'المبلغ الحالي للسطر')}: <MoneyText amount={current} decimals={0} />
        </p>
      ) : null}
      <AmountField id={`${id}-total`} label={t('revalue.total', 'المبلغ الصحيح للسطر كلّه')} value={total} onChange={setTotal} hint={t('revalue.total.hint', 'كما يجب أن يكون في الفاتورة، بالدينار الصحيح.')} />
      <Field id={`${id}-reason`} label={t('revalue.reason', 'سبب التصحيح')}>
        <input id={`${id}-reason`} className="input" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} data-action="revalue-reason" />
      </Field>
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" busy={busy && !confirm} disabled={amount === null} onClick={runPreview} data-action="preview-revalue">
          {t('revalue.preview', 'عاين التصحيح')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel} data-action="cancel-revalue">
          {t('revalue.cancel', 'أغلق')}
        </Button>
      </div>
      {preview && fresh ? <RevaluePreviewPanel preview={preview} /> : null}
      {preview && !fresh ? <Notice tone="warning" title={t('revalue.stale', 'تغيّر المبلغ بعد المعاينة؛ عاين من جديد قبل الترحيل.')} /> : null}
      {preview && fresh && reason.trim() === '' ? <Notice tone="info" title={t('revalue.reason_required', 'اكتب سبب التصحيح قبل الترحيل.')} /> : null}
      {preview && fresh ? (
        <Button disabled={!ready} busy={busy && confirm} onClick={() => setConfirm(true)} data-action="post-revalue">
          {t('revalue.post', 'رحّل التصحيح')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirm && preview !== null}
        title={t('revalue.confirm.title', 'صحّح سعر «{item}» في الاستلام {no}', { item: line.itemName, no: receipt.docNo ?? '' })}
        consequence={
          preview ? (
            <div className="flex flex-col gap-2">
              <p>
                {t('revalue.confirm.lead', 'يتصحّح مبلغ سطر «{item}» في الاستلام {no}، ولا يُعاد تسعير ما رُحّل بعده من مستندات:', { item: line.itemName, no: receipt.docNo ?? '' })}
              </p>
              <ul className="list-disc ps-6">
                {preview.currentTotal !== null ? (
                  <li>
                    {t('revalue.current', 'المبلغ الحالي للسطر')}: <MoneyText amount={preview.currentTotal} decimals={0} />
                  </li>
                ) : null}
                {seen !== null ? (
                  <li>
                    {t('revalue.total', 'المبلغ الصحيح للسطر كلّه')}: <MoneyText amount={seen} decimals={0} />
                  </li>
                ) : null}
                {preview.lotShare !== null ? (
                  <li>
                    {t('revalue.lot_share', 'يدخل الدفعات المتبقّية')}: <MoneyText amount={preview.lotShare} />
                  </li>
                ) : null}
                {preview.expenseAmount !== null ? (
                  <li>
                    {t('revalue.expense', 'مصروف «فرق سعر شراء» (حصّة المسحوب)')}: <MoneyText amount={preview.expenseAmount} />
                  </li>
                ) : null}
                {preview.supplierAdjustment !== null ? (
                  <li>
                    {t('revalue.adjustment', 'قيد تسوية المورّد')}: <MoneyText amount={preview.supplierAdjustment} decimals={0} />
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null
        }
        confirmLabel={t('revalue.post', 'رحّل التصحيح')}
        tone="primary"
        busy={busy}
        action="confirm-revalue"
        onConfirm={() => void post()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

/** تصحيح سعر الشراء (المدير والمالك بس): سطور الاستلام بمبلغها الحالي، والنموذج لسطر، وسجلّ التصحيحات بإلغائها. */
export function PriceCorrectionPanel({ receipt, lines, totals }: { receipt: ReceiptDoc; lines: readonly ReceiptLine[]; totals: ReadonlyMap<string, Fils> }) {
  const id = useId();
  const [tick, setTick] = useState(0);
  // آخر قراءة ناجحة تبقى وهي تقرا من جديد (useLoad يرجّع null فالمبلغ الحالي كان يرجع لمبلغ الفاتورة)، و«—» قبل أوّل قراءة.
  const [history, setHistory] = useState<{ key: string; rows: ReceiptRevaluation[] | null; error: unknown }>({ key: '', rows: null, error: null });
  useEffect(() => {
    let cancelled = false;
    purchasing.listLineRevaluations(receipt.id).then(
      (rows) => {
        if (!cancelled) setHistory({ key: receipt.id, rows, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setHistory((prev) => ({ key: receipt.id, rows: prev.key === receipt.id ? prev.rows : null, error }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [receipt.id, tick]);
  const known = history.key === receipt.id ? history.rows : null;
  const historyError = history.key === receipt.id ? history.error : null;
  const [open, setOpen] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<ReceiptRevaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const rows = known ?? [];
  const names = new Map(lines.map((line) => [line.id, line.itemName]));
  const opened = lines.find((line) => line.id === open) ?? null;
  const voidRevaluation = async (reason: string) => {
    if (!voiding) return;
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`receipt-revalue-void:${voiding.id}`, (ref) => purchasing.voidReceiptRevalue(ref, voiding.id, reason));
    setBusy(false);
    if (outcome.kind === 'failed') {
      setFailure(outcome.error);
      return;
    }
    setVoiding(null);
    setTick((n) => n + 1);
  };
  const lineColumns: Column<ReceiptLine>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    {
      key: 'current',
      header: t('revalue.col.current', 'المبلغ الحالي'),
      kind: 'number',
      cell: (line) => {
        const value = known === null ? null : currentLineTotal(line.id, totals.get(line.id) ?? null, known);
        return value === null ? '—' : <MoneyText amount={value} decimals={0} />;
      },
    },
    {
      key: 'action',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <Button size="sm" variant="ghost" disabled={open === line.id} onClick={() => setOpen(line.id)} data-action="open-revalue">
          {t('revalue.open', 'صحّح السعر')}
        </Button>
      ),
    },
  ];
  const historyColumns: Column<ReceiptRevaluation>[] = [
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (row) => day(row.postedAt ?? row.createdAt) },
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (row) => names.get(row.receiptLineId) ?? '—' },
    { key: 'old', header: t('revalue.col.old', 'من'), kind: 'number', cell: (row) => <MoneyText amount={row.oldTotal} decimals={0} /> },
    { key: 'new', header: t('revalue.col.new', 'إلى'), kind: 'number', cell: (row) => <MoneyText amount={row.newTotal} decimals={0} /> },
    { key: 'share', header: t('revalue.lot_share', 'يدخل الدفعات المتبقّية'), kind: 'number', cell: (row) => <MoneyText amount={row.lotShare} /> },
    { key: 'expense', header: t('revalue.col.expense', 'فرق سعر شراء'), kind: 'number', cell: (row) => <MoneyText amount={row.expenseAmount} /> },
    { key: 'reason', header: t('revalue.reason', 'سبب التصحيح'), cell: (row) => row.reason },
    { key: 'status', header: t('stock.doc.status', 'الحالة'), cell: (row) => (row.status === 'posted' ? t('revalue.status.posted', 'مرحَّل') : t('revalue.status.void', 'ملغى')) },
    {
      key: 'action',
      header: t('org.col.actions', 'إجراءات'),
      cell: (row) =>
        row.status === 'posted' ? (
          <Button size="sm" variant="ghost" onClick={() => setVoiding(row)} data-action="void-revalue">
            {t('revalue.void', 'ألغِ التصحيح')}
          </Button>
        ) : (
          '—'
        ),
    },
  ];
  const failed = failure ? describeError(failure) : null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">{t('revalue.section', 'تصحيح سعر الشراء')}</h2>
      <p className="text-sm text-ink-muted">{t('revalue.section.hint', 'للمدير بعد ما انسحب من الدفعة: حصّة المتبقّي من الفرق تدخل الدفعات، وحصّة المسحوب مصروف «فرق سعر شراء»، والمستندات المرحّلة لا يُعاد تسعيرها.')}</p>
      <DataTable caption={t('receipt.lines', 'سطور الاستلام')} columns={lineColumns} rows={lines} rowKey={(line) => line.id} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />
      {opened ? (
        <RevalueForm
          key={opened.id}
          receipt={receipt}
          line={opened}
          current={known === null ? null : currentLineTotal(opened.id, totals.get(opened.id) ?? null, known)}
          onDone={() => {
            setOpen(null);
            setTick((n) => n + 1);
          }}
          onCancel={() => setOpen(null)}
        />
      ) : null}
      {historyError ? <LoadFailed what={t('revalue.history.what', 'تصحيحات هذا الاستلام')} error={historyError} onRetry={() => setTick((n) => n + 1)} /> : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {rows.length > 0 ? <DataTable caption={t('revalue.history', 'تصحيحات هذا الاستلام')} columns={historyColumns} rows={rows} rowKey={(row) => row.id} empty="—" /> : null}
      {voiding ? (
        <VoidDocDialog
          title={t('revalue.void.title', 'ألغِ تصحيح سعر «{item}»', { item: names.get(voiding.receiptLineId) ?? '' })}
          consequence={t('revalue.void.consequence', 'تُعكس حصص الدفعات ومصروف «فرق سعر شراء» وقيد المورّد لتصحيح {old} إلى {new}، ويرجع مبلغ السطر كما كان قبله.', {
            old: fmtMoney(voiding.oldTotal, 0),
            new: fmtMoney(voiding.newTotal, 0),
          })}
          busy={busy}
          failure={failure}
          onConfirm={(reason) => void voidRevaluation(reason)}
          onClose={() => setVoiding(null)}
        />
      ) : null}
    </section>
  );
}
