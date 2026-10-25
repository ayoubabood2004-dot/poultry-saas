// 0003_invite_codes (أجوبة المالك 2026-10-25): الدعوة تنقبل برمز يسلّمه المالك بيده، فحساب سجّل برقم الموظف قبله ما
// يدخل بلا الرمز؛ 5 محاولات غلط توقفه وتنحسب حتى لو الجواب نتيجة مو خطأ، وينتهي ويبطل بالأرشفة والرفض وإعادة الدعوة.
// و«رفض وحظر» يسدّ إعادة الدعوة من نفس المنشأة. منشأتا H وI لهذا الملف بس.

const id = (n) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USERS = ['hOwner', 'hManager', 'hEmp', 'hEmp2', 'hEmp3', 'hEmp4', 'iOwner'];
const U = Object.fromEntries(USERS.map((key, i) => [key, id(i + 1)]));
const PHONE = Object.fromEntries(USERS.map((key, i) => [key, `96477060000${String(i + 1).padStart(2, '0')}`]));
const local = (phone) => `0${phone.slice(3)}`;

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
  for (const key of USERS) {
    await db.admin('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())', [U[key], `${PHONE[key]}@phone.login`]);
  }
  await db.asUser(U.hOwner, (q) => q("select public.create_my_org('مزرعة الرموز', 'المالك')"), { commit: true });
  await db.asUser(U.iOwner, (q) => q("select public.create_my_org('مزرعة أخرى', 'مالك آخر')"), { commit: true });
  const inviteAs = (owner, key, role = 'viewer') =>
    db.asUser(owner, (q) => value(q, 'select public.add_member($1, $2, $3)', [local(PHONE[key]), role, key]), { commit: true });
  const managerInvite = await inviteAs(U.hOwner, 'hManager', 'manager');
  await db.acceptInvite(U.hOwner, U.hManager, managerInvite);
  const m = await inviteAs(U.hOwner, 'hEmp');
  const accept = (user, member, code) => db.asUser(user, (q) => value(q, 'select public.accept_invite_code($1, $2)', [member, code]), { commit: true });
  const issue = (owner, member) => db.asUser(owner, (q) => value(q, 'select public.invite_code($1)', [member]), { commit: true });

  // ── بلا رمز ما ينقبل، والقبول القديم انسحب ─────────────────────────────────────────────────────────────────
  t.eq(await outcome(accept(U.hEmp, m, '123456')), 'invite_code_expired', 'قبل ما المالك يصدر رمزاً: الدعوة ما تنقبل');
  t.ok(/permission denied/.test(await outcome(db.asUser(U.hEmp, (q) => q('select public.accept_invite($1)', [m])))), 'accept_invite بلا رمز انسحب من الواجهة');

  // ── منو يصدر الرمز ──────────────────────────────────────────────────────────────────────────────────────
  t.eq(await outcome(issue(U.hManager, m)), 'forbidden', 'المدير ما يصدر رمز دعوة (المالك بس)');
  t.eq(await outcome(issue(U.hOwner, managerInvite)), 'invite_already_accepted', 'عضو قبل ما يحتاج رمزاً');
  t.eq(await outcome(issue(U.iOwner, m)), 'member_not_found', 'مالك منشأة ثانية ما يصدر رمزاً لدعوة غيره');

  // ── الرمز ومخزنه ──────────────────────────────────────────────────────────────────────────────────────────
  const code = await issue(U.hOwner, m);
  t.ok(/^[0-9]{6}$/.test(code), `الرمز 6 أرقام (${code})`);
  const stored = (await db.admin("select code_hash, failures, expires_at - now() > interval '6 days 23 hours' as week from private.invite_codes where member_id = $1", [m])).rows[0];
  t.same([stored.code_hash !== code && stored.code_hash.startsWith('$2'), stored.failures, stored.week], [true, 0, true], 'مخزون hash bcrypt مو نصّه، وصالح 7 أيام');
  t.ok(/permission denied/.test(await outcome(db.asUser(U.hOwner, (q) => q('select * from private.invite_codes')))), 'الرموز ما تنقرا من الواجهة');

  // ── المحاولات الغلط تنحسب (الجواب نتيجة، فالعدّاد يثبت) ويّا التلميح بالعدد الصحيح ─────────────────────────────────
  const wrong = code === '000000' ? '111111' : '000000';
  const tries = [];
  for (let i = 0; i < 5; i += 1) tries.push(await accept(U.hEmp, m, wrong));
  t.same(tries.map((r) => r.tries_left), [4, 3, 2, 1, 0], 'كل رمز غلط ينقص محاولة');
  t.same(
    tries.map((r) => [r.error, r.hint]).slice(2),
    [
      ['invite_code_wrong', 'الرمز غير صحيح. بقيت محاولتان.'],
      ['invite_code_wrong', 'الرمز غير صحيح. بقيت محاولة واحدة.'],
      ['invite_code_wrong', 'الرمز غير صحيح، وأُوقف بعد 5 محاولات. اطلب من صاحب المنشأة رمزاً جديداً.'],
    ],
    'التلميح يكول الباقي بصيغة العدد الصحيحة',
  );
  t.eq((await db.admin('select failures from private.invite_codes where member_id = $1', [m])).rows[0].failures, 5, 'العدّاد ثابت بالقاعدة (الغلط ما رجّع المعاملة)');
  t.eq(await outcome(accept(U.hEmp, m, code)), 'invite_code_locked', 'بعد 5 غلط حتى الرمز الصحيح يرفض');

  // ── رمز جديد يبطل القديم ويصفّر، والأرقام الشرقية والفراغات تنقبل ─────────────────────────────────────────────
  const fresh = await issue(U.hOwner, m);
  t.ok(fresh === code || (await accept(U.hEmp, m, code)).error === 'invite_code_wrong', 'الرمز القديم بطل بعد إصدار الجديد');
  const eastern = fresh.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + Number(d)));
  const joined = await accept(U.hEmp, m, `${eastern.slice(0, 3)} ${eastern.slice(3)}`);
  t.same([joined.role, joined.org_name], ['viewer', 'مزرعة الرموز'], 'الرمز الجديد بأرقام شرقية وفراغ يقبل الدعوة');
  t.eq(await outcome(accept(U.hEmp, m, fresh)), 'invite_not_found', 'الدعوة المقبولة ما تنقبل مرّة ثانية');
  t.ok((await db.admin('select used_at is not null as used from private.invite_codes where member_id = $1', [m])).rows[0].used, 'الرمز انعلّم مستعملاً');

  // ── الانتهاء، والأرشفة وإعادة الدعوة تبطل الرمز ───────────────────────────────────────────────────────────────
  const m2 = await inviteAs(U.hOwner, 'hEmp2');
  const code2 = await issue(U.hOwner, m2);
  const expired = await db.asOwner(async (q) => {
    await q("update private.invite_codes set expires_at = now() - interval '1 minute' where member_id = $1", [m2]);
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.hEmp2, role: 'authenticated' })]);
    await q('set local role authenticated');
    return outcome(q('select public.accept_invite_code($1, $2)', [m2, code2]));
  });
  t.eq(expired, 'invite_code_expired', 'بعد 7 أيام الرمز ينتهي');
  await db.asUser(U.hEmp2, (q) => q('select public.decline_invite($1)', [m2]), { commit: true });
  t.eq(await outcome(accept(U.hEmp2, m2, code2)), 'invite_not_found', 'الدعوة المرفوضة ما تنقبل برمزها');
  t.eq(await inviteAs(U.hOwner, 'hEmp2'), m2, 'إعادة الدعوة بنفس المعرّف');
  t.eq(await outcome(accept(U.hEmp2, m2, code2)), 'invite_code_expired', 'إعادة الدعوة تبطل الرمز القديم');
  const m3 = await inviteAs(U.hOwner, 'hEmp3');
  const code3 = await issue(U.hOwner, m3);
  await db.asUser(U.hOwner, (q) => q('select public.archive_member($1)', [m3]), { commit: true });
  t.ok((await db.admin('select expires_at <= now() as dead from private.invite_codes where member_id = $1', [m3])).rows[0].dead, 'أرشفة الدعوة تبطل رمزها');
  t.eq(await inviteAs(U.hOwner, 'hEmp3'), m3, 'ضابط: الدعوة رجعت');
  t.eq(await outcome(accept(U.hEmp3, m3, code3)), 'invite_code_expired', 'رمز الدعوة المؤرشفة ما يرجع يشتغل');

  // ── «رفض وحظر» ──────────────────────────────────────────────────────────────────────────────────────────
  const m4 = await inviteAs(U.hOwner, 'hEmp4');
  t.eq(await outcome(db.asUser(U.hEmp3, (q) => q('select public.decline_and_block($1)', [m4]))), 'invite_not_found', 'ما يحظر بدعوة غيره');
  await db.asUser(U.hEmp4, (q) => q('select public.decline_and_block($1)', [m4]), { commit: true });
  t.same((await db.asUser(U.hEmp4, (q) => value(q, 'select public.my_workspace()'))).invites, [], 'الدعوة المحظورة تختفي');
  t.eq(await outcome(inviteAs(U.hOwner, 'hEmp4')), 'invite_blocked', 'المنشأة المحظورة ما تعيد الدعوة');
  t.eq(await outcome(db.asUser(U.iOwner, (q) => q("select public.add_member($1, 'viewer', 'س')", [local(PHONE.hEmp4)]))), 'ok', 'ضابط: منشأة ثانية تدعوه عادي');
  t.ok(/permission denied/.test(await outcome(db.asUser(U.hEmp4, (q) => q('select * from private.invite_blocks')))), 'الحظر ما ينقرا من الواجهة');
}
