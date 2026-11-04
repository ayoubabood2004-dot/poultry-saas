import { Drumstick, Egg, Factory, House, Settings, UserRound, Users, Wallet, Warehouse, type LucideIcon } from 'lucide-react';
import type { DivisionKind } from '../domain/divisions';
import { canManageMembers, type Role } from '../domain/permissions';
import type { Workspace } from '../domain/workspace';
import { t } from './i18n';
import type { SessionState } from './session';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  division?: DivisionKind;
  /**
   * ظهور حسب ما أكّده الخادم (my_workspace: can_see_* والدور). الشريط يقترح بس؛ المنع الحقيقي بالخادم
   * (السياسات المقيِّدة وجدول الصلاحيات).
   */
  visibleTo?: (workspace: Workspace) => boolean;
}

/**
 * من يشوف تبويب «المخزن» (كلمة المالك 2026-11-04: تبويب واحد وداخله كل المخازن): أدوار المخزن والكلفة، ومعهم مشغّلا المعمل
 * والمفقس بعد شطب بندي مخازنهما — بندهم الواحد يفتح مخازن نطاقهم. عامل القاعة برّاها (ما له مخزن). والرئيسية تتبعه ببطاقة
 * «المخزن» (HomePage) حتى ما تختفي بطاقة أمين مخزن نطاقه وحدة وحدة (الأدوية مثلاً) بلا «العامّة».
 */
export const STORE_ROLES: ReadonlySet<Role> = new Set<Role>([
  'owner',
  'manager',
  'storekeeper',
  'accountant',
  'viewer',
  'mill_operator',
  'hatchery_operator',
]);

export function navItems(): NavItem[] {
  return [
    { to: '/', label: t('nav.home', 'الرئيسية'), icon: House },
    // تبويب واحد اسمه «المخزن» (كلمة المالك 2026-11-04: «ما أريد هذه المخازن الجانبية بنوداً… أريد تبويباً واحداً وداخله
    // المخازن الجانبية»): بند `/inventory` وحده، وداخله بطاقة لكل مخزن بنطاق المستخدم ومعها التحكّم بها. فلا بنود للمخازن
    // بالوحدات (المعمل والمفقس والأدوية والعامّة): لوحاتها تبقى تنفتح بالرابط بس (StockRoutes). ومعمل العلف شغّال (0015،
    // كلمة المالك 2026-11-03) ببنده: خلطاته وإنتاجه، لا مخازنه. وحقول اللحم والبيض شغّالة من المرحلة 2 (النسخة الأولى بكلمة
    // المالك 2026-10-31: القاعات والأفواج والجولة اليومية). المفقس والمبيعات والتقارير صفحات تخطيط بلا شاشة شغّالة: مساراتها
    // باقية وتنفتح بالرابط، بس ما تنعرض بالشريط ولا بالرئيسية.
    { to: '/broiler', label: t('nav.broiler', 'حقول اللحم'), icon: Drumstick, division: 'broiler' },
    { to: '/layers', label: t('nav.layers', 'حقول البيض'), icon: Egg, division: 'layer' },
    { to: '/mill', label: t('nav.mill', 'معمل العلف'), icon: Factory, division: 'feed_mill' },
    { to: '/inventory', label: t('nav.store', 'المخزن'), icon: Warehouse, visibleTo: (w) => STORE_ROLES.has(w.role) },
    { to: '/accounts', label: t('nav.accounts', 'الحسابات'), icon: Wallet, visibleTo: (w) => w.canSeeAccounts },
    { to: '/staff', label: t('nav.staff', 'الموظفون'), icon: Users, visibleTo: (w) => canManageMembers(w.role) },
    { to: '/account', label: t('nav.account', 'حسابي'), icon: UserRound },
    { to: '/settings', label: t('nav.settings', 'الإعدادات'), icon: Settings },
  ];
}

/** بلا قاعدة مربوطة يبين الهيكل كلّه؛ ويّا منشأة مؤكّدة يبين حسب وحدات نطاق المستخدم وما أكّده الخادم. */
export function visibleNav(session: SessionState): NavItem[] {
  const items = navItems();
  if (session.status !== 'ready') return items;
  const { workspace } = session;
  return items.filter(
    (item) => (!item.division || workspace.divisions.includes(item.division)) && (!item.visibleTo || item.visibleTo(workspace)),
  );
}
