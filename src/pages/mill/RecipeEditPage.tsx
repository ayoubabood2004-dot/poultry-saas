import { ArrowDown, ArrowUp, CheckCircle2, ChefHat, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { searchable } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { ITEM_KINDS, type ItemKind } from '../../domain/stores';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { editRecipe, loadRecipe, loadRecipes, type RecipeDetail, type RecipeEditInput, type RecipeLine } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { itemKindLabel } from '../../lib/storeLabels';
import { MaterialCards, useCardLines, useMillStock, viewCardLine } from './cards';
import { millAdmissible, type PickedMaterial } from './pickers';
import { MaterialName, NameCell, sameOrder, slotsOf, useKeptLoad } from './shared';

// «تعديل الخلطة» بشاشة واحدة (0028، كلمة الزبون 2026-11-15: لا تعديل للخلطة إلّا بتفعيل نسخة جديدة، والقديمة لا تُحذف، والتعديل والحذف أهمّ ما
// في الخلطات): كان «عدّل الخلطة» مسوّدةً تُكمَل ثمّ تُفعَّل بزرّ ثانٍ. هنا تبدأ الشاشة باسم الخلطة وموادّ نسختها المفعَّلة بترتيبها، تُضاف الموادّ
// وتُحذف وتُرتَّب بالبطاقات والجدول كبانية الخلطة، و«احفظ التعديل» نداء edit_recipe واحد يحفظ الاسم والموادّ ويفعّلها (المفعَّلة السابقة تُقاعد
// ويحفظها السجلّ، ومسوّدة قديمة يحلّ التعديل محلّها). الحفظ مشروط بالمفعَّلة كما قُرئت: recipe_changed يُقال بتلميحه وتُقرأ الخلطة من جديد ويبقى ما
// اختاره المستخدم واسمه، فالحفظ التالي على ما صارت فيه. والمرجع من الجهاز يبقى حتّى جواب نهائي: نتيجة مجهولة تجمّد الشاشة وفعلها الوحيد «أعد
// المحاولة» بالطلب نفسه حرفاً (قاعدة البانية، ب١٤).

/**
 * لم يُحفظ شيء أكيداً (قاعدة البانية، ب١٤): رفض الخادم، أو لم يخرج الطلب أو لم يصل (NetworkError)، أو تزاحم فرجع (RetryableError)، أو لا قاعدة
 * ولا جلسة. وغيرها نتيجة مجهولة (UnknownOutcomeError وكلّ خطأ غير متوقّع): ربّما حُفظ التعديل.
 */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

/** نوع المادّة من رمز القارئ؛ والرمز الذي لا يُعرف «أخرى»: لا يصلح للخلطة، فتسمّيه الشاشة ليُحذف (لا يُرسل صامتاً). */
const kindOf = (kind: string): ItemKind => ((ITEM_KINDS as readonly string[]).includes(kind) ? (kind as ItemKind) : 'other');

/** سطر النسخة مادّةً مختارة: بوحدة أساس المادّة الآن، وكثافة السائل تُقرأ مع صفّه بعد التركيب (useCardLines). */
const pickedOfLine = (line: RecipeLine): PickedMaterial => ({ id: line.itemId, name: line.itemName, kind: kindOf(line.kind), baseUnit: line.baseUnit, density: null });

interface EditData {
  /** النسخة المفعَّلة بموادّها، وإلّا ما اختاره الخادم (خلطة بلا مفعَّلة). */
  detail: RecipeDetail;
  /** أسماء الخلطات الظاهرة الأخرى (الخادم يرفض الاسم المكرّر recipe_name_taken، والشاشة تقوله قبل الإرسال كالبانية). */
  taken: readonly string[];
}

/**
 * الخلطة للتعديل: recipe_detail بلا نسخة (يختار الخادم المفعَّلة، وإلّا آخر نسخة)، وإن رجعت غير المفعَّلة وللخلطة مفعَّلة تُقرأ المفعَّلة نفسها؛
 * ومعها أسماء الخلطات الأخرى من recipes_overview.
 */
async function loadForEdit(id: string): Promise<EditData> {
  const [first, recipes] = await Promise.all([loadRecipe(id), loadRecipes()]);
  const active = first.versions.find((version) => version.status === 'active') ?? null;
  const detail = active && first.versionId !== active.id ? await loadRecipe(id, active.id) : first;
  return { detail, taken: recipes.filter((recipe) => !recipe.archived && recipe.id !== id).map((recipe) => recipe.name) };
}

/**
 * نموذج التعديل: يُركَّب مرّة بأوّل قراءة (الاسم والموادّ منها)، والقراءة من جديد بعد recipe_changed تبدّل data وحدها (شرط الحفظ والعنوان وجملة
 * المسوّدة) ويبقى ما اختاره المستخدم (درس WP5: ما لا يُمحى بالقراءة يعيش فوقها).
 */
function EditForm({
  data,
  refreshing,
  reads,
  rereadFailed,
  onReread,
  backTo,
}: {
  data: EditData;
  refreshing: boolean;
  reads: number;
  rereadFailed: boolean;
  onReread: () => void;
  backTo: string;
}) {
  const { detail, taken } = data;
  const fieldId = useId();
  const navigate = useNavigate();
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const canCreateItem = role !== null && can(role, 'item.create');
  // كتابة كثافة السائل وتصحيح نوع المادّة: تعديل المادّة للمدير (stores.manage)، كالبانية.
  const canFixKind = role !== null && can(role, 'stores.manage');
  const stock = useMillStock();
  // سطور النسخة المقروءة بترتيب line_no (الخادم يرسلها به، والترتيب هنا دفاع).
  const saved = useMemo(() => [...detail.lines].sort((a, b) => a.lineNo - b.lineNo), [detail]);
  // ما تبدأ به الشاشة: موادّ النسخة المقروءة أوّل مرّة بترتيبها واسم الخلطة؛ ثمّ ما يختاره المستخدم.
  const [initial] = useState(() => saved.map(pickedOfLine));
  const picks = useCardLines(initial);
  const [name, setName] = useState(detail.name);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** رفض recipe_changed: تلميحه وعدد القراءات لحظته، فأوّل قراءة ناجحة بعده تصير شرط الحفظ. */
  const [changed, setChanged] = useState<{ hint: string; at: number } | null>(null);
  /** حمولة edit_recipe بعد نتيجة مجهولة: الشاشة مجمَّدة حتّى جواب نهائي، والإعادة بها وحدها. */
  const [frozen, setFrozen] = useState<RecipeEditInput | null>(null);
  /** مرجع المحاولة من الجهاز: يبقى حتّى جواب نهائي (الإعادة بعد جواب ضاع لا تُحفظ مرّتين). */
  const ref = useRef<string | null>(null);
  const noExclude = useMemo(() => new Set<string>(), []);

  const active = detail.versions.find((version) => version.status === 'active') ?? null;
  const draft = detail.versions.find((version) => version.status === 'draft') ?? null;
  // شرط الحفظ: النسخة المقروءة إن كانت للخلطة مفعَّلة (وإن تبدّلت بين القراءتين يرفضها الخادم recipe_changed فتُقرأ من جديد)، وnull بلا مفعَّلة.
  const expected = active ? detail.versionId : null;
  const waiting = changed !== null && reads <= changed.at;
  // كلّ حقل وزرّ مقفول أثناء الحفظ، وبعد نتيجة مجهولة (قاعدة البانية، ب١٢ وب١٤).
  const locked = saving || frozen !== null;
  const view = picks.lines.map(viewCardLine);
  // لون كلّ مادّة بموضعها بين ما داخل الكتلة (لونها في شريط التركيبة)، وما خارجها بلا لون.
  const slots = slotsOf(view.map((row) => ({ key: row.line.item.id, inBasis: row.inBasis })));
  const nameTaken = name.trim() !== '' && taken.some((other) => searchable(other) === searchable(name));
  const edited =
    name.trim() !== detail.name ||
    !sameOrder(
      picks.lines.map((line) => line.item.id),
      saved.map((line) => line.itemId),
    );
  // ما لم يُحفظ، والطلب في الطريق، والنتيجة المجهولة: النافذة «فيها ما لم يُحفظ».
  useDirtyForm(edited || saving || frozen !== null);

  // ما يمنع الحفظ مكتوب تحت الزرّ (كالبانية، م٥).
  const missing: string[] = [];
  if (name.trim() === '') missing.push(t('mill.builder.need_name', 'اكتب اسم الخلطة.'));
  else if (nameTaken) missing.push(t('mill.builder.need_other_name', 'اسم الخلطة لخلطة أخرى: اختر اسماً غيره.'));
  if (!view.length) missing.push(t('mill.builder.need_materials', 'اختر مادّة واحدة على الأقلّ من البطاقات.'));
  else if (!view.some((row) => row.inBasis)) missing.push(t('mill.builder.need_basis_line', 'أضف مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يكوّنان خلطة.'));
  for (const row of view) {
    const item = row.line.item;
    // مادّة في النسخة المفعَّلة صارت لا تصلح للخلطة بعد تفعيلها: تُسمّى لتُحذف قبل الإرسال (الخادم يرفضها).
    if (item.baseUnit === 'pc') missing.push(t('mill.edit.need_unit_pc', '«{name}» صارت تُقاس بالقطعة فلا تدخل الخلطة: احذفها من الجدول.', { name: item.name }));
    else if (!millAdmissible({ archived: false, kind: item.kind, baseUnit: item.baseUnit })) {
      missing.push(t('mill.edit.need_admissible', '«{name}» لم تعد من موادّ الخلطة (نوعها الآن «{kind}»): احذفها من الجدول.', { name: item.name, kind: itemKindLabel(item.kind) }));
    } else if (row.densityMissing) missing.push(t('mill.builder.need_density_v4', '«{name}» سائل بلا كثافة: اكتب كثافته على بطاقته.', { name: item.name }));
    else if (row.densityUnread) missing.push(t('mill.builder.density_unread', 'كثافة «{name}» لم تُقرأ بعد: انتظر لحظة أو أعد قراءتها من بطاقته.', { name: item.name }));
  }
  const canSave = missing.length === 0 && !locked && !refreshing && !waiting;

  /**
   * نداء edit_recipe بحمولة محفوظة: الأوّل من «احفظ التعديل»، والإعادة بعد نتيجة مجهولة بالحمولة نفسها حرفاً. جواب نهائي (نجاح أو رفض بسبب) يفكّ
   * التجميد وينسى المرجع، فالمحاولة التالية بمرجع جديد؛ والرفض بعد الإعادة يعني أنّ الأولى لم تُحفظ (edit_recipe بالمرجع نفسه يرجّع جواب الأولى).
   */
  const submit = async (input: RecipeEditInput, retrying: boolean) => {
    setSaving(true);
    setFailure(null);
    setChanged(null);
    try {
      const result = await editRecipe(input);
      ref.current = null;
      setFrozen(null);
      toast({
        tone: 'success',
        title: result.changed
          ? t('mill.edit.saved', 'حُفظ تعديل الخلطة «{name}»: موادّها الآن كما اخترت، وتُستعمل في الإنتاج من الآن.', { name: result.name })
          : t('mill.edit.unchanged', 'لا تغيير: الخلطة كما كانت.'),
      });
      navigate(backTo, { replace: true });
    } catch (problem) {
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن حُفظت المحاولة الأولى: تتجمّد الشاشة بحمولتها، والإعادة وحدها ممكنة (لن تُحفظ مرّتين). وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(input);
        if (retrying && surelyUnsaved(problem)) setFailure(t('mill.builder.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.'));
      } else {
        ref.current = null;
        setFrozen(null);
        if (problem instanceof RejectedError && problem.code === 'recipe_changed') {
          // تغيّرت الخلطة بعد قراءتها: تُقرأ من جديد ويبقى ما اختاره المستخدم واسمه، وتصير المفعَّلة الجديدة شرط الحفظ التالي.
          setChanged({ hint: failureText(problem), at: reads });
          onReread();
        } else {
          // كثافة سائل كُتبت أو مُحيت من جهاز آخر بعد قراءة البطاقة (density_required): تُقرأ كثافات السوائل المختارة من جديد، والرفض بتلميحه.
          if (problem instanceof RejectedError && problem.code === 'density_required') {
            for (const line of picks.lines) if (line.item.baseUnit === 'L') picks.retryDensity(line.item.id);
          }
          setFailure(failureText(problem));
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!canSave) return;
    ref.current ??= crypto.randomUUID();
    void submit(
      {
        recipeId: detail.id,
        expectedActive: expected,
        name: name.trim(),
        lines: picks.lines.map((line) => ({ itemId: line.item.id })),
        clientRef: ref.current,
      },
      false,
    );
  };

  const columns: Column<(typeof view)[number]>[] = [
    { key: 'no', header: t('mill.col.no', '#'), kind: 'number', cell: (_row, index) => <Num>{fmtInt(index + 1)}</Num> },
    {
      key: 'item',
      header: t('mill.line.item', 'المادّة'),
      sticky: true,
      cell: (row) => (
        <NameCell>
          <MaterialName name={row.line.item.name} slot={slots.get(row.line.item.id) ?? null} />
        </NameCell>
      ),
    },
    { key: 'kind', header: t('mill.col.kind', 'النوع'), cell: (row) => itemKindLabel(row.line.item.kind) },
    {
      key: 'basis',
      header: t('mill.col.in_basis', 'داخل الكتلة'),
      cell: (row) =>
        row.inBasis ? (
          t('mill.in_basis.yes', 'نعم')
        ) : (
          <span className="text-xs text-ink-muted" data-action="out-of-basis">
            {t('mill.line.out_of_basis', 'خارج الكتلة')}
          </span>
        ),
    },
    // الترتيب بالسهمين: ترتيب الجدول ترتيب p_lines، والخادم يرقّم السطور به.
    {
      key: 'actions',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (row, index) => (
        <span className="flex items-center gap-1">
          <IconButton
            label={t('mill.order.up_line', 'قدّم «{name}»', { name: row.line.item.name })}
            className="disabled:opacity-50"
            disabled={locked || index === 0}
            onClick={() => picks.move(row.line.item.id, -1)}
            data-action="line-up"
            data-id={row.line.item.id}
          >
            <ArrowUp aria-hidden="true" className="size-5" />
          </IconButton>
          <IconButton
            label={t('mill.order.down_line', 'أخّر «{name}»', { name: row.line.item.name })}
            className="disabled:opacity-50"
            disabled={locked || index === view.length - 1}
            onClick={() => picks.move(row.line.item.id, 1)}
            data-action="line-down"
            data-id={row.line.item.id}
          >
            <ArrowDown aria-hidden="true" className="size-5" />
          </IconButton>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="size-4" aria-hidden="true" />}
            disabled={locked}
            onClick={() => picks.remove(row.line.item.id)}
            data-action="remove-line"
            data-id={row.line.item.id}
          >
            {t('common.delete', 'احذف')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('mill.edit.title', 'تعديل الخلطة «{name}»', { name: detail.name })}
        subtitle={t('mill.edit.subtitle', 'غيّر اسمها أو موادّها أو ترتيبها ثمّ اضغط «احفظ التعديل»: تُستعمل في الإنتاج من لحظتها، ويبقى ما قبلها في سجلّها.')}
      />

      {draft ? (
        <div data-action="edit-draft-notice">
          <Notice tone="info" title={t('mill.edit.draft', 'لهذه الخلطة تعديل سابق لم يُفعَّل (نسخة {no}): حفظ هذا التعديل يحلّ محلّه.', { no: fmtInt(draft.versionNo) })} />
        </div>
      ) : null}

      <section className="card flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <ChefHat aria-hidden="true" className="size-6 text-brand-700 dark:text-brand-200" />
          <h2 className="text-lg font-semibold">{t('mill.builder.head', 'الخلطة ومنتجها')}</h2>
        </div>
        <Field
          id={`${fieldId}-name`}
          label={t('mill.recipe.name', 'اسم الخلطة')}
          hint={t('mill.recipe.name_hint', 'مثل: علف بادئ، علف ناهٍ.')}
          error={nameTaken ? t('mill.builder.name_taken', 'توجد خلطة بهذا الاسم؛ اختر اسماً آخر أو افتحها من المعمل.') : null}
        >
          <input id={`${fieldId}-name`} className="input" maxLength={80} value={name} disabled={locked} onChange={(event) => setName(event.target.value)} data-action="edit-name" />
        </Field>
        <div className="flex flex-col gap-1">
          <p className="font-medium" data-action="edit-output">
            {t('mill.card.output', 'تنتج: {item}', { item: detail.outputItem.name })}
          </p>
          <p className="text-sm text-ink-muted">{t('mill.edit.output_fixed', 'لا يتغيّر منتج الخلطة بالتعديل: لمنتج آخر أنشئ خلطة جديدة.')}</p>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t('mill.builder.materials', 'المواد')}</h2>
        <p className="text-sm text-ink-muted">{t('mill.cards.hint_pick', 'المس البطاقة لتختار المادّة؛ لمسة ثانية تتركها. تختار أكثر من مادّة معاً، والكميات تُكتب عند كلّ إنتاج.')}</p>
        <MaterialCards
          id={`${fieldId}-cards`}
          stock={stock}
          picks={picks}
          query={query}
          onQuery={setQuery}
          exclude={noExclude}
          canCreate={canCreateItem}
          canFixKind={canFixKind}
          canWriteDensity={canFixKind}
          disabled={locked}
        />
        <DataTable
          caption={t('mill.edit.caption', 'موادّ الخلطة بعد التعديل بترتيبها ونوع كلّ مادّة')}
          columns={columns}
          rows={view}
          rowKey={(row) => row.line.item.id}
          empty={t('mill.edit.empty', 'لم تبقَ في الخلطة مادّة: المس بطاقة مادّة فوق لتختارها.')}
        />
        {view.length > 1 ? (
          <p className="text-sm text-ink-muted" data-action="edit-order-note">
            {t('mill.builder.order_note', 'تُحفظ الموادّ في الخلطة بترتيب هذا الجدول: قدّم أو أخّر أيّ مادّة بالسهمين.')}
          </p>
        ) : null}
        {view.some((row) => !row.inBasis) ? (
          <p className="text-sm text-ink-muted" data-action="edit-mass-note">
            {t('mill.builder.outside_note_v4', 'الوقود والتعبئة خارج كتلة الخلطة: يُسحبان وتُحسب كلفتهما، ولا يدخلان ناتجها.')}
          </p>
        ) : null}
      </section>

      {changed ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-warn-700 dark:text-warn-300" data-action="edit-changed">
            {changed.hint}{' '}
            {waiting
              ? rereadFailed
                ? t('mill.edit.changed.failed', 'وتعذّرت قراءة الخلطة من جديد: أعد القراءة، ثمّ احفظ تعديلك إن شئت.')
                : t('mill.order.lines_changed.reading', 'جارٍ قراءة الخلطة من جديد…')
              : t('mill.edit.changed.kept', 'قُرئت الخلطة من جديد، وما اخترته باقٍ: احفظ التعديل ليحلّ محلّ ما حُفظ الآن، أو ارجع دون حفظ.')}
          </p>
          {waiting && rereadFailed ? (
            <Button size="sm" variant="secondary" onClick={onReread} data-action="edit-reread">
              {t('dayb.reread', 'أعد القراءة')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}
      {frozen ? (
        <div data-action="edit-frozen">
          <Notice
            tone="warning"
            title={t('mill.edit.frozen', 'لا نعرف إن حُفظ التعديل: أعد المحاولة قبل أيّ تغيير؛ لن يُحفظ مرّتين.')}
            action={
              <Button busy={saving} onClick={() => void submit(frozen, true)} data-action="retry-recipe-edit">
                {t('mill.builder.retry', 'أعد المحاولة')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" icon={<CheckCircle2 className="size-5" aria-hidden="true" />} busy={saving} disabled={!canSave} onClick={save} data-action="save-recipe-edit">
            {t('mill.edit.save', 'احفظ التعديل')}
          </Button>
        </div>
      )}
      {frozen || !missing.length ? null : (
        <div className="flex flex-col gap-1 text-sm" data-action="edit-missing">
          <p className="font-medium">{t('mill.builder.missing_draft', 'لا تُحفظ الخلطة قبل ما يلي:')}</p>
          <ul className="list-disc ps-5 text-ink-muted">
            {missing.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function RecipeEditPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  // من بطاقة المعمل (?back=mill) يرجع إلى المعمل، وإلّا إلى صفحة الخلطة.
  const fromMill = params.get('back') === 'mill';
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const canEdit = role !== null && can(role, 'recipe.activate');
  const load = useCallback(() => loadForEdit(id), [id]);
  // الخلطة تبقى مرسومة بآخر ما قُرئ أثناء القراءة من جديد (ب٤٣)، فلا يُطوى النموذج ولا يُمحى ما اختاره المستخدم.
  const { data, error, loading, refreshing, retry, reads } = useKeptLoad<EditData>(load, id);
  const recipePath = `/mill/recipe/${id}`;
  const backTo = fromMill ? '/mill' : recipePath;
  const back = fromMill ? (
    <BackButton to="/mill" label={t('back.mill', 'رجوع إلى المعمل')} action="back-to-mill" />
  ) : (
    <BackButton
      to={recipePath}
      label={data ? t('millrep.back', 'رجوع إلى «{name}»', { name: data.detail.name }) : t('mill.edit.back_recipe', 'رجوع إلى الخلطة')}
      action="back-to-recipe"
    />
  );

  const content = ((): ReactNode => {
    if (!canEdit && session.status === 'ready') return <Notice tone="info" title={t('mill.edit.forbidden', 'تعديل الخلطات للمالك والمدير.')} />;
    if (error && !data) return <LoadFailed what={t('mill.edit.what', 'الخلطة')} error={error} onRetry={retry} />;
    if (loading || !data) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;
    if (data.detail.archived) return <Notice tone="warning" title={t('mill.edit.archived', 'هذه الخلطة محذوفة من المعمل: أعِدها من صفحتها أوّلاً، ثمّ عدّلها.')} />;
    return <EditForm data={data} refreshing={refreshing} reads={reads} rereadFailed={!refreshing && error !== null} onReread={retry} backTo={backTo} />;
  })();

  return (
    <div className="flex flex-col gap-5">
      {back}
      {content}
    </div>
  );
}
