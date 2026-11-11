import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Fils, Milli } from '../../domain/money';
import { ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import type { CostKind } from './flocks';

// «القاعات بين يديك» (0026، كلمة المالك 2026-11-11، docs/HALLS_PLAN.md): الإضافة لعدّة قاعات بنداء واحد (صرف من مخزن، أو دواء بلا مخزن، أو تأشير
// لقاح)، وجدول اللقاحات الواحد لكلّ نوع وقائمة لقاحاته، والتذكير، وتقويم القاعة الشهري، وتقرير الدورة. الأرقام نصوص عشرية بالسلك: الكمية والكيلو
// بالآلاف (Milli)، والمال بالفلس، والنسبة بمرتبتين؛ والمال يغيب مفتاحه كلّه لغير أدوار الكلفة، فالمحلّل يقرأ الغياب null.

export class HallsShapeError extends Error {
  constructor(readonly field: string) {
    super(`halls_shape:${field}`);
    this.name = 'HallsShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HallsShapeError(field);
  return value as Row;
};
const optRecord = (value: unknown, field: string): Row | null => (value === null || value === undefined ? null : record(value, field));
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new HallsShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new HallsShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new HallsShapeError(field);
  return value;
};
const optInt = (row: Row, field: string): number | null => (row[field] === null || row[field] === undefined ? null : int(row, field));
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new HallsShapeError(field);
  return row[field] as boolean;
};
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  const value = row[field];
  if (!allowed.includes(value as T)) throw new HallsShapeError(field);
  return value as T;
};
const optScaled = (row: Row, field: string, scale: number): bigint | null => {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, scale);
  if (value === null) throw new HallsShapeError(field);
  return toScale(value, scale);
};
const scaled = (row: Row, field: string, scale: number): bigint => {
  const value = optScaled(row, field, scale);
  if (value === null) throw new HallsShapeError(field);
  return value;
};
/** كائن المال إن حضر (أدوار الكلفة)، أو null لغيرهم: الغياب قناع لا خطأ. */
const moneyBox = (row: Row): Row | null => optRecord(row.money, 'money');

const KINDS: readonly FlockKind[] = ['broiler', 'layer'];
const UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const COST_KINDS: readonly CostKind[] = ['feed', 'medicine', 'vaccine', 'fuel', 'other'];
const FLOCK_STATUSES = ['preparing', 'active', 'closed'] as const;
export type HallFlockStatus = (typeof FLOCK_STATUSES)[number];
export const VACCINE_STATES = ['done', 'today', 'missed', 'planned'] as const;
export type VaccineState = (typeof VACCINE_STATES)[number];
export const REMINDER_WHEN = ['overdue', 'today', 'tomorrow', 'soon'] as const;
export type ReminderWhen = (typeof REMINDER_WHEN)[number];
/** عدد ألوان اللقاحات: اللون بالموضع 0..9 (لوحة بلا ألوان الحالة). */
export const VACCINE_COLORS = 10;

const color = (row: Row): number => {
  const value = int(row, 'color');
  if (value < 0 || value >= VACCINE_COLORS) throw new HallsShapeError('color');
  return value;
};

export interface LinkedItem {
  id: string;
  name: string;
  baseUnit: BaseUnit;
}
const linkedItem = (value: unknown): LinkedItem | null => {
  const row = optRecord(value, 'item');
  return row ? { id: str(row, 'id'), name: str(row, 'name'), baseUnit: oneOf(row, 'base_unit', UNITS) } : null;
};

// ─── الإضافة للقاعات (give_to_flocks) ─────────────────────────────────────────────────────────────────────────────

/** صرف من مخزن بكميته (بوحدة أساس المادّة، بالآلاف)؛ المعرّفات تولد بالجهاز مرّة لكلّ نموذج. */
export interface IssueGive {
  issueId: string;
  lineId: string;
  warehouseId: string;
  qty: Milli;
}

export type GiveLine =
  | ({ kind: 'issue'; flockId: string; itemId: string } & IssueGive)
  | { kind: 'log'; flockId: string; id: string; name: string; dose: string | null }
  | { kind: 'vaccination'; flockId: string; id: string; vaccineId: string; ageDay: number; issue: IssueGive | null };

/** السطر بمفاتيح الخادم بالضبط (العقد)، فإعادة النداء بالمرجع نفسه ترسل النصّ نفسه حرفاً بحرف. */
export function giveLineJson(line: GiveLine): Record<string, unknown> {
  if (line.kind === 'issue') {
    return { kind: 'issue', flock_id: line.flockId, issue_id: line.issueId, line_id: line.lineId, item_id: line.itemId, warehouse_id: line.warehouseId, qty: decimalText(line.qty, 3) };
  }
  if (line.kind === 'log') return { kind: 'log', flock_id: line.flockId, id: line.id, name: line.name.trim(), dose: line.dose === null ? null : line.dose.trim() || null };
  const base: Record<string, unknown> = { kind: 'vaccination', flock_id: line.flockId, id: line.id, vaccine_id: line.vaccineId, age_day: line.ageDay };
  return line.issue
    ? { ...base, issue_id: line.issue.issueId, line_id: line.issue.lineId, warehouse_id: line.issue.warehouseId, qty: decimalText(line.issue.qty, 3) }
    : base;
}

export interface GiveResult {
  on: Day;
  issues: readonly { issueId: string; docNo: string; flockId: string; hallName: string; itemName: string; qty: Milli; baseUnit: BaseUnit }[];
  logs: readonly { id: string; flockId: string }[];
  vaccinations: readonly { id: string; flockId: string; vaccineId: string; ageDay: number; issueId: string | null; docNo: string | null }[];
}

export function parseGiveResult(value: unknown): GiveResult {
  const json = record(value, 'give_to_flocks');
  return {
    on: str(json, 'on'),
    issues: list(json.issues, 'issues').map((row) => ({
      issueId: str(row, 'issue_id'),
      docNo: str(row, 'doc_no'),
      flockId: str(row, 'flock_id'),
      hallName: str(row, 'hall_name'),
      itemName: str(row, 'item_name'),
      qty: scaled(row, 'qty', 3),
      baseUnit: oneOf(row, 'base_unit', UNITS),
    })),
    logs: list(json.logs, 'logs').map((row) => ({ id: str(row, 'id'), flockId: str(row, 'flock_id') })),
    vaccinations: list(json.vaccinations, 'vaccinations').map((row) => ({
      id: str(row, 'id'),
      flockId: str(row, 'flock_id'),
      vaccineId: str(row, 'vaccine_id'),
      ageDay: int(row, 'age_day'),
      issueId: optStr(row, 'issue_id'),
      docNo: optStr(row, 'doc_no'),
    })),
  };
}

/** نداء واحد بمعاملة واحدة: أيّ رفض لا يحفظ شيئاً. المرجع والسطور مرّة لكلّ نموذج، والإعادة بعد نتيجة مجهولة بهما حرفاً بحرف. */
export async function giveToFlocks(clientRef: string, on: Day, lines: readonly GiveLine[]): Promise<GiveResult> {
  return parseGiveResult(await call<unknown>('give_to_flocks', { p_client_ref: clientRef, p_on: on, p_lines: lines.map(giveLineJson) }));
}

export async function removeFlockLog(id: string): Promise<{ id: string; removed: boolean }> {
  const json = record(await call<unknown>('remove_flock_log', { p_id: id }), 'remove_flock_log');
  return { id: str(json, 'id'), removed: flag(json, 'removed') };
}

export async function undoVaccination(id: string, reason: string | null, clientRef: string): Promise<{ id: string; issueVoided: boolean }> {
  const json = record(
    await call<unknown>('undo_vaccination', { p_id: id, p_reason: reason === null ? null : reason.trim() || null, p_client_ref: clientRef }),
    'undo_vaccination',
  );
  if (json.status !== 'void') throw new HallsShapeError('status');
  return { id: str(json, 'id'), issueVoided: flag(json, 'issue_voided') };
}

// ─── قائمة اللقاحات وجدولها (vaccine_board وكاتباه) ─────────────────────────────────────────────────────────────────

export interface Vaccine {
  id: string;
  name: string;
  color: number;
  version: number;
  /** أُشِّر لقاحٌ به من قبل: الحذف يخفيه ولا يمحوه. */
  inUse: boolean;
  item: LinkedItem | null;
}

export interface ProgramDay {
  vaccineId: string;
  ageDay: number;
}

export interface VaccineProgram {
  /** 0 = لا جدول بعد. */
  version: number;
  endAge: number | null;
  days: readonly ProgramDay[];
}

export interface VaccineBoard {
  today: Day;
  canEdit: boolean;
  hasHalls: Readonly<Record<FlockKind, boolean>>;
  vaccines: readonly Vaccine[];
  programs: Readonly<Record<FlockKind, VaccineProgram>>;
  items: readonly { id: string; name: string; kind: ItemKind; baseUnit: BaseUnit }[];
}

const program = (value: unknown, field: string): VaccineProgram => {
  const row = record(value, field);
  return {
    version: int(row, 'version'),
    endAge: optInt(row, 'end_age'),
    days: list(row.days, 'days').map((day) => ({ vaccineId: str(day, 'vaccine_id'), ageDay: int(day, 'age_day') })),
  };
};

export function parseVaccineBoard(value: unknown): VaccineBoard {
  const json = record(value, 'vaccine_board');
  const halls = record(json.has_halls, 'has_halls');
  const programs = record(json.programs, 'programs');
  return {
    today: str(json, 'today'),
    canEdit: flag(json, 'can_edit'),
    hasHalls: { broiler: flag(halls, 'broiler'), layer: flag(halls, 'layer') },
    vaccines: list(json.vaccines, 'vaccines').map((row) => ({
      id: str(row, 'id'),
      name: str(row, 'name'),
      color: color(row),
      version: int(row, 'version'),
      inUse: flag(row, 'in_use'),
      item: linkedItem(row.item),
    })),
    programs: { broiler: program(programs.broiler, 'broiler'), layer: program(programs.layer, 'layer') },
    items: list(json.items, 'items').map((row) => ({
      id: str(row, 'id'),
      name: str(row, 'name'),
      kind: oneOf(row, 'kind', ITEM_KINDS),
      baseUnit: oneOf(row, 'base_unit', UNITS),
    })),
  };
}

export async function loadVaccineBoard(): Promise<VaccineBoard> {
  return parseVaccineBoard(await call<unknown>('vaccine_board'));
}

/** لقاح جديد (expectedVersion null، والمعرّف من الجهاز) أو تعديل اسمه ومادّته بشرط نسخته. */
export async function saveVaccine(id: string, name: string, itemId: string | null, expectedVersion: number | null): Promise<{ id: string; version: number; color: number }> {
  const json = record(
    await call<unknown>('save_vaccine', { p_id: id, p_name: name.trim(), p_item: itemId, p_expected_version: expectedVersion }),
    'save_vaccine',
  );
  return { id: str(json, 'id'), version: int(json, 'version'), color: color(json) };
}

export async function deleteVaccine(id: string, expectedVersion: number): Promise<{ id: string; result: 'deleted' | 'archived' }> {
  const json = record(await call<unknown>('delete_vaccine', { p_id: id, p_expected_version: expectedVersion }), 'delete_vaccine');
  return { id: str(json, 'id'), result: oneOf(json, 'result', ['deleted', 'archived'] as const) };
}

/** الجدول كلّه بنهايته وأيّامه، بشرط النسخة التي قُرئت (0 حين لا جدول). */
export async function saveVaccineProgram(kind: FlockKind, endAge: number, days: readonly ProgramDay[], expectedVersion: number): Promise<{ kind: FlockKind; version: number; endAge: number; days: number }> {
  const json = record(
    await call<unknown>('save_vaccine_program', {
      p_kind: kind,
      p_end_age: endAge,
      p_days: days.map((day) => ({ vaccine_id: day.vaccineId, age_day: day.ageDay })),
      p_expected_version: expectedVersion,
    }),
    'save_vaccine_program',
  );
  return { kind: oneOf(json, 'kind', KINDS), version: int(json, 'version'), endAge: int(json, 'end_age'), days: int(json, 'days') };
}

// ─── التذكير (vaccine_reminders) ──────────────────────────────────────────────────────────────────────────────────

export interface Reminder {
  flockId: string;
  hallId: string;
  hallName: string;
  siteName: string;
  kind: FlockKind;
  vaccineId: string;
  name: string;
  color: number;
  ageDay: number;
  dueOn: Day;
  when: ReminderWhen;
  linked: boolean;
  item: LinkedItem | null;
}

export interface Reminders {
  today: Day;
  canMark: boolean;
  items: readonly Reminder[];
}

export function parseReminders(value: unknown): Reminders {
  const json = record(value, 'vaccine_reminders');
  return {
    today: str(json, 'today'),
    canMark: flag(json, 'can_mark'),
    items: list(json.items, 'items').map((row) => ({
      flockId: str(row, 'flock_id'),
      hallId: str(row, 'hall_id'),
      hallName: str(row, 'hall_name'),
      siteName: str(row, 'site_name'),
      kind: oneOf(row, 'kind', KINDS),
      vaccineId: str(row, 'vaccine_id'),
      name: str(row, 'name'),
      color: color(row),
      ageDay: int(row, 'age_day'),
      dueOn: str(row, 'due_on'),
      when: oneOf(row, 'when', REMINDER_WHEN),
      linked: flag(row, 'linked'),
      item: linkedItem(row.item),
    })),
  };
}

export async function loadReminders(): Promise<Reminders> {
  return parseReminders(await call<unknown>('vaccine_reminders'));
}

// ─── تقويم القاعة (flock_month) وتقرير الدورة (flock_cycle_report) ───────────────────────────────────────────────────────

export interface HallFlock {
  id: string;
  hallId: string;
  hallName: string;
  siteName: string;
  kind: FlockKind;
  status: HallFlockStatus;
  placedOn: Day;
  age0: number;
  placedCount: number;
  closedOn: Day | null;
  endAge: number | null;
  endOn: Day | null;
}

const hallFlock = (value: unknown): HallFlock => {
  const row = record(value, 'flock');
  return {
    id: str(row, 'id'),
    hallId: str(row, 'hall_id'),
    hallName: str(row, 'hall_name'),
    siteName: str(row, 'site_name'),
    kind: oneOf(row, 'kind', KINDS),
    status: oneOf(row, 'status', FLOCK_STATUSES),
    placedOn: str(row, 'placed_on'),
    age0: int(row, 'age0'),
    placedCount: int(row, 'placed_count'),
    closedOn: optStr(row, 'closed_on'),
    endAge: optInt(row, 'end_age'),
    endOn: optStr(row, 'end_on'),
  };
};

export interface DayIssue {
  issueId: string;
  docNo: string;
  itemId: string;
  name: string;
  costKind: CostKind;
  qty: Milli;
  baseUnit: BaseUnit;
  /** null: لتر بلا كثافة أو قطعة بلا وزن (يُعدّ ولا يُوزن). */
  kg: Milli | null;
}

export interface DayVaccine {
  vaccineId: string;
  name: string;
  color: number;
  ageDay: number;
  state: VaccineState;
  vaccinationId: string | null;
  issueId: string | null;
}

export interface MonthDay {
  on: Day;
  age: number | null;
  dead: number | null;
  culled: number | null;
  feedKg: Milli | null;
  note: string | null;
  issues: readonly DayIssue[];
  logs: readonly { id: string; name: string; dose: string | null }[];
  vaccines: readonly DayVaccine[];
}

export interface FlockMonth {
  flock: HallFlock;
  today: Day;
  month: Day;
  prev: boolean;
  next: boolean;
  can: { give: boolean; log: boolean; vaccinate: boolean; undoIssue: boolean };
  days: readonly MonthDay[];
  totals: { feedKg: Milli; dead: number; culled: number };
}

export function parseFlockMonth(value: unknown): FlockMonth {
  const json = record(value, 'flock_month');
  const can = record(json.can, 'can');
  const totals = record(json.totals, 'totals');
  return {
    flock: hallFlock(json.flock),
    today: str(json, 'today'),
    month: str(json, 'month'),
    prev: flag(json, 'prev'),
    next: flag(json, 'next'),
    can: { give: flag(can, 'give'), log: flag(can, 'log'), vaccinate: flag(can, 'vaccinate'), undoIssue: flag(can, 'undo_issue') },
    days: list(json.days, 'days').map((row) => ({
      on: str(row, 'on'),
      age: optInt(row, 'age'),
      dead: optInt(row, 'dead'),
      culled: optInt(row, 'culled'),
      feedKg: optScaled(row, 'feed_kg', 3),
      note: optStr(row, 'note'),
      issues: list(row.issues, 'issues').map((issue) => ({
        issueId: str(issue, 'issue_id'),
        docNo: str(issue, 'doc_no'),
        itemId: str(issue, 'item_id'),
        name: str(issue, 'name'),
        costKind: oneOf(issue, 'cost_kind', COST_KINDS),
        qty: scaled(issue, 'qty', 3),
        baseUnit: oneOf(issue, 'base_unit', UNITS),
        kg: optScaled(issue, 'kg', 3),
      })),
      logs: list(row.logs, 'logs').map((log) => ({ id: str(log, 'id'), name: str(log, 'name'), dose: optStr(log, 'dose') })),
      vaccines: list(row.vaccines, 'vaccines').map((vaccine) => ({
        vaccineId: str(vaccine, 'vaccine_id'),
        name: str(vaccine, 'name'),
        color: color(vaccine),
        ageDay: int(vaccine, 'age_day'),
        state: oneOf(vaccine, 'state', VACCINE_STATES),
        vaccinationId: optStr(vaccine, 'vaccination_id'),
        issueId: optStr(vaccine, 'issue_id'),
      })),
    })),
    totals: { feedKg: scaled(totals, 'feed_kg', 3), dead: int(totals, 'dead'), culled: int(totals, 'culled') },
  };
}

/** الشهر بأيّ يوم منه (الخادم يرجّع أوّله). */
export async function loadFlockMonth(flockId: string, month: Day): Promise<FlockMonth> {
  return parseFlockMonth(await call<unknown>('flock_month', { p_flock: flockId, p_month: month }));
}

export interface CycleReport {
  flock: HallFlock;
  today: Day;
  through: Day;
  birds: { placed: number; dead: number; culled: number; live: number; mortalityPct: bigint };
  feed: {
    lines: readonly { on: Day; docNo: string; itemName: string; qty: Milli; baseUnit: BaseUnit; kg: Milli | null; cumKg: Milli; value: Fils | null }[];
    byItem: readonly { itemId: string; name: string; qty: Milli; baseUnit: BaseUnit; kg: Milli | null }[];
    deliveredKg: Milli;
    consumedKg: Milli;
    remainingKg: Milli;
    unweighed: number;
  };
  medicines: readonly { on: Day; source: 'store' | 'log'; name: string; qty: Milli | null; baseUnit: BaseUnit | null; dose: string | null; docNo: string | null }[];
  vaccines: readonly { vaccineId: string; name: string; color: number; ageDay: number; dueOn: Day; state: VaccineState; doneOn: Day | null; docNo: string | null }[];
  /** null لغير أدوار الكلفة. */
  money: { feed: Fils; medicine: Fils; vaccine: Fils; other: Fils; total: Fils } | null;
}

export function parseCycleReport(value: unknown): CycleReport {
  const json = record(value, 'flock_cycle_report');
  const birds = record(json.birds, 'birds');
  const feed = record(json.feed, 'feed');
  const money = moneyBox(json);
  return {
    flock: hallFlock(json.flock),
    today: str(json, 'today'),
    through: str(json, 'through'),
    birds: {
      placed: int(birds, 'placed'),
      dead: int(birds, 'dead'),
      culled: int(birds, 'culled'),
      live: int(birds, 'live'),
      mortalityPct: scaled(birds, 'mortality_pct', 2),
    },
    feed: {
      lines: list(feed.lines, 'lines').map((row) => {
        const box = moneyBox(row);
        return {
          on: str(row, 'on'),
          docNo: str(row, 'doc_no'),
          itemName: str(row, 'item_name'),
          qty: scaled(row, 'qty', 3),
          baseUnit: oneOf(row, 'base_unit', UNITS),
          kg: optScaled(row, 'kg', 3),
          cumKg: scaled(row, 'cum_kg', 3),
          value: box ? optScaled(box, 'value', 2) : null,
        };
      }),
      byItem: list(feed.by_item, 'by_item').map((row) => ({
        itemId: str(row, 'item_id'),
        name: str(row, 'name'),
        qty: scaled(row, 'qty', 3),
        baseUnit: oneOf(row, 'base_unit', UNITS),
        kg: optScaled(row, 'kg', 3),
      })),
      deliveredKg: scaled(feed, 'delivered_kg', 3),
      consumedKg: scaled(feed, 'consumed_kg', 3),
      remainingKg: scaled(feed, 'remaining_kg', 3),
      unweighed: int(feed, 'unweighed'),
    },
    medicines: list(json.medicines, 'medicines').map((row) => ({
      on: str(row, 'on'),
      source: oneOf(row, 'source', ['store', 'log'] as const),
      name: str(row, 'name'),
      qty: optScaled(row, 'qty', 3),
      baseUnit: row.base_unit === null || row.base_unit === undefined ? null : oneOf(row, 'base_unit', UNITS),
      dose: optStr(row, 'dose'),
      docNo: optStr(row, 'doc_no'),
    })),
    vaccines: list(json.vaccines, 'vaccines').map((row) => ({
      vaccineId: str(row, 'vaccine_id'),
      name: str(row, 'name'),
      color: color(row),
      ageDay: int(row, 'age_day'),
      dueOn: str(row, 'due_on'),
      state: oneOf(row, 'state', VACCINE_STATES),
      doneOn: optStr(row, 'done_on'),
      docNo: optStr(row, 'doc_no'),
    })),
    money: money
      ? {
          feed: scaled(money, 'feed', 2),
          medicine: scaled(money, 'medicine', 2),
          vaccine: scaled(money, 'vaccine', 2),
          other: scaled(money, 'other', 2),
          total: scaled(money, 'total', 2),
        }
      : null,
  };
}

export async function loadCycleReport(flockId: string): Promise<CycleReport> {
  return parseCycleReport(await call<unknown>('flock_cycle_report', { p_flock: flockId }));
}
