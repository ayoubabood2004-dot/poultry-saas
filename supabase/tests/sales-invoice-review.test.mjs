// مراجعة 0033 العدائية (جهة القاعدة؛ مراجعان أثبتا كلّ ملاحظة على الشفرة الحقيقية): كلّ إصلاح بفحص يفشل على الهجرة قبله.
// A1 «المتبقّي» (open) لكلّ صفّ في المبيعات ومجموعه، بعد تحصيل لاحق لا تنقصه السيقان؛ A2 حجم الوحدة (factor) إلزاميّ لسطر بوحدة بيع؛ A3 الملغاة بلا
// دين، وpayment_refunded = كلّ السيقان مردودة (معنى 0021)؛ A4 تفصيل قيد الفاتورة بالمدفوع الآن (sale_paid) لا عند البيع؛ A5 verify_sales يمسك تواريخ
// الإلغاء (يوم واحد ≥ يوم البيع)؛ A6 ويمسك رقم المستند على قيود الفاتورة؛ A7 المبالغ «1000.00» تُخزَّن وتُرجع «1000»؛ B2 لا قفل على صفوف الوحدات
// (فلا 40P01 مع تبديل الوحدة الافتراضية)؛ B3 الزبون النقديّ يُقفل لكلّ (جهة، دفتر) فلا تنتظر فاتورة نقديّة من مخزن الأدوية فاتورةً من مخزن العلف؛
// B4 حساب الزبون النقديّ لا يُختار في غير البيع (الشراء والمسوّدة والتحميل والوحدة والجهة والقبض والدفع والافتتاح والتسوية والإعفاء والمصروف)؛
// B6 معرّف سطر أو ساق في فاتورتين متزامنتين id_conflict لا خطأ فهرس خام؛ V1 can_void من فحوص void_sale نفسها وبترتيبها؛ V2 مفتاح القفل الاستشاريّ
// يحمل المنشأة؛ V3 ساق المرآة (البيع القديم والملء) بلا صفّ تدقيق، فلا يبقى بعد التراجع صفّ سيقان ظاهر خارج النطاق (وطريق رفض التراجع في seed.mjs).
import { balance, call, makeOrg, uid } from './ledger-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-17';
const id = (n) => `d3334000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477033340${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const V2 = 'select public.record_sale_v2($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9) as v';
const RS = 'select public.record_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as v';
const VS = 'select public.void_sale($1, $2, $3) as v';
const DT = 'select public.sale_detail($1) as v';
const OV = 'select public.sales_overview($1, $2) as v';
const NEW_HINT = 'اختر جهة باسمها';

const shownOf = (result) => (result.ok ? 'ok' : result.code);

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة مراجعة الفاتورة',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill', 'general', 'medicine']],
      ['accountant', 'accountant'],
      ['managerRaw', 'manager'],
      ['viewer', 'viewer'],
    ],
  });
  const { users: U, members: MB, books: B, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  // مدير بنطاق مخزن الموادّ وحده: يقرأ فواتيره، ودفتر وحدته خارج نطاقه (book_for_post).
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[]) as v", [MB.managerRaw, W.raw]);
  const item = (name, kind, unit) => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = { starter: await item('علف بادئ', 'feed', 'kg'), diesel: await item('كاز', 'fuel', 'L'), vaccine: await item('لقاح نيوكاسل', 'vaccine', 'pc'), corn: await item('ذرة صفراء', 'raw', 'kg') };
  const unitRow = (label, factor) => one(U.owner, 'insert into public.item_units (item_id, label, factor_to_base, for_sale) values ($1, $2, $3, true) returning id', [I.starter, label, factor]);
  const u50 = await unitRow('كيس 50 كغم', 50);
  const u25 = await unitRow('كيس 25 كغم', 25);
  // الافتراضية القديمة أصغر المعرّفين والجديدة أكبرهما: قفل المشاركة بترتيب المعرّف يأخذ القديمة أوّلاً، والتبديل يقفل الجديدة ثمّ القديمة.
  const [UA, UB] = [u50, u25].sort();
  const FACTOR = { [u50]: 50, [u25]: 25 };
  await one(U.owner, 'update public.item_units set is_default = true where id = $1 returning id', [UA]);
  await postedOpening(db, U.owner, W.feed, day(-5), [{ item: I.starter, qty: 2000, value: '1200000.00' }]);
  await postedOpening(db, U.owner, W.general, day(-5), [{ item: I.diesel, qty: 1000, value: '800000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-5), [{ item: I.vaccine, qty: 500, value: '250000.00' }]);
  await postedOpening(db, U.owner, W.raw, day(-5), [{ item: I.corn, qty: 500, value: '225000.00' }]);
  const party = (name, supplier = false) =>
    one(U.owner, 'insert into public.parties (name, is_customer, is_supplier) values ($1, $2, $3) returning id', [name, !supplier, supplier]);
  const P = { ahmad: await party('أبو أحمد'), farm: await party('مزرعة النور'), nour: await party('نور'), karim: await party('كريم'), supplier: await party('مورّد العلف', true) };
  const box = (name, kind) => one(U.owner, 'insert into public.cash_accounts (name, kind) values ($1, $2) returning id', [name, kind]);
  const BX = { cash: await box('الصندوق', 'cash'), bank: await box('المصرف', 'bank'), wallet: await box('المحفظة', 'wallet') };

  const line = (itemId, qty, price, o = {}) => ({ line_id: o.id ?? uid(), item_id: itemId, unit_id: o.unit ?? null, qty: String(qty), unit_price: String(price),
    discount: String(o.discount ?? 0), ...(o.factor !== undefined ? { factor: String(o.factor) } : {}) });
  const leg = (boxId, amount, legId = uid()) => ({ leg_id: legId, cash_account_id: boxId, amount: String(amount) });
  const args = (o) => [o.ref ?? uid(), o.sale ?? uid(), o.wh ?? W.general, o.party === undefined ? P.ahmad : o.party, o.on ?? TODAY,
    JSON.stringify(o.lines), o.discount ?? 0, JSON.stringify(o.payments ?? []), o.note ?? null];
  const sell = (user, o, options) => call(db, user, V2, args(o), options);
  const sold = async (user, o) => {
    const result = await sell(user, o);
    if (!result.ok) throw new Error(`record_sale_v2: ${result.code} ${result.hint}`);
    return result.value;
  };
  const read = async (user, sql, params) => (await call(db, user, sql, params, { commit: false })).value;
  const walkInId = async () => (await db.admin("select id from public.parties where org_id = $1 and system_kind = 'walk_in'", [org])).rows[0]?.id ?? null;
  const invoice = async (sale) => (await db.admin('select * from public.sales_invoices where id = $1', [sale])).rows[0];
  const verifyMap = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_sales()')).rows.map((r) => [r.check_name, r.v]));

  // الزبون النقديّ يُنشأ بأوّل فاتورة نقديّة.
  const W0 = { sale: uid(), party: null, lines: [line(I.diesel, 1, '1000')], payments: [leg(BX.cash, 1000)] };
  await sold(U.owner, W0);
  const wid = await walkInId();

  // ── A2: حجم الوحدة إلزاميّ لسطر بوحدة بيع (unit_changed كان لا يعمل إلّا حين حضر) ─────────────────────────────────────────
  const a2 = {
    missing: await sell(U.owner, { party: P.ahmad, wh: W.feed, lines: [line(I.starter, 1, '35000', { unit: u50 })] }, { commit: false }),
    wrong: await sell(U.owner, { party: P.ahmad, wh: W.feed, lines: [line(I.starter, 1, '35000', { unit: u50, factor: 45 })] }, { commit: false }),
    base: shownOf(await sell(U.owner, { party: P.ahmad, wh: W.feed, lines: [line(I.starter, 1, '700')] }, { commit: false })),
    right: shownOf(await sell(U.owner, { party: P.ahmad, wh: W.feed, lines: [line(I.starter, 1, '35000', { unit: u50, factor: 50 })] }, { commit: false })),
  };
  t.same([shownOf(a2.missing), a2.missing.hint?.includes('علف بادئ') && a2.missing.hint?.includes('كيس 50 كغم'), shownOf(a2.wrong), a2.base, a2.right],
    ['factor_required', true, 'unit_changed', 'ok', 'ok'],
    `A2 factor_required: سطر بوحدة بيع بلا حجمها يُرفض بتلميح يسمّي المادّة والوحدة، والحجم المخالف unit_changed، ووحدة الأساس بلا حجم تمرّ (${a2.missing.code ?? 'ok'} ${a2.missing.hint ?? ''})`);

  // ── A7: المبالغ «1000.00» تُطبَّع قبل الحساب والتخزين ───────────────────────────────────────────────────────────────
  const N = { sale: uid(), party: P.farm, lines: [line(I.diesel, '10', '1000.00', { discount: '500.00' })], discount: '500.00', payments: [leg(BX.cash, '1000.00'), leg(BX.bank, '2000.00')] };
  const soldN = await sold(U.owner, N);
  const headN = (await db.admin(`select total::text, paid::text, discount_total::text, invoice_discount::text from public.sales_invoices where id = $1`, [N.sale])).rows[0];
  const lineN = (await db.admin('select line_discount::text as d, invoice_discount_share::text as s, line_total::text as n from public.sales_lines where sale_id = $1', [N.sale])).rows[0];
  const entriesN = (await db.admin("select amount::text as a from public.party_entries where doc_kind = 'sale' and doc_id = $1 order by seq", [N.sale])).rows.map((r) => r.a);
  const movesN = (await db.admin("select amount::text as a from public.cash_moves where doc_kind = 'sale' and doc_id = $1 order by seq, account_id", [N.sale])).rows.map((r) => r.a).sort();
  const legsN = (await db.admin('select amount::text as a from public.sales_payments where sale_id = $1 order by leg_no', [N.sale])).rows.map((r) => r.a);
  t.same([[soldN.total, soldN.paid, soldN.debt, soldN.discount_total, soldN.lines[0].line_total], headN, lineN, entriesN, movesN, legsN],
    [['9000', '3000', '6000', '1000', '9000'], { total: '9000', paid: '3000', discount_total: '1000', invoice_discount: '500' }, { d: '500', s: '500', n: '9000' },
      ['9000', '-1000', '-2000'], ['1000', '2000'], ['1000', '2000']],
    'A7 المبالغ بأصفار («1000.00» و«500.00») تُخزَّن وتُرجع بالدينار الصحيح: الجواب والرأس والسطر والقيود وحركات الصناديق والسيقان');

  // ── A1: المتبقّي من قيد الفاتورة بعد تحصيل لاحق ───────────────────────────────────────────────────────────────────────
  const X = { sale: uid(), party: P.nour, lines: [line(I.diesel, 10, '1000')], payments: [leg(BX.cash, 3000)] };
  await sold(U.owner, X);
  const bookX = (await invoice(X.sale)).book_id;
  await one(U.manager, 'select public.record_party_payment($1, $2, $3, 4000, $4, $5, $6) as v', [uid(), P.nour, bookX, BX.cash, TODAY, uid()]);
  const detailX = await read(U.owner, DT, [X.sale]);

  // ── A3: الملغاة بلا دين، وpayment_refunded = كلّ السيقان مردودة ─────────────────────────────────────────────────────────
  const Y = { sale: uid(), party: P.ahmad, lines: [line(I.diesel, 10, '1000')], payments: [leg(BX.cash, 3000)] };
  await sold(U.owner, Y);
  await one(U.manager, VS, [Y.sale, 'فاتورة خاطئة', uid()]);
  const Wv = { sale: uid(), party: null, on: day(-2), lines: [line(I.diesel, 10, '1000')], payments: [leg(BX.cash, 6000), leg(BX.wallet, 4000)] };
  await sold(U.owner, Wv);
  await one(U.owner, VS, [Wv.sale, 'فاتورة خاطئة', uid()]);
  const C0 = { sale: uid(), party: P.ahmad, lines: [line(I.diesel, 1, '1000')] };
  await sold(U.owner, C0);
  const Z = { sale: uid(), party: P.karim, lines: [line(I.diesel, 3, '1000')], payments: [leg(BX.cash, 1000), leg(BX.bank, 2000)] };
  await sold(U.owner, Z);
  const legZ = async (n) => (await db.admin('select payment_entry_id from public.sales_payments where sale_id = $1 and leg_no = $2', [Z.sale, n])).rows[0].payment_entry_id;
  await one(U.manager, 'select public.void_party_payment($1, $2, $3) as v', [await legZ(2), 'حوالة لم تصل', uid()]);
  const detailY = await read(U.owner, DT, [Y.sale]);
  const detailW = await read(U.owner, DT, [Wv.sale]);
  const detailZ = await read(U.owner, DT, [Z.sale]);
  const detailC0 = await read(U.owner, DT, [C0.sale]);
  const entryOf = async (entry) => db.asOwner(async (q) => (await q('select private.entry_detail($1) as v', [entry])).rows[0].v, U.owner);
  const entryZ = await entryOf((await invoice(Z.sale)).invoice_entry_id);
  const overview = await read(U.owner, OV, [day(-7), TODAY]);
  const row = (sale) => overview.rows.find((r) => r.id === sale);

  t.same([detailX.open, detailX.debt, detailX.paid, row(X.sale).open, row(X.sale).debt, row(N.sale).open, row(W0.sale).open],
    ['3000', '7000', '3000', '3000', '7000', '6000', '0'],
    'A1 open: بعد تحصيل 4,000 لاحق المتبقّي 3,000 في التفصيل وصفّ القائمة، والدين (الصافي − السيقان) كما كان 7,000؛ وبلا تحصيل المتبقّي = الدين، والنقديّة صفر');
  const posted = overview.rows.filter((r) => r.status === 'posted');
  const sumOpen = posted.reduce((s, r) => s + Number(r.open ?? NaN), 0);
  t.same([typeof overview.totals.open, Number(overview.totals.open), overview.rows.filter((r) => r.status === 'void').map((r) => r.open)],
    ['string', sumOpen, ['0', '0']], `A1 totals.open = مجموع المتبقّي للمرحَّلة (${overview.totals.open})، والملغاة متبقّيها صفر`);
  t.same([[detailY.debt, detailY.open, detailY.paid], [detailW.debt, detailW.open, detailW.paid, detailW.payment_refunded], [row(Y.sale).debt, row(Wv.sale).debt],
    await balance(db, P.ahmad, (await invoice(Y.sale)).book_id)],
  [['0', '0', '3000'], ['0', '0', '0', true], ['0', '0'], '-2000'],
  'A3 الملغاة بلا دين: باسمه (السيقان تبقى رصيداً له، المدفوع 3,000) والنقديّة (سيقانها رُدّت كلّها)، في التفصيل وصفّ القائمة');
  t.same([detailZ.payment_refunded, detailZ.payment_reversed, detailZ.payments.map((g) => g.refunded), detailZ.paid, detailZ.debt, row(Z.sale).payment_refunded,
    detailC0.payment_refunded, row(C0.sale).payment_refunded],
  [false, false, [false, true], '1000', '2000', false, false, false],
  'A3 payment_refunded = كلّ السيقان مردودة: ساق من ساقين لا تكفي (والساق بعلامتها)، وفاتورة بلا سيقان false');
  t.same([entryZ.paid, entryZ.payment, entryZ.paid === detailZ.paid, entryZ.payment === detailZ.payment],
    ['1000', 'credit', true, true], `A4 تفصيل قيد الفاتورة بالمدفوع الآن (بلا الساق المردودة) وطريقة الدفع منه، كتفصيل الفاتورة (${entryZ.paid} ${entryZ.payment})`);
  await one(U.manager, 'select public.void_party_payment($1, $2, $3) as v', [await legZ(1), 'ردّ', uid()]);
  const detailZ2 = await read(U.owner, DT, [Z.sale]);
  const entryZ2 = await entryOf((await invoice(Z.sale)).invoice_entry_id);
  t.same([detailZ2.payment_refunded, detailZ2.paid, entryZ2.paid], [true, '0', '0'], 'A3/A4 بعد ردّ الساقين: payment_refunded، والمدفوع صفر في التفصيل والقيد');

  // ── V3: ساق المرآة (البيع القديم) بلا صفّ تدقيق، وسيقان record_sale_v2 بصفوفها ─────────────────────────────────────────────
  const L1 = { sale: uid(), line: uid() };
  await one(U.owner, RS, [uid(), L1.sale, L1.line, P.ahmad, I.diesel, 1, 1000, TODAY, 'cash', BX.cash, W.general]);
  const auditOf = async (sale) => (await db.admin("select count(*)::int as n from public.audit_log where table_name = 'sales_payments' and (new ->> 'sale_id')::uuid = $1", [sale])).rows[0].n;
  t.same([await auditOf(L1.sale), await auditOf(X.sale), await auditOf(N.sale)], [0, 1, 2],
    'V3 ساق البيع القديم مرآة رأسه (المدقَّق في نطاقه) فلا صفّ تدقيق لها يبقى بعد التراجع ظاهراً خارج النطاق، وسيقان الفاتورة الجديدة مدقَّقة');

  // ── V1: can_void من فحوص void_sale نفسها وبترتيبها ─────────────────────────────────────────────────────────────────
  const R1 = { sale: uid(), party: P.farm, wh: W.raw, lines: [line(I.corn, 10, '500')] };
  await sold(U.owner, R1);
  const rawDetail = await read(U.managerRaw, DT, [R1.sale]);
  const rawVoid = await call(db, U.managerRaw, VS, [R1.sale, 'خطأ', uid()], { commit: false });
  const rawOverview = await read(U.managerRaw, OV, [day(-7), TODAY]);
  const ownerDetail = await read(U.owner, DT, [R1.sale]);
  const locked = await db.asOwner(async (q) => {
    await q('insert into public.period_locks (org_id, locked_through, locked_by) values ($1, $2, $3) on conflict (org_id) do update set locked_through = excluded.locked_through',
      [org, TODAY, U.owner]);
    const detail = (await q(DT, [R1.sale])).rows[0].v;
    let voided;
    try {
      await q('savepoint v');
      await q(VS, [R1.sale, 'خطأ', uid()]);
      voided = 'ok';
    } catch (error) {
      voided = error.message;
      await q('rollback to savepoint v');
    }
    return { canVoid: detail.can_void, block: detail.void_block, voided };
  }, U.owner);
  t.same([rawDetail.can_void, rawDetail.void_block, shownOf(rawVoid), rawOverview.rows.find((r) => r.id === R1.sale)?.can_void, ownerDetail.can_void, row(X.sale).can_void,
    row(Y.sale).can_void, detailY.void_block],
  [true, null, 'ok', true, true, true, false, 'already_void'],
  'V1 can_void: مدير بصفّ نطاق مخزن الموادّ القديم يرى «ألغِ» وvoid_sale يقبله (0034، بمعاملة ترجع)؛ والمالك يراه؛ والملغاة already_void؛ ولكلّ صفّ في القائمة');
  t.same(locked, { canVoid: false, block: 'period_locked', voided: 'period_locked' }, 'V1 يوم الإلغاء في فترة مقفلة: can_void false وvoid_sale period_locked');

  // ── V2: مفتاح القفل الاستشاريّ يحمل المنشأة ────────────────────────────────────────────────────────────────────────
  const defOf = async (sig) => (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [sig])).rows[0].d;
  const keys = [await defOf('public.record_sale_v2(uuid, uuid, uuid, uuid, date, jsonb, numeric, jsonb, text)'),
    await defOf('public.record_sale(uuid, uuid, uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid)')]
    .map((d) => [...d.matchAll(/hashtextextended\(([^)]*)\)/gu)].map((m) => m[1]).filter((k) => k.includes("'sale:'")));
  t.same(keys.map((k) => k.length > 0 && k.every((x) => x.includes('v_org'))), [true, true], `V2 مفتاح قفل معرّف الفاتورة يحمل المنشأة (${JSON.stringify(keys)})`);

  // ── B4: حساب الزبون النقديّ لا يُختار في غير البيع ─────────────────────────────────────────────────────────────────
  const category = await one(U.owner, "insert into public.expense_categories (name) values ('نقل') returning id");
  const asRolledBack = async (user, fn) => {
    try {
      await db.asUser(user, fn);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error.message, hint: error.hint ?? '' };
    }
  };
  const B4 = {
    purchase_unpriced: await call(db, U.owner, 'select public.record_purchase($1, $2, $3, $4, $5, $6, 10, null, null, $7, null, $8) as v',
      [uid(), uid(), uid(), I.starter, wid, TODAY, 'credit', W.feed], { commit: false }),
    receipt_draft: await asRolledBack(U.storekeeper, (q) => q("insert into public.receipts (warehouse_id, received_on, party_id, status) values ($1, $2, $3, 'draft')", [W.feed, TODAY, wid])),
    receipt_draft_edit: await asRolledBack(U.storekeeper, async (q) => {
      const draft = (await q("insert into public.receipts (warehouse_id, received_on, party_id, status) values ($1, $2, $3, 'draft') returning id", [W.feed, TODAY, P.supplier])).rows[0].id;
      await q('update public.receipts set party_id = $2 where id = $1', [draft, wid]);
    }),
    receipt_charge: await asRolledBack(U.owner, async (q) => {
      const draft = (await q("insert into public.receipts (warehouse_id, received_on, party_id, status) values ($1, $2, $3, 'draft') returning id", [W.feed, TODAY, P.supplier])).rows[0].id;
      await q("insert into public.receipt_charges (doc_id, label, amount, allocate_by, payee_party_id) values ($1, 'نقل', 1000, 'mass', $2)", [draft, wid]);
    }),
    supplier_unit: await asRolledBack(U.owner, (q) => q("insert into public.item_units (item_id, label, factor_to_base, party_id) values ($1, 'كيس الزبون', 50, $2)", [I.starter, wid])),
    party_edit: await asRolledBack(U.owner, (q) => q('update public.parties set phone = null')),
    preview: await call(db, U.manager, "select public.preview_party_allocation($1, $2, 'payment', 1000) as v", [wid, B.general], { commit: false }),
    collect: await call(db, U.manager, 'select public.record_party_payment($1, $2, $3, 1000, $4, $5, $6) as v', [uid(), wid, B.general, BX.cash, TODAY, uid()], { commit: false }),
    pay: await call(db, U.manager, 'select public.pay_party($1, $2, $3, 1000, $4, $5, $6) as v', [uid(), wid, B.general, BX.cash, TODAY, uid()], { commit: false }),
    opening: await call(db, U.manager, 'select public.record_opening_balance($1, $2, $3, 1000, $4, $5) as v', [uid(), wid, B.general, TODAY, uid()], { commit: false }),
    adjustment: await call(db, U.manager, "select public.record_party_adjustment($1, $2, $3, 'debit', 1000, $4, 'تسوية', $5) as v", [uid(), wid, B.general, TODAY, uid()], { commit: false }),
    forgive: await call(db, U.manager, "select public.forgive_debt($1, $2, $3, 1000, $4, 'إعفاء', $5) as v", [uid(), wid, B.general, TODAY, uid()], { commit: false }),
    expense: await call(db, U.manager, "select public.record_expense($1, $2, $3, 1000, $4, 'credit', null, $5, null, null, null, null, 'مصروف', null, $6) as v",
      [uid(), category, D.general, TODAY, wid, uid()], { commit: false }),
  };
  const b4 = Object.fromEntries(Object.entries(B4).map(([key, r]) => [key, r.ok ? 'ok' : r.code === 'walk_in_party' && r.hint.includes(NEW_HINT) ? 'refused' : `${r.code}: ${r.hint}`]));
  t.same(b4, Object.fromEntries(Object.keys(B4).map((key) => [key, 'refused'])),
    'B4 حساب «زبون نقديّ» يُرفض walk_in_party بتلميحه في كلّ ما سوى البيع: الشراء بلا سعر، ومسوّدة الاستلام وتعديلها، وناقل التحميل، ووحدة المورّد، وتعديل الجهة، ومعاينة التوزيع، والقبض والدفع والافتتاح والتسوية والإعفاء، والمصروف بالدين');
  const readers = {
    statement: shownOf(await call(db, U.owner, 'select public.party_statement_v2($1, $2, $3, $4) as v', [wid, B.general, day(-7), TODAY], { commit: false })),
  };
  t.same(readers, { statement: 'ok' }, 'B4 القرّاء (كشف الحساب) تبقى تقرأ حساب الزبون النقديّ: لا كتابة فيها');

  // ── B2: لا قفل على صفوف وحدات البيع، فتبديل الافتراضية بنفس اللحظة لا يتقافل مع الفاتورة ───────────────────────────────────────
  const unitRace = async () => {
    const s = await db.session(U.owner);
    const k = await db.session(U.storekeeper);
    try {
      const s1 = await s.run('update public.item_units set label = label where id = $1', [UB]);
      const p = k.run(V2, args({ party: P.farm, wh: W.feed, lines: [line(I.starter, 1, '35000', { unit: UA, factor: FACTOR[UA] }), line(I.starter, 1, '17500', { unit: UB, factor: FACTOR[UB] })] }));
      const st = await db.settle(p, k.pid);
      const s2 = await s.run('update public.item_units set is_default = true where id = $1', [UB]);
      if (s2.ok) await s.commit();
      else await s.rollback();
      const k1 = await p;
      if (k1.ok) await k.commit();
      else await k.rollback();
      return { s1: s1.ok, st, s2: s2.ok ? 'ok' : s2.error, k1: k1.ok ? 'ok' : k1.error };
    } finally {
      await s.rollback();
      await k.rollback();
    }
  };
  const ur = await unitRace();
  const defaultNow = (await db.admin('select id from public.item_units where item_id = $1 and is_default', [I.starter])).rows.map((r) => r.id);
  t.same([ur, defaultNow], [{ s1: true, st: 'finished', s2: 'ok', k1: 'ok' }, [UB]],
    'B2 فاتورة بوحدتين وتبديل الوحدة الافتراضية (يقفل الجديدة ثمّ القديمة) بنفس اللحظة: الفاتورة لا تنتظر ولا 40P01، والتبديل يثبت');

  // ── B3: الزبون النقديّ يُقفل لكلّ (جهة، دفتر) ───────────────────────────────────────────────────────────────────────
  const walkRace = async () => {
    const a = await db.session(U.owner);
    const k = await db.session(U.storekeeper);
    try {
      const a1 = await a.run(V2, args({ party: null, wh: W.feed, lines: [line(I.starter, 2, '700')], payments: [leg(BX.cash, 1400)] }));
      const p2 = k.run(V2, args({ party: null, wh: W.medicine, lines: [line(I.vaccine, 2, '500')], payments: [leg(BX.bank, 1000)] }));
      const st = await db.settle(p2, k.pid);
      await a.commit();
      const k1 = await p2;
      await k.commit();
      return { a1: a1.ok ? 'ok' : a1.error, st, k1: k1.ok ? 'ok' : k1.error };
    } finally {
      await a.rollback();
      await k.rollback();
    }
  };
  t.same(await walkRace(), { a1: 'ok', st: 'finished', k1: 'ok' },
    'B3 فاتورتان نقديّتان متزامنتان من مخزن العلف ومخزن الأدوية (دفتران): الثانية لا تنتظر الأولى');
  t.same([await balance(db, wid, B.feed_mill), await balance(db, wid, B.medicine), await balance(db, wid, B.general)], ['0', '0', '0'], 'B3 رصيد الزبون النقديّ صفر بكلّ دفتر');

  // ── B6: معرّف سطر أو ساق في فاتورتين متزامنتين id_conflict ───────────────────────────────────────────────────────────
  const idRace = async (first, second) => {
    const a = await db.session(U.owner);
    const k = await db.session(U.accountant);
    try {
      const a1 = await a.run(V2, args(first));
      const p2 = k.run(V2, args(second));
      const st = await db.settle(p2, k.pid);
      await a.commit();
      const k1 = await p2;
      return { a1: a1.ok ? 'ok' : a1.error, st, k1: k1.ok ? 'ok' : k1.error, hint: k1.hint ?? '' };
    } finally {
      await a.rollback();
      await k.rollback();
    }
  };
  const sharedLine = uid();
  const lineRace = await idRace({ party: P.ahmad, wh: W.feed, lines: [line(I.starter, 1, '700', { id: sharedLine })] },
    { party: P.farm, wh: W.general, lines: [line(I.diesel, 1, '1000', { id: sharedLine })] });
  const sharedLeg = uid();
  const legRace = await idRace({ party: P.ahmad, wh: W.feed, lines: [line(I.starter, 1, '700')], payments: [leg(BX.cash, 700, sharedLeg)] },
    { party: P.farm, wh: W.general, lines: [line(I.diesel, 1, '1000')], payments: [leg(BX.bank, 1000, sharedLeg)] });
  t.same([lineRace.a1, lineRace.st, lineRace.k1, lineRace.hint.includes('سطر'), legRace.a1, legRace.st, legRace.k1, legRace.hint.includes('دفعة')],
    ['ok', 'blocked', 'id_conflict', true, 'ok', 'blocked', 'id_conflict', true],
    `B6 معرّف سطر ثمّ ساق في فاتورة ثانية متزامنة: تنتظر الأولى ثمّ id_conflict بتلميحه لا خطأ الفهرس الخام (${lineRace.k1} | ${legRace.k1})`);

  // ── A5 وA6: verify_sales يمسك تواريخ الإلغاء ورقم المستند ────────────────────────────────────────────────────────────
  const planted = async (statements) => db.asOwner(async (q) => {
    await q('alter table public.party_entries disable trigger user');
    await q('alter table public.cash_moves disable trigger user');
    await q('alter table public.stock_moves disable trigger user');
    for (const [sql, params] of statements) await q(sql, params);
    return verifyMap(q);
  });
  const legMove = "(select g.cash_move_id from public.sales_payments g where g.sale_id = $1 and g.leg_no = 1)";
  const PLANT = {
    walk_in_refund_move_day: [[`update public.cash_moves set on_date = $2 where reverses_move_id = ${legMove}`, [Wv.sale, day(-1)]]],
    invoice_reversal_day: [['update public.party_entries set on_date = $2 where reverses_entry_id = (select invoice_entry_id from public.sales_invoices where id = $1)', [Wv.sale, day(-1)]]],
    walk_in_leg_reversal_day: [['update public.party_entries set on_date = $2 where reverses_entry_id = (select g.payment_entry_id from public.sales_payments g where g.sale_id = $1 and g.leg_no = 2)', [Wv.sale, day(-1)]]],
    stock_reversal_day: [["update public.stock_moves set moved_on = $2 where reverses_move_id in (select m.id from public.stock_moves m where m.doc_kind = 'sale' and m.doc_id = $1)", [Y.sale, day(-1)]]],
    all_before_sale: [
      [`update public.cash_moves set on_date = $2 where reverses_move_id in (select g.cash_move_id from public.sales_payments g where g.sale_id = $1)`, [Wv.sale, day(-3)]],
      ["update public.party_entries set on_date = $2 where reverses_entry_id in (select invoice_entry_id from public.sales_invoices where id = $1 union all select g.payment_entry_id from public.sales_payments g where g.sale_id = $1)", [Wv.sale, day(-3)]],
      ["update public.stock_moves set moved_on = $2 where reverses_move_id in (select m.id from public.stock_moves m where m.doc_kind = 'sale' and m.doc_id = $1)", [Wv.sale, day(-3)]],
    ],
    invoice_doc_no: [["update public.party_entries set doc_no = 'MS-2026-9999' where id = (select invoice_entry_id from public.sales_invoices where id = $1)", [X.sale]]],
    leg_doc_no: [["update public.party_entries set doc_no = 'MS-2026-9998' where id = (select g.payment_entry_id from public.sales_payments g where g.sale_id = $1 and g.leg_no = 1)", [X.sale]]],
  };
  const caught = {};
  for (const [key, statements] of Object.entries(PLANT)) {
    const found = await planted(statements);
    caught[key] = found.sale_entries + found.sale_moves;
  }
  t.same(caught, Object.fromEntries(Object.keys(PLANT).map((key) => [key, 1])),
    'A5/A6 verify_sales يمسك (مرّة لكلّ فاتورة): ردّ ساق نقديّة وعكس قيد الفاتورة وعكس ساق وعكس المخزون بغير يوم الإلغاء الواحد، والكلّ قبل يوم البيع، وقيد الفاتورة وقيد الساق بغير رقمها');
  t.same(await db.asService(verifyMap), { sale_shape: 0, sale_moves: 0, sale_entries: 0, sale_orphans: 0, sale_numbers: 0 }, 'ضابط: verify_sales صفر على البيانات الحقيقية');
}
