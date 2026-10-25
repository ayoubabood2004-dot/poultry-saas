// 0002_account_checks: الحساب اللي ينلكى بالرقم أو يُعدّ «داخلاً» لازم حساب حيّ بالشكل الموحّد. كل حالة من التحقّق
// بالإنتاج (2026-10-25): الشكل البديل للبريد ما يُعدّ رقماً ولا يزاحم الموحّد، والمحذوف والموقوف والمجهول وغير المؤكَّد
// ما ينلكون ولا يدخلون، والتوكن لمستخدم مو موجود يطلع not_signed_in مو خطأ مفتاح خام. منشأة E لهذا الملف بس.

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = 'now()';
// [المفتاح، الهاتف، البريد، أعمدة إضافية]. كل الحسابات مؤكَّدة إلا المسمّى.
const ACCOUNTS = [
  ['owner', '9647704000001', null, {}],
  ['canonical', null, '9647704000002@phone.login', {}],
  ['alias07', null, '07704000003@phone.login', {}],
  ['twinCanonical', null, '9647704000004@phone.login', {}],
  ['twinAlias', null, '07704000004@phone.login', {}],
  ['arabicAlias', null, '٠٧٧٠٤٠٠٠٠٠٥@phone.login', {}],
  ['plusAlias', null, '+9647704000006@phone.login', {}],
  ['banned', null, '9647704000007@phone.login', { banned_until: "now() + interval '1 day'" }],
  ['banEnded', null, '9647704000008@phone.login', { banned_until: "now() - interval '1 day'" }],
  ['anonymous', null, '9647704000009@phone.login', { is_anonymous: 'true' }],
  ['unconfirmed', null, '9647704000010@phone.login', { email_confirmed_at: 'null' }],
  ['deleted', null, '9647704000011@phone.login', { deleted_at: NOW }],
  ['upperDomain', null, '9647704000012@PHONE.LOGIN', {}],
  ['otherDomain', null, '9647704000013@phone.login.example.com', {}],
  // منشأة F: أعضاء حقيقيون، وبعدين حساب واحد منهم ينحظر أو ينحذف بمعاملة ترجع.
  ['fOwner', null, '9647704000014@phone.login', {}],
  ['fOwner2', null, '9647704000015@phone.login', {}],
  ['fManager', null, '9647704000016@phone.login', {}],
  ['fInvitee', null, '9647704000017@phone.login', {}],
];
const U = Object.fromEntries(ACCOUNTS.map(([key], i) => [key, id(i + 1)]));
const MISSING = id(999); // توكن لمستخدم مو بـauth.users

const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];
const outcome = async (promise) => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error.message;
  }
};

export default async function (t, db) {
  for (const [key, phone, email, extra] of ACCOUNTS) {
    const columns = {
      phone_confirmed_at: phone ? NOW : 'null',
      email_confirmed_at: email ? NOW : 'null',
      ...extra,
    };
    const names = Object.keys(columns);
    await db.admin(
      `insert into auth.users (id, phone, email, ${names.join(', ')}) values ($1, $2, $3, ${names.map((n) => columns[n]).join(', ')})`,
      [U[key], phone, email],
    );
  }
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة الحسابات', 'المالك')"), { commit: true });
  const orgs = async () => Number((await db.admin('select count(*) from public.orgs')).rows[0].count);
  const orgsBefore = await orgs();

  // ── البحث بالرقم: الحساب الحيّ بالشكل الموحّد بس ───────────────────────────────────────────────────────────
  const invite = (phone) => db.asUser(U.owner, (q) => value(q, "select public.add_member($1, 'viewer', 'موظف')", [phone]));
  const invitedUser = async (phone) =>
    db.asUser(U.owner, async (q) => {
      const member = await value(q, "select public.add_member($1, 'viewer', 'موظف')", [phone]);
      return value(q, 'select user_id from public.members where id = $1', [member]);
    });
  t.eq(await invitedUser('0770 400 0002'), U.canonical, 'بريد الدخول الموحّد ينلكى بالرقم');
  t.eq(await invitedUser('07704000004'), U.twinCanonical, 'الشكل البديل للبريد ما يزاحم الموحّد (ماكو phone_ambiguous)');
  t.eq(await invitedUser('07704000008'), U.banEnded, 'حساب انتهى إيقافه ينلكى');
  const notFound = {};
  for (const [key, phone] of [
    ['alias07', '07704000003'],
    ['arabicAlias', '07704000005'],
    ['plusAlias', '07704000006'],
    ['banned', '07704000007'],
    ['anonymous', '07704000009'],
    ['unconfirmed', '07704000010'],
    ['deleted', '07704000011'],
    ['otherDomain', '07704000013'],
    ['upperDomain', '07704000012'], // GoTrue يصغّر كل بريد، فهذا الشكل ما يجي منه؛ المطابقة حرفية مثل الفهرس
  ]) {
    notFound[key] = await outcome(invite(phone));
  }
  t.same(
    Object.entries(notFound).filter(([, result]) => result !== 'user_not_found').map(([key, result]) => `${key}: ${result}`),
    [],
    `ما ينلكون بالرقم: الأشكال البديلة والموقوف والمجهول وغير المؤكَّد والمحذوف ونطاق ثاني أو بحروف كبيرة (${Object.keys(notFound).length})`,
  );

  // ── «داخل» يعني حساب حيّ: التوكن وحده ما يكفي ──────────────────────────────────────────────────────────────
  const signedIn = {};
  for (const [key, user] of [
    ['missing', MISSING],
    ['banned', U.banned],
    ['anonymous', U.anonymous],
    ['unconfirmed', U.unconfirmed],
    ['deleted', U.deleted],
  ]) {
    signedIn[key] = [
      await outcome(db.asUser(user, (q) => q('select public.my_workspace()'))),
      await outcome(db.asUser(user, (q) => q("select public.create_my_org('منشأة', 'س')"), { commit: true })),
      await outcome(db.asUser(user, (q) => q('select public.leave_my_org()'))),
    ].join('،');
  }
  t.same(
    Object.entries(signedIn).filter(([, result]) => result !== 'not_signed_in،not_signed_in،not_signed_in').map(([key, result]) => `${key}: ${result}`),
    [],
    'مستخدم مو موجود أو موقوف أو مجهول أو غير مؤكَّد أو محذوف: not_signed_in من my_workspace وcreate_my_org وleave_my_org (مو 23503 ولا منشأة)',
  );
  t.eq(await orgs(), orgsBefore, 'ضابط: ولا منشأة انخلقت من المحاولات');
  const hint = await db.asUser(MISSING, (q) => q('select public.my_workspace()')).catch((error) => error.hint);
  t.ok(/غير متاح/.test(hint ?? ''), `تلميح الحساب غير المتاح يقول السبب (${hint})`);
  t.eq((await db.asUser(U.canonical, (q) => value(q, 'select public.my_workspace()'))).phone, '9647704000002', 'ضابط: الحساب الحيّ يدخل ويرجع رقمه من بريد الدخول');
  t.eq((await db.asUser(U.alias07, (q) => value(q, 'select public.my_workspace()'))).phone, null, 'الشكل البديل يدخل بس ما يُعدّ رقماً');

  // ── تلميح الفعل الفارغ ─────────────────────────────────────────────────────────────────────────────────────
  const empty = await db.admin("select private.role_can('owner', null)").catch((error) => [error.message, error.hint]);
  t.same(empty, ['unknown_action', 'لم يُحدَّد الإجراء.'], 'فعل فارغ: unknown_action بتلميح يقول السبب');

  // ── عضو انحظر أو انحذف حسابه وتوكنه بعده صالح: ما يقرأ ولا يدير (الهويّة نفسها على الحساب الحيّ) ─────────────────
  await db.asUser(U.fOwner, (q) => q("select public.create_my_org('مزرعة الإيقاف', 'المالك')"), { commit: true });
  const fInvites = await db.asUser(
    U.fOwner,
    async (q) => ({
      fOwner2: await value(q, "select public.add_member('07704000015', 'owner', 'المالك الثاني')"),
      fManager: await value(q, "select public.add_member('07704000016', 'manager', 'المدير')"),
      fInvitee: await value(q, "select public.add_member('07704000017', 'viewer', 'المدعوّ')"),
    }),
    { commit: true },
  );
  for (const key of ['fOwner2', 'fManager']) await db.asUser(U[key], (q) => q('select public.accept_invite($1)', [fInvites[key]]), { commit: true });
  const fOrg = (await db.admin("select id from public.orgs where name = 'مزرعة الإيقاف'")).rows[0].id;
  const fMember = async (user) => (await db.admin('select id from public.members where org_id = $1 and user_id = $2', [fOrg, user])).rows[0].id;
  const fOwner2Member = await fMember(U.fOwner2);
  const fBroiler = (await db.admin("select id from public.divisions where org_id = $1 and kind = 'broiler'", [fOrg])).rows[0].id;

  // change على حساب dead بمعاملة ترجع، وبعدها actor يجرّب. 'ok' للنجاح بلا قيمة، والقيمة نصّاً، أو رمز الخطأ.
  const withAccount = (dead, change, actor, probes) =>
    db.asOwner(async (q) => {
      if (change) await q(`update auth.users set ${change} where id = $1`, [dead]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor, role: 'authenticated' })]);
      await q('set local role authenticated');
      const out = {};
      for (const [label, sql, params] of probes) {
        await q('savepoint s');
        try {
          const row = (await q(sql, params)).rows[0];
          const got = row ? Object.values(row)[0] : null;
          out[label] = got === '' || got === null ? 'ok' : String(got);
          await q('release savepoint s');
        } catch (error) {
          out[label] = error.message;
          await q('rollback to savepoint s');
        }
      }
      return out;
    });
  const managerProbes = [
    ['org', 'select (public.auth_org() is not null)::text'],
    ['can', "select public.can('period.lock')::text"],
    ['members', 'select count(*)::text from public.members'],
    ['scope', 'select public.in_scope_division($1)::text', [fBroiler]],
    ['lock', 'select public.set_period_lock(public.app_today() - 3)::text'],
  ];
  const managerLive = await withAccount(null, null, U.fManager, managerProbes);
  t.same([managerLive.org, managerLive.can, managerLive.members, managerLive.scope], ['true', 'true', '4', 'true'], 'ضابط: المدير الحيّ يشوف منشأته ووحداته ويقفل');
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(managerLive.lock), `ضابط: المدير الحيّ يقفل الفترة (${managerLive.lock})`);
  for (const [label, change] of [['banned', "banned_until = now() + interval '1 day'"], ['deleted', 'deleted_at = now()']]) {
    t.same(
      await withAccount(U.fManager, change, U.fManager, managerProbes),
      { org: 'false', can: 'false', members: '0', scope: 'false', lock: 'forbidden' },
      `مدير حسابه ${label}: ما يشوف منشأته ولا أعضاءها ولا وحداته ولا يقفل`,
    );
    t.same(
      await withAccount(U.fOwner, change, U.fOwner, [
        ['add', "select public.add_member('07704000002', 'viewer', 'س')"],
        ['archive', 'select public.archive_member($1)', [await fMember(U.fManager)]],
        ['scopes', "select public.set_member_scopes($1, '{}')", [await fMember(U.fManager)]],
      ]),
      { add: 'forbidden', archive: 'forbidden', scopes: 'forbidden' },
      `مالك حسابه ${label}: ما يدعو ولا يؤرشف ولا يغيّر نطاقاً`,
    );
    t.same(
      await withAccount(U.fOwner, change, U.fOwner2, [['demote', "select public.set_member_role($1, 'manager')", [fOwner2Member]]]),
      { demote: 'last_owner' },
      `المالك الحيّ ما ينزل إذا المالك الثاني ${label} (الموقوف ما يُعدّ مالكاً)`,
    );
    t.same(
      await withAccount(U.fInvitee, change, U.fInvitee, [
        ['accept', 'select public.accept_invite($1)', [fInvites.fInvitee]],
        ['decline', 'select public.decline_invite($1)', [fInvites.fInvitee]],
      ]),
      { accept: 'not_signed_in', decline: 'not_signed_in' },
      `مدعوّ حسابه ${label}: ما يقبل ولا يرفض`,
    );
  }
  t.same(
    await withAccount(null, null, U.fOwner2, [['demote', "select public.set_member_role($1, 'manager')", [fOwner2Member]]]),
    { demote: 'ok' },
    'ضابط: ويّا مالك حيّ ثاني، المالك ينزل',
  );

  // ── البحث بالرقم بالفهرسين، مو مسح كل الحسابات لكل دعوة (أي مالك يكدر يناديه بلا حدّ) ──────────────────────────
  // بلا مسح تسلسلي، المخطّط يا يستعمل الفهرس يا يمسح غصباً؛ عدّاد الفهرس بـpg_stat يكول أيّهما صار.
  const indexScans = async () => {
    await db.admin('select pg_stat_force_next_flush()');
    await db.admin('select pg_stat_clear_snapshot()');
    const { rows } = await db.admin("select indexrelname as name, idx_scan::int as n from pg_stat_all_indexes where schemaname = 'auth' and relname = 'users' and indexrelname in ('users_phone_key', 'users_email_partial_key')");
    return Object.fromEntries(rows.map((row) => [row.name, row.n]));
  };
  const before = await indexScans();
  await db.asUser(U.owner, async (q) => {
    await q('set local enable_seqscan = off');
    await q("select public.add_member('07704000002', 'viewer', 'موظف')");
  });
  await db.admin('select 1'); // الإحصاءات تنكتب لمّا الجلسة تفرغ
  const after = await indexScans();
  t.ok(
    after.users_phone_key > before.users_phone_key && after.users_email_partial_key > before.users_email_partial_key,
    `البحث بالرقم يستعمل فهرسَي الهاتف والبريد (${JSON.stringify(before)} ← ${JSON.stringify(after)})`,
  );
}
