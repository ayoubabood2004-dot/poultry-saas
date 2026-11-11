// مراجعة 0020/0021 (المنسّق 2026-11-08، كلّ ملاحظة مُعادة على embedded PG عند f066d09): كلّ حالة هنا تفشل على الشفرة قبل إصلاحها.
// M1 الإرجاع للمورّد من شراء بلا سعر ثمّ «أكمل السعر» يحمّل المورّد ثمن المُرجَع: الترحيل والمعاينة يرفضان سطراً بلا سعر (unpriced_line)، والتسعير
//    يرفض شراءً أُرجع منه قبل سعره (returned_before_pricing، دفاعيّ)، وverify_purchases يمسك سطراً بلا سعر بمرتجع مرحَّل (unpriced_returns).
// L1 receipt_purchase_entry يجد قيد التسعير للشراء المسعَّر لاحقاً، فالتصحيح يتوزّع على فاتورته أوّلاً (E16).
// L2 «أكمل السعر» (can_price) بنطاق مخازن العائلة كما يفرضه revalue_plan، وتلميح التسعير بكلماته لا «التصحيح».
// L3 شراء يسابق حذف المادّة: item_not_found بعد قفل المواد لا 23503 خام.
// L4 بيع نقديّ رُدّ مقبوضه يُعدّ بالدين (المجاميع وpaid_now).
// L5 وحدة بلا دفتر رئيسيّ: no_sales_book بتلميح يسمّي الوحدة (لا تلميح البيض والأفراخ).
// الشاشة: غموض مخزن المصدر في التحويل from_store_required، وstore_required للمستلم وحده.
import { balance, call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { lotsOf, postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-08';
const id = (n) => `b1950000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099950${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const RP = 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as v';
const PP = 'select public.price_purchase($1, $2, $3, $4) as v';
const RC = 'select public.record_conversion($1, $2, $3, $4, $5, $6, $7, $8, $9) as v';
const RT = 'select public.record_transfer($1, $2, $3, $4, $5, $6, $7, $8) as v';
const RS = 'select public.record_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as v';
const RETURN_CHECK = '  -- مرتجع من شراء بلا سعر (مراجعة 0020 M1)';

const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};
const shownOf = (result) => (result.ok ? 'ok' : result.code);

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة مراجعة العمليات',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill', 'general']],
      ['accountant', 'accountant'],
      ['keeperGeneral', 'storekeeper', ['general']],
    ],
  });
  const { users: U, divisions: D, books: B, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const millSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.raw])).rows[0].site_id;
  const store = (division, siteId, name, kind) => one(U.owner, 'insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, $3, $4) returning id', [D[division], siteId, name, kind]);
  W.raw2 = await store('feed_mill', millSite, 'مخزن مواد ثانٍ', 'raw');
  W.feed2 = await store('feed_mill', millSite, 'مخزن علف ثانٍ', 'feed');
  const farmSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الأمل', 'farm') returning id", [D.broiler]);
  W.farm = await store('broiler', farmSite, 'مخزن حقل الأمل', 'farm');
  const item = (name, kind, unit) => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = {
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    mash: await item('مخلوط', 'feed', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    oats: await item('شوفان', 'raw', 'kg'),
    barley: await item('شعير', 'raw', 'kg'),
    grits: await item('جريش', 'raw', 'kg'),
    farmFuel: await item('كاز الحقل', 'fuel', 'L'),
    diesel: await item('كاز', 'fuel', 'L'),
    racer: await item('مادّة السباق', 'raw', 'kg'),
  };
  await postedOpening(db, U.owner, W.raw, day(-5), [{ item: I.corn, qty: 1000, value: '450000.00' }]);
  await postedOpening(db, U.owner, W.general, day(-5), [{ item: I.diesel, qty: 200, value: '160000.00' }]);
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");
  const buy = (user, o) => call(db, user, RP, [uid(), o.receipt ?? uid(), o.line ?? uid(), o.item, o.party ?? supplier, o.on ?? TODAY, o.qty, o.price ?? null, null, 'credit', null, o.wh ?? null]);
  const outcomes = {};

  // ── M1: لا إرجاع للمورّد من شراء بلا سعر ─────────────────────────────────────────────────────────────────────────
  const soy = { receipt: uid(), line: uid() };
  await buy(U.owner, { ...soy, item: I.soy, qty: 1000, wh: W.raw });
  const returnDraft = async (q, receipt, receiptLine, qty) => {
    const doc = (await q('insert into public.supplier_returns (receipt_id, returned_on) values ($1, $2) returning id', [receipt, TODAY])).rows[0].id;
    const line = (await q('insert into public.supplier_return_lines (doc_id, receipt_line_id, qty_base) values ($1, $2, $3) returning id', [doc, receiptLine, qty])).rows[0].id;
    await q('insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, 0)', [line]);
    return doc;
  };
  const doc = await db.asUser(U.owner, (q) => returnDraft(q, soy.receipt, soy.line, 400), { commit: true });
  const preview = (await call(db, U.owner, 'select public.preview_supplier_return($1) as v', [doc], { commit: false })).value;
  const posted = await call(db, U.owner, "select public.post_supplier_return($1, $2, public.preview_supplier_return($1) ->> 'plan', $3) as v", [doc, preview.version, uid()]);
  outcomes.M1 = { preview_line_problem: preview.lines[0].problem?.code ?? null, preview_ready: preview.ready, post: shownOf(posted), post_hint: posted.hint ?? null };
  t.same([preview.lines[0].problem?.code ?? null, preview.ready, shownOf(posted)], ['unpriced_line', false, 'unpriced_line'],
    `M1: معاينة المرتجع وترحيله يرفضان سطراً بلا سعر (${posted.hint ?? ''})`);
  t.ok(posted.hint?.includes('أكمل سعر الشراء أوّلاً'), `M1: التلميح يدلّ على «أكمل السعر» أوّلاً (${posted.hint})`);
  // دفاعيّ: لو رُحّل مرتجع من سطر بلا سعر (الفحص مشال في معاملة ترجع)، فالتسعير يرفضه، وverify_purchases يمسكه.
  const defensive = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
    const def = (await oq("select pg_get_functiondef('public.post_supplier_return(uuid, integer, text, uuid)'::regprocedure) as d")).rows[0].d;
    const start = def.indexOf(RETURN_CHECK);
    if (start < 0) throw new Error('فحص الترحيل غير موجود');
    const end = def.indexOf('  end loop;\n', start) + '  end loop;\n'.length;
    await oq(def.slice(0, start) + def.slice(end));
    const post = await attempt(U.owner, async (q) => (await q("select public.post_supplier_return($1, $2, public.preview_supplier_return($1) ->> 'plan', $3) as v", [doc, preview.version, uid()])).rows[0].v);
    const verify = (await oq("select violations::int as v from public.verify_purchases() where check_name = 'unpriced_returns'")).rows[0]?.v ?? null;
    const price = await attempt(U.owner, async (q) => (await q(PP, [uid(), soy.line, 500, null])).rows[0].v);
    return { post: shownOf(post), verify, price: shownOf(price), hint: price.hint ?? null };
  }).catch((error) => ({ error: error.message }));
  outcomes.M1_defensive = defensive;
  t.same([defensive.post, defensive.verify, defensive.price], ['ok', 1, 'returned_before_pricing'],
    `M1: مرتجع رُحّل من سطر بلا سعر (بلا فحص الترحيل): verify_purchases.unpriced_returns = 1، والتسعير returned_before_pricing (${JSON.stringify(defensive)})`);
  const pricedThenReturned = await call(db, U.owner, PP, [uid(), soy.line, 500, null]);
  t.eq(shownOf(pricedThenReturned), 'ok', 'M1: بلا مرتجع يُسعَّر الشراء');
  const afterPricing = await db.asUser(U.owner, (q) => returnDraft(q, soy.receipt, soy.line, 100), { commit: true });
  const postedAfter = await call(db, U.owner, "select public.post_supplier_return($1, (select version from public.supplier_returns where id = $1), public.preview_supplier_return($1) ->> 'plan', $2) as v", [afterPricing, uid()]);
  t.eq(shownOf(postedAfter), 'ok', `M1: بعد «أكمل السعر» يُرجَع للمورّد كالمعتاد (${postedAfter.hint ?? ''})`);

  // ── L1: التصحيح بعد التسعير يتوزّع على قيد التسعير أوّلاً ───────────────────────────────────────────────────────────
  const party2 = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد الشعير', true) returning id");
  await buy(U.owner, { item: I.oats, qty: 100, price: 300, party: party2, wh: W.raw, on: day(-1) });
  const barley = { receipt: uid(), line: uid() };
  await buy(U.owner, { ...barley, item: I.barley, qty: 200, party: party2, wh: W.raw });
  await one(U.owner, RC, [uid(), uid(), I.barley, 50, I.grits, 50, TODAY, null, null]);
  await one(U.storekeeper, PP, [uid(), barley.line, 400, null]);
  const corrected = await one(U.manager, "select public.post_receipt_revalue($1, 70000, public.preview_receipt_revalue($1, 70000) ->> 'plan', 'فاتورة معدّلة', $2) as v", [barley.line, uid()]);
  const allocation = (await db.admin(`select a.credit_entry_id = v.party_entry_id as to_pricing
    from public.party_allocations a
    join public.receipt_revaluations c on c.id = $1
    join public.receipt_revaluations v on v.receipt_line_id = c.receipt_line_id and v.unit_price is not null and v.status = 'posted'
    where a.debit_entry_id = c.party_entry_id and a.reverses_allocation_id is null`, [corrected.id])).rows;
  outcomes.L1 = allocation;
  t.same(allocation, [{ to_pricing: true }], 'L1: تصحيح شراء سُعِّر لاحقاً يتوزّع على قيد تسعيره أوّلاً (لا على أقدم شراء للمورّد)');
  t.eq(await balance(db, party2, B.feed_mill), '-100000', 'L1: رصيد المورّد = 30,000 + 70,000');

  // ── L2: «أكمل السعر» بنطاق مخازن العائلة ──────────────────────────────────────────────────────────────────────
  const fuel = { line: uid() };
  await buy(U.owner, { ...fuel, item: I.farmFuel, qty: 100, wh: W.general });
  await one(U.owner, RT, [uid(), uid(), uid(), I.farmFuel, 30, W.general, W.farm, TODAY]);
  const keeperFile = (await call(db, U.keeperGeneral, 'select public.item_file($1) as v', [I.farmFuel], { commit: false })).value;
  const keeperPrice = await call(db, U.keeperGeneral, PP, [uid(), fuel.line, 900, null]);
  outcomes.L2 = { row_can_price: keeperFile.purchases[0].can_price, file_can_price: keeperFile.can_price, price: shownOf(keeperPrice), hint: keeperPrice.hint };
  t.same([keeperFile.purchases[0].can_price, keeperFile.can_price, shownOf(keeperPrice)], [false, false, 'out_of_scope'],
    'L2: أمين العامّة وجزء من الشراء في مخزن الحقل: لا «أكمل السعر» في الملفّ، والتسعير out_of_scope');
  t.ok(!keeperPrice.hint.includes('التصحيح') && keeperPrice.hint.includes('«مخزن حقل الأمل»') && keeperPrice.hint.includes('سعر'), `L2: تلميح التسعير بكلماته (${keeperPrice.hint})`);
  t.eq((await call(db, U.storekeeper, 'select public.item_file($1) as v', [I.soy], { commit: false })).value.purchases.length > 0, true, 'L2: الملفّ يقرأ للأمين');

  // ── L3: شراء يسابق حذف المادّة ───────────────────────────────────────────────────────────────────────────────
  const raceRun = async () => {
    const s1 = await db.session(U.manager);
    const s2 = await db.session(U.owner);
    try {
      const a1 = await s1.run('select public.delete_item($1, 1) as v', [I.racer]);
      const p2 = s2.run(RP, [uid(), uid(), uid(), I.racer, supplier, TODAY, 10, 100, null, 'credit', null, W.raw]);
      const st2 = await db.settle(p2, s2.pid);
      await s1.commit();
      const a2 = await p2;
      return { a1: a1.ok, st2, a2: a2.ok ? 'ok' : a2.error };
    } finally {
      await s1.rollback();
      await s2.rollback();
    }
  };
  const race = await raceRun();
  outcomes.L3 = race;
  t.same([race.a1, race.st2, race.a2], [true, 'blocked', 'item_not_found'], `L3: شراء ينتظر حذف المادّة ثمّ item_not_found لا 23503 (${race.a2})`);

  // ── L4: بيع نقديّ رُدّ مقبوضه يُعدّ بالدين ────────────────────────────────────────────────────────────────────────
  const customer = await one(U.owner, "insert into public.parties (name, is_customer) values ('أبو أحمد', true) returning id");
  const box = await one(U.owner, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
  const sale = await one(U.owner, RS, [uid(), uid(), uid(), customer, I.diesel, 10, 1000, TODAY, 'cash', box, null]);
  const before = (await call(db, U.owner, 'select public.sale_detail($1) as v', [sale.id], { commit: false })).value;
  await one(U.manager, 'select public.void_party_payment($1, $2, $3) as v', [before.payment_entry_id, 'ردّ المبلغ', uid()]);
  const detail = (await call(db, U.owner, 'select public.sale_detail($1) as v', [sale.id], { commit: false })).value;
  const overview = (await call(db, U.owner, 'select public.sales_overview($1, $2) as v', [day(-1), TODAY], { commit: false })).value;
  outcomes.L4 = { payment: detail.payment, paid_now: detail.money.paid_now, refunded: detail.payment_refunded ?? null, cash: overview.totals.money.cash, credit: overview.totals.money.credit, row_payment: overview.rows[0].payment };
  t.same([detail.payment, norm(detail.money.paid_now), detail.payment_refunded, norm(overview.totals.money.cash), norm(overview.totals.money.credit), overview.rows[0].payment],
    ['credit', '0', true, '0', '10000', 'credit'], 'L4: بيع نقديّ رُدّ مقبوضه: بالدين في التفصيل والمبيعات، ولا مقبوض');

  // ── L5: وحدة بلا دفتر رئيسيّ ────────────────────────────────────────────────────────────────────────────────
  const noBook = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
    // دفتر الوحدة العامّة يصير دفتر أفراخ (مثل وحدة المفقس بلا دفتر رئيسيّ) في معاملة ترجع.
    await oq('alter table public.ledger_books disable trigger ledger_books_code');
    await oq("update public.ledger_books set code = 'chicks' where org_id = $1 and division_id = $2 and code = 'main'", [org, D.general]);
    return attempt(U.owner, async (q) => (await q(RS, [uid(), uid(), uid(), customer, I.diesel, 1, 1000, TODAY, 'credit', null, null])).rows[0].v);
  });
  outcomes.L5 = { code: noBook.code, hint: noBook.hint };
  t.same([noBook.code, noBook.hint?.includes('«المخازن العامة»'), noBook.hint?.includes('البيض')], ['no_sales_book', true, false], `L5: no_sales_book يسمّي الوحدة (${noBook.hint})`);

  // ── الشاشة: غموض مخزن المصدر from_store_required، والمستلم store_required ──────────────────────────────────────────────
  await one(U.owner, RT, [uid(), uid(), uid(), I.corn, 100, W.raw, W.raw2, TODAY]);
  const fromAmbiguous = await call(db, U.owner, RC, [uid(), uid(), I.corn, 10, I.mash, 10, TODAY, null, W.feed]);
  const toAmbiguous = await call(db, U.owner, RC, [uid(), uid(), I.corn, 10, I.mash, 10, TODAY, W.raw, null]);
  outcomes.conversion = { from: [fromAmbiguous.code, fromAmbiguous.hint], to: [toAmbiguous.code, toAmbiguous.hint] };
  t.same([fromAmbiguous.code, toAmbiguous.code], ['from_store_required', 'store_required'], 'التحويل: مخزن المصدر غامض from_store_required، والمستلم غامض store_required');
  t.ok(fromAmbiguous.hint.includes('«مخزن المواد الأوّلية» (900 كغم)') && fromAmbiguous.hint.includes('«مخزن مواد ثانٍ» (100 كغم)'), `from_store_required يسمّي المخزنين بكمياتهما (${fromAmbiguous.hint})`);
  t.ok(toAmbiguous.hint.includes('«رصيد العلف»') && toAmbiguous.hint.includes('«مخزن علف ثانٍ»'), `store_required يسمّي مخزني الاستلام (${toAmbiguous.hint})`);
  t.same((await lotsOf(db, I.mash, W.feed)).length, 0, 'لا تحويل مع الرفضين');

  const verify = await db.asService(async (q) => (await q("select check_name, violations::int as v from public.verify_purchases() union all select check_name, violations::int from public.verify_sales() union all select check_name, violations::int from public.verify_stock()")).rows.filter((r) => r.v !== 0));
  t.same(verify, [], 'الثوابت صفر');
  if (process.env.STORE_OPS_FIXES_OUT) (await import('node:fs')).writeFileSync(process.env.STORE_OPS_FIXES_OUT, `${JSON.stringify(outcomes, null, 2)}\n`);
}
