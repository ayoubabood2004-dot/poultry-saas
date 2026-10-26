// env-guard (بعد vite build بس): ماكو سرّ بأي ملف مبني، والمفتاح بـVITE_SUPABASE_PUBLISHABLE_KEY هو العامّ، وبناء
// الإنتاج بمفاتيحه. السرّي والعامّ بنفس صفحة الإعدادات باللوحة، وVite يحزم أي VITE_ بالجافاسكربت اللي ينرسل
// لكل زائر (service_role يتجاوز RLS لكل المنشآت). وبناء إنتاج بلا مفاتيح يمرّ بكل الحرّاس وينشر هيكلاً ما أحد
// يدخل بيه (FOUNDATION: «بناء بلا مفاتيح مرّ محلّياً وسقط بـVercel»): الإنتاج = VERCEL_ENV=production أو REQUIRE_KEYS=1.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildKeys, findSecrets, isProjectUrl, isPublishableKey, keysPresent } from './keys.mjs';
import { listFiles, ROOT } from './lib.mjs';

export const name = 'env-guard';

const DIST = path.join(ROOT, 'dist');
const TEXT_EXTENSIONS = ['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.map', '.txt'];

/** files = [{ path, text }]؛ keys من buildKeys؛ production: البناء لازم يكون بمفاتيح. */
export function judge({ files, keys, production }) {
  const problems = [];
  for (const file of files) {
    for (const what of findSecrets(file.text)) problems.push(`${file.path}: ${what} — المفتاح السرّي للخادم بس، وما ينكتب بأي متغيّر VITE_`);
  }
  if (keys.key && !isPublishableKey(keys.key)) {
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY مو المفتاح العامّ (sb_publishable_…): خذ «Publishable key» من لوحة Supabase');
  }
  if (keys.url && !isProjectUrl(keys.url)) {
    problems.push('VITE_SUPABASE_URL مو رابط المشروع (https://<ref>.supabase.co): رابط اتّصال القاعدة بيه كلمة سرّها وما ينكتب بـVITE_');
  }
  if (production && !keysPresent(keys)) {
    problems.push('بناء الإنتاج بلا مفاتيح القاعدة: VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY لازم الاثنين بإعدادات Vercel');
  } else if (production && !files.some((file) => file.text.includes(keys.url))) {
    problems.push('رابط القاعدة ما انحزم بالبناء: المتغيّر انضاف بعد البناء؟ أعد البناء');
  }
  return problems;
}

function fakeJwt(payload) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.${'s'.repeat(43)}`;
}

export function selfTest() {
  const url = 'https://abc.supabase.co';
  const keyed = { url, key: 'sb_publishable_abcdefgh', source: 'process' };
  const none = { url: '', key: '', source: null };
  const clean = [{ path: 'assets/a.js', text: `const u="${url}",k="sb_publishable_abcdefgh";` }];
  const cases = [
    ['بناء نظيف بمفاتيح', judge({ files: clean, keys: keyed, production: true }), 0],
    ['محلّي بلا مفاتيح', judge({ files: [{ path: 'a.js', text: 'x' }], keys: none, production: false }), 0],
    ['JWT دوره anon', judge({ files: [{ path: 'a.js', text: fakeJwt({ role: 'anon' }) }], keys: none, production: false }), 0],
    ['مفتاح sb_secret_ بالحزمة', judge({ files: [{ path: 'a.js', text: 'k="sb_secret_abcdefghij12"' }], keys: none, production: false }), 1],
    ['JWT دوره service_role', judge({ files: [{ path: 'a.js', text: `k="${fakeJwt({ role: 'service_role' })}"` }], keys: none, production: false }), 1],
    ['السرّي بمتغيّر العامّ', judge({ files: clean, keys: { url, key: 'sb_secret_abcdefghij12', source: 'file' }, production: false }), 1],
    ['إنتاج بلا مفاتيح', judge({ files: clean, keys: none, production: true }), 1],
    ['إنتاج بالرابط وحده', judge({ files: clean, keys: { url, key: '', source: null }, production: true }), 1],
    ['إنتاج والرابط مو بالحزمة', judge({ files: [{ path: 'a.js', text: 'x' }], keys: keyed, production: true }), 1],
    ['JWT anon توقيعه ضاع (التطبيق يرفضه)', judge({ files: clean, keys: { url, key: `${fakeJwt({ role: 'anon' }).split('.').slice(0, 2).join('.')}.`, source: 'file' }, production: false }), 1],
    ['JWT anon بحرف غريب بحمولته (atob يرميه)', judge({ files: clean, keys: { url, key: fakeJwt({ role: 'anon' }).replace('.', '.*'), source: 'file' }, production: false }), 1],
    ['رابط قاعدة بكلمة سرّ بمتغيّر الرابط', judge({ files: clean, keys: { url: 'postgresql://postgres.abc:pw@aws-0.pooler.supabase.com:6543/postgres', key: keyed.key, source: 'file' }, production: false }), 1],
    ['رابط http بلا تشفير', judge({ files: clean, keys: { url: 'http://abc.supabase.co', key: keyed.key, source: 'file' }, production: false }), 1],
    ['رابط قاعدة بكلمة سرّ بالحزمة', judge({ files: [{ path: 'a.js', text: 'u="postgresql://postgres.abc:s3cr3t@aws-0.pooler.supabase.com:6543/postgres"' }], keys: none, production: false }), 1],
    ['توكن حساب sbp_ بالحزمة', judge({ files: [{ path: 'a.js', text: `t="sbp_${'a1'.repeat(20)}"` }], keys: none, production: false }), 1],
    ['رابط المشروع بشرطة بآخره', judge({ files: [{ path: 'a.js', text: `${url}/` }], keys: { url: `${url}/`, key: keyed.key, source: 'file' }, production: true }), 0],
  ];
  for (const [label, problems, expected] of cases) {
    if (problems.length !== expected) return `${label}: ${problems.length} مخالفة والمتوقّع ${expected} (${problems.join(' | ')})`;
  }
  return null;
}

export function run() {
  if (!existsSync(DIST)) return { scanned: 0, problems: ['ماكو dist — شغّل vite build أوّل'], summary: '' };
  const files = listFiles(DIST, TEXT_EXTENSIONS).map((full) => ({
    path: path.relative(DIST, full).split(path.sep).join('/'),
    text: readFileSync(full, 'utf8'),
  }));
  const keys = buildKeys();
  const production = process.env.VERCEL_ENV === 'production' || process.env.REQUIRE_KEYS === '1';
  const problems = judge({ files, keys, production });
  const source = keys.source === 'process' ? 'المفاتيح من بيئة العملية' : keys.source === 'file' ? 'المفاتيح من ملف .env' : 'بناء بلا مفاتيح';
  return {
    scanned: files.length,
    problems,
    summary: `${files.length} ملف مبني بلا سرّ؛ ${source}${production ? '، بناء إنتاج' : ''}`,
  };
}
