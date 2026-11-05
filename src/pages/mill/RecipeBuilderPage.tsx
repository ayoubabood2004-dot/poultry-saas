import { CheckCircle2, ChefHat, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { decimalText } from '../../domain/decimal';
import { parseMoney, roundHalfAway, type Fils } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { kgToLiters, litersToKg, parseQty, type BaseUnit } from '../../domain/units';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { columnDecimals, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { createItem, loadItemPurchases, setItemCostPrice, updateItem, type ItemRow } from '../../lib/repo/inventory';
import { createRecipe, loadBuilder, type BuilderData, type CategoryOption, type RecipeInput, type RecipeUnit } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { CellEdit, inBasisKind, kindFixFailure, MaterialPicker, NewCategoryField, newItemFields, NO_CATEGORY_DRAFT, sameNameTwins, unitWord, type CategoryDraft, type PickedMaterial, type TwinView } from './pickers';
import { CompositionBar, dash, pct } from './shared';

// بانية الخلطة بشاشة واحدة (0016، كلمة المالك 2026-11-04: «لمن اسوي خلطة… المفروض تطلعلي قائمة انتاج كاملة اضيف منها المواد
// وكميات المواد واكثر من مادة واحدد سعر كل مادة وايضا اضيف اشياء اختيارية وتكاليف اختيارية حتى لو ما موجودة بالمعمل»). كانت
// نافذة اسم ومنتج وحدها، والسطور في صفحة أخرى لم يجدها المالك فأنشأ خلطة بلا سطر. هنا كلّ شيء معاً: الاسم والمنتج (يُختار أو
// يُنشأ هنا) والأساس وجدول المواد (يُختار أو يُنشأ هنا، بسعر الشراء التلقائي وسعر الكلفة المكتوب) وجدول تكاليف الطنّ، وسطر حيّ
// للمجموع والفرق عن الأساس وكلفة الطنّ المتوقّعة. والحفظ نداء create_recipe واحد (معاملة واحدة). الحساب الحيّ هنا عرض أثناء
// الكتابة فقط بالأعداد الصحيحة (bigint)؛ المرجع للتفعيل حساب الخادم (basis_mismatch)، ولكلفة الطنّ قارئ الخلطة بعد الحفظ.
// إصلاحات المراجعة: id_conflict يُقال برابط الخلطة المحفوظة والبانية بمحتواها ولا يُولَّد معرّفان بصمت (م١)؛ فئة المصروف من
// مكانها ولا رابط يغادر البانية (م٣)؛ ما ينقص للحفظ والتفعيل مكتوب تحت الزرّين (م٥)؛ سعر الكلفة المكتوب يُحفظ قبل الخلطة
// (م٦)؛ المنتج يمرّ بالتوائم قبل إنشائه (م٨)؛ والوقود والتعبئة خارج المجموع والأساس (م١١، مرآة in_basis).
// الجولة الثانية: نصّ «فئة جديدة» في الصفحة (ب١١)؛ الحقول والأزرار كلّها مقفولة أثناء الحفظ، بما فيه انتظار حفظ أسعار الكلفة (ب١٢)؛
// خلية سعر الكلفة الممسوحة ليست سعراً معلّقاً فلا يحذفه الحفظ (ب١٣)؛ وبعد نتيجة مجهولة تتجمّد البانية وفعلها الوحيد «أعد المحاولة»
// بطلب create_recipe نفسه حرفاً (ب١٤)، فلا يُكتب غير ما أُرسل أوّلاً.

type PriceState =
  | { status: 'loading' }
  | { status: 'ready'; costPrice: Fils | null; lastPrice: Fils | null }
  | { status: 'failed'; error: unknown }
  | { status: 'hidden' };

interface BuilderLine {
  item: PickedMaterial;
  qtyText: string;
  unit: RecipeUnit;
  price: PriceState;
}

interface RateRow {
  key: string;
  categoryId: string;
  amountText: string;
}

/**
 * طلب create_recipe كما أُرسل أوّل مرّة (ب١٤) ورسالة الأسعار التي حُفظت قبله: بعد نتيجة مجهولة تُعاد هذه الحمولة حرفاً (المعرّفان
 * والمحتوى والتفعيل)، والأسعار لا تُرسل ثانية.
 */
interface PendingSave {
  input: RecipeInput;
  prices: string;
}

/**
 * لم يُحفظ شيء أكيداً (ب١٤): رفض الخادم، أو لم يخرج الطلب أو لم يصل (NetworkError)، أو تزاحم فرجع (RetryableError)، أو لا قاعدة
 * ولا جلسة. وغيرها نتيجة مجهولة (UnknownOutcomeError وكلّ خطأ غير متوقّع): ربّما كُتبت الخلطة.
 */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

/** كتلة السطر بالكيلو (بالآلاف): الكيلو كما هو، واللتر بكثافة المادّة (مرآة private.recipe_line_kg)، وبلا كثافة null. */
export function lineMassKg(qty: bigint, unit: RecipeUnit, density: bigint | null): bigint | null {
  if (unit === 'kg') return qty;
  return density !== null && density > 0n ? litersToKg(qty, density) : null;
}

/** كمية السطر بوحدة أساس المادّة (لضربها بسعر وحدة الأساس): كيلو مكتوب لسائل يصير لتراً بكثافته، وبلاها null. */
export function lineBaseQty(qty: bigint, unit: RecipeUnit, baseUnit: BaseUnit, density: bigint | null): bigint | null {
  if (unit === baseUnit) return qty;
  if (unit === 'kg' && baseUnit === 'L' && density !== null && density > 0n) return kgToLiters(qty, density);
  return null;
}

export interface PlannedCost {
  materialsPerTon: Fils;
  ratesPerTon: Fils;
  costPerTon: Fils;
  /** null إن بقيت مادّة بلا سعر (لا رقم ناقص بصمت). */
  costPerKg: Fils | null;
  unpriced: number;
}

/**
 * كلفة الطنّ المتوقّعة أثناء الكتابة (عرض للتخطيط، بقاعدة الخادم نفسها في ج٧): Σ كمية بوحدة الأساس × سعرها × 1000 ÷ الأساس،
 * وتكاليف الطنّ كما هي. الأعداد كلّها بالآلاف وبالفلس، والتقريب الوحيد roundHalfAway مرّة واحدة لكلّ رقم.
 */
export function plannedCost(lines: readonly { qtyBase: bigint | null; price: Fils | null }[], rates: readonly Fils[], basisKg: bigint): PlannedCost | null {
  if (basisKg <= 0n) return null;
  let sum = 0n;
  let unpriced = 0;
  for (const line of lines) {
    if (line.qtyBase === null || line.price === null) unpriced += 1;
    else sum += line.qtyBase * line.price;
  }
  const ratesPerTon = rates.reduce((total, rate) => total + rate, 0n);
  const materialsPerTon = roundHalfAway(1000n * sum, basisKg);
  return {
    materialsPerTon,
    ratesPerTon,
    costPerTon: materialsPerTon + ratesPerTon,
    costPerKg: unpriced === 0 ? roundHalfAway(1000n * sum + ratesPerTon * basisKg, 1000n * basisKg) : null,
    unpriced,
  };
}

/** السعر الذي تُحسب به المادّة للتخطيط: سعر الكلفة المكتوب (ولو لم يُحفظ بعد) وإلّا المحفوظ، وإلّا آخر شراء، وإلّا لا سعر. */
export function planningPrice(typed: Fils | null, costPrice: Fils | null, lastPrice: Fils | null): Fils | null {
  return typed ?? costPrice ?? lastPrice;
}

const DEFAULT_BASIS = '1,000';

export default function RecipeBuilderPage() {
  const id = useId();
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? null;
  const canBuild = role !== null && can(role, 'recipe.activate');
  const canCreateItem = role !== null && can(role, 'item.create');
  // تعديل نوع مادّة موجودة («اجعلها مادّة أوّلية»/«اجعلها علفاً جاهزاً»): تعديل المادّة للمدير (stores.manage).
  const canFixKind = role !== null && can(role, 'stores.manage');
  const canCategories = role !== null && can(role, 'expense_categories.manage');
  const costs = Boolean(workspace?.canSeeCost);
  // سعر الكلفة يكتبه من يكتب سعر البيع (set_item_cost_price: stores.manage وأدوار الكلفة).
  const canPrice = costs && canFixKind;
  const load = useCallback(() => loadBuilder(), []);
  const { data, error, retry } = useLoad<BuilderData>(load);

  const [name, setName] = useState('');
  const [outputId, setOutputId] = useState('');
  const [madeOutputs, setMadeOutputs] = useState<readonly { id: string; name: string }[]>([]);
  const [newOutput, setNewOutput] = useState('');
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [outputTwins, setOutputTwins] = useState<{ query: string; rows: readonly TwinView[] } | null>(null);
  const [basisText, setBasisText] = useState(DEFAULT_BASIS);
  const [lines, setLines] = useState<readonly BuilderLine[]>([]);
  const [costTexts, setCostTexts] = useState<Readonly<Record<string, string>>>({});
  const [priceBusy, setPriceBusy] = useState<string | null>(null);
  const [priceErrors, setPriceErrors] = useState<Readonly<Record<string, string>>>({});
  const [rates, setRates] = useState<readonly RateRow[]>([]);
  const [madeCategories, setMadeCategories] = useState<readonly CategoryOption[]>([]);
  const [category, setCategory] = useState<CategoryDraft>(NO_CATEGORY_DRAFT);
  const [saving, setSaving] = useState<'draft' | 'active' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** معرّف خلطة حُفظت بمحاولة سابقة بمحتوى غير الذي تراه الشاشة (id_conflict، م١). */
  const [conflict, setConflict] = useState<string | null>(null);
  /** حمولة create_recipe بعد نتيجة مجهولة (ب١٤): البانية مجمَّدة حتى جواب نهائي، والإعادة بها وحدها. */
  const [frozen, setFrozen] = useState<PendingSave | null>(null);
  const ids = useRef<{ recipe: string; version: string } | null>(null);
  const rateSeq = useRef(0);

  const dirty = name.trim() !== '' || lines.length > 0 || rates.length > 0 || newOutput.trim() !== '' || outputId !== '';
  useDirtyForm(dirty && saving === null);
  // كلّ حقل وزرّ مقفول أثناء الحفظ (ب١٢: ما يُكتب أثناء انتظار الأسعار كان يُهمَل بصمت) وبعد نتيجة مجهولة (ب١٤).
  const locked = saving !== null || frozen !== null;

  const outputs = useMemo(() => [...(data?.feedItems ?? []), ...madeOutputs.filter((made) => !(data?.feedItems ?? []).some((item) => item.id === made.id))], [data, madeOutputs]);
  const categories = useMemo(
    () => [...(data?.categories ?? []), ...madeCategories.filter((made) => !(data?.categories ?? []).some((category) => category.id === made.id))],
    [data, madeCategories],
  );
  const basis = parseQty(basisText);
  const basisOk = basis !== null && basis > 0n;
  const nameTaken = name.trim() !== '' && (data?.recipeNames ?? []).some((taken) => searchable(taken) === searchable(name));

  const view = lines.map((line) => {
    const qty = line.qtyText.trim() === '' ? null : parseQty(line.qtyText);
    const qtyOk = qty !== null && qty > 0n;
    const inBasis = inBasisKind(line.item.kind);
    const mass = qtyOk ? lineMassKg(qty, line.unit, line.item.density) : null;
    const priceText = costTexts[line.item.id];
    const typedValue = priceText === undefined || priceText.trim() === '' ? null : parseMoney(priceText);
    const priceInvalid = priceText !== undefined && priceText.trim() !== '' && (typedValue === null || typedValue <= 0n);
    const typed = typedValue !== null && typedValue > 0n ? typedValue : null;
    const saved = line.price.status === 'ready' ? line.price : null;
    // سعر مكتوب لم يُحفظ (م٦): قيمة > 0 تخالف المحفوظ وحدها (ب١٣)، تُرسل قبل الخلطة بشرط السعر الذي رأته الشاشة؛ وما كُتب والسعر
    // يُقرأ من جديد ينتظر القراءة. الخلية الممسوحة ليست سعراً معلّقاً: الحفظ لا يحذف سعراً محفوظاً (يُحذف بزرّ «حفظ» في الخلية نفسها).
    const pricePending = canPrice && typed !== null && (saved === null || typed !== saved.costPrice);
    const price = planningPrice(typed, saved?.costPrice ?? null, saved?.lastPrice ?? null);
    return { line, qty, qtyOk, inBasis, mass, price, priceText, priceInvalid, pricePending, typed, qtyBase: qtyOk ? lineBaseQty(qty, line.unit, line.item.baseUnit, line.item.density) : null };
  });
  const basisRows = view.filter((row) => row.inBasis);
  const massKnown = basisRows.every((row) => row.mass !== null);
  const sum = basisRows.reduce((total, row) => total + (row.mass ?? 0n), 0n);
  const gap = basisOk ? basis - sum : 0n;
  const categoryName = (categoryId: string) => categories.find((category) => category.id === categoryId)?.name ?? dash();
  const ratesView = rates.map((rate) => {
    const value = rate.amountText.trim() === '' ? null : parseMoney(rate.amountText);
    // سطر تكلفة فارغ كلّه (بلا فئة ولا مبلغ) يُتجاهل ولا يعطّل الحفظ (م٥)، والناقص يُقال.
    const empty = rate.categoryId === '' && rate.amountText.trim() === '';
    return { rate, value, empty, ok: rate.categoryId !== '' && value !== null && value > 0n };
  });
  const sentRates = ratesView.filter((row) => row.ok);

  // ما ينقص للحفظ ثم للتفعيل (م٥): كلّ سبب يعطّل زرّاً مكتوب تحته، و«جاهزة للتفعيل» لا تُقال إلّا حين يمكن التفعيل فعلاً.
  const draftMissing: string[] = [];
  if (name.trim() === '') draftMissing.push(t('mill.builder.need_name', 'اكتب اسم الخلطة.'));
  else if (nameTaken) draftMissing.push(t('mill.builder.need_other_name', 'اسم الخلطة لخلطة أخرى: اختر اسماً غيره.'));
  if (outputId === '') {
    draftMissing.push(
      newOutput.trim() !== ''
        ? t('mill.builder.need_output_create', 'المنتج «{name}» مكتوب ولم يُنشأ: اضغط «أنشئ» أو اختر منتجاً من القائمة.', { name: newOutput.trim() })
        : t('mill.builder.need_output', 'اختر المادّة المنتَجة، أو اكتب اسم منتج جديد واضغط «أنشئ».'),
    );
  }
  if (!basisOk) draftMissing.push(t('mill.builder.need_basis', 'اكتب أساس الخلطة: وزناً أكبر من صفر.'));
  for (const row of view) if (!row.qtyOk) draftMissing.push(t('mill.builder.need_qty', 'اكتب كمية «{name}» أكبر من صفر.', { name: row.line.item.name }));
  for (const row of ratesView) {
    if (row.ok || row.empty) continue;
    draftMissing.push(
      row.rate.categoryId === ''
        ? t('mill.builder.need_rate_category', 'اختر فئة المصروف لسطر التكلفة المكتوب، أو احذف السطر.')
        : t('mill.builder.need_rate_amount', 'اكتب مبلغ تكلفة «{category}» لكلّ طنّ أكبر من صفر، أو احذف السطر.', { category: categoryName(row.rate.categoryId) }),
    );
  }
  for (const row of view) {
    if (row.priceInvalid) draftMissing.push(t('mill.builder.need_price', 'سعر كلفة «{name}» غير صالح: صحّحه أو امسحه.', { name: row.line.item.name }));
    else if (row.pricePending && row.line.price.status === 'failed') draftMissing.push(t('mill.builder.price_unread', 'تعذّرت قراءة سعر «{name}»: أعد قراءته ثم احفظ، أو امسح السعر المكتوب.', { name: row.line.item.name }));
    else if (row.pricePending && row.line.price.status !== 'ready') draftMissing.push(t('mill.builder.price_wait', 'سعر «{name}» يُقرأ الآن: انتظر لحظة ثم احفظ.', { name: row.line.item.name }));
  }
  const activateMissing: string[] = [];
  if (!basisRows.length) {
    activateMissing.push(
      view.length
        ? t('mill.builder.need_basis_line', 'أضف مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يكوّنان خلطة.')
        : t('mill.builder.need_line', 'أضف مادّة واحدة على الأقلّ.'),
    );
  } else if (!massKnown) {
    activateMissing.push(t('mill.builder.need_density', 'في المواد سائل بلا كثافة فلا يُحسب وزنه: اكتب كميته بالكيلوغرام أو أكمل كثافته من بطاقته.'));
  } else if (basisOk && gap !== 0n) {
    const vars = { sum: fmtQty(sum, 'kg').main, basis: fmtQty(basis, 'kg').main, gap: fmtQty(gap > 0n ? gap : -gap, 'kg').main };
    activateMissing.push(
      gap > 0n
        ? t('mill.builder.need_gap_short', 'المجموع {sum} أقلّ من الأساس {basis} بـ{gap}.', vars)
        : t('mill.builder.need_gap_over', 'المجموع {sum} أكبر من الأساس {basis} بـ{gap}.', vars),
    );
  }
  const canDraft = canBuild && draftMissing.length === 0;
  const canActivate = canDraft && activateMissing.length === 0;
  const planned = costs && basisOk ? plannedCost(view.map((row) => ({ qtyBase: row.qtyBase, price: row.price })), sentRates.map((row) => row.value ?? 0n), basis) : null;
  const massDecimals = columnDecimals(basisRows.map((row) => row.mass ?? 0n), 3) as 0 | 1 | 2 | 3;
  const exclude = useMemo(() => new Set(lines.map((line) => line.item.id)), [lines]);
  const pendingPrices = view.filter((row) => row.pricePending && row.line.price.status === 'ready');

  const loadPrice = (item: PickedMaterial) => {
    loadItemPurchases(item.id).then(
      (found) =>
        setLines((current) =>
          current.map((line) =>
            line.item.id === item.id ? { ...line, price: { status: 'ready', costPrice: found.item.costPrice, lastPrice: found.rows[0]?.money?.unitCost ?? null } } : line,
          ),
        ),
      (problem: unknown) => setLines((current) => current.map((line) => (line.item.id === item.id ? { ...line, price: { status: 'failed', error: problem } } : line))),
    );
  };

  const addLine = (item: PickedMaterial, fresh: boolean) => {
    if (lines.some((line) => line.item.id === item.id)) return;
    // مادّة أُنشئت الآن بلا شراء ولا سعر: لا قراءة. والسعر مال، فلا يُقرأ لدور بلا كلفة.
    const price: PriceState = !costs ? { status: 'hidden' } : fresh ? { status: 'ready', costPrice: null, lastPrice: null } : { status: 'loading' };
    setLines((current) => [...current, { item, qtyText: '', unit: item.baseUnit === 'L' ? 'L' : 'kg', price }]);
    if (costs && !fresh) loadPrice(item);
  };

  const patchLine = (itemId: string, patch: Partial<BuilderLine>) => setLines((current) => current.map((line) => (line.item.id === itemId ? { ...line, ...patch } : line)));
  const dropCostText = (itemId: string) =>
    setCostTexts((current) => {
      if (!(itemId in current)) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  /** سعر رُفض: يُقرأ من جديد (تغيّر من غير هذه الشاشة ربّما)، والمكتوب يبقى ليُراجَع ويُحفظ ثانية. */
  const reloadPrice = (item: PickedMaterial) => {
    setLines((current) => current.map((row) => (row.item.id === item.id ? { ...row, price: { status: 'loading' } } : row)));
    loadPrice(item);
  };

  const savePrice = async (line: BuilderLine) => {
    const text = costTexts[line.item.id] ?? '';
    const price = text.trim() === '' ? null : parseMoney(text);
    if (line.price.status !== 'ready' || (price !== null && price <= 0n) || (text.trim() !== '' && price === null)) return;
    setPriceBusy(line.item.id);
    setPriceErrors((current) => ({ ...current, [line.item.id]: '' }));
    try {
      const written = await setItemCostPrice(line.item.id, price, line.price.costPrice);
      patchLine(line.item.id, { price: { ...line.price, costPrice: written } });
      dropCostText(line.item.id);
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setPriceErrors((current) => ({ ...current, [line.item.id]: `${title} ${detail}` }));
      reloadPrice(line.item);
    } finally {
      setPriceBusy(null);
    }
  };

  const pickOutput = (row: { id: string; name: string }) => {
    setMadeOutputs((current) => (current.some((made) => made.id === row.id) ? current : [...current, { id: row.id, name: row.name }]));
    setOutputId(row.id);
    setNewOutput('');
    setOutputTwins(null);
  };

  /** «أنشئ» المنتج: الموجود في قائمة العلف يُختار، والتوأم بالاسم من نوع آخر يُعرض أوّلاً (م٨)، والإنشاء رغمه بفعل ثانٍ. */
  const createOutput = async (despite: boolean) => {
    const wanted = newOutput.trim();
    if (!wanted || outputBusy) return;
    const same = outputs.find((item) => searchable(item.name) === searchable(wanted));
    if (same) {
      // المنتج موجود بالاسم نفسه: يُختار بدل إنشاء ثانٍ (المالك كرّر «ذرة» فصار «ذراء»).
      setOutputError(null);
      pickOutput(same);
      return;
    }
    setOutputBusy(true);
    setOutputError(null);
    try {
      if (!despite) {
        const twins = await sameNameTwins(wanted);
        if (twins.length) {
          setOutputTwins({ query: wanted, rows: twins });
          return;
        }
      }
      pickOutput(await createItem(newItemFields(wanted, 'feed')));
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setOutputError(`${title} ${detail}`);
    } finally {
      setOutputBusy(false);
    }
  };

  /** «اجعلها علفاً جاهزاً»: تعديل نوع التوأم بشرط نسخته، ثم يُختار منتجاً. النوع مجمَّد بحركات مخزون ← جملة تقول ما العمل. */
  const makeFeed = async (row: ItemRow) => {
    if (outputBusy) return;
    setOutputBusy(true);
    setOutputError(null);
    try {
      pickOutput(await updateItem(row.id, row.version, { kind: 'feed' }));
    } catch (problem) {
      setOutputError(kindFixFailure(problem, row, 'feed'));
    } finally {
      setOutputBusy(false);
    }
  };

  const addRate = () => {
    rateSeq.current += 1;
    const key = `rate-${rateSeq.current}`;
    setRates((current) => [...current, { key, categoryId: '', amountText: '' }]);
  };

  /** فئة أُضيفت أو وُجدت بالاسم (م٣): تُختار في سطر تكلفة فارغ، وإلّا في سطر جديد، والمكتوبة أصلاً تبقى في سطرها. */
  const pickCategory = (category: CategoryOption) => {
    setMadeCategories((current) => (current.some((made) => made.id === category.id) ? current : [...current, category]));
    rateSeq.current += 1;
    const key = `rate-${rateSeq.current}`;
    setRates((current) => {
      if (current.some((rate) => rate.categoryId === category.id)) return current;
      const empty = current.findIndex((rate) => rate.categoryId === '');
      if (empty >= 0) return current.map((rate, index) => (index === empty ? { ...rate, categoryId: category.id } : rate));
      return [...current, { key, categoryId: category.id, amountText: '' }];
    });
  };

  /**
   * نداء create_recipe بحمولة محفوظة (ب١٤): الأوّل من «احفظ»، والإعادة بعد نتيجة مجهولة بالحمولة نفسها حرفاً. جواب نهائي (نجاح أو رفض
   * بسبب) يفكّ التجميد — الرفض بعد الإعادة يعني أنّ الأولى لم تُكتب (create_recipe بالمعرّفين نفسيهما يرجّع الموجود)، فالتعديل آمن.
   */
  const submit = async (pending: PendingSave, retrying: boolean) => {
    setSaving(pending.input.activate ? 'active' : 'draft');
    setFailure(null);
    setConflict(null);
    try {
      const created = await createRecipe(pending.input);
      ids.current = null;
      setFrozen(null);
      const done =
        created.status === 'active'
          ? t('mill.builder.saved_active', 'حُفظت الخلطة «{name}» وفُعّلت: صارت جاهزة للإنتاج.', { name: pending.input.name })
          : t('mill.builder.saved_draft', 'حُفظت الخلطة «{name}» مسوّدة.', { name: pending.input.name });
      toast({ tone: 'success', title: pending.prices ? `${done} ${pending.prices}` : done });
      navigate(`/mill/recipe/${created.id}`);
    } catch (problem) {
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن كُتبت المحاولة الأولى: تتجمّد البانية بحمولتها، والإعادة وحدها ممكنة (لن تُكتب مرّتين). وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(pending);
        if (retrying && surelyUnsaved(problem)) setFailure(t('mill.builder.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.'));
      } else if (problem instanceof RejectedError && problem.code === 'id_conflict') {
        // ما حُفظ بمحاولة سابقة غير ما تراه الشاشة (id_conflict، ق٥): يُقال برابطه، والمعرّفان يبقيان فلا تُكتب خلطة ثانية بصمت.
        setFrozen(null);
        setConflict(pending.input.id);
      } else {
        setFrozen(null);
        const { title, detail } = describeError(problem);
        // الأسعار التي حُفظت قبل الخلطة تبقى محفوظة: يُقال ذلك مع الفشل، فلا يظنّ المستخدم أنّ شيئاً لم يُكتب.
        setFailure(pending.prices ? `${title} ${detail} ${pending.prices}` : `${title} ${detail}`);
      }
      setSaving(null);
    }
  };

  const save = async (activate: boolean) => {
    if (!(activate ? canActivate : canDraft) || !basisOk || locked) return;
    // المعرّفان من الجهاز ويبقيان لهذه الشاشة حتى تُعرف النتيجة: إعادةٌ بعد جواب ضائع ترجّع الخلطة نفسها لا ثانية.
    ids.current ??= { recipe: crypto.randomUUID(), version: crypto.randomUUID() };
    const attempt = ids.current;
    setSaving(activate ? 'active' : 'draft');
    setFailure(null);
    setConflict(null);
    // أسعار الكلفة المكتوبة أوّلاً (م٦)، واحداً واحداً بشرط السعر الذي رأته الشاشة: أيّ فشل يوقف الحفظ ويسمّي المادّة.
    const priced: string[] = [];
    for (const row of pendingPrices) {
      const item = row.line.item;
      const before = row.line.price.status === 'ready' ? row.line.price.costPrice : null;
      try {
        const written = await setItemCostPrice(item.id, row.typed, before);
        patchLine(item.id, { price: { status: 'ready', costPrice: written, lastPrice: row.line.price.status === 'ready' ? row.line.price.lastPrice : null } });
        dropCostText(item.id);
        priced.push(item.name);
      } catch (problem) {
        const { title, detail } = describeError(problem);
        setFailure(t('mill.builder.price_failed', 'لم يُحفظ سعر كلفة «{name}»، فلم تُحفظ الخلطة بعد: {reason}', { name: item.name, reason: `${title} ${detail}` }));
        reloadPrice(item);
        setSaving(null);
        return;
      }
    }
    const prices = priced.length ? t('mill.builder.prices_saved', 'وحُفظ سعر الكلفة لـ{names}.', { names: priced.join(t('list.separator', '، ')) }) : '';
    await submit(
      {
        input: {
          id: attempt.recipe,
          versionId: attempt.version,
          name: name.trim(),
          outputItemId: outputId,
          basisKg: basis,
          lines: view.map((row) => ({ itemId: row.line.item.id, qty: row.qty ?? 0n, unit: row.line.unit })),
          rates: sentRates.map((row) => ({ categoryId: row.rate.categoryId, amountPerTon: row.value ?? 0n })),
          activate,
        },
        prices,
      },
      false,
    );
  };

  const columns: Column<(typeof view)[number]>[] = [
    {
      key: 'item',
      header: t('mill.line.item', 'المادّة'),
      wrap: true,
      sticky: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.line.item.name}</span>
          <span className="text-xs text-ink-muted">
            {row.inBasis
              ? t('mill.builder.item_meta', '{kind} · تُقاس بـ{unit}', { kind: itemKindLabel(row.line.item.kind), unit: unitWord(row.line.item.baseUnit) })
              : t('mill.builder.item_meta_out', '{kind} · تُقاس بـ{unit} · خارج الكتلة', { kind: itemKindLabel(row.line.item.kind), unit: unitWord(row.line.item.baseUnit) })}
          </span>
        </span>
      ),
    },
    {
      key: 'qty',
      header: t('mill.line.qty', 'الكمية'),
      kind: 'number',
      cell: (row) => (
        <input
          id={`${id}-qty-${row.line.item.id}`}
          aria-label={t('mill.builder.qty_of', 'كمية «{name}»', { name: row.line.item.name })}
          className="input text-end tabular-nums"
          size={9}
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          value={row.line.qtyText}
          disabled={locked}
          aria-invalid={(row.line.qtyText.trim() !== '' && !row.qtyOk) || undefined}
          onChange={(event) => patchLine(row.line.item.id, { qtyText: event.target.value })}
          data-action="line-qty"
        />
      ),
    },
    {
      key: 'unit',
      header: t('mill.line.unit_col', 'الوحدة'),
      cell: (row) =>
        row.line.item.baseUnit === 'L' ? (
          <select
            aria-label={t('mill.builder.unit_of', 'وحدة «{name}»', { name: row.line.item.name })}
            className="input"
            value={row.line.unit}
            disabled={locked}
            onChange={(event) => patchLine(row.line.item.id, { unit: event.target.value === 'L' ? 'L' : 'kg' })}
            data-action="line-unit"
          >
            <option value="L">{t('unit.L', 'لتر')}</option>
            <option value="kg">{t('unit.kg', 'كغم')}</option>
          </select>
        ) : (
          t('unit.kg', 'كغم')
        ),
    },
    {
      key: 'mass',
      header: t('mill.col.mass', 'بالكيلوغرام'),
      kind: 'number',
      // الوقود والتعبئة خارج الكتلة (م١١): لا رقم في عمود يُجمع إلى الأساس.
      cell: (row) => <Num>{row.mass === null || !row.inBasis ? dash() : fmtQtyCell(row.mass, massDecimals)}</Num>,
      total: <Num>{massKnown ? fmtQtyCell(sum, massDecimals) : dash()}</Num>,
    },
    {
      key: 'share',
      header: t('mill.col.share', 'الحصّة'),
      kind: 'number',
      cell: (row) =>
        !row.inBasis ? (
          <span className="text-xs text-ink-muted" data-action="out-of-basis">
            {t('mill.line.out_of_basis', 'خارج الكتلة')}
          </span>
        ) : (
          <Num>{row.mass === null || !basisOk ? dash() : pct(row.mass, basis)}</Num>
        ),
      total: <Num>{massKnown && basisOk ? pct(sum, basis) : dash()}</Num>,
    },
  ];
  if (costs) {
    columns.push(
      {
        key: 'last',
        header: t('mill.col.last_price', 'سعر الشراء (آخر شراء)'),
        kind: 'number',
        cell: (row) =>
          row.line.price.status === 'loading' ? (
            t('mill.builder.price_loading', '…')
          ) : row.line.price.status === 'failed' ? (
            <Button size="sm" variant="ghost" disabled={locked} onClick={() => loadPrice(row.line.item)} data-action="retry-price">
              {t('mill.builder.price_retry', 'أعد قراءة السعر')}
            </Button>
          ) : (
            <Num>{row.line.price.status === 'ready' && row.line.price.lastPrice !== null ? fmtMoney(row.line.price.lastPrice) : dash()}</Num>
          ),
      },
      {
        key: 'cost',
        header: t('mill.col.cost_price', 'سعر الكلفة'),
        kind: 'number',
        cell: (row) => {
          const price = row.line.price;
          if (price.status !== 'ready') return dash();
          const saved = price.costPrice === null ? '' : decimalText(price.costPrice, 2);
          const text = costTexts[row.line.item.id] ?? saved;
          const problem = priceErrors[row.line.item.id];
          if (!canPrice) return <Num>{price.costPrice === null ? dash() : fmtMoney(price.costPrice)}</Num>;
          return (
            <span className="flex flex-col items-end gap-1">
              <CellEdit
                id={`${id}-cost-${row.line.item.id}`}
                label={t('mill.builder.cost_of', 'سعر كلفة «{name}» لكلّ {unit}', { name: row.line.item.name, unit: unitWord(row.line.item.baseUnit) })}
                value={text}
                dirty={text !== saved}
                invalid={row.priceInvalid}
                busy={priceBusy === row.line.item.id}
                disabled={locked}
                action="cost-price"
                onChange={(next) => setCostTexts((current) => ({ ...current, [row.line.item.id]: next }))}
                onSave={() => void savePrice(row.line)}
              />
              {problem ? (
                <span role="alert" className="text-xs text-danger-700 dark:text-danger-300">
                  {problem}
                </span>
              ) : null}
            </span>
          );
        },
      },
    );
  }
  columns.push({
    key: 'remove',
    header: t('mill.col.actions', 'إجراءات'),
    cell: (row) => (
      <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={locked} onClick={() => setLines((current) => current.filter((line) => line.item.id !== row.line.item.id))} data-action="remove-line">
        {t('common.delete', 'احذف')}
      </Button>
    ),
  });

  const rateColumns: Column<(typeof ratesView)[number]>[] = [
    {
      key: 'category',
      header: t('mill.rates.category', 'فئة المصروف'),
      wrap: true,
      cell: (row) => (
        <select
          aria-label={t('mill.rates.category_pick', 'اختر فئة المصروف')}
          className="input"
          value={row.rate.categoryId}
          disabled={locked}
          onChange={(event) => setRates((current) => current.map((rate) => (rate.key === row.rate.key ? { ...rate, categoryId: event.target.value } : rate)))}
          data-action="rate-category"
        >
          <option value="">{t('mill.rates.category_pick', 'اختر فئة المصروف')}</option>
          {categories
            .filter((option) => option.id === row.rate.categoryId || !rates.some((rate) => rate.categoryId === option.id))
            .map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
        </select>
      ),
    },
    {
      key: 'amount',
      header: t('mill.rates.amount', 'المبلغ لكلّ طنّ (دينار)'),
      kind: 'number',
      cell: (row) => (
        <input
          aria-label={t('mill.rates.amount_of', 'مبلغ التكلفة لكلّ طنّ')}
          className="input text-end tabular-nums"
          size={11}
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          value={row.rate.amountText}
          disabled={locked}
          aria-invalid={(row.rate.amountText.trim() !== '' && (row.value === null || row.value <= 0n)) || undefined}
          onChange={(event) => setRates((current) => current.map((rate) => (rate.key === row.rate.key ? { ...rate, amountText: event.target.value } : rate)))}
          data-action="rate-amount"
        />
      ),
      total: <Num>{fmtMoney(sentRates.reduce((total, row) => total + (row.value ?? 0n), 0n))}</Num>,
    },
    {
      key: 'remove',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (row) => (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={locked} onClick={() => setRates((current) => current.filter((rate) => rate.key !== row.rate.key))} data-action="remove-rate">
          {t('common.delete', 'احذف')}
        </Button>
      ),
    },
  ];

  if (!canBuild && session.status === 'ready') {
    return (
      <Notice tone="info" title={t('mill.builder.forbidden', 'إنشاء الخلطات للمدير والمالك.')}>
        <Link to="/mill" className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="back-to-mill">
          {t('mill.back', 'المعمل')}
        </Link>
      </Notice>
    );
  }
  if (error) return <LoadFailed what={t('mill.builder.what', 'بانية الخلطة')} error={error} onRetry={retry} />;
  if (!data) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  const unpricedNote = planned && planned.unpriced > 0 ? t('mill.builder.unpriced', 'ومنها {count} بلا سعر لم تُحسب.', { count: planned.unpriced }) : null;
  const shownOutputTwins = outputTwins && outputTwins.query === newOutput.trim() ? outputTwins.rows : null;
  const outsideBasis = view.some((row) => !row.inBasis);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('mill.builder.title', 'خلطة جديدة')}
        subtitle={t('mill.builder.subtitle', 'اكتب الخلطة كاملة هنا: اسمها ومنتجها وموادّها بكمياتها وتكاليفها لكلّ طنّ، ثم احفظها مسوّدة أو فعّلها للإنتاج.')}
        actions={
          <Link to="/mill" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="back-to-mill">
            {t('mill.back', 'المعمل')}
          </Link>
        }
      />

      <section className="card flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <ChefHat aria-hidden="true" className="size-6 text-brand-700 dark:text-brand-200" />
          <h2 className="text-lg font-semibold">{t('mill.builder.head', 'الخلطة ومنتجها')}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={`${id}-name`}
            label={t('mill.recipe.name', 'اسم الخلطة')}
            hint={t('mill.recipe.name_hint', 'مثل: علف بادئ، علف ناهٍ.')}
            error={nameTaken ? t('mill.builder.name_taken', 'توجد خلطة بهذا الاسم؛ اختر اسماً آخر أو افتحها من المعمل.') : null}
          >
            <input id={`${id}-name`} className="input" maxLength={80} value={name} disabled={locked} onChange={(event) => setName(event.target.value)} data-action="recipe-name" />
          </Field>
          <Field id={`${id}-basis`} label={t('mill.builder.basis', 'أساس الخلطة (كغم)')} hint={t('mill.builder.basis_hint', 'الكميات تُكتب لكلّ هذا الوزن، والإنتاج يحسبها بالتناسب.')} error={basisText.trim() !== '' && !basisOk ? t('mill.builder.basis_bad', 'اكتب وزناً أكبر من صفر.') : null}>
            <input id={`${id}-basis`} className="input tabular-nums" inputMode="decimal" dir="ltr" value={basisText} disabled={locked} onChange={(event) => setBasisText(event.target.value)} data-action="recipe-basis" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-output`} label={t('mill.recipe.output', 'المادّة المنتَجة')} hint={t('mill.builder.output_hint', 'العلف الجاهز الذي يخرج من الخلطة ويدخل مخزن العلف.')}>
            <select id={`${id}-output`} className="input" value={outputId} disabled={locked} onChange={(event) => setOutputId(event.target.value)} data-action="recipe-output">
              <option value="">{t('mill.recipe.output_pick', 'اختر المادّة المنتَجة')}</option>
              {outputs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {canCreateItem ? (
            <Field id={`${id}-new-output`} label={t('mill.builder.new_output', 'أو أنشئ منتجاً جديداً باسمه')} error={outputError} hint={t('mill.builder.new_output_hint', 'يُنشأ علفاً جاهزاً بالكيلوغرام، ويُختار منتجاً لهذه الخلطة.')}>
              <span className="flex items-center gap-2">
                <input id={`${id}-new-output`} className="input" maxLength={120} value={newOutput} disabled={locked} onChange={(event) => setNewOutput(event.target.value)} data-action="new-output-name" />
                <Button variant="secondary" icon={<Plus className="size-5" aria-hidden="true" />} busy={outputBusy} disabled={locked || newOutput.trim() === ''} onClick={() => void createOutput(false)} data-action="create-output">
                  {t('mill.builder.create_output', 'أنشئ')}
                </Button>
              </span>
            </Field>
          ) : null}
        </div>
        {shownOutputTwins ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3" data-action="output-twins">
            <p className="text-sm font-medium">{t('mill.builder.output_twins', 'توجد مادّة بالاسم «{name}» نفسه، فلا يُنشأ منتج ثانٍ قبل أن تختار:', { name: newOutput.trim() })}</p>
            <ul className="flex flex-col gap-2">
              {shownOutputTwins.map(({ twin, row }) => (
                <li key={twin.id} className="flex flex-wrap items-center gap-2 text-sm">
                  {row && !row.archived ? (
                    <>
                      <span>{t('mill.builder.output_twin_kind', '«{name}» موجودة بنوع «{kind}»، والمنتج علف جاهز.', { name: row.name, kind: itemKindLabel(row.kind) })}</span>
                      {canFixKind && row.baseUnit === 'kg' ? (
                        <Button size="sm" variant="secondary" busy={outputBusy} disabled={locked} onClick={() => void makeFeed(row)} data-action="make-feed">
                          {t('mill.builder.make_feed', 'اجعلها علفاً جاهزاً')}
                        </Button>
                      ) : null}
                    </>
                  ) : row ? (
                    <span>{t('mill.builder.output_twin_archived', '«{name}» مؤرشفة بنوع «{kind}».', { name: row.name, kind: itemKindLabel(row.kind) })}</span>
                  ) : (
                    <span>{t('mill.twins.unread', '«{name}» موجودة في منشأتك.', { name: twin.name })}</span>
                  )}
                </li>
              ))}
            </ul>
            <div>
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden="true" />} busy={outputBusy} disabled={locked} onClick={() => void createOutput(true)} data-action="create-output-anyway">
                {t('mill.builder.create_output_anyway', 'أنشئ «{name}» منتجاً آخر بالاسم نفسه رغم ذلك', { name: newOutput.trim() })}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t('mill.builder.materials', 'المواد')}</h2>
        <MaterialPicker id={`${id}-picker`} exclude={exclude} canCreate={canCreateItem} canFixKind={canFixKind} disabled={locked} onPick={addLine} />
        {basisRows.length ? (
          <CompositionBar pieces={basisRows.map((row) => ({ key: row.line.item.id, label: row.line.item.name, weight: row.mass ?? 0n }))} total={basisOk ? basis : 0n} hue={210} />
        ) : null}
        <DataTable
          caption={t('mill.builder.caption', 'مواد الخلطة الجديدة بكمياتها وحصصها وأسعارها')}
          columns={columns}
          rows={view}
          rowKey={(row) => row.line.item.id}
          empty={t('mill.builder.empty', 'لم تُضف مادّة بعد: ابحث عنها بالاسم فوق، أو أنشئها إن لم تكن موجودة.')}
          totalLabel={t('mill.detail.total', 'المجموع')}
        />
        <p className="text-sm font-medium" data-action="builder-sum">
          {!basisRows.length
            ? t('mill.builder.sum_empty', 'المجموع صفر من {basis}.', { basis: basisOk ? fmtQty(basis, 'kg').main : dash() })
            : !massKnown
              ? t('mill.builder.sum_unknown', 'في المواد سائل بلا كثافة، فلا يُحسب وزنه؛ اكتب كميته بالكيلوغرام أو أكمل كثافته من بطاقته.')
              : !basisOk
                ? t('mill.builder.sum_no_basis', 'المجموع {sum}، والأساس غير مكتوب.', { sum: fmtQty(sum, 'kg').main })
                : gap === 0n
                  ? canActivate
                    ? t('mill.builder.sum_ok', 'المجموع {sum} = الأساس: الخلطة جاهزة للتفعيل.', { sum: fmtQty(sum, 'kg').main })
                    : t('mill.builder.sum_equal', 'المجموع {sum} = الأساس.', { sum: fmtQty(sum, 'kg').main })
                  : gap > 0n
                    ? t('mill.builder.sum_short', 'المجموع {sum} من {basis}: ينقص {gap}.', { sum: fmtQty(sum, 'kg').main, basis: fmtQty(basis, 'kg').main, gap: fmtQty(gap, 'kg').main })
                    : t('mill.builder.sum_over', 'المجموع {sum} من {basis}: يزيد {gap}.', { sum: fmtQty(sum, 'kg').main, basis: fmtQty(basis, 'kg').main, gap: fmtQty(-gap, 'kg').main })}
        </p>
        {outsideBasis ? (
          <p className="text-sm text-ink-muted" data-action="mass-note">
            {t('mill.builder.basis_note', 'الوقود والتعبئة خارج كتلة الخلطة: يُسحبان وتُحسب كلفتهما، ولا يدخلان المجموع ولا الأساس.')}
          </p>
        ) : null}
      </section>

      {costs ? (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('mill.rates.title', 'تكاليف لكلّ طنّ')}</h2>
          <p className="text-sm text-ink-muted">
            {t('mill.rates.hint', 'أيدي عاملة أو كهرباء أو نقل: مبلغ لكلّ طنّ يُحسب على كلّ دفعة بكميتها، ويُحمَّل عند الإنتاج من مصروف مسجّل بفئته.')}
          </p>
          <DataTable
            caption={t('mill.rates.caption', 'تكاليف الخلطة لكلّ طنّ بفئة المصروف')}
            columns={rateColumns}
            rows={ratesView}
            rowKey={(row) => row.rate.key}
            empty={t('mill.rates.empty', 'لا تكاليف على هذه الخلطة. أضفها إن كان للعلف حصّة من مصروف.')}
            totalLabel={t('mill.detail.total', 'المجموع')}
          />
          <div className="flex flex-wrap items-end gap-3">
            <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden="true" />} disabled={locked || rates.length >= categories.length} onClick={addRate} data-action="add-rate">
              {t('mill.rates.add', 'أضف تكلفة')}
            </Button>
          </div>
          <NewCategoryField id={`${id}-new-category`} categories={categories} canManage={canCategories} value={category} onChange={setCategory} disabled={locked} onPick={pickCategory} />
          {planned ? (
            <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3" data-action="planned-cost">
              <p className="font-semibold">
                {planned.costPerKg !== null
                  ? t('mill.builder.planned', 'كلفة الطنّ المتوقّعة: {ton} (الكيلو {kg})', { ton: fmtMoney(planned.costPerTon), kg: fmtMoney(planned.costPerKg) })
                  : t('mill.builder.planned_partial', 'كلفة الطنّ المتوقّعة: {ton} على الأقلّ', { ton: fmtMoney(planned.costPerTon) })}
              </p>
              <p className="text-sm text-ink-muted">
                {t('mill.builder.planned_parts', 'المواد {materials} والتكاليف {rates} لكلّ طنّ.', { materials: fmtMoney(planned.materialsPerTon), rates: fmtMoney(planned.ratesPerTon) })} {unpricedNote}
              </p>
              <p className="text-xs text-ink-muted">{t('mill.builder.planned_note', 'تقدير للتخطيط بسعر الكلفة المكتوب وإلّا آخر شراء؛ الكلفة الفعلية للعلف من السحب الحقيقي عند الإنتاج.')}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {conflict ? (
        <Notice
          tone="danger"
          title={t('mill.builder.id_conflict', 'حُفظت هذه الخلطة بمحاولة سابقة بمحتوى غير الذي تراه الآن. افتحها لترى ما حُفظ، وعدّلها بنسخة جديدة.')}
          action={
            <Link to={`/mill/recipe/${conflict}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-saved-recipe">
              {t('mill.builder.open_saved', 'افتح الخلطة المحفوظة')}
            </Link>
          }
        />
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}
      {frozen ? (
        <Notice
          tone="warning"
          title={t('mill.builder.frozen', 'لا نعرف إن حُفظت الخلطة: أعد المحاولة قبل أيّ تعديل؛ لن تُكتب مرّتين.')}
          action={
            <Button busy={saving !== null} onClick={() => void submit(frozen, true)} data-action="retry-save">
              {t('mill.builder.retry', 'أعد المحاولة')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
            busy={saving === 'active'}
            disabled={!canActivate || locked}
            onClick={() => void save(true)}
            data-action="save-activate"
          >
            {t('mill.builder.save_activate', 'احفظ وفعّل')}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            icon={<Save className="size-5" aria-hidden="true" />}
            busy={saving === 'draft'}
            disabled={!canDraft || locked}
            onClick={() => void save(false)}
            data-action="save-draft"
          >
            {t('mill.builder.save_draft', 'احفظ مسوّدة')}
          </Button>
        </div>
      )}
      {frozen ? null : !canDraft && draftMissing.length ? (
        <div className="flex flex-col gap-1 text-sm" data-action="save-missing">
          <p className="font-medium">{t('mill.builder.missing_draft', 'لا تُحفظ الخلطة قبل ما يلي:')}</p>
          <ul className="list-disc ps-5 text-ink-muted">
            {draftMissing.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : canDraft && !canActivate ? (
        <div className="flex flex-col gap-1 text-sm" data-action="save-missing">
          <p className="font-medium">{t('mill.builder.missing_activate', 'لا تُفعَّل الخلطة قبل ما يلي (المسوّدة تُحفظ الآن وتُكمل من بطاقتها):')}</p>
          <ul className="list-disc ps-5 text-ink-muted">
            {activateMissing.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
