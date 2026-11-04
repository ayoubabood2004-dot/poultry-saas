// شاشات المعمل التفاعلية (0016، عقد «المعمل، النسخة الثانية» ش-ب، كلمة المالك 2026-11-04): react-dom/client الحقيقي على DOM صغير
// (dom.mjs) يشغّل MillRoutes الحقيقية، وrepo المعمل والمخزون والجلسة والرسائل بدائل (والمحلّلات الحقيقية تقرأ أجوبة بشكل العقد).
// كل حالة تفشل على الشفرة قبلها:
// F1 بانية الخلطة بشاشة واحدة: الاسم (والمكرّر يُمنع)، والمنتج يُختار أو يُنشأ هنا (الموجود بالاسم نفسه يُختار لا يُكرَّر)، والمواد
//    بالبحث (المطابق بنوع آخر يُسمّى بنوعه) أو تُنشأ هنا مادّةً أوّلية، وسعر الشراء التلقائي وسعر الكلفة المكتوب (ويُحفظ بشرط
//    السابق)، وتكاليف الطنّ، والسطر الحيّ للمجموع، وكلفة الطنّ المتوقّعة، و«احفظ وفعّل» حين المجموع = الأساس، و«احفظ مسوّدة»
//    دائماً، بنداء create_recipe واحد، والإعادة بعد نتيجة مجهولة بالمعرّفين أنفسهما؛
// F2 «خلطة جديدة» تفتح البانية، و«أنتج» بكميات سريعة ثم صفحة الدفعة؛ F3 صفحة الدفعة المسوّدة: الفعلي يُعدَّل بشرط ما شافته الشاشة،
//    و«أضف مادّة» و«بدّل مادّة» بسبب إلزامي و«احذف» بتأكيد، وجدول التكاليف (المحسوب والمبلغ المعدَّل والمتاح وسطر جديد بفئة وحذف)،
//    و«المصاريف لا تكفي» بأرقامها وفعليها («سجّل مصروفاً» و«صفّر السطر»)؛ F4 مشغّل المعمل بلا مال؛ F5 المرحَّلة تقول أين ذهب الناتج
//    ورقم دفعته ومن أيّ وجبات سُحبت كلّ مادّة؛ F6 بطاقة الخلطة: أسعار المادّة وسعر الكلفة المكتوب، وتكاليف الطنّ تُضاف وتُعدَّل
//    وتُحذف في المسوّدة، وكلفة الطنّ المتوقّعة؛ F7 ولغير أدوار الكلفة لا سعر ولا تكاليف.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const MILL = [
  'loadMill', 'loadBuilder', 'loadRecipe', 'loadBatch', 'previewProduction', 'loadExpenseCategories', 'createRecipe', 'createProduction', 'addProductionInput',
  'deleteProductionInput', 'setInputActual', 'addBatchCost', 'setBatchCost', 'deleteBatchCost', 'addRecipeRate', 'setRecipeRate', 'deleteRecipeRate', 'activateVersion',
  'postProduction', 'confirmCosts', 'discardBatch', 'voidProduction', 'setBatchFields', 'addRecipeLine', 'setRecipeLine', 'deleteRecipeLine', 'createVersion', 'setVersionBasis',
];
const INVENTORY = ['listItems', 'createItem', 'loadItemPurchases', 'setItemCostPrice', 'findItemTwins'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__mill.call('${n}', a);`).join(' ')}`;
const STUBS = {
  mill: routed('mill', MILL),
  inventory: routed('inventory', INVENTORY),
  session: 'export const useSession = () => globalThis.__mill.session; export const sessionStore = { get: () => globalThis.__mill?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__mill.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'mill-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(mill|inventory)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'mill-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'mill-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
    "export { parseRecipe, parseBatch, parsePreview, parseRecipes } from './src/lib/repo/mill.ts';",
    "export { searchable } from './src/domain/normalize.ts';",
    "export { UnknownOutcomeError } from './src/lib/errors.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [stubs],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const text = () => body().textContent;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};
const click = async (node) => {
  fire(node, 'click');
  await settle();
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** البحث في المنتقي بعد مهلة الكتابة (250 ms). */
const search = async (value) => {
  const input = byAction('search-material').at(-1);
  type(input, value);
  await wait(320);
  await settle();
};
const disabled = (node) => node?.hasAttribute('disabled') ?? null;

const ws = (over = {}) => ({
  userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
  divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const itemRow = (id, name, kind, baseUnit = 'kg', density = null) => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [] });

// ─── أجوبة بشكل العقد ───────────────────────────────────────────────────────────────────────────────────────────
const recipeJson = (money) => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: [{ id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 5 }],
  selected: { id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', note: null, activated_at: null, version: 5 },
  lines: [
    { id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '600.000', unit: 'kg', mass_kg: '600.000', share_pct: '60.00', ...(money ? { money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' } } : {}) },
  ],
  mass_kg: '600.000',
  pick_items: [{ id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' }],
  expense_categories: [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }],
  ...(money
    ? { money: { rates: [{ id: 'rt-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', amount_per_ton: '15000.00' }], expected: { materials_per_ton: '270000.00', rates_per_ton: '15000.00', cost_per_ton: '285000.00', unpriced: 0 } } }
    : {}),
});
const batchLines = (posted, money) => [
  { id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '600.000', actual_qty: null, used_qty: posted ? '600.000' : null, in_basis: true, is_substitute: false, reason: null, replaced_item_name: null, ...(posted ? { draws: [{ lot_id: 'lot-1', qty: '600.000', received_on: '2026-10-20', source: 'RC-2026-0004' }] } : {}), ...(money ? { money: { value: posted ? '270000.00' : null } } : {}) },
  { id: 'in-2', line_no: 3, item_id: 'i-soy48', item_name: 'كسبة صويا 48٪', base_unit: 'kg', planned_qty: '300.000', actual_qty: null, used_qty: posted ? '300.000' : null, in_basis: true, is_substitute: true, reason: 'نفدت الكسبة 44٪', replaced_item_name: 'كسبة صويا 44٪', ...(money ? { money: { value: posted ? '279000.00' : null } } : {}) },
];
const batchJson = (status, money) => {
  const posted = status === 'posted';
  return {
    id: 'b-1', doc_no: posted ? 'PD-2026-0003' : null, status, version: 7, produced_on: '2026-11-04', planned_kg: '1000.000',
    output_qty_kg: posted ? '890.000' : null, output_expiry_on: null, input_mass_kg: posted ? '900.000' : null, shrink_kg: posted ? '10.000' : null, shrink_pct: null,
    shrink_reason: null, note: null, void_reason: null, costs_confirmed: posted,
    recipe: { id: 'r-1', name: 'علف بادئ', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
    output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: false },
    input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
    output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
    lines: batchLines(posted, money),
    ...(money
      ? {
          money: {
            input_value: posted ? '549000.00' : null, extra_value: posted ? '15000.00' : null, total_value: posted ? '564000.00' : null, cost_per_kg: posted ? '633.71' : null,
            costs: [{ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', allocations: posted ? [{ expense_id: 'e-1', on_date: '2026-11-01', amount: '15000.00', label: 'نقداً من الصندوق' }] : [] }],
          },
        }
      : {}),
  };
};
const previewJson = (money) => ({
  id: 'b-1', kind: 'production', status: 'draft', version: 7, produced_on: '2026-11-04', planned_kg: '1000.000', input_mass_kg: '900.000', output_qty_kg: '900.000',
  output_expiry_on: null, shrink_kg: '0.000', shrink_pct: '0.00', shrink_reason: null, shrink_ok: true, costs_confirmed: false,
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' }, output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: [
    { input_id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '600.000', actual_qty: null, draw_qty: '600.000', in_basis: true, tracks_expiry: false, ...(money ? { money: { value: '270000.00' } } : {}) },
    { input_id: 'in-2', line_no: 3, item_id: 'i-soy48', item_name: 'كسبة صويا 48٪', base_unit: 'kg', planned_qty: '300.000', actual_qty: null, draw_qty: '300.000', in_basis: true, tracks_expiry: false, ...(money ? { money: { value: '279000.00' } } : {}) },
  ],
  problems: money ? [{ code: 'costs_unfunded', category_id: 'c-labor', category_name: 'أيدي عاملة', need: '15000.00', have: '4000.00' }] : [{ code: 'costs_unfunded' }],
  can_post: false,
  plan_token: 'tok-7',
  ...(money
    ? { money: { input_value: '549000.00', extra_value: '15000.00', total_value: '564000.00', cost_per_kg: '626.67', costs: [{ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', available: '4000.00' }] } }
    : {}),
});

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__mill = {
        session,
        toasts: [],
        calls,
        call(name, args) {
          calls.push([name, args]);
          const handler = handlers[name];
          if (!handler) return new Promise(() => {});
          try {
            return Promise.resolve(handler(...args));
          } catch (error) {
            return Promise.reject(error);
          }
        },
      };
      return calls;
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);

    let root = null;
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        globalThis.__mill.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }), m.h(m.Route, { path: '*', element: null }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
      await settle();
    };
    const unmount = async () => {
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
        if (root) await unmount().catch(() => {});
      }
    };

    // ── F1: بانية الخلطة بشاشة واحدة ─────────────────────────────────────────────────────────────────────────────
    const catalog = [itemRow('i-corn', 'ذرة صفراء', 'raw'), itemRow('i-fc', 'ذرة', 'feed'), itemRow('i-soy', 'كسبة صويا', 'raw'), itemRow('i-oil', 'زيت', 'raw', 'L', 9_200n), itemRow('i-bag', 'كيس', 'packaging', 'pc')];
    const builderHandlers = (over = {}) => ({
      loadBuilder: () => ({ feedItems: [{ id: 'f-1', name: 'علف بادئ' }], recipeNames: ['علف قديم'], stores: [], categories: [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }] }),
      listItems: ({ search: query }) => ({ rows: catalog.filter((row) => m.searchable(row.name).includes(m.searchable(query))), total: null, next: null }),
      loadItemPurchases: (itemId) => ({
        item: { id: itemId, name: 'x', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: null, costPrice: itemId === 'i-corn' ? 450_00n : null },
        warehouse: null, today: '2026-11-04', next: null, total: 1,
        rows: itemId === 'i-corn' ? [{ money: { unitCost: 440_25n, invoiceTotal: 0n, landedValue: 0n, corrected: false } }] : [],
      }),
      createItem: (fields) => itemRow(`new-${fields.kind}-${fields.name}`, fields.name, fields.kind, fields.base_unit),
      setItemCostPrice: (itemId, price) => price,
      createRecipe: (input) => ({ id: input.id, versionId: input.versionId, versionNo: 1, status: input.activate ? 'active' : 'draft', lines: input.lines.length, rates: input.rates.length }),
      ...over,
    });
    await step('F1 البانية', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, builderHandlers());
      await mount('/mill/new');
      t.ok(text().includes('خلطة جديدة') && text().includes('لم تُضف مادّة بعد'), 'F1 البانية بشاشة واحدة: العنوان وجدول المواد الفارغ');
      t.same([disabled(byAction('save-activate')[0]), disabled(byAction('save-draft')[0])], [true, true], 'F1 بلا اسم ولا منتج: الحفظ معطّل');

      type(byAction('recipe-name')[0], 'علف قديم');
      await settle();
      t.ok(text().includes('توجد خلطة بهذا الاسم'), 'F1 الاسم المكرّر يُقال قبل الإرسال (recipe_name_taken)');
      type(byAction('recipe-name')[0], 'علف ناهٍ');
      await settle();

      // المنتج: الموجود بالاسم نفسه يُختار ولا يُنشأ ثانٍ، والجديد يُنشأ علفاً بالكيلوغرام.
      type(byAction('new-output-name')[0], ' علف بادئ ');
      await settle();
      await click(byAction('create-output')[0]);
      t.eq(named(calls, 'createItem').length, 0, 'F1 منتج بالاسم نفسه موجود: يُختار ولا يُنشأ توأم («ذراء»)');
      type(byAction('new-output-name')[0], 'علف ناهٍ 19٪');
      await settle();
      await click(byAction('create-output')[0]);
      t.same(named(calls, 'createItem').map(([fields]) => [fields.name, fields.kind, fields.base_unit]), [['علف ناهٍ 19٪', 'feed', 'kg']], 'F1 المنتج يُنشأ هنا باسمه: علف جاهز بالكيلوغرام');

      // المواد: «ذرة» تُظهر الصالحة، و«ذرة» بنوع علف تُسمّى بنوعها لا تُخفى.
      await search('ذرة');
      t.ok(text().includes('«ذرة» موجودة بنوع «علف»، فلا تدخل الخلطة مادّةً أوّلية.'), 'F1 مطابق الاسم بنوع آخر يُسمّى بنوعه ورابط بطاقته');
      t.ok(byAction('open-misfit')[0]?.getAttribute('href') === '/inventory/items/i-fc', 'F1 ورابط بطاقته لتصحيح نوعه');
      const picks = byAction('pick-material');
      t.same(picks.map((node) => node.textContent), ['ذرة صفراء · مادّة أوّلية · كغم'], 'F1 الصالح وحده زرّ إضافة (لا العلف)');
      t.ok(byAction('create-material').length === 1, 'F1 لا مطابق صالح بالاسم «ذرة» نفسه: «أنشئ» معروض');
      await click(picks[0]);
      t.same(named(calls, 'loadItemPurchases').map(([id]) => id), ['i-corn'], 'F1 سعر الشراء التلقائي يُقرأ للمادّة المضافة');
      t.ok(text().includes('440.25'), 'F1 سعر الشراء (آخر شراء) ظاهر');
      const costInput = byAction('cost-price')[0];
      t.eq(costInput?.value, '450.00', 'F1 سعر الكلفة المكتوب محفوظاً يبدأ به الحقل');

      await search('ذرة صفراء');
      t.ok(byAction('picker-already').length === 1 && byAction('create-material').length === 0 && byAction('pick-material').length === 0, 'F1 المادّة المكتوبة في الجدول: يُقال ذلك، ولا «أنشئ» ولا إضافة ثانية');

      // مادّة غير موجودة: «لا مادّة» و«أنشئها» مادّةً أوّلية.
      await search('صويا هندية');
      t.ok(text().includes('لا مادّة أوّلية باسم «صويا هندية» في منشأتك.'), 'F1 البحث بلا نتيجة يقول ذلك ولا يسكت');
      await click(byAction('create-material')[0]);
      t.same(named(calls, 'createItem').at(-1)?.[0]?.kind, 'raw', 'F1 المادّة تُنشأ هنا مادّةً أوّلية');
      t.eq(named(calls, 'loadItemPurchases').length, 1, 'F1 ولا قراءة سعر لمادّة أُنشئت الآن');
      t.ok(text().includes('صويا هندية') && byAction('line-qty').length === 2, 'F1 والسطر الثاني في الجدول');

      const [cornQty, soyQty] = byAction('line-qty');
      type(cornQty, '600');
      type(soyQty, '300');
      await settle();
      t.ok(byAction('builder-sum')[0]?.textContent.includes('ينقص 100 كغم'), `F1 السطر الحيّ: المجموع وما ينقص (${byAction('builder-sum')[0]?.textContent})`);
      t.same([disabled(byAction('save-activate')[0]), disabled(byAction('save-draft')[0])], [true, false], 'F1 المجموع ≠ الأساس: «احفظ وفعّل» معطّل و«احفظ مسوّدة» يعمل');
      type(soyQty, '400');
      await settle();
      t.ok(byAction('builder-sum')[0]?.textContent.includes('= الأساس'), 'F1 المجموع = الأساس');
      t.eq(disabled(byAction('save-activate')[0]), false, 'F1 «احفظ وفعّل» يعمل حين المجموع = الأساس');

      // تكاليف الطنّ وكلفة الطنّ المتوقّعة (للتخطيط).
      await click(byAction('add-rate')[0]);
      choose(byAction('rate-category')[0], 'c-labor');
      type(byAction('rate-amount')[0], '15,000');
      await settle();
      t.ok(byAction('planned-cost')[0]?.textContent.includes('كلفة الطنّ المتوقّعة: 285,000.00 على الأقلّ') && text().includes('ومنها 1 بلا سعر'), `F1 كلفة الطنّ المتوقّعة: المسعَّر وحده ومعه عدد غير المسعَّر (${byAction('planned-cost')[0]?.textContent})`);
      const soyCost = byAction('cost-price')[1];
      type(soyCost, '900');
      await settle();
      t.ok(byAction('planned-cost')[0]?.textContent.includes('كلفة الطنّ المتوقّعة: 645,000.00 (الكيلو 645.00)'), `F1 سعر الكلفة المكتوب يدخل التقدير حيّاً (${byAction('planned-cost')[0]?.textContent})`);
      await click(byAction('cost-price-save')[0]);
      t.same(named(calls, 'setItemCostPrice'), [['new-raw-صويا هندية', 900_00n, null]], 'F1 حفظ سعر الكلفة بشرط السابق (لا سعر سابق)');

      await click(byAction('save-activate')[0]);
      const created = named(calls, 'createRecipe');
      t.eq(created.length, 1, 'F1 الحفظ نداء create_recipe واحد');
      const input = created[0][0];
      t.same(
        [input.name, input.outputItemId, input.basisKg, input.lines, input.rates, input.activate],
        ['علف ناهٍ', 'new-feed-علف ناهٍ 19٪', 1_000_000n, [{ itemId: 'i-corn', qty: 600_000n, unit: 'kg' }, { itemId: 'new-raw-صويا هندية', qty: 400_000n, unit: 'kg' }], [{ categoryId: 'c-labor', amountPerTon: 15_000_00n }], true],
        'F1 الاسم والمنتج المُنشأ والأساس والسطور والتكاليف والتفعيل بنداء واحد',
      );
      t.ok(/^[0-9a-f-]{36}$/u.test(input.id) && /^[0-9a-f-]{36}$/u.test(input.versionId) && input.id !== input.versionId, 'F1 المعرّفان من الجهاز');
      t.eq(globalThis.__mill.location, `/mill/recipe/${input.id}`, 'F1 بعد الحفظ تُفتح بطاقة الخلطة');
      await unmount();
    });

    await step('F1 المسوّدة والإعادة', async () => {
      let attempt = 0;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          createRecipe: (input) => {
            attempt += 1;
            if (attempt === 1) throw new m.UnknownOutcomeError();
            return { id: input.id, versionId: input.versionId, versionNo: 1, status: 'draft', lines: input.lines.length, rates: 0 };
          },
        }),
      );
      await mount('/mill/new');
      type(byAction('recipe-name')[0], 'علف تجريبي');
      choose(byAction('recipe-output')[0], 'f-1');
      await settle();
      await search('زيت');
      await click(byAction('pick-material')[0]);
      t.ok(byAction('line-unit').length === 1, 'F1 السائل يُكتب باللتر أو بالكيلوغرام');
      type(byAction('line-qty')[0], '10');
      await settle();
      t.eq(byAction('builder-sum')[0]?.textContent, 'المجموع 9.2 كغم من 1.000 طن: ينقص 990.8 كغم.', 'F1 عشرة لترات من زيت كثافته 0.92 = 9.2 كغم في المجموع');
      await click(byAction('save-draft')[0]);
      t.ok(text().includes('نتيجة العملية غير معروفة'), 'F1 نتيجة مجهولة تُقال');
      await click(byAction('save-draft')[0]);
      const [first, second] = named(calls, 'createRecipe').map(([input]) => input);
      t.same([second?.id, second?.versionId, second?.activate, second?.lines], [first?.id, first?.versionId, false, [{ itemId: 'i-oil', qty: 10_000n, unit: 'L' }]], 'F1 الإعادة بعد نتيجة مجهولة بالمعرّفين أنفسهما (لا خلطة ثانية)، والمسوّدة بلا تفعيل');
      await unmount();
    });

    // ── F2: «خلطة جديدة» و«أنتج» بكميات سريعة ───────────────────────────────────────────────────────────────────
    const card = (over = {}) => ({
      id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 1, output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed' },
      active: { id: 'v-1', version_no: 1, basis_kg: '1000.000', lines: 2, pieces: [{ item_id: 'i-corn', item_name: 'ذرة صفراء', mass_kg: '600.000' }, { item_id: 'i-soy', item_name: 'كسبة صويا', mass_kg: '400.000' }] },
      draft: null, batches: 0, last_batch: null, money: { expected_cost_per_kg: '285.00' }, ...over,
    });
    const millHome = (recipes) => ({
      today: '2026-11-04',
      recipes: m.parseRecipes({ today: '2026-11-04', recipes, stores: [], feed_items: [] }),
      stores: [{ id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw' }, { id: 'w-feed', name: 'مخزن العلف', kind: 'feed' }],
      feedItems: [],
      productions: { drafts: [], rows: [], total: 0 },
    });
    await step('F2 المعمل', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, { loadMill: () => millHome([card()]), createProduction: () => ({ id: 'x' }) });
      await mount('/mill');
      t.ok(text().includes('كلفة الكيلو المتوقّعة285.00'), 'F2 بطاقة لم تُنتج بعد: كلفة الكيلو المتوقّعة');
      await click(byAction('produce')[0]);
      const quick = byAction('quick-qty');
      t.same(quick.map((node) => node.textContent), ['نصف طنّ', 'طنّ', 'طنّان', '5 أطنان'], 'F2 أربع كميات سريعة');
      await click(quick[2]);
      t.eq(byAction('produce-qty')[0]?.value, '2,000', 'F2 «طنّان» تكتب 2,000 كغم في الحقل');
      t.ok(text().includes('أي 2.000 طن'), 'F2 والتحويل حيّ تحت الحقل');
      await click(byAction('produce-start')[0]);
      const [batchId, versionId, kg, from, to, day] = named(calls, 'createProduction')[0] ?? [];
      t.same([versionId, kg, from, to, day], ['v-1', 2_000_000n, 'w-raw', 'w-feed', '2026-11-04'], 'F2 create_production بالكمية المختارة ومخزني المعمل ويوم الخادم');
      t.eq(globalThis.__mill.location, `/mill/batch/${batchId}`, 'F2 ثم صفحة الدفعة');
      await unmount();

      fresh({ status: 'ready', workspace: ws() }, { loadMill: () => millHome([]) });
      await mount('/mill');
      await click(byAction('add-recipe')[0]);
      t.eq(globalThis.__mill.location, '/mill/new', 'F2 «خلطة جديدة» تفتح البانية بشاشة واحدة (لا نافذة الاسم والمنتج)');
      await unmount();
    });

    // ── F3: صفحة الدفعة المسوّدة (المدير: مواد وتكاليف) ────────────────────────────────────────────────────────────
    const batchHandlers = (status, money, over = {}) => ({
      loadBatch: () => m.parseBatch(batchJson(status, money)),
      previewProduction: () => m.parsePreview(previewJson(money)),
      loadExpenseCategories: () => [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }],
      listItems: ({ search: query }) => ({ rows: [itemRow('i-corn', 'ذرة صفراء', 'raw'), itemRow('i-soy48', 'كسبة صويا 48٪', 'raw'), itemRow('i-soy44', 'كسبة صويا 44٪', 'raw')].filter((row) => m.searchable(row.name).includes(m.searchable(query))), total: null, next: null }),
      setInputActual: () => undefined,
      addProductionInput: (input) => ({ id: input.id, lineNo: 9, version: 8 }),
      deleteProductionInput: () => ({ deleted: true }),
      setBatchCost: () => undefined,
      addBatchCost: () => undefined,
      deleteBatchCost: () => ({ deleted: true }),
      ...over,
    });
    await step('F3 الدفعة المسوّدة', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, batchHandlers('draft', true));
      await mount('/mill/batch/b-1');
      t.ok(byAction('substitute-note')[0]?.textContent === 'بديل عن «كسبة صويا 44٪»: نفدت الكسبة 44٪', 'F3 البديل يقول ما حلّ محلّه وسببه');
      // الفعلي يُعدَّل بشرط ما شافته الشاشة.
      const actual = byAction('input-actual')[0];
      type(actual, '610');
      await settle();
      await click(byAction('input-actual-save')[0]);
      t.same(named(calls, 'setInputActual'), [['in-1', null, 610_000n]], 'F3 الكمية الفعلية بشرط السابق («كما خُطّط» = null)');
      t.eq(named(calls, 'loadBatch').length, 2, 'F3 ثم قراءة الدفعة من جديد');

      // «بدّل»: المنتقي بلا مواد الدفعة، والسبب إلزامي.
      await click(byAction('replace-input')[0]);
      await search('صويا');
      t.same(byAction('pick-material').map((node) => node.textContent.split(' · ')[0]), ['كسبة صويا 44٪'], 'F3 المنتقي لا يعرض مادّة مكتوبة في الدفعة');
      await click(byAction('pick-material')[0]);
      type(byAction('input-qty')[0], '600');
      await settle();
      t.eq(disabled(byAction('input-save')[0]), true, 'F3 التبديل بلا سبب معطّل (القاعدة ١٩)');
      type(byAction('input-reason')[0], 'نفدت الذرة');
      await settle();
      await click(byAction('input-save')[0]);
      const replaced = named(calls, 'addProductionInput')[0]?.[0];
      t.same([replaced?.batchId, replaced?.itemId, replaced?.qty, replaced?.replaces, replaced?.reason], ['b-1', 'i-soy44', 600_000n, 'in-1', 'نفدت الذرة'], 'F3 add_production_input بالسطر المبدَّل وسببه');

      // «أضف مادّة» بلا تبديل.
      await click(byAction('add-input')[0]);
      await search('صويا 44');
      await click(byAction('pick-material')[0]);
      type(byAction('input-qty')[0], '25');
      await settle();
      t.ok(byAction('input-reason').length === 0, 'F3 الإضافة بلا حقل سبب');
      await click(byAction('input-save')[0]);
      const added = named(calls, 'addProductionInput')[1]?.[0];
      t.same([added?.itemId, added?.qty, added?.replaces, added?.reason], ['i-soy44', 25_000n, null, null], 'F3 الإضافة بلا سطر مبدَّل ولا سبب');

      // «احذف» بتأكيد يسمّي المادّة.
      await click(byAction('remove-input')[1]);
      t.ok(text().includes('حذف «كسبة صويا 48٪» من الدفعة؟'), 'F3 تأكيد الحذف يسمّي المادّة');
      await click(byAction('confirm-remove-input')[0]);
      t.same(named(calls, 'deleteProductionInput'), [['in-2', 7]], 'F3 الحذف بنسخة الدفعة');

      // جدول التكاليف: المحسوب والمتاح، والمبلغ يُعدَّل بشرط السابق، وسطر جديد بفئة، والحذف بتأكيد.
      t.ok(text().includes('المتاح من المصاريف') && text().includes('4,000.00') && text().includes('المحسوب من الخلطة'), 'F3 لكلّ سطر تكاليف المحسوب والمتاح من المصاريف');
      type(byAction('cost-amount')[0], '9000');
      await settle();
      await click(byAction('cost-amount-save')[0]);
      t.same(named(calls, 'setBatchCost'), [['pc-1', 15_000_00n, 9_000_00n]], 'F3 المبلغ بشرط ما شافته الشاشة');
      choose(byAction('new-cost-category')[0], 'c-power');
      type(byAction('new-cost-amount')[0], '2500');
      await settle();
      await click(byAction('add-cost')[0]);
      const cost = named(calls, 'addBatchCost')[0];
      t.same([cost?.[0], cost?.[2], cost?.[3]], ['b-1', 'c-power', 2_500_00n], 'F3 سطر تكاليف يدوي بفئة ومبلغ');
      t.ok(/^[0-9a-f-]{36}$/u.test(cost?.[1] ?? ''), 'F3 بمعرّف الجهاز');

      // «المصاريف لا تكفي» بأرقامها وفعليها.
      t.ok(text().includes('«أيدي عاملة»: المطلوب 15,000.00 والمتاح من المصاريف المسجّلة 4,000.00.'), 'F3 costs_unfunded بجملة تسمّي الفئة والمطلوب والمتاح');
      t.eq(byAction('record-expense')[0]?.getAttribute('href'), '/accounts/expenses?new=1', 'F3 «سجّل مصروفاً» يفتح نافذة المصروف الجديد');
      await click(byAction('zero-cost')[0]);
      t.same(named(calls, 'setBatchCost').at(-1), ['pc-1', 15_000_00n, 0n], 'F3 «صفّر السطر» يكتب صفراً بشرط المبلغ المعروض');
      await click(byAction('remove-cost')[0]);
      await click(byAction('confirm-remove-cost')[0]);
      t.same(named(calls, 'deleteBatchCost'), [['pc-1', 7]], 'F3 حذف سطر التكاليف بنسخة الدفعة');
      t.ok(text().includes('قيمة المواد') && text().includes('التكاليف') && text().includes('626.67'), 'F3 الكلفة الكلّية مواد + تكاليف وكلفة الكيلو');
      await unmount();
    });

    // ── F4: مشغّل المعمل بلا مال ─────────────────────────────────────────────────────────────────────────────────
    await step('F4 مشغّل المعمل', async () => {
      const calls = fresh({ status: 'ready', workspace: ws({ role: 'mill_operator', canSeeCost: false, canSeeAccounts: false, canSeeSales: false }) }, batchHandlers('draft', false));
      await mount('/mill/batch/b-1');
      t.ok(!text().includes('القيمة') && !text().includes('المتاح من المصاريف') && byAction('cost-amount').length === 0, 'F4 لا عمود قيمة ولا جدول تكاليف');
      t.ok(text().includes('تكاليف الدفعة أكبر من المتاح') && byAction('zero-cost').length === 0 && byAction('record-expense').length === 0, 'F4 «المصاريف لا تكفي» بلا أرقام ولا أفعال مال');
      t.ok(byAction('input-actual').length === 2 && byAction('add-input').length === 1, 'F4 والمواد تُعدَّل له (production.draft)');
      t.eq(named(calls, 'loadExpenseCategories').length, 0, 'F4 ولا قراءة لفئات المصاريف');
      await unmount();
    });

    // ── F5: المرحَّلة: أين ذهب الناتج ومن أين سُحبت كلّ مادّة ─────────────────────────────────────────────────────────
    await step('F5 التتبّع', async () => {
      fresh({ status: 'ready', workspace: ws() }, batchHandlers('posted', true));
      await mount('/mill/batch/b-1');
      t.ok(text().includes('دخل الناتج 890 كغم من «علف بادئ» مخزن «مخزن العلف» بدفعة PD-2026-0003.'), 'F5 الناتج: كميته ومخزنه ورقم دفعته');
      t.eq(byAction('open-output-lots')[0]?.getAttribute('href'), '/inventory/items/f-1?wh=w-feed&tab=lots', 'F5 ورابط وجبات العلف في مخزنه');
      t.ok(text().includes('«RC-2026-0004» (20/10/2026): 600 كغم'), 'F5 المادّة تقول من أيّ وجبة سُحبت وكميتها');
      t.eq(byAction('open-item-ledger')[0]?.getAttribute('href'), '/inventory/items/i-soy48?wh=w-raw&tab=moves', 'F5 وبلا وجبات من الخادم: رابط دفتر المادّة في مخزن المدخلات');
      t.ok(text().includes('01/11/2026 · نقداً من الصندوق: 15,000.00'), 'F5 كلّ سطر تكاليف يقول من أيّ مصروف حُمّل');
      t.ok(byAction('input-actual').length === 0 && byAction('cost-amount').length === 0, 'F5 المرحَّلة لا تُعدَّل');
      await unmount();
    });

    // ── F6: بطاقة الخلطة: الأسعار وتكاليف الطنّ وكلفة الطنّ المتوقّعة ───────────────────────────────────────────────
    const recipeHandlers = (money) => ({
      loadRecipe: () => m.parseRecipe(recipeJson(money)),
      setItemCostPrice: (itemId, price) => price,
      setRecipeRate: () => undefined,
      addRecipeRate: () => undefined,
      deleteRecipeRate: () => ({ deleted: true }),
    });
    await step('F6 بطاقة الخلطة', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, recipeHandlers(true));
      await mount('/mill/recipe/r-1');
      t.ok(text().includes('سعر الشراء (آخر شراء)') && text().includes('440.25') && text().includes('متوسّط المتاح') && text().includes('430.50'), 'F6 سعر الشراء التلقائي ومتوسّط المتاح');
      t.ok(byAction('expected-cost')[0]?.textContent.includes('كلفة الطنّ المتوقّعة: 285,000.00'), 'F6 كلفة الطنّ المتوقّعة من الخادم');
      const price = byAction('cost-price')[0];
      t.eq(price?.value, '450.00', 'F6 سعر الكلفة المكتوب في حقله');
      type(price, '470');
      await settle();
      await click(byAction('cost-price-save')[0]);
      t.same(named(calls, 'setItemCostPrice'), [['i-corn', 470_00n, 450_00n]], 'F6 سعر الكلفة يُحفظ بشرط السعر الذي شافته الشاشة');
      t.eq(named(calls, 'loadRecipe').length, 2, 'F6 ثم تُقرأ البطاقة من جديد (كلفة الطنّ بالسعر الجديد من الخادم)');
      const amount = byAction('rate-amount')[0];
      t.eq(amount?.value, '15000.00', 'F6 مبلغ تكلفة الطنّ في المسوّدة قابل للكتابة');
      type(amount, '16000');
      await settle();
      await click(byAction('rate-amount-save')[0]);
      t.same(named(calls, 'setRecipeRate'), [['rt-1', 15_000_00n, 16_000_00n]], 'F6 تعديل التكلفة بشرط المبلغ السابق');
      const category = byAction('new-rate-category')[0];
      t.same(category?.options.map((option) => option.value), ['', 'c-power'], 'F6 فئة مكتوبة لا تُعرض ثانية');
      choose(category, 'c-power');
      type(byAction('new-rate-amount')[0], '5000');
      await settle();
      await click(byAction('add-rate')[0]);
      const rate = named(calls, 'addRecipeRate')[0];
      t.same([rate?.[0], rate?.[2], rate?.[3]], ['v-2', 'c-power', 5_000_00n], 'F6 تكلفة جديدة لكلّ طنّ بفئتها');
      await click(byAction('remove-rate')[0]);
      t.ok(text().includes('حذف تكلفة «أيدي عاملة» من الخلطة؟'), 'F6 تأكيد الحذف يسمّي التكلفة');
      await click(byAction('confirm-remove-rate')[0]);
      t.same(named(calls, 'deleteRecipeRate'), [['rt-1', 5]], 'F6 الحذف بنسخة النسخة');
      await unmount();
    });

    // ── F7: لغير أدوار الكلفة لا سعر ولا تكاليف ──────────────────────────────────────────────────────────────────────
    await step('F7 بلا كلفة', async () => {
      fresh({ status: 'ready', workspace: ws({ role: 'mill_operator', canSeeCost: false, canSeeAccounts: false, canSeeSales: false }) }, recipeHandlers(false));
      await mount('/mill/recipe/r-1');
      t.ok(text().includes('ذرة صفراء') && !text().includes('سعر الشراء') && !text().includes('تكاليف لكلّ طنّ') && byAction('cost-price').length === 0, 'F7 مشغّل المعمل: المواد بلا أسعار ولا تكاليف');
      await unmount();
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
