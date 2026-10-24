// bundle-guard (بعد vite build بس): حزمة الإقلاع (المدخل وتوابعه الثابتة وCSS) بسقف مقيس على dist.
// استيراد واحد ضال يجرّ عشرات الكيلوبايت لكل مستخدم. البناء بلا مفاتيح السحابة أصغر من بناء Vercel،
// فالحدّ المحلّي ينقص احتياط المفاتيح حتى اللي يعبر هنا يعبر هناك.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { budgetSelfTest, ceilingFor, measuredCeiling, readBudgets, saveBudgets } from './budgets.mjs';
import { ROOT } from './lib.mjs';

export const name = 'bundle-guard';

const DIST = path.join(ROOT, 'dist');

/** ملفات الإقلاع من manifest بناء Vite: المدخل وكل استيراد ثابت ويّا CSS، بلا الكسول. */
export function bootFiles(manifest) {
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
  if (!manifest['index.html']?.isEntry) throw new Error('no_entry');
  visit('index.html');
  return [...files];
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
  return null;
}

/**
 * الحكم على حزمة الإقلاع بسقف هالتشغيل: القديم، إلا إذا --measure انقبل (نزل، أو صعد بـ--raise).
 * next = ملف السقوف الجديد للحفظ أو null.
 */
export function judgeBoot(gzip, budgets, { keysPresent, measure = false, raise = null, note = '' }) {
  const allowance = keysPresent ? 0 : budgets.cloud_keys_allowance_bytes;
  const { ceiling, next, refused } = measuredCeiling(budgets, 'boot_gzip_bytes', ceilingFor(gzip) + allowance, note, { measure, raise });
  const problems = refused ? [refused] : [];
  if (ceiling === null) {
    problems.push('سقف حزمة الإقلاع ما انقاس بعد: node scripts/guards/run.mjs --dist --measure');
  } else if (gzip > ceiling - allowance) {
    problems.push(`حزمة الإقلاع ${gzip} بايت gzip فوك الحدّ ${ceiling - allowance} (السقف ${ceiling}) — شيل الاستيراد الثقيل أو خلّه كسول`);
  }
  return { problems, next, ceiling, allowance };
}

export function run({ measure: writeCeiling = false, raise = null } = {}) {
  const manifestPath = path.join(DIST, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { scanned: 0, problems: ['ماكو dist/.vite/manifest.json — شغّل vite build أوّل'], summary: '' };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const files = bootFiles(manifest);
  const size = measure(files, (file) => readFileSync(path.join(DIST, file)));
  const keysPresent = Boolean(process.env.VITE_SUPABASE_URL);
  const note = `قياس ${new Date().toISOString()} بلا مفاتيح=${!keysPresent}: ${size.gzip} gzip`;
  const verdict = judgeBoot(size.gzip, readBudgets(), { keysPresent, measure: writeCeiling, raise, note });
  if (verdict.next) saveBudgets(verdict.next);
  return {
    scanned: files.length,
    problems: verdict.problems,
    summary: `حزمة الإقلاع ${files.length} ملف: ${size.raw} بايت، ${size.gzip} gzip؛ السقف ${verdict.ceiling}${keysPresent ? '' : ` ناقص احتياط المفاتيح ${verdict.allowance}`}`,
  };
}
