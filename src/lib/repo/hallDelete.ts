import type { Day } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import { FlockShapeError } from './flocks';

// «احذف القاعة» كأنّها لم تكن (0037، كلمة الزبون 2026-11-26 «هذن القاعات أريد أحذف منهم… سوّيت تجريبيات» وجواب المالك، عقد 0037 الجزء H):
// ما سيُحذف (delete_hall_preview) والحذف (delete_hall) بنسخة القاعة وبصمة ما عُرض ومرجع واحد للنافذة. ملف وحدة كسول مستقلّ عن flocks.ts
// (write-guard PAGE_MODULES): تستورده نافذة الحذف وحدها، وهي في حزمة القاعات خارج التثبيت المسبق (الحذف يحتاج الخادم كلّه)، فلا يكبر
// التثبيت المسبق بما لا يعمل بلا نت. القراءة صارمة: كلّ مفتاح بنوعه، وما يكون null يُقرأ null، وأيّ شكل غريب FlockShapeError باسم مفتاحه.

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
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new FlockShapeError(field);
  return value;
};
/** عدد من صفر فأكثر (الأيّام والصرف والدورات المنتهية). */
const count = (row: Row, field: string): number => {
  const value = int(row, field);
  if (value < 0) throw new FlockShapeError(field);
  return value;
};
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new FlockShapeError(field);
  return row[field] as boolean;
};
const oneOf = <T extends string>(row: Row, field: string, allowed: readonly T[]): T => {
  if (!allowed.includes(row[field] as T)) throw new FlockShapeError(field);
  return row[field] as T;
};
/** مفتاح قد يكون null: غيابه أو null يُقرأ null، وغيرهما بنوعه وإلّا رُفض. */
const nullable = <T>(row: Row, field: string, read: (row: Row, field: string) => T): T | null => (row[field] === null || row[field] === undefined ? null : read(row, field));

const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/u;
const day = (row: Row, field: string): Day => {
  const value = str(row, field);
  if (!DAY_TEXT.test(value)) throw new FlockShapeError(field);
  return value;
};
/** الكمية نصّاً بأرقام غربية بلا فواصل ولا إشارة (14000.000)، بثلاث مراتب على الأكثر، أكبر من صفر ← بالآلاف. */
const WIRE_QTY = /^[0-9]+(?:\.[0-9]+)?$/u;
const qty = (row: Row, field: string): Milli => {
  const text = str(row, field);
  const value = WIRE_QTY.test(text) ? parseDecimal(text, 3) : null;
  if (value === null) throw new FlockShapeError(field);
  const units = toScale(value, 3);
  if (units <= 0n) throw new FlockShapeError(field);
  return units;
};

const BASE_UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];
const RUNNING: readonly ('preparing' | 'active')[] = ['preparing', 'active'];
/** لماذا لا تُحذف القاعة الآن (عقد D2، فحوص delete_hall نفسها بترتيبها): بيع طيور، تذكرة وزن، علف منقول مطبَّق، فترة مقفلة، الصلاحية أو النطاق. */
// counted وrevalued (مراجعة 0037 D1): جرد أو تصحيح سعر بعد ما صُرف للفوج يمنع عكسه، فيمنع الحذف من القراءة نفسها لا عند الحذف وحده.
export const DELETE_HALL_BLOCKS = ['sales', 'tickets', 'carry', 'period_locked', 'permission', 'counted', 'revalued'] as const;
export type DeleteHallBlock = (typeof DELETE_HALL_BLOCKS)[number];

/** ما يرجع إلى المخزن بحركة عكسية: مجموع ما صُرف للفوج من مادّة واحدة من مخزن واحد، بوحدة أساس المادّة. */
export interface HallBack {
  warehouseId: string;
  warehouse: string;
  itemId: string;
  item: string;
  qty: Milli;
  baseUnit: BaseUnit;
}

const backOf = (row: Row): HallBack => ({
  warehouseId: str(row, 'warehouse_id'),
  warehouse: str(row, 'warehouse'),
  itemId: str(row, 'item_id'),
  item: str(row, 'item'),
  qty: qty(row, 'qty'),
  baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
});

export interface DeleteHallFlock {
  id: string;
  version: number;
  status: 'preparing' | 'active';
  placedOn: Day | null;
  placedCount: number | null;
  /** صفوف أيّامه (flock_daily)، والزيارات الحيّة، وأيّام الغاز، والأوزان، والدواء المسجَّل، واللقاحات المؤشَّرة، والصرف المرحَّل. */
  days: number;
  visits: number;
  gasDays: number;
  /** عدد أوزان العيّنات (weights في الجواب): عدد لا وزن. */
  weighings: number;
  logs: number;
  vaccinations: number;
  issues: number;
  /** بترتيب المخزن ثمّ المادّة كما يرسلها الخادم. */
  back: readonly HallBack[];
}

export interface DeleteHallPreview {
  hall: { id: string; name: string; siteId: string; site: string; version: number };
  /** الفوج القائم (قيد التجهيز أو نشط) أو null: القاعة بلا فوج. */
  flock: DeleteHallFlock | null;
  /** الدورات المنتهية في القاعة: تبقى في التقارير. */
  ended: number;
  /** فارغة = تُحذف؛ وإلّا جملها كما هي، بلا زرّ حذف. */
  blocks: readonly { code: DeleteHallBlock; text: string }[];
  /** بصمة ما عُرض: الحذف يرسلها، وتغيّرٌ بعدها يرفضه الخادم stale_plan. */
  plan: string;
}

/** جواب delete_hall_preview بصرامة، للقاعة المطلوبة نفسها. */
export function parseDeleteHallPreview(value: unknown, hallId: string): DeleteHallPreview {
  const json = record(value, 'delete_hall_preview');
  const hall = record(json.hall, 'hall');
  if (str(hall, 'id') !== hallId) throw new FlockShapeError('hall');
  const flock = json.flock === null ? null : record(json.flock, 'flock');
  return {
    hall: { id: hallId, name: str(hall, 'name'), siteId: str(hall, 'site_id'), site: str(hall, 'site'), version: int(hall, 'version') },
    flock: flock
      ? {
          id: str(flock, 'id'),
          version: int(flock, 'version'),
          status: oneOf(flock, 'status', RUNNING),
          placedOn: nullable(flock, 'placed_on', day),
          placedCount: nullable(flock, 'placed_count', count),
          days: count(flock, 'days'),
          visits: count(flock, 'visits'),
          gasDays: count(flock, 'gas_days'),
          weighings: count(flock, 'weights'),
          logs: count(flock, 'logs'),
          vaccinations: count(flock, 'vaccinations'),
          issues: count(flock, 'issues'),
          back: list(flock.back, 'back').map(backOf),
        }
      : null,
    ended: count(json, 'ended'),
    blocks: list(json.blocks, 'blocks').map((row) => ({ code: oneOf(row, 'code', DELETE_HALL_BLOCKS), text: str(row, 'text') })),
    plan: str(json, 'plan'),
  };
}

export interface DeletedHall {
  hallId: string;
  name: string;
  /** true: كانت محذوفة قبلاً (جواب ضاع وأُعيد بمرجع آخر)، فلم يتغيّر شيء. */
  already: boolean;
  /** الفوج الذي أُلغي، أو null (قاعة بلا فوج، أو محذوفة قبلاً). */
  flockId: string | null;
  voidedIssues: number;
  /** ما رجع إلى المخزن (فارغة للمحذوفة قبلاً). */
  back: readonly HallBack[];
}

/** جواب delete_hall بصرامة: القاعة المطلوبة نفسها، وdeleted صحيح دائماً، والمحذوفة قبلاً بلا فوج ولا صرف. */
export function parseDeletedHall(value: unknown, hallId: string): DeletedHall {
  const row = record(value, 'delete_hall');
  if (str(row, 'hall_id') !== hallId) throw new FlockShapeError('hall_id');
  if (row.deleted !== true) throw new FlockShapeError('deleted');
  const already = flag(row, 'already');
  const name = str(row, 'name');
  const back = list(row.back, 'back').map(backOf);
  if (already) return { hallId, name, already, flockId: nullable(row, 'flock_id', str), voidedIssues: nullable(row, 'voided_issues', count) ?? 0, back };
  // الحذف الجديد يحمل الفوج (أو null صريحاً) وعدد الصرف الملغى.
  if (!('flock_id' in row)) throw new FlockShapeError('flock_id');
  return { hallId, name, already, flockId: nullable(row, 'flock_id', str), voidedIssues: count(row, 'voided_issues'), back };
}

/** ما سيُحذف مع القاعة، وما يمنع حذفها، وبصمته. قاعة مؤرشفة يرفضها الخادم hall_not_found. */
export async function loadDeleteHallPreview(hallId: string): Promise<DeleteHallPreview> {
  return parseDeleteHallPreview(await call<unknown>('delete_hall_preview', { p_hall: hallId }), hallId);
}

/**
 * يحذف القاعة كأنّها لم تكن بنسخة القاعة وبصمة ما عُرض (stale_hall وstale_plan حين تغيّرا بعده) وبمرجع النافذة: الإعادة بالمرجع نفسه بعد جواب ضاع
 * = الحذف نفسه، والقاعة المحذوفة قبلاً already بلا تغيير.
 */
export async function deleteHall(hallId: string, version: number, plan: string, clientRef: string): Promise<DeletedHall> {
  return parseDeletedHall(await call<unknown>('delete_hall', { p_hall: hallId, p_expected_version: version, p_expected_plan: plan, p_client_ref: clientRef }), hallId);
}
