// 0001_core بدور authenticated حقيقي (FOUNDATION حزمة بوستغريس ٤، وشرط «منتهية» للمرحلة 0): منشأة ما تقرأ بغيرها بأي
// جدول (القائمة من الكتالوج)، الكتابة من الدوالّ بس، المالك بس يدعو الموظفين والدعوة ما تنطي وصولاً قبل القبول، آخر
// مالك ما ينزل ولا يطلع، السجلّ على قائمة الكلف وما يتعدّل ولا ينمسح حتى بمفتاح الخادم، قفل الفترة وفتحه للمالك، حدّ
// الرجوع ٧ أيام، والثوابت. كل فحص يدّعي منع معه ضابط إيجابي يثبت إنه يكدر يفشل.

const U = {
  aOwner: 'a0000000-0000-4000-8000-000000000001',
  aWorker: 'a0000000-0000-4000-8000-000000000002',
  aManager: 'a0000000-0000-4000-8000-000000000003',
  aViewer: 'a0000000-0000-4000-8000-000000000004',
  aAccountant: 'a0000000-0000-4000-8000-000000000005',
  emailUser: 'a0000000-0000-4000-8000-000000000006',
  aSpare: 'a0000000-0000-4000-8000-000000000007',
  twinPhone: 'a0000000-0000-4000-8000-000000000008',
  twinEmail: 'a0000000-0000-4000-8000-000000000009',
  gmailUser: 'a0000000-0000-4000-8000-00000000000a',
  bOwner: 'b0000000-0000-4000-8000-000000000001',
  bWorker: 'b0000000-0000-4000-8000-000000000002',
};
// الحساب برقم بعمود phone، أو بالبريد: «الرقم@phone.login» (الدخول بلا SMS) يُعدّ رقماً، وأي نطاق ثاني لا.
const ACCOUNT = {
  aOwner: { phone: '9647701000001' },
  aWorker: { phone: '9647701000002' },
  aManager: { phone: '9647701000003' },
  aViewer: { phone: '9647701000004' },
  aAccountant: { phone: '9647701000005' },
  emailUser: { email: '9647701000006@phone.login' },
  aSpare: { phone: '9647701000007' },
  twinPhone: { phone: '9647701000008' },
  twinEmail: { email: '9647701000008@phone.login' },
  gmailUser: { email: '9647701000010@gmail.com' },
  bOwner: { phone: '9647801000001' },
  bWorker: { phone: '9647801000002' },
};
const ZERO = { divisions_per_org: 0, books_per_org: 0, book_codes: 0, orgs_without_owner: 0, scopes_of_archived_members: 0 };

const one = async (q, sql, params) => (await q(sql, params)).rows[0];
const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];
/** الرمز والتلميح من خطأ بوستغريس (الرمز وحده ما يكفي: التلميح هو اللي يشوفه المستخدم). */
const failure = async (promise) => {
  try {
    await promise;
    return { message: 'ما رمى', hint: '' };
  } catch (error) {
    return { message: error.message, hint: error.hint ?? '' };
  }
};

export default async function (t, db) {
  for (const [key, id] of Object.entries(U)) {
    // مؤكَّد مثل حساب حقيقي يقدر يدخل (0002: الحساب غير المؤكَّد ما ينلكى بالرقم).
    await db.admin(
      'insert into auth.users (id, phone, email, phone_confirmed_at, email_confirmed_at) values ($1, $2::text, $3::text, case when $2::text is not null then now() end, case when $3::text is not null then now() end)',
      [id, ACCOUNT[key].phone ?? null, ACCOUNT[key].email ?? null],
    );
  }

  // سيناريو بعدّة هويّات بمعاملة وحدة ترجع: as(user) يدخل كمستخدم، claims(user) يبدّل المطالبات بس (لدوالّ private بدور
  // صاحب الجداول)، tables() يرجع لدور صاحب الجداول (يتجاوز RLS)، وattempt(sql) يرجّع 'ok' أو رمز الخطأ ويكمل (الناجح يبقى أثره لآخر السيناريو).
  const scenario = (fn) =>
    db.asOwner(async (q) => {
      const claims = (userId) => q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
      const as = async (userId) => {
        await claims(userId);
        await q('set local role authenticated');
      };
      const attempt = async (sql, params) => {
        await q('savepoint s');
        try {
          await q(sql, params);
          await q('release savepoint s');
          return 'ok';
        } catch (error) {
          await q('rollback to savepoint s');
          return error.message;
        }
      };
      const tables = () => q('set local role postgres');
      return fn({ q, as, claims, tables, attempt });
    });
  // يوم ثابت للحزمة (بدور صاحب الجداول، قبل as()).
  const FIXED = '2026-03-15';
  const atDay = (q) => q(`create or replace function public.app_today() returns date language sql stable as $$ select date '${FIXED}' $$`);

  // ── بلا منشأة، وبلا دخول ──────────────────────────────────────────────────────────────────────────────
  const fresh = await db.asUser(U.aOwner, (q) => value(q, 'select public.my_workspace()'));
  t.same([fresh.org_id, fresh.phone, fresh.invites], [null, ACCOUNT.aOwner.phone, []], 'بلا منشأة: org_id فارغ ويرجع رقمه حتى ينطيه للمالك');
  await t.rejects(db.asAnon((q) => q('select public.my_workspace()')), 'anon ما ينفّذ my_workspace', /permission denied/);
  await t.rejects(db.asAnon((q) => q('select * from public.members')), 'anon ما يقرأ الأعضاء', /permission denied/);
  await t.rejects(db.asAnon((q) => q('select * from public.orgs')), 'anon ما يقرأ المنشآت', /permission denied/);

  // ── المشترك ينشئ منشأته ───────────────────────────────────────────────────────────────────────────────
  const created = await db.asUser(U.aOwner, (q) => value(q, "select public.create_my_org('مزرعة الأمل', 'أبو علي')"), { commit: true });
  t.same([created.role, created.org_name, created.divisions], ['owner', 'مزرعة الأمل', ['broiler', 'feed_mill', 'general', 'hatchery', 'layer', 'medicine']], 'المنشئ مالك ويشوف الوحدات الست');
  t.same([created.can_see_cost, created.can_see_accounts, created.can_see_sales], [true, true, true], 'المالك يشوف الكلف والحسابات والمبيعات');
  const again = await db.asUser(U.aOwner, (q) => value(q, "select public.create_my_org('مزرعة الأمل', 'أبو علي')"));
  t.eq(again.org_id, created.org_id, 'إعادة نفس الطلب (جواب ضاع) ترجّع نفس المنشأة');
  const second = await failure(db.asUser(U.aOwner, (q) => q("select public.create_my_org('ثانية', 'أبو علي')")));
  t.same([second.message, second.hint.includes('مزرعة الأمل')], ['already_member', true], 'منشأة ثانية لنفس المستخدم ترفض، وتلميحها يسمّي منشأته');
  await t.rejects(db.asUser(U.aWorker, (q) => q("select public.create_my_org('  ', 'س')")), 'اسم فارغ يرفض', /^invalid_name$/);
  await db.asUser(U.bOwner, (q) => q("select public.create_my_org('مزرعة النور', 'أبو حسن')"), { commit: true });

  const orgA = (await db.admin("select id from public.orgs where name = 'مزرعة الأمل'")).rows[0].id;
  const orgB = (await db.admin("select id from public.orgs where name = 'مزرعة النور'")).rows[0].id;
  t.eq(Number((await db.admin("select count(*) from public.orgs where name = 'مزرعة الأمل'")).rows[0].count), 1, 'ضابط: الإعادة ما أنشأت منشأة ثانية');
  const division = async (org, kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const aBroiler = await division(orgA, 'broiler');
  const aLayer = await division(orgA, 'layer');
  const aGeneral = await division(orgA, 'general');
  const bBroiler = await division(orgB, 'broiler');
  const memberId = async (userId, org) => (await db.admin('select id from public.members where user_id = $1 and org_id = $2', [userId, org])).rows[0].id;

  // ── الكتابة من الدوالّ بس ─────────────────────────────────────────────────────────────────────────────
  await t.rejects(db.asUser(U.aOwner, (q) => q("insert into public.divisions (kind, name) values ('broiler', 'ثانية')")), 'إدخال مباشر بالوحدات يرفض', /permission denied/);
  await t.rejects(db.asUser(U.aOwner, (q) => q("update public.members set role = 'viewer'")), 'تعديل مباشر بالأعضاء يرفض', /permission denied/);
  await t.rejects(db.asUser(U.aOwner, (q) => q('delete from public.ledger_books')), 'حذف مباشر بالدفاتر يرفض', /permission denied/);
  await t.rejects(db.asUser(U.aOwner, (q) => q('select * from public.rpc_refs')), 'rpc_refs ما تنقرا من الواجهة', /permission denied/);

  // ── الدعوة: المالك يدعو برقم الهاتف، والموظف يقبل ────────────────────────────────────────────────────────
  const invited = await db.asUser(
    U.aOwner,
    async (q) => ({
      aWorker: await value(q, "select public.add_member('0770 100 0002', 'hall_worker', 'أبو حسين', array[$1]::uuid[])", [aBroiler]),
      aManager: await value(q, "select public.add_member('+9647701000003', 'manager', 'المدير')"),
      aViewer: await value(q, "select public.add_member('07701000004', 'viewer', 'المشاهد')"),
      aAccountant: await value(q, "select public.add_member('٠٧٧٠١٠٠٠٠٠٥', 'accountant', 'المحاسب')"),
      emailUser: await value(q, "select public.add_member('07701000006', 'storekeeper', 'أمين المخزن', array[$1]::uuid[])", [aGeneral]),
    }),
    { commit: true },
  );
  t.eq(await db.asUser(U.aOwner, (q) => value(q, 'select count(*)::int from public.members where accepted_at is null')), 5, 'المالك دعا خمسة بأشكال أرقام مختلفة (ويّا صاحب البريد)');
  const pending = await db.asUser(U.aWorker, (q) => value(q, 'select public.my_workspace()'));
  t.same(
    [pending.org_id, pending.invites.map((i) => [i.member_id, i.org_name, i.role])],
    [null, [[invited.aWorker, 'مزرعة الأمل', 'hall_worker']]],
    'المدعوّ يشوف دعوته باسم المنشأة ودوره، بلا منشأة بعد',
  );
  const beforeAccept = await db.asUser(U.aWorker, (q) =>
    one(q, "select public.auth_org() as org, (select count(*)::int from public.members) as members, public.in_scope_division($1) as scope, public.can('flock_day.save') as can", [aBroiler]),
  );
  t.same(beforeAccept, { org: null, members: 0, scope: false, can: false }, 'الدعوة ما تنطي أي وصول قبل القبول');
  await t.rejects(db.asUser(U.aManager, (q) => q("select public.accept_invite_code($1, '000000')", [invited.aWorker])), 'دعوة غيره ما يقبلها', /^invite_not_found$/);
  for (const key of Object.keys(invited)) {
    await db.acceptInvite(U.aOwner, U[key], invited[key]);
  }
  await t.rejects(db.asUser(U.aWorker, (q) => q("select public.accept_invite_code($1, '000000')", [invited.aWorker])), 'الدعوة المقبولة ما تنقبل مرّة ثانية', /^invite_not_found$/);
  const acceptActor = await db.admin(
    "select actor from public.audit_log where table_name = 'members' and op = 'update' and row_id = $1 and old ->> 'accepted_at' is null and new ->> 'accepted_at' is not null",
    [invited.aWorker],
  );
  t.same(acceptActor.rows, [{ actor: U.aWorker }], 'السجلّ يكول الموظف نفسه قبل الدعوة');

  // ── أخطاء الدعوة ──────────────────────────────────────────────────────────────────────────────────────
  const invite = (userId, sql, params) => db.asUser(userId, (q) => q(sql, params));
  await t.rejects(invite(U.aOwner, "select public.add_member('07709999999', 'viewer', 'س')"), 'رقم بلا حساب يرفض', /^user_not_found$/);
  await t.rejects(invite(U.aOwner, "select public.add_member('12345', 'viewer', 'س')"), 'رقم غلط يرفض', /^invalid_phone$/);
  await t.rejects(invite(U.aOwner, "select public.add_member('07701000002', 'viewer', 'س')"), 'عضو موجود يرفض', /^already_in_org$/);
  await t.rejects(
    db.asUser(U.aOwner, async (q) => {
      await q("select public.add_member('07701000007', 'viewer', 'س')");
      await q("select public.add_member('07701000007', 'viewer', 'س')");
    }),
    'مدعوّ ما قبل بعد يرفض مرّة ثانية',
    /^already_in_org$/,
  );
  await t.rejects(invite(U.aOwner, "select public.add_member('07709999999', 'boss', 'س')"), 'دور مو من الثمانية يرفض', /^invalid_role$/);
  await t.rejects(invite(U.aOwner, "select public.add_member('07701000007', 'viewer', 'س', array[$1]::uuid[])", [bBroiler]), 'نطاق بوحدة منشأة ثانية يرفض', /^division_not_found$/);
  await t.rejects(invite(U.aOwner, "select public.add_member('07709999999', 'viewer', 'س', array[$1]::uuid[])", [bBroiler]), 'الوحدات تنفحص قبل الرقم (رقم مجهول ما يتميّز)', /^division_not_found$/);
  await t.rejects(invite(U.aOwner, "select public.add_member('07701000008', 'viewer', 'س')"), 'رقم بحسابين حيّين (عمود الهاتف وبريد الدخول) يرفض ما يختار واحد بصمت', /^phone_ambiguous$/);
  await t.rejects(invite(U.aOwner, "select public.add_member('07701000010', 'viewer', 'س')"), 'بريد بغير نطاق phone.login ما يُعدّ رقماً', /^user_not_found$/);
  const managerInvites = await failure(invite(U.aManager, "select public.add_member('07709999999', 'viewer', 'س')"));
  t.same([managerInvites.message, managerInvites.hint.includes('لمالك المنشأة')], ['forbidden', true], 'المدير ما يدعو موظفين (المالك بس)، والتلميح يكول منو');
  await t.rejects(invite(U.aWorker, "select public.add_member('07709999999', 'viewer', 'س')"), 'العامل ما يدعو موظفين', /^forbidden$/);

  // عضو منشأة ثانية يندعى (ماكو تسريب «هذا الرقم عضو بمنشأة»)، بس ما يقبل إلا يطلع من منشأته؛ ويرفض الدعوة.
  const crossInvite = await db.asUser(U.aOwner, (q) => value(q, "select public.add_member('07801000001', 'viewer', 'ضيف')"), { commit: true });
  const bPending = await db.asUser(U.bOwner, (q) => value(q, 'select public.my_workspace()'));
  t.same([bPending.org_name, bPending.invites.map((i) => i.org_name)], ['مزرعة النور', ['مزرعة الأمل']], 'عضو منشأة ب يشوف دعوة أ ويبقى بمنشأته');
  const crossCode = await db.asUser(U.aOwner, (q) => value(q, 'select public.invite_code($1)', [crossInvite]), { commit: true });
  const crossAccept = await failure(db.asUser(U.bOwner, (q) => q('select public.accept_invite_code($1, $2)', [crossInvite, crossCode])));
  t.same([crossAccept.message, crossAccept.hint.includes('مزرعة النور')], ['already_member', true], 'ما يقبل وهو عضو بمنشأة ثانية، والتلميح يسمّيها');
  await db.asUser(U.bOwner, (q) => q('select public.decline_invite($1)', [crossInvite]), { commit: true });
  t.same((await db.asUser(U.bOwner, (q) => value(q, 'select public.my_workspace()'))).invites, [], 'الدعوة المرفوضة تختفي');
  await t.rejects(db.asUser(U.bOwner, (q) => q('select public.accept_invite_code($1, $2)', [crossInvite, crossCode])), 'المرفوضة ما تنقبل حتى برمزها', /^invite_not_found$/);
  t.eq(await db.asUser(U.aOwner, (q) => value(q, "select public.add_member('07801000001', 'viewer', 'ضيف')")), crossInvite, 'إعادة الدعوة بعد الرفض بنفس المعرّف');

  // ── تجهيز منشأة ب حتى يصير بكل جدول صفوف للطرفين ──────────────────────────────────────────────────────────
  const bInvite = await db.asUser(U.bOwner, (q) => value(q, "select public.add_member('07801000002', 'hall_worker', 'عامل ب', array[$1]::uuid[])", [bBroiler]), { commit: true });
  await db.acceptInvite(U.bOwner, U.bWorker, bInvite);
  for (const owner of [U.aOwner, U.bOwner]) await db.asUser(owner, (q) => q("select public.set_period_lock(date '2026-01-31')"), { commit: true });
  // المرحلة 1 (0005): المواقع والمخازن وأحجام التعبئة وفئات المصاريف من البذور، والمواد ووحدتها وتصنيفها كتابة مباشرة بسياساتها.
  for (const owner of [U.aOwner, U.bOwner]) {
    await db.asUser(
      owner,
      async (q) => {
        const category = await value(q, "insert into public.item_categories (name) values ('أعلاف') returning id");
        const item = await value(q, "insert into public.items (name, category_id, kind, base_unit) values ('ذرة صفراء', $1, 'raw', 'kg') returning id", [category]);
        const pack = await value(q, "select id from public.pack_types where factor = 50 and dimension = 'mass'");
        await q("insert into public.item_units (item_id, pack_type_id, label, factor_to_base, is_default) values ($1, $2, 'كيس 50 كغم', 50, true)", [item, pack]);
      },
      { commit: true },
    );
  }
  // المرحلة 1 (0006): جهة وصندوق كتابة مباشرة، وافتتاح وقبض بدوالّهما، فبكل جدول دفتر (القيود والتوزيع والحركات والعدّاد) صفوف للطرفين.
  const ledgerOf = {};
  for (const [key, owner] of [['a', U.aOwner], ['b', U.bOwner]]) {
    ledgerOf[key] = await db.asUser(
      owner,
      async (q) => {
        const general = await value(q, "select id from public.divisions where kind = 'general'");
        const book = await value(q, 'select id from public.ledger_books where division_id = $1', [general]);
        await q('select public.set_division_go_live($1, public.app_today() - 3)', [general]);
        const party = await value(q, "insert into public.parties (name, is_customer) values ('أبو علي', true) returning id");
        const box = await value(q, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
        await q('select public.record_opening_balance(gen_random_uuid(), $1, $2, 500000, public.app_today() - 3, gen_random_uuid())', [party, book]);
        await q('select public.record_party_payment(gen_random_uuid(), $1, $2, 100000, $3, public.app_today(), gen_random_uuid())', [party, book, box]);
        return { book, party, box };
      },
      { commit: true },
    );
  }

  // المرحلة 1 (0007): افتتاح وتحويل مرحّلان بدوالّهما (فبكل جدول مخزون صفوف للطرفين)، ومسوّدتا افتتاح وتحويل بسطر لمعاينتيهما.
  const stockOf = {};
  for (const [key, owner] of [['a', U.aOwner], ['b', U.bOwner]]) {
    stockOf[key] = await db.asUser(
      owner,
      async (q) => {
        const general = await value(q, "select id from public.warehouses where kind = 'general'");
        const raw = await value(q, "select id from public.warehouses where kind = 'raw'");
        await q("select public.set_division_go_live(d.id, public.app_today() - 3) from public.divisions d where d.kind = 'feed_mill'");
        const fuel = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز أويل', 'fuel', 'L') returning id");
        const spare = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز أبيض', 'fuel', 'L') returning id");
        const opening = async (item) => {
          const doc = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [general]);
          await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 100, 80000)', [doc, item]);
          return doc;
        };
        const transfer = async () => {
          const doc = await value(q, 'insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today()) returning id', [general, raw]);
          await q('insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 40)', [doc, fuel]);
          return doc;
        };
        const posted = await opening(fuel);
        await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), gen_random_uuid())', [posted]);
        const moved = await transfer();
        await q('select public.post_transfer($1, (select version from public.transfers where id = $1), gen_random_uuid())', [moved]);
        return { general, fuel, openingDraft: await opening(spare), transferDraft: await transfer() };
      },
      { commit: true },
    );
  }

  // ── العزل بكل جدول مستأجر (القائمة من الكتالوج، فجدول جديد يدخل وحده) ──────────────────────────────────────────
  const tenantTables = (await db.admin(`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
    order by 1`)).rows.map((row) => row.name).filter((name) => name !== 'rpc_refs'); // rpc_refs: ما تنقرا أصلاً (فوك)
  t.ok(tenantTables.length >= 6, `جداول مستأجرة من الكتالوج (${tenantTables.join('، ')})`);
  const rowsSeen = (userId, org) =>
    db.asUser(userId, async (q) => {
      const out = { orgs: await one(q, 'select count(*) filter (where id = $1)::int as own, count(*)::int as total from public.orgs', [org]) };
      for (const tbl of tenantTables) {
        out[tbl] = await one(q, `select count(*) filter (where org_id = $1)::int as own, count(*)::int as total from public.${tbl}`, [org]);
      }
      return out;
    });
  for (const [label, userId, org] of [['أ', U.aOwner, orgA], ['ب', U.bOwner, orgB]]) {
    const seen = await rowsSeen(userId, org);
    t.same(Object.entries(seen).filter(([, r]) => r.total !== r.own).map(([tbl]) => tbl), [], `منشأة ${label}: ولا صفّ من غيرها بأي جدول`);
    t.same(Object.entries(seen).filter(([, r]) => r.own === 0).map(([tbl]) => tbl), [], `ضابط: منشأة ${label} تشوف صفوفها بكل جدول`);
  }
  const outsider = await rowsSeen(U.aSpare, null);
  t.same(Object.entries(outsider).filter(([, r]) => r.total !== 0).map(([tbl]) => tbl), [], 'بلا منشأة: ولا صفّ بأي جدول');

  // ── مساحة العامل ونطاقه ───────────────────────────────────────────────────────────────────────────────
  const worker = await db.asUser(U.aWorker, (q) => value(q, 'select public.my_workspace()'));
  t.same([worker.role, worker.divisions, worker.can_see_cost, worker.can_see_sales, worker.invites], ['hall_worker', ['broiler'], false, false, []], 'العامل بعد القبول: دوره ووحدته بس، بلا كلف ولا مبيعات');
  const scope = (userId) =>
    db.asUser(userId, (q) =>
      one(q, 'select public.in_scope_division($1) as broiler, public.in_scope_division($2) as layer, public.in_scope_division($3) as foreign', [aBroiler, aLayer, bBroiler]),
    );
  t.same(await scope(U.aWorker), { broiler: true, layer: false, foreign: false }, 'العامل: حقول اللحم بس');
  t.same(await scope(U.aManager), { broiler: true, layer: true, foreign: false }, 'المدير بلا صفوف: كل وحداته، وما يعبر لمنشأة ثانية');
  t.same(await scope(U.aViewer), { broiler: false, layer: false, foreign: false }, 'المشاهد بلا صفوف: ولا وحدة');
  t.same(await scope(U.aOwner), { broiler: true, layer: true, foreign: false }, 'المالك: كل وحداته');

  // ── السجلّ: على قائمة الكلف، يكول منو وشنو، وما يتعدّل ولا ينحذف ولا ينمسح ─────────────────────────────────────
  const auditCount = (userId) => db.asUser(userId, (q) => value(q, 'select count(*)::int from public.audit_log'));
  t.ok((await auditCount(U.aOwner)) > 0, 'ضابط: المالك يشوف السجلّ');
  t.ok((await auditCount(U.aAccountant)) > 0, 'ضابط: المحاسب يشوف السجلّ');
  t.eq(await auditCount(U.aWorker), 0, 'عامل القاعة ما يشوف السجلّ');
  t.eq(await auditCount(U.aViewer), 0, 'المشاهد ما يشوف السجلّ');
  t.eq(await auditCount(U.emailUser), 0, 'أمين المخزن ما يشوف السجلّ');
  const addActor = await db.admin("select actor from public.audit_log where table_name = 'members' and op = 'insert' and row_id = $1", [invited.aWorker]);
  t.same(addActor.rows, [{ actor: U.aOwner }], 'السجلّ يكول منو دعا العامل');
  const roleChange = await db.asUser(U.aOwner, async (q) => {
    await q("select public.set_member_role($1, 'storekeeper')", [invited.aViewer]);
    return one(q, "select old ->> 'role' as before, new ->> 'role' as after, actor from public.audit_log where table_name = 'members' and op = 'update' and row_id = $1 and old ->> 'role' <> new ->> 'role'", [invited.aViewer]);
  });
  t.same(roleChange, { before: 'viewer', after: 'storekeeper', actor: U.aOwner }, 'تغيير الدور بالسجلّ: القديم والجديد ومنو');
  await t.rejects(db.asOwner((q) => q("update public.audit_log set op = 'delete'")), 'السجلّ ما يتعدّل حتى من صاحب الجداول', /^append_only$/);
  await t.rejects(db.asOwner((q) => q('delete from public.audit_log')), 'السجلّ ما ينحذف حتى من صاحب الجداول', /^append_only$/);
  await t.rejects(db.asOwner((q) => q('truncate public.audit_log')), 'السجلّ ما ينمسح بـTRUNCATE حتى من صاحب الجداول', /^append_only$/);
  await t.rejects(db.asService((q) => q("update public.audit_log set op = 'delete'")), 'مفتاح الخادم ما يعدّل السجلّ', /permission denied/);
  await t.rejects(db.asService((q) => q('delete from public.audit_log')), 'مفتاح الخادم ما يحذف من السجلّ', /permission denied/);
  t.ok((await db.asService((q) => value(q, 'select count(*)::int from public.audit_log'))) > 0, 'ضابط: مفتاح الخادم يقرأ السجلّ');
  const allTables = [...tenantTables, 'orgs', 'rpc_refs'];
  const truncated = [];
  for (const tbl of allTables) {
    const result = await failure(db.asService((q) => q(`truncate public.${tbl}`)));
    if (!/permission denied/.test(result.message)) truncated.push(`${tbl}: ${result.message}`);
  }
  t.same(truncated, [], `مفتاح الخادم ما يمسح أي جدول بـTRUNCATE (${allTables.length})`);

  // ── المالك بس يدير الموظفين ───────────────────────────────────────────────────────────────────────────
  await t.rejects(invite(U.aManager, "select public.set_member_role($1, 'viewer')", [invited.aWorker]), 'المدير ما يغيّر الأدوار', /^forbidden$/);
  await t.rejects(invite(U.aManager, 'select public.set_member_scopes($1, array[$2]::uuid[])', [invited.aWorker, aLayer]), 'المدير ما يغيّر النطاق', /^forbidden$/);
  await t.rejects(invite(U.aManager, 'select public.archive_member($1)', [invited.aWorker]), 'المدير ما يؤرشف موظفاً', /^forbidden$/);
  t.eq(
    await db.asUser(U.aOwner, async (q) => {
      await q("select public.set_member_role($1, 'viewer')", [invited.aWorker]);
      return value(q, 'select role from public.members where id = $1', [invited.aWorker]);
    }),
    'viewer',
    'ضابط: المالك يغيّر الدور',
  );

  // ── آخر مالك ──────────────────────────────────────────────────────────────────────────────────────────
  const ownerMember = await memberId(U.aOwner, orgA);
  await t.rejects(invite(U.aOwner, "select public.set_member_role($1, 'manager')", [ownerMember]), 'آخر مالك ما ينزل', /^last_owner$/);
  await t.rejects(invite(U.aOwner, 'select public.archive_member($1)', [ownerMember]), 'آخر مالك ما ينشال', /^last_owner$/);
  await t.rejects(invite(U.aOwner, 'select public.leave_my_org()'), 'آخر مالك ما يطلع', /^last_owner$/);
  await t.rejects(
    db.asUser(U.aOwner, async (q) => {
      await q("select public.add_member('07701000007', 'owner', 'مالك مدعوّ')");
      await q("select public.set_member_role($1, 'manager')", [ownerMember]);
    }),
    'مالك مدعوّ ما قبل بعد ما يُحسب',
    /^last_owner$/,
  );
  const promoted = await db.asUser(U.aOwner, async (q) => {
    await q("select public.set_member_role($1, 'owner')", [invited.aManager]);
    await q("select public.set_member_role($1, 'manager')", [ownerMember]);
    return value(q, "select count(*)::int from public.members where role = 'owner' and archived_at is null");
  });
  t.eq(promoted, 1, 'ضابط: ويّا مالك ثاني مقبول ينزل الأوّل');
  await t.rejects(invite(U.aOwner, "select public.set_member_role($1, 'viewer')", [await memberId(U.bOwner, orgB)]), 'عضو منشأة ثانية ما ينلمس', /^member_not_found$/);

  // ── الخروج والأرشفة والرجوع: أرشفة مو حذف، والرجوع دعوة جديدة بنفس المعرّف ───────────────────────────────────
  const leaving = await scenario(async ({ q, as, attempt }) => {
    await as(U.aViewer);
    const left = await attempt('select public.leave_my_org()');
    const after = await value(q, 'select public.my_workspace()');
    await as(U.aOwner);
    const reinvited = await value(q, "select public.add_member('07701000004', 'viewer', 'المشاهد')");
    const code = await value(q, 'select public.invite_code($1)', [reinvited]);
    await as(U.aViewer);
    const back = await value(q, 'select public.accept_invite_code($1, $2)', [reinvited, code]);
    return [left, after.org_id, reinvited, back.role];
  });
  t.same(leaving, ['ok', null, invited.aViewer, 'viewer'], 'المشاهد يطلع بنفسه، ويرجع بدعوة جديدة بنفس المعرّف');
  const archived = await scenario(async ({ q, as, tables }) => {
    await as(U.aOwner);
    await q('select public.archive_member($1)', [invited.aWorker]);
    const scopes = await value(q, 'select count(*)::int from public.member_scopes where member_id = $1 and archived_at is null', [invited.aWorker]);
    const actor = await value(q, "select actor from public.audit_log where table_name = 'members' and op = 'update' and row_id = $1 and old ->> 'archived_at' is null and new ->> 'archived_at' is not null", [invited.aWorker]);
    await tables();
    const orphans = await value(q, "select violations::int from public.verify_core() where check_name = 'scopes_of_archived_members'");
    await as(U.aWorker);
    const outside = (await value(q, 'select public.my_workspace()')).org_id;
    await as(U.aOwner);
    const reinvited = await value(q, "select public.add_member('07701000002', 'hall_worker', 'أبو حسين', array[$1]::uuid[])", [aLayer]);
    const code = await value(q, 'select public.invite_code($1)', [reinvited]);
    await as(U.aWorker);
    await q('select public.accept_invite_code($1, $2)', [reinvited, code]);
    const back = await one(q, 'select public.in_scope_division($1) as broiler, public.in_scope_division($2) as layer', [aBroiler, aLayer]);
    return [scopes, actor, orphans, outside, reinvited, back];
  });
  t.same(archived, [0, U.aOwner, 0, null, invited.aWorker, { broiler: false, layer: true }], 'الأرشفة تؤرشف النطاق (بالسجلّ ومنو، وverify_core صفر) وتطلّعه، والرجوع بنطاقه الجديد بس');

  // ── النطاق: تغييره يؤرشف القديم، وصفّ (عضو، وحدة) واحد ─────────────────────────────────────────────────────
  const rescoped = await db.asUser(U.aOwner, async (q) => {
    await q('select public.set_member_scopes($1, array[$2]::uuid[])', [invited.aWorker, aLayer]);
    return one(q, 'select count(*) filter (where archived_at is null)::int as active, count(*)::int as total from public.member_scopes where member_id = $1', [invited.aWorker]);
  });
  t.same(rescoped, { active: 1, total: 2 }, 'تغيير النطاق يؤرشف القديم ما يحذفه');
  await t.rejects(
    db.asOwner((q) => q('insert into public.member_scopes (org_id, member_id, division_id) values ($1, $2, $3)', [orgA, invited.aWorker, aBroiler])),
    'صفّ نطاق مكرّر لنفس الوحدة يرفض',
    /duplicate key/,
  );
  // 0005: صفوف الموقع والمخزن بلا وحدة ما تتصادم ويّا فهرس الوحدة (كل هدف بفهرسه الجزئي)، وصفّ بلا هدف ما ينكتب أبداً.
  t.eq(
    await db.asOwner(async (q) => {
      const sites = (await q('select id from public.sites where org_id = $1 order by id limit 2', [orgA])).rows.map((row) => row.id);
      await q('insert into public.member_scopes (org_id, member_id, site_id) values ($1, $2, $3), ($1, $2, $4)', [orgA, invited.aWorker, sites[0], sites[1]]);
      return value(q, 'select count(*)::int from public.member_scopes where member_id = $1 and division_id is null', [invited.aWorker]);
    }),
    2,
    'ضابط: صفوف بلا وحدة (الموقع، والقاعة لاحقاً) ما تتصادم',
  );
  await t.rejects(
    db.asOwner((q) => q('insert into public.member_scopes (org_id, member_id) values ($1, $2)', [orgA, invited.aWorker])),
    'صفّ نطاق بلا هدف يرفض (هدف واحد بكل صفّ)',
    /member_scopes_one_target/,
  );

  // ── قفل الفترة: المدير يقفل ويقدّم، والفتح للمالك بس ────────────────────────────────────────────────────────
  await t.rejects(invite(U.aWorker, "select public.set_period_lock(date '2026-01-01')"), 'العامل ما يقفل', /^forbidden$/);
  const unlock = await failure(invite(U.aManager, "select public.set_period_lock(date '2026-01-01')"));
  t.same([unlock.message, unlock.hint.includes('لمالك المنشأة')], ['forbidden', true], 'المدير ما يفتح فترة مقفلة، والتلميح يكول منو');
  const lockFlow = await scenario(async ({ q, as, tables, attempt }) => {
    await atDay(q);
    await as(U.aManager);
    const out = {};
    out.manager_locks = await attempt("select public.set_period_lock(date '2026-03-10')");
    out.no_date = await attempt('select public.set_period_lock(null)');
    out.today = await attempt("select public.set_period_lock(date '2026-03-15')");
    out.manager_unlocks = await attempt("select public.set_period_lock(date '2026-03-01')");
    out.manager_moves_forward = await attempt("select public.set_period_lock(date '2026-03-12')");
    await as(U.aOwner);
    out.owner_unlocks = await attempt("select public.set_period_lock(date '2026-03-01')");
    await tables();
    out.b_untouched = await value(q, 'select locked_through::text from public.period_locks where org_id = $1', [orgB]);
    return out;
  });
  t.same(
    lockFlow,
    { manager_locks: 'ok', no_date: 'date_required', today: 'lock_in_future', manager_unlocks: 'forbidden', manager_moves_forward: 'ok', owner_unlocks: 'ok', b_untouched: '2026-01-31' },
    'القفل: المدير يقفل ويقدّم، الفتح للمالك بس، اليوم ما ينقفل، ومنشأة ب ما تتأثّر',
  );

  // ── حدّ الرجوع ٧ أيام والقفل (يوم ثابت) ───────────────────────────────────────────────────────────────────
  const checkDates = (lockThrough, days, userId = U.aOwner) =>
    scenario(async ({ q, claims, attempt }) => {
      await atDay(q);
      await q('update public.period_locks set locked_through = $2::date where org_id = $1', [orgA, lockThrough ?? '2026-01-31']);
      await claims(userId);
      const out = {};
      for (const day of days) out[day] = await attempt('select private.check_doc_date($1::date)', [day]);
      return out;
    });
  t.same(
    await checkDates(null, ['2026-03-15', '2026-03-08', '2026-03-07', '2026-03-16', null]),
    { '2026-03-15': 'ok', '2026-03-08': 'ok', '2026-03-07': 'date_too_old', '2026-03-16': 'date_in_future', null: 'date_required' },
    'حدّ الرجوع: اليوم و٧ أيام قبله مقبولة (08/03)، والثامن مرفوض (07/03)، والمستقبل مرفوض، والفارغ مرفوض',
  );
  t.same(
    await checkDates('2026-03-11', ['2026-03-11', '2026-03-09', '2026-03-12']),
    { '2026-03-11': 'period_locked', '2026-03-09': 'period_locked', '2026-03-12': 'ok' },
    'القفل حتى 11/03: يومه وما قبله مرفوضة، و12/03 مقبول',
  );
  t.same(await checkDates('2026-03-11', ['2026-03-09'], U.bOwner), { '2026-03-09': 'ok' }, 'قفل منشأة أ ما يقفل منشأة ب');

  // ── المفاتيح المركّبة، وحذف حساب عضو ─────────────────────────────────────────────────────────────────────
  await t.rejects(
    db.asOwner((q) => q('insert into public.member_scopes (org_id, member_id, division_id) values ($1, $2, $3)', [orgA, invited.aWorker, bBroiler])),
    'نطاق عضو أ بوحدة ب يرفض بالمفتاح المركّب',
    /foreign key/,
  );
  const deleteUser = async (userId) => {
    await db.admin('begin');
    try {
      return (await db.admin('delete from auth.users where id = $1', [userId])).rowCount;
    } finally {
      await db.admin('rollback');
    }
  };
  await t.rejects(deleteUser(U.aWorker), 'حساب عضو ما ينحذف من Auth (الخروج أرشفة)', /foreign key/);
  t.eq(await deleteUser(U.gmailUser), 1, 'ضابط: حساب بلا عضوية ينحذف');

  // ── الثوابت: صفر، وكل فحص يمسك كسره ─────────────────────────────────────────────────────────────────────
  const verify = async (q) => Object.fromEntries((await q('select check_name, violations::int from public.verify_core()')).rows.map((r) => [r.check_name, r.violations]));
  t.same(await db.asService(verify), ZERO, 'verify_core صفر (بمفتاح الخادم)');
  await t.rejects(db.asUser(U.aOwner, verify), 'verify_core مو للواجهة', /permission denied/);
  const BREAKS = {
    divisions_per_org: ["update public.divisions set archived_at = now() where org_id = $1 and kind = 'medicine'"],
    books_per_org: ["update public.ledger_books set archived_at = now() where org_id = $1 and code = 'chicks'"],
    book_codes: ['alter table public.ledger_books disable trigger ledger_books_code', "update public.ledger_books set code = 'main' where org_id = $1 and code = 'chicks'"],
    orgs_without_owner: ["update public.members set accepted_at = null where org_id = $1 and role = 'owner'"],
    scopes_of_archived_members: ["update public.members set archived_at = now() where org_id = $1 and role = 'hall_worker'"],
  };
  for (const [check, statements] of Object.entries(BREAKS)) {
    const broken = await db.asOwner(async (q) => {
      for (const sql of statements) await q(sql, sql.includes('$1') ? [orgA] : []);
      return verify(q);
    });
    t.same(broken, { ...ZERO, [check]: 1 }, `ضابط: verify_core يمسك ${check} وحده`);
  }
  await t.rejects(
    db.asOwner((q) => q("update public.ledger_books set code = 'main' where org_id = $1 and code = 'chicks'", [orgA])),
    'دفتر المفقس ما يصير main',
    /^book_code_mismatch$/,
  );

  // ── طريق PostgREST: الدالّة STABLE أو IMMUTABLE تنفّذ بمعاملة للقراءة بس (GET وrpc للقراءة) ───────────────────────
  // القائمة من الكتالوج (كل دالّة بقائمة السماح مو VOLATILE)، والمعاملات بقيم من نوعها. دالّة للقراءة تكتب شي تفشل هنا.
  const readOnly = (await db.admin(`
    select p.proname as name, oidvectortypes(p.proargtypes) as args
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.provolatile <> 'v'
      and has_function_privilege('authenticated', p.oid, 'execute') order by 1`)).rows;
  t.ok(readOnly.length >= 8, `دوالّ للقراءة بقائمة السماح (${readOnly.map((f) => f.name).join('، ')})`);
  // قيمة غير فارغة لكل نوع (STRICT ويّا NULL يرجع بلا ما يشتغل الجسم)، ونوع جديد بلا قيمة يفشل هنا مو يعبر بصمت.
  const SAMPLE = { uuid: aBroiler, text: 'read', boolean: false, date: '2026-01-01', 'text[]': ['READ'], numeric: '1000', integer: 50, jsonb: {}, bigint: '0' };
  const unmapped = [...new Set(readOnly.flatMap((fn) => (fn.args ? fn.args.split(', ') : []).filter((type) => SAMPLE[type] == null)))];
  t.same(unmapped, [], 'كل نوع معامل بدوالّ القراءة إله قيمة تجربة');
  // بأكثر من هويّة حتى كل فرع ينفّذ: مالك، عامل بنطاق، بلا منشأة، ومالك منشأة ثانية.
  const PERSONAS = [U.aOwner, U.aWorker, U.aSpare, U.bOwner];
  // المرحلة 1 (WP3): دوالّ الحسابات تاخذ معرّفات حقيقية حتى جسمها كلّه ينفّذ للمالكين (بمنشأة كل مالك)، والرفض المقصود لهويّة
  // بلا صلاحية مسمّى هنا بالضبط (forbidden): أي رفض ثاني، أو رفض لهويّة مو مسمّاة، يفشل الفحص مثل الكتابة.
  const own = (persona) => ledgerOf[persona === U.bOwner ? 'b' : 'a'];
  const ARGS = {
    preview_party_allocation: (persona) => [own(persona).party, own(persona).book, 'payment', '1000'],
    report_party_balances: () => ['2026-01-01', '2026-12-31', null, true, 'balance', null, null, 50],
    report_party_statement: (persona) => [own(persona).party, null, '2026-01-01', '2026-12-31'],
    report_cash_statement: (persona) => [own(persona).box, '2026-01-01', '2026-12-31'],
    // المرحلة 1 (WP4): قراءات المخزون بمخزن كل مالك ومادّته، والمعاينتان بمسوّدتيه.
    stock_on_hand: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].general, null, 50],
    item_lots_qty: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].fuel, stockOf[persona === U.bOwner ? 'b' : 'a'].general, null, 50],
    item_moves_qty: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].fuel, stockOf[persona === U.bOwner ? 'b' : 'a'].general, null, 50],
    stock_values: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].general, null, 50],
    stock_value_totals: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].general],
    item_lots_value: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].fuel, stockOf[persona === U.bOwner ? 'b' : 'a'].general, null, 50],
    preview_opening_stock: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].openingDraft],
    preview_transfer: (persona) => [stockOf[persona === U.bOwner ? 'b' : 'a'].transferDraft],
  };
  const NO_ACCOUNTS = { [U.aWorker]: 'forbidden', [U.aSpare]: 'forbidden' };
  const REJECTS = {
    find_party_twins: { [U.aWorker]: 'forbidden' },
    preview_party_allocation: NO_ACCOUNTS,
    report_accounts_summary: NO_ACCOUNTS,
    report_party_balances: NO_ACCOUNTS,
    report_party_statement: NO_ACCOUNTS,
    report_cash_balances: NO_ACCOUNTS,
    report_cash_statement: NO_ACCOUNTS,
    // المخزون: الكميات لمن المخزن بنطاقه (العامل بحقول اللحم وبلا منشأة out_of_scope)، والقيم والمعاينتان بفعلها (forbidden).
    stock_on_hand: { [U.aWorker]: 'out_of_scope', [U.aSpare]: 'out_of_scope' },
    item_lots_qty: { [U.aWorker]: 'out_of_scope', [U.aSpare]: 'out_of_scope' },
    item_moves_qty: { [U.aWorker]: 'out_of_scope', [U.aSpare]: 'out_of_scope' },
    stock_values: NO_ACCOUNTS,
    stock_value_totals: NO_ACCOUNTS,
    item_lots_value: NO_ACCOUNTS,
    preview_opening_stock: NO_ACCOUNTS,
    preview_transfer: NO_ACCOUNTS,
  };
  const readOnlyFailures = [];
  let rejected = 0;
  for (const fn of readOnly) {
    const types = fn.args ? fn.args.split(', ') : [];
    const call = `select public.${fn.name}(${types.map((type, i) => `$${i + 1}::${type}`).join(', ')})`;
    for (const persona of PERSONAS) {
      const result = await failure(
        db.asUser(persona, async (q) => {
          await q('set local transaction_read_only = on');
          await q(call, ARGS[fn.name] ? ARGS[fn.name](persona) : types.map((type) => SAMPLE[type]));
        }),
      );
      const expected = REJECTS[fn.name]?.[persona] ?? 'ما رمى';
      if (result.message !== expected) readOnlyFailures.push(`${fn.name} (${persona}): ${result.message} والمتوقّع ${expected}`);
      else if (expected !== 'ما رمى') rejected += 1;
    }
  }
  t.eq(rejected, Object.values(REJECTS).reduce((sum, row) => sum + Object.keys(row).length, 0), 'كل رفض مقصود مسمّى صار بالضبط (الجسم ينفّذ للباقين)');
  t.same(readOnlyFailures, [], `كل دالّة للقراءة تشتغل بمعاملة للقراءة بس (${readOnly.length} دالّة × ${PERSONAS.length} هويّات)`);
  await t.rejects(
    db.asUser(U.aOwner, async (q) => {
      await q('set local transaction_read_only = on');
      await q("select public.set_period_lock(date '2026-02-01')");
    }),
    'ضابط: دالّة تكتب ترفض بمعاملة للقراءة بس',
    /read-only transaction/,
  );

  // ── «اليوم» ما يتغيّر بمنطقة الجلسة: PostgREST يقبل Prefer: timezone من أي عميل ────────────────────────────────
  const zoned = async (zone) =>
    db.asUser(U.aOwner, async (q) => {
      await q(`set local timezone = '${zone}'`);
      const today = await value(q, 'select public.app_today()::text');
      return { today };
    });
  const zones = ['UTC', 'Etc/GMT+12', 'Pacific/Kiritimati', 'Asia/Baghdad'];
  const days = [];
  for (const zone of zones) days.push((await zoned(zone)).today); // اتصال واحد: المعاملات وحدة وحدة
  t.same(new Set(days).size, 1, `app_today() نفسه بكل منطقة جلسة (${zones.map((z, i) => `${z}=${days[i]}`).join('، ')})`);
  const datesByZone = [];
  for (const zone of zones) {
    datesByZone.push(
      await scenario(async ({ q, claims, attempt }) => {
        await q(`set local timezone = '${zone}'`);
        await claims(U.aOwner);
        const out = [];
        for (const offset of [0, 7, 8, -1]) out.push(await attempt('select private.check_doc_date(public.app_today() - $1::int)', [offset]));
        return out.join('،');
      }),
    );
  }
  t.same([...new Set(datesByZone)], ['ok،ok،date_too_old،date_in_future'], `حدّ الرجوع نفسه بكل منطقة جلسة (${zones.length})`);
}
