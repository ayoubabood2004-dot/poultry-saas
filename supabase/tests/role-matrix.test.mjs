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

  // المرحلة 1 (WP3): يوم تشغيل المعمل، وجهتان وصندوقان، وقبض وافتتاح جهة وافتتاح صندوق مثبّتة، حتى الإلغاء والإعفاء ينجحون للمسموح
  // (كل نداء بالمصفوفة بمعاملة ترجع، فنفس القيد يلغيه المالك والمدير كلّ بمعاملته).
  const feedMill = await division('feed_mill');
  const millBook = (await db.admin("select id from public.ledger_books where org_id = $1 and division_id = $2", [org, feedMill])).rows[0].id;
  const ledger = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      await q('select public.set_division_go_live($1, public.app_today() - 3)', [feedMill]);
      const debtor = await one("insert into public.parties (name, phone, is_customer) values ('أبو علي', '07701112233', true) returning id");
      const fresh = await one("insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");
      const box = await one("insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
      const bank = await one("insert into public.cash_accounts (name, kind) values ('المصرف', 'bank') returning id");
      const opening = await one("select (public.record_opening_balance(gen_random_uuid(), $1, $2, 500000, public.app_today() - 3, gen_random_uuid())) ->> 'id'", [debtor, millBook]);
      const payment = await one("select (public.record_party_payment(gen_random_uuid(), $1, $2, 100000, $3, public.app_today(), gen_random_uuid())) ->> 'id'", [debtor, millBook, box]);
      const cashOpening = await one("select (public.record_cash_opening(gen_random_uuid(), $1, 250000, public.app_today() - 3, gen_random_uuid())) ->> 'id'", [box]);
      return { debtor, fresh, box, bank, opening, payment, cashOpening };
    },
    { commit: true },
  );
  const ACCOUNTS = ['owner', 'manager', 'accountant'];

  // المرحلة 1 (WP4): يوم تشغيل المخازن العامة، وافتتاحان مرحّلان بالمخزن العامّ (كاز أويل للإلغاء، وكاز أبيض للتحويل)، وتحويل مرحّل
  // للمواد الأوّلية بالمعمل، ومسوّدة تحويل بسطر ومسوّدة افتتاح بسطر (بنزين). العامّة صار بيها ترحيل، فيوم تشغيلها ثابت، وصفّ
  // set_division_go_live يجرّب حقول البيض (بلا ترحيل).
  const millRaw = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'raw'", [org])).rows[0].id;
  const STOCK = ['owner', 'manager', 'storekeeper', 'accountant'];
  const TRANSFER = ['owner', 'manager', 'storekeeper'];
  const stock = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      await q('select public.set_division_go_live($1, public.app_today() - 3)', [general]);
      const fuel = async (name) => one("insert into public.items (name, kind, base_unit) values ($1, 'fuel', 'L') returning id", [name]);
      const diesel = await fuel('كاز أويل');
      const kerosene = await fuel('كاز أبيض');
      const petrol = await fuel('بنزين');
      const version = async (table, docId) => one(`select version from public.${table} where id = $1`, [docId]);
      const opening = async (item, qty, amount) => {
        const doc = await one('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [generalStore]);
        await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, $3, $4)', [doc, item, qty, amount]);
        return doc;
      };
      const posted = await opening(diesel, 100, 80000);
      await q('select public.post_opening_stock($1, $2, gen_random_uuid())', [posted, await version('opening_docs', posted)]);
      const stocked = await opening(kerosene, 500, 375000);
      await q('select public.post_opening_stock($1, $2, gen_random_uuid())', [stocked, await version('opening_docs', stocked)]);
      const transfer = async (qty) => {
        const doc = await one('insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today()) returning id', [generalStore, millRaw]);
        const line = await one('insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3) returning id', [doc, kerosene, qty]);
        return { doc, line };
      };
      const moved = await transfer(100);
      await q('select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid())', [moved.doc, await version('transfers', moved.doc)]);
      const draft = await transfer(50);
      const draftOpening = await opening(petrol, 10, 7500);
      return {
        diesel,
        kerosene,
        posted,
        moved: moved.doc,
        draft: draft.doc,
        draftLine: draft.line,
        draftVersion: await version('transfers', draft.doc),
        draftOpening,
        openingLine: await one('select id from public.opening_lines where doc_id = $1', [draftOpening]),
        openingVersion: await version('opening_docs', draftOpening),
      };
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
    set_division_go_live: { sql: () => ['select public.set_division_go_live($1, public.app_today() - 1)', [layer]], expect: only(['owner', 'manager']) },
    set_member_scopes_v2: { sql: () => ["select public.set_member_scopes_v2($1, array[$2]::uuid[], '{}', '{}')", [member.hall_worker, layer]], expect: only(['owner']) },
    // المرحلة 1 (WP3، §2.12): الافتتاح للمدير (opening.post)، والقبض والدفع والنقل والمعاينة للمحاسب والمدير (payment.post)، والتسوية
    // والإعفاء للمدير (party.adjust)، وكل إلغاء للمدير (void)، والتقارير لأدوار الحسابات (accounts.view ويّا can_see_accounts)،
    // والرئيسية لكل عضو وبطاقة الحسابات لأدوارها، والتوائم لمن يضيف جهة (party.create)، والدفتر بالنطاق (E49).
    in_scope_book: { sql: () => ['select public.in_scope_book($1) as v', [millBook]], value: true, expect: only(ACCOUNTS, 'ok:true', 'ok:false') },
    record_opening_balance: { sql: () => ['select public.record_opening_balance(gen_random_uuid(), $1, $2, 100000, public.app_today() - 3, gen_random_uuid())', [ledger.fresh, millBook]], expect: only(['owner', 'manager']) },
    record_party_payment: { sql: () => ['select public.record_party_payment(gen_random_uuid(), $1, $2, 1000, $3, public.app_today(), gen_random_uuid())', [ledger.debtor, millBook, ledger.box]], expect: only(ACCOUNTS) },
    pay_party: { sql: () => ['select public.pay_party(gen_random_uuid(), $1, $2, 1000, $3, public.app_today(), gen_random_uuid())', [ledger.fresh, millBook, ledger.box]], expect: only(ACCOUNTS) },
    void_party_payment: { sql: () => ["select public.void_party_payment($1, 'قبض مكرّر', gen_random_uuid())", [ledger.payment]], expect: only(['owner', 'manager']) },
    record_party_adjustment: { sql: () => ["select public.record_party_adjustment(gen_random_uuid(), $1, $2, 'debit', 1000, public.app_today(), 'فرق حساب', gen_random_uuid())", [ledger.debtor, millBook]], expect: only(['owner', 'manager']) },
    forgive_debt: { sql: () => ["select public.forgive_debt(gen_random_uuid(), $1, $2, 1000, public.app_today(), 'خصم تسوية', gen_random_uuid())", [ledger.debtor, millBook]], expect: only(['owner', 'manager']) },
    void_party_entry: { sql: () => ["select public.void_party_entry($1, 'افتتاح خاطئ', gen_random_uuid())", [ledger.opening]], expect: only(['owner', 'manager']) },
    record_cash_opening: { sql: () => ['select public.record_cash_opening(gen_random_uuid(), $1, 100000, public.app_today() - 3, gen_random_uuid())', [ledger.bank]], expect: only(['owner', 'manager']) },
    transfer_cash: { sql: () => ['select public.transfer_cash(gen_random_uuid(), $1, $2, 1000, public.app_today(), null, gen_random_uuid())', [ledger.box, ledger.bank]], expect: only(ACCOUNTS) },
    void_cash_move: { sql: () => ["select public.void_cash_move($1, 'رصيد خاطئ', gen_random_uuid())", [ledger.cashOpening]], expect: only(['owner', 'manager']) },
    preview_party_allocation: { sql: () => ["select public.preview_party_allocation($1, $2, 'payment', 1000) -> 'money' ->> 'amount' as v", [ledger.debtor, millBook]], value: true, expect: only(ACCOUNTS, 'ok:-1000') },
    report_accounts_summary: { sql: () => ["select public.report_accounts_summary(public.app_today() - 30, public.app_today()) -> 'project' ->> 'receivable' as v", []], value: true, expect: only(ACCOUNTS, 'ok:400000') },
    report_party_balances: { sql: () => ["select jsonb_array_length(public.report_party_balances(public.app_today() - 30, public.app_today(), null, true, 'balance', null, null, 50) -> 'rows') as v", []], value: true, expect: only(ACCOUNTS, 'ok:1') },
    report_party_statement: { sql: () => ["select jsonb_array_length(public.report_party_statement($1, null, public.app_today() - 30, public.app_today()) -> 'books') as v", [ledger.debtor]], value: true, expect: only(ACCOUNTS, 'ok:1') },
    report_cash_balances: { sql: () => ["select public.report_cash_balances(public.app_today() - 30, public.app_today()) -> 'total' ->> 'closing' as v", []], value: true, expect: only(ACCOUNTS, 'ok:350000') },
    report_cash_statement: { sql: () => ["select jsonb_array_length(public.report_cash_statement($1, public.app_today() - 30, public.app_today()) -> 'lines') as v", [ledger.box]], value: true, expect: only(ACCOUNTS, 'ok:2') },
    home_summary: { sql: () => ["select public.home_summary() -> 'accounts' ->> 'receivable' as v", []], value: true, expect: only(ACCOUNTS, 'ok:400000', 'ok:null') },
    find_party_twins: { sql: () => ["select jsonb_array_length(public.find_party_twins('ابو علي', null)) as v", []], value: true, expect: only([...ACCOUNTS, 'storekeeper'], 'ok:1') },
    // المرحلة 1 (WP4، §2.12): الافتتاح ومعاينته للمدير (opening.post)، والتحويل ومعاينته والطيّ وحذف السطر للأمين والمدير (transfer.post،
    // والمحاسب ممنوع)، والإلغاء للمدير (void)، وقراءات الكميات لمن المخزن بنطاقه (والباقي out_of_scope)، والقيم لأدوار الحسابات.
    post_opening_stock: { sql: () => ['select public.post_opening_stock($1, $2, gen_random_uuid())', [stock.draftOpening, stock.openingVersion]], expect: only(['owner', 'manager']) },
    void_opening_stock: { sql: () => ["select public.void_opening_stock($1, 'افتتاح خاطئ', gen_random_uuid())", [stock.posted]], expect: only(['owner', 'manager']) },
    preview_opening_stock: { sql: () => ["select (public.preview_opening_stock($1) -> 'money' ->> 'total')::numeric = 7500 as v", [stock.draftOpening]], value: true, expect: only(['owner', 'manager'], 'ok:true') },
    post_transfer: { sql: () => ['select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid())', [stock.draft, stock.draftVersion]], expect: only(TRANSFER) },
    void_transfer: { sql: () => ["select public.void_transfer($1, 'تحويل خاطئ', gen_random_uuid())", [stock.moved]], expect: only(['owner', 'manager']) },
    preview_transfer: { sql: () => ["select public.preview_transfer($1) ->> 'ready' as v", [stock.draft]], value: true, expect: only(TRANSFER, 'ok:true') },
    discard_draft: { sql: () => ["select public.discard_draft('transfer', $1, $2) ->> 'status' as v", [stock.draft, stock.draftVersion]], value: true, expect: only(TRANSFER, 'ok:void') },
    delete_draft_line: { sql: () => ["select public.delete_draft_line('transfer', $1, $2) ->> 'deleted' as v", [stock.draftLine, stock.draftVersion]], value: true, expect: only(TRANSFER, 'ok:true') },
    stock_on_hand: { sql: () => ["select jsonb_array_length(public.stock_on_hand($1, null, 50) -> 'rows') as v", [generalStore]], value: true, expect: only(STOCK, 'ok:2', 'out_of_scope') },
    item_lots_qty: { sql: () => ["select jsonb_array_length(public.item_lots_qty($1, $2, null, 50) -> 'rows') as v", [stock.kerosene, generalStore]], value: true, expect: only(STOCK, 'ok:1', 'out_of_scope') },
    item_moves_qty: { sql: () => ["select jsonb_array_length(public.item_moves_qty($1, $2, null, 50) -> 'rows') as v", [stock.kerosene, generalStore]], value: true, expect: only(STOCK, 'ok:2', 'out_of_scope') },
    stock_values: { sql: () => ["select (select sum((r ->> 'available')::numeric) from jsonb_array_elements(public.stock_values($1, null, 50) -> 'rows') as r) = 380000 as v", [generalStore]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    stock_value_totals: { sql: () => ["select (public.stock_value_totals($1) -> 'money' ->> 'total')::numeric = 380000 as v", [generalStore]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    item_lots_value: { sql: () => ["select (public.item_lots_value($1, $2, null, 50) -> 'rows' -> 0 ->> 'value_left')::numeric = 300000 as v", [stock.kerosene, generalStore]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    // علامة «مؤرشف وعليه رصيد» لقائمة المخازن (§2.6): بلا قيم، لكل دور بنطاقه (ماكو مخزن مؤرشف هنا؛ الضابط الإيجابي بـstock.test).
    archived_stores_with_stock: { sql: () => ['select jsonb_array_length(public.archived_stores_with_stock()) as v', []], value: true, expect: all('ok:0') },
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
  // §2.12: delete_draft_line وdiscard_draft بفعل مسوّدة كل نوع، فالنوع الثاني (الافتتاح: opening.post للمالك والمدير) صفوفه لحالها،
  // ومسوّدته بالمخزن العامّ اللي الأمين بنطاقه (فلو فرع الافتتاح صار transfer.post ينجح الأمين وينمسك)، والنسخة القديمة stale_draft.
  const KIND_ROWS = {
    "discard_draft('opening')": { sql: ["select public.discard_draft('opening', $1, $2) ->> 'status' as v", [stock.draftOpening, stock.openingVersion]], value: true, expect: only(['owner', 'manager'], 'ok:void') },
    "delete_draft_line('opening')": { sql: ["select public.delete_draft_line('opening', $1, $2) ->> 'deleted' as v", [stock.openingLine, stock.openingVersion]], value: true, expect: only(['owner', 'manager'], 'ok:true') },
    "discard_draft('opening') بنسخة قديمة": { sql: ["select public.discard_draft('opening', $1, $2) ->> 'status' as v", [stock.draftOpening, stock.openingVersion - 1]], value: true, expect: only(['owner', 'manager'], 'stale_draft') },
    "delete_draft_line('opening') بنسخة قديمة": { sql: ["select public.delete_draft_line('opening', $1, $2) ->> 'deleted' as v", [stock.openingLine, stock.openingVersion - 1]], value: true, expect: only(['owner', 'manager'], 'stale_draft') },
  };
  for (const [label, row] of Object.entries(KIND_ROWS)) {
    const got = {};
    for (const role of ROLES) {
      try {
        const result = await db.asUser(USERS[role], (q) => q(row.sql[0], row.sql[1]));
        got[role] = row.value ? `ok:${result.rows[0].v}` : 'ok';
      } catch (error) {
        got[role] = error.message;
      }
    }
    t.same(got, row.expect, `${label}: كل دور بنتيجته`);
  }
  // المدير ينجح بكل خانة تشغيلية والمحاسب يفشل بيها (FOUNDATION ٥٤٤، ٨٦٥): بالمرحلة 0 الخانة التشغيلية قفل الفترة.
  t.same([ROWS.set_period_lock.expect.manager, ROWS.set_period_lock.expect.accountant], ['ok', 'forbidden'], 'المدير يقفل الفترة والمحاسب لا');
  t.same([ROWS.set_division_go_live.expect.manager, ROWS.set_division_go_live.expect.accountant], ['ok', 'forbidden'], 'المدير يحدّد يوم التشغيل والمحاسب لا');
  t.same(
    ['record_opening_balance', 'record_party_adjustment', 'forgive_debt', 'void_party_payment', 'void_party_entry', 'record_cash_opening', 'void_cash_move'].map((fn) => [ROWS[fn].expect.manager, ROWS[fn].expect.accountant]),
    Array(7).fill(['ok', 'forbidden']),
    'المدير ينجح بالافتتاح والتسوية والإعفاء والإلغاء والمحاسب لا (FOUNDATION ٥٤٤، ٨٦٥)',
  );
  t.same(
    ['post_opening_stock', 'void_opening_stock', 'post_transfer', 'void_transfer', 'preview_transfer', 'discard_draft', 'delete_draft_line'].map((fn) => [ROWS[fn].expect.manager.split(':')[0], ROWS[fn].expect.accountant]),
    Array(7).fill(['ok', 'forbidden']),
    'المدير ينجح بخانات المخزون التشغيلية (الافتتاح والتحويل والإلغاء والمسوّدات) والمحاسب لا (FOUNDATION ٥٤٤، ٨٦٥)',
  );

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
    // WP3 (Q1): الجهة يضيفها الأمين هم (مورّداً، party.create)، ويعدّلها المحاسب والمدير (parties.manage)؛ والصندوق للمحاسب والمدير.
    parties: {
      insertAllowed: [...EXPENSES, 'storekeeper'],
      updateAllowed: EXPENSES,
      insert: ["insert into public.parties (name, is_supplier) values ('مورّد جديد', true)", []],
      update: ['update public.parties set name = name where id = $1', [ledger.debtor]],
    },
    cash_accounts: {
      allowed: EXPENSES,
      insert: ["insert into public.cash_accounts (name, kind) values ('صندوق ثالث', 'wallet')", []],
      update: ['update public.cash_accounts set name = name where id = $1', [ledger.box]],
    },
    // WP4 (§2.5): مسوّدات الافتتاح (opening.post) والتحويل (transfer.post، المرسِل بنطاق الأمين). إدخال السطر الممنوع يرفضه حارس
    // السطر نفسه (forbidden، قبل RLS)، وتعديله الممنوع صفر صفوف (USING يحجب الصفّ قبل الحارس).
    opening_docs: {
      allowed: STORES,
      insert: ['insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3)', [generalStore]],
      update: ['update public.opening_docs set note = note where id = $1', [stock.draftOpening]],
    },
    opening_lines: {
      allowed: STORES,
      insertDenied: 'forbidden',
      insert: ['insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 1, 750)', [stock.draftOpening, stock.diesel]],
      update: ['update public.opening_lines set qty_base = qty_base where id = $1', [stock.openingLine]],
    },
    transfers: {
      allowed: TRANSFER,
      insert: ['insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today())', [generalStore, millRaw]],
      update: ['update public.transfers set note = note where id = $1', [stock.draft]],
    },
    transfer_lines: {
      allowed: TRANSFER,
      insertDenied: 'forbidden',
      insert: ['insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1)', [stock.draft, stock.kerosene]],
      update: ['update public.transfer_lines set qty_in_unit = qty_in_unit where id = $1', [stock.draftLine]],
    },
  };
  t.same(Object.keys(WRITES).sort(), Object.keys(CLASSES.directWrite).sort(), `الكتابة المباشرة تغطّي directWrite بـclasses.json بالضبط (${Object.keys(WRITES).length} جدول)`);
  let writeCells = 0;
  // الفعل لكل أمر ({ insert, update }، الجهات من 0006) أو واحد للأمرين؛ والمسموح لكل أمر = can(فعله) بـpermissions.ts.
  const actionOf = (table, verb) => (typeof CLASSES.directWrite[table].action === 'string' ? CLASSES.directWrite[table].action : CLASSES.directWrite[table].action[verb]);
  for (const [table, row] of Object.entries(WRITES)) {
    for (const verb of ['insert', 'update']) {
      const allowed = row[`${verb}Allowed`] ?? row.allowed;
      t.same([...allowed].sort(), ROLES.filter((role) => role === 'owner' || can(role, actionOf(table, verb))).sort(), `${table}.${verb}: المسموح = can(${actionOf(table, verb)}) بـpermissions.ts`);
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
      const expected = Object.fromEntries(ROLES.map((role) => [role, allowed.includes(role) ? 'ok' : verb === 'insert' ? (row.insertDenied ?? 'rls') : 'rows:0']));
      t.same(got, expected, `${table}.${verb}: كل دور بنتيجته`);
    }
  }
  t.eq(writeCells, Object.keys(WRITES).length * 2 * ROLES.length, `خانات الكتابة المباشرة: ${Object.keys(WRITES).length} جدول × إدخال وتعديل × ${ROLES.length} أدوار`);
}
