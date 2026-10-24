// WeightPad: الوزن بالكيلو بمفتاح فاصلة صريح — 1-3-4 تنقرا 134 كغم، مو 0.134.
// و«امسح الكل» مفتاح ظاهر: الضغطة الطويلة (contextmenu) ما تنطلق بسفاري الآيفون، فهناك المسح كان ١١ ضغطة.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from './load-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** يرسم اللوحة الحقيقية نصّاً. اللوحة وreact-dom/server بحزمة وحدة: نسختين من React تكسر الخطّافات. */
async function renderPad(props) {
  const result = await build({
    stdin: {
      contents:
        "export { WeightPad } from './src/components/ui/WeightPad.tsx'; export { renderToStaticMarkup } from 'react-dom/server.browser'; export { createElement } from 'react';",
      resolveDir: ROOT,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    // بناء الإنتاج: React بلا تحذيرات الرسم بالخادم (useLayoutEffect) اللي تغطّي النتيجة.
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
  });
  const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return m.renderToStaticMarkup(m.createElement(m.WeightPad, { onChange() {}, ...props }));
}

export default async function (t) {
  const { applyWeightKey } = await loadSrc('src/components/ui/WeightPad.tsx');
  const type = (keys, max = 3) => keys.reduce((value, key) => applyWeightKey(value, key, max), '');

  t.eq(type(['1', '3', '4']), '134', '1-3-4 = 134 كغم');
  t.eq(type(['1', '.', '3', '4']), '1.34', 'الفاصلة صريحة');
  t.eq(type(['.', '5']), '0.5', 'فاصلة بالأوّل ← 0.');
  t.eq(type(['0', '7']), '7', 'ماكو أصفار بالبداية');
  t.eq(type(['1', '.', '2', '3', '4', '5']), '1.234', 'ثلاث مراتب بس');
  t.eq(type(['1', '.', '.', '5']), '1.5', 'فاصلة وحدة');
  t.eq(type(['1', '2', 'back']), '1', 'مسح رقم');
  t.eq(type(['1', '2', 'clear']), '', 'مسح الكل');
  t.eq(type(['9', '9', '9', '9', '9', '9', '9', '9']), '9999999', 'سقف سبع مراتب صحيحة');
  t.eq(type(['5', '.'], 0), '5', 'بلا كسور: الفاصلة ما تنكتب');

  // قانون المالك: الوزن المعروض بفواصل الآلاف (خابط القبّان خمس مراتب وأكثر)، والكتابة الناقصة كما هي.
  const shown = async (value) => (await renderPad({ value })).match(/<span dir="ltr"[^>]*>([^<]*)<\/span>/)?.[1];
  t.eq(await shown('12450'), '12,450', 'خابط القبّان بفواصل');
  t.eq(await shown('1234567.125'), '1,234,567.125', 'سبع مراتب وكسر');
  t.eq(await shown('12.'), '12.', 'النقطة الأخيرة تبقى وقت الكتابة');
  t.eq(await shown(''), '0', 'الفارغ صفر');

  // «امسح الكل» زرّ ظاهر بنصّه، مو ضغطة طويلة مخفية على مفتاح المسح.
  const clearKey = /<button[^>]*data-action="weight-clear"[^>]*>([^<]*)<\/button>/;
  const typed = (await renderPad({ value: '1234567.125' })).match(clearKey);
  t.ok(typed !== null, 'مفتاح «امسح الكل» ظاهر باللوحة');
  t.eq(typed?.[1], 'احذف الكل', 'المفتاح بنصّ مقروء من t()');
  t.ok(typed !== null && !/\sdisabled=""/.test(typed[0]), 'المفتاح شغّال إذا بيه رقم');
  const empty = (await renderPad({ value: '' })).match(clearKey);
  t.ok(empty !== null && /\sdisabled=""/.test(empty[0]), 'المفتاح معطّل والوزن فارغ');
  const source = readFileSync(path.join(ROOT, 'src/components/ui/WeightPad.tsx'), 'utf8');
  t.ok(!/onContextMenu/.test(source), 'ماكو مسح بـcontextmenu: الآيفون ما يطلقه، والمنصّتين يتصرّفن نفس الشي');
}
