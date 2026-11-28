// ترتيب الموادّ وألوان الرصيد (0040؛ رسالتا الزبون الصوتيّتان 2026-11-26: «انا ارتب المواد… نريد نحط الأساسيات بالبداية»، و«أدوس عليها تتأشر أصفر،
// أي لون أريد، حتى من أدزلهم الرصيد اليومي تكون مضللة»؛ وأجوبة المالك: اللون يبقى حتى يُشال، و«قليلة» بحدّ لكلّ مادّة؛ DECISIONS 2026-11-26):
// (١) ترتيب القسم بشرط القائمة التي رآها الكاتب، ومنه يُرتَّب الرصيد اليوميّ وبطاقات المخزن معاً، والمادّة الجديدة بعده؛ (٢) لون المادّة وحدّ قلّتها
// بشرط النسخة، والإعادة بالقيمة نفسها بلا رفض، والحالة (نافدة وقليلة) برصيد اليوم المعروض؛ (٣) إعدادات الألوان؛ (٤) «احذف» كما كان؛ وطفرات تكسر
// كلّ قاعدة فيفشل فحصها.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

// وعيّنات القاعدة الحقيقية للشاشات: STORE_COLORS_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/store-colors-0040.json.
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'tests', 'fixtures', 'store-colors-0040.json');
const TODAY = '2026-11-26';
const id = (n) => `d3710000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477037100${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const ORDER = 'select public.set_store_order($1, $2::uuid[], $3::uuid[]) as v';
const COLOR = 'select public.set_item_color($1, $2, $3) as v';
const LOW = 'select public.set_item_low($1, $2, $3) as v';
const COLORS = 'select public.set_store_colors($1, $2, $3, $4) as v';
const FN = {
  order: 'public.set_store_order(text, uuid[], uuid[])',
  color: 'public.set_item_color(uuid, text, integer)',
  state: 'private.stock_state(numeric, numeric)',
};
const shown = (result) => (result.ok ? 'ok' : result.code);
/** مفاتيح كلّ كائن بترتيب ثابت (jsonb يرتّبها بالطول ثمّ بالبايت). */
const canon = (value) => JSON.parse(JSON.stringify(value, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x)));

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة الترتيب والألوان',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['keeper', 'storekeeper'],
      ['viewer', 'viewer'],
    ],
  });
  const { users: U, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const item = (name, kind, unit = 'kg') => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id as v', [name, kind, unit]);
  const I = {
    wheat: await item('حنطة', 'raw'),
    corn: await item('ذرة', 'raw'),
    premix: await item('برمكس انتاجي', 'additive'),
    stone: await item('حجر', 'raw'),
    feed: await item('علف بادئ', 'feed'),
  };
  await postedOpening(db, U.owner, W.raw, day(-5), [
    { item: I.wheat, qty: 300000, value: '90000000.00' },
    { item: I.corn, qty: 50, value: '25000.00' },
    { item: I.stone, qty: 100, value: '5000.00' },
  ]);
  const listOf = async (user, section) => (await one(user, 'select public.store_section_items($1) as v', [section])).items.map((x) => x.id);
  const dayRows = async (user, on = TODAY) => (await one(user, 'select public.day_balance_sections($1) as v', [on])).sections.find((s) => s.key === 'feed_materials').rows;
  const cards = async (user) => (await one(user, 'select public.items_overview() as v', [])).items.filter((x) => ['raw', 'additive'].includes(x.kind)).map((x) => x.id);
  const names = (ids) => ids.map((x) => Object.entries(I).find(([, v]) => v === x)?.[0] ?? x);

  // ── ١) الترتيب ─────────────────────────────────────────────────────────────────────────────────────
  const before = await listOf(U.keeper, 'feed_materials');
  t.same(names(before), ['premix', 'stone', 'wheat', 'corn'], 'قبل أيّ ترتيب: موادّ العلف بالاسم كما في 0035 (بلا تصنيف)');
  t.same(names((await dayRows(U.keeper)).map((r) => r.item_id)), names(before), 'والرصيد اليوميّ بالترتيب نفسه');
  t.same(names(await cards(U.keeper)), names(before), 'وبطاقات المخزن بالترتيب نفسه (كانت بالاسم وحده)');
  const wanted = [I.wheat, I.corn, I.stone, I.premix];
  const ref = await call(db, U.keeper, ORDER, ['feed_materials', wanted, before]);
  t.same([shown(ref), ref.value?.count, ref.value?.version], ['ok', 4, 2], 'الأمين يرتّب: الحنطة والذرة أوّلاً (كلمة الزبون: «نحط الأساسيات بالبداية»)');
  t.same(names(await listOf(U.viewer, 'feed_materials')), ['wheat', 'corn', 'stone', 'premix'], 'وقائمة القسم بترتيبه');
  t.same(names((await dayRows(U.viewer)).map((r) => r.item_id)), ['wheat', 'corn', 'stone', 'premix'], 'والرصيد اليوميّ بترتيبه');
  t.same(names(await cards(U.viewer)), ['wheat', 'corn', 'stone', 'premix'], 'وبطاقات المخزن بترتيبه');
  const again = await call(db, U.keeper, ORDER, ['feed_materials', wanted, before]);
  t.same([shown(again), again.value?.version], ['ok', 2], 'الإعادة بعد جواب ضاع: نجاح بلا كتابة، والنسخة كما هي');
  t.eq(shown(await call(db, U.manager, ORDER, ['feed_materials', [I.corn, I.wheat, I.stone, I.premix], before])), 'order_changed', 'ترتيب بُني على قائمة قديمة: order_changed');
  t.eq(shown(await call(db, U.manager, ORDER, ['feed_materials', [I.wheat, I.corn, I.stone], wanted])), 'items_required', 'ترتيب ناقص: items_required');
  t.eq(shown(await call(db, U.manager, ORDER, ['feed_materials', [I.wheat, I.corn, I.stone, I.feed], wanted])), 'item_not_found', 'مادّة من قسم آخر: item_not_found');
  t.eq(shown(await call(db, U.manager, ORDER, ['feed_materials', [I.wheat, I.wheat, I.stone, I.premix], wanted])), 'duplicate_item', 'مادّة مكرّرة: duplicate_item');
  t.eq(shown(await call(db, U.manager, ORDER, ['eggs', [], []])), 'bad_section', 'قسم مجهول: bad_section');
  const salt = await item('ملح', 'raw');
  t.same(names(await listOf(U.viewer, 'feed_materials')).at(-1), salt, 'مادّة جديدة بعد الترتيب: في آخر القسم');
  t.eq(shown(await call(db, U.manager, ORDER, ['feed_materials', wanted, wanted])), 'order_changed', 'وترتيب بُني قبلها (بلاها): order_changed');

  // ── ٢) لون المادّة وحدّ قلّتها ─────────────────────────────────────────────────────────────────────────
  const yellow = await call(db, U.keeper, COLOR, [I.corn, 'yellow', 0]);
  t.same(yellow.value?.mark, { color: 'yellow', low_qty: null, version: 1 }, 'الأمين يلوّن الذرة بالأصفر (كلمة الزبون: «أدوس عليها تتأشر أصفر»)');
  t.same((await call(db, U.manager, COLOR, [I.corn, 'yellow', 0])).value?.mark?.version, 1, 'اللون نفسه بنسخة قديمة: نجاح بلا كتابة (إعادة بعد جواب ضاع)');
  t.eq(shown(await call(db, U.manager, COLOR, [I.corn, 'red', 0])), 'mark_changed', 'لون آخر بنسخة قديمة: mark_changed');
  t.eq(shown(await call(db, U.manager, COLOR, [I.corn, 'gold', 1])), 'bad_color', 'لون ليس من الثمانية: bad_color');
  t.eq(shown(await call(db, U.manager, COLOR, [uid(), 'yellow', 0])), 'item_not_found', 'مادّة غير موجودة: item_not_found');
  const low = await call(db, U.keeper, LOW, [I.corn, 50, 1]);
  t.same(low.value?.mark, { color: 'yellow', low_qty: '50.000', version: 2 }, 'حدّ قلّة الذرة 50 كغم (جواب المالك: حدّ لكلّ مادّة)');
  t.eq(shown(await call(db, U.keeper, LOW, [I.corn, 0, 2])), 'bad_low_qty', 'حدّ صفر: bad_low_qty');
  t.eq(shown(await call(db, U.keeper, LOW, [I.corn, 1.2345, 2])), 'bad_low_qty', 'حدّ بأربع مراتب: bad_low_qty');
  await one(U.keeper, LOW, [I.wheat, 1000, 0]);
  const rows = Object.fromEntries((await dayRows(U.viewer)).map((r) => [r.item_id, r]));
  t.same([rows[I.corn].state, rows[I.wheat].state, rows[I.premix].state, rows[I.stone].state], ['low', null, 'out', null],
    'الحالة برصيد اليوم: الذرة 50 عند حدّها قليلة، والحنطة فوق حدّها، والبرمكس بلا رصيد نافد، والحجر بلا حدّ لا شيء');
  t.same(rows[I.corn].mark, { color: 'yellow', low_qty: '50.000', version: 2 }, 'ولون الذرة وحدّها في الرصيد اليوميّ');
  const past = Object.fromEntries((await dayRows(U.viewer, day(-6))).map((r) => [r.item_id, r.state]));
  t.same([past[I.corn], past[I.wheat]], ['out', 'out'], 'ويوم قبل الافتتاح: نافدتان برصيد ذلك اليوم');
  const card = (await one(U.viewer, 'select public.items_overview() as v', [])).items.find((x) => x.id === I.corn);
  t.same([card.mark?.color, card.state], ['yellow', 'low'], 'وبطاقة الذرة بلونها وحالتها');
  const cleared = await call(db, U.keeper, COLOR, [I.corn, null, 2]);
  t.same(cleared.value?.mark, { color: null, low_qty: '50.000', version: 3 }, 'شيل اللون: الصفّ يبقى بحدّه ونسخة أكبر (اللون «يبقى حتى يشيله»)');
  t.same((await one(U.viewer, 'select public.item_mark($1) as v', [I.corn])).mark, { color: null, low_qty: '50.000', version: 3 }, 'وملفّ المادّة يقرؤه');

  // ── ٣) إعدادات الألوان ──────────────────────────────────────────────────────────────────────────────
  t.same(canon((await one(U.viewer, 'select public.day_balance_sections(null) as v', [])).colors), canon({ auto: false, low: 'yellow', out: 'red', version: 0 }),
    'بلا إعدادات: التلقائيّ مطفأ، والأصفر للقلّة والأحمر للنفاد');
  const set = await call(db, U.manager, COLORS, [true, 'orange', 'red', 0]);
  t.same(canon(set.value), canon({ auto: true, low: 'orange', out: 'red', version: 1 }), 'المدير يشغّل التلوين التلقائيّ بالبرتقاليّ للقلّة (كلمة المالك: «من الاعدادات… تلقائيا»)');
  t.same((await call(db, U.owner, COLORS, [true, 'orange', 'red', 0])).value?.version, 1, 'الإعدادات نفسها بنسخة قديمة: نجاح بلا كتابة');
  t.eq(shown(await call(db, U.owner, COLORS, [false, 'orange', 'red', 0])), 'colors_changed', 'غيرها بنسخة قديمة: colors_changed');
  t.eq(shown(await call(db, U.owner, COLORS, [true, 'orange', null, 1])), 'bad_color', 'بلا لون نفاد: bad_color');
  t.same((await one(U.keeper, 'select public.items_overview() as v', [])).colors.low, 'orange', 'وبطاقات المخزن تعرف الإعدادات');

  // ── عيّنات الشاشات: لونان باليد (الذرة صفراء فوق حالتها، والحجر أزرق) والتلقائيّ مشغَّل، فيُرى كلّ فرع في جواب واحد ────────────────────
  const recolor = await call(db, U.keeper, COLOR, [I.corn, 'yellow', 3]);
  t.same(recolor.value?.mark, { color: 'yellow', low_qty: '50.000', version: 4 }, 'إعادة تلوين الذرة بعد شيله: نسخة أكبر');
  await one(U.keeper, COLOR, [I.stone, 'blue', 0]);
  const samples = {
    day_balance_sections: await one(U.keeper, 'select public.day_balance_sections(null) as v', []),
    items_overview: await one(U.keeper, 'select public.items_overview() as v', []),
    store_section_items: await one(U.keeper, 'select public.store_section_items($1) as v', ['feed_materials']),
    set_store_order: ref.value,
    set_item_color: recolor.value,
    set_item_color_cleared: cleared.value,
    set_item_low: low.value,
    item_mark: await one(U.keeper, 'select public.item_mark($1) as v', [I.corn]),
    item_mark_none: await one(U.keeper, 'select public.item_mark($1) as v', [I.feed]),
    item_file: await one(U.keeper, 'select public.item_file($1) as v', [I.corn]),
    set_store_colors: set.value,
    order_changed: await call(db, U.manager, ORDER, ['feed_materials', wanted, before]),
    mark_changed: await call(db, U.manager, COLOR, [I.corn, 'red', 0]),
    colors_changed: await call(db, U.owner, COLORS, [false, 'orange', 'red', 0]),
  };
  t.same([samples.order_changed.code, samples.mark_changed.code, samples.colors_changed.code], ['order_changed', 'mark_changed', 'colors_changed'], 'والرفض الثلاثة بتلميحها للشاشات');
  if (process.env.STORE_COLORS_SAMPLES_OUT) {
    writeFileSync(FIXTURE, `${JSON.stringify({ _note: `عيّنات القاعدة الحقيقية (supabase/tests/store-colors.test.mjs بـSTORE_COLORS_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات.`, ids: I, ...samples }, null, 2)}\n`);
  }

  // ── ٤) «احذف» كما كان ─────────────────────────────────────────────────────────────────────────────────
  const lone = await item('مادّة للتجربة', 'raw');
  await one(U.keeper, COLOR, [lone, 'blue', 0]);
  const del = await call(db, U.owner, 'select public.delete_item($1, (select version from public.items where id = $1)) as v', [lone]);
  t.same([shown(del), del.value?.deleted], ['ok', true], 'مادّة لم تُستعمل ولها لون تُحذف (اللون ليس استعمالاً)');
  t.ok(!(await listOf(U.viewer, 'feed_materials')).includes(lone), 'وتخرج من القسم، والرصيد اليوميّ يُقرأ بعدها');
  await dayRows(U.viewer);

  // ── ٥) الثوابت ──────────────────────────────────────────────────────────────────────────────────────
  for (const fn of ['verify_stock', 'verify_stores']) {
    const bad = (await db.admin(`select * from public.${fn}()`)).rows.filter((r) => Number(r.violations) !== 0);
    t.same(bad, [], `${fn} صفر`);
  }

  // ── ٦) طفرات ────────────────────────────────────────────────────────────────────────────────────────
  const now = await listOf(U.manager, 'feed_materials');
  await mutant(db, U.manager, [[FN.order, [['  if v_now <> p_items and v_now <> p_expected then', '  if false then']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(ORDER, ['feed_materials', [...now].reverse(), before])).rows[0].v);
    t.eq(r.ok, true, 'طفرة: بلا شرط القائمة يكتب ترتيب بُني على قائمة قديمة فوق ترتيب غيره، فيفشل فحص order_changed');
  });
  await mutant(db, U.manager, [[FN.state, [['p_qty <= p_low', 'p_qty < p_low']]]], async ({ attempt }) => {
    const r = await attempt(U.viewer, async (q) => (await q('select public.day_balance_sections(null) as v')).rows[0].v);
    const corn = r.value.sections.find((s) => s.key === 'feed_materials').rows.find((x) => x.item_id === I.corn);
    t.eq(corn.state, null, 'طفرة: «تحت الحدّ» بدل «عنده أو تحته» لا تعدّ الذرة 50 قليلة، فيفشل فحص الحالة');
  });
  await mutant(db, U.manager, [[FN.color, [['  if m.color is not distinct from p_color then', '  if false then']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(COLOR, [I.wheat, null, 0])).rows[0].v);
    t.eq(r.code, 'mark_changed', 'طفرة: بلا «القيمة نفسها نجاح» تُرفض إعادة بعد جواب ضاع، فيفشل فحص الإعادة');
  });
}
