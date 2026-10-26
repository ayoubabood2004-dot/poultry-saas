// مصفوفة الأدوار (FOUNDATION ٨٦٥ role-matrix-check، الخطّة §2.12): كل دالّة بقائمة السماح تننادى بكل دور من الثمانية بدور
// authenticated حقيقي، والمسموح ينجح (ضابط إيجابي بكل خانة) والممنوع يرجع forbidden، ودوالّ الهويّة ترجع قيمة كل دور
// كما بجدول الصلاحيات (DECISIONS). المرحلة 0 هنا من أوّل يوم حتى سجلّ التغطية (run.mjs) يفحص خانات حقيقية مو صفراً،
// وكل حزمة بالمرحلة 1 تزيد صفوف دوالّها (الخطّة تبدي الملف بـWP2؛ بدأ بـWP0 بدوالّ المرحلة 0). دالّة جديدة بقائمة السماح
// بلا صفّ هنا تفشّل الفحص.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from './db.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = JSON.parse(readFileSync(path.join(DIR, 'allowlist.json'), 'utf8'));

const id = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477050000${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
const USERS = Object.fromEntries(ROLES.map((role, i) => [role, id(i + 1)]));
const SPARE = { guest: id(20), pending: id(21) };

const all = (outcome) => Object.fromEntries(ROLES.map((role) => [role, outcome]));
const only = (allowed, yes = 'ok', no = 'forbidden') => Object.fromEntries(ROLES.map((role) => [role, allowed.includes(role) ? yes : no]));

export default async function (t, db) {
  for (const [i, role] of ROLES.entries()) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [USERS[role], phone(i + 1)]);
  }
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now()), ($3, $4, now())', [SPARE.guest, phone(20), SPARE.pending, phone(21)]);
  await db.asUser(USERS.owner, (q) => q("select public.create_my_org('مزرعة المصفوفة', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [USERS.owner])).rows[0].org_id;
  const division = async (kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const broiler = await division('broiler');
  const layer = await division('layer');
  const member = {};
  for (const [i, role] of ROLES.entries()) {
    if (role === 'owner') continue;
    const scope = role === 'hall_worker' ? [broiler] : [];
    member[role] = await db.asUser(USERS.owner, async (q) => (await q('select public.add_member($1, $2, $3, $4::uuid[]) as id', [local(phone(i + 1)), role, role, scope])).rows[0].id, { commit: true });
    await db.acceptInvite(USERS.owner, USERS[role], member[role]);
  }
  member.owner = (await db.admin('select id from public.members where user_id = $1', [USERS.owner])).rows[0].id;
  const pending = await db.asUser(USERS.owner, async (q) => (await q("select public.add_member($1, 'viewer', 'مدعوّ') as id", [local(phone(21))])).rows[0].id, { commit: true });

  // كل صفّ: النداء ونتيجة كل دور. value: ترجع القيمة بالنتيجة (ok:<قيمة>) لدوالّ الهويّة.
  const ROWS = {
    accept_invite_code: { sql: (role) => ["select public.accept_invite_code($1, '000000')", [member[role]]], expect: all('invite_not_found') },
    add_member: { sql: () => ["select public.add_member($1, 'viewer', 'ضيف')", [local(phone(20))]], expect: only(['owner']) },
    app_today: { sql: () => ["select public.app_today() = (now() at time zone 'Asia/Baghdad')::date as v", []], value: true, expect: all('ok:true') },
    archive_member: { sql: () => ['select public.archive_member($1)', [member.viewer]], expect: only(['owner']) },
    auth_org: { sql: () => ['select public.auth_org() = $1::uuid as v', [org]], value: true, expect: all('ok:true') },
    can: { sql: () => ["select public.can('members.manage', false) as v", []], value: true, expect: only(['owner'], 'ok:true', 'ok:false') },
    can_see_accounts: { sql: () => ['select public.can_see_accounts() as v', []], value: true, expect: only(['owner', 'manager', 'accountant'], 'ok:true', 'ok:false') },
    can_see_cost: { sql: () => ['select public.can_see_cost() as v', []], value: true, expect: only(['owner', 'manager', 'accountant'], 'ok:true', 'ok:false') },
    can_see_sales: { sql: () => ['select public.can_see_sales() as v', []], value: true, expect: only(['owner', 'manager', 'storekeeper', 'accountant', 'viewer'], 'ok:true', 'ok:false') },
    create_my_org: { sql: () => ["select public.create_my_org('منشأة ثانية', 'س')", []], expect: all('already_member') },
    decline_and_block: { sql: (role) => ['select public.decline_and_block($1)', [member[role]]], expect: all('invite_not_found') },
    decline_invite: { sql: (role) => ['select public.decline_invite($1)', [member[role]]], expect: all('invite_not_found') },
    in_scope_division: { sql: () => ['select public.in_scope_division($1) as v', [broiler]], value: true, expect: only(['owner', 'manager', 'accountant', 'hall_worker'], 'ok:true', 'ok:false') },
    invite_code: { sql: () => ['select length(public.invite_code($1)) as v', [pending]], value: true, expect: only(['owner'], 'ok:6') },
    leave_my_org: { sql: () => ['select public.leave_my_org()', []], expect: { ...all('ok'), owner: 'last_owner' } },
    my_workspace: { sql: () => ["select public.my_workspace() ->> 'role' as v", []], value: true, expect: Object.fromEntries(ROLES.map((role) => [role, `ok:${role}`])) },
    set_member_role: { sql: () => ["select public.set_member_role($1, 'viewer')", [member.hall_worker]], expect: only(['owner']) },
    set_member_scopes: { sql: () => ['select public.set_member_scopes($1, array[$2]::uuid[])', [member.hall_worker, layer]], expect: only(['owner']) },
    set_period_lock: { sql: () => ['select public.set_period_lock(public.app_today() - 3)', []], expect: only(['owner', 'manager']) },
  };

  const allowlisted = ALLOWLIST.authenticated.map((signature) => signature.slice('public.'.length, signature.indexOf('('))).sort();
  t.same(Object.keys(ROWS).sort(), allowlisted, `المصفوفة تغطّي قائمة السماح بالضبط (${allowlisted.length} دالّة)`);

  let cells = 0;
  for (const [fn, row] of Object.entries(ROWS)) {
    const got = {};
    for (const role of ROLES) {
      const [sql, params] = row.sql(role);
      cells += 1;
      try {
        const result = await db.asUser(USERS[role], (q) => q(sql, params));
        got[role] = row.value ? `ok:${result.rows[0].v}` : 'ok';
      } catch (error) {
        got[role] = error.message;
      }
    }
    t.same(got, row.expect, `${fn}: كل دور بنتيجته`);
  }
  t.eq(cells, allowlisted.length * ROLES.length, `خانات المصفوفة: ${allowlisted.length} دالّة × ${ROLES.length} أدوار`);
  // المدير ينجح بكل خانة تشغيلية والمحاسب يفشل بيها (FOUNDATION ٥٤٤، ٨٦٥): بالمرحلة 0 الخانة التشغيلية قفل الفترة.
  t.same([ROWS.set_period_lock.expect.manager, ROWS.set_period_lock.expect.accountant], ['ok', 'forbidden'], 'المدير يقفل الفترة والمحاسب لا');
}
