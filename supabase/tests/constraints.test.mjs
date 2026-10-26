// قاموس القيود (الخطّة WP0، GT-20، FOUNDATION ٨٠٨): كل قيد check بكتالوج القاعدة (public وprivate) إله جملة فصيحة بـ
// src/lib/repo/constraints.ts بمفتاح constraint.<اسم القيد>، وماكو جملة لقيد مو موجود. والطريق كامل: رفض حقيقي من القاعدة
// ← رسالته ← classifyPostgrest ← نفس الجملة. الملف الحقيقي يتحزم بـesbuild (افحص المصدر لا نسخة منه).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from '../../scripts/tests/load-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARABIC = /[\u{600}-\u{6FF}]/u;

/** الناقص والزايد بين الكتالوج والقاموس. */
export function dictionaryGaps(catalog, dictionary) {
  return {
    missing: catalog.filter((name) => !dictionary.includes(name)),
    stale: dictionary.filter((name) => !catalog.includes(name)),
  };
}

export default async function (t, db) {
  const m = await loadSrc('src/lib/repo/constraints.ts');
  const core = await loadSrc('src/lib/repo/core.ts');
  const source = readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'constraints.ts'), 'utf8');

  const catalog = (await db.admin("select conname from pg_constraint where contype = 'c' and connamespace in ('public'::regnamespace, 'private'::regnamespace) order by 1")).rows.map((r) => r.conname);
  t.ok(catalog.length >= 10, `قيود check بالكتالوج (${catalog.length})`);
  const dictionary = Object.keys(m.CONSTRAINT_HINTS).sort();
  t.same(dictionaryGaps(catalog, dictionary), { missing: [], stale: [] }, `كل قيد check إله جملته، وماكو جملة بلا قيد (${dictionary.length})`);
  t.same(dictionaryGaps(['x_qty_check', ...catalog], dictionary).missing, ['x_qty_check'], 'ضابط: قيد جديد بلا جملة ينمسك');

  // المفتاح نفسه constraint.<اسم القيد> (مو مفتاح ثاني بنفس الجملة)، والجملة عربية ومو الجملة العامة.
  const fallback = m.constraintHint('no_such_check');
  const badKeys = dictionary.filter((name) => !source.includes(`t('constraint.${name}', `));
  t.same(badKeys, [], 'كل جملة بمفتاح constraint.<اسم القيد> بالضبط');
  const badText = dictionary.filter((name) => {
    const text = m.constraintHint(name);
    return !ARABIC.test(text) || text === fallback || text.includes(name);
  });
  t.same(badText, [], 'كل جملة عربية وخاصّة بقيدها، مو الجملة العامة');
  t.ok(fallback.includes('«no_such_check»'), 'ضابط: قيد مجهول ياخذ الجملة العامة وتسمّيه');

  // من القاعدة نفسها: إدخال يخرق orgs_name_check ← 23514 برسالته ← classifyPostgrest ← جملة القيد.
  let violation = null;
  try {
    await db.asOwner((q) => q("insert into public.orgs (name) values ('   ')"));
  } catch (error) {
    violation = { code: error.code, message: error.message };
  }
  t.eq(violation?.code, '23514', 'ضابط: اسم منشأة فارغ يخرق قيد check فعلاً');
  const classified = core.classifyPostgrest({ code: violation?.code, message: violation?.message }, 400, 'rpc', true);
  t.same([classified.code, classified.hint], ['check_violation', m.CONSTRAINT_HINTS.orgs_name_check()], 'رفض القاعدة الحقيقي يوصل الشاشة بجملة قيده');
}
