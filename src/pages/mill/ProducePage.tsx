import { CheckCircle2, Factory, Plus, Scale, Trash2 } from 'lucide-react';
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
import { toast } from '../../components/ui/Toast';
import type { Milli } from '../../domain/money';
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
import { loadProduceForm, produceBatch, type DefaultSource, type FormMaterial, type ProduceForm, type ProducedBatch, type ProduceLine, type ProduceRequest } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { kgText } from './cards';
import { inBasisKind, millAdmissible, MILL_RAW_KINDS, unitWord } from './pickers';
import { CompositionBar, dash, MaterialName, NAME_BOX, NameCell, pct, recipeColor, slotsOf, useKeptLoad } from './shared';

// الإنتاج بشاشة واحدة (0023، كلمة المالك 2026-11-10: «يكدر يسوي انتاج… ورا ما يحدد كمياتها ويشوف الكمية الي راح يتم انتاجها، واذا باقي للطن شوية
// يكدر يسوي زر تقريبي انها طن ويكتب ملاحظة اختيارية شلون وصلنا للطن»).
// «الخلطة موادّ بلا كميات» (0025، كلمة المالك 2026-11-10: «لمن اريد اسوي انتاج ادخل اسوي معاينة عن المواد الي اني اختاريتها سابقا وبلحضتها احدد
// الكميات الي راح انتجها واحدد هل راح اعدل على هاي الخلطة لو لا»؛ وجوابه: الكميات عند الفتح كميات آخر إنتاج): الشاشة تُقرأ من production_form، صفّ
// لكلّ مادّة في الخلطة بترتيبها ونقطة لونها، وخانة كميتها معبّأة بكمية آخر إنتاج («من آخر إنتاج»)، وإلّا بكمية خلطة قديمة بكميات («من الخلطة»)، وإلّا
// فارغة؛ ووحدتها، والكيلو للّتر بكثافته، و«عندك» في مخزن المواد المختار وعلامة النقص، و«أزل» (لهذه المرّة). و«أضف مادّة» من موادّ مخزن المواد التي
// تصلح للإنتاج (موادّ آخر إنتاج ليست في الخلطة أوّلاً). و«الناتج» حيّاً = مجموع كتلة ما داخل الكتلة بالكيلو، وشريط التركيبة بنقاط موادّه. و«قرّب إلى طنّ»
// كما كان: الفرق كلّه من مادّة واحدة (صفّ هنا أو مادّة من المخزن) بالضبط (produce_batch لا يقرّب بخطوة العدّاد)، ويُرى ويُتراجع عنه.
// الناتج يدخل «رصيد العلف» وحده (output_store، بلا اختيار؛ وبلاه لا يُنتَج). وإن خالفت موادُّ الإنتاج موادَّ الخلطة: لمن يعدّل الخلطة اختيار إلزاميّ بلا
// افتراض («عدّل الخلطة بهذه الموادّ» أو «لهذه المرّة فقط»، و«أنتج» معطّل قبله)، ولغيره جملة «التغيير لهذه المرّة فقط» وp_save_recipe = false.
// «أنتج» و«احفظ مسوّدة» نداء produce_batch واحد (p_draft)، وحمايات 0023 باقية: الطلب الذي لا تُعرف نتيجته خارج المكوّن (sessionStorage بمفتاح المستخدم
// والمنشأة والخلطة) والشاشة تعود مجمَّدة به وتعرضه هو، والإعادة به حرفاً؛ والنافذة «فيها ما لم يُحفظ» والطلب في الطريق أو مجمَّد؛ وrecipe_changed (تغيّرت
// الخلطة من جهاز آخر) يقرؤها من جديد ويقوله، وما كُتب باقٍ لموادّه.

const TON: Milli = 1_000_000n;
/** حدّ الكمية في produce_batch: أقلّ من مليار بوحدة الأساس (qty_too_large). */
const QTY_LIMIT: Milli = 1_000_000_000_000n;

/** كتلة كمية بالكيلو كما يحسبها الخادم (input_mass_kg): الكيلو كما هو، واللتر × الكثافة بثلاث مراتب؛ وبلا كثافة null. */
export function massOf(qty: Milli, unit: BaseUnit, density: bigint | null): Milli | null {
  if (unit === 'kg') return qty;
  if (unit === 'L' && density !== null && density > 0n) return litersToKg(qty, density);
  return null;
}

const ceilStep = (qty: Milli, step: Milli): Milli => (step > 0n ? ((qty + step - 1n) / step) * step : qty);

/**
 * ما يُضاف إلى مادّة واحدة ليبلغ المجموع الطنّ (الفرق gap بالكيلو) بأقلّ زيادة: للكيلوغرام الفرق نفسه (exact) أو مرفوعاً إلى خطوة step، وللّتر أقلّ عدد
 * خطوات تبلغ كتلتُه (بالكثافة، فوق كمية المادّة الآن base) الفرقَ. null: سائل بلا كثافة أو وحدة لا تُحسب. produce_batch يكتب الكمية كما هي (0025)،
 * فالشاشة تنادي بلا خطوة (exact، وللّتر خطوة جزء من ألف).
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

/** رقم موجب من نصّ المستخدم (بثلاث مراتب كحدّ أقصى)، وإلّا null. */
const positive = (text: string): Milli | null => {
  const value = text.trim() === '' ? null : parseQty(text);
  return value !== null && value > 0n ? value : null;
};

// ─── الطلب المعلَّق (مراجعة شاشات 0023، S1) ─────────────────────────────────────────────────────────────────────────────────
// طلب produce_batch الذي لا تُعرف نتيجته (في الطريق، أو بعد نتيجة مجهولة) يبقى خارج المكوّن بمفتاح المستخدم والمنشأة والخلطة: الرجوع إلى المعمل ثمّ
// العودة (أو إعادة التحميل) تعيد الشاشة مجمَّدة بطلبها نفسه، والإعادة به وحده (لا دفعة ثانية تسحب المخزون مرّتين). في sessionStorage (يبقى بعد إعادة
// التحميل في التبويب نفسه) وفي الذاكرة إن تعذّر، ويُمحى عند جواب نهائي (نجاح أو رفض أكيد). وطلب record_production من شاشة 0023 قبلها (بالمفتاح نفسه) لا
// تعيده هذه الشاشة: تقول إنّ نتيجته مجهولة وتدلّ على دفعات المعمل قبل أيّ إنتاج.
const pendingMemory = new Map<string, string>();

export function pendingKey(scope: string, recipeId: string): string {
  return `mill.produce.pending:${scope}:${recipeId}`;
}

export function storePending(key: string, request: ProduceRequest | null): void {
  if (key === '') return;
  const text = request === null ? null : JSON.stringify(request, (_field, value: unknown) => (typeof value === 'bigint' ? { big: String(value) } : value));
  if (text === null) pendingMemory.delete(key);
  else pendingMemory.set(key, text);
  try {
    if (text === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, text);
  } catch {
    // بلا sessionStorage (تصفّح خاصّ أو ممنوع): الذاكرة وحدها تحمي من الرجوع والعودة.
  }
}

/** ما بقي معلَّقاً: طلب produce_batch، أو طلب من شاشة 0023 (record_production) لا يُعاد هنا. */
export type Pending = { kind: 'request'; request: ProduceRequest } | { kind: 'legacy' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** طلب بشكل produce_batch كما كتبه storePending: المعرّفان والنسخة والمخزن نصوص، والسطور بمادّة وكمية. */
function asRequest(value: Record<string, unknown>): ProduceRequest | null {
  const text = (field: string) => typeof value[field] === 'string' && value[field] !== '';
  if (!text('id') || !text('recipeId') || !text('expectedVersion') || !text('inputWarehouseId') || !text('clientRef') || typeof value.draft !== 'boolean') return null;
  if (!Array.isArray(value.lines) || !value.lines.length) return null;
  const lines = value.lines.every((line: unknown) => isRecord(line) && typeof line.itemId === 'string' && typeof line.qty === 'bigint');
  return lines ? (value as unknown as ProduceRequest) : null;
}

export function readPending(key: string): Pending | null {
  if (key === '') return null;
  const fromSession = (): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch { // swallow-ok: sessionStorage ممنوع (تصفّح خاصّ أو إعداد المتصفّح)؛ الطلب في الذاكرة بعده
      return null;
    }
  };
  const text = fromSession() ?? pendingMemory.get(key) ?? null;
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text, (_field, entry: unknown) =>
      isRecord(entry) && Object.keys(entry).length === 1 && typeof entry.big === 'string' ? BigInt(entry.big) : entry,
    );
  } catch { // swallow-ok: نصّ لم يكتبه storePending (تخزين تالف)؛ لا طلب معلَّق يُستعاد منه
    return null;
  }
  if (!isRecord(value)) return null;
  const request = asRequest(value);
  if (request) return { kind: 'request', request };
  // طلب record_production من شاشة 0023 (المعرّف ونسخة الخلطة والكمية المخطّطة).
  return typeof value.versionId === 'string' && typeof value.id === 'string' ? { kind: 'legacy' } : null;
}

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

/** رفوض تعني أنّ ما قرأته الشاشة تغيّر: الخلطة (recipe_changed)، أو مسوّدتها (draft_exists)، أو «رصيد العلف» (feed_store_missing). تُقرأ الشاشة من جديد. */
const REREAD = new Set(['recipe_changed', 'draft_exists', 'feed_store_missing']);

// ─── موادّ الإنتاج ───────────────────────────────────────────────────────────────────────────────────────────────

/** مادّة أُضيفت لهذا الإنتاج وليست في الخلطة (بكثافتها ونوعها كما قُرئت حين أُضيفت). */
interface Extra {
  itemId: string;
  name: string;
  kind: ItemKind;
  unit: BaseUnit;
  density: bigint | null;
  text: string;
}

/**
 * «قرّب إلى طنّ» المطبَّق: added تُزاد على كمية مادّة واحدة (صفّ هنا، أو مادّة من المخزن أُضيفت بها: created). target الطنّ الذي أُكمل إليه وgap الفرق
 * الذي حُسب له: تغيّر الكتلة بعده (تعديل مادّة أخرى) يُظهر «قرّب» من جديد.
 */
interface TopUp {
  itemId: string;
  name: string;
  unit: BaseUnit;
  added: Milli;
  target: Milli;
  gap: Milli;
  created: boolean;
}

/** ما عدّله المستخدم فوق ما قرأته الشاشة: كميات موادّ الخلطة بمعرّف المادّة، والمُزال منها، والمضاف، والإكمال. */
interface Edits {
  texts: Readonly<Record<string, string>>;
  removed: readonly string[];
  extras: readonly Extra[];
  topUp: TopUp | null;
}

const NO_EDITS: Edits = { texts: {}, removed: [], extras: [], topUp: null };

/** صفّ مادّة في الإنتاج. */
export interface ProduceRow {
  itemId: string;
  name: string;
  unit: BaseUnit;
  density: bigint | null;
  inBasis: boolean;
  /** محذوفة من القوائم (مؤرشفة) وهي في موادّ الخلطة: لا تُنتج (مراجعة 0025 #5). */
  archived: boolean;
  /** من موادّ النسخة المفعَّلة (لا مضافة لهذه المرّة). */
  fromRecipe: boolean;
  defaultQty: Milli | null;
  defaultSource: DefaultSource | null;
  /** المعروض في الخانة: المكتوب أو المقترح، وبعد «قرّب» الكمية كلّها. */
  text: string;
  /** الكمية قبل «قرّب». */
  baseQty: Milli | null;
  /** ما زاده «قرّب». */
  added: Milli | null;
  qty: Milli | null;
  mass: Milli | null;
  baseMass: Milli | null;
  /** لا يُنتَج بها: محذوفة من القوائم (item_archived)، أو صارت تُقاس بالقطعة (bad_recipe_unit)، أو سائل بلا كثافة (density_required). */
  problem: 'archived' | 'pc' | 'density' | null;
}

/** صفوف الإنتاج: موادّ الخلطة بترتيبها (ما لم يُزل)، ثمّ ما أُضيف لهذه المرّة بترتيب إضافته. */
export function produceRows(materials: readonly FormMaterial[], edits: Edits): ProduceRow[] {
  const removed = new Set(edits.removed);
  const inRecipe = new Set(materials.map((material) => material.itemId));
  const extraOf = new Map(edits.extras.map((extra) => [extra.itemId, extra]));
  const make = (base: Omit<ProduceRow, 'text' | 'baseQty' | 'added' | 'qty' | 'mass' | 'baseMass' | 'problem'>, baseText: string): ProduceRow => {
    const topUp = edits.topUp?.itemId === base.itemId ? edits.topUp : null;
    const problem = base.archived ? 'archived' : base.unit === 'pc' ? 'pc' : base.unit === 'L' && (base.density === null || base.density <= 0n) ? 'density' : null;
    const baseQty = topUp?.created ? 0n : positive(baseText);
    const qty = topUp && baseQty !== null ? baseQty + topUp.added : baseQty;
    return {
      ...base,
      text: topUp && qty !== null ? fmtMilli(qty) : baseText,
      baseQty,
      added: topUp ? topUp.added : null,
      qty,
      mass: qty === null ? null : massOf(qty, base.unit, base.density),
      baseMass: baseQty === null ? null : massOf(baseQty, base.unit, base.density),
      problem,
    };
  };
  const rows: ProduceRow[] = [];
  const seen = new Set<string>();
  for (const material of [...materials].sort((a, b) => a.lineNo - b.lineNo)) {
    if (removed.has(material.itemId) || seen.has(material.itemId)) continue;
    seen.add(material.itemId);
    const typed = edits.texts[material.itemId] ?? extraOf.get(material.itemId)?.text;
    rows.push(
      make(
        {
          itemId: material.itemId,
          name: material.name,
          unit: material.baseUnit,
          density: material.density,
          inBasis: material.inBasis,
          archived: material.archived,
          fromRecipe: true,
          defaultQty: material.defaultQty,
          defaultSource: material.defaultSource,
        },
        typed ?? (material.defaultQty === null ? '' : fmtMilli(material.defaultQty)),
      ),
    );
  }
  for (const extra of edits.extras) {
    if (inRecipe.has(extra.itemId) || seen.has(extra.itemId)) continue;
    seen.add(extra.itemId);
    rows.push(
      make(
        { itemId: extra.itemId, name: extra.name, unit: extra.unit, density: extra.density, inBasis: inBasisKind(extra.kind), archived: false, fromRecipe: false, defaultQty: null, defaultSource: null },
        extra.text,
      ),
    );
  }
  return rows;
}

/** موادّ الإنتاج تخالف موادّ الخلطة (مجموعة المعرّفات، والترتيب لا يُحسب). */
export function materialsDiffer(rows: readonly Pick<ProduceRow, 'itemId'>[], materials: readonly Pick<FormMaterial, 'itemId'>[]): boolean {
  const recipe = new Set(materials.map((material) => material.itemId));
  const mine = new Set(rows.map((row) => row.itemId));
  return mine.size !== recipe.size || [...mine].some((itemId) => !recipe.has(itemId));
}

/** مادّة في مخزن المواد المختار (stock_on_hand): المتاح الآن ومرشَّحات «أضف مادّة» و«قرّب». */
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

/** مرشَّح في نافذة الاختيار («أضف مادّة» و«قرّب»): صفّ هنا، أو مادّة أُزيلت من الخلطة، أو من آخر إنتاج، أو من المخزن. */
interface Candidate {
  itemId: string;
  name: string;
  unit: BaseUnit | null;
  available: Milli | null;
  from: 'row' | 'removed' | 'last' | 'store';
}

interface CandidateGroup {
  key: string;
  title: string;
  items: readonly Candidate[];
}

/** نافذة اختيار مادّة بالبحث بالاسم ومجموعاتها، لـ«أضف مادّة» و«من أيّ مادّة يُكمَل الفرق؟». */
function PickDialog({
  title,
  hint,
  groups,
  storeName,
  storeState,
  pending,
  failure,
  note,
  onRetryStore,
  onPick,
  onClose,
}: {
  title: string;
  hint: string;
  groups: readonly CandidateGroup[];
  storeName: string;
  storeState: 'loading' | 'failed' | 'ready';
  pending: string | null;
  failure: string | null;
  note: string | null;
  onRetryStore: () => void;
  onPick: (candidate: Candidate) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const key = searchable(query);
  const shown = groups.map((group) => ({ ...group, items: group.items.filter((candidate) => key === '' || searchable(candidate.name).includes(key)) })).filter((group) => group.items.length);
  const option = (candidate: Candidate) => (
    <li key={candidate.itemId}>
      <Button
        variant="secondary"
        size="sm"
        busy={pending === candidate.itemId}
        disabled={pending !== null}
        onClick={() => onPick(candidate)}
        // اسم طويل مع «عندك» يلتفّ في الهاتف: الارتفاع بما فيه لا h-9 الثابت (بـstyle فلا صنف جديد في CSS الإقلاع).
        style={{ height: 'auto', minHeight: '2.25rem', paddingBlock: '0.375rem' }}
        data-action="pick-option"
        data-id={candidate.itemId}
      >
        {candidate.available !== null && candidate.unit !== null
          ? t('mill.gap.option_hand', '{name} · عندك {qty}', { name: candidate.name, qty: amountText(candidate.available, candidate.unit) })
          : candidate.unit !== null
            ? t('mill.gap.option', '{name} · {unit}', { name: candidate.name, unit: unitWord(candidate.unit) })
            : candidate.name}
      </Button>
    </li>
  );
  return (
    <Dialog open onClose={onClose} locked={pending !== null} size="wide" title={title}>
      <p className="text-sm text-ink-muted">{hint}</p>
      <Field id={`${id}-search`} label={t('mill.gap.search', 'اسم المادّة')}>
        <input id={`${id}-search`} className="input" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} data-autofocus data-action="pick-search" />
      </Field>
      {shown.map((group) => (
        <section key={group.key} className="flex flex-col gap-2" data-action="pick-group" data-group={group.key}>
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <ul className="flex flex-wrap gap-2">{group.items.map(option)}</ul>
        </section>
      ))}
      {storeState === 'loading' ? <p className="text-sm text-ink-muted">{t('mill.gap.store_loading', 'تُقرأ موادّ المخزن…')}</p> : null}
      {storeState === 'failed' ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-action="pick-store-failed">
          <span className="text-danger-700 dark:text-danger-300">{t('mill.pick.store_failed', 'تعذّرت قراءة موادّ «{store}».', { store: storeName })}</span>
          <Button size="sm" variant="secondary" onClick={onRetryStore} data-action="pick-store-retry">
            {t('dayb.reread', 'أعد القراءة')}
          </Button>
        </div>
      ) : null}
      {!shown.length && storeState !== 'loading' ? (
        <p className="text-sm text-ink-muted" data-action="pick-none">
          {key === ''
            ? t('mill.pick.empty', 'لا مادّة أخرى في «{store}» تصلح للإنتاج.', { store: storeName })
            : t('mill.pick.none', 'لا مادّة باسم «{name}» في «{store}» تصلح هنا.', { name: query.trim(), store: storeName })}
        </p>
      ) : null}
      {note ? (
        <p className="text-sm font-medium" data-action="pick-note">
          {note}
        </p>
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}
    </Dialog>
  );
}

type SavedDraft = Extract<ProducedBatch, { awaiting: null }>;
type Produced = Exclude<ProducedBatch, SavedDraft>;
/** «احفظ مسوّدة» (p_draft): الجواب معرّف المسوّدة وحده، والشاشة تفتح صفحتها. */
const isSavedDraft = (done: ProducedBatch): done is SavedDraft => done.status === 'draft' && done.awaiting === null;

/**
 * نتيجة «أنتج» بحسب الجواب لا الدور (عقد 0023): مرحَّلة (دخل العلف «رصيد العلف»)، أو مسوّدة تنتظر ختم الكلف — لمشغّل المعمل دائماً، ولمالك أو مدير لا
 * يرى نطاقُه الوحدةَ التي تُحمَّل التكاليف من مصاريفها. وإن حُفظت الموادّ في الخلطة (0025) يُقال بنسختها.
 */
function ProducedView({ result, recipeId, onAgain }: { result: Produced; recipeId: string; onAgain: () => void }) {
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
  const saved = result.savedToRecipe ? (
    <p className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="produced-saved">
      {t('mill.produced.saved', 'وحُفظت موادّ هذا الإنتاج في الخلطة: صارت نسخة {no} هي الخلطة.', { no: result.versionNo })}
    </p>
  ) : null;
  if (result.status === 'draft') {
    return (
      <section className="card flex flex-col gap-3 p-4" data-action="produced-draft">
        <h2 className="text-lg font-semibold">{t('mill.produced.draft_title', 'حُفظت الدفعة وتنتظر ختم الكلف')}</h2>
        <p data-action="produced-draft-text">
          {t('mill.produced.draft_v4', 'حُفظت دفعة «{recipe}» (المخطّط {qty}) مسوّدة بما كتبته من كميات: يختم كلفها من صفحتها («اختم الكلف») محاسبٌ أو مدير يرى مصاريف وحدتها، ثمّ تُرحَّل فيدخل العلف «رصيد العلف».', {
            recipe: result.recipeName,
            qty: kgText(result.plannedKg),
          })}
        </p>
        {saved}
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
      {saved}
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
            {kgText(result.inputMassKg)}
          </dd>
        </div>
        {result.shrinkKg !== 0n ? (
          <div className="flex gap-1">
            <dt className="text-ink-muted">{t('mill.produced.shrink', 'الهدر')}</dt>
            <dd className="font-medium">
              {kgText(result.shrinkKg)}
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

/** الطلب المجمَّد بعد نتيجة مجهولة كما أُرسل (لا ما في الخانات الآن): موادّه وكمياتها ويومه، والإعادة به وحده. */
function FrozenView({ request, busy, failure, onRetry }: { request: ProduceRequest; busy: boolean; failure: string | null; onRetry: () => void }) {
  const decimals = columnDecimals(request.lines.map((line) => line.qty), 3) as 0 | 1 | 2 | 3;
  const masses = request.lines.filter((line) => line.inBasis).map((line) => massOf(line.qty, line.unit, line.density));
  const mass = masses.every((value) => value !== null) ? masses.reduce<Milli>((sum, value) => sum + (value ?? 0n), 0n) : null;
  const columns: Column<ProduceLine>[] = [
    { key: 'item', header: t('mill.line.item', 'المادّة'), sticky: true, cell: (line) => <NameCell>{line.name}</NameCell> },
    { key: 'qty', header: t('mill.line.qty', 'الكمية'), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.qty, decimals)}</Num> },
    { key: 'unit', header: t('mill.line.unit_col', 'الوحدة'), cell: (line) => unitWord(line.unit) },
  ];
  return (
    <section className="card flex flex-col gap-3 p-4" data-action="frozen">
      <Notice
        tone="warning"
        title={
          request.draft
            ? t('mill.produce.frozen_draft', 'لا نعرف إن حُفظت المسوّدة: أعد المحاولة قبل أيّ تعديل؛ لن تُحفظ مرّتين.')
            : t('mill.produce.frozen', 'لا نعرف إن سُجّل الإنتاج: أعد المحاولة قبل أيّ تعديل؛ لن تُسجَّل الدفعة مرّتين.')
        }
        action={
          <Button busy={busy} onClick={onRetry} data-action="retry-produce">
            {t('mill.builder.retry', 'أعد المحاولة')}
          </Button>
        }
      />
      <p className="text-sm text-ink-muted">{t('mill.produce.frozen_sent', 'هذا ما أُرسل، ويُعاد كما هو:')}</p>
      <div data-action="frozen-lines">
        <DataTable caption={t('mill.produce.frozen_caption', 'موادّ الطلب المرسَل وكمياتها')} columns={columns} rows={request.lines} rowKey={(line) => line.itemId} empty={t('mill.detail.empty', 'لا مواد في هذه النسخة بعد.')} />
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {request.producedOn ? (
          <div className="flex gap-1">
            <dt className="text-ink-muted">{t('mill.produced.day', 'يوم الإنتاج')}</dt>
            <dd className="font-medium">{fmtDay(request.producedOn)}</dd>
          </div>
        ) : null}
        {mass !== null ? (
          <div className="flex gap-1">
            <dt className="text-ink-muted">{t('mill.produce.output', 'الناتج')}</dt>
            <dd className="font-medium">
              {kgText(mass)}
            </dd>
          </div>
        ) : null}
        {request.outputKg !== null ? (
          <div className="flex gap-1">
            <dt className="text-ink-muted">{t('mill.weigh.kg', 'الوزن بالكيلوغرام')}</dt>
            <dd className="font-medium">
              {kgText(request.outputKg)}
            </dd>
          </div>
        ) : null}
      </dl>
      {request.note ? <p className="text-sm text-ink-muted">{t('mill.produced.note', 'الملاحظة: {note}', { note: request.note })}</p> : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}
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
  // مفتاح الطلب المعلَّق (S1): المستخدم والمنشأة والخلطة، فلا يعود طلب مستخدم لآخر دخل التبويب نفسه.
  const pendingId = workspace ? pendingKey(`${workspace.userId}:${workspace.orgId}`, recipeId) : '';
  // production_form لمن يسجّل الإنتاج وحده (الخادم يرفض غيره)، وتبقى الشاشة مرسومة أثناء إعادة قراءتها (بعد recipe_changed أو إنتاج).
  const load = useCallback(() => (canProduce ? loadProduceForm(recipeId) : Promise.resolve(null)), [canProduce, recipeId]);
  const formState = useKeptLoad<ProduceForm | null>(load, `${recipeId}#${canProduce}`);
  const form = formState.data;

  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  /** اختيار «عدّل الخلطة بهذه الموادّ» أو «لهذه المرّة فقط» لمجموعة الموادّ هذه على النسخة هذه: تغيّر أحدهما يطلب الاختيار من جديد. */
  const [choice, setChoice] = useState<{ set: string; version: string; save: boolean } | null>(null);
  const [fromPick, setFromPick] = useState<string | null>(null);
  const [dayText, setDayText] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [weighed, setWeighed] = useState(false);
  const [weightText, setWeightText] = useState('');
  const [reason, setReason] = useState('');
  const [expiryText, setExpiryText] = useState('');
  const [picking, setPicking] = useState<'add' | 'gap' | null>(null);
  const [pickPending, setPickPending] = useState<string | null>(null);
  const [pickFailure, setPickFailure] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** الطلب الذي في الطريق: «أنتج» أو «احفظ مسوّدة» (مؤشّر الانتظار على زرّه). */
  const [busyDraft, setBusyDraft] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** تلميح recipe_changed: قُرئت الخلطة من جديد. */
  const [changed, setChanged] = useState<string | null>(null);
  /** طلب produce_batch بعد نتيجة مجهولة: الشاشة مجمَّدة والإعادة به وحده (المعرّف والمرجع نفسيهما). */
  const [frozen, setFrozen] = useState<ProduceRequest | null>(null);
  /** طلب record_production من شاشة 0023 بقي معلَّقاً لهذه الخلطة. */
  const [legacy, setLegacy] = useState(false);
  const [result, setResult] = useState<Produced | null>(null);
  /** معرّف الدفعة ومرجع المحاولة: يولدان عند أوّل إرسال ويبقيان حتّى جواب نهائي. */
  const attempt = useRef<{ id: string; ref: string } | null>(null);
  /** طلب في الطريق: لا يُرسل ثانٍ قبل جوابه (نقرتان سريعتان). */
  const sending = useRef(false);
  const navigate = useNavigate();
  // طلب معلَّق من شاشة سابقة (S1): تعود الشاشة مجمَّدة به، والإعادة به وحده. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (مرّة لكلّ مفتاح).
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (pendingId !== '' && restoredFor !== pendingId) {
    setRestoredFor(pendingId);
    const kept = readPending(pendingId);
    if (kept?.kind === 'request' && kept.request.recipeId === recipeId) setFrozen(kept.request);
    else if (kept?.kind === 'legacy') setLegacy(true);
  }

  // مخزن المواد المختار (وإلّا أوّلها) و«عندك» منه: القراءة بمعرّفه وحده.
  const stores = form?.stores ?? [];
  const from = fromPick !== null && stores.some((store) => store.id === fromPick) ? fromPick : (stores[0]?.id ?? '');
  const stockLoad = useCallback(() => readStore(from), [from]);
  const stock = useLoad(stockLoad, from);
  const storeName = stores.find((store) => store.id === from)?.name ?? '';
  const available = (itemId: string): Milli | null => stock.data?.get(itemId)?.available ?? null;

  const locked = busy || frozen !== null || formState.refreshing;
  const materials = form?.materials ?? [];
  const rows = produceRows(materials, edits);
  const topUp = edits.topUp;
  const inside = rows.filter((row) => row.inBasis);
  const massKnown = inside.length > 0 && inside.every((row) => row.mass !== null);
  const mass = inside.reduce((sum, row) => sum + (row.mass ?? 0n), 0n);
  // الكتلة قبل «قرّب»: منها الطنّ التالي والفرق، فإعادة «قرّب» تحسب من الأصل لا فوق إكمال سابق.
  const baseKnown = inside.length > 0 && inside.every((row) => row.baseMass !== null);
  const baseMass = inside.reduce((sum, row) => sum + (row.baseMass ?? 0n), 0n);
  const target = baseKnown && baseMass > 0n ? nextTon(baseMass) : 0n;
  const gap = target - baseMass;
  const problemRows = rows.filter((row) => row.problem !== null);
  const roundable = massKnown && baseKnown && gap > 0n && !problemRows.length && (topUp === null || topUp.gap !== gap);
  const shortOf = (row: ProduceRow): Milli | null => {
    const have = available(row.itemId);
    return have !== null && row.qty !== null && row.qty > have ? row.qty - have : null;
  };
  const shortRows = rows.filter((row) => shortOf(row) !== null);
  const slots = slotsOf(rows.map((row) => ({ key: row.itemId, inBasis: row.inBasis })));

  // موادّ الإنتاج تخالف الخلطة: الاختيار لمن يعدّلها (مربوط بالمجموعة والنسخة)، ولغيره «لهذه المرّة فقط» دائماً.
  const differs = form !== null && materialsDiffer(rows, materials);
  const setKey = rows.map((row) => row.itemId).sort().join(',');
  const versionId = form?.active?.id ?? '';
  const chosen = choice !== null && choice.set === setKey && choice.version === versionId ? choice.save : null;
  const saveRecipe: boolean | null | undefined = !differs ? null : !form?.canEditRecipe ? false : (chosen ?? undefined);
  const recipeIds = new Set(materials.map((material) => material.itemId));
  const added = rows.filter((row) => !recipeIds.has(row.itemId));
  const omitted = materials.filter((material) => !rows.some((row) => row.itemId === material.itemId));

  // اليوم والوزن والانتهاء.
  const today = form?.today ?? null;
  const shownDay = dayText ?? (today ? fmtDay(today) : '');
  const day = parseDayText(shownDay);
  const dayProblem = day === null ? t('mill.weigh.day_bad', 'اكتب يوم الإنتاج يوم/شهر/سنة، مثل 04/11/2026.') : today !== null && day > today ? t('mill.produce.day_future', 'يوم الإنتاج بعد اليوم ({today}).', { today: fmtDay(today) }) : null;
  const outputKg = weighed ? positive(weightText) : null;
  const weightProblem = weighed && outputKg === null ? (weightText.trim() === '' ? t('mill.produce.weight_missing', 'اكتب وزن الناتج، أو أغلق «وزنت الناتج؟».') : t('mill.weigh.bad', 'اكتب وزناً أكبر من صفر.')) : null;
  const shrink = outputKg !== null && massKnown ? mass - outputKg : null;
  // الهدر بين صفر و3٪ من كتلة المواد مقبول (private.shrink_ok)، وخارجه يطلب الخادم سببه (3 أحرف على الأقلّ).
  const shrinkOk = shrink === null || (mass > 0n && shrink >= 0n && shrink * 100n <= 3n * mass);
  const reasonOk = shrinkOk || [...reason.trim()].length >= 3;
  const tracks = form?.tracksExpiry ?? false;
  const expiry = tracks && expiryText.trim() !== '' ? parseDayText(expiryText) : null;
  const expiryBad = tracks && expiryText.trim() !== '' && (expiry === null || (day !== null && expiry < day));
  const expiryProblem = !tracks
    ? null
    : expiryText.trim() === ''
      ? t('mill.produce.expiry_missing', 'اكتب تاريخ انتهاء الناتج: «{item}» يُتابَع انتهاؤه.', { item: form?.recipe.outputItem.name ?? '' })
      : expiry === null
        ? t('mill.weigh.expiry_bad', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
        : day !== null && expiry < day
          ? t('mill.produce.expiry_before', 'تاريخ الانتهاء قبل يوم الإنتاج.')
          : null;

  // ما يمنع المسوّدة: ما يرفضه produce_batch قبل الإنشاء (الموادّ وكمياتها والاختيار واليوم ووزن مكتوب خطأً)؛ والإنتاج فوقه الوزن والسبب والانتهاء.
  const draftMissing: string[] = [];
  if (!rows.length) draftMissing.push(t('mill.produce.need_lines', 'لا موادّ في هذا الإنتاج: أضف مادّة واحدة على الأقلّ.'));
  for (const row of rows) {
    if (row.problem === 'archived') draftMissing.push(t('mill.produce.blocked_archived', '«{name}» محذوفة من القوائم، فلا تدخل الإنتاج: أزلها.', { name: row.name }));
    else if (row.problem === 'pc') draftMissing.push(t('mill.produce.blocked_pc', 'صارت «{name}» تُقاس بالقطعة، فلا تدخل الإنتاج: أزلها.', { name: row.name }));
    else if (row.problem === 'density') draftMissing.push(t('mill.produce.blocked_density', '«{name}» سائل بلا كثافة: تُكتب كثافته من «المواد» في المخزن ثمّ تُنتج.', { name: row.name }));
    else if (row.qty === null) draftMissing.push(t('mill.builder.need_qty', 'اكتب كمية «{name}» أكبر من صفر.', { name: row.name }));
    else if (row.qty >= QTY_LIMIT) draftMissing.push(t('mill.produce.qty_big', 'كمية «{name}» أكبر من الحدّ: اكتب أقلّ من مليار.', { name: row.name }));
  }
  if (rows.length && !inside.length) draftMissing.push(t('mill.produce.no_mass', 'الخلطة بلا مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يصنعان علفاً.'));
  if (legacy) draftMissing.push(t('mill.produce.need_legacy', 'راجع محاولة الإنتاج السابقة التي لم تُعرف نتيجتها (فوق) ثمّ اضغط «راجعتها».'));
  if (saveRecipe === undefined) draftMissing.push(t('mill.produce.need_choice', 'غيّرت موادّ الخلطة: اختر «عدّل الخلطة بهذه الموادّ» أو «لهذه المرّة فقط».'));
  if (dayProblem) draftMissing.push(dayProblem);
  if (weighed && weightText.trim() !== '' && outputKg === null) draftMissing.push(t('mill.weigh.bad', 'اكتب وزناً أكبر من صفر.'));
  if (expiryBad && expiryProblem) draftMissing.push(expiryProblem);
  const missing = [...draftMissing];
  if (weightProblem && !missing.includes(weightProblem)) missing.push(weightProblem);
  if (!reasonOk) missing.push(t('mill.produce.need_reason', 'الهدر خارج المدى المقبول (من صفر إلى 3٪): اكتب سببه.'));
  if (expiryProblem && !missing.includes(expiryProblem)) missing.push(expiryProblem);
  const ready = canProduce && form !== null && form.active !== null && from !== '' && form.outputStore !== null && missing.length === 0;
  const draftReady = canProduce && form !== null && form.active !== null && from !== '' && form.outputStore !== null && draftMissing.length === 0;
  const dirty = edits !== NO_EDITS || note.trim() !== '' || weighed || dayText !== null || expiryText.trim() !== '' || choice !== null;
  // والطلب في الطريق أو مجمَّد بنتيجة مجهولة (مراجعة شاشات 0023، S2): كانت النافذة «نظيفة» أثناءهما، فيعيد التحديث تحميلها والجواب لم يصل فيضيع
  // المعرّف وتُرسل دفعة ثانية.
  useDirtyForm((dirty && result === null) || busy || frozen !== null);

  /** كمية مادّة: كتابة على صفّ «قرّب» تُسقط الإكمال (المستخدم أخذ الكمية). */
  const editRow = (row: ProduceRow, text: string) =>
    setEdits((before) => {
      const dropTopUp = before.topUp?.itemId === row.itemId;
      if (row.fromRecipe) return { ...before, texts: { ...before.texts, [row.itemId]: text }, topUp: dropTopUp ? null : before.topUp };
      return { ...before, extras: before.extras.map((extra) => (extra.itemId === row.itemId ? { ...extra, text } : extra)), topUp: dropTopUp ? null : before.topUp };
    });
  /** «أزل»: مادّة الخلطة تُترك لهذه المرّة، والمضافة تُحذف؛ وإكمالها معها. */
  const removeRow = (row: ProduceRow) =>
    setEdits((before) => ({
      ...before,
      removed: row.fromRecipe ? [...before.removed, row.itemId] : before.removed,
      extras: row.fromRecipe ? before.extras : before.extras.filter((extra) => extra.itemId !== row.itemId),
      topUp: before.topUp?.itemId === row.itemId ? null : before.topUp,
    }));
  /** إكمال جديد يحلّ محلّ السابق، ومادّة أضافها إكمالٌ سابق (created) تخرج معه. */
  const withTopUp = (before: Edits, next: TopUp, extra: Extra | null): Edits => {
    const old = before.topUp;
    const extras = old?.created && old.itemId !== next.itemId ? before.extras.filter((entry) => entry.itemId !== old.itemId) : before.extras;
    return { ...before, extras: extra ? [...extras.filter((entry) => entry.itemId !== extra.itemId), extra] : extras, topUp: next };
  };
  const undoTopUp = () =>
    setEdits((before) => {
      const old = before.topUp;
      if (!old) return before;
      return { ...before, topUp: null, extras: old.created ? before.extras.filter((entry) => entry.itemId !== old.itemId) : before.extras };
    });

  const openPick = (kind: 'add' | 'gap') => {
    setPickFailure(null);
    setPickNote(null);
    setPicking(kind);
  };

  /** مادّة من المخزن تُقرأ قبل إضافتها (نوعها ووحدتها وكثافتها الآن): لا تُضاف مادّة أُرشفت أو تغيّرت فلا تصلح للإنتاج. */
  const readMaterial = async (candidate: Candidate, forGap: boolean): Promise<Extra | null> => {
    const item = await loadItem(candidate.itemId);
    if (!item || !millAdmissible(item) || (forGap && !inBasisKind(item.kind))) {
      setPickFailure(t('mill.gap.unfit', '«{name}» لا تصلح للإكمال الآن (تغيّرت أو أُرشفت): اختر غيرها.', { name: candidate.name }));
      return null;
    }
    return { itemId: item.id, name: item.name, kind: item.kind, unit: item.baseUnit, density: item.baseUnit === 'L' ? item.density : null, text: '' };
  };

  /** «أضف مادّة»: مادّة أُزيلت تعود إلى مكانها في الخلطة، وغيرها تُقرأ ثمّ تُضاف في آخر الموادّ بلا كمية. النافذة تبقى لأكثر من مادّة. */
  const pickAdd = async (candidate: Candidate) => {
    setPickFailure(null);
    if (candidate.from === 'removed') {
      setEdits((before) => ({ ...before, removed: before.removed.filter((itemId) => itemId !== candidate.itemId) }));
      setPickNote(t('mill.pick.added', 'أُضيفت «{name}».', { name: candidate.name }));
      return;
    }
    setPickPending(candidate.itemId);
    try {
      const extra = await readMaterial(candidate, false);
      if (!extra) return;
      setEdits((before) => ({ ...before, extras: [...before.extras.filter((entry) => entry.itemId !== extra.itemId), extra] }));
      setPickNote(t('mill.pick.added', 'أُضيفت «{name}».', { name: extra.name }));
    } catch (problem) {
      setPickFailure(failureText(problem));
    } finally {
      setPickPending(null);
    }
  };

  /** «قرّب»: الفرق كلّه من المادّة المختارة: صفّ هنا يزيد فوق كميته الآن، ومادّة من المخزن تُقرأ ثمّ تُضاف بالفرق. */
  const pickGap = async (candidate: Candidate) => {
    if (gap <= 0n) return;
    setPickFailure(null);
    if (candidate.from === 'row') {
      const row = rows.find((entry) => entry.itemId === candidate.itemId);
      if (!row || row.baseQty === null) return;
      const add = gapQty(row.baseQty, gap, row.unit, row.density, 0n, true);
      if (add === null) {
        setPickFailure(t('mill.gap.no_density', '«{name}» سائل بلا كثافة، فلا يُحسب به الفرق.', { name: row.name }));
        return;
      }
      setEdits((before) => withTopUp(before, { itemId: row.itemId, name: row.name, unit: row.unit, added: add, target, gap, created: false }, null));
      setPicking(null);
      return;
    }
    setPickPending(candidate.itemId);
    try {
      const extra = await readMaterial(candidate, true);
      if (!extra) return;
      const add = gapQty(0n, gap, extra.unit, extra.density, 0n, true);
      if (add === null) {
        setPickFailure(t('mill.gap.no_density_store', '«{name}» سائل بلا كثافة، فلا يُحسب به الفرق: تُكتب كثافته من «المواد» في المخزن.', { name: extra.name }));
        return;
      }
      setEdits((before) => withTopUp(before, { itemId: extra.itemId, name: extra.name, unit: extra.unit, added: add, target, gap, created: true }, extra));
      setPicking(null);
    } catch (problem) {
      setPickFailure(failureText(problem));
    } finally {
      setPickPending(null);
    }
  };

  /** نداء produce_batch بطلب محفوظ: الأوّل من «أنتج» أو «احفظ مسوّدة»، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const submit = async (request: ProduceRequest, retrying: boolean) => {
    // طلب واحد في الطريق (نقرتان سريعتان قبل أن يُرسم «جارٍ…»): الثانية لا تُرسل.
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setChanged(null);
    // الطلب محفوظ خارج المكوّن قبل أن يخرج (S1): رجوع أو إعادة تحميل قبل الجواب تعيد الشاشة مجمَّدة به.
    storePending(pendingId, request);
    try {
      const done = await produceBatch(request);
      storePending(pendingId, null);
      attempt.current = null;
      setFrozen(null);
      if (isSavedDraft(done)) {
        // «احفظ مسوّدة»: الدفعة مسوّدة بما كُتب، وتُكمل في صفحتها (التكاليف والمعاينة والترحيل).
        toast({ tone: 'success', title: t('mill.produce.draft_saved', 'حُفظت الدفعة مسوّدة بما كتبته: أكملها في صفحتها.') });
        navigate(`/mill/batch/${done.id}`);
        return;
      }
      setResult(done);
      stock.retry();
    } catch (problem) {
      // id_conflict: طلبٌ بمعرّف الدفعة نفسه يسابقه في الخادم، فلعلّه سُجّل؛ كالنتيجة المجهولة: الإعادة بالطلب نفسه ترجّع نتيجته.
      const racing = problem instanceof RejectedError && problem.code === 'id_conflict';
      if (racing || !surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن سُجّلت الدفعة: الشاشة تتجمّد بطلبها، والإعادة وحدها ممكنة (لن تُسجَّل مرّتين). وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(request);
        if (racing) setFailure(failureText(problem));
        else if (retrying && surelyUnsaved(problem)) setFailure(t('mill.produce.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.'));
      } else {
        // جواب أكيد بلا تسجيل: المكتوب باقٍ، والمحاولة التالية بمعرّف ومرجع جديدين.
        storePending(pendingId, null);
        attempt.current = null;
        setFrozen(null);
        if (problem instanceof RejectedError && REREAD.has(problem.code)) {
          // ما قرأته الشاشة تغيّر: تُقرأ من جديد وتبقى الكميات المكتوبة لموادّها.
          setChanged(failureText(problem));
          formState.retry();
        } else setFailure(failureText(problem));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const send = (draft: boolean) => {
    if (!form?.active || locked || sending.current || day === null || saveRecipe === undefined || (draft ? !draftReady : !ready)) return;
    attempt.current ??= { id: crypto.randomUUID(), ref: crypto.randomUUID() };
    const ids = attempt.current;
    setBusyDraft(draft);
    void submit(
      {
        id: ids.id,
        recipeId: form.recipe.id,
        expectedVersion: form.active.id,
        inputWarehouseId: from,
        lines: rows.map((row) => ({ itemId: row.itemId, qty: row.qty ?? 0n, name: row.name, unit: row.unit, density: row.density, inBasis: row.inBasis })),
        saveRecipe,
        draft,
        producedOn: day,
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

  /** «أنتج دفعة أخرى»: الشاشة من أوّلها بالخلطة كما هي الآن (قد تكون حُفظت نسخة جديدة، وكميات آخر إنتاج صارت هذه)، و«عندك» من جديد. */
  const again = () => {
    setResult(null);
    setEdits(NO_EDITS);
    setChoice(null);
    setDayText(null);
    setNote('');
    setWeighed(false);
    setWeightText('');
    setReason('');
    setExpiryText('');
    setFailure(null);
    setChanged(null);
    formState.retry();
  };

  const recipeName = form?.recipe.name ?? '';
  const header = (
    <>
      <BackButton to="/mill" label={t('back.mill', 'رجوع إلى المعمل')} action="back-to-mill" />
      <PageHeader
        title={recipeName ? t('mill.produce.title', 'إنتاج «{name}»', { name: recipeName }) : t('mill.produce.what', 'شاشة الإنتاج')}
        subtitle={form ? t('mill.card.output', 'تنتج: {item}', { item: form.recipe.outputItem.name }) : undefined}
      />
    </>
  );
  // الطلب المجمَّد أوّلاً، ولو لم تُقرأ الشاشة بعد: لا يُفتح «أنتج» بمعرّف جديد قبل أن تُعرف نتيجته.
  if (frozen) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <FrozenView request={frozen} busy={busy} failure={failure} onRetry={() => void submit(frozen, true)} />
      </div>
    );
  }
  if (session.status === 'ready' && !canProduce) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Notice tone="warning" title={t('mill.produce.forbidden', 'تسجيل الإنتاج للمالك والمدير ومشغّل المعمل.')} />
      </div>
    );
  }
  if (formState.error && !form) return <LoadFailed what={t('mill.produce.what', 'شاشة الإنتاج')} error={formState.error} onRetry={formState.retry} />;
  if (!form) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  if (result) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ProducedView result={result} recipeId={form.recipe.id} onAgain={again} />
      </div>
    );
  }
  const legacyNotice = legacy ? (
    <Notice
      tone="warning"
      title={t('mill.produce.legacy_pending', 'محاولة إنتاج سابقة لهذه الخلطة لم تُعرف نتيجتها: راجع آخر الدفعات في المعمل قبل أن تنتج، لئلّا تُسجَّل مرّتين.')}
      action={
        <span className="flex flex-wrap gap-2">
          <Link to="/mill" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="legacy-open-mill">
            {t('mill.back', 'المعمل')}
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              storePending(pendingId, null);
              setLegacy(false);
            }}
            data-action="legacy-dismiss"
          >
            {t('mill.produce.legacy_dismiss', 'راجعتها')}
          </Button>
        </span>
      }
    />
  ) : null;
  const stop = form.recipe.archived
    ? t('mill.recipe.archived', 'هذه الخلطة محذوفة من المعمل: لا تظهر في قائمته ولا يُنتَج بها.')
    : !form.active
      ? t('mill.card.no_active', 'هذه الخلطة بلا نسخة مفعَّلة.')
      : !form.outputStore
        ? t('mill.produce.no_feed_store', 'لا يوجد «رصيد العلف» في المعمل: أضفه من إعداد المخزن.')
        : !stores.length
          ? t('mill.produce.no_raw_store', 'لا مخزن موادّ أوّلية في نطاقك تُسحب منه الموادّ.')
          : null;
  if (stop) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {legacyNotice}
        <Notice
          tone="warning"
          title={stop}
          action={
            <Link to={`/mill/recipe/${form.recipe.id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-recipe">
              {t('mill.produce.open_recipe', 'افتح الخلطة')}
            </Link>
          }
        />
      </div>
    );
  }

  const color = recipeColor(form.recipe.id);
  const last = form.last;
  const handDecimals = columnDecimals(
    rows.flatMap((row) => {
      const have = available(row.itemId);
      return have === null ? [] : [have];
    }),
    3,
  ) as 0 | 1 | 2 | 3;
  const outside = rows.some((row) => !row.inBasis);
  const sourceText = (row: ProduceRow): string | null => {
    if (row.defaultQty === null || row.defaultSource === null || row.added !== null) return null;
    const same = row.qty === row.defaultQty;
    if (row.defaultSource === 'last') return same ? t('mill.produce.from_last', 'من آخر إنتاج') : t('mill.produce.was_last', 'في آخر إنتاج: {qty}', { qty: amountText(row.defaultQty, row.unit) });
    return same ? t('mill.produce.from_recipe', 'من الخلطة') : t('mill.produce.was_recipe', 'في الخلطة: {qty}', { qty: amountText(row.defaultQty, row.unit) });
  };
  const columns: Column<ProduceRow>[] = [
    {
      key: 'item',
      header: t('mill.line.item', 'المادّة'),
      sticky: true,
      cell: (row) => (
        <span className="flex flex-col gap-0.5" style={NAME_BOX}>
          <MaterialName name={row.name} slot={slots.get(row.itemId) ?? null} />
          {!row.inBasis ? (
            <span className="text-xs text-ink-muted" data-action="out-of-basis">
              {t('mill.line.out_of_basis', 'خارج الكتلة')}
            </span>
          ) : null}
          {!row.fromRecipe ? (
            <span className="text-xs text-ink-muted" data-action="row-extra">
              {t('mill.produce.extra', 'ليست في الخلطة: لهذا الإنتاج')}
            </span>
          ) : null}
          {row.unit === 'L' && row.mass !== null ? (
            <span className="text-xs text-ink-muted" data-action="row-kg" data-id={row.itemId}>
              {t('mill.cards.mass', 'أي {kg}', { kg: kgText(row.mass) })}
            </span>
          ) : null}
          {row.added !== null && topUp ? (
            <span className="text-xs font-medium text-brand-700 dark:text-brand-200" data-action="round-added">
              {t('mill.gap.added', '+{qty} لإكمال {tons}', { qty: amountText(row.added, row.unit), tons: tonsText(topUp.target) })}
            </span>
          ) : null}
          {row.problem !== null ? (
            <span className="text-xs text-danger-700 dark:text-danger-300" data-action="row-problem">
              {row.problem === 'archived'
                ? t('mill.produce.blocked_archived_short', 'محذوفة من القوائم')
                : row.problem === 'pc'
                  ? t('mill.produce.blocked_pc_short', 'صارت تُقاس بالقطعة')
                  : t('mill.produce.blocked_density_short', 'سائل بلا كثافة')}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'qty',
      header: t('mill.line.qty', 'الكمية'),
      kind: 'number',
      cell: (row) => {
        if (row.problem !== null) return dash();
        const source = sourceText(row);
        return (
          <span className="flex flex-col items-end gap-0.5">
            <input
              aria-label={t('mill.builder.qty_of', 'كمية «{name}»', { name: row.name })}
              // عرض ثابت (مراجعة شاشات 0023، S3): بـw-full كانت تنكمش في الهاتف (390) إلى عرض رأس العمود، فلا تُرى الكمية.
              className="input w-32 text-end tabular-nums"
              size={9}
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              value={row.text}
              disabled={locked}
              aria-invalid={row.qty === null || undefined}
              onChange={(event) => editRow(row, event.target.value)}
              data-action="line-qty"
              data-id={row.itemId}
            />
            {source ? (
              <span className="text-xs text-ink-muted" data-action="line-source" data-id={row.itemId}>
                {source}
              </span>
            ) : null}
          </span>
        );
      },
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
    {
      key: 'actions',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (row) => (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={locked} onClick={() => removeRow(row)} data-action="remove-line" data-id={row.itemId}>
          {t('mill.produce.remove', 'أزل')}
        </Button>
      ),
    },
  ];

  const storeItems = [...(stock.data?.values() ?? [])].filter((item) => !item.archived && MILL_RAW_KINDS.includes(item.kind) && (item.baseUnit === 'kg' || item.baseUnit === 'L'));
  const inRows = new Set(rows.map((row) => row.itemId));
  const storeOf = (itemId: string) => stock.data?.get(itemId) ?? null;
  const pickGroups = ((): CandidateGroup[] => {
    if (picking === 'gap') {
      return [
        {
          key: 'rows',
          title: t('mill.gap.rows', 'من موادّ هذا الإنتاج'),
          items: rows.flatMap((row) =>
            row.inBasis && row.problem === null && row.baseQty !== null ? [{ itemId: row.itemId, name: row.name, unit: row.unit, available: available(row.itemId), from: 'row' as const }] : [],
          ),
        },
        {
          key: 'store',
          title: t('mill.gap.store', 'موادّ أخرى في «{store}»', { store: storeName }),
          items: storeItems.filter((item) => !inRows.has(item.itemId) && inBasisKind(item.kind)).map((item) => ({ itemId: item.itemId, name: item.name, unit: item.baseUnit, available: item.available, from: 'store' as const })),
        },
      ];
    }
    const removedItems = materials.filter((material) => edits.removed.includes(material.itemId) && !inRows.has(material.itemId));
    const lastItems = (last?.extraItems ?? []).filter((item) => !inRows.has(item.itemId) && !recipeIds.has(item.itemId));
    const offered = new Set([...removedItems.map((material) => material.itemId), ...lastItems.map((item) => item.itemId)]);
    return [
      {
        key: 'last',
        title: t('mill.pick.last', 'استُعملت في آخر إنتاج'),
        items: lastItems.map((item) => ({ itemId: item.itemId, name: item.name, unit: storeOf(item.itemId)?.baseUnit ?? null, available: available(item.itemId), from: 'last' as const })),
      },
      {
        key: 'removed',
        title: t('mill.pick.removed', 'موادّ الخلطة التي أزلتها'),
        items: removedItems.map((material) => ({ itemId: material.itemId, name: material.name, unit: material.baseUnit, available: available(material.itemId), from: 'removed' as const })),
      },
      {
        key: 'store',
        title: t('mill.gap.store', 'موادّ أخرى في «{store}»', { store: storeName }),
        items: storeItems.filter((item) => !inRows.has(item.itemId) && !offered.has(item.itemId)).map((item) => ({ itemId: item.itemId, name: item.name, unit: item.baseUnit, available: item.available, from: 'store' as const })),
      },
    ];
  })();
  const reached = massKnown && mass % TON === 0n;
  const barPieces = rows.flatMap((row) => {
    const slot = slots.get(row.itemId);
    return row.inBasis && slot !== null && slot !== undefined ? [{ key: row.itemId, label: row.name, weight: row.mass, slot }] : [];
  });

  return (
    <div className="flex flex-col gap-5">
      {header}
      {legacyNotice}
      {formState.error ? <LoadFailed what={t('mill.produce.what', 'شاشة الإنتاج')} error={formState.error} onRetry={formState.retry} /> : null}
      {changed ? (
        <Notice tone="warning" title={changed}>
          <span data-action="recipe-changed">
            {formState.refreshing
              ? t('mill.produce.changed_reading', 'جارٍ قراءة الخلطة من جديد…')
              : t('mill.produce.changed_read', 'قُرئت الخلطة من جديد، وما كتبته من كميات باقٍ لموادّه: راجع الموادّ ثمّ أنتج.')}
          </span>
        </Notice>
      ) : null}

      <section className="card flex flex-col gap-3 overflow-hidden p-0">
        <div className="h-2" style={{ background: color.solid }} aria-hidden="true" />
        <div className="flex flex-col gap-3 px-4 pb-4">
          <h2 className="text-lg font-semibold">{t('mill.produce.materials', 'المواد')}</h2>
          <p className="text-sm text-ink-muted" data-action="produce-source">
            {last
              ? t('mill.produce.hint_last', 'الكميات من آخر إنتاج ({doc} بتاريخ {day}، الناتج {kg}): عدّل أيّ كمية، أو أزل مادّة، أو أضف غيرها.', {
                  doc: last.docNo,
                  day: fmtDay(last.producedOn),
                  kg: kgText(last.outputKg),
                })
              : materials.some((material) => material.defaultSource === 'recipe')
                ? t('mill.produce.hint_recipe', 'الكميات من الخلطة كما كُتبت فيها: عدّل أيّ كمية، أو أزل مادّة، أو أضف غيرها.')
                : t('mill.produce.hint_first', 'أوّل إنتاج لهذه الخلطة: اكتب كمية كلّ مادّة، وتُقترح كميات هذا الإنتاج في المرّة القادمة.')}
          </p>
          <DataTable
            caption={t('mill.produce.caption_v4', 'موادّ هذا الإنتاج بترتيب الخلطة: الكمية التي تُسحب، وما عندك في المخزن')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.itemId}
            empty={t('mill.produce.empty', 'لا موادّ في هذا الإنتاج: أضف مادّة.')}
          />
          <div>
            <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden="true" />} disabled={locked} onClick={() => openPick('add')} data-action="add-material">
              {t('mill.produce.add', 'أضف مادّة')}
            </Button>
          </div>
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
                ? t('mill.produce.output_is', 'الناتج: {kg} (قبل الهدر)', { kg: kgText(mass) })
                : t('mill.produce.output_unknown', 'لا يُحسب الناتج بعد: اكتب كمية كلّ مادّة.')}
            </p>
            {massKnown ? <CompositionBar pieces={barPieces} total={mass} /> : null}
            {outside ? <p className="text-sm text-ink-muted">{t('mill.builder.outside_note_v4', 'الوقود والتعبئة خارج كتلة الخلطة: يُسحبان وتُحسب كلفتهما، ولا يدخلان ناتجها.')}</p> : null}
            {topUp ? (
              <div className="flex flex-wrap items-center gap-2" data-action="round-note">
                <span className="text-sm font-medium">
                  {t('mill.gap.done', '+{qty} من «{name}» لإكمال {tons}.', { qty: amountText(topUp.added, topUp.unit), name: topUp.name, tons: tonsText(topUp.target) })}
                  {/* المجموع فوق الطنّ قليلاً بكثافة المادّة (والكتلة الأصلية كما حُسب لها): يُقال ولا يُخفى. */}
                  {massKnown && !reached && topUp.gap === gap ? ` ${t('mill.gap.over_v4', 'المجموع {kg}: لا يبلغ الطنّ بالضبط بكثافة «{name}».', { kg: kgText(mass), name: topUp.name })}` : ''}
                </span>
                <Button size="sm" variant="ghost" disabled={locked} onClick={undoTopUp} data-action="undo-round">
                  {t('mill.gap.undo', 'تراجع عن الإكمال')}
                </Button>
              </div>
            ) : null}
            {roundable ? (
              <div>
                <Button variant="secondary" icon={<Scale className="size-5" aria-hidden="true" />} disabled={locked} onClick={() => openPick('gap')} data-action="round-ton">
                  {t('mill.gap.button', 'قرّب إلى {tons} (+{gap})', { tons: tonsText(target), gap: kgText(gap) })}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {differs ? (
        <section className="card flex flex-col gap-3 p-4" data-action="recipe-diff">
          <h2 className="text-lg font-semibold">{t('mill.choice.title', 'غيّرت موادّ الخلطة')}</h2>
          <p className="text-sm" data-action="recipe-diff-text">
            {[
              added.length ? t('mill.choice.added', 'أضفت: {names}', { names: added.map((row) => row.name).join(t('list.separator', '، ')) }) : null,
              omitted.length ? t('mill.choice.omitted', 'أزلت: {names}', { names: omitted.map((material) => material.name).join(t('list.separator', '، ')) }) : null,
            ]
              .filter(Boolean)
              .join(t('mill.history.sep', ' · '))}
          </p>
          {form.canEditRecipe ? (
            <>
              <div role="radiogroup" aria-label={t('mill.choice.label', 'هل تعدّل الخلطة بهذه الموادّ؟')} className="flex flex-wrap gap-2" data-action="recipe-choice">
                <Button
                  role="radio"
                  aria-checked={chosen === true}
                  variant={chosen === true ? 'primary' : 'secondary'}
                  disabled={locked || form.draftExists}
                  onClick={() => setChoice({ set: setKey, version: versionId, save: true })}
                  data-action="choice-save"
                >
                  {t('mill.choice.save', 'عدّل الخلطة بهذه الموادّ')}
                </Button>
                <Button
                  role="radio"
                  aria-checked={chosen === false}
                  variant={chosen === false ? 'primary' : 'secondary'}
                  disabled={locked}
                  onClick={() => setChoice({ set: setKey, version: versionId, save: false })}
                  data-action="choice-once"
                >
                  {t('mill.choice.once', 'لهذه المرّة فقط')}
                </Button>
              </div>
              <p className="text-sm text-ink-muted" data-action="choice-help">
                {form.draftExists
                  ? t('mill.choice.draft_exists', 'للخلطة تعديل مفتوح لم يُفعَّل، فلا تُحفظ الموادّ فيها الآن: فعّله أو احذفه من صفحة الخلطة، أو أنتج لهذه المرّة فقط.')
                  : chosen === true
                    ? t('mill.choice.save_help', 'تصير هذه الموادّ بترتيبها هي الخلطة من الآن، ويُكتب ذلك في سجلّها.')
                    : chosen === false
                      ? t('mill.choice.once_help', 'تبقى الخلطة كما هي، ويُكتب في سجلّها ما تغيّر لهذا الإنتاج وحده.')
                      : t('mill.choice.pick', 'اختر أحدهما قبل «أنتج».')}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium" data-action="once-only">
              {t('mill.choice.once_only', 'التغيير لهذه المرّة فقط: موادّ الخلطة تبقى كما هي (تعديلها للمالك أو المدير).')}
            </p>
          )}
        </section>
      ) : null}

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t('mill.produce.details', 'تفاصيل الدفعة')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {stores.length > 1 ? (
            <Field id={`${fieldId}-from`} label={t('mill.produce.from', 'مخزن المواد')}>
              <select id={`${fieldId}-from`} className="input" value={from} disabled={locked} onChange={(event) => setFromPick(event.target.value)} data-action="store-from">
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm" data-action="input-store">
              {t('mill.produce.from_one', 'تُسحب الموادّ من: «{store}»', { store: storeName })}
            </p>
          )}
          <p className="text-sm font-medium" data-action="output-store">
            {t('mill.produce.into', 'يدخل الناتج: «{store}»', { store: form.outputStore?.name ?? '' })}
          </p>
          <Field id={`${fieldId}-day`} label={t('mill.weigh.day', 'يوم الإنتاج')} error={dayProblem ?? undefined} hint={t('mill.weigh.day_hint_v4', 'يوم/شهر/سنة: بهذا اليوم تُسحب المواد ويدخل العلف «رصيد العلف».')}>
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
      <div className="flex flex-wrap items-start gap-3">
        <Button size="lg" icon={<Factory className="size-5" aria-hidden="true" />} busy={busy && !busyDraft} disabled={!ready || locked} onClick={() => send(false)} data-action="produce-go">
          {t('mill.card.produce', 'أنتج')}
        </Button>
        {/* المسوّدة بما كُتب هنا كلّه، ثمّ صفحة الدفعة: تكاليف الدفعة ومعاينتها الكاملة قبل الترحيل (تلميحات الخادم تسمّي الزرّ باسمه). */}
        <div className="flex flex-col gap-1">
          <Button size="lg" variant="secondary" busy={busy && busyDraft} disabled={!draftReady || locked} onClick={() => send(true)} data-action="save-batch-draft">
            {t('mill.produce.save_draft', 'احفظ مسوّدة')}
          </Button>
          <p className="text-sm text-ink-muted" data-action="draft-help">
            {t('mill.produce.draft_help_v4', 'لتكاليف الدفعة أو معاينتها قبل الترحيل')}
          </p>
        </div>
      </div>
      {missing.length ? (
        <div className="flex flex-col gap-1 text-sm" data-action="produce-missing">
          <p className="font-medium">{t('mill.produce.missing', 'لا يُنتَج قبل ما يلي:')}</p>
          <ul className="list-disc ps-5 text-ink-muted">
            {missing.map((reasonText) => (
              <li key={reasonText}>{reasonText}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {picking ? (
        <PickDialog
          title={picking === 'gap' ? t('mill.gap.title', 'من أيّ مادّة يُكمَل الفرق ({gap})؟', { gap: kgText(gap) }) : t('mill.pick.title', 'أضف مادّة إلى هذا الإنتاج')}
          hint={
            picking === 'gap'
              ? t('mill.gap.hint', 'اكتب اسم المادّة التي يُكمَل بها الفرق (مثل برمكس): يُضاف الفرق كلّه إليها ويُسحب من المخزن.')
              : t('mill.pick.hint', 'موادّ «{store}» التي تصلح للإنتاج. تُضاف في آخر الموادّ بلا كمية، فاكتب كميتها.', { store: storeName })
          }
          groups={pickGroups}
          storeName={storeName}
          storeState={stock.error ? 'failed' : stock.data === null ? 'loading' : 'ready'}
          pending={pickPending}
          failure={pickFailure}
          note={picking === 'add' ? pickNote : null}
          onRetryStore={stock.retry}
          onPick={(candidate) => void (picking === 'gap' ? pickGap(candidate) : pickAdd(candidate))}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </div>
  );
}
