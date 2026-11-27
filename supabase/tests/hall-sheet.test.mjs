// القاعة كالورقة (0035، العقد docs/plans/0034/contract-0034.md «الجزء ب»): أيّ يوم من أيّام وجبة قائمة يُكتب (flock_day_check، وsave_flock_day
// وsave_flock_visit وrecord_flock_weight بلا حدّ الأيّام السبعة)، والغاز (flock_day_gas وset_flock_gas)، والعلف من «رصيد العلف» بيومه (flock_issues.for_day
// وsend_flock_feed)، والورقة (hall_sheet) وحسم المركون (decide_flock_reject)، والرصيد اليوميّ بقسمين (day_balance_sections)، والتقارير بيوم القاعة والغاز
// (report_days وreport_day وhalls_day_totals وflock_cycle_report وhalls_history وflock_month)، والحرّاس (edit_flock وflock_activity_after)، والثابت
// verify_hall_sheet. منشأة هذا الملفّ: المعرّفات d3535000 والهواتف 96477035350 (ومنشأة ثانية بالمعرّفات d3535000-…-0000000009xx والهواتف 9647703535090+).
// الفحوص كلّها بالمالك (0035 لا تعتمد على 0034). البذرة: حقل لحم بأربع قاعات — «قاعة 7» (1,000 طير قبل 30 يوماً، بلا نهاية جدول ← عمر 45)، و«قاعة 8»
// (500 قبل عشرة أيّام، جدول قاعتها ينتهي بعمر 35)، و«قاعة 9» (300 قبل 20 يوماً تُغلق قبل يومين)، و«قاعة 10» (200 قبل 50 يوماً: بعد عمر 45 والورقة حتى
// اليوم) — وحقل بيض بقاعة (2,000 قبل عشرة أيّام). والطفرات داخل معاملة صاحب الجداول ترجع: كلّ قاعدة مكسورة (ومنها الجسم القديم) يمسكها فحصها.
// ومراجعة 0035 (كلّ فحص منها فشل على c69c13f): الحسم بنسخة المركون (stale_reject) والركن من جديد يكبّرها من الجولة والزيارة والغاز؛ وعلف الورقة ومعاملها
// بالراجع عند الإغلاق والمنقول إليها (= fcr_final، وsheet_fcr_final في الثابت) في «قاعة 11» داخل معاملة ترجع؛ و«المتاح» أكبر ما في مخزن علف واحد؛
// وdelete_flock يسمّي «الغاز» ويحذف الممسوح.
// وعيّنات القاعدة الحقيقية للشاشات: HALL_SHEET_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/hall-sheet-0035.json.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { race } from './shared.mjs';
import { postedOpening } from './stock-kit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet-0035.json');
const TODAY = '2026-11-21';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `d3535000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477035350${String(n).padStart(2, '0')}`;
/** وقت تسجيل قبل الآن بدقائق (ساعة الخادم الحقيقية، فلا bad_time أيّاً كان يوم تشغيل الحزمة). */
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const VISIT = 'select public.save_flock_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const WEIGHT = 'select public.record_flock_weight($1, $2, $3, $4, $5) as v';
const GAS = 'select public.set_flock_gas($1, $2, $3, $4, $5, $6) as v';
const SEND = 'select public.send_flock_feed($1, $2, $3, $4, $5, $6, $7) as v';
const SHEET = 'select public.hall_sheet($1) as v';
const SECTIONS = 'select public.day_balance_sections($1) as v';
const DECIDE = 'select public.decide_flock_reject($1, $2, $3) as v';
const VOID = 'select public.void_flock_issue($1, $2, $3) as v';
const SIG = {
  day: 'public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean, integer[])',
  visit: 'public.save_flock_visit(uuid, uuid, date, timestamp with time zone, integer, integer, numeric, integer, integer, integer, text, integer, boolean, uuid, boolean)',
  weight: 'public.record_flock_weight(uuid, date, integer, numeric, uuid)',
  gas: 'public.set_flock_gas(uuid, date, integer, bigint, uuid, boolean)',
  send: 'public.send_flock_feed(uuid, uuid, uuid, uuid, uuid, numeric, date)',
  sheet: 'public.hall_sheet(uuid)',
  sections: 'public.day_balance_sections(date)',
  decide: 'public.decide_flock_reject(uuid, text, integer)',
  deleteFlock: 'public.delete_flock(uuid, integer, uuid)',
  check: 'private.flock_day_check(public.flocks, date)',
  reportDays: 'private.report_days(public.flocks, date)',
  reportDay: 'private.report_day(public.flocks, date, date)',
  totals: 'private.halls_day_totals(jsonb)',
  activity: 'private.flock_activity_after(public.flocks, date)',
  edit: 'public.edit_flock(uuid, integer, date, integer, integer, text, uuid, integer[])',
};
const VERIFY_ZERO = { for_day_range: 0, gas_days: 0, gas_versions: 0, gas_hall: 0, sheet_totals: 0, sheet_feed_by_day: 0, sheet_fcr_final: 0 };

const dayParams = (d) => [d.flock, d.on === undefined ? TODAY : d.on, d.dead ?? null, d.culled ?? null, d.feed ?? null, null, null, null, d.eggs ?? null, null, null,
  d.note ?? null, d.base ?? null, d.ref ?? uid(), d.queued ?? false];
const visitParams = (v) => [v.id ?? uid(), v.flock, v.on === undefined ? TODAY : v.on, ago(60), v.dead ?? null, v.culled ?? null, null, null, null, null, v.note ?? null,
  null, false, v.ref ?? uid(), v.queued ?? false];
const gasParams = (g) => [g.flock, g.on === undefined ? TODAY : g.on, g.n ?? null, g.base ?? null, g.ref ?? uid(), g.queued ?? false];
const sendParams = (s) => [s.ref ?? uid(), 'issue' in s ? s.issue : uid(), s.line ?? uid(), s.flock, s.item, s.qty, s.on === undefined ? TODAY : s.on];

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
    name: 'مزرعة الورقة',
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
  const saveDay = (user, d) => call(db, user, DAY, dayParams(d));
  const visit = (user, v) => call(db, user, VISIT, visitParams(v));
  const gas = (user, g) => call(db, user, GAS, gasParams(g));
  const send = (user, s) => call(db, user, SEND, sendParams(s));
  const sheet = async (flock, user = U.owner) => one(user, SHEET, [flock]);
  const verifyOf = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_hall_sheet()')).rows.map((r) => [r.check_name, r.v]));
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  const rowOf = (s, on) => s.days.find((d) => d.on === on);

  // ── البذرة ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const feedStoreName = (await db.admin('select name from public.warehouses where id = $1', [W.feed])).rows[0].name;
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const S = { a: await site('broiler', 'حقل الورقة'), l: await site('layer', 'حقل البيض') };
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { a: await hall(S.a, 'قاعة 7'), b: await hall(S.a, 'قاعة 8'), c: await hall(S.a, 'قاعة 9'), d: await hall(S.a, 'قاعة 10'), l: await hall(S.l, 'قاعة البيّاض') };
  await one(U.owner, "select public.save_hall_vaccine_program($1, 35, '[]'::jsonb, 0) as v", [H.b]);
  const place = async (hallId, on, count) => (await one(U.owner, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const F = { a: await place(H.a, day(-30), 1000), b: await place(H.b, day(-10), 500), c: await place(H.c, day(-20), 300), d: await place(H.d, day(-50), 200), l: await place(H.l, day(-10), 2000) };
  const item = (name, kind, unit = 'kg') => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = {
    starter: await item('علف بادئ', 'feed'),
    finisher: await item('علف ناهي', 'feed'),
    empty: await item('علف بلا رصيد', 'feed'),
    corn: await item('ذرة صفراء', 'raw'),
    vitamin: await item('فيتامين', 'medicine'),
  };
  const bag = (itemId) => one(U.owner, "insert into public.item_units (item_id, label, factor_to_base, is_default) values ($1, 'كيس 50 كغم', 50, true) returning id", [itemId]);
  const bags = { starter: await bag(I.starter), finisher: await bag(I.finisher) };
  const category = await one(U.owner, "insert into public.item_categories (name) values ('أعلاف') returning id");
  await one(U.owner, 'update public.items set category_id = $1 where id = $2 returning id', [category, I.finisher]);
  await postedOpening(db, U.owner, W.feed, day(-5), [{ item: I.starter, qty: 2000, value: '1000000.00' }, { item: I.finisher, qty: 1000, value: '600000.00' }]);
  await postedOpening(db, U.owner, W.raw, day(-5), [{ item: I.corn, qty: 500, value: '200000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-5), [{ item: I.vitamin, qty: 10, value: '50000.00' }]);
  const party = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر الورقة', true) returning id");

  // افتتاح بمخزن داخل معاملة طفرة (المالك، بالدوالّ الحقيقية).
  async function postedOpeningInside(oq, attempt, wh, itemId, qty = 500) {
    const doc = await inside(attempt, U.owner, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, $2) returning id as v', [wh, day(-5)]);
    await inside(attempt, U.owner, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, $3, 100000) returning id as v', [doc, itemId, qty]);
    await inside(attempt, U.owner, "select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), gen_random_uuid()) ->> 'status' as v", [doc]);
  }
  // مخزن علف جديد بنطاق المالك داخل معاملة طفرة.
  async function feedStoreInside(oq, name) {
    await oq("insert into public.warehouses (org_id, division_id, site_id, name, kind) select org_id, division_id, site_id, $2, 'feed' from public.warehouses where id = $1", [W.feed, name]);
    return (await oq('select id from public.warehouses where org_id = $1 and name = $2', [org, name])).rows[0].id;
  }
  // مراجعة 0035 (العلف الراجع والمنقول)، داخل معاملة طفرة: «قاعة 11» بوجبة 300 طير قبل 20 يوماً، صُرف لها قبل أربعة أيّام 200 كغم بادئاً و30 كغم ناهياً،
  // وبيع منها 100 طير (240 كغم صافياً) قبل ثلاثة أيّام، وأُغلقت قبل يومين بإرجاع 150 كغم من البادئ إلى «رصيد العلف» ونقل الناهي كلّه للدورة التالية؛
  // ثمّ وجبة جديدة في القاعة نفسها أمس يدخلها المنقول يوم تسكينها.
  async function returnsScenario(attempt) {
    const must = async (sql, params) => {
      const value = await inside(attempt, U.owner, sql, params);
      if (value && typeof value === 'object' && typeof value.code === 'string' && 'hint' in value) throw new Error(`${sql}: ${value.code} ${value.hint}`);
      return value;
    };
    const hallId = await must("insert into public.halls (site_id, name) values ($1, 'قاعة 11') returning id as v", [S.a]);
    const p = (await must('select public.open_flock($1, $2, 300, 0, null, $3) as v', [hallId, day(-20), uid()])).flock_id;
    await must('select public.record_flock_issue($1, $2, $3, $4, $5, 200, $6, $7) as v', [uid(), uid(), uid(), p, I.starter, day(-4), W.feed]);
    await must('select public.record_flock_issue($1, $2, $3, $4, $5, 30, $6, $7) as v', [uid(), uid(), uid(), p, I.finisher, day(-4), W.feed]);
    const ticketId = uid();
    const data = { site_id: S.a, on_date: day(-3), method: 'scale', empty_kg: '7000', empty_with_crates: false, crate_kg: '6',
      stops: [{ id: uid(), hall_id: hallId, birds: 100, crates: 10, gross_kg: '7300', weighings: [] }] };
    await must('select public.save_weigh_ticket($1, null, $2::jsonb) as v', [ticketId, JSON.stringify(data)]);
    await must('select public.finish_weigh_ticket($1, $2, 1) as v', [uid(), ticketId]);
    await must('select public.record_bird_sale($1, $2, $3, 2, $4, 2750, 0, 0, null, null) as v', [uid(), uid(), ticketId, party]);
    const form = await must('select public.flock_close_form($1) as v', [p]);
    const pools = form.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }));
    const lines = [{ item_id: I.starter, qty: '150', action: 'return', warehouse_id: W.feed }, { item_id: I.finisher, qty: '30', action: 'carry' }];
    await must("select public.close_flock($1, $2, $3, $4, $5, 100, $6::jsonb, 'بيعت خارج النظام', $7::jsonb, null, $8) as v",
      [uid(), uid(), p, day(-2), form.flock.live, JSON.stringify(pools), JSON.stringify(lines), form.plan]);
    const q = (await must('select public.open_flock($1, $2, 300, 0, null, $3) as v', [hallId, day(-1), uid()])).flock_id;
    return { hallId, p, q };
  }

  // ── ١) أيّ يوم من أيّام الوجبة القائمة ─────────────────────────────────────────────────────────────────────────────────
  await section('الأيّام الفائتة', async () => {
    const late = {
      day20: await saveDay(U.owner, { flock: F.a, on: day(-20), dead: 3, culled: 2 }),
      visit25: await visit(U.owner, { flock: F.a, on: day(-25), dead: 1 }),
      queued18: await saveDay(U.owner, { flock: F.a, on: day(-18), dead: 2, queued: true }),
      weight15: await call(db, U.owner, WEIGHT, [F.a, day(-15), 50, '900.0', uid()]),
      worker29: await saveDay(U.worker, { flock: F.a, on: day(-29), note: 'تسجيل متأخّر' }),
    };
    same(Object.fromEntries(Object.entries(late).map(([k, r]) => [k, r.ok ? r.value.status : r.code])),
      { day20: 'saved', visit25: 'saved', queued18: 'saved', weight15: 'saved', worker29: 'saved' },
      'وجبة قائمة: الجولة قبل 20 يوماً (بمستبعد قديم)، والزيارة قبل 25 يوماً، ومن الطابور قبل 18 يوماً، والوزن قبل 15 يوماً، وعامل القاعة قبل 29 يوماً — كلّها تُحفظ بلا حدّ الأيّام السبعة');
    same({
      future: code(await saveDay(U.owner, { flock: F.a, on: day(1), dead: 1 })),
      before: code(await saveDay(U.owner, { flock: F.a, on: day(-31), dead: 1 })),
      beforeQueued: code(await saveDay(U.owner, { flock: F.a, on: day(-31), dead: 1, queued: true })),
      weightBefore: code(await call(db, U.owner, WEIGHT, [F.a, day(-31), 50, '900.0', uid()])),
      weightFuture: code(await call(db, U.owner, WEIGHT, [F.a, day(1), 50, '900.0', uid()])),
      weightNull: code(await call(db, U.owner, WEIGHT, [F.a, null, 50, '900.0', uid()])),
      weightInfinite: code(await call(db, U.owner, WEIGHT, [F.a, 'infinity', 50, '900.0', uid()])),
      visitFuture: code(await visit(U.owner, { flock: F.a, on: day(1), dead: 1 })),
    }, {
      future: 'date_in_future', before: 'before_placement', beforeQueued: 'before_placement', weightBefore: 'before_placement', weightFuture: 'date_in_future',
      weightNull: 'date_required', weightInfinite: 'date_required', visitFuture: 'date_in_future',
    }, 'المستقبل وما قبل التسكين يُرفضان (ومن الطابور كذلك)، ويوم الوزن من التقويم');
    const hint = (await call(db, U.owner, WEIGHT, [F.a, day(-31), 50, '900.0', uid()])).hint;
    t.ok(hint.includes('قاعة 7') && hint.includes('22/10/2026'), `تلميح before_placement يسمّي القاعة ويوم التسكين (${hint})`);
  });

  // ── البيع: تذكرة قبل يومين بمئة طير (240 كغم صافياً) تُفوتر اليوم ───────────────────────────────────────────────────────────
  const ticket = uid();
  await db.setToday(day(-2), async () => {
    const data = { site_id: S.a, on_date: day(-2), method: 'scale', empty_kg: '7000', empty_with_crates: false, crate_kg: '6',
      stops: [{ id: uid(), hall_id: H.a, birds: 100, crates: 10, gross_kg: '7300', weighings: [] }] };
    await one(U.owner, 'select public.save_weigh_ticket($1, null, $2::jsonb) as v', [ticket, JSON.stringify(data)]);
    await one(U.owner, 'select public.finish_weigh_ticket($1, $2, 1) as v', [uid(), ticket]);
  });
  await one(U.owner, 'select public.record_bird_sale($1, $2, $3, 2, $4, 2750, 0, 0, null, null) as v', [uid(), uid(), ticket, party]);

  // ── الإغلاق: «قاعة 9» تُغلق قبل يومين بفرق العدّ (300 حيّة) ─────────────────────────────────────────────────────────────
  await db.setToday(day(-2), async () => {
    const plan = await one(U.owner, "select public.flock_close_form($1) ->> 'plan' as v", [F.c]);
    await one(U.owner, "select public.close_flock($1, $2, $3, $4, 300, 0, '[]'::jsonb, 'بيعت خارج النظام', '[]'::jsonb, null, $5) as v", [uid(), uid(), F.c, day(-2), plan]);
  });

  await section('الوجبة المغلقة', async () => {
    const parked = await saveDay(U.owner, { flock: F.c, on: day(-5), dead: 1, queued: true });
    same({
      direct: code(await saveDay(U.owner, { flock: F.c, on: day(-5), dead: 1 })),
      queued: parked.ok ? parked.value : parked.code,
      visit: code(await visit(U.owner, { flock: F.c, on: day(-5), dead: 1 })),
      weight: code(await call(db, U.owner, WEIGHT, [F.c, day(-5), 50, '900.0', uid()])),
    }, { direct: 'flock_closed', queued: { status: 'parked', reason: 'flock_closed' }, visit: 'flock_closed', weight: 'flock_closed' },
    'الوجبة المغلقة: بنداء مباشر flock_closed، ومن الطابور parked');
  });

  // ── ٢) الغاز ────────────────────────────────────────────────────────────────────────────────────────────────────
  const gasRow = async (flock, on) => (await db.admin('select cylinders, version::int as version from public.flock_day_gas where flock_id = $1 and on_date = $2', [flock, on])).rows[0] ?? null;
  await section('الغاز', async () => {
    const ref1 = uid();
    const first = await gas(U.owner, { flock: F.a, on: day(-3), n: 2, ref: ref1 });
    same(first.value, { status: 'saved', gas: { on: day(-3), cylinders: 2, version: 1 } }, 'أوّل غاز ليوم: saved بالنسخة 1');
    samples.set_flock_gas_saved = first.value;
    same((await gas(U.owner, { flock: F.a, on: day(-3), n: 2, ref: ref1 })).value, first.value, 'الإعادة بالمرجع نفسه = الجواب الأوّل');
    same(code(await gas(U.owner, { flock: F.a, on: day(-3), n: 9, ref: ref1 })), 'ref_reused', 'المرجع نفسه بقيمة أخرى ref_reused');
    same((await gas(U.owner, { flock: F.a, on: day(-3), n: 2 })).value, { status: 'saved', gas: { on: day(-3), cylinders: 2, version: 1 } },
      'القيمة نفسها بمرجع جديد ولو بلا نسخة: حُفظت بلا نسخة جديدة');
    same((await gas(U.owner, { flock: F.a, on: day(-3), n: 3, base: 1 })).value, { status: 'saved', gas: { on: day(-3), cylinders: 3, version: 2 } }, 'التعديل بنسخته: النسخة 2');
    const stale = await gas(U.worker, { flock: F.a, on: day(-3), n: 4, base: 1 });
    same(stale.value, { status: 'stale_gas', server: { on: day(-3), cylinders: 3, version: 2 } }, 'التعديل بنسخة قديمة: stale_gas بما في الخادم');
    samples.set_flock_gas_stale = stale.value;
    same((await gas(U.owner, { flock: F.a, on: day(-3), n: 4 })).value?.status, 'stale_gas', 'بلا نسخة وفي الخادم صفّ: stale_gas');
    same(await gasRow(F.a, day(-3)), { cylinders: 3, version: 2 }, 'الرفضان لا يكتبان');
    // اليوم الفائت قبل 29 يوماً، ويوم يُمسح: الصفّ يبقى بنسخة أكبر.
    same((await gas(U.owner, { flock: F.a, on: day(-29), n: 1 })).value?.gas, { on: day(-29), cylinders: 1, version: 1 }, 'غاز يوم قبل 29 يوماً لوجبة قائمة');
    await one(U.owner, GAS, gasParams({ flock: F.a, on: day(-1), n: 5 }));
    same((await gas(U.owner, { flock: F.a, on: day(-1), n: null, base: 1 })).value, { status: 'saved', gas: { on: day(-1), cylinders: null, version: 2 } },
      'المسح: عدد فارغ بنسخة أكبر');
    same((await gas(U.owner, { flock: F.a, on: day(-1), n: null })).value, { status: 'saved', gas: { on: day(-1), cylinders: null, version: 2 } },
      'المسح مرّة ثانية: حُفظ بلا نسخة جديدة');
    same(await gasRow(F.a, day(-1)), { cylinders: null, version: 2 }, 'صفّ الغاز الممسوح باقٍ (درس ABA)');
    same((await gas(U.owner, { flock: F.a, on: day(-1), n: 6, base: 1 })).value?.status, 'stale_gas', 'بعد المسح: نسخة قبله stale_gas (لا ترجع النسخة)');
    same((await gas(U.owner, { flock: F.a, on: day(-6), n: null })).value, { status: 'saved', gas: { on: day(-6), cylinders: null, version: null } },
      'مسح يوم بلا صفّ: حُفظ بلا كتابة');
    t.eq(await gasRow(F.a, day(-6)), null, 'ولا صفّ له');
    await one(U.owner, GAS, gasParams({ flock: F.b, on: day(-3), n: 2 }));
    await one(U.owner, GAS, gasParams({ flock: F.d, on: day(-3), n: 1 }));
    same({
      over: code(await gas(U.owner, { flock: F.a, on: day(-4), n: 1001 })),
      negative: code(await gas(U.owner, { flock: F.a, on: day(-4), n: -1 })),
      future: code(await gas(U.owner, { flock: F.a, on: day(1), n: 1 })),
      futureQueued: code(await gas(U.owner, { flock: F.a, on: day(1), n: 1, queued: true })),
      before: code(await gas(U.owner, { flock: F.a, on: day(-31), n: 1 })),
      required: code(await gas(U.owner, { flock: F.a, on: null, n: 1 })),
      missing: code(await gas(U.owner, { flock: id(999), on: day(-4), n: 1 })),
      closed: code(await gas(U.owner, { flock: F.c, on: day(-4), n: 1 })),
      // 0034 («الكلّ مثل المالك»): المشاهد والأمين وعامل اللحم في وجبة البيض يكتبون الغاز كالمالك (بمعاملة ترجع، فلا صفّ بعدها).
      viewer: (await call(db, U.viewer, GAS, gasParams({ flock: F.a, on: day(-4), n: 1 }), { commit: false })).value?.status,
      keeper: (await call(db, U.keeper, GAS, gasParams({ flock: F.a, on: day(-4), n: 1 }), { commit: false })).value?.status,
      scope: (await call(db, U.worker, GAS, gasParams({ flock: F.l, on: day(-4), n: 1 }), { commit: false })).value?.status,
    }, {
      over: 'bad_value', negative: 'bad_value', future: 'date_in_future', futureQueued: 'date_in_future', before: 'before_placement', required: 'date_required',
      missing: 'flock_not_found', closed: 'flock_closed', viewer: 'saved', keeper: 'saved', scope: 'saved',
    }, 'set_flock_gas: كلّ رمز رفض بنداء مباشر، وكلّ عضو يكتب الغاز (0034)');
    t.eq(await gasRow(F.a, day(-4)), null, 'ولا صفّ غاز من رفض (ولا من نداء رجعت معاملته)');
    // الركن من الطابور: الوجبة المغلقة، والأحدث للكاتب واليوم يستبدل الأقدم، ولا يكتب فوق جولة مركونة لليوم نفسه.
    const parked = await gas(U.owner, { flock: F.c, on: day(-5), n: 2, queued: true });
    same(parked.value, { status: 'parked', reason: 'flock_closed' }, 'غاز لوجبة مغلقة من الطابور: parked');
    same((await gas(U.owner, { flock: F.c, on: day(-5), n: 4, queued: true })).value, { status: 'parked', reason: 'flock_closed' }, 'وغاز أحدث لليوم نفسه');
    // 0034: لا «خارج النطاق» لعضو في منشأته، فعامل اللحم يكتب غاز وجبة البيض من الطابور (بمعاملة ترجع)؛ ووجبة ليست في المنشأة flock_not_found لا ركن.
    same([(await call(db, U.worker, GAS, gasParams({ flock: F.l, on: day(-4), n: 1, queued: true }), { commit: false })).value?.status,
      code(await gas(U.worker, { flock: id(996), on: day(-4), n: 1, queued: true }))], ['saved', 'flock_not_found'], 'من الطابور: وجبة البيض لعامل اللحم تُحفظ، ووجبة ليست في المنشأة ترفض');
    const rejects = (await db.admin("select payload, reason, visit_id is not null as keyed from public.flock_day_rejects where flock_id = $1 and on_date = $2 order by payload ? 'gas'", [F.c, day(-5)])).rows;
    same(rejects, [{ payload: { dead: 1, culled: null, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, base_version: null }, reason: 'flock_closed', keyed: false },
      { payload: { gas: 4 }, reason: 'flock_closed', keyed: true }], 'المركون: الجولة كما هي، والغاز صفّ واحد بأحدث قيمته (payload {"gas": 4}) لا يكتب فوقها');
    t.eq(await gasRow(F.c, day(-5)), null, 'المركون بلا أثر على الغاز');
  });

  await section('الغاز: جلستان لليوم نفسه', async () => {
    const raced = await race(db, { user: U.owner, sql: GAS, params: gasParams({ flock: F.a, on: day(-7), n: 5 }) },
      { user: U.worker, sql: GAS, params: gasParams({ flock: F.a, on: day(-7), n: 6 }) });
    same([raced.first, raced.state, raced.second, raced.rows[1]?.[0]?.v], ['ok', 'blocked', 'ok', { status: 'stale_gas', server: { on: day(-7), cylinders: 5, version: 1 } }],
      'كاتبان بلا نسخة ليوم واحد: الثاني ينتظر صفّ الوجبة ثمّ يرى غاز الأوّل (stale_gas) ولا يكتب فوقه');
    same(await gasRow(F.a, day(-7)), { cylinders: 5, version: 1 }, 'والصفّ بقيمة الأوّل');
    const control = await race(db, { user: U.owner, sql: GAS, params: gasParams({ flock: F.a, on: day(-8), n: 5 }), rollback: true },
      { user: U.worker, sql: GAS, params: gasParams({ flock: F.a, on: day(-8), n: 6 }) });
    same([control.state, control.rows[1]?.[0]?.v], ['blocked', { status: 'saved', gas: { on: day(-8), cylinders: 6, version: 1 } }], 'ضابط: الأوّل يرجع فيُحفظ الثاني');
    // أُعيد اليومان إلى ما كانا عليه كي لا يغيّرا العيّنات: صفّ يوم قبل 7 أيّام يبقى (لا حذف)، فيُمسح بنسخته.
    await one(U.owner, GAS, gasParams({ flock: F.a, on: day(-7), n: null, base: 1 }));
    await one(U.owner, GAS, gasParams({ flock: F.a, on: day(-8), n: null, base: 1 }));
  });

  // ── ٣) «أرسل علفاً» ─────────────────────────────────────────────────────────────────────────────────────────────
  const balance = async (itemId, wh = W.feed) => (await db.admin('select trim_scale(qty)::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [itemId, wh])).rows[0]?.q ?? '0';
  const sends = {};
  await section('أرسل علفاً', async () => {
    const todayRef = uid();
    sends.today = { ref: todayRef, issue: uid(), line: uid(), flock: F.a, item: I.starter, qty: '100', on: TODAY };
    const first = await send(U.owner, sends.today);
    same(first.ok && { status: first.value.status, unit: first.value.issue.unit, qty: first.value.issue.qty, issued: first.value.issue.issued_on, forDay: first.value.issue.for_day,
      day: first.value.day, doc: /^FI-2026-\d{4,}$/u.test(first.value.issue.doc_no), name: first.value.issue.item_name },
    { status: 'saved', unit: 'kg', qty: '100.000', issued: TODAY, forDay: TODAY, day: { on: TODAY, feed_kg: '100.000' }, doc: true, name: 'علف بادئ' }, 'علف اليوم: saved برقم FI ويومه اليوم');
    t.eq(await balance(I.starter), '1900', '«رصيد العلف» نقص 100 كغم');
    same((await send(U.owner, sends.today)).value, first.value, 'الإعادة بالمرجع نفسه = الجواب الأوّل');
    same((await send(U.owner, { ...sends.today, ref: uid() })).value?.issue, first.value.issue, 'المعرّفات نفسها والمحتوى نفسه بمرجع جديد = الصرف نفسه');
    same(code(await send(U.owner, { ...sends.today, ref: uid(), qty: '101' })), 'id_conflict', 'المعرّف نفسه بمحتوى آخر id_conflict');
    same(code(await send(U.owner, { ...sends.today, ref: uid(), on: day(-1) })), 'id_conflict', 'والمعرّف نفسه بيوم آخر id_conflict');
    t.eq(await balance(I.starter), '1900', 'والإعادات لا تصرف مرّة ثانية');

    // العلف المتأخّر: يخرج من المخزن اليوم، ويظهر على يومه.
    sends.late = { ref: uid(), issue: uid(), line: uid(), flock: F.a, item: I.finisher, qty: '50', on: day(-20) };
    const late = await send(U.owner, sends.late);
    same(late.ok && { issued: late.value.issue.issued_on, forDay: late.value.issue.for_day, day: late.value.day },
      { issued: TODAY, forDay: day(-20), day: { on: day(-20), feed_kg: '50.000' } }, 'علف ليوم قبل 20 يوماً: خرج اليوم ويخصّ يومه');
    samples.send_flock_feed = late.value;
    const moved = (await db.admin("select distinct moved_on::text as d from public.stock_moves where doc_kind = 'flock_issue' and doc_id = $1", [sends.late.issue])).rows.map((r) => r.d);
    same(moved, [TODAY], 'حركة المخزون بتاريخ التسجيل (جواب المالك)');
    t.eq(await balance(I.finisher), '950', '«رصيد العلف» من العلف الناهي نقص 50 كغم');

    // يُلغى فتسقط خانته.
    sends.voided = { ref: uid(), issue: uid(), line: uid(), flock: F.a, item: I.starter, qty: '30', on: day(-10) };
    await one(U.owner, SEND, sendParams(sends.voided));
    t.eq(rowOf(await sheet(F.a), day(-10)).feed_kg, '30.000', 'قبل الإلغاء: خانة يوم قبل عشرة أيّام 30 كغم');
    await one(U.owner, VOID, [sends.voided.issue, 'كمية خاطئة', uid()]);
    same((({ feed_kg: kg, feed }) => ({ kg, feed }))(rowOf(await sheet(F.a), day(-10))), { kg: null, feed: [] }, 'بعد الإلغاء تسقط الخانة وسطرها');
    same(code(await send(U.owner, sends.voided)), 'id_conflict', 'الإعادة بمرجع صرف أُلغي: id_conflict (لا «حُفظ»)');
    t.eq(await balance(I.starter), '1900', 'والإلغاء أعاد الكمية');

    // للوجبة الثانية: علف وذرة بالصرف العاديّ (للأكياس الفارغة)، وغاز.
    await one(U.owner, SEND, sendParams({ flock: F.b, item: I.starter, qty: '40', on: day(-1) }));
    await one(U.owner, 'select public.record_flock_issue($1, $2, $3, $4, $5, 10, $6, $7) as v', [uid(), uid(), uid(), F.b, I.corn, TODAY, W.raw]);
    // ودواء للوجبة الأولى من «أعطِ للقاعات» (لا يُعدّ علفاً).
    await one(U.owner, "select public.give_to_flocks($1, $2, jsonb_build_array(jsonb_build_object('kind', 'issue', 'flock_id', $3::uuid, 'issue_id', gen_random_uuid(), 'line_id', gen_random_uuid(), 'item_id', $4::uuid, 'warehouse_id', $5::uuid, 'qty', '1'))) as v",
      [uid(), TODAY, F.a, I.vitamin, W.medicine]);

    const short = await send(U.owner, { flock: F.a, item: I.starter, qty: '100000' });
    same(code(short), 'insufficient_stock', 'أكثر ممّا في «رصيد العلف»: insufficient_stock');
    t.ok(short.hint.includes(feedStoreName) && short.hint.includes('1,860') && short.hint.includes('100,000'), `التلميح يسمّي «${feedStoreName}» وما فيه (${short.hint})`);
    const corn = await send(U.owner, { flock: F.a, item: I.corn, qty: '1' });
    same([code(corn), code(await send(U.owner, { flock: F.a, item: I.vitamin, qty: '1' }))], ['not_feed', 'not_feed'], 'الذرة والدواء ليسا علفاً: not_feed');
    t.ok(corn.hint.includes('ذرة صفراء'), `تلميح not_feed يسمّي المادّة (${corn.hint})`);
    same({
      empty: code(await send(U.owner, { flock: F.a, item: I.empty, qty: '1' })),
      future: code(await send(U.owner, { flock: F.a, item: I.starter, qty: '1', on: day(1) })),
      before: code(await send(U.owner, { flock: F.a, item: I.starter, qty: '1', on: day(-31) })),
      required: code(await send(U.owner, { flock: F.a, item: I.starter, qty: '1', on: null })),
      closed: code(await send(U.owner, { flock: F.c, item: I.starter, qty: '1', on: day(-5) })),
      zero: code(await send(U.owner, { flock: F.a, item: I.starter, qty: '0' })),
      scale: code(await send(U.owner, { flock: F.a, item: I.starter, qty: '1.2345' })),
      missingItem: code(await send(U.owner, { flock: F.a, item: id(998), qty: '1' })),
      missingFlock: code(await send(U.owner, { flock: id(999), item: I.starter, qty: '1' })),
      noIds: code(await send(U.owner, { flock: F.a, item: I.starter, qty: '1', issue: null })),
      // 0034: عامل القاعة والمشاهد يرسلان العلف كالمالك (بمعاملة ترجع، فلا يتغيّر الرصيد).
      worker: (await call(db, U.worker, SEND, sendParams({ flock: F.a, item: I.starter, qty: '1' }), { commit: false })).value?.status,
      viewer: (await call(db, U.viewer, SEND, sendParams({ flock: F.a, item: I.starter, qty: '1' }), { commit: false })).value?.status,
    }, {
      empty: 'insufficient_stock', future: 'date_in_future', before: 'before_placement', required: 'date_required', closed: 'flock_closed', zero: 'qty_not_positive',
      scale: 'qty_not_positive', missingItem: 'item_not_found', missingFlock: 'flock_not_found', noIds: 'id_required', worker: 'saved', viewer: 'saved',
    }, 'send_flock_feed: كلّ رمز رفض، وعامل القاعة والمشاهد يرسلان (0034)');
    t.eq(await balance(I.starter), '1860', 'والرفوض لا تصرف شيئاً (1,900 − 40 للوجبة الثانية)');
  });

  // ── منشأة بلا مخزن علف ────────────────────────────────────────────────────────────────────────────────────────────
  await section('بلا مخزن علف', async () => {
    const G2 = await makeOrg(db, { name: 'مزرعة بلا علف', id: (n) => id(900 + n), phone: (n) => phone(90 + n), roles: [['owner', 'owner']] });
    const o2 = G2.users.owner;
    const site2 = await one(o2, "insert into public.sites (division_id, name, kind) values ($1, 'حقل ثانٍ', 'farm') returning id", [G2.divisions.broiler]);
    const hall2 = await one(o2, "insert into public.halls (site_id, name) values ($1, 'قاعة 1') returning id", [site2]);
    const flock2 = (await one(o2, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [hall2, day(-3), uid()])).flock_id;
    const feed2 = await one(o2, "insert into public.items (name, kind, base_unit) values ('علف ثانٍ', 'feed', 'kg') returning id");
    const wh2 = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'feed'", [G2.org])).rows.map((r) => r.id);
    for (const wh of wh2) await one(o2, 'update public.warehouses set archived_at = now() where id = $1 returning id', [wh]);
    same(code(await send(o2, { flock: flock2, item: feed2, qty: '1' })), 'no_feed_store', 'بلا مخزن علف فعّال: no_feed_store');
    same([code(await send(o2, { flock: F.a, item: feed2, qty: '1' })), code(await gas(o2, { flock: F.a, on: day(-4), n: 1 })), code(await call(db, o2, SHEET, [F.a]))],
      ['flock_not_found', 'flock_not_found', 'flock_not_found'], 'وجبة منشأة أخرى غير موجودة للإرسال والغاز والورقة');
    same(code(await call(db, o2, DECIDE, [(await db.admin('select id from public.flock_day_rejects where flock_id = $1 limit 1', [F.c])).rows[0].id, 'handled', 1])), 'reject_not_found',
      'ومركون منشأة أخرى غير موجود');
  });

  // ── ٤) الورقة ───────────────────────────────────────────────────────────────────────────────────────────────────
  await one(U.owner, DAY, dayParams({ flock: F.l, on: day(-1), dead: 2, eggs: 1500 }));
  await one(U.owner, DAY, dayParams({ flock: F.a, on: TODAY, dead: 0, note: 'جولة اليوم' }));
  await section('الورقة', async () => {
    const a = await sheet(F.a);
    samples.hall_sheet_broiler = a;
    same({ today: a.today, through: a.through, can: a.can_write, n: a.days.length, first: [a.days[0].on, a.days[0].age, a.days[0].day_no], last: [a.days.at(-1).on, a.days.at(-1).age],
      flock: [a.flock.hall_name, a.flock.site_name, a.flock.kind, a.flock.status, a.flock.placed_on, a.flock.age0, a.flock.placed_count, a.flock.end_on, a.flock.end_age] },
    { today: TODAY, through: day(15), can: true, n: 46, first: [day(-30), 0, 1], last: [day(15), 45],
      flock: ['قاعة 7', 'حقل الورقة', 'broiler', 'active', day(-30), 0, 1000, null, null] },
    'لاحم بلا نهاية جدول: صفّ لكلّ يوم من التسكين حتى عمر 45 (46 صفّاً)، ولو بلا شيء');
    const r20 = rowOf(a, day(-20));
    same({ dead: r20.dead, culled: r20.culled, version: r20.day_version, feed: r20.feed_kg, lines: r20.feed.map((f) => [f.item_name, f.qty, f.unit, f.issued_on, f.can_void]) },
      { dead: 5, culled: 2, version: 1, feed: '50.000', lines: [['علف ناهي', '50.000', 'kg', TODAY, true]] }, 'يوم قبل 20: الهلاكات 5 (النافق 3 والمستبعد القديم 2)، والعلف المرسل اليوم على يومه');
    const r3 = rowOf(a, day(-3));
    same([r3.gas, r3.gas_version, r3.dead, r3.day_version], [3, 2, null, null], 'يوم الغاز: العدد ونسخته، ولا جولة');
    same([rowOf(a, day(-1)).gas, rowOf(a, day(-1)).gas_version], [null, 2], 'اليوم الممسوح: عدد فارغ ونسخة (للكتابة التالية)');
    same([rowOf(a, day(-2)).sold_birds, rowOf(a, day(-2)).sold_net_kg, rowOf(a, day(-2)).live_end], [100, '240.000', 892], 'يوم التذكرة: المباع وصافيه، والحيّ آخر اليوم');
    same([rowOf(a, TODAY).feed_kg, rowOf(a, TODAY).note, rowOf(a, TODAY).dead, rowOf(a, TODAY).eggs_total], ['100.000', 'جولة اليوم', 0, null], 'اليوم: علف اليوم (بلا الدواء)، والملاحظة، وبيض فارغ للّاحم');
    same([rowOf(a, day(5)).dead, rowOf(a, day(5)).gas, rowOf(a, day(5)).feed_kg, rowOf(a, day(5)).sold_birds, rowOf(a, day(5)).live_end], [null, null, null, 0, 892],
      'يوم قادم: صفّ فارغ والحيّ كما هو');
    // 0037: ومجموع الكاز (مفتاح جديد في المجاميع والخلاصة، صفر بلا كاز)؛ و0038 أقسام الهلاكات (dead_parts، فارغة لقاعة غير مقسومة).
    same(a.totals, { dead: 8, gas: 4, kerosene: 0, feed_kg: '150.000', feed_back_kg: '0.000', sold_birds: 100, sold_net_kg: '240.000', eggs_total: null, dead_parts: null },
      'المجاميع: الهلاكات 1+5+2، والغاز 3+1، والعلف 100+50، ولا راجع لوجبة قائمة');
    same(a.summary, { placed: 1000, dead: 8, mortality_pct: '0.80', live: 892, feed_kg: '150.000', feed_back_kg: '0.000', feed_net_kg: '150.000', feed_bags: '3.000', gas: 4,
      kerosene: 0, sold_birds: 100, sold_net_kg: '240.000', avg_weight_kg: '2.400', fcr: '0.625' },
    'الخلاصة: النفوق 8 ÷ 1,000، والأكياس 150 ÷ 50، ومعدّل الوزن 240 ÷ 100، ومعامل التحويل (150 − 0) ÷ 240');
    same([rowOf(a, day(-20)).carry_in_kg, rowOf(a, day(-20)).feed_back_kg, rowOf(a, day(-30)).carry_in_kg], [null, null, null], 'بلا منقول ولا راجع: الخانتان فارغتان');
    const sums = a.days.reduce((s, d) => ({ dead: s.dead + (d.dead ?? 0), gas: s.gas + (d.gas ?? 0), feed: s.feed + Number(d.feed_kg ?? 0) }), { dead: 0, gas: 0, feed: 0 });
    same(sums, { dead: 8, gas: 4, feed: 150 }, 'المجاميع = مجموع الأيّام');
    same(a.feed_items.map((f) => [f.name, f.on_hand, f.last, f.units.map((u) => [u.id, u.name, u.base_qty])]),
      [['علف ناهي', '950.000', true, [[bags.finisher, 'كيس 50 كغم', '50']]], ['علف بادئ', '1860.000', false, [[bags.starter, 'كيس 50 كغم', '50']]]],
      'الأعلاف للإرسال: آخر علف أُرسل أوّلاً، وما في مخازن العلف اليوم، ووحدات التعبئة؛ والعلف بلا رصيد لا يظهر');
    same(a.rejects, [], 'لا مركون للوجبة الأولى');

    const b = await sheet(F.b);
    same([b.through, b.days.length, b.days.at(-1).age, b.flock.end_age, b.flock.end_on, b.summary.feed_kg, b.summary.feed_bags, b.totals.gas],
      [day(25), 36, 35, 35, day(25), '50.000', null, 2], 'جدول القاعة ينتهي بعمر 35: الورقة حتى نهايته؛ والذرة بلا كيس فالأكياس فارغة');
    const c = await sheet(F.c);
    same([c.through, c.days.length, c.can_write, c.flock.status, c.rejects.map((r) => [r.on, r.reason, r.payload.gas ?? null]).sort()],
      [day(-2), 19, false, 'closed', [[day(-5), 'flock_closed', null], [day(-5), 'flock_closed', 4]]], 'المغلقة: حتى يوم إغلاقها ولا تُكتب، ومركونها ينتظر');
    samples.hall_sheet_closed = c;
    const refs = Object.fromEntries((await db.admin('select id, client_ref from public.flock_day_rejects where flock_id = $1 and decision is null', [F.c])).rows.map((r) => [r.id, r.client_ref]));
    same(c.rejects.map((r) => [r.client_ref, refs[r.id], r.version]), c.rejects.map((r) => [refs[r.id], refs[r.id], 1 + (r.payload.gas !== undefined ? 1 : 0)]),
      'كلّ مركون بمرجع عمليته كما حُفظ (client_ref، يطابق به الجهاز عمليته) ونسخته');
    t.ok(c.rejects.length === 2 && c.rejects.every((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(r.client_ref)), 'والمرجع نصّ uuid');
    const d = await sheet(F.d);
    same([d.through, d.days.length, d.days.at(-1).age], [TODAY, 51, 50], 'بعد عمر 45: الورقة حتى اليوم');
    const l = await sheet(F.l);
    samples.hall_sheet_layer = l;
    same([l.through, l.days.length, rowOf(l, day(-1)).eggs_total, rowOf(l, day(-1)).dead, l.totals.eggs_total, l.flock.kind], [TODAY, 11, 1500, 2, 1500, 'layer'],
      'البيّاض: حتى اليوم، والبيض في يومه وفي المجموع');
    same([(await call(db, U.worker, SHEET, [F.l])).value?.flock?.id, code(await call(db, U.worker, SHEET, [id(999)]))], [F.l, 'flock_not_found'],
      'الورقة لكلّ عضو في المنشأة كلّها (0034: عامل اللحم يقرأ وجبة البيض)، ووجبة ليست في المنشأة flock_not_found');
  });

  // ── ٥) حسم المركون بنسخته (مراجعة 0035: الركن من جديد يكتب فوق صفّه، فالحسم بشرط النسخة التي عُرضت) ───────────────────────────
  const rejectRow = async (rejectId) => (await db.admin('select version, decision, payload from public.flock_day_rejects where id = $1', [rejectId])).rows[0];
  const rejectIds = {};
  await section('حسم المركون', async () => {
    const gasReject = (await db.admin("select id from public.flock_day_rejects where flock_id = $1 and payload ? 'gas'", [F.c])).rows[0].id;
    rejectIds.gas = gasReject;
    const shown = (await sheet(F.c)).rejects.find((r) => r.id === gasReject);
    same([shown.version, shown.payload, shown.on, shown.reason], [2, { gas: 4 }, day(-5), 'flock_closed'], 'الورقة تعرض المركون بنسخته: غاز رُكن مرّتين لليوم نفسه = النسخة 2 بأحدث قيمته');
    const stale = await call(db, U.owner, DECIDE, [gasReject, 'handled', 1]);
    same(stale.value, { status: 'stale_reject', reject: shown }, 'الحسم بنسخة ما قبل الركن الثاني: stale_reject بالمركون كما هو الآن (شكل سطر الورقة)');
    same([(await call(db, U.owner, DECIDE, [gasReject, 'handled', null])).value?.status, (await rejectRow(gasReject)).decision], ['stale_reject', null],
      'وبلا نسخة كذلك، ولا يُكتب قرار');
    const first = await call(db, U.owner, DECIDE, [gasReject, 'handled', 2]);
    same([first.value?.status, first.value?.decision], ['saved', 'handled'], 'حسم المركون بنسخته: «أُدخلت»');
    samples.decide_flock_reject = first.value;
    same([(await call(db, U.manager, DECIDE, [gasReject, 'handled', 2])).value?.decided_at, code(await call(db, U.owner, DECIDE, [gasReject, 'refused', 2]))],
      [first.value.decided_at, 'already_decided'], 'القرار نفسه بالنسخة نفسها مرّة ثانية حُفظ بلا كتابة (إعادة)، وقرار آخر already_decided');
    same({ bad: code(await call(db, U.owner, DECIDE, [gasReject, 'maybe', 2])), missing: code(await call(db, U.owner, DECIDE, [id(997), 'handled', 1])),
      viewer: (await call(db, U.viewer, DECIDE, [gasReject, 'handled', 2], { commit: false })).value?.status },
    { bad: 'bad_decision', missing: 'reject_not_found', viewer: 'saved' }, 'رموز الرفض، والمشاهد يحسم كالمالك (0034؛ القرار نفسه بالنسخة نفسها = حُفظ)');
    same((await sheet(F.c)).rejects.map((r) => r.reason), ['flock_closed'], 'المحسوم يخرج من الورقة');
    same((await gas(U.owner, { flock: F.c, on: day(-5), n: 7, queued: true })).value?.status, 'parked', 'مركون جديد لليوم نفسه');
    same(await rejectRow(gasReject), { version: 3, decision: null, payload: { gas: 7 } }, 'يكتب فوق صفّه: بلا قرار، بالنسخة 3 وبقيمته الجديدة');
    const again = await call(db, U.owner, DECIDE, [gasReject, 'refused', 2]);
    same([again.value?.status, again.value?.reject?.version, again.value?.reject?.payload, (await rejectRow(gasReject)).decision], ['stale_reject', 3, { gas: 7 }, null],
      'جهاز عرض النسخة 2 يحسم بعد الركن الجديد: stale_reject بما رُكن الآن، ولا يُحسم ما لم يُعرض');
    same((await call(db, U.owner, DECIDE, [gasReject, 'refused', 3])).value?.decision, 'refused', 'وبالنسخة الجديدة يُحسم');
  });

  await section('الركن من جديد يكبّر النسخة (الجولة والزيارة)', async () => {
    const dayReject = (await db.admin('select id from public.flock_day_rejects where flock_id = $1 and on_date = $2 and visit_id is null', [F.c, day(-5)])).rows[0].id;
    rejectIds.day = dayReject;
    same((await rejectRow(dayReject)).version, 1, 'جولة رُكنت مرّة: النسخة 1');
    await one(U.owner, DECIDE, [dayReject, 'handled', 1]);
    same((await saveDay(U.owner, { flock: F.c, on: day(-5), dead: 2, queued: true })).value, { status: 'parked', reason: 'flock_closed' }, 'جولة أحدث لليوم نفسه من الطابور');
    same(await rejectRow(dayReject), { version: 2, decision: null, payload: { dead: 2, culled: null, feed_kg: null, water_l: null, temp_min: null, temp_max: null,
      eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, base_version: null } }, 'الجولة المركونة من جديد: صفّها نفسه بالنسخة 2 وبلا قرار');
    same((await call(db, U.owner, DECIDE, [dayReject, 'refused', 1])).value?.status, 'stale_reject', 'والحسم بما عُرض قبلها stale_reject');
    const visitId = uid();
    same((await visit(U.owner, { id: visitId, flock: F.c, on: day(-6), dead: 1, queued: true })).value, { status: 'parked', reason: 'flock_closed' }, 'زيارة لوجبة مغلقة من الطابور');
    const visitReject = (await db.admin('select id from public.flock_day_rejects where visit_id = $1', [visitId])).rows[0].id;
    rejectIds.visit = visitReject;
    rejectIds.visitId = visitId;
    same((await rejectRow(visitReject)).version, 1, 'الزيارة المركونة: النسخة 1');
    const latestRef = uid();
    await visit(U.owner, { id: visitId, flock: F.c, on: day(-6), dead: 3, queued: true, ref: latestRef });
    same((await sheet(F.c)).rejects.filter((r) => r.id === visitReject).map((r) => [r.client_ref, r.version, r.payload.dead]), [[latestRef, 2, 3]],
      'والورقة تعرضها بمرجع آخر عملية رُكنت (client_ref) ونسختها');
    same([(await rejectRow(visitReject)).version, (await rejectRow(visitReject)).payload.dead], [2, 3], 'الزيارة نفسها مركونة من جديد: النسخة 2 بأحدث قيمتها');
  });

  // ── ٦) الرصيد اليوميّ بقسمين ─────────────────────────────────────────────────────────────────────────────────────────
  await section('الرصيد اليوميّ بقسمين', async () => {
    await one(U.owner, 'select public.set_day_note($1, $2, $3, null) as v', [I.starter, TODAY, 'وصلت سيّارة']);
    const now = await one(U.owner, SECTIONS, [TODAY]);
    samples.day_balance_sections = now;
    const brief = (v) => v.sections.map((s) => [s.key, s.rows.map((r) => [r.name, r.qty, r.category?.name ?? null, r.note?.text ?? null])]);
    same([now.today, now.on, now.can_note], [TODAY, TODAY, true], 'رأس الرصيد');
    same(brief(now), [
      ['feed_materials', [['ذرة صفراء', '490.000', null, null]]],
      ['feed', [['علف ناهي', '950.000', 'أعلاف', null], ['علف بادئ', '1860.000', null, 'وصلت سيّارة'], ['علف بلا رصيد', '0.000', null, null]]],
      ['other', [['فيتامين', '9.000', null, null]]],
    ], 'القسمان و«أخرى»: ما له تصنيف أوّلاً ثمّ الاسم، والرصيد بالحركات حتى اليوم، والملاحظة');
    const before = await one(U.owner, SECTIONS, [day(-6)]);
    same(brief(before).map(([k, rows]) => [k, rows.map((r) => r[1])]), [['feed_materials', ['0.000']], ['feed', ['0.000', '0.000', '0.000']], ['other', ['0.000']]],
      'قبل الافتتاح كلّها صفر');
    const yesterday = await one(U.owner, SECTIONS, [day(-1)]);
    same(yesterday.sections[1].rows.map((r) => r.qty), ['1000.000', '2000.000', '0.000'], 'أمس: قبل علف اليوم (والمتأخّر خرج اليوم، فهو في رصيد أمس)');
    same((await one(U.accountant, SECTIONS, [null])).sections, now.sections, 'المحاسب يرى الرصيد نفسه (اليوم افتراضاً)');
    same([code(await call(db, U.owner, SECTIONS, [day(1)])), code(await call(db, U.owner, SECTIONS, ['infinity']))], ['day_in_future', 'date_required'], 'قواعد اليوم كـday_balance');
  });

  // ── ٧) التقارير بيوم القاعة والغاز ─────────────────────────────────────────────────────────────────────────────────
  await section('التقارير', async () => {
    const hallsDay = (on) => one(U.owner, 'select public.halls_day($1) as v', [on]);
    const hallOf = (v, hallId) => v.sites.flatMap((s) => s.halls).find((h) => h.hall_id === hallId);
    const d20 = await hallsDay(day(-20));
    same([hallOf(d20, H.a).flock.feed_given_kg, hallOf(d20, H.a).flock.dead, hallOf(d20, H.a).flock.issues.map((x) => [x.name, x.issued_on])],
      ['50.000', 3, [['علف ناهي', TODAY]]], 'التقرير اليوميّ قبل 20 يوماً: العلف المرسل اليوم على يومه بسطره');
    same((await hallsDay(TODAY)).sites.flatMap((s) => s.halls).find((h) => h.hall_id === H.a).flock.feed_given_kg, '100.000', 'واليوم بعلف اليوم وحده');
    const d3 = await hallsDay(day(-3));
    samples.halls_day = d3;
    const broiler = d3.sites.find((s) => s.id === S.a);
    same([hallOf(d3, H.a).flock.gas, hallOf(d3, H.b).flock.gas, hallOf(d3, H.d).flock.gas, broiler.totals.gas, d3.totals.gas, d3.sites.find((s) => s.id === S.l).totals.gas],
      [3, 2, 1, 6, 6, null], 'الغاز لكلّ قاعة وفي مجاميع الحقل والكلّ (فارغ بلا تسجيل)');
    const report = await one(U.owner, 'select public.flock_cycle_report($1) as v', [F.a]);
    const rd = (on) => report.days.find((x) => x.on === on);
    same([rd(day(-20)).feed_given_kg, rd(day(-3)).gas, rd(TODAY).feed_given_kg, report.kpis.gas,
      report.feed.lines.map((x) => [x.on, x.issued_on, x.kg]), report.feed.delivered_kg],
    ['50.000', 3, '100.000', 4, [[day(-20), TODAY, '50.000'], [TODAY, TODAY, '100.000']], '150.000'],
    'تقرير الدورة: العلف بيومه في الأيّام وفي السطور (وتاريخ خروجه)، والغاز في كلّ يوم وفي المؤشّرات');
    const month = await one(U.owner, 'select public.flock_month($1, $2) as v', [F.a, TODAY]);
    const md = (on) => month.days.find((x) => x.on === on);
    same([md(day(-20)).issues.map((x) => [x.name, x.issued_on]), md(TODAY).issues.map((x) => x.name), md(day(-3)).gas, month.totals.gas, month.totals.feed_kg],
      [[['علف ناهي', TODAY]], ['علف بادئ', 'فيتامين'], 3, 3, '150.000'], 'تقويم الشهر: الصرف بيومه، والغاز');
    const oct = await one(U.owner, 'select public.flock_month($1, $2) as v', [F.a, day(-29)]);
    same([oct.totals.gas, oct.days.find((x) => x.on === day(-29)).gas], [1, 1], 'وتقويم الشهر الماضي بغازه');
    const history = await one(U.owner, 'select public.halls_history(null) as v', []);
    const kind = history.kinds.find((k) => k.kind === 'broiler');
    same([kind.days.find((x) => x.on === day(-3)).gas, kind.days.find((x) => x.on === day(-20)).given_kg, kind.months.map((m) => [m.month, m.gas]), kind.total.gas],
      [6, '50.000', [['2026-10-01', 1], ['2026-11-01', 6]], 7], '«من أوّل ما بدينا»: الغاز يوماً وشهراً ومنذ البداية، والعلف بيومه');
  });

  // ── ٧ب) مراجعة 0035: علف الورقة ومعاملها بالراجع عند الإغلاق والمنقول إليها (كتقرير الدورة)، داخل معاملة ترجع ──────────────────────
  await section('العلف الراجع والمنقول', async () => {
    const out = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const sc = await returnsScenario(attempt);
      const halls = await inside(attempt, U.owner, 'select public.halls_day($1) as v', [day(-1)]);
      return {
        p: await inside(attempt, U.owner, SHEET, [sc.p]),
        report: await inside(attempt, U.owner, 'select public.flock_cycle_report($1) as v', [sc.p]),
        q: await inside(attempt, U.owner, SHEET, [sc.q]),
        qDay: halls?.sites?.flatMap((s) => s.halls).find((h) => h.hall_id === sc.hallId)?.flock ?? null,
        verify: await verifyOf(oq),
      };
    });
    const { p, report, q, qDay, verify } = out;
    samples.hall_sheet_returned = p;
    samples.hall_sheet_carried_in = q;
    const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));
    same(pick(p.summary, ['feed_kg', 'feed_back_kg', 'feed_net_kg', 'sold_birds', 'sold_net_kg', 'fcr']),
      { feed_kg: '230.000', feed_back_kg: '180.000', feed_net_kg: '50.000', sold_birds: 100, sold_net_kg: '240.000', fcr: '0.208' },
      'المغلقة: أُرسل 230 كغم، ورجع منها عند الإغلاق 180 (150 إلى المخزن و30 للدورة التالية)، فالصافي 50 ومعامل التحويل 50 ÷ 240');
    same([p.summary.fcr, report.kpis.fcr_final, report.kpis.feed_net_kg], ['0.208', '0.208', '50.000'], 'معامل الورقة = fcr_final لتقرير الدورة، والصافي نفسه');
    same([rowOf(p, day(-4)).feed_kg, rowOf(p, day(-4)).feed_back_kg, rowOf(p, day(-2)).feed_kg, rowOf(p, day(-2)).feed_back_kg, p.totals.feed_kg, p.totals.feed_back_kg],
      ['230.000', null, null, '180.000', '230.000', '180.000'], 'الراجع على يوم الإغلاق في الأيّام وفي المجاميع، والمرسل على يومه');
    same([rowOf(q, day(-1)).carry_in_kg, rowOf(q, day(-1)).feed_kg, rowOf(q, day(-1)).feed, rowOf(q, TODAY).carry_in_kg, q.totals.feed_kg,
      q.summary.feed_kg, q.summary.feed_back_kg, q.summary.feed_net_kg, q.summary.feed_bags],
    ['30.000', '30.000', [], null, '30.000', '30.000', '0.000', '30.000', '0.600'],
    'الجديدة: المنقول إليها (30 كغم) على يوم تسكينها في العلف وخانته، وفي المجاميع والخلاصة، وأكياسه بحجم كيسه');
    same([rowOf(q, day(-1)).feed_kg, qDay?.feed_given_kg], ['30.000', '30.000'], 'وعلف يومها في الورقة = علف التقرير اليوميّ');
    same(verify, VERIFY_ZERO, 'الثابت صفر مع الراجع والمنقول');
  });

  // ── ٧ج) مراجعة 0035: «المتاح» للإرسال ما يأخذه إرسال واحد (أكبر ما في مخزن علف واحد)، داخل معاملة ترجع ──────────────────────────────
  await section('المتاح لإرسال واحد', async () => {
    const out = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      for (const name of ['مخزن علف ثانٍ', 'مخزن علف ثالث']) await postedOpeningInside(oq, attempt, await feedStoreInside(oq, name), I.empty, 30);
      const shown = (await inside(attempt, U.owner, SHEET, [F.a]))?.feed_items?.find((x) => x.item_id === I.empty);
      return {
        onHand: shown?.on_hand ?? null,
        over: (await inside(attempt, U.owner, SEND, sendParams({ flock: F.a, item: I.empty, qty: '50' })))?.code ?? 'saved',
        whole: (await inside(attempt, U.owner, SEND, sendParams({ flock: F.a, item: I.empty, qty: '30' })))?.status ?? 'refused',
      };
    });
    same(out, { onHand: '30.000', over: 'insufficient_stock', whole: 'saved' },
      'علف في مخزنين بثلاثين لكلّ منهما: المتاح 30 (ما يأخذه إرسال واحد) لا 60، فإرسال 50 يُرفض و30 يُرسل');
  });

  // ── ٧د) مراجعة 0035: حذف الوجبة والغاز، داخل معاملة ترجع ───────────────────────────────────────────────────────────────────
  await section('حذف الوجبة والغاز', async () => {
    const out = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const hallId = await inside(attempt, U.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة 12') returning id as v", [S.a]);
      const flockId = (await inside(attempt, U.owner, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [hallId, day(-3), uid()])).flock_id;
      const version = async () => (await oq('select version from public.flocks where id = $1', [flockId])).rows[0].version;
      const del = async () => inside(attempt, U.owner, 'select public.delete_flock($1, $2, $3) as v', [flockId, await version(), uid()]);
      await inside(attempt, U.owner, GAS, gasParams({ flock: flockId, on: day(-2), n: 2 }));
      const blocked = await del();
      await inside(attempt, U.owner, GAS, gasParams({ flock: flockId, on: day(-2), n: null, base: 1 }));
      const deleted = await del();
      return {
        blocked: [blocked?.code ?? 'deleted', (blocked?.hint ?? '').includes('الغاز')],
        deleted: deleted?.deleted ?? deleted?.code,
        left: (await oq('select count(*)::int as n from public.flock_day_gas where flock_id = $1', [flockId])).rows[0].n,
        gone: (await oq('select count(*)::int as n from public.flocks where id = $1', [flockId])).rows[0].n,
      };
    });
    same(out, { blocked: ['flock_has_records', true], deleted: true, left: 0, gone: 0 },
      'غاز مسجَّل يمنع حذف الوجبة بتلميح يسمّي «الغاز»؛ وبعد مسحه تُحذف الوجبة ويُحذف صفّ الغاز الممسوح معها');
  });

  // ── ٨) الحرّاس: تعديل الوجبة وإغلاقها ────────────────────────────────────────────────────────────────────────────────
  await section('الحرّاس', async () => {
    const out = await mutant(db, U.owner, [], async ({ attempt }) => {
      const version = (await db.admin('select version from public.flocks where id = $1', [F.b])).rows[0].version;
      return {
        // «قاعة 8» سُكّنت قبل عشرة أيّام، وأوّل سجلّ لها علف ليوم قبل يوم (أُرسل اليوم) وغاز قبل ثلاثة أيّام.
        afterGas: (await inside(attempt, U.owner, 'select public.edit_flock($1, $2, $3, 500, 0, null, $4) as v', [F.b, version, day(-2), uid()])).code,
        beforeGas: (await inside(attempt, U.owner, 'select public.edit_flock($1, $2, $3, 500, 0, null, $4) ->> \'changed\' as v', [F.b, version, day(-4), uid()])),
      };
    });
    same(out, { afterGas: 'records_before_placement', beforeGas: 'true' }, 'التسكين لا ينتقل بعد يوم غاز مسجَّل (وقبله يُقبل)');
    const hint = (await mutant(db, U.owner, [], async ({ attempt }) => inside(attempt, U.owner, 'select public.edit_flock($1, (select version from public.flocks where id = $1), $2, 500, 0, null, $3) as v', [F.b, day(-2), uid()]))).hint;
    t.ok(hint.includes('غاز'), `تلميح records_before_placement يذكر الغاز (${hint})`);
    // «قاعة 10» لا شيء عليها إلّا غاز قبل ثلاثة أيّام.
    const closed = await mutant(db, U.owner, [], async ({ attempt }) => {
      const plan = await inside(attempt, U.owner, "select public.flock_close_form($1) ->> 'plan' as v", [F.d]);
      return inside(attempt, U.owner, "select public.close_flock($1, $2, $3, $4, 200, 0, '[]'::jsonb, 'بيعت', '[]'::jsonb, null, $5) as v", [uid(), uid(), F.d, day(-4), plan]);
    });
    t.ok(closed.code === 'activity_after_close' && closed.hint.includes('غاز'), `الإغلاق قبل يوم غاز يُرفض ويسمّيه (${closed.code} ${closed.hint})`);
  });

  // ── ٩) الثابت: صفر، وكلّ فحص يمسك خرقه ──────────────────────────────────────────────────────────────────────────────
  await section('الثابت', async () => {
    same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_hall_sheet صفر');
    const breaks = {
      for_day_range: (oq) => oq('update public.flock_issues set for_day = $2 where id = $1', [sends.late.issue, day(-31)]),
      gas_days: (oq) => oq('insert into public.flock_day_gas (org_id, flock_id, hall_id, site_id, division_id, on_date, cylinders) select org_id, id, hall_id, site_id, division_id, $2, 1 from public.flocks where id = $1', [F.a, day(-31)]),
      gas_versions: async (oq) => {
        await oq('alter table public.flock_day_gas drop constraint flock_day_gas_version_check');
        await oq('update public.flock_day_gas set version = 0 where flock_id = $1 and on_date = $2', [F.a, day(-3)]);
      },
      gas_hall: (oq) => oq('update public.flock_day_gas set hall_id = $3 where flock_id = $1 and on_date = $2', [F.a, day(-3), H.b]),
    };
    const caught = {};
    for (const [name, run] of Object.entries(breaks)) {
      caught[name] = await mutant(db, U.owner, [], async ({ oq }) => {
        await run(oq);
        return (await verifyOf(oq))[name];
      });
    }
    same(caught, { for_day_range: 1, gas_days: 1, gas_versions: 1, gas_hall: 1 }, 'كلّ خرق في الجداول يمسكه فحصه باسمه');
    const sheetBreaks = {
      sheet_totals: [[SIG.sheet, [["'gas', coalesce(sum(z.cylinders), 0)::bigint", "'gas', coalesce(sum(z.cylinders), 0)::bigint + 1"]]]],
      sheet_feed_by_day: [[SIG.sheet, [['select private.issue_day(x) as d, x.id', 'select x.issued_on as d, x.id']]]],
    };
    for (const [name, fns] of Object.entries(sheetBreaks)) {
      caught[name] = await mutant(db, U.owner, fns, async ({ oq }) => (await verifyOf(oq))[name]);
    }
    t.ok(caught.sheet_totals > 0 && caught.sheet_feed_by_day > 0, `طفرة في الورقة يمسكها الثابت (المجاميع ${caught.sheet_totals}، والعلف بيومه ${caught.sheet_feed_by_day})`);
    // الوجبة المغلقة بلا مبيع: الثابت يقارن معامل الورقة بـnull بلا قراءة تقرير الدورة (fcr_final فيه null بتعريفه)؛ ورقة تعطي معاملاً بلا مبيع يمسكها.
    const NO_SALE_FCR = ["then private._mul_div_round(v_net, 1, v_sold_kg, 3)::text end)", "then private._mul_div_round(v_net, 1, v_sold_kg, 3)::text when v_sold_kg = 0 then '0.000' end)"];
    const noSale = await mutant(db, U.owner, [[SIG.sheet, [NO_SALE_FCR]]], async ({ oq }) => ({
      closedNoSale: (await oq(`select count(*)::int as n from public.flocks f where f.org_id = $1 and f.status = 'closed'
        and not exists (select 1 from private.flock_count_days(f.id) as k where k.sold_kg > 0)`, [org])).rows[0].n,
      caught: (await verifyOf(oq)).sheet_fcr_final,
    }));
    t.ok(noSale.closedNoSale > 0 && noSale.caught >= noSale.closedNoSale,
      `وجبة مغلقة بلا مبيع ومعامل في ورقتها يمسكها الثابت (${noSale.caught}، وفي منشأة الملفّ ${noSale.closedNoSale} وجبة مغلقة بلا مبيع)`);
    // مراجعة 0035: مع الراجع والمنقول (returnsScenario داخل معاملة الطفرة) — كلّ طفرة يمسكها فحصها باسمه، والضابط بلا طفرة صفر.
    const OLD_FCR = ["'fcr', case when v_unweighed = 0 and v_net > 0 and v_sold_kg > 0 then private._mul_div_round(v_net, 1, v_sold_kg, 3)::text end)",
      "'fcr', case when (v_totals ->> 'sold_net_kg')::numeric > 0 and (v_totals ->> 'feed_kg')::numeric > 0\n        then private._mul_div_round((v_totals ->> 'feed_kg')::numeric, 1, (v_totals ->> 'sold_net_kg')::numeric, 3)::text end)"];
    const returnBreaks = {
      control: ['sheet_fcr_final', []],
      fcrSent: ['sheet_fcr_final', [[SIG.sheet, [OLD_FCR]]]],
      carryIn: ['sheet_feed_by_day', [[SIG.sheet, [['case when fd.kg is not null or ci.kg is not null then coalesce(fd.kg, 0) + coalesce(ci.kg, 0) end as kg', 'fd.kg as kg']]]]],
      backDay: ['sheet_feed_by_day', [[SIG.sheet, [['left join back bk on bk.d = g.d', 'left join back bk on bk.d = g.d + 1']]]]],
      backTotal: ['sheet_totals', [[SIG.sheet, [["'feed_back_kg', round(coalesce(sum(z.back_kg), 0), 3)::text", "'feed_back_kg', '0.000'"]]]]],
    };
    const returned = {};
    for (const [label, [name, fns]] of Object.entries(returnBreaks)) {
      returned[label] = await mutant(db, U.owner, fns, async ({ oq, attempt }) => {
        await returnsScenario(attempt);
        return (await verifyOf(oq))[name];
      });
    }
    t.ok(returned.control === 0 && returned.fcrSent > 0 && returned.carryIn > 0 && returned.backDay > 0 && returned.backTotal > 0,
      `مع الراجع والمنقول: المعامل بالمرسل وحده (${returned.fcrSent})، والمنقول خارج يومه (${returned.carryIn})، والراجع على غير يوم الإغلاق (${returned.backDay})، ومجموع الراجع (${returned.backTotal}) يمسكها الثابت، والضابط ${returned.control}`);
  });

  // ── ١٠) الطفرات: الجسم القديم وكلّ قاعدة مكسورة يمسكها فحصها ─────────────────────────────────────────────────────────────
  await section('الطفرات', async () => {
    const OLD_WEEK = "    v_park := 'out_of_scope';\n  elsif p_date < v_today - 7 then\n    if not v_queued then\n      raise exception 'date_too_old' using hint = 'قديم';\n    end if;\n    v_park := 'date_too_old';\n";
    const CASES = [
      {
        name: 'الجولة بحدّ الأيّام السبعة (جسم 0032)',
        fns: [[SIG.day, [["    v_park := 'out_of_scope';\n", OLD_WEEK]]]],
        run: async ({ attempt }) => [(await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-12), dead: 1 })))?.status ?? 'refused',
          (await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-13), note: 'م', queued: true })))?.status],
        correct: (v) => JSON.stringify(v) === JSON.stringify(['saved', 'saved']),
      },
      {
        name: 'الزيارة بحدّ الأيّام السبعة (جسم 0032)',
        fns: [[SIG.visit, [["    v_park := 'out_of_scope';\n", OLD_WEEK]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, VISIT, visitParams({ flock: F.a, on: day(-12), dead: 1 })))?.status ?? 'refused',
        correct: (v) => v === 'saved',
      },
      {
        name: 'الوزن بـcheck_doc_date (جسم 0012)',
        fns: [[SIG.weight, [['  perform private.flock_day_check(f, p_date);\n', '  perform private.check_doc_date(p_date);\n']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, WEIGHT, [F.a, day(-12), 50, '800.0', uid()]))?.status ?? 'refused',
        correct: (v) => v === 'saved',
      },
      {
        name: 'قاعدة اليوم بلا قفل الفترة',
        fns: [[SIG.check, [['  if v_lock is not null and p_on <= v_lock then', '  if false then']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-28)]);
          return [(await inside(attempt, U.owner, GAS, gasParams({ flock: F.a, on: day(-29), n: 2, base: 1 })))?.code,
            (await inside(attempt, U.owner, GAS, gasParams({ flock: F.a, on: day(-29), n: 2, base: 1, queued: true })))?.reason,
            (await inside(attempt, U.owner, WEIGHT, [F.a, day(-29), 50, '800.0', uid()]))?.code,
            (await inside(attempt, U.owner, SEND, sendParams({ flock: F.a, item: I.starter, qty: '1', on: day(-29) })))?.code,
            (await inside(attempt, U.owner, DAY, dayParams({ flock: F.a, on: day(-29), dead: 1, queued: true })))?.reason];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['period_locked', 'period_locked', 'period_locked', 'period_locked', 'period_locked']),
      },
      {
        name: 'الغاز: القيمة نفسها بلا اختصار',
        fns: [[SIG.gas, [['  if (g.id is null and p_cylinders is null) or (g.id is not null and g.cylinders is not distinct from p_cylinders) then', '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, GAS, gasParams({ flock: F.a, on: day(-3), n: 3, base: 2 })))?.gas?.version,
        correct: (v) => v === 2,
      },
      {
        name: 'الغاز بلا شرط النسخة',
        fns: [[SIG.gas, [['  if p_expected_version is distinct from g.version then', '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, GAS, gasParams({ flock: F.a, on: day(-3), n: 9, base: 1 })))?.status,
        correct: (v) => v === 'stale_gas',
      },
      {
        name: 'الغاز المركون بلا معرّف (يكتب فوق الجولة المركونة)',
        fns: [[SIG.gas, [["      md5('gas:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)\n    on conflict (org_id, visit_id) where visit_id is not null do update",
          "      null)\n    on conflict (org_id, created_by, flock_id, on_date) where visit_id is null do update"]]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, GAS, gasParams({ flock: F.c, on: day(-5), n: 8, queued: true }));
          return (await oq("select count(*)::int as n from public.flock_day_rejects where flock_id = $1 and on_date = $2 and payload ? 'dead'", [F.c, day(-5)])).rows[0].n;
        },
        correct: (v) => v === 1,
      },
      {
        name: 'الإرسال بلا فحص نوع العلف',
        fns: [[SIG.send, [["  if i.kind <> 'feed' then", '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, SEND, sendParams({ flock: F.a, item: I.corn, qty: '1' })))?.code,
        correct: (v) => v === 'not_feed',
      },
      {
        name: 'الإرسال بلا يوم القاعة (يبقى على يوم خروجه)',
        fns: [[SIG.send, [['  update public.flock_issues z set for_day = p_for_day where z.org_id = v_org and z.id = p_issue_id;\n', '']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, SEND, sendParams({ flock: F.a, item: I.starter, qty: '5', on: day(-6) })))?.day,
        correct: (v) => JSON.stringify(v) === JSON.stringify({ on: day(-6), feed_kg: '5.000' }),
      },
      {
        name: 'الإرسال من غير «رصيد العلف» أوّلاً',
        fns: [[SIG.send, [['    order by z.id = v_pref desc nulls last, z.created_at, z.id', '    order by z.created_at desc, z.id desc']]]],
        run: async ({ oq, attempt }) => {
          await oq("insert into public.warehouses (org_id, division_id, site_id, name, kind) select org_id, division_id, site_id, 'مخزن علف ثانٍ', 'feed' from public.warehouses where id = $1", [W.feed]);
          const other = (await oq("select id from public.warehouses where org_id = $1 and name = 'مخزن علف ثانٍ'", [org])).rows[0].id;
          await postedOpeningInside(oq, attempt, other, I.starter);
          const sent = await inside(attempt, U.owner, SEND, sendParams({ flock: F.a, item: I.starter, qty: '1' }));
          return (await oq('select warehouse_id from public.flock_issues where id = $1', [sent?.issue?.id])).rows[0]?.warehouse_id === W.feed;
        },
        correct: (v) => v === true,
      },
      {
        name: 'العلف النازل بتاريخ خروجه (جسم 0029)',
        fns: [[SIG.reportDays, [['    select private.issue_day(x) as d, sum(m.kg)', '    select x.issued_on as d, sum(m.kg)'],
          ['and private.issue_day(x) <= p_through\n    group by private.issue_day(x)\n', 'and x.issued_on <= p_through\n    group by x.issued_on\n']]]],
        run: async ({ attempt }) => {
          const v = await inside(attempt, U.owner, 'select public.halls_day($1) as v', [day(-20)]);
          return v?.sites?.flatMap((s) => s.halls).find((h) => h.hall_id === H.a)?.flock?.feed_given_kg;
        },
        correct: (v) => v === '50.000',
      },
      {
        name: 'سطور اليوم بتاريخ خروجها (جسم 0029)',
        fns: [[SIG.reportDay, [['and private.issue_day(x) = p_on and', 'and x.issued_on = p_on and']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, 'select public.halls_day($1) as v', [day(-20)]))?.sites?.flatMap((s) => s.halls).find((h) => h.hall_id === H.a)?.flock?.issues?.length,
        correct: (v) => v === 1,
      },
      {
        name: 'مجموع الغاز في التقرير اليوميّ',
        fns: [[SIG.totals, [["    'gas', sum((e.h -> 'flock' ->> 'gas')::bigint),\n", '']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, 'select public.halls_day($1) as v', [day(-3)]))?.totals?.gas,
        correct: (v) => v === 6,
      },
      {
        name: 'الورقة: الهلاكات بلا المستبعد القديم',
        fns: [[SIG.sheet, [["'dead', case when z.version is not null then z.dead + z.culled end", "'dead', z.dead"]]]],
        run: async ({ attempt }) => rowOf(await inside(attempt, U.owner, SHEET, [F.a]), day(-20)).dead,
        correct: (v) => v === 5,
      },
      {
        name: 'الورقة: اللاحم حتى عمر 45 ولو تجاوزه اليوم',
        fns: [[SIG.sheet, [['when f.kind = \'broiler\' then greatest(v_today, f.placed_on + (45 - f.age_days_at_placement))', "when f.kind = 'broiler' then f.placed_on + (45 - f.age_days_at_placement)"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, SHEET, [F.d])).through,
        correct: (v) => v === TODAY,
      },
      {
        name: 'الورقة: الملغى في العلف',
        fns: [[SIG.sheet, [["    where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed'\n  ), fd as (", "    where x.org_id = f.org_id and x.flock_id = f.id and l.cost_kind = 'feed'\n  ), fd as ("]]]],
        run: async ({ attempt }) => rowOf(await inside(attempt, U.owner, SHEET, [F.a]), day(-10)).feed_kg,
        correct: (v) => v === null,
      },
      {
        name: 'تعديل الوجبة بلا الغاز',
        fns: [[SIG.edit, [['      (select min(x.on_date) from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is not null),\n', '']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, 'select public.edit_flock($1, (select version from public.flocks where id = $1), $2, 500, 0, null, $3) as v', [F.b, day(-2), uid()]))?.code,
        correct: (v) => v === 'records_before_placement',
      },
      {
        name: 'الإغلاق بلا الغاز',
        fns: [[SIG.activity, [["    union all\n    -- 0035: الغاز المسجَّل.\n    select 'غاز', g.on_date, 7 from public.flock_day_gas g where g.org_id = f.org_id and g.flock_id = f.id and g.cylinders is not null\n", '']]]],
        run: async ({ attempt }) => {
          const plan = await inside(attempt, U.owner, "select public.flock_close_form($1) ->> 'plan' as v", [F.d]);
          return (await inside(attempt, U.owner, "select public.close_flock($1, $2, $3, $4, 200, 0, '[]'::jsonb, 'بيعت', '[]'::jsonb, null, $5) as v", [uid(), uid(), F.d, day(-4), plan]))?.code;
        },
        correct: (v) => v === 'activity_after_close',
      },
      {
        name: 'الرصيد بقسمين: الإضافات في «أخرى»',
        fns: [[SIG.sections, [["when i.kind in ('raw', 'additive') then 'feed_materials'", "when i.kind = 'raw' then 'feed_materials'"]]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, "insert into public.items (name, kind, base_unit) values ('ملح', 'additive', 'kg') returning id as v", []);
          return (await inside(attempt, U.owner, SECTIONS, [TODAY]))?.sections?.[0]?.rows?.map((r) => r.name);
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['ذرة صفراء', 'ملح']),
      },
      {
        name: 'الحسم يكتب فوق قرار سابق',
        fns: [[SIG.decide, [['  elsif r.decision <> p_decision then', '  elsif false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, DECIDE, [rejectIds.gas, 'handled', 3]))?.code,
        correct: (v) => v === 'already_decided',
      },
      {
        name: 'الحسم بلا شرط النسخة (مراجعة 0035)',
        fns: [[SIG.decide, [['  if r.version is distinct from p_seen_version then', '  if false then']]]],
        run: async ({ oq, attempt }) => {
          const answer = await inside(attempt, U.owner, DECIDE, [rejectIds.visit, 'handled', 1]);
          return [answer?.status, (await oq('select decision from public.flock_day_rejects where id = $1', [rejectIds.visit])).rows[0].decision];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['stale_reject', null]),
      },
      ...[
        ['الجولة', SIG.day, async ({ attempt }) => inside(attempt, U.owner, DAY, dayParams({ flock: F.c, on: day(-5), dead: 4, queued: true })), () => rejectIds.day, ''],
        // 0036: في save_flock_visit ركن ثانٍ (dead_recorded) بالجملة نفسها، فالمرساة من سطر قيم ركن الأسباب الثلاثة (v_park).
        ['الزيارة', SIG.visit, async ({ attempt }) => inside(attempt, U.owner, VISIT, visitParams({ id: rejectIds.visitId, flock: F.c, on: day(-6), dead: 4, queued: true })), () => rejectIds.visit,
          'v_payload, v_park, auth.uid(), p_visit)\n    on conflict (org_id, visit_id) where visit_id is not null do update\n      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),\n'],
        ['الغاز', SIG.gas, async ({ attempt }) => inside(attempt, U.owner, GAS, gasParams({ flock: F.c, on: day(-5), n: 9, queued: true })), () => rejectIds.gas, ''],
      ].map(([label, sig, park, rejectId, lead]) => ({
        name: `${label} المركونة من جديد بلا نسخة أكبر (مراجعة 0035)`,
        fns: [[sig, [[`${lead}          version = public.flock_day_rejects.version + 1, decision = null`, `${lead}          version = public.flock_day_rejects.version, decision = null`]]]],
        run: async (kit) => {
          const versionOf = async () => (await kit.oq('select version from public.flock_day_rejects where id = $1', [rejectId()])).rows[0].version;
          const before = await versionOf();
          const parked = await park(kit);
          return [parked?.status, (await versionOf()) - before];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['parked', 1]),
      })),
      {
        name: 'الورقة: المتاح مجموع مخازن العلف (مراجعة 0035)',
        fns: [[SIG.sheet, [['coalesce((select max(s.available) from public.warehouses w', 'coalesce((select sum(s.available) from public.warehouses w']]]],
        run: async ({ oq, attempt }) => {
          for (const name of ['مخزن علف ثانٍ', 'مخزن علف ثالث']) await postedOpeningInside(oq, attempt, await feedStoreInside(oq, name), I.empty, 30);
          return (await inside(attempt, U.owner, SHEET, [F.a]))?.feed_items?.find((x) => x.item_id === I.empty)?.on_hand;
        },
        correct: (v) => v === '30.000',
      },
      {
        name: 'الورقة: الأكياس بلا سطور المنقول (مراجعة 0035)',
        fns: [[SIG.sheet, [["        where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed'\n      ) as l", '        where false\n      ) as l']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, SHEET, [(await returnsScenario(attempt)).q]))?.summary?.feed_bags,
        correct: (v) => v === '0.600',
      },
      {
        name: 'حذف الوجبة بلا الغاز (جسم 0032)',
        fns: [[SIG.deleteFlock, [["  if exists (select 1 from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is not null) then\n    v_has := v_has || 'الغاز'::text;\n  end if;\n", ''],
          ['  delete from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is null;\n', '']]]],
        run: async ({ oq, attempt }) => {
          const hallId = await inside(attempt, U.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة 12') returning id as v", [S.a]);
          const flockId = (await inside(attempt, U.owner, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [hallId, day(-3), uid()])).flock_id;
          await inside(attempt, U.owner, GAS, gasParams({ flock: flockId, on: day(-2), n: 2 }));
          const version = (await oq('select version from public.flocks where id = $1', [flockId])).rows[0].version;
          const blocked = await inside(attempt, U.owner, 'select public.delete_flock($1, $2, $3) as v', [flockId, version, uid()]);
          await inside(attempt, U.owner, GAS, gasParams({ flock: flockId, on: day(-2), n: null, base: 1 }));
          const deleted = await inside(attempt, U.owner, 'select public.delete_flock($1, $2, $3) as v', [flockId, version, uid()]);
          return [(blocked?.hint ?? '').includes('الغاز'), deleted?.deleted ?? deleted?.code];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify([true, true]),
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

  // ── ١١) ملفّ التراجع يرجّع الأجسام القديمة حرفاً ──────────────────────────────────────────────────────────────────────
  await section('التراجع', async () => {
    const rollback = readFileSync(path.join(MIGRATIONS, 'rollback_0035.sql'), 'utf8');
    const bodyOf = (file, head) => {
      const text = readFileSync(path.join(MIGRATIONS, file), 'utf8');
      const start = text.indexOf(`create or replace function ${head}(`);
      return text.slice(start, text.indexOf('\n$$;', start) + 4);
    };
    const missing = [['0032_round_visits.sql', 'public.save_flock_visit'], ['0032_round_visits.sql', 'public.save_flock_day'], ['0012_flocks_daily.sql', 'public.record_flock_weight'],
      ['0029_bird_sales_close.sql', 'private.report_days'], ['0029_bird_sales_close.sql', 'private.report_day'], ['0029_bird_sales_close.sql', 'private.halls_day_totals'],
      ['0029_bird_sales_close.sql', 'public.flock_cycle_report'], ['0031_halls_history.sql', 'public.halls_history'], ['0029_bird_sales_close.sql', 'public.flock_month'],
      ['0029_bird_sales_close.sql', 'public.edit_flock'], ['0029_bird_sales_close.sql', 'private.flock_activity_after'], ['0032_round_visits.sql', 'public.delete_flock']]
      .filter(([file, head]) => !rollback.includes(bodyOf(file, head))).map(([, head]) => head);
    same(missing, [], 'ملفّ التراجع يرجّع الأجسام الاثني عشر كما في آخر هجرة عرّفتها حرفاً (ومعها delete_flock من 0032، مراجعة 0035)');
  });

  same(await db.asService(verifyOf), VERIFY_ZERO, 'الثابت صفر في نهاية الملفّ');
  if (process.env.HALL_SHEET_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/hall-sheet.test.mjs بـHALL_SHEET_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات. hall_sheet_returned وhall_sheet_carried_in من «قاعة 11» داخل معاملة رجعت (مراجعة 0035: الراجع عند الإغلاق والمنقول إليها).`,
      hall_sheet_broiler: samples.hall_sheet_broiler,
      hall_sheet_layer: samples.hall_sheet_layer,
      hall_sheet_closed: samples.hall_sheet_closed,
      hall_sheet_returned: samples.hall_sheet_returned,
      hall_sheet_carried_in: samples.hall_sheet_carried_in,
      day_balance_sections: samples.day_balance_sections,
      halls_day: samples.halls_day,
      set_flock_gas_saved: samples.set_flock_gas_saved,
      set_flock_gas_stale: samples.set_flock_gas_stale,
      send_flock_feed: samples.send_flock_feed,
      decide_flock_reject: samples.decide_flock_reject,
    }, null, 1) + '\n');
  }
}
