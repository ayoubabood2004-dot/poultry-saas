// بيع الطيور (0028، العقد contract-0028 §9، الجزء db-a): تذكرة القبّان وميزان الأقفاص، وفاتورة الطيور BR، وعدد الطيور (المباع وفرق العدّ)، وقرّاء المال.
// الأرقام الذهبية بالضبط بلا سماح (G1–G4، وG4b للتقريب، وG8)، والسباقات بجلستين حقيقيتين تُنتظر فيها الجلسة المسمّاة على قفل الجلسة الأخرى بعينها
// (pg_blocking_pids، لا أيّ انتظار؛ درس 2026-11-05)، والطفرات داخل معاملة صاحب الجداول ترجع (purchase-kit mutant): كلّ طفرة تكسر القاعدة فعلاً
// (التطبيق البديل المعقول) ويمسكها فحصها الذهبيّ. منشأة هذا الملف وحدها: المعرّفات b2800000 والهواتف 96477028000. كلّ قسم بـsection: رمية فيه
// فحص فاشل باسمه ولا توقف الملف. الحساب باليد بالتعليق جنب كلّ رقم.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';
const id = (n) => `b2800000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028000${String(n).padStart(2, '0')}`;

const SALE_SIG = 'public.record_bird_sale(uuid, uuid, uuid, integer, uuid, numeric, numeric, numeric, uuid, text)';
const VOID_SIG = 'public.void_bird_sale(uuid, text, uuid)';
const NETS_SIG = 'private.ticket_nets(uuid)';
const DAY_SIG = 'public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean)';

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  /** عيّنات القاعدة الحقيقية للشاشات (BIRDS_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/birds-0028.json): أجوبة الكتّاب كما رجعت، والقرّاء آخر الملف. */
  const samples = {};
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };
  const G = await makeOrg(db, {
    name: 'مزرعة الطيور',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['worker', 'hall_worker', ['broiler']],
      ['storekeeper', 'storekeeper'],
      ['siteWorker', 'hall_worker'],
    ],
  });
  const { users: U, members: M, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const admin = async (sql, params) => (await db.admin(sql, params)).rows;

  // ── الحقلان والقاعات والأفواج ─────────────────────────────────────────────────────────────────────────────
  const siteA = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الطيور', 'farm') returning id", [D.broiler]);
  const siteB = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الشمال', 'farm') returning id", [D.broiler]);
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', array[$2]::uuid[], '{}')::text", [M.siteWorker, siteA]);
  const hall = async (site, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [site, name]);
  const place = async (hallId, count, days) => one(U.manager, "select public.open_flock($1, $2::date - $3::int, $4, 0, null, gen_random_uuid()) ->> 'flock_id'", [hallId, TODAY, days, count]);
  const h1 = await hall(siteA, 'قاعة 1');
  const h2 = await hall(siteA, 'قاعة 2');
  const h3 = await hall(siteA, 'قاعة 3');
  const h4 = await hall(siteA, 'قاعة 4');
  const h5 = await hall(siteA, 'قاعة 5');
  const h6 = await hall(siteA, 'قاعة 6');
  const hB = await hall(siteB, 'قاعة الشمال');
  const F1 = await place(h1, 10000, 30);
  const F2 = await place(h2, 5000, 30);
  const F3 = await place(h3, 100, 20);
  const F4 = await place(h4, 100, 20);
  const F5 = await place(h5, 100, 20);
  const F6 = await place(h6, 1000, 20);
  await place(hB, 1000, 20);
  const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر الطيور', true) returning id");
  const box = await one(U.owner, "insert into public.cash_accounts (name, kind) values ('صندوق البيع', 'cash') returning id");

  // ── الأدوات ────────────────────────────────────────────────────────────────────────────────────────────
  const scale = (site, on, empty, withCrates, crate, stops) => ({ site_id: site, on_date: on, method: 'scale', empty_kg: empty, empty_with_crates: withCrates,
    crate_kg: crate, stops: stops.map(([stopId, hallId, birds, crates, gross]) => ({ id: stopId, hall_id: hallId, birds, crates, gross_kg: gross, weighings: [] })) });
  const save = (user, ticket, version, data) => call(db, user, 'select public.save_weigh_ticket($1, $2, $3::jsonb)', [ticket, version, JSON.stringify(data)]);
  const finish = (user, ticket, version) => call(db, user, 'select public.finish_weigh_ticket($1, $2, $3)', [uid(), ticket, version]);
  const SELL = 'select public.record_bird_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)';
  const sellArgs = ({ ref = uid(), sale, ticket, version, party = trader, price, pct = '0', paid = '0', account = null }) => [ref, sale, ticket, version, party, price, pct, paid, account, null];
  const sell = (user, args) => call(db, user, SELL, sellArgs(args));
  const ADJUST = 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7)';
  const adjust = (user, flock, on, birds, expectedLive, reason = 'العدد الفعليّ أكثر') => call(db, user, ADJUST, [uid(), uid(), flock, on, birds, reason, expectedLive]);
  const live = async (flock) => (await one(U.manager, 'select public.flock_sales($1)', [flock])).live;
  /** معاملة طفرة: كلّ دالّة بطفراتها، ثمّ run({ attempt }) داخل المعاملة نفسها (ترجع كلّها). */
  const broken = (fns, run) => mutant(db, U.manager, fns, run);
  /** النداء داخل معاملة الطفرة بهويّة مستخدم: القيمة أو { code, hint }. */
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(`${sql} as v`, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  /**
   * ينتظر حتّى تنتهي الجلسة pid أو تُحبس على قفل تمسكه الجلسة blocker تحديداً (pg_blocking_pids)، لا أيّ انتظار (درس 2026-11-05: انتظار قديم على قفل
   * آخر يُقرأ قبل أن يستيقظ فيثبت الأوّل قبل أن يبلغ الثاني نقطة السباق).
   */
  const settleOn = async (promise, pid, blocker, timeoutMs = 10000) => {
    let done = false;
    promise.then(() => {
      done = true;
    });
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (done) return 'finished';
      if ((await db.admin('select $2::int = any (pg_blocking_pids($1::int)) as held', [pid, blocker])).rows[0].held) return 'blocked';
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`الجلسة ${pid} ما انتهت ولا انحبست على الجلسة ${blocker} خلال ${timeoutMs}ms`);
  };

  // ── G1 (F:664): قبّان، فارغ 7,000 بلا أقفاص، قفص 6، قاعة واحدة 4,000 طير في 400 قفص بخابط 18,500 ───────────────────────────────
  // الصافي = 18,500 − 7,000 − 400 × 6 = 9,100.000، والمعدّل 9,100 ÷ 4,000 = 2.275؛ والتنزيل 0.50٪: 9,100 × 99.5 ÷ 100 = 9,054.500؛ وبسعر 2,750.00:
  // 9,054.5 × 2,750 = 24,899,875 دينار، مقبوضة كلّها في الصندوق: حساب التاجر صفر والنقد +24,899,875؛ والحيّ 10,000 ← 6,000 بيوم التذكرة (أمس).
  const T1 = id(101);
  const S1 = id(102);
  await section('G1', async () => {
    const saved = await save(U.worker, T1, null, scale(siteA, YESTERDAY, '7000', false, '6', [[id(103), h1, 4000, 400, '18500']]));
    t.same([saved.ok, saved.value?.status, saved.value?.ticket?.version, saved.value?.ticket?.stops?.[0]?.net_kg], [true, 'saved', 1, '9100.000'],
      'G1: عامل القاعة يحفظ المسوّدة (النسخة 1) وصافيها 9,100.000');
    const again = await save(U.worker, T1, 1, scale(siteA, YESTERDAY, '7000', false, '6', [[id(103), h1, 4000, 400, '18500']]));
    const stale = await save(U.worker, T1, 0, scale(siteA, YESTERDAY, '7000', false, '6', [[id(103), h1, 4000, 400, '18600']]));
    const version = (await admin('select version from public.weigh_tickets where id = $1', [T1]))[0].version;
    t.same([again.value?.status, stale.value?.status, stale.value?.server?.version, version], ['saved', 'stale', 1, 1],
      'G1: المحتوى نفسه «حُفظ» بلا كتابة، ونسخة غير التي في الخادم stale بالتذكرة كما هي، ولا كتابة');
    const done = await finish(U.worker, T1, 1);
    Object.assign(samples, { save_weigh_ticket: saved.value, save_weigh_ticket_stale: stale.value, finish_weigh_ticket: done.value });
    const ticket = done.value;
    t.same(
      [done.ok, ticket?.status, ticket?.ticket_no, ticket?.version, ticket?.birds, ticket?.crates, ticket?.net_kg, ticket?.avg_kg, ticket?.stops?.[0]?.prev_gross_kg,
        ticket?.stops?.[0]?.crates_kg, ticket?.stops?.[0]?.net_kg, ticket?.stops?.[0]?.avg_kg],
      [true, 'done', 'WT-2026-0001', 2, 4000, 400, '9100.000', '2.275', '7000.000', '2400.000', '9100.000', '2.275'],
      'G1: التذكرة مكتملة WT-2026-0001: الصافي 18,500 − 7,000 − 2,400 = 9,100.000 والمعدّل 2.275',
    );
    t.eq(await live(F1), 10000, 'G1: إكمال التذكرة لا ينقص الحيّ (O1)');
    const sale = await sell(U.accountant, { sale: S1, ticket: T1, version: 2, price: '2750.00', pct: '0.50', paid: '24899875', account: box });
    samples.record_bird_sale_paid = sale.value;
    const v = sale.value;
    t.same(
      [sale.ok, v?.doc_no, v?.sold_on, v?.birds, v?.net_kg, v?.billed_kg, v?.deduction_pct, v?.money?.unit_price, v?.money?.total, v?.money?.paid_now,
        v?.sources?.length, v?.sources?.[0]?.money?.revenue, v?.account_name],
      [true, 'BR-2026-0001', YESTERDAY, 4000, '9100.000', '9054.500', '0.50', '2750.00', '24899875', '24899875', 1, '24899875', 'صندوق البيع'],
      'G1: الفاتورة BR-2026-0001 بيوم التذكرة: الوزن المحسوب 9,054.500 والمبلغ 24,899,875 مقبوض كلّه',
    );
    const balance = (await admin('select coalesce(sum(amount), 0)::text as v from public.party_entries where party_id = $1', [trader]))[0].v;
    const cash = (await admin('select coalesce(sum(amount), 0)::text as v from public.cash_moves where account_id = $1', [box]))[0].v;
    const counts = await admin("select on_date::text as on, kind, birds, net_kg::text as kg from public.flock_counts where flock_id = $1", [F1]);
    t.same([balance, cash, counts, await live(F1)], ['0', '24899875', [{ on: YESTERDAY, kind: 'sold', birds: -4000, kg: '9100.000' }], 6000],
      'G1: حساب التاجر صفر، والنقد +24,899,875، وصفّ «مباع» −4,000 بيوم التذكرة (أمس)، والحيّ 6,000');

    // قرّاء المال: تفصيل القيد في الكشف، وصنف حركة الصندوق «بيع نقديّ»، وقسم الطيور في المبيعات وفي خلاصة المال.
    const statement = await one(U.accountant, 'select public.party_statement_v2($1, null, $2, $3)', [trader, '2026-11-01', TODAY]);
    const lines = statement.books.flatMap((b) => b.lines);
    const moves = await one(U.accountant, 'select public.money_moves($1, $2, $3, null, null, null, 50)', [YESTERDAY, TODAY, box]);
    const overview = await one(U.accountant, 'select public.sales_overview($1, $2)', ['2026-11-01', TODAY]);
    const money = await one(U.accountant, 'select public.money_overview()');
    t.same(
      [lines.map((l) => [l.detail?.type, l.debit, l.credit]), lines[0]?.detail?.total, lines[0]?.detail?.billed_kg, lines[0]?.detail?.ticket_no,
        moves.rows.map((r) => [r.class, r.doc_kind, r.inflow]), overview.birds.totals.count, overview.birds.totals.money.revenue, overview.birds.rows[0]?.paid,
        money.month.sales.birds],
      [[['bird_sale', '24899875', '0'], ['bird_sale_payment', '0', '24899875']], '24899875', '9054.500', 'WT-2026-0001', [['cash_sale', 'bird_sale', '24899875']], 1,
        '24899875', 'cash', { count: 1, revenue: '24899875' }],
      'قرّاء المال: القيد «bird_sale» والمقبوض «bird_sale_payment» في الكشف، وحركة الصندوق بيع نقديّ، وقسم birds في المبيعات وخلاصة الشهر',
    );
  });

  // M8 (save_flock_day يتجاهل العدد): بعد الفاتورة الحيّ 6,000، فنافق 7,000 اليوم يُرفض بحارس الجولة نفسه (الحيّ 6,000)، لا بفحص الأيّام بعده.
  await section('حارس الجولة بالعدد (M8)', async () => {
    const DAY = 'select public.save_flock_day($1, $2, 7000, 0, null, null, null, null, null, null, null, null, null, $3, false)';
    const real = await call(db, U.worker, DAY, [F1, TODAY, uid()]);
    const GUARD = 'النافق والمستبعد (7,000) أكثر من الطيور الحيّة (6,000). راجع الأرقام.';
    t.same([real.code, real.hint], ['live_negative', GUARD], 'الجولة: الحيّ بالمباع (6,000)، فنافق 7,000 يُرفض بحارسها');
    const mutated = await broken([[DAY_SIG, [['v_live := f.placed_count - v_others + private.flock_counts_total(f.id);', 'v_live := f.placed_count - v_others;']]]],
      ({ attempt }) => inside(attempt, U.worker, DAY, [F1, TODAY, uid()]));
    t.same([mutated?.code, mutated?.hint], ['live_negative', 'بهذا يصير عدد الطيور الحيّة في «قاعة 1» سالباً يوم 12/11/2026 (-1,000). راجع النافق والمستبعد والمباع وفرق العدّ لذلك اليوم وما قبله.'],
      'طفرة M8 (الحارس بلا العدد): الجولة تعبر حارسها ويرفضها فحص الأيّام بعده، فيمسكها فحص الحارس');
  });

  // ── G2 (D:227): الفارغ وُزن مع الأقفاص، فلا تُطرح: فارغ 8,000، خابط 11,000 ثمّ 14,500 ← 3,000 و3,500 (المجموع 6,500) ────────────────────
  const G2 = (ids) => scale(siteA, YESTERDAY, '8000', true, '6', [[ids[0], h1, 1200, 120, '11000'], [ids[1], h2, 1400, 140, '14500']]);
  const nets = (value) => [value?.ticket?.stops?.map((s) => s.net_kg), value?.ticket?.net_kg];
  await section('G2', async () => {
    const T2 = id(201);
    const saved = await save(U.worker, T2, null, G2([id(202), id(203)]));
    t.same(nets(saved.value), [['3000.000', '3500.000'], '6500.000'], 'G2: مع الأقفاص في الفارغ: 3,000 و3,500 (مجموعها 6,500)');
    const voided = await call(db, U.worker, 'select public.void_weigh_ticket($1, null, $2)', [T2, uid()]);
    t.same([voided.ok, voided.value?.status], [true, 'void'], 'G2: مسوّدة يلغيها عامل القاعة بلا سبب');
    const mutated = await broken([[NETS_SIG, [["when s.method = 'scale' and s.empty_with_crates then 0", 'when false then 0']]]],
      ({ attempt }) => inside(attempt, U.worker, 'select public.save_weigh_ticket($1, null, $2::jsonb)', [uid(), JSON.stringify(G2([uid(), uid()]))]));
    // 3,000 − 120 × 6 = 2,280 و3,500 − 140 × 6 = 2,660.
    t.same(nets(mutated), [['2280.000', '2660.000'], '4940.000'], 'طفرة M2 (الأقفاص تُطرح والفارغ وُزن معها): 2,280 و2,660، فيمسكها G2');
  });

  // ── G3 وG4: الفارغ بلا أقفاص: فارغ 7,000، 200 قفص لكلّ قاعة، قفص 6، خابط 10,000 ثمّ 13,500 ← 1,800 و2,300 (4,100 = 13,500 − 7,000 − 2,400) ─────
  // G4: التنزيل 0.50٪: 4,100 × 99.5 ÷ 100 = 4,079.500؛ وبسعر 2,749.00: 4,079.5 × 2,749 = 11,214,545.5 ← 11,214,546 (نصف بعيداً عن الصفر)؛ والإيراد بصافي
  // القاعات بأكبر الباقي: 11,214,546 × 1,800 ÷ 4,100 = 4,923,459.07 و× 2,300 ÷ 4,100 = 6,291,086.92 ← الدينار الباقي للثاني: 4,923,459 و6,291,087.
  const G3 = (ids) => scale(siteA, YESTERDAY, '7000', false, '6', [[ids[0], h1, 800, 200, '10000'], [ids[1], h2, 1000, 200, '13500']]);
  const T4 = id(301);
  const golden4 = (v) => [v?.billed_kg, v?.money?.total, v?.sources?.map((s) => s.money.revenue)];
  const G4_EXPECTED = ['4079.500', '11214546', ['4923459', '6291087']];
  await section('G3', async () => {
    const saved = await save(U.worker, T4, null, G3([id(302), id(303)]));
    t.same(nets(saved.value), [['1800.000', '2300.000'], '4100.000'], 'G3: بلا أقفاص في الفارغ: 1,800 و2,300 (4,100 = 13,500 − 7,000 − 2,400)');
    const mutated = await broken([[NETS_SIG, [['lag(st.gross_kg, 1, t.empty_kg) over (order by st.stop_no)', 't.empty_kg']]]],
      ({ attempt }) => inside(attempt, U.worker, 'select public.save_weigh_ticket($1, null, $2::jsonb)', [uid(), JSON.stringify(G3([uid(), uid()]))]));
    // 10,000 − 7,000 − 1,200 = 1,800 و13,500 − 7,000 − 1,200 = 5,300.
    t.same(nets(mutated), [['1800.000', '5300.000'], '7100.000'], 'طفرة M1 (صافي كلّ قاعة من الفارغ): 1,800 و5,300، فيمسكها G3');
    const done = await finish(U.manager, T4, 1);
    t.same([done.ok, done.value?.ticket_no], [true, 'WT-2026-0002'], 'G3: التذكرة مكتملة WT-2026-0002');
  });
  await section('G4', async () => {
    const args = (ref) => sellArgs({ ref, sale: uid(), ticket: T4, version: 2, price: '2749.00', pct: '0.50' });
    // M5: 11,214,545 مقطوعاً، وبأكبر الباقي 4,923,458.66 و6,291,086.34 ← 4,923,459 و6,291,086. M6: بالطيور 800 و1,000: 4,984,242.67 و6,230,303.33
    // ← 4,984,243 و6,230,303.
    const muts = [
      ['M5 المبلغ مقطوعاً', [[SALE_SIG, [['v_total := private._mul_div_round(v_billed, p_unit_price, 1, 0);', 'v_total := trunc(v_billed * p_unit_price);']]]],
        ['4079.500', '11214545', ['4923459', '6291086']]],
      ['M6 الإيراد بعدد الطيور', [[SALE_SIG, [['array(select s.net_kg from public.weigh_ticket_stops s', 'array(select s.birds::numeric from public.weigh_ticket_stops s']]]],
        ['4079.500', '11214546', ['4984243', '6230303']]],
    ];
    for (const [name, fns, wrong] of muts) {
      const v = await broken(fns, ({ attempt }) => inside(attempt, U.accountant, SELL, args(uid())));
      t.same(golden4(v), wrong, `طفرة ${name}: ${JSON.stringify(wrong)}، فيمسكها G4`);
    }
    // M7: صفّ «مباع» بيوم الترحيل (اليوم) بدل يوم التذكرة (أمس).
    const dated = await broken([[SALE_SIG, [["values (v_org, f.id, f.hall_id, f.site_id, f.division_id, t.on_date, 'sold'", "values (v_org, f.id, f.hall_id, f.site_id, f.division_id, public.app_today(), 'sold'"]]]],
      async ({ attempt, oq }) => {
        const v = await inside(attempt, U.accountant, SELL, args(uid()));
        return { v, days: (await oq("select distinct on_date::text as d from public.flock_counts where doc_id = $1", [v?.id])).rows.map((r) => r.d) };
      });
    t.same(dated.days, [TODAY], 'طفرة M7 (صفّ «مباع» بيوم الترحيل): اليوم بدل أمس، فيمسكها G4');
    const sale = await call(db, U.accountant, SELL, args(uid()));
    t.same([sale.ok, ...golden4(sale.value)], [true, ...G4_EXPECTED], 'G4: 4,079.500 كغم، والمبلغ 11,214,546، والإيراد 4,923,459 و6,291,087');
    const days = await admin("select distinct on_date::text as d from public.flock_counts where doc_id = $1", [sale.value?.id]);
    t.same([days.map((r) => r.d), await live(F1), await live(F2)], [[YESTERDAY], 5200, 4000], 'G4: صفّا «مباع» بيوم التذكرة، والحيّ 6,000 − 800 = 5,200 و5,000 − 1,000 = 4,000');
  });

  // ── G4b (تقريب الوزن المحسوب بثلاث مراتب): فارغ 7,000 مع الأقفاص، خابط 11,100.250 ← صافي 4,100.250 و1,800 طير؛ التنزيل 0.50٪:
  // 4,100.25 × 0.995 = 4,079.74875 ← 4,079.749 (لا 4,079.75 بمرتبتين، ولا 4,079.748 مقطوعاً)؛ وبسعر 2,749.00: 4,079.749 × 2,749 = 11,215,230.001 ← 11,215,230.
  await section('G4b', async () => {
    const T = id(401);
    await save(U.worker, T, null, scale(siteA, YESTERDAY, '7000', true, '6', [[id(402), h2, 1800, 180, '11100.250']]));
    const done = await finish(U.worker, T, 1);
    t.same([done.ok, done.value?.net_kg], [true, '4100.250'], 'G4b: الصافي 4,100.250');
    const args = () => sellArgs({ sale: uid(), ticket: T, version: 2, price: '2749.00', pct: '0.50' });
    const pick = (v) => [v?.billed_kg, v?.money?.total];
    // M3: 4,079.748 × 2,749 = 11,215,227.252 ← 11,215,227. M4: 4,079.75 × 2,749 = 11,215,232.75 ← 11,215,233.
    for (const [name, to, wrong] of [
      ['M3 الوزن المحسوب مقطوعاً', 'v_billed := trunc(t.net_kg * (100 - v_pct) * 0.01, 3);', ['4079.748', '11215227']],
      ['M4 الوزن المحسوب بمرتبتين', 'v_billed := round(t.net_kg * (100 - v_pct) * 0.01, 2);', ['4079.75', '11215233']],
    ]) {
      const v = await broken([[SALE_SIG, [['v_billed := private._mul_div_round(t.net_kg, 100 - v_pct, 100, 3);', to]]]], ({ attempt }) => inside(attempt, U.accountant, SELL, args()));
      t.same(pick(v), wrong, `طفرة ${name}: ${JSON.stringify(wrong)}، فيمسكها G4b`);
    }
    const sale = await call(db, U.accountant, SELL, args());
    t.same([sale.ok, ...pick(sale.value)], [true, '4079.749', '11215230'], 'G4b: الوزن المحسوب 4,079.749 والمبلغ 11,215,230');
  });

  // ── G8: فرق العدّ الموجب بتاريخ بعد الفاتورة التي يتيحها ← live_negative يسمّي يومها؛ وبيوم الفاتورة ← تُرحَّل ───────────────────────
  // «قاعة 3» بمئة طير، وتذكرة أمس بـ105 طيور (252 كغم): الفاتورة birds_over_live؛ ثمّ +5 اليوم: الحيّ الآن 105 لكنّ أمس 100 − 105 = −5 ← live_negative
  // يسمّي 11/11/2026؛ ثمّ +5 أمس: أمس 105 − 105 = 0 ← تُرحَّل، والحيّ بعدها 110 − 105 = 5.
  await section('G8', async () => {
    const T = id(801);
    await save(U.worker, T, null, scale(siteA, YESTERDAY, '7000', false, '6', [[id(802), h3, 105, 10, '7312']]));
    const done = await finish(U.worker, T, 1);
    samples.finish_weigh_ticket_warned = done.value;
    t.same([done.ok, done.value?.net_kg, done.value?.warnings?.map((w) => [w.hall_name, w.birds, w.live])], [true, '252.000', [['قاعة 3', 105, 100]]],
      'G8: التذكرة مكتملة بـ105 طيور (252 كغم)، وتحذيرها: في «قاعة 3» 100 حيّاً (الإكمال لا ينقص الحيّ، والفاتورة تفحصه)');
    const args = () => sellArgs({ sale: uid(), ticket: T, version: 2, price: '2750.00' });
    const over = await call(db, U.accountant, SELL, args());
    t.same([over.code, over.hint], ['birds_over_live', 'في «قاعة 3» بحسب النظام 100 طيراً حيّاً، وفي التذكرة 105. إن كان العدد الفعليّ أكبر فليسجّل المدير «فرق العدّ» بتاريخ 11/11/2026 أو قبله، ثمّ أصدر الفاتورة.'],
      'G8: الفاتورة بأكثر من الحيّ birds_over_live وتدلّ على «فرق العدّ» بيوم التذكرة');
    // M9: بلا فحص الأيّام في الفاتورة تُرحَّل فاتورة يصير بها الحيّ أمس −5.
    const mutated = await broken([[SALE_SIG, [['    perform private.flock_live_check(f);\n  end loop;', '    null;\n  end loop;']]]], async ({ attempt }) => {
      await inside(attempt, U.manager, ADJUST, [uid(), uid(), F3, TODAY, 5, 'العدد الفعليّ أكثر', 100]);
      return inside(attempt, U.accountant, SELL, args());
    });
    t.same([mutated?.code, mutated?.status], [undefined, 'posted'], 'طفرة M9 (بلا فحص الأيّام): الفاتورة تُرحَّل والحيّ أمس −5، فيمسكها G8');
    const later = await adjust(U.manager, F3, TODAY, 5, 100);
    Object.assign(samples, { record_flock_count_adjust: later.value, refusal_birds_over_live: { code: over.code, hint: over.hint } });
    t.same([later.ok, later.value?.birds, later.value?.live_after], [true, 5, 105], 'G8: فرق العدّ +5 اليوم (الحيّ 105)');
    const negative = await call(db, U.accountant, SELL, args());
    t.same([negative.code, negative.hint], ['live_negative', 'بهذا يصير عدد الطيور الحيّة في «قاعة 3» سالباً يوم 11/11/2026 (-5). راجع النافق والمستبعد والمباع وفرق العدّ لذلك اليوم وما قبله.'],
      'G8: فرق العدّ بعد يوم الفاتورة لا يتيحها: live_negative يسمّي يوم التذكرة');
    const before = await adjust(U.manager, F3, YESTERDAY, 5, 105);
    const posted = await call(db, U.accountant, SELL, args());
    t.same([before.ok, posted.ok, posted.value?.status, await live(F3)], [true, true, 'posted', 5], 'G8: فرق العدّ بيوم الفاتورة يتيحها، والحيّ بعدها 5');
    const stale = await adjust(U.manager, F3, TODAY, -1, 4);
    t.same(stale.code, 'live_changed', 'فرق العدّ بشرط الحيّ الذي رأته الشاشة: live_changed');
  });

  // ── الأدوار والنطاق (F:865) ──────────────────────────────────────────────────────────────────────────────
  await section('الأدوار والنطاق', async () => {
    const T = id(901);
    await save(U.worker, T, null, scale(siteA, TODAY, '7000', false, '6', [[id(902), h6, 100, 10, '7300']]));
    const done = await finish(U.worker, T, 1);
    const otherSite = await save(U.siteWorker, uid(), null, scale(siteB, TODAY, '7000', false, '6', [[uid(), hB, 100, 10, '7300']]));
    const ownSite = await save(U.siteWorker, uid(), null, scale(siteA, TODAY, '7000', false, '6', [[uid(), h6, 50, 5, '7150']]));
    const keeper = await sell(U.storekeeper, { sale: uid(), ticket: T, version: 2, price: '2750.00' });
    const worker = await sell(U.worker, { sale: uid(), ticket: T, version: 2, price: '2750.00' });
    const posted = await sell(U.accountant, { sale: id(903), ticket: T, version: 2, price: '2750.00' });
    const accountantVoid = await call(db, U.accountant, 'select public.void_bird_sale($1, $2, $3)', [id(903), 'وزن خاطئ', uid()]);
    const ticketVoid = await call(db, U.manager, 'select public.void_weigh_ticket($1, $2, $3)', [T, 'وزن خاطئ', uid()]);
    const keeperRead = await call(db, U.storekeeper, 'select public.weigh_ticket($1)', [T]);
    const workerSale = await call(db, U.worker, 'select public.bird_sale_detail($1)', [id(903)]);
    t.same(
      [done.ok, otherSite.code, ownSite.ok, keeper.code, worker.code, posted.ok, accountantVoid.code, ticketVoid.code, keeperRead.code, workerSale.code],
      [true, 'out_of_scope', true, 'forbidden', 'forbidden', true, 'forbidden', 'ticket_invoiced', 'out_of_scope', 'forbidden'],
      'F:865: عامل حقل أ لا يكتب تذكرة في ب ويكتب في حقله، والأمين وعامل القاعة لا يصدران فاتورة، والمحاسب يصدرها ولا يلغيها، والتذكرة المفوترة لا تُلغى، والأمين بلا الحقل لا يقرأ التذكرة، وعامل القاعة لا يقرأ الفاتورة',
    );
  });

  // ── إلغاء الفاتورة: القيد يُعكس، والمقبوض يبقى رصيداً للتاجر، والعدد يُعكس بيوم الإلغاء والأصل يختفي من الأيّام (D4) ─────────────────────
  await section('إلغاء الفاتورة', async () => {
    const VOID = 'select public.void_bird_sale($1, $2, $3)';
    const mutated = await broken([[VOID_SIG, [['values (c.org_id, c.flock_id, c.hall_id, c.site_id, c.division_id, v_today, c.kind,', 'values (c.org_id, c.flock_id, c.hall_id, c.site_id, c.division_id, c.on_date, c.kind,']]]],
      async ({ attempt, oq }) => {
        await inside(attempt, U.manager, VOID, [S1, 'وزن خاطئ', uid()]);
        return (await oq('select on_date::text as d from public.flock_counts where doc_id = $1 and reverses_id is not null', [S1])).rows.map((r) => r.d);
      });
    t.same(mutated, [YESTERDAY], 'طفرة M10 (العكس بيوم الأصل): أمس بدل يوم الإلغاء، فيمسكها الفحص');
    const voided = await call(db, U.manager, VOID, [S1, 'وزن خاطئ', uid()]);
    samples.void_bird_sale = voided.value;
    const balance = (await admin("select coalesce(sum(amount), 0)::text as v from public.party_entries where doc_kind = 'bird_sale' and doc_id = $1", [S1]))[0].v;
    const reversal = await admin('select on_date::text as d, birds, net_kg::text as kg from public.flock_counts where doc_id = $1 and reverses_id is not null', [S1]);
    const days = await admin('select on_date::text as d, sold from private.flock_count_days($1)', [F1]);
    const again = await call(db, U.manager, VOID, [S1, 'وزن خاطئ', uid()]);
    t.same(
      [voided.ok, voided.value?.status, voided.value?.money?.payment_kept, balance, reversal, days, await live(F1), again.code],
      [true, 'void', '24899875', '-24899875', [{ d: TODAY, birds: 4000, kg: '-9100.000' }], [{ d: YESTERDAY, sold: 800 }], 9200, 'already_void'],
      'الإلغاء: المقبوض 24,899,875 يبقى للتاجر (−24,899,875)، والعكس +4,000 بيوم الإلغاء، ومباع أمس 800 وحدها، والحيّ 9,200، والثاني already_void',
    );
  });

  // ── ضوابط الثوابت: كلّ خرق مثبَّت بمعاملة ترجع يبين في فحصه وحده (verify_bird_sales، وbird_sale_detail_total في verify_money، وlive_negative_day في
  // verify_flocks). الفواتير بأرقامها: G1 BR-0001 (ملغاة)، وG4 BR-0002، وG4b BR-0003، وG8 BR-0004؛ وتذكرة مكتملة بلا فاتورة لخرق شكلها.
  await section('ضوابط الثوابت', async () => {
    const T = id(951);
    await save(U.worker, T, null, scale(siteA, TODAY, '7000', false, '6', [[id(952), h6, 100, 10, '7300']]));
    await finish(U.worker, T, 1);
    const probe = (fn, statements) => db.asOwner(async (q) => {
      for (const sql of statements) await q(sql);
      return Object.fromEntries((await q(`select check_name, violations::int as n from public.${fn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));
    });
    const sale = (no) => `(select id from public.bird_sales where doc_no = 'BR-2026-${no}')`;
    t.same(
      {
        ticket_shape: await probe('verify_bird_sales', [`update public.weigh_ticket_stops set net_kg = net_kg + 1 where ticket_id = '${T}'`]),
        ticket_numbers: await probe('verify_bird_sales', ["update public.weigh_tickets set ticket_no = 'WT-2026-0099' where ticket_no = 'WT-2026-0001'"]),
        sale_sources: await probe('verify_bird_sales', [`update public.bird_sale_sources set revenue = revenue + 1 where sale_id = ${sale('0002')} and net_kg = 1800`]),
        sale_counts: await probe('verify_bird_sales', ['alter table public.flock_counts disable trigger flock_counts_append_only',
          `update public.flock_counts set birds = birds - 1 where doc_id = ${sale('0003')}`]),
        // الرقم في الفاتورة وفي قيدها معاً (رقم الفاتورة وحده يخالف قيده أيضاً: sale_entries).
        sale_numbers: await probe('verify_bird_sales', ['alter table public.party_entries disable trigger user',
          "update public.party_entries set doc_no = 'BR-2026-0099' where doc_kind = 'bird_sale' and doc_no = 'BR-2026-0004'",
          "update public.bird_sales set doc_no = 'BR-2026-0099' where doc_no = 'BR-2026-0004'"]),
        bird_sale_detail_total: await probe('verify_money', [`update public.bird_sales set total = total + 1 where id = ${sale('0002')}`]),
        live_negative_day: await probe('verify_flocks', ['alter table public.flock_counts disable trigger flock_counts_append_only',
          `update public.flock_counts set on_date = '${TODAY}' where flock_id = '${F3}' and kind = 'count_adjust' and on_date = '${YESTERDAY}'`]),
      },
      {
        ticket_shape: { ticket_shape: 1 }, ticket_numbers: { ticket_numbers: 1 }, sale_sources: { sale_sources: 1 }, sale_counts: { sale_counts: 1 },
        sale_numbers: { sale_numbers: 1 }, bird_sale_detail_total: { bird_sale_detail_total: 1 }, live_negative_day: { live_negative_day: 1 },
      },
      'ضوابط: صافي وقفة لا يطابق أوزانها، وفجوة في أرقام WT وفي أرقام BR، وإيراد فوج لا يطابق أكبر الباقي، وصفّ «مباع» لا يطابق وقفته، ومبلغ فاتورة لا يطابق قيدها، وفرق عدّ نُقل بعد يوم البيع الذي يتيحه (الحيّ أمس −5 والمجموع سليم): كلّ واحد في فحصه وحده',
    );
  });

  // ── R8: حفظان لنسخة واحدة من التذكرة بجلستين: الثاني ينتظر قفل التذكرة ثمّ stale بما حفظه الأوّل ─────────────────────────────────
  await section('R8', async () => {
    const T = id(1001);
    await save(U.worker, T, null, scale(siteA, TODAY, '7000', false, '6', [[id(1002), h6, 100, 10, '7300']]));
    const a = await db.session(U.worker);
    const b = await db.session(U.manager);
    try {
      const first = await a.run('select public.save_weigh_ticket($1, 1, $2::jsonb) as v', [T, JSON.stringify(scale(siteA, TODAY, '7000', false, '6', [[id(1002), h6, 100, 10, '7310']]))]);
      const pending = b.run('select public.save_weigh_ticket($1, 1, $2::jsonb) as v', [T, JSON.stringify(scale(siteA, TODAY, '7000', false, '6', [[id(1002), h6, 100, 10, '7320']]))]);
      const state = await settleOn(pending, b.pid, a.pid);
      await a.commit();
      const second = await pending;
      await b.commit();
      t.same([state, first.rows?.[0]?.v?.status, second.rows?.[0]?.v?.status, second.rows?.[0]?.v?.server?.version, second.rows?.[0]?.v?.server?.stops?.[0]?.gross_kg],
        ['blocked', 'saved', 'stale', 2, '7310.000'], 'R8: الحفظ الثاني لنسخة واحدة ينتظر الأوّل ثمّ stale بالتذكرة كما حفظها (الخابط 7,310)');
    } finally {
      await a.rollback();
      await b.rollback();
    }
  });

  // ── R7: فاتورتان لتذكرة واحدة بجلستين: الثانية تنتظر ثمّ ticket_invoiced ─────────────────────────────────────────────────────
  await section('R7', async () => {
    const T = id(1101);
    await save(U.worker, T, null, scale(siteA, TODAY, '7000', false, '6', [[id(1102), h6, 100, 10, '7300']]));
    await finish(U.worker, T, 1);
    const a = await db.session(U.accountant);
    const b = await db.session(U.manager);
    try {
      const first = await a.run(`${SELL} as v`, sellArgs({ sale: id(1103), ticket: T, version: 2, price: '2750.00' }));
      const pending = b.run(`${SELL} as v`, sellArgs({ sale: id(1104), ticket: T, version: 2, price: '2750.00' }));
      const state = await settleOn(pending, b.pid, a.pid);
      await a.commit();
      const second = await pending;
      await b.rollback();
      const sales = (await admin("select count(*)::int as n from public.bird_sales where ticket_id = $1 and status = 'posted'", [T]))[0].n;
      t.same([state, first.ok, second.ok, second.error, sales], ['blocked', true, false, 'ticket_invoiced', 1], 'R7: فاتورتان لتذكرة واحدة: الثانية تنتظر ثمّ ticket_invoiced، وفاتورة واحدة');
    } finally {
      await a.rollback();
      await b.rollback();
    }
  });

  // ── R9: المرجع نفسه بجلستين (نافذتان): الثانية تنتظر ثمّ ترجع النتيجة نفسها، وفاتورة واحدة ──────────────────────────────────────
  await section('R9', async () => {
    const T = id(1201);
    await save(U.worker, T, null, scale(siteA, TODAY, '7000', false, '6', [[id(1202), h6, 100, 10, '7300']]));
    await finish(U.worker, T, 1);
    const ref = id(1203);
    const a = await db.session(U.accountant);
    const b = await db.session(U.accountant);
    try {
      const args = sellArgs({ ref, sale: id(1204), ticket: T, version: 2, price: '2750.00' });
      const first = await a.run(`${SELL} as v`, args);
      const pending = b.run(`${SELL} as v`, args);
      const state = await settleOn(pending, b.pid, a.pid);
      await a.commit();
      const second = await pending;
      await b.commit();
      const sales = (await admin('select count(*)::int as n from public.bird_sales where ticket_id = $1', [T]))[0].n;
      // «قاعة 6»: 1,000 − 100 (فاتورة الأدوار) − 100 (R7) − 100 (R9) = 700.
      t.same([state, first.ok, second.ok, second.rows?.[0]?.v?.id, second.rows?.[0]?.v?.doc_no === first.rows?.[0]?.v?.doc_no, sales, await live(F6)],
        ['blocked', true, true, id(1204), true, 1, 700], 'R9: المرجع نفسه بنافذتين: الثانية تنتظر ثمّ تأخذ النتيجة نفسها، وفاتورة واحدة، والحيّ 700');
    } finally {
      await a.rollback();
      await b.rollback();
    }
  });

  // ── R1 (F:882): جولة من الطابور بنافق 60 وفاتورة بـ60 طيراً على حيّ 100: واحدة تُرفض والحيّ لا يصير سالباً، بالترتيبين ─────────────────────
  const r1 = async (name, flock, hallId, roundFirst) => {
    const T = uid();
    await save(U.worker, T, null, scale(siteA, TODAY, '7000', false, '6', [[uid(), hallId, 60, 6, '7180']]));
    await finish(U.worker, T, 1);
    const round = await db.session(U.worker);
    const invoice = await db.session(U.accountant);
    const ROUND = 'select public.save_flock_day($1, $2, 60, 0, null, null, null, null, null, null, null, null, null, $3, true) as v';
    try {
      const [first, waiter] = roundFirst ? [round, invoice] : [invoice, round];
      const doRound = () => round.run(ROUND, [flock, TODAY, uid()]);
      const doSale = () => invoice.run(`${SELL} as v`, sellArgs({ sale: uid(), ticket: T, version: 2, price: '2750.00' }));
      const firstResult = await (roundFirst ? doRound() : doSale());
      const pending = roundFirst ? doSale() : doRound();
      const state = await settleOn(pending, waiter.pid, first.pid);
      await first.commit();
      const second = await pending;
      await waiter.commit();
      const left = await live(flock);
      t.same([state, firstResult.ok, second.ok, second.error, left], ['blocked', true, false, roundFirst ? 'birds_over_live' : 'live_negative', 40],
        `R1 ${name}: الثانية تنتظر الأولى ثمّ تُرفض، والحيّ 40`);
    } finally {
      await round.rollback();
      await invoice.rollback();
    }
  };
  await section('R1 الجولة أوّلاً', () => r1('الجولة أوّلاً', F4, h4, true));
  await section('R1 الفاتورة أوّلاً', () => r1('الفاتورة أوّلاً', F5, h5, false));

  // ── ميزان الأقفاص (العقد §3، ticket_nets): خابط القاعة مجموع وزناتها، وأقفاصها مجموع أقفاص الوزنات، وصافيها = الخابط − الأقفاص × وزن القفص ──────
  // «قاعة 2» 120 طيراً بوزنتين: 5 أقفاص 160.500 و5 أقفاص 158.250، والقفص 6: الخابط 318.750 والأقفاص 10 (60 كغم) والصافي 258.750، والمعدّل
  // 258.750 ÷ 120 = 2.15625 ← 2.156؛ بلا فارغ ولا خابط قبلها. وعيّنتها للشاشات (وزنات ميزان الأقفاص من القاعدة الحقيقية).
  await section('ميزان الأقفاص', async () => {
    const T = id(1301);
    const data = { site_id: siteA, on_date: TODAY, method: 'crates', empty_kg: null, empty_with_crates: null, crate_kg: '6', vehicle: null, driver: null, note: null,
      stops: [{ id: id(1302), hall_id: h2, birds: 120, crates: null, gross_kg: null, weighings: [{ id: id(1303), crates: 5, gross_kg: '160.500' }, { id: id(1304), crates: 5, gross_kg: '158.250' }] }] };
    const saved = await save(U.worker, T, null, data);
    const done = await finish(U.worker, T, 1);
    const v = done.value;
    const stop = v?.stops?.[0];
    t.same(
      [saved.ok, done.ok, v?.method, v?.empty_kg, v?.empty_with_crates, v?.crate_kg, stop?.weighings?.map((w) => [w.weighing_no, w.crates, w.gross_kg]), stop?.gross_kg,
        stop?.prev_gross_kg, stop?.crates, stop?.crates_kg, stop?.net_kg, stop?.avg_kg, v?.birds, v?.crates, v?.net_kg, v?.avg_kg],
      [true, true, 'crates', null, null, '6.000', [[1, 5, '160.500'], [2, 5, '158.250']], '318.750', null, 10, '60.000', '258.750', '2.156', 120, 10, '258.750', '2.156'],
      'ميزان الأقفاص: الخابط 318.750 من الوزنتين والأقفاص 10 (60 كغم)، والصافي 258.750 والمعدّل 2.156، بلا فارغ ولا خابط قبلها',
    );
    samples.weigh_ticket_crates = await one(U.manager, 'select public.weigh_ticket($1)', [T]);
  });

  // ── العيّنات: القرّاء على حالة الملف الأخيرة (تذكرة مكتملة أُلغيت فاتورتها فعادت للفوترة، ومفوترة، وملغاة، ومسوّدة؛ وفاتورة مرحَّلة وملغاة بمقبوضها؛
  //    والمبيعات والكشف وخلاصة المال وبطاقة البيع والفوج)، لكلّ دور بما يراه.
  if (process.env.BIRDS_SAMPLES_OUT) {
    const read = (user, sql, params = []) => one(user, `${sql} as v`, params);
    const g4 = (await admin("select id from public.bird_sales where doc_no = 'BR-2026-0002'"))[0].id;
    const range = ['2026-11-01', TODAY];
    Object.assign(samples, {
      _note: 'عيّنات القاعدة الحقيقية (supabase/tests/birds.test.mjs وclose.test.mjs بـBIRDS_SAMPLES_OUT=1، اليوم المثبَّت ' + TODAY + '، وكلّ ملفّ يدمج مفاتيحه)؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات.',
      weigh_ticket_done: await read(U.manager, 'select public.weigh_ticket($1)', [T1]),
      weigh_ticket_invoiced: await read(U.manager, 'select public.weigh_ticket($1)', [T4]),
      weigh_ticket_void: await read(U.manager, 'select public.weigh_ticket($1)', [id(201)]),
      weigh_ticket_draft: await read(U.worker, 'select public.weigh_ticket($1)', [id(1001)]),
      weigh_ticket_hall_worker: await read(U.worker, 'select public.weigh_ticket($1)', [T4]),
      weigh_ticket_options_sites: await read(U.worker, 'select public.weigh_ticket_options(null)'),
      weigh_ticket_options_site: await read(U.worker, 'select public.weigh_ticket_options($1)', [siteA]),
      weigh_tickets_all: await read(U.accountant, 'select public.weigh_tickets($1, $2, $3)', [...range, 'all']),
      weigh_tickets_awaiting: await read(U.accountant, 'select public.weigh_tickets(null, null, $1)', ['awaiting']),
      weigh_tickets_hall_worker: await read(U.worker, 'select public.weigh_tickets($1, $2, $3)', [...range, 'all']),
      bird_sale_form_open: await read(U.accountant, 'select public.bird_sale_form($1)', [T1]),
      bird_sale_form_invoiced: await read(U.accountant, 'select public.bird_sale_form($1)', [T4]),
      bird_sale_detail: await read(U.manager, 'select public.bird_sale_detail($1)', [g4]),
      bird_sale_detail_void: await read(U.manager, 'select public.bird_sale_detail($1)', [S1]),
      sales_overview: await read(U.accountant, 'select public.sales_overview($1, $2)', range),
      sales_report_party: await read(U.accountant, 'select public.sales_report($1, $2, $3)', [...range, 'party']),
      sales_report_day: await read(U.accountant, 'select public.sales_report($1, $2, $3)', [...range, 'day']),
      sales_report_item: await read(U.accountant, 'select public.sales_report($1, $2, $3)', [...range, 'item']),
      party_statement_v2: await read(U.accountant, 'select public.party_statement_v2($1, null, $2, $3)', [trader, ...range]),
      money_overview: await read(U.accountant, 'select public.money_overview()'),
      flock_sales: await read(U.manager, 'select public.flock_sales($1)', [F1]),
      flock_sales_hall_worker: await read(U.worker, 'select public.flock_sales($1)', [F3]),
      flock_detail: await read(U.manager, 'select public.flock_detail($1)', [F1]),
      flock_cycles: await read(U.manager, 'select public.flock_cycles()'),
      halls_day_sold: await read(U.manager, 'select public.halls_day($1)', [YESTERDAY]),
      flock_cycle_report: await read(U.manager, 'select public.flock_cycle_report($1)', [F1]),
      flock_cycle_report_no_money: await read(U.worker, 'select public.flock_cycle_report($1)', [F1]),
    });
    // close.test يكتب عيّناته في الملفّ نفسه: كلّ ملفّ يدمج مفاتيحه فيه ولا يمسح مفاتيح الآخر (تشغيل أحدهما وحده لا يُسقط عيّنات الثاني).
    const file = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
    const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    writeFileSync(file, JSON.stringify({ ...existing, ...samples }, null, 1) + '\n');
  }
}
