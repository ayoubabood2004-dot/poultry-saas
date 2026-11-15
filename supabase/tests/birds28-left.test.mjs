// «الباقي في القاعة» لدورة مغلقة (0028، إعادة مراجعة الشاشات F2b؛ HANDOFF 4.1.7): يوم إغلاق الدورة وبعده صفر بلا سطور في كلّ قارئ (flock_feed وتقرير
// الدورة: العلف والمؤشّرات وآخر يوم، ونموذج الإغلاق، والتقرير اليوميّ)، لأنّ كلّ باقٍ أخذ مصيره (رجع إلى مخزن أو انتقل للدورة التالية أو حُسب
// مستهلَكاً)، وما أُكل ولم يُسجَّل في الجولات من استهلاك الدورة (feed_net_kg في المؤشّرات). كان = النازل − الخارج − المستهلَك − المأكول المسجّل، أي
// المأكول غير المسجّل (1,500 كغم هنا، و35,412 في عيّنة close.test). والأيّام قبل يوم الإغلاق بقيمها، والمنقول المعلَّق يظهر على القاعة الفارغة (carry)،
// والفوج المُعاد فتحه يعود كالقائم. كلّ فحص بقسم يفشل على 1b443ea بشقّه المغلق؛ وشقّا «قبل يوم الإغلاق» و«بعد إعادة الفتح» تثبت طفرتان أنّهما يمسكان
// تطبيقاً بديلاً معقولاً (الإغلاق بلا يومه، وأيّ إغلاق ولو أُعيد فتحه). منشأة هذا الملف وحدها: المعرّفات f2850000 والهواتف 96477028500. واسمه بعد
// birds.test بالترتيب (birds28 > birds.)، ولا تذكرة فيه ولا فاتورة.
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-12';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `f2850000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028500${String(n).padStart(2, '0')}`;

const HALL_LEFT = 'private.hall_left(public.flocks, date, numeric, numeric, numeric, numeric, integer, integer, integer)';
const EMPTIED = "coalesce(f.status = 'closed' and p_on >= f.closed_on, false)";
const CLOSE = 'select public.close_flock($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11)';
const REOPEN = 'select public.reopen_flock($1, $2, $3)';
const ISSUE = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8)';

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);
  const same = (actual, expected, label) => t.same(sorted(actual), sorted(expected), label);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };
  const G = await makeOrg(db, { name: 'مزرعة الباقي', id, phone, roles: [['owner', 'owner'], ['manager', 'manager']] });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const admin = async (sql, params) => (await db.admin(sql, params)).rows;
  const at = (on, fn) => db.setToday(on, fn);
  const W = Object.fromEntries((await admin('select kind, id from public.warehouses where org_id = $1', [org])).map((r) => [r.kind, r.id]));
  const site = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الباقي', 'farm') returning id", [D.broiler]);
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [site, name]);
  const item = (name, unit) => one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'feed', $2) returning id", [name, unit]);
  const I = { x: await item('علف بادئ', 'kg'), y: await item('علف نامي', 'kg'), v: await item('علف ناهي', 'kg'), u: await item('علف بلا وزن', 'pc') };
  await postedOpening(db, U.owner, W.feed, day(-40), [{ item: I.x, qty: 5000, value: '3500000.00' }, { item: I.y, qty: 5000, value: '3500000.00' },
    { item: I.v, qty: 5000, value: '3500000.00' }, { item: I.u, qty: 10, value: '100000.00' }]);

  // ── الأدوات ────────────────────────────────────────────────────────────────────────────────────────────
  const place = async (hallId, on, count) => (await one(U.manager, 'select public.open_flock($1, $2, $3, 0, null, $4)', [hallId, on, count, uid()])).flock_id;
  const issue = (flock, itemId, qty, on) => one(U.manager, ISSUE, [uid(), uid(), uid(), flock, itemId, qty, on, W.feed]);
  const round = async (flock, on, feed) => {
    const v = await one(U.manager, 'select public.save_flock_day($1, $2, 0, 0, $3, null, null, null, null, null, null, null, null, $4, false)', [flock, on, feed, uid()]);
    if (v.status !== 'saved') throw new Error(`جولة ${on}: ${JSON.stringify(v)}`);
  };
  const form = (flock) => one(U.manager, 'select public.flock_close_form($1)', [flock]);
  /** الإغلاق كما ترسله شاشته: الحيّ والمباع وما نزل لكلّ مادّة وبصمته من نموذجه. */
  const closeOk = async (flock, on, lines) => {
    const f = await form(flock);
    return one(U.manager, CLOSE, [uid(), uid(), flock, on, f.flock.live, f.sales.birds, JSON.stringify(f.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }))),
      'نهاية الدورة', JSON.stringify(lines), null, f.plan]);
  };
  const back = (itemId, qty) => ({ item_id: itemId, qty, action: 'return', warehouse_id: W.feed });
  const carry = (itemId, qty) => ({ item_id: itemId, qty, action: 'carry' });
  const used = (itemId, qty) => ({ item_id: itemId, qty, action: 'consumed' });
  const hallOf = (v, hallId) => v.sites.flatMap((s) => s.halls).find((h) => h.hall_id === hallId);
  /** القرّاء الأربعة بالنداء نفسه (q من معاملة الطفرة، أو بالمدير). */
  const readers = (q) => ({
    feed: (flock) => q('select public.flock_feed($1) as v', [flock]),
    report: (flock) => q('select public.flock_cycle_report($1) as v', [flock]),
    form: (flock) => q('select public.flock_close_form($1) as v', [flock]),
    day: (on) => q('select public.halls_day($1) as v', [on]),
  });
  const direct = readers(async (sql, params) => one(U.manager, sql.replace(' as v', ''), params));
  const pair = (x) => [x?.left_in_hall_kg ?? null, x?.left_in_hall_unweighed ?? null];
  /** «الباقي في القاعة» [كغم، سطور بلا كتلة] في كلّ قارئ: علف القاعة، وتقرير الدورة (العلف والمؤشّرات وآخر يوم بيومه)، ونموذج الإغلاق، والتقرير اليوميّ ليوم. */
  const everywhere = async (r, flock, hallId, on) => {
    const report = await r.report(flock);
    const last = report.days.at(-1);
    return {
      flock_feed: pair(await r.feed(flock)),
      report_feed: pair(report.feed),
      report_kpis: pair(report.kpis),
      report_last_day: [last.on, ...pair(last)],
      close_form: pair((await r.form(flock)).feed),
      halls_day: pair(hallOf(await r.day(on), hallId).flock),
    };
  };
  const zero = (on) => ({ flock_feed: ['0.000', 0], report_feed: ['0.000', 0], report_kpis: ['0.000', 0], report_last_day: [on, '0.000', 0], close_form: ['0.000', 0],
    halls_day: ['0.000', 0] });
  /** أيّام تقرير الدورة: اليوم ← [كغم، سطور]. */
  const daysOf = (report) => Object.fromEntries(report.days.map((d) => [d.on, pair(d)]));

  // ── التجهيز ───────────────────────────────────────────────────────────────────────────────────────────
  // A (قاعة 1): 1,000 طير يوم −10، ونزل 1,500 «بادئ» + 1,500 «نامي» + 1,000 «ناهي» = 4,000 كغم، وأُكل في الجولات 1,000 يوم −9 و1,000 يوم −8. الإغلاق
  // يوم −7 يرجع 100 «بادئ» إلى «رصيد العلف» ويحسب 150 «نامي» مستهلَكاً وينقل 250 «ناهي»: 4,000 − 100 − 150 − 250 − 2,000 = 1,500 كغم أُكلت ولم تُسجَّل.
  // B (قاعة 2): 1,000 طير يوم −10، ونزل 600 «بادئ» + 300 «ناهي» = 900 كغم وقطعتا «بلا وزن» (سطر بلا كتلة)، وأُكل 200 يوم −9. الإغلاق يوم −7 يرجع 100
  // «بادئ» وينقل 50 «ناهي» ويحسب القطعتين مستهلَكتين: كان 900 − 150 − 200 = 550 بسطرين بلا كتلة (النازل والمستهلَك).
  const H = { a: await hall('قاعة 1'), b: await hall('قاعة 2') };
  const F = {};
  await at(day(-10), async () => {
    F.a = await place(H.a, day(-10), 1000);
    F.b = await place(H.b, day(-10), 1000);
    for (const [itemId, qty] of [[I.x, '1500'], [I.y, '1500'], [I.v, '1000']]) await issue(F.a, itemId, qty, day(-10));
    for (const [itemId, qty] of [[I.x, '600'], [I.v, '300'], [I.u, '2']]) await issue(F.b, itemId, qty, day(-10));
  });
  await at(day(-8), async () => {
    await round(F.a, day(-9), '1000');
    await round(F.a, day(-8), '1000');
    await round(F.b, day(-9), '200');
  });
  const closes = {};

  // ── 1) يوم الإغلاق: صفر في كلّ قارئ، والمأكول غير المسجّل في العلف الصافي ──────────────────────────────────────────────
  await at(day(-7), async () => {
    await section('1 يوم الإغلاق', async () => {
      closes.a = await closeOk(F.a, day(-7), [back(I.x, '100'), used(I.y, '150'), carry(I.v, '250')]);
      closes.b = await closeOk(F.b, day(-7), [back(I.x, '100'), carry(I.v, '50'), used(I.u, '2')]);
      const report = await direct.report(F.a);
      same([await everywhere(direct, F.a, H.a, null), await everywhere(direct, F.b, H.b, null),
        [report.kpis.feed_given_kg, report.kpis.feed_out_kg, report.kpis.feed_eaten_kg, report.kpis.feed_net_kg]],
      [zero(day(-7)), zero(day(-7)), ['4000.000', '350.000', '2000.000', '3650.000']],
      '1 يوم الإغلاق: «الباقي في القاعة» صفر بلا سطور في علف القاعة وتقرير الدورة (العلف والمؤشّرات وآخر يوم) ونموذج الإغلاق والتقرير اليوميّ (كان 1,500 لـA و550 بسطرين لـB)؛ '
        + 'والعلف الصافي 4,000 − 350 = 3,650 = المأكول المسجّل 2,000 + المستهلَك 150 + غير المسجّل 1,500');
    });
  });

  // ── 2) قبل يوم الإغلاق بقيمها، ويومه صفر ──────────────────────────────────────────────────────────────────────────
  await section('2 الأيّام قبل يوم الإغلاق', async () => {
    const report = await direct.report(F.a);
    same([daysOf(report), pair(hallOf(await direct.day(day(-9)), H.a).flock), pair(hallOf(await direct.day(day(-8)), H.a).flock),
      pair(hallOf(await direct.day(day(-7)), H.a).flock)],
    [{ [day(-10)]: ['4000.000', 0], [day(-9)]: ['3000.000', 0], [day(-8)]: ['2000.000', 0], [day(-7)]: ['0.000', 0] }, ['3000.000', 0], ['2000.000', 0], ['0.000', 0]],
    '2 أيّام تقرير الدورة والتقرير اليوميّ قبل يوم الإغلاق كما كانت (النازل − المأكول: 4,000 ثمّ 3,000 ثمّ 2,000)، ويوم الإغلاق صفر');
  });

  // ── 3) بعد يوم الإغلاق: القرّاء صفر، والقاعة فارغة والمنقول المعلَّق عليها carry ────────────────────────────────────────────
  await section('3 بعد يوم الإغلاق', async () => {
    const carryOf = (on) => direct.day(on).then((v) => {
      const h = hallOf(v, H.a);
      return [h.flock, h.carry.map((l) => [l.name, l.qty, l.kg, l.closed_on, l.from_flock_id])];
    });
    const pending = [null, [['علف ناهي', '250', '250.000', day(-7), F.a]]];
    same([await everywhere(direct, F.a, H.a, day(-7)), await carryOf(day(-6)), await carryOf(TODAY)], [zero(day(-7)), pending, pending],
      '3 بعد يوم الإغلاق القرّاء كلّها صفر للفوج المغلق (حتى يوم إغلاقه)، والقاعة بلا فوج والمنقول المعلَّق 250 كغم عليها carry لا «باقياً» في الفوج');
  });

  // ── 4) إعادة الفتح: يعود كالقائم (النازل − المأكول، وسطره بلا كتلة) ─────────────────────────────────────────────────────
  await section('4 إعادة الفتح', async () => {
    const before = await everywhere(direct, F.b, H.b, day(-7));
    const reopened = await call(db, U.manager, REOPEN, [closes.b.id, 'أُغلقت خطأً', uid()]);
    const active = await everywhere(direct, F.b, H.b, day(-7));
    const today = pair(hallOf(await direct.day(TODAY), H.b).flock);
    const report = await direct.report(F.b);
    same([before, reopened.ok, active, today, daysOf(report)[day(-7)]],
      [zero(day(-7)), true, { flock_feed: ['700.000', 1], report_feed: ['700.000', 1], report_kpis: ['700.000', 1], report_last_day: [TODAY, '700.000', 1],
        close_form: ['700.000', 1], halls_day: ['700.000', 1] }, ['700.000', 1], ['700.000', 1]],
      '4 B المغلقة صفر، وبعد إعادة الفتح كالقائمة في كلّ قارئ: 900 − 200 = 700 كغم وسطر «بلا وزن» النازل، يوم الإغلاق الملغى واليوم');
  });

  // ── 5) الطفرتان: تطبيق بديل معقول لـ«يوم الإغلاق وبعده» يمسكه فحصه ───────────────────────────────────────────────────────
  // (أ) الإغلاق بلا يومه (كلّ يوم لدورة مغلقة صفر): فحص 2 يمسكه (أيّام A قبل الإغلاق صفر). (ب) أيّ إغلاق للفوج ولو أُعيد فتحه: فحص 4 يمسكه (B بعد
  // إعادة الفتح صفر).
  await section('5 الطفرتان', async () => {
    const run = (to, fn) => mutant(db, U.manager, [[HALL_LEFT, [[EMPTIED, to]]]], async ({ attempt }) => {
      const result = await attempt(U.manager, async (q) => fn(readers(async (sql, params) => (await q(sql, params)).rows[0].v)));
      if (!result.ok) throw new Error(`الطفرة: ${result.code} ${result.hint}`);
      return result.value;
    });
    const noDay = await run("coalesce(f.status = 'closed', false)", async (r) => daysOf(await r.report(F.a))[day(-8)]);
    const anyClose = await run(`exists (select 1 from public.flock_closes c where c.org_id = f.org_id and c.flock_id = f.id and c.closed_on <= p_on)`,
      async (r) => (await everywhere(r, F.b, H.b, day(-7))).flock_feed);
    same([noDay, anyClose], [['0.000', 0], ['0.000', 0]],
      '5 الطفرتان: «مغلقة بلا يوم» تصفّر أيّام A قبل الإغلاق (2,000 يوم −8 في فحص 2)، و«أيّ إغلاق ولو أُعيد فتحه» تصفّر B بعد إعادة الفتح (700 في فحص 4)');
  });
}
