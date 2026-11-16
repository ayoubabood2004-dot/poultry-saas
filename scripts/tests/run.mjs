// يشغّل كل scripts/tests/*.test.mjs. الإطار يثبت أوّل إنه يقدر يفشل، وكل ملف لازم يفحص شي:
// «فحص على صفر قيم ليس نجاحاً».
// كلّ ملف فحص بعملية node وحده (0028): وحدات ESM المحزومة (عناوين data: بحزمة المصدر الحقيقي) لا تُحرَّر أبداً، فالعملية الواحدة كانت تكبر بكلّ
// ملف حتى تجاوزت حدّ الذاكرة الافتراضيّ (2,096 م.ب) بفحوص 0028؛ وعملية لكلّ ملف لا تراكم شيئاً ولا تُرجع كائناً عامّاً مزيّفاً من ملف إلى الذي
// بعده. والنتيجة سطر أخير معلَّم من العملية الابنة، والطباعة كما كانت.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from './harness.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const ONE = '--one';
const MARK = '@@test-result ';

/** العملية الابنة: ملف واحد، والنتيجة سطر معلَّم أخير. */
async function runOne(file) {
  const { t, result } = createHarness();
  let crashed = null;
  try {
    const module = await import(pathToFileURL(path.join(DIR, file)).href);
    await module.default(t);
  } catch (error) {
    crashed = String(error?.stack ?? error);
  }
  const { passed, failures } = result();
  // الحزمة تُستورد من عنوان data: بنصّها كلّه، فكلّ سطر في أثر الخطأ يحمل ميغابايتات: يُختصر قبل أن يُرسل.
  const short = (value) => (value === null ? null : value.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, 'data:…'));
  process.stdout.write(`\n${MARK}${JSON.stringify({ passed, failures: failures.map(short), crashed: short(crashed) })}\n`);
}

if (process.argv[2] === ONE) {
  await runOne(process.argv[3]);
  // مؤقّتات معلّقة في فحص (مستمعون، setTimeout) لا تُبقي العملية حيّة بعد النتيجة.
  process.exit(0);
}

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
  const child = spawnSync(process.execPath, [...process.execArgv, SELF, ONE, file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const lines = (child.stdout ?? '').split('\n');
  const at = lines.findLastIndex((line) => line.startsWith(MARK));
  // ما طبعه الفحص نفسه (غير سطر النتيجة) يظهر كما كان في العملية الواحدة.
  const printed = lines.filter((line, index) => index !== at && line !== '').join('\n');
  if (printed) console.log(printed);
  if (child.stderr) process.stderr.write(child.stderr);
  let outcome;
  try {
    outcome = at >= 0 ? JSON.parse(lines[at].slice(MARK.length)) : null;
  } catch {
    outcome = null;
  }
  if (!outcome) outcome = { passed: 0, failures: [], crashed: `انتهت العملية بلا نتيجة (الرمز ${child.status ?? child.signal}): ${(child.stderr ?? '').trim().split('\n').slice(-3).join(' | ')}` };
  const { passed, failures, crashed } = outcome;
  const label = file.replace('.test.mjs', '');
  if (crashed || failures.length > 0 || passed === 0) {
    failedFiles += 1;
    console.log(`✗ ${label}: ${passed} ناجح، ${failures.length} فاشل${passed === 0 && !crashed && failures.length === 0 ? ' — صفر فحوص' : ''}`);
    for (const failure of failures) console.log(`    ${failure}`);
    if (crashed) console.log(`    رمى: ${crashed}`);
  } else {
    console.log(`✓ ${label}: ${passed} فحص`);
  }
}

if (failedFiles > 0) {
  console.log(`\n${failedFiles} ملف فحص فشل.`);
  process.exit(1);
}
