import type { Day } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import type { CostKind } from './flocks';
import { HallsShapeError, VACCINE_COLORS, VACCINE_STATES, type DayIssue, type DayVaccine } from './halls';

// تقارير القاعات (0027، كلمة المالك 2026-11-12، docs/HALLS_REPORTS_PLAN.md التسليم ١): تقرير القاعات اليومي (halls_day: كلّ قاعة في نطاق القارئ
// ليوم يختاره، مجمَّعة بالحقل بمجاميعها) وقائمة الدورات (flock_cycles: كلّ دورات النطاق، القائمة والمغلقة). قراءة فقط وبلا مال. الأرقام بالسلك نصوص
// عشرية (الكيلو بالآلاف Milli، والنسبة بمرتبتين، ومعامل التحويل بثلاث، والوزن بالغرام بمرتبة)، والأعداد أعداد JSON؛ والقيمة الغائبة null لا صفر
// (يوم بلا جولة نافقه null)، فالمحلّل يقرأ الغياب null ولا يرفعه صفراً أبداً. وأشكال سطور الصرف واللقاحات هي أشكال flock_month نفسها (repo/halls).

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

const KINDS: readonly FlockKind[] = ['broiler', 'layer'];
const UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const COST_KINDS: readonly CostKind[] = ['feed', 'medicine', 'vaccine', 'fuel', 'other'];
/** فوج في التقريرين: سُكّن (placed_on ليس null)، فهو قائم أو مغلق. */
const CYCLE_STATUSES = ['active', 'closed'] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

const color = (row: Row): number => {
  const value = int(row, 'color');
  if (value < 0 || value >= VACCINE_COLORS) throw new HallsShapeError('color');
  return value;
};

// ─── تقرير القاعات اليومي (halls_day) ─────────────────────────────────────────────────────────────────────────────────

/** وزن عيّنة: avgG بأعشار الغرام (المرتبة الواحدة من الخادم). */
export interface DayWeight {
  sampleCount: number;
  avgG: bigint;
}

export interface LastWeight {
  onDate: Day;
  age: number;
  avgG: bigint;
}

export interface DayFlock {
  id: string;
  kind: FlockKind;
  status: CycleStatus;
  placedOn: Day;
  placedCount: number;
  age0: number;
  closedOn: Day | null;
  age: number;
  dayNo: number;
  /** صفّ الجولة لهذا اليوم موجود. */
  round: boolean;
  liveStart: number;
  /** null حين لا جولة (لا صفر). */
  dead: number | null;
  culled: number | null;
  liveEnd: number;
  deadCum: number;
  culledCum: number;
  /** بالمئات (مرتبتان)، أو null حين لا عدد مسكَّن. */
  mortalityCumPct: bigint | null;
  /** علف الجولة المأكول، null حين لا جولة أو لم يُكتب. */
  feedEatenKg: Milli | null;
  feedEatenCumKg: Milli;
  feedDays: number;
  feedSpan: number;
  /** النازل للقاعة هذا اليوم بالكيلو (الموزون وحده)، وfeedGivenUnweighed عدد سطوره بلا وزن. */
  feedGivenKg: Milli;
  feedGivenUnweighed: number;
  feedGivenCumKg: Milli;
  /** سطور العلف بلا وزن حتى اليوم (يومها وكلّ يوم بعده، DECISIONS 0019): خارج النازل التراكميّ والباقي. */
  feedGivenCumUnweighed: number;
  /** النازل التراكمي − المأكول التراكمي، وقد يكون سالباً. */
  feedLeftKg: Milli;
  /** وزن هذا اليوم، وآخر وزن حتى اليوم. */
  weight: DayWeight | null;
  lastWeight: LastWeight | null;
  /** معامل التحويل بثلاث مراتب، أو null حين تنقص مدخلاته. */
  fcr: bigint | null;
  eggsTotal: number | null;
  eggsBroken: number | null;
  eggsCracked: number | null;
  /** نسبة الإنتاج بمرتبتين (البيّاض وحده). */
  hdep: bigint | null;
  note: string | null;
  issues: readonly DayIssue[];
  logs: readonly { id: string; name: string; dose: string | null }[];
  vaccines: readonly DayVaccine[];
}

export interface DayHall {
  hallId: string;
  hallName: string;
  kind: FlockKind;
  /** null: القاعة فارغة في ذلك اليوم. */
  flock: DayFlock | null;
}

/** مجاميع الخادم: النافق والمستبعد من القاعات بجولة وحدها (rounds منها)، والمأكول من الأفواج بعلف مسجَّل وحدها (feedEatenFlocks). */
export interface DayTotals {
  halls: number;
  flocks: number;
  rounds: number;
  liveStart: number;
  /** null حين لا جولة في أيّ قاعة (rounds = 0). */
  dead: number | null;
  culled: number | null;
  liveEnd: number;
  /** null حين لا علف مسجَّل في أيّ فوج (feedEatenFlocks = 0). */
  feedEatenKg: Milli | null;
  feedEatenFlocks: number;
  feedGivenKg: Milli;
  /** سطور العلف بلا وزن في ذلك اليوم من قاعاته (خارج feedGivenKg). */
  feedGivenUnweighed: number;
}

export interface DaySite {
  id: string;
  name: string;
  halls: readonly DayHall[];
  totals: DayTotals;
}

export interface HallsDay {
  on: Day;
  today: Day;
  /** فوج في النطاق سُكّن قبل اليوم (للرجوع معنى). */
  prev: boolean;
  /** اليوم قبل اليوم الحاليّ. */
  next: boolean;
  sites: readonly DaySite[];
  totals: DayTotals;
}

const weightOf = (value: unknown): DayWeight | null => {
  const row = optRecord(value, 'weight');
  return row ? { sampleCount: int(row, 'sample_count'), avgG: scaled(row, 'avg_g', 1) } : null;
};

const lastWeightOf = (value: unknown): LastWeight | null => {
  const row = optRecord(value, 'last_weight');
  return row ? { onDate: str(row, 'on_date'), age: int(row, 'age'), avgG: scaled(row, 'avg_g', 1) } : null;
};

const totalsOf = (value: unknown): DayTotals => {
  const row = record(value, 'totals');
  return {
    halls: int(row, 'halls'),
    flocks: int(row, 'flocks'),
    rounds: int(row, 'rounds'),
    liveStart: int(row, 'live_start'),
    dead: optInt(row, 'dead'),
    culled: optInt(row, 'culled'),
    liveEnd: int(row, 'live_end'),
    feedEatenKg: optScaled(row, 'feed_eaten_kg', 3),
    feedEatenFlocks: int(row, 'feed_eaten_flocks'),
    feedGivenKg: scaled(row, 'feed_given_kg', 3),
    feedGivenUnweighed: int(row, 'feed_given_unweighed'),
  };
};

const dayFlockOf = (value: unknown): DayFlock | null => {
  const row = optRecord(value, 'flock');
  if (!row) return null;
  return {
    id: str(row, 'id'),
    kind: oneOf(row, 'kind', KINDS),
    status: oneOf(row, 'status', CYCLE_STATUSES),
    placedOn: str(row, 'placed_on'),
    placedCount: int(row, 'placed_count'),
    age0: int(row, 'age0'),
    closedOn: optStr(row, 'closed_on'),
    age: int(row, 'age'),
    dayNo: int(row, 'day_no'),
    round: flag(row, 'round'),
    liveStart: int(row, 'live_start'),
    dead: optInt(row, 'dead'),
    culled: optInt(row, 'culled'),
    liveEnd: int(row, 'live_end'),
    deadCum: int(row, 'dead_cum'),
    culledCum: int(row, 'culled_cum'),
    mortalityCumPct: optScaled(row, 'mortality_cum_pct', 2),
    feedEatenKg: optScaled(row, 'feed_eaten_kg', 3),
    feedEatenCumKg: scaled(row, 'feed_eaten_cum_kg', 3),
    feedDays: int(row, 'feed_days'),
    feedSpan: int(row, 'feed_span'),
    feedGivenKg: scaled(row, 'feed_given_kg', 3),
    feedGivenUnweighed: int(row, 'feed_given_unweighed'),
    feedGivenCumKg: scaled(row, 'feed_given_cum_kg', 3),
    feedGivenCumUnweighed: int(row, 'feed_given_cum_unweighed'),
    feedLeftKg: scaled(row, 'feed_left_kg', 3),
    weight: weightOf(row.weight),
    lastWeight: lastWeightOf(row.last_weight),
    fcr: optScaled(row, 'fcr', 3),
    eggsTotal: optInt(row, 'eggs_total'),
    eggsBroken: optInt(row, 'eggs_broken'),
    eggsCracked: optInt(row, 'eggs_cracked'),
    hdep: optScaled(row, 'hdep', 2),
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
  };
};

export function parseHallsDay(value: unknown): HallsDay {
  const json = record(value, 'halls_day');
  return {
    on: str(json, 'on'),
    today: str(json, 'today'),
    prev: flag(json, 'prev'),
    next: flag(json, 'next'),
    sites: list(json.sites, 'sites').map((site) => ({
      id: str(site, 'id'),
      name: str(site, 'name'),
      halls: list(site.halls, 'halls').map((hall) => ({
        hallId: str(hall, 'hall_id'),
        hallName: str(hall, 'hall_name'),
        kind: oneOf(hall, 'kind', KINDS),
        flock: dayFlockOf(hall.flock),
      })),
      totals: totalsOf(site.totals),
    })),
    totals: totalsOf(json.totals),
  };
}

/**
 * on: يومٌ بعينه، أو null لليوم الحاليّ: يوم الخادم (app_today()، 0027)، فالشاشة التي تتبع «اليوم» لا تختاره بساعة الجهاز وجوابها جوابُ ذلك اليوم حرفاً.
 * ولا يوم بعد اليوم الحاليّ (future_day): الرفض بتلميح الخادم.
 */
export async function loadHallsDay(on: Day | null): Promise<HallsDay> {
  return parseHallsDay(await call<unknown>('halls_day', { p_on: on }));
}

// ─── تقارير الدورات (flock_cycles) ─────────────────────────────────────────────────────────────────────────────────

export interface CycleRow {
  id: string;
  hallId: string;
  hallName: string;
  siteId: string;
  siteName: string;
  kind: FlockKind;
  status: CycleStatus;
  placedOn: Day;
  closedOn: Day | null;
  /** آخر يوم في الدورة: يوم الإغلاق، أو اليوم للقائمة. */
  through: Day;
  placedCount: number;
  age: number;
  days: number;
  live: number;
  mortalityPct: bigint | null;
}

export interface FlockCycles {
  today: Day;
  /** أكثر من الحدّ (500): المعروض أحدثها. */
  more: boolean;
  cycles: readonly CycleRow[];
}

export function parseFlockCycles(value: unknown): FlockCycles {
  const json = record(value, 'flock_cycles');
  return {
    today: str(json, 'today'),
    more: flag(json, 'more'),
    cycles: list(json.cycles, 'cycles').map((row) => ({
      id: str(row, 'id'),
      hallId: str(row, 'hall_id'),
      hallName: str(row, 'hall_name'),
      siteId: str(row, 'site_id'),
      siteName: str(row, 'site_name'),
      kind: oneOf(row, 'kind', KINDS),
      status: oneOf(row, 'status', CYCLE_STATUSES),
      placedOn: str(row, 'placed_on'),
      closedOn: optStr(row, 'closed_on'),
      through: str(row, 'through'),
      placedCount: int(row, 'placed_count'),
      age: int(row, 'age'),
      days: int(row, 'days'),
      live: int(row, 'live'),
      mortalityPct: optScaled(row, 'mortality_pct', 2),
    })),
  };
}

export async function loadFlockCycles(): Promise<FlockCycles> {
  return parseFlockCycles(await call<unknown>('flock_cycles'));
}
