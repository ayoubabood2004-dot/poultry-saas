import type { SupabaseClient } from '@supabase/supabase-js';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { DivisionKind } from '../../domain/divisions';
import { normalizeCode, searchable } from '../../domain/normalize';
import { BASE_UNITS, DIVISION_ORDER, ITEM_KINDS, SITE_KINDS, WAREHOUSE_KINDS, type ItemKind, type SiteKind, type WarehouseKind } from '../../domain/stores';
import type { BaseUnit, Dimension } from '../../domain/units';
import { ZeroRowsError } from '../errors';
import type { Answer, PostgrestFailure } from './core';
import { call, classifyPostgrest, send, updatedRows } from './core';
import './constraints-stores';

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

/** كل إعداد المنشأة لشاشة «إعدادات المنشأة»: الوحدات ويوم تشغيلها، والمواقع والمخازن، والأحجام والتصنيفات. */
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
      ]),
    (answers) => answers,
  );
  const list = rowsOf(result, wasOnline);
  return {
    divisions: list(0).map((row) => ({
      id: str(row, 'id'),
      kind: oneOf(row, 'kind', DIVISION_ORDER),
      goLiveOn: optStr(row, 'go_live_on'),
      frozen: row.first_posted_at !== null && row.first_posted_at !== undefined,
    })),
    sites: list(1).map(site),
    warehouses: list(2).map(warehouse),
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
  if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
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
