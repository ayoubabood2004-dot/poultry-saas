import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { Fils } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { RejectedError, ZeroRowsError } from '../errors';
import './constraints-mill';
import { authed, call, classifyPostgrest, explained, send, updatedRows, type PostgrestFailure } from './core';

// معمل العلف (الهجرة 0015_mill_recipes_production، كلمة المالك 2026-11-03): الخلطة ونسخها وسطورها كتابة مباشرة
// (recipe.activate)، والتفعيل والإنتاج دوالّ (activate_recipe_version وcreate_production وpreview_production
// وpost_production وvoid_production)، والقراءة من أربعة قرّاء. ملف كسول تستورده شاشات المعمل مباشرةً
// (write-guard PAGE_MODULES)، والمال كلّه داخل money (private.mask يشيله عن غير أدوار الكلفة) فيقرأ null.

export class MillShapeError extends Error {
  constructor(readonly field: string) {
    super(`mill_shape:${field}`);
    this.name = 'MillShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new MillShapeError(field);
  return value as Row;
};
const optRecord = (value: unknown, field: string): Row | null => (value === null || value === undefined ? null : record(value, field));
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new MillShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new MillShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new MillShapeError(field);
  return value;
};
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new MillShapeError(field);
  return row[field] as boolean;
};
/** نصّ عشري بمراتبه ← عدد صحيح بمقياسه (الكمية 3، والمال 2، والكثافة 4). الغائب null، والمكسور يرمي. */
const scaled = (row: Row, field: string, scale: number): bigint | null => {
  const text = row[field];
  if (text === null || text === undefined) return null;
  if (typeof text !== 'string') throw new MillShapeError(field);
  const value = parseDecimal(text, scale);
  if (!value) throw new MillShapeError(field);
  return toScale(value, scale);
};
const qty = (row: Row, field: string): bigint => scaled(row, field, 3) ?? 0n;
/** المال داخل money: غائب كلّه لغير أدوار الكلفة (private.mask)، فالشاشة تعرض «—» ولا تكسر. */
const money = (row: Row, key: string): Fils | null => {
  const box = optRecord(row.money, 'money');
  return box ? scaled(box, key, 2) : null;
};
const baseUnit = (row: Row, key: string): BaseUnit => {
  const value = str(row, key);
  if (value !== 'kg' && value !== 'L' && value !== 'pc') throw new MillShapeError(key);
  return value;
};

export type RecipeUnit = 'kg' | 'L';
export type VersionStatus = 'draft' | 'active' | 'retired';
export type BatchStatus = 'draft' | 'posted' | 'void';

export interface OutputItem {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  kind: string;
  tracksExpiry: boolean;
}

export interface RecipeVersionHead {
  id: string;
  versionNo: number;
  basisKg: bigint;
  lines: number;
  version: number;
}

export interface LastBatch {
  id: string;
  docNo: string | null;
  producedOn: Day;
  outputQtyKg: bigint;
  totalValue: Fils | null;
  costPerKg: Fils | null;
}

export interface RecipePiece {
  key: string;
  label: string;
  weight: bigint;
}

export interface RecipeCard {
  id: string;
  name: string;
  note: string | null;
  archived: boolean;
  version: number;
  outputItem: { id: string; name: string; baseUnit: BaseUnit; kind: string };
  activeId: string | null;
  activeVersionNo: number | null;
  activeBasisKg: bigint | null;
  activeLines: number;
  draft: RecipeVersionHead | null;
  batches: number;
  lastBatch: LastBatch | null;
  lastCostPerKg: Fils | null;
  /** مواد النسخة المفعَّلة بكتلتها بالكيلو من الأكبر: شريط التركيبة ورقاقاته. */
  pieces: RecipePiece[];
  /** ما لا يظهر في الرقاقات الأربع الأولى. */
  moreLines: number;
}

const CHIPS = 4;

const versionHead = (row: Row): RecipeVersionHead => ({
  id: str(row, 'id'),
  versionNo: int(row, 'version_no'),
  basisKg: qty(row, 'basis_kg'),
  lines: int(row, 'lines'),
  version: typeof row.version === 'number' ? int(row, 'version') : 0,
});

const lastBatch = (value: unknown): LastBatch | null => {
  const row = optRecord(value, 'last_batch');
  if (!row) return null;
  return {
    id: str(row, 'id'),
    docNo: optStr(row, 'doc_no'),
    producedOn: str(row, 'produced_on'),
    outputQtyKg: qty(row, 'output_qty_kg'),
    totalValue: money(row, 'total_value'),
    costPerKg: money(row, 'cost_per_kg'),
  };
};

/** بطاقات الخلطات من جواب recipes_overview (الكائن نفسه يحمل مخازن المعمل ومواد العلف: طلب واحد للشاشة). */
export function parseRecipes(value: unknown): RecipeCard[] {
  const json = record(value, 'overview');
  return list(json.recipes, 'recipes').map((row) => {
    const active = optRecord(row.active, 'active');
    const last = lastBatch(row.last_batch);
    const item = record(row.output_item, 'output_item');
    const pieces = active
      ? list(active.pieces, 'pieces').map((piece) => ({ key: str(piece, 'item_id'), label: str(piece, 'item_name'), weight: qty(piece, 'mass_kg') }))
      : [];
    return {
      id: str(row, 'id'),
      name: str(row, 'name'),
      note: optStr(row, 'note'),
      archived: flag(row, 'archived'),
      version: int(row, 'version'),
      outputItem: { id: str(item, 'id'), name: str(item, 'name'), baseUnit: baseUnit(item, 'base_unit'), kind: str(item, 'kind') },
      activeId: active ? str(active, 'id') : null,
      activeVersionNo: active ? int(active, 'version_no') : null,
      activeBasisKg: active ? qty(active, 'basis_kg') : null,
      activeLines: active ? int(active, 'lines') : 0,
      draft: row.draft === null || row.draft === undefined ? null : versionHead(record(row.draft, 'draft')),
      batches: int(row, 'batches'),
      lastBatch: last,
      lastCostPerKg: last?.costPerKg ?? null,
      pieces,
      moreLines: Math.max(0, pieces.length - CHIPS),
    };
  });
}

export interface RecipeLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  kind: string;
  baseUnit: BaseUnit;
  categoryId: string | null;
  categoryName: string | null;
  qty: bigint;
  unit: RecipeUnit;
  massKg: bigint;
  sharePct: bigint;
  unitCost: Fils | null;
}

export interface RecipeVersionRow {
  id: string;
  versionNo: number;
  status: VersionStatus;
  basisKg: bigint;
  activatedAt: string | null;
  version: number;
}

export interface PickItem {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  categoryName: string | null;
}

export interface RecipeDetail {
  id: string;
  name: string;
  note: string | null;
  archived: boolean;
  version: number;
  outputItem: OutputItem;
  versions: RecipeVersionRow[];
  versionId: string | null;
  versionNo: number | null;
  status: VersionStatus | null;
  basisKg: bigint;
  versionVersion: number;
  lines: RecipeLine[];
  massKg: bigint;
  /** مواد مرشَّحة لسطر جديد: فعّالة، يستلمها مخزن المواد الأوّلية، وتُقاس بالكيلو أو اللتر. */
  pickItems: PickItem[];
}

const versionStatus = (row: Row): VersionStatus => {
  const value = str(row, 'status');
  if (value !== 'draft' && value !== 'active' && value !== 'retired') throw new MillShapeError('status');
  return value;
};

export function parseRecipe(value: unknown): RecipeDetail {
  const json = record(value, 'recipe');
  const item = record(json.output_item, 'output_item');
  const version = optRecord(json.selected, 'selected');
  return {
    id: str(json, 'id'),
    name: str(json, 'name'),
    note: optStr(json, 'note'),
    archived: flag(json, 'archived'),
    version: int(json, 'version'),
    outputItem: {
      id: str(item, 'id'),
      name: str(item, 'name'),
      baseUnit: baseUnit(item, 'base_unit'),
      kind: str(item, 'kind'),
      tracksExpiry: flag(item, 'tracks_expiry'),
    },
    versions: list(json.versions, 'versions').map((row) => ({
      id: str(row, 'id'),
      versionNo: int(row, 'version_no'),
      status: versionStatus(row),
      basisKg: qty(row, 'basis_kg'),
      activatedAt: optStr(row, 'activated_at'),
      version: int(row, 'version'),
    })),
    versionId: version ? str(version, 'id') : null,
    versionNo: version ? int(version, 'version_no') : null,
    status: version ? versionStatus(version) : null,
    basisKg: version ? qty(version, 'basis_kg') : 0n,
    versionVersion: version ? int(version, 'version') : 0,
    lines: list(json.lines, 'lines').map((row) => ({
      id: str(row, 'id'),
      lineNo: int(row, 'line_no'),
      itemId: str(row, 'item_id'),
      itemName: str(row, 'item_name'),
      kind: str(row, 'kind'),
      baseUnit: baseUnit(row, 'base_unit'),
      categoryId: optStr(row, 'category_id'),
      categoryName: optStr(row, 'category_name'),
      qty: qty(row, 'qty'),
      unit: str(row, 'unit') === 'L' ? 'L' : 'kg',
      massKg: qty(row, 'mass_kg'),
      sharePct: scaled(row, 'share_pct', 2) ?? 0n,
      unitCost: money(row, 'unit_cost'),
    })),
    massKg: qty(json, 'mass_kg'),
    pickItems: list(json.pick_items, 'pick_items').map((row) => ({
      id: str(row, 'id'),
      name: str(row, 'name'),
      baseUnit: baseUnit(row, 'base_unit'),
      categoryName: optStr(row, 'category_name'),
    })),
  };
}

export interface PreviewLine {
  inputId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  plannedQty: bigint;
  actualQty: bigint | null;
  drawQty: bigint;
  inBasis: boolean;
  value: Fils | null;
}

export interface MillProblem {
  code: string;
  itemName: string | null;
  need: bigint | null;
  have: bigint | null;
}

export interface ProductionPreview {
  id: string;
  status: BatchStatus;
  version: number;
  producedOn: Day;
  plannedKg: bigint;
  inputMassKg: bigint;
  outputQtyKg: bigint;
  outputExpiryOn: Day | null;
  shrinkKg: bigint;
  shrinkReason: string | null;
  shrinkOk: boolean;
  costsConfirmed: boolean;
  inputWarehouse: { id: string; name: string };
  outputWarehouse: { id: string; name: string };
  lines: PreviewLine[];
  problems: MillProblem[];
  canPost: boolean;
  planToken: string;
  inputValue: Fils | null;
  totalValue: Fils | null;
  costPerKg: Fils | null;
}

const batchStatus = (row: Row): BatchStatus => {
  const value = str(row, 'status');
  if (value !== 'draft' && value !== 'posted' && value !== 'void') throw new MillShapeError('status');
  return value;
};

const warehouse = (value: unknown, field_: string): { id: string; name: string } => {
  const row = record(value, field_);
  return { id: str(row, 'id'), name: str(row, 'name') };
};

export function parsePreview(value: unknown): ProductionPreview {
  const json = record(value, 'preview');
  return {
    id: str(json, 'id'),
    status: batchStatus(json),
    version: int(json, 'version'),
    producedOn: str(json, 'produced_on'),
    plannedKg: qty(json, 'planned_kg'),
    inputMassKg: qty(json, 'input_mass_kg'),
    outputQtyKg: qty(json, 'output_qty_kg'),
    outputExpiryOn: optStr(json, 'output_expiry_on'),
    shrinkKg: qty(json, 'shrink_kg'),
    shrinkReason: optStr(json, 'shrink_reason'),
    shrinkOk: flag(json, 'shrink_ok'),
    costsConfirmed: flag(json, 'costs_confirmed'),
    inputWarehouse: warehouse(json.input_warehouse, 'input_warehouse'),
    outputWarehouse: warehouse(json.output_warehouse, 'output_warehouse'),
    lines: list(json.lines, 'lines').map((row) => ({
      inputId: str(row, 'input_id'),
      lineNo: int(row, 'line_no'),
      itemId: str(row, 'item_id'),
      itemName: str(row, 'item_name'),
      baseUnit: baseUnit(row, 'base_unit'),
      plannedQty: qty(row, 'planned_qty'),
      actualQty: scaled(row, 'actual_qty', 3),
      drawQty: qty(row, 'draw_qty'),
      inBasis: flag(row, 'in_basis'),
      value: money(row, 'value'),
    })),
    problems: list(json.problems, 'problems').map((row) => ({
      code: str(row, 'code'),
      itemName: optStr(row, 'item_name'),
      need: scaled(row, 'need', 3),
      have: scaled(row, 'have', 3),
    })),
    canPost: flag(json, 'can_post'),
    planToken: str(json, 'plan_token'),
    inputValue: money(json, 'input_value'),
    totalValue: money(json, 'total_value'),
    costPerKg: money(json, 'cost_per_kg'),
  };
}

export interface BatchLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  plannedQty: bigint;
  actualQty: bigint | null;
  usedQty: bigint | null;
  inBasis: boolean;
  value: Fils | null;
}

export interface ProductionBatch {
  id: string;
  docNo: string | null;
  status: BatchStatus;
  version: number;
  producedOn: Day;
  plannedKg: bigint;
  outputQtyKg: bigint;
  outputExpiryOn: Day | null;
  inputMassKg: bigint;
  shrinkKg: bigint;
  shrinkReason: string | null;
  note: string | null;
  voidReason: string | null;
  costsConfirmed: boolean;
  recipeId: string;
  recipeName: string;
  versionNo: number;
  basisKg: bigint;
  outputItem: { id: string; name: string; baseUnit: BaseUnit; tracksExpiry: boolean };
  inputWarehouse: { id: string; name: string };
  outputWarehouse: { id: string; name: string };
  lines: BatchLine[];
  inputValue: Fils | null;
  totalValue: Fils | null;
  costPerKg: Fils | null;
}

export function parseBatch(value: unknown): ProductionBatch {
  const json = record(value, 'batch');
  const recipe = record(json.recipe, 'recipe');
  const item = record(json.output_item, 'output_item');
  return {
    id: str(json, 'id'),
    docNo: optStr(json, 'doc_no'),
    status: batchStatus(json),
    version: int(json, 'version'),
    producedOn: str(json, 'produced_on'),
    plannedKg: qty(json, 'planned_kg'),
    outputQtyKg: qty(json, 'output_qty_kg'),
    outputExpiryOn: optStr(json, 'output_expiry_on'),
    inputMassKg: qty(json, 'input_mass_kg'),
    shrinkKg: qty(json, 'shrink_kg'),
    shrinkReason: optStr(json, 'shrink_reason'),
    note: optStr(json, 'note'),
    voidReason: optStr(json, 'void_reason'),
    costsConfirmed: flag(json, 'costs_confirmed'),
    recipeId: str(recipe, 'id'),
    recipeName: str(recipe, 'name'),
    versionNo: int(recipe, 'version_no'),
    basisKg: qty(recipe, 'basis_kg'),
    outputItem: { id: str(item, 'id'), name: str(item, 'name'), baseUnit: baseUnit(item, 'base_unit'), tracksExpiry: flag(item, 'tracks_expiry') },
    inputWarehouse: warehouse(json.input_warehouse, 'input_warehouse'),
    outputWarehouse: warehouse(json.output_warehouse, 'output_warehouse'),
    lines: list(json.lines, 'lines').map((row) => ({
      id: str(row, 'id'),
      lineNo: int(row, 'line_no'),
      itemId: str(row, 'item_id'),
      itemName: str(row, 'item_name'),
      baseUnit: baseUnit(row, 'base_unit'),
      plannedQty: qty(row, 'planned_qty'),
      actualQty: scaled(row, 'actual_qty', 3),
      usedQty: scaled(row, 'used_qty', 3),
      inBasis: flag(row, 'in_basis'),
      value: money(row, 'value'),
    })),
    inputValue: money(json, 'input_value'),
    totalValue: money(json, 'total_value'),
    costPerKg: money(json, 'cost_per_kg'),
  };
}

export interface ProductionRow {
  id: string;
  docNo: string | null;
  status: BatchStatus;
  producedOn: Day;
  recipeName: string;
  outputItemName: string;
  outputQtyKg: bigint;
  shrinkKg: bigint;
  totalValue: Fils | null;
  costPerKg: Fils | null;
}

export interface DraftRow {
  id: string;
  producedOn: Day;
  plannedKg: bigint;
  recipeName: string;
  outputItemName: string;
  inputWarehouseName: string;
  outputWarehouseName: string;
  version: number;
  costsConfirmed: boolean;
  lines: number;
}

export interface ProductionsPage {
  drafts: DraftRow[];
  rows: ProductionRow[];
  total: number | null;
}

export function parseProductions(value: unknown): ProductionsPage {
  const json = record(value, 'productions');
  return {
    drafts: list(json.drafts, 'drafts').map((row) => ({
      id: str(row, 'id'),
      producedOn: str(row, 'produced_on'),
      plannedKg: qty(row, 'planned_kg'),
      recipeName: str(row, 'recipe_name'),
      outputItemName: str(row, 'output_item_name'),
      inputWarehouseName: str(row, 'input_warehouse_name'),
      outputWarehouseName: str(row, 'output_warehouse_name'),
      version: int(row, 'version'),
      costsConfirmed: flag(row, 'costs_confirmed'),
      lines: int(row, 'lines'),
    })),
    rows: list(json.rows, 'rows').map((row) => ({
      id: str(row, 'id'),
      docNo: optStr(row, 'doc_no'),
      status: batchStatus(row),
      producedOn: str(row, 'produced_on'),
      recipeName: str(row, 'recipe_name'),
      outputItemName: str(row, 'output_item_name'),
      outputQtyKg: qty(row, 'output_qty_kg'),
      shrinkKg: qty(row, 'shrink_kg'),
      totalValue: money(row, 'total_value'),
      costPerKg: money(row, 'cost_per_kg'),
    })),
    total: typeof json.total === 'number' ? int(json, 'total') : null,
  };
}

// ─── القراءة ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface MillStore {
  id: string;
  name: string;
  kind: 'raw' | 'feed';
}

export interface MillHome {
  /** يوم الخادم (بغداد): تاريخ الدفعة الجديدة، فلا يختلف عن يوم العمل بساعة الجهاز. */
  today: string;
  recipes: RecipeCard[];
  stores: MillStore[];
  feedItems: { id: string; name: string }[];
  productions: ProductionsPage;
}

export async function loadRecipes(): Promise<RecipeCard[]> {
  return parseRecipes(await call<unknown>('recipes_overview'));
}

/** شاشة المعمل بطلبين متوازيين: الخلطات بمخازنها ومواد علفها، ودفعات الإنتاج. */
export async function loadMill(): Promise<MillHome> {
  const [overview, productions] = await Promise.all([call<unknown>('recipes_overview'), call<unknown>('productions_overview', { p_after: null, p_limit: 30 })]);
  const json = record(overview, 'overview');
  return {
    today: str(json, 'today'),
    recipes: parseRecipes(overview),
    stores: list(json.stores, 'stores').map((row) => ({ id: str(row, 'id'), name: str(row, 'name'), kind: str(row, 'kind') === 'feed' ? 'feed' : 'raw' })),
    feedItems: list(json.feed_items, 'feed_items').map((row) => ({ id: str(row, 'id'), name: str(row, 'name') })),
    productions: parseProductions(productions),
  };
}

export async function loadRecipe(recipeId: string, versionId: string | null = null): Promise<RecipeDetail> {
  return parseRecipe(await call<unknown>('recipe_detail', { p_id: recipeId, p_version: versionId }));
}

export async function loadProductions(after: Record<string, unknown> | null = null, limit = 30): Promise<ProductionsPage> {
  return parseProductions(await call<unknown>('productions_overview', { p_after: after, p_limit: limit }));
}

export async function loadBatch(batchId: string): Promise<ProductionBatch> {
  return parseBatch(await call<unknown>('production_detail', { p_id: batchId }));
}

export async function previewProduction(batchId: string): Promise<ProductionPreview> {
  return parsePreview(await call<unknown>('preview_production', { p_id: batchId }));
}

// ─── الكتابة المباشرة (الخلطة ونسخها وسطورها) ───────────────────────────────────────────────────────────────────

type Raw = { data: unknown; error: PostgrestFailure | null; status: number };
type Failed = PostgrestFailure & { status: number };

const withStatus = (answer: Raw) => ({ data: answer.data as Row | Row[] | null, error: answer.error ? { ...answer.error, status: answer.status } : null });
const failed = (error: unknown): error is Failed => typeof error === 'object' && error !== null && typeof (error as Failed).status === 'number';

/** كتابة مباشرة بـupdatedRows: صفر صفوف = تغيّرت بعد ما انفتحت الشاشة (ZeroRowsError)، وخطأ القاعدة يتصنّف. */
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

export function createRecipe(name: string, outputItemId: string, note: string | null = null): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipes').insert({ name: name.trim(), output_item_id: outputItemId, note: note?.trim() || null }).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function renameRecipe(recipeId: string, name: string, version: number): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipes').update({ name: name.trim() }).eq('id', recipeId).eq('version', version).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function archiveRecipe(recipeId: string, version: number, archived: boolean): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipes').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', recipeId).eq('version', version).select('id'))),
  ).then((row) => str(row, 'id'));
}

/** نسخة مسوّدة جديدة للخلطة (الأساس بالآلاف: 1,000 كغم ← 1000000n). */
export function createVersion(recipeId: string, basisKg: bigint): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipe_versions').insert({ recipe_id: recipeId, basis_kg: decimalText(basisKg, 3) }).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function setVersionBasis(versionId: string, basisKg: bigint, version: number): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipe_versions').update({ basis_kg: decimalText(basisKg, 3) }).eq('id', versionId).eq('version', version).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function addRecipeLine(versionId: string, itemId: string, qtyValue: bigint, unit: RecipeUnit): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipe_lines').insert({ version_id: versionId, item_id: itemId, qty: decimalText(qtyValue, 3), unit }).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function setRecipeLine(lineId: string, qtyValue: bigint, unit: RecipeUnit): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipe_lines').update({ qty: decimalText(qtyValue, 3), unit }).eq('id', lineId).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function deleteRecipeLine(lineId: string, versionVersion: number): Promise<unknown> {
  return call<unknown>('delete_draft_line', { p_doc_kind: 'recipe_line', p_line_id: lineId, p_expected_version: versionVersion });
}

/** تعديل مسوّدة الدفعة: وزن الناتج وتاريخ انتهائه وسبب الهدر والتاريخ (الخادم يزيد النسخة). */
export function setBatchFields(
  batchId: string,
  fields: { producedOn?: Day; outputQtyKg?: bigint | null; outputExpiryOn?: Day | null; shrinkReason?: string | null; note?: string | null },
): Promise<string> {
  const patch: Row = {};
  if (fields.producedOn !== undefined) patch.produced_on = fields.producedOn;
  if (fields.outputQtyKg !== undefined) patch.output_qty_kg = fields.outputQtyKg === null ? null : decimalText(fields.outputQtyKg, 3);
  if (fields.outputExpiryOn !== undefined) patch.output_expiry_on = fields.outputExpiryOn;
  if (fields.shrinkReason !== undefined) patch.shrink_reason = fields.shrinkReason?.trim() || null;
  if (fields.note !== undefined) patch.note = fields.note?.trim() || null;
  return written(async (db) => updatedRows(withStatus(await db.from('production_batches').update(patch).eq('id', batchId).select('id')))).then((row) => str(row, 'id'));
}

/** الكمية الفعلية الموزونة لمدخل (القاعدة ١٩): المرحَّل هو هذه، والفارغة تعني «كما خُطّط». */
export function setInputActual(inputId: string, actual: bigint | null): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('production_inputs').update({ actual_qty_base: actual === null ? null : decimalText(actual, 3) }).eq('id', inputId).select('id'))),
  ).then((row) => str(row, 'id'));
}

// ─── الدوالّ ──────────────────────────────────────────────────────────────────────────────────────────────────

export function activateVersion(versionId: string, version: number): Promise<unknown> {
  return call<unknown>('activate_recipe_version', { p_id: versionId, p_expected_version: version });
}

/** 23505 بمعرّف الجهاز = كُتبت فعلاً (إعادة بعد جواب ضائع)، لا دفعة ثانية. نسخة محلّية فلا تُحزَم وحدة المخازن كلّها. */
export function isDuplicate(error: unknown): boolean {
  return error instanceof RejectedError && error.code === '23505';
}

/** معرّف الدفعة من الجهاز (درس WP4): الإعادة بعد جواب ضاع تصطدم بالمفتاح ولا تُنشئ دفعة ثانية. */
export function createProduction(batchId: string, versionId: string, plannedKg: bigint, inputWarehouseId: string, outputWarehouseId: string, producedOn: Day): Promise<unknown> {
  return call<unknown>('create_production', {
    p_id: batchId,
    p_recipe_version: versionId,
    p_planned_kg: decimalText(plannedKg, 3),
    p_wh_in: inputWarehouseId,
    p_wh_out: outputWarehouseId,
    p_produced_on: producedOn,
  });
}

export function confirmCosts(batchId: string, version: number): Promise<unknown> {
  return call<unknown>('confirm_production_costs', { p_id: batchId, p_expected_version: version });
}

export function postProduction(batchId: string, version: number, planToken: string, clientRef: string): Promise<unknown> {
  return call<unknown>('post_production', { p_id: batchId, p_expected_version: version, p_expected_plan: planToken, p_client_ref: clientRef });
}

export function voidProduction(batchId: string, reason: string, clientRef: string): Promise<unknown> {
  return call<unknown>('void_production', { p_id: batchId, p_reason: reason, p_client_ref: clientRef });
}

export function discardBatch(batchId: string, version: number): Promise<unknown> {
  return call<unknown>('discard_draft', { p_doc_kind: 'production', p_id: batchId, p_expected_version: version });
}

/** الجلسة قبل أي طلب (درس 2026-10-26): الشاشة تستعملها قبل أن ترسم زرّ الإنتاج. */
export async function millReady(): Promise<boolean> {
  const { db } = await authed();
  return Boolean(db);
}
