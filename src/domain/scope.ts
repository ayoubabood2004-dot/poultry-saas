import type { Role } from './permissions';

// النطاق: مرآة in_scope_division وin_scope_site وin_scope_wh بالقاعدة (parity.test خانةً خانة). ملف لحاله برّا permissions.ts:
// permissions بحزمة الإقلاع ومسار الجلسة الحرج (سقفاهما المقيسان، DECISIONS «السقوف»)، والنطاق تحتاجه الشاشات الكسولة بس.
// «الكلّ مثل المالك بكلّ شيء» (كلمة المالك 2026-11-21، 0034): نطاق كلّ عضو فعّال المنشأة كلّها، وصفوف member_scopes لا تحدّ شيئاً؛
// والشاشة لا ترى شيئاً من منشأة أخرى أصلاً (RLS)، فالشيء المعروض بنطاق العضو دائماً.

/** كلّ عضو فعّال: المنشأة كلّها. بلا دور (لا عضوية): لا شيء. */
export function inScope(role: Role | null | undefined): boolean {
  return Boolean(role);
}
