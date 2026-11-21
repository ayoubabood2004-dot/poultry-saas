// permissions.ts: كل خانة بجدول الصلاحيات تنجح للمسموح وتفشل للممنوع.
// الجدول هنا مكتوب من كلمة المالك مستقلاً عن الشفرة، والفحص يثبت إنه يقدر يفشل على خانة مقلوبة. «الكلّ مثل المالك بكلّ شيء» (كلمة
// المالك 2026-11-21، 0034): كلّ دور يفعل كلّ فعل ويرى الكلفة والحسابات والمبيعات في المنشأة كلّها، وإدارة الموظفين للمالك وحده.
import { loadSrc } from './load-src.mjs';

const ALL = ['owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator', 'hall_worker', 'accountant', 'viewer'];

const EVERY = [
  'receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post',
  'receipt.amounts', 'costs.load', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
  'production.draft', 'production.post', 'hatch.operate', 'flock_day.save', 'weigh_ticket.draft',
  'recipe.activate', 'count.approve', 'flock.manage', 'flock.transfer', 'hatch.zero_saleable', 'expired.destroy', 'expired.release',
  'void', 'receipt.revalue', 'party.adjust', 'opening.post', 'period.lock',
  // كانت للمالك وحده (المقاصّة 2026-10-24 وفتح الفترة 2026-10-25)، وصارت للكلّ بكلمة 2026-11-21.
  'party.offset', 'period.unlock',
  'stores.manage', 'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage', 'item.create',
  'purchase.record', 'sale.record', 'stock_note.write', 'halls_note.write', 'read',
];

const TABLE = [
  { actions: EVERY, roles: ALL },
  // كلمة المالك 2026-10-25: «إضافة الموظفين وأدوارهم: صاحب المنشأة بس»، وباقية بعد 2026-11-21.
  { actions: ['members.manage'], roles: ['owner'] },
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
  const sc = await loadSrc('src/domain/scope.ts');

  const found = mismatches(p.can, TABLE);
  t.same(found, [], 'كل خانات الجدول');
  const covered = TABLE.flatMap((row) => row.actions).sort();
  t.same(covered, [...p.ACTIONS].sort(), 'الجدول يغطّي كل فعل بالشفرة، ولا فعل زايد');
  t.same([...p.ROLES].sort(), [...ALL].sort(), 'الأدوار الثمانية');

  const flipped = TABLE.map((row, index) => (index === 1 ? { ...row, roles: [...row.roles, 'viewer'] } : row));
  t.ok(mismatches(p.can, flipped).length > 0, 'الفحص يفشل على خانة مقلوبة');

  // مشغّل المعمل يرحّل كغيره (لا انتظار لختم الكلف)، وبلا دور لا فعل.
  t.ok(p.can('mill_operator', 'production.post'), 'مشغّل المعمل يرحّل دفعة الإنتاج');
  t.ok(!p.can(null, 'read') && !p.can(undefined, 'read'), 'بلا دور (لا عضوية): ولا فعل');

  // الكلف والحسابات والمبيعات لكلّ دور، وإدارة الموظفين للمالك.
  for (const role of ALL) {
    t.eq(p.canSeeCost(role), true, `canSeeCost(${role})`);
    t.eq(p.canSeeAccounts(role), true, `canSeeAccounts(${role})`);
    t.eq(p.canSeeSales(role), true, `canSeeSales(${role})`);
    t.eq(p.canManageMembers(role), p.can(role, 'members.manage'), `canManageMembers(${role}) = can(members.manage)`);
  }
  t.same([p.canSeeCost(null), p.canSeeAccounts(null), p.canSeeSales(null), p.canManageMembers(null)], [false, false, false, false], 'بلا دور: لا كلفة ولا حسابات ولا مبيعات ولا موظفين');

  // النطاق: المنشأة كلّها لكلّ عضو، ولو كانت له صفوف نطاق قديمة.
  for (const role of ALL) t.ok(sc.inScope(role), `inScope(${role}): المنشأة كلّها`);
  t.ok(sc.inScope('hall_worker', [{ hallId: 'hall-1' }], { hallId: 'hall-3' }), 'عامل قاعة بصفّ نطاق قديم (قاعة 1) يرى قاعة 3');
  t.ok(!sc.inScope(null), 'بلا دور: لا شيء');
}
