import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { Fils, Milli } from '../../domain/money';
import { ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import type { CostKind } from './flocks';

// الصرف لفوج القاعة (0019، كلمة المالك 2026-11-07: «لمن اروح للقاعات اريد اصرفلهم مادة معينة الكي المواد الي اني صنعتها بالمعمل… ويكلي
// شكد عندك واكدر اصرف منها للقاعة»): ما يُصرف (flock_issue_options)، والصرف بنداء واحد يُرحَّل فوراً (record_flock_issue)، وإلغاؤه
// (void_flock_issue). تستورده صفحة الصرف مباشرةً (write-guard PAGE_MODULES)، فلا يمرّ بـindex ولا يدخل حزم الحقول المحفوظة للفتح بلا
// نت (الصرف يحتاج الخادم). وعلف القاعة وسجلّ صرفها (flock_feed) في flocks.ts: تقرؤه شاشة الفوج.
// الأرقام نصوص عشرية بالسلك (E3): الكمية بالآلاف (Milli)، والكثافة بأربع مراتب، والمال بالفلس؛ والمال يغيب مفتاحه كلّه لغير أدوار الكلفة
// (الأمين يصرف ولا يرى القيمة)، وخاناته قد تأتي null (درس WP7)، فالمحلّل يقبل الغياب ويقرأ null ولا يفترضهما.

export class FlockIssueShapeError extends Error {
  constructor(readonly field: string) {
    super(`flock_issue_shape:${field}`);
    this.name = 'FlockIssueShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new FlockIssueShapeError(field);
  return value as Row;
};
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new FlockIssueShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new FlockIssueShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new FlockIssueShapeError(field);
  return row[field] as boolean;
};
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  const value = row[field];
  if (!allowed.includes(value as T)) throw new FlockIssueShapeError(field);
  return value as T;
};
/** رقم عشري نصّاً بمراتبه (الكمية 3، الكثافة 4، المال 2) ← عدد صحيح بوحدة 10⁻ˢ، أو null حين يغيب أو يأتي null. */
const optScaled = (row: Row, field: string, scale: number): bigint | null => {
  const text = optStr(row, field);
  if (text === null) return null;
  const value = parseDecimal(text, scale);
  if (value === null) throw new FlockIssueShapeError(field);
  return toScale(value, scale);
};
const scaled = (row: Row, field: string, scale: number): bigint => {
  const value = optScaled(row, field, scale);
  if (value === null) throw new FlockIssueShapeError(field);
  return value;
};
/** كائن المال إن حضر (أدوار الكلفة)، أو null لغيرهم: الغياب قناع لا خطأ. */
const moneyBox = (row: Row): Row | null => (row.money === undefined || row.money === null ? null : record(row.money, 'money'));
const optScaledMoney = (row: Row | null): { value: Fils | null } | null => (row ? { value: optScaled(row, 'value', 2) } : null);

const COST_KINDS: readonly CostKind[] = ['feed', 'medicine', 'vaccine', 'fuel', 'other'];
const UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const FLOCK_STATUSES = ['preparing', 'active', 'closed'] as const;
export type IssueFlockStatus = (typeof FLOCK_STATUSES)[number];

// ─── ما يُصرف للفوج ─────────────────────────────────────────────────────────────────────────────────────────────

export interface IssueStore {
  warehouseId: string;
  name: string;
  qty: Milli;
}

export interface IssueItem {
  itemId: string;
  name: string;
  /** نوع المادّة (البطاقة تقوله: «مادّة أوّلية»، «وقود»…)، ونوع كلفتها على الفوج منفصل عنه. */
  kind: ItemKind;
  costKind: CostKind;
  baseUnit: BaseUnit;
  /** ١/١٠٠٠٠ كغم/لتر، للسائل إن كُتبت. */
  density: bigint | null;
  /** الموجود بمخازن نطاق القارئ. */
  onHand: Milli;
  /** علف أُنتج في المعمل (يُعرض أوّلاً بشارته). */
  madeInMill: boolean;
  stores: readonly IssueStore[];
}

export interface IssueOptions {
  flockId: string;
  flockStatus: IssueFlockStatus;
  hallId: string;
  hallName: string;
  siteName: string;
  placedOn: Day | null;
  today: Day;
  /** أقدم تاريخ يُقبل للصرف (لا أقدم من 7 أيام، ولا قبل التسكين). */
  earliestOn: Day;
  /** issue.post والفوج قائم: «اصرف» يظهر. */
  canIssue: boolean;
  /** مرتّبة من الخادم: علف المعمل، ثمّ العلف، ثمّ المواد الأوّلية والإضافات، ثمّ بالاسم. */
  items: readonly IssueItem[];
}

export function parseIssueOptions(value: unknown): IssueOptions {
  const json = record(value, 'flock_issue_options');
  return {
    flockId: str(json, 'flock_id'),
    flockStatus: oneOf(json, 'flock_status', FLOCK_STATUSES),
    hallId: str(json, 'hall_id'),
    hallName: str(json, 'hall_name'),
    siteName: str(json, 'site_name'),
    placedOn: optStr(json, 'placed_on'),
    today: str(json, 'today'),
    earliestOn: str(json, 'earliest_on'),
    canIssue: flag(json, 'can_issue'),
    items: list(json.items, 'items').map((row) => ({
      itemId: str(row, 'item_id'),
      name: str(row, 'name'),
      kind: oneOf(row, 'kind', ITEM_KINDS),
      costKind: oneOf(row, 'cost_kind', COST_KINDS),
      baseUnit: oneOf(row, 'base_unit', UNITS),
      density: optScaled(row, 'density_kg_per_l', 4),
      onHand: scaled(row, 'on_hand_qty', 3),
      madeInMill: flag(row, 'made_in_mill'),
      stores: list(row.stores, 'stores').map((store) => ({ warehouseId: str(store, 'warehouse_id'), name: str(store, 'name'), qty: scaled(store, 'qty', 3) })),
    })),
  };
}

export async function loadIssueOptions(flockId: string): Promise<IssueOptions> {
  return parseIssueOptions(await call<unknown>('flock_issue_options', { p_flock: flockId }));
}

// ─── الصرف وإلغاؤه ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * معرّفات الصرف ومرجعه: تولد مرّة لكلّ نافذة صرف وتبقى لها. الإعادة بعد نتيجة مجهولة بالنداء نفسه حرفاً ترجّع المحفوظ؛ ورفضٌ نهائيّ لم
 * يكتب شيئاً، فالمعرّفات نفسها تصلح لإرسال بعد تصحيح (كاختيار المخزن بعد store_required).
 */
export interface IssueIds {
  clientRef: string;
  issueId: string;
  lineId: string;
}

export function newIssueIds(): IssueIds {
  return { clientRef: crypto.randomUUID(), issueId: crypto.randomUUID(), lineId: crypto.randomUUID() };
}

export interface IssueInput {
  flockId: string;
  itemId: string;
  /** بوحدة أساس المادّة، بالآلاف. */
  qty: Milli;
  issuedOn: Day;
  /** null: الخادم يختار المخزن الوحيد الذي فيه المادّة (وإلّا store_required). */
  warehouseId: string | null;
}

export interface RecordedIssue {
  id: string;
  docNo: string;
  issuedOn: Day;
  hallName: string;
  itemName: string;
  warehouseName: string;
  qty: Milli;
  baseUnit: BaseUnit;
  money: { value: Fils | null } | null;
}

export function parseRecordedIssue(value: unknown): RecordedIssue {
  const json = record(value, 'record_flock_issue');
  const money = moneyBox(json);
  return {
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    issuedOn: str(json, 'issued_on'),
    hallName: str(json, 'hall_name'),
    itemName: str(json, 'item_name'),
    warehouseName: str(json, 'warehouse_name'),
    qty: scaled(json, 'qty', 3),
    baseUnit: oneOf(json, 'base_unit', UNITS),
    money: optScaledMoney(money),
  };
}

/** نداء record_flock_issue بالمفاتيح الثمانية كلّها (p_warehouse null حين يختار الخادم المخزن). */
export async function recordFlockIssue(ids: IssueIds, input: IssueInput): Promise<RecordedIssue> {
  return parseRecordedIssue(
    await call<unknown>('record_flock_issue', {
      p_client_ref: ids.clientRef,
      p_issue_id: ids.issueId,
      p_line_id: ids.lineId,
      p_flock: input.flockId,
      p_item: input.itemId,
      p_qty: decimalText(input.qty, 3),
      p_issued_on: input.issuedOn,
      p_warehouse: input.warehouseId,
    }),
  );
}

export interface VoidedIssue {
  id: string;
  docNo: string;
  voidedOn: Day;
}

export function parseVoidedIssue(value: unknown): VoidedIssue {
  const json = record(value, 'void_flock_issue');
  if (json.status !== 'void') throw new FlockIssueShapeError('status');
  return { id: str(json, 'id'), docNo: str(json, 'doc_no'), voidedOn: str(json, 'voided_on') };
}

/** إلغاء الصرف بسبب إلزامي: الحركات ترجع إلى دفعاتها وسطر الكلفة بصفّ عكسي. المرجع مرّة لكلّ تأكيد، والإعادة به. */
export async function voidFlockIssue(issueId: string, reason: string, clientRef: string): Promise<VoidedIssue> {
  return parseVoidedIssue(await call<unknown>('void_flock_issue', { p_issue_id: issueId, p_reason: reason.trim(), p_client_ref: clientRef }));
}
