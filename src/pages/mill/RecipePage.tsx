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
import { parseQty, type BaseUnit } from '../../domain/units';
import { describeError, RejectedError, ZeroRowsError } from '../../lib/errors';
import { columnDecimals, fmtInt, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { setItemCostPrice } from '../../lib/repo/inventory';
import {
  activateVersion,
  addRecipeLine,
  addRecipeRate,
  archiveRecipe,
  deleteRecipeLine,
  deleteRecipeRate,
  loadRecipe,
  newRecipeVersion,
  setRecipeLine,
  setRecipeLineOrder,
  setRecipeRate,
  setVersionBasis,
  type CategoryOption,
  type RecipeDetail,
  type RecipeLine,
  type RecipeRate,
  type RecipeUnit,
} from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { cardTotals, kgText, MaterialCards, useCardLines, useMillStock, viewCardLine, type CardLines, type MillStock } from './cards';
import { CellEdit, NewCategoryField, NO_CATEGORY_DRAFT, onHandText, unitWord, useDrafts, type CategoryDraft } from './pickers';
import { Chip, CompositionBar, dash, forgetMillRef, millRef, moveId, pct, pieceColor, recipeColor, reconcileOrder, sameOrder, useKeptLoad } from './shared';

// بطاقة الخلطة (0015): نسخها، وموادّها بجدول كلاسيكي مع حصّة كلّ مادّة، وأقسامها (تصنيف المادّة) برقاقات فوق الجدول،
// وشريط التركيبة بلمحة. النسخة المسوّدة تُعدَّل وتُفعَّل؛ والمفعَّلة مجمَّدة، فالتعديل نسخة جديدة (التاريخ لا يُعاد كتابته).
// النسخة الثانية (0016): لكلّ مادّة سعر الشراء التلقائي (آخر استلام) وسعر الكلفة المكتوب (يُكتب هنا لمن يملك الصلاحية) بجانب
// متوسّط المتاح؛ و«تكاليف لكلّ طنّ» بفئة مصروف (تُكتب في المسوّدة)؛ وكلفة الطنّ المتوقّعة من الخادم للتخطيط.
// إصلاحات المراجعة: فئة المصروف تُضاف من مكانها (م٣)؛ «نسخة جديدة» تنسخ المفعَّلة بسطورها وتكاليفها (new_recipe_version، م٧)، ونصّ
// «لا تكاليف» على نسخة مجمَّدة يدلّ عليها؛ وزرّ «أنتج» للنسخة المفعَّلة (م٩)؛ والوقود والتعبئة «خارج الكتلة» (in_basis، م١١).
// الجولة الثانية: خلية «بالكيلوغرام» لسطر خارج الكتلة «—» كالبانية، فالمجموع = الخلايا (ب٩)؛ نصّ «لا تكاليف» تحت نسخة غير مفعَّلة
// يقول إنّ النسخة الجديدة تبدأ من المفعَّلة (أو آخر نسخة) لا من المعروضة (ب١٠)؛ ونصّ «فئة جديدة» في الصفحة (ب١١).
// الجولة الثالثة: حين تكون للخلطة مسوّدة يدلّ نصّ «لا تكاليف» عليها برقمها لا على «نسخة جديدة» (ب٢٣)؛ وتحت النسخة المفعَّلة جملة لكلّ
// سطر تغيّرت وحدة مادّته بعد التفعيل (ب٢٧، unit_changed من لقطة وحدة الأساس).
// الجولة الرابعة: سطر المسوّدة المكتوب باللتر ومادّته صارت بالكيلوغرام (unit_mismatch) بجملة تقول ما العمل، وكتلته «—» (لا تُعرف بلا
// كثافة: القارئ يرسل null بدل أن يرمي)، وشريط التركيبة يتخطّاه، والمجموع «—» إن جهلت كتلة سطر داخل الكتلة (ب٣١)؛ ونصّ «لا تكاليف» لمن
// لا يضيف تكلفة (بلا recipe.activate) لا يدلّه على فعل ليس له (ب٣٧).
// الجولة الخامسة: «فعّل النسخة» و«المجموع مطابق» لا يقولان «جاهزة» وفي المسوّدة سطر يرفض الخادم التفعيل به (ب٤١: unit_mismatch أو سائل
// بلا كثافة أو مادّة صارت بالقطعة)، ولكلّ منها جملة فوق (ب٤٩ للكثافة)؛ ورفض «تغيّر من جهاز آخر» يقرأ الخلطة من جديد
// ويبقي المكتوب مشروطاً بالمقروء الجديد (ب٤٢)؛ والصفحة تبقى مرسومة أثناء القراءة والأفعال معطَّلة (ب٤٣)؛ وخانات المال وحقول التكلفة
// الجديدة مقفولة أثناء الحفظ ولا يُمسح منها إلّا ما أُرسل (ب٤٤)؛ وجملة «بلا أيّ سعر» بالدور (ب٤٥)؛ و«عدّل» لا يظهر لسطر لا يُعدَّل
// (ب٤٧)؛ و«نسخة جديدة» تقول المواد التي لم تُنسخ (ب٤٨).
// الجولة السادسة: رابط الكثافة يصل إلى محرّر حقيقي — نافذة «عدّل» في «المواد» (/inventory/items?edit=) — ويرجع بعد الحفظ إلى المسوّدة نفسها:
// النسخة المعروضة في الرابط (?version=) لا في حالة الصفحة، فالرجوع إليها (أو زرّ الرجوع في المتصفّح) يفتحها هي (ب٦١)؛ ولوحة كلفة الطنّ تقول
// للسطور المسعَّرة التي لا تتحوّل كميتها «لا تُحسب حتّى تُصحَّح سطورها» لا «اكتب سعر كلفتها» (ب٦٢، unconverted). وتكامل الجولة: سطر لتر تُقرَّب
// كتلته صفراً (ق٦٤: يرفض الخادم التفعيل به qty_not_positive) سطرٌ لا تُفعَّل النسخة به كشروط ب٤١، بجملة تسمّيه فوق.
// المواد بطاقاتٍ (كلمة المالك 2026-11-07): «أضف مواد» تفتح بطاقات المواد في نافذة عريضة، يُختار منها أكثر من مادّة معاً بكمياتها وتُضاف بنقرة؛
// والمختار يعيش في الصفحة فلا تمسحه القراءة من جديد (درس WP5). ولا «أساس» يُكتب ويُطابَق: «فعّل النسخة» تكتب أساس المسوّدة = مجموع ما داخل
// الكتلة (setVersionBasis بشرط نسختها) ثمّ تفعّلها بالنسخة التالية، فلا basis_mismatch؛ والصفحة تقول «مجموع الخلطة» و«الناتج المتوقّع».
// «ترتيب معمل العلف» (0023، كلمة المالك 2026-11-10): السطور بترتيب line_no (والقسم عمود ورقاقة لا تجميع)، وفي «عدّل الخلطة» سهما «قدّم» و«أخّر» لكلّ
// مادّة ثمّ «احفظ ترتيب المواد» (set_recipe_line_order بشرط الترتيب الذي عرضته الشاشة، وlines_changed يُقال ويُقرأ من جديد ويبقى ترتيب المستخدم)؛
// والترتيب الذي لم يُحفظ يقفل بقيّة تعديلات السطور والتفعيل. و«أنتج» يفتح شاشة الإنتاج الواحدة (/mill/produce/:id) بدل النافذة.

/** رفض «تغيّر من نافذة أو جهاز آخر» في بطاقة الخلطة (ب٤٢): الصفحة تُقرأ من جديد. */
// وbasis_mismatch (مراجعة الشاشات M3): تغيّر مجموع المسوّدة على الخادم بلا نسخة جديدة (كثافة مادّة أو وحدتها من جهاز آخر)، فتُقرأ من جديد
// والتفعيل التالي يكتب الأساس = المجموع المقروء الآن.
const CHANGED_ELSEWHERE = new Set(['price_changed', 'amount_changed', 'stale_draft', 'basis_mismatch']);
// وحفظ الأساس المشروط بنسخة المسوّدة يرجع بصفر صفوف إن تغيّرت (ZeroRowsError): المخرج نفسه، فلا يُعاد بالنسخة القديمة أبداً.
const changedElsewhere = (problem: unknown): boolean => (problem instanceof RejectedError && CHANGED_ELSEWHERE.has(problem.code)) || problem instanceof ZeroRowsError;

/**
 * رفض «تغيّر من جهاز آخر» ينتظر قراءته الجديدة (ب٤٢): seen ما كان معروضاً لحظة الرفض (القراءة الجديدة غيره)، وcell الخانة المرفوضة
 * (سعر كلفة مادّة، أو مبلغ تكلفة لكلّ طنّ) أو null لرفض الخلطة كلّها، وrebased بعد أن صار شرط الخانة المقروء الجديد.
 */
interface Conflict {
  seen: RecipeDetail;
  cell: { kind: 'price' | 'rate'; id: string } | null;
  rebased: boolean;
}

/** تعديل كمية سطر قائم في المسوّدة (الإضافة بالبطاقات: AddMaterialsDialog). */
function LineDialog({ line, onClose, onSaved }: { line: RecipeLine; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [qty, setQty] = useState(decimalText(line.qty, 3));
  const [unit, setUnit] = useState<RecipeUnit>(line.unit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parseQty(qty);
  const bad = qty.trim() !== '' && (value === null || value <= 0n);
  const liquid = line.baseUnit === 'L';

  const save = async () => {
    if (!value || value <= 0n) return;
    setBusy(true);
    setError(null);
    try {
      await setRecipeLine(line.id, value, unit);
      onSaved();
    } catch (failure) {
      const { title, detail } = describeError(failure);
      setError(`${title} ${detail}`);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={qty !== decimalText(line.qty, 3)}
      title={t('mill.line.edit', 'تعديل «{name}»', { name: line.itemName })}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={!value || value <= 0n} data-action="line-save">
          {t('common.save', 'حفظ')}
        </Button>
      }
    >
      <p className="text-sm text-ink-muted">{t('mill.line.hint_total', 'الكمية بالكيلوغرام، أو باللتر للسائل. مجموع المواد هو حجم الخلطة وناتجها.')}</p>
      <Field id={`${id}-qty`} label={t('mill.line.qty', 'الكمية')} error={bad ? t('mill.line.qty_bad', 'اكتب كمية أكبر من صفر.') : undefined}>
        <input id={`${id}-qty`} className="input tabular-nums" inputMode="decimal" dir="ltr" value={qty} onChange={(event) => setQty(event.target.value)} />
      </Field>
      {liquid ? (
        <Field id={`${id}-unit`} label={t('mill.line.unit_pick', 'الوحدة')} hint={t('mill.line.unit_hint', 'اللتر يُحوَّل إلى كيلوغرام بكثافة المادّة المحفوظة لحظة التفعيل.')}>
          <select id={`${id}-unit`} className="input" value={unit} onChange={(event) => setUnit(event.target.value === 'L' ? 'L' : 'kg')}>
            <option value="kg">{t('unit.kg', 'كغم')}</option>
            <option value="L">{t('unit.L', 'لتر')}</option>
          </select>
        </Field>
      ) : null}
      {error ? <Notice tone="danger" title={error} /> : null}
    </Dialog>
  );
}

/**
 * «أضف مواد» بالبطاقات (كلمة المالك 2026-11-07): أكثر من مادّة معاً بكمياتها، والمختار وما كُتب في الصفحة (picks وquery من RecipePage، درس WP5).
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
  const totals = cardTotals(views);
  const ready = views.length > 0 && views.every((row) => row.qtyOk && !row.densityMissing && !row.densityUnread && row.mass !== 0n);
  // ما يمنع «أضف المختار» مكتوب تحته (مراجعة الشاشات M4)، كالبانية: لا زرّ معطّل بلا سبب.
  const missing: string[] = [];
  for (const row of views) {
    const name = row.line.item.name;
    if (!row.qtyOk) missing.push(t('mill.builder.need_qty', 'اكتب كمية «{name}» أكبر من صفر.', { name }));
    if (row.densityMissing) missing.push(t('mill.builder.need_density_of', '«{name}» سائل بلا كثافة، فلا يُحسب وزنه: اكتب كثافته على بطاقته.', { name }));
    else if (row.densityUnread) missing.push(t('mill.builder.density_unread', 'كثافة «{name}» لم تُقرأ بعد: انتظر لحظة أو أعد قراءتها من بطاقته.', { name }));
    else if (row.mass === 0n) missing.push(t('mill.builder.zero_mass', 'كمية «{name}» تُقرَّب صفراً بالكيلوغرام: اكتب كمية أكبر.', { name }));
  }
  const after = recipe.massKg !== null && totals.known ? recipe.massKg + totals.sum : null;
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
      <p className="text-sm text-ink-muted">{t('mill.cards.hint', 'المس البطاقة لتختار المادّة، واكتب كميتها عليها؛ لمسة ثانية تتركها. تختار أكثر من مادّة معاً.')}</p>
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
        <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3 text-sm" data-action="add-sum">
          <p className="font-medium">
            {t('mill.add.picked', 'المختار: {names}', { names: views.map((row) => row.line.item.name).join(t('list.separator', '، ')) })}
          </p>
          <p>
            {totals.known
              ? after !== null
                ? t('mill.add.after', 'يزيد الخلطة {added}، فيصير مجموعها {total}.', { added: kgText(totals.sum), total: kgText(after) })
                : t('mill.add.added', 'يزيد الخلطة {added}.', { added: kgText(totals.sum) })
              : t('mill.cards.sum_unknown', 'مجموع الخلطة لا يُحسب بعد: اكتب كمية كلّ مادّة مختارة، وكثافة كلّ سائل بلا كثافة.')}
          </p>
        </div>
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}
    </Dialog>
  );
}

/**
 * كلفة الطنّ المتوقّعة من الخادم (ج٧): للتخطيط، والفعلية من السحب الحقيقي عند الإنتاج. وجملة المواد «بلا أيّ سعر» تدلّ على كتابة سعر
 * الكلفة من يكتبه وحده (ب٤٥، درس ب٣٧: set_item_cost_price يشترط stores.manage)، ولغيره تقول من يكتبه. والمادّة التي لها سعر ولا تتحوّل
 * كميتها إلى وحدة سعره (ب٦٢، unconverted: سائل بلا كثافة، أو سطر لتر لمادّة صارت بالكيلو) لا تُعدّ «بلا سعر»: علاجها في سطرها لا في سعره،
 * وكلاهما لا يُحسب، فالرقم «على الأقلّ».
 */
export function ExpectedPanel({ expected, canPrice = false }: { expected: NonNullable<RecipeDetail['expected']>; canPrice?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3" data-action="expected-cost">
      <p className="font-semibold">
        {expected.unpriced === 0 && expected.unconverted === 0
          ? t('mill.expected.title', 'كلفة الطنّ المتوقّعة: {ton}', { ton: fmtMoney(expected.costPerTon) })
          : t('mill.expected.partial', 'كلفة الطنّ المتوقّعة: {ton} على الأقلّ', { ton: fmtMoney(expected.costPerTon) })}
      </p>
      <p className="text-sm text-ink-muted">
        {t('mill.builder.planned_parts', 'المواد {materials} والتكاليف {rates} لكلّ طنّ.', { materials: fmtMoney(expected.materialsPerTon), rates: fmtMoney(expected.ratesPerTon) })}
        {expected.unpriced > 0
          ? ` ${
              canPrice
                ? t('mill.expected.unpriced', '{count} من المواد بلا أيّ سعر فلم تُحسب: اكتب سعر كلفتها.', { count: fmtInt(expected.unpriced) })
                : t('mill.expected.unpriced_others', '{count} من المواد بلا أيّ سعر فلم تُحسب: يكتبه المالك أو المدير.', { count: fmtInt(expected.unpriced) })
            }`
          : ''}
        {expected.unconverted > 0 ? ` ${t('mill.expected.unconverted', '{count} من المواد لا تُحسب حتّى تُصحَّح سطورها أعلاه.', { count: fmtInt(expected.unconverted) })}` : ''}
      </p>
      <p className="text-xs text-ink-muted">{t('mill.expected.note', 'سعر كلّ مادّة: سعر الكلفة المكتوب، وإلّا آخر شراء، وإلّا متوسّط المتاح. الكلفة الفعلية للعلف من السحب الحقيقي عند الإنتاج.')}</p>
    </div>
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
  // من يعدّل المواد (كثافتها ووحدتها وسعر كلفتها): stores.manage، كما يشترطها الخادم (ب٤٩، ب٤٥).
  const canItems = role !== null && can(role, 'stores.manage');
  const canPrice = costs && canItems;
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
  const [editing, setEditing] = useState<RecipeLine | null>(null);
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
  const prices = useDrafts<Fils | null>();
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
  // عمود الكتلة يجمع ما داخل الكتلة وحده (ب٩)، فمراتبه منه؛ والكتلة التي لا تُعرف (ب٣١) «—» لا تدخل المراتب.
  const massDecimals = useMemo(
    () => columnDecimals(lines.flatMap((line) => (line.inBasis && line.massKg !== null ? [line.massKg] : [])), 3) as 0 | 1 | 2 | 3,
    [lines],
  );
  const qtyDecimals = useMemo(() => columnDecimals(lines.map((line) => line.qty), 3) as 0 | 1 | 2 | 3, [lines]);
  // أعمدة الأسعار مال: لأدوار الكلفة وحدها (الخادم يحذف money عن غيرهم).
  const costShown = costs;
  const isDraft = data?.status === 'draft';
  // الحصّة من مجموع الخلطة في المسوّدة (لا أساس يُكتب)، ومن الأساس المجمَّد في غيرها.
  const shareOf = isDraft ? (data?.massKg ?? null) : (data?.basisKg ?? null);
  const hue = recipeColor(id).hue;

  const sections = useMemo(() => {
    // null: في القسم سطر لا تُعرف كتلته (ب٣١)، فرقاقته «—» لا مجموع ناقص بصمت.
    const groups = new Map<string, bigint | null>();
    for (const line of lines) {
      // الوقود والتعبئة خارج الكتلة (م١١): لا يدخلان أقسام الحصص.
      if (!line.inBasis) continue;
      const key = line.categoryName ?? t('mill.section.none', 'بلا قسم');
      const sum = groups.has(key) ? (groups.get(key) ?? null) : 0n;
      groups.set(key, sum === null || line.massKg === null ? null : sum + line.massKg);
    }
    return [...groups.entries()].map(([name, mass]) => ({ name, mass }));
  }, [lines]);

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
      const { title, detail } = describeError(problem);
      // basis_mismatch بجملتنا لا بتلميح الخادم: تلميحه يطلب تعديل «الأساس»، ولا حقل أساس في الصفحة (M3).
      setFailure(
        problem instanceof RejectedError && problem.code === 'basis_mismatch'
          ? t('mill.recipe.total_changed', 'تغيّر مجموع الخلطة على الخادم بعد ما قُرئ (كثافة مادّة أو وحدتها تغيّرت من جهاز آخر).')
          : `${title} ${detail}`,
      );
      if (data && changedElsewhere(problem)) {
        setConflict({ seen: data, cell, rebased: false });
        retry();
      }
    } finally {
      setBusy(false);
    }
  };

  // بعد الحفظ (ب٤٤، قاعدة ب٣٢): يُمسح المسوَّد إن بقي نصّه كما أُرسل، وإلّا يبقى ما كُتب أثناء الحفظ (والخانة مقفولة أثناءه أصلاً)
  // مشروطاً بما حُفظ الآن، فلا يضيع بصمت ولا يُرفض حفظه التالي «من جهاز آخر».
  const savePrice = (line: RecipeLine) => {
    const draft = prices.get(line.itemId);
    if (busy || !draft) return;
    const value = draft.text.trim() === '' ? null : parseMoney(draft.text);
    if (draft.text.trim() !== '' && (value === null || value <= 0n)) return;
    void act(
      async () => {
        await setItemCostPrice(line.itemId, value, draft.before);
        prices.settle(line.itemId, draft.text, value);
      },
      t('mill.price.saved', 'حُفظ سعر كلفة «{name}».', { name: line.itemName }),
      { kind: 'price', id: line.itemId },
    );
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
   * «نسخة جديدة» (م٧): new_recipe_version تنسخ سطور المفعَّلة ومعدّلاتها إلى مسوّدة بمعرّف من الجهاز يبقى للإعادة (جواب ضاع ←
   * النسخة نفسها)، والمسوّدة القائمة ترجع كما هي؛ ثم تُفتح المسوّدة بسطورها وتكاليفها.
   */
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
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * بعد كلّ تغيير في سطور المسوّدة (مراجعة الشاشات M2): أساسها المحفوظ يصير مجموعها الآن، فكلفة الطنّ المتوقّعة (يقسمها الخادم على الأساس) صحيحة.
   * تُقرأ المسوّدة بنسختها بعد التغيير ويُكتب الأساس بشرطها كالتفعيل؛ صفر صفوف (تغيّرت من جهاز آخر) يرمي، فتُقرأ الصفحة من جديد وتبقى لوحة الكلفة
   * مخفيّة ما دام الأساس غير المجموع.
   */
  const syncBasis = async () => {
    if (!data?.versionId) return;
    const now = await loadRecipe(id, data.versionId);
    if (now.status !== 'draft' || !now.versionId || now.massKg === null || now.massKg <= 0n || now.basisKg === now.massKg) return;
    await setVersionBasis(now.versionId, now.massKg, now.versionVersion);
  };

  /**
   * «أضف المختار إلى الخلطة»: سطر لكلّ مادّة مختارة بترتيب اختيارها (كتابة مباشرة لكلّ سطر كـ«أضف مادّة» من قبل)، وما أُضيف يُترك من المختار
   * فوراً؛ وأوّل رفض يوقف ما بعده ويُقال باسم ما أُضيف قبله، ثمّ تُقرأ الخلطة من جديد في الحالتين. المادّة المكتوبة في المسوّدة (أُضيفت بمحاولة ضاع
   * جوابها، أو من جهاز آخر) لا تُرسل ثانية.
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
        const qty = viewCardLine(line).qty;
        if (qty === null || qty <= 0n) continue;
        await addRecipeLine(versionOf, line.item.id, qty, line.unit);
        picks.remove(line.item.id);
        added.push(line.item.name);
      }
      setAdding(false);
      setQuery('');
      picks.reset();
      toast({ tone: 'success', title: t('mill.add.done', 'أُضيفت إلى الخلطة: {names}.', { names: added.join(t('list.separator', '، ')) }) });
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setAddFailure(
        added.length
          ? t('mill.add.partial', 'أُضيفت {names}، ثمّ توقّفت الإضافة: {reason}', { names: added.join(t('list.separator', '، ')), reason: `${title} ${detail}` })
          : `${title} ${detail}`,
      );
    }
    // ما أُضيف غيّر مجموع المسوّدة: الأساس يتبعه (M2). فشله لا يُسكت: لوحة الكلفة تبقى مخفيّة بجملة وزرّ «حدّث كلفة الطنّ».
    if (added.length) {
      try {
        await syncBasis();
      } catch (problem) {
        const { title, detail } = describeError(problem);
        setFailure(t('mill.add.sync_failed', 'أُضيفت المواد، ولم يُحفظ مجموع الخلطة الجديد بعد ({reason}): تُحدَّث كلفة الطنّ بزرّ «حدّث كلفة الطنّ».', { reason: `${title} ${detail}` }));
      }
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

  /**
   * «فعّل النسخة» بلا أساس يُطابَق (كلمة المالك 2026-11-07): إن خالف أساسُ المسوّدة مجموعَ ما داخل الكتلة يُكتب الأساس = المجموع بشرط نسخة
   * المسوّدة (صفر صفوف = تغيّرت من جهاز آخر فتُقرأ من جديد)، ثمّ التفعيل بالنسخة التالية؛ فتغيّرٌ بين الخطوتين يُرفض stale_draft ويُقرأ من جديد.
   */
  const activate = () => {
    if (!data?.versionId || data.massKg === null) return;
    const versionOf = data.versionId;
    const total = data.massKg;
    const seen = data.versionVersion;
    const basisNow = data.basisKg;
    void act(async () => {
      let expected = seen;
      if (basisNow !== total) {
        await setVersionBasis(versionOf, total, seen);
        expected = seen + 1;
      }
      await activateVersion(versionOf, expected);
    }, t('mill.detail.activated', 'فُعّلت النسخة: صارت هي خلطة الإنتاج.'));
  };

  /** «أنتج» من بطاقة الخلطة (م٩): شاشة الإنتاج الواحدة (0023) بالكمية والمواد معاً. */
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
      const described = describeError(problem);
      const text = problem instanceof RejectedError && problem.hint ? problem.hint : `${described.title} ${described.detail}`;
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

  /**
   * وحدة سعر الكلفة: وحدة أساس المادّة الآن (السعر لها)، وbase_unit في سطر نسخة مجمَّدة لقطة يوم التفعيل (ق٣١). وunit_changed صار لاتّجاه
   * رفض الإنتاج وحده (ق٤١)، فلقطة لتر لمادّة صارت بالكيلو لا يقولها؛ فالوحدة الحيّة من pick_items (المادّة المقبولة في الخلطة الآن بوحدتها)،
   * وإلّا اللقطة ما لم يدلّ unit_changed أو unit_mismatch على تغيّرها، وإلّا لا تُسمّى وحدة (ب٣١). والمسوّدة بلا لقطة: base_unit حيّة.
   */
  const priceUnit = (line: RecipeLine): BaseUnit | null => {
    if (isDraft) return line.baseUnit;
    const live = data?.pickItems.find((item) => item.id === line.itemId)?.baseUnit;
    if (live) return live;
    return line.unitChanged || line.unitMismatch ? null : line.baseUnit;
  };

  // ترتيب ينتظر قراءته الجديدة بعد lines_changed: فشلها يُقال فوق الجدول بـ«أعد القراءة» ويبقى الترتيب المكتوب (لا تُطوى الصفحة).
  const orderWaiting = lineOrder !== null && lineOrder.changedAt !== null;
  if (error && !(orderWaiting && data)) return <LoadFailed what={t('mill.recipe.what', 'بطاقة الخلطة')} error={error} onRetry={retry} />;
  if (loading || !data) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  // ب٤٢: وصلت القراءة الجديدة بعد رفض «تغيّر من جهاز آخر»: شرط الخانة المرفوضة يصير ما قُرئ الآن ويبقى نصّها كما كتبه المستخدم. ضبط
  // حالة من حالة أثناء الرسم بشرط يتوقّف (rebased)، فلا أثر جانبي ولا حلقة.
  if (conflict && !conflict.rebased && data !== conflict.seen) {
    const cell = conflict.cell;
    if (cell?.kind === 'price') {
      const line = data.lines.find((entry) => entry.itemId === cell.id);
      if (line) prices.rebase(cell.id, line.costPrice, line.costPrice === null ? '' : decimalText(line.costPrice, 2));
    } else if (cell?.kind === 'rate') {
      const rate = (data.rates ?? []).find((entry) => entry.id === cell.id);
      if (rate) rateDrafts.rebase(cell.id, rate.amountPerTon, decimalText(rate.amountPerTon, 2));
    }
    setConflict({ ...conflict, rebased: true });
  }

  // ترتيب الموادّ (0023) للمسوّدة المعروضة وحدها: نسخة أخرى أو نسخة لم تعد مسوّدة (فُعّلت) يسقط ترتيبها؛ وبعد lines_changed أوّل قراءة ناجحة تصير
  // شرط الحفظ ويبقى ترتيب المستخدم (ما حُذف يخرج وما أُضيف في آخره). ضبط حالة من حالة أثناء الرسم بشرط يتوقّف.
  const serverLineIds = lines.map((line) => line.id);
  if (lineOrder !== null && (!isDraft || data.versionId !== lineOrder.versionId)) setLineOrder(null);
  else if (lineOrder !== null && lineOrder.changedAt !== null && reads > lineOrder.changedAt) {
    setLineOrder({ ...lineOrder, ids: reconcileOrder(lineOrder.ids, serverLineIds), basis: serverLineIds, changedAt: null });
  }
  const lineById = new Map(lines.map((line) => [line.id, line]));
  // المعروض بترتيب المستخدم إن غيّره، وإلّا بترتيب line_no؛ والسطر الذي لم يعرفه الترتيب (أُضيف بعده) في آخره.
  const shownLines = lineOrder ? reconcileOrder(lineOrder.ids, serverLineIds).flatMap((lineId) => lineById.get(lineId) ?? []) : lines;
  const orderPending = lineOrder !== null && (lineOrder.changedAt !== null || !sameOrder(lineOrder.ids, lineOrder.basis));
  // ترتيب لم يُحفظ يقفل تعديل السطور وإضافتها وحذفها والتفعيل (التفعيل يجمّد النسخة بترتيبها المحفوظ): «احفظ» أو «تراجع» أوّلاً.
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

  const columns = ((): Column<RecipeLine>[] => {
    const base: Column<RecipeLine>[] = [
      { key: 'item', header: t('mill.line.item', 'المادّة'), wrap: true, sticky: true, cell: (line) => line.itemName },
      { key: 'section', header: t('mill.col.section', 'القسم'), cell: (line) => line.categoryName ?? t('mill.section.none', 'بلا قسم') },
      { key: 'qty', header: t('mill.line.qty', 'الكمية'), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.qty, qtyDecimals)}</Num> },
      { key: 'unit', header: t('mill.line.unit_col', 'الوحدة'), cell: (line) => (line.unit === 'L' ? t('unit.L', 'لتر') : t('unit.kg', 'كغم')) },
      {
        key: 'mass',
        header: t('mill.col.mass', 'بالكيلوغرام'),
        kind: 'number',
        // الوقود والتعبئة خارج الكتلة (ب٩، مرآة البانية): لا رقم في عمود مجموعه كتلة المواد، فالمجموع = الخلايا. والكتلة التي لا تُعرف
        // (ب٣١، سطر باللتر بلا كثافة) «—»، ومعها المجموع.
        cell: (line) => <Num>{line.inBasis && line.massKg !== null ? fmtQtyCell(line.massKg, massDecimals) : dash()}</Num>,
        total: <Num>{data?.massKg === null || data?.massKg === undefined ? dash() : fmtQtyCell(data.massKg, massDecimals)}</Num>,
      },
      {
        key: 'share',
        header: t('mill.col.share', 'الحصّة'),
        kind: 'number',
        cell: (line) =>
          !line.inBasis ? (
            <span className="text-xs text-ink-muted" data-action="out-of-basis">
              {t('mill.line.out_of_basis', 'خارج الكتلة')}
            </span>
          ) : (
            <Num>{line.massKg !== null && shareOf !== null && shareOf > 0n ? pct(line.massKg, shareOf) : dash()}</Num>
          ),
      },
    ];
    if (costShown) {
      base.push(
        {
          key: 'last',
          header: t('mill.col.last_price', 'سعر الشراء (آخر شراء)'),
          kind: 'number',
          cell: (line) => <Num>{line.lastPrice === null ? dash() : fmtMoney(line.lastPrice)}</Num>,
        },
        {
          key: 'cost_price',
          header: t('mill.col.cost_price', 'سعر الكلفة'),
          kind: 'number',
          cell: (line) => {
            if (!canPrice) return <Num>{line.costPrice === null ? dash() : fmtMoney(line.costPrice)}</Num>;
            const saved = line.costPrice === null ? '' : decimalText(line.costPrice, 2);
            const draft = prices.get(line.itemId);
            const text = draft?.text ?? saved;
            const parsed = text.trim() === '' ? null : parseMoney(text);
            const unit = priceUnit(line);
            return (
              <CellEdit
                id={`${fieldId}-cost-${line.itemId}`}
                label={
                  // سعر الكلفة لوحدة أساس المادّة الآن (التكامل، الجولة الثالثة؛ وب٣١ بعد ق٤١): وحدة لا تُعرف حيّةً لا تُسمّى.
                  unit === null
                    ? t('mill.builder.cost_of_current', 'سعر كلفة «{name}» بوحدتها الحالية', { name: line.itemName })
                    : t('mill.builder.cost_of', 'سعر كلفة «{name}» لكلّ {unit}', { name: line.itemName, unit: unitWord(unit) })
                }
                value={text}
                dirty={draft !== undefined && text !== saved}
                invalid={text.trim() !== '' && (parsed === null || parsed <= 0n)}
                busy={busy}
                disabled={busy}
                action="cost-price"
                onChange={(next) => prices.write(line.itemId, next, line.costPrice)}
                onSave={() => savePrice(line)}
              />
            );
          },
        },
        {
          key: 'cost',
          header: t('mill.col.avg_cost', 'متوسّط المتاح'),
          kind: 'number',
          cell: (line) => <Num>{line.unitCost === null ? dash() : fmtMoney(line.unitCost)}</Num>,
        },
      );
    }
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
            {line.unitMismatch || line.baseUnit === 'pc' ? null : (
              // سطر باللتر لمادّة صارت بالكيلو، أو مادّة صارت بالقطعة (ب٤٧): حارس السطر يرفض تعديله (bad_recipe_unit) ولا اختيار للوحدة
              // يصلحه، فلا «عدّل» يقود إلى رفض؛ يبقى «احذف»، والجملة فوق تقول ما بعده.
              <Button size="sm" variant="ghost" icon={<Pencil className="size-4" aria-hidden="true" />} disabled={linesLocked} onClick={() => setEditing(line)} data-action="edit-line">
                {t('common.edit', 'عدّل')}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={linesLocked} onClick={() => setRemoving(line)} data-action="remove-line">
              {t('common.delete', 'احذف')}
            </Button>
          </span>
        ),
      });
    }
    return base;
  })();

  // مجموع لا يُعرف (ب٣١: سطر داخل الكتلة بلا كتلة) لا فرق له، فلا «مطابق» ولا تفعيل (الخادم يرفضه أصلاً).
  const sum = data.massKg;
  // حجم الخلطة المعروض: مجموع ما داخل الكتلة في المسوّدة (لا أساس يُكتب)، والأساس المجمَّد (= المجموع يوم التفعيل) في غيرها.
  const total = isDraft ? sum : data.basisKg;
  // سطور المسوّدة التي يرفض الخادم التفعيل بها ولو طابق المجموع الأساس (ب٤١): مكتوب باللتر ومادّته ليست باللتر (bad_recipe_unit)، أو مادّة
  // صارت بالقطعة بأيّ وحدة كُتب (bad_recipe_unit)، أو سائل بلا كثافة (density_required)، أو سطر لتر تُقرَّب كتلته صفراً (qty_not_positive، ق٦٤:
  // كُتب بكثافة أكبر ثمّ صغرت كثافة مادّته) — داخل الكتلة وخارجها. لكلّ منها جملة فوق.
  const blocked = isDraft ? lines.filter((line) => line.unitMismatch || line.densityMissing || line.baseUnit === 'pc' || line.massKg === 0n) : [];
  const balanced = sum !== null && sum > 0n && lines.length > 0 && blocked.length === 0;
  // كلفة الطنّ المتوقّعة من الخادم تقسم على الأساس المحفوظ: في المسوّدة لا تُعرض والأساس غير المجموع الآن (M2). ومجموع لا يُعرف (سطر بلا كتلة)
  // تقول اللوحة نفسها إنّها «على الأقلّ» ومعها ما لم يُحسب، فتبقى.
  const expectedCurrent = !isDraft || sum === null || sum === data.basisKg;
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
  // سطور النسخة المفعَّلة التي تغيّرت وحدة مادّتها بعد التفعيل (ق٣١، ب٢٧): الخادم يرفض الإنتاج بها (item_changed) حتّى نسخة جديدة.
  const unitChanged = data.status === 'active' ? lines.filter((line) => line.unitChanged) : [];
  // سطور المسوّدة المكتوبة باللتر ومادّتها الآن ليست باللتر (ق٤٢، ب٣١)، أو مادّتها صارت بالقطعة ولو كُتبت بالكيلو (ب٤١): لا تُفعَّل النسخة بها
  // (bad_recipe_unit) حتّى يُحذف السطر (ويُضاف بوحدة المادّة إن صلحت). وفي النسخة المجمَّدة تُخطَّط من لقطة الكثافة (ق٤١)، فلا جملة هناك.
  const mismatched = blocked.filter((line) => line.unitMismatch || line.baseUnit === 'pc');
  const mismatchText = (line: RecipeLine): string =>
    line.baseUnit === 'pc'
      ? t('mill.recipe.unit_mismatch_pc', 'صارت «{name}» تُقاس بالقطعة، فلا تدخل الخلطة: يُحذف سطرها.', { name: line.itemName })
      : canEdit
        ? t('mill.recipe.unit_mismatch', 'صارت «{name}» تُقاس بالكيلوغرام: احذف سطرها وأضفه بالكيلوغرام.', { name: line.itemName })
        : // من لا يعدّل الخلطة (درس ب٣٧): لا يُدلّ على فعل ليس له.
          t('mill.recipe.unit_mismatch_others', 'صارت «{name}» تُقاس بالكيلوغرام: يحذف المالك أو المدير سطرها ويضيفه بالكيلوغرام.', { name: line.itemName });
  // سائل بلا كثافة (ق٥١، ب٤٩): التفعيل يرفضه density_required، فالبطاقة تسمّيه قبل النقر. والكثافة تُكتب في نافذة «عدّل» من «المواد» (ب٦١:
  // بطاقة المادّة تعرضها قراءةً فقط)، فلمن يعدّل المواد «اكتب كثافته من «المواد»» برابط يفتح النافذة لتلك المادّة ويرجع بعد الحفظ إلى هذه
  // المسوّدة بنسختها، ولغيره من يكتبها بلا رابط (درس ب٣٧: لا يُدلّ على فعل ليس له).
  const densityMissing = blocked.filter((line) => line.densityMissing);
  const densityText = (line: RecipeLine): string =>
    canItems
      ? t('mill.recipe.density_items', '«{name}» سائل بلا كثافة: اكتب كثافته من «المواد» ثمّ فعّل.', { name: line.itemName })
      : t('mill.recipe.density_items_others', '«{name}» سائل بلا كثافة: يكتبها المالك أو المدير من «المواد».', { name: line.itemName });
  const densityPath = (line: RecipeLine): string =>
    `/inventory/items?${new URLSearchParams({ edit: line.itemId, back: data.versionId ? `/mill/recipe/${id}?version=${data.versionId}` : `/mill/recipe/${id}` }).toString()}`;
  // سطر لتر تُقرَّب كتلته صفراً (ق٦٤): التفعيل يرفضه qty_not_positive، فالبطاقة تسمّيه قبل النقر بعلاج الخادم نفسه (كمية أكبر في «عدّل»)، ولمن لا
  // يعدّل الخلطة من يكتبها (درس ب٣٧).
  const zeroMass = blocked.filter((line) => line.massKg === 0n);
  const zeroMassText = (line: RecipeLine): string =>
    canEdit
      ? t('mill.recipe.zero_mass', 'كمية «{name}» في الخلطة تُقرَّب صفراً بالكيلوغرام: اكتب كمية أكبر.', { name: line.itemName })
      : t('mill.recipe.zero_mass_others', 'كمية «{name}» في الخلطة تُقرَّب صفراً بالكيلوغرام: يكتب المالك أو المدير كمية أكبر.', { name: line.itemName });
  // ما كُتب في الصفحة ولم يُحفظ (ب٤٩): رابط الكثافة يغادر الصفحة فيضيّعه، فلا يظهر حتّى يُحفظ أو يُمسح.
  const pageDirty =
    lines.some((line) => {
      const draft = prices.get(line.itemId);
      return draft !== undefined && draft.text !== (line.costPrice === null ? '' : decimalText(line.costPrice, 2));
    }) ||
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
    if (cell?.kind === 'price') {
      const line = lines.find((entry) => entry.itemId === cell.id);
      if (line && prices.get(cell.id)) {
        return t('mill.conflict.price', 'المحفوظ الآن لسعر كلفة «{name}»: {saved}، وما كتبته باقٍ في خانته: احفظه ليحلّ محلّه.', {
          name: line.itemName,
          saved: line.costPrice === null ? t('mill.conflict.no_price', 'بلا سعر') : fmtMoney(line.costPrice),
        });
      }
    } else if (cell?.kind === 'rate') {
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
      total: data.expected ? <Num>{fmtMoney(data.expected.ratesPerTon)}</Num> : undefined,
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
      <BackButton to="/mill" label={t('back.mill', 'رجوع إلى المعمل')} action="back-to-mill" />
      <PageHeader
        title={data.name}
        subtitle={t('mill.card.output', 'تنتج: {item}', { item: data.outputItem.name })}
      />

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
              {t('mill.recipe.editing', 'تعدّل الآن مسوّدة الخلطة: غيّر الموادّ وكمياتها، ثمّ اضغط «فعّل النسخة» لتصير هي المعتمدة في الإنتاج.')}
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

      {unitChanged.length ? (
        <div className="flex flex-col gap-2" data-action="unit-changed">
          {unitChanged.map((line) => (
            <Notice
              key={line.id}
              tone="warning"
              title={t('mill.recipe.unit_changed', 'تغيّرت وحدة «{name}» بعد التفعيل: لا يُنتَج بهذه النسخة حتّى تُنشأ نسخة جديدة وتُفعَّل.', { name: line.itemName })}
            />
          ))}
        </div>
      ) : null}

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

      {zeroMass.length ? (
        <div className="flex flex-col gap-2" data-action="zero-mass">
          {zeroMass.map((line) => (
            <Notice key={line.id} tone="warning" title={zeroMassText(line)} />
          ))}
        </div>
      ) : null}

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1" data-action="recipe-total">
          <p className="text-lg font-semibold">{t('mill.cards.sum', 'مجموع الخلطة: {kg}', { kg: total === null ? dash() : kgText(total) })}</p>
          <p className="text-sm text-ink-muted">{t('mill.cards.output', 'الناتج المتوقّع: {kg} (قبل الهدر)', { kg: total === null ? dash() : kgText(total) })}</p>
        </div>
        <CompositionBar pieces={shownLines.filter((line) => line.inBasis).map((line) => ({ key: line.id, label: line.itemName, weight: line.massKg }))} total={total !== null && total > 0n ? total : 1n} hue={hue} />
        <div className="flex flex-wrap gap-1.5">
          {sections.map((section, index) => (
            <Chip key={section.name} dot={pieceColor(hue, index)}>
              <span className="truncate">{section.name}</span>
              <Num>{section.mass === null ? dash() : fmtQty(section.mass, 'kg').main}</Num>
            </Chip>
          ))}
        </div>
      </section>

      {isDraft && lines.length ? (
        sum === null ? (
          <Notice tone="warning" title={t('mill.detail.gap_unknown', 'لا يُحسب المجموع: كتلة سطر أو أكثر لا تُعرف.')} />
        ) : sum === 0n ? (
          <Notice tone="warning" title={t('mill.detail.sum_zero', 'مجموع الخلطة صفر: أضف مادّة داخل الكتلة (الوقود والتعبئة خارجها).')} />
        ) : blocked.length ? (
          // في المسوّدة سطر يرفض الخادم التفعيل به (ب٤١): لا «جاهزة»، والجمل فوق تسمّي السطور وما العمل.
          <Notice tone="warning" title={t('mill.detail.sum_blocked', 'مجموع الخلطة {kg}، ولا تُفعَّل حتّى تُصحَّح السطور أعلاه.', { kg: kgText(sum) })} />
        ) : (
          <Notice tone="info" title={t('mill.detail.sum_ready', 'مجموع الخلطة {kg}: الخلطة جاهزة للتفعيل.', { kg: kgText(sum) })} />
        )
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
        caption={t('mill.detail.caption_total', 'مواد الخلطة وحصّة كلّ مادّة من مجموعها')}
        columns={columns}
        rows={shownLines}
        rowKey={(line) => line.id}
        empty={t('mill.detail.empty', 'لا مواد في هذه النسخة بعد.')}
        totalLabel={t('mill.detail.total', 'المجموع')}
      />
      {onHand && lines.length ? (
        <div className="flex flex-wrap items-center gap-2" data-action="recipe-on-hand">
          <span className="text-sm font-medium">{t('mill.detail.on_hand', 'في المخزن الآن:')}</span>
          {shownLines.map((line) => {
            const stock = onHand.get(line.itemId);
            return stock ? <Chip key={line.id}>{t('mill.detail.on_hand_item', '{item} — {on_hand}', { item: line.itemName, on_hand: onHandText(stock) })}</Chip> : null;
          })}
        </div>
      ) : null}

      {isDraft && canEdit ? (
        <div className="flex flex-wrap items-end gap-3">
          {/* أثناء الحفظ والقراءة من جديد (ب٤٣)، وترتيب موادّ لم يُحفظ (0023): لا تُفتح نافذة سطر تتبدّل الصفحة تحتها، ولا تُفعَّل النسخة بغير ترتيبها. */}
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
          <Button size="lg" icon={<CheckCircle2 className="size-5" aria-hidden="true" />} busy={busy} disabled={!balanced || orderPending} onClick={activate} data-action="activate-version">
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
          {data.expected && expectedCurrent ? <ExpectedPanel expected={data.expected} canPrice={canPrice} /> : null}
          {data.expected && !expectedCurrent ? (
            // الخادم يقسم كلفة المواد على الأساس المحفوظ، فلا تُعرض كلفة طنّ من أساس غير المجموع الآن (M2).
            <Notice
              tone="info"
              title={t('mill.expected.stale', 'تُحدَّث كلفة الطنّ المتوقّعة بعد حفظ مجموع الخلطة الجديد.')}
              action={
                canEdit && sum !== null && sum > 0n ? (
                  <Button size="sm" variant="secondary" busy={busy} onClick={() => void act(syncBasis)} data-action="sync-basis">
                    {t('mill.expected.sync', 'حدّث كلفة الطنّ')}
                  </Button>
                ) : undefined
              }
            />
          ) : null}
        </section>
      ) : null}

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
      {editing ? (
        <LineDialog
          line={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void act(syncBasis);
          }}
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
              await syncBasis();
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
