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
        db.from('member_scopes').select('member_id, division_id').is('archived_at', null),
        db.from('divisions').select('id, kind').is('archived_at', null),
      ]),
    (answers) => answers,
  );
  const [members, scopes, divisions] = result;
  for (const result of [members, scopes, divisions]) {
    if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  }
  const byMember = new Map<string, string[]>();
  for (const scope of (scopes.data ?? []) as { member_id: string; division_id: string | null }[]) {
    if (!scope.division_id) continue;
    byMember.set(scope.member_id, [...(byMember.get(scope.member_id) ?? []), scope.division_id]);
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
        divisionIds: byMember.get(row.id) ?? [],
      })),
    divisions: ((divisions.data ?? []) as { id: string; kind: string }[]).map((row) => ({
      id: row.id,
      kind: parseDivisionKind(row.kind, 'divisions.kind'),
    })),
  };
}

/** الدعوة برقم الهاتف. مو متكرّرة الأمان: نتيجة مجهولة = حدّث القائمة قبل الإعادة (already_in_org يكول إنها صارت). */
export async function addMember(phone: string, role: Role, displayName: string, divisionIds: readonly string[]): Promise<string> {
  return call<string>('add_member', { p_phone: phone, p_role: role, p_display_name: displayName, p_divisions: divisionIds });
}

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
