import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { IdentityError, RejectedError, ZeroRowsError } from '../errors';
import type { OutboxOp, SendResult, Transport } from '../outbox';
import './constraints-flocks';
import { authed, call, classifyPostgrest, explained, send, updatedRows, type PostgrestFailure } from './core';

// حقول اللحم والبيض (المرحلة 2، النسخة الأولى بكلمة المالك 2026-10-31؛ الهجرة 0012_flocks_daily): القاعات كتابة مباشرة مثل المخازن،
// والأفواج والجولة والأوزان دوالّ (open_flock وsave_flock_day وrecord_flock_weight)، والقراءة من دالّتين بلا مال (flocks_overview
// وflock_detail). ملف كسول تستورده شاشات الحقول مباشرةً (write-guard PAGE_MODULES)، وبيه ناقل الطابور (flockDayTransport): الجولة
// الوحيدة اللي تدخل الطابور بلا نت (FOUNDATION ٥٧٨).

export class FlockShapeError extends Error {
  constructor(readonly field: string) {
    super(`flock_shape:${field}`);
    this.name = 'FlockShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new FlockShapeError(field);
  return value as Row;
};
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new FlockShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new FlockShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new FlockShapeError(field);
  return value;
};
const optInt = (row: Row, field: string): number | null => (row[field] === null || row[field] === undefined ? null : int(row, field));
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new FlockShapeError(field);
  return row[field] as boolean;
};
/** رقم عشري نصّاً من الخادم بمراتبه (العلف 3، النسبة 2، الوزن 1، FCR 3) ← عدد صحيح بوحدة 10⁻ˢ، أو null. */
const scaled = (row: Row, field: string, scale: number): bigint | null => {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, scale);
  if (value === null) throw new FlockShapeError(field);
  return toScale(value, scale);
};
const kindOf = (row: Row, field = 'kind'): FlockKind => {
  const value = row[field];
  if (value !== 'broiler' && value !== 'layer') throw new FlockShapeError(field);
  return value;
};

// ─── مفاتيح الجولة (0036، عقد الجزء D) بقراءة صارمة: الرقم العشري نصّ بأرقام غربية بلا فواصل (كورقة القاعة)، واليوم yyyy-mm-dd ────────────────
const WIRE_DECIMAL = /^-?[0-9]+(?:\.[0-9]+)?$/u;
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/u;
/** رقم عشري من السلك بمراتبه حتى scale، أو null للقيمة null؛ وغيرهما شكل غريب. */
const wire = (row: Row, field: string, scale: number): bigint | null => {
  if (row[field] === null) return null;
  const text = str(row, field);
  const value = WIRE_DECIMAL.test(text) ? parseDecimal(text, scale) : null;
  if (value === null) throw new FlockShapeError(field);
  return toScale(value, scale);
};
const wireRequired = (row: Row, field: string, scale: number): bigint => {
  const value = wire(row, field, scale);
  if (value === null) throw new FlockShapeError(field);
  return value;
};
const BASE_UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const pick = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  if (!allowed.includes(row[field] as T)) throw new FlockShapeError(field);
  return row[field] as T;
};
const unitOf = (row: Row, field: string): BaseUnit => pick(row, field, BASE_UNITS);
/** مفتاح أضافته 0036 لقارئ قائم: غيابه (خادم قبلها أو نسخة جهاز قديمة) null، ووجوده بشكله وإلّا رُفض. */
const since0036 = <T>(row: Row, field: string, read: (row: Row, field: string) => T): T | null => (row[field] === undefined ? null : read(row, field));

/**
 * خانات اليوم كما انحفظت: العلف بالآلاف (غرام)، والحرارة بالأعشار؛ null = ما انسجّلت. والماء (water_l) خارج الشاشات (كلمة المالك
 * 2026-11-11: الماء ثابت)، فعموده باقٍ في القاعدة ولا يُقرأ هنا؛ وناقل الطابور يرسل water_l لعملية قديمة تحمله كما هي.
 */
export interface DayValues {
  dead: number | null;
  culled: number | null;
  feedKg: bigint | null;
  tempMin: bigint | null;
  tempMax: bigint | null;
  eggsTotal: number | null;
  eggsCracked: number | null;
  eggsBroken: number | null;
  note: string | null;
}

export interface DayRow extends DayValues {
  onDate: Day;
  version: number;
  /**
   * 0036: «سُجّلت هلاكات اليوم» (الجولة تُدخلها مرّة ثمّ تتضلّل)، أو null: خادم قبل 0036 أو نسخة جهاز منه. والغائب يُقرأ في الجولة كما ملأته الهجرة
   * القائمة: سُجّلت إن كان في اليوم هلاكات.
   */
  deadEntered: boolean | null;
}

export function parseDayRow(value: unknown): DayRow {
  const row = record(value, 'day');
  return {
    onDate: str(row, 'on_date'),
    version: int(row, 'version'),
    deadEntered: since0036(row, 'dead_entered', flag),
    dead: optInt(row, 'dead'),
    culled: optInt(row, 'culled'),
    feedKg: scaled(row, 'feed_kg', 3),
    tempMin: scaled(row, 'temp_min', 1),
    tempMax: scaled(row, 'temp_max', 1),
    eggsTotal: optInt(row, 'eggs_total'),
    eggsCracked: optInt(row, 'eggs_cracked'),
    eggsBroken: optInt(row, 'eggs_broken'),
    note: optStr(row, 'note'),
  };
}

export interface FlockSummary {
  id: string;
  kind: FlockKind;
  breed: string | null;
  status: 'preparing' | 'active' | 'closed';
  version: number;
  placedOn: Day | null;
  placedCount: number | null;
  /** العمر عند التسكين بالأيام كما حُفظ (يرسله الخادم منذ 0012)؛ null لجواب بلا المفتاح. نافذة تعديل الفوج تبدأ منه. */
  ageDaysAtPlacement: number | null;
  ageDays: number | null;
  daysSincePlacement: number | null;
  deadTotal: number;
  culledTotal: number;
  live: number;
  liveStartToday: number;
  /** بالمئات (125 = 1.25٪). */
  mortalityPct: bigint | null;
  /** غرامات. */
  feedKgTotal: bigint;
  feedDays: number;
  feedSpanDays: number;
  /** avgG بالأعشار (18500 = 1,850.0 غرام). */
  lastWeight: { onDate: Day; sampleCount: number; avgG: bigint } | null;
  /** بالآلاف (1523 = 1.523)؛ null ما لم يُسجَّل علف كل يوم من التسكين لحد أمس (واليوم ويّاها إذا انسجّل علفه)، ووزن، وحيّ. */
  fcr: bigint | null;
  today: DayRow | null;
  eggsToday: number | null;
  /** بالمئات؛ null = ما انسجّل بيض اليوم («—» مو صفر، القاعدة 32). */
  hdepToday: bigint | null;
  rejectsPending: number;
  /** 0036 (الجولة): قناني غاز اليوم، أو null: لم يُسجَّل غاز اليوم (أو خادم قبل 0036). */
  gasToday: number | null;
  /** نسخة صفّ غاز اليوم، أو null: لا صفّ. */
  gasTodayVersion: number | null;
  /** علف اليوم المرسل لهذه القاعة بالكيلو (بالآلاف)، أو null: لم يُرسل علف اليوم (أو خادم قبل 0036). */
  feedTodayKg: Milli | null;
  /** علف اليوم لكلّ مادّة بوحدة أساسها، بترتيب أوّل إرسال؛ وخادم قبل 0036: []. */
  feedToday: FeedTodayLine[];
  /** مادّة آخر علف حيّ أُرسل لهذه القاعة (تُختار مسبقاً في الجولة)، أو null. */
  lastFeedItemId: string | null;
}

/** سطر «أُرسل اليوم» لمادّة: الكمية بوحدة أساسها بالآلاف. */
export interface FeedTodayLine {
  itemId: string;
  itemName: string;
  qty: Milli;
  unit: BaseUnit;
}

const STATUSES = ['preparing', 'active', 'closed'] as const;

/** مفاتيح الجولة في ملخّص الفوج (0036): الغياب كلّه null و[] (خادم قبلها)، والموجود بشكله. */
function roundKeys(row: Row): Pick<FlockSummary, 'gasToday' | 'gasTodayVersion' | 'feedTodayKg' | 'feedToday' | 'lastFeedItemId'> {
  const gasToday = since0036(row, 'gas_today', optInt) ?? null;
  if (gasToday !== null && (gasToday < 0 || gasToday > 1000)) throw new FlockShapeError('gas_today');
  const gasTodayVersion = since0036(row, 'gas_today_version', optInt) ?? null;
  if (gasTodayVersion !== null && gasTodayVersion < 1) throw new FlockShapeError('gas_today_version');
  // الغاز الممسوح يبقى صفّه بنسخة وعدد null (درس ABA)، والعدد بلا نسخة لا.
  if (gasToday !== null && gasTodayVersion === null) throw new FlockShapeError('gas_today_version');
  const feedTodayKg = since0036(row, 'feed_today_kg', (r, f) => wire(r, f, 3)) ?? null;
  if (feedTodayKg !== null && feedTodayKg < 0n) throw new FlockShapeError('feed_today_kg');
  const feedToday =
    since0036(row, 'feed_today', (r, f) =>
      list(r[f], f).map((line) => {
        const qty = wireRequired(line, 'qty', 3);
        if (qty <= 0n) throw new FlockShapeError('qty');
        return { itemId: str(line, 'item_id'), itemName: str(line, 'item_name'), qty, unit: unitOf(line, 'unit') };
      }),
    ) ?? [];
  return { gasToday, gasTodayVersion, feedTodayKg, feedToday, lastFeedItemId: since0036(row, 'last_feed_item_id', optStr) ?? null };
}

export function parseFlock(value: unknown): FlockSummary {
  const row = record(value, 'flock');
  const status = row.status;
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) throw new FlockShapeError('status');
  const weight = row.last_weight === null || row.last_weight === undefined ? null : record(row.last_weight, 'last_weight');
  return {
    id: str(row, 'id'),
    kind: kindOf(row),
    breed: optStr(row, 'breed'),
    status: status as FlockSummary['status'],
    version: int(row, 'version'),
    placedOn: optStr(row, 'placed_on'),
    placedCount: optInt(row, 'placed_count'),
    ageDaysAtPlacement: optInt(row, 'age_days_at_placement'),
    ageDays: optInt(row, 'age_days'),
    daysSincePlacement: optInt(row, 'days_since_placement'),
    deadTotal: int(row, 'dead_total'),
    culledTotal: int(row, 'culled_total'),
    live: int(row, 'live'),
    liveStartToday: int(row, 'live_start_today'),
    mortalityPct: scaled(row, 'mortality_pct', 2),
    feedKgTotal: scaled(row, 'feed_kg_total', 3) ?? 0n,
    feedDays: int(row, 'feed_days'),
    feedSpanDays: int(row, 'feed_span_days'),
    lastWeight: weight ? { onDate: str(weight, 'on_date'), sampleCount: int(weight, 'sample_count'), avgG: scaled(weight, 'avg_g', 1) ?? 0n } : null,
    fcr: scaled(row, 'fcr', 3),
    today: row.today === null || row.today === undefined ? null : parseDayRow(row.today),
    eggsToday: optInt(row, 'eggs_today'),
    hdepToday: scaled(row, 'hdep_today', 2),
    rejectsPending: optInt(row, 'rejects_pending') ?? 0,
    ...roundKeys(row),
  };
}

export interface HallView {
  id: string;
  name: string;
  capacity: number | null;
  version: number;
  flock: FlockSummary | null;
}

export interface SiteView {
  id: string;
  name: string;
  divisionId: string;
  kind: FlockKind;
  /** can('flock.manage'): «أضف قاعة» و«افتح فوجاً» تظهر بس معها، والمنع الحقيقي بالخادم. */
  canManage: boolean;
  halls: HallView[];
}

/** وحدة إرسال لمادّة علف: كم من وحدة الأساس فيها، بالمليون (factor_to_base بستّ مراتب). */
export interface FeedUnit {
  id: string;
  name: string;
  baseQty: bigint;
}

/**
 * علف في «رصيد العلف» (0036، flocks_overview.feed_items = أعلاف ورقة القاعة بلا last): «عندك» أكبر ما يأخذه إرسال واحد (أكبر مخزن علف واحد فيه
 * المادّة اليوم)، ووحداتها بترتيب الخادم (الكيس أوّلاً). بلا مال.
 */
export interface FeedItem {
  itemId: string;
  name: string;
  baseUnit: BaseUnit;
  /** بوحدة الأساس بالآلاف. */
  onHand: Milli;
  units: FeedUnit[];
}

function feedItemOf(row: Row): FeedItem {
  return {
    itemId: str(row, 'item_id'),
    name: str(row, 'name'),
    baseUnit: unitOf(row, 'base_unit'),
    onHand: wireRequired(row, 'on_hand', 3),
    units: list(row.units, 'units').map((unit) => {
      const baseQty = wireRequired(unit, 'base_qty', 6);
      if (baseQty <= 0n) throw new FlockShapeError('base_qty');
      return { id: str(unit, 'id'), name: str(unit, 'name'), baseQty };
    }),
  };
}

export interface FlocksOverview {
  /** يوم بغداد بالخادم (app_today) لحظة القراءة. */
  today: Day;
  sites: SiteView[];
  /** أعلاف «رصيد العلف» للجولة (0036)؛ وخادم قبل 0036 أو نسخة جهاز منه: []. */
  feedItems: FeedItem[];
}

export function parseOverview(value: unknown): FlocksOverview {
  const json = record(value, 'overview');
  return {
    today: str(json, 'today'),
    feedItems: since0036(json, 'feed_items', (row, field) => list(row[field], field).map(feedItemOf)) ?? [],
    sites: list(json.sites, 'sites').map((site) => ({
      id: str(site, 'id'),
      name: str(site, 'name'),
      divisionId: str(site, 'division_id'),
      kind: kindOf(site),
      canManage: flag(site, 'can_manage'),
      halls: list(site.halls, 'halls').map((hall) => ({
        id: str(hall, 'id'),
        name: str(hall, 'name'),
        capacity: optInt(hall, 'capacity'),
        version: int(hall, 'version'),
        flock: hall.flock === null || hall.flock === undefined ? null : parseFlock(hall.flock),
      })),
    })),
  };
}

/** جواب flocks_overview كما هو (JSON): الجهاز يحفظه للفتح بلا نت ويقراه بـparseOverview. */
export function loadOverviewJson(): Promise<unknown> {
  return call<unknown>('flocks_overview');
}

export async function loadOverview(): Promise<FlocksOverview> {
  return parseOverview(await loadOverviewJson());
}

export interface DayLine extends DayRow {
  liveStart: number;
  liveEnd: number;
  hdep: bigint | null;
  /** 0028: المباع بفاتورة يومه وفرق العدّ يومه (سبب نزول الحيّ غير النافق والمستبعد)؛ وخادم قبل 0028 بلا مفتاحيهما صفر. */
  sold: number;
  countDiff: number;
}

export interface FlockDetail {
  flock: FlockSummary & { hallId: string; hallName: string; siteId: string; siteName: string; closedOn: Day | null; closeNote: string | null };
  canManage: boolean;
  canSave: boolean;
  /** أحدث أوّلاً. */
  days: DayLine[];
  weights: { onDate: Day; sampleCount: number; avgG: bigint; version: number }[];
}

export function parseDetail(value: unknown): FlockDetail {
  const json = record(value, 'detail');
  const flock = record(json.flock, 'flock');
  return {
    flock: {
      ...parseFlock(flock),
      hallId: str(flock, 'hall_id'),
      hallName: str(flock, 'hall_name'),
      siteId: str(flock, 'site_id'),
      siteName: str(flock, 'site_name'),
      closedOn: optStr(flock, 'closed_on'),
      closeNote: optStr(flock, 'close_note'),
    },
    canManage: flag(json, 'can_manage'),
    canSave: flag(json, 'can_save'),
    days: list(json.days, 'days').map((row) => ({
      ...parseDayRow(row),
      liveStart: int(row, 'live_start'),
      liveEnd: int(row, 'live_end'),
      hdep: scaled(row, 'hdep', 2),
      sold: optInt(row, 'sold') ?? 0,
      countDiff: optInt(row, 'count_diff') ?? 0,
    })),
    weights: list(json.weights, 'weights').map((row) => ({ onDate: str(row, 'on_date'), sampleCount: int(row, 'sample_count'), avgG: scaled(row, 'avg_g', 1) ?? 0n, version: int(row, 'version') })),
  };
}

// ─── علف القاعة وسجلّ صرفها (0019) ─────────────────────────────────────────────────────────────────────────────
// flock_feed: المصروف للقاعة من المخزن والمستهلك المسجّل في الجولات والباقي، وسطر لكلّ صرف. تقرؤه شاشة الفوج (محفوظة) وصفحة الصرف (المخزن)،
// فهنا بأدوات هذا الملف لا في flockIssues (ما يُصرف والصرف وإلغاؤه، لحزمة المخزون وحدها). والمال يغيب مفتاحه لغير أدوار الكلفة، وخاناته قد
// تأتي null (درس WP7).

export type CostKind = 'feed' | 'medicine' | 'vaccine' | 'fuel' | 'other';
const COST_KINDS: readonly CostKind[] = ['feed', 'medicine', 'vaccine', 'fuel', 'other'];
const qty3 = (row: Row, field: string): bigint => {
  const value = scaled(row, field, 3);
  if (value === null) throw new FlockShapeError(field);
  return value;
};
const moneyOf = (row: Row): Row | null => (row.money === undefined || row.money === null ? null : record(row.money, 'money'));

export interface FeedIssue {
  id: string;
  docNo: string;
  issuedOn: Day;
  status: 'posted' | 'void';
  itemId: string;
  itemName: string;
  costKind: CostKind;
  qty: bigint;
  baseUnit: BaseUnit;
  warehouseId: string;
  warehouseName: string;
  voidedOn: Day | null;
  voidReason: string | null;
  /**
   * «ألغِ» لهذا الصرف بعينه (void ونطاق مخزنه وفوجه): مدير حقل وحده لا يلغي صرفاً من مخزن المعمل ولو ألغى غيره. مفتاح السطر اختياريّ (عقد
   * 0019 الأوّل بلاه)، وغيابه = لا إلغاء.
   */
  canVoid: boolean;
  /** null: المال مخفيّ عن هذا الدور؛ value بالفلس، وقد يأتي null. */
  money: { value: bigint | null } | null;
}

export interface FlockFeed {
  flockId: string;
  flockStatus: FlockSummary['status'];
  hallName: string;
  today: Day;
  /** مجموع العلف المصروف بالكيلوغرام بالآلاف (اللتر بلقطة كثافته، والقطعة خارجه). */
  issuedFeedKg: bigint;
  /** مجموع العلف المسجّل في الجولات اليومية. */
  consumedFeedKg: bigint;
  /**
   * «الباقي في القاعة» بتعريفه الواحد في كلّ الشاشات (مراجعة 0028 O2/M5: left_in_hall_kg): النازل والمنقول إليها − الراجع والمنقول منها والمحسوب مستهلَكاً
   * عند الإغلاق − المأكول، فالقاعة المغلقة صفر والفوج التالي يعدّ منقوله؛ وقد يكون سالباً (يُعرض كما هو). وخادم قبل 0028: remaining_feed_kg.
   */
  leftInHallKg: bigint;
  /** سطور علفه بلا كتلة (سائل بلا كثافة، أو قطعة بلا وزن قطعة) خارج الكيلو؛ وخادم قبل 0028: unweighed_feed_lines. */
  leftInHallUnweighed: number;
  /** الأحدث أوّلاً. */
  issues: FeedIssue[];
  more: boolean;
  /** void والفوج غير مغلق: عمود الإلغاء؛ و«ألغِ» لكلّ سطر من canVoid السطر نفسه. */
  canVoid: boolean;
  /** null لغير أدوار الكلفة. */
  money: { issuedValue: bigint | null } | null;
}

export function parseFlockFeed(value: unknown): FlockFeed {
  const json = record(value, 'flock_feed');
  const box = moneyOf(json);
  const old = json.left_in_hall_kg === undefined;
  const unweighed = int(json, old ? 'unweighed_feed_lines' : 'left_in_hall_unweighed');
  if (unweighed < 0) throw new FlockShapeError('unweighed_feed_lines');
  return {
    flockId: str(json, 'flock_id'),
    flockStatus: pick(json, 'flock_status', STATUSES),
    hallName: str(json, 'hall_name'),
    today: str(json, 'today'),
    issuedFeedKg: qty3(json, 'issued_feed_kg'),
    consumedFeedKg: qty3(json, 'consumed_feed_kg'),
    leftInHallKg: qty3(json, old ? 'remaining_feed_kg' : 'left_in_hall_kg'),
    leftInHallUnweighed: unweighed,
    issues: list(json.issues, 'issues').map((row) => {
      const money = moneyOf(row);
      return {
        id: str(row, 'id'),
        docNo: str(row, 'doc_no'),
        issuedOn: str(row, 'issued_on'),
        status: pick(row, 'status', ['posted', 'void'] as const),
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        costKind: pick(row, 'cost_kind', COST_KINDS),
        qty: qty3(row, 'qty'),
        baseUnit: pick(row, 'base_unit', BASE_UNITS),
        warehouseId: str(row, 'warehouse_id'),
        warehouseName: str(row, 'warehouse_name'),
        voidedOn: optStr(row, 'voided_on'),
        voidReason: optStr(row, 'void_reason'),
        canVoid: row.can_void === undefined ? false : flag(row, 'can_void'),
        money: money ? { value: scaled(money, 'value', 2) } : null,
      };
    }),
    more: flag(json, 'more'),
    canVoid: flag(json, 'can_void'),
    money: box ? { issuedValue: scaled(box, 'issued_value', 2) } : null,
  };
}

export async function loadFlockFeed(flockId: string): Promise<FlockFeed> {
  return parseFlockFeed(await call<unknown>('flock_feed', { p_flock: flockId }));
}

export async function loadFlockDetail(flockId: string): Promise<FlockDetail> {
  return parseDetail(await call<unknown>('flock_detail', { p_flock: flockId }));
}

// ─── القاعات: كتابة مباشرة (مثل المخازن) بـupdatedRows وبشرط النسخة ─────────────────────────────────────────────────────

type Raw = { data: unknown; error: PostgrestFailure | null; status: number };
type Failed = PostgrestFailure & { status: number };
const withStatus = (answer: Raw) => ({ data: answer.data as Row | Row[] | null, error: answer.error ? { ...answer.error, status: answer.status } : null });
const failed = (error: unknown): error is Failed => typeof error === 'object' && error !== null && typeof (error as Failed).status === 'number';

/** نفس written بـinventory.ts (ما ينستورد منه: حزمته مستثناة من التثبيت المسبق، والحقول بالتثبيت المسبق). */
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

export async function createHall(siteId: string, name: string, capacity: number | null): Promise<void> {
  await written(async (db) => updatedRows(withStatus(await db.from('halls').insert({ site_id: siteId, name: name.trim(), capacity }).select('id, version'))));
}

/** الاسم والسعة بشرط النسخة اللي انفتح عليها النموذج (صفر صفوف = تغيّرت بعده). */
export async function updateHall(id: string, version: number, name: string, capacity: number | null): Promise<void> {
  await written(async (db) => updatedRows(withStatus(await db.from('halls').update({ name: name.trim(), capacity }).eq('id', id).eq('version', version).select('id, version'))));
}

/** أرشفة القاعة (لا حذف أبداً)؛ قاعة بيها فوج شغّال ترفض (hall_in_use). */
export async function archiveHall(id: string, version: number): Promise<void> {
  await written(async (db) => updatedRows(withStatus(await db.from('halls').update({ archived_at: 'now' }).eq('id', id).eq('version', version).select('id, version'))));
}

// ─── الأفواج والأوزان: دوالّ بمرجع الجهاز ──────────────────────────────────────────────────────────────────────────────

export interface OpenFlockInput {
  hallId: string;
  placedOn: Day;
  placedCount: number;
  ageDays: number;
  breed: string;
}

/** فتح وتسكين بخطوة وحدة (النسخة الأولى: بلا كلفة أفراخ، chick_source = opening). يرجّع معرّف الفوج. */
export async function openFlock(input: OpenFlockInput, clientRef: string): Promise<string> {
  const answer = record(
    await call<unknown>('open_flock', {
      p_hall: input.hallId,
      p_placed_on: input.placedOn,
      p_placed_count: input.placedCount,
      p_age_days: input.ageDays,
      p_breed: input.breed.trim(),
      p_client_ref: clientRef,
    }),
    'open_flock',
  );
  return str(answer, 'flock_id');
}

/** وزن العيّنة ليوم (بنت بس، مو بالطابور): avgG بالأعشار. إعادة نفس اليوم تستبدله. */
export async function recordFlockWeight(flockId: string, day: Day, sampleCount: number, avgG: string, clientRef: string): Promise<void> {
  await call<unknown>('record_flock_weight', { p_flock: flockId, p_date: day, p_sample_count: sampleCount, p_avg_g: avgG, p_client_ref: clientRef });
}

// ─── الزيارات (0032): زيارة في اليوم بمعرّفها ونسختها، ومجموع اليوم صفّ flock_daily كما هو ───────────────────────────────────
// visit_json في كلّ جواب وقارئ (عقد 0032): العلف نصّ بثلاث مراتب، والنافق والمستبعد أعداد (0 لا null)، والمصدر visit أو day_total
// (من save_flock_day) أو legacy (التحويل)، وby اسم الكاتب أو null. يقرؤه ناقل الطابور (جواب save_flock_visit) وقارئ round_visits.

export type VisitSource = 'visit' | 'day_total' | 'legacy';
const VISIT_SOURCES: readonly VisitSource[] = ['visit', 'day_total', 'legacy'];

export interface FlockVisit {
  id: string;
  flockId: string;
  onDate: Day;
  /** وقت التسجيل على الجهاز (ISO كما أرسله الخادم). */
  recordedAt: string;
  dead: number;
  culled: number;
  /** بالآلاف (غرام)؛ null = بلا علف. */
  feedKg: bigint | null;
  eggsTotal: number | null;
  eggsCracked: number | null;
  eggsBroken: number | null;
  note: string | null;
  source: VisitSource;
  version: number;
  voided: boolean;
  by: string | null;
}

export function parseVisit(value: unknown): FlockVisit {
  const row = record(value, 'visit');
  const recordedAt = str(row, 'recorded_at');
  if (!Number.isFinite(Date.parse(recordedAt))) throw new FlockShapeError('recorded_at');
  const on = str(row, 'on');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(on)) throw new FlockShapeError('on');
  return {
    id: str(row, 'id'),
    flockId: str(row, 'flock_id'),
    onDate: on,
    recordedAt,
    dead: int(row, 'dead'),
    culled: int(row, 'culled'),
    feedKg: scaled(row, 'feed_kg', 3),
    eggsTotal: optInt(row, 'eggs_total'),
    eggsCracked: optInt(row, 'eggs_cracked'),
    eggsBroken: optInt(row, 'eggs_broken'),
    note: optStr(row, 'note'),
    source: pick(row, 'source', VISIT_SOURCES),
    version: int(row, 'version'),
    voided: flag(row, 'voided'),
    by: optStr(row, 'by'),
  };
}

/**
 * جواب save_flock_visit ← نتيجة الطابور: saved بزيارته (نسختها تُرفع لعمليات الزيارة نفسها اللاحقة) وصفّ يومها بعدها أو null، وparked،
 * وstale_visit بالزيارة كما هي في الخادم (ملغاة voided: true إن أُلغيت من جهاز آخر)، أو null: لا زيارة بهذا المعرّف فيه (لم تصل). شكل غريب يرمي
 * فتبقى العملية بالطابور.
 */
export function visitAnswer(value: unknown): SendResult {
  const answer = record(value, 'save_flock_visit');
  if (answer.status === 'saved') {
    const visit = parseVisit(answer.visit);
    // صفّ اليوم بعدها أو null (لا زيارة حيّة)؛ غيابه شكل غريب (parseDayRow يرمي).
    if (answer.day !== null) parseDayRow(answer.day);
    return { kind: 'saved', version: visit.version, visit: answer.visit, day: answer.day };
  }
  if (answer.status === 'parked') return { kind: 'parked', reason: parkReason(answer) };
  if (answer.status === 'stale_visit') {
    if (answer.server !== null) parseVisit(answer.server);
    return { kind: 'stale_visit', server: answer.server };
  }
  throw new FlockShapeError('status');
}

// ─── ناقل الطابور: save_flock_day وsave_flock_visit وset_flock_gas، وset_flock_dead وadd_flock_gas (0036) بمرجع العملية ─────────────────────

/** سبب الركن من جواب parked (flock_closed وout_of_scope وperiod_locked، وdate_too_old من خادم قبل 0035)، أو null بلا سبب. */
const parkReason = (answer: Row): string | null => (typeof answer.reason === 'string' && answer.reason !== '' ? answer.reason : null);

/** جواب save_flock_day ← نتيجة الطابور (saved وstale_day وparked)؛ شكل غريب يرمي فتبقى العملية بالطابور. */
export function dayAnswer(value: unknown): SendResult {
  const answer = record(value, 'save_flock_day');
  if (answer.status === 'saved') return { kind: 'saved', version: int(answer, 'version') };
  if (answer.status === 'parked') return { kind: 'parked', reason: parkReason(answer) };
  if (answer.status === 'stale_day') return { kind: 'stale_day', server: answer.server ?? null };
  throw new FlockShapeError('status');
}

/** غاز اليوم كما في جواب set_flock_gas: {on, cylinders, version}؛ شكل غريب يرمي. */
export function parseGas(value: unknown): { on: Day; cylinders: number | null; version: number } {
  const row = record(value, 'gas');
  const on = str(row, 'on');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(on)) throw new FlockShapeError('on');
  const cylinders = optInt(row, 'cylinders');
  if (cylinders !== null && (cylinders < 0 || cylinders > 1000)) throw new FlockShapeError('cylinders');
  const version = int(row, 'version');
  if (version < 1) throw new FlockShapeError('version');
  return { on, cylinders, version };
}

/** جواب set_flock_gas (0035) ← نتيجة الطابور: saved بنسخة صفّ الغاز، وstale_gas بقيمة الخادم، وparked بسببه؛ شكل غريب يرمي فتبقى العملية بالطابور. */
export function gasAnswer(value: unknown): SendResult {
  const answer = record(value, 'set_flock_gas');
  if (answer.status === 'saved') return { kind: 'saved', version: parseGas(answer.gas).version };
  if (answer.status === 'stale_gas') {
    parseGas(answer.server);
    return { kind: 'stale_gas', server: answer.server };
  }
  if (answer.status === 'parked') return { kind: 'parked', reason: parkReason(answer) };
  throw new FlockShapeError('status');
}

/**
 * جواب set_flock_dead (0036، عقد D2) ← نتيجة الطابور: saved بصفّ اليوم بعدها (نسخته لمجموع اليوم بعدها، كالزيارة)، وdead_recorded بصفّ اليوم كما هو
 * (سُجّلت هلاكاته قبلها برقم آخر: لم يُكتب شيء)، وparked بسببه. صارم: صفّ اليوم بعد الجواب «سُجّلت» دائماً؛ وشكل غريب يرمي فتبقى العملية بالطابور.
 */
export function deadAnswer(value: unknown): SendResult {
  const answer = record(value, 'set_flock_dead');
  if (answer.status === 'saved' || answer.status === 'dead_recorded') {
    const day = parseDayRow(answer.day);
    if (!DAY_TEXT.test(day.onDate) || day.deadEntered !== true) throw new FlockShapeError('dead_entered');
    return answer.status === 'saved' ? { kind: 'saved', version: day.version, day: answer.day } : { kind: 'dead_recorded', server: answer.day };
  }
  if (answer.status === 'parked') return { kind: 'parked', reason: parkReason(answer) };
  throw new FlockShapeError('status');
}

/**
 * جواب add_flock_gas (0036، عقد D3) ← نتيجة الطابور: saved بغاز اليوم بعد الإضافة (نسخته لتصحيح الورقة بعدها، وعدده قنينة على الأقلّ)، وparked بسببه؛ شكل
 * غريب يرمي فتبقى العملية بالطابور.
 */
export function gasAddAnswer(value: unknown): SendResult {
  const answer = record(value, 'add_flock_gas');
  if (answer.status === 'saved') {
    const gas = parseGas(answer.gas);
    if (gas.cylinders === null || gas.cylinders < 1) throw new FlockShapeError('cylinders');
    return { kind: 'saved', version: gas.version, gas: answer.gas };
  }
  if (answer.status === 'parked') return { kind: 'parked', reason: parkReason(answer) };
  throw new FlockShapeError('status');
}

/**
 * يرفع عملية جولة (p_queued = true: فوج انقفل أو قاعة طلعت من النطاق أو تاريخ صار قديماً ← parked بـflock_day_rejects بدل
 * الرفض، فالجهاز يبطّل الإعادة). الرفض المقصود rejected برمزه وتلميحه، والهويّة identity_rejected، والاشتراك المنتهي صنفه. فشل
 * الشبكة والمهلة والتزاحم يرمي: النتيجة مجهولة والطابور يحسمها بنفس المرجع.
 */
export async function sendFlockDay(op: OutboxOp): Promise<SendResult> {
  let answer: unknown;
  try {
    if (op.fn === 'set_flock_gas') {
      answer = await call<unknown>('set_flock_gas', {
        p_flock: op.flockId,
        p_on: op.day,
        p_cylinders: op.payload.cylinders,
        p_expected_version: op.baseVersion,
        p_client_ref: op.id,
        p_queued: true,
      });
    } else if (op.fn === 'set_flock_dead') {
      // هلاكات اليوم مرّة (0036): العدد كما كُتب، والمرجع معرّف العملية.
      answer = await call<unknown>('set_flock_dead', { p_flock: op.flockId, p_on: op.day, p_dead: op.payload.dead, p_client_ref: op.id, p_queued: true });
    } else if (op.fn === 'add_flock_gas') {
      // قناني أُرسلت الآن تُضاف إلى مجموع اليوم (0036): كلّ إضافة بمرجعها، فإعادتها لا تضاعفها.
      answer = await call<unknown>('add_flock_gas', { p_flock: op.flockId, p_on: op.day, p_add: op.payload.add, p_client_ref: op.id, p_queued: true });
    } else if (op.fn === 'save_flock_visit') {
      // الزيارة بمحتواها كاملاً: الإضافة (نسخة null)، والتعديل بنسختها، والإلغاء (p_void) بنسختها.
      const v = op.payload;
      answer = await call<unknown>('save_flock_visit', {
        p_visit: v.visitId,
        p_flock: op.flockId,
        p_date: op.day,
        p_recorded_at: v.recordedAt,
        p_dead: v.dead,
        p_culled: v.culled,
        p_feed_kg: v.feed_kg,
        p_eggs_total: v.eggs_total,
        p_eggs_cracked: v.eggs_cracked,
        p_eggs_broken: v.eggs_broken,
        p_note: v.note,
        p_base_version: op.baseVersion,
        p_void: v.void,
        p_client_ref: op.id,
        p_queued: true,
      });
    } else {
      const p = op.payload;
      answer = await call<unknown>('save_flock_day', {
        p_flock: op.flockId,
        p_date: op.day,
        p_dead: p.dead ?? null,
        p_culled: p.culled ?? null,
        p_feed_kg: p.feed_kg ?? null,
        p_water_l: p.water_l ?? null,
        p_temp_min: p.temp_min ?? null,
        p_temp_max: p.temp_max ?? null,
        p_eggs_total: p.eggs_total ?? null,
        p_eggs_cracked: p.eggs_cracked ?? null,
        p_eggs_broken: p.eggs_broken ?? null,
        p_note: p.note ?? null,
        p_base_version: op.baseVersion,
        p_client_ref: op.id,
        p_queued: true,
      });
    }
  } catch (error) {
    if (error instanceof IdentityError) return { kind: 'identity_rejected' };
    if (error instanceof RejectedError) return error.code === 'subscription_expired' ? { kind: 'subscription_expired' } : { kind: 'rejected', code: error.code, hint: error.hint };
    throw error;
  }
  switch (op.fn) {
    case 'set_flock_gas':
      return gasAnswer(answer);
    case 'set_flock_dead':
      return deadAnswer(answer);
    case 'add_flock_gas':
      return gasAddAnswer(answer);
    case 'save_flock_visit':
      return visitAnswer(answer);
    case 'save_flock_day':
      return dayAnswer(answer);
  }
}

export const flockDayTransport: Transport = {
  async currentUserId() {
    try {
      return (await authed()).userId;
    } catch { // swallow-ok: جلسة ما انعرفت = ماكو جلسة، فالطابور ما يرفع شي
      return null;
    }
  },
  send: sendFlockDay,
  // نفس المرجع ونفس الحقول = نفس الجواب المحفوظ (ref_claim)، أو تنفيذها الآن إذا الأولى ما وصلت: فالحسم بالمرجع هو الإرسال نفسه،
  // والطابور يرسل بعد ما يفحص الهويّة لصق الإرسال (null هنا = «اسأل بالإرسال»).
  lookup: async () => null,
};
