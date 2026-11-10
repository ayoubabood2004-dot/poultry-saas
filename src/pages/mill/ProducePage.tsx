import { CheckCircle2, Factory, Scale } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { roundHalfAway, type Milli } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import type { ItemKind } from '../../domain/stores';
import { kgToLiters, litersToKg, parseQty, type BaseUnit } from '../../domain/units';
import { parseDayText } from '../../lib/dayText';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { columnDecimals, fmtCounted, fmtDay, fmtMilli, fmtMoney, fmtQty, fmtQtyCell, type CountedForms } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { loadItem, loadStockOnHand, type StockCursor } from '../../lib/repo/inventory';
import { createProduction, isDuplicate, loadProduce, recordProduction, type PlanLine, type ProduceData, type ProductionRequest, type RecordedProduction } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { kgText } from './cards';
import { produceKg, PRODUCE_UNITS, QUICK_AMOUNTS } from './MillPage';
import { inBasisKind, MILL_RAW_KINDS, unitWord } from './pickers';
import { dash, forgetMillRef, millRef, pct, recipeColor } from './shared';

// الإنتاج بشاشة واحدة (0023، كلمة المالك 2026-11-10: «يكدر يسوي انتاج… ورا ما يحدد كمياتها ويشوف الكمية الي راح يتم انتاجها، واذا باقي للطن شوية
// يكدر يسوي زر تقريبي انها طن ويكتب ملاحظة اختيارية شلون وصلنا للطن»؛ وجوابه «شاشة واحدة للكمية والمواد»): الكمية (كميات سريعة أو مكتوبة بالكيلوغرام
// أو بالطن)، والمواد مخطّطة بنسبة الخلطة كما يخطّطها الخادم (create_production: كتلة السطر × الكمية ÷ (الأساس × كثافة السائل × خطوة العدّاد) بتقريب
// واحد ثمّ × الخطوة)، وكمية كلّ مادّة تُعدَّل، و«عندك» من مخزن المواد المختار، وكتلة المواد = الناتج المتوقّع حيّةً. و«قرّب إلى طنّ»: الفرق كلّه من مادّة
// واحدة يكتب اسمها (برمكس): سطر في الخلطة يزيد بكميته (p_actuals)، أو مادّة من المخزن تُضاف للدفعة (p_extra)، واللتر بكثافته وبخطوة العدّاد ثمّ يُعاد حساب
// المجموع؛ ويُرى ويُتراجع عنه. و«أنتج» نداء record_production واحد بمعرّف الدفعة ومرجع المحاولة من الجهاز: نتيجة مجهولة تجمّد الشاشة وفعلها الوحيد «أعد
// المحاولة» بالطلب نفسه حرفاً (لا دفعة ثانية أبداً)، والرفض يُقال بتلميح الخادم والمكتوب باقٍ. والتعديلات و«قرّب» مربوطة بالكمية التي كُتبت لها: تغيير
// الكمية يعيد المواد إلى المخطّط وتبقى التعديلات محفوظة لتلك الكمية (لا تُطبَّق أرقام كمية على أخرى بصمت).
// وبعد مراجعة القاعدة (العقد): «أنتج» والشاشة لمن يملك production.draft وحده؛ والنتيجة بحسب الجواب (مرحَّلة أو مسوّدة تنتظر الكلف لأيّ دور)؛ و«احفظ
// مسوّدة» ثانويّ (create_production بمعرّف من الجهاز ثمّ صفحة الدفعة) لإخراج مادّة أو تبديلها أو تعديل تكاليف الدفعة؛ وid_conflict (طلب بالمعرّف نفسه
// يسابقه) كالنتيجة المجهولة، وqty_too_large وstale_preview رفضان بتلميحهما.

const TON: Milli = 1_000_000n;
/** كثافة الكيلوغرام في معادلة الخادم (coalesce(v_density, 1) بأربع مراتب). */
const UNIT_DENSITY = 10_000n;

/**
 * كمية السطر المخطّطة بوحدة أساس مادّته (بالآلاف) مرآةً لـcreate_production: خطوات العدّاد = تقريب نصفاً بعيداً عن الصفر لـ(كتلة السطر × الكمية ×
 * ١٠٬٠٠٠) ÷ (الأساس × الكثافة × الخطوة)، ثمّ × الخطوة؛ والكثافة ١ للكيلوغرام. null إن لم يُعرف ما يُخطَّط به.
 */
export function plannedQty(line: Pick<PlanLine, 'lineKg' | 'baseUnit' | 'density' | 'scaleStep'>, plannedKg: Milli, basisKg: Milli): Milli | null {
  if (line.lineKg === null || line.lineKg <= 0n || plannedKg <= 0n || basisKg <= 0n) return null;
  const density = line.baseUnit === 'L' ? line.density : line.baseUnit === 'kg' ? UNIT_DENSITY : null;
  if (density === null || density <= 0n) return null;
  const numerator = line.lineKg * plannedKg * UNIT_DENSITY;
  return line.scaleStep > 0n ? roundHalfAway(numerator, basisKg * density * line.scaleStep) * line.scaleStep : roundHalfAway(numerator, basisKg * density);
}

/** الكتلة المخطّطة للسطر بالكيلو (create_production يرفض صفرها qty_not_positive). */
export function plannedMass(lineKg: Milli, plannedKg: Milli, basisKg: Milli): Milli {
  return roundHalfAway(lineKg * plannedKg, basisKg);
}

/** كتلة كمية بالكيلو كما يحسبها الخادم للهدر (input_mass_kg): الكيلو كما هو، واللتر × الكثافة بثلاث مراتب؛ وبلا كثافة null. */
export function massOf(qty: Milli, unit: BaseUnit, density: bigint | null): Milli | null {
  if (unit === 'kg') return qty;
  if (unit === 'L' && density !== null && density > 0n) return litersToKg(qty, density);
  return null;
}

const ceilStep = (qty: Milli, step: Milli): Milli => (step > 0n ? ((qty + step - 1n) / step) * step : qty);

/**
 * ما يُضاف إلى مادّة واحدة ليبلغ المجموع الطنّ (الفرق gap بالكيلو) بأقلّ زيادة: لسطر خلطة بالكيلوغرام الفرق نفسه (الكمية الفعلية لا تُقرَّب بخطوة
 * العدّاد)، ولمادّة تُضاف للدفعة بالكيلوغرام الفرق مرفوعاً إلى خطوة عدّادها (add_production_input يقرّبها لها)، وللّتر أقلّ عدد خطوات تبلغ كتلتُه
 * (بالكثافة، فوق كمية المادّة الآن base) الفرقَ. null: سائل بلا كثافة أو وحدة لا تُحسب.
 */
export function gapQty(base: Milli, gap: Milli, unit: BaseUnit, density: bigint | null, step: Milli, exact: boolean): Milli | null {
  if (gap <= 0n) return null;
  if (unit === 'kg') return exact ? gap : ceilStep(gap, step);
  if (unit !== 'L' || density === null || density <= 0n) return null;
  const unitStep = step > 0n ? step : 1n;
  const before = litersToKg(base, density);
  const gained = (add: Milli): Milli => litersToKg(base + add, density) - before;
  let steps = ceilStep(kgToLiters(gap, density), unitStep) / unitStep;
  if (steps < 1n) steps = 1n;
  for (let guard = 0; guard < 1_000 && steps > 1n && gained((steps - 1n) * unitStep) >= gap; guard += 1) steps -= 1n;
  for (let guard = 0; guard < 1_000 && gained(steps * unitStep) < gap; guard += 1) steps += 1n;
  return steps * unitStep;
}

/** الطنّ التالي فوق الكتلة (بالآلاف من الكيلو)، أو الكتلة نفسها إن كانت أطناناً كاملة. */
export const nextTon = (mass: Milli): Milli => ((mass + TON - 1n) / TON) * TON;

const tonForms = (): CountedForms => ({ one: t('mill.ton.one', 'طنّ واحد'), two: t('mill.ton.two', 'طنّين'), few: t('mill.ton.few', 'أطنان'), many: t('mill.ton.many', 'طنّاً') });
/** «طنّ واحد»، «طنّين»، «3 أطنان»، «12 طنّاً» (بعد حرف جرّ: «قرّب إلى…»، «لإكمال…»). */
export const tonsText = (mass: Milli): string => fmtCounted((mass / TON) * 1_000n, t('mill.ton', 'طنّ'), tonForms());

/** الكمية بوحدة أساسها («14.6 كغم»، «لتران»)، بلا طنّ ولا غرام. */
const amountText = (qty: Milli, unit: BaseUnit): string => {
  const shown = fmtQty(qty, unit);
  return shown.sub ?? shown.main;
};

/**
 * «قرّب إلى طنّ» المطبَّق: على سطر في الخلطة (تزيد كميته added فوق ما كُتب أو خُطّط)، أو مادّة من المخزن تُضاف للدفعة (qty، ومعرّف سطرها من الجهاز).
 * target الطنّ الذي أُكمل إليه وgap الفرق الذي حُسب له (بالكيلو): تغيّر الكتلة بعده (تعديل مادّة أخرى) يُظهر «قرّب» من جديد.
 */
type TopUp =
  | { kind: 'line'; lineNo: number; itemId: string; name: string; unit: BaseUnit; added: Milli; target: Milli; gap: Milli }
  | { kind: 'extra'; id: string; itemId: string; name: string; unit: BaseUnit; density: bigint | null; qty: Milli; target: Milli; gap: Milli };

/** تعديلات المواد و«قرّب» للكمية kg التي كُتبت لها. */
interface Adjust {
  kg: Milli;
  texts: Readonly<Record<number, string>>;
  topUp: TopUp | null;
}

/** مادّة في مخزن المواد المختار (stock_on_hand): المتاح الآن ومرشَّحات «قرّب». */
interface StoreItem {
  itemId: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  archived: boolean;
  available: Milli;
}

/** كلّ موادّ المخزن بموجودها الآن (stock_on_hand يعرض كلّ مادّة يستلمها المخزن ولو برصيد صفر)، صفحةً صفحة. */
async function readStore(warehouseId: string): Promise<ReadonlyMap<string, StoreItem> | null> {
  if (!warehouseId) return null;
  const items = new Map<string, StoreItem>();
  let after: StockCursor | null = null;
  for (let page = 0; page < 50; page += 1) {
    const board = await loadStockOnHand(warehouseId, after);
    for (const row of board.rows) items.set(row.itemId, { itemId: row.itemId, name: row.name, kind: row.kind, baseUnit: row.baseUnit, archived: row.archived, available: row.available });
    if (!board.next) break;
    after = board.next;
  }
  return items;
}

/** رقم موجب من نصّ المستخدم (بثلاث مراتب كحدّ أقصى)، وإلّا null. */
const positive = (text: string): Milli | null => {
  const value = text.trim() === '' ? null : parseQty(text);
  return value !== null && value > 0n ? value : null;
};

/**
 * لم يُحفظ شيء أكيداً: رفض الخادم، أو لم يخرج الطلب أو لم يصل، أو تزاحم فرجع، أو لا قاعدة ولا جلسة. وغيرها نتيجة مجهولة: ربّما سُجّلت الدفعة.
 */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

/** جملة الرفض: تلميح الخادم كما هو (production_blocked يسمّي أوّل مشكلة)، وإلّا وصف الخطأ. */
function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

interface Row {
  key: string;
  /** سطر الخلطة، أو null لمادّة «قرّب» المضافة من المخزن. */
  lineNo: number | null;
  itemId: string;
  name: string;
  unit: BaseUnit;
  density: bigint | null;
  inBasis: boolean;
  planned: Milli | null;
  text: string;
  qty: Milli | null;
  /** الكمية قبل «قرّب» (لسطر الخلطة الذي أُكمل به). */
  baseQty: Milli | null;
  /** ما زاده «قرّب» على السطر، أو كمية المادّة المضافة. */
  added: Milli | null;
  mass: Milli | null;
  baseMass: Milli | null;
  blocked: PlanLine['blocked'];
}

/** مرشَّح «من أيّ مادّة يُكمَل الفرق؟»: سطر في الخلطة، أو مادّة من مخزن المواد. */
interface Candidate {
  itemId: string;
  name: string;
  unit: BaseUnit;
  lineNo: number | null;
  available: Milli | null;
}

/** «من أيّ مادّة يُكمَل الفرق؟»: يكتب اسمها (برمكس)، وموادّ الخلطة أوّلاً ثمّ موادّ المخزن التي تصلح للخلطة. */
function GapDialog({
  title,
  storeName,
  inRecipe,
  fromStore,
  storeState,
  pending,
  failure,
  onRetryStore,
  onPick,
  onClose,
}: {
  title: string;
  storeName: string;
  inRecipe: readonly Candidate[];
  fromStore: readonly Candidate[];
  storeState: 'loading' | 'failed' | 'ready';
  pending: string | null;
  failure: string | null;
  onRetryStore: () => void;
  onPick: (candidate: Candidate) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const key = searchable(query);
  const match = (candidate: Candidate) => key === '' || searchable(candidate.name).includes(key);
  const recipeShown = inRecipe.filter(match);
  const storeShown = fromStore.filter(match);
  const option = (candidate: Candidate) => (
    <li key={candidate.itemId}>
      <Button
        variant="secondary"
        size="sm"
        busy={pending === candidate.itemId}
        disabled={pending !== null}
        onClick={() => onPick(candidate)}
        data-action="complete-option"
        data-id={candidate.itemId}
      >
        {candidate.available === null
          ? t('mill.gap.option', '{name} · {unit}', { name: candidate.name, unit: unitWord(candidate.unit) })
          : t('mill.gap.option_hand', '{name} · عندك {qty}', { name: candidate.name, qty: amountText(candidate.available, candidate.unit) })}
      </Button>
    </li>
  );
  return (
    <Dialog open onClose={onClose} locked={pending !== null} size="wide" title={title}>
      <p className="text-sm text-ink-muted">{t('mill.gap.hint', 'اكتب اسم المادّة التي يُكمَل بها الفرق (مثل برمكس): يُضاف الفرق كلّه إليها ويُسحب من المخزن.')}</p>
      <Field id={`${id}-search`} label={t('mill.gap.search', 'اسم المادّة')}>
        <input id={`${id}-search`} className="input" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} data-autofocus data-action="complete-search" />
      </Field>
      {recipeShown.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('mill.gap.recipe', 'من موادّ الخلطة')}</h3>
          <ul className="flex flex-wrap gap-2">{recipeShown.map(option)}</ul>
        </section>
      ) : null}
      {storeShown.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('mill.gap.store', 'موادّ أخرى في «{store}»', { store: storeName })}</h3>
          <ul className="flex flex-wrap gap-2">{storeShown.map(option)}</ul>
        </section>
      ) : null}
      {storeState === 'loading' ? <p className="text-sm text-ink-muted">{t('mill.gap.store_loading', 'تُقرأ موادّ المخزن…')}</p> : null}
      {storeState === 'failed' ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-action="complete-store-failed">
          <span className="text-danger-700 dark:text-danger-300">{t('mill.gap.store_failed', 'تعذّرت قراءة موادّ المخزن؛ موادّ الخلطة وحدها معروضة.')}</span>
          <Button size="sm" variant="secondary" onClick={onRetryStore} data-action="complete-store-retry">
            {t('dayb.reread', 'أعد القراءة')}
          </Button>
        </div>
      ) : null}
      {!recipeShown.length && !storeShown.length ? (
        <p className="text-sm text-ink-muted" data-action="complete-none">
          {key === ''
            ? t('mill.gap.empty', 'لا مادّة يُكمَل بها الفرق: موادّ الخلطة لا تُحسب كتلتها، ولا موادّ أخرى في «{store}».', { store: storeName })
            : t('mill.gap.none', 'لا مادّة باسم «{name}» في الخلطة ولا في «{store}» تصلح للإكمال.', { name: query.trim(), store: storeName })}
        </p>
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}
    </Dialog>
  );
}

/**
 * نتيجة «أنتج» بحسب الجواب لا الدور (عقد 0023): مرحَّلة (دخل العلف مخزنه)، أو مسوّدة تنتظر ختم الكلف — لمشغّل المعمل دائماً، ولمالك أو مدير لا يرى
 * نطاقُه الوحدةَ التي تُحمَّل التكاليف من مصاريفها.
 */
function ProducedView({ result, recipeId, onAgain }: { result: RecordedProduction; recipeId: string; onAgain: () => void }) {
  const links = (
    <div className="flex flex-wrap gap-2">
      <Link to={`/mill/batch/${result.id}`} className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 font-semibold hover:bg-surface-2" data-action="result-batch">
        {t('mill.produced.open_batch', 'افتح الدفعة')}
      </Link>
      {result.status === 'posted' ? (
        <Link to={`/mill/recipe/${recipeId}/report`} className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 font-semibold hover:bg-surface-2" data-action="result-report">
          {t('mill.produced.report', 'تقرير العليقة')}
        </Link>
      ) : null}
      <Button variant="secondary" icon={<Factory className="size-5" aria-hidden="true" />} onClick={onAgain} data-action="produce-again">
        {t('mill.produced.again', 'أنتج دفعة أخرى')}
      </Button>
    </div>
  );
  if (result.status === 'draft') {
    return (
      <section className="card flex flex-col gap-3 p-4" data-action="produced-draft">
        <h2 className="text-lg font-semibold">{t('mill.produced.draft_title', 'حُفظت الدفعة وتنتظر ختم الكلف')}</h2>
        <p data-action="produced-draft-text">
          {t('mill.produced.draft', 'حُفظت دفعة «{recipe}» ({qty}) مسوّدة: يختم كلفها من صفحتها («اختم الكلف») محاسبٌ أو مدير يرى مصاريف وحدتها، ثمّ تُرحَّل فيدخل العلف مخزنه.', {
            recipe: result.recipeName,
            qty: kgText(result.plannedKg),
          })}
        </p>
        {links}
      </section>
    );
  }
  return (
    <section className="card flex flex-col gap-3 p-4" data-action="produced-posted">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CheckCircle2 aria-hidden="true" className="size-6 text-brand-700 dark:text-brand-200" />
        {t('mill.produced.title', 'تمّ الإنتاج')}
      </h2>
      <p data-action="produced-text">
        {t('mill.produced.entered', 'دخل {qty} من «{item}» إلى «{store}».', { qty: kgText(result.outputQtyKg), item: result.outputItemName, store: result.outputWarehouseName })}
      </p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1">
          <dt className="text-ink-muted">{t('mill.produced.doc', 'رقم الدفعة')}</dt>
          <dd className="font-medium" data-action="produced-doc">
            <Num>{result.docNo}</Num>
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-ink-muted">{t('mill.produced.day', 'يوم الإنتاج')}</dt>
          <dd className="font-medium">{fmtDay(result.producedOn)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-ink-muted">{t('mill.produced.mass', 'كتلة المواد')}</dt>
          <dd className="font-medium">
            <Num>{kgText(result.inputMassKg)}</Num>
          </dd>
        </div>
        {result.shrinkKg !== 0n ? (
          <div className="flex gap-1">
            <dt className="text-ink-muted">{t('mill.produced.shrink', 'الهدر')}</dt>
            <dd className="font-medium">
              <Num>{kgText(result.shrinkKg)}</Num>
            </dd>
          </div>
        ) : null}
        {result.money?.costPerKg !== null && result.money?.costPerKg !== undefined ? (
          <div className="flex gap-1">
            <dt className="text-ink-muted">{t('mill.produced.cost', 'كلفة الكيلو')}</dt>
            <dd className="font-medium" data-action="produced-cost">
              <Num>{fmtMoney(result.money.costPerKg)}</Num>
            </dd>
          </div>
        ) : null}
        {result.money ? (
          <div className="flex gap-1">
            <dt className="text-ink-muted">{t('mill.produced.total', 'كلفة الدفعة')}</dt>
            <dd className="font-medium">
              <Num>{fmtMoney(result.money.totalValue)}</Num>
            </dd>
          </div>
        ) : null}
      </dl>
      {result.note ? <p className="text-sm text-ink-muted">{t('mill.produced.note', 'الملاحظة: {note}', { note: result.note })}</p> : null}
      {links}
    </section>
  );
}

export default function ProducePage() {
  const { recipeId = '' } = useParams();
  const fieldId = useId();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? null;
  const canProduce = role !== null && can(role, 'production.draft');
  const load = useCallback(() => loadProduce(recipeId), [recipeId]);
  const { data, error, retry } = useLoad<ProduceData>(load, recipeId);

  const [qtyText, setQtyText] = useState<string | null>(null);
  const [unitId, setUnitId] = useState('kg');
  const [adjust, setAdjust] = useState<Adjust | null>(null);
  const [fromPick, setFromPick] = useState<string | null>(null);
  const [toPick, setToPick] = useState<string | null>(null);
  const [dayText, setDayText] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [weighed, setWeighed] = useState(false);
  const [weightText, setWeightText] = useState('');
  const [reason, setReason] = useState('');
  const [expiryText, setExpiryText] = useState('');
  const [gapOpen, setGapOpen] = useState(false);
  const [gapPending, setGapPending] = useState<string | null>(null);
  const [gapFailure, setGapFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** طلب record_production بعد نتيجة مجهولة: الشاشة مجمَّدة والإعادة به وحده (المعرّف والمرجع نفسيهما). */
  const [frozen, setFrozen] = useState<ProductionRequest | null>(null);
  const [result, setResult] = useState<RecordedProduction | null>(null);
  /** معرّف الدفعة ومرجع المحاولة: يولدان عند «أنتج» ويبقيان حتّى جواب نهائي. */
  const attempt = useRef<{ id: string; ref: string } | null>(null);
  /** طلب في الطريق (record_production أو create_production): لا يُرسل ثانٍ قبل جوابه. */
  const sending = useRef(false);
  const [drafting, setDrafting] = useState(false);
  const [draftFailure, setDraftFailure] = useState<string | null>(null);
  const navigate = useNavigate();

  // مخزن المواد المختار (وإلّا أوّلها) و«عندك» منه: القراءة بمعرّفه وحده.
  const from = fromPick ?? data?.stores.find((store) => store.kind === 'raw')?.id ?? '';
  const stockLoad = useCallback(() => readStore(from), [from]);
  const stock = useLoad(stockLoad, from);
  const stores = data?.stores ?? [];
  const inputs = stores.filter((store) => store.kind === 'raw');
  const outputs = stores.filter((store) => store.kind === 'feed');
  const to = toPick ?? outputs[0]?.id ?? '';
  const storeName = inputs.find((store) => store.id === from)?.name ?? '';

  const locked = busy || frozen !== null;
  const active = data?.active ?? null;
  const shownQty = qtyText ?? (active && active.basisKg > 0n ? fmtMilli(active.basisKg) : '');
  const kg = produceKg(shownQty, unitId);
  const kgOk = kg !== null && kg > 0n;
  const current = adjust !== null && kgOk && adjust.kg === kg ? adjust : null;
  const staleAdjust = adjust !== null && current === null && (Object.keys(adjust.texts).length > 0 || adjust.topUp !== null) ? adjust : null;
  const topUp = current?.topUp ?? null;
  const lines = data?.lines ?? [];
  const available = (itemId: string): Milli | null => stock.data?.get(itemId)?.available ?? null;

  const rows: Row[] = lines.map((line) => {
    const planned = kgOk && active && line.blocked === null ? plannedQty(line, kg, active.basisKg) : null;
    const typed = current?.texts[line.lineNo];
    const baseText = typed ?? (planned !== null ? fmtMilli(planned) : '');
    const baseQty = positive(baseText);
    const lineTopUp = topUp?.kind === 'line' && topUp.lineNo === line.lineNo ? topUp : null;
    const qty = lineTopUp && baseQty !== null ? baseQty + lineTopUp.added : baseQty;
    return {
      key: `line-${line.lineNo}`,
      lineNo: line.lineNo,
      itemId: line.itemId,
      name: line.itemName,
      unit: line.baseUnit,
      density: line.density,
      inBasis: line.inBasis,
      planned,
      text: lineTopUp && qty !== null ? fmtMilli(qty) : baseText,
      qty,
      baseQty,
      added: lineTopUp ? lineTopUp.added : null,
      mass: qty === null ? null : massOf(qty, line.baseUnit, line.density),
      baseMass: baseQty === null ? null : massOf(baseQty, line.baseUnit, line.density),
      blocked: line.blocked,
    };
  });
  if (topUp?.kind === 'extra') {
    rows.push({
      key: `extra-${topUp.id}`,
      lineNo: null,
      itemId: topUp.itemId,
      name: topUp.name,
      unit: topUp.unit,
      density: topUp.density,
      inBasis: true,
      planned: null,
      text: fmtMilli(topUp.qty),
      qty: topUp.qty,
      baseQty: null,
      added: topUp.qty,
      mass: massOf(topUp.qty, topUp.unit, topUp.density),
      baseMass: 0n,
      blocked: null,
    });
  }
  const inside = rows.filter((row) => row.inBasis);
  const massKnown = inside.length > 0 && inside.every((row) => row.mass !== null);
  const mass = inside.reduce((sum, row) => sum + (row.mass ?? 0n), 0n);
  // الكتلة قبل «قرّب»: منها الطنّ التالي والفرق، فإعادة «قرّب» تحسب من الأصل لا فوق إكمال سابق.
  const baseKnown = inside.every((row) => row.baseMass !== null);
  const baseMass = inside.reduce((sum, row) => sum + (row.baseMass ?? 0n), 0n);
  const target = baseKnown && baseMass > 0n ? nextTon(baseMass) : 0n;
  const gap = target - baseMass;
  const blockedLines = rows.filter((row) => row.blocked !== null);
  const zeroLines = kgOk && active ? lines.filter((line) => line.blocked === null && line.lineKg !== null && (plannedMass(line.lineKg, kg, active.basisKg) <= 0n || plannedQty(line, kg, active.basisKg) === 0n)) : [];
  const roundable = massKnown && baseKnown && gap > 0n && !blockedLines.length && (topUp === null || topUp.gap !== gap);
  const need = new Map<string, Milli>();
  for (const row of rows) if (row.qty !== null) need.set(row.itemId, (need.get(row.itemId) ?? 0n) + row.qty);
  const shortOf = (row: Row): Milli | null => {
    const have = available(row.itemId);
    const wanted = need.get(row.itemId) ?? null;
    return have !== null && wanted !== null && wanted > have ? wanted - have : null;
  };
  const shortRows = rows.filter((row) => shortOf(row) !== null);

  // اليوم والوزن والانتهاء.
  const today = data?.today ?? null;
  const shownDay = dayText ?? (today ? fmtDay(today) : '');
  const day = parseDayText(shownDay);
  const dayProblem = day === null ? t('mill.weigh.day_bad', 'اكتب يوم الإنتاج يوم/شهر/سنة، مثل 04/11/2026.') : today !== null && day > today ? t('mill.produce.day_future', 'يوم الإنتاج بعد اليوم ({today}).', { today: fmtDay(today) }) : null;
  const outputKg = weighed ? positive(weightText) : null;
  const weightProblem = weighed && outputKg === null ? (weightText.trim() === '' ? t('mill.produce.weight_missing', 'اكتب وزن الناتج، أو أغلق «وزنت الناتج؟».') : t('mill.weigh.bad', 'اكتب وزناً أكبر من صفر.')) : null;
  const shrink = outputKg !== null && massKnown ? mass - outputKg : null;
  // الهدر بين صفر و3٪ من كتلة المواد مقبول (private.shrink_ok)، وخارجه يطلب الخادم سببه (3 أحرف على الأقلّ).
  const shrinkOk = shrink === null || (mass > 0n && shrink >= 0n && shrink * 100n <= 3n * mass);
  const reasonOk = shrinkOk || [...reason.trim()].length >= 3;
  const tracks = data?.recipe.outputItem.tracksExpiry ?? false;
  const expiry = tracks && expiryText.trim() !== '' ? parseDayText(expiryText) : null;
  const expiryProblem = !tracks
    ? null
    : expiryText.trim() === ''
      ? t('mill.produce.expiry_missing', 'اكتب تاريخ انتهاء الناتج: «{item}» يُتابَع انتهاؤه.', { item: data?.recipe.outputItem.name ?? '' })
      : expiry === null
        ? t('mill.weigh.expiry_bad', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
        : day !== null && expiry < day
          ? t('mill.produce.expiry_before', 'تاريخ الانتهاء قبل يوم الإنتاج.')
          : null;

  const missing: string[] = [];
  if (!kgOk) missing.push(t('mill.produce.need_qty', 'اكتب كمية الإنتاج أكبر من صفر.'));
  for (const row of blockedLines) {
    missing.push(
      row.blocked === 'item_changed'
        ? t('mill.produce.blocked_unit', 'تغيّرت وحدة «{name}» بعد تفعيل الخلطة: أنشئ نسخة جديدة منها وفعّلها ثمّ أنتج.', { name: row.name })
        : t('mill.produce.blocked_density', '«{name}» سائل بلا كثافة: تُكتب كثافته من «المواد» في المخزن ثمّ تُنتج.', { name: row.name }),
    );
  }
  for (const line of zeroLines) missing.push(t('mill.produce.zero', 'كمية «{name}» المخطّطة صفر عند هذا الحجم: أنتج كمية أكبر.', { name: line.itemName }));
  if (kgOk) for (const row of rows) if (row.blocked === null && row.qty === null && !zeroLines.some((line) => line.lineNo === row.lineNo)) missing.push(t('mill.builder.need_qty', 'اكتب كمية «{name}» أكبر من صفر.', { name: row.name }));
  if (kgOk && !inside.length) missing.push(t('mill.produce.no_mass', 'الخلطة بلا مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يصنعان علفاً.'));
  if (dayProblem) missing.push(dayProblem);
  if (weightProblem) missing.push(weightProblem);
  if (!reasonOk) missing.push(t('mill.produce.need_reason', 'الهدر خارج المدى المقبول (من صفر إلى 3٪): اكتب سببه.'));
  if (expiryProblem) missing.push(expiryProblem);
  const ready = canProduce && active !== null && from !== '' && to !== '' && missing.length === 0;
  // «احفظ مسوّدة» بكميات الخلطة المخطّطة وحدها: يمنعها ما يرفضه create_production قبل الإنشاء (الكمية واليوم وسطر لا يُنتَج به)، لا ما تطلبه الشاشة
  // للإنتاج المباشر (الكميات المعدَّلة والوزن والانتهاء تُكتب في صفحة الدفعة)؛ وما كُتب هنا لا ينتقل إليها، فيُقال قبل النقر.
  const draftReady = canProduce && active !== null && from !== '' && to !== '' && kgOk && blockedLines.length === 0 && zeroLines.length === 0 && dayProblem === null;
  const notCarried = adjust !== null || weighed || note.trim() !== '' || expiryText.trim() !== '';
  const dirty = qtyText !== null || adjust !== null || note.trim() !== '' || weighed || dayText !== null || expiryText.trim() !== '';
  useDirtyForm(dirty && result === null && !busy);

  /** تعديل كمية سطر: للكمية الحالية (تعديلات كمية أخرى تُترك لها)، وكتابة على سطر «قرّب» تُسقط الإكمال (المستخدم أخذ الكمية). */
  const editLine = (lineNo: number, text: string) => {
    if (!kgOk || kg === null) return;
    setAdjust((before) => {
      const base = before !== null && before.kg === kg ? before : { kg, texts: {}, topUp: null };
      const dropTopUp = base.topUp?.kind === 'line' && base.topUp.lineNo === lineNo;
      return { kg, texts: { ...base.texts, [lineNo]: text }, topUp: dropTopUp ? null : base.topUp };
    });
  };
  const pickQuick = (value: Milli) => {
    setUnitId('kg');
    setQtyText(fmtMilli(value));
  };
  const undoTopUp = () => setAdjust((before) => (before ? { ...before, topUp: null } : before));

  /** «قرّب»: الفرق كلّه من المادّة المختارة. سطر في الخلطة يزيد فوق كميته الآن، ومادّة من المخزن تُقرأ (كثافتها وخطوة عدّادها) ثمّ تُضاف للدفعة. */
  const pickGap = async (candidate: Candidate) => {
    if (!kgOk || kg === null || gap <= 0n) return;
    const keep = current?.texts ?? {};
    if (candidate.lineNo !== null) {
      const row = rows.find((entry) => entry.lineNo === candidate.lineNo);
      const line = lines.find((entry) => entry.lineNo === candidate.lineNo);
      if (!row || !line || row.baseQty === null) return;
      const added = gapQty(row.baseQty, gap, line.baseUnit, line.density, line.scaleStep, line.baseUnit === 'kg');
      if (added === null) {
        setGapFailure(t('mill.gap.no_density', '«{name}» سائل بلا كثافة، فلا يُحسب به الفرق.', { name: line.itemName }));
        return;
      }
      setAdjust({ kg, texts: keep, topUp: { kind: 'line', lineNo: line.lineNo, itemId: line.itemId, name: line.itemName, unit: line.baseUnit, added, target, gap } });
      setGapOpen(false);
      return;
    }
    setGapPending(candidate.itemId);
    setGapFailure(null);
    try {
      const item = await loadItem(candidate.itemId);
      if (!item || item.archived || !MILL_RAW_KINDS.includes(item.kind) || !inBasisKind(item.kind) || (item.baseUnit !== 'kg' && item.baseUnit !== 'L')) {
        setGapFailure(t('mill.gap.unfit', '«{name}» لا تصلح للإكمال الآن (تغيّرت أو أُرشفت): اختر غيرها.', { name: candidate.name }));
        return;
      }
      const qty = gapQty(0n, gap, item.baseUnit, item.density, item.scaleStep, false);
      if (qty === null) {
        setGapFailure(t('mill.gap.no_density_store', '«{name}» سائل بلا كثافة، فلا يُحسب به الفرق: تُكتب كثافته من «المواد» في المخزن.', { name: item.name }));
        return;
      }
      setAdjust({ kg, texts: keep, topUp: { kind: 'extra', id: crypto.randomUUID(), itemId: item.id, name: item.name, unit: item.baseUnit, density: item.density, qty, target, gap } });
      setGapOpen(false);
    } catch (problem) {
      setGapFailure(failureText(problem));
    } finally {
      setGapPending(null);
    }
  };

  /** نداء record_production بطلب محفوظ: الأوّل من «أنتج»، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const submit = async (request: ProductionRequest, retrying: boolean) => {
    // طلب واحد في الطريق (نقرتان سريعتان قبل أن يُرسم «جارٍ…»): الثانية لا تُرسل.
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const done = await recordProduction(request);
      attempt.current = null;
      setFrozen(null);
      setResult(done);
      stock.retry();
    } catch (problem) {
      // id_conflict (عقد 0023): طلبٌ بمعرّف الدفعة نفسه يسابقه في الخادم، فلعلّه سُجّل؛ كالنتيجة المجهولة: الإعادة بالطلب نفسه ترجّع نتيجته.
      const racing = problem instanceof RejectedError && problem.code === 'id_conflict';
      if (racing || !surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن سُجّلت الدفعة: الشاشة تتجمّد بطلبها، والإعادة وحدها ممكنة (لن تُسجَّل مرّتين). وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(request);
        if (racing) setFailure(failureText(problem));
        else if (retrying && surelyUnsaved(problem)) setFailure(t('mill.produce.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.'));
      } else {
        // جواب أكيد بلا تسجيل (ومنه qty_too_large وstale_preview بتلميحهما): المكتوب باقٍ، والمحاولة التالية بمعرّف ومرجع جديدين.
        attempt.current = null;
        setFrozen(null);
        setFailure(failureText(problem));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  /**
   * «احفظ مسوّدة» (عقد 0023، مراجعة القاعدة): الدفعة مسوّدةً بكميات الخلطة المخطّطة (create_production القائم بمعرّف من الجهاز يبقى للإعادة) ثمّ صفحتها،
   * وفيها إخراج مادّة أو تبديلها وتكاليف الدفعة ومعاينتها الكاملة. 23505 بالمعرّف نفسه = أُنشئت بمحاولة ضاع جوابها، فتُفتح هي لا ثانية.
   */
  const saveDraft = async () => {
    if (!draftReady || locked || drafting || sending.current || !active || kg === null || day === null) return;
    const slot = `draft:${active.id}:${kg}:${from}:${to}:${day}`;
    const batchId = millRef(slot);
    sending.current = true;
    setDrafting(true);
    setDraftFailure(null);
    try {
      await createProduction(batchId, active.id, kg, from, to, day);
      forgetMillRef(slot);
      navigate(`/mill/batch/${batchId}`);
    } catch (problem) {
      if (isDuplicate(problem)) {
        forgetMillRef(slot);
        navigate(`/mill/batch/${batchId}`);
        return;
      }
      setDraftFailure(failureText(problem));
    } finally {
      sending.current = false;
      setDrafting(false);
    }
  };

  const produce = () => {
    if (!ready || locked || drafting || !active || kg === null || day === null) return;
    attempt.current ??= { id: crypto.randomUUID(), ref: crypto.randomUUID() };
    const ids = attempt.current;
    const actuals = rows.flatMap((row) => (row.lineNo !== null && row.qty !== null && row.qty !== row.planned ? [{ lineNo: row.lineNo, qty: row.qty }] : []));
    const extra = topUp?.kind === 'extra' ? [{ id: topUp.id, itemId: topUp.itemId, qty: topUp.qty }] : [];
    void submit(
      {
        id: ids.id,
        versionId: active.id,
        plannedKg: kg,
        inputWarehouseId: from,
        outputWarehouseId: to,
        producedOn: day,
        actuals,
        extra,
        outputKg,
        expiry: tracks ? expiry : null,
        // السبب حين يطلبه الهدر وحده (حقله لا يظهر داخل المدى): لا يُرسل سبب بقي من وزن سابق.
        shrinkReason: weighed && !shrinkOk && reason.trim() !== '' ? reason.trim() : null,
        note: note.trim() === '' ? null : note.trim(),
        clientRef: ids.ref,
      },
      false,
    );
  };

  /** «أنتج دفعة أخرى»: الشاشة من أوّلها بالخلطة نفسها (المخزنان كما اختيرا)، و«عندك» يُقرأ من جديد. */
  const again = () => {
    setResult(null);
    setQtyText(null);
    setUnitId('kg');
    setAdjust(null);
    setDayText(null);
    setNote('');
    setWeighed(false);
    setWeightText('');
    setReason('');
    setExpiryText('');
    setFailure(null);
    setDraftFailure(null);
    setGapFailure(null);
  };

  if (error) return <LoadFailed what={t('mill.produce.what', 'شاشة الإنتاج')} error={error} onRetry={retry} />;
  if (!data) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  const recipe = data.recipe;
  const color = recipeColor(recipe.id);
  const header = (
    <>
      <BackButton to="/mill" label={t('back.mill', 'رجوع إلى المعمل')} action="back-to-mill" />
      <PageHeader title={t('mill.produce.title', 'إنتاج «{name}»', { name: recipe.name })} subtitle={t('mill.card.output', 'تنتج: {item}', { item: recipe.outputItem.name })} />
    </>
  );
  if (result) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ProducedView result={result} recipeId={recipe.id} onAgain={again} />
      </div>
    );
  }
  const stop = !canProduce
    ? t('mill.produce.forbidden', 'تسجيل الإنتاج للمالك والمدير ومشغّل المعمل.')
    : recipe.archived
      ? t('mill.recipe.archived', 'هذه الخلطة محذوفة من المعمل: لا تظهر في قائمته ولا يُنتَج بها.')
      : !active
        ? t('mill.card.no_active', 'هذه الخلطة بلا نسخة مفعَّلة.')
        : !inputs.length || !outputs.length
          ? t('mill.produce.no_stores', 'ينقص مخزن للمعمل.')
          : null;
  if (stop) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Notice
          tone="warning"
          title={stop}
          action={
            <Link to={`/mill/recipe/${recipe.id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-recipe">
              {t('mill.produce.open_recipe', 'افتح الخلطة')}
            </Link>
          }
        >
          {!inputs.length || !outputs.length ? t('mill.produce.no_stores_detail', 'الإنتاج يسحب من مخزن المواد الأوّلية ويضع الناتج في مخزن العلف، وأحدهما غير موجود في نطاقك.') : null}
        </Notice>
      </div>
    );
  }

  const plannedDecimals = columnDecimals(rows.flatMap((row) => (row.planned === null ? [] : [row.planned])), 3) as 0 | 1 | 2 | 3;
  const handDecimals = columnDecimals(rows.flatMap((row) => { const have = available(row.itemId); return have === null ? [] : [have]; }), 3) as 0 | 1 | 2 | 3;
  const outside = rows.some((row) => !row.inBasis);
  const columns: Column<Row>[] = [
    {
      key: 'item',
      header: t('mill.line.item', 'المادّة'),
      wrap: true,
      sticky: true,
      cell: (row) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{row.name}</span>
          {!row.inBasis ? (
            <span className="text-xs text-ink-muted" data-action="out-of-basis">
              {t('mill.line.out_of_basis', 'خارج الكتلة')}
            </span>
          ) : null}
          {row.unit === 'L' && row.mass !== null ? <span className="text-xs text-ink-muted">{t('mill.cards.mass', 'أي {kg}', { kg: kgText(row.mass) })}</span> : null}
          {row.added !== null && topUp ? (
            <span className="text-xs font-medium text-brand-700 dark:text-brand-200" data-action="round-added">
              {t('mill.gap.added', '+{qty} لإكمال {tons}', { qty: amountText(row.added, row.unit), tons: tonsText(topUp.target) })}
            </span>
          ) : null}
          {row.blocked !== null ? (
            <span className="text-xs text-danger-700 dark:text-danger-300">
              {row.blocked === 'item_changed' ? t('mill.produce.blocked_unit_short', 'تغيّرت وحدتها بعد التفعيل') : t('mill.produce.blocked_density_short', 'سائل بلا كثافة')}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'planned', header: t('mill.produce.col.planned', 'المخطّط'), kind: 'number', cell: (row) => <Num>{row.planned === null ? dash() : fmtQtyCell(row.planned, plannedDecimals)}</Num> },
    {
      key: 'qty',
      header: t('mill.line.qty', 'الكمية'),
      kind: 'number',
      cell: (row) =>
        row.lineNo === null ? (
          <Num>{fmtMilli(row.qty ?? 0n)}</Num>
        ) : row.blocked !== null ? (
          dash()
        ) : (
          <input
            aria-label={t('mill.builder.qty_of', 'كمية «{name}»', { name: row.name })}
            className="input text-end tabular-nums"
            size={9}
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
            value={row.text}
            // بلا كمية إنتاج صالحة لا مخطّط تُعدَّل عليه الكمية.
            disabled={locked || !kgOk}
            aria-invalid={row.qty === null || undefined}
            onChange={(event) => editLine(row.lineNo ?? 0, event.target.value)}
            data-action="line-qty"
            data-id={row.itemId}
          />
        ),
    },
    { key: 'unit', header: t('mill.line.unit_col', 'الوحدة'), cell: (row) => unitWord(row.unit) },
    {
      key: 'hand',
      header: t('mill.produce.col.hand', 'عندك في «{store}»', { store: storeName }),
      kind: 'number',
      cell: (row) => {
        const have = available(row.itemId);
        const short = shortOf(row);
        if (have === null) return <Num>{stock.data === null && !stock.error ? t('mill.builder.price_loading', '…') : dash()}</Num>;
        return (
          <span className="flex flex-col items-end">
            <Num>{fmtQtyCell(have, handDecimals)}</Num>
            {short !== null ? (
              <span className="text-xs font-medium text-danger-700 dark:text-danger-300" data-action="line-short" data-id={row.itemId}>
                {t('mill.produce.short', 'ينقص {qty}', { qty: amountText(short, row.unit) })}
              </span>
            ) : null}
          </span>
        );
      },
    },
  ];

  const recipeCandidates: Candidate[] = rows.flatMap((row) =>
    row.lineNo !== null && row.inBasis && row.blocked === null && row.baseQty !== null && (row.unit === 'kg' || row.unit === 'L')
      ? [{ itemId: row.itemId, name: row.name, unit: row.unit, lineNo: row.lineNo, available: available(row.itemId) }]
      : [],
  );
  const inRecipe = new Set(lines.map((line) => line.itemId));
  const storeCandidates: Candidate[] = [...(stock.data?.values() ?? [])]
    .filter((item) => !item.archived && !inRecipe.has(item.itemId) && MILL_RAW_KINDS.includes(item.kind) && inBasisKind(item.kind) && (item.baseUnit === 'kg' || item.baseUnit === 'L'))
    .map((item) => ({ itemId: item.itemId, name: item.name, unit: item.baseUnit, lineNo: null, available: item.available }));
  const reached = massKnown && mass % TON === 0n;

  return (
    <div className="flex flex-col gap-5">
      {header}

      <section className="card flex flex-col gap-3 overflow-hidden p-0">
        <div className="h-2" style={{ background: color.solid }} aria-hidden="true" />
        <div className="flex flex-col gap-3 px-4 pb-4">
          <h2 className="text-lg font-semibold">{t('mill.produce.qty_title', 'الكمية')}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('mill.produce.quick', 'كميات سريعة')}>
            {QUICK_AMOUNTS.map((quick) => {
              const picked = kg === quick.kg && unitId === 'kg';
              return (
                <Button key={quick.key} size="sm" variant={picked ? 'primary' : 'secondary'} aria-pressed={picked} disabled={locked} onClick={() => pickQuick(quick.kg)} data-action="quick-qty">
                  {quick.label()}
                </Button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${fieldId}-qty`} label={t('mill.produce.how_much', 'كم تنتج؟')} hint={kg === null ? undefined : t('mill.produce.same', 'أي {qty}', { qty: fmtQty(kg, 'kg').main })}>
              <input
                id={`${fieldId}-qty`}
                className="input tabular-nums"
                inputMode="decimal"
                dir="ltr"
                value={shownQty}
                disabled={locked}
                onChange={(event) => setQtyText(event.target.value)}
                data-action="produce-qty"
              />
            </Field>
            <Field id={`${fieldId}-unit`} label={t('mill.produce.unit', 'الوحدة')}>
              <select id={`${fieldId}-unit`} className="input" value={unitId} disabled={locked} onChange={(event) => setUnitId(event.target.value)} data-action="produce-unit">
                {PRODUCE_UNITS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {active && active.basisKg > 0n ? (
            <p className="text-sm text-ink-muted" data-action="produce-total">
              {t('mill.produce.total', 'مجموع الخلطة {kg}: الناتج قبل الهدر = مجموع المواد المسحوبة.', { kg: kgText(active.basisKg) })}
            </p>
          ) : null}
        </div>
      </section>

      {staleAdjust ? (
        <Notice
          tone="info"
          title={t('mill.produce.stale', 'تعديلاتك على المواد كانت لكمية {kg}، فرجعت المواد إلى المخطّط للكمية الحالية.', { kg: kgText(staleAdjust.kg) })}
          action={
            <span className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={locked} onClick={() => pickQuick(staleAdjust.kg)} data-action="restore-qty">
                {t('mill.produce.stale_back', 'أرجع الكمية إلى {kg}', { kg: kgText(staleAdjust.kg) })}
              </Button>
              <Button size="sm" variant="ghost" disabled={locked} onClick={() => setAdjust(null)} data-action="drop-edits">
                {t('mill.produce.stale_drop', 'اترك تعديلاتي')}
              </Button>
            </span>
          }
        />
      ) : null}

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t('mill.produce.materials', 'المواد')}</h2>
        <p className="text-sm text-ink-muted">{t('mill.produce.materials_hint', 'كلّ مادّة بنسبتها في الخلطة: عدّل أيّ كمية إن احتجت، وكتلة المواد هي الناتج المتوقّع.')}</p>
        <DataTable
          caption={t('mill.produce.caption', 'موادّ الدفعة: المخطّط بنسبة الخلطة، والكمية التي تُسحب، وما عندك في المخزن')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.key}
          empty={t('mill.detail.empty', 'لا مواد في هذه النسخة بعد.')}
        />
        {stock.error ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" data-action="hand-failed">
            <span className="text-danger-700 dark:text-danger-300">{t('mill.produce.hand_failed', 'تعذّرت قراءة ما عندك في «{store}».', { store: storeName })}</span>
            <Button size="sm" variant="secondary" onClick={stock.retry} data-action="hand-retry">
              {t('dayb.reread', 'أعد القراءة')}
            </Button>
          </div>
        ) : null}
        {shortRows.length ? (
          <Notice tone="warning" title={t('mill.produce.short_title', 'المخزن لا يكفي هذه الكميات: {names}.', { names: shortRows.map((row) => row.name).join(t('list.separator', '، ')) })} />
        ) : null}
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3" data-action="produce-summary">
          <p className="text-lg font-semibold" data-action="produce-mass">
            {massKnown
              ? t('mill.produce.mass', 'كتلة المواد = الناتج المتوقّع: {kg} (قبل الهدر)', { kg: kgText(mass) })
              : t('mill.produce.mass_unknown', 'لا تُحسب كتلة المواد بعد: اكتب كمية كلّ مادّة.')}
          </p>
          {outside ? <p className="text-sm text-ink-muted">{t('mill.builder.outside_note', 'الوقود والتعبئة خارج كتلة الخلطة: يُسحبان وتُحسب كلفتهما، ولا يدخلان مجموع الخلطة ولا ناتجها.')}</p> : null}
          {topUp ? (
            <div className="flex flex-wrap items-center gap-2" data-action="round-note">
              <span className="text-sm font-medium">
                {t('mill.gap.done', '+{qty} من «{name}» لإكمال {tons}.', { qty: amountText(topUp.kind === 'line' ? topUp.added : topUp.qty, topUp.unit), name: topUp.name, tons: tonsText(topUp.target) })}
                {/* المجموع فوق الطنّ قليلاً بخطوة عدّاد المادّة أو كثافتها (والكتلة الأصلية كما حُسب لها): يُقال ولا يُخفى. */}
                {massKnown && !reached && topUp.gap === gap ? ` ${t('mill.gap.over', 'المجموع {kg}: لا يبلغ الطنّ بالضبط بخطوة عدّاد «{name}».', { kg: kgText(mass), name: topUp.name })}` : ''}
              </span>
              <Button size="sm" variant="ghost" disabled={locked} onClick={undoTopUp} data-action="undo-round">
                {t('mill.gap.undo', 'تراجع عن الإكمال')}
              </Button>
            </div>
          ) : null}
          {roundable ? (
            <div>
              <Button
                variant="secondary"
                icon={<Scale className="size-5" aria-hidden="true" />}
                disabled={locked}
                onClick={() => {
                  setGapFailure(null);
                  setGapOpen(true);
                }}
                data-action="round-ton"
              >
                {t('mill.gap.button', 'قرّب إلى {tons} (+{gap})', { tons: tonsText(target), gap: kgText(gap) })}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t('mill.produce.details', 'تفاصيل الدفعة')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {inputs.length > 1 ? (
            <Field id={`${fieldId}-from`} label={t('mill.produce.from', 'مخزن المواد')}>
              <select id={`${fieldId}-from`} className="input" value={from} disabled={locked} onChange={(event) => setFromPick(event.target.value)} data-action="store-from">
                {inputs.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {outputs.length > 1 ? (
            <Field id={`${fieldId}-to`} label={t('mill.produce.to', 'مخزن العلف')}>
              <select id={`${fieldId}-to`} className="input" value={to} disabled={locked} onChange={(event) => setToPick(event.target.value)} data-action="store-to">
                {outputs.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field id={`${fieldId}-day`} label={t('mill.weigh.day', 'يوم الإنتاج')} error={dayProblem ?? undefined} hint={t('mill.weigh.day_hint', 'يوم/شهر/سنة: بهذا اليوم تُسحب المواد ويدخل العلف مخزنه.')}>
            <input
              id={`${fieldId}-day`}
              className="input tabular-nums"
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              placeholder={t('mill.weigh.expiry_placeholder', 'يوم/شهر/سنة')}
              value={shownDay}
              disabled={locked}
              onChange={(event) => setDayText(event.target.value)}
              data-action="produced-on"
            />
          </Field>
          {tracks ? (
            <Field id={`${fieldId}-expiry`} label={t('mill.weigh.expiry', 'تاريخ انتهاء الناتج')} error={expiryText.trim() !== '' ? (expiryProblem ?? undefined) : undefined} hint={t('mill.weigh.expiry_hint', 'يوم/شهر/سنة، ولا يكون قبل يوم الإنتاج.')}>
              <input
                id={`${fieldId}-expiry`}
                className="input tabular-nums"
                inputMode="numeric"
                dir="ltr"
                autoComplete="off"
                placeholder={t('mill.weigh.expiry_placeholder', 'يوم/شهر/سنة')}
                value={expiryText}
                disabled={locked}
                onChange={(event) => setExpiryText(event.target.value)}
                data-action="output-expiry"
              />
            </Field>
          ) : null}
        </div>
        <Field id={`${fieldId}-note`} label={t('mill.produce.note', 'ملاحظة (اختيارية): كيف وصلنا للطنّ؟')}>
          <textarea id={`${fieldId}-note`} className="input min-h-20" maxLength={500} value={note} disabled={locked} onChange={(event) => setNote(event.target.value)} data-action="produce-note" />
        </Field>
        <div>
          <Button size="sm" variant="secondary" aria-pressed={weighed} aria-expanded={weighed} disabled={locked} onClick={() => setWeighed(!weighed)} data-action="weighed-toggle">
            {t('mill.produce.weighed', 'وزنت الناتج؟')}
          </Button>
        </div>
        {weighed ? (
          <div className="grid gap-3 sm:grid-cols-2" data-action="weighed">
            <Field id={`${fieldId}-weight`} label={t('mill.weigh.kg', 'الوزن بالكيلوغرام')} error={weightText.trim() !== '' ? (weightProblem ?? undefined) : undefined} hint={t('mill.produce.weight_hint', 'وزن العلف الخارج فعلاً؛ الفرق عن كتلة المواد هو الهدر.')}>
              <input
                id={`${fieldId}-weight`}
                className="input tabular-nums"
                inputMode="decimal"
                dir="ltr"
                autoComplete="off"
                value={weightText}
                disabled={locked}
                onChange={(event) => setWeightText(event.target.value)}
                data-action="output-weight"
              />
            </Field>
            {shrink !== null ? (
              <p className="self-center text-sm font-medium" data-action="waste">
                {shrink >= 0n
                  ? t('mill.produce.waste', 'الهدر {kg} ({pct} من كتلة المواد).', { kg: kgText(shrink), pct: mass > 0n ? pct(shrink, mass) : dash() })
                  : t('mill.produce.waste_negative', 'الناتج الموزون أكبر من كتلة المواد بـ{kg}.', { kg: kgText(-shrink) })}
              </p>
            ) : null}
            {!shrinkOk ? (
              <Field id={`${fieldId}-reason`} label={t('mill.produce.reason', 'سبب الهدر (خارج المدى من صفر إلى 3٪)')}>
                <input id={`${fieldId}-reason`} className="input" maxLength={500} value={reason} disabled={locked} onChange={(event) => setReason(event.target.value)} data-action="waste-reason" />
              </Field>
            ) : null}
          </div>
        ) : null}
      </section>

      {failure ? <Notice tone="danger" title={failure} /> : null}
      {frozen ? (
        <Notice
          tone="warning"
          title={t('mill.produce.frozen', 'لا نعرف إن سُجّل الإنتاج: أعد المحاولة قبل أيّ تعديل؛ لن تُسجَّل الدفعة مرّتين.')}
          action={
            <Button busy={busy} onClick={() => void submit(frozen, true)} data-action="retry-produce">
              {t('mill.builder.retry', 'أعد المحاولة')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <Button size="lg" icon={<Factory className="size-5" aria-hidden="true" />} busy={busy} disabled={!ready || locked || drafting} onClick={produce} data-action="produce-go">
            {t('mill.card.produce', 'أنتج')}
          </Button>
          {/* المسوّدة لما لا تفعله هذه الشاشة: إخراج مادّة أو تبديلها، وتكاليف الدفعة، والمعاينة الكاملة في صفحة الدفعة (تلميحات الخادم تسمّي الزرّ باسمه). */}
          <div className="flex flex-col gap-1">
            <Button size="lg" variant="secondary" busy={drafting} disabled={!draftReady || locked || drafting} onClick={() => void saveDraft()} data-action="save-batch-draft">
              {t('mill.produce.save_draft', 'احفظ مسوّدة')}
            </Button>
            <p className="text-sm text-ink-muted" data-action="draft-help">
              {t('mill.produce.draft_help', 'لإخراج مادّة أو تبديلها أو تعديل تكاليف الدفعة')}
            </p>
          </div>
        </div>
      )}
      {!frozen && notCarried ? (
        <p className="text-sm text-ink-muted" data-action="draft-not-carried">
          {t('mill.produce.draft_plain', 'المسوّدة تُحفظ بكميات الخلطة المخطّطة وحدها: ما عدّلته هنا من الكميات و«قرّب» والوزن والملاحظة والانتهاء يُكتب في صفحة الدفعة.')}
        </p>
      ) : null}
      {draftFailure ? <Notice tone="danger" title={draftFailure} /> : null}
      {!frozen && missing.length ? (
        <div className="flex flex-col gap-1 text-sm" data-action="produce-missing">
          <p className="font-medium">{t('mill.produce.missing', 'لا يُنتَج قبل ما يلي:')}</p>
          <ul className="list-disc ps-5 text-ink-muted">
            {missing.map((reasonText) => (
              <li key={reasonText}>{reasonText}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {gapOpen ? (
        <GapDialog
          title={t('mill.gap.title', 'من أيّ مادّة يُكمَل الفرق ({gap})؟', { gap: kgText(gap) })}
          storeName={storeName}
          inRecipe={recipeCandidates}
          fromStore={storeCandidates}
          storeState={stock.error ? 'failed' : stock.data === null ? 'loading' : 'ready'}
          pending={gapPending}
          failure={gapFailure}
          onRetryStore={stock.retry}
          onPick={(candidate) => void pickGap(candidate)}
          onClose={() => setGapOpen(false)}
        />
      ) : null}
    </div>
  );
}
