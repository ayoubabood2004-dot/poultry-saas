// بلا يوم تشغيل (0018؛ كلمة المالك 2026-11-06: «ما النا علاقة بيوم التشغيل خليها من دون يوم التشغيل»). أوّل شراء حقيقي للمالك رُفض
// no_go_live لأنّ «معمل العلف» بلا يوم تشغيل، وحقول اللحم يومها 2026-11-30. هنا، بمنشأة وحداتها بلا يوم تشغيل إلّا اللحم (بالمستقبل، كما في
// الإنتاج) والبيض (بالماضي):
// • يمرّ: الشراء بالمعمل بلا يوم تشغيل، وتحويل إلى حقل لحم يومه بالمستقبل، وصرف من المعمل، ومصروف وقبض بوحدة اللحم؛ والأرصدة الافتتاحية
//   (مخزون وجهة وصندوق) بتاريخ ماضٍ بلا يوم تشغيل وبعده؛ والمعاينات بلا مشكلة يوم تشغيل؛ وverify_stores صفر بلا فحص first_post_without_go_live.
// • يُرفض كما كان: المستقبل، والمستند العاديّ الأقدم من سبعة أيّام، والفترة المقفلة (للعاديّ والافتتاحات الثلاثة)، والمعاينة تقولها.
// • الطفرات: كلّ جسم قديم (0005 و0006 و0007 كما كان) يُعاد داخل معاملة ترجع، فيفشل فحص كلّ فرع أزيل (no_go_live وbefore_go_live وafter_go_live
//   وفحص الثوابت).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, shown, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedUse } from './return-kit.mjs';
import { openingDraft, transferDraft } from './stock-kit.mjs';

const TODAY = '2026-11-06';
const id = (n) => `b1800000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099800${String(n).padStart(2, '0')}`;
const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const RP = 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as v';

/** جسم دالّة كما كتبته هجرتها (create or replace … $$;)، للطفرة «أعِد القاعدة القديمة». */
function oldBody(file, head) {
  const text = readFileSync(path.join(MIGRATIONS, file), 'utf8');
  const start = text.indexOf(head);
  if (start < 0 || text.indexOf(head, start + 1) >= 0) throw new Error(`رأس الدالّة ليس مرّة واحدة في ${file}: ${head}`);
  return text.slice(start, text.indexOf('\n$$;', start) + 4);
}
const OLD = {
  post: oldBody('0006_parties_ledger_cash.sql', 'create or replace function private.check_post_date('),
  opening: oldBody('0006_parties_ledger_cash.sql', 'create or replace function private.check_opening_date('),
  cash: oldBody('0006_parties_ledger_cash.sql', 'create or replace function public.record_cash_opening('),
  problem: oldBody('0007_stock_core_openings_transfers.sql', 'create or replace function private.date_problem('),
  verify: oldBody('0005_scopes_stores_items.sql', 'create or replace function public.verify_stores('),
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة بلا يوم تشغيل',
    id,
    phone,
    roles: [['owner', 'owner'], ['manager', 'manager'], ['storekeeper', 'storekeeper', ['feed_mill']], ['accountant', 'accountant']],
  });
  const { users: U, divisions: D, books: B, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  // اللحم يومه بالمستقبل (كما «حقول اللحم» 2026-11-30 في الإنتاج) والبيض بالماضي؛ والمعمل والعامّة والأدوية والمفقس بلا يوم.
  await one(U.owner, 'select public.set_division_go_live($1, $2)', [D.broiler, '2026-11-30']);
  await one(U.owner, 'select public.set_division_go_live($1, $2)', [D.layer, '2026-11-01']);
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const farmSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل اللحم', 'farm') returning id", [D.broiler]);
  W.farm = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل اللحم', 'farm') returning id", [D.broiler, farmSite]);
  const item = (name, kind, unit) => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = { corn: await item('ذرة المعمل', 'raw', 'kg'), fuel: await item('كاز الحقل', 'fuel', 'L'), vitamin: await item('فيتامين الرصيد', 'medicine', 'kg') };
  const supplier = await one(U.accountant, "insert into public.parties (name, is_supplier) values ('مورّد بلا تشغيل', true) returning id");
  const customer = await one(U.accountant, "insert into public.parties (name, is_customer) values ('زبون بلا تشغيل', true) returning id");
  const box = await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق بلا تشغيل', 'cash') returning id");
  const category = await one(U.accountant, "insert into public.expense_categories (name) values ('كهرباء الحقل') returning id");
  const purchase = (user, o, options) => call(db, user, RP, [uid(), uid(), uid(), o.item, supplier, o.on ?? TODAY, o.qty ?? 10, o.price ?? 100, null, 'credit', null, o.wh ?? null], options);
  const payment = (day, options) => call(db, U.manager, 'select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', [uid(), customer, B.broiler, '1000', box, day, uid()], options);
  const partyOpening = (book, day, options) => call(db, U.manager, 'select public.record_opening_balance($1, $2, $3, $4, $5, $6)', [uid(), customer, book, '5000', day, uid()], options);
  const cashOpening = (day, options) => call(db, U.manager, 'select public.record_cash_opening($1, $2, $3, $4, $5)', [uid(), box, '100000', day, uid()], options);
  const expense = (day, options) =>
    call(db, U.accountant, 'select public.record_expense($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
      [uid(), category, D.broiler, '25000', day, 'cash', box, null, null, null, null, null, null, null, uid()], options);
  const postOpening = (doc, options) => call(db, U.manager, 'select public.post_opening_stock($1, $2, $3)', [doc.id, doc.version, uid()], options);
  const postTransfer = (doc, options) => call(db, U.manager, "select public.post_transfer($1, $2, public.preview_transfer($1) ->> 'plan', $3)", [doc.id, doc.version, uid()], options);
  const codes = async (fn, docId) => (await call(db, U.manager, `select public.${fn}($1) as v`, [docId])).value?.problems?.map((p) => p.code) ?? ['(بلا معاينة)'];

  // ── ١) الترحيل العاديّ بلا يوم تشغيل، وقبل يوم تشغيل بالمستقبل ─────────────────────────────────────────────────────
  const corn = await purchase(U.storekeeper, { item: I.corn, qty: 1000, price: 450 });
  const fuel = await purchase(U.manager, { item: I.fuel, qty: 200, price: 750 });
  const toFarm = await transferDraft(db, U.manager, W.general, W.farm, TODAY, [{ item: I.fuel, qty: 50 }]);
  const moved = await postTransfer(toFarm);
  const used = await postedUse(db, U.storekeeper, { wh: W.raw, category, on: TODAY, item: I.corn, qty: 100 }).then(() => 'ok', (error) => error.message);
  const spent = await expense(TODAY);
  const paid = await payment(TODAY);
  t.same([shown(corn), shown(fuel), shown(moved), used, shown(spent), shown(paid)], ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
    'بلا يوم تشغيل: شراء بالمعمل والعامّة، وتحويل إلى حقل لحم يومه 30/11، وصرف من المعمل، ومصروف وقبض بوحدة اللحم قبل يومها');
  const posted = (await db.admin('select kind, first_posted_at is not null as posted, go_live_on::text as go_live from public.divisions where org_id = $1 and kind = any($2) order by kind', [org, ['broiler', 'feed_mill', 'general']])).rows;
  t.same(posted, [{ kind: 'broiler', posted: true, go_live: '2026-11-30' }, { kind: 'feed_mill', posted: true, go_live: null }, { kind: 'general', posted: true, go_live: null }],
    'الوحدات مرحَّلة: المعمل والعامّة بلا يوم تشغيل، واللحم بيومه بالمستقبل (يبقى كما كتبه المدير، ولا يُقرأ)');

  // ── ٢) الأرصدة الافتتاحية بلا يوم تشغيل وبعده ────────────────────────────────────────────────────────────────
  const stockOpening = await openingDraft(db, U.manager, W.medicine, '2026-10-20', [{ item: I.vitamin, qty: 40, value: 200000 }]);
  t.same(
    [shown(await postOpening(stockOpening)), shown(await partyOpening(B.general, '2026-10-01')), shown(await partyOpening(B.layer, '2026-11-05')), shown(await cashOpening(TODAY))],
    ['ok', 'ok', 'ok', 'ok'],
    'الافتتاح: مخزون بالأدوية بلا يوم تشغيل قبل 17 يوماً، وجهة بدفتر العامّة بلا يوم، وجهة بدفتر البيض بعد يومه، وصندوق اليوم بعد أقدم يوم تشغيل',
  );

  // ── ٣) قواعد التاريخ الباقية: المستقبل والأيّام السبعة ──────────────────────────────────────────────────────────
  const futureDoc = await openingDraft(db, U.manager, W.medicine, '2026-11-07', [{ item: I.vitamin, qty: 1, value: 100 }]);
  t.same(
    [
      shown(await purchase(U.manager, { item: I.corn, on: '2026-11-07' })), shown(await purchase(U.manager, { item: I.corn, on: '2026-10-29' })),
      shown(await purchase(U.manager, { item: I.corn, on: '2026-10-30' }, { commit: false })),
      shown(await postOpening(futureDoc)), shown(await partyOpening(B.medicine, '2026-11-07')), shown(await cashOpening('2026-11-07')),
    ],
    ['date_in_future', 'date_too_old', 'ok', 'date_in_future', 'date_in_future', 'date_in_future'],
    'باقٍ: الشراء بالمستقبل وقبل ثمانية أيّام مرفوضان وقبل سبعة يمرّ، والافتتاحات الثلاثة بالمستقبل مرفوضة',
  );

  // ── ٤) المعاينات: بلا مشكلة يوم تشغيل، والقواعد الباقية تُقال ─────────────────────────────────────────────────────
  const medOpening = await openingDraft(db, U.manager, W.medicine, '2026-10-15', [{ item: I.vitamin, qty: 5, value: 1000 }]);
  const farmTransfer = await transferDraft(db, U.manager, W.general, W.farm, TODAY, [{ item: I.fuel, qty: 5 }]);
  const oldTransfer = await transferDraft(db, U.manager, W.general, W.farm, '2026-10-29', [{ item: I.fuel, qty: 5 }]);
  const previews = {
    opening: await codes('preview_opening_stock', medOpening.id),
    transfer: await codes('preview_transfer', farmTransfer.id),
    old: await codes('preview_transfer', oldTransfer.id),
    future: await codes('preview_opening_stock', futureDoc.id),
  };
  t.same(previews, { opening: [], transfer: [], old: ['date_too_old'], future: ['date_in_future'] },
    'المعاينة: افتتاح بالأدوية بلا يوم وتحويل إلى حقل يومه بالمستقبل بلا مشكلة، والأقدم من سبعة أيّام والمستقبل يُقالان');

  // ── ٥) الثوابت: verify_stores بلا فحص يوم التشغيل، وصفر مع وحدات مرحَّلة بلا يوم ─────────────────────────────────────────
  const stores = await db.asService(async (q) => (await q('select check_name, violations::int as v from public.verify_stores()')).rows);
  t.same([stores.some((row) => row.check_name === 'first_post_without_go_live'), stores.filter((row) => row.v !== 0)], [false, []],
    'verify_stores: لا فحص first_post_without_go_live، والباقي صفر والمعمل والعامّة مرحَّلتان بلا يوم تشغيل');

  // ── ٦) الطفرات: كلّ قاعدة قديمة تُعاد داخل معاملة ترجع فيفشل فحص فرعها ───────────────────────────────────────────────
  const inTx = (user, sql, params) => async (q) => (await q(sql, params)).rows[0]?.v ?? 'ok';
  const purchaseSql = (wh, item, day = TODAY) => [RP, [uid(), uid(), uid(), item, supplier, day, 10, 100, null, 'credit', null, wh]];
  const CASES = [
    { name: 'check_post_date: no_go_live (المعمل بلا يوم)', old: OLD.post, user: U.manager, run: inTx(U.manager, ...purchaseSql(W.raw, I.corn)), code: 'no_go_live' },
    { name: 'check_post_date: before_go_live (اللحم يومه بالمستقبل)', old: OLD.post, user: U.manager,
      run: inTx(U.manager, 'select public.record_party_payment($1, $2, $3, $4, $5, $6, $7) as v', [uid(), customer, B.broiler, '1000', box, TODAY, uid()]), code: 'before_go_live' },
    { name: 'check_opening_date: no_go_live (دفتر العامّة بلا يوم)', old: OLD.opening, user: U.manager,
      run: inTx(U.manager, 'select public.record_opening_balance($1, $2, $3, $4, $5, $6) as v', [uid(), supplier, B.general, '5000', '2026-10-01', uid()]), code: 'no_go_live' },
    { name: 'check_opening_date: after_go_live (دفتر البيض بعد يومه)', old: OLD.opening, user: U.manager,
      run: inTx(U.manager, 'select public.record_opening_balance($1, $2, $3, $4, $5, $6) as v', [uid(), supplier, B.layer, '5000', '2026-11-05', uid()]), code: 'after_go_live' },
    { name: 'record_cash_opening: after_go_live (بعد أقدم يوم تشغيل)', old: OLD.cash, user: U.manager,
      run: async (q) => {
        const other = (await q("insert into public.cash_accounts (name, kind) values ('صندوق الطفرة', 'cash') returning id")).rows[0].id;
        return (await q('select public.record_cash_opening($1, $2, $3, $4, $5) as v', [uid(), other, '1000', TODAY, uid()])).rows[0].v;
      },
      code: 'after_go_live' },
    { name: 'date_problem: no_go_live بمعاينة الافتتاح', old: OLD.problem, user: U.manager,
      run: async (q) => (await q('select public.preview_opening_stock($1) as v', [medOpening.id])).rows[0].v.problems.map((p) => p.code), problem: 'no_go_live' },
    { name: 'date_problem: before_go_live بمعاينة التحويل', old: OLD.problem, user: U.manager,
      run: async (q) => (await q('select public.preview_transfer($1) as v', [farmTransfer.id])).rows[0].v.problems.map((p) => p.code), problem: 'before_go_live' },
  ];
  const outcomes = [];
  for (const c of CASES) {
    const real = await mutant(db, U.manager, [], async ({ attempt }) => attempt(c.user, c.run));
    const broken = await mutant(db, U.manager, [], async ({ oq, attempt }) => {
      await oq(c.old);
      return attempt(c.user, c.run);
    });
    const fine = (o) => (c.problem ? o.ok && !o.value.includes(c.problem) : o.ok);
    const caught = c.problem ? broken.ok && broken.value.includes(c.problem) : !broken.ok && broken.code === c.code;
    outcomes.push({ name: c.name, real: fine(real), caught, detail: `${real.ok ? 'ok' : real.code} / ${broken.ok ? JSON.stringify(broken.value) : broken.code}` });
  }
  const verifyOld = await mutant(db, U.manager, [], async ({ oq }) => {
    await oq(OLD.verify);
    return (await oq("select violations::int as v from public.verify_stores() where check_name = 'first_post_without_go_live'")).rows[0]?.v ?? null;
  });
  outcomes.push({ name: 'verify_stores: first_post_without_go_live', real: !stores.some((row) => row.check_name === 'first_post_without_go_live'), caught: verifyOld >= 2, detail: `القديم يعدّ ${verifyOld}` });
  t.same(outcomes.filter((o) => !o.real).map((o) => `${o.name}: ${o.detail}`), [], `الطفرات (${outcomes.length}): كلّ حالة تمرّ بالقاعدة الجديدة`);
  t.same(outcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${o.detail}`), [], `الطفرات: ${outcomes.filter((o) => o.caught).length} من ${outcomes.length} — كلّ قاعدة قديمة أُعيدت يفشل فحصها`);

  // ── ٧) الفترة المقفلة باقية للعاديّ وللافتتاحات الثلاثة (آخر الملف: القفل يثبت) ───────────────────────────────────────────
  await one(U.manager, 'select public.set_period_lock($1)', ['2026-10-31']);
  const lockedDoc = await openingDraft(db, U.manager, W.medicine, '2026-10-15', [{ item: I.vitamin, qty: 1, value: 100 }]).catch((error) => ({ error: error.message }));
  t.same(
    [shown(await purchase(U.manager, { item: I.corn, on: '2026-10-30' })), lockedDoc.error ?? shown(await postOpening(lockedDoc)), shown(await partyOpening(B.medicine, '2026-10-20')), shown(await cashOpening('2026-10-20'))],
    ['period_locked', 'period_locked', 'period_locked', 'period_locked'],
    'باقٍ: الفترة المقفلة ترفض الشراء والافتتاحات الثلاثة (مخزون وجهة وصندوق)',
  );
}
