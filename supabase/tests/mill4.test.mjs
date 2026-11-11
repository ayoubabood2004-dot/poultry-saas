// «الخلطة موادّ، والكميات عند الإنتاج» (0025؛ كلمة المالك 2026-11-10 وأجوبته: كميات شاشة الإنتاج من آخر إنتاج، و«مخزن العلف» يصير «رصيد العلف»
// بلا اختيار مخزن للناتج، وبترتيب العلائق): الخلطة بالموادّ وحدها (create_recipe وnew_recipe_version والتفعيل بلا كميات ولا أساس، والخلط مرفوض)،
// والخلطة القديمة بكمياتها كما كانت (والإنتاج بها عبر record_production)، وcreate_production يرفض الخلطة بلا كميات، والإنتاج بنداء واحد بالكميات
// المكتوبة (produce_batch: المخطّط = المكتوب، والناتج «رصيد العلف»، وتغيير الموادّ يحتاج اختياراً «عدّل الخلطة» أو «لهذه المرّة فقط»، والمرجع
// والمسوّدة وانتظار ختم الكلف والرفض كلّه)، وقارئا شاشة الإنتاج (production_form) والسجلّ (recipe_history)، ولوحة المعمل وبطاقة الخلطة بلا رمية،
// والاسم الجديد وبذرته، وفحص verify_mill الجديد بطفرة حقيقية، وطريق رفض التراجع؛ وعيّنات حقيقية للشاشات (MILL4_SAMPLES_OUT).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = readFileSync(path.join(ROOT, 'supabase', 'migrations', '0025_mill_materials_only.sql'), 'utf8');
const ROLLBACK = readFileSync(path.join(ROOT, 'supabase', 'migrations', 'rollback_0025.sql'), 'utf8');
const SAMPLES_DEFAULT = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'mill4-0025.json');

const TODAY = '2026-11-11';
const id = (n) => `d2550000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477992550${String(n).padStart(2, '0')}`;
const day = (offset, from = TODAY) => new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
/** نصّ عشريّ بلا أصفار زائدة (600.000 ← 600). */
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};

const PB = 'select public.produce_batch($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13) as v';
const FORM = 'select public.production_form($1) as v';
const HISTORY = 'select public.recipe_history($1, $2, $3) as v';
const OVERVIEW = 'select public.recipes_overview() as v';
const DETAIL = 'select public.recipe_detail($1, $2) as v';
const CR = 'select public.create_recipe($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8) as v';
const ACTIVATE = 'select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1)) as v';
const RP = 'select public.record_production($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13) as v';
const FN = {
  produce: 'public.produce_batch(uuid, uuid, uuid, uuid, jsonb, boolean, boolean, date, numeric, date, text, text, uuid)',
  form: 'public.production_form(uuid)',
  activate: 'public.activate_recipe_version(uuid, integer)',
  verify: 'public.verify_mill()',
  createProduction: 'public.create_production(uuid, uuid, numeric, uuid, uuid, date)',
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const section = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${label}: رمى ${error.stack ?? error.message}`);
    }
  };
  const G = await makeOrg(db, {
    name: 'معمل الموادّ وحدها',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['accountant', 'accountant'],
      ['viewer', 'viewer', ['feed_mill']],
      ['keeperGeneral', 'storekeeper', ['general']],
      ['storekeeper', 'storekeeper', ['feed_mill']],
    ],
  });
  const { users: U, org, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const code = (result) => (result.ok ? 'ok' : result.code);
  const refusal = (result) => (result.ok ? ['ok'] : [result.code, result.hint]);
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const millSite = (await db.admin("select s.id from public.sites s join public.divisions d on d.id = s.division_id where s.org_id = $1 and d.kind = 'feed_mill'", [org])).rows[0].id;
  const item = (name, kind, unit, density = null) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, $3, $4) returning id', [name, kind, unit, density]);
  const I = {
    corn: await item('ذرة', 'raw', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    oil: await item('زيت', 'raw', 'L', '0.92'),
    premix: await item('برمكس', 'additive', 'kg'),
    salt: await item('ملح', 'raw', 'kg'),
    kaz: await item('كاز المعمل', 'fuel', 'L', '0.85'),
    twine: await item('خيط التعبئة', 'packaging', 'kg'),
    sack: await item('كيس', 'packaging', 'pc'),
    syrup: await item('دبس بلا كثافة', 'raw', 'L'),
    light: await item('سائل خفيف', 'raw', 'L', '0.4'),
    starter: await item('علف بادئ', 'feed', 'kg'),
    finisher: await item('علف ناهٍ', 'feed', 'kg'),
    grower: await item('علف نامٍ', 'feed', 'kg'),
    breeder: await item('علف أمّهات', 'feed', 'kg'),
    spare: await item('علف تجربة', 'feed', 'kg'),
  };
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد المعمل', true) returning id");
  const buy = (itemId, qty, price, on = TODAY, warehouse = null) =>
    one(U.owner, "select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, null, 'credit', null, $9) as v", [uid(), uid(), uid(), itemId, supplier, on, qty, price, warehouse]);
  const labor = await one(U.owner, "insert into public.expense_categories (name) values ('أجور المعمل') returning id");
  const samples = { production_form: {}, produce_batch: {}, recipe_history: {}, recipes_overview: {}, recipe_detail: {}, refusals: {} };
  const keep = (name, result) => {
    samples.refusals[name] = { code: result.code, hint: result.hint };
    return result;
  };

  // ── ١) المخطّط: الكمية والأساس يقبلان الفراغ بقيدهما، والأساس بافتراضه، وsaved_to_recipe غير ممنوح ─────────────────────────────
  await section('المخطّط', async () => {
    const cols = Object.fromEntries((await db.admin(`select table_name || '.' || column_name as k, is_nullable, column_default, data_type from information_schema.columns
      where table_schema = 'public' and ((table_name = 'recipe_lines' and column_name = 'qty') or (table_name = 'recipe_versions' and column_name = 'basis_kg')
        or (table_name = 'production_batches' and column_name = 'saved_to_recipe'))`)).rows.map((r) => [r.k, [r.is_nullable, r.column_default, r.data_type]]));
    t.same([cols['recipe_lines.qty'], cols['recipe_versions.basis_kg'], cols['production_batches.saved_to_recipe']],
      [['YES', null, 'numeric'], ['YES', '1000', 'numeric'], ['NO', 'false', 'boolean']],
      'qty وbasis_kg يقبلان الفراغ (والأساس بافتراضه 1000)، وsaved_to_recipe منطقيّ غير فارغ افتراضه false');
    const grants = (await db.admin(`select has_column_privilege('authenticated', 'public.production_batches', 'saved_to_recipe', 'INSERT') as i,
      has_column_privilege('authenticated', 'public.production_batches', 'saved_to_recipe', 'UPDATE') as u,
      has_column_privilege('authenticated', 'public.production_batches', 'saved_to_recipe', 'SELECT') as s`)).rows[0];
    t.same(grants, { i: false, u: false, s: true }, 'saved_to_recipe يُقرأ ولا يُكتب من الشاشة (لا منح إدراج ولا تعديل)');
    const recipeRow = await one(U.owner, "insert into public.recipes (name, output_item_id) values ('خلطة المخطّط', $1) returning id", [I.spare]);
    const probe = async (sql, params) => {
      const r = await call(db, U.owner, sql, params, { commit: false });
      return r.ok ? r.value : r.code;
    };
    t.same([
      await probe('insert into public.recipe_versions (recipe_id) values ($1) returning basis_kg::text', [recipeRow]),
      await probe('insert into public.recipe_versions (recipe_id, basis_kg) values ($1, null) returning coalesce(basis_kg::text, \'فارغ\')', [recipeRow]),
      await probe('insert into public.recipe_versions (recipe_id, basis_kg) values ($1, 0) returning basis_kg', [recipeRow]),
      await probe('insert into public.recipe_versions (recipe_id, basis_kg) values ($1, 10.0005) returning basis_kg', [recipeRow]),
    ], ['1000', 'فارغ', 'check:recipe_versions_basis_check', 'check:recipe_versions_basis_check'],
    'الأساس: افتراضه 1000 للإدراج القديم، والفارغ يُقبل، والصفر وأربع مراتب يرفضهما قيده');
    const probeVersion = await one(U.owner, 'insert into public.recipe_versions (recipe_id, basis_kg) values ($1, null) returning id', [recipeRow]);
    const lineProbe = (qty, unit) => probe("insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, $3, $4) returning coalesce(qty::text, 'فارغ') || '/' || unit",
      [probeVersion, I.oil, qty, unit]);
    t.same([await lineProbe(null, 'kg'), await lineProbe(0, 'L'), await lineProbe('1.0005', 'L'), await lineProbe('5', 'L')],
      ['فارغ/L', 'check:recipe_lines_qty_check', 'check:recipe_lines_qty_check', '5.000/L'],
      'سطر الخلطة: بلا كمية يُقبل ووحدته وحدة أساس المادّة (اللتر للزيت ولو أُرسل كيلوغراماً)، والصفر وأربع مراتب يرفضهما قيده، والكمية الصحيحة كما كانت');
    await one(U.owner, 'update public.recipes set archived_at = now() where id = $1 returning id', [recipeRow]);
  });

  // ── ٢) البانية والحارس والتفعيل ──────────────────────────────────────────────────────────────────────────────────
  const R = {};
  const lines = async (versionId) => (await db.admin(`select l.line_no, l.item_id, l.qty::text as qty, l.unit, l.base_unit, l.in_basis, l.density_kg_per_l::text as d
    from public.recipe_lines l where l.version_id = $1 order by l.line_no`, [versionId])).rows;
  const versionRow = async (versionId) => (await db.admin('select status, basis_kg::text as basis, version_no from public.recipe_versions where id = $1', [versionId])).rows[0];
  const createRecipe = (user, ids, name, output, basis, recipeLines, rates = [], activate = true) =>
    call(db, user, CR, [ids.id, ids.version, name, output, basis, JSON.stringify(recipeLines), JSON.stringify(rates), activate]);
  await section('البانية', async () => {
    R.starter = { id: id(101), version: id(102) };
    const bare = await createRecipe(U.manager, R.starter, 'علف بادئ', I.starter, null, [{ item_id: I.corn }, { item_id: I.soy }, { item_id: I.oil }]);
    samples.create_recipe = bare.value;
    t.same(bare.ok ? [bare.value.status, bare.value.lines, bare.value.rates] : refusal(bare), ['active', 3, 0],
      'create_recipe بلا أساس ولا كميات: خلطة بالموادّ وحدها، مفعَّلة بثلاث موادّ');
    t.same([await versionRow(R.starter.version), (await lines(R.starter.version)).map((l) => [l.line_no, l.item_id, l.qty, l.unit, l.base_unit, l.in_basis, l.d])],
      [{ status: 'active', basis: null, version_no: 1 },
        [[1, I.corn, null, 'kg', 'kg', true, null], [2, I.soy, null, 'kg', 'kg', true, null], [3, I.oil, null, 'L', 'L', true, '0.9200']]],
      'النسخة المفعَّلة بلا أساس، وسطورها بلا كمية بوحدة أساس كلّ مادّة، ولقطات التفعيل (داخل الكتلة، ووحدة الأساس، وكثافة الزيت 0.9200)');
    const again = await createRecipe(U.manager, R.starter, 'علف بادئ', I.starter, null, [{ item_id: I.corn }, { item_id: I.soy }, { item_id: I.oil, qty: null }]);
    const other = await createRecipe(U.manager, R.starter, 'علف بادئ', I.starter, 1000, [{ item_id: I.corn, qty: 600 }, { item_id: I.soy, qty: 354 }, { item_id: I.oil, qty: 50, unit: 'L' }]);
    t.same([again.ok && JSON.stringify(again.value) === JSON.stringify(bare.value), code(other)], [true, 'id_conflict'],
      'الإعادة بالمعرّفين والموادّ نفسها (الكمية الفارغة قيمةً) ترجّع الجواب نفسه، وبكميات وأساس: id_conflict');
    const mixed = keep('mixed_quantities_create', await createRecipe(U.manager, { id: uid(), version: uid() }, 'خلطة مختلطة', I.spare, null,
      [{ item_id: I.corn, qty: 500 }, { item_id: I.soy }]));
    const noBasis = keep('bad_basis_create', await createRecipe(U.manager, { id: uid(), version: uid() }, 'خلطة بكميات بلا أساس', I.spare, null,
      [{ item_id: I.corn, qty: 1000 }]));
    t.same([refusal(mixed), refusal(noBasis)], [
      ['mixed_quantities', 'في الخلطة موادّ بكميات وموادّ بلا كميات: احذف الكميات كلّها، أو اكتب كمية كلّ مادّة وأساس الخلطة.'],
      ['bad_basis', 'الخلطة بكميات تحتاج أساساً بالكيلوغرام: اكتبه، أو احذف الكميات كلّها لتكون خلطة بالموادّ وحدها.'],
    ], 'create_recipe: موادّ بكميات وموادّ بلا كميات ← mixed_quantities؛ وبكميات بلا أساس ← bad_basis (كان الأساس 1000 بصمت)');
    t.same([
      refusal(await createRecipe(U.manager, { id: uid(), version: uid() }, 'خلطة بكيس', I.spare, null, [{ item_id: I.corn }, { item_id: I.sack }])),
      refusal(keep('density_required_activate', await createRecipe(U.manager, { id: uid(), version: uid() }, 'خلطة بدبس', I.spare, null, [{ item_id: I.corn }, { item_id: I.syrup }]))),
      refusal(keep('no_mass_inputs_activate', await createRecipe(U.manager, { id: uid(), version: uid() }, 'خلطة وقود', I.spare, null, [{ item_id: I.kaz }, { item_id: I.twine }]))),
      refusal(await createRecipe(U.manager, { id: uid(), version: uid() }, 'خلطة فارغة', I.spare, null, [])),
    ], [
      ['bad_recipe_unit', '«كيس» وحدتها قطعة، والعليقة تُحسب بالكتلة: لا تدخل في الخلطة بهذه النسخة.'],
      ['density_required', '«دبس بلا كثافة» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ فعّل.'],
      ['no_mass_inputs', 'أضف مادّة داخل كتلة الخلطة؛ الوقود والتعبئة خارجها.'],
      ['doc_empty', 'الخلطة بلا مواد. أضف مادّة واحدة على الأقلّ قبل التفعيل.'],
    ], 'الخلطة بالموادّ: المادّة بالقطعة يرفضها الحارس، والسائل بلا كثافة يرفضه التفعيل، والوقود والتعبئة وحدهما no_mass_inputs، وبلا موادّ doc_empty');
    const syrupDraft = await createRecipe(U.manager, { id: uid(), version: uid() }, 'مسوّدة بدبس', I.spare, null, [{ item_id: I.corn }, { item_id: I.syrup }], [], false);
    t.same(syrupDraft.ok ? syrupDraft.value.status : refusal(syrupDraft), 'draft', 'المسوّدة بالموادّ تقبل السائل بلا كثافة (الكثافة يطلبها التفعيل)');
    // الخلطة القديمة بكمياتها كما كانت: ناهٍ ذرة 700 + صويا 281.6 + زيت 18.4 كغم (لتر بالكثافة) لأساس 1,000، وأمّهات بكميات ثمّ مجموع خاطئ.
    R.finisher = { id: id(111), version: id(112) };
    const legacy = await createRecipe(U.manager, R.finisher, 'علف ناهٍ', I.finisher, '1000.000',
      [{ item_id: I.corn, qty: '700.000', unit: 'kg' }, { item_id: I.soy, qty: '281.600', unit: 'kg' }, { item_id: I.oil, qty: '18.400', unit: 'kg' }],
      [{ category_id: labor, amount_per_ton: 5000 }]);
    R.breeder = { id: id(121), version: id(122) };
    const breeder = await createRecipe(U.manager, R.breeder, 'علف أمّهات', I.breeder, '1000.000',
      [{ item_id: I.corn, qty: '500.000', unit: 'kg' }, { item_id: I.soy, qty: '500.000', unit: 'kg' }]);
    const wrongSum = await createRecipe(U.manager, { id: uid(), version: uid() }, 'خلطة بمجموع خاطئ', I.spare, '1000.000', [{ item_id: I.corn, qty: '990.000', unit: 'kg' }]);
    t.same([legacy.ok && legacy.value.status, breeder.ok && breeder.value.status, (await versionRow(R.finisher.version)).basis, code(wrongSum),
      (await lines(R.finisher.version)).map((l) => [l.qty, l.unit])],
    ['active', 'active', '1000.000', 'basis_mismatch', [['700.000', 'kg'], ['281.600', 'kg'], ['18.400', 'kg']]],
    'الخلطة بكميات كما كانت: أساسها وكمياتها، والمجموع الخاطئ basis_mismatch');
    // مسوّدتان بالكتابة المباشرة (الشاشة القديمة): مختلطة، وبكميات بلا أساس — التفعيل يرفض الأولى mixed_quantities والثانية bad_basis.
    let drafts = 0;
    const directDraft = async (basis, draftLines) => {
      drafts += 1;
      const recipeId = await one(U.manager, 'insert into public.recipes (name, output_item_id) values ($1, $2) returning id', [`مسوّدة مباشرة ${drafts}`, I.spare]);
      const versionId = await one(U.manager, 'insert into public.recipe_versions (recipe_id, basis_kg) values ($1, $2) returning id', [recipeId, basis]);
      for (const [itemId, qty] of draftLines) await one(U.manager, "insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, $3, 'kg') returning id", [versionId, itemId, qty]);
      return versionId;
    };
    const mixedDraft = await directDraft('1000', [[I.corn, 500], [I.soy, null]]);
    const nullBasisDraft = await directDraft(null, [[I.corn, 1000]]);
    const bareWithBasis = await directDraft('1000', [[I.corn, null], [I.soy, null]]);
    const mixedOut = keep('mixed_quantities_activate', await call(db, U.manager, ACTIVATE, [mixedDraft]));
    const basisOut = keep('bad_basis_activate', await call(db, U.manager, ACTIVATE, [nullBasisDraft]));
    const bareOut = await call(db, U.manager, ACTIVATE, [bareWithBasis]);
    t.same([refusal(mixedOut), refusal(basisOut), bareOut.ok ? [bareOut.value.status, bareOut.value.basis_kg ?? null] : refusal(bareOut), (await versionRow(bareWithBasis)).basis], [
      ['mixed_quantities', 'في هذه النسخة موادّ بكميات وموادّ بلا كميات: احذف الكميات كلّها.'],
      ['bad_basis', 'النسخة بكميات وبلا أساس (مجموع موادّها 1,000 كغم): اكتب أساسها بالكيلوغرام، أو احذف الكميات كلّها.'],
      ['active', null], null,
    ], 'التفعيل: مختلطة ← mixed_quantities، وبكميات بلا أساس ← bad_basis، وبلا كميات بأساس مكتوب (إدراج قديم بافتراضه) ← تُفعَّل وأساسها فارغ');
    // حارس السطر: سطر بلا كمية لسائل بلا كثافة يُقبل في المسوّدة، وسطر بكمية له يُرفض كما كان (density_required).
    const guardDraft = await directDraft('1000', []);
    const bareSyrup = await call(db, U.manager, "insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, null, 'kg') returning unit", [guardDraft, I.syrup]);
    const qtySyrup = await call(db, U.manager, "insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 5, 'L') returning unit", [guardDraft, I.syrup], { commit: false });
    t.same([bareSyrup.ok ? bareSyrup.value : refusal(bareSyrup), code(qtySyrup)], ['L', 'density_required'],
      'حارس السطر: بلا كمية يُقبل ووحدته لتر من المادّة، وبكمية لسائل بلا كثافة density_required كما كان');
  });

  // ── ٣) «عدّل الخلطة»: النسخة الجديدة بالموادّ وحدها دائماً ─────────────────────────────────────────────────────────
  await section('نسخة جديدة', async () => {
    R.grower = { id: id(131), version: id(132) };
    await one(U.manager, CR, [R.grower.id, R.grower.version, 'علف نامٍ', I.grower, '1000.000',
      JSON.stringify([{ item_id: I.corn, qty: '600', unit: 'kg' }, { item_id: I.soy, qty: '346', unit: 'kg' }, { item_id: I.oil, qty: '50', unit: 'L' },
        { item_id: I.salt, qty: '8', unit: 'kg' }]),
      JSON.stringify([{ category_id: labor, amount_per_ton: '4000' }]), true]);
    // الملح يصير قطعة (بلا حركة بعد): لا يُنسخ ويُسمّى في skipped كما كان.
    await one(U.owner, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1 returning id", [I.salt]);
    const copy = await one(U.manager, 'select public.new_recipe_version($1, $2) as v', [R.grower.id, id(133)]);
    t.same([copy.status, copy.lines, copy.rates, copy.skipped, (await versionRow(id(133))).basis, (await lines(id(133))).map((l) => [l.item_id, l.qty, l.unit])],
      ['draft', 3, 1, ['ملح'], null, [[I.corn, null, 'kg'], [I.soy, null, 'kg'], [I.oil, null, 'L']]],
      'new_recipe_version من خلطة بكميات: مسوّدة بالموادّ وحدها (بلا كمية، ووحدة كلّ سطر وحدة أساس المادّة، والأساس فارغ)، والمعدّل منسوخ، والملح الذي صار قطعة متروك ومسمّى');
    const detail = await one(U.manager, DETAIL, [R.grower.id, id(133)]);
    samples.recipe_detail.materials_only_draft = detail;
    t.same([detail.selected.materials_only, detail.selected.basis_kg, detail.mass_kg, detail.money.expected, detail.lines.map((l) => [l.qty, l.mass_kg, l.share_pct]),
      detail.versions.map((v) => [v.version_no, v.status, v.materials_only])],
    [true, null, null, null, [[null, null, null], [null, null, null], [null, null, null]], [[2, 'draft', true], [1, 'active', false]]],
    'recipe_detail للمسوّدة بالموادّ: materials_only، والأساس والكتلة والكلفة المتوقّعة فارغة، وكمية كلّ سطر وكتلته وحصّته فارغة، والنسخ بعلمها');
    t.same(code(await call(db, U.millOperator, 'select public.new_recipe_version($1, $2) as v', [R.grower.id, uid()])), 'forbidden', 'new_recipe_version لمن يفعّل الخلطة وحده');
    const activated = await one(U.manager, ACTIVATE, [id(133)]);
    t.same([activated.status, activated.basis_kg ?? null, (await versionRow(R.grower.version)).status, (await versionRow(id(133))).basis,
      (await lines(id(133))).map((l) => [l.base_unit, l.in_basis, l.d])],
    ['active', null, 'retired', null, [['kg', true, null], ['kg', true, null], ['L', true, '0.9200']]],
    'تفعيل المسوّدة بالموادّ: الأساس فارغ، والقديمة مقاعدة، ولقطات السطور');
    R.grower.version = id(133);
    const active = await one(U.manager, DETAIL, [R.grower.id, null]);
    samples.recipe_detail.materials_only_active = active;
    t.same([active.selected.id, active.selected.materials_only, active.money.rates.length, active.money.expected],
      [id(133), true, 1, null], 'بطاقة الخلطة المفعَّلة بالموادّ: معدّل التكاليف منسوخ، ولا كلفة متوقّعة');
  });

  // المخزون (مخزن المواد الأوّلية): الحبوب بالشراء، والكاز والخيط برصيد افتتاحيّ في مخزن المواد (الشراء يستلمهما في المخزن العامّ لنوعهما).
  await buy(I.corn, 20000, 450, day(-7));
  await buy(I.soy, 10000, 900, day(-7));
  await buy(I.oil, 1000, 2000, day(-7));
  await buy(I.premix, 500, 3000, day(-7));
  const opening = await one(U.owner, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, $2) returning id', [W.raw, day(-7)]);
  await one(U.owner, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 200, 300000) returning id', [opening, I.kaz]);
  await one(U.owner, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 50, 50000) returning id', [opening, I.twine]);
  await one(U.owner, 'select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2) as v', [opening, uid()]);
  const stock = async (itemId, wh = W.raw) => norm((await db.admin('select coalesce(sum(qty), 0)::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [itemId, wh])).rows[0].q);
  const STARTER_LINES = () => JSON.stringify([{ item_id: I.corn, qty: '10' }, { item_id: I.soy, qty: '5' }, { item_id: I.oil, qty: '1' }]);

  // ── مخزن الناتج («رصيد العلف» = أقدم مخزن علف حيّ في المعمل) قبل أيّ إنتاج إليه (مخزن فيه رصيد لا يُؤرشف) ─────────────────────────
  await section('مخزن الناتج', async () => {
    // بلا مخزن علف حيّ في المعمل (بمعاملة ترجع): feed_store_missing، وشاشة الإنتاج بلا مخزن ناتج.
    const missing = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await oq("update public.warehouses set archived_at = now() where org_id = $1 and kind = 'feed'", [org]);
      const pb = await attempt(U.owner, async (q) => (await q(PB, [uid(), R.starter.id, R.starter.version, W.raw, STARTER_LINES(), null, false, TODAY, null, null, null, null, uid()])).rows[0].v);
      const form = await attempt(U.owner, async (q) => (await q(FORM, [R.starter.id])).rows[0].v);
      return [pb.ok ? 'ok' : [pb.code, pb.hint], form.ok ? form.value.output_store : form.code];
    });
    samples.refusals.feed_store_missing = { code: missing[0][0], hint: missing[0][1] };
    t.same(missing, [['feed_store_missing', 'لا يوجد «رصيد العلف» في المعمل: أضفه من إعداد المخزن.'], null],
      'بلا مخزن علف حيّ في المعمل: feed_store_missing بتلميحه، وproduction_form بلا output_store');
    // علف ثانٍ أحدث لا يغيّر مخزن الناتج، وأرشفة الأوّل تجعل الثاني مخزن الناتج والدفعة تدخله.
    const chosen = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const second = (await oq("insert into public.warehouses (org_id, division_id, site_id, name, kind) values ($1, $2, $3, 'علف ثانٍ', 'feed') returning id", [org, D.feed_mill, millSite])).rows[0].id;
      const read = async () => {
        const out = await attempt(U.owner, async (q) => (await q(FORM, [R.starter.id])).rows[0].v.output_store);
        return out.ok ? out.value?.name ?? null : out.code;
      };
      const first = await read();
      await oq('update public.warehouses set archived_at = now() where id = $1', [W.feed]);
      const afterArchive = await read();
      const pb = await attempt(U.owner, async (q) => (await q(PB, [uid(), R.starter.id, R.starter.version, W.raw, STARTER_LINES(), null, false, TODAY, null, null, null, null, uid()])).rows[0].v);
      const lotWh = pb.ok ? (await oq('select l.warehouse_id from public.production_batches b join public.stock_lots l on l.id = b.output_lot_id where b.id = $1', [pb.value.id])).rows[0].warehouse_id : pb.code;
      return [first, afterArchive, lotWh === second ? 'الثاني' : lotWh];
    });
    t.same(chosen, ['رصيد العلف', 'علف ثانٍ', 'الثاني'], 'مخزن الناتج أقدم مخزن علف حيّ في المعمل، وبأرشفته يصير الذي بعده وتدخله الدفعة');
  });

  // ── ٤) create_production وrecord_production: الخلطة بلا كميات ترفض، والقديمة تعمل ─────────────────────────────────────
  await section('الطريق القديم', async () => {
    const created = keep('quantities_required', await call(db, U.owner, 'select public.create_production($1, $2, 1000, $3, $4, public.app_today()) as v', [uid(), R.starter.version, W.raw, W.feed]));
    const recorded = await call(db, U.owner, RP, [uid(), R.starter.version, '1000', W.raw, W.feed, TODAY, '[]', '[]', null, null, null, null, uid()]);
    t.same([refusal(created), refusal(recorded)], [
      ['quantities_required', 'هذه الخلطة بلا كميات؛ أنتج من شاشة الإنتاج واكتب الكميات فيها.'],
      ['quantities_required', 'هذه الخلطة بلا كميات؛ أنتج من شاشة الإنتاج واكتب الكميات فيها.'],
    ], 'create_production وrecord_production يرفضان الخلطة بلا كميات (quantities_required) بتلميحها');
    const legacy = await call(db, U.owner, RP, [id(141), R.breeder.version, '1000', W.raw, W.feed, day(-3), '[]', '[]', null, null, null, null, uid()]);
    t.same(legacy.ok ? [legacy.value.status, norm(legacy.value.output_qty_kg), legacy.value.output_warehouse_name] : refusal(legacy), ['posted', '1000', 'رصيد العلف'],
      'الخلطة بكميات تُنتج بـrecord_production كما كانت، وناتجها في «رصيد العلف»');
  });

  // ── ٥) produce_batch ─────────────────────────────────────────────────────────────────────────────────────────────
  const produce = (user, over = {}) => {
    const a = { id: uid(), recipe: R.starter.id, version: R.starter.version, in: W.raw, lines: [], save: null, draft: false, on: TODAY, output: null,
      expiry: null, reason: null, note: null, ref: uid(), ...over };
    const args = [a.id, a.recipe, a.version, a.in, a.lines === undefined ? null : JSON.stringify(a.lines), a.save, a.draft, a.on, a.output, a.expiry, a.reason, a.note, a.ref];
    if (a.lines === null) args[4] = null;
    return { a, run: () => call(db, user, PB, args) };
  };
  const inputs = async (batchId) => (await db.admin(`select line_no, item_id, trim_scale(planned_qty_base)::text as q, trim_scale(planned_mass_kg)::text as m,
    actual_qty_base, in_basis, base_unit, density_kg_per_l::text as d from public.production_inputs where batch_id = $1 order by line_no`, [batchId])).rows
    .map((r) => [r.line_no, r.item_id, r.q, r.m, r.actual_qty_base, r.in_basis, r.base_unit, r.d]);
  const batchRow = async (batchId) => (await db.admin(`select b.status, b.doc_no, trim_scale(b.planned_kg)::text as planned, b.recipe_version_id, b.output_warehouse_id,
    b.input_warehouse_id, b.saved_to_recipe, b.produced_on::text as on, trim_scale(b.output_qty_kg)::text as output, b.note,
    (select trim_scale(l.qty_in)::text || '/' || l.value_in::text from public.stock_lots l where l.id = b.output_lot_id) as lot,
    (select l.warehouse_id from public.stock_lots l where l.id = b.output_lot_id) as lot_wh,
    (select pv.total_value::text from public.production_values pv where pv.batch_id = b.id) as total
    from public.production_batches b where b.id = $1`, [batchId])).rows[0] ?? null;
  const countVersions = async (recipeId) => Number((await db.admin('select count(*) from public.recipe_versions where recipe_id = $1', [recipeId])).rows[0].count);
  const B = {};
  await section('produce_batch: الطريق السعيد', async () => {
    const before = { corn: await stock(I.corn), soy: await stock(I.soy), oil: await stock(I.oil) };
    // الذرة 600.25 بلا تقريب لخطوة العدّاد (0.1)، والصويا 300، والزيت 50 لتراً (46 كغم بكثافة 0.92): الإنتاج 946.25 كغم.
    const run = produce(U.owner, { id: id(201), lines: [{ item_id: I.corn, qty: '600.25' }, { item_id: I.soy, qty: '300' }, { item_id: I.oil, qty: '50' }], note: 'أوّل إنتاج بالموادّ' });
    const out = await run.run();
    samples.produce_batch.posted = out.value;
    t.same(out.ok ? [out.value.status, out.value.saved_to_recipe, out.value.recipe_version_id, out.value.version_no, out.value.output_warehouse_name,
      out.value.input_warehouse_name, norm(out.value.output_qty_kg), norm(out.value.input_mass_kg), out.value.note, Boolean(out.value.doc_no), Boolean(out.value.money?.total_value)] : refusal(out),
    ['posted', false, R.starter.version, 1, 'رصيد العلف', 'مخزن المواد الأوّلية', '946.25', '946.25', 'أوّل إنتاج بالموادّ', true, true],
    'produce_batch: مرحَّلة بالنسخة المفعَّلة، والناتج «رصيد العلف» بلا اختيار، والوزن = كتلة الموادّ بلا هدر، والمال للمالك');
    B.first = id(201);
    const row = await batchRow(B.first);
    t.same([row.planned, row.recipe_version_id, row.output_warehouse_id, row.lot_wh, row.lot === `946.25/${row.total}`, row.saved_to_recipe],
      ['946.25', R.starter.version, W.feed, W.feed, true, false],
      'الدفعة: planned_kg = مجموع الكتلة داخل الكتلة، والناتج في «رصيد العلف» دفعةً بقيمة الكلفة بالضبط');
    t.same(await inputs(B.first), [
      [1, I.corn, '600.25', '600.25', null, true, 'kg', null],
      [2, I.soy, '300', '300', null, true, 'kg', null],
      [3, I.oil, '50', '46', null, true, 'L', '0.9200'],
    ], 'المدخلات بترتيب الشاشة بالكميات المكتوبة (المخطّط = المكتوب بلا تقريب لخطوة العدّاد)، والكتلة، والكثافة لقطة النسخة');
    t.same([await stock(I.corn), await stock(I.soy), await stock(I.oil)],
      [norm(String(Number(before.corn) - 600.25)), norm(String(Number(before.soy) - 300)), norm(String(Number(before.oil) - 50))], 'سُحبت الكميات المكتوبة من مخزن المواد');
    // الإعادة بالمرجع والقيم نفسها، والمعرّف بمرجع آخر، والمرجع بقيم أخرى.
    const retry = await run.run();
    t.same([retry.ok && retry.value.doc_no === out.value.doc_no, Number((await db.admin('select count(*) from public.production_batches where id = $1', [B.first])).rows[0].count)], [true, 1],
      'الإعادة بالمرجع والقيم نفسها ترجّع النتيجة نفسها ولا تنتج مرّة ثانية');
    const sameId = keep('id_conflict', await produce(U.owner, { id: B.first, lines: [{ item_id: I.corn, qty: '10' }] }).run());
    const reused = await produce(U.owner, { id: B.first, ref: run.a.ref, lines: [{ item_id: I.corn, qty: '10' }] }).run();
    t.same([refusal(sameId), code(reused)], [['id_conflict', 'هذه الدفعة سُجّلت من قبل. افتحها من المعمل لترى ما حُفظ.'], 'ref_reused'],
      'المعرّف نفسه بقيم أخرى ومرجع آخر: id_conflict؛ والمرجع نفسه بقيم أخرى: ref_reused');
    // الخلطة القديمة بـproduce_batch: موادّها نفسها بكميات مكتوبة (لا تُقرأ كميات الخلطة).
    const legacy = await produce(U.owner, { id: id(202), recipe: R.breeder.id, version: R.breeder.version, lines: [{ item_id: I.soy, qty: '120' }, { item_id: I.corn, qty: '80' }], on: day(-2) }).run();
    t.same([legacy.ok && legacy.value.status, legacy.ok && legacy.value.saved_to_recipe, (await inputs(id(202))).map((r) => [r[1], r[2]]), (await batchRow(id(202))).planned],
      ['posted', false, [[I.soy, '120'], [I.corn, '80']], '200'], 'الخلطة بكميات تُنتج بـproduce_batch بالكميات المكتوبة وترتيب الشاشة (الترتيب لا يُعدّ تغييراً)');
  });

  await section('produce_batch: الموادّ والاختيار', async () => {
    // «لهذه المرّة فقط»: برمكس خارج الخلطة مدخل عاديّ، والصويا والزيت غائبان.
    const once = await produce(U.owner, { id: id(211), lines: [{ item_id: I.corn, qty: '500' }, { item_id: I.premix, qty: '20' }], save: false, on: day(-1) }).run();
    t.same(once.ok ? [once.value.status, once.value.saved_to_recipe, once.value.recipe_version_id, await countVersions(R.starter.id)] : refusal(once),
      ['posted', false, R.starter.version, 1], '«لهذه المرّة فقط»: الدفعة بالنسخة الحالية، ولا نسخة جديدة');
    t.same((await inputs(id(211))).map((r) => [r[1], r[2], r[5]]), [[I.corn, '500', true], [I.premix, '20', true]],
      'المادّة خارج الخلطة مدخل عاديّ داخل الكتلة، والمحذوفتان غائبتان');
    const unchosen = keep('recipe_choice_required', await produce(U.owner, { lines: [{ item_id: I.corn, qty: '500' }, { item_id: I.premix, qty: '20' }] }).run());
    t.same(refusal(unchosen), ['recipe_choice_required', 'غيّرت موادّ الخلطة: اختر «عدّل الخلطة» أو «لهذه المرّة فقط».'], 'تغيير الموادّ بلا اختيار: recipe_choice_required بتلميحه');
    const ignored = await produce(U.owner, { id: id(212), lines: [{ item_id: I.oil, qty: '10' }, { item_id: I.corn, qty: '300' }, { item_id: I.soy, qty: '100' }], save: true, on: day(-1) }).run();
    t.same(ignored.ok ? [ignored.value.saved_to_recipe, ignored.value.recipe_version_id, await countVersions(R.starter.id)] : refusal(ignored), [false, R.starter.version, 1],
      'الموادّ نفسها بترتيب آخر: الاختيار يُتجاهل (لا نسخة جديدة ولو طُلب الحفظ)');
    const operatorSave = keep('forbidden_save', await produce(U.millOperator, { lines: [{ item_id: I.corn, qty: '500' }, { item_id: I.premix, qty: '20' }], save: true }).run());
    t.same(refusal(operatorSave), ['forbidden', 'تعديل الخلطة للمالك أو المدير؛ اختر «لهذه المرّة فقط».'], 'مشغّل المعمل يختار «عدّل الخلطة»: forbidden بتلميحه');
    const stale = keep('recipe_changed', await produce(U.owner, { version: R.grower.version, lines: [{ item_id: I.corn, qty: '10' }] }).run());
    t.same(refusal(stale), ['recipe_changed', 'تغيّرت هذه الخلطة من جهاز آخر؛ حدّث الشاشة ثمّ أنتج.'], 'النسخة التي رأتها الشاشة غير المفعَّلة: recipe_changed بتلميحه');
    // «عدّل الخلطة» على الناهي (بمعدّل تكاليف): نسخة بالموادّ بترتيب الشاشة، والمعدّل منسوخ، والقديمة مقاعدة، والدفعة بالنسخة الجديدة (مسوّدة: المعدّل
    // يحتاج مصروفاً مسجّلاً ليُرحَّل).
    const saved = await produce(U.manager, { id: id(221), recipe: R.finisher.id, version: R.finisher.version, draft: true, save: true,
      lines: [{ item_id: I.premix, qty: '15' }, { item_id: I.corn, qty: '700' }, { item_id: I.oil, qty: '20' }] }).run();
    samples.produce_batch.saved_draft = saved.value;
    const newVersion = saved.ok ? saved.value.recipe_version_id : null;
    t.same(saved.ok ? [saved.value.status, saved.value.saved_to_recipe, saved.value.version_no, newVersion !== R.finisher.version] : refusal(saved),
      ['draft', true, 2, true], '«عدّل الخلطة» مع «احفظ مسوّدة»: نسخة جديدة (2) والدفعة مسوّدة بها، saved_to_recipe');
    t.same([await versionRow(newVersion), await versionRow(R.finisher.version), (await lines(newVersion)).map((l) => [l.line_no, l.item_id, l.qty, l.unit, l.in_basis]),
      (await db.admin('select category_id, amount_per_ton::text as a from public.recipe_cost_rates where version_id = $1 order by line_no', [newVersion])).rows.map((r) => [r.category_id, r.a])],
    [{ status: 'active', basis: null, version_no: 2 }, { status: 'retired', basis: '1000.000', version_no: 1 },
      [[1, I.premix, null, 'kg', true], [2, I.corn, null, 'kg', true], [3, I.oil, null, 'L', true]], [[labor, '5000.00']]],
    'النسخة الجديدة بالموادّ بترتيب الشاشة (بلا كمية ولا أساس)، والمعدّل منسوخ، والقديمة مقاعدة');
    t.same([(await batchRow(id(221))).recipe_version_id, (await batchRow(id(221))).saved_to_recipe, (await batchRow(id(221))).planned,
      (await db.admin('select trim_scale(planned_amount)::text as a from public.production_costs where batch_id = $1', [id(221)])).rows.map((r) => r.a)],
    [newVersion, true, '733.4', ['3667']], 'الدفعة بالنسخة الجديدة، وكمية إنتاجها 715 + 18.4، وسطر تكاليفها من المعدّل (5,000 × 0.7334)');
    R.finisher.version = newVersion;
    const detail = await one(U.owner, 'select public.production_detail($1) as v', [id(221)]);
    t.same(detail.saved_to_recipe, true, 'production_detail يقول saved_to_recipe');
    // مسوّدة خلطة قائمة ← draft_exists مع «عدّل الخلطة»، و«لهذه المرّة فقط» يمرّ.
    await one(U.manager, 'select public.new_recipe_version($1, $2) as v', [R.breeder.id, id(231)]);
    const blocked = keep('draft_exists', await produce(U.manager, { recipe: R.breeder.id, version: R.breeder.version, save: true, lines: [{ item_id: I.corn, qty: '100' }] }).run());
    const onlyOnce = await produce(U.manager, { id: id(232), recipe: R.breeder.id, version: R.breeder.version, save: false, lines: [{ item_id: I.corn, qty: '100' }], on: day(-2) }).run();
    t.same([refusal(blocked), onlyOnce.ok && onlyOnce.value.status, await countVersions(R.breeder.id)],
      [['draft_exists', 'للخلطة تعديل مفتوح لم يُفعَّل؛ فعّله أو احذفه من صفحة الخلطة، أو أنتج لهذه المرّة فقط.'], 'posted', 2],
      'للخلطة مسوّدة: «عدّل الخلطة» draft_exists بتلميحه، و«لهذه المرّة فقط» يُنتج');
    // «عدّل الخلطة» مرحَّلةً على البادئ (بلا معدّل): الصويا تخرج والبرمكس يدخل.
    const posted = await produce(U.owner, { id: id(241), save: true, on: day(-1), lines: [{ item_id: I.corn, qty: '640' }, { item_id: I.oil, qty: '30' }, { item_id: I.premix, qty: '25' }] }).run();
    samples.produce_batch.saved_posted = posted.value;
    t.same(posted.ok ? [posted.value.status, posted.value.saved_to_recipe, posted.value.version_no, norm(posted.value.output_qty_kg)] : refusal(posted),
      ['posted', true, 2, '692.6'], '«عدّل الخلطة» مع «أنتج»: نسخة 2 والدفعة مرحَّلة بها (640 + 27.6 + 25)');
    R.starter.previous = R.starter.version;
    R.starter.version = posted.value.recipe_version_id;
  });

  await section('produce_batch: الرفض', async () => {
    const run = (over, user = U.owner) => produce(user, over).run();
    const versionsBefore = await countVersions(R.starter.id);
    const shortage = keep('production_blocked', await run({ id: id(251), save: true, lines: [{ item_id: I.corn, qty: '900000' }, { item_id: I.soy, qty: '10' }] }));
    t.same([shortage.code, shortage.hint?.startsWith('لا يكفي رصيد «ذرة» في «مخزن المواد الأوّلية»: المطلوب'), await batchRow(id(251)), await countVersions(R.starter.id)],
      ['production_blocked', true, null, versionsBefore], 'النقص: production_blocked بتلميح أوّل مشكلة، ولا دفعة ولا نسخة (حتى مع «عدّل الخلطة»)');
    const ghost = uid();
    const shapes = [
      await run({ lines: [] }), await run({ lines: null }), await run({ lines: { item_id: I.corn, qty: '1' } }), await run({ lines: [{ item_id: I.corn, qty: '1,000' }] }),
      await run({ lines: [{ item_id: I.corn, qty: '-5' }] }), await run({ lines: [{ item_id: I.corn, qty: '1.2345' }] }), await run({ lines: [{ item_id: 'x', qty: '1' }] }),
      await run({ lines: [{ item_id: ghost, qty: '1' }] }), await run({ lines: [{ item_id: I.corn, qty: '1' }, { item_id: I.corn, qty: '2' }] }),
      await run({ lines: [{ item_id: I.corn, qty: '1' }, { item_id: I.spare, qty: '2' }] }), await run({ lines: [{ item_id: I.corn, qty: '1' }, { item_id: I.sack, qty: '2' }] }),
      await run({ lines: [{ item_id: I.corn, qty: '1' }, { item_id: I.syrup, qty: '2' }] }), await run({ lines: [{ item_id: I.corn, qty: '0' }] }),
      await run({ lines: [{ item_id: I.corn, qty: '1' }, { item_id: I.light, qty: '0.001' }] }), await run({ lines: [{ item_id: I.corn, qty: '1000000000' }] }),
      await run({ lines: [{ item_id: I.kaz, qty: '5' }, { item_id: I.twine, qty: '1' }] }), await run({ lines: [{ item_id: I.corn, qty: '1' }], ref: null }),
    ];
    t.same(shapes.map(code), ['lines_required', 'lines_required', 'bad_line', 'bad_line', 'bad_line', 'bad_line', 'bad_line', 'item_not_found', 'item_duplicated',
      'item_kind_mismatch', 'bad_recipe_unit', 'density_required', 'qty_not_positive', 'qty_not_positive', 'qty_too_large', 'no_mass_inputs', 'ref_required'],
    'رفض الموادّ: فارغة، وبلا قائمة، وليست قائمة، وكمية بفاصلة، وسالبة، وأربع مراتب، ومعرّف غير صالح، ومجهولة، ومكرّرة، ولا يستلمها مخزن المواد، وبالقطعة، وسائل بلا كثافة، وصفر، وكتلة تُقرَّب صفراً، وكبيرة، ووقود وتعبئة وحدهما، وبلا مرجع');
    for (const [name, i] of [['lines_required', 0], ['bad_line', 3], ['item_not_found', 7], ['item_duplicated', 8], ['item_kind_mismatch', 9], ['bad_recipe_unit', 10],
      ['density_required', 11], ['qty_not_positive', 12], ['qty_too_large', 14], ['no_mass_inputs', 15]]) samples.refusals[name] = { code: shapes[i].code, hint: shapes[i].hint };
    t.same([shapes[11].hint, shapes[15].hint, shapes[9].hint], [
      '«دبس بلا كثافة» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) أوّلاً.',
      'الدفعة بلا مادّة داخل الكتلة: أضف مادّة أوّلية؛ الوقود والتعبئة وحدهما لا يصنعان علفاً.',
      '«علف تجربة» لا تُخزَّن في «مخزن المواد الأوّلية»: اختر مادّة من مواد المعمل الأوّلية.',
    ], 'تلميحات الرفض تسمّي المادّة والمخزن');
    const hidden = await item('سائل مؤرشف', 'raw', 'L', '0.9');
    await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [hidden]);
    const archivedItem = await run({ lines: [{ item_id: I.corn, qty: '1' }, { item_id: hidden, qty: '1' }] });
    samples.refusals.item_archived = { code: archivedItem.code, hint: archivedItem.hint };
    t.same(refusal(archivedItem), ['item_archived', '«سائل مؤرشف» محذوفة من القوائم، فلا تُسحب في الإنتاج. أظهِرها من ملفّها، أو أزِلها من موادّ هذا الإنتاج.'],
      'مادّة محذوفة من القوائم: item_archived بتلميحه');
    t.same([
      code(await run({ recipe: uid(), lines: [{ item_id: I.corn, qty: '1' }] })),
      code(await run({ in: W.general, lines: [{ item_id: I.corn, qty: '1' }] }, U.millOperator)),
      code(await run({ lines: [{ item_id: I.corn, qty: '1' }] }, U.storekeeper)),
      code(await run({ lines: [{ item_id: I.corn, qty: '1' }] }, U.accountant)),
      code(await run({ in: W.feed, lines: [{ item_id: I.corn, qty: '1' }] })),
      code(await run({ on: day(1), lines: [{ item_id: I.corn, qty: '1' }] })),
      code(await run({ on: day(-8), lines: [{ item_id: I.corn, qty: '1' }] })),
    ], ['recipe_not_found', 'out_of_scope', 'forbidden', 'forbidden', 'same_warehouse', 'date_in_future', 'date_too_old'],
    'رفض الدفعة: خلطة مجهولة، ومخزن خارج النطاق، والأمين والمحاسب بلا فعل الإنتاج، و«رصيد العلف» مخزن موادّ، وتاريخ قادم، وأقدم من سبعة أيّام');
    const archivedRecipe = await createRecipe(U.manager, { id: id(261), version: id(262) }, 'علف مؤرشف', I.spare, null, [{ item_id: I.corn }]);
    await one(U.manager, 'update public.recipes set archived_at = now() where id = $1 returning id', [id(261)]);
    const archived = keep('recipe_archived', await run({ recipe: id(261), version: id(262), lines: [{ item_id: I.corn, qty: '1' }] }));
    t.same([archivedRecipe.ok, refusal(archived)], [true, ['recipe_archived', 'الخلطة «علف مؤرشف» مؤرشفة، فلا يُنتَج بها. أعِدها من الأرشيف أوّلاً.']],
      'خلطة مؤرشفة: recipe_archived بتلميحه');
  });

  await section('produce_batch: المسوّدة وانتظار الختم', async () => {
    const operator = await produce(U.millOperator, { id: id(271), lines: [{ item_id: I.corn, qty: '400' }, { item_id: I.oil, qty: '10' }, { item_id: I.premix, qty: '5' }] }).run();
    samples.produce_batch.awaiting = operator.value;
    t.same(operator.ok ? [operator.value.status, operator.value.awaiting, operator.value.saved_to_recipe, operator.value.recipe_version_id, (await batchRow(id(271))).status] : refusal(operator),
      ['draft', 'costs', false, R.starter.version, 'draft'], 'مشغّل المعمل: مسوّدة تنتظر ختم الكلف كما في record_production');
    const draft = await produce(U.owner, { id: id(272), draft: true, lines: [{ item_id: I.corn, qty: '100' }, { item_id: I.oil, qty: '5' }, { item_id: I.premix, qty: '2' }], note: 'مسوّدة' }).run();
    samples.produce_batch.draft = draft.value;
    t.same(draft.ok ? Object.keys(draft.value).sort() : refusal(draft), ['id', 'recipe_version_id', 'saved_to_recipe', 'status', 'version_no'],
      '«احفظ مسوّدة»: الجواب {id, status, saved_to_recipe, recipe_version_id, version_no}');
    t.same([draft.value.status, (await batchRow(id(272))).status, (await batchRow(id(272))).note, (await inputs(id(272))).length], ['draft', 'draft', 'مسوّدة', 3],
      'الدفعة مسوّدة بموادّها وملاحظتها، وصفحة الدفعة تكمل');
    const preview = await one(U.owner, 'select public.preview_production($1) as v', [id(272)]);
    const posted = await one(U.owner, "select public.post_production($1, (select version from public.production_batches where id = $1), $2, $3) as v", [id(272), preview.plan_token, uid()]);
    t.same([posted.status, (await batchRow(id(272))).lot_wh], ['posted', W.feed], 'المسوّدة تُرحَّل من صفحة الدفعة إلى «رصيد العلف»');
  });

  // ── ٦) production_form ───────────────────────────────────────────────────────────────────────────────────────────
  await section('production_form', async () => {
    const form = (user, recipeId) => call(db, user, FORM, [recipeId]);
    const starter = await one(U.owner, FORM, [R.starter.id]);
    samples.production_form.after_saved_batch = starter;
    t.same([starter.today, starter.recipe.name, starter.recipe.archived, starter.recipe.output_item.name, starter.active.id === R.starter.version, starter.active.version_no,
      starter.active.materials_only, starter.output_store.id === W.feed, starter.output_store.name, starter.can_edit_recipe, starter.draft_exists, starter.stores.map((s) => s.name)],
    [TODAY, 'علف بادئ', false, 'علف بادئ', true, 2, true, true, 'رصيد العلف', true, false, ['مخزن المواد الأوّلية']],
    'production_form: الخلطة ونسختها المفعَّلة بالموادّ، و«رصيد العلف» مخزن الناتج، ومخازن الموادّ بالنطاق، ويعدّل الخلطة');
    // آخر دفعة مرحَّلة للخلطة: id(272) (اليوم، رُحّلت أخيراً) بموادّها 100 + 5 لتر + 2 برمكس؛ ومسوّدة المشغّل لا تُعدّ.
    t.same(starter.materials.map((m) => [m.line_no, m.name, m.kind, m.base_unit, m.density, m.in_basis, norm(m.scale_step), m.default_qty, m.default_source]), [
      [1, 'ذرة', 'raw', 'kg', null, true, '0.1', '100.000', 'last'],
      [2, 'زيت', 'raw', 'L', '0.9200', true, '0.1', '5.000', 'last'],
      [3, 'برمكس', 'additive', 'kg', null, true, '0.1', '2.000', 'last'],
    ], 'الموادّ بترتيب النسخة، وكمية كلّ مادّة من آخر دفعة مرحَّلة (الأحدث يوماً ثمّ ترحيلاً)، والمسوّدة لا تُعدّ');
    t.same([starter.last.id, starter.last.produced_on, norm(starter.last.output_kg), norm(starter.last.input_mass_kg), starter.last.extra_items], [id(272), TODAY, '106.6', '106.6', []],
      'last: آخر دفعة مرحَّلة (100 + 5 لتر × 0.92 + 2) بلا موادّ خارج النسخة');
    // أوّل مرّة لخلطة بالموادّ بلا دفعة: فارغة؛ والخلطة بكميات بلا دفعة: من الخلطة بوحدة المادّة (الزيت 18.4 كغم ← 20 لتراً).
    const fresh = await createRecipe(U.manager, { id: id(281), version: id(282) }, 'علف أوّل مرّة', I.spare, null, [{ item_id: I.soy }, { item_id: I.corn }]);
    const legacyForm = await createRecipe(U.manager, { id: id(283), version: id(284) }, 'علف بكميات', I.spare, '1000.000',
      [{ item_id: I.corn, qty: '700.000', unit: 'kg' }, { item_id: I.soy, qty: '281.600', unit: 'kg' }, { item_id: I.oil, qty: '18.400', unit: 'kg' }]);
    const firstTime = await one(U.owner, FORM, [id(281)]);
    const legacy = await one(U.owner, FORM, [id(283)]);
    samples.production_form.first_time = firstTime;
    samples.production_form.legacy = legacy;
    t.same([fresh.ok, legacyForm.ok, firstTime.materials.map((m) => [m.name, m.default_qty, m.default_source]), firstTime.last, firstTime.active.materials_only,
      legacy.active.materials_only, legacy.materials.map((m) => [m.name, m.base_unit, m.default_qty, m.default_source])],
    [true, true, [['صويا', null, null], ['ذرة', null, null]], null, true, false,
      [['ذرة', 'kg', '700.000', 'recipe'], ['صويا', 'kg', '281.600', 'recipe'], ['زيت', 'L', '20.000', 'recipe']]],
    'الكميات المقترحة: خلطة بالموادّ بلا دفعة فارغة، والخلطة بكميات من سطورها بوحدة المادّة (18.4 كغم زيت = 20 لتراً بكثافة اللقطة)');
    // دفعة للخلطة بكميات بلا الصويا وببرمكس: الذرة والزيت من آخر دفعة، والصويا من الخلطة، والبرمكس في extra_items.
    const legacyBatch = await produce(U.owner, { id: id(285), recipe: id(283), version: id(284), save: false,
      lines: [{ item_id: I.corn, qty: '650' }, { item_id: I.oil, qty: '22' }, { item_id: I.premix, qty: '3' }] }).run();
    const afterLegacy = await one(U.owner, FORM, [id(283)]);
    samples.production_form.legacy_after_batch = afterLegacy;
    t.same([legacyBatch.ok && legacyBatch.value.status, afterLegacy.materials.map((m) => [m.name, m.default_qty, m.default_source]), afterLegacy.last.extra_items.map((x) => x.name)],
      ['posted', [['ذرة', '650.000', 'last'], ['صويا', '281.600', 'recipe'], ['زيت', '22.000', 'last']], ['برمكس']],
      'بعد دفعة: الموجود في آخر دفعة منها، والغائب منها من الخلطة القديمة، والمادّة خارج النسخة في extra_items');
    // الدفعة الملغاة لا تُعدّ «آخر إنتاج».
    await one(U.owner, "select public.void_production($1, 'كمية خاطئة', $2) as v", [id(285), uid()]);
    const afterVoid = await one(U.owner, FORM, [id(283)]);
    t.same([afterVoid.last, afterVoid.materials.map((m) => m.default_source)], [null, ['recipe', 'recipe', 'recipe']], 'الدفعة الملغاة لا تُعدّ: الكميات من الخلطة');
    // مخزن موادّ ثانٍ بالاسم (الترتيب بالاسم)، والمشغّل بنطاقه، والأدوار الأخرى ممنوعة.
    await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'المخزن الإضافي للموادّ', 'raw') returning id", [D.feed_mill, millSite]);
    const operatorForm = await one(U.millOperator, FORM, [R.starter.id]);
    samples.production_form.operator = operatorForm;
    t.same([operatorForm.stores.map((s) => s.name), operatorForm.can_edit_recipe, (await one(U.owner, FORM, [R.starter.id])).stores.map((s) => s.name)],
      [['المخزن الإضافي للموادّ', 'مخزن المواد الأوّلية'], false, ['المخزن الإضافي للموادّ', 'مخزن المواد الأوّلية']],
      'مخازن الموادّ الحيّة بالنطاق بالاسم، ومشغّل المعمل لا يعدّل الخلطة');
    t.same([code(await form(U.accountant, R.starter.id)), code(await form(U.viewer, R.starter.id)), code(await form(U.keeperGeneral, R.starter.id)),
      code(await form(U.owner, uid()))], ['forbidden', 'forbidden', 'forbidden', 'recipe_not_found'], 'production_form لمن يُنتج وحده، والخلطة المجهولة recipe_not_found');
    // مسوّدة للخلطة ← draft_exists.
    const withDraft = await one(U.owner, FORM, [R.breeder.id]);
    t.same([withDraft.draft_exists, withDraft.active.materials_only], [true, false], 'draft_exists للخلطة التي لها مسوّدة');
  });

  // ── ٧) recipe_history ───────────────────────────────────────────────────────────────────────────────────────────
  await section('recipe_history', async () => {
    const history = (user, recipeId, from, to) => call(db, user, HISTORY, [recipeId, from, to]);
    t.same([
      refusal(keep('period_required', await history(U.owner, R.starter.id, null, TODAY))), refusal(await history(U.owner, R.starter.id, TODAY, day(-1))),
      refusal(keep('period_too_long', await history(U.owner, R.starter.id, day(-366), TODAY))), code(await history(U.owner, R.starter.id, day(-365), TODAY)),
      code(await history(U.owner, uid(), day(-30), TODAY)),
    ], [['period_required', 'اختر أوّل المدّة وآخرها من التقويم.'], ['period_required', 'أوّل المدّة بعد آخرها. اختر المدّة من جديد.'],
      ['period_too_long', 'المدّة أطول من سنة. اختر مدّة حتى 366 يوماً.'], 'ok', 'recipe_not_found'],
    'المدّة: مطلوبة، وأوّلها قبل آخرها، وحتى 366 يوماً؛ والخلطة المجهولة recipe_not_found');
    const h = await one(U.owner, HISTORY, [R.starter.id, day(-30), TODAY]);
    samples.recipe_history.starter = h;
    t.same(h.versions.map((v) => [v.version_no, v.status, v.materials_only, v.activated_by, v.items.map((x) => x.name), v.added.map((x) => x.name), v.removed.map((x) => x.name),
      v.from_batch?.id ?? null, Boolean(v.activated_at), Boolean(v.retired_at)]), [
      [2, 'active', true, 'المالك', ['ذرة', 'زيت', 'برمكس'], ['برمكس'], ['صويا'], id(241), true, false],
      [1, 'retired', true, 'manager', ['ذرة', 'صويا', 'زيت'], ['ذرة', 'صويا', 'زيت'], [], null, true, true],
    ], 'النسخ من الأحدث: موادّ كلّ نسخة بترتيبها، وما أُضيف وما حُذف عن السابقة، والإنتاج الذي حُفظت موادّه فيها، ومن فعّلها');
    t.same(h.productions.map((p) => [p.id, p.status, p.version_no, p.saved_to_recipe, p.produced_on]), [
      [id(272), 'posted', 2, false, TODAY], [id(201), 'posted', 1, false, TODAY], [id(241), 'posted', 2, true, day(-1)], [id(212), 'posted', 1, false, day(-1)],
      [id(211), 'posted', 1, false, day(-1)],
    ], 'الإنتاج المرحَّل في المدّة من الأحدث (اليوم ثمّ وقت الترحيل)، والمسوّدة (انتظار الختم) خارجها');
    const once = h.productions.find((p) => p.id === id(211));
    t.same([once.lines.map((l) => [l.name, l.qty, l.base_unit, l.mass_kg, l.in_basis, l.extra]), once.omitted.map((x) => x.name), once.by, norm(once.output_kg)],
      [[['ذرة', '500.000', 'kg', '500.000', true, false], ['برمكس', '20.000', 'kg', '20.000', true, true]], ['صويا', 'زيت'], 'المالك', '520'],
      '«لهذه المرّة فقط» في السجلّ: البرمكس extra، والصويا والزيت omitted، ومن أنتج');
    const first = h.productions.find((p) => p.id === id(201));
    t.same([first.note, first.lines.map((l) => [l.name, l.qty, l.mass_kg]), first.omitted], ['أوّل إنتاج بالموادّ', [['ذرة', '600.250', '600.250'], ['صويا', '300.000', '300.000'], ['زيت', '50.000', '46.000']], []],
      'السطور بكمياتها بوحدة المادّة وكتلتها، والملاحظة');
    t.same([h.totals.batches, norm(h.totals.output_kg)], [5, '2674.65'], 'المجاميع للمرحَّل وحده (946.25 + 520 + 409.2 + 692.6 + 106.6)');
    // الملغاة في السجلّ ومجاميعها خارجها؛ والمدّة تستثني ما قبلها.
    await one(U.owner, "select public.void_production($1, 'خطأ في الوزن', $2) as v", [id(212), uid()]);
    const afterVoid = await one(U.owner, HISTORY, [R.starter.id, day(-30), TODAY]);
    const today = await one(U.owner, HISTORY, [R.starter.id, TODAY, TODAY]);
    t.same([afterVoid.productions.find((p) => p.id === id(212))?.status, afterVoid.totals.batches, today.productions.map((p) => p.id), today.versions.length],
      ['void', 4, [id(272), id(201)], 2], 'الملغاة تبقى في السجلّ بحالتها وتخرج من المجاميع، والمدّة تحصر الإنتاج لا النسخ');
    // خلطة بكميات أصبحت بالموادّ بالإنتاج: الناهي (v1 بكميات، v2 من الدفعة id(221) المسوّدة) — المسوّدة لا تظهر، وfrom_batch يسمّيها.
    const fin = await one(U.owner, HISTORY, [R.finisher.id, day(-30), TODAY]);
    samples.recipe_history.finisher = fin;
    t.same([fin.versions.map((v) => [v.version_no, v.materials_only, v.added.map((x) => x.name), v.removed.map((x) => x.name), v.from_batch?.id ?? null]), fin.productions, fin.totals.batches],
      [[[2, true, ['برمكس'], ['صويا'], id(221)], [1, false, ['ذرة', 'صويا', 'زيت'], [], null]], [], 0],
      'الناهي: النسخة 2 من دفعة مسوّدة (from_batch)، والمسوّدة لا تظهر في الإنتاج');
    // القارئ خارج نطاق المعمل يرى النسخ ولا يرى الإنتاج؛ والإنتاج قبل أشهر خارج المدّة وداخل سنة.
    const outside = await one(U.keeperGeneral, HISTORY, [R.starter.id, day(-30), TODAY]);
    t.same([outside.versions.length, outside.productions.length, outside.totals.batches], [2, 0, 0], 'أمين العامّة: النسخ بلا إنتاج');
  });

  // ── ٨) recipes_overview: القطع ─────────────────────────────────────────────────────────────────────────────────────
  await section('recipes_overview', async () => {
    const board = await one(U.owner, OVERVIEW, []);
    samples.recipes_overview.board = board;
    const card = (recipeId) => board.recipes.find((r) => r.id === recipeId);
    const starter = card(R.starter.id);
    t.same([starter.active.materials_only, starter.active.basis_kg, starter.active.pieces_source, starter.active.pieces.map((p) => [p.name, p.item_name, p.mass_kg, p.in_basis]),
      starter.last_batch.id, starter.money.expected_cost_per_kg], [true, null, 'last_batch', [['ذرة', 'ذرة', '100.000', true], ['زيت', 'زيت', '4.600', true], ['برمكس', 'برمكس', '2.000', true]],
      id(272), null], 'خلطة بالموادّ بدفعة: قطعها من آخر دفعة مرحَّلة بكتلتها وترتيب سطورها، والبطاقة بالدفعة نفسها، ولا كلفة متوقّعة');
    const fresh = card(id(281));
    t.same([fresh.active.materials_only, fresh.active.pieces_source, fresh.active.pieces.map((p) => [p.name, p.mass_kg, p.in_basis]), fresh.last_batch],
      [true, 'recipe', [['صويا', null, true], ['ذرة', null, true]], null], 'خلطة بالموادّ بلا دفعة: قطعها موادّ النسخة بترتيبها بلا كتلة');
    const legacy = card(id(283));
    t.same([legacy.active.materials_only, legacy.active.basis_kg, legacy.active.pieces_source, legacy.active.pieces.map((p) => [p.item_name, p.mass_kg]), Boolean(legacy.money.expected_cost_per_kg)],
      [false, '1000.000', 'recipe', [['ذرة', '700.000'], ['صويا', '281.600'], ['زيت', '18.400']], true],
      'الخلطة بكميات كما كانت: قطعها من سطورها بكتلتها من الأكبر، والكلفة المتوقّعة');
    // قطع آخر دفعة داخل الكتلة وحدها: دفعة بكاز (وقود) لا يظهر في القطع.
    await produce(U.owner, { id: id(291), recipe: id(281), version: id(282), save: false, lines: [{ item_id: I.soy, qty: '40' }, { item_id: I.kaz, qty: '2' }, { item_id: I.corn, qty: '60' }] }).run();
    const withFuel = (await one(U.owner, OVERVIEW, [])).recipes.find((r) => r.id === id(281));
    t.same([withFuel.active.pieces_source, withFuel.active.pieces.map((p) => [p.name, p.mass_kg])], ['last_batch', [['صويا', '40.000'], ['ذرة', '60.000']]],
      'الوقود في آخر دفعة خارج القطع (داخل الكتلة وحدها)');
  });

  // ── ٩) «رصيد العلف»: الاسم والبذرة ───────────────────────────────────────────────────────────────────────────────
  await section('رصيد العلف', async () => {
    const feedStores = (await db.admin("select w.name from public.warehouses w join public.divisions d on d.id = w.division_id where w.org_id = $1 and w.kind = 'feed' and d.kind = 'feed_mill'", [org])).rows.map((r) => r.name);
    t.same(feedStores, ['رصيد العلف'], 'منشأة جديدة: مخزن العلف في المعمل يُزرع باسم «رصيد العلف»');
    const RENAME = /\nupdate public\.warehouses w set name = 'رصيد العلف'\n[\s\S]*?;\n/u.exec(MIGRATION)?.[0];
    const BACK = /\nupdate public\.warehouses w set name = 'مخزن العلف'\n[\s\S]*?;\n/u.exec(ROLLBACK)?.[0];
    t.ok(Boolean(RENAME && BACK), 'جملتا الاسم في الهجرة والتراجع');
    // منشأة كما قبل 0025: مخزن العلف باسمه القديم، ومخزن علف ثانٍ في المعمل باسم آخر، و«مخزن العلف» في وحدة أخرى (حقل) — الجملة تسمّي الأوّل وحده،
    // والتراجع يعيده.
    const renamed = await mutant(db, U.owner, [], async ({ oq }) => {
      const names = async () => (await oq(`select d.kind as division, w.kind, w.name from public.warehouses w join public.divisions d on d.id = w.division_id
        where w.org_id = $1 and (w.kind = 'feed' or w.name like '%العلف%') order by d.kind, w.name collate "C"`, [org])).rows.map((r) => `${r.division}/${r.kind}/${r.name}`);
      await oq("update public.warehouses set name = 'مخزن العلف' where org_id = $1 and kind = 'feed' and name = 'رصيد العلف'", [org]);
      await oq("insert into public.warehouses (org_id, division_id, site_id, name, kind) values ($1, $2, $3, 'علف الطوارئ', 'feed')", [org, D.feed_mill, millSite]);
      const farmSite = (await oq("insert into public.sites (org_id, division_id, name, kind) values ($1, $2, 'حقل الاسم', 'farm') returning id", [org, D.broiler])).rows[0].id;
      await oq("insert into public.warehouses (org_id, division_id, site_id, name, kind) values ($1, $2, $3, 'مخزن العلف', 'farm')", [org, D.broiler, farmSite]);
      const before = await names();
      await oq(RENAME);
      const after = await names();
      await oq(BACK);
      return [before, after, await names()];
    });
    t.same(renamed, [
      ['broiler/farm/مخزن العلف', 'feed_mill/feed/علف الطوارئ', 'feed_mill/feed/مخزن العلف'],
      ['broiler/farm/مخزن العلف', 'feed_mill/feed/رصيد العلف', 'feed_mill/feed/علف الطوارئ'],
      ['broiler/farm/مخزن العلف', 'feed_mill/feed/علف الطوارئ', 'feed_mill/feed/مخزن العلف'],
    ], 'الهجرة تسمّي «مخزن العلف» في وحدة المعمل وحده «رصيد العلف» (لا مخزن العلف الآخر ولا مخزن حقل بالاسم نفسه)، والتراجع يعيده');
  });

  // ── ١٠) verify_mill: الفحص ٢ يتخطّى النسخة بلا أساس، والفحص ١٦ recipe_quantities_mode بطفرة حقيقية ─────────────────────────────────
  await section('verify_mill', async () => {
    const checks = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_mill()')).rows.map((r) => [r.check_name, r.v]));
    const live = await db.asService(checks);
    t.same([live.recipe_basis_mismatch, live.recipe_quantities_mode, Object.keys(live).length], [0, 0, 16], 'verify_mill: ستّة عشر فحصاً صفراً على خلطات بالموادّ وبكميات');
    // (أ) التفعيل المكسور يترك الأساس المكتوب لنسخة بلا كميات ← الفحص ١٦ يعدّها؛ وبنصّه المكسور (having false) لا يعدّها.
    const plant = (fns) => mutant(db, U.owner, fns, async ({ oq, attempt }) => {
      const r = await attempt(U.owner, async (q) => (await q("select public.create_recipe($1, $2, 'خلطة الطفرة', $3, null, $4::jsonb, '[]'::jsonb, false) as v",
        [uid(), id(301), I.spare, JSON.stringify([{ item_id: I.corn }])])).rows[0].v);
      await oq('update public.recipe_versions set basis_kg = 1000 where id = $1', [id(301)]);
      const activated = await attempt(U.owner, async (q) => (await q(ACTIVATE, [id(301)])).rows[0].v);
      return [r.ok, activated.ok ? activated.value.status : activated.code, await checks(oq)];
    });
    const BASIS_NULLED = "    basis_kg = case when v_bare then null else basis_kg end\n";
    const control = await plant([]);
    const broken = await plant([[FN.activate, [[BASIS_NULLED, '    basis_kg = basis_kg\n']]]]);
    const blind = await plant([[FN.activate, [[BASIS_NULLED, '    basis_kg = basis_kg\n']]], [FN.verify, [['having (bool_or(l.qty is null) and bool_or(l.qty is not null)) or ((v.basis_kg is null) <> bool_and(l.qty is null))', 'having false']]]]);
    t.same([control[1], control[2].recipe_quantities_mode, broken[1], broken[2].recipe_quantities_mode, blind[2].recipe_quantities_mode],
      ['active', 0, 'active', 1, 0], 'طفرة: التفعيل يُبقي أساس نسخة بلا كميات ← recipe_quantities_mode = 1 (والضابط صفر)، وبفحص مكسور لا يُعدّ');
    // (ب) سطر بلا كمية في نسخة مفعَّلة بكميات (زرعٌ بالمالك بلا حارس) ← الفحص ١٦ يعدّها خلطاً.
    const mixed = await mutant(db, U.owner, [], async ({ oq }) => {
      await oq('alter table public.recipe_lines disable trigger recipe_lines_guard');
      await oq('update public.recipe_lines set qty = null where version_id = $1 and line_no = 1', [R.breeder.version]);
      await oq('alter table public.recipe_lines enable trigger recipe_lines_guard');
      return checks(oq);
    });
    t.same([mixed.recipe_quantities_mode, mixed.recipe_basis_mismatch], [1, 1], 'نسخة مفعَّلة بسطر بلا كمية: الفحص ١٦ يعدّها (والفحص ٢ مجموعها ناقص)');
    // (ج) الفحص ٢ بلا تخطّي النسخة بلا أساس ← يعدّ كلّ خلطة بالموادّ خرقاً.
    const noSkip = await mutant(db, U.owner, [[FN.verify, [["where v.status <> 'draft' and v.basis_kg is not null\n", "where v.status <> 'draft'\n"]]]], ({ oq }) => checks(oq));
    t.ok(noSkip.recipe_basis_mismatch >= 4, `طفرة: الفحص ٢ بلا تخطّي الأساس الفارغ يعدّ الخلطات بالموادّ (${noSkip.recipe_basis_mismatch})`);
  });

  // ── ١١) طريق رفض التراجع على هذه القاعدة ───────────────────────────────────────────────────────────────────────────
  await section('التراجع', async () => {
    const block = /\ndo \$\$[\s\S]*?\n\$\$;\n/u.exec(ROLLBACK)?.[0];
    const refused = await mutant(db, U.owner, [], async ({ oq }) => {
      try {
        await oq(block);
        return 'كمل';
      } catch (error) {
        return [error.message, error.hint];
      }
    });
    t.same([refused[0], /دفعة إنتاج حُفظت موادّها/u.test(refused[1] ?? '')], ['rollback_blocked', true],
      'التراجع يرفض بصوت على قاعدة فيها دفعة حُفظت موادّها في خلطتها');
  });

  if (process.env.MILL4_SAMPLES_OUT) {
    // stale_preview لا يُستخرج بنداء حتمي (سباقان متتاليان داخل نداء واحد): جملته من نصّ الهجرة نفسه، الموضع الوحيد الذي يرفعها به produce_batch.
    const stale = [...MIGRATION.matchAll(/raise exception 'stale_preview' using hint = '([^']+)'/gu)].map((m) => m[1]);
    if (stale.length !== 1) throw new Error(`stale_preview في 0025: ${stale.length} موضع`);
    samples.refusals.stale_preview = { code: 'stale_preview', hint: stale[0] };
    const target = ['1', 'true'].includes(process.env.MILL4_SAMPLES_OUT) ? SAMPLES_DEFAULT : process.env.MILL4_SAMPLES_OUT;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify({ generated_by: `supabase/tests/mill4.test.mjs (embedded Postgres 17، اليوم المثبَّت ${TODAY})`, ids: { recipes: R, items: I, warehouses: W }, ...samples }, null, 2)}\n`);
  }
}
