// «ترتيب معمل العلف» (0023؛ كلمة المالك 2026-11-10 وأجوبته: الفرق للطنّ من مادّة واحدة يسمّيها، وشاشة واحدة للكمية والمواد، والتقرير
// «كلشي مفتوح»؛ DECISIONS «ترتيب معمل العلف»): ترتيب العلائق (set_recipe_order) وموادّ المسوّدة (set_recipe_line_order) مشروطَين بما رآه
// المدير، والإنتاج بنداء واحد (record_production: الكميات الفعلية والمادّة الإضافية للطنّ والملاحظة، وكلّ مشكلة ترفض النداء كلّه بتلميحها،
// ومشغّل المعمل مسوّدة تنتظر ختم الكلف، والإعادة بالمرجع نفسه بلا إنتاج ثانٍ)، وتقرير العليقة بالأيام (mill_report: الدفعات المرحَّلة
// بنطاق القارئ، والمواد المسحوبة بقيمها، والمال لكلّ قارئ)؛ والثوابت صفر؛ وطفرات تكسر كلّ قاعدة فيفشل فحصها؛ وعيّنات حقيقية للشاشات.
import { readFileSync, writeFileSync } from 'node:fs';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';

const TODAY = '2026-11-10';
const id = (n) => `d2330000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099970${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};

const ORDER = 'select public.set_recipe_order($1::uuid[], $2::uuid[]) as v';
const LINES = 'select public.set_recipe_line_order($1, $2::uuid[], $3::uuid[]) as v';
const RP = 'select public.record_production($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13) as v';
const REPORT = 'select public.mill_report($1, $2, $3) as v';
const OVERVIEW = 'select public.recipes_overview() as v';
const FN = {
  order: 'public.set_recipe_order(uuid[], uuid[])',
  lines: 'public.set_recipe_line_order(uuid, uuid[], uuid[])',
  produce: 'public.record_production(uuid, uuid, numeric, uuid, uuid, date, jsonb, jsonb, numeric, date, text, text, uuid)',
  report: 'public.mill_report(uuid, date, date)',
  overview: 'public.recipes_overview()',
  guard: 'private.recipe_lines_guard()',
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'معمل الترتيب',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill']],
      ['accountant', 'accountant'],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['viewer', 'viewer', ['feed_mill']],
      ['keeperGeneral', 'storekeeper', ['general']],
    ],
  });
  const { users: U, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const item = (name, kind, unit, density = null) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, $3, $4) returning id', [name, kind, unit, density]);
  const I = {
    corn: await item('ذرة', 'raw', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    oil: await item('زيت', 'raw', 'L', '0.92'),
    premix: await item('برمكس', 'raw', 'kg'),
    starter: await item('علف بادئ', 'feed', 'kg'),
    finisher: await item('علف ناهٍ', 'feed', 'kg'),
    breeder: await item('علف أمّهات', 'feed', 'kg'),
  };
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد المعمل', true) returning id");
  const buyOn = (on, itemId, qty, price) =>
    one(U.owner, "select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, null, 'credit', null, null) as v", [uid(), uid(), uid(), itemId, supplier, on, qty, price]);
  const buy = (itemId, qty, price) => buyOn(day(-2), itemId, qty, price);

  const CR = "select public.create_recipe($1, $2, $3, $4, $5, $6::jsonb, '[]'::jsonb, true) as v";
  const recipe = async (name, output, basis, lines) => {
    const ids = { id: uid(), version: uid() };
    await one(U.owner, CR, [ids.id, ids.version, name, output, basis, JSON.stringify(lines)]);
    return ids;
  };
  // البادئ: ذرة 600 + صويا 350 + زيت 30 لتر (27.6 كغم بكثافة 0.92) = 977.6 كغم، فالطنّ ينقصه 22.4 كغم.
  const R = {
    starter: await recipe('علف بادئ', I.starter, '977.600', [
      { item_id: I.corn, qty: '600.000', unit: 'kg' },
      { item_id: I.soy, qty: '350.000', unit: 'kg' },
      { item_id: I.oil, qty: '30.000', unit: 'L' },
    ]),
    finisher: await recipe('علف ناهٍ', I.finisher, '980.000', [{ item_id: I.corn, qty: '700.000', unit: 'kg' }, { item_id: I.soy, qty: '280.000', unit: 'kg' }]),
    breeder: await recipe('علف أمّهات', I.breeder, '1000.000', [{ item_id: I.corn, qty: '500.000', unit: 'kg' }, { item_id: I.soy, qty: '500.000', unit: 'kg' }]),
  };
  // تاريخ البادئ قبل هذا الشهر (التقويم: شهران بإنتاج ودرجتان): دفعة في أيلول وأخرى في تشرين الأوّل بموادّ اشتُريت في أيلول. اليوم يُرجَع
  // بـsetToday، فكلّ تاريخ في حدّ الأيام السبعة.
  const history = [];
  const produceOn = (on) => one(U.owner, RP, [uid(), R.starter.version, '977.600', W.raw, W.feed, on, '[]', '[]', null, null, null, null, uid()]);
  await db.setToday('2026-09-14', async () => {
    await buyOn('2026-09-12', I.corn, 1500, 430);
    await buyOn('2026-09-12', I.soy, 800, 880);
    await buyOn('2026-09-12', I.oil, 70, 1900);
    history.push(await produceOn('2026-09-14'));
  });
  await db.setToday('2026-10-20', async () => history.push(await produceOn('2026-10-20')));
  t.same(history.map((h) => [h.status, h.produced_on, norm(h.output_qty_kg)]), [['posted', '2026-09-14', '977.6'], ['posted', '2026-10-20', '977.6']],
    'تاريخ البادئ: دفعة في أيلول وأخرى في تشرين الأوّل');
  await buy(I.corn, 10000, 450);
  await buy(I.soy, 5000, 900);
  await buy(I.oil, 200, 2000);
  await buy(I.premix, 100, 3000);
  const samples = { recipes_overview: {}, recipe_detail: {}, set_recipe_order: {}, set_recipe_line_order: {}, record_production: {}, mill_report: {}, refusals: {} };
  const refusal = (name, result) => {
    samples.refusals[name] = { code: result.code, hint: result.hint };
    return result;
  };
  const liveOrder = async () => (await one(U.owner, OVERVIEW, [])).recipes.filter((r) => !r.archived).map((r) => r.id);

  // ── ١) ترتيب العلائق ─────────────────────────────────────────────────────────────────────────────────────────────
  const byName = await liveOrder();
  t.same(byName.length, 3, 'ثلاث علائق فعّالة، بلا ترتيب بعد (بالاسم)');
  const wanted = [R.finisher.id, R.breeder.id, R.starter.id];
  const ordered = await call(db, U.manager, ORDER, [wanted, byName]);
  samples.set_recipe_order.ok = ordered.value;
  t.same([ordered.ok && ordered.value.count, await liveOrder()], [3, wanted], 'المدير يرتّب العلائق، وrecipes_overview يعرضها بترتيبه');
  t.same((await call(db, U.manager, ORDER, [wanted, byName])).ok, true, 'إعادة الطلب نفسه بعد جواب ضاع بلا رفض (الحال هو المطلوب)');
  const stale = refusal('recipes_changed', await call(db, U.owner, ORDER, [[R.starter.id, R.finisher.id, R.breeder.id], byName]));
  t.same([stale.code, stale.hint.includes('من نافذة أو جهاز آخر'), await liveOrder()], ['recipes_changed', true, wanted],
    'ترتيب من شاشة قديمة (رأت الترتيب بالاسم) يُرفض recipes_changed ولا يمسّ ما رتّبه المدير');
  const extraRecipe = await recipe('علف تجربة', I.breeder, '1000.000', [{ item_id: I.corn, qty: '1000.000', unit: 'kg' }]);
  t.same((await call(db, U.manager, ORDER, [wanted, wanted])).code, 'recipes_changed', 'عليقة جديدة أُضيفت بعد فتح الشاشة: recipes_changed');
  await one(U.owner, 'update public.recipes set archived_at = now() where id = $1 returning id', [extraRecipe.id]);
  t.same([(await call(db, U.manager, ORDER, [wanted, wanted])).ok, await liveOrder()], [true, wanted], 'والمؤرشفة خارج الترتيب: يصحّ الترتيب الفعّال وحده');
  samples.recipes_overview.ordered = await one(U.owner, OVERVIEW, []);
  t.same(samples.recipes_overview.ordered.recipes.map((r) => [r.name, r.archived]), [['علف ناهٍ', false], ['علف أمّهات', false], ['علف بادئ', false], ['علف تجربة', true]],
    'recipes_overview: الفعّالة بترتيب المدير ثمّ المؤرشفة');
  t.same([
    (await call(db, U.manager, ORDER, [[...wanted, wanted[0]], wanted])).code,
    (await call(db, U.manager, ORDER, [[wanted[0], uid(), wanted[2]], wanted])).code,
    (await call(db, U.manager, ORDER, [[wanted[0], extraRecipe.id, wanted[2]], wanted])).code,
    (await call(db, U.manager, ORDER, [wanted.slice(0, 2), wanted])).code,
    (await call(db, U.manager, ORDER, [null, wanted])).code,
    (await call(db, U.storekeeper, ORDER, [wanted, wanted])).code,
  ], ['duplicate_item', 'recipe_not_found', 'recipe_not_found', 'items_required', 'items_required', 'forbidden'],
  'رفض الترتيب: مكرّرة، ومجهولة، ومؤرشفة، وناقصة، وبلا قائمة، والأمين بلا فعل التفعيل');

  // ── ٢) ترتيب موادّ العليقة في المسوّدة ──────────────────────────────────────────────────────────────────────────────
  const draftId = uid();
  const draft = await one(U.owner, 'select public.new_recipe_version($1, $2) as v', [R.starter.id, draftId]);
  const detail = async (versionId) => one(U.owner, 'select public.recipe_detail($1, $2) as v', [R.starter.id, versionId]);
  const lineIds = async (versionId) => (await db.admin('select id from public.recipe_lines where version_id = $1 order by line_no', [versionId])).rows.map((r) => r.id);
  const shown = await lineIds(draft.version_id);
  const itemsOf = async (versionId) => (await db.admin('select item_id, line_no from public.recipe_lines where version_id = $1 order by line_no', [versionId])).rows;
  t.same((await itemsOf(draft.version_id)).map((r) => r.item_id), [I.corn, I.soy, I.oil], 'المسوّدة بموادّ النسخة المفعَّلة وترتيبها');
  const reorder = [shown[2], shown[0], shown[1]];
  const reordered = await call(db, U.owner, LINES, [draft.version_id, reorder, shown]);
  samples.set_recipe_line_order.ok = reordered.value;
  t.same([reordered.ok && reordered.value.count, (await itemsOf(draft.version_id)).map((r) => [r.item_id, r.line_no])],
    [3, [[I.oil, 1], [I.corn, 2], [I.soy, 3]]], 'المالك يرتّب موادّ المسوّدة: الزيت أوّلاً، والأرقام 1..3');
  samples.recipe_detail.draft = await detail(draft.version_id);
  t.same(samples.recipe_detail.draft.lines.map((l) => l.item_id), [I.oil, I.corn, I.soy], 'recipe_detail يعرض السطور بترتيبها الجديد');
  t.same((await call(db, U.owner, LINES, [draft.version_id, reorder, shown])).ok, true, 'إعادة الترتيب نفسه بلا رفض');
  t.same(refusal('lines_changed', await call(db, U.manager, LINES, [draft.version_id, shown, shown])).code, 'lines_changed',
    'ترتيب من شاشة قديمة يُرفض lines_changed');
  t.same(refusal('not_draft', await call(db, U.owner, LINES, [R.starter.version, await lineIds(R.starter.version), await lineIds(R.starter.version)])).code, 'not_draft',
    'النسخة المفعَّلة لا يتغيّر ترتيبها (not_draft): الترتيب في المسوّدة');
  t.same([
    (await call(db, U.owner, LINES, [draft.version_id, [reorder[0], reorder[0], reorder[2]], reorder])).code,
    (await call(db, U.owner, LINES, [draft.version_id, [reorder[0], (await lineIds(R.finisher.version))[0], reorder[2]], reorder])).code,
    (await call(db, U.owner, LINES, [draft.version_id, reorder.slice(0, 2), reorder])).code,
    (await call(db, U.millOperator, LINES, [draft.version_id, reorder, reorder])).code,
  ], ['duplicate_item', 'line_not_found', 'items_required', 'forbidden'], 'رفض ترتيب الموادّ: مكرّرة، ومن نسخة أخرى، وناقصة، ومشغّل المعمل');
  // رقم السطر لا يكتبه أحد مباشرة (العمود غير ممنوح)، ولو بعلامة المعاملة؛ وتعديل الكمية يُبقي الرقم.
  const direct = await call(db, U.owner, 'update public.recipe_lines set line_no = 9 where id = $1 returning line_no', [reorder[0]]);
  const flagged = await call(db, U.owner, "select set_config('app.recipe_line_order', 'on', true), (select count(*) from (update public.recipe_lines set line_no = 9 where id = $1 returning 1) x) as v", [reorder[0]]);
  await one(U.owner, "update public.recipe_lines set qty = 31 where id = $1 returning id", [reorder[0]]);
  t.same([direct.ok, flagged.ok, (await itemsOf(draft.version_id)).map((r) => r.line_no)], [false, false, [1, 2, 3]],
    'line_no لا يُكتب من الشاشة مباشرةً (ولو بعلامة المعاملة)، وتعديل الكمية يُبقي الرقم');

  // ── ٣) الإنتاج بنداء واحد ─────────────────────────────────────────────────────────────────────────────────────────
  const stock = async (itemId) => norm((await db.admin('select coalesce(sum(qty), 0)::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [itemId, W.raw])).rows[0].q);
  const before = { corn: await stock(I.corn), soy: await stock(I.soy), oil: await stock(I.oil), premix: await stock(I.premix) };
  const produce = (user, args) => {
    const a = { id: uid(), version: R.starter.version, kg: '977.600', in: W.raw, out: W.feed, on: TODAY, actuals: [], extra: [], output: null, expiry: null, reason: null, note: null, ref: uid(), ...args };
    return { a, run: () => call(db, user, RP, [a.id, a.version, a.kg, a.in, a.out, a.on, JSON.stringify(a.actuals), JSON.stringify(a.extra), a.output, a.expiry, a.reason, a.note, a.ref]) };
  };
  // (أ) «قرّب إلى طنّ» ببرمكس (ليس من موادّ الخلطة): 977.6 + 22.4 = 1,000 كغم، والملاحظة.
  const ton = produce(U.owner, { extra: [{ id: uid(), item_id: I.premix, qty: '22.400' }], note: 'أكملنا الطنّ ببرمكس' });
  const tonResult = await ton.run();
  samples.record_production.posted = tonResult.value;
  t.same(tonResult.ok ? [tonResult.value.status, norm(tonResult.value.output_qty_kg), norm(tonResult.value.input_mass_kg), norm(tonResult.value.shrink_kg), tonResult.value.note,
    tonResult.value.recipe_name, tonResult.value.output_warehouse_name, Boolean(tonResult.value.doc_no), Boolean(tonResult.value.money?.cost_per_kg)] : tonResult.code,
  ['posted', '1000', '1000', '0', 'أكملنا الطنّ ببرمكس', 'علف بادئ', 'مخزن العلف', true, true],
  'الإنتاج بنداء واحد: طنّ كامل (977.6 + 22.4 برمكس)، بلا هدر، والملاحظة محفوظة، ورقم الدفعة والكلفة للمالك');
  t.same([await stock(I.corn), await stock(I.soy), await stock(I.oil), await stock(I.premix)],
    [norm(String(Number(before.corn) - 600)), norm(String(Number(before.soy) - 350)), norm(String(Number(before.oil) - 30)), norm(String(Number(before.premix) - 22.4))],
    'سُحبت الموادّ كلّها من مخزن المواد: 600 ذرة و350 صويا و30 لتر زيت و22.4 برمكس');
  const retry = await ton.run();
  t.same([retry.ok, retry.value?.doc_no, (await db.admin('select count(*)::int as n from public.production_batches where id = $1', [ton.a.id])).rows[0].n],
    [true, tonResult.value.doc_no, 1], 'الإعادة بالمرجع والقيم نفسها ترجّع النتيجة نفسها، ولا دفعة ثانية');
  t.same(refusal('ref_reused', await call(db, U.owner, RP, [ton.a.id, ton.a.version, '500.000', ton.a.in, ton.a.out, ton.a.on, '[]', '[]', null, null, null, null, ton.a.ref])).code, 'ref_reused',
    'المرجع نفسه بقيم أخرى: ref_reused');
  t.same(refusal('id_conflict', await produce(U.owner, { id: ton.a.id }).run()).code, 'id_conflict', 'معرّف دفعة سُجّلت (ضغطتان بمرجعين): id_conflict');
  // (ب) الفرق للطنّ على مادّة من الخلطة: الذرة 622.4 بدل 600 (p_actuals)، وكمية فعلية أخرى للصويا.
  const actual = await produce(U.owner, { actuals: [{ line_no: 1, qty: '622.400' }] }).run();
  const actualInputs = (await db.admin('select line_no, trim_scale(planned_qty_base)::text as p, trim_scale(actual_qty_base)::text as a from public.production_inputs where batch_id = $1 order by line_no', [actual.value?.id])).rows;
  t.same([actual.ok && norm(actual.value.output_qty_kg), actualInputs.map((r) => [r.line_no, r.p, r.a])], ['1000', [[1, '600', '622.4'], [2, '350', null], [3, '30', null]]],
    'الفرق على مادّة من الخلطة: كميتها الفعلية 622.4 والمخطّط كما هو، والناتج طنّ');
  // (ج) كلّ مشكلة ترفض النداء كلّه، بلا مسوّدة باقية.
  const short = produce(U.owner, { kg: '20000.000' });
  const shortResult = refusal('production_blocked', await short.run());
  const leftover = (await db.admin('select count(*)::int as n from public.production_batches where id = $1', [short.a.id])).rows[0].n;
  t.same([shortResult.code, shortResult.hint.includes('لا يكفي رصيد «ذرة» في «مخزن المواد الأوّلية»'), leftover], ['production_blocked', true, 0],
    `نقص المخزون: production_blocked بتلميح يسمّي المادّة والمخزن والكميتين (${shortResult.hint})، ولا مسوّدة تبقى`);
  const waste = await produce(U.owner, { output: '900.000' }).run();
  t.same([waste.code, waste.hint?.includes('خارج المدى المقبول')], ['production_blocked', true], 'وزن ناتج بهدر 8٪ بلا سبب: production_blocked بتلميح الهدر');
  const wasteOk = await produce(U.owner, { output: '900.000', reason: 'انسكب جزء أثناء التعبئة' }).run();
  t.same(wasteOk.ok ? [wasteOk.value.status, norm(wasteOk.value.shrink_kg)] : wasteOk.code, ['posted', '77.6'], 'ومعه سببه: يُنتَج والهدر 77.6 كغم');
  t.same([
    refusal('bad_line', await produce(U.owner, { actuals: [{ line_no: 9, qty: '5' }] }).run()).code,
    (await produce(U.owner, { actuals: [{ line_no: 1, qty: 'خمسة' }] }).run()).code,
    (await produce(U.owner, { actuals: [{ line_no: 1, qty: '5' }, { line_no: 1, qty: '6' }] }).run()).code,
    (await produce(U.owner, { actuals: [{ line_no: 1, qty: '0' }] }).run()).code,
    (await produce(U.owner, { extra: [{ id: uid(), item_id: I.premix, qty: '-1' }] }).run()).code,
    (await produce(U.owner, { note: 'م'.repeat(501) }).run()).code,
    (await produce(U.owner, { kg: '0' }).run()).code,
    refusal('qty_too_large', await produce(U.owner, { kg: '1000000000.000' }).run()).code,
    (await produce(U.owner, { out: W.raw }).run()).code,
    (await produce(U.storekeeper, {}).run()).code,
    (await produce(U.accountant, {}).run()).code,
  ], ['bad_line', 'bad_line', 'bad_line', 'qty_not_positive', 'bad_line', 'bad_note', 'qty_not_positive', 'qty_too_large', 'same_warehouse', 'forbidden', 'forbidden'],
  'رفض الإنتاج: سطر غير موجود، وكمية غير رقم، وسطر مكرّر، وصفر، ومادّة إضافية سالبة، وملاحظة طويلة، وكمية صفر، وكمية أكبر من المعقول، والمخزن نفسه، والأمين والمحاسب بلا فعل التسويد');
  // (د) مشغّل المعمل: مسوّدة تنتظر ختم الكلف، ثمّ يختمها المدير ويرحّلها المشغّل من صفحة الدفعة.
  const operator = produce(U.millOperator, { version: R.finisher.version, kg: '980.000' });
  const opResult = await operator.run();
  samples.record_production.draft = opResult.value;
  t.same(opResult.ok ? [opResult.value.status, opResult.value.awaiting, opResult.value.recipe_name, Boolean(opResult.value.money)] : opResult.code, ['draft', 'costs', 'علف ناهٍ', false],
    'مشغّل المعمل: الدفعة تُحفظ مسوّدة تنتظر ختم الكلف (القاعدة القائمة)، بلا مال');
  const sealVersion = (await db.admin('select version from public.production_batches where id = $1', [operator.a.id])).rows[0].version;
  await one(U.manager, 'select public.confirm_production_costs($1, $2) as v', [operator.a.id, sealVersion]);
  const opPreview = await one(U.millOperator, 'select public.preview_production($1) as v', [operator.a.id]);
  const opPosted = await call(db, U.millOperator, 'select public.post_production($1, $2, $3, $4) as v', [operator.a.id, opPreview.version, opPreview.plan_token, uid()]);
  t.same(opPosted.ok && opPosted.value.status, 'posted', 'وبعد الختم يرحّلها مشغّل المعمل من صفحتها كما كانت');

  // ── ٤) تقرير العليقة ──────────────────────────────────────────────────────────────────────────────────────────────
  // دفعة البادئ الملغاة لا تظهر: تُنتَج ثمّ تُلغى.
  const voided = await produce(U.owner, {}).run();
  await one(U.owner, "select public.void_production($1, 'خطأ في الكمية', $2) as v", [voided.value.id, uid()]);
  const year = await call(db, U.millOperator, REPORT, [R.starter.id, '2026-01-01', '2026-12-31']);
  samples.mill_report.year = (await call(db, U.owner, REPORT, [R.starter.id, '2026-01-01', '2026-12-31'])).value;
  samples.mill_report.month = (await call(db, U.owner, REPORT, [R.starter.id, '2026-11-01', '2026-11-30'])).value;
  samples.mill_report.day = (await call(db, U.owner, REPORT, [R.starter.id, TODAY, TODAY])).value;
  samples.mill_report.empty = (await call(db, U.owner, REPORT, [R.starter.id, '2026-08-01', '2026-08-31'])).value;
  const Y = samples.mill_report.year;
  const M = samples.mill_report.month;
  t.same([Y.recipe.name, Y.days.map((d) => [d.day, d.batches, norm(d.output_kg)]), Y.batches.length, norm(Y.totals.output_kg), Y.batches.map((b) => b.note).filter(Boolean)],
    ['علف بادئ', [['2026-09-14', 1, '977.6'], ['2026-10-20', 1, '977.6'], [TODAY, 3, '2900']], 5, '4855.2', ['أكملنا الطنّ ببرمكس']],
    'تقرير السنة للبادئ: أيلول وتشرين الأوّل بدفعة لكلّ منهما واليوم بثلاث دفعات مرحَّلة (2,900 كغم)، والملغاة خارجه، والملاحظة مع دفعتها');
  const mats = Object.fromEntries(M.materials.map((m) => [m.name, [m.base_unit, norm(m.qty), norm(m.mass_kg), Number(m.value) > 0]]));
  t.same(mats, {
    'ذرة': ['kg', '1822.4', '1822.4', true],
    'صويا': ['kg', '1050', '1050', true],
    'زيت': ['L', '90', '82.8', true],
    'برمكس': ['kg', '22.4', '22.4', true],
  }, 'المواد المسحوبة في تشرين الثاني مجموعةً: الذرة (600 + 622.4 + 600) والصويا والزيت باللتر وكتلته، والبرمكس الإضافي، وكلّها بقيمة');
  t.same([M.materials.map((m) => m.name), norm(M.totals.output_kg), M.totals.batches, Number(M.totals.total_value) > 0],
    [['ذرة', 'صويا', 'زيت', 'برمكس'], '2900', 3, true], 'المواد بالكتلة من الأكبر، والمجاميع');
  t.same([year.ok, year.value.totals.total_value === Y.totals.total_value, Boolean(year.value.batches[0].money.cost_per_kg)], [true, true, true],
    'المال في التقرير لكلّ قارئ (كلمة المالك «كلشي مفتوح»): مشغّل المعمل (لا يرى الكلفة في غيره) يراها نفسها');
  t.same([samples.mill_report.month.batches.length, samples.mill_report.day.batches.length, samples.mill_report.empty.days, samples.mill_report.empty.batches,
    norm(samples.mill_report.empty.totals.output_kg)], [3, 3, [], [], '0'], 'الشهر واليوم بدفعاته الثلاث، وشهر بلا إنتاج فارغ بمجاميع صفر');
  const all = await one(U.owner, REPORT, [null, TODAY, TODAY]);
  t.same([all.recipe, all.batches.map((b) => b.recipe_name).sort()], [null, ['علف بادئ', 'علف بادئ', 'علف بادئ', 'علف ناهٍ']], 'بلا عليقة: كلّ علائق المعمل');
  const outside = await one(U.keeperGeneral, REPORT, [null, '2026-01-01', '2026-12-31']);
  t.same([outside.batches.length, outside.days.length], [0, 0], 'أمين المخزن العامّ: مخزنا الدفعة خارج نطاقه، فلا دفعة');
  t.same([
    refusal('range_too_long', await call(db, U.owner, REPORT, [R.starter.id, '2026-01-01', '2027-01-02'])).code,
    refusal('bad_range', await call(db, U.owner, REPORT, [R.starter.id, '2026-02-01', '2026-01-01'])).code,
    refusal('date_required', await call(db, U.owner, REPORT, [R.starter.id, null, '2026-01-01'])).code,
    (await call(db, U.owner, REPORT, [R.starter.id, '-infinity', '2026-01-01'])).code,
    (await call(db, U.owner, REPORT, [uid(), '2026-01-01', '2026-01-31'])).code,
  ], ['range_too_long', 'bad_range', 'date_required', 'date_required', 'recipe_not_found'], 'رفض التقرير: أطول من سنة، ومقلوب، وبلا تاريخ، ولا نهائيّ، وعليقة مجهولة');

  // ── ٥) الثوابت ────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const fn of ['verify_mill', 'verify_stock', 'verify_ledger', 'verify_purchases']) {
    const rows = (await db.admin(`select check_name, violations from public.${fn}()`)).rows.filter((r) => Number(r.violations) > 0);
    t.same(rows, [], `${fn}: صفر`);
  }

  // ── ٦) الطفرات: كلّ قاعدة مكسورة يفشل فحصها ──────────────────────────────────────────────────────────────────────────
  const CASES = [
    {
      name: 'ترتيب العلائق بلا شرط ما رآه المدير',
      fns: [[FN.order, [['if v_now <> p_ids and v_now <> p_expected then', 'if false then']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(ORDER, [[R.starter.id, R.finisher.id, R.breeder.id], byName])).rows[0].v),
      correct: (r) => !r.ok && r.code === 'recipes_changed',
    },
    {
      name: 'ترتيب الموادّ بلا شرط ما رآه',
      fns: [[FN.lines, [['if v_now <> p_lines and v_now <> p_expected then', 'if false then']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(LINES, [draft.version_id, shown, shown])).rows[0].v),
      correct: (r) => !r.ok && r.code === 'lines_changed',
    },
    {
      name: 'الحارس يجمّد رقم السطر دائماً',
      fns: [[FN.guard, [["(to_jsonb(old) - 'line_no') then\n    update public.recipe_versions", "(to_jsonb(old) - 'line_no') then\n    new.line_no := old.line_no;\n    update public.recipe_versions"]]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => {
        const ids = (await q('select id from public.recipe_lines where version_id = $1 order by line_no', [draft.version_id])).rows.map((r) => r.id);
        await q(LINES, [draft.version_id, [ids[1], ids[0], ids[2]], ids]);
        return (await q('select array_agg(id order by line_no) as v from public.recipe_lines where version_id = $1', [draft.version_id])).rows[0].v;
      }),
      correct: (r) => r.ok && r.value[0] === reorder[1],
    },
    {
      name: 'recipes_overview بالاسم وحده',
      fns: [[FN.overview, [['r.archived_at is not null, r.position nulls last, r.name_norm', 'r.archived_at is not null, r.name_norm']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(OVERVIEW)).rows[0].v.recipes.filter((r) => !r.archived).map((r) => r.id)),
      correct: (r) => r.ok && JSON.stringify(r.value) === JSON.stringify(wanted),
    },
    {
      name: 'الإنتاج بلا مرجع (الإعادة تنتج مرّة ثانية أو ترفض)',
      fns: [[FN.produce, [['  if v_cached is not null then\n    return v_cached;\n  end if;\n', '']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(RP, [ton.a.id, ton.a.version, ton.a.kg, ton.a.in, ton.a.out, ton.a.on, JSON.stringify(ton.a.actuals),
        JSON.stringify(ton.a.extra), ton.a.output, ton.a.expiry, ton.a.reason, ton.a.note, ton.a.ref])).rows[0].v.doc_no),
      correct: (r) => r.ok && r.value === tonResult.value.doc_no,
    },
    {
      name: 'مشغّل المعمل يُرفض بدل المسوّدة',
      fns: [[FN.produce, [["if jsonb_array_length(v_prev -> 'problems') > 0 and not exists", 'if false and not exists']]]],
      run: ({ attempt }) => attempt(U.millOperator, async (q) => (await q(RP, [uid(), R.finisher.version, '980.000', W.raw, W.feed, TODAY, '[]', '[]', null, null, null, null, uid()])).rows[0].v.status),
      correct: (r) => r.ok && r.value === 'draft',
    },
    {
      name: 'المشكلة لا ترفض (يُرحَّل بلا وزن مقبول)',
      fns: [[FN.produce, [["  if not coalesce((v_prev ->> 'can_post')::boolean, false) then", '  if false then']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(RP, [uid(), R.starter.version, '977.600', W.raw, W.feed, TODAY, '[]', '[]', '900.000', null, null, null, uid()])).rows[0].v.status),
      correct: (r) => !r.ok && r.code === 'production_blocked',
    },
    {
      name: 'التقرير بلا نطاق القارئ',
      fns: [[FN.report, [['      and public.in_scope_wh(d.input_warehouse_id)\n', '\n']]]],
      run: ({ attempt }) => attempt(U.keeperGeneral, async (q) => (await q(REPORT, [null, '2026-01-01', '2026-12-31'])).rows[0].v.batches.length),
      correct: (r) => r.ok && r.value === 0,
    },
    {
      name: 'التقرير بالملغاة',
      fns: [[FN.report, [["where d.org_id = v_org and d.status = 'posted' and", 'where d.org_id = v_org and d.status <> \'draft\' and']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => (await q(REPORT, [R.starter.id, '2026-11-01', '2026-11-30'])).rows[0].v.batches.length),
      correct: (r) => r.ok && r.value === 3,
    },
    {
      name: 'التقرير بالمخطّط لا بالفعلي',
      fns: [[FN.report, [['      sum(coalesce(p.actual_qty_base, p.planned_qty_base)) as qty,', '      sum(p.planned_qty_base) as qty,']]]],
      run: ({ attempt }) => attempt(U.owner, async (q) => norm((await q(REPORT, [R.starter.id, '2026-11-01', '2026-11-30'])).rows[0].v.materials.find((m) => m.name === 'ذرة').qty)),
      correct: (r) => r.ok && r.value === '1822.4',
    },
    {
      name: 'التقرير يُخفي المال عن مشغّل المعمل',
      fns: [[FN.report, [['  return v_result;\n', '  return private.mask(v_result);\n']]]],
      run: ({ attempt }) => attempt(U.millOperator, async (q) => (await q(REPORT, [R.starter.id, '2026-01-01', '2026-12-31'])).rows[0].v.batches[0].money?.cost_per_kg ?? null),
      correct: (r) => r.ok && r.value === Y.batches[0].money.cost_per_kg,
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

  if (process.env.MILL3_SAMPLES_OUT) {
    // stale_preview لا يُستخرج بنداء حتمي (سباقان متتاليان داخل نداء واحد): جملته من نصّ الهجرة نفسه، الموضع الوحيد الذي يرفعها به record_production.
    const migration = readFileSync(new URL('../migrations/0023_mill_order_produce.sql', import.meta.url), 'utf8');
    const stale = [...migration.matchAll(/raise exception 'stale_preview' using hint = '([^']+)'/gu)].map((m) => m[1]);
    if (stale.length !== 1) throw new Error(`stale_preview في 0023: ${stale.length} موضع`);
    samples.refusals.stale_preview = { code: 'stale_preview', hint: stale[0] };
    writeFileSync(process.env.MILL3_SAMPLES_OUT, `${JSON.stringify({ generated_by: `supabase/tests/mill3.test.mjs (embedded Postgres 17، اليوم المثبَّت ${TODAY})`, ...samples }, null, 2)}\n`);
  }
}
