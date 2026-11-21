import type { DivisionKind } from '../domain/divisions';
import { ROLES, type Role } from '../domain/permissions';
import { t } from './i18n';

// أسماء الأدوار والوحدات بالعرض (FOUNDATION ١٣٨). مفاتيح t() حرفية (i18n-guard يرفض المفتاح المركّب)،
// وأسماء الوحدات نفس مفاتيح القائمة ونصّها.

export function roleLabel(role: Role): string {
  switch (role) {
    case 'owner':
      return t('role.owner', 'المالك');
    case 'manager':
      return t('role.manager', 'المدير');
    case 'storekeeper':
      return t('role.storekeeper', 'أمين المخزن');
    case 'mill_operator':
      return t('role.mill_operator', 'مشغّل المعمل');
    case 'hatchery_operator':
      return t('role.hatchery_operator', 'مشغّل المفقس');
    case 'hall_worker':
      return t('role.hall_worker', 'عامل القاعة');
    case 'accountant':
      return t('role.accountant', 'المحاسب');
    case 'viewer':
      return t('role.viewer', 'المشاهد');
  }
}

/**
 * شنو يسوي كل دور، سطر واحد لاختيار الدور بالدعوة. «الكلّ مثل المالك بكلّ شيء» (كلمة المالك 2026-11-21، 0034): كلّ عضو يرى ويفعل
 * كلّ شيء في المنشأة، وإدارة الموظفين للمالك وحده؛ فالدور اسم عمل يرتّب أزرار الرئيسية فقط.
 */
export function roleDescription(role: Role): string {
  if (role === 'owner') return t('role.owner.about', 'يرى ويفعل كلّ شيء في المنشأة، ومنه إدارة الموظفين.');
  return t('role.member.about', 'يرى ويفعل كلّ شيء في المنشأة عدا إدارة الموظفين؛ والدور يرتّب أزرار الرئيسية فقط.');
}

export const ROLE_OPTIONS: readonly Role[] = ROLES;

export function divisionLabel(kind: DivisionKind): string {
  switch (kind) {
    case 'feed_mill':
      return t('nav.mill', 'معمل العلف');
    case 'broiler':
      return t('nav.broiler', 'حقول اللحم');
    case 'layer':
      return t('nav.layers', 'حقول البيض');
    case 'hatchery':
      return t('nav.hatchery', 'المفقس');
    case 'medicine':
      return t('nav.medicine', 'مخزن الأدوية');
    case 'general':
      return t('nav.general', 'المخازن العامة');
  }
}
