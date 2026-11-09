import type { Day } from '../../domain/dates';
import type { Milli } from '../../domain/money';
import { BASE_UNITS, ITEM_KINDS, WAREHOUSE_KINDS, type ItemKind, type WarehouseKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call, classifyPostgrest, send } from './core';
import { arr, bool, count, obj, oneOf, qtyOf, RowShapeError, str } from './inventory';

// «الرصيد اليومي» في المخزن (0022، كلمة المالك 2026-11-09 بصورة ورقته «رصيد مواد العلف — 4/11/2026»: ت | المادّة | الرصيد (كغم) |
// الملاحظات): رصيد موادّ تصنيف واحد في نهاية يوم واحد (day_balance)، وملاحظة لكلّ مادّة لكلّ يوم (set_day_note)، وموادّ التصنيف بترتيبها
// (set_category_items). ملف كسول بحزمة شاشات المخزون: صفحة المخزن تستورده مباشرةً، وindex ما يصدّره (write-guard PAGE_MODULES).
// الكمية نصّ عشريّ بثلاث مراتب بالسلك (E3) ← Milli، وبلا مال أصلاً (الرصيد كميات لكلّ دور). وكلّ خانة قد تأتي null تُقرأ null (درس WP7).
// وبعد مراجعة القاعدة: الصفوف ما يُخزَّن في مخازن النطاق (أو المخزن المختار) وحده، وcategory.members كلّ موادّ التصنيف الفعّالة بترتيبها (بلا تصفية
// بنطاق ولا مخزن): منها تبدأ نافذة «أدرج مواد» وهي ما رآه المدير (p_expected_items، وcategory_changed إن تغيّر بعده). ونسخ الملاحظات أرقام من تسلسل.

type Row = Record<string, unknown>;

/** عدد صحيح غير سالب إجباري. */
const nat = (row: Row, field: string): number => {
  const value = count(row, field);
  if (value === null) throw new RowShapeError(field);
  return value;
};

/**
 * يوم بشكل YYYY-MM-DD (شهر 01–12 ويوم 01–31): العرض والأسهم تحسب منه، فشكل غيره خطأ شكل لا تاريخ يُعرض خطأً. بالشكل وحده لا بـisDay:
 * استيراده من هنا يُدخل جسمه وحدة التواريخ المحفوظة بالتثبيت المسبق (كما في dayText).
 */
const DAY_SHAPE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const dayOf = (row: Row, field: string): Day => {
  const value = str(row, field);
  if (!DAY_SHAPE.test(value)) throw new RowShapeError(field);
  return value;
};

/** ملاحظة اليوم أو null: النصّ (1..200 بعد القصّ) ونسختها (رقم من تسلسل ≥ 1، لا عدّاد يبدأ من 1)، والكتابة بشرط النسخة التي رآها الكاتب. */
export interface DayNote {
  text: string;
  version: number;
}

const noteOf = (row: Row, field: string): DayNote | null => {
  const value = row[field];
  if (value === null || value === undefined) return null;
  const note = obj(value, field);
  const version = nat(note, 'version');
  if (version < 1) throw new RowShapeError('version');
  return { text: str(note, 'text'), version };
};

/** مرجع باسمه (التصنيف المختار أو المخزن المختار) أو null («كل المواد»، «كل المخازن»). */
export interface Named {
  id: string;
  name: string;
}

const namedOf = (row: Row, field: string): Named | null => {
  const value = row[field];
  if (value === null || value === undefined) return null;
  const named = obj(value, field);
  return { id: str(named, 'id'), name: str(named, 'name') };
};

/** التصنيف المعروض: اسمه، وكلّ موادّه الفعّالة بترتيبه (members، ولو لم تظهر في الجدول لأنّ مخازن النطاق أو المخزن المختار لا تقبلها). */
export interface DayCategoryNow extends Named {
  members: readonly string[];
}

const categoryOf = (row: Row, field: string): DayCategoryNow | null => {
  const named = namedOf(row, field);
  if (named === null) return null;
  const members = arr(obj(row[field], field).members, 'members').map((id) => {
    if (typeof id !== 'string' || id === '') throw new RowShapeError('members');
    return id;
  });
  return { ...named, members };
};

export interface DayStore {
  id: string;
  name: string;
  kind: WarehouseKind;
}

export interface DayCategory {
  id: string;
  name: string;
  /** عدد الموادّ الفعّالة فيه. */
  items: number;
}

export interface DayRow {
  itemId: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  /** الرصيد في نهاية اليوم بوحدة أساس المادّة (قد يكون صفراً: الورقة تكتبه «-»). */
  qty: Milli;
  /** ملاحظة ذلك اليوم. */
  note: DayNote | null;
}

export interface DayBalance {
  /** يوم الخادم (app_today). */
  today: Day;
  /** اليوم المعروض. */
  on: Day;
  /** null = «كل المواد». */
  category: DayCategoryNow | null;
  /** null = كلّ مخازن النطاق مجموعةً. */
  warehouse: Named | null;
  /** مخازن النطاق الفعّالة بأسمائها؛ فارغة: لا مخزن في النطاق، والصفوف فارغة معها. */
  stores: readonly DayStore[];
  /** التصنيفات الفعّالة بأسمائها. */
  categories: readonly DayCategory[];
  /** can('stock_note.write'): كتابة الملاحظات. */
  canNote: boolean;
  /** can('stores.manage'): «تصنيف جديد» و«أدرج مواد». */
  canManage: boolean;
  /** ما يُخزَّن في مخازن النطاق (أو المخزن المختار) وحده، بترتيب التصنيف (ما اختاره المدير ثمّ الاسم)، أو بالاسم لـ«كل المواد». */
  rows: readonly DayRow[];
}

export function parseDayBalance(value: unknown): DayBalance {
  const json = obj(value, 'day_balance');
  return {
    today: dayOf(json, 'today'),
    on: dayOf(json, 'on'),
    category: categoryOf(json, 'category'),
    warehouse: namedOf(json, 'warehouse'),
    stores: arr(json.stores, 'stores').map((entry) => {
      const row = obj(entry, 'stores');
      return { id: str(row, 'id'), name: str(row, 'name'), kind: oneOf(row, 'kind', WAREHOUSE_KINDS) };
    }),
    categories: arr(json.categories, 'categories').map((entry) => {
      const row = obj(entry, 'categories');
      return { id: str(row, 'id'), name: str(row, 'name'), items: nat(row, 'items') };
    }),
    canNote: bool(json, 'can_note'),
    canManage: bool(json, 'can_manage'),
    rows: arr(json.rows, 'rows').map((entry) => {
      const row = obj(entry, 'rows');
      return {
        itemId: str(row, 'item_id'),
        name: str(row, 'name'),
        kind: oneOf(row, 'kind', ITEM_KINDS),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        qty: qtyOf(row, 'qty'),
        note: noteOf(row, 'note'),
      };
    }),
  };
}

export interface DayQuery {
  /** null = «كل المواد». */
  category: string | null;
  /** YYYY-MM-DD، أو null = اليوم بالخادم. */
  day: Day | null;
  /** null = كلّ مخازن النطاق. */
  warehouse: string | null;
}

/** رصيد اليوم لتصنيف (أو لكلّ المواد) بمخزن (أو بكلّ المخازن). يرفض day_in_future وcategory_not_found وcategory_archived وout_of_scope. */
export async function loadDayBalance({ category, day, warehouse }: DayQuery): Promise<DayBalance> {
  return parseDayBalance(await call<unknown>('day_balance', { p_category: category, p_on: day, p_warehouse: warehouse }));
}

// ─── ملاحظة اليوم ──────────────────────────────────────────────────────────────────────────────────────────────

export interface DayNoteResult {
  itemId: string;
  on: Day;
  /** null: لا ملاحظة لذلك اليوم بعد الحفظ (مُسحت أو لم تكن). */
  note: DayNote | null;
}

export function parseDayNote(value: unknown): DayNoteResult {
  const json = obj(value, 'set_day_note');
  return { itemId: str(json, 'item_id'), on: dayOf(json, 'on'), note: noteOf(json, 'note') };
}

/**
 * ملاحظة مادّة ليوم (stock_note.write): النصّ الفارغ يمسحها، وexpectedVersion ما رآه الكاتب (null = «لم أرَ ملاحظة»). الخادم يرجّع الحال نفسها
 * إن كانت تساوي الطلب (إعادة آمنة)، وإلّا note_changed إن تغيّرت عمّا رآه، وout_of_scope لمادّة لا يقبلها شيء من مخازن الكاتب.
 */
export async function setDayNote(itemId: string, day: Day, text: string, expectedVersion: number | null): Promise<DayNoteResult> {
  return parseDayNote(await call<unknown>('set_day_note', { p_item: itemId, p_on: day, p_note: text, p_expected_version: expectedVersion }));
}

// ─── موادّ التصنيف بترتيبها ────────────────────────────────────────────────────────────────────────────────────

export interface CategoryItemsResult {
  categoryId: string;
  /** عدد موادّ التصنيف بعد الحفظ. */
  count: number;
  /** منها ما نُقل من تصنيف آخر. */
  moved: number;
  /** ما خرج من التصنيف (صار بلا تصنيف). */
  removed: number;
}

export function parseCategoryItems(value: unknown): CategoryItemsResult {
  const json = obj(value, 'set_category_items');
  return { categoryId: str(json, 'category_id'), count: nat(json, 'count'), moved: nat(json, 'moved'), removed: nat(json, 'removed') };
}

/**
 * القائمة كلّها بترتيبها (stores.manage): ما فيها يدخل التصنيف (ولو من تصنيف آخر)، وما خرج منها يصير بلا تصنيف. expectedItems موادّ التصنيف
 * كما عرضتها النافذة (members بترتيبه)، وإن تغيّرت بعدها رفض الخادم category_changed؛ وإعادة الطلب نفسه آمنة.
 */
export async function setCategoryItems(categoryId: string, itemIds: readonly string[], expectedItems: readonly string[]): Promise<CategoryItemsResult> {
  return parseCategoryItems(await call<unknown>('set_category_items', { p_category: categoryId, p_items: [...itemIds], p_expected_items: [...expectedItems] }));
}

/**
 * أسماء موادّ التصنيف الفعّالة لنافذة «أدرج مواد»: members تشمل موادّ لا تظهر في الجدول (لا يقبلها شيء من مخازن النطاق أو المخزن المختار)،
 * والنافذة تعرضها كلّها بأسمائها لأنّ الحفظ يُخرج من التصنيف ما ليس في القائمة. قراءة واحدة (لا يزيد التصنيف على 500 مادّة).
 */
export async function loadCategoryItemNames(categoryId: string): Promise<ReadonlyMap<string, string>> {
  const { result, wasOnline } = await send(
    (db) => db.from('items').select('id, name').eq('category_id', categoryId).is('archived_at', null),
    (answer) => [answer],
  );
  if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  return new Map(
    arr(result.data ?? [], 'items').map((entry) => {
      const row = obj(entry, 'items');
      return [str(row, 'id'), str(row, 'name')] as const;
    }),
  );
}
