// الحرّاس مربوطين بـ&& بـnpm run lint وnpm run build، وVercel يبني بـnpm run build، فأي حارس يفشل يوقّف النشر.
// كل حارس يفحص نفسه على مدخلات مصنوعة قبل ما يمسح المستودع، ويطبع شنو فحص؛ والمسح الفارغ فشل أداة مو نظافة.
// --dist: حرّاس البناء (env-guard وpwa-guard وbundle-guard) بعد vite build. --measure: يكتب السقوف المقيسة بسجلّها؛
// تنزل بحرّية، والصعود يرفضه إلا ويّا --raise="السبب" (السبب ينكتب بسطر السجلّ).
import { budgetSelfTest } from './budgets.mjs';
import * as bundleGuard from './bundle-guard.mjs';
import * as dateGuard from './date-guard.mjs';
import * as envGuard from './env-guard.mjs';
import * as fetchGuard from './fetch-guard.mjs';
import * as i18nGuard from './i18n-guard.mjs';
import * as migrationGuard from './migration-guard.mjs';
import * as moneyGuard from './money-guard.mjs';
import * as numbersGuard from './numbers-guard.mjs';
import * as pwaGuard from './pwa-guard.mjs';
import * as reportsGuard from './reports-guard.mjs';
import * as uiGuard from './ui-guard.mjs';
import * as writeGuard from './write-guard.mjs';

const SOURCE_GUARDS = [i18nGuard, moneyGuard, numbersGuard, fetchGuard, writeGuard, dateGuard, uiGuard, reportsGuard, migrationGuard];
const DIST_GUARDS = [envGuard, pwaGuard, bundleGuard];

const dist = process.argv.includes('--dist');
const measure = process.argv.includes('--measure');
const raiseArg = process.argv.find((arg) => arg.startsWith('--raise'));
const raise = raiseArg?.startsWith('--raise=') ? raiseArg.slice('--raise='.length).trim() : null;
if (raiseArg && (!raise || !measure || !dist)) {
  // سبب فارغ أو --raise بلا قياس = صعود بلا قرار مكتوب.
  console.log('✗ --raise="السبب" يجي ويّا --dist --measure، والسبب ما يكون فارغ');
  process.exit(1);
}
let failed = 0;

// قاعدة السقوف تنفحص بكل تشغيل (مو بس --dist) حتى ما تتعطّل بصمت بين قياس وقياس.
const budgetError = budgetSelfTest();
if (budgetError) {
  failed += 1;
  console.log(`✗ budgets: الفحص الذاتي فشل — ${budgetError}`);
}

for (const guard of dist ? DIST_GUARDS : SOURCE_GUARDS) {
  const selfError = await guard.selfTest();
  if (selfError) {
    failed += 1;
    console.log(`✗ ${guard.name}: الفحص الذاتي فشل — ${selfError}`);
    continue;
  }
  const result = await guard.run({ measure, raise });
  if (result.scanned === 0) {
    failed += 1;
    console.log(`✗ ${guard.name}: مسح فارغ — فشل أداة مو نظافة${result.problems.length ? ` (${result.problems.join('؛ ')})` : ''}`);
    continue;
  }
  if (result.problems.length > 0) {
    failed += 1;
    console.log(`✗ ${guard.name}: ${result.summary}`);
    for (const problem of result.problems) console.log(`    ${problem}`);
  } else {
    console.log(`✓ ${guard.name}: ${result.summary}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} حارس فشل.`);
  process.exit(1);
}
