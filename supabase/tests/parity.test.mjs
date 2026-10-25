// تطابق الخادم والشاشة (FOUNDATION parity-* ٨٥٤، و«جدول الصلاحيات» ٥٢٨): جدول الصلاحيات بـSQL (private.role_can)
// يطابق can() بـsrc/domain/permissions.ts خانةً خانة، وتطبيع الهاتف (private.normalize_phone) يطابق phone.ts.
// الملفات الحقيقية تنحزم بـesbuild (مو نسخة منها)، فأي تغيير بطرف واحد يفشل هنا.
import { PHONE_CASES } from '../../scripts/tests/phone.test.mjs';
import { loadSrc } from '../../scripts/tests/load-src.mjs';

export default async function (t, db) {
  const p = await loadSrc('src/domain/permissions.ts');
  const phone = await loadSrc('src/domain/phone.ts');

  // قائمة الأفعال نفسها بالطرفين.
  const sqlActions = (await db.admin('select private.actions() as a')).rows[0].a;
  t.same([...sqlActions].sort(), [...p.ACTIONS].sort(), 'الأفعال نفسها بـSQL وpermissions.ts');

  // كل دور × فعل × (ختم الكلف أو لا).
  const cells = [];
  for (const role of p.ROLES) for (const action of p.ACTIONS) for (const confirmed of [false, true]) cells.push({ role, action, confirmed });
  const sql = (await db.admin(
    `select x.role, x.action, x.confirmed, private.role_can(x.role, x.action, x.confirmed) as allowed
     from jsonb_to_recordset($1::jsonb) as x(role text, action text, confirmed boolean)`,
    [JSON.stringify(cells)],
  )).rows;
  t.eq(sql.length, cells.length, `كل الخانات انفحصت (${cells.length})`);
  const mismatch = sql
    .filter((row) => row.allowed !== p.can(row.role, row.action, { costsConfirmed: row.confirmed }))
    .map((row) => `${row.role} × ${row.action}${row.confirmed ? ' (كلف مختومة)' : ''}: SQL ${row.allowed}`);
  t.same(mismatch, [], 'جدول الصلاحيات نفسه بالخادم والشاشة');
  await t.rejects(db.admin("select private.role_can('owner', 'typo.action')"), 'فعل مو بالقائمة يرمي حتى للمالك', /^unknown_action$/);
  t.eq((await db.admin("select private.role_can(null, 'read') as a")).rows[0].a, false, 'بلا عضوية: ولا فعل');

  // تطبيع الهاتف: نفس الحالات بالطرفين.
  const phones = (await db.admin(
    'select x.i, private.normalize_phone(x.input) as sql from jsonb_to_recordset($1::jsonb) as x(i int, input text)',
    [JSON.stringify(PHONE_CASES.map(([input], i) => ({ i, input })))],
  )).rows;
  const phoneMismatch = phones
    .filter((row) => row.sql !== phone.normalizePhone(PHONE_CASES[row.i][0]))
    .map((row) => `«${PHONE_CASES[row.i][0]}»: SQL ${row.sql}`);
  t.eq(phones.length, PHONE_CASES.length, `حالات الهاتف انفحصت (${PHONE_CASES.length})`);
  t.same(phoneMismatch, [], 'تطبيع الهاتف نفسه بالخادم والشاشة');

  // بريد الدخول اللي تبنيه الشاشة (loginEmail) هو الشكل الوحيد اللي يعدّه الخادم رقماً (0002)، والنطاق نفسه بالطرفين.
  t.eq((await db.admin('select private.phone_login_domain() as d')).rows[0].d, phone.PHONE_LOGIN_DOMAIN, 'نطاق الدخول نفسه بالطرفين');
  const wanted = new Map(PHONE_CASES.map(([input]) => [phone.loginEmail(input), phone.normalizePhone(input)]).filter(([email]) => email));
  const counted = (await db.admin(
    'select x.email, private.account_phone(null, x.email) as got from unnest($1::text[]) as x(email)',
    [[...wanted.keys()]],
  )).rows;
  t.ok(counted.length >= 3, `حالات بريد الدخول المختلفة (${counted.length})`);
  t.same(counted.filter((row) => row.got !== wanted.get(row.email)).map((row) => `${row.email}: ${row.got}`), [], 'بريد loginEmail يُعدّ رقمه نفسه بالخادم');

  // كل حرف بـBMP (عدا الصفر والبدائل) بأوّل الرقم وبنصّه: الفراغ والفاصل والرقم الشرقي ينقرا نفسه بالطرفين، مو
  // بس الحالات اللي خطرت على البال. الصفر ما ينخزن بـtext أصلاً.
  const sweep = [];
  for (let code = 1; code <= 0xffff; code += 1) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    const ch = String.fromCharCode(code);
    sweep.push(`${ch}07701234567`, `0770${ch}1234567`);
  }
  const swept = (await db.admin(
    'select private.normalize_phone(x.s) as sql from unnest($1::text[]) with ordinality as x(s, i) order by x.i',
    [sweep],
  )).rows;
  t.eq(swept.length, sweep.length, `مسح BMP كامل (${sweep.length} مدخل)`);
  const sweepMismatch = [];
  swept.forEach((row, i) => {
    const js = phone.normalizePhone(sweep[i]);
    if (row.sql !== js) sweepMismatch.push(`U+${sweep[i].codePointAt(i % 2 === 0 ? 0 : 4).toString(16).toUpperCase().padStart(4, '0')}: SQL ${row.sql} JS ${js}`);
  });
  t.same(sweepMismatch.slice(0, 10), [], `ولا حرف يختلف بين الخادم والشاشة (${sweepMismatch.length} اختلاف)`);
  t.ok(swept.filter((row) => row.sql !== null).length > 10, 'ضابط: المسح بيه مقبولات (الفراغات والأرقام الشرقية)');

  // نفس الجدول بالواجهة الحقيقية: عضو حقيقي بكل دور، بلا نطاق وبنطاق وحدة وبنطاق انأرشف (يُعدّ بلا نطاق)، ينادي public.can وcan_see_* وin_scope_division
  // بهويّته، ويطابق can() وcanSee*() وinScope() بالشاشة.
  const members = [];
  p.ROLES.forEach((role, r) => {
    for (const [v, scope] of ['none', 'scoped', 'archived'].entries()) {
      const n = r * 3 + v;
      members.push({ role, scope, id: `d0000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`, phone: `96477030000${String(n).padStart(2, '0')}` });
    }
  });
  for (const m of members) await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [m.id, m.phone]);
  const [creator, ...rest] = members; // owner بلا نطاق ينشئ المنشأة
  await db.asUser(creator.id, (q) => q("select public.create_my_org('مزرعة التطابق', 'المالك')"), { commit: true });
  const org = (await db.admin("select id from public.orgs where name = 'مزرعة التطابق'")).rows[0].id;
  const divisions = Object.fromEntries((await db.admin('select kind, id from public.divisions where org_id = $1', [org])).rows.map((row) => [row.kind, row.id]));
  for (const m of rest) {
    const invite = await db.asUser(creator.id, (q) => q('select public.add_member($1, $2, $3, $4::uuid[]) as id', [m.phone, m.role, m.role, m.scope === 'none' ? [] : [divisions.broiler]]), { commit: true });
    if (m.scope === 'archived') await db.asUser(creator.id, (q) => q("select public.set_member_scopes($1, '{}')", [invite.rows[0].id]), { commit: true });
    await db.asUser(m.id, (q) => q('select public.accept_invite($1)', [invite.rows[0].id]), { commit: true });
  }
  const actionCells = p.ACTIONS.flatMap((action) => [false, true].map((confirmed) => ({ action, confirmed })));
  const memberMismatch = [];
  for (const m of members) {
    const seen = await db.asUser(m.id, async (q) => ({
      can: (await q('select x.action, x.confirmed, public.can(x.action, x.confirmed) as allowed from jsonb_to_recordset($1::jsonb) as x(action text, confirmed boolean)', [JSON.stringify(actionCells)])).rows,
      flags: (await q('select public.can_see_cost() as cost, public.can_see_accounts() as accounts, public.can_see_sales() as sales, public.in_scope_division($1) as broiler, public.in_scope_division($2) as layer', [divisions.broiler, divisions.layer])).rows[0],
    }));
    const label = `${m.role} (${m.scope})`;
    for (const row of seen.can) {
      if (row.allowed !== p.can(m.role, row.action, { costsConfirmed: row.confirmed })) memberMismatch.push(`${label} × ${row.action}${row.confirmed ? ' (كلف مختومة)' : ''}`);
    }
    const scopes = m.scope === 'scoped' ? [{ divisionId: divisions.broiler }] : [];
    const expected = {
      cost: p.canSeeCost(m.role),
      accounts: p.canSeeAccounts(m.role),
      sales: p.canSeeSales(m.role),
      broiler: p.inScope(m.role, scopes, { divisionId: divisions.broiler }),
      layer: p.inScope(m.role, scopes, { divisionId: divisions.layer }),
    };
    for (const [key, want] of Object.entries(expected)) if (seen.flags[key] !== want) memberMismatch.push(`${label} × ${key}: SQL ${seen.flags[key]}`);
  }
  t.eq(members.length, p.ROLES.length * 3, `عضو حقيقي لكل دور بثلاث حالات نطاق (${members.length})`);
  t.ok((await db.admin("select count(*)::int as n from public.member_scopes s join public.members m on m.org_id = s.org_id and m.id = s.member_id where s.org_id = $1 and s.archived_at is not null", [org])).rows[0].n === p.ROLES.length, 'ضابط: صفوف النطاق المؤرشفة موجودة فعلاً');
  t.same(memberMismatch, [], 'can وcan_see_* وin_scope_division بهويّة العضو نفسها بالشاشة');
}
