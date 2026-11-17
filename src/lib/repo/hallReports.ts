import type { Day } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import type { CostKind } from './flocks';
import { COUNT_SOURCES, HallsShapeError, VACCINE_COLORS, VACCINE_STATES, type CountSource, type DayIssue, type DayVaccine } from './halls';

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
  /**
   * يومٌ بدأ بطيور حيّة ينتظر جولة (مراجعة 0028 O7: expects_round): فوجٌ بيع كلّه قبله لا «لم تُسجَّل الجولة» له. وخادم قبله: كلّ يوم ينتظر جولة (كما
   * كان).
   */
  expectsRound: boolean;
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
  /** سطور العلف بلا وزن حتى اليوم (يومها وكلّ يوم بعده، DECISIONS 0019): خارج النازل التراكميّ. */
  feedGivenCumUnweighed: number;
  /**
   * «الباقي في القاعة» بتعريفه الواحد في كلّ الشاشات (مراجعة 0028 O2/M5: left_in_hall_kg): النازل والمنقول إليها − الراجع والمنقول منها والمحسوب
   * مستهلَكاً عند الإغلاق − المأكول، وقد يكون سالباً؛ وleftInHallUnweighed سطوره بلا كتلة (خارج الكيلو). وخادم قبل 0028: feed_left_kg
   * وfeed_given_cum_unweighed (النازل − المأكول).
   */
  leftInHallKg: Milli;
  leftInHallUnweighed: number;
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
  /**
   * 0028 (العقد §6): المباع يومها من الفواتير المرحّلة وصافيه، وفرق العدّ يومها، وطيور تذاكر الوزن غير الملغاة بلا فاتورة يومها، والعلف المنقول إليها
   * يومها والخارج منها عند الإغلاق (وسطوره بلا وزن يومها وحتى يومها). كلّها null من خادم قبل 0028 (لا صفر).
   */
  sold: number | null;
  soldNetKg: Milli | null;
  countDiff: number | null;
  ticketed: number | null;
  feedCarryInKg: Milli | null;
  feedOutKg: Milli | null;
  feedOutUnweighed: number | null;
  feedOutCumUnweighed: number | null;
  /** فروق العدّ الحيّة يومها بعددها وسببها ومصدرها (يدويّاً أو عند الإغلاق، مراجعة 0028 O3)؛ فارغ من خادم قبلها. */
  countDiffs: readonly DayCountDiff[];
}

/** فرق عدّ يومٍ بسببه ومصدره (COUNT_SOURCES في repo/halls). */
export interface DayCountDiff {
  birds: number;
  reason: string;
  source: CountSource;
}

/** 0028: علف منقول للدورة التالية معلَّق على قاعة فارغة (من دورة أُغلقت، حتى يُسكَّن فوجها التالي أو يُرجع إلى مخزن). */
export interface DayCarry {
  lineId: string;
  itemId: string;
  name: string;
  qty: Milli;
  baseUnit: BaseUnit;
  /** null: لتر بلا كثافة أو قطعة بلا وزن. */
  kg: Milli | null;
  closedOn: Day;
  fromFlockId: string;
}

export interface DayHall {
  hallId: string;
  hallName: string;
  kind: FlockKind;
  /** null: القاعة فارغة في ذلك اليوم. */
  flock: DayFlock | null;
  /** 0028: العلف المنقول المعلَّق عليها وهي فارغة (فارغ من خادم قبل 0028). */
  carry: readonly DayCarry[];
}

/** مجاميع الخادم: النافق والمستبعد من القاعات بجولة وحدها (rounds منها)، والمأكول من الأفواج بعلف مسجَّل وحدها (feedEatenFlocks). */
export interface DayTotals {
  halls: number;
  flocks: number;
  rounds: number;
  /** الأفواج التي تنتظر جولة يومها (بدأ يومها بطيور حيّة، مراجعة 0028 O7)؛ وخادم قبله: كلّ الأفواج. */
  roundsExpected: number;
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
  /** 0028: المباع وفرق العدّ وطيور التذاكر بلا فاتورة يومها؛ null من خادم قبل 0028. */
  sold: number | null;
  countDiff: number | null;
  ticketed: number | null;
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
    roundsExpected: int(row, row.rounds_expected === undefined ? 'flocks' : 'rounds_expected'),
    liveStart: int(row, 'live_start'),
    dead: optInt(row, 'dead'),
    culled: optInt(row, 'culled'),
    liveEnd: int(row, 'live_end'),
    feedEatenKg: optScaled(row, 'feed_eaten_kg', 3),
    feedEatenFlocks: int(row, 'feed_eaten_flocks'),
    feedGivenKg: scaled(row, 'feed_given_kg', 3),
    feedGivenUnweighed: int(row, 'feed_given_unweighed'),
    sold: optInt(row, 'sold'),
    countDiff: optInt(row, 'count_diff'),
    ticketed: optInt(row, 'ticketed'),
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
    expectsRound: row.expects_round === undefined ? true : flag(row, 'expects_round'),
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
    leftInHallKg: scaled(row, row.left_in_hall_kg === undefined ? 'feed_left_kg' : 'left_in_hall_kg', 3),
    leftInHallUnweighed: int(row, row.left_in_hall_unweighed === undefined ? 'feed_given_cum_unweighed' : 'left_in_hall_unweighed'),
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
    sold: optInt(row, 'sold'),
    soldNetKg: optScaled(row, 'sold_net_kg', 3),
    countDiff: optInt(row, 'count_diff'),
    ticketed: optInt(row, 'ticketed'),
    feedCarryInKg: optScaled(row, 'feed_carry_in_kg', 3),
    feedOutKg: optScaled(row, 'feed_out_kg', 3),
    feedOutUnweighed: optInt(row, 'feed_out_unweighed'),
    feedOutCumUnweighed: optInt(row, 'feed_out_cum_unweighed'),
    countDiffs: list(row.count_diffs ?? [], 'count_diffs').map((diff) => ({ birds: int(diff, 'birds'), reason: str(diff, 'reason'), source: oneOf(diff, 'source', COUNT_SOURCES) })),
  };
};

const carryOf = (value: unknown): DayCarry[] =>
  list(value ?? [], 'carry').map((row) => ({
    lineId: str(row, 'line_id'),
    itemId: str(row, 'item_id'),
    name: str(row, 'name'),
    qty: scaled(row, 'qty', 3),
    baseUnit: oneOf(row, 'base_unit', UNITS),
    kg: optScaled(row, 'kg', 3),
    closedOn: str(row, 'closed_on'),
    fromFlockId: str(row, 'from_flock_id'),
  }));

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
        carry: carryOf(hall.carry),
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

// ─── «منذ أن بدأنا» (halls_history، 0031) ───────────────────────────────────────────────────────────────────────────

// عقد 0031 (docs/plans/0031/contract-0031.md، كلمة المالك 2026-11-17): لكلّ نوع في النطاق (اللاحم ثمّ البيّاض) أيّام الشهر المطلوب يوماً بيوم (مجموع كلّ
// القاعات، بتعريف halls_day نفسه حرفاً)، وكلّ الأشهر من أوّل تسكين إلى شهر يوم الخادم، وسطر «منذ البداية» (مجموع الأشهر بالضبط)، وأحداث الشهر؛ وملاحظات
// المالك لأيّام الشهر (للمنشأة كلّها). بلا مال. والمحلّل صارم: أيّ شكل غريب HallsShapeError باسم خانته، والغائب null حيث يسمح العقد وحده (يومٌ بلا جولة
// نافقه null، ولا بيض للّاحم)، ومجاميع الأشهر و«منذ البداية» أرقام دائماً (null فيها تُعدّ صفراً بالخادم).

/** يوم بشكل YYYY-MM-DD (شهر 01–12 ويوم 01–31): بالشكل وحده كما في repo/dayBalance (لا isDay: جسمه في وحدة التواريخ المحفوظة). */
const DAY_SHAPE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const day = (row: Row, field: string): Day => {
  const value = str(row, field);
  if (!DAY_SHAPE.test(value)) throw new HallsShapeError(field);
  return value;
};
/** أوّل يوم في شهر (YYYY-MM-01). */
const monthStart = (row: Row, field: string): Day => {
  const value = day(row, field);
  if (!value.endsWith('-01')) throw new HallsShapeError(field);
  return value;
};
/** عدد صحيح غير سالب. */
const nat = (row: Row, field: string): number => {
  const value = int(row, field);
  if (value < 0) throw new HallsShapeError(field);
  return value;
};
const optNat = (row: Row, field: string): number | null => (row[field] === null || row[field] === undefined ? null : nat(row, field));

/** يومٌ من أيّام الشهر: مجموع الأفواج القائمة ذلك اليوم من النوع. */
export interface HistoryDay {
  on: Day;
  /** أفواج قائمة ذلك اليوم، ومنها بجولة مسجّلة، ومنها بدأ يومها بطيور حيّة (كـhalls_day). */
  flocks: number;
  rounds: number;
  roundsExpected: number;
  /** طيور سُكّنت ذلك اليوم. */
  placed: number;
  liveStart: number;
  /** null حين لا جولة في أيّ فوج ذلك اليوم (لا صفر). */
  dead: number | null;
  culled: number | null;
  /** المباع بفاتورة يومه، وفرق العدّ يومه بإشارته. */
  sold: number;
  countDiff: number;
  liveEnd: number;
  /** المأكول المسجّل في الجولات؛ null حين لا علف مسجّل في أيّ فوج. */
  feedKg: Milli | null;
  /** النازل الموزون، وسطوره بلا وزن (خارج الكيلو). */
  givenKg: Milli;
  givenUnweighed: number;
  /** البيّاض وحده: null للّاحم وحين لا بيض مسجّل؛ ونسبة الإنتاج بالمئات بمرتبتين. */
  eggsTotal: number | null;
  eggsBroken: number | null;
  hdep: bigint | null;
}

/** سطر شهر: مجموع أيّامه داخل المدّة [start, today]. */
export interface HistoryMonth {
  /** أوّل يوم في الشهر. */
  month: Day;
  days: number;
  placed: number;
  dead: number;
  culled: number;
  sold: number;
  countDiff: number;
  feedKg: Milli;
  givenKg: Milli;
  givenUnweighed: number;
  eggsTotal: number | null;
  eggsBroken: number | null;
  hdep: bigint | null;
  /** الحيّ آخر آخر يوم من الشهر داخل المدّة. */
  liveEnd: number;
  /** أفواج سُكّنت في الشهر، وأُغلقت فيه. */
  opened: number;
  closed: number;
}

/** «منذ البداية» حتى يوم الخادم: مجموع الأشهر بالضبط. */
export interface HistoryTotal {
  days: number;
  placed: number;
  dead: number;
  culled: number;
  sold: number;
  countDiff: number;
  feedKg: Milli;
  givenKg: Milli;
  givenUnweighed: number;
  eggsTotal: number | null;
  eggsBroken: number | null;
  hdep: bigint | null;
  /** الحيّ آخر يوم الخادم. */
  liveNow: number;
  opened: number;
  closed: number;
  /** قاعات استُعملت منذ البداية (لها فوج). */
  halls: number;
}

interface EventBase {
  on: Day;
  hall: string;
  site: string;
}

/** ما جرى في الشهر المطلوب: تسكين، وبيع (فواتير الطيور يومها للقاعة مجموعة)، وفرق عدّ، وتأشير لقاح، ووزن عيّنة (avgG بأعشار الغرام)، وإغلاق دورة. */
export type HistoryEvent =
  | (EventBase & { type: 'placed'; birds: number })
  | (EventBase & { type: 'sold'; birds: number; kg: Milli })
  | (EventBase & { type: 'count_diff'; birds: number })
  | (EventBase & { type: 'vaccine'; name: string })
  | (EventBase & { type: 'weight'; avgG: bigint })
  | (EventBase & { type: 'closed' });

export type HistoryEventType = HistoryEvent['type'];
export const HISTORY_EVENT_TYPES: readonly HistoryEventType[] = ['placed', 'sold', 'count_diff', 'vaccine', 'weight', 'closed'];

export interface HistoryKind {
  kind: FlockKind;
  /** أوّل تسكين لهذا النوع في النطاق. */
  start: Day;
  /** أيّام الشهر المطلوب داخل [start, today] تصاعدياً؛ فارغة إن لم يقع الشهر في المدّة. */
  days: readonly HistoryDay[];
  /** كلّ شهر من شهر start إلى شهر today تصاعدياً (لا يتأثّر بالشهر المطلوب). */
  months: readonly HistoryMonth[];
  total: HistoryTotal;
  events: readonly HistoryEvent[];
}

/** ملاحظة المالك ليوم: النصّ ونسخته (من عدّاد لا يتكرّر، ≥ 1)، والكتابة بشرط النسخة التي رآها الكاتب. */
export interface HallsNote {
  text: string;
  version: number;
}

export interface HallsDayNote extends HallsNote {
  on: Day;
}

export interface HallsHistory {
  /** يوم الخادم. */
  today: Day;
  /** أوّل يوم في الشهر المطلوب. */
  month: Day;
  /** شهر قبله فيه يوم من بداية أيّ نوع، والشهر قبل شهر يوم الخادم. */
  prev: boolean;
  next: boolean;
  /** النوع الذي له فوج في النطاق، اللاحم أوّلاً ثمّ البيّاض؛ فارغة بلا أيّ فوج. */
  kinds: readonly HistoryKind[];
  /** ملاحظات المالك لأيّام الشهر المطلوب تصاعدياً. */
  notes: readonly HallsDayNote[];
}

const historyDayOf = (row: Row): HistoryDay => ({
  on: day(row, 'on'),
  flocks: nat(row, 'flocks'),
  rounds: nat(row, 'rounds'),
  roundsExpected: nat(row, 'rounds_expected'),
  placed: nat(row, 'placed'),
  liveStart: nat(row, 'live_start'),
  dead: optNat(row, 'dead'),
  culled: optNat(row, 'culled'),
  sold: nat(row, 'sold'),
  countDiff: int(row, 'count_diff'),
  liveEnd: nat(row, 'live_end'),
  feedKg: optScaled(row, 'feed_kg', 3),
  givenKg: scaled(row, 'given_kg', 3),
  givenUnweighed: nat(row, 'given_unweighed'),
  eggsTotal: optNat(row, 'eggs_total'),
  eggsBroken: optNat(row, 'eggs_broken'),
  hdep: optScaled(row, 'hdep', 2),
});

/** ما يشترك فيه سطر الشهر و«منذ البداية». */
const sumsOf = (row: Row) => ({
  days: nat(row, 'days'),
  placed: nat(row, 'placed'),
  dead: nat(row, 'dead'),
  culled: nat(row, 'culled'),
  sold: nat(row, 'sold'),
  countDiff: int(row, 'count_diff'),
  feedKg: scaled(row, 'feed_kg', 3),
  givenKg: scaled(row, 'given_kg', 3),
  givenUnweighed: nat(row, 'given_unweighed'),
  eggsTotal: optNat(row, 'eggs_total'),
  eggsBroken: optNat(row, 'eggs_broken'),
  hdep: optScaled(row, 'hdep', 2),
  opened: nat(row, 'opened'),
  closed: nat(row, 'closed'),
});

const historyMonthOf = (row: Row): HistoryMonth => ({ month: monthStart(row, 'month'), ...sumsOf(row), liveEnd: nat(row, 'live_end') });

const historyTotalOf = (value: unknown): HistoryTotal => {
  const row = record(value, 'total');
  return { ...sumsOf(row), liveNow: nat(row, 'live_now'), halls: nat(row, 'halls') };
};

function historyEventOf(row: Row): HistoryEvent {
  const base: EventBase = { on: day(row, 'on'), hall: str(row, 'hall'), site: str(row, 'site') };
  const type = oneOf(row, 'type', HISTORY_EVENT_TYPES);
  switch (type) {
    case 'placed':
      return { ...base, type, birds: nat(row, 'birds') };
    case 'sold':
      return { ...base, type, birds: nat(row, 'birds'), kg: scaled(row, 'kg', 3) };
    case 'count_diff':
      return { ...base, type, birds: int(row, 'birds') };
    case 'vaccine':
      return { ...base, type, name: str(row, 'name') };
    case 'weight':
      return { ...base, type, avgG: scaled(row, 'avg_g', 1) };
    case 'closed':
      return { ...base, type };
  }
}

const notePart = (row: Row): HallsNote => {
  const version = int(row, 'version');
  if (version < 1) throw new HallsShapeError('version');
  return { text: str(row, 'text'), version };
};

/**
 * صفوف بترتيب تصاعديّ صارم بمفتاحها (الأيّام والأشهر والملاحظات): مفتاحٌ مكرّر صفّان لليوم نفسه في الجدول أو ملاحظتان ليوم واحد، فهو شكل غريب لا يُعرض.
 */
function ascending<T>(rows: T[], key: (row: T) => string, field: string): T[] {
  if (rows.some((row, index) => index > 0 && key(row) <= key(rows[index - 1] as T))) throw new HallsShapeError(field);
  return rows;
}

export function parseHallsHistory(value: unknown): HallsHistory {
  const json = record(value, 'halls_history');
  const kinds = list(json.kinds, 'kinds').map(
    (row): HistoryKind => ({
      kind: oneOf(row, 'kind', KINDS),
      start: day(row, 'start'),
      days: ascending(list(row.days, 'days').map(historyDayOf), (entry) => entry.on, 'days'),
      months: ascending(list(row.months, 'months').map(historyMonthOf), (entry) => entry.month, 'months'),
      total: historyTotalOf(row.total),
      events: list(row.events, 'events').map(historyEventOf),
    }),
  );
  // كلّ نوع مرّةً واحدة وبترتيبه (اللاحم ثمّ البيّاض): العرض قسمٌ لكلّ نوع، فنوعٌ مكرّر قسمان بمجموعين.
  ascending(kinds, (entry) => String(KINDS.indexOf(entry.kind)), 'kinds');
  return {
    today: day(json, 'today'),
    month: monthStart(json, 'month'),
    prev: flag(json, 'prev'),
    next: flag(json, 'next'),
    kinds,
    notes: ascending(
      list(json.notes, 'notes').map((row) => ({ on: day(row, 'on'), ...notePart(row) })),
      (entry) => entry.on,
      'notes',
    ),
  };
}

/**
 * month: أيّ يوم في الشهر المطلوب، أو null لشهر يوم الخادم؛ وشهرٌ بعد شهر يوم الخادم يُرفض future_month بتلميح الخادم. والتقرير اليوميّ يرسل أوّل شهر
 * يوم التقرير المعروض (يومٌ قاله الخادم)، فلا تختار ساعة الجهاز الشهر.
 */
export async function loadHallsHistory(month: Day | null): Promise<HallsHistory> {
  return parseHallsHistory(await call<unknown>('halls_history', { p_month: month }));
}

export interface HallsNoteResult {
  on: Day;
  /** null: لا ملاحظة لذلك اليوم بعد الحفظ (مُسحت أو لم تكن). */
  note: HallsNote | null;
}

export function parseHallsNote(value: unknown): HallsNoteResult {
  const json = record(value, 'set_halls_note');
  const note = optRecord(json.note, 'note');
  return { on: day(json, 'on'), note: note ? notePart(note) : null };
}

/**
 * ملاحظة المالك ليوم (halls_note.write: المالك والمدير): النصّ الفارغ يمسحها، وexpectedVersion ما رآه الكاتب (null = «لم أرَ ملاحظة»). الخادم يرجّع
 * الحال نفسها إن كانت تساوي الطلب (إعادة آمنة)، وإلّا note_changed إن تغيّرت عمّا رآه؛ ويرفض date_required وday_in_future وbad_note بتلميحه.
 */
export async function setHallsNote(on: Day, text: string, expectedVersion: number | null): Promise<HallsNoteResult> {
  return parseHallsNote(await call<unknown>('set_halls_note', { p_on: on, p_note: text, p_expected_version: expectedVersion }));
}
