import type { Day } from '../../domain/dates';
import { call, updatedRows } from './core';
import { FlockShapeError, int, record, sectionsOf, str, withStatus, written } from './flocks';

// إدارة القاعات وفتح الوجبة (0012، والأقسام 0038): إضافة القاعة وتعديلها وأقسامها، وتسكين وجبة فيها. كلّها بنتٍ لا بالطابور، ونوافذها في حزمة
// القاعات (hallDialogs، خارج التثبيت المسبق)، فهي هنا لا في flocks.ts الذي تحمله حزمة الحقول المحفوظة للعمل بلا نت (حجم التثبيت المسبق).

export async function createHall(siteId: string, name: string, capacity: number | null, sections = 1): Promise<void> {
  // أقسام القاعة (0038) تُكتب عند إنشائها؛ والعمود يُرسل لقاعة مقسومة وحدها (خادم قبل 0038 لا يعرفه).
  await written(async (db) =>
    updatedRows(withStatus(await db.from('halls').insert({ site_id: siteId, name: name.trim(), capacity, ...(sections > 1 ? { sections } : {}) }).select('id, version'))),
  );
}

/** الاسم والسعة بشرط النسخة اللي انفتح عليها النموذج (صفر صفوف = تغيّرت بعده). */
export async function updateHall(id: string, version: number, name: string, capacity: number | null): Promise<number> {
  const row = await written(async (db) => updatedRows(withStatus(await db.from('halls').update({ name: name.trim(), capacity }).eq('id', id).eq('version', version).select('id, version'))));
  // نسخة القاعة بعد الحفظ: تغيير أقسامها بعده يُشرط بها.
  return int(row, 'version');
}

/** جواب set_hall_sections (0038): حُفظ بنسخة القاعة وأقسامها، أو stale_hall (تغيّرت القاعة بعد فتح النافذة). */
export type HallSectionsResult = { status: 'saved' | 'stale_hall'; version: number; sections: number };

export function parseHallSections(value: unknown): HallSectionsResult {
  const answer = record(value, 'set_hall_sections');
  const status = answer.status;
  if (status !== 'saved' && status !== 'stale_hall') throw new FlockShapeError('status');
  const hall = record(answer.hall, 'hall');
  return { status, version: int(hall, 'version'), sections: sectionsOf(hall) };
}

/**
 * أقسام القاعة (0038، من 1 إلى 4) بشرط نسختها؛ ووجبتها القائمة بلا هلاكات تُقسم بالتساوي، وبهلاكات تُرفض (sections_after_deaths). بمرجع النافذة.
 */
export async function setHallSections(hallId: string, sections: number, expectedVersion: number, clientRef: string): Promise<HallSectionsResult> {
  return parseHallSections(await call<unknown>('set_hall_sections', { p_hall: hallId, p_sections: sections, p_expected_version: expectedVersion, p_client_ref: clientRef }));
}

export interface OpenFlockInput {
  hallId: string;
  placedOn: Day;
  placedCount: number;
  ageDays: number;
  breed: string;
  /** 0038: عدد كلّ قسم في قاعة مقسومة (مجموعه placedCount)، أو غائب. */
  sectionCounts?: number[];
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
      ...(input.sectionCounts ? { p_section_counts: input.sectionCounts } : {}),
    }),
    'open_flock',
  );
  return str(answer, 'flock_id');
}
