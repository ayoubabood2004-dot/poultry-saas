import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Notice';
import { decimalText } from '../../domain/decimal';
import { searchable } from '../../domain/normalize';
import type { ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { describeError, RejectedError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { createExpenseCategory, createItem, findItemTwins, listItems, loadItem, updateItem, type ItemFields, type ItemRow, type ItemTwin } from '../../lib/repo/inventory';
import type { CategoryOption } from '../../lib/repo/mill';
import { itemKindLabel } from '../../lib/storeLabels';

// منتقي مادّة المعمل ومحرّرات الخلايا (0016، كلمة المالك 2026-11-04: «تطلعلي قائمة انتاج كاملة اضيف منها المواد… حتى لو ما
// موجودة بالمعمل»). المنتقي بثلاث حالات لا يسكت (درس «البحث الصامت» 2026-11-03): مطابقات تصلح، أو «لا مادّة باسم س» ويّا
// «أنشئها الآن»، أو «موجودة لكنّها لا تصلح هنا» بنوعها (المالك أنشأ «ذرة» بنوع «علف» فلم تظهر في الخلطة).
// والإنشاء بـcreateItem القائم في وحدة المخزون (لا نسخة ثانية منه)، ومعه أسماء الأنواع من storeLabels: الوحدتان تُستوردان
// معاً فتبقيان في حزمة المخزون المستثناة نفسها (stores-admin) بدل أن تنفصل الأسماء حزمةً محفوظة.
// إصلاحات المراجعة (م٨): لا رابط يغادر البانية (رابط البطاقة كان يمسحها ويصل إلى بطاقة لا تغيّر النوع)؛ بدله «اجعلها مادّة
// أوّلية» بتعديل المادّة القائم بشرط نسختها، و«أنشئ» يمرّ بـfindItemTwins أوّلاً فالتوأم بالاسم يُعرض قبل أيّ إنشاء، والإنشاء
// رغمه فعل صريح ثانٍ. و(م٣) فئة المصروف تُضاف من مكانها (NewCategoryField) بدل رابط إعدادات المنشأة الذي يمسح البانية.
// الجولة الثانية: نصّ «فئة جديدة» وملاحظته في الصفحة لا في الحقل (ب١١، مكوّن متحكَّم به)، فلا يضيع بقراءة الصفحة من جديد، ورفض
// category_name_taken يُعرض بتلميحه؛ والمنتقي ومحرّر الخلية يُقفلان أثناء حفظ البانية (ب١٢، disabled).
// الجولة الرابعة (ب٣٢): Enter في محرّر الخلية لا يحفظ أثناء الحفظ، والمسوَّد يُمسح بعد الحفظ إن بقي كما أُرسل وحده (settle)، و«أرجع
// ما لم يُحفظ» يعيد الخانات كلّها إلى المحفوظ (reset، ب٣٥).

/**
 * أنواع المواد التي يقبلها مخزن المواد الأوّلية (مرآة private.item_admissible('raw', …) = ADMISSIBLE.raw في domain/stock،
 * وmill-screens.test يقارنهما): نسخة هنا كي لا تنفصل domain/stock حزمةً محفوظة جديدة بين المخزون والمعمل.
 */
export const MILL_RAW_KINDS: readonly ItemKind[] = ['raw', 'additive', 'packaging', 'fuel'];

export interface PickedMaterial {
  id: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  /** ١/١٠٠٠٠ كغم/لتر، للسائل بس. */
  density: bigint | null;
  /** خطوة عدّاد المادّة بالآلاف (القاعدة ١٨). */
  scaleStep: bigint;
}

export const materialOf = (row: ItemRow): PickedMaterial => ({ id: row.id, name: row.name, kind: row.kind, baseUnit: row.baseUnit, density: row.density, scaleStep: row.scaleStep });

/** مادّة تصلح سطراً في الخلطة أو الدفعة: فعّالة، يقبلها مخزن المواد الأوّلية، وتُقاس بالكيلو أو اللتر (القطعة لا تدخل العليقة). */
export function millAdmissible(row: Pick<ItemRow, 'archived' | 'kind' | 'baseUnit'>): boolean {
  return !row.archived && MILL_RAW_KINDS.includes(row.kind) && (row.baseUnit === 'kg' || row.baseUnit === 'L');
}

/**
 * الوقود والتعبئة خارج كتلة الخلطة (مرآة in_basis في القاعدة، إصلاح ق٣ للمراجعة: «بدون الأكياس والوقود»): يُسحبان وتُحسب
 * كلفتهما، ولا يدخلان مجموع الأساس ولا كتلة المدخلات التي يُحسب منها الهدر.
 */
const OUT_OF_BASIS: readonly ItemKind[] = ['fuel', 'packaging'];
export const inBasisKind = (kind: ItemKind): boolean => !OUT_OF_BASIS.includes(kind);

/** مطابق بالاسم لا يصلح ونوعه وحده السبب (فعّالة وبالكيلو أو اللتر): «اجعلها مادّة أوّلية» يصلحها. */
export function kindFixable(row: Pick<ItemRow, 'archived' | 'kind' | 'baseUnit'>): boolean {
  return !row.archived && !MILL_RAW_KINDS.includes(row.kind) && (row.baseUnit === 'kg' || row.baseUnit === 'L');
}

/** لماذا لا تدخل المادّة الخلطة: مؤرشفة، أو بنوع لا يقبله مخزن المواد الأوّلية، أو تُقاس بالقطعة. */
export function misfitText(row: Pick<ItemRow, 'name' | 'archived' | 'kind' | 'baseUnit'>): string {
  if (row.archived) return t('mill.picker.misfit_archived', '«{name}» مؤرشفة بنوع «{kind}»، فلا تدخل الخلطة.', { name: row.name, kind: itemKindLabel(row.kind) });
  if (!MILL_RAW_KINDS.includes(row.kind)) return t('mill.picker.misfit', '«{name}» موجودة بنوع «{kind}»، فلا تدخل الخلطة مادّةً أوّلية.', { name: row.name, kind: itemKindLabel(row.kind) });
  return t('mill.picker.misfit_unit', '«{name}» تُقاس بالقطعة، والخلطة تقبل الكيلوغرام واللتر وحدهما.', { name: row.name });
}

/**
 * رفض تغيير النوع بجملة تقول ما العمل: النوع ووحدة الأساس ثابتان بعد أوّل حركة مخزون (items_stock_guard، frozen_column)،
 * فالحلّ مادّة جديدة باسم آخر؛ وغير ذلك من describeError.
 */
export function kindFixFailure(error: unknown, row: Pick<ItemRow, 'name' | 'kind'>, target: 'raw' | 'feed'): string {
  if (error instanceof RejectedError && error.code === 'frozen_column') {
    const vars = { name: row.name, kind: itemKindLabel(row.kind) };
    return target === 'raw'
      ? t('mill.picker.kind_frozen', 'على «{name}» حركات مخزون بنوع «{kind}» فلا يتغيّر نوعها؛ أنشئ مادّة أوّلية باسم آخر (مثل «{name} خام»).', vars)
      : t('mill.builder.output_frozen', 'على «{name}» حركات مخزون بنوع «{kind}» فلا يتغيّر نوعها؛ أنشئ المنتج باسم آخر (مثل «علف {name}»).', vars);
  }
  const { title, detail } = describeError(error);
  return `${title} ${detail}`;
}

/** توأم بالاسم (find_item_twins) ومعه صفّ المادّة كاملاً (النوع والوحدة والنسخة) إن قُرئ. */
export interface TwinView {
  twin: ItemTwin;
  row: ItemRow | null;
}

/** التوائم بالاسم نفسه قبل أيّ إنشاء (م٨): find_item_twins بالتطبيع على الطرفين (والمؤرشفة معها)، ثم صفّ كلّ توأم. */
export async function sameNameTwins(name: string): Promise<TwinView[]> {
  const twins = (await findItemTwins(name, [])).filter((twin) => twin.sameName);
  const rows = await Promise.all(twins.map((twin) => loadItem(twin.id)));
  return twins.map((twin, index) => ({ twin, row: rows[index] ?? null }));
}

/** حقول مادّة تُنشأ من المعمل باسمها وحده: بالكيلوغرام وخطوة عدّاد 0.1 (افتراض نموذج المادّة)، والباقي يُكمَل من بطاقتها. */
export function newItemFields(name: string, kind: ItemKind): ItemFields {
  return {
    name: name.trim(),
    category_id: null,
    kind,
    base_unit: 'kg',
    density_kg_per_l: null,
    piece_mass_kg: null,
    tracks_expiry: false,
    scale_step: decimalText(100n, 3),
    min_qty: null,
    barcode: null,
    alt_codes: [],
  };
}

export const unitWord = (unit: BaseUnit): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

/** نتيجة البحث بحالاتها الثلاث: ما يصلح، والمطابق بالاسم الذي لا يصلح (بنوعه)، وهل وُجد مطابق صالح بالاسم نفسه. */
export function pickerView(rows: readonly ItemRow[], query: string, exclude: ReadonlySet<string>) {
  const key = searchable(query);
  const fit = rows.filter((row) => millAdmissible(row) && !exclude.has(row.id));
  const exactFit = rows.some((row) => millAdmissible(row) && searchable(row.name) === key);
  const misfits = rows.filter((row) => !millAdmissible(row) && searchable(row.name) === key);
  /** المطابق الصالح بالاسم نفسه مكتوب في الجدول أصلاً: يُقال بدل صمت المنتقي. */
  const exactIn = rows.some((row) => millAdmissible(row) && searchable(row.name) === key && exclude.has(row.id));
  return { fit, exactFit, misfits, exactIn };
}

/**
 * منتقي مادّة أوّلية للمعمل: بحث بالاسم (listItems) والنتائج المقبولة أزرار، و«أنشئ» حين لا مطابق صالح بالاسم نفسه (لمن
 * يملك item.create)، والمطابق غير الصالح يُسمّى بسببه ومعه «اجعلها مادّة أوّلية» لمن يملك stores.manage (canFixKind) — بلا رابط
 * يغادر الشاشة. و«أنشئ» يسأل find_item_twins أوّلاً. exclude: المواد المكتوبة أصلاً في الجدول.
 */
export function MaterialPicker({
  id,
  exclude,
  canCreate,
  canFixKind,
  disabled = false,
  onPick,
}: {
  id: string;
  exclude: ReadonlySet<string>;
  canCreate: boolean;
  /** تعديل نوع المادّة (stores.manage): «اجعلها مادّة أوّلية» بدالّة تعديل المادّة القائمة بشرط نسختها. */
  canFixKind: boolean;
  /** مقفول أثناء حفظ البانية (ب١٢): لا بحث ولا إضافة ولا إنشاء. */
  disabled?: boolean;
  /** created: أُنشئت الآن من المنتقي (بلا شراء ولا سعر بعد). */
  onPick: (item: PickedMaterial, created: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ query: string; rows: readonly ItemRow[] } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [twins, setTwins] = useState<{ query: string; rows: readonly TwinView[] } | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixProblem, setFixProblem] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string | null>('');

  useEffect(() => {
    const pending = timer;
    const query = latest;
    return () => {
      if (pending.current) clearTimeout(pending.current);
      query.current = null;
    };
  }, []);

  const search = (query: string) => {
    listItems({ search: query }).then(
      (page) => {
        if (latest.current !== query) return;
        setFound({ query, rows: page.rows });
        setFailure(null);
      },
      (error: unknown) => {
        if (latest.current === query) setFailure(error);
      },
    );
  };
  const onText = (value: string) => {
    setText(value);
    setTwins(null);
    setFixProblem(null);
    const query = value.trim();
    latest.current = query;
    if (timer.current) clearTimeout(timer.current);
    if (!query) {
      setFound(null);
      setFailure(null);
      return;
    }
    timer.current = setTimeout(() => search(query), 250);
  };

  const query = text.trim();
  const view = found && found.query === query ? pickerView(found.rows, query, exclude) : null;
  const shownTwins = twins && twins.query === query ? twins.rows : null;

  /** «أنشئ»: التوأم بالاسم نفسه يُعرض أوّلاً (استعملها أو اجعلها مادّة أوّلية)، والإنشاء رغمه بفعل صريح ثانٍ (despite). */
  const create = async (despite: boolean) => {
    if (!query || creating || disabled) return;
    setCreating(true);
    setFailure(null);
    setFixProblem(null);
    try {
      if (!despite) {
        const same = await sameNameTwins(query);
        if (same.length) {
          setTwins({ query, rows: same });
          return;
        }
      }
      const row = await createItem(newItemFields(query, 'raw'));
      onPick(materialOf(row), true);
      onText('');
    } catch (error) {
      setFailure(error);
    } finally {
      setCreating(false);
    }
  };

  /** «اجعلها مادّة أوّلية»: تعديل نوع المادّة بشرط نسختها التي قُرئت، ثم تُضاف سطراً (لها مشتريات ربّما، فيُقرأ سعرها). */
  const fixKind = async (row: ItemRow) => {
    if (fixing || disabled) return;
    setFixing(row.id);
    setFixProblem(null);
    try {
      const updated = await updateItem(row.id, row.version, { kind: 'raw' });
      onPick(materialOf(updated), false);
      onText('');
    } catch (error) {
      setFixProblem(kindFixFailure(error, row, 'raw'));
    } finally {
      setFixing(null);
    }
  };

  const fixButton = (row: ItemRow) =>
    kindFixable(row) && canFixKind ? (
      <Button size="sm" variant="secondary" busy={fixing === row.id} disabled={disabled} onClick={() => void fixKind(row)} data-action="make-raw">
        {t('mill.picker.make_raw', 'اجعلها مادّة أوّلية')}
      </Button>
    ) : null;

  const problem = failure ? describeError(failure) : null;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {t('mill.picker.label', 'ابحث عن مادّة أوّلية بالاسم')}
      </label>
      <div className="flex items-center gap-2">
        <Search aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
        <input id={id} className="input" value={text} maxLength={120} autoComplete="off" disabled={disabled} onChange={(event) => onText(event.target.value)} data-action="search-material" />
      </div>
      {query && !view && !problem ? <p className="text-sm text-ink-muted">{t('mill.picker.searching', 'جارٍ البحث…')}</p> : null}
      {view?.fit.length ? (
        <ul className="flex flex-wrap gap-2">
          {view.fit.map((row) => (
            <li key={row.id}>
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden="true" />} disabled={disabled} onClick={() => onPick(materialOf(row), false)} data-action="pick-material">
                {t('mill.picker.option', '{name} · {kind} · {unit}', { name: row.name, kind: itemKindLabel(row.kind), unit: unitWord(row.baseUnit) })}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {view && !view.fit.length && !view.misfits.length && !view.exactFit ? (
        <p className="text-sm text-ink-muted" data-action="picker-none">
          {t('mill.picker.none', 'لا مادّة أوّلية باسم «{name}» في منشأتك.', { name: query })}
        </p>
      ) : null}
      {view?.exactIn && !view.fit.length ? (
        <p className="text-sm text-ink-muted" data-action="picker-already">
          {t('mill.picker.already', '«{name}» مكتوبة في الجدول؛ عدّل كميتها هناك.', { name: query })}
        </p>
      ) : null}
      {view?.misfits.map((row) => (
        <Notice key={row.id} tone="warning" title={misfitText(row)} action={fixButton(row) ?? undefined}>
          {kindFixable(row) && !canFixKind ? t('mill.picker.ask_kind', 'إن كانت مادّة أوّلية فعلاً فاطلب من المدير تصحيح نوعها.') : null}
        </Notice>
      ))}
      {shownTwins ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3" data-action="material-twins">
          <p className="text-sm font-medium">{t('mill.twins.title', 'توجد مادّة بالاسم «{name}» نفسه؛ المادّة تُضاف مرّة واحدة:', { name: query })}</p>
          <ul className="flex flex-col gap-2">
            {shownTwins.map(({ twin, row }) => (
              <li key={twin.id} className="flex flex-wrap items-center gap-2 text-sm">
                {row && millAdmissible(row) ? (
                  exclude.has(row.id) ? (
                    <span>{t('mill.twins.in_table', '«{name}» مكتوبة في الجدول؛ عدّل كميتها هناك.', { name: row.name })}</span>
                  ) : (
                    <>
                      <span>{t('mill.twins.fit', '«{name}» مادّة أوّلية تصلح للخلطة.', { name: row.name })}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => {
                          onPick(materialOf(row), false);
                          onText('');
                        }}
                        data-action="use-twin"
                      >
                        {t('mill.twins.use', 'استعملها')}
                      </Button>
                    </>
                  )
                ) : row ? (
                  <>
                    <span>{misfitText(row)}</span>
                    {fixButton(row)}
                  </>
                ) : (
                  <span>{t('mill.twins.unread', '«{name}» موجودة في منشأتك.', { name: twin.name })}</span>
                )}
              </li>
            ))}
          </ul>
          <div>
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden="true" />} busy={creating} disabled={disabled} onClick={() => void create(true)} data-action="create-anyway">
              {t('mill.twins.create_anyway', 'أنشئ «{name}» مادّةً أوّلية أخرى بالاسم نفسه رغم ذلك', { name: query })}
            </Button>
          </div>
        </div>
      ) : view && !view.exactFit && canCreate ? (
        <div>
          <Button size="sm" icon={<Plus className="size-4" aria-hidden="true" />} busy={creating} disabled={disabled} onClick={() => void create(false)} data-action="create-material">
            {t('mill.picker.create', 'أنشئ «{name}» مادّةً أوّلية جديدة بالكيلوغرام', { name: query })}
          </Button>
        </div>
      ) : null}
      {fixProblem ? <Notice tone="danger" title={fixProblem} /> : null}
      {problem ? <Notice tone="danger" title={problem.title}>{problem.detail}</Notice> : null}
    </div>
  );
}

/**
 * ما كُتب في «فئة مصروف جديدة» وملاحظته (الجولة الثانية، ب١١، درس WP5): يعيش في الصفحة (useState فيها) لا في الحقل، فقراءة الصفحة
 * من جديد بعد أيّ حفظ آخر — وهي تطوي الأبناء أثناءها — لا تمسح ما كُتب. busy معه، فإعادة رسم الحقل أثناء الإنشاء لا تفتح نقرة ثانية.
 */
export interface CategoryDraft {
  text: string;
  note: string | null;
  problem: string | null;
  busy: boolean;
}

export const NO_CATEGORY_DRAFT: CategoryDraft = { text: '', note: null, problem: null, busy: false };

/**
 * «فئة مصروف جديدة» من مكانها (م٣): في البانية وبطاقة الخلطة وصفحة الدفعة، فلا يغادر المستخدم ما يكتبه إلى الإعدادات. لمن
 * يملك expense_categories.manage حقل وزرّ «أضف الفئة» (createExpenseCategory القائم)، والفئة الجديدة تُختار فوراً (onPick)؛
 * ولغيره جملة «اطلب من المدير أو المحاسب». الاسم الموجود في القائمة يُختار بدل فئة ثانية بالاسم نفسه، والخادم يرفض الاسم المكرّر
 * في المنشأة (category_name_taken، ق٢٦: مؤرشفة أو نظامية أو أُضيفت من جهاز آخر) بتلميح يقول ما العمل فيُعرض كما هو.
 * مكوّن متحكَّم به (ب١١): value وonChange من الصفحة.
 */
export function NewCategoryField({
  id,
  categories,
  canManage,
  value,
  onChange,
  disabled = false,
  onPick,
}: {
  id: string;
  /** الفئات التي تعرضها الشاشة (الفعّالة غير النظامية): الاسم الموجود فيها يُختار ولا يُكرَّر. */
  categories: readonly CategoryOption[];
  canManage: boolean;
  value: CategoryDraft;
  onChange: Dispatch<SetStateAction<CategoryDraft>>;
  /** مقفول أثناء حفظ البانية (ب١٢). */
  disabled?: boolean;
  onPick: (category: CategoryOption) => void;
}) {
  if (!canManage) {
    return (
      <p className="text-sm text-ink-muted" data-action="ask-category">
        {t('mill.category.ask', 'لا فئة مناسبة؟ اطلب من المدير أو المحاسب إضافتها.')}
      </p>
    );
  }

  const exists = (name: string) => t('mill.category.exists', 'الفئة «{name}» موجودة: اخترها من القائمة.', { name });
  const create = async () => {
    const wanted = value.text.trim();
    if (!wanted || value.busy || disabled) return;
    const same = categories.find((category) => searchable(category.name) === searchable(wanted));
    if (same) {
      onPick(same);
      onChange((current) => ({ ...current, text: '', note: exists(same.name), problem: null }));
      return;
    }
    onChange((current) => ({ ...current, busy: true, note: null, problem: null }));
    try {
      const row = await createExpenseCategory(wanted);
      onPick({ id: row.id, name: row.name });
      onChange((current) => ({
        ...current,
        busy: false,
        text: '',
        note: t('mill.category.created', 'أُضيفت الفئة «{name}» إلى فئات المصاريف واختيرت هنا.', { name: row.name }),
        problem: null,
      }));
    } catch (error) {
      if (error instanceof RejectedError && error.code === 'category_name_taken') {
        // تلميح الخادم يقول حال الفئة الموجودة وما العمل (أعِدها من الأرشيف، أو اختر اسماً آخر، أو اخترها).
        const hint = error.hint ?? describeError(error).detail;
        onChange((current) => ({ ...current, busy: false, problem: hint }));
      } else if (error instanceof RejectedError && error.code === '23505') {
        onChange((current) => ({ ...current, busy: false, note: exists(wanted) }));
      } else {
        const { title, detail } = describeError(error);
        onChange((current) => ({ ...current, busy: false, problem: `${title} ${detail}` }));
      }
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {t('mill.category.new', 'فئة مصروف جديدة')}
      </label>
      <span className="flex items-center gap-2">
        <input
          id={id}
          className="input"
          maxLength={80}
          autoComplete="off"
          value={value.text}
          disabled={disabled || value.busy}
          onChange={(event) => {
            const text = event.target.value;
            onChange((current) => ({ ...current, text }));
          }}
          data-action="new-category-name"
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus className="size-4" aria-hidden="true" />}
          busy={value.busy}
          disabled={disabled || value.text.trim() === ''}
          onClick={() => void create()}
          data-action="create-category"
        >
          {t('mill.category.add', 'أضف الفئة')}
        </Button>
      </span>
      {value.problem ? (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="category-problem">
          {value.problem}
        </p>
      ) : (
        <p className="text-sm text-ink-muted" data-action="category-note">
          {value.note ?? t('mill.category.hint', 'مثل: أيدي عاملة، كهرباء، نقل. تُضاف إلى فئات المصاريف وتُختار هنا مباشرة.')}
        </p>
      )}
    </div>
  );
}

// ─── تعديلات الخلايا ──────────────────────────────────────────────────────────────────────────────────────────
// المكتوب في خلية يبقى في الصفحة لا في الجدول (درس WP5): القراءة من جديد بعد كلّ حفظ ترسم الجدول من جديد، فالمحرّر الذي يملك
// حالته يضيع ما كُتب فيه. ومعه القيمة المحفوظة يوم بدأ تعديله (درس WP6)، فالحفظ مشروط بها لا بما رجع بعدها.

export interface Draft<V> {
  text: string;
  /** القيمة المحفوظة لحظة أوّل كتابة. */
  before: V;
}

export function useDrafts<V>() {
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft<V>>>>({});
  return {
    get: (key: string): Draft<V> | undefined => drafts[key],
    /** كتابة: أوّل كتابة تحفظ before، وما بعدها يغيّر النصّ وحده. */
    write: (key: string, text: string, before: V) => setDrafts((current) => ({ ...current, [key]: { text, before: current[key]?.before ?? before } })),
    clear: (key: string) =>
      setDrafts((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }),
    /**
     * بعد حفظ ناجح (الجولة الرابعة، ب٣٢، قاعدة قسم الوزن ب٢٢): يُمسح المسوَّد إن بقي نصّه كما كان لحظة الإرسال (sent)، وإلّا يبقى بما كُتب
     * أثناء الحفظ وقيمته المحفوظة الآن saved، فالحفظ التالي مشروط بما كتبته الصفحة نفسها لا بما قبله (فلا يقول «من جهاز آخر» لكتابتها).
     */
    settle: (key: string, sent: string | null, saved: V) =>
      setDrafts((current) => {
        const draft = current[key];
        if (!draft) return current;
        const next = { ...current };
        if (draft.text === sent) delete next[key];
        else next[key] = { text: draft.text, before: saved };
        return next;
      }),
    /** «أرجع ما لم يُحفظ» (ب٣٥): كلّ الخانات إلى المحفوظ. */
    reset: () => setDrafts((current) => (Object.keys(current).length ? {} : current)),
  };
}

/** خلية رقم قابلة للكتابة وزرّ «احفظ» يظهر حين يختلف المكتوب عن المحفوظ. الرقم يكتبه المستخدم، والعرض من format.ts. */
export function CellEdit({
  id,
  label,
  value,
  dirty,
  invalid,
  busy,
  disabled = false,
  action,
  onChange,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  dirty: boolean;
  invalid: boolean;
  busy: boolean;
  /** مقفول أثناء حفظ البانية (ب١٢): لا كتابة ولا حفظ. */
  disabled?: boolean;
  action: string;
  onChange: (text: string) => void;
  onSave: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        id={id}
        aria-label={label}
        className="input text-end tabular-nums"
        size={9}
        inputMode="decimal"
        dir="ltr"
        autoComplete="off"
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // لا حفظ ثانٍ أثناء الحفظ (ب٣٢): Enter كان يرسل الكتابة الجديدة مشروطةً بما قبل الأولى، فيرفضها الخادم «من جهاز آخر».
          if (event.key === 'Enter' && dirty && !invalid && !disabled && !busy) onSave();
        }}
        data-action={action}
      />
      {dirty ? (
        <Button size="sm" variant="secondary" busy={busy} disabled={invalid || disabled} onClick={onSave} data-action={`${action}-save`}>
          {t('common.save', 'حفظ')}
        </Button>
      ) : null}
    </span>
  );
}
