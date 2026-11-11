import { ArrowDown, ArrowUp, ArrowUpDown, ChefHat, Factory, Plus, Warehouse } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { can } from '../../domain/permissions';
import { describeError, RejectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadMill, setRecipeOrder, type MillHome, type RecipeCard } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { kgText } from './cards';
import { Chip, CompositionBar, dash, moveId, PALETTE, recipeColor, reconcileOrder, sameOrder } from './shared';

// شاشة معمل العلف (0015، كلمة المالك 2026-11-03): الخلطات بطاقاتٍ ملوّنة، كلّ واحدة تُقرأ بلمحة (شريط التركيبة ورقاقات
// موادّها)، وزرّ «أنتج» كبير عليها؛ وتحتها دفعات قيد العمل وآخر الدفعات بجدول كلاسيكي. الكلفة تظهر لأدوار الكلفة فقط
// (الخادم يحذف money عن غيرهم)، فالبطاقة تعمل كاملةً لمشغّل المعمل بلا أرقام مال.
// النسخة الثانية (كلمة المالك 2026-11-04): لون كلّ خلطة من معرّفها بلا حدّ، وأرقام الإنتاج على البطاقة (آخر إنتاج وكميته
// وكلفة كيلوه الفعلية، أو المتوقّعة قبل أوّل إنتاج، وعدد الدفعات)، و«خلطة جديدة» تفتح البانية بشاشة واحدة، و«أنتج» بكميات
// سريعة («احدد الكميات الي اريد اسويها بكل مرة»).
// الجولة الثانية (ب٨): شريط التركيبة ورقاقاته يستثنيان الوقود والتعبئة (in_basis من لقطة سطر الخلطة)، كبطاقة الخلطة والبانية.
// الجولة الثالثة (ب٢٧): نافذة «أنتج» تعرض رفض item_changed بجملة الخادم كما هي (تغيّرت وحدة مادّة بعد تفعيل الخلطة).
// الجولة الرابعة (ب٣١): قطعة بكتلة لا تُعرف (null من القارئ) رقاقتها «—» والشريط يتخطّاها.
// «ترتيب معمل العلف» (0023، كلمة المالك 2026-11-10: «ينشئ كل انواع العلايق الي يريدها ويرتبها مثل ما هو يريد»): المالك والمدير يرتّبان العلائق
// («رتّب العلائق» ثمّ «احفظ الترتيب»: set_recipe_order بشرط الترتيب الذي عرضته الشاشة، وrecipes_changed يُقال بتلميحه ويُقرأ المعمل من جديد ويبقى ترتيب
// المستخدم ليُحفظ ثانيةً، كـ«أدرج مواد» في الرصيد اليومي)؛ و«أنتج» يفتح شاشة الإنتاج الواحدة (/mill/produce/:id) بدل النافذة.

export function RecipeCardView({ recipe, canProduce, onProduce }: { recipe: RecipeCard; canProduce: boolean; onProduce: () => void }) {
  const color = recipeColor(recipe.id);
  const basis = recipe.activeBasisKg ?? 0n;
  const last = recipe.lastBatch;
  // ما داخل كتلة الخلطة وحده (ب٨): الوقود والتعبئة يُسحبان ولا يدخلان الأساس، فلا قطعة لهما في الشريط ولا رقاقة. ولون كلّ قطعة بموضعها (0025).
  const pieces = recipe.pieces.filter((piece) => piece.inBasis).map((piece, slot) => ({ ...piece, slot }));
  // الخلطة بلا كميات (0025): الشريط من آخر دفعة مرحَّلة بكتلها (مجموعها مقامه)، وبلا دفعة أسماء الموادّ وحدها بلا شريط.
  const total = recipe.materialsOnly ? pieces.reduce((sum, piece) => sum + (piece.weight ?? 0n), 0n) : basis;
  const fromLast = recipe.materialsOnly && recipe.piecesSource === 'last_batch';
  // اللوحة خمسة ألوان بالموضع، وما بعدها قطعة رمادية واحدة «أخرى» في الشريط ورقاقة واحدة هنا.
  const named = pieces.slice(0, PALETTE.length);
  const others = pieces.length - named.length;
  return (
    <article className="card animate-fade-in overflow-hidden rounded-3xl p-0">
      <div className="h-2" style={{ background: color.solid }} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4" style={{ background: color.soft }}>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: color.solid }} aria-hidden="true">
            <ChefHat className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold">
              <Link to={`/mill/recipe/${recipe.id}`} className="hover:underline" data-action="open-recipe">
                {recipe.name}
              </Link>
            </h3>
            <p className="truncate text-sm text-ink-muted">{t('mill.card.output', 'تنتج: {item}', { item: recipe.outputItem.name })}</p>
          </div>
        </div>
        {recipe.activeId ? (
          <>
            <CompositionBar pieces={pieces} total={total} />
            {fromLast ? (
              <p className="text-xs text-ink-muted" data-action="pieces-source">
                {t('mill.card.from_last', 'التركيبة من آخر إنتاج')}
              </p>
            ) : null}
            {/* دليل الشريط: رقاقة بنقطة لونها لكلّ مادّة لها لون في اللوحة، وما بعدها رقاقة «أخرى» بنقطة رمادية كقطعتها في الشريط. */}
            <div className="flex flex-wrap gap-1.5" data-action="recipe-chips">
              {named.map((piece) => (
                <Chip key={piece.key} slot={piece.slot}>
                  <span className="truncate">{piece.label}</span>
                  {/* كتلة لا تُعرف (ق٤٢، ب٣١): «—» لا صفر، والشريط يتخطّى قطعتها. والخلطة بلا كميات قبل أوّل إنتاج: أسماء الموادّ وحدها. */}
                  {/* «600 كغم» عبارة عربية لا رقم معزول: داخل bdi ltr كانت تُقرأ «كغم 600» (فحص Chromium لشاشات 0025). */}
                  {recipe.materialsOnly && !fromLast ? null : <span>{piece.weight === null ? dash() : fmtQty(piece.weight, 'kg').main}</span>}
                </Chip>
              ))}
              {others > 0 ? (
                <Chip slot={PALETTE.length}>
                  <span title={pieces.slice(PALETTE.length).map((piece) => piece.label).join(t('list.separator', '، '))}>{t('mill.card.more', 'و{count} أخرى', { count: fmtInt(others) })}</span>
                </Chip>
              ) : null}
            </div>
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-action="recipe-numbers">
              {recipe.materialsOnly ? null : (
                <div className="flex items-center gap-1">
                  <dt className="text-ink-muted">{t('mill.card.total', 'مجموع الخلطة')}</dt>
                  <dd className="font-medium">
                    {fmtQty(basis, 'kg').sub ?? fmtQty(basis, 'kg').main}
                  </dd>
                </div>
              )}
              <div className="flex items-center gap-1">
                <dt className="text-ink-muted">{t('mill.card.batches', 'الدفعات المنتَجة')}</dt>
                <dd className="font-medium">
                  <Num>{fmtInt(recipe.batches)}</Num>
                </dd>
              </div>
              {last ? (
                <div className="flex items-center gap-1">
                  <dt className="text-ink-muted">{t('mill.card.last', 'آخر إنتاج')}</dt>
                  <dd className="font-medium">
                    <Link to={`/mill/batch/${last.id}`} className="hover:underline" data-action="open-last-batch">
                      {t('mill.card.last_value', '{day} · {qty}', { day: fmtDay(last.producedOn), qty: kgText(last.outputQtyKg) })}
                    </Link>
                  </dd>
                </div>
              ) : null}
              {last && last.costPerKg !== null ? (
                <div className="flex items-center gap-1">
                  <dt className="text-ink-muted">{t('mill.card.cost', 'كلفة الكيلو الفعلية')}</dt>
                  <dd className="font-medium">
                    <Num>{fmtMoney(last.costPerKg)}</Num>
                  </dd>
                </div>
              ) : null}
              {!last && recipe.expectedCostPerKg !== null ? (
                <div className="flex items-center gap-1">
                  <dt className="text-ink-muted">{t('mill.card.expected', 'كلفة الكيلو المتوقّعة')}</dt>
                  <dd className="font-medium">
                    <Num>{fmtMoney(recipe.expectedCostPerKg)}</Num>
                  </dd>
                </div>
              ) : null}
            </dl>
            {!last ? <p className="text-sm text-ink-muted">{t('mill.card.never', 'لم تُنتَج بعد.')}</p> : null}
            {canProduce ? (
              <Button size="lg" icon={<Factory className="size-5" aria-hidden="true" />} onClick={onProduce} data-action="produce">
                {t('mill.card.produce', 'أنتج')}
              </Button>
            ) : null}
          </>
        ) : (
          <Notice tone="info" title={t('mill.card.no_active', 'هذه الخلطة بلا نسخة مفعَّلة.')}>{t('mill.card.no_active_detail', 'افتحها وأكمل موادّها ثم فعّلها لتُنتج بها.')}</Notice>
        )}
      </div>
    </article>
  );
}

/**
 * «رتّب العلائق»: ترتيب المستخدم (ids)، والترتيب الذي عرضته الشاشة شرطاً للحفظ (basis، p_expected)؛ وبعد recipes_changed عدد القراءات لحظة
 * الرفض (changedAt) وتلميح الخادم (changed)، فأوّل قراءة ناجحة بعده تصير الشرط ويبقى ترتيب المستخدم.
 */
interface Arrangement {
  ids: readonly string[];
  basis: readonly string[];
  changedAt: number | null;
  changed: string | null;
}

/** رفضٌ يعني أنّ قائمة العلائق تغيّرت بعد القراءة: تُقرأ من جديد ويبقى ترتيب المستخدم (عليقة حُذفت: recipe_not_found). */
const LIST_CHANGED = new Set(['recipes_changed', 'recipe_not_found']);

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

/** بطاقة العليقة في «رتّب العلائق»: رقمها في الترتيب واسمها ومنتجها وسهما «قدّم» و«أخّر». */
function ArrangeCard({ recipe, index, count, disabled, onMove }: { recipe: RecipeCard; index: number; count: number; disabled: boolean; onMove: (by: -1 | 1) => void }) {
  const color = recipeColor(recipe.id);
  return (
    <article className="card flex items-center gap-3 rounded-3xl p-3" data-action="arrange-card" data-id={recipe.id}>
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl font-semibold text-white" style={{ background: color.solid }} aria-hidden="true">
        {fmtInt(index + 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{recipe.name}</span>
        <span className="block truncate text-sm text-ink-muted">{t('mill.card.output', 'تنتج: {item}', { item: recipe.outputItem.name })}</span>
      </span>
      <IconButton
        label={t('mill.order.up', 'قدّم «{name}»', { name: recipe.name })}
        className="disabled:opacity-50"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        data-action="recipe-up"
        data-id={recipe.id}
      >
        <ArrowUp aria-hidden="true" className="size-5" />
      </IconButton>
      <IconButton
        label={t('mill.order.down', 'أخّر «{name}»', { name: recipe.name })}
        className="disabled:opacity-50"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
        data-action="recipe-down"
        data-id={recipe.id}
      >
        <ArrowDown aria-hidden="true" className="size-5" />
      </IconButton>
    </article>
  );
}

export default function MillPage() {
  const session = useSession();
  const navigate = useNavigate();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const canRecipe = role !== null && can(role, 'recipe.activate');
  const canDraft = role !== null && can(role, 'production.draft');
  const load = useCallback(() => loadMill(), []);
  const state = useLoad<MillHome>(load);
  // آخر قراءة ناجحة تبقى مرسومة أثناء القراءة من جديد (بعد حفظ الترتيب أو رفضه)، وreads عدد القراءات الناجحة: الترتيب المرفوض يعرف به أنّ ما يعرضه
  // قُرئ بعد الرفض (لا قراءة قديمة جارية).
  const [kept, setKept] = useState<{ data: MillHome; reads: number } | null>(null);
  if (state.data !== null && (kept === null || kept.data !== state.data)) setKept({ data: state.data, reads: (kept?.reads ?? 0) + 1 });
  const data = state.data ?? kept?.data ?? null;
  const reads = kept?.reads ?? 0;
  const refreshing = state.loading && data !== null;
  const [arranging, setArranging] = useState<Arrangement | null>(null);
  const [arrangeBusy, setArrangeBusy] = useState(false);
  const [arrangeFailure, setArrangeFailure] = useState<string | null>(null);

  // الخلطة المحذوفة (المؤرشفة، كلمة المالك 2026-11-09) لا تظهر في المعمل؛ صفحتها باقية برابطها لتُعاد منها. والترتيب ترتيب الخادم (position ثمّ الاسم).
  const recipes = useMemo(() => data?.recipes.filter((recipe) => !recipe.archived) ?? [], [data]);
  const liveIds = useMemo(() => recipes.map((recipe) => recipe.id), [recipes]);
  // بعد recipes_changed: أوّل قراءة ناجحة تصير شرط الحفظ، وترتيب المستخدم يبقى (ما حُذف يخرج وما أُضيف في آخره). ضبط حالة من حالة أثناء الرسم
  // بشرط يتوقّف (changedAt يصير null).
  if (arranging !== null && arranging.changedAt !== null && reads > arranging.changedAt) {
    setArranging({ ...arranging, ids: reconcileOrder(arranging.ids, liveIds), basis: liveIds, changedAt: null });
  }
  const rows = useMemo(() => data?.productions.rows ?? [], [data]);
  const costShown = rows.some((row) => row.costPerKg !== null);
  const qtyDecimals = useMemo(() => columnDecimals(rows.map((row) => row.outputQtyKg), 3) as 0 | 1 | 2 | 3, [rows]);
  const columns = useMemo<Column<(typeof rows)[number]>[]>(() => {
    const base: Column<(typeof rows)[number]>[] = [
      { key: 'day', header: t('mill.col.day', 'التاريخ'), cell: (row) => fmtDay(row.producedOn) },
      {
        key: 'doc',
        header: t('mill.col.doc', 'المستند'),
        cell: (row) => (
          <Link to={`/mill/batch/${row.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-batch">
            <Num>{row.docNo ?? dash()}</Num>
          </Link>
        ),
      },
      { key: 'recipe', header: t('mill.col.recipe', 'الخلطة'), wrap: true, cell: (row) => row.recipeName },
      { key: 'item', header: t('mill.col.item', 'الناتج'), wrap: true, cell: (row) => row.outputItemName },
      { key: 'qty', header: t('mill.col.qty', 'الكمية (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.outputQtyKg, qtyDecimals)}</Num> },
      { key: 'status', header: t('mill.col.status', 'الحالة'), cell: (row) => (row.status === 'void' ? t('mill.status.void', 'ملغاة') : t('mill.status.posted', 'مرحَّلة')) },
    ];
    if (!costShown) return base;
    return [
      ...base,
      { key: 'cost', header: t('mill.col.cost', 'كلفة الكيلو'), kind: 'number', cell: (row) => <Num>{row.costPerKg === null ? dash() : fmtMoney(row.costPerKg)}</Num> },
      { key: 'total', header: t('mill.col.total', 'كلفة الدفعة'), kind: 'number', cell: (row) => <Num>{row.totalValue === null ? dash() : fmtMoney(row.totalValue)}</Num> },
    ];
  }, [costShown, qtyDecimals]);

  // فشل القراءة الأولى يطوي الصفحة (LoadFailed)؛ وفشل قراءة من جديد بعد ما رُسمت يُقال فوقها بزرّ «أعد القراءة» ويبقى الترتيب المكتوب.
  if (state.error && !data) return <LoadFailed what={t('nav.mill', 'معمل العلف')} error={state.error} onRetry={state.retry} />;

  const newRecipe = () => navigate('/mill/new');
  const waiting = arranging !== null && arranging.changedAt !== null;
  const rereadFailed = !state.loading && state.error !== null;
  const arrangeLocked = arrangeBusy || refreshing || waiting;
  const arranged = arranging ? arranging.ids.flatMap((id) => recipes.filter((recipe) => recipe.id === id)) : [];
  const arrangeDirty = arranging !== null && !sameOrder(arranging.ids, arranging.basis);

  const startArranging = () => {
    setArrangeFailure(null);
    setArranging({ ids: liveIds, basis: liveIds, changedAt: null, changed: null });
  };
  const moveRecipe = (index: number, by: -1 | 1) => setArranging((current) => (current ? { ...current, ids: moveId(current.ids, index, by) } : current));
  /** «احفظ الترتيب»: كلّ العلائق الظاهرة بالترتيب الجديد، بشرط الترتيب الذي عرضته الشاشة. */
  const saveArrangement = async () => {
    if (!arranging || arrangeLocked || !arrangeDirty) return;
    const sent = arranging;
    setArrangeBusy(true);
    setArrangeFailure(null);
    try {
      await setRecipeOrder(sent.ids, sent.basis);
      setArranging(null);
      toast({ tone: 'success', title: t('mill.order.saved', 'حُفظ ترتيب العلائق.') });
      state.retry();
    } catch (problem) {
      if (problem instanceof RejectedError && LIST_CHANGED.has(problem.code)) {
        // الترتيب باقٍ، والمعمل يُقرأ من جديد فيصير الحفظ التالي على ما صار فيه.
        setArranging((current) => (current ? { ...current, changed: failureText(problem), changedAt: reads } : current));
        state.retry();
      } else {
        setArrangeFailure(failureText(problem));
      }
    } finally {
      setArrangeBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('nav.mill', 'معمل العلف')}
        subtitle={t('mill.subtitle_v4', 'خلطاتك بموادّها: اضغط «أنتج» واكتب كمية كلّ مادّة، فيدخل العلف «رصيد العلف».')}
        actions={
          canRecipe ? (
            <Button variant="secondary" icon={<Plus className="size-5" aria-hidden="true" />} onClick={newRecipe} data-action="add-recipe">
              {t('mill.add_recipe', 'خلطة جديدة')}
            </Button>
          ) : undefined
        }
      />

      <Link to="/inventory/mill" className="card flex items-center gap-2 p-4 font-medium text-brand-700 hover:bg-surface-2 dark:text-brand-200" data-action="open-division-stores">
        <Warehouse aria-hidden="true" className="size-5" />
        {t('mill.stores_v4', 'مخازن المعمل: المواد الأوّلية و«رصيد العلف»')}
      </Link>

      {!data && !state.error ? <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p> : null}
      {data && state.error && !waiting ? (
        <Notice
          tone="warning"
          title={t('mill.reread_failed', 'تعذّرت قراءة المعمل من جديد، والمعروض آخر ما قُرئ.')}
          action={
            <Button size="sm" variant="secondary" onClick={state.retry} data-action="mill-reread">
              {t('common.retry', 'أعد المحاولة')}
            </Button>
          }
        />
      ) : null}

      {data?.productions.drafts.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('mill.drafts.title', 'دفعات قيد العمل')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.productions.drafts.map((draft) => (
              <li key={draft.id}>
                <Link to={`/mill/batch/${draft.id}`} className="card flex items-center justify-between gap-3 p-4 hover:bg-surface-2" data-action="open-draft">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{draft.recipeName}</span>
                    <span className="block truncate text-sm text-ink-muted">{t('mill.drafts.planned', 'المخطّط: {qty}', { qty: fmtQty(draft.plannedKg, 'kg').main })}</span>
                  </span>
                  <span className="shrink-0 text-sm text-ink-muted">{fmtDay(draft.producedOn)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data && !recipes.length ? (
        <Notice
          tone="info"
          title={t('mill.empty.title', 'لا توجد خلطة بعد.')}
          action={
            canRecipe ? (
              <Button icon={<Plus className="size-5" aria-hidden="true" />} onClick={newRecipe} data-action="first-recipe">
                {t('mill.empty.action', 'أنشئ أوّل خلطة')}
              </Button>
            ) : undefined
          }
        >
          {t('mill.empty.detail_v4', 'الخلطة موادّ تختارها مرّة واحدة وتعطي مادّة علف واحدة، والكميات تكتبها عند كلّ إنتاج. أنشئ خلطة واختر موادّها.')}
        </Notice>
      ) : null}

      {recipes.length && arranging ? (
        <section className="flex flex-col gap-3" data-action="arranging">
          <h2 className="text-lg font-semibold">{t('mill.order.title', 'رتّب العلائق')}</h2>
          <p className="text-sm text-ink-muted">{t('mill.order.hint', 'قدّم العليقة أو أخّرها بالسهمين، ثمّ «احفظ الترتيب»: بهذا الترتيب تظهر في المعمل.')}</p>
          {arranging.changed ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="text-sm text-warn-700 dark:text-warn-300" data-action="arrange-changed">
                {arranging.changed}{' '}
                {waiting
                  ? rereadFailed
                    ? t('mill.order.changed.failed', 'وتعذّرت قراءة العلائق من جديد. أعد القراءة، ثمّ احفظ ترتيبك إن شئت.')
                    : t('mill.order.changed.reading', 'جارٍ قراءة العلائق من جديد…')
                  : t('mill.order.changed.kept', 'قُرئت العلائق من جديد، وترتيبك باقٍ: احفظه ليحلّ محلّ الترتيب الحالي، أو تراجع.')}
              </p>
              {waiting && rereadFailed ? (
                <Button size="sm" variant="secondary" onClick={state.retry} data-action="arrange-reread">
                  {t('dayb.reread', 'أعد القراءة')}
                </Button>
              ) : null}
            </div>
          ) : null}
          <ol className="flex flex-col gap-2" data-action="arrange-list">
            {arranged.map((recipe, index) => (
              <li key={recipe.id}>
                <ArrangeCard recipe={recipe} index={index} count={arranged.length} disabled={arrangeLocked} onMove={(by) => moveRecipe(index, by)} />
              </li>
            ))}
          </ol>
          {arrangeFailure ? <Notice tone="danger" title={arrangeFailure} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button busy={arrangeBusy} disabled={arrangeLocked || !arrangeDirty} onClick={() => void saveArrangement()} data-action="save-arrangement">
              {t('mill.order.save', 'احفظ الترتيب')}
            </Button>
            <Button
              variant="secondary"
              disabled={arrangeBusy}
              onClick={() => {
                setArranging(null);
                setArrangeFailure(null);
              }}
              data-action="cancel-arrangement"
            >
              {t('mill.order.cancel', 'تراجع')}
            </Button>
          </div>
        </section>
      ) : null}

      {recipes.length && !arranging ? (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t('mill.recipes.title', 'الخلطات')}</h2>
            {canRecipe && recipes.length > 1 ? (
              <Button size="sm" variant="secondary" icon={<ArrowUpDown className="size-4" aria-hidden="true" />} disabled={refreshing} onClick={startArranging} data-action="arrange-recipes">
                {t('mill.order.start', 'رتّب العلائق')}
              </Button>
            ) : null}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <RecipeCardView recipe={recipe} canProduce={canDraft && recipe.activeId !== null} onProduce={() => navigate(`/mill/produce/${recipe.id}`)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('mill.batches.title', 'آخر الدفعات')}</h2>
          <DataTable caption={t('mill.batches.caption', 'دفعات الإنتاج المرحَّلة والملغاة')} columns={columns} rows={rows} rowKey={(row) => row.id} empty={t('mill.batches.empty', 'لا دفعات بعد.')} />
        </section>
      ) : null}
    </div>
  );
}
