// مراجعة 0036_round_once العدائية (القاعدة) وإصلاحها (العقد docs/plans/0036/contract-0036.md «الجزء د»، وDECISIONS 2026-11-24 بجوابَي المالك وقرارات
// علامة الهلاكات): كلّ فحص R يعيد ملاحظة فشلت على الهجرة كما بُنيت (b5e0ca7)؛ وكلّ فحص Q سؤال تصميم انحسم فيفحص القرار؛ وفحوص N «صافي العلف المرسل»
// (جواب المالك «عوف سالفة العلف الماكول»): العلف التراكميّ ومعامل التحويل في الملخّص، ومعامل التحويل وEPEF والعلف لكلّ طير في تقرير الدورة، بعيّنات
// حيّة ومبيعة ومغلقة وبيّاض وبسطر بلا كتلة؛ وكلّ فحص K يقتل طفرة كانت تعبر الحزمة (الجسم الحقيقيّ صحيح والطفرة لا، داخل معاملة صاحب الجداول ترجع).
// REVIEW_VERBOSE=1 يطبع قيم K.
// منشأة هذا الملفّ: المعرّفات d3638000-… والهواتف 96477036380xx (مفحوصة بـgrep على كلّ ملفّات الفحص وفروع 0036).
// البذرة: حقل لحم بقاعات المراجعة والطفرات وصافي العلف (1,000 طير قبل 20 يوماً لكلّ واحدة، و«قاعة صافي المبيع» 100)، وحقل بيض بقاعة (2,000 قبل عشرة
// أيّام)، و«علف بادئ» و«علف ناهي» و«علف بالقطعة» (بلا كتلة قطعة) في «رصيد العلف»، و«زيت مراجعة» (لتر، 0.92 كغم للتر) في مخزن المواد.
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { race } from './shared.mjs';
import { postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-24';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const ddmm = (on) => `${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}`;
const id = (n) => `d3638000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477036380${String(n).padStart(2, '0')}`;
/** وقت تسجيل قبل الآن بدقائق (ساعة الخادم الحقيقية، فلا bad_time أيّاً كان يوم تشغيل الحزمة). */
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

const DEAD = 'select public.set_flock_dead($1, $2, $3, $4, $5) as v';
const ADD = 'select public.add_flock_gas($1, $2, $3, $4, $5) as v';
const GAS = 'select public.set_flock_gas($1, $2, $3, $4, $5, $6) as v';
const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const VISIT = 'select public.save_flock_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const ISSUE = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v';
const WEIGHT = 'select public.record_flock_weight($1, $2, $3, $4, $5) as v';
const OVERVIEW = 'select public.flocks_overview() as v';
const DETAIL = 'select public.flock_detail($1) as v';
const SHEET = 'select public.hall_sheet($1) as v';
const REPORT = 'select public.flock_cycle_report($1) as v';

const deadParams = (d) => [d.flock, d.on ?? TODAY, d.n ?? null, d.ref ?? uid(), d.queued ?? false];
const addParams = (g) => [g.flock, g.on ?? TODAY, g.n ?? null, g.ref ?? uid(), g.queued ?? false];
const gasParams = (g) => [g.flock, g.on ?? TODAY, g.n ?? null, g.base ?? null, g.ref ?? uid(), g.queued ?? false];
const dayParams = (d) => [d.flock, d.on ?? TODAY, d.dead ?? null, d.culled ?? null, null, null, null, null, d.eggs ?? null, null, null, d.note ?? null,
  d.base ?? null, d.ref ?? uid(), d.queued ?? false];
const visitParams = (v) => [v.id ?? uid(), v.flock, v.on ?? TODAY, v.at ?? ago(60), v.dead ?? null, v.culled ?? null, v.feed ?? null, v.eggs ?? null,
  null, null, v.note ?? null, v.base ?? null, v.void ?? false, v.ref ?? uid(), v.queued ?? false];

const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  /** مقارنة بمفاتيح مرتّبة (jsonb يرتّب مفاتيحه بالطول ثمّ بالحروف). */
  const same = (actual, expected, label) => t.same(sorted(actual), sorted(expected), label);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };
  const G = await makeOrg(db, {
    name: 'مزرعة مراجعة الجولة',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['worker', 'hall_worker', ['broiler']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const code = (result) => (result.ok ? 'ok' : result.code);
  const dead = (user, d) => call(db, user, DEAD, deadParams(d));
  const add = (user, g) => call(db, user, ADD, addParams(g));
  const saveDay = (user, d) => call(db, user, DAY, dayParams(d));
  const visit = (user, v) => call(db, user, VISIT, visitParams(v));
  const dayRow = async (flock, on) => (await db.admin('select dead, culled, version, dead_entered from public.flock_daily where flock_id = $1 and on_date = $2', [flock, on])).rows[0] ?? null;
  const summaryOf = (view, hallId) => view.sites.flatMap((s) => s.halls).find((h) => h.id === hallId)?.flock ?? null;
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };

  // ── البذرة ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const S = { a: await site('broiler', 'حقل المراجعة'), l: await site('layer', 'حقل بيض المراجعة') };
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const place = async (hallId, on, count) => (await one(U.owner, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const H = {};
  const F = {};
  for (let n = 1; n <= 10; n += 1) {
    H[`a${n}`] = await hall(S.a, `قاعة مراجعة ${n}`);
    F[`a${n}`] = await place(H[`a${n}`], day(-20), 1000);
  }
  for (let n = 1; n <= 6; n += 1) {
    H[`k${n}`] = await hall(S.a, `قاعة طفرات ${n}`);
    F[`k${n}`] = await place(H[`k${n}`], day(-20), 1000);
  }
  for (const [key, name, count] of [['nL', 'قاعة صافي حيّة', 1000], ['nS', 'قاعة صافي المبيع', 100], ['nU', 'قاعة بلا كتلة', 1000]]) {
    H[key] = await hall(S.a, name);
    F[key] = await place(H[key], day(-20), count);
  }
  H.l = await hall(S.l, 'قاعة بيض المراجعة');
  F.l = await place(H.l, day(-10), 2000);
  const item = (name, kind, unit = 'kg') => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = { starter: await item('علف بادئ', 'feed'), finisher: await item('علف ناهي', 'feed'), piece: await item('علف بالقطعة', 'feed', 'pc') };
  I.oil = await one(U.owner, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ('زيت مراجعة', 'raw', 'L', 0.92) returning id", []);
  await postedOpening(db, U.owner, W.feed, day(-15), [{ item: I.starter, qty: 5000, value: '2500000.00' }, { item: I.finisher, qty: 5000, value: '3000000.00' },
    { item: I.piece, qty: 10, value: '10000.00' }]);
  await postedOpening(db, U.owner, W.raw, day(-15), [{ item: I.oil, qty: 1000, value: '1000000.00' }]);
  // مخزن علف ثانٍ بـ9,000 ناهياً (أكبر ما في مخزن علف واحد): ما تعرضه الجولة للناهي = 9,000 ما دام فعّالاً ومن نوع العلف (قتلة K13 وK14).
  const W2 = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) select division_id, site_id, 'مخزن علف كبير', 'feed' from public.warehouses where id = $1 returning id", [W.feed]);
  await postedOpening(db, U.owner, W2, day(-15), [{ item: I.finisher, qty: 9000, value: '5400000.00' }]);
  const party = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر المراجعة', true) returning id", []);
  const issue = (flock, itemId, qty, on, wh = W.feed) => one(U.owner, ISSUE, [uid(), uid(), uid(), flock, itemId, qty, on, wh]);
  /** تذكرة وزن بطيور قاعة واحدة (الصافي = الخابط − الفارغ − الأقفاص × وزن القفص) ثمّ فاتورتها. */
  const sell = async (hallId, on, birds, grossKg) => {
    const ticket = uid();
    const data = { site_id: S.a, on_date: on, method: 'scale', empty_kg: '7000', empty_with_crates: false, crate_kg: '6',
      stops: [{ id: uid(), hall_id: hallId, birds, crates: 10, gross_kg: grossKg, weighings: [] }] };
    await one(U.owner, 'select public.save_weigh_ticket($1, null, $2::jsonb) as v', [ticket, JSON.stringify(data)]);
    await one(U.owner, 'select public.finish_weigh_ticket($1, $2, 1) as v', [uid(), ticket]);
    await one(U.owner, 'select public.record_bird_sale($1, $2, $3, 2, $4, 2750, 0, 0, null, null) as v', [uid(), uid(), ticket, party]);
  };

  // ── R1: العلامة لا تبقى بعد إلغاء زيارة الهلاكات ──────────────────────────────────────────────────────────────────────
  // «قاعة مراجعة 1»: هلاكات 3 في زيارة وعلف 50 في أخرى (الجولة المنشورة، 0032)، ثمّ تُلغى زيارة الهلاكات (قاعة خطأ). كان صفّ اليوم يبقى (زيارة العلف)
  // بنافق 0 وعلامة، فتعرض الجولة «سُجّلت هلاكات اليوم: 0» مقفولة وset_flock_dead(4) dead_recorded؛ و«قاعة مراجعة 2» (الضابط، بلا زيارة العلف) يُحذف صفّها
  // وعلامتها فـsaved. العلامة الآن مشتقّة من الزيارات الحيّة: saved في الحالتين.
  await section('R1', async () => {
    const v1 = uid();
    t.eq((await visit(U.worker, { id: v1, flock: F.a1, dead: 3 })).value?.status, 'saved', 'R1 بذرة: زيارة هلاكات (3) في القاعة 1');
    t.eq((await visit(U.worker, { flock: F.a1, feed: '50' })).value?.status, 'saved', 'R1 بذرة: زيارة علف (50 كغم) في القاعة 1');
    t.eq((await visit(U.worker, { id: v1, flock: F.a1, dead: 3, base: 1, void: true })).value?.status, 'saved', 'R1 بذرة: زيارة الهلاكات تُلغى');
    const shown = summaryOf(await one(U.worker, OVERVIEW, []), H.a1)?.today;
    same([shown?.dead, shown?.dead_entered], [0, false], 'R1: بعد الإلغاء صفّ اليوم بلا علامة (زيارة العلف وحدها لا تسجّل هلاكات)');
    const withOther = await dead(U.worker, { flock: F.a1, n: 4 });
    const v2 = uid();
    t.eq((await visit(U.worker, { id: v2, flock: F.a2, dead: 3 })).value?.status, 'saved', 'R1 ضابط: زيارة هلاكات (3) في القاعة 2');
    t.eq((await visit(U.worker, { id: v2, flock: F.a2, dead: 3, base: 1, void: true })).value?.status, 'saved', 'R1 ضابط: تُلغى (الزيارة الوحيدة)');
    const alone = await dead(U.worker, { flock: F.a2, n: 4 });
    same([withOther.value?.status, alone.value?.status, (await dayRow(F.a1, TODAY))?.dead, (await dayRow(F.a2, TODAY))?.dead], ['saved', 'saved', 4, 4],
      `R1: بعد إلغاء زيارة الهلاكات تقبل الجولة هلاكات اليوم وُجدت زيارة أخرى أم لا (${JSON.stringify(await dayRow(F.a1, TODAY))})`);
  });

  // ── R1b: الورقة (save_flock_day) والعلامة ───────────────────────────────────────────────────────────────────────────
  await section('R1b', async () => {
    const flag = async (flock, on) => (await dayRow(flock, on))?.dead_entered ?? null;
    t.eq((await saveDay(U.owner, { flock: F.a9, on: day(-1), dead: 2 })).value?.status, 'saved', 'R1b بذرة: الورقة تكتب هلاكات أمس 2');
    same([await flag(F.a9, day(-1)), (await dead(U.worker, { flock: F.a9, on: day(-1), n: 5 })).value?.status], [true, 'dead_recorded'], 'R1b: هلاكات الورقة الموجبة تقفل الجولة');
    t.eq((await saveDay(U.owner, { flock: F.a9, on: day(-1), dead: 0, base: 1 })).value?.status, 'saved', 'R1b: الورقة تمسح الهلاكات صفراً');
    const reopened = await dead(U.worker, { flock: F.a9, on: day(-1), n: 5 });
    same([reopened.value?.status, (await dayRow(F.a9, day(-1)))?.dead, await flag(F.a9, day(-1))], ['saved', 5, true], 'R1b: مسحها صفراً يعيد خانة الجولة مفتوحة، فتُسجَّل 5');
    // «لا هلاكات اليوم» من الجولة، ثمّ ملاحظة من الورقة (بلا هلاكات في النداء): العلامة تنتقل ولا تُفتح الخانة.
    t.eq((await dead(U.worker, { flock: F.a9, on: day(-2), n: 0 })).value?.status, 'saved', 'R1b بذرة: الجولة «لا هلاكات اليوم» (صفر) قبل يومين');
    t.eq((await saveDay(U.owner, { flock: F.a9, on: day(-2), note: 'ملاحظة الورقة', base: 1 })).value?.status, 'saved', 'R1b: الورقة تكتب ملاحظة اليوم وحدها');
    same([await flag(F.a9, day(-2)), (await dead(U.worker, { flock: F.a9, on: day(-2), n: 3 })).value?.status], [true, 'dead_recorded'],
      'R1b: تعديل الملاحظة لا يفتح الهلاكات (العلامة تنتقل من الزيارات الملغاة)');
    // الصفر الصريح من الورقة ليوم معلَّم صفراً كتابة (العلامة تتغيّر) فيفتح الخانة.
    const cleared = await saveDay(U.owner, { flock: F.a9, on: day(-2), dead: 0, base: 2 });
    same([cleared.value, await flag(F.a9, day(-2)), (await dead(U.worker, { flock: F.a9, on: day(-2), n: 3 })).value?.status], [{ status: 'saved', version: 3 }, false, 'saved'],
      'R1b: الصفر الصريح من الورقة ليوم معلَّم صفراً يكتب (نسخة أكبر) ويفتح الخانة');
    // البيّاض: تعديل البيض من الورقة لا يفتح هلاكات مسجّلة.
    t.eq((await dead(U.owner, { flock: F.l, on: day(-1), n: 2 })).value?.status, 'saved', 'R1b بذرة: هلاكات البيّاض أمس 2');
    t.eq((await saveDay(U.owner, { flock: F.l, on: day(-1), eggs: 1500, base: 1 })).value?.status, 'saved', 'R1b: الورقة تكتب بيض أمس 1,500');
    same([await flag(F.l, day(-1)), (await dead(U.owner, { flock: F.l, on: day(-1), n: 9 })).value?.status], [true, 'dead_recorded'], 'R1b: تعديل البيض لا يفتح الهلاكات');
  });

  // ── Q1 (انحسم): زيارة تطبيق قديم بهلاكات موجبة ليوم مسجَّل لا تُضاف، وصفرها لا يقفل ─────────────────────────────────────────────
  await section('Q1', async () => {
    t.eq((await dead(U.worker, { flock: F.a3, n: 3 })).value?.status, 'saved', 'Q1 بذرة: الجولة تسجّل 3 في القاعة 3 (مقفولة)');
    const queuedId = uid();
    const late = await visit(U.worker, { id: queuedId, flock: F.a3, dead: 2, queued: true });
    const rejects = (await db.admin("select reason, visit_id::text as visit, payload ->> 'dead' as dead from public.flock_day_rejects where flock_id = $1", [F.a3])).rows;
    same([late.value, (await dayRow(F.a3, TODAY))?.dead, rejects], [{ status: 'parked', reason: 'dead_recorded' }, 3, [{ reason: 'dead_recorded', visit: queuedId, dead: '2' }]],
      'Q1 (أ): زيارة من الطابور بهلاكات 2 بعد أن قفلت الجولة 3 تُركن dead_recorded بمعرّفها، واليوم 3 كما هو');
    const direct = await visit(U.worker, { flock: F.a3, dead: 2 });
    t.ok(direct.code === 'dead_recorded' && direct.hint.includes('(3)') && direct.hint.includes('قاعة مراجعة 3') && direct.hint.includes(ddmm(TODAY))
      && direct.hint.includes('صفحة القاعة ← ✎ تعديل الجدول') && !/(^|[^0-9,])([1-9]|10) (هلاك|طير)/u.test(direct.hint),
    `Q1 (أ): بنداء مباشر dead_recorded بتلميح يسمّي المسجَّل وطريق التصحيح (${direct.code}: ${direct.hint})`);
    // زيارة بصفر صريح (ومعها ملاحظة) ليوم مقفول تُحفظ ولا تغيّر شيئاً؛ ورفعها من صفر إلى هلاكات لا يُضاف.
    const zeroId = uid();
    t.eq((await visit(U.worker, { id: zeroId, flock: F.a3, dead: 0, note: 'زيارة بلا هلاكات' })).value?.status, 'saved', 'Q1: زيارة بصفر صريح ليوم مقفول تُحفظ');
    const raised = await visit(U.worker, { id: zeroId, flock: F.a3, dead: 2, note: 'زيارة بلا هلاكات', base: 1 });
    const raisedQueued = await visit(U.worker, { id: zeroId, flock: F.a3, dead: 2, note: 'زيارة بلا هلاكات', base: 1, queued: true });
    same([code(raised), raisedQueued.value, await dayRow(F.a3, TODAY)], ['dead_recorded', { status: 'parked', reason: 'dead_recorded' }, { dead: 3, culled: 0, version: 2, dead_entered: true }],
      'Q1: تعديل يرفع زيارة من صفر إلى هلاكات ليوم مقفول: مباشرةً dead_recorded، ومن الطابور يُركن، واليوم 3');
    const reparked = await visit(U.worker, { id: zeroId, flock: F.a3, dead: 4, note: 'زيارة بلا هلاكات', base: 1, queued: true });
    same([reparked.value, (await db.admin("select version, payload ->> 'dead' as dead, reason, decision from public.flock_day_rejects where visit_id = $1", [zeroId])).rows],
      [{ status: 'parked', reason: 'dead_recorded' }, [{ version: 2, dead: '4', reason: 'dead_recorded', decision: null }]],
      'Q1: الزيارة المركونة نفسها تُركن من جديد بآخر ما أرسله الجهاز ونسختها أكبر (صفّ واحد بمعرّفها)');
    // ورقة القاعة تعرض المركونتين بسببهما في رفّ المراجعة، وتُحسمان كغيرهما (decide_flock_reject بالنسخة المعروضة).
    const shelf = (await one(U.owner, SHEET, [F.a3])).rejects.filter((r) => r.reason === 'dead_recorded').map((r) => [r.payload.dead, r.version]);
    const rejectId = (await db.admin('select id from public.flock_day_rejects where visit_id = $1', [zeroId])).rows[0].id;
    const decided = await one(U.owner, 'select public.decide_flock_reject($1, $2, $3) as v', [rejectId, 'handled', 2]);
    same([shelf, decided.status, decided.decision], [[[2, 1], [4, 2]], 'saved', 'handled'], 'Q1: رفّ المراجعة في الورقة يعرض المركونتين بسبب dead_recorded، وتُحسمان كغيرهما');
    // (ب) زيارة تطبيق قديم «زرت ولا هلاكات» (صفر) لا تقفل اليوم، فتُسجَّل هلاكات الجولة الحقيقية.
    t.eq((await visit(U.worker, { flock: F.a4, dead: 0, feed: '40', queued: true })).value?.status, 'saved', 'Q1 بذرة: زيارة قديمة «لا هلاكات» (صفر) وعلف في القاعة 4');
    const after = await dead(U.manager, { flock: F.a4, n: 4 });
    same([after.value?.status, (await dayRow(F.a4, TODAY))?.dead], ['saved', 4], 'Q1 (ب): صفر الزيارة لا يقفل اليوم، فهلاكات الجولة 4 تُسجَّل');
    // تعديل الزيارة المعلَّمة نفسها مسموح، ومسحها صفراً يفتح الخانة.
    const markedId = uid();
    t.eq((await visit(U.worker, { id: markedId, flock: F.a10, dead: 3 })).value?.day?.dead_entered, true, 'Q1 بذرة: زيارة بهلاكات 3 تعلّم اليوم (القاعة 10)');
    same((await visit(U.worker, { id: markedId, flock: F.a10, dead: 5, base: 1 })).value?.day?.dead, 5, 'Q1: تعديل الزيارة المعلَّمة نفسها (3 ← 5) يُحفظ');
    same((await visit(U.worker, { id: markedId, flock: F.a10, dead: 0, base: 2 })).value?.day?.dead_entered, false, 'Q1: ومسحها صفراً يفتح الخانة');
    same((await dead(U.worker, { flock: F.a10, n: 4 })).value?.day?.dead, 4, 'Q1: فتُسجَّل هلاكات الجولة');
  });

  // ── R2: «أُرسل اليوم» في الجولة = الورقة والتقرير اليوميّ يوم التسكين بعلف منقول ─────────────────────────────────────────────────
  // «قاعة مراجعة النقل»: وجبة أُرسل لها 30 كغم ناهياً، وأُغلقت قبل يومين بنقلها للوجبة التالية، والتالية تُسكَّن اليوم. سطر اليوم في الورقة وhalls_day يعدّان
  // الثلاثين (carry_in، مراجعة 0035)، وكان علف اليوم في الملخّص يقرأ سطور الصرف وحدها.
  await section('R2', async () => {
    const hallId = await hall(S.a, 'قاعة مراجعة النقل');
    const p = await place(hallId, day(-20), 300);
    await issue(p, I.finisher, 30, day(-4));
    const form = await one(U.owner, 'select public.flock_close_form($1) as v', [p]);
    const pools = form.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }));
    await one(U.owner, "select public.close_flock($1, $2, $3, $4, $5, 0, $6::jsonb, 'بيعت خارج النظام', $7::jsonb, null, $8) as v",
      [uid(), uid(), p, day(-2), form.flock.live, JSON.stringify(pools), JSON.stringify([{ item_id: I.finisher, qty: '30', action: 'carry' }]), form.plan]);
    const q = await place(hallId, TODAY, 300);
    const summary = (await one(U.owner, DETAIL, [q])).flock;
    const overviewSummary = summaryOf(await one(U.owner, OVERVIEW, []), hallId);
    const sheet = await one(U.owner, SHEET, [q]);
    const sheetToday = sheet.days.find((d) => d.on === TODAY);
    const report = (await one(U.owner, 'select public.halls_day($1) as v', [TODAY])).sites.flatMap((s) => s.halls).find((h) => h.hall_id === hallId)?.flock;
    same([sheetToday?.feed_kg, sheetToday?.carry_in_kg, report?.feed_given_kg], ['30.000', '30.000', '30.000'], 'R2 بذرة: الورقة والتقرير اليوميّ يعدّان الثلاثين المنقولة اليوم');
    same(
      [summary.feed_today_kg, overviewSummary?.feed_today_kg, summary.feed_today],
      [sheetToday?.feed_kg, sheetToday?.feed_kg, [{ item_id: I.finisher, item_name: 'علف ناهي', qty: '30.000', unit: 'kg', carry: true }]],
      `R2: علف اليوم في الجولة (flock_detail وflocks_overview) = سطر اليوم في الورقة والتقرير يوم التسكين بعلف منقول، والسطر بعلامة carry (${JSON.stringify(summary.feed_today)})`,
    );
    // وما يُرسل يوم التسكين نفسه بعد المنقول: المنقول أوّلاً ثمّ المرسل بلا علامة.
    await issue(q, I.starter, 20, TODAY);
    const both = (await one(U.owner, DETAIL, [q])).flock;
    same([both.feed_today_kg, both.feed_today.map((x) => [x.item_name, x.qty, x.carry])], ['50.000', [['علف ناهي', '30.000', true], ['علف بادئ', '20.000', false]]],
      'R2: المنقول أوّلاً بعلامته ثمّ المرسل، والكيلو مجموعهما');
  });

  // ── R3: تلميح الحدّ بالفصحى ───────────────────────────────────────────────────────────────────────────────────────
  // درس CLAUDE.md 2026-10-24 («2 بيضة» ليست فصحى: الواحد والاثنان كلمة، ومن ثلاث إلى عشر جمع)؛ والتلميح كان «%s قنينة حتى الآن» لأيّ مجموع.
  await section('R3', async () => {
    t.eq((await call(db, U.owner, GAS, gasParams({ flock: F.a6, n: 3 }))).value?.status, 'saved', 'R3 بذرة: غاز اليوم 3');
    const over = await add(U.owner, { flock: F.a6, n: 998 });
    t.eq(code(over), 'bad_value', 'R3 بذرة: 3 + 998 فوق الحدّ');
    t.ok(!/(^|[^0-9,])([1-9]|10) قنينة/u.test(over.hint) && over.hint.includes('(3)') && over.hint.includes('ألف قنينة') && over.hint.includes('أضف 997'),
      `R3: تلميح الحدّ لا يضع عدداً من 1 إلى 10 قبل «قنينة» (${over.hint})`);
    const full = await add(U.owner, { flock: F.a6, n: 997 });
    const atCap = await add(U.owner, { flock: F.a6, n: 1 });
    t.ok(full.value?.gas?.cylinders === 1000 && code(atCap) === 'bad_value' && atCap.hint.includes('بلغ الحدّ (ألف قنينة لليوم)'), `R3: تلميح «بلغ الحدّ» بالكلمة (${atCap.hint})`);
  });

  // ── Q2 (انحسم كما هو): إضافة غاز من الطابور قبل تصحيح الورقة تُضاف بعده ───────────────────────────────────────────────────
  // جواب المالك (DECISIONS 2026-11-24): الإضافة إضافةٌ خالصة؛ 08:00 جهاز بلا نت يضيف 2، و09:00 المكتب يكتب مجموع اليوم 2، و10:00 تصل الإضافة: 4.
  await section('Q2', async () => {
    t.eq((await call(db, U.manager, GAS, gasParams({ flock: F.a7, n: 2 }))).value?.gas?.cylinders, 2, 'Q2 بذرة: الورقة تكتب غاز اليوم 2');
    const late = await add(U.worker, { flock: F.a7, n: 2, queued: true });
    same([late.value?.status, late.value?.gas?.cylinders], ['saved', 4], 'Q2: الإضافة من الطابور تُضاف فوق التصحيح (4)');
  });

  // ── Q4 (انحسم كما هو): العدد نفسه من جهاز ثانٍ «حُفظ» ────────────────────────────────────────────────────────────────
  await section('Q4', async () => {
    t.eq((await dead(U.owner, { flock: F.a5, n: 2 })).value?.status, 'saved', 'Q4 بذرة: المالك يسجّل 2 في القاعة 5');
    const second = await dead(U.worker, { flock: F.a5, n: 2, queued: true });
    const other = await dead(U.worker, { flock: F.a5, n: 3, queued: true });
    same([second.value?.status, other.value?.status, (await dayRow(F.a5, TODAY))?.dead], ['saved', 'dead_recorded', 2],
      'Q4: العدد نفسه من العامل saved بلا مراجعة، و3 dead_recorded، واليوم 2');
  });

  // ── Q3 (انحسم: «عوف سالفة العلف الماكول»): علف الحقل ومعامله من صافي المرسل ─────────────────────────────────────────────
  // وجبة تُطعم بطريقة 0036 وحدها: 100 كغم أُرسلت اليوم، ووزن اليوم 900 غم، فلا علف مأكول. كان الملخّص يقول علف 0 بلا معامل، وتقرير الدورة «الباقي في
  // القاعة» 100 بلا معامل ولا EPEF. الآن: العلف 100 والمعامل 100 ÷ (1,000 × 0.9) = 0.111، وEPEF = 100 × 900 ÷ (10 × 20 × 0.111) = 4,054، والعلف لكلّ طير 0.100.
  await section('Q3', async () => {
    await one(U.owner, 'select public.send_flock_feed($1, $2, $3, $4, $5, $6, $7) as v', [uid(), uid(), uid(), F.a8, I.starter, '100', TODAY]);
    await one(U.owner, WEIGHT, [F.a8, TODAY, 50, '900.0', uid()]);
    const s = summaryOf(await one(U.owner, OVERVIEW, []), H.a8);
    const sheet = await one(U.owner, SHEET, [F.a8]);
    same([s?.feed_today_kg, s?.feed_kg_total, s?.fcr, sheet.summary.feed_kg, sheet.summary.feed_net_kg, sheet.summary.fcr], ['100.000', '100.000', '0.111', '100.000', '100.000', null],
      'Q3: علف الحقل = صافي المرسل (= صافي الورقة)، ومعامله 0.111 (الورقة بلا مبيع: معاملها «÷ صافي المباع» فارغ)');
    const k = (await one(U.owner, REPORT, [F.a8])).kpis;
    same([k.feed_given_kg, k.feed_eaten_kg, k.feed_net_kg, k.fcr, k.epef, k.feed_per_bird_kg], ['100.000', '0.000', '100.000', '0.111', '4054', '0.100'],
      'Q3 (تقرير الدورة): المأكول كما هو (صفر)، والمعامل وEPEF والعلف لكلّ طير من صافي المرسل');
  });

  // ── N: صافي العلف المرسل بتعريف الورقة الواحد (جواب المالك) — عيّنات حيّة ومبيعة ومغلقة وبيّاض وبسطر بلا كتلة ─────────────────────
  await section('N', async () => {
    // حيّة: 1,000 طير، هلاكات 10 قبل ثلاثة أيّام، و300 بادئ قبل عشرة أيّام و200 ناهي قبل يومين، ووزن أمس 1,200 غم: الصافي 500 والحيّ 990، فالمعامل
    // 500 ÷ (990 × 1.2) = 0.421، وEPEF = 99 × 1,200 ÷ (10 × 20 × 0.421) = 1,411، والعلف لكلّ طير 0.500، والأسبوع الثاني 300 كغم ÷ 7,000 طير·يوم = 42.9 غم،
    // والثالث 200 ÷ 5,970 = 33.5.
    await one(U.owner, DEAD, deadParams({ flock: F.nL, on: day(-3), n: 10 }));
    // الصرف بتاريخه لا يقبل أقدم من سبعة أيّام، فصرف ما قبل عشرة أيّام يومَه.
    await db.setToday(day(-10), () => issue(F.nL, I.starter, 300, day(-10)));
    await issue(F.nL, I.finisher, 200, day(-2));
    await one(U.owner, WEIGHT, [F.nL, day(-1), 50, '1200.0', uid()]);
    // مبيعة كلّها: 100 طير، 230 كغم بادئاً، وتذكرة قبل يومين بمئة طير صافيها 240 كغم: المعامل 230 ÷ 240 = 0.958 (= الورقة).
    await issue(F.nS, I.starter, 230, day(-5));
    await sell(H.nS, day(-2), 100, '7300');
    // بسطر بلا كتلة: 100 كغم بادئاً وقطعتان من «علف بالقطعة» (بلا كتلة قطعة)، ووزن أمس: الصافي الموزون 100 ولا معامل.
    await issue(F.nU, I.starter, 100, day(-5));
    await issue(F.nU, I.piece, 2, day(-5));
    await one(U.owner, WEIGHT, [F.nU, day(-1), 50, '800.0', uid()]);
    // البيّاض: 100 كغم بادئاً قبل ثلاثة أيّام، بلا وزن ولا بيع.
    await issue(F.l, I.starter, 100, day(-3));
    // مغلقة: «قاعة صافي الإغلاق» 300 طير، 200 بادئ و30 ناهي قبل أربعة أيّام، وبيع 100 طير (240 كغم) قبل ثلاثة، وإغلاق قبل يومين بإرجاع 150 بادئاً ونقل
    // الثلاثين للوجبة التالية (تُسكَّن أمس): الصافي 230 − 180 = 50، فالمعامل 50 ÷ 240 = 0.208 (= الورقة = fcr_final)، والتالية صافيها المنقول إليها 30.
    const hallC = await hall(S.a, 'قاعة صافي الإغلاق');
    const c = await place(hallC, day(-20), 300);
    await issue(c, I.starter, 200, day(-4));
    await issue(c, I.finisher, 30, day(-4));
    await sell(hallC, day(-3), 100, '7300');
    const form = await one(U.owner, 'select public.flock_close_form($1) as v', [c]);
    const pools = form.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }));
    await one(U.owner, "select public.close_flock($1, $2, $3, $4, $5, 100, $6::jsonb, 'بيعت خارج النظام', $7::jsonb, null, $8) as v",
      [uid(), uid(), c, day(-2), form.flock.live, JSON.stringify(pools),
        JSON.stringify([{ item_id: I.starter, qty: '150', action: 'return', warehouse_id: W.feed }, { item_id: I.finisher, qty: '30', action: 'carry' }]), form.plan]);
    const next = await place(hallC, day(-1), 300);
    // بيع جزئيّ بلا وزن: 200 طير، و100 كغم بادئاً قبل خمسة أيّام، وبيع 100 طير (240 كغم) قبل يومين، ولا وزن: يبقى 100 حيّ بلا وزن.
    const hallP = await hall(S.a, 'قاعة بيع جزئيّ بلا وزن');
    const p = await place(hallP, day(-20), 200);
    await issue(p, I.starter, 100, day(-5));
    await sell(hallP, day(-2), 100, '7300');

    const sample = async (flock) => {
      const s = (await one(U.owner, DETAIL, [flock])).flock;
      const sheet = await one(U.owner, SHEET, [flock]);
      const r = await one(U.owner, REPORT, [flock]);
      return { s, sheet: sheet.summary, k: r.kpis, weeks: r.weeks };
    };
    const n = { live: await sample(F.nL), sold: await sample(F.nS), closed: await sample(c), layer: await sample(F.l), unweighed: await sample(F.nU), next: await sample(next) };
    const pick = (x) => ({ total: x.s.feed_kg_total, net: x.sheet.feed_net_kg, fcr: x.s.fcr, sheetFcr: x.sheet.fcr, kpiFcr: x.k.fcr, live: x.s.live });
    same(Object.fromEntries(Object.entries(n).map(([key, x]) => [key, pick(x)])), {
      live: { total: '500.000', net: '500.000', fcr: '0.421', sheetFcr: null, kpiFcr: '0.421', live: 990 },
      sold: { total: '230.000', net: '230.000', fcr: '0.958', sheetFcr: '0.958', kpiFcr: '0.958', live: 0 },
      closed: { total: '50.000', net: '50.000', fcr: '0.208', sheetFcr: '0.208', kpiFcr: '0.208', live: 0 },
      layer: { total: '100.000', net: '100.000', fcr: null, sheetFcr: null, kpiFcr: null, live: 1998 },
      unweighed: { total: '100.000', net: '100.000', fcr: null, sheetFcr: null, kpiFcr: null, live: 1000 },
      next: { total: '30.000', net: '30.000', fcr: null, sheetFcr: null, kpiFcr: null, live: 300 },
    }, 'N: العلف التراكميّ في الملخّص = صافي الورقة لكلّ عيّنة، ومعامل الملخّص = معامل تقرير الدورة، و= معامل الورقة حين لا يبقى حيّ (المبيعة والمغلقة)؛ وبسطر بلا كتلة لا معامل');
    // والحيّة بالأرقام: البسط صافي الورقة نفسه والمقام الحيّ × آخر وزن.
    const live = n.live;
    t.eq(live.s.fcr, (Math.round((Number(live.sheet.feed_net_kg) * 1000 * 1000) / (live.s.live * Number(live.s.last_weight.avg_g))) / 1000).toFixed(3),
      'N: معامل الحيّة = صافي الورقة × 1,000 ÷ (الحيّ × آخر وزن)');
    same([n.closed.k.fcr_final, n.closed.k.feed_net_kg], ['0.208', '50.000'], 'N: والمغلقة معاملها = fcr_final وصافيها صافي التقرير');
    // من بقي حيّاً بلا وزن لا معامل له في الملخّص ولا في تقرير الدورة (لا «الصافي ÷ المباع» وحده = 0.417)؛ والورقة بتعريفها «÷ صافي المباع» = 0.417.
    const partial = await sample(p);
    same([partial.s.live, partial.s.feed_kg_total, partial.s.fcr, partial.k.fcr, partial.sheet.feed_net_kg, partial.sheet.fcr],
      [100, '100.000', null, null, '100.000', '0.417'], 'N: بيع جزئيّ بلا وزن: لا معامل في الملخّص ولا في تقرير الدورة ما بقي حيّ بلا وزن، والورقة «÷ صافي المباع»');
    same([live.k.epef, live.k.feed_per_bird_kg, live.k.feed_eaten_kg, live.k.feed_days, n.unweighed.k.feed_per_bird_kg, n.unweighed.k.feed_net_kg],
      ['1411', '0.500', '0.000', 0, null, null], 'N: EPEF والعلف لكلّ طير من الصافي (والمأكول وأيّامه كما هي)؛ وبسطر بلا كتلة لا علف لكلّ طير');
    same(live.weeks.map((w) => [w.week, w.feed_g_per_bird_day, w.fcr]), [[1, null, null], [2, '42.9', null], [3, '33.5', '0.421']],
      'N: غرامات كلّ طير في اليوم لكلّ أسبوع من صافي المرسل فيه، ومعامل آخر يوم منه');
    // وأسبوع الإغلاق يطرح الخارج عنده: (230 − 180) كغم = 50,000 غم ÷ 1,100 طير·يوم (300 × 3 ثمّ 200 بعد بيع المئة) = 45.5، لا 230 كغم (209.1).
    same(n.closed.weeks.map((w) => [w.week, w.feed_g_per_bird_day]), [[1, null], [2, null], [3, '45.5']],
      'N: غرامات أسبوع الإغلاق من الصافي بعد الراجع والمنقول منها');
    const daily = (await one(U.owner, 'select public.halls_day($1) as v', [TODAY])).sites.flatMap((x) => x.halls);
    same([H.nL, H.nS, hallP].map((id) => daily.find((h) => h.hall_id === id)?.flock?.fcr), ['0.421', '0.958', null],
      'N: معامل التقرير اليوميّ هو نفسه (وبلا معامل للبيع الجزئيّ بلا وزن)');
  });

  // ── K: قتلة الطفرات التي كانت تعبر الحزمة ──────────────────────────────────────────────────────────────────────────
  // كلّ حالة تجري على الجسم الحقيقيّ وعلى الجسم بطفرة واحدة (داخل معاملة صاحب الجداول ترجع، كـround-once «الطفرات»): تنجح حين يعطي الحقيقيّ الصحيح
  // ولا تعطيه الطفرة.
  const SIG = {
    dead: 'public.set_flock_dead(uuid, date, integer, uuid, boolean)',
    add: 'public.add_flock_gas(uuid, date, integer, uuid, boolean)',
    day: 'public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean)',
    visit: 'public.save_flock_visit(uuid, uuid, date, timestamp with time zone, integer, integer, numeric, integer, integer, integer, text, integer, boolean, uuid, boolean)',
    rebuild: 'private.flock_day_rebuild(public.flocks, date)',
    summary: 'private.flock_summary(public.flocks)',
    overview: 'public.flocks_overview()',
  };
  await section('K', async () => {
    const LOCK = 'select public.set_period_lock($1) as v';
    const flagOf = async (oq, flock, on) => (await oq('select dead_entered from public.flock_daily where flock_id = $1 and on_date = $2', [flock, on])).rows[0]?.dead_entered ?? null;
    const markedVisit = async (oq, flock, on) => (await oq('select id from public.flock_visits where flock_id = $1 and on_date = $2 and voided_at is null and dead_entry', [flock, on])).rows[0]?.id;
    /** ما تعرضه الجولة للناهي (أكبر ما في مخزن علف واحد فعّال)، أو absent. */
    const finisherOnHand = async (attempt) => (await inside(attempt, U.owner, OVERVIEW, []))?.feed_items?.find((x) => x.item_id === I.finisher)?.on_hand ?? 'absent';
    const CASES = [
      {
        name: 'K1 dead-saved-when-lower (عدد أقلّ من المسجَّل dead_recorded لا saved)',
        fns: [[SIG.dead, [["case when d.dead + d.culled = p_dead then 'saved'", "case when d.dead + d.culled >= p_dead then 'saved'"]]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.k1, on: day(-1), n: 7 }));
          return (await inside(attempt, U.worker, DEAD, deadParams({ flock: F.k1, on: day(-1), n: 5 })))?.status;
        },
        correct: (v) => v === 'dead_recorded',
      },
      {
        name: 'K2 dead-park-lock-boundary (يوم القفل نفسه يُركن من الطابور)',
        fns: [[SIG.dead, [['p_on <= v_lock then', 'p_on < v_lock then']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, LOCK, [day(-12)]);
          return inside(attempt, U.worker, DEAD, deadParams({ flock: F.k1, on: day(-12), n: 1, queued: true }));
        },
        correct: (v) => v?.status === 'parked' && v?.reason === 'period_locked',
      },
      {
        name: 'K3 gas-park-lock-boundary (يوم القفل نفسه يُركن من الطابور)',
        fns: [[SIG.add, [['p_on <= v_lock then', 'p_on < v_lock then']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, LOCK, [day(-12)]);
          return inside(attempt, U.worker, ADD, addParams({ flock: F.k1, on: day(-12), n: 1, queued: true }));
        },
        correct: (v) => v?.status === 'parked' && v?.reason === 'period_locked',
      },
      {
        name: 'K4 dead-max-boundary (10,000,000 يعبر فحص المدى ويرفضه فحص الحيّ)',
        fns: [[SIG.dead, [['p_dead > 10000000 then', 'p_dead >= 10000000 then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.worker, DEAD, deadParams({ flock: F.k2, n: 10000000 })))?.code ?? 'saved',
        correct: (v) => v === 'live_negative',
      },
      {
        name: 'K5 gas-add-max-boundary (إضافة ألف ليوم فارغ تُحفظ)',
        fns: [[SIG.add, [['p_add < 1 or p_add > 1000 then', 'p_add < 1 or p_add >= 1000 then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.worker, ADD, addParams({ flock: F.k1, on: day(-2), n: 1000 })))?.gas?.cylinders ?? 'refused',
        correct: (v) => v === 1000,
      },
      {
        name: 'K6 visit-mark-dead-only (زيارة بمستبعد وحده تعلّم اليوم)',
        fns: [[SIG.visit, [['v_mark := not v_void and coalesce(p_dead, 0) + coalesce(p_culled, 0) > 0;', 'v_mark := not v_void and coalesce(p_dead, 0) > 0;']]]],
        run: async ({ attempt }) => (await inside(attempt, U.worker, VISIT, visitParams({ flock: F.k3, on: day(-1), culled: 2 })))?.day?.dead_entered,
        correct: (v) => v === true,
      },
      {
        name: 'K7 visit-refuse-raise-from-zero (تعديل يرفع زيارة من صفر ليوم مقفول لا يُضاف)',
        fns: [[SIG.visit, [['if v_mark and (v.id is null or v.dead + v.culled = 0)', 'if v_mark and (v.id is null)']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.k6, on: day(-2), n: 3 }));
          const visitId = uid();
          await inside(attempt, U.worker, VISIT, visitParams({ id: visitId, flock: F.k6, on: day(-2), dead: 0, note: 'زيارة' }));
          const answer = await inside(attempt, U.worker, VISIT, visitParams({ id: visitId, flock: F.k6, on: day(-2), dead: 2, note: 'زيارة', base: 1 }));
          return [answer?.code ?? answer?.status, (await oq('select dead from public.flock_daily where flock_id = $1 and on_date = $2', [F.k6, day(-2)])).rows[0]?.dead];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['dead_recorded', 3]),
      },
      {
        name: 'K7b visit-refuse-self (الزيارة المعلَّمة نفسها تُرفع من صفر: «لا هلاكات» الجولة تُصحَّح بتطبيق قديم)',
        fns: [[SIG.visit, [['and x.dead_entry and x.id <> p_visit) then', 'and x.dead_entry) then']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.k6, on: day(-3), n: 0 }));
          const own = await markedVisit(oq, F.k6, day(-3));
          const answer = await inside(attempt, U.worker, VISIT, visitParams({ id: own, flock: F.k6, on: day(-3), dead: 2, base: 1 }));
          return answer?.code ?? answer?.day?.dead;
        },
        correct: (v) => v === 2,
      },
      {
        name: 'K8 summary-kg-by-qty (علف اليوم بسطر لتر كتلته: 100 لتر × 0.92 = 92 كغم)',
        fns: [[SIG.summary, [['private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg,\n          x.posted_at as at',
          'l.qty_base as kg,\n          x.posted_at as at']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, ISSUE, [uid(), uid(), uid(), F.k4, I.oil, 100, TODAY, W.raw]);
          return (await inside(attempt, U.owner, DETAIL, [F.k4]))?.flock?.feed_today_kg;
        },
        correct: (v) => v === '92.000',
      },
      {
        name: 'K9 dead-no-safety-net (يوم بهلاكات بلا علامة لا يُضاف إليه)',
        fns: [[SIG.dead, [['(d.dead_entered or d.dead + d.culled > 0)', 'd.dead_entered']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.k1, on: day(-4), n: 3 }));
          await oq('update public.flock_daily set dead_entered = false where flock_id = $1 and on_date = $2', [F.k1, day(-4)]);
          const answer = await inside(attempt, U.worker, DEAD, deadParams({ flock: F.k1, on: day(-4), n: 5 }));
          return [answer?.status, (await oq('select dead from public.flock_daily where flock_id = $1 and on_date = $2', [F.k1, day(-4)])).rows[0]?.dead];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['dead_recorded', 3]),
      },
      {
        name: 'K10 overview-party-units (وحدة تعبئة خاصّة بمورّد لا تُعرض في الجولة)',
        fns: [[SIG.overview, [['u.archived_at is null and u.party_id is null', 'u.archived_at is null']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, "insert into public.item_units (item_id, label, factor_to_base, is_default, party_id) values ($1, 'كيس المورّد 48 كغم', 48, false, $2) returning id as v",
            [I.starter, party]);
          return (await inside(attempt, U.owner, OVERVIEW, []))?.feed_items?.find((x) => x.item_id === I.starter)?.units?.map((u) => u.name);
        },
        correct: (v) => Array.isArray(v) && v.length === 0,
      },
      {
        // المخزن الكبير يصير «مواد أوّلية» برصيده (حارس النوع مطفأ داخل المعاملة): لا يُعدّ في أعلاف الجولة.
        name: 'K13 overview-any-warehouse (رصيد علف في مخزن غير العلف لا يُعرض)',
        fns: [[SIG.overview, [["w.kind = 'feed' and w.archived_at is null", 'w.archived_at is null']]]],
        run: async ({ oq, attempt }) => {
          await oq('alter table public.warehouses disable trigger warehouses_stock_guard');
          await oq("update public.warehouses set kind = 'raw' where id = $1", [W2]);
          return finisherOnHand(attempt);
        },
        correct: (v) => v !== 'absent' && Number(v) > 0 && Number(v) < 9000,
      },
      {
        // المخزن الكبير مؤرشف برصيده (حارس الأرشفة مطفأ داخل المعاملة): لا يُعدّ.
        name: 'K14 overview-archived-store (مخزن علف مؤرشف لا يُعدّ)',
        fns: [[SIG.overview, [["w.kind = 'feed' and w.archived_at is null and ", "w.kind = 'feed' and "]]]],
        run: async ({ oq, attempt }) => {
          await oq('alter table public.warehouses disable trigger warehouses_stock_guard');
          await oq('update public.warehouses set archived_at = now() where id = $1', [W2]);
          return finisherOnHand(attempt);
        },
        correct: (v) => v !== 'absent' && Number(v) > 0 && Number(v) < 9000,
      },
      {
        // الناهي مؤرشف برصيده (حارس الأرشفة مطفأ داخل المعاملة): لا يُعرض.
        name: 'K15 overview-archived-item (علف مؤرشف لا يُعرض)',
        fns: [[SIG.overview, [["i.archived_at is null and i.kind = 'feed'", "i.kind = 'feed'"]]]],
        run: async ({ oq, attempt }) => {
          await oq('alter table public.items disable trigger items_stock_guard');
          await oq('update public.items set archived_at = now() where id = $1', [I.finisher]);
          return (await inside(attempt, U.owner, OVERVIEW, []))?.feed_items?.map((x) => x.name);
        },
        correct: (v) => Array.isArray(v) && v.includes('علف بادئ') && !v.includes('علف ناهي'),
      },
      {
        name: 'K16 rebuild-flag-from-deaths (العلامة من الزيارات المعلَّمة: «لا هلاكات اليوم» صفراً تقفل)',
        fns: [[SIG.rebuild, [['coalesce(bool_or(v.dead_entry), false) as dead_entered', 'coalesce(bool_or(v.dead + v.culled > 0), false) as dead_entered']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.k6, on: day(-6), n: 0 }));
          return flagOf(oq, F.k6, day(-6));
        },
        correct: (v) => v === true,
      },
      {
        name: 'K17 day-mark-no-carry (ملاحظة الورقة لا تفتح «لا هلاكات اليوم»)',
        fns: [[SIG.day, [['\n    else exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null\n      and x.dead_entry) end;',
          '\n    else false end;']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.k6, on: day(-4), n: 0 }));
          await inside(attempt, U.owner, DAY, dayParams({ flock: F.k6, on: day(-4), note: 'ملاحظة', base: 1 }));
          return flagOf(oq, F.k6, day(-4));
        },
        correct: (v) => v === true,
      },
      {
        name: 'K18 day-noop-ignores-mark (صفر الورقة ليوم معلَّم صفراً يفتحه)',
        fns: [[SIG.day, [['n.eggs_broken, n.note, v_mark)', 'n.eggs_broken, n.note)'], ['d.eggs_broken, d.note, d.dead_entered)', 'd.eggs_broken, d.note)']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DEAD, deadParams({ flock: F.k6, on: day(-5), n: 0 }));
          await inside(attempt, U.owner, DAY, dayParams({ flock: F.k6, on: day(-5), dead: 0, base: 1 }));
          return flagOf(oq, F.k6, day(-5));
        },
        correct: (v) => v === false,
      },
      {
        // يوم من أيّام ما قبل 0036 بزيارتين بهلاكات (كلتاهما معلَّمة بالملء): زيارة المستبعد وحده ليست «صفراً»، فتعديلها يُحفظ ولو عُلّمت الأخرى.
        name: 'K19 visit-raise-from-zero-counts-culled (زيارة بمستبعد وحده تُعدَّل بنافق ولو في اليوم زيارة معلَّمة أخرى)',
        fns: [[SIG.visit, [['if v_mark and (v.id is null or v.dead + v.culled = 0)', 'if v_mark and (v.id is null or v.dead = 0)']]]],
        run: async ({ oq, attempt }) => {
          const visitId = uid();
          await inside(attempt, U.worker, VISIT, visitParams({ id: visitId, flock: F.k6, on: day(-7), culled: 2 }));
          await oq("insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, source, dead_entry) select org_id, id, hall_id, site_id, division_id, $2, now(), 3, 'legacy', true from public.flocks where id = $1",
            [F.k6, day(-7)]);
          const answer = await inside(attempt, U.worker, VISIT, visitParams({ id: visitId, flock: F.k6, on: day(-7), dead: 1, culled: 2, base: 1 }));
          return answer?.code ?? answer?.day?.dead;
        },
        correct: (v) => v === 4,
      },
    ];
    // السلوك الحقيقيّ فحصٌ وحده (يفشل حين يُكسر الجسم نفسه، ولو ضاعت مرساة الطفرة)، ثمّ الطفرة تُثبت أنّه يمسكها (ومرساة ضائعة فشلٌ باسمها لا نجاح؛
    // مفتاحها lostAnchor بـObject.hasOwn، لأنّ "نصّ".anchor دالّة قديمة في String.prototype).
    const broken = async (c) => {
      try {
        return await mutant(db, U.owner, c.fns, (kit) => c.run(kit));
      } catch (error) {
        return { lostAnchor: error.message };
      }
    };
    for (const c of CASES) {
      const real = await mutant(db, U.owner, [], (kit) => c.run(kit));
      t.ok(c.correct(real), `${c.name}: الحقيقيّ ${JSON.stringify(real)}`);
      const wrong = await broken(c);
      t.ok(!Object.hasOwn(Object(wrong), 'lostAnchor') && !c.correct(wrong), `${c.name}: الطفرة يمسكها ${JSON.stringify(wrong)}`);
      if (process.env.REVIEW_VERBOSE) console.log(`${c.name}: built ${JSON.stringify(real)}, mutant ${JSON.stringify(wrong)}`);
    }

    // K11/K12 (حارس الفترة): كاتب يقرأ قفل الفترة بلا period_guard لا ينتظر set_period_lock في جلسة أخرى فيكتب في اليوم الذي يُقفل. جلستان حقيقيتان؛
    // جسم الطفرة يُثبَّت للسباق ويعود حرفاً بعده.
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
    const lockRace = (sql, params) => race(db, { user: U.owner, sql: LOCK, params: [day(-12)], rollback: true }, { user: U.worker, sql, params });
    const guard = [['  perform private.period_guard();\n', '']];
    const brokenRace = async (signature, run) => {
      try {
        return await committedMutation(signature, guard, run);
      } catch (error) {
        return { state: 'anchor', second: error.message };
      }
    };
    const deadReal = await lockRace(DEAD, deadParams({ flock: F.k5, on: day(-13), n: 1 }));
    t.eq(deadReal.state, 'blocked', 'K11 dead-no-period-guard: set_flock_dead ينتظر قفل فترة يُكتب في جلسة أخرى');
    const deadBroken = await brokenRace(SIG.dead, () => lockRace(DEAD, deadParams({ flock: F.k5, on: day(-14), n: 1 })));
    t.ok(deadBroken.state !== 'blocked' && deadBroken.state !== 'anchor', `K11: وبلا period_guard لا ينتظر (${deadBroken.state} ${deadBroken.second})`);
    const gasReal = await lockRace(ADD, addParams({ flock: F.k5, on: day(-13), n: 1 }));
    t.eq(gasReal.state, 'blocked', 'K12 gas-no-period-guard: add_flock_gas ينتظر قفل فترة يُكتب في جلسة أخرى');
    const gasBroken = await brokenRace(SIG.add, () => lockRace(ADD, addParams({ flock: F.k5, on: day(-14), n: 1 })));
    if (process.env.REVIEW_VERBOSE) console.log(`K11 ${deadReal.state}/${deadBroken.state} (${deadBroken.second}); K12 ${gasReal.state}/${gasBroken.state} (${gasBroken.second})`);
    t.ok(gasBroken.state !== 'blocked' && gasBroken.state !== 'anchor', `K12: وبلا period_guard لا ينتظر (${gasBroken.state} ${gasBroken.second})`);
  });

  same((await db.asService((q) => q('select check_name, violations::int as v from public.verify_round_once()'))).rows.filter((r) => r.v !== 0), [],
    'الثابت verify_round_once صفر في نهاية الملفّ');
}
