// bundle-guard (بعد vite build بس): حزمة الإقلاع (المدخل وتوابعه الثابتة وCSS) بسقف مقيس على dist.
// استيراد واحد ضال يجرّ عشرات الكيلوبايت لكل مستخدم. البناء بلا مفاتيح السحابة أصغر من بناء Vercel،
// فالحدّ المحلّي ينقص احتياط المفاتيح حتى اللي يعبر هنا يعبر هناك. «بلا مفاتيح» يعني البناء نفسه بلاها: المفاتيح
// تجي من بيئة العملية (Vercel، CI) أو من ملفات .env* اللي يقراها Vite (‏.env.local محلّياً)، فالفحص يقراها مثله (keys.mjs).
// وسقف ثاني لمسار الجلسة الحرج: بمفاتيح، الشاشة الأولى (الدخول أو المنشأة) ما ترسم قبل ما وحدة الجلسة ووحدات
// lib/repo وsupabase-js تنحمّل فوك الإقلاع، فاستيراد ثقيل بيها يتأخّر على كل مستخدم مثل حزمة الإقلاع.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { budgetSelfTest, ceilingFor, measuredCeiling, readBudgets, saveBudgets } from './budgets.mjs';
import { buildKeys, keysPresent as hasKeys } from './keys.mjs';
import { ROOT } from './lib.mjs';

export const name = 'bundle-guard';

const DIST = path.join(ROOT, 'dist');

/** وحدات مسار الجلسة الحرج بمفاتيح manifest (كسولة، بس كل مستخدم يحمّلها قبل أوّل شاشة). */
export const SESSION_ENTRIES = [/^src\/lib\/repo\/index\.ts$/, /^src\/lib\/sessionFlow\.ts$/, /(^|\/)@supabase\/supabase-js\//];

/**
 * وحدات لازم تبقى برّا مسار الجلسة الحرج، كسولة بـimport() بحزمة لحالها (المرحلة 1 WP3): قاموس جمل القيود يكبر بكل حزمة
 * (جملة لكل قيد check)، والدخول والتسجيل وجمل أخطائهما ما يحتاجها اللي داخل أصلاً؛ والمسار كان على بعد 212 بايت من سقفه.
 * استيراد ثابت واحد يرجّع أيّاً منهما لحزمة كل مستخدم بصمت.
 */
export const LAZY_ONLY = [/^src\/lib\/repo\/constraints\.ts$/, /^src\/lib\/repo\/signin\.ts$/];

/** مخالفات LAZY_ONLY بـmanifest البناء: الوحدة ما إلها حزمة لحالها (رجعت ثابتة بحزمة ثانية)، أو حزمتها بمسار الجلسة. */
export function lazyOnlyProblems(manifest) {
  const session = new Set(sessionPathFiles(manifest));
  const problems = [];
  for (const pattern of LAZY_ONLY) {
    const key = Object.keys(manifest).find((candidate) => pattern.test(candidate));
    if (!key || !manifest[key].file) problems.push(`${pattern.source}: ما إلها حزمة لحالها بالبناء — رجعت ثابتة بحزمة ثانية (استيراد ثابت؟)، فممكن تكون بمسار الجلسة`);
    else if (session.has(manifest[key].file)) problems.push(`${key} (${manifest[key].file}) بمسار الجلسة الحرج — خلّها كسولة بـimport() من شاشتها أو من نقطة الخطأ`);
  }
  return problems;
}

/** الملفات من الجذور وكل استيراد ثابت منها ويّا CSS، بلا الكسول. */
function closure(manifest, roots) {
  const files = new Set();
  const seen = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  for (const root of roots) visit(root);
  return [...files];
}

/** ملفات الإقلاع من manifest بناء Vite: المدخل وكل استيراد ثابت ويّا CSS، بلا الكسول. */
export function bootFiles(manifest) {
  if (!manifest['index.html']?.isEntry) throw new Error('no_entry');
  return closure(manifest, ['index.html']);
}

/** الإقلاع ووحدات الجلسة الكسولة بتوابعها الثابتة. وحدة ما انلقت = البناء تغيّر، والحارس يفشل بصوت. */
export function sessionPathFiles(manifest) {
  if (!manifest['index.html']?.isEntry) throw new Error('no_entry');
  const keys = Object.keys(manifest);
  const roots = ['index.html'];
  for (const pattern of SESSION_ENTRIES) {
    const key = keys.find((candidate) => pattern.test(candidate));
    if (!key) throw new Error(`no_session_entry:${pattern.source}`);
    roots.push(key);
  }
  return closure(manifest, roots);
}

export function measure(files, read) {
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const buffer = read(file);
    raw += buffer.length;
    gzip += gzipSync(buffer, { level: 9 }).length;
  }
  return { raw, gzip };
}

export function selfTest() {
  const files = bootFiles({
    'index.html': { file: 'a.js', isEntry: true, imports: ['_b.js'], css: ['a.css'], dynamicImports: ['lazy.tsx'] },
    '_b.js': { file: 'b.js', imports: ['index.html'] },
    'lazy.tsx': { file: 'c.js', isDynamicEntry: true },
  });
  if (files.sort().join() !== 'a.css,a.js,b.js') return `حسبت ملفات الإقلاع غلط: ${files.join()}`;
  const sessionManifest = {
    'index.html': { file: 'a.js', isEntry: true, imports: ['_b.js'] },
    '_b.js': { file: 'b.js' },
    'src/lib/repo/index.ts': { file: 'repo.js', isDynamicEntry: true, imports: ['_client.js', 'index.html'] },
    '_client.js': { file: 'client.js', dynamicImports: ['node_modules/@supabase/supabase-js/dist/index.mjs'] },
    'src/lib/sessionFlow.ts': { file: 'flow.js', isDynamicEntry: true },
    'node_modules/@supabase/supabase-js/dist/index.mjs': { file: 'supa.js', isDynamicEntry: true },
    'src/pages/mill/MillPage.tsx': { file: 'mill.js', isDynamicEntry: true },
  };
  const session = sessionPathFiles(sessionManifest).sort().join();
  if (session !== 'a.js,b.js,client.js,flow.js,repo.js,supa.js') return `حسبت مسار الجلسة غلط: ${session}`;
  const missing = { ...sessionManifest };
  delete missing['src/lib/sessionFlow.ts'];
  let threw = false;
  try {
    sessionPathFiles(missing);
  } catch {
    threw = true;
  }
  if (!threw) return 'وحدة جلسة ناقصة بالبناء عبرت بصمت';
  // قاموس القيود والدخول كسولان: حزمتهما لحالها تعبر، وبلا حزمة لحالها أو بمسار الجلسة (استيراد ثابت من index) تنمسك كل وحدة مرّة.
  const lazy = { ...sessionManifest, 'src/lib/repo/constraints.ts': { file: 'hints.js', isDynamicEntry: true }, 'src/lib/repo/signin.ts': { file: 'signin.js', isDynamicEntry: true } };
  const staticFrom = (key) => ({ ...lazy, 'src/lib/repo/index.ts': { ...lazy['src/lib/repo/index.ts'], imports: [...lazy['src/lib/repo/index.ts'].imports, key] } });
  const lazyCounts = [lazy, sessionManifest, staticFrom('src/lib/repo/constraints.ts'), staticFrom('src/lib/repo/signin.ts')].map((manifest) => lazyOnlyProblems(manifest).length).join();
  if (lazyCounts !== '0,2,1,1') return `الوحدات الكسولة: توقّعت 0,2,1,1 مخالفة (كسولتان، بلا حزم، القاموس بمسار الجلسة، الدخول بمسار الجلسة) وطلع ${lazyCounts}`;
  // run() نفسه يطبّق LAZY_ONLY على manifest البناء، مو الفحص الذاتي بس (اختبار الطفرات WP3: سطر run المشال كان يعبر): القاموس
  // المستورد ثابتاً بمسار الجلسة ينمسك بتشغيل الحارس، والكسول السليم يعبر.
  const ranLazy = (manifest) => run({ source: { manifest, read: () => Buffer.from('x') } }).problems.filter((problem) => problem.includes('src/lib/repo/')).length;
  if (ranLazy(staticFrom('src/lib/repo/constraints.ts')) !== 1 || ranLazy(lazy) !== 0) return 'run() ما طبّق الوحدات الكسولة على manifest البناء';
  const size = measure(['x'], () => Buffer.from('a'.repeat(1000)));
  if (size.raw !== 1000 || size.gzip <= 0 || size.gzip >= 1000) return 'القياس بالضغط ما اشتغل';
  const budgetError = budgetSelfTest();
  if (budgetError) return budgetError;
  // استيراد ضال (90000 فوك سقف 77424): --measure بلا سبب يفشل ويّا الأمر، وما يكتب سقفاً جديداً.
  const budgets = { boot_gzip_bytes: 77424, cloud_keys_allowance_bytes: 1024, history: [] };
  const stray = judgeBoot(90000, budgets, { keysPresent: false, measure: true });
  if (stray.next !== null || stray.problems.length !== 2) return `--measure رفع سقف الإقلاع بلا --raise: ${stray.problems.join(' | ')}`;
  const raised = judgeBoot(90000, budgets, { keysPresent: false, measure: true, raise: 'مكتبة الرسوم' });
  if (raised.problems.length !== 0 || raised.next?.boot_gzip_bytes !== ceilingFor(90000) + 1024) return 'الصعود بـ--raise ما انكتب';
  if (judgeBoot(70000, budgets, { keysPresent: false, measure: true }).next?.boot_gzip_bytes !== ceilingFor(70000) + 1024) return 'نزول السقف ما انكتب';
  // البناء بمفاتيح ينحكم بالسقف كلّه، وبلاها بالسقف ناقص الاحتياط: نفس الحزمة تعبر هناك وتفشل هنا.
  const near = { boot_gzip_bytes: 80000, cloud_keys_allowance_bytes: 1024, history: [] };
  if (judgeBoot(79500, near, { keysPresent: true }).problems.length !== 0) return 'بمفاتيح: الاحتياط انطرح من السقف';
  if (judgeBoot(79500, near, { keysPresent: false }).problems.length !== 1) return 'بلا مفاتيح: الاحتياط ما انطرح';
  return null;
}

const CEILINGS = {
  boot_gzip_bytes: { label: 'حزمة الإقلاع', fix: 'شيل الاستيراد الثقيل أو خلّه كسول' },
  session_path_gzip_bytes: { label: 'مسار الجلسة الحرج', fix: 'استيراد ثقيل بـlib/repo أو sessionFlow يتأخّر على كل مستخدم: خلّه كسولاً بشاشته' },
};

/**
 * الحكم على سقف (الإقلاع أو مسار الجلسة) بهالتشغيل: القديم، إلا إذا --measure انقبل (نزل، أو صعد بـ--raise، أو أوّل
 * قياس). next = ملف السقوف الجديد للحفظ أو null.
 */
export function judgeCeiling(key, gzip, budgets, { keysPresent, measure = false, raise = null, note = '' }) {
  const { label, fix } = CEILINGS[key];
  const allowance = keysPresent ? 0 : budgets.cloud_keys_allowance_bytes;
  const { ceiling, next, refused } = measuredCeiling(budgets, key, ceilingFor(gzip) + allowance, note, { measure, raise });
  const problems = refused ? [refused] : [];
  if (ceiling === null) {
    problems.push(`سقف ${label} ما انقاس بعد: node scripts/guards/run.mjs --dist --measure`);
  } else if (gzip > ceiling - allowance) {
    problems.push(`${label} ${gzip} بايت gzip فوك الحدّ ${ceiling - allowance} (السقف ${ceiling}) — ${fix}`);
  }
  return { problems, next, ceiling, allowance };
}

export function judgeBoot(gzip, budgets, options) {
  return judgeCeiling('boot_gzip_bytes', gzip, budgets, options);
}

/** source: manifest وقارئ ملفات بدل dist (الفحص الذاتي يشغّل run نفسه على بناء مصنوع). */
export function run({ measure: writeCeiling = false, raise = null, source = null } = {}) {
  const manifestPath = path.join(DIST, '.vite', 'manifest.json');
  if (!source && !existsSync(manifestPath)) {
    return { scanned: 0, problems: ['ماكو dist/.vite/manifest.json — شغّل vite build أوّل'], summary: '' };
  }
  const manifest = source?.manifest ?? JSON.parse(readFileSync(manifestPath, 'utf8'));
  const read = source?.read ?? ((file) => readFileSync(path.join(DIST, file)));
  const keysPresent = hasKeys(buildKeys());
  const stamp = new Date().toISOString();
  let budgets = readBudgets();
  let changed = false;
  const problems = [];
  const parts = [];
  let scanned = 0;
  for (const [key, files] of [
    ['boot_gzip_bytes', bootFiles(manifest)],
    ['session_path_gzip_bytes', sessionPathFiles(manifest)],
  ]) {
    const size = measure(files, read);
    scanned += files.length;
    const note = `قياس ${stamp} بلا مفاتيح=${!keysPresent}: ${size.gzip} gzip`;
    const verdict = judgeCeiling(key, size.gzip, budgets, { keysPresent, measure: writeCeiling, raise, note });
    if (verdict.next) {
      budgets = verdict.next;
      changed = true;
    }
    problems.push(...verdict.problems);
    parts.push(`${CEILINGS[key].label} ${files.length} ملف: ${size.raw} بايت، ${size.gzip} gzip؛ السقف ${verdict.ceiling}${keysPresent ? '' : ` ناقص احتياط المفاتيح ${verdict.allowance}`}`);
  }
  if (changed) saveBudgets(budgets);
  problems.push(...lazyOnlyProblems(manifest));
  parts.push(`${LAZY_ONLY.length} وحدة كسولة برّا مسار الجلسة (قاموس القيود والدخول)`);
  return { scanned, problems, summary: parts.join('؛ ') };
}
