import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { QtyInput, type QtyValue } from '../../components/ui/QtyInput';
import { ReviewDialog } from '../../components/ui/ReviewDialog';
import { toast } from '../../components/ui/Toast';
import type { WholeLine } from '../../components/ui/WholeBalance';
import { decimalText } from '../../domain/decimal';
import type { Fils, Milli } from '../../domain/money';
import { can } from '../../domain/permissions';
import { parseQty } from '../../domain/units';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtCounted, fmtDay, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import * as inventory from '../../lib/repo/inventory';
import * as purchasing from '../../lib/repo/purchasing';
import type { ReturnCredit, ReturnOptionLine, ReturnOptions, SupplierReturnBundle, SupplierReturnPreview } from '../../lib/repo/purchasing';
import { useSession } from '../../lib/session';
import { sound } from '../../lib/sound';
import { useStore } from '../../lib/store';
import { AmountField, dinarText, parseDinar } from './purchase-shared';
import { isOwnRetry } from './countDevice';
import { canCopyDraft, CopiedNotice, CopyDraftAction, copyNext, docStatusLabel, DraftDayField, qtyColumns, runWithRef, unitOptions, useCopyDraft, VoidDocDialog, type VoidChoice } from './stock-shared';

// مرتجع المورّد (الخطّة WP7، FOUNDATION ٣٣٥–٣٣٧، ٥٥٣؛ E15، E31، E47): من استلام مرحَّل، والأمين يكتب المسوّدة بالكميات من سطور
// الاستلام اللي بقى بدفعاتها شي (دفعة السطر نفسها بمخزن الاستلام؛ المحوَّل يرجع بإلغاء تحويله أوّلاً، E15)، وأدوار الكلفة يكتبون المبلغ اللي يقبله
// المورّد لكل سطر (دينار صحيح) ويرحّلون. المعاينة من الخادم: قيمة السحب (القاعدة 13) والمقبول و«فرق مرتجع» لأدوار الكلفة، والكميات
// للأمين؛ والموافقة لكل سطر، وسطر ياخذ متبقّي دفعته كلّه يحتاج تأكيداً يسمّيه، والدفعة اللي تصير صفراً تنعلن بصوت (E31). والإلغاء
// بسببه وبجملة تسمّي ما يرجع، والطيّ بتأكيد يسمّي المسوّدة. المستند بحالة المحرّر (مو useLoad) فاللوحات ما تنطوي وهو يقرا من جديد.

const ITEM_FORMS = { one: t('receipt.items.one', 'مادّة واحدة'), two: t('receipt.items.two', 'مادّتان'), few: t('receipt.items.few', 'مواد'), many: t('receipt.items.many', 'مادّة') };

/** «ألغِ المرتجع RT-2026-0003 — ترجع مادّتان إلى دفعات الاستلام PU-2026-0042، ويُعكس قيد المورّد و«فرق مرتجع»». */
export function returnVoidSentence(docNo: string, receiptNo: string, lines: number): string {
  return t('return.void.sentence', 'ألغِ المرتجع {no} — ترجع {count} إلى وجبات الاستلام {receipt}، وتُعكس حركة المورّد ومصروف «فرق مرتجع».', {
    no: docNo,
    receipt: receiptNo,
    count: fmtCounted(BigInt(lines) * 1000n, t('receipt.items.label', 'مادّة'), ITEM_FORMS),
  });
}

/** السطور اللي تاخذ متبقّي دفعتها كلّه (E31): الكمية والمادّة للتأكيد والإعلان. */
export function returnWholeLines(preview: SupplierReturnPreview): WholeLine[] {
  return preview.lines.filter((line) => line.wholeBalance).map((line) => ({ itemName: line.itemName, qty: line.qty, unit: line.baseUnit }));
}

/** بعد الترحيل: الدفعة اللي صارت صفراً تنعلن بصوت وبرسالة تسمّي المواد والاستلام. */
function announceLotsEmptied(lines: readonly WholeLine[], receiptNo: string): void {
  if (lines.length === 0) return;
  sound.warn();
  toast({
    tone: 'warning',
    title: t('return.zero', 'صار متبقّي وجبة الاستلام {receipt} صفراً', { receipt: receiptNo }),
    detail: lines.map((line) => line.itemName).join(t('list.separator', '، ')),
  });
}

/** المبلغ المقبول كما بالشاشة، ويّا المحفوظ يوم بدأ تعديله (شرط الكتابة: ما ينكتب فوق مبلغ غيّره غيرك). */
export interface CreditEdit {
  text: string;
  base: Fils | null;
  /** بعد حفظ ناجح: الأساس قبل الكتابة، مقبول لحد ما توصل القراءة الجديدة (المراجعة: الحقل كان يرجع للقديم والكتابة وقتها تعارض كاذب). */
  prior?: Fils | null;
}

export type CreditEdits = Readonly<Record<string, CreditEdit>>;

const creditTarget = (edit: CreditEdit): Fils | null => (edit.text.trim() === '' ? null : parseDinar(edit.text));

/**
 * التعديلات على آخر قراءة: اللي انحفظ ينشال، واللي محفوظه ما تغيّر من بدأ تعديله يبقى، واللي غيّره غيرك بعدها ينشال وينذكر اسمه (تنعرض
 * قيمته المحفوظة بدل ما تنكتب فوقها).
 */
export function settleCredits(edits: CreditEdits, bundle: SupplierReturnBundle): { edits: Record<string, CreditEdit>; conflicts: string[] } {
  const saved = new Map(bundle.credits.map((row) => [row.lineId, row.credit]));
  const kept: Record<string, CreditEdit> = {};
  const conflicts: string[] = [];
  for (const line of bundle.lines) {
    const edit = edits[line.id];
    if (!edit) continue;
    const now = saved.get(line.id) ?? null;
    const target = creditTarget(edit);
    if (target !== null && target === now) continue;
    if (edit.base === now || (edit.prior !== undefined && edit.prior === now)) kept[line.id] = edit;
    else if (target !== edit.base) conflicts.push(line.itemName);
  }
  return { edits: kept, conflicts };
}

export interface CreditPlan {
  /** أوّل نصّ مو مبلغ (أو مبلغ محفوظ انمسح): ما ينحفظ شي لحد ما يتصلّح. */
  problem: string | null;
  writes: { lineId: string; before: ReturnCredit | null; credit: Fils }[];
}

/** ما ينكتب عند الحفظ: كل مبلغ تغيّر عن أساسه، مشروطاً بالأساس. */
export function creditPlan(edits: CreditEdits, bundle: SupplierReturnBundle): CreditPlan {
  let problem: string | null = null;
  const writes: CreditPlan['writes'] = [];
  for (const line of bundle.lines) {
    const edit = edits[line.id];
    if (!edit) continue;
    const target = creditTarget(edit);
    if (target === null) {
      if (edit.text.trim() !== '' || edit.base !== null) problem ??= t('return.credit.invalid', 'اكتب المبلغ الذي يقبله المورّد عن «{item}» بالدينار الصحيح.', { item: line.itemName });
      continue;
    }
    if (target !== edit.base) writes.push({ lineId: line.id, before: edit.base === null ? null : { id: '', lineId: line.id, credit: edit.base }, credit: target });
  }
  return { problem, writes };
}

type ReturnRow = SupplierReturnBundle['lines'][number];

/** سطور المرتجع: الكمية بوحدتها، ومتبقّي دفعة الاستلام (لمن يكتب المسوّدة)، والمقبول المحفوظ (أدوار الكلفة). */
export function ReturnLinesTable({
  lines,
  left,
  credits,
  onDelete,
}: {
  lines: readonly ReturnRow[];
  left: ReadonlyMap<string, Milli> | null;
  credits: ReadonlyMap<string, Fils> | null;
  onDelete: ((line: ReturnRow) => void) | null;
}) {
  const columns: Column<ReturnRow>[] = [
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    ...qtyColumns(lines, (line) => line.qty, (unit) => t('return.col.qty', 'المُرجَع ({unit})', { unit })),
  ];
  if (left) {
    const rows = lines.filter((line) => left.has(line.receiptLineId));
    columns.push(
      ...qtyColumns(rows, (line) => left.get(line.receiptLineId) ?? 0n, (unit) => t('return.col.left', 'المتبقّي في الوجبة ({unit})', { unit })).map((column) => ({
        ...column,
        key: `left_${column.key}`,
        cell: (line: ReturnRow, index: number) => (left.has(line.receiptLineId) ? column.cell(line, index) : '—'),
      })),
    );
  }
  if (credits) {
    columns.push({
      key: 'credit',
      header: t('return.col.credit', 'المقبول'),
      kind: 'number',
      cell: (line) => {
        const credit = credits.get(line.id);
        return credit === undefined ? '—' : <MoneyText amount={credit} decimals={0} />;
      },
    });
  }
  if (onDelete) {
    columns.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <IconButton label={t('transfer.line.delete', 'احذف السطر')} onClick={() => onDelete(line)} data-action="delete-return-line">
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      ),
    });
  }
  return <DataTable caption={t('return.lines', 'سطور المرتجع')} columns={columns} rows={lines} rowKey={(line) => line.id} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />;
}

/** سطر من سطور الاستلام اللي بقى بدفعتها شي (وما بالمرتجع بعد)، وكميته بوحدة أساسها؛ «كل المتبقّي» يملأ الحقل بمتبقّي الدفعة. */
function AddReturnLine({ docId, options, taken, onAdded }: { docId: string; options: ReturnOptions; taken: ReadonlySet<string>; onAdded: () => void }) {
  const id = useId();
  const open = options.lines.filter((line) => line.qtyLeft > 0n && !taken.has(line.receiptLineId));
  const [picked, setPicked] = useState('');
  const [lineId, setLineId] = useState(() => crypto.randomUUID());
  const [qty, setQty] = useState<QtyValue>({ text: '', unitId: 'base' });
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const line: ReturnOptionLine | null = open.find((row) => row.receiptLineId === picked) ?? null;
  const pick = (next: string) => {
    setPicked(next);
    setLineId(crypto.randomUUID());
    setQty({ text: '', unitId: 'base' });
    setFailure(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = qty.text.trim() ? parseQty(qty.text) : null;
    if (!line || amount === null || amount <= 0n) {
      setFailure(new RejectedError('fields', t('return.line.fields', 'اختر سطر الاستلام واكتب كمية أكبر من صفر.')));
      return;
    }
    if (line.baseUnit === 'pc' && amount % 1000n !== 0n) {
      setFailure(new RejectedError('pieces_not_whole', t('qty.pieces_whole', 'يجب أن يكون عدد القطع صحيحاً')));
      return;
    }
    if (amount > line.qtyLeft) {
      setFailure(new RejectedError('insufficient_stock', t('return.line.over', 'بقي من وجبة «{item}» {left} فقط.', { item: line.itemName, left: fmtQty(line.qtyLeft, line.baseUnit).main })));
      return;
    }
    setBusy(true);
    setFailure(null);
    const added = () => {
      pick('');
      onAdded();
    };
    purchasing
      .addReturnLine(docId, lineId, line.receiptLineId, amount)
      .catch((error: unknown) => {
        // محاولة سابقة وصلت وضاع جوابها (23505 بمعرّف الجهاز): آخر كمية تنكتب فوقها. و23505 على سطر الاستلام: السطر بالمرتجع من نافذة
        // أو جهاز ثاني، فرفض أكيد وقراءة جديدة (كانت تعدّل معرّفاً ما انكتب فتعلق على «لم يُحفظ»).
        if (isOwnRetry(error)) return purchasing.updateReturnLine(lineId, amount);
        if (inventory.isDuplicate(error)) {
          onAdded();
          throw new RejectedError('line_taken', t('return.line.taken', 'هذا السطر في المرتجع من قبل (من نافذة أو جهاز آخر)؛ حُدّثت السطور.'));
        }
        throw error;
      })
      .then(added, (error: unknown) => {
        if (error instanceof RejectedError) setLineId(crypto.randomUUID());
        setFailure(error);
      })
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <form className="card flex flex-col gap-3 p-4" onSubmit={submit} noValidate>
      <label className="flex flex-col gap-1" htmlFor={`${id}-line`}>
        <span className="text-sm font-medium">{t('return.line.pick', 'سطر الاستلام')}</span>
        <select id={`${id}-line`} className="input" value={picked} onChange={(event) => pick(event.target.value)} data-action="pick-receipt-line">
          <option value="">{t('return.line.pick.none', 'اختر المادّة')}</option>
          {open.map((row) => (
            <option key={row.receiptLineId} value={row.receiptLineId}>
              {t('return.line.option', '«{item}» — بقي {left}', { item: row.itemName, left: fmtQty(row.qtyLeft, row.baseUnit).main })}
            </option>
          ))}
        </select>
      </label>
      {open.length === 0 ? <p className="text-sm text-ink-muted">{t('return.line.none', 'لم يبقَ من وجبات هذا الاستلام شيء يُرجَع، أو كل سطوره في المرتجع.')}</p> : null}
      {line ? (
        <>
          <QtyInput id={`${id}-qty`} label={t('return.line.qty', 'الكمية المُرجَعة')} base={line.baseUnit} units={unitOptions(line, []).slice(0, 1)} value={qty} onChange={setQty} />
          <Button size="sm" variant="ghost" onClick={() => setQty({ text: decimalText(line.qtyLeft, 3), unitId: 'base' })} data-action="return-all-left">
            {t('return.line.all', 'كل المتبقّي ({left})', { left: fmtQty(line.qtyLeft, line.baseUnit).main })}
          </Button>
        </>
      ) : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy} disabled={!line} icon={<Plus aria-hidden="true" className="size-4" />} data-action="add-return-line">
        {t('use.line.add', 'أضف السطر')}
      </Button>
    </form>
  );
}

/** المبلغ اللي يقبله المورّد لكل سطر (أدوار الكلفة): التعديلات بالمحرّر، والحفظ مشروط بقيمها يوم بدأ تعديلها. */
function CreditsPanel({
  bundle,
  edits,
  conflicts,
  plan,
  busy,
  failure,
  onChange,
  onSave,
}: {
  bundle: SupplierReturnBundle;
  edits: CreditEdits;
  conflicts: readonly string[];
  plan: CreditPlan;
  busy: boolean;
  failure: unknown;
  onChange: (next: CreditEdits) => void;
  onSave: () => void;
}) {
  const id = useId();
  const saved = new Map(bundle.credits.map((row) => [row.lineId, row.credit]));
  const dirty = plan.problem !== null || plan.writes.length > 0;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">{t('return.credits', 'المبلغ الذي يقبله المورّد')}</h2>
      <p className="text-sm text-ink-muted">{t('return.credits.hint', 'تدخل حركة المورّد «له» في حساب الاستلام، والفرق بينها وبين قيمة الوجبة المُرجَعة مصروف «فرق مرتجع».')}</p>
      {conflicts.length > 0 ? (
        <Notice tone="warning" title={t('return.credits.conflict', 'تغيّر المقبول عن {names} من نافذة أو جهاز آخر بعد أن بدأت تعديله؛ تُعرض القيمة المحفوظة الآن.', { names: conflicts.join(t('list.separator', '، ')) })} />
      ) : null}
      {bundle.lines.map((line) => {
        const before = saved.get(line.id) ?? null;
        const edit = edits[line.id];
        const text = edit ? edit.text : before === null ? '' : dinarText(before);
        return (
          <AmountField
            key={line.id}
            id={`${id}-credit-${line.id}`}
            label={t('return.credit.line', 'المقبول عن «{item}»', { item: line.itemName })}
            value={text}
            onChange={(next) => onChange({ ...edits, [line.id]: edit ? { ...edit, text: next } : { text: next, base: before } })}
          />
        );
      })}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} disabled={!dirty} onClick={onSave} data-action="save-credits">
          {t('return.credits.save', 'احفظ المبالغ')}
        </Button>
        {dirty ? (
          <Button variant="ghost" disabled={busy} onClick={() => onChange({})} data-action="undo-credits">
            {t('receipt.amounts.undo', 'تراجع عن التعديلات')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** المعاينة: المشاكل والتحذيرات، والكمية ومتبقّي الدفعة، ولأدوار الكلفة قيمة الدفعة المُرجَعة والمقبول و«فرق مرتجع»؛ والموافقة لكل سطر. */
export function ReturnPreviewPanel({ preview, approved, onToggle }: { preview: SupplierReturnPreview; approved: ReadonlySet<string>; onToggle: (lineId: string, on: boolean) => void }) {
  type Line = SupplierReturnPreview['lines'][number];
  const money = new Map((preview.money?.lines ?? []).map((line) => [line.lineId, line]));
  const columns: Column<Line>[] = [
    {
      key: 'ok',
      header: t('preview.approve', 'موافق'),
      cell: (line) => <input type="checkbox" className="size-5 accent-brand-600" aria-label={t('preview.approve.line', 'موافق على «{item}»', { item: line.itemName })} checked={approved.has(line.lineId)} onChange={(event) => onToggle(line.lineId, event.target.checked)} data-action="approve-return-line" />,
    },
    { key: 'item', header: t('stock.col.item', 'المادّة'), cell: (line) => line.itemName },
    ...qtyColumns(preview.lines, (line) => line.qty, (unit) => t('return.col.qty', 'المُرجَع ({unit})', { unit })),
    ...qtyColumns(preview.lines, (line) => line.lotQtyLeft, (unit) => t('return.col.left', 'المتبقّي في الوجبة ({unit})', { unit })).map((column) => ({ ...column, key: `left_${column.key}` })),
  ];
  if (preview.money) {
    columns.push(
      { key: 'value', header: t('return.col.value', 'قيمة المُرجَع من الوجبة'), kind: 'number', cell: (line) => { const row = money.get(line.lineId); return row?.value === null || row?.value === undefined ? '—' : <MoneyText amount={row.value} />; } },
      { key: 'credit', header: t('return.col.credit', 'المقبول'), kind: 'number', cell: (line) => { const row = money.get(line.lineId); return row?.credit === null || row?.credit === undefined ? '—' : <MoneyText amount={row.credit} decimals={0} />; } },
      { key: 'diff', header: t('return.col.diff', 'فرق مرتجع'), kind: 'number', cell: (line) => { const row = money.get(line.lineId); return row?.diff === null || row?.diff === undefined ? '—' : <MoneyText amount={row.diff} />; } },
    );
  }
  return (
    <>
      {preview.problems.map((problem, i) => (
        <Notice key={`problem-${i}`} tone="danger" title={problem.hint} />
      ))}
      {preview.lines.flatMap((line) => [line.problem, line.warning].filter((x) => x !== null).map((x, k) => <Notice key={`${line.lineId}:${k}`} tone={x === line.problem ? 'danger' : 'warning'} title={x?.hint ?? ''} />))}
      <DataTable caption={t('return.preview.lines', 'ما يرجع إلى المورّد')} columns={columns} rows={preview.lines} rowKey={(line) => line.lineId} empty={t('transfer.lines.empty', 'لا سطور بعد.')} />
      {preview.money ? (
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            {t('return.preview.value', 'قيمة المُرجَع من الوجبات')}: <MoneyText amount={preview.money.valueTotal} />
          </li>
          {preview.money.creditTotal !== null ? (
            <li>
              {t('return.preview.credit', 'حركة المورّد (له) بالمقبول')}: <MoneyText amount={preview.money.creditTotal} decimals={0} />
            </li>
          ) : null}
          {preview.money.diffTotal !== null ? (
            <li>
              {t('return.preview.diff', 'مصروف «فرق مرتجع»')}: <MoneyText amount={preview.money.diffTotal} />
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

const isStale = (error: unknown): boolean => error instanceof RejectedError && error.code === 'stale_draft';

function SupplierReturnEditor({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const canDraft = workspace ? can(workspace.role, 'receipt.draft') : false;
  const canPrice = workspace ? can(workspace.role, 'receipt.amounts') : false;
  const canVoid = workspace ? can(workspace.role, 'void') : false;
  // آخر قراءة تبقى معروضة وهي تقرا من جديد (مو useLoad، اللي يرجّع null وهو يقرا فتنطوي اللوحات، درس WP5)؛ والقراءة لنفس المستند والدور.
  const loadKey = `${docId}#${canPrice}`;
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; bundle: SupplierReturnBundle | null; error: unknown }>({ key: '', bundle: null, error: null });
  useEffect(() => {
    let cancelled = false;
    purchasing.loadSupplierReturn(docId, canPrice).then(
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
  const bundle = loaded.key === loadKey ? loaded.bundle : null;
  const loadError = loaded.key === loadKey ? loaded.error : null;
  // سطور الاستلام ومتبقّي دفعاتها لمن يكتب المسوّدة أو مبالغها، وتنقرا من جديد ويّا المستند.
  const receiptId = bundle?.doc.receiptId ?? null;
  const wantsOptions = (canDraft || canPrice) && bundle?.doc.status === 'draft';
  const optionsKey = `${receiptId ?? ''}#${tick}`;
  const [options, setOptions] = useState<{ key: string; data: ReturnOptions | null; error: unknown }>({ key: '', data: null, error: null });
  useEffect(() => {
    if (!wantsOptions || !receiptId) return;
    let cancelled = false;
    purchasing.supplierReturnOptions(receiptId).then(
      (next) => {
        if (!cancelled) setOptions({ key: optionsKey, data: next, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setOptions((prev) => ({ key: optionsKey, data: prev.data, error }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wantsOptions, receiptId, optionsKey]);
  const [edits, setEdits] = useState<CreditEdits>({});
  const [saving, setSaving] = useState(false);
  const [creditFailure, setCreditFailure] = useState<unknown>(null);
  const [previewState, setPreviewState] = useState<{ key: string; preview: SupplierReturnPreview } | null>(null);
  const preview = previewState?.key === loadKey ? previewState.preview : null;
  const setPreview = (next: SupplierReturnPreview | null) => setPreviewState(next ? { key: loadKey, preview: next } : null);
  const [approved, setApproved] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<'whole' | 'void' | 'discard' | null>(null);
  const [lineToDelete, setLineToDelete] = useState<ReturnRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const copier = useCopyDraft('supplier_return', docId);
  const reload = () => setTick((n) => n + 1);
  const closeReview = () => {
    setPreview(null);
    setApproved(new Set());
  };
  const refresh = () => {
    closeReview();
    reload();
  };
  /** تغيّر المرتجع من نافذة أو جهاز آخر (stale_draft): قراءة جديدة وتنبيه يبقى. */
  const handledStale = (error: unknown): boolean => {
    if (!isStale(error)) return false;
    toast({ tone: 'warning', title: t('return.stale', 'تغيّر المرتجع من نافذة أو جهاز آخر'), detail: t('receipt.stale.detail', 'هذه نسخته الآن؛ راجعها وأعد المحاولة.') });
    refresh();
    return true;
  };
  if (!bundle && loadError) return <LoadFailed what={t('return.what', 'المرتجع')} error={loadError} onRetry={reload} />;
  if (!bundle) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const current = bundle.doc;
  const draft = current.status === 'draft';
  const receiptNo = bundle.receipt.docNo ?? '—';
  const optionsNow = options.data && options.data.receiptId === current.receiptId ? options.data : null;
  const left = draft && optionsNow ? new Map(optionsNow.lines.map((line) => [line.receiptLineId, line.qtyLeft])) : null;
  const credits = canPrice ? new Map(bundle.credits.map((row) => [row.lineId, row.credit])) : null;
  const settled = canPrice ? settleCredits(edits, bundle) : null;
  const plan = settled ? creditPlan(settled.edits, bundle) : null;
  const dirty = plan !== null && (plan.problem !== null || plan.writes.length > 0);
  const whole = preview ? returnWholeLines(preview) : [];
  const failed = failure ? describeError(failure) : null;
  const saveCredits = async () => {
    if (!settled || !plan) return;
    if (plan.problem) {
      setCreditFailure(new RejectedError('fields', plan.problem));
      return;
    }
    setEdits(settled.edits);
    setSaving(true);
    setCreditFailure(null);
    const done: CreditPlan['writes'] = [];
    try {
      for (const write of plan.writes) {
        await purchasing.setReturnCredit(write.lineId, write.before, write.credit);
        done.push(write);
      }
    } catch (error) {
      setCreditFailure(error);
    } finally {
      // اللي انكتب صار أساس تعديله (كتابة بعده أثناء القراءة الجديدة ما تنحسب تعارضاً)، والباقي يبقى بأساسه.
      setEdits((now) => {
        const next: Record<string, CreditEdit> = { ...now };
        for (const write of done) {
          const edit = next[write.lineId];
          if (edit) next[write.lineId] = { ...edit, base: write.credit, prior: edit.base };
        }
        return next;
      });
      setSaving(false);
      refresh();
    }
  };
  const runPreview = () => {
    setBusy(true);
    setFailure(null);
    purchasing
      .previewSupplierReturn(current.id)
      .then((next) => {
        setPreview(next);
        setApproved(new Set());
      }, setFailure)
      .finally(() => setBusy(false));
  };
  const post = async () => {
    if (!preview || preview.plan === null) return;
    const { version, plan } = preview;
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`supplier-return-post:${current.id}:${version}:${plan}`, (ref) => purchasing.postSupplierReturn(ref, current.id, version, plan));
    setBusy(false);
    setConfirm(null);
    if (outcome.kind === 'failed') {
      if (handledStale(outcome.error)) return;
      // متبقّي دفعة تغيّر بعد المعاينة: معاينة جديدة بقيمها وموافقة من جديد، بدل زرّ يعيد القيمة القديمة للأبد.
      if (outcome.error instanceof RejectedError && outcome.error.code === 'stale_preview') runPreview();
      setFailure(outcome.error);
      return;
    }
    if (outcome.kind === 'done') toast({ tone: 'success', title: t('return.posted', 'حُفظ المرتجع {no} نهائياً', { no: outcome.result.docNo ?? '' }) });
    else toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة') });
    announceLotsEmptied(whole, receiptNo);
    refresh();
  };
  const canCopy = canCopyDraft(workspace, 'supplier_return');
  const copyFrom = t('return.title.no', 'المرتجع {no}', { no: current.docNo ?? '' });
  const copyNextStep = copyNext(workspace, 'supplier_return');
  const voidDoc = async (reason: string, choice: VoidChoice) => {
    setBusy(true);
    setFailure(null);
    const outcome = await runWithRef(`supplier-return-void:${current.id}`, (ref) => purchasing.voidSupplierReturn(ref, current.id, reason));
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
  const deleteLine = () => {
    if (!lineToDelete) return;
    setBusy(true);
    setFailure(null);
    purchasing
      .deleteReturnLine(lineToDelete.id, current.version)
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
      .discardSupplierReturn(current.id, current.version)
      .then(
        () => navigate(`/inventory/receipts/${current.receiptId}`),
        (error: unknown) => {
          if (!handledStale(error)) setFailure(error);
        },
      )
      .finally(() => {
        setBusy(false);
        setConfirm(null);
      });
  };
  const ready = online && preview !== null && preview.ready && preview.plan !== null && preview.problems.length === 0 && preview.lines.every((line) => approved.has(line.lineId));
  const title = current.docNo ? t('return.title.no', 'المرتجع {no}', { no: current.docNo }) : t('return.title.draft', 'مرتجع غير محفوظ بعد');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        subtitle={t('return.subtitle', '{status} — إلى «{party}» من الاستلام {receipt} بتاريخ {day}', {
          status: docStatusLabel(current.status),
          party: bundle.receipt.partyName,
          receipt: receiptNo,
          day: fmtDay(current.onDate),
        })}
        actions={
          <Link to={`/inventory/receipts/${current.receiptId}`} className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="back-to-receipt">
            {t('return.back', 'الاستلام {no}', { no: receiptNo })}
          </Link>
        }
      />
      {loadError ? <LoadFailed what={t('return.what', 'المرتجع')} error={loadError} onRetry={reload} /> : null}
      <CopiedNotice draft={draft} next={copyNextStep} />
      {current.voidReason ? <Notice tone="warning" title={t('return.voided', 'أُلغي هذا المرتجع')}>{current.voidReason}</Notice> : null}
      {draft && canDraft ? <DraftDayField day={current.onDate} save={(day) => purchasing.updateSupplierReturnDraft(current, { day })} onSaved={refresh} /> : null}
      <ReturnLinesTable lines={bundle.lines} left={left} credits={credits} onDelete={draft && canDraft ? setLineToDelete : null} />
      {draft && options.error ? <LoadFailed what={t('return.options.what', 'سطور الاستلام ومتبقّي وجباتها')} error={options.error} onRetry={reload} /> : null}
      {draft && canDraft && optionsNow ? <AddReturnLine docId={current.id} options={optionsNow} taken={new Set(bundle.lines.map((line) => line.receiptLineId))} onAdded={refresh} /> : null}
      {draft && settled && plan && bundle.lines.length > 0 ? (
        <CreditsPanel bundle={bundle} edits={settled.edits} conflicts={settled.conflicts} plan={plan} busy={saving} failure={creditFailure} onChange={setEdits} onSave={() => void saveCredits()} />
      ) : null}
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
      {draft && (canDraft || canPrice) ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button busy={busy && !preview} onClick={runPreview} disabled={!online} data-action="preview-return">
              {t('return.preview', 'راجع واحفظ')}
            </Button>
            {canDraft ? (
              <Button variant="ghost" onClick={() => setConfirm('discard')} disabled={busy} data-action="discard-return">
                {t('transfer.discard', 'احذف الورقة')}
              </Button>
            ) : null}
          </div>
          {!online ? <Notice tone="warning" title={t('transfer.offline', 'الحفظ النهائي يحتاج اتصالاً بالإنترنت؛ الورقة باقية حتى يعود الاتصال.')} /> : null}
          {preview && !canPrice ? <Notice tone="info" title={t('return.keeper', 'المبلغ المقبول والحفظ النهائي للمحاسب أو المدير؛ الورقة باقية لهما.')} /> : null}
          <ReviewDialog
            open={preview !== null && canPrice}
            title={t('return.review.title', 'راجع المرتجع قبل الحفظ')}
            ready={ready && !dirty}
            busy={busy}
            action="post-return"
            onSave={() => (whole.length ? setConfirm('whole') : void post())}
            onClose={closeReview}
          >
            {preview ? (
              <>
                {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
                <ReturnPreviewPanel
                  preview={preview}
                  approved={approved}
                  onToggle={(lineId, on) => {
                    const next = new Set(approved);
                    if (on) next.add(lineId);
                    else next.delete(lineId);
                    setApproved(next);
                  }}
                />
                {dirty ? <Notice tone="warning" title={t('return.dirty', 'في المبالغ المقبولة تعديل لم يُحفظ: ارجع إلى الورقة واحفظه أو تراجع عنه، ثم راجع من جديد.')} /> : null}
              </>
            ) : null}
          </ReviewDialog>
        </div>
      ) : current.status === 'posted' && canVoid ? (
        <Button variant="danger" onClick={() => setConfirm('void')} data-action="void-return">
          {t('return.void', 'ألغِ المرتجع')}
        </Button>
      ) : current.status === 'void' && current.docNo && canCopy ? (
        <CopyDraftAction copier={copier} from={copyFrom} next={copyNextStep} />
      ) : null}
      <ConfirmDialog
        open={confirm === 'whole'}
        title={t('return.whole.title', 'إرجاع ما بقي من الوجبة كلّه')}
        consequence={
          <div className="flex flex-col gap-2">
            <p>{t('return.whole.consequence', 'سيرجع كل ما بقي من وجبة الاستلام {receipt} لهذه المواد، فيصير متبقّيها صفراً:', { receipt: receiptNo })}</p>
            <ul className="list-disc ps-6">
              {whole.map((line) => (
                <li key={line.itemName}>{t('whole_balance.line', '«{item}»: {qty}', { item: line.itemName, qty: fmtQty(line.qty, line.unit).main })}</li>
              ))}
            </ul>
          </div>
        }
        confirmLabel={t('return.whole.confirm', 'نعم، أرجِع المتبقّي كلّه')}
        tone="primary"
        busy={busy}
        action="confirm-whole-return"
        onConfirm={() => void post()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={lineToDelete !== null}
        title={t('receipt.line.delete.title', 'احذف سطر «{item}»', { item: lineToDelete?.itemName ?? '' })}
        consequence={t('return.line.delete.consequence', 'يُحذف سطر «{item}» ({qty}) من الورقة مع مبلغه المقبول إن كُتب.', {
          item: lineToDelete?.itemName ?? '',
          qty: lineToDelete ? fmtQty(lineToDelete.qty, lineToDelete.baseUnit).main : '',
        })}
        confirmLabel={t('transfer.line.delete', 'احذف السطر')}
        busy={busy}
        action="confirm-delete-return-line"
        onConfirm={deleteLine}
        onCancel={() => setLineToDelete(null)}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        title={t('return.discard.title', 'احذف ورقة المرتجع')}
        consequence={t('return.discard.consequence', 'تُلغى ورقة المرتجع من الاستلام {receipt} بتاريخ {day} بلا رقم ولا حركات، ولا ترجع.', { receipt: receiptNo, day: fmtDay(current.onDate) })}
        confirmLabel={t('transfer.discard', 'احذف الورقة')}
        busy={busy}
        action="confirm-discard-return"
        onConfirm={discard}
        onCancel={() => setConfirm(null)}
      />
      {confirm === 'void' && current.docNo ? (
        <VoidDocDialog
          title={t('return.void.title', 'ألغِ المرتجع {no}', { no: current.docNo })}
          consequence={returnVoidSentence(current.docNo, receiptNo, bundle.lines.length)}
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

export function SupplierReturnDocPage() {
  const { id = '' } = useParams();
  return <SupplierReturnEditor key={id} docId={id} />;
}
