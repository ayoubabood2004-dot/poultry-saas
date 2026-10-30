import type { SupabaseClient } from '@supabase/supabase-js';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { DivisionKind } from '../../domain/divisions';
import type { Fils, Milli } from '../../domain/money';
import { normalizeCode, searchable } from '../../domain/normalize';
import { BASE_UNITS, DIVISION_ORDER, ITEM_KINDS, SITE_KINDS, WAREHOUSE_KINDS, type ItemKind, type SiteKind, type WarehouseKind } from '../../domain/stores';
import type { BaseUnit, Dimension } from '../../domain/units';
import { RejectedError, ZeroRowsError } from '../errors';
import type { Answer, PostgrestFailure } from './core';
import './constraints-stock';
import './constraints-stores';
import { call, classifyPostgrest, explained, send, updatedRows } from './core';

// المواقع والمخازن والمواد ووحدات التعبئة والتصنيفات (0005). ملف كسول: الشاشات تستورده مباشرةً فيدخل حزمتها، مو مسار
// الجلسة الحرج (index ما يصدّره، DECISIONS «السقوف»). القراءة بسياسات المنشأة؛ والكتابة مباشرة بسياسة (منشأة + فعل)
// وبـupdatedRows، والتعديل يبعث الحقول المتغيّرة بس وبشرط النسخة اللي انفتحت (FOUNDATION ٨١٧): صفر صفوف = تغيّر بعدك.
// ماكو حذف (E52): الأرشفة وقتها من الخادم (master_write)، والجهاز يبعث «now» بس. الأرقام نصوص عشرية بالاتجاهين (E3).

export type MasterTable = 'sites' | 'warehouses' | 'pack_types' | 'item_categories' | 'items' | 'item_units' | 'expense_categories';

interface Versioned {
  id: string;
  version: number;
  archived: boolean;
}

export interface DivisionSetup {
  id: string;
  kind: DivisionKind;
  /** YYYY-MM-DD أو null (ما تحدّد بعد). */
  goLiveOn: string | null;
  /** أوّل ترحيل بالوحدة: يوم التشغيل ثابت بعده (E14). */
  frozen: boolean;
}

export interface SiteRow extends Versioned {
  divisionId: string;
  name: string;
  kind: SiteKind;
}

export interface WarehouseRow extends Versioned {
  divisionId: string;
  siteId: string;
  name: string;
  kind: WarehouseKind;
  /** «مؤرشف وعليه رصيد» (§2.6، E43): مؤرشف ورجع إليه رصيد بإلغاء، فينعاد من الأرشيف أو يتصفّى. من archived_stores_with_stock. */
  hasBalance?: boolean;
}

export interface PackTypeRow extends Versioned {
  label: string;
  dimension: Dimension;
  /** بمراتب ستّ (25 كغم ← 25000000). */
  factor: bigint;
}

export interface CategoryRow extends Versioned {
  name: string;
}

export interface ExpenseCategoryRow extends CategoryRow {
  systemCode: string | null;
}

export interface OrgSetup {
  divisions: readonly DivisionSetup[];
  sites: readonly SiteRow[];
  warehouses: readonly WarehouseRow[];
  packTypes: readonly PackTypeRow[];
  itemCategories: readonly CategoryRow[];
  expenseCategories: readonly ExpenseCategoryRow[];
}

type Row = Record<string, unknown>;

/**
 * جواب بشكل غير المتوقّع (خانة ناقصة أو نوع غلط): يرمي بدل ما ينقبل بصمت، مثل WorkspaceShapeError. صنف لحاله هنا: استيراد
 * domain/workspace من ملف كسول كان يقسم حزمته عن الموظفين ويزيد مسار الجلسة الحرج.
 */
export class RowShapeError extends Error {
  constructor(readonly field: string) {
    super(`row_shape:${field}`);
    this.name = 'RowShapeError';
  }
}

function str(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new RowShapeError(field);
  return value;
}

function optStr(row: Row, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new RowShapeError(field);
  return value;
}

function oneOf<T extends string>(row: Row, field: string, values: readonly T[]): T {
  const value = row[field];
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) throw new RowShapeError(field);
  return value as T;
}

/** نصّ numeric من القاعدة (العمود مقروء ::text) بمراتبه الثابتة، أو null. */
function scaled(row: Row, field: string, scale: number): bigint | null {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, scale);
  if (value === null) throw new RowShapeError(field);
  return toScale(value, scale);
}

function versioned(row: Row): Versioned {
  const version = row.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new RowShapeError('version');
  return { id: str(row, 'id'), version, archived: row.archived_at !== null && row.archived_at !== undefined };
}

const DIMENSIONS: readonly Dimension[] = ['mass', 'volume', 'count'];

const site = (row: Row): SiteRow => ({ ...versioned(row), divisionId: str(row, 'division_id'), name: str(row, 'name'), kind: oneOf(row, 'kind', SITE_KINDS) });
const warehouse = (row: Row): WarehouseRow => ({
  ...versioned(row),
  divisionId: str(row, 'division_id'),
  siteId: str(row, 'site_id'),
  name: str(row, 'name'),
  kind: oneOf(row, 'kind', WAREHOUSE_KINDS),
});
const packType = (row: Row): PackTypeRow => ({
  ...versioned(row),
  label: str(row, 'label'),
  dimension: oneOf(row, 'dimension', DIMENSIONS),
  factor: scaled(row, 'factor', 6) ?? 0n,
});
const category = (row: Row): CategoryRow => ({ ...versioned(row), name: str(row, 'name') });

const SITE_COLUMNS = 'id, division_id, name, kind, archived_at, version';
const WAREHOUSE_COLUMNS = 'id, division_id, site_id, name, kind, archived_at, version';
const PACK_COLUMNS = 'id, label, dimension, factor::text, archived_at, version';
const CATEGORY_COLUMNS = 'id, name, archived_at, version';

/** يفحص كل جواب ويرمي أوّل خطأ مصنّفاً؛ القائمة اللي ينبني عليها قرار ما تبلع خطأها (FOUNDATION ٧٩٨). */
function rowsOf(answers: readonly (Answer & { data: unknown })[], wasOnline: boolean): (index: number) => Row[] {
  for (const answer of answers) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  return (index) => {
    const data = answers[index]?.data;
    return Array.isArray(data) ? (data as Row[]) : [];
  };
}

/**
 * كل إعداد المنشأة لشاشة «إعدادات المنشأة»: الوحدات ويوم تشغيلها، والمواقع والمخازن (والمؤرشف وعليه رصيد بعلامته، من دالّة بلا
 * قيم لكل دور بنطاقه)، والأحجام والتصنيفات.
 */
export async function loadOrgSetup(): Promise<OrgSetup> {
  const { result, wasOnline } = await send(
    (db) =>
      Promise.all([
        db.from('divisions').select('id, kind, go_live_on, first_posted_at').is('archived_at', null),
        db.from('sites').select(SITE_COLUMNS).order('name'),
        db.from('warehouses').select(WAREHOUSE_COLUMNS).order('name'),
        db.from('pack_types').select(PACK_COLUMNS).order('dimension').order('factor'),
        db.from('item_categories').select(CATEGORY_COLUMNS).order('name'),
        db.from('expense_categories').select(`${CATEGORY_COLUMNS}, system_code`).order('name'),
        db.rpc('archived_stores_with_stock'),
      ]),
    (answers) => answers,
  );
  const list = rowsOf(result, wasOnline);
  const flagged = result[6]?.data;
  if (!Array.isArray(flagged) || flagged.some((id) => typeof id !== 'string')) throw new RowShapeError('archived_stores_with_stock');
  const withBalance = new Set<unknown>(flagged);
  return {
    divisions: list(0).map((row) => ({
      id: str(row, 'id'),
      kind: oneOf(row, 'kind', DIVISION_ORDER),
      goLiveOn: optStr(row, 'go_live_on'),
      frozen: row.first_posted_at !== null && row.first_posted_at !== undefined,
    })),
    sites: list(1).map(site),
    warehouses: list(2).map((row) => ({ ...warehouse(row), hasBalance: withBalance.has(row.id) })),
    packTypes: list(3).map(packType),
    itemCategories: list(4).map(category),
    expenseCategories: list(5).map((row) => ({ ...category(row), systemCode: optStr(row, 'system_code') })),
  };
}

/** يوم تشغيل الوحدة (opening.post، المدير). يرجّع اليوم كما انحفظ. */
export async function setDivisionGoLive(divisionId: string, day: string): Promise<string> {
  const saved = await call<unknown>('set_division_go_live', { p_division: divisionId, p_go_live_on: day });
  if (typeof saved !== 'string') throw new RowShapeError('go_live_on');
  return saved;
}

type Raw = { data: unknown; error: PostgrestFailure | null; status: number };
type Failed = PostgrestFailure & { status: number };

/** الخطأ ويّا حالة HTTP، حتى يتصنّف بعد ما updatedRows يرميه (0 = ما وصل، 401 = هويّة، 23514 = قيد باسمه). */
const withStatus = (answer: Raw) => ({ data: answer.data as Row | Row[] | null, error: answer.error ? { ...answer.error, status: answer.status } : null });

const failed = (error: unknown): error is Failed => typeof error === 'object' && error !== null && typeof (error as Failed).status === 'number';

/**
 * كتابة مباشرة: make تكتب بـupdatedRows(withStatus(await db.from(…).insert/update(…).select())) نفسها (write-guard يقرا
 * updatedRows حوالين الكتابة)، وخطأ القاعدة يرجع جواباً حتى send يجدّد مرّة على JWT مرفوض، وبعدها يتصنّف. صفر صفوف
 * (ZeroRowsError: النسخة تغيّرت بعد ما انفتح النموذج) يطلع كما هو.
 */
async function written(make: (db: SupabaseClient) => Promise<Row[]>): Promise<Row> {
  const { result, wasOnline } = await send(
    async (db): Promise<{ rows: Row[]; error: PostgrestFailure | null; status: number }> => {
      try {
        return { rows: await make(db), error: null, status: 200 };
      } catch (error) {
        if (!failed(error)) throw error;
        return { rows: [], error, status: error.status };
      }
    },
    (answer) => [answer],
  );
  if (result.error) throw await explained(classifyPostgrest(result.error, result.status, 'table', wasOnline));
  const [row] = result.rows;
  if (!row) throw new ZeroRowsError();
  return row;
}

export function createSite(divisionId: string, name: string, kind: SiteKind): Promise<SiteRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('sites').insert({ division_id: divisionId, name: name.trim(), kind }).select(SITE_COLUMNS)))).then(site);
}

export function createWarehouse(divisionId: string, siteId: string, name: string, kind: WarehouseKind): Promise<WarehouseRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('warehouses').insert({ division_id: divisionId, site_id: siteId, name: name.trim(), kind }).select(WAREHOUSE_COLUMNS)))).then(warehouse);
}

/** factor بمراتب ستّ (25 كغم ← 25000000n). */
export function createPackType(label: string, dimension: Dimension, factor: bigint): Promise<PackTypeRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('pack_types').insert({ label: label.trim(), dimension, factor: decimalText(factor, 6) }).select(PACK_COLUMNS)))).then(packType);
}

export function createItemCategory(name: string): Promise<CategoryRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('item_categories').insert({ name: name.trim() }).select(CATEGORY_COLUMNS)))).then(category);
}

export function createExpenseCategory(name: string): Promise<ExpenseCategoryRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('expense_categories').insert({ name: name.trim() }).select(`${CATEGORY_COLUMNS}, system_code`)))).then((row) => ({
    ...category(row),
    systemCode: optStr(row, 'system_code'),
  }));
}

/** الاسم (أو اسم الحجم) بشرط النسخة. يرجّع النسخة الجديدة. */
export async function rename(table: 'sites' | 'warehouses' | 'pack_types' | 'item_categories' | 'expense_categories', id: string, version: number, name: string): Promise<number> {
  const row = await written(async (db) =>
    table === 'pack_types'
      ? updatedRows(withStatus(await db.from('pack_types').update({ label: name.trim() }).eq('id', id).eq('version', version).select('id, version')))
      : updatedRows(withStatus(await db.from(table).update({ name: name.trim() }).eq('id', id).eq('version', version).select('id, version'))),
  );
  return versioned({ ...row, archived_at: null }).version;
}

/** أرشفة أو إعادة بشرط النسخة (وقت الأرشفة من الخادم). يرجّع النسخة الجديدة. */
export async function setArchived(table: MasterTable, id: string, version: number, archived: boolean): Promise<number> {
  const row = await written(async (db) =>
    updatedRows(withStatus(await db.from(table).update({ archived_at: archived ? 'now' : null }).eq('id', id).eq('version', version).select('id, version'))),
  );
  return versioned({ ...row, archived_at: null }).version;
}

// ─── المواد ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface ItemRow extends Versioned {
  name: string;
  nameNorm: string;
  categoryId: string | null;
  kind: ItemKind;
  baseUnit: BaseUnit;
  /** ١/١٠٠٠٠ كغم/لتر. */
  density: bigint | null;
  /** بالآلاف من الكيلو. */
  pieceMassKg: bigint | null;
  tracksExpiry: boolean;
  /** بالآلاف من وحدة الأساس. */
  scaleStep: bigint;
  minQty: bigint | null;
  barcode: string | null;
  altCodes: readonly string[];
}

/** حقول المادّة كما تنكتب (أسماء أعمدتها)، والأرقام نصوص عشرية. */
export interface ItemFields {
  name: string;
  category_id: string | null;
  kind: ItemKind;
  base_unit: BaseUnit;
  density_kg_per_l: string | null;
  piece_mass_kg: string | null;
  tracks_expiry: boolean;
  scale_step: string;
  min_qty: string | null;
  barcode: string | null;
  alt_codes: string[];
}

const ITEM_COLUMNS =
  'id, name, name_norm, category_id, kind, base_unit, density_kg_per_l::text, piece_mass_kg::text, tracks_expiry, scale_step::text, min_qty::text, barcode, alt_codes, archived_at, version';

/**
 * صفّ مادّة من القاعدة. الاسم المطبَّع نصّ ولو فارغ: صفّ قديم بلا اسم مطبَّع (قبل items_name_norm_check) يبين بالقائمة ويتعدّل،
 * بدل ما يرمي فتطيح صفحة المواد كلها (ترتيبها بالاسم المطبَّع، فالفارغ أوّل صفّ بكل صفحة أولى).
 */
export function parseItemRow(row: Record<string, unknown>): ItemRow {
  const codes = row.alt_codes;
  if (!Array.isArray(codes) || codes.some((code) => typeof code !== 'string')) throw new RowShapeError('alt_codes');
  if (typeof row.tracks_expiry !== 'boolean') throw new RowShapeError('tracks_expiry');
  if (typeof row.name_norm !== 'string') throw new RowShapeError('name_norm');
  return {
    ...versioned(row),
    name: str(row, 'name'),
    nameNorm: row.name_norm,
    categoryId: optStr(row, 'category_id'),
    kind: oneOf(row, 'kind', ITEM_KINDS),
    baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
    density: scaled(row, 'density_kg_per_l', 4),
    pieceMassKg: scaled(row, 'piece_mass_kg', 3),
    tracksExpiry: row.tracks_expiry,
    scaleStep: scaled(row, 'scale_step', 3) ?? 0n,
    minQty: scaled(row, 'min_qty', 3),
    barcode: optStr(row, 'barcode'),
    altCodes: codes as string[],
  };
}

/** المؤشّر للصفحة الجاية: آخر صفّ وصل بترتيب (الاسم المطبَّع، المعرّف). */
export interface ItemCursor {
  nameNorm: string;
  id: string;
}

export interface ItemPage {
  rows: readonly ItemRow[];
  /** العدد الكلّي للبحث من القاعدة (count)، بأوّل صفحة بس؛ الصفحات بعدها null. */
  total: number | null;
  next: ItemCursor | null;
}

export const ITEMS_PAGE = 50;

/** قيمة بفلتر PostgREST بين علامتي تنصيص: «"» و«\» يتهرّبون. */
const quoted = (value: string) => `"${value.replace(/["\\]/g, (ch) => `\\${ch}`)}"`;

/**
 * فلتر البحث: الاسم بـsearchable (يحتوي)، والرمز بـnormalizeCode (الباركود أو أحد الرموز الإضافية بالضبط). حروف LIKE
 * بالاسم حرفية («علف 21%» و«B_12»): «%» و«_» و«\» تتهرّب بـ«\» (مهرب LIKE الافتراضي)، و«*» يبقى (PostgREST يقلبه «%»، فيلكى
 * نفسه). الأقواس والفاصلة والتنصيص آمنة داخل القيمة المنصّصة (quoted). والاسم يلكى نفسه بالبحث باسمه كاملاً، والرمز بحروفه
 * العادية بس.
 */
export function itemSearchFilter(input: string): string | null {
  const name = searchable(input).replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const code = normalizeCode(input);
  const parts: string[] = [];
  if (name) parts.push(`name_norm.like.${quoted(`*${name}*`)}`);
  if (/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) parts.push(`barcode.eq.${quoted(code)}`, `alt_codes.cs.{${code}}`);
  return parts.length ? parts.join(',') : null;
}

/** صفحة مواد بالمعرّف (keyset)، بحث اختياري، والمؤرشفة اختيارياً. العدد الكلّي من القاعدة بأوّل صفحة. */
export async function listItems({ search = '', archived = false, after = null }: { search?: string; archived?: boolean; after?: ItemCursor | null } = {}): Promise<ItemPage> {
  const filter = itemSearchFilter(search);
  const { result, wasOnline } = await send(
    (db) => {
      let page = db.from('items').select(ITEM_COLUMNS);
      let count = db.from('items').select('id', { count: 'exact', head: true });
      if (!archived) {
        page = page.is('archived_at', null);
        count = count.is('archived_at', null);
      }
      if (filter) count = count.or(filter);
      // البحث والمؤشّر بفلتر or واحد (and لمجموعتي or): كل شرط بمكانه، بلا اعتماد على تكرار المعامل.
      const cursor = after ? `name_norm.gt.${quoted(after.nameNorm)},and(name_norm.eq.${quoted(after.nameNorm)},id.gt.${after.id})` : null;
      if (filter && cursor) page = page.or(`and(or(${filter}),or(${cursor}))`);
      else if (filter || cursor) page = page.or(filter ?? cursor ?? '');
      const rows = page.order('name_norm').order('id').limit(ITEMS_PAGE);
      return Promise.all([rows, after ? null : count]);
    },
    ([rows, count]) => (count ? [rows, count] : [rows]),
  );
  const [rows, count] = result;
  for (const answer of count ? [rows, count] : [rows]) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  const items = ((rows.data ?? []) as Row[]).map(parseItemRow);
  const last = items.at(-1);
  return {
    rows: items,
    total: count ? (count.count ?? 0) : null,
    next: items.length === ITEMS_PAGE && last ? { nameNorm: last.nameNorm, id: last.id } : null,
  };
}

export function createItem(fields: ItemFields): Promise<ItemRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('items').insert(fields).select(ITEM_COLUMNS)))).then(parseItemRow);
}

/** الحقول المتغيّرة بس، بشرط النسخة. */
export function updateItem(id: string, version: number, patch: Partial<ItemFields>): Promise<ItemRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('items').update(patch).eq('id', id).eq('version', version).select(ITEM_COLUMNS)))).then(parseItemRow);
}

export interface ItemTwin {
  id: string;
  name: string;
  archived: boolean;
  /** نفس الاسم بعد التطبيع: تنبيه، والحفظ مسموح بعد التأكيد (Q2). */
  sameName: boolean;
  /** رموز مشتركة: الرمز يدلّ على مادّة واحدة بين الفعّالة، فالحفظ يرفض (twin_exists). */
  codes: readonly string[];
}

/** التوائم قبل الحفظ (find_item_twins): بالتطبيع على الطرفين، والمؤرشفة ويّاها. */
export async function findItemTwins(name: string, codes: readonly string[]): Promise<ItemTwin[]> {
  const found = await call<unknown>('find_item_twins', { p_name: name, p_codes: codes });
  if (!Array.isArray(found)) throw new RowShapeError('find_item_twins');
  return (found as Row[]).map((row) => {
    if (typeof row.archived !== 'boolean' || typeof row.same_name !== 'boolean' || !Array.isArray(row.codes)) throw new RowShapeError('find_item_twins');
    return { id: str(row, 'id'), name: str(row, 'name'), archived: row.archived, sameName: row.same_name, codes: row.codes as string[] };
  });
}

// ─── وحدات المادّة ────────────────────────────────────────────────────────────────────────────────────────────

export interface ItemUnitRow extends Versioned {
  itemId: string;
  packTypeId: string | null;
  label: string;
  /** بمراتب ستّ. */
  factor: bigint;
  isDefault: boolean;
  forPurchase: boolean;
  forSale: boolean;
  forRecipe: boolean;
}

export interface ItemUnitFields {
  label: string;
  factor_to_base: string;
  is_default: boolean;
  for_purchase: boolean;
  for_sale: boolean;
  for_recipe: boolean;
}

const UNIT_COLUMNS = 'id, item_id, pack_type_id, label, factor_to_base::text, is_default, for_purchase, for_sale, for_recipe, archived_at, version';

function itemUnit(row: Row): ItemUnitRow {
  const flag = (field: string): boolean => {
    const value = row[field];
    if (typeof value !== 'boolean') throw new RowShapeError(field);
    return value;
  };
  return {
    ...versioned(row),
    itemId: str(row, 'item_id'),
    packTypeId: optStr(row, 'pack_type_id'),
    label: str(row, 'label'),
    factor: scaled(row, 'factor_to_base', 6) ?? 0n,
    isDefault: flag('is_default'),
    forPurchase: flag('for_purchase'),
    forSale: flag('for_sale'),
    forRecipe: flag('for_recipe'),
  };
}

export async function listItemUnits(itemId: string): Promise<ItemUnitRow[]> {
  const { result, wasOnline } = await send(
    (db) => db.from('item_units').select(UNIT_COLUMNS).eq('item_id', itemId).order('factor_to_base'),
    (answer) => [answer],
  );
  return rowsOf([result], wasOnline)(0).map(itemUnit);
}

export function createItemUnit(itemId: string, packTypeId: string | null, fields: ItemUnitFields): Promise<ItemUnitRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('item_units').insert({ ...fields, item_id: itemId, pack_type_id: packTypeId }).select(UNIT_COLUMNS)))).then(itemUnit);
}

export function updateItemUnit(id: string, version: number, patch: Partial<ItemUnitFields>): Promise<ItemUnitRow> {
  return written(async (db) => updatedRows(withStatus(await db.from('item_units').update(patch).eq('id', id).eq('version', version).select(UNIT_COLUMNS)))).then(itemUnit);
}

// ─── المخزون (0007): اللوحة وبطاقة المادّة والقيم، ومسوّدات الافتتاح والتحويل وترحيلها ─────────────────────────────────
// الكميات من دوالّ definer بلا قيم (stock_on_hand وitem_lots_qty وitem_moves_qty) لكل دور بنطاقه، والقيم من دوالّ invoker
// لأدوار الكلفة بس (stock_values وstock_value_totals وitem_lots_value)؛ ما ينقرا stock_lots ولا stock_moves ولا stock_balances
// مباشرة (§2.8). المسوّدات كتابة مباشرة بـupdatedRows (§2.5)، والترحيل والإلغاء بمرجع ثابت لحد ما تنعرف النتيجة (FOUNDATION ٥١٩).

export type StockDocKind = 'opening' | 'transfer';
export type DocStatus = 'draft' | 'posted' | 'void';
const DOC_STATUSES: readonly DocStatus[] = ['draft', 'posted', 'void'];

const obj = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RowShapeError(field);
  return value as Row;
};
const arr = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new RowShapeError(field);
  return value;
};
const bool = (row: Row, field: string): boolean => {
  const value = row[field];
  if (typeof value !== 'boolean') throw new RowShapeError(field);
  return value;
};
const qtyOf = (row: Row, field: string): Milli => {
  const value = scaled(row, field, 3);
  if (value === null) throw new RowShapeError(field);
  return value;
};
const filsOf = (row: Row, field: string): Fils => {
  const value = scaled(row, field, 2);
  if (value === null) throw new RowShapeError(field);
  return value;
};
const count = (row: Row, field: string): number | null => {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new RowShapeError(field);
  return value;
};
const wholeText = (row: Row, field: string): bigint | null => {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, 0);
  if (value === null) throw new RowShapeError(field);
  return toScale(value, 0);
};

export interface StockWarehouse {
  id: string;
  name: string;
  kind: WarehouseKind;
  divisionId: string;
  divisionKind: DivisionKind;
  archived: boolean;
  /** «مؤرشف وعليه رصيد» (E43): مؤرشف وبيه رصيد رجع بإلغاء. */
  hasBalance: boolean;
}

export interface StockRow {
  itemId: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  minQty: Milli | null;
  archived: boolean;
  /** المتاح الآن (غير المنتهي، FOUNDATION ٤٧٦). */
  available: Milli;
  /** المنتهي بعمود منفصل. */
  expired: Milli;
  /** ينتهي خلال 30 يوماً (E22). */
  nearExpiry: Milli;
  /** المتاح بمخازن الاستلام بالمنشأة تحت الحدّ الأدنى (E22). */
  belowMin: boolean;
  /** عمر أقدم فرخ بالساعات (E24)، أو null. */
  chickAgeHours: bigint | null;
  /** أفراخ فاتها 48 ساعة. */
  oldChicks: Milli;
}

/** مؤشّر صفحة اللوحة: الاسم المطبَّع والمعرّف كما وصلا بآخر صفّ (مادّة انسمّت بين صفحتين ما تقفّز اللي بعدها). */
export interface StockCursor {
  name: string;
  id: string;
}

export interface StockBoard {
  warehouse: StockWarehouse;
  /** وقت القراءة من الخادم (ISO). */
  asOf: string;
  rows: readonly StockRow[];
  /** مؤشّر الصفحة الجاية، أو null. */
  next: StockCursor | null;
  /** العدد الكلّي بأوّل صفحة («N من المجموع»)؛ null بالصفحات بعدها. */
  total: number | null;
}

export function parseStockBoard(value: unknown): StockBoard {
  const json = obj(value, 'stock_on_hand');
  const w = obj(json.warehouse, 'warehouse');
  return {
    warehouse: {
      id: str(w, 'id'),
      name: str(w, 'name'),
      kind: oneOf(w, 'kind', WAREHOUSE_KINDS),
      divisionId: str(w, 'division_id'),
      divisionKind: oneOf(w, 'division_kind', DIVISION_ORDER),
      archived: bool(w, 'archived'),
      hasBalance: bool(w, 'has_balance'),
    },
    asOf: str(json, 'as_of'),
    rows: arr(json.rows, 'rows').map((item) => {
      const row = obj(item, 'rows');
      return {
        itemId: str(row, 'item_id'),
        name: str(row, 'name'),
        kind: oneOf(row, 'kind', ITEM_KINDS),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        tracksExpiry: bool(row, 'tracks_expiry'),
        minQty: scaled(row, 'min_qty', 3),
        archived: bool(row, 'archived'),
        available: qtyOf(row, 'available'),
        expired: qtyOf(row, 'expired'),
        nearExpiry: qtyOf(row, 'near_expiry'),
        belowMin: bool(row, 'below_min'),
        chickAgeHours: wholeText(row, 'chick_age_hours'),
        oldChicks: qtyOf(row, 'old_chicks'),
      };
    }),
    next: json.next === null || json.next === undefined ? null : stockCursor(obj(json.next, 'next')),
    total: count(json, 'total'),
  };
}

const stockCursor = (row: Row): StockCursor => ({ name: str(row, 'name'), id: str(row, 'id') });

export const STOCK_PAGE = 100;

export async function loadStockOnHand(warehouseId: string, after: StockCursor | null = null): Promise<StockBoard> {
  return parseStockBoard(await call<unknown>('stock_on_hand', { p_warehouse: warehouseId, p_after: after, p_limit: STOCK_PAGE }));
}

export interface StockValue {
  available: Fils;
  expired: Fils;
}

/** قيم المتاح والمنتهي لكل مادّة (أدوار الكلفة)، بنفس مؤشّر صفحة اللوحة فتغطّيها. */
export async function loadStockValues(warehouseId: string, after: StockCursor | null = null): Promise<Map<string, StockValue>> {
  const json = obj(await call<unknown>('stock_values', { p_warehouse: warehouseId, p_after: after, p_limit: STOCK_PAGE }), 'stock_values');
  return new Map(
    arr(json.rows, 'rows').map((item) => {
      const row = obj(item, 'rows');
      return [str(row, 'item_id'), { available: filsOf(row, 'available'), expired: filsOf(row, 'expired') }];
    }),
  );
}

export interface StockTotals {
  units: readonly { baseUnit: BaseUnit; available: Milli; expired: Milli }[];
  available: Fils;
  expired: Fils;
  total: Fils;
}

/** مجاميع المخزن (أو كل مخازن النطاق بـnull) من SQL، مو من جمع الصفوف المحمّلة (§2.8). */
export async function loadStockValueTotals(warehouseId: string | null): Promise<StockTotals> {
  const json = obj(await call<unknown>('stock_value_totals', { p_warehouse: warehouseId }), 'stock_value_totals');
  const money = obj(json.money, 'money');
  return {
    units: arr(json.units, 'units').map((item) => {
      const row = obj(item, 'units');
      return { baseUnit: oneOf(row, 'base_unit', BASE_UNITS), available: qtyOf(row, 'available'), expired: qtyOf(row, 'expired') };
    }),
    available: filsOf(money, 'available'),
    expired: filsOf(money, 'expired'),
    total: filsOf(money, 'total'),
  };
}

export interface LotRow {
  lotId: string;
  qtyLeft: Milli;
  receivedOn: string;
  /** استلام الجذر (عمر المادّة ما يتصفّر بالتحويل، E24). */
  rootReceivedOn: string;
  ageDays: number;
  bornAt: string | null;
  ageHours: bigint | null;
  expiryOn: string | null;
  expired: boolean;
  nearExpiry: boolean;
  sourceKind: 'opening' | 'receipt' | 'transfer' | 'count_gain';
  sourceId: string;
  /** رقم المستند أو «رصيد افتتاح بتاريخ …». */
  source: string;
  supplierLotNo: string | null;
}

export interface LotItem {
  id: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  minQty: Milli | null;
  density: bigint | null;
  pieceMassKg: Milli | null;
  archived: boolean;
}

export interface ItemLots {
  item: LotItem;
  rows: readonly LotRow[];
  next: string | null;
  total: number | null;
}

const SOURCE_KINDS = ['opening', 'receipt', 'transfer', 'count_gain'] as const;

export function parseItemLots(value: unknown): ItemLots {
  const json = obj(value, 'item_lots_qty');
  const i = obj(json.item, 'item');
  const next = json.next === null || json.next === undefined ? null : str(obj(json.next, 'next'), 'id');
  return {
    item: {
      id: str(i, 'id'),
      name: str(i, 'name'),
      kind: oneOf(i, 'kind', ITEM_KINDS),
      baseUnit: oneOf(i, 'base_unit', BASE_UNITS),
      tracksExpiry: bool(i, 'tracks_expiry'),
      minQty: scaled(i, 'min_qty', 3),
      density: scaled(i, 'density', 4),
      pieceMassKg: scaled(i, 'piece_mass_kg', 3),
      archived: bool(i, 'archived'),
    },
    rows: arr(json.rows, 'rows').map((item) => {
      const row = obj(item, 'rows');
      const ageDays = count(row, 'age_days');
      if (ageDays === null) throw new RowShapeError('age_days');
      return {
        lotId: str(row, 'lot_id'),
        qtyLeft: qtyOf(row, 'qty_left'),
        receivedOn: str(row, 'received_on'),
        rootReceivedOn: str(row, 'root_received_on'),
        ageDays,
        bornAt: optStr(row, 'born_at'),
        ageHours: wholeText(row, 'age_hours'),
        expiryOn: optStr(row, 'expiry_on'),
        expired: row.expired === true,
        nearExpiry: row.near_expiry === true,
        sourceKind: oneOf(row, 'source_kind', SOURCE_KINDS),
        sourceId: str(row, 'source_id'),
        source: str(row, 'source'),
        supplierLotNo: optStr(row, 'supplier_lot_no'),
      };
    }),
    next,
    total: count(json, 'total'),
  };
}

export async function loadItemLots(itemId: string, warehouseId: string, after: string | null = null): Promise<ItemLots> {
  const cursor = after ? { id: after } : null;
  return parseItemLots(await call<unknown>('item_lots_qty', { p_item: itemId, p_warehouse: warehouseId, p_after: cursor, p_limit: STOCK_PAGE }));
}

/** قيمة متبقّي كل دفعة (أدوار الكلفة)، بنفس ترتيب الدفعات ومؤشّرها؛ كلفة الوحدة للعرض من unitCost4 (القاعدة 9). */
export async function loadItemLotValues(itemId: string, warehouseId: string, after: string | null = null): Promise<Map<string, { qtyLeft: Milli; valueLeft: Fils }>> {
  const cursor = after ? { id: after } : null;
  const json = obj(await call<unknown>('item_lots_value', { p_item: itemId, p_warehouse: warehouseId, p_after: cursor, p_limit: STOCK_PAGE }), 'item_lots_value');
  return new Map(
    arr(json.rows, 'rows').map((item) => {
      const row = obj(item, 'rows');
      return [str(row, 'lot_id'), { qtyLeft: qtyOf(row, 'qty_left'), valueLeft: filsOf(row, 'value_left') }];
    }),
  );
}

export interface MoveRow {
  moveId: string;
  seq: bigint;
  movedOn: string;
  docKind: string;
  docId: string;
  doc: string;
  qty: Milli;
  running: Milli;
  lotId: string;
  reversesMoveId: string | null;
  reversed: boolean;
}

export interface ItemMoves {
  rows: readonly MoveRow[];
  next: bigint | null;
  total: number | null;
}

export function parseItemMoves(value: unknown): ItemMoves {
  const json = obj(value, 'item_moves_qty');
  return {
    rows: arr(json.rows, 'rows').map((item) => {
      const row = obj(item, 'rows');
      const seq = wholeText(row, 'seq');
      if (seq === null) throw new RowShapeError('seq');
      return {
        moveId: str(row, 'move_id'),
        seq,
        movedOn: str(row, 'moved_on'),
        docKind: str(row, 'doc_kind'),
        docId: str(row, 'doc_id'),
        doc: str(row, 'doc'),
        qty: qtyOf(row, 'qty'),
        running: qtyOf(row, 'running'),
        lotId: str(row, 'lot_id'),
        reversesMoveId: optStr(row, 'reverses_move_id'),
        reversed: bool(row, 'reversed'),
      };
    }),
    next: wholeText(json, 'next'),
    total: count(json, 'total'),
  };
}

export async function loadItemMoves(itemId: string, warehouseId: string, afterSeq: bigint | null = null): Promise<ItemMoves> {
  return parseItemMoves(await call<unknown>('item_moves_qty', { p_item: itemId, p_warehouse: warehouseId, p_after_seq: afterSeq === null ? null : afterSeq.toString(), p_limit: STOCK_PAGE }));
}

// ─── المسوّدات ───────────────────────────────────────────────────────────────────────────────────────────────

export interface StockDoc {
  id: string;
  kind: StockDocKind;
  status: DocStatus;
  version: number;
  docNo: string | null;
  /** الافتتاح: مخزنه؛ التحويل: المرسِل. */
  warehouseId: string;
  /** التحويل: المستلم. */
  toWarehouseId: string | null;
  onDate: string;
  note: string | null;
  posted: boolean;
  voidReason: string | null;
  /** لحظة إنشاء الرأس (مؤشّر صفحات القائمة). */
  createdAt: string;
}

const OPENING_COLUMNS = 'id, warehouse_id, on_date, status, version, note, posted_at, void_reason, created_at';
const TRANSFER_COLUMNS = 'id, doc_no, from_warehouse_id, to_warehouse_id, moved_on, status, version, note, posted_at, void_reason, created_at';

function stockDoc(kind: StockDocKind, row: Row): StockDoc {
  const version = row.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new RowShapeError('version');
  return {
    id: str(row, 'id'),
    kind,
    status: oneOf(row, 'status', DOC_STATUSES),
    version,
    docNo: kind === 'transfer' ? optStr(row, 'doc_no') : null,
    warehouseId: str(row, kind === 'opening' ? 'warehouse_id' : 'from_warehouse_id'),
    toWarehouseId: kind === 'transfer' ? str(row, 'to_warehouse_id') : null,
    onDate: str(row, kind === 'opening' ? 'on_date' : 'moved_on'),
    note: optStr(row, 'note'),
    posted: row.posted_at !== null && row.posted_at !== undefined,
    voidReason: optStr(row, 'void_reason'),
    createdAt: str(row, 'created_at'),
  };
}

export const DOCS_PAGE = 100;

/** مؤشّر صفحات المستندات: الحالة ثم لحظة الإنشاء (الأحدث أوّلاً) ثم المعرّف، كما وصلت بآخر صفّ. */
export interface DocCursor {
  status: DocStatus;
  createdAt: string;
  id: string;
}

export interface DocPage {
  rows: StockDoc[];
  next: DocCursor | null;
  /** العدد الكلّي بأوّل صفحة («N من المجموع»)؛ null بالصفحات بعدها. */
  total: number | null;
}

/** قراءة أجوبة بصفوفها (كل جواب يرمي خطأه مصنّفاً). */
async function readAll<R extends readonly (Answer & { data: unknown })[]>(make: (db: SupabaseClient) => PromiseLike<R>): Promise<(index: number) => Row[]> {
  const { result, wasOnline } = await send(make, (answers) => answers);
  return rowsOf(result, wasOnline);
}

/**
 * المستندات بصفحات (keyset، FOUNDATION ١٩٨): المسوّدات أوّلاً ثم المرحَّلة ثم الملغاة، والأحدث أوّلاً بكل حالة؛ والعدد الكلّي بأوّل صفحة.
 * كانت تقف عند 100 بلا «المزيد»، فالملغى والقديم يختفي (مراجعة WP4 الثانية). الرؤوس بلا قيم.
 */
export async function listStockDocs(kind: StockDocKind, after: DocCursor | null = null): Promise<DocPage> {
  const table = kind === 'opening' ? 'opening_docs' : 'transfers';
  const columns = kind === 'opening' ? OPENING_COLUMNS : TRANSFER_COLUMNS;
  const { result, wasOnline } = await send(
    (db) => {
      let page = db.from(table).select(columns);
      if (after) {
        const at = quoted(after.createdAt);
        page = page.or(`status.gt.${after.status},and(status.eq.${after.status},created_at.lt.${at}),and(status.eq.${after.status},created_at.eq.${at},id.lt.${after.id})`);
      }
      const rows = page.order('status').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(DOCS_PAGE);
      return Promise.all([rows, after ? null : db.from(table).select('id', { count: 'exact', head: true })]);
    },
    ([rows, count]) => (count ? [rows, count] : [rows]),
  );
  const [rows, count] = result;
  for (const answer of count ? [rows, count] : [rows]) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  // جدول الطرفين بمتغيّر: محلّل الأعمدة النوعي ما يقرا اتّحاد نصّين، فالصفوف تنقرا من unknown (stockDoc يفحص شكلها).
  const docs = ((rows.data ?? []) as unknown as Row[]).map((row) => stockDoc(kind, row));
  const last = docs.at(-1);
  return {
    rows: docs,
    total: count ? (count.count ?? 0) : null,
    next: docs.length === DOCS_PAGE && last ? { status: last.status, createdAt: last.createdAt, id: last.id } : null,
  };
}

export interface OpeningLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  qty: Milli;
  value: Fils | null;
  zeroReason: string | null;
  expiryOn: string | null;
  bornAt: string | null;
}

export interface TransferLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  itemUnitId: string | null;
  unitCode: string | null;
  unitLabel: string;
  qtyInUnit: Milli;
  qty: Milli;
}

// اسم المادّة ووحدتها بالتضمين من مفتاحها الأجنبي (المادّة بلا قيم).
const OPENING_LINE_COLUMNS = 'id, line_no, item_id, qty_base::text, value::text, zero_reason, expiry_on, born_at, item:items(name, base_unit)';
const TRANSFER_LINE_COLUMNS = 'id, line_no, item_id, item_unit_id, unit_code, unit_label, qty_in_unit::text, qty_base::text, item:items(name, base_unit)';

const lineItem = (row: Row): { itemName: string; baseUnit: BaseUnit } => {
  const item = obj(row.item, 'item');
  return { itemName: str(item, 'name'), baseUnit: oneOf(item, 'base_unit', BASE_UNITS) };
};

const lineNo = (row: Row): number => {
  const value = row.line_no;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new RowShapeError('line_no');
  return value;
};
const openingLine = (row: Row): OpeningLine => ({
  id: str(row, 'id'),
  lineNo: lineNo(row),
  itemId: str(row, 'item_id'),
  ...lineItem(row),
  qty: qtyOf(row, 'qty_base'),
  value: scaled(row, 'value', 2),
  zeroReason: optStr(row, 'zero_reason'),
  expiryOn: optStr(row, 'expiry_on'),
  bornAt: optStr(row, 'born_at'),
});
const transferLine = (row: Row): TransferLine => ({
  id: str(row, 'id'),
  lineNo: lineNo(row),
  itemId: str(row, 'item_id'),
  ...lineItem(row),
  itemUnitId: optStr(row, 'item_unit_id'),
  unitCode: optStr(row, 'unit_code'),
  unitLabel: str(row, 'unit_label'),
  qtyInUnit: qtyOf(row, 'qty_in_unit'),
  qty: qtyOf(row, 'qty_base'),
});

/** المستند وسطوره (سطور الافتتاح لأدوار الكلفة؛ قيمها بالسطر). */
export async function loadStockDoc(kind: StockDocKind, id: string): Promise<{ doc: StockDoc; openingLines: OpeningLine[]; transferLines: TransferLine[] }> {
  const list =
    kind === 'opening'
      ? await readAll((db) =>
          Promise.all([
            db.from('opening_docs').select(OPENING_COLUMNS).eq('id', id),
            db.from('opening_lines').select(OPENING_LINE_COLUMNS).eq('doc_id', id).order('line_no') /* unbounded: سطور مستند واحد */,
          ]),
        )
      : await readAll((db) => Promise.all([db.from('transfers').select(TRANSFER_COLUMNS).eq('id', id), db.from('transfer_lines').select(TRANSFER_LINE_COLUMNS).eq('doc_id', id).order('line_no')]));
  const [head] = list(0);
  if (!head) throw new ZeroRowsError();
  return {
    doc: stockDoc(kind, head),
    openingLines: kind === 'opening' ? list(1).map(openingLine) : [],
    transferLines: kind === 'transfer' ? list(1).map(transferLine) : [],
  };
}

/** id يولد بالجهاز (مراجعة WP8): الإعادة بعد جواب ضاع بنفس المعرّف ترجع 23505 بدل رأس ثاني (isDuplicate). */
export function createOpeningDraft(warehouseId: string, onDate: string, id?: string): Promise<StockDoc> {
  return written(async (db) => updatedRows(withStatus(await db.from('opening_docs').insert({ ...(id ? { id } : {}), warehouse_id: warehouseId, on_date: onDate }).select(OPENING_COLUMNS)))).then((row) =>
    stockDoc('opening', row),
  );
}

/**
 * مسوّدة تحويل بملاحظتها بكتابة وحدة (رفّ الجهاز يرفع الرأس بملاحظته مرّة وحدة). id اختياري يولد بالجهاز (FOUNDATION ١٩٩):
 * الإعادة بعد جواب ضاع بنفس المعرّف ترجع 23505 بدل رأس ثاني (isDuplicate).
 */
export function createTransferDraft(fromId: string, toId: string, movedOn: string, note: string | null = null, id?: string): Promise<StockDoc> {
  const trimmed = note?.trim() || null;
  return written(async (db) =>
    updatedRows(withStatus(await db.from('transfers').insert({ ...(id ? { id } : {}), from_warehouse_id: fromId, to_warehouse_id: toId, moved_on: movedOn, note: trimmed }).select(TRANSFER_COLUMNS))),
  ).then((row) => stockDoc('transfer', row));
}

/** الإدراج بمعرّف موجود (23505): الإعادة بنفس معرّف الجهاز بعد ما انكتب أوّل مرّة. */
export function isDuplicate(error: unknown): boolean {
  return error instanceof RejectedError && error.code === '23505';
}

export interface DraftHeaderPatch {
  day?: string;
  note?: string | null;
}

/** تاريخ المسوّدة أو ملاحظتها بشرط النسخة (الحقول المتغيّرة بس). */
export function updateStockDraft(doc: Pick<StockDoc, 'id' | 'kind' | 'version'>, patch: DraftHeaderPatch): Promise<StockDoc> {
  const note = patch.note === undefined ? {} : { note: patch.note?.trim() || null };
  return doc.kind === 'opening'
    ? written(async (db) => updatedRows(withStatus(await db.from('opening_docs').update({ ...note, ...(patch.day ? { on_date: patch.day } : {}) }).eq('id', doc.id).eq('version', doc.version).select(OPENING_COLUMNS)))).then((row) =>
        stockDoc('opening', row),
      )
    : written(async (db) => updatedRows(withStatus(await db.from('transfers').update({ ...note, ...(patch.day ? { moved_on: patch.day } : {}) }).eq('id', doc.id).eq('version', doc.version).select(TRANSFER_COLUMNS)))).then((row) =>
        stockDoc('transfer', row),
      );
}

/** حقول سطر الافتتاح كما تنكتب: الكمية بوحدة الأساس والقيمة نصّان عشريّان (E3). */
export interface OpeningLineFields {
  item_id: string;
  qty_base: string;
  value: string | null;
  zero_reason: string | null;
  expiry_on: string | null;
  born_at: string | null;
}

/** id يولد بالجهاز (مراجعة WP8): الإعادة بنفس المعرّف 23505 = السطر انكتب، فالشاشة تعدّله بنفس القيم بدل سطر ثاني. */
export function addOpeningLine(docId: string, fields: OpeningLineFields, id?: string): Promise<OpeningLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('opening_lines').insert({ ...(id ? { id } : {}), ...fields, doc_id: docId }).select(OPENING_LINE_COLUMNS)))).then(openingLine);
}

export function updateOpeningLine(lineId: string, patch: Partial<OpeningLineFields>): Promise<OpeningLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('opening_lines').update(patch).eq('id', lineId).select(OPENING_LINE_COLUMNS)))).then(openingLine);
}

/** سطر التحويل: الوحدة (وحدة المادّة أو رمز قياس أو الأساس) والكمية بها؛ اللقطة يكتبها الخادم (E7). */
export interface TransferLineFields {
  item_id: string;
  item_unit_id: string | null;
  unit_code: string | null;
  qty_in_unit: string;
}

/** سطر التحويل؛ id اختياري يولد بالجهاز (رفّ الجهاز)، والإعادة بنفسه 23505 مو سطر ثاني. */
export function addTransferLine(docId: string, fields: TransferLineFields, id?: string): Promise<TransferLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('transfer_lines').insert({ ...(id ? { id } : {}), ...fields, doc_id: docId }).select(TRANSFER_LINE_COLUMNS)))).then(transferLine);
}

export function updateTransferLine(lineId: string, patch: Partial<TransferLineFields>): Promise<TransferLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('transfer_lines').update(patch).eq('id', lineId).select(TRANSFER_LINE_COLUMNS)))).then(transferLine);
}

/** أنواع المسوّدات بدالّتي الطيّ وحذف السطر: الافتتاح والتحويل (0007) والصرف والجرد (0008) والاستلام (0009) ومرتجع المورّد (0010). */
export type DraftKind = StockDocKind | 'stock_use' | 'count' | 'receipt' | 'supplier_return';

/** حذف سطر مسوّدة (E52) بشرط النسخة؛ سطر انحذف من قبل يرجّع deleted: false. */
export async function deleteDraftLine(kind: DraftKind, lineId: string, expectedVersion: number): Promise<{ deleted: boolean; version: number | null }> {
  const json = obj(await call<unknown>('delete_draft_line', { p_doc_kind: kind, p_line_id: lineId, p_expected_version: expectedVersion }), 'delete_draft_line');
  return { deleted: bool(json, 'deleted'), version: count(json, 'version') };
}

/** طيّ المسوّدة (E13): void بلا رقم ولا حركات. */
export async function discardDraft(kind: DraftKind, id: string, expectedVersion: number): Promise<void> {
  await call<unknown>('discard_draft', { p_doc_kind: kind, p_id: id, p_expected_version: expectedVersion });
}

// ─── المعاينة والترحيل والإلغاء ──────────────────────────────────────────────────────────────────────────────────

export interface Problem {
  code: string;
  hint: string;
}

const problem = (value: unknown): Problem | null => {
  if (value === null || value === undefined) return null;
  const row = obj(value, 'problem');
  return { code: str(row, 'code'), hint: str(row, 'hint') };
};

export interface OpeningPreviewLine {
  lineId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  qty: Milli;
  expiryOn: string | null;
  bornAt: string | null;
  problem: Problem | null;
  /** null لدور بلا كلفة (الخادم يخفيها). */
  value: Fils | null;
}

export interface OpeningPreview {
  version: number;
  problems: readonly Problem[];
  lines: readonly OpeningPreviewLine[];
  ready: boolean;
  total: Fils | null;
}

const moneyOf = (row: Row): Row | null => (row.money === undefined ? null : obj(row.money, 'money'));

export function parseOpeningPreview(value: unknown): OpeningPreview {
  const json = obj(value, 'preview_opening_stock');
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  const total = moneyOf(json);
  return {
    version,
    problems: arr(json.problems, 'problems').map((item) => problem(item)).filter((item): item is Problem => item !== null),
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      const money = moneyOf(row);
      const number = count(row, 'line_no');
      return {
        lineId: str(row, 'line_id'),
        lineNo: number ?? 0,
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        qty: qtyOf(row, 'qty'),
        expiryOn: optStr(row, 'expiry_on'),
        bornAt: optStr(row, 'born_at'),
        problem: problem(row.problem),
        value: money ? scaled(money, 'value', 2) : null,
      };
    }),
    ready: bool(json, 'ready'),
    total: total ? filsOf(total, 'total') : null,
  };
}

export async function previewOpening(id: string): Promise<OpeningPreview> {
  return parseOpeningPreview(await call<unknown>('preview_opening_stock', { p_id: id }));
}

export interface TransferDraw {
  lotId: string;
  qty: Milli;
  receivedOn: string;
  expiryOn: string | null;
  source: string;
  value: Fils | null;
}

export interface TransferPreviewLine {
  lineId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  qty: Milli;
  qtyInUnit: Milli;
  unitLabel: string;
  available: Milli;
  expired: Milli;
  later: Milli;
  shortage: Milli;
  /** السطر يسحب الرصيد المتاح كلّه (E31): تأكيد يسمّي المادّة والكمية، وصوت لمّا يصير صفراً. */
  wholeBalance: boolean;
  problem: Problem | null;
  draws: readonly TransferDraw[];
  value: Fils | null;
}

export interface TransferPreview {
  version: number;
  /** بصمة القطع اللي شافها المستخدم (FOUNDATION ٥٢٠ البند 5): الترحيل يرسلها، والمخزون اللي تغيّر بعدها يرجع stale_preview. */
  plan: string;
  internalExport: boolean;
  toDivisionKind: DivisionKind;
  problems: readonly Problem[];
  lines: readonly TransferPreviewLine[];
  ready: boolean;
}

export function parseTransferPreview(value: unknown): TransferPreview {
  const json = obj(value, 'preview_transfer');
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  return {
    version,
    plan: str(json, 'plan'),
    internalExport: bool(json, 'internal_export'),
    toDivisionKind: oneOf(json, 'to_division_kind', DIVISION_ORDER),
    problems: arr(json.problems, 'problems').map((item) => problem(item)).filter((item): item is Problem => item !== null),
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      const money = moneyOf(row);
      return {
        lineId: str(row, 'line_id'),
        lineNo: count(row, 'line_no') ?? 0,
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        qty: qtyOf(row, 'qty'),
        qtyInUnit: qtyOf(row, 'qty_in_unit'),
        unitLabel: str(row, 'unit_label'),
        available: qtyOf(row, 'available'),
        expired: qtyOf(row, 'expired'),
        later: qtyOf(row, 'later'),
        shortage: qtyOf(row, 'shortage'),
        wholeBalance: bool(row, 'whole_balance'),
        problem: problem(row.problem),
        draws: arr(row.draws, 'draws').map((entry) => {
          const draw = obj(entry, 'draws');
          const drawMoney = moneyOf(draw);
          return {
            lotId: str(draw, 'lot_id'),
            qty: qtyOf(draw, 'qty'),
            receivedOn: str(draw, 'received_on'),
            expiryOn: optStr(draw, 'expiry_on'),
            source: str(draw, 'source'),
            value: drawMoney ? scaled(drawMoney, 'value', 2) : null,
          };
        }),
        value: money ? scaled(money, 'value', 2) : null,
      };
    }),
    ready: bool(json, 'ready'),
  };
}

export async function previewTransfer(id: string): Promise<TransferPreview> {
  return parseTransferPreview(await call<unknown>('preview_transfer', { p_id: id }));
}

/** مرجع العملية مولود بالجهاز مرّة، ويبقى نفسه لحد ما تنعرف النتيجة (FOUNDATION ٥١٩). */
export interface StockRef {
  clientRef: string;
}

export function newStockRef(): StockRef {
  return { clientRef: crypto.randomUUID() };
}

export interface PostedStockDoc {
  id: string;
  kind: StockDocKind;
  status: DocStatus;
  docNo: string | null;
}

function postedDoc(value: unknown): PostedStockDoc {
  const json = obj(value, 'posted');
  return { id: str(json, 'id'), kind: oneOf(json, 'kind', ['opening', 'transfer'] as const), status: oneOf(json, 'status', DOC_STATUSES), docNo: optStr(json, 'doc_no') };
}

export async function postOpening(ref: StockRef, id: string, expectedVersion: number): Promise<PostedStockDoc> {
  return postedDoc(await call<unknown>('post_opening_stock', { p_id: id, p_expected_version: expectedVersion, p_client_ref: ref.clientRef }));
}

/** الترحيل بنسخة المسوّدة وبصمة المعاينة اللي انوافق عليها؛ تغيّر المخزون بعد المعاينة يرجع stale_preview (RejectedError). */
export async function postTransferDoc(ref: StockRef, id: string, expectedVersion: number, plan: string): Promise<PostedStockDoc> {
  return postedDoc(await call<unknown>('post_transfer', { p_id: id, p_expected_version: expectedVersion, p_expected_plan: plan, p_client_ref: ref.clientRef }));
}

export async function voidOpening(ref: StockRef, id: string, reason: string): Promise<PostedStockDoc> {
  return postedDoc(await call<unknown>('void_opening_stock', { p_id: id, p_reason: reason, p_client_ref: ref.clientRef }));
}

export async function voidTransferDoc(ref: StockRef, id: string, reason: string): Promise<PostedStockDoc> {
  return postedDoc(await call<unknown>('void_transfer', { p_id: id, p_reason: reason, p_client_ref: ref.clientRef }));
}

// مشتركة لملفّي المخزون الكسولين uses.ts وcounts.ts (WP5، نفس حزمة الشاشات): قراءة الشكل، والكتابة المباشرة بـupdatedRows، والقراءة.
export { arr, bool, count, filsOf, moneyOf, obj, oneOf, optStr, problem, qtyOf, readAll, scaled, str, withStatus, written };
