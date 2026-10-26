// تطابق الخادم والشاشة (FOUNDATION parity-* ٨٥٤، و«جدول الصلاحيات» ٥٢٨): جدول الصلاحيات بـSQL (private.role_can)
// يطابق can() بـsrc/domain/permissions.ts خانةً خانة، وتطبيع الهاتف (private.normalize_phone) يطابق phone.ts.
// الملفات الحقيقية تنحزم بـesbuild (مو نسخة منها)، فأي تغيير بطرف واحد يفشل هنا.
// المرحلة 1 (الخطّة WP1، 0004): الضرب-القسمة-التقريب (_mul_div_round2/0 ↔ money.ts)، التوزيع بأكبر الباقي (alloc_lr ↔
// allocation.ts)، الوحدات والكثافة (to_base وliters_to_kg وkg_to_liters ↔ units.ts)، التطبيع (searchable وnormalize_code
// وwestern_digits ↔ normalize.ts، وphone_key ↔ phoneKey)، وجدول units ↔ UNITS. كلها بلا تسامح، بحالات عشوائية ببذرة ثابتة
// (نفس الحالات كل مرّة، فالفشل ينعاد) ويّا تعادلات مصنوعة، وكل مقارنة بضابط يثبت إنها تقدر تفشل.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHONE_CASES, PHONE_KEY_CASES } from '../../scripts/tests/phone.test.mjs';
import { loadSrc } from '../../scripts/tests/load-src.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export default async function (t, db) {
  await permissionsAndPhone(t, db);
  await roundingParity(t, db);
  await allocationParity(t, db);
  await unitsParity(t, db);
  await normalizeParity(t, db);
  await unitsTable(t, db);
}

async function permissionsAndPhone(t, db) {
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
    await db.acceptInvite(creator.id, m.id, invite.rows[0].id);
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

// ─── أدوات المرحلة 1 (WP1) ───────────────────────────────────────────────────────────────────────────────────────

/** عدد صحيح بوحدة 10⁻ˢ نصّاً عشرياً بنفس شكل numeric::text ببوستغريس بـs مراتب: (−2n، 2) ← «-0.02»، (0n، 2) ← «0.00». */
export function dec(units, scale) {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
}

/** أرقام عشوائية ببذرة ثابتة (mulberry32): نفس الحالات كل تشغيل، فأي فشل ينعاد بالضبط. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return (x ^ (x >>> 14)) >>> 0;
  };
}

/** عدد صحيح غير سالب بمراتب عشوائية لحد digits. */
function digitsUpTo(next, digits) {
  const count = 1 + (next() % digits);
  let text = '';
  for (let i = 0; i < count; i += 1) text += String(next() % 10);
  return BigInt(text);
}

const abs = (x) => (x < 0n ? -x : x);

/** معكوس a بالمقياس m (a وm أوّليان بينهما)، بخوارزمية إقليدس الموسّعة. */
function inverseMod(a, m) {
  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return ((oldS % m) + m) % m;
}
const randomSign = (next) => (next() % 2 === 0 ? 1n : -1n);

/** النتيجة أو «ERR:رمز» لكل أمر، بمعاملة ترجع: الرفض المقصود (raise) ينقارن ويّا رمي المرآة بلا ما يوقف الدفعة. */
async function attemptEach(db, statements) {
  return db.asOwner(async (q) => {
    await q(`create function pg_temp.attempt(p_sql text) returns text language plpgsql as $f$
      declare r text;
      begin
        execute p_sql into r;
        return r;
      exception when others then
        return 'ERR:' || sqlerrm;
      end $f$`);
    const rows = (await q('select x.i, pg_temp.attempt(x.sql) as r from jsonb_to_recordset($1::jsonb) as x(i int, sql text) order by x.i', [
      JSON.stringify(statements.map((sql, i) => ({ i, sql }))),
    ])).rows;
    return rows.map((row) => row.r);
  });
}

/** المختلفات بين قائمتين بنفس الطول، بأوّل عشر للرسالة. */
function mismatches(sqlValues, jsValues, label) {
  const out = [];
  sqlValues.forEach((value, i) => {
    if (value !== jsValues[i]) out.push(`${label(i)}: SQL ${value} JS ${jsValues[i]}`);
  });
  return out;
}

// ─── 1–3: الضرب-القسمة-التقريب (القاعدة 8) ─────────────────────────────────────────────────────────────────────
async function roundingParity(t, db) {
  const m = await loadSrc('src/domain/money.ts');
  // الحالات الأربع المكتوبة بالقاعدة 8، بالطرفين وبالنصّ الحرفي (الكمية بالآلاف والقيمة بالفلس بالمرآة).
  const edges = (await db.admin(`select
    private._mul_div_round2(99999.999, 400000000.01, 200000)::text as a,
    private._mul_div_round0(99999.999, 400000001, 200000)::text as b,
    private._mul_div_round2(1, -0.03, 2)::text as c,
    private._mul_div_round2(500, -120000.00, 3000)::text as d`)).rows[0];
  t.same(
    edges,
    {
      a: dec(m.mulDivRound2(99_999_999n, 40_000_000_001n, 200_000_000n), 2),
      b: dec(m.mulDivRound0(99_999_999n, 40_000_000_100n, 200_000_000n) / 100n, 0),
      c: dec(m.mulDivRound2(1_000n, -3n, 2_000n), 2),
      d: dec(m.mulDivRound2(500_000n, -12_000_000n, 3_000_000n), 2),
    },
    'حالات القاعدة 8 الأربع: SQL = money.ts',
  );
  t.same(edges, { a: '199999998.00', b: '199999998', c: '-0.02', d: '-20000.00' }, 'حالات القاعدة 8 الأربع = النصّ الحرفي بـFOUNDATION');

  // ضابط سالب: round(q*v/l, n) تقريب مرّتين، يطلّع .01 ودينار زايد بنفس الحالتين.
  const naive = (await db.admin('select round(99999.999 * 400000000.01 / 200000, 2)::text as a, round(99999.999 * 400000001 / 200000, 0)::text as b')).rows[0];
  t.same(naive, { a: '199999998.01', b: '199999999' }, 'ضابط: round(q*v/l, n) يطلّع .01 ودينار زايد بالحالتين');
  // وضابط الصيغة الحرفية بالقسمة على 10ⁿ: القسمة نفسها تقرّب لـ16 رقماً معنوياً، فعدد كبير يخسر مراتبه، والضرب بـ10⁻ⁿ ما يخسر.
  const big = (await db.admin(`select
    round(div(2 * 1 * 1234567890123456789012345.67 * 100 + 1, 2) / 100, 2)::text as divided,
    private._mul_div_round2(1, 1234567890123456789012345.67, 1)::text as helper`)).rows[0];
  t.ok(big.divided !== '1234567890123456789012345.67', `ضابط: «÷ 10ⁿ» الحرفية تخسر مراتب عدد كبير (${big.divided})`);
  t.eq(big.helper, dec(m.mulDivRound2(1_000n, 123_456_789_012_345_678_901_234_567n, 1_000n), 2), 'الدالّة بالضرب بـ10⁻ⁿ مضبوطة على عدد كبير');

  // 10,000 ثلاثية ببذرة ثابتة: سحب من دفعة (q ≤ l)، وتعادلات بالفلس وبالدينار مصنوعة، وأرقام كبيرة، وصغيرة ويّا صفر.
  const next = seeded(20261026);
  const cases = [];
  const positive = (digits) => digitsUpTo(next, digits) + 1n;
  for (let i = 0; cases.length < 10_000; i += 1) {
    const kind = i % 10;
    let q;
    let v;
    let l;
    if (kind < 4) {
      q = positive(9);
      l = q + digitsUpTo(next, 9);
      v = randomSign(next) * digitsUpTo(next, 12);
    } else if (kind < 6) {
      // q×v÷l = k×v÷2 بـk وv فرديّين: نصف فلس بالضبط.
      const half = positive(8);
      q = (2n * digitsUpTo(next, 2) + 1n) * half;
      l = 2n * half;
      v = randomSign(next) * (2n * digitsUpTo(next, 10) + 1n);
    } else if (kind === 6) {
      // v دنانير فردية وq÷l = ½: نصف دينار بالضبط لـ_mul_div_round0.
      const half = positive(8);
      q = half;
      l = 2n * half;
      v = randomSign(next) * 100n * (2n * digitsUpTo(next, 8) + 1n);
    } else if (kind === 7) {
      q = positive(15);
      l = positive(15);
      v = randomSign(next) * digitsUpTo(next, 20);
    } else if (kind === 8) {
      // شبه تعادل مثل حالة القاعدة 8: q×v÷l = F + ½ − 1/l فلس، وl = 2×10ᵏ، فالناتج الصحيح F، والقسمة اللي تقرّب
      // لـ16 رقماً معنوياً تقصّ تسعاتها وتطلّعه F + 1. هنا التقريب المزدوج يغلط فعلاً، فالمقارنة تقدر تفشل.
      l = 2n * 10n ** BigInt(10 + (next() % 5));
      const fils = 10n ** 9n + digitsUpTo(next, 12);
      q = 1n;
      v = randomSign(next) * (l * fils + l / 2n - 1n);
    } else {
      q = positive(3);
      l = positive(3);
      v = randomSign(next) * digitsUpTo(next, 3);
    }
    cases.push({ q, v, l });
  }
  const rows = (await db.admin(
    `select private._mul_div_round2(x.q::numeric, x.v::numeric, x.l::numeric)::text as r2,
            private._mul_div_round0(x.q::numeric, x.v::numeric, x.l::numeric)::text as r0,
            round(x.q::numeric * x.v::numeric / x.l::numeric, 2)::text as naive
     from jsonb_to_recordset($1::jsonb) as x(i int, q text, v text, l text) order by x.i`,
    [JSON.stringify(cases.map((c, i) => ({ i, q: dec(c.q, 3), v: dec(c.v, 2), l: dec(c.l, 3) })))],
  )).rows;
  t.eq(rows.length, cases.length, `ثلاثيات عشوائية انفحصت (${cases.length})`);
  const js2 = cases.map((c) => dec(m.mulDivRound2(c.q, c.v, c.l), 2));
  const js0 = cases.map((c) => dec(m.mulDivRound0(c.q, c.v, c.l) / 100n, 0));
  const label = (i) => `(${dec(cases[i].q, 3)}، ${dec(cases[i].v, 2)}، ${dec(cases[i].l, 3)})`;
  const bad2 = mismatches(rows.map((r) => r.r2), js2, label);
  const bad0 = mismatches(rows.map((r) => r.r0), js0, label);
  t.same(bad2.slice(0, 10), [], `_mul_div_round2 = mulDivRound2 بكل الثلاثيات بلا تسامح (${bad2.length} اختلاف)`);
  t.same(bad0.slice(0, 10), [], `_mul_div_round0 = mulDivRound0 بكل الثلاثيات بلا تسامح (${bad0.length} اختلاف)`);
  const ties2 = cases.filter((c) => 2n * (abs(c.q * c.v) % c.l) === c.l).length;
  const ties0 = cases.filter((c) => 2n * (abs(c.q * c.v) % (c.l * 100n)) === c.l * 100n).length;
  const negatives = cases.filter((c) => c.v < 0n).length;
  t.ok(ties2 >= 1_000 && ties0 >= 500 && negatives >= 3_000, `ضابط: بالحالات تعادلات بالفلس (${ties2}) وبالدينار (${ties0}) وقيم سالبة (${negatives})`);
  const naiveBad = mismatches(rows.map((r) => r.naive), js2, label).length;
  t.ok(naiveBad >= 100, `ضابط: نفس المقارنة تمسك التقريب المزدوج round(q*v/l, 2) (${naiveBad} حالة مختلفة)`);

  // خارج المجال: q أو l صفر أو سالب، أو قيمة فارغة ← mul_div_domain (والمرآة ترمي هي هم). والمراجعة العدائية: NaN و±Infinity
  // أعداد numeric صالحة ببوستغريس (النصّ العشري من الشبكة، E3)، وNaN أكبر من كل عدد فيعبر «<= 0»: كلها ترفض.
  const domain = await attemptEach(db, [
    'select private._mul_div_round2(0, 1, 1)::text',
    'select private._mul_div_round2(1, 1, 0)::text',
    'select private._mul_div_round0(-1, 1, 1)::text',
    'select private._mul_div_round2(1, null, 1)::text',
    'select private._mul_div_round(1, 1, 1, -1)::text',
    "select private._mul_div_round2(1, 'NaN', 1)::text",
    "select private._mul_div_round2('Infinity', 1, 1)::text",
    "select private._mul_div_round0(1, 1, 'Infinity')::text",
    "select private._mul_div_round2(1, 1, 'NaN')::text",
    "select private._mul_div_round2(1, '-Infinity', 1)::text",
    "select private._mul_div_round0('NaN', 1, 1)::text",
  ]);
  t.same(domain, Array(11).fill('ERR:mul_div_domain'), 'q أو l مو موجب، أو قيمة أو مراتب غلط، أو قيمة غير محدودة (NaN، ±Infinity) ← mul_div_domain');
  t.throws(() => m.mulDivRound2(0n, 1n, 1n), 'والمرآة ترفض q صفر', /q_not_positive/);
}

// ─── 4: التوزيع بأكبر الباقي (القاعدة 11) ─────────────────────────────────────────────────────────────────────────
async function allocationParity(t, db) {
  const { allocateLargestRemainder } = await loadSrc('src/domain/allocation.ts');
  // D2: نقل 65,000 بالوزن على ذرة 5,000 كغم وصويا 1,000 كغم بالفلس ← 54,166.67 و10,833.33 (الفلس الباقي للذرة).
  const freight = (await db.admin("select private.alloc_lr(65000.00, '{5000.000,1000.000}'::numeric[], 2)::text[] as s")).rows[0].s;
  t.same(freight, ['54166.67', '10833.33'], 'D2: حصّتا النقل 54,166.67 و10,833.33');
  t.same(freight, allocateLargestRemainder(6_500_000n, [5_000_000n, 1_000_000n]).map((s) => dec(s, 2)), 'D2 نفسه بالمرآة (5,416,667 و1,083,333 فلس)');

  // 3,000 حالة ببذرة ثابتة: ثلثها أوزان متساوية (بواقي متعادلة، فالترتيب بالسطر يبين)، وأوزان صفر، ومبالغ سالبة وصفر
  // وكبيرة، بالفلس وبالدينار.
  const next = seeded(4_200_065);
  const cases = [];
  for (let i = 0; i < 3_000; i += 1) {
    const n = 1 + (next() % 8);
    const equal = digitsUpTo(next, 7) + 1n;
    const weights = Array.from({ length: n }, () => (i % 3 === 0 ? equal : next() % 5 === 0 ? 0n : digitsUpTo(next, 9)));
    if (weights.every((w) => w === 0n)) weights[next() % n] = digitsUpTo(next, 6) + 1n;
    const scale = next() % 2 === 0 ? 2 : 0;
    const total = randomSign(next) * digitsUpTo(next, i % 50 === 0 ? 25 : 10);
    cases.push({ total, weights, scale });
  }
  const rows = (await db.admin(
    `select private.alloc_lr(x.total::numeric, x.weights::numeric[], x.scale)::text[] as shares
     from jsonb_to_recordset($1::jsonb) as x(i int, total text, weights text, scale int) order by x.i`,
    [JSON.stringify(cases.map((c, i) => ({ i, total: dec(c.total, c.scale), weights: `{${c.weights.map((w) => dec(w, 3)).join(',')}}`, scale: c.scale })))],
  )).rows;
  t.eq(rows.length, cases.length, `حالات توزيع انفحصت (${cases.length})`);
  const js = cases.map((c) => JSON.stringify(allocateLargestRemainder(c.total, c.weights).map((s) => dec(s, c.scale))));
  const bad = mismatches(rows.map((r) => JSON.stringify(r.shares)), js, (i) => `${dec(cases[i].total, cases[i].scale)} على ${cases[i].weights.join('/')}`);
  t.same(bad.slice(0, 10), [], `alloc_lr = allocateLargestRemainder بكل الحالات (${bad.length} اختلاف)`);
  const unbalanced = rows.filter((r, i) => r.shares.reduce((sum, s) => sum + BigInt(s.replace('.', '')), 0n) !== cases[i].total);
  t.eq(unbalanced.length, 0, 'مجموع الحصص = المبلغ بالضبط بكل حالة');
  // ضابط: الحالات بيها وحدات باقية تنوزّع على بواقي متعادلة، فترتيب السطر يفرق فعلاً.
  const tiedLeftovers = cases.filter((c) => {
    const sum = c.weights.reduce((a, b) => a + b, 0n);
    const rems = c.weights.map((w) => (abs(c.total) * w) % sum).filter((r) => r > 0n);
    return new Set(rems.map(String)).size < rems.length;
  }).length;
  const negativeTotals = cases.filter((c) => c.total < 0n).length;
  t.ok(tiedLeftovers >= 300 && negativeTotals >= 1_000, `ضابط: بواقٍ متعادلة (${tiedLeftovers}) ومبالغ سالبة (${negativeTotals})`);

  // الرفض بنفس ترتيب المرآة: الوزن السالب قبل مجموع الصفر، وبلا أوزان = مجموع صفر؛ والمبلغ بمراتب أكثر من وحدته يرفض.
  const errors = await attemptEach(db, [
    "select private.alloc_lr(5, '{0,0}'::numeric[], 0)::text",
    "select private.alloc_lr(5, '{}'::numeric[], 0)::text",
    "select private.alloc_lr(5, '{1,-1}'::numeric[], 0)::text",
    "select private.alloc_lr(5, '{-1,0}'::numeric[], 0)::text",
    "select private.alloc_lr(5, '{1,NULL}'::numeric[], 0)::text",
    "select private.alloc_lr(0.005, '{1,1}'::numeric[], 2)::text",
    "select private.alloc_lr(null, '{1,1}'::numeric[], 2)::text",
    "select private.alloc_lr(5, '{1,1}'::numeric[], -1)::text",
    // مراتب سالبة بمبلغ يقبل القسمة (10 × 10⁻¹ = 1 صحيح): الرفض من فحص المراتب نفسه، مو من «المبلغ فيه كسر» (طفرة الاختبار).
    "select private.alloc_lr(10, '{1,1}'::numeric[], -1)::text",
    // غير المحدود: مبلغ NaN أو Infinity، ووزن NaN أو ±Infinity (كان {1,Infinity} يطلّع {0.01,NaN} ومجموعه مو المبلغ).
    "select private.alloc_lr('Infinity', '{1,1}'::numeric[], 2)::text",
    "select private.alloc_lr('NaN', '{1,1}'::numeric[], 2)::text",
    "select private.alloc_lr(10, '{1,Infinity}'::numeric[], 2)::text",
    "select private.alloc_lr(10, '{1,NaN}'::numeric[], 2)::text",
    "select private.alloc_lr(10, '{1,-Infinity}'::numeric[], 2)::text",
  ]);
  t.same(
    errors,
    ['ERR:zero_weights', 'ERR:zero_weights', 'ERR:negative_weight', 'ERR:negative_weight', 'ERR:negative_weight', 'ERR:alloc_scale', 'ERR:alloc_scale', 'ERR:alloc_scale', 'ERR:alloc_scale', 'ERR:alloc_scale', 'ERR:alloc_scale', 'ERR:negative_weight', 'ERR:negative_weight', 'ERR:negative_weight'],
    'رفض alloc_lr برموزه (وغير المحدود)',
  );
  t.throws(() => allocateLargestRemainder(5n, [0n, 0n]), 'المرآة: مجموع صفر', /zero_weights/);
  t.throws(() => allocateLargestRemainder(5n, []), 'المرآة: بلا أوزان = مجموع صفر', /zero_weights/);
  t.throws(() => allocateLargestRemainder(5n, [-1n, 0n]), 'المرآة: الوزن السالب قبل مجموع الصفر', /negative_weight/);
}

// ─── 5–6: الوحدات والكثافة (القاعدتان 1 و4) ──────────────────────────────────────────────────────────────────────
async function unitsParity(t, db) {
  const u = await loadSrc('src/domain/units.ts');
  const BASES = ['kg', 'L', 'pc'];
  // 3,000 تحويل ببذرة ثابتة: خمسها نصف غرام بالضبط (q فردي × معامل = فردي × 0.5 × 10^…)، ونصف القطع أعداد صحيحة.
  const next = seeded(9_950);
  const cases = [];
  for (let i = 0; i < 3_000; i += 1) {
    const base = BASES[i % 3];
    let q;
    let factor;
    if (base === 'pc' && i % 2 === 0) {
      q = 1_000n * digitsUpTo(next, 6);
      factor = { units: digitsUpTo(next, 4) + 1n, scale: 0 };
    } else if (i % 5 === 0) {
      const scale = 1 + (next() % 6);
      factor = { units: (2n * digitsUpTo(next, 3) + 1n) * 5n * 10n ** BigInt(scale - 1), scale };
      q = 2n * digitsUpTo(next, 7) + 1n;
    } else {
      factor = { units: digitsUpTo(next, 8) + 1n, scale: next() % 7 };
      q = (next() % 6 === 0 ? -1n : 1n) * digitsUpTo(next, 10);
    }
    cases.push({ q, factor, base });
  }
  const sql = await attemptEach(
    db,
    cases.map((c) => `select private.to_base(${dec(c.q, 3)}, ${dec(c.factor.units, c.factor.scale)}, '${c.base}')::text`),
  );
  const js = cases.map((c) => {
    const result = u.toBase(c.q, c.factor, c.base);
    return result.ok ? dec(result.qty, 3) : `ERR:${result.reason}`;
  });
  const bad = mismatches(sql, js, (i) => `${dec(cases[i].q, 3)} × ${dec(cases[i].factor.units, cases[i].factor.scale)} ${cases[i].base}`);
  t.same(bad.slice(0, 10), [], `to_base = toBase بكل الحالات (${bad.length} اختلاف من ${cases.length})`);
  const halfGrams = cases.filter((c) => 2n * (abs(c.q * c.factor.units) % 10n ** BigInt(c.factor.scale)) === 10n ** BigInt(c.factor.scale)).length;
  const refused = sql.filter((r) => r === 'ERR:pieces_not_whole').length;
  const wholePieces = sql.filter((r, i) => cases[i].base === 'pc' && !r.startsWith('ERR:')).length;
  t.ok(halfGrams >= 400 && refused >= 100 && wholePieces >= 400, `ضابط: نصف غرام بالضبط (${halfGrams})، وقطع ترفض (${refused}) وتنقبل (${wholePieces})`);
  t.same(
    await attemptEach(db, [
      "select private.to_base(1, 0, 'kg')::text",
      "select private.to_base(1, 1, 'kgs')::text",
      "select private.to_base(null, 1, 'kg')::text",
      "select private.to_base(1.5, 1, 'pc')::text",
      "select private.to_base(1, 'NaN', 'pc')::text",
      "select private.to_base(1, 'Infinity', 'kg')::text",
      "select private.to_base('Infinity', 1, 'kg')::text",
      "select private.to_base('NaN', 1, 'pc')::text",
      'select private.to_base(1, 1, null)::text',
    ]),
    ['ERR:factor_not_positive', 'ERR:unit_domain', 'ERR:unit_domain', 'ERR:pieces_not_whole', 'ERR:factor_not_positive', 'ERR:factor_not_positive', 'ERR:unit_domain', 'ERR:unit_domain', 'ERR:unit_domain'],
    'رفض to_base برموزه (معامل صفر، وحدة أساس مجهولة أو فارغة، كمية فارغة، قطعة ونص، ومعامل أو كمية غير محدودة)',
  );

  // الكثافة بالاتجاهين: 250 لتر × 0.92 = 230.000 كغم، ورجوعاً 250.000 لتر؛ و2,000 حالة ويّا تعادلات بالاتجاهين.
  const oil = (await db.admin('select private.liters_to_kg(250, 0.92)::text as kg, private.kg_to_liters(230, 0.92)::text as l')).rows[0];
  t.same(oil, { kg: '230.000', l: '250.000' }, 'زيت O1: 250 لتر × 0.92 = 230.000 كغم، و230 كغم ÷ 0.92 = 250.000 لتر');
  t.same(oil, { kg: dec(u.litersToKg(250_000n, 9_200n), 3), l: dec(u.kgToLiters(230_000n, 9_200n), 3) }, 'زيت O1 نفسه بالمرآة');
  const dnext = seeded(230);
  const dense = [];
  for (let i = 0; i < 2_000; i += 1) {
    let density = digitsUpTo(dnext, 5) + 1n;
    let liters = randomSign(dnext) * digitsUpTo(dnext, 10);
    let kg = randomSign(dnext) * digitsUpTo(dnext, 10);
    if (i % 4 === 0) {
      density = 5_000n; // لتر فردي بالآلاف × 0.5 = نصف غرام
      liters = 2n * digitsUpTo(dnext, 8) + 1n;
    } else if (i % 4 === 1) {
      density = 20_000n; // كيلو فردي بالآلاف ÷ 2 = نصف مللتر
      kg = 2n * digitsUpTo(dnext, 8) + 1n;
    }
    dense.push({ density, liters, kg });
  }
  const drows = (await db.admin(
    `select private.liters_to_kg(x.liters::numeric, x.d::numeric)::text as kg, private.kg_to_liters(x.kg::numeric, x.d::numeric)::text as liters
     from jsonb_to_recordset($1::jsonb) as x(i int, liters text, kg text, d text) order by x.i`,
    [JSON.stringify(dense.map((c, i) => ({ i, liters: dec(c.liters, 3), kg: dec(c.kg, 3), d: dec(c.density, 4) })))],
  )).rows;
  const dlabel = (i) => `كثافة ${dec(dense[i].density, 4)}`;
  const toKg = mismatches(drows.map((r) => r.kg), dense.map((c) => dec(u.litersToKg(c.liters, c.density), 3)), dlabel);
  const toL = mismatches(drows.map((r) => r.liters), dense.map((c) => dec(u.kgToLiters(c.kg, c.density), 3)), dlabel);
  t.same([...toKg, ...toL].slice(0, 10), [], `liters_to_kg وkg_to_liters = litersToKg وkgToLiters (${dense.length} حالة، ${toKg.length + toL.length} اختلاف)`);
  // شبه تعادل للكيلو ← لتر: الكثافة 2D′ (D′ فردي ما يقبل 5)، والكيلو بحيث اللتر بالآلاف = N + ½ − 1/(2D′) بالضبط، فالصحيح N،
  // والقسمة اللي تقرّب لحالها (round(kg / density, 3)) تطلّع N + 1 لمّا الناتج كبير. هيج المقارنة تقدر تمسك القسمة الحرفية.
  const near = [];
  for (let i = 0; i < 200; i += 1) {
    let odd = 2n * digitsUpTo(dnext, 4) + 1n;
    if (odd % 5n === 0n) odd += 2n;
    const inverse = inverseMod(odd, 10_000n);
    const liters = (inverse - 1n) / 2n + 5_000n * (10n ** 12n + digitsUpTo(dnext, 6));
    near.push({ density: 2n * odd, kg: ((2n * liters + 1n) * odd - 1n) / 10_000n, liters });
  }
  const nrows = (await db.admin(
    `select private.kg_to_liters(x.kg::numeric, x.d::numeric)::text as liters, round(x.kg::numeric / x.d::numeric, 3)::text as naive
     from jsonb_to_recordset($1::jsonb) as x(i int, kg text, d text) order by x.i`,
    [JSON.stringify(near.map((c, i) => ({ i, kg: dec(c.kg, 3), d: dec(c.density, 4) })))],
  )).rows;
  t.same(
    mismatches(nrows.map((r) => r.liters), near.map((c) => dec(u.kgToLiters(c.kg, c.density), 3)), (i) => `كثافة ${dec(near[i].density, 4)}`).slice(0, 10),
    [],
    `kg_to_liters = kgToLiters بشبه التعادل (${near.length} حالة)`,
  );
  t.ok(near.every((c) => u.kgToLiters(c.kg, c.density) === c.liters), 'ضابط: شبه التعادل مصنوع صحّ (المرآة تطلّع N)');
  const naiveLiters = nrows.filter((r, i) => r.naive !== dec(near[i].liters, 3)).length;
  t.ok(naiveLiters >= 100, `ضابط: round(kg / density, 3) يغلط بشبه التعادل (${naiveLiters} من ${near.length})`);
  t.same(
    await attemptEach(db, [
      'select private.liters_to_kg(1, 0)::text',
      'select private.kg_to_liters(1, -0.5)::text',
      'select private.kg_to_liters(null, 0.92)::text',
      "select private.liters_to_kg(1, 'NaN')::text",
      "select private.kg_to_liters(1, 'Infinity')::text",
      "select private.liters_to_kg('Infinity', 1)::text",
      "select private.kg_to_liters('NaN', 1)::text",
      // كثافة صفر للكيلو ← لتر: رفضها برمزها هي، مو mul_div_domain من المساعد تحتها (طفرة الاختبار).
      'select private.kg_to_liters(1, 0)::text',
      'select private.liters_to_kg(1, -0.5)::text',
    ]),
    ['ERR:density_not_positive', 'ERR:density_not_positive', 'ERR:unit_domain', 'ERR:density_not_positive', 'ERR:density_not_positive', 'ERR:unit_domain', 'ERR:unit_domain', 'ERR:density_not_positive', 'ERR:density_not_positive'],
    'رفض الكثافة برموزه (وغير المحدود)',
  );
}

// ─── 7 و7a: التطبيع (FOUNDATION ٧٥٨، ٨٠٤؛ E34) ───────────────────────────────────────────────────────────────────
async function normalizeParity(t, db) {
  const n = await loadSrc('src/domain/normalize.ts');
  const phone = await loadSrc('src/domain/phone.ts');
  const one = async (sql, params) => (await db.admin(sql, params)).rows[0];

  // «٧٧٠٩٩» (FOUNDATION ٨٠٤): الأرقام تترجم قبل مسح التشكيل، فتبقى.
  const invoice = 'فاتورة ٧٧٠٩٩';
  t.same(await one('select private.searchable($1) as s', [invoice]), { s: n.searchable(invoice) }, '«فاتورة ٧٧٠٩٩» نفسه بالطرفين');
  t.eq(n.searchable(invoice), 'فاتوره 77099', '«٧٧٠٩٩» يبقى 77099');

  // مسح BMP كامل (عدا الصفر والبدائل): الحرف وحده، وبين لاتيني وفراغ وعربي ورقم شرقي.
  const sweep = [];
  for (let code = 1; code <= 0xffff; code += 1) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    const ch = String.fromCharCode(code);
    sweep.push(ch, `Ab ${ch}\u{629}\u{623}\u{663} `);
  }
  const rows = (await db.admin(
    `select private.searchable(x.s) as s, private.normalize_code(x.s) as c, private.western_digits(x.s) as w
     from unnest($1::text[]) with ordinality as x(s, i) order by x.i`,
    [sweep],
  )).rows;
  t.eq(rows.length, sweep.length, `مسح BMP كامل للتطبيع (${sweep.length} مدخل)`);
  const at = (i) => `U+${sweep[i].codePointAt(i % 2 === 0 ? 0 : 3).toString(16).toUpperCase().padStart(4, '0')}`;
  const badSearch = mismatches(rows.map((r) => r.s), sweep.map((s) => n.searchable(s)), at);
  const badCode = mismatches(rows.map((r) => r.c), sweep.map((s) => n.normalizeCode(s)), at);
  const badDigits = mismatches(rows.map((r) => r.w), sweep.map((s) => n.toWesternDigits(s)), at);
  t.same(badSearch.slice(0, 10), [], `searchable نفسه بالطرفين بكل حرف (${badSearch.length} اختلاف)`);
  t.same(badCode.slice(0, 10), [], `normalize_code = normalizeCode بكل حرف (${badCode.length} اختلاف)`);
  t.same(badDigits.slice(0, 10), [], `western_digits = toWesternDigits بكل حرف (${badDigits.length} اختلاف)`);
  // ضابط: المسح بيه حروف يغيّرها كل تطبيع (تشكيل، همزات، A–Z، فراغات، أرقام شرقية)، مو بس حروف تمرّ كما هي.
  const singles = sweep.filter((_, i) => i % 2 === 0);
  const changed = (fn) => singles.filter((ch) => fn(ch) !== ch).length;
  t.ok(changed(n.searchable) >= 80 && changed(n.normalizeCode) >= 50 && changed(n.toWesternDigits) === 22, `ضابط: حروف تتغيّر بالمسح (البحث ${changed(n.searchable)}، الرمز ${changed(n.normalizeCode)}، الأرقام ${changed(n.toWesternDigits)})`);
  // لغة القاعدة ما تأثّر (DECISIONS ٤٣، الإنتاج ICU والحزمة C): نفس المسح بلغة ICU مثل الإنتاج وبالتركية، ونفس النتائج حرفياً.
  for (const collation of ['en-US-x-icu', 'tr-TR-x-icu']) {
    const icu = (await db.admin(
      `select private.searchable(x.s collate "${collation}") as s, private.normalize_code(x.s collate "${collation}") as c
       from unnest($1::text[]) with ordinality as x(s, i) order by x.i`,
      [sweep],
    )).rows;
    t.eq(icu.filter((r, i) => r.s !== rows[i].s || r.c !== rows[i].c).length, 0, `التطبيع بلغة ${collation} نفسه بلغة الحزمة C (${icu.length} مدخل)`);
  }
  // ضابط: اللغة توصل للتعابير فعلاً، فمرآة بـlower() كانت تطلع غير بالإنتاج (والتركية تصغّر I لـı).
  const localeBound = (await db.admin(`select count(*)::int as n from unnest($1::text[]) as x(s) where lower(x.s collate "tr-TR-x-icu") collate "C" <> lower(x.s collate "C")`, [singles])).rows[0].n;
  t.ok(localeBound > 1_000, `ضابط: lower() يختلف بين ICU وC على ${localeBound} حرف`);

  // phone_key (E34): حالات الهاتف كلها وحالات المفتاح بقيمها، ثم مسح BMP حول رقم موبايل وأرضي.
  const keyed = [...PHONE_CASES.map(([input]) => input), ...PHONE_KEY_CASES.map(([input]) => input)];
  const keys = (await db.admin('select private.phone_key(x.s) as k from unnest($1::text[]) with ordinality as x(s, i) order by x.i', [keyed])).rows.map((r) => r.k);
  t.same(mismatches(keys, keyed.map((s) => phone.phoneKey(s)), (i) => `«${keyed[i]}»`), [], `phone_key = phoneKey بحالات الهاتف (${keyed.length})`);
  t.same(keys.slice(PHONE_CASES.length), PHONE_KEY_CASES.map(([, expected]) => expected), 'phone_key = القيم المكتوبة (أرضي، أجنبي، شرقي، بلا رقم)');
  const around = [];
  for (let code = 1; code <= 0xffff; code += 1) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    const ch = String.fromCharCode(code);
    around.push(`${ch}07701234567`, `0770${ch}1234567`, `01${ch}7181234`);
  }
  const swept = (await db.admin('select private.phone_key(x.s) as k from unnest($1::text[]) with ordinality as x(s, i) order by x.i', [around])).rows.map((r) => r.k);
  t.eq(swept.length, around.length, `مسح BMP حول الرقم (${around.length} مدخل)`);
  const badKeys = mismatches(swept, around.map((s) => phone.phoneKey(s)), (i) => `U+${around[i].codePointAt([0, 4, 2][i % 3]).toString(16).toUpperCase().padStart(4, '0')}`);
  t.same(badKeys.slice(0, 10), [], `phone_key = phoneKey بكل حرف (${badKeys.length} اختلاف)`);
  const sweptIcu = (await db.admin('select private.phone_key(x.s collate "en-US-x-icu") as k from unnest($1::text[]) with ordinality as x(s, i) order by x.i', [around])).rows.map((r) => r.k);
  t.eq(sweptIcu.filter((k, i) => k !== swept[i]).length, 0, 'phone_key بلغة ICU مثل الإنتاج نفسه بلغة الحزمة C');
  const fallback = swept.filter((k) => k !== null && !k.startsWith('964')).length;
  t.ok(swept.filter((k) => k === '9647701234567').length > 10 && fallback > 60_000, `ضابط: المسح بيه موبايل موحّد ومفاتيح أرقام بس (${fallback})`);
}

// ─── 8: جدول units = UNITS، ويُقرأ ولا يتعدّل ─────────────────────────────────────────────────────────────────────
async function unitsTable(t, db) {
  const u = await loadSrc('src/domain/units.ts');
  const rows = (await db.admin('select code, dimension, base, (factor * 1000)::bigint::text as factor from public.units order by code collate "C"')).rows;
  const expected = Object.entries(u.UNITS)
    .map(([code, x]) => ({ code, dimension: x.dimension, base: x.base, factor: x.factor.toString() }))
    .sort((a, b) => (a.code < b.code ? -1 : 1));
  t.same(rows, expected, `جدول units = UNITS بـunits.ts (${rows.length} وحدة، المعامل بالآلاف)`);

  // يُقرأ لكل داخل (عام بلا org_id)، وanon ولا شي، والكتابة ممنوعة على الكل: الواجهة بلا منح، وservice_role منسحب منه،
  // وصاحب الجدول نفسه يصدّه reject_change.
  const reader = 'd1000000-0000-4000-8000-000000000001';
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [reader, '9647703100001']);
  t.eq((await db.asUser(reader, (q) => q('select count(*)::int as n from public.units'))).rows[0].n, 6, 'داخل بلا منشأة يقرأ الوحدات الست');
  await t.rejects(db.asAnon((q) => q('select 1 from public.units')), 'anon ما يقرأ units', /permission denied/);
  for (const [label, sql] of [
    ['إدخال', "insert into public.units (code, dimension, base, factor) values ('lb', 'mass', 'kg', 0.454)"],
    ['تعديل', "update public.units set factor = 2 where code = 'kg'"],
    ['حذف', "delete from public.units where code = 'g'"],
  ]) {
    await t.rejects(db.asUser(reader, (q) => q(sql)), `authenticated: ${label} units ممنوع`, /permission denied/);
    await t.rejects(db.asService((q) => q(sql)), `service_role: ${label} units ممنوع`, /permission denied/);
  }
  t.eq((await db.asService((q) => q('select count(*)::int as n from public.units'))).rows[0].n, 6, 'ضابط: service_role يقرأ units');
  // قالب العمود (§2.7): NaN وInfinity يعبرون «factor > 0 and factor = round(factor, 3)»، فالقيد يرفضهم بـabs(x) < 'Infinity'.
  for (const bad of ['NaN', 'Infinity']) {
    await t.rejects(
      db.asOwner((q) => q(`insert into public.units (code, dimension, base, factor) values ('x${bad}', 'mass', 'kg', '${bad}')`)),
      `units_factor_check يرفض معاملاً ${bad}`,
      /units_factor_check/,
    );
  }
  // القيود بقيمها (طفرات الاختبار): معامل صفر أو سالب أو بمراتب أكثر من 3، وأساس لا يناسب نوع الوحدة، وأساس مجهول، كل
  // واحد يرفضه قيده هو باسمه (الشاشة تاخذ جملتها من constraint.<اسم القيد>).
  for (const [label, row, constraint] of [
    ['معامل صفر', "('x0', 'mass', 'kg', 0)", 'units_factor_check'],
    ['معامل سالب', "('x1', 'mass', 'kg', -1)", 'units_factor_check'],
    ['معامل بأربع مراتب', "('x2', 'mass', 'kg', 0.0005)", 'units_factor_check'],
    ['كتلة باللتر', "('x3', 'mass', 'L', 1)", 'units_base_dimension_check'],
    ['حجم بالقطعة', "('x4', 'volume', 'pc', 1)", 'units_base_dimension_check'],
    ['عدد بالكيلو', "('x5', 'count', 'kg', 1)", 'units_base_dimension_check'],
    ['أساس مجهول', "('x6', 'mass', 'm', 1)", 'units_base_check'],
  ]) {
    await t.rejects(db.asOwner((q) => q(`insert into public.units (code, dimension, base, factor) values ${row}`)), `units: ${label} يرفضه ${constraint}`, new RegExp(`"${constraint}"`));
  }
  await db.asOwner((q) => q("insert into public.units (code, dimension, base, factor) values ('probe', 'mass', 'kg', 0.5)"));
  t.ok(true, 'ضابط: صاحب الجدول يدخل معاملاً محدوداً (بمعاملة ترجع)، فالرفض فوك من القيد');
  await t.rejects(db.asOwner((q) => q("update public.units set factor = 2 where code = 'kg'")), 'صاحب الجدول: التعديل يرفض', /append_only/);
  await t.rejects(db.asOwner((q) => q("delete from public.units where code = 'g'")), 'صاحب الجدول: الحذف يرفض', /append_only/);
  await t.rejects(db.asOwner((q) => q('truncate public.units')), 'صاحب الجدول: المسح يرفض', /append_only/);

  // إعادة 0004 تعبر على الجدول السليم، وترفض إذا الجدول صار غير الست (on conflict do nothing ما يصلّحه بصمت).
  const migration = readFileSync(path.join(DIR, '..', 'migrations', '0004_math_units.sql'), 'utf8');
  await db.asOwner((q) => q(migration));
  t.ok(true, 'إعادة 0004 على الجدول السليم تعبر');
  await t.rejects(
    db.asOwner(async (q) => {
      await q('alter table public.units disable trigger units_append_only');
      await q("update public.units set factor = 2 where code = 'kg'");
      await q(migration);
    }),
    'إعادة 0004 على جدول وحدات مختلف ترفض',
    /units_seed_mismatch/,
  );
  await t.rejects(
    db.asOwner(async (q) => {
      await q("insert into public.units (code, dimension, base, factor) values ('lb', 'mass', 'kg', 0.454)");
      await q(migration);
    }),
    'إعادة 0004 ويّا وحدة سابعة ترفض (الست بالضبط، مو «الست موجودة»)',
    /units_seed_mismatch/,
  );

  // مساعدات 0004 كلها immutable (الخطّة WP1): فهارس البحث والتوائم بالحزم الجاية (searchable، phone_key) ما تنبني إلا بيها،
  // وصورة الكتالوج تقارن الهجرة بنفسها بس، فـvolatile بالغلط كان يعبر (طفرة الاختبار).
  const helpers = ['_mul_div_round', '_mul_div_round0', '_mul_div_round2', 'alloc_lr', 'kg_to_liters', 'liters_to_kg', 'normalize_code', 'phone_key', 'searchable', 'to_base', 'western_digits'];
  const marked = (await db.admin('select proname, provolatile from pg_proc where pronamespace = \'private\'::regnamespace and proname = any($1) order by proname collate "C"', [helpers])).rows;
  t.same(marked.map((r) => `${r.proname}:${r.provolatile}`), helpers.map((name) => `${name}:i`), `مساعدات 0004 كلها immutable (${helpers.length})`);
}
