import { decimalText } from '../../domain/decimal';
import type { Milli } from '../../domain/money';
import { BASE_UNITS, ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import { arr, bool, count, obj, oneOf, RowShapeError, scaled, str } from './inventory';

// ترتيب الموادّ وألوان الرصيد (0037، رسالتا الزبون الصوتيّتان 2026-11-26؛ DECISIONS 2026-11-26): ترتيب كلّ قسم من أقسام المخزن بالسحب
// (store_section_items وset_store_order)، ولون كلّ مادّة وحدّ قلّتها (set_item_color وset_item_low وitem_mark)، و«لوّن تلقائيّاً» ولونا القلّة
// والنفاد (set_store_colors). ومحلّلات mark وstate وcolors يستعملها الرصيد اليوميّ وبطاقات المخزن. مفاتيح 0037 تغيب في جواب خادم قبلها (بين
// النشر والتطبيق) فتُقرأ بلا لون ولا ترتيب، وما يُرسل يُقرأ بشكله كلّه أو يُرفض. ملف كسول بحزمة المخزن، وindex ما يصدّره.

type Row = Record<string, unknown>;

/** أقسام المخزن الثلاثة (مرآة private.store_section). */
export type StoreSectionKey = 'feed_materials' | 'feed' | 'other';
export const STORE_SECTION_KEYS: readonly StoreSectionKey[] = ['feed_materials', 'feed', 'other'];

/** الألوان الثمانية بأسمائها (مرآة private.mark_colors). */
export type MarkColor = 'yellow' | 'orange' | 'red' | 'pink' | 'purple' | 'blue' | 'green' | 'gray';
export const MARK_COLORS: readonly MarkColor[] = ['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green', 'gray'];

/** حالة المادّة برصيدها: نافدة (صفر أو أقلّ) أو قليلة (عند حدّها أو تحته). */
export type StockState = 'out' | 'low';
const STATES: readonly StockState[] = ['out', 'low'];

/** لون المادّة (null: بلا لون باليد) وحدّ قلّتها بوحدة أساسها (null: بلا حدّ) ونسخة صفّها (≥ 1). */
export interface ItemMark {
  color: MarkColor | null;
  lowQty: Milli | null;
  version: number;
}

/** «لوّن تلقائيّاً» ولونا القلّة والنفاد؛ والنسخة 0 بلا إعدادات محفوظة. */
export interface StoreColors {
  auto: boolean;
  low: MarkColor;
  out: MarkColor;
  version: number;
}

export const DEFAULT_COLORS: StoreColors = { auto: false, low: 'yellow', out: 'red', version: 0 };

const nat = (row: Row, field: string): number => {
  const value = count(row, field);
  if (value === null) throw new RowShapeError(field);
  return value;
};

/** mark صفّ: غيابه (خادم قبل 0037) أو null = بلا لون ولا حدّ؛ وما يُرسل بلونه من الثمانية أو null، وحدّه موجباً أو null، ونسخته ≥ 1. */
export function markOf(row: Row, field = 'mark'): ItemMark | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  const box = obj(value, field);
  const version = nat(box, 'version');
  if (version < 1) throw new RowShapeError('version');
  const color = box.color === null ? null : oneOf(box, 'color', MARK_COLORS);
  const lowQty = scaled(box, 'low_qty', 3);
  if (lowQty !== null && lowQty <= 0n) throw new RowShapeError('low_qty');
  return { color, lowQty, version };
}

/** state صفّ: غيابه أو null = لا شيء. */
export function stateOf(row: Row, field = 'state'): StockState | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  return oneOf(row, field, STATES);
}

/** colors الجواب: غيابه (خادم قبل 0037) = الافتراض؛ وما يُرسل بشكله كلّه. */
export function colorsOf(json: Row, field = 'colors'): StoreColors {
  const value = json[field];
  if (value === undefined) return DEFAULT_COLORS;
  const box = obj(value, field);
  return { auto: bool(box, 'auto'), low: oneOf(box, 'low', MARK_COLORS), out: oneOf(box, 'out', MARK_COLORS), version: nat(box, 'version') };
}

/** علم can_arrange: غيابه (خادم قبل 0037) = لا ترتيب. */
export function arrangeOf(json: Row): boolean {
  return json.can_arrange === undefined ? false : bool(json, 'can_arrange');
}

/** اللون الظاهر: اللون باليد يغلب، ثمّ التلقائيّ لحالة المادّة إن كان مشغَّلاً، وإلّا لا لون. */
export function shownColor(mark: ItemMark | null, state: StockState | null, colors: StoreColors): MarkColor | null {
  if (mark?.color) return mark.color;
  if (!colors.auto || state === null) return null;
  return state === 'out' ? colors.out : colors.low;
}

// ─── الترتيب ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SectionItem {
  id: string;
  name: string;
  kind: ItemKind;
}

export interface SectionItems {
  section: StoreSectionKey;
  canArrange: boolean;
  /** موادّ القسم الفعّالة كلّها بترتيبها. */
  items: readonly SectionItem[];
}

export function parseSectionItems(value: unknown): SectionItems {
  const json = obj(value, 'store_section_items');
  const seen = new Set<string>();
  const items = arr(json.items, 'items').map((entry) => {
    const row = obj(entry, 'items');
    const id = str(row, 'id');
    if (seen.has(id)) throw new RowShapeError('id');
    seen.add(id);
    return { id, name: str(row, 'name'), kind: oneOf(row, 'kind', ITEM_KINDS) };
  });
  return { section: oneOf(json, 'section', STORE_SECTION_KEYS), canArrange: bool(json, 'can_arrange'), items };
}

/** موادّ القسم كاملة بترتيبها لنافذة «رتّب». */
export async function loadSectionItems(section: StoreSectionKey): Promise<SectionItems> {
  return parseSectionItems(await call<unknown>('store_section_items', { p_section: section }));
}

/** الترتيب كاملاً بشرط القائمة التي عُرضت (expected)؛ والإعادة بالترتيب نفسه نجاح. */
export async function setStoreOrder(section: StoreSectionKey, items: readonly string[], expected: readonly string[]): Promise<{ section: StoreSectionKey; count: number; version: number }> {
  const json = obj(await call<unknown>('set_store_order', { p_section: section, p_items: [...items], p_expected: [...expected] }), 'set_store_order');
  return { section: oneOf(json, 'section', STORE_SECTION_KEYS), count: nat(json, 'count'), version: nat(json, 'version') };
}

// ─── لون المادّة وحدّها ───────────────────────────────────────────────────────────────────────────────────────────

export interface MarkResult {
  itemId: string;
  mark: ItemMark | null;
}

export function parseMarkResult(value: unknown, field: string): MarkResult {
  const json = obj(value, field);
  return { itemId: str(json, 'item_id'), mark: markOf(json) };
}

/** لون المادّة (null يشيله) بشرط نسخة صفّها التي عُرضت (0 بلا صفّ)؛ واللون نفسه الآن نجاح بلا كتابة. */
export async function setItemColor(itemId: string, color: MarkColor | null, expectedVersion: number): Promise<MarkResult> {
  return parseMarkResult(await call<unknown>('set_item_color', { p_item: itemId, p_color: color, p_expected_version: expectedVersion }), 'set_item_color');
}

/** حدّ قلّة المادّة بوحدة أساسها (null يشيله)، بشرط النسخة كاللون. */
export async function setItemLow(itemId: string, lowQty: Milli | null, expectedVersion: number): Promise<MarkResult> {
  return parseMarkResult(
    await call<unknown>('set_item_low', { p_item: itemId, p_low_qty: lowQty === null ? null : decimalText(lowQty, 3), p_expected_version: expectedVersion }),
    'set_item_low',
  );
}

export interface ItemMarkFile {
  itemId: string;
  baseUnit: BaseUnit;
  canMark: boolean;
  mark: ItemMark | null;
  colors: StoreColors;
}

export function parseItemMark(value: unknown): ItemMarkFile {
  const json = obj(value, 'item_mark');
  return { itemId: str(json, 'item_id'), baseUnit: oneOf(json, 'base_unit', BASE_UNITS), canMark: bool(json, 'can_mark'), mark: markOf(json), colors: colorsOf(json) };
}

/** لون المادّة وحدّها لملفّها. */
export async function loadItemMark(itemId: string): Promise<ItemMarkFile> {
  return parseItemMark(await call<unknown>('item_mark', { p_item: itemId }));
}

// ─── ألوان القلّة والنفاد ─────────────────────────────────────────────────────────────────────────────────────────

/** «لوّن تلقائيّاً» ولونا القلّة والنفاد بشرط النسخة التي عُرضت (0 بلا إعدادات)؛ والإعدادات نفسها الآن نجاح. */
export async function setStoreColors(auto: boolean, low: MarkColor, out: MarkColor, expectedVersion: number): Promise<StoreColors> {
  const json = obj(
    await call<unknown>('set_store_colors', { p_auto: auto, p_low_color: low, p_out_color: out, p_expected_version: expectedVersion }),
    'set_store_colors',
  );
  return { auto: bool(json, 'auto'), low: oneOf(json, 'low', MARK_COLORS), out: oneOf(json, 'out', MARK_COLORS), version: nat(json, 'version') };
}
