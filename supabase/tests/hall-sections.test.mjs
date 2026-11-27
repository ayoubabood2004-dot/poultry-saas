// «القاعة بأقسام» (0038، العقد docs/plans/0038/contract-0038.md «الجزء D»؛ DECISIONS 2026-11-26): halls.sections (1 إلى 4) وflocks.section_counts (عدد كلّ
// قسم) وdead_parts في الزيارات وصفوف الأيّام؛ والكتّاب: open_flock وedit_flock بأعداد الأقسام، وset_flock_dead وsave_flock_day بهلاكات الأقسام، والكاتب الجديد
// set_hall_sections، وقاعدة flock_day_rebuild الواحدة (sections_required)، وحدّ كلّ قسم (flock_parts_check)، وreopen_flock بـsections_changed ومرآته
// reopen_block؛ والقرّاء (flock_day_json وflock_summary وflocks_overview وhall_sheet بمفاتيح جديدة فقط، وhall_sheet بخطّة عامّة لكلّ جلسة بالجواب نفسه)؛
// والثابت verify_hall_sections، وثابتا الورقة والكاز يقرآن الورقة مرّة (verify_hall_sheet يفحص مفاتيح الكاز، وverify_kerosene ورقة الوجبة بكازها)؛ وملفّ التراجع.
// منشأة هذا الملفّ: المعرّفات d3838000 والهواتف 96477038380 (والمنشأة الثانية بالبادئتين نفسيهما من الرقم 41).
// البذرة (اليوم المثبَّت 2026-11-27): حقل لحم بقاعات — «قاعة 1» مقسومة قسمين عند إنشائها (27,051 طيراً قبل 20 يوماً بالتساوي: عيّنة الورقة)، و«قاعة 2»
// قسمين بأعداد مرسلة (5,000 + 3,000، لتعديل الوجبة)، و«قاعة 3» ثلاثة أقسام (1,000 = 334 + 333 + 333، لحدّ القسم)، و«قاعة 4» غير مقسومة (500)،
// و«قاعة 5» بلا وجبة (أقسام القاعة)، و«قاعة 6» غير مقسومة بأيّام بلا هلاكات (تُقسم بعدها)، و«قاعة 7» غير مقسومة بهلاكات (لا تُقسم)، و«قاعة 8» قسمين
// (السباق)، و«قاعة 9» قسمين تُغلق وجبتها ثمّ تتغيّر أقسامها (إعادة الفتح)، و«قاعة 10» قسمين (تصحيح الورقة)، و«قاعة 12» و«قاعة 13» غير مقسومتين (ترتيب
// الأقفال وضابطه). والطفرات داخل معاملة صاحب الجداول ترجع: كلّ قاعدة مكسورة يمسكها فحصها، وكلّ فحص في الثابت يمسكه جسم مكسور يكتب خرقه بنفسه (لا صفّ
// مكتوب باليد)؛ وضابط ترتيب الأقفال وحده جسم مكسور يثبت لجلستين حقيقيتين ثمّ يرجع تعريفه كما كان (كـsetToday).
// وعيّنات القاعدة الحقيقية للشاشات: HALL_SECTIONS_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/hall-sections-0038.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { race } from './shared.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sections-0038.json');
const MIGRATION_FILES = readdirSync(MIGRATIONS).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort();
const TODAY = '2026-11-27';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `d3838000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477038380${String(n).padStart(2, '0')}`;

const DEAD = 'select public.set_flock_dead($1, $2, $3, $4, $5, $6) as v';
const DEAD_OLD = 'select public.set_flock_dead($1, $2, $3, $4, $5) as v';
const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) as v';
const VISIT = 'select public.save_flock_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const OPEN = 'select public.open_flock($1, $2, $3, 0, null, $4, $5) as v';
const OPEN_OLD = 'select public.open_flock($1, $2, $3, 0, null, $4) as v';
const EDIT = 'select public.edit_flock($1, (select version from public.flocks where id = $1), $2, $3, 0, null, $4, $5) as v';
const EDIT_V = 'select public.edit_flock($1, $2, $3, $4, 0, null, $5, $6) as v';
const SECTIONS = 'select public.set_hall_sections($1, $2, $3, $4) as v';
const SECTIONS_NOW = 'select public.set_hall_sections($1, $2, (select version from public.halls where id = $1), $3) as v';
const SHEET = 'select public.hall_sheet($1) as v';
const OVERVIEW = 'select public.flocks_overview() as v';
const DETAIL = 'select public.flock_detail($1) as v';
const SALES = 'select public.flock_sales($1) as v';
const CLOSE_FORM = "select public.flock_close_form($1) ->> 'plan' as v";
const CLOSE = "select public.close_flock($1, $2, $3, $4, $5, 0, '[]'::jsonb, 'بيعت', '[]'::jsonb, null, $6) as v";
const REOPEN = "select public.reopen_flock($1, 'أُغلقت خطأً', $2) as v";
const SIG = {
  dead: 'public.set_flock_dead(uuid, date, integer, uuid, boolean, integer[])',
  day: 'public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean, integer[])',
  open: 'public.open_flock(uuid, date, integer, integer, text, uuid, integer[])',
  edit: 'public.edit_flock(uuid, integer, date, integer, integer, text, uuid, integer[])',
  sections: 'public.set_hall_sections(uuid, integer, integer, uuid)',
  rebuild: 'private.flock_day_rebuild(public.flocks, date)',
  summary: 'private.flock_summary(public.flocks)',
  sheet: 'public.hall_sheet(uuid)',
  reopen: 'public.reopen_flock(uuid, text, uuid)',
  block: 'private.reopen_block(public.flock_closes)',
};
const VERIFY_ZERO = { hall_sections_range: 0, flock_counts_shape: 0, visit_parts: 0, day_parts: 0, unsplit_parts: 0, section_live: 0, sheet_sections: 0 };

const deadParams = (o) => [o.flock, o.on === undefined ? TODAY : o.on, o.n ?? null, o.ref ?? uid(), o.queued ?? false, o.parts ?? null];
const dayParams = (o) => [o.flock, o.on === undefined ? TODAY : o.on, o.dead ?? null, o.culled ?? null, null, null, null, null, null, null, null, o.note ?? null,
  o.base ?? null, o.ref ?? uid(), o.queued ?? false, o.parts ?? null];
const visitParams = (o) => [o.id ?? uid(), o.flock, o.on === undefined ? TODAY : o.on, o.at ?? new Date().toISOString(), o.dead ?? null, o.culled ?? null,
  o.feed ?? null, null, null, null, o.note ?? null, o.base ?? null, o.void ?? false, o.ref ?? uid(), o.queued ?? false];

const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);
const pick = (o, ...keys) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));

// أجزاء الأجسام الحقيقية التي تكسرها الطفرات (كلّ مرساة مرّة واحدة بالضبط في تعريفها، purchase-kit).
const ANCHOR = {
  deadInput: '  perform private.flock_parts_input(f, p_dead, p_parts);\n',
  deadPartsCheck: '  -- 0038: وهلاكات كلّ قسم في الأيّام كلّها لا تزيد على عدده.\n  perform private.flock_parts_check(f);\n',
  deadSameParts: "    if d.dead_parts is distinct from p_parts then\n      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'dead_recorded', 'day', private.flock_day_json(d)));\n    end if;\n",
  deadHash: "    || case when p_parts is not null then jsonb_build_object('parts', p_parts) else '{}'::jsonb end);",
  deadParked: "      jsonb_build_object('dead', p_dead) || case when p_parts is not null then jsonb_build_object('parts', p_parts) else '{}'::jsonb end, v_park, auth.uid(),",
  dayNoWrite: '\n     and v_parts is not distinct from d.dead_parts then',
  dayPartsCheck: '  -- 0038: وهلاكات كلّ قسم في الأيّام كلّها لا تزيد على عدده.\n  perform private.flock_parts_check(f);\n',
  rebuildRule: '    if s.unsplit > 0 then',
  rebuildParts: '    v_parts := coalesce(s.dead_parts, array_fill(0, array[cardinality(f.section_counts)]));',
  openEven: '    v_counts := private.parts_even(p_placed_count, h.sections);',
  editRequired: '    if p_placed_count is distinct from f.placed_count then',
  sectionsRange: '  if p_sections is null or p_sections not between 1 and 4 then',
  sectionsStale: '  if p_expected_version is distinct from h.version then',
  sectionsDeaths: '  if f.id is not null and exists (select 1 from public.flock_daily d where d.org_id = f.org_id and d.flock_id = f.id and d.dead + d.culled > 0) then',
  sectionsResplit: '    update public.flocks x set section_counts = private.parts_even(x.placed_count, p_sections), version = x.version + 1\n    where x.org_id = f.org_id and x.id = f.id\n    returning * into f;\n',
  reopenSections: '  if coalesce(cardinality(v_counts), 1) <> h.sections then',
  blockSections: "    when exists (select 1 from public.flocks y join public.halls h on h.org_id = y.org_id and h.id = y.hall_id\n        where y.org_id = x.org_id and y.id = x.flock_id and coalesce(cardinality(y.section_counts), 1) <> h.sections) then 'sections_changed'\n",
  sheetDead: "        'dead', (v_totals -> 'dead_parts' ->> (s.i - 1))::bigint,",
  sheetRemaining: "        'remaining', f.section_counts[s.i] - (v_totals -> 'dead_parts' ->> (s.i - 1))::bigint) order by s.i)",
  summaryDead: "'section_dead', v_section_dead);",
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const samples = {};
  const same = (actual, expected, label) => t.same(sorted(actual), sorted(expected), label);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };
  const G = await makeOrg(db, {
    name: 'مزرعة الأقسام',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['worker', 'hall_worker', ['broiler']],
      ['viewer', 'viewer'],
    ],
  });
  const { users: U, divisions: D } = G;
  const O2 = await makeOrg(db, { name: 'منشأة الأقسام الثانية', id: (n) => id(40 + n), phone: (n) => phone(40 + n), roles: [['owner', 'owner']] });
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const code = (result) => (result.ok ? 'ok' : result.code);
  const tryOn = (user, sql, params) => call(db, user, sql, params, { commit: false });
  const dead = (user, o, options) => call(db, user, DEAD, deadParams(o), options);
  const saveDay = (user, o, options) => call(db, user, DAY, dayParams(o), options);
  const sheet = async (flock, user = U.owner) => one(user, SHEET, [flock]);
  const verifyOf = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_hall_sections()')).rows.map((r) => [r.check_name, r.v]));
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  const rowOf = (s, on) => s.days.find((d) => d.on === on);
  const dayRow = async (flock, on) =>
    (await db.admin('select dead, culled, dead_parts, version, note from public.flock_daily where flock_id = $1 and on_date = $2', [flock, on])).rows[0] ?? null;
  const liveVisits = async (flock, on) =>
    (await db.admin('select source, dead, dead_parts from public.flock_visits where flock_id = $1 and on_date = $2 and voided_at is null order by created_at, id', [flock, on])).rows;
  const flockRow = async (flock) => (await db.admin('select section_counts, placed_count, version, status from public.flocks where id = $1', [flock])).rows[0];
  const hallRow = async (hall) => (await db.admin('select sections, version from public.halls where id = $1', [hall])).rows[0];
  const pct = async (part, whole) => (await db.admin('select private.flock_pct($1, $2) as v', [part, whole])).rows[0].v;
  const bodyOf = (file, head) => {
    const text = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const start = text.indexOf(`create or replace function ${head}(`);
    return text.slice(start, text.indexOf('\n$$;', start) + 4);
  };

  // ── البذرة ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const site = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الأقسام', 'farm') returning id", [D.broiler]);
  const hall = (name, sections = 1) => one(U.owner, 'insert into public.halls (site_id, name, sections) values ($1, $2, $3) returning id', [site, name, sections]);
  const place = async (hallId, on, count, counts = null) => (await one(U.owner, OPEN, [hallId, on, count, uid(), counts])).flock_id;
  const H = {
    s2: await hall('قاعة 1', 2), g: await hall('قاعة 2', 2), t3: await hall('قاعة 3', 3), one: await hall('قاعة 4'), empty: await hall('قاعة 5'),
    zero: await hall('قاعة 6'), dead: await hall('قاعة 7'), race: await hall('قاعة 8', 2), re: await hall('قاعة 9', 2), c: await hall('قاعة 10', 2),
    lock: await hall('قاعة 12'), lockOld: await hall('قاعة 13'),
  };
  const F = {
    s2: await place(H.s2, day(-20), 27051), g: await place(H.g, day(-10), 8000, [5000, 3000]), t3: await place(H.t3, day(-10), 1000),
    one: await place(H.one, day(-10), 500), zero: await place(H.zero, day(-10), 300), dead: await place(H.dead, day(-10), 200),
    race: await place(H.race, day(-10), 400), re: await place(H.re, day(-6), 100), c: await place(H.c, day(-10), 1000, [600, 400]),
    lock: await place(H.lock, day(-10), 100), lockOld: await place(H.lockOld, day(-10), 100),
  };
  // قاعة بوجبة في المنشأة الثانية (للنداء من منشأة أخرى).
  const otherSite = await one(O2.users.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل المنشأة الثانية', 'farm') returning id", [O2.divisions.broiler]);
  const otherHall = await one(O2.users.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة أخرى') returning id", [otherSite]);
  // وجبة جديدة في قاعة جديدة بأقسامها داخل معاملة طفرة.
  const fresh = async (attempt, sections, count, counts = null, name = 'قاعة الطفرة') => {
    const hallId = await inside(attempt, U.owner, 'insert into public.halls (site_id, name, sections) values ($1, $2, $3) returning id as v', [site, name, sections]);
    if (count === null) return { hall: hallId, flock: null };
    const opened = await inside(attempt, U.owner, OPEN, [hallId, day(-5), count, uid(), counts]);
    return { hall: hallId, flock: opened.flock_id };
  };

  // ── ١) القاعة بأقسامها والتسكين ──────────────────────────────────────────────────────────────────────────────────────
  await section('القاعة والتسكين', async () => {
    same([await hallRow(H.s2), await hallRow(H.one)], [{ sections: 2, version: 1 }, { sections: 1, version: 1 }],
      'القاعة تُنشأ مقسومة بإدخال مباشر بعمود الأقسام (منح العمود)، وبلاه غير مقسومة');
    same({
      five: code(await tryOn(U.owner, "insert into public.halls (site_id, name, sections) values ($1, 'قاعة خماسية', 5) returning id as v", [site])),
      zero: code(await tryOn(U.owner, "insert into public.halls (site_id, name, sections) values ($1, 'قاعة صفرية', 0) returning id as v", [site])),
      update: code(await tryOn(U.owner, 'update public.halls set sections = 3 where id = $1 returning id as v', [H.one])).split(':')[0],
    }, { five: 'check:halls_sections_check', zero: 'check:halls_sections_check', update: '42501' },
    'الأقسام من 1 إلى 4 (القيد)، ولا منح تعديل على العمود: تغييرها بـset_hall_sections وحدها');
    same({
      even: (await flockRow(F.s2)).section_counts, three: (await flockRow(F.t3)).section_counts, given: (await flockRow(F.g)).section_counts,
      unsplit: (await flockRow(F.one)).section_counts,
    }, { even: [13526, 13525], three: [334, 333, 333], given: [5000, 3000], unsplit: null },
    'التسكين: بالتساوي والباقي للأقسام الأولى (27,051 = 13,526 + 13,525، و1,000 = 334 + 333 + 333)، وبالأعداد المرسلة، وغير المقسومة بلا أعداد');
    const refused = async (hallId, count, counts) => tryOn(U.owner, OPEN, [hallId, day(-1), count, uid(), counts]);
    const empty2 = await one(U.owner, "insert into public.halls (site_id, name, sections) values ($1, 'قاعة 11', 2) returning id", [site]);
    const sum = await refused(empty2, 8000, [5000, 2999]);
    same({
      sum: sum.code, length1: code(await refused(empty2, 8000, [8000])), length3: code(await refused(empty2, 8000, [4000, 2000, 2000])),
      negative: code(await refused(empty2, 8000, [9000, -1000])), nullPart: code(await refused(empty2, 8000, [8000, null])),
      unsplit: code(await refused(H.empty, 100, [50, 50])),
      given: (await refused(empty2, 8000, [8000, 0])).value?.section_counts,
    }, { sum: 'bad_value', length1: 'bad_value', length3: 'bad_value', negative: 'bad_value', nullPart: 'bad_value', unsplit: 'bad_value', given: [8000, 0] },
    'أعداد الأقسام: المجموع غير العدد الداخل، وخانة ناقصة أو زائدة، وسالبة، وفارغة، وأعداد لقاعة غير مقسومة كلّها bad_value؛ وقسم بصفر طير يُقبل');
    t.ok(sum.hint.includes('7,999') && sum.hint.includes('8,000'), `تلميح المجموع يسمّي المجموعين (${sum.hint})`);
    // بصمة المرجع: نداء بلا أعداد (الواجهة المنشورة) بصمته كما قبل 0038، فإعادته بالمرجع نفسه وبمعامل فارغ صريح ترجع جوابه.
    const ref = uid();
    const first = await one(U.owner, OPEN_OLD, [empty2, day(-1), 10, ref]);
    F.bare = first.flock_id;
    const again = await call(db, U.owner, OPEN, [empty2, day(-1), 10, ref, null]);
    same([first.section_counts, again.value, (await db.admin("select args_hash = md5(jsonb_build_object('hall', $2::uuid, 'placed_on', $3::date, 'count', 10, 'age', 0, 'breed', null)::text) as v from public.rpc_refs where fn = 'open_flock' and client_ref = $1", [ref, empty2, day(-1)])).rows[0]?.v],
      [[5, 5], first, true], 'تسكين بلا أعداد بتوقيعه القديم (6 معاملات) يقسم بالتساوي، وبصمته بصمة ما قبل 0038، والإعادة بالمرجع نفسه بمعامل فارغ صريح = الجواب الأوّل');
  });

  // ── ٢) أقسام القاعة (set_hall_sections) ──────────────────────────────────────────────────────────────────────────────
  await section('أقسام القاعة', async () => {
    const ref = uid();
    const saved = await call(db, U.owner, SECTIONS, [H.empty, 2, 1, ref]);
    same(saved.value, { status: 'saved', hall: { id: H.empty, version: 2, sections: 2 }, section_counts: null }, 'قاعة بلا وجبة: saved بنسختها الجديدة وأقسامها، وبلا أعداد');
    same((await call(db, U.owner, SECTIONS, [H.empty, 2, 1, ref])).value, saved.value, 'الإعادة بالمرجع نفسه = الجواب الأوّل');
    t.eq(code(await call(db, U.owner, SECTIONS, [H.empty, 3, 1, ref])), 'ref_reused', 'المرجع نفسه بقيمة أخرى ref_reused');
    same((await call(db, U.owner, SECTIONS, [H.empty, 2, 2, uid()])).value, { status: 'saved', hall: { id: H.empty, version: 2, sections: 2 }, section_counts: null },
      'القيمة نفسها: saved بلا كتابة (النسخة كما هي)');
    same((await call(db, U.owner, SECTIONS, [H.empty, 3, 1, uid()])).value, { status: 'stale_hall', hall: { id: H.empty, version: 2, sections: 2 } },
      'بنسخة قديمة: stale_hall بما في الخادم');
    same(await hallRow(H.empty), { sections: 2, version: 2 }, 'والقاعة كما حُفظت أوّلاً');
    same({
      zero: code(await tryOn(U.owner, SECTIONS, [H.empty, 0, 2, uid()])), five: code(await tryOn(U.owner, SECTIONS, [H.empty, 5, 2, uid()])),
      none: code(await tryOn(U.owner, SECTIONS, [H.empty, null, 2, uid()])), missing: code(await tryOn(U.owner, SECTIONS, [id(999), 2, 1, uid()])),
      otherOrg: code(await tryOn(U.owner, SECTIONS, [otherHall, 2, 1, uid()])), fromOtherOrg: code(await tryOn(O2.users.owner, SECTIONS, [H.empty, 3, 2, uid()])),
      // 0034 («الكلّ مثل المالك»): كلّ عضو فعّال يقسم القاعة (بمعاملة ترجع).
      viewer: (await tryOn(U.viewer, SECTIONS, [H.empty, 3, 2, uid()])).value?.status, worker: (await tryOn(U.worker, SECTIONS, [H.empty, 4, 2, uid()])).value?.hall?.sections,
    }, { zero: 'bad_value', five: 'bad_value', none: 'bad_value', missing: 'hall_not_found', otherOrg: 'hall_not_found', fromOtherOrg: 'hall_not_found', viewer: 'saved', worker: 4 },
    'set_hall_sections: المدى من 1 إلى 4، والقاعة غير الموجودة وقاعة منشأة أخرى (من الطرفين) hall_not_found، وكلّ عضو يقسمها (0034)');
    // «قاعة 6» غير مقسومة بأيّام بلا هلاكات: «لا هلاكات اليوم» صفراً (معلَّم)، وملاحظة وحدها، وزيارة بعلف.
    await one(U.owner, DEAD, deadParams({ flock: F.zero, on: day(-3), n: 0 }));
    await one(U.owner, DAY, dayParams({ flock: F.zero, on: day(-2), note: 'جولة بلا هلاكات' }));
    await one(U.worker, VISIT, visitParams({ flock: F.zero, on: day(-1), feed: '20.5' }));
    const before = { flock: await flockRow(F.zero), days: [await dayRow(F.zero, day(-3)), await dayRow(F.zero, day(-2)), await dayRow(F.zero, day(-1))] };
    const split = await call(db, U.owner, SECTIONS_NOW, [H.zero, 2, uid()]);
    samples.set_hall_sections_saved = split.value;
    const after = { flock: await flockRow(F.zero), days: [await dayRow(F.zero, day(-3)), await dayRow(F.zero, day(-2)), await dayRow(F.zero, day(-1))] };
    same([split.value?.status, split.value?.hall?.sections, split.value?.section_counts, after.flock.section_counts, after.flock.version - before.flock.version],
      ['saved', 2, [150, 150], [150, 150], 1], 'وجبة قائمة بلا هلاكات: saved، وتُقسم بالتساوي (150 + 150) بنسخة أكبر');
    same(after.days.map((d, i) => [d.dead_parts, d.version - before.days[i].version, d.dead, d.note]),
      [[[0, 0], 1, 0, null], [[0, 0], 1, 0, 'جولة بلا هلاكات'], [[0, 0], 1, 0, null]],
      'أيّامها تُعاد بناءً بأقسام أصفار بنسخة أكبر، وقيمها كما هي');
    // قسمين ← ثلاثة بعد «لا هلاكات اليوم» بأقسام أصفار (زيارة بأقسام)، ثمّ قسم واحد.
    await one(U.owner, DEAD, deadParams({ flock: F.zero, on: day(0), n: 0, parts: [0, 0] }));
    const three = await one(U.owner, SECTIONS_NOW, [H.zero, 3, uid()]);
    same([three.section_counts, (await liveVisits(F.zero, TODAY)).map((v) => v.dead_parts), (await dayRow(F.zero, TODAY)).dead_parts, (await dayRow(F.zero, day(-2))).dead_parts],
      [[100, 100, 100], [[0, 0, 0]], [0, 0, 0], [0, 0, 0]], 'قسمين ← ثلاثة: أعداد بالتساوي، وأقسام الزيارة أصفار بالطول الجديد، والأيّام كذلك');
    const back = await one(U.owner, SECTIONS_NOW, [H.zero, 1, uid()]);
    same([back.section_counts, (await liveVisits(F.zero, TODAY)).map((v) => v.dead_parts), (await dayRow(F.zero, TODAY)).dead_parts, (await flockRow(F.zero)).section_counts],
      [null, [null], null, null], 'ثمّ قسم واحد: الوجبة والزيارات والأيّام بلا أقسام');
    same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_hall_sections صفر بعد كلّ تقسيم');
    // «قاعة 7» غير مقسومة بهلاكات: لا تُقسم.
    await one(U.owner, DEAD_OLD, [F.dead, day(-2), 1, uid(), false]);
    const hall7 = await hallRow(H.dead);
    const refused = await call(db, U.owner, SECTIONS_NOW, [H.dead, 2, uid()]);
    samples.set_hall_sections_refused = { code: refused.code, hint: refused.hint };
    same([refused.code, refused.hint.includes('قاعة 7'), await hallRow(H.dead), (await flockRow(F.dead)).section_counts],
      ['sections_after_deaths', true, hall7, null], 'وجبة قائمة سُجّلت هلاكاتها: sections_after_deaths بتلميح يسمّي القاعة، ولا يُكتب شيء');
    t.eq(code(await tryOn(U.owner, SECTIONS_NOW, [H.dead, 1, uid()])), 'ok', 'والقيمة نفسها (قسم واحد) saved بلا رفض');
  });

  // ── ٣) الهلاكات بأقسامها (set_flock_dead) ───────────────────────────────────────────────────────────────────────────
  await section('set_flock_dead بالأقسام', async () => {
    const first = await dead(U.owner, { flock: F.s2, on: day(-5), n: 5, parts: [3, 2] });
    same([first.value?.status, pick(first.value?.day, 'dead', 'culled', 'dead_parts', 'dead_entered', 'version')],
      ['saved', { dead: 5, culled: 0, dead_parts: [3, 2], dead_entered: true, version: 1 }], 'هلاكات يوم بأقسامها: saved بصفّ اليوم بأقسامه');
    same(await liveVisits(F.s2, day(-5)), [{ source: 'visit', dead: 5, dead_parts: [3, 2] }], 'والزيارة بأقسامها');
    const sameParts = await dead(U.worker, { flock: F.s2, on: day(-5), n: 5, parts: [3, 2] });
    const swapped = await dead(U.worker, { flock: F.s2, on: day(-5), n: 5, parts: [2, 3] });
    const more = await dead(U.worker, { flock: F.s2, on: day(-5), n: 6, parts: [3, 3] });
    samples.set_flock_dead_recorded = swapped.value;
    same([sameParts.value?.status, swapped.value?.status, swapped.value?.day?.dead_parts, more.value?.status, (await liveVisits(F.s2, day(-5))).length, (await dayRow(F.s2, day(-5))).version],
      ['saved', 'dead_recorded', [3, 2], 'dead_recorded', 1, 1], 'مرّة في اليوم: بالأقسام نفسها saved، وبأقسام أخرى ولو بالمجموع نفسه dead_recorded، وبمجموع آخر كذلك، بلا كتابة');
    samples.set_flock_dead_saved = (await dead(U.owner, { flock: F.s2, on: day(-1), n: 2, parts: [2, 0] })).value;
    await one(U.owner, DEAD, deadParams({ flock: F.s2, on: day(-3), n: 4, parts: [1, 3] }));
    await one(U.owner, DEAD, deadParams({ flock: F.s2, on: day(-2), n: 0, parts: [0, 0] }));
    same({
      noParts: code(await dead(U.owner, { flock: F.s2, on: day(-4), n: 2 }, { commit: false })),
      noPartsQueued: code(await dead(U.owner, { flock: F.s2, on: day(-4), n: 2, queued: true }, { commit: false })),
      noPartsZero: code(await dead(U.owner, { flock: F.s2, on: day(-4), n: 0 }, { commit: false })),
      unsplit: code(await dead(U.owner, { flock: F.one, on: day(-4), n: 2, parts: [1, 1] }, { commit: false })),
      sum: code(await dead(U.owner, { flock: F.s2, on: day(-4), n: 3, parts: [1, 1] }, { commit: false })),
      length: code(await dead(U.owner, { flock: F.s2, on: day(-4), n: 3, parts: [1, 1, 1] }, { commit: false })),
      negative: code(await dead(U.owner, { flock: F.s2, on: day(-4), n: 1, parts: [2, -1] }, { commit: false })),
      nullPart: code(await dead(U.owner, { flock: F.s2, on: day(-4), n: 1, parts: [1, null] }, { commit: false })),
      section: code(await dead(U.owner, { flock: F.t3, on: day(-4), n: 340, parts: [0, 340, 0] }, { commit: false })),
      unsplitOld: (await call(db, U.owner, DEAD_OLD, [F.one, day(-4), 2, uid(), false], { commit: false })).value?.day?.dead_parts ?? 'null',
    }, { noParts: 'sections_required', noPartsQueued: 'sections_required', noPartsZero: 'sections_required', unsplit: 'bad_value', sum: 'bad_value', length: 'bad_value',
      negative: 'bad_value', nullPart: 'bad_value', section: 'live_negative', unsplitOld: 'null' },
    'وجبة مقسومة بلا أقسام sections_required (ولو صفراً أو من الطابور)، وأقسام لوجبة غير مقسومة وغير مجموعها وبطول آخر وسالبة وفارغة bad_value، وقسم فوق طيوره live_negative؛ وغير المقسومة بتوقيعها القديم كما كانت');
    const hint = async (o) => (await dead(U.owner, o, { commit: false })).hint;
    const [required, sumHint, sectionHint, unsplitHint] = [await hint({ flock: F.s2, on: day(-4), n: 2 }), await hint({ flock: F.s2, on: day(-4), n: 3, parts: [1, 1] }),
      await hint({ flock: F.t3, on: day(-4), n: 340, parts: [0, 340, 0] }), await hint({ flock: F.one, on: day(-4), n: 2, parts: [1, 1] })];
    t.ok(required.includes('مقسومة') && required.includes('حدّث التطبيق'), `تلميح sections_required (${required})`);
    t.ok(sumHint.includes('(2)') && sumHint.includes('(3)'), `تلميح المجموع يسمّي المجموعين (${sumHint})`);
    t.ok(sectionHint.includes('ق2') && sectionHint.includes('340') && sectionHint.includes('333'), `تلميح حدّ القسم يسمّي القسم وهلاكاته وطيوره (${sectionHint})`);
    t.ok(unsplitHint.includes('غير مقسومة'), `تلميح الأقسام لغير المقسومة (${unsplitHint})`);
    // بصمة المرجع لنداء بلا أقسام = بصمة ما قبل 0038 (إعادة عملية تطبيق قديم بعد التطبيق لا ترجع ref_reused).
    const ref = uid();
    await one(U.owner, DEAD_OLD, [F.one, day(-6), 1, ref, false]);
    t.eq((await db.admin("select args_hash = md5(jsonb_build_object('flock', $2::uuid, 'on', $3::date, 'dead', 1, 'queued', false)::text) as v from public.rpc_refs where fn = 'set_flock_dead' and client_ref = $1",
      [ref, F.one, day(-6)])).rows[0]?.v, true, 'set_flock_dead بلا أقسام: بصمة المرجع بصمة ما قبل 0038');
    // الركن من الطابور (الفترة مقفلة داخل معاملة ترجع): المركون يحمل الأقسام للمقسومة، ولغيرها كما كان.
    const parked = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-8)]);
      const split = await inside(attempt, U.owner, DEAD, deadParams({ flock: F.s2, on: day(-9), n: 2, queued: true, parts: [1, 1] }));
      const plain = await inside(attempt, U.owner, DEAD, deadParams({ flock: F.one, on: day(-9), n: 2, queued: true }));
      return { split, plain, payloads: (await oq("select payload from public.flock_day_rejects where flock_id = any ($1) and payload ? 'dead' order by payload ? 'parts' desc", [[F.s2, F.one]])).rows.map((r) => r.payload) };
    });
    same(parked, { split: { status: 'parked', reason: 'period_locked' }, plain: { status: 'parked', reason: 'period_locked' }, payloads: [{ dead: 2, parts: [1, 1] }, { dead: 2 }] },
      'المركون من الطابور: {dead, parts} للمقسومة، و{dead} وحده لغيرها كما قبل 0038');
  });

  // ── ٤) الورقة بالأقسام (save_flock_day) ─────────────────────────────────────────────────────────────────────────────
  await section('save_flock_day بالأقسام', async () => {
    await one(U.owner, DEAD, deadParams({ flock: F.c, on: day(-5), n: 5, parts: [3, 2] }));
    const v1 = (await dayRow(F.c, day(-5))).version;
    const corrected = await saveDay(U.owner, { flock: F.c, on: day(-5), dead: 5, parts: [1, 4], base: v1 });
    same([corrected.value?.status, await dayRow(F.c, day(-5)), await liveVisits(F.c, day(-5))],
      ['saved', { dead: 5, culled: 0, dead_parts: [1, 4], version: v1 + 1, note: null }, [{ source: 'day_total', dead: 5, dead_parts: [1, 4] }]],
      'تصحيح القسمة بالمجموع نفسه يُكتب (لا «القيمة نفسها»): صفّ اليوم بأقسامه الجديدة وزيارة day_total بها');
    await one(U.owner, DAY, dayParams({ flock: F.c, on: day(-5), dead: 7, parts: [3, 4], base: v1 + 1 }));
    same((await dayRow(F.c, day(-5))).dead_parts, [3, 4], 'وبمجموع آخر');
    await one(U.owner, DAY, dayParams({ flock: F.c, on: day(-5), note: 'تلقيح', base: v1 + 2 }));
    same([await dayRow(F.c, day(-5)), await liveVisits(F.c, day(-5))], [{ dead: 7, culled: 0, dead_parts: [3, 4], version: v1 + 3, note: 'تلقيح' },
      [{ source: 'day_total', dead: 7, dead_parts: [3, 4] }]], 'تعديل الملاحظة وحدها يُبقي قسمة اليوم في زيارة day_total');
    await one(U.owner, DAY, dayParams({ flock: F.c, on: day(-5), dead: 0, base: v1 + 3 }));
    same(pick(await dayRow(F.c, day(-5)), 'dead', 'dead_parts'), { dead: 0, dead_parts: [0, 0] }, 'الصفر بلا أقسام أصفار');
    const same0 = await saveDay(U.owner, { flock: F.c, on: day(-5), dead: 0, parts: [0, 0], base: v1 + 4 });
    same([same0.value, (await dayRow(F.c, day(-5))).version], [{ status: 'saved', version: v1 + 4 }, v1 + 4], 'والأقسام نفسها مرّة ثانية: saved بلا كتابة');
    const parked = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-8)]);
      const split = await inside(attempt, U.owner, DAY, dayParams({ flock: F.c, on: day(-9), dead: 2, parts: [2, 0], queued: true }));
      return { split, payload: (await oq("select payload -> 'dead_parts' as p, payload ->> 'dead' as d from public.flock_day_rejects where flock_id = $1 and payload ? 'dead_parts'", [F.c])).rows };
    });
    same(parked, { split: { status: 'parked', reason: 'period_locked' }, payload: [{ p: [2, 0], d: '2' }] }, 'المركون من الطابور يحمل dead_parts مع الهلاكات');
    same({
      noParts: code(await saveDay(U.owner, { flock: F.c, on: day(-4), dead: 2 }, { commit: false })),
      partsAlone: code(await saveDay(U.owner, { flock: F.c, on: day(-4), note: 'أقسام بلا مجموعها', parts: [1, 1] }, { commit: false })),
      unsplit: code(await saveDay(U.owner, { flock: F.one, on: day(-4), dead: 2, parts: [1, 1] }, { commit: false })),
      culled: code(await saveDay(U.owner, { flock: F.c, on: day(-4), dead: 2, culled: 1, parts: [1, 1] }, { commit: false })),
      sum: code(await saveDay(U.owner, { flock: F.c, on: day(-4), dead: 3, parts: [1, 1] }, { commit: false })),
      section: code(await saveDay(U.owner, { flock: F.t3, on: day(-4), dead: 335, parts: [335, 0, 0] }, { commit: false })),
      noteOnly: (await saveDay(U.owner, { flock: F.c, on: day(-4), note: 'ملاحظة وحدها' }, { commit: false })).value?.status,
    }, { noParts: 'sections_required', partsAlone: 'bad_value', unsplit: 'bad_value', culled: 'bad_value', sum: 'bad_value', section: 'live_negative', noteOnly: 'saved' },
    'save_flock_day: هلاكات بلا أقسام لوجبة مقسومة sections_required، وأقسام بلا مجموعها ولغير المقسومة ومع مستبعد وبغير مجموعها bad_value، وقسم فوق طيوره live_negative؛ والملاحظة وحدها تُكتب');
    const noteOnly = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await inside(attempt, U.owner, DAY, dayParams({ flock: F.c, on: day(-4), note: 'ملاحظة وحدها' }));
      return (await oq('select dead_parts from public.flock_daily where flock_id = $1 and on_date = $2', [F.c, day(-4)])).rows[0].dead_parts;
    });
    same(noteOnly, [0, 0], 'ويوم جديد بملاحظة وحدها في وجبة مقسومة بأقسام أصفار');
  });

  // ── ٥) الزيارة بهلاكات في وجبة مقسومة (save_flock_visit كما هو) ─────────────────────────────────────────────────────────
  await section('save_flock_visit', async () => {
    const withDead = await call(db, U.worker, VISIT, visitParams({ flock: F.c, on: day(-3), dead: 2 }), { commit: false });
    const queued = await call(db, U.worker, VISIT, visitParams({ flock: F.c, on: day(-3), culled: 1, queued: true }), { commit: false });
    const feedOnly = await call(db, U.worker, VISIT, visitParams({ flock: F.c, on: day(-3), feed: '10' }), { commit: false });
    same([withDead.code, queued.code, feedOnly.value?.status, feedOnly.value?.day?.dead_parts], ['sections_required', 'sections_required', 'saved', [0, 0]],
      'زيارة بنافق أو مستبعد في وجبة مقسومة sections_required (تطبيق قبل 0038 لا يكتب هلاكاتها، ولو من الطابور)، وزيارة بعلف وحده تُكتب واليوم بأقسام أصفار');
  });

  // ── ٦) تعديل الوجبة (edit_flock) ───────────────────────────────────────────────────────────────────────────────────
  await section('edit_flock', async () => {
    await one(U.owner, DEAD, deadParams({ flock: F.g, on: day(-3), n: 10, parts: [0, 10] }));
    const placedOn = day(-10);
    same({
      required: code(await call(db, U.owner, EDIT, [F.g, placedOn, 9000, uid(), null], { commit: false })),
      sum: code(await call(db, U.owner, EDIT, [F.g, placedOn, 9000, uid(), [5000, 3000]], { commit: false })),
      length: code(await call(db, U.owner, EDIT, [F.g, placedOn, 9000, uid(), [9000]], { commit: false })),
      below: code(await call(db, U.owner, EDIT, [F.g, placedOn, 8000, uid(), [7995, 5]], { commit: false })),
      unsplit: code(await call(db, U.owner, EDIT, [F.one, day(-10), 500, uid(), [250, 250]], { commit: false })),
    }, { required: 'section_counts_required', sum: 'bad_value', length: 'bad_value', below: 'live_negative', unsplit: 'bad_value' },
    'تعديل العدد الداخل بلا أعداد الأقسام section_counts_required، وأعداد بغير مجموعها أو بطول آخر bad_value، وقسم أقلّ من هلاكاته live_negative، وأعداد لغير المقسومة bad_value');
    const below = await call(db, U.owner, EDIT, [F.g, placedOn, 8000, uid(), [7995, 5]], { commit: false });
    t.ok(below.hint.includes('ق2') && below.hint.includes('(10)') && below.hint.includes('(5)'), `تلميح القسم الأقلّ من هلاكاته يسمّيه (${below.hint})`);
    const ref = uid();
    const version = (await flockRow(F.g)).version;
    const edited = await one(U.owner, EDIT_V, [F.g, version, placedOn, 9000, ref, [5500, 3500]]);
    same([pick(edited, 'changed', 'placed_count', 'section_counts'), (await flockRow(F.g)).section_counts, (await call(db, U.owner, EDIT_V, [F.g, version, placedOn, 9000, ref, [5500, 3500]])).value],
      [{ changed: true, placed_count: 9000, section_counts: [5500, 3500] }, [5500, 3500], edited], 'العدد الداخل بأعداد أقسامه: changed، والإعادة بالمرجع نفسه = الجواب الأوّل');
    const moved = await one(U.owner, EDIT, [F.g, placedOn, 9000, uid(), [4500, 4500]]);
    const kept = await one(U.owner, EDIT, [F.g, placedOn, 9000, uid(), null]);
    same([moved.changed, moved.section_counts, kept.changed, kept.section_counts], [true, [4500, 4500], false, [4500, 4500]],
      'أعداد الأقسام وحدها بالعدد نفسه changed؛ وبلا أعداد ولا تغيير للعدد تبقى أعداده (changed false)');
  });

  // ── ٧) القرّاء ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await section('القرّاء', async () => {
    // عيّنة الورقة: «قاعة 1» بهلاكات ثلاثة أيّام ويوم «لا هلاكات» وتعديل ملاحظة وحدها يُبقي القسمة.
    const d3 = await dayRow(F.s2, day(-3));
    await one(U.owner, DAY, dayParams({ flock: F.s2, on: day(-3), note: 'تلقيح نيوكاسل', base: d3.version }));
    const s = await sheet(F.s2);
    samples.hall_sheet = s;
    const parts = Object.fromEntries(s.days.filter((d) => d.dead_parts !== null).map((d) => [d.on, [d.dead, d.dead_parts]]));
    same(parts, { [day(-5)]: [5, [3, 2]], [day(-3)]: [4, [1, 3]], [day(-2)]: [0, [0, 0]], [day(-1)]: [2, [2, 0]] }, 'الورقة: أقسام كلّ يوم مسجَّل (ومجموعها هلاكاته)، والملاحظة وحدها أبقت القسمة');
    t.eq(rowOf(s, day(-3)).note, 'تلقيح نيوكاسل', 'والملاحظة في يومها');
    same([s.totals.dead, s.totals.dead_parts], [11, [6, 5]], 'المجاميع: الهلاكات 11 وأقسامها 6 + 5');
    same(s.sections, [
      { no: 1, placed: 13526, dead: 6, mortality_pct: await pct(6, 13526), remaining: 13520 },
      { no: 2, placed: 13525, dead: 5, mortality_pct: await pct(5, 13525), remaining: 13520 },
    ], 'الأقسام: لكلّ قسم رقمه وعدده وهلاكاته ونسبتها (كنسبة الخلاصة) والباقي بعدها');
    t.eq(s.sections[0].mortality_pct, '0.04', 'النسبة نصّ بمرتبتين كـsummary.mortality_pct');
    const plain = await sheet(F.one);
    same([plain.sections, plain.totals.dead_parts, plain.days.every((d) => d.dead_parts === null)], [null, null, true], 'وجبة غير مقسومة: sections وtotals.dead_parts فارغان، وكلّ يوم بلا أقسام');
    const emptySection = await mutant(db, U.owner, [], async ({ attempt }) => {
      const f = await fresh(attempt, 2, 10, [10, 0]);
      return (await inside(attempt, U.owner, SHEET, [f.flock])).sections;
    });
    same(emptySection, [{ no: 1, placed: 10, dead: 0, mortality_pct: '0.00', remaining: 10 }, { no: 2, placed: 0, dead: 0, mortality_pct: '0.00', remaining: 0 }],
      'قسم بلا طيور: نسبته «0.00» لا فارغة');
    const overview = await one(U.owner, OVERVIEW, []);
    samples.flocks_overview = overview;
    const halls = Object.fromEntries(overview.sites.flatMap((x) => x.halls).map((h) => [h.name, h]));
    same({
      s2: [halls['قاعة 1'].sections, halls['قاعة 1'].flock.section_counts, halls['قاعة 1'].flock.section_dead],
      t3: [halls['قاعة 3'].sections, halls['قاعة 3'].flock.section_counts, halls['قاعة 3'].flock.section_dead],
      one: [halls['قاعة 4'].sections, halls['قاعة 4'].flock.section_counts, halls['قاعة 4'].flock.section_dead],
      empty: [halls['قاعة 5'].sections, halls['قاعة 5'].flock],
    }, { s2: [2, [13526, 13525], [6, 5]], t3: [3, [334, 333, 333], [0, 0, 0]], one: [1, null, null], empty: [2, null] },
    'flocks_overview: أقسام كلّ قاعة، ولكلّ وجبة أعداد أقسامها وهلاكات كلّ قسم (فارغة لغير المقسومة)');
    const detail = await one(U.owner, DETAIL, [F.s2]);
    same([detail.days.find((d) => d.on_date === day(-5))?.dead_parts, detail.flock.section_dead, detail.flock.today?.dead_parts ?? null],
      [[3, 2], [6, 5], null], 'flock_day_json في flock_detail: أقسام كلّ يوم، والملخّص بهلاكات كلّ قسم');
  });

  // ── ٨) جلستان لليوم نفسه ─────────────────────────────────────────────────────────────────────────────────────────
  await section('السباق', async () => {
    const raced = await race(db, { user: U.owner, sql: DEAD, params: deadParams({ flock: F.race, on: day(-2), n: 3, parts: [2, 1] }) },
      { user: U.worker, sql: DEAD, params: deadParams({ flock: F.race, on: day(-2), n: 3, parts: [1, 2] }) });
    same([raced.first, raced.state, raced.second, raced.rows[1]?.[0]?.v?.status, raced.rows[1]?.[0]?.v?.day?.dead_parts], ['ok', 'blocked', 'ok', 'dead_recorded', [2, 1]],
      'جهازان ليوم مقسوم بقسمتين: الثاني ينتظر صفّ الوجبة ثمّ يرى قسمة الأوّل (dead_recorded) ولا يكتب فوقها');
    same([await liveVisits(F.race, day(-2)), pick(await dayRow(F.race, day(-2)), 'dead', 'dead_parts')], [[{ source: 'visit', dead: 3, dead_parts: [2, 1] }], { dead: 3, dead_parts: [2, 1] }],
      'زيارة واحدة واليوم بقسمة الأوّل');
    const twin = await race(db, { user: U.owner, sql: DEAD, params: deadParams({ flock: F.race, on: day(-3), n: 3, parts: [2, 1] }) },
      { user: U.worker, sql: DEAD, params: deadParams({ flock: F.race, on: day(-3), n: 3, parts: [2, 1] }) });
    same([twin.state, twin.rows[1]?.[0]?.v?.status, (await liveVisits(F.race, day(-3))).length], ['blocked', 'saved', 1], 'وبالقسمة نفسها: saved بلا زيارة ثانية');
    const control = await race(db, { user: U.owner, sql: DEAD, params: deadParams({ flock: F.race, on: day(-4), n: 3, parts: [2, 1] }), rollback: true },
      { user: U.worker, sql: DEAD, params: deadParams({ flock: F.race, on: day(-4), n: 3, parts: [1, 2] }) });
    same([control.state, control.rows[1]?.[0]?.v?.status, control.rows[1]?.[0]?.v?.day?.dead_parts], ['blocked', 'saved', [1, 2]], 'ضابط: الأوّل يرجع فيُحفظ الثاني بقسمته');
  });

  // ── ٨ب) ترتيب الأقفال: كاتب الهلاكات يمسك صفّ الوجبة ثمّ يأخذ تحقّق المفتاح الأجنبيّ key share على القاعة؛ وset_hall_sections تمسك القاعة ثمّ الوجبة ──────
  // الجلسة أ تمسك صفّ الوجبة، والجلسة ب تقسم القاعة (تمسك القاعة وتنتظر الوجبة)، ثمّ أ تكتب هلاكات اليوم: القاعة for no key update لا تمنع key share فتكمل أ
  // وتثبت، وتكمل ب بعدها فترى الهلاكات (sections_after_deaths). وضابطه الجسم بقفل for update (يثبت لجلستين ثمّ يرجع كما كان): أ تنتظر ب وب تنتظر أ (40P01).
  await section('ترتيب الأقفال', async () => {
    const committedBroken = async (signature, pairs, fn) => {
      const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [signature])).rows[0].d;
      let broken = original;
      for (const [from, to] of pairs) {
        if (broken.split(from).length !== 2) throw new Error(`طفرة ${signature}: المرساة ليست مرّة واحدة: ${from}`);
        broken = broken.split(from).join(to);
      }
      const apply = async (sql) => {
        await db.admin('begin');
        try {
          await db.admin('set local role postgres');
          await db.admin(sql);
          await db.admin('commit');
        } catch (error) {
          await db.admin('rollback');
          throw error;
        }
      };
      await apply(broken);
      try {
        return await fn();
      } finally {
        await apply(original);
      }
    };
    const lockRace = async (flock, hallId) => {
      const a = await db.session(U.owner, { role: 'postgres' });
      const b = await db.session(U.owner);
      try {
        await a.run("set local lock_timeout = '10s'");
        const held = await a.run('select 1 from public.flocks where id = $1 for update', [flock]);
        const pendingB = b.run(SECTIONS_NOW, [hallId, 2, uid()]);
        const stateB = await db.settle(pendingB, b.pid);
        const pendingA = a.run(DEAD, deadParams({ flock, on: day(-1), n: 1 }));
        const stateA = await db.settle(pendingA, a.pid);
        const resultA = await pendingA;
        await a.commit();
        const resultB = await pendingB;
        await b.commit();
        return { held: held.ok, stateB, stateA, a: resultA.ok ? resultA.rows[0].v.status : resultA.error, b: resultB.ok ? resultB.rows[0].v.status : resultB.error };
      } finally {
        await a.rollback();
        await b.rollback();
      }
    };
    const real = await lockRace(F.lock, H.lock);
    same(real, { held: true, stateB: 'blocked', stateA: 'finished', a: 'saved', b: 'sections_after_deaths' },
      'قسمة القاعة وهلاكات اليوم معاً: الهلاكات لا تنتظر قفل القاعة فتثبت، والقسمة بعدها ترى الهلاكات فترفض (بلا 40P01)');
    same([await hallRow(H.lock), (await flockRow(F.lock)).section_counts], [{ sections: 1, version: 1 }, null], 'والقاعة والوجبة كما كانتا');
    const old = await committedBroken(SIG.sections, [['x.id = p_hall for no key update;', 'x.id = p_hall for update;']], () => lockRace(F.lockOld, H.lockOld));
    t.ok(old.stateA === 'blocked' && [old.a, old.b].some((x) => /deadlock/u.test(String(x))),
      `ضابط: القاعة بـfor update تمنع key share فتنتظر الهلاكات القسمة والقسمة الهلاكات حتى يكسر بوستغريس أحدهما (${JSON.stringify(old)})`);
  });

  // ── ٩) إعادة فتح وجبة تغيّرت أقسام قاعتها ────────────────────────────────────────────────────────────────────────────
  await section('إعادة الفتح', async () => {
    await one(U.owner, DEAD, deadParams({ flock: F.re, on: day(-4), n: 1, parts: [1, 0] }));
    const closeId = uid();
    await one(U.owner, CLOSE, [uid(), closeId, F.re, TODAY, 99, await one(U.owner, CLOSE_FORM, [F.re])]);
    const one1 = await one(U.owner, SECTIONS_NOW, [H.re, 1, uid()]);
    const card = await one(U.owner, SALES, [F.re]);
    const refused = await call(db, U.owner, REOPEN, [closeId, uid()]);
    same([one1.status, one1.section_counts, card.reopen_why, card.can.reopen, refused.code, (await flockRow(F.re)).status],
      ['saved', null, 'sections_changed', false, 'sections_changed', 'closed'],
      'قاعة بلا وجبة قائمة تتغيّر أقسامها بحرّية؛ ووجبتها المغلقة بقسمين لا تُعاد فتحها (reopen_why بالشرط نفسه، وreopen_flock يرفض)');
    t.ok(refused.hint.includes('قاعة 9') && refused.hint.includes(' 1 ') && refused.hint.includes(' 2'), `تلميح sections_changed يسمّي القاعة والعددين (${refused.hint})`);
    await one(U.owner, SECTIONS_NOW, [H.re, 2, uid()]);
    const open = await one(U.owner, SALES, [F.re]);
    const reopened = await call(db, U.owner, REOPEN, [closeId, uid()]);
    same([open.reopen_why, open.can.reopen, reopened.value?.status, pick(await flockRow(F.re), 'status', 'section_counts')],
      [null, true, 'reopened', { status: 'active', section_counts: [50, 50] }], 'وبعد إعادة أقسام القاعة كما كانت تُعاد فتحها بأعدادها');
    same(await db.asService(verifyOf), VERIFY_ZERO, 'والثابت صفر بعدها');
  });

  // ── ١٠) الثابت: صفر، وكلّ فحص يمسكه جسم مكسور يكتب خرقه ─────────────────────────────────────────────────────────────
  await section('الثابت', async () => {
    same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_hall_sections صفر');
    const BREAKS = {
      // الضابط: الأجسام الحقيقية تكتب ولا خرق.
      control: ['visit_parts', [], async ({ attempt }) => {
        const f = await fresh(attempt, 2, 100);
        return inside(attempt, U.owner, DEAD, deadParams({ flock: f.flock, on: day(-1), n: 3, parts: [2, 1] }));
      }],
      // set_hall_sections بلا فحص المدى (وقيده مُسقط داخل المعاملة) تكتب خمسة أقسام لقاعة بلا وجبة.
      range: ['hall_sections_range', [[SIG.sections, [[ANCHOR.sectionsRange, '  if p_sections is null then']]]], async ({ oq, attempt }) => {
        await oq('alter table public.halls drop constraint halls_sections_check');
        const f = await fresh(attempt, 1, null);
        return inside(attempt, U.owner, SECTIONS, [f.hall, 5, 1, uid()]);
      }],
      // set_hall_sections لا تقسم الوجبة القائمة: أعدادها بقسمة القاعة القديمة.
      counts: ['flock_counts_shape', [[SIG.sections, [[ANCHOR.sectionsResplit, '']]]], async ({ attempt }) => {
        const f = await fresh(attempt, 2, 100);
        return inside(attempt, U.owner, SECTIONS, [f.hall, 3, 1, uid()]);
      }],
      // set_flock_dead بلا فحص الأقسام يكتب زيارة بثلاث خانات لوجبة بقسمين.
      visits: ['visit_parts', [[SIG.dead, [[ANCHOR.deadInput, '']]]], async ({ attempt }) => {
        const f = await fresh(attempt, 2, 100);
        return inside(attempt, U.owner, DEAD, deadParams({ flock: f.flock, on: day(-1), n: 3, parts: [1, 1, 1] }));
      }],
      // الكاتب الوحيد يقلب أقسام اليوم: مجموعها هلاكاته، وخاناتها غير مجموع خانات زياراته.
      days: ['day_parts', [[SIG.rebuild, [[ANCHOR.rebuildParts,
        '    v_parts := coalesce((select array_agg(u.x order by u.i desc) from unnest(s.dead_parts) with ordinality as u(x, i)), array_fill(0, array[cardinality(f.section_counts)]));']]]],
      async ({ attempt }) => {
        const f = await fresh(attempt, 2, 100);
        return inside(attempt, U.owner, DEAD, deadParams({ flock: f.flock, on: day(-1), n: 4, parts: [3, 1] }));
      }],
      // set_flock_dead بلا فحص الأقسام يكتب أقساماً لوجبة غير مقسومة.
      unsplit: ['unsplit_parts', [[SIG.dead, [[ANCHOR.deadInput, '']]]], async ({ attempt }) => {
        const f = await fresh(attempt, 1, 100);
        return inside(attempt, U.owner, DEAD, deadParams({ flock: f.flock, on: day(-1), n: 3, parts: [2, 1] }));
      }],
      // set_flock_dead بلا حدّ القسم يكتب هلاكات قسم فوق طيوره.
      sectionLive: ['section_live', [[SIG.dead, [[ANCHOR.deadPartsCheck, '']]]], async ({ attempt }) => {
        const f = await fresh(attempt, 2, 10);
        return inside(attempt, U.owner, DEAD, deadParams({ flock: f.flock, on: day(-1), n: 7, parts: [7, 0] }));
      }],
      // الورقة بالباقي عدد القسم (بلا هلاكاته) لـ«قاعة 1» بهلاكاتها.
      sheet: ['sheet_sections', [[SIG.sheet, [[ANCHOR.sheetRemaining, "        'remaining', f.section_counts[s.i]) order by s.i)"]]]], async () => 'ok'],
      sheetDead: ['sheet_sections', [[SIG.sheet, [[ANCHOR.sheetDead, "        'dead', 0::bigint,"]]]], async () => 'ok'],
    };
    const caught = {};
    for (const [label, [name, fns, run]] of Object.entries(BREAKS)) {
      caught[label] = await mutant(db, U.owner, fns, async (kit) => {
        const done = await run(kit);
        return { done: done?.code ?? 'ok', [name]: (await verifyOf(kit.oq))[name] };
      });
    }
    const sheets = { sheet: caught.sheet, sheetDead: caught.sheetDead };
    delete caught.sheet;
    delete caught.sheetDead;
    same(caught, {
      control: { done: 'ok', visit_parts: 0 },
      range: { done: 'ok', hall_sections_range: 1 },
      counts: { done: 'ok', flock_counts_shape: 1 },
      visits: { done: 'ok', visit_parts: 1 },
      days: { done: 'ok', day_parts: 1 },
      unsplit: { done: 'ok', unsplit_parts: 1 },
      sectionLive: { done: 'ok', section_live: 1 },
    }, 'كلّ فحص في الثابت يمسك خرقاً يكتبه جسم مكسور باسمه (المدى، والقسمة القديمة، وخانات الزيارة، وخانات اليوم، والأقسام لغير المقسومة، وحدّ القسم)، والضابط صفر');
    t.ok(sheets.sheet?.done === 'ok' && sheets.sheet?.sheet_sections > 0 && sheets.sheetDead?.done === 'ok' && sheets.sheetDead?.sheet_sections > 0,
      `طفرة في أقسام الورقة يمسكها الثابت (الباقي ${sheets.sheet?.sheet_sections}، والهلاكات ${sheets.sheetDead?.sheet_sections})`);
  });

  // ── ١٠ب) الورقة تُقرأ مرّة: verify_hall_sheet يقرأ كلّ ورقة ويفحص مفاتيح كازها، وverify_kerosene ورقة الوجبة بكازها وحدها ────────────────────
  // ورقة مكسورة ترمي لوجبة بعينها: verify_hall_sheet يعدّها خرقاً لكلّ وجبة مسكَّنة (الورقة تحت الفحص تُقرأ ولو بلا سجلّات: معامل مختلَق لوجبة مغلقة بلا
  // شيء لا يظهر إلّا بقراءتها)، وverify_kerosene لوجبة بكازها وحده («قاعة 1» بكاز يُكتب داخل المعاملة)؛ والضابط: الجسم الحقيقيّ صفر. ومجموع كاز فارغ
  // بدل الصفر لا يظهر إلّا في ورقة وجبة بلا كاز: يمسكه verify_hall_sheet، وverify_kerosene لا يقرأ ورقتها (طفرة تثبت أنّ غيره يمسك ما يتخطّاه).
  await section('الثابتان والورقة', async () => {
    const throwFor = (flock) => [[SIG.sheet, [["  perform private.require('read');\n", `  perform private.require('read');\n  if p_flock = '${flock}'::uuid then\n    raise exception 'probe' using hint = 'ضابط.';\n  end if;\n`]]]];
    const both = async (fns, kerosene) => mutant(db, U.owner, fns, async ({ oq, attempt }) => {
      if (kerosene) await inside(attempt, U.owner, 'select public.set_flock_kerosene($1, $2, 10, null, $3, false) as v', [F.s2, day(-2), uid()]);
      const sheetRows = Object.fromEntries((await oq('select check_name, violations::int as v from public.verify_hall_sheet()')).rows.map((r) => [r.check_name, r.v]));
      const keroRows = Object.fromEntries((await oq('select check_name, violations::int as v from public.verify_kerosene()')).rows.map((r) => [r.check_name, r.v]));
      return [sheetRows.sheet_totals, keroRows.sheet_kerosene_totals];
    });
    same({
      control: await both([], true),
      bare: await both(throwFor(F.bare), true),
      split: await both(throwFor(F.s2), true),
      splitNoKerosene: await both(throwFor(F.s2), false),
    }, { control: [0, 0], bare: [1, 0], split: [1, 1], splitNoKerosene: [1, 0] },
    'verify_hall_sheet يقرأ ورقة كلّ وجبة (ولو بلا شيء)، وverify_kerosene ورقة وجبة بكازها وحده؛ والضابط صفر');
    const nullTotals = await both([[SIG.sheet, [['coalesce(sum(z.liters), 0)::bigint', 'sum(z.liters)::bigint']]]], true);
    t.ok(nullTotals[0] > 0 && nullTotals[1] === 0,
      `مجموع كاز فارغ بدل الصفر في ورقة وجبة بلا كاز يمسكه verify_hall_sheet في قراءته (${nullTotals[0]})، وverify_kerosene لا يقرأ ورقتها (${nullTotals[1]})`);
  });

  // ── ١٠ج) الورقة بخطّة عامّة لكلّ جلسة: الإعداد على الدالّة، والجواب نفسه حرفاً بلا الإعداد ─────────────────────────────────────────────
  // كلّ وجبة مسكَّنة في منشأتي الملفّ بهويّة مالكها: الورقة بالإعداد (الخطّة العامّة) = الورقة بجسمها بلا الإعداد (الخطّة المخصّصة لكلّ نداء).
  await section('الورقة بخطّة عامّة', async () => {
    const config = (await db.admin("select coalesce(p.proconfig, '{}') as c from pg_proc p where p.oid = 'public.hall_sheet(uuid)'::regprocedure")).rows[0].c;
    t.ok(config.includes('plan_cache_mode=force_generic_plan'), `hall_sheet بإعداد الخطّة العامّة على الدالّة (${config.join('، ')})`);
    const SHEETS = `do $s$
declare v_org record; v_flock record;
begin
  create temp table _sheets (flock uuid primary key, sheet text) on commit drop;
  for v_org in select f.org_id, (select m.user_id from public.members m where m.org_id = f.org_id and m.role = 'owner' and m.archived_at is null
      and m.accepted_at is not null order by m.created_at, m.id limit 1) as owner
    from public.flocks f where f.org_id in ('${G.org}', '${O2.org}') and f.placed_on is not null group by f.org_id loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_org.owner, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_org.owner::text, true);
    for v_flock in select x.id from public.flocks x where x.org_id = v_org.org_id and x.placed_on is not null loop
      insert into _sheets values (v_flock.id, public.hall_sheet(v_flock.id)::text);
    end loop;
  end loop;
end $s$`;
    const read = (fns) => mutant(db, U.owner, fns, async ({ oq }) => {
      await oq(SHEETS);
      return (await oq("select count(*)::int as n, md5(string_agg(flock::text || sheet, ',' order by flock)) as d from _sheets")).rows[0];
    });
    const generic = await read([]);
    const custom = await read([[SIG.sheet, [[" SET plan_cache_mode TO 'force_generic_plan'\n", '']]]]);
    t.ok(generic.n > 0 && generic.n === custom.n && generic.d === custom.d,
      `كلّ ورقة في منشأتي الملفّ بالخطّة العامّة هي نفسها بلا إعدادها (${generic.n} ورقة، ${generic.d === custom.d ? 'البصمة نفسها' : 'بصمتان'})`);
  });

  // ── ١١) الطفرات: كلّ قاعدة مكسورة يمسكها فحصها ─────────────────────────────────────────────────────────────────────────
  await section('الطفرات', async () => {
    const CASES = [
      {
        name: 'set_flock_dead: يوم مسجَّل بقسمة أخرى بالمجموع نفسه',
        fns: [[SIG.dead, [[ANCHOR.deadSameParts, '']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DEAD, deadParams({ flock: F.s2, on: day(-5), n: 5, parts: [2, 3] })))?.status,
        correct: (v) => v === 'dead_recorded',
      },
      {
        name: 'set_flock_dead: الأقسام في بصمة كلّ نداء (نداء بلا أقسام ببصمة جديدة)',
        fns: [[SIG.dead, [[ANCHOR.deadHash, "    || jsonb_build_object('parts', p_parts));"]]]],
        run: async ({ oq, attempt }) => {
          const ref = uid();
          await inside(attempt, U.owner, DEAD_OLD, [F.one, day(-7), 1, ref, false]);
          return (await oq("select args_hash = md5(jsonb_build_object('flock', $2::uuid, 'on', $3::date, 'dead', 1, 'queued', false)::text) as v from public.rpc_refs where fn = 'set_flock_dead' and client_ref = $1",
            [ref, F.one, day(-7)])).rows[0]?.v;
        },
        correct: (v) => v === true,
      },
      {
        name: 'set_flock_dead: المركون بلا أقسامه',
        fns: [[SIG.dead, [[ANCHOR.deadParked, "      jsonb_build_object('dead', p_dead), v_park, auth.uid(),"]]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-8)]);
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.s2, on: day(-9), n: 2, queued: true, parts: [1, 1] }));
          return (await oq("select payload from public.flock_day_rejects where flock_id = $1 and payload ? 'dead'", [F.s2])).rows[0]?.payload?.parts ?? null;
        },
        correct: (v) => JSON.stringify(v) === '[1,1]',
      },
      {
        name: 'save_flock_day: القسمة الأخرى بالمجموع نفسه «القيمة نفسها»',
        fns: [[SIG.day, [[ANCHOR.dayNoWrite, ' then']]]],
        run: async ({ oq, attempt }) => {
          const before = (await oq('select version from public.flock_daily where flock_id = $1 and on_date = $2', [F.s2, day(-1)])).rows[0].version;
          await inside(attempt, U.owner, DAY, dayParams({ flock: F.s2, on: day(-1), dead: 2, parts: [0, 2], base: before }));
          return (await oq('select dead_parts from public.flock_daily where flock_id = $1 and on_date = $2', [F.s2, day(-1)])).rows[0].dead_parts;
        },
        correct: (v) => JSON.stringify(v) === '[0,2]',
      },
      {
        name: 'save_flock_day بلا حدّ القسم',
        fns: [[SIG.day, [[ANCHOR.dayPartsCheck, '']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DAY, dayParams({ flock: F.t3, on: day(-4), dead: 335, parts: [335, 0, 0] })))?.code,
        correct: (v) => v === 'live_negative',
      },
      {
        name: 'الكاتب الوحيد بلا قاعدة sections_required',
        fns: [[SIG.rebuild, [[ANCHOR.rebuildRule, '    if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.worker, VISIT, visitParams({ flock: F.c, on: day(-3), dead: 2 })))?.code,
        correct: (v) => v === 'sections_required',
      },
      {
        name: 'open_flock بلا التقسيم بالتساوي',
        fns: [[SIG.open, [[ANCHOR.openEven, '    v_counts := null;']]]],
        run: async ({ attempt }) => {
          const f = await fresh(attempt, 2, 101);
          return (await inside(attempt, U.owner, 'select section_counts as v from public.flocks where id = $1', [f.flock]));
        },
        correct: (v) => JSON.stringify(v) === '[51,50]',
      },
      {
        name: 'edit_flock بلا section_counts_required',
        fns: [[SIG.edit, [[ANCHOR.editRequired, '    if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, EDIT, [F.c, day(-10), 1100, uid(), null]))?.code,
        correct: (v) => v === 'section_counts_required',
      },
      {
        name: 'set_hall_sections بلا رفض الوجبة بهلاكاتها',
        fns: [[SIG.sections, [[ANCHOR.sectionsDeaths, '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, SECTIONS_NOW, [H.dead, 2, uid()]))?.code,
        correct: (v) => v === 'sections_after_deaths',
      },
      {
        name: 'set_hall_sections بلا شرط النسخة',
        fns: [[SIG.sections, [[ANCHOR.sectionsStale, '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, SECTIONS, [H.empty, 3, 1, uid()]))?.status,
        correct: (v) => v === 'stale_hall',
      },
      {
        name: 'reopen_flock بلا sections_changed',
        fns: [[SIG.reopen, [[ANCHOR.reopenSections, '  if false then']]]],
        run: async ({ attempt }) => {
          const closeId = uid();
          await inside(attempt, U.owner, CLOSE, [uid(), closeId, F.re, TODAY, 99, await inside(attempt, U.owner, CLOSE_FORM, [F.re])]);
          await inside(attempt, U.owner, SECTIONS_NOW, [H.re, 1, uid()]);
          return (await inside(attempt, U.owner, REOPEN, [closeId, uid()]))?.code ?? 'reopened';
        },
        correct: (v) => v === 'sections_changed',
      },
      {
        name: 'reopen_block بلا مرآة sections_changed',
        fns: [[SIG.block, [[ANCHOR.blockSections, '']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, CLOSE, [uid(), uid(), F.re, TODAY, 99, await inside(attempt, U.owner, CLOSE_FORM, [F.re])]);
          await inside(attempt, U.owner, SECTIONS_NOW, [H.re, 3, uid()]);
          return (await inside(attempt, U.owner, SALES, [F.re]))?.reopen_why;
        },
        correct: (v) => v === 'sections_changed',
      },
      {
        name: 'الملخّص: هلاكات الأقسام أعدادها',
        fns: [[SIG.summary, [[ANCHOR.summaryDead, "'section_dead', f.section_counts);"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DETAIL, [F.s2]))?.flock?.section_dead,
        correct: (v) => JSON.stringify(v) === '[6,5]',
      },
    ];
    const outcomes = [];
    for (const c of CASES) {
      const real = await mutant(db, U.owner, [], (kit) => c.run(kit));
      const broken = await mutant(db, U.owner, c.fns, (kit) => c.run(kit));
      outcomes.push({ name: c.name, real: c.correct(real), caught: !c.correct(broken), shown: JSON.stringify(real), broken: JSON.stringify(broken) });
    }
    t.same(outcomes.filter((o) => !o.real).map((o) => `${o.name}: ${o.shown}`), [], `الطفرات (${CASES.length}): الشفرة الحقيقية بالصحيح في كلّ حالة`);
    t.same(outcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${o.broken}`), [], `الطفرات: ${outcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت`);
  });

  // ── ١٢) ملفّ التراجع يرجّع الأجسام القديمة حرفاً، والهجرة تغيّرها ──────────────────────────────────────────────────────────
  await section('التراجع', async () => {
    const HEADS = [
      ['0036_round_once.sql', 'public.set_flock_dead'], ['0036_round_once.sql', 'public.save_flock_day'], ['0036_round_once.sql', 'private.flock_day_rebuild'],
      ['0036_round_once.sql', 'private.flock_day_json'], ['0036_round_once.sql', 'private.flock_summary'], ['0036_round_once.sql', 'public.flocks_overview'],
      ['0037_kerosene.sql', 'public.hall_sheet'], ['0037_kerosene.sql', 'public.edit_flock'], ['0029_bird_sales_close.sql', 'public.open_flock'],
      ['0029_bird_sales_close.sql', 'public.reopen_flock'], ['0029_bird_sales_close.sql', 'private.reopen_block'],
      ['0037_kerosene.sql', 'public.verify_kerosene'], ['0035_hall_sheet.sql', 'public.verify_hall_sheet'],
    ];
    const rollback = readFileSync(path.join(MIGRATIONS, 'rollback_0038.sql'), 'utf8');
    const migration = readFileSync(path.join(MIGRATIONS, '0038_hall_sections.sql'), 'utf8');
    same(HEADS.filter(([file, head]) => !rollback.includes(bodyOf(file, head))).map(([, head]) => head), [],
      'ملفّ التراجع يرجّع الأجسام الثلاثة عشر كما في آخر هجرة عرّفتها (0029 و0035 و0036 و0037) حرفاً');
    same(HEADS.filter(([file, head]) => migration.includes(bodyOf(file, head)) || !migration.includes(`create or replace function ${head}(`)).map(([, head]) => head), [],
      'والهجرة تعيد تعريفها كلّها بجسم غير جسمها السابق');
    // آخر تعريف: لا هجرة بعد التي أُخذ منها الجسم تعرّفه (لا رجوع إلى جسم قديم).
    const later = HEADS.filter(([file, head]) => {
      const number = Number(file.slice(0, 4));
      for (let n = number + 1; n <= 37; n += 1) {
        const name = MIGRATION_FILES.find((x) => x.startsWith(`${String(n).padStart(4, '0')}_`));
        if (name && readFileSync(path.join(MIGRATIONS, name), 'utf8').includes(`create or replace function ${head}(`)) return true;
      }
      return false;
    });
    same(later.map(([, head]) => head), [], 'وكلّ جسم أُخذ من آخر هجرة عرّفته قبل 0038');
  });

  same(await db.asService(verifyOf), VERIFY_ZERO, 'الثابت صفر في نهاية الملفّ');
  if (process.env.HALL_SECTIONS_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/hall-sections.test.mjs بـHALL_SECTIONS_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات. hall_sheet وجبة لحم بقسمين (27,051 طيراً بالتساوي: 13,526 + 13,525) بهلاكات ثلاثة أيّام (5 = 3 + 2، و4 = 1 + 3 ثمّ تعديل ملاحظتها وحدها، و2 = 2 + 0) ويوم «لا هلاكات» بأقسام أصفار؛ وflocks_overview المنشأة نفسها؛ وset_flock_dead_saved وset_flock_dead_recorded (القسمة الأخرى بالمجموع نفسه)؛ وset_hall_sections_saved (وجبة قائمة بلا هلاكات تُقسم قسمين)، وset_hall_sections_refused (رمزه وتلميحه).`,
      hall_sheet: samples.hall_sheet,
      flocks_overview: samples.flocks_overview,
      set_flock_dead_saved: samples.set_flock_dead_saved,
      set_flock_dead_recorded: samples.set_flock_dead_recorded,
      set_hall_sections_saved: samples.set_hall_sections_saved,
      set_hall_sections_refused: samples.set_hall_sections_refused,
    }, null, 1) + '\n');
  }
}

