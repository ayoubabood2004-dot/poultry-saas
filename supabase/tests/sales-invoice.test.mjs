// الفاتورة الاحترافيّة (0033؛ كلمة المالك 2026-11-17 وأجوبته، DECISIONS «نظام المبيعات الاحترافيّ»، والعقد docs/plans/0033/contract-0033.md «أ»):
// (١) فاتورة بعدّة سطور ووحدات بيع وخصم سطر وخصم فاتورة موزَّع بأكبر الباقي (حالة يخالف فيها الباقي ترتيبَ السطور) وسيقان من صندوقين والباقي دين،
// والسحب FIFO والكلفة لكلّ سطر، والقيود والسيقان مخصَّصة لفاتورتها؛ (٢) الزبون النقديّ (أوّل فاتورتين متزامنتين على حساب واحد، ومدفوع كلّه، ومخفيّ عن
// القراءة المباشرة، ولا قيد عليه إلّا من فاتورته)؛ (٣) النقص بعد جمع سطور المادّة الواحدة؛ (٤) الإعادة بالمرجع وبالمعرّف (المحتوى بعد التطبيع)؛
// (٥) الإلغاء (سيقان الزبون باسمه تبقى رصيداً، وسيقان النقديّ تُردّ)؛ (٦) record_sale القديمة كما هي (مفاتيحها وساقها)؛ (٧) الصلاحيات والنطاق؛ (٨) كلّ
// رفض برمزه وتلميحه؛ (٩) sale_catalog؛ (١٠) القرّاء (sale_detail وsales_overview وsales_report وentry_detail)؛ (١١) الثوابت وضوابطها؛ (١٢) طفرات
// تكسر كلّ قاعدة فيفشل فحصها. وعيّنات القاعدة الحقيقية للشاشات: SALES_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/sales-0033.json (شغّل هذا الملف
// وحده بها: sales.test يقرأ المتغيّر نفسه مساراً).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balance, call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { lotsOf, postedOpening } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033.json');
const TODAY = '2026-11-17';
const id = (n) => `d3333000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477033330${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const V2 = 'select public.record_sale_v2($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9) as v';
const RS = 'select public.record_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as v';
const VS = 'select public.void_sale($1, $2, $3) as v';
const CAT = 'select public.sale_catalog($1) as v';
const DT = 'select public.sale_detail($1) as v';
const OV = 'select public.sales_overview($1, $2) as v';
const RE = 'select public.sales_report($1, $2, $3) as v';
const FN = {
  v2: 'public.record_sale_v2(uuid, uuid, uuid, uuid, date, jsonb, numeric, jsonb, text)',
  legacy: 'public.record_sale(uuid, uuid, uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid)',
  void: 'public.void_sale(uuid, text, uuid)',
  catalog: 'public.sale_catalog(uuid)',
  overview: 'public.sales_overview(date, date)',
  report: 'public.sales_report(date, date, text)',
  verify: 'public.verify_sales()',
  guard: 'private.party_entries_walk_in()',
  partyForPost: 'private.party_for_post(uuid)',
  partyNotSystem: 'private.party_not_system()',
  partiesGuard: 'private.parties_system_guard()',
  paid: 'private.sale_paid(uuid)',
};
const LEGACY_KEYS = ['base_unit', 'book_id', 'cash_account_id', 'cost', 'doc_no', 'free', 'id', 'item_id', 'item_name', 'line_id', 'money', 'party_id', 'party_name',
  'payment', 'payment_refunded', 'qty', 'sold_on', 'status', 'void_reason', 'voided_at', 'warehouse_id', 'warehouse_name'];

/** نصّ عشري بلا أصفار زائدة («1500.000» ← «1500»)، والفارغ كما هو. */
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};
/** مفتاح money تحت كائن cost بأيّ عمق (الكلفة والربح). */
const costMoney = (value) => {
  if (Array.isArray(value)) return value.some(costMoney);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, v]) => (key === 'cost' && v && typeof v === 'object' && 'money' in v) || costMoney(v));
  return false;
};
const shownOf = (result) => (result.ok ? 'ok' : result.code);

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  // ── المنشأة: الأدوار الثمانية، وأمين بنطاق المعمل والعامّة والأدوية، وأمين بالعامّة وحدها، وأمين بمخزن المواد وحده (دفتر وحدته خارج نطاقه) ───────────
  const G = await makeOrg(db, {
    name: 'مزرعة الفاتورة',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill', 'general', 'medicine']],
      ['accountant', 'accountant'],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['hatcheryOperator', 'hatchery_operator', ['hatchery']],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['viewer', 'viewer'],
      ['keeperGeneral', 'storekeeper', ['general']],
      ['keeperRaw', 'storekeeper'],
    ],
  });
  const { users: U, members: MB, books: B, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[]) as v", [MB.keeperRaw, W.raw]);
  const item = (name, kind, unit, extra = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry, barcode) values ($1, $2, $3, $4, $5) returning id', [name, kind, unit, extra.tracksExpiry ?? false, extra.barcode ?? null]);
  const I = {
    starter: await item('علف بادئ', 'feed', 'kg', { barcode: '6260001' }),
    grower: await item('علف نامي', 'feed', 'kg'),
    concentrate: await item('علف مركّز', 'feed', 'kg'),
    vaccine: await item('لقاح نيوكاسل', 'vaccine', 'pc', { tracksExpiry: true }),
    antibiotic: await item('مضاد حيوي', 'medicine', 'L'),
    diesel: await item('كاز', 'fuel', 'L'),
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    chicks: await item('أفراخ لحم', 'chick', 'pc'),
    old: await item('علف قديم', 'feed', 'kg'),
    race: await item('علف التزامن', 'feed', 'kg'),
  };
  const unit = (itemId, label, factor, extra = {}) =>
    one(U.owner, 'insert into public.item_units (item_id, label, factor_to_base, for_sale, is_default) values ($1, $2, $3, $4, $5) returning id', [itemId, label, factor, extra.forSale ?? true, extra.isDefault ?? false]);
  const UN = {
    bag: await unit(I.starter, 'كيس 50 كغم', 50, { isDefault: true }),
    ton: await unit(I.starter, 'طنّ', 1000),
    noSale: await unit(I.starter, 'برميل', 200, { forSale: false }),
    oldBag: await unit(I.starter, 'كيس 40 كغم', 40),
    growerBag: await unit(I.grower, 'كيس 50 كغم', 50),
    box10: await unit(I.vaccine, 'علبة 10', 10),
    bottle: await unit(I.antibiotic, 'قنينة نصف لتر', 0.5),
  };
  await one(U.owner, 'update public.item_units set archived_at = now() where id = $1 returning id', [UN.oldBag]);
  // حجم كلّ وحدة كما تراه الشاشة: إلزاميّ لكلّ سطر بوحدة بيع (مراجعة 0033 A2، factor_required)، فيُرسل مع كلّ سطر بوحدة ما لم يُكتب غيره.
  const FACTOR = { [UN.bag]: 50, [UN.ton]: 1000, [UN.noSale]: 200, [UN.oldBag]: 40, [UN.growerBag]: 50, [UN.box10]: 10, [UN.bottle]: 0.5 };
  await postedOpening(db, U.owner, W.feed, day(-5), [
    { item: I.starter, qty: 1000, value: '600000.00' },
    { item: I.grower, qty: 1000, value: '550000.00' },
    { item: I.race, qty: 50, value: '25000.00' },
  ]);
  // دفعة ثانية من «علف بادئ» بشراء يوم -4 (الافتتاح مرّة واحدة لكلّ مادّة): 500 كغم بـ650.
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد العلف', true) returning id");
  await one(U.owner, "select public.record_purchase(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, $3, 500, 650, null, 'credit', null, $4) ->> 'doc_no' as v",
    [I.starter, supplier, day(-4), W.feed]);
  await postedOpening(db, U.owner, W.medicine, day(-5), [{ item: I.vaccine, qty: 200, value: '100000.00', expiry: '2027-06-30' }, { item: I.antibiotic, qty: 50, value: '400000.00' }]);
  await postedOpening(db, U.owner, W.general, day(-5), [{ item: I.diesel, qty: 300, value: '240000.00' }]);
  await postedOpening(db, U.owner, W.raw, day(-5), [{ item: I.corn, qty: 100, value: '45000.00' }]);
  await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [I.old]);
  await one(U.owner, 'select public.set_item_sell_price($1, 700, null) as v', [I.starter]);
  const party = (name) => one(U.owner, 'insert into public.parties (name, is_customer) values ($1, true) returning id', [name]);
  const P = { ahmad: await party('أبو أحمد'), farm: await party('مزرعة النور'), gone: await party('زبون قديم'), late: await party('زبون الطفرات') };
  await one(U.owner, 'update public.parties set archived_at = now() where id = $1 returning id', [P.gone]);
  const box = (name, kind) => one(U.owner, 'insert into public.cash_accounts (name, kind) values ($1, $2) returning id', [name, kind]);
  const BX = { cash: await box('الصندوق', 'cash'), bank: await box('المصرف', 'bank'), wallet: await box('المحفظة', 'wallet'), closed: await box('صندوق قديم', 'cash') };
  await one(U.owner, 'update public.cash_accounts set archived_at = now() where id = $1 returning id', [BX.closed]);

  const samples = { refusals: {} };
  const refusal = (key, result) => {
    if (!result.ok) samples.refusals[key] = { code: result.code, hint: result.hint };
    return result;
  };
  const line = (itemId, qty, price, o = {}) => ({ line_id: o.id ?? uid(), item_id: itemId, unit_id: o.unit ?? null, qty: String(qty), unit_price: String(price),
    discount: String(o.discount ?? 0), ...(o.factor !== undefined ? { factor: String(o.factor) } : o.unit ? { factor: String(FACTOR[o.unit]) } : {}) });
  const leg = (boxId, amount, legId = uid()) => ({ leg_id: legId, cash_account_id: boxId, amount: String(amount) });
  const args = (o) => [o.ref ?? uid(), o.sale === undefined ? uid() : o.sale, o.wh === undefined ? W.feed : o.wh, o.party === undefined ? P.ahmad : o.party, o.on ?? TODAY,
    o.rawLines ?? JSON.stringify(o.lines), o.discount ?? 0, o.rawPayments ?? JSON.stringify(o.payments ?? []), o.note ?? null];
  const sell = (user, o, options) => call(db, user, V2, args(o), options);
  const legacyArgs = (o) => [o.ref ?? uid(), o.sale ?? uid(), o.line ?? uid(), o.party ?? P.ahmad, o.item, o.qty, o.price, o.on ?? TODAY, o.payment ?? 'credit', o.box ?? null, o.wh ?? null];
  const unsell = (user, sale, reason = 'فاتورة خاطئة', ref = uid()) => call(db, user, VS, [sale, reason, ref]);
  const read = async (user, sql, params) => (await call(db, user, sql, params, { commit: false })).value;
  const lots = async (itemId, wh) => (await lotsOf(db, itemId, wh)).map((l) => [l.received_on, l.qty_left, l.value_left]);
  const entriesOf = async (sale) => (await db.admin(`select kind, amount::text as amount, party_id, reverses_entry_id is not null as reversal
    from public.party_entries where doc_kind = 'sale' and doc_id = $1 order by seq, created_at`, [sale])).rows;
  const boxBalance = async (boxId) => (await db.admin('select coalesce(sum(amount), 0)::text as v from public.cash_moves where account_id = $1', [boxId])).rows[0].v;
  const verifyMap = async (q, fn) => Object.fromEntries((await q(`select check_name, violations::int as v from public.${fn}()`)).rows.map((r) => [r.check_name, r.v]));
  const zeroOf = async (fn) => Object.entries(await db.asService((q) => verifyMap(q, fn))).filter(([, v]) => v !== 0);
  const walkInId = async () => (await db.admin("select id from public.parties where org_id = $1 and system_kind = 'walk_in'", [org])).rows[0]?.id ?? null;

  // ── ١) الفاتورة بعدّة سطور (الأمين): كيسان وكيلو وكيس نامي، وخصم سطرين وخصم فاتورة، ودفع من صندوقين والباقي دين ─────────────────────────────
  const A = {
    ref: uid(),
    sale: uid(),
    lines: [line(I.starter, 3, '35000', { unit: UN.bag, discount: 1000 }), line(I.starter, '25.5', '720'), line(I.grower, 2, '30000', { unit: UN.growerBag, discount: 500 })],
    discount: 2000,
    payments: [leg(BX.cash, 50000), leg(BX.bank, 30000)],
    note: 'تسليم في الحقل',
  };
  const soldA = await sell(U.storekeeper, A);
  t.same([soldA.ok, soldA.value?.doc_no, norm(soldA.value?.total), norm(soldA.value?.discount_total), norm(soldA.value?.paid), norm(soldA.value?.debt),
    soldA.value?.walk_in, soldA.value?.lines?.map((l) => [norm(l.qty_base), norm(l.line_total)]), costMoney(soldA.value)],
  [true, 'FD-2026-0001', '179860', '3500', '80000', '99860', false, [['150', '102856'], ['25.5', '18158'], ['100', '58846']], false],
  `فاتورة بثلاثة سطور: 150 كغم و25.5 كغم و100 كغم بالأساس، والصافي 179,860 بعد خصم 3,500، والمدفوع 80,000 والدين 99,860، بلا كلفة في الجواب (${soldA.code ?? ''} ${soldA.hint ?? ''})`);
  const linesA = (await db.admin(`select line_no, item_unit_id, unit_label, trim_scale(unit_factor)::text as f, trim_scale(unit_qty)::text as uq, unit_price_unit::text as up,
      unit_price::text as bp, gross_total::text as g, line_discount::text as d, invoice_discount_share::text as s, line_total::text as n, trim_scale(qty)::text as q
    from public.sales_lines where sale_id = $1 order by line_no`, [A.sale])).rows;
  t.same(linesA.map((l) => [l.line_no, l.unit_label, l.f, l.uq, l.q, l.up, l.bp, l.g, l.d, l.s, l.n]), [
    [1, 'كيس 50 كغم', '50', '3', '150', '35000.00', '700.00', '105000', '1000', '1144', '102856'],
    [2, 'kg', '1', '25.5', '25.5', '720.00', '720.00', '18360', '0', '202', '18158'],
    [3, 'كيس 50 كغم', '50', '2', '100', '30000.00', '600.00', '60000', '500', '654', '58846'],
  ], 'السطور: لقطة الوحدة ومعاملها، والكمية بها وبالأساس، وسعر الوحدة والأساس، والإجماليّ، وخصم السطر، ونصيب خصم الفاتورة بأكبر الباقي (السطر الثاني قبل الأوّل: باقيه أكبر)');
  t.same((await entriesOf(A.sale)).map((e) => [e.kind, e.amount, e.party_id === P.ahmad]), [['invoice', '179860', true], ['payment', '-50000', true], ['payment', '-30000', true]],
    'قيد فاتورة بالصافي وقيدا قبض بسيقانها، كلّها على الزبون في دفتر المعمل');
  const legsA = (await db.admin(`select g.leg_no, g.cash_account_id, g.amount::text as amount, m.amount::text as moved, m.kind,
      (select coalesce(sum(a.amount), 0) from public.party_allocations a where a.debit_entry_id = s.invoice_entry_id and a.credit_entry_id = g.payment_entry_id)::text as allocated
    from public.sales_payments g join public.cash_moves m on m.id = g.cash_move_id join public.sales_invoices s on s.id = g.sale_id where g.sale_id = $1 order by g.leg_no`, [A.sale])).rows;
  t.same(legsA.map((g) => [g.leg_no, g.cash_account_id, g.amount, g.moved, g.kind, g.allocated]), [[1, BX.cash, '50000', '50000', 'party_payment', '50000'], [2, BX.bank, '30000', '30000', 'party_payment', '30000']],
    'ساقان: لكلّ صندوق حركة party_payment بمبلغها وقيد قبض مخصَّص لهذه الفاتورة بمبلغه');
  const headA = (await db.admin(`select payment, cash_account_id, payment_entry_id, total::text, paid::text, discount_total::text, invoice_discount::text, note, walk_in
    from public.sales_invoices where id = $1`, [A.sale])).rows[0];
  t.same(headA, { payment: 'credit', cash_account_id: null, payment_entry_id: null, total: '179860', paid: '80000', discount_total: '3500', invoice_discount: '2000', note: 'تسليم في الحقل', walk_in: false },
    'الرأس: بقي دين فالدفع credit، والصندوق والقبض في السيقان لا في الرأس، والصافي والمدفوع والخصمان والملاحظة');
  t.same((await db.admin('select cost::text as c from public.sales_line_costs where sale_id = $1 order by (select line_no from public.sales_lines l where l.id = line_id)', [A.sale])).rows.map((r) => r.c),
    ['90000.00', '15300.00', '55000.00'], 'الكلفة لكلّ سطر = قيمة سحبه بالضبط (FIFO من دفعة اليوم -5)');

  // FIFO عبر دفعتين لسطرين من المادّة نفسها: 900 كغم من الأولى (بقي 824.5) ثمّ من الثانية.
  const F = { sale: uid(), lines: [line(I.starter, 800, '700'), line(I.starter, 100, '700')], payments: [] };
  const soldF = await sell(U.owner, { ...F, party: P.farm });
  const costsF = (await db.admin('select c.cost::text as c from public.sales_line_costs c join public.sales_lines l on l.id = c.line_id where c.sale_id = $1 order by l.line_no', [F.sale])).rows.map((r) => r.c);
  t.same([soldF.ok, costsF, await lots(I.starter, W.feed)], [true, ['480000.00', '63775.00'], [[day(-5), '0', '0'], [day(-4), '424.5', '275925']]],
    'سطران من المادّة نفسها يسحبان FIFO بالترتيب: الأوّل 800 كغم من الدفعة الأولى، والثاني 24.5 منها و75.5 من الثانية (14,700 + 49,075 بالضبط)');

  // ── ٢) الزبون النقديّ: أوّل فاتورتين متزامنتين على حساب واحد، والمدفوع كلّه، ومخفيّ عن القراءة المباشرة ─────────────────────────────────────
  t.eq(await walkInId(), null, 'قبل أوّل فاتورة نقديّة لا حساب للزبون النقديّ');
  const walkA = { sale: uid(), party: null, wh: W.general, lines: [line(I.diesel, 20, '1000')], payments: [leg(BX.cash, 20000)] };
  const walkB = { sale: uid(), party: null, wh: W.medicine, lines: [line(I.vaccine, 2, '6000', { unit: UN.box10 }), line(I.antibiotic, 3, '4500', { unit: UN.bottle })],
    payments: [leg(BX.cash, 20000), leg(BX.wallet, 5500)] };
  const walkRace = async () => {
    const a = await db.session(U.owner);
    const b = await db.session(U.storekeeper);
    try {
      const a1 = await a.run(V2, args(walkA));
      const p2 = b.run(V2, args(walkB));
      const st2 = await db.settle(p2, b.pid);
      await a.commit();
      const b1 = await p2;
      await b.commit();
      return { a1, st2, b1 };
    } finally {
      await a.rollback();
      await b.rollback();
    }
  };
  const race = await walkRace();
  const walkParty = await walkInId();
  const walkRows = (await db.admin("select count(*)::int as n, min(name) as name from public.parties where org_id = $1 and system_kind = 'walk_in'", [org])).rows[0];
  t.same([race.a1.ok, race.st2, race.b1.ok, walkRows, race.a1.rows?.[0]?.v?.walk_in, race.b1.rows?.[0]?.v?.party_id === walkParty, race.a1.rows?.[0]?.v?.party_name],
    [true, 'blocked', true, { n: 1, name: 'زبون نقديّ' }, true, true, 'زبون نقديّ'],
    `أوّل فاتورتين نقديّتين متزامنتين: الثانية تنتظر إنشاء الحساب ثمّ تكتب عليه نفسه، فحساب «زبون نقديّ» واحد (${race.a1.error ?? ''} ${race.b1.error ?? ''})`);
  const soldWalkB = race.b1.rows?.[0]?.v;
  t.same([soldWalkB?.doc_no, norm(soldWalkB?.total), norm(soldWalkB?.paid), norm(soldWalkB?.debt), soldWalkB?.lines?.map((l) => norm(l.qty_base))],
    ['MD-2026-0001', '25500', '25500', '0', ['20', '1.5']], 'الفاتورة النقديّة: علبتا لقاح (20 قطعة) وثلاث قنانٍ (1.5 لتر)، مدفوعة كلّها من صندوقين');
  t.same([await balance(db, walkParty, B.medicine), await balance(db, walkParty, B.general)], ['0', '0'], 'رصيد الزبون النقديّ صفر بكلّ دفتر');
  const hidden = async (user) => db.asUser(user, async (q) => (await q("select count(*)::int as n from public.parties where name = 'زبون نقديّ'")).rows[0].n);
  t.same([await hidden(U.owner), await hidden(U.storekeeper), await db.asService(async (q) => (await q("select count(*)::int as n from public.parties where org_id = $1 and system_kind = 'walk_in'", [org])).rows[0].n)],
    [0, 0, 1], 'الحساب مخفيّ عن القراءة المباشرة لكلّ دور (قوائم الجهات)، وموجود لمفتاح الخادم');
  const legOfWalkB = (await db.admin('select payment_entry_id from public.sales_payments where sale_id = $1 and leg_no = 1', [walkB.sale])).rows[0].payment_entry_id;
  const legOfWalkA = (await db.admin('select payment_entry_id from public.sales_payments where sale_id = $1 and leg_no = 1', [walkA.sale])).rows[0].payment_entry_id;
  const guard = {
    collect: refusal('walk_in_collect', await call(db, U.manager, 'select public.record_party_payment($1, $2, $3, 1000, $4, $5, $6) as v', [uid(), walkParty, B.medicine, BX.cash, TODAY, uid()])),
    unpay: refusal('walk_in_unpay', await call(db, U.manager, 'select public.void_party_payment($1, $2, $3) as v', [legOfWalkB, 'ردّ', uid()])),
    legacy: refusal('legacy_walk_in', await call(db, U.owner, RS, legacyArgs({ party: walkParty, item: I.diesel, qty: 1, price: 0 }))),
    named: refusal('v2_walk_in_named', await sell(U.owner, { party: walkParty, wh: W.general, lines: [line(I.diesel, 1, '1000')], payments: [leg(BX.cash, 1000)] })),
  };
  t.same(Object.values(guard).map(shownOf), ['walk_in_party', 'walk_in_party', 'walk_in_party', 'walk_in_party'],
    'حساب الزبون النقديّ: لا قبض عليه، ولا «ألغِ القبض» لساقه، ولا يُختار جهةً في البيع القديم ولا الجديد');
  const unpaid = refusal('walk_in_unpaid', await sell(U.owner, { party: null, wh: W.general, lines: [line(I.diesel, 5, '1000')], payments: [leg(BX.cash, 4000)] }));
  t.same([unpaid.code, unpaid.hint.includes('5,000') && unpaid.hint.includes('4,000')], ['walk_in_unpaid', true], `الزبون النقديّ يدفع كلّه (${unpaid.hint})`);

  // ── ٣) دين كلّه، وبالمجّان، والبيع القديم ───────────────────────────────────────────────────────────────────────────
  const C = { sale: uid(), party: P.farm, wh: W.general, lines: [line(I.diesel, 10, '1000')] };
  const soldC = await sell(U.keeperGeneral, C);
  const D = { sale: uid(), party: P.farm, wh: W.general, lines: [line(I.diesel, 5, '0')] };
  const soldD = await sell(U.keeperGeneral, D);
  t.same([soldC.value?.doc_no, norm(soldC.value?.debt), soldD.value?.doc_no, norm(soldD.value?.total), (await entriesOf(D.sale)).length,
    (await db.admin('select payment from public.sales_invoices where id = $1', [C.sale])).rows[0].payment],
  ['MS-2026-0002', '10000', 'MS-2026-0003', '0', 0, 'credit'], 'دين كلّه بلا سيقان، وتسليم بلا مقابل بلا قيد، والرقم MS يتابع بعد النقديّة');
  const L = { sale: uid(), line: uid(), item: I.grower, qty: 10, price: 600, payment: 'cash', box: BX.cash };
  const soldL = await call(db, U.storekeeper, RS, legacyArgs(L));
  t.same([soldL.ok, Object.keys(soldL.value ?? {}).sort(), soldL.value?.payment, norm(soldL.value?.money?.paid_now), norm(soldL.value?.money?.line_total)],
    [true, LEGACY_KEYS, 'cash', '6000', '6000'], `record_sale القديمة: مفاتيح جوابها كما في 0021 بالضبط (${soldL.code ?? ''} ${soldL.hint ?? ''})`);
  const legacyRow = (await db.admin(`select s.total::text, s.paid::text, s.cash_account_id = g.cash_account_id and s.payment_entry_id = g.payment_entry_id and s.cash_move_id = g.cash_move_id as mirror,
      g.leg_no, g.amount::text as amount, l.unit_label, trim_scale(l.unit_factor)::text as f, l.gross_total::text as g
    from public.sales_invoices s join public.sales_payments g on g.sale_id = s.id join public.sales_lines l on l.sale_id = s.id where s.id = $1`, [L.sale])).rows;
  t.same(legacyRow, [{ total: '6000', paid: '6000', mirror: true, leg_no: 1, amount: '6000', unit_label: 'kg', f: '1', g: '6000' }],
    'وتكتب الأعمدة الجديدة (الصافي والمدفوع ووحدة الأساس) وساقها الواحدة مرآةَ رأسها');

  // ── ٤) الإعادة ─────────────────────────────────────────────────────────────────────────────────────────────────
  const again = await sell(U.storekeeper, A);
  const pad = (v, n) => (String(v).includes('.') ? `${v}${'0'.repeat(n)}` : `${v}.${'0'.repeat(n)}`);
  const reformatted = { ...A, ref: uid(), lines: A.lines.map((l) => ({ ...l, qty: pad(l.qty, 2), unit_price: pad(l.unit_price, 1), discount: pad(l.discount, 2) })), discount: '2000.00',
    payments: A.payments.map((g) => ({ ...g, amount: pad(g.amount, 1) })) };
  const sameIds = await sell(U.storekeeper, reformatted);
  t.same([again.ok, again.value, sameIds.ok, sameIds.value], [true, soldA.value, true, soldA.value],
    'الإعادة بالمرجع نفسه ترجع النتيجة الأولى، وبمرجع جديد والمعرّفات والمحتوى نفسه («3» = «3.000») ترجع ما حُفظ');
  const changed = refusal('id_conflict', await sell(U.storekeeper, { ...A, ref: uid(), lines: [{ ...A.lines[0], qty: '4' }, A.lines[1], A.lines[2]] }));
  const changedLeg = await sell(U.storekeeper, { ...A, ref: uid(), payments: [A.payments[0]] });
  const reused = refusal('ref_reused', await sell(U.storekeeper, { ...A, note: 'ملاحظة أخرى' }));
  const lineTaken = refusal('line_taken', await sell(U.owner, { party: P.farm, lines: [line(I.grower, 1, '600', { id: A.lines[0].line_id })] }));
  const legTaken = refusal('leg_taken', await sell(U.owner, { party: P.farm, lines: [line(I.grower, 1, '600')], payments: [leg(BX.cash, 600, A.payments[0].leg_id)] }));
  t.same([changed.code, changedLeg.code, reused.code, lineTaken.code, legTaken.code], ['id_conflict', 'id_conflict', 'ref_reused', 'id_conflict', 'id_conflict'],
    'المعرّف نفسه بسطر أو ساق مختلفين id_conflict، والمرجع نفسه بمحتوى آخر ref_reused، ومعرّف سطر أو ساق مستعمل id_conflict');
  t.eq((await db.admin("select count(*)::int as n from public.sales_invoices where org_id = $1 and doc_no like 'FD-%'", [org])).rows[0].n, 3, 'لا فاتورة مكرّرة: FD ثلاث (A وF والقديمة)');

  // ── ٥) النقص بعد جمع سطور المادّة الواحدة، والرفض ─────────────────────────────────────────────────────────────────
  const short = refusal('insufficient_stock', await sell(U.owner, { party: P.farm, lines: [line(I.starter, 300, '700'), line(I.starter, 130, '700'), line(I.grower, 1, '600')] }));
  t.same([short.code, short.hint.includes('طلبت 430 كغم') && short.hint.includes('عندك 424.5 كغم')], ['insufficient_stock', true],
    `سطران من «علف بادئ» (300 و130، كلّ واحد أقلّ من المتاح) يُجمعان: طلبت 430 وعندك 424.5 (${short.hint})`);
  const many = Array.from({ length: 101 }, () => line(I.grower, 1, '600'));
  const R = {
    no_lines: await sell(U.owner, { lines: [] }),
    too_many_lines: await sell(U.owner, { lines: many }),
    bad_lines: await sell(U.owner, { rawLines: JSON.stringify({ item_id: I.grower }) }),
    id_required: await sell(U.owner, { lines: [{ ...line(I.grower, 1, '600'), line_id: 'ليس معرّفاً' }] }),
    item_not_found: await sell(U.owner, { lines: [line(uid(), 1, '600')] }),
    item_archived: await sell(U.owner, { lines: [line(I.old, 1, '600')] }),
    not_sellable: await sell(U.owner, { lines: [line(I.chicks, 1, '600')] }),
    qty_not_positive: await sell(U.owner, { lines: [line(I.grower, 0, '600')] }),
    bad_price: await sell(U.owner, { lines: [line(I.grower, 1, '1.234')] }),
    total_zero: await sell(U.owner, { lines: [line(I.grower, '0.001', '0.4')] }),
    bad_discount: await sell(U.owner, { lines: [line(I.grower, 1, '600', { discount: 601 })] }),
    bad_discount_invoice: await sell(U.owner, { lines: [line(I.grower, 1, '600', { discount: 100 })], discount: 501 }),
    bad_discount_fraction: await sell(U.owner, { lines: [line(I.grower, 1, '600', { discount: '1.5' })] }),
    too_many_payments: await sell(U.owner, { lines: [line(I.grower, 10, '600')], payments: [leg(BX.cash, 1), leg(BX.bank, 1), leg(BX.wallet, 1), leg(uid(), 1), leg(uid(), 1), leg(uid(), 1)] }),
    duplicate_box: await sell(U.owner, { lines: [line(I.grower, 10, '600')], payments: [leg(BX.cash, 100), leg(BX.cash, 200)] }),
    bad_payments: await sell(U.owner, { lines: [line(I.grower, 10, '600')], rawPayments: '{"x": 1}' }),
    amount_not_whole_dinar: await sell(U.owner, { lines: [line(I.grower, 10, '600')], payments: [leg(BX.cash, '100.5')] }),
    amount_not_positive: await sell(U.owner, { lines: [line(I.grower, 10, '600')], payments: [leg(BX.cash, 0)] }),
    overpaid: await sell(U.owner, { lines: [line(I.grower, 10, '600')], payments: [leg(BX.cash, 5000), leg(BX.bank, 1001)] }),
    cash_account_archived: await sell(U.owner, { lines: [line(I.grower, 1, '600')], payments: [leg(BX.closed, 600)] }),
    cash_account_not_found: await sell(U.owner, { lines: [line(I.grower, 1, '600')], payments: [leg(uid(), 600)] }),
    bad_note: await sell(U.owner, { lines: [line(I.grower, 1, '600')], note: 'م'.repeat(501) }),
    date_in_future: await sell(U.owner, { lines: [line(I.grower, 1, '600')], on: day(1) }),
    date_too_old: await sell(U.owner, { lines: [line(I.grower, 1, '600')], on: day(-8) }),
    party_not_found: await sell(U.owner, { party: uid(), lines: [line(I.grower, 1, '600')] }),
    party_archived: await sell(U.owner, { party: P.gone, lines: [line(I.grower, 1, '600')] }),
    store_required: await sell(U.owner, { wh: null, lines: [line(I.grower, 1, '600')] }),
    warehouse_not_found: await sell(U.owner, { wh: uid(), lines: [line(I.grower, 1, '600')] }),
    item_kind_mismatch: await sell(U.owner, { wh: W.general, lines: [line(I.grower, 1, '600')] }),
    unit_mismatch: await sell(U.owner, { lines: [line(I.grower, 1, '30000', { unit: UN.bag })] }),
    unit_mismatch_not_sale: await sell(U.owner, { lines: [line(I.starter, 1, '30000', { unit: UN.noSale })] }),
    unit_mismatch_archived: await sell(U.owner, { lines: [line(I.starter, 1, '30000', { unit: UN.oldBag })] }),
    unit_changed: await sell(U.owner, { lines: [line(I.starter, 1, '35000', { unit: UN.bag, factor: 45 })] }),
    factor_required: await sell(U.owner, { lines: [{ ...line(I.starter, 1, '35000', { unit: UN.bag }), factor: undefined }] }),
    pieces_not_whole: await sell(U.owner, { wh: W.medicine, lines: [line(I.vaccine, '0.25', '6000', { unit: UN.box10 })] }),
    insufficient_stock: short,
  };
  const SAME_AS = { bad_discount_invoice: 'bad_discount', bad_discount_fraction: 'bad_discount', unit_mismatch_not_sale: 'unit_mismatch', unit_mismatch_archived: 'unit_mismatch' };
  for (const [key, result] of Object.entries(R)) refusal(`v2.${key}`, result);
  t.same(Object.fromEntries(Object.entries(R).map(([key, result]) => [key, shownOf(result)])), Object.fromEntries(Object.keys(R).map((key) => [key, SAME_AS[key] ?? key])),
    'رفض الفاتورة: كلّ حالة برمزها');
  t.ok(R.bad_discount.hint.includes('601') && R.bad_discount.hint.includes('600'), `خصم السطر أكبر من مبلغه يسمّيهما (${R.bad_discount.hint})`);
  t.ok(R.bad_discount_invoice.hint.includes('501') && R.bad_discount_invoice.hint.includes('500'), `خصم الفاتورة أكبر من صافي سطورها يسمّيهما (${R.bad_discount_invoice.hint})`);
  t.ok(R.overpaid.hint.includes('6,001') && R.overpaid.hint.includes('6,000'), `المدفوع أكثر من الصافي يسمّيهما (${R.overpaid.hint})`);
  t.ok(R.unit_changed.hint.includes('50 كغم'), `تغيّر حجم الوحدة يسمّي حجمها الآن (${R.unit_changed.hint})`);
  t.ok(R.item_kind_mismatch.hint.includes('علف نامي') && R.item_kind_mismatch.hint.includes('فاتورة من مخزنها'), `مادّة من مخزن آخر: فاتورتان (${R.item_kind_mismatch.hint})`);

  // ── ٦) الصلاحيات والنطاق ───────────────────────────────────────────────────────────────────────────────────────
  const perm = async (user, wh = W.feed) => shownOf(await sell(user, { wh, party: P.farm, lines: [line(wh === W.general ? I.diesel : I.grower, 1, '600')] }, { commit: false }));
  t.same({ owner: await perm(U.owner), manager: await perm(U.manager), accountant: await perm(U.accountant), storekeeper: await perm(U.storekeeper), millOperator: await perm(U.millOperator),
    hatcheryOperator: await perm(U.hatcheryOperator), hallWorker: await perm(U.hallWorker), viewer: await perm(U.viewer), keeperGeneral: await perm(U.keeperGeneral),
    keeperRaw: shownOf(await sell(U.keeperRaw, { wh: W.raw, party: P.farm, lines: [line(I.corn, 1, '600')] }, { commit: false })) },
  { owner: 'ok', manager: 'ok', accountant: 'ok', storekeeper: 'ok', millOperator: 'forbidden', hatcheryOperator: 'forbidden', hallWorker: 'forbidden', viewer: 'forbidden',
    keeperGeneral: 'out_of_scope', keeperRaw: 'out_of_scope' },
  'البيع بفعل sale.record (المالك والمدير والمحاسب والأمين)، والمخزن خارج النطاق ودفتر وحدة خارج النطاق out_of_scope');

  // ── ٧) sale_catalog ──────────────────────────────────────────────────────────────────────────────────────────
  const catFeedAll = await read(U.storekeeper, CAT, [W.feed]);
  const catFeed = catFeedAll.items;
  t.same([Object.keys(catFeedAll).sort(), catFeedAll.cash_accounts.map((a) => [a.id, a.name, a.kind, Object.keys(a).sort().join(',')])],
    [['cash_accounts', 'items'], [[BX.cash, 'الصندوق', 'cash', 'id,kind,name'], [BX.wallet, 'المحفظة', 'wallet', 'id,kind,name'], [BX.bank, 'المصرف', 'bank', 'id,kind,name']]],
    'sale_catalog للأمين (لا يقرأ جدول الصناديق): الموادّ، وصناديق المنشأة الفعّالة باسمها ونوعها بلا رصيد (المؤرشف خارجها)');
  const keeperBoxes = await db.asUser(U.storekeeper, async (q) => (await q('select count(*)::int as n from public.cash_accounts')).rows[0].n);
  t.eq(keeperBoxes, 0, 'ضابط: الأمين لا يقرأ جدول الصناديق مباشرة، فالصناديق من sale_catalog وحدها');
  t.same(catFeed.map((c) => [c.name, norm(c.available), norm(c.sell_price), c.barcode, c.base_unit, c.units.map((u) => [u.label, norm(u.factor)])]), [
    ['علف التزامن', '50', null, null, 'kg', []],
    ['علف بادئ', '424.5', '700', '6260001', 'kg', [['كيس 50 كغم', '50'], ['طنّ', '1000']]],
    ['علف مركّز', '0', null, null, 'kg', []],
    ['علف نامي', '890', null, null, 'kg', [['كيس 50 كغم', '50']]],
  ], 'موادّ مخزن العلف: الفعّالة التي يقبلها (المؤرشفة خارجه، والصفر ظاهر)، بالمتاح وسعر البيع للأساس، ووحدات البيع الفعّالة بحجمها');
  const catR = {
    forbidden: await call(db, U.millOperator, CAT, [W.feed], { commit: false }),
    out_of_scope: await call(db, U.keeperGeneral, CAT, [W.feed], { commit: false }),
    out_of_scope_book: await call(db, U.keeperRaw, CAT, [W.raw], { commit: false }),
    store_required: await call(db, U.owner, CAT, [null], { commit: false }),
    warehouse_not_found: await call(db, U.owner, CAT, [uid()], { commit: false }),
  };
  t.same(Object.fromEntries(Object.entries(catR).map(([key, r]) => [key, shownOf(r)])),
    { forbidden: 'forbidden', out_of_scope: 'out_of_scope', out_of_scope_book: 'out_of_scope', store_required: 'store_required', warehouse_not_found: 'warehouse_not_found' },
    'sale_catalog ببوّابات الكاتب نفسها: الفعل والمخزن ودفتر وحدته');
  const catMed = (await read(U.owner, CAT, [W.medicine])).items;
  t.same(catMed.map((c) => [c.name, norm(c.available), c.units.map((u) => u.label)]), [['لقاح نيوكاسل', '180', ['علبة 10']], ['مضاد حيوي', '48.5', ['قنينة نصف لتر']]],
    'وفي الأدوية: بعد الفاتورة النقديّة');

  // ── ٨) القرّاء ───────────────────────────────────────────────────────────────────────────────────────────────
  const keeperA = await read(U.storekeeper, DT, [A.sale]);
  const ownerA = await read(U.owner, DT, [A.sale]);
  t.same([keeperA.lines.map((l) => [l.unit_label, norm(l.unit_qty), norm(l.unit_price), norm(l.gross_total), norm(l.line_discount), norm(l.invoice_discount_share), norm(l.line_total)]),
    keeperA.payments.map((g) => [g.cash_account_name, norm(g.amount), g.refunded]), norm(keeperA.total), norm(keeperA.paid), norm(keeperA.debt), norm(keeperA.discount_total),
    norm(keeperA.invoice_discount), keeperA.walk_in, keeperA.note, keeperA.posted_by_name, keeperA.lines_count, costMoney(keeperA), norm(keeperA.open), keeperA.can_collect],
  [[['كيس 50 كغم', '3', '35000', '105000', '1000', '1144', '102856'], ['kg', '25.5', '720', '18360', '0', '202', '18158'], ['كيس 50 كغم', '2', '30000', '60000', '500', '654', '58846']],
    [['الصندوق', '50000', false], ['المصرف', '30000', false]], '179860', '80000', '99860', '3500', '2000', false, 'تسليم في الحقل', 'storekeeper', 3, false, '99860', false],
  'تفصيل الفاتورة للأمين: السطور بوحداتها وخصوماتها، والسيقان بأسماء صناديقها، والصافي والمدفوع والدين والملاحظة والبائع، بلا كلفة؛ ولا «استلم» له (ليس قابضاً)');
  t.same([ownerA.line_id, ownerA.item_name, norm(ownerA.qty), ownerA.payment, norm(ownerA.money.line_total), norm(ownerA.money.paid_now), norm(ownerA.cost.money.cost),
    norm(ownerA.invoice.cost.money.profit), ownerA.lines.map((l) => norm(l.cost.money.cost)), ownerA.draws.map((d) => [d.line_id === A.lines[0].line_id, norm(d.qty)])[0], ownerA.can_collect],
  [A.lines[0].line_id, 'علف بادئ', '150', 'credit', '179860', '80000', '160300', '19560', ['90000', '15300', '55000'], [true, '150'], true],
  'وللمالك: المفاتيح القديمة (السطر الأوّل، والمبلغ والكلفة للفاتورة كلّها)، والكلفة والربح لكلّ سطر وللفاتورة، والسحب لكلّ سطر، و«استلم من الزبون»');
  const ownerWalk = await read(U.owner, DT, [walkB.sale]);
  const ownerLegacy = await read(U.owner, DT, [L.sale]);
  t.same([ownerWalk.walk_in, ownerWalk.party_name, ownerWalk.payment, ownerWalk.payments.length, ownerWalk.can_collect, ownerLegacy.payment, ownerLegacy.payments.map((g) => [g.leg_no, norm(g.amount)]),
    ownerLegacy.lines[0].unit_label, ownerLegacy.cash_account_id === BX.cash, ownerLegacy.payment_entry_id !== null],
  [true, 'زبون نقديّ', 'cash', 2, false, 'cash', [[1, '6000']], 'kg', true, true], 'الفاتورة النقديّة والقديمة بالشكل نفسه');
  const ownerOverview = await read(U.owner, OV, [day(-7), TODAY]);
  const rowA = ownerOverview.rows.find((r) => r.id === A.sale);
  t.same([rowA.lines_count, rowA.items_count, rowA.first_item_name, rowA.item_name, norm(rowA.total), norm(rowA.paid), norm(rowA.debt), norm(rowA.discount_total), rowA.walk_in, rowA.payment,
    norm(rowA.money.line_total), norm(rowA.cost.money.cost), ownerOverview.rows.find((r) => r.id === walkB.sale).walk_in],
  [3, 2, 'علف بادئ', 'علف بادئ', '179860', '80000', '99860', '3500', false, 'credit', '179860', '160300', true], 'المبيعات: لكلّ فاتورة عدد سطورها ومادّتها الأولى وصافيها ومدفوعها ودينها وخصمها، والنقديّة بعلامتها');
  const tot = ownerOverview.totals;
  t.same([tot.count, norm(tot.money.revenue), norm(tot.money.cash), norm(tot.money.credit), norm(tot.total), norm(tot.paid), norm(tot.debt), norm(tot.discount_total)],
    [7, '871360', '131500', '739860', '871360', '131500', '739860', '3500'], 'المجاميع: الإيراد = مجموع الصوافي، والنقد = المدفوع الآن، والدين = الباقي');
  const byParty = await read(U.owner, RE, [day(-7), TODAY, 'party']);
  const byItem = await read(U.owner, RE, [day(-7), TODAY, 'item']);
  t.same([byParty.rows.find((r) => r.key === P.ahmad)?.count, norm(byParty.rows.find((r) => r.key === P.ahmad)?.money.revenue), byItem.rows.find((r) => r.key === I.starter)?.count,
    norm(byItem.rows.find((r) => r.key === I.starter)?.qty), norm(byItem.rows.find((r) => r.key === I.starter)?.money.revenue), byParty.totals.count, byItem.totals.count],
  [2, '185860', 2, '1075.5', '751014', 7, 7], 'التقرير بالصافي، والعدد فواتير لا سطور (فاتورتان لأبي أحمد، والبادئ في فاتورتين بسطوره الأربعة)');
  const entryOf = (sql, params) => db.asOwner(async (q) => (await q(sql, params)).rows[0].v, U.owner);
  const invoiceEntry = await entryOf("select private.entry_detail(invoice_entry_id) as v from public.sales_invoices where id = $1", [A.sale]);
  const legEntry = await entryOf('select private.entry_detail(payment_entry_id) as v from public.sales_payments where sale_id = $1 and leg_no = 2', [A.sale]);
  t.same([invoiceEntry.type, invoiceEntry.lines.map((l) => [l.unit_label, norm(l.amount)]), norm(invoiceEntry.total), norm(invoiceEntry.paid), invoiceEntry.payments.map((g) => g.account.name),
    legEntry.type, legEntry.account.name, legEntry.leg_no],
  ['sale', [['كيس 50 كغم', '102856'], ['kg', '18158'], ['كيس 50 كغم', '58846']], '179860', '80000', ['الصندوق', 'المصرف'], 'sale_payment', 'المصرف', 2],
  'تفصيل القيد في الكشف: الفاتورة بسطورها ووحداتها وسيقانها، وقيد القبض بصندوق ساقه');

  // ── ٩) الإلغاء ─────────────────────────────────────────────────────────────────────────────────────────────────
  const starterBefore = await lots(I.starter, W.feed);
  t.eq(shownOf(await unsell(U.storekeeper, A.sale)), 'forbidden', 'الأمين لا يلغي');
  const voidedA = await unsell(U.manager, A.sale);
  t.same([voidedA.ok, voidedA.value?.reversed_moves, norm(voidedA.value?.money?.payment_kept), norm(voidedA.value?.money?.payment_refunded), voidedA.value?.payment_entry_ids?.length,
    norm(voidedA.value?.money?.line_total), await balance(db, P.ahmad, B.feed_mill)],
  [true, 3, '80000', '0', 2, '179860', '-80000'], 'إلغاء الفاتورة بالدين جزئياً: ثلاث حركات عكسية (لكلّ سطر)، والقيد يُعكس، والسيقان تبقى رصيداً للزبون (−80,000)');
  t.same([starterBefore, await lots(I.starter, W.feed), await lots(I.grower, W.feed)],
    [[[day(-5), '0', '0'], [day(-4), '424.5', '275925']], [[day(-5), '175.5', '105300'], [day(-4), '424.5', '275925']], [[day(-5), '990', '544500']]],
    'البضاعة رجعت لدفعاتها التي سُحبت منها بقيمتها (175.5 كغم بادئ و100 كغم نامي)');
  const box1Before = await boxBalance(BX.cash);
  const voidedWalk = await unsell(U.owner, walkB.sale);
  t.same([voidedWalk.ok, norm(voidedWalk.value?.money?.payment_refunded), norm(voidedWalk.value?.money?.payment_kept), voidedWalk.value?.walk_in, await balance(db, walkParty, B.medicine),
    Number(box1Before) - Number(await boxBalance(BX.cash)), (await read(U.owner, DT, [walkB.sale])).payments.map((g) => g.refunded)],
  [true, '25500', '0', true, '0', 20000, [true, true]], 'إلغاء الفاتورة النقديّة: سيقانها تُردّ من صناديقها (20,000 من الصندوق)، ورصيد الزبون النقديّ صفر');
  const redoA = refusal('id_conflict_void', await sell(U.storekeeper, A));
  t.same([redoA.code, redoA.hint.includes('أُلغيت'), shownOf(await unsell(U.manager, A.sale))], ['id_conflict', true, 'already_void'], 'إعادة فاتورة أُلغيت بمرجعها id_conflict «أُلغيت»، وإلغاء ثانٍ already_void');

  // «ألغِ القبض» لساق زبون باسمه في فاتورة قائمة: المدفوع الآن ينقص والدين يزيد.
  const E = { sale: uid(), party: P.farm, lines: [line(I.grower, 5, '600')], payments: [leg(BX.cash, 1000), leg(BX.bank, 2000)] };
  await sell(U.owner, E);
  const legE = (await db.admin('select payment_entry_id from public.sales_payments where sale_id = $1 and leg_no = 2', [E.sale])).rows[0].payment_entry_id;
  const unpayE = await call(db, U.manager, 'select public.void_party_payment($1, $2, $3) as v', [legE, 'حوالة لم تصل', uid()]);
  const detailE = await read(U.owner, DT, [E.sale]);
  t.same([unpayE.ok, norm(detailE.paid), norm(detailE.debt), detailE.payment_refunded, detailE.payments.map((g) => g.refunded), norm(detailE.paid_at_sale)],
    [true, '1000', '2000', false, [false, true], '3000'],
    '«ألغِ القبض» لساق: المدفوع الآن 1,000 والدين 2,000، والمدفوع عند البيع كما كُتب؛ وpayment_refunded لا يكون إلّا حين تُردّ كلّ السيقان (مراجعة 0033 A3)');

  // ── ١٠) التزامن: فاتورتان لآخر رصيد — الثانية تنتظر الأولى ثمّ ترى النقص ──────────────────────────────────────────────────────
  const stockRace = async () => {
    const a = await db.session(U.storekeeper);
    const b = await db.session(U.owner);
    try {
      const a1 = await a.run(V2, args({ party: P.farm, lines: [line(I.race, 20, '600'), line(I.race, 20, '600')] }));
      const p2 = b.run(V2, args({ party: P.farm, lines: [line(I.race, 40, '600')] }));
      const st2 = await db.settle(p2, b.pid);
      await a.commit();
      return { a1, st2, b1: await p2 };
    } finally {
      await a.rollback();
      await b.rollback();
    }
  };
  const sr = await stockRace();
  t.same([sr.a1.ok, sr.st2, sr.b1.ok, sr.b1.error], [true, 'blocked', false, 'insufficient_stock'], 'فاتورتان لآخر رصيد: الثانية تنتظر الأولى ثمّ ترى النقص');

  // ── ١١) الثوابت وضوابطها ──────────────────────────────────────────────────────────────────────────────────────
  t.same(await db.asService((q) => verifyMap(q, 'verify_sales')), { sale_shape: 0, sale_moves: 0, sale_entries: 0, sale_orphans: 0, sale_numbers: 0 },
    'verify_sales صفر: متعدّدة ونقديّة وقديمة وملغاة ومردود ساقها');
  t.same([await zeroOf('verify_money'), await zeroOf('verify_stock'), await zeroOf('verify_ledger')], [[], [], []], 'verify_money وverify_stock وverify_ledger صفر');
  const planted = async (statements, fn) => db.asOwner(async (q) => {
    for (const [sql, params] of statements) await q(sql, params);
    return verifyMap(q, fn);
  });
  const swapped = await planted([
    ['update public.sales_lines set invoice_discount_share = 1145, line_total = 102855 where id = $1', [A.lines[0].line_id]],
    ['update public.sales_lines set invoice_discount_share = 201, line_total = 18159 where id = $1', [A.lines[1].line_id]],
  ], 'verify_sales');
  t.eq(swapped.sale_shape, 1, `ضابط: أنصبة خصم فاتورة بغير أكبر الباقي تُمسك (sale_shape، ${JSON.stringify(swapped)})`);
  const lineOff = await planted([['update public.sales_lines set line_total = line_total + 1 where id = $1', [A.lines[2].line_id]]], 'verify_sales');
  t.eq(lineOff.sale_shape, 1, 'ضابط: صافي سطر بغير الإجماليّ ناقص الخصمين يُمسك (sale_shape)');
  const legOff = await planted([['update public.sales_payments set amount = amount + 1 where sale_id = $1 and leg_no = 1', [E.sale]]], 'verify_sales');
  t.eq(legOff.sale_entries, 1, 'ضابط: ساق بغير مبلغ قيدها وحركتها، ومجموع سيقان بغير المدفوع، يُمسك (sale_entries)');
  const walkOff = await planted([["select set_config('app.walk_in_sale', 'on', true)"],
    ["insert into public.party_entries (org_id, party_id, book_id, kind, amount, on_date) values ($1, $2, $3, 'adjustment', 500, $4)", [org, walkParty, B.medicine, TODAY]]], 'verify_sales');
  t.eq(walkOff.sale_entries, 2, 'ضابط: رصيد للزبون النقديّ، وقيد عليه من غير فاتورة نقديّة، يُمسكان (sale_entries = 2)');
  const orphanMove = await planted([[`update public.sales_payments set cash_move_id = (select m.id from public.cash_moves m where m.reverses_move_id =
      (select g.cash_move_id from public.sales_payments g where g.sale_id = $1 and g.leg_no = 2)) where sale_id = $1 and leg_no = 1`, [E.sale]]], 'verify_sales');
  t.eq(orphanMove.sale_orphans, 1, 'ضابط: حركة صندوق بمستند بيع لا تشير إليها ساق تُمسك (sale_orphans)');

  // ── ١٢) الطفرات: كلّ قاعدة بتطبيق بديل معقول يكسرها، فيفشل فحصها ───────────────────────────────────────────────────────────
  const code = (expected, hint) => (r) => !r.ok && r.code === expected && (!hint || r.hint.includes(hint));
  const okWith = (pick, value) => (r) => r.ok && JSON.stringify(pick(r.value)) === JSON.stringify(value);
  // sale_catalog لواجهة البيع: sold_30d = الفواتير المرحَّلة من المخزن في آخر 30 يوماً وفيها المادّة (الملغاة خارجها)، وis_default = الوحدة الافتراضية في item_units.
  const catNow = (await read(U.owner, CAT, [W.feed])).items;
  const soldIndep = await db.asUser(U.owner, async (q) => (await q("select l.item_id, count(distinct l.sale_id)::int as n from public.sales_lines l join public.sales_invoices s on s.org_id = l.org_id and s.id = l.sale_id where s.warehouse_id = $1 and s.status = 'posted' and s.sold_on > $2::date - 30 group by l.item_id", [W.feed, TODAY])).rows);
  const unitDefaults = await db.asUser(U.owner, async (q) => (await q('select item_id, label from public.item_units where is_default and for_sale and archived_at is null')).rows);
  const soldOf = (id) => soldIndep.find((r) => r.item_id === id)?.n ?? 0;
  t.same(catNow.map((c) => [c.name, c.sold_30d, c.units.filter((u) => u.is_default).map((u) => u.label)]),
    catNow.map((c) => [c.name, soldOf(c.item_id), unitDefaults.filter((d) => d.item_id === c.item_id).map((d) => d.label)]),
    'sale_catalog: الأكثر بيعاً (sold_30d) من الفواتير المرحَّلة في آخر 30 يوماً من المخزن، والوحدة الافتراضية لكلّ مادّة');
  t.ok(soldOf(I.starter) > 0 && catNow.some((c) => c.units.some((u) => u.is_default)), 'ضابط: علف بادئ مبيع في المدّة، ومادّة لها وحدة افتراضية');
  const v2As = (user, o) => async ({ attempt }) => attempt(user, async (q) => (await q(V2, args(o))).rows[0].v);
  const lrLines = () => [line(I.grower, 3, '35000', { discount: 1000 }), line(I.grower, '25.5', '720'), line(I.grower, 2, '30000', { discount: 500 })];
  const CASES = [
    {
      name: 'خصم الفاتورة بأكبر الباقي على صافي السطر بعد خصمه',
      fns: [[FN.v2, [['array(select v_gross[y] - v_disc[y] from generate_series', 'array(select v_gross[y] from generate_series']]]],
      run: v2As(U.owner, { party: P.late, lines: lrLines(), discount: 2000 }),
      expect: okWith((v) => v.lines.map((l) => norm(l.line_total)), ['102856', '18158', '58846']),
    },
    {
      name: 'المدفوع لا يزيد على الصافي',
      fns: [[FN.v2, [['  if v_paid > v_total then\n', '  if false then\n']]]],
      run: v2As(U.owner, { party: P.late, lines: [line(I.grower, 1, '600')], payments: [leg(BX.cash, 700)] }),
      expect: code('overpaid'),
    },
    {
      name: 'الزبون النقديّ يدفع كلّه',
      fns: [[FN.v2, [['  if v_walk_in and v_paid <> v_total then\n', '  if false then\n']]]],
      run: v2As(U.owner, { party: null, lines: [line(I.grower, 1, '600')], payments: [leg(BX.cash, 100)] }),
      expect: code('walk_in_unpaid'),
    },
    {
      name: 'النقص بعد جمع سطور المادّة الواحدة',
      fns: [[FN.v2, [['sum(y.q) as need', 'max(y.q) as need']]]],
      run: v2As(U.owner, { party: P.late, lines: [line(I.race, 8, '600'), line(I.race, 5, '600')] }),
      expect: code('insufficient_stock', 'طلبت 13 كغم'),
    },
    {
      name: 'السيقان مخصَّصة لهذه الفاتورة (لا للأقدم)',
      fns: [[FN.v2, [['    perform private.allocate_entry(pay.id, e.id);\n', '    perform private.allocate_entry(pay.id, null);\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q(V2, args({ party: P.late, lines: [line(I.grower, 1, '600')] }));
        const sale = uid();
        await q(V2, args({ sale, party: P.late, lines: [line(I.grower, 2, '600')], payments: [leg(BX.cash, 1000)] }));
        return norm((await q(DT, [sale])).rows[0].v.open);
      }),
      expect: okWith((v) => v, '200'),
    },
    {
      // party_for_post يرفض الحساب قبل أيّ قيد (مراجعة 0033 B4)، فالمحفّز يُمتحن بما يكتب عليه دون party_for_post: «ألغِ القبض» لساق فاتورة نقديّة قائمة.
      name: 'حساب الزبون النقديّ لا يُكتب عليه إلّا من فاتورته',
      fns: [[FN.guard, [["current_setting('app.walk_in_sale', true) is distinct from 'on'", 'false']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q('select public.void_party_payment($1, $2, $3) as v', [legOfWalkA, 'ضابط', uid()])).rows[0].v),
      expect: code('walk_in_party'),
    },
    {
      name: 'party_for_post يرفض حساب الزبون النقديّ (مراجعة 0033 B4)',
      fns: [[FN.partyForPost, [['  if p.system_kind is not null then\n', '  if false then\n']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q("select public.preview_party_allocation($1, $2, 'payment', 1000) as v", [walkParty, B.medicine])).rows[0].v),
      expect: code('walk_in_party', 'اختر جهة باسمها'),
    },
    {
      name: 'مسوّدة الاستلام لا تأخذ حساب الزبون النقديّ مورّداً (مراجعة 0033 B4)',
      fns: [[FN.partyNotSystem, [['  if v_party is not null and', '  if false and']]]],
      run: async ({ attempt }) => attempt(U.storekeeper, async (q) => (await q("insert into public.receipts (warehouse_id, received_on, party_id, status) values ($1, $2, $3, 'draft') returning id",
        [W.feed, TODAY, walkParty])).rows[0].id),
      expect: code('walk_in_party'),
    },
    {
      name: 'صفّ حساب الزبون النقديّ لا يُعدَّل (مراجعة 0033 B4)',
      fns: [[FN.partiesGuard, [['  if old.system_kind is not null then\n', '  if false then\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q('update public.parties set phone = null')).rowCount),
      expect: code('walk_in_party'),
    },
    {
      name: 'إلغاء النقديّة يردّ سيقانها',
      fns: [[FN.void, [['    if x.walk_in then\n      v_rev := private.void_entry', '    if false then\n      v_rev := private.void_entry']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const sale = uid();
        await q(V2, args({ sale, party: null, wh: W.general, lines: [line(I.diesel, 2, '1000')], payments: [leg(BX.cash, 2000)] }));
        return norm((await q(VS, [sale, 'ضابط', uid()])).rows[0].v.money.payment_refunded);
      }),
      expect: okWith((v) => v, '2000'),
    },
    {
      name: 'الإعادة بالمعرّف تقارن المحتوى',
      fns: [[FN.v2, [['private.sale_v2_content(x.id) = v_content', 'true']]]],
      run: v2As(U.keeperGeneral, { ...C, ref: uid(), lines: [{ ...C.lines[0], qty: '11' }] }),
      expect: code('id_conflict'),
    },
    {
      name: 'الكمية بالأساس = الكمية × معامل الوحدة',
      fns: [[FN.v2, [['    v_base[k] := round(v_qty[k] * v_factor[k], 3);\n', '    v_base[k] := round(v_qty[k], 3);\n']]]],
      run: v2As(U.owner, { party: P.late, lines: [line(I.grower, 2, '30000', { unit: UN.growerBag })] }),
      expect: okWith((v) => norm(v.lines[0].qty_base), '100'),
    },
    {
      name: 'خصم السطر لا يزيد على مبلغه',
      fns: [[FN.v2, [['    if v_disc[k] > v_gross[k] then\n', '    if false then\n']]]],
      run: v2As(U.owner, { party: P.late, lines: [line(I.grower, 1, '600', { discount: 700 })] }),
      expect: code('bad_discount', 'أكبر من مبلغ سطره'),
    },
    {
      name: 'خصم الفاتورة لا يزيد على صافي سطورها',
      fns: [[FN.v2, [['  if v_inv > v_sum then\n', '  if false then\n']]]],
      run: v2As(U.owner, { party: P.late, lines: [line(I.grower, 1, '600')], discount: 700 }),
      expect: code('bad_discount'),
    },
    {
      name: 'الإلغاء يعكس سحب كلّ السطور',
      fns: [[FN.void, [["    where z.org_id = v_org and z.doc_kind = 'sale' and z.doc_id = x.id and z.reverses_move_id is null\n",
        "    where z.org_id = v_org and z.doc_kind = 'sale' and z.doc_id = x.id and z.reverses_move_id is null\n      and z.doc_line_id = (select l.id from public.sales_lines l where l.sale_id = x.id order by l.line_no limit 1)\n"]]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const sale = uid();
        await q(V2, args({ sale, party: P.late, lines: [line(I.grower, 1, '600'), line(I.starter, 1, '700')] }));
        return (await q(VS, [sale, 'ضابط', uid()])).rows[0].v.reversed_moves;
      }),
      expect: okWith((v) => v, 2),
    },
    {
      name: 'المبيعات بلا افتراض سطر واحد',
      fns: [[FN.overview, [['      where l.org_id = s.org_id and l.sale_id = s.id\n    ) as k\n', '      where l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1\n    ) as k\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(OV, [day(-7), TODAY])).rows[0].v.rows.find((r) => r.id === A.sale).lines_count),
      expect: okWith((v) => v, 3),
    },
    {
      name: 'المبيعات تعدّ الموادّ المختلفة لا السطور (مراجعة D8)',
      fns: [[FN.overview, [['count(distinct l.item_id)::int as items', 'count(l.item_id)::int as items']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(OV, [day(-7), TODAY])).rows[0].v.rows.find((r) => r.id === A.sale).items_count),
      expect: okWith((v) => v, 2),
    },
    {
      name: 'التقرير يعدّ الفواتير لا السطور',
      fns: [[FN.report, [['count(distinct r.sale_id)::int as count', 'count(*)::int as count']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => [(await q(RE, [day(-7), TODAY, 'party'])).rows[0].v.rows.find((r) => r.key === P.farm).count,
        (await q("select count(*)::int as n from public.sales_invoices where party_id = $1 and status = 'posted'", [P.farm])).rows[0].n]),
      expect: (r) => r.ok && r.value[0] === r.value[1] && r.value[1] >= 4,
    },
    {
      name: 'verify_sales: الأنصبة بأكبر الباقي بالضبط',
      fns: [[FN.verify, [['      else k.share_list <> private.alloc_lr(s.invoice_discount, k.weights, 0) end', '      else false end']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q('alter table public.sales_lines disable trigger user');
        await q('update public.sales_lines set invoice_discount_share = invoice_discount_share + 1, line_total = line_total - 1 where id = $1', [A.lines[0].line_id]);
        await q('update public.sales_lines set invoice_discount_share = invoice_discount_share - 1, line_total = line_total + 1 where id = $1', [A.lines[1].line_id]);
        return (await q("select violations::int as v from public.verify_sales() where check_name = 'sale_shape'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 1),
    },
    {
      name: 'verify_sales: رصيد الزبون النقديّ صفر',
      fns: [[FN.verify, [['group by e.org_id, e.party_id, e.book_id having sum(e.amount) <> 0', 'group by e.org_id, e.party_id, e.book_id having false']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q("select set_config('app.walk_in_sale', 'on', true)");
        await q("insert into public.party_entries (org_id, party_id, book_id, kind, amount, on_date) values ($1, $2, $3, 'adjustment', 500, $4)", [org, walkParty, B.medicine, TODAY]);
        return (await q("select violations::int as v from public.verify_sales() where check_name = 'sale_entries'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 2),
    },
    {
      name: 'record_sale القديمة تكتب ساقها',
      fns: [[FN.legacy, [['  if pay.id is not null then\n    insert into public.sales_payments', '  if false then\n    insert into public.sales_payments']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q(RS, legacyArgs({ item: I.grower, qty: 1, price: 600, payment: 'cash', box: BX.cash }));
        return (await q("select violations::int as v from public.verify_sales() where check_name = 'sale_entries'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 0),
    },
    {
      name: 'المدفوع الآن بلا الساق المردودة',
      fns: [[FN.paid, [['coalesce(sum(g.amount) filter (where not g.rev), 0)', 'coalesce(sum(g.amount), 0)']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => norm((await q(DT, [E.sale])).rows[0].v.paid)),
      expect: okWith((v) => v, '1000'),
    },
    {
      name: 'sale_catalog: الأكثر بيعاً من المرحَّلة وحدها (فاتورة A ملغاة)',
      fns: [[FN.catalog, [["and s.status = 'posted' and s.sold_on > v_today - 30", 'and s.sold_on > v_today - 30']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(CAT, [W.feed])).rows[0].v.items.find((c) => c.item_id === I.starter).sold_30d),
      expect: okWith((v) => v, soldOf(I.starter)),
    },
    {
      name: 'sale_catalog بوحدات البيع الفعّالة وحدها',
      fns: [[FN.catalog, [['u.for_sale and u.archived_at is null', 'true']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(CAT, [W.feed])).rows[0].v.items.find((c) => c.item_id === I.starter).units.map((u) => u.label)),
      expect: okWith((v) => v, ['كيس 50 كغم', 'طنّ']),
    },
  ];
  const mutationOutcomes = [];
  for (const c of CASES) {
    const realOutcome = await mutant(db, U.manager, [], c.run);
    const broken = await mutant(db, U.manager, c.fns, c.run);
    mutationOutcomes.push({ name: c.name, real: c.expect(realOutcome), caught: !c.expect(broken), realOutcome, broken });
  }
  const show = (o) => (o.ok ? `ok:${JSON.stringify(o.value)?.slice(0, 80)}` : `${o.code} (${o.hint.slice(0, 60)})`);
  t.same(mutationOutcomes.filter((o) => !o.real).map((o) => `${o.name}: ${show(o.realOutcome)}`), [], `الطفرات (${CASES.length}): كلّ حالة على الشفرة الحقيقية بنتيجتها`);
  t.same(mutationOutcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${show(o.broken)}`), [], `الطفرات: ${mutationOutcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت`);

  // ── ١٣) تحصيل لاحق لدين فاتورة (مراجعة 0033 A1): دينها بالسيقان كما هو، والمتبقّي من قيدها (open) ينقص؛ والملغاة بلا دين ولا متبقٍّ ───────
  const bookC = (await db.admin('select book_id from public.sales_invoices where id = $1', [C.sale])).rows[0].book_id;
  const collected = await call(db, U.manager, 'select public.record_party_payment($1, $2, $3, 4000, $4, $5, $6) as v', [uid(), P.farm, bookC, BX.cash, TODAY, uid()]);
  const detailC = await read(U.owner, DT, [C.sale]);
  const lateOverview = await read(U.owner, OV, [day(-7), TODAY]);
  const lateRow = (sale) => lateOverview.rows.find((r) => r.id === sale);
  t.same([collected.ok, norm(detailC.debt), norm(detailC.open), norm(lateRow(C.sale).debt), norm(lateRow(C.sale).open), [lateRow(A.sale).status, norm(lateRow(A.sale).debt),
    norm(lateRow(A.sale).open), lateRow(A.sale).can_void], [lateRow(walkB.sale).status, norm(lateRow(walkB.sale).debt)],
  norm(lateOverview.totals.open) === String(lateOverview.rows.filter((r) => r.status === 'posted').reduce((sum, r) => sum + Number(r.open), 0))],
  [true, '10000', '6000', '10000', '6000', ['void', '0', '0', false], ['void', '0'], true],
  'تحصيل 4,000 لاحق لفاتورة بالدين: الدين (الصافي − السيقان) 10,000 كما هو والمتبقّي 6,000 في التفصيل وصفّ القائمة؛ والملغاة بلا دين ولا متبقٍّ ولا «ألغِ»؛ وtotals.open مجموع المرحَّلة');

  // ── عيّنات حقيقية للشاشات ─────────────────────────────────────────────────────────────────────────────────────
  if (process.env.SALES_SAMPLES_OUT) {
    const sample = {
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/sales-invoice.test.mjs بـSALES_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات.`,
      sale_catalog: { storekeeper_feed: catFeedAll, owner_medicine: await read(U.owner, CAT, [W.medicine]) },
      record_sale_v2: { storekeeper_multi_partial: soldA.value, owner_fifo_two_lots: soldF.value, owner_walk_in: race.a1.rows?.[0]?.v, storekeeper_walk_in_two_boxes: soldWalkB,
        keeper_credit: soldC.value, keeper_free: soldD.value },
      record_sale_legacy: soldL.value,
      void_sale: { manager_multi_kept: voidedA.value, owner_walk_in_refunded: voidedWalk.value },
      sale_detail: { storekeeper_multi: keeperA, owner_multi: ownerA, owner_walk_in: ownerWalk, owner_legacy: ownerLegacy, owner_refunded_leg: detailE,
        owner_multi_after_void: await read(U.owner, DT, [A.sale]), owner_walk_in_after_void: await read(U.owner, DT, [walkB.sale]), owner_collected_later: detailC },
      sales_overview: { owner: ownerOverview, storekeeper: await read(U.storekeeper, OV, [day(-7), TODAY]), owner_after_collect_and_void: lateOverview },
      sales_report: { owner_party: byParty, owner_item: byItem },
      entry_detail: { invoice: invoiceEntry, leg: legEntry },
      refusals: samples.refusals,
    };
    writeFileSync(FIXTURE, `${JSON.stringify(sample, null, 2)}\n`);
    t.ok(true, `العيّنات كُتبت في ${FIXTURE}`);
  }
}
