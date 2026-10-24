// 0001_core بدور authenticated حقيقي (FOUNDATION حزمة بوستغريس ٤، وشرط «منتهية» للمرحلة 0): منشأة ما تقرأ ولا تكتب
// بغيرها، الكتابة من الدوالّ بس، المالك بس يضيف الموظفين وآخر مالك ما ينزل، عامل القاعة ما يشوف السجلّ (قائمة الكلف)،
// قفل الفترة وحدّ الرجوع ٧ أيام، ودفاتر سبعة لكل منشأة. كل فحص يدّعي منع معه ضابط إيجابي يثبت إنه يكدر يفشل.

const U = {
  aOwner: 'a0000000-0000-4000-8000-000000000001',
  aWorker: 'a0000000-0000-4000-8000-000000000002',
  aManager: 'a0000000-0000-4000-8000-000000000003',
  aViewer: 'a0000000-0000-4000-8000-000000000004',
  aAccountant: 'a0000000-0000-4000-8000-000000000005',
  emailUser: 'a0000000-0000-4000-8000-000000000006',
  aSpare: 'a0000000-0000-4000-8000-000000000007',
  bOwner: 'b0000000-0000-4000-8000-000000000001',
};
const PHONE = {
  aOwner: '9647701000001',
  aWorker: '9647701000002',
  aManager: '9647701000003',
  aViewer: '9647701000004',
  aAccountant: '9647701000005',
  emailUser: '9647701000006',
  aSpare: '9647701000007',
  bOwner: '9647801000001',
};

const one = async (q, sql, params) => (await q(sql, params)).rows[0];
const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];

export default async function (t, db) {
  // المستخدمون: الكل برقم الهاتف بعمود phone، وواحد بالبريد «الرقم@phone.login» (الدخول بلا SMS).
  for (const [key, id] of Object.entries(U)) {
    if (key === 'emailUser') await db.admin('insert into auth.users (id, email) values ($1, $2)', [id, `${PHONE[key]}@phone.login`]);
    else await db.admin('insert into auth.users (id, phone) values ($1, $2)', [id, PHONE[key]]);
  }

  // ── بلا منشأة، وبلا دخول ──────────────────────────────────────────────────────────────────────────────
  const fresh = await db.asUser(U.aOwner, (q) => value(q, 'select public.my_workspace()'));
  t.same([fresh.org_id, fresh.phone], [null, PHONE.aOwner], 'بلا منشأة: org_id فارغ ويرجع رقمه حتى ينطيه للمالك');
  await t.rejects(db.asAnon((q) => q('select public.my_workspace()')), 'anon ما ينفّذ my_workspace', /permission denied/);
  await t.rejects(db.asAnon((q) => q('select * from public.members')), 'anon ما يقرأ الأعضاء', /permission denied/);
  await t.rejects(db.asAnon((q) => q('select * from public.orgs')), 'anon ما يقرأ المنشآت', /permission denied/);

  // ── المشترك ينشئ منشأته ───────────────────────────────────────────────────────────────────────────────
  const created = await db.asUser(U.aOwner, (q) => value(q, "select public.create_my_org('مزرعة الأمل', 'أبو علي')"), { commit: true });
  t.same([created.role, created.org_name, created.divisions], ['owner', 'مزرعة الأمل', ['broiler', 'feed_mill', 'general', 'hatchery', 'layer', 'medicine']], 'المنشئ مالك ويشوف الوحدات الست');
  t.same([created.can_see_cost, created.can_see_accounts, created.can_see_sales], [true, true, true], 'المالك يشوف الكلف والحسابات والمبيعات');
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.create_my_org('ثانية', 'أبو علي')")), 'منشأة ثانية لنفس المستخدم ترفض', /^already_member$/);
  await t.rejects(db.asUser(U.aWorker, (q) => q("select public.create_my_org('  ', 'س')")), 'اسم فارغ يرفض', /^invalid_name$/);
  await db.asUser(U.bOwner, (q) => q("select public.create_my_org('مزرعة النور', 'أبو حسن')"), { commit: true });

  const orgA = (await db.admin("select id from public.orgs where name = 'مزرعة الأمل'")).rows[0].id;
  const orgB = (await db.admin("select id from public.orgs where name = 'مزرعة النور'")).rows[0].id;
  const division = async (org, kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const aBroiler = await division(orgA, 'broiler');
  const aLayer = await division(orgA, 'layer');
  const aGeneral = await division(orgA, 'general');
  const bBroiler = await division(orgB, 'broiler');

  // ── العزل بين المنشآت (شرط «منتهية» للمرحلة 0) ────────────────────────────────────────────────────────────
  const counts = (q) =>
    one(q, `select
      (select count(*)::int from public.orgs) as orgs,
      (select count(*)::int from public.members) as members,
      (select count(*)::int from public.divisions) as divisions,
      (select count(*)::int from public.ledger_books) as books,
      (select count(*)::int from public.divisions where org_id = $1) as foreign_divisions`, [orgB]);
  t.same(await db.asUser(U.aOwner, counts), { orgs: 1, members: 1, divisions: 6, books: 7, foreign_divisions: 0 }, 'منشأة أ: صفوفها بس، وصفر من ب');
  const bSees = await db.asUser(U.bOwner, (q) => one(q, 'select (select count(*)::int from public.divisions where org_id = $1) as own, (select count(*)::int from public.divisions where org_id = $2) as other', [orgB, orgA]));
  t.same(bSees, { own: 6, other: 0 }, 'ضابط: منشأة ب تشوف صفوفها هي، وصفر من أ');

  // ── الكتابة من الدوالّ بس ─────────────────────────────────────────────────────────────────────────────
  await t.rejects(db.asUser(U.aOwner, (q) => q("insert into public.divisions (kind, name) values ('broiler', 'ثانية')")), 'إدخال مباشر بالوحدات يرفض', /permission denied/);
  await t.rejects(db.asUser(U.aOwner, (q) => q("update public.members set role = 'viewer'")), 'تعديل مباشر بالأعضاء يرفض', /permission denied/);
  await t.rejects(db.asUser(U.aOwner, (q) => q('delete from public.ledger_books')), 'حذف مباشر بالدفاتر يرفض', /permission denied/);
  await t.rejects(db.asUser(U.aOwner, (q) => q('select * from public.rpc_refs')), 'rpc_refs ما تنقرا من الواجهة', /permission denied/);

  // ── المالك بس يضيف الموظفين ───────────────────────────────────────────────────────────────────────────
  await db.asUser(
    U.aOwner,
    async (q) => {
      await q("select public.add_member('0770 100 0002', 'hall_worker', 'أبو حسين', array[$1]::uuid[])", [aBroiler]);
      await q("select public.add_member('+9647701000003', 'manager', 'المدير')");
      await q("select public.add_member('07701000004', 'viewer', 'المشاهد')");
      await q("select public.add_member('٠٧٧٠١٠٠٠٠٠٥', 'accountant', 'المحاسب')");
      await q("select public.add_member('07701000006', 'storekeeper', 'أمين المخزن', array[$1]::uuid[])", [aGeneral]);
    },
    { commit: true },
  );
  t.eq(await db.asUser(U.aOwner, (q) => value(q, 'select count(*)::int from public.members')), 6, 'المالك أضاف خمسة بأشكال أرقام مختلفة (ويّا صاحب البريد)');
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.add_member('07709999999', 'viewer', 'س')")), 'رقم بلا حساب يرفض', /^user_not_found$/);
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.add_member('12345', 'viewer', 'س')")), 'رقم غلط يرفض', /^invalid_phone$/);
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.add_member('07801000001', 'viewer', 'س')")), 'عضو منشأة ثانية يرفض', /^already_member$/);
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.add_member('07701000002', 'viewer', 'س')")), 'عضو موجود يرفض', /^already_in_org$/);
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.add_member('07709999999', 'boss', 'س')")), 'دور مو من الثمانية يرفض', /^invalid_role$/);
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.add_member('07701000007', 'viewer', 'س', array[$1]::uuid[])", [bBroiler])), 'نطاق بوحدة منشأة ثانية يرفض', /^division_not_found$/);
  await t.rejects(db.asUser(U.aManager, (q) => q("select public.add_member('07709999999', 'viewer', 'س')")), 'المدير ما يضيف موظفين (المالك بس)', /^forbidden$/);
  await t.rejects(db.asUser(U.aWorker, (q) => q("select public.add_member('07709999999', 'viewer', 'س')")), 'العامل ما يضيف موظفين', /^forbidden$/);

  // ── مساحة العامل ونطاقه ───────────────────────────────────────────────────────────────────────────────
  const worker = await db.asUser(U.aWorker, (q) => value(q, 'select public.my_workspace()'));
  t.same([worker.role, worker.divisions, worker.can_see_cost, worker.can_see_sales], ['hall_worker', ['broiler'], false, false], 'العامل: دوره ووحدته بس، بلا كلف ولا مبيعات');
  const scope = (userId) =>
    db.asUser(userId, (q) =>
      one(q, 'select public.in_scope_division($1) as broiler, public.in_scope_division($2) as layer, public.in_scope_division($3) as foreign', [aBroiler, aLayer, bBroiler]),
    );
  t.same(await scope(U.aWorker), { broiler: true, layer: false, foreign: false }, 'العامل: حقول اللحم بس');
  t.same(await scope(U.aManager), { broiler: true, layer: true, foreign: false }, 'المدير بلا صفوف: كل وحداته، وما يعبر لمنشأة ثانية');
  t.same(await scope(U.aViewer), { broiler: false, layer: false, foreign: false }, 'المشاهد بلا صفوف: ولا وحدة');
  t.same(await scope(U.aOwner), { broiler: true, layer: true, foreign: false }, 'المالك: كل وحداته');

  // ── السجلّ على قائمة الكلف: عامل القاعة ما يشوفه ─────────────────────────────────────────────────────────
  const auditCount = (userId) => db.asUser(userId, (q) => value(q, 'select count(*)::int from public.audit_log'));
  t.ok((await auditCount(U.aOwner)) > 0, 'ضابط: المالك يشوف السجلّ');
  t.ok((await auditCount(U.aAccountant)) > 0, 'ضابط: المحاسب يشوف السجلّ');
  t.eq(await auditCount(U.aWorker), 0, 'عامل القاعة ما يشوف السجلّ');
  t.eq(await auditCount(U.aViewer), 0, 'المشاهد ما يشوف السجلّ');
  t.eq(await auditCount(U.emailUser), 0, 'أمين المخزن ما يشوف السجلّ');
  const actor = await db.admin(
    "select actor from public.audit_log where table_name = 'members' and op = 'insert' and (new ->> 'user_id')::uuid = $1",
    [U.aWorker],
  );
  t.same(actor.rows, [{ actor: U.aOwner }], 'السجلّ يكول منو أضاف العامل');
  await t.rejects(db.asOwner((q) => q("update public.audit_log set op = 'delete'")), 'السجلّ ما يتعدّل حتى من صاحب الجداول', /^append_only$/);

  // ── آخر مالك ──────────────────────────────────────────────────────────────────────────────────────────
  const memberId = async (userId) => (await db.admin('select id from public.members where user_id = $1', [userId])).rows[0].id;
  const ownerMember = await memberId(U.aOwner);
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.set_member_role($1, 'manager')", [ownerMember])), 'آخر مالك ما ينزل', /^last_owner$/);
  await t.rejects(db.asUser(U.aOwner, (q) => q('select public.archive_member($1)', [ownerMember])), 'آخر مالك ما ينشال', /^last_owner$/);
  const promoted = await db.asUser(U.aOwner, async (q) => {
    await q("select public.set_member_role($1, 'owner')", [await memberId(U.aManager)]);
    await q("select public.set_member_role($1, 'manager')", [ownerMember]);
    return value(q, "select count(*)::int from public.members where role = 'owner' and archived_at is null");
  });
  t.eq(promoted, 1, 'ضابط: ويّا مالك ثاني ينزل الأوّل');
  const bOwnerMember = await memberId(U.bOwner);
  await t.rejects(db.asUser(U.aOwner, (q) => q("select public.set_member_role($1, 'viewer')", [bOwnerMember])), 'عضو منشأة ثانية ما ينلمس', /^member_not_found$/);
  const rescoped = await db.asUser(U.aOwner, async (q) => {
    const worker = await memberId(U.aWorker);
    await q('select public.set_member_scopes($1, array[$2]::uuid[])', [worker, aLayer]);
    return one(q, 'select count(*) filter (where archived_at is null)::int as active, count(*)::int as total from public.member_scopes where member_id = $1', [worker]);
  });
  t.same(rescoped, { active: 1, total: 2 }, 'تغيير النطاق يؤرشف القديم ما يحذفه');

  // ── قفل الفترة وحدّ الرجوع ٧ أيام (يوم ثابت للحزمة) ───────────────────────────────────────────────────────
  const FIXED = '2026-03-15';
  const atDay = (q) => q(`create or replace function public.app_today() returns date language sql stable as $$ select date '${FIXED}' $$`);
  await t.rejects(db.asUser(U.aWorker, (q) => q("select public.set_period_lock(date '2026-03-01')")), 'العامل ما يقفل', /^forbidden$/);
  const lockFlow = await db.asOwner(async (q) => {
    await atDay(q);
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.aManager, role: 'authenticated' })]);
    await q('set local role authenticated');
    const results = {};
    const attempt = async (label, sql) => {
      await q('savepoint s');
      try {
        await q(sql);
        results[label] = 'ok';
      } catch (error) {
        results[label] = error.message;
      }
      await q('rollback to savepoint s');
    };
    await attempt('manager_locks', "select public.set_period_lock(date '2026-03-10')");
    await q("select public.set_period_lock(date '2026-03-10')");
    await attempt('today', "select public.set_period_lock(date '2026-03-15')");
    await attempt('manager_unlocks', "select public.set_period_lock(date '2026-03-01')");
    await attempt('manager_moves_forward', "select public.set_period_lock(date '2026-03-12')");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.aOwner, role: 'authenticated' })]);
    await attempt('owner_unlocks', "select public.set_period_lock(date '2026-03-01')");
    return results;
  });
  t.same(
    lockFlow,
    { manager_locks: 'ok', today: 'lock_in_future', manager_unlocks: 'owner_only_unlock', manager_moves_forward: 'ok', owner_unlocks: 'ok' },
    'القفل: المدير يقفل ويقدّم، وفتح المقفول للمالك بس، واليوم ما ينقفل',
  );
  // حدّ الرجوع لحاله (بلا قفل)، والقفل لحاله: قفل 11/03 يقفل كل ما قبله، فما يختلط بحدّ الأيام السبعة.
  const checkDates = (lockThrough, days) =>
    db.asOwner(async (q) => {
      await atDay(q);
      if (lockThrough) await q('insert into public.period_locks (org_id, locked_through) values ($1, $2::date)', [orgA, lockThrough]);
      const out = {};
      for (const day of days) {
        await q('savepoint s');
        try {
          await q('select private.check_doc_date($1::date)', [day]);
          out[day] = 'ok';
        } catch (error) {
          out[day] = error.message;
        }
        await q('rollback to savepoint s');
      }
      return out;
    }, U.aOwner);
  t.same(
    await checkDates(null, ['2026-03-15', '2026-03-08', '2026-03-07', '2026-03-16']),
    { '2026-03-15': 'ok', '2026-03-08': 'ok', '2026-03-07': 'date_too_old', '2026-03-16': 'date_in_future' },
    'حدّ الرجوع: اليوم و٧ أيام قبله مقبولة (08/03)، والثامن مرفوض (07/03)، والمستقبل مرفوض',
  );
  t.same(
    await checkDates('2026-03-11', ['2026-03-11', '2026-03-09', '2026-03-12']),
    { '2026-03-11': 'period_locked', '2026-03-09': 'period_locked', '2026-03-12': 'ok' },
    'القفل حتى 11/03: يومه وما قبله مرفوضة، و12/03 مقبول',
  );

  // ── المفاتيح المركّبة: صفّ ما يأشّر على منشأة ثانية حتى من صاحب الجداول ─────────────────────────────────
  await t.rejects(
    db.asOwner(async (q) => q('insert into public.member_scopes (org_id, member_id, division_id) values ($1, $2, $3)', [orgA, await memberId(U.aWorker), bBroiler])),
    'نطاق عضو أ بوحدة ب يرفض بالمفتاح المركّب',
    /foreign key/,
  );

  // ── الثوابت: ست وحدات وسبعة دفاتر ومالك لكل منشأة ─────────────────────────────────────────────────────────
  const verify = async (q) => Object.fromEntries((await q('select check_name, violations::int from public.verify_core()')).rows.map((r) => [r.check_name, r.violations]));
  t.same(
    await db.asOwner(verify),
    { divisions_per_org: 0, books_per_org: 0, book_codes: 0, orgs_without_owner: 0, scopes_of_archived_members: 0 },
    'verify_core صفر',
  );
  const broken = await db.asOwner(async (q) => {
    await q("update public.ledger_books set archived_at = now() where org_id = $1 and code = 'chicks'", [orgA]);
    return verify(q);
  });
  t.eq(broken.books_per_org, 1, 'ضابط: دفتر مؤرشف ينمسك بـverify_core');
  await t.rejects(
    db.asOwner((q) => q("update public.ledger_books set code = 'main' where org_id = $1 and code = 'chicks'", [orgA])),
    'دفتر المفقس ما يصير main',
    /^book_code_mismatch$/,
  );
}
