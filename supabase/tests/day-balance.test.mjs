// الرصيد اليومي (0022؛ كلمة المالك 2026-11-09 مع صورة جدوله «رصيد مواد العلف»، وأجوبته: «اترك مال اسبوع والشهر»، والملاحظة «لكلّ يوم»؛
// DECISIONS «الرصيد اليومي»): day_balance يعطي لكلّ مادّة ظاهرة في التصنيف رصيدها آخر اليوم = الرصيد الجاري لدفتر المادّة ذلك اليوم (العكسيات
// بيومها) في المخزن المختار أو مخازن النطاق، بترتيب التصنيف ثمّ الاسم، ومعه ملاحظة اليوم؛ وset_day_note تكتب ملاحظة (مادّة، يوم) مشروطة بالنسخة
// التي رآها الكاتب وتعيد الحال نفسه بلا رفض وتمسح بالفارغ؛ وset_category_items تكتب قائمة التصنيف وترتيبها بمعاملة واحدة؛ وفعل stock_note.write؛
// وكلّ رفض بتلميحه؛ وطفرات تكسر كلّ قاعدة فيفشل فحصها (آخر الملف)؛ وعيّنات حقيقية للشاشات (DAYBAL_SAMPLES_OUT).
import { writeFileSync } from 'node:fs';
import { call, canon, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-09';
const id = (n) => `d2220000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099960${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const DB = 'select public.day_balance($1, $2, $3) as v';
const NOTE = 'select public.set_day_note($1, $2, $3, $4) as v';
const CAT = 'select public.set_category_items($1, $2::uuid[]) as v';
const FN = {
  balance: 'public.day_balance(uuid, date, uuid)',
  note: 'public.set_day_note(uuid, date, text, integer)',
  cat: 'public.set_category_items(uuid, uuid[])',
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  // ── المنشأة: الأدوار الثمانية، وأمين بالمعمل والعامّة، وأمين بمخزن المواد وحده ─────────────────────────────────────────
  const G = await makeOrg(db, {
    name: 'مزرعة الرصيد اليومي',
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
      ['keeperRaw', 'storekeeper'],
    ],
  });
  const { users: U, members: MB, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[]) as v", [MB.keeperRaw, W.raw]);
  const item = (name, kind, unit) => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = {
    corn: await item('ذرة', 'raw', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    bran: await item('نخالة', 'raw', 'kg'),
    oil: await item('زيت', 'raw', 'L'),
    premix: await item('برمكس م/1', 'additive', 'kg'),
    kerosene: await item('كاز', 'fuel', 'L'),
    hidden: await item('مادّة ستُخفى', 'raw', 'kg'),
    stray: await item('مادّة تخرج من التصنيف', 'raw', 'kg'),
    noted: await item('مادّة بملاحظة فقط', 'raw', 'kg'),
  };
  const samples = { refusals: {} };
  const refusal = (key, result) => {
    if (!result.ok) samples.refusals[key] = { code: result.code, hint: result.hint };
    return result;
  };
  const balanceAs = (user, category, on, wh = null) => call(db, user, DB, [category, on, wh]);
  const rowsOf = (result) => (result.ok ? result.value.rows.map((r) => [r.name, r.qty]) : [`${result.code}`]);
  const qtyOf = (result, itemId) => result.value?.rows.find((r) => r.item_id === itemId)?.qty;

  // ── ٠) بلا تصنيف بعد: «كلّ الموادّ» بقائمة تصنيفات فارغة ──────────────────────────────────────────────────────────
  const empty = await balanceAs(U.owner, null, null);
  t.same([empty.ok, empty.value?.categories, empty.value?.on, empty.value?.today, empty.value?.category, empty.value?.warehouse],
    [true, [], TODAY, TODAY, null, null], 'بلا تصنيف: قائمة التصنيفات فارغة، واليوم يوم الخادم، وبلا تصنيف ولا مخزن مختار');
  samples.no_categories = empty.value;

  // ── الحركات: افتتاح يوم −5، وبيع ذرة يوم −3، ونقل كاز يوم −2، وشراء ذرة يوم −1 يُلغى اليوم ─────────────────────────────────
  await postedOpening(db, U.owner, W.raw, day(-5), [
    { item: I.corn, qty: 10000, value: '4500000.00' },
    { item: I.soy, qty: 5000, value: '2000000.00' },
    { item: I.oil, qty: 1200, value: '1800000.00' },
    { item: I.premix, qty: 800, value: '400000.00' },
  ]);
  await postedOpening(db, U.owner, W.general, day(-5), [{ item: I.kerosene, qty: 100, value: '80000.00' }]);
  const buyer = await one(U.owner, "insert into public.parties (name, is_customer) values ('أبو أحمد', true) returning id");
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");
  await one(U.owner, "select public.record_sale($1, $2, $3, $4, $5, 2000, 500, $6, 'credit', null, null) as v", [uid(), uid(), uid(), buyer, I.corn, day(-3)]);
  await one(U.owner, 'select public.record_transfer($1, $2, $3, $4, 40, $5, $6, $7) as v', [uid(), uid(), uid(), I.kerosene, W.general, W.raw, day(-2)]);
  const bought = await one(U.owner, "select public.record_purchase($1, $2, $3, $4, $5, $6, 1500, 450, null, 'credit', null, null) as v", [uid(), uid(), uid(), I.corn, supplier, day(-1)]);
  await one(U.owner, "select public.void_receipt($1, 'شراء مكرّر', $2) as v", [bought.id, uid()]);

  // ── التصنيفات (المالك يضيفها بالإدراج القائم) ──────────────────────────────────────────────────────────────────────
  const category = (name) => one(U.owner, 'insert into public.item_categories (name) values ($1) returning id', [name]);
  const C = { feed: await category('مواد العلف'), add: await category('الإضافات'), fuel: await category('المحروقات'), empty: await category('فارغ'), old: await category('تصنيف قديم') };
  await one(U.owner, 'update public.item_categories set archived_at = now() where id = $1 returning id', [C.old]);

  // ── ١) ملء التصنيف وترتيبه (stores.manage) ─────────────────────────────────────────────────────────────────────────
  const fill = (user, cat, items) => call(db, user, CAT, [cat, items]);
  t.eq((await fill(U.storekeeper, C.feed, [I.soy])).code, 'forbidden', 'الأمين لا يملأ التصنيف (stores.manage للمالك والمدير)');
  const filled = await fill(U.manager, C.feed, [I.soy, I.corn, I.bran, I.hidden, I.stray]);
  t.same([filled.ok, canon(filled.value)], [true, canon({ category_id: C.feed, count: 5, moved: 0, removed: 0 })], 'المدير يملأ «مواد العلف» بخمس موادّ بترتيبه');
  samples.set_category_items = { manager: filled.value };
  await fill(U.manager, C.add, [I.premix, I.oil]);
  const fuelFill = await fill(U.manager, C.fuel, [I.kerosene]);
  t.eq(canon(fuelFill.value), canon({ category_id: C.fuel, count: 1, moved: 0, removed: 0 }), '«المحروقات» بالكاز');
  // مادّة تُخفى وهي في التصنيف: تبقى فيه، ولا تظهر في الجدول.
  await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [I.hidden]);
  const refill = await fill(U.manager, C.feed, [I.soy, I.corn, I.bran]);
  t.eq(canon(refill.value), canon({ category_id: C.feed, count: 3, moved: 0, removed: 1 }), 'إعادة القائمة بلا «مادّة تخرج من التصنيف»: خرجت (removed 1)، والمخفيّة لا تُعدّ');
  const cats = Object.fromEntries((await db.admin('select id, category_id from public.items where id = any($1::uuid[])', [[I.stray, I.hidden, I.soy]])).rows.map((r) => [r.id, r.category_id]));
  t.same([cats[I.stray], cats[I.hidden], cats[I.soy]], [null, C.feed, C.feed], 'الخارجة بلا تصنيف، والمخفيّة باقية في تصنيفها، والمُدرَجة فيه');
  t.same((await db.admin('select item_order from public.item_categories where id = $1', [C.feed])).rows[0].item_order, [I.soy, I.corn, I.bran], 'الترتيب محفوظ كما أُرسل');

  // ── ٢) الجدول: الترتيب والرصيد بالأيام (رصيد الدفتر الجاري) ───────────────────────────────────────────────────────────
  const d5 = await balanceAs(U.owner, C.feed, day(-5));
  t.same(rowsOf(d5), [['صويا', '5000.000'], ['ذرة', '10000.000'], ['نخالة', '0.000']], 'يوم −5: بترتيب التصنيف (لا بالاسم)، والنخالة بلا حركة صفر، والمخفيّة غائبة');
  t.same([d5.value.on, d5.value.category, d5.value.warehouse, d5.value.can_note, d5.value.can_manage], [day(-5), { id: C.feed, name: 'مواد العلف' }, null, true, true], 'اليوم والتصنيف وما يملكه المالك');
  t.same(d5.value.categories.map((c) => [c.name, c.items]), [['الإضافات', 2], ['المحروقات', 1], ['فارغ', 0], ['مواد العلف', 3]], 'التصنيفات الظاهرة بالاسم، وعدد موادّها الظاهرة (القديم المؤرشف غائب)');
  t.same(d5.value.stores.map((s) => s.kind).sort(), ['chick', 'feed', 'general', 'hatching_egg', 'medicine', 'raw'], 'مخازن النطاق كلّها للمالك');
  const cornBy = async (offset) => qtyOf(await balanceAs(U.owner, C.feed, day(offset)), I.corn);
  t.same([await cornBy(-6), await cornBy(-5), await cornBy(-4), await cornBy(-3), await cornBy(-2), await cornBy(-1), await cornBy(0)],
    ['0.000', '10000.000', '10000.000', '8000.000', '8000.000', '9500.000', '8000.000'],
    'الذرة يوماً بيوم: الافتتاح، والبيع يوم −3، والشراء يوم −1، وإلغاؤه اليوم بيومه (كدفتر المادّة)');
  const ledger = (await db.admin(`select sum(qty)::text as q from public.stock_moves where item_id = $1 and moved_on <= $2`, [I.corn, day(-1)])).rows[0].q;
  t.eq(Number(ledger), 9500, 'رصيد يوم −1 = مجموع حركات الدفتر حتّى ذلك اليوم');

  // ── ٣) كلّ الموادّ، والمخزن المختار، والنطاق ─────────────────────────────────────────────────────────────────────
  const all = await balanceAs(U.owner, null, day(-2));
  t.same(rowsOf(all), [['برمكس م/1', '800.000'], ['ذرة', '8000.000'], ['زيت', '1200.000'], ['صويا', '5000.000'], ['كاز', '100.000'],
    ['مادّة بملاحظة فقط', '0.000'], ['مادّة تخرج من التصنيف', '0.000'], ['نخالة', '0.000']], 'كلّ الموادّ الظاهرة بالاسم، والنقل بين مخزنين لا يغيّر المجموع');
  t.same([qtyOf(await balanceAs(U.owner, C.fuel, day(-2), W.general), I.kerosene), qtyOf(await balanceAs(U.owner, C.fuel, day(-2), W.raw), I.kerosene),
    qtyOf(await balanceAs(U.owner, C.fuel, day(-3), W.raw), I.kerosene)], ['60.000', '40.000', '0.000'], 'المخزن المختار: الكاز 60 في العامّ و40 في المواد يوم النقل، ولا شيء في المواد قبله');
  const raw = await balanceAs(U.keeperRaw, C.fuel, day(-2));
  t.same([qtyOf(raw, I.kerosene), raw.value.stores.map((s) => s.kind), raw.value.can_note, raw.value.can_manage], ['40.000', ['raw'], true, false],
    'أمين مخزن المواد: رصيد مخزنه وحده، وقائمة المخازن مخزنه، ويكتب الملاحظة ولا يملأ التصنيف');
  t.eq(refusal('out_of_scope', await balanceAs(U.keeperRaw, C.fuel, day(-2), W.general)).code, 'out_of_scope', 'مخزن خارج نطاقه يُرفض');
  t.eq((await balanceAs(U.owner, C.fuel, day(-2), uid())).code, 'out_of_scope', 'مخزن غير موجود يُرفض بالرمز نفسه');
  const viewer = await balanceAs(U.viewer, C.feed, day(-3));
  t.same([viewer.ok, viewer.value?.can_note, viewer.value?.can_manage, qtyOf(viewer, I.corn)], [true, false, false, '0.000'],
    'المشاهد بلا نطاق مخزن: يرى الجدول بأصفار، بلا ملاحظة ولا ملء');

  // ── ٤) رفض الجدول ───────────────────────────────────────────────────────────────────────────────────────────────
  const future = refusal('day_in_future', await balanceAs(U.owner, C.feed, day(1)));
  t.same([future.code, /لم يأتِ بعد/u.test(future.hint)], ['day_in_future', true], 'يوم بعد اليوم يُرفض بتلميحه');
  t.eq((await balanceAs(U.owner, uid(), day(0))).code, 'category_not_found', 'تصنيف غير موجود');
  const old = await balanceAs(U.owner, C.old, day(0));
  t.same([old.code, old.hint.includes('«تصنيف قديم»')], ['category_archived', true], 'تصنيف مؤرشف يُرفض ويسمّيه');
  t.same(rowsOf(await balanceAs(U.owner, C.empty, day(0))), [], 'تصنيف بلا موادّ: صفوف فارغة');

  // ── ٥) ملاحظة اليوم ─────────────────────────────────────────────────────────────────────────────────────────────
  const note = (user, itemId, on, text, version) => call(db, user, NOTE, [itemId, on, text, version]);
  const saved = await note(U.storekeeper, I.corn, day(-3), '  بيع لأبو أحمد \n', null);
  t.same([saved.ok, canon(saved.value)], [true, canon({ item_id: I.corn, on: day(-3), note: { text: 'بيع لأبو أحمد', version: 1 } })], 'الأمين يكتب ملاحظة يوم −3 (مقصوصة الأطراف)');
  samples.set_day_note = { saved: saved.value };
  t.same((await balanceAs(U.owner, C.feed, day(-3))).value.rows.map((r) => r.note), [null, { text: 'بيع لأبو أحمد', version: 1 }, null], 'الملاحظة في يومها لمادّتها');
  t.same((await balanceAs(U.owner, C.feed, day(-2))).value.rows.map((r) => r.note), [null, null, null], 'واليوم التالي بلا ملاحظة');
  const edited = await note(U.millOperator, I.corn, day(-3), 'بيع ٢٠٠٠ كغم', 1);
  t.same(edited.value?.note, { text: 'بيع ٢٠٠٠ كغم', version: 2 }, 'مشغّل المعمل يعدّلها بالنسخة التي رآها');
  const stale = refusal('note_changed', await note(U.hatcheryOperator, I.corn, day(-3), 'نصّ آخر', 1));
  t.same([stale.code, stale.hint.includes('«ذرة»')], ['note_changed', true], 'بنسخة قديمة ونصّ مختلف: note_changed يسمّي المادّة');
  t.same((await note(U.hatcheryOperator, I.corn, day(-3), 'بيع ٢٠٠٠ كغم', 1)).value?.note, { text: 'بيع ٢٠٠٠ كغم', version: 2 }, 'والإعادة بالنصّ نفسه (جواب ضاع) نتيجتها بلا رفض');
  t.eq((await note(U.manager, I.corn, day(-3), 'نصّ جديد', null)).code, 'note_changed', 'رأى «بلا ملاحظة» وهي مكتوبة: note_changed');
  const cleared = await note(U.owner, I.corn, day(-3), '   ', 2);
  t.eq(canon(cleared.value), canon({ item_id: I.corn, on: day(-3), note: null }), 'الفارغ يمسح ملاحظة اليوم');
  samples.set_day_note.cleared = cleared.value;
  t.same([(await note(U.owner, I.corn, day(-3), '', 2)).value?.note, (await db.admin('select count(*)::int as n from public.stock_day_notes where item_id = $1', [I.corn])).rows[0].n],
    [null, 0], 'وإعادة المسح بلا رفض، ولا صفّ باقٍ');
  t.same([(await note(U.owner, I.corn, day(-4), 'ن'.repeat(200), null)).ok, (await note(U.owner, I.soy, day(-4), 'ن'.repeat(201), null)).code], [true, 'bad_note'], '200 حرف تُقبل، و201 bad_note');
  t.same([
    (await note(U.owner, I.corn, day(1), 'غداً', null)).code,
    (await note(U.owner, I.corn, null, 'بلا يوم', null)).code,
    (await note(U.owner, uid(), day(0), 'مجهولة', null)).code,
    (await note(U.owner, I.hidden, day(0), 'مخفيّة', null)).code,
  ], ['day_in_future', 'date_required', 'item_not_found', 'item_archived'], 'رفض الملاحظة: الغد، وبلا يوم، ومادّة مجهولة، ومادّة مخفيّة');
  const barred = [];
  for (const who of ['accountant', 'viewer', 'hallWorker']) barred.push((await note(U[who], I.soy, day(0), 'ممنوع', null)).code);
  t.same(barred, ['forbidden', 'forbidden', 'forbidden'], 'المحاسب والمشاهد وعامل القاعة لا يكتبون ملاحظة');

  // ── ٦) ملء التصنيف: النقل من تصنيف آخر، والرفض ─────────────────────────────────────────────────────────────────────
  const moved = await fill(U.owner, C.feed, [I.soy, I.corn, I.bran, I.kerosene]);
  t.same([moved.value?.moved, moved.value?.removed, (await balanceAs(U.owner, C.fuel, day(0))).value.rows.length], [1, 0, 0], 'الكاز من «المحروقات» إلى «مواد العلف»: moved 1، و«المحروقات» فارغة');
  await fill(U.owner, C.feed, [I.soy, I.corn, I.bran]);
  t.same([
    (await fill(U.manager, C.feed, [I.soy, I.soy])).code,
    (await fill(U.manager, C.feed, [I.soy, null])).code,
    (await fill(U.manager, C.feed, [I.soy, uid()])).code,
    (await fill(U.manager, C.feed, [I.hidden])).code,
    (await fill(U.manager, C.old, [I.soy])).code,
    (await fill(U.manager, uid(), [I.soy])).code,
    (await fill(U.manager, C.feed, Array.from({ length: 501 }, () => uid()))).code,
  ], ['duplicate_item', 'item_not_found', 'item_not_found', 'item_archived', 'category_archived', 'category_not_found', 'too_many_items'], 'رفض الملء بكلّ رمز');
  t.same((await db.admin('select item_order from public.item_categories where id = $1', [C.feed])).rows[0].item_order, [I.soy, I.corn, I.bran], 'الرفض لا يمسّ الترتيب');

  // ── ٧) مادّة لها ملاحظة يوم: «احذف» يُخفيها (لا يمحو الملاحظة) ─────────────────────────────────────────────────────────
  await note(U.storekeeper, I.noted, day(0), 'تُستعمل للتجربة', null);
  const del = await call(db, U.owner, 'select public.delete_item($1, (select version from public.items where id = $1)) as v', [I.noted]);
  t.same([del.code, del.hint.includes('لها ملاحظات يومية')], ['item_in_use', true], 'delete_item: الملاحظة استعمال «لها ملاحظات يومية»');

  // ── عيّنات الشاشات ──────────────────────────────────────────────────────────────────────────────────────────────
  await note(U.storekeeper, I.corn, day(-3), 'بيع لأبو أحمد', null);
  samples.day_balance = {
    owner_feed: (await balanceAs(U.owner, C.feed, day(-3))).value,
    owner_all: (await balanceAs(U.owner, null, day(-3))).value,
    mixed_units: (await balanceAs(U.owner, C.add, day(-3))).value,
    storekeeper: (await balanceAs(U.storekeeper, C.feed, day(-3))).value,
    viewer: (await balanceAs(U.viewer, C.feed, day(-3))).value,
    empty_category: (await balanceAs(U.owner, C.empty, day(-3))).value,
    no_categories: samples.no_categories,
    owner_store: (await balanceAs(U.owner, C.add, day(-3), W.raw)).value,
  };
  delete samples.no_categories;

  // ── ٩) التزامن: ملء التصنيف وتعديل مادّة يكتب category_id بنفس اللحظة لا يتعاكسان ────────────────────────────────────────
  // B يمسك صفّ المادّة أوّلاً (تعديل اسمها)، ثمّ A يملأ التصنيف (يقفل صفّ التصنيف ثمّ ينتظر صفّ المادّة)، ثمّ B يكتب category_id فيأخذ key share
  // على صفّ التصنيف لمفتاحه الأجنبيّ. بقفل for update على التصنيف ينحبس B على A وA على B (40P01)؛ بـfor no key update يكمل B ثمّ A.
  const race = await item('مادّة التزامن', 'raw', 'kg');
  const A = await db.session(U.manager);
  const B = await db.session(U.manager);
  try {
    const held = await B.run('update public.items set name = $2 where id = $1', [race, 'مادّة التزامن الثانية']);
    t.eq(held.ok, true, 'B يمسك صفّ المادّة بتعديل اسمها');
    const filling = A.run(CAT, [C.add, [I.premix, I.oil, race]]);
    t.eq(await db.settle(filling, A.pid), 'blocked', 'A (ملء التصنيف) ينتظر صفّ المادّة الذي يمسكه B');
    const moving = B.run('update public.items set category_id = $2 where id = $1', [race, C.add]);
    t.eq(await db.settle(moving, B.pid), 'finished', 'B يكتب category_id ولا ينحبس على قفل التصنيف (for no key update)');
    await B.commit();
    const filled2 = await filling;
    t.same([filled2.ok, filled2.error ?? null], [true, null], 'ثمّ A يكمل بلا 40P01');
    await A.commit();
  } finally {
    await A.rollback();
    await B.rollback();
  }

  // ── ٨) الطفرات: كلّ قاعدة تُكسر بتطبيق بديل معقول؛ الشفرة الحقيقية تحقّق «الصحيح» والطفرة لا تحقّقه ─────────────────────────────
  const CASES = [
    {
      name: 'حدّ اليوم (حركات اليوم نفسه داخلة)',
      fns: [[FN.balance, [['m.moved_on <= v_on', 'm.moved_on < v_on']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(DB, [C.feed, day(-5), null])).rows[0].v.rows.find((r) => r.item_id === I.corn).qty),
      correct: (r) => r.ok && r.value === '10000.000',
    },
    {
      name: 'نطاق المخازن (مخازن النطاق وحدها)',
      fns: [[FN.balance, [['(case when p_warehouse is null then public.in_scope_wh(y.id) else y.id = p_warehouse end)', '(p_warehouse is null or y.id = p_warehouse)']]]],
      run: ({ attempt }) => attempt(U.keeperRaw, async (q) => (await q(DB, [null, day(-2), null])).rows[0].v.rows.find((r) => r.item_id === I.kerosene).qty),
      correct: (r) => r.ok && r.value === '40.000',
    },
    {
      name: 'الترتيب بالتصنيف قبل الاسم',
      fns: [[FN.balance, [['order by p.pos nulls last, p.name_norm collate "C", p.id', 'order by p.name_norm collate "C", p.id']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(DB, [C.feed, day(0), null])).rows[0].v.rows.map((r) => r.name).join('|')),
      correct: (r) => r.ok && r.value === 'صويا|ذرة|نخالة',
    },
    {
      name: 'الإعادة بالحال نفسه بلا رفض',
      fns: [[FN.note, [['  if (n.id is null and v_text is null) or (n.id is not null and n.note = v_text) then\n', '  if false then\n']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(NOTE, [I.corn, day(-3), 'بيع لأبو أحمد', 99])).rows[0].v.note.text),
      correct: (r) => r.ok && r.value === 'بيع لأبو أحمد',
    },
    {
      name: 'المخفيّة تبقى في تصنيفها حين تُعاد القائمة',
      fns: [[FN.cat, [['category_id = c.id and archived_at is null and not (id = any (v_items))', 'category_id = c.id and not (id = any (v_items))']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => {
        await q(CAT, [C.feed, [I.soy, I.corn, I.bran]]);
        return (await q('select category_id from public.items where id = $1', [I.hidden])).rows[0].category_id;
      }),
      correct: (r) => r.ok && r.value === C.feed,
    },
    {
      name: 'فعل الملاحظة stock_note.write',
      fns: [[FN.note, [["  perform private.require('stock_note.write');\n", "  perform private.require('read');\n"]]]],
      run: ({ attempt }) => attempt(U.viewer, async (q) => (await q(NOTE, [I.soy, day(0), 'من المشاهد', null])).rows[0].v.note.text),
      correct: (r) => !r.ok && r.code === 'forbidden',
    },
  ];
  const outcomes = [];
  for (const c of CASES) {
    const real = await mutant(db, U.owner, [], (kit) => c.run(kit));
    const broken = await mutant(db, U.owner, c.fns, (kit) => c.run(kit));
    outcomes.push({ name: c.name, real: c.correct(real), caught: !c.correct(broken), shown: JSON.stringify(real), broken: JSON.stringify(broken) });
  }
  t.same(outcomes.filter((o) => !o.real).map((o) => `${o.name}: ${o.shown}`), [], `الطفرات (${CASES.length}): الشفرة الحقيقية بالصحيح في كلّ حالة`);
  t.same(outcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${o.broken}`), [], `الطفرات: ${outcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت`);

  if (process.env.DAYBAL_SAMPLES_OUT) {
    writeFileSync(process.env.DAYBAL_SAMPLES_OUT, `${JSON.stringify({ generated_by: `supabase/tests/day-balance.test.mjs (embedded Postgres 17، اليوم المثبَّت ${TODAY})`, ...samples }, null, 2)}\n`);
  }
}
