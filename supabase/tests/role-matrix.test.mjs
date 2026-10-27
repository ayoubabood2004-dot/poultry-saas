// مصفوفة الأدوار (FOUNDATION ٨٦٥ role-matrix-check، الخطّة §2.12): كل دالّة بقائمة السماح تننادى بكل دور من الثمانية بدور
// authenticated حقيقي، والمسموح ينجح (ضابط إيجابي بكل خانة) والممنوع يرجع forbidden، ودوالّ الهويّة ترجع قيمة كل دور
// كما بجدول الصلاحيات (DECISIONS). المرحلة 0 هنا من أوّل يوم حتى سجلّ التغطية (run.mjs) يفحص خانات حقيقية مو صفراً،
// وكل حزمة بالمرحلة 1 تزيد صفوف دوالّها (الخطّة تبدي الملف بـWP2؛ بدأ بـWP0 بدوالّ المرحلة 0). دالّة جديدة بقائمة السماح
// بلا صفّ هنا تفشّل الفحص.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { ROLES } from './db.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = JSON.parse(readFileSync(path.join(DIR, 'allowlist.json'), 'utf8'));
const CLASSES = JSON.parse(readFileSync(path.join(DIR, 'classes.json'), 'utf8'));

const id = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477050000${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
const USERS = Object.fromEntries(ROLES.map((role, i) => [role, id(i + 1)]));
const SPARE = { guest: id(20), pending: id(21) };

const all = (outcome) => Object.fromEntries(ROLES.map((role) => [role, outcome]));
const only = (allowed, yes = 'ok', no = 'forbidden') => Object.fromEntries(ROLES.map((role) => [role, allowed.includes(role) ? yes : no]));

export default async function (t, db) {
  const { can } = await loadSrc('src/domain/permissions.ts');
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

  // المرحلة 1 (WP2): البذور (موقع المعمل، والمخزن العام) وحقل لحم بمخزنه ومادّة، والأمين بنطاق المخزن العام بس.
  const general = await division('general');
  const millSite = (await db.admin("select s.id from public.sites s join public.divisions d on d.id = s.division_id where s.org_id = $1 and d.kind = 'feed_mill'", [org])).rows[0].id;
  const generalStore = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'general'", [org])).rows[0].id;
  const farm = await db.asUser(
    USERS.owner,
    async (q) => {
      const site = (await q("insert into public.sites (division_id, name, kind) values ($1, 'حقل الرحمة', 'farm') returning id", [broiler])).rows[0].id;
      const store = (await q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل الرحمة', 'farm') returning id", [broiler, site])).rows[0].id;
      const item = (await q("insert into public.items (name, kind, base_unit) values ('ذرة صفراء', 'raw', 'kg') returning id")).rows[0].id;
      await q("select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [member.storekeeper, generalStore]);
      return { site, store, item };
    },
    { commit: true },
  );

  // كل صفّ: النداء ونتيجة كل دور. value: ترجع القيمة بالنتيجة (ok:<قيمة>) لدوالّ الهويّة.
  const ROWS = {
    accept_invite_code: { sql: (role) => ["select public.accept_invite_code($1, '000000')", [member[role]]], expect: all('invite_not_found') },
    add_member: { sql: () => ["select public.add_member($1, 'viewer', 'ضيف')", [local(phone(20))]], expect: only(['owner']) },
    // الدعوة بنطاق موقع أو مخزن بنداء واحد (0005): المالك بس، مثل add_member.
    add_member_v2: { sql: () => ["select public.add_member_v2($1, 'storekeeper', 'ضيف', '{}', '{}', array[$2]::uuid[])", [local(phone(20)), generalStore]], expect: only(['owner']) },
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
    // المرحلة 1 (WP2، §2.12): التوائم لكل عضو (read)، والنطاق بالموقع والمخزن (الأمين مخزنه بس، وعامل القاعة وحدته بس)، ويوم
    // التشغيل للمدير (opening.post، Q1)، والنطاق الجديد للمالك بس (members.manage).
    find_item_twins: { sql: () => ["select jsonb_array_length(public.find_item_twins('ذره صفراء', '{}')) as v", []], value: true, expect: all('ok:1') },
    in_scope_site: { sql: () => ['select public.in_scope_site($1) as v', [millSite]], value: true, expect: only(['owner', 'manager', 'accountant'], 'ok:true', 'ok:false') },
    in_scope_wh: { sql: () => ['select public.in_scope_wh($1) as v', [generalStore]], value: true, expect: only(['owner', 'manager', 'accountant', 'storekeeper'], 'ok:true', 'ok:false') },
    set_division_go_live: { sql: () => ['select public.set_division_go_live($1, public.app_today() - 1)', [general]], expect: only(['owner', 'manager']) },
    set_member_scopes_v2: { sql: () => ["select public.set_member_scopes_v2($1, array[$2]::uuid[], '{}', '{}')", [member.hall_worker, layer]], expect: only(['owner']) },
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
  t.same([ROWS.set_division_go_live.expect.manager, ROWS.set_division_go_live.expect.accountant], ['ok', 'forbidden'], 'المدير يحدّد يوم التشغيل والمحاسب لا');

  // ── الكتابة المباشرة بالبيانات الأساسية (Q1، §2.12): كل جدول × دور، إدخال وتعديل، والمسموح بضابط إيجابي بكل خانة ─────────
  // الإدخال الممنوع يرفضه RLS (42501)، والتعديل الممنوع صفر صفوف (USING يحجب الصفّ). stores.manage للمالك والمدير، وفئات
  // المصاريف (expense_categories.manage) للمحاسب هم.
  const STORES = ['owner', 'manager'];
  const EXPENSES = ['owner', 'manager', 'accountant'];
  const someId = async (table) => (await db.admin(`select id from public.${table} where org_id = $1 order by created_at, id limit 1`, [org])).rows[0].id;
  const pack = await someId('pack_types');
  const category = await db.asUser(USERS.owner, async (q) => (await q("insert into public.item_categories (name) values ('أعلاف') returning id")).rows[0].id, { commit: true });
  const unit = await db.asUser(USERS.owner, async (q) => (await q("insert into public.item_units (item_id, label, factor_to_base) values ($1, 'شوال', 70) returning id", [farm.item])).rows[0].id, { commit: true });
  const expense = await someId('expense_categories');
  const WRITES = {
    sites: {
      allowed: STORES,
      insert: ["insert into public.sites (division_id, name, kind) values ($1, 'حقل النور', 'farm')", [broiler]],
      update: ['update public.sites set name = name where id = $1', [farm.site]],
    },
    warehouses: {
      allowed: STORES,
      insert: ["insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن ثانٍ', 'farm')", [broiler, farm.site]],
      update: ['update public.warehouses set name = name where id = $1', [farm.store]],
    },
    pack_types: {
      allowed: STORES,
      insert: ["insert into public.pack_types (label, dimension, factor) values ('كارتون 12 طبقة', 'count', 360)", []],
      update: ['update public.pack_types set label = label where id = $1', [pack]],
    },
    item_categories: {
      allowed: STORES,
      insert: ["insert into public.item_categories (name) values ('إضافات')", []],
      update: ['update public.item_categories set name = name where id = $1', [category]],
    },
    items: {
      allowed: STORES,
      insert: ["insert into public.items (name, kind, base_unit) values ('صويا 46%', 'raw', 'kg')", []],
      update: ['update public.items set name = name where id = $1', [farm.item]],
    },
    item_units: {
      allowed: STORES,
      insert: ["insert into public.item_units (item_id, label, factor_to_base) values ($1, 'طن', 1000)", [farm.item]],
      update: ['update public.item_units set label = label where id = $1', [unit]],
    },
    expense_categories: {
      allowed: EXPENSES,
      insert: ["insert into public.expense_categories (name) values ('كهرباء')", []],
      update: ['update public.expense_categories set name = name where id = $1', [expense]],
    },
  };
  t.same(Object.keys(WRITES).sort(), Object.keys(CLASSES.directWrite).sort(), `الكتابة المباشرة تغطّي directWrite بـclasses.json بالضبط (${Object.keys(WRITES).length} جدول)`);
  let writeCells = 0;
  for (const [table, row] of Object.entries(WRITES)) {
    t.same([...row.allowed].sort(), ROLES.filter((role) => role === 'owner' || (CLASSES.directWrite[table].action && can(role, CLASSES.directWrite[table].action))).sort(), `${table}: المسموح = can(${CLASSES.directWrite[table].action}) بـpermissions.ts`);
    for (const verb of ['insert', 'update']) {
      const got = {};
      for (const role of ROLES) {
        writeCells += 1;
        const [sql, params] = row[verb];
        try {
          const result = await db.asUser(USERS[role], (q) => q(sql, params));
          got[role] = result.rowCount === 1 ? 'ok' : `rows:${result.rowCount}`;
        } catch (error) {
          got[role] = /row-level security/u.test(error.message) ? 'rls' : error.message;
        }
      }
      const expected = Object.fromEntries(ROLES.map((role) => [role, row.allowed.includes(role) ? 'ok' : verb === 'insert' ? 'rls' : 'rows:0']));
      t.same(got, expected, `${table}.${verb}: كل دور بنتيجته`);
    }
  }
  t.eq(writeCells, Object.keys(WRITES).length * 2 * ROLES.length, `خانات الكتابة المباشرة: ${Object.keys(WRITES).length} جدول × إدخال وتعديل × ${ROLES.length} أدوار`);
}
