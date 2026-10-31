// قاموس القيود (الخطّة WP0، GT-20، FOUNDATION ٨٠٨): كل قيد check بكتالوج القاعدة (public وprivate) إله جملة فصيحة بـ
// src/lib/repo/constraints.ts بمفتاح constraint.<اسم القيد>، وماكو جملة لقيد مو موجود. والطريق كامل: رفض حقيقي من القاعدة
// ← رسالته ← classifyPostgrest ← explained ← نفس الجملة. الملف الحقيقي يتحزم بـesbuild (افحص المصدر لا نسخة منه).
// المرحلة 1 (WP2): قاموس لكل وحدة (constraints-stores.ts)، والفحص يقارن القواميس كلها سوا بالكتالوج، وبلا قيد بقاموسين.
// المرحلة 1 (WP3): قاموس النواة (constraints.ts) كسول، core.ts يجيبه بـimport() لحظة الرفض (explained)، فهو برّا مسار الجلسة
// الحرج (bundle-guard LAZY_ONLY)؛ وقاموسا المخازن والدفاتر يسجّلان نفسيهما فيه لمّا ينحمّل ملف وحدتهما (inventory.ts، parties.ts
// وcash.ts عبره) ويّا شاشته. المرحلة 1 (WP4): قاموس المخزون (constraints-stock.ts) يسجّله inventory.ts هم. فالطريق كامل من ملف كل شاشة لحاله (core ويّا ملف الوحدة بس، بلا استيراد القاموس صريحاً)، وضابطه:
// core وحده يرجّع الجملة العامة، فاستيراد التسجيل المشال من ملف الوحدة ينمسك.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARABIC = /[\u{600}-\u{6FF}]/u;
const SOURCES = ['constraints.ts', 'constraints-stores.ts', 'constraints-ledger.ts', 'constraints-stock.ts', 'constraints-receipts.ts', 'constraints-flocks.ts'];

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
      "export { CONSTRAINT_HINTS, constraintHint } from './src/lib/repo/constraints.ts';",
      "export { STORES_CONSTRAINT_HINTS } from './src/lib/repo/constraints-stores.ts';",
      "export { LEDGER_CONSTRAINT_HINTS } from './src/lib/repo/constraints-ledger.ts';",
      "export { STOCK_CONSTRAINT_HINTS } from './src/lib/repo/constraints-stock.ts';",
      "export { RECEIPT_CONSTRAINT_HINTS } from './src/lib/repo/constraints-receipts.ts';",
      "export { FLOCK_CONSTRAINT_HINTS } from './src/lib/repo/constraints-flocks.ts';",
      "export { classifyPostgrest, explained, violatedConstraint } from './src/lib/repo/core.ts';",
    ].join('\n'),
  );
  const sources = SOURCES.map((name) => readFileSync(path.join(ROOT, 'src', 'lib', 'repo', name), 'utf8')).join('\n');

  const catalog = (await db.admin("select conname from pg_constraint where contype = 'c' and connamespace in ('public'::regnamespace, 'private'::regnamespace) order by 1")).rows.map((r) => r.conname);
  t.ok(catalog.length >= 40, `قيود check بالكتالوج (${catalog.length})`);
  const parts = [Object.keys(m.CONSTRAINT_HINTS), Object.keys(m.STORES_CONSTRAINT_HINTS), Object.keys(m.LEDGER_CONSTRAINT_HINTS), Object.keys(m.STOCK_CONSTRAINT_HINTS), Object.keys(m.RECEIPT_CONSTRAINT_HINTS), Object.keys(m.FLOCK_CONSTRAINT_HINTS)];
  const twice = parts.flatMap((names, i) => names.filter((name) => parts.some((other, j) => j !== i && other.includes(name))));
  t.same(twice, [], 'ماكو قيد بقاموسين');
  const dictionary = parts.flat().sort();
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

  // من القاعدة نفسها: إدخال يخرق orgs_name_check ← 23514 برسالته ← classifyPostgrest ← explained ← جملة القيد.
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
  t.same([classified.code, classified.hint, classified.constraint], ['check_violation', null, 'orgs_name_check'], 'التصنيف المتزامن (مسار الجلسة): رفض باسم القيد بلا جملته');
  const explained = await m.explained(classified);
  t.same([explained.code, explained.hint], ['check_violation', m.CONSTRAINT_HINTS.orgs_name_check()], 'explained: رفض القاعدة الحقيقي يوصل الشاشة بجملة قيده');

  // 0005 و0006: قيد مادّة وقيد دفتر حقيقيان ← جملتاهما من قواميس وحداتهما عبر نفس الطريق.
  // منشأة الملف نفسه، مو أوّل منشأة بالقاعدة: الفحص لحاله (node supabase/tests/run.mjs constraints) كان يطيح بلا منشأة.
  const owner = 'c6000000-0000-4000-8000-000000000001';
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [owner, '9647706600001']);
  await db.asUser(owner, (q) => q("select public.create_my_org('منشأة القيود', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [owner])).rows[0].org_id;
  const density = await violate(`insert into public.items (org_id, name, kind, base_unit, density_kg_per_l) values ('${org}', 'زيت', 'raw', 'kg', 0.92)`);
  t.eq(density?.code, '23514', 'ضابط: كثافة لمادّة بالكيلو تخرق قيد check فعلاً');
  const fromItems = await m.explained(m.classifyPostgrest({ code: density?.code, message: density?.message }, 400, 'table', true));
  t.same([fromItems.code, fromItems.hint], ['check_violation', m.STORES_CONSTRAINT_HINTS.items_density_unit_check()], 'رفض قيد مادّة يوصل بجملته من قاموس المخازن');
  const box = await violate(`insert into public.cash_accounts (org_id, name, kind) values ('${org}', 'الصندوق', 'safe')`);
  t.eq(box?.code, '23514', 'ضابط: نوع صندوق مجهول يخرق قيد check فعلاً');
  const fromLedger = await m.explained(m.classifyPostgrest({ code: box?.code, message: box?.message }, 400, 'table', true));
  t.same([fromLedger.code, fromLedger.hint], ['check_violation', m.LEDGER_CONSTRAINT_HINTS.cash_accounts_kind_check()], 'رفض قيد صندوق يوصل بجملته من قاموس الحسابات');

  // طريق الشاشة: core.ts ويّا ملف وحدة الشاشة بس (مثل حزمتها بالبناء). ملف الوحدة يسجّل قاموسه، وبلاه (core وحده) الجملة العامة.
  const pageHint = async (pageModule, failure) => {
    const page = await bundle(`export { classifyPostgrest, explained } from './src/lib/repo/core.ts';${pageModule ? ` import './src/lib/repo/${pageModule}';` : ''}`);
    return (await page.explained(page.classifyPostgrest({ code: failure?.code, message: failure?.message }, 400, 'table', true))).hint;
  };
  t.same(
    {
      inventory: await pageHint('inventory.ts', density),
      parties: await pageHint('parties.ts', box),
      cash: await pageHint('cash.ts', box),
    },
    { inventory: m.STORES_CONSTRAINT_HINTS.items_density_unit_check(), parties: m.LEDGER_CONSTRAINT_HINTS.cash_accounts_kind_check(), cash: m.LEDGER_CONSTRAINT_HINTS.cash_accounts_kind_check() },
    'شاشة المخازن (inventory.ts) والحسابات (parties.ts) والصناديق (cash.ts): كل ملف وحدة لحاله يوصّل جملة قاموسه',
  );
  const bare = { density: await pageHint(null, density), box: await pageHint(null, box) };
  t.ok(bare.density.includes('«items_density_unit_check»') && bare.box.includes('«cash_accounts_kind_check»'), 'ضابط: core وحده (بلا ملف الوحدة) ياخذ الجملة العامة باسم القيد، فالتسجيل من ملف الوحدة هو اللي يوصّل الجملة');
}
