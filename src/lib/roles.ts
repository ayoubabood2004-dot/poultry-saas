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

/** شنو يسوي كل دور، سطر واحد لاختيار الدور بالدعوة. */
export function roleDescription(role: Role): string {
  switch (role) {
    case 'owner':
      return t('role.owner.about', 'كل شيء، ومنه إدارة الموظفين.');
    case 'manager':
      return t('role.manager.about', 'كل شيء عدا إدارة الموظفين والمقاصّة وفتح فترة مقفلة.');
    case 'storekeeper':
      return t('role.storekeeper.about', 'الاستلام بالكميات والتحويل والصرف والجرد.');
    case 'mill_operator':
      return t('role.mill_operator.about', 'إنتاج العلف، ويحفظ الوجبة نهائياً بعد ختم الكلف.');
    case 'hatchery_operator':
      return t('role.hatchery_operator.about', 'تشغيل وجبات المفقس.');
    case 'hall_worker':
      return t('role.hall_worker.about', 'الجولة اليومية وتذكرة الوزن، دون كلف ولا مبيعات.');
    case 'accountant':
      return t('role.accountant.about', 'المبالغ والمبيعات والتسديد والمصاريف والحسابات.');
    case 'viewer':
      return t('role.viewer.about', 'قراءة فقط.');
  }
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
