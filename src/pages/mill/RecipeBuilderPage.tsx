import { ArrowDown, ArrowUp, ChefHat, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { parseMoney } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { fmtInt, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { createItem, updateItem, type ItemRow } from '../../lib/repo/inventory';
import { createRecipe, loadBuilder, type BuilderData, type CategoryOption, type RecipeInput } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { MaterialCards, useCardLines, useMillStock, viewCardLine } from './cards';
import { kindFixFailure, NewCategoryField, newItemFields, NO_CATEGORY_DRAFT, sameNameTwins, type CategoryDraft, type TwinView } from './pickers';
import { dash, MaterialName, slotsOf } from './shared';

// بانية الخلطة بشاشة واحدة (0016، كلمة المالك 2026-11-04: «لمن اسوي خلطة… المفروض تطلعلي قائمة انتاج كاملة اضيف منها المواد…
// وايضا اضيف اشياء اختيارية وتكاليف اختيارية حتى لو ما موجودة بالمعمل»): الاسم والمنتج (يُختار أو يُنشأ هنا) وبطاقات المواد وجدول تكاليف
// الطنّ، والحفظ نداء create_recipe واحد (معاملة واحدة).
// «الخلطة موادّ بلا كميات» (0025، كلمة المالك 2026-11-10: «اني بس احدد شنو المواد الي اريدها من دون ما احدد كميات لكن لمن اريد اسوي انتاج…
// بلحضتها احدد الكميات»): لا خانة كمية ولا أساس ولا «مجموع الخلطة» ولا كلفة طنّ متوقّعة؛ تُختار الموادّ بالبطاقات وتُرتَّب بالسهمين، والجدول تحتها
// بالترتيب ونقطة لون كلّ مادّة (لونها في شريط التركيبة بعد الإنتاج) ونوعها وهل هي داخل الكتلة. والحفظ يفعّل الخلطة فوراً (p_basis_kg فارغ والسطور
// بمعرّفات المواد وحدها)، والكميات تُكتب في شاشة الإنتاج كلّ مرّة.
// إصلاحات المراجعة باقية: id_conflict يُقال برابط الخلطة المحفوظة ولا يُولَّد معرّفان بصمت (م١)؛ فئة المصروف من مكانها (م٣)؛ ما ينقص للحفظ مكتوب تحت
// الزرّ (م٥)؛ المنتج يمرّ بالتوائم قبل إنشائه (م٨)؛ والحقول مقفولة أثناء الحفظ (ب١٢)؛ وبعد نتيجة مجهولة تتجمّد البانية وفعلها الوحيد «أعد المحاولة»
// بطلب create_recipe نفسه حرفاً (ب١٤).

interface RateRow {
  key: string;
  categoryId: string;
  amountText: string;
}

/**
 * لم يُحفظ شيء أكيداً (ب١٤): رفض الخادم، أو لم يخرج الطلب أو لم يصل (NetworkError)، أو تزاحم فرجع (RetryableError)، أو لا قاعدة
 * ولا جلسة. وغيرها نتيجة مجهولة (UnknownOutcomeError وكلّ خطأ غير متوقّع): ربّما كُتبت الخلطة.
 */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

export default function RecipeBuilderPage() {
  const id = useId();
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? null;
  const canBuild = role !== null && can(role, 'recipe.activate');
  const canCreateItem = role !== null && can(role, 'item.create');
  // تعديل نوع مادّة موجودة («اجعلها مادّة أوّلية»/«اجعلها علفاً جاهزاً») وكثافتها: تعديل المادّة للمدير (stores.manage).
  const canFixKind = role !== null && can(role, 'stores.manage');
  const canCategories = role !== null && can(role, 'expense_categories.manage');
  const costs = Boolean(workspace?.canSeeCost);
  const load = useCallback(() => loadBuilder(), []);
  const { data, error, retry } = useLoad<BuilderData>(load);
  // البطاقات و«عندك» (0017، كلمة المالك 2026-11-06) من قراءة items_overview واحدة للصفحة.
  const stock = useMillStock();
  // المختار ونصّ البحث في الصفحة (درس WP5).
  const picks = useCardLines();
  const [query, setQuery] = useState('');

  const [name, setName] = useState('');
  const [outputId, setOutputId] = useState('');
  const [madeOutputs, setMadeOutputs] = useState<readonly { id: string; name: string }[]>([]);
  const [newOutput, setNewOutput] = useState('');
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [outputTwins, setOutputTwins] = useState<{ query: string; rows: readonly TwinView[] } | null>(null);
  const [rates, setRates] = useState<readonly RateRow[]>([]);
  const [madeCategories, setMadeCategories] = useState<readonly CategoryOption[]>([]);
  const [category, setCategory] = useState<CategoryDraft>(NO_CATEGORY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** معرّف خلطة حُفظت بمحاولة سابقة بمحتوى غير الذي تراه الشاشة (id_conflict، م١). */
  const [conflict, setConflict] = useState<string | null>(null);
  /** حمولة create_recipe بعد نتيجة مجهولة (ب١٤): البانية مجمَّدة حتى جواب نهائي، والإعادة بها وحدها. */
  const [frozen, setFrozen] = useState<RecipeInput | null>(null);
  const ids = useRef<{ recipe: string; version: string } | null>(null);
  const rateSeq = useRef(0);

  const lines = picks.lines;
  const dirty = name.trim() !== '' || lines.length > 0 || rates.length > 0 || newOutput.trim() !== '' || outputId !== '';
  useDirtyForm(dirty && !saving);
  // كلّ حقل وزرّ مقفول أثناء الحفظ (ب١٢) وبعد نتيجة مجهولة (ب١٤).
  const locked = saving || frozen !== null;

  const outputs = useMemo(() => [...(data?.feedItems ?? []), ...madeOutputs.filter((made) => !(data?.feedItems ?? []).some((item) => item.id === made.id))], [data, madeOutputs]);
  const categories = useMemo(
    () => [...(data?.categories ?? []), ...madeCategories.filter((made) => !(data?.categories ?? []).some((category) => category.id === made.id))],
    [data, madeCategories],
  );
  const nameTaken = name.trim() !== '' && (data?.recipeNames ?? []).some((taken) => searchable(taken) === searchable(name));

  const view = lines.map(viewCardLine);
  // لون كلّ مادّة بموضعها بين ما داخل الكتلة (لونها في شريط التركيبة بعد الإنتاج)، وما خارجها بلا لون.
  const slots = slotsOf(view.map((row) => ({ key: row.line.item.id, inBasis: row.inBasis })));
  const categoryName = (categoryId: string) => categories.find((category) => category.id === categoryId)?.name ?? dash();
  const ratesView = rates.map((rate) => {
    const value = rate.amountText.trim() === '' ? null : parseMoney(rate.amountText);
    // سطر تكلفة فارغ كلّه (بلا فئة ولا مبلغ) يُتجاهل ولا يعطّل الحفظ (م٥)، والناقص يُقال.
    const empty = rate.categoryId === '' && rate.amountText.trim() === '';
    return { rate, value, empty, ok: rate.categoryId !== '' && value !== null && value > 0n };
  });
  const sentRates = ratesView.filter((row) => row.ok);

  // ما ينقص للحفظ (م٥): كلّ سبب يعطّل الزرّ مكتوب تحته.
  const missing: string[] = [];
  if (name.trim() === '') missing.push(t('mill.builder.need_name', 'اكتب اسم الخلطة.'));
  else if (nameTaken) missing.push(t('mill.builder.need_other_name', 'اسم الخلطة لخلطة أخرى: اختر اسماً غيره.'));
  if (outputId === '') {
    missing.push(
      newOutput.trim() !== ''
        ? t('mill.builder.need_output_create', 'المنتج «{name}» مكتوب ولم يُنشأ: اضغط «أنشئ» أو اختر منتجاً من القائمة.', { name: newOutput.trim() })
        : t('mill.builder.need_output', 'اختر المادّة المنتَجة، أو اكتب اسم منتج جديد واضغط «أنشئ».'),
    );
  }
  if (!view.length) missing.push(t('mill.builder.need_materials', 'اختر مادّة واحدة على الأقلّ من البطاقات.'));
  else if (!view.some((row) => row.inBasis)) missing.push(t('mill.builder.need_basis_line', 'أضف مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يكوّنان خلطة.'));
  for (const row of view) {
    if (row.densityMissing) missing.push(t('mill.builder.need_density_v4', '«{name}» سائل بلا كثافة: اكتب كثافته على بطاقته.', { name: row.line.item.name }));
    else if (row.densityUnread) missing.push(t('mill.builder.density_unread', 'كثافة «{name}» لم تُقرأ بعد: انتظر لحظة أو أعد قراءتها من بطاقته.', { name: row.line.item.name }));
  }
  for (const row of ratesView) {
    if (row.ok || row.empty) continue;
    missing.push(
      row.rate.categoryId === ''
        ? t('mill.builder.need_rate_category', 'اختر فئة المصروف لسطر التكلفة المكتوب، أو احذف السطر.')
        : t('mill.builder.need_rate_amount', 'اكتب مبلغ تكلفة «{category}» لكلّ طنّ أكبر من صفر، أو احذف السطر.', { category: categoryName(row.rate.categoryId) }),
    );
  }
  const canSave = canBuild && missing.length === 0;
  const noExclude = useMemo(() => new Set<string>(), []);

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
   * نداء create_recipe بحمولة محفوظة (ب١٤): الأوّل من «احفظ الخلطة»، والإعادة بعد نتيجة مجهولة بالحمولة نفسها حرفاً. جواب نهائي (نجاح أو رفض
   * بسبب) يفكّ التجميد — الرفض بعد الإعادة يعني أنّ الأولى لم تُكتب (create_recipe بالمعرّفين نفسيهما يرجّع الموجود)، فالتعديل آمن.
   */
  const submit = async (input: RecipeInput, retrying: boolean) => {
    setSaving(true);
    setFailure(null);
    setConflict(null);
    try {
      const created = await createRecipe(input);
      ids.current = null;
      setFrozen(null);
      toast({
        tone: 'success',
        title:
          created.status === 'active'
            ? t('mill.builder.saved_ready', 'حُفظت الخلطة «{name}»: صارت جاهزة للإنتاج، وتُكتب الكميات عند كلّ إنتاج.', { name: input.name })
            : t('mill.builder.saved_draft', 'حُفظت الخلطة «{name}» مسوّدة.', { name: input.name }),
      });
      navigate(`/mill/recipe/${created.id}`);
    } catch (problem) {
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن كُتبت المحاولة الأولى: تتجمّد البانية بحمولتها، والإعادة وحدها ممكنة (لن تُكتب مرّتين). وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(input);
        if (retrying && surelyUnsaved(problem)) setFailure(t('mill.builder.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.'));
      } else if (problem instanceof RejectedError && problem.code === 'id_conflict') {
        // ما حُفظ بمحاولة سابقة غير ما تراه الشاشة (id_conflict، ق٥): يُقال برابطه، والمعرّفان يبقيان فلا تُكتب خلطة ثانية بصمت.
        setFrozen(null);
        setConflict(input.id);
      } else {
        setFrozen(null);
        // كثافة سائل كُتبت أو مُحيت من جهاز آخر بعد قراءة البطاقة (density_required): تُقرأ الموادّ المختارة من جديد، والرفض بتلميحه.
        if (problem instanceof RejectedError && problem.code === 'density_required') for (const line of lines) picks.retryDensity(line.item.id);
        const { title, detail } = describeError(problem);
        setFailure(problem instanceof RejectedError && problem.hint ? problem.hint : `${title} ${detail}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!canSave || locked) return;
    // المعرّفان من الجهاز ويبقيان لهذه الشاشة حتى تُعرف النتيجة: إعادةٌ بعد جواب ضائع ترجّع الخلطة نفسها لا ثانية.
    ids.current ??= { recipe: crypto.randomUUID(), version: crypto.randomUUID() };
    const attempt = ids.current;
    void submit(
      {
        id: attempt.recipe,
        versionId: attempt.version,
        name: name.trim(),
        outputItemId: outputId,
        lines: view.map((row) => ({ itemId: row.line.item.id })),
        rates: sentRates.map((row) => ({ categoryId: row.rate.categoryId, amountPerTon: row.value ?? 0n })),
        activate: true,
      },
      false,
    );
  };

  const columns: Column<(typeof view)[number]>[] = [
    { key: 'no', header: t('mill.col.no', '#'), kind: 'number', cell: (_row, index) => <Num>{fmtInt(index + 1)}</Num> },
    {
      key: 'item',
      header: t('mill.line.item', 'المادّة'),
      wrap: true,
      sticky: true,
      cell: (row) => <MaterialName name={row.line.item.name} slot={slots.get(row.line.item.id) ?? null} />,
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
    // الترتيب بالسهمين (0023، كلمة المالك 2026-11-10: «يرتب المواد الي يستخدمهن»): ترتيب الجدول ترتيب p_lines، وcreate_recipe يرقّم السطور به.
    {
      key: 'remove',
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
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} disabled={locked} onClick={() => picks.remove(row.line.item.id)} data-action="remove-line">
            {t('common.delete', 'احذف')}
          </Button>
        </span>
      ),
    },
  ];

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

  const shownOutputTwins = outputTwins && outputTwins.query === newOutput.trim() ? outputTwins.rows : null;
  const outsideBasis = view.some((row) => !row.inBasis);

  return (
    <div className="flex flex-col gap-5">
      <BackButton to="/mill" label={t('back.mill', 'رجوع إلى المعمل')} action="back-to-mill" />
      <PageHeader
        title={t('mill.builder.title', 'خلطة جديدة')}
        subtitle={t('mill.builder.subtitle_v4', 'سمِّ الخلطة واختر منتجها وموادّها ورتّبها؛ الكميات تكتبها عند كلّ إنتاج.')}
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
          <Field id={`${id}-output`} label={t('mill.recipe.output', 'المادّة المنتَجة')} hint={t('mill.builder.output_hint_v4', 'العلف الجاهز الذي يخرج من الخلطة ويدخل «رصيد العلف».')}>
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
        <p className="text-sm text-ink-muted">{t('mill.cards.hint_pick', 'المس البطاقة لتختار المادّة؛ لمسة ثانية تتركها. تختار أكثر من مادّة معاً، والكميات تُكتب عند كلّ إنتاج.')}</p>
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
        />
        <DataTable
          caption={t('mill.builder.caption_v4', 'موادّ الخلطة الجديدة بترتيبها ونوع كلّ مادّة')}
          columns={columns}
          rows={view}
          rowKey={(row) => row.line.item.id}
          empty={t('mill.builder.empty_pick', 'لم تختر مادّة بعد: المس بطاقتها فوق، أو اكتب اسمها في البحث وأنشئها إن لم تكن موجودة.')}
        />
        {view.length > 1 ? (
          <p className="text-sm text-ink-muted" data-action="builder-order-note">
            {t('mill.builder.order_note', 'تُحفظ الموادّ في الخلطة بترتيب هذا الجدول: قدّم أو أخّر أيّ مادّة بالسهمين.')}
          </p>
        ) : null}
        {outsideBasis ? (
          <p className="text-sm text-ink-muted" data-action="mass-note">
            {t('mill.builder.outside_note_v4', 'الوقود والتعبئة خارج كتلة الخلطة: يُسحبان وتُحسب كلفتهما، ولا يدخلان ناتجها.')}
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
            <Button busy={saving} onClick={() => void submit(frozen, true)} data-action="retry-save">
              {t('mill.builder.retry', 'أعد المحاولة')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" icon={<CheckCircle2 className="size-5" aria-hidden="true" />} busy={saving} disabled={!canSave || locked} onClick={save} data-action="save-activate">
            {t('mill.builder.save_v4', 'احفظ الخلطة')}
          </Button>
        </div>
      )}
      {frozen || canSave || !missing.length ? null : (
        <div className="flex flex-col gap-1 text-sm" data-action="save-missing">
          <p className="font-medium">{t('mill.builder.missing_draft', 'لا تُحفظ الخلطة قبل ما يلي:')}</p>
          <ul className="list-disc ps-5 text-ink-muted">
            {missing.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
