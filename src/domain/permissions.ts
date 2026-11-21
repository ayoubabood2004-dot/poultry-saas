// الصلاحيات (دور × فعل): مرآة private.role_can بالخادم (parity.test خانةً خانة). هذا مرآة الواجهة بس: الحكم الحقيقي بالخادم،
// والواجهة تعرض وتقترح. «الكلّ مثل المالك بكلّ شيء» (كلمة المالك 2026-11-21، 0034): كلّ عضو فعّال يفعل كلّ فعل ويرى الكلفة
// والحسابات والمبيعات في المنشأة كلّها، وإدارة الموظفين (members.manage) وحدها للمالك. الدور اسم عمل يرتّب أزرار الرئيسية فقط.

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

// الأفعال نفسها بـprivate.actions() بالخادم (parity.test): فعل مو بالقائمة يرميه الخادم unknown_action.
export const ACTIONS = [
  // المخزن
  'receipt.draft',
  'transfer.post',
  'issue.post',
  'count.enter',
  'stock_use.post',
  // المال
  'receipt.amounts',
  'costs.load',
  'sale.post',
  'payment.post',
  'sale_return.post',
  'expense.post',
  'accounts.view',
  // المعمل
  'production.draft',
  'production.post',
  // المفقس
  'hatch.operate',
  // القاعات
  'flock_day.save',
  'weigh_ticket.draft',
  // الإدارة
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
  'party.offset',
  // إدارة الموظفين وأدوارهم: للمالك وحده (كلمة المالك 2026-10-25، وباقية بعد 2026-11-21).
  'members.manage',
  'period.unlock',
  // البيانات الأساسية
  'stores.manage',
  'parties.manage',
  'party.create',
  'cash_accounts.manage',
  'expense_categories.manage',
  'item.create',
  // الشراء والبيع
  'purchase.record',
  'sale.record',
  // الملاحظات
  'stock_note.write',
  'halls_note.write',
  'read',
] as const;

export type Action = (typeof ACTIONS)[number];

/** كلّ فعل لكلّ عضو فعّال، إلّا إدارة الموظفين فللمالك وحده. بلا دور (لا عضوية): لا فعل. */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  if (action === 'members.manage') return role === 'owner';
  return true;
}

/** الكلف وكل إشارة مشتقّة منها (ربح، هامش، «تحت الكلفة»، كلفة الفرخ): لكلّ عضو فعّال. */
export function canSeeCost(role: Role | null | undefined): boolean {
  return Boolean(role);
}

/** صفحة الحسابات ودفاتر الجهات والصناديق: لكلّ عضو فعّال. */
export function canSeeAccounts(role: Role | null | undefined): boolean {
  return Boolean(role);
}

/**
 * إدارة الموظفين (members.manage): المالك بس. دالّة صغيرة حتى الشريط بحزمة الإقلاع ما يسحب غيرها؛ permissions.test يثبت
 * إنها نفس can(role, 'members.manage') لكل دور.
 */
export function canManageMembers(role: Role | null | undefined): boolean {
  return role === 'owner';
}

/** المبيعات والجهات: لكلّ عضو فعّال. */
export function canSeeSales(role: Role | null | undefined): boolean {
  return Boolean(role);
}

/** صفّ من member_scopes كما يرسله my_workspace (يبقى بالجدول، ولا يحدّ شيئاً بعد 0034). */
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

// inScope (الشي بنطاق العضو) بـscope.ts: الشاشات الكسولة تحتاجه بس، فما يدخل حزمة الإقلاع ومسار الجلسة الحرج.
