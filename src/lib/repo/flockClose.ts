import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Fils, Milli } from '../../domain/money';
import { ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import './constraints-close';
import type { CostKind } from './flocks';

// إغلاق الدورة وعدد الطيور (0028، كلمة المالك 2026-11-12، العقد §4.6–§4.9 و§5.6–§5.7): بطاقة الفوج (flock_sales: المباع من الفواتير والتذاكر بلا
// فاتورة وفرق العدّ وما يجوز)، ونموذج الإغلاق (flock_close_form)، و«أغلق الدورة» (close_flock) بما عرضته الشاشة شرطاً (الحيّ والمباع وما نزل لكلّ
// مادّة)، و«أعد فتح الدورة» (reopen_flock)، و«أرجعه إلى مخزن» للعلف المنقول (return_hall_carry)، و«فرق العدّ» (record_flock_count_adjust). كلّ كتابة
// نداء واحد بمرجعه ومعرّفاته من الجهاز. المال (قيمة ما نزل وما رجع) داخل money لأدوار الكلفة وحدها، وغيابه قناع لا خطأ. ووحدة صفحات (write-guard).

export class CloseShapeError extends Error {
  constructor(readonly field: string) {
    super(`close_shape:${field}`);
    this.name = 'CloseShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CloseShapeError(field);
  return value as Row;
};
const optRecord = (value: unknown, field: string): Row | null => (value === null || value === undefined ? null : record(value, field));
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new CloseShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new CloseShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new CloseShapeError(field);
  return value;
};
const optInt = (row: Row, field: string): number | null => (row[field] === null || row[field] === undefined ? null : int(row, field));
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new CloseShapeError(field);
  return row[field] as boolean;
};
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  const value = row[field];
  if (!allowed.includes(value as T)) throw new CloseShapeError(field);
  return value as T;
};
const optScaled = (row: Row, field: string, scale: number): bigint | null => {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, scale);
  if (value === null) throw new CloseShapeError(field);
  return toScale(value, scale);
};
const scaled = (row: Row, field: string, scale: number): bigint => {
  const value = optScaled(row, field, scale);
  if (value === null) throw new CloseShapeError(field);
  return value;
};

const KINDS: readonly FlockKind[] = ['broiler', 'layer'];
const UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const COST_KINDS: readonly CostKind[] = ['feed', 'medicine', 'vaccine', 'fuel', 'other'];
const FLOCK_STATUSES = ['preparing', 'active', 'closed'] as const;
const TICKET_STATUSES = ['draft', 'done', 'void'] as const;
export const CLOSE_ACTIONS = ['return', 'consumed', 'carry'] as const;
export type CloseAction = (typeof CLOSE_ACTIONS)[number];
export const CARRY_STATUSES = ['pending', 'applied', 'returned', 'void'] as const;
export type CarryStatus = (typeof CARRY_STATUSES)[number];
/**
 * لماذا لا يُعاد فتح الإغلاق القائم الآن (مراجعة 0028 O6، private.reopen_block بترتيب فحوص reopen_flock): مستند إرجاع في مخزن خارج النطاق، والفترة مقفلة
 * حتى اليوم، والقاعة أو حقلها مؤرشف، وفوج بعدها في القاعة، ونقل مطبَّق، ودفعة إرجاع سُحب منها أو صُحّح سعرها.
 */
export const REOPEN_WHY = ['not_closed', 'out_of_scope', 'period_locked', 'hall_archived', 'hall_reused', 'carry_used', 'lot_consumed'] as const;
export type ReopenWhy = (typeof REOPEN_WHY)[number];

// ─── بطاقة الفوج (flock_sales) ───────────────────────────────────────────────────────────────────────────────────

export interface FlockSales {
  flockId: string;
  status: (typeof FLOCK_STATUSES)[number];
  kind: FlockKind;
  live: number;
  /** يوم الخادم وأقدم يوم يقبله «فرق العدّ» (مراجعة 0028 S1: كانت النافذة تحزرهما من ساعة الجهاز). */
  today: Day;
  earliestOn: Day;
  soldBirds: number;
  soldNetKg: Milli;
  /** مجموع فرق العدّ (سالب للنقص). */
  countDiff: number;
  /** طيور على تذاكر غير ملغاة بلا فاتورة مرحّلة. */
  ticketed: number;
  /** أحدث 20 تذكرة غير ملغاة. */
  tickets: readonly { id: string; ticketNo: string | null; status: (typeof TICKET_STATUSES)[number]; onDate: Day; birds: number | null; invoiced: boolean }[];
  close: { id: string; closedOn: Day; status: 'closed' | 'reopened' } | null;
  can: { ticket: boolean; adjust: boolean; close: boolean; reopen: boolean };
  /** لماذا لا يُعاد فتح الإغلاق القائم (O6)؛ null حين يُعاد أو لا إغلاق قائم. */
  reopenWhy: ReopenWhy | null;
}

export function parseFlockSales(value: unknown): FlockSales {
  const json = record(value, 'flock_sales');
  const can = record(json.can, 'can');
  const close = optRecord(json.close, 'close');
  return {
    flockId: str(json, 'flock_id'),
    status: oneOf(json, 'status', FLOCK_STATUSES),
    kind: oneOf(json, 'kind', KINDS),
    live: int(json, 'live'),
    today: str(json, 'today'),
    earliestOn: str(json, 'earliest_on'),
    soldBirds: int(json, 'sold_birds'),
    soldNetKg: scaled(json, 'sold_net_kg', 3),
    countDiff: int(json, 'count_diff'),
    ticketed: int(json, 'ticketed'),
    tickets: list(json.tickets, 'tickets').map((row) => ({
      id: str(row, 'id'),
      ticketNo: optStr(row, 'ticket_no'),
      status: oneOf(row, 'status', TICKET_STATUSES),
      onDate: str(row, 'on_date'),
      birds: optInt(row, 'birds'),
      invoiced: flag(row, 'invoiced'),
    })),
    close: close ? { id: str(close, 'id'), closedOn: str(close, 'closed_on'), status: oneOf(close, 'status', ['closed', 'reopened'] as const) } : null,
    can: { ticket: flag(can, 'ticket'), adjust: flag(can, 'adjust'), close: flag(can, 'close'), reopen: flag(can, 'reopen') },
    reopenWhy: json.reopen_why === null || json.reopen_why === undefined ? null : oneOf(json, 'reopen_why', REOPEN_WHY),
  };
}

export async function loadFlockSales(flockId: string): Promise<FlockSales> {
  return parseFlockSales(await call<unknown>('flock_sales', { p_flock: flockId }));
}

// ─── فرق العدّ (record_flock_count_adjust) ───────────────────────────────────────────────────────────────────────

/** birds بإشارته (+ زيادة، − نقص)، وexpectedLive الحيّ الذي عرضته الشاشة (الخادم يرفض live_changed إن تغيّر). */
export async function recordCountAdjust(input: {
  clientRef: string;
  id: string;
  flockId: string;
  on: Day;
  birds: number;
  reason: string;
  expectedLive: number;
}): Promise<{ id: string; flockId: string; onDate: Day; birds: number; liveAfter: number }> {
  const json = record(
    await call<unknown>('record_flock_count_adjust', {
      p_client_ref: input.clientRef,
      p_id: input.id,
      p_flock: input.flockId,
      p_on: input.on,
      p_birds: input.birds,
      p_reason: input.reason.trim(),
      p_expected_live: input.expectedLive,
    }),
    'record_flock_count_adjust',
  );
  return { id: str(json, 'id'), flockId: str(json, 'flock_id'), onDate: str(json, 'on_date'), birds: int(json, 'birds'), liveAfter: int(json, 'live_after') };
}

// ─── نموذج الإغلاق (flock_close_form) ────────────────────────────────────────────────────────────────────────────

export interface CloseStore {
  warehouseId: string;
  name: string;
  /** يُرجع إليه: لا مؤرشف ولا خارج النطاق. */
  usable: boolean;
  why: 'archived' | 'out_of_scope' | null;
  /** آخر يوم نزلت منه المادّة لهذه القاعة. */
  lastOn: Day | null;
}

const closeStore = (row: Row): CloseStore => ({
  warehouseId: str(row, 'warehouse_id'),
  name: str(row, 'name'),
  usable: flag(row, 'usable'),
  why: row.why === null || row.why === undefined ? null : oneOf(row, 'why', ['archived', 'out_of_scope'] as const),
  lastOn: optStr(row, 'last_on'),
});

export interface CloseItem {
  itemId: string;
  name: string;
  kind: ItemKind;
  costKind: CostKind;
  baseUnit: BaseUnit;
  /** ما نزل للقاعة صافياً (الصرف + المنقول إليها)، بوحدة الأساس. */
  poolQty: Milli;
  /** بالكيلو، null إن كان فيه سطر بلا وزن. */
  poolKg: Milli | null;
  /** منه من الدورة السابقة. */
  carryInQty: Milli;
  stores: readonly CloseStore[];
  defaultStore: string | null;
  /** قيمة ما نزل لأدوار الكلفة وحدها. */
  poolValue: Fils | null;
}

export interface CarryLine {
  lineId: string;
  itemId: string;
  name: string;
  qty: Milli;
  baseUnit: BaseUnit;
}

const carryLine = (row: Row): CarryLine => ({ lineId: str(row, 'line_id'), itemId: str(row, 'item_id'), name: str(row, 'name'), qty: scaled(row, 'qty', 3), baseUnit: oneOf(row, 'base_unit', UNITS) });

export interface CloseForm {
  flock: {
    id: string;
    hallId: string;
    hallName: string;
    siteName: string;
    kind: FlockKind;
    status: (typeof FLOCK_STATUSES)[number];
    placedOn: Day;
    placedCount: number;
    age0: number;
    closedOn: Day | null;
    live: number;
    dead: number;
    culled: number;
    countDiff: number;
    age: number | null;
  };
  today: Day;
  earliestOn: Day;
  defaultOn: Day;
  /** بصمة ما في القاعة كميةً وقيمةً (مراجعة 0028 M4)؛ تُرسل مع الإغلاق (p_expected_plan)، وخادم قبلها null. */
  plan: string | null;
  sales: { birds: number; netKg: Milli; avgKg: Milli | null; invoices: readonly { soldOn: Day; birds: number; netKg: Milli; ticketNo: string | null; docNo: string | null }[] };
  pendingTickets: readonly { ticketId: string; ticketNo: string | null; status: (typeof TICKET_STATUSES)[number]; onDate: Day; birds: number | null }[];
  /**
   * leftInHallKg ما في القاعة بتعريفه الواحد في كلّ الشاشات (مراجعة 0028 O2/M5: left_in_hall_kg)، وleftInHallUnweighed سطوره بلا كتلة (خارج الكيلو)؛ وخادم
   * قبله بالتقدير القديم (estimate_left_kg = النازل − المأكول، وunweighed).
   */
  feed: { givenKg: Milli; eatenKg: Milli; leftInHallKg: Milli; feedDays: number; feedSpan: number; leftInHallUnweighed: number };
  items: readonly CloseItem[];
  carryIn: readonly CarryLine[];
  canClose: boolean;
  whyNot: string | null;
}

export function parseCloseForm(value: unknown): CloseForm {
  const json = record(value, 'flock_close_form');
  const flock = record(json.flock, 'flock');
  const sales = record(json.sales, 'sales');
  const feed = record(json.feed, 'feed');
  return {
    flock: {
      id: str(flock, 'id'),
      hallId: str(flock, 'hall_id'),
      hallName: str(flock, 'hall_name'),
      siteName: str(flock, 'site_name'),
      kind: oneOf(flock, 'kind', KINDS),
      status: oneOf(flock, 'status', FLOCK_STATUSES),
      placedOn: str(flock, 'placed_on'),
      placedCount: int(flock, 'placed_count'),
      age0: int(flock, 'age0'),
      closedOn: optStr(flock, 'closed_on'),
      live: int(flock, 'live'),
      dead: int(flock, 'dead'),
      culled: int(flock, 'culled'),
      countDiff: int(flock, 'count_diff'),
      age: optInt(flock, 'age'),
    },
    today: str(json, 'today'),
    earliestOn: str(json, 'earliest_on'),
    defaultOn: str(json, 'default_on'),
    plan: optStr(json, 'plan'),
    sales: {
      birds: int(sales, 'birds'),
      netKg: scaled(sales, 'net_kg', 3),
      avgKg: optScaled(sales, 'avg_kg', 3),
      invoices: list(sales.invoices, 'invoices').map((row) => ({
        soldOn: str(row, 'sold_on'),
        birds: int(row, 'birds'),
        netKg: scaled(row, 'net_kg', 3),
        ticketNo: optStr(row, 'ticket_no'),
        docNo: optStr(row, 'doc_no'),
      })),
    },
    pendingTickets: list(json.pending_tickets, 'pending_tickets').map((row) => ({
      ticketId: str(row, 'ticket_id'),
      ticketNo: optStr(row, 'ticket_no'),
      status: oneOf(row, 'status', TICKET_STATUSES),
      onDate: str(row, 'on_date'),
      birds: optInt(row, 'birds'),
    })),
    feed: {
      givenKg: scaled(feed, 'given_kg', 3),
      eatenKg: scaled(feed, 'eaten_kg', 3),
      leftInHallKg: scaled(feed, feed.left_in_hall_kg === undefined ? 'estimate_left_kg' : 'left_in_hall_kg', 3),
      feedDays: int(feed, 'feed_days'),
      feedSpan: int(feed, 'feed_span'),
      leftInHallUnweighed: int(feed, feed.left_in_hall_unweighed === undefined ? 'unweighed' : 'left_in_hall_unweighed'),
    },
    items: list(json.items, 'items').map((row) => {
      const money = optRecord(row.money, 'money');
      return {
        itemId: str(row, 'item_id'),
        name: str(row, 'name'),
        kind: oneOf(row, 'kind', ITEM_KINDS),
        costKind: oneOf(row, 'cost_kind', COST_KINDS),
        baseUnit: oneOf(row, 'base_unit', UNITS),
        poolQty: scaled(row, 'pool_qty', 3),
        poolKg: optScaled(row, 'pool_kg', 3),
        carryInQty: scaled(row, 'carry_in_qty', 3),
        stores: list(row.stores, 'stores').map(closeStore),
        defaultStore: optStr(row, 'default_store'),
        poolValue: money ? optScaled(money, 'pool_value', 2) : null,
      };
    }),
    carryIn: list(json.carry_in ?? [], 'carry_in').map(carryLine),
    canClose: flag(json, 'can_close'),
    whyNot: optStr(json, 'why_not'),
  };
}

export async function loadCloseForm(flockId: string): Promise<CloseForm> {
  return parseCloseForm(await call<unknown>('flock_close_form', { p_flock: flockId }));
}

// ─── الإغلاق (close_flock) ونتيجته ─────────────────────────────────────────────────────────────────────────────────

export interface CloseLine {
  lineId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  action: CloseAction;
  qty: Milli;
  baseUnit: BaseUnit;
  kg: Milli | null;
  warehouseId: string | null;
  warehouseName: string | null;
  returnId: string | null;
  returnDocNo: string | null;
  carryStatus: CarryStatus | null;
  toFlockId: string | null;
  appliedOn: Day | null;
  /** في تقرير الدورة: مخازن الإرجاع للعلف المنقول المعلَّق. */
  stores: readonly CloseStore[];
  /** لأدوار الكلفة وحدها. */
  value: Fils | null;
}

export interface CloseResult {
  id: string;
  flockId: string;
  hallId: string;
  hallName: string;
  status: 'closed' | 'reopened';
  closedOn: Day;
  liveBefore: number;
  countDiff: number;
  countReason: string | null;
  soldBirds: number;
  soldNetKg: Milli;
  note: string | null;
  lines: readonly CloseLine[];
  /** لأدوار الكلفة وحدها (private.mask)؛ وتقرير الدورة بلاه. */
  money: { costTotal: Fils; returnedValue: Fils; carriedValue: Fils; revenue: Fils } | null;
}

export function parseCloseResult(value: unknown, field = 'flock_close_result'): CloseResult {
  const json = record(value, field);
  const money = optRecord(json.money, 'money');
  return {
    id: str(json, 'id'),
    flockId: str(json, 'flock_id'),
    hallId: str(json, 'hall_id'),
    hallName: str(json, 'hall_name'),
    status: oneOf(json, 'status', ['closed', 'reopened'] as const),
    closedOn: str(json, 'closed_on'),
    liveBefore: int(json, 'live_before'),
    countDiff: int(json, 'count_diff'),
    countReason: optStr(json, 'count_reason'),
    soldBirds: int(json, 'sold_birds'),
    soldNetKg: scaled(json, 'sold_net_kg', 3),
    note: optStr(json, 'note'),
    lines: list(json.lines, 'lines').map((row) => {
      const box = optRecord(row.money, 'money');
      return {
        lineId: str(row, 'line_id'),
        lineNo: int(row, 'line_no'),
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        action: oneOf(row, 'action', CLOSE_ACTIONS),
        qty: scaled(row, 'qty', 3),
        baseUnit: oneOf(row, 'base_unit', UNITS),
        kg: optScaled(row, 'kg', 3),
        warehouseId: optStr(row, 'warehouse_id'),
        warehouseName: optStr(row, 'warehouse_name'),
        returnId: optStr(row, 'return_id'),
        returnDocNo: optStr(row, 'return_doc_no'),
        carryStatus: row.carry_status === null || row.carry_status === undefined ? null : oneOf(row, 'carry_status', CARRY_STATUSES),
        toFlockId: optStr(row, 'to_flock_id'),
        appliedOn: optStr(row, 'applied_on'),
        stores: list(row.stores ?? [], 'stores').map(closeStore),
        value: box ? optScaled(box, 'value', 2) : null,
      };
    }),
    money: money
      ? {
          costTotal: scaled(money, 'cost_total', 2),
          returnedValue: scaled(money, 'returned_value', 2),
          carriedValue: scaled(money, 'carried_value', 2),
          revenue: scaled(money, 'revenue', 2),
        }
      : null,
  };
}

/** سطر الباقي كما يُرسل: مادّة واحدة بمصيرها، والمخزن للإرجاع وحده. */
export interface CloseLineInput {
  itemId: string;
  qty: Milli;
  action: CloseAction;
  warehouseId: string | null;
}

/** ما عرضته الشاشة وأُرسل معه شرطاً: الحيّ والمباع وما نزل لكلّ مادّة (الخادم يقارنها تحت قفل الفوج، D8). */
export interface CloseRequest {
  clientRef: string;
  closeId: string;
  flockId: string;
  on: Day;
  expectedLive: number;
  expectedSold: number;
  expectedPools: readonly { itemId: string; qty: Milli }[];
  countReason: string | null;
  lines: readonly CloseLineInput[];
  note: string | null;
  /**
   * بصمة ما نزل كما رآها النموذج (CloseForm.plan): الخادم يرفض pool_changed بلاها أو بغيرها (مراجعة 0028 M4)، فتُرسل دائماً (الوسيط الحادي عشر)،
   * وطلبٌ محفوظ قبلها يُرسل null فيُرفض رفضاً أكيداً لا يتجمّد.
   */
  expectedPlan: string | null;
}

/** وسائط close_flock بمفاتيح العقد بالضبط، فالإعادة بالمرجع نفسه ترسل النصّ نفسه. */
export function closeArgs(request: CloseRequest): Record<string, unknown> {
  return {
    p_client_ref: request.clientRef,
    p_close_id: request.closeId,
    p_flock: request.flockId,
    p_on: request.on,
    p_expected_live: request.expectedLive,
    p_expected_sold: request.expectedSold,
    p_expected_pools: request.expectedPools.map((pool) => ({ item_id: pool.itemId, qty: decimalText(pool.qty, 3) })),
    p_count_reason: request.countReason === null ? null : request.countReason.trim() || null,
    p_lines: request.lines.map((line) =>
      line.action === 'return' ? { item_id: line.itemId, qty: decimalText(line.qty, 3), action: line.action, warehouse_id: line.warehouseId } : { item_id: line.itemId, qty: decimalText(line.qty, 3), action: line.action },
    ),
    p_note: request.note === null ? null : request.note.trim() || null,
    p_expected_plan: request.expectedPlan ?? null,
  };
}

export async function closeFlock(request: CloseRequest): Promise<CloseResult> {
  return parseCloseResult(await call<unknown>('close_flock', closeArgs(request)));
}

// ─── إعادة الفتح والإرجاع من العلف المنقول ─────────────────────────────────────────────────────────────────────────

export async function reopenFlock(closeId: string, reason: string, clientRef: string): Promise<{ closeId: string; flockId: string }> {
  const json = record(await call<unknown>('reopen_flock', { p_close_id: closeId, p_reason: reason.trim(), p_client_ref: clientRef }), 'reopen_flock');
  if (json.status !== 'reopened') throw new CloseShapeError('status');
  return { closeId: str(json, 'close_id'), flockId: str(json, 'flock_id') };
}

/** العلف المنقول المعلَّق إلى مخزن جاء منه: مستند FR بقيمته المنقولة. returnId من الجهاز. */
export async function returnHallCarry(clientRef: string, returnId: string, lineId: string, warehouseId: string): Promise<{ returnId: string; docNo: string; lineId: string }> {
  const json = record(await call<unknown>('return_hall_carry', { p_client_ref: clientRef, p_return_id: returnId, p_line: lineId, p_warehouse: warehouseId }), 'return_hall_carry');
  return { returnId: str(json, 'return_id'), docNo: str(json, 'doc_no'), lineId: str(json, 'line_id') };
}
