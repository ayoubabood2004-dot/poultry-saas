import { addDays, type Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import { roundHalfAway, type Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';

// «القاعة كالورقة» (طلب المالك 2026-11-21 بصورة ورقته «هلاكات قاعة (7)»، عقد 0034/0035 الجزء B4، docs/HALLS_SHEET_PLAN.md): قارئ الورقة hall_sheet
// (صفّ لكلّ يوم من التسكين حتى through، والمجاميع والخلاصة من الخادم، وأعلاف «رصيد العلف» والمركون من الأجهزة)، وإرسال العلف من «رصيد العلف» ليوم بعينه
// (send_flock_feed: صرف حقيقيّ بتاريخ التسجيل يُعرض في يومه)، وإلغاؤه (void_flock_issue نفسه، هنا لا من flockIssues: تلك حزمة المخزون، ونداؤها من حزمة
// القاعات كان يفصل حزمة مشتركة يحفظها التثبيت المسبق)، والقرار على المركون (decide_flock_reject). المحلّل صارم: كلّ مفتاح بنوعه، والأرقام العشرية نصوص
// بأرقام غربية بلا فواصل، والغياب null لا صفر؛ وشكل غريب يرمي HallSheetShapeError فلا تُعرض ورقة ناقصة. ملف كسول تستورده صفحات القاعات وحدها.

export class HallSheetShapeError extends Error {
  constructor(readonly field: string) {
    super(`hall_sheet_shape:${field}`);
    this.name = 'HallSheetShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HallSheetShapeError(field);
  return value as Row;
};
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new HallSheetShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new HallSheetShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null ? null : str(row, field));
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const day = (row: Row, field: string): Day => {
  const value = str(row, field);
  if (!DAY.test(value)) throw new HallSheetShapeError(field);
  return value;
};
const optDay = (row: Row, field: string): Day | null => (row[field] === null ? null : day(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new HallSheetShapeError(field);
  return value;
};
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new HallSheetShapeError(field);
  return row[field] as boolean;
};
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  if (!allowed.includes(row[field] as T)) throw new HallSheetShapeError(field);
  return row[field] as T;
};
/** رقم عشري من السلك: أرقام غربية بنقطة عشرية بلا فواصل ولا مسافات، بمراتبه حتى scale ← عدد صحيح بوحدة 10⁻ˢ. */
const WIRE_DECIMAL = /^-?[0-9]+(?:\.[0-9]+)?$/u;
const optScaled = (row: Row, field: string, scale: number): bigint | null => {
  if (row[field] === null) return null;
  const text = str(row, field);
  const value = WIRE_DECIMAL.test(text) ? parseDecimal(text, scale) : null;
  if (value === null) throw new HallSheetShapeError(field);
  return toScale(value, scale);
};
const scaled = (row: Row, field: string, scale: number): bigint => {
  const value = optScaled(row, field, scale);
  if (value === null) throw new HallSheetShapeError(field);
  return value;
};
/** عدد غير سالب (الطيور والقناني والبيض). */
const count = (row: Row, field: string): number => {
  const value = int(row, field);
  if (value < 0) throw new HallSheetShapeError(field);
  return value;
};
const optCount = (row: Row, field: string): number | null => (row[field] === null ? null : count(row, field));
/**
 * مفتاح أضافته مراجعة 0035 للعقد (نسخة المركون، والمنقول والمرتجع، وصافي العلف): غيابه null (قارئ قبلها)، ووجوده بشكله وإلّا رُفض كغيره.
 */
const added = <T>(row: Row, field: string, read: (row: Row, field: string) => T): T | null => (row[field] === undefined ? null : read(row, field));
const addedKg = (row: Row, field: string): Milli | null => {
  const value = added(row, field, (r, f) => optScaled(r, f, 3));
  if (value !== null && value < 0n) throw new HallSheetShapeError(field);
  return value;
};

const KINDS: readonly FlockKind[] = ['broiler', 'layer'];
const UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const STATUSES = ['preparing', 'active', 'closed'] as const;
export type SheetStatus = (typeof STATUSES)[number];

export interface SheetFeedLine {
  issueId: string;
  docNo: string;
  itemId: string;
  itemName: string;
  /** بوحدة أساس المادّة، بالآلاف. */
  qty: Milli;
  unit: BaseUnit;
  /** يوم خروجه من المخزن (يوم التسجيل)؛ وقد يكون بعد يوم الصفّ (علف يوم فات، جواب المالك 2026-11-21). */
  issuedOn: Day;
  canVoid: boolean;
}

export interface SheetDay {
  on: Day;
  age: number;
  dayNo: number;
  /** الهلاكات: النافق والمستبعد القديم معاً (المستبعد خرج من الشاشات). */
  dead: number;
  /** المستبعد القديم داخل dead: تعديل الهلاكات يصفّره (p_culled = 0). */
  culled: number;
  /** نسخة صفّ اليوم (flock_daily)، أو null: لا صفّ بعد. */
  dayVersion: number | null;
  note: string | null;
  gas: number | null;
  gasVersion: number | null;
  /** العلف المرسل لهذا اليوم بالكيلو (بالآلاف)، أو null: لا علف. ويوم التسكين يشمل المنقول من الوجبة السابقة (carryInKg). */
  feedKg: Milli | null;
  /** المنقول من الوجبة السابقة إلى هذه القاعة (يوم التسكين وحده)، داخل feedKg؛ أو null. */
  carryInKg: Milli | null;
  /** يوم الإغلاق: ما رُدّ من القاعة (إلى المخزن ومنقولاً للوجبة التالية)؛ أو null. */
  feedBackKg: Milli | null;
  feed: SheetFeedLine[];
  eggsTotal: number | null;
  eggsCracked: number | null;
  eggsBroken: number | null;
  soldBirds: number;
  soldNetKg: Milli | null;
  liveEnd: number;
}

export interface SheetTotals {
  dead: number;
  gas: number;
  feedKg: Milli;
  /** المرتجع والمنقول يوم الإغلاق؛ null من قارئ قبل مراجعة 0035 أو بلا شيء. */
  feedBackKg: Milli | null;
  soldBirds: number;
  soldNetKg: Milli | null;
  eggsTotal: number | null;
}

export interface SheetSummary {
  placed: number;
  dead: number;
  /** بالمئات (64 = 0.64٪). */
  mortalityPct: bigint;
  live: number;
  feedKg: Milli;
  /** أكياس بالآلاف حين كان كلّ صرف بكيس واحد الحجم، وإلّا null. */
  feedBags: Milli | null;
  /** المرتجع إلى المخزن والمنقول للوجبة التالية (null: لا شيء). */
  feedBackKg: Milli | null;
  /** صافي العلف = المرسل − المرتجع والمنقول. */
  feedNetKg: Milli;
  gas: number;
  soldBirds: number;
  soldNetKg: Milli | null;
  /** كيلو بالآلاف. */
  avgWeightKg: Milli | null;
  /** معامل التحويل على صافي العلف (صافي العلف ÷ صافي المباع)، بالآلاف. */
  fcr: bigint | null;
}

export interface SheetUnit {
  id: string;
  name: string;
  /** كم من وحدة الأساس في هذه الوحدة، بالمليون (factor_to_base بستّ مراتب). */
  baseQty: bigint;
}

export interface SheetFeedItem {
  itemId: string;
  name: string;
  baseUnit: BaseUnit;
  onHand: Milli;
  units: SheetUnit[];
  /** مادّة آخر صرف حيّ لهذه القاعة: تُختار مسبقاً. */
  last: boolean;
}

export interface SheetReject {
  id: string;
  on: Day;
  reason: string;
  createdAt: string;
  payload: Record<string, unknown>;
  /** مرجع العملية المركونة (client_ref) إن أرسله الخادم، وإلّا null. */
  clientRef: string | null;
  /** نسخة المركون كما عُرض: القرار يُرسل بها (decide_flock_reject)، فمركون تغيّر بعد عرضه لا يُقرَّر فيه بما لم يُرَ. */
  version: number | null;
}

export interface SheetFlock {
  id: string;
  hallId: string;
  hallName: string;
  siteName: string;
  kind: FlockKind;
  status: SheetStatus;
  placedOn: Day;
  age0: number;
  placedCount: number;
  closedOn: Day | null;
  endOn: Day | null;
  endAge: number | null;
}

export interface HallSheet {
  /** يوم الخادم (app_today) لحظة القراءة. */
  today: Day;
  flock: SheetFlock;
  canWrite: boolean;
  through: Day;
  /** بترتيب الأيام من التسكين حتى through، يوماً بيوم. */
  days: SheetDay[];
  totals: SheetTotals;
  summary: SheetSummary;
  feedItems: SheetFeedItem[];
  rejects: SheetReject[];
}

function feedLineOf(row: Row): SheetFeedLine {
  const qty = scaled(row, 'qty', 3);
  if (qty <= 0n) throw new HallSheetShapeError('qty');
  return {
    issueId: str(row, 'issue_id'),
    docNo: str(row, 'doc_no'),
    itemId: str(row, 'item_id'),
    itemName: str(row, 'item_name'),
    qty,
    unit: oneOf(row, 'unit', UNITS),
    issuedOn: day(row, 'issued_on'),
    canVoid: flag(row, 'can_void'),
  };
}

// يوم بلا جولة (day_version null) يأتي من الخادم بهلاكات ومستبعد null (عيّنة 0035 الحقيقية)؛ الشاشة تقرأ «سُجّل؟» من النسخة، فهما صفر هنا.
// ويوم له صفّ لا يأتي بهما null، ويوم بلا صفّ لا يأتي بهلاكات.
function unrecorded(row: Row, field: string): number {
  const value = optCount(row, field);
  if (value !== null && value !== 0) throw new HallSheetShapeError(field);
  return 0;
}

function dayOf(row: Row, kind: FlockKind): SheetDay {
  const recorded = optCount(row, 'day_version') !== null;
  const parsed: SheetDay = {
    on: day(row, 'on'),
    age: count(row, 'age'),
    dayNo: count(row, 'day_no'),
    dead: recorded ? count(row, 'dead') : unrecorded(row, 'dead'),
    culled: recorded ? count(row, 'culled') : unrecorded(row, 'culled'),
    dayVersion: optCount(row, 'day_version'),
    note: optStr(row, 'note'),
    gas: optCount(row, 'gas'),
    gasVersion: optCount(row, 'gas_version'),
    feedKg: optScaled(row, 'feed_kg', 3),
    carryInKg: addedKg(row, 'carry_in_kg'),
    feedBackKg: addedKg(row, 'feed_back_kg'),
    feed: list(row.feed, 'feed').map(feedLineOf),
    eggsTotal: optCount(row, 'eggs_total'),
    eggsCracked: optCount(row, 'eggs_cracked'),
    eggsBroken: optCount(row, 'eggs_broken'),
    soldBirds: count(row, 'sold_birds'),
    soldNetKg: optScaled(row, 'sold_net_kg', 3),
    liveEnd: int(row, 'live_end'),
  };
  if (parsed.culled > parsed.dead) throw new HallSheetShapeError('culled');
  // المنقول داخل علف يومه.
  if (parsed.carryInKg !== null && (parsed.feedKg === null || parsed.carryInKg > parsed.feedKg)) throw new HallSheetShapeError('carry_in_kg');
  // الغاز الممسوح يبقى صفّه بنسخة أكبر وعدد null (لا حذف، درس ABA 2026-11-16)، فالنسخة بلا عدد صالحة؛ والعدد بلا نسخة لا.
  if (parsed.gas !== null && parsed.gasVersion === null) throw new HallSheetShapeError('gas_version');
  if (kind === 'broiler' && (parsed.eggsTotal !== null || parsed.eggsCracked !== null || parsed.eggsBroken !== null)) throw new HallSheetShapeError('eggs_total');
  return parsed;
}

/** جواب hall_sheet ← الورقة، أو HallSheetShapeError لأوّل مفتاح بغير شكله. */
export function parseHallSheet(value: unknown): HallSheet {
  const json = record(value, 'hall_sheet');
  const flockRow = record(json.flock, 'flock');
  const flock: SheetFlock = {
    id: str(flockRow, 'id'),
    hallId: str(flockRow, 'hall_id'),
    hallName: str(flockRow, 'hall_name'),
    siteName: str(flockRow, 'site_name'),
    kind: oneOf(flockRow, 'kind', KINDS),
    status: oneOf(flockRow, 'status', STATUSES),
    placedOn: day(flockRow, 'placed_on'),
    age0: count(flockRow, 'age0'),
    placedCount: count(flockRow, 'placed_count'),
    closedOn: optDay(flockRow, 'closed_on'),
    endOn: optDay(flockRow, 'end_on'),
    endAge: optCount(flockRow, 'end_age'),
  };
  const through = day(json, 'through');
  const days = list(json.days, 'days').map((row) => dayOf(row, flock.kind));
  // صفّ لكلّ يوم من التسكين حتى through بلا فجوة ولا تكرار: الورقة كالورقة.
  let expected = flock.placedOn;
  for (const entry of days) {
    if (entry.on !== expected) throw new HallSheetShapeError('days');
    expected = addDays(expected, 1);
  }
  if (days.length === 0 || days[days.length - 1]?.on !== through) throw new HallSheetShapeError('through');
  // المنقول يوم التسكين وحده، والمرتجع يوم الإغلاق وحده.
  if (days.some((entry, index) => index > 0 && entry.carryInKg !== null)) throw new HallSheetShapeError('carry_in_kg');
  if (days.some((entry) => entry.feedBackKg !== null && entry.on !== flock.closedOn)) throw new HallSheetShapeError('feed_back_kg');
  const totalsRow = record(json.totals, 'totals');
  const summaryRow = record(json.summary, 'summary');
  return {
    today: day(json, 'today'),
    flock,
    canWrite: flag(json, 'can_write'),
    through,
    days,
    totals: {
      dead: count(totalsRow, 'dead'),
      gas: count(totalsRow, 'gas'),
      feedKg: scaled(totalsRow, 'feed_kg', 3),
      feedBackKg: addedKg(totalsRow, 'feed_back_kg'),
      soldBirds: count(totalsRow, 'sold_birds'),
      soldNetKg: optScaled(totalsRow, 'sold_net_kg', 3),
      eggsTotal: optCount(totalsRow, 'eggs_total'),
    },
    summary: {
      placed: count(summaryRow, 'placed'),
      dead: count(summaryRow, 'dead'),
      mortalityPct: scaled(summaryRow, 'mortality_pct', 2),
      live: int(summaryRow, 'live'),
      feedKg: scaled(summaryRow, 'feed_kg', 3),
      feedBags: optScaled(summaryRow, 'feed_bags', 3),
      feedBackKg: addedKg(summaryRow, 'feed_back_kg'),
      feedNetKg: summaryRow.feed_net_kg === undefined ? scaled(summaryRow, 'feed_kg', 3) - (addedKg(summaryRow, 'feed_back_kg') ?? 0n) : scaled(summaryRow, 'feed_net_kg', 3),
      gas: count(summaryRow, 'gas'),
      soldBirds: count(summaryRow, 'sold_birds'),
      soldNetKg: optScaled(summaryRow, 'sold_net_kg', 3),
      avgWeightKg: optScaled(summaryRow, 'avg_weight_kg', 3),
      fcr: optScaled(summaryRow, 'fcr', 3),
    },
    feedItems: list(json.feed_items, 'feed_items').map((row) => ({
      itemId: str(row, 'item_id'),
      name: str(row, 'name'),
      baseUnit: oneOf(row, 'base_unit', UNITS),
      onHand: scaled(row, 'on_hand', 3),
      units: list(row.units, 'units').map((unit) => {
        const baseQty = scaled(unit, 'base_qty', 6);
        if (baseQty <= 0n) throw new HallSheetShapeError('base_qty');
        return { id: str(unit, 'id'), name: str(unit, 'name'), baseQty };
      }),
      last: flag(row, 'last'),
    })),
    rejects: list(json.rejects, 'rejects').map(rejectOf),
  };
}

/** مركون من الأجهزة (في الورقة وفي جواب stale_reject). */
function rejectOf(row: Row): SheetReject {
  const createdAt = str(row, 'created_at');
  if (!Number.isFinite(Date.parse(createdAt))) throw new HallSheetShapeError('created_at');
  // client_ref اختياريّ: مرجع العملية المركونة، فنسختها في رفّ الجهاز تُعرف به (وبلاه بمحتواها).
  const clientRef = row.client_ref === undefined || row.client_ref === null ? null : str(row, 'client_ref');
  const version = added(row, 'version', count);
  if (version !== null && version < 1) throw new HallSheetShapeError('version');
  return { id: str(row, 'id'), on: day(row, 'on'), reason: str(row, 'reason'), createdAt, payload: record(row.payload, 'payload'), clientRef, version };
}

export async function loadHallSheet(flockId: string): Promise<HallSheet> {
  return parseHallSheet(await call<unknown>('hall_sheet', { p_flock: flockId }));
}

// ─── إرسال العلف من «رصيد العلف» ليوم بعينه (B3) ─────────────────────────────────────────────────────────────────────

/**
 * كمية بوحدة مختارة ← بوحدة الأساس بالآلاف: العدد المكتوب (بالآلاف) × عامل الوحدة (بالمليون)، مقرَّباً مرّة واحدة إلى ثلاث مراتب. والوحدة null = وحدة
 * الأساس نفسها.
 */
export function toBaseQty(typed: Milli, unit: SheetUnit | null): Milli {
  return unit === null ? typed : roundHalfAway(typed * unit.baseQty, 1_000_000n);
}

/** طلب إرسال علف كما يُرسل حرفاً: المعرّفات والمرجع مرّة للطلب، والإعادة بها نفسها لا تصرف مرّتين. */
export interface FeedSend {
  clientRef: string;
  issueId: string;
  lineId: string;
  flockId: string;
  itemId: string;
  /** بوحدة أساس المادّة، بالآلاف. */
  qty: Milli;
  forDay: Day;
}

export interface FeedSent {
  issue: { id: string; docNo: string; itemId: string; itemName: string; qty: Milli; unit: BaseUnit; issuedOn: Day; forDay: Day };
  day: { on: Day; feedKg: Milli };
}

export function parseFeedSent(value: unknown): FeedSent {
  const json = record(value, 'send_flock_feed');
  if (json.status !== 'saved') throw new HallSheetShapeError('status');
  const issue = record(json.issue, 'issue');
  const dayRow = record(json.day, 'day');
  return {
    issue: {
      id: str(issue, 'id'),
      docNo: str(issue, 'doc_no'),
      itemId: str(issue, 'item_id'),
      itemName: str(issue, 'item_name'),
      qty: scaled(issue, 'qty', 3),
      unit: oneOf(issue, 'unit', UNITS),
      issuedOn: day(issue, 'issued_on'),
      forDay: day(issue, 'for_day'),
    },
    day: { on: day(dayRow, 'on'), feedKg: scaled(dayRow, 'feed_kg', 3) },
  };
}

export async function sendFlockFeed(request: FeedSend): Promise<FeedSent> {
  return parseFeedSent(
    await call<unknown>('send_flock_feed', {
      p_client_ref: request.clientRef,
      p_issue_id: request.issueId,
      p_line_id: request.lineId,
      p_flock: request.flockId,
      p_item: request.itemId,
      p_qty: decimalText(request.qty, 3),
      p_for_day: request.forDay,
    }),
  );
}

/** إلغاء صرف علف من الورقة: void_flock_issue نفسه (حركات عكسية بتاريخ اليوم)، بمرجع لكلّ تأكيد والإعادة به. */
export async function voidSheetFeed(issueId: string, reason: string, clientRef: string): Promise<{ id: string; docNo: string; voidedOn: Day }> {
  const json = record(await call<unknown>('void_flock_issue', { p_issue_id: issueId, p_reason: reason.trim(), p_client_ref: clientRef }), 'void_flock_issue');
  if (json.status !== 'void') throw new HallSheetShapeError('status');
  return { id: str(json, 'id'), docNo: str(json, 'doc_no'), voidedOn: day(json, 'voided_on') };
}

// ─── المركون من الأجهزة (B4) ───────────────────────────────────────────────────────────────────────────────────────

export type RejectDecision = 'handled' | 'refused';

export type RejectOutcome = { kind: 'saved' } | { kind: 'stale'; reject: SheetReject };

/**
 * «أُدخلت» (handled) أو «تجاهل» (refused) بنسخة المركون كما عُرض (مراجعة 0035): saved، أو stale_reject بمحتواه الجديد (تغيّر منذ عُرض، فلم يُقرَّر شيء)؛
 * وقرار آخر بعد قرار يرميه الخادم already_decided (RejectedError). إعادة القرار نفسه حُفظت.
 */
export function rejectOutcome(value: unknown): RejectOutcome {
  const answer = record(value, 'decide_flock_reject');
  if (answer.status === 'saved') return { kind: 'saved' };
  if (answer.status === 'stale_reject') return { kind: 'stale', reject: rejectOf(record(answer.reject, 'reject')) };
  throw new HallSheetShapeError('status');
}

export async function decideFlockReject(id: string, decision: RejectDecision, seenVersion: number | null): Promise<RejectOutcome> {
  return rejectOutcome(await call<unknown>('decide_flock_reject', { p_id: id, p_decision: decision, p_seen_version: seenVersion }));
}
