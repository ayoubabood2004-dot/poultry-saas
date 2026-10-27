// 0005 بدور authenticated حقيقي (خطّة المرحلة 1 WP2): البذور ونسخها، وdivision-check (نوع الموقع والمخزن بكل وحدة، ومخزن بيض
// واحد فعّال لكل حقل، وموقع من وحدة ثانية)، وtenant-fk، والنسخة والأرشفة بوقت الخادم، والمواد (الاسم المطبَّع والرموز
// الفريدة بين الفعّالة وبالتزامن، والتوائم بالتطبيع على الطرفين، والقيود)، ووحدات المادّة، وفئات المصاريف النظامية، ويوم
// التشغيل، والنطاق بالموقع والمخزن وmy_workspace، والثوابت بضابط يكسرها. كل منع ويّاه ضابط إيجابي، والمتوقّع من جدول مكتوب
// هنا مستقلّاً عن الشفرة ومقارن بمرآة الشاشة (src/domain/stores.ts) وبمساعد القاعدة نفسه.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from '../../scripts/tests/load-src.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(path.join(DIR, '..', 'migrations', '0005_scopes_stores_items.sql'), 'utf8');

const U = {
  aOwner: 'c5000000-0000-4000-8000-000000000001',
  aManager: 'c5000000-0000-4000-8000-000000000002',
  aKeeper: 'c5000000-0000-4000-8000-000000000003',
  aViewer: 'c5000000-0000-4000-8000-000000000004',
  aAccountant: 'c5000000-0000-4000-8000-000000000005',
  aScoped: 'c5000000-0000-4000-8000-000000000006',
  aInvitee: 'c5000000-0000-4000-8000-000000000007',
  bOwner: 'c5000000-0000-4000-8000-000000000011',
};
const PHONE = {
  aOwner: '9647705500001',
  aManager: '9647705500002',
  aKeeper: '9647705500003',
  aViewer: '9647705500004',
  aAccountant: '9647705500005',
  aScoped: '9647705500006',
  aInvitee: '9647705500007',
  bOwner: '9647705500011',
};
// verify_stores بأسماء فحوصه كلها (مثل ZERO بـcore.test): فحص ينضاف أو ينشال أو يتبدّل اسمه ينمسك هنا.
const ZERO = {
  site_division_kind: 0,
  warehouse_division_kind: 0,
  active_store_on_archived_site: 0,
  table_egg_per_site: 0,
  item_normalized: 0,
  item_code_collisions: 0,
  item_unit_pack: 0,
  item_unit_pieces: 0,
  item_unit_defaults: 0,
  member_scope_targets: 0,
  first_post_without_go_live: 0,
  org_default_seeds: 0,
};

// FOUNDATION ٢٦٣ و٢٧٥–٢٧٧ منقولة هنا مستقلّة عن الشفرة.
const SITE_FOR = { feed_mill: 'mill', broiler: 'farm', layer: 'farm', hatchery: 'hatchery', medicine: 'store', general: 'store' };
const STORES_FOR = {
  feed_mill: ['raw', 'feed'],
  broiler: ['farm'],
  layer: ['farm', 'table_egg'],
  hatchery: ['hatching_egg', 'chick'],
  medicine: ['medicine'],
  general: ['general'],
};
const SITE_KINDS = ['farm', 'mill', 'hatchery', 'store'];
const STORE_KINDS = ['raw', 'feed', 'medicine', 'general', 'hatching_egg', 'chick', 'table_egg', 'farm'];
const DIVISION_KINDS = Object.keys(SITE_FOR);

// E36: البذور كما تكتبها الخطّة.
const SEED_SITES = [
  ['feed_mill', 'المعمل', 'mill', [['مخزن المواد الأوّلية', 'raw'], ['مخزن العلف', 'feed']]],
  ['general', 'المخازن العامة', 'store', [['المخزن العام', 'general']]],
  ['hatchery', 'المفقس', 'hatchery', [['مخزن الأفراخ', 'chick'], ['مخزن بيض التفقيس', 'hatching_egg']]],
  ['medicine', 'مخزن الأدوية', 'store', [['مخزن الأدوية', 'medicine']]],
];
const SEED_PACKS = [['كيس 25 كغم', 'mass', '25'], ['كيس 40 كغم', 'mass', '40'], ['كيس 50 كغم', 'mass', '50']];
const SEED_EXPENSES = [
  ['count_diff', 'فرق جرد'],
  ['expired_destroy', 'إتلاف منتهي'],
  ['purchase_price_diff', 'فرق سعر شراء'],
  ['supplier_return_diff', 'فرق مرتجع'],
  ['voided_receipt', 'استلام ملغى'],
];

const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];

/** نتيجة أمر: 'ok' أو 'zero' (صفر صفوف) أو رمز الرفض: P0001 برمزه، والقيد باسمه، وRLS بـ'rls'. */
function outcome(error) {
  if (error.code === 'P0001') return error.message;
  if (error.code === '23514') return `check:${error.constraint}`;
  if (error.code === '23505') return `unique:${error.constraint}`;
  if (error.code === '23503') return `fk:${error.constraint}`;
  if (error.code === '42501' && /row-level security/u.test(error.message)) return 'rls';
  return `${error.code}:${error.message}`;
}

async function attempt(run) {
  try {
    const result = await run();
    return result && result.rowCount === 0 ? 'zero' : 'ok';
  } catch (error) {
    return outcome(error);
  }
}

/** القيمة، أو نتيجة الرفض إذا رمى (الفحص يكمل ويقارن، ما يطيح الملف). */
async function settled(run) {
  try {
    return await run();
  } catch (error) {
    return outcome(error);
  }
}

/** أمر بمعاملة مفتوحة بنقطة حفظ: 'ok' أو 'zero' أو رمز الرفض، والمعاملة تكمل بعد الرفض. */
async function within(q, sql, params) {
  await q('savepoint s');
  try {
    const result = await q(sql, params);
    await q('release savepoint s');
    return result.rowCount === 0 ? 'zero' : 'ok';
  } catch (error) {
    await q('rollback to savepoint s');
    return outcome(error);
  }
}

/** verify_stores كخريطة اسم ← عدد. */
const verifyMap = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_stores()')).rows.map((r) => [r.check_name, r.v]));

export default async function (t, db) {
  const domain = await loadSrc('src/domain/stores.ts');
  const n = await loadSrc('src/domain/normalize.ts');
  for (const [key, id] of Object.entries(U)) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id, PHONE[key]]);
  }
  await db.asUser(U.aOwner, (q) => q("select public.create_my_org('مزرعة المخازن', 'المالك')"), { commit: true });
  await db.asUser(U.bOwner, (q) => q("select public.create_my_org('مزرعة الجار', 'المالك')"), { commit: true });
  const orgOf = async (user) => (await db.admin('select org_id from public.members where user_id = $1', [user])).rows[0].org_id;
  const orgA = await orgOf(U.aOwner);
  const orgB = await orgOf(U.bOwner);
  const divisionsOf = async (org) => Object.fromEntries((await db.admin('select kind, id from public.divisions where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const divA = await divisionsOf(orgA);
  const divB = await divisionsOf(orgB);
  const member = {};
  for (const [key, role] of [['aManager', 'manager'], ['aKeeper', 'storekeeper'], ['aViewer', 'viewer'], ['aAccountant', 'accountant']]) {
    member[key] = await db.asUser(U.aOwner, async (q) => value(q, 'select public.add_member($1, $2, $3)', [`0${PHONE[key].slice(3)}`, role, key]), { commit: true });
    await db.acceptInvite(U.aOwner, U[key], member[key]);
  }
  // مدير محصور بمعمل العلف (FOUNDATION ٢٤٥ و٥٤٤): النطاق يدخل الكتابة نفسها، مو بس القراءة.
  member.aScoped = await db.asUser(U.aOwner, async (q) => value(q, "select public.add_member($1, 'manager', 'مدير المعمل', array[$2]::uuid[])", [`0${PHONE.aScoped.slice(3)}`, divA.feed_mill]), { commit: true });
  await db.acceptInvite(U.aOwner, U.aScoped, member.aScoped);
  const asManager = (fn, options) => db.asUser(U.aManager, fn, options);

  // ── البذور (E36) ─────────────────────────────────────────────────────────────────────────────────────────
  const seeds = async (q, org) => ({
    sites: (await q(
      `select d.kind as division, s.name, s.kind, array(select w.name || '/' || w.kind from public.warehouses w where w.org_id = s.org_id and w.site_id = s.id order by w.name collate "C") as stores
       from public.sites s join public.divisions d on d.org_id = s.org_id and d.id = s.division_id where s.org_id = $1 order by d.kind collate "C", s.name collate "C"`,
      [org],
    )).rows.map((r) => [r.division, r.name, r.kind, r.stores]),
    packs: (await q("select label, dimension, factor::text from public.pack_types where org_id = $1 order by factor", [org])).rows.map((r) => [r.label, r.dimension, r.factor]),
    expenses: (await q('select system_code, name from public.expense_categories where org_id = $1 and system_code is not null order by system_code collate "C"', [org])).rows.map((r) => [r.system_code, r.name]),
  });
  const expectedSeeds = {
    sites: SEED_SITES.map(([division, name, kind, stores]) => [division, name, kind, stores.map(([store, k]) => `${store}/${k}`).sort()]),
    packs: SEED_PACKS,
    expenses: SEED_EXPENSES,
  };
  // ترتيب «C» نفسه للمخازن بالمتوقّع.
  for (const row of expectedSeeds.sites) row[3].sort((a, b) => (Buffer.from(a) < Buffer.from(b) ? -1 : 1));
  t.same(await db.asOwner((q) => seeds(q, orgA)), expectedSeeds, 'create_my_org زرع المواقع والمخازن وأحجام الأكياس والفئات النظامية كما بالخطّة');
  t.same(await db.asUser(U.aViewer, (q) => seeds(q, orgA)), expectedSeeds, 'المشاهد يقرأ البذور (بلا كلفة، تنقرا لكل المنشأة)');
  const replay = await db.asUser(U.aOwner, (q) => value(q, "select public.create_my_org('مزرعة المخازن', 'المالك') ->> 'org_id'"), { commit: true });
  t.eq(replay, orgA, 'إعادة create_my_org بنفس الاسم ترجّع نفس المنشأة');
  t.same(await db.asOwner((q) => seeds(q, orgA)), expectedSeeds, 'وما تكرّر البذور');
  // الملء (backfill): إعادة 0005 مرّتين ما تكرّر شي، والمزروع اللي انعاد اسمه أو انؤرشف ما يرجع.
  const backfill = await db.asOwner(async (q) => {
    await q("update public.sites set name = 'معمل الحاج' where org_id = $1 and kind = 'mill'", [orgA]);
    await q("update public.pack_types set archived_at = now() where org_id = $1 and factor = 40", [orgA]);
    await q(MIGRATION);
    await q(MIGRATION);
    return { sites: await value(q, 'select count(*)::int from public.sites where org_id = $1', [orgA]), packs: await value(q, 'select count(*)::int from public.pack_types where org_id = $1', [orgA]), expenses: await value(q, 'select count(*)::int from public.expense_categories where org_id = $1', [orgA]) };
  });
  t.same(backfill, { sites: 4, packs: 3, expenses: 5 }, 'الملء مرّتين بعد إعادة اسم وأرشفة: ولا مزروع زايد (البذرة بالوجود، وماكو حذف)');
  // منشأة قبل 0005 (بلا بذور): الملء يزرع كل منشأة، حتى اللي ما بيها مالك حيّ (مالكها موقوف)، فـverify_stores صفر. والملء
  // فعل الهجرة مو فعل شخص: created_by والفاعل بسجلّ التدقيق فارغان (FOUNDATION ٧٩٧: السجلّ يكول منو سوّى شنو).
  const SEEDED = ['sites', 'warehouses', 'pack_types', 'expense_categories'];
  const stripped = await db.asOwner(async (q) => {
    for (const table of ['warehouses', 'sites', 'pack_types', 'expense_categories']) await q(`delete from public.${table} where org_id = any ($1::uuid[])`, [[orgA, orgB]]);
    await q("update auth.users set banned_until = now() + interval '1 day' where id = $1", [U.bOwner]);
    await q(MIGRATION);
    const verify = (await q("select violations::int as v from public.verify_stores() where check_name = 'org_default_seeds'")).rows[0].v;
    const attributed = await value(
      q,
      `select ${SEEDED.map((table) => `(select count(*) from public.${table} where org_id = any ($1::uuid[]) and created_by is not null)`).join(' + ')} as v`,
      [[orgA, orgB]],
    );
    const audit = (await q(
      'select count(*) filter (where actor is not null)::int as named, count(*)::int as rows from public.audit_log where org_id = any ($1::uuid[]) and op = $2 and table_name = any ($3::text[]) and at = now()',
      [[orgA, orgB], 'insert', SEEDED],
    )).rows[0];
    return { a: await seeds(q, orgA), b: await seeds(q, orgB), verify, attributed: Number(attributed), audit };
  });
  t.same(stripped.a, expectedSeeds, 'الملء زرع منشأة بلا بذور (مثل منشأة قبل 0005)');
  t.same(stripped.b, expectedSeeds, 'والمنشأة اللي مالكها موقوف تنزرع هي هم (ما يبقى ثابت غير صفر بعد الإصدار)');
  t.eq(stripped.verify, 0, 'verify_stores.org_default_seeds صفر بعد الملء');
  t.same([stripped.attributed, stripped.audit.named, stripped.audit.rows > 0], [0, 0, true], 'بذور الملء بلا created_by وبلا فاعل بسجلّ التدقيق (الهجرة مو المالك)، والسجلّ كتبها');
  // والملء من جلسة بيها مطالبات مستخدم (هجرة انطبقت من اتّصال بـJWT) هم بلا فاعل: المطالبات تنمسح قبل الزرع (اختبار الطفرات
  // WP2: الضابط فوك بلا مطالبات، فمسحها ما كان إله ضابط).
  const claimed = await db.asOwner(async (q) => {
    for (const table of ['warehouses', 'sites', 'pack_types', 'expense_categories']) await q(`delete from public.${table} where org_id = $1`, [orgB]);
    await q(MIGRATION);
    return {
      seeds: await seeds(q, orgB),
      attributed: Number(await value(q, `select ${SEEDED.map((table) => `(select count(*) from public.${table} where org_id = $1 and created_by is not null)`).join(' + ')} as v`, [orgB])),
    };
  }, U.bOwner);
  t.same(claimed, { seeds: expectedSeeds, attributed: 0 }, 'الملء من جلسة بمطالبات مستخدم: البذور كاملة وبلا created_by');
  // موقع البذرة المؤرشف (بعد أرشفة مخزنه) ما ينزرع من جديد: البذرة بالوجود ولو مؤرشفاً، والمؤرشف يرجع من الأرشيف.
  const archivedSeed = await db.asOwner(async (q) => {
    await q('update public.warehouses set archived_at = now() where org_id = $1 and division_id = $2', [orgA, divA.medicine]);
    await q('update public.sites set archived_at = now() where org_id = $1 and division_id = $2', [orgA, divA.medicine]);
    await q(MIGRATION);
    return value(q, 'select count(*)::int from public.sites where org_id = $1 and division_id = $2', [orgA, divA.medicine]);
  });
  t.eq(archivedSeed, 1, 'الملء بعد أرشفة موقع البذرة: ولا موقع جديد');

  // ── division-check (FOUNDATION ٨٦٤): نوع الموقع × الوحدة، ونوع المخزن × الوحدة ─────────────────────────────────────
  t.same(domain.SITE_KIND_FOR, SITE_FOR, 'مرآة الشاشة: نوع الموقع لكل وحدة كما بالأساس');
  t.same(Object.fromEntries(Object.entries(domain.WAREHOUSE_KINDS_FOR).map(([k, v]) => [k, [...v].sort()])), Object.fromEntries(Object.entries(STORES_FOR).map(([k, v]) => [k, [...v].sort()])), 'مرآة الشاشة: أنواع المخازن لكل وحدة كما بالأساس');
  const helperCells = (await db.admin(
    `select d.kind as division, k.kind, private.site_kind_for(d.kind) as site, private.warehouse_kind_allowed(d.kind, k.kind) as allowed
     from unnest($1::text[]) as d(kind) cross join unnest($2::text[]) as k(kind)`,
    [DIVISION_KINDS, STORE_KINDS],
  )).rows;
  t.same(helperCells.filter((r) => r.site !== SITE_FOR[r.division] || r.allowed !== STORES_FOR[r.division].includes(r.kind)).map((r) => `${r.division}/${r.kind}`), [], `مساعدا القاعدة = الأساس بكل خانة (${helperCells.length})`);
  t.same(helperCells.filter((r) => domain.warehouseKindAllowed(r.division, r.kind) !== STORES_FOR[r.division].includes(r.kind)).map((r) => `${r.division}/${r.kind}`), [], 'warehouseKindAllowed بالشاشة = الأساس بكل خانة');
  // بُعد وحدة الأساس كما يفحصه item_units_check (الكيس بالكيلو، والعبوة باللتر، والكارتون بالعدد).
  t.same(['kg', 'L', 'pc'].map((unit) => domain.dimensionOf(unit)), ['mass', 'volume', 'count'], 'dimensionOf بالشاشة = بُعد وحدة الأساس بالقاعدة');
  const siteCells = {};
  for (const division of DIVISION_KINDS) {
    for (const kind of SITE_KINDS) {
      siteCells[`${division}/${kind}`] = await attempt(() => asManager((q) => q("insert into public.sites (division_id, name, kind) values ($1, 'موقع', $2)", [divA[division], kind])));
    }
  }
  t.same(siteCells, Object.fromEntries(Object.keys(siteCells).map((cell) => [cell, cell.split('/')[1] === SITE_FOR[cell.split('/')[0]] ? 'ok' : 'site_kind_mismatch'])), `نوع الموقع × الوحدة: المطابق ينكتب والباقي site_kind_mismatch (${Object.keys(siteCells).length} خانة)`);
  // حقل لحم وحقل بيض (المستخدم ينشئهما)، وبعدها كل نوع مخزن بموقع من كل وحدة.
  const farms = await asManager(
    async (q) => ({
      broiler: await value(q, "insert into public.sites (division_id, name, kind) values ($1, 'حقل اللحم', 'farm') returning id", [divA.broiler]),
      layer: await value(q, "insert into public.sites (division_id, name, kind) values ($1, 'حقل البيض', 'farm') returning id", [divA.layer]),
      layer2: await value(q, "insert into public.sites (division_id, name, kind) values ($1, 'حقل البيض 2', 'farm') returning id", [divA.layer]),
    }),
    { commit: true },
  );
  // مخزن حقل فعّال بكل حقل (يثبت): أرشفة الموقع وبيه مخازن فعّالة تنفحص عليه، والنسخة والختم على مخزن الحقل الثاني.
  await asManager(async (q) => {
    for (const [division, site] of [['broiler', farms.broiler], ['layer', farms.layer2]]) {
      await q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن الحقل', 'farm')", [divA[division], site]);
    }
  }, { commit: true });
  const siteIn = async (division) => (division === 'broiler' ? farms.broiler : division === 'layer' ? farms.layer : await value(db.admin, 'select id from public.sites where org_id = $1 and division_id = $2 order by created_at limit 1', [orgA, divA[division]]));
  const storeCells = {};
  for (const division of DIVISION_KINDS) {
    const site = await siteIn(division);
    for (const kind of STORE_KINDS) {
      storeCells[`${division}/${kind}`] = await attempt(() => asManager((q) => q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن', $3)", [divA[division], site, kind])));
    }
  }
  t.same(storeCells, Object.fromEntries(Object.keys(storeCells).map((cell) => [cell, STORES_FOR[cell.split('/')[0]].includes(cell.split('/')[1]) ? 'ok' : 'warehouse_kind_mismatch'])), `نوع المخزن × الوحدة: المسموح ينكتب والباقي warehouse_kind_mismatch (${Object.keys(storeCells).length} خانة)`);
  t.ok(Object.values(storeCells).filter((x) => x === 'ok').length === 9, 'ضابط: تسع خانات مسموحة نجحت فعلاً');
  // مخزن بيض واحد فعّال لكل حقل: الثاني يرفض، وبحقل ثاني ينكتب، وبعد أرشفة الأوّل ينكتب، وإعادة المؤرشف ترفض.
  const eggs = await asManager((q) => value(q, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'بيض المائدة', 'table_egg') returning id", [divA.layer, farms.layer]), { commit: true });
  const tableEgg = (site) => () => asManager((q) => q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'بيض ثانٍ', 'table_egg')", [divA.layer, site]));
  t.eq(await attempt(tableEgg(farms.layer)), 'unique:warehouses_one_table_egg', 'مخزن بيض مائدة ثانٍ فعّال بنفس الحقل يرفض');
  t.eq(await attempt(tableEgg(farms.layer2)), 'ok', 'ضابط: بحقل بيض ثانٍ ينكتب');
  const replaced = await asManager(async (q) => {
    await q("update public.warehouses set archived_at = 'now' where id = $1", [eggs]);
    const second = await value(q, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'بيض جديد', 'table_egg') returning id", [divA.layer, farms.layer]);
    return { second: Boolean(second), restore: await attempt(() => q('update public.warehouses set archived_at = null where id = $1', [eggs])) };
  });
  t.same(replaced, { second: true, restore: 'unique:warehouses_one_table_egg' }, 'بعد أرشفة الأوّل ينكتب جديد، وإعادة المؤرشف وبجنبه فعّال ترفض');
  t.eq(await attempt(() => asManager((q) => q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن', 'farm')", [divA.layer, farms.broiler]))), 'fk:warehouses_org_id_division_id_site_id_fkey', 'مخزن بوحدة وموقعه من وحدة ثانية يرفضه المفتاح المركّب');

  // ── tenant-fk (FOUNDATION ٨٦٢): صفّ ما يشير لصفّ منشأة ثانية حتى لو انبعث معرّفه ──────────────────────────────────────
  const itemB = await db.asUser(U.bOwner, (q) => value(q, "insert into public.items (name, kind, base_unit) values ('مادّة الجار', 'raw', 'kg') returning id"), { commit: true });
  t.eq(await attempt(() => asManager((q) => q("insert into public.item_units (item_id, label, factor_to_base) values ($1, 'كيس', 50)", [itemB]))), 'fk:item_units_org_id_item_id_fkey', 'وحدة مادّة تشير لمادّة منشأة ثانية ترفض');
  // سياسة الإدخال تمسكه أوّلاً (وحدة منشأة ثانية مو بنطاق أحد)، والمفتاح المركّب يمسكه حتى برّا السياسات (صاحب الجداول).
  t.eq(await attempt(() => asManager((q) => q("insert into public.sites (division_id, name, kind) values ($1, 'موقع', 'farm')", [divB.broiler]))), 'rls', 'موقع بوحدة منشأة ثانية يرفض (سياسة الإدخال بنطاق الكاتب)');
  t.eq(await attempt(() => db.asOwner((q) => q("insert into public.sites (org_id, division_id, name, kind) values ($1, $2, 'موقع', 'farm')", [orgA, divB.broiler]))), 'fk:sites_org_id_division_id_fkey', 'وحتى صاحب الجداول: المفتاح المركّب يرفض موقعاً بوحدة منشأة ثانية');
  t.eq(await attempt(() => db.asOwner((q) => q("insert into public.item_units (org_id, item_id, label, factor_to_base) values ($1, $2, 'كيس', 50)", [orgA, itemB]))), 'fk:item_units_org_id_item_id_fkey', 'حتى صاحب الجداول: المفتاح المركّب يرفض');
  t.eq(await attempt(() => asManager((q) => q("insert into public.sites (org_id, division_id, name, kind) values ($1, $2, 'موقع', 'farm')", [orgB, divB.broiler]))), '42501:permission denied for table sites', 'المدير ما يكتب المنشأة أصلاً (امتياز الأعمدة بلا org_id، وفوكه سياسة الإدخال)');
  t.eq(await attempt(() => db.asUser(U.aKeeper, (q) => q("insert into public.sites (division_id, name, kind) values ($1, 'موقع', 'farm')", [divA.broiler]))), 'rls', 'الأمين ما يضيف موقعاً (سياسة الإدخال: stores.manage)');
  t.eq(await attempt(() => db.asUser(U.bOwner, (q) => q("update public.sites set name = 'غيّرته' where org_id = $1", [orgA]))), 'zero', 'ومنشأة ب ما تعدّل مواقع منشأة أ (صفر صفوف)');

  // ── النسخة والأرشفة بوقت الخادم (FOUNDATION ٨١٧) ───────────────────────────────────────────────────────────────
  const versions = await asManager(async (q) => {
    const id = farms.broiler;
    const before = await value(q, 'select version from public.sites where id = $1', [id]);
    const renamed = (await q("update public.sites set name = 'حقل الأمل' where id = $1 and version = $2 returning version", [id, before])).rows[0]?.version;
    const stale = (await q("update public.sites set name = 'قديم' where id = $1 and version = $2", [id, before])).rowCount;
    const stamped = (await q("update public.warehouses set archived_at = '2000-01-01' where site_id = $1 returning archived_at > now() - interval '1 minute' as fresh", [farms.layer2])).rows[0]?.fresh;
    const first = await value(q, 'select archived_at from public.warehouses where site_id = $1', [farms.layer2]);
    await q("update public.warehouses set archived_at = '2001-01-01' where site_id = $1", [farms.layer2]);
    const kept = (await value(q, 'select archived_at from public.warehouses where site_id = $1', [farms.layer2])).getTime() === first.getTime();
    return { step: renamed - before, stale, stamped, kept };
  });
  t.same(versions, { step: 1, stale: 0, stamped: true, kept: true }, 'التعديل يزيد النسخة، والنسخة القديمة صفر صفوف، والأرشفة بوقت الخادم مو بوقت الجهاز، والمؤرشف يبقى بوقته الأوّل');
  t.eq(await attempt(() => asManager((q) => q("update public.sites set kind = 'mill' where id = $1", [farms.broiler]))), '42501:permission denied for table sites', 'النوع ثابت بعد الإنشاء (امتياز التعديل على الاسم والأرشفة بس)');
  t.eq(await attempt(() => asManager((q) => q("update public.sites set archived_at = 'now' where id = $1", [farms.broiler]))), 'archived_in_use', 'موقع بيه مخازن فعّالة ما يتؤرشف');
  const siteFlow = await asManager(async (q) => {
    await q("update public.warehouses set archived_at = 'now' where site_id = $1", [farms.broiler]);
    const archived = await attempt(() => q("update public.sites set archived_at = 'now' where id = $1", [farms.broiler]));
    const add = await attempt(() => q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن', 'farm')", [divA.broiler, farms.broiler]));
    return { archived, add };
  });
  t.same(siteFlow, { archived: 'ok', add: 'site_archived' }, 'بعد أرشفة مخازنه يتؤرشف الموقع، ومخزن جديد بموقع مؤرشف يرفض');
  const restoreFlow = await asManager(async (q) => {
    await q("update public.warehouses set archived_at = 'now' where site_id = $1", [farms.broiler]);
    await q("update public.sites set archived_at = 'now' where id = $1", [farms.broiler]);
    return attempt(() => q('update public.warehouses set archived_at = null where site_id = $1', [farms.broiler]));
  });
  t.eq(restoreFlow, 'site_archived', 'وإعادة مخزن من الأرشيف وموقعه مؤرشف ترفض');

  // ── النطاق بكتابة المواقع والمخازن (FOUNDATION ٥٤٤: النطاق يدخل سياسات الكتابة نفسها) ───────────────────────────────
  // مدير محصور بمعمل العلف: ينشئ ويعدّل بوحدته، وبرّاها الإدخال يرفضه RLS والتعديل صفر صفوف.
  const millSite = await value(db.admin, "select id from public.sites where org_id = $1 and kind = 'mill'", [orgA]);
  const rawStore = await value(db.admin, "select id from public.warehouses where org_id = $1 and kind = 'raw'", [orgA]);
  const farmStore = await value(db.admin, 'select id from public.warehouses where site_id = $1 order by created_at limit 1', [farms.broiler]);
  const scopedTry = (sql, params) => attempt(() => db.asUser(U.aScoped, (q) => q(sql, params)));
  t.same(
    {
      siteOut: await scopedTry("insert into public.sites (division_id, name, kind) values ($1, 'حقل خارج النطاق', 'farm')", [divA.broiler]),
      siteIn: await scopedTry("insert into public.sites (division_id, name, kind) values ($1, 'معمل ثانٍ', 'mill')", [divA.feed_mill]),
      renameOut: await scopedTry("update public.sites set name = 'غيّرته' where id = $1", [farms.broiler]),
      renameIn: await scopedTry("update public.sites set name = 'المعمل' where id = $1", [millSite]),
      storeOut: await scopedTry("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن خارج النطاق', 'farm')", [divA.broiler, farms.broiler]),
      storeIn: await scopedTry("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن ثانٍ', 'raw')", [divA.feed_mill, millSite]),
      archiveOut: await scopedTry("update public.warehouses set archived_at = 'now' where id = $1", [farmStore]),
      renameStoreIn: await scopedTry("update public.warehouses set name = 'مخزن الخام' where id = $1", [rawStore]),
    },
    { siteOut: 'rls', siteIn: 'ok', renameOut: 'zero', renameIn: 'ok', storeOut: 'rls', storeIn: 'ok', archiveOut: 'zero', renameStoreIn: 'ok' },
    'المدير المحصور بوحدة: المواقع والمخازن بوحدته بس (برّاها الإدخال RLS والتعديل صفر صفوف)',
  );

  // ── التزامن: أرشفة موقع ضدّ مخزن جديد أو مُعاد بنفس اللحظة (READ COMMITTED، المفتاح الأجنبي ما يقفل كفاية) ─────────────
  // المخزن يقفل صفّ موقعه قبل فحص «الموقع مؤرشف»، فالثانية تنام لحد ما الأولى تثبت، ثم ترفض: ما يصير مخزن فعّال بموقع مؤرشف.
  const twoSessions = async (first, second) => {
    const one = await db.session(U.aManager);
    const two = await db.session(U.aManager);
    try {
      const done = await one.run(...first);
      const pending = two.run(...second);
      const state = await db.settle(pending, two.pid);
      await one.commit();
      const answer = await pending;
      await two.rollback();
      return { first: done.ok ? 'ok' : done.error, state, second: answer.ok ? 'ok' : answer.error };
    } finally {
      await one.rollback();
      await two.rollback();
    }
  };
  const raceSite = await asManager((q) => value(q, "insert into public.sites (division_id, name, kind) values ($1, 'حقل السباق', 'farm') returning id", [divA.broiler]), { commit: true });
  const archiveRaceSite = ["update public.sites set archived_at = 'now' where id = $1", [raceSite]];
  const storeAtRaceSite = ["insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن السباق', 'farm')", [divA.broiler, raceSite]];
  t.same(await twoSessions(archiveRaceSite, storeAtRaceSite), { first: 'ok', state: 'blocked', second: 'site_archived' }, 'أرشفة الموقع أوّلاً: المخزن الجديد ينام ثم يرفض (site_archived)');
  await asManager((q) => q('update public.sites set archived_at = null where id = $1', [raceSite]), { commit: true });
  t.same(await twoSessions(storeAtRaceSite, archiveRaceSite), { first: 'ok', state: 'blocked', second: 'archived_in_use' }, 'المخزن الجديد أوّلاً: أرشفة الموقع تنام ثم ترفض (archived_in_use)');
  await asManager((q) => q("update public.warehouses set archived_at = 'now' where site_id = $1", [raceSite]), { commit: true });
  t.same(
    await twoSessions(archiveRaceSite, ['update public.warehouses set archived_at = null where site_id = $1', [raceSite]]),
    { first: 'ok', state: 'blocked', second: 'site_archived' },
    'وإعادة مخزن من الأرشيف بنفس لحظة أرشفة موقعه: الإعادة تنام ثم ترفض',
  );

  // ── المواد: الاسم المطبَّع والرموز (FOUNDATION ٨١٢–٨١٣، Q2) ────────────────────────────────────────────────────
  const corn = await asManager(
    (q) => q("insert into public.items (name, kind, base_unit, barcode, alt_codes) values ('ذُرة صفراء  مستوردة', 'raw', 'kg', ' ab 12 ', array[' x1 ', 'X1', '', 'ab12', '٧٧٠٩٩']) returning id, name_norm, barcode, alt_codes"),
    { commit: true },
  ).then((r) => r.rows[0]);
  t.same([corn.name_norm, corn.barcode, corn.alt_codes], [n.searchable('ذُرة صفراء  مستوردة'), 'AB12', ['77099', 'X1']], 'الاسم المطبَّع والرموز بـsearchable وnormalize_code: بلا تكرار ولا فارغ ولا الباركود نفسه، وبالترتيب');
  const codeTry = (sql, params) => attempt(() => asManager((q) => q(sql, params)));
  t.eq(await codeTry("insert into public.items (name, kind, base_unit, barcode) values ('ثانية', 'raw', 'kg', 'Ab 12')"), 'twin_exists', 'باركود مستعمل (بشكل ثانٍ) يرفض');
  t.eq(await codeTry("insert into public.items (name, kind, base_unit, alt_codes) values ('ثانية', 'raw', 'kg', array['ab12'])"), 'twin_exists', 'رمز إضافي = باركود مادّة ثانية يرفض');
  t.eq(await codeTry("insert into public.items (name, kind, base_unit, barcode) values ('ثانية', 'raw', 'kg', '77099')"), 'twin_exists', 'باركود = رمز إضافي لمادّة ثانية يرفض (الأرقام الشرقية مطبَّعة)');
  const hint = await asManager(async (q) => {
    try {
      await q("insert into public.items (name, kind, base_unit, alt_codes) values ('ثانية', 'raw', 'kg', array['x 1'])");
      return '';
    } catch (error) {
      return error.hint ?? '';
    }
  });
  // بالترتيب: الرمز ثم المادّة (اختبار الطفرات WP2: تبديلهما كان يعبر لأن الفحص يدوّر على النصّين بس).
  t.ok(hint.includes('الرمز «X1» مستعمل للمادّة «ذُرة صفراء  مستوردة»'), `التلميح يسمّي الرمز والمادّة الثانية (${hint})`);
  t.eq(await attempt(() => asManager((q) => q("insert into public.items (name, kind, base_unit, barcode) values ('ثانية', 'raw', 'kg', 'AB13')"), { commit: true })), 'ok', 'ضابط: رمز جديد ينكتب');
  const archivedCode = await asManager(async (q) => {
    await q("update public.items set archived_at = 'now' where id = $1", [corn.id]);
    const second = await value(q, "insert into public.items (name, kind, base_unit, barcode) values ('بديلة', 'raw', 'kg', 'AB12') returning id");
    return { second: Boolean(second), restore: await attempt(() => q('update public.items set archived_at = null where id = $1', [corn.id])) };
  });
  t.same(archivedCode, { second: true, restore: 'twin_exists' }, 'رمز مادّة مؤرشفة حرّ، وإعادتها والرمز صار لغيرها ترفض');
  // التزامن: جلستان بنفس الرمز بنفس اللحظة، الثانية تنام على القفل الاستشاري وبعد ما تثبت الأولى ترفض.
  const one = await db.session(U.aManager);
  const two = await db.session(U.aManager);
  let race;
  try {
    const first = await one.run("insert into public.items (name, kind, base_unit, barcode) values ('سباق 1', 'raw', 'kg', 'RACE1')");
    const p2 = two.run("insert into public.items (name, kind, base_unit, barcode) values ('سباق 2', 'raw', 'kg', 'race1')");
    const state = await db.settle(p2, two.pid);
    await one.commit();
    race = { first: first.ok, state, second: (await p2).error ?? 'ok' };
    await two.rollback();
  } finally {
    await one.rollback();
    await two.rollback();
  }
  t.same(race, { first: true, state: 'blocked', second: 'twin_exists' }, 'إدخالان بنفس الرمز بنفس اللحظة: الثاني ينام ثم يرفض (ما يصيران مادّتين بنفس الرمز)');

  // التوائم: التطبيع على الطرفين، والمؤرشفة بعلامتها، ومنشأة ثانية برّا.
  await asManager(async (q) => {
    await q("insert into public.items (name, kind, base_unit) values ('أعلاف الدواجن', 'feed', 'kg'), ('صويا 46', 'raw', 'kg')");
    await q("update public.items set archived_at = 'now' where id = $1", [corn.id]);
  }, { commit: true });
  const twins = (name, codes = []) => db.asUser(U.aViewer, (q) => value(q, 'select public.find_item_twins($1, $2::text[])', [name, codes]));
  const names = (list) => list.map((x) => `${x.name}${x.archived ? ' (مؤرشفة)' : ''}${x.same_name ? '' : ' [رمز]'}`);
  t.same(names(await twins('اعلاف الدواجن')), ['أعلاف الدواجن'], 'الهمزة: «اعلاف» تلكى «أعلاف»');
  t.same(names(await twins('صويا ٤٦')), ['صويا 46'], 'الأرقام الشرقية: «صويا ٤٦» تلكى «صويا 46»');
  t.same(names(await twins('ذره صفراء مستورده')), ['ذُرة صفراء  مستوردة (مؤرشفة)'], 'التاء المربوطة والتشكيل والفراغ المزدوج، والمؤرشفة بعلامتها');
  t.same((await twins('شي ثاني', ['ab 13', 'x1'])).map((x) => [x.name, x.codes]), [['ثانية', ['AB13']], ['ذُرة صفراء  مستوردة', ['X1']]], 'بالرمز: الرموز المشتركة بشكلها المطبَّع، والفعّالة أوّلاً');
  t.same(await twins('مادّة الجار'), [], 'مادّة منشأة ثانية ما تبين');
  t.same(await twins(''), [], 'بلا اسم ولا رمز: ولا توأم');
  t.eq(await codeTry("insert into public.items (name, kind, base_unit) values ('اعلاف الدواجن', 'feed', 'kg')"), 'ok', 'التوأم بالاسم يتحفظ بعد التأكيد (التنبيه ثم السماح، Q2)');

  // قيود المادّة بأسمائها (الشاشة تاخذ جملتها من constraint.<اسم القيد>).
  const itemCases = [
    ["('زيت', 'raw', 'kg', 0.92, null, 0.1, null)", 'check:items_density_unit_check', 'كثافة لمادّة بالكيلو'],
    ["('زيت', 'raw', 'L', 'NaN', null, 0.1, null)", 'check:items_density_check', 'كثافة NaN'],
    ["('زيت', 'raw', 'L', 0.00001, null, 0.1, null)", 'check:items_density_check', 'كثافة بخمس مراتب'],
    ["('بيض', 'hatching_egg', 'kg', null, null, 0.1, null)", 'check:items_count_kinds_check', 'بيض التفقيس بالكيلو'],
    ["('قنينة', 'fuel', 'kg', null, 12, 0.1, null)", 'check:items_piece_mass_unit_check', 'كتلة قطعة لمادّة بالكيلو'],
    ["('قنينة', 'fuel', 'pc', null, null, 0.1, null)", 'check:items_pieces_whole_check', 'معدودة بخطوة 0.1'],
    ["('قنينة', 'fuel', 'pc', null, null, 1, 2.5)", 'check:items_pieces_whole_check', 'معدودة بحدّ أدنى 2.5'],
    ["('ملح', 'additive', 'kg', null, null, 0.1, -1)", 'check:items_min_qty_check', 'حدّ أدنى سالب'],
    ["('ملح', 'additive', 'kg', null, null, 'Infinity', null)", 'check:items_scale_step_check', 'خطوة غير محدودة'],
    ["('ملح', 'other', 'm', null, null, 0.1, null)", 'check:items_base_unit_check', 'وحدة أساس مجهولة'],
    ["('ملح', 'salt', 'kg', null, null, 0.1, null)", 'check:items_kind_check', 'نوع مجهول'],
    ["('   ', 'raw', 'kg', null, null, 0.1, null)", 'check:items_name_check', 'اسم فارغ'],
    // اسم من تطويل أو تشكيل بس: searchable يفرّغه، فالاسم المطبَّع فارغ وما ينبحث ولا ينقرا (القائمة كانت تطيح كلّها).
    ["('\u{640}', 'raw', 'kg', null, null, 0.1, null)", 'check:items_name_norm_check', 'اسم تطويل فقط'],
    ["('\u{64B}', 'raw', 'kg', null, null, 0.1, null)", 'check:items_name_norm_check', 'اسم تشكيل فقط'],
    ["('قنينة', 'fuel', 'pc', null, 0, 1, null)", 'check:items_piece_mass_check', 'كتلة قطعة صفر'],
    ["('قنينة غاز فارغة', 'fuel', 'pc', null, 14.5, 1, 0)", 'ok', 'ضابط: معدودة بخطوة 1 وكتلة قطعة'],
    ["('زيت نباتي', 'raw', 'L', 0.92, null, 0.5, 10.25)", 'ok', 'ضابط: سائل بكثافة'],
  ];
  const itemResults = [];
  for (const [values] of itemCases) {
    itemResults.push(await codeTry(`insert into public.items (name, kind, base_unit, density_kg_per_l, piece_mass_kg, scale_step, min_qty) values ${values}`));
  }
  t.same(itemResults, itemCases.map(([, expected]) => expected), `قيود المادّة بأسمائها (${itemCases.map(([, , label]) => label).join('، ')})`);
  // مرآة الشاشة: itemProblems تمسك نفس الحالات قبل الإرسال.
  const draft = (over) => ({ name: 'مادّة', kind: 'raw', baseUnit: 'kg', density: null, pieceMassKg: null, scaleStep: 100n, minQty: null, ...over });
  t.same(
    [
      domain.itemProblems(draft({ density: 9200n })),
      domain.itemProblems(draft({ kind: 'chick' })),
      domain.itemProblems(draft({ baseUnit: 'pc' })),
      domain.itemProblems(draft({ minQty: -1n })),
      domain.itemProblems(draft({ name: ' ' })),
      domain.itemProblems(draft({ baseUnit: 'L', density: 9200n })),
      domain.itemProblems(draft({ name: '\u{640}' })),
      domain.itemProblems(draft({ name: '\u{64B}' })),
      domain.itemProblems(draft({ baseUnit: 'pc', scaleStep: 1000n, pieceMassKg: 0n })),
      domain.itemProblems(draft({ baseUnit: 'pc', scaleStep: 1000n, pieceMassKg: -1000n })),
      domain.itemProblems(draft({ pieceMassKg: 12000n })),
    ],
    [['density_unit'], ['count_kind'], ['pieces_whole'], ['min_qty'], ['name'], [], ['name_norm'], ['name_norm'], ['piece_mass'], ['piece_mass'], ['piece_mass_unit']],
    'itemProblems بالشاشة = قيود القاعدة بنفس الحالات (كل قيد بمشكلته: الكتلة صفر items_piece_mass_check مو قيد الوحدة)',
  );
  // الحدود نفسها (اختبار الطفرات WP2): الاسم 120 حرفاً، والكثافة والخطوة أكبر من صفر، والحدّ الأدنى صفر مقبول، والمعدود حدّه
  // الأدنى عدد صحيح، وبيض المائدة معدود؛ كل حالة بقيدها بالقاعدة (edgeChecks تثبت القاعدة نفسها).
  t.same(
    [
      domain.itemProblems(draft({ name: 'م'.repeat(121) })),
      domain.itemProblems(draft({ name: 'م'.repeat(120) })),
      domain.itemProblems(draft({ baseUnit: 'L', density: 0n })),
      domain.itemProblems(draft({ scaleStep: 0n })),
      domain.itemProblems(draft({ minQty: 0n })),
      domain.itemProblems(draft({ baseUnit: 'pc', scaleStep: 1000n, minQty: 2500n })),
      domain.itemProblems(draft({ kind: 'table_egg' })),
    ],
    [['name'], [], ['density'], ['step'], [], ['pieces_whole'], ['count_kind']],
    'itemProblems بالحدود: 121 حرفاً، كثافة صفر (items_density_check مو قيد الوحدة)، خطوة صفر، حدّ صفر مقبول، حدّ كسري لمعدودة، بيض مائدة بالكيلو',
  );
  // الخطوة الافتراضية بوحدة الأساس: المعدود 1 والباقي 0.1، فإدخال بلا scale_step ما يكسر قيد القطع الصحيحة بافتراضه نفسه.
  const steps = await settled(() =>
    asManager(async (q) => ({
      pc: await value(q, "insert into public.items (name, kind, base_unit) values ('قنينة غاز', 'fuel', 'pc') returning scale_step::text"),
      chick: await value(q, "insert into public.items (name, kind, base_unit) values ('فرخ لاحم', 'chick', 'pc') returning scale_step::text"),
      kg: await value(q, "insert into public.items (name, kind, base_unit) values ('ملح طعام', 'additive', 'kg') returning scale_step::text"),
      liquid: await value(q, "insert into public.items (name, kind, base_unit) values ('زيت صويا', 'raw', 'L') returning scale_step::text"),
    })),
  );
  t.same(steps, { pc: '1', chick: '1', kg: '0.1', liquid: '0.1' }, 'بلا خطوة: المعدود (حتى الأفراخ) بخطوة 1، والكيلو واللتر 0.1');

  // ── وحدات المادّة: الحجم بنفس البُعد ومعامله، والمعدود عدد صحيح، وافتراضي واحد ─────────────────────────────────────
  const oil = await asManager((q) => value(q, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ('زيت الطبخ', 'raw', 'L', 0.92) returning id"), { commit: true });
  const gas = await asManager((q) => value(q, "insert into public.items (name, kind, base_unit, scale_step) values ('غاز', 'fuel', 'pc', 1) returning id"), { commit: true });
  const bran = await asManager((q) => value(q, "insert into public.items (name, kind, base_unit) values ('نخالة', 'raw', 'kg') returning id"), { commit: true });
  const bag25 = await value(db.admin, "select id from public.pack_types where org_id = $1 and factor = 25", [orgA]);
  const unitTry = (sql, params) => attempt(() => asManager((q) => q(sql, params)));
  t.eq(await unitTry("insert into public.item_units (item_id, pack_type_id, label, factor_to_base) values ($1, $2, 'كيس 25 كغم', 25)", [oil, bag25]), 'pack_dimension_mismatch', 'كيس بالكيلو لمادّة باللتر يرفض');
  t.eq(await unitTry("insert into public.item_units (item_id, pack_type_id, label, factor_to_base) values ($1, $2, 'كيس 25 كغم', 20)", [bran, bag25]), 'pack_factor_mismatch', 'وحدة من حجم بمعامل غير حجمه ترفض');
  t.eq(await unitTry("insert into public.item_units (item_id, label, factor_to_base) values ($1, 'نص كارتون', 2.5)", [gas]), 'pieces_not_whole', 'معامل كسري لمادّة معدودة يرفض');
  t.eq(await unitTry("insert into public.item_units (item_id, label, factor_to_base) values ($1, 'برميل', 'NaN')", [oil]), 'check:item_units_factor_check', 'معامل NaN يرفض');
  t.eq(await unitTry("insert into public.item_units (item_id, pack_type_id, label, factor_to_base) values ($1, $2, 'كيس 25 كغم', 25)", [bran, bag25]), 'ok', 'ضابط: الحجم الصحيح ينكتب');
  const defaults = await asManager(async (q) => {
    const first = await value(q, "insert into public.item_units (item_id, label, factor_to_base, is_default) values ($1, 'كيس 50', 50, true) returning id", [bran]);
    const second = await value(q, "insert into public.item_units (item_id, label, factor_to_base, is_default) values ($1, 'شوال 70', 70, true) returning id", [bran]);
    return (await q('select id, is_default from public.item_units where id = any ($1::uuid[]) order by factor_to_base', [[first, second]])).rows.map((r) => r.is_default);
  });
  t.same(defaults, [false, true], 'الافتراضي الجديد يلغي القديم (افتراضي واحد فعّال لكل مادّة)');
  const unitChange = await asManager(async (q) => {
    await q("insert into public.item_units (item_id, label, factor_to_base) values ($1, 'شوال', 70)", [bran]);
    const blocked = await attempt(() => q("update public.items set base_unit = 'L' where id = $1", [bran]));
    return blocked;
  });
  t.eq(unitChange, 'base_unit_in_use', 'وحدة الأساس ما تتبدّل والمادّة إلها وحدات تعبئة فعّالة');
  t.eq(await attempt(() => asManager((q) => q("update public.items set base_unit = 'L', density_kg_per_l = 0.5 where id = $1", [bran]))), 'ok', 'ضابط: بلا وحدات تتبدّل');
  // الوحدة المؤرشفة معرَّفة بوحدة الأساس القديمة وما تنحذف (E52): لو تبدّلت وحدة الأساس بعد أرشفتها، verify_stores يعدّها
  // خرقاً على بيانات سليمة، والمخصّصة لو انعادت تصير «تنكة 18» = 18 لتراً. فالمؤرشفة تمنع التبديل هي هم، والثوابت صفر.
  const archivedUnits = await db.asOwner(async (q) => {
    const oil2 = await value(q, "insert into public.items (name, kind, base_unit) values ('زيت بذور', 'raw', 'kg') returning id");
    const halves = await value(q, "insert into public.items (name, kind, base_unit) values ('أكياس فارغة', 'packaging', 'kg') returning id");
    await q("insert into public.item_units (item_id, pack_type_id, label, factor_to_base) values ($1, $2, 'كيس 25 كغم', 25), ($1, null, 'تنكة 18', 18)", [oil2, bag25]);
    await q("insert into public.item_units (item_id, label, factor_to_base) values ($1, 'نصف كيلو', 0.5)", [halves]);
    await q("update public.item_units set archived_at = 'now' where item_id = any ($1::uuid[])", [[oil2, halves]]);
    const toLiters = await within(q, "update public.items set base_unit = 'L' where id = $1", [oil2]);
    const toPieces = await within(q, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1", [halves]);
    const verify = await verifyMap(q);
    return { toLiters, toPieces, bad: Object.entries(verify).filter(([, v]) => v !== 0).map(([k]) => k) };
  }, U.aManager);
  t.same(archivedUnits, { toLiters: 'base_unit_in_use', toPieces: 'base_unit_in_use', bad: [] }, 'وحدة أساس مادّة إلها وحدات مؤرشفة ما تتبدّل، وverify_stores صفر');

  // ── التزامن: تبديل وحدة الأساس ضدّ وحدة جديدة بنفس اللحظة ─────────────────────────────────────────────────────
  // الوحدة تقفل صفّ مادّتها (for share) قبل ما تقرا وحدة الأساس، فالثانية تنام لحد ما الأولى تثبت وتقرا الحاضر.
  const raceItems = await asManager(
    async (q) => ({
      first: await value(q, "insert into public.items (name, kind, base_unit) values ('مادّة السباق', 'raw', 'kg') returning id"),
      second: await value(q, "insert into public.items (name, kind, base_unit) values ('مادّة السباق 2', 'raw', 'kg') returning id"),
    }),
    { commit: true },
  );
  t.same(
    await twoSessions(["update public.items set base_unit = 'L' where id = $1", [raceItems.first]], ["insert into public.item_units (item_id, label, factor_to_base) values ($1, 'تنكة 18', 18)", [raceItems.first]]),
    { first: 'ok', state: 'blocked', second: 'ok' },
    'تبديل وحدة الأساس أوّلاً: الوحدة الجديدة تنام وتنكتب على الوحدة الجديدة (مو القديمة)',
  );
  t.same(
    await twoSessions(["insert into public.item_units (item_id, label, factor_to_base) values ($1, 'شوال', 70)", [raceItems.second]], ["update public.items set base_unit = 'L' where id = $1", [raceItems.second]]),
    { first: 'ok', state: 'blocked', second: 'base_unit_in_use' },
    'الوحدة الجديدة أوّلاً: تبديل وحدة الأساس ينام ثم يرفض (base_unit_in_use)',
  );

  // ── فئات المصاريف النظامية ─────────────────────────────────────────────────────────────────────────────────
  const countDiff = await value(db.admin, "select id from public.expense_categories where org_id = $1 and system_code = 'count_diff'", [orgA]);
  const expenseTry = (user, sql, params) => attempt(() => db.asUser(user, (q) => q(sql, params)));
  t.eq(await expenseTry(U.aAccountant, "update public.expense_categories set archived_at = 'now' where id = $1", [countDiff]), 'system_expense', 'الفئة النظامية ما تتؤرشف');
  t.eq(await attempt(() => db.asOwner((q) => q("update public.expense_categories set system_code = 'other_code' where id = $1", [countDiff]))), 'system_expense', 'ورمزها ما يتغيّر حتى من صاحب الجداول');
  t.eq(await expenseTry(U.aAccountant, "update public.expense_categories set system_code = 'x' where id = $1", [countDiff]), '42501:permission denied for table expense_categories', 'والواجهة ما تكتب الرمز أصلاً');
  t.eq(await expenseTry(U.aAccountant, "update public.expense_categories set name = 'فروقات الجرد' where id = $1", [countDiff]), 'ok', 'ضابط: اسمها يتعدّل');
  const custom = await db.asUser(U.aAccountant, (q) => value(q, "insert into public.expense_categories (name) values ('كهرباء') returning id"), { commit: true });
  t.eq(await expenseTry(U.aAccountant, "update public.expense_categories set archived_at = 'now' where id = $1", [custom]), 'ok', 'ضابط: الفئة العادية تتؤرشف');

  // ── النطاق بالموقع والمخزن ────────────────────────────────────────────────────────────────────────────────
  const generalStore = await value(db.admin, "select id from public.warehouses where org_id = $1 and kind = 'general'", [orgA]);
  const generalSite = await value(db.admin, 'select site_id from public.warehouses where id = $1', [generalStore]);
  const medicineStore = await value(db.admin, "select id from public.warehouses where org_id = $1 and kind = 'medicine'", [orgA]);
  const siteB = await value(db.admin, 'select id from public.sites where org_id = $1 limit 1', [orgB]);
  const storeB = await value(db.admin, 'select id from public.warehouses where org_id = $1 limit 1', [orgB]);
  const scopesTry = (divisions, sites, warehouses) => attempt(() => db.asUser(U.aOwner, (q) => q('select public.set_member_scopes_v2($1, $2::uuid[], $3::uuid[], $4::uuid[])', [member.aKeeper, divisions, sites, warehouses])));
  t.eq(await scopesTry([], [siteB], []), 'site_not_found', 'موقع منشأة ثانية بالنطاق يرفض');
  t.eq(await scopesTry([], [], [storeB]), 'warehouse_not_found', 'مخزن منشأة ثانية بالنطاق يرفض');
  t.eq(await scopesTry([divB.general], [], []), 'division_not_found', 'ووحدة منشأة ثانية يرفض');
  t.eq(await attempt(() => db.asUser(U.aManager, (q) => q("select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [member.aKeeper, generalStore]))), 'forbidden', 'المدير ما يغيّر النطاق (المالك بس)');
  await db.asUser(U.aOwner, (q) => q("select public.set_member_scopes_v2($1, '{}', array[$2]::uuid[], '{}')", [member.aKeeper, generalSite]), { commit: true });
  await db.asUser(U.aOwner, (q) => q("select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [member.aKeeper, generalStore]), { commit: true });
  const keeperRows = (await db.admin('select site_id is not null as site, warehouse_id is not null as store, archived_at is not null as archived from public.member_scopes where member_id = $1 order by created_at, id', [member.aKeeper])).rows;
  t.same(keeperRows, [{ site: true, store: false, archived: true }, { site: false, store: true, archived: false }], 'الاستبدال يؤرشف صفّ الموقع ويضيف صفّ المخزن (ماكو حذف)');
  const keeper = await db.asUser(U.aKeeper, async (q) => ({
    workspace: await value(q, 'select public.my_workspace()'),
    scope: (await q('select public.in_scope_wh($1) as own, public.in_scope_wh($2) as other, public.in_scope_site($3) as site, public.in_scope_division($4) as division', [generalStore, medicineStore, generalSite, divA.general])).rows[0],
    sites: await value(q, 'select count(*)::int from public.sites'),
  }));
  t.same(keeper.workspace.scopes.map((s) => [s.division_id, s.site_id, s.warehouse_id]), [[divA.general, null, generalStore]], 'my_workspace().scopes بمفاتيحها الثلاثة: الهدف بمفتاحه، وdivision_id وحدته');
  // النسخ المنشورة قبل 0005 (الخدمة العاملة القديمة لحد ما تتحدّث) تقرا كل صفّ نطاق بـtext(division_id): نصّ غير فارغ
  // وإلا WorkspaceShapeError وجلسة الأمين تطيح. المفاتيح الجديدة إضافة بس (الخطّة WP2، FOUNDATION ٢٣٠).
  t.ok(keeper.workspace.scopes.every((s) => typeof s.division_id === 'string' && s.division_id !== ''), 'كل صفّ نطاق بـdivision_id نصّاً غير فارغ (عقد المحلّل المنشور قبل 0005)');
  // الدعوة بنطاق موقع أو مخزن نداء واحد (add_member_v2): نداء ثانٍ يفشل كان يخلّي محاسباً أو مديراً بلا صفوف = كل المنشأة.
  const inviteePhone = `0${PHONE.aInvitee.slice(3)}`;
  t.eq(
    await attempt(() => db.asUser(U.aOwner, (q) => q("select public.add_member_v2($1, 'accountant', 'محاسب المخزن', '{}', '{}', array[$2]::uuid[])", [inviteePhone, storeB]))),
    'warehouse_not_found',
    'دعوة بمخزن منشأة ثانية ترفض كلّها (ولا دعوة بلا نطاق)',
  );
  const invited = await settled(() =>
    db.asUser(U.aOwner, async (q) => {
      const id = await value(q, "select public.add_member_v2($1, 'accountant', 'محاسب المخزن', '{}', '{}', array[$2]::uuid[])", [inviteePhone, generalStore]);
      return (await q('select division_id is not null as d, site_id is not null as s, warehouse_id = $2 as w from public.member_scopes where member_id = $1 and archived_at is null', [id, generalStore])).rows;
    }),
  );
  t.same(invited, [{ d: false, s: false, w: true }], 'دعوة محاسب بنطاق مخزن بنداء واحد: صفّ المخزن وحده من أوّل لحظة');
  t.eq(
    await attempt(() => db.asUser(U.aManager, (q) => q("select public.add_member_v2($1, 'storekeeper', 'أمين', '{}', '{}', '{}')", [inviteePhone]))),
    'forbidden',
    'المدير ما يدعو (المالك بس)',
  );
  t.same(keeper.workspace.divisions, ['general'], 'الوحدات للتنقّل: اللي يلمسها النطاق (مخزن بالمخازن العامة)، E40');
  t.same(keeper.scope, { own: true, other: false, site: false, division: false }, 'الأمين: مخزنه بس؛ موقعه ووحدته مو «بنطاقه كلها» (in_scope_division بمعناه)');
  t.ok(keeper.sites >= 4, 'ضابط: الأمين يقرأ مواقع المنشأة (القراءة بلا كلفة لكل المنشأة)');
  await db.asUser(U.aOwner, (q) => q('select public.set_member_scopes($1, array[$2]::uuid[])', [member.aKeeper, divA.medicine]), { commit: true });
  t.eq(await value(db.admin, 'select count(*)::int from public.member_scopes where member_id = $1 and archived_at is null and warehouse_id is not null', [member.aKeeper]), 0, 'set_member_scopes القديمة (وحدات بس) تؤرشف صفوف المخازن');
  t.same((await db.asUser(U.aKeeper, (q) => value(q, 'select public.my_workspace()'))).divisions, ['medicine'], 'وبعدها وحدته مخزن الأدوية');

  // ── يوم التشغيل (E14، Q1)، بيوم ثابت حتى القفل والتواريخ ما تتبع ساعة الجهاز ──────────────────────────────────────
  await db.setToday('2026-10-27', () => goLiveChecks(t, db, { U, divA, divB }));

  // ── الثوابت: verify_stores صفر بأسماء فحوصه كلها، وكل فحص يمسك كسره وحده (نمط ZERO وBREAKS بـcore.test) ─────────────
  // كل ضابط بمعاملة ترجع، والمشغّل أو الفهرس أو القيد اللي يحرسه معطَّل حتى ينكتب الخرق؛ والعدّ بالمنشأة كلها، فالكسر صفّ واحد.
  t.same(await db.asService(verifyMap), ZERO, 'verify_stores صفر بأسماء فحوصه الاثني عشر بالضبط (بمفتاح الخادم)');
  const generalDivision = "(select id from public.divisions where org_id = $1 and kind = 'general')";
  const BREAKS = {
    site_division_kind: ['alter table public.sites disable trigger sites_check', "update public.sites set kind = 'farm' where org_id = $1 and kind = 'mill'"],
    warehouse_division_kind: ['alter table public.warehouses disable trigger warehouses_check', "update public.warehouses set kind = 'chick' where org_id = $1 and kind = 'general'"],
    active_store_on_archived_site: ['alter table public.sites disable trigger sites_check', `update public.sites set archived_at = now() where org_id = $1 and division_id = ${generalDivision}`],
    table_egg_per_site: [
      'drop index public.warehouses_one_table_egg',
      "insert into public.warehouses (org_id, division_id, site_id, name, kind) select org_id, division_id, site_id, 'بيض مكرّر', 'table_egg' from public.warehouses where org_id = $1 and kind = 'table_egg' and archived_at is null",
    ],
    item_normalized: ['alter table public.items disable trigger items_normalize', "update public.items set name_norm = 'x' where org_id = $1 and name = 'نخالة'"],
    item_code_collisions: ['alter table public.items disable trigger items_normalize', "insert into public.items (org_id, name, name_norm, kind, base_unit, scale_step, alt_codes) values ($1, 'مكرّرة', 'مكرره', 'raw', 'kg', 0.1, array['AB13'])"],
    item_unit_pack: [
      'alter table public.item_units disable trigger item_units_check',
      "insert into public.item_units (org_id, item_id, pack_type_id, label, factor_to_base) select $1, i.id, p.id, 'كيس', 20 from public.items i, public.pack_types p where i.org_id = $1 and i.name = 'نخالة' and p.org_id = $1 and p.factor = 25",
    ],
    item_unit_pieces: ['alter table public.item_units disable trigger item_units_check', "insert into public.item_units (org_id, item_id, label, factor_to_base) select $1, id, 'نصف', 0.5 from public.items where org_id = $1 and name = 'غاز'"],
    item_unit_defaults: [
      'drop index public.item_units_one_default',
      'alter table public.item_units disable trigger item_units_check',
      "insert into public.item_units (org_id, item_id, label, factor_to_base, is_default) select $1, i.id, x.l, x.f, true from public.items i, (values ('أ', 2), ('ب', 3)) as x(l, f) where i.org_id = $1 and i.name = 'غاز'",
    ],
    member_scope_targets: ['alter table public.member_scopes drop constraint member_scopes_one_target', "insert into public.member_scopes (org_id, member_id) select org_id, id from public.members where org_id = $1 and role = 'viewer'"],
    first_post_without_go_live: ["update public.divisions set first_posted_at = now() where org_id = $1 and kind = 'medicine' and go_live_on is null"],
    org_default_seeds: ['alter table public.expense_categories disable trigger expense_categories_check', "update public.expense_categories set system_code = null where org_id = $1 and system_code = 'count_diff'"],
  };
  t.same(Object.keys(BREAKS).sort(), Object.keys(ZERO).sort(), `كل فحص بـverify_stores إله ضابط كسر (${Object.keys(ZERO).length})`);
  for (const [check, statements] of Object.entries(BREAKS)) {
    const broken = await settled(() =>
      db.asOwner(async (q) => {
        for (const sql of statements) await q(sql, sql.includes('$1') ? [orgA] : []);
        return verifyMap(q);
      }),
    );
    t.same(broken, { ...ZERO, [check]: 1 }, `ضابط: verify_stores يمسك ${check} وحده`);
  }
  // كل فرع من الفحوص المركّبة يمسك كسره (اختبار الطفرات WP2: كسر واحد لكل فحص خلّى باقي فروعه بلا ضابط)، وضابط سلبي: رمز
  // مادّة مؤرشفة ويّا فعّالة مو تصادم (الرمز فريد بين الفعّالة بس، والمؤرشفة تنكتب بلا فحص رموز).
  const BRANCHES = [
    ['item_normalized بالباركود', { item_normalized: 1 }, ['alter table public.items disable trigger items_normalize', "update public.items set barcode = 'ab 13' where org_id = $1 and barcode = 'AB13'"]],
    ['item_normalized بالرموز الإضافية', { item_normalized: 1 }, ['alter table public.items disable trigger items_normalize', "update public.items set alt_codes = array['x 9'] where org_id = $1 and name = 'نخالة'"]],
    ['item_code_collisions بين الفعّالة بس', {}, ["insert into public.items (org_id, name, kind, base_unit, barcode, archived_at) values ($1, 'مؤرشفة بنفس الرمز', 'raw', 'kg', 'AB13', now())"]],
    [
      'item_unit_pack بالبُعد',
      { item_unit_pack: 1 },
      [
        'alter table public.item_units disable trigger item_units_check',
        "insert into public.item_units (org_id, item_id, pack_type_id, label, factor_to_base) select $1, i.id, p.id, 'كيس', 25 from public.items i, public.pack_types p where i.org_id = $1 and i.name = 'زيت الطبخ' and p.org_id = $1 and p.factor = 25",
      ],
    ],
    ['org_default_seeds بأحجام التعبئة', { org_default_seeds: 1 }, ['alter table public.item_units drop constraint item_units_org_id_pack_type_id_fkey', 'delete from public.pack_types where org_id = $1']],
    [
      'org_default_seeds بموقع الوحدة',
      { org_default_seeds: 1 },
      ["delete from public.warehouses where org_id = $1 and kind = 'medicine'", "delete from public.sites where org_id = $1 and division_id = (select id from public.divisions where org_id = $1 and kind = 'medicine')"],
    ],
  ];
  for (const [label, expected, statements] of BRANCHES) {
    const broken = await settled(() =>
      db.asOwner(async (q) => {
        for (const sql of statements) await q(sql, sql.includes('$1') ? [orgA] : []);
        return verifyMap(q);
      }),
    );
    t.same(broken, { ...ZERO, ...expected }, `ضابط فرع: ${label}`);
  }

  // ── رفض الهجرة نفسها: صفّ نطاق قديم بلا هدف واحد يوقف 0005 باسمه قبل التحقّق (scope_rows_invalid) ────────────────────
  // 0001 كانت تسمح بصفّ division_id فارغ؛ القيد ينضاف بلا تحقّق، والصفوف تنعدّ، ثم يتحقّق. وضابطه: بلا الصفّ الخرب تنطبق وتتحقّق.
  const reapply = (bad) =>
    settled(() =>
      db.asOwner(async (q) => {
        await q('alter table public.member_scopes drop constraint member_scopes_one_target');
        if (bad) await q('insert into public.member_scopes (org_id, member_id) values ($1, $2)', [orgA, member.aViewer]);
        try {
          await q(MIGRATION);
        } catch (error) {
          return error.message;
        }
        return (await q("select convalidated from pg_constraint where conrelid = 'public.member_scopes'::regclass and conname = 'member_scopes_one_target'")).rows[0]?.convalidated ? 'validated' : 'not_validated';
      }),
    );
  t.eq(await reapply(true), 'scope_rows_invalid', 'صفّ نطاق بلا هدف: الهجرة ترفض باسم scope_rows_invalid');
  t.eq(await reapply(false), 'validated', 'ضابط: بلا صفّ خرب الهجرة تنطبق والقيد يتحقّق');

  await edgeChecks(t, db, { U, PHONE, orgA, orgB, divA, member, domain });
}

async function goLiveChecks(t, db, { U, divA, divB }) {
  const goLive =(user, division, day) => attempt(() => db.asUser(user, (q) => q('select public.set_division_go_live($1, $2::date)', [division, day])));
  t.eq(await goLive(U.aManager, divA.general, null), 'date_required', 'بلا يوم: date_required');
  t.eq(await goLive(U.aKeeper, divA.general, '2026-09-30'), 'forbidden', 'الأمين ما يحدّد يوم التشغيل');
  t.eq(await goLive(U.aManager, divB.general, '2026-09-30'), 'division_not_found', 'وحدة منشأة ثانية: division_not_found');
  // المدير المحصور بمعمل العلف: يوم تشغيل وحدة برّا نطاقه out_of_scope (§2.12)، ووحدته تنقبل.
  t.eq(await goLive(U.aScoped, divA.layer, '2026-09-30'), 'out_of_scope', 'مدير محصور بوحدة: يوم تشغيل وحدة ثانية out_of_scope');
  t.eq(await goLive(U.aScoped, divA.feed_mill, '2026-09-30'), 'ok', 'ضابط: ويوم تشغيل وحدته ينقبل');
  t.eq(await db.asUser(U.aManager, (q) => value(q, "select public.set_division_go_live($1, '2026-09-30')::text", [divA.general]), { commit: true }), '2026-09-30', 'المدير يحدّده ويرجع اليوم');
  t.eq(await value(db.admin, 'select go_live_on::text from public.divisions where id = $1', [divA.general]), '2026-09-30', 'وانحفظ بالوحدة');
  await db.admin("update public.divisions set first_posted_at = '2026-10-01 21:30:00+00' where id = $1", [divA.general]);
  try {
    const frozen = await db.asUser(U.aManager, async (q) => {
      try {
        await q("select public.set_division_go_live($1, '2026-09-25')", [divA.general]);
        return { message: 'ok', hint: '' };
      } catch (error) {
        return { message: error.message, hint: error.hint };
      }
    });
    t.same([frozen.message, frozen.hint.includes('02/10/2026'), frozen.hint.includes('30/09/2026')], ['go_live_frozen', true, true], 'بعد أوّل ترحيل يتجمّد، والتلميح بيوم الترحيل ببغداد وبيوم التشغيل');
  } finally {
    await db.admin('update public.divisions set first_posted_at = null where id = $1', [divA.general]);
  }
  await db.asUser(U.aManager, (q) => q("select public.set_period_lock(date '2026-09-30')"), { commit: true });
  t.eq(await goLive(U.aManager, divA.broiler, '2026-09-20'), 'period_locked', 'يوم تشغيل بفترة مقفلة يرفض');
  t.eq(await goLive(U.aManager, divA.general, '2026-10-05'), 'period_locked', 'ونقل يوم تشغيل من الفترة المقفلة يرفض');
  t.eq(await goLive(U.aManager, divA.broiler, '2026-10-05'), 'ok', 'ضابط: يوم بعد القفل ينقبل');
  t.eq(await goLive(U.aManager, divA.broiler, '2026-09-30'), 'period_locked', 'يوم التشغيل بيوم القفل نفسه يرفض (المقفل لحدّ هذا اليوم ويّاه)');

  // التزامن (E14): أوّل ترحيل يثبت بنفس لحظة تحديد يوم التشغيل. الدالّة تقفل صفّ الوحدة قبل فحص التجميد، فتنام لحد ما يثبت
  // الترحيل ثم ترفض؛ بلا القفل كانت تقرا الصفّ قبل الترحيل وتكتب يوماً جديداً فوك وحدة صار يومها ثابتاً.
  await db.asUser(U.aManager, (q) => q("select public.set_division_go_live($1, '2026-10-10')", [divA.hatchery]), { commit: true });
  const session = await db.session(U.aManager);
  let race;
  await db.admin('begin');
  try {
    await db.admin('update public.divisions set first_posted_at = now() where id = $1', [divA.hatchery]);
    const pending = session.run("select public.set_division_go_live($1, '2026-10-12')", [divA.hatchery]);
    const state = await db.settle(pending, session.pid);
    await db.admin('commit');
    const answer = await pending;
    race = { state, answer: answer.ok ? 'ok' : answer.error };
  } finally {
    await db.admin('rollback');
    await session.rollback();
    await db.admin('update public.divisions set first_posted_at = null where id = $1', [divA.hatchery]);
  }
  t.same(race, { state: 'blocked', answer: 'go_live_frozen' }, 'أوّل ترحيل بنفس لحظة تحديد يوم التشغيل: التحديد ينام على صفّ الوحدة ثم يرفض (go_live_frozen)');
}

// ── حدود القيود والنطاق والرموز (اختبار الطفرات لـWP2: كل حالة هنا كانت طفرة بالهجرة تعبر بلاها) ───────────────────────
// كل رفض بقيده أو رمزه باسمه وبجنبه ضابط إيجابي. المعاملات ترجع، إلا اللي تثبت وترجّع الحال كما كان بنفسها.
async function edgeChecks(t, db, { U, PHONE, orgA, orgB, divA, member, domain }) {
  const one = (sql, params) => value(db.admin, sql, params);
  const millSite = await one("select id from public.sites where org_id = $1 and kind = 'mill' order by created_at, id limit 1", [orgA]);
  const generalStore = await one("select id from public.warehouses where org_id = $1 and kind = 'general' order by created_at, id limit 1", [orgA]);
  const siteB = await one('select id from public.sites where org_id = $1 order by created_at, id limit 1', [orgB]);
  const storeB = await one('select id from public.warehouses where org_id = $1 order by created_at, id limit 1', [orgB]);
  const packB = await one('select id from public.pack_types where org_id = $1 and factor = 25', [orgB]);
  const bag25 = await one('select id from public.pack_types where org_id = $1 and factor = 25', [orgA]);
  const memberB = await one('select id from public.members where user_id = $1', [U.bOwner]);
  const invitePhone = `0${PHONE.aInvitee.slice(3)}`;

  // أطوال الأسماء: الحدّ نفسه ينكتب، وبعده بحرف أو الفارغ يرفض بقيده (صاحب الجداول، فالسياسات ما تحجب القيد).
  const LIMITS = [
    ['sites', 'name', 80, "insert into public.sites (org_id, division_id, name, kind) values ($1, $2, $3, 'farm')", [orgA, divA.broiler]],
    ['warehouses', 'name', 80, "insert into public.warehouses (org_id, division_id, site_id, name, kind) values ($1, $2, $3, $4, 'raw')", [orgA, divA.feed_mill, millSite]],
    ['pack_types', 'label', 40, "insert into public.pack_types (org_id, label, dimension, factor) values ($1, $2, 'mass', 10)", [orgA]],
    ['item_categories', 'name', 80, 'insert into public.item_categories (org_id, name) values ($1, $2)', [orgA]],
    ['items', 'name', 120, "insert into public.items (org_id, name, kind, base_unit) values ($1, $2, 'raw', 'kg')", [orgA]],
    ['item_units', 'label', 40, "insert into public.item_units (org_id, item_id, label, factor_to_base) select $1, i.id, $2, 2 from public.items i where i.org_id = $1 and i.name = 'نخالة'", [orgA]],
    ['expense_categories', 'name', 80, 'insert into public.expense_categories (org_id, name) values ($1, $2)', [orgA]],
  ];
  const lengths = await db.asOwner(async (q) => {
    const out = {};
    for (const [table, , max, sql, fixed] of LIMITS) {
      const at = (text) => within(q, sql, [...fixed, text]);
      out[table] = [await at('م'.repeat(max)), await at('م'.repeat(max + 1)), await at('   ')];
    }
    return out;
  });
  t.same(lengths, Object.fromEntries(LIMITS.map(([table, column]) => [table, ['ok', `check:${table}_${column}_check`, `check:${table}_${column}_check`]])), `الأسماء بحدودها: الحدّ ينكتب، وحرف بعده أو الفارغ يرفض بقيده (${LIMITS.length} جداول)`);

  // الأرقام بحدودها وأنواع المواد كلها (مرآة ITEM_KINDS بالشاشة)، وأحجام التعبئة.
  const insertItem = (q, columns) => {
    const names = Object.keys(columns);
    return within(q, `insert into public.items (org_id, ${names.join(', ')}) values ($1, ${names.map((_, i) => `$${i + 2}`).join(', ')})`, [orgA, ...Object.values(columns)]);
  };
  const pack = (q, dimension, factor) => within(q, "insert into public.pack_types (org_id, label, dimension, factor) values ($1, 'حجم', $2, $3)", [orgA, dimension, factor]);
  const codes = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
  const numbers = await db.asOwner(async (q) => {
    const foreignCategory = await value(q, "insert into public.item_categories (org_id, name) values ($1, 'تصنيف الجار') returning id", [orgB]);
    const kinds = {};
    for (const kind of domain.ITEM_KINDS) kinds[kind] = await insertItem(q, { name: `نوع ${kind}`, kind, base_unit: domain.COUNTED_KINDS.has(kind) ? 'pc' : 'kg' });
    return {
      kinds,
      chickKg: await insertItem(q, { name: 'فرخ بالكيلو', kind: 'chick', base_unit: 'kg' }),
      tableEggKg: await insertItem(q, { name: 'بيض بالكيلو', kind: 'table_egg', base_unit: 'kg' }),
      densityZero: await insertItem(q, { name: 'زيت بلا كثافة', kind: 'raw', base_unit: 'L', density_kg_per_l: '0' }),
      pieceMass3: await insertItem(q, { name: 'قطعة خفيفة', kind: 'fuel', base_unit: 'pc', piece_mass_kg: '0.005' }),
      pieceMass4: await insertItem(q, { name: 'قطعة أخفّ', kind: 'fuel', base_unit: 'pc', piece_mass_kg: '0.0005' }),
      stepZero: await insertItem(q, { name: 'خطوة صفر', kind: 'raw', base_unit: 'kg', scale_step: '0' }),
      step4: await insertItem(q, { name: 'خطوة دقيقة', kind: 'raw', base_unit: 'kg', scale_step: '0.0005' }),
      min4: await insertItem(q, { name: 'حدّ دقيق', kind: 'raw', base_unit: 'kg', min_qty: '0.0005' }),
      barcode64: await insertItem(q, { name: 'باركود طويل', kind: 'raw', base_unit: 'kg', barcode: 'B'.repeat(64) }),
      barcode65: await insertItem(q, { name: 'باركود أطول', kind: 'raw', base_unit: 'kg', barcode: 'A'.repeat(65) }),
      alt20: await insertItem(q, { name: 'عشرون رمزاً', kind: 'raw', base_unit: 'kg', alt_codes: codes('ALTA', 20) }),
      alt21: await insertItem(q, { name: 'واحد وعشرون رمزاً', kind: 'raw', base_unit: 'kg', alt_codes: codes('ALTB', 21) }),
      pack6: await pack(q, 'volume', '0.000001'),
      pack7: await pack(q, 'volume', '0.0000001'),
      packZero: await pack(q, 'mass', '0'),
      packCountFraction: await pack(q, 'count', '12.5'),
      packArea: await pack(q, 'area', '1'),
      categoryOtherOrg: await insertItem(q, { name: 'بتصنيف الجار', kind: 'raw', base_unit: 'kg', category_id: foreignCategory }),
    };
  });
  t.same(
    numbers,
    {
      kinds: Object.fromEntries(domain.ITEM_KINDS.map((kind) => [kind, 'ok'])),
      chickKg: 'check:items_count_kinds_check',
      tableEggKg: 'check:items_count_kinds_check',
      densityZero: 'check:items_density_check',
      pieceMass3: 'ok',
      pieceMass4: 'check:items_piece_mass_check',
      stepZero: 'check:items_scale_step_check',
      step4: 'check:items_scale_step_check',
      min4: 'check:items_min_qty_check',
      barcode64: 'ok',
      barcode65: 'check:items_barcode_check',
      alt20: 'ok',
      alt21: 'check:items_alt_codes_check',
      pack6: 'ok',
      pack7: 'check:pack_types_factor_check',
      packZero: 'check:pack_types_factor_check',
      packCountFraction: 'check:pack_types_count_whole_check',
      packArea: 'check:pack_types_dimension_check',
      categoryOtherOrg: 'fk:items_org_id_category_id_fkey',
    },
    `حدود الأرقام بقيودها، وكل نوع مادّة بالشاشة (${domain.ITEM_KINDS.length}) ينكتب بوحدته، والأفراخ وبيض المائدة بالقطعة بس`,
  );

  // وحدات المادّة: المعامل بستّ مراتب وأكبر من صفر، والحجم بمعامله بالضبط (لا أصغر ولا أكبر)، وحجم منشأة ثانية يرفضه المفتاح
  // المركّب، والافتراضي المؤرشف ما يمنع افتراضياً جديداً، وتعديل الافتراضي نفسه يبقيه افتراضياً.
  const units = await db.asOwner(async (q) => {
    const kg = await value(q, "insert into public.items (org_id, name, kind, base_unit) values ($1, 'مادّة الوحدات', 'raw', 'kg') returning id", [orgA]);
    const unit = (columns) => {
      const names = Object.keys(columns);
      return within(q, `insert into public.item_units (org_id, item_id, ${names.join(', ')}) values ($1, $2, ${names.map((_, i) => `$${i + 3}`).join(', ')})`, [orgA, kg, ...Object.values(columns)]);
    };
    const result = {
      factorZero: await unit({ label: 'صفر', factor_to_base: '0' }),
      factor6: await unit({ label: 'ملّي', factor_to_base: '0.000001' }),
      factor7: await unit({ label: 'أصغر', factor_to_base: '0.0000001' }),
      packLarger: await unit({ pack_type_id: bag25, label: 'كيس 25 كغم', factor_to_base: '30' }),
      packOtherOrg: await unit({ pack_type_id: packB, label: 'كيس الجار', factor_to_base: '25' }),
    };
    const first = await value(q, "insert into public.item_units (org_id, item_id, label, factor_to_base, is_default) values ($1, $2, 'كيس 10', 10, true) returning id", [orgA, kg]);
    await q("update public.item_units set archived_at = 'now' where id = $1", [first]);
    result.defaultAfterArchived = await unit({ label: 'كيس 20', factor_to_base: '20', is_default: true });
    // المؤرشف ما يمسّه الافتراضي الجديد (بلا نسخة جديدة)، فإعادته بالنسخة اللي انعرضت ما تطلع «تغيّر بعدك».
    result.archivedUntouched = (await q('select is_default, version from public.item_units where id = $1', [first])).rows[0];
    const second = await value(q, "select id from public.item_units where item_id = $1 and label = 'كيس 20'", [kg]);
    result.editDefault = await within(q, "update public.item_units set label = 'كيس عشرين' where id = $1", [second]);
    result.stillDefault = await value(q, 'select is_default from public.item_units where id = $1', [second]);
    return result;
  });
  t.same(
    units,
    { factorZero: 'check:item_units_factor_check', factor6: 'ok', factor7: 'check:item_units_factor_check', packLarger: 'pack_factor_mismatch', packOtherOrg: 'fk:item_units_org_id_pack_type_id_fkey', defaultAfterArchived: 'ok', archivedUntouched: { is_default: true, version: 2 }, editDefault: 'ok', stillDefault: true },
    'وحدات المادّة: المعامل بستّ مراتب وموجب، والحجم بمعامله بالضبط، وحجم منشأة ثانية يرفض، والافتراضي المؤرشف ما يمنع جديداً ولا يتغيّر، وتعديل الافتراضي يبقيه',
  );

  // فئات المصاريف: الرمز النظامي بشكله، ومسحه تغيير يرفض حتى من صاحب الجداول.
  t.same(
    await db.asOwner(async (q) => ({
      badCode: await within(q, "insert into public.expense_categories (org_id, name, system_code) values ($1, 'رمز غلط', 'Bad-Code')", [orgA]),
      goodCode: await within(q, "insert into public.expense_categories (org_id, name, system_code) values ($1, 'رمز سليم', 'fuel_diff')", [orgA]),
      clearCode: await within(q, "update public.expense_categories set system_code = null where org_id = $1 and system_code = 'count_diff'", [orgA]),
    })),
    { badCode: 'check:expense_categories_system_code_check', goodCode: 'ok', clearCode: 'system_expense' },
    'الرمز النظامي بحروف صغيرة وشرطة سفلية، ومسح رمز فئة نظامية يرفض (system_expense)',
  );

  // صفوف النطاق: موقع أو مخزن منشأة ثانية يرفضه المفتاح المركّب حتى برّا الدوالّ، وهدفان بصفّ واحد يرفض.
  t.same(
    await db.asOwner(async (q) => ({
      siteOtherOrg: await within(q, 'insert into public.member_scopes (org_id, member_id, site_id) values ($1, $2, $3)', [orgA, member.aViewer, siteB]),
      storeOtherOrg: await within(q, 'insert into public.member_scopes (org_id, member_id, warehouse_id) values ($1, $2, $3)', [orgA, member.aViewer, storeB]),
      twoTargets: await within(q, 'insert into public.member_scopes (org_id, member_id, division_id, site_id) values ($1, $2, $3, $4)', [orgA, member.aViewer, divA.feed_mill, millSite]),
      oneTarget: await within(q, 'insert into public.member_scopes (org_id, member_id, site_id) values ($1, $2, $3)', [orgA, member.aViewer, millSite]),
    })),
    { siteOtherOrg: 'fk:member_scopes_site_fkey', storeOtherOrg: 'fk:member_scopes_warehouse_fkey', twoTargets: 'check:member_scopes_one_target', oneTarget: 'ok' },
    'صفّ النطاق: هدف منشأة ثانية يرفضه المفتاح المركّب، وهدفان بصفّ واحد يرفضهما القيد، وضابط: هدف واحد ينكتب',
  );

  // النسخة تزيد واحداً بكل جدول بيانات أساسية (master_write على السبعة، مو المواقع بس).
  const MASTER = [['sites', 'name'], ['warehouses', 'name'], ['pack_types', 'label'], ['item_categories', 'name'], ['items', 'name'], ['item_units', 'label'], ['expense_categories', 'name']];
  const bumps = await db.asOwner(async (q) => {
    await q("insert into public.item_categories (org_id, name) values ($1, 'تصنيف النسخة')", [orgA]);
    const out = {};
    for (const [table, column] of MASTER) {
      const row = (await q(`select id, version from public.${table} where org_id = $1 order by created_at, id limit 1`, [orgA])).rows[0];
      out[table] = (await value(q, `update public.${table} set ${column} = ${column} where id = $1 returning version`, [row.id])) - row.version;
    }
    return out;
  });
  t.same(bumps, Object.fromEntries(MASTER.map(([table]) => [table, 1])), 'كل تعديل يزيد النسخة واحداً بالجداول السبعة');
  // ختم الأرشفة الأوّل يبقى بمعاملة بعدها (now() ثابت داخل المعاملة الوحدة، فالفحص بمعاملة وحدة ما كان يفرّق).
  const stampedCategory = await db.asUser(
    U.aManager,
    async (q) => {
      const id = await value(q, "insert into public.item_categories (name) values ('تصنيف الختم') returning id");
      await q("update public.item_categories set archived_at = 'now' where id = $1", [id]);
      return id;
    },
    { commit: true },
  );
  const firstStamp = await one('select archived_at::text from public.item_categories where id = $1', [stampedCategory]);
  const secondStamp = await db.asUser(U.aManager, async (q) => {
    await q("update public.item_categories set archived_at = '2001-01-01' where id = $1", [stampedCategory]);
    return value(q, 'select archived_at::text from public.item_categories where id = $1', [stampedCategory]);
  });
  t.eq(secondStamp, firstStamp, 'إعادة أرشفة المؤرشف بمعاملة ثانية: وقت الأرشفة الأوّل يبقى');

  // الرموز: باركود فراغات بس = بلا باركود، والإضافية مطبَّعة ومرتّبة. الترتيب من order by نفسه، مو أثر جانبي لـdistinct:
  // بلا فرز (enable_sort = off) distinct يصير تجزئة. بجلسة جديدة، لأن خطّة المشغّل المحفوظة بالاتّصال القديم ما تنعاد بالإعداد.
  const unsorted = ['zz9', 'mm5', 'AA1', 'kk 2', 'BB3', 'qq7', 'cc4', 'yy0', 'ee8', 'pp6', 'dd2', 'ww1'];
  const freshSession = await db.session(U.aManager);
  let shaped;
  try {
    await freshSession.run('set local enable_sort = off');
    const inserted = await freshSession.run("insert into public.items (name, kind, base_unit, barcode, alt_codes) values ('رموز مرتّبة', 'raw', 'kg', '   ', $1) returning barcode, alt_codes", [unsorted]);
    shaped = inserted.ok ? inserted.rows[0] : inserted.error;
  } finally {
    await freshSession.rollback();
  }
  t.same(shaped, { barcode: null, alt_codes: unsorted.map((code) => code.toUpperCase().replace(' ', '')).sort() }, 'باركود من فراغات يصير بلا باركود، والرموز الإضافية مطبَّعة ومرتّبة');
  // تعديل الرموز يعيد الفحص (الباركود والإضافية)، ورموز المادّة نفسها ما تتصادم ويّاها، وإعادة مادّة رموزها حرّة تنقبل.
  t.same(
    await db.asUser(U.aManager, async (q) => {
      const add = (name, barcode, alt) => value(q, "insert into public.items (name, kind, base_unit, barcode, alt_codes) values ($1, 'raw', 'kg', $2, $3) returning id", [name, barcode, alt]);
      const own = await add('مادّة بالرموز', 'UPD1', ['UPD2']);
      const other = await add('مادّة ثانية بالرموز', 'UPD3', []);
      return {
        barcodeTaken: await within(q, "update public.items set barcode = 'upd1' where id = $1", [other]),
        altTaken: await within(q, "update public.items set alt_codes = array['UPD2'] where id = $1", [other]),
        ownCodes: await within(q, "update public.items set alt_codes = array['UPD2', 'UPD4'] where id = $1", [own]),
        archive: await within(q, "update public.items set archived_at = 'now' where id = $1", [own]),
        restoreFree: await within(q, 'update public.items set archived_at = null where id = $1', [own]),
      };
    }),
    { barcodeTaken: 'twin_exists', altTaken: 'twin_exists', ownCodes: 'ok', archive: 'ok', restoreFree: 'ok' },
    'تعديل الباركود أو الرموز لرمز مستعمل يرفض، ورموز المادّة نفسها ما تتصادم ويّاها، وإعادتها ورموزها حرّة تنقبل',
  );
  t.eq(await attempt(() => db.asUser(U.bOwner, (q) => q("insert into public.items (name, kind, base_unit, barcode) values ('رمز مشترك', 'raw', 'kg', 'AB13')"))), 'ok', 'رمز مستعمل بمنشأة ثانية حرّ هنا (الرمز فريد داخل المنشأة)');

  // التوائم بالرموز بلا اسم: الفعّالة أوّلاً ولو اسمها بعد بالترتيب، وsame_name قيمة منطقية (false مو null).
  t.same(
    await db.asUser(U.aManager, async (q) => {
      await q("insert into public.items (name, kind, base_unit, barcode) values ('ألف قديمة', 'raw', 'kg', 'ORD1'), ('ياء فعّالة', 'raw', 'kg', 'ORD2')");
      await q("update public.items set archived_at = 'now' where barcode = 'ORD1'");
      return (await value(q, "select public.find_item_twins('', array['ord1', 'ord2'])")).map((x) => [x.name, x.archived, x.same_name]);
    }),
    [['ياء فعّالة', false, false], ['ألف قديمة', true, false]],
    'التوائم بالرموز بلا اسم: الفعّالة أوّلاً، وsame_name منطقية',
  );

  // النطاق: صفوف مؤرشفة بس = بلا صفوف (المدير كل المنشأة)، وشي منشأة ثانية برّا حتى للمالك، والمدعوّ قبل القبول والحساب
  // الموقوف (توكنه بعده صالح) ما بنطاقهم شي.
  await db.asUser(U.aOwner, (q) => q("select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [member.aManager, generalStore]), { commit: true });
  await db.asUser(U.aOwner, (q) => q("select public.set_member_scopes_v2($1, '{}', '{}', '{}')", [member.aManager]), { commit: true });
  const cleared = await db.asUser(U.aManager, async (q) => (await q('select public.in_scope_site($1) as site, public.in_scope_wh($2) as store, public.my_workspace() as w', [millSite, generalStore])).rows[0]);
  const archivedRows = await one('select count(*)::int from public.member_scopes where member_id = $1 and archived_at is not null', [member.aManager]);
  t.same([cleared.site, cleared.store, cleared.w.scopes, archivedRows], [true, true, [], 1], 'مدير صفوف نطاقه مؤرشفة كلها = بلا صفوف: كل المنشأة');
  t.same((await db.asUser(U.aOwner, async (q) => (await q('select public.in_scope_site($1) as site, public.in_scope_wh($2) as store, public.in_scope_site($3) as own', [siteB, storeB, millSite])).rows[0])), { site: false, store: false, own: true }, 'موقع ومخزن منشأة ثانية برّا نطاق المالك نفسه، وضابط: موقعه بنطاقه');
  const claims = (user) => JSON.stringify({ sub: user, role: 'authenticated' });
  const scopeOf = async (q) => (await q('select public.in_scope_site($1) as site, public.in_scope_wh($2) as store', [millSite, generalStore])).rows[0];
  t.same(
    await db.asOwner(async (q) => {
      const invite = await value(q, "select public.add_member($1, 'manager', 'مدير مدعوّ')", [invitePhone]);
      await q("select set_config('request.jwt.claims', $1, true)", [claims(U.aInvitee)]);
      return { invite: Boolean(invite), ...(await scopeOf(q)) };
    }, U.aOwner),
    { invite: true, site: false, store: false },
    'مدعوّ مدير ما قبل الدعوة: ما بنطاقه شي لحد ما يقبل',
  );
  t.same(
    await db.asOwner(async (q) => {
      const live = await scopeOf(q);
      await q("update auth.users set banned_until = now() + interval '1 day' where id = $1", [U.aManager]);
      return { live, banned: await scopeOf(q) };
    }, U.aManager),
    { live: { site: true, store: true }, banned: { site: false, store: false } },
    'حساب موقوف وتوكنه بعده صالح: ما بنطاقه شي، وضابط: قبل الإيقاف بنطاقه',
  );
  // الوحدات للتنقّل (E40): صفّ موقع يلمس وحدة الموقع.
  await db.asUser(U.aOwner, (q) => q("select public.set_member_scopes_v2($1, '{}', array[$2]::uuid[], '{}')", [member.aKeeper, millSite]), { commit: true });
  const touched = await db.asUser(U.aKeeper, (q) => value(q, 'select public.my_workspace()'));
  await db.asUser(U.aOwner, (q) => q('select public.set_member_scopes($1, array[$2]::uuid[])', [member.aKeeper, divA.medicine]), { commit: true });
  t.same([touched.divisions, touched.scopes.map((s) => s.site_id)], [['feed_mill'], [millSite]], 'أمين بنطاق موقع المعمل: وحدته بالتنقّل معمل العلف');
  // ومحاسب بلا صفوف نطاق: كل الوحدات بالتنقّل (مثل in_scope_division).
  t.eq((await db.asUser(U.aAccountant, (q) => value(q, 'select public.my_workspace()'))).divisions.length, 6, 'محاسب بلا صفوف نطاق: الوحدات الست كلها بالتنقّل');
  // الاستبدال يرجّع الصفّ المؤرشف نفسه (وحدة وموقع ومخزن)، مو يتركه مؤرشفاً ولا يضيف صفّاً ثانياً: نطاق كامل ← فارغ ← نفسه.
  const setKeeper = (divisions, sites, stores) => db.asUser(U.aOwner, (q) => q('select public.set_member_scopes_v2($1, $2::uuid[], $3::uuid[], $4::uuid[])', [member.aKeeper, divisions, sites, stores]), { commit: true });
  const full = [[divA.general], [millSite], [generalStore]];
  await setKeeper(...full);
  const before = (await db.admin('select id from public.member_scopes where member_id = $1 and archived_at is null order by id', [member.aKeeper])).rows.map((r) => r.id);
  await setKeeper([], [], []);
  await setKeeper(...full);
  const after = (await db.admin('select id from public.member_scopes where member_id = $1 and archived_at is null order by id', [member.aKeeper])).rows.map((r) => r.id);
  await db.asUser(U.aOwner, (q) => q('select public.set_member_scopes($1, array[$2]::uuid[])', [member.aKeeper, divA.medicine]), { commit: true });
  t.same([before.length, after], [3, before], 'إعادة نطاق انشال: الصفوف الثلاثة نفسها ترجع من الأرشيف (وحدة وموقع ومخزن)');

  // دوالّ النطاق: معرّف فارغ بالقائمة، وعضو منشأة ثانية، وموقع منشأة ثانية بالدعوة، كلها ترفض باسمها قبل أي كتابة.
  const asOwnerTry = (sql, params) => attempt(() => db.asUser(U.aOwner, (q) => q(sql, params)));
  t.same(
    {
      nullSite: await asOwnerTry("select public.set_member_scopes_v2($1, '{}', array[null]::uuid[], '{}')", [member.aKeeper]),
      nullStore: await asOwnerTry("select public.set_member_scopes_v2($1, '{}', '{}', array[null]::uuid[])", [member.aKeeper]),
      otherMember: await asOwnerTry("select public.set_member_scopes_v2($1, '{}', '{}', '{}')", [memberB]),
      inviteSiteB: await asOwnerTry("select public.add_member_v2($1, 'storekeeper', 'أمين', '{}', array[$2]::uuid[], '{}')", [invitePhone, siteB]),
      managerFirst: await attempt(() => db.asUser(U.aManager, (q) => q("select public.add_member_v2($1, 'storekeeper', 'أمين', '{}', array[$2]::uuid[], '{}')", [invitePhone, siteB]))),
    },
    { nullSite: 'site_not_found', nullStore: 'warehouse_not_found', otherMember: 'member_not_found', inviteSiteB: 'site_not_found', managerFirst: 'forbidden' },
    'معرّف فارغ بالمواقع أو المخازن، وعضو منشأة ثانية، وموقع منشأة ثانية بالدعوة: كلها ترفض باسمها، والصلاحية قبل فحص القوائم (المدير forbidden)',
  );
  t.same(
    await db.asUser(U.aOwner, async (q) => {
      const id = await value(q, "select public.add_member_v2($1, 'storekeeper', 'أمين الوحدة والمخزن', array[$2]::uuid[], '{}', array[$3]::uuid[])", [invitePhone, divA.general, generalStore]);
      return (await q('select division_id is not null as d, warehouse_id is not null as w from public.member_scopes where member_id = $1 and archived_at is null order by 1 desc', [id])).rows;
    }),
    [{ d: true, w: false }, { d: false, w: true }],
    'دعوة بوحدة ومخزن سوا: الصفّان فعّالان (نطاق الدعوة كلّه، مو الأماكن بس)',
  );
}
