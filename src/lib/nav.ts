import {
  Bird,
  ChartColumn,
  Drumstick,
  Egg,
  Fuel,
  House,
  Pill,
  Receipt,
  Settings,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
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

const STORE_ROLES: ReadonlySet<Role> = new Set<Role>(['owner', 'manager', 'storekeeper', 'accountant', 'viewer']);

export function navItems(): NavItem[] {
  return [
    { to: '/', label: t('nav.home', 'الرئيسية'), icon: House },
    { to: '/mill', label: t('nav.mill', 'معمل العلف'), icon: Wheat, division: 'feed_mill' },
    { to: '/broiler', label: t('nav.broiler', 'حقول اللحم'), icon: Drumstick, division: 'broiler' },
    { to: '/layers', label: t('nav.layers', 'حقول البيض'), icon: Egg, division: 'layer' },
    { to: '/hatchery', label: t('nav.hatchery', 'المفقس'), icon: Bird, division: 'hatchery' },
    { to: '/inventory/medicine', label: t('nav.medicine', 'مخزن الأدوية'), icon: Pill, division: 'medicine' },
    { to: '/inventory/general', label: t('nav.general', 'المخازن العامة'), icon: Fuel, division: 'general' },
    { to: '/inventory', label: t('nav.inventory', 'كل المخازن'), icon: Warehouse, visibleTo: (w) => STORE_ROLES.has(w.role) },
    { to: '/sales', label: t('nav.sales', 'فواتير البيع'), icon: Receipt, visibleTo: (w) => w.canSeeSales },
    { to: '/accounts', label: t('nav.accounts', 'الحسابات'), icon: Wallet, visibleTo: (w) => w.canSeeAccounts },
    { to: '/reports', label: t('nav.reports', 'التقارير'), icon: ChartColumn, visibleTo: (w) => w.canSeeCost || w.role === 'viewer' },
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
