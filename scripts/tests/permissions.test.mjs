// permissions.ts: كل خانة بجدول الصلاحيات (قسم «العمليات») تنجح للمسموح وتفشل للممنوع.
// الجدول هنا منقول من الوثيقة (ويّا تعديلات المالك بـdocs/DECISIONS.md) مستقلاً عن الشفرة، والفحص يثبت إنه يقدر يفشل على خانة مقلوبة.
import { loadSrc } from './load-src.mjs';

const ALL = ['owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator', 'hall_worker', 'accountant', 'viewer'];

const TABLE = [
  { actions: ['receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post'], roles: ['storekeeper', 'manager', 'owner'] },
  { actions: ['receipt.amounts'], roles: ['accountant', 'manager', 'owner'] },
  { actions: ['production.draft'], roles: ['mill_operator', 'manager', 'owner'] },
  { actions: ['costs.load'], roles: ['accountant', 'manager', 'owner'] },
  { actions: ['production.post'], roles: ['accountant', 'manager', 'owner'] },
  { actions: ['hatch.operate'], roles: ['hatchery_operator', 'manager', 'owner'] },
  { actions: ['flock_day.save', 'weigh_ticket.draft'], roles: ['hall_worker', 'manager', 'owner'] },
  { actions: ['sale.post', 'payment.post', 'sale_return.post', 'expense.post'], roles: ['accountant', 'manager', 'owner'] },
  { actions: ['accounts.view'], roles: ['owner', 'manager', 'accountant'] },
  { actions: ['recipe.activate', 'count.approve', 'flock.manage', 'flock.transfer', 'hatch.zero_saleable', 'expired.destroy', 'expired.release'], roles: ['manager', 'owner'] },
  { actions: ['void', 'receipt.revalue', 'party.adjust', 'opening.post', 'period.lock'], roles: ['manager', 'owner'] },
  // كلمة المالك 2026-10-24: «بلا سقوف، المقاصّة للمالك بس».
  { actions: ['party.offset'], roles: ['owner'] },
  // كلمة المالك 2026-10-25: «إضافة الموظفين وأدوارهم: صاحب المنشأة بس».
  { actions: ['members.manage'], roles: ['owner'] },
  // كلمة المالك 2026-10-25: «فتح فترة مقفلة: المالك بس».
  { actions: ['period.unlock'], roles: ['owner'] },
  { actions: ['read'], roles: ALL },
];

function mismatches(can, table) {
  const out = [];
  for (const row of table) {
    for (const action of row.actions) {
      for (const role of ALL) {
        const expected = row.roles.includes(role);
        if (can(role, action) !== expected) out.push(`${role} × ${action}: المتوقّع ${expected}`);
      }
    }
  }
  return out;
}

export default async function (t) {
  const p = await loadSrc('src/domain/permissions.ts');

  const found = mismatches(p.can, TABLE);
  t.same(found, [], 'كل خانات الجدول');
  const covered = TABLE.flatMap((row) => row.actions).sort();
  t.same(covered, [...p.ACTIONS].sort(), 'الجدول يغطّي كل فعل بالشفرة، ولا فعل زايد');
  t.same([...p.ROLES].sort(), [...ALL].sort(), 'الأدوار الثمانية');

  const flipped = TABLE.map((row, index) => (index === 0 ? { ...row, roles: [...row.roles, 'viewer'] } : row));
  t.ok(mismatches(p.can, flipped).length > 0, 'الفحص يفشل على خانة مقلوبة');

  // مشغّل المعمل يرحّل بس بعد ما تنختم الكلف.
  t.ok(!p.can('mill_operator', 'production.post'), 'مشغّل المعمل قبل ختم الكلف ← ممنوع');
  t.ok(p.can('mill_operator', 'production.post', { costsConfirmed: true }), 'بعد ختم الكلف ← مسموح');

  // الكلف والحسابات للمالك والمدير والمحاسب بس، والمبيعات ممنوعة عن عامل القاعة ومشغّلَي المفقس والمعمل.
  for (const role of ALL) {
    const accounting = ['owner', 'manager', 'accountant'].includes(role);
    t.eq(p.canSeeCost(role), accounting, `canSeeCost(${role})`);
    t.eq(p.canSeeAccounts(role), accounting, `canSeeAccounts(${role})`);
    t.eq(p.canSeeSales(role), !['hall_worker', 'hatchery_operator', 'mill_operator'].includes(role), `canSeeSales(${role})`);
    t.eq(p.canManageMembers(role), p.can(role, 'members.manage'), `canManageMembers(${role}) = can(members.manage)`);
  }

  // النطاق: عامل قاعة نطاقه قاعة 1 يحفظ جولة قاعة 3 ← رفض.
  const hall1 = [{ hallId: 'hall-1' }];
  t.ok(p.inScope('hall_worker', hall1, { hallId: 'hall-1', siteId: 'site-1', divisionId: 'broiler' }), 'قاعة نطاقه');
  t.ok(!p.inScope('hall_worker', hall1, { hallId: 'hall-3', siteId: 'site-1', divisionId: 'broiler' }), 'قاعة 3 برّا نطاقه');
  t.ok(!p.inScope('storekeeper', [], { warehouseId: 'w1' }), 'بلا صفوف نطاق: أمين المخزن ما يشوف شي');
  t.ok(p.inScope('accountant', [], { warehouseId: 'w1' }), 'بلا صفوف: المحاسب كل المنشأة');
  t.ok(p.inScope('owner', hall1, { hallId: 'hall-9' }), 'المالك كل شي');
  t.ok(p.inScope('manager', [{ divisionId: 'hatchery' }], { warehouseId: 'w2', siteId: 's2', divisionId: 'hatchery' }), 'نطاق بالوحدة يغطّي مخازنها');
  t.ok(!p.inScope('manager', [{ siteId: 's1' }], { warehouseId: 'w2', siteId: 's2', divisionId: 'hatchery' }), 'نطاق موقع ما يغطّي موقعاً ثانياً');
}
