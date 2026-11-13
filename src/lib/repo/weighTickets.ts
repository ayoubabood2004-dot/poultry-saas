import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { Milli } from '../../domain/money';
import type { WeighMethod } from '../../domain/weighTicket';
import { call } from './core';
import './constraints-close';

// تذاكر الوزن (0028، كلمة المالك 2026-11-12، العقد §4.1–§4.3 و§5.1–§5.3): التذكرة مسوّدة تُحفظ بشرط نسختها بعد كلّ وزنة (save_weigh_ticket بلا
// مرجع: كتابة مشروطة تُعاد بمحتواها)، ثمّ «أكمل التذكرة» برقم WT (finish_weigh_ticket بمرجعه)، أو تُلغى (void_weigh_ticket). بلا مال: يقرؤها كلّ
// دور في النطاق. الأرقام بالسلك نصوص عشرية: الكيلو بالآلاف (Milli)، والأعداد أعداد JSON، والغائب null لا صفر. ووحدة صفحات (write-guard): تستوردها صفحات
// القاعات وحدها، وrepo/index لا يصدّرها.

export class TicketShapeError extends Error {
  constructor(readonly field: string) {
    super(`ticket_shape:${field}`);
    this.name = 'TicketShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TicketShapeError(field);
  return value as Row;
};
const optRecord = (value: unknown, field: string): Row | null => (value === null || value === undefined ? null : record(value, field));
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new TicketShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new TicketShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new TicketShapeError(field);
  return value;
};
const optInt = (row: Row, field: string): number | null => (row[field] === null || row[field] === undefined ? null : int(row, field));
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new TicketShapeError(field);
  return row[field] as boolean;
};
const optFlag = (row: Row, field: string): boolean | null => (row[field] === null || row[field] === undefined ? null : flag(row, field));
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  const value = row[field];
  if (!allowed.includes(value as T)) throw new TicketShapeError(field);
  return value as T;
};
const optKg = (row: Row, field: string): Milli | null => {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, 3);
  if (value === null) throw new TicketShapeError(field);
  return toScale(value, 3);
};
const kg = (row: Row, field: string): Milli => {
  const value = optKg(row, field);
  if (value === null) throw new TicketShapeError(field);
  return value;
};

const METHODS: readonly WeighMethod[] = ['scale', 'crates'];
export const TICKET_STATUSES = ['draft', 'done', 'void'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
const FLOCK_STATUSES = ['preparing', 'active', 'closed'] as const;
/** مرشّح القائمة: «بانتظار الفاتورة» = مكتملة بلا فاتورة مرحّلة. */
export const TICKET_FILTERS = ['all', 'draft', 'done', 'awaiting', 'void'] as const;
export type TicketFilter = (typeof TICKET_FILTERS)[number];

// ─── التذكرة (weigh_ticket) ──────────────────────────────────────────────────────────────────────────────────────

export interface TicketWeighing {
  id: string;
  weighingNo: number;
  crates: number;
  grossKg: Milli;
}

export interface TicketStop {
  id: string;
  stopNo: number;
  hallId: string;
  hallName: string;
  flockId: string;
  flockStatus: (typeof FLOCK_STATUSES)[number];
  birds: number | null;
  crates: number | null;
  grossKg: Milli | null;
  prevGrossKg: Milli | null;
  cratesKg: Milli | null;
  netKg: Milli | null;
  avgKg: Milli | null;
  /** الحيّ الآن في القاعة، وطيورها على تذاكر أخرى بلا فاتورة. */
  live: number;
  otherTicketed: number;
  weighings: readonly TicketWeighing[];
}

/** قاعة طيورها في التذكرة أكثر من حيّها بعد التذاكر الأخرى بلا فاتورة (تنبيه لا رفض: الطيور تخرج عند الفاتورة). */
export interface TicketWarning {
  stopId: string;
  hallName: string;
  birds: number;
  live: number;
  otherTicketed: number;
}

export interface WeighTicket {
  id: string;
  ticketNo: string | null;
  status: TicketStatus;
  version: number;
  siteId: string;
  siteName: string;
  divisionId: string;
  onDate: Day;
  method: WeighMethod;
  emptyKg: Milli | null;
  /** القبّان وحده؛ null لميزان الأقفاص. */
  emptyWithCrates: boolean | null;
  crateKg: Milli | null;
  vehicle: string | null;
  driver: string | null;
  note: string | null;
  birds: number | null;
  crates: number | null;
  grossKg: Milli | null;
  netKg: Milli | null;
  avgKg: Milli | null;
  stops: readonly TicketStop[];
  invoiced: boolean;
  /** فاتورتها المرحّلة (لأدوار المبيعات وحدها؛ null لغيرهم أو بلا فاتورة). */
  sale: { id: string; docNo: string; status: string } | null;
  createdByName: string | null;
  finishedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  can: { edit: boolean; finish: boolean; void: boolean; invoice: boolean };
  warnings: readonly TicketWarning[];
}

export function parseWeighTicket(value: unknown): WeighTicket {
  const json = record(value, 'weigh_ticket');
  const can = record(json.can, 'can');
  const sale = optRecord(json.sale, 'sale');
  return {
    id: str(json, 'id'),
    ticketNo: optStr(json, 'ticket_no'),
    status: oneOf(json, 'status', TICKET_STATUSES),
    version: int(json, 'version'),
    siteId: str(json, 'site_id'),
    siteName: str(json, 'site_name'),
    divisionId: str(json, 'division_id'),
    onDate: str(json, 'on_date'),
    method: oneOf(json, 'method', METHODS),
    emptyKg: optKg(json, 'empty_kg'),
    emptyWithCrates: optFlag(json, 'empty_with_crates'),
    crateKg: optKg(json, 'crate_kg'),
    vehicle: optStr(json, 'vehicle'),
    driver: optStr(json, 'driver'),
    note: optStr(json, 'note'),
    birds: optInt(json, 'birds'),
    crates: optInt(json, 'crates'),
    grossKg: optKg(json, 'gross_kg'),
    netKg: optKg(json, 'net_kg'),
    avgKg: optKg(json, 'avg_kg'),
    stops: list(json.stops, 'stops').map((row) => ({
      id: str(row, 'id'),
      stopNo: int(row, 'stop_no'),
      hallId: str(row, 'hall_id'),
      hallName: str(row, 'hall_name'),
      flockId: str(row, 'flock_id'),
      flockStatus: oneOf(row, 'flock_status', FLOCK_STATUSES),
      birds: optInt(row, 'birds'),
      crates: optInt(row, 'crates'),
      grossKg: optKg(row, 'gross_kg'),
      prevGrossKg: optKg(row, 'prev_gross_kg'),
      cratesKg: optKg(row, 'crates_kg'),
      netKg: optKg(row, 'net_kg'),
      avgKg: optKg(row, 'avg_kg'),
      live: int(row, 'live'),
      otherTicketed: int(row, 'other_ticketed'),
      weighings: list(row.weighings ?? [], 'weighings').map((weighing) => ({
        id: str(weighing, 'id'),
        weighingNo: int(weighing, 'weighing_no'),
        crates: int(weighing, 'crates'),
        grossKg: kg(weighing, 'gross_kg'),
      })),
    })),
    invoiced: flag(json, 'invoiced'),
    sale: sale ? { id: str(sale, 'id'), docNo: str(sale, 'doc_no'), status: str(sale, 'status') } : null,
    createdByName: optStr(json, 'created_by_name'),
    finishedAt: optStr(json, 'finished_at'),
    voidedAt: optStr(json, 'voided_at'),
    voidReason: optStr(json, 'void_reason'),
    can: { edit: flag(can, 'edit'), finish: flag(can, 'finish'), void: flag(can, 'void'), invoice: flag(can, 'invoice') },
    warnings: list(json.warnings ?? [], 'warnings').map((row) => ({
      stopId: str(row, 'stop_id'),
      hallName: str(row, 'hall_name'),
      birds: int(row, 'birds'),
      live: int(row, 'live'),
      otherTicketed: int(row, 'other_ticketed'),
    })),
  };
}

export async function loadWeighTicket(id: string): Promise<WeighTicket> {
  return parseWeighTicket(await call<unknown>('weigh_ticket', { p_ticket: id }));
}

// ─── الخيارات (weigh_ticket_options) ─────────────────────────────────────────────────────────────────────────────

export interface OptionsHall {
  hallId: string;
  name: string;
  /** الفوج القائم (لاحم)، أو null: القاعة بلا فوج لا تُحمَّل منها طيور. */
  flock: { id: string; placedOn: Day; age: number; live: number; ticketed: number } | null;
}

export type TicketOptions =
  | { kind: 'sites'; sites: readonly { siteId: string; name: string; hallsWithFlock: number }[] }
  | {
      kind: 'site';
      site: { id: string; name: string };
      today: Day;
      earliestOn: Day;
      /** آخر وزن قفص في تذكرة مكتملة (يُقترح حين يُوزن الفارغ بلا أقفاص). */
      lastCrateKg: Milli | null;
      halls: readonly OptionsHall[];
      canCreate: boolean;
    };

export function parseTicketOptions(value: unknown): TicketOptions {
  const json = record(value, 'weigh_ticket_options');
  if (json.site === undefined || json.site === null) {
    return { kind: 'sites', sites: list(json.sites, 'sites').map((row) => ({ siteId: str(row, 'site_id'), name: str(row, 'name'), hallsWithFlock: int(row, 'halls_with_flock') })) };
  }
  const site = record(json.site, 'site');
  return {
    kind: 'site',
    site: { id: site.site_id !== undefined ? str(site, 'site_id') : str(site, 'id'), name: str(site, 'name') },
    today: str(json, 'today'),
    earliestOn: str(json, 'earliest_on'),
    lastCrateKg: optKg(json, 'last_crate_kg'),
    halls: list(json.halls, 'halls').map((row) => {
      const flock = optRecord(row.flock, 'flock');
      return {
        hallId: str(row, 'hall_id'),
        name: str(row, 'name'),
        flock: flock ? { id: str(flock, 'id'), placedOn: str(flock, 'placed_on'), age: int(flock, 'age'), live: int(flock, 'live'), ticketed: int(flock, 'ticketed') } : null,
      };
    }),
    canCreate: flag(json, 'can_create'),
  };
}

/** siteId null: الحقول التي فيها قاعات بفوج قائم؛ وإلّا قاعات الحقل وأفواجها ويوم الخادم وأقدم يوم يُقبل. */
export async function loadTicketOptions(siteId: string | null): Promise<TicketOptions> {
  return parseTicketOptions(await call<unknown>('weigh_ticket_options', { p_site: siteId }));
}

// ─── القائمة (weigh_tickets) ─────────────────────────────────────────────────────────────────────────────────────

export interface TicketRow {
  id: string;
  ticketNo: string | null;
  status: TicketStatus;
  onDate: Day;
  siteId: string;
  siteName: string;
  birds: number | null;
  netKg: Milli | null;
  halls: readonly string[];
  invoiced: boolean;
  /** لأدوار المبيعات وحدها. */
  sale: { id: string; docNo: string } | null;
}

export interface TicketList {
  rows: readonly TicketRow[];
  /** أكثر من الحدّ (500): المعروض أحدثها. */
  more: boolean;
  /** مجاميع غير الملغاة. */
  totals: { count: number; birds: number; netKg: Milli };
  canCreate: boolean;
}

export function parseTicketList(value: unknown): TicketList {
  const json = record(value, 'weigh_tickets');
  const totals = record(json.totals, 'totals');
  return {
    rows: list(json.rows, 'rows').map((row) => {
      const sale = optRecord(row.sale, 'sale');
      const halls = row.halls;
      if (!Array.isArray(halls) || !halls.every((name) => typeof name === 'string' && name !== '')) throw new TicketShapeError('halls');
      return {
        id: str(row, 'id'),
        ticketNo: optStr(row, 'ticket_no'),
        status: oneOf(row, 'status', TICKET_STATUSES),
        onDate: str(row, 'on_date'),
        siteId: str(row, 'site_id'),
        siteName: str(row, 'site_name'),
        birds: optInt(row, 'birds'),
        netKg: optKg(row, 'net_kg'),
        halls: halls as string[],
        invoiced: flag(row, 'invoiced'),
        sale: sale ? { id: str(sale, 'id'), docNo: str(sale, 'doc_no') } : null,
      };
    }),
    more: flag(json, 'more'),
    totals: { count: int(totals, 'count'), birds: int(totals, 'birds'), netKg: kg(totals, 'net_kg') },
    canCreate: flag(json, 'can_create'),
  };
}

/** المدّة: اليومان معاً أو لا شيء (بلا تصفية بالتاريخ). */
export async function loadWeighTickets(from: Day | null, to: Day | null, status: TicketFilter): Promise<TicketList> {
  return parseTicketList(await call<unknown>('weigh_tickets', { p_from: from, p_to: to, p_status: status }));
}

// ─── الكتابة: الحفظ والإكمال والإلغاء ─────────────────────────────────────────────────────────────────────────────

/** التذكرة كما في الجهاز: المعرّفات تولد بالجهاز مرّة لكلّ تذكرة وقاعة ووزنة. */
export interface TicketDraft {
  siteId: string;
  onDate: Day;
  method: WeighMethod;
  emptyKg: Milli | null;
  emptyWithCrates: boolean;
  crateKg: Milli | null;
  vehicle: string;
  driver: string;
  note: string;
  stops: readonly {
    id: string;
    hallId: string;
    birds: number | null;
    crates: number | null;
    grossKg: Milli | null;
    weighings: readonly { id: string; crates: number; grossKg: Milli }[];
  }[];
}

const kgText = (value: Milli | null): string | null => (value === null ? null : decimalText(value, 3));
const text = (value: string): string | null => value.trim() || null;

/** p_data بمفاتيح العقد بالضبط، فإعادة الحفظ بالمحتوى نفسه ترسل النصّ نفسه (الخادم يجيب «حُفظ» بلا كتابة). */
export function ticketPayload(draft: TicketDraft): Record<string, unknown> {
  const scale = draft.method === 'scale';
  return {
    site_id: draft.siteId,
    on_date: draft.onDate,
    method: draft.method,
    empty_kg: scale ? kgText(draft.emptyKg) : null,
    empty_with_crates: scale ? draft.emptyWithCrates : null,
    crate_kg: kgText(draft.crateKg),
    vehicle: text(draft.vehicle),
    driver: text(draft.driver),
    note: text(draft.note),
    stops: draft.stops.map((stop) => ({
      id: stop.id,
      hall_id: stop.hallId,
      birds: stop.birds,
      crates: scale ? stop.crates : null,
      gross_kg: scale ? kgText(stop.grossKg) : null,
      weighings: scale ? [] : stop.weighings.map((weighing) => ({ id: weighing.id, crates: weighing.crates, gross_kg: decimalText(weighing.grossKg, 3) })),
    })),
  };
}

/** «حُفظ» (ومعه التذكرة كما في الخادم، إلّا إعادة بالمحتوى نفسه) أو «تغيّرت» ومعها نسخة الخادم: لا كتابة ولا رفض. */
export type SaveResult = { status: 'saved'; ticket: WeighTicket | null } | { status: 'stale'; server: WeighTicket };

export function parseSaveResult(value: unknown): SaveResult {
  const json = record(value, 'save_weigh_ticket');
  const status = oneOf(json, 'status', ['saved', 'stale'] as const);
  if (status === 'stale') return { status, server: parseWeighTicket(json.server) };
  return { status, ticket: json.ticket === null || json.ticket === undefined ? null : parseWeighTicket(json.ticket) };
}

/** expectedVersion null: تذكرة جديدة بمعرّفها من الجهاز. */
export async function saveWeighTicket(id: string, expectedVersion: number | null, draft: TicketDraft): Promise<SaveResult> {
  return parseSaveResult(await call<unknown>('save_weigh_ticket', { p_ticket: id, p_expected_version: expectedVersion, p_data: ticketPayload(draft) }));
}

/** «أكمل التذكرة»: رقم WT ولا تعديل بعده. المرجع مرّة لكلّ محاولة، والإعادة بعد نتيجة مجهولة به. */
export async function finishWeighTicket(clientRef: string, id: string, expectedVersion: number): Promise<WeighTicket> {
  return parseWeighTicket(await call<unknown>('finish_weigh_ticket', { p_client_ref: clientRef, p_ticket: id, p_expected_version: expectedVersion }));
}

/** المسوّدة تُحذف بلا سبب، والمكتملة تُلغى بسبب (المدير). */
export async function voidWeighTicket(id: string, reason: string | null, clientRef: string): Promise<{ id: string; ticketNo: string | null; status: 'void' }> {
  const json = record(await call<unknown>('void_weigh_ticket', { p_ticket: id, p_reason: reason === null ? null : reason.trim() || null, p_client_ref: clientRef }), 'void_weigh_ticket');
  return { id: str(json, 'id'), ticketNo: optStr(json, 'ticket_no'), status: oneOf(json, 'status', ['void'] as const) };
}
