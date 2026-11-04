import { Factory, Plus, Repeat, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { decimalText } from '../../domain/decimal';
import { parseMoney, type Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { parseQty, type BaseUnit } from '../../domain/units';
import { describeError, RejectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import {
  addBatchCost,
  addProductionInput,
  confirmCosts,
  deleteBatchCost,
  deleteProductionInput,
  discardBatch,
  loadBatch,
  loadExpenseCategories,
  postProduction,
  previewProduction,
  setBatchCost,
  setBatchFields,
  setInputActual,
  voidProduction,
  type BatchCost,
  type BatchLine,
  type CategoryOption,
  type LotDraw,
  type MillProblem,
  type ProductionBatch,
  type ProductionPreview,
} from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { CellEdit, MaterialPicker, NewCategoryField, unitWord, useDrafts, type PickedMaterial } from './pickers';
import { dash, forgetMillRef, millRef, pct, Stats } from './shared';

// بطاقة دفعة الإنتاج (0015): المسوّدة تُعرض بمعاينتها (ما سيُسحب من كلّ مادّة، والهدر، وكلفة الكيلو) قبل «أنتج الآن»؛
// والمرحَّلة بأرقامها وبزرّ الإلغاء. الرفض يُعرض كما هو من الخادم، ولا يُرحَّل شيء لم يره المستخدم (بصمة المعاينة).
// النسخة الثانية (0016، كلمة المالك 2026-11-04: «امكانية اختيار وتعديل كميات المواد… وبعدها المادة المنتجة تروح لمخزن خاص
// واعرف منين صنعتها بالضبط»): المواد بالمخطّط بالتناسب والفعلي قابلاً للتعديل، و«أضف مادّة» و«بدّل مادّة» بسبب و«احذف»؛
// وجدول التكاليف (المحسوب من الخلطة، والمبلغ قابلاً للتعديل، والمتاح من المصاريف لكلّ سطر)؛ والكلفة الكلّية مواد + تكاليف؛
// و«المصاريف لا تكفي» بجملة وفعل؛ والمرحَّلة تقول أين ذهب الناتج ومن أين سُحبت كلّ مادّة.
// إصلاحات المراجعة: مفتاح معرّف المادّة المضافة يحمل كميتها وسببها (م٢)؛ فئة المصروف من مكانها (م٣)؛ «المصاريف لا تكفي» وتلميح
// التكاليف يسمّيان وحدة مخزن المدخلات، و«سجّل مصروفاً» يعبّئ النافذة ويرجع إلى الدفعة (م٤)؛ حذف المسوّدة بتأكيد (م١٠)؛ الوقود
// والتعبئة «خارج الكتلة» (م١١)؛ التحميلات والمتاح المحجوبة بلا أرقام (م١٢)؛ والناتج المنتهي بجملة تسمّي التاريخين (م١٤).

interface BatchState {
  batch: ProductionBatch;
  preview: ProductionPreview | null;
}

const PROBLEM_TEXT: Readonly<Record<string, () => string>> = {
  insufficient_stock: () => t('mill.problem.short', 'الرصيد لا يكفي'),
  shrink_out_of_range: () => t('mill.problem.shrink', 'الهدر خارج المدى المقبول: اكتب سببه'),
  expiry_required: () => t('mill.problem.expiry', 'الناتج يُتابَع انتهاؤه: اكتب تاريخ الانتهاء'),
  costs_pending: () => t('mill.problem.costs', 'الكلف لم تُختَم بعد: يختمها المحاسب أو المدير'),
  item_archived: () => t('mill.problem.archived', 'المادّة مؤرشفة'),
  costs_unfunded: () => t('mill.problem.unfunded', 'تكاليف الدفعة أكبر من المتاح في المصاريف المسجّلة: يسجّل المحاسب أو المدير المصروف أوّلاً أو يقلّل المبلغ'),
  output_expired: () => t('mill.problem.output_expired', 'تاريخ انتهاء الناتج قبل يوم الإنتاج: صحّح التاريخ قبل الترحيل'),
};

export const problemText = (code: string): string => (PROBLEM_TEXT[code] ?? (() => t('mill.problem.other', 'مشكلة في الدفعة: {code}', { code })))();

/** جملة مشكلة من مشاكل المعاينة: الناتج المنتهي يسمّي التاريخين (ق٨، م١٤)، ومشكلة المادّة تسمّي المادّة، وغيرها بجملتها. */
export function problemLine(problem: MillProblem): string {
  if (problem.code === 'output_expired' && problem.expiryOn !== null && problem.producedOn !== null) {
    return t('mill.problem.output_expired_named', 'تاريخ انتهاء الناتج {expiry} قبل يوم الإنتاج {produced}: صحّح تاريخ الانتهاء قبل الترحيل.', {
      expiry: fmtDay(problem.expiryOn),
      produced: fmtDay(problem.producedOn),
    });
  }
  return problem.itemName ? `${problemText(problem.code)} — ${problem.itemName}` : problemText(problem.code);
}

/**
 * جملة «المصاريف لا تكفي» (م٤): تسمّي وحدة مخزن المدخلات، فالتكاليف تُحمَّل من مصاريف هذه الوحدة وحدها (مصروف على وحدة أخرى
 * يترك المتاح صفراً). بأرقامها لمن يرى مصاريف الوحدة: الفئة والمطلوب والمتاح؛ ولغيره بلا رقم واحد (ق١١).
 */
export function unfundedText(problem: MillProblem, division: string): string {
  if (problem.needAmount === null || problem.haveAmount === null) {
    return t('mill.problem.unfunded_division', 'تكاليف الدفعة أكبر من المتاح في مصاريف وحدة «{division}» المسجّلة: يسجّل المحاسب أو المدير مصروفاً على هذه الوحدة أوّلاً أو يقلّل المبلغ.', { division });
  }
  const category = problem.categoryName ?? dash();
  return t('mill.problem.unfunded_named', '«{category}»: المطلوب {need} والمتاح من مصاريف وحدة «{division}» المسجّلة {have}. سجّل مصروفاً على وحدة «{division}» بفئة «{category}» أو قلّل المبلغ.', {
    category,
    division,
    need: fmtMoney(problem.needAmount),
    have: fmtMoney(problem.haveAmount),
  });
}

/**
 * رابط «سجّل مصروفاً» معبّأً (م٤): نافذة المصروف الجديد على وحدة المدخلات وفئة السطر وبالناقص (المطلوب − المتاح بالدينار نصّاً)،
 * والرجوع إلى الدفعة بعد الحفظ. null حين لا أرقام (لا يرى مصاريف الوحدة، فلا يسجّل عليها).
 */
export function recordExpenseHref(problem: MillProblem, divisionId: string, batchId: string): string | null {
  if (problem.needAmount === null || problem.haveAmount === null || problem.categoryId === null) return null;
  const missing = problem.needAmount - problem.haveAmount;
  const amount = decimalText(missing > 0n ? missing : 0n, 2);
  return `/accounts/expenses?new=1&division=${divisionId}&category=${problem.categoryId}&amount=${amount}&back=/mill/batch/${batchId}`;
}

/** صفّ جدول المواد: سطر المعاينة (المسوّدة) أو سطر البطاقة (المرحَّلة)، ومعه ما تعرفه البطاقة عن البديل والوجبات. */
interface MaterialRow {
  id: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  plannedQty: bigint;
  actualQty: bigint | null;
  /** ما سيُسحب (المسوّدة) أو ما سُحب فعلاً (المرحَّلة). */
  drawQty: bigint;
  value: Fils | null;
  detail: BatchLine | null;
}

export function materialRows(batch: ProductionBatch, preview: ProductionPreview | null): MaterialRow[] {
  const details = new Map(batch.lines.map((line) => [line.id, line]));
  if (preview) {
    return preview.lines.map((line) => ({
      id: line.inputId,
      itemId: line.itemId,
      itemName: line.itemName,
      baseUnit: line.baseUnit,
      plannedQty: line.plannedQty,
      actualQty: line.actualQty,
      drawQty: line.drawQty,
      value: line.value,
      detail: details.get(line.inputId) ?? null,
    }));
  }
  return batch.lines.map((line) => ({
    id: line.id,
    itemId: line.itemId,
    itemName: line.itemName,
    baseUnit: line.baseUnit,
    plannedQty: line.plannedQty,
    actualQty: line.actualQty,
    drawQty: line.usedQty ?? line.actualQty ?? line.plannedQty,
    value: line.value,
    detail: line,
  }));
}

/** مادّة تُضاف للدفعة أو تُبدَّل بها سطراً: المنتقي، والكمية بوحدة أساس المادّة، والسبب للتبديل (القاعدة ١٩). */
function InputDialog({
  batch,
  replacing,
  exclude,
  canFixKind,
  onClose,
  onSaved,
}: {
  batch: ProductionBatch;
  replacing: MaterialRow | null;
  exclude: ReadonlySet<string>;
  canFixKind: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [item, setItem] = useState<PickedMaterial | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parseQty(qty);
  const qtyOk = value !== null && value > 0n;
  const reasonOk = !replacing || reason.trim().length >= 3;
  const ready = item !== null && qtyOk && reasonOk;

  const save = async () => {
    if (!ready || !item || value === null) return;
    setBusy(true);
    setError(null);
    // المعرّف من الجهاز لنفس (الدفعة، السطر المبدَّل، المادّة، الكمية، السبب) (م٢): الإعادة بعد جواب ضاع بالمحتوى نفسه ترجّع
    // السطر نفسه، وكمية أو سبب آخر بعدها معرّف آخر — لا «نجح» بالكمية الأولى بصمت.
    const why = replacing ? reason.trim() : '';
    const slot = `input:${batch.id}:${replacing?.id ?? 'new'}:${item.id}:${value}:${why}`;
    try {
      await addProductionInput({ batchId: batch.id, id: millRef(slot), itemId: item.id, qty: value, replaces: replacing?.id ?? null, reason: replacing ? why : null });
      forgetMillRef(slot);
      onSaved();
    } catch (failure) {
      if (failure instanceof RejectedError && failure.code === 'id_conflict') {
        // رفض أكيد: المعرّف لسطر كُتب بمحتوى آخر، فالمحاولة التالية بمعرّف جديد.
        forgetMillRef(slot);
        setError(t('mill.input.id_conflict', 'أُضيفت هذه المادّة بمحاولة سابقة بكمية أخرى؛ حدّث الصفحة وعدّل كميتها الفعلية.'));
      } else {
        const { title, detail } = describeError(failure);
        setError(`${title} ${detail}`);
      }
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={item !== null || qty !== '' || reason !== ''}
      title={replacing ? t('mill.input.replace.title', 'بدّل «{name}» بمادّة أخرى', { name: replacing.itemName }) : t('mill.input.add.title', 'أضف مادّة إلى الدفعة')}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={!ready} data-action="input-save">
          {replacing ? t('mill.input.replace.save', 'بدّل') : t('mill.input.add.save', 'أضف')}
        </Button>
      }
    >
      {replacing ? (
        <p className="text-sm text-ink-muted">
          {t('mill.input.replace.hint', 'يُحذف سطر «{name}» من الدفعة وتحلّ المادّة الجديدة محلّه، والسبب يبقى مكتوباً على السطر.', { name: replacing.itemName })}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">{t('mill.input.add.hint', 'المادّة الإضافية تُسحب من «{store}» وتدخل كتلتها في الدفعة.', { store: batch.inputWarehouse.name })}</p>
      )}
      {item ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3">
          <span className="font-medium">{item.name}</span>
          <Button size="sm" variant="ghost" onClick={() => setItem(null)} data-action="input-change-item">
            {t('mill.input.change', 'غيّر المادّة')}
          </Button>
        </div>
      ) : (
        <MaterialPicker id={`${id}-picker`} exclude={exclude} canCreate={false} canFixKind={canFixKind} onPick={setItem} />
      )}
      <Field
        id={`${id}-qty`}
        label={item ? t('mill.input.qty_unit', 'الكمية ({unit})', { unit: unitWord(item.baseUnit) }) : t('mill.line.qty', 'الكمية')}
        error={qty.trim() !== '' && !qtyOk ? t('mill.line.qty_bad', 'اكتب كمية أكبر من صفر.') : undefined}
        hint={replacing ? t('mill.input.replaced_qty', 'كان المخطّط من «{name}»: {qty}', { name: replacing.itemName, qty: fmtQty(replacing.plannedQty, replacing.baseUnit).main }) : undefined}
      >
        <input id={`${id}-qty`} className="input tabular-nums" inputMode="decimal" dir="ltr" value={qty} onChange={(event) => setQty(event.target.value)} data-action="input-qty" />
      </Field>
      {replacing ? (
        <Field id={`${id}-reason`} label={t('mill.input.reason', 'سبب التبديل')} error={reason.trim() !== '' && !reasonOk ? t('mill.input.reason_short', 'اكتب السبب بثلاثة أحرف على الأقلّ.') : undefined}>
          <input id={`${id}-reason`} className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} data-action="input-reason" />
        </Field>
      ) : null}
      {error ? <Notice tone="danger" title={error} /> : null}
    </Dialog>
  );
}

/** الوجبات التي سُحبت منها مادّة (المرحَّلة)، وبلاها رابط دفتر المادّة في مخزن المدخلات حيث حركة السحب برقم الدفعة. */
function DrawsCell({ draws, itemId, unit, warehouseId }: { draws: readonly LotDraw[] | null; itemId: string; unit: BaseUnit; warehouseId: string }) {
  if (draws && draws.length) {
    return (
      <ul className="flex flex-col gap-0.5">
        {draws.map((draw) => (
          <li key={draw.lotId}>
            {t('mill.trace.draw', '«{source}» ({day}): {qty}', { source: draw.source, day: fmtDay(draw.receivedOn), qty: fmtQty(draw.qty, unit).main })}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Link to={`/inventory/items/${itemId}?wh=${warehouseId}&tab=moves`} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-item-ledger">
      {t('mill.trace.ledger', 'دفتر المادّة')}
    </Link>
  );
}

export default function BatchPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const fieldId = useId();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? null;
  const costs = Boolean(workspace?.canSeeCost);
  const canPost = role !== null && can(role, 'production.post');
  const canDraft = role !== null && can(role, 'production.draft');
  const canVoid = role !== null && can(role, 'void');
  const canSeal = role !== null && can(role, 'costs.load');
  const canCosts = canSeal && costs;
  const canExpense = role !== null && can(role, 'expense.post');
  const canCategories = role !== null && can(role, 'expense_categories.manage');
  const canFixKind = role !== null && can(role, 'stores.manage');

  const load = useCallback(async (): Promise<BatchState> => {
    const batch = await loadBatch(id);
    return { batch, preview: batch.status === 'draft' ? await previewProduction(id) : null };
  }, [id]);
  const { data, error, loading, retry } = useLoad<BatchState>(load, id);
  const loadCategories = useCallback((): Promise<CategoryOption[]> => (canCosts ? loadExpenseCategories() : Promise.resolve([])), [canCosts]);
  const categories = useLoad<CategoryOption[]>(loadCategories, `${canCosts}`);
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<MaterialRow | null>(null);
  const [removingInput, setRemovingInput] = useState<MaterialRow | null>(null);
  const [removingCost, setRemovingCost] = useState<BatchCost | null>(null);
  const [newCost, setNewCost] = useState({ categoryId: '', amount: '' });
  const [madeCategories, setMadeCategories] = useState<readonly CategoryOption[]>([]);
  const [discarding, setDiscarding] = useState(false);
  const actuals = useDrafts<bigint | null>();
  const amounts = useDrafts<Fils>();

  const batch = data?.batch ?? null;
  const preview = data?.preview ?? null;
  const rows = useMemo(() => (batch ? materialRows(batch, preview) : []), [batch, preview]);
  const decimals = useMemo(
    () => columnDecimals(rows.flatMap((row) => [row.plannedQty, row.drawQty, row.actualQty ?? 0n]), 3) as 0 | 1 | 2 | 3,
    [rows],
  );
  const exclude = useMemo(() => new Set(rows.map((row) => row.itemId)), [rows]);

  if (error) return <LoadFailed what={t('mill.batch.what', 'دفعة الإنتاج')} error={error} onRetry={retry} />;
  if (loading || !batch) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  const draft = batch.status === 'draft';
  const editInputs = draft && canDraft;
  const costLines = preview?.costs ?? batch.costs;
  const costShown = costLines !== null;

  const act = async (run: () => Promise<unknown>, done?: string): Promise<boolean> => {
    setBusy(true);
    setFailure(null);
    try {
      await run();
      if (done) toast({ tone: 'success', title: done });
      retry();
      return true;
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // الحقل يبدأ من الوزن المحفوظ (إن وُجد) ويتبع الكتابة بعدها، فلا تُداس كتابة المستخدم بكلّ قراءة (درس WP5).
  const shownWeight = touched ? weight : batch.outputQtyKg > 0n ? decimalText(batch.outputQtyKg, 3) : '';
  const typedWeight = shownWeight.trim() === '' ? null : parseQty(shownWeight);
  const weightBad = shownWeight.trim() !== '' && (typedWeight === null || typedWeight <= 0n);

  const saveWeight = () =>
    void act(async () => {
      if (weightBad) return;
      await setBatchFields(batch.id, { outputQtyKg: typedWeight, shrinkReason: reason.trim() === '' ? null : reason });
      setTouched(false);
    });

  const post = () => {
    if (!preview) return;
    void act(async () => {
      await postProduction(batch.id, preview.version, preview.planToken, millRef(`post:${batch.id}`));
      forgetMillRef(`post:${batch.id}`);
    }, t('mill.posted', 'تمّ الإنتاج: دخل العلف مخزنه.'));
  };

  const discard = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await discardBatch(batch.id, batch.version);
      toast({ tone: 'success', title: t('mill.discarded', 'حُذفت مسوّدة الدفعة.') });
      navigate('/mill');
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
      setDiscarding(false);
      setBusy(false);
    }
  };

  const kill = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await voidProduction(batch.id, t('mill.void.reason', 'إلغاء دفعة إنتاج'), millRef(`void:${batch.id}`));
      forgetMillRef(`void:${batch.id}`);
      toast({ tone: 'success', title: t('mill.voided', 'أُلغيت الدفعة ورجعت موادّها إلى مخزنها.') });
      setVoiding(false);
      retry();
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
      setVoiding(false);
    } finally {
      setBusy(false);
    }
  };

  const saveActual = (row: MaterialRow) => {
    const edit = actuals.get(row.id);
    if (!edit) return;
    const value = edit.text.trim() === '' ? null : parseQty(edit.text);
    if (edit.text.trim() !== '' && (value === null || value <= 0n)) return;
    void act(async () => {
      await setInputActual(row.id, edit.before, value);
      actuals.clear(row.id);
    });
  };

  const saveAmount = (cost: BatchCost, value: Fils) =>
    void act(async () => {
      await setBatchCost(cost.id, amounts.get(cost.id)?.before ?? cost.amount, value);
      amounts.clear(cost.id);
    });

  const mass = preview?.inputMassKg ?? batch.inputMassKg;
  const output = preview?.outputQtyKg ?? batch.outputQtyKg;
  const shrink = preview?.shrinkKg ?? batch.shrinkKg;
  const inputValue = preview?.inputValue ?? batch.inputValue;
  const extraValue = preview?.extraValue ?? batch.extraValue;
  const totalValue = preview?.totalValue ?? batch.totalValue;
  const costPerKg = preview?.costPerKg ?? batch.costPerKg;

  const columns: Column<MaterialRow>[] = [
    {
      key: 'item',
      header: t('mill.line.item', 'المادّة'),
      wrap: true,
      sticky: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.itemName}</span>
          {row.detail?.isSubstitute ? (
            <span className="text-xs text-ink-muted" data-action="substitute-note">
              {row.detail.replacedItemName
                ? t('mill.input.substitute_for', 'بديل عن «{name}»: {reason}', { name: row.detail.replacedItemName, reason: row.detail.reason ?? dash() })
                : t('mill.input.substitute', 'بديل: {reason}', { reason: row.detail.reason ?? dash() })}
            </span>
          ) : row.detail && !row.detail.inBasis ? (
            <span className="text-xs text-ink-muted" data-action="out-of-basis">
              {t('mill.input.out_of_basis', 'خارج الكتلة: وقود أو تعبئة، تُسحب وتُحسب كلفتها ولا تدخل كتلة المواد')}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'planned', header: t('mill.line.planned', 'المخطّط'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.plannedQty, decimals)}</Num> },
    {
      key: 'actual',
      header: t('mill.line.actual', 'الفعلي'),
      kind: 'number',
      cell: (row) => {
        if (!editInputs) return <Num>{row.actualQty === null ? dash() : fmtQtyCell(row.actualQty, decimals)}</Num>;
        const saved = row.actualQty === null ? '' : decimalText(row.actualQty, 3);
        const edit = actuals.get(row.id);
        const text = edit?.text ?? saved;
        const parsed = text.trim() === '' ? null : parseQty(text);
        return (
          <CellEdit
            id={`${fieldId}-actual-${row.id}`}
            label={t('mill.input.actual_of', 'الكمية الفعلية الموزونة من «{name}» ({unit})، وفارغة = كما خُطّط', { name: row.itemName, unit: unitWord(row.baseUnit) })}
            value={text}
            dirty={edit !== undefined && text !== saved}
            invalid={text.trim() !== '' && (parsed === null || parsed <= 0n)}
            busy={busy}
            action="input-actual"
            onChange={(next) => actuals.write(row.id, next, row.actualQty)}
            onSave={() => saveActual(row)}
          />
        );
      },
    },
    {
      key: 'draw',
      header: draft ? t('mill.line.draw', 'سيُسحب') : t('mill.line.used', 'المسحوب'),
      kind: 'number',
      cell: (row) => <Num>{fmtQtyCell(row.drawQty, decimals)}</Num>,
    },
    { key: 'unit', header: t('mill.line.unit', 'الوحدة'), cell: (row) => unitWord(row.baseUnit) },
  ];
  if (costShown) {
    columns.push({
      key: 'value',
      header: t('mill.line.value', 'القيمة'),
      kind: 'number',
      cell: (row) => <Num>{row.value === null ? dash() : fmtMoney(row.value)}</Num>,
      total: inputValue === null ? undefined : <Num>{fmtMoney(inputValue)}</Num>,
    });
  }
  if (batch.status === 'posted') {
    columns.push({
      key: 'lots',
      header: t('mill.trace.from', 'من أيّ وجبات'),
      wrap: true,
      cell: (row) => <DrawsCell draws={row.detail?.draws ?? null} itemId={row.itemId} unit={row.baseUnit} warehouseId={batch.inputWarehouse.id} />,
    });
  }
  if (editInputs) {
    columns.push({
      key: 'actions',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (row) => (
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<Repeat className="size-4" aria-hidden="true" />} onClick={() => setReplacing(row)} data-action="replace-input">
            {t('mill.input.replace', 'بدّل')}
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setRemovingInput(row)} data-action="remove-input">
            {t('common.delete', 'احذف')}
          </Button>
        </span>
      ),
    });
  }

  const costRows = costLines ?? [];
  const editCosts = draft && canCosts;
  const costColumns: Column<BatchCost>[] = [
    { key: 'category', header: t('mill.costs.category', 'التكلفة'), wrap: true, cell: (cost) => cost.categoryName },
    {
      key: 'planned',
      header: t('mill.costs.planned', 'المحسوب من الخلطة'),
      kind: 'number',
      cell: (cost) => <Num>{cost.plannedAmount === null ? t('mill.costs.manual', 'يدوي') : fmtMoney(cost.plannedAmount)}</Num>,
    },
    {
      key: 'amount',
      header: t('mill.costs.amount', 'المبلغ'),
      kind: 'number',
      cell: (cost) => {
        if (!editCosts) return <Num>{fmtMoney(cost.amount)}</Num>;
        const saved = decimalText(cost.amount, 2);
        const edit = amounts.get(cost.id);
        const text = edit?.text ?? saved;
        const parsed = parseMoney(text);
        return (
          <CellEdit
            id={`${fieldId}-cost-${cost.id}`}
            label={t('mill.costs.amount_of', 'مبلغ «{name}» في هذه الدفعة', { name: cost.categoryName })}
            value={text}
            dirty={edit !== undefined && text !== saved}
            invalid={parsed === null || parsed < 0n}
            busy={busy}
            action="cost-amount"
            onChange={(next) => amounts.write(cost.id, next, cost.amount)}
            onSave={() => {
              if (parsed !== null && parsed >= 0n) saveAmount(cost, parsed);
            }}
          />
        );
      },
      total: extraValue === null ? undefined : <Num>{fmtMoney(extraValue)}</Num>,
    },
  ];
  if (draft) {
    costColumns.push({
      key: 'available',
      header: t('mill.costs.available', 'المتاح من المصاريف'),
      kind: 'number',
      cell: (cost) => <Num>{cost.available === null ? dash() : fmtMoney(cost.available)}</Num>,
    });
  } else {
    costColumns.push({
      key: 'allocations',
      header: t('mill.costs.allocations', 'حُمّل من'),
      wrap: true,
      cell: (cost) =>
        cost.allocations === null ? (
          <span className="text-ink-muted" data-action="allocations-hidden">
            {t('mill.costs.allocations_hidden', 'محمَّلة من مصاريف وحدة خارج نطاقك')}
          </span>
        ) : cost.allocations.length ? (
          <ul className="flex flex-col gap-0.5">
            {cost.allocations.map((allocation) => (
              <li key={allocation.expenseId}>
                {t('mill.costs.allocation', '{day} · {label}: {amount}', { day: fmtDay(allocation.onDate), label: allocation.label, amount: fmtMoney(allocation.amount) })}
              </li>
            ))}
          </ul>
        ) : (
          dash()
        ),
    });
  }
  if (editCosts) {
    costColumns.push({
      key: 'actions',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (cost) => (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setRemovingCost(cost)} data-action="remove-cost">
          {t('common.delete', 'احذف')}
        </Button>
      ),
    });
  }

  const loaded = categories.data ?? [];
  const allCategories = [...loaded, ...madeCategories.filter((made) => !loaded.some((category) => category.id === made.id))];
  const freeCategories = allCategories.filter((category) => !costRows.some((cost) => cost.categoryId === category.id));
  // وحدة مخزن المدخلات (ق١٥): التكاليف تُحمَّل من مصاريفها وحدها، فالتلميح والتنبيه يسمّيانها.
  const division = preview?.inputWarehouse ?? null;
  const newCostValue = newCost.amount.trim() === '' ? null : parseMoney(newCost.amount);
  const newCostOk = newCost.categoryId !== '' && newCostValue !== null && newCostValue > 0n;
  const problems = preview?.problems ?? [];
  const unfunded = problems.filter((problem) => problem.code === 'costs_unfunded');
  const otherProblems = problems.filter((problem) => problem.code !== 'costs_unfunded');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('mill.batch.title', 'دفعة «{name}»', { name: batch.recipeName })}
        subtitle={
          <>
            {fmtDay(batch.producedOn)}
            {batch.docNo ? ` · ${batch.docNo}` : ''}
          </>
        }
        actions={
          <Link to="/mill" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="back-to-mill">
            {t('mill.back', 'المعمل')}
          </Link>
        }
      />

      {batch.status === 'posted' ? (
        <Notice
          tone="info"
          title={t('mill.trace.output', 'دخل الناتج {qty} من «{item}» مخزن «{store}» بدفعة {doc}.', {
            qty: fmtQty(batch.outputQtyKg, 'kg').main,
            item: batch.outputItem.name,
            store: batch.outputWarehouse.name,
            doc: batch.docNo ?? dash(),
          })}
          action={
            <Link
              to={`/inventory/items/${batch.outputItem.id}?wh=${batch.outputWarehouse.id}&tab=lots`}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200"
              data-action="open-output-lots"
            >
              {t('mill.trace.output_lots', 'افتح وجبات العلف في مخزنه')}
            </Link>
          }
        >
          {t('mill.trace.inputs', 'سُحبت المواد من «{store}»، وعمود «من أيّ وجبات» في الجدول يدلّ على مصدر كلّ مادّة.', { store: batch.inputWarehouse.name })}
        </Notice>
      ) : null}

      <Stats
        stats={[
          { key: 'planned', label: t('mill.stat.planned', 'المخطّط'), value: <Num>{fmtQty(batch.plannedKg, 'kg').main}</Num> },
          { key: 'mass', label: t('mill.stat.mass', 'كتلة المواد'), value: <Num>{fmtQty(mass, 'kg').main}</Num> },
          { key: 'output', label: t('mill.stat.output', 'الناتج'), value: <Num>{fmtQty(output, 'kg').main}</Num> },
          {
            key: 'shrink',
            label: t('mill.stat.shrink', 'الهدر'),
            value: <Num>{mass > 0n ? pct(shrink, mass) : fmtQty(shrink, 'kg').main}</Num>,
          },
        ]}
      />

      {costPerKg !== null || totalValue !== null ? (
        <Stats
          stats={[
            { key: 'materials', label: t('mill.stat.materials', 'قيمة المواد'), value: <Num>{inputValue === null ? dash() : fmtMoney(inputValue)}</Num> },
            { key: 'extra', label: t('mill.stat.extra', 'التكاليف'), value: <Num>{extraValue === null ? dash() : fmtMoney(extraValue)}</Num> },
            { key: 'total', label: t('mill.stat.total', 'كلفة الدفعة'), value: <Num>{totalValue === null ? dash() : fmtMoney(totalValue)}</Num> },
            { key: 'cost', label: t('mill.stat.cost', 'كلفة الكيلو'), value: <Num>{costPerKg === null ? dash() : fmtMoney(costPerKg)}</Num> },
          ]}
        />
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('mill.batch.materials', 'المواد')}</h2>
        <DataTable
          caption={t('mill.batch.caption', 'مواد الدفعة وما يُسحب من كلّ واحدة')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={t('mill.batch.empty', 'لا مواد في هذه الدفعة.')}
          totalLabel={costShown && inputValue !== null ? t('mill.detail.total', 'المجموع') : undefined}
        />
        {editInputs ? (
          <div>
            <Button variant="secondary" icon={<Plus className="size-5" aria-hidden="true" />} onClick={() => setAdding(true)} data-action="add-input">
              {t('mill.input.add', 'أضف مادّة')}
            </Button>
          </div>
        ) : null}
      </section>

      {costShown ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('mill.costs.title', 'التكاليف')}</h2>
          <p className="text-sm text-ink-muted">
            {draft && division
              ? t('mill.costs.hint_division', 'محسوبة من تكاليف الخلطة لكلّ طنّ بكمية هذه الدفعة، وتُعدَّل هنا. عند الإنتاج يُحمَّل كلّ سطر من مصاريف وحدة «{division}» المسجّلة بفئته، الأقدم فالأحدث؛ مصروف على وحدة أخرى لا يُحسب هنا.', { division: division.divisionName })
              : draft
                ? t('mill.costs.hint', 'محسوبة من تكاليف الخلطة لكلّ طنّ بكمية هذه الدفعة، وتُعدَّل هنا. عند الإنتاج يُحمَّل كلّ سطر من المصاريف المسجّلة بفئته، الأقدم فالأحدث.')
                : t('mill.costs.posted_hint', 'حُمّل كلّ سطر من المصاريف المسجّلة بفئته، ودخل مع المواد في كلفة العلف.')}
          </p>
          <DataTable
            caption={t('mill.costs.caption', 'تكاليف الدفعة ومن أين تُحمَّل')}
            columns={costColumns}
            rows={costRows}
            rowKey={(cost) => cost.id}
            empty={t('mill.costs.empty', 'لا تكاليف على هذه الدفعة.')}
            totalLabel={extraValue === null ? undefined : t('mill.detail.total', 'المجموع')}
          />
          {editCosts ? (
            categories.error ? (
              <LoadFailed what={t('mill.costs.categories', 'فئات المصاريف')} error={categories.error} onRetry={categories.retry} />
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <Field id={`${fieldId}-new-cost-category`} label={t('mill.costs.category', 'التكلفة')}>
                    <select
                      id={`${fieldId}-new-cost-category`}
                      className="input"
                      value={newCost.categoryId}
                      onChange={(event) => setNewCost((current) => ({ ...current, categoryId: event.target.value }))}
                      data-action="new-cost-category"
                    >
                      <option value="">{t('mill.rates.category_pick', 'اختر فئة المصروف')}</option>
                      {freeCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id={`${fieldId}-new-cost-amount`} label={t('mill.costs.amount_dinar', 'المبلغ (دينار)')}>
                    <input
                      id={`${fieldId}-new-cost-amount`}
                      className="input text-end tabular-nums"
                      inputMode="decimal"
                      dir="ltr"
                      value={newCost.amount}
                      onChange={(event) => setNewCost((current) => ({ ...current, amount: event.target.value }))}
                      data-action="new-cost-amount"
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    icon={<Plus className="size-5" aria-hidden="true" />}
                    busy={busy}
                    disabled={!newCostOk}
                    onClick={() => {
                      if (!newCostOk || newCostValue === null) return;
                      const slot = `cost:${batch.id}:${newCost.categoryId}`;
                      const categoryId = newCost.categoryId;
                      void act(async () => {
                        await addBatchCost(batch.id, millRef(slot), categoryId, newCostValue);
                        forgetMillRef(slot);
                        setNewCost({ categoryId: '', amount: '' });
                      });
                    }}
                    data-action="add-cost"
                  >
                    {t('mill.costs.add', 'أضف سطر تكلفة')}
                  </Button>
                </div>
                <NewCategoryField
                  id={`${fieldId}-new-category`}
                  categories={allCategories}
                  canManage={canCategories}
                  onPick={(category) => {
                    setMadeCategories((current) => (current.some((made) => made.id === category.id) ? current : [...current, category]));
                    if (!costRows.some((cost) => cost.categoryId === category.id)) setNewCost((current) => ({ ...current, categoryId: category.id }));
                  }}
                />
              </>
            )
          ) : null}
        </section>
      ) : null}

      {unfunded.map((problem, index) => {
        const line = costRows.find((cost) => cost.categoryId === problem.categoryId) ?? null;
        const record = division ? recordExpenseHref(problem, division.divisionId, batch.id) : null;
        return (
          <Notice
            key={`${problem.categoryId ?? 'unfunded'}-${index}`}
            tone="warning"
            title={division ? unfundedText(problem, division.divisionName) : problemText('costs_unfunded')}
            action={
              <span className="flex flex-wrap gap-2">
                {canExpense && record ? (
                  <Link to={record} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="record-expense">
                    {t('mill.unfunded.record', 'سجّل مصروفاً')}
                  </Link>
                ) : null}
                {line && editCosts ? (
                  <Button size="sm" variant="secondary" busy={busy} onClick={() => saveAmount(line, 0n)} data-action="zero-cost">
                    {t('mill.unfunded.zero', 'صفّر السطر')}
                  </Button>
                ) : null}
              </span>
            }
          />
        );
      })}

      {otherProblems.length ? (
        <Notice tone="warning" title={t('mill.problems.title', 'قبل الإنتاج:')}>
          {otherProblems.map(problemLine).join(' · ')}
        </Notice>
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}

      {draft && canDraft ? (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('mill.weigh.title', 'وزن الناتج')}</h2>
          <p className="text-sm text-ink-muted">{t('mill.weigh.hint', 'اتركه فارغاً إن لم تزنه: يُحسب الناتج بكتلة المواد نفسها (بلا هدر).')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${fieldId}-weight`} label={t('mill.weigh.kg', 'الوزن بالكيلوغرام')} error={weightBad ? t('mill.weigh.bad', 'اكتب وزناً أكبر من صفر.') : undefined}>
              <input
                id={`${fieldId}-weight`}
                className="input tabular-nums"
                inputMode="decimal"
                dir="ltr"
                value={shownWeight}
                onChange={(event) => {
                  setTouched(true);
                  setWeight(event.target.value);
                }}
              />
            </Field>
            <Field id={`${fieldId}-reason`} label={t('mill.weigh.reason', 'سبب الهدر (إن خرج عن المدى)')}>
              <input id={`${fieldId}-reason`} className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
          <Button variant="secondary" busy={busy} disabled={weightBad} onClick={saveWeight} data-action="save-weight">
            {t('mill.weigh.save', 'احفظ الوزن')}
          </Button>
        </section>
      ) : null}

      {draft ? (
        <div className="flex flex-wrap gap-2">
          {canPost ? (
            <Button
              size="lg"
              icon={<Factory className="size-5" aria-hidden="true" />}
              busy={busy}
              disabled={!preview?.canPost}
              onClick={post}
              data-action="post-production"
            >
              {t('mill.post', 'أنتج الآن')}
            </Button>
          ) : null}
          {!batch.costsConfirmed && canSeal ? (
            <Button variant="secondary" busy={busy} onClick={() => void act(() => confirmCosts(batch.id, batch.version))} data-action="seal-costs">
              {t('mill.seal', 'اختم الكلف')}
            </Button>
          ) : null}
          {canDraft ? (
            <Button variant="ghost" icon={<Trash2 className="size-5" aria-hidden="true" />} busy={busy} onClick={() => setDiscarding(true)} data-action="discard-batch">
              {t('mill.discard', 'احذف المسوّدة')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {batch.status === 'posted' && canVoid ? (
        <Button variant="danger" onClick={() => setVoiding(true)} data-action="void-batch">
          {t('mill.void', 'ألغِ الدفعة')}
        </Button>
      ) : null}
      {batch.status === 'void' ? <Notice tone="info" title={t('mill.void.done', 'هذه الدفعة ملغاة.')}>{batch.voidReason}</Notice> : null}

      {adding ? (
        <InputDialog
          batch={batch}
          replacing={null}
          exclude={exclude}
          canFixKind={canFixKind}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            retry();
          }}
        />
      ) : null}
      {replacing ? (
        <InputDialog
          batch={batch}
          replacing={replacing}
          exclude={exclude}
          canFixKind={canFixKind}
          onClose={() => setReplacing(null)}
          onSaved={() => {
            setReplacing(null);
            retry();
          }}
        />
      ) : null}
      {discarding ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.discard.title', 'احذف مسوّدة الدفعة')}
          consequence={t('mill.discard.body', 'تُلغى مسوّدة دفعة «{recipe}» ({kg}) بموادّها المعدّلة وأسباب التبديل وتكاليفها، بلا رقم ولا حركات، ولا ترجع. الخلطة لا تتغيّر.', {
            recipe: batch.recipeName,
            kg: fmtQty(batch.plannedKg, 'kg').main,
          })}
          confirmLabel={t('mill.discard', 'احذف المسوّدة')}
          busy={busy}
          action="confirm-discard"
          onConfirm={() => void discard()}
          onCancel={() => setDiscarding(false)}
        />
      ) : null}
      {removingInput ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.input.remove.title', 'حذف «{name}» من الدفعة؟', { name: removingInput.itemName })}
          consequence={t('mill.input.remove.body', 'لا تُسحب هذه المادّة في هذه الدفعة، وتنقص كتلتها من الناتج؛ الخلطة نفسها لا تتغيّر.')}
          confirmLabel={t('common.delete', 'احذف')}
          busy={busy}
          action="confirm-remove-input"
          onConfirm={() =>
            void act(async () => {
              await deleteProductionInput(removingInput.id, batch.version);
              setRemovingInput(null);
            })
          }
          onCancel={() => setRemovingInput(null)}
        />
      ) : null}
      {removingCost ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.costs.remove.title', 'حذف تكلفة «{name}» من الدفعة؟', { name: removingCost.categoryName })}
          consequence={t('mill.costs.remove.body', 'لا تُحمَّل هذه التكلفة على العلف في هذه الدفعة، ويُفكّ ختم الكلف إن كان مختوماً.')}
          confirmLabel={t('common.delete', 'احذف')}
          busy={busy}
          action="confirm-remove-cost"
          onConfirm={() =>
            void act(async () => {
              await deleteBatchCost(removingCost.id, batch.version);
              setRemovingCost(null);
            })
          }
          onCancel={() => setRemovingCost(null)}
        />
      ) : null}
      {voiding ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.void.confirm.title', 'إلغاء دفعة «{name}»؟', { name: batch.recipeName })}
          consequence={t('mill.void.confirm.body', 'ترجع المواد إلى دفعاتها في مخزن المواد، وتُلغى دفعة العلف الناتجة. إن كان قد صُرف من هذا العلف شيء فلن يُقبل الإلغاء.')}
          confirmLabel={t('mill.void', 'ألغِ الدفعة')}
          busy={busy}
          onConfirm={() => void kill()}
          onCancel={() => setVoiding(false)}
        />
      ) : null}
    </div>
  );
}
