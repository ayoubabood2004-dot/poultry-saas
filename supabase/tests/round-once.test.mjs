// الجولة: الهلاكات مرّة في اليوم والغاز يُضاف (0036، العقد docs/plans/0036/contract-0036.md «الجزء د»، وقرارات علامة الهلاكات بعد مراجعة القاعدة في
// DECISIONS 2026-11-24): علامة الزيارة flock_visits.dead_entry ومن يضعها (set_flock_dead دائماً، وsave_flock_visit حين يبقى نافق أو مستبعد، وزيارة
// day_total من save_flock_day بهلاكات النداء أو منقولةً بلاها؛ لا المركون ولا stale ولا المرفوض)، وflock_daily.dead_entered مشتقّةً منها، والملء،
// وset_flock_dead (مرّة: saved أو dead_recorded، ومن الطابور parked، وجلستان حقيقيتان لليوم نفسه)، وadd_flock_gas (الإضافة والحدّ والركن والمرجع
// وجلستان)، وقارئا الجولة (flock_summary وflocks_overview) للّاحم والبيّاض، والثابت verify_round_once، وطفرات كلّ قاعدة داخل معاملة صاحب الجداول ترجع،
// والأجسام القبلية حرفاً من ملفّات هجراتها (0035 و0032 و0029 و0012) تفشل كلّها، وضابطا قفل صفّ الوجبة بجلستين على جسم مثبَّت بلا القفل (يعود
// حرفاً)، وملفّ التراجع حرفاً ورفضه للزيارة المركونة بسبب dead_recorded. (مراجعة 0036 وصافي العلف في round-once-review.test.)
// منشأة هذا الملفّ: المعرّفات d3636000 والهواتف 96477036360 (ومنشأة ثانية بالمعرّفات d3636000-…-0000000009xx والهواتف 9647703636090+).
// البذرة: حقل لحم بثلاث قاعات — «قاعة 1» (1,000 طير قبل 20 يوماً)، و«قاعة 2» (500 قبل عشرة أيّام)، و«قاعة 3» (300 قبل 15 يوماً تُغلق قبل يومين) — وحقل
// بيض بقاعة (2,000 قبل عشرة أيّام)؛ وأعلاف في «رصيد العلف» ومخزن علف ثانٍ، وذرة ودواء.
// وعيّنات القاعدة الحقيقية للشاشات: ROUND_ONCE_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/round-once-0036.json.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { race } from './shared.mjs';
import { postedOpening } from './stock-kit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-once-0036.json');
const TODAY = '2026-11-24';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const ddmm = (on) => `${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}`;
const id = (n) => `d3636000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477036360${String(n).padStart(2, '0')}`;
/** وقت تسجيل قبل الآن بدقائق (ساعة الخادم الحقيقية، فلا bad_time أيّاً كان يوم تشغيل الحزمة). */
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
/** md5(نصّ)::uuid كما يحسبه بوستغريس (المعرّف المشتقّ للمركون). */
const md5uuid = (text) => {
  const h = createHash('md5').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const DEAD = 'select public.set_flock_dead($1, $2, $3, $4, $5) as v';
const ADD = 'select public.add_flock_gas($1, $2, $3, $4, $5) as v';
const GAS = 'select public.set_flock_gas($1, $2, $3, $4, $5, $6) as v';
const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const VISIT = 'select public.save_flock_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const SEND = 'select public.send_flock_feed($1, $2, $3, $4, $5, $6, $7) as v';
const OVERVIEW = 'select public.flocks_overview() as v';
const DETAIL = 'select public.flock_detail($1) as v';
const SHEET = 'select public.hall_sheet($1) as v';
const SIG = {
  dead: 'public.set_flock_dead(uuid, date, integer, uuid, boolean)',
  add: 'public.add_flock_gas(uuid, date, integer, uuid, boolean)',
  day: 'public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean)',
  visit: 'public.save_flock_visit(uuid, uuid, date, timestamp with time zone, integer, integer, numeric, integer, integer, integer, text, integer, boolean, uuid, boolean)',
  dayJson: 'private.flock_day_json(public.flock_daily)',
  rebuild: 'private.flock_day_rebuild(public.flocks, date)',
  summary: 'private.flock_summary(public.flocks)',
  overview: 'public.flocks_overview()',
};
const VERIFY_ZERO = { dead_entered_flag: 0, dead_entered_derived: 0, dead_entry_visits: 0, gas_cap: 0 };

const deadParams = (d) => [d.flock, d.on === undefined ? TODAY : d.on, d.n === undefined ? null : d.n, d.ref ?? uid(), d.queued ?? false];
const addParams = (g) => [g.flock, g.on === undefined ? TODAY : g.on, g.n === undefined ? null : g.n, g.ref ?? uid(), g.queued ?? false];
const gasParams = (g) => [g.flock, g.on === undefined ? TODAY : g.on, g.n ?? null, g.base ?? null, g.ref ?? uid(), g.queued ?? false];
const dayParams = (d) => [d.flock, d.on === undefined ? TODAY : d.on, d.dead ?? null, d.culled ?? null, d.feed ?? null, null, null, null, d.eggs ?? null, null, null,
  d.note ?? null, d.base ?? null, d.ref ?? uid(), d.queued ?? false];
const visitParams = (v) => [v.id ?? uid(), v.flock, v.on === undefined ? TODAY : v.on, v.at ?? ago(60), v.dead ?? null, v.culled ?? null, v.feed ?? null, v.eggs ?? null,
  null, null, v.note ?? null, v.base ?? null, v.void ?? false, v.ref ?? uid(), v.queued ?? false];
const sendParams = (s) => [s.ref ?? uid(), s.issue ?? uid(), s.line ?? uid(), s.flock, s.item, s.qty, s.on === undefined ? TODAY : s.on];

/** جسم دالّة كما في ملفّ هجرتها (من «create or replace function» حتى «$$;»). */
const bodyOf = (file, head) => {
  const text = readFileSync(path.join(MIGRATIONS, file), 'utf8');
  const start = text.indexOf(`create or replace function ${head}(`);
  return text.slice(start, text.indexOf('\n$$;', start) + 4);
};

/** صفّ اليوم كما يرجعه flock_day_json (0036: ومعه dead_entered)، بالفارغ لما لم يُذكر. */
const dayJson = (o) => ({ on_date: null, version: null, dead: 0, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null,
  eggs_broken: null, note: null, dead_entered: false, ...o });

const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);

/** محلّلات الشاشات الحقيقية لأجوبة الحقول (الواجهة المنشورة تقرأ القارئين بعد الهجرة: المفاتيح الجديدة لا تكسرها). */
async function screensParser() {
  const result = await build({
    stdin: { contents: "export { parseOverview, parseDetail, parseDayRow, visitAnswer, gasAnswer } from './src/lib/repo/flocks.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

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
  const ui = await screensParser();
  const G = await makeOrg(db, {
    name: 'مزرعة الجولة',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['worker', 'hall_worker', ['broiler']],
      ['keeper', 'storekeeper'],
      ['viewer', 'viewer'],
      ['accountant', 'accountant'],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const code = (result) => (result.ok ? 'ok' : result.code);
  const dead = (user, d, options) => call(db, user, DEAD, deadParams(d), options);
  const add = (user, g, options) => call(db, user, ADD, addParams(g), options);
  const gas = (user, g) => call(db, user, GAS, gasParams(g));
  const saveDay = (user, d) => call(db, user, DAY, dayParams(d));
  const visit = (user, v) => call(db, user, VISIT, visitParams(v));
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  const dayRow = async (flock, on) => (await db.admin('select dead, culled, version, dead_entered, note from public.flock_daily where flock_id = $1 and on_date = $2', [flock, on])).rows[0] ?? null;
  const visitsOf = async (flock, on) => (await db.admin(`select source, dead, culled, feed_kg::text as feed_kg, eggs_total, note, version, voided_at is not null as voided
      from public.flock_visits where flock_id = $1 and on_date = $2 order by recorded_at, created_at, id`, [flock, on])).rows;
  const gasRow = async (flock, on) => (await db.admin('select cylinders, version::int as version from public.flock_day_gas where flock_id = $1 and on_date = $2', [flock, on])).rows[0] ?? null;
  const rejectsOf = async (flock, on) => (await db.admin(`select payload, reason, version, visit_id::text as visit_id, created_by::text as by
      from public.flock_day_rejects where flock_id = $1 and on_date = $2`, [flock, on])).rows
    .sort((a, b) => JSON.stringify([a.visit_id, a.payload]).localeCompare(JSON.stringify([b.visit_id, b.payload])));
  const verifyOf = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_round_once()')).rows.map((r) => [r.check_name, r.v]));
  /** طفرة مثبَّتة لجلستين حقيقيتين (الجلستان لا تريان معاملة الطفرة)، ترجع بجسمها الأصليّ حرفاً في finally (صورة الكتالوج آخر الحزمة). */
  const committedMutation = async (signature, pairs, fn) => {
    const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [signature])).rows[0].d;
    let broken = original;
    for (const [from, to] of pairs) {
      if (broken.split(from).length !== 2) throw new Error(`طفرة ${signature}: المرساة ليست مرّة واحدة: ${from}`);
      broken = broken.split(from).join(to);
    }
    await db.asOwner((oq) => oq(broken), null, { commit: true });
    try {
      return await fn();
    } finally {
      await db.asOwner((oq) => oq(original), null, { commit: true });
    }
  };

  // ── البذرة ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const S = { a: await site('broiler', 'حقل الجولة'), l: await site('layer', 'حقل البيض') };
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { a: await hall(S.a, 'قاعة 1'), b: await hall(S.a, 'قاعة 2'), c: await hall(S.a, 'قاعة 3'), l: await hall(S.l, 'قاعة البيّاض') };
  const place = async (hallId, on, count) => (await one(U.owner, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const F = { a: await place(H.a, day(-20), 1000), b: await place(H.b, day(-10), 500), c: await place(H.c, day(-15), 300), l: await place(H.l, day(-10), 2000) };
  const item = (name, kind, unit = 'kg') => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = {
    starter: await item('علف بادئ', 'feed'),
    finisher: await item('علف ناهي', 'feed'),
    empty: await item('علف بلا رصيد', 'feed'),
    corn: await item('ذرة صفراء', 'raw'),
    vitamin: await item('فيتامين', 'medicine'),
  };
  const unit = (itemId, label, factor, isDefault) =>
    one(U.owner, 'insert into public.item_units (item_id, label, factor_to_base, is_default) values ($1, $2, $3, $4) returning id', [itemId, label, factor, isDefault]);
  const units = {
    starter: await unit(I.starter, 'كيس 50 كغم', 50, true),
    finisher25: await unit(I.finisher, 'كيس 25 كغم', 25, true),
    finisher50: await unit(I.finisher, 'كيس 50 كغم', 50, false),
    finisherOld: await unit(I.finisher, 'كيس قديم', 40, false),
  };
  await one(U.owner, 'update public.item_units set archived_at = now() where id = $1 returning id', [units.finisherOld]);
  await postedOpening(db, U.owner, W.feed, day(-5), [{ item: I.starter, qty: 2000, value: '1000000.00' }, { item: I.finisher, qty: 1000, value: '600000.00' }]);
  await postedOpening(db, U.owner, W.raw, day(-5), [{ item: I.corn, qty: 500, value: '200000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-5), [{ item: I.vitamin, qty: 10, value: '50000.00' }]);
  const W2 = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) select division_id, site_id, 'مخزن علف ثانٍ', 'feed' from public.warehouses where id = $1 returning id", [W.feed]);
  await postedOpening(db, U.owner, W2, day(-5), [{ item: I.finisher, qty: 1500, value: '900000.00' }]);
  // «قاعة 3»: غاز يوم إغلاقها ثمّ تُغلق قبل يومين (300 حيّة).
  await db.setToday(day(-2), async () => {
    await one(U.owner, ADD, addParams({ flock: F.c, on: day(-2), n: 4 }));
    const plan = await one(U.owner, "select public.flock_close_form($1) ->> 'plan' as v", [F.c]);
    await one(U.owner, "select public.close_flock($1, $2, $3, $4, 300, 0, '[]'::jsonb, 'بيعت خارج النظام', '[]'::jsonb, null, $5) as v", [uid(), uid(), F.c, day(-2), plan]);
  });

  same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_round_once صفر بعد البذرة');

  // ── ١) الهلاكات مرّة: نداء مباشر ──────────────────────────────────────────────────────────────────────────────────
  await section('الهلاكات مرّة', async () => {
    const ref1 = uid();
    const first = await dead(U.worker, { flock: F.a, on: day(-1), n: 7, ref: ref1 });
    same(first.value, { status: 'saved', day: dayJson({ on_date: day(-1), version: 1, dead: 7, dead_entered: true }) },
      'يوم بلا هلاكات: saved بصفّ اليوم (النافق 7 والعلامة)');
    samples.set_flock_dead_saved = first.value;
    same(await visitsOf(F.a, day(-1)), [{ source: 'visit', dead: 7, culled: 0, feed_kg: null, eggs_total: null, note: null, version: 1, voided: false }],
      'زيارة حيّة واحدة بالنافق وحده (والمستبعد صفر والباقي فارغ)');
    same((await dead(U.worker, { flock: F.a, on: day(-1), n: 7, ref: ref1 })).value, first.value, 'الإعادة بالمرجع نفسه = الجواب الأوّل');
    same(code(await dead(U.worker, { flock: F.a, on: day(-1), n: 8, ref: ref1 })), 'ref_reused', 'المرجع نفسه بقيمة أخرى ref_reused');
    same((await dead(U.manager, { flock: F.a, on: day(-1), n: 7 })).value, first.value, 'القيمة نفسها بمرجع جديد: saved باليوم كما هو بلا كتابة');
    const recorded = await dead(U.manager, { flock: F.a, on: day(-1), n: 9 });
    same(recorded.value, { status: 'dead_recorded', day: first.value.day }, 'قيمة أخرى: dead_recorded باليوم كما هو (لا خطأ)');
    samples.set_flock_dead_recorded = recorded.value;
    same([await dayRow(F.a, day(-1)), (await visitsOf(F.a, day(-1))).length], [{ dead: 7, culled: 0, version: 1, dead_entered: true, note: null }, 1],
      'لا يُضاف شيء إلى هلاكات مسجّلة ولا تكبر النسخة');

    // يوم له صفّ بلا هلاكات (ملاحظة وحدها): الهلاكات تُكتب فوقه وتُعلَّم.
    t.eq((await saveDay(U.owner, { flock: F.a, on: day(-2), note: 'جولة بلا هلاكات' })).value?.status, 'saved', 'يوم بملاحظة وحدها');
    same(await dayRow(F.a, day(-2)), { dead: 0, culled: 0, version: 1, dead_entered: false, note: 'جولة بلا هلاكات' }, 'الملاحظة وحدها لا تعلّم اليوم');
    same((await dead(U.owner, { flock: F.a, on: day(-2), n: 4 })).value, { status: 'saved', day: dayJson({ on_date: day(-2), version: 2, dead: 4, note: 'جولة بلا هلاكات', dead_entered: true }) },
      'يوم بصفّ بلا هلاكات: الهلاكات تُسجَّل والصفّ بنسخة أكبر والعلامة');
    same((await visitsOf(F.a, day(-2))).map((v) => [v.source, v.dead, v.note]), [['day_total', 0, 'جولة بلا هلاكات'], ['visit', 4, null]], 'زيارة الهلاكات بجانب الملاحظة');

    // الصفر الصريح تسجيل.
    same((await dead(U.owner, { flock: F.a, on: day(-3), n: 0 })).value, { status: 'saved', day: dayJson({ on_date: day(-3), version: 1, dead: 0, dead_entered: true }) },
      'هلاكات صفر صريحة: تُسجَّل وتُعلَّم');
    same([(await dead(U.worker, { flock: F.a, on: day(-3), n: 5 })).value?.status, (await dead(U.worker, { flock: F.a, on: day(-3), n: 0 })).value?.status],
      ['dead_recorded', 'saved'], 'بعد الصفر: قيمة أخرى dead_recorded والصفر saved');
    same([await dayRow(F.a, day(-3)), (await visitsOf(F.a, day(-3))).length], [{ dead: 0, culled: 0, version: 1, dead_entered: true, note: null }, 1], 'واليوم صفر كما هو');

    // من الطابور لوجبة قائمة: كالنداء المباشر.
    same((await dead(U.owner, { flock: F.a, on: day(-4), n: 2, queued: true })).value?.day?.dead, 2, 'من الطابور لوجبة قائمة: saved');

    same({
      none: code(await dead(U.owner, { flock: F.a, on: day(-8), n: null })),
      negative: code(await dead(U.owner, { flock: F.a, on: day(-8), n: -1 })),
      over: code(await dead(U.owner, { flock: F.a, on: day(-8), n: 10000001 })),
      future: code(await dead(U.owner, { flock: F.a, on: day(1), n: 1 })),
      futureQueued: code(await dead(U.owner, { flock: F.a, on: day(1), n: 1, queued: true })),
      before: code(await dead(U.owner, { flock: F.a, on: day(-21), n: 1 })),
      required: code(await dead(U.owner, { flock: F.a, on: null, n: 1 })),
      infinite: code(await dead(U.owner, { flock: F.a, on: 'infinity', n: 1 })),
      missing: code(await dead(U.owner, { flock: id(999), on: day(-8), n: 1 })),
      missingQueued: code(await dead(U.owner, { flock: id(999), on: day(-8), n: 1, queued: true })),
      closed: code(await dead(U.owner, { flock: F.c, on: day(-5), n: 1 })),
    }, {
      none: 'bad_value', negative: 'bad_value', over: 'bad_value', future: 'date_in_future', futureQueued: 'date_in_future', before: 'before_placement', required: 'date_required',
      infinite: 'date_required', missing: 'flock_not_found', missingQueued: 'flock_not_found', closed: 'flock_closed',
    }, 'set_flock_dead: كلّ رمز رفض بنداء مباشر (ومن الطابور لما لا يُركن)');
    t.eq(await dayRow(F.a, day(-8)), null, 'ولا صفّ من رفض');
    const hints = {
      bad: (await dead(U.owner, { flock: F.a, on: day(-8), n: 10000001 })).hint,
      future: (await dead(U.owner, { flock: F.a, on: day(1), n: 1 })).hint,
      closed: (await dead(U.owner, { flock: F.c, on: day(-5), n: 1 })).hint,
    };
    t.ok(hints.bad.includes('10,000,000') && hints.future.includes(ddmm(day(1))) && hints.future.includes(ddmm(TODAY)) && hints.closed.includes('قاعة 3'),
      `التلميحات تسمّي الحدّ واليومين والقاعة (${JSON.stringify(hints)})`);

    // الحيّ لا يصير سالباً، والرفض لا يُبقي شيئاً؛ والحيّ صفراً بالضبط مقبول.
    const over = await dead(U.owner, { flock: F.b, on: day(-1), n: 501 });
    same([code(over), await dayRow(F.b, day(-1)), await visitsOf(F.b, day(-1))], ['live_negative', null, []], 'هلاكات فوق الحيّ: live_negative ولا يبقى صفّ ولا زيارة');
    t.ok(over.hint.includes('قاعة 2'), `تلميح live_negative يسمّي القاعة (${over.hint})`);
    t.eq((await dead(U.owner, { flock: F.b, on: day(-1), n: 500 }, { commit: false })).value?.status, 'saved', 'ضابط: الهلاكات = الحيّ بالضبط مقبولة (بمعاملة ترجع)');

    // البيّاض: هلاكات تُنقص حيّ يوم بعدها سجّل بيضاً فوقه eggs_over_live، ولا يبقى شيء.
    t.eq((await visit(U.owner, { flock: F.l, on: day(-1), eggs: 1990 })).value?.status, 'saved', 'بيض أمس 1,990 (الحيّ أوّله 2,000)');
    const eggs = await dead(U.owner, { flock: F.l, on: day(-2), n: 20 });
    same([code(eggs), await dayRow(F.l, day(-2))], ['eggs_over_live', null], 'هلاكات قبل يوم بيض تجعل بيضه فوق حيّه: eggs_over_live ولا صفّ');
    t.ok(eggs.hint.includes('1,990') && eggs.hint.includes('1,980'), `تلميح eggs_over_live يسمّي البيض والحيّ (${eggs.hint})`);
    t.eq((await dead(U.owner, { flock: F.l, on: day(-2), n: 10 })).value?.status, 'saved', 'ضابط: هلاكات تُبقي البيض = الحيّ بالضبط مقبولة');

    // 0034: كلّ عضو فعّال كالمالك (بمعاملة ترجع).
    const roles = {};
    for (const role of ['worker', 'keeper', 'viewer', 'accountant']) roles[role] = (await dead(U[role], { flock: F.b, on: day(-5), n: 1 }, { commit: false })).value?.status;
    same(roles, { worker: 'saved', keeper: 'saved', viewer: 'saved', accountant: 'saved' }, 'كلّ عضو يسجّل الهلاكات (0034)');
  });

  // ── ٢) من الطابور: الركن ──────────────────────────────────────────────────────────────────────────────────────────
  const parkedRefs = {};
  await section('الركن من الطابور', async () => {
    const ref = uid();
    const parked = await dead(U.owner, { flock: F.c, on: day(-5), n: 3, queued: true, ref });
    same(parked.value, { status: 'parked', reason: 'flock_closed' }, 'هلاكات لوجبة مغلقة من الطابور: parked');
    samples.set_flock_dead_parked = parked.value;
    same((await dead(U.owner, { flock: F.c, on: day(-5), n: 3, queued: true, ref })).value, parked.value, 'الإعادة بالمرجع نفسه = parked نفسه');
    const key = md5uuid(`dead:${U.owner}:${F.c}:${day(-5)}`);
    same(await rejectsOf(F.c, day(-5)), [{ payload: { dead: 3 }, reason: 'flock_closed', version: 1, visit_id: key, by: U.owner }],
      'المركون: payload {"dead": 3} بمعرّف مشتقّ من الكاتب والوجبة واليوم');
    same((await dead(U.owner, { flock: F.c, on: day(-5), n: 4, queued: true })).value, { status: 'parked', reason: 'flock_closed' }, 'هلاكات أحدث لليوم نفسه');
    same((await rejectsOf(F.c, day(-5))).map((r) => [r.payload, r.version, r.visit_id]), [[{ dead: 4 }, 2, key]], 'الأحدث يستبدل الأقدم للكاتب واليوم بنسخة أكبر');
    // ومعه في اليوم نفسه: كاتب آخر، وجولة save_flock_day، وغاز set_flock_gas، وإضافتا غاز — كلّ واحد صفّه.
    await dead(U.manager, { flock: F.c, on: day(-5), n: 5, queued: true });
    await saveDay(U.owner, { flock: F.c, on: day(-5), dead: 6, queued: true });
    await gas(U.owner, { flock: F.c, on: day(-5), n: 7, queued: true });
    parkedRefs.add1 = uid();
    parkedRefs.add2 = uid();
    const addParked = await add(U.owner, { flock: F.c, on: day(-5), n: 2, queued: true, ref: parkedRefs.add1 });
    same(addParked.value, { status: 'parked', reason: 'flock_closed' }, 'غاز يُضاف لوجبة مغلقة من الطابور: parked');
    samples.add_flock_gas_parked = addParked.value;
    await add(U.worker, { flock: F.c, on: day(-5), n: 1, queued: true, ref: parkedRefs.add2 });
    same((await add(U.owner, { flock: F.c, on: day(-5), n: 2, queued: true, ref: parkedRefs.add1 })).value, addParked.value, 'إعادة الإضافة المركونة بمرجعها: parked نفسه بلا صفّ آخر');
    // كلّ صفّ: نوع ما حمله، وقيمته، ونسخته، ومعرّفه المشتقّ باسمه (الجولة بلا معرّف).
    const labels = new Map([[key, 'dead:owner'], [md5uuid(`dead:${U.manager}:${F.c}:${day(-5)}`), 'dead:manager'], [md5uuid(`gas:${U.owner}:${F.c}:${day(-5)}`), 'gas:owner'],
      [md5uuid(`gasadd:${parkedRefs.add1}`), 'gasadd:1'], [md5uuid(`gasadd:${parkedRefs.add2}`), 'gasadd:2']]);
    const kindOf = (payload) => ('culled' in payload ? 'day' : Object.keys(payload).join());
    const kinds = (await rejectsOf(F.c, day(-5)))
      .map((r) => [kindOf(r.payload), r.payload.dead ?? r.payload.gas ?? r.payload.gas_add, r.version, r.visit_id === null ? null : labels.get(r.visit_id) ?? 'other'])
      .sort((a, b) => String(a[3]).localeCompare(String(b[3])));
    same(kinds, [
      ['dead', 5, 1, 'dead:manager'],
      ['dead', 4, 2, 'dead:owner'],
      ['gas_add', 2, 1, 'gasadd:1'],
      ['gas_add', 1, 1, 'gasadd:2'],
      ['gas', 7, 1, 'gas:owner'],
      ['day', 6, 1, null],
    ].sort((a, b) => String(a[3]).localeCompare(String(b[3]))),
    'لا يكتب مركون فوق آخر: هلاكات كلّ كاتب صفّ، وكلّ إضافة غاز صفّ بمرجعها، والغاز والجولة صفّاهما');
    same([await dayRow(F.c, day(-5)), await gasRow(F.c, day(-5))], [null, null], 'المركون بلا أثر على اليوم ولا على الغاز');

    // قفل الفترة (داخل معاملة ترجع): من الطابور parked، وبنداء مباشر period_locked.
    const locked = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-15)]);
      return {
        deadQueued: await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-16), n: 1, queued: true })),
        deadDirect: (await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-16), n: 1 })))?.code,
        addQueued: await inside(attempt, U.owner, ADD, addParams({ flock: F.a, on: day(-16), n: 1, queued: true })),
        addDirect: (await inside(attempt, U.owner, ADD, addParams({ flock: F.a, on: day(-16), n: 1 })))?.code,
        reasons: (await oq('select reason from public.flock_day_rejects where flock_id = $1 and on_date = $2 order by 1', [F.a, day(-16)])).rows.map((r) => r.reason),
        day: (await oq('select count(*)::int as n from public.flock_daily where flock_id = $1 and on_date = $2', [F.a, day(-16)])).rows[0].n,
      };
    });
    same(locked, { deadQueued: { status: 'parked', reason: 'period_locked' }, deadDirect: 'period_locked', addQueued: { status: 'parked', reason: 'period_locked' },
      addDirect: 'period_locked', reasons: ['period_locked', 'period_locked'], day: 0 }, 'الفترة المقفلة: من الطابور parked، وبنداء مباشر period_locked، ولا صفّ يوم');

    // خارج النطاق (لا يقع بعد 0034 لعضو في منشأته): داخل معاملة ترجع ودالّة النطاق تقول لا، فمن الطابور parked وبنداء مباشر out_of_scope.
    const scoped = await mutant(db, U.owner, [['public.in_scope_site(uuid)', [['  select exists (', '  select false and exists (']]]], async ({ oq, attempt }) => ({
      deadQueued: await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-15), n: 1, queued: true })),
      deadDirect: (await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-15), n: 1 })))?.code,
      addQueued: await inside(attempt, U.owner, ADD, addParams({ flock: F.a, on: day(-15), n: 1, queued: true })),
      addDirect: (await inside(attempt, U.owner, ADD, addParams({ flock: F.a, on: day(-15), n: 1 })))?.code,
      reasons: (await oq('select reason from public.flock_day_rejects where flock_id = $1 and on_date = $2 order by 1', [F.a, day(-15)])).rows.map((r) => r.reason),
    }));
    same(scoped, { deadQueued: { status: 'parked', reason: 'out_of_scope' }, deadDirect: 'out_of_scope', addQueued: { status: 'parked', reason: 'out_of_scope' },
      addDirect: 'out_of_scope', reasons: ['out_of_scope', 'out_of_scope'] }, 'خارج النطاق: من الطابور parked، وبنداء مباشر out_of_scope');
  });

  // ── ٣) جلستان حقيقيتان لليوم نفسه ─────────────────────────────────────────────────────────────────────────────────────
  await section('جلستان لليوم نفسه', async () => {
    const raced = await race(db, { user: U.owner, sql: DEAD, params: deadParams({ flock: F.a, on: day(-5), n: 3 }) },
      { user: U.worker, sql: DEAD, params: deadParams({ flock: F.a, on: day(-5), n: 5 }) });
    same([raced.first, raced.state, raced.second, raced.rows[1]?.[0]?.v], ['ok', 'blocked', 'ok', { status: 'dead_recorded', day: dayJson({ on_date: day(-5), version: 1, dead: 3, dead_entered: true }) }],
      'جهازان لليوم نفسه: الثاني ينتظر صفّ الوجبة ثمّ يرى هلاكات الأوّل (dead_recorded) ولا يضيف إليها');
    same([await dayRow(F.a, day(-5)), (await visitsOf(F.a, day(-5))).length], [{ dead: 3, culled: 0, version: 1, dead_entered: true, note: null }, 1], 'اليوم 3 لا 8، وزيارة واحدة');
    const equal = await race(db, { user: U.owner, sql: DEAD, params: deadParams({ flock: F.a, on: day(-6), n: 3 }) },
      { user: U.worker, sql: DEAD, params: deadParams({ flock: F.a, on: day(-6), n: 3 }) });
    same([equal.state, equal.rows[1]?.[0]?.v?.status, equal.rows[1]?.[0]?.v?.day?.dead, (await visitsOf(F.a, day(-6))).length], ['blocked', 'saved', 3, 1],
      'جهازان بالقيمة نفسها: الثاني saved بلا كتابة');
    const control = await race(db, { user: U.owner, sql: DEAD, params: deadParams({ flock: F.a, on: day(-7), n: 3 }), rollback: true },
      { user: U.worker, sql: DEAD, params: deadParams({ flock: F.a, on: day(-7), n: 5 }) });
    same([control.state, control.rows[1]?.[0]?.v?.status, (await dayRow(F.a, day(-7)))?.dead], ['blocked', 'saved', 5], 'ضابط: الأوّل يرجع فيُسجَّل الثاني');
    // ضابط القفل: الجسم بلا قفل صفّ الوجبة (مثبَّتاً للجلستين ثمّ يعود حرفاً) يفشل الثاني بدل dead_recorded.
    const unlocked = await committedMutation(SIG.dead, [[' and x.id = p_flock for update;\n', ' and x.id = p_flock;\n']], () =>
      race(db, { user: U.owner, sql: DEAD, params: deadParams({ flock: F.a, on: day(-18), n: 3 }) }, { user: U.worker, sql: DEAD, params: deadParams({ flock: F.a, on: day(-18), n: 5 }) }));
    t.ok(unlocked.state === 'blocked' && unlocked.second !== 'ok', `ضابط: بلا قفل صفّ الوجبة لا يرى الثاني يوم الأوّل فيفشل (${unlocked.second})`);
    same((await dayRow(F.a, day(-18)))?.dead, 3, 'وبعد الضابط اليوم بقيمة الأوّل وحده');

    // الغاز: إضافتان من جهازين تثبتان معاً.
    const gasRace = await race(db, { user: U.owner, sql: ADD, params: addParams({ flock: F.b, on: day(-1), n: 2 }) },
      { user: U.worker, sql: ADD, params: addParams({ flock: F.b, on: day(-1), n: 3 }) });
    same([gasRace.first, gasRace.state, gasRace.second, gasRace.rows[1]?.[0]?.v], ['ok', 'blocked', 'ok', { status: 'saved', gas: { on: day(-1), cylinders: 5, version: 2 } }],
      'إضافتا غاز من جهازين لليوم نفسه: الثانية تنتظر ثمّ تضيف إلى الأولى (5 بالنسخة 2)');
    same(await gasRow(F.b, day(-1)), { cylinders: 5, version: 2 }, 'المجموع = مجموع الإضافتين');
    const gasControl = await race(db, { user: U.owner, sql: ADD, params: addParams({ flock: F.b, on: day(-2), n: 2 }), rollback: true },
      { user: U.worker, sql: ADD, params: addParams({ flock: F.b, on: day(-2), n: 3 }) });
    same([gasControl.state, gasControl.rows[1]?.[0]?.v], ['blocked', { status: 'saved', gas: { on: day(-2), cylinders: 3, version: 1 } }], 'ضابط: الأولى ترجع فتبقى الثانية وحدها');
    const gasUnlocked = await committedMutation(SIG.add, [[' and x.id = p_flock for update;\n', ' and x.id = p_flock;\n'], [' and x.on_date = p_on for update;\n', ' and x.on_date = p_on;\n']], () =>
      race(db, { user: U.owner, sql: ADD, params: addParams({ flock: F.b, on: day(-3), n: 2 }) }, { user: U.worker, sql: ADD, params: addParams({ flock: F.b, on: day(-3), n: 3 }) }));
    t.ok(gasUnlocked.state === 'blocked' && gasUnlocked.second !== 'ok', `ضابط: بلا قفل الوجبة وصفّ الغاز تفشل الإضافة الثانية ليوم بلا صفّ (${gasUnlocked.second})`);
    same(await gasRow(F.b, day(-3)), { cylinders: 2, version: 1 }, 'وبعد الضابط غاز اليوم بالأولى وحدها');
  });

  // ── ٤) العلامة من كاتبي اليوم القائمين ────────────────────────────────────────────────────────────────────────────────
  await section('العلامة من save_flock_day وsave_flock_visit', async () => {
    const flag = async (on) => (await dayRow(F.a, on))?.dead_entered ?? null;
    t.eq((await saveDay(U.owner, { flock: F.a, on: day(-8), dead: 2 })).value?.status, 'saved', 'جولة بنافق');
    t.eq(await flag(day(-8)), true, 'save_flock_day بنافق ليوم جديد يعلّم');
    await saveDay(U.owner, { flock: F.a, on: day(-9), note: 'ملاحظة' });
    t.eq(await flag(day(-9)), false, 'save_flock_day بملاحظة وحدها لا يعلّم');
    t.eq((await saveDay(U.owner, { flock: F.a, on: day(-9), culled: 1, base: 1 })).value?.status, 'saved', 'ثمّ مستبعد بنسخته');
    t.eq(await flag(day(-9)), true, 'المستبعد وحده يعلّم');
    same((await dead(U.owner, { flock: F.a, on: day(-9), n: 1 })).value?.status, 'saved', 'وset_flock_dead بالقيمة نفسها (النافق والمستبعد معاً = 1) saved');

    const v10 = uid();
    const added = await visit(U.owner, { id: v10, flock: F.a, on: day(-10), dead: 1 });
    same([added.value?.status, added.value?.day?.dead_entered, added.value?.day?.dead], ['saved', true, 1], 'save_flock_visit بنافق: الجواب بصفّ اليوم معلَّماً');
    // إلغاء الزيارة الوحيدة يحذف صفّ اليوم وعلامته (0032)، فتُقبل هلاكاته من جديد.
    t.eq((await visit(U.owner, { id: v10, flock: F.a, on: day(-10), dead: 1, base: 1, void: true })).value?.status, 'saved', 'إلغاء الزيارة');
    t.eq(await dayRow(F.a, day(-10)), null, 'ولا صفّ يوم بعدها');
    same((await dead(U.owner, { flock: F.a, on: day(-10), n: 2 })).value?.day?.dead, 2, 'فتُسجَّل هلاكات اليوم من جديد');

    // الزيارة في تعديلها تُرسل محتواها كاملاً: النافق كما كان لا يعلّم، وتغييره يعلّم.
    const v11 = uid();
    await visit(U.owner, { id: v11, flock: F.a, on: day(-11), note: 'زيارة' });
    t.eq(await flag(day(-11)), false, 'زيارة بملاحظة وحدها لا تعلّم');
    t.eq((await visit(U.owner, { id: v11, flock: F.a, on: day(-11), dead: 0, note: 'زيارة معدَّلة', base: 1 })).value?.status, 'saved', 'تعديلها بالنافق كما كان (صفر)');
    t.eq(await flag(day(-11)), false, 'تعديل لم يغيّر النافق لا يعلّم');
    t.eq((await visit(U.owner, { id: v11, flock: F.a, on: day(-11), dead: 2, note: 'زيارة معدَّلة', base: 2 })).value?.day?.dead_entered, true, 'وتعديل غيّر النافق يعلّم');

    // يوم بملاحظة وحدها: المركون والقديم والمرفوض وما لا يغيّر شيئاً لا يعلّم.
    await saveDay(U.owner, { flock: F.a, on: day(-12), note: 'بلا هلاكات' });
    const stale = await saveDay(U.owner, { flock: F.a, on: day(-12), dead: 3, base: 9 });
    same([stale.value?.status, stale.value?.server?.dead_entered], ['stale_day', false], 'stale_day لا يعلّم، وصفّ الخادم بعلامته');
    same((await saveDay(U.owner, { flock: F.a, on: day(-12), dead: 0, base: 1 })).value, { status: 'saved', version: 1 }, 'ما لا يغيّر شيئاً: saved بلا كتابة');
    t.eq(code(await saveDay(U.owner, { flock: F.a, on: day(-12), dead: 5000, base: 1 })), 'live_negative', 'المرفوض');
    t.eq(code(await visit(U.owner, { flock: F.a, on: day(-12), dead: 5000 })), 'live_negative', 'والزيارة المرفوضة');
    t.eq((await saveDay(U.owner, { flock: F.a, on: day(-12), dead: 0, note: 'بلا هلاكات اليوم', base: 1 })).value?.status, 'saved', 'والقيمة نفسها مع خانة أخرى');
    const parked = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-12)]);
      return {
        day: (await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-12), dead: 3, base: 2, queued: true })))?.status,
        visit: (await inside(attempt, U.owner, VISIT, visitParams({ flock: F.a, on: day(-12), dead: 3, queued: true })))?.status,
        flag: (await oq('select dead_entered from public.flock_daily where flock_id = $1 and on_date = $2', [F.a, day(-12)])).rows[0].dead_entered,
      };
    });
    same(parked, { day: 'parked', visit: 'parked', flag: false }, 'الجولة والزيارة المركونتان لا تعلّمان');
    same(await dayRow(F.a, day(-12)), { dead: 0, culled: 0, version: 2, dead_entered: false, note: 'بلا هلاكات اليوم' }, 'اليوم بلا علامة بعد كلّ ذلك');
    same((await dead(U.owner, { flock: F.a, on: day(-12), n: 6 })).value?.day?.dead, 6, 'فتُسجَّل هلاكاته من الجولة');

    // قرارات مراجعة 0036: الصفر الصريح في زيارة (تطبيق قديم «زرت ولا هلاكات») لا يقفل الجولة؛ وصفر الجولة («لا هلاكات اليوم») يقفلها.
    same((await visit(U.owner, { flock: F.a, on: day(-13), dead: 0 })).value?.day?.dead_entered, false, 'زيارة بنافق صفر صريح لا تعلّم');
    same((await dead(U.owner, { flock: F.a, on: day(-13), n: 5 })).value?.day?.dead, 5, 'فالجولة بعدها تسجّل هلاكات اليوم');
    const marks = (await db.admin(`select on_date - $2::date as d, source, dead, culled, dead_entry from public.flock_visits
      where flock_id = $1 and on_date in ($2::date - 3, $2::date - 13) and voided_at is null order by on_date, recorded_at, created_at`, [F.a, TODAY])).rows;
    same(marks, [{ d: -13, source: 'visit', dead: 0, culled: 0, dead_entry: false }, { d: -13, source: 'visit', dead: 5, culled: 0, dead_entry: true },
      { d: -3, source: 'visit', dead: 0, culled: 0, dead_entry: true }],
    'العلامة على الزيارة: زيارة الصفر بلا علامة، وزيارة الجولة معلَّمة ولو صفراً');
    same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_round_once صفر بعد الكتّاب كلّهم');
  });

  // ── ٥) الملء: كلّ زيارة حيّة فيها نافق أو مستبعد، ثمّ كلّ صفّ يوم من زياراته ─────────────────────────────────────────────────
  await section('الملء', async () => {
    const migration = readFileSync(path.join(MIGRATIONS, '0036_round_once.sql'), 'utf8');
    const visitsFill = migration.match(/^update public\.flock_visits x set dead_entry = true[^\n]*;\n/gmu) ?? [];
    const daysFill = migration.match(/^update public\.flock_daily x set dead_entered = exists[\s\S]*?;\n/gmu) ?? [];
    same([visitsFill.length, daysFill.length], [1, 1], 'جملتا الملء (الزيارات ثمّ اشتقاق الأيّام) في الهجرة مرّة واحدة لكلّ منهما');
    t.ok(migration.indexOf(visitsFill[0]) < migration.indexOf(daysFill[0]), 'ملء الزيارات قبل اشتقاق الأيّام');
    // كلّ العلامات تُمسح داخل معاملة ترجع، ثمّ الملء: الزيارات الحيّة بهلاكات تُعلَّم (والملغاة والصفر لا)، والأيّام منها؛ وإعادته لا تكتب شيئاً.
    const out = await mutant(db, U.owner, [], async ({ oq }) => {
      await oq('update public.flock_visits set dead_entry = false where org_id = $1', [org]);
      await oq('update public.flock_daily set dead_entered = false where org_id = $1', [org]);
      const before = await verifyOf(oq);
      const visits = (await oq(visitsFill[0])).rowCount;
      const days = (await oq(daysFill[0])).rowCount;
      const again = [(await oq(visitsFill[0])).rowCount, (await oq(daysFill[0])).rowCount];
      const v = (await oq(`select count(*) filter (where voided_at is null and dead + culled > 0)::int as live_deaths,
        count(*) filter (where dead_entry and (voided_at is not null or dead + culled = 0))::int as wrong from public.flock_visits where org_id = $1`, [org])).rows[0];
      const d = (await oq(`select count(*) filter (where dead + culled > 0 and dead_entered)::int as marked, count(*) filter (where dead + culled > 0)::int as with_deaths,
        count(*) filter (where dead + culled = 0 and dead_entered)::int as zero_marked from public.flock_daily where org_id = $1`, [org])).rows[0];
      return { before, visits, days, again, v, d, after: await verifyOf(oq) };
    });
    t.ok(out.before.dead_entered_flag > 0 && out.before.dead_entered_flag === out.d.with_deaths && out.before.dead_entry_visits === out.v.live_deaths,
      `قبل الملء: كلّ يوم بهلاكات بلا علامة وكلّ زيارة حيّة بهلاكات بلا علامة خرق (${JSON.stringify(out.before)})`);
    same({ visits: out.visits, days: out.days, again: out.again, marked: out.d.marked, zero: out.d.zero_marked, wrong: out.v.wrong, after: out.after },
      { visits: out.v.live_deaths, days: out.d.with_deaths, again: [0, 0], marked: out.d.with_deaths, zero: 0, wrong: 0, after: VERIFY_ZERO },
      'الملء يعلّم كلّ زيارة حيّة بهلاكات ثمّ كلّ يوم منها (ولا يعلّم يوم الصفر)، وإعادته لا تكتب شيئاً');
  });

  // ── ٦) الغاز يُضاف ──────────────────────────────────────────────────────────────────────────────────────────────────
  await section('الغاز يُضاف', async () => {
    const ref1 = uid();
    const first = await add(U.worker, { flock: F.a, on: TODAY, n: 2, ref: ref1 });
    same(first.value, { status: 'saved', gas: { on: TODAY, cylinders: 2, version: 1 } }, 'أوّل إضافة ليوم بلا غاز: saved بالنسخة 1');
    samples.add_flock_gas_saved = first.value;
    same((await add(U.worker, { flock: F.a, on: TODAY, n: 2, ref: ref1 })).value, first.value, 'الإعادة بالمرجع نفسه = الجواب الأوّل (لا تُضاف مرّة ثانية)');
    same(code(await add(U.worker, { flock: F.a, on: TODAY, n: 3, ref: ref1 })), 'ref_reused', 'المرجع نفسه بعدد آخر ref_reused');
    same((await add(U.manager, { flock: F.a, on: TODAY, n: 1 })).value, { status: 'saved', gas: { on: TODAY, cylinders: 3, version: 2 } }, '«2 الصبح + 1 العصر = 3» بالنسخة 2');
    same((await gas(U.owner, { flock: F.a, on: TODAY, n: 5, base: 1 })).value?.status, 'stale_gas', 'التصحيح بنسخة ما قبل الإضافة: stale_gas (الإضافة تكبّر النسخة)');
    // الممسوح صفر.
    await gas(U.owner, { flock: F.a, on: day(-1), n: 5 });
    same((await gas(U.owner, { flock: F.a, on: day(-1), n: null, base: 1 })).value?.gas, { on: day(-1), cylinders: null, version: 2 }, 'غاز أمس مُسح');
    same((await add(U.owner, { flock: F.a, on: day(-1), n: 2 })).value?.gas, { on: day(-1), cylinders: 2, version: 3 }, 'الإضافة إلى الممسوح تبدأ من صفر');
    // الحدّ.
    await gas(U.owner, { flock: F.a, on: day(-2), n: 999 });
    const over = await add(U.owner, { flock: F.a, on: day(-2), n: 2 });
    same(code(over), 'bad_value', '999 + 2 فوق الحدّ: bad_value');
    t.ok(over.hint.includes('(999)') && over.hint.includes('ألف قنينة') && over.hint.includes('أضف 1') && over.hint.includes('قاعة 1') && over.hint.includes(ddmm(day(-2))),
      `التلميح يسمّي المجموع الآن والحدّ وما يُضاف (${over.hint})`);
    same((await add(U.owner, { flock: F.a, on: day(-2), n: 1 })).value?.gas, { on: day(-2), cylinders: 1000, version: 2 }, 'حتى 1,000 بالضبط');
    const full = await add(U.owner, { flock: F.a, on: day(-2), n: 1 });
    t.ok(code(full) === 'bad_value' && full.hint.includes('بلغ الحدّ'), `بعد الحدّ: bad_value بجملة «بلغ الحدّ» (${full.hint})`);
    same({
      zero: code(await add(U.owner, { flock: F.a, on: day(-3), n: 0 })),
      negative: code(await add(U.owner, { flock: F.a, on: day(-3), n: -1 })),
      over: code(await add(U.owner, { flock: F.a, on: day(-3), n: 1001 })),
      none: code(await add(U.owner, { flock: F.a, on: day(-3), n: null })),
      future: code(await add(U.owner, { flock: F.a, on: day(1), n: 1 })),
      futureQueued: code(await add(U.owner, { flock: F.a, on: day(1), n: 1, queued: true })),
      before: code(await add(U.owner, { flock: F.a, on: day(-21), n: 1 })),
      required: code(await add(U.owner, { flock: F.a, on: null, n: 1 })),
      missing: code(await add(U.owner, { flock: id(999), on: day(-3), n: 1 })),
      closed: code(await add(U.owner, { flock: F.c, on: day(-5), n: 1 })),
    }, {
      zero: 'bad_value', negative: 'bad_value', over: 'bad_value', none: 'bad_value', future: 'date_in_future', futureQueued: 'date_in_future', before: 'before_placement',
      required: 'date_required', missing: 'flock_not_found', closed: 'flock_closed',
    }, 'add_flock_gas: كلّ رمز رفض بنداء مباشر');
    t.eq(await gasRow(F.a, day(-3)), null, 'ولا صفّ غاز من رفض');
    const roles = {};
    for (const role of ['worker', 'keeper', 'viewer', 'accountant']) roles[role] = (await add(U[role], { flock: F.l, on: day(-3), n: 1 }, { commit: false })).value?.status;
    same(roles, { worker: 'saved', keeper: 'saved', viewer: 'saved', accountant: 'saved' }, 'كلّ عضو يضيف الغاز (0034)');
  });

  // ── ٧) قارئا الجولة ──────────────────────────────────────────────────────────────────────────────────────────────
  await section('قارئا الجولة', async () => {
    // علف اليوم لـ«قاعة 1»: بادئ 100 ثمّ ناهي 50 ثمّ بادئ 20، وناهي 30 أُرسل اليوم لأمس، وبادئ 5 أُلغي، ثمّ ذرة 10 بالصرف العاديّ (آخر صرف)؛ ودواء.
    const sent = {};
    for (const [key, itemId, qty, on] of [['s1', I.starter, '100', TODAY], ['f1', I.finisher, '50', TODAY], ['s2', I.starter, '20', TODAY], ['late', I.finisher, '30', day(-1)], ['voided', I.starter, '5', TODAY]]) {
      sent[key] = { issue: uid(), flock: F.a, item: itemId, qty, on };
      await one(U.owner, SEND, sendParams(sent[key]));
    }
    await one(U.owner, 'select public.void_flock_issue($1, $2, $3) as v', [sent.voided.issue, 'كمية خاطئة', uid()]);
    await one(U.owner, 'select public.record_flock_issue($1, $2, $3, $4, $5, 10, $6, $7) as v', [uid(), uid(), uid(), F.a, I.corn, TODAY, W.raw]);
    await one(U.owner, "select public.give_to_flocks($1, $2, jsonb_build_array(jsonb_build_object('kind', 'issue', 'flock_id', $3::uuid, 'issue_id', gen_random_uuid(), 'line_id', gen_random_uuid(), 'item_id', $4::uuid, 'warehouse_id', $5::uuid, 'qty', '1'))) as v",
      [uid(), TODAY, F.a, I.vitamin, W.medicine]);
    await one(U.owner, DEAD, deadParams({ flock: F.a, on: TODAY, n: 2 }));
    await one(U.owner, VISIT, visitParams({ flock: F.l, on: TODAY, eggs: 1500 }));

    const overview = await one(U.owner, OVERVIEW, []);
    samples.flocks_overview = overview;
    const summaryOf = (view, hallId) => view.sites.flatMap((s) => s.halls).find((h) => h.id === hallId)?.flock ?? null;
    const pick = (s) => ({ gas: s.gas_today, gasVersion: s.gas_today_version, kg: s.feed_today_kg, feed: s.feed_today, last: s.last_feed_item_id, today: s.today });
    same(pick(summaryOf(overview, H.a)), {
      gas: 3, gasVersion: 2, kg: '180.000',
      feed: [{ item_id: I.starter, item_name: 'علف بادئ', qty: '120.000', unit: 'kg', carry: false }, { item_id: I.finisher, item_name: 'علف ناهي', qty: '50.000', unit: 'kg', carry: false },
        { item_id: I.corn, item_name: 'ذرة صفراء', qty: '10.000', unit: 'kg', carry: false }],
      last: I.finisher,
      today: dayJson({ on_date: TODAY, version: 1, dead: 2, dead_entered: true }),
    }, 'اللاحم: غاز اليوم 3 بنسخته، وعلفه 180 كغم بسطوره بالمادّة بترتيب أوّل إرسال (بلا المتأخّر لأمس ولا الملغى ولا الدواء)، وآخر علف أُرسل (الناهي لا الذرة)، وهلاكات اليوم بعلامتها');
    same(pick(summaryOf(overview, H.b)), { gas: null, gasVersion: null, kg: null, feed: [], last: null, today: null }, 'لاحم بلا شيء اليوم: الفوارغ وقائمة فارغة');
    same(pick(summaryOf(overview, H.l)), { gas: null, gasVersion: null, kg: null, feed: [], last: null,
      today: dayJson({ on_date: TODAY, version: 1, dead: 0, eggs_total: 1500, dead_entered: false }) }, 'البيّاض: بيض اليوم بلا علامة هلاكات (زيارة البيض لا تسجّلها)');
    t.eq(summaryOf(overview, H.c), null, 'الوجبة المغلقة خارج الجولة كما كانت');
    same(overview.feed_items, [
      { item_id: I.starter, name: 'علف بادئ', base_unit: 'kg', on_hand: '1880.000', units: [{ id: units.starter, name: 'كيس 50 كغم', base_qty: '50' }] },
      { item_id: I.finisher, name: 'علف ناهي', base_unit: 'kg', on_hand: '1500.000', units: [{ id: units.finisher25, name: 'كيس 25 كغم', base_qty: '25' }, { id: units.finisher50, name: 'كيس 50 كغم', base_qty: '50' }] },
    ], 'الأعلاف المتاحة: بالاسم، وأكبر ما في مخزن علف واحد (الناهي 1,500 في الثاني لا 920 + 1,500)، ووحدات التعبئة الفعّالة؛ بلا علف بلا رصيد ولا ذرة ولا دواء');
    const sheet = await one(U.owner, SHEET, [F.a]);
    const bare = (items) => items.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'last'))).sort((a, b) => a.item_id.localeCompare(b.item_id));
    same(bare(overview.feed_items), bare(sheet.feed_items), 'feed_items = أعلاف الورقة بلا last');
    t.eq(sheet.feed_items.find((x) => x.last)?.item_id, summaryOf(overview, H.a).last_feed_item_id, 'وآخر علف في الملخّص = آخر علف في الورقة');
    same(rowsOfToday(sheet), { feed_kg: summaryOf(overview, H.a).feed_today_kg, gas: 3 }, 'علف اليوم وغازه في الملخّص = سطر اليوم في الورقة');
    t.ok(!/"(money|value|cost|amount|price)"/u.test(JSON.stringify(overview)), 'القارئ بلا أيّ حقل مال');

    const detail = await one(U.owner, DETAIL, [F.a]);
    same(pick(detail.flock), pick(summaryOf(overview, H.a)), 'flock_detail يحمل المفاتيح نفسها');
    same((await one(U.owner, DETAIL, [F.c])).flock.gas_today, 4, 'الوجبة المغلقة: غاز يوم إغلاقها (يومها)');
    // منشأة ثانية: أعلافها وحدها.
    const G2 = await makeOrg(db, { name: 'مزرعة ثانية للجولة', id: (n) => id(900 + n), phone: (n) => phone(90 + n), roles: [['owner', 'owner']] });
    const o2 = G2.users.owner;
    const feed2 = await one(o2, "insert into public.items (name, kind, base_unit) values ('علف المنشأة الثانية', 'feed', 'kg') returning id");
    const wh2 = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'feed'", [G2.org])).rows[0].id;
    await postedOpening(db, o2, wh2, day(-3), [{ item: feed2, qty: 40, value: '20000.00' }]);
    same((await one(o2, OVERVIEW, [])).feed_items.map((x) => [x.name, x.on_hand]), [['علف المنشأة الثانية', '40.000']], 'لكلّ منشأة أعلافها وحدها');
    same([code(await dead(o2, { flock: F.a, on: day(-1), n: 1 })), code(await add(o2, { flock: F.a, on: day(-1), n: 1, queued: true }))], ['flock_not_found', 'flock_not_found'],
      'وجبة منشأة أخرى غير موجودة للهلاكات والغاز (ولو من الطابور)');

    // الواجهة المنشورة: المحلّلات الحاليّة تقرأ الجواب بمفاتيحه الجديدة كما كانت.
    const parsed = ui.parseOverview(overview);
    const parsedA = parsed.sites.flatMap((s) => s.halls).find((h) => h.id === H.a)?.flock ?? null;
    same([parsedA?.today?.dead, parsedA?.today?.version, ui.parseDetail(detail).flock.id, ui.parseDayRow(detail.flock.today).dead,
      ui.visitAnswer((await call(db, U.owner, VISIT, visitParams({ flock: F.b, on: TODAY, dead: 1 }), { commit: false })).value).kind, ui.gasAnswer(samples.add_flock_gas_saved).kind],
    [2, 1, F.a, 2, 'saved', 'saved'], 'المحلّلات الحاليّة (parseOverview وparseDetail وparseDayRow وvisitAnswer) تقرأ الأجوبة بعد الهجرة، وجواب الإضافة بشكل جواب set_flock_gas');
  });

  // ── ٨) الثابت ────────────────────────────────────────────────────────────────────────────────────────────────────
  await section('الثابت', async () => {
    same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_round_once صفر');
    const breaks = {
      dead_entered_flag: (oq) => oq('update public.flock_daily set dead_entered = false where flock_id = $1 and on_date = $2', [F.a, day(-1)]),
      // يوم البيض اليوم بلا زيارة معلَّمة يُعلَّم بيد: العلامة لا تطابق اشتقاقها.
      dead_entered_derived: (oq) => oq('update public.flock_daily set dead_entered = true where flock_id = $1 and on_date = $2', [F.l, TODAY]),
      // زيارة أمس بنافق 7 تفقد علامتها: يُعاد بناء اليوم بلا علامة.
      dead_entry_visits: (oq) => oq('update public.flock_visits set dead_entry = false where flock_id = $1 and on_date = $2 and voided_at is null and dead > 0', [F.a, day(-1)]),
      gas_cap: async (oq) => {
        await oq('alter table public.flock_day_gas drop constraint flock_day_gas_cylinders_check');
        await oq('update public.flock_day_gas set cylinders = 1001 where flock_id = $1 and on_date = $2', [F.a, day(-2)]);
      },
    };
    const caught = {};
    for (const [name, run] of Object.entries(breaks)) {
      caught[name] = await mutant(db, U.owner, [], async ({ oq }) => {
        await run(oq);
        return (await verifyOf(oq))[name];
      });
    }
    same(caught, { dead_entered_flag: 1, dead_entered_derived: 1, dead_entry_visits: 1, gas_cap: 1 }, 'كلّ خرق يمسكه فحصه باسمه');
  });

  // ── ٩) الطفرات: كلّ قاعدة مكسورة (ومنها أجسام ما قبل 0036 بلا العلامة) يمسكها فحصها ────────────────────────────────────────
  await section('الطفرات', async () => {
    const flagOf = async (oq, flock, on) => (await oq('select dead_entered from public.flock_daily where flock_id = $1 and on_date = $2', [flock, on])).rows[0]?.dead_entered ?? null;
    const deadOf = async (oq, flock, on) => (await oq('select dead from public.flock_daily where flock_id = $1 and on_date = $2', [flock, on])).rows[0]?.dead ?? null;
    const CASES = [
      {
        name: 'save_flock_day بزيارة day_total بلا علامة',
        fns: [[SIG.day, [["n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 'day_total', 1, v_mark);", "n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 'day_total', 1, false);"]]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-14), dead: 2 }));
          return flagOf(oq, F.a, day(-14));
        },
        correct: (v) => v === true,
      },
      {
        name: 'save_flock_visit بزيارة بلا علامة',
        fns: [[SIG.visit, [["p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note, 'visit', 1, v_mark)", "p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note, 'visit', 1, false)"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, VISIT, visitParams({ flock: F.a, on: day(-14), dead: 2 })))?.day?.dead_entered,
        correct: (v) => v === true,
      },
      {
        name: 'save_flock_visit: تعديل الزيارة لا يغيّر علامتها',
        fns: [[SIG.visit, [['note = v_note, dead_entry = v_mark, version = x.version + 1', 'note = v_note, version = x.version + 1']]]],
        run: async ({ attempt }) => {
          const visitId = uid();
          await inside(attempt, U.owner, VISIT, visitParams({ id: visitId, flock: F.a, on: day(-14), dead: 3 }));
          return (await inside(attempt, U.owner, VISIT, visitParams({ id: visitId, flock: F.a, on: day(-14), dead: 0, base: 1 })))?.day?.dead_entered;
        },
        correct: (v) => v === false,
      },
      {
        name: 'save_flock_visit: الصفر الصريح يقفل (علامة لكلّ هلاكات في النداء)',
        fns: [[SIG.visit, [['v_mark := not v_void and coalesce(p_dead, 0) + coalesce(p_culled, 0) > 0;', 'v_mark := not v_void and (p_dead is not null or p_culled is not null);']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, VISIT, visitParams({ flock: F.a, on: day(-14), dead: 0, note: 'زيارة' })))?.day?.dead_entered,
        correct: (v) => v === false,
      },
      {
        name: 'save_flock_day: الصفر في النداء يقفل',
        fns: [[SIG.day, [['  v_mark := case when p_dead is not null or p_culled is not null then n.dead + n.culled > 0', '  v_mark := case when p_dead is not null or p_culled is not null then true']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-14), note: 'أوّل' }));
          await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-14), dead: 0, note: 'ثانٍ', base: 1 }));
          return flagOf(oq, F.a, day(-14));
        },
        correct: (v) => v === false,
      },
      {
        name: 'flock_day_rebuild: العلامة من الزيارات الملغاة أيضاً',
        fns: [[SIG.rebuild, [["    coalesce(bool_or(v.dead_entry), false) as dead_entered\n  into s\n  from public.flock_visits v\n  where v.org_id = f.org_id and v.flock_id = f.id and v.on_date = p_on and v.voided_at is null;",
          "    (select coalesce(bool_or(y.dead_entry), false) from public.flock_visits y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date = p_on) as dead_entered\n  into s\n  from public.flock_visits v\n  where v.org_id = f.org_id and v.flock_id = f.id and v.on_date = p_on and v.voided_at is null;"]]]],
        run: async ({ attempt }) => {
          const visitId = uid();
          await inside(attempt, U.owner, VISIT, visitParams({ id: visitId, flock: F.a, on: day(-14), dead: 3 }));
          await inside(attempt, U.owner, VISIT, visitParams({ flock: F.a, on: day(-14), note: 'زيارة أخرى' }));
          return (await inside(attempt, U.owner, VISIT, visitParams({ id: visitId, flock: F.a, on: day(-14), dead: 3, base: 1, void: true })))?.day?.dead_entered;
        },
        correct: (v) => v === false,
      },
      {
        name: 'flock_day_json بجسم 0012 (بلا العلامة)',
        fns: [[SIG.dayJson, [[",\n    'dead_entered', d.dead_entered) end", ') end']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-14), n: 1 })))?.day,
        correct: (v) => v?.dead_entered === true,
      },
      {
        name: 'set_flock_dead يضيف إلى هلاكات مسجّلة',
        fns: [[SIG.dead, [['  if d.id is not null and (d.dead_entered or d.dead + d.culled > 0) then', '  if false then']]]],
        run: async ({ oq, attempt }) => [(await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-1), n: 9 })))?.status, await deadOf(oq, F.a, day(-1))],
        correct: (v) => JSON.stringify(v) === JSON.stringify(['dead_recorded', 7]),
      },
      {
        name: 'set_flock_dead بالهلاكات وحدها لا بالعلامة (يوم الصفر)',
        fns: [[SIG.dead, [['(d.dead_entered or d.dead + d.culled > 0)', '(d.dead + d.culled > 0)']]]],
        run: async ({ oq, attempt }) => [(await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-3), n: 5 })))?.status, await deadOf(oq, F.a, day(-3))],
        correct: (v) => JSON.stringify(v) === JSON.stringify(['dead_recorded', 0]),
      },
      {
        name: 'set_flock_dead بزيارة بلا علامة',
        fns: [[SIG.dead, [["p_on, now(), p_dead, 0, 'visit', 1, true);", "p_on, now(), p_dead, 0, 'visit', 1, false);"]]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-14), n: 0 }));
          return [(await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-14), n: 5 })))?.status, await deadOf(oq, F.a, day(-14))];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['dead_recorded', 0]),
      },
      {
        name: 'set_flock_dead: «القيمة نفسها» النافق وحده',
        fns: [[SIG.dead, [["when d.dead + d.culled = p_dead then 'saved'", "when d.dead = p_dead then 'saved'"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-9), n: 1 })))?.status,
        correct: (v) => v === 'saved',
      },
      {
        name: 'set_flock_dead بلا فحص البيض',
        fns: [[SIG.dead, [['  perform private.flock_eggs_live_check(f, p_on);\n', '']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DEAD, deadParams({ flock: F.l, on: day(-3), n: 30 })))?.code ?? 'saved',
        correct: (v) => v === 'eggs_over_live',
      },
      {
        name: 'set_flock_dead بلا فحص الحيّ',
        fns: [[SIG.dead, [['  perform private.flock_live_check(f);\n', '']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DEAD, deadParams({ flock: F.b, on: day(-4), n: 600 })))?.code ?? 'saved',
        correct: (v) => v === 'live_negative',
      },
      {
        name: 'set_flock_dead المركون بلا معرّف (يكتب فوق الجولة المركونة)',
        fns: [[SIG.dead, [["      md5('dead:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)\n    on conflict (org_id, visit_id) where visit_id is not null do update",
          '      null)\n    on conflict (org_id, created_by, flock_id, on_date) where visit_id is null do update']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.c, on: day(-5), n: 8, queued: true }));
          return (await oq("select count(*)::int as n from public.flock_day_rejects where flock_id = $1 and on_date = $2 and payload ? 'culled'", [F.c, day(-5)])).rows[0].n;
        },
        correct: (v) => v === 1,
      },
      {
        name: 'add_flock_gas يكتب العدد بدل الإضافة',
        fns: [[SIG.add, [['cylinders = coalesce(x.cylinders, 0) + p_add', 'cylinders = p_add']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, ADD, addParams({ flock: F.a, on: TODAY, n: 1 })))?.gas?.cylinders,
        correct: (v) => v === 4,
      },
      {
        name: 'add_flock_gas: الممسوح ليس صفراً',
        fns: [[SIG.add, [['cylinders = coalesce(x.cylinders, 0) + p_add', 'cylinders = x.cylinders + p_add']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, GAS, gasParams({ flock: F.a, on: day(-1), n: null, base: 3 }));
          return (await inside(attempt, U.owner, ADD, addParams({ flock: F.a, on: day(-1), n: 2 })))?.gas?.cylinders;
        },
        correct: (v) => v === 2,
      },
      {
        name: 'add_flock_gas بلا حدّ مجموع اليوم',
        fns: [[SIG.add, [['  if coalesce(g.cylinders, 0) + p_add > 1000 then', '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, ADD, addParams({ flock: F.a, on: day(-2), n: 1 })))?.code,
        correct: (v) => v === 'bad_value',
      },
      {
        name: 'add_flock_gas المركون بمعرّف للكاتب واليوم (إضافة تكتب فوق أخرى)',
        fns: [[SIG.add, [["md5('gasadd:' || p_client_ref::text)::uuid)", "md5('gasadd:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)"]]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, ADD, addParams({ flock: F.c, on: day(-6), n: 1, queued: true }));
          await inside(attempt, U.owner, ADD, addParams({ flock: F.c, on: day(-6), n: 2, queued: true }));
          return (await oq("select count(*)::int as n from public.flock_day_rejects where flock_id = $1 and on_date = $2 and payload ? 'gas_add'", [F.c, day(-6)])).rows[0].n;
        },
        correct: (v) => v === 2,
      },
      {
        name: 'الملخّص: علف اليوم بتاريخ خروجه لا بيوم القاعة',
        fns: [[SIG.summary, [["and l.cost_kind = 'feed' and private.issue_day(x) = v_today\n        union all", "and l.cost_kind = 'feed' and x.issued_on = v_today\n        union all"]]]],
        run: async ({ attempt }) => {
          const s = (await inside(attempt, U.owner, DETAIL, [F.a]))?.flock;
          return [s?.feed_today_kg, s?.feed_today?.length];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['180.000', 3]),
      },
      {
        name: 'الملخّص: الملغى في علف اليوم',
        fns: [[SIG.summary, [["where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) = v_today\n        union all",
          "where x.org_id = f.org_id and x.flock_id = f.id and l.cost_kind = 'feed' and private.issue_day(x) = v_today\n        union all"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DETAIL, [F.a]))?.flock?.feed_today_kg,
        correct: (v) => v === '180.000',
      },
      {
        name: 'الملخّص: آخر علف بنوع الكلفة لا بنوع المادّة',
        fns: [[SIG.summary, [["  where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and i.kind = 'feed'\n", "  where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted'\n"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DETAIL, [F.a]))?.flock?.last_feed_item_id,
        correct: (v) => v === I.finisher,
      },
      {
        name: 'الملخّص: غاز يوم آخر',
        fns: [[SIG.summary, [['and x.on_date = v_today;\n  select round(sum(o.kg), 3),', 'and x.on_date = v_today - 1;\n  select round(sum(o.kg), 3),']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DETAIL, [F.a]))?.flock?.gas_today,
        correct: (v) => v === 3,
      },
      {
        name: 'الأعلاف المتاحة: مجموع المخازن',
        fns: [[SIG.overview, [['coalesce((select max(s.available) from public.warehouses w', 'coalesce((select sum(s.available) from public.warehouses w']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, OVERVIEW, []))?.feed_items?.find((x) => x.item_id === I.finisher)?.on_hand,
        correct: (v) => v === '1500.000',
      },
      {
        name: 'الأعلاف المتاحة: بلا رصيد',
        fns: [[SIG.overview, [["      where q.on_hand > 0), '[]'::jsonb));", "      where true), '[]'::jsonb));"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, OVERVIEW, []))?.feed_items?.map((x) => x.name),
        correct: (v) => JSON.stringify(v) === JSON.stringify(['علف بادئ', 'علف ناهي']),
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

    // الأجسام القبلية حرفاً من ملفّات هجراتها (ما قبل 0036): كلّ قاعدة جديدة تفشل عليها، والجسم الحاليّ يمرّ.
    const OLD = [
      {
        name: 'save_flock_day كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'public.save_flock_day'),
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-14), dead: 2 }));
          return flagOf(oq, F.a, day(-14));
        },
        correct: (v) => v === true,
      },
      {
        name: 'save_flock_visit كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'public.save_flock_visit'),
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, VISIT, visitParams({ flock: F.a, on: day(-14), dead: 2 }));
          return flagOf(oq, F.a, day(-14));
        },
        correct: (v) => v === true,
      },
      {
        name: 'flock_day_json كما في 0012',
        body: bodyOf('0012_flocks_daily.sql', 'private.flock_day_json'),
        run: async ({ attempt }) => (await inside(attempt, U.owner, DETAIL, [F.a]))?.flock?.today?.dead_entered,
        correct: (v) => v === true,
      },
      {
        name: 'flock_summary كما في 0029',
        body: bodyOf('0029_bird_sales_close.sql', 'private.flock_summary'),
        run: async ({ attempt }) => {
          const s = (await inside(attempt, U.owner, DETAIL, [F.a]))?.flock;
          return [s?.gas_today, s?.gas_today_version, s?.feed_today_kg, s?.feed_today?.length, s?.last_feed_item_id];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify([3, 2, '180.000', 3, I.finisher]),
      },
      {
        name: 'flocks_overview كما في 0012',
        body: bodyOf('0012_flocks_daily.sql', 'public.flocks_overview'),
        run: async ({ attempt }) => (await inside(attempt, U.owner, OVERVIEW, []))?.feed_items?.length,
        correct: (v) => v === 2,
      },
      {
        // إعادة البناء القديمة لا تشتقّ العلامة: «لا هلاكات اليوم» صفراً بلا علامة.
        name: 'flock_day_rebuild كما في 0032',
        body: bodyOf('0032_round_visits.sql', 'private.flock_day_rebuild'),
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.a, on: day(-14), n: 0 }));
          return flagOf(oq, F.a, day(-14));
        },
        correct: (v) => v === true,
      },
      {
        // «قاعة 1» بعلفها المرسل اليوم ووزن عيّنة اليوم ولا علف مأكول: المعامل من صافي المرسل لا من المأكول (جواب المالك).
        name: 'report_days كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'private.report_days'),
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [F.a, TODAY, 50, '1000.0', uid()]);
          return (await inside(attempt, U.owner, 'select public.flock_cycle_report($1) as v', [F.a]))?.kpis?.fcr;
        },
        correct: (v) => typeof v === 'string' && Number(v) > 0,
      },
      {
        name: 'flock_cycle_report كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'public.flock_cycle_report'),
        run: async ({ attempt }) => (await inside(attempt, U.owner, 'select public.flock_cycle_report($1) as v', [F.a]))?.kpis?.feed_per_bird_kg,
        correct: (v) => typeof v === 'string' && Number(v) > 0,
      },
    ];
    const before = [];
    for (const c of OLD) {
      const real = await mutant(db, U.owner, [], (kit) => c.run(kit));
      const old = await mutant(db, U.owner, [], async (kit) => {
        await kit.oq(c.body);
        return c.run(kit);
      });
      before.push({ name: c.name, real: c.correct(real), caught: !c.correct(old), shown: JSON.stringify(real), old: JSON.stringify(old) });
    }
    t.same(before.filter((o) => !o.real || !o.caught).map((o) => `${o.name}: الحاليّ ${o.shown} والقبليّ ${o.old}`), [],
      `الأجسام القبلية (${OLD.length}) حرفاً تفشل كلّها بما يمسكه الفحص، والحاليّة تمرّ`);
  });

  // ── ١٠) ملفّ التراجع يرجّع الأجسام الأخيرة حرفاً ─────────────────────────────────────────────────────────────────────────
  await section('التراجع', async () => {
    const rollback = readFileSync(path.join(MIGRATIONS, 'rollback_0036.sql'), 'utf8');
    const BODIES = [['0035_hall_sheet.sql', 'public.save_flock_visit'], ['0035_hall_sheet.sql', 'public.save_flock_day'], ['0035_hall_sheet.sql', 'private.report_days'],
      ['0035_hall_sheet.sql', 'public.flock_cycle_report'], ['0032_round_visits.sql', 'private.flock_day_rebuild'], ['0029_bird_sales_close.sql', 'private.flock_summary'],
      ['0012_flocks_daily.sql', 'public.flocks_overview'], ['0012_flocks_daily.sql', 'private.flock_day_json']];
    const missing = BODIES.filter(([file, head]) => !rollback.includes(bodyOf(file, head))).map(([, head]) => head);
    same(missing, [], `ملفّ التراجع يرجّع الأجسام (${BODIES.length}) كما في آخر هجرة عرّفتها حرفاً`);
    const later = BODIES.map(([, head]) => head)
      .filter((head) => readFileSync(path.join(MIGRATIONS, '0036_round_once.sql'), 'utf8').split(`create or replace function ${head}(`).length !== 2);
    same(later, [], 'وكلّ جسم منها معرَّف في 0036 مرّة واحدة');
    t.ok(['drop function if exists public.set_flock_dead(uuid, date, integer, uuid, boolean);', 'drop function if exists public.add_flock_gas(uuid, date, integer, uuid, boolean);',
      'drop function if exists public.verify_round_once();', 'alter table public.flock_visits drop column if exists dead_entry;',
      'alter table public.flock_daily drop column if exists dead_entered;',
      "  add constraint flock_day_rejects_reason_check check (reason in ('flock_closed', 'out_of_scope', 'date_too_old', 'period_locked'));"].every((line) => rollback.includes(line)),
    'ويُسقط الكاتبين والثابت والعمودين، ويرجّع قيد أسباب الركن كما في 0012');
    // فرع الزيارة المركونة بسبب dead_recorded في طريق الرفض (والقيد القديم حارس ثانٍ: بلا الفرع يرفض بصوت أيضاً، فلا بذرة له في BLOCKING_SEEDS)، داخل
    // معاملة صاحب الجداول ترجع: الفروع الثلاثة الأخرى مطفأة (بيانات الحزمة تحملها)، فيرفض بفرعه وتلميحه؛ وبلا فرعه يرفضه القيد عند إعادته.
    const branches = (sql) => sql.replace('if v_zero > 0 then', 'if false then').replace('if v_dead > 0 then', 'if false then').replace('if v_gas > 0 then', 'if false then');
    const refusals = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const parked = await inside(attempt, U.worker, VISIT, visitParams({ flock: F.a, on: day(-1), dead: 2, queued: true }));
      const run = async (sql) => {
        await oq('savepoint rollback_probe');
        try {
          await oq(sql);
          return 'كمل';
        } catch (error) {
          return `${error.message}|${error.hint ?? error.constraint ?? ''}`;
        } finally {
          await oq('rollback to savepoint rollback_probe');
        }
      };
      // العدد في القاعدة كلّها (ملفّات الحزمة الأخرى تركن أيضاً).
      const count = (await oq("select count(*)::int as n from public.flock_day_rejects where reason = 'dead_recorded'")).rows[0].n;
      return { parked, count, real: await run(branches(rollback)), unguarded: await run(branches(rollback).replace('if v_recorded > 0 then', 'if false then')) };
    });
    t.ok(refusals.parked?.status === 'parked' && refusals.parked?.reason === 'dead_recorded' && refusals.count > 0 && refusals.real.startsWith('rollback_blocked|')
      && refusals.real.includes(`الزيارات المركونة لأنّ هلاكات يومها مسجّلة: ${refusals.count}،`),
    `التراجع يرفض الزيارة المركونة بسبب dead_recorded بفرعه وتلميحه (${refusals.count}: ${refusals.real})`);
    t.ok(refusals.unguarded !== 'كمل' && refusals.unguarded.includes('flock_day_rejects_reason_check'), `وبلا فرعه يرفضه قيد 0012 عند إعادته (${refusals.unguarded})`);
  });

  same(await db.asService(verifyOf), VERIFY_ZERO, 'الثابت صفر في نهاية الملفّ');
  if (process.env.ROUND_ONCE_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/round-once.test.mjs بـROUND_ONCE_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات. flocks_overview للمنشأة: «قاعة 1» لاحم بهلاكات اليوم وعلفه (ومعه علف أمس المرسل اليوم، وملغى، وذرة، ودواء) وغازه، و«قاعة 2» بلا شيء اليوم، و«قاعة 3» مغلقة، و«قاعة البيّاض» ببيض اليوم.`,
      flocks_overview: samples.flocks_overview,
      set_flock_dead_saved: samples.set_flock_dead_saved,
      set_flock_dead_recorded: samples.set_flock_dead_recorded,
      set_flock_dead_parked: samples.set_flock_dead_parked,
      add_flock_gas_saved: samples.add_flock_gas_saved,
      add_flock_gas_parked: samples.add_flock_gas_parked,
    }, null, 1) + '\n');
  }

  /** علف اليوم وغازه من سطر اليوم في الورقة. */
  function rowsOfToday(s) {
    const row = s.days.find((d) => d.on === TODAY);
    return { feed_kg: row?.feed_kg ?? null, gas: row?.gas ?? null };
  }
}
