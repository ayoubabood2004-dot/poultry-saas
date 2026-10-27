import type { Role, ScopeRow, ScopeTarget } from './permissions';

// النطاق: الشي بنطاق العضو، مرآة in_scope_division وin_scope_site وin_scope_wh بالقاعدة (parity.test خانةً خانة). ملف لحاله
// برّا permissions.ts: permissions بحزمة الإقلاع ومسار الجلسة الحرج (سقفاهما المقيسان، DECISIONS «السقوف»)، والنطاق تحتاجه
// الشاشات الكسولة بس، فيدخل حزمتها.

function rowCovers(row: ScopeRow, target: ScopeTarget): boolean {
  if (row.hallId) return row.hallId === target.hallId;
  if (row.warehouseId) return row.warehouseId === target.warehouseId;
  if (row.siteId) return row.siteId === target.siteId;
  if (row.divisionId) return row.divisionId === target.divisionId;
  return false;
}

/** المالك دائماً؛ بلا صفوف نطاق المدير والمحاسب كل المنشأة وغيرهم ولا شي؛ وإلا صفّ يغطّي الشي بسلسلته. */
export function inScope(role: Role, scopes: readonly ScopeRow[], target: ScopeTarget): boolean {
  if (role === 'owner') return true;
  if (scopes.length === 0) return role === 'manager' || role === 'accountant';
  return scopes.some((row) => rowCovers(row, target));
}
