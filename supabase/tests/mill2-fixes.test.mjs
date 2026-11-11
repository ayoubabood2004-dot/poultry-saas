// مراجعة المعمل v2 (0016؛ المواصفة scratchpad/mill2/fixes.md القسم أ، ق١–ق١٦، والملاحظات #0–#14 و#19 و#20 بنصّها وإثباتها):
// كلّ إصلاح بفحص يفشل على الهجرة كما كانت عند 4d36b0d وينجح بعده، وطفرة حقيقية تكسر فحصه بالضبط: الدالّة أو السياسة مكسورة بمعاملة
// ترجع (attempt بنقطة حفظ يرجّع الرمز بدل أن يوقف المعاملة)، والقفل (ق١) بجلسات حقيقية وطفرة مثبَّتة يُعاد جسمها كما كان بـfinally،
// لأنّ جلسة أخرى لا ترى معاملة لم تُثبَّت. منشأة هذا الملف وحدها (المعرّفات c2170000 والهواتف 96477992170). كلّ قسم بـsection: رمية
// فيه فحص فاشل باسمه ولا توقف الملف. الأرقام محسوبة باليد بالتعليق جنب كلّ واحد.
// والجولة الثانية (scratchpad/mill2/fixes2.md القسم أ، ق٢١–ق٢٧) بأقسامها في آخر الملف، وكلّ فحص منها يفشل على 0016 كما كانت عند
// 203bacb؛ والفحوص التي ثبّتت السلوك القديم (ق٢، وق١١ وق١٥، وطفرتا ق٣) حُدّثت بأسماء تقول الجديد.
// والجولة الثالثة (scratchpad/mill2/fixes3.md القسم أ، ق٣١–ق٣٧) بأقسامها: ق٣١ (لقطة وحدة الأساس) وق٣٥ في آخر الملف، وق٣٢ بعد ق٢٥، وق٣٣ بعد
// ق٢١، وق٣٦ بعد ق٢٦؛ وكلّ إصلاح منها يفشل على 0016 كما كانت عند ff8423c، والفحوص لإصلاحات سابقة (ق٣٣ وق٣٥ وق٣٦) بطفرات داخلها؛ وق٣٧ ضابط
// «طفرة P2» ينتظر A محبوساً على جلسة الإلغاء نفسها (pg_blocking_pids) أو منتهياً، لا أيّ انتظار.
// والجولة الرابعة (scratchpad/mill2/fixes4.md القسم أ، ق٤١–ق٤٣) بأقسامها في آخر الملف: ق٤١ (لقطة لتر ومادّة صارت بالكيلو تُنتَج وتُنسخ) وق٤٢ (لا
// سطر لتر بلا كثافة في نسخة تُفعَّل، ولا قارئ يرمي بسطر واحد)، وكلّ فحص منها يفشل على 0016 كما كانت عند 93a85f0؛ وق٤٣ يقدّم السلوك على الطفرات في
// ق٣٣ و«ق٣١ طفرات»؛ ومراسي طفرات ق٢٢ وق٣١ على النصوص التي تغيّرت حُدّثت ولم يتغيّر ما تفحصه.
// والجولة الخامسة (scratchpad/mill2/fixes5.md القسم أ، ق٥١–ق٥٥) بأقسامها في آخر الملف: ق٥١ (density_missing) وق٥٢ (الفحص ٢ لا يرمي، والكتلة الفارغة
// داخل الكتلة خرق) وق٥٣ (تحويل «نسخة جديدة» بحالتين) وق٥٤ (كلفة الطنّ المتوقّعة لسطر لتر لمادّة صارت بالكيلو) وق٥٥ (skipped)، وكلّ فحص لإصلاح منها يفشل
// على 0016 كما كانت عند ff22f80؛ وفحوص ق١٣ الثلاثة التي ثبّتت شكل جواب new_recipe_version القديم حُدّثت بمفتاح skipped وأسماء تقوله.
// والجولة السادسة (scratchpad/mill2/fixes6.md القسم أ، ق٦١–ق٦٥) بأقسامها في آخر الملف: ق٦١ (unconverted) وق٦٢ (المؤرشفة التي صارت قطعة، وسطر اللتر
// لسائل صار قطعة) وق٦٣ (الإعادة بالمعرّف نفسه) وق٦٤ (الكتلة الصفرية) وق٦٥ (مكان الكثافة في التلميح)، وكلّ فحص لإصلاح منها يفشل على 0016 كما كانت عند
// bffd349؛ والفحوص التي ثبّتت السلوك القديم حُدّثت بأسماء تقول الجديد: إعادة ق١٣ وق٥٥ (existing = false وskipped الأولى)، وتلميح ق٥١، وعدّ ق٥٤ وطفرته
// (unconverted)، ومرساة حصّة السطر في طفرات ق٤٢ (لم يتغيّر ما تفحصه).
import { readFileSync } from 'node:fs';

/** نصّ 0016 نفسه (جملة ملء لقطة «داخل الكتلة» تُشغَّل كما هي، ق٢٢). */
const MIGRATION_0016 = readFileSync(new URL('../migrations/0016_mill_v2.sql', import.meta.url), 'utf8');
/** نصّ rollback_0016 نفسه (كتلة الرفض بفرع الأساس، ق٤٢). */
const ROLLBACK_0016 = readFileSync(new URL('../migrations/rollback_0016.sql', import.meta.url), 'utf8');

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
    t.same(canon(made.v), canon({ recipe_id: R13.id, version_id: N1, version_no: 2, status: 'draft', lines: 2, rates: 2, existing: false, skipped: [] }),
      `new_recipe_version: مسوّدة بالمعرّف من الجهاز، النسخة الثانية بسطرَي المفعَّلة ومعدّليها، وskipped حاضر فارغ (ق٥٥) (${made.code ?? ''} ${made.hint ?? ''})`);
    t.same(
      [(await db.admin('select item_id, qty::text as q, unit, line_no from public.recipe_lines where version_id = $1 order by line_no', [N1])).rows,
        (await db.admin('select category_id, amount_per_ton::text as a, line_no from public.recipe_cost_rates where version_id = $1 order by line_no', [N1])).rows,
        (await db.admin('select basis_kg::text as b from public.recipe_versions where id = $1', [N1])).rows[0]?.b],
      [[{ item_id: CORN, q: null, unit: 'kg', line_no: 1 }, { item_id: SOY, q: null, unit: 'kg', line_no: 2 }],
        [{ category_id: labor, a: '5000.00', line_no: 1 }, { category_id: power, a: '1500.00', line_no: 2 }],
        null],
      'المنسوخ بترتيبه بالموادّ وحدها (0025: «عدّل الخلطة» بلا كميات): الذرة والصويا بلا كمية، و«أيدي عاملة» 5,000 و«كهرباء» 1,500، والأساس فارغ',
    );
    t.same(canon((await call(U.manager, NEW, [R13.id, N1])).v), canon(made.v),
      'الإعادة بالمعرّف نفسه (جواب ضاع): ما رجع أوّل مرّة — existing = false (هي النسخة التي أنشأها هذا الطلب)، وskipped فارغ (لا مادّة صارت قطعة) (ق٦٣؛ كانت existing = true)');
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
    t.same(canon((await call(U.manager, NEW, [bare, N3])).v), canon({ recipe_id: bare, version_id: N3, version_no: 1, status: 'draft', lines: 0, rates: 0, existing: false, skipped: [] }),
      'خلطة بلا نسخ: مسوّدة فارغة (بلا أساس منذ 0025)، وskipped حاضر فارغ (ق٥٥)');
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
    const expectB = canon({ batch_id: B14b, doc_no: docB, produced_on: TODAY, qty_kg: '200.000', warehouse_name: 'رصيد العلف' });
    t.same([canon(await last(U.manager, FEED14, FEEDWH)), canon(await last(U.manager, FEED14, null)), canon(await last(U.miller, FEED14, FEEDWH))], [expectB, expectB, expectB],
      'last_production: آخر دفعة مرحَّلة ناتجها هذه المادّة (بمخزنه وبلا مخزن، ولمشغّل المعمل)');
    t.same([await last(U.manager, FEED14, RAW), await last(U.manager, CORN, null), await last(U.accRaw, FEED14, null)], [null, null, null],
      'null: مخزن آخر، ومادّة لا تُصنع، ومحاسب المواد (مخزن العلف خارج نطاقه)');
    await must(U.manager, "select public.void_production($1, 'وزن خاطئ', $2)", [B14b, ref()]);
    t.same(canon(await last(U.manager, FEED14, FEEDWH)), canon({ batch_id: B14a, doc_no: docA, produced_on: TODAY, qty_kg: '100.000', warehouse_name: 'رصيد العلف' }),
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
  /**
   * ق٣٧ (#6): ينتظر حتّى تنتهي الجلسة pid أو تُحبس على قفل تمسكه الجلسة blocker تحديداً (pg_blocking_pids)، لا أيّ انتظار. كان db.settle بعد ثبات
   * B يقرأ انتظار A القديم على قفل W قبل أن يستيقظ، فتُثبَّت جلسة X (الإلغاء في P2، والتحميل في P1) قبل أن تقرأ حلقة الطفرة المصاريف، فترى ما
   * ثُبّت ولا يظهر الخرق (3 من 46 تشغيلاً تحت الحمل). بلا طفرة ينتهي A دون أن ينتظرها، وبالطفرة يقرأ X ثمّ يُحبس عليها (مفتاح التحميل على صفّ
   * المصروف المقفول)، فالثبات بعده.
   */
  const settleOn = async (promise, pid, blocker, timeoutMs = 5000) => {
    let done = false;
    promise.then(() => {
      done = true;
    });
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (done) return 'finished';
      if ((await db.admin('select $2::int = any (pg_blocking_pids($1::int)) as held', [pid, blocker])).rows[0].held) return 'blocked';
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`الجلسة ${pid} ما انتهت ولا انحبست على الجلسة ${blocker} خلال ${timeoutMs}ms`);
  };
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
      out.aAfterB = await settleOn(pA, sA.pid, sC.pid);
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
      out.aAfterB = await settleOn(pA, sA.pid, sV.pid);
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

  // ─── ق٣٣ (#0، في نطاق ق٢١): «سطر كلفة موجب» — المحصور بمخزن يرحّل قبل الختم دفعةً لا يُحمَّل عليها شيء ─────────────────────────
  await section('ق٣٣', async () => {
    // لكلّ من مدير المواد ومحاسب المواد دفعتان 10 كغم بلا ختم: الأولى من خلطة الذرة وحدها (بلا سطر كلفة)، والثانية من خلطة بمعدّل صفّر المحاسب
    // بلا نطاق سطرها (أيدي عاملة 5,000 للطنّ × 10 ÷ 1,000 = 50.00 ← 0). لا مبلغ يُحمَّل من مصاريف الوحدة، فالترحيل كما في 0015 ونصّ fixes2 ق٢١-٤.
    const ZERO = await category('أيدي عاملة صفرية');
    const RZ = await recipe('خلطة السطر الصفري', [[CORN, 1000]], [[ZERO, 5000]]);
    const USERS = [['مدير المواد', U.mgrRaw], ['محاسب المواد', U.accRaw]];
    const pairFor = async () => {
      const bare = await batch(R0.version, 10);
      const zero = await batch(RZ.version, 10);
      await must(U.accountant, 'update public.production_costs set amount = 0 where batch_id = $1 returning id', [zero]);
      return { bare, zero };
    };
    // الحالات السلوكية أوّلاً على دفعاتها (مراجعة 0016 الرابعة #2، ق٤٣): كانت بعد الطفرتين، ومرساتاهما على السطرين المحروسين نفسيهما، فانحدار في
    // نصّ الهجرة نفسه (exists صحيح دائماً في الترحيل، أو v_positive يبدأ صحيحاً في المعاينة) لا يُمسك إلّا برمية «المرساة ليست مرّة واحدة» قبلها.
    for (const [label, user] of USERS) {
      const { bare, zero } = await pairFor();
      for (const [kind, b] of [['بلا سطر كلفة', bare], ['سطرها صفر', zero]]) {
        const p = await preview(user, b);
        t.same([p.problems, p.can_post, code(await post(user, b))], [[], true, 'ok'], `${label} قبل الختم، دفعة ${kind}: problems = [] وcan_post = true والترحيل ok`);
      }
    }
    // ثمّ الطفرتان بمعاملة ترجع على دفعات أخرى لم تُرحَّل، لكلّ مستخدم ولكلّ دفعة: v_positive صحيح دائماً في المعاينة، وexists صحيح دائماً في الترحيل.
    const cases = [];
    for (const [label, user] of USERS) cases.push({ label, user, ...(await pairFor()) });
    const shape = (p) => [p.problems.map((x) => x.code), p.can_post];
    const sweep = (pairs, run) => mutated(pairs, [], async ({ as, attempt }) => {
      const out = [];
      for (const { user, bare, zero } of cases) {
        await as(user);
        for (const b of [bare, zero]) out.push(await run(attempt, b));
      }
      return out;
    });
    const mPreview = await sweep([[PREVIEW_FN, [['  v_positive boolean := false;', '  v_positive boolean := true;']]]],
      async (attempt, b) => shape((await attempt('select public.preview_production($1)', [b])).v));
    const mPost = await sweep([[POST_FN, [['    and exists (select 1 from public.production_costs pc where pc.org_id = v_org and pc.batch_id = d.id and pc.amount > 0) then', '    and true then']]]],
      async (attempt, b) => code(await attempt(POST, [b, null, ref()])));
    t.same([mPreview, mPost], [Array(4).fill([['costs_unsealed_scope'], false]), Array(4).fill('costs_unsealed_scope')],
      'طفرتان: v_positive يبدأ صحيحاً ← المعاينة تقفل «أنتج الآن» بـcosts_unsealed_scope عن مصاريف لا تُحمَّل، وexists صحيح دائماً ← الترحيل يُرفض (الحالات الأربع)');
  });

  // ─── ق٢٢ (#2، #5): «داخل الكتلة» لقطة على سطر الخلطة عند التفعيل (FOUNDATION القاعدة ٤، مثل الكثافة) ──────────────────────
  const K22 = {};
  /**
   * مسوّدة بكميات بالكتابة المباشرة (كما كانت الشاشة القديمة تكتب سطورها): «نسخة جديدة» منذ 0025 بالموادّ وحدها (كلمة المالك 2026-11-10)، فالقواعد
   * التي تخصّ المسوّدة بكميات (الكتلة من النوع الحيّ، والتفعيل بطريقه القديم) تُفحص على مسوّدة كهذه. السطور [[مادّة، كمية، وحدة]].
   */
  const legacyDraft = async (rid, lines, basis = 1000) => {
    const vid = await must(U.manager, 'insert into public.recipe_versions (recipe_id, basis_kg) values ($1, $2) returning id', [rid, basis]);
    for (const [itemId, qty, unit = 'kg'] of lines) {
      await must(U.manager, 'insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, $3, $4) returning id', [vid, itemId, qty, unit]);
    }
    return vid;
  };
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
    // المسوّدة بلا لقطة، فتقرأ النوع الحيّ: مسوّدتان بكميات المفعَّلتين (بالكتابة المباشرة؛ «نسخة جديدة» بالموادّ وحدها منذ 0025، وكتلتها فارغة).
    const DA = await legacyDraft(RA.id, [[CORN, 983], [MISFILED, 20, 'L']]);
    const DB = await legacyDraft(RB.id, [[CORN, 1000], [FUEL2, 10, 'L']]);
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
      [`l.version_id = v.id and coalesce(l.in_basis, ${live}))::text end`, `l.version_id = v.id and ${live})::text end`],
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

  // ─── ق٣٢ (#1، في نطاق ق٢٥): وجبات مخزن المواد لا تخرج لطرف الناتج وحده (سابقة التحويل: الوجهة ترى مصدر مرآتها لا استلامات المصدر) ──────
  await section('ق٣٢', async () => {
    const { BR1, BR3 } = S;
    if (!BR3) throw new Error('تجهيز النطاق لم يكتمل');
    /** لكلّ سطر: مصادر وجباته، أو null (والمفتاح موجود)، أو absent. */
    const sources = async (user, b) => (await detail(user, b)).lines.map((l) => {
      if (!('draws' in l)) return 'absent';
      return l.draws === null ? null : l.draws.map((d) => d.source);
    });
    const used = async (user, b) => (await detail(user, b)).lines.map((l) => l.used_qty);
    const managerBR1 = await sources(U.manager, BR1);
    t.ok(managerBR1.length === 1 && Array.isArray(managerBR1[0]) && managerBR1[0].length > 0 && managerBR1[0].every((s) => /^PU-/u.test(s)),
      `ضابط: المدير يرى وجبات BR1 بأرقام استلاماتها (${JSON.stringify(managerBR1)})`);
    t.same(
      [await sources(U.keepFeed, BR1), await sources(U.keepFeed, BR3), await sources(U.accFeed, BR1), await sources(U.accFeed, BR3), await sources(U.accRaw, BR1), await sources(U.mgrRaw, BR1)],
      [[null], [null], [null], [null], managerBR1, managerBR1],
      'production_detail: draws = null لأمين العلف ومحاسبه (طرف الناتج وحده)، وكما هي لمحاسب المواد ومدير المواد (كان أمين العلف يقرأ أرقام استلامات مخزن المواد وتواريخها ومعرّفات وجباتها)');
    t.same([await used(U.keepFeed, BR1), await used(U.accFeed, BR3)], [await used(U.manager, BR1), await used(U.manager, BR3)],
      'والمسحوب الفعلي (used_qty) ظاهر لطرف الناتج كما للمدير: يرى المواد وكمياتها');
    const m = await mutated([['public.production_detail(uuid)', [["'draws', case when d.status = 'draft' or not v_in then null", "'draws', case when d.status = 'draft' then null"]]]], [],
      async ({ as, attempt }) => {
        await as(U.keepFeed);
        return (await attempt("select jsonb_typeof(public.production_detail($1) -> 'lines' -> 0 -> 'draws')", [BR1])).v;
      });
    t.eq(m, 'array', 'طفرة: draws بلا شرط مخزن المدخلات ← أمين العلف يقرأ وجبات مخزن المواد');
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

  // ─── ق٣٦ (#5): جزءا ق٢٦ بلا فحص سلوكي — تكرار قائم قبل المحفّز ─────────────────────────────────────────────────────────
  await section('ق٣٦', async () => {
    const result = (out) => (out.ok ? 'ok' : [out.code, out.hint]);
    const NAME = 'صيانة المولّد';
    const live = await must(U.accountant, 'insert into public.expense_categories (name) values ($1) returning id', [NAME]);
    // تكرار أقدم من المحفّز («المحفّز لا يفترض» خلوّ البيانات منه): يُعطَّل بدور صاحب الجدول في معاملة تثبت، فتُدرج «صيانه المولّد» (التاء المربوطة
    // هاءً: الاسم المطبَّع نفسه)، ثمّ يُعاد المحفّز وتُؤرشف. الحيّة أقدم من المؤرشفة.
    const twin = await db.asOwner(async (q) => {
      await q('alter table public.expense_categories disable trigger expense_categories_name_guard');
      const row = (await q("insert into public.expense_categories (name) values ('صيانه المولّد') returning id")).rows[0].id;
      await q('alter table public.expense_categories enable trigger expense_categories_name_guard');
      return row;
    }, U.manager, { commit: true });
    await must(U.accountant, 'update public.expense_categories set archived_at = now() where id = $1 returning id', [twin]);
    t.same(
      [(await db.admin('select archived_at is not null as archived from public.expense_categories where id = any ($1) order by created_at', [[live, twin]])).rows.map((r) => r.archived),
        (await db.admin("select tgenabled from pg_trigger where tgrelid = 'public.expense_categories'::regclass and tgname = 'expense_categories_name_guard'")).rows[0].tgenabled],
      [[false, true], 'O'], 'ضابط: فئتان بالاسم المطبَّع نفسه (الحيّة أقدم من المؤرشفة)، والمحفّز مفعَّل بعد المعاملة');
    const SAME = 'update public.expense_categories set name = $2 where id = $1 returning name';
    const INSERT = 'insert into public.expense_categories (name) values ($1) returning id';
    t.same([result(await call(U.accountant, SAME, [live, NAME])), result(await call(U.accountant, INSERT, [NAME]))],
      ['ok', ['category_name_taken', `توجد فئة «${NAME}»: اخترها بدل إنشاء أخرى.`]],
      'مع تكرار قائم قبل المحفّز: إعادة حفظ اسم الحيّة كما هو تمرّ، وفئة جديدة بالاسم يسمّي تلميحها الحيّة لا المؤرشفة');
    const NAME_FN = 'private.expense_categories_name_guard()';
    const asAcc = (pairs, sql, params) => mutated([[NAME_FN, pairs]], [], async ({ as, attempt }) => {
      await as(U.accountant, 'authenticated');
      return result(await attempt(sql, params));
    });
    const ARCHIVED = ['category_name_taken', 'توجد فئة «صيانه المولّد» مؤرشفة: أعِدها من الأرشيف بدل إنشاء أخرى.'];
    t.same(
      [await asAcc([["(tg_op = 'UPDATE' and new.name is not distinct from old.name) or ", '']], SAME, [live, NAME]),
        await asAcc([['order by x.archived_at is not null, x.system_code is not null, x.created_at, x.id', 'order by x.created_at desc, x.id']], INSERT, [NAME])],
      [ARCHIVED, ARCHIVED],
      'طفرتان: بلا «التعديل بلا تغيير الاسم لا يُفحص» تُرفض إعادة حفظ الحيّة بتلميح المؤرشفة، وبترتيب الأحدث أوّلاً يسمّي التلميح المؤرشفة والحيّة موجودة');
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

  // ═══ الجولة الثالثة (scratchpad/mill2/fixes3.md القسم أ؛ الملاحظات #0–#6 بنصّها وإثباتها في findings3.txt) ═══
  // ─── ق٣١ (#2): وحدة أساس المادّة لقطة على سطر الخلطة عند التفعيل (كالكثافة و«داخل الكتلة»؛ FOUNDATION القاعدة ٤ وE46) ─────────────
  const K31 = {};
  /** وحدات أساس سطور نسخة بترتيبها، من داخل معاملة. */
  const unitsOn = async (q, version) => (await q('select array_agg(base_unit order by line_no) as v from public.recipe_lines where version_id = $1', [version])).rows[0].v;
  await section('ق٣١', async () => {
    // «كاز البانية» يُنشأ من زرّ «أنشئ» في البانية بحقول newItemFields(query, 'raw'): مادّة أوّلية بالكيلو بخطوة 0.1، بلا أيّ حركة مخزون (#2
    // بخطواته)، ويدخل خلطة مفعَّلة: 983 ذرة + 17 كغم كاز = 1,000.
    const KAZ = await item('كاز البانية', 'raw', 'kg');
    const RK = await recipe('خلطة كاز البانية', [[CORN, 983], [KAZ, 17]]);
    const snapOf = async (version) => (await db.admin(`select i.name, l.base_unit, l.in_basis, l.density_kg_per_l::text as d from public.recipe_lines l
      join public.items i on i.id = l.item_id where l.version_id = $1 order by l.line_no`, [version])).rows.map((r) => [r.name, r.base_unit, r.in_basis, r.d]);
    t.same(await snapOf(RK.version), [['ذرة المراجعة', 'kg', true, null], ['كاز البانية', 'kg', true, null]],
      'التفعيل يكتب لقطة وحدة الأساس لكلّ سطر بجملة لقطتَي «داخل الكتلة» والكثافة');
    // التصحيح من نافذة المادّة: النوع والوحدة والكثافة معاً (items_stock_guard يسمح قبل أوّل حركة).
    await must(U.manager, "update public.items set kind = 'fuel', base_unit = 'L', density_kg_per_l = 0.85 where id = $1 returning id", [KAZ]);
    t.same(await nonZero(), {}, 'verify_mill صفر بعد تصحيح الكاز إلى وقود باللتر (كان recipe_frozen_bad_lines = 1 لا يزول بنسخة جديدة)');
    const refused = await call(U.manager, 'select public.create_production($1, $2, 1000, $3, $4, public.app_today())', [fresh(), RK.version, RAW, FEEDWH]);
    t.same([code(refused), refused.hint], ['item_changed', 'تغيّرت وحدة «كاز البانية» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.'],
      'create_production من النسخة المفعَّلة: item_changed بتلميحه (كانت تخطّط 17 كغم كازاً لتراتٍ بكثافة المادّة الحالية)');
    // طفرة (والنسخة ما زالت المفعَّلة): بلا فحص اللقطة تُنتَج، وسطر الكاز المكتوب 17 كغم يُخطَّط لتراتٍ بكثافة المادّة الآن:
    // 17 × 1,000 ÷ (1,000 × 0.85 × 0.1) = 200 خطوة ← 20.0 لتراً بكثافة 0.8500.
    const mChanged = await mutated([[CREATE_FN, [["if ln.line_base is not null and ((ln.line_base = 'kg' and ln.base_unit = 'L') or ln.base_unit not in ('kg', 'L')) then", 'if false then']]]], [], async ({ attempt }) => {
      const b = fresh();
      const out = await attempt('select public.create_production($1, $2, 1000, $3, $4, public.app_today())', [b, RK.version, RAW, FEEDWH]);
      return [code(out), (await attempt('select planned_qty_base::text as q, density_kg_per_l::text as d from public.production_inputs where batch_id = $1 and item_id = $2', [b, KAZ])).rows[0] ?? null];
    });
    t.same(mChanged, ['ok', { q: '20.000', d: '0.8500' }], 'طفرة: create_production بلا فحص اللقطة ← النسخة تُنتَج والكيلو المكتوب يصير لتراتٍ بكثافة المادّة الآن');
    const card = async (version = null) => (await must(U.manager, 'select public.recipe_detail($1, $2)', [RK.id, version])).lines.map((l) => [l.item_name, l.base_unit, l.unit_changed]);
    t.same(await card(), [['ذرة المراجعة', 'kg', false], ['كاز البانية', 'kg', true]], 'recipe_detail: base_unit من لقطة السطر، وunit_changed = true للكاز وfalse للذرة');
    // نسخة جديدة منسوخة من المفعَّلة (مسوّدة بلا لقطة فتقرأ الوحدة الحيّة)، ثمّ 1,000 ذرة + 20 لتر كاز (وقود خارج الكتلة) وتُفعَّل.
    const N = fresh();
    await must(U.manager, 'select public.new_recipe_version($1, $2)', [RK.id, N]);
    t.same(await card(N), [['ذرة المراجعة', 'kg', false], ['كاز البانية', 'L', false]], 'المسوّدة بلا لقطة: الوحدة الحيّة، وunit_changed = false');
    await must(U.manager, 'update public.recipe_lines set qty = 1000 where version_id = $1 and item_id = $2 returning id', [N, CORN]);
    await must(U.manager, "update public.recipe_lines set qty = 20, unit = 'L' where version_id = $1 and item_id = $2 returning id", [N, KAZ]);
    // «نسخة جديدة» منذ 0025 بالموادّ وحدها بلا أساس: الشاشة القديمة تكتب الكميات والأساس فتصير المسوّدة بكميات (وإلّا bad_basis).
    await must(U.manager, 'update public.recipe_versions set basis_kg = 1000 where id = $1 returning id', [N]);
    const activated = await call(U.manager, 'select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))', [N]);
    t.same([code(activated), activated.v?.retired_id], ['ok', RK.version], 'النسخة الجديدة (1,000 ذرة + 20 لتر كاز) تتفعّل وتقاعد القديمة');
    t.same([await snapOf(N), await nonZero(), await card(RK.version)],
      [[['ذرة المراجعة', 'kg', true, null], ['كاز البانية', 'L', false, '0.8500']], {}, [['ذرة المراجعة', 'kg', false], ['كاز البانية', 'kg', true]]],
      'لقطات النسخة الجديدة (الكاز لتر بكثافة 0.8500 خارج الكتلة)، وverify_mill صفر: المقاعدة بلقطة الكيلو لا تُعدّ خرقاً، وبطاقتها تقول unit_changed');
    // رصيد افتتاحي للكاز باللتر (أوّل حركة، بعد التصحيح)، ودفعة 500 كغم: الكاز 17 × 500 ÷ (1,000 × 0.85 × 0.1) = 100 خطوة ← 10.0 لترات.
    const opening = await must(U.manager, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 10) returning id', [RAW]);
    await must(U.manager, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 100, 100000) returning id', [opening, KAZ]);
    await must(U.manager, 'select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [opening, ref()]);
    const B = await batch(N, 500);
    t.same([(await inputRows(B)).map((r) => [r.name, r.in_basis, r.qty, r.d]), code(await post(U.manager, B))],
      [[['ذرة المراجعة', true, '500.000', null], ['كاز البانية', false, '10.000', '0.8500']], 'ok'], 'دفعة من النسخة الجديدة: الكاز 10.000 لترات بكثافة اللقطة، وتُرحَّل');
    // كثافة المادّة 0.80 بعدها: خطّة دفعة جديدة بلقطة السطر 0.85 (في #2 تبعت كثافة المادّة: 21.300 لتراً بـ0.8000).
    await must(U.manager, 'update public.items set density_kg_per_l = 0.80 where id = $1 returning id', [KAZ]);
    const B2 = await batch(N, 1000);
    t.same((await inputRows(B2)).map((r) => [r.name, r.qty, r.mass, r.d]), [['ذرة المراجعة', '1000.000', '1000.000', null], ['كاز البانية', '20.000', '17.000', '0.8500']],
      'بعد تعديل كثافة المادّة إلى 0.80: خطّة دفعة جديدة من النسخة بلقطة 0.8500 (20.000 لتراً، 17 كغم)');
    t.same(await nonZero(), {}, 'verify_mill صفر بعد الدفعتين');
    Object.assign(K31, { KAZ, RK, N });
  });
  await section('ق٣١ طفرات', async () => {
    const { KAZ, RK, N } = K31;
    if (!N) throw new Error('ق٣١ لم يكتمل');
    // الضابط السلوكي أوّلاً (مراجعة 0016 الرابعة #2، ق٤٣): سطر نسخة مفعَّلة فُرّغت لقطة وحدته يمسكه الفحص ٣ كما هو، قبل أيّ طفرة بمرساة على نصّه
    // (كان بعد طفرة الوحدة الحيّة، فانحدار في نصّ الفحص نفسه لا يُمسك إلّا برمية مرساتها).
    const nulled = (pairs) => mutated(pairs, [], async ({ oq }) => {
      await oq('update public.recipe_lines set base_unit = null where version_id = $1', [N]);
      return nonZeroOn(oq);
    });
    t.same(await nulled([]), { recipe_frozen_bad_lines: 1 }, 'ضابط: سطر نسخة مفعَّلة فُرّغت لقطة وحدته يمسكه الفحص ٣');
    // (١) الفحص ٣ بالوحدة الحيّة كما كان ← المقاعدة (لقطة كيلو والكاز لتر الآن) خرق أبديّ؛ (٢) وبلا «لقطة فارغة» يعبر سطر نسخة مفعَّلة بلا وحدة.
    const live3 = await mutated([['public.verify_mill()', [["      where l.org_id = v.org_id and l.version_id = v.id and (l.base_unit is null or (l.base_unit = 'L' and l.density_kg_per_l is null)\n        or (l.unit = 'L' and l.density_kg_per_l is null)))",
      "      join public.items i on i.org_id = l.org_id and i.id = l.item_id where l.org_id = v.org_id and l.version_id = v.id and i.base_unit = 'L' and l.density_kg_per_l is null)"]]]], [],
    ({ oq }) => nonZeroOn(oq));
    t.same([live3, await nulled([['public.verify_mill()', [['l.base_unit is null or ', '']]]])], [{ recipe_frozen_bad_lines: 1 }, {}],
      'طفرتا الفحص ٣: بالوحدة الحيّة تُعدّ المقاعدة خرقاً بعد التصحيح؛ وبلا شرط اللقطة الفارغة يعبر سطر نسخة مفعَّلة بلا وحدة');
    // (٣) create_production بكثافة المادّة لا لقطة السطر ← خطّة النسخة الجديدة بـ0.80: 20 لتراً × 0.80 = 16 كغم (كانت 17 بلقطة 0.85).
    const mDensity = await mutated([[CREATE_FN, [
      ['v_line_kg := private.recipe_line_kg(ln.qty, ln.unit, coalesce(ln.density_kg_per_l, ln.item_density));', 'v_line_kg := private.recipe_line_kg(ln.qty, ln.unit, ln.item_density);'],
      ["v_density := case when ln.base_unit = 'L' then round(coalesce(ln.density_kg_per_l, ln.item_density), 4) end;", "v_density := case when ln.base_unit = 'L' then round(ln.item_density, 4) end;"],
    ]]], [], async ({ attempt }) => {
      const b = fresh();
      await attempt('select public.create_production($1, $2, 1000, $3, $4, public.app_today())', [b, N, RAW, FEEDWH]);
      return (await attempt('select planned_qty_base::text as q, planned_mass_kg::text as m, density_kg_per_l::text as d from public.production_inputs where batch_id = $1 and item_id = $2', [b, KAZ])).rows[0] ?? null;
    });
    t.same(mDensity, { q: '20.000', m: '16.000', d: '0.8000' }, 'طفرة: create_production بكثافة المادّة ← خطّة الكاز بـ0.80 لا لقطة 0.85');
    // (٤) التفعيل بلا لقطة الوحدة ← سطر النسخة بلا وحدة، وverify_mill يمسكه.
    const mActivate = await mutated([['public.activate_recipe_version(uuid, integer)', [['update public.recipe_lines set in_basis = v_in, base_unit = ln.base_unit,', 'update public.recipe_lines set in_basis = v_in,']]]], [],
      async ({ oq, attempt }) => {
        const vid = fresh();
        await attempt("select public.create_recipe($1, $2, 'خلطة بلا لقطة وحدة', $3, 1000, $4::jsonb, '[]'::jsonb, true)", [fresh(), vid, FEED, JSON.stringify([{ item_id: CORN, qty: 1000, unit: 'kg' }])]);
        return [await unitsOn(oq, vid), await nonZeroOn(oq)];
      });
    t.same(mActivate, [[null], { recipe_frozen_bad_lines: 1 }], 'طفرة: التفعيل بلا لقطة الوحدة ← السطر بلا وحدة وverify_mill يمسكه');
    // (٥) الملء بنصّ 0016 نفسه على سطور فُرّغت وحدتها: وحدة يوم التفعيل من لقطة الكثافة — المقاعدة كيلو والكيلو، والجديدة كيلو ولتر — والثوابت صفر.
    // وحارس السطر بلا «تغيّر الوحدة وحدها يمرّ» يرفض الجملة not_draft؛ والملء من وحدة المادّة الآن (نصّ المواصفة حرفاً) يعطي المقاعدة لتراً بلا
    // كثافة فيبقى الخرق.
    const BACKFILL_UNIT = /update public\.recipe_lines l set base_unit = [\s\S]*?;/u.exec(MIGRATION_0016)?.[0];
    t.ok(Boolean(BACKFILL_UNIT), 'جملة ملء الوحدة موجودة في نصّ 0016');
    const refill = (guardEdits, sql = BACKFILL_UNIT) => mutated([], [], async ({ oq, attempt }) => {
      await oq('update public.recipe_lines set base_unit = null where version_id = any ($1)', [[RK.version, N]]);
      if (guardEdits.length) {
        let broken = (await oq("select pg_get_functiondef('private.recipe_lines_guard()'::regprocedure) as d")).rows[0].d;
        for (const [from, to] of guardEdits) {
          if (broken.split(from).length !== 2) throw new Error(`طفرة الحارس: المرساة ليست مرّة واحدة: ${from}`);
          broken = broken.split(from).join(to);
        }
        await oq(broken);
      }
      const out = await attempt(sql);
      return [out.ok ? 'ok' : out.code, await unitsOn(oq, RK.version), await unitsOn(oq, N), await nonZeroOn(oq)];
    });
    const LIVE_UNIT = BACKFILL_UNIT?.split("case when l.density_kg_per_l is not null then 'L' else 'kg' end").join('(select i.base_unit from public.items i where i.org_id = l.org_id and i.id = l.item_id)');
    t.same(
      [await refill([]), (await refill([["\n    or new.base_unit is distinct from old.base_unit) then", ') then']]))[0], await refill([], LIVE_UNIT)],
      [['ok', ['kg', 'kg'], ['kg', 'L'], {}], 'not_draft', ['ok', ['kg', 'L'], ['kg', 'L'], { recipe_frozen_bad_lines: 1 }]],
      'الملء: وحدة يوم التفعيل من لقطة الكثافة والثوابت صفر؛ وطفرة الحارس ← not_draft؛ والملء من وحدة المادّة الآن ← المقاعدة لتر بلا كثافة فيبقى الخرق');
    // (٦) recipe_detail: unit_changed ثابت false، والوحدة الحيّة بدل اللقطة.
    const detailOf = (pairs) => mutated([['public.recipe_detail(uuid, uuid)', pairs]], [], async ({ oq }) =>
      (await oq('select public.recipe_detail($1, $2) as v', [RK.id, RK.version])).rows[0].v.lines.map((l) => [l.item_name, l.base_unit, l.unit_changed]));
    t.same([await detailOf([["'unit_changed', l.base_unit is not null and ((l.base_unit = 'kg' and i.base_unit = 'L') or i.base_unit not in ('kg', 'L')),", "'unit_changed', false,"]]),
      await detailOf([["'base_unit', coalesce(l.base_unit, i.base_unit),", "'base_unit', i.base_unit,"]])],
    [[['ذرة المراجعة', 'kg', false], ['كاز البانية', 'kg', false]], [['ذرة المراجعة', 'kg', false], ['كاز البانية', 'L', true]]],
    'طفرتا recipe_detail: unit_changed ثابت لا يقول إنّ وحدة الكاز تغيّرت، وbase_unit من المادّة الآن يقول لتراً لسطر حُسب بالكيلو');
    // (٧) المنح: العمود غير ممنوح بالإدراج ولا بالتعديل لأحد (الحدّ هو المنح، درس 0015) وضابطه؛ والقيد يرفض غير الكيلو واللتر.
    const grants = async (q) => (await q(`select has_column_privilege('authenticated', 'public.recipe_lines', 'base_unit', 'INSERT') as ai,
      has_column_privilege('authenticated', 'public.recipe_lines', 'base_unit', 'UPDATE') as au, has_column_privilege('anon', 'public.recipe_lines', 'base_unit', 'INSERT') as ni,
      has_column_privilege('anon', 'public.recipe_lines', 'base_unit', 'UPDATE') as nu`)).rows[0];
    t.same(await grants(db.admin), { ai: false, au: false, ni: false, nu: false }, 'الكتالوج: base_unit غير ممنوح بالإدراج ولا بالتعديل لأحد');
    t.eq((await mutated([], ['grant update (base_unit) on public.recipe_lines to authenticated'], ({ oq }) => grants(oq))).au, true, 'ضابط: منح العمود بمعاملة ترجع يقلب فحص الكتالوج');
    t.eq(code(await call(U.manager, "update public.recipe_lines set base_unit = 'L' where version_id = $1", [K22.DA])), 'permission denied for table recipe_lines',
      'المدير لا يكتب لقطة الوحدة مباشرةً ولو على المسوّدة');
    const bad = await mutated([], [], async ({ attempt }) => code(await attempt("update public.recipe_lines set base_unit = 'pc' where version_id = $1", [N])));
    t.ok(/recipe_lines_base_unit_check/u.test(bad), `القيد: لقطة غير الكيلو واللتر تُرفض (${bad})`);
  });

  // ─── ق٣٥ (#4): الحارس يفرّغ اللقطات الثلاث عند الإدراج ───────────────────────────────────────────────────────────────
  await section('ق٣٥', async () => {
    const DV = fresh();
    await must(U.manager, "select public.create_recipe($1, $2, 'خلطة الإدراج المباشر', $3, 1000, $4::jsonb, '[]'::jsonb, false)", [fresh(), DV, FEED, JSON.stringify([{ item_id: CORN, qty: 500, unit: 'kg' }])]);
    // الأعمدة الثلاثة غير ممنوحة، فلا طريق إليها إلّا صاحب الجدول: إدراج مباشر بدور postgres وهويّة المدير، بمعاملة ترجع، بلقطات مكتوبة.
    const INSERT = "insert into public.recipe_lines (version_id, item_id, qty, unit, in_basis, base_unit, density_kg_per_l) values ($1, $2, 10, 'L', false, 'L', 0.92) returning in_basis, base_unit, density_kg_per_l::text as d";
    const GUARD = 'private.recipe_lines_guard()';
    const direct = (pairs) => mutated(pairs, [], async ({ attempt }) => {
      const out = await attempt(INSERT, [DV, OIL]);
      return out.ok ? out.rows[0] : out.code;
    });
    t.same(await direct([]), { in_basis: null, base_unit: null, d: null }, 'إدراج مباشر في مسوّدة بـin_basis = false وbase_unit = L وكثافة 0.92: الحارس يفرّغ الثلاث');
    t.same(
      [await direct([[GUARD, [['    new.density_kg_per_l := null;\n', '']]]]), await direct([[GUARD, [['    new.in_basis := null;\n', '']]]]), await direct([[GUARD, [['    new.base_unit := null;\n', '']]]])],
      [{ in_basis: null, base_unit: null, d: '0.92' }, { in_basis: false, base_unit: null, d: null }, { in_basis: null, base_unit: 'L', d: null }],
      'طفرات: بلا تفريغ الكثافة أو «داخل الكتلة» أو وحدة الأساس تبقى قيمتها المكتوبة في سطر المسوّدة',
    );
  });


  // ═══ الجولة الرابعة (scratchpad/mill2/fixes4.md القسم أ، ق٤١–ق٤٣؛ الملاحظات #0–#2 بنصّها وإثباتها في findings4.txt) ═══
  // كلّ إصلاح بفحص يفشل على 0016 كما كانت عند 93a85f0 وينجح بعده، والسلوك أوّلاً ثمّ الطفرات في قسم وحده (ق٤٣): رمية مرساة في طفرة لا تحجب فحصاً
  // سلوكياً. والطفرة بمعاملة ترجع تكسر فحصها بالضبط.
  const ACTIVATE_FN = 'public.activate_recipe_version(uuid, integer)';
  const RECIPE_DETAIL_FN = 'public.recipe_detail(uuid, uuid)';
  const OVERVIEW_FN = 'public.recipes_overview()';
  const NEW_VERSION_FN = 'public.new_recipe_version(uuid, uuid)';
  const ACTIVATE = 'select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))';
  const PRODUCE = 'select public.create_production($1, $2, 1000, $3, $4, public.app_today())';
  /** سطور نسخة بترتيبها: [المادّة، الكمية، الوحدة]. */
  const linesOn = async (q, version) => (await q(`select i.name, l.qty::text as qty, l.unit from public.recipe_lines l join public.items i on i.id = l.item_id
    where l.version_id = $1 order by l.line_no`, [version])).rows.map((r) => [r.name, r.qty, r.unit]);
  /** نصّ بمرساة مستبدلة، والمرساة مرّة واحدة بالضبط (طفرة لا تعبر بصمت بلا أثر). */
  const swap = (text, from, to) => {
    if (text.split(from).length !== 2) throw new Error(`المرساة ليست مرّة واحدة: ${from.slice(0, 80)}`);
    return text.split(from).join(to);
  };

  // ─── ق٤١ (#0): لا يُرفض إلّا ما لا تستطيع اللقطة تخطيطه، و«نسخة جديدة» تنسخ سطر اللتر لمادّة صارت بالكيلو ─────────────────────
  const K41 = {};
  await section('ق٤١', async () => {
    // «دبس» مادّة أوّلية باللتر بكثافة 1.4 في خلطة مفعَّلة: ذرة 972 + دبس 20 لتراً (28 كغم) = 1,000، فلقطة سطره لتر بكثافة 1.4000 داخل الكتلة.
    // والضابطان في الاتّجاهين الآخرين: «زيت» أوّلي بالكيلو (983 + 17) يُصحَّح لتراً بكثافة 0.9، و«بريمكس» بالكيلو (990 + 10) يُصحَّح قطعة.
    const DIBS = await item('دبس الجولة الرابعة', 'raw', 'L', 1.4);
    const OIL41 = await item('زيت الجولة الرابعة', 'raw', 'kg');
    const PRE41 = await item('بريمكس الجولة الرابعة', 'raw', 'kg');
    const RD = await recipe('خلطة الدبس', [[CORN, 972], [DIBS, 20, 'L']]);
    const RO = await recipe('خلطة زيت سُجّل بالكيلو', [[CORN, 983], [OIL41, 17]]);
    const RP = await recipe('خلطة بريمكس صار قطعة', [[CORN, 990], [PRE41, 10]]);
    // التصحيحات قبل أيّ حركة (items_stock_guard يسمح): الدبس كيلوغراماً بلا كثافة (items_density_unit_check)، والزيت لتراً، والبريمكس قطعة بخطوة 1.
    await must(U.manager, "update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1 returning id", [DIBS]);
    await must(U.manager, "update public.items set base_unit = 'L', density_kg_per_l = 0.9 where id = $1 returning id", [OIL41]);
    await must(U.manager, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1 returning id", [PRE41]);
    t.same(await nonZero(), {}, 'verify_mill صفر بعد التصحيحات الثلاث (اللقطات كما كتبها التفعيل)');
    // create_production 1,000 كغم من خلطة الدبس: كتلة السطر من لقطة الكثافة 20 × 1.4 = 28 كغم، والمخطّط بالكيلو بخطوة 0.1:
    // 28 × 1,000 ÷ (1,000 × 0.1) = 280 خطوة ← 28.0 كغم، وسطر الدفعة بالكيلو بلا كثافة؛ والذرة 972.0.
    const planOf = async (b) => (await db.admin(`select i.name, p.base_unit, p.in_basis, p.planned_qty_base::text as qty, p.planned_mass_kg::text as mass,
      p.density_kg_per_l::text as d from public.production_inputs p join public.items i on i.id = p.item_id where p.batch_id = $1 order by p.line_no`, [b]))
      .rows.map((r) => [r.name, r.base_unit, r.in_basis, r.qty, r.mass, r.d]);
    const B = fresh();
    const made = await call(U.manager, PRODUCE, [B, RD.version, RAW, FEEDWH]);
    t.same([code(made), made.hint ?? null, await planOf(B)],
      ['ok', null, [['ذرة المراجعة', 'kg', true, '972.000', '972.000', null], ['دبس الجولة الرابعة', 'kg', true, '28.000', '28.000', null]]],
      'create_production بلقطة لتر ومادّة صارت بالكيلو: تنجح، والدبس 28.000 كغم لكلّ 1,000 بالكيلو بلا كثافة (كانت item_changed)');
    const refusals = [];
    for (const [r, name] of [[RO, 'زيت الجولة الرابعة'], [RP, 'بريمكس الجولة الرابعة']]) {
      const out = await call(U.manager, PRODUCE, [fresh(), r.version, RAW, FEEDWH]);
      refusals.push([code(out), out.hint === `تغيّرت وحدة «${name}» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.`]);
    }
    t.same(refusals, [['item_changed', true], ['item_changed', true]],
      'والاتّجاهان الآخران يبقيان يُرفضان item_changed بتلميحه: لقطة كيلوغرام ومادّة صارت باللتر (كثافة لم تُلقط)، ومادّة صارت قطعة');
    const flags = [];
    for (const [r, name] of [[RD, 'دبس الجولة الرابعة'], [RO, 'زيت الجولة الرابعة'], [RP, 'بريمكس الجولة الرابعة']]) {
      const l = (await must(U.manager, 'select public.recipe_detail($1, null)', [r.id])).lines.find((x) => x.item_name === name);
      flags.push(l && [l.base_unit, l.unit, l.mass_kg, l.share_pct, l.unit_changed, l.unit_mismatch]);
    }
    t.same(flags, [['L', 'L', '28.000', '2.80', false, true], ['kg', 'kg', '17.000', '1.70', true, false], ['kg', 'kg', '10.000', '1.00', true, false]],
      'recipe_detail.unit_changed بشرط الرفض نفسه: false للدبس (يُنتَج بها) وtrue للزيت والبريمكس؛ وunit_mismatch = true لسطر الدبس المكتوب باللتر وحده');
    // «نسخة جديدة» بمعاملة ترجع (فتبقى النسخ المفعَّلة للطفرات): منذ 0025 بالموادّ وحدها، فلا كمية تُنسخ ولا تحويل: سطر الدبس بلا كمية بوحدته الآن
    // (كيلوغرام)، وسطر الزيت بلا كمية باللتر (وحدته الآن)، وتتفعّل النسختان بالموادّ.
    const copies = [];
    for (const r of [RD, RO]) {
      copies.push(await mutated([], [], async ({ oq, attempt }) => {
        const nv = fresh();
        const out = await attempt('select public.new_recipe_version($1, $2)', [r.id, nv]);
        if (!out.ok) return [out.code];
        return ['ok', await linesOn(oq, nv), code(await attempt(ACTIVATE, [nv]))];
      }));
    }
    t.same(copies,
      [['ok', [['ذرة المراجعة', null, 'kg'], ['دبس الجولة الرابعة', null, 'kg']], 'ok'], ['ok', [['ذرة المراجعة', null, 'kg'], ['زيت الجولة الرابعة', null, 'L']], 'ok']],
      'new_recipe_version (0025): الموادّ وحدها بوحدة كلّ مادّة الآن بلا تحويل (الدبس كيلوغرام والزيت لتر)، وتتفعّل النسختان بالموادّ');
    // رصيد افتتاحي للدبس بالكيلو (أوّل حركة، فتتجمّد وحدته كيلوغراماً) ودفعة 100 كغم: الدبس 28 × 100 ÷ (1,000 × 0.1) = 28 خطوة ← 2.8 كغم،
    // والذرة 97.2؛ تُعاين بلا مشكلة وتُرحَّل، والثوابت صفر.
    const opening = await must(U.manager, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 10) returning id', [RAW]);
    await must(U.manager, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 100, 60000) returning id', [opening, DIBS]);
    await must(U.manager, 'select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [opening, ref()]);
    const B100 = await batch(RD.version, 100);
    const look = await preview(U.manager, B100);
    t.same([(await planOf(B100)).map((r) => [r[0], r[3]]), look.problems, look.can_post, code(await post(U.manager, B100))],
      [[['ذرة المراجعة', '97.200'], ['دبس الجولة الرابعة', '2.800']], [], true, 'ok'], 'دفعة 100 كغم من خلطة الدبس: دبس 2.800 كغم وذرة 97.200، بلا مشكلة، وتُرحَّل');
    t.same([await nonZero(), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بعد ترحيل دفعة الدبس');
    Object.assign(K41, { RD, RP });
  });
  await section('ق٤١ طفرات', async () => {
    const { RD, RP } = K41;
    if (!RP) throw new Error('ق٤١ لم يكتمل');
    // (١) شرط الرفض كما كان (أيّ تغيّر للوحدة) ← خلطة الدبس تُرفض item_changed؛ (٢) بلا فرع القطعة ← البريمكس يصل bad_recipe_unit لا item_changed.
    const COND = "if ln.line_base is not null and ((ln.line_base = 'kg' and ln.base_unit = 'L') or ln.base_unit not in ('kg', 'L')) then";
    const produce = (to, version) => mutated([[CREATE_FN, [[COND, to]]]], [], async ({ attempt }) => code(await attempt(PRODUCE, [fresh(), version, RAW, FEEDWH])));
    t.same([await produce('if ln.line_base is not null and ln.line_base is distinct from ln.base_unit then', RD.version),
      await produce("if ln.line_base is not null and ln.line_base = 'kg' and ln.base_unit = 'L' then", RP.version)],
    ['item_changed', 'bad_recipe_unit'], 'طفرتا create_production: الرفض بأيّ تغيّر للوحدة يوقف خلطة الدبس، وبلا فرع القطعة يمرّ البريمكس إلى رفض آخر');
    // (٣) unit_changed بأيّ تغيّر ← ينبّه لخلطة الدبس التي يُنتَج بها؛ (٤) بلا فرع القطعة ← يسكت عن البريمكس.
    const UNIT_CHANGED = "'unit_changed', l.base_unit is not null and ((l.base_unit = 'kg' and i.base_unit = 'L') or i.base_unit not in ('kg', 'L')),";
    const flagged = (to, r, name) => mutated([[RECIPE_DETAIL_FN, [[UNIT_CHANGED, to]]]], [], async ({ oq }) =>
      (await oq('select public.recipe_detail($1, null) as v', [r.id])).rows[0].v.lines.find((l) => l.item_name === name).unit_changed);
    t.same([await flagged("'unit_changed', coalesce(l.base_unit <> i.base_unit, false),", RD, 'دبس الجولة الرابعة'),
      await flagged("'unit_changed', coalesce(l.base_unit = 'kg' and i.base_unit = 'L', false),", RP, 'بريمكس الجولة الرابعة')],
    [true, false], 'طفرتا recipe_detail: unit_changed بأيّ تغيّر ينبّه لخلطة الدبس التي يُنتَج بها، وبلا فرع القطعة يسكت عن البريمكس');
    // (٥) «نسخة جديدة» (0025) تنسخ كمية ← سطور بكمية في مسوّدة بلا أساس؛ (٦) الأساس من المصدر ← مسوّدة بالموادّ بأساس مكتوب.
    const copied = (pairs) => mutated([[NEW_VERSION_FN, pairs]], [], async ({ oq, attempt }) => {
      const nv = fresh();
      const out = await attempt('select public.new_recipe_version($1, $2)', [RD.id, nv]);
      return out.ok ? [await linesOn(oq, nv), (await oq('select basis_kg::text as b from public.recipe_versions where id = $1', [nv])).rows[0].b] : out.code;
    });
    t.same([await copied([]), await copied([['values (v_org, v.id, ln.item_id, null, ln.base_unit);', 'values (v_org, v.id, ln.item_id, 1, ln.base_unit);']]),
      await copied([['values (p_id, v_org, r.id, null) returning * into v;', 'values (p_id, v_org, r.id, coalesce(s.basis_kg, 1000)) returning * into v;']])],
    [[[['ذرة المراجعة', null, 'kg'], ['دبس الجولة الرابعة', null, 'kg']], null], [[['ذرة المراجعة', '1.000', 'kg'], ['دبس الجولة الرابعة', '1.000', 'kg']], null],
      [[['ذرة المراجعة', null, 'kg'], ['دبس الجولة الرابعة', null, 'kg']], '1000']],
    'طفرتا new_recipe_version (والضابط): بكمية منسوخة تصير المسوّدة بكميات بلا أساس، وبالأساس من المصدر تصير بالموادّ بأساس مكتوب');
  });

  // ─── ق٤٢ (#1): لا سطر باللتر بلا كثافة في نسخة مفعَّلة، ولا قارئ يرمي بسطر واحد ─────────────────────────────────────────────
  const K42 = {};
  const UNIT_CHECK = "if ln.unit = 'L' and ln.base_unit <> 'L' then";
  await section('ق٤٢', async () => {
    // «كاز» وقود باللتر بكثافة 0.85، و«مولاس» أوّلي باللتر بكثافة 1.4، كلّ واحد في مسوّدة (create_recipe بلا تفعيل): ذرة 1,000 + كاز 20 لتراً،
    // وذرة 986 + مولاس 10 لترات (14 كغم)؛ ثمّ تُصحَّح المادّتان كيلوغراماً قبل أيّ حركة (#1 بخطواته).
    const KAZ42 = await item('كاز الجولة الرابعة', 'fuel', 'L', 0.85);
    const MOL42 = await item('مولاس الجولة الرابعة', 'raw', 'L', 1.4);
    const draft = async (name, lines) => {
      const rid = fresh();
      const vid = fresh();
      await must(U.manager, "select public.create_recipe($1, $2, $3, $4, 1000, $5::jsonb, '[]'::jsonb, false)",
        [rid, vid, name, FEED, JSON.stringify(lines.map(([itemId, qty, unit = 'kg']) => ({ item_id: itemId, qty, unit })))]);
      return { id: rid, version: vid };
    };
    const DK = await draft('مسوّدة كاز باللتر', [[CORN, 1000], [KAZ42, 20, 'L']]);
    const DM = await draft('مسوّدة مولاس باللتر', [[CORN, 986], [MOL42, 10, 'L']]);
    for (const x of [KAZ42, MOL42]) await must(U.manager, "update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1 returning id", [x]);
    const cardOf = async (r) => {
      const out = await call(U.manager, 'select public.recipe_detail($1, $2)', [r.id, r.version]);
      return out.ok ? [out.v.mass_kg, out.v.lines.map((l) => [l.item_name, l.unit, l.mass_kg, l.share_pct, l.in_basis, l.unit_mismatch])] : out.code;
    };
    t.same(await cardOf(DK), ['1000.000', [['ذرة المراجعة', 'kg', '1000.000', '100.00', true, false], ['كاز الجولة الرابعة', 'L', null, null, false, true]]],
      'recipe_detail لمسوّدة الكاز: سطره (وقود خارج الكتلة) بكتلة وحصّة فارغتين وunit_mismatch = true، ومجموع الكتلة 1,000 (كانت البطاقة ترمي density_not_positive)');
    t.same(await cardOf(DM), [null, [['ذرة المراجعة', 'kg', '986.000', '98.60', true, false], ['مولاس الجولة الرابعة', 'L', null, null, true, true]]],
      'recipe_detail لمسوّدة المولاس: سطره داخل الكتلة بكتلة فارغة، فمجموع الكتلة فارغ لا 986 ناقصاً بصمت');
    // التفعيل (بمعاملة ترجع) يُرفض قبل أيّ حساب بجملة حارس السطر، خارج الكتلة وداخلها.
    const activateIn = (pairs, version) => mutated(pairs, [], async ({ attempt }) => {
      const out = await attempt(ACTIVATE, [version]);
      return [code(out), out.ok ? null : out.hint];
    });
    const unitHint = (name) => `«${name}» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.`;
    t.same([await activateIn([], DK.version), await activateIn([], DM.version)],
      [['bad_recipe_unit', unitHint('كاز الجولة الرابعة')], ['bad_recipe_unit', unitHint('مولاس الجولة الرابعة')]],
      'activate_recipe_version: سطر باللتر لمادّة صارت بالكيلو يُرفض bad_recipe_unit ويسمّيها، خارج الكتلة (كان يُفعَّل) وداخلها (كان density_not_positive)');
    // حالة مجمَّدة مزروعة بدور postgres كما تركها التفعيل قبل الإصلاح (#1): مسوّدة الكاز تُفعَّل بالتفعيل بلا فحص سطر اللتر بمعاملة ترجع، فلقطة سطر
    // الكاز لتر ووحدة أساس كيلوغرام خارج الكتلة بلا كثافة. والزرع يجري على التفعيل قبل الإصلاح وبعده: الفحص يُشال إن وُجد.
    const planted = (pairs, run) => mutated(pairs, [], async (ctx) => {
      const def = (await ctx.oq('select pg_get_functiondef($1::regprocedure) as d', [ACTIVATE_FN])).rows[0].d;
      if (def.split(UNIT_CHECK).length === 2) await ctx.oq(def.split(UNIT_CHECK).join('if false then'));
      const out = await ctx.attempt(ACTIVATE, [DK.version]);
      if (!out.ok) throw new Error(`الزرع: ${out.code}`);
      return run(ctx);
    });
    /** ما يراه القرّاء في الحالة المزروعة: لقطة السطر، والثوابت، وقطع لوحة المعمل للمدير ومشغّل المعمل، وبطاقة النسخة. */
    const readers = (pairs = []) => planted(pairs, async ({ oq, as, attempt }) => {
      const snap = (await oq('select unit, base_unit, in_basis, density_kg_per_l::text as d from public.recipe_lines where version_id = $1 and item_id = $2', [DK.version, KAZ42])).rows[0];
      const verify = await nonZeroOn(oq);
      const pieces = [];
      for (const user of [U.manager, U.miller]) {
        await as(user);
        const out = await attempt('select public.recipes_overview()');
        pieces.push(out.ok ? out.v.recipes.find((x) => x.id === DK.id).active.pieces.map((p) => [p.item_name, p.mass_kg]) : out.code);
      }
      await as(U.manager);
      const detail = await attempt('select public.recipe_detail($1, null)', [DK.id]);
      const card = detail.ok ? [detail.v.mass_kg, detail.v.lines.map((l) => [l.item_name, l.mass_kg, l.share_pct, l.in_basis, l.unit_changed, l.unit_mismatch])] : detail.code;
      return { snap, verify, pieces, card };
    });
    const live = await readers();
    t.same(live.snap, { unit: 'L', base_unit: 'kg', in_basis: false, d: null }, 'الزرع: لقطة سطر الكاز كما في #1 (لتر، ووحدة أساس كيلوغرام، خارج الكتلة، بلا كثافة)');
    t.same(live.verify, { recipe_frozen_bad_lines: 1 }, 'verify_mill الفحص ٣ يمسك سطراً مكتوباً باللتر بلا لقطة كثافة في نسخة مفعَّلة (كان {})');
    const PIECES = [['ذرة المراجعة', '1000.000'], ['كاز الجولة الرابعة', null]];
    t.same(live.pieces, [PIECES, PIECES], 'recipes_overview للمدير ومشغّل المعمل لا يرمي: قطعة الكاز بكتلة فارغة أخيراً (كانت لوحة المعمل كلّها ترمي density_not_positive)');
    t.same(live.card, ['1000.000', [['ذرة المراجعة', '1000.000', '100.00', true, false, false], ['كاز الجولة الرابعة', null, null, false, false, true]]],
      'recipe_detail للنسخة المزروعة لا يرمي: الكاز بكتلة وحصّة فارغتين وunit_mismatch = true، ومجموع الكتلة 1,000');
    // «نسخة جديدة» من النسخة المزروعة: منذ 0025 بالموادّ وحدها، فلا كمية تُحوَّل ولا كثافة تُطلب: المسوّدة تُنشأ وسطر الكاز بوحدته الآن (كيلوغرام).
    const copyPlanted = (pairs = []) => planted(pairs, async ({ oq, attempt }) => {
      const nv = fresh();
      const out = await attempt('select public.new_recipe_version($1, $2)', [DK.id, nv]);
      return [code(out), out.ok ? null : out.hint, (await oq('select count(*)::int as n from public.recipe_versions where id = $1', [nv])).rows[0].n];
    });
    t.same(await copyPlanted(), ['ok', null, 1],
      'new_recipe_version (0025) من نسخة سطرها باللتر بلا لقطة كثافة: تُنسخ الموادّ وحدها فلا كثافة تُطلب، والمسوّدة تُنشأ');
    // فرع الأساس في rollback_0016: كتلة الرفض وحدها بفرعَي المال والوحدة معطَّلين (في قاعدة الحزمة معدّلات وتكاليف وأسعار من هذا الملف ومن غيره،
    // فيوقف فرع المال التراجع قبل أن يصل الأساس). النسخة المزروعة تزيد ما يوقفه بواحد (كتلة الكاز لا تُحسب، والمجموع بلاها = الأساس) بـrollback_blocked،
    // وكان يرمي density_not_positive.
    const refusal = /\ndo \$\$\n[\s\S]*?\n\$\$;\n/u.exec(ROLLBACK_0016)?.[0] ?? '';
    const basisOnly = swap(swap(refusal, 'if v_rates > 0 or v_costs + v_allocs + v_replaced > 0 or v_prices > 0 then', 'if false then'), 'if v_units > 0 then', 'if false then');
    const blockedCount = (sql) => async ({ attempt }) => {
      const out = await attempt(sql);
      if (out.ok) return 0;
      const n = out.code === 'rollback_blocked' ? /في القاعدة (\d+) نسخة/u.exec(out.hint ?? '')?.[1] : null;
      return n ? Number(n) : out.code;
    };
    const control = await mutated([], [], blockedCount(basisOnly));
    const withPlanted = await planted([], blockedCount(basisOnly));
    t.same([typeof control, withPlanted], ['number', typeof control === 'number' ? control + 1 : 'عدد'],
      `فرع الأساس في التراجع: النسخة المزروعة توقفه rollback_blocked وتزيد العدد من ${control} إلى ${typeof control === 'number' ? control + 1 : '؟'} (كان density_not_positive)`);
    Object.assign(K42, { DK, DM, activateIn, readers, copyPlanted, planted, blockedCount, basisOnly, control });
  });
  await section('ق٤٢ طفرات', async () => {
    const { DK, DM, activateIn, readers, copyPlanted, planted, blockedCount, basisOnly, control } = K42;
    if (!planted) throw new Error('ق٤٢ لم يكتمل');
    // (١) التفعيل بلا فحص سطر اللتر ← مسوّدة الكاز تُفعَّل خارج الكتلة (#1)، ومسوّدة المولاس ترمي density_not_positive بتلميح يطلب كثافة لمادّة لا تقبلها.
    const noCheck = [[ACTIVATE_FN, [[UNIT_CHECK, 'if false then']]]];
    t.same([(await activateIn(noCheck, DK.version))[0], (await activateIn(noCheck, DM.version))[0]], ['ok', 'density_not_positive'],
      'طفرة: التفعيل بلا فحص سطر اللتر ← الكاز يُفعَّل بلقطة كيلوغرام بلا كثافة، والمولاس يرمي density_not_positive');
    // (٢) الفحص ٣ بلا شرط سطر اللتر ← الحالة المزروعة تعبر.
    t.same((await readers([['public.verify_mill()', [["\n        or (l.unit = 'L' and l.density_kg_per_l is null)", '']]]])).verify, {},
      'طفرة: الفحص ٣ بلا شرط سطر اللتر بلا لقطة كثافة ← verify_mill = {} على الحالة المزروعة');
    // (٣) لوحة المعمل بالرامي ← density_not_positive لكلّ قارئ؛ (٤) بلا nulls last ← القطعة الفارغة أوّلاً.
    const mThrow = await readers([[OVERVIEW_FN, [['(select private.recipe_line_kg_or_null(', '(select private.recipe_line_kg(']]]]);
    const mOrder = await readers([[OVERVIEW_FN, [['order by m.kg desc nulls last,', 'order by m.kg desc,']]]]);
    t.same([mThrow.pieces, mOrder.pieces[0]], [['density_not_positive', 'density_not_positive'], [['كاز الجولة الرابعة', null], ['ذرة المراجعة', '1000.000']]],
      'طفرتا recipes_overview: بالرامي ترمي اللوحة للمدير ومشغّل المعمل، وبلا nulls last تأتي القطعة الفارغة أوّلاً');
    // (٥–٨) بطاقة الخلطة على المسوّدتين: كتلة السطر بالرامي، والحصّة بلا شرطها، والمجموع يتخطّى الفارغ، وunit_mismatch ثابت.
    const detailIn = (pairs, r) => mutated([[RECIPE_DETAIL_FN, pairs]], [], async ({ attempt }) => {
      const out = await attempt('select public.recipe_detail($1, $2)', [r.id, r.version]);
      return out.ok ? [out.v.mass_kg, out.v.lines.map((l) => [l.item_name, l.mass_kg, l.share_pct, l.unit_mismatch])] : out.code;
    });
    const LINES_LATERAL = "        cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m\n      where l.org_id = v_org and l.version_id = v.id), '[]'::jsonb) end,";
    t.same([
      await detailIn([[LINES_LATERAL, LINES_LATERAL.split('recipe_line_kg_or_null(').join('recipe_line_kg(')]], DK),
      await detailIn([["'share_pct', case when m.kg > 0 then private._mul_div_round(m.kg, 100, v.basis_kg, 2) when m.kg = 0 then 0.00 end::text,", "'share_pct', private._mul_div_round(m.kg, 100, v.basis_kg, 2)::text,"]], DK),
      (await detailIn([['case when bool_or(m.kg is null) then null else coalesce(sum(m.kg), 0) end', 'coalesce(sum(m.kg), 0)']], DM))[0],
      (await detailIn([["'unit_mismatch', l.unit = 'L' and i.base_unit <> 'L',", "'unit_mismatch', false,"]], DK))[1]?.[1]?.[3],
    ], ['density_not_positive', 'mul_div_domain', '986.000', false],
    'طفرات recipe_detail: كتلة السطر بالرامي ترمي البطاقة، والحصّة بلا شرطها ترمي mul_div_domain، والمجموع يتخطّى الفارغ فيصير 986 ناقصاً، وunit_mismatch ثابت يسكت');
    // (٩) «نسخة جديدة» تنسخ الكمية والوحدة القديمتين (20 لتراً لمادّة صارت بالكيلو) ← حارس السطر يرفضها bad_recipe_unit فلا مسوّدة.
    t.eq((await copyPlanted([[NEW_VERSION_FN, [['values (v_org, v.id, ln.item_id, null, ln.base_unit);', "values (v_org, v.id, ln.item_id, 20, 'L');"]]]]))[0], 'bad_recipe_unit',
      'طفرة: new_recipe_version بالكمية والوحدة القديمتين ← حارس السطر يرفض سطر اللتر لمادّة بالكيلو فلا مسوّدة');
    // (١٠) فرع الأساس بالرامي ← density_not_positive؛ (١١) بتخطّي الفارغ ← لا تُعدّ النسخة المزروعة فيكمل التراجع إلى حالة يرمي عليها فحص 0015 الثاني.
    // النسخ المجمَّدة بالموادّ وحدها (0025: بلا أساس، فكتلة سطورها فارغة) يعدّها الفرع كما هو، وتسقط معه بتخطّي الفارغ، فتُطرح من الضابط.
    const bare = Number((await db.admin("select count(*) from public.recipe_versions where status <> 'draft' and basis_kg is null")).rows[0].count);
    t.same([await planted([], blockedCount(swap(basisOnly, '(select private.recipe_line_kg_or_null(', '(select private.recipe_line_kg('))),
      await planted([], blockedCount(swap(basisOnly, 'having bool_or(m.kg is null) or sum(m.kg) <> v.basis_kg', 'having sum(m.kg) <> v.basis_kg')))],
    ['density_not_positive', control - bare], 'طفرتا فرع الأساس في التراجع: بالرامي يرمي density_not_positive، وبتخطّي الفارغ لا تُعدّ النسخة المزروعة (ولا النسخ بالموادّ وحدها)');
  });

  // ═══ الجولة الخامسة (scratchpad/mill2/fixes5.md القسم أ، ق٥١–ق٥٥؛ الملاحظات #0–#2 بنصّها وإثباتها في findings5.txt، وما علّقه التكامل الرابع) ═══
  // كلّ إصلاح بفحص يفشل على 0016 كما كانت عند ff22f80 وينجح بعده، والسلوك أوّلاً ثمّ الطفرات في قسم وحده (ق٤٣)؛ وق٥٣ فحصان لجزء من ق٤١ قائم بلا
  // فحص، تكسرهما طفراته الثلاث الناجية. والطفرة بمعاملة ترجع تكسر فحصها بالضبط.
  /** خلطة مسوّدة بنداء البانية بلا تفعيل: السطور [[مادّة، كمية، وحدة]]. */
  const draftRecipe = async (name, lines) => {
    const rid = fresh();
    const vid = fresh();
    await must(U.manager, "select public.create_recipe($1, $2, $3, $4, 1000, $5::jsonb, '[]'::jsonb, false)",
      [rid, vid, name, FEED, JSON.stringify(lines.map(([itemId, qty, unit = 'kg']) => ({ item_id: itemId, qty, unit })))]);
    return { id: rid, version: vid };
  };
  /** قارئ بنداء من داخل معاملة طفرة: قيمة أوّل عمود من أوّل صفّ. */
  const valueOn = (oq) => async (sql, params = []) => Object.values((await oq(sql, params)).rows[0])[0];

  // ─── ق٥١ (#0): recipe_detail يسمّي السائل بلا كثافة (density_missing)، وهو ما يرفض التفعيل لأجله ─────────────────────────────
  const DENSITY_MISSING = "'density_missing', coalesce(l.base_unit, i.base_unit) = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) is null,";
  const K51 = {};
  await section('ق٥١', async () => {
    // «شراب» سائل أوّلي بكثافة 1.25، و«زيت بالكيلو» سائل بكثافة 0.9 مكتوب في الخلطة بالكيلو، في مسوّدة بلا تفعيل: ذرة 974 + شراب 16 لتراً (20 كغم) +
    // زيت 6 كغم = 1,000؛ ثمّ تُفرَّغ كثافتاهما وهما ما زالا باللتر (#0 بخطواته: items_density_unit_check يسمح، والكثافة لا تتجمّد).
    const SYR = await item('شراب الجولة الخامسة', 'raw', 'L', 1.25);
    const OILKG = await item('زيت بالكيلو الجولة الخامسة', 'raw', 'L', 0.9);
    const D = await draftRecipe('مسوّدة سائلين بلا كثافة', [[CORN, 974], [SYR, 16, 'L'], [OILKG, 6]]);
    for (const x of [SYR, OILKG]) await must(U.manager, 'update public.items set density_kg_per_l = null where id = $1 returning id', [x]);
    const card = async (r, version = r.version) => {
      const d = await must(U.manager, 'select public.recipe_detail($1, $2)', [r.id, version]);
      return [d.mass_kg, d.lines.map((l) => [l.item_name, l.unit, l.mass_kg, l.unit_mismatch, l.density_missing])];
    };
    t.same(await card(D),
      [null, [['ذرة المراجعة', 'kg', '974.000', false, false], ['شراب الجولة الخامسة', 'L', null, false, true], ['زيت بالكيلو الجولة الخامسة', 'kg', '6.000', false, true]]],
      'recipe_detail لمسوّدة سائلين فُرّغت كثافتاهما: density_missing = true للشراب (كتلته فارغة وليس unit_mismatch) وللزيت المكتوب بالكيلو (كتلته معروفة)، وfalse للذرة (كان المفتاح غائباً: كتلة فارغة بلا سبب ولا اسم)');
    // التلميح بالمكان الذي تُكتب فيه الكثافة (الجولة السادسة، ق٦٥؛ كان «في بطاقة المادّة» حيث الكثافة قراءة فقط).
    const DENSITY_HINT = (name) => `«${name}» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ فعّل.`;
    const refused = await call(U.manager, ACTIVATE, [D.version]);
    // وبلا سطر الشراب (بمعاملة ترجع، والذرة 994 + زيت 6): سطر الزيت المكتوب بالكيلو يرفضه التفعيل كذلك، فالمفتاح لا يتبع وحدة السطر.
    const oilOnly = await mutated([], [], async ({ oq, attempt }) => {
      await oq('delete from public.recipe_lines where version_id = $1 and item_id = $2', [D.version, SYR]);
      await oq('update public.recipe_lines set qty = 994 where version_id = $1 and item_id = $2', [D.version, CORN]);
      const out = await attempt(ACTIVATE, [D.version]);
      return [code(out), out.hint ?? null];
    });
    t.same([[code(refused), refused.hint], oilOnly],
      [['density_required', DENSITY_HINT('شراب الجولة الخامسة')], ['density_required', DENSITY_HINT('زيت بالكيلو الجولة الخامسة')]],
      'وهو ما يرفض التفعيل لأجله: density_required للشراب (أوّل سطر)، وللزيت المكتوب بالكيلو حين يبقى وحده');
    // نسختان مفعَّلتان: «شراب مفعَّل» (980 + 16 لتراً بلقطة 1.2500) فُرّغت كثافة مادّته بعد التفعيل وهي ما زالت باللتر، فالإنتاج يمضي بلقطة السطر؛
    // و«كاز بالكيلو» (990 + 10 كغم بلقطة الكيلو) صُحّح لتراً بلا كثافة، فلقطة سطره كيلوغرام (unit_changed يسمّيه، وcreate_production يرفضه item_changed).
    const SYRA = await item('شراب مفعَّل الجولة الخامسة', 'raw', 'L', 1.25);
    const KZ = await item('كاز بالكيلو الجولة الخامسة', 'raw', 'kg');
    const RS = await recipe('خلطة شراب مفعَّلة', [[CORN, 980], [SYRA, 16, 'L']]);
    const RK = await recipe('خلطة كاز صُحّح لتراً', [[CORN, 990], [KZ, 10]]);
    await must(U.manager, 'update public.items set density_kg_per_l = null where id = $1 returning id', [SYRA]);
    await must(U.manager, "update public.items set base_unit = 'L', density_kg_per_l = null where id = $1 returning id", [KZ]);
    const flags = async (r, name) => {
      const l = (await must(U.manager, 'select public.recipe_detail($1, null)', [r.id])).lines.find((x) => x.item_name === name);
      return l && [l.base_unit, l.mass_kg, l.unit_changed, l.density_missing];
    };
    const produced = await mutated([], [], async ({ attempt }) => code(await attempt(PRODUCE, [fresh(), RS.version, RAW, FEEDWH])));
    t.same([await flags(RS, 'شراب مفعَّل الجولة الخامسة'), await flags(RK, 'كاز بالكيلو الجولة الخامسة'), produced],
      [['L', '20.000', false, false], ['kg', '10.000', true, false], 'ok'],
      'النسخة المفعَّلة: density_missing = false لشراب بلقطة كثافة (والإنتاج يمضي بها) ولكاز لقطته كيلوغرام صار لتراً بلا كثافة (unit_changed يسمّيه)');
    t.same(await nonZero(), {}, 'verify_mill صفر بعد تفريغ الكثافتين وتصحيح الكاز');
    Object.assign(K51, { D, RS, RK });
  });
  await section('ق٥١ طفرات', async () => {
    const { D, RS, RK } = K51;
    if (!RK) throw new Error('ق٥١ لم يكتمل');
    /** المفتاح بطفرة على نصّه: [سطور مسوّدة السائلين، سطر الشراب المفعَّل، سطر الكاز المفعَّل]. */
    const missingWith = (to) => mutated([[RECIPE_DETAIL_FN, [[DENSITY_MISSING, to]]]], [], async ({ oq }) => {
      const flagsOf = async (r, version) => (await oq('select public.recipe_detail($1, $2) as v', [r.id, version])).rows[0].v.lines.map((l) => l.density_missing);
      return [await flagsOf(D, D.version), (await flagsOf(RS, null))[1], (await flagsOf(RK, null))[1]];
    });
    t.same(await missingWith(DENSITY_MISSING), [[false, true, true], false, false], 'ضابط: النصّ نفسه في معاملة الطفرة يعطي جواب القسم');
    t.same([
      await missingWith("'density_missing', false,"),
      await missingWith("'density_missing', l.unit = 'L' and i.base_unit = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) is null,"),
      await missingWith("'density_missing', coalesce(l.base_unit, i.base_unit) = 'L' and i.density_kg_per_l is null,"),
      await missingWith("'density_missing', i.base_unit = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) is null,"),
    ], [
      [[false, false, false], false, false],
      [[false, true, false], false, false],
      [[false, true, true], true, false],
      [[false, true, true], false, true],
    ], 'طفرات density_missing: ثابت يسكت عن السائلين؛ وبوحدة السطر (اقتراح الملاحظة) يسكت عن الزيت المكتوب بالكيلو والتفعيل يرفضه؛ وبكثافة المادّة وحدها ينبّه لشراب يُنتَج بلقطته؛ وبالوحدة الحيّة ينبّه لكاز لقطته كيلوغرام');
  });

  // ─── ق٥٢ (#1): verify_mill الفحص ٢ لا يرمي، والكتلة الفارغة داخل الكتلة خرق يُعدّ ─────────────────────────────────────────────
  const K52 = {};
  await section('ق٥٢', async () => {
    const { DK, DM, planted } = K42;
    if (!planted) throw new Error('ق٤٢ لم يكتمل');
    /** الثوابت غير الصفرية، أو رمز رمية verify_mill (بنقطة حفظ، فلا تتوقّف المعاملة). */
    const verifyOn = async (attempt) => {
      const out = await attempt('select check_name, violations::int as n from public.verify_mill() where violations <> 0');
      return out.ok ? Object.fromEntries(out.rows.map((x) => [x.check_name, x.n])) : out.code;
    };
    // ثلاث حالات مجمَّدة مزروعة بدور postgres في معاملة ترجع (والطفرات على verify_mill قبل الزرع):
    // (أ) خارج الكتلة: الزرع كما في ق٤٢ (مسوّدة الكاز تُفعَّل بلا فحص سطر اللتر)، فسطر الكاز لتر بلا كثافة خارج الكتلة.
    // (ب) داخلها والباقي يساوي الأساس: الزرع نفسه، ولقطة «داخل الكتلة» لسطر الكاز تُقلب صحيحة (عمود لقطة يمرّ به حارس السطر)؛ الذرة 1,000 وكتلة الكاز
    //     لا تُحسب، فالمجموع بلاها = الأساس. ومعه بطاقة النسخة لا ترمي ومجموع كتلتها فارغ.
    // (ج) المولاس كما في #1 حرفاً (ذرة 986 + 10 لترات داخل الكتلة): المادّة تُعاد لتراً بكثافة 1.4 فتُفعَّل المسوّدة (986 + 14 = 1,000)، ثمّ تُصحَّح
    //     كيلوغراماً وتُفرَّغ لقطتا وحدة السطر وكثافته: unit = L وbase_unit = kg بلا كثافة.
    const states = (pairs = []) => ({
      outside: () => planted(pairs, ({ attempt }) => verifyOn(attempt)),
      inside: () => planted(pairs, async ({ oq, attempt }) => {
        await oq("update public.recipe_lines set in_basis = true where version_id = $1 and unit = 'L'", [DK.version]);
        const card = await attempt('select public.recipe_detail($1, null)', [DK.id]);
        return [await verifyOn(attempt), card.ok ? card.v.mass_kg : card.code];
      }),
      molasses: () => mutated(pairs, [], async ({ oq, attempt }) => {
        const MOL = "(select item_id from public.recipe_lines where version_id = $1 and unit = 'L')";
        await oq(`update public.items set base_unit = 'L', density_kg_per_l = 1.4 where id = ${MOL}`, [DM.version]);
        const out = await attempt(ACTIVATE, [DM.version]);
        if (!out.ok) throw new Error(`زرع المولاس: ${out.code}`);
        await oq(`update public.items set base_unit = 'kg', density_kg_per_l = null where id = ${MOL}`, [DM.version]);
        await oq("update public.recipe_lines set base_unit = 'kg', density_kg_per_l = null where version_id = $1 and unit = 'L'", [DM.version]);
        return verifyOn(attempt);
      }),
    });
    const live = states();
    t.same([await live.outside(), await live.inside(), await live.molasses()],
      [{ recipe_frozen_bad_lines: 1 }, [{ recipe_basis_mismatch: 1, recipe_frozen_bad_lines: 1 }, null], { recipe_basis_mismatch: 1, recipe_frozen_bad_lines: 1 }],
      'verify_mill على حالات مجمَّدة مزروعة: سطر لتر بلا كثافة خارج الكتلة يعدّه الفحص ٣ وحده، وداخلها يعدّه الفحصان ٢ و٣ بلا رمية ولو ساوى الباقي الأساس (كان density_not_positive يُسقط الثوابت كلّها لكلّ المنشآت)، وبطاقة النسخة بمجموع كتلة فارغ');
    Object.assign(K52, { states });
  });
  await section('ق٥٢ طفرات', async () => {
    const { states } = K52;
    if (!states) throw new Error('ق٥٢ لم يكتمل');
    const VERIFY_FN = 'public.verify_mill()';
    // (١) بالرامي؛ (٢) يتخطّى الكتلة الفارغة؛ (٣) الكتلة الفارغة بلا «داخل الكتلة». وحذف coalesce(…، false) وحده مكافئ: null or س في having = س.
    const mThrow = states([[VERIFY_FN, [['private.recipe_line_kg_or_null(l.qty', 'private.recipe_line_kg(l.qty']]]]);
    const mSkip = states([[VERIFY_FN, [['having coalesce(bool_or(m.kg is null) filter (where l.in_basis), false) or ', 'having ']]]]);
    const mAll = states([[VERIFY_FN, [['coalesce(bool_or(m.kg is null) filter (where l.in_basis), false)', 'coalesce(bool_or(m.kg is null), false)']]]]);
    t.same([(await mThrow.inside())[0], await mThrow.molasses(), (await mSkip.inside())[0], await mSkip.molasses(), await mAll.outside()],
      ['density_not_positive', 'density_not_positive', { recipe_frozen_bad_lines: 1 }, { recipe_basis_mismatch: 1, recipe_frozen_bad_lines: 1 }, { recipe_basis_mismatch: 1, recipe_frozen_bad_lines: 1 }],
      'طفرات الفحص ٢: بالرامي يرمي verify_mill كلّه على السطر داخل الكتلة؛ وبتخطّي الكتلة الفارغة يعبر السطر حين يساوي الباقي الأساس (والمولاس يُعدّ بنقص مجموعه وحده)؛ وبلا «داخل الكتلة» يُعدّ سطر الوقود خارجها خرق أساس');
  });

  // ─── ق٥٣ (#2): تحويل «نسخة جديدة» بحالتين لم تُفحصا: تقريب الضرب، وسطر لتر لمادّة ما زالت باللتر ───────────────────────────────
  const K53 = {};
  await section('ق٥٣', async () => {
    // (أ) «زيت 0.8335» أوّلي باللتر: ذرة 997.499 + 3 لترات (3 × 0.8335 = 2.5005 ← 2.501) = 1,000، مفعَّلة، ثمّ يُصحَّح الزيت كيلوغراماً.
    // (ب) «شراب» أوّلي باللتر بكثافة 1.25: ذرة 980 + 16 لتراً (20 كغم) = 1,000، مفعَّلة، ثمّ تصير كثافته 1.3 وهو ما زال باللتر.
    const OILD = await item('زيت 0.8335 الجولة الخامسة', 'raw', 'L', 0.8335);
    const SYRL = await item('شراب ما زال باللتر الجولة الخامسة', 'raw', 'L', 1.25);
    const RA = await recipe('خلطة زيت 0.8335', [[CORN, 997.499], [OILD, 3, 'L']]);
    const RB = await recipe('خلطة شراب ما زال باللتر', [[CORN, 980], [SYRL, 16, 'L']]);
    await must(U.manager, "update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1 returning id", [OILD]);
    await must(U.manager, 'update public.items set density_kg_per_l = 1.3 where id = $1 returning id', [SYRL]);
    /** «نسخة جديدة» بمعاملة ترجع (فتبقى المفعَّلة للطفرات): [سطور المسوّدة، رمز تفعيلها، تلميحه]. */
    const copyOf = (r, pairs = []) => mutated(pairs.length ? [[NEW_VERSION_FN, pairs]] : [], [], async ({ oq, attempt }) => {
      const nv = fresh();
      const out = await attempt('select public.new_recipe_version($1, $2)', [r.id, nv]);
      if (!out.ok) return [out.code];
      const activated = await attempt(ACTIVATE, [nv]);
      return [await linesOn(oq, nv), code(activated), activated.ok ? null : activated.hint];
    });
    // create_production من النسخة الأصلية يخطّط كتلة الزيت من لقطته: round3(3 × 0.8335) = 2.501.
    const planned = await mutated([], [], async ({ attempt }) => {
      const b = fresh();
      const out = await attempt(PRODUCE, [b, RA.version, RAW, FEEDWH]);
      if (!out.ok) return out.code;
      return (await attempt('select planned_mass_kg::text as m from public.production_inputs where batch_id = $1 and item_id = $2', [b, OILD])).rows[0]?.m ?? null;
    });
    t.same([await copyOf(RA), planned], [[[['ذرة المراجعة', null, 'kg'], ['زيت 0.8335 الجولة الخامسة', null, 'kg']], 'ok', null], '2.501'],
      'new_recipe_version (0025) بالموادّ وحدها: الزيت بلا كمية بوحدته الآن (كيلوغرام) فلا تحويل يُقرَّب، والنسخة تتفعّل بالموادّ؛ وcreate_production من الأصلية بكتلة لقطتها 2.501');
    const kept = await copyOf(RB);
    t.same([kept[0], kept[1]], [[['ذرة المراجعة', null, 'kg'], ['شراب ما زال باللتر الجولة الخامسة', null, 'L']], 'ok'],
      'new_recipe_version (0025) من نسخة سطرها باللتر لمادّة ما زالت باللتر: الشراب بلا كمية باللتر، وتتفعّل بالموادّ (كثافته الجديدة 1.3 لقطة التفعيل؛ لا مجموع يُقارن)');
    Object.assign(K53, { RA, RB, copyOf });
  });
  await section('ق٥٣ طفرات', async () => {
    // طفرات التحويل الثلاث (#2: القطع، والكثافة لمرتبتين، وكلّ سطر لتر يُحوَّل) سقطت مع التحويل نفسه: «نسخة جديدة» منذ 0025 بالموادّ وحدها (كلمة
    // المالك 2026-11-10)، فلا كمية تُنسخ ولا كثافة تُضرب. وما بقي منها (الوحدة من المادّة الآن، والأساس الفارغ) طفرتاه في ق٤١ طفرات.
    t.ok(Boolean(K53.copyOf), 'ق٥٣ اكتمل');
  });

  // ─── ق٥٤ (التكامل): كلفة الطنّ المتوقّعة لسطر لتر لمادّة صارت بالكيلو بلقطة كثافة ─────────────────────────────────────────────
  const K54 = {};
  await section('ق٥٤', async () => {
    // أرقام الدبس من التكامل: «ذرة الطنّ المتوقّع» بسعر كلفة مكتوب 900 للكيلو، و«دبس الطنّ المتوقّع» سائل بكثافة 1.4 بسعر 2,000 للتر، في خلطة مفعَّلة: ذرة
    // 972 + دبس 20 لتراً (28 كغم) = 1,000؛ ثمّ يُصحَّح الدبس كيلوغراماً ويُكتب سعره 1,500 للكيلو.
    const CORN54 = await item('ذرة الطنّ المتوقّع', 'raw', 'kg');
    const DIBS54 = await item('دبس الطنّ المتوقّع', 'raw', 'L', 1.4);
    const price = (itemId, p, before) => must(U.manager, 'select public.set_item_cost_price($1, $2, $3)', [itemId, p, before]);
    await price(CORN54, 900, null);
    await price(DIBS54, 2000, null);
    const R = await recipe('خلطة كلفة الدبس', [[CORN54, 972], [DIBS54, 20, 'L']]);
    /** [مواد الطنّ، عدد غير المسعَّر، عدد غير المحوَّل (الجولة السادسة، ق٦١)، كلفة الطنّ] من بطاقة الخلطة، وكلفة الكيلو المتوقّعة من لوحة المعمل. */
    const expectedOf = async (get) => {
      const e = (await get('select public.recipe_detail($1, null)', [R.id])).money.expected;
      const board = (await get('select public.recipes_overview()', [])).recipes.find((x) => x.id === R.id).money.expected_cost_per_kg;
      return [e.materials_per_ton, e.unpriced, e.unconverted, e.cost_per_ton, board];
    };
    const asManager = (sql, params) => must(U.manager, sql, params);
    // قبل التصحيح: 972 × 900 + 20 × 2,000 = 874,800 + 40,000 = 914,800 للطنّ، والكيلو 914.80.
    t.same(await expectedOf(asManager), ['914800.00', 0, 0, '914800.00', '914.80'], 'ضابط: قبل التصحيح الطنّ 914,800.00 والكيلو 914.80 (الدبس باللتر بسعر اللتر)');
    await must(U.manager, "update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1 returning id", [DIBS54]);
    await price(DIBS54, 1500, 2000);
    // بعده: سطر الدبس 20 لتراً × لقطة 1.4 = 28 كغم بسعر الكيلو 1,500 = 42,000، فالطنّ 874,800 + 42,000 = 916,800 والكيلو 916.80.
    t.same(await expectedOf(asManager), ['916800.00', 0, 0, '916800.00', '916.80'],
      'بعد تصحيح الدبس كيلوغراماً بسعر 1,500: سطره 28 كغم من لقطة الكثافة بسعر الكيلو، فالطنّ 916,800.00 والكيلو 916.80 (كان unpriced = 1 والمواد 874,800.00 وكلفة الكيلو فارغة والسعر مكتوب)');
    // «نسخة جديدة» (بمعاملة ترجع) منذ 0025 بالموادّ وحدها: لا كميات فلا كلفة طنّ متوقّعة لمسوّدتها.
    const copied = await mutated([], [], async ({ oq, attempt }) => {
      const nv = fresh();
      const out = await attempt('select public.new_recipe_version($1, $2)', [R.id, nv]);
      if (!out.ok) return out.code;
      return [await linesOn(oq, nv), (await valueOn(oq)('select public.recipe_detail($1, $2)', [R.id, nv])).money.expected];
    });
    t.same(copied, [[['ذرة الطنّ المتوقّع', null, 'kg'], ['دبس الطنّ المتوقّع', null, 'kg']], null],
      'ضابط: مسوّدة «نسخة جديدة» بالموادّ وحدها (0025) بلا كلفة طنّ متوقّعة');
    Object.assign(K54, { R, expectedOf });
  });
  await section('ق٥٤ طفرات', async () => {
    const { R, expectedOf } = K54;
    if (!R) throw new Error('ق٥٤ لم يكتمل');
    const EXPECTED_FN = 'private.recipe_expected(uuid)';
    const BRANCH = "\n      when ln.unit = 'L' and ln.base_unit = 'kg' and ln.density is not null then private.liters_to_kg(ln.qty, ln.density) end;";
    const expectedWith = (to) => mutated([[EXPECTED_FN, [[BRANCH, to]]]], [], ({ oq }) => expectedOf(valueOn(oq)));
    // (١) بلا الفرع؛ (٢) بلا تحويل (اللترات كيلوغرامات)؛ (٣) بلا شرط اللقطة: الحالة المزروعة في ق٤٢ (سطر لتر بلا كثافة) والقرّاء بطفرتها وبلاها.
    const unguarded = await K42.readers([[EXPECTED_FN, [[BRANCH, BRANCH.split(' and ln.density is not null then private.liters_to_kg').join(' then private.liters_to_kg')]]]]);
    const guarded = await K42.readers();
    t.same([await expectedWith(' end;'), await expectedWith("\n      when ln.unit = 'L' and ln.base_unit = 'kg' and ln.density is not null then ln.qty end;"),
      [guarded.card[0], unguarded.pieces, unguarded.card]],
    [['874800.00', 0, 1, '874800.00', null], ['904800.00', 0, 0, '904800.00', '904.80'], ['1000.000', ['density_not_positive', 'density_not_positive'], 'density_not_positive']],
    'طفرات recipe_expected: بلا فرع اللتر ← سطر الدبس لا يُحسب (غير محوَّل منذ الجولة السادسة، ق٦١: 874,800.00 وكلفة الكيلو فارغة)؛ وبلا تحويل ← 20 «كغم» بسعر الكيلو (904,800.00)؛ وبلا شرط اللقطة ← سطر لتر بلا كثافة يُسقط لوحة المعمل للمدير ومشغّل المعمل وبطاقة الخلطة (وبه: البطاقة 1,000)');
  });

  // ─── ق٥٥ (التكامل): «نسخة جديدة» لا تنسخ سطر مادّة صارت قطعة، وتسمّيها في skipped ─────────────────────────────────────────────
  const K55 = {};
  await section('ق٥٥', async () => {
    // خلطة مفعَّلة: ذرة 980 + «ملح» 10 كغم + «خميرة» 10 كغم (ترتيب السطور غير ترتيب الأسماء)، ثمّ تصير المادّتان قطعة قبل أيّ حركة: create_production يرفض
    // النسخة item_changed (ق٤١)، و«نسخة جديدة» كانت ترفض bad_recipe_unit من حارس السطر فلا مسوّدة، فخلطة لا يُنتَج بها ولا تُنسخ.
    const SALT = await item('ملح صار قطعة الجولة الخامسة', 'raw', 'kg');
    const YEAST = await item('خميرة صارت قطعة الجولة الخامسة', 'raw', 'kg');
    const R = await recipe('خلطة مادّتين صارتا قطعة', [[CORN, 980], [SALT, 10], [YEAST, 10]]);
    const NORMAL = await recipe('خلطة بلا قطعة الجولة الخامسة', [[CORN, 1000]]);
    for (const x of [SALT, YEAST]) await must(U.manager, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1 returning id", [x]);
    t.eq(code(await call(U.manager, PRODUCE, [fresh(), R.version, RAW, FEEDWH])), 'item_changed', 'ضابط: create_production من النسخة المفعَّلة يُرفض item_changed');
    // بمعاملة ترجع (فتبقى المفعَّلة للطفرات): الجواب، وسطور المسوّدة، والإعادة بالمعرّف نفسه، ثمّ الذرة 1,000 فتتفعّل ويُنتَج بها.
    const copyOf = (pairs = []) => mutated(pairs.length ? [[NEW_VERSION_FN, pairs]] : [], [], async ({ oq, attempt }) => {
      const nv = fresh();
      const out = await attempt('select public.new_recipe_version($1, $2)', [R.id, nv]);
      if (!out.ok) return [out.code];
      const lines = await linesOn(oq, nv);
      const again = await attempt('select public.new_recipe_version($1, $2)', [R.id, nv]);
      // منذ 0025: المسوّدة بالموادّ تتفعّل كما هي، والإنتاج بها بالكميات المكتوبة (produce_batch، «احفظ مسوّدة»).
      const activated = await attempt(ACTIVATE, [nv]);
      const made = activated.ok ? await attempt("select public.produce_batch($1, $2, $3, $4, jsonb_build_array(jsonb_build_object('item_id', $5::uuid, 'qty', '1000')), null, true, public.app_today(), null, null, null, null, $6)",
        [fresh(), R.id, nv, RAW, CORN, ref()]) : activated;
      return [canon({ ...out.v, version_id: out.v.version_id === nv }), lines, again.ok ? [again.v.existing, again.v.skipped] : again.code, code(activated), code(made)];
    });
    /** [المفتاح حاضر؟، قيمته] لنسخة جديدة بمعاملة ترجع. */
    const skippedOf = (r, pairs = []) => mutated(pairs.length ? [[NEW_VERSION_FN, pairs]] : [], [], async ({ attempt }) => {
      const out = await attempt('select public.new_recipe_version($1, $2)', [r.id, fresh()]);
      return out.ok ? [Object.hasOwn(out.v, 'skipped'), out.v.skipped] : [out.code];
    });
    t.same(await copyOf(), [
      canon({ recipe_id: R.id, version_id: true, version_no: 2, status: 'draft', lines: 1, rates: 0, existing: false, skipped: ['ملح صار قطعة الجولة الخامسة', 'خميرة صارت قطعة الجولة الخامسة'] }),
      [['ذرة المراجعة', null, 'kg']], [false, ['ملح صار قطعة الجولة الخامسة', 'خميرة صارت قطعة الجولة الخامسة']], 'ok', 'ok'],
    'new_recipe_version والمادّتان صارتا قطعة: مسوّدة بسطر الذرة وحده (بلا كمية منذ 0025)، وskipped بالاسمين بترتيب السطور (كانت bad_recipe_unit ولا مسوّدة)؛ والإعادة بالمعرّف نفسه ترجع ما رجع أوّل مرّة (existing = false وskipped بالاسمين، الجولة السادسة ق٦٣؛ كانت existing وskipped فارغ)؛ ثمّ تتفعّل بالموادّ ويُنتَج بها بالكميات المكتوبة');
    t.same(await skippedOf(NORMAL), [true, []], 'نسخة جديدة بلا قطعة: skipped حاضر فارغ');
    Object.assign(K55, { R, NORMAL, copyOf, skippedOf });
  });
  await section('ق٥٥ طفرات', async () => {
    const { R, NORMAL, copyOf, skippedOf } = K55;
    if (!copyOf) throw new Error('ق٥٥ لم يكتمل');
    const SKIP = "      if ln.base_unit not in ('kg', 'L') then\n        v_skipped := v_skipped || jsonb_build_array(ln.name);\n        continue;\n      end if;\n";
    t.same([
      (await copyOf([[SKIP, '']]))[0],
      await skippedOf(R, [['v_skipped := v_skipped || jsonb_build_array(ln.name);', 'null;']]),
      await skippedOf(NORMAL, [["'skipped', v_skipped);", "'skipped', case when jsonb_array_length(v_skipped) > 0 then v_skipped end);"]]),
    ], ['bad_recipe_unit', [true, []], [true, null]],
    'طفرات ق٥٥: بلا ترك سطر القطعة ← حارس السطر يرفض bad_recipe_unit فلا مسوّدة؛ وتركه بصمت ← skipped فارغ والمادّتان غائبتان بلا كلمة؛ والفارغ null ← المفتاح ليس «حاضراً دائماً»');
  });

  // ═══ الجولة السادسة (scratchpad/mill2/fixes6.md القسم أ، ق٦١–ق٦٥؛ الملاحظات #0–#5 بنصّها وإثباتها في findings6.txt) ═══
  // كلّ إصلاح بفحص يفشل على 0016 كما كانت عند bffd349 وينجح بعده، والسلوك أوّلاً ثمّ الطفرات في قسم وحده (ق٤٣): رمية مرساة في طفرة لا تحجب فحصاً
  // سلوكياً. والطفرة بمعاملة ترجع تكسر فحصها بالضبط، وضابطها النصّ نفسه في معاملة الطفرة حيث يُخشى أن يغيّر الإطار الجواب.

  // ─── ق٦١ (#0): السطر الذي له سعر ولا تتحوّل كميته يُعدّ في unconverted لا في unpriced ─────────────────────────────────────────────
  const K61 = {};
  await section('ق٦١', async () => {
    // أرقام المسبار (#0) بموادّ جديدة أسعارها مكتوبة: «ذرة» بسعر كلفة 900 للكيلو؛ و«زيت» سائل بكثافة 0.9 بسعر 2,000 للتر يُكتب في الخلطة بالكيلو؛ و«دبس»
    // سائل بكثافة 1.4 يُكتب باللتر ثمّ يصير بالكيلو بسعر 1,500؛ و«شراب» سائل بكثافة 1.25 بلا أيّ سعر؛ و«كاز» أوّلي بالكيلو في خلطة مفعَّلة يُصحَّح لتراً بلا كثافة
    // بسعر 1,000 للتر.
    const CORN61 = await item('ذرة الجولة السادسة', 'raw', 'kg');
    const OIL61 = await item('زيت الجولة السادسة', 'raw', 'L', 0.9);
    const DIBS61 = await item('دبس الجولة السادسة', 'raw', 'L', 1.4);
    const SYR61 = await item('شراب بلا سعر الجولة السادسة', 'raw', 'L', 1.25);
    const KZ61 = await item('كاز الجولة السادسة', 'raw', 'kg');
    const price = (itemId, p, before = null) => must(U.manager, 'select public.set_item_cost_price($1, $2, $3)', [itemId, p, before]);
    await price(CORN61, 900);
    await price(OIL61, 2000);
    // (أ) مسوّدة الزيت: ذرة 994 + زيت 6 كغم. (ب) مسوّدة الدبس: ذرة 972 + دبس 20 لتراً. (ج) مسوّدة الشراب: ذرة 980 + شراب 20 كغم مكتوب بالكيلو (فبلا كثافة
    // لا تتحوّل كميته إلى لتر، وسطر اللتر لسائل باللتر يتحوّل دائماً). (د) خلطة الكاز المفعَّلة: ذرة 990 + كاز 10 كغم.
    const DO = await draftRecipe('مسوّدة زيت الجولة السادسة', [[CORN61, 994], [OIL61, 6]]);
    const DD = await draftRecipe('مسوّدة دبس الجولة السادسة', [[CORN61, 972], [DIBS61, 20, 'L']]);
    const DS = await draftRecipe('مسوّدة شراب بلا سعر الجولة السادسة', [[CORN61, 980], [SYR61, 20]]);
    const RK = await recipe('خلطة كاز الجولة السادسة', [[CORN61, 990], [KZ61, 10]]);
    /** كلفة الطنّ المتوقّعة من بطاقة الخلطة لنسخة: [مواد الطنّ، unpriced، unconverted، كلفة الطنّ]. */
    const expectedOf = async (get, r, version = r.version) => {
      const e = (await get('select public.recipe_detail($1, $2)', [r.id, version])).money.expected;
      return [e.materials_per_ton, e.unpriced, e.unconverted ?? 'غائب', e.cost_per_ton];
    };
    /** كلفة الكيلو المتوقّعة لخلطة الكاز من لوحة المعمل. */
    const boardOf = async (get) => (await get('select public.recipes_overview()', [])).recipes.find((x) => x.id === RK.id).money.expected_cost_per_kg;
    const asManager = (sql, params) => must(U.manager, sql, params);
    const asAccountant = (sql, params) => must(U.accountant, sql, params);
    // ضابط قبل التصحيحات (#0): الزيت 6 كغم ← round3(6 ÷ 0.9) = 6.667 لتر × 2,000 = 13,334، والذرة 994 × 900 = 894,600، فالطنّ 907,934.00.
    const before = await expectedOf(asManager, DO);
    t.same([before[0], before[1], before[3]], ['907934.00', 0, '907934.00'], 'ضابط: مسوّدة الزيت قبل تفريغ كثافته بلا سطر متروك، والطنّ 907,934.00 (6 كغم = 6.667 لتر بسعر اللتر)');
    // التصحيحات قبل أيّ حركة: تُفرَّغ كثافتا الزيت والشراب وهما باللتر، ويصير الدبس بالكيلو بسعر 1,500، ويصير الكاز لتراً بلا كثافة بسعر 1,000.
    await must(U.manager, 'update public.items set density_kg_per_l = null where id = any ($1) returning id', [[OIL61, SYR61]]);
    await must(U.manager, "update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1 returning id", [DIBS61]);
    await price(DIBS61, 1500);
    await must(U.manager, "update public.items set base_unit = 'L', density_kg_per_l = null where id = $1 returning id", [KZ61]);
    await price(KZ61, 1000);
    const linesOf = async (r) => (await asManager('select public.recipe_detail($1, $2)', [r.id, r.version])).lines
      .map((l) => [l.item_name, l.unit_mismatch, l.density_missing, l.money.cost_price]);
    t.same([await linesOf(DO), await linesOf(DD)], [
      [['ذرة الجولة السادسة', false, false, '900'], ['زيت الجولة السادسة', false, true, '2000']],
      [['ذرة الجولة السادسة', false, false, '900'], ['دبس الجولة السادسة', true, false, '1500']],
    ], 'ضابط: سطر الزيت سائل بلا كثافة (density_missing) وسطر الدبس لتر لمادّة صارت بالكيلو (unit_mismatch)، وسعر كلفة كلٍّ مكتوب في سطره');
    t.same([await expectedOf(asManager, DO), await expectedOf(asAccountant, DO), await expectedOf(asManager, DD)],
      [['894600.00', 0, 1, '894600.00'], ['894600.00', 0, 1, '894600.00'], ['874800.00', 0, 1, '874800.00']],
      'المسوّدتان (#0): سطر الزيت بلا كثافة وسطر الدبس المكتوب باللتر لمادّة صارت بالكيلو، ولكلٍّ سعر مكتوب، في unconverted = 1 لا في unpriced (كان unpriced = 1 فتقول البطاقة «بلا أيّ سعر… اكتب سعر كلفتها» تحت سطر سعره مكتوب)، للمدير والمحاسب؛ والمواد بلاهما 894,600.00 و874,800.00');
    t.same([await expectedOf(asManager, DS), await expectedOf(asManager, RK, null)], [['882000.00', 1, 0, '882000.00'], ['891000.00', 0, 1, '891000.00']],
      'والحدّان: سطر شراب مكتوب بالكيلو بلا أيّ سعر ولا كثافة (لا يتحوّل ولا سعر له) يبقى في unpriced (السعر أوّل ما يُكتب له)؛ والنسخة المفعَّلة بسطر كاز لقطته كيلوغرام صار لتراً بلا كثافة وسعره مكتوب في unconverted');
    t.eq(await boardOf(asManager), null, 'لوحة المعمل: كلفة الكيلو المتوقّعة لخلطة الكاز فارغة (سطر لم يُحسب، فلا رقم ناقص بصمت)');
    Object.assign(K61, { DO, DS, expectedOf, boardOf });
  });
  await section('ق٦١ طفرات', async () => {
    const { DO, DS, expectedOf, boardOf } = K61;
    if (!boardOf) throw new Error('ق٦١ لم يكتمل');
    const EXPECTED_FN = 'private.recipe_expected(uuid)';
    const COUNT = '    if v_price is null then\n      v_unpriced := v_unpriced + 1;\n    elsif v_qty is null then\n      v_unconverted := v_unconverted + 1;\n';
    /** [مسوّدة الزيت، مسوّدة الشراب، كلفة الكيلو لخلطة الكاز] بطفرة على recipe_expected. */
    const probe = (from, to) => mutated([[EXPECTED_FN, [[from, to]]]], [], async ({ oq }) => {
      const get = valueOn(oq);
      return [await expectedOf(get, DO), await expectedOf(get, DS), await boardOf(get)];
    });
    t.same(await probe(COUNT, COUNT), [['894600.00', 0, 1, '894600.00'], ['882000.00', 1, 0, '882000.00'], null], 'ضابط: النصّ نفسه في معاملة الطفرة يعطي جواب القسم');
    // (١) العدّ القديم (كلّ ما لا يُحسب «بلا سعر»)؛ (٢) غير المحوَّل أوّلاً ← سطر بلا سعر ولا كثافة يُعدّ غير محوَّل؛ (٣) العدّان معاً ← السطر نفسه «بلا سعر» كذلك؛
    // (٤) كلفة الكيلو بشرط unpriced وحده ← رقم ناقص للوحة.
    t.same([
      await probe(COUNT, '    if v_price is null or v_qty is null then\n      v_unpriced := v_unpriced + 1;\n'),
      await probe(COUNT, '    if v_qty is null then\n      v_unconverted := v_unconverted + 1;\n    elsif v_price is null then\n      v_unpriced := v_unpriced + 1;\n'),
      await probe(COUNT, `${COUNT}      v_unpriced := v_unpriced + 1;\n`),
      await probe("'cost_per_kg', case when v_unpriced = 0 and v_unconverted = 0", "'cost_per_kg', case when v_unpriced = 0"),
    ], [
      [['894600.00', 1, 0, '894600.00'], ['882000.00', 1, 0, '882000.00'], null],
      [['894600.00', 0, 1, '894600.00'], ['882000.00', 0, 1, '882000.00'], null],
      [['894600.00', 1, 1, '894600.00'], ['882000.00', 1, 0, '882000.00'], null],
      [['894600.00', 0, 1, '894600.00'], ['882000.00', 1, 0, '882000.00'], '891.00'],
    ], 'طفرات recipe_expected: العدّ القديم يعيد الزيت «بلا سعر»؛ وغير المحوَّل أوّلاً يسمّي الشراب بلا سعر «غير محوَّل»؛ والعدّان معاً يعدّان الزيت مرّتين؛ وكلفة الكيلو بشرط unpriced وحده تعطي لوحة المعمل 891.00 بلا سطر الكاز');
  });

  // ─── ق٦٢ (#1، #3): «نسخة جديدة» تترك المادّة التي صارت قطعة ولو أُرشفت، وسطرها المكتوب باللتر كذلك ─────────────────────────────────
  const K62 = {};
  await section('ق٦٢', async () => {
    // خلطة مفعَّلة: ذرة 980 + «كيس» 10 كغم + «فيتامين» سائل 8 لترات بكثافة 1.25 (10 كغم) = 1,000. ثمّ يصير الكيس قطعة ويُؤرشف (#1 بخطواته: لا حركة ولا
    // رصيد، ولا حارس يمنع أرشفة مادّة في خلطة مفعَّلة)، ويصير الفيتامين قطعة بلا كثافة (#3: سطر مكتوب باللتر لسائل صار قطعة). ترتيب السطور (الكيس ثمّ
    // الفيتامين) غير ترتيب الأسماء.
    const BAG62 = await item('كيس صار قطعة الجولة السادسة', 'raw', 'kg');
    const VIT62 = await item('فيتامين سائل صار قطعة الجولة السادسة', 'raw', 'L', 1.25);
    const R = await recipe('خلطة كيس وفيتامين صارا قطعة', [[CORN, 980], [BAG62, 10], [VIT62, 8, 'L']]);
    await must(U.manager, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1 returning id", [BAG62]);
    await must(U.manager, 'update public.items set archived_at = now() where id = $1 returning id', [BAG62]);
    await must(U.manager, "update public.items set base_unit = 'pc', density_kg_per_l = null, scale_step = 1 where id = $1 returning id", [VIT62]);
    t.eq(code(await call(U.manager, PRODUCE, [fresh(), R.version, RAW, FEEDWH])), 'item_changed', 'ضابط: create_production من النسخة المفعَّلة يُرفض item_changed');
    /** «نسخة جديدة» بمعاملة ترجع (فتبقى المفعَّلة للطفرات): [الرمز، skipped، عدد السطور، سطور المسوّدة، رمز تفعيلها بعد الذرة 1,000]. */
    const copyOf = (pairs = []) => mutated(pairs.length ? [[NEW_VERSION_FN, pairs]] : [], [], async ({ oq, attempt }) => {
      const nv = fresh();
      const out = await attempt('select public.new_recipe_version($1, $2)', [R.id, nv]);
      if (!out.ok) return [out.code, out.hint];
      const lines = await linesOn(oq, nv);
      // منذ 0025: المسوّدة بالموادّ تتفعّل كما هي.
      return ['ok', out.v.skipped, out.v.lines, lines, code(await attempt(ACTIVATE, [nv]))];
    });
    t.same(await copyOf(), ['ok', ['كيس صار قطعة الجولة السادسة', 'فيتامين سائل صار قطعة الجولة السادسة'], 1, [['ذرة المراجعة', null, 'kg']], 'ok'],
      'new_recipe_version: الكيس المؤرشف الذي صار قطعة يُترك ويُسمّى (كان item_archived يطلب إعادة مادّة ستُترك)، وسطر الفيتامين المكتوب باللتر لسائل صار قطعة يُترك ويُسمّى، بترتيب السطور؛ والمسوّدة بالذرة وحدها تتفعّل');
    Object.assign(K62, { copyOf });
  });
  await section('ق٦٢ طفرات', async () => {
    const { copyOf } = K62;
    if (!copyOf) throw new Error('ق٦٢ لم يكتمل');
    // (١) فحص الأرشفة على كلّ السطور كما كان ← item_archived يسمّي الكيس؛ (٢) طفرة M5 في #3 (الترك لسطر الكيلو وحده) ← حارس السطر يرفض سطر الفيتامين باللتر.
    t.same([
      (await copyOf([[" and i.archived_at is not null and i.base_unit in ('kg', 'L') order by l.line_no limit 1;", ' and i.archived_at is not null order by l.line_no limit 1;']]))[0],
      (await copyOf([["      if ln.base_unit not in ('kg', 'L') then\n        v_skipped", "      if ln.base_unit not in ('kg', 'L') and ln.name <> 'فيتامين سائل صار قطعة الجولة السادسة' then\n        v_skipped"]]))[0],
    ], ['item_archived', 'bad_recipe_unit'],
    'طفرتا new_recipe_version: فحص الأرشفة على كلّ السطور يرفض النسخ item_archived؛ والترك لبعض القطع (لا الفيتامين، سطر النسخة لا وحدة له منذ 0025) يرسل سطر الفيتامين إلى حارس السطر فيُرفض bad_recipe_unit ولا مسوّدة');
  });

  // ─── ق٦٣ (#5): الإعادة بالمعرّف نفسه (جواب ضاع) ترجع ما رجع أوّل مرّة ─────────────────────────────────────────────────────────────
  const K63 = {};
  await section('ق٦٣', async () => {
    // خلطة مفعَّلة: ذرة 970 + «ملح» 10 + «خميرة» 10 + «نخالة» 10 كغم، ثمّ يصير الملح والخميرة قطعة. «نسخة جديدة» ضاع جوابها، ثمّ «أعد المحاولة» بالمعرّف نفسه
    // كما تطلب الصفحة (#5 بخطواته).
    const SALT63 = await item('ملح صار قطعة الجولة السادسة', 'raw', 'kg');
    const YEAST63 = await item('خميرة صارت قطعة الجولة السادسة', 'raw', 'kg');
    const BRAN63 = await item('نخالة الجولة السادسة', 'raw', 'kg');
    const R = await recipe('خلطة الإعادة الجولة السادسة', [[CORN, 970], [SALT63, 10], [YEAST63, 10], [BRAN63, 10]]);
    for (const x of [SALT63, YEAST63]) await must(U.manager, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1 returning id", [x]);
    const NEW = 'select public.new_recipe_version($1, $2)';
    /** جواب «نسخة جديدة»: [existing، skipped، المعرّف هو المرسَل أوّل مرّة؟، رقم النسخة، حالتها، عدد سطورها]، أو رمز الرفض. */
    const shape = (out, nv) => (out.ok ? [out.v.existing, out.v.skipped, out.v.version_id === nv, out.v.version_no, out.v.status, out.v.lines] : out.code);
    // بمعاملة ترجع (فتبقى المفعَّلة للطفرات): الأولى، ثمّ الإعادة بالمعرّف نفسه، ثمّ معرّف آخر والمسوّدة قائمة، ثمّ تصير النخالة قطعة وهي في المسوّدة (نُسخت قبل
    // أن تصير) فالإعادة لا تسمّيها: لم يتركها هذا الطلب.
    const retryOf = (pairs = []) => mutated(pairs.length ? [[NEW_VERSION_FN, pairs]] : [], [], async ({ oq, attempt }) => {
      const nv = fresh();
      const first = shape(await attempt(NEW, [R.id, nv]), nv);
      const again = shape(await attempt(NEW, [R.id, nv]), nv);
      const other = shape(await attempt(NEW, [R.id, fresh()]), nv);
      await oq("update public.items set base_unit = 'pc', scale_step = 1 where id = $1", [BRAN63]);
      return [first, again, other, shape(await attempt(NEW, [R.id, nv]), nv)];
    });
    // والإعادة بعد أن فُعّلت المسوّدة من جهاز آخر (بالموادّ كما هي منذ 0025): المصدر النسخة التي قبلها (صارت مقاعدة)، فالجواب نفسه وحالة النسخة «مفعَّلة».
    const activatedRetryOf = (pairs = []) => mutated(pairs.length ? [[NEW_VERSION_FN, pairs]] : [], [], async ({ attempt }) => {
      const nv = fresh();
      const first = await attempt(NEW, [R.id, nv]);
      if (!first.ok) return [first.code];
      const activated = await attempt(ACTIVATE, [nv]);
      return [code(activated), shape(await attempt(NEW, [R.id, nv]), nv)];
    });
    const SKIPPED = ['ملح صار قطعة الجولة السادسة', 'خميرة صارت قطعة الجولة السادسة'];
    const FIRST = [false, SKIPPED, true, 2, 'draft', 2];
    t.same(await retryOf(), [FIRST, FIRST, [true, [], true, 2, 'draft', 2], FIRST],
      'new_recipe_version: الإعادة بالمعرّف نفسه ترجع ما رجع أوّل مرّة — existing = false وskipped بالاسمين بترتيب السطور (كانت existing = true وskipped فارغاً فتختفي المادّتان بصمت) — ولو صارت مادّة في المسوّدة قطعة بعدها؛ ومعرّف آخر والمسوّدة قائمة existing = true وskipped فارغ');
    t.same(await activatedRetryOf(), ['ok', [false, SKIPPED, true, 2, 'active', 2]],
      'والإعادة بعد تفعيل المسوّدة: المصدر النسخة التي قبلها، فالجواب نفسه (existing = false وskipped بالاسمين) وحالة النسخة مفعَّلة');
    Object.assign(K63, { retryOf, activatedRetryOf, SKIPPED });
  });
  await section('ق٦٣ طفرات', async () => {
    const { retryOf, activatedRetryOf, SKIPPED } = K63;
    if (!retryOf) throw new Error('ق٦٣ لم يكتمل');
    const AGG = 'jsonb_agg(i.name order by l.line_no)';
    // (١) الإعادة existing كما كانت؛ (٢) skipped فارغ كما كان؛ (٣) بلا «ليست في هذه النسخة» ← النخالة التي صارت قطعة في المسوّدة تُسمّى؛ (٤) بترتيب الأسماء؛
    // (٥) المصدر المفعَّلة بلا «قبلها» ← بعد تفعيل المسوّدة تصير هي المصدر فيفرغ skipped.
    const m1 = await retryOf([['    v_existing := false;\n    select * into s from public.recipe_versions x', '    select * into s from public.recipe_versions x']]);
    const m2 = await retryOf([[`    v_skipped := coalesce((select ${AGG}`, `    v_skipped := '[]'::jsonb;\n    perform coalesce((select ${AGG}`]]);
    const m3 = await retryOf([['\n        and not exists (select 1 from public.recipe_lines y where y.org_id = v_org and y.version_id = v.id and y.item_id = l.item_id)', '']]);
    const m4 = await retryOf([[AGG, 'jsonb_agg(i.name order by i.name collate "C")']]);
    const m5 = await activatedRetryOf([["x.status = 'active' and x.version_no < v.version_no;", "x.status = 'active';"]]);
    t.same([m1[1], m2[1], m3[3], m4[1], m5[1]], [
      [true, SKIPPED, true, 2, 'draft', 2],
      [false, [], true, 2, 'draft', 2],
      [false, [...SKIPPED, 'نخالة الجولة السادسة'], true, 2, 'draft', 2],
      [false, [SKIPPED[1], SKIPPED[0]], true, 2, 'draft', 2],
      [false, [], true, 2, 'active', 2],
    ], 'طفرات ق٦٣: الإعادة existing كما كانت؛ وskipped فارغ كما كان؛ وبلا «ليست في هذه النسخة» تُسمّى نخالة نُسخت؛ وبترتيب الأسماء؛ والمصدر بلا «قبلها» يفرغ skipped بعد التفعيل');
  });

  // ─── ق٦٤ (#2): سطر تُقرَّب كتلته صفراً بالكيلو: البطاقة لا ترمي، والكتابة ترفضه برفض مسمّى ────────────────────────────────────────────
  const K64 = {};
  const ZERO_HINT = (name) => `كمية «${name}» في الخلطة تُقرَّب صفراً بالكيلوغرام. اكتب كمية أكبر.`;
  const ZERO_CHECK = "    if private.recipe_line_kg_or_null(ln.qty, ln.unit, ln.density_kg_per_l) = 0 then\n      raise exception 'qty_not_positive'";
  await section('ق٦٤', async () => {
    // أرقام المسبار (#2): «سائل خفيف» أوّلي باللتر بكثافة 0.4، والسطر 0.001 لتر: 0.001 × 0.4 = 0.0004 ← 0.000 كغم (والحدّ: 0.002 × 0.4 = 0.0008 ← 0.001).
    const NAME = 'سائل خفيف الجولة السادسة';
    const LIGHT = await item(NAME, 'raw', 'L', 0.4);
    /** البانية بمسوّدة سطراها ذرة 1,000 والسائل بكميته باللتر، بمعاملة ترجع: [الرمز، التلميح أو الحالة]. */
    const built = (pairs, qty) => mutated(pairs, [], async ({ attempt }) => {
      const out = await attempt("select public.create_recipe($1, $2, 'مسوّدة سائل خفيف', $3, 1000, $4::jsonb, '[]'::jsonb, false) ->> 'status'",
        [fresh(), fresh(), FEED, JSON.stringify([{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: LIGHT, qty, unit: 'L' }])]);
      return [code(out), out.ok ? out.v : out.hint];
    });
    t.same([await built([], 0.001), await built([], 0.002)], [['qty_not_positive', ZERO_HINT(NAME)], ['ok', 'draft']],
      'حارس السطر: سطر 0.001 لتر بكثافة 0.4 (كتلته 0.000) يُرفض qty_not_positive يسمّيه (كانت المسوّدة تُنشأ وبطاقتها ترمي mul_div_domain لكلّ قارئ)، و0.002 لتر (كتلته 0.001) يُقبل');
    // مسوّدة كُتب سطرها 0.001 لتر والكثافة 1 (كتلته 0.001 فيقبله الحارس)، ثمّ صارت الكثافة 0.4: كتلته 0.000 (الحالة التي لا يبلغها حارس السطر).
    await must(U.manager, 'update public.items set density_kg_per_l = 1 where id = $1 returning id', [LIGHT]);
    const D = await draftRecipe('مسوّدة سائل صغرت كثافته', [[CORN, 1000], [LIGHT, 0.001, 'L']]);
    await must(U.manager, 'update public.items set density_kg_per_l = 0.4 where id = $1 returning id', [LIGHT]);
    const cards = [];
    for (const user of [U.manager, U.miller, U.accountant]) {
      const out = await call(user, 'select public.recipe_detail($1, $2)', [D.id, D.version]);
      cards.push(out.ok ? [out.v.mass_kg, out.v.lines.map((l) => [l.item_name, l.qty, l.unit, l.mass_kg, l.share_pct])] : out.code);
    }
    const CARD = ['1000.000', [['ذرة المراجعة', '1000.000', 'kg', '1000.000', '100.00'], [NAME, '0.001', 'L', '0.000', '0.00']]];
    t.same(cards, [CARD, CARD, CARD],
      'recipe_detail لمسوّدة سطرها 0.001 لتر بكثافة 0.4: لا ترمي للمدير ومشغّل المعمل والمحاسب، والسطر بكتلة 0.000 وحصّة 0.00 (كانت mul_div_domain للثلاثة)');
    const activated = await mutated([], [], async ({ attempt }) => {
      const out = await attempt(ACTIVATE, [D.version]);
      return [code(out), out.ok ? null : out.hint];
    });
    t.same(activated, ['qty_not_positive', ZERO_HINT(NAME)], 'activate_recipe_version: السطر الذي تُقرَّب كتلته صفراً يُرفض qty_not_positive يسمّيه (كانت النسخة تُفعَّل: 1,000 + 0.000 = الأساس)');
    // نسخة مفعَّلة بالسطر الصفري مزروعة كما تتركها قاعدة 0015 أو 0016 قبل الإصلاح: التفعيل بلا فحص الكتلة الصفرية بمعاملة ترجع (والفحص يُشال إن وُجد).
    const planted = (pairs, run) => mutated(pairs, [], async (ctx) => {
      const def = (await ctx.oq('select pg_get_functiondef($1::regprocedure) as d', [ACTIVATE_FN])).rows[0].d;
      if (def.split(ZERO_CHECK).length === 2) await ctx.oq(def.split(ZERO_CHECK).join("    if false then\n      raise exception 'qty_not_positive'"));
      const out = await ctx.attempt(ACTIVATE, [D.version]);
      if (!out.ok) throw new Error(`الزرع: ${out.code}`);
      return run(ctx);
    });
    // (أ) والمادّة ما زالت باللتر: البطاقة، ثمّ «نسخة جديدة» (منذ 0025 بالموادّ وحدها: لا كمية تمرّ بحارس السطر).
    const copied = (pairs = []) => planted(pairs, async ({ attempt }) => {
      const card = await attempt('select public.recipe_detail($1, null)', [D.id]);
      const copy = await attempt('select public.new_recipe_version($1, $2)', [D.id, fresh()]);
      return [card.ok ? card.v.lines.map((l) => [l.mass_kg, l.share_pct]) : card.code, [code(copy), copy.ok ? null : copy.hint]];
    });
    // (ب) وقد صارت المادّة بالكيلو: «نسخة جديدة» بالموادّ وحدها، فلا تحويل بلقطة الكثافة ولا كتلة تُقرَّب صفراً.
    const converted = (pairs = []) => planted(pairs, async ({ oq, attempt }) => {
      await oq("update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1", [LIGHT]);
      const out = await attempt('select public.new_recipe_version($1, $2)', [D.id, fresh()]);
      return [code(out), out.ok ? null : out.hint];
    });
    t.same(await copied(), [[['1000.000', '100.00'], ['0.000', '0.00']], ['ok', null]],
      'نسخة مفعَّلة بالسطر الصفري (مزروعة): بطاقتها لا ترمي (الحصّة 0.00، وكانت mul_div_domain)؛ و«نسخة جديدة» تُنسخ بالموادّ وحدها (0025) فلا كتلة صفرية فيها');
    t.same(await converted(), ['ok', null],
      'وبعد أن تصير المادّة بالكيلو: «نسخة جديدة» بالموادّ وحدها (0025) بلا تحويل، فلا رفض');
    Object.assign(K64, { D, built, converted });
  });
  await section('ق٦٤ طفرات', async () => {
    const { D, built, converted } = K64;
    if (!converted) throw new Error('ق٦٤ لم يكتمل');
    // (١) الحصّة كما كانت (لكلّ كتلة معروفة) ← mul_div_domain؛ (٢) بلا فرع الصفر ← حصّة فارغة لسطر كتلته معروفة صفراً.
    const SHARE = "'share_pct', case when m.kg > 0 then private._mul_div_round(m.kg, 100, v.basis_kg, 2) when m.kg = 0 then 0.00 end::text,";
    const shareWith = (to) => mutated([[RECIPE_DETAIL_FN, [[SHARE, to]]]], [], async ({ attempt }) => {
      const out = await attempt('select public.recipe_detail($1, $2)', [D.id, D.version]);
      return out.ok ? out.v.lines.map((l) => l.share_pct) : out.code;
    });
    t.same([await shareWith(SHARE), await shareWith("'share_pct', case when m.kg is not null then private._mul_div_round(m.kg, 100, v.basis_kg, 2) end::text,"),
      await shareWith("'share_pct', case when m.kg > 0 then private._mul_div_round(m.kg, 100, v.basis_kg, 2) end::text,")],
    [['100.00', '0.00'], 'mul_div_domain', ['100.00', null]],
    'طفرتا recipe_detail (والضابط): الحصّة كما كانت ترمي mul_div_domain للبطاقة كلّها، وبلا فرع الصفر حصّة فارغة لسطر كتلته معروفة');
    // (٣) حارس السطر بلا الفحص ← 0.001 لتر يُقبل؛ (٤) بالضرب المضبوط لا بالكتلة المقرَّبة ← 0.002 لتر (كتلته 0.001) يُرفض.
    const GUARD_ZERO = 'private.liters_to_kg(new.qty, i.density_kg_per_l) = 0';
    t.same([(await built([['private.recipe_lines_guard()', [[GUARD_ZERO, 'false']]]], 0.001))[0],
      (await built([['private.recipe_lines_guard()', [[GUARD_ZERO, 'new.qty * i.density_kg_per_l < 0.001']]]], 0.002))[0]],
    ['ok', 'qty_not_positive'], 'طفرتا حارس السطر: بلا الفحص يُقبل سطر 0.001 لتر؛ وبالضرب المضبوط يُرفض سطر 0.002 لتر وكتلته المقرَّبة 0.001');
    // (٥) التفعيل بلا الفحص ← يُفعَّل. (طفرة التحويل في «نسخة جديدة» سقطت مع التحويل، 0025.)
    const activatedBare = await mutated([[ACTIVATE_FN, [[ZERO_CHECK, "    if false then\n      raise exception 'qty_not_positive'"]]]], [], async ({ attempt }) => code(await attempt(ACTIVATE, [D.version])));
    t.eq(activatedBare, 'ok', 'طفرة الكتابة: التفعيل بلا الفحص يُفعِّل النسخة بالسطر الصفري');
  });

  // ─── ق٦٥ (#4، جزء القاعدة): تلميحات density_required تسمّي المكان الذي تُكتب فيه الكثافة ────────────────────────────────────────────
  const K65 = {};
  /** المكان الفعلي (ب٦١): نافذة «عدّل» في صفحة «المواد» بالمخزن؛ وكانت التلميحات تقول «بطاقة المادّة» والكثافة فيها قراءة فقط. */
  const PLACE = 'اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها)';
  await section('ق٦٥', async () => {
    // «شراب» سائل أوّلي بكثافة 1.25: خلطة مفعَّلة (ذرة 980 + 16 لتراً بلقطة 1.2500) ومسوّدة بالسطرين نفسيهما، ثمّ تُفرَّغ كثافته وهو باللتر.
    const NAME = 'شراب الجولة السادسة';
    const SYR65 = await item(NAME, 'raw', 'L', 1.25);
    const RS = await recipe('خلطة شراب الجولة السادسة', [[CORN, 980], [SYR65, 16, 'L']]);
    const D = await draftRecipe('مسوّدة شراب الجولة السادسة', [[CORN, 980], [SYR65, 16, 'L']]);
    await must(U.manager, 'update public.items set density_kg_per_l = null where id = $1 returning id', [SYR65]);
    /**
     * التلميحات الأربعة بمعاملة ترجع: التفعيل، وحارس السطر (البانية بسطر لتر للشراب)، وإضافة الشراب لدفعة، والإنتاج من خلطة فُرّغت لقطة كثافة سطرها (حالة
     * مزروعة بدور postgres يعدّها الفحص ٣ خرقاً، ولا طريق إلى تلميح الإنتاج غيرها).
     */
    const hintsOf = (fns = []) => mutated(fns, [], async ({ oq, attempt }) => {
      const pair = (out) => [code(out), out.ok ? null : out.hint];
      const activated = pair(await attempt(ACTIVATE, [D.version]));
      const guarded = pair(await attempt("select public.create_recipe($1, $2, 'مسوّدة شراب بلا كثافة', $3, 1000, $4::jsonb, '[]'::jsonb, false)",
        [fresh(), fresh(), FEED, JSON.stringify([{ item_id: CORN, qty: 999, unit: 'kg' }, { item_id: SYR65, qty: 1, unit: 'L' }])]));
      const b = fresh();
      await attempt('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [b, R0.version, RAW, FEEDWH]);
      const added = pair(await attempt('select public.add_production_input($1, $2, $3, 5, null, null)', [b, fresh(), SYR65]));
      await oq("update public.recipe_lines set density_kg_per_l = null where version_id = $1 and unit = 'L'", [RS.version]);
      const produced = pair(await attempt(PRODUCE, [fresh(), RS.version, RAW, FEEDWH]));
      return [activated, guarded, added, produced];
    });
    const live = await hintsOf();
    t.same(live.slice(0, 2), [
      ['density_required', `«${NAME}» سائل بلا كثافة، فلا يُحسب وزنه. ${PLACE} ثمّ فعّل.`],
      ['density_required', `«${NAME}» سائل بلا كثافة، فلا يُحسب وزنه. ${PLACE} ثمّ فعّل.`],
    ], 'تلميحا density_required في التفعيل وحارس السطر يسمّيان المكان الفعلي: «المواد» في المخزن وزرّ «عدّل» بجانبها (كانا «في بطاقة المادّة» حيث الكثافة قراءة فقط)');
    t.same(live.slice(2), [
      ['density_required', `«${NAME}» سائل بلا كثافة، فلا يُحسب وزنه. ${PLACE} أوّلاً.`],
      ['density_required', `«${NAME}» سائل بلا كثافة. ${PLACE} ثمّ أعد الإنتاج.`],
    ], 'وما يشبههما في 0016: تلميح إضافة مادّة للدفعة وتلميح الإنتاج يسمّيان المكان نفسه');
    // والتراجع يعيد نصوص 0015 حرفاً: أجسام التفعيل وحارس السطر والإنتاج في rollback_0016 هي أجسامها في 0015 بتلميحاتها القديمة، و0016 بالمكان الجديد (ومشغّل التراجع
    // في الحزمة الكاملة يقارن الكتالوج بعد التراجع بما قبل 0016).
    const MIGRATION_0015 = readFileSync(new URL('../migrations/0015_mill_recipes_production.sql', import.meta.url), 'utf8');
    /** كتلة دالّة كاملة من نصّ هجرة: من رأسها إلى أوّل «$$;» على سطره بعده. */
    const block = (text, head) => {
      const start = text.indexOf(`create or replace function ${head}(`);
      const end = start < 0 ? -1 : text.indexOf('\n$$;\n', start);
      return end < 0 ? null : text.slice(start, end + 4);
    };
    const heads = ['public.activate_recipe_version', 'private.recipe_lines_guard', 'public.create_production'];
    t.same(heads.map((h) => [block(ROLLBACK_0016, h) !== null && block(ROLLBACK_0016, h) === block(MIGRATION_0015, h),
      (block(ROLLBACK_0016, h) ?? '').includes('اكتب كثافته في بطاقة المادّة'), (block(MIGRATION_0016, h) ?? '').includes(PLACE)]),
    heads.map(() => [true, true, true]),
    'التراجع يعيد أجسام التفعيل وحارس السطر والإنتاج كما في 0015 حرفاً بتلميحاتها القديمة، وفي 0016 التلميح بالمكان الجديد');
    Object.assign(K65, { hintsOf });
  });
  await section('ق٦٥ طفرات', async () => {
    const { hintsOf } = K65;
    if (!hintsOf) throw new Error('ق٦٥ لم يكتمل');
    // التلميح القديم في كلّ دالّة وحدها ← تلميحها وحده يعود «في بطاقة المادّة».
    const OLD = 'اكتب كثافته في بطاقة المادّة';
    const fns = [ACTIVATE_FN, 'private.recipe_lines_guard()', 'public.add_production_input(uuid, uuid, uuid, numeric, uuid, text)', CREATE_FN];
    const seen = [];
    for (const fn of fns) seen.push((await hintsOf([[fn, [[PLACE, OLD]]]])).map(([, hint]) => (hint ?? '').includes(OLD)));
    t.same(seen, [[true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]],
      'طفرات ق٦٥: التلميح القديم في التفعيل أو حارس السطر أو إضافة المادّة للدفعة أو الإنتاج يعيد تلميح تلك الدالّة وحدها إلى «بطاقة المادّة»');
  });

  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بنهاية الملف');
}
