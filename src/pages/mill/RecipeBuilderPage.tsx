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
import { kgToLiters, type BaseUnit } from '../../domain/units';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { columnDecimals, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { createItem, loadItemPurchases, setItemCostPrice, updateItem, type ItemRow } from '../../lib/repo/inventory';
import { createRecipe, loadBuilder, type BuilderData, type CategoryOption, type RecipeInput, type RecipeUnit } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { cardTotals, CardSums, MaterialCards, useCardLines, useMillStock, viewCardLine } from './cards';
import { CellEdit, kindFixFailure, NewCategoryField, newItemFields, NO_CATEGORY_DRAFT, sameNameTwins, unitWord, type CategoryDraft, type PickedMaterial, type TwinView } from './pickers';
import { CompositionBar, dash, pct } from './shared';

export { lineMassKg } from './cards';

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
// المواد بطاقاتٍ (كلمة المالك 2026-11-07: «اشوف المواد على شكل بطاقات واحدد على كل مادة… وكل ما اسوي انتاج يحسبلي الناتج الي صار من مجموع
// المواد»): تُختار بلمسة وأكثر من مادّة معاً وكمية كلّ واحدة على بطاقتها (cards.tsx)، ولا «أساس الخلطة» يُكتب ويُطابَق: الأساس المرسَل
// مجموع ما داخل الكتلة بالكيلوغرام، فيُقال حيّاً «مجموع الخلطة» و«الناتج المتوقّع»، والتفعيل لا يُرفض basis_mismatch. والجدول تحت البطاقات
// ملخّص للقراءة (الكمية والكتلة والحصّة وأسعار المادّة)، والكمية تُكتب على البطاقة وحدها.

type PriceState =
  | { status: 'loading' }
  | { status: 'ready'; costPrice: Fils | null; lastPrice: Fils | null }
  | { status: 'failed'; error: unknown }
  | { status: 'hidden' };

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
  // البطاقات و«عندك» (0017، كلمة المالك 2026-11-06) من قراءة items_overview واحدة للصفحة.
  const stock = useMillStock();
  // المختار وكمياته ونصّ البحث في الصفحة (درس WP5).
  const picks = useCardLines();
  const [query, setQuery] = useState('');
  const [prices, setPrices] = useState<Readonly<Record<string, PriceState>>>({});

  const [name, setName] = useState('');
  const [outputId, setOutputId] = useState('');
  const [madeOutputs, setMadeOutputs] = useState<readonly { id: string; name: string }[]>([]);
  const [newOutput, setNewOutput] = useState('');
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [outputTwins, setOutputTwins] = useState<{ query: string; rows: readonly TwinView[] } | null>(null);
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

  const lines = picks.lines;
  const dirty = name.trim() !== '' || lines.length > 0 || rates.length > 0 || newOutput.trim() !== '' || outputId !== '';
  useDirtyForm(dirty && saving === null);
  // كلّ حقل وزرّ مقفول أثناء الحفظ (ب١٢: ما يُكتب أثناء انتظار الأسعار كان يُهمَل بصمت) وبعد نتيجة مجهولة (ب١٤).
  const locked = saving !== null || frozen !== null;

  const outputs = useMemo(() => [...(data?.feedItems ?? []), ...madeOutputs.filter((made) => !(data?.feedItems ?? []).some((item) => item.id === made.id))], [data, madeOutputs]);
  const categories = useMemo(
    () => [...(data?.categories ?? []), ...madeCategories.filter((made) => !(data?.categories ?? []).some((category) => category.id === made.id))],
    [data, madeCategories],
  );
  const nameTaken = name.trim() !== '' && (data?.recipeNames ?? []).some((taken) => searchable(taken) === searchable(name));

  const view = lines.map((line) => {
    const shown = viewCardLine(line);
    const { qty } = shown;
    const linePrice: PriceState = prices[line.item.id] ?? { status: 'hidden' };
    const priceText = costTexts[line.item.id];
    const typedValue = priceText === undefined || priceText.trim() === '' ? null : parseMoney(priceText);
    const priceInvalid = priceText !== undefined && priceText.trim() !== '' && (typedValue === null || typedValue <= 0n);
    const typed = typedValue !== null && typedValue > 0n ? typedValue : null;
    const saved = linePrice.status === 'ready' ? linePrice : null;
    // سعر مكتوب لم يُحفظ (م٦): قيمة > 0 تخالف المحفوظ وحدها (ب١٣)، تُرسل قبل الخلطة بشرط السعر الذي رأته الشاشة؛ وما كُتب والسعر
    // يُقرأ من جديد ينتظر القراءة. الخلية الممسوحة ليست سعراً معلّقاً: الحفظ لا يحذف سعراً محفوظاً (يُحذف بزرّ «حفظ» في الخلية نفسها).
    const pricePending = canPrice && typed !== null && (saved === null || typed !== saved.costPrice);
    const price = planningPrice(typed, saved?.costPrice ?? null, saved?.lastPrice ?? null);
    return { ...shown, line, linePrice, price, priceText, priceInvalid, pricePending, typed, qtyBase: qty !== null && shown.qtyOk && shown.densityUnread === false ? lineBaseQty(qty, line.unit, line.item.baseUnit, line.item.density) : null };
  });
  const basisRows = view.filter((row) => row.inBasis);
  const totals = cardTotals(view);
  const massKnown = totals.known;
  const sum = totals.sum;
  // لا أساس يُكتب (كلمة المالك 2026-11-07): الأساس المرسَل مجموع ما داخل الكتلة بالكيلوغرام، فالتفعيل يطابقه دائماً.
  const basis = sum;
  const basisOk = massKnown && sum > 0n;
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
  if (!view.length) draftMissing.push(t('mill.builder.need_cards', 'اختر مادّة واحدة على الأقلّ من البطاقات واكتب كميتها.'));
  else if (!basisRows.length) draftMissing.push(t('mill.builder.need_basis_line', 'أضف مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يكوّنان خلطة.'));
  for (const row of view) if (!row.qtyOk) draftMissing.push(t('mill.builder.need_qty', 'اكتب كمية «{name}» أكبر من صفر.', { name: row.line.item.name }));
  for (const row of view) {
    if (row.densityMissing) draftMissing.push(t('mill.builder.need_density_of', '«{name}» سائل بلا كثافة، فلا يُحسب وزنه: اكتب كثافته على بطاقته.', { name: row.line.item.name }));
    else if (row.densityUnread) draftMissing.push(t('mill.builder.density_unread', 'كثافة «{name}» لم تُقرأ بعد: انتظر لحظة أو أعد قراءتها من بطاقته.', { name: row.line.item.name }));
    // سطر لتر تُقرَّب كتلته صفراً (ق٦٤): الخادم يرفضه qty_not_positive، فيُسمّى قبل الإرسال.
    else if (row.mass === 0n) draftMissing.push(t('mill.builder.zero_mass', 'كمية «{name}» تُقرَّب صفراً بالكيلوغرام: اكتب كمية أكبر.', { name: row.line.item.name }));
  }
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
    else if (row.pricePending && row.linePrice.status === 'failed') draftMissing.push(t('mill.builder.price_unread', 'تعذّرت قراءة سعر «{name}»: أعد قراءته ثم احفظ، أو امسح السعر المكتوب.', { name: row.line.item.name }));
    else if (row.pricePending && row.linePrice.status !== 'ready') draftMissing.push(t('mill.builder.price_wait', 'سعر «{name}» يُقرأ الآن: انتظر لحظة ثم احفظ.', { name: row.line.item.name }));
  }
  // المسوّدة والتفعيل بالشروط نفسها الآن: الأساس هو المجموع، فلا فرق يمنع التفعيل وحده.
  if (view.length && basisRows.length && massKnown && !basisOk) draftMissing.push(t('mill.builder.need_sum', 'مجموع الخلطة صفر: اكتب كمية أكبر من صفر.'));
  const canDraft = canBuild && draftMissing.length === 0 && basisOk;
  const canActivate = canDraft;
  const planned = costs && basisOk ? plannedCost(view.map((row) => ({ qtyBase: row.qtyBase, price: row.price })), sentRates.map((row) => row.value ?? 0n), basis) : null;
  const massDecimals = columnDecimals(basisRows.map((row) => row.mass ?? 0n), 3) as 0 | 1 | 2 | 3;
  const qtyDecimals = columnDecimals(view.map((row) => row.qty ?? 0n), 3) as 0 | 1 | 2 | 3;
  const noExclude = useMemo(() => new Set<string>(), []);
  const pendingPrices = view.filter((row) => row.pricePending && row.linePrice.status === 'ready');

  const setPrice = (itemId: string, price: PriceState) => setPrices((current) => ({ ...current, [itemId]: price }));
  const loadPrice = (item: PickedMaterial) => {
    loadItemPurchases(item.id).then(
      (found) => setPrice(item.id, { status: 'ready', costPrice: found.item.costPrice, lastPrice: found.rows[0]?.money?.unitCost ?? null }),
      (problem: unknown) => setPrice(item.id, { status: 'failed', error: problem }),
    );
  };

  /** مادّة اختيرت من بطاقتها أو أُنشئت من المنتقي: سعرها يُقرأ (مال، فلأدوار الكلفة وحدها)، والمُنشأة الآن بلا شراء ولا سعر. */
  const onAdded = (item: PickedMaterial, fresh: boolean) => {
    const price: PriceState = !costs ? { status: 'hidden' } : fresh ? { status: 'ready', costPrice: null, lastPrice: null } : { status: 'loading' };
    setPrice(item.id, price);
    if (costs && !fresh) loadPrice(item);
  };
  const dropCostText = (itemId: string) =>
    setCostTexts((current) => {
      if (!(itemId in current)) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  /** سعر رُفض: يُقرأ من جديد (تغيّر من غير هذه الشاشة ربّما)، والمكتوب يبقى ليُراجَع ويُحفظ ثانية. */
  const reloadPrice = (item: PickedMaterial) => {
    setPrice(item.id, { status: 'loading' });
    loadPrice(item);
  };

  const savePrice = async (item: PickedMaterial, linePrice: PriceState) => {
    const text = costTexts[item.id] ?? '';
    const price = text.trim() === '' ? null : parseMoney(text);
    if (linePrice.status !== 'ready' || (price !== null && price <= 0n) || (text.trim() !== '' && price === null)) return;
    const line = { item };
    setPriceBusy(line.item.id);
    setPriceErrors((current) => ({ ...current, [line.item.id]: '' }));
    try {
      const written = await setItemCostPrice(line.item.id, price, linePrice.costPrice);
      setPrice(line.item.id, { ...linePrice, costPrice: written });
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
      const before = row.linePrice.status === 'ready' ? row.linePrice.costPrice : null;
      try {
        const written = await setItemCostPrice(item.id, row.typed, before);
        setPrice(item.id, { status: 'ready', costPrice: written, lastPrice: row.linePrice.status === 'ready' ? row.linePrice.lastPrice : null });
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
      // الكمية تُكتب على البطاقة (cards.tsx)؛ الجدول ملخّص يقرؤها.
      cell: (row) => <Num>{row.qtyOk && row.qty !== null ? fmtQtyCell(row.qty, qtyDecimals) : dash()}</Num>,
    },
    {
      key: 'unit',
      header: t('mill.line.unit_col', 'الوحدة'),
      cell: (row) => (row.line.unit === 'L' ? t('unit.L', 'لتر') : t('unit.kg', 'كغم')),
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
      total: <Num>{basisOk ? pct(sum, basis) : dash()}</Num>,
    },
  ];
  if (costs) {
    columns.push(
      {
        key: 'last',
        header: t('mill.col.last_price', 'سعر الشراء (آخر شراء)'),
        kind: 'number',
        cell: (row) =>
          row.linePrice.status === 'loading' ? (
            t('mill.builder.price_loading', '…')
          ) : row.linePrice.status === 'failed' ? (
            <Button size="sm" variant="ghost" disabled={locked} onClick={() => loadPrice(row.line.item)} data-action="retry-price">
              {t('mill.builder.price_retry', 'أعد قراءة السعر')}
            </Button>
          ) : (
            <Num>{row.linePrice.status === 'ready' && row.linePrice.lastPrice !== null ? fmtMoney(row.linePrice.lastPrice) : dash()}</Num>
          ),
      },
      {
        key: 'cost',
        header: t('mill.col.cost_price', 'سعر الكلفة'),
        kind: 'number',
        cell: (row) => {
          const price = row.linePrice;
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
                onSave={() => void savePrice(row.line.item, row.linePrice)}
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
      <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={locked} onClick={() => picks.remove(row.line.item.id)} data-action="remove-line">
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
        subtitle={t('mill.builder.subtitle_cards', 'سمِّ الخلطة واختر منتجها، ثمّ المس بطاقات المواد واكتب كمية كلّ واحدة: مجموعها هو حجم الخلطة وناتجها.')}
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
        <Field
          id={`${id}-name`}
          label={t('mill.recipe.name', 'اسم الخلطة')}
          hint={t('mill.recipe.name_hint', 'مثل: علف بادئ، علف ناهٍ.')}
          error={nameTaken ? t('mill.builder.name_taken', 'توجد خلطة بهذا الاسم؛ اختر اسماً آخر أو افتحها من المعمل.') : null}
        >
          <input id={`${id}-name`} className="input" maxLength={80} value={name} disabled={locked} onChange={(event) => setName(event.target.value)} data-action="recipe-name" />
        </Field>
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
        <p className="text-sm text-ink-muted">{t('mill.cards.hint', 'المس البطاقة لتختار المادّة، واكتب كميتها عليها؛ لمسة ثانية تتركها. تختار أكثر من مادّة معاً.')}</p>
        <MaterialCards
          id={`${id}-cards`}
          stock={stock}
          picks={picks}
          query={query}
          onQuery={setQuery}
          exclude={noExclude}
          canCreate={canCreateItem}
          canFixKind={canFixKind}
          canWriteDensity={canFixKind}
          disabled={locked}
          onAdded={onAdded}
        />
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3" data-action="builder-totals">
          <CardSums totals={totals} lines={view.length} />
          {basisRows.length ? (
            <CompositionBar pieces={basisRows.map((row) => ({ key: row.line.item.id, label: row.line.item.name, weight: row.mass ?? 0n }))} total={basisOk ? basis : 0n} hue={210} />
          ) : null}
        </div>
        <DataTable
          caption={t('mill.builder.caption', 'مواد الخلطة الجديدة بكمياتها وحصصها وأسعارها')}
          columns={columns}
          rows={view}
          rowKey={(row) => row.line.item.id}
          empty={t('mill.builder.empty_cards', 'لم تختر مادّة بعد: المس بطاقتها فوق، أو اكتب اسمها في البحث وأنشئها إن لم تكن موجودة.')}
          totalLabel={t('mill.detail.total', 'المجموع')}
        />
        {outsideBasis ? (
          <p className="text-sm text-ink-muted" data-action="mass-note">
            {t('mill.builder.outside_note', 'الوقود والتعبئة خارج كتلة الخلطة: يُسحبان وتُحسب كلفتهما، ولا يدخلان مجموع الخلطة ولا ناتجها.')}
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
      ) : null}
    </div>
  );
}
