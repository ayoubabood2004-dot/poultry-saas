import { ArrowDown, ArrowUp, CheckCircle2, Factory, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button, IconButton } from '../../components/ui/Button';
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
import { ITEM_KINDS, type ItemKind } from '../../domain/stores';
import { describeError, RejectedError, ZeroRowsError } from '../../lib/errors';
import { fmtInt, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import {
  activateVersion,
  addRecipeLine,
  addRecipeRate,
  archiveRecipe,
  clearRecipeLineQty,
  deleteRecipeLine,
  deleteRecipeRate,
  loadRecipe,
  newRecipeVersion,
  setRecipeLineOrder,
  setRecipeRate,
  type CategoryOption,
  type RecipeDetail,
  type RecipeLine,
  type RecipeRate,
} from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { itemKindLabel } from '../../lib/storeLabels';
import { MaterialCards, useCardLines, useMillStock, viewCardLine, type CardLines, type MillStock } from './cards';
import { CellEdit, NewCategoryField, NO_CATEGORY_DRAFT, onHandText, useDrafts, type CategoryDraft } from './pickers';
import { RecipeHistorySection } from './RecipeHistory';
import { Chip, dash, forgetMillRef, MaterialName, millRef, moveId, reconcileOrder, sameOrder, slotsOf, useKeptLoad } from './shared';

// بطاقة الخلطة (0015): نسخها وموادّها بجدول كلاسيكي. النسخة المسوّدة تُعدَّل وتُفعَّل؛ والمفعَّلة مجمَّدة، فالتعديل نسخة جديدة (التاريخ لا يُعاد
// كتابته). و«تكاليف لكلّ طنّ» بفئة مصروف (0016، تُكتب في المسوّدة لأدوار الكلفة)، وفئة المصروف تُضاف من مكانها (م٣)، و«نسخة جديدة» تنسخ المفعَّلة
// بسطورها وتكاليفها (new_recipe_version، م٧)، و«أنتج» للنسخة المفعَّلة (م٩)، والوقود والتعبئة «خارج الكتلة» (in_basis، م١١)؛ ورفض «تغيّر من جهاز
// آخر» يقرأ الخلطة من جديد ويبقي المكتوب مشروطاً بالمقروء الجديد (ب٤٢)؛ والصفحة تبقى مرسومة أثناء القراءة والأفعال معطَّلة (ب٤٣)؛ و«نسخة جديدة» تقول
// المواد التي لم تُنسخ (ب٤٨)؛ ورابط الكثافة يصل إلى «المواد» ويرجع إلى المسوّدة نفسها (ب٦١). و«ترتيب معمل العلف» (0023): السطور بترتيب line_no،
// وفي «عدّل الخلطة» سهما «قدّم» و«أخّر» ثمّ «احفظ ترتيب المواد» (set_recipe_line_order بشرط ما عرضته الشاشة، وlines_changed يُقال ويبقى ترتيب
// المستخدم)، والترتيب الذي لم يُحفظ يقفل بقيّة تعديلات السطور والتفعيل؛ و«أنتج» يفتح شاشة الإنتاج الواحدة.
// «الخلطة موادّ بلا كميات» (0025، كلمة المالك 2026-11-10: «اني بس احدد شنو المواد الي اريدها من دون ما احدد كميات… واحدد هل راح اعدل على هاي
// الخلطة لو لا… كلنا نشوف تاريخ كل تعديل»): الجدول # | المادّة (بنقطة لونها) | النوع | داخل الكتلة، بلا كمية ولا حصّة ولا أساس ولا مجموع ولا كلفة طنّ
// متوقّعة. «عدّل الخلطة» مسوّدة بلا كميات (new_recipe_version) تُضاف إليها الموادّ وتُحذف وتُرتَّب ثمّ «فعّل»؛ ومسوّدة قديمة كُتبت بكميات قبل 0025 تُمحى
// كمياتها بزرّ (مسوّدة تجمع الحالين لا تُفعَّل: mixed_quantities). وتحت ذلك «السجلّ» (recipe_history): كلّ تعديل وكلّ إنتاج في المدّة، ويُطبع وحده.

/** اسم نوع المادّة بالعربية من رمز القارئ، و«—» لرمز لا يُعرف (لا يُعرض رمز خام). */
const kindText = (kind: string): string => ((ITEM_KINDS as readonly string[]).includes(kind) ? itemKindLabel(kind as ItemKind) : dash());

/** رفض «تغيّر من نافذة أو جهاز آخر» في بطاقة الخلطة (ب٤٢): الصفحة تُقرأ من جديد. */
const CHANGED_ELSEWHERE = new Set(['amount_changed', 'stale_draft', 'mixed_quantities']);
// والكتابة المشروطة بنسخة المسوّدة ترجع بصفر صفوف إن تغيّرت (ZeroRowsError): المخرج نفسه.
const changedElsewhere = (problem: unknown): boolean => (problem instanceof RejectedError && CHANGED_ELSEWHERE.has(problem.code)) || problem instanceof ZeroRowsError;

/**
 * رفض «تغيّر من جهاز آخر» ينتظر قراءته الجديدة (ب٤٢): seen ما كان معروضاً لحظة الرفض (القراءة الجديدة غيره)، وcell الخانة المرفوضة (مبلغ
 * تكلفة لكلّ طنّ) أو null لرفض الخلطة كلّها، وrebased بعد أن صار شرط الخانة المقروء الجديد.
 */
interface Conflict {
  seen: RecipeDetail;
  cell: { kind: 'rate'; id: string } | null;
  rebased: boolean;
}

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

/**
 * «أضف مواد» بالبطاقات (كلمة المالك 2026-11-07): أكثر من مادّة معاً بلا كميات (0025)، والمختار وما كُتب في الصفحة (picks وquery من RecipePage، درس WP5).
 * المواد المكتوبة في المسوّدة لا تُعرض (exclude)، وما وصل منها بمحاولة ضاع جوابها يُسقط من الإرسال بعد القراءة من جديد.
 */
function AddMaterialsDialog({
  recipe,
  stock,
  picks,
  query,
  onQuery,
  canCreate,
  canFixKind,
  canWriteDensity,
  busy,
  failure,
  onClose,
  onSave,
}: {
  recipe: RecipeDetail;
  stock: MillStock;
  picks: CardLines;
  query: string;
  onQuery: (text: string) => void;
  canCreate: boolean;
  canFixKind: boolean;
  canWriteDensity: boolean;
  busy: boolean;
  failure: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const cardsId = useId();
  const inRecipe = useMemo(() => new Set(recipe.lines.map((line) => line.itemId)), [recipe.lines]);
  const views = picks.lines.filter((line) => !inRecipe.has(line.item.id)).map(viewCardLine);
  const ready = views.length > 0 && views.every((row) => !row.densityMissing && !row.densityUnread);
  // ما يمنع «أضف المختار» مكتوب تحته (مراجعة الشاشات M4)، كالبانية: لا زرّ معطّل بلا سبب.
  const missing: string[] = [];
  for (const row of views) {
    const name = row.line.item.name;
    if (row.densityMissing) missing.push(t('mill.builder.need_density_v4', '«{name}» سائل بلا كثافة: اكتب كثافته على بطاقته.', { name }));
    else if (row.densityUnread) missing.push(t('mill.builder.density_unread', 'كثافة «{name}» لم تُقرأ بعد: انتظر لحظة أو أعد قراءتها من بطاقته.', { name }));
  }
  return (
    <Dialog
      open
      size="wide"
      onClose={onClose}
      locked={busy}
      dirty={views.length > 0}
      title={t('mill.add.title', 'أضف مواد إلى «{name}»', { name: recipe.name })}
      footer={
        <div className="flex flex-col gap-2">
          <Button size="lg" icon={<Plus className="size-5" aria-hidden="true" />} busy={busy} disabled={!ready} onClick={onSave} data-action="add-lines-save">
            {t('mill.add.save', 'أضف المختار إلى الخلطة')}
          </Button>
          {views.length && missing.length ? (
            <ul className="list-disc ps-5 text-sm text-ink-muted" data-action="add-missing">
              {missing.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      }
    >
      <p className="text-sm text-ink-muted">{t('mill.cards.hint_pick', 'المس البطاقة لتختار المادّة؛ لمسة ثانية تتركها. تختار أكثر من مادّة معاً، والكميات تُكتب عند كلّ إنتاج.')}</p>
      <MaterialCards
        id={cardsId}
        stock={stock}
        picks={picks}
        query={query}
        onQuery={onQuery}
        exclude={inRecipe}
        canCreate={canCreate}
        canFixKind={canFixKind}
        canWriteDensity={canWriteDensity}
        disabled={busy}
      />
      {views.length ? (
        <p className="rounded-2xl bg-surface-2 p-3 text-sm font-medium" data-action="add-sum">
          {t('mill.add.picked', 'المختار: {names}', { names: views.map((row) => row.line.item.name).join(t('list.separator', '، ')) })}
        </p>
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}
    </Dialog>
  );
}

export default function RecipePage() {
  const { id = '' } = useParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? null;
  const canEdit = role !== null && can(role, 'recipe.activate');
  const canProduce = role !== null && can(role, 'production.draft');
  const canCategories = role !== null && can(role, 'expense_categories.manage');
  const canCreateItem = role !== null && can(role, 'item.create');
  const costs = Boolean(workspace?.canSeeCost);
  // من يعدّل المواد (كثافتها ووحدتها): stores.manage، كما يشترطها الخادم (ب٤٩).
  const canItems = role !== null && can(role, 'stores.manage');
  // النسخة المعروضة في الرابط (ب٦١) لا في حالة الصفحة: الرجوع من «المواد» بعد كتابة الكثافة، وزرّ الرجوع في المتصفّح، يفتحان النسخة نفسها
  // (المسوّدة التي كان عليها) لا النسخة الافتراضية. بلا ?version= يختار الخادم (المفعَّلة، وإلّا آخر نسخة).
  const [params, setParams] = useSearchParams();
  const versionId = params.get('version') || null;
  const setVersionId = (next: string) => setParams({ version: next });
  const load = useCallback(() => loadRecipe(id, versionId), [id, versionId]);
  // الخلطة تبقى مرسومة بآخر ما قُرئ للنسخة نفسها أثناء القراءة من جديد (ب٤٣)، والأفعال معطَّلة حتّى تصل.
  const { data, error, loading, refreshing, retry, reads } = useKeptLoad<RecipeDetail>(load, `${id}#${versionId ?? ''}`);
  // «عندك» لكلّ مادّة (0017، كلمة المالك 2026-11-06: «وافتح خلطة اكدر اشوف المواد الي عندي بالمخزن») وبطاقات «أضف مواد»: قراءة واحدة للصفحة.
  const stock = useMillStock();
  const onHand = stock.onHand;
  // المختار في «أضف مواد» ونصّ بحثها وجملة فشلها في الصفحة (درس WP5): القراءة من جديد بعد كلّ إضافة لا تمسحها.
  const picks = useCardLines();
  const [query, setQuery] = useState('');
  const [addFailure, setAddFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RecipeLine | null>(null);
  const [removingRate, setRemovingRate] = useState<RecipeRate | null>(null);
  const [working, setBusy] = useState(false);
  const busy = working || refreshing;
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  /** «احذف الخلطة» أو «أعِدها» (كلمة المالك 2026-11-09): تأكيدها وفشلها داخله. */
  const [recipeOp, setRecipeOp] = useState<'delete' | 'restore' | null>(null);
  const [recipeOpBusy, setRecipeOpBusy] = useState(false);
  const [recipeOpFailure, setRecipeOpFailure] = useState<string | null>(null);
  const navigate = useNavigate();
  /** المواد التي لم تنسخها «نسخة جديدة» لأنّها صارت بالقطعة (ب٤٨)، للنسخة التي أُنشئت. */
  const [skipped, setSkipped] = useState<{ versionId: string; names: readonly string[] } | null>(null);
  const rateDrafts = useDrafts<Fils>();
  const [newRate, setNewRate] = useState({ categoryId: '', amount: '' });
  const [madeCategories, setMadeCategories] = useState<readonly CategoryOption[]>([]);
  const [category, setCategory] = useState<CategoryDraft>(NO_CATEGORY_DRAFT);
  /**
   * ترتيب موادّ المسوّدة (0023، كلمة المالك 2026-11-10: «يرتب المواد الي يستخدمهن»): ترتيب المستخدم (ids) والترتيب الذي عرضته الشاشة شرطاً للحفظ
   * (basis، p_expected)؛ وبعد lines_changed عدد القراءات لحظة الرفض وتلميح الخادم، فأوّل قراءة ناجحة بعده تصير الشرط ويبقى ترتيب المستخدم.
   */
  const [lineOrder, setLineOrder] = useState<{ versionId: string; ids: readonly string[]; basis: readonly string[]; changedAt: number | null; changed: string | null } | null>(null);
  const fieldId = useId();

  // السطور بترتيب line_no دائماً (0023): الخادم يرسلها به، والترتيب هنا دفاع.
  const lines = useMemo(() => [...(data?.lines ?? [])].sort((a, b) => a.lineNo - b.lineNo), [data]);
  const isDraft = data?.status === 'draft';

  /**
   * كلّ كتابة من الصفحة: بعد النجاح تُقرأ الخلطة من جديد؛ ورفض «تغيّر من نافذة أو جهاز آخر» (ب٤٢) يقرؤها من جديد أيضاً، والخانة
   * المرفوضة (cell) يُعاد شرطها إلى المقروء الجديد حين يصل ويبقى ما كتبه المستخدم فيها، فالحفظ التالي المقصود لا يُرفض بالشرط القديم.
   */
  const act = async (run: () => Promise<unknown>, done?: string, cell: Conflict['cell'] = null) => {
    setBusy(true);
    setFailure(null);
    setConflict(null);
    try {
      await run();
      if (done) toast({ tone: 'success', title: done });
      retry();
    } catch (problem) {
      setFailure(failureText(problem));
      if (data && changedElsewhere(problem)) {
        setConflict({ seen: data, cell, rebased: false });
        retry();
      }
    } finally {
      setBusy(false);
    }
  };

  const saveRate = (rate: RecipeRate) => {
    const draft = rateDrafts.get(rate.id);
    const value = draft ? parseMoney(draft.text) : null;
    if (busy || !draft || value === null || value <= 0n) return;
    void act(
      async () => {
        await setRecipeRate(rate.id, draft.before, value);
        rateDrafts.settle(rate.id, draft.text, value);
      },
      undefined,
      { kind: 'rate', id: rate.id },
    );
  };

  /**
   * «احذف الخلطة» (كلمة المالك 2026-11-09): الأرشفة القائمة بنسخة الخلطة كما قُرئت — تختفي من المعمل ولا يُنتَج بها، ودفعاتها السابقة تبقى
   * في سجلّ الإنتاج (لا تُمحى حركة مخزون). و«أعِدها» تُرجعها. الفشل (تغيّرت من نافذة أخرى، أو اسمها أخذته خلطة ظاهرة) يُقال داخل التأكيد.
   */
  const runRecipeOp = async () => {
    if (!data || !recipeOp || recipeOpBusy) return;
    const op = recipeOp;
    setRecipeOpBusy(true);
    setRecipeOpFailure(null);
    try {
      await archiveRecipe(data.id, data.version, op === 'delete');
      setRecipeOp(null);
      if (op === 'delete') {
        toast({ tone: 'success', title: t('mill.recipe.deleted_toast', 'حُذفت الخلطة «{name}» من المعمل.', { name: data.name }) });
        navigate('/mill', { replace: true });
      } else {
        retry();
      }
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setRecipeOpFailure(`${title} ${detail}`);
    } finally {
      setRecipeOpBusy(false);
    }
  };

  /**
   * «عدّل الخلطة» (م٧): new_recipe_version تنسخ موادّ المفعَّلة بلا كميات (0025) ومعدّلاتها إلى مسوّدة بمعرّف من الجهاز يبقى للإعادة (جواب ضاع ←
   * النسخة نفسها)، والمسوّدة القائمة ترجع كما هي؛ ثم تُفتح المسوّدة.
   */
  const startVersion = async () => {
    if (busy || !data) return;
    const fromActive = data.versions.some((version) => version.status === 'active');
    const slot = `version:${data.id}`;
    setBusy(true);
    setFailure(null);
    setConflict(null);
    try {
      const made = await newRecipeVersion(data.id, millRef(slot));
      forgetMillRef(slot);
      // سطر مادّة صارت بالقطعة لا يُنسخ (ق٥٥): الصفحة تسمّيها فوق النسخة الجديدة بدل أن تختفي من الخلطة بصمت (ب٤٨).
      setSkipped(made.skipped.length ? { versionId: made.versionId, names: made.skipped } : null);
      toast({
        tone: 'success',
        title: made.existing
          ? t('mill.version.opened', 'لهذه الخلطة مسوّدة قائمة: فُتحت لتكملها.')
          : fromActive
            ? t('mill.version.copied', 'أُنشئت نسخة مسوّدة بموادّ النسخة المفعَّلة وتكاليفها: عدّلها ثم فعّلها.')
            : t('mill.version.copied_last', 'أُنشئت نسخة مسوّدة بموادّ آخر نسخة وتكاليفها: عدّلها ثم فعّلها.'),
      });
      if (made.versionId === versionId) retry();
      else setVersionId(made.versionId);
    } catch (problem) {
      setFailure(failureText(problem));
    } finally {
      setBusy(false);
    }
  };

  /**
   * «أضف المختار إلى الخلطة»: سطر بلا كمية لكلّ مادّة مختارة بترتيب اختيارها (كتابة مباشرة لكلّ سطر)، وما أُضيف يُترك من المختار فوراً؛ وأوّل رفض
   * يوقف ما بعده ويُقال باسم ما أُضيف قبله، ثمّ تُقرأ الخلطة من جديد في الحالتين. المادّة المكتوبة في المسوّدة (أُضيفت بمحاولة ضاع جوابها، أو من
   * جهاز آخر) لا تُرسل ثانية.
   */
  const addPicked = async () => {
    if (busy || !data?.versionId) return;
    const versionOf = data.versionId;
    const inRecipe = new Set(data.lines.map((line) => line.itemId));
    const sending = picks.lines.filter((line) => !inRecipe.has(line.item.id));
    setBusy(true);
    setAddFailure(null);
    setFailure(null);
    setConflict(null);
    const added: string[] = [];
    try {
      for (const line of sending) {
        await addRecipeLine(versionOf, line.item.id);
        picks.remove(line.item.id);
        added.push(line.item.name);
      }
      setAdding(false);
      setQuery('');
      picks.reset();
      toast({ tone: 'success', title: t('mill.add.done', 'أُضيفت إلى الخلطة: {names}.', { names: added.join(t('list.separator', '، ')) }) });
    } catch (problem) {
      const text = failureText(problem);
      setAddFailure(added.length ? t('mill.add.partial', 'أُضيفت {names}، ثمّ توقّفت الإضافة: {reason}', { names: added.join(t('list.separator', '، ')), reason: text }) : text);
    }
    setBusy(false);
    retry();
  };

  /** «أغلق» نافذة «أضف مواد»: المختار فيها يُترك (والنافذة تسأل قبل إغلاقها وفيها مختار). */
  const closeAdding = () => {
    setAdding(false);
    setQuery('');
    setAddFailure(null);
    picks.reset();
  };

  /** «فعّل النسخة»: موادّ بلا كميات تُفعَّل بنسخة المسوّدة كما قُرئت (stale_draft إن تغيّرت بعدها، فتُقرأ من جديد). */
  const activate = () => {
    if (!data?.versionId) return;
    const versionOf = data.versionId;
    const seen = data.versionVersion;
    void act(() => activateVersion(versionOf, seen), t('mill.detail.activated', 'فُعّلت النسخة: صارت هي خلطة الإنتاج.'));
  };

  /** «احذف الكميات»: مسوّدة كُتبت بكميات قبل 0025 تصير موادّ بلا كميات، سطراً سطراً (كتابة مباشرة)، ثمّ تُقرأ من جديد. */
  const clearQuantities = (withQty: readonly RecipeLine[]) => {
    void act(async () => {
      for (const line of withQty) await clearRecipeLineQty(line.id);
    }, t('mill.recipe.qty_cleared', 'مُحيت كميات المسوّدة: صارت موادّ بلا كميات، وتُكتب الكميات عند كلّ إنتاج.'));
  };

  /** «أنتج» من بطاقة الخلطة (م٩): شاشة الإنتاج الواحدة بالموادّ وكمياتها. */
  const openProduce = () => navigate(`/mill/produce/${id}`);

  /**
   * «احفظ ترتيب المواد»: كلّ سطور المسوّدة بالترتيب الجديد بشرط ما عرضته الشاشة (set_recipe_line_order). lines_changed (أو سطر حُذف من جهاز آخر)
   * يُقال بتلميحه وتُقرأ الخلطة من جديد ويبقى ترتيب المستخدم ليُحفظ ثانيةً على ما صار فيه؛ وnot_draft (فُعّلت النسخة) يُسقط الترتيب.
   */
  const saveLineOrder = async () => {
    if (!lineOrder || busy || lineOrder.changedAt !== null || sameOrder(lineOrder.ids, lineOrder.basis)) return;
    const sent = lineOrder;
    setBusy(true);
    setFailure(null);
    setConflict(null);
    try {
      await setRecipeLineOrder(sent.versionId, sent.ids, sent.basis);
      setLineOrder(null);
      toast({ tone: 'success', title: t('mill.order.lines_saved', 'حُفظ ترتيب موادّ الخلطة.') });
      retry();
    } catch (problem) {
      const changed = problem instanceof RejectedError && (problem.code === 'lines_changed' || problem.code === 'line_not_found');
      const text = failureText(problem);
      if (changed) {
        setLineOrder((current) => (current ? { ...current, changed: text, changedAt: reads } : current));
        retry();
      } else {
        setFailure(text);
        if (problem instanceof RejectedError && problem.code === 'not_draft') {
          setLineOrder(null);
          retry();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // ترتيب ينتظر قراءته الجديدة بعد lines_changed: فشلها يُقال فوق الجدول بـ«أعد القراءة» ويبقى الترتيب المكتوب (لا تُطوى الصفحة).
  const orderWaiting = lineOrder !== null && lineOrder.changedAt !== null;
  if (error && !(orderWaiting && data)) return <LoadFailed what={t('mill.recipe.what', 'بطاقة الخلطة')} error={error} onRetry={retry} />;
  if (loading || !data) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  // ب٤٢: وصلت القراءة الجديدة بعد رفض «تغيّر من جهاز آخر»: شرط الخانة المرفوضة يصير ما قُرئ الآن ويبقى نصّها كما كتبه المستخدم. ضبط
  // حالة من حالة أثناء الرسم بشرط يتوقّف (rebased)، فلا أثر جانبي ولا حلقة.
  if (conflict && !conflict.rebased && data !== conflict.seen) {
    const cell = conflict.cell;
    if (cell?.kind === 'rate') {
      const rate = (data.rates ?? []).find((entry) => entry.id === cell.id);
      if (rate) rateDrafts.rebase(cell.id, rate.amountPerTon, decimalText(rate.amountPerTon, 2));
    }
    setConflict({ ...conflict, rebased: true });
  }

  // ترتيب الموادّ (0023) للمسوّدة المعروضة وحدها: نسخة أخرى أو نسخة لم تعد مسوّدة (فُعّلت) يسقط ترتيبها؛ وبعد lines_changed أوّل قراءة ناجحة تصير
  // شرط الحفظ ويبقى ترتيب المستخدم (ما حُذف يخرج وما أُضيف في آخره). ضبط حالة من حالة أثناء الرسم بشرط يتوقّف.
  const serverLineIds = lines.map((line) => line.id);
  if (lineOrder !== null && (!isDraft || data.versionId !== lineOrder.versionId)) setLineOrder(null);
  // ترتيب رجع إلى ما يعرفه (نقل ثمّ إرجاع، أو قراءة بعد الرفض جعلته هو) لا يبقى ساكناً (مراجعة شاشات 0023، S4).
  else if (lineOrder !== null && lineOrder.changedAt === null && sameOrder(lineOrder.ids, lineOrder.basis)) setLineOrder(null);
  else if (lineOrder !== null && lineOrder.changedAt !== null && reads > lineOrder.changedAt) {
    setLineOrder({ ...lineOrder, ids: reconcileOrder(lineOrder.ids, serverLineIds), basis: serverLineIds, changedAt: null });
  }
  const lineById = new Map(lines.map((line) => [line.id, line]));
  // المعروض بترتيب المستخدم إن غيّره، وإلّا بترتيب line_no؛ والسطر الذي لم يعرفه الترتيب (أُضيف بعده) في آخره.
  const shownLines = lineOrder ? reconcileOrder(lineOrder.ids, serverLineIds).flatMap((lineId) => lineById.get(lineId) ?? []) : lines;
  const orderPending = lineOrder !== null && (lineOrder.changedAt !== null || !sameOrder(lineOrder.ids, lineOrder.basis));
  // ترتيب لم يُحفظ يقفل إضافة السطور وحذفها والتفعيل (التفعيل يجمّد النسخة بترتيبها المحفوظ): «احفظ» أو «تراجع» أوّلاً.
  const linesLocked = busy || orderPending;
  const moveLine = (index: number, by: -1 | 1) => {
    if (!data.versionId || busy) return;
    const versionOf = data.versionId;
    const now = serverLineIds;
    setLineOrder((current) => {
      const start = current ?? { versionId: versionOf, ids: now, basis: now, changedAt: null, changed: null };
      return { ...start, ids: moveId(reconcileOrder(start.ids, now), index, by) };
    });
  };
  // لون كلّ مادّة بموضعها بين ما داخل الكتلة بالترتيب المعروض (لونها في شريط التركيبة)، وما خارجها بلا لون.
  const slots = slotsOf(shownLines.map((line) => ({ key: line.itemId, inBasis: line.inBasis })));

  const columns = ((): Column<RecipeLine>[] => {
    const base: Column<RecipeLine>[] = [
      { key: 'no', header: t('mill.col.no', '#'), kind: 'number', cell: (_line, index) => <Num>{fmtInt(index + 1)}</Num> },
      { key: 'item', header: t('mill.line.item', 'المادّة'), wrap: true, sticky: true, cell: (line) => <MaterialName name={line.itemName} slot={slots.get(line.itemId) ?? null} /> },
      { key: 'kind', header: t('mill.col.kind', 'النوع'), cell: (line) => kindText(line.kind) },
      {
        key: 'basis',
        header: t('mill.col.in_basis', 'داخل الكتلة'),
        cell: (line) =>
          line.inBasis ? (
            t('mill.in_basis.yes', 'نعم')
          ) : (
            <span className="text-xs text-ink-muted" data-action="out-of-basis">
              {t('mill.line.out_of_basis', 'خارج الكتلة')}
            </span>
          ),
      },
    ];
    if (isDraft && canEdit) {
      base.push({
        key: 'actions',
        header: t('mill.col.actions', 'إجراءات'),
        cell: (line, index) => (
          <span className="flex items-center gap-1">
            {/* الترتيب بالسهمين (0023): يبقى في الشاشة حتّى «احفظ ترتيب المواد»، ومعطّل أثناء الحفظ والقراءة. */}
            <IconButton
              label={t('mill.order.up_line', 'قدّم «{name}»', { name: line.itemName })}
              className="disabled:opacity-50"
              disabled={busy || orderWaiting || index === 0}
              onClick={() => moveLine(index, -1)}
              data-action="line-up"
              data-id={line.id}
            >
              <ArrowUp aria-hidden="true" className="size-5" />
            </IconButton>
            <IconButton
              label={t('mill.order.down_line', 'أخّر «{name}»', { name: line.itemName })}
              className="disabled:opacity-50"
              disabled={busy || orderWaiting || index === shownLines.length - 1}
              onClick={() => moveLine(index, 1)}
              data-action="line-down"
              data-id={line.id}
            >
              <ArrowDown aria-hidden="true" className="size-5" />
            </IconButton>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={linesLocked} onClick={() => setRemoving(line)} data-action="remove-line">
              {t('common.delete', 'احذف')}
            </Button>
          </span>
        ),
      });
    }
    return base;
  })();

  const rates = data.rates ?? [];
  const canRates = isDraft && canEdit && costs;
  const activeVersion = data.versions.find((version) => version.status === 'active') ?? null;
  const draftVersion = data.versions.find((version) => version.status === 'draft') ?? null;
  const categories = [...data.expenseCategories, ...madeCategories.filter((made) => !data.expenseCategories.some((category) => category.id === made.id))];
  const freeCategories = categories.filter((category) => !rates.some((rate) => rate.categoryId === category.id));
  const newRateValue = newRate.amount.trim() === '' ? null : parseMoney(newRate.amount);
  // فئة صار لها سطر (أُضيف من جهاز آخر، أو بمحاولة ضاع جوابها ثمّ رُفضت amount_changed وقُرئت الخلطة، ب٤٢) لا تُضاف ثانيةً بالمعرّف نفسه
  // فتُرفض في حلقة: المبلغ يُعدَّل في سطرها.
  const newRateOk = newRate.categoryId !== '' && freeCategories.some((category) => category.id === newRate.categoryId) && newRateValue !== null && newRateValue > 0n;
  // سطور المسوّدة التي يرفض الخادم التفعيل بها (ب٤١): مكتوب باللتر ومادّته ليست باللتر (bad_recipe_unit)، أو مادّة صارت بالقطعة (bad_recipe_unit)، أو
  // سائل بلا كثافة (density_required). لكلّ منها جملة فوق.
  const blocked = isDraft ? lines.filter((line) => line.unitMismatch || line.densityMissing || line.baseUnit === 'pc') : [];
  // مسوّدة كُتبت بكميات قبل 0025: تُمحى كمياتها قبل التفعيل (موادّ بكميات وموادّ بلاها لا تُفعَّل، mixed_quantities).
  const withQty = isDraft ? lines.filter((line) => line.qty !== null) : [];
  const hasMass = lines.some((line) => line.inBasis);
  const activatable = isDraft && lines.length > 0 && hasMass && blocked.length === 0 && withQty.length === 0;
  const mismatched = blocked.filter((line) => line.unitMismatch || line.baseUnit === 'pc');
  const mismatchText = (line: RecipeLine): string =>
    line.baseUnit === 'pc'
      ? t('mill.recipe.unit_mismatch_pc', 'صارت «{name}» تُقاس بالقطعة، فلا تدخل الخلطة: يُحذف سطرها.', { name: line.itemName })
      : canEdit
        ? t('mill.recipe.unit_mismatch_v4', 'تغيّرت وحدة «{name}» بعد إضافتها: احذف سطرها وأضفها من جديد.', { name: line.itemName })
        : // من لا يعدّل الخلطة (درس ب٣٧): لا يُدلّ على فعل ليس له.
          t('mill.recipe.unit_mismatch_others_v4', 'تغيّرت وحدة «{name}» بعد إضافتها: يحذف المالك أو المدير سطرها ويضيفها من جديد.', { name: line.itemName });
  // سائل بلا كثافة (ق٥١، ب٤٩): التفعيل يرفضه density_required، فالبطاقة تسمّيه قبل النقر. والكثافة تُكتب في نافذة «عدّل» من «المواد» (ب٦١)،
  // ولغير من يعدّل المواد من يكتبها بلا رابط (درس ب٣٧).
  const densityMissing = blocked.filter((line) => line.densityMissing);
  const densityText = (line: RecipeLine): string =>
    canItems
      ? t('mill.recipe.density_items', '«{name}» سائل بلا كثافة: اكتب كثافته من «المواد» ثمّ فعّل.', { name: line.itemName })
      : t('mill.recipe.density_items_others', '«{name}» سائل بلا كثافة: يكتبها المالك أو المدير من «المواد».', { name: line.itemName });
  const densityPath = (line: RecipeLine): string =>
    `/inventory/items?${new URLSearchParams({ edit: line.itemId, back: data.versionId ? `/mill/recipe/${id}?version=${data.versionId}` : `/mill/recipe/${id}` }).toString()}`;
  // ما كُتب في الصفحة ولم يُحفظ (ب٤٩): رابط الكثافة يغادر الصفحة فيضيّعه، فلا يظهر حتّى يُحفظ أو يُمسح.
  const pageDirty =
    rates.some((rate) => {
      const draft = rateDrafts.get(rate.id);
      return draft !== undefined && draft.text !== decimalText(rate.amountPerTon, 2);
    }) ||
    newRate.categoryId !== '' ||
    newRate.amount.trim() !== '' ||
    picks.lines.length > 0 ||
    category.text.trim() !== '';
  // بعد رفض «تغيّر من جهاز آخر» وقراءته الجديدة (ب٤٢): المحفوظ الآن وما كتبه المستخدم معاً — الخانة تبقى بما كتبه، والجملة تقول المحفوظ.
  const conflictNote = ((): string | null => {
    if (!conflict?.rebased) return null;
    const cell = conflict.cell;
    if (cell?.kind === 'rate') {
      const rate = rates.find((entry) => entry.id === cell.id);
      if (rate && rateDrafts.get(cell.id)) {
        return t('mill.conflict.rate', 'المحفوظ الآن لمبلغ «{name}» لكلّ طنّ: {saved}، وما كتبته باقٍ في خانته: احفظه ليحلّ محلّه.', {
          name: rate.categoryName,
          saved: fmtMoney(rate.amountPerTon),
        });
      }
    }
    return t('mill.conflict.recipe', 'قُرئت الخلطة من جديد بما حُفظ الآن: راجعها ثمّ أعد المحاولة.');
  })();

  const rateColumns: Column<RecipeRate>[] = [
    { key: 'category', header: t('mill.rates.category', 'فئة المصروف'), wrap: true, cell: (rate) => rate.categoryName },
    {
      key: 'amount',
      header: t('mill.rates.amount', 'المبلغ لكلّ طنّ (دينار)'),
      kind: 'number',
      cell: (rate) => {
        if (!canRates) return <Num>{fmtMoney(rate.amountPerTon)}</Num>;
        const saved = decimalText(rate.amountPerTon, 2);
        const draft = rateDrafts.get(rate.id);
        const text = draft?.text ?? saved;
        const parsed = parseMoney(text);
        return (
          <CellEdit
            id={`${fieldId}-rate-${rate.id}`}
            label={t('mill.rates.amount_named', 'مبلغ «{name}» لكلّ طنّ', { name: rate.categoryName })}
            value={text}
            dirty={draft !== undefined && text !== saved}
            invalid={parsed === null || parsed <= 0n}
            busy={busy}
            disabled={busy}
            action="rate-amount"
            onChange={(next) => rateDrafts.write(rate.id, next, rate.amountPerTon)}
            onSave={() => saveRate(rate)}
          />
        );
      },
      total: <Num>{fmtMoney(rates.reduce((sum, rate) => sum + rate.amountPerTon, 0n))}</Num>,
    },
  ];
  if (canRates) {
    rateColumns.push({
      key: 'actions',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (rate) => (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={busy} onClick={() => setRemovingRate(rate)} data-action="remove-rate">
          {t('common.delete', 'احذف')}
        </Button>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <BackButton to="/mill" label={t('back.mill', 'رجوع إلى المعمل')} action="back-to-mill" />
      </div>
      <PageHeader title={data.name} subtitle={t('mill.card.output', 'تنتج: {item}', { item: data.outputItem.name })} />

      <div className="flex flex-col gap-5 print:hidden">
        {/* تعديل الخلطة وحذفها (كلمة المالك 2026-11-09: «ما اكدر اعدل عليها ولا احذفها»): النسخة المفعَّلة مجمَّدة، فالتعديل مسوّدة تُفعَّل. */}
        {canEdit && data.archived ? (
          <Notice
            tone="warning"
            title={t('mill.recipe.archived', 'هذه الخلطة محذوفة من المعمل: لا تظهر في قائمته ولا يُنتَج بها.')}
            action={
              <Button variant="secondary" disabled={busy} onClick={() => setRecipeOp('restore')} data-action="restore-recipe">
                {t('mill.recipe.restore', 'أعِدها')}
              </Button>
            }
          />
        ) : null}
        {canEdit && !data.archived ? (
          <div className="flex flex-wrap items-center gap-2" data-action="recipe-actions">
            {!draftVersion ? (
              <Button size="lg" variant="secondary" icon={<Pencil className="size-5" aria-hidden="true" />} busy={busy} onClick={() => void startVersion()} data-action="new-version">
                {t('mill.recipe.edit', 'عدّل الخلطة')}
              </Button>
            ) : data.versionId !== draftVersion.id ? (
              <Button size="lg" variant="secondary" icon={<Pencil className="size-5" aria-hidden="true" />} disabled={busy} onClick={() => setVersionId(draftVersion.id)} data-action="open-draft">
                {t('mill.recipe.continue_edit', 'أكمل تعديل الخلطة')}
              </Button>
            ) : (
              <span className="text-sm text-ink-muted" data-action="editing-hint">
                {t('mill.recipe.editing_v4', 'تعدّل الآن مسوّدة الخلطة: أضف الموادّ أو احذفها أو رتّبها، ثمّ اضغط «فعّل النسخة» لتصير هي المعتمدة في الإنتاج.')}
              </span>
            )}
            <Button variant="ghost" icon={<Trash2 className="size-5" aria-hidden="true" />} disabled={busy} onClick={() => setRecipeOp('delete')} data-action="delete-recipe">
              {t('mill.recipe.delete', 'احذف الخلطة')}
            </Button>
          </div>
        ) : null}
        {recipeOp ? (
          <ConfirmDialog
            open
            tone={recipeOp === 'delete' ? 'danger' : 'primary'}
            title={
              recipeOp === 'delete'
                ? t('mill.recipe.delete_title', 'حذف الخلطة «{name}»؟', { name: data.name })
                : t('mill.recipe.restore_title', 'إعادة الخلطة «{name}»؟', { name: data.name })
            }
            consequence={
              <span className="flex flex-col gap-2">
                {recipeOp === 'delete'
                  ? t('mill.recipe.delete_consequence', 'تختفي «{name}» من المعمل ولا يُنتَج بها بعد الآن، وتبقى دفعاتها السابقة في سجلّ الإنتاج. وتعيدها من صفحتها متى شئت.', { name: data.name })
                  : t('mill.recipe.restore_consequence', 'تعود «{name}» إلى قائمة المعمل ويُنتَج بها من جديد.', { name: data.name })}
                {recipeOpFailure ? (
                  <span role="alert" className="text-danger-700 dark:text-danger-300" data-action="recipe-op-failed">
                    {recipeOpFailure}
                  </span>
                ) : null}
              </span>
            }
            confirmLabel={recipeOp === 'delete' ? t('mill.recipe.delete_confirm', 'احذفها') : t('mill.recipe.restore', 'أعِدها')}
            busy={recipeOpBusy}
            action="confirm-recipe-op"
            onCancel={() => {
              setRecipeOp(null);
              setRecipeOpFailure(null);
            }}
            onConfirm={() => void runRecipeOp()}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {data.versions.map((version) => (
            <Button
              key={version.id}
              size="sm"
              variant={version.id === data.versionId ? 'primary' : 'secondary'}
              onClick={() => setVersionId(version.id)}
              data-action="pick-version"
            >
              {version.status === 'active'
                ? t('mill.version.active', 'نسخة {no} (المفعَّلة)', { no: fmtInt(version.versionNo) })
                : version.status === 'draft'
                  ? t('mill.version.draft', 'نسخة {no} (مسوّدة)', { no: fmtInt(version.versionNo) })
                  : t('mill.version.retired', 'نسخة {no} (مقاعدة)', { no: fmtInt(version.versionNo) })}
            </Button>
          ))}
        </div>

        {skipped && skipped.versionId === data.versionId ? (
          <Notice
            tone="warning"
            title={t('mill.version.skipped', 'نُسخت النسخة بلا {names}: صارت تُقاس بالقطعة فلا تدخل الخلطة.', {
              names: skipped.names.map((name) => t('mill.version.skipped_name', '«{name}»', { name })).join(t('list.separator', '، ')),
            })}
          />
        ) : null}

        {/* «تقرير الإنتاج» (0023) لكلّ من يرى الخلطة، ولو مؤرشفة: تقويمها وتقاريرها المطبوعة بالشهر واليوم. */}
        <div className="flex flex-wrap items-center gap-3">
          {activeVersion && canProduce && !data.archived ? (
            <Button size="lg" icon={<Factory className="size-5" aria-hidden="true" />} onClick={openProduce} data-action="produce">
              {t('mill.card.produce', 'أنتج')}
            </Button>
          ) : null}
          <Link
            to={`/mill/recipe/${id}/report`}
            className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 font-semibold hover:bg-surface-2"
            data-action="open-report"
          >
            {t('mill.recipe.report', 'تقرير الإنتاج')}
          </Link>
        </div>

        {mismatched.length ? (
          <div className="flex flex-col gap-2" data-action="unit-mismatch">
            {mismatched.map((line) => (
              <Notice key={line.id} tone="warning" title={mismatchText(line)} />
            ))}
          </div>
        ) : null}

        {densityMissing.length ? (
          <div className="flex flex-col gap-2" data-action="density-missing">
            {densityMissing.map((line) => (
              <Notice
                key={line.id}
                tone="warning"
                title={densityText(line)}
                action={
                  !canItems || pageDirty ? undefined : (
                    <Link to={densityPath(line)} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="write-density">
                      {t('mill.recipe.write_density', 'اكتب الكثافة')}
                    </Link>
                  )
                }
              />
            ))}
          </div>
        ) : null}

        {withQty.length ? (
          <Notice
            tone="warning"
            title={t('mill.recipe.legacy_qty', 'كُتبت هذه المسوّدة بكميات من قبل، والخلطة الآن موادّ بلا كميات: تُمحى كمياتها قبل التفعيل، وتُكتب الكميات عند كلّ إنتاج.')}
            action={
              canEdit ? (
                <Button size="sm" variant="secondary" busy={busy} disabled={linesLocked} onClick={() => clearQuantities(withQty)} data-action="erase-qty">
                  {t('mill.recipe.clear_qty', 'امحُ الكميات')}
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {isDraft && lines.length && !hasMass ? (
          <Notice tone="warning" title={t('mill.detail.need_mass', 'أضف مادّة داخل كتلة الخلطة؛ الوقود والتعبئة خارجها.')} />
        ) : isDraft && lines.length && blocked.length ? (
          // في المسوّدة سطر يرفض الخادم التفعيل به (ب٤١): لا «جاهزة»، والجمل فوق تسمّي السطور وما العمل.
          <Notice tone="warning" title={t('mill.detail.blocked_v4', 'لا تُفعَّل الخلطة حتّى تُصحَّح السطور أعلاه.')} />
        ) : activatable ? (
          <Notice tone="info" title={t('mill.detail.ready_v4', 'الخلطة جاهزة للتفعيل: {count} من المواد.', { count: fmtInt(lines.length) })} />
        ) : null}
        {failure ? (
          <Notice tone="danger" title={failure}>
            {conflictNote}
          </Notice>
        ) : null}

        {isDraft && canEdit && lineOrder !== null && (orderPending || lineOrder.changed) ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3" data-action="line-order-bar">
            {lineOrder.changed ? (
              <p role="alert" className="text-sm text-warn-700 dark:text-warn-300" data-action="line-order-changed">
                {lineOrder.changed}{' '}
                {orderWaiting
                  ? error
                    ? t('mill.order.lines_changed.failed', 'وتعذّرت قراءة الخلطة من جديد. أعد القراءة، ثمّ احفظ ترتيبك إن شئت.')
                    : t('mill.order.lines_changed.reading', 'جارٍ قراءة الخلطة من جديد…')
                  : t('mill.order.lines_changed.kept', 'قُرئت الخلطة من جديد، وترتيبك باقٍ: احفظه ليحلّ محلّ الترتيب الحالي، أو تراجع.')}
              </p>
            ) : null}
            <p className="text-sm">{t('mill.order.lines_pending', 'غيّرت ترتيب الموادّ: احفظه أو تراجع عنه قبل أيّ تعديل آخر في الخلطة.')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" busy={busy} disabled={busy || orderWaiting || sameOrder(lineOrder.ids, lineOrder.basis)} onClick={() => void saveLineOrder()} data-action="save-line-order">
                {t('mill.order.lines_save', 'احفظ ترتيب المواد')}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setLineOrder(null)} data-action="cancel-line-order">
                {t('mill.order.cancel', 'تراجع')}
              </Button>
              {orderWaiting && error ? (
                <Button size="sm" variant="secondary" onClick={retry} data-action="line-order-reread">
                  {t('dayb.reread', 'أعد القراءة')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <DataTable
          caption={t('mill.detail.caption_v4', 'موادّ الخلطة بترتيبها: نوع كلّ مادّة وهل هي داخل كتلة الخلطة')}
          columns={columns}
          rows={shownLines}
          rowKey={(line) => line.id}
          empty={t('mill.detail.empty', 'لا مواد في هذه النسخة بعد.')}
        />
        {onHand && lines.length ? (
          <div className="flex flex-wrap items-center gap-2" data-action="recipe-on-hand">
            <span className="text-sm font-medium">{t('mill.detail.on_hand', 'في المخزن الآن:')}</span>
            {shownLines.map((line) => {
              const entry = onHand.get(line.itemId);
              return entry ? <Chip key={line.id}>{t('mill.detail.on_hand_item', '{item} — {on_hand}', { item: line.itemName, on_hand: onHandText(entry) })}</Chip> : null;
            })}
          </div>
        ) : null}

        {isDraft && canEdit ? (
          <div className="flex flex-wrap items-end gap-3">
            {/* أثناء الحفظ والقراءة من جديد (ب٤٣)، وترتيب موادّ لم يُحفظ (0023): لا تُفتح نافذة تتبدّل الصفحة تحتها، ولا تُفعَّل النسخة بغير ترتيبها. */}
            <Button
              icon={<Plus className="size-5" aria-hidden="true" />}
              disabled={linesLocked}
              onClick={() => {
                setAddFailure(null);
                setAdding(true);
              }}
              data-action="add-line"
            >
              {t('mill.detail.add_lines', 'أضف مواد')}
            </Button>
            <Button size="lg" icon={<CheckCircle2 className="size-5" aria-hidden="true" />} busy={busy} disabled={!activatable || orderPending} onClick={activate} data-action="activate-version">
              {t('mill.detail.activate', 'فعّل النسخة')}
            </Button>
          </div>
        ) : null}

        {data.rates !== null ? (
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-lg font-semibold">{t('mill.rates.title', 'تكاليف لكلّ طنّ')}</h2>
            <p className="text-sm text-ink-muted">
              {t('mill.rates.hint', 'أيدي عاملة أو كهرباء أو نقل: مبلغ لكلّ طنّ يُحسب على كلّ دفعة بكميتها، ويُحمَّل عند الإنتاج من مصروف مسجّل بفئته.')}
            </p>
            <DataTable
              caption={t('mill.rates.caption', 'تكاليف الخلطة لكلّ طنّ بفئة المصروف')}
              columns={rateColumns}
              rows={rates}
              rowKey={(rate) => rate.id}
              empty={
                !canEdit
                  ? // من لا يضيف تكلفة (بلا recipe.activate، كالمحاسب، ب٣٧): لا «افتحها» ولا «أضفها» ولا «أنشئ نسخة جديدة» وكلّها ليست له.
                    t('mill.rates.empty_others', 'لا تكاليف على هذه النسخة؛ يضيفها المالك أو المدير في مسوّدة الخلطة.')
                  : isDraft
                    ? t('mill.rates.empty', 'لا تكاليف على هذه الخلطة. أضفها إن كان للعلف حصّة من مصروف.')
                    : draftVersion
                      ? // مسوّدة قائمة (ب٢٣): «نسخة جديدة» لا تنسخ شيئاً بل ترجّعها كما هي (new_recipe_version)، فالجملة تدلّ عليها.
                        t('mill.rates.empty_draft_exists', 'لهذه الخلطة مسوّدة قائمة (نسخة {no}): افتحها لإضافة تكلفة.', { no: fmtInt(draftVersion.versionNo) })
                      : // «نسخة جديدة» تنسخ النسخة المفعَّلة (وإلّا آخر نسخة)، لا النسخة المعروضة (ب١٠، new_recipe_version).
                        data.status === 'active'
                        ? t('mill.rates.empty_frozen', 'لا تكاليف على هذه النسخة: لإضافة تكلفة أنشئ نسخة جديدة، فهي تبدأ بموادّ هذه النسخة وتكاليفها.')
                        : activeVersion
                          ? t('mill.rates.empty_frozen_active', 'لا تكاليف على هذه النسخة: لإضافة تكلفة أنشئ نسخة جديدة، فهي تبدأ بموادّ النسخة المفعَّلة وتكاليفها.')
                          : t('mill.rates.empty_frozen_last', 'لا تكاليف على هذه النسخة: لإضافة تكلفة أنشئ نسخة جديدة، فهي تبدأ بموادّ آخر نسخة وتكاليفها.')
              }
              totalLabel={t('mill.detail.total', 'المجموع')}
            />
            {!isDraft && !rates.length && canEdit ? (
              <div>
                {draftVersion ? (
                  <Button size="sm" variant="secondary" onClick={() => setVersionId(draftVersion.id)} data-action="rates-open-draft">
                    {t('mill.rates.open_draft', 'افتح المسوّدة لإضافة تكلفة')}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden="true" />} busy={busy} onClick={() => void startVersion()} data-action="rates-new-version">
                    {t('mill.version.new', 'نسخة جديدة')}
                  </Button>
                )}
              </div>
            ) : null}
            {canRates ? (
              <div className="flex flex-wrap items-end gap-3">
                <Field id={`${fieldId}-new-rate-category`} label={t('mill.rates.category', 'فئة المصروف')}>
                  <select
                    id={`${fieldId}-new-rate-category`}
                    className="input"
                    value={newRate.categoryId}
                    disabled={busy}
                    onChange={(event) => setNewRate((current) => ({ ...current, categoryId: event.target.value }))}
                    data-action="new-rate-category"
                  >
                    <option value="">{t('mill.rates.category_pick', 'اختر فئة المصروف')}</option>
                    {freeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`${fieldId}-new-rate-amount`} label={t('mill.rates.amount', 'المبلغ لكلّ طنّ (دينار)')}>
                  <input
                    id={`${fieldId}-new-rate-amount`}
                    className="input text-end tabular-nums"
                    inputMode="decimal"
                    dir="ltr"
                    value={newRate.amount}
                    disabled={busy}
                    onChange={(event) => setNewRate((current) => ({ ...current, amount: event.target.value }))}
                    data-action="new-rate-amount"
                  />
                </Field>
                <Button
                  variant="secondary"
                  icon={<Plus className="size-5" aria-hidden="true" />}
                  busy={busy}
                  disabled={!newRateOk || !data.versionId}
                  onClick={() => {
                    if (busy || !newRateOk || newRateValue === null || !data.versionId) return;
                    const slot = `rate:${data.versionId}:${newRate.categoryId}`;
                    const versionOf = data.versionId;
                    const sent = newRate;
                    void act(async () => {
                      await addRecipeRate(versionOf, millRef(slot), sent.categoryId, newRateValue);
                      forgetMillRef(slot);
                      // ب٤٤ (قاعدة ب٣٢): لا يُفرَّغ السطر الجديد إلّا إن بقي كما أُرسل.
                      setNewRate((current) => (current.categoryId === sent.categoryId && current.amount === sent.amount ? { categoryId: '', amount: '' } : current));
                    });
                  }}
                  data-action="add-rate"
                >
                  {t('mill.rates.add', 'أضف تكلفة')}
                </Button>
              </div>
            ) : null}
            {canRates ? (
              <NewCategoryField
                id={`${fieldId}-new-category`}
                categories={categories}
                canManage={canCategories}
                value={category}
                onChange={setCategory}
                disabled={busy}
                onPick={(picked) => {
                  setMadeCategories((current) => (current.some((made) => made.id === picked.id) ? current : [...current, picked]));
                  if (!rates.some((rate) => rate.categoryId === picked.id)) setNewRate((current) => ({ ...current, categoryId: picked.id }));
                }}
              />
            ) : null}
          </section>
        ) : null}
      </div>

      <RecipeHistorySection recipeId={data.id} recipeName={data.name} />

      {adding ? (
        <AddMaterialsDialog
          recipe={data}
          stock={stock}
          picks={picks}
          query={query}
          onQuery={setQuery}
          canCreate={canCreateItem}
          canFixKind={canItems}
          canWriteDensity={canItems}
          busy={busy}
          failure={addFailure}
          onClose={closeAdding}
          onSave={() => void addPicked()}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.line.remove.title', 'حذف «{name}» من الخلطة؟', { name: removing.itemName })}
          consequence={t('mill.line.remove.body', 'تُحذف من هذه النسخة المسوّدة وحدها؛ النسخ المفعَّلة والمقاعدة لا تتغيّر.')}
          confirmLabel={t('common.delete', 'احذف')}
          busy={busy}
          onConfirm={() =>
            void act(async () => {
              await deleteRecipeLine(removing.id, data.versionVersion);
              setRemoving(null);
            })
          }
          onCancel={() => setRemoving(null)}
        />
      ) : null}
      {removingRate ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.rates.remove.title', 'حذف تكلفة «{name}» من الخلطة؟', { name: removingRate.categoryName })}
          consequence={t('mill.rates.remove.body', 'تُحذف من هذه النسخة المسوّدة وحدها: الدفعات الجديدة بعد تفعيلها لا تُحسب عليها هذه التكلفة.')}
          confirmLabel={t('common.delete', 'احذف')}
          busy={busy}
          action="confirm-remove-rate"
          onConfirm={() =>
            void act(async () => {
              await deleteRecipeRate(removingRate.id, data.versionVersion);
              setRemovingRate(null);
            })
          }
          onCancel={() => setRemovingRate(null)}
        />
      ) : null}
    </div>
  );
}
