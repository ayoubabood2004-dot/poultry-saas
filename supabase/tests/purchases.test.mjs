// سجلّ شراء المادّة وبطاقات المخازن (0013؛ تجربة الاستخدام الجزء الثاني، كلمة المالك 2026-11-02): نفس المادّة تُشترى ثلاث مرّات
// من مورّدين بأسعار مختلفة، ومرّة بتحميل وخصم، فـinvoice_total وlanded_value وunit_cost تختلف ثلاثتها ويُفحص كلّ رقم بالضبط
// (مشتقّ باليد في التعليقات)؛ والصفحات؛ وp_warehouse فارغاً (كلّ مخازن النطاق) أو مخزناً؛ ورفض المخزن خارج النطاق؛ ومرآة التحويل
// لا تظهر (الجذور من الاستلام فقط)؛ وسطر صحّحت فاتورته corrected صحيح؛ وبطاقات المخازن بأعدادها وتنبيهاتها وقيمة متاحها؛
// وصلاحية item.create (الأمين يضيف مادّة ووحدتها، ولا يعدّل ولا يؤرشف ولا يضيف مخزناً، والمدير والمالك كما كانا).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, uid } from './ledger-kit.mjs';
import { postedReceipt } from './receipt-kit.mjs';
import { makeStockOrg, postedOpening, postedTransfer } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** محلّل الشاشات الحقيقي لجوابَي 0013 (الطرفان على عقد واحد، مثل flocks.test): مو نسخة منه ولا جواب مكتوب باليد. */
async function screensParser() {
  const result = await build({
    stdin: { contents: "export { parseItemPurchases, parseStoresOverview } from './src/lib/repo/inventory.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const TODAY = '2026-11-02';
const GO_LIVE = '2026-10-10';
const id = (n) => `b1300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099300${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

/** أيّ مفتاح money بأيّ عمق (مرآة cost-leak): الكلف كلّها داخل money بالعقد. */
function moneyKeys(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => moneyKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => [...(key === 'money' ? [`${path}.${key}`] : []), ...moneyKeys(v, `${path}.${key}`)]);
  }
  return [];
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة الشراء', id, phone, goLive: GO_LIVE });
  const { users: U, W, I } = S;
  const one = S.one;

  // ── المادّة ووحدتها والمورّدان والناقل ─────────────────────────────────────────────────────────────────────────
  // نشارة خشب (kind = 'other'، فمخازنها المستلِمة من المورّد نوع general بالضبط: private.receiving_kinds)، بوحدة «كيس 50 كغم»
  // مخصّصة (بلا حجم تعبئة)، وحدّ أدنى 1,000 كغم حتى يكون لتنبيه «تحت الحدّ الأدنى» ضابط إيجابي في بطاقة المخزن.
  const sawdust = await one(U.owner, "insert into public.items (name, kind, base_unit, min_qty) values ('نشارة خشب', 'other', 'kg', 1000) returning id");
  const bag = await one(U.owner, "insert into public.item_units (item_id, label, factor_to_base, is_default) values ($1, 'كيس 50 كغم', 50, true) returning id", [sawdust]);
  // مادّة بلا رصيد ووحدتها: التعديل والأرشفة يُجرَّبان عليها (المادّة التي عليها رصيد لا تُؤرشف أصلاً، E35).
  const spare = await one(U.owner, "insert into public.items (name, kind, base_unit) values ('نشارة الاحتياط', 'other', 'kg') returning id");
  const spareUnit = await one(U.owner, "insert into public.item_units (item_id, label, factor_to_base) values ($1, 'كيس 20 كغم', 20) returning id", [spare]);
  const first = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد النشارة الأوّل', true) returning id");
  const second = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد النشارة الثاني', true) returning id");
  const carrier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('ناقل النشارة', true) returning id");
  const upkeep = await one(U.accountant, "insert into public.expense_categories (name) values ('صيانة') returning id");

  // ── ثلاثة استلامات لنفس المادّة (كلّها خلال سبعة أيام من اليوم، check_doc_date) ────────────────────────────────────
  // ١) المورّد الأوّل 2026-10-27 بالمخزن العامّ: 10 أكياس × 50 = 500 كغم بفاتورة 400,000، وخصم 2,500، وتحميل نقل 5,000 بالقيمة
  //    على الناقل. السطر واحد فحصّته كلّ المبلغ: حصّة الخصم 2,500.00 وحصّة التحميل 5,000.00، فقيمة الدفعة الداخلة
  //    = 400,000 − 2,500 + 5,000 = 402,500.00 (وسعر الوحدة قبل التصحيح 402,500 ÷ 500 = 805.00).
  const buyOne = await postedReceipt(db, {
    keeper: U.storekeeper, pricer: U.manager, wh: W.general, party: first, on: '2026-10-27',
    lines: [{ item: sawdust, qty: 10, unit: bag, lotNo: 'L-77' }],
    totals: [400000], discount: 2500, charges: [{ label: 'نقل', amount: 5000, by: 'value', payee: carrier }],
  });
  // ٢) المورّد الثاني 2026-10-29 بالمخزن العامّ: 6 أكياس = 300 كغم بفاتورة 255,000 بلا خصم ولا تحميل:
  //    قيمة الدفعة = 255,000.00، وسعر الوحدة 255,000 ÷ 300 = 850.00.
  const buyTwo = await postedReceipt(db, {
    keeper: U.storekeeper, pricer: U.manager, wh: W.general, party: second, on: '2026-10-29',
    lines: [{ item: sawdust, qty: 6, unit: bag }], totals: [255000],
  });
  // ٣) المورّد الأوّل 2026-10-30 بالمخزن العامّ الثاني (بيد المدير: الأمين بنطاق العامّ وحده): كيسان = 100 كغم بفاتورة 90,000،
  //    فالقيمة 90,000.00 وسعر الوحدة 900.00.
  const buyThree = await postedReceipt(db, {
    keeper: U.manager, pricer: U.manager, wh: W.general2, party: first, on: '2026-10-30',
    lines: [{ item: sawdust, qty: 2, unit: bag }], totals: [90000],
  });

  // ── سحب ثمّ تصحيح سعر على السطر الأوّل ──────────────────────────────────────────────────────────────────────────
  // تحويل 50 كغم من العامّ إلى مخزن حقل 1 (مرآة بنفس المادّة ومخزن آخر، أصلها الدفعة الجذر: ليست شراءً)، وصرف 100 كغم من
  // العامّ؛ وكلاهما يسحب من الدفعة الأقدم. فالجذر 500 − 50 − 100 = 350 متبقّياً، والمرآة 50، ومجموع العائلة 400 من 500.
  await postedTransfer(db, U.storekeeper, W.general, W.farm1, TODAY, [{ item: sawdust, qty: 50 }]);
  const use = await db.asUser(
    U.storekeeper,
    async (q) => {
      const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.general, upkeep, TODAY])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 100)', [docId, sawdust]);
      return (await q('select id, version from public.stock_uses where id = $1', [docId])).rows[0];
    },
    { commit: true },
  );
  const usePosted = await call(db, U.storekeeper, "select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', $3)", [use.id, use.version, uid()]);
  t.ok(usePosted.ok, `الصرف انرحّل (${usePosted.code} ${usePosted.hint})`);
  // تصحيح فاتورة السطر الأوّل إلى 404,000: الفرق 4,000، وحصّة الدفعات = 400 × 4,000 ÷ 500 = 3,200.00 (والباقي 800 مصروف فرق
  // سعر)، وتوزيعها بأكبر الباقي على [350، 50]: 3,200 × 350 ÷ 400 = 2,800.00 للجذر و400.00 للمرآة بلا بواقٍ.
  // فقيمة الجذر الداخلة = 402,500.00 + 2,800.00 = 405,300.00، وسعر الوحدة = 405,300 ÷ 500 = 810.60، والفاتورة المعروضة 404,000.
  const line = (await db.admin('select id from public.receipt_lines where doc_id = $1', [buyOne.id])).rows[0].id;
  const revalued = await call(db, U.manager, "select public.post_receipt_revalue($1, 404000, public.preview_receipt_revalue($1, 404000) ->> 'plan', 'فاتورة معدّلة', $2)", [line, uid()]);
  t.ok(revalued.ok, `تصحيح السعر انرحّل (${revalued.code} ${revalued.hint})`);
  const rawLots = (await db.admin(
    `select l.id, l.warehouse_id, l.source_kind, trim_scale(l.qty_in)::text as qty_in, trim_scale(l.qty_left)::text as qty_left, trim_scale(l.value_in)::text as value_in
     from public.stock_lots l where l.item_id = $1`,
    [sawdust],
  )).rows;
  const root = (qty) => rawLots.find((r) => r.source_kind === 'receipt' && r.qty_in === qty);
  const mirrorLot = rawLots.find((r) => r.source_kind === 'transfer');
  const shape = (r) => [r.qty_in, r.qty_left, r.value_in, r.warehouse_id];
  // المرآة دخلت بـ50 × 402,500 ÷ 500 = 40,250.00 لحظة التحويل، وزادتها حصّة التصحيح 400.00 ← 40,650.00؛ وقيمة الدخول لا
  // تنقص بالسحب (الناقص من value_left وحده)، فالجذر 402,500.00 + 2,800.00 = 405,300.00.
  t.same(
    [rawLots.length, shape(root('500')), shape(root('300')), shape(root('100')), shape(mirrorLot)],
    [4, ['500', '350', '405300', W.general], ['300', '300', '255000', W.general], ['100', '100', '90000', W.general2], ['50', '50', '40650', W.farm1]],
    'أربع دفعات: ثلاثة جذور من الاستلام (الجذر الأوّل 350 متبقّياً بقيمة 405,300 بعد التصحيح) ومرآة تحويل واحدة بـ40,650',
  );

  // ── القارئ: المخزن العامّ، الأحدث أوّلاً، وكلّ رقم باليد ──────────────────────────────────────────────────────────
  const read = (user, item, wh, after = null, limit = 50) => call(db, user, 'select public.item_purchases($1, $2, $3, $4) as v', [item, wh, after, limit]);
  const generalName = (await db.admin('select name from public.warehouses where id = $1', [W.general])).rows[0].name;
  const general = (await read(U.manager, sawdust, W.general)).value;
  t.same(
    [general.item.id, general.item.name, general.item.kind, general.item.base_unit, general.item.min_qty, general.item.archived,
      general.warehouse.id, general.warehouse.name, general.warehouse.kind, general.today, general.total, general.next],
    [sawdust, 'نشارة خشب', 'other', 'kg', '1000', false, W.general, generalName, 'general', TODAY, 2, null],
    'رأس الجواب: المادّة وحدّها الأدنى، والمخزن المطلوب، واليوم، والعدد الكلّي 2 في الصفحة الأولى بلا مؤشّر تالٍ',
  );
  t.same(
    general.rows.map((r) => [r.doc_no, r.party_name, r.received_on, r.qty_in, r.qty_left, r.qty_in_unit, r.unit_label, r.unit_code, r.factor, r.base_unit, r.supplier_lot_no, r.expiry_on]),
    [
      ['PU-2026-0002', 'مورّد النشارة الثاني', '2026-10-29', '300.000', '300.000', '6', 'كيس 50 كغم', null, '50', 'kg', null, null],
      ['PU-2026-0001', 'مورّد النشارة الأوّل', '2026-10-27', '500.000', '350.000', '10', 'كيس 50 كغم', null, '50', 'kg', 'L-77', null],
    ],
    'صفّان بالمخزن العامّ، الأحدث أوّلاً: الرقم والمورّد والتاريخ والكمية بوحدة الأساس وبالكيس ولقطة وحدة السطر ورقم دفعة المورّد',
  );
  t.same(
    general.rows.map((r) => [Object.keys(r.money).sort().join('|'), r.money.invoice_total, r.money.landed_value, r.money.unit_cost, r.money.corrected]),
    [
      ['corrected|invoice_total|landed_value|unit_cost', '255000', '255000.00', '850.00', false],
      ['corrected|invoice_total|landed_value|unit_cost', '404000', '405300.00', '810.60', true],
    ],
    'المال باليد: 255,000 بلا تحميل (850.00 للكيلو)، و404,000 بعد التصحيح بقيمة محمّلة 405,300.00 (810.60 للكيلو) وcorrected صحيح',
  );
  t.same(
    [general.rows.map((r) => r.doc_id), general.rows.map((r) => r.party_id), general.rows.map((r) => r.warehouse_id),
      general.rows.map((r) => r.lot_id), general.rows[1].line_id],
    [[buyTwo.id, buyOne.id], [second, first], [W.general, W.general], [root('300').id, root('500').id], line],
    'كلّ صفّ يحمل مستنده ومورّده ومخزنه ودفعته وسطره',
  );

  // ── p_warehouse فارغاً: كلّ مخازن النطاق، ومرآة التحويل لا تظهر ───────────────────────────────────────────────────
  const all = (await read(U.manager, sawdust, null)).value;
  t.same(
    [all.warehouse, all.total, all.rows.map((r) => r.doc_id), all.rows.map((r) => [r.doc_no, r.received_on, r.money.unit_cost, r.money.invoice_total])],
    [null, 3, [buyThree.id, buyTwo.id, buyOne.id],
      [['PU-2026-0003', '2026-10-30', '900.00', '90000'], ['PU-2026-0002', '2026-10-29', '850.00', '255000'], ['PU-2026-0001', '2026-10-27', '810.60', '404000']]],
    'بلا مخزن: ثلاثة صفوف من كلّ مخازن النطاق، الأحدث أوّلاً، وبلا كائن مخزن في الرأس',
  );
  const mirror = (await read(U.manager, sawdust, W.farm1)).value;
  t.same([mirror.total, mirror.rows], [0, []], 'مخزن المرآة بلا صفوف: مرآة التحويل ليست شراءً (الجذور من الاستلام فقط)');
  t.ok(mirrorLot && mirrorLot.warehouse_id === W.farm1, 'ضابط: المرآة موجودة فعلاً في مخزن حقل 1');
  t.ok(all.rows.every((r) => r.lot_id !== mirrorLot.id), 'ولا صفّ من صفوف «كلّ المخازن» دفعته مرآة');

  // ── الصفحات ─────────────────────────────────────────────────────────────────────────────────────────────────
  const page1 = (await read(U.manager, sawdust, null, null, 2)).value;
  const page2 = (await read(U.manager, sawdust, null, page1.next, 2)).value;
  t.same(
    [page1.rows.length, page1.total, page1.next === null, page2.rows.length, page2.total, page2.next],
    [2, 3, false, 1, null, null],
    'صفحتان بحدّ 2: الأولى صفّان بالعدد الكلّي ومؤشّر، والثانية صفّ بلا عدد ولا مؤشّر',
  );
  t.same([...page1.rows, ...page2.rows].map((r) => r.lot_id), all.rows.map((r) => r.lot_id), 'الصفحتان معاً = الصفحة الواحدة بنفس الترتيب بلا قفزة ولا تكرار');
  t.same(Object.keys(page1.next).sort(), ['id', 'received_on', 'seq'], 'المؤشّر التالي: التاريخ والترتيب والمعرّف');

  // ── النطاق ──────────────────────────────────────────────────────────────────────────────────────────────────
  // الأمين بنطاق المخزن العامّ: مخزن حقل 1 ومخزن الأدوية خارج نطاقه، وبلا مخزن يرى صفوف نطاقه وحدها.
  const keeperAll = (await read(U.storekeeper, sawdust, null)).value;
  t.same(
    [(await read(U.storekeeper, sawdust, W.farm1)).code, (await read(U.storekeeper, sawdust, W.medicine)).code,
      (await read(U.storekeeper, sawdust, id(90))).code, (await read(U.manager, id(91), W.general)).code,
      keeperAll.rows.map((r) => r.warehouse_id), keeperAll.total],
    ['out_of_scope', 'out_of_scope', 'out_of_scope', 'item_not_found', [W.general, W.general], 2],
    'المخزن خارج النطاق أو غير الموجود out_of_scope، والمادّة غير الموجودة item_not_found، وبلا مخزن صفوف النطاق وحدها',
  );
  t.same(moneyKeys(keeperAll), [], 'سجلّ شراء الأمين بلا أيّ مفتاح money');
  t.eq(moneyKeys(all).length, 3, 'ضابط: سجلّ المدير بثلاثة كائنات money');

  // ── بطاقات المخازن ───────────────────────────────────────────────────────────────────────────────────────────
  // لقاحان بمخزن الأدوية بافتتاح المدير يوم التشغيل: واحد ينتهي 2026-11-10 (قريب، خلال 30 يوماً من 2026-11-02) وواحد انتهى
  // 2026-10-15 (بعد يوم افتتاحه، فلا يحتاج موافقة إفراج).
  const vaccineOld = await one(U.owner, "insert into public.items (name, kind, base_unit, tracks_expiry) values ('لقاح منتهٍ', 'vaccine', 'pc', true) returning id");
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [
    { item: I.vaccine, qty: 30, value: 600000, expiry: '2026-11-10' },
    { item: vaccineOld, qty: 10, value: 50000, expiry: '2026-10-15' },
  ]);
  const cards = (await call(db, U.manager, 'select public.stores_overview() as v')).value;
  const card = (wh) => cards.rows.find((r) => r.id === wh);
  t.same(
    [cards.today, cards.can_manage, cards.can_create_item, cards.rows.some((r) => r.id === W.general)],
    [TODAY, true, true, true],
    'بطاقات المدير: اليوم، ويملك إدارة المخازن وإضافة المادّة، والمخزن العامّ فيها',
  );
  t.same(
    [card(W.general).name, card(W.general).kind, card(W.general).site_kind, card(W.general).division_kind,
      card(W.general).items_count, card(W.general).below_minimum, card(W.general).near_expiry, card(W.general).expired],
    [generalName, 'general', 'store', 'general', 1, 1, 0, 0],
    'بطاقة المخزن العامّ: مادّة واحدة برصيد، وتحت الحدّ الأدنى 1 (المتاح 750 من 1,000 بمخازن general)، وبلا انتهاء',
  );
  t.same(
    [card(W.general2).items_count, card(W.general2).below_minimum, card(W.raw).items_count, card(W.raw).below_minimum,
      card(W.farm1).items_count, card(W.farm1).below_minimum],
    [1, 1, 0, 0, 1, 0],
    'العامّ الثاني يشارك التنبيه (نوعه general)، والموادّ الأوّلية فارغ، ومخزن الحقل فيه المرآة بلا تنبيه حدّ أدنى',
  );
  t.same(
    [card(W.medicine).items_count, card(W.medicine).near_expiry, card(W.medicine).expired, card(W.medicine).below_minimum],
    [2, 1, 1, 0],
    'بطاقة الأدوية: لقاحان، واحد قريب الانتهاء وواحد منتهٍ',
  );
  // قيمة متاح العامّ باليد: الجذر 402,500.00 − 40,250.00 (تحويل) − 100 × 362,250 ÷ 450 = 80,500.00 (صرف) + 2,800.00 (تصحيح)
  // = 284,550.00، والدفعة الثانية 255,000.00 ← 539,550.00؛ والأدوية لقاحها غير المنتهي 600,000.00 (المنتهي خارج المتاح).
  const totals = (await call(db, U.manager, 'select public.stock_value_totals($1) as v', [W.general])).value;
  t.same(
    [card(W.general).money.stock_value, card(W.medicine).money.stock_value, Number(card(W.general).money.stock_value) === Number(totals.money.available)],
    ['539550.00', '600000.00', true],
    'قيمة المتاح باليد (539,550.00 و600,000.00)، وهي نفس available بـstock_value_totals (قارئ آخر)',
  );
  t.ok(cards.sites.some((s) => s.division_kind === 'general') && cards.sites.every((s) => s.id && s.name && s.kind && s.division_id), 'المواقع للنافذة: موقع المخازن العامّة فيها، ولكلّ موقع معرّف واسم ونوع ووحدة');
  // الأمين: مخزنه وحده، بلا مال، ويملك «أضف مادّة» لا «أضف مخزناً». والمشاهد بلا نطاق: بلا بطاقات.
  const keeperCards = (await call(db, U.storekeeper, 'select public.stores_overview() as v')).value;
  t.same(
    [keeperCards.can_manage, keeperCards.can_create_item, keeperCards.rows.map((r) => r.id), moneyKeys(keeperCards),
      keeperCards.rows[0].items_count, keeperCards.rows[0].below_minimum],
    [false, true, [W.general], [], 1, 1],
    'بطاقات الأمين: مخزنه وحده بأعداده وتنبيهه، بلا مال، ويضيف مادّة ولا يضيف مخزناً',
  );
  const viewerCards = (await call(db, U.viewer, 'select public.stores_overview() as v')).value;
  t.same([viewerCards.can_manage, viewerCards.can_create_item, viewerCards.rows, viewerCards.sites, moneyKeys(viewerCards)], [false, false, [], [], []],
    'المشاهد بلا نطاق: بلا بطاقات ولا مواقع ولا صلاحيتين ولا مال');

  // ── صلاحية item.create (قرار المالك 2026-11-02) ───────────────────────────────────────────────────────────────
  // الإدراج ترفضه السياسة برمز RLS، والتعديل ترفضه بصفر صفوف (مثل مصفوفة الأدوار). كلّ محاولة بمعاملة ترجع.
  const where = (await db.admin('select site_id, division_id from public.warehouses where id = $1', [W.general])).rows[0];
  const attempt = async (user, text, params) => {
    try {
      const result = await db.asUser(user, (q) => q(text, params));
      return result.rowCount === 1 ? 'ok' : `rows:${result.rowCount}`;
    } catch (error) {
      return /row-level security/u.test(error.message) ? 'rls' : error.message;
    }
  };
  const tried = {};
  for (const [role, user] of Object.entries({ owner: U.owner, manager: U.manager, storekeeper: U.storekeeper, accountant: U.accountant, viewer: U.viewer })) {
    tried[role] = {
      item: await attempt(user, "insert into public.items (name, kind, base_unit) values ('نشارة ثانية', 'other', 'kg')", []),
      unit: await attempt(user, "insert into public.item_units (item_id, label, factor_to_base) values ($1, 'كيس 25 كغم', 25)", [sawdust]),
      rename: await attempt(user, "update public.items set name = 'نشارة محدَّثة' where id = $1", [spare]),
      archive: await attempt(user, 'update public.items set archived_at = now() where id = $1', [spare]),
      unitRename: await attempt(user, "update public.item_units set label = 'كيس كبير' where id = $1", [spareUnit]),
      warehouse: await attempt(user, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن ثالث', 'general')", [where.division_id, where.site_id]),
      category: await attempt(user, "insert into public.item_categories (name) values ('موادّ الأكل')", []),
    };
  }
  const CAN = { item: 'ok', unit: 'ok', rename: 'ok', archive: 'ok', unitRename: 'ok', warehouse: 'ok', category: 'ok' };
  const KEEPER = { item: 'ok', unit: 'ok', rename: 'rows:0', archive: 'rows:0', unitRename: 'rows:0', warehouse: 'rls', category: 'rls' };
  const NONE = { item: 'rls', unit: 'rls', rename: 'rows:0', archive: 'rows:0', unitRename: 'rows:0', warehouse: 'rls', category: 'rls' };
  t.same(
    tried,
    { owner: CAN, manager: CAN, storekeeper: KEEPER, accountant: NONE, viewer: NONE },
    'item.create: الأمين يضيف مادّة ووحدتها ولا يعدّل ولا يؤرشف ولا يضيف مخزناً ولا تصنيفاً؛ والمحاسب والمشاهد لا يضيفان؛ والمالك والمدير كما كانا',
  );
  t.same(
    [(await call(db, U.storekeeper, "select public.can('item.create') as v")).value, (await call(db, U.accountant, "select public.can('item.create') as v")).value,
      (await call(db, U.millOperator, "select public.can('item.create') as v")).value, (await call(db, U.manager, "select public.can('item.create') as v")).value,
      (await call(db, U.storekeeper, "select public.can('stores.manage') as v")).value],
    [true, false, false, true, false],
    'can(item.create): الأمين والمدير نعم، والمحاسب ومشغّل المعمل لا؛ وstores.manage للأمين لا',
  );
  // الأمين يضيف مادّة ثمّ يكتبها بمسوّدته فوراً (الحاجة التي جاء منها القرار)، وتنبيه التوائم يبقى تنبيهاً لا منعاً.
  const added = await db.asUser(
    U.storekeeper,
    async (q) => {
      const item = (await q("insert into public.items (name, kind, base_unit) values ('نشارة ناعمة', 'other', 'kg') returning id")).rows[0].id;
      const twins = (await q('select jsonb_array_length(public.find_item_twins($1, null)) as n', ['نشارة ناعمه'])).rows[0].n;
      const doc = (await q('insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, $3) returning id', [first, W.general, TODAY])).rows[0].id;
      await q('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 3)', [doc, item]);
      return { twins, lines: (await q('select count(*)::int as n from public.receipt_lines where doc_id = $1', [doc])).rows[0].n };
    },
    { commit: false },
  );
  t.same([added.twins >= 1, added.lines], [true, 1], 'الأمين يضيف المادّة ويكتبها بسطر استلامه فوراً، وتنبيه التوائم يرى المادّة الشبيهة');

  // ── الاستلام الملغى ليس شراءً (الغلط بحركة عكسية، والحركتان تبقيان بتبويب الحركات) ──────────────────
  const voided = await call(db, U.manager, "select public.void_receipt($1, 'استلام خاطئ', $2)", [buyThree.id, uid()]);
  t.ok(voided.ok, `الاستلام الثالث انلغى (${voided.code} ${voided.hint})`);
  const afterVoid = (await read(U.manager, sawdust, null)).value;
  t.same(
    [afterVoid.total, afterVoid.rows.map((r) => r.doc_id), (await read(U.manager, sawdust, W.general2)).value.total],
    [2, [buyTwo.id, buyOne.id], 0],
    'الاستلام الملغى يختفي من سجلّ الشراء (ومن مخزنه)، ويبقى الاستلامان المرحّلان',
  );

  // ── الدمج: جواب القاعدة الحقيقي يمرّ بمحلّل الشاشات الحقيقي (الطرفان على عقد واحد، مثل flocks.test) ──────────────
  // الشاشات بُنيت على العقد دون قاعدة، فمفتاح أو مرتبة تختلف تظهر هنا فقط: المحلّل يرمي RowShapeError على أيّ نقص.
  const screens = await screensParser();
  const liveAll = (await read(U.manager, sawdust, null)).value;
  const parsed = screens.parseItemPurchases(liveAll);
  const firstRow = parsed.rows[0];
  t.same(
    [parsed.item.name, parsed.item.baseUnit, parsed.warehouse, parsed.today, parsed.total, parsed.rows.length],
    ['نشارة خشب', 'kg', null, TODAY, 2, 2],
    'الدمج: المحلّل يقرأ رأس السجلّ (المادّة ووحدتها، وبلا مخزن = كلّ النطاق)',
  );
  t.same(
    [firstRow.docNo, firstRow.partyName, firstRow.qtyIn.toString(), firstRow.money.landedValue.toString(), firstRow.money.unitCost.toString()],
    ['PU-2026-0002', 'مورّد النشارة الثاني', '300000', '25500000', '85000'],
    'الدمج: صفّ الشراء الأحدث بالمحلّل (الكمية بالآلاف، والمال بالفلس): 300 كغم و255,000.00 و850.00 للوحدة',
  );
  const corrected = parsed.rows.find((r) => r.docId === buyOne.id);
  t.same(
    [corrected.money.corrected, corrected.money.invoiceTotal.toString(), corrected.money.unitCost.toString(), corrected.unitLabel !== '', corrected.factor > 0n],
    [true, '40400000', '81060', true, true],
    'الدمج: السطر المصحَّح يصل بعلامته وبفاتورته 404,000.00 وسعر وحدته 810.60، ووحدة التعبئة ومعاملها',
  );
  const page = screens.parseItemPurchases((await read(U.manager, sawdust, null, null, 1)).value);
  const after = { receivedOn: page.next.receivedOn, seq: page.next.seq, id: page.next.id };
  const rest = screens.parseItemPurchases((await read(U.manager, sawdust, null, { received_on: after.receivedOn, seq: after.seq.toString(), id: after.id }, 50)).value);
  t.same(
    [page.rows.length, page.next !== null, rest.rows.length, rest.rows[0].docId === buyOne.id],
    [1, true, 1, true],
    'الدمج: مؤشّر الصفحة يخرج من المحلّل ويعود للقاعدة فيكمل من حيث وقف',
  );
  const keeperParsed = screens.parseItemPurchases((await read(U.storekeeper, sawdust, null)).value);
  const cardsParsed = screens.parseStoresOverview((await call(db, U.storekeeper, 'select public.stores_overview() as v')).value);
  t.same(
    [keeperParsed.rows.every((r) => r.money === null), keeperParsed.rows[0].partyName, cardsParsed.rows.every((r) => r.stockValue === null), cardsParsed.canCreateItem, cardsParsed.canManage],
    [true, 'مورّد النشارة الثاني', true, true, false],
    'الدمج: الأمين يمرّ بالمحلّل بلا مال (money = null بالسجلّ وstockValue = null بالبطاقات)، ويرى المورّد، ويضيف مادّة ولا يدير المخازن',
  );
  const ownerCards = screens.parseStoresOverview(cards);
  t.same(
    [ownerCards.rows.find((r) => r.id === W.general).stockValue.toString(), ownerCards.rows.find((r) => r.id === W.medicine).nearExpiry, ownerCards.sites.length > 0],
    ['53955000', 1, true],
    'الدمج: بطاقات المخازن بالمحلّل (القيمة بالفلس، والتنبيهات، والمواقع للنافذة)',
  );
}
