import { decimalText } from '../../domain/decimal';
import type { Fils, Milli, UnitCost } from '../../domain/money';
import { BASE_UNITS, ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { RejectedError, ZeroRowsError } from '../errors';
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
  type Problem,
  type StockRef,
} from './inventory';

// الجرد (0008، FOUNDATION ٥٥٥، القاعدة 17، E25، E41، E42، E45، E48، E53، E55). ملف كسول بحزمة شاشات المخزون (index ما يصدّره).
// العادّ يكتب المسوّدة وسطورها مباشرةً (count.enter ونطاق المخزن) بمعرّفات تولد بالجهاز، فالحفظ اللي ينعاد بعد ما ضاع جوابه يرجع
// 23505 مو سطراً ثانياً؛ وسطور العادّ تنقرا بلا كميات الدفتر (عدّ أعمى، E25). والمراجعة (count.approve) من دوالّها: المعاينة بالدفتر
// والفرق، وإعادة الحساب، والإعادة للعدّ، والترحيل بالبصمة، والإلغاء؛ وسبب الفرق وكلفة الوحدة (أربع مراتب) كتابة مباشرة بالمراجعة.

type Row = Record<string, unknown>;

export type CountStatus = 'draft' | 'submitted' | 'approved' | 'void';
export const COUNT_STATUSES: readonly CountStatus[] = ['draft', 'submitted', 'approved', 'void'];

export interface CountDoc {
  id: string;
  status: CountStatus;
  version: number;
  docNo: string | null;
  warehouseId: string;
  onDate: string;
  note: string | null;
  submittedAt: string | null;
  /** سبب «أعِد للعدّ» الأخير (يبقى بعد إعادة التسليم للتاريخ). */
  returnReason: string | null;
  voidReason: string | null;
  createdAt: string;
}

const COUNT_COLUMNS = 'id, doc_no, warehouse_id, counted_on, status, version, note, submitted_at, return_reason, void_reason, created_at';

function countDoc(row: Row): CountDoc {
  const version = row.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new RowShapeError('version');
  return {
    id: str(row, 'id'),
    status: oneOf(row, 'status', COUNT_STATUSES),
    version,
    docNo: optStr(row, 'doc_no'),
    warehouseId: str(row, 'warehouse_id'),
    onDate: str(row, 'counted_on'),
    note: optStr(row, 'note'),
    submittedAt: optStr(row, 'submitted_at'),
    returnReason: optStr(row, 'return_reason'),
    voidReason: optStr(row, 'void_reason'),
    createdAt: str(row, 'created_at'),
  };
}

/** سطر العدّ كما يشوفه العادّ: المعدود (الصالح والمنتهي) وتواريخ الزيادة ووقت الفقس، بلا كميات الدفتر ولا الفرق (E25). */
export interface CountLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  itemKind: ItemKind;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  counted: Milli;
  /** المنتهي المعدود (E41)؛ null لمادّة ما تتابع الانتهاء. */
  countedExpired: Milli | null;
  gainExpiryOn: string | null;
  gainExpiredExpiryOn: string | null;
  /** وقت فقس الزيادة للأفراخ (E42). */
  gainBornAt: string | null;
  /** سبب الفرق يكتبه المدير بالمراجعة. */
  reason: string | null;
}

// الأعمدة نفسها تحدّد العدّ الأعمى: system_qty والفرق ما ينطلبون من شاشة العادّ أبداً.
const COUNT_LINE_COLUMNS =
  'id, line_no, item_id, counted_qty::text, counted_expired_qty::text, gain_expiry_on, gain_expired_expiry_on, gain_born_at, reason, item:items(name, kind, base_unit, tracks_expiry)';

function countLine(row: Row): CountLine {
  const item = obj(row.item, 'item');
  const lineNo = count(row, 'line_no');
  if (lineNo === null) throw new RowShapeError('line_no');
  return {
    id: str(row, 'id'),
    lineNo,
    itemId: str(row, 'item_id'),
    itemName: str(item, 'name'),
    itemKind: oneOf(item, 'kind', ITEM_KINDS),
    baseUnit: oneOf(item, 'base_unit', BASE_UNITS),
    tracksExpiry: bool(item, 'tracks_expiry'),
    counted: qtyOf(row, 'counted_qty'),
    countedExpired: scaled(row, 'counted_expired_qty', 3),
    gainExpiryOn: optStr(row, 'gain_expiry_on'),
    gainExpiredExpiryOn: optStr(row, 'gain_expired_expiry_on'),
    gainBornAt: optStr(row, 'gain_born_at'),
    reason: optStr(row, 'reason'),
  };
}

export const COUNTS_PAGE = 100;

export interface CountCursor {
  status: CountStatus;
  createdAt: string;
  id: string;
}

export interface CountPage {
  rows: CountDoc[];
  next: CountCursor | null;
  total: number | null;
}

/**
 * الجرود بصفحات (keyset): بترتيب الحالة نصّاً (approved ثم draft ثم submitted ثم void) والأحدث أوّلاً بكل حالة؛ submitted
 * («بانتظار المراجعة») بقائمة لحالها من نفس الدالّة (status). العدد الكلّي بأوّل صفحة.
 */
export async function listCounts(after: CountCursor | null = null, status: CountStatus | null = null): Promise<CountPage> {
  const { result, wasOnline } = await send(
    (db) => {
      let page = db.from('stock_counts').select(COUNT_COLUMNS);
      if (status) page = page.eq('status', status);
      if (after) {
        const at = `"${after.createdAt}"`;
        page = page.or(`status.gt.${after.status},and(status.eq.${after.status},created_at.lt.${at}),and(status.eq.${after.status},created_at.eq.${at},id.lt.${after.id})`);
      }
      const rows = page.order('status').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(COUNTS_PAGE);
      let total = db.from('stock_counts').select('id', { count: 'exact', head: true });
      if (status) total = total.eq('status', status);
      return Promise.all([rows, after ? null : total]);
    },
    ([rows, total]) => (total ? [rows, total] : [rows]),
  );
  const [rows, total] = result;
  for (const answer of total ? [rows, total] : [rows]) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  const docs = ((rows.data ?? []) as unknown as Row[]).map(countDoc);
  const last = docs.at(-1);
  return {
    rows: docs,
    total: total ? (total.count ?? 0) : null,
    next: docs.length === COUNTS_PAGE && last ? { status: last.status, createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function loadCount(id: string): Promise<{ doc: CountDoc; lines: CountLine[] }> {
  const list = await readAll((db) =>
    Promise.all([db.from('stock_counts').select(COUNT_COLUMNS).eq('id', id), db.from('stock_count_lines').select(COUNT_LINE_COLUMNS).eq('doc_id', id).order('line_no') /* unbounded: سطور جرد واحد */]),
  );
  const [head] = list(0);
  if (!head) throw new ZeroRowsError();
  return { doc: countDoc(head), lines: list(1).map(countLine) };
}

/** مسوّدة جرد بمعرّف يولد بالجهاز: الإعادة بعد جواب ضاع بنفس المعرّف 23505 (isDuplicate)، مو جرد ثاني. */
export function createCountDraft(id: string, warehouseId: string, countedOn: string, note: string | null = null): Promise<CountDoc> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('stock_counts').insert({ id, warehouse_id: warehouseId, counted_on: countedOn, note: note?.trim() || null }).select(COUNT_COLUMNS))),
  ).then(countDoc);
}

/** حقول سطر العدّ كما تنكتب: الكميات نصوص عشرية بوحدة الأساس (E3)، والتواريخ YYYY-MM-DD، ووقت الفقس ISO. */
export interface CountLineFields {
  item_id: string;
  counted_qty: string;
  counted_expired_qty: string | null;
  gain_expiry_on: string | null;
  gain_expired_expiry_on: string | null;
  gain_born_at: string | null;
}

/** سطر بمعرّف يولد بالجهاز (FOUNDATION ١٩٩): الحفظ اللي ينعاد يرجع 23505 = انكتب. */
export function addCountLine(docId: string, id: string, fields: CountLineFields): Promise<CountLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('stock_count_lines').insert({ id, ...fields, doc_id: docId }).select(COUNT_LINE_COLUMNS)))).then(countLine);
}

/** قيم كمية سطر العدّ اللي يجوز التعديل فوقها (نصوص عشرية بوحدة الأساس). */
export type CountLineBase = Pick<CountLineFields, 'counted_qty' | 'counted_expired_qty'>;

/**
 * تعديل سطر العدّ بمعرّفه. bases للتعديل المشروط (مراجعات WP5): التعديل بس إذا السطر بعده بوحدة من القيم اللي يجوز الكتابة فوقها
 * (اللي انحسب منها التغيير، ومجاميع محاولات ضاع جوابها)، كل وحدة بطلب مشروط لحاله، وإلا صفر صفوف (ZeroRowsError): جهاز ثاني غيّر
 * السطر بعد ما انقرت الشاشة، فما ينمسح عدّه. والمراجعة الرابعة: بلا تأكيد بقراءة القيمة (كان يقرا «انكتب» لعدّ جهاز ثاني وصل نفس
 * المجموع)؛ المحاولة اللي ممكن وصلت مجموعها أساس جائز بالجهاز (countDevice).
 */
export async function updateCountLine(lineId: string, patch: Partial<Omit<CountLineFields, 'item_id'>>, bases?: readonly CountLineBase[]): Promise<CountLine> {
  const update = (base: CountLineBase | null) =>
    written(async (db) =>
      updatedRows(
        withStatus(
          await (base
            ? db
                .from('stock_count_lines')
                .update(patch)
                .eq('id', lineId)
                .eq('counted_qty', base.counted_qty)
                .filter('counted_expired_qty', base.counted_expired_qty === null ? 'is' : 'eq', base.counted_expired_qty)
            : db.from('stock_count_lines').update(patch).eq('id', lineId)
          ).select(COUNT_LINE_COLUMNS),
        ),
      ),
    ).then(countLine);
  if (!bases) return update(null);
  for (const base of bases) {
    try {
      return await update(base);
    } catch (error) {
      if (!(error instanceof ZeroRowsError)) throw error;
    }
  }
  throw new ZeroRowsError();
}

export function deleteCountLine(lineId: string, expectedVersion: number): Promise<{ deleted: boolean; version: number | null }> {
  return deleteDraftLine('count', lineId, expectedVersion);
}

/** طيّ المسوّدة، أو «أغلِق دون ترحيل» للمسلَّم (count.approve). */
export function discardCount(id: string, expectedVersion: number): Promise<void> {
  return discardDraft('count', id, expectedVersion);
}

/** نسخة الجرد الحالية (السطور تزيدها بالحارس): التسليم والمراجعة بشرطها. */
export async function countVersion(id: string): Promise<number> {
  const list = await readAll((db) => Promise.all([db.from('stock_counts').select('version').eq('id', id)]));
  const [head] = list(0);
  if (!head) throw new ZeroRowsError();
  const version = head.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new RowShapeError('version');
  return version;
}

function stateOf(value: unknown, fn: string): { id: string; status: CountStatus; version: number } {
  const json = obj(value, fn);
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  return { id: str(json, 'id'), status: oneOf(json, 'status', COUNT_STATUSES), version };
}

/** التسليم (count.enter): لقطة الدفتر والفرق بالخادم، والنتيجة بلا كميات (E25). */
export async function submitCount(ref: StockRef, id: string, expectedVersion: number): Promise<{ id: string; status: CountStatus; version: number }> {
  return stateOf(await call<unknown>('submit_count', { p_id: id, p_expected_version: expectedVersion, p_client_ref: ref.clientRef }), 'submit_count');
}

/** «أعِد للعدّ» (count.approve) بسببه. */
export async function returnCount(ref: StockRef, id: string, expectedVersion: number, reason: string): Promise<{ id: string; status: CountStatus; version: number }> {
  return stateOf(await call<unknown>('return_count', { p_id: id, p_expected_version: expectedVersion, p_reason: reason, p_client_ref: ref.clientRef }), 'return_count');
}

// ─── المراجعة (count.approve) ─────────────────────────────────────────────────────────────────────────────────

/**
 * سبب فرق السطر بالمراجعة (الفراغ = بلا سبب)، على الفرقين اللي شافهم المدير بالشاشة: فرق تغيّر بعدها («أعد الحساب» بنافذة ثانية)
 * يرجع stale_draft بدل سبب ينكتب لفرق ما شافه (المراجعة الثانية لـWP5).
 */
export function setCountReason(lineId: string, reason: string | null, seen: { diff: Milli | null; expiredDiff: Milli | null }): Promise<CountLine> {
  const text = reason?.trim() || null;
  const stamp = (qty: Milli | null): string | null => (text !== null && qty !== null ? decimalText(qty, 3) : null);
  return written(async (db) =>
    updatedRows(withStatus(await db.from('stock_count_lines').update({ reason: text, reason_diff: stamp(seen.diff), reason_expired_diff: stamp(seen.expiredDiff) }).eq('id', lineId).select(COUNT_LINE_COLUMNS))),
  ).then(countLine);
}

const costText = (cost: UnitCost | null): string | null => {
  if (cost === null) return null;
  const negative = cost < 0n;
  const digits = (negative ? -cost : cost).toString().padStart(5, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -4)}.${digits.slice(-4)}`;
};

/**
 * كلفة وحدة الزيادة بلا دفعة قياس (E48، أربع مراتب): تعديل صفّها، وإذا ما موجود إدراج (المنح بلا upsert: on conflict يحدّث line_id
 * وماله منح). إدراجان بنفس اللحظة: الثاني 23505 ويعيد التعديل.
 */
export async function setGainUnitCost(lineId: string, cost: UnitCost | null): Promise<void> {
  const value = costText(cost);
  const update = () => written(async (db) => updatedRows(withStatus(await db.from('stock_count_line_costs').update({ gain_unit_cost: value }).eq('line_id', lineId).select('line_id'))));
  try {
    await update();
    return;
  } catch (error) {
    if (!(error instanceof ZeroRowsError)) throw error;
  }
  try {
    await written(async (db) => updatedRows(withStatus(await db.from('stock_count_line_costs').insert({ line_id: lineId, gain_unit_cost: value }).select('line_id'))));
  } catch (error) {
    if (!(error instanceof RejectedError && error.code === '23505')) throw error;
    await update();
  }
}

export interface CountDraw {
  lotId: string;
  qty: Milli;
  expiryOn: string | null;
  receivedOn: string;
  value: Fils | null;
}

export interface CountPreviewLine {
  lineId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  itemKind: ItemKind;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  counted: Milli;
  countedExpired: Milli | null;
  /** لقطة التسليم (أو آخر «أعد الحساب»). */
  systemQty: Milli | null;
  systemExpiredQty: Milli | null;
  diff: Milli | null;
  expiredDiff: Milli | null;
  /** الرصيد الآن: يختلف عن اللقطة = تغيّر بعد العدّ (count_stale). */
  nowQty: Milli;
  nowExpiredQty: Milli | null;
  stale: boolean;
  gainExpiryOn: string | null;
  gainExpiredExpiryOn: string | null;
  gainBornAt: string | null;
  reason: string | null;
  /** السبب مكتوب على فرق غير الفرق الحالي («أعد الحساب» غيّره): الترحيل يطلب تأكيده (reason_required). */
  reasonStale: boolean;
  /** مصدر قيمة الزيادة: دفعة القياس (E45) أو كلفة المدير (E48)؛ null بلا زيادة أو بلا الاثنين. */
  gainSource: 'lot' | 'manual' | null;
  referenceLotId: string | null;
  problem: Problem | null;
  draws: readonly CountDraw[];
  expiredDraws: readonly CountDraw[];
  /** القيم لأدوار الكلفة بس (null لغيرها). */
  shortageValue: Fils | null;
  gainValue: Fils | null;
  gainUnitCost: UnitCost | null;
  referenceValueIn: Fils | null;
  referenceQtyIn: Milli | null;
}

export interface CountPreview {
  version: number;
  plan: string;
  status: CountStatus;
  submittedAt: string | null;
  snapshotAt: string | null;
  stale: boolean;
  problems: readonly Problem[];
  lines: readonly CountPreviewLine[];
  ready: boolean;
  shortageTotal: Fils | null;
  gainTotal: Fils | null;
}

const draws = (value: unknown, field: string): CountDraw[] =>
  arr(value, field).map((entry) => {
    const draw = obj(entry, field);
    const money = moneyOf(draw);
    return { lotId: str(draw, 'lot_id'), qty: qtyOf(draw, 'qty'), expiryOn: optStr(draw, 'expiry_on'), receivedOn: str(draw, 'received_on'), value: money ? scaled(money, 'value', 2) : null };
  });

export function parseCountPreview(value: unknown): CountPreview {
  const json = obj(value, 'preview_count');
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  const totals = moneyOf(json);
  return {
    version,
    plan: str(json, 'plan'),
    status: oneOf(json, 'status', COUNT_STATUSES),
    submittedAt: optStr(json, 'submitted_at'),
    snapshotAt: optStr(json, 'snapshot_at'),
    stale: bool(json, 'stale'),
    problems: arr(json.problems, 'problems').map((item) => problem(item)).filter((item): item is Problem => item !== null),
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      const money = moneyOf(row);
      const source = row.gain_source;
      if (source !== null && source !== undefined && source !== 'lot' && source !== 'manual') throw new RowShapeError('gain_source');
      return {
        lineId: str(row, 'line_id'),
        lineNo: count(row, 'line_no') ?? 0,
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        itemKind: oneOf(row, 'kind', ITEM_KINDS),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        tracksExpiry: bool(row, 'tracks_expiry'),
        counted: qtyOf(row, 'counted_qty'),
        countedExpired: scaled(row, 'counted_expired_qty', 3),
        systemQty: scaled(row, 'system_qty', 3),
        systemExpiredQty: scaled(row, 'system_expired_qty', 3),
        diff: scaled(row, 'diff', 3),
        expiredDiff: scaled(row, 'expired_diff', 3),
        nowQty: qtyOf(row, 'now_qty'),
        nowExpiredQty: scaled(row, 'now_expired_qty', 3),
        stale: bool(row, 'stale'),
        gainExpiryOn: optStr(row, 'gain_expiry_on'),
        gainExpiredExpiryOn: optStr(row, 'gain_expired_expiry_on'),
        gainBornAt: optStr(row, 'gain_born_at'),
        reason: optStr(row, 'reason'),
        reasonStale: bool(row, 'reason_stale'),
        gainSource: source === 'lot' || source === 'manual' ? source : null,
        referenceLotId: optStr(row, 'reference_lot_id'),
        problem: problem(row.problem),
        draws: draws(row.draws, 'draws'),
        expiredDraws: draws(row.expired_draws, 'expired_draws'),
        shortageValue: money ? scaled(money, 'shortage_value', 2) : null,
        gainValue: money ? scaled(money, 'gain_value', 2) : null,
        gainUnitCost: money ? scaled(money, 'gain_unit_cost', 4) : null,
        referenceValueIn: money ? scaled(money, 'reference_value_in', 2) : null,
        referenceQtyIn: money ? scaled(money, 'reference_qty_in', 3) : null,
      };
    }),
    ready: bool(json, 'ready'),
    shortageTotal: totals ? scaled(totals, 'shortage_total', 2) : null,
    gainTotal: totals ? scaled(totals, 'gain_total', 2) : null,
  };
}

export async function previewCount(id: string): Promise<CountPreview> {
  return parseCountPreview(await call<unknown>('preview_count', { p_id: id }));
}

export interface RefreshedLine {
  lineId: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  before: { systemQty: Milli | null; systemExpiredQty: Milli | null; diff: Milli | null; expiredDiff: Milli | null };
  after: { systemQty: Milli | null; systemExpiredQty: Milli | null; diff: Milli | null; expiredDiff: Milli | null };
  /** المستندات اللي ترحّلت على المادّة بالمخزن بعد اللقطة السابقة (كميات بس)، وvoided لمستند انلغى بعدها (عكسياته بس). */
  docs: readonly { docKind: string; docId: string; label: string; qty: Milli; voided: boolean }[];
}

const snapshot = (value: unknown, field: string) => {
  const row = obj(value, field);
  return { systemQty: scaled(row, 'system_qty', 3), systemExpiredQty: scaled(row, 'system_expired_qty', 3), diff: scaled(row, 'diff', 3), expiredDiff: scaled(row, 'expired_diff', 3) };
};

export function parseRefresh(value: unknown): { version: number; lines: RefreshedLine[] } {
  const json = obj(value, 'refresh_count');
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  return {
    version,
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      return {
        lineId: str(row, 'line_id'),
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        before: snapshot(row.old, 'old'),
        after: snapshot(row.new, 'new'),
        docs: arr(row.docs, 'docs').map((entry) => {
          const doc = obj(entry, 'docs');
          return { docKind: str(doc, 'doc_kind'), docId: str(doc, 'doc_id'), label: str(doc, 'label'), qty: qtyOf(doc, 'qty'), voided: bool(doc, 'voided') };
        }),
      };
    }),
  };
}

/** «أعد الحساب»: لقطة جديدة بالخادم (تثبت)، والفرق القديم والجديد والمستندات بينهما. */
export async function refreshCount(ref: StockRef, id: string, expectedVersion: number): Promise<{ version: number; lines: RefreshedLine[] }> {
  return parseRefresh(await call<unknown>('refresh_count', { p_id: id, p_expected_version: expectedVersion, p_client_ref: ref.clientRef }));
}

export interface PostedCount {
  id: string;
  status: CountStatus;
  docNo: string | null;
  shortageTotal: Fils | null;
  gainTotal: Fils | null;
}

function postedCount(value: unknown): PostedCount {
  const json = obj(value, 'count');
  const money = moneyOf(json);
  return {
    id: str(json, 'id'),
    status: oneOf(json, 'status', COUNT_STATUSES),
    docNo: optStr(json, 'doc_no'),
    shortageTotal: money ? scaled(money, 'shortage_total', 2) : null,
    gainTotal: money ? scaled(money, 'gain_total', 2) : null,
  };
}

/** الموافقة = الترحيل (count.approve) بالنسخة والبصمة؛ رصيد تغيّر بعد اللقطة count_stale، ومخزون تغيّر بعد المعاينة stale_preview. */
export async function postCount(ref: StockRef, id: string, expectedVersion: number, plan: string): Promise<PostedCount> {
  return postedCount(await call<unknown>('post_count', { p_id: id, p_expected_version: expectedVersion, p_expected_plan: plan, p_client_ref: ref.clientRef }));
}

export async function voidCount(ref: StockRef, id: string, reason: string): Promise<PostedCount> {
  return postedCount(await call<unknown>('void_count', { p_id: id, p_reason: reason, p_client_ref: ref.clientRef }));
}

/**
 * «بانتظار موافقة المدير» (Q5، E53) من home_summary (E38): جرود مسلَّمة للمراجعة، ومسوّدات صرف تسمّي دفعة منتهية أو إتلاف، بمخازن
 * النطاق؛ null لمن ما يقدر يوافق (الخادم ما يرجّعها). هنا بحزمة المخزون (لوحته تعرضها)، مو بالرئيسية المحفوظة بالتثبيت المسبق.
 */
export async function loadApprovals(): Promise<{ counts: number; uses: number } | null> {
  const json = obj(await call<unknown>('home_summary'), 'home_summary');
  if (json.approvals === undefined) return null;
  const approvals = obj(json.approvals, 'approvals');
  const counts = count(approvals, 'counts');
  const uses = count(approvals, 'uses');
  if (counts === null || uses === null) throw new RowShapeError('approvals');
  return { counts, uses };
}
