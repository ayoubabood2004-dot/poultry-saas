// شاشات المعمل (0015، كلمة المالك 2026-11-03: ألوان ومفعمة بالحياة) مرسومة نصّاً من المصدر الحقيقي: بطاقة الخلطة لمشغّل
// المعمل بلا أيّ رقم مال ومعها زرّ «أنتج»، ولأدوار الكلفة كلفة الكيلو؛ وشريط التركيبة قطعة لكلّ مادّة بحصّتها بالمئة في
// العنوان؛ ولون الخلطة ثابت بمعرّفها (لا عشوائية)؛ ورسائل مشاكل الدفعة عربية تسمّي كلّ رمز.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function bundle(contents) {
  const result = await build({
    stdin: { contents: `${contents} export { renderToStaticMarkup } from 'react-dom/server.browser'; export { createElement as h } from 'react';`, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const textOf = (html) => html.replace(/<[^>]+>/g, '');

const recipe = (money) => ({
  id: 'r-1',
  name: 'علف بادئ',
  note: null,
  archived: false,
  version: 1,
  outputItem: { id: 'f-1', name: 'علف بادئ 21٪', baseUnit: 'kg', kind: 'feed' },
  activeId: 'v-1',
  activeVersionNo: 2,
  activeBasisKg: 1_000_000n,
  activeLines: 3,
  draft: null,
  batches: 4,
  lastBatch: null,
  lastCostPerKg: money ? 119_440n : null,
  pieces: [
    { key: 'i-1', label: 'ذرة صفراء', weight: 600_000n },
    { key: 'i-2', label: 'كسبة صويا', weight: 300_000n },
    { key: 'i-3', label: 'نخالة', weight: 80_000n },
    { key: 'i-4', label: 'حجر', weight: 15_000n },
    { key: 'i-5', label: 'ملح', weight: 5_000n },
  ],
  moreLines: 1,
});

export default async function (t) {
  const m = await bundle(
    [
      "export { RecipeCardView, PRODUCE_UNITS } from './src/pages/mill/MillPage.tsx';",
      "export { problemText } from './src/pages/mill/BatchPage.tsx';",
      "export { CompositionBar, tintOf, pct, TINTS } from './src/pages/mill/shared.tsx';",
      "export { MemoryRouter } from 'react-router-dom';",
    ].join('\n'),
  );
  // البطاقة فيها رابط لبطاقة الخلطة، فالرسم داخل موجّه ذاكرة (مثل القشرة الحقيقية).
  const draw = (props) => m.renderToStaticMarkup(m.h(m.MemoryRouter, null, m.h(m.RecipeCardView, props)));

  // ── مشغّل المعمل: البطاقة كاملة بلا مال، ومعها زرّ «أنتج» ────────────────────────────────────────────────────────
  const miller = draw({ recipe: recipe(false), canProduce: true, onProduce: () => {} });
  t.ok(textOf(miller).includes('علف بادئ') && textOf(miller).includes('أنتج'), 'بطاقة مشغّل المعمل: اسم الخلطة وزرّ «أنتج»');
  t.ok(!textOf(miller).includes('كلفة الكيلو') && !/1,194\.40/u.test(miller), 'ولا رقم مال ولا عنوان كلفة');
  t.ok(textOf(miller).includes('600') && textOf(miller).includes('ذرة صفراء'), 'رقاقات المواد بكمياتها');
  t.ok(textOf(miller).includes('و1 أخرى'), 'ما زاد على أربع رقاقات يُقال عدده');

  // ── أدوار الكلفة: كلفة الكيلو آخر دفعة ───────────────────────────────────────────────────────────────────────
  const manager = draw({ recipe: recipe(true), canProduce: true, onProduce: () => {} });
  t.ok(textOf(manager).includes('كلفة الكيلو آخر دفعة') && manager.includes('1,194.40'), 'بطاقة المدير: كلفة الكيلو بالفلس منسَّقة');

  // ── بلا نسخة مفعَّلة: لا زرّ إنتاج، والجملة تقول ما ينقص ─────────────────────────────────────────────────────────
  const idle = draw({ recipe: { ...recipe(true), activeId: null, activeBasisKg: null, pieces: [], moreLines: 0 }, canProduce: false, onProduce: () => {} });
  t.ok(textOf(idle).includes('بلا نسخة مفعَّلة') && !textOf(idle).includes('أنتج'), 'خلطة بلا نسخة مفعَّلة: لا تُنتج، والسبب مكتوب');

  // ── شريط التركيبة: قطعة لكلّ مادّة، والحصّة بالمئة في العنوان، وبلا أساس لا شريط ────────────────────────────────────
  const bar = m.renderToStaticMarkup(m.h(m.CompositionBar, { pieces: recipe(false).pieces, total: 1_000_000n }));
  t.eq((bar.match(/<span/gu) ?? []).length, 5, 'قطعة لكلّ مادّة');
  t.ok(bar.includes('ذرة صفراء: 60.00٪') && bar.includes('ملح: 0.50٪'), 'الحصّة بالمئة بمرتبتين في عنوان القطعة');
  t.eq(m.renderToStaticMarkup(m.h(m.CompositionBar, { pieces: [], total: 1_000_000n })), '', 'بلا مواد لا شريط');
  t.eq(m.renderToStaticMarkup(m.h(m.CompositionBar, { pieces: recipe(false).pieces, total: 0n })), '', 'بلا أساس لا شريط (لا قسمة على صفر)');

  // ── اللون ثابت بالمعرّف، والأربعة مختلفة ───────────────────────────────────────────────────────────────────────
  t.eq(m.tintOf('r-1').bar, m.tintOf('r-1').bar, 'نفس المعرّف نفس اللون في كلّ رسم');
  t.eq(new Set(m.TINTS.map((tint) => tint.bar)).size, 3, 'ثلاثة ألوان مختلفة');
  t.ok(m.TINTS.every((tint) => /^bg-(?:brand|success|warn)-500$/u.test(tint.bar)), 'الألوان من سلالم النظام لا ألوان خام');

  // ── النسبة بعلامتها، ومشاكل الدفعة بالعربية ─────────────────────────────────────────────────────────────────────
  t.eq(m.pct(20_000n, 1_000_000n), '2.00٪', 'النسبة بمرتبتين وعلامتها');
  t.same(
    ['insufficient_stock', 'shrink_out_of_range', 'expiry_required', 'costs_pending'].map((code) => m.problemText(code)),
    ['الرصيد لا يكفي', 'الهدر خارج المدى المقبول: اكتب سببه', 'الناتج يُتابَع انتهاؤه: اكتب تاريخ الانتهاء', 'الكلف لم تُختَم بعد: يختمها المحاسب أو المدير'],
    'كلّ رمز مشكلة له جملة عربية',
  );
  t.ok(m.problemText('weird_code').includes('weird_code'), 'الرمز المجهول يُسمّى ولا يُخفى');

  // ── خيارا كمية الإنتاج: كيلوغرام وطن ─────────────────────────────────────────────────────────────────────────
  t.same(m.PRODUCE_UNITS.map((option) => [option.id, option.perUnit]), [['kg', 1_000n], ['ton', 1_000_000n]], 'الإنتاج بالكيلوغرام أو بالطن (الطن ألف كيلوغرام)');
}
