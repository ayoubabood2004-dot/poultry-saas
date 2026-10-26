// جدول الصلاحيات (دور × فعل) من قسم «العمليات» بـdocs/FOUNDATION.md، بتعديلات المالك 2026-10-24
// (docs/DECISIONS.md، القرار 22). هذا مرآة الواجهة بس: الحكم الحقيقي بالخادم، والواجهة تعرض وتقترح.

export type Role =
  | 'owner'
  | 'manager'
  | 'storekeeper'
  | 'mill_operator'
  | 'hatchery_operator'
  | 'hall_worker'
  | 'accountant'
  | 'viewer';

export const ROLES: readonly Role[] = [
  'owner',
  'manager',
  'storekeeper',
  'mill_operator',
  'hatchery_operator',
  'hall_worker',
  'accountant',
  'viewer',
];

export const ACTIONS = [
  // أمين المخزن، بمخازن نطاقه
  'receipt.draft',
  'transfer.post',
  'issue.post',
  'count.enter',
  'stock_use.post',
  // المحاسب أو المدير
  'receipt.amounts',
  'costs.load',
  'sale.post',
  'payment.post',
  'sale_return.post',
  'expense.post',
  'accounts.view',
  // مشغّل المعمل، بمخزن معمله
  'production.draft',
  'production.post',
  // مشغّل المفقس، بمفقس نطاقه
  'hatch.operate',
  // عامل القاعة، بقاعات نطاقه
  'flock_day.save',
  'weigh_ticket.draft',
  // المدير (والمالك كل شي)
  'recipe.activate',
  'count.approve',
  'flock.manage',
  'flock.transfer',
  'hatch.zero_saleable',
  'expired.destroy',
  'expired.release',
  'void',
  'receipt.revalue',
  'party.adjust',
  'opening.post',
  'period.lock',
  // المالك بس (كلمته 2026-10-24: «المقاصّة للمالك بس»؛ و2026-10-25: «إضافة الموظفين وأدوارهم: صاحب المنشأة بس»)
  'party.offset',
  'members.manage',
  // فتح فترة مقفلة (إرجاع القفل للخلف): كلمة المالك 2026-10-25.
  'period.unlock',
  // الكل
  'read',
] as const;

export type Action = (typeof ACTIONS)[number];

const STOREKEEPER: readonly Action[] = ['receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post'];
const MILL_OPERATOR: readonly Action[] = ['production.draft', 'production.post'];
const HATCHERY_OPERATOR: readonly Action[] = ['hatch.operate'];
const HALL_WORKER: readonly Action[] = ['flock_day.save', 'weigh_ticket.draft'];
const ACCOUNTANT: readonly Action[] = [
  'receipt.amounts',
  'costs.load',
  'production.post',
  'sale.post',
  'payment.post',
  'sale_return.post',
  'expense.post',
  'accounts.view',
];
const MANAGER_ONLY: readonly Action[] = [
  'recipe.activate',
  'count.approve',
  'flock.manage',
  'flock.transfer',
  'hatch.zero_saleable',
  'expired.destroy',
  'expired.release',
  'void',
  'receipt.revalue',
  'party.adjust',
  'opening.post',
  'period.lock',
];

// المدير يقدر كل أفعال الأدوار التشغيلية بكل النطاق، والمحاسب ما يقدرها. party.offset وmembers.manage وperiod.unlock برّا كل منحة: المالك بس.
const GRANTS: Readonly<Record<Exclude<Role, 'owner'>, ReadonlySet<Action>>> = {
  manager: new Set<Action>([
    ...STOREKEEPER,
    ...MILL_OPERATOR,
    ...HATCHERY_OPERATOR,
    ...HALL_WORKER,
    ...ACCOUNTANT,
    ...MANAGER_ONLY,
    'read',
  ]),
  accountant: new Set<Action>([...ACCOUNTANT, 'read']),
  storekeeper: new Set<Action>([...STOREKEEPER, 'read']),
  mill_operator: new Set<Action>([...MILL_OPERATOR, 'read']),
  hatchery_operator: new Set<Action>([...HATCHERY_OPERATOR, 'read']),
  hall_worker: new Set<Action>([...HALL_WORKER, 'read']),
  viewer: new Set<Action>(['read']),
};

export interface ActionContext {
  /** لترحيل دفعة الإنتاج: مشغّل المعمل يرحّل بس بعد ما تنختم الكلف. */
  costsConfirmed?: boolean;
}

export function can(role: Role, action: Action, context: ActionContext = {}): boolean {
  if (role === 'owner') return true;
  if (!GRANTS[role].has(action)) return false;
  if (role === 'mill_operator' && action === 'production.post') return context.costsConfirmed === true;
  return true;
}

/** الكلف وكل إشارة مشتقّة منها (ربح، هامش، «تحت الكلفة»، كلفة الفرخ). */
export function canSeeCost(role: Role): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

/** صفحة الحسابات ودفاتر الجهات والصناديق. */
export function canSeeAccounts(role: Role): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

/**
 * إدارة الموظفين (members.manage): المالك بس. دالّة صغيرة بلا جدول GRANTS حتى الشريط بحزمة الإقلاع ما يسحب
 * الجدول كلّه؛ permissions.test يثبت إنها نفس can(role, 'members.manage') لكل دور.
 */
export function canManageMembers(role: Role): boolean {
  return role === 'owner';
}

/** المبيعات والجهات: ممنوعة عن عامل القاعة ومشغّل المفقس ومشغّل المعمل. */
export function canSeeSales(role: Role): boolean {
  return role !== 'hall_worker' && role !== 'hatchery_operator' && role !== 'mill_operator';
}

/** صفّ من member_scopes: حقل واحد يحدّد النطاق. بلا صفوف = كل المنشأة، للمالك والمدير والمحاسب بس. */
export interface ScopeRow {
  divisionId?: string | null;
  siteId?: string | null;
  warehouseId?: string | null;
  hallId?: string | null;
}

/** سلسلة الشي المطلوب: القاعة ← الحقل ← الوحدة، أو المخزن ← الموقع ← الوحدة. */
export interface ScopeTarget {
  divisionId?: string;
  siteId?: string;
  warehouseId?: string;
  hallId?: string;
}

function rowCovers(row: ScopeRow, target: ScopeTarget): boolean {
  if (row.hallId) return row.hallId === target.hallId;
  if (row.warehouseId) return row.warehouseId === target.warehouseId;
  if (row.siteId) return row.siteId === target.siteId;
  if (row.divisionId) return row.divisionId === target.divisionId;
  return false;
}

export function inScope(role: Role, scopes: readonly ScopeRow[], target: ScopeTarget): boolean {
  if (role === 'owner') return true;
  if (scopes.length === 0) return role === 'manager' || role === 'accountant';
  return scopes.some((row) => rowCovers(row, target));
}
