import type { Day } from '../../domain/dates';
import type { Milli } from '../../domain/money';
import { BASE_UNITS, ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import { arr, bool, count, obj, oneOf, qtyOf, RowShapeError, str } from './inventory';
import { arrangeOf, colorsOf, markOf, stateOf, type ItemMark, type StockState, type StoreColors } from './storeMarks';

// «الرصيد اليومي» في المخزن. 0022 (كلمة المالك 2026-11-09 بصورة ورقته «رصيد مواد العلف — 4/11/2026»: ت | المادّة | الرصيد (كغم) |
// الملاحظات): ملاحظة لكلّ مادّة لكلّ يوم (set_day_note). و«المخزن بقسمين» (كلمة المالك 2026-11-21، عقد 0034/0035 B5): الصفحة جداول بأقسام المخزن
// من day_balance_sections — «رصيد مواد العلف» (raw وadditive)، و«رصيد العلف» (feed، وناتج المعمل فيه دائماً)، و«أخرى» (كلّ مادّة فعّالة غيرها
// يقبلها مخزن من مخازن المنشأة) — بلا اختيار تصنيف ولا مخزن: التصنيفات ترتّب الصفوف بالخادم وتُدار من «إعداد المخزن». ملف كسول بحزمة شاشات
// المخزون: صفحة المخزن تستورده مباشرةً، وindex ما يصدّره (write-guard PAGE_MODULES).
// الكمية نصّ عشريّ بثلاث مراتب بالسلك (E3) ← Milli، وبلا مال أصلاً (الرصيد كميات لكلّ دور). وكلّ خانة قد تأتي null تُقرأ null (درس WP7).
// ونسخ الملاحظات أرقام من تسلسل.

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

/** مرجع باسمه (تصنيف المادّة) أو null. */
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

/** أقسام المخزن بترتيب عرضها: موادّ العلف، ثمّ العلف، ثمّ ما سواهما. */
export type DaySectionKey = 'feed_materials' | 'feed' | 'other';
export const DAY_SECTION_KEYS: readonly DaySectionKey[] = ['feed_materials', 'feed', 'other'];

export interface DayRow {
  itemId: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  /** الرصيد في نهاية اليوم بوحدة أساس المادّة، في كلّ مخازن المنشأة (قد يكون صفراً: الورقة تكتبه «-»). */
  qty: Milli;
  /** ملاحظة ذلك اليوم. */
  note: DayNote | null;
  /** تصنيف المادّة (يرتّب الصفوف بالخادم) أو null. */
  category: Named | null;
  /** لونها باليد وحدّ قلّتها (0039)، أو null. */
  mark: ItemMark | null;
  /** نافدة أو قليلة برصيد اليوم المعروض (0039)، أو null. */
  state: StockState | null;
}

export interface DaySection {
  key: DaySectionKey;
  /** بترتيب الخادم: ما له تصنيف باسم التصنيف ثمّ ترتيبه فيه، ثمّ الباقي بالاسم. */
  rows: readonly DayRow[];
}

export interface DayBalanceSections {
  /** يوم الخادم (app_today). */
  today: Day;
  /** اليوم المعروض. */
  on: Day;
  /** can('stock_note.write'): كتابة الملاحظات. */
  canNote: boolean;
  /** الأقسام الثلاثة دائماً وبترتيب DAY_SECTION_KEYS (قسم غاب من الجواب = بلا صفوف). */
  sections: readonly DaySection[];
  /** «لوّن تلقائيّاً» ولونا القلّة والنفاد (0039). */
  colors: StoreColors;
  /** can('stores.manage'): «رتّب» (0039). */
  canArrange: boolean;
}

function rowOf(entry: unknown): DayRow {
  const row = obj(entry, 'rows');
  return {
    itemId: str(row, 'item_id'),
    name: str(row, 'name'),
    kind: oneOf(row, 'kind', ITEM_KINDS),
    baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
    qty: qtyOf(row, 'qty'),
    note: noteOf(row, 'note'),
    category: namedOf(row, 'category'),
    mark: markOf(row),
    state: stateOf(row),
  };
}

/**
 * جواب day_balance_sections (عقد 0034/0035 B5). صارم في الشكل: مفتاح قسم غير معروف أو مكرّر خطأ شكل، والمادّة الواحدة في قسمين خطأ شكل
 * (الملاحظة تُفتح وتُحفظ بمعرّف المادّة)؛ والأقسام تُرتَّب هنا بترتيب العرض أيّاً كان ترتيبها بالسلك.
 */
export function parseDayBalanceSections(value: unknown): DayBalanceSections {
  const json = obj(value, 'day_balance_sections');
  const found = new Map<DaySectionKey, readonly DayRow[]>();
  const items = new Set<string>();
  for (const entry of arr(json.sections, 'sections')) {
    const section = obj(entry, 'sections');
    const key = oneOf(section, 'key', DAY_SECTION_KEYS);
    if (found.has(key)) throw new RowShapeError('sections');
    const rows = arr(section.rows, 'rows').map(rowOf);
    for (const row of rows) {
      if (items.has(row.itemId)) throw new RowShapeError('item_id');
      items.add(row.itemId);
    }
    found.set(key, rows);
  }
  return {
    today: dayOf(json, 'today'),
    on: dayOf(json, 'on'),
    canNote: bool(json, 'can_note'),
    sections: DAY_SECTION_KEYS.map((key) => ({ key, rows: found.get(key) ?? [] })),
    colors: colorsOf(json),
    canArrange: arrangeOf(json),
  };
}

/** رصيد أقسام المخزن في نهاية يوم (null = اليوم بالخادم). يرفض day_in_future وdate_required بتلميحهما. */
export async function loadDayBalanceSections(day: Day | null): Promise<DayBalanceSections> {
  return parseDayBalanceSections(await call<unknown>('day_balance_sections', { p_on: day }));
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
