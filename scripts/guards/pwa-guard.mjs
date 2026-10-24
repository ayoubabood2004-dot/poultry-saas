// pwa-guard (بـnpm run build بعد vite build بس): يقرا dist، وبلا dist يفشل بصوت.
// استثناء مسمّى من «lint وbuild كليهما» لأن lint ما عنده dist. المرحلة 0: الأيقونات 192 و512 وmaskable
// وapple-touch-icon ملفات بقياسها، الـmanifest، navigateFallbackDenylist يغطّي /api/، clientsClaim صريح،
// التحديث بإذن الشاشة (skipWaiting بس من رسالة)، وسقف التثبيت المسبق.
// المرحلة 3 تضيف: كل استيرادات شاشة الجولة وملفّاتها بقائمة التثبيت المسبق.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { budgetSelfTest, ceilingFor, measuredCeiling, readBudgets, saveBudgets } from './budgets.mjs';
import { ROOT } from './lib.mjs';

export const name = 'pwa-guard';

const DIST = path.join(ROOT, 'dist');
const ICONS = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['maskable-512x512.png', 512],
  ['apple-touch-icon-180x180.png', 180],
];
const PRECACHED_EXTENSIONS = ['.js', '.css', '.html', '.woff2', '.wasm'];
/** ملفات ما تنحسب بالتثبيت المسبق: الخدمة العاملة نفسها ومكتبتها. والثقيلة المستثناة تنضاف هنا بالاسم. */
const NOT_PRECACHED = [/^sw\.js$/, /^workbox-[\w-]+\.js$/];

export function pngSize(buffer) {
  if (!buffer || buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** read(rel) يرجّع Buffer أو null؛ files = كل ملفات dist بمسارات نسبية مع أحجامها. */
export function checkDist(read, files, precacheCeiling) {
  const problems = [];
  let checked = 0;

  const manifestBuffer = read('manifest.webmanifest');
  if (!manifestBuffer) problems.push('ماكو manifest.webmanifest');
  else {
    checked += 1;
    const manifest = JSON.parse(manifestBuffer.toString('utf8'));
    const expect = { display: 'standalone', start_url: '/', scope: '/', lang: 'ar', dir: 'rtl' };
    for (const [key, value] of Object.entries(expect)) {
      if (manifest[key] !== value) problems.push(`manifest: ${key} = ${JSON.stringify(manifest[key])} والمطلوب ${JSON.stringify(value)}`);
    }
    const icons = manifest.icons ?? [];
    const has = (sizes, purpose) => icons.some((icon) => icon.sizes === sizes && (icon.purpose ?? 'any').split(' ').includes(purpose));
    if (!has('192x192', 'any')) problems.push('manifest: ماكو أيقونة 192 (any)');
    if (!has('512x512', 'any')) problems.push('manifest: ماكو أيقونة 512 (any)');
    if (!has('512x512', 'maskable')) problems.push('manifest: ماكو أيقونة 512 maskable');
  }

  for (const [file, size] of ICONS) {
    checked += 1;
    const dims = pngSize(read(file));
    if (!dims) problems.push(`${file}: مو موجود أو مو PNG`);
    else if (dims.width !== size || dims.height !== size) problems.push(`${file}: قياسه ${dims.width}x${dims.height} والمطلوب ${size}x${size}`);
  }

  const html = read('index.html')?.toString('utf8');
  if (!html) problems.push('ماكو index.html');
  else {
    checked += 1;
    if (!/<html lang="ar" dir="rtl">/.test(html)) problems.push('index.html: لازم <html lang="ar" dir="rtl">');
    if (!/rel="apple-touch-icon"[^>]*apple-touch-icon-180x180\.png/.test(html)) problems.push('index.html: ماكو apple-touch-icon 180');
    if (!/name="theme-color"[^>]*media="\(prefers-color-scheme: light\)"/.test(html)) problems.push('index.html: ماكو theme-color للفاتح');
    if (!/name="theme-color"[^>]*media="\(prefers-color-scheme: dark\)"/.test(html)) problems.push('index.html: ماكو theme-color للداكن');
    if (!/name="apple-mobile-web-app-title"/.test(html)) problems.push('index.html: ماكو apple-mobile-web-app-title');
    if (!/class="boot-splash"/.test(html)) problems.push('index.html: ماكو شاشة الإقلاع');
    if (!/rel="manifest"/.test(html)) problems.push('index.html: الـmanifest ما انربط');
  }

  const sw = read('sw.js')?.toString('utf8');
  let precacheBytes = 0;
  let precached = 0;
  if (!sw) problems.push('ماكو sw.js');
  else {
    checked += 1;
    if (!/clientsClaim/.test(sw)) problems.push('sw.js: clientsClaim مو مفعّل');
    const skips = sw.match(/skipWaiting\(\)/g) ?? [];
    if (!/SKIP_WAITING[^}]*skipWaiting\(\)/.test(sw) || skips.length !== 1) {
      problems.push('sw.js: skipWaiting لازم يصير بس من رسالة SKIP_WAITING (التحديث بإذن الشاشة)');
    }
    if (!/denylist:\[[^\]]*\/\^\\\/api\\\//.test(sw)) problems.push('sw.js: navigateFallbackDenylist ما يغطّي /api/');
    const urls = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]));
    for (const file of files) {
      if (!PRECACHED_EXTENSIONS.some((ext) => file.path.endsWith(ext))) continue;
      if (NOT_PRECACHED.some((pattern) => pattern.test(file.path))) continue;
      if (!urls.has(file.path)) problems.push(`${file.path}: مو بقائمة التثبيت المسبق — يطلع مكسوراً بالفتح البارد بلا نت`);
      else {
        precached += 1;
        precacheBytes += file.size;
      }
    }
    const over = precacheOver(precacheBytes, precacheCeiling);
    if (over) problems.push(over);
  }
  return { problems, checked, precached, precacheBytes };
}

function precacheOver(bytes, ceiling) {
  return ceiling !== null && bytes > ceiling ? `التثبيت المسبق ${bytes} بايت فوك السقف ${ceiling}` : null;
}

/**
 * الحكم على حجم التثبيت المسبق بسقف هالتشغيل: القديم، إلا إذا --measure انقبل (نزل، أو صعد بـ--raise).
 * قبل كان --measure يكتب السقف الأعلى حتى لو نفس التشغيل يكول إنه فوك القديم.
 */
export function judgePrecache(bytes, budgets, { measure = false, raise = null, note = '' } = {}) {
  const { ceiling, next, refused } = measuredCeiling(budgets, 'precache_bytes', ceilingFor(bytes), note, { measure, raise });
  const problems = refused ? [refused] : [];
  const over = precacheOver(bytes, ceiling);
  if (over) problems.push(over);
  if (ceiling === null) problems.push('سقف التثبيت المسبق ما انقاس بعد: node scripts/guards/run.mjs --dist --measure');
  return { problems, next, ceiling };
}

function png(width, height) {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

export function selfTest() {
  const good = {
    'manifest.webmanifest': Buffer.from(
      JSON.stringify({
        display: 'standalone', start_url: '/', scope: '/', lang: 'ar', dir: 'rtl',
        icons: [{ sizes: '192x192' }, { sizes: '512x512', purpose: 'any' }, { sizes: '512x512', purpose: 'maskable' }],
      }),
    ),
    'pwa-192x192.png': png(192, 192),
    'pwa-512x512.png': png(512, 512),
    'maskable-512x512.png': png(512, 512),
    'apple-touch-icon-180x180.png': png(180, 180),
    'index.html': Buffer.from(
      '<html lang="ar" dir="rtl"><link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png"><meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)"><meta name="apple-mobile-web-app-title" content="x"><link rel="manifest" href="/manifest.webmanifest"><div class="boot-splash"></div>',
    ),
    'sw.js': Buffer.from(
      'self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()});e.clientsClaim();e.precacheAndRoute([{url:"index.html",revision:"1"},{url:"assets/a.js",revision:null}]);new e.NavigationRoute(h,{denylist:[/^\\/api\\//]})',
    ),
  };
  const files = [
    { path: 'index.html', size: 100 },
    { path: 'assets/a.js', size: 200 },
    { path: 'sw.js', size: 50 },
  ];
  const read = (store) => (file) => store[file] ?? null;
  const ok = checkDist(read(good), files, 1000);
  if (ok.problems.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${ok.problems.join(' | ')}`;
  const bad = {
    ...good,
    'maskable-512x512.png': png(500, 500),
    'sw.js': Buffer.from('self.skipWaiting();e.precacheAndRoute([{url:"index.html",revision:"1"}]);'),
  };
  const broken = checkDist(read(bad), files, 1000);
  // قياس maskable غلط، بلا clientsClaim، skipWaiting بلا رسالة، بلا denylist، وassets/a.js برّا القائمة.
  if (broken.problems.length !== 5) return `توقّعت 5 مخالفات بالمدخلات المصنوعة وطلع ${broken.problems.length}: ${broken.problems.join(' | ')}`;
  const budgetError = budgetSelfTest();
  if (budgetError) return budgetError;
  const budgets = { precache_bytes: 492600, history: [] };
  const stray = judgePrecache(600000, budgets, { measure: true });
  if (stray.next !== null || stray.problems.length !== 2) return `--measure رفع سقف التثبيت المسبق بلا --raise: ${stray.problems.join(' | ')}`;
  const raised = judgePrecache(600000, budgets, { measure: true, raise: 'خطوط جديدة' });
  if (raised.problems.length !== 0 || raised.next?.precache_bytes !== ceilingFor(600000)) return 'الصعود بـ--raise ما انكتب';
  return null;
}

function distFiles() {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.vite') visit(full);
      } else out.push({ path: path.relative(DIST, full).split(path.sep).join('/'), size: statSync(full).size });
    }
  };
  visit(DIST);
  return out;
}

export function run({ measure = false, raise = null } = {}) {
  if (!existsSync(DIST)) return { scanned: 0, problems: ['ماكو dist — pwa-guard يشتغل بعد vite build بس'], summary: '' };
  const files = distFiles();
  const read = (file) => {
    const full = path.join(DIST, file);
    return existsSync(full) ? readFileSync(full) : null;
  };
  // بلا سقف أوّل: الحجم ينقاس، والسقف يتقرّر بعده (القديم إلا إذا --measure انقبل).
  const result = checkDist(read, files, null);
  const note = `قياس ${new Date().toISOString()}: ${result.precacheBytes} بايت، ${result.precached} ملف`;
  const verdict = judgePrecache(result.precacheBytes, readBudgets(), { measure, raise, note });
  if (verdict.next) saveBudgets(verdict.next);
  return {
    scanned: files.length,
    problems: [...result.problems, ...verdict.problems],
    summary: `فحصت ${result.checked} بنداً بـdist؛ التثبيت المسبق ${result.precached} ملف = ${result.precacheBytes} بايت (السقف ${verdict.ceiling})`,
  };
}
