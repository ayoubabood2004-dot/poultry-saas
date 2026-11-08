// عمليات المخزن البسيطة (0020؛ كلمة المالك 2026-11-08، DECISIONS «حذف المادّة، والرجوع، والسعر الاختياريّ، والتحويل، والبيع»):
// حذف المادّة (delete_item) حين لا يشير إليها شيء وإلّا item_in_use بأنواع استعمالها و«أخفِها»؛ والشراء بلا سعر (record_purchase بسعر فارغ:
// الكمية تدخل بقيمة صفر بلا قيد للمورّد، وبالدين وحده) و«أكمل السعر» (price_purchase على نواة تصحيح السعر في 0010: حصّة المتبقّي على الدفعة
// ومراياها، وما صُرف قبل التسعير مصروف «فرق سعر شراء»، وقيد purchase للمورّد بيوم التسعير)؛ وتحويل مادّة إلى مادّة (record_conversion: سحب
// بترتيب السحب ودفعة واحدة بقيمة السحب بالضبط، وvoid_conversion)؛ والنقل بخطوة واحدة (record_transfer على جسم ترحيل التحويل)؛ وملفّ المادّة
// بأفعاله وأين هي؛ والتزامن (تسعيران بلحظة واحدة)؛ والثوابت بضوابطها؛ وطفرات تكسر كلّ قاعدة فيفشل فحصها (آخر الملف).
import { writeFileSync } from 'node:fs';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { lotsOf, postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-08';
const id = (n) => `b1930000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099930${String(n).padStart(2, '0')}`;
/** يوم بإزاحة من اليوم المثبَّت (YYYY-MM-DD). */
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const RP = 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as v';
const PP = 'select public.price_purchase($1, $2, $3, $4) as v';
const RC = 'select public.record_conversion($1, $2, $3, $4, $5, $6, $7, $8, $9) as v';
const VC = 'select public.void_conversion($1, $2, $3) as v';
const RT = 'select public.record_transfer($1, $2, $3, $4, $5, $6, $7, $8) as v';
const DI = 'select public.delete_item($1, $2) as v';
const IF = 'select public.item_file($1) as v';
const IO = 'select public.items_overview() as v';
const FN = {
  deleteItem: 'public.delete_item(uuid, integer)',
  uses: 'private.item_uses(uuid)',
  record: 'public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid, date, timestamp with time zone)',
  price: 'public.price_purchase(uuid, uuid, numeric, numeric)',
  core: 'private.revaluation_post(uuid, numeric, text, text, uuid, numeric)',
  convert: 'public.record_conversion(uuid, uuid, uuid, numeric, uuid, numeric, date, uuid, uuid)',
  voidConvert: 'public.void_conversion(uuid, text, uuid)',
  transfer: 'public.record_transfer(uuid, uuid, uuid, uuid, numeric, uuid, uuid, date)',
  verifyOps: 'public.verify_store_ops()',
  verifyPurchases: 'public.verify_purchases()',
  verifyStock: 'public.verify_stock()',
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
const shownOf = (result) => (result.ok ? 'ok' : result.code);

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  // ── المنشأة: الأدوار الثمانية، وأمين بنطاق المعمل والمخازن العامّة، وأمين بنطاق المخازن العامّة وحدها ──────────────────────────────
  const G = await makeOrg(db, {
    name: 'مزرعة العمليات البسيطة',
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
  const farmSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الأمل', 'farm') returning id", [D.broiler]);
  W.farm = await store('broiler', farmSite, 'مخزن حقل الأمل', 'farm');

  const item = (name, kind, unit, extra = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry) values ($1, $2, $3, $4) returning id', [name, kind, unit, extra.tracksExpiry ?? false]);
  const I = {
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    mash: await item('مخلوط', 'feed', 'kg'),
    bags: await item('علف بادئ أكياس', 'feed', 'pc'),
    bulk: await item('علف بادئ سائب', 'feed', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    soyGrits: await item('صويا مجروشة', 'raw', 'kg'),
    barley: await item('شعير', 'raw', 'kg'),
    oats: await item('شوفان', 'raw', 'kg'),
    salt: await item('ملح', 'raw', 'kg'),
    race: await item('نخالة التزامن', 'raw', 'kg'),
    chicks: await item('أفراخ لحم', 'chick', 'pc'),
    vaccine: await item('لقاح نيوكاسل', 'vaccine', 'pc', { tracksExpiry: true }),
    diesel: await item('كاز', 'fuel', 'L'),
    old: await item('مادّة مؤرشفة', 'raw', 'kg'),
    fresh: await item('مادّة للحذف', 'raw', 'kg'),
    inRecipe: await item('إضافة في خلطة', 'additive', 'kg'),
    stale: await item('مادّة بنسخة', 'raw', 'kg'),
  };
  await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [I.old]);
  const pack = (await db.admin("select id from public.pack_types where org_id = $1 and factor = 50 and dimension = 'mass'", [org])).rows[0].id;
  await one(U.owner, "insert into public.item_units (item_id, pack_type_id, label, factor_to_base, is_default) values ($1, $2, 'كيس 50 كغم', 50, true) returning id", [I.fresh, pack]);
  await one(U.owner, 'select public.set_item_sell_price($1, 900, null) as v', [I.fresh]);
  const recipe = { id: uid(), version: uid() };
  await one(U.owner, "select public.create_recipe($1, $2, 'خلطة الإضافة', $3, 100, $4::jsonb, '[]'::jsonb, false) as v",
    [recipe.id, recipe.version, I.mash, JSON.stringify([{ item_id: I.inRecipe, qty: 100, unit: 'kg' }])]);

  await postedOpening(db, U.owner, W.raw, day(-6), [{ item: I.corn, qty: 2000, value: '900000.00' }, { item: I.race, qty: 100, value: '50000.00' }]);
  await postedOpening(db, U.owner, W.feed, day(-6), [{ item: I.bags, qty: 100, value: '1000000.00' }]);
  await postedOpening(db, U.owner, W.general, day(-6), [{ item: I.diesel, qty: 500, value: '400000.00' }]);
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");

  const samples = { refusals: {} };
  const refusal = (key, result) => {
    if (!result.ok) samples.refusals[key] = { code: result.code, hint: result.hint };
    return result;
  };
  const buy = (user, o) => call(db, user, RP, [o.ref ?? uid(), o.receipt ?? uid(), o.line ?? uid(), o.item, o.party ?? supplier, o.on ?? TODAY, o.qty,
    o.price ?? null, o.sell ?? null, o.payment ?? 'credit', o.box ?? null, o.wh ?? null]);
  const price = (user, o, options) => call(db, user, PP, [o.ref ?? uid(), o.line, o.price, o.sell ?? null], options);
  const convArgs = (o) => [o.ref ?? uid(), o.doc === undefined ? uid() : o.doc, o.from, o.fromQty, o.to, o.toQty, o.on ?? TODAY, o.fromWh ?? null, o.toWh ?? null];
  const convert = (user, o) => call(db, user, RC, convArgs(o));
  const unconvert = (user, doc, reason = 'تحويل خاطئ', ref = uid()) => call(db, user, VC, [doc, reason, ref]);
  const moveArgs = (o) => [o.ref ?? uid(), o.doc === undefined ? uid() : o.doc, o.line === undefined ? uid() : o.line, o.item, o.qty, o.from ?? null, o.to === undefined ? W.farm : o.to, o.on ?? TODAY];
  const move = (user, o) => call(db, user, RT, moveArgs(o));
  const file = async (user, itemId) => (await call(db, user, IF, [itemId], { commit: false })).value;
  const lots = async (itemId, wh) => (await lotsOf(db, itemId, wh)).map((l) => [l.source_kind, l.qty_left, l.value_left]);

  // ── ١) حذف المادّة ───────────────────────────────────────────────────────────────────────────────────────────────
  const freshFile = await file(U.manager, I.fresh);
  t.same([freshFile.can_delete, freshFile.uses, (await file(U.storekeeper, I.fresh)).can_delete], [true, [], false],
    'ملفّ مادّة لا يشير إليها شيء: «احذف» لمن يدير المخازن وحده، وبلا أنواع استعمال');
  const keeperDelete = refusal('forbidden', await call(db, U.storekeeper, DI, [I.fresh, 1]));
  t.eq(shownOf(keeperDelete), 'forbidden', 'الأمين لا يحذف مادّة (stores.manage)');
  const staleDelete = refusal('stale_item', await call(db, U.manager, DI, [I.stale, 7]));
  t.eq(shownOf(staleDelete), 'stale_item', 'نسخة قديمة من المادّة: stale_item');
  const deleted = await call(db, U.manager, DI, [I.fresh, 1]);
  t.same([deleted.ok, deleted.value], [true, { id: I.fresh, name: 'مادّة للحذف', deleted: true }], 'المدير يحذف المادّة غير المستعملة');
  t.same((await db.admin(`select (select count(*) from public.items where id = $1)::int as items, (select count(*) from public.item_units where item_id = $1)::int as units,
    (select count(*) from public.item_prices where item_id = $1)::int as prices`, [I.fresh])).rows[0], { items: 0, units: 0, prices: 0 },
  'حُذفت المادّة ووحدة تعبئتها وسعر بيعها معها');
  t.eq(shownOf(refusal('item_not_found', await call(db, U.manager, DI, [I.fresh, 1]))), 'item_not_found', 'حذف ثانٍ: item_not_found');
  const cornInUse = refusal('item_in_use', await call(db, U.manager, DI, [I.corn, 1]));
  t.same([cornInUse.code, cornInUse.hint.includes('لها حركات مخزون'), cornInUse.hint.includes('في رصيد افتتاحي'), cornInUse.hint.includes('أخفِها بدلاً من ذلك')],
    ['item_in_use', true, true, true], `مادّة لها رصيد: item_in_use يسمّي أنواع استعمالها و«أخفِها» (${cornInUse.hint})`);
  const recipeInUse = await call(db, U.manager, DI, [I.inRecipe, 1]);
  t.same([recipeInUse.code, recipeInUse.hint.includes('في خلطة')], ['item_in_use', true], `مادّة في خلطة بلا رصيد: item_in_use «في خلطة» (${recipeInUse.hint})`);
  t.same((await file(U.manager, I.corn)).uses, ['في رصيد افتتاحي', 'لها حركات مخزون'], 'ملفّ المادّة يسمّي أنواع استعمالها بترتيب الجداول، بلا تكرار');

  // ── ٢) الشراء بلا سعر ───────────────────────────────────────────────────────────────────────────────────────────
  const soyBuy = { ref: uid(), receipt: uid(), line: uid() };
  const soy = await buy(U.storekeeper, { ...soyBuy, item: I.soy, on: day(-3), qty: 1000, wh: W.raw });
  t.same([soy.ok, soy.value?.priced, soy.value?.payment, soy.value?.money?.unit_price, norm(soy.value?.money?.line_total)], [true, false, 'credit', null, '0'],
    `الأمين يسجّل شراء صويا بلا سعر: يُحفظ بالدين «بلا سعر» بمبلغ صفر (${soy.code ?? ''} ${soy.hint ?? ''})`);
  t.same(await lots(I.soy, W.raw), [['receipt', '1000', '0']], 'الكمية دخلت المخزن الآن بقيمة صفر');
  t.same((await db.admin(`select (select count(*) from public.party_entries where doc_id = $1)::int as entries,
    (select zero_reason from public.receipt_line_amounts where line_id = $2) as reason, (select unit_price from public.purchase_prices where line_id = $2) as price`,
  [soyBuy.receipt, soyBuy.line])).rows[0], { entries: 0, reason: 'بلا سعر: يُكمَّل لاحقاً', price: null }, 'لا قيد للمورّد قبل السعر، ومبلغ السطر صفر بسببه، وسعر الشراء فارغ');
  const soyAgain = await buy(U.storekeeper, { ...soyBuy, ref: uid(), item: I.soy, on: day(-3), qty: 1000, wh: W.raw });
  t.same([soyAgain.ok, soyAgain.value?.doc_no], [true, soy.value.doc_no], 'الإعادة بالمعرّفات نفسها ومرجع جديد (بلا سعر) ترجع ما حُفظ');
  const cashNoPrice = refusal('price_required_for_cash', await buy(U.storekeeper, { item: I.soy, qty: 10, wh: W.raw, payment: 'cash' }));
  t.eq(shownOf(cashNoPrice), 'price_required_for_cash', 'شراء بلا سعر نقداً: price_required_for_cash');
  t.eq(shownOf(await buy(U.storekeeper, { item: I.soy, qty: 10, wh: W.raw, price: -5 })), 'bad_price', 'السعر السالب ما زال bad_price');
  const keeperSoyFile = await file(U.storekeeper, I.soy);
  t.same([keeperSoyFile.unpriced_count, keeperSoyFile.can_price, keeperSoyFile.purchases[0].priced, keeperSoyFile.purchases[0].can_price, keeperSoyFile.purchases[0].money.unit_price,
    keeperSoyFile.money.avg_unit_price, keeperSoyFile.money.last_unit_price], [1, true, false, true, null, null, null],
  'ملفّ الصويا للأمين: شراء «بلا سعر» يُكمَّل، ولا متوسّط ولا آخر سعر من غير المسعَّر');
  const viewerSoyFile = await file(U.viewer, I.soy);
  t.same([viewerSoyFile.can_price, viewerSoyFile.unpriced_count, hasMoney(viewerSoyFile)], [false, 0, false], 'المشاهد بلا نطاق مخزن: لا مشتريات ولا مال ولا «أكمل السعر»');
  const overview = (await call(db, U.storekeeper, IO, [], { commit: false })).value;
  t.eq(overview.items.find((x) => x.id === I.soy)?.unpriced_count, 1, 'بطاقة الصويا في المخزن: شراء واحد بلا سعر');

  // ── ٣) تحويل مادّة إلى مادّة ───────────────────────────────────────────────────────────────────────────────────────
  const c1 = { ref: uid(), doc: uid(), from: I.corn, fromQty: 500, to: I.mash, toQty: 500 };
  const conv1 = await convert(U.storekeeper, c1);
  t.same([conv1.ok, conv1.value?.doc_no, conv1.value?.to?.warehouse_id, conv1.value?.from?.warehouse_id, hasMoney(conv1.value)], [true, 'CV-2026-0001', W.feed, W.raw, false],
    `الأمين يحوّل 500 كغم ذرة إلى «مخلوط»: من مخزن المواد إلى مخزن العلف (الوحيد الذي يستلمه) بلا مال للأمين (${conv1.code ?? ''} ${conv1.hint ?? ''})`);
  t.same(await lots(I.mash, W.feed), [['conversion', '500', '225000']], 'دفعة «مخلوط» واحدة قيمتها قيمة السحب بالضبط (500 × 450)');
  t.same(await lots(I.corn, W.raw), [['opening', '1500', '675000']], 'الذرة نقصت 500 كغم بقيمتها');
  t.eq((await db.asOwner((q) => q("select private.stock_doc_memo('conversion', $1, $2) as v", [c1.doc, W.raw]), U.owner)).rows[0].v, 'تحويل «ذرة صفراء» إلى «مخلوط»',
    'بيان حركة التحويل يسمّي المادّتين');
  const c2 = { ref: uid(), doc: uid(), from: I.bags, fromQty: 20, to: I.bulk, toQty: 1000 };
  const conv2 = await convert(U.owner, c2);
  t.same([conv2.ok, conv2.value?.doc_no, conv2.value?.to?.warehouse_id, norm(conv2.value?.money?.value), conv2.value?.to?.base_unit],
    [true, 'CV-2026-0002', W.feed, '200000', 'kg'], 'المالك يحوّل 20 كيساً إلى 1,000 كغم سائب في المخزن نفسه، بقيمة 200,000');
  const c3 = { ref: uid(), doc: uid(), from: I.soy, fromQty: 400, to: I.soyGrits, toQty: 400 };
  const conv3 = await convert(U.storekeeper, c3);
  t.same([conv3.ok, conv3.value?.to?.warehouse_id], [true, W.raw], 'تحويل صويا بلا سعر إلى «صويا مجروشة» في مخزنها (قيمة صفر)');
  const again1 = await convert(U.storekeeper, { ...c1, ref: uid() });
  t.same([again1.ok, again1.value?.doc_no], [true, 'CV-2026-0001'], 'الإعادة بالمعرّف نفسه ومرجع جديد ترجع ما حُفظ');
  const sameRef = await convert(U.storekeeper, c1);
  t.same([sameRef.ok, sameRef.value?.doc_no], [true, 'CV-2026-0001'], 'الإعادة بالمرجع نفسه ترجع المخزَّن');
  t.eq(shownOf(refusal('id_conflict', await convert(U.storekeeper, { ...c1, ref: uid(), fromQty: 501 }))), 'id_conflict', 'المعرّف نفسه بمحتوى آخر: id_conflict');
  const R = {
    same_item: await convert(U.owner, { from: I.corn, fromQty: 1, to: I.corn, toQty: 1 }),
    not_convertible: await convert(U.owner, { from: I.chicks, fromQty: 1, to: I.corn, toQty: 1 }),
    conversion_expiry: await convert(U.owner, { from: I.corn, fromQty: 1, to: I.vaccine, toQty: 1 }),
    qty_not_positive: await convert(U.owner, { from: I.corn, fromQty: 0, to: I.mash, toQty: 1 }),
    pieces_not_whole: await convert(U.owner, { from: I.bags, fromQty: 2.5, to: I.bulk, toQty: 125 }),
    item_archived: await convert(U.owner, { from: I.old, fromQty: 1, to: I.mash, toQty: 1 }),
    item_not_found: await convert(U.owner, { from: uid(), fromQty: 1, to: I.mash, toQty: 1 }),
    id_required: await convert(U.owner, { doc: null, from: I.corn, fromQty: 1, to: I.mash, toQty: 1 }),
    insufficient_stock: await convert(U.owner, { from: I.corn, fromQty: 99999, to: I.mash, toQty: 1 }),
    item_kind_mismatch: await convert(U.owner, { from: I.corn, fromQty: 1, to: I.mash, toQty: 1, toWh: W.general }),
    out_of_scope: await convert(U.keeperGeneral, { from: I.corn, fromQty: 1, to: I.mash, toQty: 1, fromWh: W.raw }),
    forbidden: await convert(U.accountant, { from: I.corn, fromQty: 1, to: I.mash, toQty: 1 }),
    date_in_future: await convert(U.owner, { from: I.corn, fromQty: 1, to: I.mash, toQty: 1, on: day(1) }),
  };
  for (const [key, result] of Object.entries(R)) refusal(`conversion.${key}`, result);
  t.same(Object.fromEntries(Object.entries(R).map(([key, result]) => [key, shownOf(result)])), Object.fromEntries(Object.keys(R).map((key) => [key, key])),
    'رفض التحويل: كلّ حالة برمزها');
  t.ok(R.insufficient_stock.hint.includes('عندك 1,500 كغم'), `النقص يسمّي «عندك» (${R.insufficient_stock.hint})`);

  // مخزن علف ثانٍ بعد التحويلات (فـ«مخلوط» كان يدخل مخزن العلف وحده)، فالنقل إليه ومنه.
  W.feed2 = await store('feed_mill', millSite, 'مخزن علف ثانٍ', 'feed');

  // ── ٤) النقل بخطوة واحدة ────────────────────────────────────────────────────────────────────────────────────────
  const t1 = { ref: uid(), doc: uid(), line: uid(), item: I.soy, qty: 100, to: W.raw2 };
  const move1 = await move(U.storekeeper, t1);
  t.same([move1.ok, move1.value?.doc_no, move1.value?.from_warehouse_id, move1.value?.to_warehouse_name, norm(move1.value?.qty), move1.value?.item_name, hasMoney(move1.value)],
    [true, 'TR-2026-0001', W.raw, 'مخزن مواد ثانٍ', '100', 'صويا', false], `الأمين ينقل 100 كغم صويا إلى المخزن الثاني بخطوة واحدة (المرسِل وحده) (${move1.code ?? ''} ${move1.hint ?? ''})`);
  t.same(await lots(I.soy, W.raw2), [['transfer', '100', '0']], 'مرآة الدفعة في المخزن الثاني (قيمة صفر قبل السعر)');
  const t2 = { ref: uid(), doc: uid(), line: uid(), item: I.bulk, qty: 300 };
  const move2 = await move(U.storekeeper, t2);
  t.same([move2.ok, move2.value?.to_warehouse_id, move2.value?.from_warehouse_name], [true, W.farm, 'مخزن العلف'], 'نقل 300 كغم سائب من مخزن العلف إلى مخزن الحقل');
  t.same([shownOf(await move(U.storekeeper, { ...t2, ref: uid() })), (await move(U.storekeeper, { ...t2, ref: uid() })).value?.doc_no], ['ok', 'TR-2026-0002'],
    'الإعادة بالمعرّفات نفسها ومرجع جديد ترجع ما حُفظ');
  t.eq(shownOf(await move(U.storekeeper, { ...t2, ref: uid(), qty: 301 })), 'id_conflict', 'المعرّفات نفسها بكمية أخرى: id_conflict');
  await one(U.owner, RT, moveArgs({ item: I.bulk, qty: 100, from: W.feed, to: W.feed2 }));
  const M = {
    same_warehouse: await move(U.owner, { item: I.bulk, qty: 1, from: W.feed, to: W.feed }),
    to_store_required: await move(U.owner, { item: I.bulk, qty: 1, from: W.feed, to: null }),
    item_kind_mismatch: await move(U.owner, { item: I.corn, qty: 1, to: W.farm }),
    insufficient_stock: await move(U.owner, { item: I.diesel, qty: 99999, from: W.general }),
    store_required: await move(U.owner, { item: I.bulk, qty: 1 }),
    out_of_scope: await move(U.keeperGeneral, { item: I.bulk, qty: 1, from: W.feed }),
    forbidden: await move(U.accountant, { item: I.bulk, qty: 1, from: W.feed }),
    item_archived: await move(U.owner, { item: I.old, qty: 1, to: W.raw2 }),
    pieces_not_whole: await move(U.owner, { item: I.bags, qty: 1.5, from: W.feed, to: W.feed2 }),
  };
  for (const [key, result] of Object.entries(M)) refusal(`transfer.${key}`, result);
  t.same(Object.fromEntries(Object.entries(M).map(([key, result]) => [key, shownOf(result)])), Object.fromEntries(Object.keys(M).map((key) => [key, key])),
    'رفض النقل: كلّ حالة برمزها');
  t.ok(M.store_required.hint.includes('«مخزن العلف»') && M.store_required.hint.includes('«مخزن علف ثانٍ»'), `أكثر من مخزن: يسمّيهما بكمياتهما (${M.store_required.hint})`);
  // التحويل (مراجعة 0020، للشاشة): غموض مخزن المصدر (الصويا في مخزني المواد) from_store_required بالكميات، وغموض المستلم («مخلوط» يدخل مخزني العلف)
  // store_required.
  const fromStore = refusal('conversion.from_store_required', await convert(U.owner, { from: I.soy, fromQty: 1, to: I.soyGrits, toQty: 1 }));
  const toStore = refusal('conversion.store_required', await convert(U.owner, { from: I.corn, fromQty: 1, to: I.mash, toQty: 1, fromWh: W.raw }));
  t.same([fromStore.code, fromStore.hint.includes('«مخزن مواد ثانٍ» (100 كغم)'), toStore.code, toStore.hint.includes('«مخزن علف ثانٍ»')],
    ['from_store_required', true, 'store_required', true], `التحويل: from_store_required للمصدر بكمياته، وstore_required للمستلم (${fromStore.hint} | ${toStore.hint})`);
  const t3 = { doc: uid(), item: I.diesel, qty: 10, to: W.farm };
  await one(U.storekeeper, RT, moveArgs(t3));
  const voidMove = await call(db, U.manager, 'select public.void_transfer($1, $2, $3) as v', [t3.doc, 'نقل للتجربة', uid()]);
  t.same([voidMove.ok, voidMove.value?.status, await lots(I.diesel, W.farm)], [true, 'void', [['transfer', '0', '0']]], 'النقل بخطوة واحدة يُلغى بـvoid_transfer القائمة');

  // ── ٥) «أكمل السعر» ──────────────────────────────────────────────────────────────────────────────────────────────
  const soyBook = B.feed_mill;
  const pricedFirst = { ref: uid(), line: soyBuy.line, price: 500, sell: 700 };
  const priced = await price(U.storekeeper, pricedFirst);
  t.same([priced.ok, priced.value?.priced, norm(priced.value?.money?.line_total), norm(priced.value?.money?.unit_price), norm(priced.value?.money?.sell_price),
    priced.value?.used_before_pricing, hasMoney(priced.value?.valuation)], [true, true, '500000', '500', '700', true, false],
  `الأمين يكمل سعر الصويا 500 للكيلو: المبلغ 500,000، وما صُرف قبله مُعلَّم، وتوزيع القيمة مخفيّ عنه (${priced.code ?? ''} ${priced.hint ?? ''})`);
  t.same([await lots(I.soy, W.raw), await lots(I.soy, W.raw2), await lots(I.soyGrits, W.raw)],
    [[['receipt', '500', '250000']], [['transfer', '100', '50000']], [['conversion', '400', '0']]],
  'حصّة المتبقّي على الدفعة ومرآتها (600 من 1,000 = 300,000 بالكميات)، و«صويا مجروشة» المصنوعة قبل السعر لا تُمسّ');
  const priceRows = (await db.admin(`select e.kind, e.amount::text as amount, e.book_id = $2 as book, x.amount::text as expense, k.system_code
    from public.receipt_revaluations v join public.party_entries e on e.id = v.party_entry_id left join public.expenses x on x.id = v.expense_id
    left join public.expense_categories k on k.id = x.category_id where v.receipt_line_id = $1 and v.status = 'posted'`, [soyBuy.line, soyBook])).rows;
  t.same(priceRows, [{ kind: 'purchase', amount: '-500000', book: true, expense: '200000.00', system_code: 'purchase_price_diff' }],
    'قيد purchase للمورّد −500,000 بدفتر الشراء، والمستهلك قبل السعر مصروف «فرق سعر شراء» 200,000');
  const accountantView = await price(U.accountant, pricedFirst);
  t.same([accountantView.ok, accountantView.code], [false, 'ref_reused'], 'المرجع نفسه من مستخدم آخر: ref_reused');
  const cachedPrice = await price(U.storekeeper, pricedFirst);
  t.same([cachedPrice.ok, cachedPrice.value], [true, priced.value], 'الإعادة بالمرجع نفسه ترجع النتيجة نفسها (بلا قناع للسعر، ومقنَّع التوزيع)');
  t.eq(shownOf(refusal('ref_reused', await price(U.storekeeper, { ...pricedFirst, price: 501 }))), 'ref_reused', 'المرجع نفسه بسعر آخر: ref_reused');
  const twice = refusal('already_priced', await price(U.storekeeper, { line: soyBuy.line, price: 510 }));
  t.eq(shownOf(twice), 'already_priced', 'تسعير ثانٍ للشراء نفسه: already_priced');
  const soyFile = await file(U.storekeeper, I.soy);
  t.same([soyFile.unpriced_count, soyFile.can_price, soyFile.purchases[0].priced, norm(soyFile.purchases[0].money.unit_price), norm(soyFile.money.sell_price),
    norm(soyFile.money.avg_unit_price), norm(soyFile.money.last_unit_price)], [0, false, true, '500', '700', '500', '500'],
  'ملفّ الصويا بعد السعر: مسعَّر بسعره كما كُتب، وسعر البيع الحاليّ منه، والمتوسّط وآخر سعر');
  const cornBuy = { line: uid() };
  await one(U.owner, RP, [uid(), uid(), cornBuy.line, I.corn, supplier, TODAY, 100, 460, null, 'credit', null, W.raw]);
  t.eq(shownOf(await price(U.owner, { line: cornBuy.line, price: 470 })), 'already_priced', 'شراء سُجّل بسعره: already_priced');
  const barleyBuy = { receipt: uid(), line: uid() };
  await one(U.owner, RP, [uid(), barleyBuy.receipt, barleyBuy.line, I.barley, supplier, TODAY, 200, null, null, 'credit', null, W.raw]);
  await one(U.manager, 'select public.void_receipt($1, $2, $3) as v', [barleyBuy.receipt, 'شراء مكرّر', uid()]);
  t.eq(shownOf(refusal('purchase_voided', await price(U.owner, { line: barleyBuy.line, price: 300 }))), 'purchase_voided', 'شراء أُلغي: purchase_voided');
  const saltBuy = { line: uid() };
  await one(U.owner, RP, [uid(), uid(), saltBuy.line, I.salt, supplier, TODAY, 1, null, null, 'credit', null, W.raw]);
  const P = {
    total_zero: await price(U.owner, { line: saltBuy.line, price: 0.4 }),
    bad_price: await price(U.owner, { line: saltBuy.line, price: 1.234 }),
    line_not_found: await price(U.owner, { line: uid(), price: 10 }),
    id_required: await price(U.owner, { line: null, price: 10 }),
    forbidden: await price(U.viewer, { line: saltBuy.line, price: 10 }),
    out_of_scope: await price(U.keeperGeneral, { line: saltBuy.line, price: 10 }),
  };
  for (const [key, result] of Object.entries(P)) refusal(`price.${key}`, result);
  t.same(Object.fromEntries(Object.entries(P).map(([key, result]) => [key, shownOf(result)])), Object.fromEntries(Object.keys(P).map((key) => [key, key])),
    'رفض «أكمل السعر»: كلّ حالة برمزها');
  const oatsBuy = { line: uid() };
  await one(U.owner, RP, [uid(), uid(), oatsBuy.line, I.oats, supplier, TODAY, 300, null, null, 'credit', null, W.raw]);
  const untouched = await price(U.accountant, { line: oatsBuy.line, price: 300 });
  t.same([untouched.ok, untouched.value?.used_before_pricing, norm(untouched.value?.valuation?.money?.lot_share), norm(untouched.value?.valuation?.money?.expense_amount)],
    [true, false, '90000', '0'], 'تسعير شراء لم يُسحب منه شيء: القيمة كلّها على الدفعة، والمحاسب يرى التوزيع');
  t.same(await lots(I.oats, W.raw), [['receipt', '300', '90000']], 'دفعة الشوفان بقيمة سعرها');

  // ── ٦) التصحيح بعد التسعير، وإلغاء التسعير يُرجع الشراء «بلا سعر» ───────────────────────────────────────────────────────
  const revalue = (user, line, total, reason = 'فاتورة معدّلة') => call(db, user,
    'select public.post_receipt_revalue($1, $2, public.preview_receipt_revalue($1, $2) ->> \'plan\', $3, $4) as v', [line, total, reason, uid()]);
  t.eq(shownOf(refusal('unpriced_line', await revalue(U.manager, saltBuy.line, 5))), 'unpriced_line', 'تصحيح سعر شراء بلا سعر: unpriced_line («أكمل السعر» أوّلاً)');
  const corrected = await revalue(U.manager, soyBuy.line, 520000);
  t.same([corrected.ok, norm(corrected.value?.money?.diff ?? corrected.value?.diff)], [true, '20000'], `التصحيح العاديّ بعد التسعير يعمل (${corrected.code ?? ''} ${corrected.hint ?? ''})`);
  const correctedFile = await file(U.manager, I.soy);
  t.same([correctedFile.purchases[0].money.corrected, norm(correctedFile.purchases[0].money.unit_price), norm(correctedFile.purchases[0].money.line_total)], [true, '520', '520000'],
    'ملفّ الصويا بعد التصحيح: مصحَّح بسعر الوحدة من المبلغ');
  const revRows = async () => (await db.admin('select id, unit_price::text as unit_price, status from public.receipt_revaluations where receipt_line_id = $1 order by rev_no', [soyBuy.line])).rows;
  const [pricingRev, correctionRev] = await revRows();
  t.eq(shownOf(await call(db, U.manager, 'select public.void_receipt_revalue($1, $2, $3) as v', [pricingRev.id, 'سعر خاطئ', uid()])), 'newer_revaluation',
    'إلغاء التسعير قبل تصحيح أحدث منه: newer_revaluation (السلسلة من آخرها)');
  await one(U.manager, 'select public.void_receipt_revalue($1, $2, $3) as v', [correctionRev.id, 'تصحيح خاطئ', uid()]);
  await one(U.manager, 'select public.void_receipt_revalue($1, $2, $3) as v', [pricingRev.id, 'سعر خاطئ', uid()]);
  const unpricedAgain = await file(U.storekeeper, I.soy);
  t.same([unpricedAgain.unpriced_count, unpricedAgain.purchases[0].priced, await lots(I.soy, W.raw)], [1, false, [['receipt', '500', '0']]],
    'إلغاء التسعير يُرجع الشراء «بلا سعر» والدفعة بقيمة صفر');
  const repriced = await price(U.storekeeper, { line: soyBuy.line, price: 480 });
  t.same([repriced.ok, await lots(I.soy, W.raw), await lots(I.soy, W.raw2)], [true, [['receipt', '500', '240000']], [['transfer', '100', '48000']]],
    'التسعير من جديد بعد الإلغاء: 480 للكيلو، والحصص على المتبقّي');
  t.same((await revRows()).map((r) => [r.unit_price, r.status]), [['500', 'void'], [null, 'void'], ['480', 'posted']], 'صفوف التسعير والتصحيح بالسلسلة');

  // ── ٧) إلغاء التحويل ──────────────────────────────────────────────────────────────────────────────────────────
  t.eq(shownOf(await unconvert(U.storekeeper, c1.doc)), 'forbidden', 'الأمين لا يلغي (void)');
  const consumed = refusal('lot_consumed', await unconvert(U.manager, c2.doc));
  t.eq(shownOf(consumed), 'lot_consumed', 'إلغاء تحويل صُرف من ناتجه (نُقل منه): lot_consumed');
  const voided = await unconvert(U.manager, c1.doc);
  t.same([voided.ok, voided.value?.status, voided.value?.reversed_moves, voided.value?.voided_on], [true, 'void', 2, TODAY], 'المدير يلغي تحويل الذرة: حركتان عكسيتان بيوم الإلغاء');
  t.same([await lots(I.corn, W.raw), await lots(I.mash, W.feed)], [[['opening', '2000', '900000'], ['receipt', '100', '46000']], [['conversion', '0', '0']]],
    'الذرة رجعت لدفعتها بقيمتها، ودفعة «مخلوط» صفر');
  t.eq(shownOf(refusal('already_void', await unconvert(U.manager, c1.doc))), 'already_void', 'إلغاء ثانٍ: already_void');
  t.eq(shownOf(await convert(U.storekeeper, c1)), 'id_conflict', 'إعادة تحويل أُلغي بمرجعه: id_conflict');
  const redo = await convert(U.storekeeper, { ...c1, ref: uid() });
  t.same([redo.ok, redo.code, redo.hint.includes('أُلغي')], [false, 'id_conflict', true], 'إعادة تحويل أُلغي بمعرّفه ومرجع جديد: id_conflict «أُلغي»');

  // ── ٨) ملفّ المادّة: أين هي، وأفعالها ─────────────────────────────────────────────────────────────────────────────
  const bulkFile = await file(U.storekeeper, I.bulk);
  t.same([bulkFile.can_convert, bulkFile.can_transfer, bulkFile.can_sell, bulkFile.can_delete, bulkFile.stores.map((s) => [s.name, norm(s.qty), norm(s.available)])],
    [true, true, true, false, [['مخزن العلف', '600', '600'], ['مخزن علف ثانٍ', '100', '100']]],
  'ملفّ السائب للأمين: يحوّل وينقل ويبيع، ولا يحذف، وأين هو بنطاقه (مخزن الحقل خارج نطاقه)');
  const ownerBulk = await file(U.owner, I.bulk);
  t.same([ownerBulk.stores.length, ownerBulk.transfer_targets.map((s) => s.name)], [3, ['مخزن العلف', 'مخزن حقل الأمل', 'مخزن علف ثانٍ']], 'المالك يرى المخازن الثلاثة، ومخازن النقل التي تقبل العلف');
  const viewerBulk = await file(U.viewer, I.bulk);
  t.same([viewerBulk.can_convert, viewerBulk.can_transfer, viewerBulk.can_sell, viewerBulk.can_delete], [false, false, false, false], 'المشاهد بلا أفعال');
  const chickFile = await file(U.owner, I.chicks);
  t.same([chickFile.can_convert, chickFile.can_sell, chickFile.can_delete], [false, false, true], 'الأفراخ بلا رصيد: لا تحويل ولا بيع، وتُحذف (لا يشير إليها شيء)');

  // ── ٩) التزامن: تسعيران لشراء واحد بلحظة واحدة — الثاني ينتظر قفل الدفعات ثمّ يرى الأوّل ─────────────────────────────────────────
  const raceBuy = { line: uid() };
  await one(U.owner, RP, [uid(), uid(), raceBuy.line, I.race, supplier, TODAY, 50, null, null, 'credit', null, W.raw]);
  const raceRun = async () => {
    const s1 = await db.session(U.storekeeper);
    const s2 = await db.session(U.owner);
    try {
      const a1 = await s1.run(PP, [uid(), raceBuy.line, 400, null]);
      const p2 = s2.run(PP, [uid(), raceBuy.line, 410, null]);
      const st2 = await db.settle(p2, s2.pid);
      await s1.commit();
      const a2 = await p2;
      return { a1, st2, a2 };
    } finally {
      await s1.rollback();
      await s2.rollback();
    }
  };
  const race = await raceRun();
  t.same([race.a1.ok, race.st2, race.a2.ok, race.a2.error], [true, 'blocked', false, 'already_priced'], 'تسعيران بلحظة واحدة: الثاني ينتظر الأوّل ثمّ يرى أنّه مسعَّر');

  // ── ١٠) الثوابت وضوابطها ──────────────────────────────────────────────────────────────────────────────────────
  const verifyMap = async (q, fn) => Object.fromEntries((await q(`select check_name, violations::int as v from public.${fn}()`)).rows.map((r) => [r.check_name, r.v]));
  t.same(await db.asService((q) => verifyMap(q, 'verify_store_ops')), { conversion_moves: 0, conversion_orphans: 0 }, 'verify_store_ops: صفر على بيانات حقيقية (مرحَّل وملغى)');
  t.same(await db.asService((q) => verifyMap(q, 'verify_purchases')), { purchase_price_ties: 0, purchase_price_draft: 0, purchase_pricing_ties: 0, unpriced_returns: 0 },
    'verify_purchases: صفر مع الشراء بلا سعر والتسعير والتصحيح');
  const stockChecks = await db.asService((q) => verifyMap(q, 'verify_stock'));
  t.same(Object.entries(stockChecks).filter(([, v]) => v !== 0), [], 'verify_stock: كلّ الفحوص صفر');
  const planted = async (statements, fn) => db.asOwner(async (q) => {
    for (const [sql, params] of statements) await q(sql, params);
    return verifyMap(q, fn);
  });
  const lotValue = await planted([["update public.stock_lots set value_in = value_in + 1, value_left = value_left + 1 where source_kind = 'conversion' and source_id = $1", [c2.doc]]], 'verify_store_ops');
  t.eq(lotValue.conversion_moves, 1, 'ضابط: دفعة تحويل قيمتها غير قيمة السحب تُمسك (conversion_moves)');
  const orphanLot = await planted([["update public.stock_lots set source_id = $1 where source_kind = 'conversion' and source_id = $2", [uid(), c3.doc]]], 'verify_store_ops');
  t.same([orphanLot.conversion_orphans > 0, orphanLot.conversion_moves], [true, 1], 'ضابط: دفعة تحويل بلا تحويل تُمسك (conversion_orphans)');
  const pricingTie = await planted([["update public.receipt_revaluations set unit_price = unit_price + 1 where receipt_line_id = $1 and status = 'posted'", [soyBuy.line]]], 'verify_purchases');
  t.eq(pricingTie.purchase_pricing_ties, 1, 'ضابط: تسعير مبلغه غير الكمية × سعره يُمسك (purchase_pricing_ties)');
  const unpricedTie = await planted([['alter table public.receipt_line_amounts disable trigger receipt_line_amounts_guard'],
    ['update public.receipt_line_amounts set zero_reason = null where line_id = $1', [saltBuy.line]]], 'verify_purchases');
  t.eq(unpricedTie.purchase_price_ties, 1, 'ضابط: شراء بلا سعر بلا سبب الصفر يُمسك (purchase_price_ties)');
  const kindTie = await planted([['alter table public.party_entries disable trigger party_entries_append_only'], ["update public.party_entries set kind = 'adjustment' where id = (select party_entry_id from public.receipt_revaluations where receipt_line_id = $1 and status = 'posted')", [soyBuy.line]]], 'verify_stock');
  t.eq(kindTie.revaluation_ties, 1, 'ضابط: قيد التسعير بنوع غير purchase يُمسك (revaluation_ties)');

  // ── ١١) الطفرات: كلّ قاعدة أضافتها 0020 بتطبيق بديل معقول يكسرها، فيفشل فحصها ───────────────────────────────────────────────
  const code = (expected, hint) => (r) => !r.ok && r.code === expected && (!hint || r.hint.includes(hint));
  const okWith = (pick, value) => (r) => r.ok && pick(r.value) === value;
  const fresh = async (q, name, kind = 'raw', unit = 'kg') => (await q('insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit])).rows[0].id;
  const CASES = [
    {
      name: 'الحذف يحذف سعر البيع معها',
      fns: [[FN.deleteItem, [['  delete from public.item_prices where org_id = v_org and item_id = i.id;\n', '']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => {
        const x = await fresh(q, 'مادّة بسعر');
        await q('select public.set_item_sell_price($1, 100, null)', [x]);
        return (await q(DI, [x, 1])).rows[0].v.deleted;
      }),
      expect: okWith((v) => v, true),
    },
    {
      name: 'الحذف بنسخة المادّة',
      fns: [[FN.deleteItem, [['  if p_expected_version is null or i.version <> p_expected_version then\n', '  if false then\n']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q(DI, [I.stale, 9])).rows[0].v),
      expect: code('stale_item'),
    },
    {
      name: 'أنواع الاستعمال من كلّ مفتاح أجنبيّ (لا جداول المخزون وحدها)',
      fns: [[FN.uses, [["where c.contype = 'f' and c.confrelid = 'public.items'::regclass and cl.relname not in ('item_units', 'item_prices')",
        "where c.contype = 'f' and c.confrelid = 'public.items'::regclass and cl.relname in ('stock_moves', 'stock_lots', 'stock_balances')"]]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q(DI, [I.inRecipe, 1])).rows[0].v),
      expect: code('item_in_use', 'في خلطة'),
    },
    {
      name: 'الشراء بلا سعر بالدين وحده',
      fns: [[FN.record, [["  if p_payment = 'cash' and p_unit_price is null then\n", '  if false then\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const box = (await q("insert into public.cash_accounts (name, kind) values ('صندوق الطفرة', 'cash') returning id")).rows[0].id;
        return (await q(RP, [uid(), uid(), uid(), I.soy, supplier, TODAY, 5, null, null, 'cash', box, W.raw])).rows[0].v;
      }),
      expect: code('price_required_for_cash'),
    },
    {
      name: 'حصّة المتبقّي وحدها على الدفعة (لا الفرق كلّه)',
      fns: [[FN.core, [["  v_share := (v_plan ->> 'lot_share')::numeric;\n", '  v_share := v_diff;\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const line = uid();
        await q(RP, [uid(), uid(), line, I.barley, supplier, TODAY, 100, null, null, 'credit', null, W.raw]);
        await q(RC, [uid(), uid(), I.barley, 40, I.soyGrits, 40, TODAY, null, null]);
        const result = (await q(PP, [uid(), line, 10, null])).rows[0].v;
        return [result.used_before_pricing, norm(result.valuation.money.lot_share), norm(result.valuation.money.expense_amount)].join('/');
      }),
      expect: okWith((v) => v, 'true/600/400'),
    },
    {
      name: 'قيد التسعير purchase لا adjustment',
      fns: [[FN.core, [["case when v_pricing then 'purchase' else 'adjustment' end", "'adjustment'"]]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q(PP, [uid(), saltBuy.line, 20, null]);
        return (await q("select e.kind from public.receipt_revaluations v join public.party_entries e on e.id = v.party_entry_id where v.receipt_line_id = $1 and v.status = 'posted'", [saltBuy.line])).rows[0].kind;
      }),
      expect: okWith((v) => v, 'purchase'),
    },
    {
      name: 'المسعَّر لا يُسعَّر ثانية (الفحص بعد قفل الدفعات)',
      fns: [[FN.core, [['  if v_pricing and not v_unpriced then\n', '  if false then\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(PP, [uid(), soyBuy.line, 490, null])).rows[0].v),
      expect: code('already_priced'),
    },
    {
      name: 'التصحيح العاديّ يرفض شراءً بلا سعر',
      fns: [[FN.core, [['  if not v_pricing and v_unpriced then\n', '  if false then\n']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q("select public.post_receipt_revalue($1, 5, public.preview_receipt_revalue($1, 5) ->> 'plan', 'ضابط', $2) as v", [saltBuy.line, uid()])).rows[0].v),
      expect: code('unpriced_line'),
    },
    {
      name: 'قيمة دفعة التحويل = قيمة السحب (لا متوسّط الرصيد)',
      fns: [[FN.convert, [['    v_total := v_total + dr.value;\n',
        '    v_total := v_total + private._mul_div_round2(dr.qty, (select b.value + dr.value from public.stock_balances b where b.org_id = v_org and b.item_id = a.id and b.warehouse_id = wf.id), (select b.qty + dr.qty from public.stock_balances b where b.org_id = v_org and b.item_id = a.id and b.warehouse_id = wf.id) + 1);\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const doc = uid();
        const result = (await q(RC, [uid(), doc, I.corn, 700, I.mash, 700, TODAY, null, W.feed])).rows[0].v;
        const drawn = (await q("select -sum(value) as v from public.stock_moves where doc_kind = 'conversion' and doc_id = $1 and qty < 0", [doc])).rows[0].v;
        return norm(result.money.value) === norm(drawn);
      }),
      expect: okWith((v) => v, true),
    },
    {
      name: 'مخزن الناتج يقبل نوعه (لا مخزن المصدر دائماً)',
      fns: [[FN.convert, [['  elsif private.item_admissible(wf.kind, b.kind) then\n', '  elsif true then\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(RC, [uid(), uid(), I.corn, 10, await fresh(q, 'فيتامين', 'medicine'), 10, TODAY, null, null])).rows[0].v.to.warehouse_id),
      expect: okWith((v) => v, W.medicine),
    },
    {
      name: 'الإلغاء يرفض ناتجاً صُرف منه',
      fns: [[FN.voidConvert, [['  perform private.check_lot_intact(l.id);\n', '']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q(VC, [c2.doc, 'ضابط', uid()])).rows[0].v),
      expect: code('lot_consumed'),
    },
    {
      name: 'النقل: المرسِل وحده بلا المستلم',
      fns: [[FN.transfer, [['    where y.org_id = v_org and y.archived_at is null and y.id <> wt.id and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);\n',
        '    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(RT, [uid(), uid(), uid(), I.soy, 10, null, W.raw2, TODAY])).rows[0].v.from_warehouse_id),
      expect: okWith((v) => v, W.raw),
    },
    {
      name: 'verify_store_ops: دفعة التحويل بقيمة السحب',
      fns: [[FN.verifyOps, [['and l.value_in = a.drawn_value and l.origin_lot_id is null', 'and l.origin_lot_id is null']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q('alter table public.stock_moves disable trigger stock_moves_append_only');
        await q("update public.stock_lots set value_in = value_in + 1, value_left = value_left + 1 where source_kind = 'conversion' and source_id = $1", [c3.doc]);
        await q("update public.stock_moves set value = value + 1 where doc_kind = 'conversion' and doc_id = $1 and qty > 0", [c3.doc]);
        return (await q("select violations::int as v from public.verify_store_ops() where check_name = 'conversion_moves'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 1),
    },
    {
      name: 'verify_purchases: التسعير = الكمية × السعر',
      fns: [[FN.verifyPurchases, [['      or v.new_total <> private._mul_div_round(x.qty_in_unit, v.unit_price, 1, 0)\n', '']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q("update public.receipt_revaluations set unit_price = unit_price + 1 where receipt_line_id = $1 and status = 'posted'", [soyBuy.line]);
        return (await q("select violations::int as v from public.verify_purchases() where check_name = 'purchase_pricing_ties'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 1),
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
  if (process.env.SIMPLE_OPS_MUTATIONS_OUT) {
    writeFileSync(process.env.SIMPLE_OPS_MUTATIONS_OUT, `${JSON.stringify(mutationOutcomes.map((o) => ({ name: o.name, real: o.real, caught: o.caught, mutant: show(o.broken) })), null, 2)}\n`);
  }

  // ── عيّنات حقيقية للشاشات (اختياري بمتغيّر بيئة) ──────────────────────────────────────────────────────────────────
  if (process.env.SIMPLE_OPS_SAMPLES_OUT) {
    const sample = {
      generated_by: `supabase/tests/simple-ops.test.mjs (embedded Postgres 17، اليوم المثبَّت ${TODAY})`,
      delete_item: { manager: deleted.value, item_in_use: { code: cornInUse.code, hint: cornInUse.hint } },
      record_purchase_unpriced: { storekeeper: soy.value },
      price_purchase: { storekeeper: priced.value, accountant_untouched: untouched.value },
      record_conversion: { storekeeper: conv1.value, owner: conv2.value },
      void_conversion: { manager: voided.value },
      record_transfer: { storekeeper: move1.value, owner_farm: move2.value },
      item_file: {
        storekeeper_unpriced: keeperSoyFile,
        viewer_unpriced: viewerSoyFile,
        storekeeper_bulk: bulkFile,
        owner_bulk: ownerBulk,
        manager_fresh_before_delete: freshFile,
      },
      items_overview: { storekeeper: overview },
      refusals: samples.refusals,
    };
    writeFileSync(process.env.SIMPLE_OPS_SAMPLES_OUT, `${JSON.stringify(sample, null, 2)}\n`);
  }
}
