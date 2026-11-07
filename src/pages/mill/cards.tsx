import { CheckCircle2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { decimalText } from '../../domain/decimal';
import type { Milli } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import type { ItemKind } from '../../domain/stores';
import { litersToKg, parseDensity, parseQty, type BaseUnit } from '../../domain/units';
import { describeError, ZeroRowsError } from '../../lib/errors';
import { fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadItem, updateItem, type ItemRow } from '../../lib/repo/inventory';
import type { RecipeUnit } from '../../lib/repo/mill';
import { loadItemsOverview, type ItemsOverview } from '../../lib/repo/purchases';
import { itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { inBasisKind, materialOf, MaterialPicker, millAdmissible, onHandMap, OnHandNote, unitWord, type OnHandMap, type PickedMaterial } from './pickers';

// المواد بطاقاتٍ (كلمة المالك 2026-11-07: «اشوف المواد على شكل بطاقات واحدد على كل مادة واختار شكد استخدم كمية… واختار اكثر من مادة
// بنفس الوقت حتى انتج مادة جديدة وكل ما اسوي انتاج يحسبلي الناتج الي صار من مجموع المواد»): كلّ مادّة تصلح للخلطة بطاقة باسمها و«عندك»،
// تُختار بلمسة وتُترك بلمسة ثانية، وأكثر من مادّة معاً؛ والمختارة مضاءة وفيها خانة الكمية (بالكيلوغرام، أو باللتر للسائل). البحث يصفّي
// البطاقات، وما لا تجده البطاقات يقوله منتقي المعمل نفسه (لا مادّة باسم س، أو موجودة بنوع آخر، و«أنشئها»). ولا أساس يُطابَق: حجم الخلطة
// مجموع الكميات بالكيلوغرام (اللتر بالكثافة)، والسائل بلا كثافة يُقال على بطاقته وتُكتب كثافته هناك (لا رابط يغادر الشاشة فيضيع ما اختير).
// المادّة الصالحة كما في المنتقي (millAdmissible: فعّالة، يقبلها مخزن المواد الأوّلية، بالكيلو أو اللتر) من items_overview: قراءة واحدة
// للبطاقات و«عندك» معاً. المختار يعيش في الصفحة (useCardLines فيها، درس WP5): القراءة من جديد لا تمسحه.

/** مادّة في البطاقات: من items_overview (بموجودها الآن)، أو أُضيفت من المنتقي الآن (onHand = null). */
export interface MillMaterial {
  id: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
}

/** المواد التي تصلح للخلطة من items_overview (المؤرشفة خارجه أصلاً). */
export function millMaterials(overview: ItemsOverview | null): readonly MillMaterial[] | null {
  if (!overview) return null;
  return overview.items
    .filter((item) => millAdmissible({ archived: false, kind: item.kind, baseUnit: item.baseUnit }))
    .map((item) => ({ id: item.id, name: item.name, kind: item.kind, baseUnit: item.baseUnit }));
}

export interface MillStock {
  materials: readonly MillMaterial[] | null;
  onHand: OnHandMap | null;
  error: unknown;
  retry: () => void;
}

/** البطاقات و«عندك» من قراءة items_overview واحدة للصفحة. */
export function useMillStock(): MillStock {
  const { data, error, retry } = useLoad(loadItemsOverview);
  return { materials: millMaterials(data), onHand: onHandMap(data), error, retry };
}

/** كتلة السطر بالكيلو (بالآلاف): الكيلو كما هو، واللتر بكثافة المادّة (مرآة private.recipe_line_kg)، وبلا كثافة null. */
export function lineMassKg(qty: bigint, unit: RecipeUnit, density: bigint | null): bigint | null {
  if (unit === 'kg') return qty;
  return density !== null && density > 0n ? litersToKg(qty, density) : null;
}

/** «1,000 كغم» بالكيلوغرام دائماً (كلمة المالك: «مجموع كيلوات»)، لا «1.000 طن». */
export function kgText(qty: Milli): string {
  const shown = fmtQty(qty, 'kg');
  return shown.sub ?? shown.main;
}

/** كثافة السائل المختار: تُقرأ مع صفّه (نسخته لكتابتها)، والكيلوغرام لا يحتاجها. */
export type DensityState = { status: 'ready'; row: ItemRow | null } | { status: 'loading' } | { status: 'failed'; error: unknown };

/** مادّة مختارة: كميتها المكتوبة ووحدتها، وكثافتها إن كانت سائلاً، وما كُتب في خانة الكثافة. */
export interface CardLine {
  item: PickedMaterial;
  qtyText: string;
  unit: RecipeUnit;
  density: DensityState;
  densityText: string;
  densityBusy: boolean;
  densityProblem: string | null;
}

export interface CardLineView {
  line: CardLine;
  qty: Milli | null;
  qtyOk: boolean;
  /** الوقود والتعبئة خارج الكتلة (مرآة in_basis). */
  inBasis: boolean;
  /** الكتلة بالكيلو، أو null (كمية غير صالحة، أو سائل كثافته لا تُعرف بعد). */
  mass: Milli | null;
  /** سائل قُرئ بلا كثافة: لا يُحسب وزنه ولا يُفعَّل (density_required)، فيمنع الحفظ حتّى تُكتب. */
  densityMissing: boolean;
  /** سائل تُقرأ كثافته أو تعذّرت قراءتها. */
  densityUnread: boolean;
}

export function viewCardLine(line: CardLine): CardLineView {
  const qty = line.qtyText.trim() === '' ? null : parseQty(line.qtyText);
  const qtyOk = qty !== null && qty > 0n;
  const liquid = line.item.baseUnit === 'L';
  const densityUnread = liquid && line.density.status !== 'ready';
  const densityMissing = liquid && !densityUnread && line.item.density === null;
  return {
    line,
    qty,
    qtyOk,
    inBasis: inBasisKind(line.item.kind),
    mass: qtyOk && !densityUnread ? lineMassKg(qty, line.unit, line.item.density) : null,
    densityMissing,
    densityUnread,
  };
}

export interface CardTotals {
  /** مجموع كتلة ما داخل الكتلة بالكيلو: حجم الخلطة وناتجها قبل الهدر (يُرسل أساساً). */
  sum: Milli;
  /** كلّ ما داخل الكتلة معروف الكتلة. */
  known: boolean;
  /** عدد المختار داخل الكتلة. */
  inBasis: number;
}

export function cardTotals(views: readonly CardLineView[]): CardTotals {
  const inside = views.filter((row) => row.inBasis);
  return { sum: inside.reduce((total, row) => total + (row.mass ?? 0n), 0n), known: inside.every((row) => row.mass !== null), inBasis: inside.length };
}

/**
 * المواد المختارة في الصفحة (درس WP5: القراءة من جديد لا تمسحها) مع قراءة كثافة السائل وكتابتها، وما أُضيف من المنتقي (أُنشئ الآن أو
 * صُحّح نوعه) ليبقى بطاقةً قبل أن تُقرأ القائمة من جديد.
 */
export function useCardLines() {
  const [lines, setLines] = useState<readonly CardLine[]>([]);
  const [made, setMade] = useState<readonly MillMaterial[]>([]);

  const patch = (itemId: string, change: (line: CardLine) => CardLine) => setLines((current) => current.map((line) => (line.item.id === itemId ? change(line) : line)));

  const readDensity = (itemId: string) => {
    loadItem(itemId).then(
      (row) =>
        patch(itemId, (line) =>
          row && !row.archived ? { ...line, item: materialOf(row), density: { status: 'ready', row } } : { ...line, density: { status: 'failed', error: null } },
        ),
      (error: unknown) => patch(itemId, (line) => ({ ...line, density: { status: 'failed', error } })),
    );
  };

  /** يختار مادّة (ولا شيء إن كانت مختارة). row: صفّها كاملاً إن جاء من المنتقي، فلا تُقرأ كثافتها ثانية. */
  const add = (item: PickedMaterial, row: ItemRow | null = null): boolean => {
    if (lines.some((line) => line.item.id === item.id)) return false;
    const needsRead = item.baseUnit === 'L' && row === null;
    const picked = row ? materialOf(row) : item;
    setLines((current) =>
      current.some((line) => line.item.id === item.id)
        ? current
        : [
            ...current,
            {
              item: picked,
              qtyText: '',
              unit: picked.baseUnit === 'L' ? 'L' : 'kg',
              density: needsRead ? { status: 'loading' } : { status: 'ready', row },
              densityText: '',
              densityBusy: false,
              densityProblem: null,
            },
          ],
    );
    if (row) setMade((current) => [...current.filter((entry) => entry.id !== row.id), { id: row.id, name: row.name, kind: row.kind, baseUnit: row.baseUnit }]);
    if (needsRead) readDensity(item.id);
    return true;
  };

  const remove = (itemId: string) => setLines((current) => current.filter((line) => line.item.id !== itemId));
  const setQty = (itemId: string, qtyText: string) => patch(itemId, (line) => ({ ...line, qtyText }));
  const setUnit = (itemId: string, unit: RecipeUnit) => patch(itemId, (line) => ({ ...line, unit }));
  const setDensityText = (itemId: string, densityText: string) => patch(itemId, (line) => ({ ...line, densityText, densityProblem: null }));
  const retryDensity = (itemId: string) => {
    patch(itemId, (line) => ({ ...line, density: { status: 'loading' } }));
    readDensity(itemId);
  };

  /**
   * كثافة السائل من بطاقته (تعديل المادّة القائم بشرط نسختها، stores.manage): بعدها يُحسب وزنه. صفر صفوف = تغيّرت المادّة من جهاز آخر،
   * فتُقرأ من جديد ويبقى المكتوب ليُحفظ ثانية.
   */
  const saveDensity = async (itemId: string) => {
    const line = lines.find((entry) => entry.item.id === itemId);
    const value = line ? parseDensity(line.densityText) : null;
    if (!line || value === null || line.densityBusy || line.density.status !== 'ready' || !line.density.row) return;
    const row = line.density.row;
    patch(itemId, (current) => ({ ...current, densityBusy: true, densityProblem: null }));
    try {
      const updated = await updateItem(row.id, row.version, { density_kg_per_l: decimalText(value, 4) });
      patch(itemId, (current) => ({ ...current, item: materialOf(updated), density: { status: 'ready', row: updated }, densityText: '', densityBusy: false }));
    } catch (error) {
      const { title, detail } = describeError(error);
      patch(itemId, (current) => ({ ...current, densityBusy: false, densityProblem: `${title} ${detail}` }));
      if (error instanceof ZeroRowsError) readDensity(itemId);
    }
  };

  const reset = () => setLines([]);

  return { lines, made, add, remove, setQty, setUnit, setDensityText, retryDensity, saveDensity, reset };
}

export type CardLines = ReturnType<typeof useCardLines>;

/** بطاقة مادّة من items_overview مادّةً مختارة: الكثافة تُقرأ للسائل حين يُختار. */
const pickedOf = (material: MillMaterial): PickedMaterial => ({ id: material.id, name: material.name, kind: material.kind, baseUnit: material.baseUnit, density: null });

const SELECTED = 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/15';

/**
 * شبكة بطاقات المواد مع البحث: عمودان بالهاتف وأكثر بالشاشة العريضة. exclude: مواد في الخلطة أصلاً (بطاقة الخلطة) لا تُعرض. onAdded وonRemoved
 * للصفحة (البانية تقرأ سعر المادّة المضافة).
 */
export function MaterialCards({
  id,
  stock,
  picks,
  query,
  onQuery,
  exclude,
  canCreate,
  canFixKind,
  canWriteDensity,
  disabled = false,
  onAdded,
}: {
  id: string;
  stock: MillStock;
  picks: CardLines;
  query: string;
  onQuery: (text: string) => void;
  exclude: ReadonlySet<string>;
  canCreate: boolean;
  canFixKind: boolean;
  /** كتابة الكثافة على البطاقة (تعديل المادّة: stores.manage). */
  canWriteDensity: boolean;
  disabled?: boolean;
  onAdded?: (item: PickedMaterial, created: boolean) => void;
}) {
  const key = searchable(query);
  const byId = new Map(picks.lines.map((line) => [line.item.id, line]));
  const listed = [...(stock.materials ?? [])];
  for (const entry of [...picks.made, ...picks.lines.map((line) => line.item)]) {
    if (!listed.some((material) => material.id === entry.id) && millAdmissible({ archived: false, kind: entry.kind, baseUnit: entry.baseUnit })) {
      listed.push({ id: entry.id, name: entry.name, kind: entry.kind, baseUnit: entry.baseUnit });
    }
  }
  // البحث يصفّي ما لم يُختر، والمختار يبقى ظاهراً بخانة كميته (لا تختفي كمية مكتوبة لأنّ البحث تغيّر).
  const shown = listed.filter((material) => !exclude.has(material.id) && (key === '' || byId.has(material.id) || searchable(material.name).includes(key)));

  const toggle = (material: MillMaterial) => {
    if (disabled) return;
    if (byId.has(material.id)) {
      picks.remove(material.id);
      return;
    }
    const item = pickedOf(material);
    if (picks.add(item)) onAdded?.(item, false);
  };

  return (
    <div className="flex flex-col gap-3">
      <MaterialPicker
        id={`${id}-search`}
        exclude={exclude}
        canCreate={canCreate}
        canFixKind={canFixKind}
        disabled={disabled}
        text={query}
        onText={onQuery}
        listFits={false}
        cardIds={new Set(shown.map((material) => material.id))}
        onPick={(item, created, row) => {
          if (picks.add(item, row)) onAdded?.(item, created);
        }}
      />
      {stock.materials === null ? (
        stock.error ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" data-action="cards-failed">
            <span className="text-danger-700 dark:text-danger-300">{t('mill.cards.failed', 'تعذّرت قراءة المواد.')}</span>
            <Button size="sm" variant="secondary" onClick={stock.retry} data-action="cards-retry">
              {t('common.retry', 'أعد المحاولة')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t('mill.cards.loading', 'جارٍ تحميل المواد…')}</p>
        )
      ) : !listed.length ? (
        <p className="text-sm text-ink-muted" data-action="cards-empty">
          {t('mill.cards.empty', 'لا مواد أوّلية في منشأتك بعد: اكتب اسم المادّة في البحث وأنشئها.')}
        </p>
      ) : null}
      {shown.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-action="material-cards">
          {shown.map((material) => {
            const line = byId.get(material.id);
            return (
              <li key={material.id} className={`flex flex-col gap-2 rounded-2xl border p-3 ${line ? SELECTED : 'border-line'}`}>
                <button
                  type="button"
                  className="flex flex-col items-start gap-1 text-start"
                  aria-pressed={line !== undefined}
                  disabled={disabled}
                  onClick={() => toggle(material)}
                  data-action="material-card"
                  data-item={material.id}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="min-w-0 font-semibold">{material.name}</span>
                    {line ? (
                      <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-brand-700 dark:text-brand-200" />
                    ) : (
                      <Plus aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                    )}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {inBasisKind(material.kind)
                      ? t('mill.cards.meta', '{kind} · {unit}', { kind: itemKindLabel(material.kind), unit: unitWord(material.baseUnit) })
                      : t('mill.cards.meta_out', '{kind} · {unit} · خارج الكتلة', { kind: itemKindLabel(material.kind), unit: unitWord(material.baseUnit) })}
                  </span>
                  <OnHandNote entry={stock.onHand?.get(material.id)} />
                </button>
                {line ? <CardQty id={id} line={line} picks={picks} disabled={disabled} canWriteDensity={canWriteDensity} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** خانة كمية البطاقة المختارة ووحدتها، وتحتها وزنها بالكيلو للسائل، أو ما ينقص لحسابه (الكثافة). */
function CardQty({ id, line, picks, disabled, canWriteDensity }: { id: string; line: CardLine; picks: CardLines; disabled: boolean; canWriteDensity: boolean }) {
  const view = viewCardLine(line);
  const name = line.item.name;
  const liquid = line.item.baseUnit === 'L';
  const densityValue = line.densityText.trim() === '' ? null : parseDensity(line.densityText);
  return (
    <div className="flex flex-col gap-1.5">
      {/* بعرض 390 البطاقة نحو 150 بكسل: الخانة تنكمش (min-w-0 وsize) والوحدة تحتها للسائل، فلا تفيض. */}
      <span className="flex items-center gap-2">
        <input
          id={`${id}-qty-${line.item.id}`}
          aria-label={t('mill.builder.qty_of', 'كمية «{name}»', { name })}
          className="input min-w-0 text-end tabular-nums"
          size={6}
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          placeholder={t('mill.cards.qty_placeholder', 'الكمية')}
          value={line.qtyText}
          disabled={disabled}
          aria-invalid={(line.qtyText.trim() !== '' && !view.qtyOk) || undefined}
          onChange={(event) => picks.setQty(line.item.id, event.target.value)}
          data-action="card-qty"
        />
        {liquid ? null : <span className="shrink-0 text-sm text-ink-muted">{t('unit.kg', 'كغم')}</span>}
      </span>
      {liquid ? (
        <select
          aria-label={t('mill.builder.unit_of', 'وحدة «{name}»', { name })}
          className="input"
          value={line.unit}
          disabled={disabled}
          onChange={(event) => picks.setUnit(line.item.id, event.target.value === 'L' ? 'L' : 'kg')}
          data-action="card-unit"
        >
          <option value="L">{t('unit.L', 'لتر')}</option>
          <option value="kg">{t('unit.kg', 'كغم')}</option>
        </select>
      ) : null}
      {line.qtyText.trim() !== '' && !view.qtyOk ? (
        <span role="alert" className="text-xs text-danger-700 dark:text-danger-300">
          {t('mill.line.qty_bad', 'اكتب كمية أكبر من صفر.')}
        </span>
      ) : null}
      {liquid && line.density.status === 'loading' ? <span className="text-xs text-ink-muted">{t('mill.cards.density_loading', 'تُقرأ كثافته…')}</span> : null}
      {liquid && line.density.status === 'failed' ? (
        <span className="flex flex-wrap items-center gap-2 text-xs" data-action="card-density-failed">
          <span className="text-danger-700 dark:text-danger-300">{t('mill.cards.density_failed', 'تعذّرت قراءة كثافته فلا يُحسب وزنه.')}</span>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => picks.retryDensity(line.item.id)} data-action="card-density-retry">
            {t('mill.cards.density_retry', 'أعد القراءة')}
          </Button>
        </span>
      ) : null}
      {view.densityMissing ? (
        <div className="flex flex-col gap-1.5" data-action="card-density">
          <span className="text-xs font-medium text-danger-700 dark:text-danger-300">
            {canWriteDensity
              ? t('mill.cards.density_missing', '«{name}» سائل بلا كثافة، فلا يُحسب وزنه: اكتب كثافته هنا.', { name })
              : t('mill.cards.density_missing_others', '«{name}» سائل بلا كثافة، فلا يُحسب وزنه: يكتبها المالك أو المدير من «المواد».', { name })}
          </span>
          {canWriteDensity ? (
            <span className="flex flex-wrap items-center gap-2">
              <input
                aria-label={t('mill.cards.density_of', 'كثافة «{name}» (كغم لكلّ لتر)', { name })}
                className="input min-w-0 text-end tabular-nums"
                size={6}
                inputMode="decimal"
                dir="ltr"
                autoComplete="off"
                placeholder={t('mill.cards.density_placeholder', 'كغم/لتر')}
                value={line.densityText}
                disabled={disabled || line.densityBusy}
                aria-invalid={(line.densityText.trim() !== '' && densityValue === null) || undefined}
                onChange={(event) => picks.setDensityText(line.item.id, event.target.value)}
                data-action="card-density-text"
              />
              <Button
                size="sm"
                variant="secondary"
                busy={line.densityBusy}
                disabled={disabled || densityValue === null}
                onClick={() => void picks.saveDensity(line.item.id)}
                data-action="card-density-save"
              >
                {t('common.save', 'حفظ')}
              </Button>
            </span>
          ) : null}
          {line.densityProblem ? (
            <span role="alert" className="text-xs text-danger-700 dark:text-danger-300">
              {line.densityProblem}
            </span>
          ) : null}
        </div>
      ) : null}
      {liquid && line.unit === 'L' && view.mass !== null ? (
        <span className="text-xs text-ink-muted" data-action="card-mass">
          {t('mill.cards.mass', 'أي {kg}', { kg: kgText(view.mass) })}
        </span>
      ) : null}
    </div>
  );
}

/**
 * سطرا المجموع تحت البطاقات: «مجموع الخلطة» و«الناتج المتوقّع» بالكيلوغرام، أو ما يمنع حسابه. الناتج قبل الهدر = مجموع ما داخل الكتلة
 * (الإنتاج يحسبه هكذا: الوزن الفارغ = كتلة المواد).
 */
export function CardSums({ totals, lines }: { totals: CardTotals; lines: number }) {
  if (!lines || !totals.inBasis) {
    return (
      <p className="text-sm font-medium" data-action="builder-sum">
        {lines
          ? t('mill.cards.sum_outside', 'مجموع الخلطة: 0 كغم — الوقود والتعبئة خارج الكتلة؛ اختر مادّة تدخلها.')
          : t('mill.cards.sum_none', 'مجموع الخلطة: 0 كغم — اختر المواد من البطاقات واكتب كمياتها.')}
      </p>
    );
  }
  if (!totals.known) {
    return (
      <p className="text-sm font-medium" data-action="builder-sum">
        {t('mill.cards.sum_unknown', 'مجموع الخلطة لا يُحسب بعد: اكتب كمية كلّ مادّة مختارة، وكثافة كلّ سائل بلا كثافة.')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-lg font-semibold" data-action="builder-sum">
        {t('mill.cards.sum', 'مجموع الخلطة: {kg}', { kg: kgText(totals.sum) })}
      </p>
      <p className="text-sm text-ink-muted" data-action="builder-output">
        {t('mill.cards.output', 'الناتج المتوقّع: {kg} (قبل الهدر)', { kg: kgText(totals.sum) })}
      </p>
    </div>
  );
}
