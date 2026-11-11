// البيع (0021؛ كلمة المالك 2026-11-08، DECISIONS «حذف المادّة، والرجوع، والسعر الاختياريّ، والتحويل، والبيع» و«قيد البيع بنوع invoice، وإلغاء
// البيع النقديّ يُبقي المقبوض رصيداً للزبون»): record_sale بنداء واحد يُحفظ فوراً — سحب بترتيب السحب بحركات sale وكلفة السطر = قيمة السحب
// بالضبط، وقيد invoice للجهة في دفتر وحدة المخزن، والنقد قيد payment على فاتورته أوّلاً وحركة party_payment، والرقم بنوع المخزن (FD وMD وMS)،
// والتسليم بلا مقابل بلا قيد؛ وvoid_sale يعكس الحركات وقيد الفاتورة ويُبقي القبض رصيداً (payment_kept)؛ والقرّاء بالمبلغ لأدوار المبيعات والكلفة
// والربح لأدوار الكلفة وحدها؛ وكلّ رفض بتلميحه؛ والإعادة بالمرجع أو بالمعرّف؛ والتزامن على آخر رصيد؛ وverify_sales وverify_stock بضوابط؛
// وطفرات تكسر كلّ قاعدة فيفشل فحصها (آخر الملف).
import { writeFileSync } from 'node:fs';
import { balance, call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { lotsOf, postedOpening, postedTransfer } from './stock-kit.mjs';

const TODAY = '2026-11-08';
const id = (n) => `b1940000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099940${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const RS = 'select public.record_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as v';
const VS = 'select public.void_sale($1, $2, $3) as v';
const OV = 'select public.sales_overview($1, $2) as v';
const DT = 'select public.sale_detail($1) as v';
const RE = 'select public.sales_report($1, $2, $3) as v';
const FN = {
  record: 'public.record_sale(uuid, uuid, uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid)',
  void: 'public.void_sale(uuid, text, uuid)',
  kind: 'private.sale_doc_kind(text)',
  view: 'private.sale_view(jsonb)',
  verify: 'public.verify_sales()',
  verifyStock: 'public.verify_stock()',
};

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
  // ── المنشأة: الأدوار الثمانية، وأمين بنطاق المعمل والمخازن العامّة، وأمين بالعامّة وحدها، وأمين بمخزن المواد وحده (دفتر وحدته خارج نطاقه) ────
  const G = await makeOrg(db, {
    name: 'مزرعة المبيعات',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill', 'general']],
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
  const millSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.raw])).rows[0].site_id;
  const item = (name, kind, unit, extra = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry) values ($1, $2, $3, $4) returning id', [name, kind, unit, extra.tracksExpiry ?? false]);
  const I = {
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    starter: await item('علف بادئ', 'feed', 'kg'),
    vaccine: await item('لقاح نيوكاسل', 'vaccine', 'pc', { tracksExpiry: true }),
    diesel: await item('كاز', 'fuel', 'L'),
    race: await item('نخالة التزامن', 'raw', 'kg'),
    chicks: await item('أفراخ لحم', 'chick', 'pc'),
    old: await item('مادّة مؤرشفة', 'raw', 'kg'),
  };
  await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [I.old]);
  await postedOpening(db, U.owner, W.raw, day(-5), [{ item: I.corn, qty: 1000, value: '450000.00' }, { item: I.race, qty: 50, value: '10000.00' }]);
  await postedOpening(db, U.owner, W.feed, day(-5), [{ item: I.starter, qty: 500, value: '300000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-5), [{ item: I.vaccine, qty: 100, value: '50000.00', expiry: '2027-06-30' }]);
  await postedOpening(db, U.owner, W.general, day(-5), [{ item: I.diesel, qty: 200, value: '160000.00' }]);
  const party = (name) => one(U.owner, 'insert into public.parties (name, is_customer) values ($1, true) returning id', [name]);
  const P = { ahmad: await party('أبو أحمد'), company: await party('شركة الدواجن'), gone: await party('زبون قديم') };
  await one(U.owner, 'update public.parties set archived_at = now() where id = $1 returning id', [P.gone]);
  const box = await one(U.owner, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");

  const samples = { refusals: {} };
  const refusal = (key, result) => {
    if (!result.ok) samples.refusals[key] = { code: result.code, hint: result.hint };
    return result;
  };
  const args = (o) => [o.ref ?? uid(), o.sale === undefined ? uid() : o.sale, o.line === undefined ? uid() : o.line, o.party === undefined ? P.ahmad : o.party,
    o.item, o.qty, o.price, o.on ?? TODAY, o.payment ?? 'credit', o.box ?? null, o.wh ?? null];
  const sell = (user, o, options) => call(db, user, RS, args(o), options);
  const unsell = (user, sale, reason = 'بيع خاطئ', ref = uid()) => call(db, user, VS, [sale, reason, ref]);
  const lots = async (itemId, wh) => (await lotsOf(db, itemId, wh)).map((l) => [l.source_kind, l.qty_left, l.value_left]);
  const entriesOf = async (sale) => (await db.admin(`select kind, amount::text as amount, book_id, doc_no, reverses_entry_id is not null as reversal
    from public.party_entries where doc_kind = 'sale' and doc_id = $1 order by seq`, [sale])).rows;

  // ── ١) البيع بالدين (الأمين): علف بادئ 100 كغم بـ750 ─────────────────────────────────────────────────────────────
  const s1 = { ref: uid(), sale: uid(), line: uid(), item: I.starter, qty: 100, price: 750 };
  const sold1 = await sell(U.storekeeper, s1);
  t.same([sold1.ok, sold1.value?.doc_no, sold1.value?.payment, sold1.value?.warehouse_id, norm(sold1.value?.money?.line_total), norm(sold1.value?.money?.unit_price),
    costMoney(sold1.value), sold1.value?.free], [true, 'FD-2026-0001', 'credit', W.feed, '75000', '750', false, false],
  `الأمين يبيع 100 كغم علف بالدين: FD من مخزن العلف (الوحيد)، والمبلغ ظاهر له، والكلفة والربح مخفيّان (${sold1.code ?? ''} ${sold1.hint ?? ''})`);
  t.same(await lots(I.starter, W.feed), [['opening', '400', '240000']], 'السحب من دفعة العلف بقيمتها (100 × 600)');
  t.same((await entriesOf(s1.sale)).map((e) => [e.kind, e.amount, e.book_id === B.feed_mill, e.doc_no]), [['invoice', '75000', true, 'FD-2026-0001']],
    'قيد فاتورة للجهة +75,000 في دفتر وحدة المعمل برقم البيع، ولا قبض');
  t.eq((await db.admin("select count(*)::int as n from public.cash_moves where doc_kind = 'sale' and doc_id = $1", [s1.sale])).rows[0].n, 0, 'بالدين: لا حركة صندوق');
  t.eq((await db.admin('select cost::text as c from public.sales_line_costs where line_id = $1', [s1.line])).rows[0].c, '60000.00', 'كلفة السطر = قيمة السحب بالضبط');

  // ── ٢) البيع نقداً (المالك): ذرة 200 كغم بـ600 من مخزن المواد (MS) ─────────────────────────────────────────────────────
  const s2 = { ref: uid(), sale: uid(), line: uid(), party: P.company, item: I.corn, qty: 200, price: 600, payment: 'cash', box };
  const sold2 = await sell(U.owner, s2);
  t.same([sold2.ok, sold2.value?.doc_no, norm(sold2.value?.money?.paid_now), norm(sold2.value?.cost?.money?.cost), norm(sold2.value?.cost?.money?.profit)],
    [true, 'MS-2026-0001', '120000', '90000', '30000'], `المالك يبيع 200 كغم ذرة نقداً: MS، والمقبوض 120,000، والكلفة 90,000 والربح 30,000 له (${sold2.code ?? ''})`);
  t.same((await entriesOf(s2.sale)).map((e) => [e.kind, e.amount]), [['invoice', '120000'], ['payment', '-120000']], 'قيد فاتورة وقيد قبض بمستند البيع');
  t.same([await balance(db, P.company, B.feed_mill), (await db.admin("select amount::text as a, kind from public.cash_moves where doc_kind = 'sale' and doc_id = $1", [s2.sale])).rows],
    ['0', [{ a: '120000', kind: 'party_payment' }]], 'رصيد الجهة صفر (القبض على فاتورته)، وحركة صندوق party_payment +120,000');

  // ── ٣) الأدوية (MD)، والتسليم بلا مقابل (MS الثانية) ──────────────────────────────────────────────────────────────
  const s3 = { sale: uid(), item: I.vaccine, qty: 10, price: 800, party: P.ahmad };
  const sold3 = await sell(U.owner, s3);
  t.same([sold3.ok, sold3.value?.doc_no, norm(sold3.value?.money?.line_total)], [true, 'MD-2026-0001', '8000'], 'بيع لقاح من مخزن الأدوية: MD');
  const s4 = { sale: uid(), item: I.diesel, qty: 10, price: 0 };
  const sold4 = await sell(U.storekeeper, s4);
  t.same([sold4.ok, sold4.value?.doc_no, sold4.value?.free, norm(sold4.value?.money?.line_total), (await entriesOf(s4.sale)).length],
    [true, 'MS-2026-0002', true, '0', 0], 'تسليم بلا مقابل (السعر صفر): يُحفظ بلا قيد للجهة، والكلفة تخرج بقيمتها');
  t.eq((await db.admin('select cost::text as c from public.sales_line_costs where sale_id = $1', [s4.sale])).rows[0].c, '8000.00', 'كلفة التسليم بلا مقابل 10 × 800');

  // ── ٤) الإعادة ─────────────────────────────────────────────────────────────────────────────────────────────────
  const again = await sell(U.storekeeper, s1);
  t.same([again.ok, again.value], [true, sold1.value], 'الإعادة بالمرجع نفسه ترجع النتيجة نفسها (المبلغ ظاهر، والكلفة مخفيّة)');
  const sameIds = await sell(U.storekeeper, { ...s1, ref: uid() });
  t.same([sameIds.ok, sameIds.value?.doc_no], [true, 'FD-2026-0001'], 'الإعادة بالمعرّفات نفسها ومرجع جديد ترجع ما حُفظ');
  t.eq(shownOf(refusal('id_conflict', await sell(U.storekeeper, { ...s1, ref: uid(), qty: 101 }))), 'id_conflict', 'المعرّف نفسه بكمية أخرى: id_conflict');
  t.eq(shownOf(refusal('ref_reused', await sell(U.storekeeper, { ...s1, qty: 99 }))), 'ref_reused', 'المرجع نفسه بمحتوى آخر: ref_reused');

  // ── ٥) الرفض ─────────────────────────────────────────────────────────────────────────────────────────────────
  await postedTransfer(db, U.owner, W.feed, (await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن علف ثانٍ', 'feed') returning id",
    [G.divisions.feed_mill, millSite])), TODAY, [{ item: I.starter, qty: 50 }]);
  const R = {
    not_sellable: await sell(U.owner, { item: I.chicks, qty: 1, price: 100 }),
    item_archived: await sell(U.owner, { item: I.old, qty: 1, price: 100 }),
    item_not_found: await sell(U.owner, { item: uid(), qty: 1, price: 100 }),
    id_required: await sell(U.owner, { sale: null, item: I.corn, qty: 1, price: 100 }),
    qty_not_positive: await sell(U.owner, { item: I.corn, qty: 0, price: 100 }),
    pieces_not_whole: await sell(U.owner, { item: I.vaccine, qty: 1.5, price: 100 }),
    bad_price: await sell(U.owner, { item: I.corn, qty: 1, price: 1.234 }),
    total_zero: await sell(U.owner, { item: I.corn, qty: 0.001, price: 0.4 }),
    bad_payment: await sell(U.owner, { item: I.corn, qty: 1, price: 100, payment: 'card' }),
    price_required_for_cash: await sell(U.owner, { item: I.corn, qty: 1, price: 0, payment: 'cash', box }),
    cash_account_required: await sell(U.owner, { item: I.corn, qty: 1, price: 100, payment: 'cash' }),
    party_not_found: await sell(U.owner, { party: uid(), item: I.corn, qty: 1, price: 100 }),
    party_archived: await sell(U.owner, { party: P.gone, item: I.corn, qty: 1, price: 100 }),
    insufficient_stock: await sell(U.owner, { item: I.corn, qty: 99999, price: 100 }),
    store_required: await sell(U.owner, { item: I.starter, qty: 1, price: 100 }),
    item_kind_mismatch: await sell(U.owner, { item: I.starter, qty: 1, price: 100, wh: W.general }),
    out_of_scope: await sell(U.keeperGeneral, { item: I.starter, qty: 1, price: 100, wh: W.feed }),
    forbidden: await sell(U.hallWorker, { item: I.corn, qty: 1, price: 100 }),
    date_in_future: await sell(U.owner, { item: I.corn, qty: 1, price: 100, on: day(1) }),
  };
  for (const [key, result] of Object.entries(R)) refusal(`sale.${key}`, result);
  t.same(Object.fromEntries(Object.entries(R).map(([key, result]) => [key, shownOf(result)])), Object.fromEntries(Object.keys(R).map((key) => [key, key])),
    'رفض البيع: كلّ حالة برمزها');
  t.ok(R.insufficient_stock.hint.includes('عندك 800 كغم'), `النقص يسمّي «عندك» (${R.insufficient_stock.hint})`);
  t.ok(R.store_required.hint.includes('«رصيد العلف»') && R.store_required.hint.includes('«مخزن علف ثانٍ»'), `أكثر من مخزن: يسمّيهما (${R.store_required.hint})`);
  const bookScope = refusal('out_of_scope_book', await sell(U.keeperRaw, { item: I.corn, qty: 1, price: 100, wh: W.raw }));
  t.same([bookScope.code, bookScope.hint.includes('خارج نطاقك')], ['out_of_scope', true], 'الأمين بمخزن المواد وحده: دفتر وحدته خارج نطاقه (out_of_scope)');
  t.same([shownOf(await sell(U.millOperator, { item: I.starter, qty: 1, price: 100, wh: W.feed })), shownOf(await sell(U.viewer, { item: I.corn, qty: 1, price: 100 }))],
    ['forbidden', 'forbidden'], 'مشغّل المعمل والمشاهد لا يبيعان (sale.record)');
  t.eq(shownOf(await sell(U.owner, { item: I.corn, qty: 1, price: 100, payment: 'credit', box })), 'bad_payment', 'بالدين بصندوق: bad_payment');

  // ── ٦) ملفّ المادّة: «بِع» ──────────────────────────────────────────────────────────────────────────────────────
  const fileOf = async (user, itemId) => (await call(db, user, 'select public.item_file($1) as v', [itemId], { commit: false })).value;
  const keeperRawFile = await fileOf(U.keeperRaw, I.corn);
  t.same([(await fileOf(U.storekeeper, I.starter)).can_sell, keeperRawFile.can_sell, keeperRawFile.cash_accounts, (await fileOf(U.hallWorker, I.starter)).can_sell,
    (await fileOf(U.storekeeper, I.starter)).cash_accounts.map((c) => c.name)], [true, false, [], false, ['الصندوق']],
  'ملفّ المادّة: «بِع» لمن يبيع منها فعلاً (الأمين بمخزن المواد وحده لا، فلا صناديق له)، والصناديق للبائع');

  // ── ٧) إلغاء البيع ────────────────────────────────────────────────────────────────────────────────────────────
  t.eq(shownOf(await unsell(U.storekeeper, s2.sale)), 'forbidden', 'الأمين لا يلغي (void)');
  const voided2 = await unsell(U.manager, s2.sale);
  t.same([voided2.ok, voided2.value?.status, voided2.value?.reversed_moves, norm(voided2.value?.money?.payment_kept), voided2.value?.voided_on],
    [true, 'void', 1, '120000', TODAY], 'المدير يلغي البيع النقديّ: حركة عكسية، والمقبوض 120,000 باقٍ رصيداً للجهة');
  t.same([await lots(I.corn, W.raw), await balance(db, P.company, B.feed_mill),
    (await db.admin("select coalesce(sum(amount), 0)::text as s from public.cash_moves where doc_kind = 'sale' and doc_id = $1", [s2.sale])).rows[0].s],
  [[['opening', '1000', '450000']], '-120000', '120000'], 'الذرة رجعت بقيمتها، والجهة دائنة 120,000، والصندوق كما هو');
  const payEntry = voided2.value.payment_entry_id;
  const refund = await call(db, U.manager, 'select public.void_party_payment($1, $2, $3) as v', [payEntry, 'ردّ المبلغ للزبون', uid()]);
  t.same([refund.ok, await balance(db, P.company, B.feed_mill), (await db.admin("select coalesce(sum(amount), 0)::text as s from public.cash_moves where doc_kind = 'sale' and doc_id = $1", [s2.sale])).rows[0].s],
    [true, '0', '0'], '«ألغِ القبض» القائمة تردّ المقبوض: رصيد الجهة صفر والصندوق صفر');
  t.eq(shownOf(refusal('already_void', await unsell(U.manager, s2.sale))), 'already_void', 'إلغاء ثانٍ: already_void');
  t.eq(shownOf(refusal('doc_not_found', await unsell(U.manager, uid()))), 'doc_not_found', 'بيع غير موجود: doc_not_found');
  const redo = await sell(U.owner, s2);
  t.same([redo.code, redo.hint.includes('أُلغي')], ['id_conflict', true], 'إعادة بيع أُلغي بمرجعه: id_conflict «أُلغي»');
  const voided3 = await unsell(U.manager, s3.sale);
  t.same([voided3.ok, norm(voided3.value?.money?.payment_kept), await balance(db, P.ahmad, B.medicine)], [true, '0', '0'], 'إلغاء بيع بالدين: قيد الفاتورة يُعكس، ولا مقبوض باقٍ');

  // ── ٨) القرّاء ───────────────────────────────────────────────────────────────────────────────────────────────
  const overview = async (user, from = day(-7), to = TODAY) => call(db, user, OV, [from, to], { commit: false });
  const ownerOverview = (await overview(U.owner)).value;
  t.same([ownerOverview.rows.map((r) => [r.doc_no, r.status]), ownerOverview.totals.count, ownerOverview.totals.voided, norm(ownerOverview.totals.money.revenue),
    norm(ownerOverview.totals.cost.money.cost), norm(ownerOverview.totals.cost.money.profit)],
  [[['MS-2026-0002', 'posted'], ['MD-2026-0001', 'void'], ['MS-2026-0001', 'void'], ['FD-2026-0001', 'posted']], 2, 2, '75000', '68000', '7000'],
  'المبيعات للمالك: الأحدث أوّلاً والملغاة بحالتها، والمجاميع للمرحَّل (75,000، والكلفة 68,000، والربح 7,000)');
  const keeperOverview = (await overview(U.storekeeper)).value;
  t.same([keeperOverview.rows.map((r) => r.doc_no), norm(keeperOverview.totals.money.revenue), costMoney(keeperOverview), keeperOverview.can_record, keeperOverview.can_void],
    [['MS-2026-0002', 'MS-2026-0001', 'FD-2026-0001'], '75000', false, true, false], 'المبيعات للأمين: بنطاقه (بلا الأدوية)، والمبلغ ظاهر، والكلفة والربح مخفيّان');
  t.same([shownOf(await overview(U.hallWorker)), shownOf(await overview(U.owner, TODAY, day(-1)))], ['forbidden', 'period_required'], 'عامل القاعة forbidden، والمدّة مقلوبة period_required');
  const ownerDetail = (await call(db, U.owner, DT, [s1.sale], { commit: false })).value;
  const keeperDetail = (await call(db, U.storekeeper, DT, [s1.sale], { commit: false })).value;
  t.same([ownerDetail.draws.length, norm(ownerDetail.draws[0].cost.money.value), costMoney(keeperDetail), keeperDetail.draws[0].cost, ownerDetail.can_void, keeperDetail.can_void],
    [1, '60000', false, {}, true, false], 'تفصيل البيع: الدفعات المسحوبة بقيمتها للمالك وبلاها للأمين، والإلغاء للمدير والمالك');
  t.eq(shownOf(await call(db, U.keeperGeneral, DT, [s1.sale], { commit: false })), 'out_of_scope', 'تفصيل بيع من مخزن خارج النطاق: out_of_scope');
  const report = async (user, group) => (await call(db, user, RE, [day(-7), TODAY, group], { commit: false })).value;
  const byParty = await report(U.owner, 'party');
  const byItem = await report(U.owner, 'item');
  const byDay = await report(U.owner, 'day');
  t.same([byParty.rows.map((r) => [r.label, r.count, norm(r.money.revenue)]), byItem.rows.map((r) => [r.label, norm(r.qty), r.base_unit]), byDay.rows.map((r) => [r.label, r.count])],
    [[['أبو أحمد', 2, '75000']], [['علف بادئ', '100', 'kg'], ['كاز', '10', 'L']], [['08/11/2026', 2]]], 'التقرير بالجهة وبالمادّة (بالكمية ووحدتها) وباليوم، للمرحَّل وحده');
  t.eq(shownOf(await call(db, U.owner, RE, [day(-7), TODAY, 'week'], { commit: false })), 'bad_group', 'تجميع غير معروف: bad_group');

  // ── ٩) التزامن: بيعان لآخر رصيد — الثاني ينتظر الأوّل ثمّ يرى النقص ────────────────────────────────────────────────────────
  const raceRun = async () => {
    const a = await db.session(U.storekeeper);
    const b = await db.session(U.owner);
    try {
      const a1 = await a.run(RS, args({ item: I.race, qty: 40, price: 300 }));
      const p2 = b.run(RS, args({ item: I.race, qty: 40, price: 300 }));
      const st2 = await db.settle(p2, b.pid);
      await a.commit();
      const a2 = await p2;
      return { a1, st2, a2 };
    } finally {
      await a.rollback();
      await b.rollback();
    }
  };
  const race = await raceRun();
  t.same([race.a1.ok, race.st2, race.a2.ok, race.a2.error], [true, 'blocked', false, 'insufficient_stock'], 'بيعان لآخر رصيد: الثاني ينتظر الأوّل ثمّ يرى النقص');

  // ── ١٠) الثوابت وضوابطها ──────────────────────────────────────────────────────────────────────────────────────
  const verifyMap = async (q, fn) => Object.fromEntries((await q(`select check_name, violations::int as v from public.${fn}()`)).rows.map((r) => [r.check_name, r.v]));
  t.same(await db.asService((q) => verifyMap(q, 'verify_sales')), { sale_shape: 0, sale_moves: 0, sale_entries: 0, sale_orphans: 0, sale_numbers: 0 },
    'verify_sales: صفر على بيانات حقيقية (بالدين ونقداً وبلا مقابل وملغاة وقبض مردود)');
  const zeroOf = async (fn) => Object.entries(await db.asService((q) => verifyMap(q, fn))).filter(([, v]) => v !== 0);
  t.same([await zeroOf('verify_stock'), await zeroOf('verify_ledger')], [[], []], 'verify_stock وverify_ledger: كلّ الفحوص صفر مع البيع');
  const planted = async (statements, fn) => db.asOwner(async (q) => {
    for (const [sql, params] of statements) await q(sql, params);
    return verifyMap(q, fn);
  });
  const costPlus = await planted([['update public.sales_line_costs set cost = cost + 1 where line_id = $1', [s1.line]]], 'verify_sales');
  t.eq(costPlus.sale_moves, 1, 'ضابط: كلفة سطر غير قيمة السحب تُمسك (sale_moves)');
  const stockPlus = await planted([['update public.sales_line_costs set cost = cost + 1 where line_id = $1', [s1.line]]], 'verify_stock');
  t.eq(stockPlus.value_conservation, 1, 'ضابط: كلفة بيع زائدة تكسر حفظ القيمة (value_conservation)');
  const entryPlus = await planted([['alter table public.party_entries disable trigger party_entries_append_only'],
    ["update public.party_entries set amount = amount + 1 where doc_kind = 'sale' and doc_id = $1 and kind = 'invoice'", [s1.sale]]], 'verify_sales');
  t.eq(entryPlus.sale_entries, 1, 'ضابط: قيد فاتورة بغير مبلغها يُمسك (sale_entries)');
  const docNo = await planted([["update public.sales_invoices set doc_no = 'MS-2026-0009' where id = $1", [s1.sale]]], 'verify_sales');
  t.ok(docNo.sale_numbers >= 1, `ضابط: رقم فاتورة بغير نوع مخزنها أو بفجوة يُمسك (sale_numbers = ${docNo.sale_numbers})`);
  const orphan = await planted([["insert into public.party_entries (org_id, party_id, book_id, kind, amount, doc_kind, doc_id, on_date) values ($1, $2, $3, 'adjustment', 1000, 'sale', $4, $5)",
    [org, P.ahmad, B.feed_mill, uid(), TODAY]]], 'verify_sales');
  t.eq(orphan.sale_orphans, 1, 'ضابط: قيد بمستند بيع غير موجود يُمسك (sale_orphans)');

  // ── ١١) الطفرات: كلّ قاعدة أضافتها 0021 بتطبيق بديل معقول يكسرها، فيفشل فحصها ───────────────────────────────────────────────
  const code = (expected, hint) => (r) => !r.ok && r.code === expected && (!hint || r.hint.includes(hint));
  const okWith = (pick, value) => (r) => r.ok && pick(r.value) === value;
  const sellAs = (user, o) => async ({ attempt }) => attempt(user, async (q) => (await q(RS, args(o))).rows[0].v);
  const CASES = [
    {
      name: 'الفعل sale.record',
      fns: [[FN.record, [["  perform private.require('sale.record');\n", '']]]],
      run: sellAs(U.millOperator, { item: I.starter, qty: 1, price: 100, wh: W.feed }),
      expect: code('forbidden'),
    },
    {
      name: 'نطاق دفتر وحدة المخزن (book_for_post)',
      fns: [[FN.record, [['  b := private.book_for_post(private.sale_book(w.id));\n', '  select * into b from public.ledger_books k where k.id = private.sale_book(w.id);\n']]]],
      run: sellAs(U.keeperRaw, { item: I.corn, qty: 1, price: 100, wh: W.raw }),
      expect: code('out_of_scope'),
    },
    {
      name: 'الكلفة = قيمة السحب (لا متوسّط الرصيد)',
      fns: [[FN.record, [['    v_cost := v_cost + dr.value;\n',
        '    v_cost := v_cost + private._mul_div_round2(dr.qty, (select b2.value + dr.value from public.stock_balances b2 where b2.org_id = v_org and b2.item_id = i.id and b2.warehouse_id = w.id), (select b2.qty + dr.qty from public.stock_balances b2 where b2.org_id = v_org and b2.item_id = i.id and b2.warehouse_id = w.id) + 1);\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const o = { sale: uid(), line: uid(), item: I.corn, qty: 300, price: 500 };
        await q(RS, args(o));
        const drawn = (await q("select -sum(value) as v from public.stock_moves where doc_kind = 'sale' and doc_id = $1", [o.sale])).rows[0].v;
        const cost = (await q('select cost from public.sales_line_costs where line_id = $1', [o.line])).rows[0].cost;
        return norm(drawn) === norm(cost);
      }),
      expect: okWith((v) => v, true),
    },
    {
      name: 'القبض النقديّ على فاتورته أوّلاً',
      fns: [[FN.record, [['      perform private.allocate_entry(pay.id, e.id);\n', '      perform private.allocate_entry(pay.id, null);\n']]]],
      run: async ({ attempt }) => {
        const o = { sale: uid(), item: I.corn, qty: 10, price: 500, payment: 'cash', box };
        const sold = await attempt(U.owner, async (q) => (await q(RS, args(o))).rows[0].v);
        if (!sold.ok) return sold;
        return attempt(U.owner, async (q) => norm((await q("select private.entry_remaining(id) as r from public.party_entries where doc_kind = 'sale' and doc_id = $1 and kind = 'invoice'", [o.sale])).rows[0].r), 'postgres');
      },
      expect: okWith((v) => v, '0'),
    },
    {
      name: 'إلغاء البيع يُبقي القبض رصيداً',
      fns: [[FN.void, [['  if x.invoice_entry_id is not null then\n    perform private.void_entry(x.invoice_entry_id, v_reason);\n  end if;\n',
        '  if x.invoice_entry_id is not null then\n    perform private.void_entry(x.invoice_entry_id, v_reason);\n  end if;\n  if x.payment_entry_id is not null then\n    perform private.void_entry(x.payment_entry_id, v_reason);\n  end if;\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const o = { sale: uid(), item: I.corn, qty: 10, price: 500, payment: 'cash', box };
        await q(RS, args(o));
        return norm((await q(VS, [o.sale, 'ضابط', uid()])).rows[0].v.money.payment_kept);
      }),
      expect: okWith((v) => v, '5000'),
    },
    {
      name: 'الرقم بنوع المخزن (العلف FD)',
      fns: [[FN.kind, [["when 'feed' then 'FD' ", "when 'feed' then 'MS' "]]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(RS, args({ item: I.starter, qty: 1, price: 100, wh: W.feed }))).rows[0].v.doc_no.slice(0, 2)),
      expect: okWith((v) => v, 'FD'),
    },
    {
      name: 'التسليم بلا مقابل بلا قيد',
      fns: [[FN.record, [['  if v_total > 0 then\n    e := private.write_entry(', '  if v_total >= 0 then\n    e := private.write_entry(']]]],
      run: sellAs(U.owner, { item: I.diesel, qty: 1, price: 0 }),
      expect: okWith((v) => v.free, true),
    },
    {
      name: 'الكلفة والربح مخفيّان عن غير أدوار الكلفة',
      fns: [[FN.view, [['case when public.can_see_cost() then p else private.strip_cost(p) end', 'p']]]],
      run: sellAs(U.storekeeper, { item: I.diesel, qty: 1, price: 900 }),
      expect: okWith((v) => costMoney(v), false),
    },
    {
      name: 'verify_sales: الكلفة = قيمة السحب',
      fns: [[FN.verify, [['or a.drawn_value <> c.cost\n', '\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q('update public.sales_line_costs set cost = cost + 1 where line_id = $1', [s1.line]);
        return (await q("select violations::int as v from public.verify_sales() where check_name = 'sale_moves'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 1),
    },
    {
      name: 'verify_stock: البيع خارج بكلفته',
      fns: [[FN.verifyStock, [["\n      + coalesce((select sum(c.cost) from public.sales_line_costs c join public.sales_invoices s on s.org_id = c.org_id and s.id = c.sale_id\n          where c.org_id = o.id and s.status = 'posted'), 0) as outputs", ' as outputs']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q("select violations::int as v from public.verify_stock() where check_name = 'value_conservation'")).rows[0].v, 'postgres'),
      expect: okWith((v) => v, 0),
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
  if (process.env.SALES_MUTATIONS_OUT) {
    writeFileSync(process.env.SALES_MUTATIONS_OUT, `${JSON.stringify(mutationOutcomes.map((o) => ({ name: o.name, real: o.real, caught: o.caught, mutant: show(o.broken) })), null, 2)}\n`);
  }

  // ── عيّنات حقيقية للشاشات (اختياري بمتغيّر بيئة) ──────────────────────────────────────────────────────────────────
  if (process.env.SALES_SAMPLES_OUT) {
    const sample = {
      generated_by: `supabase/tests/sales.test.mjs (embedded Postgres 17، اليوم المثبَّت ${TODAY})`,
      record_sale: { storekeeper_credit: sold1.value, owner_cash: sold2.value, owner_medicine: sold3.value, storekeeper_free: sold4.value },
      void_sale: { manager_cash_kept: voided2.value, manager_credit: voided3.value },
      sales_overview: { owner: ownerOverview, storekeeper: keeperOverview },
      sale_detail: { owner: ownerDetail, storekeeper: keeperDetail },
      sales_report: { owner_party: byParty, owner_item: byItem, owner_day: byDay, storekeeper_party: await report(U.storekeeper, 'party') },
      item_file_storekeeper_starter: await fileOf(U.storekeeper, I.starter),
      refusals: samples.refusals,
    };
    writeFileSync(process.env.SALES_SAMPLES_OUT, `${JSON.stringify(sample, null, 2)}\n`);
  }
}
