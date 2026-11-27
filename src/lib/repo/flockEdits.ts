import type { Day } from '../../domain/dates';
import { call } from './core';
import { FlockShapeError } from './flocks';

// تعديل الفوج وحذفه (0028، كلمة الزبون 2026-11-15: «غلطت بتاريخ التسكين… أريد أعدّل التاريخ، أو أحذفه وأدخله من جديد»). ملف وحدة كسول
// مستقلّ عن flocks.ts (write-guard PAGE_MODULES): تستورده نافذة «عدّل الفوج» وحدها، وهي في حزمة القاعات خارج التثبيت المسبق (التعديل يحتاج
// الخادم كلّه)، فلا يكبر التثبيت المسبق بما لا يعمل بلا نت.

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new FlockShapeError(field);
  return value as Row;
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
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new FlockShapeError(field);
  return row[field] as boolean;
};

export interface EditFlockInput {
  flockId: string;
  /** نسخة الفوج التي انفتحت عليها النافذة: غيرها يرفضه الخادم stale_flock (اقرأ من جديد). */
  expectedVersion: number;
  placedOn: Day;
  placedCount: number;
  ageDays: number;
  /** فارغة أو فراغات = بلا سلالة (null). */
  breed: string;
  /** 0038: عدد كلّ قسم في وجبة مقسومة (مجموعه placedCount)، أو غائب. */
  sectionCounts?: number[];
}

export interface EditedFlock {
  flockId: string;
  version: number;
  placedOn: Day;
  placedCount: number;
  ageDaysAtPlacement: number;
  breed: string | null;
  /** false: القيم كما كانت، فلم يتغيّر شيء. */
  changed: boolean;
}

const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/u;
const sameFlock = (row: Row, flockId: string): string => {
  const id = str(row, 'flock_id');
  if (id !== flockId) throw new FlockShapeError('flock_id');
  return id;
};

/** جواب edit_flock بصرامة: كلّ مفتاح بنوعه، واليوم YYYY-MM-DD، والفوج هو المطلوب نفسه. */
export function parseEditedFlock(value: unknown, flockId: string): EditedFlock {
  const row = record(value, 'edit_flock');
  const placedOn = str(row, 'placed_on');
  if (!DAY_TEXT.test(placedOn)) throw new FlockShapeError('placed_on');
  return {
    flockId: sameFlock(row, flockId),
    version: int(row, 'version'),
    placedOn,
    placedCount: int(row, 'placed_count'),
    ageDaysAtPlacement: int(row, 'age_days_at_placement'),
    breed: optStr(row, 'breed'),
    changed: flag(row, 'changed'),
  };
}

/** تاريخ التسكين وعدده والعمر عنده والسلالة لفوج قائم، بشرط نسخته وبمرجع الجهاز (الإعادة بالمرجع نفسه بعد جواب ضاع = التعديل نفسه). */
export async function editFlock(input: EditFlockInput, clientRef: string): Promise<EditedFlock> {
  const breed = input.breed.trim();
  return parseEditedFlock(
    await call<unknown>('edit_flock', {
      p_flock: input.flockId,
      p_expected_version: input.expectedVersion,
      p_placed_on: input.placedOn,
      p_placed_count: input.placedCount,
      p_age_days: input.ageDays,
      p_breed: breed === '' ? null : breed,
      p_client_ref: clientRef,
      ...(input.sectionCounts ? { p_section_counts: input.sectionCounts } : {}),
    }),
    input.flockId,
  );
}

/** جواب delete_flock: deleted = false حين لم يعد الفوج موجوداً (حُذف قبلاً)، فلم يتغيّر شيء. */
export function parseDeletedFlock(value: unknown, flockId: string): { flockId: string; deleted: boolean } {
  const row = record(value, 'delete_flock');
  return { flockId: sameFlock(row, flockId), deleted: flag(row, 'deleted') };
}

/** حذف فوج فُتح غلطاً، بلا أيّ سجلّ له (وإلّا flock_has_records)، بشرط نسخته وبمرجع الجهاز. */
export async function deleteFlock(flockId: string, expectedVersion: number, clientRef: string): Promise<{ flockId: string; deleted: boolean }> {
  return parseDeletedFlock(await call<unknown>('delete_flock', { p_flock: flockId, p_expected_version: expectedVersion, p_client_ref: clientRef }), flockId);
}
