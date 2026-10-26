import { parseAcceptResult, parseWorkspace, type AcceptResult, type WorkspaceResult } from '../../domain/workspace';
import { call } from './core';

// «بأي منشأة أنا» يحسمه الخادم (FOUNDATION ٢٠٠): كل الشاشات تقرا المنشأة من my_workspace() وبس.
// الدعوة تنقبل برمز يسلّمه المالك بيده (0003)، والرمز نصّ مو رقم حتى الصفر الأوّل ما يضيع.

export async function loadMyWorkspace(): Promise<WorkspaceResult> {
  return parseWorkspace(await call<unknown>('my_workspace'));
}

export async function createMyOrg(orgName: string, displayName: string): Promise<WorkspaceResult> {
  return parseWorkspace(await call<unknown>('create_my_org', { p_org_name: orgName, p_display_name: displayName }));
}

/** الرمز الغلط نتيجة {ok: false} بتلميحه والمحاولات الباقية، مو خطأ (DECISIONS: عقد الرمز الغلط). */
export async function acceptInviteCode(memberId: string, code: string): Promise<AcceptResult> {
  return parseAcceptResult(await call<unknown>('accept_invite_code', { p_member: memberId, p_code: code }));
}

export async function declineInvite(memberId: string): Promise<void> {
  await call<null>('decline_invite', { p_member: memberId });
}

export async function declineAndBlock(memberId: string): Promise<void> {
  await call<null>('decline_and_block', { p_member: memberId });
}

export async function leaveMyOrg(): Promise<void> {
  await call<null>('leave_my_org');
}
