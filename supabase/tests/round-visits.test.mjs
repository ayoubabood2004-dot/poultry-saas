// الجولة بزيارات في اليوم (0032، العقد docs/plans/0032/contract-0032.md): flock_visits وsave_flock_visit وsave_flock_day بمعناها القديم وround_visits وحذف
// الفوج والثابت verify_round_visits. منشأة هذا الملفّ وحدها: المعرّفات d3232000 والهواتف 96477032320. البذرة: حقلا لحم (ألف وباء) وحقل بيض، وأفواج
// «قاعة 1» (1,000 طير) و«قاعة 2» (100 طير) في حقل ألف، و«قاعة 1» في حقل باء (500)، و«قاعة البيّاض» (2,000 دجاجة)، و«قاعة 3» للحذف؛ ومدير محصور بحقل باء.
// الفحوص: (١) التحويل داخل معاملة ترجع: التراجع يرفض والزيارات قائمة، ويكمل بلاها، والجولات بجسم 0029 (ماء وحرارة وملاحظة بفراغ وصفر صريح وتعديل)،
// ثمّ إعادة الهجرة: كلّ صفّ يوم زيارة legacy واحدة بقيمه ونسخته وكاتبه، والصفوف والتقارير بأرقامها حرفاً، والثابت صفر، وتراجع ثانٍ بزيارات legacy
// وحدها يكمل؛ (٢) زيارتان تُجمعان (وجهازان بلا stale)؛ (٣) التعديل بنسخة قديمة stale_visit والمحتوى كامل؛ (٤) الإلغاء يطرح وإلغاء الأخيرة يحذف صفّ اليوم،
// والصفّ المعاد لا يرجع بنسخته (ABA)؛ (٥) live_negative على المجموع وبجلستين؛ (٦) البيض؛ (٧) الركن: زيارتان لا تكتب إحداهما فوق الأخرى، وعملية
// save_flock_day كما كانت؛ (٨) save_flock_day بمعناها القديم؛ (٩) القارئ بالنطاق والنوع؛ (١٠) كلّ رمز رفض والمرجع؛ (١١) حذف الفوج؛ (١٢) الثابت يمسك كلّ
// خرق باسمه؛ (١٣) طفرات داخل معاملة صاحب الجداول ترجع: كلّ قاعدة مكسورة يمسكها فحصها. وعيّنات القاعدة الحقيقية للشاشات: ROUND_SAMPLES_OUT=1 يكتب
// scripts/tests/fixtures/round-visits-0032.json.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { race } from './shared.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-visits-0032.json');
const TODAY = '2026-11-17';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const ddmm = (on) => `${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}`;
const id = (n) => `d3232000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477032320${String(n).padStart(2, '0')}`;
/** وقت تسجيل قبل الآن بدقائق (ساعة الخادم الحقيقية، فلا bad_time أيّاً كان يوم تشغيل الحزمة). */
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const DOT = ' \u{B7} ';
const ELLIPSIS = '\u{2026}';

const VISIT = 'select public.save_flock_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const ROUND = 'select public.round_visits($1, $2, $3) as v';
const SIG = {
  rebuild: 'private.flock_day_rebuild(public.flocks, date)',
  visit: 'public.save_flock_visit(uuid, uuid, date, timestamp with time zone, integer, integer, numeric, integer, integer, integer, text, integer, boolean, uuid, boolean)',
  day: 'public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean)',
  del: 'public.delete_flock(uuid, integer, uuid)',
  reader: 'public.round_visits(date, text, uuid)',
  eggs: 'private.flock_eggs_live_check(public.flocks, date)',
};
const VERIFY_ZERO = {
  day_equals_visits: 0, day_without_visits: 0, visits_without_day: 0, visit_hall_mismatch: 0, visit_eggs_on_broiler: 0, visit_versions: 0, legacy_once: 0,
  day_version_bound: 0,
};

/** معاملات save_flock_visit من كائن (الفارغ null، والوقت قبل الآن بساعة افتراضاً). */
const visitParams = (v) => [v.id, v.flock, v.on === undefined ? TODAY : v.on, v.at === undefined ? ago(60) : v.at, v.dead ?? null, v.culled ?? null, v.feed ?? null, v.eggs ?? null,
  v.cracked ?? null, v.broken ?? null, v.note ?? null, v.base ?? null, v.void ?? false, v.ref ?? uid(), v.queued ?? false];
/** معاملات save_flock_day (الماء والحرارة كما في 0012). */
const dayParams = (d) => [d.flock, d.on ?? TODAY, d.dead ?? null, d.culled ?? null, d.feed ?? null, d.water ?? null, d.tmin ?? null, d.tmax ?? null, d.eggs ?? null,
  d.cracked ?? null, d.broken ?? null, d.note ?? null, d.base ?? null, d.ref ?? uid(), d.queued ?? false];

const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);

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
    name: 'مزرعة الزيارات',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['worker', 'hall_worker', ['broiler']],
      ['layerWorker', 'hall_worker', ['layer']],
      ['viewer', 'viewer'],
      ['accountant', 'accountant'],
    ],
  });
  const { users: U, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const code = (result) => (result.ok ? 'ok' : result.code);
  const visit = (user, v) => call(db, user, VISIT, visitParams(v));
  const saveDay = (user, d) => call(db, user, DAY, dayParams(d));
  const rounds = (user, on, kind, flock = null) => call(db, user, ROUND, [on, kind, flock]);
  const dayRow = async (flock, on) => (await db.admin(`select dead, culled, feed_kg::text as feed_kg, water_l::text as water_l, eggs_total, eggs_cracked, eggs_broken,
      note, version from public.flock_daily where flock_id = $1 and on_date = $2`, [flock, on])).rows[0] ?? null;
  const visitsOf = async (flock, on) => (await db.admin(`select id, source, version, voided_at is not null as voided, dead, culled, feed_kg::text as feed_kg, note
      from public.flock_visits where flock_id = $1 and on_date = $2 order by recorded_at, created_at, id`, [flock, on])).rows;
  const verifyOf = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_round_visits()')).rows.map((r) => [r.check_name, r.v]));

  // ── الحقول والقاعات والأفواج ──────────────────────────────────────────────────────────────────────────────────────
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const S = { a: await site('broiler', 'حقل ألف'), b: await site('broiler', 'حقل باء'), l: await site('layer', 'حقل البيض') };
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { a1: await hall(S.a, 'قاعة 1'), a2: await hall(S.a, 'قاعة 2'), a3: await hall(S.a, 'قاعة 3'), b1: await hall(S.b, 'قاعة 1'), l1: await hall(S.l, 'قاعة البيّاض') };
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id(9), phone(9)]);
  const siteMember = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[])', [`0${phone(9).slice(3)}`, 'manager', 'مدير حقل باء', [], [S.b], []]);
  await db.acceptInvite(U.owner, id(9), siteMember);
  U.siteManager = id(9);
  const place = async (hallId, on, count) => (await one(U.manager, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const F = {
    a1: await place(H.a1, day(-10), 1000),
    a2: await place(H.a2, day(-10), 100),
    b1: await place(H.b1, day(-5), 500),
    l1: await place(H.l1, day(-10), 2000),
    a3: await place(H.a3, day(-2), 50),
  };
  const V = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`v${i + 1}`, id(100 + i + 1)]));

  // ── ١) التحويل داخل معاملة ترجع ───────────────────────────────────────────────────────────────────────────────────
  await section('التحويل', async () => {
    const migration = readFileSync(path.join(MIGRATIONS, '0032_round_visits.sql'), 'utf8');
    const rollback = readFileSync(path.join(MIGRATIONS, 'rollback_0032.sql'), 'utf8');
    const body29 = (name) => {
      const text = readFileSync(path.join(MIGRATIONS, '0029_bird_sales_close.sql'), 'utf8');
      const start = text.indexOf(`create or replace function public.${name}(`);
      return text.slice(start, text.indexOf('\n$$;', start) + 4);
    };
    t.ok(rollback.includes(body29('save_flock_day')) && rollback.includes(body29('delete_flock')), 'ملف التراجع يرجّع save_flock_day وdelete_flock كما في 0029 حرفاً');
    const ROWS = `select coalesce(jsonb_agg(to_jsonb(d) order by d.flock_id, d.on_date), '[]'::jsonb) as v from public.flock_daily d where d.org_id = $1`;
    const out = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const r = {};
      const as = async (user, sql, params) => {
        const res = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
        if (!res.ok) throw new Error(`${sql}: ${res.code} ${res.hint}`);
        return res.value;
      };
      // زيارة قائمة توقف التراجع، ثمّ بلا زيارات يكمل.
      await as(U.worker, VISIT, visitParams({ id: id(90), flock: F.a1, dead: 1 }));
      await oq('savepoint refused');
      r.refused = await oq(rollback).then(() => 'completed', (error) => error.message);
      await oq('rollback to savepoint refused');
      await oq('delete from public.flock_visits where true');
      await oq('delete from public.flock_day_rejects where visit_id is not null');
      await oq('delete from public.flock_daily where org_id = $1', [G.org]);
      await oq(rollback);
      r.oldCatalog = (await oq("select to_regclass('public.flock_visits') is null as gone, to_regprocedure('public.round_visits(date, text, uuid)') is null as reader_gone")).rows[0];
      // الجولات بجسم 0029: ماء وحرارة، وملاحظة بفراغ في طرفيها، وتعديل (النسخة 2)، وصفر صريح، وبيض، وملاحظة بخمسمئة حرف.
      const old = (user, d) => as(user, DAY, dayParams(d));
      r.saves = [
        await old(U.worker, { flock: F.a1, on: day(-3), dead: 4, culled: 1, feed: '120.5', water: '300', tmin: '21.5', tmax: '30', note: '  ملاحظة بفراغين  ' }),
        await old(U.manager, { flock: F.a1, on: day(-3), culled: 2, base: 1 }),
        await old(U.worker, { flock: F.a1, on: day(-2), dead: 0 }),
        await old(U.layerWorker, { flock: F.l1, on: day(-3), dead: 3, feed: '200', eggs: 1500, cracked: 10, broken: 5, note: 'جمعتان' }),
        await old(U.manager, { flock: F.a2, on: day(-1), dead: 2, note: 'م'.repeat(500) }),
      ].map((x) => [x.status, x.version]);
      const reports = async () => ({
        day: await as(U.manager, 'select public.halls_day($1) as v', [day(-3)]),
        cycle: await as(U.manager, 'select public.flock_cycle_report($1) as v', [F.a1]),
        detail: await as(U.manager, 'select public.flock_detail($1) as v', [F.l1]),
        overview: await as(U.manager, 'select public.flocks_overview() as v', []),
        history: await as(U.manager, 'select public.halls_history(null) as v', []),
      });
      r.reportsBefore = await reports();
      r.rowsBefore = (await oq(ROWS, [G.org])).rows[0].v;
      await oq(migration);
      r.rowsAfter = (await oq(ROWS, [G.org])).rows[0].v;
      r.reportsAfter = await reports();
      r.legacy = (await oq(`select count(*)::int as days,
          count(*) filter (where n.visits = 1 and v.source = 'legacy' and v.voided_at is null and v.version = d.version and v.recorded_at = d.updated_at
            and v.created_by is not distinct from coalesce(d.updated_by, d.created_by)
            and (v.dead, v.culled, v.feed_kg, v.water_l, v.temp_min, v.temp_max, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)
              is not distinct from (d.dead, d.culled, d.feed_kg, d.water_l, d.temp_min, d.temp_max, d.eggs_total, d.eggs_cracked, d.eggs_broken, d.note))::int as same
        from public.flock_daily d
        join public.flock_visits v on v.org_id = d.org_id and v.flock_id = d.flock_id and v.on_date = d.on_date
        cross join lateral (select count(*) as visits from public.flock_visits w where w.org_id = d.org_id and w.flock_id = d.flock_id and w.on_date = d.on_date) as n
        where d.org_id = $1`, [G.org])).rows[0];
      r.seen = (await as(U.manager, ROUND, [day(-3), 'broiler', null])).flocks.map((f) => f.visits.map((x) => [x.source, x.dead, x.culled, x.feed_kg, x.note, x.version, x.by]));
      r.verify = await verifyOf(oq);
      // تراجع ثانٍ بزيارات legacy وحدها يكمل ولا يمسّ صفوف الأيّام، ثمّ الإعادة.
      r.second = await oq(rollback).then(() => 'completed', (error) => error.message);
      r.rowsSecond = (await oq(ROWS, [G.org])).rows[0].v;
      await oq(migration);
      r.verifyAgain = await verifyOf(oq);
      r.legacyAgain = (await oq("select count(*)::int as n from public.flock_visits where org_id = $1 and source = 'legacy'", [G.org])).rows[0].n;
      return r;
    });
    t.eq(out.refused, 'rollback_blocked', 'التراجع والزيارات قائمة: rollback_blocked');
    same(out.oldCatalog, { gone: true, reader_gone: true }, 'بلا زيارات يكمل التراجع: الجدول والقارئ يسقطان');
    same(out.saves, [['saved', 1], ['saved', 2], ['saved', 1], ['saved', 1], ['saved', 1]], 'الجولات بجسم 0029 المسترجَع');
    t.eq(out.rowsAfter.length, 4, 'أربعة صفوف أيّام في المنشأة قبل الهجرة');
    same(out.rowsAfter, out.rowsBefore, 'الهجرة لا تمسّ صفّ يوم واحد (القيم والنسخة ووقت التعديل والكاتب)');
    same(out.legacy, { days: 4, same: 4 }, 'كلّ صفّ يوم زيارة legacy واحدة بقيمه كلّها (والماء والحرارة والملاحظة بفراغها والصفر) ونسخته ووقته وكاتبه');
    same(out.reportsAfter, out.reportsBefore, 'التقارير بأرقامها بعد التحويل: halls_day وflock_cycle_report وflock_detail وflocks_overview وhalls_history حرفاً');
    same(out.seen, [[['legacy', 4, 2, '120.500', '  ملاحظة بفراغين  ', 2, 'manager']]], 'round_visits يرى زيارة legacy بقيم صفّها ونسخته وكاتبه الأخير');
    same(out.verify, VERIFY_ZERO, 'verify_round_visits صفر بعد التحويل');
    t.eq(out.second, 'completed', 'تراجع ثانٍ بزيارات legacy وحدها يكمل');
    same(out.rowsSecond, out.rowsBefore, 'والتراجع لا يمسّ صفوف الأيّام');
    same([out.verifyAgain, out.legacyAgain], [VERIFY_ZERO, 4], 'وإعادة الهجرة تصنع الزيارات القديمة من جديد');
  });

  // ── ٢) زيارتان تُجمعان، وجهازان بلا stale ─────────────────────────────────────────────────────────────────────────
  await section('الجمع', async () => {
    const first = await visit(U.worker, { id: V.v1, flock: F.a1, at: ago(300), dead: 3, feed: '50', note: '  الصباح  ' });
    t.same([first.ok, first.value?.status, first.value?.visit?.version, first.value?.visit?.note, first.value?.visit?.feed_kg, first.value?.visit?.by, first.value?.visit?.source,
      first.value?.day?.dead, first.value?.day?.feed_kg, first.value?.day?.version], [true, 'saved', 1, 'الصباح', '50.000', 'worker', 'visit', 3, '50', 1],
    'زيارة أولى: نسختها 1 وملاحظتها بلا فراغ، وصفّ اليوم 3 نافق و50 كغم بنسخة 1');
    const second = await visit(U.manager, { id: V.v2, flock: F.a1, at: ago(200), dead: 2, culled: 1, feed: '30.5', note: 'العصر' });
    samples.save_flock_visit_saved = second.value;
    same(second.value?.day, { on_date: TODAY, version: 2, dead: 5, culled: 1, feed_kg: '80.5', water_l: null, temp_min: null, temp_max: null, eggs_total: null,
      eggs_cracked: null, eggs_broken: null, note: `الصباح${DOT}العصر` }, 'جهاز ثانٍ يضيف زيارة لليوم نفسه بلا stale: المجموع 5 نافق و1 مستبعد و80.5 كغم والملاحظتان بترتيبهما');
    const again = await visit(U.manager, { id: V.v2, flock: F.a1, at: ago(200), dead: 2, culled: 1, feed: '30.50', note: 'العصر' });
    t.same([again.value?.status, again.value?.visit?.version, again.value?.day?.version], ['saved', 1, 2], 'الإضافة نفسها بمرجع جديد: حُفظت بلا كتابة');
    const clash = await visit(U.manager, { id: V.v2, flock: F.a1, dead: 9 });
    t.same([clash.value?.status, clash.value?.server?.dead, clash.value?.server?.version], ['stale_visit', 2, 1], 'الإضافة بمعرّف مسجَّل ومحتوى آخر: stale_visit بالزيارة المحفوظة');
    const seen = await rounds(U.manager, TODAY, 'broiler');
    same(seen.value?.flocks?.map((f) => [f.flock_id, f.hall_id, f.visits.map((x) => [x.id, x.dead, x.by])]), [[F.a1, H.a1, [[V.v1, 3, 'worker'], [V.v2, 2, 'manager']]]],
      'round_visits: الفوج بزيارتيه بترتيب تسجيلهما وكاتبيهما');
  });

  // ── ٣) التعديل بنسخة قديمة ───────────────────────────────────────────────────────────────────────────────────────
  await section('التعديل', async () => {
    const edited = await visit(U.worker, { id: V.v1, flock: F.a1, dead: 4, base: 1 });
    t.same([edited.value?.status, edited.value?.visit?.version, edited.value?.visit?.feed_kg, edited.value?.visit?.note, edited.value?.day?.dead,
      edited.value?.day?.feed_kg, edited.value?.day?.note, edited.value?.day?.version], ['saved', 2, null, null, 6, '30.5', 'العصر', 3],
    'التعديل بالمحتوى كاملاً (الفارغ فارغ): العلف والملاحظة فرغا، والمجموع 6 نافق و30.5 كغم، ونسخة اليوم 3');
    const stale = await visit(U.worker, { id: V.v1, flock: F.a1, dead: 7, base: 1 });
    samples.save_flock_visit_stale = stale.value;
    t.same([stale.value?.status, stale.value?.server?.version, stale.value?.server?.dead, (await dayRow(F.a1, TODAY)).version], ['stale_visit', 2, 4, 3],
      'التعديل بنسخة قديمة: stale_visit بالنسخة المحفوظة، ولا كتابة');
    const same2 = await visit(U.worker, { id: V.v1, flock: F.a1, dead: 4, base: 2 });
    t.same([same2.value?.status, same2.value?.visit?.version, same2.value?.day?.version], ['saved', 2, 3], 'التعديل بالمحتوى نفسه: حُفظ بلا كتابة');
    same((await visit(U.worker, { id: id(199), flock: F.a1, dead: 1, base: 1 })).value, { status: 'stale_visit', server: null }, 'تعديل زيارة لا وجود لها: stale_visit بلا زيارة');
    same({ day: code(await visit(U.worker, { id: V.v1, flock: F.a1, on: day(-1), dead: 1 })), flock: code(await visit(U.worker, { id: V.v1, flock: F.b1, dead: 1, base: 2 })) },
      { day: 'visit_moved', flock: 'visit_moved' }, 'معرّف زيارة مسجَّلة ليوم أو فوج آخر: visit_moved');
  });

  // ── ٤) الإلغاء يطرح، وإلغاء الأخيرة يحذف صفّ اليوم، والصفّ المعاد لا يرجع بنسخته ─────────────────────────────────────────
  await section('الإلغاء', async () => {
    const voided = await visit(U.manager, { id: V.v2, flock: F.a1, dead: 2, culled: 1, feed: '30.5', note: 'العصر', base: 1, void: true });
    samples.save_flock_visit_void = voided.value;
    t.same([voided.value?.status, voided.value?.visit?.voided, voided.value?.visit?.version, voided.value?.day?.dead, voided.value?.day?.culled, voided.value?.day?.feed_kg,
      voided.value?.day?.note, voided.value?.day?.version], ['saved', true, 2, 4, 0, null, null, 4], 'الإلغاء يطرح الزيارة من المجموع (4 نافق بلا علف) ونسخة اليوم 4');
    const twice = await visit(U.manager, { id: V.v2, flock: F.a1, base: 1, void: true });
    t.same([twice.value?.status, twice.value?.visit?.version], ['saved', 2], 'إلغاء الملغاة بمرجع جديد: حُفظ بلا كتابة');
    const last = await visit(U.worker, { id: V.v1, flock: F.a1, base: 2, void: true });
    t.same([last.value?.status, last.value?.day, await dayRow(F.a1, TODAY)], ['saved', null, null], 'إلغاء آخر زيارة حيّة يحذف صفّ اليوم');
    same((await rounds(U.manager, TODAY, 'broiler')).value?.flocks, [], 'ولا يبقى الفوج في زيارات اليوم');
    const back = await visit(U.worker, { id: V.v3, flock: F.a1, at: ago(100), dead: 1 });
    t.eq(back.value?.day?.version, 6, 'الصفّ المعاد ينشأ بمجموع نسخ زيارات يومه (3 + 2 + 1 = 6)، لا بـ1 (ABA)');
    const old4 = await saveDay(U.manager, { flock: F.a1, dead: 9, base: 4 });
    const old1 = await saveDay(U.manager, { flock: F.a1, dead: 9, base: 1 });
    t.same([old4.value?.status, old4.value?.server?.version, old1.value?.status], ['stale_day', 6, 'stale_day'], 'عملية save_flock_day قديمة بنسخة رآها جهاز قبل الحذف: stale_day');
  });

  // ── ٥) الحيّ على المجموع، وبجلستين ─────────────────────────────────────────────────────────────────────────────────
  await section('الحيّ', async () => {
    t.eq((await visit(U.worker, { id: V.v4, flock: F.a2, dead: 60 })).value?.status, 'saved', 'قاعة 2 (100 طير): زيارة بـ60 نافقاً');
    const over = await visit(U.manager, { id: id(150), flock: F.a2, dead: 50 });
    t.same([over.code, over.hint], ['live_negative', `بهذا يصير عدد الطيور الحيّة في «قاعة 2» سالباً يوم ${ddmm(TODAY)} (-10). راجع النافق والمستبعد والمباع وفرق العدّ لذلك اليوم وما قبله.`],
      'زيارة ثانية بـ50: المجموع 110 أكثر من الحيّ، فـlive_negative على المجموع');
    t.eq((await dayRow(F.a2, TODAY)).dead, 60, 'والرفض لا يُبقي شيئاً');
    const raced = await race(db, { user: U.worker, sql: VISIT, params: visitParams({ id: id(151), flock: F.a2, on: day(-1), dead: 25 }) },
      { user: U.manager, sql: VISIT, params: visitParams({ id: id(152), flock: F.a2, on: day(-1), dead: 25 }) });
    same([raced.first, raced.state, raced.second], ['ok', 'blocked', 'live_negative'], 'جلستان بزيارتين لقاعة 2: الثانية تنتظر قفل الفوج ثمّ ترى الأولى فـlive_negative (60 + 25 + 25 > 100)');
    const control = await race(db, { user: U.worker, sql: VISIT, params: visitParams({ id: id(153), flock: F.a2, on: day(-1), dead: 10 }), rollback: true },
      { user: U.manager, sql: VISIT, params: visitParams({ id: id(154), flock: F.a2, on: day(-1), dead: 10 }) });
    same([control.first, control.state, control.second], ['ok', 'blocked', 'ok'], 'ضابط: الأولى ترجع فالثانية تكمل بعد انتظارها');
    same(await dayRow(F.a2, day(-1)), { dead: 35, culled: 0, feed_kg: null, water_l: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, version: 2 },
      'أمس في قاعة 2: زيارتان ثبتتا (25 و10)');
  });

  // ── ٦) البيض ───────────────────────────────────────────────────────────────────────────────────────────────────
  await section('البيض', async () => {
    t.eq((await visit(U.layerWorker, { id: V.v5, flock: F.l1, at: ago(240), eggs: 1200, cracked: 10, broken: 5, feed: '100' })).value?.status, 'saved', 'جمعة أولى: 1,200 بيضة');
    const over = await visit(U.layerWorker, { id: id(160), flock: F.l1, eggs: 900 });
    t.same([over.code, over.hint], ['eggs_over_live', `بيض يوم ${ddmm(TODAY)} (2,100) أكثر من الدجاج الحيّ في بدايته (2,000)، والنسبة فوق 100٪ خطأ إدخال. راجع الأرقام.`],
      'جمعة ثانية تجعل بيض اليوم 2,100 من 2,000 دجاجة: eggs_over_live على المجموع');
    const ok = await visit(U.layerWorker, { id: V.v6, flock: F.l1, at: ago(120), eggs: 700 });
    same([ok.value?.day?.eggs_total, ok.value?.day?.eggs_cracked, ok.value?.day?.eggs_broken, ok.value?.day?.feed_kg], [1900, 10, 5, '100'],
      'جمعة ثانية بـ700: البيض 1,900 والمكسور والمشعور والعلف مجموع غير الفارغ');
    same({
      need: code(await visit(U.layerWorker, { id: uid(), flock: F.l1, cracked: 5 })),
      total: code(await visit(U.layerWorker, { id: uid(), flock: F.l1, eggs: 10, cracked: 8, broken: 5 })),
      broiler: code(await visit(U.worker, { id: uid(), flock: F.a1, eggs: 5 })),
    }, { need: 'eggs_need_total', total: 'eggs_over_total', broiler: 'eggs_on_broiler' }, 'البيض في الزيارة: المكسور يحتاج المجموع ولا يزيد عليه، ولا بيض لفوج لحم');
  });

  // ── ٧) الركن ───────────────────────────────────────────────────────────────────────────────────────────────────
  await section('الركن', async () => {
    // 0035: لا حدّ للأيّام السبعة (كلّ أيّام الفوج القائم تُكتب)، فالركن هنا بسبب النطاق: عامل البيّاض يسجّل لفوج اللحم من الطابور.
    const p1 = await visit(U.layerWorker, { id: V.v7, flock: F.a1, on: day(-9), dead: 1, queued: true });
    samples.save_flock_visit_parked = p1.value;
    const p2 = await visit(U.layerWorker, { id: V.v8, flock: F.a1, on: day(-9), dead: 2, queued: true });
    const p1again = await visit(U.layerWorker, { id: V.v7, flock: F.a1, on: day(-9), dead: 5, queued: true });
    same([p1.value, p2.value, p1again.value], Array(3).fill({ status: 'parked', reason: 'out_of_scope' }), 'زيارتان خارج النطاق من الطابور: parked');
    const d1 = await saveDay(U.layerWorker, { flock: F.a1, on: day(-9), dead: 3, queued: true });
    const d2 = await saveDay(U.layerWorker, { flock: F.a1, on: day(-9), dead: 4, queued: true });
    same([d1.value, d2.value], Array(2).fill({ status: 'parked', reason: 'out_of_scope' }), 'وعمليتا save_flock_day لليوم نفسه: parked');
    const rows = (await db.admin(`select visit_id, payload ->> 'dead' as dead from public.flock_day_rejects where flock_id = $1 and on_date = $2 and created_by = $3
      order by visit_id nulls first`, [F.a1, day(-9), U.layerWorker])).rows;
    same(rows, [{ visit_id: null, dead: '4' }, { visit_id: V.v7, dead: '5' }, { visit_id: V.v8, dead: '2' }],
      'الزيارتان المركونتان لا تكتب إحداهما فوق الأخرى (والزيارة نفسها تستبدل ركنها)، وعملية save_flock_day الأحدث تستبدل ركنها كما كانت');
    same({
      direct: code(await call(db, U.worker, VISIT, visitParams({ id: uid(), flock: F.a1, on: day(-9), dead: 1 }), { commit: false })),
      scopeQueued: (await visit(U.layerWorker, { id: uid(), flock: F.a1, dead: 1, queued: true })).value,
      scope: code(await visit(U.layerWorker, { id: uid(), flock: F.a1, dead: 1 })),
    }, { direct: 'ok', scopeQueued: { status: 'parked', reason: 'out_of_scope' }, scope: 'out_of_scope' },
    'بنداء مباشر ترمي ومن الطابور تُركن بسببها، ويوم قبل تسعة أيّام لفوج قائم يُحفظ (0035: بلا حدّ الأيّام السبعة)');
    // الفترة المقفلة والفوج المغلق داخل معاملة ترجع.
    const locked = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const lock = await attempt(U.manager, (q) => q('select public.set_period_lock($1)', [day(-1)]));
      const queued = await attempt(U.worker, async (q) => (await q(VISIT, visitParams({ id: uid(), flock: F.a1, on: day(-1), dead: 1, queued: true }))).rows[0].v);
      const direct = await attempt(U.worker, async (q) => (await q(VISIT, visitParams({ id: uid(), flock: F.a1, on: day(-1), dead: 1 }))).rows[0].v);
      await oq('update public.flocks set status = $2, closed_on = $3 where id = $1', [F.b1, 'closed', TODAY]);
      const closedQueued = await attempt(U.manager, async (q) => (await q(VISIT, visitParams({ id: uid(), flock: F.b1, dead: 1, queued: true }))).rows[0].v);
      const closed = await attempt(U.manager, async (q) => (await q(VISIT, visitParams({ id: uid(), flock: F.b1, dead: 1 }))).rows[0].v);
      return [lock.ok, queued.value, direct.code, closedQueued.value, closed.code];
    });
    same(locked, [true, { status: 'parked', reason: 'period_locked' }, 'period_locked', { status: 'parked', reason: 'flock_closed' }, 'flock_closed'],
      'الفترة المقفلة والفوج المغلق: من الطابور parked بسببهما، وبنداء مباشر يرميان');
  });

  // ── ٨) save_flock_day بمعناها القديم ─────────────────────────────────────────────────────────────────────────────
  await section('save_flock_day', async () => {
    await one(U.manager, VISIT, visitParams({ id: V.v9, flock: F.a1, on: day(-1), at: ago(1500), dead: 2, feed: '10' }));
    await one(U.worker, VISIT, visitParams({ id: V.v10, flock: F.a1, on: day(-1), at: ago(1400), dead: 3, note: 'ب' }));
    t.eq((await dayRow(F.a1, day(-1))).version, 2, 'يوم أمس بزيارتين (النسخة 2)');
    const saved = await saveDay(U.manager, { flock: F.a1, on: day(-1), dead: 7, base: 2 });
    samples.save_flock_day_after = saved.value;
    same(saved.value, { status: 'saved', version: 3 }, 'save_flock_day بنسخة اليوم: saved بالنسخة 3 كما كانت');
    same(await dayRow(F.a1, day(-1)), { dead: 7, culled: 0, feed_kg: '10', water_l: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: 'ب', version: 3 },
      '«اجعل مجموع اليوم كذا»: النافق 7، والفارغ بلا تغيير (العلف 10 والملاحظة)');
    same((await visitsOf(F.a1, day(-1))).map((x) => [x.source, x.version, x.voided, x.dead, x.feed_kg, x.note]),
      [['visit', 2, true, 2, '10', null], ['visit', 2, true, 3, null, 'ب'], ['day_total', 1, false, 7, '10', 'ب']],
      'زيارتا اليوم أُلغيتا (علامة ونسخة) وزيارة day_total واحدة بالمجموع المدموج');
    const stale = await saveDay(U.manager, { flock: F.a1, on: day(-1), dead: 8, base: 2 });
    t.same([stale.value?.status, stale.value?.server?.version, stale.value?.server?.dead], ['stale_day', 3, 7], 'بنسخة قديمة: stale_day بصفّ اليوم');
    same((await saveDay(U.manager, { flock: F.a1, on: day(-1), dead: 7, base: 3 })).value, { status: 'saved', version: 3 }, 'بالقيم نفسها: saved بلا كتابة');
    t.eq((await visitsOf(F.a1, day(-1))).length, 3, 'ولا زيارة جديدة');
    const seen = (await rounds(U.worker, day(-1), 'broiler', F.a1)).value;
    same(seen.flocks[0].visits.map((x) => [x.source, x.dead, x.by]), [['day_total', 7, 'manager']], 'زيارات اليوم: day_total وحدها');
    t.eq((await visit(U.worker, { id: V.v11, flock: F.a1, on: day(-1), at: ago(0), dead: 1 })).value?.day?.dead, 8, 'وزيارة بعدها تنضاف إلى المجموع (8)');
  });

  // ── ٩) القارئ بالنطاق والنوع، والقراءة المباشرة ────────────────────────────────────────────────────────────────────────
  await section('القارئ', async () => {
    t.eq((await visit(U.manager, { id: V.v12, flock: F.b1, dead: 1 })).value?.status, 'saved', 'زيارة لقاعة حقل باء');
    const ids = (r) => (r.ok ? r.value.flocks.map((f) => f.flock_id) : r.code);
    same({
      manager: ids(await rounds(U.manager, null, 'broiler')),
      siteManager: ids(await rounds(U.siteManager, TODAY, 'broiler')),
      layer: ids(await rounds(U.manager, TODAY, 'layer')),
      viewer: ids(await rounds(U.viewer, TODAY, 'broiler')),
      worker: ids(await rounds(U.worker, TODAY, 'broiler')),
      layerWorker: ids(await rounds(U.layerWorker, TODAY, 'broiler')),
      outOfScope: ids(await rounds(U.siteManager, TODAY, 'broiler', F.a1)),
      empty: ids(await rounds(U.manager, day(-5), 'layer', F.l1)),
      otherKind: ids(await rounds(U.manager, TODAY, 'broiler', F.l1)),
      badKind: ids(await rounds(U.manager, TODAY, 'fish')),
      missing: ids(await rounds(U.manager, TODAY, 'broiler', id(998))),
      infinite: ids(await rounds(U.manager, 'infinity', 'broiler')),
    }, {
      manager: [F.a1, F.a2, F.b1], siteManager: [F.b1], layer: [F.l1], viewer: [], worker: [F.a1, F.a2, F.b1], layerWorker: [], outOfScope: 'out_of_scope', empty: [F.l1],
      otherKind: [], badKind: 'bad_kind', missing: 'flock_not_found', infinite: 'date_required',
    }, 'round_visits: أفواج النوع بزيارة حيّة في نطاق القارئ بترتيب الحقل ثمّ القاعة، والفوج المطلوب وحده ولو بلا زيارة، وكلّ رفض');
    const top = (await rounds(U.manager, null, 'broiler')).value;
    t.same([top.on, top.today, top.flocks.find((f) => f.flock_id === F.a1)?.visits.map((x) => x.id)], [TODAY, TODAY, [V.v3]], 'اليوم الفارغ يوم الخادم، والزيارات الحيّة وحدها');
    samples.round_visits_broiler = top;
    samples.round_visits_layer = (await rounds(U.manager, TODAY, 'layer')).value;
    samples.round_visits_flock = (await rounds(U.manager, day(-1), 'broiler', F.a1)).value;
    const counts = async (user) => (await db.asUser(user, (q) => q('select (select count(*) from public.flock_visits where site_id = $1)::int as a, (select count(*) from public.flock_visits where site_id = $2)::int as l', [S.a, S.l]))).rows[0];
    const all = (await db.admin('select (select count(*) from public.flock_visits where site_id = $1)::int as a, (select count(*) from public.flock_visits where site_id = $2)::int as l', [S.a, S.l])).rows[0];
    same({ worker: await counts(U.worker), layerWorker: await counts(U.layerWorker), viewer: await counts(U.viewer) },
      { worker: { a: all.a, l: 0 }, layerWorker: { a: 0, l: all.l }, viewer: { a: 0, l: 0 } }, `القراءة المباشرة بنطاق حقل القاعة (${all.a} زيارة لحم و${all.l} بيض)`);
    t.eq(code(await call(db, U.manager, "insert into public.flock_visits (flock_id, hall_id, site_id, division_id, on_date, recorded_at, source) values ($1, $2, $3, $4, $5, now(), 'visit')",
      [F.a1, H.a1, S.a, D.broiler, TODAY])), '42501:permission denied for table flock_visits', 'لا كتابة مباشرة في الزيارات');
  });

  // ── ١٠) كلّ رمز رفض والمرجع ──────────────────────────────────────────────────────────────────────────────────────
  await section('الرفض', async () => {
    same({
      missing: code(await visit(U.worker, { id: uid(), flock: id(997), dead: 1 })),
      required: code(await visit(U.worker, { id: uid(), flock: F.a1, on: null, dead: 1 })),
      future: code(await visit(U.worker, { id: uid(), flock: F.a1, on: day(1), dead: 1 })),
      visitRequired: code(await visit(U.worker, { id: null, flock: F.a1, dead: 1 })),
      before: code(await visit(U.worker, { id: uid(), flock: F.b1, on: day(-6), dead: 1 })),
      negative: code(await visit(U.worker, { id: uid(), flock: F.a1, dead: -1 })),
      culled: code(await visit(U.worker, { id: uid(), flock: F.a1, culled: 10000001 })),
      feedScale: code(await visit(U.worker, { id: uid(), flock: F.a1, feed: '1.2345' })),
      eggsBig: code(await visit(U.layerWorker, { id: uid(), flock: F.l1, eggs: 10000001 })),
      note: code(await visit(U.worker, { id: uid(), flock: F.a1, dead: 1, note: 'م'.repeat(501) })),
      future_time: code(await visit(U.worker, { id: uid(), flock: F.a1, dead: 1, at: new Date(Date.now() + 3600000).toISOString() })),
      null_time: code(await visit(U.worker, { id: uid(), flock: F.a1, dead: 1, at: null })),
      empty: code(await visit(U.worker, { id: uid(), flock: F.a1, note: '   ' })),
      viewer: code(await visit(U.viewer, { id: uid(), flock: F.a1, dead: 1 })),
      accountant: code(await visit(U.accountant, { id: uid(), flock: F.a1, dead: 1 })),
    }, {
      missing: 'flock_not_found', required: 'date_required', future: 'date_in_future', visitRequired: 'visit_required', before: 'before_placement', negative: 'bad_value',
      culled: 'bad_value', feedScale: 'bad_value', eggsBig: 'bad_value', note: 'bad_note', future_time: 'bad_time', null_time: 'bad_time', empty: 'empty_visit',
      viewer: 'forbidden', accountant: 'forbidden',
    }, 'save_flock_visit: كلّ رمز رفض بنداء مباشر (والملاحظة بالفراغ وحده فارغة)');
    const zero = await visit(U.worker, { id: id(170), flock: F.a2, on: day(-2), dead: 0 });
    t.same([zero.value?.status, zero.value?.day?.dead, zero.value?.day?.version], ['saved', 0, 1], 'الصفر الصريح رقم: زيارة بلا نافق تُحفظ');
    const ref = uid();
    const at = ago(30);
    const firstRef = await visit(U.worker, { id: id(171), flock: F.a2, on: day(-2), dead: 1, ref, at });
    const sameRef = await visit(U.worker, { id: id(171), flock: F.a2, on: day(-2), dead: 1, ref, at });
    const reused = await visit(U.worker, { id: id(171), flock: F.a2, on: day(-2), dead: 2, ref, at });
    t.same([firstRef.value?.status, firstRef.value?.day?.version, sameRef.value, reused.code], ['saved', 2, firstRef.value, 'ref_reused'],
      'المرجع نفسه بالمعاملات نفسها: الجواب نفسه بلا كتابة ثانية؛ وبمعاملات أخرى ref_reused');
  });

  // ── ١١) حذف الفوج ──────────────────────────────────────────────────────────────────────────────────────────────
  await section('حذف الفوج', async () => {
    const version = async () => (await db.admin('select version from public.flocks where id = $1', [F.a3])).rows[0].version;
    await one(U.manager, VISIT, visitParams({ id: id(180), flock: F.a3, dead: 1 }));
    const blocked = await call(db, U.manager, 'select public.delete_flock($1, $2, $3) as v', [F.a3, await version(), uid()]);
    t.same([blocked.code, blocked.hint.includes('جولات يومية')], ['flock_has_records', true], 'زيارة حيّة تمنع حذف الفوج كالجولات');
    await one(U.manager, VISIT, visitParams({ id: id(180), flock: F.a3, base: 1, void: true }));
    const deleted = await call(db, U.manager, 'select public.delete_flock($1, $2, $3) as v', [F.a3, await version(), uid()]);
    const left = (await db.admin('select (select count(*) from public.flock_visits where flock_id = $1)::int as visits, (select count(*) from public.audit_log where table_name = $2 and row_id = $3)::int as audit', [F.a3, 'flock_visits', id(180)])).rows[0];
    same([deleted.value?.deleted, left], [true, { visits: 0, audit: 3 }], 'الزيارة الملغاة وحدها لا تمنع الحذف وتُحذف معه، وسجلّ التدقيق يحفظها (إضافة وإلغاء وحذف)');
  });

  // ── ١٢) الثابت يمسك كلّ خرق باسمه ───────────────────────────────────────────────────────────────────────────────
  await section('الثابت', async () => {
    same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_round_visits صفر (بمفتاح الخادم)');
    await t.rejects(db.asUser(U.owner, verifyOf), 'verify_round_visits ليس للواجهة', /permission denied/);
    const B1 = (await visitsOf(F.b1, TODAY))[0].id;
    const probe = (statements) => db.asOwner(async (oq) => {
      for (const [sql, params = []] of statements) await oq(sql, params);
      return Object.fromEntries(Object.entries(await verifyOf(oq)).filter(([, n]) => n !== 0));
    });
    const PROBES = [
      ['day_equals_visits', [['update public.flock_daily set dead = dead + 1 where flock_id = $1 and on_date = $2', [F.b1, TODAY]]]],
      ['day_without_visits', [['update public.flock_visits set voided_at = now() where flock_id = $1 and on_date = $2', [F.b1, TODAY]]]],
      ['visits_without_day', [['delete from public.flock_daily where flock_id = $1 and on_date = $2', [F.b1, TODAY]]]],
      ['visit_hall_mismatch', [['update public.flock_visits set hall_id = $2, site_id = $3 where id = $1', [B1, H.a1, S.a]]]],
      ['visit_eggs_on_broiler', [['update public.flock_visits set eggs_total = 5 where id = $1', [B1]],
        ['update public.flock_daily set eggs_total = 5 where flock_id = $1 and on_date = $2', [F.b1, TODAY]]]],
      ['visit_versions', [['alter table public.flock_visits drop constraint flock_visits_version_check'], ['update public.flock_visits set version = 0 where id = $1', [V.v11]]]],
      ['legacy_once', [["update public.flock_visits set source = 'legacy' where id = $1", [B1]],
        ["insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, source) values ($1, $2, $3, $4, $5, $6, now(), 'legacy')",
          [G.org, F.b1, H.b1, S.b, D.broiler, TODAY]]]],
      ['day_version_bound', [['update public.flock_daily set version = version + 100 where flock_id = $1 and on_date = $2', [F.b1, TODAY]]]],
    ];
    for (const [check, statements] of PROBES) same(await probe(statements), { [check]: 1 }, `ضابط: verify_round_visits يمسك ${check} وحده`);
  });

  // ── ١٣) الطفرات ──────────────────────────────────────────────────────────────────────────────────────────────────
  await section('الطفرات', async () => {
    /** النداء داخل معاملة الطفرة بهويّة مستخدم: القيمة أو { code, hint }. */
    const inside = async (attempt, user, sql, params) => {
      const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
      return result.ok ? result.value : { code: result.code, hint: result.hint };
    };
    const add = (attempt, user, v) => inside(attempt, user, VISIT, visitParams(v));
    const CASES = [
      {
        name: 'أعداد اليوم مجموع زياراته',
        fns: [[SIG.rebuild, [['sum(v.dead) as dead', 'max(v.dead) as dead']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 2 });
          return (await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 3 }))?.day?.dead;
        },
        correct: (v) => v === 5,
      },
      {
        name: 'الفارغ في كلّ الزيارات null لا صفر',
        fns: [[SIG.rebuild, [['sum(v.feed_kg) as feed_kg', 'coalesce(sum(v.feed_kg), 0) as feed_kg']]]],
        run: async ({ attempt }) => (await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 2 }))?.day,
        correct: (d) => d?.feed_kg === null && d?.dead === 2,
      },
      {
        name: 'الزيارات الحيّة وحدها',
        fns: [[SIG.rebuild, [['and v.on_date = p_on and v.voided_at is null;', 'and v.on_date = p_on;']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: id(301), flock: F.b1, on: day(-2), dead: 2 });
          await add(attempt, U.manager, { id: id(302), flock: F.b1, on: day(-2), dead: 3 });
          return (await add(attempt, U.manager, { id: id(302), flock: F.b1, on: day(-2), base: 1, void: true }))?.day?.dead;
        },
        correct: (v) => v === 2,
      },
      {
        name: 'لا صفّ يوم بلا زيارة حيّة',
        fns: [[SIG.rebuild, [['      delete from public.flock_daily x where x.org_id = d.org_id and x.id = d.id;\n', '']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: id(303), flock: F.b1, on: day(-2), dead: 2 });
          await add(attempt, U.manager, { id: id(303), flock: F.b1, on: day(-2), base: 1, void: true });
          return inside(attempt, U.manager, 'select count(*)::int as v from public.flock_daily where flock_id = $1 and on_date = $2', [F.b1, day(-2)]);
        },
        correct: (v) => v === 0,
      },
      {
        name: 'كلّ زيارة تكبر نسخة اليوم',
        fns: [[SIG.rebuild, [['version = x.version + 1, updated_at', 'version = x.version, updated_at']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 2 });
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 1 });
          return (await inside(attempt, U.manager, DAY, dayParams({ flock: F.b1, on: day(-2), dead: 9, base: 1 })))?.status;
        },
        correct: (v) => v === 'stale_day',
      },
      {
        name: 'الصفّ المعاد لا يرجع بنسخته (ABA)',
        fns: [[SIG.rebuild, [['(select sum(y.version)::int from public.flock_visits y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date = p_on)', '1']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: id(304), flock: F.b1, on: day(-2), dead: 2 });
          await add(attempt, U.manager, { id: id(304), flock: F.b1, on: day(-2), base: 1, void: true });
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 1 });
          return (await inside(attempt, U.manager, DAY, dayParams({ flock: F.b1, on: day(-2), dead: 9, base: 1 })))?.status;
        },
        correct: (v) => v === 'stale_day',
      },
      {
        name: 'الملاحظات بترتيب تسجيل الزيارات',
        fns: [[SIG.rebuild, [['order by v.recorded_at, v.created_at, v.id) filter', 'order by v.id) filter']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: id(310), flock: F.b1, on: day(-2), at: ago(10), dead: 1, note: 'أ' });
          return (await add(attempt, U.manager, { id: id(311), flock: F.b1, on: day(-2), at: ago(20), dead: 1, note: 'ب' }))?.day?.note;
        },
        correct: (v) => v === `ب${DOT}أ`,
      },
      {
        name: 'ملاحظة اليوم تُقصّ عند 500 حرف',
        fns: [[SIG.rebuild, [['when length(s.note) > 500 then', 'when false then']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), at: ago(20), dead: 1, note: 'ق'.repeat(300) });
          return add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), at: ago(10), dead: 1, note: 'ط'.repeat(300) });
        },
        correct: (v) => v?.day?.note?.length === 500 && v.day.note.endsWith(`ط${ELLIPSIS}`) && v.day.note.startsWith('ق'.repeat(300)),
      },
      {
        name: 'مجموع يتجاوز حدّ عمود اليوم bad_value',
        fns: [[SIG.rebuild, [['  if s.dead > 10000000 or s.culled', '  if false and s.dead > 10000000 or s.culled']]]],
        run: async ({ attempt }) => {
          const hallId = await inside(attempt, U.manager, 'insert into public.halls (site_id, name) values ($1, $2) returning id as v', [S.a, 'قاعة الطفرة']);
          const flock = (await inside(attempt, U.manager, 'select public.open_flock($1, $2, 10000000, 0, null, $3) as v', [hallId, day(-1), uid()])).flock_id;
          await add(attempt, U.manager, { id: uid(), flock, dead: 6000000 });
          return add(attempt, U.manager, { id: uid(), flock, dead: 6000000 });
        },
        correct: (v) => v?.code === 'bad_value',
      },
      {
        name: 'البيض على الحيّ بعد بناء اليوم',
        fns: [[SIG.visit, [['  perform private.flock_eggs_live_check(f, p_date);\n', '']]]],
        run: ({ attempt }) => add(attempt, U.layerWorker, { id: uid(), flock: F.l1, on: day(-2), eggs: 2100 }),
        correct: (v) => v?.code === 'eggs_over_live',
      },
      {
        name: 'البيض في الأيّام بعد يوم الزيارة',
        fns: [[SIG.eggs, [['where x.on_date >= p_from and', 'where x.on_date = p_from and']]]],
        run: ({ attempt }) => add(attempt, U.layerWorker, { id: uid(), flock: F.l1, on: day(-1), dead: 200 }),
        correct: (v) => v?.code === 'eggs_over_live' && v.hint.includes(ddmm(TODAY)),
      },
      {
        name: 'الحيّ لا يصير سالباً',
        fns: [[SIG.visit, [['  perform private.flock_live_check(f);\n', '']]]],
        run: ({ attempt }) => add(attempt, U.manager, { id: uid(), flock: F.a2, on: day(-3), dead: 1000 }),
        correct: (v) => v?.code === 'live_negative',
      },
      {
        name: 'شرط نسخة الزيارة',
        fns: [[SIG.visit, [['  elsif v.id is null or v.voided_at is not null or v.version is distinct from p_base_version then', '  elsif v.id is null or v.voided_at is not null then']]]],
        run: async ({ attempt }) => (await add(attempt, U.worker, { id: V.v3, flock: F.a1, dead: 9, base: 0 }))?.status,
        correct: (v) => v === 'stale_visit',
      },
      {
        name: 'إلغاء الملغاة إعادة آمنة',
        fns: [[SIG.visit, [['    if v.id is not null and v.voided_at is not null then\n', '    if false then\n']]]],
        run: async ({ attempt }) => (await add(attempt, U.manager, { id: V.v2, flock: F.a1, base: 1, void: true }))?.status,
        correct: (v) => v === 'saved',
      },
      {
        name: 'الإضافة بالمحتوى نفسه لا تكتب',
        fns: [[SIG.visit, [['      if v.voided_at is null and (v.dead, v.culled', '      if false and (v.dead, v.culled']]]],
        run: async ({ attempt }) => (await add(attempt, U.worker, { id: V.v3, flock: F.a1, dead: 1 }))?.status,
        correct: (v) => v === 'saved',
      },
      {
        name: 'التعديل بالمحتوى نفسه لا يكبر النسخة',
        fns: [[SIG.visit, [['  elsif (v.dead, v.culled, v.feed_kg, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)\n', '  elsif false and (v.dead, v.culled, v.feed_kg, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)\n']]]],
        run: async ({ attempt }) => (await add(attempt, U.worker, { id: V.v3, flock: F.a1, dead: 1, base: 1 }))?.visit?.version,
        correct: (v) => v === 1,
      },
      {
        name: 'visit_moved',
        fns: [[SIG.visit, [['  if v.id is not null and (v.flock_id <> f.id or v.on_date <> p_date) then', '  if false then']]]],
        run: ({ attempt }) => add(attempt, U.worker, { id: V.v3, flock: F.a1, on: day(-1), dead: 1 }),
        correct: (v) => v?.code === 'visit_moved',
      },
      {
        name: 'الملاحظة بلا فراغ في طرفيها',
        fns: [[SIG.visit, [['  v_note text := private.note_text(p_note);', '  v_note text := p_note;']]]],
        run: async ({ attempt }) => (await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 1, note: '  س  ' }))?.visit?.note,
        correct: (v) => v === 'س',
      },
      {
        name: 'empty_visit',
        fns: [[SIG.visit, [['    if p_dead is null and p_culled is null and p_feed_kg is null and p_eggs_total is null and p_eggs_cracked is null and p_eggs_broken is null\n       and v_note is null then', '    if false then']]]],
        run: ({ attempt }) => add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2) }),
        correct: (v) => v?.code === 'empty_visit',
      },
      {
        name: 'bad_time',
        fns: [[SIG.visit, [['    if p_base_version is null and (p_recorded_at is null or', '    if false and (p_recorded_at is null or']]]],
        run: ({ attempt }) => add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 1, at: new Date(Date.now() + 3600000).toISOString() }),
        correct: (v) => v?.code === 'bad_time',
      },
      {
        name: 'eggs_on_broiler',
        fns: [[SIG.visit, [["    if f.kind = 'broiler' and (p_eggs_total", "    if false and (p_eggs_total"]]]],
        run: ({ attempt }) => add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), eggs: 5 }),
        correct: (v) => v?.code === 'eggs_on_broiler',
      },
      {
        name: 'eggs_need_total',
        fns: [[SIG.visit, [['    if (p_eggs_cracked is not null or p_eggs_broken is not null) and p_eggs_total is null then', '    if false then']]]],
        run: ({ attempt }) => add(attempt, U.layerWorker, { id: uid(), flock: F.l1, on: day(-2), cracked: 5 }),
        correct: (v) => v?.code === 'eggs_need_total',
      },
      {
        name: 'eggs_over_total',
        fns: [[SIG.visit, [['    if coalesce(p_eggs_cracked, 0) + coalesce(p_eggs_broken, 0) > coalesce(p_eggs_total, 0) then', '    if false then']]]],
        run: ({ attempt }) => add(attempt, U.layerWorker, { id: uid(), flock: F.l1, on: day(-2), eggs: 10, cracked: 8, broken: 5 }),
        correct: (v) => v?.code === 'eggs_over_total',
      },
      {
        name: 'bad_value للعلف',
        fns: [[SIG.visit, [["    if p_feed_kg is not null and not (abs(p_feed_kg) < 'Infinity'", "    if false and not (abs(p_feed_kg) < 'Infinity'"]]]],
        run: ({ attempt }) => add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), feed: '1.2345' }),
        correct: (v) => v?.code === 'bad_value',
      },
      {
        name: 'bad_note',
        fns: [[SIG.visit, [['    if length(v_note) > 500 then', '    if false then']]]],
        run: ({ attempt }) => add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 1, note: 'م'.repeat(501) }),
        correct: (v) => v?.code === 'bad_note',
      },
      {
        name: 'فعل الجولة flock_day.save',
        fns: [[SIG.visit, [["  perform private.require('flock_day.save');", "  perform private.require('read');"]]]],
        run: ({ attempt }) => add(attempt, U.accountant, { id: uid(), flock: F.b1, on: day(-2), dead: 1 }),
        correct: (v) => v?.code === 'forbidden',
      },
      {
        name: 'الزيارة المركونة بمعرّفها لا تكتب فوق أخرى',
        fns: [[SIG.visit, [['v_payload, v_park, auth.uid(), p_visit)\n    on conflict (org_id, visit_id) where visit_id is not null do update',
          'v_payload, v_park, auth.uid(), null)\n    on conflict (org_id, created_by, flock_id, on_date) where visit_id is null do update']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.layerWorker, { id: uid(), flock: F.b1, on: day(-12), dead: 1, queued: true });
          await add(attempt, U.layerWorker, { id: uid(), flock: F.b1, on: day(-12), dead: 2, queued: true });
          return inside(attempt, U.manager, 'select count(*)::int as v from public.flock_day_rejects where flock_id = $1 and on_date = $2', [F.b1, day(-12)]);
        },
        correct: (v) => v === 2,
      },
      {
        name: 'save_flock_day تلغي زيارات اليوم الحيّة',
        fns: [[SIG.day, [['and x.on_date = p_date and x.voided_at is null;\n  insert into public.flock_visits', 'and false;\n  insert into public.flock_visits']]]],
        run: async ({ attempt }) => {
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-3), dead: 2 });
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-3), dead: 3 });
          await inside(attempt, U.manager, DAY, dayParams({ flock: F.b1, on: day(-3), dead: 7, base: 2 }));
          return inside(attempt, U.manager, 'select dead as v from public.flock_daily where flock_id = $1 and on_date = $2', [F.b1, day(-3)]);
        },
        correct: (v) => v === 7,
      },
      {
        name: 'حذف الفوج يحذف زياراته الملغاة',
        fns: [[SIG.del, [['  delete from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.voided_at is not null;\n', '']]]],
        run: async ({ attempt }) => {
          const hallId = await inside(attempt, U.manager, 'insert into public.halls (site_id, name) values ($1, $2) returning id as v', [S.a, 'قاعة الحذف']);
          const flock = (await inside(attempt, U.manager, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [hallId, day(-1), uid()])).flock_id;
          await add(attempt, U.manager, { id: id(320), flock, dead: 1 });
          await add(attempt, U.manager, { id: id(320), flock, base: 1, void: true });
          return (await inside(attempt, U.manager, 'select public.delete_flock($1, 1, $2) as v', [flock, uid()]))?.deleted;
        },
        correct: (v) => v === true,
      },
      {
        name: 'حذف الفوج: الزيارة الحيّة تمنعه باسمها',
        fns: [[SIG.del, [['      or exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.voided_at is null)\n', '']]]],
        run: async ({ oq, attempt }) => {
          const hallId = await inside(attempt, U.manager, 'insert into public.halls (site_id, name) values ($1, $2) returning id as v', [S.a, 'قاعة الحذف']);
          const flock = (await inside(attempt, U.manager, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [hallId, day(-1), uid()])).flock_id;
          await add(attempt, U.manager, { id: id(321), flock, dead: 1 });
          await oq('delete from public.flock_daily where flock_id = $1', [flock]);
          return inside(attempt, U.manager, 'select public.delete_flock($1, 1, $2) as v', [flock, uid()]);
        },
        correct: (v) => v?.code === 'flock_has_records' && v.hint.includes('جولات يومية'),
      },
      {
        name: 'القارئ بنطاق القارئ',
        fns: [[SIG.reader, [['where fl.org_id = v_org and fl.kind = p_kind and public.in_scope_site(fl.site_id)', 'where fl.org_id = v_org and fl.kind = p_kind']]]],
        run: async ({ attempt }) => (await inside(attempt, U.siteManager, ROUND, [TODAY, 'broiler', null]))?.flocks?.map((f) => f.flock_id),
        correct: (v) => JSON.stringify(v) === JSON.stringify([F.b1]),
      },
      {
        name: 'القارئ: الزيارات الحيّة وحدها',
        fns: [[SIG.reader, [["v.on_date = v_on and v.voided_at is null), '[]'::jsonb) as visits", "v.on_date = v_on), '[]'::jsonb) as visits"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.manager, ROUND, [TODAY, 'broiler', F.a1]))?.flocks?.[0]?.visits?.length,
        correct: (v) => v === 1,
      },
      {
        name: 'القارئ: النوع',
        fns: [[SIG.reader, [['and fl.kind = p_kind and', 'and']]]],
        run: async ({ attempt }) => (await inside(attempt, U.manager, ROUND, [TODAY, 'layer', null]))?.flocks?.map((f) => f.flock_id),
        correct: (v) => JSON.stringify(v) === JSON.stringify([F.l1]),
      },
      {
        name: 'الثابت يمسك مجموعاً مكسوراً',
        fns: [[SIG.rebuild, [['sum(v.culled) as culled', 'sum(v.culled) + 1 as culled']]]],
        run: async ({ oq, attempt }) => {
          await add(attempt, U.manager, { id: uid(), flock: F.b1, on: day(-2), dead: 1 });
          return verifyOf(oq);
        },
        correct: (v) => v?.day_equals_visits === 0,
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

  same(await db.asService(verifyOf), VERIFY_ZERO, 'الثابت صفر في نهاية الملفّ');
  if (process.env.ROUND_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/round-visits.test.mjs بـROUND_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY}؛ أوقات التسجيل من ساعة الخادم وقت التشغيل)؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات.`,
      round_visits_broiler: samples.round_visits_broiler,
      round_visits_layer: samples.round_visits_layer,
      round_visits_flock: samples.round_visits_flock,
      save_flock_visit_saved: samples.save_flock_visit_saved,
      save_flock_visit_parked: samples.save_flock_visit_parked,
      save_flock_visit_stale: samples.save_flock_visit_stale,
      save_flock_visit_void: samples.save_flock_visit_void,
      save_flock_day_after: samples.save_flock_day_after,
    }, null, 1) + '\n');
  }
}
