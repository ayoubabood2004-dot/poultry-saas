import { call, classifyPostgrest, send } from './core';

// نطاق الموظف بالموقع والمخزن (0005، المالك بس): مواقع المنشأة ومخازنها لمنتقي النطاق، وset_member_scopes_v2. ملف كسول
// تستورده شاشة الموظفين مباشرةً (حزمتها)، فما يكبّر members.ts بمسار الجلسة الحرج (السقف المقيس، DECISIONS «السقوف»).

export interface ScopeTarget {
  id: string;
  divisionId: string;
  /** الموقع للمخزن، وnull للموقع نفسه. */
  siteId: string | null;
  name: string;
  archived: boolean;
}

export interface ScopeTargets {
  /** المؤرشف ويّاها، فالنطاق القديم يبين باسمه. */
  sites: readonly ScopeTarget[];
  warehouses: readonly ScopeTarget[];
}

interface TargetRow {
  id: string;
  division_id: string;
  site_id?: string;
  name: string;
  archived_at: string | null;
}

const target = (row: TargetRow): ScopeTarget => ({ id: row.id, divisionId: row.division_id, siteId: row.site_id ?? null, name: row.name, archived: row.archived_at !== null });

export async function loadScopeTargets(): Promise<ScopeTargets> {
  const { result, wasOnline } = await send(
    (db) =>
      Promise.all([
        db.from('sites').select('id, division_id, name, archived_at').order('name'),
        db.from('warehouses').select('id, division_id, site_id, name, archived_at').order('name'),
      ]),
    (answers) => answers,
  );
  const [sites, warehouses] = result;
  for (const answer of result) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  return { sites: ((sites.data ?? []) as TargetRow[]).map(target), warehouses: ((warehouses.data ?? []) as TargetRow[]).map(target) };
}

/** القوائم الثلاث كما تنبعث (هدف واحد بكل صفّ). */
export interface ScopeLists {
  divisionIds: readonly string[];
  siteIds: readonly string[];
  warehouseIds: readonly string[];
}

/**
 * الدعوة ونطاقها كلّه بنداء واحد (add_member_v2، المالك بس): بنداءين، فشل الثاني كان يخلّي مديراً أو محاسباً بلا صفوف نطاق،
 * يعني كل المنشأة. يرجّع معرّف العضو (الدعوة).
 */
export async function addMemberV2(phone: string, role: string, displayName: string, scope: ScopeLists): Promise<string> {
  return call<string>('add_member_v2', {
    p_phone: phone,
    p_role: role,
    p_display_name: displayName,
    p_divisions: scope.divisionIds,
    p_sites: scope.siteIds,
    p_warehouses: scope.warehouseIds,
  });
}

/** النطاق بالوحدات والمواقع والمخازن (set_member_scopes_v2): يستبدل النطاق كلّه، والقديم ينأرشف. */
export async function setMemberScopesV2(memberId: string, divisionIds: readonly string[], siteIds: readonly string[], warehouseIds: readonly string[]): Promise<void> {
  await call<null>('set_member_scopes_v2', { p_member: memberId, p_divisions: divisionIds, p_sites: siteIds, p_warehouses: warehouseIds });
}
