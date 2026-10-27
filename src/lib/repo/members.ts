import type { DivisionKind } from '../../domain/divisions';
import type { Role } from '../../domain/permissions';
import { parseDivisionKind, parseRole, WorkspaceShapeError } from '../../domain/workspace';
import { call, classifyPostgrest, send } from './core';

// موظفو المنشأة: القراءة من الجداول بسياساتها (أي عضو يقرا أعضاء منشأته)، والكتابة كلها دوالّ للمالك بس
// (members.manage): دعوة، رمز، دور، نطاق، أرشفة. ماكو حذف: الخارج ينأرشف ويبقى بالسجلّ.

export interface StaffMember {
  id: string;
  userId: string;
  displayName: string;
  phone: string | null;
  role: Role;
  /** قبل الدعوة. الدعوة اللي ما انقبلت ما تنطي أي وصول. */
  accepted: boolean;
  invitedAt: number;
  divisionIds: readonly string[];
  /** نطاق بالموقع أو المخزن (0005): كل صفّ هدف واحد. */
  siteIds: readonly string[];
  warehouseIds: readonly string[];
}

export interface DivisionRef {
  id: string;
  kind: DivisionKind;
}

export interface StaffList {
  /** غير المؤرشفين: العاملون والمدعوّون. */
  members: readonly StaffMember[];
  divisions: readonly DivisionRef[];
}

interface MemberRow {
  id: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  role: string;
  accepted_at: string | null;
  archived_at: string | null;
  created_at: string;
}

function timeOf(value: string, field: string): number {
  const at = Date.parse(value);
  if (Number.isNaN(at)) throw new WorkspaceShapeError(field);
  return at;
}

export async function loadStaff(): Promise<StaffList> {
  const { result, wasOnline } = await send(
    (db) =>
      Promise.all([
        db.from('members').select('id, user_id, display_name, phone, role, accepted_at, archived_at, created_at').order('created_at'),
        db.from('member_scopes').select('member_id, division_id, site_id, warehouse_id').is('archived_at', null),
        db.from('divisions').select('id, kind').is('archived_at', null),
      ]),
    (answers) => answers,
  );
  const [members, scopes, divisions] = result;
  for (const result of [members, scopes, divisions]) {
    if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  }
  const byMember = new Map<string, { d: string[]; s: string[]; w: string[] }>();
  for (const scope of (scopes.data ?? []) as { member_id: string; division_id: string | null; site_id: string | null; warehouse_id: string | null }[]) {
    const own = byMember.get(scope.member_id) ?? { d: [], s: [], w: [] };
    if (scope.division_id) own.d.push(scope.division_id);
    if (scope.site_id) own.s.push(scope.site_id);
    if (scope.warehouse_id) own.w.push(scope.warehouse_id);
    byMember.set(scope.member_id, own);
  }
  return {
    members: ((members.data ?? []) as MemberRow[])
      .filter((row) => row.archived_at === null)
      .map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        phone: row.phone,
        role: parseRole(row.role, 'members.role'),
        accepted: row.accepted_at !== null,
        invitedAt: timeOf(row.created_at, 'members.created_at'),
        divisionIds: byMember.get(row.id)?.d ?? [],
        siteIds: byMember.get(row.id)?.s ?? [],
        warehouseIds: byMember.get(row.id)?.w ?? [],
      })),
    divisions: ((divisions.data ?? []) as { id: string; kind: string }[]).map((row) => ({
      id: row.id,
      kind: parseDivisionKind(row.kind, 'divisions.kind'),
    })),
  };
}

// الدعوة نفسها بـscopes.addMemberV2 (add_member_v2، ملف كسول بحزمة الموظفين): الدعوة ونطاقها بنداء واحد. add_member القديمة
// تبقى بالقاعدة باسمها (FOUNDATION ٢٣٠)، وما إلها نداء من الشاشة: بنداءين، فشل النطاق كان يخلّي الدعوة بلا نطاق.

/** رمز الدعوة (6 أرقام نصّاً). يبين مرّة وحدة، وكل إصدار يبطل اللي قبله. */
export async function inviteCode(memberId: string): Promise<string> {
  const code = await call<unknown>('invite_code', { p_member: memberId });
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) throw new WorkspaceShapeError('invite_code');
  return code;
}

export async function setMemberRole(memberId: string, role: Role): Promise<void> {
  await call<null>('set_member_role', { p_member: memberId, p_role: role });
}

export async function setMemberScopes(memberId: string, divisionIds: readonly string[]): Promise<void> {
  await call<null>('set_member_scopes', { p_member: memberId, p_divisions: divisionIds });
}

export async function archiveMember(memberId: string): Promise<void> {
  await call<null>('archive_member', { p_member: memberId });
}
