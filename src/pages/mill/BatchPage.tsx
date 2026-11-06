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
import { parseDayText } from '../../lib/dayText';
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
import { CellEdit, MaterialPicker, NewCategoryField, NO_CATEGORY_DRAFT, unitWord, useDrafts, type CategoryDraft, type PickedMaterial } from './pickers';
import { dash, forgetMillRef, millRef, pct, Stats, useKeptLoad } from './shared';

// بطاقة دفعة الإنتاج (0015): المسوّدة تُعرض بمعاينتها (ما سيُسحب من كلّ مادّة، والهدر، وكلفة الكيلو) قبل «أنتج الآن»؛
// والمرحَّلة بأرقامها وبزرّ الإلغاء. الرفض يُعرض كما هو من الخادم، ولا يُرحَّل شيء لم يره المستخدم (بصمة المعاينة).
// النسخة الثانية (0016، كلمة المالك 2026-11-04: «امكانية اختيار وتعديل كميات المواد… وبعدها المادة المنتجة تروح لمخزن خاص
// واعرف منين صنعتها بالضبط»): المواد بالمخطّط بالتناسب والفعلي قابلاً للتعديل، و«أضف مادّة» و«بدّل مادّة» بسبب و«احذف»؛
// وجدول التكاليف (المحسوب من الخلطة، والمبلغ قابلاً للتعديل، والمتاح من المصاريف لكلّ سطر)؛ والكلفة الكلّية مواد + تكاليف؛
// و«المصاريف لا تكفي» بجملة وفعل؛ والمرحَّلة تقول أين ذهب الناتج ومن أين سُحبت كلّ مادّة.
// إصلاحات المراجعة: مفتاح معرّف المادّة المضافة يحمل كميتها وسببها (م٢)؛ فئة المصروف من مكانها (م٣)؛ «المصاريف لا تكفي» وتلميح
// التكاليف يسمّيان وحدة مخزن المدخلات، و«سجّل مصروفاً» يعبّئ النافذة ويرجع إلى الدفعة (م٤)؛ حذف المسوّدة بتأكيد (م١٠)؛ الوقود
// والتعبئة «خارج الكتلة» (م١١)؛ التحميلات والمتاح المحجوبة بلا أرقام (م١٢)؛ والناتج المنتهي بجملة تسمّي التاريخين (م١٤).
// الجولة الثانية: «أنتج الآن» بسياق الختم، فمشغّل المعمل يراه بعد ختم الكلف (ب١)؛ كتابة التكاليف وختمها وتسجيل المصروف والفئة
// الجديدة لمن يرى مصاريف وحدة المدخلات وحده (ب٢، expenses_visible)، ومشكلتا costs_unsealed_scope وno_mass_inputs بجملتيهما؛
// طرفا الدفعة في النطاق (ب٣، scope): بلا مخزن المواد لا معاينة ولا فعل ولا إلغاء ولا رابط دفتر، وبلا مخزن العلف لا رابط وجباته؛
// «سجّل مصروفاً» يسأل قبل أن يضيّع ما كُتب ولم يُحفظ (ب٤)؛ سبب الهدر وتاريخ انتهاء الناتج يبدآن من المحفوظ ويتبعان الكتابة
// (ب٥، ب٦)؛ والملغاة «أُوقف تحميلها بالإلغاء» (ب٧)؛ ونصّ «فئة جديدة» في الصفحة (ب١١).
// الجولة الثالثة: «أنتج الآن» معطَّل ما دام في الصفحة مكتوب لم يُحفظ، وتحته جملة تسمّيه (ب٢١، درس WP8: الترحيل لا يأخذ من الشاشة إلّا
// المحفوظ)؛ وأثناء الحفظ يُقفل قسم الوزن ورابط «سجّل مصروفاً»، ولا يُفرَّغ حقل إلّا إن بقي كما أُرسل، ونافذة «لم يُحفظ» تُغلق حين يُحفظ
// ما فيها (ب٢٢)؛ ويوم الإنتاج يُعدَّل في المسوّدة بيوم تقويم فتُصحَّح المسوّدة القديمة بدل أن تُحذف (ب٢٦)؛ ووجبات مخزن المواد لمن هو
// خارج نطاقه جملةٌ بلا رابط (ب٢٨، draws = null).
// الجولة الرابعة: قاعدة ب٢٢ للصفحة كلّها — خانتا الكمية الفعلية ومبلغ سطر التكلفة وحقلا السطر الجديد و«فئة جديدة» مقفولة أثناء الحفظ،
// وEnter لا يحفظ أثناءه، ولا يُمسح مسوَّد إلّا إن بقي كما أُرسل (ب٣٢)؛ والبطاقة والمعاينة من نسخة واحدة، وإلّا تُعادان (ب٣٣)؛
// و«اختم الكلف» يقف عند مبلغ لم يُحفظ (ب٣٤)؛ و«أرجع ما لم يُحفظ» يعيد الصفحة إلى المحفوظ، ويوم الإنتاج الفارغ غير مكتوب (ب٣٥).
// الجولة الخامسة: رفض «تغيّر من نافذة أو جهاز آخر» (qty_changed وamount_changed وstale_draft وstale_preview) يقرأ الدفعة من جديد، والخانة
// المرفوضة تبقى بما كتبه المستخدم مشروطةً بالمقروء الجديد، وجملة تقول المحفوظ الآن، و«أرجع» يرجع إلى آخر ما قُرئ (ب٤٢)؛ والصفحة تبقى
// مرسومة أثناء القراءة من جديد فلا تُطوى نافذة ولا يُمحى ما فيها، والأفعال و«أضف مادّة» و«بدّل» و«احذف» معطَّلة أثناء الحفظ والقراءة (ب٤٣).

/** رفض «تغيّر من نافذة أو جهاز آخر» (ب٤٢): الدفعة تُقرأ من جديد، فالحفظ أو الختم أو الترحيل التالي بما يعرضه الخادم الآن. */
const CHANGED_ELSEWHERE = new Set(['qty_changed', 'amount_changed', 'stale_draft', 'stale_preview']);
const changedElsewhere = (problem: unknown): boolean => problem instanceof RejectedError && CHANGED_ELSEWHERE.has(problem.code);

/**
 * رفض «تغيّر من جهاز آخر» ينتظر قراءته الجديدة (ب٤٢): seen ما كان معروضاً لحظة الرفض (القراءة الجديدة غيره)، وcell الخانة المرفوضة
 * (الكمية الفعلية لسطر، أو مبلغ سطر تكلفة) أو null لرفض الدفعة كلّها (stale_draft وstale_preview)، وrebased بعد أن صار شرطها المقروء الجديد.
 */
interface Conflict {
  seen: BatchState;
  cell: { kind: 'actual' | 'amount'; id: string } | null;
  rebased: boolean;
}

interface BatchState {
  batch: ProductionBatch;
  preview: ProductionPreview | null;
  /** البطاقة والمعاينة بنسختين مختلفتين بعد كلّ المحاولات (ب٣٣): الصفحة تقول ذلك، ولا تُرحَّل نسخة لم تُعرض. */
  stale: boolean;
}

/** محاولات قراءة البطاقة والمعاينة بنسخة واحدة (ب٣٣): جهاز آخر يحفظ بين القراءتين فتُعادان. */
const READ_TRIES = 3;

/** السطر الجديد فارغاً: لا فئة ولا مبلغ. */
const NO_NEW_COST = { categoryId: '', amount: '' };

const PROBLEM_TEXT: Readonly<Record<string, () => string>> = {
  insufficient_stock: () => t('mill.problem.short', 'الرصيد لا يكفي'),
  shrink_out_of_range: () => t('mill.problem.shrink', 'الهدر خارج المدى المقبول: اكتب سببه'),
  expiry_required: () => t('mill.problem.expiry', 'الناتج يُتابَع انتهاؤه: اكتب تاريخ الانتهاء'),
  costs_pending: () => t('mill.problem.costs', 'الكلف لم تُختَم بعد: يختمها المحاسب أو المدير'),
  item_archived: () => t('mill.problem.archived', 'المادّة مؤرشفة'),
  costs_unfunded: () => t('mill.problem.unfunded', 'تكاليف الدفعة أكبر من المتاح في المصاريف المسجّلة: يسجّل المحاسب أو المدير المصروف أوّلاً أو يقلّل المبلغ'),
  output_expired: () => t('mill.problem.output_expired', 'تاريخ انتهاء الناتج قبل يوم الإنتاج: صحّح التاريخ قبل الترحيل'),
  costs_unsealed_scope: () => t('mill.problem.unsealed_scope', 'تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة خارج نطاقك: يختمها محاسب أو مدير يرى تلك الوحدة، ثمّ تُرحَّل.'),
  no_mass_inputs: () => t('mill.problem.no_mass', 'الدفعة بلا مادّة داخل الكتلة: أضف مادّة أوّلية؛ الوقود والتعبئة وحدهما لا يصنعان علفاً.'),
};

export const problemText = (code: string): string => (PROBLEM_TEXT[code] ?? (() => t('mill.problem.other', 'مشكلة في الدفعة: {code}', { code })))();

/**
 * جملة مشكلة من مشاكل المعاينة: الناتج المنتهي يسمّي التاريخين (ق٨، م١٤)، والتكاليف المحمَّلة من وحدة خارج النطاق تسمّي الوحدة
 * (ق٢١، ب٢)، ومشكلة التاريخ بجملة الخادم (hint)، ومشكلة المادّة تسمّي المادّة، وغيرها بجملتها.
 */
export function problemLine(problem: MillProblem): string {
  if (problem.code === 'output_expired' && problem.expiryOn !== null && problem.producedOn !== null) {
    return t('mill.problem.output_expired_named', 'تاريخ انتهاء الناتج {expiry} قبل يوم الإنتاج {produced}: صحّح تاريخ الانتهاء قبل الترحيل.', {
      expiry: fmtDay(problem.expiryOn),
      produced: fmtDay(problem.producedOn),
    });
  }
  if (problem.code === 'costs_unsealed_scope' && problem.divisionName !== null) {
    return t('mill.problem.unsealed_scope_named', 'تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «{division}» خارج نطاقك: يختمها محاسب أو مدير يرى تلك الوحدة، ثمّ تُرحَّل.', {
      division: problem.divisionName,
    });
  }
  // مشكلة التاريخ (أقدم من سبعة أيام، أو قفل الفترة): الخادم يرسل جملتها بتواريخها، فلا يظهر الرمز الخام.
  if (problem.hint !== null) return problem.hint;
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

/**
 * الوجبات التي سُحبت منها مادّة (المرحَّلة)، وبلاها رابط دفتر المادّة في مخزن المدخلات حيث حركة السحب برقم الدفعة؛ ومن لا يكون
 * مخزن المدخلات بنطاقه (ق٢٥، ب٣) يرى «دفتر المادّة» نصّاً بلا رابط، فالدفتر لا يُفتح له. والخادم لا يرسل له الوجبات أصلاً (ق٣٢،
 * draws = null): لا يرى وجبات مخزن المواد ولا استلاماتها، فالخانة تقول ذلك بلا رابط (ب٢٨).
 */
function DrawsCell({ draws, itemId, unit, warehouseId, linked }: { draws: readonly LotDraw[] | null; itemId: string; unit: BaseUnit; warehouseId: string; linked: boolean }) {
  if (draws === null && !linked) {
    return (
      <span className="text-ink-muted" data-action="draws-hidden">
        {t('mill.trace.draws_hidden', 'وجبات مخزن المواد خارج نطاقك')}
      </span>
    );
  }
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
  if (!linked) {
    return (
      <span className="text-ink-muted" data-action="item-ledger-text">
        {t('mill.trace.ledger', 'دفتر المادّة')}
      </span>
    );
  }
  return (
    <Link to={`/inventory/items/${itemId}/details?wh=${warehouseId}&tab=moves`} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-item-ledger">
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
  const canDraft = role !== null && can(role, 'production.draft');
  const canVoid = role !== null && can(role, 'void');
  const canSeal = role !== null && can(role, 'costs.load');
  const canCosts = canSeal && costs;
  const canExpense = role !== null && can(role, 'expense.post');
  const canCategories = role !== null && can(role, 'expense_categories.manage');
  const canFixKind = role !== null && can(role, 'stores.manage');

  const load = useCallback(async (): Promise<BatchState> => {
    for (let attempt = 1; ; attempt += 1) {
      const batch = await loadBatch(id);
      // المعاينة بنطاق مخزن المدخلات وحده (ق٢٥، ب٣): من يقرأ الدفعة من طرف العلف لا يُطلب له ما يرفضه الخادم، فلا تفشل الصفحة.
      if (batch.status !== 'draft' || !batch.scope.input) return { batch, preview: null, stale: false };
      const preview = await previewProduction(id);
      // القراءتان بنداءين (ب٣٣): إن حفظ جهاز آخر بينهما (يوم الإنتاج أو الوزن…) فالمعاينة بنسخة غير التي تعرضها الصفحة، و«أنتج الآن»
      // يرسل نسخة المعاينة وبصمتها؛ فتُعادان معاً حتّى تتطابقا، وإلّا لا ترحيل بنسخة لم تُعرض.
      const stale = preview.version !== batch.version;
      if (!stale || attempt >= READ_TRIES) return { batch, preview, stale };
    }
  }, [id]);
  // الدفعة تبقى مرسومة بآخر ما قُرئ لها أثناء القراءة من جديد (ب٤٣)، فلا تُطوى نافذة مفتوحة ولا يُمحى ما فيها، والأفعال معطَّلة حتّى تصل.
  const { data, error, loading, refreshing, retry } = useKeptLoad<BatchState>(load, id);
  const loadCategories = useCallback((): Promise<CategoryOption[]> => (canCosts ? loadExpenseCategories() : Promise.resolve([])), [canCosts]);
  const categories = useLoad<CategoryOption[]>(loadCategories, `${canCosts}`);
  // حقول قسم الوزن: null = لم يُكتب فيه فيُعرض المحفوظ ويتبعه، ونصّ = ما كتبه المستخدم (ب٥، ب٦، ب٢٦).
  const [weight, setWeight] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [producedDay, setProducedDay] = useState<string | null>(null);
  const [working, setBusy] = useState(false);
  const busy = working || refreshing;
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<MaterialRow | null>(null);
  const [removingInput, setRemovingInput] = useState<MaterialRow | null>(null);
  const [removingCost, setRemovingCost] = useState<BatchCost | null>(null);
  const [newCost, setNewCost] = useState(NO_NEW_COST);
  const [madeCategories, setMadeCategories] = useState<readonly CategoryOption[]>([]);
  const [category, setCategory] = useState<CategoryDraft>(NO_CATEGORY_DRAFT);
  const [discarding, setDiscarding] = useState(false);
  /** رابط «سجّل مصروفاً» ينتظر التأكيد لأنّ في الصفحة ما كُتب ولم يُحفظ (ب٤). */
  const [leaving, setLeaving] = useState<string | null>(null);
  const actuals = useDrafts<bigint | null>();
  const amounts = useDrafts<Fils>();

  const batch = data?.batch ?? null;
  const preview = data?.preview ?? null;
  const stale = data?.stale ?? false;
  const rows = useMemo(() => (batch ? materialRows(batch, preview) : []), [batch, preview]);
  const decimals = useMemo(
    () => columnDecimals(rows.flatMap((row) => [row.plannedQty, row.drawQty, row.actualQty ?? 0n]), 3) as 0 | 1 | 2 | 3,
    [rows],
  );
  const exclude = useMemo(() => new Set(rows.map((row) => row.itemId)), [rows]);

  if (error) return <LoadFailed what={t('mill.batch.what', 'دفعة الإنتاج')} error={error} onRetry={retry} />;
  if (loading || !batch) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  const draft = batch.status === 'draft';
  const inputScope = batch.scope.input;
  // مسوّدة يقرؤها من نطاقه مخزن العلف وحده (ق٢٥، ب٣): تُعمل من طرف المواد، فلا معاينة لها ولا فعل هنا.
  const blind = draft && !inputScope;
  // مشغّل المعمل يرحّل بعد ختم الكلف وحده (ب١): السياق من الدفعة، كما يشترطه الخادم.
  const canPost = role !== null && can(role, 'production.post', { costsConfirmed: batch.costsConfirmed });
  // يرى مصاريف وحدة مخزن المدخلات (ق٢١، ب٢): بلاها لا يكتب مبلغ تكلفة ولا يختمها ولا يسجّل مصروفاً منها.
  const expensesVisible = batch.expensesVisible;
  const editInputs = draft && canDraft && inputScope;
  const costLines = preview?.costs ?? batch.costs;
  const costShown = costLines !== null && !blind;

  // ب٤٢: وصلت القراءة الجديدة بعد رفض «تغيّر من جهاز آخر»: شرط الخانة المرفوضة يصير ما قُرئ الآن ويبقى نصّها كما كتبه المستخدم، فالحفظ
  // التالي المقصود ينجح ولا يُرفض ثانيةً بشرط ما قبل الرفض. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (rebased)، فلا أثر جانبي ولا حلقة.
  if (conflict && !conflict.rebased && data !== conflict.seen) {
    const cell = conflict.cell;
    if (cell?.kind === 'actual') {
      const row = rows.find((entry) => entry.id === cell.id);
      if (row) actuals.rebase(row.id, row.actualQty, row.actualQty === null ? '' : decimalText(row.actualQty, 3));
    } else if (cell?.kind === 'amount') {
      const cost = (costLines ?? []).find((entry) => entry.id === cell.id);
      if (cost) amounts.rebase(cost.id, cost.amount, decimalText(cost.amount, 2));
    }
    setConflict({ ...conflict, rebased: true });
  }

  /**
   * كلّ كتابة من الصفحة: بعد النجاح تُقرأ الدفعة من جديد؛ ورفض «تغيّر من نافذة أو جهاز آخر» (ب٤٢) يقرؤها من جديد أيضاً — كان النجاح وحده
   * يقرأ، فبقيت الصفحة على لقطتها و«أرجع» إليها، وكلّ حفظ أو ختم أو ترحيل بعده يُرفض بالجملة نفسها — والخانة المرفوضة (cell) يُعاد
   * شرطها إلى المقروء الجديد حين يصل.
   */
  const act = async (run: () => Promise<unknown>, done?: string, cell: Conflict['cell'] = null): Promise<boolean> => {
    setBusy(true);
    setFailure(null);
    setConflict(null);
    try {
      await run();
      if (done) toast({ tone: 'success', title: done });
      retry();
      return true;
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
      if (data && changedElsewhere(problem)) {
        setConflict({ seen: data, cell, rebased: false });
        retry();
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  // الحقول تبدأ من المحفوظ (إن وُجد) وتتبع الكتابة بعدها، فلا تُداس كتابة المستخدم بكلّ قراءة (درس WP5)، ولا يُرسل منها إلّا ما
  // كتبه المستخدم: حفظ الوزن لا يمسح سبباً أو تاريخاً محفوظاً لم يُعِد كتابته (ب٥).
  const savedWeight = batch.outputQtyKg > 0n ? decimalText(batch.outputQtyKg, 3) : '';
  const shownWeight = weight ?? savedWeight;
  const typedWeight = shownWeight.trim() === '' ? null : parseQty(shownWeight);
  const weightBad = shownWeight.trim() !== '' && (typedWeight === null || typedWeight <= 0n);
  const savedReason = batch.shrinkReason ?? '';
  const shownReason = reason ?? savedReason;
  const problems = preview?.problems ?? [];
  // تاريخ انتهاء الناتج (ب٦): يوم تقويم (parseDayText، لا تاريخ ترحيل)، ويظهر حين يُتابَع انتهاء المنتج أو تطلبه المعاينة.
  const expiryShown = batch.outputItem.tracksExpiry || problems.some((problem) => problem.code === 'expiry_required' || problem.code === 'output_expired');
  const savedExpiry = batch.outputExpiryOn ? fmtDay(batch.outputExpiryOn) : '';
  const shownExpiry = expiry ?? savedExpiry;
  const typedExpiry = shownExpiry.trim() === '' ? null : parseDayText(shownExpiry);
  const expiryBad = shownExpiry.trim() !== '' && typedExpiry === null;
  // يوم الإنتاج (ب٢٦): يوم تقويم إلزامي بـparseDayText كتاريخ الانتهاء (فلا تنفصل حزمة حقل التاريخ)، والخادم يحكم عليه بمعاينته
  // وجملته (أقدم من سبعة أيام، أو فترة مقفلة)؛ فالمسوّدة التي كبرت على يومها يُصحَّح يومها بدل أن تُحذف.
  const savedDay = fmtDay(batch.producedOn);
  const shownDay = producedDay ?? savedDay;
  // يوم الإنتاج إلزامي فلا معنى لفراغه (ب٣٥): الحقل الفارغ غير مكتوب — لا يدخل قائمة ما لم يُحفظ ولا يُرسل ولا يقفل «احفظ» — ويعود إلى
  // المحفوظ حين يُغادَر (onBlur).
  const dayTyped = producedDay !== null && producedDay.trim() !== '';
  const typedDay = dayTyped ? parseDayText(shownDay) : batch.producedOn;
  const dayBad = typedDay === null;
  const fieldsTouched = weight !== null || reason !== null || (expiryShown && expiry !== null) || dayTyped;

  const saveFields = () => {
    if (busy || weightBad || expiryBad || dayBad || !fieldsTouched) return;
    // ما أُرسل من كلّ حقل بنصّه (ب٢٢): بعد الحفظ لا يُفرَّغ حقل إلّا إن بقي المعروض فيه كما أُرسل، وما لم يُرسل لا يُمسّ، فلا يضيع
    // ما كُتب أثناء الحفظ (الحقول مقفولة أثناءه أصلاً).
    const sent = { weight, reason, expiry: expiryShown ? expiry : null, day: dayTyped ? producedDay : null };
    const fields: { producedOn?: string; outputQtyKg?: bigint | null; shrinkReason?: string | null; outputExpiryOn?: string | null } = {};
    if (sent.weight !== null) fields.outputQtyKg = typedWeight;
    if (sent.reason !== null) fields.shrinkReason = sent.reason.trim() === '' ? null : sent.reason;
    if (sent.expiry !== null) fields.outputExpiryOn = typedExpiry;
    if (sent.day !== null && typedDay !== null) fields.producedOn = typedDay;
    const settled = (was: string | null) => (now: string | null) => (was !== null && now === was ? null : now);
    void act(async () => {
      await setBatchFields(batch.id, fields);
      setWeight(settled(sent.weight));
      setReason(settled(sent.reason));
      setExpiry(settled(sent.expiry));
      setProducedDay(settled(sent.day));
    });
  };

  const discard = async () => {
    setBusy(true);
    setFailure(null);
    setConflict(null);
    try {
      await discardBatch(batch.id, batch.version);
      toast({ tone: 'success', title: t('mill.discarded', 'حُذفت مسوّدة الدفعة.') });
      navigate('/mill');
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
      setDiscarding(false);
      setBusy(false);
      // تغيّرت المسوّدة بعد فتحها (ب٤٢): تُقرأ من جديد، فالحذف التالي بنسختها الآن لا بالنسخة القديمة.
      if (data && changedElsewhere(problem)) {
        setConflict({ seen: data, cell: null, rebased: false });
        retry();
      }
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

  // بعد الحفظ (ب٣٢، قاعدة ب٢٢): يُمسح المسوَّد إن بقي نصّه كما أُرسل، وإلّا يبقى ما كُتب أثناء الحفظ (والخانة مقفولة أثناءه أصلاً)
  // مشروطاً بما حُفظ الآن، فلا تنفتح بوّابة «أنتج الآن» على القيمة الأقدم ولا يُرفض حفظه التالي «من جهاز آخر».
  const saveActual = (row: MaterialRow) => {
    const edit = actuals.get(row.id);
    if (busy || !edit) return;
    const value = edit.text.trim() === '' ? null : parseQty(edit.text);
    if (edit.text.trim() !== '' && (value === null || value <= 0n)) return;
    void act(
      async () => {
        await setInputActual(row.id, edit.before, value);
        actuals.settle(row.id, edit.text, value);
      },
      undefined,
      { kind: 'actual', id: row.id },
    );
  };

  const saveAmount = (cost: BatchCost, value: Fils) => {
    if (busy) return;
    const edit = amounts.get(cost.id);
    void act(
      async () => {
        await setBatchCost(cost.id, edit?.before ?? cost.amount, value);
        amounts.settle(cost.id, edit?.text ?? null, value);
      },
      undefined,
      { kind: 'amount', id: cost.id },
    );
  };

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
            disabled={busy}
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
      cell: (row) => <DrawsCell draws={row.detail?.draws ?? null} itemId={row.itemId} unit={row.baseUnit} warehouseId={batch.inputWarehouse.id} linked={inputScope} />,
    });
  }
  if (editInputs) {
    columns.push({
      key: 'actions',
      header: t('mill.col.actions', 'إجراءات'),
      // أثناء الحفظ والقراءة من جديد (ب٤٣): لا تُفتح نافذة تتبدّل الدفعة تحتها.
      cell: (row) => (
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<Repeat className="size-4" aria-hidden="true" />} disabled={busy} onClick={() => setReplacing(row)} data-action="replace-input">
            {t('mill.input.replace', 'بدّل')}
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={busy} onClick={() => setRemovingInput(row)} data-action="remove-input">
            {t('common.delete', 'احذف')}
          </Button>
        </span>
      ),
    });
  }

  const costRows = costLines ?? [];
  // كتابة التكاليف لمن يرى مصاريف وحدة المدخلات وحده (ق٢١، ب٢)، ومن طرف مخزن المواد (ق٢٥).
  const editCosts = draft && canCosts && expensesVisible && inputScope;
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
            disabled={busy}
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
        // الملغاة (ب٧): أُوقفت تحميلاتها كلّها بالإلغاء، فالجملة نفسها لكلّ قارئ بدل «خارج نطاقك».
        batch.status === 'void' ? (
          <span className="text-ink-muted" data-action="allocations-void">
            {t('mill.costs.allocations_void', 'أُوقف تحميلها بالإلغاء')}
          </span>
        ) : cost.allocations === null ? (
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
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={busy} onClick={() => setRemovingCost(cost)} data-action="remove-cost">
          {t('common.delete', 'احذف')}
        </Button>
      ),
    });
  }

  const loaded = categories.data ?? [];
  const allCategories = [...loaded, ...madeCategories.filter((made) => !loaded.some((option) => option.id === made.id))];
  const freeCategories = allCategories.filter((option) => !costRows.some((cost) => cost.categoryId === option.id));
  // وحدة مخزن المدخلات (ق١٥): التكاليف تُحمَّل من مصاريفها وحدها، فالتلميح والتنبيه يسمّيانها.
  const division = preview?.inputWarehouse ?? null;
  const newCostValue = newCost.amount.trim() === '' ? null : parseMoney(newCost.amount);
  // فئة صار لها سطر (أُضيف من جهاز آخر، أو بمحاولة ضاع جوابها ثمّ رُفضت amount_changed وقُرئت الدفعة، ب٤٢) لا تُضاف ثانيةً بالمعرّف نفسه
  // فتُرفض في حلقة: المبلغ يُعدَّل في سطرها.
  const newCostOk = newCost.categoryId !== '' && freeCategories.some((option) => option.id === newCost.categoryId) && newCostValue !== null && newCostValue > 0n;
  const unfunded = problems.filter((problem) => problem.code === 'costs_unfunded');
  const otherProblems = problems.filter((problem) => problem.code !== 'costs_unfunded');

  // ما كُتب ولم يُحفظ (ب٤): «سجّل مصروفاً» يغادر الصفحة، فيُسأل عنه بالاسم قبل أن يضيع؛ و«أنتج الآن» يرحّل المحفوظ وحده، فيُعطَّل
  // حتّى يُحفظ أو يُرجَع إلى المحفوظ (ب٢١، ب٣٥). القائمة من شرط editInputs، فتشمل مشغّل المعمل، ومن شرط editCosts للتكاليف؛ وبنود
  // التكاليف وحدها (costUnsaved) بوّابة «اختم الكلف» أيضاً (ب٣٤): الختم يأخذ المبالغ المحفوظة، ثمّ يرحّل بها مشغّل المعمل.
  const unsaved: string[] = [];
  const costUnsaved: string[] = [];
  if (editInputs) {
    if (weight !== null && (weightBad || (typedWeight ?? 0n) !== batch.outputQtyKg)) unsaved.push(t('mill.unsaved.weight', 'وزن الناتج'));
    if (reason !== null && shownReason.trim() !== savedReason.trim()) unsaved.push(t('mill.unsaved.reason', 'سبب الهدر'));
    if (expiryShown && expiry !== null && (expiryBad || typedExpiry !== batch.outputExpiryOn)) unsaved.push(t('mill.unsaved.expiry', 'تاريخ انتهاء الناتج'));
    if (dayTyped && (dayBad || typedDay !== batch.producedOn)) unsaved.push(t('mill.unsaved.produced_on', 'يوم الإنتاج'));
    for (const row of rows) {
      const edit = actuals.get(row.id);
      if (edit && edit.text !== (row.actualQty === null ? '' : decimalText(row.actualQty, 3))) unsaved.push(t('mill.unsaved.actual', 'الكمية الفعلية من «{name}»', { name: row.itemName }));
    }
  }
  if (editCosts) {
    for (const cost of costRows) {
      const edit = amounts.get(cost.id);
      if (edit && edit.text !== decimalText(cost.amount, 2)) costUnsaved.push(t('mill.unsaved.amount', 'مبلغ «{name}»', { name: cost.categoryName }));
    }
    if (newCost.categoryId !== '' || newCost.amount.trim() !== '') costUnsaved.push(t('mill.unsaved.new_cost', 'سطر التكلفة الجديد'));
    if (category.text.trim() !== '') costUnsaved.push(t('mill.unsaved.category', 'اسم الفئة الجديدة «{name}»', { name: category.text.trim() }));
    unsaved.push(...costUnsaved);
  }
  // نافذة «ما كتبته هنا لم يُحفظ» تُغلق إن صارت القائمة فارغة وهي مفتوحة (ب٢٢: حُفظ ما فيها، أو أُنشئت الفئة المكتوبة)، فلا تبقى بجملة
  // فارغة ولا تعود وحدها بكتابة لاحقة. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (نمط React «معلومة من رسم سابق»).
  if (leaving !== null && !unsaved.length) setLeaving(null);

  // بعد رفض «تغيّر من جهاز آخر» وقراءته الجديدة (ب٤٢): المحفوظ الآن وما كتبه المستخدم معاً — الخانة تبقى بما كتبه، والجملة تقول المحفوظ.
  const conflictNote = ((): string | null => {
    if (!conflict?.rebased) return null;
    const cell = conflict.cell;
    if (cell?.kind === 'actual') {
      const row = rows.find((entry) => entry.id === cell.id);
      if (row && actuals.get(cell.id)) {
        return t('mill.conflict.actual', 'المحفوظ الآن للكمية الفعلية من «{name}»: {saved}، وما كتبته باقٍ في خانته: احفظه ليحلّ محلّه.', {
          name: row.itemName,
          saved: row.actualQty === null ? t('mill.conflict.as_planned', 'فارغة (كما خُطّط)') : fmtQty(row.actualQty, row.baseUnit).main,
        });
      }
    } else if (cell?.kind === 'amount') {
      const cost = costRows.find((entry) => entry.id === cell.id);
      if (cost && amounts.get(cell.id)) {
        return t('mill.conflict.amount', 'المحفوظ الآن لمبلغ «{name}»: {saved}، وما كتبته باقٍ في خانته: احفظه ليحلّ محلّه.', { name: cost.categoryName, saved: fmtMoney(cost.amount) });
      }
    }
    return t('mill.conflict.batch', 'قُرئت الدفعة من جديد بما حُفظ الآن: راجعها ثمّ أعد المحاولة.');
  })();

  const post = () => {
    // الترحيل يأخذ المحفوظ وحده (ب٢١، درس WP8): ما كُتب ولم يُحفظ يُحفظ أو يُرجَع أوّلاً، والزرّ معطَّل حتّى ذلك؛ ونسخة المعاينة هي
    // نسخة البطاقة المعروضة (ب٣٣)، وإلّا لا ترحيل.
    if (!preview || stale || unsaved.length) return;
    void act(async () => {
      await postProduction(batch.id, preview.version, preview.planToken, millRef(`post:${batch.id}`));
      forgetMillRef(`post:${batch.id}`);
    }, t('mill.posted', 'تمّ الإنتاج: دخل العلف مخزنه.'));
  };

  const seal = () => {
    // الختم يأخذ المبالغ المحفوظة (ب٣٤): مبلغ أو سطر أو فئة لم تُحفظ يُحفظ أو يُرجَع أوّلاً، والزرّ معطَّل حتّى ذلك.
    if (busy || costUnsaved.length) return;
    void act(() => confirmCosts(batch.id, batch.version));
  };

  // «أرجع ما لم يُحفظ» (ب٣٥): المخرج الذي تسمّيه البوّابة — كلّ مسوّدات الصفحة إلى المحفوظ (حقول الوزن واليوم، والكميات الفعلية،
  // والمبالغ، والسطر الجديد، واسم الفئة الجديدة)، فلا يُضطرّ أحد إلى حفظ فراغ يمحو وزناً موزوناً. المسح المقصود للوزن يبقى بالحفظ.
  // والمحفوظ هو آخر ما قُرئ (ب٤٢): رفض «تغيّر من جهاز آخر» يقرأ الدفعة من جديد، فالإرجاع إلى ما في الخادم الآن لا إلى لقطة قديمة؛
  // وجملة الرفض («ما كتبته باقٍ») تذهب معه.
  const revert = () => {
    if (busy) return;
    setWeight(null);
    setReason(null);
    setExpiry(null);
    setProducedDay(null);
    actuals.reset();
    amounts.reset();
    setNewCost(NO_NEW_COST);
    setCategory((current) => ({ ...current, text: '', problem: null }));
    if (conflict) {
      setConflict(null);
      setFailure(null);
    }
  };
  const postGate = canPost && unsaved.length > 0;
  const sealShown = !batch.costsConfirmed && canSeal && expensesVisible;
  const sealGate = sealShown && costUnsaved.length > 0;

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

      {blind ? (
        <Notice
          tone="info"
          title={t('mill.batch.draft_out_of_scope', 'هذه الدفعة مسوّدة تُعمل من مخزن «{store}» خارج نطاقك، فلا تُعرض معاينتها ولا تُعدَّل من هنا؛ تظهر كاملة بعد ترحيلها.', {
            store: batch.inputWarehouse.name,
          })}
        />
      ) : null}

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
            // وجبات العلف في مخزنه لمن مخزن العلف بنطاقه (ق٢٥، ب٣)، ولغيره نصّاً بلا رابط لا يُفتح.
            batch.scope.output ? (
              <Link
                to={`/inventory/items/${batch.outputItem.id}/details?wh=${batch.outputWarehouse.id}&tab=lots`}
                className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200"
                data-action="open-output-lots"
              >
                {t('mill.trace.output_lots', 'افتح وجبات العلف في مخزنه')}
              </Link>
            ) : (
              <span className="text-sm text-ink-muted" data-action="output-lots-text">
                {t('mill.trace.output_lots_text', 'وجبات العلف في «{store}» خارج نطاقك.', { store: batch.outputWarehouse.name })}
              </span>
            )
          }
        >
          {inputScope
            ? t('mill.trace.inputs', 'سُحبت المواد من «{store}»، وعمود «من أيّ وجبات» في الجدول يدلّ على مصدر كلّ مادّة.', { store: batch.inputWarehouse.name })
            : // طرف الناتج وحده (ق٣٢): الخادم لا يرسل له وجبات مخزن المواد (draws = null) فالعمود يقول «خارج نطاقك»، والجملة لا تعِد بمصدر (التكامل).
              t('mill.trace.inputs_hidden', 'سُحبت المواد من «{store}»، ووجبات ذلك المخزن خارج نطاقك.', { store: batch.inputWarehouse.name })}
        </Notice>
      ) : null}

      {blind ? null : (
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
      )}

      {!blind && (costPerKg !== null || totalValue !== null) ? (
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
            <Button variant="secondary" icon={<Plus className="size-5" aria-hidden="true" />} disabled={busy} onClick={() => setAdding(true)} data-action="add-input">
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
              ? editCosts
                ? t('mill.costs.hint_division', 'محسوبة من تكاليف الخلطة لكلّ طنّ بكمية هذه الدفعة، وتُعدَّل هنا. عند الإنتاج يُحمَّل كلّ سطر من مصاريف وحدة «{division}» المسجّلة بفئته، الأقدم فالأحدث؛ مصروف على وحدة أخرى لا يُحسب هنا.', { division: division.divisionName })
                : t('mill.costs.hint_division_read', 'محسوبة من تكاليف الخلطة لكلّ طنّ بكمية هذه الدفعة. عند الإنتاج يُحمَّل كلّ سطر من مصاريف وحدة «{division}» المسجّلة بفئته، الأقدم فالأحدث؛ مصروف على وحدة أخرى لا يُحسب هنا.', { division: division.divisionName })
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
          {draft && !expensesVisible && division ? (
            <p className="text-sm text-ink-muted" data-action="costs-out-of-scope">
              {t('mill.costs.out_of_scope', 'تُحمَّل هذه التكاليف من مصاريف وحدة «{division}» خارج نطاقك: يكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.', { division: division.divisionName })}
            </p>
          ) : null}
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
                      disabled={busy}
                      onChange={(event) => setNewCost((current) => ({ ...current, categoryId: event.target.value }))}
                      data-action="new-cost-category"
                    >
                      <option value="">{t('mill.rates.category_pick', 'اختر فئة المصروف')}</option>
                      {freeCategories.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
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
                      disabled={busy}
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
                      if (busy || !newCostOk || newCostValue === null) return;
                      const slot = `cost:${batch.id}:${newCost.categoryId}`;
                      const sent = newCost;
                      void act(async () => {
                        await addBatchCost(batch.id, millRef(slot), sent.categoryId, newCostValue);
                        forgetMillRef(slot);
                        // ب٣٢: لا يُفرَّغ السطر الجديد إلّا إن بقي كما أُرسل.
                        setNewCost((current) => (current.categoryId === sent.categoryId && current.amount === sent.amount ? NO_NEW_COST : current));
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
                  value={category}
                  onChange={setCategory}
                  disabled={busy}
                  onPick={(picked) => {
                    setMadeCategories((current) => (current.some((made) => made.id === picked.id) ? current : [...current, picked]));
                    if (!costRows.some((cost) => cost.categoryId === picked.id)) setNewCost((current) => ({ ...current, categoryId: picked.id }));
                  }}
                />
              </>
            )
          ) : null}
        </section>
      ) : null}

      {unfunded.map((problem, index) => {
        const line = costRows.find((cost) => cost.categoryId === problem.categoryId) ?? null;
        const record = division && expensesVisible ? recordExpenseHref(problem, division.divisionId, batch.id) : null;
        return (
          <Notice
            key={`${problem.categoryId ?? 'unfunded'}-${index}`}
            tone="warning"
            title={division ? unfundedText(problem, division.divisionName) : problemText('costs_unfunded')}
            action={
              <span className="flex flex-wrap gap-2">
                {canExpense && record && busy ? (
                  // أثناء الحفظ (ب٢٢): الرابط مقفول نصّاً، فلا تُغادَر الصفحة وحفظها لم ينتهِ ولا تُفتح نافذة تتبدّل قائمتها تحتها.
                  <span className="text-sm font-medium text-ink-muted" aria-disabled="true" data-action="record-expense">
                    {t('mill.unfunded.record', 'سجّل مصروفاً')}
                  </span>
                ) : canExpense && record ? (
                  <Link
                    to={record}
                    onClick={(event) => {
                      if (!unsaved.length) return;
                      event.preventDefault();
                      setLeaving(record);
                    }}
                    className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200"
                    data-action="record-expense"
                  >
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
      {failure ? (
        <Notice tone="danger" title={failure}>
          {conflictNote}
        </Notice>
      ) : null}

      {editInputs ? (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('mill.weigh.title_day', 'وزن الناتج ويوم الإنتاج')}</h2>
          <p className="text-sm text-ink-muted">{t('mill.weigh.hint_weight', 'اترك الوزن فارغاً إن لم تزنه: يُحسب الناتج بكتلة المواد نفسها (بلا هدر).')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${fieldId}-weight`} label={t('mill.weigh.kg', 'الوزن بالكيلوغرام')} error={weightBad ? t('mill.weigh.bad', 'اكتب وزناً أكبر من صفر.') : undefined}>
              <input
                id={`${fieldId}-weight`}
                className="input tabular-nums"
                inputMode="decimal"
                dir="ltr"
                value={shownWeight}
                disabled={busy}
                onChange={(event) => setWeight(event.target.value)}
                data-action="output-weight"
              />
            </Field>
            <Field id={`${fieldId}-reason`} label={t('mill.weigh.reason', 'سبب الهدر (إن خرج عن المدى)')}>
              <input
                id={`${fieldId}-reason`}
                className="input"
                maxLength={500}
                value={shownReason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                data-action="waste-reason"
              />
            </Field>
            {expiryShown ? (
              <Field
                id={`${fieldId}-expiry`}
                label={t('mill.weigh.expiry', 'تاريخ انتهاء الناتج')}
                error={expiryBad ? t('mill.weigh.expiry_bad', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') : undefined}
                hint={t('mill.weigh.expiry_hint', 'يوم/شهر/سنة، ولا يكون قبل يوم الإنتاج.')}
              >
                <input
                  id={`${fieldId}-expiry`}
                  className="input tabular-nums"
                  inputMode="numeric"
                  dir="ltr"
                  autoComplete="off"
                  placeholder={t('mill.weigh.expiry_placeholder', 'يوم/شهر/سنة')}
                  value={shownExpiry}
                  disabled={busy}
                  onChange={(event) => setExpiry(event.target.value)}
                  data-action="output-expiry"
                />
              </Field>
            ) : null}
            <Field
              id={`${fieldId}-day`}
              label={t('mill.weigh.day', 'يوم الإنتاج')}
              error={dayBad ? t('mill.weigh.day_bad', 'اكتب يوم الإنتاج يوم/شهر/سنة، مثل 04/11/2026.') : undefined}
              hint={t('mill.weigh.day_hint', 'يوم/شهر/سنة: بهذا اليوم تُسحب المواد ويدخل العلف مخزنه.')}
            >
              <input
                id={`${fieldId}-day`}
                className="input tabular-nums"
                inputMode="numeric"
                dir="ltr"
                autoComplete="off"
                placeholder={t('mill.weigh.expiry_placeholder', 'يوم/شهر/سنة')}
                value={shownDay}
                disabled={busy}
                onChange={(event) => setProducedDay(event.target.value)}
                // اليوم الممسوح غير مكتوب (ب٣٥): يعود إلى المحفوظ حين يُغادَر الحقل، فلا يبقى فارغاً بلا معنى.
                onBlur={() => setProducedDay((current) => (current !== null && current.trim() === '' ? null : current))}
                data-action="produced-on"
              />
            </Field>
          </div>
          <Button variant="secondary" busy={busy} disabled={weightBad || expiryBad || dayBad || !fieldsTouched} onClick={saveFields} data-action="save-weight">
            {t('mill.weigh.save_typed', 'احفظ ما كتبته هنا')}
          </Button>
        </section>
      ) : null}

      {draft && inputScope ? (
        <div className="flex flex-col gap-2">
          {stale ? (
            // البطاقة والمعاينة بنسختين بعد كلّ المحاولات (ب٣٣): لا ترحيل بنسخة لم تُعرض.
            <Notice
              tone="warning"
              title={t('mill.batch.stale', 'تغيّرت الدفعة الآن من جهاز آخر؛ حدّث الصفحة.')}
              action={
                <Button size="sm" variant="secondary" disabled={busy} onClick={retry} data-action="reload-batch">
                  {t('mill.batch.reload', 'حدّث الصفحة')}
                </Button>
              }
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canPost ? (
              <Button
                size="lg"
                icon={<Factory className="size-5" aria-hidden="true" />}
                busy={busy}
                disabled={!preview?.canPost || stale || unsaved.length > 0}
                onClick={post}
                data-action="post-production"
              >
                {t('mill.post', 'أنتج الآن')}
              </Button>
            ) : null}
            {sealShown ? (
              <Button variant="secondary" busy={busy} disabled={costUnsaved.length > 0} onClick={seal} data-action="seal-costs">
                {t('mill.seal', 'اختم الكلف')}
              </Button>
            ) : null}
            {canDraft ? (
              <Button variant="ghost" icon={<Trash2 className="size-5" aria-hidden="true" />} busy={busy} onClick={() => setDiscarding(true)} data-action="discard-batch">
                {t('mill.discard', 'احذف المسوّدة')}
              </Button>
            ) : null}
          </div>
          {postGate || sealGate ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col gap-2">
                {postGate ? (
                  <p className="text-sm font-medium" data-action="post-unsaved">
                    {t('mill.post.unsaved', 'احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الإنتاج: {list}.', { list: unsaved.join(t('list.separator', '، ')) })}
                  </p>
                ) : null}
                {sealGate ? (
                  <p className="text-sm font-medium" data-action="seal-unsaved">
                    {t('mill.seal.unsaved', 'احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الختم: {list}.', { list: costUnsaved.join(t('list.separator', '، ')) })}
                  </p>
                ) : null}
              </div>
              <Button size="sm" variant="secondary" disabled={busy} onClick={revert} data-action="revert-unsaved">
                {t('mill.unsaved.revert', 'أرجع ما لم يُحفظ')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {batch.status === 'posted' && canVoid && inputScope ? (
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
      {leaving ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.leave.title', 'ما كتبته هنا لم يُحفظ')}
          consequence={t('mill.leave.body', 'لم يُحفظ بعد: {list}. الانتقال إلى صفحة المصاريف يُضيّع ما كتبته، والأفضل أن تحفظه أوّلاً ثمّ تسجّل المصروف.', {
            list: unsaved.join(t('list.separator', '، ')),
          })}
          confirmLabel={t('mill.leave.go', 'انتقل بلا حفظ')}
          action="confirm-leave"
          onConfirm={() => {
            const to = leaving;
            setLeaving(null);
            navigate(to);
          }}
          onCancel={() => setLeaving(null)}
        />
      ) : null}
    </div>
  );
}
