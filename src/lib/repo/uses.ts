import type { Fils, Milli } from '../../domain/money';
import { BASE_UNITS } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { ZeroRowsError } from '../errors';
import { call, classifyPostgrest, send, updatedRows } from './core';
import {
  arr,
  bool,
  count,
  deleteDraftLine,
  discardDraft,
  moneyOf,
  obj,
  oneOf,
  optStr,
  problem,
  qtyOf,
  readAll,
  RowShapeError,
  scaled,
  str,
  withStatus,
  written,
  type DocCursor,
  type DocPage,
  type DocStatus,
  type Problem,
  type StockRef,
} from './inventory';

// الصرف لمصروف عام والإتلاف (0008، FOUNDATION ٣٠٥–٣٠٦، ٥٥٦، Q5، E31). ملف كسول بحزمة شاشات المخزون (index ما يصدّره): الرأس
// والسطور كتابة مباشرة بسياسة (فعل stock_use.post ونطاق المخزن) وبـupdatedRows، والمعاينة والترحيل والإلغاء دوالّ بمرجع. القيم
// داخل money بس، والخادم يشيلها لدور بلا كلفة (الأمين يشوف الكميات والدفعات بلا قيمة المصروف).

type Row = Record<string, unknown>;

export interface UseDoc {
  id: string;
  status: DocStatus;
  version: number;
  docNo: string | null;
  warehouseId: string;
  /** تصنيف المصروف (والإتلاف «إتلاف منتهي»)؛ المسوّدة تبدأ بلاه. */
  categoryId: string | null;
  onDate: string;
  note: string | null;
  posted: boolean;
  voidReason: string | null;
  createdAt: string;
}

const USE_COLUMNS = 'id, doc_no, warehouse_id, category_id, used_on, status, version, note, posted_at, void_reason, created_at';
const DOC_STATUSES: readonly DocStatus[] = ['draft', 'posted', 'void'];

function stockUseDoc(row: Row): UseDoc {
  const version = row.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new RowShapeError('version');
  return {
    id: str(row, 'id'),
    status: oneOf(row, 'status', DOC_STATUSES),
    version,
    docNo: optStr(row, 'doc_no'),
    warehouseId: str(row, 'warehouse_id'),
    categoryId: optStr(row, 'category_id'),
    onDate: str(row, 'used_on'),
    note: optStr(row, 'note'),
    posted: row.posted_at !== null && row.posted_at !== undefined,
    voidReason: optStr(row, 'void_reason'),
    createdAt: str(row, 'created_at'),
  };
}

export interface UseLine {
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
  /** الدفعة المسمّاة: منتهية تحتاج المدير (Q5)، والإتلاف بيها دائماً. */
  lotId: string | null;
}

const USE_LINE_COLUMNS = 'id, line_no, item_id, item_unit_id, unit_code, unit_label, qty_in_unit::text, qty_base::text, lot_id, item:items(name, base_unit)';

function stockUseLine(row: Row): UseLine {
  const item = obj(row.item, 'item');
  const lineNo = count(row, 'line_no');
  if (lineNo === null) throw new RowShapeError('line_no');
  return {
    id: str(row, 'id'),
    lineNo,
    itemId: str(row, 'item_id'),
    itemName: str(item, 'name'),
    baseUnit: oneOf(item, 'base_unit', BASE_UNITS),
    itemUnitId: optStr(row, 'item_unit_id'),
    unitCode: optStr(row, 'unit_code'),
    unitLabel: str(row, 'unit_label'),
    qtyInUnit: qtyOf(row, 'qty_in_unit'),
    qty: qtyOf(row, 'qty_base'),
    lotId: optStr(row, 'lot_id'),
  };
}

export const USES_PAGE = 100;

/** مستندات الصرف بصفحات (keyset مثل التحويل): المسوّدات ثم المرحَّلة ثم الملغاة، والأحدث أوّلاً، والعدد الكلّي بأوّل صفحة. */
export async function listUses(after: DocCursor | null = null): Promise<Omit<DocPage, 'rows'> & { rows: UseDoc[] }> {
  const { result, wasOnline } = await send(
    (db) => {
      let page = db.from('stock_uses').select(USE_COLUMNS);
      if (after) {
        const at = `"${after.createdAt}"`;
        page = page.or(`status.gt.${after.status},and(status.eq.${after.status},created_at.lt.${at}),and(status.eq.${after.status},created_at.eq.${at},id.lt.${after.id})`);
      }
      const rows = page.order('status').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(USES_PAGE);
      return Promise.all([rows, after ? null : db.from('stock_uses').select('id', { count: 'exact', head: true })]);
    },
    ([rows, total]) => (total ? [rows, total] : [rows]),
  );
  const [rows, total] = result;
  for (const answer of total ? [rows, total] : [rows]) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  const docs = ((rows.data ?? []) as unknown as Row[]).map(stockUseDoc);
  const last = docs.at(-1);
  return {
    rows: docs,
    total: total ? (total.count ?? 0) : null,
    next: docs.length === USES_PAGE && last ? { status: last.status, createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function loadUse(id: string): Promise<{ doc: UseDoc; lines: UseLine[] }> {
  const list = await readAll((db) =>
    Promise.all([db.from('stock_uses').select(USE_COLUMNS).eq('id', id), db.from('stock_use_lines').select(USE_LINE_COLUMNS).eq('doc_id', id).order('line_no') /* unbounded: سطور مستند واحد */]),
  );
  const [head] = list(0);
  if (!head) throw new ZeroRowsError();
  return { doc: stockUseDoc(head), lines: list(1).map(stockUseLine) };
}

export function createUseDraft(warehouseId: string, categoryId: string | null, usedOn: string, note: string | null = null): Promise<UseDoc> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('stock_uses').insert({ warehouse_id: warehouseId, category_id: categoryId, used_on: usedOn, note: note?.trim() || null }).select(USE_COLUMNS))),
  ).then(stockUseDoc);
}

export interface UseHeaderPatch {
  day?: string;
  note?: string | null;
  categoryId?: string | null;
}

/** تاريخ المسوّدة أو ملاحظتها أو تصنيفها بشرط النسخة (الحقول المتغيّرة بس). */
export function updateUseDraft(doc: Pick<UseDoc, 'id' | 'version'>, patch: UseHeaderPatch): Promise<UseDoc> {
  const fields = {
    ...(patch.day ? { used_on: patch.day } : {}),
    ...(patch.note === undefined ? {} : { note: patch.note?.trim() || null }),
    ...(patch.categoryId === undefined ? {} : { category_id: patch.categoryId }),
  };
  return written(async (db) => updatedRows(withStatus(await db.from('stock_uses').update(fields).eq('id', doc.id).eq('version', doc.version).select(USE_COLUMNS)))).then(stockUseDoc);
}

/** سطر الصرف: الوحدة والكمية بها، والدفعة المسمّاة اختيارياً (لقطة الوحدة يكتبها الخادم، E7). */
export interface UseLineFields {
  item_id: string;
  item_unit_id: string | null;
  unit_code: string | null;
  qty_in_unit: string;
  lot_id: string | null;
}

export function addUseLine(docId: string, fields: UseLineFields): Promise<UseLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('stock_use_lines').insert({ ...fields, doc_id: docId }).select(USE_LINE_COLUMNS)))).then(stockUseLine);
}

export function deleteUseLine(lineId: string, expectedVersion: number): Promise<{ deleted: boolean; version: number | null }> {
  return deleteDraftLine('stock_use', lineId, expectedVersion);
}

export function discardUse(id: string, expectedVersion: number): Promise<void> {
  return discardDraft('stock_use', id, expectedVersion);
}

// ─── المعاينة والترحيل والإلغاء ──────────────────────────────────────────────────────────────────────────────────

export interface UseDraw {
  lotId: string;
  qty: Milli;
  receivedOn: string;
  expiryOn: string | null;
  source: string;
  /** null لدور بلا كلفة. */
  value: Fils | null;
}

export interface UsePreviewLine {
  lineId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  qty: Milli;
  qtyInUnit: Milli;
  unitLabel: string;
  lotId: string | null;
  lotExpiryOn: string | null;
  available: Milli;
  expired: Milli;
  later: Milli;
  shortage: Milli;
  /** السطر يسحب الرصيد كلّه (المتاح، أو متبقّي دفعته المسمّاة) (E31). */
  wholeBalance: boolean;
  /** يسمّي دفعة منتهية لصرف عادي: إذن المدير (Q5). */
  needsRelease: boolean;
  problem: Problem | null;
  draws: readonly UseDraw[];
  value: Fils | null;
}

export interface UsePreview {
  version: number;
  /** بصمة القطع (مثل التحويل): الترحيل يرسلها، والمخزون اللي تغيّر بعدها يرجع stale_preview. */
  plan: string;
  categoryName: string | null;
  /** الإتلاف (تصنيف «إتلاف منتهي»): للمدير بس، وكل سطر يسمّي دفعة منتهية. */
  destroy: boolean;
  /** «بانتظار موافقة المدير»: إتلاف أو سطر يسمّي دفعة منتهية (Q5). */
  needsManager: boolean;
  /** المستخدم الحالي يقدر يرحّله (الإذن المطلوب عنده). */
  canPost: boolean;
  problems: readonly Problem[];
  lines: readonly UsePreviewLine[];
  ready: boolean;
  /** قيمة المصروف (مجموع السحب)؛ null لدور بلا كلفة. */
  total: Fils | null;
}

const filsOrNull = (row: Row | null, field: string): Fils | null => (row ? scaled(row, field, 2) : null);

export function parseUsePreview(value: unknown): UsePreview {
  const json = obj(value, 'preview_stock_use');
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  return {
    version,
    plan: str(json, 'plan'),
    categoryName: optStr(json, 'category_name'),
    destroy: bool(json, 'destroy'),
    needsManager: bool(json, 'needs_manager'),
    canPost: bool(json, 'can_post'),
    problems: arr(json.problems, 'problems').map((item) => problem(item)).filter((item): item is Problem => item !== null),
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      return {
        lineId: str(row, 'line_id'),
        lineNo: count(row, 'line_no') ?? 0,
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        tracksExpiry: bool(row, 'tracks_expiry'),
        qty: qtyOf(row, 'qty'),
        qtyInUnit: qtyOf(row, 'qty_in_unit'),
        unitLabel: str(row, 'unit_label'),
        lotId: optStr(row, 'lot_id'),
        lotExpiryOn: optStr(row, 'lot_expiry_on'),
        available: qtyOf(row, 'available'),
        expired: qtyOf(row, 'expired'),
        later: qtyOf(row, 'later'),
        shortage: qtyOf(row, 'shortage'),
        wholeBalance: bool(row, 'whole_balance'),
        needsRelease: bool(row, 'needs_release'),
        problem: problem(row.problem),
        draws: arr(row.draws, 'draws').map((entry) => {
          const draw = obj(entry, 'draws');
          return {
            lotId: str(draw, 'lot_id'),
            qty: qtyOf(draw, 'qty'),
            receivedOn: str(draw, 'received_on'),
            expiryOn: optStr(draw, 'expiry_on'),
            source: str(draw, 'source'),
            value: filsOrNull(moneyOf(draw), 'value'),
          };
        }),
        value: filsOrNull(moneyOf(row), 'value'),
      };
    }),
    ready: bool(json, 'ready'),
    total: filsOrNull(moneyOf(json), 'total'),
  };
}

export async function previewUse(id: string): Promise<UsePreview> {
  return parseUsePreview(await call<unknown>('preview_stock_use', { p_id: id }));
}

export interface PostedUse {
  id: string;
  status: DocStatus;
  docNo: string | null;
  /** قيمة المصروف؛ null لدور بلا كلفة. */
  total: Fils | null;
}

function postedUse(value: unknown): PostedUse {
  const json = obj(value, 'stock_use');
  return { id: str(json, 'id'), status: oneOf(json, 'status', DOC_STATUSES), docNo: optStr(json, 'doc_no'), total: filsOrNull(moneyOf(json), 'total') };
}

/** الترحيل بنسخة المسوّدة وبصمة المعاينة اللي انوافق عليها (stale_preview لمّا المخزون تغيّر بعدها). */
export async function postUse(ref: StockRef, id: string, expectedVersion: number, plan: string): Promise<PostedUse> {
  return postedUse(await call<unknown>('post_stock_use', { p_id: id, p_expected_version: expectedVersion, p_expected_plan: plan, p_client_ref: ref.clientRef }));
}

export async function voidUse(ref: StockRef, id: string, reason: string): Promise<PostedUse> {
  return postedUse(await call<unknown>('void_stock_use', { p_id: id, p_reason: reason, p_client_ref: ref.clientRef }));
}
