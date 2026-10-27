// pwa-guard (بـnpm run build بعد vite build بس): يقرا dist، وبلا dist يفشل بصوت.
// استثناء مسمّى من «lint وbuild كليهما» لأن lint ما عنده dist. المرحلة 0: الأيقونات 192 و512 وmaskable
// وapple-touch-icon ملفات بقياسها، الـmanifest، navigateFallbackDenylist يغطّي /api/، clientsClaim صريح،
// التحديث بإذن الشاشة (skipWaiting بس من رسالة)، وسقف التثبيت المسبق.
// المرحلة 3 تضيف: كل استيرادات شاشة الجولة وملفّاتها بقائمة التثبيت المسبق.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { budgetSelfTest, ceilingFor, measuredCeiling, readBudgets, saveBudgets } from './budgets.mjs';
import { buildKeys, keysPresent as hasKeys } from './keys.mjs';
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
/** الخدمة العاملة نفسها ومكتبتها: ما تنحفظ بالتثبيت المسبق أصلاً (vite-plugin-pwa ما يحطّها بالقائمة). */
const SERVICE_WORKER = [/^sw\.js$/, /^workbox-[\w-]+\.js$/];

/**
 * مستثناة بالاسم من التثبيت المسبق (FOUNDATION ٢١٦: الثقيلة بالاسم بس)، بنفس globIgnores بـvite.config.ts. الاستثناء مثل
 * رفع السقف، فكل اسم لازم بسطر بـDECISIONS «السقوف المقيسة» (exclusionRecordProblems)، وsw.js ما يحفظها (checkDist)، وحزمة
 * محفوظة ما تستوردها (staticImportProblems). كلمة المالك 2026-10-27: شاشات المكتب اللي تحتاج الخادم برّا التثبيت المسبق
 * بالاسم، والجولة وكل شي تحتاجه جوّاه (DECISIONS «السقوف المقيسة»). أوّلها stores-admin (المواد وإعدادات المنشأة).
 */
export const EXCLUDED_BY_NAME = [
  { name: 'ItemsPage', pattern: /^assets\/ItemsPage-[\w-]+\.js$/ },
  { name: 'OrgSettingsPage', pattern: /^assets\/OrgSettingsPage-[\w-]+\.js$/ },
  { name: 'stores-admin', pattern: /^assets\/stores-admin-[\w-]+\.js$/ },
  // المرحلة 1 WP3: قسم الحسابات بمسار واحد (الجهات والكشف وأرصدة الافتتاح والصناديق وكشفها)، وحزمته المشتركة إن انقسمت.
  { name: 'AccountsRoutes', pattern: /^assets\/AccountsRoutes-[\w-]+\.(js|css)$/ },
  { name: 'accounts-office', pattern: /^assets\/accounts-office-[\w-]+\.(js|css)$/ },
];

/** ملفات ما تنحسب بالتثبيت المسبق: الخدمة العاملة، والمستثناة بالاسم. */
export const NOT_PRECACHED = [...SERVICE_WORKER, ...EXCLUDED_BY_NAME.map((entry) => entry.pattern)];

/** الاستثناء بالاسم بلا سطر بقسم «السقوف المقيسة» بـDECISIONS.md: مخالفة لكل اسم. */
export function exclusionRecordProblems(decisions) {
  const start = decisions.indexOf('## السقوف المقيسة');
  const rest = start < 0 ? '' : decisions.slice(start);
  const end = rest.indexOf('\n## ', 1);
  const section = end < 0 ? rest : rest.slice(0, end);
  return EXCLUDED_BY_NAME.filter((entry) => !section.includes(entry.name)).map(
    (entry) => `${entry.name}: مستثنى من التثبيت المسبق بالاسم وما له سطر بـDECISIONS «السقوف المقيسة» — الاستثناء مثل رفع السقف، بكلمة المالك (FOUNDATION ٢١٦، A4)`,
  );
}

/**
 * حزمة بالتثبيت المسبق تستورد (استيراداً ثابتاً) حزمة مستثناة: بالفتح البارد بلا نت الشاشة المحفوظة نفسها تطيح. manifest من
 * dist/.vite/manifest.json، وexcluded يحكم على مسار الملف.
 */
export function staticImportProblems(manifest, excluded = (file) => NOT_PRECACHED.some((pattern) => pattern.test(file))) {
  const problems = [];
  for (const chunk of Object.values(manifest)) {
    if (!chunk.file || excluded(chunk.file)) continue;
    for (const key of chunk.imports ?? []) {
      const imported = manifest[key]?.file;
      if (imported && excluded(imported)) problems.push(`${chunk.file} يستورد ${imported} المستثنى من التثبيت المسبق — يطيح بالفتح البارد بلا نت`);
    }
  }
  return problems;
}

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
      if (SERVICE_WORKER.some((pattern) => pattern.test(file.path))) continue;
      // المستثناة بالاسم: الحارس ما يصدّق قائمته، يقرا sw.js. محفوظة وما تنحسب = السقف ينخرق بصمت (globIgnores انحرف).
      if (NOT_PRECACHED.some((pattern) => pattern.test(file.path))) {
        if (urls.has(file.path)) problems.push(`${file.path}: مستثنى بالاسم وsw.js يحفظه — globIgnores بـvite.config.ts وقائمة الحارس افترقوا، وحجمه ما ينحسب بالسقف`);
        continue;
      }
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
 * البناء بلا مفاتيح (CI) أصغر من بناء Vercel بالرابط والمفتاح، فحدّه السقف ناقص احتياط مقيس، مثل bundle-guard:
 * اللي يعبر هنا يعبر هناك (المراجعة الثانية: CI أخضر وVercel أحمر لنفس الدفعة).
 */
export function judgePrecache(bytes, budgets, { keysPresent = true, measure = false, raise = null, note = '' } = {}) {
  const allowance = keysPresent ? 0 : (budgets.precache_keys_allowance_bytes ?? 0);
  const { ceiling, next, refused } = measuredCeiling(budgets, 'precache_bytes', ceilingFor(bytes) + allowance, note, { measure, raise });
  const problems = refused ? [refused] : [];
  const over = precacheOver(bytes, ceiling === null ? null : ceiling - allowance);
  if (over) problems.push(over);
  if (ceiling === null) problems.push('سقف التثبيت المسبق ما انقاس بعد: node scripts/guards/run.mjs --dist --measure');
  return { problems, next, ceiling, allowance };
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
  // حزمة محفوظة تستورد المستثناة تنمسك، والمستثناة تستورد المستثناة أو المحفوظة ما تنمسك؛ وقائمة الاستثناء ما تشمل غير
  // الخدمة العاملة وشاشتي البيانات الأساسية.
  const importManifest = {
    'index.html': { file: 'assets/index-a.js', imports: ['_shared.js'] },
    '_shared.js': { file: 'assets/shared-b.js' },
    'src/pages/staff/StaffPage.tsx': { file: 'assets/StaffPage-c.js', imports: ['_stores-admin.js', '_shared.js'] },
    'src/pages/inventory/ItemsPage.tsx': { file: 'assets/ItemsPage-d.js', imports: ['_stores-admin.js', '_shared.js'] },
    '_stores-admin.js': { file: 'assets/stores-admin-e.js', imports: ['_shared.js'] },
  };
  const imported = staticImportProblems(importManifest);
  if (imported.length !== 1 || !imported[0].startsWith('assets/StaffPage-c.js')) return `حزمة محفوظة تستورد المستثناة: توقّعت مخالفة وحدة، وطلع ${imported.join(' | ')}`;
  const excludedNames = [
    'sw.js', 'workbox-1a.js', 'assets/ItemsPage-x1.js', 'assets/OrgSettingsPage-x2.js', 'assets/stores-admin-x3.js',
    'assets/AccountsRoutes-x8.js', 'assets/AccountsRoutes-x9.css', 'assets/accounts-office-xd.js',
  ];
  // المحفوظة: شاشات الجولة والرئيسية وقاموس القيود الكسول (يلزم بلا نت لجملة رفض بالطابور) وقراءة اليوم المشتركة.
  const kept = ['assets/StaffPage-x4.js', 'assets/index-x5.js', 'assets/SettingsPage-x6.js', 'assets/stores-x7.js', 'assets/HomePage-xe.js', 'assets/constraints-xf.js', 'assets/dayText-xg.js'];
  if (!excludedNames.every((file) => NOT_PRECACHED.some((p) => p.test(file))) || kept.some((file) => NOT_PRECACHED.some((p) => p.test(file)))) {
    return 'قائمة الاستثناء من التثبيت المسبق أوسع أو أضيق من الخدمة العاملة وشاشات المكتب المسمّاة';
  }
  if (!SERVICE_WORKER.every((p) => NOT_PRECACHED.some((q) => q.source === p.source))) return 'الخدمة العاملة طلعت من قائمة الاستثناء';
  // الحارس ما يصدّق قائمته: حزمة مستثناة بالاسم وsw.js يحفظها (globIgnores بـvite.config.ts انحرف عن القائمة) تنمسك مرّة،
  // وحجمها ما ينخفي عن السقف. والمستثناة فعلاً (برّا sw.js) ما تنمسك.
  const listed = (sw) => ({ ...good, 'sw.js': Buffer.from(sw) });
  const driftSw = good['sw.js'].toString().replace('{url:"assets/a.js",revision:null}', '{url:"assets/a.js",revision:null},{url:"assets/ItemsPage-x1.js",revision:null}');
  const driftFiles = [...files, { path: 'assets/ItemsPage-x1.js', size: 300 }];
  const drift = checkDist(read(listed(driftSw)), driftFiles, 1000);
  if (drift.problems.length !== 1 || !drift.problems[0].includes('assets/ItemsPage-x1.js')) return `حزمة مستثناة وsw.js يحفظها: توقّعت مخالفة وحدة، وطلع ${drift.problems.join(' | ') || 'صفر'}`;
  if (checkDist(read(good), driftFiles, 1000).problems.length !== 0) return 'حزمة مستثناة وsw.js ما يحفظها انمسكت';
  // الاستثناء بالاسم مثل رفع السقف (FOUNDATION ٢١٦، A4): كل اسم بسطر بـDECISIONS «السقوف المقيسة»، مو بتعليق بالشفرة بس.
  const named = EXCLUDED_BY_NAME.map((entry) => entry.name).join('، ');
  if (exclusionRecordProblems(`## السقوف المقيسة\n- سطر\n\n## غيرها\n${named}`).length !== EXCLUDED_BY_NAME.length) return 'استثناء بالاسم بلا سطر بالسقوف المقيسة ما انمسك (الاسم بقسم ثاني ما يكفي)';
  if (exclusionRecordProblems(`## السقوف المقيسة\n- استثناء من التثبيت المسبق: ${named}\n\n## غيرها\n`).length !== 0) return 'استثناء مسجَّل بالسقوف المقيسة انمسك';
  // نفس الفحصين بطريق البناء (exclusionProblems): manifest البناء وDECISIONS ينقرون، والناقص منهما مخالفة وحدة.
  const record = `## السقوف المقيسة\n- استثناء من التثبيت المسبق: ${named}\n`;
  const built = (manifest) => read({ ...good, '.vite/manifest.json': Buffer.from(JSON.stringify(manifest)) });
  const exclusion = {
    clean: exclusionProblems(built({}), record).length,
    imports: exclusionProblems(built(importManifest), record).length,
    noManifest: exclusionProblems(read(good), record).length,
    noDecisions: exclusionProblems(built({}), null).length,
    unrecorded: exclusionProblems(built({}), '## السقوف المقيسة\n').length,
  };
  const wanted = { clean: 0, imports: 1, noManifest: 1, noDecisions: 1, unrecorded: EXCLUDED_BY_NAME.length };
  if (JSON.stringify(exclusion) !== JSON.stringify(wanted)) return `فحوص الاستثناء بطريق البناء: توقّعت ${JSON.stringify(wanted)} وطلع ${JSON.stringify(exclusion)}`;
  const near = { precache_bytes: 800000, precache_keys_allowance_bytes: 700, history: [] };
  if (judgePrecache(799500, near, { keysPresent: true }).problems.length !== 0) return 'بمفاتيح: الاحتياط انطرح من سقف التثبيت المسبق';
  if (judgePrecache(799500, near, { keysPresent: false }).problems.length !== 1) return 'بلا مفاتيح: احتياط المفاتيح ما انطرح من سقف التثبيت المسبق';
  return null;
}

/**
 * فحوص الاستثناء بالاسم على البناء نفسه (run): حزمة محفوظة ما تستورد مستثناة (dist/.vite/manifest.json)، وكل اسم مستثنى
 * بسطره بـDECISIONS. read يقرا من dist، وdecisions نصّ DECISIONS.md أو null (ما موجود). الملف الناقص مخالفة، مو نجاح بصمت.
 * دالّة لحالها حتى الفحص الذاتي يمرّ بنفس الطريق اللي يمرّ بيه البناء (اختبار الطفرات WP2: الربط بـrun كان بلا ضابط).
 */
export function exclusionProblems(read, decisions) {
  const problems = [];
  const manifestBuffer = read('.vite/manifest.json');
  if (!manifestBuffer) problems.push('ماكو dist/.vite/manifest.json — الاستيراد من الحزم المستثناة ما ينفحص');
  else problems.push(...staticImportProblems(JSON.parse(manifestBuffer.toString('utf8'))));
  problems.push(...(decisions === null ? ['ماكو docs/DECISIONS.md — الاستثناء من التثبيت المسبق ما ينفحص'] : exclusionRecordProblems(decisions)));
  return problems;
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
  const decisions = path.join(ROOT, 'docs', 'DECISIONS.md');
  result.problems.push(...exclusionProblems(read, existsSync(decisions) ? readFileSync(decisions, 'utf8') : null));
  const keysPresent = hasKeys(buildKeys());
  const note = `قياس ${new Date().toISOString()} بلا مفاتيح=${!keysPresent}: ${result.precacheBytes} بايت، ${result.precached} ملف`;
  const verdict = judgePrecache(result.precacheBytes, readBudgets(), { keysPresent, measure, raise, note });
  if (verdict.next) saveBudgets(verdict.next);
  return {
    scanned: files.length,
    problems: [...result.problems, ...verdict.problems],
    summary: `فحصت ${result.checked} بنداً بـdist؛ التثبيت المسبق ${result.precached} ملف = ${result.precacheBytes} بايت (السقف ${verdict.ceiling}${keysPresent ? '' : ` ناقص احتياط المفاتيح ${verdict.allowance}`})`,
  };
}
