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
import { describeError } from '../../lib/errors';
import { columnDecimals, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { createItem, loadItemPurchases, setItemCostPrice } from '../../lib/repo/inventory';
import { createRecipe, loadBuilder, type BuilderData, type CategoryOption, type RecipeUnit } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { CellEdit, MaterialPicker, newItemFields, unitWord, type PickedMaterial } from './pickers';
import { CompositionBar, dash, pct } from './shared';

// بانية الخلطة بشاشة واحدة (0016، كلمة المالك 2026-11-04: «لمن اسوي خلطة… المفروض تطلعلي قائمة انتاج كاملة اضيف منها المواد
// وكميات المواد واكثر من مادة واحدد سعر كل مادة وايضا اضيف اشياء اختيارية وتكاليف اختيارية حتى لو ما موجودة بالمعمل»). كانت
// نافذة اسم ومنتج وحدها، والسطور في صفحة أخرى لم يجدها المالك فأنشأ خلطة بلا سطر. هنا كلّ شيء معاً: الاسم والمنتج (يُختار أو
// يُنشأ هنا) والأساس وجدول المواد (يُختار أو يُنشأ هنا، بسعر الشراء التلقائي وسعر الكلفة المكتوب) وجدول تكاليف الطنّ، وسطر حيّ
// للمجموع والفرق عن الأساس وكلفة الطنّ المتوقّعة. والحفظ نداء create_recipe واحد (معاملة واحدة). الحساب الحيّ هنا عرض أثناء
// الكتابة فقط بالأعداد الصحيحة (bigint)؛ المرجع للتفعيل حساب الخادم (basis_mismatch)، ولكلفة الطنّ قارئ الخلطة بعد الحفظ.

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
  const costs = Boolean(workspace?.canSeeCost);
  // سعر الكلفة يكتبه من يكتب سعر البيع (set_item_cost_price: stores.manage وأدوار الكلفة).
  const canPrice = costs && role !== null && can(role, 'stores.manage');
  const load = useCallback(() => loadBuilder(), []);
  const { data, error, retry } = useLoad<BuilderData>(load);

  const [name, setName] = useState('');
  const [outputId, setOutputId] = useState('');
  const [madeOutputs, setMadeOutputs] = useState<readonly { id: string; name: string }[]>([]);
  const [newOutput, setNewOutput] = useState('');
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [basisText, setBasisText] = useState(DEFAULT_BASIS);
  const [lines, setLines] = useState<readonly BuilderLine[]>([]);
  const [costTexts, setCostTexts] = useState<Readonly<Record<string, string>>>({});
  const [priceBusy, setPriceBusy] = useState<string | null>(null);
  const [priceErrors, setPriceErrors] = useState<Readonly<Record<string, string>>>({});
  const [rates, setRates] = useState<readonly RateRow[]>([]);
  const [saving, setSaving] = useState<'draft' | 'active' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const ids = useRef<{ recipe: string; version: string } | null>(null);
  const rateSeq = useRef(0);

  const dirty = name.trim() !== '' || lines.length > 0 || rates.length > 0 || newOutput.trim() !== '' || outputId !== '';
  useDirtyForm(dirty && saving === null);

  const outputs = useMemo(() => [...(data?.feedItems ?? []), ...madeOutputs.filter((made) => !(data?.feedItems ?? []).some((item) => item.id === made.id))], [data, madeOutputs]);
  const basis = parseQty(basisText);
  const basisOk = basis !== null && basis > 0n;
  const nameTaken = name.trim() !== '' && (data?.recipeNames ?? []).some((taken) => searchable(taken) === searchable(name));

  const view = lines.map((line) => {
    const qty = line.qtyText.trim() === '' ? null : parseQty(line.qtyText);
    const qtyOk = qty !== null && qty > 0n;
    const mass = qtyOk ? lineMassKg(qty, line.unit, line.item.density) : null;
    const typedText = costTexts[line.item.id];
    const typed = typedText === undefined || typedText.trim() === '' ? null : parseMoney(typedText);
    const saved = line.price.status === 'ready' ? line.price : null;
    const price = planningPrice(typed !== null && typed > 0n ? typed : null, saved?.costPrice ?? null, saved?.lastPrice ?? null);
    return { line, qty, qtyOk, mass, price, qtyBase: qtyOk ? lineBaseQty(qty, line.unit, line.item.baseUnit, line.item.density) : null };
  });
  const massKnown = view.every((row) => row.mass !== null);
  const sum = view.reduce((total, row) => total + (row.mass ?? 0n), 0n);
  const gap = basisOk ? basis - sum : 0n;
  const ratesView = rates.map((rate) => {
    const value = rate.amountText.trim() === '' ? null : parseMoney(rate.amountText);
    return { rate, value, ok: rate.categoryId !== '' && value !== null && value > 0n };
  });
  const linesOk = view.every((row) => row.qtyOk);
  const ratesOk = ratesView.every((row) => row.ok);
  const nameOk = name.trim().length > 0 && name.trim().length <= 80 && !nameTaken;
  const canDraft = canBuild && nameOk && outputId !== '' && basisOk && linesOk && ratesOk;
  const balanced = view.length > 0 && massKnown && basisOk && gap === 0n;
  const canActivate = canDraft && balanced;
  const planned = costs && basisOk ? plannedCost(view.map((row) => ({ qtyBase: row.qtyBase, price: row.price })), ratesView.map((row) => row.value ?? 0n), basis) : null;
  const massDecimals = columnDecimals(view.map((row) => row.mass ?? 0n), 3) as 0 | 1 | 2 | 3;
  const exclude = useMemo(() => new Set(lines.map((line) => line.item.id)), [lines]);

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

  const savePrice = async (line: BuilderLine) => {
    const text = costTexts[line.item.id] ?? '';
    const price = text.trim() === '' ? null : parseMoney(text);
    if (line.price.status !== 'ready' || (price !== null && price <= 0n) || (text.trim() !== '' && price === null)) return;
    setPriceBusy(line.item.id);
    setPriceErrors((current) => ({ ...current, [line.item.id]: '' }));
    try {
      const written = await setItemCostPrice(line.item.id, price, line.price.costPrice);
      patchLine(line.item.id, { price: { ...line.price, costPrice: written } });
      setCostTexts((current) => {
        const next = { ...current };
        delete next[line.item.id];
        return next;
      });
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setPriceErrors((current) => ({ ...current, [line.item.id]: `${title} ${detail}` }));
      // سعر تغيّر من غير هذه الشاشة: يُقرأ من جديد، والمكتوب يبقى ليُراجَع ويُحفظ ثانية.
      setLines((current) => current.map((row) => (row.item.id === line.item.id ? { ...row, price: { status: 'loading' } } : row)));
      loadPrice(line.item);
    } finally {
      setPriceBusy(null);
    }
  };

  const createOutput = async () => {
    const wanted = newOutput.trim();
    if (!wanted || outputBusy) return;
    const same = outputs.find((item) => searchable(item.name) === searchable(wanted));
    if (same) {
      // المنتج موجود بالاسم نفسه: يُختار بدل إنشاء ثانٍ (المالك كرّر «ذرة» فصار «ذراء»).
      setOutputId(same.id);
      setNewOutput('');
      setOutputError(null);
      return;
    }
    setOutputBusy(true);
    setOutputError(null);
    try {
      const row = await createItem(newItemFields(wanted, 'feed'));
      setMadeOutputs((current) => [...current, { id: row.id, name: row.name }]);
      setOutputId(row.id);
      setNewOutput('');
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setOutputError(`${title} ${detail}`);
    } finally {
      setOutputBusy(false);
    }
  };

  const addRate = () => {
    rateSeq.current += 1;
    const key = `rate-${rateSeq.current}`;
    setRates((current) => [...current, { key, categoryId: '', amountText: '' }]);
  };

  const save = async (activate: boolean) => {
    if (!(activate ? canActivate : canDraft) || !basisOk || saving) return;
    // المعرّفان من الجهاز ويبقيان لهذه الشاشة حتى تُعرف النتيجة: إعادةٌ بعد جواب ضائع ترجّع الخلطة نفسها لا ثانية.
    ids.current ??= { recipe: crypto.randomUUID(), version: crypto.randomUUID() };
    setSaving(activate ? 'active' : 'draft');
    setFailure(null);
    try {
      const created = await createRecipe({
        id: ids.current.recipe,
        versionId: ids.current.version,
        name: name.trim(),
        outputItemId: outputId,
        basisKg: basis,
        lines: view.map((row) => ({ itemId: row.line.item.id, qty: row.qty ?? 0n, unit: row.line.unit })),
        rates: ratesView.map((row) => ({ categoryId: row.rate.categoryId, amountPerTon: row.value ?? 0n })),
        activate,
      });
      ids.current = null;
      toast({
        tone: 'success',
        title:
          created.status === 'active'
            ? t('mill.builder.saved_active', 'حُفظت الخلطة «{name}» وفُعّلت: صارت جاهزة للإنتاج.', { name: name.trim() })
            : t('mill.builder.saved_draft', 'حُفظت الخلطة «{name}» مسوّدة.', { name: name.trim() }),
      });
      navigate(`/mill/recipe/${created.id}`);
    } catch (problem) {
      const { title, detail } = describeError(problem);
      // معرّف لخلطة أخرى (محاولة سابقة كُتبت باسم غير هذا): المحاولة التالية بمعرّفين جديدين.
      if (problem instanceof Error && problem.message === 'id_conflict') ids.current = null;
      setFailure(`${title} ${detail}`);
      setSaving(null);
    }
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
          <span className="text-xs text-ink-muted">{t('mill.builder.item_meta', '{kind} · تُقاس بـ{unit}', { kind: itemKindLabel(row.line.item.kind), unit: unitWord(row.line.item.baseUnit) })}</span>
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
      cell: (row) => <Num>{row.mass === null ? dash() : fmtQtyCell(row.mass, massDecimals)}</Num>,
      total: <Num>{massKnown ? fmtQtyCell(sum, massDecimals) : dash()}</Num>,
    },
    {
      key: 'share',
      header: t('mill.col.share', 'الحصّة'),
      kind: 'number',
      cell: (row) => <Num>{row.mass === null || !basisOk ? dash() : pct(row.mass, basis)}</Num>,
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
            <Button size="sm" variant="ghost" onClick={() => loadPrice(row.line.item)} data-action="retry-price">
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
          const parsed = text.trim() === '' ? null : parseMoney(text);
          const invalid = text.trim() !== '' && (parsed === null || parsed <= 0n);
          const problem = priceErrors[row.line.item.id];
          if (!canPrice) return <Num>{price.costPrice === null ? dash() : fmtMoney(price.costPrice)}</Num>;
          return (
            <span className="flex flex-col items-end gap-1">
              <CellEdit
                id={`${id}-cost-${row.line.item.id}`}
                label={t('mill.builder.cost_of', 'سعر كلفة «{name}» لكلّ {unit}', { name: row.line.item.name, unit: unitWord(row.line.item.baseUnit) })}
                value={text}
                dirty={text !== saved}
                invalid={invalid}
                busy={priceBusy === row.line.item.id}
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
      <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setLines((current) => current.filter((line) => line.item.id !== row.line.item.id))} data-action="remove-line">
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
          onChange={(event) => setRates((current) => current.map((rate) => (rate.key === row.rate.key ? { ...rate, categoryId: event.target.value } : rate)))}
          data-action="rate-category"
        >
          <option value="">{t('mill.rates.category_pick', 'اختر فئة المصروف')}</option>
          {(data?.categories ?? [])
            .filter((option: CategoryOption) => option.id === row.rate.categoryId || !rates.some((rate) => rate.categoryId === option.id))
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
          aria-invalid={(row.rate.amountText.trim() !== '' && (row.value === null || row.value <= 0n)) || undefined}
          onChange={(event) => setRates((current) => current.map((rate) => (rate.key === row.rate.key ? { ...rate, amountText: event.target.value } : rate)))}
          data-action="rate-amount"
        />
      ),
      total: <Num>{fmtMoney(ratesView.reduce((total, row) => total + (row.value ?? 0n), 0n))}</Num>,
    },
    {
      key: 'remove',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (row) => (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setRates((current) => current.filter((rate) => rate.key !== row.rate.key))} data-action="remove-rate">
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
            <input id={`${id}-name`} className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} data-action="recipe-name" />
          </Field>
          <Field id={`${id}-basis`} label={t('mill.builder.basis', 'أساس الخلطة (كغم)')} hint={t('mill.builder.basis_hint', 'الكميات تُكتب لكلّ هذا الوزن، والإنتاج يحسبها بالتناسب.')} error={basisText.trim() !== '' && !basisOk ? t('mill.builder.basis_bad', 'اكتب وزناً أكبر من صفر.') : null}>
            <input id={`${id}-basis`} className="input tabular-nums" inputMode="decimal" dir="ltr" value={basisText} onChange={(event) => setBasisText(event.target.value)} data-action="recipe-basis" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-output`} label={t('mill.recipe.output', 'المادّة المنتَجة')} hint={t('mill.builder.output_hint', 'العلف الجاهز الذي يخرج من الخلطة ويدخل مخزن العلف.')}>
            <select id={`${id}-output`} className="input" value={outputId} onChange={(event) => setOutputId(event.target.value)} data-action="recipe-output">
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
                <input id={`${id}-new-output`} className="input" maxLength={120} value={newOutput} onChange={(event) => setNewOutput(event.target.value)} data-action="new-output-name" />
                <Button variant="secondary" icon={<Plus className="size-5" aria-hidden="true" />} busy={outputBusy} disabled={newOutput.trim() === ''} onClick={() => void createOutput()} data-action="create-output">
                  {t('mill.builder.create_output', 'أنشئ')}
                </Button>
              </span>
            </Field>
          ) : null}
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t('mill.builder.materials', 'المواد')}</h2>
        <MaterialPicker id={`${id}-picker`} exclude={exclude} canCreate={canCreateItem} onPick={addLine} />
        {view.length ? (
          <CompositionBar pieces={view.map((row) => ({ key: row.line.item.id, label: row.line.item.name, weight: row.mass ?? 0n }))} total={basisOk ? basis : 0n} hue={210} />
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
          {!view.length
            ? t('mill.builder.sum_empty', 'المجموع صفر من {basis}.', { basis: basisOk ? fmtQty(basis, 'kg').main : dash() })
            : !massKnown
              ? t('mill.builder.sum_unknown', 'في المواد سائل بلا كثافة، فلا يُحسب وزنه؛ اكتب كميته بالكيلوغرام أو أكمل كثافته من بطاقته.')
              : !basisOk
                ? t('mill.builder.sum_no_basis', 'المجموع {sum}، والأساس غير مكتوب.', { sum: fmtQty(sum, 'kg').main })
                : gap === 0n
                  ? t('mill.builder.sum_ok', 'المجموع {sum} = الأساس: الخلطة جاهزة للتفعيل.', { sum: fmtQty(sum, 'kg').main })
                  : gap > 0n
                    ? t('mill.builder.sum_short', 'المجموع {sum} من {basis}: ينقص {gap}.', { sum: fmtQty(sum, 'kg').main, basis: fmtQty(basis, 'kg').main, gap: fmtQty(gap, 'kg').main })
                    : t('mill.builder.sum_over', 'المجموع {sum} من {basis}: يزيد {gap}.', { sum: fmtQty(sum, 'kg').main, basis: fmtQty(basis, 'kg').main, gap: fmtQty(-gap, 'kg').main })}
        </p>
      </section>

      {costs ? (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('mill.rates.title', 'تكاليف لكلّ طنّ')}</h2>
          <p className="text-sm text-ink-muted">
            {t('mill.rates.hint', 'أيدي عاملة أو كهرباء أو نقل: مبلغ لكلّ طنّ يُحسب على كلّ دفعة بكميتها، ويُحمَّل عند الإنتاج من مصروف مسجّل بفئته.')}
          </p>
          {data.categories.length ? (
            <>
              <DataTable
                caption={t('mill.rates.caption', 'تكاليف الخلطة لكلّ طنّ بفئة المصروف')}
                columns={rateColumns}
                rows={ratesView}
                rowKey={(row) => row.rate.key}
                empty={t('mill.rates.empty', 'لا تكاليف على هذه الخلطة. أضفها إن كان للعلف حصّة من مصروف.')}
                totalLabel={t('mill.detail.total', 'المجموع')}
              />
              <div>
                <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden="true" />} disabled={rates.length >= data.categories.length} onClick={addRate} data-action="add-rate">
                  {t('mill.rates.add', 'أضف تكلفة')}
                </Button>
              </div>
            </>
          ) : (
            <Notice
              tone="info"
              title={t('mill.rates.no_categories', 'لا فئة مصروف بعد.')}
              action={
                <Link to="/settings/org" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-expense-categories">
                  {t('mill.rates.categories_link', 'أضف فئات المصاريف')}
                </Link>
              }
            />
          )}
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

      {failure ? <Notice tone="danger" title={failure} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
          busy={saving === 'active'}
          disabled={!canActivate || saving !== null}
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
          disabled={!canDraft || saving !== null}
          onClick={() => void save(false)}
          data-action="save-draft"
        >
          {t('mill.builder.save_draft', 'احفظ مسوّدة')}
        </Button>
      </div>
      {!canActivate && canDraft ? <p className="text-sm text-ink-muted">{t('mill.builder.activate_hint', 'التفعيل يحتاج مادّة واحدة على الأقلّ ومجموعاً يساوي الأساس بالضبط؛ المسوّدة تُحفظ في كلّ حال وتُكمل من بطاقة الخلطة.')}</p> : null}
    </div>
  );
}
