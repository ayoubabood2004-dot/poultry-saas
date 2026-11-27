// «احذف القاعة» كأنها لم تكن (0037، العقد docs/plans/0037/contract-0037.md «الجزء D»، DECISIONS 2026-11-26): المعاينة بأشكالها (فوج قائم بأيّامه
// وزياراته وغازه وصرفه من «رصيد العلف» وتأشيره المصروف، ودورة منتهية، وقاعة بلا فوج، وقاعة فيها بيع طيور)، وكلّ منع بجملته ورمزه في الحذف (ومنها
// تصحيح السعر والجرد بعد الإرسال: revalued وcounted بدقّة شرطي apply_move، ورمزاه lot_consumed وcount_superseded، ويرفعهما إلغاء التصحيح أو الجرد)، والنسخة
// والبصمة، والإعادة بالمرجع وبالحالة، والمخزون يرجع بالكمية والقيمة ودفتر المادّة يُظهر الإرسال والعكس، وكلّ قارئ بلا الفوج الملغى وكلّ كاتب يرفضه،
// والطابور يركن flock_void، والدورات المنتهية تبقى في «من أوّل ما بدينا» (والأفواج الملغاة بكلّ حال: بصرف وتأشير ومركون وعدّ، وبتذكرة وبيع ملغيين،
// وبلا سجلّ، وبدورة أُغلقت بإرجاع ثمّ أُعيد فتحها، والثوابت كلّها صفر بعدها)، وجلستان حقيقيتان مع void_flock_issue وrecord_flock_issue وundo_vaccination
// وclose_flock وrecord_flock_count_adjust (pg_blocking_pids على الجلسة بعينها، وضوابط بأجسام مثبَّتة بترتيب أقفال آخر تتقافل أو تخطئ السبب ثمّ تعود
// حرفاً)، والثابت verify_delete_hall بضوابطه (ومنها منع البيع والتذاكر والنقل المطبَّق: الحذف بلا منعه داخل معاملة ترجع)، وطفرة لكلّ تغيير في القرّاء
// والكتّاب، وملفّ التراجع (الأجسام حرفاً، ورفضه بصوت، وبلا كتلته يرجّع القديم).
// منشأة هذا الملفّ: المعرّفات d3737000 والهواتف 964770373700+ (ومنشأة ثانية بالمعرّفات d3737000-…-0000000009xx والهواتف 9647703737090+).
// وعيّنات القاعدة الحقيقية للشاشات: DELETE_HALL_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/delete-hall-0037.json.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'delete-hall-0037.json');
const TODAY = '2026-11-26';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const ddmm = (on) => `${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}`;
const id = (n) => `d3737000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477037370${String(n).padStart(2, '0')}`;
/** وقت تسجيل قبل الآن بدقائق (ساعة الخادم الحقيقية). */
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

const PREVIEW = 'select public.delete_hall_preview($1) as v';
const DELETE = 'select public.delete_hall($1, $2, $3, $4) as v';
const RF = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v';
const VF = 'select public.void_flock_issue($1, $2, $3) as v';
const GIVE = 'select public.give_to_flocks($1, $2, $3::jsonb) as v';
const CLOSE = 'select public.close_flock($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11) as v';
const VISIT = 'select public.save_flock_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const DEAD = 'select public.set_flock_dead($1, $2, $3, $4, $5) as v';
const ADD = 'select public.add_flock_gas($1, $2, $3, $4, $5) as v';
const GAS = 'select public.set_flock_gas($1, $2, $3, $4, $5, $6) as v';
const SIG = {
  del: 'public.delete_hall(uuid, integer, text, uuid)',
  blocks: 'private.delete_hall_blocks(public.halls, public.flocks)',
  inScopeSite: 'public.in_scope_site(uuid)',
  inScopeWh: 'public.in_scope_wh(uuid)',
  roleCan: 'private.role_can(text, text, boolean)',
  flockFor: 'private.flock_for(uuid, boolean)',
  dayCheck: 'private.flock_day_check(public.flocks, date)',
  hallsCheck: 'private.halls_check()',
  visit: 'public.save_flock_visit(uuid, uuid, date, timestamp with time zone, integer, integer, numeric, integer, integer, integer, text, integer, boolean, uuid, boolean)',
  day: 'public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean)',
  dead: 'public.set_flock_dead(uuid, date, integer, uuid, boolean)',
  add: 'public.add_flock_gas(uuid, date, integer, uuid, boolean)',
  gas: 'public.set_flock_gas(uuid, date, integer, bigint, uuid, boolean)',
  weight: 'public.record_flock_weight(uuid, date, integer, numeric, uuid)',
  edit: 'public.edit_flock(uuid, integer, date, integer, integer, text, uuid)',
  deleteFlock: 'public.delete_flock(uuid, integer, uuid)',
  record: 'public.record_flock_issue(uuid, uuid, uuid, uuid, uuid, numeric, date, uuid)',
  close: 'public.close_flock(uuid, uuid, uuid, date, integer, integer, jsonb, text, jsonb, text, text)',
  adjust: 'public.record_flock_count_adjust(uuid, uuid, uuid, date, integer, text, integer)',
  detail: 'public.flock_detail(uuid)',
  feed: 'public.flock_feed(uuid)',
  options: 'public.flock_issue_options(uuid)',
  visits: 'public.round_visits(date, text, uuid)',
  hallsDay: 'public.halls_day(date)',
  history: 'public.halls_history(date)',
  cycles: 'public.flock_cycles()',
  voidIssue: 'public.void_flock_issue(uuid, text, uuid)',
  verifySheet: 'public.verify_hall_sheet()',
};
const VERIFY_ZERO = { void_flock_posted_issue: 0, void_flock_done_vaccination: 0, void_flock_live_hall: 0, void_flock_costs: 0, void_flock_shape: 0, void_flock_posted_sale: 0,
  void_flock_live_ticket: 0, void_flock_applied_carry: 0 };
const VOID_HINT = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';

/** جسم دالّة كما في ملفّ هجرتها (من «create or replace function» حتى «$$;»). */
const bodyOf = (file, head) => {
  const text = readFileSync(path.join(MIGRATIONS, file), 'utf8');
  const start = text.indexOf(`create or replace function ${head}(`);
  return start < 0 ? `غير موجود: ${head} في ${file}` : text.slice(start, text.indexOf('\n$$;', start) + 4);
};
/** نصّ الجسم بين علامتي الدولار (prosrc). */
const srcOf = (body) => body.slice(body.indexOf('$$') + 2, body.lastIndexOf('$$'));

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
    name: 'مزرعة الحذف',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['keeper', 'storekeeper'],
      ['mill', 'mill_operator'],
      ['hatchery', 'hatchery_operator'],
      ['worker', 'hall_worker', ['broiler']],
      ['accountant', 'accountant'],
      ['viewer', 'viewer'],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const code = (result) => (result.ok ? 'ok' : result.code);
  const refusal = (result) => (result.ok ? { ok: result.value } : { code: result.code, hint: result.hint });
  const dry = (user, sql, params) => call(db, user, sql, params, { commit: false });
  const preview = (hallId, user = U.manager) => one(user, PREVIEW, [hallId]);
  const del = (user, hallId, p, ref = uid(), options) => call(db, user, DELETE, [hallId, p.hall.version, p.plan, ref], options);
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  const scalar = async (sql, params = []) => Object.values((await db.admin(sql, params)).rows[0] ?? {})[0];
  /** دالّة مثبَّتة بطفرة للجلستين، ثمّ تعود حرفاً (pg_get_functiondef). */
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
  /** الجلسة waiter محبوسة على قفل تمسكه holder بعينها (pg_blocking_pids)، لا على أيّ انتظار. */
  const blockedBy = async (waiter, holder, pending, ms = 5000) => {
    let done = false;
    pending.then(() => {
      done = true;
    });
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (done) return false;
      if ((await db.admin('select $1::int = any (pg_blocking_pids($2::int)) as b', [holder, waiter])).rows[0].b) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  };
  /** سباق جلستين: الأولى تنفّذ وتبقى مفتوحة، والثانية تنحبس عليها بعينها، ثمّ تثبّت الأولى، وتكمل الثانية وتثبّت إن نجحت. */
  const duel = async (first, second) => {
    const a = await db.session(first.user);
    const b = await db.session(second.user);
    try {
      const one1 = await a.run(first.sql, first.params);
      const pending = b.run(second.sql, second.params);
      const blocked = await blockedBy(b.pid, a.pid, pending);
      if (one1.ok) await a.commit();
      else await a.rollback();
      const two = await pending;
      if (two.ok) await b.commit();
      else await b.rollback();
      return { first: one1, blocked, second: two };
    } finally {
      await a.rollback();
      await b.rollback();
    }
  };

  // ── البذرة: منشأة كمنشأة الزبون ─────────────────────────────────────────────────────────────────────────────────────
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const storeName = async (wh) => scalar('select name from public.warehouses where id = $1', [wh]);
  t.eq(await storeName(W.feed), 'رصيد العلف', 'مخزن العلف في المعمل «رصيد العلف»');
  const site = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل لحم', 'farm') returning id", [D.broiler]);
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name, capacity) values ($1, $2, 30000) returning id', [site, name]);
  const NAMES = {
    t8: 'قاعة 8 تجريبي', t1: 'قاعه 1 تجريبي', t4: 'قاعه 4 تجريبي', t5: 'قاعه 5 تجريبي', ended: 'قاعة الدورة المنتهية', empty: 'قاعة فارغة',
    sale: 'قاعة البيع', ticket: 'قاعة التذكرة', carryPending: 'قاعة النقل المعلّق', carryApplied: 'قاعة النقل المطبّق',
    reopened: 'قاعة الدورة المعادة', twoCycles: 'قاعة الدورتين',
    ...Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`c${k + 1}`, `قاعة السباق ${k + 1}`])),
  };
  const H = {};
  for (const [key, name] of Object.entries(NAMES)) H[key] = await hall(name);
  const open = async (hallId, on, count) => (await one(U.owner, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const item = (name, kind, unit) => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = { m1: await item('علف م/1', 'feed', 'kg'), m2: await item('علف م/2', 'feed', 'kg'), nd: await item('لقاح نيوكاسل', 'vaccine', 'pc') };
  await postedOpening(db, U.owner, W.feed, day(-7), [{ item: I.m1, qty: 200000, value: '70000000.00' }, { item: I.m2, qty: 50000, value: '20000000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-7), [{ item: I.nd, qty: 1000, value: '100000.00' }]);
  const party = await one(U.owner, "insert into public.parties (name, is_customer) values ('زبون الطيور', true) returning id", []);
  const VAC = id(201);
  await one(U.manager, 'select public.save_vaccine($1, $2, $3, $4) as v', [VAC, 'نيوكاسل', I.nd, null]);
  await one(U.manager, 'select public.save_vaccine_program($1, $2, $3::jsonb, $4) as v', ['broiler', 42, JSON.stringify([{ vaccine_id: VAC, age_day: 7 }]), 0]);
  const issue = (user, o) => one(user, RF, [uid(), o.issue ?? uid(), o.line ?? uid(), o.flock, o.item, o.qty, o.on ?? TODAY, o.wh ?? W.feed]);
  const vaccinate = (user, flockId, n) => one(user, GIVE, [uid(), TODAY, JSON.stringify([{ kind: 'vaccination', flock_id: flockId, id: id(n), vaccine_id: VAC, age_day: 7,
    item_id: I.nd, issue_id: id(n + 1), line_id: id(n + 2), warehouse_id: W.medicine, qty: '25' }])]);
  const ticketData = (hallId, stop, on = TODAY) => JSON.stringify({ site_id: site, on_date: on, method: 'scale', empty_kg: '7000', empty_with_crates: false, crate_kg: '6',
    stops: [{ id: stop, hall_id: hallId, birds: 100, crates: 10, gross_kg: '7300', weighings: [] }] });
  const draftTicket = (hallId, n) => one(U.owner, 'select public.save_weigh_ticket($1, null, $2::jsonb) as v', [id(n), ticketData(hallId, id(n + 1))]);
  const liveOf = async (flockId) => Number((await one(U.owner, 'select public.flock_detail($1) as v', [flockId])).flock.live);
  const closeForm = async (flockId) => one(U.owner, 'select public.flock_close_form($1) as v', [flockId]);

  const F = {};
  // «قاعة 8 تجريبي» كقاعات الزبون: 25,250 طيراً قبل 13 يوماً، وجولة كلّ يوم (14 يوماً بهلاكاتها، زيارة واحدة لكلّ يوم)، والغاز 13 يوماً، وسبع
  // إرسالات علف من «رصيد العلف» (خمس من «علف م/1» بألفين واثنتان من «علف م/2» بألف)، وتأشير لقاح مصروف من مخزن الأدوية، ودواء، ووزن، وفرق عدّ،
  // وتذكرة وزن أُلغيت.
  await section('بذرة قاعة 8', async () => {
    F.t8 = await open(H.t8, day(-13), 25250);
    for (let k = 0; k <= 13; k += 1) await one(U.worker, DEAD, [F.t8, day(k - 13), 10 + k, uid(), false]);
    for (let k = 1; k <= 13; k += 1) await one(U.worker, ADD, [F.t8, day(k - 13), 2, uid(), false]);
    for (const [on, it, qty] of [[day(-6), I.m1, 2000], [day(-5), I.m1, 2000], [day(-4), I.m1, 2000], [day(-3), I.m2, 1000], [day(-2), I.m1, 2000], [day(-1), I.m2, 1000]]) {
      await issue(U.keeper, { flock: F.t8, item: it, qty, on });
    }
    await one(U.worker, 'select public.send_flock_feed($1, $2, $3, $4, $5, $6, $7) as v', [uid(), uid(), uid(), F.t8, I.m1, 2000, TODAY]);
    await vaccinate(U.worker, F.t8, 300);
    await one(U.worker, GIVE, [uid(), TODAY, JSON.stringify([{ kind: 'log', flock_id: F.t8, id: id(310), name: 'فيتامين', dose: '1 مل لكلّ لتر' }])]);
    await one(U.worker, 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [F.t8, day(-1), 50, 450.5, uid()]);
    await one(U.manager, 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7) as v', [uid(), id(311), F.t8, day(-2), -5, 'العدّ أقلّ', await liveOf(F.t8)]);
    await draftTicket(H.t8, 320);
    await one(U.manager, 'select public.void_weigh_ticket($1, $2, $3) as v', [id(320), 'تذكرة تجريبية', uid()]);
  });
  // «قاعه 1 تجريبي»: 20,000 قبل 12 يوماً، وجولتان وإرسال علف (للبصمة والنسخة وقفل الفترة).
  await section('بذرة قاعة 1', async () => {
    F.t1 = await open(H.t1, day(-12), 20000);
    await one(U.worker, DEAD, [F.t1, day(-1), 7, uid(), false]);
    await one(U.worker, DEAD, [F.t1, TODAY, 5, uid(), false]);
    await issue(U.keeper, { flock: F.t1, item: I.m1, qty: 1500, on: day(-1) });
  });
  // «قاعه 4 تجريبي»: بيع طيور أُلغي ثمّ تذكرته أُلغيت (لا يمنع الحذف)، و«قاعه 5 تجريبي»: فوج سُكّن اليوم بلا أيّ سجلّ.
  await section('بذرة البيع الملغى والفوج بلا سجلّ', async () => {
    F.t4 = await open(H.t4, day(-9), 4000);
    await draftTicket(H.t4, 330);
    await one(U.owner, 'select public.finish_weigh_ticket($1, $2, 1) as v', [uid(), id(330)]);
    await one(U.owner, 'select public.record_bird_sale($1, $2, $3, 2, $4, 2750, 0, 0, null, null) as v', [uid(), id(332), id(330), party]);
    await one(U.manager, 'select public.void_bird_sale($1, $2, $3) as v', [id(332), 'بيع تجريبي', uid()]);
    await one(U.manager, 'select public.void_weigh_ticket($1, $2, $3) as v', [id(330), 'تذكرة تجريبية', uid()]);
    F.t5 = await open(H.t5, TODAY, 500);
  });
  // الدورة المنتهية: 1,000 قبل 40 يوماً أُغلقت قبل خمسة أيّام (بيعت خارج النظام)، ولا فوج بعدها.
  await section('بذرة الدورة المنتهية', async () => {
    F.ended = await open(H.ended, day(-40), 1000);
    const form = await closeForm(F.ended);
    await one(U.manager, CLOSE, [uid(), id(340), F.ended, day(-5), 1000, 0, '[]', 'بيعت خارج النظام', '[]', null, form.plan]);
  });
  // قاعة البيع: تذكرة مكتملة بفاتورة مرحَّلة؛ وقاعة التذكرة: مسوّدة.
  await section('بذرة البيع والتذكرة', async () => {
    F.sale = await open(H.sale, day(-20), 5000);
    await draftTicket(H.sale, 350);
    await one(U.owner, 'select public.finish_weigh_ticket($1, $2, 1) as v', [uid(), id(350)]);
    await one(U.owner, 'select public.record_bird_sale($1, $2, $3, 2, $4, 2750, 0, 0, null, null) as v', [uid(), id(352), id(350), party]);
    F.ticket = await open(H.ticket, day(-10), 3000);
    await draftTicket(H.ticket, 360);
  });
  // العلف المنقول: دورة أُغلقت بنقل 100 كغم للدورة التالية؛ في الأولى معلَّق بلا فوج، وفي الثانية طُبّق على فوج جديد.
  await section('بذرة العلف المنقول', async () => {
    for (const [key, n] of [['carryPending', 370], ['carryApplied', 380]]) {
      const flockId = await open(H[key], day(-30), 2000);
      await issue(U.keeper, { flock: flockId, item: I.m1, qty: 300, on: day(-6) });
      const form = await closeForm(flockId);
      await one(U.manager, CLOSE, [uid(), id(n), flockId, day(-5), 2000, 0, JSON.stringify([{ item_id: I.m1, qty: '300' }]), 'بيعت خارج النظام',
        JSON.stringify([{ item_id: I.m1, qty: '100', action: 'carry' }]), null, form.plan]);
      F[`${key}Old`] = flockId;
    }
    F.carryApplied = await open(H.carryApplied, day(-4), 1500);
  });
  // دورة أُغلقت بإرجاع إلى «رصيد العلف» ثمّ أُعيد فتحها (الإرجاع معكوس، والإغلاق reopened)، فيُحذف فوجها القائم بعد ذلك.
  // «قاعة الدورتين»: دورة أُغلقت قبل خمسة أيّام، ثمّ فوج جديد قائم بإرسال علف وجولة (يُحذف فوجها القائم وتبقى دورتها المنتهية).
  await section('بذرة قاعة الدورتين', async () => {
    const old = await open(H.twoCycles, day(-40), 800);
    const form = await closeForm(old);
    await one(U.manager, CLOSE, [uid(), id(395), old, day(-5), 800, 0, '[]', 'بيعت خارج النظام', '[]', null, form.plan]);
    F.twoCycles = await open(H.twoCycles, day(-3), 6000);
    await one(U.worker, DEAD, [F.twoCycles, day(-1), 4, uid(), false]);
    await issue(U.keeper, { flock: F.twoCycles, item: I.m2, qty: 750, on: day(-1) });
  });
  await section('بذرة الدورة المعادة', async () => {
    F.reopened = await open(H.reopened, day(-10), 1200);
    await issue(U.keeper, { flock: F.reopened, item: I.m1, qty: 100, on: day(-6) });
    const form = await closeForm(F.reopened);
    await one(U.manager, CLOSE, [uid(), id(390), F.reopened, day(-5), 1200, 0, JSON.stringify([{ item_id: I.m1, qty: '100' }]), 'بيعت خارج النظام',
      JSON.stringify([{ item_id: I.m1, qty: '40', action: 'return', warehouse_id: W.feed }]), null, form.plan]);
    await one(U.manager, 'select public.reopen_flock($1, $2, $3) as v', [id(390), 'أُغلقت خطأً', uid()]);
  });
  // قاعات السباق: لكلّ واحدة فوج 1,000 قبل ثمانية أيّام وصرف 100 كغم «علف م/1» اليوم (والخامسة تأشير لقاح مصروف، والسابعة حتى الثانية عشرة بلا صرف).
  await section('بذرة قاعات السباق', async () => {
    for (let k = 1; k <= 12; k += 1) {
      F[`c${k}`] = await open(H[`c${k}`], day(-8), 1000);
      if (k <= 6) await issue(U.keeper, { flock: F[`c${k}`], item: I.m1, qty: 100, issue: id(600 + k), line: id(620 + k) });
    }
    await vaccinate(U.worker, F.c5, 400);
  });

  // ── ١) المعاينة بأشكالها ─────────────────────────────────────────────────────────────────────────────────────────
  const P = {};
  await section('المعاينة', async () => {
    for (const key of ['t8', 't1', 't4', 't5', 'ended', 'empty', 'sale', 'ticket', 'carryPending', 'carryApplied']) P[key] = await preview(H[key]);
    samples.preview_running = P.t8;
    samples.preview_ended = P.ended;
    samples.preview_empty = P.empty;
    samples.preview_sales = P.sale;
    samples.preview_tickets = P.ticket;
    samples.preview_carry_pending = P.carryPending;
    samples.preview_carry_applied = P.carryApplied;
    const medicine = await storeName(W.medicine);
    // بترتيب اسم المخزن ثمّ اسم المادّة (collate "C" = ترتيب نقاط الرمز، كترتيب JavaScript لحروف المستوى الأوّل).
    const feedRows = [{ warehouse_id: W.feed, warehouse: 'رصيد العلف', item_id: I.m1, item: 'علف م/1', qty: '10000.000', base_unit: 'kg' },
      { warehouse_id: W.feed, warehouse: 'رصيد العلف', item_id: I.m2, item: 'علف م/2', qty: '2000.000', base_unit: 'kg' }];
    const medicineRows = [{ warehouse_id: W.medicine, warehouse: medicine, item_id: I.nd, item: 'لقاح نيوكاسل', qty: '25.000', base_unit: 'pc' }];
    same(P.t8, {
      hall: { id: H.t8, name: NAMES.t8, site_id: site, site: 'حقل لحم', version: 1 },
      flock: { id: F.t8, version: 1, status: 'active', placed_on: day(-13), placed_count: 25250, days: 14, visits: 14, gas_days: 13, weights: 1, logs: 1,
        vaccinations: 1, issues: 8, back: 'رصيد العلف' < medicine ? [...feedRows, ...medicineRows] : [...medicineRows, ...feedRows] },
      ended: 0,
      blocks: [],
      plan: P.t8.plan,
    }, 'قاعة 8: القاعة وحقلها ونسختها، والفوج القائم بعدّاداته (14 يوماً و14 زيارة و13 يوم غاز ووزن ودواء وتأشير وثمانية صرف)، وما يرجع لكلّ مخزن ومادّة بترتيب الاسم، بلا منع');
    t.ok(/^[0-9a-f]{32}$/u.test(P.t8.plan ?? ''), `البصمة md5 (${P.t8.plan})`);
    same([P.ended.flock, P.ended.ended, P.ended.blocks], [null, 1, []], 'القاعة بدورة منتهية وحدها: لا فوج، ودورة منتهية واحدة تبقى في التقارير، بلا منع');
    same([P.empty.flock, P.empty.ended, P.empty.blocks, P.empty.hall.name], [null, 0, [], NAMES.empty], 'القاعة بلا فوج قطّ');
    same([P.t5.flock?.days, P.t5.flock?.issues, P.t5.flock?.back, P.t5.blocks], [0, 0, [], []], 'فوج سُكّن اليوم بلا سجلّ: عدّاداته صفر ولا شيء يرجع');
    same([P.t4.blocks, P.t4.flock?.issues], [[], 0], 'بيع ملغى وتذكرته ملغاة لا يمنعان');
    const saleNo = await scalar('select doc_no from public.bird_sales where id = $1', [id(352)]);
    const saleTicket = await scalar('select ticket_no from public.weigh_tickets where id = $1', [id(350)]);
    same(P.sale.blocks, [
      { code: 'sales', text: `في الفوج بيع طيور (فاتورة ${saleNo})؛ ألغِ الفاتورة أوّلاً ثمّ احذف القاعة.` },
      { code: 'tickets', text: `في الفوج تذكرة وزن (${saleTicket})؛ ألغِ التذكرة أوّلاً ثمّ احذف القاعة.` },
    ], 'بيع الطيور يمنع بفاتورته، وتذكرته المكتملة تمنع بعده');
    same(P.ticket.blocks, [{ code: 'tickets', text: `في الفوج تذكرة وزن (مسوّدة ${ddmm(TODAY)})؛ ألغِ التذكرة أوّلاً ثمّ احذف القاعة.` }], 'مسوّدة التذكرة تمنع بيومها');
    same([P.carryPending.flock, P.carryPending.ended, P.carryPending.blocks],
      [null, 1, [{ code: 'carry', text: `في القاعة «${NAMES.carryPending}» علف منقول للدورة التالية («علف م/1»)؛ أرجِعه إلى مخزن أوّلاً ثمّ احذف القاعة.` }]],
      'العلف المنقول المعلَّق في قاعة بلا فوج يمنع بما يُفعل');
    same([P.carryApplied.flock?.id, P.carryApplied.ended, P.carryApplied.blocks], [F.carryApplied, 1,
      [{ code: 'carry', text: 'في الفوج علف منقول من الدورة السابقة («علف م/1»)، والنقل المطبَّق لا يُلغى، فلا تُحذف القاعة وفوجها قائم. أغلق الدورة أوّلاً ثمّ احذف القاعة.' }]],
    'العلف المنقول المطبَّق على الفوج يمنع');
    // كلّ دور يقرأ المعاينة بنتيجة المالك (0034).
    const roles = [];
    for (const user of [U.owner, U.manager, U.keeper, U.mill, U.hatchery, U.worker, U.accountant, U.viewer]) roles.push((await preview(H.t8, user)).plan === P.t8.plan);
    same(roles, Array(8).fill(true), 'المعاينة لكلّ دور بالبصمة نفسها');
    same(code(await call(db, U.manager, PREVIEW, [uid()])), 'hall_not_found', 'قاعة غير موجودة: hall_not_found');
  });

  // ── ٢) المنع: جملته في المعاينة ورمزه وجملته في الحذف ──────────────────────────────────────────────────────────────────
  await section('المنع', async () => {
    const sales = await del(U.manager, H.sale, P.sale);
    const tickets = await del(U.manager, H.ticket, P.ticket);
    const carryApplied = await del(U.manager, H.carryApplied, P.carryApplied);
    const carryPending = await del(U.manager, H.carryPending, P.carryPending);
    samples.refusal_hall_has_sales = refusal(sales);
    samples.refusal_hall_has_tickets = refusal(tickets);
    samples.refusal_hall_has_carry = refusal(carryApplied);
    samples.refusal_hall_has_carry_pending = refusal(carryPending);
    same([refusal(sales), refusal(tickets), refusal(carryApplied), refusal(carryPending)], [
      { code: 'hall_has_sales', hint: P.sale.blocks[0].text }, { code: 'hall_has_tickets', hint: P.ticket.blocks[0].text },
      { code: 'hall_has_carry', hint: P.carryApplied.blocks[0].text }, { code: 'hall_has_carry', hint: P.carryPending.blocks[0].text },
    ], 'الحذف يرمي أوّل منع برمزه وجملة المعاينة نفسها تلميحاً');
    same(await scalar('select count(*)::int from public.halls where id = any ($1) and archived_at is not null', [[H.sale, H.ticket, H.carryApplied, H.carryPending]]), 0, 'ولا قاعة منها حُذفت');

    // قفل الفترة على أيّام الفوج (بمعاملة ترجع): المعاينة تمنع بجملتها، والحذف period_locked بها.
    const locked = await db.asUser(U.owner, async (q) => {
      await q('select public.set_period_lock($1)', [day(-10)]);
      const p = (await q(PREVIEW, [H.t1])).rows[0].v;
      await q('savepoint probe');
      try {
        await q(DELETE, [H.t1, p.hall.version, p.plan, uid()]);
        return { p, refused: 'ok' };
      } catch (error) {
        await q('rollback to savepoint probe');
        return { p, refused: { code: error.message, hint: error.hint } };
      }
    });
    samples.preview_period_locked = locked.p;
    samples.refusal_period_locked = locked.refused;
    const lockText = `الحسابات مقفلة حتى ${ddmm(day(-10))}، وأيّام الفوج من ${ddmm(day(-12))} داخلها؛ اطلب من مالك المنشأة فتح الفترة ثمّ احذف القاعة.`;
    same([locked.p.blocks, locked.refused], [[{ code: 'period_locked', text: lockText }], { code: 'period_locked', hint: lockText }], 'قفل الفترة على تسكين الفوج يمنع، والحذف period_locked بالجملة نفسها');
    same((await preview(H.t1)).blocks, [], 'وبعد رجوع المعاملة لا منع');

    // الصلاحية (لا تقع بعد 0034 لعضو في منشأته): داخل معاملة ترجع ودالّة النطاق أو الفعل تقول لا؛ أوّلاً ووحدها.
    const scoped = (sig, pairs) => mutant(db, U.owner, [[sig, pairs]], async ({ attempt }) => {
      const p = await inside(attempt, U.manager, PREVIEW, [H.t8]);
      const refused = p?.plan ? await inside(attempt, U.manager, DELETE, [H.t8, p.hall.version, p.plan, uid()]) : p;
      return { p, refused };
    });
    const outSite = await scoped(SIG.inScopeSite, [['  select exists (', '  select false and exists (']]);
    const outStore = await scoped(SIG.inScopeWh, [['  select exists (', '  select false and exists (']]);
    const noVoid = await scoped(SIG.roleCan, [["  return true;\nend", "  return p_action <> 'void';\nend"]]);
    const noManage = await scoped(SIG.roleCan, [["  return true;\nend", "  return p_action <> 'flock.manage';\nend"]]);
    samples.preview_out_of_scope = outSite.p;
    samples.preview_store_out_of_scope = outStore.p;
    samples.preview_no_void_permission = noVoid.p;
    samples.refusal_forbidden = outSite.refused;
    const siteText = `القاعة «${NAMES.t8}» خارج نطاقك، فلا تحذفها. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.`;
    const stores = ['رصيد العلف', await storeName(W.medicine)].sort().map((name) => `«${name}»`).join('، ');
    const storeText = `صُرف لفوج القاعة من مخزن خارج نطاقك (${stores})، فلا يرجع إليه شيء منك. اطلب الحذف من مالك المنشأة.`;
    const voidText = 'في فوج القاعة صرف من المخزن يُلغى بحذفها، وإلغاء المستندات ليس من صلاحية دورك.';
    same([outSite.p.flock, outSite.p.ended, outSite.p.blocks, outSite.p.plan === P.t8.plan, outSite.refused],
      [null, 0, [{ code: 'permission', text: siteText }], true, { code: 'forbidden', hint: siteText }],
      'خارج النطاق: لا يُسمّى شيء من الفوج، والمنع permission وحده، والبصمة نفسها، والحذف forbidden بالجملة');
    same([outStore.p.blocks, outStore.refused], [[{ code: 'permission', text: storeText }], { code: 'forbidden', hint: storeText }], 'مخزن الصرف خارج النطاق: permission كقاعدة إلغاء الصرف');
    same([noVoid.p.blocks, noVoid.refused], [[{ code: 'permission', text: voidText }], { code: 'forbidden', hint: voidText }], 'صرف يُلغى بلا فعل الإلغاء: permission');
    same([noManage.p.blocks, noManage.refused?.code], [[{ code: 'permission', text: 'حذف القاعة لمن يدير القاعات، ودورك لا يديرها.' }], 'forbidden'], 'بلا إدارة القاعات: permission، والحذف forbidden (require)');
  });

  // ── ٣) النسخة والبصمة ────────────────────────────────────────────────────────────────────────────────────────────
  await section('النسخة والبصمة', async () => {
    const before = await preview(H.t1);
    await one(U.owner, 'update public.halls set capacity = 25000 where id = $1 returning id', [H.t1]);
    const staleHall = await del(U.manager, H.t1, before);
    samples.refusal_stale_hall = refusal(staleHall);
    same(refusal(staleHall), { code: 'stale_hall', hint: `تغيّرت القاعة «${NAMES.t1}» من جهاز آخر بعد فتح النافذة. حدّث الشاشة ثمّ احذفها.` }, 'تغيّرت القاعة بعد المعاينة: stale_hall');
    const stalePlan = 'تغيّر ما في القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.';
    const p1 = await preview(H.t1);
    const extra = await issue(U.keeper, { flock: F.t1, item: I.m1, qty: 50 });
    const afterIssue = await del(U.manager, H.t1, p1);
    samples.refusal_stale_plan = refusal(afterIssue);
    const p2 = await preview(H.t1);
    await one(U.manager, VF, [extra.id, 'صرف خاطئ', uid()]);
    const afterVoid = await del(U.manager, H.t1, p2);
    const p3 = await preview(H.t1);
    await vaccinate(U.worker, F.t1, 420);
    const afterVaccination = await del(U.manager, H.t1, p3);
    const p4 = await preview(H.t1);
    await one(U.manager, 'select public.edit_flock($1, $2, $3, $4, 0, null, $5) as v', [F.t1, p4.flock.version, day(-12), 20100, uid()]);
    const afterEdit = await del(U.manager, H.t1, p4);
    same([refusal(afterIssue), refusal(afterVoid), refusal(afterVaccination), refusal(afterEdit)].map((r) => [r.code, r.hint]),
      Array(4).fill(['stale_plan', stalePlan]), 'البصمة: صرف جديد، وإلغاء صرف، وتأشير جديد، وتعديل الفوج بعد المعاينة كلّها stale_plan');
    same(await scalar('select count(*)::int from public.flocks where id = $1 and status = $2', [F.t1, 'active']), 1, 'ولم يُلغَ شيء');
    same(await scalar("select count(*)::int from public.rpc_refs where fn = 'delete_hall' and result is not null and org_id = $1", [org]), 0, 'ولا جواب مخزَّن لرفض');
  });

  // ── ٤) الحذف: الجواب، والإعادة بالمرجع وبالحالة ────────────────────────────────────────────────────────────────────────
  const snapshot = async () => ({
    history: await one(U.manager, 'select public.halls_history(null) as v', []),
    today: await one(U.manager, 'select public.halls_day(null) as v', []),
    past: await one(U.manager, 'select public.halls_day($1) as v', [day(-5)]),
    cycles: await one(U.manager, 'select public.flock_cycles() as v', []),
    overview: await one(U.manager, 'select public.flocks_overview() as v', []),
    board: await one(U.manager, 'select public.vaccine_board() as v', []),
    reminders: await one(U.manager, 'select public.vaccine_reminders() as v', []),
    options: await one(U.manager, 'select public.weigh_ticket_options($1) as v', [site]),
    sites: await one(U.manager, 'select public.weigh_ticket_options(null) as v', []),
    visits: await one(U.manager, 'select public.round_visits($1, $2, null) as v', [TODAY, 'broiler']),
  });
  const balances = async () => Object.fromEntries((await db.admin(`select i.name, trim_scale(b.qty)::text || '/' || trim_scale(b.value)::text as v from public.stock_balances b
    join public.items i on i.id = b.item_id where b.org_id = $1 and b.item_id = any ($2) order by i.name`, [org, [I.m1, I.m2, I.nd]])).rows.map((r) => [r.name, r.v]));
  const REF = id(900);
  let BEFORE = null;
  let AFTER = null;
  let done = null;
  await section('الحذف', async () => {
    const p = await preview(H.t8);
    BEFORE = { ...(await snapshot()), stock: await balances(), moves: Number(await scalar('select count(*) from public.stock_moves where org_id = $1', [org])) };
    done = await del(U.manager, H.t8, p, REF);
    t.ok(done.ok, `حذف قاعة 8 (${done.code ?? ''} ${done.hint ?? ''})`);
    samples.delete_running = done.value;
    same(done.value, { hall_id: H.t8, name: NAMES.t8, deleted: true, already: false, flock_id: F.t8, voided_issues: 8, back: p.flock.back },
      'الجواب: القاعة واسمها، ومحذوفة لا من قبل، والفوج، وثمانية صرف أُلغيت، وما رجع بشكل المعاينة');
    AFTER = { ...(await snapshot()), stock: await balances(), moves: Number(await scalar('select count(*) from public.stock_moves where org_id = $1', [org])) };
    const again = await del(U.manager, H.t8, p, REF);
    samples.delete_retry_same_ref = again.value;
    same([again.ok, again.value], [true, done.value], 'الإعادة بالمرجع نفسه: الجواب نفسه');
    const already = await del(U.viewer, H.t8, p);
    samples.delete_already = already.value;
    same(already.value, { hall_id: H.t8, name: NAMES.t8, deleted: true, already: true, back: [] }, 'جواب ضاع ثمّ مرجع جديد (ولو من دور آخر): «حُذفت من قبل» بلا شيء يرجع');
    same([Number(await scalar('select count(*) from public.stock_moves where org_id = $1', [org])), await balances()], [AFTER.moves, AFTER.stock], 'والإعادتان لا تكتبان حركة');
    same(code(await call(db, U.manager, DELETE, [H.t8, p.hall.version, `${p.plan}x`, REF])), 'ref_reused', 'المرجع نفسه بطلب آخر: ref_reused');
    const gone = await call(db, U.manager, PREVIEW, [H.t8]);
    samples.refusal_hall_not_found = refusal(gone);
    same(refusal(gone), { code: 'hall_not_found', hint: 'هذه القاعة غير موجودة في منشأتك (ربّما حُذفت من جهاز آخر). حدّث الشاشة.' }, 'معاينة القاعة المحذوفة: hall_not_found');
    const row = (await db.admin('select status, version, voided_at is not null as stamped, voided_by, void_reason, closed_on from public.flocks where id = $1', [F.t8])).rows[0];
    same(row, { status: 'void', version: 2, stamped: true, voided_by: U.manager, void_reason: `حُذفت القاعة «${NAMES.t8}»`, closed_on: null }, 'الفوج ملغى بوقته ومن ألغاه وسببه ونسخة جديدة، بلا تاريخ إغلاق');
    same((await db.admin('select archived_at is not null as archived, version from public.halls where id = $1', [H.t8])).rows[0], { archived: true, version: 2 }, 'والقاعة مؤرشفة بنسخة جديدة');
    same((await db.admin("select status, void_reason from public.flock_issues where flock_id = $1 group by status, void_reason", [F.t8])).rows,
      [{ status: 'void', void_reason: `حُذفت القاعة «${NAMES.t8}»` }], 'وكلّ صرفه ملغى بالسبب نفسه');
    same((await db.admin('select status, void_reason from public.flock_vaccinations where flock_id = $1', [F.t8])).rows, [{ status: 'void', void_reason: `حُذفت القاعة «${NAMES.t8}»` }], 'وتأشيره ملغى');
    same(await scalar(`select (select count(*) from public.flock_daily where flock_id = $1) || '/' || (select count(*) from public.flock_visits where flock_id = $1 and voided_at is null)
      || '/' || (select count(*) from public.flock_day_gas where flock_id = $1) || '/' || (select count(*) from public.flock_weights where flock_id = $1) || '/' || (select count(*) from public.flock_logs where flock_id = $1)
      || '/' || (select count(*) from public.flock_counts where flock_id = $1)`, [F.t8]), '14/14/13/1/1/1', 'وأيّامه وزياراته وغازه ووزنه ودواؤه وعدّه صفوف باقية (سجلّ التدقيق)');
    same(Number(await scalar("select count(*) from public.audit_log where table_name = 'flocks' and row_id = $1", [F.t8])) >= 2, true, 'وسجلّ التدقيق يحمل الفوج قبل الإلغاء وبعده');
  });

  // ── ٥) المخزون يرجع بالكمية والقيمة، ودفتر المادّة يُظهر الإرسال والعكس ──────────────────────────────────────────────────
  await section('المخزون', async () => {
    const sent = (await db.admin(`select i.name, trim_scale(-sum(m.qty))::text || '/' || trim_scale(-sum(m.value))::text as v from public.stock_moves m
      join public.items i on i.id = m.item_id join public.flock_issues x on x.id = m.doc_id
      where m.doc_kind = 'flock_issue' and x.flock_id = $1 and m.reverses_move_id is null group by i.name order by i.name`, [F.t8])).rows;
    const plus = (a, b) => {
      const [aq, av] = a.split('/').map(Number);
      const [bq, bv] = b.split('/').map(Number);
      return `${aq + bq}/${av + bv}`;
    };
    same(Object.fromEntries(Object.entries(AFTER.stock).map(([k, v]) => [k, v])),
      Object.fromEntries(Object.entries(BEFORE.stock).map(([k, v]) => [k, plus(v, sent.find((s) => s.name === k)?.v ?? '0/0')])),
      'رصيد كلّ مادّة بعد الحذف = قبله + ما أُرسل للقاعة بالكمية والقيمة بالضبط');
    const pairs = (await db.admin(`select count(*)::int as n, count(*) filter (where r.id is not null and r.lot_id = m.lot_id and r.qty = -m.qty and r.value = -m.value
        and r.moved_on = $2 and r.doc_kind = 'flock_issue' and r.doc_id = m.doc_id and r.doc_line_id = m.doc_line_id)::int as good
      from public.stock_moves m join public.flock_issues x on x.id = m.doc_id
      left join public.stock_moves r on r.reverses_move_id = m.id
      where m.doc_kind = 'flock_issue' and x.flock_id = $1 and m.reverses_move_id is null`, [F.t8, TODAY])).rows[0];
    same(pairs, { n: 8, good: 8 }, 'كلّ حركة إرسال معكوسة على دفعتها نفسها بكميتها وقيمتها بيوم الحذف');
    same(await scalar('select coalesce(sum(amount), 0) = 0 from public.flock_costs where flock_id = $1', [F.t8]), true, 'ودفتر كلفة الفوج صفر');
    const ledger = await one(U.keeper, 'select public.item_moves_qty($1, $2, null, 200) as v', [I.m1, W.feed]);
    const mine = ledger.rows.filter((r) => r.doc_kind === 'flock_issue' && r.memo === `صرف إلى ${NAMES.t8} (حقل لحم)`);
    same([mine.length, mine.filter((r) => r.reverses_move_id === null && r.reversed).length, mine.filter((r) => r.reverses_move_id !== null && r.moved_on === TODAY).length],
      [10, 5, 5], 'دفتر «علف م/1» في «رصيد العلف»: خمس إرسالات معلَّمة بعكسها وخمس عكسيات بيوم الحذف، باسم القاعة');
  });

  // ── ٦) كلّ قارئ بلا الفوج الملغى ───────────────────────────────────────────────────────────────────────────────────
  await section('القرّاء', async () => {
    const hallsOf = (dayJson) => dayJson.sites.flatMap((s) => s.halls.map((h) => h.hall_id));
    const broiler = (history) => history.kinds.find((k) => k.kind === 'broiler');
    const t8Dead = 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 + 22 + 23;
    same([hallsOf(BEFORE.today).includes(H.t8), hallsOf(AFTER.today).includes(H.t8), hallsOf(AFTER.past).includes(H.t8)], [true, false, false], 'التقرير اليوميّ: القاعة اليوم وقبل خمسة أيّام قبل الحذف، ولا شيء بعده');
    same([AFTER.today.totals.dead, BEFORE.past.totals.dead, AFTER.past.totals.dead], [BEFORE.today.totals.dead - 23, 18, null],
      'ومجاميعه نقصت بهلاكات قاعة 8: اليوم بثلاث وعشرين، وقبل خمسة أيّام كانت جولتها وحدها (18) فلا هلاكات بعد الحذف');
    same([broiler(AFTER.history).total.dead, broiler(AFTER.history).total.placed], [broiler(BEFORE.history).total.dead - t8Dead, broiler(BEFORE.history).total.placed - 25250],
      '«من أوّل ما بدينا»: الهلاكات والمسكَّن نقصت بقاعة 8 كلّها');
    const events = (h) => broiler(h).events.filter((e) => e.hall === NAMES.t8).length;
    same([events(BEFORE.history) > 0, events(AFTER.history)], [true, 0], 'وأحداث قاعة 8 اختفت من الشهر');
    same([BEFORE.cycles.cycles.some((c) => c.id === F.t8), AFTER.cycles.cycles.some((c) => c.id === F.t8)], [true, false], 'الدورات: قاعة 8 قبل ولا بعد');
    const overviewHalls = (o) => o.sites.flatMap((s) => s.halls.map((h) => h.id));
    same([overviewHalls(BEFORE.overview).includes(H.t8), overviewHalls(AFTER.overview).includes(H.t8)], [true, false], 'جدول الحقل: القاعة قبل ولا بعد');
    same([BEFORE.board.halls.some((h) => h.id === H.t8), AFTER.board.halls.some((h) => h.id === H.t8)], [true, false], 'جدول اللقاحات: القاعة قبل ولا بعد');
    same(AFTER.reminders.items.some((r) => r.flock_id === F.t8), false, 'التذكير بلا الفوج');
    const optionHalls = (o) => o.halls.map((h) => h.hall_id);
    const siteRow = (o) => o.sites.find((s) => s.site_id === site)?.halls_with_flock;
    same([optionHalls(BEFORE.options).includes(H.t8), optionHalls(AFTER.options).includes(H.t8), siteRow(AFTER.sites)], [true, false, siteRow(BEFORE.sites) - 1],
      'تذكرة الوزن: القاعة قبل ولا بعد، وعدد القاعات بفوج نقص واحداً');
    const visitFlocks = (v) => v.flocks.map((f) => f.flock_id);
    same([visitFlocks(BEFORE.visits).includes(F.t8), visitFlocks(AFTER.visits).includes(F.t8)], [true, false], 'زيارات اليوم: الفوج قبل ولا بعد');
    // القرّاء بمعرّف الفوج: flock_void بتلميحه.
    const byId = [
      ['flock_detail', 'select public.flock_detail($1) as v', [F.t8]], ['flock_feed', 'select public.flock_feed($1) as v', [F.t8]],
      ['flock_issue_options', 'select public.flock_issue_options($1) as v', [F.t8]], ['hall_sheet', 'select public.hall_sheet($1) as v', [F.t8]],
      ['flock_cycle_report', 'select public.flock_cycle_report($1) as v', [F.t8]], ['flock_month', 'select public.flock_month($1, $2) as v', [F.t8, TODAY]],
      ['flock_sales', 'select public.flock_sales($1) as v', [F.t8]], ['flock_close_form', 'select public.flock_close_form($1) as v', [F.t8]],
      ['round_visits', 'select public.round_visits($1, $2, $3) as v', [TODAY, 'broiler', F.t8]],
    ];
    const got = {};
    for (const [name, sql, params] of byId) got[name] = refusal(await call(db, U.manager, sql, params));
    samples.refusal_flock_void = got.flock_detail;
    same(got, Object.fromEntries(byId.map(([name]) => [name, { code: 'flock_void', hint: VOID_HINT }])), 'كلّ قارئ بمعرّف الفوج الملغى: flock_void');
    const ticket = await one(U.owner, 'select public.weigh_ticket($1) as v', [id(320)]);
    samples.ticket_after_delete = ticket;
    same([ticket.status, ticket.stops?.map((s) => [s.hall_name, s.flock_status])], ['void', [[NAMES.t8, 'void']]], 'التذكرة الملغاة تبقى مستنداً، ووقفتها بحالة الفوج void (مسألة دمج للمحلّل)');
    same((await one(U.owner, 'select public.bird_sale_form($1) as v', [id(320)])).why, 'void', 'ونموذج فاتورتها: why = void');
  });

  // ── ٧) كلّ كاتب يرفض الفوج الملغى، والطابور يركن بسببه ──────────────────────────────────────────────────────────────────
  await section('الكتّاب', async () => {
    const vaccination = id(300);
    const writers = [
      ['save_flock_visit', VISIT, [uid(), F.t8, TODAY, ago(60), 1, 0, null, null, null, null, null, null, false, uid(), false]],
      ['save_flock_day', DAY, [F.t8, TODAY, 1, 0, null, null, null, null, null, null, null, null, null, uid(), false]],
      ['set_flock_dead', DEAD, [F.t8, day(-3), 1, uid(), false]],
      ['add_flock_gas', ADD, [F.t8, TODAY, 1, uid(), false]],
      ['set_flock_gas', GAS, [F.t8, TODAY, 3, null, uid(), false]],
      ['send_flock_feed', 'select public.send_flock_feed($1, $2, $3, $4, $5, $6, $7) as v', [uid(), uid(), uid(), F.t8, I.m1, 10, TODAY]],
      ['record_flock_issue', RF, [uid(), uid(), uid(), F.t8, I.m1, 10, TODAY, W.feed]],
      ['give_to_flocks', GIVE, [uid(), TODAY, JSON.stringify([{ kind: 'log', flock_id: F.t8, id: uid(), name: 'دواء', dose: null }])]],
      ['record_flock_weight', 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [F.t8, TODAY, 50, 500, uid()]],
      ['record_flock_count_adjust', 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7) as v', [uid(), uid(), F.t8, TODAY, -1, 'سبب', 0]],
      ['undo_vaccination', 'select public.undo_vaccination($1, $2, $3) as v', [vaccination, 'خطأ', uid()]],
      ['remove_flock_log', 'select public.remove_flock_log($1) as v', [id(310)]],
      ['edit_flock', 'select public.edit_flock($1, $2, $3, $4, 0, null, $5) as v', [F.t8, 2, day(-13), 25000, uid()]],
      ['delete_flock', 'select public.delete_flock($1, $2, $3) as v', [F.t8, 2, uid()]],
      ['close_flock', CLOSE, [uid(), uid(), F.t8, TODAY, 0, 0, '[]', 'سبب', '[]', null, 'x']],
    ];
    const got = {};
    for (const [name, sql, params] of writers) got[name] = refusal(await dry(U.manager, sql, params));
    same(got, Object.fromEntries(writers.map(([name]) => [name, { code: 'flock_void', hint: VOID_HINT }])), 'كلّ كاتب يأخذ الفوج الملغى: flock_void بتلميحه');
    const issueOf = await scalar('select id from public.flock_issues where flock_id = $1 order by doc_no limit 1', [F.t8]);
    same([code(await dry(U.manager, VF, [issueOf, 'خطأ', uid()])), code(await dry(U.owner, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [H.t8, TODAY, uid()])),
      code(await dry(U.owner, 'select public.save_weigh_ticket($1, null, $2::jsonb) as v', [uid(), ticketData(H.t8, uid())]))],
    ['already_void', 'hall_archived', 'hall_archived'], 'وصرفه ملغى من قبل، والقاعة المحذوفة لا تُسكَّن ولا تُحمَّل منها طيور');
    const unarchive = await dry(U.owner, 'update public.halls set archived_at = null where id = $1 returning id', [H.t8]);
    same(refusal(unarchive), { code: 'hall_deleted', hint: `حُذفت القاعة «${NAMES.t8}» بفوجها، فلا تعود من الأرشيف. أضف قاعة جديدة بالاسم نفسه.` }, 'والقاعة المحذوفة لا تعود من الأرشيف');
    // الطابور: كلّ عملية جولة للفوج الملغى تُركن بسبب flock_void (تثبت: حالة مركون للفوج الملغى).
    const queued = [
      ['save_flock_visit', VISIT, [uid(), F.t8, TODAY, ago(30), 2, 0, null, null, null, null, null, null, false, uid(), true]],
      ['save_flock_day', DAY, [F.t8, day(-1), 2, 0, null, null, null, null, null, null, null, null, null, uid(), true]],
      ['set_flock_dead', DEAD, [F.t8, day(-2), 3, uid(), true]],
      ['add_flock_gas', ADD, [F.t8, TODAY, 1, uid(), true]],
      ['set_flock_gas', GAS, [F.t8, day(-1), 4, null, uid(), true]],
    ];
    const parked = {};
    for (const [name, sql, params] of queued) parked[name] = (await call(db, U.worker, sql, params)).value;
    samples.parked_flock_void = parked.set_flock_dead;
    same(parked, Object.fromEntries(queued.map(([name]) => [name, { status: 'parked', reason: 'flock_void' }])), 'من الطابور: كلّ عملية جولة parked بسبب flock_void');
    same(await scalar("select count(*)::int from public.flock_day_rejects where flock_id = $1 and reason = 'flock_void'", [F.t8]), 5, 'وخمسة صفوف مركونة بسببها');
  });

  // ── ٨) القاعات الأخرى: الدورة المنتهية تبقى، والفارغة، والفوج بلا سجلّ، والبيع الملغى ─────────────────────────────────────────
  await section('حذف القاعات الأخرى', async () => {
    const endedDone = await del(U.manager, H.ended, P.ended);
    const emptyDone = await del(U.manager, H.empty, P.empty);
    const zeroDone = await del(U.manager, H.t5, P.t5);
    const voidedDone = await del(U.manager, H.t4, P.t4);
    samples.delete_ended = endedDone.value;
    samples.delete_empty = emptyDone.value;
    samples.delete_flock_without_records = zeroDone.value;
    same([endedDone.value, emptyDone.value, zeroDone.value],
      [{ hall_id: H.ended, name: NAMES.ended, deleted: true, already: false, flock_id: null, voided_issues: 0, back: [] },
        { hall_id: H.empty, name: NAMES.empty, deleted: true, already: false, flock_id: null, voided_issues: 0, back: [] },
        { hall_id: H.t5, name: NAMES.t5, deleted: true, already: false, flock_id: F.t5, voided_issues: 0, back: [] }],
      'قاعة بدورة منتهية وقاعة فارغة تُخفيان بلا فوج، وفوج بلا سجلّ يُلغى بلا شيء يرجع');
    same([voidedDone.ok, voidedDone.value?.voided_issues], [true, 0], 'قاعة بيعها وتذكرتها ملغيان تُحذف');
    const twoPreview = await preview(H.twoCycles);
    samples.preview_running_with_ended = twoPreview;
    const twoDone = await del(U.manager, H.twoCycles, twoPreview);
    samples.delete_running_with_ended = twoDone.value;
    same([twoPreview.ended, twoPreview.flock?.days, twoPreview.flock?.back?.map((r) => [r.item, r.qty]), twoPreview.blocks, twoDone.value?.voided_issues],
      [1, 1, [['علف م/2', '750.000']], [], 1], 'قاعة بدورة منتهية وفوج قائم: المعاينة تعدّ الدورة المنتهية، والحذف يُلغي الفوج القائم وحده');
    const reopenedDone = await del(U.manager, H.reopened, await preview(H.reopened));
    same([reopenedDone.value?.voided_issues, reopenedDone.value?.back?.map((r) => [r.item, r.qty]),
      await scalar("select string_agg(status, ',' order by status) from public.flock_closes where flock_id = $1", [F.reopened]),
      await scalar('select coalesce(sum(amount), 0) = 0 from public.flock_costs where flock_id = $1', [F.reopened])],
    [1, [['علف م/1', '100.000']], 'reopened', true], 'دورة أُغلقت بإرجاع ثمّ أُعيد فتحها تُحذف: صرفها كلّه يرجع، وإرجاعها المعكوس يبقى معكوساً، ودفتر كلفتها صفر');
    same(await scalar('select status from public.flocks where id = $1', [F.ended]), 'closed', 'والدورة المنتهية تبقى مغلقة لا ملغاة');
    const history = await one(U.manager, 'select public.halls_history(null) as v', []);
    const events = history.kinds.find((k) => k.kind === 'broiler').events.filter((e) => e.hall === NAMES.ended).map((e) => [e.type, e.on]);
    same(events.some(([type, on]) => type === 'closed' && on === day(-5)), true, `«من أوّل ما بدينا» يُبقي الدورة المنتهية في القاعة المحذوفة: إغلاقها هذا الشهر (${JSON.stringify(events)})`);
    same((await one(U.manager, 'select public.flock_cycles() as v', [])).cycles.filter((c) => [F.ended, F.t5, F.t4].includes(c.id)).map((c) => c.id), [F.ended],
      'والدورات: المنتهية باقية، والملغاة لا');
  });

  // ── ٨ب) الجرد وتصحيح السعر بعد الإرسال: منعان في المعاينة (revalued ثمّ counted، بشرطي apply_move على حركات الإرسال الأصلية)، والحذف يرمي رمز
  //    apply_move (lot_consumed وcount_superseded) بجملة المعاينة، وإلغاء التصحيح أو الجرد يرفع منعه. «قاعة الجرد»: «علف م/3» أُرسل أمس ثمّ جُرد
  //    مخزنه اليوم بلا فرق؛ «قاعة السعر»: «علف م/4» اشتُري بلا سعر وأُرسل ثمّ أُكمل سعره؛ «قاعة الجرد والسعر»: الاثنان (صرف «علف م/3» أوّلاً،
  //    فالجسم بلا المنعين يرمي count_superseded من أوّل حركة يعكسها).
  await section('الجرد وتصحيح السعر', async () => {
    const m3 = await item('علف م/3', 'feed', 'kg');
    const m4 = await item('علف م/4', 'feed', 'kg');
    const m5 = await item('علف م/5', 'feed', 'kg');
    await postedOpening(db, U.owner, W.feed, day(-7), [{ item: m3, qty: 5000, value: '1750000.00' }]);
    const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد العلف', true) returning id", []);
    const BUY = "select public.record_purchase($1, $2, $3, $4, $5, $6, $7, null, null, 'credit', null, $8) as v";
    await one(U.keeper, BUY, [uid(), id(700), id(701), m4, supplier, day(-2), 3000, W.feed]);
    await one(U.keeper, BUY, [uid(), id(702), id(703), m5, supplier, day(-2), 3000, W.feed]);
    // «علف م/5» أُكمل سعره قبل إرساله (علامة التصحيح قبل حركة الإرسال): لا يمنع.
    await one(U.keeper, 'select public.price_purchase($1, $2, 350, null) as v', [uid(), id(703)]);
    const stockOf = async () => Object.fromEntries((await db.admin(`select i.name, trim_scale(b.qty)::text || '/' || trim_scale(b.value)::text as v from public.stock_balances b
      join public.items i on i.id = b.item_id where b.item_id = any ($1) and b.warehouse_id = $2 order by i.name`, [[m3, m4, m5], W.feed])).rows.map((r) => [r.name, r.v]));
    const start = await stockOf();
    // جرد «رصيد العلف» لـ«علف م/3» بالرصيد نفسه في يومه (بلا فرق)، معتمد.
    const countOn = async (on) => {
      const qty = await scalar(`select trim_scale(coalesce(sum(m.qty), 0))::text from public.stock_moves m where m.item_id = $1 and m.warehouse_id = $2 and m.moved_on <= $3`, [m3, W.feed, on]);
      const docId = await db.asUser(U.manager, async (q) => {
        const created = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.feed, on])).rows[0].id;
        await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, $3)', [created, m3, qty]);
        return created;
      }, { commit: true });
      const version = () => scalar('select version from public.stock_counts where id = $1', [docId]);
      await one(U.manager, 'select public.submit_count($1, $2, $3)', [docId, await version(), uid()]);
      await one(U.manager, "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', $3)", [docId, await version(), uid()]);
      return docId;
    };
    // جرد بيوم الإرسال قبل الإرسال (لقطته قبل حركته): لا يمنع.
    const countBefore = await countOn(day(-1));
    const HK = await hall('قاعة الجرد');
    const HR = await hall('قاعة السعر');
    const HB = await hall('قاعة الجرد والسعر');
    const FK = await open(HK, day(-5), 1000);
    const FR = await open(HR, day(-5), 1000);
    const FB = await open(HB, day(-5), 1000);
    await issue(U.keeper, { flock: FK, item: m3, qty: 100, on: day(-1) });
    await issue(U.keeper, { flock: FB, item: m3, qty: 100, on: day(-1) });
    await issue(U.keeper, { flock: FR, item: m4, qty: 200, on: day(-1) });
    await issue(U.keeper, { flock: FB, item: m4, qty: 200, on: day(-1) });
    await issue(U.keeper, { flock: FK, item: m5, qty: 50, on: day(-1) });
    // جرد بتاريخ أقدم من الإرسال سُجّل بعده: لا يمنع. ثمّ جرد اليوم بعد الإرسال: يمنع. ثمّ «أكمل السعر» لشراء «علف م/4» بعد إرساله: يمنع.
    const countOlder = await countOn(day(-3));
    const countId = await countOn(TODAY);
    await one(U.keeper, 'select public.price_purchase($1, $2, 350, null) as v', [uid(), id(701)]);
    const countNo = await scalar('select doc_no from public.stock_counts where id = $1', [countId]);
    const receiptNo = await scalar('select doc_no from public.receipts where id = $1', [id(700)]);
    const revaluation = await scalar('select id from public.receipt_revaluations where receipt_line_id = $1', [id(701)]);
    same([await scalar("select string_agg(status, ',' order by counted_on) from public.stock_counts where id = any ($1)", [[countOlder, countBefore, countId]]),
      await scalar("select count(*)::int from public.stock_moves where doc_kind = 'count' and doc_id = any ($1)", [[countOlder, countBefore, countId]]),
      await scalar("select string_agg(status, ',') from public.receipt_revaluations where receipt_line_id = any ($1)", [[id(701), id(703)]])],
    ['approved,approved,approved', 0, 'posted,posted'], 'البذرة: الجرود الثلاثة معتمدة بلا فرق (بلا حركة)، والسعران مُكملان');
    const counted = { code: 'counted', text: `أُرسل إلى الفوج قبل جرد مخزنه: «علف م/3» (الجرد ${countNo} في «رصيد العلف» بتاريخ ${ddmm(TODAY)})؛ ألغِ الجرد أوّلاً ثمّ احذف القاعة.` };
    const revalued = { code: 'revalued', text: `أُرسل إلى الفوج قبل تصحيح سعره: «علف م/4» (سعر ${receiptNo})؛ ألغِ التصحيح أوّلاً ثمّ احذف القاعة.` };

    // المعاينة تعرض المنع بسببه وما يُفعل، والحذف يرمي رمز apply_move بالجملة نفسها (ولا يصل إلى apply_move).
    const PK = await preview(HK);
    const PR = await preview(HR);
    const PB = await preview(HB);
    samples.preview_counted = PK;
    samples.preview_revalued = PR;
    samples.preview_revalued_counted = PB;
    same([PK.blocks, PR.blocks, PB.blocks], [[counted], [revalued], [revalued, counted]],
      'المعاينة: جرد معتمد لمادّة الإرسال في مخزنه بعده (ولو بلا فرق) منع counted برقم الجرد ومخزنه ويومه، وسعر أُكمل بعد الإرسال منع revalued بمستنده، والاثنان معاً revalued ثمّ counted');
    const refusedK = await del(U.manager, HK, PK);
    const refusedR = await del(U.manager, HR, PR);
    const refusedB = await del(U.manager, HB, PB);
    samples.refusal_count_superseded = refusal(refusedK);
    samples.refusal_lot_consumed = refusal(refusedR);
    same([refusal(refusedK), refusal(refusedR), refusal(refusedB)],
      [{ code: 'count_superseded', hint: counted.text }, { code: 'lot_consumed', hint: revalued.text }, { code: 'lot_consumed', hint: revalued.text }],
      'الحذف: count_superseded وlot_consumed بجملة المعاينة نفسها، وفي القاعة بالاثنين أوّل منع revalued (lot_consumed) لا أوّل حركة يعكسها');

    // الترتيب: قفل الفترة قبل المنعين (بمعاملة ترجع).
    const locked = await db.asUser(U.owner, async (q) => {
      await q('select public.set_period_lock($1)', [day(-5)]);
      const p = (await q(PREVIEW, [HB])).rows[0].v;
      await q('savepoint probe');
      try {
        await q(DELETE, [HB, p.hall.version, p.plan, uid()]);
        return { codes: p.blocks.map((b) => b.code), refused: 'ok' };
      } catch (error) {
        await q('rollback to savepoint probe');
        return { codes: p.blocks.map((b) => b.code), refused: error.message };
      }
    });
    same(locked, { codes: ['period_locked', 'revalued', 'counted'], refused: 'period_locked' }, 'الترتيب: period_locked ثمّ revalued ثمّ counted، والحذف period_locked');

    // إلغاء التصحيح يرفع منعه: «قاعة السعر» تُحذف، و«قاعة الجرد والسعر» يبقى فيها الجرد.
    await one(U.manager, 'select public.void_receipt_revalue($1, $2, $3) as v', [revaluation, 'سعر خاطئ', uid()]);
    const PR2 = await preview(HR);
    const PB2 = await preview(HB);
    const deletedR = await del(U.manager, HR, PR2);
    const refusedB2 = await del(U.manager, HB, PB2);
    same([PR.blocks, PR2.blocks, deletedR.ok ? deletedR.value.voided_issues : refusal(deletedR), PB2.blocks, refusal(refusedB2)],
      [[revalued], [], 1, [counted], { code: 'count_superseded', hint: counted.text }],
      'إلغاء التصحيح يرفع revalued: «قاعة السعر» بلا منع فتُحذف بصرفها، و«قاعة الجرد والسعر» يبقى فيها counted وحده');

    // وإلغاء الجرد يرفع منعه: القاعتان تُحذفان، والمخزون كما قبل الإرسال.
    await one(U.manager, 'select public.void_count($1, $2, $3)', [countId, 'جرد خاطئ', uid()]);
    const PK3 = await preview(HK);
    const PB3 = await preview(HB);
    // دقّة الشرطين كشرطي apply_move: في «قاعة الجرد» بعد إلغاء جرد اليوم جردان معتمدان لا يمنعان (بيوم الإرسال ولقطته قبله، وبتاريخ أقدم سُجّل بعده)
    // وسعر أُكمل قبل الإرسال؛ والجسم بلا شرط اللقطة أو اليوم أو علامة التصحيح يمنع بها (فيرفض الحذف ما يقبله apply_move).
    const precise = (pairs) => mutant(db, U.owner, pairs.length > 0 ? [[SIG.blocks, pairs]] : [],
      ({ attempt }) => inside(attempt, U.manager, PREVIEW, [HK]).then((p) => p.blocks?.map((b) => b.code) ?? p)).catch((error) => `مرساة: ${error.message}`);
    same([await precise([]), await precise([['and n.snapshot_seq >= m.seq', 'and true']]), await precise([['and c.counted_on >= m.moved_on', 'and true']]),
      await precise([['and (v.marks ->> m.warehouse_id::text)::bigint >= m.seq', 'and true']])], [[], ['counted'], ['counted'], ['revalued']],
    'دقّة المنعين: جرد معتمد لقطته قبل الإرسال، وجرد بتاريخ قبل الإرسال، وسعر أُكمل قبل الإرسال لا تمنع، وبلا كلّ شرط منها يقع المنع');
    const deletedK = await del(U.manager, HK, PK3);
    const deletedB = await del(U.manager, HB, PB3);
    same([PK.blocks, PK3.blocks, PB3.blocks, deletedK.ok ? deletedK.value.voided_issues : refusal(deletedK), deletedB.ok ? deletedB.value.voided_issues : refusal(deletedB)],
      [[counted], [], [], 2, 2], 'إلغاء الجرد يرفع counted: «قاعة الجرد» و«قاعة الجرد والسعر» بلا منع فتُحذفان بصرفهما');
    same([await stockOf(), await scalar("select count(*)::int from public.flocks where id = any ($1) and status = 'void'", [[FK, FR, FB]])], [start, 3],
      'والأفواج الثلاثة ملغاة، ورصيد «علف م/3» و«علف م/4» و«علف م/5» في «رصيد العلف» كما قبل الإرسال بالكمية والقيمة');
  });

  // ── ٩) جلستان حقيقيتان ─────────────────────────────────────────────────────────────────────────────────────────────
  await section('جلستان', async () => {
    const fresh = (key) => preview(H[key]);
    // الحذف أوّلاً، وإلغاء صرف فوجه ينتظر الصرف ثمّ يجده ملغى.
    const p1 = await fresh('c1');
    const r1 = await duel({ user: U.manager, sql: DELETE, params: [H.c1, p1.hall.version, p1.plan, uid()] }, { user: U.keeper, sql: VF, params: [id(601), 'خطأ', uid()] });
    same([r1.first.ok, r1.blocked, r1.second.error, r1.second.hint], [true, true, 'already_void', `الصرف ${await scalar('select doc_no from public.flock_issues where id = $1', [id(601)])} ملغى من قبل.`],
      'الحذف ثمّ إلغاء الصرف: الثاني ينتظر الحذف بعينه ثمّ already_void، بلا تقافل');
    // إلغاء الصرف أوّلاً، والحذف بمعاينة قبله ينتظر الصرف ثمّ stale_plan؛ ومعاينة جديدة تحذف.
    const p2 = await fresh('c2');
    const r2 = await duel({ user: U.keeper, sql: VF, params: [id(602), 'خطأ', uid()] }, { user: U.manager, sql: DELETE, params: [H.c2, p2.hall.version, p2.plan, uid()] });
    same([r2.first.ok, r2.blocked, r2.second.error], [true, true, 'stale_plan'], 'إلغاء الصرف ثمّ الحذف: الثاني ينتظره بعينه ثمّ stale_plan');
    same((await del(U.manager, H.c2, await fresh('c2'))).value?.voided_issues, 0, 'وبمعاينة جديدة يُحذف بلا صرف يُلغى');
    // الصرف الجديد أوّلاً (يمسك الفوج للمشاركة)، والحذف ينتظر الفوج ثمّ stale_plan.
    const p3 = await fresh('c3');
    const r3 = await duel({ user: U.keeper, sql: RF, params: [uid(), uid(), uid(), F.c3, I.m1, 10, TODAY, W.feed] },
      { user: U.manager, sql: DELETE, params: [H.c3, p3.hall.version, p3.plan, uid()] });
    same([r3.first.ok, r3.blocked, r3.second.error], [true, true, 'stale_plan'], 'صرف جديد ثمّ الحذف: الحذف ينتظر الفوج بعينه ثمّ stale_plan');
    // الحذف أوّلاً، والصرف لفوجه ينتظر الفوج ثمّ flock_void.
    const p4 = await fresh('c4');
    const r4 = await duel({ user: U.manager, sql: DELETE, params: [H.c4, p4.hall.version, p4.plan, uid()] },
      { user: U.keeper, sql: RF, params: [uid(), uid(), uid(), F.c4, I.m1, 10, TODAY, W.feed] });
    same([r4.first.ok, r4.blocked, r4.second.error], [true, true, 'flock_void'], 'الحذف ثمّ صرف لفوجه: الصرف ينتظر الحذف بعينه ثمّ flock_void');
    // الحذف أوّلاً، و«ألغِ التأشير» المصروف ينتظر صرفه ثمّ يجد التأشير ملغى فيرجع حاله بلا كتابة.
    const p5 = await fresh('c5');
    const r5 = await duel({ user: U.manager, sql: DELETE, params: [H.c5, p5.hall.version, p5.plan, uid()] },
      { user: U.worker, sql: 'select public.undo_vaccination($1, $2, $3) as v', params: [id(400), 'خطأ', uid()] });
    same([r5.first.ok, r5.blocked, r5.second.ok, r5.second.rows?.[0]?.v], [true, true, true, { id: id(400), status: 'void', issue_voided: true }],
      'الحذف ثمّ «ألغِ التأشير»: ينتظر الصرف بعينه ثمّ يجد التأشير ملغى، بلا تقافل');
    same((await db.admin('select void_reason, voided_by from public.flock_vaccinations where id = $1', [id(400)])).rows[0], { void_reason: `حُذفت القاعة «${NAMES.c5}»`, voided_by: U.manager },
      'والتأشير ملغى بالحذف وحده');

    // ترتيب الأقفال بالتشابك (الصرف ثمّ الفوج، كـvoid_flock_issue): جلسة صاحب الجداول تمسك الصرف، والحذف ينتظرها بعينها، ثمّ تمسك الفوج بلا انتظار.
    // والضابط: حذف بجسم مثبَّت يقفل الفوج قبل الصرف يتقافل مع الترتيب نفسه.
    // الضابط (keep = false) لا يثبّت شيئاً: من يخسر التقافل يرجع فيكمل الآخر، ثمّ يرجع هو أيضاً فتبقى القاعة للفحص الحقيقيّ بعده.
    const interleave = async (hallKey, holdFirst, holdSecond, keep = true) => {
      const p = await fresh(hallKey);
      const a = await db.session(U.owner, { role: 'postgres' });
      const b = await db.session(U.manager);
      try {
        await a.run("set local lock_timeout = '10s'");
        const held = await a.run(holdFirst.sql, holdFirst.params);
        const pending = b.run(DELETE, [H[hallKey], p.hall.version, p.plan, uid()]);
        const blocked = await blockedBy(b.pid, a.pid, pending);
        const second = a.run(holdSecond.sql, holdSecond.params);
        const first = await Promise.race([second.then((r) => ['a', r]), pending.then((r) => ['b', r])]);
        if (!first[1].ok) await (first[0] === 'a' ? a : b).rollback();
        const aSecond = await second;
        if (aSecond.ok) await (keep ? a.commit() : a.rollback());
        const deleted = await pending;
        if (deleted.ok) await (keep ? b.commit() : b.rollback());
        return { held: held.ok, blocked, first: first[0], aSecond: aSecond.ok ? 'ok' : aSecond.error, deleted: deleted.ok ? 'ok' : deleted.error };
      } finally {
        await a.rollback();
        await b.rollback();
      }
    };
    const issueThenFlock = (k) => [{ sql: 'select 1 from public.flock_issues where id = $1 for update', params: [id(600 + k)] },
      { sql: 'select 1 from public.flocks where id = $1 for share', params: [F[`c${k}`]] }];
    const swapped = await committedMutation(SIG.del, [[
      "    select coalesce(array_agg(z.id order by z.id), '{}') into v_locked from (\n      select y.id from public.flock_issues y where y.org_id = v_org and y.flock_id = v_flock and y.status = 'posted' order by y.id for update) as z;\n    select * into f from public.flocks y where y.org_id = v_org and y.id = v_flock and y.status in ('preparing', 'active') for no key update;\n",
      "    select * into f from public.flocks y where y.org_id = v_org and y.id = v_flock and y.status in ('preparing', 'active') for no key update;\n    select coalesce(array_agg(z.id order by z.id), '{}') into v_locked from (\n      select y.id from public.flock_issues y where y.org_id = v_org and y.flock_id = v_flock and y.status = 'posted' order by y.id for update) as z;\n",
    ]], () => interleave('c6', ...issueThenFlock(6), false));
    t.ok(swapped.held && swapped.blocked && [swapped.aSecond, swapped.deleted].includes('deadlock detected'),
      `ضابط: حذف يقفل الفوج قبل الصرف يتقافل مع ترتيب إلغاء الصرف (${JSON.stringify(swapped)})`);
    const ordered = await interleave('c6', ...issueThenFlock(6));
    same(ordered, { held: true, blocked: true, first: 'a', aSecond: 'ok', deleted: 'ok' }, 'الحذف بترتيبه: ينتظر الصرف بعينه، وماسك الصرف يأخذ الفوج بلا انتظار، ثمّ يُحذف');
    // ترتيب الأقفال بالتشابك (الفوج ثمّ الرصيد، كـrecord_flock_issue): الحذف ينتظر الفوج، وماسكه يأخذ الرصيد بلا انتظار؛ والضابط حذف يقفل الأرصدة قبل الفوج.
    const flockThenBalance = (k) => [{ sql: 'select 1 from public.flocks where id = $1 for share', params: [F[`c${k}`]] },
      { sql: 'select 1 from public.stock_balances where org_id = $1 and item_id = $2 and warehouse_id = $3 for update', params: [org, I.m1, W.feed] }];
    const flockAnchor = "    select * into f from public.flocks y where y.org_id = v_org and y.id = v_flock and y.status in ('preparing', 'active') for no key update;\n";
    const early = await committedMutation(SIG.del, [[flockAnchor,
      `    perform private.lock_balances(array(select l.item_id from public.flock_issue_lines l where l.org_id = v_org and l.issue_id = any (v_locked) order by l.line_no), array(select l.warehouse_id from public.flock_issue_lines l where l.org_id = v_org and l.issue_id = any (v_locked) order by l.line_no));\n${flockAnchor}`]],
    () => interleave('c3', ...flockThenBalance(3), false));
    t.ok(early.held && early.blocked && [early.aSecond, early.deleted].includes('deadlock detected'),
      `ضابط: حذف يقفل الأرصدة قبل الفوج يتقافل مع ترتيب الصرف (${JSON.stringify(early)})`);
    const balanced = await interleave('c3', ...flockThenBalance(3));
    same(balanced, { held: true, blocked: true, first: 'a', aSecond: 'ok', deleted: 'ok' }, 'الحذف بترتيبه: ينتظر الفوج بعينه، وماسكه يأخذ الرصيد بلا انتظار، ثمّ يُحذف');
    // القاعة for no key update لا for update: كاتب الجولة يمسك الفوج ثمّ يضيف زيارة تشير إلى القاعة (فحص المفتاح الأجنبيّ key share) والحذف ينتظر الفوج؛
    // والضابط: حذف يقفل القاعة for update يحبس ذلك الفحص فيتقافلان.
    const roundAfterFlock = [{ sql: 'select 1 from public.flocks where id = $1 for update', params: [F.c12] },
      { sql: 'select public.set_flock_dead($1, $2, 1, $3, false) as v', params: [F.c12, TODAY, uid()] }];
    const strong = await committedMutation(SIG.del, [[' and y.id = p_hall for no key update;', ' and y.id = p_hall for update;']],
      () => interleave('c12', ...roundAfterFlock, false));
    t.ok(strong.held && strong.blocked && [strong.aSecond, strong.deleted].includes('deadlock detected'),
      `ضابط: حذف يقفل القاعة for update يتقافل مع كاتب جولة يمسك الفوج (${JSON.stringify(strong)})`);
    const keyShare = await interleave('c12', ...roundAfterFlock);
    same(keyShare, { held: true, blocked: true, first: 'a', aSecond: 'ok', deleted: 'ok' }, 'الحذف بقفل القاعة for no key update: كاتب الجولة الماسك للفوج يضيف زيارته بلا انتظار، ثمّ يُحذف');

    // الخاسر أمام الحذف يرى سببه بعد قفل الفوج (الإغلاق وفرق العدّ والصرف)، وضابط كلّ واحد جسم مثبَّت بلا فحص الإلغاء بعد القفل يخطئ السبب.
    const closeParams = async (k) => [uid(), uid(), F[`c${k}`], TODAY, 1000, 0, '[]', 'بيعت خارج النظام', '[]', null, (await closeForm(F[`c${k}`])).plan];
    const loser = async (k, second) => {
      const p = await fresh(`c${k}`);
      return duel({ user: U.manager, sql: DELETE, params: [H[`c${k}`], p.hall.version, p.plan, uid()] }, { user: U.owner, ...second });
    };
    const voidCheck = "  if f.status = 'void' then\n    raise exception 'flock_void'";
    const closeLost = await committedMutation(SIG.close, [[voidCheck, "  if false then\n    raise exception 'flock_void'"]], async () => loser(7, { sql: CLOSE, params: await closeParams(7) }));
    const closeReal = await loser(8, { sql: CLOSE, params: await closeParams(8) });
    same([closeLost.blocked, closeLost.second.error, closeReal.blocked, closeReal.second.error], [true, 'flock_not_placed', true, 'flock_void'],
      'الحذف ثمّ إغلاق الدورة: ينتظر القاعة بعينها ثمّ flock_void (وبلا فحص ما بعد القفل flock_not_placed)');
    const adjust = (k) => ({ sql: 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7) as v', params: [uid(), uid(), F[`c${k}`], TODAY, -1, 'سبب', 1000] });
    const adjustLost = await committedMutation(SIG.adjust, [[voidCheck, "  if false then\n    raise exception 'flock_void'"]], () => loser(9, adjust(9)));
    const adjustReal = await loser(10, adjust(10));
    same([adjustLost.blocked, adjustLost.second.error, adjustReal.blocked, adjustReal.second.error], [true, 'flock_closed', true, 'flock_void'],
      'الحذف ثمّ فرق العدّ: ينتظر الفوج بعينه ثمّ flock_void (وبلا فحص ما بعد القفل flock_closed)');
    const recordLost = await committedMutation(SIG.record, [[`  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for share;\n${voidCheck}`,
      `  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for share;\n  if false then\n    raise exception 'flock_void'`]],
    () => loser(11, { sql: RF, params: [uid(), uid(), uid(), F.c11, I.m1, 10, TODAY, W.feed] }));
    same([recordLost.blocked, recordLost.second.error, r4.second.error], [true, 'flock_not_placed', 'flock_void'], 'الصرف أمام الحذف: flock_void بعد القفل (وبلا فحصه flock_not_placed)');
  });

  // ── ١٠) الثابت verify_delete_hall وضوابطه ──────────────────────────────────────────────────────────────────────────
  const verifyOf = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_delete_hall()')).rows.map((r) => [r.check_name, r.v]));
  await section('الثابت', async () => {
    same(await db.asService(verifyOf), VERIFY_ZERO, 'الثابت صفر والأفواج الملغاة كثيرة (بصرف وتأشير ومركون وعدّ وتذكرة وبيع ملغيين وبلا سجلّ)');
    const issueOf = await scalar("select id from public.flock_issues where flock_id = $1 and status = 'void' order by doc_no limit 1", [F.t8]);
    const reversal = await scalar('select c.id from public.flock_costs c where c.flock_id = $1 and c.reverses_id is not null order by c.id limit 1', [F.t8]);
    const controls = await mutant(db, U.owner, [], async ({ oq }) => {
      const probe = async (...steps) => {
        await oq('savepoint control');
        try {
          for (const [sql, params] of steps) await oq(sql, params);
          return await verifyOf(oq);
        } finally {
          await oq('rollback to savepoint control');
        }
      };
      return {
        posted: await probe(["update public.flock_issues set status = 'posted', voided_at = null, voided_by = null, void_reason = null where id = $1", [issueOf]]),
        vaccination: await probe(["update public.flock_vaccinations set status = 'done', voided_at = null, voided_by = null, void_reason = null where id = $1", [id(300)]]),
        live: await probe(['alter table public.halls disable trigger halls_check', []], ['update public.halls set archived_at = null where id = $1', [H.t8]]),
        costs: await probe(['alter table public.flock_costs disable trigger user', []], ['delete from public.flock_costs where id = $1', [reversal]]),
        shape: await probe(['update public.flocks set void_reason = null where id = $1', [F.t8]]),
      };
    });
    same([controls.posted.void_flock_posted_issue, controls.vaccination.void_flock_done_vaccination, controls.live.void_flock_live_hall, controls.costs.void_flock_costs,
      controls.shape.void_flock_shape], [1, 1, 1, 1, 1], 'ضوابط الثابت: صرف مرحَّل، وتأشير «تمّ»، وقاعة فعّالة، وكلفة غير صفر، وإلغاء بلا سبب، كلّ واحد ينمسك');
    // منع البيع والتذاكر والنقل المطبَّق يحرسه الثابت: delete_hall بلا منعه (v_block := null) داخل معاملة ترجع يُلغي الفوج فيمسكه الثابت، وبجسمه الحقيقي
    // يرفض فيبقى الثابت صفراً (طفرة حقيقية، لا صفّ مكتوب باليد).
    const unblock = [[SIG.del, [['  v_block := private.delete_hall_blocks(h, f) -> 0;', '  v_block := null;']]]];
    const deleteThen = (key, fns) => mutant(db, U.owner, fns, async ({ oq, attempt }) => {
      const p = await inside(attempt, U.manager, PREVIEW, [H[key]]);
      const result = await inside(attempt, U.manager, DELETE, [H[key], p.hall.version, p.plan, uid()]);
      const v = await verifyOf(oq);
      return [result?.deleted === true ? 'deleted' : result?.code, v.void_flock_posted_sale, v.void_flock_live_ticket, v.void_flock_applied_carry];
    });
    const guarded = {};
    for (const key of ['sale', 'ticket', 'carryApplied']) guarded[key] = { real: await deleteThen(key, []), unblocked: await deleteThen(key, unblock) };
    same(guarded, {
      sale: { real: ['hall_has_sales', 0, 0, 0], unblocked: ['deleted', 1, 1, 0] },
      ticket: { real: ['hall_has_tickets', 0, 0, 0], unblocked: ['deleted', 0, 1, 0] },
      carryApplied: { real: ['hall_has_carry', 0, 0, 0], unblocked: ['deleted', 0, 0, 1] },
    }, 'ضوابط الثابت للمنع: الحذف بلا منعه يُلغي فوجاً بفاتورة مرحَّلة وتذكرة مكتملة (void_flock_posted_sale وvoid_flock_live_ticket)، وبمسوّدة تذكرة، وبعلف منقول مطبَّق (void_flock_applied_carry)؛ والجسم الحقيقي يرفض والثابت صفر');
  });

  // ── ١١) طفرة لكلّ تغيير في القرّاء والكتّاب: الجسم بلا التغيير يفشل فحصه ────────────────────────────────────────────────────────
  await section('الطفرات', async () => {
    const off = (anchor) => [anchor, anchor.replace("f.status = 'void'", 'false')];
    const shown = (v) => JSON.stringify(v);
    const MUTATIONS = [
      ['flock_for', SIG.flockFor, [off("  if f.status = 'void' then\n    raise exception 'flock_void'")], (a) => inside(a, U.manager, 'select public.hall_sheet($1) as v', [F.t8]).then((v) => v?.code ?? 'ok')],
      ['flock_day_check', SIG.dayCheck, [off("  if f.status = 'void' then\n    raise exception 'flock_void'")], (a) => inside(a, U.manager, DEAD, [F.t8, TODAY, 1, uid(), false]).then((v) => v?.code ?? 'ok')],
      ['halls_check', SIG.hallsCheck, [["f.hall_id = new.id and f.status = 'void') then", 'f.hall_id = new.id and false) then']],
        (a) => inside(a, U.owner, 'update public.halls set archived_at = null where id = $1 returning id as v', [H.t8]).then((v) => v?.code ?? 'ok')],
      ['save_flock_visit', SIG.visit, [off("  if f.status = 'void' then\n    if not v_queued then")],
        (a) => inside(a, U.worker, VISIT, [uid(), F.t8, TODAY, ago(20), 2, 0, null, null, null, null, null, null, false, uid(), true])],
      ['save_flock_day', SIG.day, [off("  if f.status = 'void' then\n    if not v_queued then")],
        (a) => inside(a, U.worker, DAY, [F.t8, day(-4), 2, 0, null, null, null, null, null, null, null, null, null, uid(), true])],
      ['set_flock_dead', SIG.dead, [["case when f.status = 'void' then 'flock_void' when", "case when false then 'flock_void' when"]],
        (a) => inside(a, U.worker, DEAD, [F.t8, day(-5), 3, uid(), true])],
      ['add_flock_gas', SIG.add, [["case when f.status = 'void' then 'flock_void' when", "case when false then 'flock_void' when"]], (a) => inside(a, U.worker, ADD, [F.t8, day(-5), 1, uid(), true])],
      ['set_flock_gas', SIG.gas, [["case when f.status = 'void' then 'flock_void' when", "case when false then 'flock_void' when"]], (a) => inside(a, U.worker, GAS, [F.t8, day(-5), 2, null, uid(), true])],
      ['record_flock_weight', SIG.weight, [off("  if f.status = 'void' then\n    raise exception 'flock_void'")],
        (a) => inside(a, U.manager, 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [F.t8, TODAY, 50, 500, uid()]).then((v) => v?.code ?? 'ok')],
      ['edit_flock', SIG.edit, [off("  if f.status = 'void' then\n    raise exception 'flock_void'")],
        (a) => inside(a, U.manager, 'select public.edit_flock($1, 2, $2, 25000, 0, null, $3) as v', [F.t8, day(-13), uid()]).then((v) => v?.code ?? 'ok')],
      ['delete_flock', SIG.deleteFlock, [off("  if f.status = 'void' then\n    raise exception 'flock_void'")],
        (a) => inside(a, U.manager, 'select public.delete_flock($1, 2, $2) as v', [F.t8, uid()]).then((v) => v?.code ?? 'ok')],
      ['record_flock_issue (قبل القفل)', SIG.record, [["  select * into h from public.halls y where y.org_id = f.org_id and y.id = f.hall_id;\n  if f.status = 'void' then",
        '  select * into h from public.halls y where y.org_id = f.org_id and y.id = f.hall_id;\n  if false then']],
      (a) => inside(a, U.manager, RF, [uid(), uid(), uid(), F.t8, I.m1, 10, day(1), W.feed]).then((v) => v?.code ?? 'ok')],
      ['flock_detail', SIG.detail, [off("  -- 0037: فوج حُذفت قاعته لا يُعرض.\n  if f.status = 'void' then")], (a) => inside(a, U.manager, 'select public.flock_detail($1) as v', [F.t8]).then((v) => v?.code ?? 'ok')],
      ['flock_feed', SIG.feed, [off("  -- 0037: فوج حُذفت قاعته لا يُعرض.\n  if f.status = 'void' then")], (a) => inside(a, U.manager, 'select public.flock_feed($1) as v', [F.t8]).then((v) => v?.code ?? 'ok')],
      ['flock_issue_options', SIG.options, [off("  -- 0037: فوج حُذفت قاعته لا يُعرض.\n  if f.status = 'void' then")],
        (a) => inside(a, U.manager, 'select public.flock_issue_options($1) as v', [F.t8]).then((v) => v?.code ?? 'ok')],
      ['round_visits (بمعرّفه)', SIG.visits, [off("    if f.status = 'void' then")], (a) => inside(a, U.manager, 'select public.round_visits($1, $2, $3) as v', [TODAY, 'broiler', F.t8]).then((v) => v?.code ?? 'ok')],
      ['round_visits (القائمة)', SIG.visits, [["and fl.status <> 'void' and", 'and']],
        (a) => inside(a, U.manager, 'select public.round_visits($1, $2, null) as v', [TODAY, 'broiler']).then((v) => v.flocks.some((f) => f.flock_id === F.t8))],
      ['halls_day', SIG.hallsDay, [["(x.closed_on is null or v_on <= x.closed_on) and x.status <> 'void'", '(x.closed_on is null or v_on <= x.closed_on)']],
        (a) => inside(a, U.manager, 'select public.halls_day(null) as v', []).then((v) => v.sites.some((s) => s.halls.some((h) => h.hall_id === H.t8)))],
      ['halls_history', SIG.history, [["and x.status <> 'void' and public.in_scope_site(h.site_id)", 'and public.in_scope_site(h.site_id)']],
        (a) => inside(a, U.manager, 'select public.halls_history(null) as v', []).then((v) => v.kinds.some((k) => k.events.some((e) => e.hall === NAMES.t8)))],
      ['flock_cycles', SIG.cycles, [["and x.status <> 'void' and public.in_scope_site(x.site_id)", 'and public.in_scope_site(x.site_id)']],
        (a) => inside(a, U.manager, 'select public.flock_cycles() as v', []).then((v) => v.cycles.some((c) => c.id === F.t8))],
      ['verify_hall_sheet', SIG.verifySheet, [["and x.placed_on is not null and x.status <> 'void' order by x.id loop", 'and x.placed_on is not null order by x.id loop']],
        (a) => a(U.owner, async (q) => (await q('select coalesce(sum(violations), 0)::int as v from public.verify_hall_sheet()')).rows[0].v, 'postgres').then((r) => r.value)],
    ];
    const results = [];
    for (const [name, sig, pairs, probe] of MUTATIONS) {
      const real = await mutant(db, U.owner, [], ({ attempt }) => probe(attempt));
      const broken = await mutant(db, U.owner, [[sig, pairs]], ({ attempt }) => probe(attempt)).catch((error) => `مرساة: ${error.message}`);
      results.push([name, shown(real) !== shown(broken), real, broken]);
    }
    same(results.filter(([, caught]) => !caught), [], `كلّ تغيير بطفرته يُفشل فحصه (${results.length})`);
    const wanted = Object.fromEntries(results.map(([name, , real]) => [name, real]));
    const parkedVoid = { status: 'parked', reason: 'flock_void' };
    same(wanted, {
      flock_for: 'flock_void', flock_day_check: 'flock_void', halls_check: 'hall_deleted', save_flock_visit: parkedVoid, save_flock_day: parkedVoid,
      set_flock_dead: parkedVoid, add_flock_gas: parkedVoid, set_flock_gas: parkedVoid, record_flock_weight: 'flock_void', edit_flock: 'flock_void', delete_flock: 'flock_void',
      'record_flock_issue (قبل القفل)': 'flock_void', flock_detail: 'flock_void', flock_feed: 'flock_void', flock_issue_options: 'flock_void', 'round_visits (بمعرّفه)': 'flock_void',
      'round_visits (القائمة)': false, halls_day: false, halls_history: false, flock_cycles: false, verify_hall_sheet: 0,
    }, 'والأجسام الحقيقية بالنتائج المطلوبة');
    // void_flock_issue: صرف فوج ملغى ملغى دائماً (الثابت)، فحارسه الثاني يُفحص بخرق الثابت داخل معاملة ترجع.
    const issueOf = await scalar("select id from public.flock_issues where flock_id = $1 and status = 'void' order by doc_no limit 1", [F.t8]);
    const guard = async (pairs) => mutant(db, U.owner, pairs, async ({ oq, attempt }) => {
      await oq("update public.flock_issues set status = 'posted', voided_at = null, voided_by = null, void_reason = null where id = $1", [issueOf]);
      return (await inside(attempt, U.manager, VF, [issueOf, 'خطأ', uid()]))?.code ?? 'ok';
    });
    const guarded = [await guard([]), await guard([[SIG.voidIssue, [off("  if f.status = 'void' then\n    raise exception 'flock_void'")]]])];
    same([guarded[0], guarded[1] !== 'flock_void'], ['flock_void', true],
      `إلغاء صرف لفوج ملغى (بخرق الثابت): flock_void، وبلا الحارس يمضي إلى العكس فيفشل بغيره (${guarded[1]})`);
  });

  // ── «اليوم السابق» في التقرير اليوميّ لا يعدّ الفوج الملغى: منشأة ثانية فيها قاعة واحدة حُذفت بفوجها (في هذه المنشأة دورات قبل كلّ فوج ملغى) ─────
  await section('اليوم السابق', async () => {
    const G2 = await makeOrg(db, {
      name: 'مزرعة الحذف الثانية',
      id: (n) => `d3737000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`,
      phone: (n) => `964770373709${n}`,
      roles: [['owner', 'owner']],
    });
    const owner = G2.users.owner;
    const site2 = await one(owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل التجربة', 'farm') returning id", [G2.divisions.broiler]);
    const hall2 = await one(owner, "insert into public.halls (site_id, name) values ($1, 'قاعة تجريبية') returning id", [site2]);
    await one(owner, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [hall2, day(-3), uid()]);
    const before = (await one(owner, 'select public.halls_day($1) as v', [day(-2)])).prev;
    const p = await one(owner, PREVIEW, [hall2]);
    await one(owner, DELETE, [hall2, p.hall.version, p.plan, uid()]);
    const prev = (attempt) => inside(attempt, owner, 'select public.halls_day($1) as v', [day(-2)]).then((v) => v?.prev ?? v);
    const real = await mutant(db, owner, [], ({ attempt }) => prev(attempt));
    const broken = await mutant(db, owner, [[SIG.hallsDay, [["x.placed_on < v_on and x.status <> 'void' and", 'x.placed_on < v_on and']]]], ({ attempt }) => prev(attempt));
    same([before, real, broken], [true, false, true], '«اليوم السابق»: قبل الحذف يوجد، وبعده لا (والجسم بلا الاستثناء يعدّ الفوج الملغى)');
  });

  // ── ١٢) ملفّ التراجع ──────────────────────────────────────────────────────────────────────────────────────────────
  await section('ملفّ التراجع', async () => {
    const rollback = readFileSync(path.join(MIGRATIONS, 'rollback_0037.sql'), 'utf8');
    const forward = readFileSync(path.join(MIGRATIONS, '0037_delete_hall.sql'), 'utf8');
    const BODIES = [['0026_halls_v2.sql', 'private.flock_for'], ['0035_hall_sheet.sql', 'private.flock_day_check'], ['0029_bird_sales_close.sql', 'private.halls_check'],
      ['0036_round_once.sql', 'public.save_flock_visit'], ['0036_round_once.sql', 'public.save_flock_day'], ['0036_round_once.sql', 'public.set_flock_dead'],
      ['0036_round_once.sql', 'public.add_flock_gas'], ['0035_hall_sheet.sql', 'public.set_flock_gas'], ['0035_hall_sheet.sql', 'public.record_flock_weight'],
      ['0035_hall_sheet.sql', 'public.edit_flock'], ['0035_hall_sheet.sql', 'public.delete_flock'], ['0019_flock_issue.sql', 'public.record_flock_issue'],
      ['0029_bird_sales_close.sql', 'public.close_flock'], ['0029_bird_sales_close.sql', 'public.record_flock_count_adjust'], ['0029_bird_sales_close.sql', 'public.flock_detail'],
      ['0029_bird_sales_close.sql', 'public.flock_feed'], ['0019_flock_issue.sql', 'public.flock_issue_options'], ['0032_round_visits.sql', 'public.round_visits'],
      ['0029_bird_sales_close.sql', 'public.halls_day'], ['0036_round_once.sql', 'public.halls_history'], ['0029_bird_sales_close.sql', 'public.flock_cycles'],
      ['0019_flock_issue.sql', 'public.void_flock_issue'], ['0035_hall_sheet.sql', 'public.verify_hall_sheet']];
    same(BODIES.filter(([file, head]) => !rollback.includes(bodyOf(file, head))).map(([, head]) => head), [], `ملفّ التراجع يرجّع الأجسام (${BODIES.length}) كما في آخر هجرة عرّفتها حرفاً`);
    same(BODIES.map(([, head]) => head).filter((head) => forward.split(`create or replace function ${head}(`).length !== 2), [], 'وكلّ جسم منها معرَّف في 0037 مرّة واحدة');
    same(BODIES.filter(([file, head]) => bodyOf(file, head) === bodyOf('0037_delete_hall.sql', head)).map(([, head]) => head), [], 'وكلّ جسم منها تغيّر في 0037');
    const run = async (oq, sql) => {
      await oq('savepoint rollback_probe');
      try {
        await oq(sql);
        return { status: 'كمل', flockFor: (await oq("select prosrc from pg_proc where oid = 'private.flock_for(uuid, boolean)'::regprocedure")).rows[0].prosrc,
          voidIssue: (await oq("select prosrc from pg_proc where oid = 'public.void_flock_issue(uuid, text, uuid)'::regprocedure")).rows[0].prosrc,
          columns: (await oq("select count(*)::int as n from pg_attribute where attrelid = 'public.flocks'::regclass and attname like 'void%' and not attisdropped")).rows[0].n,
          voided: (await oq("select count(*)::int as n from public.flocks where status = 'void'")).rows[0].n,
          gone: (await oq("select count(*)::int as n from pg_proc where proname in ('delete_hall', 'delete_hall_preview', 'verify_delete_hall', 'flock_issue_reverse')")).rows[0].n };
      } catch (error) {
        return { status: `${error.message}|${error.hint ?? ''}` };
      } finally {
        await oq('rollback to savepoint rollback_probe');
      }
    };
    const outcome = await mutant(db, U.owner, [], async ({ oq }) => {
      const voided = (await oq("select count(*)::int as n from public.flocks where status = 'void'")).rows[0].n;
      return { voided, real: await run(oq, rollback), unguarded: await run(oq, rollback.replace('if v_void > 0 then', 'if false then')) };
    });
    t.ok(outcome.voided > 0 && outcome.real.status.startsWith('rollback_blocked|') && outcome.real.status.includes(`عدد الأفواج الملغاة بحذف قاعاتها: ${outcome.voided}،`),
      `التراجع يرفض بصوت والأفواج الملغاة في القاعدة (${outcome.voided}: ${outcome.real.status})`);
    same([outcome.unguarded.status, outcome.unguarded.flockFor === srcOf(bodyOf('0026_halls_v2.sql', 'private.flock_for')),
      outcome.unguarded.voidIssue === srcOf(bodyOf('0019_flock_issue.sql', 'public.void_flock_issue')), outcome.unguarded.columns, outcome.unguarded.voided, outcome.unguarded.gone],
    ['كمل', true, true, 0, 0, 0], 'وبلا فرعه يكمل: الأجسام القديمة حرفاً، وأعمدة الإلغاء تُسقط، والملغى يصير مغلقاً، والدوالّ الجديدة تُسقط');
  });

  same(await db.asService(verifyOf), VERIFY_ZERO, 'الثابت صفر في نهاية الملفّ');
  if (process.env.DELETE_HALL_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/delete-hall.test.mjs بـDELETE_HALL_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ محلّلات الشاشات (الجزء H) تقرؤها. منشأة كمنشأة الزبون: «${NAMES.t8}» بفوج قائم (14 يوماً من الجولات وغاز وسبع إرسالات علف من «رصيد العلف» وتأشير لقاح مصروف ودواء ووزن وفرق عدّ وتذكرة ملغاة)، و«${NAMES.ended}» بدورة منتهية، و«${NAMES.empty}» بلا فوج، و«${NAMES.sale}» بفاتورة طيور، و«قاعة الجرد» و«قاعة السعر» و«قاعة الجرد والسعر» لمنعي counted وrevalued (جرد معتمد وسعر أُكمل بعد الإرسال). والصلاحية (permission) لا تقع بعد 0034 لعضو في منشأته، فعيّناتها من معاملة ترجع ودالّة النطاق أو الفعل تقول لا.`,
      ...samples,
    }, null, 1) + '\n');
  }
}
