// جواب المالك 2026-11-13 في تأريخ فاتورة الطيور (0028 D3؛ سُئل بخيارات): أ) التذكرة المكتملة الأقدم من سبعة أيّام تُفوتر «بتاريخ اليوم»: الفاتورة (قيدها
// ورقمها) بيوم إصدارها، والطيور تخرج من القاعة بيوم التذكرة الحقيقيّ (صفوف «مباع» بيومها)؛ وحدّ الأيّام السبعة للمال كما هو؛ ويوم تذكرة في فترة مقفلة يرفض
// الفاتورة period_locked كما ترفض الجولة وفرق العدّ صفوف القاعة فيها، بجملة تسمّي يوم التذكرة والمخرج. ب) «المقبوض الآن» يدخل الصندوق بيوم إصدار الفاتورة
// (app_today()) في كلّ فاتورة طيور، والفاتورة بيومها. وإلغاء الفاتورة كما هو (العكس بيوم الإلغاء والمقبوض يبقى رصيداً للتاجر).
// L1 تذكرة قبل ثمانية أيّام تُفوتر: القرّاء يعدونها (invoice_on وlate وinvoice_late)، والفاتورة بتاريخ اليوم وصفوف «مباع» بيوم التذكرة، والحيّ لكلّ يوم.
// L2 تذكرة قبل يومين: الفاتورة بيوم التذكرة، والمقبوض (قيده وحركة صندوقه) اليوم؛ وL3 رصيد الصندوق ليوم التذكرة لا يتغيّر حين تصدر الفاتورة بعده.
// L4 فحص الأيّام ما زال لكلّ يوم في المتأخّرة (live_negative يسمّي يوم التذكرة)، وجملة birds_over_live لا تدلّ على «فرق عدّ» لا يُقبل بيومها.
// L5 الإعادة بالمرجع وبالمعرّف بالنتيجة نفسها، والإلغاء كما هو، وفاتورة جديدة للتذكرة نفسها بعده؛ وL5b حدّ الأيّام السبعة (تذكرة اليوم السابع بيومها).
// L6 ثوابت verify_bird_sales الجديدة بطفرات تكسرها (purchase-kit mutant داخل معاملة ترجع)، وطفرة المقبوض بيوم الفاتورة يمسكها فحص رصيد الصندوق.
// L7 الفترة المقفلة آخر الملف (تمسّ كلّ تاريخ بعدها).
// كلّ فحص فشل على d13246a (قبل الجواب) ونجح بعده. منشأة هذا الملف وحدها: المعرّفات f2840000 والهواتف 96477028400. كلّ قسم بـsection: رمية فيه فحص
// فاشل باسمه ولا توقف الملف. واسمه بعد birds.test بالترتيب (birds28 > birds.): ذاك يبحث عن أرقام BR وWT في المنشآت كلّها ويفترض أنّه أوّل من يكتبها.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
const TODAY = '2026-11-12';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dmy = (on) => `${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}`;
const id = (n) => `f2840000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028400${String(n).padStart(2, '0')}`;

const SALE_SIG = 'public.record_bird_sale(uuid, uuid, uuid, integer, uuid, numeric, numeric, numeric, uuid, text)';
const SELL = 'select public.record_bird_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)';
const VOID_SALE = 'select public.void_bird_sale($1, $2, $3)';
const ADJUST = 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7)';
const SAVE = 'select public.save_weigh_ticket($1, $2, $3::jsonb)';
const FINISH = 'select public.finish_weigh_ticket($1, $2, $3)';
const ROUND = 'select public.save_flock_day($1, $2, $3, 0, null, null, null, null, null, null, null, null, null, $4, false)';

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  /** عيّنات القاعدة الحقيقية للشاشات (BIRDS_SAMPLES_OUT=1 يدمجها في scripts/tests/fixtures/birds-0028.json مع عيّنات الملفّات الأخرى). */
  const samples = {};
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
    name: 'مزرعة الفواتير المتأخّرة',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['worker', 'hall_worker', ['broiler']],
    ],
  });
  const { users: U, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const admin = async (sql, params) => (await db.admin(sql, params)).rows;
  const at = (on, fn) => db.setToday(on, fn);
  const siteA = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل التأخير', 'farm') returning id", [D.broiler]);
  const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر التأخير', true) returning id");
  const box = async (name, opening) => {
    const account = await one(U.owner, "insert into public.cash_accounts (name, kind) values ($1, 'cash') returning id", [name]);
    if (opening) await one(U.owner, 'select public.record_cash_opening($1, $2, $3, $4, $5)', [uid(), account, opening, day(-5), uid()]);
    return account;
  };

  // ── الأدوات ────────────────────────────────────────────────────────────────────────────────────────────
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteA, name]);
  const place = async (hallId, count) => (await one(U.manager, 'select public.open_flock($1, $2, $3, 0, null, $4)', [hallId, day(-20), count, uid()])).flock_id;
  const round = async (flock, on, dead) => {
    const v = await one(U.manager, ROUND, [flock, on, dead, uid()]);
    if (v.status !== 'saved') throw new Error(`جولة ${on}: ${JSON.stringify(v)}`);
  };
  /** تذكرة قبّان مكتملة بيوم on بوقفة لكلّ [قاعة، طيور، صافٍ] (الفارغ 7,000 مع الأقفاص، والخابط تراكميّ)، تُكتب وتُكمل يومها (setToday). */
  const ticket = (on, stops) => at(on, async () => {
    const ticketId = uid();
    let gross = 7000;
    const data = { site_id: siteA, on_date: on, method: 'scale', empty_kg: '7000', empty_with_crates: true, crate_kg: null,
      stops: stops.map(([hallId, birds, net]) => {
        gross += Number(net);
        return { id: uid(), hall_id: hallId, birds, crates: 10, gross_kg: String(gross), weighings: [] };
      }) };
    await one(U.manager, SAVE, [ticketId, null, JSON.stringify(data)]);
    const done = await one(U.manager, FINISH, [uid(), ticketId, 1]);
    return { id: ticketId, version: done.version, no: done.ticket_no, on };
  });
  const sellArgs = (tk, { ref = uid(), sale = uid(), price = '2000.00', paid = '0', account = null } = {}) =>
    [ref, sale, tk.id, tk.version, trader, price, '0', paid, account, null];
  const form = (tk) => one(U.accountant, 'select public.bird_sale_form($1)', [tk.id]);
  const hallsDay = (on) => one(U.manager, 'select public.halls_day($1)', [on]);
  const flockOn = async (on, hallId) => (await hallsDay(on)).sites.flatMap((s) => s.halls).find((h) => h.hall_id === hallId)?.flock ?? null;
  const dayLive = async (on, hallId) => {
    const f = await flockOn(on, hallId);
    return f && [f.live_start, f.sold, f.ticketed, f.live_end];
  };
  /** صفوف المستند المالية بأيّامها: القيود (النوع، اليوم، المبلغ، أصل معكوس؟) وحركات الصندوق (اليوم، المبلغ)، من الصفوف الخام. */
  const moneyRows = async (sale) => ({
    entries: (await admin(`select kind, on_date::text as d, amount::text as a, reverses_entry_id is not null as rev from public.party_entries
      where doc_kind = 'bird_sale' and doc_id = $1 order by seq`, [sale])).map((r) => [r.kind, r.d, r.a, r.rev]),
    cash: (await admin("select on_date::text as d, amount::text as a from public.cash_moves where doc_kind = 'bird_sale' and doc_id = $1 order by seq", [sale]))
      .map((r) => [r.d, r.a]),
  });
  const soldRows = async (sale) => (await admin(`select on_date::text as d, birds, reverses_id is not null as rev from public.flock_counts
    where doc_kind = 'bird_sale' and doc_id = $1 order by reverses_id is not null, on_date`, [sale])).map((r) => [r.d, r.birds, r.rev]);
  const countDays = async (flock) => (await admin('select on_date::text as d, sold from private.flock_count_days($1) where sold <> 0 order by on_date', [flock]))
    .map((r) => [r.d, r.sold]);
  /** رصيد صندوق نهاية يوم من «حركة الأموال» (money_moves، القارئ نفسه الذي يعرض الصندوق) ووارد اليوم بأصنافه. */
  const boxDay = async (account, on) => {
    const v = await one(U.accountant, 'select public.money_moves($1, $2, $3, null, null, null, 50)', [on, on, account]);
    return [v.closing, v.rows.map((r) => [r.class, r.doc_kind, r.inflow])];
  };
  const broken = (fns, run) => mutant(db, U.manager, fns, run);
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(`${sql} as v`, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  const birdChecks = async (oq) => Object.fromEntries((await oq('select check_name, violations::int as n from public.verify_bird_sales() where violations <> 0')).rows
    .map((r) => [r.check_name, r.n]));

  // ── L1: تذكرة قبل ثمانية أيّام (أ) ─────────────────────────────────────────────────────────────────────────────────
  // «قاعة التأخير» 1,000 طير منذ 20 يوماً، وجولة قبل تسعة أيّام بنافق 10 (990)، وتذكرة قبل ثمانية أيّام بـ100 طير (200 كغم)، وجولة قبل خمسة أيّام بنافق 5.
  // قبل الفاتورة: نموذجها والتذكرة وقائمتا الانتظار تعدّها بتاريخ اليوم (invoice_on اليوم، late)، والمقبوض اليوم. والفاتورة بسعر 2,000.00 × 200 = 400,000 والمقبوض
  // 150,000: BR-2026-0001 بتاريخ اليوم، وقيد الفاتورة وقيد المقبوض وحركة الصندوق اليوم، وصفّ «مباع» −100 قبل ثمانية أيّام؛ والحيّ: أوّل يوم التذكرة 990، والمباع
  // 100، ونهايته 890، والآن 890 − 5 = 885.
  const hL = await hall('قاعة التأخير');
  const FL = await place(hL, 1000);
  const boxL = await box('صندوق التأخير', null);
  const SL = id(101);
  const refL = id(102);
  let late = null;
  let firstResult = null;
  await section('L1: تذكرة قبل ثمانية أيّام تُفوتر بتاريخ اليوم', async () => {
    await at(day(-9), () => round(FL, day(-9), 10));
    late = await ticket(day(-8), [[hL, 100, '200']]);
    await round(FL, day(-5), 5);
    const f = await form(late);
    const wt = await one(U.accountant, 'select public.weigh_ticket($1)', [late.id]);
    const list = await one(U.accountant, 'select public.weigh_tickets(null, null, $1)', ['awaiting']);
    const ov = await one(U.accountant, 'select public.sales_overview($1, $2)', [day(-30), TODAY]);
    const row = list.rows.find((r) => r.id === late.id);
    const waiting = ov.birds.awaiting.find((r) => r.ticket_id === late.id);
    const before = await dayLive(day(-8), hL);
    Object.assign(samples, { bird_sale_form_late: f, weigh_ticket_late: wt, weigh_tickets_awaiting_late: list, sales_overview_late: ov });
    same([[f.invoiceable, f.why, f.can_post, f.invoice_on, f.late, f.paid_on], [wt.can.invoice, wt.invoice_why, wt.invoice_late],
      [row?.invoiceable, row?.invoice_why, row?.invoice_late], [waiting?.invoiceable, waiting?.why, waiting?.late], before],
    [[true, null, true, TODAY, true, TODAY], [true, null, true], [true, null, true], [true, null, true], [990, 0, 100, 990]],
    'L1: تذكرة قبل ثمانية أيّام: النموذج والتذكرة وقائمتا الانتظار تعرض فاتورتها بتاريخ اليوم (invoice_on اليوم، late وinvoice_late)، والمقبوض اليوم؛ وطيورها «على التذكرة» يومها');
    const sale = await call(db, U.accountant, SELL, sellArgs(late, { ref: refL, sale: SL, paid: '150000', account: boxL }));
    firstResult = sale.value;
    samples.record_bird_sale_late = sale.value;
    const v = sale.value;
    same([sale.ok, v?.doc_no, v?.sold_on, v?.ticket_on, v?.paid_on, v?.money?.total, v?.money?.paid_now], [true, 'BR-2026-0001', TODAY, day(-8), TODAY, '400000', '150000'],
      'L1: الفاتورة BR-2026-0001 بتاريخ اليوم (sold_on)، ويوم التذكرة قبل ثمانية أيّام (ticket_on)، والمقبوض اليوم (paid_on)');
    same([await moneyRows(SL), await soldRows(SL)], [{ entries: [['invoice', TODAY, '400000', false], ['payment', TODAY, '-150000', false]], cash: [[TODAY, '150000']] },
      [[day(-8), -100, false]]], 'L1: قيد الفاتورة وقيد المقبوض وحركة الصندوق بتاريخ اليوم، وصفّ «مباع» −100 بيوم التذكرة (قبل ثمانية أيّام)');
    const detail = (await call(db, U.manager, 'select public.bird_sale_detail($1)', [SL])).value;
    samples.bird_sale_detail_late = detail;
    same([[detail?.sold_on, detail?.ticket_on, detail?.paid_on], await countDays(FL), await dayLive(day(-9), hL), await dayLive(day(-8), hL), await dayLive(day(-7), hL),
      await dayLive(TODAY, hL)], [[TODAY, day(-8), TODAY], [[day(-8), 100]], [1000, 0, 0, 990], [990, 100, 0, 890], [890, 0, 0, 890], [885, 0, 0, 885]],
    'L1: تفصيل الفاتورة بأيّامها الثلاثة، والمباع بيوم التذكرة في أيّام الفوج، والحيّ لكلّ يوم: قبلها 990، ويومها 990 − 100 = 890، وبعده 890، واليوم 885');
    const after = await form(late);
    const wtAfter = await one(U.manager, 'select public.weigh_ticket($1)', [late.id]);
    same([[after.why, after.invoice_on, after.late], wtAfter.invoice_late], [['invoiced', TODAY, true], true],
      'L1: بعد الفاتورة: النموذج بيوم الفاتورة المرحَّلة (اليوم، late)، والتذكرة invoice_late (فاتورتها بغير يومها)');
    // قرّاء المبيعات بيوم الفاتورة (يوم قيدها): قائمة المبيعات وتقريرها باليوم وخلاصة الشهر، لا بيوم التذكرة.
    const listed = await one(U.accountant, 'select public.sales_overview($1, $2)', [day(-30), TODAY]);
    const ticketDay = await one(U.accountant, 'select public.sales_overview($1, $2)', [day(-8), day(-8)]);
    const byDay = await one(U.accountant, 'select public.sales_report($1, $2, $3)', [day(-30), TODAY, 'day']);
    const month = await one(U.accountant, 'select public.money_overview()');
    same([listed.birds.rows.find((r) => r.id === SL)?.sold_on, ticketDay.birds.rows.length, byDay.birds.rows.map((r) => [r.key, r.count]), month.month.sales.birds],
      [TODAY, 0, [[TODAY, 1]], { count: 1, revenue: '400000' }],
      'L1: قائمة المبيعات وتقريرها باليوم وخلاصة الشهر تعدّ الفاتورة المتأخّرة بيومها (اليوم، يوم قيدها) لا بيوم التذكرة');
  });

  // ── L2 وL3: تذكرة قبل يومين (ب) ─────────────────────────────────────────────────────────────────────────────────
  // «قاعة اليومين» 1,000 طير، وتذكرة قبل يومين بـ100 طير (200 كغم): الفاتورة 400,000 بيوم التذكرة، والمقبوض 100,000 إلى «صندوق اليوم» (افتتاحه 250,000 قبل
  // خمسة أيّام) قيده وحركته اليوم. L3: رصيد الصندوق نهاية يوم التذكرة 250,000 قبل الفاتورة وبعدها، ونهاية اليوم 350,000 بوارد «بيع نقديّ» 100,000؛ وكشف التاجر
  // الفاتورة يوم التذكرة والمقبوض اليوم؛ وخلاصة المال: وارد اليوم «بيع نقديّ» 150,000 + 100,000 = 250,000.
  const h2 = await hall('قاعة اليومين');
  await place(h2, 1000);
  const boxT = await box('صندوق اليوم', '250000');
  const S2 = id(201);
  await section('L2 وL3: الفاتورة بيوم التذكرة، والمقبوض اليوم، ورصيد الصندوق ليوم التذكرة لا يتغيّر', async () => {
    const tk = await ticket(day(-2), [[h2, 100, '200']]);
    const f = await form(tk);
    const ticketDayBefore = await boxDay(boxT, day(-2));
    const sale = await call(db, U.accountant, SELL, sellArgs(tk, { sale: S2, paid: '100000', account: boxT }));
    samples.record_bird_sale_paid_today = sale.value;
    const v = sale.value;
    same([[f.invoice_on, f.late, f.paid_on], [sale.ok, v?.sold_on, v?.ticket_on, v?.paid_on], await moneyRows(S2), await soldRows(S2)],
      [[day(-2), false, TODAY], [true, day(-2), day(-2), TODAY], { entries: [['invoice', day(-2), '400000', false], ['payment', TODAY, '-100000', false]], cash: [[TODAY, '100000']] },
        [[day(-2), -100, false]]],
      'L2: تذكرة قبل يومين: الفاتورة وصفّ «مباع» بيوم التذكرة، والمقبوض (قيده وحركة صندوقه) اليوم، وpaid_on اليوم');
    const statement = await one(U.accountant, 'select public.party_statement_v2($1, null, $2, $3)', [trader, day(-3), TODAY]);
    const lines = statement.books.flatMap((b) => b.lines).filter((l) => l.detail?.doc_id === S2).map((l) => [l.on_date, l.detail?.type]);
    const money = await one(U.accountant, 'select public.money_overview()');
    same([ticketDayBefore, await boxDay(boxT, day(-2)), await boxDay(boxT, TODAY), lines, money.day.classes.find((c) => c.class === 'cash_sale')?.inflow],
      [['250000', []], ['250000', []], ['350000', [['cash_sale', 'bird_sale', '100000']]], [[day(-2), 'bird_sale'], [TODAY, 'bird_sale_payment']], '250000'],
      'L3: رصيد الصندوق نهاية يوم التذكرة 250,000 قبل الفاتورة وبعدها، ونهاية اليوم 350,000 بوارد بيع نقديّ؛ والكشف الفاتورة يوم التذكرة والمقبوض اليوم؛ ووارد اليوم في خلاصة المال 250,000');
  });

  // ── L4: فحص الأيّام في المتأخّرة، وجملة birds_over_live ────────────────────────────────────────────────────────────────
  // «قاعة الأيّام» 100 طير، وتذكرة قبل ثمانية أيّام بـ120 طيراً، ثمّ فرق عدّ +50 قبل يومين: الحيّ الآن 150 فتعبر birds_over_live، لكنّ يوم التذكرة 100 − 120 = −20
  // ← live_negative يسمّي يوم التذكرة. «قاعة الزيادة» 100 طير وتذكرة قبل ثمانية أيّام بـ120: birds_over_live بجملة لا تدلّ على «فرق عدّ» بيومها (يُرفض date_too_old).
  const hN = await hall('قاعة الأيّام');
  const FN = await place(hN, 100);
  const hO = await hall('قاعة الزيادة');
  const FO = await place(hO, 100);
  await section('L4: فحص الأيّام لكلّ يوم في الفاتورة المتأخّرة، وجملة الزيادة', async () => {
    const tn = await ticket(day(-8), [[hN, 120, '240']]);
    await one(U.manager, ADJUST, [uid(), uid(), FN, day(-2), 50, 'العدد الفعليّ أكثر', 100]);
    const negative = await call(db, U.accountant, SELL, sellArgs(tn));
    const to = await ticket(day(-8), [[hO, 120, '240']]);
    const over = await call(db, U.accountant, SELL, sellArgs(to));
    const adjustOld = await call(db, U.manager, ADJUST, [uid(), uid(), FO, day(-8), 20, 'العدد الفعليّ أكثر', 100]);
    Object.assign(samples, { refusal_live_negative_late: { code: negative.code, hint: negative.hint }, refusal_birds_over_live_late: { code: over.code, hint: over.hint } });
    same([negative.code, negative.hint, over.code, over.hint, adjustOld.code, await countDays(FN), await countDays(FO)], ['live_negative',
      `بهذا يصير عدد الطيور الحيّة في «قاعة الأيّام» سالباً يوم ${dmy(day(-8))} (-20). راجع النافق والمستبعد والمباع وفرق العدّ لذلك اليوم وما قبله.`, 'birds_over_live',
      `في «قاعة الزيادة» بحسب النظام 100 طيراً حيّاً، وفي التذكرة 120. ويوم التذكرة ${dmy(day(-8))} أقدم من 7 أيام، فلا يُسجَّل «فرق العدّ» بيومها ولا قبله؛ راجع المدير: إن كان العدد في التذكرة خطأً فليُلغِها وتُكتب تذكرة صحيحة.`,
      'date_too_old', [], []],
    'L4: الفاتورة المتأخّرة تمرّ بفحص الأيّام (live_negative يوم التذكرة رغم أنّ الحيّ الآن 150)، وbirds_over_live فيها لا يدلّ على «فرق عدّ» بيومها (يُرفض date_too_old)، والرفضان لا يُبقيان صفّ «مباع»');
  });

  // ── L5: الإعادة والإلغاء كما هما ───────────────────────────────────────────────────────────────────────────────────
  // فاتورة L1: المرجع نفسه يرجع النتيجة نفسها، والمعرّف نفسه بمرجع جديد وبالمحتوى نفسه = حُفظت بالنتيجة نفسها (من الصفوف). الإلغاء: قيد الفاتورة يُعكس اليوم،
  // والمقبوض وحركته يبقيان (150,000 رصيداً للتاجر)، وصفّ «مباع» يُعكس اليوم فيختفي من يوم التذكرة (الحيّ يومها 990)، والتذكرة تعود للفوترة بتاريخ اليوم؛ ثمّ فاتورة
  // جديدة بلا مقبوض: BR-2026-0003 بتاريخ اليوم وصفّها بيوم التذكرة.
  await section('L5: الإعادة والإلغاء', async () => {
    const sameRef = await call(db, U.accountant, SELL, sellArgs(late, { ref: refL, sale: SL, paid: '150000', account: boxL }));
    const sameId = await call(db, U.accountant, SELL, sellArgs(late, { sale: SL, paid: '150000', account: boxL }));
    same([sameRef.ok, sorted(sameRef.value), sameId.ok, sorted(sameId.value)], [true, sorted(firstResult), true, sorted(firstResult)],
      'L5: الإعادة بالمرجع نفسه وبالمعرّف نفسه (مرجع جديد) ترجع نتيجة الفاتورة الأولى بأيّامها (اليوم، ويوم التذكرة، والمقبوض اليوم)');
    const voided = await call(db, U.manager, VOID_SALE, [SL, 'سعر خاطئ', uid()]);
    const rows = await moneyRows(SL);
    const counts = await soldRows(SL);
    const f = await form(late);
    same([[voided.ok, voided.value?.voided_on, voided.value?.money?.payment_kept], rows, counts, await countDays(FL), await dayLive(day(-8), hL), [f.invoiceable, f.invoice_on, f.late]],
      [[true, TODAY, '150000'], { entries: [['invoice', TODAY, '400000', false], ['payment', TODAY, '-150000', false], ['invoice', TODAY, '-400000', true]], cash: [[TODAY, '150000']] },
        [[day(-8), -100, false], [TODAY, 100, true]], [], [990, 0, 100, 990], [true, TODAY, true]],
      'L5: الإلغاء: قيد الفاتورة يُعكس اليوم، والمقبوض وحركته يبقيان رصيداً للتاجر، وصفّ «مباع» يُعكس اليوم فيختفي من يوم التذكرة، والتذكرة تُفوتر من جديد بتاريخ اليوم');
    const again = await call(db, U.accountant, SELL, sellArgs(late, { sale: id(103) }));
    same([again.ok, again.value?.doc_no, again.value?.sold_on, again.value?.ticket_on, again.value?.paid_on, await soldRows(id(103)), await countDays(FL)],
      [true, 'BR-2026-0003', TODAY, day(-8), null, [[day(-8), -100, false]], [[day(-8), 100]]],
      'L5: فاتورة جديدة للتذكرة نفسها بعد الإلغاء: BR-2026-0003 بتاريخ اليوم بلا مقبوض (paid_on null)، وصفّها بيوم التذكرة');
  });

  // ── L5b: حدّ الأيّام السبعة: تذكرة قبل سبعة أيّام بالضبط تُفوتر بيومها (قاعدة المستند تقبل اليوم السابع)، والتي قبل ثمانية بتاريخ اليوم (L1) ─────────────
  const h7 = await hall('قاعة الحدّ');
  await place(h7, 1000);
  await section('L5b: تذكرة قبل سبعة أيّام بالضبط', async () => {
    const tk = await ticket(day(-7), [[h7, 10, '20']]);
    const f = await form(tk);
    const wt = await one(U.accountant, 'select public.weigh_ticket($1)', [tk.id]);
    const sale = await call(db, U.accountant, SELL, sellArgs(tk, { paid: '1000', account: boxT }));
    same([[f.invoiceable, f.invoice_on, f.late], wt.invoice_late, [sale.ok, sale.value?.sold_on, sale.value?.ticket_on, sale.value?.paid_on], await soldRows(sale.value?.id)],
      [[true, day(-7), false], false, [true, day(-7), day(-7), TODAY], [[day(-7), -10, false]]],
      'L5b: تذكرة قبل سبعة أيّام بالضبط تُفوتر بيومها (late = false)، وصفّها بيومها، والمقبوض اليوم');
  });

  // ── L6: الثوابت الجديدة بطفرات تكسر القاعدة فعلاً ─────────────────────────────────────────────────────────────────
  // (أ) صفوف «مباع» بيوم الفاتورة في المتأخّرة ← sale_counts؛ (ب) الفاتورة بتاريخ اليوم دائماً (تذكرة قبل يومين) ← sale_shape؛ (ج) حركة الصندوق بيوم الفاتورة وقيد
  // المقبوض اليوم ← sale_entries؛ (د) المقبوض قيده وحركته بيوم الفاتورة (القديم) يقع داخل نافذة الثابت، فيمسكه فحص رصيد الصندوق: يتغيّر رصيد يوم التذكرة.
  const hM = await hall('قاعة الطفرات');
  await place(hM, 1000);
  const boxM = await box('صندوق الطفرات', '250000');
  await section('L6: طفرات الثوابت', async () => {
    const lateM = await ticket(day(-8), [[hM, 10, '20']]);
    const recentM = await ticket(day(-2), [[hM, 10, '20']]);
    const run = (pairs, tk, opts) => broken([[SALE_SIG, pairs]], async ({ attempt, oq }) => {
      const v = await inside(attempt, U.accountant, SELL, sellArgs(tk, opts));
      const closing = (await oq("select coalesce(sum(amount), 0)::text as c from public.cash_moves where account_id = $1 and on_date <= $2", [boxM, day(-2)])).rows[0].c;
      return { ok: v?.code === undefined, bad: await birdChecks(oq), closing };
    }).catch((error) => ({ ok: false, bad: error.message, closing: null }));
    const a = await run([["values (v_org, f.id, f.hall_id, f.site_id, f.division_id, t.on_date, 'sold'", "values (v_org, f.id, f.hall_id, f.site_id, f.division_id, v_on, 'sold'"]], lateM);
    const b = await run([['v_on := private.ticket_invoice_on(t.on_date);', 'v_on := v_today;']], recentM);
    const c = await run([["m := private.write_cash_move(p_cash_account, v_paid, 'party_payment', 'bird_sale', p_sale_id, pay.id, v_today, null, null);",
      "m := private.write_cash_move(p_cash_account, v_paid, 'party_payment', 'bird_sale', p_sale_id, pay.id, v_on, null, null);"]], recentM, { paid: '5000', account: boxM });
    const d = await run([["'payment', -v_paid, 'bird_sale', p_sale_id, v_no, v_today, null);", "'payment', -v_paid, 'bird_sale', p_sale_id, v_no, v_on, null);"],
      ["m := private.write_cash_move(p_cash_account, v_paid, 'party_payment', 'bird_sale', p_sale_id, pay.id, v_today, null, null);",
        "m := private.write_cash_move(p_cash_account, v_paid, 'party_payment', 'bird_sale', p_sale_id, pay.id, v_on, null, null);"]], recentM, { paid: '5000', account: boxM });
    const real = (await admin('select coalesce(sum(amount), 0)::text as c from public.cash_moves where account_id = $1 and on_date <= $2', [boxM, day(-2)]))[0].c;
    same([[a.ok, a.bad], [b.ok, b.bad], [c.ok, c.bad], [d.ok, d.bad, d.closing, real]],
      [[true, { sale_counts: 1 }], [true, { sale_shape: 1 }], [true, { sale_entries: 1 }], [true, {}, '255000', '250000']],
      'L6: طفرة صفّ «مباع» بيوم الفاتورة يمسكها sale_counts، والفاتورة بتاريخ اليوم دائماً sale_shape، وحركة الصندوق بغير يوم قيد المقبوض sale_entries؛ والمقبوض كلّه بيوم الفاتورة يغيّر رصيد الصندوق ليوم التذكرة (255,000) فيمسكه فحص L3');
  });

  // ── L7 (آخر الملف): الفترة المقفلة (أ) ────────────────────────────────────────────────────────────────────────────
  // «قاعة القفل» 1,000 طير، وتذكرة قبل ثلاثة أيّام وتذكرة قبل تسعة أيّام، ثمّ تُقفل الحسابات حتى أوّل أمس: الجولة وفرق العدّ يُرفضان period_locked في يوم التذكرة
  // (قاعدة صفوف القاعة)، فالفاتورتان period_locked بجملة تسمّي التذكرة ويومها والمخرج، والمتأخّرة كذلك (لا date_too_old)؛ ونموذجاهما لا يعدانهما.
  const hK = await hall('قاعة القفل');
  const FK = await place(hK, 1000);
  await section('L7: يوم التذكرة في فترة مقفلة', async () => {
    const t3 = await ticket(day(-3), [[hK, 10, '20']]);
    const t9 = await ticket(day(-9), [[hK, 10, '20']]);
    await one(U.owner, 'select public.set_period_lock($1)', [day(-2)]);
    try {
      const f3 = await form(t3);
      const f9 = await form(t9);
      const p3 = await call(db, U.accountant, SELL, sellArgs(t3));
      const p9 = await call(db, U.accountant, SELL, sellArgs(t9));
      const roundLocked = await call(db, U.manager, ROUND, [FK, day(-3), 1, uid()]);
      const adjustLocked = await call(db, U.manager, ADJUST, [uid(), uid(), FK, day(-3), 1, 'العدد الفعليّ أكثر', 1000]);
      const hint = (tk) => `التذكرة ${tk.no} بيوم ${dmy(tk.on)}، وطيورها تخرج من القاعة بيومها، والحسابات مقفلة حتى ${dmy(day(-2))} (هذا اليوم وما قبله)، فلا تُصدر فاتورتها. إن كان يوم التذكرة صحيحاً فاطلب من مالك المنشأة فتح الفترة.`;
      Object.assign(samples, { bird_sale_form_period_locked_late: f9, refusal_period_locked_late: { code: p9.code, hint: p9.hint } });
      same([[f3.invoiceable, f3.why, f3.late], [f9.invoiceable, f9.why, f9.late, f9.invoice_on], [p3.code, p3.hint], [p9.code, p9.hint], roundLocked.code, adjustLocked.code],
        [[false, 'period_locked', false], [false, 'period_locked', true, TODAY], ['period_locked', hint(t3)], ['period_locked', hint(t9)], 'period_locked', 'period_locked'],
        'L7: يوم التذكرة في فترة مقفلة: الجولة وفرق العدّ فيه period_locked، فالفاتورة كذلك (والمتأخّرة لا date_too_old) بجملة تسمّي التذكرة ويومها ومالك المنشأة، والنموذج لا يعدها');
    } finally {
      await one(U.owner, 'select public.set_period_lock($1)', ['2026-01-01']);
    }
  });

  // ── العيّنات ──────────────────────────────────────────────────────────────────────────────────────────────
  if (process.env.BIRDS_SAMPLES_OUT) {
    const existing = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
    writeFileSync(FIXTURE, JSON.stringify({ ...existing, ...samples }, null, 1) + '\n');
  }
}
