import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Fils, Milli } from '../../domain/money';
import { ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import './constraints-halls';
import { parseCloseResult, type CloseResult } from './flockClose';
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

/** صرف تأشير لقاح مربوط: المادّة التي عرضتها الشاشة (الخادم يرفض vaccine_relinked إن رُبط اللقاح بغيرها بعد القراءة، مراجعة 0026 DB-1). */
export type VaccinationIssue = IssueGive & { itemId: string };

export type GiveLine =
  | ({ kind: 'issue'; flockId: string; itemId: string } & IssueGive)
  | { kind: 'log'; flockId: string; id: string; name: string; dose: string | null }
  | { kind: 'vaccination'; flockId: string; id: string; vaccineId: string; ageDay: number; issue: VaccinationIssue | null };

/** السطر بمفاتيح الخادم بالضبط (العقد)، فإعادة النداء بالمرجع نفسه ترسل النصّ نفسه حرفاً بحرف. */
export function giveLineJson(line: GiveLine): Record<string, unknown> {
  if (line.kind === 'issue') {
    return { kind: 'issue', flock_id: line.flockId, issue_id: line.issueId, line_id: line.lineId, item_id: line.itemId, warehouse_id: line.warehouseId, qty: decimalText(line.qty, 3) };
  }
  if (line.kind === 'log') return { kind: 'log', flock_id: line.flockId, id: line.id, name: line.name.trim(), dose: line.dose === null ? null : line.dose.trim() || null };
  const base: Record<string, unknown> = { kind: 'vaccination', flock_id: line.flockId, id: line.id, vaccine_id: line.vaccineId, age_day: line.ageDay };
  return line.issue
    ? { ...base, item_id: line.issue.itemId, issue_id: line.issue.issueId, line_id: line.issue.lineId, warehouse_id: line.issue.warehouseId, qty: decimalText(line.issue.qty, 3) }
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
  /** رقم صرف اللقاح المربوط (FI) حين أُشِّر به، وإلّا null. */
  docNo: string | null;
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
        docNo: optStr(vaccine, 'doc_no'),
      })),
    })),
    totals: { feedKg: scaled(totals, 'feed_kg', 3), dead: int(totals, 'dead'), culled: int(totals, 'culled') },
  };
}

/** الشهر بأيّ يوم منه (الخادم يرجّع أوّله). */
export async function loadFlockMonth(flockId: string, month: Day): Promise<FlockMonth> {
  return parseFlockMonth(await call<unknown>('flock_month', { p_flock: flockId, p_month: month }));
}

/** وزن عيّنة: avgG بأعشار الغرام (مرتبة واحدة، «280.0» ← 2800n). */
export interface SampleWeight {
  on: Day;
  age: number;
  avgG: bigint;
}

/**
 * يوم من أيّام الدورة (0027، العقد §2: كلّ يوم من التسكين إلى «حتى»، الأقدم أوّلاً). الجولة الغائبة: نافقها ومستبعدها وعلفها null (لا صفر)،
 * ولا تُنقص الحيّ. الكيلو بالآلاف (Milli)، والنسبة بمرتبتين، والوزن بأعشار الغرام؛ والباقي = النازل التراكميّ − المأكول التراكميّ (قد يكون سالباً).
 */
export interface CycleDay {
  on: Day;
  age: number;
  dayNo: number;
  round: boolean;
  liveStart: number;
  dead: number | null;
  culled: number | null;
  liveEnd: number;
  mortalityCumPct: bigint | null;
  feedEatenKg: Milli | null;
  feedEatenCumKg: Milli;
  feedGivenKg: Milli;
  feedGivenCumKg: Milli;
  /** سطور العلف بلا وزن في اليوم وحتى اليوم (خارج الكيلو والباقي)، وفي «حتى» = feed.unweighed. */
  feedGivenUnweighed: number;
  feedGivenCumUnweighed: number;
  feedLeftKg: Milli;
  weight: { sampleCount: number; avgG: bigint } | null;
  /** للبيّاض وحده (null للّاحم). */
  eggsTotal: number | null;
  hdep: bigint | null;
  note: string | null;
  /**
   * 0028: الطيور المباعة يومها (من الفواتير المرحّلة) وصافيها، وفرق العدّ يومها؛ null من خادم قبل 0028. بمفاتيح الخادم sold وsold_net_kg وcount_diff
   * (كمفاتيح الفوج في halls_day)، لا بأسماء أعمدة report_days الداخلية (sold_kg وadjust): كانت تُقرأ null دائماً فيختفي عمود «فرق العدّ».
   */
  sold: number | null;
  soldKg: Milli | null;
  adjust: number | null;
}

/**
 * أسبوع بعمر الطيور (الأسبوع n للأعمار 7(n−1)+1 إلى 7n، والعمر صفر في الأوّل). نافقه ومستبعده ونفوقه null حين لا جولة فيه، وعلفه null حين لم
 * يُسجَّل فيه علف؛ وfeedGPerBirdDay بأعشار الغرام، وfcr بالأجزاء من الألف في آخر يوم منه، وweight آخر عيّنة فيه.
 */
export interface CycleWeek {
  week: number;
  fromAge: number;
  toAge: number;
  fromOn: Day;
  toOn: Day;
  days: number;
  roundDays: number;
  dead: number | null;
  culled: number | null;
  mortalityPct: bigint | null;
  mortalityCumPct: bigint | null;
  liveEnd: number;
  feedEatenKg: Milli | null;
  feedGPerBirdDay: bigint | null;
  weight: SampleWeight | null;
  fcr: bigint | null;
}

/**
 * مؤشّرات الدورة في «حتى». كلّ مؤشّر ناقص المدخلات null (لا صفر)، والشاشة تقول سببه: fcr بقاعدة flock_summary (0012) واليوم = «حتى»، وepef
 * (مؤشّر الإنتاج) عدد صحيح. وما يحسبه الخادم من يوم «حتى» نفسه (العمر والحيّ والعلف وأيّامه) قد يأتي null إن لم يكن في التقرير يوم، فيُقرأ هنا
 * كذلك ولا يرمي.
 */
export interface CycleKpis {
  days: number;
  ageEnd: number | null;
  placed: number;
  dead: number | null;
  culled: number | null;
  live: number | null;
  mortalityPct: bigint | null;
  livabilityPct: bigint | null;
  feedGivenKg: Milli | null;
  feedEatenKg: Milli | null;
  feedLeftKg: Milli | null;
  feedDays: number | null;
  feedSpan: number | null;
  feedPerBirdKg: Milli | null;
  lastWeight: SampleWeight | null;
  fcr: bigint | null;
  epef: bigint | null;
  /**
   * 0028 (العقد §6): المباع من الفواتير وصافيه ومعدّل وزن البيع (كغم بثلاث مراتب) وعمر البيع (بمرتبة، مرجَّحاً بالطيور)، وفرق العدّ (يظهر وحده لا مع
   * النافق)، والعلف المنقول إليها من الدورة السابقة والخارج عند الإغلاق (راجعاً أو منقولاً) والصافي (null إن كان فيه سطر بلا وزن)، ومعامل التحويل
   * النهائيّ ومؤشّر الإنتاج النهائيّ للمغلقة وحدها. كلّها null من خادم قبل 0028 أو حين تنقص مدخلاتها.
   */
  soldBirds: number | null;
  soldNetKg: Milli | null;
  soldAvgKg: Milli | null;
  saleAge: bigint | null;
  countDiff: number | null;
  feedCarryInKg: Milli | null;
  feedOutKg: Milli | null;
  feedNetKg: Milli | null;
  fcrFinal: bigint | null;
  epefFinal: bigint | null;
}

export interface CycleDetail {
  days: readonly CycleDay[];
  weeks: readonly CycleWeek[];
  weights: readonly (SampleWeight & { sampleCount: number })[];
  kpis: CycleKpis;
}

const CYCLE_KEYS = ['days', 'weeks', 'weights', 'kpis'] as const;

const sampleWeight = (value: unknown, field: string): SampleWeight | null => {
  const row = optRecord(value, field);
  return row ? { on: str(row, 'on_date'), age: int(row, 'age'), avgG: scaled(row, 'avg_g', 1) } : null;
};

/**
 * مفاتيح 0027 الأربعة معاً أو لا شيء: خادم قبل 0027 لا يرسل أيّاً منها فـnull (الشاشة تعرض أقسامها القديمة)، وبعضها دون بعض خطأ شكل.
 */
function parseCycleDetail(json: Row): CycleDetail | null {
  const present = CYCLE_KEYS.filter((key) => json[key] !== undefined);
  if (present.length === 0) return null;
  const missing = CYCLE_KEYS.find((key) => json[key] === undefined);
  if (missing) throw new HallsShapeError(missing);
  const kpis = record(json.kpis, 'kpis');
  return {
    days: list(json.days, 'days').map((row) => {
      const weight = optRecord(row.weight, 'weight');
      return {
        on: str(row, 'on'),
        age: int(row, 'age'),
        dayNo: int(row, 'day_no'),
        round: flag(row, 'round'),
        liveStart: int(row, 'live_start'),
        dead: optInt(row, 'dead'),
        culled: optInt(row, 'culled'),
        liveEnd: int(row, 'live_end'),
        mortalityCumPct: optScaled(row, 'mortality_cum_pct', 2),
        feedEatenKg: optScaled(row, 'feed_eaten_kg', 3),
        feedEatenCumKg: scaled(row, 'feed_eaten_cum_kg', 3),
        feedGivenKg: scaled(row, 'feed_given_kg', 3),
        feedGivenCumKg: scaled(row, 'feed_given_cum_kg', 3),
        feedGivenUnweighed: int(row, 'feed_given_unweighed'),
        feedGivenCumUnweighed: int(row, 'feed_given_cum_unweighed'),
        feedLeftKg: scaled(row, 'feed_left_kg', 3),
        weight: weight ? { sampleCount: int(weight, 'sample_count'), avgG: scaled(weight, 'avg_g', 1) } : null,
        eggsTotal: optInt(row, 'eggs_total'),
        hdep: optScaled(row, 'hdep', 2),
        note: optStr(row, 'note'),
        sold: optInt(row, 'sold'),
        soldKg: optScaled(row, 'sold_net_kg', 3),
        adjust: optInt(row, 'count_diff'),
      };
    }),
    weeks: list(json.weeks, 'weeks').map((row) => ({
      week: int(row, 'week'),
      fromAge: int(row, 'from_age'),
      toAge: int(row, 'to_age'),
      fromOn: str(row, 'from_on'),
      toOn: str(row, 'to_on'),
      days: int(row, 'days'),
      roundDays: int(row, 'round_days'),
      dead: optInt(row, 'dead'),
      culled: optInt(row, 'culled'),
      mortalityPct: optScaled(row, 'mortality_pct', 2),
      mortalityCumPct: optScaled(row, 'mortality_cum_pct', 2),
      liveEnd: int(row, 'live_end'),
      feedEatenKg: optScaled(row, 'feed_eaten_kg', 3),
      feedGPerBirdDay: optScaled(row, 'feed_g_per_bird_day', 1),
      weight: sampleWeight(row.weight, 'weight'),
      fcr: optScaled(row, 'fcr', 3),
    })),
    weights: list(json.weights, 'weights').map((row) => ({
      on: str(row, 'on_date'),
      age: int(row, 'age'),
      sampleCount: int(row, 'sample_count'),
      avgG: scaled(row, 'avg_g', 1),
    })),
    kpis: {
      days: int(kpis, 'days'),
      ageEnd: optInt(kpis, 'age_end'),
      placed: int(kpis, 'placed'),
      dead: optInt(kpis, 'dead'),
      culled: optInt(kpis, 'culled'),
      live: optInt(kpis, 'live'),
      mortalityPct: optScaled(kpis, 'mortality_pct', 2),
      livabilityPct: optScaled(kpis, 'livability_pct', 2),
      feedGivenKg: optScaled(kpis, 'feed_given_kg', 3),
      feedEatenKg: optScaled(kpis, 'feed_eaten_kg', 3),
      feedLeftKg: optScaled(kpis, 'feed_left_kg', 3),
      feedDays: optInt(kpis, 'feed_days'),
      feedSpan: optInt(kpis, 'feed_span'),
      feedPerBirdKg: optScaled(kpis, 'feed_per_bird_kg', 3),
      lastWeight: sampleWeight(kpis.last_weight, 'last_weight'),
      fcr: optScaled(kpis, 'fcr', 3),
      epef: optScaled(kpis, 'epef', 0),
      soldBirds: optInt(kpis, 'sold_birds'),
      soldNetKg: optScaled(kpis, 'sold_net_kg', 3),
      soldAvgKg: optScaled(kpis, 'sold_avg_kg', 3),
      saleAge: optScaled(kpis, 'sale_age', 1),
      countDiff: optInt(kpis, 'count_diff'),
      feedCarryInKg: optScaled(kpis, 'feed_carry_in_kg', 3),
      feedOutKg: optScaled(kpis, 'feed_out_kg', 3),
      feedNetKg: optScaled(kpis, 'feed_net_kg', 3),
      fcrFinal: optScaled(kpis, 'fcr_final', 3),
      epefFinal: optScaled(kpis, 'epef_final', 0),
    },
  };
}

/** 0028: تذاكر الدورة (غير الملغاة) وفواتيرها: المباع من الفواتير المرحّلة، وpendingBirds طيور تذاكر بلا فاتورة. */
export interface CycleSales {
  tickets: readonly { ticketId: string; ticketNo: string | null; status: 'draft' | 'done' | 'void'; onDate: Day; birds: number | null; netKg: Milli | null; avgKg: Milli | null; invoiced: boolean; docNo: string | null }[];
  birds: number;
  netKg: Milli;
  avgKg: Milli | null;
  pendingBirds: number;
}

const cycleSales = (value: unknown): CycleSales | null => {
  const json = optRecord(value, 'sales');
  if (!json) return null;
  return {
    tickets: list(json.tickets, 'tickets').map((row) => ({
      ticketId: str(row, 'ticket_id'),
      ticketNo: optStr(row, 'ticket_no'),
      status: oneOf(row, 'status', ['draft', 'done', 'void'] as const),
      onDate: str(row, 'on_date'),
      birds: optInt(row, 'birds'),
      netKg: optScaled(row, 'net_kg', 3),
      avgKg: optScaled(row, 'avg_kg', 3),
      invoiced: flag(row, 'invoiced'),
      docNo: optStr(row, 'doc_no'),
    })),
    birds: int(json, 'birds'),
    netKg: scaled(json, 'net_kg', 3),
    avgKg: optScaled(json, 'avg_kg', 3),
    pendingBirds: int(json, 'pending_birds'),
  };
};

/** 0028: علف منقول إلى هذه الدورة من الدورة السابقة في القاعة. */
export interface CarryIn {
  lineId: string;
  itemId: string;
  name: string;
  qty: Milli;
  baseUnit: BaseUnit;
}

export interface CycleReport {
  flock: HallFlock;
  today: Day;
  through: Day;
  /** sold وsoldNetKg وcountDiff وcountReason من 0028 (null من خادم قبله): المباع من الفواتير، وفرق العدّ بسببه وحده لا مع النافق. */
  birds: { placed: number; dead: number; culled: number; live: number; mortalityPct: bigint; sold: number | null; soldNetKg: Milli | null; countDiff: number | null; countReason: string | null };
  feed: {
    lines: readonly { on: Day; docNo: string; itemName: string; qty: Milli; baseUnit: BaseUnit; kg: Milli | null; cumKg: Milli; value: Fils | null }[];
    /** kg مجموع الموزون من سطور المادّة (null حين لا موزون فيها)، وunweighed عدد سطورها بلا وزن (مراجعة 0026 C). */
    byItem: readonly { itemId: string; name: string; qty: Milli; baseUnit: BaseUnit; kg: Milli | null; unweighed: number }[];
    deliveredKg: Milli;
    consumedKg: Milli;
    remainingKg: Milli;
    unweighed: number;
  };
  medicines: readonly { on: Day; source: 'store' | 'log'; name: string; qty: Milli | null; baseUnit: BaseUnit | null; dose: string | null; docNo: string | null }[];
  vaccines: readonly { vaccineId: string; name: string; color: number; ageDay: number; dueOn: Day; state: VaccineState; doneOn: Day | null; docNo: string | null }[];
  /**
   * null لغير أدوار الكلفة. ومن 0028 (null من خادم قبله): إيراد الفواتير المرحّلة، وقيمة ما رجع إلى المخازن، وما نُقل إليها من الدورة السابقة وما
   * نُقل منها للتالية؛ والبنود صافية بعد الراجع والمنقول (كلفة الفوج نفسها).
   */
  money: { feed: Fils; medicine: Fils; vaccine: Fils; other: Fils; total: Fils; revenue: Fils | null; returned: Fils | null; carriedIn: Fils | null; carriedOut: Fils | null } | null;
  /** 0027: الأيّام والأسابيع والأوزان والمؤشّرات (بلا مال)؛ null من خادم قبل 0027. */
  cycle: CycleDetail | null;
  /** 0028: التذاكر والفواتير؛ null من خادم قبل 0028. */
  sales: CycleSales | null;
  /** 0028: الإغلاق (بلا مال)، وسطور العلف المنقول المعلَّق بمخازن إرجاعها؛ null للقائمة. */
  close: CloseResult | null;
  carryIn: readonly CarryIn[];
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
      sold: optInt(birds, 'sold'),
      soldNetKg: optScaled(birds, 'sold_net_kg', 3),
      countDiff: optInt(birds, 'count_diff'),
      countReason: optStr(birds, 'count_reason'),
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
        unweighed: int(row, 'unweighed'),
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
          revenue: optScaled(money, 'revenue', 2),
          returned: optScaled(money, 'returned', 2),
          carriedIn: optScaled(money, 'carried_in', 2),
          carriedOut: optScaled(money, 'carried_out', 2),
        }
      : null,
    cycle: parseCycleDetail(json),
    sales: cycleSales(json.sales),
    close: json.close === null || json.close === undefined ? null : parseCloseResult(json.close, 'close'),
    carryIn: list(json.carry_in ?? [], 'carry_in').map((row) => ({ lineId: str(row, 'line_id'), itemId: str(row, 'item_id'), name: str(row, 'name'), qty: scaled(row, 'qty', 3), baseUnit: oneOf(row, 'base_unit', UNITS) })),
  };
}

export async function loadCycleReport(flockId: string): Promise<CycleReport> {
  return parseCycleReport(await call<unknown>('flock_cycle_report', { p_flock: flockId }));
}
