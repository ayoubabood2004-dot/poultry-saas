// معمل العلف، النسخة الأولى (0015، كلمة المالك 2026-11-03): الخلطة ونسخها وسطورها بكتابة المدير المباشرة وحرّاسها،
// وactivate_recipe_version (المجموع بالكيلو = الأساس، والسائل بالكثافة لقطةً، ونسخة مفعَّلة واحدة)، وcreate_production
// (لقطة العليقة والمخطّط بالقاعدة ١٨)، وpreview_production (خطّة السحب والكلفة والهدر وبصمتها)، وpost_production
// (القاعدتان ٢١ و٢٢: قيمة دفعة الناتج = الكلفة بالضبط، والهدر خارج المدى يحتاج سبباً)، وvoid_production (المواد ترجع
// لدفعاتها)، والأدوار (مشغّل المعمل يسوّد ولا يرحّل بلا ختم، ولا يرى المال)، وكل رمز رفض، وضوابط verify_mill.
// الأرقام محسوبة باليد بالتعليق جنب كل واحد، مو منسوخة من جواب الدالّة.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** محلّل الشاشات الحقيقي لأجوبة المعمل (الدمج: جواب القاعدة يمرّ بالمحلّل الحقيقي محزوماً بـesbuild، درس 2026-11-02). */
async function screensParser() {
  const result = await build({
    stdin: { contents: "export { parseRecipes, parseRecipe, parsePreview, parseBatch } from './src/lib/repo/mill.ts';", resolveDir: ROOT, loader: 'ts' },
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

const TODAY = '2026-11-03';
const id = (n) => `c111a000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477993000${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
let refs = 0;
const ref = () => id(600 + (refs += 1));

const U = { owner: id(1), manager: id(2), miller: id(3), accountant: id(4), keeper: id(5) };

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  for (const [i, user] of Object.values(U).entries()) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [user, phone(i + 1)]);
  }
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة المعمل', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [U.owner])).rows[0].org_id;
  const one = async (user, sql, params = []) => Object.values((await db.asUser(user, (q) => q(sql, params), { commit: true })).rows[0] ?? {})[0];
  const mill = (await db.admin("select id from public.divisions where org_id = $1 and kind = 'feed_mill'", [org])).rows[0].id;
  const general = (await db.admin("select id from public.divisions where org_id = $1 and kind = 'general'", [org])).rows[0].id;
  const wh = async (kind) => (await db.admin('select id from public.warehouses where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const RAW = await wh('raw');
  const FEED = await wh('feed');
  const GENERAL = await wh('general');

  const invite = async (user, n, role, divisions = []) => {
    const member = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[]) as id', [local(phone(n)), role, role, divisions, [], []]);
    await db.acceptInvite(U.owner, user, member);
  };
  await invite(U.manager, 2, 'manager');
  await invite(U.miller, 3, 'mill_operator', [mill]);
  await invite(U.accountant, 4, 'accountant');
  await invite(U.keeper, 5, 'storekeeper');

  /** نداء بمعاملة تثبت إذا نجح: { ok, v } أو { ok: false, code, hint }. */
  const call = async (user, sql, params = []) => {
    try {
      const rows = (await db.asUser(user, (q) => q(sql, params), { commit: true })).rows;
      return { ok: true, v: rows[0] ? Object.values(rows[0])[0] : null, rows };
    } catch (error) {
      return { ok: false, code: error.message, hint: error.hint ?? null };
    }
  };
  const code = (outcome) => (outcome.ok ? 'ok' : outcome.code);
  const verify = async () => (await db.admin('select check_name, violations::int as v from public.verify_mill()')).rows.filter((r) => r.v !== 0);

  await one(U.manager, 'select public.set_division_go_live($1, $2::date - 10)', [mill, TODAY]);
  await one(U.manager, 'select public.set_division_go_live($1, $2::date - 10)', [general, TODAY]);

  // ─── المواد والمورّد ───────────────────────────────────────────────────────────────────────────────────────
  const item = (name, kind, unit, density = null) =>
    one(U.manager, 'insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, $3, $4) returning id', [name, kind, unit, density]);
  const CORN = await item('ذرة صفراء', 'raw', 'kg');
  const SOY = await item('كسبة صويا', 'raw', 'kg');
  const OIL = await item('زيت نباتي', 'raw', 'L', 0.92);
  const SACK = await item('كيس علف', 'packaging', 'pc');
  const DIESEL = await item('كاز', 'fuel', 'L', 0.84);
  const FEED1 = await item('علف بادئ', 'feed', 'kg');
  const FEED2 = await item('علف ناهي', 'feed', 'kg');
  const supplier = await one(U.manager, "insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");

  /** استلام مرحَّل: كمية بوحدة الأساس ومبلغ السطر، فتصير دفعة بسعرها. */
  const receive = async (warehouse, itemId, qty, total) => {
    const doc = await one(U.manager, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [supplier, warehouse]);
    await one(U.manager, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3) returning id', [doc, itemId, qty]);
    await one(U.manager, 'insert into public.receipt_line_amounts (line_id, line_total) select id, $2 from public.receipt_lines where doc_id = $1 returning line_id', [doc, total]);
    const out = await call(U.manager, 'select public.post_receipt($1, (select version from public.receipts where id = $1), $2)', [doc, ref()]);
    if (!out.ok) throw new Error(`استلام فشل: ${out.code} ${out.hint}`);
    return doc;
  };
  await receive(RAW, CORN, 1000, 900000); // 900 للكيلو
  await receive(RAW, SOY, 500, 750000); //  1,500 للكيلو
  await receive(RAW, OIL, 100, 230000); // 2,300 للتر
  await receive(GENERAL, DIESEL, 50, 75000);

  // ─── الخلطة: كتابة مباشرة بفعل recipe.activate ──────────────────────────────────────────────────────────────
  const newRecipe = (user, name, output) => call(user, 'insert into public.recipes (name, output_item_id) values ($1, $2) returning id', [name, output]);
  const R1 = (await newRecipe(U.manager, 'علف بادئ', FEED1)).v;
  t.ok(R1, 'المدير يضيف خلطة');
  t.same(
    [code(await newRecipe(U.miller, 'خلطة المشغّل', FEED1)), code(await newRecipe(U.keeper, 'خلطة الأمين', FEED1)), code(await newRecipe(U.manager, ' علف بادئ ', FEED2))],
    [
      'new row violates row-level security policy for table "recipes"',
      'new row violates row-level security policy for table "recipes"',
      'duplicate key value violates unique constraint "recipes_live_name"',
    ],
    'الخلطة: مشغّل المعمل والأمين ممنوعان، والاسم فريد بين الفعّالة',
  );
  t.eq((await db.admin('select name_norm from public.recipes where id = $1', [R1])).rows[0].name_norm, 'علف بادي', 'الاسم المطبَّع يكتبه الخادم (الهمزة تُطوى)');

  const newVersion = (user, recipe, basis = 1000) => call(user, 'insert into public.recipe_versions (recipe_id, basis_kg) values ($1, $2) returning id', [recipe, basis]);
  const firstVersion = await newVersion(U.manager, R1);
  t.ok(firstVersion.ok, `نسخة مسوّدة: ${firstVersion.code ?? 'ok'} ${firstVersion.hint ?? ''}`);
  const V1 = firstVersion.v;
  t.eq((await db.admin('select version_no from public.recipe_versions where id = $1', [V1])).rows[0].version_no, 1, 'رقم النسخة الأوّل يكتبه الخادم');
  t.eq(code(await newVersion(U.manager, R1)), 'duplicate key value violates unique constraint "recipe_versions_one_draft"', 'مسوّدة واحدة لكلّ خلطة');

  const line = (user, version, itemId, qty, unit = 'kg') =>
    call(user, 'insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, $3, $4) returning id', [version, itemId, qty, unit]);
  const cornLine = (await line(U.manager, V1, CORN, 600)).v;
  await line(U.manager, V1, SOY, 400);
  t.same(
    [
      code(await line(U.manager, V1, CORN, 50)),
      code(await line(U.manager, V1, SACK, 1)),
      code(await line(U.manager, V1, CORN, 50, 'L')),
      code(await line(U.miller, V1, OIL, 1, 'L')),
      code(await line(U.manager, V1, OIL, 0)),
    ],
    ['item_duplicated', 'bad_recipe_unit', 'bad_recipe_unit', 'forbidden', 'new row for relation "recipe_lines" violates check constraint "recipe_lines_qty_check"'],
    'سطر العليقة: مادّة مرّتين، ومادّة بالقطعة، وكيلو مكتوبة لتراً، ومشغّل المعمل، وكمية صفر',
  );
  t.eq((await db.admin('select count(*)::int as n from public.recipe_lines where version_id = $1', [V1])).rows[0].n, 2, 'سطران بالنسخة');

  // ─── التفعيل ──────────────────────────────────────────────────────────────────────────────────────────────
  const activate = (user, version) => call(user, 'select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))', [version]);
  const short = await call(U.manager, 'update public.recipe_lines set qty = 300 where id = $1 returning id', [cornLine]);
  t.ok(short.ok, 'تعديل كمية سطر بمسوّدة');
  const mismatch = await activate(U.manager, V1);
  t.eq(code(mismatch), 'basis_mismatch', 'المجموع 700 والأساس 1,000: basis_mismatch');
  t.ok(/700/u.test(mismatch.hint) && /1000/u.test(mismatch.hint) && /-300/u.test(mismatch.hint), `التلميح يسمّي المجموع والأساس والفرق (${mismatch.hint})`);
  await call(U.manager, 'update public.recipe_lines set qty = 600 where id = $1', [cornLine]);
  t.eq(code(await activate(U.miller, V1)), 'forbidden', 'مشغّل المعمل لا يفعّل');
  const activated = await activate(U.manager, V1);
  t.ok(activated.ok && activated.v.status === 'active' && activated.v.lines === 2, `التفعيل: ${JSON.stringify(activated.v ?? activated.code)}`);
  t.eq(code(await activate(U.manager, V1)), 'not_draft', 'التفعيل مرّتين: not_draft');
  t.same(
    [code(await line(U.manager, V1, OIL, 1)), code(await call(U.manager, 'update public.recipe_lines set qty = 1 where id = $1', [cornLine])),
      code(await call(U.manager, 'select public.delete_draft_line($1, $2, 1)', ['recipe_line', cornLine]))],
    ['not_draft', 'not_draft', 'not_draft'],
    'النسخة المفعَّلة مجمَّدة: لا سطر يُضاف ولا يُعدَّل ولا يُحذف',
  );

  // نسخة ثانية بسائل: 81.6 كغم ذرة + 20 لتراً زيت (20 × 0.92 = 18.4 كغم) = 100 كغم أساساً.
  const V2 = (await newVersion(U.manager, R1, 100)).v;
  await line(U.manager, V2, CORN, 81.6);
  await line(U.manager, V2, OIL, 20, 'L');
  const second = await activate(U.manager, V2);
  t.ok(second.ok && second.v.retired_id === V1, 'تفعيل النسخة الثانية يقاعد الأولى');
  t.same(
    (await db.admin('select status, density_kg_per_l::text as d from public.recipe_versions v join public.recipe_lines l on l.version_id = v.id where v.id = $1 order by l.line_no', [V2])).rows,
    [{ status: 'active', d: null }, { status: 'active', d: '0.9200' }],
    'لقطة الكثافة على سطر السائل وحده لحظة التفعيل',
  );
  await call(U.manager, 'update public.items set density_kg_per_l = 0.8 where id = $1', [OIL]);
  t.eq(
    (await db.admin('select density_kg_per_l::text as d from public.recipe_lines where version_id = $1 and item_id = $2', [V2, OIL])).rows[0].d,
    '0.9200',
    'تغيير كثافة المادّة بعد التفعيل لا يغيّر اللقطة',
  );
  // والكثافة تبقى 0.8 في المادّة: دفعات النسخة الثانية أدناه تُنشأ وتُعايَن وتُرحَّل بلقطة السطر 0.92 (FOUNDATION القاعدة ٤، مراجعة
  // 0016 #3). كان الفحص يعيدها 0.92 قبل الدفعات لأنّ الترحيل كان يقارن اللقطة بكثافة المادّة الحالية فيرفض item_changed.
  t.same(await verify(), [], 'verify_mill صفر بعد الخلطات');

  // ─── دفعة الإنتاج: المخطّط بالقاعدة ١٨ ───────────────────────────────────────────────────────────────────────
  const create = (user, batch, version, kg, whIn = RAW, whOut = FEED, on = null) =>
    call(user, 'select public.create_production($1, $2, $3, $4, $5, coalesce($6::date, public.app_today()))', [batch, version, kg, whIn, whOut, on]);
  const B1 = id(101);
  // النسخة الثانية هي المفعَّلة: 200 كغم ← ذرة 81.6 × 2 = 163.2 كغم، وزيت 18.4 × 2 = 36.8 كغم ÷ 0.92 = 40 لتراً.
  const made = await create(U.miller, B1, V2, 200);
  t.ok(made.ok && made.v.lines === 2, `مشغّل المعمل يسوّد دفعة: ${JSON.stringify(made.v ?? made.code)}`);
  t.same(
    (await db.admin('select i.name, p.base_unit, p.planned_qty_base::text as qty, p.planned_mass_kg::text as mass, p.density_kg_per_l::text as d from public.production_inputs p join public.items i on i.id = p.item_id where p.batch_id = $1 order by p.line_no', [B1])).rows,
    [
      { name: 'ذرة صفراء', base_unit: 'kg', qty: '163.200', mass: '163.200', d: null },
      { name: 'زيت نباتي', base_unit: 'L', qty: '40.000', mass: '36.800', d: '0.9200' },
    ],
    'المخطّط: الذرة 163.2 كغم، والزيت 36.8 كغم = 40 لتراً بالكثافة المحفوظة',
  );
  t.same(
    [code(await create(U.miller, id(102), V1, 100)), code(await create(U.keeper, id(103), V2, 100)),
      code(await create(U.miller, id(104), V2, 0)), code(await create(U.miller, id(105), V2, 100, RAW, RAW)),
      code(await create(U.miller, id(106), V2, 100, RAW, GENERAL)), code(await create(U.miller, B1, V2, 100))],
    ['version_not_active', 'forbidden', 'qty_not_positive', 'same_warehouse', 'item_kind_mismatch',
      'duplicate key value violates unique constraint "production_batches_pkey"'],
    'الإنشاء: نسخة مقاعدة، والأمين، وصفر، ومخزن واحد، ومخزن لا يناسب الناتج، والمعرّف المكرّر',
  );

  // ─── المعاينة ────────────────────────────────────────────────────────────────────────────────────────────
  const preview = (user, batch) => call(user, 'select public.preview_production($1)', [batch]);
  const p1out = await preview(U.manager, B1);
  t.ok(p1out.ok, `المعاينة: ${p1out.code ?? 'ok'} ${p1out.hint ?? ''}`);
  const p1 = p1out.v;
  // الذرة 163.2 × 900 = 146,880، والزيت 40 لتراً × 2,300 = 92,000 ← 238,880. والكتلة 200 كغم والهدر صفر.
  t.same(
    [p1.money.input_value, p1.money.total_value, p1.input_mass_kg, p1.output_qty_kg, p1.shrink_kg, p1.shrink_pct, p1.money.cost_per_kg, p1.can_post],
    ['238880.00', '238880.00', '200.000', '200.000', '0.000', '0.00', '1194.40', true],
    'المعاينة: الكلفة 238,880 والكتلة 200 كغم والهدر صفر وكلفة الكيلو 1,194.40',
  );
  t.same([p1.lines[0].money.value, p1.lines[1].money.value], ['146880.00', '92000.00'], 'قيمة كلّ مدخل من سحبه');
  const millerPreview = (await preview(U.miller, B1)).v;
  t.same(
    [millerPreview.money, millerPreview.lines[0].money, millerPreview.can_post, millerPreview.problems.map((x) => x.code)],
    [undefined, undefined, false, ['costs_pending']],
    'مشغّل المعمل يعاين بلا مال (private.mask)، والمعاينة تقول إنّ الكلف لم تُختم',
  );

  // ─── الترحيل ─────────────────────────────────────────────────────────────────────────────────────────────
  const POST = "select public.post_production($1, (select version from public.production_batches where id = $1), coalesce($2, public.preview_production($1) ->> 'plan_token'), $3)";
  const post = (user, batch, plan = null, r = ref()) => call(user, POST, [batch, plan, r]);
  const blocked = await post(U.miller, B1);
  t.eq(code(blocked), 'forbidden', 'مشغّل المعمل لا يرحّل بلا ختم الكلف');
  t.ok(/يختم المحاسب أو المدير/u.test(blocked.hint ?? ''), `التلميح يقول من يختم (${blocked.hint})`);
  t.eq(code(await call(U.miller, 'select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [B1])), 'forbidden', 'ختم الكلف ليس لمشغّل المعمل');
  const sealed = await call(U.accountant, 'select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [B1]);
  t.ok(sealed.ok && sealed.v.costs_confirmed === true && sealed.v.written === true, 'المحاسب يختم الكلف');
  t.eq((await call(U.accountant, 'select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [B1])).v.written, false, 'ختم ثانٍ: مكتوب من قبل بلا تغيير');
  t.eq(code(await post(U.miller, B1, 'xx')), 'stale_preview', 'بصمة معاينة غير صحيحة: stale_preview');
  const posted = await post(U.miller, B1);
  t.ok(posted.ok, `مشغّل المعمل يرحّل بعد الختم: ${posted.code ?? ''} ${posted.hint ?? ''}`);
  t.same([posted.v.money, posted.v.output_qty_kg, posted.v.shrink_kg], [undefined, '200.000', '0.000'], 'جواب الترحيل لمشغّل المعمل بلا مال');
  const lot = (await db.admin("select l.qty_in::text as q, l.value_in::text as v, l.source_kind, l.received_on::text as on_date, w.kind from public.stock_lots l join public.warehouses w on w.id = l.warehouse_id where l.source_id = $1", [B1])).rows;
  t.same(lot, [{ q: '200.000', v: '238880.00', source_kind: 'production', on_date: TODAY, kind: 'feed' }], 'دفعة الناتج: 200 كغم بقيمة الكلفة بالضبط بمخزن العلف');
  t.same(
    (await db.admin("select i.name, b.qty::text as q, b.value::text as v from public.stock_balances b join public.items i on i.id = b.item_id where b.warehouse_id = $1 and b.qty <> 0 order by i.name", [RAW])).rows,
    [{ name: 'ذرة صفراء', q: '836.800', v: '753120.00' }, { name: 'زيت نباتي', q: '60.000', v: '138000.00' }, { name: 'كسبة صويا', q: '500.000', v: '750000' }],
    'رصيد المواد بعد السحب: ذرة 836.8 وزيت 60 لتراً',
  );
  t.eq((await db.admin("select sum(value)::text as v from public.stock_moves where doc_kind = 'production' and doc_id = $1 and qty < 0", [B1])).rows[0].v, '-238880.00', 'مجموع حركات السحب = الكلفة بالسالب');
  t.same(
    (await db.admin('select input_value::text as i, extra_value::text as e, total_value::text as t from public.production_values where batch_id = $1', [B1])).rows,
    [{ i: '238880.00', e: '0.00', t: '238880.00' }],
    'مال الدفعة: المدخلات = الكلّي، ولا كلف يدوية في هذه النسخة',
  );
  t.eq(code(await post(U.manager, B1)), 'not_draft', 'الترحيل مرّتين: not_draft');
  t.same(await verify(), [], 'verify_mill صفر بعد الترحيل');

  // البيان في دفتر المادّة: الاستهلاك باسم الخلطة، والإنتاج في مخزن العلف.
  const memo = async (itemId, warehouse) => (await db.asUser(U.manager, (q) => q('select public.item_moves_qty($1, $2, null, 10) as v', [itemId, warehouse]))).rows[0].v.rows.map((r) => r.memo);
  t.same(await memo(CORN, RAW), ['شراء من مورّد الحبوب', 'استهلاك في خلطة علف بادئ'], 'بيان حركة الذرة');
  t.same(await memo(FEED1, FEED), ['إنتاج خلطة علف بادئ'], 'بيان حركة العلف المنتَج');

  // ─── الهدر ───────────────────────────────────────────────────────────────────────────────────────────────
  const B2 = id(107);
  await create(U.manager, B2, V2, 200);
  const weigh = (batch, kg, reason = null) =>
    call(U.manager, 'update public.production_batches set output_qty_kg = $2, shrink_reason = $3 where id = $1 returning version', [batch, kg, reason]);
  t.ok((await weigh(B2, 198)).ok, 'وزن الناتج يُكتب في المسوّدة');
  const p2 = (await preview(U.manager, B2)).v;
  t.same([p2.shrink_kg, p2.shrink_pct, p2.shrink_ok, p2.money.cost_per_kg], ['2.000', '1.00', true, '1206.46'], 'هدر 2 كغم = 1٪ داخل المدى، وكلفة الكيلو 238,880 ÷ 198');
  await weigh(B2, 190);
  const p3 = (await preview(U.manager, B2)).v;
  t.same([p3.shrink_pct, p3.shrink_ok, p3.can_post, p3.problems.map((x) => x.code)], ['5.00', false, false, ['shrink_out_of_range']], 'هدر 5٪ خارج المدى: المعاينة تقوله');
  const refused = await post(U.manager, B2);
  t.eq(code(refused), 'shrink_out_of_range', 'الترحيل يرفض الهدر خارج المدى بلا سبب');
  t.ok(/5/u.test(refused.hint ?? ''), `التلميح يسمّي الهدر ونسبته (${refused.hint})`);
  await weigh(B2, 190, 'ميزان القبّان أعيد ضبطه');
  const withReason = await post(U.manager, B2);
  t.ok(withReason.ok && withReason.v.shrink_kg === '10.000', `الهدر بسببه يمرّ: ${withReason.code ?? withReason.v.shrink_kg}`);
  t.eq((await db.admin('select value_in::text as v from public.stock_lots where source_id = $1', [B2])).rows[0].v, '238880.00', 'قيمة الناتج = الكلفة كاملةً ولو نقص الوزن');
  t.same(await verify(), [], 'verify_mill صفر بعد الهدر');

  // ─── النقص ───────────────────────────────────────────────────────────────────────────────────────────────
  const B3 = id(108);
  await create(U.manager, B3, V2, 1000); // يحتاج 816 كغم ذرة والمتبقّي 673.6
  const pShort = (await preview(U.manager, B3)).v;
  t.same([pShort.can_post, pShort.problems.map((x) => x.code), pShort.problems.map((x) => x.item_name)], [false, ['insufficient_stock', 'insufficient_stock'], ['ذرة صفراء', 'زيت نباتي']], 'المعاينة تسمّي كلّ مادّة ناقصة بلا أن ترمي');
  const shortPost = await post(U.manager, B3);
  t.eq(code(shortPost), 'insufficient_stock', 'الترحيل يرفض النقص');
  t.ok(/ذرة صفراء/u.test(shortPost.hint ?? '') && !/900/u.test(shortPost.hint ?? ''), `التلميح بالكمية بلا قيمة (${shortPost.hint})`);
  t.eq((await db.admin('select status from public.production_batches where id = $1', [B3])).rows[0].status, 'draft', 'الدفعة تبقى مسوّدة بعد رفض النقص');
  t.ok((await call(U.manager, 'select public.discard_draft($1, $2, (select version from public.production_batches where id = $2))', ['production', B3])).ok, 'طيّ مسوّدة الدفعة');

  // ─── الإلغاء ─────────────────────────────────────────────────────────────────────────────────────────────
  const cornBefore = (await db.admin('select qty::text as q, value::text as v from public.stock_balances where item_id = $1 and warehouse_id = $2', [CORN, RAW])).rows[0];
  const voided = await call(U.manager, "select public.void_production($1, 'خطأ في الخلطة', $2)", [B1, ref()]);
  t.ok(voided.ok && voided.v.status === 'void', `الإلغاء: ${voided.code ?? voided.v.status}`);
  t.same([cornBefore.q, cornBefore.v], ['673.600', '606240.00'], 'قبل الإلغاء: الذرة 673.6 بعد دفعتين');
  t.same(
    (await db.admin('select qty::text as q, value::text as v from public.stock_balances where item_id = $1 and warehouse_id = $2', [CORN, RAW])).rows[0],
    { q: '836.800', v: '753120.00' },
    'المواد ترجع بكميتها وقيمتها (163.2 كغم بـ146,880)',
  );
  t.eq((await db.admin('select qty_left::text as q from public.stock_lots where source_id = $1', [B1])).rows[0].q, '0.000', 'دفعة الناتج صارت صفراً');
  t.eq(code(await call(U.manager, "select public.void_production($1, 'مرّتين', $2)", [B1, ref()])), 'already_void', 'الإلغاء مرّتين: already_void');
  t.same(await verify(), [], 'verify_mill صفر بعد الإلغاء');

  // دفعة ناتج انسحب منها شيء: الإلغاء يرفض ويسمّي المستند.
  const useDoc = await one(U.manager, 'insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, public.app_today()) returning id',
    [FEED, await one(U.manager, "insert into public.expense_categories (name) values ('علف الحقل') returning id")]);
  await one(U.manager, 'insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10) returning id', [useDoc, FEED1]);
  const usePosted = await call(U.manager, "select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', $2)", [useDoc, ref()]);
  t.ok(usePosted.ok, `صرف من العلف المنتَج: ${usePosted.code ?? 'ok'}`);
  const blockedVoid = await call(U.manager, "select public.void_production($1, 'بعد السحب', $2)", [B2, ref()]);
  t.eq(code(blockedVoid), 'lot_consumed', 'إلغاء دفعة انسحب من ناتجها: lot_consumed');
  t.same(await verify(), [], 'verify_mill صفر بالنهاية');

  // ─── القرّاء ─────────────────────────────────────────────────────────────────────────────────────────────
  const overview = (await db.asUser(U.manager, (q) => q('select public.recipes_overview() as v'))).rows[0].v;
  t.same(
    [overview.recipes.length, overview.recipes[0].name, overview.recipes[0].active.version_no, overview.recipes[0].batches, overview.recipes[0].output_item.name],
    [1, 'علف بادئ', 2, 1, 'علف بادئ'],
    'لوحة المعمل: خلطة واحدة بنسختها المفعَّلة ودفعة مرحَّلة واحدة',
  );
  t.same(
    [overview.stores.map((x) => x.kind), overview.feed_items.map((x) => x.name)],
    [['feed', 'raw'], ['علف بادئ', 'علف ناهي']],
    'اللوحة تكفي الشاشة: مخزنا المعمل في النطاق، ومواد العلف لإنشاء خلطة',
  );
  t.same(
    overview.recipes[0].active.pieces.map((x) => [x.item_name, x.mass_kg]),
    [['ذرة صفراء', '81.600'], ['زيت نباتي', '18.400']],
    'مواد النسخة المفعَّلة بكتلتها من الأكبر (شريط التركيبة)',
  );
  const millerOverview = (await db.asUser(U.miller, (q) => q('select public.recipes_overview() as v'))).rows[0].v;
  t.eq(millerOverview.recipes[0].last_batch.money, undefined, 'مشغّل المعمل يرى الدفعة بلا كلفتها');
  const detail = (await db.asUser(U.manager, (q) => q('select public.recipe_detail($1, null) as v', [R1]))).rows[0].v;
  t.same(
    [detail.selected.version_no, detail.lines.length, detail.lines[0].mass_kg, detail.lines[1].mass_kg, detail.mass_kg, detail.lines[0].share_pct],
    [2, 2, '81.600', '18.400', '100.000', '81.60'],
    'بطاقة الخلطة: الكتلة وحصّة كلّ مادّة من الأساس',
  );
  t.same(
    detail.pick_items.map((x) => x.name),
    ['ذرة صفراء', 'زيت نباتي', 'كاز', 'كسبة صويا'],
    'مرشَّحات سطر الخلطة: ما يستلمه مخزن المواد الأوّلية ويُقاس بالكيلو أو اللتر (لا الكيس بالقطعة ولا العلف)',
  );
  const batch = (await db.asUser(U.manager, (q) => q('select public.production_detail($1) as v', [B2]))).rows[0].v;
  t.same(
    [batch.status, batch.money.total_value, batch.lines.length, batch.lines[0].used_qty, batch.shrink_pct],
    ['posted', '238880.00', 2, '163.200', '5.00'],
    'بطاقة الدفعة: المسحوب الفعلي من الحركات',
  );
  const list = (await db.asUser(U.manager, (q) => q('select public.productions_overview(null, 30) as v'))).rows[0].v;
  t.same([list.rows.length, list.total, list.drafts.length], [2, 1, 0], 'قائمة الدفعات: مرحَّلة وملغاة بعد ترحيلها، والمسوّدة المطويّة ليست مستنداً');

  // ─── الدمج: جواب القاعدة الحقيقي بمحلّل الشاشات الحقيقي ────────────────────────────────────────────────────
  const ui = await screensParser();
  const cards = ui.parseRecipes(overview);
  t.same(
    [cards.length, cards[0].name, cards[0].activeLines, cards[0].batches, cards[0].lastCostPerKg],
    [1, 'علف بادئ', 2, 1, 125726n],
    'parseRecipes: كلفة الكيلو بالفلس للشاشة (1,194.40 دينار)',
  );
  const card = ui.parseRecipe(detail);
  t.same([card.lines.length, card.lines[0].massKg, card.massKg, card.basisKg], [2, 81600n, 100000n, 100000n], 'parseRecipe: الكتل بالآلاف');
  const prev = ui.parsePreview((await preview(U.manager, B2)).v);
  t.same([prev.canPost, prev.lines.length], [false, 2], 'parsePreview: الدفعة المرحَّلة لا تُرحَّل ثانية');
  const parsedBatch = ui.parseBatch(batch);
  t.same([parsedBatch.status, parsedBatch.outputQtyKg, parsedBatch.totalValue, parsedBatch.costPerKg], ['posted', 190000n, 23888000n, 125726n], 'parseBatch: الكمية بالآلاف والمال بالفلس');
}
