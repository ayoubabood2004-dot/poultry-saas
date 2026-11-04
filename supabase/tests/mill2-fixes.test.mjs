// مراجعة المعمل v2 (0016؛ المواصفة scratchpad/mill2/fixes.md القسم أ، ق١–ق١٦، والملاحظات #0–#14 و#19 و#20 بنصّها وإثباتها):
// كلّ إصلاح بفحص يفشل على الهجرة كما كانت عند 4d36b0d وينجح بعده، وطفرة حقيقية تكسر فحصه بالضبط: الدالّة أو السياسة مكسورة بمعاملة
// ترجع (attempt بنقطة حفظ يرجّع الرمز بدل أن يوقف المعاملة)، والقفل (ق١) بجلسات حقيقية وطفرة مثبَّتة يُعاد جسمها كما كان بـfinally،
// لأنّ جلسة أخرى لا ترى معاملة لم تُثبَّت. منشأة هذا الملف وحدها (المعرّفات c2170000 والهواتف 96477992170). كلّ قسم بـsection: رمية
// فيه فحص فاشل باسمه ولا توقف الملف. الأرقام محسوبة باليد بالتعليق جنب كلّ واحد.

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
    const m2 = await mutated([[ACTIVATE_FN, [["if ln.kind in ('fuel', 'packaging') then", 'if false then']]]], [], async ({ attempt, oq }) => {
      const out = await attempt("select public.create_recipe($1, $2, 'ذرة وكاز بطفرة', $3, 1000, $4::jsonb, '[]'::jsonb, true) ->> 'status'",
        [fresh(), fresh(), FEED, JSON.stringify([{ item_id: CORN, qty: 983, unit: 'kg' }, { item_id: DIESEL, qty: 20, unit: 'L' }])]);
      const found = Object.fromEntries((await oq('select check_name, violations::int as n from public.verify_mill() where violations <> 0')).rows.map((r) => [r.check_name, r.n]));
      return [code(out), out.v ?? null, found];
    });
    t.same(m2, ['ok', 'active', { recipe_basis_mismatch: 1 }], 'طفرة: التفعيل يعدّ الكاز في الأساس ← 983 + 17 تتفعّل، وverify_mill يمسكها recipe_basis_mismatch');
    const m3 = await mutated([[CREATE_FN, [["v_qty, v_mass, ln.kind not in ('fuel', 'packaging'));", 'v_qty, v_mass, true);']]]], [], async ({ attempt }) => {
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
    t.ok(code(scoped) === 'expense_overloaded' && /إيجار المعمل/u.test(scoped.hint ?? '') && !/[0-9]/u.test(scoped.hint ?? ''),
      `محاسب المواد (مخزن المدخلات بنطاقه بلا وحدته): expense_overloaded بلا أرقام (${scoped.hint})`);
    const mScope = await mutated([['public.confirm_production_costs(uuid, integer)', [['wi := private.stock_wh(d.input_warehouse_id, true);', 'wi := private.stock_wh(d.input_warehouse_id, false);']]]], [],
      async ({ as, attempt }) => {
        await as(U.accGen);
        return code(await attempt('select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [BC]));
      });
    t.same(mScope, 'expense_overloaded', 'طفرة: الختم بلا نطاق ← المحاسب المحصور بوحدة أخرى يصل فحص المصاريف (لا out_of_scope)');
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
      t.same([view.money.costs.map((c) => ('available' in c ? c.available : 'absent')), view.problems.filter((x) => x.code === 'costs_unfunded').map(canon)], [[null], [{ code: 'costs_unfunded' }]],
        `${label}: available = null وcosts_unfunded بلا أرقام (كان يرى مجموع مصاريف وحدة يحجبها عنه نطاقه)`);
      const refused = await post(user, BR2);
      t.ok(code(refused) === 'expense_overloaded' && /أيدي عاملة النطاق/u.test(refused.hint ?? '') && !/[0-9]/u.test(refused.hint ?? ''),
        `${label}: expense_overloaded بلا أرقام (${refused.hint})`);
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
    const mDivision = await mutated([[PREVIEW_FN, [["'division_name', (select dv.name from public.divisions dv where dv.org_id = v_org and dv.id = wi.division_id)", "'division_name', wi.name"]]]], [],
      async ({ attempt }) => (await attempt("select public.preview_production($1) -> 'input_warehouse' ->> 'division_name'", [BR2])).v);
    t.eq(mDivision, 'مخزن المواد الأوّلية', 'طفرة: اسم الوحدة من المخزن ← اسم المخزن لا «معمل العلف»');

    // الترحيل نفسه مسموح للمحصور بمخزن (التحميل يكتبه النظام): مصروف ثالث 2,500 يكفي، فيرحّل محاسب المواد.
    await expense(LAB, 2500, 1, 'أجور إضافية');
    t.eq(code(await post(U.accRaw, BR2)), 'ok', 'محاسب المواد يرحّل حين تكفي المصاريف (قرار: الترحيل مسموح بلا أرقام)');
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

  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بنهاية الملف');
}
