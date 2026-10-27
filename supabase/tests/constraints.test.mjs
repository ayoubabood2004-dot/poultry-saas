// قاموس القيود (الخطّة WP0، GT-20، FOUNDATION ٨٠٨): كل قيد check بكتالوج القاعدة (public وprivate) إله جملة فصيحة بـ
// src/lib/repo/constraints.ts بمفتاح constraint.<اسم القيد>، وماكو جملة لقيد مو موجود. والطريق كامل: رفض حقيقي من القاعدة
// ← رسالته ← classifyPostgrest ← نفس الجملة. الملف الحقيقي يتحزم بـesbuild (افحص المصدر لا نسخة منه).
// المرحلة 1 (WP2): قواميس الوحدات الكسولة (constraints-stores.ts، يسجّله inventory.ts لمّا ينحمّل ويّا شاشته) برّا مسار الجلسة
// الحرج، فالفحص يقارن القواميس كلها سوا بالكتالوج، وبلا قيد بقاموسين، والطريق كامل من شاشة المخازن (inventory.ts) هم.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARABIC = /[\u{600}-\u{6FF}]/u;
const SOURCES = ['constraints.ts', 'constraints-stores.ts'];

/** الناقص والزايد بين الكتالوج والقاموس. */
export function dictionaryGaps(catalog, dictionary) {
  return {
    missing: catalog.filter((name) => !dictionary.includes(name)),
    stale: dictionary.filter((name) => !catalog.includes(name)),
  };
}

async function bundle(contents) {
  const result = await build({
    stdin: { contents, resolveDir: ROOT, loader: 'ts' },
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

export default async function (t, db) {
  const m = await bundle(
    [
      "export { CONSTRAINT_HINTS, constraintHint, violatedConstraint } from './src/lib/repo/constraints.ts';",
      "export { STORES_CONSTRAINT_HINTS } from './src/lib/repo/constraints-stores.ts';",
      "export { classifyPostgrest } from './src/lib/repo/core.ts';",
    ].join('\n'),
  );
  // شاشة المخازن: inventory.ts بحزمة لحاله (بلا constraints-stores صريح) يسجّل القاموس نفسه.
  const page = await bundle("export { classifyPostgrest } from './src/lib/repo/core.ts'; import './src/lib/repo/inventory.ts';");
  const sources = SOURCES.map((name) => readFileSync(path.join(ROOT, 'src', 'lib', 'repo', name), 'utf8')).join('\n');

  const catalog = (await db.admin("select conname from pg_constraint where contype = 'c' and connamespace in ('public'::regnamespace, 'private'::regnamespace) order by 1")).rows.map((r) => r.conname);
  t.ok(catalog.length >= 40, `قيود check بالكتالوج (${catalog.length})`);
  const core = Object.keys(m.CONSTRAINT_HINTS);
  const stores = Object.keys(m.STORES_CONSTRAINT_HINTS);
  t.same(core.filter((name) => stores.includes(name)), [], 'ماكو قيد بقاموسين');
  const dictionary = [...core, ...stores].sort();
  t.same(dictionaryGaps(catalog, dictionary), { missing: [], stale: [] }, `كل قيد check إله جملته، وماكو جملة بلا قيد (${dictionary.length})`);
  t.same(dictionaryGaps(['x_qty_check', ...catalog], dictionary).missing, ['x_qty_check'], 'ضابط: قيد جديد بلا جملة ينمسك');

  // المفتاح نفسه constraint.<اسم القيد> (مو مفتاح ثاني بنفس الجملة)، والجملة عربية ومو الجملة العامة.
  const fallback = m.constraintHint('no_such_check');
  const badKeys = dictionary.filter((name) => !sources.includes(`t('constraint.${name}', `));
  t.same(badKeys, [], 'كل جملة بمفتاح constraint.<اسم القيد> بالضبط');
  const badText = dictionary.filter((name) => {
    const text = m.constraintHint(name);
    return !ARABIC.test(text) || text === fallback || text.includes(name);
  });
  t.same(badText, [], 'كل جملة عربية وخاصّة بقيدها، مو الجملة العامة');
  t.ok(fallback.includes('«no_such_check»'), 'ضابط: قيد مجهول ياخذ الجملة العامة وتسمّيه');

  // من القاعدة نفسها: إدخال يخرق orgs_name_check ← 23514 برسالته ← classifyPostgrest ← جملة القيد.
  const violate = async (sql) => {
    try {
      await db.asOwner((q) => q(sql));
      return null;
    } catch (error) {
      return { code: error.code, message: error.message };
    }
  };
  const violation = await violate("insert into public.orgs (name) values ('   ')");
  t.eq(violation?.code, '23514', 'ضابط: اسم منشأة فارغ يخرق قيد check فعلاً');
  const classified = m.classifyPostgrest({ code: violation?.code, message: violation?.message }, 400, 'rpc', true);
  t.same([classified.code, classified.hint], ['check_violation', m.CONSTRAINT_HINTS.orgs_name_check()], 'رفض القاعدة الحقيقي يوصل الشاشة بجملة قيده');

  // 0005: قيد مادّة حقيقي (كثافة لمادّة بالكيلو) ← جملته من القاموس الكسول، من حزمة inventory.ts وحده.
  // منشأة الملف نفسه، مو أوّل منشأة بالقاعدة: الفحص لحاله (node supabase/tests/run.mjs constraints) كان يطيح بلا منشأة.
  const owner = 'c6000000-0000-4000-8000-000000000001';
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [owner, '9647706600001']);
  await db.asUser(owner, (q) => q("select public.create_my_org('منشأة القيود', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [owner])).rows[0].org_id;
  const density = await violate(`insert into public.items (org_id, name, kind, base_unit, density_kg_per_l) values ('${org}', 'زيت', 'raw', 'kg', 0.92)`);
  t.eq(density?.code, '23514', 'ضابط: كثافة لمادّة بالكيلو تخرق قيد check فعلاً');
  const fromPage = page.classifyPostgrest({ code: density?.code, message: density?.message }, 400, 'table', true);
  t.same([fromPage.code, fromPage.hint], ['check_violation', m.STORES_CONSTRAINT_HINTS.items_density_unit_check()], 'رفض قيد مادّة يوصل شاشة المخازن بجملته (القاموس الكسول مسجَّل)');
  const bare = await bundle("export { classifyPostgrest } from './src/lib/repo/core.ts';");
  t.ok(bare.classifyPostgrest({ code: density?.code, message: density?.message }, 400, 'table', true).hint.includes('«items_density_unit_check»'), 'ضابط: بلا inventory.ts (مسار الجلسة) القيد ياخذ الجملة العامة، فالتسجيل هو اللي يوصّل الجملة');
}
