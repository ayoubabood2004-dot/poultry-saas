// جواب المالك الثاني في 0036 «عوف سالفة العلف الماكول» (DECISIONS 2026-11-24): لا علف مأكول في أيّ مكان، وكلّ رقم علف من العلف المرسل بتعريف ورقة
// القاعة الواحد (hall_sheet، 0035): المرسل للقاعة بيومه فيها + المنقول إليها يوم تسكينها − الراجع والمنقول منها يوم الإغلاق. هنا قرّاء 0036 التي
// كانت على المأكول: (١) public.halls_history: علف كلّ يوم (feed_kg) صافي المرسل لكلّ فوج يومه = مجموع (feed_kg − feed_back_kg) في أوراق أفواجه، وسطوره
// بلا كتلة (feed_unweighed)، والأشهر و«منذ البداية» مجموع الأيّام، وقيم باليد؛ (٢) public.flock_month: علف كلّ يوم = خانة يوم الورقة نفسها حرفاً (ومنها
// الصرف ليوم سابق والمنقول يوم التسكين)؛ (٣) public.flock_cycle_report: النازل في كلّ أسبوع (feed_given_kg وسطوره بلا كتلة) = مجموع أيّامه، والباقي
// الفعليّ عند الإغلاق للمغلقة (feed_close_left_kg: الراجع والمنقول والمحسوب مستهلَكاً) وفارغ للقائمة؛ (٤) الأجسام القبلية حرفاً من 0035 تفشل كلّها؛
// (٥) طفرات داخل معاملة صاحب الجداول ترجع: كلّ قاعدة مكسورة يمسكها فحصها؛ و(٦) علف اليوم في جواب «أرسل علفاً» (private.hall_feed_kg) = خانة الورقة ومعها
// المنقول إليها (كان المرسل وحده، فتعرض الجولة بعد الإرسال يوم التسكين مجموعاً بلا المنقول). وعيّنات القاعدة الحقيقية للشاشات: ROUND_FEED_SAMPLES_OUT=1 يكتب
// scripts/tests/fixtures/round-feed-0036.json (الجولة بسطر منقول اليوم، والسجلّ، والتقويم، وتقرير الدورة القائمة والمغلقة وبسطر بلا كتلة، وعلف القاعة،
// ونموذج الإغلاق).
// منشأة هذا الملفّ: المعرّفات d3639000-… والهواتف 96477036390xx (مفحوصة بـgrep على كلّ ملفّات الفحص).
// البذرة (اليوم 24 ت2، كلّها في ت2): حقل لحم بأربع قاعات — «قاعة الصافي» P (1,000 طير قبل 20 يوماً: 300 بادئ قبل عشرة أيّام، و50 ناهي يُرسل اليوم ليوم
// قبل ثلاثة أيّام، و200 ناهي أمس، وهلاكات 10 قبل ثلاثة أيّام، ووزن أمس 1,200 غم، ودواء اليوم)، و«قاعة بلا كتلة» U (500 طير: 100 بادئ وقطعتان من «علف بالقطعة»
// قبل خمسة أيّام)، و«قاعة الإغلاق» C (300 طير: 200 بادئ و30 ناهي و20 «علف ناعم» قبل أربعة أيّام، وتُغلق قبل يومين بإرجاع 150 بادئاً إلى «رصيد العلف»
// ونقل الثلاثين ناهياً للدورة التالية وعشرة من الناعم محسوبة مستهلَكة) ثمّ N فيها اليوم (300 طير) يدخلها المنقول ويُرسل لها 40 ناهياً؛ وحقل بيض بقاعة L
// (2,000 قبل عشرة أيّام، و100 بادئ قبل ثلاثة أيّام).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-feed-0036.json');
const TODAY = '2026-11-24';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `d3639000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477036390${String(n).padStart(2, '0')}`;

const HISTORY = 'select public.halls_history($1) as v';
const MONTH = 'select public.flock_month($1, $2) as v';
const REPORT = 'select public.flock_cycle_report($1) as v';
const SHEET = 'select public.hall_sheet($1) as v';
const ISSUE = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v';
const SEND = 'select public.send_flock_feed($1, $2, $3, $4, $5, $6, $7) as v';
const FN = { history: 'public.halls_history(date)', month: 'public.flock_month(uuid, date)', report: 'public.flock_cycle_report(uuid)' };

/** الكيلو بالآلاف: نصّ عشريّ ← BigInt (لا Number). */
const milli = (v) => {
  if (v === null || v === undefined) return null;
  const [whole, frac = ''] = String(v).split('.');
  const sign = whole.startsWith('-') ? -1n : 1n;
  return sign * (BigInt(whole.replace('-', '')) * 1000n + BigInt((frac + '000').slice(0, 3)));
};
const kgText = (m) => `${m < 0n ? '-' : ''}${(m < 0n ? -m : m) / 1000n}.${String((m < 0n ? -m : m) % 1000n).padStart(3, '0')}`;
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);

/** جسم دالّة كما في ملفّ هجرتها (من «create or replace function» حتى «$$;»). */
const bodyOf = (file, head) => {
  const text = readFileSync(path.join(MIGRATIONS, file), 'utf8');
  const start = text.indexOf(`create or replace function ${head}(`);
  return text.slice(start, text.indexOf('\n$$;', start) + 4);
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
  const G = await makeOrg(db, { name: 'مزرعة العلف المرسل', id, phone, roles: [['owner', 'owner'], ['manager', 'manager']] });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const at = (on, fn) => db.setToday(on, fn);
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };

  // ── البذرة ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const S = { a: await site('broiler', 'حقل العلف المرسل'), l: await site('layer', 'حقل بيض العلف') };
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { p: await hall(S.a, 'قاعة الصافي'), u: await hall(S.a, 'قاعة بلا كتلة'), c: await hall(S.a, 'قاعة الإغلاق'), l: await hall(S.l, 'قاعة بيض العلف') };
  const place = async (hallId, on, count) => (await one(U.owner, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const item = (name, unit = 'kg') => one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'feed', $2) returning id", [name, unit]);
  const I = { starter: await item('علف بادئ'), finisher: await item('علف ناهي'), mash: await item('علف ناعم'), piece: await item('علف بالقطعة', 'pc') };
  I.medicine = await one(U.owner, "insert into public.items (name, kind, base_unit) values ('فيتامين العلف', 'medicine', 'kg') returning id", []);
  await postedOpening(db, U.owner, W.feed, day(-15), [{ item: I.starter, qty: 5000, value: '2500000.00' }, { item: I.finisher, qty: 5000, value: '3000000.00' },
    { item: I.mash, qty: 500, value: '250000.00' }, { item: I.piece, qty: 10, value: '10000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-15), [{ item: I.medicine, qty: 100, value: '100000.00' }]);
  const issue = (flock, itemId, qty, on, wh = W.feed) => one(U.owner, ISSUE, [uid(), uid(), uid(), flock, itemId, qty, on, wh]);
  const F = {};
  await at(day(-20), async () => {
    F.p = await place(H.p, day(-20), 1000);
    F.u = await place(H.u, day(-20), 500);
    F.c = await place(H.c, day(-20), 300);
  });
  await at(day(-10), async () => {
    F.l = await place(H.l, day(-10), 2000);
    await issue(F.p, I.starter, 300, day(-10));
  });
  await at(day(-5), async () => {
    await issue(F.u, I.starter, 100, day(-5));
    await issue(F.u, I.piece, 2, day(-5));
  });
  await at(day(-4), async () => {
    await issue(F.c, I.starter, 200, day(-4));
    await issue(F.c, I.finisher, 30, day(-4));
    await issue(F.c, I.mash, 20, day(-4));
  });
  await at(day(-3), async () => {
    await issue(F.l, I.starter, 100, day(-3));
    await one(U.owner, 'select public.set_flock_dead($1, $2, $3, $4, false) as v', [F.p, day(-3), 10, uid()]);
  });
  await at(day(-2), async () => {
    const form = await one(U.owner, 'select public.flock_close_form($1) as v', [F.c]);
    const pools = form.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }));
    const lines = [{ item_id: I.starter, qty: '150', action: 'return', warehouse_id: W.feed }, { item_id: I.finisher, qty: '30', action: 'carry' },
      { item_id: I.mash, qty: '10', action: 'consumed' }];
    await one(U.owner, "select public.close_flock($1, $2, $3, $4, $5, 0, $6::jsonb, 'بيعت خارج النظام', $7::jsonb, null, $8) as v",
      [uid(), uid(), F.c, day(-2), form.flock.live, JSON.stringify(pools), JSON.stringify(lines), form.plan]);
  });
  await at(day(-1), async () => {
    await issue(F.p, I.finisher, 200, day(-1));
    await one(U.owner, 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [F.p, day(-1), 50, '1200.0', uid()]);
  });
  // اليوم: الوجبة التالية في «قاعة الإغلاق» يدخلها المنقول، ويُرسل لها 40 ناهياً؛ و50 ناهياً لـP ليوم قبل ثلاثة أيّام (يومه في القاعة لا تاريخ خروجه).
  F.n = await place(H.c, TODAY, 300);
  const sentN = await one(U.owner, SEND, [uid(), uid(), uid(), F.n, I.finisher, '40', TODAY]);
  await one(U.owner, SEND, [uid(), uid(), uid(), F.p, I.finisher, '50', day(-3)]);
  await issue(F.p, I.medicine, 5, TODAY, W.medicine);

  const sheets = {};
  for (const [key, flock] of Object.entries(F)) sheets[key] = await one(U.owner, SHEET, [flock]);
  const KIND = { p: 'broiler', u: 'broiler', c: 'broiler', n: 'broiler', l: 'layer' };
  const history = await one(U.owner, HISTORY, [null]);
  const kindOf = (v, kind) => v.kinds.find((k) => k.kind === kind);

  // ── ١) halls_history: علف اليوم صافي المرسل = أوراق القاعات ─────────────────────────────────────────────────────────
  await section('السجلّ', async () => {
    // (نوع، يوم) ← مجموع (علف اليوم − الراجع والمنقول يوم الإغلاق) في أوراق أفواجه حتى اليوم.
    const want = new Map();
    for (const [key, sheet] of Object.entries(sheets)) {
      for (const d of sheet.days.filter((x) => x.on <= TODAY)) {
        const k = `${KIND[key]}|${d.on}`;
        want.set(k, (want.get(k) ?? 0n) + (milli(d.feed_kg) ?? 0n) - (milli(d.feed_back_kg) ?? 0n));
      }
    }
    const problems = [];
    let compared = 0;
    for (const k of history.kinds) {
      for (const d of k.days) {
        compared += 1;
        const expected = want.get(`${k.kind}|${d.on}`) ?? 0n;
        if ((milli(d.feed_kg) ?? 0n) !== expected) problems.push(`${k.kind} ${d.on}: ${d.feed_kg} ≠ ${kgText(expected)}`);
      }
    }
    t.same(problems, [], `علف كلّ يوم في السجلّ = صافي أوراق قاعات نوعه يومها (${compared} يوم نوع)`);
    t.eq(compared, 21 + 11, 'كلّ أيّام اللاحم (من 4 ت2) والبيّاض (من 14 ت2)');
    // باليد: 300 (P) قبل عشرة أيّام؛ 100 وقطعتان بلا كتلة (U) قبل خمسة؛ 250 (C) قبل أربعة؛ 50 (P، يُرسل اليوم ليومه) قبل ثلاثة؛ −180 (الراجع والمنقول من C
    // يوم إغلاقها) قبل يومين؛ 200 (P) أمس؛ و30 المنقول + 40 (N) اليوم (ودواء P لا يُعدّ)؛ والأيّام الأخرى فارغة.
    const broiler = kindOf(history, 'broiler');
    const pick = (n) => {
      const d = broiler.days.find((x) => x.on === day(n));
      return [d.feed_kg, d.feed_unweighed];
    };
    same([-20, -10, -6, -5, -4, -3, -2, -1, 0].map(pick),
      [[null, 0], ['300.000', 0], [null, 0], ['100.000', 1], ['250.000', 0], ['50.000', 0], ['-180.000', 0], ['200.000', 0], ['70.000', 0]],
      'اللاحم يوماً بيوم: الصرف بيومه في القاعة، ويوم الإغلاق يطرح الراجع والمنقول، ويوم التسكين يضيف المنقول، وسطر بلا كتلة يُعدّ، والفارغ فارغ');
    // الشهر = الأيّام، ومنذ البداية = الأشهر: 300 + 100 + 250 + 50 − 180 + 200 + 70 = 790 = ما نزل من المخزن (940) − الراجع إليه (150)، والمنقول (30) لا
    // يُعدّ مرّتين؛ والنازل من المخزن كما هو (940: P 550 وU 100 وC 250 وN 40، بلا المنقول إليها).
    same([broiler.months.map((m) => [m.month, m.feed_kg, m.feed_unweighed, m.given_kg]), broiler.total.feed_kg, broiler.total.feed_unweighed, broiler.total.given_kg],
      [[['2026-11-01', '790.000', 1, '940.000']], '790.000', 1, '940.000'],
      'اللاحم: الشهر ومنذ البداية صافي المرسل 790 (لا المأكول)، والنازل من المخزن 940 كما هو');
    const layer = kindOf(history, 'layer');
    same([layer.days.find((x) => x.on === day(-3)).feed_kg, layer.total.feed_kg, layer.total.feed_unweighed], ['100.000', '100.000', 0], 'البيّاض: 100 يومها، ومنذ البداية 100');
    // صافي كلّ ورقة = مجموع أيّام فوجها في السجلّ.
    const sums = Object.entries(sheets).map(([key, sheet]) => [key, sheet.summary.feed_net_kg,
      kgText(sheet.days.filter((x) => x.on <= TODAY).reduce((a, d) => a + (milli(d.feed_kg) ?? 0n) - (milli(d.feed_back_kg) ?? 0n), 0n))]);
    same(sums, [['p', '550.000', '550.000'], ['u', '100.000', '100.000'], ['c', '70.000', '70.000'], ['l', '100.000', '100.000'], ['n', '70.000', '70.000']],
      'وصافي كلّ ورقة (P 550، U 100، C 250 − 180 = 70، البيّاض 100، N المنقول 30 + 40) = مجموع أيّامها');
    const v = Object.fromEntries((await db.asService((q) => q('select check_name, violations::int as v from public.verify_halls_history()'))).rows.map((r) => [r.check_name, r.v]));
    same(v, { halls_note_versions: 0, history_days_month: 0, history_months_total: 0 }, 'verify_halls_history بالصفر');
    samples.halls_history = history;
  });

  // ── ٢) flock_month: علف كلّ يوم = خانة يوم الورقة ───────────────────────────────────────────────────────────────────
  await section('التقويم', async () => {
    const problems = [];
    let compared = 0;
    for (const [key, flock] of Object.entries(F)) {
      const month = await one(U.owner, MONTH, [flock, TODAY]);
      const sheetDay = new Map(sheets[key].days.map((d) => [d.on, d]));
      for (const d of month.days) {
        const s = sheetDay.get(d.on);
        if (!s) {
          if (d.feed_kg !== null) problems.push(`${key} ${d.on}: ${d.feed_kg} خارج أيّام الوجبة`);
          continue;
        }
        compared += 1;
        if (d.feed_kg !== s.feed_kg) problems.push(`${key} ${d.on}: ${d.feed_kg} ≠ ${s.feed_kg}`);
      }
      samples[`flock_month_${key}`] = month;
    }
    t.same(problems, [], `علف كلّ يوم في التقويم = خانة يوم الورقة حرفاً (${compared} يوماً لخمس وجبات)`);
    const p = samples.flock_month_p;
    const pd = (n) => p.days.find((x) => x.on === day(n)).feed_kg;
    same([pd(-10), pd(-3), pd(-2), pd(-1), pd(0), samples.flock_month_c.days.find((x) => x.on === day(-2)).feed_kg,
      samples.flock_month_n.days.find((x) => x.on === TODAY).feed_kg, samples.flock_month_u.days.find((x) => x.on === day(-5)).feed_kg],
    ['300.000', '50.000', null, '200.000', null, null, '70.000', '100.000'],
    'P: 300 و50 (أُرسل اليوم ليومه) و200 أمس، وبلا إرسال فارغ (والدواء اليوم ليس علفاً)؛ وC يوم إغلاقها فارغ (الراجع في «الخارج»)؛ وN يوم تسكينها المنقول والمرسل؛ وU الموزون وحده');
    // ومجموع الشهر كما هو: النازل من المخزن في الشهر (P: 300 + 200 + 50، بلا المأكول ولا المنقول).
    same([p.totals.feed_kg, samples.flock_month_n.totals.feed_kg], ['550.000', '40.000'], 'مجموع الشهر النازل من المخزن كما كان');
  });

  // ── ٣) flock_cycle_report: النازل في كلّ أسبوع، والباقي الفعليّ عند الإغلاق ────────────────────────────────────────────
  await section('تقرير الدورة', async () => {
    const reports = {};
    for (const key of ['p', 'u', 'c', 'n']) reports[key] = await one(U.owner, REPORT, [F[key]]);
    const problems = [];
    for (const [key, r] of Object.entries(reports)) {
      for (const w of r.weeks) {
        const days = r.days.filter((d) => d.on >= w.from_on && d.on <= w.to_on);
        const kg = kgText(days.reduce((a, d) => a + milli(d.feed_given_kg), 0n));
        const unweighed = days.reduce((a, d) => a + d.feed_given_unweighed, 0);
        if (w.feed_given_kg !== kg || w.feed_given_unweighed !== unweighed) problems.push(`${key} أسبوع ${w.week}: ${w.feed_given_kg}/${w.feed_given_unweighed} ≠ ${kg}/${unweighed}`);
      }
    }
    t.same(problems, [], 'النازل في كلّ أسبوع وسطوره بلا كتلة = مجموع أيّامه');
    same([reports.p.weeks.map((w) => [w.week, w.feed_given_kg, w.feed_given_unweighed]), reports.u.weeks.map((w) => [w.week, w.feed_given_kg, w.feed_given_unweighed]),
      reports.c.weeks.map((w) => [w.week, w.feed_given_kg])],
    [[[1, '0.000', 0], [2, '300.000', 0], [3, '250.000', 0]], [[1, '0.000', 0], [2, '0.000', 0], [3, '100.000', 1]], [[1, '0.000'], [2, '0.000'], [3, '250.000']]],
    'P بأسابيعها (الثالث 50 + 200)، وU بسطر بلا كتلة، وC أسبوع إرسالها');
    same([reports.c.kpis.feed_close_left_kg, reports.c.kpis.feed_close_left_unweighed, reports.c.kpis.feed_out_kg, reports.p.kpis.feed_close_left_kg,
      reports.p.kpis.feed_close_left_unweighed, reports.n.kpis.feed_close_left_kg],
    ['190.000', 0, '180.000', null, null, null],
    'الباقي الفعليّ عند إغلاق C = 150 راجعاً + 30 منقولاً + 10 محسوبة مستهلَكة (والخارج 180)، والقائمة بلا باقٍ');
    Object.assign(samples, { flock_cycle_report_p: reports.p, flock_cycle_report_u: reports.u, flock_cycle_report_c: reports.c, flock_cycle_report_n: reports.n });
  });

  // ── ٤) الأجسام القبلية حرفاً من 0035 تفشل كلّها، والحاليّة تمرّ ──────────────────────────────────────────────────────────
  await section('القبلية', async () => {
    const OLD = [
      {
        name: 'halls_history كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'public.halls_history'),
        run: async ({ attempt }) => {
          const k = (await inside(attempt, U.owner, HISTORY, [null]))?.kinds?.find((x) => x.kind === 'broiler');
          return [k?.total?.feed_kg, k?.days?.find((d) => d.on === day(-2))?.feed_kg];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['790.000', '-180.000']),
      },
      {
        name: 'flock_month كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'public.flock_month'),
        run: async ({ attempt }) => (await inside(attempt, U.owner, MONTH, [F.p, TODAY]))?.days?.find((d) => d.on === day(-10))?.feed_kg,
        correct: (v) => v === '300.000',
      },
      {
        name: 'hall_feed_kg كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'private.hall_feed_kg'),
        run: async ({ attempt }) => (await inside(attempt, U.owner, SEND, [uid(), uid(), uid(), F.n, I.finisher, '5', TODAY]))?.day?.feed_kg,
        correct: (v) => v === '75.000',
      },
      {
        name: 'flock_cycle_report كما في 0035',
        body: bodyOf('0035_hall_sheet.sql', 'public.flock_cycle_report'),
        run: async ({ attempt }) => {
          const r = await inside(attempt, U.owner, REPORT, [F.c]);
          return [r?.weeks?.at(-1)?.feed_given_kg ?? null, r?.kpis?.feed_close_left_kg ?? null];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['250.000', '190.000']),
      },
    ];
    const outcomes = [];
    for (const c of OLD) {
      const real = await mutant(db, U.owner, [], (kit) => c.run(kit));
      const old = await mutant(db, U.owner, [], async (kit) => {
        await kit.oq(c.body);
        return c.run(kit);
      });
      outcomes.push({ name: c.name, real: c.correct(real), caught: !c.correct(old), shown: JSON.stringify(real), old: JSON.stringify(old) });
    }
    t.same(outcomes.filter((o) => !o.real || !o.caught).map((o) => `${o.name}: الحاليّ ${o.shown} والقبليّ ${o.old}`), [],
      `الأجسام القبلية (${OLD.length}) حرفاً تفشل كلّها بما يمسكه الفحص، والحاليّة تمرّ`);
  });

  // ── ٥) الطفرات: كلّ قاعدة مكسورة يمسكها فحصها ───────────────────────────────────────────────────────────────────────
  await section('الطفرات', async () => {
    const broilerDay = async (attempt, n) => (await inside(attempt, U.owner, HISTORY, [null]))?.kinds?.find((x) => x.kind === 'broiler')?.days?.find((d) => d.on === day(n));
    const CASES = [
      {
        name: 'السجلّ: الخارج يوم الإغلاق يُطرح',
        fns: [[FN.history, [['then round(z.given_kg, 3) - round(z.out_kg, 3) end', 'then round(z.given_kg, 3) end']]]],
        run: async ({ attempt }) => (await broilerDay(attempt, -2))?.feed_kg,
        correct: (v) => v === '-180.000',
      },
      {
        name: 'السجلّ: يوم الخارج وحده ليس فارغاً',
        fns: [[FN.history, [['or z.out_kg <> 0 or z.out_unweighed > 0', '']]]],
        // يوم إغلاق C بلا إرسال لغيرها: الخارج وحده يومٌ بعلف (−180) لا فارغ.
        run: async ({ attempt }) => (await broilerDay(attempt, -2))?.feed_kg ?? 'null',
        correct: (v) => v === '-180.000',
      },
      {
        name: 'السجلّ: المنقول إليها يوم التسكين',
        fns: [[FN.history, [['round(z.given_kg, 3) - round(z.out_kg, 3)', 'round(z.given_kg - z.carry_in_kg, 3) - round(z.out_kg, 3)']]]],
        run: async ({ attempt }) => (await broilerDay(attempt, 0))?.feed_kg,
        correct: (v) => v === '70.000',
      },
      {
        name: 'السجلّ: سطور بلا كتلة تُعدّ',
        fns: [[FN.history, [['coalesce(sum(z.given_unweighed + z.out_unweighed), 0)::bigint as feed_unweighed', '0::bigint as feed_unweighed']]]],
        run: async ({ attempt }) => (await broilerDay(attempt, -5))?.feed_unweighed,
        correct: (v) => v === 1,
      },
      {
        name: 'التقويم: الصرف بيومه في القاعة',
        fns: [[FN.month, [['l.cost_kind = \'feed\' and private.issue_day(x) = g.d) as s', 'l.cost_kind = \'feed\' and x.issued_on = g.d) as s']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, MONTH, [F.p, TODAY]))?.days?.find((d) => d.on === day(-3))?.feed_kg,
        correct: (v) => v === '50.000',
      },
      {
        name: 'التقويم: المنقول إليها يوم تسكينها',
        fns: [[FN.month, [['then round(coalesce(s.kg, 0) + coalesce(c.kg, 0), 3) end', 'then round(coalesce(s.kg, 0), 3) end']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, MONTH, [F.n, TODAY]))?.days?.find((d) => d.on === TODAY)?.feed_kg,
        correct: (v) => v === '70.000',
      },
      {
        name: 'التقويم: علف الدواء ليس علفاً',
        fns: [[FN.month, [["x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) = g.d) as s", "x.status = 'posted' and private.issue_day(x) = g.d) as s"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, MONTH, [F.p, TODAY]))?.days?.find((d) => d.on === TODAY)?.feed_kg,
        correct: (v) => v === null,
      },
      {
        name: 'تقرير الدورة: النازل في الأسبوع',
        fns: [[FN.report, [["'feed_given_kg', round(sum(w.given_kg), 3)::text", "'feed_given_kg', round(sum(w.given_kg - w.carry_in_kg), 3)::text"]]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, REPORT, [F.n]))?.weeks?.at(-1)?.feed_given_kg,
        correct: (v) => v === '70.000',
      },
      {
        name: 'تقرير الدورة: الباقي الفعليّ يعدّ المحسوب مستهلَكاً',
        fns: [[FN.report, [['round(fc.out_cum_kg + fc.used_cum_kg, 3)', 'round(fc.out_cum_kg, 3)']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, REPORT, [F.c]))?.kpis?.feed_close_left_kg,
        correct: (v) => v === '190.000',
      },
    ];
    const outcomes = [];
    for (const c of CASES) {
      const real = await mutant(db, U.owner, [], (kit) => c.run(kit));
      let broken;
      try {
        broken = await mutant(db, U.owner, c.fns, (kit) => c.run(kit));
      } catch (error) {
        broken = { lostAnchor: error.message };
      }
      outcomes.push({ name: c.name, real: c.correct(real), caught: !Object.hasOwn(Object(broken), 'lostAnchor') && !c.correct(broken), shown: JSON.stringify(real),
        broken: JSON.stringify(broken) });
    }
    t.same(outcomes.filter((o) => !o.real).map((o) => `${o.name}: ${o.shown}`), [], `الطفرات (${CASES.length}): الشفرة الحقيقية بالصحيح في كلّ حالة`);
    t.same(outcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${o.broken}`), [], `الطفرات: ${outcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت`);
  });

  // ── ٦) جواب «أرسل علفاً» يوم التسكين: علف اليوم كخانة الورقة ومعه المنقول ────────────────────────────────────────────────────
  await section('جواب الإرسال', async () => {
    const nDay = sheets.n.days.find((d) => d.on === TODAY);
    same([sentN.day.on, sentN.day.feed_kg, nDay.feed_kg, nDay.carry_in_kg], [TODAY, '70.000', '70.000', '30.000'],
      'إرسال 40 لـN يوم تسكينها: علف اليوم في الجواب 70 (المنقول 30 والمرسل) = خانة الورقة، لا 40');
    // داخل معاملة ترجع (فلا تتغيّر عيّنات الشاشات بعدها).
    const p = await mutant(db, U.owner, [], ({ attempt }) => inside(attempt, U.owner, SEND, [uid(), uid(), uid(), F.p, I.finisher, '10', day(-1)]));
    same([p.day.on, p.day.feed_kg], [day(-1), '210.000'], 'وبلا منقول: علف يوم الإرسال المرسل وحده (200 + 10)');
    samples.send_flock_feed_carry = sentN;
  });

  // ── عيّنات الشاشات ─────────────────────────────────────────────────────────────────────────────────────────────────
  samples.flocks_overview = await one(U.owner, 'select public.flocks_overview() as v', []);
  samples.halls_day = await one(U.owner, 'select public.halls_day($1) as v', [TODAY]);
  samples.flock_feed_p = await one(U.owner, 'select public.flock_feed($1) as v', [F.p]);
  samples.flock_feed_u = await one(U.owner, 'select public.flock_feed($1) as v', [F.u]);
  samples.flock_close_form_p = await one(U.owner, 'select public.flock_close_form($1) as v', [F.p]);
  samples.flock_close_form_u = await one(U.owner, 'select public.flock_close_form($1) as v', [F.u]);
  const nToday = samples.flocks_overview.sites.flatMap((s) => s.halls).find((h) => h.id === H.c)?.flock;
  same([nToday?.feed_today_kg, nToday?.feed_today?.map((l) => [l.item_name, l.qty, l.carry])], ['70.000', [['علف ناهي', '30.000', true], ['علف ناهي', '40.000', false]]],
    'الجولة: «أُرسل اليوم» لـN المنقول أوّلاً بعلامته ثمّ المرسل، والمجموع يعدّهما مرّة');
  if (process.env.ROUND_FEED_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/round-once-feed.test.mjs بـROUND_FEED_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات. «قاعة الصافي» P قائمة بمعامل تحويل، و«قاعة بلا كتلة» U بسطر بلا كتلة، و«قاعة الإغلاق» C مغلقة بإرجاع ونقل ومحسوب مستهلَكاً ثمّ N فيها اليوم بالمنقول والمرسل، وقاعة بيض.`,
      ids: { flocks: F, halls: H, items: I },
      ...samples,
    }, null, 1) + '\n');
  }
}
