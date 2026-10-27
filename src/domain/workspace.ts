import { DIVISION_KINDS, type DivisionKind } from './divisions';
import { ROLES, type Role, type ScopeRow } from './permissions';

// my_workspace() (0001_core.sql) بشكلين: عضو بمنشأة، أو حساب بلا منشأة (ويّا رقمه ودعواته). الجواب يتفحص هنا
// خانةً خانة: دور أو وحدة مو من القائمة، أو خانة ناقصة، ترمي WorkspaceShapeError بدل ما تنقبل بصمت.
// create_my_org وaccept_invite_code يرجّعون my_workspace() نفسه، والرمز الغلط نتيجة مو خطأ (DECISIONS: عقد الرمز الغلط).

export interface Invite {
  memberId: string;
  orgName: string;
  role: Role;
  displayName: string;
  invitedAt: number;
}

export interface Workspace {
  userId: string;
  orgId: string;
  orgName: string;
  memberId: string;
  displayName: string;
  /** الرقم بشكله الموحّد (9647XXXXXXXXX)، أو null لحساب بلا رقم موحّد. */
  phone: string | null;
  role: Role;
  scopes: readonly ScopeRow[];
  /** وحدات نطاق المستخدم كما يحسبها الخادم من member_scopes: المالك، والمدير والمحاسب بلا صفوف نطاق = الست كلها. */
  divisions: readonly DivisionKind[];
  canSeeCost: boolean;
  canSeeAccounts: boolean;
  canSeeSales: boolean;
  /** دعوات منشآت ثانية تنتظر (قبولها يحتاج الخروج من هذه أوّلاً). */
  invites: readonly Invite[];
  subscription: 'active' | 'expired' | 'unknown';
  /** وقت آخر تأكيد ناجح من الخادم. */
  confirmedAt: number;
}

/** حساب داخل بلا منشأة: ينشئ منشأته أو ينتظر دعوة (ورقمه يعطيه لصاحب المنشأة). */
export interface NoOrgAccount {
  userId: string;
  phone: string | null;
  invites: readonly Invite[];
  confirmedAt: number;
}

export type WorkspaceResult = { kind: 'member'; workspace: Workspace } | { kind: 'no_org'; account: NoOrgAccount };

export type AcceptResult = { ok: true; result: WorkspaceResult } | { ok: false; hint: string; triesLeft: number };

export class WorkspaceShapeError extends Error {
  constructor(readonly field: string) {
    super(`workspace_shape:${field}`);
    this.name = 'WorkspaceShapeError';
  }
}

type Json = Record<string, unknown>;

function object(value: unknown, field: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new WorkspaceShapeError(field);
  return value as Json;
}

function text(json: Json, field: string): string {
  const value = json[field];
  if (typeof value !== 'string' || value === '') throw new WorkspaceShapeError(field);
  return value;
}

function optionalText(json: Json, field: string): string | null {
  const value = json[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new WorkspaceShapeError(field);
  return value;
}

function flag(json: Json, field: string): boolean {
  const value = json[field];
  if (typeof value !== 'boolean') throw new WorkspaceShapeError(field);
  return value;
}

function list(json: Json, field: string): unknown[] {
  const value = json[field];
  if (!Array.isArray(value)) throw new WorkspaceShapeError(field);
  return value;
}

function time(json: Json, field: string): number {
  const at = Date.parse(text(json, field));
  if (Number.isNaN(at)) throw new WorkspaceShapeError(field);
  return at;
}

export function parseRole(value: unknown, field = 'role'): Role {
  if (typeof value !== 'string' || !(ROLES as readonly string[]).includes(value)) throw new WorkspaceShapeError(field);
  return value as Role;
}

export function parseDivisionKind(value: unknown, field = 'divisions'): DivisionKind {
  if (typeof value !== 'string' || !(DIVISION_KINDS as readonly string[]).includes(value)) throw new WorkspaceShapeError(field);
  return value as DivisionKind;
}

function parseInvite(value: unknown): Invite {
  const json = object(value, 'invites');
  return {
    memberId: text(json, 'member_id'),
    orgName: text(json, 'org_name'),
    role: parseRole(json.role, 'invites.role'),
    displayName: text(json, 'display_name'),
    invitedAt: time(json, 'invited_at'),
  };
}

/**
 * صفّ نطاق من my_workspace() (0005): الهدف بمفتاحه، موقع أو مخزن واحد بس (مثل member_scopes_one_target)، وdivision_id دائماً
 * وحدة الهدف، نصّاً غير فارغ: النسخ المنشورة قبل 0005 تقرا كل صفّ بـtext(division_id)، فصفّ بلاه يطيّح جلستها. الأخصّ يغلب.
 */
function parseScope(value: unknown): ScopeRow {
  const json = object(value, 'scopes');
  const [divisionId, siteId, warehouseId] = ['division_id', 'site_id', 'warehouse_id'].map((field) => optionalText(json, field) || null);
  if (!divisionId || (siteId && warehouseId)) throw new WorkspaceShapeError('scopes');
  return warehouseId ? { warehouseId } : siteId ? { siteId } : { divisionId };
}

function parseSubscription(value: unknown): Workspace['subscription'] {
  if (value === 'active' || value === 'expired' || value === 'unknown') return value;
  throw new WorkspaceShapeError('subscription');
}

export function parseWorkspace(value: unknown): WorkspaceResult {
  const json = object(value, 'workspace');
  const userId = text(json, 'user_id');
  const invites = list(json, 'invites').map(parseInvite);
  const confirmedAt = time(json, 'confirmed_at');
  if (json.org_id === null) {
    return { kind: 'no_org', account: { userId, phone: optionalText(json, 'phone'), invites, confirmedAt } };
  }
  return {
    kind: 'member',
    workspace: {
      userId,
      orgId: text(json, 'org_id'),
      orgName: text(json, 'org_name'),
      memberId: text(json, 'member_id'),
      displayName: text(json, 'display_name'),
      phone: optionalText(json, 'phone'),
      role: parseRole(json.role),
      scopes: list(json, 'scopes').map(parseScope),
      divisions: list(json, 'divisions').map((kind) => parseDivisionKind(kind)),
      canSeeCost: flag(json, 'can_see_cost'),
      canSeeAccounts: flag(json, 'can_see_accounts'),
      canSeeSales: flag(json, 'can_see_sales'),
      invites,
      subscription: parseSubscription(json.subscription),
      confirmedAt,
    },
  };
}

/** جواب accept_invite_code: my_workspace() للقبول، أو {error: 'invite_code_wrong', hint, tries_left} للرمز الغلط. */
export function parseAcceptResult(value: unknown): AcceptResult {
  const json = object(value, 'accept');
  if (json.error === 'invite_code_wrong') {
    const triesLeft = json.tries_left;
    if (typeof triesLeft !== 'number' || !Number.isInteger(triesLeft) || triesLeft < 0) throw new WorkspaceShapeError('tries_left');
    return { ok: false, hint: text(json, 'hint'), triesLeft };
  }
  if (json.error !== undefined) throw new WorkspaceShapeError('error');
  return { ok: true, result: parseWorkspace(json) };
}
