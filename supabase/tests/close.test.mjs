// إغلاق الدورة (0028، العقد contract-0028 §9، الجزء db-b): الإغلاق وإعادة الفتح والعلف المنقول، وقرّاء 0027 بعدها.
// الأرقام الذهبية بالضبط بلا سماح: G5 (القاعدة ١٦: قيمة الراجع والمنقول من معدّل المادّة في القاعة، والدفعة الراجعة بأصغر ترتيب وأقرب انتهاء، والصرف
// التالي يسحبها أوّلاً)، وG6 وG7 (المؤشّرات النهائية: معدّل وزن البيع وعمره ومعامل التحويل النهائيّ ومؤشّر الإنتاج، وفرق العدّ خارج النفوق)، وG9 (العلف
// المنقول على القاعة الفارغة، ثمّ في الفوج التالي يوم تسكينه، والمنقول الذي يرجع إلى مخزن قبل التسكين بقيمته المنقولة). والسباقات بجلستين حقيقيتين تُنتظر
// فيهما الجلسة المسمّاة على قفل الأخرى بعينها (pg_blocking_pids، درس 2026-11-05): R2 (صرف وإغلاق) وR3 (فاتورة وإغلاق) وR4 (إلغاء فاتورة وإغلاق) وR5 (تسكين
// وإرجاع المنقول) وR6 (إعادة فتح وتسكين) وR10 (حفظ تذكرة وإغلاق)، كلّ واحد بالترتيبين. والطفرات داخل معاملة صاحب الجداول ترجع (purchase-kit mutant): كلّ
// طفرة تطبيق بديل معقول يكسر القاعدة فعلاً ويمسكه فحصه، وتكمل طفرات birds.test (M1–M10): M11 الإغلاق يتجاهل التذاكر المعلّقة، وM12 الراجع بكلفة آخر صرف،
// وM13 الدفعة الراجعة بترتيب جديد، وM14 التسكين يطبّق نقل قاعة أخرى، وM15 إعادة الفتح بعد استعمال المنقول، وM16 إلغاء فاتورة على دورة مغلقة، وM17 معامل
// التحويل النهائيّ من الجولات، وM18 مؤشّر الإنتاج بعمر الإغلاق، وM19 الحيّ في أيّام التقرير بلا العدد، وM20 المنقول المُرجَع يُطرح مرّتين ممّا نزل، وM21 إعادة
// الفتح تعدّ القائم وحده فوجاً جديداً. وضابط لكلّ فحص من فحوص verify_flock_close العشرة (خرق مثبَّت يبين في فحصه وحده)، وطفرة الفحص 8 في verify_stock.
// وقرّاء 0027 (halls_day وflock_cycle_report وflock_cycles) يُقارنون بأجسام 0027 نفسها (من rollback_0028.sql حرفاً بحرف) على فوج بلا بيع ولا إغلاق:
// المفاتيح القديمة بقيمها نفسها، والجديدة وحدها زائدة (وضابط يثبت أنّ المقارنة تمسك مفتاحاً قديماً تغيّر). وإصلاح في الهجرة بفحص فشل قبله: إعادة الإغلاق
// بالمعرّف تقارن سبب فرق العدّ أيضاً (كانت ترجع «حُفظ» بسبب غير المحفوظ). منشأة هذا الملف وحدها: المعرّفات c2810000 والهواتف 96477028100. كلّ قسم
// بـsection: رمية فيه فحص فاشل باسمه ولا توقف الملف. الحساب باليد بالتعليق جنب كلّ رقم.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, canon, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
const TODAY = '2026-11-12';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dmy = (on) => `${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}`;
const id = (n) => `c2810000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028100${String(n).padStart(2, '0')}`;

const SIG = {
  close: 'public.close_flock(uuid, uuid, uuid, date, integer, integer, jsonb, text, jsonb, text)',
  reopen: 'public.reopen_flock(uuid, text, uuid)',
  open: 'public.open_flock(uuid, date, integer, integer, text, uuid)',
  voidSale: 'public.void_bird_sale(uuid, text, uuid)',
  returnPost: 'private.flock_return_post(uuid, public.flocks, uuid, uuid, numeric, numeric, date, text, uuid, uuid, text, numeric, numeric, text, uuid)',
  pool: 'private.flock_item_pool(uuid)',
  report: 'public.flock_cycle_report(uuid)',
  days: 'private.report_days(public.flocks, date)',
  reportDay: 'private.report_day(public.flocks, date, date)',
};
const CLOSE = 'select public.close_flock($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10)';
const REOPEN = 'select public.reopen_flock($1, $2, $3)';
const RETURN_CARRY = 'select public.return_hall_carry($1, $2, $3, $4)';
const OPEN = 'select public.open_flock($1, $2, $3, 0, null, $4)';
const ISSUE = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8)';
const SELL = 'select public.record_bird_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)';
const VOID_SALE = 'select public.void_bird_sale($1, $2, $3)';
const SAVE_TICKET = 'select public.save_weigh_ticket($1, $2, $3::jsonb)';

// مفاتيح 0028 الجديدة في قرّاء 0027 (العقد §6): تُنزع من جواب 0028 فيبقى جواب 0027 حرفاً بحرف لفوج بلا بيع ولا إغلاق.
const NEW_KEYS = {
  hall: ['carry'],
  dayFlock: ['sold', 'sold_net_kg', 'count_diff', 'ticketed', 'feed_carry_in_kg', 'feed_out_kg', 'feed_out_unweighed', 'feed_out_cum_unweighed'],
  totals: ['sold', 'count_diff', 'ticketed'],
  report: ['sales', 'close', 'carry_in'],
  birds: ['sold', 'sold_net_kg', 'count_diff', 'count_reason'],
  reportDay: ['sold', 'sold_net_kg', 'sold_cum', 'sold_cum_net_kg', 'count_diff', 'count_diff_cum', 'feed_carry_in_kg', 'feed_out_kg', 'feed_out_unweighed',
    'feed_out_cum_kg', 'feed_out_cum_unweighed'],
  kpis: ['sold_birds', 'sold_net_kg', 'sold_avg_kg', 'sale_age', 'count_diff', 'feed_carry_in_kg', 'feed_out_kg', 'feed_net_kg', 'fcr_final', 'epef_final'],
  money: ['returned', 'carried_in', 'carried_out', 'revenue'],
  cycle: ['sold_birds', 'count_diff'],
};
const without = (object, keys) => (object && typeof object === 'object' ? Object.fromEntries(Object.entries(object).filter(([k]) => !keys.includes(k))) : object);
const pick = (object, keys) => Object.fromEntries(keys.map((k) => [k, object?.[k]]));
/** جواب halls_day بلا مفاتيح 0028. */
const dayAs0027 = (v) => ({
  ...v,
  sites: v.sites.map((s) => ({
    ...s,
    totals: without(s.totals, NEW_KEYS.totals),
    halls: s.halls.map((h) => ({ ...without(h, NEW_KEYS.hall), flock: h.flock ? without(h.flock, NEW_KEYS.dayFlock) : h.flock })),
  })),
  totals: without(v.totals, NEW_KEYS.totals),
});
/** جواب flock_cycle_report بلا مفاتيح 0028. */
const reportAs0027 = (v) => {
  const out = without(v, NEW_KEYS.report);
  out.birds = without(v.birds, NEW_KEYS.birds);
  out.days = v.days.map((d) => without(d, NEW_KEYS.reportDay));
  out.kpis = without(v.kpis, NEW_KEYS.kpis);
  if (v.money) out.money = without(v.money, NEW_KEYS.money);
  return out;
};
const cyclesAs0027 = (v) => ({ ...v, cycles: v.cycles.map((c) => without(c, NEW_KEYS.cycle)) });

/** أجسام 0027 كما يرجّعها التراجع حرفاً بحرف (rollback_0028.sql): من «create or replace function الاسم(» حتى أوّل «$$;» بعدها. */
function bodies0027() {
  const text = readFileSync(path.join(DIR, '..', 'migrations', 'rollback_0028.sql'), 'utf8');
  return ['private.report_days', 'private.report_day', 'private.halls_day_totals', 'public.halls_day', 'public.flock_cycle_report', 'public.flock_cycles'].map((name) => {
    const start = text.indexOf(`create or replace function ${name}(`);
    const end = text.indexOf('\n$$;', start);
    if (start < 0 || end < 0 || text.indexOf(`create or replace function ${name}(`, start + 1) >= 0) throw new Error(`جسم ${name} في rollback_0028.sql ليس مرّة واحدة`);
    return text.slice(start, end + 4);
  });
}

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  /** عيّنات القاعدة الحقيقية للشاشات (BIRDS_SAMPLES_OUT=1 يدمجها في scripts/tests/fixtures/birds-0028.json مع عيّنات birds.test). */
  const samples = {};
  /** مقارنة بالمعنى: مفاتيح jsonb مرتّبة بالطول ثمّ بالبايت، فالكائنات تُرتَّب مفاتيحها قبل المقارنة (والفارغ null). */
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
    name: 'مزرعة الإغلاق',
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
  const whName = async (wh) => (await admin('select name from public.warehouses where id = $1', [wh]))[0].name;

  // ── الحقول والقاعات والمخازن والمواد والأرصدة ───────────────────────────────────────────────────────────────────────────
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const S = { a: await site('broiler', 'حقل الإغلاق'), p: await site('broiler', 'حقل عادي'), l: await site('layer', 'حقل البيض') };
  W.farm = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل الإغلاق', 'farm') returning id", [D.broiler, S.a]);
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = {};
  for (const [key, name] of [['g6', 'قاعة 6'], ['g7', 'قاعة 7'], ['fa', 'قاعة أ'], ['fb', 'قاعة ب'], ['fc', 'قاعة ج'], ['fn', 'قاعة ن'], ['fd', 'قاعة د'],
    ['fe', 'قاعة هـ'], ['ft', 'قاعة ت'], ['r2a', 'قاعة ص1'], ['r2b', 'قاعة ص2'], ['r3', 'قاعة ف'], ['r4a', 'قاعة غ1'], ['r4b', 'قاعة غ2'],
    ['r5a', 'قاعة م1'], ['r5b', 'قاعة م2'], ['r6a', 'قاعة ع1'], ['r6b', 'قاعة ع2'], ['r10a', 'قاعة ز1'], ['r10b', 'قاعة ز2']]) H[key] = await hall(S.a, name);
  H.p1 = await hall(S.p, 'قاعة عادية 1');
  H.p2 = await hall(S.p, 'قاعة عادية 2');
  H.l = await hall(S.l, 'قاعة البيّاض');
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id(9), phone(9)]);
  const plainMember = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[])', [`0${phone(9).slice(3)}`, 'hall_worker', 'عامل الحقل العاديّ', [], [S.p], []]);
  await db.acceptInvite(U.owner, id(9), plainMember);
  U.plain = id(9);

  const item = (name, kind, unit, { expiry = false, piece = null } = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry, piece_mass_kg) values ($1, $2, $3, $4, $5) returning id', [name, kind, unit, expiry, piece]);
  const I = {
    x: await item('علف بادئ', 'feed', 'kg', { expiry: true }),
    p: await item('علف نامي', 'feed', 'kg'),
    q: await item('علف ناهي', 'feed', 'kg'),
    z: await item('علف مركّز', 'feed', 'kg'),
    y: await item('علف التسمين', 'feed', 'kg'),
    v: await item('علف مكعّب', 'feed', 'kg'),
    u: await item('علف بلا وزن', 'feed', 'pc'),
    m: await item('فيتامين سائل', 'medicine', 'L'),
  };
  // G5: «علف بادئ» دفعتان قبل الصرف: LA بالافتتاح أصغر ترتيباً وأبعد انتهاءً (2,000 كغم بـ1,483,738.69 حتى 30/06/2027)، وLB بشراء يوم −7 (1,000 كغم بـ600.00
  // = 600,000.00 حتى 31/03/2027)؛ والمجموع 3,000 كغم بـ2,083,738.69. والبقية بالافتتاح (التسمين 700.00 للكيلو بالضبط، فكلّ سحب منه بقيمة صحيحة).
  await postedOpening(db, U.owner, W.feed, day(-40), [{ item: I.x, qty: 2000, value: '1483738.69', expiry: '2027-06-30' }, { item: I.p, qty: 3000, value: '2083738.69' },
    { item: I.q, qty: 3000, value: '2083738.69' }, { item: I.z, qty: 3000, value: '2083738.69' }, { item: I.y, qty: 100000, value: '70000000.00' },
    { item: I.v, qty: 1000, value: '600000.00' }, { item: I.u, qty: 10, value: '100000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-40), [{ item: I.m, qty: 50, value: '500000.00' }]);
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد العلف', true) returning id");
  const buy = (itemId, on, qty, price, expiry) => one(U.owner, "select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, null, 'credit', null, $9, $10, null)",
    [uid(), uid(), uid(), itemId, supplier, on, qty, price, W.feed, expiry]);
  await buy(I.x, day(-7), 1000, 600, '2027-03-31');
  const lots = async (itemId, wh = W.feed) => admin(`select id, fifo_seq::text as seq, expiry_on::text as expiry, received_on::text as received, source_kind as source,
      trim_scale(qty_in)::text as qty_in, trim_scale(value_in)::text as value_in, trim_scale(qty_left)::text as qty_left
    from public.stock_lots where item_id = $1 and warehouse_id = $2 order by fifo_seq, created_at, id`, [itemId, wh]);
  const [LA] = await lots(I.x);

  const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر الإغلاق', true) returning id");

  // ── الأدوات ────────────────────────────────────────────────────────────────────────────────────────────
  const open = async (hallId, on, count, user = U.manager) => (await call(db, user, OPEN, [hallId, on, count, uid()]));
  const place = async (hallId, on, count) => {
    const result = await open(hallId, on, count);
    if (!result.ok) throw new Error(`open_flock ${on}: ${result.code} ${result.hint}`);
    return result.value.flock_id;
  };
  const issue = async (flock, itemId, qty, on, wh = W.feed) => one(U.manager, ISSUE, [uid(), uid(), uid(), flock, itemId, qty, on, wh]);
  const round = async (flock, on, dead, feed) => {
    const v = await one(U.manager, 'select public.save_flock_day($1, $2, $3, 0, $4, null, null, null, null, null, null, null, null, $5, false)', [flock, on, dead, feed, uid()]);
    if (v.status !== 'saved') throw new Error(`جولة ${on}: ${JSON.stringify(v)}`);
  };
  const weigh = async (flock, on, count, avg) => {
    const v = await one(U.manager, 'select public.record_flock_weight($1, $2, $3, $4, $5)', [flock, on, count, avg, uid()]);
    if (v.status !== 'saved') throw new Error(`وزن ${on}: ${JSON.stringify(v)}`);
  };
  /** تذكرة قبّان مكتملة بوقفة لكلّ [قاعة، طيور، صافٍ]: الفارغ 7,000 مع الأقفاص، والخابط تراكميّ (صافي كلّ قاعة = خابطها − الذي قبلها). */
  const ticket = async (on, stops, { done = true } = {}) => {
    const ticketId = uid();
    let gross = 7000;
    const data = { site_id: S.a, on_date: on, method: 'scale', empty_kg: '7000', empty_with_crates: true, crate_kg: null,
      stops: stops.map(([hallId, birds, net]) => {
        gross += Number(net);
        return { id: uid(), hall_id: hallId, birds, crates: Math.ceil(birds / 10), gross_kg: String(gross), weighings: [] };
      }) };
    const saved = await one(U.worker, SAVE_TICKET, [ticketId, null, JSON.stringify(data)]);
    if (saved.status !== 'saved') throw new Error(`تذكرة: ${JSON.stringify(saved)}`);
    if (!done) return { id: ticketId, version: 1, data };
    const finished = await one(U.worker, 'select public.finish_weigh_ticket($1, $2, $3)', [uid(), ticketId, 1]);
    return { id: ticketId, version: finished.version, ticket_no: finished.ticket_no, data };
  };
  const sellArgs = ({ ref = uid(), sale = uid(), ticket: tk, price = '2750.00' }) => [ref, sale, tk.id, tk.version, trader, price, '0', '0', null, null];
  const sell = (tk, extra = {}) => one(U.accountant, SELL, sellArgs({ ticket: tk, ...extra }));
  const form = (flock, user = U.manager) => one(user, 'select public.flock_close_form($1)', [flock]);
  /** معاملات الإغلاق كما ترسلها شاشته: الحيّ والمباع وما نزل لكلّ مادّة من نموذجها (ما رأته)، ومصير كلّ مادّة. */
  const closeArgs = (f, flock, on, { ref = uid(), closeId = uid(), reason = null, lines = [], note = null, live, sold, pools } = {}) => [ref, closeId, flock, on,
    live ?? f.flock.live, sold ?? f.sales.birds, JSON.stringify(pools ?? f.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }))), reason, JSON.stringify(lines), note];
  const closeCall = async (flock, on, options = {}, user = U.manager) => call(db, user, CLOSE, closeArgs(await form(flock), flock, on, options));
  const closeOk = async (flock, on, options = {}) => {
    const result = await closeCall(flock, on, options);
    if (!result.ok) throw new Error(`close_flock: ${result.code} ${result.hint}`);
    return result.value;
  };
  const back = (itemId, qty, wh = W.feed) => ({ item_id: itemId, qty, action: 'return', warehouse_id: wh });
  const carry = (itemId, qty) => ({ item_id: itemId, qty, action: 'carry' });
  const used = (itemId, qty) => ({ item_id: itemId, qty, action: 'consumed' });
  const costs = async (flock) => (await admin('select coalesce(sum(amount), 0)::text as v from public.flock_costs where flock_id = $1', [flock]))[0].v;
  const live = async (flock) => (await one(U.manager, 'select public.flock_sales($1)', [flock])).live;
  const report = (flock, user = U.manager) => one(user, 'select public.flock_cycle_report($1)', [flock]);
  const hallsDay = (on, user = U.manager) => one(user, 'select public.halls_day($1)', [on]);
  const hallOf = (v, hallId) => v.sites.flatMap((s) => s.halls).find((h) => h.hall_id === hallId);
  const broken = (fns, run) => mutant(db, U.manager, fns, run);
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(`${sql} as v`, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
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
  /** سباق بجلستين: الأولى تنفّذ ولا تثبت، والثانية تُرسل فتُحبس على الأولى بعينها، ثمّ تثبت الأولى (أو ترجع إن رُفضت) فتكمل الثانية. */
  const race = async ([userA, sqlA, paramsA], [userB, sqlB, paramsB]) => {
    const a = await db.session(userA);
    const b = await db.session(userB);
    try {
      const first = await a.run(`${sqlA} as v`, paramsA);
      const pending = b.run(`${sqlB} as v`, paramsB);
      const state = await settleOn(pending, b.pid, a.pid);
      if (first.ok) await a.commit();
      else await a.rollback();
      const second = await pending;
      if (second.ok) await b.commit();
      else await b.rollback();
      return { state, first: first.ok ? { ok: true, v: first.rows[0].v } : { ok: false, code: first.error },
        second: second.ok ? { ok: true, v: second.rows[0].v } : { ok: false, code: second.error } };
    } finally {
      await a.rollback();
      await b.rollback();
    }
  };

  // ── البذرة يوماً بيوم (setToday وقاعدة الأيّام السبعة) ─────────────────────────────────────────────────────────────────
  // G6 وG7: 10,000 طير بعمر صفر يوم 6 تشرين الأوّل (day −37)، والبيع يوم 10 تشرين الثاني (day −2، العمر 35)، والإغلاق اليوم (العمر 37). النافق بالجولات
  // 100 + 100 + 100 = 300 (G6) و90 × 3 = 270 (G7)، وعلف الجولات 500 + 1,000 + 1,500 = 3,000 كغم (غير العلف الصافي، فمعامل التحويل من الجولات خطأ يُرى).
  // العلف النازل: 20,000 + 20,000 من «علف التسمين» لكلّ منهما، ولـG6 أيضاً 500 كغم «علف مكعّب» و10 لترات «فيتامين سائل».
  const F = {};
  await at(day(-36), async () => {
    F.g6 = await place(H.g6, day(-37), 10000);
    F.g7 = await place(H.g7, day(-37), 10000);
    await round(F.g6, day(-36), 100, '500');
    await round(F.g7, day(-36), 90, '500');
    await issue(F.g6, I.y, '20000', day(-36));
    await issue(F.g7, I.y, '20000', day(-36));
  });
  await at(day(-20), async () => {
    await round(F.g6, day(-20), 100, '1000');
    await round(F.g7, day(-20), 90, '1000');
    await issue(F.g6, I.y, '20000', day(-20));
    await issue(F.g7, I.y, '20000', day(-20));
    await issue(F.g6, I.v, '500', day(-20));
    await issue(F.g6, I.m, '10', day(-20), W.medicine);
  });
  // الفوج العاديّ (بلا بيع ولا إغلاق) في «حقل عادي» لمقارنة قرّاء 0027: جولات بفجوة، ووزنان، وصرف موزون وسطر بلا وزن.
  await at(day(-8), async () => {
    F.p = await place(H.p1, day(-9), 2000);
    await issue(F.p, I.y, '300', day(-9));
    await round(F.p, day(-8), 5, '100');
  });
  for (const key of ['fa', 'fb', 'fc', 'fn', 'fd', 'fe', 'ft', 'r2a', 'r2b', 'r3', 'r4a', 'r4b', 'r5a', 'r5b', 'r6a', 'r6b', 'r10a', 'r10b']) {
    F[key] = await place(H[key], day(-10), ['fa', 'fb', 'fc', 'fn', 'fd', 'fe'].includes(key) ? 1000 : 100);
  }
  F.l = await place(H.l, day(-10), 500);
  await round(F.p, day(-6), 3, '120');
  await weigh(F.p, day(-6), 50, '150.0');
  await issue(F.p, I.u, '1', day(-6));
  await round(F.p, day(-2), 2, '150');
  await issue(F.p, I.y, '200', day(-2));
  await round(F.p, day(-1), 1, '160');
  await weigh(F.p, day(-1), 50, '300.5');
  // G5: «علف بادئ» لـFA بصرفين: 1,000 كغم يوم −6 (الانتهاء أوّلاً: LB كلّها، 600,000.00) و2,000 يوم −5 (LA كلّها، 1,483,738.69)؛ وP وQ وZ 3,000 كغم لكلّ منها.
  await issue(F.fa, I.x, '1000', day(-6));
  await issue(F.fa, I.x, '2000', day(-5));
  await issue(F.fb, I.p, '3000', day(-6));
  await issue(F.fb, I.q, '3000', day(-6));
  await issue(F.fc, I.z, '3000', day(-6));
  for (const key of ['fd', 'fe']) await issue(F[key], I.y, '1000', day(-6));
  await issue(F.fd, I.u, '1', day(-6));
  for (const key of ['r2a', 'r2b', 'r5a', 'r5b']) await issue(F[key], I.y, '100', day(-6));
  // L3 بعد الصرفين (ترتيبها أكبر) بانتهاء LB نفسه، مشتراة يوم −4 (1,000 كغم بـ1,000.00): الصرف التالي يختار بين الراجعة وL3 بالترتيب وحده.
  await buy(I.x, day(-4), 1000, 1000, '2027-03-31');
  const L3 = (await lots(I.x)).find((l) => l.received === day(-4));
  for (const key of ['g6', 'g7']) {
    await round(F[key], day(-3), key === 'g6' ? 100 : 90, '1500');
    await weigh(F[key], day(-3), 50, '2350.0');
  }

  // ── G5 (القاعدة ١٦، FOUNDATION §4) ─────────────────────────────────────────────────────────────────────────────
  // FA: ما نزل 3,000 كغم بـ2,083,738.69؛ إرجاع 500 ← 2,083,738.69 × 500 ÷ 3,000 = 347,289.7817 ← 347,289.78، وكلفة الفوج 1,736,448.91. الدفعة الراجعة بأصغر
  // ترتيب (LA) وأقرب انتهاء (31/03/2027 من LB)، والصرف التالي من المخزن (600 كغم لـFN اليوم) يسحبها أوّلاً (500 بـ347,289.78) ثمّ 100 من L3 (100,000.00).
  const NEXT = [uid(), uid(), uid(), F.fn, I.x, '600', TODAY, W.feed];
  const drawn = async (q, issueId) => (await q(`select m.lot_id, trim_scale(-m.qty)::text as qty, trim_scale(-m.value)::text as value from public.stock_moves m
    where m.doc_kind = 'flock_issue' and m.doc_id = $1 order by m.seq`, [issueId])).rows;
  const faLines = [back(I.x, '500')];
  const faReason = 'لم تُبَع بعد';
  await section('G5 طفرة القيمة بآخر صرف (M12)', async () => {
    // بديل ساذج: قيمة الراجع بكلفة وحدة آخر صرف (الثاني: 1,483,738.69 لـ2,000 كغم) ← 500 × 741.869345 = 370,934.6725 ← 370,934.67 بدل 347,289.78.
    const latest = `v_value := (select private._mul_div_round2((a ->> 'qty')::numeric, zk.amount, zl.qty_base) from public.flock_issues zx
        join public.flock_issue_lines zl on zl.org_id = zx.org_id and zl.issue_id = zx.id
        join public.flock_costs zk on zk.org_id = zl.org_id and zk.doc_kind = 'flock_issue' and zk.doc_line_id = zl.id and zk.reverses_id is null
        where zx.org_id = v_org and zx.flock_id = f.id and zx.status = 'posted' and zl.item_id = i.id order by zx.issued_on desc, zx.posted_at desc limit 1);`;
    const f = await form(F.fa);
    const v = await broken([[SIG.close, [["v_value := case when (a ->> 'qty')::numeric = p.qty then p.value else private._mul_div_round2((a ->> 'qty')::numeric, p.value, p.qty) end;", latest]]]],
      ({ attempt }) => inside(attempt, U.manager, CLOSE, closeArgs(f, F.fa, TODAY, { reason: faReason, lines: faLines })));
    same([v?.code, v?.lines?.map((l) => l.money?.value)], [undefined, ['370934.67']], 'طفرة M12 (الراجع بكلفة آخر صرف): 370,934.67 بدل 347,289.78، فيمسكها G5');
  });
  await section('G5 طفرة ترتيب جديد للدفعة الراجعة (M13)', async () => {
    // بديل ساذج: الدفعة الراجعة دفعة جديدة (new_lot) بترتيب جديد، فتسحب L3 قبلها والراجعة تبقى.
    const f = await form(F.fa);
    const seen = await broken([[SIG.returnPost, [['l := private.return_lot(p_item, p_wh, p_on, v_seq, v_expiry, p_qty, p_value, p_return, v_line);',
      "l := private.new_lot(p_item, p_wh, p_on, v_expiry, null, p_qty, p_value, 'flock_return', p_return, v_line);"]]]], async ({ attempt, oq }) => {
      const closed = await inside(attempt, U.manager, CLOSE, closeArgs(f, F.fa, TODAY, { reason: faReason, lines: faLines }));
      const lot = (await oq("select fifo_seq::text as seq from public.stock_lots where source_kind = 'flock_return' and source_id = $1", [closed?.lines?.[0]?.return_id])).rows[0];
      await inside(attempt, U.manager, ISSUE, NEXT);
      return { seq: lot?.seq, first: (await drawn(oq, NEXT[1]))[0]?.lot_id };
    });
    same([seen.seq === LA.seq, seen.first === L3.id], [false, true], 'طفرة M13 (ترتيب جديد للراجعة): ترتيبها ليس ترتيب LA والصرف التالي يسحب L3 أوّلاً، فيمسكها G5');
  });
  await section('G5 FA: إرجاع 500 كغم', async () => {
    const before = await form(F.fa);
    same(before.items.map((i) => [i.name, i.pool_qty, i.pool_kg, i.money?.pool_value, i.default_store]), [['علف بادئ', '3000', '3000.000', '2083738.69', W.feed]],
      'G5: ما نزل لـFA من «علف بادئ» 3,000 كغم بـ2,083,738.69، ومخزنه المقترح المخزن الذي جاء منه');
    const result = await call(db, U.manager, CLOSE, closeArgs(before, F.fa, TODAY, { reason: faReason, lines: faLines }));
    const v = result.value;
    const fr = (await lots(I.x)).find((l) => l.source === 'flock_return');
    same(
      [result.ok, v?.status, v?.count_diff, v?.lines?.map((l) => [l.action, l.qty, l.kg, l.warehouse_id, l.money?.value]), v?.money?.returned_value, v?.money?.cost_total,
        await costs(F.fa), [fr?.seq === LA.seq, fr?.expiry, fr?.received, fr?.qty_in, fr?.value_in]],
      [true, 'closed', -1000, [['return', '500', '500.000', W.feed, '347289.78']], '347289.78', '1736448.91', '1736448.91',
        [true, '2027-03-31', TODAY, '500', '347289.78']],
      'G5: إرجاع 500 كغم بـ347,289.78، وكلفة الفوج 1,736,448.91، والدفعة الراجعة بترتيب LA وانتهاء LB (31/03/2027) ويوم الإغلاق',
    );
    const next = await call(db, U.manager, ISSUE, NEXT);
    const pieces = await drawn((sql, params) => db.admin(sql, params), NEXT[1]);
    same([next.ok, pieces.map((p) => [p.lot_id === fr?.id ? 'FR' : p.lot_id === L3.id ? 'L3' : p.lot_id, p.qty, p.value])], [true, [['FR', '500', '347289.78'], ['L3', '100', '100000']]],
      'G5: الصرف التالي من المخزن (600 كغم) يسحب الراجعة أوّلاً (500 بـ347,289.78) ثمّ 100 من L3 بـ100,000.00');
    // إعادة الفتح بعد السحب من الدفعة الراجعة: lot_consumed يسمّي مستند السحب، ولا شيء يتغيّر.
    const reopened = await call(db, U.manager, REOPEN, [v.id, 'كمية خاطئة', uid()]);
    same([reopened.code, reopened.hint.includes(next.value?.doc_no), (await form(F.fa)).flock.status], ['lot_consumed', true, 'closed'],
      'إعادة فتح دورة سُحب من دفعة إرجاعها: lot_consumed يسمّي الصرف الذي سحب منها، والدورة مغلقة كما هي');
    samples.close_flock_return = v;
    // D7: الإرجاع مستند مخزون مرقَّم FR يظهر في دفتر المادّة في مخزنها، ببيانه.
    const ledger = await one(U.manager, 'select public.item_moves_qty($1, $2, null, 50)', [I.x, W.feed]);
    const row = ledger.rows.find((m) => m.doc_kind === 'flock_return');
    same([row?.doc, row?.memo, row?.qty, row?.moved_on, row?.money?.value], [v?.lines?.[0]?.return_doc_no, 'إرجاع من قاعة أ (حقل الإغلاق) عند إغلاق الدورة', '500', TODAY, '347289.78'],
      'D7: دفتر «علف بادئ» في المخزن يعرض الإرجاع برقمه FR وبيانه وكميته وقيمته');
  });
  // FB: إرجاع 1,000 من «علف نامي» ← 2,083,738.69 × 1,000 ÷ 3,000 = 694,579.5633 ← 694,579.56؛ ونقل 2,000 من «علف ناهي» ← × 2,000 ÷ 3,000 = 1,389,159.1267
  // ← 1,389,159.13 (سطر واحد لكلّ مادّة، D7، فالمادّتان بصرفين متساويين). كلفة الفوج 4,167,477.38 − 694,579.56 − 1,389,159.13 = 2,083,738.69.
  // FC: إرجاع الكلّ (3,000 كغم) ← القيمة كلّها 2,083,738.69 بالضبط، وكلفة علف الفوج 0.00.
  const fbRef = uid();
  const fbClose = uid();
  await section('G5 FB: إرجاع 1,000 ونقل 2,000', async () => {
    const result = await call(db, U.manager, CLOSE, closeArgs(await form(F.fb), F.fb, TODAY, { ref: fbRef, closeId: fbClose, reason: 'لم تُبَع بعد',
      lines: [back(I.p, '1000'), carry(I.q, '2000')] }));
    same([result.ok, result.value?.lines?.map((l) => [l.item_name, l.action, l.money?.value, l.carry_status]), result.value?.money?.carried_value, await costs(F.fb)],
      [true, [['علف نامي', 'return', '694579.56', null], ['علف ناهي', 'carry', '1389159.13', 'pending']], '1389159.13', '2083738.69'],
      'G5: إرجاع 1,000 بـ694,579.56 ونقل 2,000 بـ1,389,159.13 (معلَّق على القاعة)، وكلفة الفوج 2,083,738.69');
  });
  await section('G5 FC: إرجاع الكلّ', async () => {
    const v = await closeOk(F.fc, TODAY, { reason: 'لم تُبَع بعد', lines: [back(I.z, '3000')] });
    const r = await report(F.fc);
    same([v.lines[0].money.value, await costs(F.fc), r.money.feed, r.money.total, r.money.returned, r.kpis.feed_out_kg],
      ['2083738.69', '0.00', '0.00', '0.00', '2083738.69', '3000.000'], 'G5: إرجاع الكلّ = 2,083,738.69 بالضبط، وكلفة علف الفوج 0.00، والخارج 3,000 كغم');
  });

  // ── G6 وG7: البيع والإغلاق والمؤشّرات النهائية ────────────────────────────────────────────────────────────────────
  // البيع يوم −2 (العمر 35): 9,700 طير بصافٍ 23,280.000 كغم (الخابط 30,280 والفارغ 7,000 مع الأقفاص)، بسعر 2,750.00: 64,020,000. معدّل الطير 2.400.
  // G6 بلا حيّ بعده (10,000 − 300 − 9,700 = 0)، وG7 يبقى 30 (10,000 − 270 − 9,700) فيُكتب فرق العدّ −30 بسببه.
  const T6 = await ticket(day(-2), [[H.g6, 9700, '23280']]);
  const T7 = await ticket(day(-2), [[H.g7, 9700, '23280']]);
  const S6 = await sell(T6);
  const S7 = await sell(T7);
  await section('حقول البيع في التقرير اليوميّ', async () => {
    const v = await hallsDay(day(-2));
    const h6 = hallOf(v, H.g6).flock;
    same(pick(h6, ['live_start', 'dead', 'live_end', 'sold', 'sold_net_kg', 'count_diff', 'ticketed']),
      { live_start: 9700, dead: null, live_end: 0, sold: 9700, sold_net_kg: '23280.000', count_diff: 0, ticketed: 0 },
      'halls_day يوم البيع: الحيّ أوّل اليوم 9,700 وآخره 0، والمباع 9,700 بصافي 23,280.000، ولا شيء على تذكرة بلا فاتورة');
    const siteRow = v.sites.find((s) => s.id === S.a);
    const sum = (key) => siteRow.halls.reduce((n, h) => n + (h.flock?.[key] ?? 0), 0);
    const all = (key) => v.sites.reduce((n, x) => n + x.totals[key], 0);
    same([pick(siteRow.totals, ['sold', 'count_diff', 'ticketed']), pick(v.totals, ['sold', 'count_diff', 'ticketed'])],
      [{ sold: sum('sold'), count_diff: sum('count_diff'), ticketed: sum('ticketed') }, { sold: all('sold'), count_diff: all('count_diff'), ticketed: all('ticketed') }],
      'halls_day: مجاميع الحقل للمباع وفرق العدّ وما على التذاكر = مجموع قاعاته، ومجاميع الكلّ = مجموع الحقول');
  });
  await section('رفض الإغلاق قبل يوم آخر نشاط، وبلا سبب لفرق العدّ', async () => {
    const early = await closeCall(F.g7, day(-3), { reason: 'طيور لم تُعدّ في الجولات' });
    const noReason = await closeCall(F.g7, TODAY);
    same([early.code, early.hint, noReason.code, noReason.hint], ['activity_after_close',
      `سُجّل على الفوج الفاتورة ${S7.doc_no} يوم ${dmy(day(-2))}، بعد يوم الإغلاق ${dmy(day(-3))}. اختر يوم الإغلاق في آخر يوم سُجّل فيه شيء أو بعده.`,
      'count_reason_required', 'في القاعة بحسب النظام 30 طيراً لم تُبَع ولم تُسجَّل نافقة. اكتب سبب «فرق العدّ» ليُكتب مع الإغلاق.'],
    'الإغلاق قبل الفاتورة activity_after_close يسمّيها ويومها، وبلا سبب لثلاثين طيراً count_reason_required');
    Object.assign(samples, { refusal_activity_after_close: { code: early.code, hint: early.hint }, refusal_count_reason_required: { code: noReason.code, hint: noReason.hint } });
  });
  const g6Lines = [back(I.y, '1588'), carry(I.v, '500'), used(I.m, '2')];
  const g6Ref = uid();
  const g6Close = uid();
  await section('G6: الإغلاق بإرجاع ونقل ومستهلَك', async () => {
    const before = await form(F.g6);
    samples.flock_close_form = before;
    samples.flock_close_form_hall_worker = await form(F.g6, U.worker);
    same(
      [before.flock.live, before.sales.birds, before.sales.net_kg, before.sales.avg_kg, before.default_on, before.earliest_on, before.can_close,
        before.items.map((i) => [i.name, i.pool_qty, i.pool_kg, i.money?.pool_value]), before.feed.given_kg, before.feed.eaten_kg],
      [0, 9700, '23280.000', '2.400', day(-2), day(-2), true, [['علف التسمين', '40000', '40000.000', '28000000.00'], ['علف مكعّب', '500', '500.000', '300000.00'],
        ['فيتامين سائل', '10', null, '100000.00']], '40500.000', '3000.000'],
      'نموذج الإغلاق: الحيّ صفر والمباع 9,700 بصافي 23,280 ومعدّل 2.400، واليوم المقترح وأقدمه يوم البيع، وما نزل لكلّ مادّة بقيمته');
    same(JSON.stringify(samples.flock_close_form_hall_worker).includes('"money"'), false, 'نموذج الإغلاق لعامل القاعة بلا مال');
    const result = await call(db, U.manager, CLOSE, closeArgs(before, F.g6, TODAY, { ref: g6Ref, closeId: g6Close, lines: g6Lines, note: 'نهاية الدورة' }));
    samples.close_flock = result.value;
    // الإرجاع 1,588 × 700 = 1,111,600.00، ونقل «علف مكعّب» كلّه = 300,000.00، والمستهلَك بلا قيمة. الكلفة 28,000,000 + 300,000 + 100,000 − 1,111,600 − 300,000.
    same([result.ok, result.value?.lines?.map((l) => [l.action, l.qty, l.money?.value ?? null]), pick(result.value?.money, ['cost_total', 'returned_value', 'carried_value', 'revenue'])],
      [true, [['return', '1588', '1111600.00'], ['carry', '500', '300000.00'], ['consumed', '2', null]],
        { cost_total: '26988400.00', returned_value: '1111600.00', carried_value: '300000.00', revenue: '64020000' }],
      'G6: الإغلاق يرجع 1,588 كغم بـ1,111,600.00 وينقل 500 كغم بـ300,000.00، والكلفة 26,988,400.00 والإيراد 64,020,000');
    const again = await call(db, U.manager, CLOSE, closeArgs(before, F.g6, TODAY, { ref: g6Ref, closeId: g6Close, lines: g6Lines, note: 'نهاية الدورة' }));
    // جواب ضاع والمرجع جديد: الإغلاق نفسه بمعرّفه ومحتواه ومن كاتبه = نتيجته؛ وبمحتوى آخر id_conflict.
    const lost = await call(db, U.manager, CLOSE, closeArgs(before, F.g6, TODAY, { closeId: g6Close, lines: g6Lines, note: 'نهاية الدورة' }));
    const other = await call(db, U.manager, CLOSE, closeArgs(before, F.g6, TODAY, { closeId: g6Close, lines: g6Lines, note: 'ملاحظة أخرى' }));
    same([again.ok, again.value?.id === result.value?.id, lost.ok, canon(lost.value) === canon(result.value), other.code], [true, true, true, true, 'id_conflict'],
      'الإعادة بالمرجع نفسه ترجع نتيجة الإغلاق نفسها، وبمرجع جديد والمعرّف والمحتوى نفسيهما كذلك، وبمحتوى آخر id_conflict');
  });
  await section('G6: المؤشّرات النهائية', async () => {
    const r = await report(F.g6);
    samples.flock_cycle_report_closed = r;
    samples.flock_cycle_report_closed_no_money = await report(F.g6, U.worker);
    // معدّل وزن البيع 23,280 ÷ 9,700 = 2.400، وعمره 35.0، والعلف الصافي 40,500 − 2,088 = 38,412، ومعامل التحويل 38,412 ÷ 23,280 = 1.650، والحيوية 97.00،
    // ومؤشّر الإنتاج 97.00 × 2,400 ÷ (10 × 35 × 1.650) = 232,800 ÷ 577.5 = 403.12 ← 403.
    same(pick(r.kpis, ['sold_birds', 'sold_net_kg', 'sold_avg_kg', 'sale_age', 'count_diff', 'feed_given_kg', 'feed_out_kg', 'feed_net_kg', 'fcr_final', 'mortality_pct',
      'livability_pct', 'epef_final', 'age_end']),
    { sold_birds: 9700, sold_net_kg: '23280.000', sold_avg_kg: '2.400', sale_age: '35.0', count_diff: 0, feed_given_kg: '40500.000', feed_out_kg: '2088.000',
      feed_net_kg: '38412.000', fcr_final: '1.650', mortality_pct: '3.00', livability_pct: '97.00', epef_final: '403', age_end: 37 },
    'G6: المعدّل 2.400 بعمر 35، والعلف الصافي 38,412، ومعامل التحويل النهائيّ 1.650، والحيوية 97.00، ومؤشّر الإنتاج 403');
    same([r.birds.sold, r.birds.live, r.birds.count_diff, r.sales.birds, r.sales.avg_kg, r.sales.pending_birds, r.sales.tickets.map((x) => [x.ticket_no, x.birds, x.invoiced, x.doc_no]),
      r.close?.status, r.close?.lines?.map((l) => [l.action, l.carry_status, (l.stores ?? []).map((s) => s.warehouse_id)]), JSON.stringify(r.close).includes('"money"'),
      pick(r.money, ['feed', 'medicine', 'total', 'returned', 'carried_out', 'carried_in', 'revenue'])],
    [9700, 0, 0, 9700, '2.400', 0, [[T6.ticket_no, 9700, true, S6.doc_no]], 'closed',
      [['return', null, []], ['carry', 'pending', [W.feed]], ['consumed', null, []]], false,
      { feed: '26888400.00', medicine: '100000.00', total: '26988400.00', returned: '1111600.00', carried_out: '300000.00', carried_in: '0', revenue: '64020000' }],
    'G6: الطيور والبيع والإغلاق بلا مال (والمنقول المعلَّق بمخازنه)، والمال صافٍ بالراجع والمنقول، والإيراد 64,020,000');
    same([JSON.stringify(samples.flock_cycle_report_closed_no_money).includes('"money"'), samples.flock_cycle_report_closed_no_money.sales.tickets.map((x) => x.doc_no)],
      [false, [null]], 'تقرير الدورة المغلقة لعامل القاعة بلا مال ولا رقم الفاتورة');
    const days = Object.fromEntries(r.days.map((d) => [d.on, d]));
    same([pick(days[day(-2)], ['live_start', 'live_end', 'sold', 'sold_cum']), pick(days[day(-1)], ['live_start', 'live_end']),
      pick(days[TODAY], ['feed_out_kg', 'feed_out_cum_kg', 'feed_left_kg', 'feed_given_cum_kg', 'count_diff'])],
    [{ live_start: 9700, live_end: 0, sold: 9700, sold_cum: 9700 }, { live_start: 0, live_end: 0 },
      { feed_out_kg: '2088.000', feed_out_cum_kg: '2088.000', feed_left_kg: '35412.000', feed_given_cum_kg: '40500.000', count_diff: 0 }],
    'G6: أيّام التقرير: الحيّ ينزل بالمباع يوم البيع، والخارج يوم الإغلاق 2,088 كغم والباقي 40,500 − 2,088 − 3,000 = 35,412');
  });
  await section('G6: تقويم القاعة وعلفها بعد الإغلاق', async () => {
    const month = await one(U.manager, 'select public.flock_month($1, $2)', [F.g6, TODAY]);
    const byDay = Object.fromEntries(month.days.map((d) => [d.on, d]));
    const feed = await one(U.manager, 'select public.flock_feed($1)', [F.g6]);
    same([month.can.undo_issue, byDay[day(-2)].sold, byDay[TODAY].count_diff, byDay[TODAY].out.map((o) => [o.kind, o.doc_no !== null, o.name, o.qty, o.kg]),
      pick(feed, ['issued_feed_kg', 'carry_in_feed_kg', 'out_feed_kg', 'net_feed_kg', 'can_void'])],
    [false, 9700, 0, [['return', true, 'علف التسمين', '1588', '1588.000'], ['carry', false, 'علف مكعّب', '500', '500.000'], ['consumed', false, 'فيتامين سائل', '2', null]],
      { issued_feed_kg: '40500.000', carry_in_feed_kg: '0.000', out_feed_kg: '2088.000', net_feed_kg: '38412.000', can_void: false }],
    'flock_month: لا «ألغِ» على المغلق، والمباع يوم البيع، والخارج يوم الإغلاق بمصيره؛ وflock_feed: الخارج 2,088 والصافي 38,412');
    const fbCarry = (await admin("select l.id from public.flock_close_lines l join public.flock_closes c on c.id = l.close_id where c.flock_id = $1 and c.status = 'closed' and l.action = 'carry'", [F.fb]))[0].id;
    const fbReturn = (await admin("select l.id from public.flock_close_lines l join public.flock_closes c on c.id = l.close_id where c.flock_id = $1 and c.status = 'closed' and l.action = 'return'", [F.fb]))[0].id;
    const wrongStore = await call(db, U.manager, RETURN_CARRY, [uid(), uid(), fbCarry, W.farm]);
    const notCarry = await call(db, U.manager, RETURN_CARRY, [uid(), uid(), fbReturn, W.feed]);
    const worker = await call(db, U.worker, RETURN_CARRY, [uid(), uid(), fbCarry, W.feed]);
    same([wrongStore.code, wrongStore.hint, notCarry.code, worker.code],
      ['not_from_store', `«علف ناهي» لم يأتِ إلى هذه القاعة من «مخزن حقل الإغلاق». اختر مخزناً جاء منه: «${await whName(W.feed)}».`, 'carry_not_found', 'forbidden'],
      'return_hall_carry: إلى مخزن لم يأتِ منه not_from_store يسمّي الذي جاء منه، وسطر إرجاع ليس نقلاً carry_not_found، وعامل القاعة لا يُرجع');
  });
  await section('G6 طفرات المؤشّرات (M17 وM18 وM19)', async () => {
    // M17: معامل التحويل النهائيّ من علف الجولات (3,000 ÷ 23,280 = 0.129) بدل العلف الصافي.
    const fcr = await broken([[SIG.report, [['then private._mul_div_round(m.net_feed, 1, v_sold_kg, 3) end as fcr_final', 'then private._mul_div_round(m.feed_cum_kg, 1, v_sold_kg, 3) end as fcr_final']]]],
      ({ attempt }) => inside(attempt, U.manager, 'select public.flock_cycle_report($1)', [F.g6]));
    // M18: مؤشّر الإنتاج بعمر الإغلاق (37) بدل عمر البيع: 232,800 ÷ (10 × 37 × 1.650) = 381.33 ← 381.
    const epef = await broken([[SIG.report, [['then private._mul_div_round((100 - fc.mortality_cum_pct::numeric) * fc.sold_avg * 1000, 1, 10 * v_sale_age * fc.fcr_final, 0)::text end)',
      'then private._mul_div_round((100 - fc.mortality_cum_pct::numeric) * fc.sold_avg * 1000, 1, 10 * fc.age * fc.fcr_final, 0)::text end)']]]],
    ({ attempt }) => inside(attempt, U.manager, 'select public.flock_cycle_report($1)', [F.g6]));
    // M19: الحيّ في أيّام التقرير بلا العدد (المباع وفرق العدّ): بعد يوم البيع 10,000 − 300 = 9,700 بدل صفر.
    const days = await broken([[SIG.days, [['coalesce(sum(coalesce(y.dead, 0) + coalesce(y.culled, 0) + y.sold - y.adjust)', 'coalesce(sum(coalesce(y.dead, 0) + coalesce(y.culled, 0))']]]],
      ({ attempt }) => inside(attempt, U.manager, 'select public.flock_cycle_report($1)', [F.g6]));
    same([fcr?.kpis?.fcr_final, epef?.kpis?.epef_final, days?.days?.find((d) => d.on === day(-1))?.live_start], ['0.129', '381', 9700],
      'طفرات: معامل التحويل من الجولات 0.129 (M17)، ومؤشّر الإنتاج بعمر الإغلاق 381 (M18)، والحيّ في الأيّام بلا العدد 9,700 (M19)، فيمسكها G6');
  });
  await section('G7: فرق العدّ خارج النفوق', async () => {
    const g7Close = uid();
    const g7Form = await form(F.g7);
    const result = await call(db, U.manager, CLOSE, closeArgs(g7Form, F.g7, TODAY, { closeId: g7Close, reason: 'طيور لم تُعدّ في الجولات', lines: [back(I.y, '1588')] }));
    // جواب ضاع ثمّ أُعيد الإرسال بمرجع جديد والمعرّف نفسه: بالمحتوى نفسه (والسبب منه) = نتيجته، وبسبب آخر لفرق العدّ id_conflict (لا «حُفظ» والمحفوظ سبب غيره).
    const resent = await call(db, U.manager, CLOSE, closeArgs(g7Form, F.g7, TODAY, { closeId: g7Close, reason: 'طيور لم تُعدّ في الجولات', lines: [back(I.y, '1588')] }));
    const otherReason = await call(db, U.manager, CLOSE, closeArgs(g7Form, F.g7, TODAY, { closeId: g7Close, reason: 'سبب آخر', lines: [back(I.y, '1588')] }));
    same([resent.ok, resent.value?.id, otherReason.code], [true, g7Close, 'id_conflict'],
      'إعادة الإغلاق بالمعرّف: بالسبب نفسه نتيجته، وبسبب آخر لفرق العدّ id_conflict');
    samples.close_flock_count_diff = result.value;
    const r = await report(F.g7);
    // النفوق 270 ÷ 10,000 = 2.70 (لا 3.00 بفرق العدّ)، والحيوية 97.30، ومؤشّر الإنتاج 97.30 × 2,400 ÷ 577.5 = 404.36 ← 404.
    same([result.ok, result.value?.live_before, result.value?.count_diff, result.value?.count_reason, pick(r.kpis, ['count_diff', 'mortality_pct', 'livability_pct', 'fcr_final', 'epef_final']),
      r.birds.count_reason, r.birds.live],
    [true, 30, -30, 'طيور لم تُعدّ في الجولات', { count_diff: -30, mortality_pct: '2.70', livability_pct: '97.30', fcr_final: '1.650', epef_final: '404' },
      'طيور لم تُعدّ في الجولات', 0],
    'G7: فرق العدّ −30 بسببه، والنفوق 2.70 والحيوية 97.30 (فرق العدّ وحده)، ومؤشّر الإنتاج 404');
    const v = await hallsDay(TODAY);
    same(pick(hallOf(v, H.g7).flock, ['status', 'closed_on', 'live_start', 'live_end', 'count_diff', 'feed_out_kg', 'feed_out_unweighed']),
      { status: 'closed', closed_on: TODAY, live_start: 30, live_end: 0, count_diff: -30, feed_out_kg: '1588.000', feed_out_unweighed: 0 },
      'halls_day يوم الإغلاق: فرق العدّ −30 يُنزل الحيّ إلى صفر، والخارج 1,588 كغم');
  });

  // ── G9: العلف المنقول ─────────────────────────────────────────────────────────────────────────────────────
  // FD يُغلق يوم −3 بنقل 200 كغم من «علف التسمين» (1,000 كغم بـ700,000.00 ← 140,000.00) وكيس «علف بلا وزن» (10,000.00)، فيظهران على قاعته الفارغة يوم −2،
  // ثمّ يُطبَّقان على الفوج التالي يوم تسكينه (−1): +150,000.00 في كلفته، و200 كغم نازلة يومه الأوّل وسطر بلا وزن يُعدّ ولا يختفي (مراجعة 0027 N1)، وفي ما
  // نزل له للإغلاق القادم. وFE يُغلق يوم −3 بنقل 300 كغم، ويرجع اليوم إلى المخزن قبل أيّ تسكين بقيمته المنقولة (210,000.00)، وكلفة FE كما هي.
  let fdClose = null;
  let feClose = null;
  await section('G9: الإغلاق بالنقل والتقرير على القاعة الفارغة', async () => {
    fdClose = await closeOk(F.fd, day(-3), { reason: 'نُقلت إلى قاعة أخرى', lines: [carry(I.y, '200'), carry(I.u, '1')] });
    feClose = await closeOk(F.fe, day(-3), { reason: 'نُقلت إلى قاعة أخرى', lines: [carry(I.y, '300')] });
    for (const key of ['r5a', 'r5b']) await closeOk(F[key], day(-3), { reason: 'نهاية الدورة', lines: [carry(I.y, '50')] });
    for (const key of ['r6a', 'r6b']) await closeOk(F[key], day(-3), { reason: 'نهاية الدورة' });
    const empty = await hallsDay(day(-2));
    const closeDay = await hallsDay(day(-3));
    same([fdClose.lines.map((l) => l.money.value), hallOf(empty, H.fd).flock, hallOf(empty, H.fd).carry,
      pick(hallOf(closeDay, H.fd).flock, ['status', 'feed_out_kg', 'feed_out_unweighed', 'feed_out_cum_unweighed', 'feed_left_kg', 'feed_given_cum_unweighed', 'count_diff',
        'live_end']), hallOf(closeDay, H.fd).carry],
    [['140000.00', '10000.00'], null, [
      { line_id: fdClose.lines[0].line_id, item_id: I.y, name: 'علف التسمين', qty: '200', base_unit: 'kg', kg: '200.000', closed_on: day(-3), from_flock_id: F.fd },
      { line_id: fdClose.lines[1].line_id, item_id: I.u, name: 'علف بلا وزن', qty: '1', base_unit: 'pc', kg: null, closed_on: day(-3), from_flock_id: F.fd }],
    { status: 'closed', feed_out_kg: '200.000', feed_out_unweighed: 1, feed_out_cum_unweighed: 1, feed_left_kg: '800.000', feed_given_cum_unweighed: 1, count_diff: -1000,
      live_end: 0 }, []],
    'G9: النقل 200 كغم بـ140,000.00 وكيس بلا وزن بـ10,000.00، والقاعة الفارغة يوم −2 تعرضهما معلَّقين، ويوم الإغلاق يعرض الفوج بخارجه 200 كغم وسطر بلا وزن يُعدّ، وباقيه 800');
    samples.halls_day_carry = empty;
  });
  await section('G9 طفرة النقل إلى قاعة أخرى (M14)', async () => {
    // بديل ساذج: التسكين يطبّق كلّ نقل معلَّق في المنشأة لا نقل قاعته وحدها، فيأخذ منقول «قاعة هـ» و«قاعة م1» و«قاعة م2» و«قاعة ب».
    const v = await broken([[SIG.open, [["where l.org_id = h.org_id and l.hall_id = h.id and l.carry_status = 'pending' and k.status = 'closed'",
      "where l.org_id = h.org_id and l.carry_status = 'pending' and k.status = 'closed'"]]]],
    ({ attempt }) => inside(attempt, U.manager, OPEN, [H.fd, day(-1), 500, uid()]));
    same([v?.carried_in?.length > 1, v?.carried_in?.some((c) => c.line_id === feClose?.lines?.[0]?.line_id)], [true, true],
      'طفرة M14 (التسكين يطبّق نقل قاعة أخرى): يأخذ منقول «قاعة هـ» أيضاً، فيمسكها G9');
  });
  await section('G9: التسكين يطبّق النقل', async () => {
    const opened = await open(H.fd, day(-1), 500);
    samples.open_flock_carried_in = opened.value;
    F.fd2 = opened.value?.flock_id;
    same([opened.ok, opened.value?.carried_in], [true, [{ line_id: fdClose.lines[0].line_id, item_id: I.y, name: 'علف التسمين', qty: '200', base_unit: 'kg' },
      { line_id: fdClose.lines[1].line_id, item_id: I.u, name: 'علف بلا وزن', qty: '1', base_unit: 'pc' }]],
    'G9: التسكين يطبّق نقل قاعته وحده (200 كغم «علف التسمين» وكيس «علف بلا وزن»)');
    const r = await report(F.fd2);
    const f = await form(F.fd2);
    const v = await hallsDay(day(-1));
    const rows = await admin("select trim_scale(amount)::text as amount, on_date::text as on from public.flock_costs where flock_id = $1 and doc_kind = 'flock_carry' order by amount desc", [F.fd2]);
    same([rows, pick(r.days[0], ['on', 'feed_given_kg', 'feed_carry_in_kg', 'feed_given_unweighed', 'feed_given_cum_kg', 'feed_given_cum_unweighed']), r.kpis.feed_carry_in_kg,
      r.money.carried_in, r.carry_in.map((c) => [c.qty, c.applied_on, c.from_flock_id, c.money?.value]), f.items.map((i) => [i.name, i.pool_qty, i.pool_kg, i.carry_in_qty,
        i.money?.pool_value, i.stores.map((s) => s.warehouse_id)]), pick(hallOf(v, H.fd).flock, ['feed_given_kg', 'feed_carry_in_kg', 'feed_given_unweighed',
        'feed_given_cum_unweighed']), hallOf(v, H.fd).carry],
    [[{ amount: '140000', on: day(-1) }, { amount: '10000', on: day(-1) }], { on: day(-1), feed_given_kg: '200.000', feed_carry_in_kg: '200.000', feed_given_unweighed: 1,
      feed_given_cum_kg: '200.000', feed_given_cum_unweighed: 1 }, '200.000', '150000.00', [['200', day(-1), F.fd, '140000.00'], ['1', day(-1), F.fd, '10000.00']],
    [['علف التسمين', '200', '200.000', '200', '140000.00', [W.feed]], ['علف بلا وزن', '1', null, '1', '10000.00', [W.feed]]],
    { feed_given_kg: '200.000', feed_carry_in_kg: '200.000', feed_given_unweighed: 1, feed_given_cum_unweighed: 1 }, []],
    'G9: كلفة الفوج الجديد +150,000.00 بيوم تسكينه، و200 كغم نازلة يومه الأوّل وسطر بلا وزن معدود (تقرير الدورة والتقرير اليوميّ)، وفي ما نزل له للإغلاق القادم ومخزنه المخزن الأصليّ');
    const prior = await report(F.fd);
    same([prior.close.lines.map((l) => [l.carry_status, l.to_flock_id, l.applied_on]), prior.money.carried_out],
      [[['applied', F.fd2, day(-1)], ['applied', F.fd2, day(-1)]], '150000.00'], 'G9: سطرا النقل في الدورة المغلقة مطبَّقان على الفوج الجديد بيومه');
    samples.flock_cycle_report_carry_in = r;
    samples.flock_month_carry_in = await one(U.manager, 'select public.flock_month($1, $2)', [F.fd2, TODAY]);
    samples.flock_feed_carry_in = await one(U.manager, 'select public.flock_feed($1)', [F.fd2]);
    const reused = await call(db, U.manager, REOPEN, [fdClose.id, 'إغلاق خاطئ', uid()]);
    const busy = await open(H.fd, TODAY, 100);
    same([reused.code, reused.hint, busy.code], ['hall_reused', `سُكّن في «قاعة د» فوج جديد يوم ${dmy(day(-1))} بعد هذه الدورة، فلا يُعاد فتحها.`, 'hall_busy'],
      'G9: لا إعادة فتح بعد تسكين فوج جديد في القاعة (hall_reused يسمّي يومه)');
  });
  await section('G9: الفوج التالي يُغلق فيرجع المنقول إليه إلى المخزن الأصليّ', async () => {
    // FD2: ما نزل له المنقول وحده (200 كغم بـ140,000.00 وكيس بلا وزن)؛ إرجاع الـ200 كلّها ← 140,000.00، والدفعة الراجعة بترتيب دفعة صرف FD (عبر النقل المطبَّق).
    const f = await form(F.fd2);
    const v = await call(db, U.manager, CLOSE, closeArgs(f, F.fd2, TODAY, { reason: 'نهاية التجربة', lines: [back(I.y, '200'), used(I.u, '1')] }));
    const lot = (await lots(I.y)).find((l) => l.source === 'flock_return' && l.qty_in === '200');
    const yLot = (await lots(I.y)).find((l) => l.source === 'opening');
    same([v.ok, v.value?.lines?.map((l) => [l.action, l.money?.value ?? null]), lot?.seq === yLot?.seq, await costs(F.fd2), (await report(F.fd2)).kpis.feed_net_kg],
      [true, [['return', '140000.00'], ['consumed', null]], true, '10000.00', null],
      'G9: إغلاق الفوج التالي يرجع المنقول إليه بقيمته (140,000.00) بدفعة بترتيب دفعة الصرف الأصليّ، ويبقى الكيس المستهلَك في كلفته، والعلف الصافي مجهول بسطره بلا وزن');
    // القاعة بلا فوج قائم الآن، لكنّ الفوج الذي طُبّق عليه النقل سُكّن بعد إغلاق FD: إعادة فتح FD hall_reused يسمّي يوم تسكينه. M21: بديل ساذج يعدّ القائم
    // وحده «فوجاً جديداً» فيعبر hall_reused ولا يقف إلّا عند فحص النقل carry_used (المطبَّق)، فيمسكه الفحص. (وبلا الفحصين معاً يقف التراجع عند قيد الجدول
    // flock_close_lines_carry_check برسالة خام: سطر مطبَّق لا يصير ملغى.)
    const real = await call(db, U.manager, REOPEN, [fdClose.id, 'إغلاق خاطئ', uid()]);
    const weaker = await broken([[SIG.reopen, [["and (y.status in ('preparing', 'active') or y.placed_on >= x.closed_on)", "and y.status in ('preparing', 'active')"]]]],
      ({ attempt }) => inside(attempt, U.manager, REOPEN, [fdClose.id, 'إغلاق خاطئ', uid()]));
    same([real.code, real.hint, weaker?.code], ['hall_reused', `سُكّن في «قاعة د» فوج جديد يوم ${dmy(day(-1))} بعد هذه الدورة، فلا يُعاد فتحها.`, 'carry_used'],
      'إعادة فتح دورة طُبّق نقلها على فوج أُغلق بعدُ: hall_reused؛ وطفرة M21 (القائم وحده جديد) تعبره إلى carry_used، فيمسكها الفحص');
  });
  await section('G9: المنقول يرجع إلى مخزن قبل التسكين', async () => {
    const before = await costs(F.fe);
    const ret = await call(db, U.manager, RETURN_CARRY, [uid(), id(901), feClose.lines[0].line_id, W.feed]);
    samples.return_hall_carry = ret.value;
    const lot = (await lots(I.y)).find((l) => l.source === 'flock_return' && l.qty_in === '300');
    const yLot = (await lots(I.y)).find((l) => l.source === 'opening');
    const r = await report(F.fe);
    const snapshot = (await admin('select cost_total::text as v from public.flock_close_values where close_id = $1', [feClose.id]))[0].v;
    same([ret.ok, ret.value?.money?.value, lot?.value_in, lot?.seq === yLot?.seq, lot?.received, await costs(F.fe), before, snapshot, r.close.lines[0].carry_status,
      pick(r.money, ['returned', 'carried_out'])],
    [true, '210000.00', '210000', true, TODAY, before, before, before, 'returned', { returned: '210000.00', carried_out: '0.00' }],
    'G9: المنقول يرجع بقيمته المنقولة (300 × 700 = 210,000.00) بدفعة بترتيب دفعة الصرف ويوم اليوم، وكلفة الفوج المغلق كما هي (= لقطة الإغلاق)');
    const again = await call(db, U.manager, RETURN_CARRY, [uid(), uid(), feClose.lines[0].line_id, W.feed]);
    const todayView = hallOf(await hallsDay(TODAY), H.fe);
    const yesterdayView = hallOf(await hallsDay(day(-1)), H.fe);
    same([again.code, again.hint, todayView.carry, yesterdayView.carry.map((c) => c.qty)], ['carry_not_pending', 'العلف المنقول «علف التسمين» أُرجع إلى مخزن من قبل.', [], ['300']],
      'G9: الإرجاع الثاني carry_not_pending، والقاعة تعرض المنقول حتى يوم إرجاعه');
    const used = await call(db, U.manager, REOPEN, [feClose.id, 'إغلاق خاطئ', uid()]);
    const doc = (await admin('select doc_no from public.flock_returns where id = $1', [id(901)]))[0].doc_no;
    same([used.code, used.hint], ['carry_used', `العلف المنقول «علف التسمين» أُرجع إلى «${await whName(W.feed)}» بالمستند ${doc}، فلا يُعاد فتح الدورة.`],
      'G9: لا إعادة فتح بعد إرجاع المنقول (carry_used يسمّي المخزن والمستند)');
    Object.assign(samples, { refusal_carry_used: { code: used.code, hint: used.hint } });
  });
  await section('طفرة إعادة الفتح بعد استعمال المنقول (M15)', async () => {
    // بديل ساذج: إعادة الفتح لا تنظر في حالة النقل، فتعيد دورة FE قائمة وعلفها المنقول في المخزن، فيُحسب ما نزل لها مرّتين.
    const v = await broken([[SIG.reopen, [['  if l.id is not null then\n    raise exception \'carry_used\'', '  if false then\n    raise exception \'carry_used\'']]]],
      ({ attempt }) => inside(attempt, U.manager, REOPEN, [feClose.id, 'إغلاق خاطئ', uid()]));
    same([v?.code, v?.status], [undefined, 'reopened'], 'طفرة M15 (إعادة الفتح بعد استعمال المنقول): تُعاد الدورة، فيمسكها فحص carry_used');
  });
  await section('ما نزل لـFE بعد إرجاع منقوله (M20)', async () => {
    // FE: نزل 1,000 كغم، ونُقل 300 (أُرجع بعدُ إلى المخزن): ما في القاعة له 700؛ والطرح الثاني للمنقول المُرجَع (مستند FR بمصدر النقل) يجعله 400.
    const real = await form(F.fe);
    const twice = await broken([[SIG.pool, [["x.flock_id = f.id and x.source = 'close' and x.status = 'posted'", "x.flock_id = f.id and x.source in ('close', 'carry') and x.status = 'posted'"]]]],
      ({ attempt }) => inside(attempt, U.manager, 'select public.flock_close_form($1)', [F.fe]));
    same([real.items.map((i) => i.pool_qty), twice?.items?.map((i) => i.pool_qty)], [['700'], ['400']],
      'ما نزل لـFE بعد إرجاع منقوله 700 كغم؛ وطفرة M20 (المنقول المُرجَع يُطرح مرّتين) 400، فيمسكها الفحص');
  });

  // ── رفض الإغلاق: التذاكر المعلّقة ومصير الباقي ─────────────────────────────────────────────────────────────────────
  // FT: تذكرة مكتملة بـ40 طيراً بلا فاتورة (يوم اليوم): الإغلاق tickets_pending يسمّيها، والتقرير اليوميّ يعدّها ticketed.
  const TT = await ticket(TODAY, [[H.ft, 40, '100']]);
  const ttNo = TT.ticket_no;
  await section('التذاكر المعلّقة (و M11)', async () => {
    const pending = await closeCall(F.ft, TODAY, { reason: 'نهاية الدورة' });
    const f = await form(F.ft);
    samples.flock_close_form_pending = f;
    Object.assign(samples, { refusal_tickets_pending: { code: pending.code, hint: pending.hint } });
    const v = await hallsDay(TODAY);
    same([pending.code, pending.hint, f.can_close, f.why_not, f.pending_tickets.map((x) => [x.ticket_no, x.birds]), hallOf(v, H.ft).flock.ticketed],
      ['tickets_pending', `تذاكر وزن بلا فاتورة لهذه القاعة: ${ttNo}. تُصدر فواتيرها أو تُلغى قبل إغلاق الدورة.`, false, 'tickets_pending', [[ttNo, 40]], 40],
      'الإغلاق مع تذكرة بلا فاتورة tickets_pending يسمّيها، والنموذج يقول لماذا، والتقرير اليوميّ يعدّ طيورها على التذاكر');
    // M11: بديل ساذج يغلق والتذكرة بلا فاتورة (فتبقى الطيور «خارجة» بلا فاتورة ولا تُفوتر بعد الإغلاق).
    const mutated = await broken([[SIG.close, [['  if v_pending is not null then\n    raise exception \'tickets_pending\'', '  if false then\n    raise exception \'tickets_pending\'']]]],
      async ({ attempt }) => inside(attempt, U.manager, CLOSE, closeArgs(f, F.ft, TODAY, { reason: 'نهاية الدورة' })));
    same([mutated?.code, mutated?.status], [undefined, 'closed'], 'طفرة M11 (الإغلاق يتجاهل التذاكر المعلّقة): يُغلق، فيمسكها فحص tickets_pending');
  });
  await section('مصير الباقي: المدخلات والمخزن الذي جاء منه', async () => {
    const f = await form(F.r2a);
    const tries = [
      [[{ item_id: I.y, qty: '100', action: 'eat' }], 'bad_action'],
      [[back(I.y, '150')], 'over_pool'],
      [[back(I.x, '10')], 'not_in_pool'],
      [[back(I.y, '10', W.farm)], 'not_from_store'],
      [[{ item_id: I.y, qty: '10', action: 'return' }], 'store_required'],
      [[{ ...carry(I.y, '10'), warehouse_id: W.feed }], 'store_not_allowed'],
      [[carry(I.y, '10'), used(I.y, '5')], 'duplicate_line'],
      [[back(I.y, '0')], 'qty_not_positive'],
    ];
    const codes = [];
    for (const [lines] of tries) codes.push((await call(db, U.manager, CLOSE, closeArgs(f, F.r2a, TODAY, { reason: 'نهاية الدورة', lines }))).code);
    const fromStore = await call(db, U.manager, CLOSE, closeArgs(f, F.r2a, TODAY, { reason: 'نهاية الدورة', lines: [back(I.y, '10', W.farm)] }));
    const layer = await closeCall(F.l, TODAY, { reason: 'نهاية الدورة' });
    const worker = await closeCall(F.r2a, TODAY, { reason: 'نهاية الدورة' }, U.worker);
    const accountant = await closeCall(F.r2a, TODAY, { reason: 'نهاية الدورة' }, U.accountant);
    same([codes, fromStore.hint, layer.code, worker.code, accountant.code],
      [tries.map(([, code]) => code), `«علف التسمين» لم يأتِ إلى هذه القاعة من «مخزن حقل الإغلاق». اختر مخزناً جاء منه: «${await whName(W.feed)}».`, 'close_layer_later',
        'forbidden', 'forbidden'],
      'مصير الباقي: مصير غير معروف، وأكثر ممّا نزل، ومادّة لم تنزل، ومخزن لم تأتِ منه (يُسمّى الذي جاءت منه)، وبلا مخزن، ومخزن لغير الإرجاع، ومكرّرة، وصفر؛ والبيّاض لاحقاً، وعامل القاعة والمحاسب لا يغلقان');
  });

  // ── السباقات بجلستين حقيقيتين ───────────────────────────────────────────────────────────────────────────────────
  // R2 (F:885): صرف وإغلاق لفوج واحد. الصرف أوّلاً: الإغلاق ينتظر ثمّ pool_changed (ما رآه 100 كغم وصار 150). الإغلاق أوّلاً: الصرف ينتظر ثمّ flock_closed.
  await section('R2 الصرف أوّلاً', async () => {
    const f = await form(F.r2a);
    const out = await race([U.manager, ISSUE, [uid(), uid(), uid(), F.r2a, I.y, '50', TODAY, W.feed]],
      [U.manager, CLOSE, closeArgs(f, F.r2a, TODAY, { reason: 'نهاية الدورة' })]);
    same([out.state, out.first.ok, out.second.code, (await form(F.r2a)).items.map((i) => i.pool_qty)], ['blocked', true, 'pool_changed', ['150']],
      'R2 الصرف أوّلاً: الإغلاق ينتظر ثمّ pool_changed، وما نزل 150 كغم');
  });
  await section('R2 الإغلاق أوّلاً', async () => {
    const f = await form(F.r2b);
    const out = await race([U.manager, CLOSE, closeArgs(f, F.r2b, TODAY, { reason: 'نهاية الدورة' })],
      [U.manager, ISSUE, [uid(), uid(), uid(), F.r2b, I.y, '50', TODAY, W.feed]]);
    same([out.state, out.first.ok, out.second.code, (await form(F.r2b)).flock.status], ['blocked', true, 'flock_closed', 'closed'],
      'R2 الإغلاق أوّلاً: الصرف ينتظر ثمّ flock_closed');
  });
  // R3: فاتورة وإغلاق. الفاتورة أوّلاً (60 من 100): الإغلاق ينتظر ثمّ live_changed (رأى 100 وصار 40). الإغلاق أوّلاً والتذكرة الثانية (40) بلا فاتورة:
  // الإغلاق يُرفض tickets_pending وهو ماسك الفوج، والفاتورة تنتظر ثمّ تُرحَّل؛ ثمّ يُغلق والحيّ صفر.
  const T3a = await ticket(TODAY, [[H.r3, 60, '150']]);
  let S3a = null;
  await section('R3 الفاتورة أوّلاً', async () => {
    const f = await form(F.r3);
    const out = await race([U.accountant, SELL, sellArgs({ ticket: T3a })], [U.manager, CLOSE, closeArgs(f, F.r3, TODAY, { reason: 'نهاية الدورة' })]);
    S3a = out.first.v;
    same([out.state, out.first.ok, out.second.code, await live(F.r3)], ['blocked', true, 'live_changed', 40], 'R3 الفاتورة أوّلاً: الإغلاق ينتظر ثمّ live_changed، والحيّ 40');
  });
  await section('R3 الإغلاق أوّلاً', async () => {
    // الإغلاق يُرفض tickets_pending تحت قفل الفوج، والمعاملة المرفوضة تُفلت أقفالها لحظة رفضها (لا عند rollback)، فالفاتورة لا تنتظر وتُرحَّل؛ ثمّ يُغلق.
    const T3b = await ticket(TODAY, [[H.r3, 40, '100']]);
    const f = await form(F.r3);
    const out = await race([U.manager, CLOSE, closeArgs(f, F.r3, TODAY, { reason: 'نهاية الدورة' })], [U.accountant, SELL, sellArgs({ ticket: T3b })]);
    const closed = await closeOk(F.r3, TODAY);
    same([out.state, out.first.code, out.second.ok, closed.status, closed.sold_birds, closed.count_diff], ['finished', 'tickets_pending', true, 'closed', 100, 0],
      'R3 الإغلاق أوّلاً: يُرفض tickets_pending ولا يُبقي قفلاً، والفاتورة تُرحَّل، ثمّ يُغلق بمباع 100 وبلا فرق عدّ');
  });
  await section('إلغاء فاتورة على دورة مغلقة (و M16)', async () => {
    const refused = await call(db, U.manager, VOID_SALE, [S3a.id, 'سعر خاطئ', uid()]);
    same([refused.code, refused.hint], ['flock_closed', 'فوج «قاعة ف» مغلق، فلا تُلغى فاتورة بيع طيوره. أعد فتح الدورة أوّلاً.'], 'إلغاء فاتورة فوج مغلق flock_closed');
    // M16: بديل ساذج يلغي الفاتورة على الدورة المغلقة فتعود 60 طيراً حيّةً في فوج مغلق (حيّ المغلق غير صفر).
    const v = await broken([[SIG.voidSale, [['  if found then\n    raise exception \'flock_closed\'', '  if false then\n    raise exception \'flock_closed\'']]]],
      async ({ attempt, oq }) => {
        const voided = await inside(attempt, U.manager, VOID_SALE, [S3a.id, 'سعر خاطئ', uid()]);
        return { voided, live: (await oq('select private.flock_live(f)::int as n from public.flocks f where f.id = $1', [F.r3])).rows[0].n };
      });
    same([v.voided?.status, v.live], ['void', 60], 'طفرة M16 (إلغاء فاتورة على دورة مغلقة): يُلغى ويصير حيّ المغلق 60، فيمسكها الفحص');
  });
  // R4: إلغاء فاتورة وإغلاق (الحيّ صفر بعد الفاتورة). الإغلاق أوّلاً: الإلغاء ينتظر ثمّ flock_closed. الإلغاء أوّلاً: الإغلاق ينتظر ثمّ tickets_pending (التذكرة
  // عادت بلا فاتورة).
  const S4 = {};
  for (const key of ['r4a', 'r4b']) S4[key] = await sell(await ticket(TODAY, [[H[key], 100, '250']]));
  await section('R4 الإغلاق أوّلاً', async () => {
    const f = await form(F.r4a);
    const out = await race([U.manager, CLOSE, closeArgs(f, F.r4a, TODAY)], [U.manager, VOID_SALE, [S4.r4a.id, 'سعر خاطئ', uid()]]);
    same([out.state, out.first.ok, out.second.code], ['blocked', true, 'flock_closed'], 'R4 الإغلاق أوّلاً: الإلغاء ينتظر ثمّ flock_closed');
  });
  await section('R4 الإلغاء أوّلاً', async () => {
    const f = await form(F.r4b);
    const out = await race([U.manager, VOID_SALE, [S4.r4b.id, 'سعر خاطئ', uid()]], [U.manager, CLOSE, closeArgs(f, F.r4b, TODAY)]);
    same([out.state, out.first.ok, out.second.code, await live(F.r4b)], ['blocked', true, 'tickets_pending', 100],
      'R4 الإلغاء أوّلاً: الإغلاق ينتظر ثمّ tickets_pending، والطيور حيّة 100');
  });
  // R5: تسكين وإرجاع المنقول لسطر واحد (القاعة تُقفل لهما). التسكين أوّلاً: الإرجاع ينتظر ثمّ carry_not_pending (طُبّق). الإرجاع أوّلاً: التسكين ينتظر ثمّ بلا
  // منقول.
  const carryLine = async (flock) => (await admin("select l.id from public.flock_close_lines l join public.flock_closes c on c.id = l.close_id where c.flock_id = $1 and c.status = 'closed' and l.action = 'carry'", [flock]))[0].id;
  await section('R5 التسكين أوّلاً', async () => {
    const line = await carryLine(F.r5a);
    const out = await race([U.manager, OPEN, [H.r5a, day(-1), 100, uid()]], [U.manager, RETURN_CARRY, [uid(), uid(), line, W.feed]]);
    const status = (await admin('select carry_status, to_flock_id from public.flock_close_lines where id = $1', [line]))[0];
    same([out.state, out.first.v?.carried_in?.map((c) => c.line_id), out.second.code, status.carry_status, status.to_flock_id], ['blocked', [line], 'carry_not_pending', 'applied',
      out.first.v?.flock_id], 'R5 التسكين أوّلاً: الإرجاع ينتظر ثمّ carry_not_pending، والنقل مطبَّق على الفوج الجديد');
  });
  await section('R5 الإرجاع أوّلاً', async () => {
    const line = await carryLine(F.r5b);
    const out = await race([U.manager, RETURN_CARRY, [uid(), uid(), line, W.feed]], [U.manager, OPEN, [H.r5b, day(-1), 100, uid()]]);
    same([out.state, out.first.ok, out.second.ok, out.second.v?.carried_in, (await admin('select carry_status from public.flock_close_lines where id = $1', [line]))[0].carry_status],
      ['blocked', true, true, [], 'returned'], 'R5 الإرجاع أوّلاً: التسكين ينتظر ثمّ يُسكَّن بلا منقول، والنقل مُرجَع');
  });
  // R6: إعادة فتح وتسكين في قاعة واحدة. إعادة الفتح أوّلاً: التسكين ينتظر ثمّ hall_busy. التسكين أوّلاً: إعادة الفتح تنتظر ثمّ hall_reused.
  const closeOf = async (flock) => (await admin("select id from public.flock_closes where flock_id = $1 and status = 'closed'", [flock]))[0].id;
  await section('R6 إعادة الفتح أوّلاً', async () => {
    const closeId = await closeOf(F.r6a);
    const out = await race([U.manager, REOPEN, [closeId, 'إغلاق خاطئ', uid()]], [U.manager, OPEN, [H.r6a, day(-1), 100, uid()]]);
    samples.reopen_flock_plain = out.first.v;
    same([out.state, out.first.v?.status, out.second.code, (await form(F.r6a)).flock.status, await live(F.r6a)], ['blocked', 'reopened', 'hall_busy', 'active', 100],
      'R6 إعادة الفتح أوّلاً: التسكين ينتظر ثمّ hall_busy، والدورة قائمة بحيّها 100 (فرق العدّ معكوس)');
  });
  await section('R6 التسكين أوّلاً', async () => {
    const closeId = await closeOf(F.r6b);
    const out = await race([U.manager, OPEN, [H.r6b, day(-1), 100, uid()]], [U.manager, REOPEN, [closeId, 'إغلاق خاطئ', uid()]]);
    same([out.state, out.first.ok, out.second.code], ['blocked', true, 'hall_reused'], 'R6 التسكين أوّلاً: إعادة الفتح تنتظر ثمّ hall_reused');
  });
  // R10: حفظ تذكرة وإغلاق الفوج. الإغلاق أوّلاً: الحفظ ينتظر ثمّ no_active_flock. الحفظ أوّلاً: الإغلاق ينتظر ثمّ tickets_pending (مسوّدة).
  const draft = (hallId) => ({ site_id: S.a, on_date: TODAY, method: 'scale', empty_kg: '7000', empty_with_crates: true, crate_kg: null,
    stops: [{ id: uid(), hall_id: hallId, birds: 50, crates: 5, gross_kg: '7120', weighings: [] }] });
  await section('R10 الإغلاق أوّلاً', async () => {
    const f = await form(F.r10a);
    const out = await race([U.manager, CLOSE, closeArgs(f, F.r10a, TODAY, { reason: 'نهاية الدورة' })], [U.worker, SAVE_TICKET, [uid(), null, JSON.stringify(draft(H.r10a))]]);
    same([out.state, out.first.ok, out.second.code], ['blocked', true, 'no_active_flock'], 'R10 الإغلاق أوّلاً: حفظ التذكرة ينتظر ثمّ no_active_flock');
  });
  await section('R10 الحفظ أوّلاً', async () => {
    const f = await form(F.r10b);
    const out = await race([U.worker, SAVE_TICKET, [uid(), null, JSON.stringify(draft(H.r10b))]], [U.manager, CLOSE, closeArgs(f, F.r10b, TODAY, { reason: 'نهاية الدورة' })]);
    same([out.state, out.first.v?.status, out.second.code], ['blocked', 'saved', 'tickets_pending'], 'R10 الحفظ أوّلاً: الإغلاق ينتظر ثمّ tickets_pending (المسوّدة)');
  });

  // ── إعادة الفتح ثمّ الإغلاق من جديد (FB): الإرجاع يُلغى ويعود ما نزل كما كان، والإغلاق الثاني بالقيم نفسها ───────────────────────────────
  await section('إعادة الفتح والإغلاق من جديد', async () => {
    const result = await call(db, U.manager, REOPEN, [fbClose, 'كمية الباقي خاطئة', uid()]);
    samples.reopen_flock = result.value;
    const replay = await call(db, U.manager, CLOSE, closeArgs(await form(F.fb), F.fb, TODAY, { ref: fbRef, closeId: fbClose, reason: 'لم تُبَع بعد',
      lines: [back(I.p, '1000'), carry(I.q, '2000')] }));
    const f = await form(F.fb);
    const twice = await call(db, U.manager, REOPEN, [fbClose, 'كمية الباقي خاطئة', uid()]);
    const moves = await admin("select trim_scale(qty)::text as qty, moved_on::text as on from public.stock_moves where doc_kind = 'flock_return' and item_id = $1 order by seq", [I.p]);
    same([result.ok, result.value?.status, result.value?.reversed_returns, result.value?.reversed_count, result.value?.money, replay.code, twice.code,
      f.flock.status, f.flock.live, f.items.map((i) => [i.name, i.pool_qty, i.money?.pool_value]), moves, await costs(F.fb)],
    [true, 'reopened', 1, 1000, { returned_value: '694579.56', carried_value: '1389159.13' }, 'id_conflict', 'already_reopened', 'active', 1000,
      [['علف نامي', '3000', '2083738.69'], ['علف ناهي', '3000', '2083738.69']], [{ qty: '1000', on: TODAY }, { qty: '-1000', on: TODAY }], '4167477.38'],
    'إعادة الفتح: الإرجاع معكوس ومستنده ملغى والنقل ملغى وفرق العدّ معكوس، والفوج قائم بما نزل كلّه بقيمته؛ وإعادة الإغلاق القديم بمرجعه id_conflict، والثانية already_reopened');
    const again = await closeOk(F.fb, TODAY, { reason: 'لم تُبَع بعد', lines: [back(I.p, '1000'), carry(I.q, '2000')] });
    same([again.lines.map((l) => l.money.value), await costs(F.fb)], [['694579.56', '1389159.13'], '2083738.69'], 'الإغلاق الثاني بعد إعادة الفتح بالقيم نفسها');
  });
  await section('القاعة بعد الإغلاق: لا تسكين يوم الإغلاق، ولا أرشفة والمنقول معلَّق', async () => {
    const sameDay = await open(H.g6, TODAY, 100);
    let archived = null;
    try {
      await db.asUser(U.owner, (q) => q('update public.halls set archived_at = now() where id = $1', [H.g6]));
    } catch (error) {
      archived = { code: error.message, hint: error.hint };
    }
    same([sameDay.code, sameDay.hint, archived?.code, archived?.hint], ['before_last_close', `آخر دورة في «قاعة 6» أُغلقت يوم ${dmy(TODAY)}، فلا يُسكَّن فوج في يومها أو قبله.`,
      'hall_has_carry', 'في القاعة «قاعة 6» علف منقول للدورة التالية، فلا تُؤرشف قبل أن يُرجَع إلى مخزن.'],
    'لا تسكين في يوم إغلاق آخر دورة (before_last_close)، ولا أرشفة لقاعة فيها علف منقول (hall_has_carry)');
    Object.assign(samples, { refusal_before_last_close: { code: sameDay.code, hint: sameDay.hint } });
  });

  // ── قرّاء 0027 لفوج بلا بيع ولا إغلاق: أجسام 0027 نفسها (rollback_0028.sql) على البيانات نفسها، والمفاتيح الجديدة وحدها زائدة ───────────────
  await section('قرّاء 0027 كما هي لفوج بلا بيع ولا إغلاق', async () => {
    const days = Array.from({ length: 10 }, (_, k) => day(k - 9));
    const old = await mutant(db, U.manager, [], async ({ oq, attempt }) => {
      for (const body of bodies0027()) await oq(body);
      const read = async (user, sql, params = []) => inside(attempt, user, sql, params);
      const out = { day: {}, managerDay: {} };
      for (const on of days) {
        out.day[on] = await read(U.plain, 'select public.halls_day($1)', [on]);
        out.managerDay[on] = (await read(U.manager, 'select public.halls_day($1)', [on])).sites.find((s) => s.id === S.p);
      }
      out.report = await read(U.manager, 'select public.flock_cycle_report($1)', [F.p]);
      out.reportPlain = await read(U.plain, 'select public.flock_cycle_report($1)', [F.p]);
      out.cycles = await read(U.plain, 'select public.flock_cycles()');
      return out;
    });
    const problems = [];
    const compare = (name, a, b) => {
      if (canon(a) !== canon(b)) problems.push(name);
    };
    for (const on of days) {
      const now = await hallsDay(on, U.plain);
      compare(`halls_day ${on}`, dayAs0027(now), old.day[on]);
      const managerSite = (await hallsDay(on)).sites.find((s) => s.id === S.p);
      compare(`halls_day للمدير ${on}`, dayAs0027({ sites: [managerSite], totals: {} }).sites[0], old.managerDay[on]);
      const p1 = hallOf(now, H.p1);
      if (p1.flock) {
        compare(`مفاتيح 0028 ${on}`, pick(p1.flock, NEW_KEYS.dayFlock), { sold: 0, sold_net_kg: '0.000', count_diff: 0, ticketed: 0, feed_carry_in_kg: '0', feed_out_kg: '0',
          feed_out_unweighed: 0, feed_out_cum_unweighed: 0 });
      }
      compare(`carry ${on}`, now.sites[0].halls.map((h) => h.carry), [[], []]);
    }
    const r = await report(F.p);
    compare('flock_cycle_report', reportAs0027(r), old.report);
    compare('flock_cycle_report لعامل القاعة', reportAs0027(await report(F.p, U.plain)), old.reportPlain);
    compare('flock_cycles', cyclesAs0027(await one(U.plain, 'select public.flock_cycles()')), old.cycles);
    compare('مفاتيح 0028 في تقرير الدورة', [pick(r.kpis, NEW_KEYS.kpis), pick(r.money, NEW_KEYS.money), r.close, r.carry_in, pick(r.birds, NEW_KEYS.birds)],
      [{ sold_birds: 0, sold_net_kg: '0.000', sold_avg_kg: null, sale_age: null, count_diff: 0, feed_carry_in_kg: '0', feed_out_kg: '0', feed_net_kg: null, fcr_final: null,
        epef_final: null }, { returned: '0', carried_in: '0', carried_out: '0', revenue: '0' }, null, [], { sold: 0, sold_net_kg: '0.000', count_diff: 0, count_reason: null }]);
    same(problems, [], 'قرّاء 0027 (halls_day لعشرة أيّام بنطاقين، وflock_cycle_report بالمال وبلاه، وflock_cycles) لفوج بلا بيع ولا إغلاق: جواب 0027 نفسه حرفاً بحرف بعد نزع مفاتيح 0028، ومفاتيحها بقيم الصفر');
    // ضابط المقارنة: جسم 0028 يغيّر مفتاحاً قديماً (الباقي في القاعة ينقص كيلوغراماً) فتبين المقارنة على أيّام الفوج كلّها.
    const drift = await broken([[SIG.reportDay, [["'feed_left_kg', (r.given_cum_kg - e.out_cum_kg - r.feed_cum_kg)::text", "'feed_left_kg', (r.given_cum_kg - e.out_cum_kg - r.feed_cum_kg - 1)::text"]]]],
      async ({ attempt }) => {
        const differ = [];
        for (const on of days) {
          const now = await inside(attempt, U.plain, 'select public.halls_day($1)', [on]);
          if (canon(dayAs0027(now)) !== canon(old.day[on])) differ.push(on);
        }
        return differ;
      });
    same(drift, days, 'ضابط المقارنة: مفتاح قديم يتغيّر في جسم 0028 تبينه المقارنة في الأيّام العشرة كلّها');
  });

  // ── ضوابط الثوابت: كلّ خرق مثبَّت بمعاملة ترجع يبين في فحصه وحده (verify_flock_close العشرة)، وفحص حفظ القيمة في verify_stock يعدّ الإرجاع ──────
  await section('ضوابط verify_flock_close', async () => {
    const probe = (fn, statements) => db.asOwner(async (q) => {
      for (const [sql, params] of statements) await q(sql, params);
      return Object.fromEntries((await q(`select check_name, violations::int as n from public.${fn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));
    });
    const closeId = async (flock) => (await admin("select id from public.flock_closes where flock_id = $1 and status = 'closed'", [flock]))[0].id;
    const g6 = await closeId(F.g6);
    const g7 = await closeId(F.g7);
    const fb = await closeId(F.fb);
    const frA = (await admin("select r.id, l.lot_id from public.flock_returns r join public.flock_return_lines l on l.return_id = r.id where r.flock_id = $1 and r.status = 'posted'", [F.fa]))[0];
    const fdLine = fdClose.lines[0].line_id;
    const fbReturn = (await admin("select l.id from public.flock_close_lines l where l.close_id = $1 and l.action = 'return'", [fb]))[0].id;
    const unlock = (table) => [`alter table public.${table} disable trigger user`, []];
    same(
      {
        close_shape: await probe('verify_flock_close', [unlock('flocks'), ['update public.flocks set closed_on = closed_on - 1 where id = $1', [F.g6]]]),
        closed_live_zero: await probe('verify_flock_close', [["insert into public.flock_counts (org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, doc_kind, doc_id, reason) select org_id, id, hall_id, site_id, division_id, closed_on, 'count_adjust', 1, 'count_adjust', gen_random_uuid(), 'ضابط' from public.flocks where id = $1", [F.g6]]]),
        activity_after_close: await probe('verify_flock_close', [unlock('flock_weights'), ['update public.flock_weights set on_date = $2 where flock_id = $1', [F.g6, day(1)]]]),
        close_counts: await probe('verify_flock_close', [unlock('flock_counts'), ["update public.flock_counts set reason = 'سبب آخر' where doc_kind = 'flock_close' and doc_id = $1", [g7]]]),
        return_moves: await probe('verify_flock_close', [unlock('stock_lots'), ['update public.stock_lots set expiry_on = expiry_on + 1 where id = $1', [frA.lot_id]]]),
        return_costs: await probe('verify_flock_close', [unlock('flock_costs'), ["update public.flock_costs set on_date = on_date - 1 where doc_kind = 'flock_return' and doc_id = $1", [frA.id]]]),
        carry_costs: await probe('verify_flock_close', [unlock('flock_close_lines'), ['update public.flock_close_lines set applied_on = applied_on - 1 where id = $1', [fdLine]]]),
        return_values: await probe('verify_flock_close', [unlock('flock_close_lines'), ['update public.flock_close_lines set qty_base = qty_base - 1 where id = $1', [fbReturn]]]),
        closed_cost_frozen: await probe('verify_flock_close', [unlock('flock_close_values'), ['update public.flock_close_values set cost_total = cost_total + 1 where close_id = $1', [g6]]]),
        flock_stock_costs: await probe('verify_flock_close', [unlock('flock_costs'), ["update public.flock_costs set amount = amount + 1 where doc_kind = 'flock_issue' and flock_id = $1", [F.fn]]]),
      },
      {
        close_shape: { close_shape: 1 }, closed_live_zero: { closed_live_zero: 1 }, activity_after_close: { activity_after_close: 1 }, close_counts: { close_counts: 1 },
        return_moves: { return_moves: 1 }, return_costs: { return_costs: 1 }, carry_costs: { carry_costs: 1 }, return_values: { return_values: 1 },
        closed_cost_frozen: { closed_cost_frozen: 1 }, flock_stock_costs: { flock_stock_costs: 1 },
      },
      'ضوابط verify_flock_close: يوم الإغلاق في الفوج غير يوم إغلاقه، وحيّ في مغلق، ونشاط بعد الإغلاق، وسبب فرق عدّ غير سبب الإغلاق، وانتهاء دفعة راجعة غير أقربها، ويوم كلفة الإرجاع غير يومه، ويوم تطبيق النقل غير يوم كلفته، وكمية إرجاع لا تطابق قيمته، ولقطة كلفة غير مجموعها، وكلفة صرف غير قيمة سحبه: كلّ واحد في فحصه وحده',
    );
    // verify_stock (الفحص 8، حفظ القيمة): بلا الإرجاع من القاعة في الطرف الخارج يبين كلّ إرجاع مخالفةً (الدفعة الراجعة داخلة وكلفتها السالبة غير معدودة).
    const blind = await broken([['public.verify_stock()', [["c.doc_kind in ('flock_issue', 'flock_return')), 0)\n      + coalesce((select sum(c.cost)", "c.doc_kind in ('flock_issue')), 0)\n      + coalesce((select sum(c.cost)"]]]],
      async ({ oq }) => Object.fromEntries((await oq('select check_name, violations::int as n from public.verify_stock() where violations <> 0')).rows.map((r) => [r.check_name, r.n])));
    same(blind.value_conservation > 0, true, 'طفرة verify_stock (حفظ القيمة بلا الإرجاع من القاعة): المنشأة تخالف، فالفحص يعدّ الإرجاع فعلاً');
  });

  // ── العيّنات ──────────────────────────────────────────────────────────────────────────────────────────────
  if (process.env.BIRDS_SAMPLES_OUT) {
    const read = (user, sql, params = []) => one(user, sql, params);
    Object.assign(samples, {
      halls_day_close: await read(U.manager, 'select public.halls_day($1)', [TODAY]),
      flock_sales_closed: await read(U.manager, 'select public.flock_sales($1)', [F.g6]),
      flock_sales_closed_hall_worker: await read(U.worker, 'select public.flock_sales($1)', [F.g6]),
      flock_cycles_closed: await read(U.manager, 'select public.flock_cycles()'),
      flock_detail_closed: await read(U.manager, 'select public.flock_detail($1)', [F.g6]),
      flock_month_closed: await read(U.manager, 'select public.flock_month($1, $2)', [F.g6, TODAY]),
      flock_feed_closed: await read(U.manager, 'select public.flock_feed($1)', [F.g6]),
      flock_close_form_closed: await read(U.manager, 'select public.flock_close_form($1)', [F.g6]),
    });
    const existing = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
    writeFileSync(FIXTURE, JSON.stringify({ ...existing, ...samples }, null, 1) + '\n');
  }
}
