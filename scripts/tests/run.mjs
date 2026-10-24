// يشغّل كل scripts/tests/*.test.mjs. الإطار يثبت أوّل إنه يقدر يفشل، وكل ملف لازم يفحص شي:
// «فحص على صفر قيم ليس نجاحاً».
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from './harness.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const probe = createHarness();
probe.t.eq(1n, 2n, 'probe');
probe.t.throws(() => {}, 'probe');
if (probe.result().failures.length !== 2) {
  console.log('✗ إطار الفحص ما يكدر يفشل — نتائجه ما تنصدّق');
  process.exit(1);
}

// node scripts/tests/run.mjs money format ← يشغّل هذول بس (للتجربة السريعة؛ lint وbuild يشغّلون الكل).
const only = process.argv.slice(2);
let failedFiles = 0;
for (const file of readdirSync(DIR)
  .filter((name) => name.endsWith('.test.mjs'))
  .filter((name) => only.length === 0 || only.includes(name.replace('.test.mjs', '')))
  .sort()) {
  const { t, result } = createHarness();
  let crashed = null;
  try {
    const module = await import(pathToFileURL(path.join(DIR, file)).href);
    await module.default(t);
  } catch (error) {
    crashed = error;
  }
  const { passed, failures } = result();
  const label = file.replace('.test.mjs', '');
  if (crashed || failures.length > 0 || passed === 0) {
    failedFiles += 1;
    console.log(`✗ ${label}: ${passed} ناجح، ${failures.length} فاشل${passed === 0 && !crashed && failures.length === 0 ? ' — صفر فحوص' : ''}`);
    for (const failure of failures) console.log(`    ${failure}`);
    if (crashed) console.log(`    رمى: ${crashed.stack ?? crashed}`);
  } else {
    console.log(`✓ ${label}: ${passed} فحص`);
  }
}

if (failedFiles > 0) {
  console.log(`\n${failedFiles} ملف فحص فشل.`);
  process.exit(1);
}
