// مراجعة المعمل v2 (0016؛ المواصفة scratchpad/mill2/fixes.md القسم أ، ق١–ق١٦، والملاحظات #0–#14 و#19 و#20 بنصّها وإثباتها):
// كلّ إصلاح بفحص يفشل على الهجرة كما كانت عند 4d36b0d وينجح بعده، وطفرة حقيقية تكسر فحصه بالضبط: الدالّة أو السياسة مكسورة بمعاملة
// ترجع (attempt بنقطة حفظ يرجّع الرمز بدل أن يوقف المعاملة)، والقفل (ق١) بجلسات حقيقية وطفرة مثبَّتة يُعاد جسمها كما كان بـfinally،
// لأنّ جلسة أخرى لا ترى معاملة لم تُثبَّت. منشأة هذا الملف وحدها (المعرّفات c2170000 والهواتف 96477992170). كلّ قسم بـsection: رمية
// فيه فحص فاشل باسمه ولا توقف الملف. الأرقام محسوبة باليد بالتعليق جنب كلّ واحد.
// والجولة الثانية (scratchpad/mill2/fixes2.md القسم أ، ق٢١–ق٢٧) بأقسامها في آخر الملف، وكلّ فحص منها يفشل على 0016 كما كانت عند
// 203bacb؛ والفحوص التي ثبّتت السلوك القديم (ق٢، وق١١ وق١٥، وطفرتا ق٣) حُدّثت بأسماء تقول الجديد.
import { readFileSync } from 'node:fs';

/** نصّ 0016 نفسه (جملة ملء لقطة «داخل الكتلة» تُشغَّل كما هي، ق٢٢). */
const MIGRATION_0016 = readFileSync(new URL('../migrations/0016_mill_v2.sql', import.meta.url), 'utf8');

const TODAY = '2026-11-04';
const id = (n) => `c2170000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477992170${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
let refs = 0;
const ref = () => id(90000 + (refs += 1));
let seq = 0;
const fresh = () => id(20000 + (seq += 1));

const U = {
  owner: id(1),
  manager: id(2),
  miller: id(3),
  accountant: id(4),
  keeper: id(5),
  accGen: id(6), // محاسب نطاقه وحدة «المخازن العامة»
  accRaw: id(7), // محاسب نطاقه مخزن المواد الأوّلية وحده
  mgrRaw: id(8), // مدير نطاقه مخزن المواد الأوّلية وحده
  keepFeed: id(9), // أمين نطاقه مخزن العلف وحده (ق٢٥)
  accFeed: id(10), // محاسب نطاقه مخزن العلف وحده (ق٢٥)
  keepGen: id(11), // أمين نطاقه المخزن العام وحده: لا طرف له في دفعات المعمل (ق٢٥)
};

/** المفاتيح بترتيب ثابت (jsonb يرتّبها بطولها): المقارنة بالقيم لا بترتيب المفاتيح. */
const canon = (value) =>
  Array.isArray(value)
    ? value.map(canon)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canon(value[key])]))
      : value;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const section = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${label}: رمى ${error.message}`);
    }
  };
  for (const [i, user] of Object.values(U).entries()) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [user, phone(i + 1)]);
  }
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة مراجعة المعمل', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [U.owner])).rows[0].org_id;
  const one = async (user, sql, params = []) => Object.values((await db.asUser(user, (q) => q(sql, params), { commit: true })).rows[0] ?? {})[0];
  /** نداء بمعاملة تثبت إذا نجح: { ok, v, rows } أو { ok: false, code, hint }. */
  const call = async (user, sql, params = []) => {
    try {
      const result = await db.asUser(user, (q) => q(sql, params), { commit: true });
      return { ok: true, v: result.rows[0] ? Object.values(result.rows[0])[0] : null, rows: result.rows };
    } catch (error) {
      return { ok: false, code: error.message, hint: error.hint ?? null };
    }
  };
  const code = (outcome) => (outcome.ok ? 'ok' : outcome.code);
  const must = async (user, sql, params = []) => {
    const out = await call(user, sql, params);
    if (!out.ok) throw new Error(`${sql.slice(0, 60)}: ${out.code} ${out.hint ?? ''}`);
    return out.v;
  };
  const nonZero = async (fn = 'verify_mill') =>
    Object.fromEntries((await db.admin(`select check_name, violations::int as n from public.${fn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));

  const division = async (kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const MILL = await division('feed_mill');
  const GENERAL = await division('general');
  const wh = async (kind) => (await db.admin('select id from public.warehouses where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const RAW = await wh('raw');
  const FEEDWH = await wh('feed');
  const GENWH = await wh('general');
  const MILL_SITE = (await db.admin('select site_id from public.warehouses where id = $1', [RAW])).rows[0].site_id;

  const invite = async (user, n, role, label, divisions = [], warehouses = []) => {
    const member = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[]) as id', [local(phone(n)), role, label, divisions, [], warehouses]);
    await db.acceptInvite(U.owner, user, member);
  };
  await invite(U.manager, 2, 'manager', 'المدير');
  await invite(U.miller, 3, 'mill_operator', 'مشغّل المعمل', [MILL]);
  await invite(U.accountant, 4, 'accountant', 'المحاسب');
  await invite(U.keeper, 5, 'storekeeper', 'الأمين');
  await invite(U.accGen, 6, 'accountant', 'محاسب العامة', [GENERAL]);
  await invite(U.accRaw, 7, 'accountant', 'محاسب المواد', [], [RAW]);
  await invite(U.mgrRaw, 8, 'manager', 'مدير المواد', [], [RAW]);
  await invite(U.keepFeed, 9, 'storekeeper', 'أمين العلف', [], [FEEDWH]);
  await invite(U.accFeed, 10, 'accountant', 'محاسب العلف', [], [FEEDWH]);
  await invite(U.keepGen, 11, 'storekeeper', 'أمين المخزن العام', [], [GENWH]);
  await must(U.manager, 'select public.set_division_go_live($1, public.app_today() - 10)', [MILL]);
  await must(U.manager, 'select public.set_division_go_live($1, public.app_today() - 10)', [GENERAL]);
  // مخزن مواد ثانٍ بموقع المعمل (وحدة المعمل)، خارج نطاق محاسب المواد ومدير المواد (#11 و#13).
  const RAW2 = await must(U.manager, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن المواد الثاني', 'raw') returning id", [MILL, MILL_SITE]);

  // ─── المواد والمورّد والصندوق ────────────────────────────────────────────────────────────────────────────────
  const item = (name, kind, unit, density = null, tracks = false) =>
    must(U.manager, 'insert into public.items (name, kind, base_unit, density_kg_per_l, tracks_expiry) values ($1, $2, $3, $4, $5) returning id', [name, kind, unit, density, tracks]);
  const CORN = await item('ذرة المراجعة', 'raw', 'kg');
  const SOY = await item('صويا المراجعة', 'raw', 'kg');
  const BRAN = await item('نخالة المراجعة', 'raw', 'kg');
  const WHEAT = await item('حنطة المراجعة', 'raw', 'kg');
  const OIL = await item('زيت المراجعة', 'raw', 'L', 0.92);
  const DIESEL = await item('كاز المولّدة', 'fuel', 'L', 0.85);
  const FEED = await item('علف المراجعة', 'feed', 'kg');
  const FEEDX = await item('علف بصلاحية', 'feed', 'kg', null, true);
  const FEED14 = await item('علف آخر دفعة', 'feed', 'kg');
  const supplier = await must(U.manager, "insert into public.parties (name, is_supplier) values ('مورّد المراجعة', true) returning id");
  const BOX = await must(U.manager, "insert into public.cash_accounts (name, kind) values ('صندوق المراجعة', 'cash') returning id");
  const category = (name) => must(U.manager, 'insert into public.expense_categories (name) values ($1) returning id', [name]);

  /** استلام مرحَّل بكمية وحدة الأساس ومبلغ السطر: دفعة بسعرها. يرجّع معرّف المستند. */
  const receive = async (warehouse, itemId, qty, total) => {
    const doc = await must(U.manager, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [supplier, warehouse]);
    await must(U.manager, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3) returning id', [doc, itemId, qty]);
    await must(U.manager, 'insert into public.receipt_line_amounts (line_id, line_total) select id, $2 from public.receipt_lines where doc_id = $1 returning line_id', [doc, total]);
    await must(U.manager, 'select public.post_receipt($1, (select version from public.receipts where id = $1), $2)', [doc, ref()]);
    return doc;
  };
  // الذرة دفعة واحدة كبيرة بسعر موحّد 900 للكيلو: قيمة كلّ سحب بالكمية وحدها، فبصمة المعاينة لا تتغيّر بين جلسات السباق (ق١).
  await receive(RAW, CORN, 50000, 45000000);
  await receive(RAW, SOY, 2000, 3000000); // 1,500 للكيلو
  await receive(RAW, BRAN, 2000, 1000000); // 500 للكيلو
  await receive(RAW, OIL, 500, 1150000); // 2,300 للتر
  const W1 = await receive(RAW, WHEAT, 30, 24000); // 800 للكيلو (ق١٦: الوجبة الأولى)
  const W2 = await receive(RAW, WHEAT, 1000, 850000); // 850 للكيلو (ق١٦: الثانية)
  // آخر شراء للذرة في المنشأة بمخزن المواد الثاني: 200 كغم بـ246,800 (1,234 للكيلو، #13).
  await receive(RAW2, CORN, 200, 246800);
  // الكاز وقود: يدخل مخزن المواد برصيد افتتاحي بيوم التشغيل (الاستلام لا يقبله فيه)، 200 لتر بـ200,000.
  const opening = await must(U.manager, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 10) returning id', [RAW]);
  await must(U.manager, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 200, 200000) returning id', [opening, DIESEL]);
  await must(U.manager, 'select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [opening, ref()]);

  /** خلطة مفعَّلة بنداء واحد: السطور [[مادّة، كمية، وحدة]] والمعدّلات [[فئة، مبلغ للطنّ]]. يرجّع { id, version }. */
  const recipe = async (name, lines, rates = [], output = FEED) => {
    const rid = fresh();
    const vid = fresh();
    await must(U.manager, 'select public.create_recipe($1, $2, $3, $4, 1000, $5::jsonb, $6::jsonb, true)', [
      rid, vid, name, output,
      JSON.stringify(lines.map(([itemId, qty, unit = 'kg']) => ({ item_id: itemId, qty, unit }))),
      JSON.stringify(rates.map(([cat, amount]) => ({ category_id: cat, amount_per_ton: amount }))),
    ]);
    return { id: rid, version: vid };
  };
  const batch = async (version, kg, user = U.manager, whIn = RAW) => {
    const bid = fresh();
    await must(user, 'select public.create_production($1, $2, $3, $4, $5, public.app_today())', [bid, version, kg, whIn, FEEDWH]);
    return bid;
  };
  const POST = "select public.post_production($1, (select version from public.production_batches where id = $1), coalesce($2, public.preview_production($1) ->> 'plan_token'), $3)";
  const post = (user, b) => call(user, POST, [b, null, ref()]);
  const preview = (user, b) => must(user, 'select public.preview_production($1)', [b]);
  const detail = (user, b) => must(user, 'select public.production_detail($1)', [b]);
  const weigh = (b, kg, reason = null) => call(U.manager, 'update public.production_batches set output_qty_kg = $2, shrink_reason = $3 where id = $1 returning version', [b, kg, reason]);
  const confirm = (user, b) => call(user, 'select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [b]);
  let expenses = 0;
  const expense = async (cat, amount, daysAgo, note = null) => {
    const eid = id(70000 + (expenses += 1));
    await must(U.accountant, "select public.record_expense($1, $2, $3, $4, public.app_today() - $5::int, 'cash', $6, null, null, null, null, null, $7, null, $8)",
      [eid, cat, MILL, amount, daysAgo, BOX, note, ref()]);
    return eid;
  };
  const inputRows = async (b) => (await db.admin(`select i.name, p.in_basis, p.planned_qty_base::text as qty, p.planned_mass_kg::text as mass, p.density_kg_per_l::text as d
    from public.production_inputs p join public.items i on i.id = p.item_id where p.batch_id = $1 order by p.line_no`, [b])).rows;

  /**
   * طفرة بمعاملة ترجع: أجسام الدوالّ من الكتالوج بمراسيها مستبدلة (كلّ مرساة مرّة واحدة بالضبط) وأوامر DDL، ثمّ السيناريو. as(user,
   * role) يبدّل الهويّة (authenticated حين تُفحص السياسات)، وattempt بنقطة حفظ يرجّع { ok, v } أو { ok: false, code } بلا أن يوقف المعاملة.
   */
  const mutated = (fns, ddl, run) =>
    db.asOwner(async (oq) => {
      for (const [signature, pairs] of fns) {
        const def = (await oq('select pg_get_functiondef($1::regprocedure) as d', [signature])).rows[0].d;
        let broken = def;
        for (const [from, to] of pairs) {
          if (broken.split(from).length !== 2) throw new Error(`طفرة ${signature}: المرساة ليست مرّة واحدة: ${from}`);
          broken = broken.split(from).join(to);
        }
        await oq(broken);
      }
      for (const statement of ddl) await oq(statement);
      const as = async (user, role = 'postgres') => {
        await oq(`set local role ${role}`);
        await oq("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: 'authenticated' })]);
      };
      const attempt = async (sql, params = []) => {
        await oq('savepoint mutant');
        try {
          const result = await oq(sql, params);
          await oq('release savepoint mutant');
          return { ok: true, v: result.rows[0] ? Object.values(result.rows[0])[0] : null, rows: result.rows };
        } catch (error) {
          await oq('rollback to savepoint mutant');
          return { ok: false, code: error.message, hint: error.hint ?? null };
        }
      };
      return run({ oq, as, attempt });
    }, U.manager);
  const POST_FN = 'public.post_production(uuid, integer, text, uuid)';
  const PREVIEW_FN = 'public.preview_production(uuid)';
  const CREATE_FN = 'public.create_production(uuid, uuid, numeric, uuid, uuid, date)';
  const R0 = await recipe('خلطة الذرة وحدها', [[CORN, 1000]]);

  // ─── ق٣ (#2): الوقود والتعبئة خارج كتلة المدخلات وأساس الخلطة ─────────────────────────────────────────────────
  const fuelId = fresh();
  const fuelVersion = fresh();
  await section('ق٣ الخلطة', async () => {
    const createRecipe = (rid, vid, name, lines) =>
      call(U.manager, "select public.create_recipe($1, $2, $3, $4, 1000, $5::jsonb, '[]'::jsonb, true)", [rid, vid, name, FEED, JSON.stringify(lines)]);
    // 983 ذرة + 20 لتر كاز (17 كغم بكثافة 0.85): المجموع بلا الكاز 983 ≠ 1,000.
    const short = await createRecipe(fresh(), fresh(), 'ذرة وكاز ناقصة', [{ item_id: CORN, qty: 983, unit: 'kg' }, { item_id: DIESEL, qty: 20, unit: 'L' }]);
    t.ok(code(short) === 'basis_mismatch' && /983/u.test(short.hint ?? '') && /الوقود والتعبئة/u.test(short.hint ?? ''),
      `خلطة 983 ذرة + 20 لتر كاز: basis_mismatch بالمجموع 983 والكاز خارج الكتلة (${code(short)} ${short.hint ?? ''})`);
    const full = await createRecipe(fuelId, fuelVersion, 'ذرة وكاز', [{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: DIESEL, qty: 20, unit: 'L' }]);
    t.same([code(full), full.v?.status, full.v?.lines], ['ok', 'active', 2], `خلطة 1,000 ذرة + 20 لتر كاز تتفعّل (الكاز خارج الأساس) (${full.hint ?? ''})`);
    const card = await must(U.manager, 'select public.recipe_detail($1, null)', [fuelId]);
    t.same([card.lines.map((l) => [l.item_name, l.in_basis]), card.mass_kg], [[['ذرة المراجعة', true], ['كاز المولّدة', false]], '1000.000'],
      'recipe_detail: in_basis لكلّ سطر، ومجموع الكتلة بلا الكاز 1,000.000');
  });
  await section('ق٣ الدفعة', async () => {
    // دفعة 1,000 كغم من الذرة وحدها، وكاز 20 لتراً يُضاف لها: in_basis = false والكتلة 17 كغم للعرض.
    const BF = await batch(R0.version, 1000);
    await must(U.miller, 'select public.add_production_input($1, $2, $3, 20, null, null)', [BF, fresh(), DIESEL]);
    t.same((await inputRows(BF)).map((r) => [r.name, r.in_basis, r.qty, r.mass]), [['ذرة المراجعة', true, '1000.000', '1000.000'], ['كاز المولّدة', false, '20.000', '17.000']],
      'add_production_input: الكاز سطر بـin_basis = false (كتلته 17 كغم خارج الهدر)');
    // الناتج 1,010 والكتلة 1,000 (بلا الكاز): الهدر −10 كغم سالب خارج المدى فيطلب سبباً (كان 1,017 − 1,010 = 7 كغم داخل المدى فيمرّ).
    await weigh(BF, 1010);
    const p = await preview(U.manager, BF);
    t.same([p.input_mass_kg, p.shrink_kg, p.shrink_ok, p.problems.map((x) => x.code)], ['1000.000', '-10.000', false, ['shrink_out_of_range']],
      'المعاينة: كتلة المدخلات 1,000.000 بلا الكاز، والهدر −10 كغم خارج المدى');
    t.eq(code(await post(U.manager, BF)), 'shrink_out_of_range', 'الترحيل بلا سبب: shrink_out_of_range');
    await weigh(BF, 1010, 'رطوبة الذرة زادت الوزن');
    t.eq(code(await post(U.manager, BF)), 'ok', 'الترحيل بسبب الفرق يمرّ');
    t.same((await db.admin('select input_mass_kg::text as m, shrink_kg::text as s from public.production_batches where id = $1', [BF])).rows[0], { m: '1000.000', s: '-10.000' },
      'الدفعة المرحَّلة: كتلة المدخلات 1,000.000 والهدر −10.000');
  });
  await section('ق٣ من الخلطة', async () => {
    // create_production من الخلطة بالكاز (500 كغم): الكاز 17 × 500 ÷ (1,000 × 0.85 × 0.1) = 100 خطوة ← 10.0 لتر، وكتلته 8.5 كغم، خارج الأساس.
    const BF2 = await batch(fuelVersion, 500);
    t.same((await inputRows(BF2)).map((r) => [r.name, r.in_basis, r.qty, r.mass]), [['ذرة المراجعة', true, '500.000', '500.000'], ['كاز المولّدة', false, '10.000', '8.500']],
      'create_production: سطر الكاز من الخلطة بـin_basis = false');
    t.same(await nonZero(), {}, 'verify_mill صفر (مجموع الأساس بلا الوقود والتعبئة)');
  });
  await section('ق٣ طفرات', async () => {
    const ACTIVATE_FN = 'public.activate_recipe_version(uuid, integer)';
    const INPUT_FN = 'public.add_production_input(uuid, uuid, uuid, numeric, uuid, text)';
    const m1 = await mutated([[INPUT_FN, [["i.kind not in ('fuel', 'packaging'), p_replaces is not null, v_reason, o.item_id);", 'true, p_replaces is not null, v_reason, o.item_id);']]]], [], async ({ attempt }) => {
      const b = fresh();
      await attempt('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [b, R0.version, RAW, FEEDWH]);
      await attempt('select public.add_production_input($1, $2, $3, 20, null, null)', [b, fresh(), DIESEL]);
      return (await attempt("select public.preview_production($1) ->> 'input_mass_kg'", [b])).v;
    });
    t.eq(m1, '117.000', 'طفرة: add_production_input يكتب in_basis = true للكاز ← الكتلة 117 بدل 100 (فحص الكتلة يفشل)');
    const m2 = await mutated([[ACTIVATE_FN, [["v_in := ln.kind not in ('fuel', 'packaging');", 'v_in := true;']]]], [], async ({ attempt }) => {
      const vid = fresh();
      const out = await attempt("select public.create_recipe($1, $2, 'ذرة وكاز بطفرة', $3, 1000, $4::jsonb, '[]'::jsonb, true) ->> 'status'",
        [fresh(), vid, FEED, JSON.stringify([{ item_id: CORN, qty: 983, unit: 'kg' }, { item_id: DIESEL, qty: 20, unit: 'L' }])]);
      return [code(out), out.v ?? null, (await attempt('select in_basis from public.recipe_lines where version_id = $1 and item_id = $2', [vid, DIESEL])).v];
    });
    t.same(m2, ['ok', 'active', true],
      'طفرة: التفعيل يعدّ الكاز في الأساس ← 983 + 17 تتفعّل ولقطة سطره in_basis = true (فحص basis_mismatch فوق يفشل؛ وverify_mill يقرأ اللقطة منذ ق٢٢ فلا يمسكها)');
    const m3 = await mutated([[CREATE_FN, [['v_qty, v_mass, coalesce(ln.in_basis, true));', 'v_qty, v_mass, true);']]]], [], async ({ attempt }) => {
      const b = fresh();
      await attempt('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [b, fuelVersion, RAW, FEEDWH]);
      return (await attempt('select in_basis from public.production_inputs where batch_id = $1 and item_id = $2', [b, DIESEL])).v;
    });
    t.eq(m3, true, 'طفرة: create_production يكتب in_basis = true لسطر الكاز من الخلطة');
  });

  // ─── ق٤ (#3): تعديل الكثافة بعد التفعيل لا يوقف الإنتاج ──────────────────────────────────────────────────────
  await section('ق٤', async () => {
    // 908 ذرة + 100 لتر زيت (100 × 0.92 = 92 كغم) = 1,000؛ اللقطة 0.9200 عند التفعيل، ثمّ الكثافة في المادّة 0.91.
    const RO = await recipe('ذرة وزيت', [[CORN, 908], [OIL, 100, 'L']]);
    await must(U.manager, 'update public.items set density_kg_per_l = 0.91 where id = $1 returning id', [OIL]);
    const BO = await batch(RO.version, 1000);
    // الزيت: 92 × 1,000 ÷ (1,000 × 0.92 × 0.1) = 1,000 خطوة ← 100.0 لتر، بلقطة 0.9200.
    t.same((await inputRows(BO)).map((r) => [r.name, r.qty, r.mass, r.d]), [['ذرة المراجعة', '908.000', '908.000', null], ['زيت المراجعة', '100.000', '92.000', '0.9200']],
      'الدفعة بعد تعديل الكثافة: لقطة الخلطة 0.9200 والمخطّط 100 لتر');
    const p = await preview(U.manager, BO);
    t.same([p.can_post, p.problems, p.input_mass_kg], [true, [], '1000.000'], 'المعاينة: تُرحَّل بلا مشكلة، والكتلة 1,000 بلقطة 0.92');
    const posted = await post(U.manager, BO);
    t.same([code(posted), posted.hint ?? null], ['ok', null], 'الترحيل يمرّ رغم أنّ كثافة المادّة صارت 0.91 (كان item_changed، والطيّ وإعادة الإنشاء يعيدان اللقطة نفسها)');
    t.eq((await db.admin('select input_mass_kg::text as m from public.production_batches where id = $1', [BO])).rows[0].m, '1000.000', 'كتلة الدفعة المرحَّلة بلقطة 0.92 (908 + 92)');
    const m = await mutated([[POST_FN, [['if r.item_base is distinct from r.base_unit then',
      "if r.item_base is distinct from r.base_unit or (r.base_unit = 'L' and r.item_density is distinct from r.density_kg_per_l) then"]]]], [], async ({ attempt }) => {
      const b = fresh();
      await attempt('select public.create_production($1, $2, 1000, $3, $4, public.app_today())', [b, RO.version, RAW, FEEDWH]);
      return code(await attempt(POST, [b, null, ref()]));
    });
    t.eq(m, 'item_changed', 'طفرة: الترحيل يقارن اللقطة بكثافة المادّة الحالية ← item_changed');
    await must(U.manager, 'update public.items set density_kg_per_l = 0.92 where id = $1 returning id', [OIL]);
  });

  // ─── ق٥ (#4): إعادة create_recipe تعرف نتيجتها هي ──────────────────────────────────────────────────────────────
  await section('ق٥', async () => {
    const createRecipe = (rid, vid, lines, rates, activate, basis = 1000, name = 'خلطة الإعادة') =>
      call(U.manager, 'select public.create_recipe($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)', [rid, vid, name, FEED, basis, JSON.stringify(lines), JSON.stringify(rates), activate]);
    const R = fresh();
    const V = fresh();
    const corn1000 = [{ item_id: CORN, qty: 1000, unit: 'kg' }];
    const first = await createRecipe(R, V, corn1000, [], true);
    t.same([first.v?.status, first.v?.lines, first.v?.rates], ['active', 1, 0], 'create_recipe: الخلطة مفعَّلة بسطر ذرة');
    const changed = await createRecipe(R, V, [{ item_id: CORN, qty: 600, unit: 'kg' }, { item_id: SOY, qty: 400, unit: 'kg' }], [{ category_id: await category('أيدي عاملة الإعادة'), amount_per_ton: 5000 }], true);
    t.same([code(changed), changed.hint], ['id_conflict', 'حُفظت هذه الخلطة بمحاولة سابقة بمحتوى غير الذي أرسلته الآن. افتحها لترى ما حُفظ.'],
      'الإعادة بالمعرّفين نفسيهما بسطور ومعدّل آخرين: id_conflict (كانت «نجحت» بالجواب الأوّل وضاعت السطور الجديدة)');
    const qtyOnly = await createRecipe(R, V, [{ item_id: CORN, qty: 900, unit: 'kg' }], [], true);
    t.eq(code(qtyOnly), 'id_conflict', 'الإعادة بالمادّة نفسها بكمية أخرى: id_conflict');
    t.eq(code(await createRecipe(R, V, [{ item_id: CORN, qty: 900, unit: 'kg' }], [], true, 900)), 'id_conflict', 'الإعادة بأساس آخر: id_conflict');
    t.eq(code(await createRecipe(R, V, corn1000, [], false)), 'id_conflict', 'الإعادة بالمحتوى نفسه بلا تفعيل والمحفوظ مفعَّل: id_conflict');
    const same = await createRecipe(R, V, [{ item_id: CORN.toUpperCase(), qty: '1000.000' }], [], true);
    t.same(canon(same.v), canon(first.v), 'الإعادة بالمحتوى نفسه (الكمية نصّاً بمراتب، والمعرّف بحروف كبيرة، والوحدة الافتراضية): الجواب الأوّل نفسه');
    const D = fresh();
    const DV = fresh();
    const labor = await category('أيدي عاملة المسوّدة');
    const power = await category('كهرباء المسوّدة');
    const rates = [{ category_id: labor, amount_per_ton: 100 }, { category_id: power, amount_per_ton: 200 }];
    const draft = await createRecipe(D, DV, [{ item_id: CORN, qty: 500, unit: 'kg' }], rates, false, 1000, 'خلطة المسوّدة');
    t.same([draft.v?.status, draft.v?.lines, draft.v?.rates], ['draft', 1, 2], 'مسوّدة بسطر ومعدّلين');
    t.eq(code(await createRecipe(D, DV, [{ item_id: CORN, qty: 1000, unit: 'kg' }], rates, true, 1000, 'خلطة المسوّدة')), 'id_conflict', 'مسوّدة ثمّ إعادة بالتفعيل وذرة 1,000: id_conflict (كانت ok بحالة draft)');
    t.eq(code(await createRecipe(D, DV, [{ item_id: CORN, qty: 500, unit: 'kg' }], rates, true, 1000, 'خلطة المسوّدة')), 'id_conflict', 'مسوّدة ثمّ إعادة بالمحتوى نفسه مع التفعيل: id_conflict');
    t.eq(code(await createRecipe(D, DV, [{ item_id: CORN, qty: 500, unit: 'kg' }], [rates[1], rates[0]], false, 1000, 'خلطة المسوّدة')), 'id_conflict', 'المعدّلان بترتيب آخر: id_conflict');
    t.same(canon((await createRecipe(D, DV, [{ item_id: CORN, qty: 500, unit: 'kg' }], [{ category_id: labor, amount_per_ton: '100.00' }, rates[1]], false, 1000, 'خلطة المسوّدة')).v), canon(draft.v),
      'إعادة المسوّدة بمحتواها نفسه: الجواب الأوّل');
    const m = await mutated([['public.create_recipe(uuid, uuid, text, uuid, numeric, jsonb, jsonb, boolean)', [
      ['trim_scale(l.qty)::text, l.unit)', 'l.unit)'],
      ["case when coalesce(x.value ->> 'qty', '') ~ v_number then trim_scale((x.value ->> 'qty')::numeric)::text else x.value ->> 'qty' end,\n", ''],
    ]]], [], async ({ attempt }) => code(await attempt('select public.create_recipe($1, $2, $3, $4, 1000, $5::jsonb, $6::jsonb, true)',
      [R, V, 'خلطة الإعادة', FEED, JSON.stringify([{ item_id: CORN, qty: 900, unit: 'kg' }]), '[]'])));
    t.eq(m, 'ok', 'طفرة: فرع الإعادة يقارن المادّة بلا كميتها ← الكمية الأخرى «تنجح» (فحص id_conflict يفشل)');
  });

  // ─── ق٦ (#5): إعادة add_production_input تعرف نتيجتها هي ─────────────────────────────────────────────────────
  await section('ق٦', async () => {
    const B = await batch(R0.version, 100, U.miller);
    const add = (lineId, itemId, qty, replaces = null, reason = null) =>
      call(U.miller, 'select public.add_production_input($1, $2, $3, $4, $5, $6)', [B, lineId, itemId, qty, replaces, reason]);
    const X = fresh();
    const added = await add(X, BRAN, 50);
    t.same([code(added), added.v?.line_no], ['ok', 2], 'نخالة 50 كغم سطراً ثانياً');
    const other = await add(X, BRAN, 80);
    t.same([code(other), other.hint],
      ['id_conflict', 'أُضيفت هذه المادّة بمحاولة سابقة بكمية أو سبب غير الذي أرسلته الآن. حدّث الصفحة لترى ما حُفظ وعدّل كميتها الفعلية.'],
      'الإعادة بالمعرّف نفسه وكمية 80: id_conflict (كانت «نجحت» والسطر بكميته الأولى 50)');
    t.same([canon((await add(X, BRAN, 50)).v), canon((await add(X, BRAN, 50.04)).v)], [canon(added.v), canon(added.v)],
      'الإعادة بالكمية نفسها، وبكمية تصير هي بعد خطوة العدّاد (50.04 ← 50.0): الجواب نفسه');
    const cornLine = (await db.admin('select id from public.production_inputs where batch_id = $1 and item_id = $2', [B, CORN])).rows[0].id;
    t.eq(code(await add(X, BRAN, 50, cornLine, 'نفدت الذرة')), 'id_conflict', 'الإعادة نفسها لكن تبديلاً بسبب: id_conflict');
    const Y = fresh();
    t.eq(code(await add(Y, WHEAT, 100, cornLine, '  نفدت الذرة من المخزن  ')), 'ok', 'التبديل: الحنطة بدل الذرة بسببها');
    t.eq(code(await add(Y, WHEAT, 100, cornLine, 'نفدت الذرة من المخزن')), 'ok', 'إعادة التبديل بالسبب نفسه بعد التشذيب: الجواب نفسه');
    t.eq(code(await add(Y, WHEAT, 100, cornLine, 'سبب آخر تماماً')), 'id_conflict', 'إعادة التبديل بسبب آخر: id_conflict');
    const m = await mutated([['public.add_production_input(uuid, uuid, uuid, numeric, uuid, text)', [['x.planned_qty_base is distinct from v_qty or ', '']]]], [],
      async ({ as, attempt }) => {
        await as(U.miller);
        return code(await attempt('select public.add_production_input($1, $2, $3, 80, null, null)', [B, X, BRAN]));
      });
    t.eq(m, 'ok', 'طفرة: فرع الإعادة بلا مقارنة الكمية ← كمية 80 «تنجح» (فحص id_conflict يفشل)');
  });

  // ─── ق٧ (#6): مدى الهدر بالنسبة المضبوطة ──────────────────────────────────────────────────────────────────────
  await section('ق٧', async () => {
    const B = await batch(R0.version, 1000);
    const look = async (kg) => {
      await weigh(B, kg);
      const p = await preview(U.manager, B);
      return [p.shrink_kg, p.shrink_pct, p.shrink_ok, p.problems.some((x) => x.code === 'shrink_out_of_range')];
    };
    // كتلة المدخلات 1,000: 969.960 هدر 30.040 = 3.004٪ (يُعرض 3.00) خارج المدى؛ 1000.040 هدر −0.040 (−0.004٪، يُعرض 0.00) خارج؛
    // 970.000 هدر 30 = 3٪ بالضبط داخل؛ 1000.000 صفر داخل.
    t.same(
      [await look(969.96), await look(1000.04), await look(970), await look(1000)],
      [['30.040', '3.00', false, true], ['-0.040', '0.00', false, true], ['30.000', '3.00', true, false], ['0.000', '0.00', true, false]],
      'حدود الهدر بالنسبة المضبوطة: 3.004٪ و−0.004٪ خارج المدى (كانتا تمرّان بالنسبة المقرّبة)، و3٪ وصفر داخله',
    );
    await weigh(B, 969.96);
    t.eq(code(await post(U.manager, B)), 'shrink_out_of_range', 'الترحيل بهدر 3.004٪ بلا سبب: shrink_out_of_range');
    await weigh(B, 1000.04);
    t.eq(code(await post(U.manager, B)), 'shrink_out_of_range', 'الترحيل بهدر −0.004٪ بلا سبب: shrink_out_of_range');
    await weigh(B, 970);
    t.eq(code(await post(U.manager, B)), 'ok', 'الترحيل بهدر 3٪ بالضبط يمرّ');
    const m = await mutated([['private.shrink_ok(numeric, numeric)', [['p_mass > 0 and p_shrink >= 0 and p_shrink * 100 <= 3 * p_mass', 'private.shrink_in_range(private.shrink_pct(p_shrink, p_mass))']]]], [],
      async ({ oq, attempt }) => {
        const b = fresh();
        await attempt('select public.create_production($1, $2, 1000, $3, $4, public.app_today())', [b, R0.version, RAW, FEEDWH]);
        await oq('update public.production_batches set output_qty_kg = 969.96 where id = $1', [b]);
        return (await attempt("select (public.preview_production($1) ->> 'shrink_ok')::boolean", [b])).v;
      });
    t.eq(m, true, 'طفرة: المدى بالنسبة المقرّبة لمرتبتين ← هدر 3.004٪ «داخل المدى»');
  });

  // ─── ق٨ (#9): الناتج لا يولد منتهياً ─────────────────────────────────────────────────────────────────────────
  await section('ق٨', async () => {
    const RX = await recipe('علف بصلاحية', [[CORN, 1000]], [], FEEDX);
    const BX = await batch(RX.version, 100, U.miller);
    await must(U.miller, 'update public.production_batches set output_expiry_on = public.app_today() - 30 where id = $1 returning id', [BX]);
    const p = await preview(U.manager, BX);
    t.same([p.problems.filter((x) => x.code === 'output_expired').map(canon), p.can_post],
      [[canon({ code: 'output_expired', expiry_on: '2026-10-05', produced_on: '2026-11-04' })], false],
      'المعاينة: output_expired بالتاريخين، ولا ترحيل');
    const refused = await post(U.manager, BX);
    t.same([code(refused), refused.hint], ['output_expired', 'تاريخ انتهاء «علف بصلاحية» (05/10/2026) قبل يوم الإنتاج (04/11/2026). صحّح التاريخ قبل الترحيل.'],
      'الترحيل يرفض output_expired بالتاريخين (كان يرحّل علفاً منتهياً كلّه)');
    const m = await mutated([[POST_FN, [['if private.lot_expired(o.tracks_expiry, d.output_expiry_on, d.produced_on) then', 'if false then']]]], [],
      async ({ attempt }) => code(await attempt(POST, [BX, null, ref()])));
    t.eq(m, 'ok', 'طفرة: الترحيل بلا فحص الانتهاء ← دفعة منتهية تُرحَّل');
    await must(U.miller, 'update public.production_batches set output_expiry_on = public.app_today() + 60 where id = $1 returning id', [BX]);
    const fixed = await preview(U.manager, BX);
    t.same([fixed.problems, fixed.can_post, code(await post(U.manager, BX))], [[], true, 'ok'], 'بعد تصحيح التاريخ: بلا مشكلة، والترحيل يمرّ');
  });

  // ─── ق٩ (#10): تقريب واحد للمخطّط ─────────────────────────────────────────────────────────────────────────────
  await section('ق٩', async () => {
    const R9 = await recipe('ذرة ونخالة بالثلث', [[CORN, 333.333], [BRAN, 666.667]]);
    const B9 = await batch(R9.version, 489.75, U.miller);
    // الذرة: 333.333 × 489.75 ÷ (1,000 × 0.1) = 1,632.4983675 ← 1,632 خطوة = 163.2 (كانت 163.250 ثمّ 163.3)؛ والكتلة للعرض 163.250.
    // النخالة: 666.667 × 489.75 ÷ 100 = 3,265.0016… ← 3,265 = 326.5.
    t.same((await inputRows(B9)).map((r) => [r.name, r.qty, r.mass]), [['ذرة المراجعة', '163.200', '163.250'], ['نخالة المراجعة', '326.500', '326.500']],
      'المخطّط بتقريب واحد لخطوة العدّاد: الذرة 163.2 لا 163.3');
    const m = await mutated([[CREATE_FN, [['v_qty := case when ln.scale_step is null',
      "v_qty := case when true then private.round_step(case when ln.base_unit = 'kg' then v_mass else private.kg_to_liters(v_mass, v_density) end, ln.scale_step) when ln.scale_step is null"]]]], [],
      async ({ attempt }) => {
        const b = fresh();
        await attempt('select public.create_production($1, $2, 489.75, $3, $4, public.app_today())', [b, R9.version, RAW, FEEDWH]);
        return (await attempt('select planned_qty_base::text from public.production_inputs where batch_id = $1 and item_id = $2', [b, CORN])).v;
      });
    t.eq(m, '163.300', 'طفرة: التقريب مرّتين (الكتلة لثلاث مراتب ثمّ للخطوة) ← 163.3');
  });

  // ─── ق٢ (#1 و#8 و#14): الختم بنطاقه وبكفاية المصاريف ──────────────────────────────────────────────────────────
  await section('ق٢', async () => {
    const RENT = await category('إيجار المعمل');
    const RC = await recipe('خلطة الإيجار', [[CORN, 1000]], [[RENT, 60000]]);
    const BC = await batch(RC.version, 100, U.miller); // إيجار 60,000 × 100 ÷ 1,000 = 6,000.00، ولا مصروف إيجار بعد.
    const open = async (b) => (await db.admin('select costs_confirmed_at is null as open from public.production_batches where id = $1', [b])).rows[0].open;
    t.eq(code(await confirm(U.accGen, BC)), 'out_of_scope', 'محاسب محصور بوحدة «المخازن العامة» لا يختم كلف دفعة بمخزن المعمل (كان يختمها)');
    const unfunded = await confirm(U.accountant, BC);
    t.same([code(unfunded), unfunded.hint, await open(BC)],
      ['expense_overloaded', 'إيجار المعمل: المطلوب 6,000 والمتاح من المصاريف المسجّلة 0. سجّل المصروف أوّلاً أو قلّل المبلغ.', true],
      'ختم بلا مصروف يكفي: expense_overloaded بأرقامه للمحاسب، والدفعة بلا ختم');
    const scoped = await confirm(U.accRaw, BC);
    t.same([code(scoped), scoped.hint], ['out_of_scope', 'تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «معمل العلف» خارج نطاقك، فيكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.'],
      'محاسب المواد (مخزن المدخلات بنطاقه بلا وحدته): out_of_scope بتلميح يسمّي الوحدة (ق٢١؛ كان expense_overloaded بلا أرقام)');
    const mScope = await mutated([['public.confirm_production_costs(uuid, integer)', [
      ['wi := private.stock_wh(d.input_warehouse_id, true);', 'wi := private.stock_wh(d.input_warehouse_id, false);'],
      ['if not public.in_scope_division(wi.division_id) then', 'if false then'],
    ]]], [],
      async ({ as, attempt }) => {
        await as(U.accGen);
        return code(await attempt('select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [BC]));
      });
    t.same(mScope, 'expense_overloaded', 'طفرة: الختم بلا نطاق المخزن ولا الوحدة ← المحاسب المحصور بوحدة أخرى يصل فحص المصاريف (لا out_of_scope)');
    const mFunds = await mutated([['public.confirm_production_costs(uuid, integer)', [['if c.amount > v_free then', 'if false then']]]], [],
      async ({ as, attempt }) => {
        await as(U.accountant);
        return code(await attempt('select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [BC]));
      });
    t.eq(mFunds, 'ok', 'طفرة: الختم بلا فحص المصاريف ← يختم ما سيُرفض ترحيله');
    await expense(RENT, 6000, 2, 'إيجار الشهر');
    const sealed = await confirm(U.accountant, BC);
    t.same([code(sealed), sealed.v?.written, await open(BC)], ['ok', true, false], 'بمصروف كافٍ: الختم يُكتب');
    // ختم دفعة ثانية والمصروف ما زال يكفيها، ثمّ ترحيل الأولى يستهلكه: ترحيل مشغّل المعمل للثانية يُرفض بتلميح بلا أرقام.
    const BC2 = await batch(RC.version, 100, U.miller);
    t.eq(code(await confirm(U.accountant, BC2)), 'ok', 'ختم الدفعة الثانية والمصروف يكفيها لحظتها');
    t.eq(code(await post(U.manager, BC)), 'ok', 'ترحيل الأولى يحمّل الإيجار كلّه');
    const late = await post(U.miller, BC2);
    t.ok(code(late) === 'expense_overloaded' && /إيجار المعمل/u.test(late.hint ?? '') && !/[0-9]/u.test(late.hint ?? ''),
      `مشغّل المعمل بعد الختم والمصروف استُهلك: الترحيل يعيد الفحص تحت القفل فيرفض بلا أرقام (${late.hint})`);
  });

  // ─── ق١٣ (#19): «نسخة جديدة» تنسخ المفعَّلة ──────────────────────────────────────────────────────────────────
  await section('ق١٣', async () => {
    const labor = await category('أيدي عاملة النسخ');
    const power = await category('كهرباء النسخ');
    const R13 = await recipe('خلطة النسخ', [[CORN, 600], [SOY, 400]], [[labor, 5000], [power, 1500]]);
    const NEW = 'select public.new_recipe_version($1, $2)';
    const N1 = fresh();
    const made = await call(U.manager, NEW, [R13.id, N1]);
    t.same(canon(made.v), canon({ recipe_id: R13.id, version_id: N1, version_no: 2, status: 'draft', lines: 2, rates: 2, existing: false }),
      `new_recipe_version: مسوّدة بالمعرّف من الجهاز، النسخة الثانية بسطرَي المفعَّلة ومعدّليها (${made.code ?? ''} ${made.hint ?? ''})`);
    t.same(
      [(await db.admin('select item_id, qty::text as q, unit, line_no from public.recipe_lines where version_id = $1 order by line_no', [N1])).rows,
        (await db.admin('select category_id, amount_per_ton::text as a, line_no from public.recipe_cost_rates where version_id = $1 order by line_no', [N1])).rows,
        (await db.admin('select basis_kg::text as b from public.recipe_versions where id = $1', [N1])).rows[0]?.b],
      [[{ item_id: CORN, q: '600.000', unit: 'kg', line_no: 1 }, { item_id: SOY, q: '400.000', unit: 'kg', line_no: 2 }],
        [{ category_id: labor, a: '5000.00', line_no: 1 }, { category_id: power, a: '1500.00', line_no: 2 }],
        (await db.admin('select basis_kg::text as b from public.recipe_versions where id = $1', [R13.version])).rows[0].b],
      'المنسوخ بترتيبه: الذرة 600 والصويا 400، و«أيدي عاملة» 5,000 و«كهرباء» 1,500، والأساس أساس المفعَّلة',
    );
    t.same(canon((await call(U.manager, NEW, [R13.id, N1])).v), canon({ ...made.v, existing: true }), 'الإعادة بالمعرّف نفسه: النسخة نفسها (existing)');
    const N2 = fresh();
    const again = await call(U.manager, NEW, [R13.id, N2]);
    t.same([again.v?.version_id, again.v?.existing, (await db.admin('select count(*)::int as n from public.recipe_versions where id = $1', [N2])).rows[0].n], [N1, true, 0],
      'مسوّدة موجودة للخلطة: ترجع هي بمعرّفها بلا نسخ، والمعرّف الجديد لا يُستعمل');
    t.same([code(await call(U.miller, NEW, [R13.id, fresh()])), code(await call(U.keeper, NEW, [R13.id, fresh()])), code(await call(U.accountant, NEW, [R13.id, fresh()]))],
      ['forbidden', 'forbidden', 'forbidden'], 'new_recipe_version لفعل التفعيل: مشغّل المعمل والأمين والمحاسب ممنوعون');
    t.eq(code(await call(U.manager, NEW, [R0.id, N1])), 'id_conflict', 'معرّف نسخة لخلطة أخرى: id_conflict');
    const RA = await recipe('خلطة مؤرشفة', [[CORN, 1000]]);
    await must(U.manager, 'update public.recipes set archived_at = now() where id = $1 returning id', [RA.id]);
    t.eq(code(await call(U.manager, NEW, [RA.id, fresh()])), 'recipe_archived', 'الخلطة المؤرشفة: recipe_archived');
    const bare = await must(U.manager, "insert into public.recipes (name, output_item_id) values ('خلطة بلا نسخ', $1) returning id", [FEED]);
    const N3 = fresh();
    t.same(canon((await call(U.manager, NEW, [bare, N3])).v), canon({ recipe_id: bare, version_id: N3, version_no: 1, status: 'draft', lines: 0, rates: 0, existing: false }),
      'خلطة بلا نسخ: مسوّدة فارغة بالأساس الافتراضي');
    const activated = await call(U.manager, 'select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))', [N1]);
    t.same([code(activated), activated.v?.retired_id], ['ok', R13.version], 'المسوّدة المنسوخة تتفعّل كما هي وتقاعد النسخة الأولى');
    const m = await mutated([['public.new_recipe_version(uuid, uuid)', [['      insert into public.recipe_cost_rates (org_id, version_id, category_id, amount_per_ton) values (v_org, v.id, ln.category_id, ln.amount_per_ton);', '      null;']]]], [],
      async ({ attempt }) => (await attempt("select (public.new_recipe_version($1, $2) ->> 'rates')::int", [R13.id, fresh()])).v);
    t.eq(m, 0, 'طفرة: «نسخة جديدة» بلا المعدّلات ← صفر معدّلات بدل اثنين');
  });

  // ─── ق١٤ (#20): item_purchases يعرف آخر دفعة إنتاج ──────────────────────────────────────────────────────────
  await section('ق١٤', async () => {
    const R14 = await recipe('خلطة آخر دفعة', [[CORN, 1000]], [], FEED14);
    const B14a = await batch(R14.version, 100);
    const docA = (await post(U.manager, B14a)).v?.doc_no;
    const B14b = await batch(R14.version, 200);
    const docB = (await post(U.manager, B14b)).v?.doc_no;
    // المفتاح إلزامي (كائن أو null)؛ غيابه «absent» لا null، فالمقارنة تفرّق بينهما (JSON يكتب الغائب في مصفوفة null).
    const last = async (user, itemId, warehouse) => {
      const json = await must(user, 'select public.item_purchases($1, $2, null, 50)', [itemId, warehouse]);
      return 'last_production' in json ? json.last_production : 'absent';
    };
    const expectB = canon({ batch_id: B14b, doc_no: docB, produced_on: TODAY, qty_kg: '200.000', warehouse_name: 'مخزن العلف' });
    t.same([canon(await last(U.manager, FEED14, FEEDWH)), canon(await last(U.manager, FEED14, null)), canon(await last(U.miller, FEED14, FEEDWH))], [expectB, expectB, expectB],
      'last_production: آخر دفعة مرحَّلة ناتجها هذه المادّة (بمخزنه وبلا مخزن، ولمشغّل المعمل)');
    t.same([await last(U.manager, FEED14, RAW), await last(U.manager, CORN, null), await last(U.accRaw, FEED14, null)], [null, null, null],
      'null: مخزن آخر، ومادّة لا تُصنع، ومحاسب المواد (مخزن العلف خارج نطاقه)');
    await must(U.manager, "select public.void_production($1, 'وزن خاطئ', $2)", [B14b, ref()]);
    t.same(canon(await last(U.manager, FEED14, FEEDWH)), canon({ batch_id: B14a, doc_no: docA, produced_on: TODAY, qty_kg: '100.000', warehouse_name: 'مخزن العلف' }),
      'بعد إلغاء الأحدث: آخر دفعة مرحَّلة هي الأولى');
    const m = await mutated([['public.item_purchases(uuid, uuid, jsonb, integer)', [["b.status = 'posted'", "b.status <> 'draft'"]]]], [],
      async ({ attempt }) => (await attempt("select public.item_purchases($1, $2, null, 50) -> 'last_production' ->> 'batch_id'", [FEED14, FEEDWH])).v);
    t.eq(m, B14b, 'طفرة: الملغاة تُعدّ ← آخر دفعة هي الملغاة');
  });

  // ─── ق١٦: من أيّ وجبات سُحب كلّ سطر (draws) ───────────────────────────────────────────────────────────────────
  await section('ق١٦', async () => {
    const R16 = await recipe('خلطة الحنطة', [[WHEAT, 1000]]);
    const B16 = await batch(R16.version, 100);
    const draft = await detail(U.manager, B16);
    t.same(draft.lines.map((l) => ('draws' in l ? l.draws : 'absent')), [null], 'المسوّدة: draws = null (المفتاح موجود)');
    t.eq(code(await post(U.manager, B16)), 'ok', 'ترحيل دفعة الحنطة 100 كغم');
    const lot = async (doc) => (await db.admin("select id from public.stock_lots where source_kind = 'receipt' and source_id = $1", [doc])).rows[0].id;
    const docNo = async (doc) => (await db.admin('select doc_no from public.receipts where id = $1', [doc])).rows[0].doc_no;
    // الوجبة الأولى 30 كغم كلّها ثمّ 70 من الثانية، بترتيب السحب، بلا مال.
    const expected = [
      canon({ lot_id: await lot(W1), qty: '30.000', received_on: TODAY, source: await docNo(W1) }),
      canon({ lot_id: await lot(W2), qty: '70.000', received_on: TODAY, source: await docNo(W2) }),
    ];
    const posted = await detail(U.manager, B16);
    const millerView = await detail(U.miller, B16);
    t.same([posted.lines.map((l) => (l.draws ?? []).map(canon)), millerView.lines.map((l) => (l.draws ?? []).map(canon))], [[expected], [expected]],
      'المرحَّلة: draws لكلّ سطر من الوجبتين بكميتيهما ومصدريهما (رقم الاستلام)، ولمشغّل المعمل كذلك');
    await must(U.manager, "select public.void_production($1, 'خلطة خاطئة', $2)", [B16, ref()]);
    t.same((await detail(U.manager, B16)).lines.map((l) => (l.draws ?? []).map(canon)), [expected], 'الملغاة: السحوبات الأصلية نفسها (العكسيات لا تُعدّ وجبات)');
    const m = await mutated([['public.production_detail(uuid)', [["\n            and m.reverses_move_id is null and m.qty < 0), '[]'::jsonb) end,", "), '[]'::jsonb) end,"]]]], [],
      async ({ attempt }) => (await attempt("select jsonb_array_length(public.production_detail($1) -> 'lines' -> 0 -> 'draws')", [B16])).v);
    t.eq(m, 4, 'طفرة: كلّ حركات السطر بلا فرز ← أربع «وجبات» (السحبان وعكساهما)');
  });

  // ─── ق١٠ وق١١ وق١٢ وق١٥ (#11 و#12 و#13 و#16): النطاق ─────────────────────────────────────────────────────────
  const S = {};
  await section('النطاق: التجهيز', async () => {
    const LAB = await category('أيدي عاملة النطاق');
    const R = await recipe('خلطة النطاق', [[CORN, 1000]], [[LAB, 5000]]);
    await expense(LAB, 10000, 5, 'أجور سرّية للمعمل');
    const BR1 = await batch(R.version, 2000); // أيدي عاملة 10,000 ← تحميل 10,000 من المصروف الأوّل
    t.eq(code(await post(U.accountant, BR1)), 'ok', 'BR1 (مخزن المواد، 2,000 كغم) مرحَّلة بتحميل 10,000');
    await expense(LAB, 3000, 4, 'أجور الأسبوع');
    const BR3 = await batch(R.version, 100, U.manager, RAW2); // مخزن المواد الثاني: أيدي عاملة 500 من المصروف الثاني
    t.eq(code(await post(U.accountant, BR3)), 'ok', 'BR3 (مخزن المواد الثاني، 100 كغم) مرحَّلة بتحميل 500');
    const BR2 = await batch(R.version, 1000); // مسوّدة: أيدي عاملة 5,000 والمتاح 3,000 − 500 = 2,500
    Object.assign(S, { LAB, R, BR1, BR2, BR3 });
  });
  const TABLES = ['production_inputs', 'production_values', 'production_input_values', 'production_costs', 'production_cost_allocations'];
  await section('ق١٠', async () => {
    const { BR1, BR2, BR3 } = S;
    if (!BR3) throw new Error('تجهيز النطاق لم يكتمل');
    // الجداول الخمسة لكلّ قارئ، بعدد صفوف كلّ دفعة [BR1، BR2، BR3].
    const BATCHES = [BR1, BR2, BR3];
    const seen = (user) => db.asUser(user, async (q) => {
      const out = {};
      for (const table of TABLES) {
        const rows = (await q(`select batch_id, count(*)::int as n from public.${table} where batch_id = any ($1) group by batch_id`, [BATCHES])).rows;
        out[table] = BATCHES.map((b) => rows.find((r) => r.batch_id === b)?.n ?? 0);
      }
      return out;
    });
    const all = { production_inputs: [1, 1, 1], production_values: [1, 0, 1], production_input_values: [1, 0, 1], production_costs: [1, 1, 1], production_cost_allocations: [1, 0, 1] };
    const none = Object.fromEntries(TABLES.map((table) => [table, [0, 0, 0]]));
    const rawOnly = { production_inputs: [1, 1, 0], production_values: [1, 0, 0], production_input_values: [1, 0, 0], production_costs: [1, 1, 0], production_cost_allocations: [0, 0, 0] };
    t.same([await seen(U.manager), await seen(U.accountant)], [all, all], 'ضابط: المدير والمحاسب بلا نطاق يقرآن الجداول الخمسة كما كانت');
    t.same(await seen(U.accGen), none, 'محاسب «المخازن العامة»: صفر صفوف من سطور دفعات المعمل ومالها وتكاليفها وتحميلاتها (كان يقرأ التكاليف والتحميلات)');
    t.same([await seen(U.accRaw), await seen(U.mgrRaw)], [rawOnly, rawOnly],
      'محاسب المواد ومدير المواد: دفعتا مخزن المواد وحدهما، ولا تحميل (المصروف على وحدة المعمل خارج نطاقهما)');
    const MILL_TABLES = [...TABLES, 'production_batches'];
    const auditSeen = (user) => db.asUser(user, async (q) => (await q(`
      select table_name as t, coalesce(coalesce(new, old) ->> 'batch_id', coalesce(new, old) ->> 'id') as b, count(*)::int as n from public.audit_log
      where table_name = any ($1) and coalesce(coalesce(new, old) ->> 'batch_id', coalesce(new, old) ->> 'id') = any ($2::text[]) group by 1, 2 order by 1, 2`,
    [MILL_TABLES, BATCHES])).rows);
    const managerAudit = await auditSeen(U.manager);
    t.ok(['production_cost_allocations', 'production_batches', 'production_costs'].every((table) => managerAudit.some((r) => r.t === table && r.b === BR3)),
      `ضابط: المدير يقرأ سجلّ تدقيق الدفعات والتكاليف والتحميلات كلّها (${managerAudit.length} مجموعة)`);
    t.same(await auditSeen(U.accGen), [], 'محاسب «المخازن العامة»: ولا سطر تدقيق من جداول دفعات المعمل');
    const rawAudit = await auditSeen(U.accRaw);
    t.same(rawAudit.filter((r) => r.b === BR3 || r.t === 'production_cost_allocations'), [], 'محاسب المواد: ولا سطر تدقيق لدفعة مخزن المواد الثاني ولا لتحميل من مصاريف المعمل');
    t.ok(rawAudit.some((r) => r.t === 'production_costs' && r.b === BR1) && rawAudit.some((r) => r.t === 'production_batches' && r.b === BR2),
      'ضابط: محاسب المواد يقرأ سجلّ دفعات مخزنه وتكاليفها');
    /** طفرة سياسة: تُسقَط بمعاملة ترجع، ثمّ العدّ بهويّة القارئ ودور authenticated (فالسياسات تنطبق). */
    const asRole = (user, ddl, sql) => mutated([], [ddl], async ({ as, oq }) => {
      await as(user, 'authenticated');
      return (await oq(sql, [BATCHES])).rows[0].n;
    });
    t.same(
      [await asRole(U.accGen, 'drop policy production_costs_batch_scope on public.production_costs',
        'select count(*)::int as n from public.production_costs where batch_id = any ($1)'),
      await asRole(U.accRaw, 'drop policy production_cost_allocations_expense_scope on public.production_cost_allocations',
        'select count(*)::int as n from public.production_cost_allocations where batch_id = any ($1)'),
      await asRole(U.accGen, 'drop policy audit_log_mill_scope on public.audit_log',
        "select count(*)::int as n from public.audit_log where table_name = 'production_costs' and (coalesce(new, old) ->> 'batch_id') = any ($1::text[])")],
      [3, 1, 3],
      'طفرات: بلا نطاق دفعة التكاليف يقرأ محاسب العامة سطورها الثلاثة، وبلا نطاق المصروف يقرأ محاسب المواد تحميل BR1، وبلا نطاق السجلّ يقرأ محاسب العامة تدقيقها',
    );

    // من الكتالوج (فجدول جديد بمفتاح إلى الدفعات يدخل وحده): كلّ جدول يشير إلى production_batches بسياسة قراءة مقيِّدة تقرأ الدفعة، وسجلّ
    // التدقيق يسمّيه في سياسة نطاق المعمل. (فحص cost-leak يشتقّ الجداول المحصورة من سياسات in_scope_wh وحدها، فلا يرى هذه.)
    const batchScopeGaps = async (q) => {
      const tables = (await q(`select distinct c.relname as t from pg_constraint k join pg_class c on c.oid = k.conrelid
        where k.contype = 'f' and k.confrelid = 'public.production_batches'::regclass and c.relnamespace = 'public'::regnamespace order by 1`)).rows.map((r) => r.t);
      const policies = (await q("select tablename, policyname, permissive, cmd, qual from pg_policies where schemaname = 'public'")).rows;
      const audit = policies.find((p) => p.tablename === 'audit_log' && p.policyname === 'audit_log_mill_scope')?.qual ?? '';
      return {
        tables,
        gaps: tables.filter((table) => !policies.some((p) => p.tablename === table && p.permissive === 'RESTRICTIVE' && p.cmd === 'SELECT' && /production_batches/u.test(p.qual ?? ''))
          || !audit.includes(`'${table}'`)),
      };
    };
    const scopeCatalog = await batchScopeGaps(db.admin);
    t.same(scopeCatalog, { tables: TABLES.slice().sort(), gaps: [] }, 'الكتالوج: الجداول الخمسة التي تشير إلى الدفعات كلّها بنطاق دفعتها وفي سياسة سجلّ المعمل');
    const scopeProbe = await mutated([], ['drop policy production_input_values_batch_scope on public.production_input_values'], ({ oq }) => batchScopeGaps(oq));
    t.same(scopeProbe.gaps, ['production_input_values'], 'ضابط: سياسة نطاق تُسقَط فيسمّي الفحص جدولها');

  });
  await section('ق١١ وق١٥', async () => {
    const { LAB, BR1, BR2 } = S;
    if (!BR2) throw new Error('تجهيز النطاق لم يكتمل');
    // المعاينة والبطاقة والترحيل لمن لا يرى وحدة مخزن المدخلات.
    const fullView = await preview(U.accountant, BR2);
    t.same(
      [fullView.money.costs.map((c) => c.available), fullView.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.category_name, x.need, x.have])],
      [['2500.00'], [['أيدي عاملة النطاق', '5000.00', '2500.00']]],
      'ضابط: المحاسب بلا نطاق يرى المتاح 2,500 وcosts_unfunded بأرقامه',
    );
    for (const [label, user] of [['محاسب المواد', U.accRaw], ['مدير المواد', U.mgrRaw]]) {
      const view = await preview(user, BR2);
      t.same([view.money.costs.map((c) => ('available' in c ? c.available : 'absent')), view.problems.filter((x) => ['costs_unfunded', 'costs_unsealed_scope'].includes(x.code)).map(canon)],
        [[null], [canon({ code: 'costs_unsealed_scope', division_name: 'معمل العلف' })]],
        `${label} قبل الختم: available = null، وcosts_unsealed_scope تسمّي الوحدة لا costs_unfunded (ق٢١؛ كانت costs_unfunded بلا أرقام، وقبلها مجموع المصاريف)`);
      const refused = await post(user, BR2);
      t.same([code(refused), refused.hint], ['costs_unsealed_scope', 'تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «معمل العلف» خارج نطاقك، فتُرحَّل بعد أن يختمها محاسب أو مدير يرى تلك الوحدة.'],
        `${label}: الترحيل قبل الختم costs_unsealed_scope (ق٢١؛ كان expense_overloaded بلا أرقام)`);
    }
    const fullRefused = await post(U.accountant, BR2);
    t.same([code(fullRefused), fullRefused.hint], ['expense_overloaded', 'أيدي عاملة النطاق: المطلوب 5,000 والمتاح من المصاريف المسجّلة 2,500. سجّل المصروف أوّلاً أو قلّل المبلغ.'],
      'ضابط: تلميح المحاسب بلا نطاق بأرقامه');
    t.same(canon(fullView.input_warehouse), canon({ id: RAW, name: 'مخزن المواد الأوّلية', division_id: MILL, division_name: 'معمل العلف' }),
      'ق١٥: المعاينة تسمّي وحدة مخزن المدخلات (المصروف المؤهّل على وحدة «معمل العلف»)');
    const detailOf = async (user) => (await detail(user, BR1)).money.costs.map((c) => {
      if (!('allocations' in c)) return 'absent';
      return c.allocations === null ? null : c.allocations.map((a) => [a.amount, a.label]);
    });
    t.same([await detailOf(U.manager), await detailOf(U.accRaw), await detailOf(U.mgrRaw)], [[[['10000.00', 'أجور سرّية للمعمل']]], [null], [null]],
      'بطاقة الدفعة: التحميلات للمدير بملاحظة المصروف، وnull لمحاسب المواد ومدير المواد (لا مصفوفة)');
    const EXP_PAIR = [['v_exp := v_cost and public.in_scope_division(wi.division_id);', 'v_exp := v_cost;']];
    const mPreview = await mutated([[PREVIEW_FN, EXP_PAIR]], [], async ({ as, attempt }) => {
      await as(U.accRaw);
      return (await attempt("select public.preview_production($1) -> 'money' -> 'costs' -> 0 ->> 'available'", [BR2])).v;
    });
    const mPost = await mutated([[POST_FN, EXP_PAIR]], [], async ({ as, attempt }) => {
      await as(U.accRaw);
      return (await attempt(POST, [BR2, null, ref()])).hint;
    });
    const mDetail = await mutated([['public.production_detail(uuid)', [['v_exp := public.can_see_cost() and public.in_scope_division(', 'v_exp := public.can_see_cost() or public.in_scope_division(']]]], [],
      async ({ as, attempt }) => {
        await as(U.accRaw);
        return (await attempt("select jsonb_typeof(public.production_detail($1) -> 'money' -> 'costs' -> 0 -> 'allocations')", [BR1])).v;
      });
    t.same([mPreview, /[0-9]/u.test(mPost ?? ''), mDetail], ['2500.00', true, 'array'],
      'طفرات: الأرقام لمن يرى الكلفة وحده (بلا وحدة المدخلات) ← المتاح 2,500 في المعاينة، وأرقام في التلميح، ومصفوفة التحميلات في البطاقة');
    const mDivision = await mutated([[PREVIEW_FN, [["'division_name', (select dv.name from public.divisions dv where dv.org_id = v_org and dv.id = wi.division_id)),", "'division_name', wi.name),"]]]], [],
      async ({ attempt }) => (await attempt("select public.preview_production($1) -> 'input_warehouse' ->> 'division_name'", [BR2])).v);
    t.eq(mDivision, 'مخزن المواد الأوّلية', 'طفرة: اسم الوحدة من المخزن ← اسم المخزن لا «معمل العلف»');

    // الترحيل للمحصور بمخزن بعد الختم فقط (ق٢١، وكان مسموحاً قبله): مصروف ثالث 2,500 يكفي، فيختم المحاسب بلا نطاق ثمّ يرحّل محاسب المواد
    // (التحميل يكتبه النظام).
    await expense(LAB, 2500, 1, 'أجور إضافية');
    t.eq(code(await post(U.accRaw, BR2)), 'costs_unsealed_scope', 'محاسب المواد قبل الختم والمصاريف تكفي: costs_unsealed_scope (ق٢١؛ كان يرحّل)');
    t.eq(code(await confirm(U.accountant, BR2)), 'ok', 'المحاسب بلا نطاق يختم BR2');
    t.eq(code(await post(U.accRaw, BR2)), 'ok', 'بعد الختم يرحّل محاسب المواد (قرار ق٢١: الترحيل للمحصور بعد الختم فقط)');
    t.same((await db.admin('select created_by, sum(amount)::text as a from public.production_cost_allocations where batch_id = $1 group by created_by', [BR2])).rows,
      [{ created_by: U.accRaw, a: '5000.00' }], 'تحميلات BR2 (5,000) باسم محاسب المواد');

  });
  await section('ق١٢', async () => {
    const { R } = S;
    if (!R) throw new Error('تجهيز النطاق لم يكتمل');
    // آخر شراء ومتوسّط المتاح من مخازن نطاق القارئ. محاسب المواد: مخزن المواد وحده (900 للكيلو)؛ والمدير: آخر شراء 1,234 بالمخزن
    // الثاني، والمتوسّط يخلط المخزنين.
    const lineMoney = async (user) => (await must(user, 'select public.recipe_detail($1, null)', [R.id])).lines[0].money;
    const rawMoney = await lineMoney(U.accRaw);
    const managerMoney = await lineMoney(U.manager);
    t.same([rawMoney.last_price, rawMoney.unit_cost, managerMoney.last_price, managerMoney.unit_cost !== '900.00'], ['900.00', '900.00', '1234.00', true],
      'محاسب المواد: آخر شراء ومتوسّط المتاح 900 من مخزنه وحده (كان 1,234 ومتوسّطاً يعدّ المخزن الثاني)؛ والمدير 1,234 ومتوسّط المخزنين');
    // كلفة الكيلو المتوقّعة: (1,000 × 900 + 5,000) ÷ 1,000 = 905.00 لمحاسب المواد، و(1,000 × 1,234 + 5,000) ÷ 1,000 = 1,239.00 للمدير.
    const expected = async (user) => (await must(user, 'select public.recipes_overview()')).recipes.find((r) => r.id === R.id).money.expected_cost_per_kg;
    t.same([await expected(U.accRaw), await expected(U.manager)], ['905.00', '1239.00'], 'لوحة المعمل: كلفة الكيلو المتوقّعة من مخازن نطاق القارئ');
    const mPrice = await mutated([['private.item_last_price(uuid)', [['and l.qty_in > 0 and public.in_scope_wh(l.warehouse_id)', 'and l.qty_in > 0']]]], [], async ({ as, attempt }) => {
      await as(U.accRaw);
      return (await attempt("select public.recipe_detail($1, null) -> 'lines' -> 0 -> 'money' ->> 'last_price'", [R.id])).v;
    });
    t.eq(mPrice, '1234.00', 'طفرة: آخر شراء بلا نطاق المخزن ← 1,234 لمحاسب المواد');
  });

  // ─── ق١ (#0 و#7): الترحيل يحمّل ممّا قفله فقط — جلسات حقيقية ───────────────────────────────────────────────────
  // كلّ سباق بفئتين جديدتين وخلطاته (ذرة 1,000 لأساس 1,000)، ودفعات 100 كغم: B فئة واحدة (كهرباء أو وقود 1,000 للطنّ، فسطره 100)، وA
  // سطران (أيدي عاملة أو تحميل 60,000 للطنّ = 6,000، ثمّ كهرباء أو وقود 100)، وC (أيدي عاملة 6,000). المصروف Z أو W (1,000) أقدم من X
  // (6,000) بالتاريخ، فجملة القفل تبلغه قبل X.
  const kit = async (tag, first, second) => {
    const a = await category(`${first} ${tag}`);
    const b = await category(`${second} ${tag}`);
    return {
      tag,
      a,
      b,
      vB: (await recipe(`خلطة B ${tag}`, [[CORN, 1000]], [[b, 1000]])).version,
      vA: (await recipe(`خلطة A ${tag}`, [[CORN, 1000]], [[a, 60000], [b, 1000]])).version,
      vC: (await recipe(`خلطة C ${tag}`, [[CORN, 1000]], [[a, 60000]])).version,
    };
  };
  const onX = async (X) => (await db.admin('select count(*)::int as n, coalesce(sum(amount), 0)::text as a from public.production_cost_allocations where expense_id = $1 and voided_at is null', [X])).rows[0];
  /** P1 (X يُسجَّل وA ينتظر) وضابطه C1 (X قبل A): B يرحّل ويبقى مفتوحاً، وA ينتظر Z، وC يحمّل من X ثمّ ينتظر B عند المواد. */
  const raceP1 = async (k, xDuringWait) => {
    await expense(k.b, 1000, 5, `مصروف Z ${k.tag}`);
    let X = xDuringWait ? null : await expense(k.a, 6000, 1, `مصروف X ${k.tag}`);
    const bB = await batch(k.vB, 100);
    const bA = await batch(k.vA, 100);
    const bC = await batch(k.vC, 100);
    const sB = await db.session(U.manager);
    const sA = await db.session(U.accountant);
    const sC = await db.session(U.owner);
    const out = { bA };
    try {
      const rB = await sB.run(POST, [bB, null, ref()]);
      out.b = rB.ok ? 'ok' : rB.error;
      const pA = sA.run(POST, [bA, null, ref()]);
      out.aWait = await db.settle(pA, sA.pid);
      if (xDuringWait) X = await expense(k.a, 6000, 1, `مصروف X ${k.tag}`);
      const pC = sC.run(POST, [bC, null, ref()]);
      out.cWait = await db.settle(pC, sC.pid);
      await sB.commit();
      const rC = await pC;
      out.c = rC.ok ? 'ok' : rC.error;
      out.aAfterB = await db.settle(pA, sA.pid);
      await sC.commit();
      const rA = await pA;
      out.a = rA.ok ? 'ok' : rA.error;
      if (rA.ok) await sA.commit();
      else await sA.rollback();
    } finally {
      await sB.rollback();
      await sA.rollback();
      await sC.rollback();
    }
    out.onX = await onX(X);
    out.verify = await nonZero();
    return out;
  };
  /** P2 (X يُسجَّل ويُلغى بجلسة مفتوحة وA ينتظر) وضابطه C2 (X موجود والإلغاء قبل A): B يرحّل ويقفل W. */
  const raceP2 = async (k, xDuringWait) => {
    const VOID = "select public.void_expense($1, 'تسجيل خاطئ', $2)";
    await expense(k.b, 1000, 5, `مصروف W ${k.tag}`);
    let X = xDuringWait ? null : await expense(k.a, 6000, 1, `مصروف X ${k.tag}`);
    const bB = await batch(k.vB, 100);
    const bA = await batch(k.vA, 100);
    const sB = await db.session(U.manager);
    const sV = await db.session(U.owner);
    const sA = await db.session(U.accountant);
    const out = { bA };
    try {
      const rB = await sB.run(POST, [bB, null, ref()]);
      out.b = rB.ok ? 'ok' : rB.error;
      if (!xDuringWait) out.v = (await sV.run(VOID, [X, ref()])).ok ? 'ok' : 'failed';
      const pA = sA.run(POST, [bA, null, ref()]);
      out.aWait = await db.settle(pA, sA.pid);
      if (xDuringWait) {
        X = await expense(k.a, 6000, 1, `مصروف X ${k.tag}`);
        out.v = (await sV.run(VOID, [X, ref()])).ok ? 'ok' : 'failed';
      }
      await sB.commit();
      out.aAfterB = await db.settle(pA, sA.pid);
      await sV.commit();
      const rA = await pA;
      out.a = rA.ok ? 'ok' : rA.error;
      if (rA.ok) await sA.commit();
      else await sA.rollback();
    } finally {
      await sB.rollback();
      await sV.rollback();
      await sA.rollback();
    }
    out.onX = await onX(X);
    out.reversed = (await db.admin('select count(*)::int as n from public.expenses where reverses_id = $1', [X])).rows[0].n;
    out.verify = await nonZero();
    return out;
  };
  await section('ق١', async () => {
    const p1 = await raceP1(await kit('P1', 'أيدي عاملة', 'كهرباء'), true);
    t.same([p1.b, p1.aWait, p1.cWait, p1.c, p1.a, p1.onX, p1.verify], ['ok', 'blocked', 'blocked', 'ok', 'expense_overloaded', { n: 1, a: '6000.00' }, {}],
      'P1: مصروف ثُبّت وA ينتظر قفلاً آخر لا يدخل مجموعة قفله، فلا يحمّل منه A بعد C (كان تحميلاً مزدوجاً 12,000 من 6,000: expense_over_allocated)');
    const c1 = await raceP1(await kit('C1', 'أيدي عاملة', 'كهرباء'), false);
    t.same([c1.b, c1.aWait, c1.cWait, c1.c, c1.aAfterB, c1.a, c1.onX, c1.verify], ['ok', 'blocked', 'blocked', 'ok', 'blocked', 'expense_overloaded', { n: 1, a: '6000.00' }, {}],
      'ضابط C1: X قبل A فيدخل جملة قفله، فينتظر A الجلسة C على X ثمّ يرى تحميلها فيرفض');
    const p2 = await raceP2(await kit('P2', 'تحميل', 'وقود'), true);
    t.same([p2.b, p2.v, p2.aWait, p2.a, p2.onX.n, p2.reversed, p2.verify], ['ok', 'ok', 'blocked', 'expense_overloaded', 0, 1, {}],
      'P2: مصروف ثُبّت وأُلغي أثناء انتظار A لا يُحمَّل منه (كان تحميلاً فعّالاً على مصروف ملغى: allocation_on_void)');
    const c2 = await raceP2(await kit('C2', 'تحميل', 'وقود'), false);
    t.same([c2.b, c2.v, c2.aWait, c2.aAfterB, c2.a, c2.onX.n, c2.reversed, c2.verify], ['ok', 'ok', 'blocked', 'blocked', 'expense_overloaded', 0, 1, {}],
      'ضابط C2: X موجود والإلغاء أوّلاً، فينتظر A الإلغاء في جملة القفل ثمّ يرفض');
  });

  await section('ق١ طفرة', async () => {
    // الحلقة تقرأ المصاريف المؤهّلة بلقطتها هي (بلا v_locked)، كما كانت: جلستا السباق ترَيان الجسم المكسور فيُثبَّت، ويُعاد الأصل حرفاً
    // بحرف بـfinally (صورة الكتالوج بنهاية الحزمة تقارنه). ودفعة A الملغاة بعدها توقف تحميلها، فترجع الثوابت صفراً.
    const kits = { p1: await kit('P1m', 'أيدي عاملة', 'كهرباء'), p2: await kit('P2m', 'تحميل', 'وقود') };
    const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [POST_FN])).rows[0].d;
    const anchor = 'x.id = any (v_locked) and ';
    if (original.split(anchor).length !== 2) throw new Error('طفرة القفل: المرساة ليست مرّة واحدة');
    let m1;
    let m2;
    /** دفعة A المرحَّلة بالطفرة تُلغى فيتوقّف تحميلها، فلا يدخل أثر سباق في ثوابت السباق الذي بعده. */
    const undo = async (bA) => {
      if ((await db.admin('select status from public.production_batches where id = $1', [bA])).rows[0].status === 'posted') {
        await must(U.manager, "select public.void_production($1, 'إصلاح أثر طفرة القفل', $2)", [bA, ref()]);
      }
    };
    await db.asOwner((q) => q(original.split(anchor).join('')), null, { commit: true });
    try {
      m1 = await raceP1(kits.p1, true);
      await undo(m1.bA);
      m2 = await raceP2(kits.p2, true);
      await undo(m2.bA);
    } finally {
      await db.asOwner((q) => q(original), null, { commit: true });
    }
    t.same([m1.a, m1.onX, m1.verify], ['ok', { n: 2, a: '12000.00' }, { expense_over_allocated: 1 }], 'طفرة P1: تحميل مزدوج 12,000 من مصروف 6,000 ← expense_over_allocated');
    t.same([m2.a, m2.onX.n, m2.verify], ['ok', 1, { allocation_on_void: 1 }], 'طفرة P2: تحميل فعّال على مصروف ملغى ← allocation_on_void');
    t.same([await nonZero(), (await db.admin('select md5(pg_get_functiondef($1::regprocedure)) = md5($2) as same', [POST_FN, original])).rows[0].same], [{}, true],
      'بعد إلغاء دفعتَي الطفرة: الثوابت صفر، والترحيل بجسمه الأصلي حرفاً بحرف');
  });

  // ═══ الجولة الثانية (scratchpad/mill2/fixes2.md القسم أ، ق٢١–ق٢٧؛ الملاحظات #0–#8 و#15 والتكامل B1 بنصّها وإثباتها في findings2.txt) ═══
  // كلّ إصلاح بفحص يفشل على الهجرة كما كانت عند 203bacb وينجح بعده، وطفرة حقيقية بمعاملة ترجع تكسر فحصه بالضبط.
  const nonZeroOn = async (q, fn = 'verify_mill') =>
    Object.fromEntries((await q(`select check_name, violations::int as n from public.${fn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));
  const SCOPE_HINT = 'تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «معمل العلف» خارج نطاقك، فيكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.';
  const UNSEALED_HINT = 'تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «معمل العلف» خارج نطاقك، فتُرحَّل بعد أن يختمها محاسب أو مدير يرى تلك الوحدة.';

  // ─── ق٢١ (#0): من لا يرى مصاريف وحدة مخزن المدخلات لا يحدّد مبلغاً يُحمَّل منها ولا يختمه، ويرحّل بعد الختم فقط ─────────
  const K21 = {};
  await section('ق٢١', async () => {
    const LAB21 = await category('أيدي عاملة الختم');
    const MOVE21 = await category('نقل الختم');
    // مصروفان على وحدة المعمل نقداً: 7,345 و1,111 = 8,456 (ملاحظة #0 بأرقامها)، ولا مصروف «نقل الختم».
    await expense(LAB21, 7345, 3, 'أجور سرّية أولى');
    await expense(LAB21, 1111, 2, 'أجور سرّية ثانية');
    const R21 = await recipe('خلطة الختم', [[CORN, 1000]], [[LAB21, 100000]]);
    const B = await batch(R21.version, 100, U.miller); // أيدي عاملة 100,000 × 100 ÷ 1,000 = 10,000.00 > المتاح 8,456
    const line = (await db.admin('select id from public.production_costs where batch_id = $1', [B])).rows[0].id;
    const amountOf = async () => (await db.admin('select amount::text as a from public.production_costs where id = $1', [line])).rows[0].a;
    // التنصيف (#0) يُرفض من أوّل خطوة: تعديل المبلغ إلى منتصف المدى، فلا سؤال صحّ/خطأ على المعاينة أو الختم بعده.
    const probe = await call(U.accRaw, 'update public.production_costs set amount = 4228 where id = $1 returning amount', [line]);
    t.same([code(probe), probe.hint, await amountOf()], ['out_of_scope', SCOPE_HINT, '10000.00'],
      'محاسب المواد: أوّل خطوة في التنصيف (تعديل مبلغ السطر) out_of_scope بتلميح يسمّي الوحدة، والمبلغ كما هو (كان الحارس يقبله)');
    const ins = await call(U.accRaw, 'insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 100) returning id', [B, MOVE21]);
    t.same([code(ins), ins.hint], ['out_of_scope', SCOPE_HINT], 'محاسب المواد: إضافة سطر يدوي out_of_scope');
    const manual = await must(U.accountant, 'insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 0) returning id', [B, MOVE21]);
    const del = await call(U.accRaw, "select public.delete_draft_line('production_cost', $1, (select version from public.production_batches where id = $2))", [manual, B]);
    t.same([code(del), del.hint, (await db.admin('select count(*)::int as n from public.production_costs where id = $1', [manual])).rows[0].n], ['out_of_scope', SCOPE_HINT, 1],
      'محاسب المواد: حذف سطر كلفة (أضافه المحاسب بلا نطاق) out_of_scope، والسطر باقٍ');
    const seal = await confirm(U.accRaw, B);
    t.same([code(seal), seal.hint], ['out_of_scope', SCOPE_HINT], 'محاسب المواد: الختم out_of_scope (كان يجيب ok أو expense_overloaded صحّاً أو خطأً)');
    const look = await preview(U.accRaw, B);
    t.same([look.expenses_visible, look.money.costs.map((c) => c.available), look.problems.map(canon), look.can_post],
      [false, [null, null], [canon({ code: 'costs_unsealed_scope', division_name: 'معمل العلف' })], false],
      'معاينة محاسب المواد قبل الختم: expenses_visible = false والمتاح null، وcosts_unsealed_scope تسمّي الوحدة لا costs_unfunded (والمبلغ 10,000 فوق المتاح 8,456)، ولا ترحيل');
    const full = await preview(U.accountant, B);
    t.same([full.expenses_visible, full.money.costs.map((c) => c.available), full.problems.map((x) => [x.code, x.need ?? null, x.have ?? null])],
      [true, ['8456.00', '0.00'], [['costs_unfunded', '10000.00', '8456.00']]],
      'ضابط: المحاسب بلا نطاق يرى المتاح 8,456 والنقص بأرقامه، وexpenses_visible = true، وبلا costs_unsealed_scope');
    const early = await post(U.accRaw, B);
    t.same([code(early), early.hint], ['costs_unsealed_scope', UNSEALED_HINT], 'محاسب المواد يرحّل قبل الختم: costs_unsealed_scope (كان يصل expense_overloaded صحّاً أو خطأً)');
    const millerLook = await preview(U.miller, B);
    t.same([millerLook.money, millerLook.problems.map((x) => x.code), millerLook.can_post, millerLook.expenses_visible], [undefined, ['costs_pending'], false, false],
      'مشغّل المعمل قبل الختم: costs_pending وحده (لا costs_unsealed_scope ولا costs_unfunded) بلا مال');
    t.eq(code(await post(U.miller, B)), 'forbidden', 'مشغّل المعمل قبل الختم: forbidden كما كان');
    t.eq(code(await call(U.accountant, 'update public.production_costs set amount = 8000 where id = $1 returning id', [line])), 'ok', 'المحاسب بلا نطاق يعدّل المبلغ إلى 8,000');
    t.eq(code(await confirm(U.accountant, B)), 'ok', 'ويختم (8,000 ≤ 8,456)');
    const sealedLook = await preview(U.accRaw, B);
    t.same([sealedLook.problems, sealedLook.can_post], [[], true], 'معاينة محاسب المواد بعد الختم: بلا مشكلة، ويرحّل');
    t.eq(code(await post(U.accRaw, B)), 'ok', 'محاسب المواد يرحّل بعد الختم (التحميل يكتبه النظام)');
    // مختومة ثمّ لا يكفيها المتاح: مصروف 9,000 (المتاح 456 + 9,000 = 9,456)، ودفعتان 50 كغم (5,000 لكلّ واحدة) تُختمان، وترحيل الأولى
    // يترك 4,456 للثانية.
    await expense(LAB21, 9000, 1, 'أجور سرّية ثالثة');
    const Ba = await batch(R21.version, 50, U.miller);
    const Bb = await batch(R21.version, 50, U.miller);
    t.same([code(await confirm(U.accountant, Ba)), code(await confirm(U.accountant, Bb)), code(await post(U.manager, Ba))], ['ok', 'ok', 'ok'], 'ختم الدفعتين وترحيل الأولى');
    const after = [await preview(U.accRaw, Bb), await preview(U.miller, Bb)];
    t.same(after.map((p) => [p.problems.map(canon), p.can_post]), [[[canon({ code: 'costs_unfunded' })], false], [[canon({ code: 'costs_unfunded' })], false]],
      'بعد الختم والمتاح 4,456 < 5,000: محاسب المواد ومشغّل المعمل يريان costs_unfunded بلا أرقام (المبلغ لا يتغيّر إلّا ويُفرَّغ الختم)');
    const late = await post(U.accRaw, Bb);
    t.same([code(late), late.hint], ['expense_overloaded', 'تكاليف «أيدي عاملة الختم» أكبر من المصاريف المسجّلة لها. اطلب من المحاسب أو المدير تسجيل المصروف أو تعديل السطر.'],
      'ترحيل محاسب المواد بعد الختم والمتاح لا يكفي: expense_overloaded بلا أرقام');
    // دفعتان للطفرات: BM 10 كغم (1,000 ≤ 4,456) بسطر يدوي، وBU 100 كغم (10,000 > 4,456)، كلتاهما بلا ختم.
    const BM = await batch(R21.version, 10, U.miller);
    const manualM = await must(U.accountant, 'insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 0) returning id', [BM, MOVE21]);
    const BU = await batch(R21.version, 100, U.miller);
    Object.assign(K21, { BM, BU, manualM, lineM: (await db.admin('select id from public.production_costs where batch_id = $1 and category_id = $2', [BM, LAB21])).rows[0].id });
    t.same(
      [canon((await detail(U.accRaw, B)).expenses_visible), canon((await detail(U.manager, B)).expenses_visible), canon((await detail(U.miller, B)).expenses_visible)],
      [false, true, false],
      'production_detail: expenses_visible = false لمحاسب المواد ومشغّل المعمل، وtrue للمدير',
    );
  });
  await section('ق٢١ طفرات', async () => {
    const { BM, BU, manualM, lineM } = K21;
    if (!BU) throw new Error('ق٢١ لم يكتمل');
    const GUARD_FN = 'private.production_costs_guard()';
    const DELETE_FN = 'public.delete_draft_line(text, uuid, integer)';
    const CONFIRM_FN = 'public.confirm_production_costs(uuid, integer)';
    const DETAIL_FN = 'public.production_detail(uuid)';
    const asRaw = async (pairs, sql, params) => mutated(pairs, [], async ({ as, attempt }) => {
      await as(U.accRaw, 'authenticated');
      const out = await attempt(sql, params);
      return out.ok ? ['ok', out.v] : [out.code];
    });
    const mGuard = await asRaw([[GUARD_FN, [['if not public.in_scope_division(v_div) then', 'if false then']]]],
      'update public.production_costs set amount = 500 where id = $1 returning amount::text', [lineM]);
    const mDelete = await asRaw([[DELETE_FN, [["if p_doc_kind = 'production_cost'\n    and not public.in_scope_division(", "if false\n    and not public.in_scope_division("]]]],
      "select public.delete_draft_line('production_cost', $1, (select version from public.production_batches where id = $2)) ->> 'deleted'", [manualM, BM]);
    const mConfirm = await asRaw([[CONFIRM_FN, [['if not public.in_scope_division(wi.division_id) then', 'if false then']]]],
      "select public.confirm_production_costs($1, (select version from public.production_batches where id = $1)) ->> 'written'", [BM]);
    const mPost = await asRaw([[POST_FN, [["if not v_exp and d.costs_confirmed_at is null\n    and exists", "if false\n    and exists"]]]], POST + " ->> 'status'", [BM, null, ref()]);
    t.same([mGuard, mDelete, mConfirm, mPost], [['ok', '500.00'], ['ok', 'true'], ['ok', 'true'], ['ok', 'posted']],
      'طفرات بلا فحص الوحدة: محاسب المواد يعدّل المبلغ، ويحذف السطر، ويختم، ويرحّل قبل الختم (كلّ فحص فوق يفشل)');
    const previewOf = (pairs) => asRaw(pairs, 'select public.preview_production($1)', [BU]);
    const [, real] = await previewOf([]);
    const [, mUnfunded] = await previewOf([[PREVIEW_FN, [['if v_unfunded and not v_exp and d.costs_confirmed_at is not null then', 'if v_unfunded and not v_exp then']]]]);
    const [, mUnsealed] = await previewOf([[PREVIEW_FN, [["if not v_exp and d.status = 'draft' and d.costs_confirmed_at is null and v_positive and public.can('production.post') then", 'if false then']]]]);
    const [, mVisible] = await previewOf([[PREVIEW_FN, [["'expenses_visible', v_exp,", "'expenses_visible', v_cost,"]]]]);
    const shape = (p) => [p.problems.map((x) => x.code), p.can_post, p.expenses_visible];
    t.same([shape(real), shape(mUnfunded), shape(mUnsealed), shape(mVisible)],
      [[['costs_unsealed_scope'], false, false], [['costs_unfunded', 'costs_unsealed_scope'], false, false], [[], true, false], [['costs_unsealed_scope'], false, true]],
      'طفرات المعاينة: costs_unfunded قبل الختم يعود وحياً، وبلا costs_unsealed_scope تقول can_post = true والترحيل سيُرفض، وexpenses_visible من دور الكلفة وحده = true');
    const mDetail = await asRaw([[DETAIL_FN, [["'expenses_visible', v_exp,", "'expenses_visible', public.can_see_cost(),"]]]],
      "select (public.production_detail($1) ->> 'expenses_visible')::boolean", [BU]);
    t.same(mDetail, ['ok', true], 'طفرة: expenses_visible في بطاقة الدفعة من دور الكلفة وحده ← true لمحاسب المواد');
  });

  // ─── ق٢٢ (#2، #5): «داخل الكتلة» لقطة على سطر الخلطة عند التفعيل (FOUNDATION القاعدة ٤، مثل الكثافة) ──────────────────────
  const K22 = {};
  await section('ق٢٢', async () => {
    // مادّتان بلا أيّ حركة مخزون (فنوعهما يتغيّر): «زيت مسجّل خطأً» مادّة أوّلية سائلة بكثافة 0.85، و«سائل وقود ثانٍ» وقود بكثافة 0.9.
    const MISFILED = await item('زيت مسجّل خطأً', 'raw', 'L', 0.85);
    const FUEL2 = await item('سائل وقود ثانٍ', 'fuel', 'L', 0.9);
    // 983 ذرة + 20 لتراً منه (17 كغم داخل الكتلة) = 1,000؛ و1,000 ذرة + 10 لترات وقود (9 كغم خارج الكتلة).
    const RA = await recipe('خلطة الزيت المسجّل خطأً', [[CORN, 983], [MISFILED, 20, 'L']]);
    const RB = await recipe('خلطة الوقود الثاني', [[CORN, 1000], [FUEL2, 10, 'L']]);
    Object.assign(K22, { MISFILED, FUEL2, RA, RB });
    const snap = async (version) =>
      (await db.admin('select i.name, l.in_basis from public.recipe_lines l join public.items i on i.id = l.item_id where l.version_id = $1 order by l.line_no', [version])).rows.map((r) => [r.name, r.in_basis]);
    // التصحيح بعد التفعيل: الزيت وقود، والوقود الثاني مادّة أوّلية (items_stock_guard لا يجمّد النوع قبل أوّل حركة).
    await must(U.manager, "update public.items set kind = 'fuel' where id = $1 returning id", [MISFILED]);
    await must(U.manager, "update public.items set kind = 'raw' where id = $1 returning id", [FUEL2]);
    t.same(await nonZero(), {}, 'verify_mill صفر بعد تغيير النوعين (كان recipe_basis_mismatch = 2)');
    const card = async (rid, version = null) => {
      const d = await must(U.manager, 'select public.recipe_detail($1, $2)', [rid, version]);
      return [d.mass_kg, d.lines.map((l) => [l.item_name, l.in_basis])];
    };
    K22.card = card;
    t.same([await card(RA.id), await card(RB.id)],
      [['1000.000', [['ذرة المراجعة', true], ['زيت مسجّل خطأً', true]]], ['1000.000', [['ذرة المراجعة', true], ['سائل وقود ثانٍ', false]]]],
      'recipe_detail للنسخة المفعَّلة: in_basis ومجموع الكتلة من اللقطة لا من النوع الحيّ (كانت 983 و1,009)');
    const pieces = async (rid) => (await must(U.manager, 'select public.recipes_overview()')).recipes.find((x) => x.id === rid).active.pieces.map((p) => [p.item_name, p.in_basis]);
    K22.pieces = pieces;
    t.same([await pieces(RA.id), await pieces(RB.id)], [[['ذرة المراجعة', true], ['زيت مسجّل خطأً', true]], [['ذرة المراجعة', true], ['سائل وقود ثانٍ', false]]],
      'recipes_overview: كلّ قطعة في pieces بـin_basis من لقطة النسخة المفعَّلة');
    // دفعة 1,000 كغم من النسخة: الزيت (وقود الآن) داخل الكتلة بلقطته، فالكتلة 1,000 (كانت 983 وin_basis = false).
    const BA = await batch(RA.version, 1000);
    t.same([(await inputRows(BA)).map((r) => [r.name, r.in_basis]), (await preview(U.manager, BA)).input_mass_kg],
      [[['ذرة المراجعة', true], ['زيت مسجّل خطأً', true]], '1000.000'], 'دفعة جديدة من النسخة المفعَّلة: in_basis من اللقطة، والكتلة 1,000.000');
    t.same([await snap(RA.version), await snap(RB.version)], [[['ذرة المراجعة', true], ['زيت مسجّل خطأً', true]], [['ذرة المراجعة', true], ['سائل وقود ثانٍ', false]]],
      'اللقطة نفسها: التفعيل كتب «داخل الكتلة» لكلّ سطر من نوع المادّة لحظتها (والنوع تغيّر بعده)');
    // المسوّدة بلا لقطة، فتقرأ النوع الحيّ: نسختان جديدتان منسوختان من المفعَّلتين.
    const DA = fresh();
    const DB = fresh();
    await must(U.manager, 'select public.new_recipe_version($1, $2)', [RA.id, DA]);
    await must(U.manager, 'select public.new_recipe_version($1, $2)', [RB.id, DB]);
    K22.DA = DA;
    t.same([await snap(DA), await card(RA.id, DA), await card(RB.id, DB)],
      [[['ذرة المراجعة', null], ['زيت مسجّل خطأً', null]], ['983.000', [['ذرة المراجعة', true], ['زيت مسجّل خطأً', false]]], ['1009.000', [['ذرة المراجعة', true], ['سائل وقود ثانٍ', true]]]],
      'المسوّدة بلا لقطة، وrecipe_detail لها من النوع الحيّ: الزيت خارج الكتلة (983) والوقود الثاني داخلها (1,000 + 9 = 1,009)');
    // العمود غير ممنوح لأحد (الحدّ هو المنح، درس 0015)، وفحص كتالوج له بضابط.
    const grants = async (q) => (await q(`select has_column_privilege('authenticated', 'public.recipe_lines', 'in_basis', 'INSERT') as ai,
      has_column_privilege('authenticated', 'public.recipe_lines', 'in_basis', 'UPDATE') as au, has_column_privilege('anon', 'public.recipe_lines', 'in_basis', 'INSERT') as ni,
      has_column_privilege('anon', 'public.recipe_lines', 'in_basis', 'UPDATE') as nu, has_column_privilege('authenticated', 'public.recipe_lines', 'qty', 'UPDATE') as qty`)).rows[0];
    t.same(await grants(db.admin), { ai: false, au: false, ni: false, nu: false, qty: true }, 'الكتالوج: in_basis غير ممنوح بالإدراج ولا بالتعديل لأحد (وqty ممنوح، ضابط)');
    t.eq((await mutated([], ['grant update (in_basis) on public.recipe_lines to authenticated'], ({ oq }) => grants(oq))).au, true, 'ضابط: منح العمود بمعاملة ترجع يقلب فحص الكتالوج');
    t.eq(code(await call(U.manager, 'update public.recipe_lines set in_basis = false where version_id = $1', [DA])), 'permission denied for table recipe_lines',
      'المدير لا يكتب اللقطة مباشرةً ولو على المسوّدة');
    // ملء القائم بنصّ الهجرة نفسه، وفحص verify_mill الثالث: سطر نسخة مجمَّدة بلا لقطة (كنسخ 0015) يُمسَك، والملء يجعله داخل الكتلة.
    const backfill = /update public\.recipe_lines l set in_basis = true[\s\S]*?;/u.exec(MIGRATION_0016)?.[0];
    t.ok(Boolean(backfill), 'جملة الملء موجودة في نصّ 0016');
    const filled = await mutated([], [], async ({ oq }) => {
      await oq('update public.recipe_lines set in_basis = null where version_id = $1', [RA.version]);
      const broken = await nonZeroOn(oq);
      await oq(backfill);
      return [broken, await nonZeroOn(oq), (await oq('select array_agg(in_basis order by line_no) as v from public.recipe_lines where version_id = $1', [RA.version])).rows[0].v];
    });
    t.same(filled, [{ recipe_basis_mismatch: 1, recipe_frozen_bad_lines: 1 }, {}, [true, true]],
      'سطور نسخة مجمَّدة بلا لقطة: verify_mill يمسكها (الأساس واللقطة الفارغة)، والملء يعيدها داخل الكتلة فيصير صفراً');
    const CHECK3 = [['    or exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id and l.in_basis is null))', '    or false)']];
    const fuelNull = (pairs) => mutated(pairs, [], async ({ oq }) => {
      await oq('update public.recipe_lines set in_basis = null where version_id = $1 and item_id = $2', [RB.version, FUEL2]);
      return nonZeroOn(oq);
    });
    t.same([await fuelNull([]), await fuelNull([['public.verify_mill()', CHECK3]])], [{ recipe_frozen_bad_lines: 1 }, {}],
      'سطر خارج الكتلة بلا لقطة لا يغيّر المجموع، فالفحص الثالث وحده يمسكه؛ وطفرة بلا شرطه الجديد ← صفر');
  });
  await section('ق٢٢ طفرات', async () => {
    const { RA, RB, card, pieces } = K22;
    if (!card) throw new Error('ق٢٢ لم يكتمل');
    const live = "i.kind not in ('fuel', 'packaging')";
    const m2 = await mutated([['public.verify_mill()', [['filter (where l.in_basis), 0) <> v.basis_kg', `filter (where ${live}), 0) <> v.basis_kg`]]]], [], ({ oq }) => nonZeroOn(oq));
    const mCreate = await mutated([[CREATE_FN, [['v_qty, v_mass, coalesce(ln.in_basis, true));',
      `v_qty, v_mass, (select i3.kind from public.items i3 where i3.org_id = v_org and i3.id = ln.item_id) not in ('fuel', 'packaging'));`]]]], [], async ({ attempt }) => {
      const b = fresh();
      await attempt('select public.create_production($1, $2, 1000, $3, $4, public.app_today())', [b, RA.version, RAW, FEEDWH]);
      return (await attempt("select public.preview_production($1) ->> 'input_mass_kg'", [b])).v;
    });
    const mDetail = await mutated([['public.recipe_detail(uuid, uuid)', [
      [`'in_basis', coalesce(l.in_basis, ${live}), 'category_id'`, `'in_basis', ${live}, 'category_id'`],
      [`l.version_id = v.id and coalesce(l.in_basis, ${live})), 0)`, `l.version_id = v.id and ${live}), 0)`],
    ]]], [], async ({ oq }) => {
      const d = (await oq('select public.recipe_detail($1, null) as v', [RA.id])).rows[0].v;
      return [d.mass_kg, d.lines.map((l) => [l.item_name, l.in_basis])];
    });
    const mPieces = await mutated([['public.recipes_overview()', [[`'in_basis', coalesce(l.in_basis, ${live}))`, `'in_basis', ${live})`]]]], [],
      async ({ oq }) => (await oq('select public.recipes_overview() as v')).rows[0].v.recipes.find((x) => x.id === RB.id).active.pieces.map((p) => [p.item_name, p.in_basis]));
    t.same([m2, mCreate, mDetail, mPieces],
      [{ recipe_basis_mismatch: 2 }, '983.000', ['983.000', [['ذرة المراجعة', true], ['زيت مسجّل خطأً', false]]], [['ذرة المراجعة', true], ['سائل وقود ثانٍ', true]]],
      'طفرات تعيد قراءة النوع الحيّ: verify_mill يمسك النسختين، وكتلة الدفعة الجديدة 983، وrecipe_detail للمفعَّلة 983، وشريط التركيبة يعدّ الوقود');
    t.same(await pieces(RB.id), [['ذرة المراجعة', true], ['سائل وقود ثانٍ', false]], 'ضابط: بلا طفرة شريط التركيبة من اللقطة');
    const mActivate = await mutated([['public.activate_recipe_version(uuid, integer)', [['update public.recipe_lines set in_basis = v_in,', 'update public.recipe_lines set in_basis = null,']]]], [], async ({ oq, attempt }) => {
      const vid = fresh();
      await attempt("select public.create_recipe($1, $2, 'خلطة بلا لقطة', $3, 1000, $4::jsonb, '[]'::jsonb, true)",
        [fresh(), vid, FEED, JSON.stringify([{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: DIESEL, qty: 20, unit: 'L' }])]);
      return [(await oq('select array_agg(in_basis order by line_no) as v from public.recipe_lines where version_id = $1', [vid])).rows[0].v, await nonZeroOn(oq)];
    });
    t.same(mActivate, [[null, null], { recipe_basis_mismatch: 1, recipe_frozen_bad_lines: 1 }], 'طفرة: التفعيل بلا لقطة ← السطور فارغة وverify_mill يمسكها');
  });

  // ─── ق٢٤ (#6): دفعة بلا مادّة داخل الكتلة ───────────────────────────────────────────────────────────────────────
  await section('ق٢٤', async () => {
    const NO_MASS = 'الدفعة بلا مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يصنعان علفاً. أضف مادّة أوّلية أو احذف المسوّدة.';
    // (١) التبديل: الكاز (20 لتراً) بدل الذرة في دفعة 100 كغم من خلطة الذرة وحدها، والوزن 50 بسبب.
    const BS = await batch(R0.version, 100, U.miller);
    const cornS = (await db.admin('select id from public.production_inputs where batch_id = $1', [BS])).rows[0].id;
    await must(U.miller, "select public.add_production_input($1, $2, $3, 20, $4, 'نفدت الذرة فاستُعمل الكاز')", [BS, fresh(), DIESEL, cornS]);
    await weigh(BS, 50, 'وزن الناتج بعد التبديل');
    const ps = await preview(U.manager, BS);
    t.same([ps.input_mass_kg, ps.problems.map((x) => x.code), ps.can_post], ['0.000', ['no_mass_inputs'], false],
      'التبديل بالكاز: المعاينة no_mass_inputs وcan_post = false (كانت بلا مشكلة وcan_post = true)');
    const rs = await post(U.manager, BS);
    t.same([code(rs), rs.hint], ['no_mass_inputs', NO_MASS], 'وترحيلها no_mass_inputs بتلميحه (كان 23514 خاماً بلا تلميح)');
    // (٢) الحذف: دفعة 100 كغم من خلطة الذرة والكاز، ويُحذف سطر الذرة (آخر مادّة داخل الكتلة).
    const BD = await batch(fuelVersion, 100);
    const cornD = (await db.admin('select id from public.production_inputs where batch_id = $1 and item_id = $2', [BD, CORN])).rows[0].id;
    await must(U.manager, "select public.delete_draft_line('production_input', $1, (select version from public.production_batches where id = $2))", [cornD, BD]);
    const pd0 = await preview(U.manager, BD);
    await weigh(BD, 40, 'وزن بعد حذف الذرة');
    const pd = await preview(U.manager, BD);
    t.same([pd0.problems.map((x) => x.code), pd.problems.map((x) => x.code), pd.can_post], [['no_mass_inputs', 'shrink_out_of_range'], ['no_mass_inputs'], false],
      'حذف آخر مادّة داخل الكتلة: no_mass_inputs (ومعها الهدر بلا وزن)، وبالوزن والسبب no_mass_inputs وحدها وcan_post = false');
    const rd = await post(U.manager, BD);
    t.same([code(rd), rd.hint], ['no_mass_inputs', NO_MASS], 'وترحيلها no_mass_inputs لا 23514');
    const mPrev = await mutated([[PREVIEW_FN, [['if not v_has_mass then', 'if false then']]]], [], async ({ attempt }) =>
      (await attempt("select (public.preview_production($1) ->> 'can_post')::boolean", [BD])).v);
    const mPost = await mutated([[POST_FN, [['if not exists (select 1 from public.production_inputs p where p.org_id = v_org and p.batch_id = d.id and p.in_basis) then', 'if false then']]]], [],
      async ({ attempt }) => code(await attempt(POST, [BD, null, ref()])));
    t.same([mPrev, mPost], [true, 'new row for relation "production_batches" violates check constraint "production_batches_input_mass_check"'],
      'طفرتان: المعاينة بلا المشكلة ← can_post = true، والترحيل بلا الرفض ← خطأ القيد الخام 23514');
  });

  // ─── ق٢٥ (#7، #15): الدفعة تُقرأ من طرفيها كالتحويل (سابقة transfers_read في 0007) ─────────────────────────────────
  await section('ق٢٥', async () => {
    const { R, BR1, BR2, BR3 } = S;
    if (!BR3) throw new Error('تجهيز النطاق لم يكتمل');
    const PAIR = [BR1, BR3]; // BR1 من مخزن المواد وBR3 من الثاني، وكلتاهما إلى مخزن العلف.
    const opened = async (user, b) => {
      const out = await call(user, 'select public.production_detail($1)', [b]);
      return out.ok ? ['ok', canon(out.v.scope), out.v.expenses_visible] : [out.code, out.hint];
    };
    for (const [label, user] of [['أمين العلف', U.keepFeed], ['محاسب العلف', U.accFeed]]) {
      const last = (await must(user, 'select public.item_purchases($1, $2, null, 50)', [FEED, FEEDWH])).last_production;
      t.same([last !== null, await opened(user, last?.batch_id), await opened(user, BR3)],
        [true, ['ok', canon({ input: false, output: true }), false], ['ok', canon({ input: false, output: true }), false]],
        `${label}: last_production يظهر ورابطه يفتح، وscope = {input: false, output: true} (كان out_of_scope)`);
    }
    t.same([await opened(U.manager, BR1), await opened(U.accRaw, BR3), await opened(U.keepGen, BR1)],
      [['ok', canon({ input: true, output: true }), true], ['out_of_scope', 'مخزنا هذه الدفعة (مخزن المواد ومخزن العلف) خارج نطاقك.'],
        ['out_of_scope', 'مخزنا هذه الدفعة (مخزن المواد ومخزن العلف) خارج نطاقك.']],
      'ضوابط: المدير بالطرفين، ومحاسب المواد لا يفتح دفعة المخزن الثاني إلى العلف، وأمين المخزن العام لا يفتح شيئاً');
    const count = (user, table, column = 'batch_id') => db.asUser(user, async (q) => (await q(`select count(*)::int as n from public.${table} where ${column} = any ($1)`, [PAIR])).rows[0].n);
    const READERS = [U.keepFeed, U.accFeed, U.keepGen, U.accRaw];
    const rows = async (table, column) => {
      const out = [];
      for (const user of READERS) out.push(await count(user, table, column));
      return out;
    };
    t.same([await rows('production_batches', 'id'), await rows('production_inputs'), await rows('production_values')], [[2, 2, 0, 1], [2, 2, 0, 1], [0, 2, 0, 1]],
      'عبر RLS: أمين العلف ومحاسبه يقرآن الدفعتين وسطورهما (والمال لدور الكلفة وحده)، وأمين المخزن العام لا شيء، ومحاسب المواد دفعة مخزنه');
    const audit = (user) => db.asUser(user, async (q) => (await q(`select table_name as t, count(*)::int as n from public.audit_log
      where (table_name = 'production_batches' and coalesce(new, old) ->> 'id' = any ($1::text[]))
        or (table_name = 'production_inputs' and coalesce(new, old) ->> 'batch_id' = any ($1::text[])) group by 1 order by 1`, [PAIR])).rows);
    const managerAudit = await audit(U.manager);
    t.same([await audit(U.accFeed), await audit(U.accGen)], [managerAudit, []], `سجلّ التدقيق: محاسب العلف يقرأ تدقيق الدفعتين وسطورهما كالمدير (${JSON.stringify(managerAudit)})، ومحاسب العامة لا شيء`);
    // لوحة المعمل: عدد الدفعات وآخرها من الدفعات التي يقرؤها القارئ. دفعات «خلطة النطاق» المرحَّلة BR1 وBR3 وBR2، وآخرها BR2 (المعرّف الأكبر).
    const lastNo = (await db.admin('select doc_no from public.production_batches where id = $1', [BR2])).rows[0].doc_no;
    const board = async (user, q = null) => {
      const json = q ? (await q('select public.recipes_overview() as v')).rows[0].v : await must(user, 'select public.recipes_overview()');
      const c = json.recipes.find((x) => x.id === R.id);
      return [c.batches, c.last_batch?.doc_no ?? null];
    };
    t.same([await board(U.manager), await board(U.keepFeed), await board(U.accRaw), await board(U.keepGen)], [[3, lastNo], [3, lastNo], [2, lastNo], [0, null]],
      'recipes_overview: الدفعات وآخرها بنطاق القارئ (أمين العلف الثلاث، ومحاسب المواد دفعتا مخزنه، وأمين المخزن العام لا شيء؛ كانت 3 للكلّ)');
    // الطفرات بمعاملة ترجع.
    const READ15 = ['drop policy production_batches_read on public.production_batches',
      'create policy production_batches_read on public.production_batches for select to authenticated using (org_id = (select public.auth_org()) and (select public.in_scope_wh(input_warehouse_id)))'];
    const mPolicy = await mutated([], READ15, async ({ as, oq }) => {
      await as(U.accFeed, 'authenticated');
      return (await oq('select count(*)::int as n from public.production_inputs where batch_id = any ($1)', [PAIR])).rows[0].n;
    });
    const mAudit = await mutated([], ['drop policy audit_log_mill_scope on public.audit_log', `create policy audit_log_mill_scope on public.audit_log as restrictive for select to authenticated
      using (case when table_name = 'production_batches' then public.in_scope_wh((coalesce("new", "old") ->> 'input_warehouse_id')::uuid) else true end)`], async ({ as, oq }) => {
      await as(U.accFeed, 'authenticated');
      return (await oq("select count(*)::int as n from public.audit_log where table_name = 'production_batches' and coalesce(new, old) ->> 'id' = any ($1::text[])", [PAIR])).rows[0].n;
    });
    const mDetail = await mutated([['public.production_detail(uuid)', [['if not (v_in or v_out) then', 'if not v_in then']]]], [], async ({ as, attempt }) => {
      await as(U.keepFeed);
      return code(await attempt('select public.production_detail($1)', [BR3]));
    });
    const mBoard = await mutated([['public.recipes_overview()', [
      ["b.status = 'posted'\n          and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))),", "b.status = 'posted'),"],
      ["b.status = 'posted'\n          and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))\n        order by", "b.status = 'posted'\n        order by"],
    ]]], [], async ({ as, oq }) => {
      await as(U.keepGen);
      return board(null, oq);
    });
    t.same([mPolicy, mAudit, mDetail, mBoard], [0, 0, 'out_of_scope', [3, lastNo]],
      'طفرات: سياسة القراءة بمخزن المدخلات وحده ← محاسب العلف بلا سطور، وسجلّ الدفعة بالمدخلات وحدها ← بلا تدقيق، وبطاقة الدفعة بالمدخلات ← out_of_scope، ولوحة المعمل بلا نطاق ← أمين العامة يرى 3');
  });

  // ─── ق٢٦ (التكامل B1): اسم فئة المصروف لا يتكرّر في المنشأة ─────────────────────────────────────────────────────
  await section('ق٢٦', async () => {
    const add = (name, user = U.accountant) => call(user, 'insert into public.expense_categories (name) values ($1) returning id', [name]);
    const taken = (name) => `توجد فئة «${name}»: اخترها بدل إنشاء أخرى.`;
    const result = (out) => (out.ok ? 'ok' : [out.code, out.hint]);
    const power = await add('كهرباء المعمل');
    const english = await add('Mill Power');
    const feedCat = await add('أعلاف الدواجن');
    t.same([code(power), code(english), code(feedCat)], ['ok', 'ok', 'ok'], 'ثلاث فئات جديدة');
    const dupes = [];
    for (const name of ['كهرباء  المعمل', '  كهرباء المعمل  ', 'ك\u{64e}هرباء المعمل', 'كهرباء\tالمعمل']) dupes.push(result(await add(name)));
    t.same(dupes, Array(4).fill(['category_name_taken', taken('كهرباء المعمل')]), 'المسافات المكرّرة والأطراف والتشكيل والجدولة: category_name_taken بتلميح يسمّي الموجودة');
    t.same([result(await add('mill power', U.manager)), result(await add('اعلاف الدواجن'))], [['category_name_taken', taken('Mill Power')], ['category_name_taken', taken('أعلاف الدواجن')]],
      'حالة الأحرف اللاتينية والهمزات: category_name_taken (والمدير كالمحاسب)');
    const paper = await add('قرطاسية المعمل');
    await must(U.accountant, 'update public.expense_categories set archived_at = now() where id = $1 returning id', [paper.v]);
    t.same([result(await add('قرطاسيه المعمل')), result(await add('فرق جرد')), result(await add('فرق  جرد'))],
      [['category_name_taken', 'توجد فئة «قرطاسية المعمل» مؤرشفة: أعِدها من الأرشيف بدل إنشاء أخرى.'], ['category_name_taken', '«فرق جرد» اسم فئة نظامية يكتبها النظام؛ اختر اسماً آخر.'],
        ['category_name_taken', '«فرق جرد» اسم فئة نظامية يكتبها النظام؛ اختر اسماً آخر.']],
      'مع مؤرشفة (التاء المربوطة هاءً): أعِدها من الأرشيف؛ ومع نظامية: اختر اسماً آخر');
    const rename = (name) => call(U.accountant, 'update public.expense_categories set name = $2 where id = $1 returning name', [english.v, name]);
    t.same([result(await rename('كهرباء المعمل')), result(await rename('Mill Power')), result(await rename('MILL  POWER'))],
      [['category_name_taken', taken('كهرباء المعمل')], 'ok', 'ok'],
      'التعديل إلى اسم موجود يُرفض، وبلا تغيير الاسم يمرّ، وإلى صيغة من اسمها هي يمرّ (لا فئة أخرى به)');
    // جلستان بالاسم نفسه معاً: الثانية تنتظر قفل (المنشأة، الاسم المطبَّع) ثمّ ترى فئة الأولى.
    const race = async (name) => {
      const s1 = await db.session(U.accountant);
      const s2 = await db.session(U.manager);
      try {
        const r1 = await s1.run('insert into public.expense_categories (name) values ($1) returning id', [name]);
        const p2 = s2.run('insert into public.expense_categories (name) values ($1) returning id', [`  ${name}`]);
        const wait = await db.settle(p2, s2.pid);
        await s1.commit();
        const r2 = await p2;
        if (r2.ok) await s2.commit();
        return [r1.ok, wait, r2.ok ? 'ok' : r2.error];
      } finally {
        await s1.rollback();
        await s2.rollback();
      }
    };
    t.same(await race('صيانة متزامنة'), [true, 'blocked', 'category_name_taken'], 'جلستان بالاسم نفسه معاً: واحدة تنجح والثانية تنتظر ثمّ category_name_taken');
    // إعادة زرع بذور المنشأة: الفئات النظامية بـon conflict do nothing، والمحفّز يجري قبل التعارض فلا يفحص الإدراج النظامي.
    const NAME_FN = 'private.expense_categories_name_guard()';
    const reseed = (pairs) => mutated(pairs, [], async ({ attempt }) => { const out = await attempt('select private.seed_org_defaults()'); return out.ok ? 'ok' : out.code; });
    t.same([await reseed([]), await reseed([[NAME_FN, [["if tg_op = 'INSERT' and new.system_code is not null then", 'if false then']]]])], ['ok', 'category_name_taken'],
      'إعادة زرع بذور المنشأة تمرّ؛ وطفرة تفحص الإدراج النظامي ← category_name_taken (البذور لا تُعاد)');
    // طفرة لكلّ فرع بمعاملة ترجع.
    const asAcc = (pairs, sql, params) => mutated([[NAME_FN, pairs]], [], async ({ as, attempt }) => {
      await as(U.accountant, 'authenticated');
      return result(await attempt(sql, params));
    });
    const INSERT = 'insert into public.expense_categories (name) values ($1) returning name';
    t.same(
      [
        await asAcc([['if c.id is not null then', 'if false then']], INSERT, ['كهرباء المعمل']),
        await asAcc([['private.searchable(btrim(x.name)) = v_norm', 'x.name = new.name']], INSERT, ['كهرباء  المعمل']),
        await asAcc([['when c.archived_at is not null then', 'when false then']], INSERT, ['قرطاسيه المعمل']),
        await asAcc([['when c.system_code is not null then', 'when false then']], INSERT, ['فرق جرد']),
        await asAcc([["if (tg_op = 'UPDATE' and new.name is not distinct from old.name) or", "if tg_op = 'UPDATE' or"]],
          'update public.expense_categories set name = $2 where id = $1 returning name', [english.v, 'كهرباء المعمل']),
      ],
      ['ok', 'ok', ['category_name_taken', taken('قرطاسية المعمل')], ['category_name_taken', taken('فرق جرد')], 'ok'],
      'طفرات: بلا الفحص يتكرّر الاسم، وبلا التطبيع تعبر المسافة المكرّرة، وبلا فرعَي المؤرشفة والنظامية تلميح عامّ، وبلا فحص التعديل يأخذ اسماً موجوداً',
    );
    t.eq(code(await call(U.accountant, 'update public.expense_categories set archived_at = null where id = $1 returning id', [paper.v])), 'ok',
      'إعادة المؤرشفة من الأرشيف تمرّ (الاسم لم يتغيّر فلا يُفحص)');
    // طفرة القفل بجلستين حقيقيتين: الجسم بلا القفل يُثبَّت ثمّ يُعاد حرفاً بـfinally (جلسة أخرى لا ترى معاملة لم تُثبَّت).
    const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [NAME_FN])).rows[0].d;
    const lock = "  perform pg_advisory_xact_lock(hashtextextended('expense_category:' || new.org_id::text || ':' || v_norm, 0));\n";
    if (original.split(lock).length !== 2) throw new Error('طفرة القفل: المرساة ليست مرّة واحدة');
    let unlocked;
    await db.asOwner((q) => q(original.split(lock).join('')), null, { commit: true });
    try {
      unlocked = await race('صيانة طفرة القفل');
    } finally {
      await db.asOwner((q) => q(original), null, { commit: true });
    }
    t.same([unlocked, (await db.admin('select md5(pg_get_functiondef($1::regprocedure)) = md5($2) as same', [NAME_FN, original])).rows[0].same], [[true, 'finished', 'ok'], true],
      'طفرة: بلا القفل الاستشاري تنجح الجلستان بالاسم نفسه (فئتان)؛ والمحفّز بعدها بجسمه الأصلي حرفاً بحرف');
  });

  // ─── ق٢٧ (#3 و#8، و#4): فحوص لإصلاحَي ق١٢ وق١٣ بلا فحص ─────────────────────────────────────────────────────────
  await section('ق٢٧ متوسّط المتاح', async () => {
    const SALT = await item('ملح المراجعة', 'raw', 'kg');
    const LIME = await item('كلس المراجعة', 'raw', 'kg');
    const open = async (warehouse, itemId, qty, value) => {
      const doc = await must(U.manager, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 10) returning id', [warehouse]);
      await must(U.manager, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, $3, $4) returning id', [doc, itemId, qty, value]);
      await must(U.manager, 'select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [doc, ref()]);
    };
    // الملح بلا استلام ولا سعر كلفة: رصيده الافتتاحي في المخزن الثاني وحده (100 كغم بـ150,000 = 1,500)، خارج نطاق محاسب المواد.
    await open(RAW2, SALT, 100, 150000);
    // الكلس: 100 كغم بـ100,000 في مخزن المواد (1,000) و100 بـ300,000 في الثاني (3,000)، فالمتوسّط الكلّي 2,000.
    await open(RAW, LIME, 100, 100000);
    await open(RAW2, LIME, 100, 300000);
    const RS = await recipe('خلطة الملح', [[CORN, 600], [SALT, 400]]);
    const RL = await recipe('خلطة الكلس', [[CORN, 500], [LIME, 500]]);
    const view = async (user, q = null) => {
      const get = async (sql, params) => (q ? (await q(`${sql} as v`, params)).rows[0].v : must(user, sql, params));
      const board = await get('select public.recipes_overview()', []);
      const per = (rid) => board.recipes.find((x) => x.id === rid).money.expected_cost_per_kg;
      const exp = async (rid) => (({ materials_per_ton: m, unpriced: u }) => [m, u])((await get('select public.recipe_detail($1, null)', [rid])).money.expected);
      return [per(RS.id), await exp(RS.id), per(RL.id), await exp(RL.id)];
    };
    // محاسب المواد: الذرة بآخر شراء في نطاقه 900؛ والملح بلا سعر في نطاقه (unpriced)، فالمواد 600 × 900 = 540,000 وكلفة الكيلو فارغة؛
    // والكلس بمتوسّط مخزن المواد وحده 1,000: 500 × 900 + 500 × 1,000 = 950,000 ← 950.00.
    // المدير: الذرة 1,234 (آخر شراء بالمخزن الثاني)، والملح 1,500، والكلس 2,000: 600 × 1,234 + 400 × 1,500 = 1,340,400 ← 1,340.40؛
    // و500 × 1,234 + 500 × 2,000 = 1,617,000 ← 1,617.00.
    t.same([await view(U.accRaw), await view(U.manager)],
      [[null, ['540000.00', 1], '950.00', ['950000.00', 0]], ['1340.40', ['1340400.00', 0], '1617.00', ['1617000.00', 0]]],
      'كلفة الطنّ المتوقّعة لمحاسب المواد من مخزنه وحده: الملح بلا سعر (unpriced = 1، والكيلو فارغ)، والكلس بمتوسّط مخزنه؛ والمدير يرى الكلّ');
    const leak = await mutated([['private.recipe_expected(uuid)', [['and s.qty_left > 0 and public.in_scope_wh(s.warehouse_id)));', 'and s.qty_left > 0));']]]], [], async ({ as, oq }) => {
      await as(U.accRaw);
      return view(null, oq);
    });
    t.same(leak, ['1140.00', ['1140000.00', 0], '1450.00', ['1450000.00', 0]], 'طفرة: متوسّط المتاح بلا نطاق ← الملح بـ1,500 والكلس بـ2,000 من المخزن الثاني (الرقم المسرَّب 1,140.00)');
  });
  await section('ق٢٧ المادّة المؤرشفة', async () => {
    const PREMIX = await item('بريمكس المراجعة', 'raw', 'kg');
    const RP = await recipe('خلطة البريمكس', [[CORN, 990], [PREMIX, 10]]);
    await must(U.manager, 'update public.items set archived_at = now() where id = $1 returning id', [PREMIX]);
    const N = fresh();
    const refused = await call(U.manager, 'select public.new_recipe_version($1, $2)', [RP.id, N]);
    t.same([code(refused), refused.hint, (await db.admin('select count(*)::int as n from public.recipe_versions where id = $1', [N])).rows[0].n],
      ['item_archived', '«بريمكس المراجعة» في الخلطة مؤرشفة، فلا تُنسخ إلى نسخة جديدة. أعِدها من الأرشيف أوّلاً.', 0],
      'new_recipe_version والمادّة مؤرشفة في النسخة المفعَّلة: item_archived يسمّيها، ولا نسخة بالمعرّف المرسَل');
    const m = await mutated([['public.new_recipe_version(uuid, uuid)', [["    if v_name is not null then\n      raise exception 'item_archived'", "    if false then\n      raise exception 'item_archived'"]]]], [],
      async ({ attempt }) => {
        const out = await attempt('select public.new_recipe_version($1, $2)', [RP.id, fresh()]);
        return [code(out), out.hint];
      });
    t.same(m, ['item_not_found', 'هذه المادّة غير موجودة في منشأتك أو مؤرشفة. حدّث الشاشة واختر من جديد.'], 'طفرة: بلا شرط المادّة المؤرشفة ← item_not_found من حارس السطر بتلميح لا يسمّيها');
    await must(U.manager, 'update public.items set archived_at = null where id = $1 returning id', [PREMIX]);
  });


  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بنهاية الملف');
}
