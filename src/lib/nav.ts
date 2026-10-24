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
  Wallet,
  Warehouse,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import type { DivisionKind } from '../domain/divisions';
import { canSeeAccounts, canSeeCost, canSeeSales, type Role } from '../domain/permissions';
import { t } from './i18n';
import type { SessionState } from './session';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  division?: DivisionKind;
  /** ظهور حسب الدور. الشريط يقترح بس؛ المنع الحقيقي بالخادم. */
  visibleTo?: (role: Role) => boolean;
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
    { to: '/inventory', label: t('nav.inventory', 'كل المخازن'), icon: Warehouse, visibleTo: (r) => STORE_ROLES.has(r) },
    { to: '/sales', label: t('nav.sales', 'فواتير البيع'), icon: Receipt, visibleTo: canSeeSales },
    { to: '/accounts', label: t('nav.accounts', 'الحسابات'), icon: Wallet, visibleTo: canSeeAccounts },
    { to: '/reports', label: t('nav.reports', 'التقارير'), icon: ChartColumn, visibleTo: (r) => canSeeCost(r) || r === 'viewer' },
    { to: '/settings', label: t('nav.settings', 'الإعدادات'), icon: Settings },
  ];
}

/** بلا قاعدة مربوطة يبين الهيكل كلّه؛ ويّا منشأة مؤكّدة يبين حسب وحدات نطاق المستخدم والدور (الست بكل منشأة). */
export function visibleNav(session: SessionState): NavItem[] {
  const items = navItems();
  if (session.status !== 'ready') return items;
  const { role, divisions } = session.workspace;
  return items.filter(
    (item) => (!item.division || divisions.includes(item.division)) && (!item.visibleTo || item.visibleTo(role)),
  );
}
