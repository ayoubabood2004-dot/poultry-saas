// سعر البيع والربح المتوقّع، وقائمة مواد المخزن كلّها، ودفتر المادّة بالبيان (0014؛ تجربة الاستخدام الجزء الثالث، كلمة المالك
// 2026-11-02): الكتابة مشروطة بالقيمة السابقة وتُعاد بأمان وتُشال؛ والمادّة التي تُضاف اليوم تظهر في قائمة مخزنها اليوم برصيد
// صفر (وفي مخزن لا يستلم نوعها لا تظهر)؛ وقيمة البيع والربح المتوقّع بالضبط لكلّ صفّ وللمخزن كلّه، والمواد بلا سعر معدودة؛
// وبيان كلّ نوع مستند («شراء من…»، «تحويل من/إلى…»، «صرف: فئته»، «جرد»، «رصيد بداية»، «مرتجع إلى…»، «تصحيح سعر الشراء»)
// واتّجاه التحويل بالمخزن لا بإشارة الكمية (فحركة العكس لا تقلب الطرفين)؛ وقيمة الحركة والرصيد القيمي الجاري.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, uid } from './ledger-kit.mjs';
import { postedReceipt } from './receipt-kit.mjs';
import { makeStockOrg, postedOpening, postedTransfer, voidTransfer } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** محلّلات الشاشات الحقيقية (درس 2026-11-02): جواب القاعدة يمرّ بها محزومة بـesbuild، مو بنسخة منها. */
async function screensParser() {
  const result = await build({
    stdin: { contents: "export { parseStockBoard, parseItemMoves, parseItemPurchases } from './src/lib/repo/inventory.ts';", resolveDir: ROOT, loader: 'ts' },
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
const id = (n) => `b1400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099400${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة الأسعار', id, phone, goLive: GO_LIVE });
  const { users: U, W, I } = S;
  const one = S.one;
  const price = (user, item, next, expected) => call(db, user, 'select public.set_item_sell_price($1, $2, $3)', [item, next, expected]);
  const board = async (user, wh) => (await call(db, user, 'select public.stock_on_hand($1, null, 200) as v', [wh])).value;
  const ledger = async (user, item, wh) => (await call(db, user, 'select public.item_moves_qty($1, $2, null, 200) as v', [item, wh])).value;
  const rowOf = (answer, item) => answer.rows.find((r) => r.item_id === item);
  // مخزن أوّلية ثانٍ بنفس موقع الأوّل: طرف التحويل (المادّة الأوّلية لا تُخزَّن إلا بمخزن raw).
  const rawPlace = (await db.admin('select division_id, site_id from public.warehouses where id = $1', [W.raw])).rows[0];
  const raw2 = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن أوّلية ثانٍ', 'raw') returning id", [rawPlace.division_id, rawPlace.site_id]);

  // ── ١) الكتابة: مشروطة بالقيمة السابقة، تُعاد بأمان، وتُشال ───────────────────────────────────────────────────────
  const first = await price(U.owner, I.corn, 1750, null);
  const again = await price(U.owner, I.corn, 1750, null);
  const stale = await price(U.owner, I.corn, 1900, null);
  const moved = await price(U.manager, I.corn, 1900, 1750);
  const removed = await price(U.owner, I.corn, null, 1900);
  const removedAgain = await price(U.owner, I.corn, null, null);
  t.same(
    [first.ok, first.value.written, first.value.sell_price, again.ok, again.value.written, stale.code, moved.ok, moved.value.sell_price,
      removed.ok, removed.value.written, removedAgain.ok, removedAgain.value.written,
      (await db.admin('select count(*)::int as n from public.item_prices where item_id = $1', [I.corn])).rows[0].n],
    [true, true, '1750', true, false, 'price_changed', true, '1900', true, true, true, false, 0],
    'سعر البيع: يُكتب مرّة، والإعادة بنفس السعر «انكتب» بلا كتابة ثانية، والسعر السابق الخاطئ price_changed، والتغيير بالسابق الصحيح يمرّ، والفارغ يشيله ثمّ لا يُشال مرّتين',
  );

  // ضوابط الرفض: مبلغ بثلاث مراتب، وصفر، ومادّة غائبة، ومادّة مؤرشفة، ودور بلا إدارة مخازن.
  const spare = await one(U.owner, "insert into public.items (name, kind, base_unit) values ('ذرة الاحتياط', 'raw', 'kg') returning id");
  await one(U.owner, 'update public.items set archived_at = now() where id = $1', [spare]);
  t.same(
    [(await price(U.owner, I.corn, 1750.125, null)).code, (await price(U.owner, I.corn, 0, null)).code,
      (await price(U.owner, uid(), 1750, null)).code, (await price(U.owner, spare, 1750, null)).code,
      (await price(U.storekeeper, I.corn, 1750, null)).code, (await price(U.accountant, I.corn, 1750, null)).code],
    ['bad_price', 'bad_price', 'item_not_found', 'item_archived', 'forbidden', 'forbidden'],
    'ضوابط سعر البيع: المراتب والصفر والمادّة الغائبة والمؤرشفة مرفوضة، والأمين والمحاسب لا يكتبانه (stores.manage)',
  );

  // ── ٢) القائمة: المادّة الجديدة تظهر برصيد صفر، وفي مخزن لا يستلم نوعها لا تظهر ────────────────────────────────────
  // «مكمّل علفي» نوعه additive، ومخازنه المستلِمة نوع raw بالضبط (private.receiving_kinds)، فيظهر بمخزن الموادّ الأوّلية
  // برصيد صفر بلا حدّ أدنى ولا استلام — وهذا هو العيب الذي أُصلح — ولا يظهر بمخزن الأدوية ولا بالمخزن العامّ.
  const category = await one(U.owner, "insert into public.item_categories (name) values ('مواد الأكل') returning id");
  const additive = await one(U.owner, "insert into public.items (name, category_id, kind, base_unit, barcode) values ('مكمّل علفي', $1, 'additive', 'kg', 'ADD-1') returning id", [category]);
  const fresh = await board(U.manager, W.raw);
  const freshRow = rowOf(fresh, additive);
  t.same(
    [freshRow !== undefined, freshRow?.available, freshRow?.category_id === category, freshRow?.category_name, freshRow?.barcode,
      freshRow?.money.stock_value, freshRow?.money.sell_price, freshRow?.money.sale_value,
      rowOf(await board(U.manager, W.medicine), additive) === undefined, rowOf(await board(U.manager, W.general), additive) === undefined],
    [true, '0', true, 'مواد الأكل', 'ADD-1', '0.00', null, null, true, true],
    'المادّة التي تُضاف اليوم تظهر بقائمة مخزنها برصيد صفر وبتصنيفها وباركودها وبلا سعر، ولا تظهر بمخزن لا يستلم نوعها',
  );

  // ضابط: سعر بيع لمادّة برصيد صفر لا يرمي (private.sale_value تحمي من mul_div_domain بالكمية صفر)، وقيمة بيعها صفر.
  await price(U.owner, additive, 2000, null);
  const zeroPriced = rowOf(await board(U.manager, W.raw), additive);
  t.same(
    [zeroPriced.money.sell_price, zeroPriced.money.sale_value, zeroPriced.money.expected_profit],
    ['2000', '0.00', '0.00'],
    'ضابط: المادّة برصيد صفر ولها سعر بيع: قيمة بيعها صفر وربحها صفر بلا رفض',
  );

  // ── ٣) قيمة البيع والربح المتوقّع بالضبط ─────────────────────────────────────────────────────────────────────────
  // افتتاح 200 كغم ذرة بقيمة 300,000 بمخزن الموادّ الأوّلية (كلفة الكيلو 1,500)، وسعر بيعها 1,750 لكلّ كغم:
  //   قيمة المتاح 300,000.00، وقيمة البيع 200 × 1,750 = 350,000.00، والربح المتوقّع 50,000.00.
  // وصويا 100 كغم بقيمة 80,000 بلا سعر بيع: تدخل رأس المال ولا تدخل قيمة البيع ولا الربح، وتُعدّ بـitems_unpriced.
  const soy = await one(U.owner, "insert into public.items (name, category_id, kind, base_unit) values ('صويا', $1, 'raw', 'kg') returning id", [category]);
  await postedOpening(db, U.owner, W.raw, GO_LIVE, [{ item: I.corn, qty: 200, value: 300000 }]);
  await postedOpening(db, U.owner, W.raw, GO_LIVE, [{ item: soy, qty: 100, value: 80000 }]);
  await price(U.owner, I.corn, 1750, null);
  const rawBoard = await board(U.manager, W.raw);
  const cornRow = rowOf(rawBoard, I.corn);
  const soyRow = rowOf(rawBoard, soy);
  t.same(
    [cornRow.available, cornRow.money.stock_value, cornRow.money.sell_price, cornRow.money.sale_value, cornRow.money.expected_profit,
      soyRow.money.stock_value, soyRow.money.sell_price, soyRow.money.sale_value, soyRow.money.expected_profit],
    ['200.000', '300000.00', '1750', '350000.00', '50000.00', '80000.00', null, null, null],
    'قيمة البيع = المتاح × سعر البيع، والربح المتوقّع = قيمة البيع − قيمة المتاح؛ والمادّة بلا سعر بلا قيمة بيع ولا ربح',
  );
  // مجاميع المخزن: رأس المال على الكلّ (380,000.00)، وقيمة البيع والربح على من له سعر فقط (350,000.00 و50,000.00؛ والمكمّل
  // برصيد صفر يضيف صفراً)، وعدد من له رصيد بلا سعر 1 (الصويا). وضابطه: لو حُسب الربح على الكلّ لطلع 50,000 − 80,000 = −30,000.
  t.same(
    [rawBoard.money.stock_value, rawBoard.money.sale_value, rawBoard.money.expected_profit, rawBoard.money.items_unpriced],
    ['380000.00', '350000.00', '50000.00', 1],
    'ضابط: مجاميع المخزن — رأس المال على كلّ المواد، وقيمة البيع والربح على من له سعر فقط، وعدد من له رصيد بلا سعر',
  );
  const cards = (await call(db, U.manager, 'select public.stores_overview() as v')).value;
  const rawCard = cards.rows.find((r) => r.id === W.raw);
  t.same(
    [rawCard.money.stock_value, rawCard.money.sale_value, rawCard.money.expected_profit, rawCard.money.items_unpriced],
    ['380000.00', '350000.00', '50000.00', 1],
    'بطاقة المخزن بنفس أرقام قائمته: رأس المال وقيمة البيع والربح المتوقّع وعدد المواد بلا سعر',
  );

  // ── ٤) دفتر المادّة: البيان لكلّ نوع مستند، والقيمة والرصيد القيمي ────────────────────────────────────────────────
  // ذرة مخزن الموادّ الأوّلية: افتتاح 200 (300,000)، ثمّ شراء 100 كغم من «مورّد الذرة» بفاتورة 160,000، ثمّ تحويل 50 إلى
  // المخزن الثاني، ثمّ صرف 20 بفئة «صيانة». فالدفتر أربعة أسطر بالترتيب، وبيان كلّ سطر مكتوب أدناه.
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد الذرة', true) returning id");
  const upkeep = await one(U.accountant, "insert into public.expense_categories (name) values ('صيانة') returning id");
  await postedReceipt(db, {
    keeper: U.manager, pricer: U.manager, wh: W.raw, party: supplier, on: '2026-10-29',
    lines: [{ item: I.corn, qty: 100 }], totals: [160000],
  });
  await postedTransfer(db, U.manager, W.raw, raw2, TODAY, [{ item: I.corn, qty: 50 }]);
  const use = await db.asUser(
    U.manager,
    async (q) => {
      const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.raw, upkeep, TODAY])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 20)', [docId, I.corn]);
      return (await q('select id, version from public.stock_uses where id = $1', [docId])).rows[0];
    },
    { commit: true },
  );
  const usePosted = await call(db, U.manager, "select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', $3)", [use.id, use.version, uid()]);
  t.ok(usePosted.ok, `الصرف انرحّل (${usePosted.code} ${usePosted.hint})`);
  const cornLedger = await ledger(U.manager, I.corn, W.raw);
  t.same(
    cornLedger.rows.map((r) => [r.doc_kind, r.memo, r.qty]),
    [
      ['opening', 'رصيد بداية', '200.000'],
      ['receipt', 'شراء من مورّد الذرة', '100.000'],
      ['transfer', 'تحويل إلى مخزن أوّلية ثانٍ', '-50.000'],
      ['stock_use', 'صرف: صيانة', '-20.000'],
    ],
    'دفتر المادّة بترتيبه، وبيان كلّ سطر يقول من أين جاءت الحركة أو إلى أين ذهبت',
  );
  // الطرف الآخر من التحويل: نفس المستند، وبيانه «تحويل من مخزن المواد الأوّلية» (الاتّجاه من المخزن المسؤول).
  t.same(
    (await ledger(U.manager, I.corn, raw2)).rows.map((r) => [r.doc_kind, r.memo, r.qty]),
    [['transfer', 'تحويل من مخزن المواد الأوّلية', '50.000']],
    'الطرف الآخر من التحويل: «تحويل من …» بالمخزن المسؤول',
  );
  // القيمة والرصيد القيمي: الافتتاح 300,000.00 ثمّ الشراء 160,000.00 (الرصيد 460,000.00)، والتحويل يسحب 50 من الأقدم
  // بكلفة 1,500 للكيلو = 75,000.00 (الرصيد 385,000.00)، والصرف 20 × 1,500 = 30,000.00 (الرصيد 355,000.00).
  t.same(
    cornLedger.rows.map((r) => [r.money.value, r.money.running_value]),
    [['300000.00', '300000.00'], ['160000.00', '460000.00'], ['-75000.00', '385000.00'], ['-30000.00', '355000.00']],
    'قيمة كلّ حركة ورصيدها القيمي الجاري بالضبط (السحب بكلفة الدفعة الأقدم)',
  );

  // ضابط اتّجاه التحويل: إلغاء التحويل يكتب حركة عكس موجبة بالمخزن المرسِل وسالبة بالمستقبل، فلو كان البيان بإشارة الكمية
  // لانقلب الطرفان. هنا يبقى «تحويل إلى …» بالمرسِل و«تحويل من …» بالمستقبل.
  const transferDoc = (await db.admin('select id from public.transfers where from_warehouse_id = $1 order by created_at desc limit 1', [W.raw])).rows[0].id;
  const voided = await voidTransfer(db, U.manager, transferDoc);
  t.ok(voided.ok, `إلغاء التحويل (${voided.code} ${voided.hint})`);
  t.same(
    [(await ledger(U.manager, I.corn, W.raw)).rows.filter((r) => r.doc_kind === 'transfer').map((r) => [r.memo, r.qty]),
      (await ledger(U.manager, I.corn, raw2)).rows.filter((r) => r.doc_kind === 'transfer').map((r) => [r.memo, r.qty])],
    [[['تحويل إلى مخزن أوّلية ثانٍ', '-50.000'], ['تحويل إلى مخزن أوّلية ثانٍ', '50.000']],
      [['تحويل من مخزن المواد الأوّلية', '50.000'], ['تحويل من مخزن المواد الأوّلية', '-50.000']]],
    'ضابط: حركة العكس تقلب الإشارة ولا تقلب طرفَي التحويل (الاتّجاه بالمخزن لا بالإشارة)',
  );

  // ضابط المرتجع وتصحيح السعر: بيانهما يسمّي المورّد والتصحيح، وكلاهما على استلام مرحَّل (على الصويا، فدفتر الذرة فوق كما هو).
  const buy = await postedReceipt(db, {
    keeper: U.manager, pricer: U.manager, wh: W.raw, party: supplier, on: '2026-10-30',
    lines: [{ item: soy, qty: 10 }], totals: [50000],
  });
  const buyLine = (await db.admin('select id from public.receipt_lines where doc_id = $1', [buy.id])).rows[0].id;
  const back = await db.asUser(
    U.manager,
    async (q) => {
      const docId = (await q('insert into public.supplier_returns (receipt_id, returned_on) values ($1, $2) returning id', [buy.id, TODAY])).rows[0].id;
      const lineId = (await q('insert into public.supplier_return_lines (doc_id, receipt_line_id, qty_base) values ($1, $2, 4) returning id', [docId, buyLine])).rows[0].id;
      await q('insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, 20000)', [lineId]);
      return (await q('select id, version from public.supplier_returns where id = $1', [docId])).rows[0];
    },
    { commit: true },
  );
  const returned = await call(db, U.manager, "select public.post_supplier_return($1, $2, public.preview_supplier_return($1) ->> 'plan', $3)", [back.id, back.version, uid()]);
  t.ok(returned.ok, `المرتجع انرحّل (${returned.code} ${returned.hint})`);
  const revalued = await call(db, U.manager, "select public.post_receipt_revalue($1, 52000, public.preview_receipt_revalue($1, 52000) ->> 'plan', 'فاتورة معدّلة', $2)", [buyLine, uid()]);
  t.ok(revalued.ok, `تصحيح السعر انرحّل (${revalued.code} ${revalued.hint})`);
  t.same(
    (await ledger(U.manager, soy, W.raw)).rows.filter((r) => r.doc_kind !== 'opening').map((r) => [r.doc_kind, r.memo]),
    [['receipt', 'شراء من مورّد الذرة'], ['supplier_return', 'مرتجع إلى مورّد الذرة'], ['receipt_revalue', 'تصحيح سعر الشراء']],
    'بيان المرتجع يسمّي المورّد، وبيان تصحيح السعر يسمّي نفسه',
  );

  // ضابط الجرد: بيانه «جرد» (بلا اتّجاه: إشارة الكمية تكفي، وحركة العكس تقلبها). المتاح من الصويا 100 + 10 − 4 = 106،
  // والعدّ 100، فالفرق نقص 6 بسبب يكتبه المدير (E53)، ثمّ يُرحَّل بخطّة معاينته.
  const versionOf = async (docId) => (await db.admin('select version from public.stock_counts where id = $1', [docId])).rows[0].version;
  const count = await db.asUser(
    U.manager,
    async (q) => {
      const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.raw, TODAY])).rows[0].id;
      const lineId = (await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 100) returning id', [docId, soy])).rows[0].id;
      return { id: docId, line: lineId };
    },
    { commit: true },
  );
  const submitted = await call(db, U.manager, 'select public.submit_count($1, $2, $3)', [count.id, await versionOf(count.id), uid()]);
  t.ok(submitted.ok, `الجرد انسلّم (${submitted.code} ${submitted.hint})`);
  const reasoned = await call(db, U.manager, 'update public.stock_count_lines set reason = $2, reason_diff = diff, reason_expired_diff = expired_diff where id = $1 returning reason', [count.line, 'فرق بالعدّ']);
  t.ok(reasoned.ok, `سبب الفرق انكتب (${reasoned.code} ${reasoned.hint})`);
  const approved = await call(db, U.manager, "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', $3)", [count.id, await versionOf(count.id), uid()]);
  t.ok(approved.ok, `الجرد انرحّل (${approved.code} ${approved.hint})`);
  t.same(
    (await ledger(U.manager, soy, W.raw)).rows.filter((r) => r.doc_kind === 'count').map((r) => [r.memo, r.qty]),
    [['جرد', '-6.000']],
    'بيان الجرد «جرد»، وكميته فرق العدّ',
  );

  // ── ٥) التكامل: جواب القاعدة الحقيقي يمرّ بمحلّلات الشاشات الحقيقية ──────────────────────────────────────────────
  // درس 2026-11-02: العقد وحده لا يكفي — فرق مفتاح أو مرتبة يمسكه هذا فقط. والذرة بمخزن الموادّ الأوّلية: سعرها 1,750،
  // ومتاحها بعد الشراء والتحويل الملغى والصرف = 200 + 100 − 20 = 280 كغم.
  const parsers = await screensParser();
  const boardJson = (await call(db, U.manager, 'select public.stock_on_hand($1, null, 200) as v', [W.raw])).value;
  const parsed = parsers.parseStockBoard(boardJson);
  const parsedCorn = parsed.rows.find((row) => row.itemId === I.corn);
  t.same(
    [parsed.warehouse.name, parsedCorn.available, parsedCorn.categoryId === null, parsedCorn.money.sellPrice, parsedCorn.money.stockValue > 0n,
      parsed.money.itemsUnpriced > 0, typeof parsed.money.stockValue],
    ['مخزن المواد الأوّلية', 280_000n, true, 175_000n, true, true, 'bigint'],
    'تكامل: قائمة المخزن تُقرأ بمحلّل الشاشة — المتاح والتصنيف وسعر البيع بالفلس ومجاميع المخزن',
  );
  const ledgerJson = (await call(db, U.manager, 'select public.item_moves_qty($1, $2, null, 200) as v', [I.corn, W.raw])).value;
  const parsedLedger = parsers.parseItemMoves(ledgerJson);
  t.same(
    [parsedLedger.rows[1].memo, parsedLedger.rows[1].qty, parsedLedger.rows[1].money.value, typeof parsedLedger.rows[1].money.runningValue],
    ['شراء من مورّد الذرة', 100_000n, 16_000_000n, 'bigint'],
    'تكامل: دفتر المادّة يُقرأ بمحلّل الشاشة — البيان والكمية بالآلاف وقيمة الحركة بالفلس',
  );
  const buysJson = (await call(db, U.manager, 'select public.item_purchases($1, $2, null, 50) as v', [I.corn, W.raw])).value;
  t.eq(parsers.parseItemPurchases(buysJson).item.sellPrice, 175_000n, 'تكامل: سجلّ الشراء يرجّع سعر بيع المادّة بالفلس');
  const keeperBoard = parsers.parseStockBoard((await call(db, U.storekeeper, 'select public.stock_on_hand($1, null, 200) as v', [W.general])).value);
  t.same([keeperBoard.money, keeperBoard.rows.every((row) => row.money === null)], [null, true], 'تكامل: والأمين يقرأ القائمة بلا مال (القناع بالخادم، والمحلّل يرجّع null)');

  // ── ٦) الثوابت ما تغيّرت ────────────────────────────────────────────────────────────────────────────────────────
  t.same(
    (await db.admin('select check_name, violations::int as v from public.verify_stock()')).rows.filter((r) => r.v !== 0),
    [],
    'ثوابت المخزون صفر بعد كلّ ما سبق',
  );
}
