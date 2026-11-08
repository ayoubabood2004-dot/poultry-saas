// المخزن ببساطة (0017؛ كلمة المالك 2026-11-06 وأجوبته الأربعة): الشراء بنداء واحد (record_purchase) يكتب الاستلام ومبالغه ويرحّله بجسم
// post_receipt نفسه — الدفعة والحركة وقيد المورّد = −المبلغ، والدفع نقداً قيد payout وحركة صندوق — ويكتب سعر البيع الحاليّ للمادّة؛
// والأمين يسجّل ويرى المال في ملفّ المادّة، والمحاسب يسجّل، ومشغّل المعمل وعامل القاعة forbidden؛ والإعادة بالمرجع نفسه ترجع المخزَّن،
// وبمعرّف الاستلام نفسه بمحتواه ترجعه وبغيره id_conflict؛ والمخزن يُختار وحده أو store_required أو no_receiving_store؛ والقطعة عدد صحيح،
// واللتر بلقطة كثافته، والمبلغ مقرَّب لأقرب دينار (333.333 × 1.50 = 500) والصفر total_zero؛ والتاريخ والمادّة والمورّد المؤرشفان والمخزن
// خارج النطاق مرفوضة؛ والكتابة المباشرة للأمين في المبالغ ما زالت forbidden، وعلامة الشراء لا تتسرّب لمستند آخر ولا تُزوَّر؛ وإلغاء المدير
// يُخرج الشراء من الملفّ والبطاقات؛ وملفّ المادّة وبطاقاتها بمجاميعها ومتوسّطها وقناعها؛ وverify_purchases؛ والتزامن: شراءان نقداً من صندوق
// واحد لا يتقافلان، والشراء وset_item_sell_price يتراتبان. وكلّ رفض وحارس أضافته 0017 بطفرة تكسره فيفشل فحصه (قسم الطفرات آخر الملف).
import { writeFileSync } from 'node:fs';
import { call, canon, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { receiptDraft } from './receipt-kit.mjs';

const TODAY = '2026-11-06';
const GO_LIVE = '2026-10-20';
const id = (n) => `b1700000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099700${String(n).padStart(2, '0')}`;

const RP = 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as v';
const FN = {
  record: 'public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid, date, timestamptz)',
  file: 'public.item_file(uuid)',
  overview: 'public.items_overview()',
  lines: 'private.receipt_lines_guard()',
  amounts: 'private.receipt_amounts_guard()',
  pass: 'private.purchase_pass(uuid)',
  verify: 'public.verify_purchases()',
};

/** نصّ عشري بلا أصفار زائدة («1500.000» ← «1500»)، والفارغ كما هو. */
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};
/** أيّ مفتاح money بأيّ عمق. */
const hasMoney = (value) => {
  if (Array.isArray(value)) return value.some(hasMoney);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, v]) => key === 'money' || hasMoney(v));
  return false;
};
const keys = (value) => Object.keys(value ?? {}).sort();

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  // ── المنشأة: الأدوار الثمانية، وأمين بنطاق المعمل، وأمين بنطاق المخازن العامّة، وأمين بنطاق مخزن المواد الأوّلية وحده ──────────
  const G = await makeOrg(db, {
    name: 'مزرعة الشراء البسيط',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill']],
      ['accountant', 'accountant'],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['hatcheryOperator', 'hatchery_operator', ['hatchery']],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['viewer', 'viewer'],
      ['keeperGeneral', 'storekeeper', ['general']],
      ['keeperRaw', 'storekeeper', ['feed_mill']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  for (const kind of Object.keys(D)) await one(U.owner, 'select public.set_division_go_live($1, $2)', [D[kind], GO_LIVE]);
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [G.members.keeperRaw, W.raw]);
  const millSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.raw])).rows[0].site_id;
  const archivedRaw = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن مواد مؤرشف', 'raw') returning id", [D.feed_mill, millSite]);
  await one(U.owner, 'update public.warehouses set archived_at = now() where id = $1 returning id', [archivedRaw]);
  const item = (name, kind, unit, extra = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l, tracks_expiry) values ($1, $2, $3, $4, $5) returning id', [name, kind, unit, extra.density ?? null, extra.tracksExpiry ?? false]);
  const I = {
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    oil: await item('زيت الصويا', 'raw', 'L', { density: 0.92 }),
    bran: await item('نخالة', 'raw', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    conc: await item('ذرة التزامن', 'raw', 'kg'),
    concB: await item('شعير التزامن', 'raw', 'kg'),
    crates: await item('صناديق بلاستيك', 'equipment', 'pc'),
    bags: await item('أكياس تعبئة', 'packaging', 'kg'),
    fuel: await item('كاز المولّدة', 'fuel', 'L'),
    vaccine: await item('لقاح نيوكاسل', 'vaccine', 'pc', { tracksExpiry: true }),
    chicks: await item('أفراخ لحم', 'chick', 'pc'),
    eggs: await item('بيض مائدة', 'table_egg', 'pc'),
    vitamin: await item('فيتامين', 'medicine', 'kg'),
    old: await item('ذرة قديمة', 'raw', 'kg'),
  };
  await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [I.old]);
  const party = (name) => one(U.accountant, 'insert into public.parties (name, is_supplier) values ($1, true) returning id', [name]);
  const P = {
    supplier: await party('محمد علي'),
    other: await party('شركة الحبوب'),
    concA: await party('مورّد التزامن الأوّل'),
    concB: await party('مورّد التزامن الثاني'),
    old: await party('مورّد قديم'),
  };
  await one(U.accountant, 'update public.parties set archived_at = now() where id = $1 returning id', [P.old]);
  const box = await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
  const oldBox = await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق قديم', 'cash') returning id");
  await one(U.accountant, 'update public.cash_accounts set archived_at = now() where id = $1 returning id', [oldBox]);

  // الغائب يُولَّد (أو المورّد الأوّل واليوم)، والفارغ الصريح يبقى فارغاً (لفحص id_required).
  const given = (o, key, fallback) => (o[key] === undefined ? fallback() : o[key]);
  const args = (o) => [given(o, 'ref', uid), given(o, 'receipt', uid), given(o, 'line', uid), o.item, given(o, 'party', () => P.supplier), o.on ?? TODAY, o.qty, o.price,
    o.sell ?? null, o.payment ?? 'credit', o.box ?? null, o.wh ?? null];
  const rp = (user, o, options) => call(db, user, RP, args(o), options);
  const shownOf = (result) => (result.ok ? 'ok' : result.code);
  const lotOf = async (line) => (await db.admin("select id, trim_scale(qty_in)::text as qty, trim_scale(value_in)::text as value, warehouse_id from public.stock_lots where source_kind = 'receipt' and source_line_id = $1 and origin_lot_id is null", [line])).rows[0];
  const docCounts = async () => (await db.admin(`select (select count(*) from public.receipts where org_id = $1)::int as receipts, (select count(*) from public.stock_lots where org_id = $1)::int as lots,
    (select count(*) from public.party_entries where org_id = $1)::int as entries, (select count(*) from public.cash_moves where org_id = $1)::int as moves,
    (select count(*) from public.purchase_prices where org_id = $1)::int as prices`, [org])).rows[0];
  const file = async (user, itemId) => (await call(db, user, 'select public.item_file($1) as v', [itemId])).value;
  const overview = async (user) => (await call(db, user, 'select public.items_overview() as v')).value;

  // ── ١) الشراء بالدين (الأمين): الاستلام مرحَّل، والدفعة والحركة وقيد المورّد = −المبلغ، وسعر البيع، وصفّ السعر ─────────────────────
  const r1 = { ref: uid(), receipt: uid(), line: uid() };
  const first = await rp(U.storekeeper, { ...r1, item: I.corn, qty: 1000, price: 450, sell: 500 });
  t.ok(first.ok, `الأمين يسجّل شراء الذرة بالدين (${first.code ?? ''} ${first.hint ?? ''})`);
  const lot1 = await lotOf(r1.line);
  const expected1 = {
    id: r1.receipt, doc_no: 'PU-2026-0001', line_id: r1.line, lot_id: lot1?.id, item_id: I.corn, warehouse_id: W.raw, warehouse_name: 'مخزن المواد الأوّلية',
    received_on: TODAY, qty: '1000', payment: 'credit', party_id: P.supplier, party_name: 'محمد علي', priced: true,
    money: { unit_price: '450', line_total: '450000', sell_price: '500', paid_now: '0' },
  };
  t.eq(canon(first.value), canon(expected1), 'نتيجة الشراء: الرقم والمخزن الذي اختير وحده والمورّد والكمية والمال للأمين (لا قناع)');
  t.same([lot1?.qty, lot1?.value, lot1?.warehouse_id], ['1000', '450000', W.raw], 'دفعة الشراء: 1,000 كغم بـ450,000 في مخزن المواد الأوّلية');
  const moves1 = (await db.admin("select doc_kind as kind, trim_scale(qty)::text as qty, trim_scale(value)::text as value from public.stock_moves where doc_id = $1", [r1.receipt])).rows;
  t.same(moves1, [{ kind: 'receipt', qty: '1000', value: '450000' }], 'حركة المخزون: استلام 1,000 كغم بقيمة 450,000');
  const entries1 = (await db.admin("select kind, amount::text as amount, doc_no from public.party_entries where doc_id = $1 order by kind", [r1.receipt])).rows;
  t.same(entries1, [{ kind: 'purchase', amount: '-450000', doc_no: 'PU-2026-0001' }], 'قيد المورّد: شراء −450,000 برقم الاستلام، ولا دفع');
  t.eq((await db.admin('select count(*)::int as n from public.cash_moves where doc_id = $1', [r1.receipt])).rows[0].n, 0, 'بالدين: لا حركة صندوق');
  const head1 = (await db.admin("select r.status, r.client_ref, l.unit_label, trim_scale(l.qty_base)::text as qty_base, l.base_unit, a.line_total::text as total, m.paid_now::text as paid, m.cash_account_id from public.receipts r join public.receipt_lines l on l.doc_id = r.id join public.receipt_line_amounts a on a.line_id = l.id join public.receipt_amounts m on m.doc_id = r.id where r.id = $1", [r1.receipt])).rows[0];
  t.same(head1, { status: 'posted', client_ref: r1.ref, unit_label: 'kg', qty_base: '1000', base_unit: 'kg', total: '450000', paid: '0', cash_account_id: null }, 'الاستلام: مرحَّل بمرجعه، وسطر بوحدة الأساس، ومبلغه، ومدفوعه صفر');
  const price1 = (await db.admin('select unit_price::text as unit, sell_price::text as sell, warehouse_id, item_id from public.purchase_prices where line_id = $1', [r1.line])).rows[0];
  t.same(price1, { unit: '450', sell: '500', warehouse_id: W.raw, item_id: I.corn }, 'صفّ سعر الشراء: 450 لكلّ كغم وسعر البيع 500');
  t.eq((await db.admin('select sell_price::text as v from public.item_prices where item_id = $1', [I.corn])).rows[0]?.v, '500', 'سعر البيع الحاليّ للذرة = 500 (آخر شراء له سعر)');

  // ── ٢) الشراء نقداً (المحاسب): قيد payout يغلق قيد الشراء، وحركة الصندوق، وسعر البيع لا يتغيّر بلا سعر ────────────────────────────
  const r2 = { ref: uid(), receipt: uid(), line: uid() };
  const second = await rp(U.accountant, { ...r2, item: I.corn, qty: 500, price: 460, payment: 'cash', box });
  t.same([second.ok, second.value?.payment, second.value?.money?.paid_now, second.value?.money?.line_total, second.value?.doc_no], [true, 'cash', '230000', '230000', 'PU-2026-0002'], 'المحاسب يسجّل نقداً: المدفوع = المبلغ كلّه');
  const entries2 = (await db.admin("select kind, amount::text as amount from public.party_entries where doc_id = $1 order by kind", [r2.receipt])).rows;
  t.same(entries2, [{ kind: 'payout', amount: '230000' }, { kind: 'purchase', amount: '-230000' }], 'نقداً: قيد شراء −230,000 وقيد دفع +230,000');
  const cash2 = (await db.admin('select kind, amount::text as amount, account_id from public.cash_moves where doc_id = $1', [r2.receipt])).rows;
  t.same(cash2, [{ kind: 'receipt_paid', amount: '-230000', account_id: box }], 'حركة الصندوق: −230,000 «مدفوع عند الاستلام»');
  t.eq((await db.admin("select sum(amount)::text as v from public.party_entries where doc_id = $1", [r2.receipt])).rows[0].v, '0', 'رصيد المورّد من الشراء النقدي صفر');
  t.eq((await db.admin('select sell_price::text as v from public.item_prices where item_id = $1', [I.corn])).rows[0]?.v, '500', 'شراء بلا سعر بيع لا يغيّر سعر البيع الحاليّ');

  // ── ٣) الإعادة: بالمرجع نفسه المخزَّن (ومال الأمين معه)، وبمعرّف الاستلام نفسه بمحتواه هو، وبغيره id_conflict ──────────────────────
  const before = await docCounts();
  const again = await rp(U.storekeeper, { ...r1, item: I.corn, qty: 1000, price: 450, sell: 500 });
  t.eq(canon(again.value), canon(expected1), 'الإعادة بالمرجع نفسه: النتيجة المخزَّنة نفسها بمالها للأمين');
  const reused = await rp(U.storekeeper, { ...r1, item: I.corn, qty: 999, price: 450, sell: 500 });
  const byId = await rp(U.storekeeper, { ...r1, ref: uid(), item: I.corn, qty: 1000, price: 450, sell: 500 });
  t.eq(canon(byId.value), canon(expected1), 'الإعادة بمعرّف الاستلام نفسه ومرجع جديد بالمحتوى نفسه: النتيجة نفسها (جواب ضاع)');
  const conflicts = [
    await rp(U.storekeeper, { ...r1, ref: uid(), item: I.corn, qty: 999, price: 450, sell: 500 }),
    await rp(U.storekeeper, { ...r1, ref: uid(), item: I.corn, qty: 1000, price: 451, sell: 500 }),
    await rp(U.storekeeper, { ...r1, ref: uid(), item: I.corn, qty: 1000, price: 450, sell: null }),
    await rp(U.storekeeper, { ...r1, ref: uid(), item: I.corn, qty: 1000, price: 450, sell: 500, payment: 'cash', box }),
    await rp(U.storekeeper, { ...r1, ref: uid(), line: uid(), item: I.corn, qty: 1000, price: 450, sell: 500 }),
    await rp(U.manager, { ...r1, ref: uid(), item: I.corn, qty: 1000, price: 450, sell: 500 }),
    await rp(U.storekeeper, { ref: uid(), receipt: uid(), line: r1.line, item: I.corn, qty: 1000, price: 450, sell: 500 }),
  ];
  t.same([shownOf(reused), ...conflicts.map(shownOf)], ['ref_reused', ...Array(7).fill('id_conflict')],
    'المرجع نفسه بمحتوى آخر ref_reused، والمعرّف نفسه بكمية أو سعر أو سعر بيع أو دفع أو سطر آخر أو من مستخدم آخر id_conflict، ومعرّف السطر لاستلام جديد id_conflict');
  t.same(await docCounts(), before, 'الإعادات كلّها: لا استلام ولا دفعة ولا قيد ولا حركة ولا سعر جديد');

  // ── ٤) الأدوار: مشغّل المعمل ومشغّل المفقس وعامل القاعة والمشاهد forbidden ─────────────────────────────────────────────────
  const refused = [];
  for (const user of [U.millOperator, U.hatcheryOperator, U.hallWorker, U.viewer]) refused.push(shownOf(await rp(user, { item: I.corn, qty: 1, price: 1 })));
  t.same(refused, ['forbidden', 'forbidden', 'forbidden', 'forbidden'], 'مشغّل المعمل والمفقس وعامل القاعة والمشاهد لا يسجّلون الشراء (forbidden)');

  // ── ٥) الرفوض المسمّاة ───────────────────────────────────────────────────────────────────────────────────────────
  const REFUSALS = [
    ['معرّف الاستلام فارغ', U.manager, { receipt: null, item: I.corn, qty: 1, price: 1 }, 'id_required'],
    ['مادّة غائبة', U.manager, { item: uid(), qty: 1, price: 1 }, 'item_not_found'],
    ['مادّة مؤرشفة', U.manager, { item: I.old, qty: 1, price: 1 }, 'item_archived'],
    ['بيض مائدة لا يُشترى', U.manager, { item: I.eggs, qty: 1, price: 1 }, 'not_purchasable'],
    ['أفراخ بلا وقت فقس', U.manager, { item: I.chicks, qty: 10, price: 1 }, 'born_at_required'],
    ['لقاح يتابع الانتهاء', U.manager, { item: I.vaccine, qty: 10, price: 1 }, 'expiry_required'],
    ['كمية صفر', U.manager, { item: I.corn, qty: 0, price: 1 }, 'qty_not_positive'],
    ['كمية سالبة', U.manager, { item: I.corn, qty: -5, price: 1 }, 'qty_not_positive'],
    ['كمية بأربع مراتب', U.manager, { item: I.corn, qty: 1.2345, price: 1 }, 'qty_not_positive'],
    ['قطع بكسر', U.manager, { item: I.crates, qty: 2.5, price: 1 }, 'pieces_not_whole'],
    ['سعر صفر', U.manager, { item: I.corn, qty: 1, price: 0 }, 'bad_price'],
    ['سعر بثلاث مراتب', U.manager, { item: I.corn, qty: 1, price: 1.234 }, 'bad_price'],
    ['مجموع يُقرَّب صفراً', U.manager, { item: I.bran, qty: 0.001, price: 0.25 }, 'total_zero'],
    ['سعر بيع صفر', U.manager, { item: I.corn, qty: 1, price: 1, sell: 0 }, 'bad_price'],
    ['سعر بيع بثلاث مراتب', U.manager, { item: I.corn, qty: 1, price: 1, sell: 1.001 }, 'bad_price'],
    ['دفع غير معروف', U.manager, { item: I.corn, qty: 1, price: 1, payment: 'card' }, 'bad_payment'],
    ['بالدين ومعه صندوق', U.manager, { item: I.corn, qty: 1, price: 1, payment: 'credit', box }, 'bad_payment'],
    ['نقداً بلا صندوق', U.manager, { item: I.corn, qty: 1, price: 1, payment: 'cash' }, 'cash_account_required'],
    ['صندوق غائب', U.manager, { item: I.corn, qty: 1, price: 1, payment: 'cash', box: uid() }, 'cash_account_not_found'],
    ['صندوق مؤرشف', U.manager, { item: I.corn, qty: 1, price: 1, payment: 'cash', box: oldBox }, 'cash_account_archived'],
    ['مورّد غائب', U.manager, { item: I.corn, qty: 1, price: 1, party: uid() }, 'party_not_found'],
    ['مورّد مؤرشف', U.manager, { item: I.corn, qty: 1, price: 1, party: P.old }, 'party_archived'],
    ['تاريخ أقدم من سبعة أيام', U.manager, { item: I.corn, qty: 1, price: 1, on: '2026-10-29' }, 'date_too_old'],
    ['تاريخ بالمستقبل', U.manager, { item: I.corn, qty: 1, price: 1, on: '2026-11-07' }, 'date_in_future'],
    ['مخزن غائب', U.manager, { item: I.corn, qty: 1, price: 1, wh: uid() }, 'warehouse_not_found'],
    ['مخزن مؤرشف', U.manager, { item: I.corn, qty: 1, price: 1, wh: archivedRaw }, 'warehouse_archived'],
    ['مخزن مختار خارج النطاق', U.storekeeper, { item: I.fuel, qty: 1, price: 1, wh: W.general }, 'out_of_scope'],
    ['مخزن لا يستلم نوع المادّة', U.manager, { item: I.corn, qty: 1, price: 1, wh: W.feed }, 'wrong_receiving_store'],
    ['لا مخزن مواد أوّلية في النطاق', U.keeperGeneral, { item: I.corn, qty: 1, price: 1 }, 'no_receiving_store'],
    ['التعبئة تُستلم في مخزنين', U.owner, { item: I.bags, qty: 1, price: 1 }, 'store_required'],
    ['أمين بنطاق المخزن دون وحدته: الدفتر خارج نطاقه', U.keeperRaw, { item: I.corn, qty: 1, price: 1 }, 'out_of_scope'],
  ];
  const refusalAnswers = [];
  for (const [, user, o] of REFUSALS) refusalAnswers.push(await rp(user, o));
  t.same(refusalAnswers.map(shownOf), REFUSALS.map((row) => row[3]), `الرفوض المسمّاة (${REFUSALS.length}): كلّ مدخل خاطئ برمزه`);
  t.same(refusalAnswers.filter((answer) => !answer.ok && !/[\u{600}-\u{6FF}]/u.test(answer.hint)).map((answer) => answer.code), [], 'كلّ رفض بتلميح عربي');
  const hintOf = (label) => refusalAnswers[REFUSALS.findIndex((row) => row[0] === label)].hint;
  t.ok(hintOf('التعبئة تُستلم في مخزنين').includes('المخزن العام') && hintOf('التعبئة تُستلم في مخزنين').includes('مخزن المواد الأوّلية'), `store_required يسمّي المخزنين (${hintOf('التعبئة تُستلم في مخزنين')})`);
  t.ok(hintOf('لا مخزن مواد أوّلية في النطاق').includes('نطاقك'), `no_receiving_store بنطاق الكاتب يقول إنّ المخزن خارج نطاقه (${hintOf('لا مخزن مواد أوّلية في النطاق')})`);
  t.ok(hintOf('أمين بنطاق المخزن دون وحدته: الدفتر خارج نطاقه').includes('معمل العلف'), `الدفتر خارج النطاق يسمّي دفتر الوحدة (${hintOf('أمين بنطاق المخزن دون وحدته: الدفتر خارج نطاقه')})`);
  t.same(await docCounts(), before, 'الرفوض كلّها: لا كتابة');

  // ── ٦) المخزن يُختار وحده: لا مخزن من النوع أصلاً، والمخزن المختار، ومخزنان للمواد الأوّلية ─────────────────────────────────────
  await one(U.owner, 'update public.warehouses set archived_at = now() where id = $1 returning id', [W.medicine]);
  const noStore = await rp(U.owner, { item: I.vitamin, qty: 1, price: 1 });
  t.same([shownOf(noStore), noStore.hint.includes('إعداد المخزن')], ['no_receiving_store', true], `لا مخزن أدوية فعّال: no_receiving_store يدلّ على «إعداد المخزن» (${noStore.hint})`);
  await one(U.owner, 'update public.warehouses set archived_at = null where id = $1 returning id', [W.medicine]);
  const bagsGeneral = await rp(U.owner, { item: I.bags, qty: 50, price: 300, wh: W.general });
  t.same([bagsGeneral.ok, bagsGeneral.value?.warehouse_id, bagsGeneral.value?.money?.line_total], [true, W.general, '15000'], 'التعبئة بالمخزن المختار: تُستلم فيه');

  // ── ٧) القطعة واللتر والتقريب لأقرب دينار والتاريخ قبل سبعة أيّام وسعر الكلفة المكتوب لا يُمسّ ───────────────────────────────
  const crates = await rp(U.keeperGeneral, { item: I.crates, qty: 10, price: 2500 });
  const cratesLine = crates.ok ? (await db.admin('select base_unit, unit_label, trim_scale(qty_base)::text as qty from public.receipt_lines where id = $1', [crates.value.line_id])).rows[0] : null;
  t.same([crates.ok, crates.value?.warehouse_name, crates.value?.qty, crates.value?.money?.line_total, cratesLine], [true, 'المخزن العام', '10', '25000', { base_unit: 'pc', unit_label: 'pc', qty: '10' }],
    'أمين المخازن العامّة يشتري 10 صناديق بـ2,500: المخزن العامّ وحده، والسطر بالقطعة');
  const oil = await rp(U.accountant, { item: I.oil, qty: 200, price: 1750, sell: 2000 });
  const oilLine = oil.ok ? (await db.admin('select base_unit, density_kg_per_l::text as density from public.receipt_lines where id = $1', [oil.value.line_id])).rows[0] : null;
  const oilLot = oil.ok ? await lotOf(oil.value.line_id) : null;
  t.same([oil.ok, oil.value?.money?.line_total, oilLine, oilLot?.qty, oilLot?.value], [true, '350000', { base_unit: 'L', density: '0.92' }, '200', '350000'], 'الزيت باللتر: 200 لتر بـ1,750، والسطر بلقطة كثافته 0.92');
  await one(U.owner, 'select public.set_item_cost_price($1, 1.10, null)', [I.bran]);
  const bran = await rp(U.manager, { item: I.bran, qty: 333.333, price: 1.5, sell: 2.25 });
  t.same([bran.ok, bran.value?.money?.line_total, bran.value?.money?.unit_price, bran.value?.qty], [true, '500', '1.5', '333.333'], '333.333 كغم × 1.50 = 499.9995 ← 500 دينار (نصفاً بعيداً عن الصفر)');
  const branOld = await rp(U.manager, { item: I.bran, qty: 10, price: 1, on: '2026-10-30' });
  t.same([branOld.ok, branOld.value?.received_on], [true, '2026-10-30'], 'سبعة أيّام بالضبط تُقبل (قرار 9)');
  t.same((await db.admin('select sell_price::text as sell, cost_price::text as cost from public.item_prices where item_id = $1', [I.bran])).rows[0], { sell: '2.25', cost: '1.10' },
    'سعر بيع النخالة من الشراء (والشراء الأقدم بلا سعر لا يمسحه)، وسعر الكلفة المكتوب 1.10 لا يُمسّ');

  // ── ٨) الكتابة المباشرة ما زالت محكومة، والعلامة لا تتسرّب ولا تُزوَّر ────────────────────────────────────────────────────────
  const draftB = await receiptDraft(db, U.storekeeper, { wh: W.raw, party: P.supplier, on: TODAY, lines: [{ item: I.corn, qty: 5 }] });
  const draftA = await receiptDraft(db, U.storekeeper, { wh: W.raw, party: P.other, on: TODAY, lines: [{ item: I.corn, qty: 7 }] });
  const direct = [
    await call(db, U.storekeeper, 'insert into public.receipt_line_amounts (line_id, line_total) values ($1, 100)', [draftB.lines[0]], { commit: false }),
    await call(db, U.storekeeper, 'insert into public.receipt_amounts (doc_id, discount, paid_now) values ($1, 0, 0)', [draftB.id], { commit: false }),
    await call(db, U.accountant, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 3)', [draftB.id, I.corn], { commit: false }),
  ];
  t.same(direct.map(shownOf), ['forbidden', 'forbidden', 'forbidden'], 'الكتابة المباشرة: الأمين لا يكتب مبلغ سطر ولا رأس مبالغ، والمحاسب لا يكتب سطراً');
  const sameTx = await db.asUser(U.storekeeper, async (q) => {
    await q(RP, args({ item: I.corn, qty: 1, price: 400 }));
    try {
      await q('insert into public.receipt_line_amounts (line_id, line_total) values ($1, 100)', [draftB.lines[0]]);
      return 'ok';
    } catch (error) {
      return error.message;
    }
  });
  t.eq(sameTx, 'forbidden', 'بعد شراء في المعاملة نفسها: كتابة الأمين المباشرة في مبالغ مسوّدة أخرى ما زالت forbidden');

  // طرق العلامة بدور صاحب الجداول (فوق RLS، كما تكتب دالّة definer)، بهويّة الأمين: علامة مستند آخر، وعلامة المستند نفسه (الضابط)،
  // والمعرّف الخام مزوَّراً، وبعد شراء في المعاملة نفسها.
  const insertB = (q) => q('insert into public.receipt_line_amounts (line_id, line_total) values ($1, 100) returning id', [draftB.lines[0]]);
  const markerWays = await mutant(db, U.manager, [], async ({ attempt }) => [
    await attempt(U.storekeeper, async (q) => {
      await q("select set_config('poultry.purchase_doc', private.purchase_marker($1), true)", [draftA.id]);
      return (await insertB(q)).rows.length;
    }, 'postgres'),
    await attempt(U.storekeeper, async (q) => {
      await q("select set_config('poultry.purchase_doc', private.purchase_marker($1), true)", [draftB.id]);
      return (await insertB(q)).rows.length;
    }, 'postgres'),
    await attempt(U.storekeeper, async (q) => {
      await q("select set_config('poultry.purchase_doc', $1, true)", [draftB.id]);
      return (await insertB(q)).rows.length;
    }, 'postgres'),
    await attempt(U.storekeeper, async (q) => {
      await q('set local role authenticated');
      await q(RP, args({ item: I.corn, qty: 1, price: 400 }));
      await q('set local role postgres');
      return (await insertB(q)).rows.length;
    }, 'postgres'),
  ]);
  t.same(markerWays.map((r) => (r.ok ? 'ok' : r.code)), ['forbidden', 'ok', 'forbidden', 'forbidden'],
    'العلامة: علامة مستند آخر forbidden، وعلامة المستند نفسه تمرّ (الضابط)، والمعرّف الخام المزوَّر forbidden، وبعد شراء في المعاملة forbidden');

  // ── ٩) الإلغاء (المدير): شراء ثالث يُلغى فيخرج من الملفّ والبطاقات، وصفّ سعره يبقى والثوابت صفر ─────────────────────────────────
  const r3 = await rp(U.manager, { item: I.corn, qty: 200, price: 470 });
  const voided = await call(db, U.manager, "select public.void_receipt($1, 'شراء مكرّر', gen_random_uuid()) ->> 'status' as v", [r3.value?.id]);
  t.same([r3.ok, voided.ok, voided.value], [true, true, 'void'], 'المدير يلغي شراءً مسجَّلاً بـvoid_receipt');

  // ── ١٠) ملفّ المادّة: الأمين يرى المال، ومشغّل المعمل وعامل القاعة بلا مال، والملغى خارج المجاميع ─────────────────────────────
  const keeperFile = await file(U.storekeeper, I.corn);
  // 0020 زاد أفعال الملفّ وأين المادّة والشراء بلا سعر (can_delete وuses وcan_convert وcan_transfer وcan_sell وstores وtransfer_targets وcan_price
  // وunpriced_count)، ونسخة المادّة (للحذف)، وpriced وcan_price لكلّ شراء.
  t.same(keys(keeperFile), ['can_convert', 'can_delete', 'can_edit', 'can_price', 'can_record', 'can_sell', 'can_transfer', 'cash_accounts', 'item', 'money', 'more', 'on_hand_qty',
    'purchased_qty', 'purchases', 'purchases_count', 'stores', 'today', 'transfer_targets', 'unpriced_count', 'uses'], 'item_file: مفاتيح الجذر');
  t.same([keys(keeperFile.item), keys(keeperFile.money), keys(keeperFile.purchases[0]), keys(keeperFile.purchases[0]?.money)],
    [['archived', 'base_unit', 'density_kg_per_l', 'id', 'kind', 'name', 'tracks_expiry', 'version'], ['avg_unit_price', 'last_unit_price', 'purchased_value', 'sell_price'],
      ['can_price', 'doc_id', 'doc_no', 'line_id', 'money', 'party_id', 'party_name', 'payment', 'priced', 'qty', 'received_on', 'warehouse_name'], ['corrected', 'line_total', 'sell_price', 'unit_price']],
    'item_file: مفاتيح المادّة والمال والسطر');
  t.same(
    [keeperFile.today, keeperFile.can_record, keeperFile.can_edit, norm(keeperFile.on_hand_qty), norm(keeperFile.purchased_qty), keeperFile.purchases_count, keeperFile.more,
      norm(keeperFile.money.purchased_value), keeperFile.money.avg_unit_price, norm(keeperFile.money.sell_price), norm(keeperFile.money.last_unit_price)],
    [TODAY, true, false, '1500', '1500', 2, false, '680000', '453.33', '500', '460'],
    'ملفّ الذرة للأمين: الموجود 1,500 (الملغى رجع) ومجموع المشترى 1,500 بـ680,000 ومتوسّط 453.33 وسعر البيع 500 وآخر سعر 460 (الأحدث)',
  );
  t.same(keeperFile.purchases.map((row) => [row.doc_no, norm(row.qty), row.payment, norm(row.money.unit_price), norm(row.money.line_total), norm(row.money.sell_price), row.party_name]),
    [['PU-2026-0002', '500', 'cash', '460', '230000', null, 'محمد علي'], ['PU-2026-0001', '1000', 'credit', '450', '450000', '500', 'محمد علي']],
    'سطور الملفّ: الأحدث أوّلاً، والملغى خارجها، والدفع والسعر وسعر البيع لكلّ شراء');
  t.same(keeperFile.cash_accounts, [{ id: box, name: 'الصندوق' }], 'الصناديق الفعّالة لنافذة الشراء (الأمين لا يقرأ جدولها)');
  const millFile = await file(U.millOperator, I.corn);
  const hallFile = await file(U.hallWorker, I.corn);
  t.same([hasMoney(millFile), millFile.purchases_count, norm(millFile.purchased_qty), millFile.can_record, millFile.cash_accounts, hasMoney(hallFile), hallFile.purchases_count, norm(hallFile.on_hand_qty)],
    [false, 2, '1500', false, [], false, 0, '0'], 'مشغّل المعمل يرى الشراءات بلا مال، وعامل القاعة بلا مال ولا شراءات خارج نطاقه');
  const oilFile = await file(U.accountant, I.oil);
  t.same([oilFile.item.base_unit, oilFile.item.density_kg_per_l, norm(oilFile.purchased_qty), oilFile.money.avg_unit_price, norm(oilFile.money.sell_price)], ['L', '0.92', '200', '1750.00', '2000'], 'ملفّ الزيت: باللتر بكثافته، ومتوسّطه 1,750');
  t.eq(shownOf(await call(db, U.manager, 'select public.item_file($1) as v', [uid()])), 'item_not_found', 'ملفّ مادّة غائبة: item_not_found');

  // ── ١١) بطاقات المواد: المجاميع والمتوسّط وآخر يوم، والترتيب، والمؤرشف خارجها، والقناع والعلمان ───────────────────────────────
  const keeperBoard = await overview(U.storekeeper);
  t.same([keys(keeperBoard), keys(keeperBoard.items[0]), keys(keeperBoard.items[0]?.money)],
    [['can_add_item', 'can_record', 'items', 'today'], ['base_unit', 'id', 'kind', 'last_purchase_on', 'money', 'name', 'on_hand_qty', 'purchased_qty', 'unpriced_count'], ['avg_unit_price', 'sell_price']], 'items_overview: المفاتيح (و0020 unpriced_count)');
  const cornCard = keeperBoard.items.find((row) => row.id === I.corn);
  t.same([norm(cornCard?.on_hand_qty), norm(cornCard?.purchased_qty), cornCard?.last_purchase_on, cornCard?.money?.avg_unit_price, norm(cornCard?.money?.sell_price)], ['1500', '1500', TODAY, '453.33', '500'],
    'بطاقة الذرة: الموجود ومجموع المشترى (بلا الملغى) وآخر يوم والمتوسّط وسعر البيع');
  const expectedOrder = (await db.admin('select id from public.items where org_id = $1 and archived_at is null order by name_norm collate "C", id', [org])).rows.map((r) => r.id);
  t.same(keeperBoard.items.map((row) => row.id), expectedOrder, 'البطاقات: كلّ مادّة فعّالة بالاسم المطبَّع، والمؤرشفة خارجها');
  const hallBoard = await overview(U.hallWorker);
  const accountantBoard = await overview(U.accountant);
  t.same([keeperBoard.can_record, keeperBoard.can_add_item, accountantBoard.can_record, accountantBoard.can_add_item, hallBoard.can_record, hasMoney(hallBoard), hasMoney(keeperBoard), hallBoard.items.length],
    [true, true, true, false, false, false, true, expectedOrder.length], 'العلمان: الأمين يسجّل ويضيف، والمحاسب يسجّل ولا يضيف، وعامل القاعة لا هذا ولا ذاك وبلا مال');

  // ── ١٢) المخزنان: مادّة أوّلية بمخزنين في النطاق store_required، وبالمختار تمرّ ───────────────────────────────────────────────
  const raw2 = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن مواد ثانٍ', 'raw') returning id", [D.feed_mill, millSite]);
  const twoStores = [await rp(U.manager, { item: I.soy, qty: 1, price: 1 }), await rp(U.storekeeper, { item: I.soy, qty: 1, price: 1 })];
  t.same(twoStores.map(shownOf), ['store_required', 'store_required'], 'مخزنا مواد أوّلية في النطاق: store_required للمدير وللأمين');
  t.ok(twoStores[1].hint.includes('مخزن المواد الأوّلية') && twoStores[1].hint.includes('مخزن مواد ثانٍ'), `store_required يسمّي المخزنين (${twoStores[1].hint})`);
  const picked = await rp(U.storekeeper, { item: I.soy, qty: 100, price: 600, wh: raw2 });
  t.same([picked.ok, picked.value?.warehouse_id, picked.value?.warehouse_name], [true, raw2, 'مخزن مواد ثانٍ'], 'الإعادة بالمخزن المختار تمرّ');

  // ── ١٣) الثوابت ────────────────────────────────────────────────────────────────────────────────────────────────────
  const verify = await db.asService(async (q) => (await q('select check_name, violations::int as v from public.verify_purchases() order by 1')).rows);
  t.same(verify, [{ check_name: 'purchase_price_draft', v: 0 }, { check_name: 'purchase_price_ties', v: 0 }, { check_name: 'purchase_pricing_ties', v: 0 }, { check_name: 'unpriced_returns', v: 0 }], 'verify_purchases: الفحوص صفر (و0020 التسعير والمرتجع)');

  // ── ١٤) التزامن ─────────────────────────────────────────────────────────────────────────────────────────────────
  // (أ) شراءان نقداً من صندوق واحد للمادّة نفسها ومورّدين: الأوّل محبوس على قفل مورّده بجلسة ثالثة قبل أيّ كتابة، والثاني يكمل؛ وبعد فكّ
  // القفل ينتظر الأوّل الثاني ثمّ يكمل. بلا أقفال الشراء قبل الكتابة كان الأوّل يقفل الصندوق بمفتاح رأس المبالغ ثمّ يتقافلان (40P01).
  const deadlockRun = async () => {
    const holder = await db.session(U.owner);
    const s1 = await db.session(U.accountant);
    const s2 = await db.session(U.manager);
    try {
      await holder.run("select pg_advisory_xact_lock(hashtextextended('party:' || $1::text, 0))", [P.concA]);
      const p1 = s1.run(RP, args({ item: I.conc, party: P.concA, qty: 10, price: 100, payment: 'cash', box, wh: W.raw }));
      const st1 = await db.settle(p1, s1.pid);
      const p2 = s2.run(RP, args({ item: I.conc, party: P.concB, qty: 20, price: 100, payment: 'cash', box, wh: W.raw }));
      const st2 = await db.settle(p2, s2.pid);
      await holder.commit();
      if (st2 === 'finished') await s2.commit();
      const [a1, a2] = await Promise.all([p1, p2]);
      return { st1, st2, a1, a2 };
    } finally {
      await holder.rollback();
      await s1.rollback();
      await s2.rollback();
    }
  };
  const concBefore = (await db.admin('select count(*)::int as n from public.receipts r join public.receipt_lines l on l.doc_id = r.id where l.item_id = $1', [I.conc])).rows[0].n;
  const real = await deadlockRun();
  t.same([real.st1, real.st2, real.a1.ok, real.a2.ok], ['blocked', 'finished', true, true], `شراءان نقداً من صندوق واحد: الثاني يكمل والأوّل ينتظره ثمّ يكمل، بلا تقافل (${real.a1.error ?? ''} ${real.a2.error ?? ''})`);
  t.eq((await db.admin('select count(*)::int as n from public.receipts r join public.receipt_lines l on l.doc_id = r.id where l.item_id = $1', [I.conc])).rows[0].n, concBefore + 1,
    'الثاني ثبت والأوّل رجع مع جلسته (rollback بعد الفحص)');
  // الطفرة نفسها مثبَّتة (الجلسات الأخرى ترى الدالّة)، وتُرجَع بتعريفها كما كان بالضبط.
  const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [FN.record])).rows[0].d;
  const PREFIX = "  perform private.lock_parties(array[p.id]);\n  perform private.check_post_date(p_received_on, w.division_id);\n  perform private.lock_masters(array[w.id], array[i.id], true);\n  perform private.lock_balances(array[i.id], array[w.id]);\n  if p_payment = 'cash' then\n    perform private.lock_cash_account(p_cash_account, true);\n  end if;\n";
  let deadlockMutant;
  try {
    if (original.split(PREFIX).length !== 2) throw new Error('مرساة أقفال الشراء ليست مرّة واحدة');
    await db.asOwner((q) => q(original.split(PREFIX).join('')), undefined, { commit: true });
    deadlockMutant = await deadlockRun();
  } finally {
    await db.asOwner((q) => q(original), undefined, { commit: true });
  }
  const mutantErrors = [deadlockMutant.a1, deadlockMutant.a2].filter((a) => !a.ok).map((a) => a.error);
  t.ok(deadlockMutant.st2 === 'blocked' && mutantErrors.some((error) => /deadlock/u.test(error)), `طفرة: بلا أقفال الشراء قبل الكتابة يتقافل الشراءان (${deadlockMutant.st1}/${deadlockMutant.st2}: ${mutantErrors.join(' | ')})`);
  t.eq((await db.admin('select md5(pg_get_functiondef($1::regprocedure)) = md5($2) as same', [FN.record, original])).rows[0].same, true, 'الدالّة رجعت بتعريفها كما كان');

  // (ب) الشراء بسعر بيع وset_item_sell_price يتراتبان على قفل المادّة: كلّ واحد يرى الآخر (لا كتابة فوق كتابة بصمت).
  const ownerPrice = await db.session(U.owner);
  const keeperBuy = await db.session(U.storekeeper);
  let order1;
  try {
    const priced = await ownerPrice.run('select public.set_item_sell_price($1, 900, null) as v', [I.soy]);
    const buying = keeperBuy.run(RP, args({ item: I.soy, qty: 5, price: 600, sell: 950, wh: raw2 }));
    const state = await db.settle(buying, keeperBuy.pid);
    await ownerPrice.commit();
    const bought = await buying;
    await keeperBuy.commit();
    order1 = [priced.ok, state, bought.ok];
  } finally {
    await ownerPrice.rollback();
    await keeperBuy.rollback();
  }
  const keeperBuy2 = await db.session(U.storekeeper);
  const ownerPrice2 = await db.session(U.owner);
  let order2;
  try {
    const bought = await keeperBuy2.run(RP, args({ item: I.soy, qty: 5, price: 600, sell: 990, wh: raw2 }));
    const pricing = ownerPrice2.run('select public.set_item_sell_price($1, 1000, 950) as v', [I.soy]);
    const state = await db.settle(pricing, ownerPrice2.pid);
    await keeperBuy2.commit();
    const priced = await pricing;
    order2 = [bought.ok, state, priced.ok ? 'ok' : priced.error];
  } finally {
    await keeperBuy2.rollback();
    await ownerPrice2.rollback();
  }
  t.same([order1, order2, (await db.admin('select sell_price::text as v from public.item_prices where item_id = $1', [I.soy])).rows[0].v],
    [[true, 'blocked', true], [true, 'blocked', 'price_changed'], '990'],
    'سعر البيع: الشراء ينتظر تعديل السعر الجاري ثمّ يكتب سعره، وتعديل السعر ينتظر الشراء الجاري ثمّ يرى سعره الجديد (price_changed)');

  // ── ١٥) الطفرات: كلّ رفض وحارس أضافته 0017 يفشل فحصه بلا شرطه ──────────────────────────────────────────────────────────
  const recordAs = (user, o) => async ({ attempt }) => attempt(user, async (q) => (await q(RP, args(o))).rows[0].v);
  const code = (expected, hint) => (r) => !r.ok && r.code === expected && (!hint || r.hint.includes(hint));
  const okWith = (pick, value) => (r) => r.ok && pick(r.value) === value;
  const off = (anchor) => [anchor, anchor.replace(/^( *if ).*( then\n)$/su, '$1false$2')];
  const CASES = [
    { name: 'الفعل purchase.record', fns: [[FN.record, [["  perform private.require('purchase.record');\n", '']]]], run: recordAs(U.millOperator, { item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: code('forbidden') },
    { name: 'id_required', fns: [[FN.record, [off('  if p_receipt_id is null or p_line_id is null or p_item is null or p_party is null then\n')]]], run: recordAs(U.manager, { receipt: null, item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: code('id_required') },
    { name: 'id_conflict (المحتوى)', fns: [[FN.record, [['    if coalesce(v_same, false) then\n', '    if true then\n']]]], run: recordAs(U.storekeeper, { ...r1, ref: uid(), item: I.corn, qty: 999, price: 450, sell: 500, wh: W.raw }), expect: code('id_conflict') },
    { name: 'id_conflict (فحص المعرّف)', fns: [[FN.record, [off('  if r.id is not null then\n')]]], run: recordAs(U.storekeeper, { ...r1, ref: uid(), line: uid(), item: I.corn, qty: 1000, price: 450, sell: 500, wh: W.raw }), expect: code('id_conflict') },
    { name: 'id_conflict (معرّف السطر)', fns: [[FN.record, [off('  if exists (select 1 from public.receipt_lines x where x.id = p_line_id) then\n')]]], run: recordAs(U.storekeeper, { line: r1.line, item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: code('id_conflict') },
    { name: 'item_not_found', fns: [[FN.record, [off('  if i.id is null then\n')]]], run: recordAs(U.manager, { item: uid(), qty: 1, price: 1 }), expect: code('item_not_found') },
    { name: 'item_archived', fns: [[FN.record, [off('  if i.archived_at is not null then\n')]]], run: recordAs(U.manager, { item: I.old, qty: 1, price: 1, wh: W.raw }), expect: code('item_archived', 'شراء جديد') },
    { name: 'not_purchasable', fns: [[FN.record, [off('  if cardinality(v_kinds) = 0 then\n')]]], run: recordAs(U.manager, { item: I.eggs, qty: 1, price: 1 }), expect: code('not_purchasable') },
    { name: 'born_at_required', fns: [[FN.record, [off("  if i.kind = 'chick' and p_born_at is null then\n")]]], run: recordAs(U.manager, { item: I.chicks, qty: 10, price: 1 }), expect: code('born_at_required', '«وقت الفقس»') },
    { name: 'expiry_required', fns: [[FN.record, [off('  if i.tracks_expiry and p_expiry_on is null then\n')]]], run: recordAs(U.owner, { item: I.vaccine, qty: 10, price: 1, wh: null }), expect: code('expiry_required', '«تاريخ الانتهاء»') },
    { name: 'warehouse_not_found', fns: [[FN.record, [off('    if w.id is null then\n')]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, wh: uid() }), expect: code('warehouse_not_found') },
    { name: 'warehouse_archived', fns: [[FN.record, [off('    if w.archived_at is not null then\n')]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, wh: archivedRaw }), expect: code('warehouse_archived', 'شراء جديد') },
    { name: 'out_of_scope (المخزن المختار)', fns: [[FN.record, [off('    if not public.in_scope_wh(w.id) then\n')]]], run: recordAs(U.storekeeper, { item: I.fuel, qty: 1, price: 1, wh: W.general }), expect: code('out_of_scope', 'فلا تسجّل فيه شراءً') },
    { name: 'wrong_receiving_store', fns: [[FN.record, [off('    if not (w.kind = any (v_kinds)) then\n')]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, wh: W.feed }), expect: code('wrong_receiving_store') },
    { name: 'no_receiving_store', fns: [[FN.record, [off('    if v_count = 0 then\n')]]], run: recordAs(U.keeperGeneral, { item: I.corn, qty: 1, price: 1 }), expect: code('no_receiving_store') },
    { name: 'store_required', fns: [[FN.record, [off('    if v_count > 1 then\n')]]], run: recordAs(U.manager, { item: I.soy, qty: 1, price: 1 }), expect: code('store_required') },
    { name: 'out_of_scope (الدفتر)', fns: [[FN.record, [off('  if not public.in_scope_book(b.id) then\n')]]], run: recordAs(U.keeperRaw, { item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: code('out_of_scope', 'دون وحدته') },
    { name: 'qty_not_positive', fns: [[FN.record, [off("  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then\n")]]], run: recordAs(U.manager, { item: I.corn, qty: 1.2345, price: 1, wh: W.raw }), expect: code('qty_not_positive') },
    { name: 'pieces_not_whole', fns: [[FN.record, [off("  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then\n")]]], run: recordAs(U.manager, { item: I.crates, qty: 2.5, price: 1 }), expect: code('pieces_not_whole', 'عدداً صحيحاً من القطع') },
    { name: 'bad_price (الشراء)', fns: [[FN.record, [off("  if p_unit_price is not null and (not (abs(p_unit_price) < 'Infinity') or p_unit_price <= 0 or p_unit_price <> round(p_unit_price, 2)) then\n")]]], run: recordAs(U.manager, { item: I.corn, qty: 1000, price: 1.234, wh: W.raw }), expect: code('bad_price') },
    { name: 'total_zero', fns: [[FN.record, [off('  if p_unit_price is not null and v_total = 0 then\n')]]], run: recordAs(U.manager, { item: I.bran, qty: 0.001, price: 0.25, wh: W.raw }), expect: code('total_zero') },
    { name: 'bad_price (البيع)', fns: [[FN.record, [off("  if p_sell_price is not null and not (abs(p_sell_price) < 'Infinity' and p_sell_price > 0 and p_sell_price = round(p_sell_price, 2)) then\n")]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, sell: 1.001, wh: W.raw }), expect: code('bad_price') },
    { name: 'bad_payment (غير معروف)', fns: [[FN.record, [off("  if p_payment is null or p_payment not in ('credit', 'cash') then\n")]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, payment: 'card', wh: W.raw }), expect: code('bad_payment') },
    { name: 'bad_payment (بالدين بصندوق)', fns: [[FN.record, [off("  if p_payment = 'credit' and p_cash_account is not null then\n")]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, payment: 'credit', box, wh: W.raw }), expect: code('bad_payment') },
    { name: 'cash_account_required', fns: [[FN.record, [off("  if p_payment = 'cash' and p_cash_account is null then\n")]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, payment: 'cash', wh: W.raw }), expect: code('cash_account_required', 'دفعت منه') },
    { name: 'party_not_found', fns: [[FN.record, [off('  if p.id is null then\n')]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, party: uid(), wh: W.raw }), expect: code('party_not_found') },
    { name: 'party_archived', fns: [[FN.record, [off('  if p.archived_at is not null then\n')]]], run: recordAs(U.manager, { item: I.corn, qty: 1, price: 1, party: P.old, wh: W.raw }), expect: code('party_archived', 'شراء جديد') },
    {
      name: 'سعر البيع الحاليّ',
      fns: [[FN.record, [['  ) then\n    insert into public.item_prices', '  ) and false then\n    insert into public.item_prices']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => {
        await q(RP, args({ item: I.corn, qty: 1, price: 1, sell: 777, wh: W.raw }));
        return (await q('select sell_price::text as v from public.item_prices where item_id = $1', [I.corn])).rows[0].v;
      }),
      expect: okWith((v) => v, '777'),
    },
    {
      name: 'النتيجة بمالها لمن يسجّل',
      fns: [[FN.record, [['  perform private.ref_store(v_fn, p_client_ref, v_result);\n  return v_result;\nend', '  perform private.ref_store(v_fn, p_client_ref, v_result);\n  return private.mask(v_result);\nend']]]],
      run: recordAs(U.storekeeper, { item: I.corn, qty: 1, price: 1, wh: W.raw }),
      expect: okWith((v) => v?.money?.unit_price, '1'),
    },
    {
      name: 'الإعادة بالمرجع بمالها لمن يسجّل',
      fns: [[FN.record, [['    select x.result into v_cached from public.rpc_refs x where x.org_id = v_org and x.fn = v_fn and x.client_ref = p_client_ref;\n', '']]]],
      run: async ({ attempt }) => attempt(U.storekeeper, async (q) => {
        const o = args({ item: I.corn, qty: 1, price: 1, wh: W.raw });
        await q(RP, o);
        return (await q(RP, o)).rows[0].v;
      }),
      expect: okWith((v) => v?.money?.line_total, '1'),
    },
    { name: 'حارس السطر يمرّر شراء المحاسب', fns: [[FN.lines, [["  if not private.purchase_pass(d.id) then\n    perform private.require('receipt.draft');\n  end if;\n", "  perform private.require('receipt.draft');\n"]]]], run: recordAs(U.accountant, { item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: okWith((v) => v?.payment, 'credit') },
    { name: 'حارس المبالغ يمرّر شراء الأمين', fns: [[FN.amounts, [["  if not private.purchase_pass(d.id) then\n    perform private.require('receipt.amounts');\n", "  if true then\n    perform private.require('receipt.amounts');\n"]]]], run: recordAs(U.storekeeper, { item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: okWith((v) => v?.payment, 'credit') },
    {
      name: 'حارس المبالغ يحكم الأمين بلا علامة',
      fns: [[FN.amounts, [["  if not private.purchase_pass(d.id) then\n    perform private.require('receipt.amounts');\n", "  if false then\n    perform private.require('receipt.amounts');\n"]]]],
      run: async ({ attempt }) => attempt(U.storekeeper, async (q) => (await q('insert into public.receipt_line_amounts (line_id, line_total) values ($1, 100) returning id', [draftB.lines[0]])).rows.length),
      expect: code('forbidden'),
    },
    {
      name: 'حارس السطر يحكم المحاسب بلا علامة',
      fns: [[FN.lines, [["  if not private.purchase_pass(d.id) then\n    perform private.require('receipt.draft');\n", "  if false then\n    perform private.require('receipt.draft');\n"]]]],
      run: async ({ attempt }) => attempt(U.accountant, async (q) => (await q('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 3) returning id', [draftB.id, I.corn])).rows.length),
      expect: code('forbidden'),
    },
    {
      name: 'العلامة مربوطة بالمستند',
      fns: [[FN.pass, [['  return coalesce(v_mark = private.purchase_marker(p_doc), false);', '  return true;']]]],
      run: async ({ attempt }) => attempt(U.storekeeper, async (q) => {
        await q("select set_config('poultry.purchase_doc', private.purchase_marker($1), true)", [draftA.id]);
        return (await insertB(q)).rows.length;
      }, 'postgres'),
      expect: code('forbidden'),
    },
    {
      name: 'العلامة بسرّ الخادم لا بالمعرّف',
      fns: [[FN.pass, [['  return coalesce(v_mark = private.purchase_marker(p_doc), false);', '  return coalesce(v_mark = p_doc::text, false);']]]],
      run: async ({ attempt }) => attempt(U.storekeeper, async (q) => {
        await q("select set_config('poultry.purchase_doc', $1, true)", [draftB.id]);
        return (await insertB(q)).rows.length;
      }, 'postgres'),
      expect: code('forbidden'),
    },
    {
      name: 'العلامة تُمسح بعد الكتابات (مع ربطها بالمستند)',
      fns: [[FN.record, [["  perform set_config('poultry.purchase_doc', '', true);\n", '']]], [FN.pass, [['  return coalesce(v_mark = private.purchase_marker(p_doc), false);', '  return true;']]]],
      run: async ({ attempt }) => attempt(U.storekeeper, async (q) => {
        await q('set local role authenticated');
        await q(RP, args({ item: I.corn, qty: 1, price: 400, wh: W.raw }));
        await q('set local role postgres');
        return (await insertB(q)).rows.length;
      }, 'postgres'),
      expect: code('forbidden'),
    },
    // الفعل بجدول الأدوار (0017 أ): الأمين والمحاسب بلا purchase.record يُرفضان (ومرآته permissions.ts بفحص parity خانةً خانة).
    { name: 'role_can: الأمين يسجّل الشراء', fns: [['private.role_can(text, text, boolean)', [["'stock_use.post', 'party.create', 'purchase.record', 'sale.record')", "'stock_use.post', 'party.create', 'sale.record')"]]]], run: recordAs(U.storekeeper, { item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: okWith((v) => v?.payment, 'credit') },
    { name: 'role_can: المحاسب يسجّل الشراء', fns: [['private.role_can(text, text, boolean)', [["'cash_accounts.manage', 'expense_categories.manage', 'purchase.record',\n      'sale.record')", "'cash_accounts.manage', 'expense_categories.manage',\n      'sale.record')"]]]], run: recordAs(U.accountant, { item: I.corn, qty: 1, price: 1, wh: W.raw }), expect: okWith((v) => v?.payment, 'credit') },
    {
      name: 'ملفّ المادّة بماله لمن يسجّل',
      fns: [[FN.file, [['  if v_record then\n    return v_result;\n  end if;\n  return private.mask(v_result);', '  return private.mask(v_result);']]]],
      run: async ({ attempt }) => attempt(U.storekeeper, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v),
      expect: okWith((v) => hasMoney(v), true),
    },
    {
      name: 'ملفّ المادّة بلا مال لغيرهم',
      fns: [[FN.file, [['  return private.mask(v_result);\nend', '  return v_result;\nend']]]],
      run: async ({ attempt }) => attempt(U.millOperator, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v),
      expect: okWith((v) => hasMoney(v), false),
    },
    {
      name: 'ملفّ المادّة بلا الملغى',
      fns: [[FN.file, [["l.origin_lot_id is null and r.status = 'posted'\n      and public.in_scope_wh(l.warehouse_id)", 'l.origin_lot_id is null\n      and public.in_scope_wh(l.warehouse_id)']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v.purchases_count),
      expect: okWith((v) => v, 2),
    },
    {
      name: 'ملفّ المادّة بنطاق القارئ',
      fns: [[FN.file, [["r.status = 'posted'\n      and public.in_scope_wh(l.warehouse_id)\n  ), ordered as", "r.status = 'posted'\n  ), ordered as"]]]],
      run: async ({ attempt }) => attempt(U.keeperGeneral, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v.purchases_count),
      expect: okWith((v) => v, 0),
    },
    {
      name: 'البطاقات بلا مال لغيرهم',
      fns: [[FN.overview, [['  return private.mask(v_result);\nend', '  return v_result;\nend']]]],
      run: async ({ attempt }) => attempt(U.hallWorker, async (q) => (await q('select public.items_overview() as v')).rows[0].v),
      expect: okWith((v) => hasMoney(v), false),
    },
    {
      name: 'البطاقات بلا الملغى',
      fns: [[FN.overview, [["r.status = 'posted' and public.in_scope_wh(l.warehouse_id)", 'public.in_scope_wh(l.warehouse_id)']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => norm((await q('select public.items_overview() as v')).rows[0].v.items.find((row) => row.id === I.corn).purchased_qty)),
      expect: okWith((v) => v, '1500'),
    },
    {
      name: 'verify_purchases: ربط المبلغ بالسعر',
      fns: [[FN.verify, [['\n        else a.line_total = private._mul_div_round(x.qty_in_unit, pp.unit_price, 1, 0) end)', '\n        else true end)']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q('update public.purchase_prices set unit_price = unit_price + 1 where line_id = $1', [r1.line]);
        return (await q("select violations::int as v from public.verify_purchases() where check_name = 'purchase_price_ties'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 1),
    },
    {
      name: 'verify_purchases: لا سعر على مسوّدة',
      fns: [[FN.verify, [["  where r.status = 'draft'", '  where false']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q('insert into public.purchase_prices (org_id, doc_id, line_id, warehouse_id, item_id, unit_price) values ($1, $2, $3, $4, $5, 1)', [org, draftB.id, draftB.lines[0], W.raw, I.corn]);
        return (await q("select violations::int as v from public.verify_purchases() where check_name = 'purchase_price_draft'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 1),
    },
  ];
  const outcomes = [];
  for (const c of CASES) {
    const realOutcome = await mutant(db, U.manager, [], c.run);
    const broken = await mutant(db, U.manager, c.fns, c.run);
    outcomes.push({ name: c.name, real: c.expect(realOutcome), caught: !c.expect(broken), realOutcome, broken });
  }
  const show = (o) => (o.ok ? `ok:${JSON.stringify(o.value)?.slice(0, 60)}` : `${o.code} (${o.hint.slice(0, 50)})`);
  t.same(outcomes.filter((o) => !o.real).map((o) => `${o.name}: ${show(o.realOutcome)}`), [], `الطفرات (${CASES.length}): كلّ حالة على الشفرة الحقيقية بنتيجتها`);
  t.same(outcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${show(o.broken)}`), [], `الطفرات: ${outcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت (ومعها طفرة أقفال الشراء فوق)`);
  // طفرة مكافئة مكتوبة: مسح العلامة وحده بلا ربطها بالمستند لا يُرى، لأنّ العلامة لمستندها وحده (الدفاع طبقتان)؛ وطفرتها معاً فوق.
  const clearOnly = await mutant(db, U.manager, [[FN.record, [["  perform set_config('poultry.purchase_doc', '', true);\n", '']]]], CASES.find((c) => c.name.startsWith('العلامة تُمسح')).run);
  t.eq(clearOnly.ok ? 'ok' : clearOnly.code, 'forbidden', 'طفرة مكافئة: بلا مسح العلامة وحده تبقى مربوطة بمستندها فلا تتسرّب');

  if (process.env.PURCHASE_MUTATIONS_OUT) {
    const rows = outcomes.map((o) => ({ name: o.name, real: o.real, caught: o.caught, mutant: show(o.broken) }));
    rows.push({ name: 'أقفال الشراء قبل الكتابة (طفرة مثبَّتة بجلسات)', real: real.a1.ok && real.a2.ok, caught: mutantErrors.some((error) => /deadlock/u.test(error)), mutant: mutantErrors.join(' | ') });
    rows.push({ name: 'مسح العلامة وحده (مكافئة)', real: true, caught: false, mutant: clearOnly.ok ? 'ok' : clearOnly.code });
    writeFileSync(process.env.PURCHASE_MUTATIONS_OUT, `${JSON.stringify(rows, null, 2)}\n`);
  }

  // ── عيّنات حقيقية للتقرير (اختياري بمتغيّر بيئة): نتيجة الشراء وملفّ الذرة وبطاقات المواد للأمين ────────────────────────────────
  if (process.env.PURCHASE_SAMPLES_OUT) {
    writeFileSync(process.env.PURCHASE_SAMPLES_OUT, `${JSON.stringify({ record_purchase: first.value, item_file: keeperFile, items_overview: keeperBoard, item_file_mill_operator: millFile }, null, 2)}\n`);
  }
}
