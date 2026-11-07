// يوم المالك من أوّله لآخره (سؤال المالك 2026-11-07: «راجعلي انه السستم اكو تناغم ما بين اني ادخل مواد بسهولة وما بين اكدر اصنع مادة
// علفية بالمعمل باكثر من مادة وأكدر استهلك المواد الي عندي والغاز وذني السوالف بالقاعات بدون ما السستم يعطيني رفض»).
// منشأة على صورة منشأته الحقيقية «مشروع الدواجن العراقي» كما قيست بالإنتاج للقراءة: المخازن الافتراضية، وقاعتان بفوجين قائمين («1» مسكَّن
// قبل ستّة أيّام و«قاعة 2» أمس)، ومواده كما أنشأها هو: «ذرة» و«صويا» بالكيلو، و«زيت» باللتر بلا كثافة، و«كاز» مادّة أوّلية بالقطعة، و«ذراء»
// علف مؤرشف، وخلطة مؤرشفة، وبلا شراء ولا مخزون. ثمّ يومه بالمالك عبر الدوالّ نفسها التي تناديها الشاشات وبترتيبها: الشراء (المخزن يختاره
// الخادم كنافذة «سجّل شراء»)، و«غاز» بالاختيارين المعقولين (وقود بالقطعة، ومادّة أوّلية بالقطعة)، والخلطة بثلاث مواد (الزيت بلا كثافة ثمّ
// بكثافته من خانة البطاقة)، والإنتاج، والصرف للقاعتين، والجولة اليومية، والثوابت.
// الفحص يثبّت السلوك الحاليّ بصدق: كلّ خطوة بنتيجتها (ok أو رمز الرفض)، والملاحظات الدلالية (الكاز مادّة أوّلية فكلفته «علف» على الفوج
// ويُعدّ «علفاً بلا وزن») مثبَّتة كما هي، فتُقلب حين تُصلح. والتقرير الكامل (الخطوة ← النتيجة والتلميح) بمتغيّر البيئة OWNER_DAY_OUT.
import { writeFileSync } from 'node:fs';
import { call, makeOrg, uid } from './ledger-kit.mjs';

const TODAY = '2026-11-07';
const id = (n) => `b1920000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099920${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, { name: 'مشروع الدواجن العراقي', id, phone, roles: [['owner', 'owner']] });
  const { users: U, divisions: D, org } = G;
  const owner = U.owner;
  const one = async (sql, params) => {
    const result = await call(db, owner, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const storeName = Object.fromEntries((await db.admin('select id, name from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.id, r.name]));
  t.same(Object.keys(W).sort(), ['chick', 'feed', 'general', 'hatching_egg', 'medicine', 'raw'], 'المخازن الافتراضية كمنشأة المالك: المواد الأوّلية والعلف والعامّ والأدوية ومخزنا المفقس، بلا مخزن حقل');

  // الحقل وقاعتاه بفوجين قائمين (القاعتان باسميهما كما كتبهما المالك).
  const farm = await one("insert into public.sites (division_id, name, kind) values ($1, 'حقل الدواجن', 'farm') returning id", [D.broiler]);
  const hall = async (name) => one('insert into public.halls (site_id, name) values ($1, $2) returning id', [farm, name]);
  const H = { one: await hall('1'), two: await hall('قاعة 2') };
  const F = {
    one: (await one('select public.open_flock($1, $2, 5000, 0, null, $3) as v', [H.one, day(-6), uid()])).flock_id,
    two: (await one('select public.open_flock($1, $2, 3000, 0, null, $3) as v', [H.two, day(-1), uid()])).flock_id,
  };

  // مواده كما أنشأها (item.create من شاشة المخزن: الاسم والنوع والوحدة، بلا كثافة ولا وزن قطعة).
  const item = (name, kind, unit) => one('insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = { corn: await item('ذرة', 'raw', 'kg'), soy: await item('صويا', 'raw', 'kg'), oil: await item('زيت', 'raw', 'L'), kerosene: await item('كاز', 'raw', 'pc') };
  const oldFeed = await item('ذراء', 'feed', 'kg');
  const oldRecipe = await one("insert into public.recipes (name, output_item_id) values ('خلطة قديمة', $1) returning id", [oldFeed]);
  await one('update public.recipes set archived_at = now() where id = $1 returning id', [oldRecipe]);
  await one('update public.items set archived_at = now() where id = $1 returning id', [oldFeed]);
  const supplier = await one("insert into public.parties (name, is_supplier) values ('مورّد المواد', true) returning id");

  const steps = [];
  const step = (label, result, extra = {}) => {
    steps.push({ step: label, result: result.ok ? 'ok' : result.code, hint: result.ok ? null : result.hint, ...extra });
    return result;
  };
  // نافذة «سجّل شراء»: المخزن فارغ أوّلاً (الخادم يختار المخزن الوحيد الذي يستلم نوع المادّة)، وعند store_required تُختار من القائمة.
  const RP = "select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, null, 'credit', null, null) as v";
  const buy = (label, itemId, qty, price) => {
    const ids = [uid(), uid(), uid()];
    return call(db, owner, RP, [...ids, itemId, supplier, TODAY, qty, price]).then((r) => step(label, r, r.ok ? { store: r.value.warehouse_name } : {}));
  };

  // ── ١) الشراء ─────────────────────────────────────────────────────────────────────────────────────────────────
  const bought = {
    corn: await buy('١) شراء ذرة 10,000 كغم', I.corn, 10000, 450),
    soy: await buy('١) شراء صويا 5,000 كغم', I.soy, 5000, 900),
    oil: await buy('١) شراء زيت 200 لتر (بلا كثافة)', I.oil, 200, 2000),
    kerosene: await buy('١) شراء كاز 20 قطعة (مادّة أوّلية)', I.kerosene, 20, 15000),
  };
  t.same(Object.values(bought).map((r) => (r.ok ? r.value.warehouse_name : r.code)), ['مخزن المواد الأوّلية', 'مخزن المواد الأوّلية', 'مخزن المواد الأوّلية', 'مخزن المواد الأوّلية'],
    'الشراء: المواد الأربع تُحفظ وتدخل «مخزن المواد الأوّلية» (الكاز معها لأنّه مادّة أوّلية)');

  // ── ٢) «غاز» بالاختيارات المعقولة. نافذة «أضف مادّة» البسيطة (SIMPLE_KINDS بـItemCreate.tsx) تعرض أربعة أنواع: «مادّة للمعمل» (raw،
  // الافتراضي) و«علف جاهز» و«دواء» و«أخرى» — بلا «وقود»؛ والوقود من نافذة «المواد» الكاملة وحدها. فالثلاثة: وقود (النافذة الكاملة)، ومادّة
  // للمعمل (الافتراضي)، وأخرى. ─────────────────────────────────────────────────────────────────────────────────────
  const gasFuel = await item('غاز', 'fuel', 'pc');
  const gasRaw = await item('غاز (مادّة أوّلية)', 'raw', 'pc');
  const gasOther = await item('غاز (أخرى)', 'other', 'pc');
  const gasFuelBuy = await buy('٢) شراء غاز (وقود بالقطعة، النافذة الكاملة) 10', gasFuel, 10, 9000);
  const gasRawBuy = await buy('٢) شراء غاز («مادّة للمعمل» بالقطعة، افتراض النافذة البسيطة) 10', gasRaw, 10, 9000);
  const gasOtherBuy = await buy('٢) شراء غاز («أخرى» بالقطعة) 10', gasOther, 10, 9000);
  t.same([gasFuelBuy, gasRawBuy, gasOtherBuy].map((r) => (r.ok ? r.value.warehouse_name : r.code)), ['المخزن العام', 'مخزن المواد الأوّلية', 'المخزن العام'],
    'الغاز: وقوداً أو «أخرى» يدخل «المخزن العام»، و«مادّة للمعمل» يدخل «مخزن المواد الأوّلية»؛ والثلاثة تُحفظ');

  // ── ٣) الخلطة بالبطاقات: ذرة 600 + صويا 350 + زيت 50 لتر، والأساس مجموع الكيلو (الزيت بلا كثافة لا وزن له) ─────────────────
  const starter = await item('علف بادئ', 'feed', 'kg');
  const lines = JSON.stringify([{ item_id: I.corn, qty: '600.000', unit: 'kg' }, { item_id: I.soy, qty: '350.000', unit: 'kg' }, { item_id: I.oil, qty: '50.000', unit: 'L' }]);
  const recipe = { id: uid(), version: uid() };
  const CR = "select public.create_recipe($1, $2, 'علف بادئ', $3, $4, $5::jsonb, '[]'::jsonb, $6) as v";
  const noDensity = step('٣) إنشاء الخلطة والزيت بلا كثافة (مفعَّلة)', await call(db, owner, CR, [recipe.id, recipe.version, starter, '950.000', lines, true]));
  const noDensityDraft = step('٣) إنشاء الخلطة والزيت بلا كثافة (مسوّدة)', await call(db, owner, CR, [recipe.id, recipe.version, starter, '950.000', lines, false]));
  t.same([noDensity.code, noDensityDraft.code], ['density_required', 'density_required'], 'الخلطة بزيت بلا كثافة تُرفض density_required مفعَّلةً ومسوّدةً (وشاشة البطاقات تمنع الحفظ قبلها وتدلّ على خانة الكثافة)');
  t.ok(noDensity.hint.includes('«زيت»'), `تلميح density_required يسمّي «زيت» (${noDensity.hint})`);
  // خانة الكثافة في البطاقة: updateItem(id، النسخة، { density_kg_per_l }) كتابة مباشرة مشروطة بالنسخة (stores.manage للمالك).
  const oilVersion = (await db.admin('select version from public.items where id = $1', [I.oil])).rows[0].version;
  const density = step('٣) كتابة كثافة الزيت 0.92 من خانة البطاقة', await call(db, owner, "update public.items set density_kg_per_l = '0.9200' where id = $1 and version = $2 returning version", [I.oil, oilVersion]));
  t.ok(density.ok, `كثافة الزيت تُكتب من البطاقة (${density.code ?? ''})`);
  const created = step('٣) إنشاء الخلطة بعد الكثافة (الأساس 600 + 350 + 46 = 996 كغم)', await call(db, owner, CR, [recipe.id, recipe.version, starter, '996.000', lines, true]));
  t.same(created.ok ? [created.value.status, created.value.lines] : created.code, ['active', 3], 'الخلطة تُنشأ وتُفعَّل بعد كثافة الزيت (الأساس = مجموع الكيلو)');

  // ── ٤) الإنتاج كنافذة «أنتج» ثمّ صفحة الدفعة: «كم تنتج؟» = مجموع الخلطة، من مخزن المواد إلى مخزن العلف، معاينة ثمّ ترحيل ─────────────
  const batch = uid();
  step('٤) إنشاء دفعة 996 كغم', await call(db, owner, 'select public.create_production($1, $2, 996, $3, $4, $5) as v', [batch, recipe.version, W.raw, W.feed, TODAY]));
  const preview = step('٤) معاينة الدفعة', await call(db, owner, 'select public.preview_production($1) as v', [batch], { commit: false }));
  const costsConfirmed = (await db.admin('select costs_confirmed_at is not null as c from public.production_batches where id = $1', [batch])).rows[0]?.c ?? null;
  const posted = step('٤) ترحيل الدفعة (المالك بلا ختم الكلف)', await call(db, owner, 'select public.post_production($1, $2, $3, $4) as v',
    [batch, preview.value?.version ?? null, preview.value?.plan_token ?? null, uid()]));
  const outputLot = (await db.admin("select trim_scale(qty_in)::text as qty, trim_scale(value_in)::text as value, warehouse_id from public.stock_lots where source_kind = 'production' and source_id = $1", [batch])).rows[0];
  t.same([preview.ok, costsConfirmed, posted.ok, outputLot?.qty, storeName[outputLot?.warehouse_id]], [true, false, true, '996', 'مخزن العلف'],
    'الإنتاج: المعاينة والترحيل للمالك بلا ختم الكلف، ودفعة «علف بادئ» 996 كغم في «مخزن العلف»');

  // ── ٥) الصرف للقاعتين (كنافذة «اصرف»: المخزن يختاره الخادم) ────────────────────────────────────────────────────────
  const RF = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, null) as v';
  const issue = async (label, flock, itemId, qty) => {
    const result = await call(db, owner, RF, [uid(), uid(), uid(), flock, itemId, qty, TODAY]);
    return step(label, result, result.ok ? { store: result.value.warehouse_name, cost_kind: result.value.cost_kind, value: result.value.money?.value ?? null } : {});
  };
  const issued = {
    feed: await issue('٥) صرف «علف بادئ» 500 كغم لقاعة «1»', F.one, starter, 500),
    kerosene: await issue('٥) صرف «كاز» قطعتين لـ«قاعة 2»', F.two, I.kerosene, 2),
    gasFuel: await issue('٥) صرف «غاز» (وقود) قطعة لـ«قاعة 2»', F.two, gasFuel, 1),
    gasRaw: await issue('٥) صرف «غاز» (مادّة أوّلية) قطعة لـ«قاعة 2»', F.two, gasRaw, 1),
    gasOther: await issue('٥) صرف «غاز» (أخرى) قطعة لـ«قاعة 2»', F.two, gasOther, 1),
  };
  t.same(Object.values(issued).map((r) => (r.ok ? [r.value.warehouse_name, r.value.cost_kind] : r.code)), [
    ['مخزن العلف', 'feed'],
    ['مخزن المواد الأوّلية', 'feed'],
    ['المخزن العام', 'fuel'],
    ['مخزن المواد الأوّلية', 'feed'],
    ['المخزن العام', 'other'],
  ], 'الصرف: كلّه يمرّ؛ والكاز والغاز المسجَّلان «مادّة للمعمل» كلفتهما «علف» على الفوج (ملاحظة دلالية: تُقلب حين تُصلح)، ووقوداً «وقود»، و«أخرى» «أخرى»');

  const feedOf = async (flock) => (await call(db, owner, 'select public.flock_feed($1) as v', [flock], { commit: false })).value;
  const hallTwo = await feedOf(F.two);
  t.same([norm(hallTwo.issued_feed_kg), hallTwo.unweighed_feed_lines, norm(hallTwo.remaining_feed_kg)], ['0', 2, '0'],
    '«قاعة 2»: الكاز والغاز (مادّة أوّلية) يُعدّان «علفاً بلا وزن» (سطران) وهما ليسا علفاً (ملاحظة دلالية)');

  // ── ٦) الجولة اليومية لقاعة «1»: العلف المستهلك 100 كغم ────────────────────────────────────────────────────────────
  step('٦) جولة قاعة «1» بعلف مستهلك 100 كغم', await call(db, owner,
    'select public.save_flock_day($1, $2, 0, 0, 100, null, null, null, null, null, null, null, null, $3, false) as v', [F.one, TODAY, uid()]));
  const hallOne = await feedOf(F.one);
  t.same([norm(hallOne.issued_feed_kg), norm(hallOne.consumed_feed_kg), norm(hallOne.remaining_feed_kg), hallOne.unweighed_feed_lines], ['500', '100', '400', 0],
    'قاعة «1»: المصروف 500 كغم والمستهلك 100 والباقي في القاعة 400 كغم');

  // «ما يُصرف» لقاعة «1»: الكاز والغاز (مادّة أوّلية) بين «علف» الكلفة لأنّ نوعهما مادّة أوّلية (ملاحظة دلالية).
  const options = (await call(db, owner, 'select public.flock_issue_options($1) as v', [F.one], { commit: false })).value;
  const listed = options.items.map((x) => [x.name, x.cost_kind]);
  t.same(listed, [['علف بادئ', 'feed'], ['ذرة', 'feed'], ['زيت', 'feed'], ['صويا', 'feed'], ['غاز (مادّة أوّلية)', 'feed'], ['كاز', 'feed'], ['غاز', 'fuel'], ['غاز (أخرى)', 'other']],
    '«ما يُصرف»: العلف المنتَج أوّلاً، والكاز والغاز (مادّة أوّلية) بين علف الكلفة (ملاحظة دلالية)');

  // ── ٧) الثوابت كلّها صفر ──────────────────────────────────────────────────────────────────────────────────────
  const bad = await db.asService(async (q) => {
    const fns = (await q("select p.proname as name from pg_proc p where p.pronamespace = 'public'::regnamespace and left(p.proname, 7) = 'verify_' order by 1")).rows.map((r) => r.name);
    const out = [];
    for (const fn of fns) for (const row of (await q(`select check_name, violations::text as v from public.${fn}()`)).rows) if (row.v !== '0') out.push(`${fn}.${row.check_name} = ${row.v}`);
    return out;
  });
  steps.push({ step: '٧) الثوابت (verify_*)', result: bad.length ? 'violations' : 'ok', hint: bad.join('، ') || null });
  t.same(bad, [], 'الثوابت كلّها صفر في آخر اليوم');

  const refusals = steps.filter((s) => s.result !== 'ok').map((s) => `${s.step}: ${s.result}`);
  t.same(refusals, ['٣) إنشاء الخلطة والزيت بلا كثافة (مفعَّلة): density_required', '٣) إنشاء الخلطة والزيت بلا كثافة (مسوّدة): density_required'],
    'الرفض الوحيد في يوم المالك: الخلطة بزيت بلا كثافة (يُصلحه المالك من خانة الكثافة في البطاقة)');

  if (process.env.OWNER_DAY_OUT) {
    writeFileSync(process.env.OWNER_DAY_OUT, `${JSON.stringify({ steps, hall_1: hallOne, hall_2: hallTwo, options_hall_1: listed }, null, 2)}\n`);
  }
}
