// إعادة مراجعة 0028 بعد إصلاحاتها (2d2005e و3eb8bc2): كلّ ملاحظة أثبتها مشكّك على 1b443ea فحصٌ هنا فشل عليه قبل إصلاحه.
// F2b (الشاشات؛ HANDOFF 4.1.7): «الباقي في القاعة» لدورة مغلقة يوم إغلاقها وبعده صفر بلا سطور في كلّ قارئ (flock_feed وتقرير الدورة: العلف والمؤشّرات
//   وآخر يوم، ونموذج الإغلاق، والتقرير اليوميّ)، لأنّ كلّ باقٍ أخذ مصيره (رجع إلى مخزن أو انتقل للدورة التالية أو حُسب مستهلَكاً)، وما أُكل ولم يُسجَّل
//   في الجولات من استهلاك الدورة (feed_net_kg). كان = النازل − الخارج − المستهلَك − المأكول المسجّل، أي المأكول غير المسجّل (1,500 كغم هنا، و35,412 في عيّنة
//   close.test). والأيّام قبل يوم الإغلاق بقيمها، والمنقول المعلَّق على القاعة الفارغة (carry)، والمُعاد فتحه كالقائم؛ وطفرتان تثبتان أنّ شقّي «قبل يوم
//   الإغلاق» و«بعد إعادة الفتح» يمسكان تطبيقاً بديلاً معقولاً (الإغلاق بلا يومه، وأيّ إغلاق ولو أُعيد فتحه). الأقسام 1–5.
// DN1: إعادة return_hall_carry (بالمرجع أو بالمعرّف) بعد إعادة فتح الدورة التي ألغت مستند FR كانت ترجع «أُرجع FR-…» المحفوظ؛ الآن id_conflict. القسم 6.
// DN2: بيع الكلّ بتذكرة يوم D وفاتورة بعده، وجولات بعلف صفر بينهما (والنظام ينتظرها): كانت تُعدّ في أيّام العلف لا في أيّامه اللازمة فيسقط معامل التحويل
//   عند ترحيل الفاتورة؛ الآن 0.600 في الحالات الأربع (بلا جولات، وجولات بلا علف، وبعلف صفر، وفي flock_detail والتقرير اليوميّ). القسم 7.
// DN3: سلال أقفال معرّفات الوزنات كانت مشتركة بين المنشآت، فحفظ ميزان أقفاص في منشأة ينتظر حفظاً في منشأة أخرى (حتى مهلة القفل 55P03). القسم 8.
// DN4: البطاقة كانت تعد بإعادة فتح يرفضها reopen_flock حتماً count_superseded (جرد معتمد لمادّة FR في مخزنه بعد الإرجاع). القسم 9.
// منشأتا هذا الملف وحدهما: المعرّفات f2860000 والهواتف 96477028600، والثانية f2870000 و96477028700. واسمه بعد birds.test بالترتيب (birds28 > birds.):
// ذاك يبحث عن أرقام BR وWT في المنشآت كلّها ويفترض أنّه أوّل من يكتبها. كلّ قسم بـsection: رمية فيه فحص فاشل باسمه ولا توقف الملف.
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-12';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `f2860000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028600${String(n).padStart(2, '0')}`;
const id2 = (n) => `f2870000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone2 = (n) => `96477028700${String(n).padStart(2, '0')}`;

const HALL_LEFT = 'private.hall_left(public.flocks, date, numeric, numeric, numeric, numeric, integer, integer, integer)';
const EMPTIED = "coalesce(f.status = 'closed' and p_on >= f.closed_on, false)";
const CLOSE = 'select public.close_flock($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11)';
const REOPEN = 'select public.reopen_flock($1, $2, $3)';
const RETURN_CARRY = 'select public.return_hall_carry($1, $2, $3, $4)';
const ISSUE = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8)';
const SAVE = 'select public.save_weigh_ticket($1, $2, $3::jsonb)';
const FINISH = 'select public.finish_weigh_ticket($1, $2, $3)';
const SELL = 'select public.record_bird_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)';
const ADJUST = 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7)';
const OPEN = 'select public.open_flock($1, $2, $3, 0, null, $4)';

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
  const G = await makeOrg(db, {
    name: 'مزرعة إعادة المراجعة',
    id,
    phone,
    roles: [['owner', 'owner'], ['manager', 'manager'], ['accountant', 'accountant'], ['worker', 'hall_worker', ['broiler']]],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const admin = async (sql, params) => (await db.admin(sql, params)).rows;
  const at = (on, fn) => db.setToday(on, fn);
  const W = Object.fromEntries((await admin('select kind, id from public.warehouses where org_id = $1', [org])).map((r) => [r.kind, r.id]));
  const site = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل المراجعة', 'farm') returning id", [D.broiler]);
  W.farm = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل المراجعة', 'farm') returning id", [D.broiler, site]);
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [site, name]);
  const item = (name, unit) => one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'feed', $2) returning id", [name, unit]);
  const I = { x: await item('علف بادئ', 'kg'), y: await item('علف نامي', 'kg'), v: await item('علف ناهي', 'kg'), u: await item('علف بلا وزن', 'pc'),
    q: await item('علف الجرد', 'kg') };
  await postedOpening(db, U.owner, W.feed, day(-40), [{ item: I.x, qty: 10000, value: '7000000.00' }, { item: I.y, qty: 5000, value: '3500000.00' },
    { item: I.v, qty: 5000, value: '3500000.00' }, { item: I.u, qty: 10, value: '100000.00' }]);
  await postedOpening(db, U.owner, W.farm, day(-40), [{ item: I.q, qty: 1000, value: '900000.00' }]);
  const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر المراجعة', true) returning id");

  // ── الأدوات ────────────────────────────────────────────────────────────────────────────────────────────
  const place = async (hallId, on, count) => (await one(U.manager, OPEN, [hallId, on, count, uid()])).flock_id;
  const issue = (flock, itemId, qty, on, wh = W.feed) => one(U.manager, ISSUE, [uid(), uid(), uid(), flock, itemId, qty, on, wh]);
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
  const card = (flock) => one(U.manager, 'select public.flock_sales($1)', [flock]);
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

  // ── التجهيز (F2b) ─────────────────────────────────────────────────────────────────────────────────────
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

  // ── 6) DN1: إعادة «أرجعه إلى مخزن» بعد إعادة فتح الدورة ─────────────────────────────────────────────────────────────────
  // FI 300 «بادئ»، والإغلاق أمس ينقل 100، ثمّ يُرجع المنقول اليوم (FR)، ثمّ تُعاد الدورة فيُلغى FR. الإعادة بالمرجع نفسه وبمرجع جديد والمعرّف نفسه
  // id_conflict بجملة الإلغاء (كانت ترجع «أُرجع» برقم مستند ملغى)، والرصيد كما هو بعد إعادة الفتح.
  await section('6 DN1 إعادة الإرجاع بعد إعادة الفتح', async () => {
    const h = await hall('قاعة الإرجاع');
    const flock = await place(h, day(-10), 100);
    await issue(flock, I.x, '300', day(-6));
    const closed = await closeOk(flock, day(-1), [carry(I.x, '100')]);
    const args = [uid(), uid(), closed.lines[0].line_id, W.feed];
    const first = await one(U.manager, RETURN_CARRY, args);
    await one(U.manager, REOPEN, [closed.id, 'أُغلقت خطأً', uid()]);
    const balance = async () => (await admin('select trim_scale(qty)::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [I.x, W.feed]))[0].q;
    const after = await balance();
    const sameRef = await call(db, U.manager, RETURN_CARRY, args);
    const newRef = await call(db, U.manager, RETURN_CARRY, [uid(), ...args.slice(1)]);
    const fr = (await admin('select status from public.flock_returns where id = $1', [args[1]]))[0].status;
    const hint = 'أُرجع هذا العلف بهذا الطلب ثمّ أُلغي الإرجاع بإعادة فتح الدورة. حدّث الشاشة لترى حاله.';
    same([/^FR-/u.test(first.doc_no), fr, [sameRef.ok ? 'ok' : sameRef.code, sameRef.hint ?? null], [newRef.ok ? 'ok' : newRef.code, newRef.hint ?? null],
      await balance() === after],
    [true, 'void', ['id_conflict', hint], ['id_conflict', hint], true],
    '6 DN1: إعادة return_hall_carry بالمرجع نفسه أو بالمعرّف نفسه بعد أن ألغت إعادة الفتح مستند FR: id_conflict «أُلغي» (لا «أُرجع FR-…»)، والرصيد كما هو');
  });

  // ── 7) DN2: بيع الكلّ بتذكرة ثمّ جولات قبل الفاتورة ───────────────────────────────────────────────────────────────
  // 100 طير يوم −6، وجولات −6 و−5 و−4 بعلف 20 كغم لكلّ منها، ووزن 1,000 غم يوم −4، وتذكرة يوم −4 بـ100 طير وصافٍ 100 كغم. ثمّ جولات −3 و−1 و−1 (النظام
  // ينتظرها: الطيور ما زالت حيّة حتى تُرحَّل الفاتورة) بعلف صفر أو بلا علف أو بلا جولات، ثمّ الفاتورة اليوم فتخرج الطيور بيوم التذكرة. وأيّام العلف المأكول
  // = أيّامه اللازمة = 3 في تقرير الدورة وflock_detail؛ و0036 (جواب المالك «عوف سالفة العلف الماكول»): المعامل من صافي العلف المرسل (300 كغم يوم −6) لا
  // من المأكول (60): 300 × 1,000 ÷ (100 × 1,000) = 3.000 في التقرير وflock_detail والتقرير اليوميّ ليوم −1 (كان 0.600 بالمأكول).
  const soldOut = async (name, afterFeed) => {
    const h = await hall(name);
    const flock = await place(h, day(-6), 100);
    await issue(flock, I.x, '300', day(-6));
    for (const d of [-6, -5, -4]) await at(day(d), () => round(flock, day(d), '20'));
    await at(day(-4), () => one(U.manager, 'select public.record_flock_weight($1, $2, $3, $4, $5)', [flock, day(-4), 50, '1000.0', uid()]));
    const ticketId = uid();
    let done;
    await at(day(-4), async () => {
      await one(U.worker, SAVE, [ticketId, null, JSON.stringify({ site_id: site, on_date: day(-4), method: 'scale', empty_kg: '7000', empty_with_crates: true,
        crate_kg: null, stops: [{ id: uid(), hall_id: h, birds: 100, crates: 10, gross_kg: '7100', weighings: [] }] })]);
      done = await one(U.worker, FINISH, [uid(), ticketId, 1]);
    });
    const expects = [];
    if (afterFeed !== undefined) {
      for (const d of [-3, -2, -1]) {
        await at(day(d), async () => {
          expects.push(hallOf(await direct.day(day(d)), h).flock.expects_round);
          await round(flock, day(d), afterFeed);
        });
      }
    }
    await one(U.accountant, SELL, [uid(), uid(), ticketId, done.version, trader, '2000.00', '0', '0', null, null]);
    const report = await direct.report(flock);
    const detail = await one(U.manager, 'select public.flock_detail($1)', [flock]);
    return { expects, report: [report.kpis.fcr, report.kpis.feed_days, report.kpis.feed_span], detail: [detail.flock.fcr, detail.flock.feed_days, detail.flock.feed_span_days],
      daily: hallOf(await direct.day(day(-1)), h).flock?.fcr ?? null };
  };
  await section('7 DN2 معامل التحويل بعد بيع الكلّ', async () => {
    const cases = { none: await soldOut('قاعة بلا جولات', undefined), empty: await soldOut('قاعة جولات بلا علف', null), zero: await soldOut('قاعة جولات بعلف صفر', '0') };
    const ok = (expects) => ({ expects, report: ['3.000', 3, 3], detail: ['3.000', 3, 3], daily: '3.000' });
    same(cases, { none: ok([]), empty: ok([true, true, true]), zero: ok([true, true, true]) },
      '7 DN2: بعد ترحيل فاتورة بيع الكلّ معامل التحويل 3.000 من صافي المرسل (0036) وأيّام العلف المأكول = أيّامه اللازمة = 3 (أيّام الحيّ) في تقرير الدورة وflock_detail والتقرير اليوميّ، '
        + 'ولو سُجّلت جولات بعلف صفر بين التذكرة والفاتورة والنظام ينتظرها (كان المعامل null بأيّام علف 6 من 3)');
  });

  // ── 8) DN3: سلال أقفال الوزنات لكلّ منشأة ──────────────────────────────────────────────────────────────────────────
  // في هذه المنشأة: جلسة تمسك الفوج (فرق عدّ لم يُثبَّت)، وحفظ ميزان أقفاص بوزنات تغطّي السلال الأربع والستّين كلّها ينتظرها بعد أخذ سلاله. وفي منشأة
  // ثانية حفظ ميزان أقفاص بوزنة: لا ينتظر الأوّل (كان ينحبس عليه حتى مهلة القفل 55P03)، ثمّ يكمل الأوّل حين يُرجَع الإمساك.
  await section('8 DN3 سلال الوزنات بين المنشآت', async () => {
    const G2 = await makeOrg(db, { name: 'مزرعة المنشأة الثانية', id: id2, phone: phone2, roles: [['owner', 'owner'], ['manager', 'manager']] });
    const site2 = await one(G2.users.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل المنشأة الثانية', 'farm') returning id", [G2.divisions.broiler]);
    const hall2 = await one(G2.users.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة المنشأة الثانية') returning id", [site2]);
    await one(G2.users.manager, OPEN, [hall2, day(-10), 1000, uid()]);
    const h = await hall('قاعة السلال');
    const flock = await place(h, day(-10), 1000);
    /** معرّف وزنة لكلّ سلّة من السلال الأربع والستّين (hashtextextended(id) & 63)، فالحفظ الأوّل يأخذها كلّها. */
    const byBucket = new Map();
    while (byBucket.size < 64) {
      const ids = Array.from({ length: 500 }, () => uid());
      for (const r of await admin('select u::text as id, (hashtextextended(u::text, 0) & 63)::int as b from unnest($1::uuid[]) as u', [ids])) {
        if (!byBucket.has(r.b)) byBucket.set(r.b, r.id);
      }
    }
    const crates = (siteId, hallId, ids) => JSON.stringify({ site_id: siteId, on_date: TODAY, method: 'crates', empty_kg: null, empty_with_crates: null, crate_kg: '6',
      stops: [{ id: uid(), hall_id: hallId, birds: 100, crates: null, gross_kg: null, weighings: ids.map((w) => ({ id: w, crates: 10, gross_kg: '300' })) }] });
    const settleOn = async (promise, pid, blocker, timeoutMs = 10000) => {
      let finished = false;
      promise.then(() => {
        finished = true;
      });
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (finished) return 'finished';
        if ((await db.admin('select $2::int = any (pg_blocking_pids($1::int)) as held', [pid, blocker])).rows[0].held) return 'blocked';
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`الجلسة ${pid} ما انتهت ولا انحبست على الجلسة ${blocker} خلال ${timeoutMs}ms`);
    };
    const holder = await db.session(U.manager);
    const a = await db.session(U.worker);
    const x = await db.session(G2.users.manager);
    try {
      const held = await holder.run(`${ADJUST} as v`, [uid(), uid(), flock, TODAY, 1, 'إمساك', 1000]);
      const pa = a.run(`${SAVE} as v`, [uid(), null, crates(site, h, [...byBucket.values()])]);
      const sa = await settleOn(pa, a.pid, holder.pid);
      const px = x.run(`${SAVE} as v`, [uid(), null, crates(site2, hall2, [uid()])]);
      const sx = await settleOn(px, x.pid, a.pid);
      // الإمساك يُرجَع ثمّ الحفظ الأوّل (فتُفلت سلاله) قبل انتظار الثاني، فلا ينتظر أحد مهلة القفل في أيّ طريق.
      await holder.rollback();
      const ra = await pa;
      await a.rollback();
      const rx = await px;
      same([held.ok, sa, sx, rx.ok ? 'ok' : rx.error, ra.ok ? 'ok' : ra.error], [true, 'blocked', 'finished', 'ok', 'ok'],
        '8 DN3: حفظ ميزان أقفاص في منشأة لا ينتظر حفظاً في منشأة أخرى أخذ سلاله الأربع والستّين وانتظر قفل فوجه (كان ينحبس عليه)، والأوّل يكمل بعد الإمساك');
    } finally {
      await holder.rollback();
      await a.rollback();
      await x.rollback();
    }
  });

  // ── 9) DN4: جرد معتمد بعد إرجاع المنقول يمنع إعادة الفتح، والبطاقة تقوله ──────────────────────────────────────────────
  // FI 300 «علف الجرد» من مخزن الحقل، والإغلاق أمس ينقل 100، ثمّ يُرجع اليوم إلى مخزن الحقل (FR)، ثمّ جرد معتمد اليوم للمادّة في المخزن برصيدها: البطاقة
  // can.reopen كاذب وreopen_why = count_superseded، وreopen_flock يرفض به (كانت تعد بها، can.reopen صادق وreopen_why null).
  await section('9 DN4 الجرد بعد الإرجاع', async () => {
    const h = await hall('قاعة الجرد');
    const flock = await place(h, day(-10), 100);
    await issue(flock, I.q, '300', day(-6), W.farm);
    const closed = await closeOk(flock, day(-1), [carry(I.q, '100')]);
    await one(U.manager, RETURN_CARRY, [uid(), uid(), closed.lines[0].line_id, W.farm]);
    const free = await card(flock);
    const qty = (await admin('select trim_scale(qty)::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [I.q, W.farm]))[0].q;
    const doc = await db.asUser(U.manager, async (q) => {
      const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.farm, TODAY])).rows[0].id;
      await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, $3)', [docId, I.q, qty]);
      return docId;
    }, { commit: true });
    const version = async () => (await admin('select version from public.stock_counts where id = $1', [doc]))[0].version;
    await one(U.manager, 'select public.submit_count($1, $2, $3)', [doc, await version(), uid()]);
    await one(U.manager, "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', $3)", [doc, await version(), uid()]);
    const counted = await card(flock);
    const reopened = await call(db, U.manager, REOPEN, [closed.id, 'أُغلقت خطأً', uid()]);
    same([[free.can.reopen, free.reopen_why], [counted.can.reopen, counted.reopen_why], reopened.ok ? 'ok' : reopened.code],
      [[true, null], [false, 'count_superseded'], 'count_superseded'],
      '9 DN4: بعد جرد معتمد لمادّة FR في مخزنه بيومه البطاقة لا تعد بإعادة الفتح وreopen_why = count_superseded كرفض reopen_flock (وقبل الجرد تعد بها)');
  });
}
