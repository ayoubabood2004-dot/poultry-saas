// التزامن بجلستين حقيقيتين (اتصالان بنفس اللحظة): كل قفل بالهجرة إله فحص يثبت إن الجلسة الثانية تنحبس عليه وتطلع
// بالرمز الصحيح بعد ما الأولى تثبّت. بلا القفل، النتيجة إمّا خطأ خام (duplicate key) أو حالة مكسورة (منشأة بلا مالك،
// موظف فتح فترة مقفلة)، والفحص يمسكها. منشأة C ومستخدموها لهذا الملف بس.

const U = {
  owner: 'c0000000-0000-4000-8000-000000000001',
  owner2: 'c0000000-0000-4000-8000-000000000002',
  manager1: 'c0000000-0000-4000-8000-000000000003',
  manager2: 'c0000000-0000-4000-8000-000000000004',
  joiner: 'c0000000-0000-4000-8000-000000000005',
};
const PHONE = { owner: '9647702000001', owner2: '9647702000002', manager1: '9647702000003', manager2: '9647702000004', joiner: '9647702000005' };

const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];

export default async function (t, db) {
  for (const [key, id] of Object.entries(U)) await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id, PHONE[key]]);
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة التزامن', 'المالك')"), { commit: true });
  const invites = await db.asUser(
    U.owner,
    async (q) => ({
      owner2: await value(q, "select public.add_member($1, 'owner', 'المالك الثاني')", [PHONE.owner2]),
      manager1: await value(q, "select public.add_member($1, 'manager', 'المدير الأول')", [PHONE.manager1]),
      manager2: await value(q, "select public.add_member($1, 'manager', 'المدير الثاني')", [PHONE.manager2]),
      joiner: await value(q, "select public.add_member($1, 'viewer', 'المنضمّ')", [PHONE.joiner]),
    }),
    { commit: true },
  );
  for (const key of ['owner2', 'manager1', 'manager2']) {
    await db.asUser(U[key], (q) => q('select public.accept_invite($1)', [invites[key]]), { commit: true });
  }
  const org = (await db.admin("select id from public.orgs where name = 'مزرعة التزامن'")).rows[0].id;
  const ownerMember = (await db.admin('select id from public.members where org_id = $1 and user_id = $2', [org, U.owner])).rows[0].id;

  // الأولى تنفّذ وتبقى مفتوحة، الثانية تنطلق وتنحبس، الأولى تثبّت، والثانية تكمل. الجلسات تنسدّ دائماً حتى لو الفحص فشل
  // (rollback بعد commit ما يسوّي شي).
  async function race(firstUser, firstSql, secondUser, secondSql) {
    const first = await db.session(firstUser);
    const second = await db.session(secondUser);
    try {
      const a = await first.run(...firstSql);
      const pendingB = second.run(...secondSql);
      const state = await db.settle(pendingB, second.pid);
      await first.commit();
      const b = await pendingB;
      return { first: a.ok ? 'ok' : a.error, state, second: b.ok ? 'ok' : b.error };
    } finally {
      await first.rollback();
      await second.rollback();
    }
  }

  // ١. ينشئ منشأة ويقبل دعوة بنفس اللحظة: القفل الاستشاري على المستخدم يرتّبهم، والثاني يطلع already_member.
  const joining = await race(
    U.joiner,
    ["select public.create_my_org('منشأة المنضمّ', 'المنضمّ')"],
    U.joiner,
    ['select public.accept_invite($1)', [invites.joiner]],
  );
  t.same(joining, { first: 'ok', state: 'blocked', second: 'already_member' }, 'إنشاء وقبول بنفس اللحظة: الثاني ينتظر ويرفض برمزه (مو duplicate key)');
  t.eq(
    Number((await db.admin("select count(*) from public.members where user_id = $1 and archived_at is null and accepted_at is not null", [U.joiner])).rows[0].count),
    1,
    'المنضمّ بعضوية فعّالة وحدة',
  );

  // ٢. مالكان ينزّلون بعض بنفس اللحظة: قفل صفوف المالكين يرتّبهم، والثاني يطلع last_owner.
  const owner2Member = invites.owner2;
  const demoting = await race(
    U.owner,
    ["select public.set_member_role($1, 'manager')", [owner2Member]],
    U.owner2,
    ["select public.set_member_role($1, 'manager')", [ownerMember]],
  );
  t.same(demoting, { first: 'ok', state: 'blocked', second: 'last_owner' }, 'مالكان ينزّلون بعض: الثاني ينتظر ويرفض');
  t.eq(
    Number((await db.admin("select count(*) from public.members where org_id = $1 and role = 'owner' and archived_at is null and accepted_at is not null", [org])).rows[0].count),
    1,
    'المنشأة بقى بيها مالك',
  );

  // ٣. مديران يقفلون أوّل مرّة بنفس اللحظة: القفل الاستشاري على المنشأة، فالثاني يشوف قفل الأوّل ورجوعه فتح = للمالك بس.
  const locking = await race(
    U.manager1,
    ['select public.set_period_lock(public.app_today() - 10)'],
    U.manager2,
    ['select public.set_period_lock(public.app_today() - 20)'],
  );
  t.same(locking, { first: 'ok', state: 'blocked', second: 'forbidden' }, 'أوّل قفلين بنفس اللحظة: الثاني ينتظر، ورجوعه فتح ما يحقّله');
  const lockedThrough = (await db.admin('select locked_through = public.app_today() - 10 as kept from public.period_locks where org_id = $1', [org])).rows[0];
  t.same(lockedThrough, { kept: true }, 'القفل بقى على تاريخ الأوّل');

  const verify = (await db.admin('select check_name, violations::int from public.verify_core() where violations > 0')).rows;
  t.same(verify, [], 'verify_core صفر بعد السباقات');
}
