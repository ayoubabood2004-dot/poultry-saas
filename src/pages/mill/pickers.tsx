import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Notice';
import { decimalText } from '../../domain/decimal';
import { searchable } from '../../domain/normalize';
import type { ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { describeError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { createItem, listItems, type ItemFields, type ItemRow } from '../../lib/repo/inventory';
import { itemKindLabel } from '../../lib/storeLabels';

// منتقي مادّة المعمل ومحرّرات الخلايا (0016، كلمة المالك 2026-11-04: «تطلعلي قائمة انتاج كاملة اضيف منها المواد… حتى لو ما
// موجودة بالمعمل»). المنتقي بثلاث حالات لا يسكت (درس «البحث الصامت» 2026-11-03): مطابقات تصلح، أو «لا مادّة باسم س» ويّا
// «أنشئها الآن»، أو «موجودة لكنّها لا تصلح هنا» بنوعها ورابط بطاقتها (المالك أنشأ «ذرة» بنوع «علف» فلم تظهر في الخلطة).
// والإنشاء بـcreateItem القائم في وحدة المخزون (لا نسخة ثانية منه)، ومعه أسماء الأنواع من storeLabels: الوحدتان تُستوردان
// معاً فتبقيان في حزمة المخزون المستثناة نفسها (stores-admin) بدل أن تنفصل الأسماء حزمةً محفوظة.

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
 * يملك item.create)، والمطابق غير الصالح يُسمّى بنوعه مع رابط بطاقته. exclude: المواد المكتوبة أصلاً في الجدول.
 */
export function MaterialPicker({
  id,
  exclude,
  canCreate,
  onPick,
}: {
  id: string;
  exclude: ReadonlySet<string>;
  canCreate: boolean;
  /** created: أُنشئت الآن من المنتقي (بلا شراء ولا سعر بعد). */
  onPick: (item: PickedMaterial, created: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ query: string; rows: readonly ItemRow[] } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
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

  const create = async () => {
    if (!query || creating) return;
    setCreating(true);
    setFailure(null);
    try {
      const row = await createItem(newItemFields(query, 'raw'));
      onPick(materialOf(row), true);
      onText('');
    } catch (error) {
      setFailure(error);
    } finally {
      setCreating(false);
    }
  };

  const problem = failure ? describeError(failure) : null;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {t('mill.picker.label', 'ابحث عن مادّة أوّلية بالاسم')}
      </label>
      <div className="flex items-center gap-2">
        <Search aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
        <input id={id} className="input" value={text} maxLength={120} autoComplete="off" onChange={(event) => onText(event.target.value)} data-action="search-material" />
      </div>
      {query && !view && !problem ? <p className="text-sm text-ink-muted">{t('mill.picker.searching', 'جارٍ البحث…')}</p> : null}
      {view?.fit.length ? (
        <ul className="flex flex-wrap gap-2">
          {view.fit.map((row) => (
            <li key={row.id}>
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => onPick(materialOf(row), false)} data-action="pick-material">
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
        <Notice
          key={row.id}
          tone="warning"
          title={t('mill.picker.misfit', '«{name}» موجودة بنوع «{kind}»، فلا تدخل الخلطة مادّةً أوّلية.', { name: row.name, kind: itemKindLabel(row.kind) })}
          action={
            <Link to={`/inventory/items/${row.id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-misfit">
              {t('mill.picker.fix_kind', 'صحّح نوعها من بطاقتها')}
            </Link>
          }
        />
      ))}
      {view && !view.exactFit && canCreate ? (
        <div>
          <Button size="sm" icon={<Plus className="size-4" aria-hidden="true" />} busy={creating} onClick={() => void create()} data-action="create-material">
            {t('mill.picker.create', 'أنشئ «{name}» مادّةً أوّلية جديدة بالكيلوغرام', { name: query })}
          </Button>
        </div>
      ) : null}
      {problem ? <Notice tone="danger" title={problem.title}>{problem.detail}</Notice> : null}
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
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && dirty && !invalid) onSave();
        }}
        data-action={action}
      />
      {dirty ? (
        <Button size="sm" variant="secondary" busy={busy} disabled={invalid} onClick={onSave} data-action={`${action}-save`}>
          {t('common.save', 'حفظ')}
        </Button>
      ) : null}
    </span>
  );
}
