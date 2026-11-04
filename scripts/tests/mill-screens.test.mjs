// شاشات المعمل (0015، كلمة المالك 2026-11-03: ألوان ومفعمة بالحياة؛ و0016، كلمة المالك 2026-11-04) مرسومة نصّاً من المصدر الحقيقي،
// ومحلّلاتها على أجوبة بشكل العقد، وطلبات repo الحقيقي على عميل مزيّف. كلّ حالة تفشل على الشفرة قبل النسخة الثانية:
// S1 بطاقة الخلطة لمشغّل المعمل بلا أيّ رقم مال ومعها «أنتج»، ولأدوار الكلفة كلفة كيلو آخر إنتاج الفعلية، أو المتوقّعة قبل أوّل
//    إنتاج، وعدد الدفعات وآخر إنتاج وكميته؛ S2 لون الخلطة من معرّفها بـhsl() بلا حدّ (لا أصناف Tailwind)، ثابت لكلّ معرّف،
//    وقطع الشريط بألوان متباعدة؛ S3 مشاكل الدفعة بالعربية ومنها costs_unfunded بأرقامها لأدوار الكلفة وبلاها لغيرهم؛
//    S4 كميات الإنتاج السريعة؛ S5 حساب البانية الحيّ (الكتلة واللتر والكلفة المتوقّعة) بالأعداد الصحيحة؛ S6 المنتقي بحالاته الثلاث
//    ومرآة أنواع مخزن المواد الأوّلية؛ S7 المحلّلات تقرأ مفاتيح 0016 (والمال غائب لغير أدوار الكلفة)؛ S8 طلبات repo: create_recipe
//    وadd_production_input وحذف السطور الثلاثة، والمبالغ والكمية الفعلية مشروطة بما شافته الشاشة (صفر صفوف يقرأ الصفّ).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));

// core بديل لـrepo بلا شبكة: نداء الدالّة وطلب الجدول يسجّلهما globalThis.__repo، والملف الحقيقي (mill.ts) يبني الطلب ويقرأ الجواب.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__repo.rpc(fn, args);
export const send = async (make) => ({ result: await make(globalThis.__repo.db), wasOnline: true });
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = (answer) => {
  if (answer.error) throw answer.error;
  const rows = answer.data === null ? [] : Array.isArray(answer.data) ? answer.data : [answer.data];
  if (!rows.length) throw new ZeroRowsError();
  return rows;
};
export const authed = async () => ({ db: globalThis.__repo.db });
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'core-stub',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'core-stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'core-stub' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle(contents, plugins = []) {
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
    plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const textOf = (html) => html.replace(/<[^>]+>/g, '');

const recipe = (money, over = {}) => ({
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
  lastBatch: { id: 'b-9', docNo: 'PD-2026-0009', producedOn: '2026-11-02', outputQtyKg: 2_000_000n, totalValue: money ? 2_388_800_00n : null, costPerKg: money ? 1_194_40n : null },
  lastCostPerKg: money ? 1_194_40n : null,
  expectedCostPerKg: money ? 1_150_00n : null,
  pieces: [
    { key: 'i-1', label: 'ذرة صفراء', weight: 600_000n },
    { key: 'i-2', label: 'كسبة صويا', weight: 300_000n },
    { key: 'i-3', label: 'نخالة', weight: 80_000n },
    { key: 'i-4', label: 'حجر', weight: 15_000n },
    { key: 'i-5', label: 'ملح', weight: 5_000n },
  ],
  moreLines: 1,
  ...over,
});

/** عميل PostgREST مزيّف: كلّ سلسلة تُسجَّل بعملياتها، والجواب من answer(table, ops) حين تُنتظَر. */
function fakeDb(answer) {
  const log = [];
  return {
    log,
    from(table) {
      const ops = [];
      const chain = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              log.push([table, ops]);
              const result = answer(table, ops);
              return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
            }
            return (...args) => {
              ops.push([prop, ...args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
}

export default async function (t) {
  const m = await bundle(
    [
      "export { RecipeCardView, PRODUCE_UNITS, QUICK_AMOUNTS, produceKg } from './src/pages/mill/MillPage.tsx';",
      "export { problemText, unfundedText, materialRows } from './src/pages/mill/BatchPage.tsx';",
      "export { lineMassKg, lineBaseQty, plannedCost, planningPrice } from './src/pages/mill/RecipeBuilderPage.tsx';",
      "export { ExpectedPanel } from './src/pages/mill/RecipePage.tsx';",
      "export { MILL_RAW_KINDS, millAdmissible, pickerView, newItemFields } from './src/pages/mill/pickers.tsx';",
      "export { CompositionBar, recipeColor, hueOf, pieceColor, pct } from './src/pages/mill/shared.tsx';",
      "export { ADMISSIBLE } from './src/domain/stock.ts';",
      "export { MemoryRouter } from 'react-router-dom';",
    ].join('\n'),
  );
  // البطاقة فيها روابط لبطاقة الخلطة وللدفعة، فالرسم داخل موجّه ذاكرة (مثل القشرة الحقيقية).
  const draw = (props) => m.renderToStaticMarkup(m.h(m.MemoryRouter, null, m.h(m.RecipeCardView, props)));

  // ── S1: مشغّل المعمل: البطاقة كاملة بلا مال، ومعها «أنتج» وعدد الدفعات وآخر إنتاج ─────────────────────────────────────
  const miller = draw({ recipe: recipe(false), canProduce: true, onProduce: () => {} });
  t.ok(textOf(miller).includes('علف بادئ') && textOf(miller).includes('أنتج'), 'S1 بطاقة مشغّل المعمل: اسم الخلطة وزرّ «أنتج»');
  t.ok(!textOf(miller).includes('كلفة الكيلو') && !/1,194\.40|1,150\.00/u.test(miller), 'S1 ولا رقم مال ولا عنوان كلفة');
  t.ok(textOf(miller).includes('الدفعات المنتَجة4') && textOf(miller).includes('آخر إنتاج02/11/2026 · 2.000 طن'), `S1 عدد الدفعات وآخر إنتاج بتاريخه وكميته (${textOf(miller)})`);
  t.ok(miller.includes('href="/mill/batch/b-9"'), 'S1 آخر إنتاج رابط لصفحة دفعته');
  t.ok(textOf(miller).includes('600') && textOf(miller).includes('ذرة صفراء') && textOf(miller).includes('و1 أخرى') && !textOf(miller).includes('ملح'), 'S1 أربع رقاقات بكمياتها والخامسة تُعدّ («و1 أخرى»)');

  // ── S1: أدوار الكلفة: كلفة كيلو آخر إنتاج الفعلية، والمتوقّعة قبل أوّل إنتاج ─────────────────────────────────────────
  const manager = draw({ recipe: recipe(true), canProduce: true, onProduce: () => {} });
  t.ok(textOf(manager).includes('كلفة الكيلو الفعلية1,194.40') && !textOf(manager).includes('المتوقّعة'), 'S1 بطاقة المدير بعد إنتاج: كلفة الكيلو الفعلية لآخر دفعة (لا المتوقّعة)');
  const fresh = draw({ recipe: recipe(true, { lastBatch: null, lastCostPerKg: null, batches: 0 }), canProduce: true, onProduce: () => {} });
  t.ok(textOf(fresh).includes('كلفة الكيلو المتوقّعة1,150.00') && textOf(fresh).includes('لم تُنتَج بعد') && textOf(fresh).includes('الدفعات المنتَجة0'), 'S1 قبل أوّل إنتاج: كلفة الكيلو المتوقّعة وجملة «لم تُنتَج بعد»');
  const idle = draw({ recipe: recipe(true, { activeId: null, activeBasisKg: null, pieces: [], moreLines: 0 }), canProduce: false, onProduce: () => {} });
  t.ok(textOf(idle).includes('بلا نسخة مفعَّلة') && !textOf(idle).includes('أنتج'), 'S1 خلطة بلا نسخة مفعَّلة: لا تُنتج، والسبب مكتوب');

  // ── S2: اللون من المعرّف بـhsl() في style، ثابت، وبلا حدّ لعدد الألوان، وقطع الشريط متباعدة ─────────────────────────────────
  const color = m.recipeColor('r-1');
  t.ok(manager.includes(`background:${color.solid}`) && /^hsl\(\d{1,3} 85% 45%\)$/u.test(color.solid), `S2 شريط البطاقة وشارتها بلون الخلطة hsl في style (${color.solid})`);
  t.ok(manager.includes(`<div class="h-2" style="background:${color.solid}"`) && manager.includes(`rounded-2xl text-white" style="background:${color.solid}"`), 'S2 الشريط والشارة بلا صنف لون Tailwind: اللون كلّه من style (لا يكبر ملف CSS في حزمة الإقلاع)');
  t.eq(m.recipeColor('r-1').solid, m.recipeColor('r-1').solid, 'S2 نفس المعرّف نفس اللون في كلّ رسم');
  const hues = new Set(Array.from({ length: 40 }, (_, i) => m.hueOf(`recipe-${i}`)));
  t.ok(hues.size >= 30 && [...hues].every((hue) => hue >= 0 && hue < 360), `S2 أربعون خلطة بأكثر من ثلاثين لوناً (لا قائمة ثلاثة ألوان): ${hues.size}`);
  const bar = m.renderToStaticMarkup(m.h(m.CompositionBar, { pieces: recipe(false).pieces, total: 1_000_000n, hue: color.hue }));
  t.eq((bar.match(/<span/gu) ?? []).length, 5, 'S2 قطعة لكلّ مادّة');
  const pieceColors = [...bar.matchAll(/background:(hsl\([^)]+\))/gu)].map((match) => match[1]);
  t.ok(pieceColors.length === 5 && new Set(pieceColors).size === 5 && pieceColors[0] === m.pieceColor(color.hue, 0), `S2 كلّ قطعة بلون مختلف يبدأ من لون الخلطة (${pieceColors.join(' ')})`);
  t.ok(bar.includes('ذرة صفراء: 60.00٪') && bar.includes('ملح: 0.50٪'), 'S2 الحصّة بالمئة بمرتبتين في عنوان القطعة');
  t.eq(m.renderToStaticMarkup(m.h(m.CompositionBar, { pieces: [], total: 1_000_000n })), '', 'S2 بلا مواد لا شريط');
  t.eq(m.renderToStaticMarkup(m.h(m.CompositionBar, { pieces: recipe(false).pieces, total: 0n })), '', 'S2 بلا أساس لا شريط (لا قسمة على صفر)');

  // ── S3: النسبة، ومشاكل الدفعة بالعربية، وcosts_unfunded بأرقامها لأدوار الكلفة وبلاها لغيرهم ─────────────────────────────
  t.eq(m.pct(20_000n, 1_000_000n), '2.00٪', 'S3 النسبة بمرتبتين وعلامتها');
  t.same(
    ['insufficient_stock', 'shrink_out_of_range', 'expiry_required', 'costs_pending'].map((code) => m.problemText(code)),
    ['الرصيد لا يكفي', 'الهدر خارج المدى المقبول: اكتب سببه', 'الناتج يُتابَع انتهاؤه: اكتب تاريخ الانتهاء', 'الكلف لم تُختَم بعد: يختمها المحاسب أو المدير'],
    'S3 كلّ رمز مشكلة له جملة عربية',
  );
  t.ok(m.problemText('weird_code').includes('weird_code'), 'S3 الرمز المجهول يُسمّى ولا يُخفى');
  const funded = { code: 'costs_unfunded', itemName: null, need: null, have: null, categoryId: 'c-labor', categoryName: 'أيدي عاملة', needAmount: 10_000_00n, haveAmount: 4_000_00n };
  t.eq(
    m.unfundedText(funded, 'معمل العلف'),
    '«أيدي عاملة»: المطلوب 10,000.00 والمتاح من مصاريف وحدة «معمل العلف» المسجّلة 4,000.00. سجّل مصروفاً على وحدة «معمل العلف» بفئة «أيدي عاملة» أو قلّل المبلغ.',
    'S3 المصاريف لا تكفي: الفئة والمطلوب والمتاح بفواصل، ووحدة المدخلات التي يُسجَّل عليها المصروف (م٤)',
  );
  const blind = m.unfundedText({ ...funded, categoryName: null, needAmount: null, haveAmount: null }, 'معمل العلف');
  t.ok(blind.includes('أكبر من المتاح') && blind.includes('«معمل العلف»') && !/\d/u.test(blind), 'S3 ولمن لا يرى مصاريف الوحدة جملة بلا رقم واحد، والوحدة مسمّاة');

  // ── S4: كميات الإنتاج: كيلوغرام وطن، وأربع كميات سريعة ─────────────────────────────────────────────────────────────
  t.same(m.PRODUCE_UNITS.map((option) => [option.id, option.perUnit]), [['kg', 1_000n], ['ton', 1_000_000n]], 'S4 الإنتاج بالكيلوغرام أو بالطن (الطن ألف كيلوغرام)');
  t.same(m.QUICK_AMOUNTS.map((quick) => [quick.kg, quick.label()]), [[500_000n, 'نصف طنّ'], [1_000_000n, 'طنّ'], [2_000_000n, 'طنّان'], [5_000_000n, '5 أطنان']], 'S4 نصف طنّ وطنّ وطنّان وخمسة أطنان');
  t.same([m.produceKg('2.5', 'ton'), m.produceKg('1,000', 'kg'), m.produceKg('abc', 'kg')], [2_500_000n, 1_000_000n, null], 'S4 الكمية من المكتوب ووحدته بلا قسمة ولا تقريب');

  // ── S5: حساب البانية الحيّ: الكتلة واللتر والكلفة المتوقّعة بالأعداد الصحيحة ──────────────────────────────────────────
  t.same([m.lineMassKg(600_000n, 'kg', null), m.lineMassKg(10_000n, 'L', 9_200n), m.lineMassKg(10_000n, 'L', null)], [600_000n, 9_200n, null], 'S5 الكتلة: الكيلو كما هو، و10 لتر × 0.92 = 9.2 كغم، وسائل بلا كثافة لا يُحسب');
  t.same([m.lineBaseQty(9_200n, 'kg', 'L', 9_200n), m.lineBaseQty(5_000n, 'L', 'L', 9_200n), m.lineBaseQty(5_000n, 'kg', 'L', null)], [10_000n, 5_000n, null], 'S5 الكمية بوحدة الأساس: 9.2 كغم من زيت كثافته 0.92 = 10 لتر');
  // 600 كغم × 450.00 + 300 كغم × 900.00 + 100 كغم بلا سعر، لأساس 1,000 كغم: (270,000 + 270,000) × 1000 ÷ 1000 = 540,000.00 للطنّ،
  // والتكاليف 15,000.00 + 5,000.50؛ مادّة بلا سعر فلا كلفة كيلو.
  const partial = m.plannedCost([{ qtyBase: 600_000n, price: 450_00n }, { qtyBase: 300_000n, price: 900_00n }, { qtyBase: 100_000n, price: null }], [15_000_00n, 5_000_50n], 1_000_000n);
  t.same(partial, { materialsPerTon: 540_000_00n, ratesPerTon: 20_000_50n, costPerTon: 560_000_50n, costPerKg: null, unpriced: 1 }, 'S5 كلفة الطنّ المتوقّعة: مواد + تكاليف، وعدد غير المسعَّر بلا كلفة كيلو');
  // أساس 500 كغم: 333.333 كغم × 1.01 = 336.66633 دينار ← للطنّ ×2 = 673.33266 ← 673.33؛ والكيلو (336.66633×1000 + 0) ÷ 500 ÷ 1000 = 0.67333 ← 0.67.
  const whole = m.plannedCost([{ qtyBase: 333_333n, price: 1_01n }], [], 500_000n);
  t.same([whole.materialsPerTon, whole.costPerKg, whole.unpriced], [673_33n, 67n, 0], 'S5 تقريب واحد نصفاً بعيداً عن الصفر لكلّ رقم');
  t.eq(m.plannedCost([], [], 0n), null, 'S5 بلا أساس لا حساب');
  t.same([m.planningPrice(500_00n, 450_00n, 400_00n), m.planningPrice(null, 450_00n, 400_00n), m.planningPrice(null, null, 400_00n), m.planningPrice(null, null, null)], [500_00n, 450_00n, 400_00n, null], 'S5 السعر: المكتوب الآن، وإلّا سعر الكلفة المحفوظ، وإلّا آخر شراء');
  const expected = m.renderToStaticMarkup(m.h(m.ExpectedPanel, { expected: { materialsPerTon: 540_000_00n, ratesPerTon: 20_000_00n, costPerTon: 560_000_00n, unpriced: 2 } }));
  t.ok(textOf(expected).includes('كلفة الطنّ المتوقّعة: 560,000.00 على الأقلّ') && textOf(expected).includes('2 من المواد بلا أيّ سعر'), 'S5 كلفة الطنّ من الخادم ببطاقة الخلطة، وغير المسعَّر يُقال ولا يُجمع ناقصاً بصمت');

  // ── S6: المنتقي بحالاته الثلاث، ومرآة أنواع مخزن المواد الأوّلية ─────────────────────────────────────────────────────
  t.same([...m.MILL_RAW_KINDS].sort(), [...m.ADMISSIBLE.raw].sort(), 'S6 أنواع المعمل = ADMISSIBLE.raw (مرآة private.item_admissible)');
  const row = (id, name, kind, baseUnit = 'kg', archived = false) => ({ id, name, kind, baseUnit, archived, density: null, scaleStep: 100n });
  const rows = [row('i-c', 'ذرة صفراء', 'raw'), row('i-f', 'ذرة', 'feed'), row('i-o', 'زيت', 'raw', 'L'), row('i-b', 'كيس', 'packaging', 'pc'), row('i-x', 'ذرة قديمة', 'raw', 'kg', true)];
  const corn = m.pickerView(rows, 'ذرة', new Set());
  t.same([corn.fit.map((r) => r.id), corn.exactFit, corn.misfits.map((r) => r.id)], [['i-c', 'i-o'], false, ['i-f']], 'S6 «ذرة»: الصالحة (لا المؤرشفة ولا القطعة)، ولا مطابق صالح بالاسم نفسه، و«ذرة» بنوع علف تُسمّى');
  // rows هنا جواب البحث كما يرجّعه الخادم لـ«ذرة صفراء» (الاسم يحتوي المكتوب).
  const yellow = m.pickerView([rows[0]], 'ذرة صفراء', new Set(['i-c']));
  t.same([yellow.exactFit, yellow.fit, yellow.exactIn], [true, [], true], 'S6 المطابق الصالح بالاسم نفسه يمنع «أنشئ» (لا توأم ثانٍ) ولو كان في الجدول، والمكتوبة في الجدول لا تُعرض ثانية بل يُقال إنّها مكتوبة');
  t.same(m.newItemFields(' صويا ', 'raw'), { name: 'صويا', category_id: null, kind: 'raw', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null, tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] }, 'S6 المادّة المُنشأة من المعمل: بالكيلوغرام وخطوة 0.1 ونوعها');

  // ── S7 وS8: محلّلات mill.ts وطلباته على repo حقيقي وعميل مزيّف ────────────────────────────────────────────────────
  const repo = await bundle("export * from './src/lib/repo/mill.ts'; export { RejectedError, ZeroRowsError } from './src/lib/errors.ts';", [coreStub]);
  await parsers(t, repo);
  await requests(t, repo);

  // ── صفوف جدول مواد الدفعة: المعاينة للمسوّدة ويّا ما تعرفه البطاقة عن البديل ─────────────────────────────────────────
  const batch = repo.parseBatch(batchJson('draft', true));
  const preview = repo.parsePreview(previewJson(true));
  const merged = m.materialRows(batch, preview);
  t.same(
    merged.map((r) => [r.id, r.drawQty, r.detail?.isSubstitute ?? null, r.detail?.replacedItemName ?? null]),
    [['in-1', 600_000n, false, null], ['in-2', 300_000n, true, 'كسبة صويا 44٪']],
    'صفوف المسوّدة من المعاينة (ما سيُسحب) ومعها البديل وما حلّ محلّه من البطاقة',
  );
}

// ─── أجوبة بشكل العقد (0016) ───────────────────────────────────────────────────────────────────────────────────
function recipeJson(money) {
  const json = {
    id: 'r-1',
    name: 'علف بادئ',
    note: null,
    archived: false,
    version: 2,
    output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
    versions: [{ id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 5 }],
    selected: { id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', note: null, activated_at: null, version: 5 },
    lines: [
      {
        id: 'l-1',
        line_no: 1,
        item_id: 'i-corn',
        item_name: 'ذرة صفراء',
        kind: 'raw',
        base_unit: 'kg',
        category_id: 'c-food',
        category_name: 'الغذاء',
        qty: '600.000',
        unit: 'kg',
        mass_kg: '600.000',
        share_pct: '60.00',
        in_basis: true,
        ...(money ? { money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' } } : {}),
      },
    ],
    mass_kg: '600.000',
    pick_items: [{ id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' }],
    expense_categories: [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }],
  };
  if (money) {
    json.money = {
      rates: [{ id: 'rt-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', amount_per_ton: '15000.00' }],
      expected: { materials_per_ton: '270000.00', rates_per_ton: '15000.00', cost_per_ton: '285000.00', unpriced: 0 },
    };
  }
  return json;
}

function previewJson(money) {
  const json = {
    id: 'b-1',
    kind: 'production',
    status: 'draft',
    version: 7,
    produced_on: '2026-11-04',
    planned_kg: '1000.000',
    input_mass_kg: '900.000',
    output_qty_kg: '900.000',
    output_expiry_on: null,
    shrink_kg: '0.000',
    shrink_pct: '0.00',
    shrink_reason: null,
    shrink_ok: true,
    costs_confirmed: false,
    input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', division_id: 'd-mill', division_name: 'معمل العلف' },
    output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
    lines: [
      { input_id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '600.000', actual_qty: null, draw_qty: '600.000', in_basis: true, tracks_expiry: false, ...(money ? { money: { value: '270000.00' } } : {}) },
      { input_id: 'in-2', line_no: 3, item_id: 'i-soy48', item_name: 'كسبة صويا 48٪', base_unit: 'kg', planned_qty: '300.000', actual_qty: '310.000', draw_qty: '300.000', in_basis: true, tracks_expiry: false, ...(money ? { money: { value: '279000.00' } } : {}) },
    ],
    problems: money
      ? [
          { code: 'insufficient_stock', item_id: 'i-soy48', item_name: 'كسبة صويا 48٪', need: '310.000', have: '300.000', unit: 'kg' },
          { code: 'costs_unfunded', category_id: 'c-labor', category_name: 'أيدي عاملة', need: '15000.00', have: '4000.00' },
        ]
      : [{ code: 'insufficient_stock', item_id: 'i-soy48', item_name: 'كسبة صويا 48٪', need: '310.000', have: '300.000', unit: 'kg' }, { code: 'costs_unfunded' }],
    can_post: false,
    plan_token: 'tok-7',
  };
  if (money) {
    json.money = {
      input_value: '549000.00',
      extra_value: '15000.00',
      total_value: '564000.00',
      cost_per_kg: '626.67',
      costs: [{ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', available: '4000.00' }],
    };
  }
  return json;
}

function batchJson(status, money) {
  const posted = status === 'posted';
  const json = {
    id: 'b-1',
    doc_no: posted ? 'PD-2026-0003' : null,
    status,
    version: 7,
    produced_on: '2026-11-04',
    planned_kg: '1000.000',
    output_qty_kg: posted ? '890.000' : null,
    output_expiry_on: null,
    input_mass_kg: posted ? '900.000' : null,
    shrink_kg: posted ? '10.000' : null,
    shrink_pct: posted ? '1.11' : null,
    shrink_reason: null,
    note: null,
    void_reason: null,
    costs_confirmed: posted,
    recipe: { id: 'r-1', name: 'علف بادئ', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
    output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: false },
    input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
    output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
    lines: [
      { id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '600.000', actual_qty: null, used_qty: posted ? '600.000' : null, in_basis: true, is_substitute: false, reason: null, replaced_item_name: null, draws: posted ? [] : null, ...(money ? { money: { value: posted ? '270000.00' : null } } : {}) },
      { id: 'in-2', line_no: 3, item_id: 'i-soy48', item_name: 'كسبة صويا 48٪', base_unit: 'kg', planned_qty: '300.000', actual_qty: null, used_qty: posted ? '300.000' : null, in_basis: true, is_substitute: true, reason: 'نفدت الكسبة 44٪', replaced_item_name: 'كسبة صويا 44٪', draws: posted ? [] : null, ...(money ? { money: { value: posted ? '279000.00' : null } } : {}) },
    ],
  };
  if (money) {
    json.money = {
      input_value: posted ? '549000.00' : null,
      extra_value: posted ? '15000.00' : null,
      total_value: posted ? '564000.00' : null,
      cost_per_kg: posted ? '633.71' : null,
      costs: [
        {
          cost_id: 'pc-1',
          line_no: 1,
          category_id: 'c-labor',
          category_name: 'أيدي عاملة',
          planned_amount: '15000.00',
          amount: '15000.00',
          source: 'recipe',
          allocations: posted ? [{ expense_id: 'e-1', on_date: '2026-11-01', amount: '15000.00', label: 'نقداً من الصندوق' }] : [],
        },
      ],
    };
  }
  return json;
}

async function parsers(t, repo) {
  const shape = (fn) => {
    try {
      fn();
      return 'ok';
    } catch (error) {
      return error instanceof repo.MillShapeError ? error.message : `other:${error}`;
    }
  };
  // recipes_overview: كلفة الكيلو المتوقّعة تحت money، وغائبة لغير أدوار الكلفة.
  const overview = (money) => ({
    today: '2026-11-04',
    recipes: [
      {
        id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 1,
        output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed' },
        active: { id: 'v-1', version_no: 1, basis_kg: '1000.000', lines: 1, pieces: [{ item_id: 'i-corn', item_name: 'ذرة صفراء', mass_kg: '1000.000' }] },
        draft: null, batches: 0, last_batch: null,
        ...(money ? { money: { expected_cost_per_kg: '285.00' } } : {}),
      },
    ],
    stores: [], feed_items: [],
  });
  t.same([repo.parseRecipes(overview(true))[0].expectedCostPerKg, repo.parseRecipes(overview(false))[0].expectedCostPerKg], [285_00n, null], 'S7 recipes_overview: expected_cost_per_kg تحت money، وnull لمن لا يرى الكلفة');
  const nullExpected = overview(true);
  nullExpected.recipes[0].money.expected_cost_per_kg = null;
  t.eq(repo.parseRecipes(nullExpected)[0].expectedCostPerKg, null, 'S7 وكلفة متوقّعة فارغة (مادّة بلا سعر) null لا صفر');

  // recipe_detail: أسعار السطر والمعدّلات وكلفة الطنّ تحت money، وفئات المصاريف بلا مال.
  const detail = repo.parseRecipe(recipeJson(true));
  t.same([detail.lines[0].costPrice, detail.lines[0].lastPrice, detail.lines[0].unitCost], [450_00n, 440_25n, 430_50n], 'S7 سطر الخلطة: سعر الكلفة المكتوب وآخر شراء ومتوسّط المتاح');
  t.same(detail.rates, [{ id: 'rt-1', lineNo: 1, categoryId: 'c-labor', categoryName: 'أيدي عاملة', amountPerTon: 15_000_00n }], 'S7 معدّلات تكاليف الطنّ');
  t.same(detail.expected, { materialsPerTon: 270_000_00n, ratesPerTon: 15_000_00n, costPerTon: 285_000_00n, unpriced: 0 }, 'S7 كلفة الطنّ المتوقّعة');
  t.same(detail.expenseCategories.map((c) => c.name), ['أيدي عاملة', 'كهرباء'], 'S7 فئات المصاريف لمنتقي المعدّلات');
  const blindDetail = repo.parseRecipe(recipeJson(false));
  t.same([blindDetail.rates, blindDetail.expected, blindDetail.lines[0].costPrice, blindDetail.expenseCategories.length], [null, null, null, 2], 'S7 بلا money (دور بلا كلفة): لا معدّلات ولا كلفة ولا أسعار، والفئات باقية');
  const noVersion = recipeJson(true);
  noVersion.money.expected = null;
  t.eq(repo.parseRecipe(noVersion).expected, null, 'S7 خلطة بلا نسخة: expected فارغ null');
  const broken = recipeJson(true);
  delete broken.expense_categories;
  t.eq(shape(() => repo.parseRecipe(broken)), 'mill_shape:expense_categories', 'S7 مفتاح العقد الغائب خطأ شكل لا قائمة فارغة صامتة');
  const brokenRate = recipeJson(true);
  brokenRate.money.rates[0].amount_per_ton = null;
  t.eq(shape(() => repo.parseRecipe(brokenRate)), 'mill_shape:amount_per_ton', 'S7 مبلغ المعدّل الغائب خطأ شكل لا صفر');

  // preview_production: سطور التكاليف بالمتاح، والكلف الحقيقية، وcosts_unfunded بالمال أو بلاه.
  const preview = repo.parsePreview(previewJson(true));
  t.same(
    [preview.extraValue, preview.totalValue, preview.costPerKg, preview.costs?.[0]],
    [15_000_00n, 564_000_00n, 626_67n, { id: 'pc-1', lineNo: 1, categoryId: 'c-labor', categoryName: 'أيدي عاملة', plannedAmount: 15_000_00n, amount: 15_000_00n, source: 'recipe', available: 4_000_00n, allocations: [] }],
    'S7 المعاينة: extra_value وسطر التكاليف بالمحسوب والمبلغ والمتاح',
  );
  const unfunded = preview.problems.find((p) => p.code === 'costs_unfunded');
  t.same([unfunded.categoryName, unfunded.needAmount, unfunded.haveAmount, unfunded.need, unfunded.have], ['أيدي عاملة', 15_000_00n, 4_000_00n, null, null], 'S7 costs_unfunded: المطلوب والمتاح مالاً بمرتبتين (لا كميات)');
  const short = preview.problems.find((p) => p.code === 'insufficient_stock');
  t.same([short.need, short.have, short.needAmount], [310_000n, 300_000n, null], 'S7 ومشكلة الرصيد كميات كما كانت');
  const blindPreview = repo.parsePreview(previewJson(false));
  t.same([blindPreview.costs, blindPreview.extraValue, blindPreview.problems[1]], [null, null, { code: 'costs_unfunded', itemName: null, need: null, have: null, categoryId: null, categoryName: null, needAmount: null, haveAmount: null, expiryOn: null, producedOn: null }], 'S7 لغير أدوار الكلفة: لا سطور تكاليف، وcosts_unfunded رمز بلا أرقام');

  // production_detail: البديل وما حلّ محلّه، والتحميلات، والوجبات المسحوبة إن أرسلها الخادم.
  const posted = repo.parseBatch(batchJson('posted', true));
  t.same([posted.lines[1].isSubstitute, posted.lines[1].reason, posted.lines[1].replacedItemName, posted.lines[0].draws], [true, 'نفدت الكسبة 44٪', 'كسبة صويا 44٪', []], 'S7 سطر الدفعة: بديل بسببه واسم ما حلّ محلّه، والوجبات قائمة (فارغة هنا)');
  t.same(posted.costs?.[0].allocations, [{ expenseId: 'e-1', onDate: '2026-11-01', amount: 15_000_00n, label: 'نقداً من الصندوق' }], 'S7 تحميلات سطر التكاليف من المصاريف');
  t.same([posted.extraValue, posted.costs?.[0].available], [15_000_00n, null], 'S7 extra_value للمرحَّلة، ولا available في البطاقة');
  const draftBatch = repo.parseBatch(batchJson('draft', true));
  t.same([draftBatch.extraValue, draftBatch.inputValue, draftBatch.costs?.length], [null, null, 1], 'S7 المسوّدة: قيمها فارغة قبل الترحيل وسطور التكاليف حاضرة');
  t.eq(repo.parseBatch(batchJson('posted', false)).costs, null, 'S7 بلا money: لا تكاليف');
  const traced = batchJson('posted', true);
  traced.lines[0].draws = [{ lot_id: 'lot-1', qty: '600.000', received_on: '2026-10-20', source: 'RC-2026-0004' }];
  t.same(repo.parseBatch(traced).lines[0].draws, [{ lotId: 'lot-1', qty: 600_000n, receivedOn: '2026-10-20', source: 'RC-2026-0004' }], 'S7 الوجبات المسحوبة لكلّ سطر حين يرسلها الخادم (مفتاح مقترح draws)');
  t.same(repo.parseCreatedRecipe({ id: 'r-9', version_id: 'v-9', version_no: 1, status: 'active', lines: 3, rates: 1 }), { id: 'r-9', versionId: 'v-9', versionNo: 1, status: 'active', lines: 3, rates: 1 }, 'S7 جواب create_recipe');
}

async function requests(t, repo) {
  const rpc = [];
  let answer = () => ({ data: [{ id: 'x' }], error: null, status: 200 });
  const db = fakeDb((table, ops) => answer(table, ops));
  globalThis.__repo = {
    db,
    rpc: async (fn, args) => {
      rpc.push([fn, args]);
      if (fn === 'create_recipe') return { id: args.p_id, version_id: args.p_version_id, version_no: 1, status: args.p_activate ? 'active' : 'draft', lines: args.p_lines.length, rates: args.p_rates.length };
      if (fn === 'add_production_input') return { id: args.p_id, line_no: 4, version: 9 };
      return { deleted: true };
    },
  };
  try {
    const created = await repo.createRecipe({
      id: 'r-new',
      versionId: 'v-new',
      name: '  علف ناهٍ ',
      outputItemId: 'f-2',
      basisKg: 1_000_000n,
      lines: [{ itemId: 'i-corn', qty: 600_000n, unit: 'kg' }, { itemId: 'i-oil', qty: 25_500n, unit: 'L' }],
      rates: [{ categoryId: 'c-labor', amountPerTon: 15_000_00n }],
      activate: true,
    });
    t.same(
      rpc.at(-1),
      [
        'create_recipe',
        {
          p_id: 'r-new',
          p_version_id: 'v-new',
          p_name: 'علف ناهٍ',
          p_output_item: 'f-2',
          p_basis_kg: '1000.000',
          p_lines: [{ item_id: 'i-corn', qty: '600.000', unit: 'kg' }, { item_id: 'i-oil', qty: '25.500', unit: 'L' }],
          p_rates: [{ category_id: 'c-labor', amount_per_ton: '15000.00' }],
          p_activate: true,
        },
      ],
      'S8 create_recipe بنداء واحد: المعرّفان من الجهاز والأرقام نصوص عشرية بمراتبها',
    );
    t.same([created.id, created.status, created.lines, created.rates], ['r-new', 'active', 2, 1], 'S8 وجوابه مقروء');
    const added = await repo.addProductionInput({ batchId: 'b-1', id: 'in-9', itemId: 'i-soy48', qty: 25_000n, replaces: 'in-2', reason: '  نفدت الكسبة ' });
    t.same(rpc.at(-1), ['add_production_input', { p_batch: 'b-1', p_id: 'in-9', p_item: 'i-soy48', p_qty: '25.000', p_replaces: 'in-2', p_reason: 'نفدت الكسبة' }], 'S8 add_production_input بالبديل وسببه');
    t.same(added, { id: 'in-9', lineNo: 4, version: 9 }, 'S8 وجوابه');
    await repo.addProductionInput({ batchId: 'b-1', id: 'in-10', itemId: 'i-salt', qty: 1_500n, replaces: null, reason: '' });
    t.same(rpc.at(-1)[1], { p_batch: 'b-1', p_id: 'in-10', p_item: 'i-salt', p_qty: '1.500', p_replaces: null, p_reason: null }, 'S8 الإضافة بلا تبديل: لا سطر مبدَّل ولا سبب');
    await repo.deleteProductionInput('in-1', 7);
    await repo.deleteBatchCost('pc-1', 8);
    await repo.deleteRecipeRate('rt-1', 5);
    t.same(rpc.slice(-3), [
      ['delete_draft_line', { p_doc_kind: 'production_input', p_line_id: 'in-1', p_expected_version: 7 }],
      ['delete_draft_line', { p_doc_kind: 'production_cost', p_line_id: 'pc-1', p_expected_version: 8 }],
      ['delete_draft_line', { p_doc_kind: 'recipe_cost_rate', p_line_id: 'rt-1', p_expected_version: 5 }],
    ], 'S8 حذف سطر المدخلات وسطر التكاليف ومعدّل الخلطة بأنواعها الثلاثة ونسخة رأسها');

    // المبلغ مشروط بما شافته الشاشة.
    answer = () => ({ data: [{ id: 'pc-1' }], error: null, status: 200 });
    await repo.setBatchCost('pc-1', 15_000_00n, 9_000_00n);
    t.same(db.log.at(-1), ['production_costs', [['update', { amount: '9000.00' }], ['eq', 'id', 'pc-1'], ['eq', 'amount', '15000.00'], ['select', 'id']]], 'S8 setBatchCost: التعديل مشروط بالمبلغ الذي شافته الشاشة');
    const before = db.log.length;
    await repo.setBatchCost('pc-1', 9_000_00n, 9_000_00n);
    t.eq(db.log.length, before, 'S8 المبلغ نفسه: لا طلب');
    // صفر صفوف: يُقرأ الصفّ — المطلوب = انكتب (جواب ضاع)، وغيره amount_changed.
    answer = (table, ops) => (ops[0][0] === 'update' ? { data: [], error: null, status: 200 } : { data: [{ batch_id: 'b-1', category_id: 'c-labor', amount: '0.00' }], error: null, status: 200 });
    await repo.setBatchCost('pc-1', 15_000_00n, 0n);
    t.same(db.log.at(-1), ['production_costs', [['select', 'batch_id, category_id, amount::text'], ['eq', 'id', 'pc-1']]], 'S8 صفر صفوف يقرأ الصفّ بمعرّفه');
    answer = (table, ops) => (ops[0][0] === 'update' ? { data: [], error: null, status: 200 } : { data: [{ batch_id: 'b-1', category_id: 'c-labor', amount: '12000.00' }], error: null, status: 200 });
    await t.rejects(repo.setBatchCost('pc-1', 15_000_00n, 0n), 'S8 كاتب آخر غيّر المبلغ: amount_changed لا دوس', /amount_changed/u);
    // الإضافة بمعرّف الجهاز: 23505 والصفّ بالقيم المطلوبة = انكتب.
    answer = (table, ops) => (ops[0][0] === 'insert' ? { data: null, error: { code: '23505', message: 'dup' }, status: 409 } : { data: [{ batch_id: 'b-1', category_id: 'c-power', amount: '2500.00' }], error: null, status: 200 });
    await repo.addBatchCost('b-1', 'pc-2', 'c-power', 2_500_00n);
    t.same(db.log.at(-2), ['production_costs', [['insert', { id: 'pc-2', batch_id: 'b-1', category_id: 'c-power', amount: '2500.00' }], ['select', 'id']]], 'S8 addBatchCost: إدراج بمعرّف الجهاز والأعمدة الممنوحة فقط');
    await t.rejects(repo.addBatchCost('b-1', 'pc-2', 'c-power', 3_000_00n), 'S8 والمعرّف نفسه بمبلغ آخر: لا يُعدّ مكتوباً', /amount_changed/u);
    // معدّل الخلطة.
    answer = () => ({ data: [{ id: 'rt-1' }], error: null, status: 200 });
    await repo.setRecipeRate('rt-1', 15_000_00n, 16_000_00n);
    t.same(db.log.at(-1), ['recipe_cost_rates', [['update', { amount_per_ton: '16000.00' }], ['eq', 'id', 'rt-1'], ['eq', 'amount_per_ton', '15000.00'], ['select', 'id']]], 'S8 setRecipeRate مشروط بالمبلغ السابق');
    await repo.addRecipeRate('v-2', 'rt-2', 'c-power', 5_000_50n);
    t.same(db.log.at(-1), ['recipe_cost_rates', [['insert', { id: 'rt-2', version_id: 'v-2', category_id: 'c-power', amount_per_ton: '5000.50' }], ['select', 'id']]], 'S8 addRecipeRate بمعرّف الجهاز');
    // الكمية الفعلية مشروطة بما شافته الشاشة، والفارغة null بـis.
    answer = () => ({ data: [{ id: 'in-1' }], error: null, status: 200 });
    await repo.setInputActual('in-1', null, 610_000n);
    t.same(db.log.at(-1), ['production_inputs', [['update', { actual_qty_base: '610.000' }], ['eq', 'id', 'in-1'], ['filter', 'actual_qty_base', 'is', null], ['select', 'id']]], 'S8 setInputActual: من «كما خُطّط» بشرط is null');
    await repo.setInputActual('in-1', 610_000n, null);
    t.same(db.log.at(-1)[1].slice(0, 3), [['update', { actual_qty_base: null }], ['eq', 'id', 'in-1'], ['filter', 'actual_qty_base', 'eq', '610.000']], 'S8 والرجوع إلى «كما خُطّط» بشرط القيمة السابقة');
    answer = (table, ops) => (ops[0][0] === 'update' ? { data: [], error: null, status: 200 } : { data: [{ actual_qty_base: '590.000' }], error: null, status: 200 });
    await t.rejects(repo.setInputActual('in-1', null, 610_000n), 'S8 كمية غيّرها جهاز آخر: qty_changed', /qty_changed/u);
    // فئات المصاريف الفعّالة غير النظامية.
    answer = () => ({ data: [{ id: 'c-labor', name: 'أيدي عاملة' }], error: null, status: 200 });
    t.same(await repo.loadExpenseCategories(), [{ id: 'c-labor', name: 'أيدي عاملة' }], 'S8 loadExpenseCategories');
    t.same(db.log.at(-1), ['expense_categories', [['select', 'id, name'], ['is', 'archived_at', null], ['is', 'system_code', null], ['order', 'name'], ['order', 'id']]], 'S8 بشرط حارسَي التكاليف: فعّالة وغير نظامية');
  } finally {
    delete globalThis.__repo;
  }
}
