// إصلاحات المراجعة العدائية لـ0028 (الجزء db): كلّ ملاحظة أثبتها مراجع (المال والمخزون M، والتزامن والنطاق C، ويوم المالك O، والشاشات S) فحصٌ هنا
// فشل على ba04e1d قبل إصلاحه. C1/M1 إعادة الفتح تلغي إرجاعاً في مخزن خارج نطاق المدير؛ M2 إعادة الفتح في قاعة مؤرشفة؛ O1 دورة أُرجع منقولها لا تُعاد
// أبداً؛ M3 المقبوض الذي رُدّ ما زال «نقداً» في الفاتورة؛ M4 الإغلاق يقبل نموذجاً تغيّرت قيمة ما نزل فيه والكمية كما هي (البصمة)؛ O2/M5 «الباقي في القاعة»
// بتعريف واحد؛ O3 فروق العدّ بأسبابها؛ O6 البطاقة لا تعد بإعادة فتح مرفوضة؛ O7 يوم بدأ بلا طير حيّ لا ينتظر جولة ولا علفاً؛ O8 اليوم المقترح للإغلاق
// داخل المسموح؛ C2 معرّف وقفة من الجهاز يُكتب فوق وقفة تذكرة أخرى؛ C4 تذكرة حقل آخر تُقفل وتُسمّى؛ C5 السعر المقترح من حقل خارج النطاق؛ C7 التلميحات؛
// M7/M8/M9 ثوابت جديدة بطفرة دالّة تكسرها داخل معاملة ترجع (purchase-kit mutant)؛ S1 يوم الخادم وأقدم يوم لفرق العدّ؛ S9 يوم الإلغاء؛ O4 لا تُعرض
// فاتورة يرفضها الكاتب (too_old وperiod_locked وout_of_scope). منشأة هذا الملف وحدها: المعرّفات f2830000 والهواتف 96477028300. كلّ قسم بـsection: رمية
// فيه فحص فاشل باسمه ولا توقف الملف. والفترة المقفلة آخر قسم (تمسّ كلّ تاريخ بعدها). اسم الملف بعد birds.test بالترتيب (birds28 > birds.): ذاك
// يبحث عن أرقام BR وWT في المنشآت كلّها ويفترض أنّه أوّل من يكتبها.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
const TODAY = '2026-11-12';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dmy = (on) => `${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}`;
const id = (n) => `f2830000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028300${String(n).padStart(2, '0')}`;

const SIG = {
  close: 'public.close_flock(uuid, uuid, uuid, date, integer, integer, jsonb, text, jsonb, text, text)',
  save: 'public.save_weigh_ticket(uuid, integer, jsonb)',
  voidSale: 'public.void_bird_sale(uuid, text, uuid)',
};
const CLOSE = 'select public.close_flock($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11)';
const REOPEN = 'select public.reopen_flock($1, $2, $3)';
const RETURN_CARRY = 'select public.return_hall_carry($1, $2, $3, $4)';
const SELL = 'select public.record_bird_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)';
const ADJUST = 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7)';
const SAVE = 'select public.save_weigh_ticket($1, $2, $3::jsonb)';
const FINISH = 'select public.finish_weigh_ticket($1, $2, $3)';
const VOID_TICKET = 'select public.void_weigh_ticket($1, $2, $3)';
const ISSUE = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8)';

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  /** عيّنات القاعدة الحقيقية للشاشات (BIRDS_SAMPLES_OUT=1 يدمجها في scripts/tests/fixtures/birds-0028.json مع عيّنات birds.test وclose.test). */
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
    name: 'مزرعة الإصلاحات',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['worker', 'hall_worker', ['broiler']],
      ['storekeeper', 'storekeeper'],
    ],
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
  const site = (name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D.broiler, name]);
  const siteA = await site('حقل أ');
  const siteB = await site('حقل ب');
  W.farm = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل أ', 'farm') returning id", [D.broiler, siteA]);
  /** عضو بنطاق حقول (add_member_v2): مدير ومحاسب وعامل قاعة بحقل أ وحده. */
  const addScoped = async (n, role, name, sites) => {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id(n), phone(n)]);
    const member = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[])', [`0${phone(n).slice(3)}`, role, name, [], sites, []]);
    await db.acceptInvite(U.owner, id(n), member);
    return id(n);
  };
  U.scopedMgr = await addScoped(20, 'manager', 'مدير حقل أ', [siteA]);
  U.scopedAcc = await addScoped(21, 'accountant', 'محاسب حقل أ', [siteA]);
  U.siteWorker = await addScoped(22, 'hall_worker', 'عامل حقل أ', [siteA]);
  const item = (name) => one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'feed', 'kg') returning id", [name]);
  const I = { x: await item('علف الإصلاح'), y: await item('علف الإصلاح الثاني'), z: await item('علف السحب'), v: await item('علف الباقي') };
  // «رصيد العلف»: الإصلاح 700 للكيلو، والثاني 600، والسحب 800 (ألف كغم فقط)، والباقي 1,000؛ و«مخزن حقل أ»: الإصلاح والثاني 900 للكيلو.
  await postedOpening(db, U.owner, W.feed, day(-40), [{ item: I.x, qty: 20000, value: '14000000.00' }, { item: I.y, qty: 10000, value: '6000000.00' },
    { item: I.z, qty: 1000, value: '800000.00' }, { item: I.v, qty: 2000, value: '2000000.00' }]);
  await postedOpening(db, U.owner, W.farm, day(-40), [{ item: I.x, qty: 5000, value: '4500000.00' }, { item: I.y, qty: 5000, value: '4500000.00' }]);
  const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر الإصلاح', true) returning id");
  const box = await one(U.owner, "insert into public.cash_accounts (name, kind) values ('صندوق الإصلاح', 'cash') returning id");
  const feedName = (await admin('select name from public.warehouses where id = $1', [W.feed]))[0].name;

  // ── الأدوات ────────────────────────────────────────────────────────────────────────────────────────────
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const place = async (hallId, on, count) => (await one(U.manager, 'select public.open_flock($1, $2, $3, 0, null, $4)', [hallId, on, count, uid()])).flock_id;
  const issue = (flock, itemId, qty, on, wh, user = U.manager) => one(user, ISSUE, [uid(), uid(), uid(), flock, itemId, qty, on, wh]);
  const round = async (flock, on, dead, feed) => {
    const v = await one(U.manager, 'select public.save_flock_day($1, $2, $3, 0, $4, null, null, null, null, null, null, null, null, $5, false)', [flock, on, dead, feed, uid()]);
    if (v.status !== 'saved') throw new Error(`جولة ${on}: ${JSON.stringify(v)}`);
  };
  const weigh = (flock, on, count, avg) => one(U.manager, 'select public.record_flock_weight($1, $2, $3, $4, $5)', [flock, on, count, avg, uid()]);
  const scale = (siteId, on, stops) => ({ site_id: siteId, on_date: on, method: 'scale', empty_kg: '7000', empty_with_crates: true, crate_kg: null,
    stops: stops.map(([stopId, hallId, birds, gross]) => ({ id: stopId, hall_id: hallId, birds, crates: 10, gross_kg: gross, weighings: [] })) });
  const save = (user, ticketId, version, data) => call(db, user, SAVE, [ticketId, version, JSON.stringify(data)]);
  const finish = (user, ticketId, version) => call(db, user, FINISH, [uid(), ticketId, version]);
  /** تذكرة قبّان مكتملة بوقفة لكلّ [قاعة، طيور، صافٍ]: الفارغ 7,000 مع الأقفاص، والخابط تراكميّ. */
  const ticket = async (siteId, on, stops, user = U.manager) => {
    const ticketId = uid();
    let gross = 7000;
    const data = scale(siteId, on, stops.map(([hallId, birds, net]) => {
      gross += Number(net);
      return [uid(), hallId, birds, String(gross)];
    }));
    const saved = await save(user, ticketId, null, data);
    if (!saved.ok) throw new Error(`save: ${saved.code} ${saved.hint}`);
    const done = await finish(user, ticketId, 1);
    if (!done.ok) throw new Error(`finish: ${done.code} ${done.hint}`);
    return { id: ticketId, version: done.value.version, no: done.value.ticket_no };
  };
  const sellArgs = (tk, { price = '2000.00', paid = '0', account = null, sale = uid() } = {}) => [uid(), sale, tk.id, tk.version, trader, price, '0', paid, account, null];
  const form = (flock, user = U.manager) => one(user, 'select public.flock_close_form($1)', [flock]);
  /** معاملات الإغلاق كما ترسلها شاشته: الحيّ والمباع وما نزل لكلّ مادّة من نموذجها، وبصمته (plan) ما لم تُعطَ غيرها. */
  const closeArgs = (f, flock, on, { reason = null, lines = [], plan } = {}) => [uid(), uid(), flock, on, f.flock.live, f.sales.birds,
    JSON.stringify(f.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }))), reason, JSON.stringify(lines), null, plan === undefined ? f.plan : plan];
  const closeOk = async (flock, on, options = {}, user = U.manager) => {
    const result = await call(db, user, CLOSE, closeArgs(await form(flock, user), flock, on, options));
    if (!result.ok) throw new Error(`close_flock: ${result.code} ${result.hint}`);
    return result.value;
  };
  const back = (itemId, qty, wh) => ({ item_id: itemId, qty, action: 'return', warehouse_id: wh });
  const carry = (itemId, qty) => ({ item_id: itemId, qty, action: 'carry' });
  const used = (itemId, qty) => ({ item_id: itemId, qty, action: 'consumed' });
  const cardOf = (flock, user = U.manager) => one(user, 'select public.flock_sales($1)', [flock]);
  const report = (flock, user = U.manager) => one(user, 'select public.flock_cycle_report($1)', [flock]);
  const feedOf = (flock, user = U.manager) => one(user, 'select public.flock_feed($1)', [flock]);
  const hallsDay = (on, user = U.manager) => one(user, 'select public.halls_day($1)', [on]);
  const hallOf = (v, hallId) => v.sites.flatMap((s) => s.halls).find((h) => h.hall_id === hallId);
  const costs = async (flock) => (await admin('select coalesce(sum(amount), 0)::text as v from public.flock_costs where flock_id = $1', [flock]))[0].v;
  const broken = (fns, run) => mutant(db, U.manager, fns, run);
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(`${sql} as v`, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  /** كلّ public.verify_* داخل معاملة الطفرة: اسم الفحص ← عدد مخالفاته (غير الصفر وحده). */
  const verifyAll = async (q) => {
    const names = (await q("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'verify\\_%' order by 1")).rows
      .map((r) => r.proname);
    const bad = {};
    for (const name of names) {
      for (const r of (await q(`select check_name, violations::int as n from public.${name}() where violations <> 0`)).rows) bad[`${name}.${r.check_name}`] = r.n;
    }
    return bad;
  };
  /** ينتظر حتّى تنتهي الجلسة pid أو تُحبس على قفل تمسكه الجلسة blocker تحديداً (pg_blocking_pids)، لا أيّ انتظار (درس 2026-11-05). */
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
  const xBalance = async () => (await admin('select trim_scale(qty)::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [I.x, W.feed]))[0].q;
  /** بطاقات الفوج قبل إعادة الفتح وبعدها في الأقسام: [الإمكان، والسبب]. */
  const cards = {};
  const cardPair = (card) => [card.can.reopen, card.reopen_why];

  // ── C1/M1: إعادة الفتح بمدير نطاقه حقل أ تلغي إرجاعاً في «رصيد العلف» خارج نطاقه ─────────────────────────────────────────────────
  // FR1 (C1): FI 300 كغم من «رصيد العلف» (210,000.00)، والإغلاق يرجع 100 إليه (70,000.00) بالمالك: رصيده 20,000 − 300 + 100 = 19,800. المدير المحصور بحقل أ
  // يرى الفوج ولا يرى المخزن (in_scope_wh)، فإعادة الفتح out_of_scope كإلغاء الصرف من المخزن نفسه، ولا يتغيّر الرصيد ولا المستند؛ وبطاقته لا تعده بها.
  const h1 = await hall(siteA, 'قاعة النطاق');
  const F1 = await place(h1, day(-10), 100);
  await section('C1/M1: إعادة الفتح بنطاق مخزن الإرجاع', async () => {
    const fi = await issue(F1, I.x, '300', day(-5), W.feed, U.owner);
    const closed = await closeOk(F1, TODAY, { reason: 'فرق عند الإغلاق', lines: [back(I.x, '100', W.feed)] }, U.owner);
    const before = await xBalance();
    const scopes = [await one(U.scopedMgr, 'select public.in_scope_site($1)', [siteA]), await one(U.scopedMgr, 'select public.in_scope_wh($1)', [W.feed])];
    const voidFi = await call(db, U.scopedMgr, 'select public.void_flock_issue($1, $2, $3)', [fi.id, 'خطأ', uid()]);
    cards.c1 = { scoped: cardPair(await cardOf(F1, U.scopedMgr)), owner: cardPair(await cardOf(F1, U.owner)) };
    const reopened = await call(db, U.scopedMgr, REOPEN, [closed.id, 'أُغلقت خطأً', uid()]);
    const fr = (await admin('select status from public.flock_returns where close_id = $1', [closed.id]))[0].status;
    same([scopes, voidFi.code, reopened.ok ? 'ok' : reopened.code, reopened.hint, before, await xBalance(), fr, cards.c1],
      [[true, false], 'out_of_scope', 'out_of_scope', `المخزن «${feedName}» خارج نطاقك، فلا تسجّل فيه ولا تلغي منه.`, '19800', '19800', 'posted',
        { scoped: [false, 'out_of_scope'], owner: [true, null] }],
      'C1/M1: مدير حقل أ لا يُلغي الصرف من «رصيد العلف» ولا يعيد فتح دورة أرجعت إليه (out_of_scope قبل أن يُسمّى شيء)، فالرصيد 19,800 والمستند مرحَّل؛ وبطاقته لا تعده بإعادة الفتح، وبطاقة المالك تعده');
    samples.refusal_reopen_out_of_scope = { code: reopened.code, hint: reopened.hint };
  });

  // ── M2: إعادة الفتح في قاعة مؤرشفة (بلا منقول ولا فوج بعدها) كانت تُرجع فوجاً قائماً في قاعة مؤرشفة ─────────────────────────────────
  const h2 = await hall(siteA, 'قاعة الأرشيف');
  const F2 = await place(h2, day(-10), 100);
  await section('M2: لا إعادة فتح في قاعة مؤرشفة', async () => {
    const closed = await closeOk(F2, TODAY, { reason: 'فرق' });
    await one(U.owner, 'update public.halls set archived_at = now() where id = $1 returning id', [h2]);
    cards.m2 = cardPair(await cardOf(F2));
    const reopened = await call(db, U.manager, REOPEN, [closed.id, 'خطأ', uid()]);
    const status = (await admin('select status from public.flocks where id = $1', [F2]))[0].status;
    same([reopened.ok ? 'ok' : reopened.code, reopened.hint, status, cards.m2],
      ['hall_archived', 'القاعة «قاعة الأرشيف» مؤرشفة، فلا يُعاد فتح دورتها. أعِدها من الأرشيف أوّلاً.', 'closed', [false, 'hall_archived']],
      'M2: إعادة فتح دورة قاعة مؤرشفة hall_archived بعد قفل القاعة (كالتسكين)، والفوج مغلق كما هو، والبطاقة لا تعد بها');
    samples.refusal_reopen_hall_archived = { code: reopened.code, hint: reopened.hint };
  });

  // ── O1: دورة نُقل علفها ثمّ أُرجع إلى مخزن (ولا فوج بعدها، ولم يُسحب من الراجع) تُعاد (O5) ────────────────────────────────────────
  // FI 400 كغم «علف الإصلاح» (280,000.00)، والإغلاق أمس ينقل 150 (105,000.00)، ثمّ يُرجع المنقول اليوم (FR بمصدر النقل). إعادة الفتح: الإرجاعان يُلغيان
  // كإرجاع الإغلاق (حركته معكوسة على دفعته فتفرغ، وصفّ كلفته معكوس)، والسطر ملغى، فما نزل 400 كغم بـ280,000.00 = كلفة الفوج.
  const h3 = await hall(siteA, 'قاعة المنقول');
  const F3 = await place(h3, day(-10), 100);
  await section('O1: إعادة فتح دورة أُرجع منقولها', async () => {
    await issue(F3, I.x, '400', day(-6), W.feed);
    const closed = await closeOk(F3, day(-1), { reason: 'فرق', lines: [carry(I.x, '150')] });
    const returned = await one(U.manager, RETURN_CARRY, [uid(), id(1301), closed.lines[0].line_id, W.feed]);
    cards.o1 = cardPair(await cardOf(F3));
    const reopened = await call(db, U.manager, REOPEN, [closed.id, 'أُغلقت خطأً', uid()]);
    samples.reopen_flock_returned_carry = reopened.value;
    const fr = (await admin(`select r.status, trim_scale(s.qty_left)::text as qty_left from public.flock_returns r join public.flock_return_lines l on l.return_id = r.id
      join public.stock_lots s on s.id = l.lot_id where r.id = $1`, [id(1301)]))[0];
    const line = (await admin('select carry_status from public.flock_close_lines where id = $1', [closed.lines[0].line_id]))[0].carry_status;
    const f = await form(F3);
    same([returned.money?.value, cards.o1, reopened.ok ? 'ok' : reopened.code, reopened.value?.reversed_returns, reopened.value?.money, fr, line, f.flock.status, f.flock.live,
      f.items.map((i) => [i.pool_qty, i.money?.pool_value]), await costs(F3)],
    ['105000.00', [true, null], 'ok', 1, { returned_value: '105000.00', carried_value: '0' }, { status: 'void', qty_left: '0' }, 'void', 'active', 100,
      [['400', '280000.00']], '280000.00'],
    'O1: دورة أُرجع منقولها قبل التسكين تُعاد: إرجاع المنقول ملغى ودفعته فارغة والسطر ملغى، وما نزل 400 كغم بـ280,000.00 = كلفة الفوج، والفوج قائم بحيّه (البطاقة وعدت بها)');
  });
  // والراجع الذي سُحب منه يمنع (lot_consumed يسمّي الصرف الساحب): «علف السحب» 1,000 كغم فقط؛ F4 يأخذ 300 وينقل 100 تُرجَع، ثمّ صرف 800 لفوج آخر يسحب
  // الدفعتين كلتيهما (700 + الراجعة 100).
  const h4 = await hall(siteA, 'قاعة السحب');
  const F4 = await place(h4, day(-10), 100);
  const h5 = await hall(siteA, 'قاعة السحب الثانية');
  const F5 = await place(h5, day(-10), 100);
  await section('O1: الراجع المسحوب يمنع إعادة الفتح', async () => {
    await issue(F4, I.z, '300', day(-6), W.feed);
    const closed = await closeOk(F4, day(-1), { reason: 'فرق', lines: [carry(I.z, '100')] });
    await one(U.manager, RETURN_CARRY, [uid(), uid(), closed.lines[0].line_id, W.feed]);
    const drawn = await issue(F5, I.z, '800', TODAY, W.feed);
    cards.lot = cardPair(await cardOf(F4));
    const reopened = await call(db, U.manager, REOPEN, [closed.id, 'خطأ', uid()]);
    same([reopened.ok ? 'ok' : reopened.code, reopened.hint.includes(drawn.doc_no), cards.lot], ['lot_consumed', true, [false, 'lot_consumed']],
      `O1: سُحب من الراجع بالصرف ${drawn.doc_no}، فإعادة الفتح lot_consumed تسمّيه، والبطاقة لا تعد بها`);
    samples.refusal_reopen_lot_consumed = { code: reopened.code, hint: reopened.hint };
  });

  // ── M3: «ألغِ القبض» على مقبوض فاتورة الطيور (void_party_payment) والفاتورة مرحَّلة: المقبوض صفر بقاعدة 0021 ────────────────────────────
  // تذكرة أمس 500 طير بصافٍ 1,000 كغم × 2,000.00 = 2,000,000 مقبوضة كلّها في الصندوق، ثمّ يُردّ المقبوض: الفاتورة بالدين كلّها (paid_now 0،
  // payment_refunded)، والمتبقّي من قيدها 2,000,000، والكشف كذلك.
  const h6 = await hall(siteA, 'قاعة النقد');
  const F6 = await place(h6, day(-10), 1000);
  await section('M3: المقبوض الذي رُدّ', async () => {
    const tk = await ticket(siteA, day(-1), [[h6, 500, '1000']]);
    const sale = await one(U.accountant, SELL, sellArgs(tk, { paid: '2000000', account: box }));
    const pay = (await admin('select payment_entry_id from public.bird_sales where id = $1', [sale.id]))[0].payment_entry_id;
    await one(U.manager, 'select public.void_party_payment($1, $2, $3)', [pay, 'ردّ المبلغ للتاجر', uid()]);
    const ov = await one(U.accountant, 'select public.sales_overview($1, $2)', [day(-7), TODAY]);
    const row = ov.birds.rows.find((r) => r.id === sale.id);
    const posted = ov.birds.rows.filter((r) => r.status === 'posted');
    const sum = (list, f) => list.reduce((n, r) => n + BigInt(f(r)), 0n).toString();
    const det = await one(U.accountant, 'select public.bird_sale_detail($1)', [sale.id]);
    const st = await one(U.accountant, 'select public.party_statement_v2($1, null, $2, $3)', [trader, day(-7), TODAY]);
    const details = st.books.flatMap((b) => b.lines).map((l) => l.detail).filter((d) => d?.doc_id === sale.id);
    const invoice = details.find((d) => d.type === 'bird_sale');
    const payment = details.find((d) => d.type === 'bird_sale_payment');
    same([sale.money.paid_now, row.paid, row.payment_refunded, row.money.paid_now, ov.birds.totals.money.paid_now === sum(posted, (r) => r.money.paid_now),
      ov.birds.totals.money.credit === sum(posted, (r) => BigInt(r.money.total) - BigInt(r.money.paid_now)), det.money.paid_now, det.payment_refunded, det.remaining,
      invoice?.paid_now, invoice?.payment_refunded, payment?.payment_refunded],
    ['2000000', 'credit', true, '0', true, true, '0', true, '2000000', '0', true, true],
    'M3: بعد ردّ المقبوض الفاتورة بالدين كلّها في قائمة المبيعات ومجاميعها وتفصيلها والكشف (المقبوض صفر وpayment_refunded)، والمتبقّي 2,000,000');
    Object.assign(samples, { sales_overview_refunded: ov, bird_sale_detail_refunded: det, party_statement_v2_refunded: st });
  });

  // ── M4: بصمة ما في القاعة (كميةً وقيمةً) ─────────────────────────────────────────────────────────────────────────────────────────
  // «علف الإصلاح الثاني» 500 من «رصيد العلف» (300,000) و500 من «مخزن حقل أ» (450,000): ما نزل 1,000 بـ750,000.00 كما رآه النموذج. ثمّ يُلغى الأوّل ويُعاد
  // من مخزن الحقل: 1,000 بـ900,000.00 والكمية كما هي. الإغلاق بالنموذج القديم pool_changed (كان يرحّل إرجاع 500 بـ450,000.00 وقد عرض 375,000)، وبصمة بلا
  // سرّ الخادم أو بلا بصمة كذلك؛ والنموذج الجديد يُغلق (إرجاع النصف 450,000.00).
  const h7 = await hall(siteA, 'قاعة البصمة');
  const F7 = await place(h7, day(-10), 1000);
  await section('M4: البصمة', async () => {
    const first = await issue(F7, I.y, '500', day(-6), W.feed);
    await issue(F7, I.y, '500', day(-6), W.farm);
    const shown = await form(F7);
    const worker = await form(F7, U.worker);
    await one(U.owner, 'select public.void_flock_issue($1, $2, $3)', [first.id, 'من المخزن الخطأ', uid()]);
    await issue(F7, I.y, '500', TODAY, W.farm);
    const lines = [back(I.y, '500', W.farm)];
    const stale = await call(db, U.manager, CLOSE, closeArgs(shown, F7, TODAY, { reason: 'فرق', lines }));
    const forged = await call(db, U.manager, CLOSE, closeArgs(shown, F7, TODAY, { reason: 'فرق', lines,
      plan: createHash('md5').update(`${I.y}:1000.000:900000.00`).digest('hex') }));
    const missing = await call(db, U.manager, CLOSE, closeArgs(shown, F7, TODAY, { reason: 'فرق', lines, plan: null }));
    const fresh = await form(F7);
    samples.flock_close_form_plan = fresh;
    const closed = await call(db, U.manager, CLOSE, closeArgs(fresh, F7, TODAY, { reason: 'فرق', lines }));
    same([/^[0-9a-f]{32}$/u.test(shown.plan ?? ''), worker.plan === shown.plan, JSON.stringify(worker).includes('"money"'), shown.items.map((i) => [i.pool_qty, i.money?.pool_value]),
      stale.code, stale.hint, forged.code, missing.code, fresh.plan !== shown.plan, fresh.items.map((i) => [i.pool_qty, i.money?.pool_value]), closed.ok,
      closed.value?.lines?.map((l) => l.money?.value)],
    [true, true, false, [['1000', '750000.00']], 'pool_changed', 'تغيّر ما نزل للقاعة أو قيمته منذ فتحت الشاشة (صرف أو إلغاء أو إرجاع). حدّث الشاشة وراجع الباقي.',
      'pool_changed', 'pool_changed', true, [['1000', '900000.00']], true, ['450000.00']],
    'M4: البصمة نصّ معمًّى واحد لكلّ دور (عامل القاعة بلا مال)؛ والإغلاق بنموذج تغيّرت قيمته والكمية كما هي pool_changed، وبصمة بلا سرّ وبلا بصمة كذلك؛ والنموذج الجديد يُغلق بقيمته');
    samples.refusal_pool_changed_value = { code: stale.code, hint: stale.hint };
  });

  // ── O2/M5: «الباقي في القاعة» بتعريف واحد (left_in_hall_kg) في flock_feed ونموذج الإغلاق وتقرير الدورة (العلف والمؤشّرات والأيّام) والتقرير اليوميّ ──────
  // A: نزل 1,500 «علف الإصلاح» + 1,500 «الثاني» + 1,000 «الباقي» = 4,000، وأُكل 3,500 في جولتين؛ والإغلاق يرجع 100 ويحسب 150 مستهلَكاً وينقل 250: الباقي
  // 4,000 − 100 − 150 − 250 − 3,500 = 0. B في القاعة نفسها بعده: المنقول 250 يوم تسكينه، وأُكل 100: الباقي 150 (كان flock_feed يقول −100 والتقرير 500).
  const h8 = await hall(siteA, 'قاعة الباقي');
  const A = { flock: null, close: null };
  await at(day(-10), async () => {
    A.flock = await place(h8, day(-10), 1000);
    for (const [itemId, qty] of [[I.x, '1500'], [I.y, '1500'], [I.v, '1000']]) await issue(A.flock, itemId, qty, day(-10), W.feed);
  });
  await at(day(-8), async () => {
    await round(A.flock, day(-9), 0, '1750');
    await round(A.flock, day(-8), 0, '1750');
  });
  let B = null;
  await section('O2/M5: ما في القاعة', async () => {
    A.close = await closeOk(A.flock, day(-7), { reason: 'نهاية الدورة', lines: [back(I.x, '100', W.feed), used(I.y, '150'), carry(I.v, '250')] });
    const left = (feed, r, d, f) => [feed.left_in_hall_kg, feed.left_in_hall_unweighed, r.kpis.left_in_hall_kg, r.kpis.left_in_hall_unweighed, r.feed.left_in_hall_kg,
      r.days.at(-1).left_in_hall_kg, d?.left_in_hall_kg, f.feed.left_in_hall_kg];
    const aReport = await report(A.flock);
    samples.flock_cycle_report_left_in_hall = aReport;
    const aSide = left(await feedOf(A.flock), aReport, hallOf(await hallsDay(day(-7)), h8).flock, await form(A.flock));
    B = await place(h8, day(-6), 800);
    await round(B, day(-5), 0, '100');
    const bFeed = await feedOf(B);
    samples.flock_feed_left_in_hall = bFeed;
    const bReport = await report(B);
    const bSide = left(bFeed, bReport, hallOf(await hallsDay(TODAY), h8).flock, await form(B));
    same([aSide, bSide, bReport.days[0].left_in_hall_kg, hallOf(await hallsDay(day(-6)), h8).flock.left_in_hall_kg],
      [['0.000', 0, '0.000', 0, '0.000', '0.000', '0.000', '0.000'], ['150.000', 0, '150.000', 0, '150.000', '150.000', '150.000', '150.000'], '250.000', '250.000'],
      'O2/M5: ما في القاعة واحد في flock_feed وتقرير الدورة (المؤشّرات والعلف وآخر يوم) والتقرير اليوميّ ونموذج الإغلاق: المغلقة صفر حين لكلّ باقٍ مصير، والتالية تعدّ منقولها (250 يوم تسكينها، و150 بعد أكل 100)');
  });

  // ── O3: فروق العدّ بأسبابها: يدويّ −10 قبل ثلاثة أيّام (طيور مسروقة) والإغلاق −490 بسببه؛ وكان التقرير يقول −500 بسبب الإغلاق وحده ─────────────────
  const h9 = await hall(siteA, 'قاعة العدّ');
  const C = await place(h9, day(-10), 500);
  await section('O3: فروق العدّ', async () => {
    await one(U.manager, ADJUST, [uid(), uid(), C, day(-3), -10, 'طيور مسروقة', 500]);
    await closeOk(C, TODAY, { reason: 'فرق نهاية الدورة' });
    const r = await report(C);
    const before = await hallsDay(day(-3));
    samples.flock_cycle_report_count_diffs = r;
    samples.halls_day_count_diffs = before;
    same([r.count_diffs, r.birds.count_diff, r.birds.count_reason, hallOf(before, h9).flock.count_diffs, hallOf(await hallsDay(TODAY), h9).flock.count_diffs],
      [[{ on: day(-3), birds: -10, reason: 'طيور مسروقة', source: 'manual' }, { on: TODAY, birds: -490, reason: 'فرق نهاية الدورة', source: 'close' }], -500, 'فرق نهاية الدورة',
        [{ birds: -10, reason: 'طيور مسروقة', source: 'manual' }], [{ birds: -490, reason: 'فرق نهاية الدورة', source: 'close' }]],
      'O3: تقرير الدورة يعدّد فروق العدّ الحيّة بيومها وعددها وسببها ومصدرها (يدويّ ثمّ الإغلاق)، والتقرير اليوميّ يعرض فرق يومه بسببه');
  });

  // ── O6: البطاقة لا تعد بإعادة فتح يرفضها reopen_flock حتماً: فوج جديد في القاعة (A بعد تسكين B) ومعه النقل المطبَّق، والقاعة المؤرشفة، والمخزن خارج
  // النطاق، والراجع المسحوب (الأقسام السابقة)؛ وما يُعاد (O1 قبل إعادته) تعده ─────────────────────────────────────────────────────────────
  await section('O6: إمكان إعادة الفتح', async () => {
    const card = await cardOf(A.flock);
    samples.flock_sales_reopen_blocked = card;
    const reopened = await call(db, U.manager, REOPEN, [A.close.id, 'خطأ', uid()]);
    same([cardPair(card), reopened.code, cards.c1?.scoped, cards.m2, cards.lot, cards.o1],
      [[false, 'hall_reused'], 'hall_reused', [false, 'out_of_scope'], [false, 'hall_archived'], [false, 'lot_consumed'], [true, null]],
      'O6: can.reopen كاذب حين يرفض reopen_flock حتماً (فوج جديد في القاعة، ومخزن خارج النطاق، وقاعة مؤرشفة، وراجع مسحوب) وreopen_why يقول لماذا، وصادق لما يُعاد');
  });

  // ── O7: بعد بيع الكلّ يبدأ اليوم بلا طير حيّ: لا جولة ولا علف ينتظره، فمعامل التحويل يُحسب ─────────────────────────────────────────────
  // S: 100 طير يوم −6، وجولات −6 و−5 و−4 بعلف 10 كغم لكلّ منها ووزن 2,300 غم، وتذكرة يوم −4 بـ100 طير وصافٍ 230 كغم تُفوتر: الحيّ صفر بعدها. الأيّام
  // اللازمة 3 (لا 6)، والمعامل 30 كغم × 1,000 ÷ (230 كغم × 1,000) = 0.1304 ← 0.130، والأيّام −3 إلى اليوم لا تنتظر جولة.
  const h10 = await hall(siteA, 'قاعة البيع الكلّيّ');
  const S = await place(h10, day(-6), 100);
  await section('O7: يوم بلا طير حيّ', async () => {
    for (const on of [day(-6), day(-5), day(-4)]) await round(S, on, 0, '10');
    await weigh(S, day(-4), 50, '2300.0');
    const tk = await ticket(siteA, day(-4), [[h10, 100, '230']]);
    await one(U.accountant, SELL, sellArgs(tk));
    const r = await report(S);
    samples.flock_cycle_report_zero_live = r;
    const detail = (await one(U.manager, 'select public.flock_detail($1)', [S])).flock;
    const v = await hallsDay(day(-2));
    samples.halls_day_zero_live = v;
    const siteRow = v.sites.find((x) => x.id === siteA);
    const expected = siteRow.halls.filter((h) => h.flock?.expects_round).length;
    const f = await form(S);
    same([pick(r.kpis, ['feed_days', 'feed_span', 'fcr', 'live']), r.days.map((d) => [d.on, d.expects_round]), r.weeks.map((w) => [w.days, w.round_days, w.expected_days]),
      pick(detail, ['feed_days', 'feed_span_days', 'fcr']), [hallOf(v, h10).flock.expects_round, siteRow.totals.rounds_expected === expected,
        siteRow.totals.rounds_expected === siteRow.totals.flocks - 1], [f.feed.feed_days, f.feed.feed_span]],
    [{ feed_days: 3, feed_span: 3, fcr: '0.130', live: 0 }, [[day(-6), true], [day(-5), true], [day(-4), true], [day(-3), false], [day(-2), false], [day(-1), false], [TODAY, false]],
      [[7, 3, 3]], { feed_days: 3, feed_span_days: 3, fcr: '0.130' }, [false, true, true], [3, 3]],
    'O7: بعد بيع الكلّ الأيّام بلا طير حيّ لا تنتظر جولة ولا علفاً: أيّام العلف اللازمة 3 = المسجّلة فمعامل التحويل 0.130 (التقرير وصفحة الفوج والنموذج)، والأسبوع ينتظر 3 من 7، والتقرير اليوميّ لا يعدّه');
  });

  // ── O8/C6: اليوم المقترح للإغلاق لا يسبق أقدم يوم مسموح (آخر نشاط قبل عشرة أيّام) ────────────────────────────────────────────────
  const h11 = await hall(siteA, 'قاعة اليوم المقترح');
  const Dd = await place(h11, day(-20), 100);
  await section('O8/C6: اليوم المقترح', async () => {
    await at(day(-10), () => round(Dd, day(-10), 0, '5'));
    const f = await form(Dd);
    const closed = await call(db, U.manager, CLOSE, closeArgs(f, Dd, f.default_on, { reason: 'فرق' }));
    same([f.earliest_on, f.default_on, closed.ok ? 'ok' : closed.code], [day(-7), day(-7), 'ok'],
      'O8/C6: آخر نشاط قبل عشرة أيّام: أقدم يوم مسموح قبل سبعة، واليوم المقترح مقصوص إليه، والإغلاق به يُقبل');
  });

  // ── C2: معرّف وقفة من الجهاز لتذكرتين جديدتين بلحظة واحدة ─────────────────────────────────────────────────────────────────────
  // C يمسك فوج «المعرّف 1» (فرق عدّ لم يثبت)؛ B يحفظ تذكرة TB بوقفة S فيه فيُحبس على الفوج بعد أن أخذ قفل S؛ A يحفظ تذكرة TA بالوقفة S في «المعرّف 2» فيُحبس على B
  // (قفل المعرّف) لا يعبر الفحص؛ ثمّ يثبت C فـB فيُرفض A بـid_conflict، والوقفة لـTB بقاعتها وطيورها. (كان A يكتبها لـTA ثمّ يكتب B فوقها بقاعته.)
  const hX = await hall(siteA, 'قاعة المعرّف 1');
  const FX = await place(hX, day(-10), 100);
  const hY = await hall(siteA, 'قاعة المعرّف 2');
  await place(hY, day(-10), 100);
  await section('C2: معرّف الوقفة', async () => {
    const stopId = id(1101);
    const TA = id(1102);
    const TB = id(1103);
    const c = await db.session(U.manager);
    const b = await db.session(U.siteWorker);
    const a = await db.session(U.siteWorker);
    try {
      const held = await c.run(`${ADJUST} as v`, [uid(), uid(), FX, TODAY, 5, 'زيادة', 100]);
      const pendingB = b.run(`${SAVE} as v`, [TB, null, JSON.stringify(scale(siteA, TODAY, [[stopId, hX, 30, '7060']]))]);
      const stateB = await settleOn(pendingB, b.pid, c.pid);
      const pendingA = a.run(`${SAVE} as v`, [TA, null, JSON.stringify(scale(siteA, TODAY, [[stopId, hY, 10, '7020']]))]);
      const stateA = await settleOn(pendingA, a.pid, b.pid);
      let first = null;
      if (stateA === 'finished') {
        first = await pendingA;
        if (first.ok) await a.commit();
        else await a.rollback();
      }
      await c.commit();
      const second = await pendingB;
      if (second.ok) await b.commit();
      else await b.rollback();
      if (first === null) {
        first = await pendingA;
        if (first.ok) await a.commit();
        else await a.rollback();
      }
      const rows = await admin('select ticket_id, hall_id, birds from public.weigh_ticket_stops where id = $1', [stopId]);
      same([held.ok, stateB, stateA, second.ok, first.ok ? 'ok' : first.error, rows], [true, 'blocked', 'blocked', true, 'id_conflict', [{ ticket_id: TB, hall_id: hX, birds: 30 }]],
        'C2: حفظان لتذكرتين جديدتين بمعرّف وقفة واحد: الثاني ينتظر قفل المعرّف ثمّ id_conflict، والوقفة للأوّل بقاعته وطيوره');
    } finally {
      await c.rollback();
      await b.rollback();
      await a.rollback();
    }
    // وبلا الفحص المسبق (طفرة): التحديث بالمعرّف مقصور على صفّ التذكرة نفسها، فمعرّف تذكرة أخرى صفر صفوف = id_conflict، ووقفتها كما هي.
    const T1 = id(1111);
    const stop = id(1113);
    await one(U.siteWorker, SAVE, [T1, null, JSON.stringify(scale(siteA, TODAY, [[stop, hX, 10, '7020']]))]);
    const blind = await broken([[SIG.save, [['  if exists (select 1 from public.weigh_ticket_stops y where y.id = any (v_ids) and y.ticket_id <> p_ticket)',
      '  if false and exists (select 1 from public.weigh_ticket_stops y where y.id = any (v_ids) and y.ticket_id <> p_ticket)']]]], async ({ attempt, oq }) => {
      const v = await inside(attempt, U.siteWorker, SAVE, [id(1112), null, JSON.stringify(scale(siteA, TODAY, [[stop, hY, 20, '7040']]))]);
      const row = (await oq('select ticket_id, hall_id, birds from public.weigh_ticket_stops where id = $1', [stop])).rows[0];
      return [v?.code ?? 'ok', row];
    });
    same(blind, ['id_conflict', { ticket_id: T1, hall_id: hX, birds: 10 }], 'C2: بلا الفحص المسبق يمسكه التحديث المقصور على التذكرة (صفر صفوف = id_conflict)، فلا تُكتب وقفة تذكرة أخرى');
    await one(U.siteWorker, VOID_TICKET, [T1, null, uid()]);
    await one(U.siteWorker, VOID_TICKET, [id(1103), null, uid()]);
  });

  // ── C4: عامل حقل أ يحفظ على تذكرة حقل ب (مكتملة ومسوّدة): out_of_scope قبل قفلها وقبل أن تُسمّى ─────────────────────────────────────────
  const hB1 = await hall(siteB, 'قاعة ب1');
  await place(hB1, day(-20), 1000);
  const hA = await hall(siteA, 'قاعة أ-تذكرة');
  await place(hA, day(-10), 100);
  let TBdone = null;
  await section('C4: نطاق التذكرة القائمة', async () => {
    TBdone = await ticket(siteB, TODAY, [[hB1, 100, '200']]);
    const draftB = uid();
    await one(U.manager, SAVE, [draftB, null, JSON.stringify(scale(siteB, TODAY, [[uid(), hB1, 50, '7100']]))]);
    const payload = scale(siteA, TODAY, [[uid(), hA, 10, '7020']]);
    const onDone = await save(U.siteWorker, TBdone.id, TBdone.version, payload);
    const onDraft = await save(U.siteWorker, draftB, 1, payload);
    same([onDone.code, onDone.hint.includes(TBdone.no), onDraft.code, onDraft.hint], ['out_of_scope', false, 'out_of_scope', 'حقل هذه التذكرة خارج نطاقك. اطلب من مالك المنشأة إضافته إلى نطاقك.'],
      'C4: الحفظ على تذكرة حقل آخر (مكتملة أو مسوّدة) out_of_scope بلا رقمها، لا ticket_not_draft ولا site_fixed');
    await one(U.manager, VOID_TICKET, [draftB, null, uid()]);
  });

  // ── C5 وO4 (الدفتر خارج النطاق): السعر المقترح من حقول نطاق القارئ وحدها، والمحاسب بنطاق حقل لا يُعرض عليه ترحيل يرفضه الدفتر ───────────────────
  const hA2 = await hall(siteA, 'قاعة أ-سعر');
  await place(hA2, day(-10), 100);
  await section('C5: السعر المقترح بالنطاق', async () => {
    await one(U.manager, SELL, sellArgs(TBdone, { price: '9876.54' }));
    const TA = await ticket(siteA, TODAY, [[hA2, 10, '20']], U.siteWorker);
    const scoped = await one(U.scopedAcc, 'select public.bird_sale_form($1)', [TA.id]);
    samples.bird_sale_form_out_of_scope = scoped;
    const full = await one(U.accountant, 'select public.bird_sale_form($1)', [TA.id]);
    const inScope = (await admin(`select unit_price::text as p from public.bird_sales where org_id = $1 and site_id = $2 and status = 'posted'
      order by sold_on desc, posted_at desc, id limit 1`, [org, siteA]))[0]?.p ?? null;
    const post = await call(db, U.scopedAcc, SELL, sellArgs(TA));
    same([scoped.suggested_price === inScope, scoped.suggested_price !== '9876.54', full.suggested_price, [scoped.invoiceable, scoped.why, scoped.can_post],
      [full.invoiceable, full.why, full.can_post], post.code],
    [true, true, '9876.54', [false, 'out_of_scope', false], [true, null, true], 'out_of_scope'],
    'C5: السعر المقترح لمحاسب حقل أ من فواتير حقله وحدها (لا 9,876.54 من حقل ب)، والمحاسب بلا نطاق يراه؛ وO4: دفتر الوحدة خارج نطاقه فلا يُعرض عليه الترحيل (why out_of_scope) والترحيل يرفضه');
    await one(U.manager, VOID_TICKET, [TA.id, 'تذكرة فحص', uid()]);
  });

  // ── C7: التلميحات: مسوّدة حُذفت (بلا رقم)، وقاعة مجهولة، وعدد أقفاص سالب ─────────────────────────────────────────────────────────
  const hC7 = await hall(siteA, 'قاعة التلميح');
  await place(hC7, day(-10), 100);
  await section('C7: التلميحات', async () => {
    const T = id(1401);
    const data = scale(siteA, TODAY, [[uid(), hC7, 10, '7020']]);
    await one(U.siteWorker, SAVE, [T, null, JSON.stringify(data)]);
    await one(U.siteWorker, VOID_TICKET, [T, null, uid()]);
    const saved = await save(U.siteWorker, T, 2, data);
    const done = await finish(U.siteWorker, T, 2);
    const ghost = uid();
    const unknown = await save(U.siteWorker, uid(), null, scale(siteA, TODAY, [[uid(), ghost, 10, '7020']]));
    const twice = await save(U.siteWorker, uid(), null, scale(siteA, TODAY, [[uid(), ghost, 10, '7020'], [uid(), ghost, 10, '7040']]));
    const crates = scale(siteA, TODAY, [[uid(), hC7, 10, '7020']]);
    crates.stops[0].crates = -3;
    const negative = await save(U.siteWorker, uid(), null, crates);
    same([saved.code, saved.hint, done.code, done.hint, unknown.code, unknown.hint, twice.code, negative.code, negative.hint],
      ['ticket_not_draft', 'حُذفت هذه المسوّدة، فلا تُعدَّل. أنشئ تذكرة جديدة.', 'ticket_not_draft', 'حُذفت هذه المسوّدة، فلا تُعدَّل. أنشئ تذكرة جديدة.',
        'hall_not_found', 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.', 'hall_not_found', 'bad_count', 'عدد أقفاص القاعة من صفر إلى 100,000.'],
      'C7: المسوّدة المحذوفة بتلميحها (لا «التذكرة  اكتملت»)، والقاعة المجهولة hall_not_found (ومكرّرةً كذلك، لا «القاعة «» »)، والأقفاص بتلميحها');
    Object.assign(samples, { refusal_ticket_draft_deleted: { code: saved.code, hint: saved.hint }, refusal_hall_not_found: { code: unknown.code, hint: unknown.hint } });
  });

  // ── M7 وM8 وM9: ثوابت جديدة، لكلّ واحد طفرة دالّة معقولة تكسر القاعدة داخل معاملة ترجع فيمسكها فحصه ───────────────────────────────────────
  const hm1 = await hall(siteA, 'قاعة الإيراد 1');
  const Fm1 = await place(hm1, day(-10), 1000);
  const hm2 = await hall(siteA, 'قاعة الإيراد 2');
  await place(hm2, day(-10), 1000);
  await section('M7: لقطة مال الإغلاق', async () => {
    // تذكرة بقاعتين (2,000 و3,000 كغم) × 2,000.00 = 10,000,000: إيراد «الإيراد 1» 4,000,000. طفرة: لقطة الإيراد بمبلغ الفاتورة كلّها (10,000,000).
    const tk = await ticket(siteA, day(-1), [[hm1, 1000, '2000'], [hm2, 1000, '3000']]);
    await one(U.accountant, SELL, sellArgs(tk));
    const f = await form(Fm1);
    const seen = await broken([[SIG.close, [['(select coalesce(sum(s.revenue), 0) from public.bird_sale_sources s join public.bird_sales b',
      '(select coalesce(sum(b.total), 0) from public.bird_sale_sources s join public.bird_sales b']]]], async ({ attempt, oq }) => {
      const v = await inside(attempt, U.manager, CLOSE, closeArgs(f, Fm1, TODAY));
      return { revenue: v?.money?.revenue, bad: await verifyAll(oq) };
    });
    same([seen.revenue, seen.bad['verify_flock_close.close_values'] > 0], ['10000000', true], 'طفرة M7 (لقطة الإيراد بمبلغ الفاتورة كلّها): يمسكها close_values');
  });
  const hm3 = await hall(siteA, 'قاعة المخزن الخطأ');
  const Fm3 = await place(hm3, day(-10), 1000);
  await section('M8: مخزن الإرجاع', async () => {
    // «علف الإصلاح» 1,000 كغم من «مخزن حقل أ»؛ طفرة: الإغلاق بلا not_from_store يرجع 500 إلى «رصيد العلف» الذي لم يأتِ منه.
    await issue(Fm3, I.x, '1000', day(-6), W.farm);
    const f = await form(Fm3);
    const seen = await broken([[SIG.close, [["if a ->> 'action' = 'return' and not exists (select 1 from private.flock_item_lots(f.id, i.id) as z where z.warehouse_id = (a ->> 'warehouse_id')::uuid) then",
      'if false then']]]], async ({ attempt, oq }) => {
      const v = await inside(attempt, U.manager, CLOSE, closeArgs(f, Fm3, TODAY, { reason: 'فرق', lines: [back(I.x, '500', W.feed)] }));
      return { status: v?.status, bad: await verifyAll(oq) };
    });
    same([seen.status, seen.bad['verify_flock_close.return_store'] > 0], ['closed', true], 'طفرة M8 (إرجاع إلى مخزن لم يأتِ منه): يمسكها return_store');
  });
  const hm4 = await hall(siteA, 'قاعة العكس 1');
  const Fm4 = await place(hm4, day(-10), 1000);
  const hm5 = await hall(siteA, 'قاعة العكس 2');
  const Fm5 = await place(hm5, day(-10), 1000);
  await section('M9: عكس العدد', async () => {
    // فاتورة لقاعتين (100 و200 طير)؛ طفرة: إلغاؤها يعيد طيور القاعتين إلى فوج واحد (أصغر المعرّفين).
    const tk = await ticket(siteA, day(-1), [[hm4, 100, '200'], [hm5, 200, '400']]);
    const sale = await one(U.accountant, SELL, sellArgs(tk));
    const seen = await broken([[SIG.voidSale, [['values (c.org_id, c.flock_id, c.hall_id, c.site_id, c.division_id, v_today, c.kind, -c.birds, -c.net_kg',
      `values (c.org_id, (select zz.flock_id from public.bird_sale_sources zz where zz.sale_id = c.doc_id order by zz.flock_id limit 1), (select yy.hall_id from public.flocks yy where yy.id = (select zz.flock_id from public.bird_sale_sources zz where zz.sale_id = c.doc_id order by zz.flock_id limit 1)), c.site_id, c.division_id, v_today, c.kind, -c.birds, -c.net_kg`]]]],
    async ({ attempt, oq }) => {
      const v = await inside(attempt, U.manager, 'select public.void_bird_sale($1, $2, $3)', [sale.id, 'خطأ', uid()]);
      const lives = (await oq('select private.flock_live(f)::int as live from public.flocks f where f.id in ($1, $2) order by f.id', [Fm4, Fm5])).rows.map((r) => r.live);
      return { status: v?.status, lives, bad: await verifyAll(oq) };
    });
    // أيّ الفوجين «أصغر» يتبع المعرّفين العشوائيّين: 1,200 و800 أو 1,100 و900؛ والمجموع 2,000 ولا واحد منهما 1,000.
    same([seen.status, seen.lives[0] + seen.lives[1], seen.lives.includes(1000), seen.bad['verify_bird_sales.count_reversals'] > 0], ['void', 2000, false, true],
      'طفرة M9 (العكس إلى فوج آخر): طيور الفاتورة تعود إلى فوج واحد (الحيّ ليس 1,000 و1,000)، فيمسكها count_reversals');
  });

  // ── S1 وS9: يوم الخادم وأقدم يوم يقبله فرق العدّ في البطاقة، ويوم إلغاء الفاتورة في تفصيلها ─────────────────────────────────────────────
  const hv = await hall(siteA, 'قاعة الإلغاء');
  await place(hv, day(-10), 1000);
  await section('S1 وS9: أيّام الخادم', async () => {
    const recent = await cardOf(S);
    const older = await cardOf(F6);
    samples.flock_sales_server_days = older;
    const tk = await ticket(siteA, day(-1), [[hv, 100, '200']]);
    const sale = await one(U.accountant, SELL, sellArgs(tk));
    await one(U.manager, 'select public.void_bird_sale($1, $2, $3)', [sale.id, 'سعر خاطئ', uid()]);
    const det = await one(U.manager, 'select public.bird_sale_detail($1)', [sale.id]);
    same([recent.today, recent.earliest_on, older.today, older.earliest_on, det.sold_on, det.status, det.voided_on], [TODAY, day(-6), TODAY, day(-7), day(-1), 'void', TODAY],
      'S1: البطاقة بيوم الخادم وأقدم يوم لفرق العدّ (التسكين قبل ستّة أيّام، وإلّا سبعة)؛ S9: تفصيل الفاتورة الملغاة بيوم إلغائها في الخادم');
  });

  // ── O4 (الأيّام السبعة): تذكرة مكتملة قبل ثمانية أيّام لا تُفوتر بيومها، فلا يعدها نموذج الفاتورة ولا التذكرة ولا قائمتا «بانتظار الفاتورة» ─────────────
  const ho = await hall(siteA, 'قاعة التذكرة القديمة');
  await place(ho, day(-20), 1000);
  await section('O4: تذكرة أقدم من سبعة أيّام', async () => {
    const old = await at(day(-8), () => ticket(siteA, day(-8), [[ho, 100, '200']]));
    const f = await one(U.accountant, 'select public.bird_sale_form($1)', [old.id]);
    const wt = await one(U.accountant, 'select public.weigh_ticket($1)', [old.id]);
    const list = await one(U.accountant, 'select public.weigh_tickets(null, null, $1)', ['awaiting']);
    const ov = await one(U.accountant, 'select public.sales_overview($1, $2)', [day(-30), TODAY]);
    const row = list.rows.find((r) => r.id === old.id);
    const waiting = ov.birds.awaiting.find((r) => r.ticket_id === old.id);
    const post = await call(db, U.accountant, SELL, sellArgs(old));
    Object.assign(samples, { bird_sale_form_too_old: f, weigh_ticket_too_old: wt, weigh_tickets_awaiting_too_old: list,
      refusal_date_too_old_ticket: { code: post.code, hint: post.hint } });
    same([[f.invoiceable, f.why, f.can_post], [wt.can.invoice, wt.invoice_why], [row?.invoiceable, row?.invoice_why], list.totals.invoiceable === list.rows.filter((r) => r.invoiceable).length,
      [waiting?.invoiceable, waiting?.why], post.code, post.hint],
    [[false, 'too_old', false], [false, 'too_old'], [false, 'too_old'], true, [false, 'too_old'], 'date_too_old',
      `التذكرة ${old.no} بيوم ${dmy(day(-8))}، والفاتورة تُكتب بيوم تذكرتها، ولا يُقبل يوم أقدم من 7 أيام (أقدمه ${dmy(day(-7))})، فلا تُصدر فاتورتها الآن.`],
    'O4: تذكرة قبل ثمانية أيّام: النموذج والتذكرة وقائمتا الانتظار لا تعرض فاتورتها (too_old)، والترحيل يرفضها بجملة تسمّي التذكرة ويومها');
    await one(U.manager, VOID_TICKET, [old.id, 'لم تُفوتر في وقتها', uid()]);
  });

  // ── O4 (الفترة المقفلة، آخر الملف): تذكرة قبل ثلاثة أيّام ثمّ تُقفل الحسابات حتى أوّل أمس ─────────────────────────────────────────────
  const hp = await hall(siteA, 'قاعة الفترة المقفلة');
  await place(hp, day(-10), 100);
  await section('O4: الفترة المقفلة', async () => {
    const locked = await ticket(siteA, day(-3), [[hp, 10, '20']]);
    await one(U.owner, 'select public.set_period_lock($1)', [day(-2)]);
    try {
      const f = await one(U.accountant, 'select public.bird_sale_form($1)', [locked.id]);
      const post = await call(db, U.accountant, SELL, sellArgs(locked));
      samples.refusal_period_locked_ticket = { code: post.code, hint: post.hint };
      same([[f.invoiceable, f.why, f.can_post], post.code, post.hint], [[false, 'period_locked', false], 'period_locked',
        `التذكرة ${locked.no} بيوم ${dmy(day(-3))}، والفاتورة تُكتب بيوم تذكرتها، والحسابات مقفلة حتى ${dmy(day(-2))}، فلا تُصدر فاتورتها. إن كان اليوم صحيحاً فاطلب من مالك المنشأة فتح الفترة.`],
      'O4: تذكرة في فترة مقفلة لا يعدها النموذج (period_locked) والترحيل يرفضها بجملة تسمّي التذكرة ويومها');
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

/** مفاتيح كائن بأسمائها (والغائب null). */
function pick(object, keys) {
  return Object.fromEntries(keys.map((k) => [k, object?.[k] ?? null]));
}
