// my_workspace() بالشكلين وجواب قبول الدعوة: كل خانة تنفحص، ودور أو وحدة أو علامة ناقصة ترمي بدل ما تنقبل بصمت،
// والرمز الغلط نتيجة {ok: false} بمحاولاته مو مساحة عمل (DECISIONS: عقد الرمز الغلط).
import { loadSrc } from './load-src.mjs';

const MEMBER = {
  user_id: 'u-1',
  org_id: 'o-1',
  org_name: 'مزرعة الأمل',
  member_id: 'm-1',
  display_name: 'أبو علي',
  phone: '9647701234567',
  role: 'owner',
  scopes: [{ division_id: 'd-1' }],
  divisions: ['broiler', 'feed_mill'],
  can_see_cost: true,
  can_see_accounts: true,
  can_see_sales: true,
  invites: [{ member_id: 'm-9', org_name: 'مزرعة النور', role: 'viewer', display_name: 'ضيف', invited_at: '2026-10-25T08:00:00+00:00' }],
  subscription: 'unknown',
  confirmed_at: '2026-10-25T09:30:00.123+00:00',
};

const NO_ORG = { user_id: 'u-2', org_id: null, phone: null, invites: [], confirmed_at: '2026-10-25T09:30:00+00:00' };

export default async function (t) {
  const w = await loadSrc('src/domain/workspace.ts');
  const shapeError = (value) => {
    try {
      w.parseWorkspace(value);
      return 'no_throw';
    } catch (error) {
      return error instanceof w.WorkspaceShapeError ? error.field : `other:${error.message}`;
    }
  };

  const member = w.parseWorkspace(MEMBER);
  t.eq(member.kind, 'member', 'عضو بمنشأة');
  t.same(
    [member.workspace.orgName, member.workspace.memberId, member.workspace.phone, member.workspace.role, member.workspace.divisions, member.workspace.scopes],
    ['مزرعة الأمل', 'm-1', '9647701234567', 'owner', ['broiler', 'feed_mill'], [{ divisionId: 'd-1' }]],
    'خانات العضو كما أرسلها الخادم',
  );
  t.same([member.workspace.canSeeCost, member.workspace.canSeeAccounts, member.workspace.canSeeSales], [true, true, true], 'علامات الإخفاء من الخادم');
  t.eq(member.workspace.confirmedAt, Date.parse('2026-10-25T09:30:00.123Z'), 'وقت التأكيد رقماً');
  t.same(member.workspace.invites.map((i) => [i.memberId, i.orgName, i.role]), [['m-9', 'مزرعة النور', 'viewer']], 'دعوات منشآت ثانية تنقرا للعضو');

  const none = w.parseWorkspace(NO_ORG);
  t.same([none.kind, none.account.userId, none.account.phone, none.account.invites], ['no_org', 'u-2', null, []], 'بلا منشأة: الحساب ورقمه ودعواته');

  t.eq(shapeError({ ...MEMBER, role: 'boss' }), 'role', 'دور مو من الثمانية يرمي');
  t.eq(shapeError({ ...MEMBER, divisions: ['broiler', 'farm'] }), 'divisions', 'وحدة مو من الست ترمي');
  t.eq(shapeError({ ...MEMBER, can_see_cost: undefined }), 'can_see_cost', 'علامة ناقصة ترمي (ما تنفهم «لا»)');
  t.eq(shapeError({ ...MEMBER, can_see_sales: 'true' }), 'can_see_sales', 'علامة نصّاً ترمي');
  t.eq(shapeError({ ...MEMBER, confirmed_at: 'yesterday' }), 'confirmed_at', 'وقت مو مفهوم يرمي');
  t.eq(shapeError({ ...MEMBER, subscription: 'gold' }), 'subscription', 'حالة اشتراك مو معروفة ترمي');
  t.eq(shapeError({ ...MEMBER, org_id: undefined }), 'org_id', 'org_id غايب مو null: يرمي (مو «بلا منشأة»)');
  t.eq(shapeError({ ...NO_ORG, invites: [{ ...MEMBER.invites[0], role: 'admin' }] }), 'invites.role', 'دور الدعوة يتفحص هم');
  // 0005: صفّ النطاق بمفاتيحه الثلاثة. الهدف بمفتاحه (موقع أو مخزن، واحد بس)، وdivision_id دائماً نصّ غير فارغ (وحدة الهدف):
  // المحلّل المنشور قبل 0005 يقرا كل صفّ بـtext(division_id)، فصفّ بلاه يطيّح جلسة نسخة قديمة لحد ما تتحدّث (FOUNDATION ٢٣٠).
  const scoped = w.parseWorkspace({
    ...MEMBER,
    scopes: [
      { division_id: 'd-1', site_id: null, warehouse_id: null },
      { division_id: 'd-1', site_id: 's-1', warehouse_id: null },
      { division_id: 'd-1', site_id: null, warehouse_id: 'w-1' },
    ],
  });
  t.same(scoped.workspace.scopes, [{ divisionId: 'd-1' }, { siteId: 's-1' }, { warehouseId: 'w-1' }], 'النطاق بالوحدة والموقع والمخزن، كل صفّ بهدفه (وحدة الموقع والمخزن للنسخ القديمة بس)');
  t.eq(shapeError({ ...MEMBER, scopes: [{ division_id: 'd-1', site_id: 's-1', warehouse_id: 'w-1' }] }), 'scopes', 'صفّ بموقع ومخزن سوا يرمي');
  t.eq(shapeError({ ...MEMBER, scopes: [{ division_id: null, site_id: 's-1', warehouse_id: null }] }), 'scopes', 'صفّ بلا division_id يرمي (عقد النسخ المنشورة)');
  t.eq(shapeError({ ...MEMBER, scopes: [{ division_id: null, site_id: null, warehouse_id: null }] }), 'scopes', 'صفّ بلا هدف يرمي');
  t.eq(shapeError({ ...MEMBER, scopes: [{ division_id: '', site_id: null, warehouse_id: null }] }), 'scopes', 'هدف نصّه فارغ ما يُعدّ هدفاً');
  t.eq(shapeError({ ...MEMBER, scopes: [{ division_id: 'd-1', warehouse_id: 7 }] }), 'warehouse_id', 'هدف مو نصّ يرمي');
  t.eq(shapeError(null), 'workspace', 'جواب فارغ يرمي');
  t.eq(shapeError([MEMBER]), 'workspace', 'مصفوفة مو كائن ترمي');

  const wrong = w.parseAcceptResult({ error: 'invite_code_wrong', tries_left: 3, hint: 'الرمز غير صحيح. بقيت 3 محاولات.' });
  t.same(wrong, { ok: false, hint: 'الرمز غير صحيح. بقيت 3 محاولات.', triesLeft: 3 }, 'الرمز الغلط نتيجة بمحاولاته، مو مساحة عمل');
  const accepted = w.parseAcceptResult(MEMBER);
  t.same([accepted.ok, accepted.result.kind], [true, 'member'], 'القبول يرجّع مساحة العمل');
  t.throws(() => w.parseAcceptResult({ error: 'invite_code_wrong', tries_left: -1, hint: 'x' }), 'محاولات سالبة ترمي', /tries_left/);
  t.throws(() => w.parseAcceptResult({ error: 'something_else' }), 'خطأ مو معروف بالجواب يرمي (ما ينقبل نجاحاً)', /error/);
}
