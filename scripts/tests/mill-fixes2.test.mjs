// الجولة الثانية من إصلاحات شاشات المعمل (القسم «ب» من fixes2.md، ب١–ب١٤): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// MillRoutes الحقيقية، وrepo المعمل والمخزون والجلسة والرسائل بدائل، والمحلّلات الحقيقية تقرأ أجوبة بشكل القسم «أ» (expenses_visible
// وscope وpieces[].in_basis ومشكلتا costs_unsealed_scope وno_mass_inputs). كلّ حالة تفشل على نسخة 203bacb من الشاشات:
// Y1 مشغّل المعمل يرى «أنتج الآن» بعد ختم الكلف (ب١)؛ Y2 التكاليف وختمها وتسجيل المصروف والفئة الجديدة لمن يرى مصاريف وحدة المدخلات،
// والمشكلتان الجديدتان بجملتيهما، ومشكلة التاريخ بجملة الخادم (ب٢ والتكامل)؛ Y3 طرفا الدفعة في النطاق: الروابط والإلغاء والمسوّدة من طرف العلف (ب٣)؛ Y4 «سجّل مصروفاً»
// يسأل قبل أن يضيّع مكتوباً (ب٤)؛ Y5 سبب الهدر يبدأ من المحفوظ ولا يمسحه حفظ الوزن (ب٥)؛ Y6 تاريخ انتهاء الناتج يُكتب ويُحلّ به
// expiry_required فتُرحَّل الدفعة (ب٦)؛ Y7 الملغاة «أُوقف تحميلها بالإلغاء» (ب٧)؛ Y8 شريط التركيبة ورقاقاته بلا ما هو خارج الكتلة (ب٨)؛
// Y9 عمود الكتلة في بطاقة الخلطة = مجموعه على جواب بشكل القاعدة ومحلّله الحقيقي (ب٩)؛ Y10 «نسخة جديدة» تبدأ من المفعَّلة (ب١٠)؛
// Y11 نصّ «فئة جديدة» يبقى بعد حفظ آخر، وcategory_name_taken بتلميحه (ب١١)؛ Y12 البانية مقفولة أثناء الحفظ (ب١٢)؛ Y13 الخلية
// الممسوحة لا تحذف السعر (ب١٣)؛ Y14 بعد نتيجة مجهولة تتجمّد البانية والإعادة بالحمولة نفسها (ب١٤)؛ Q المحلّلات الصارمة للمفاتيح الجديدة.
// الجولة الثالثة (ب٢٥): قائمة الحقول المقفولة في Y12 وY14 تزيد خانات جدول «تكاليف لكلّ طنّ» (الفئة والمبلغ و«احذف») ووحدة السطر لتر/كغم،
// بسطر تكلفة ومادّة باللتر (fillBuilderLocked).
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
  'newRecipeVersion', 'loadMillStores',
];
const INVENTORY = ['listItems', 'createItem', 'loadItemPurchases', 'setItemCostPrice', 'findItemTwins', 'loadItem', 'updateItem', 'createExpenseCategory'];
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

const OPTIONS = {
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
};
const load = async (contents, plugins) => {
  const result = await build({ ...OPTIONS, stdin: { contents, resolveDir: ROOT, loader: 'tsx' }, plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

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
/** نقرة يسار كما في المتصفّح (button = 0): Link من react-router لا ينتقل بغيرها. */
const clickLink = async (node) => {
  fire(node, 'click', { button: 0 });
  await settle();
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const search = async (value) => {
  const input = byAction('search-material').at(-1);
  type(input, value);
  await wait(320);
  await settle();
};
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
const buttonByText = (label) => all().find((n) => n.localName === 'button' && n.textContent === label) ?? null;
/** جدول DataTable بعنوانه (caption): رؤوس الأعمدة، وخلايا كلّ صفّ، وخلايا صفّ المجموع. */
const tableOf = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
  if (!table) return null;
  const inside = descendants(table);
  const section = (tag) => inside.find((n) => n.localName === tag) ?? null;
  const rowsOf = (node) => (node ? descendants(node).filter((n) => n.localName === 'tr') : []);
  const headers = rowsOf(section('thead'))[0]?.children.map((n) => n.textContent) ?? [];
  const rows = rowsOf(section('tbody')).map((tr) => tr.children.map((n) => n.textContent));
  const foot = rowsOf(section('tfoot'))[0]?.children ?? [];
  // صفّ المجموع: عنوانه th يمتدّ على الأعمدة الأولى، فخلية العمود i هي td رقم i − (عدد الأعمدة − عدد خلايا td).
  const footCells = foot.filter((n) => n.localName === 'td').map((n) => n.textContent);
  const footAt = (index) => footCells[index - (headers.length - footCells.length)] ?? null;
  return { headers, rows, footAt };
};
const number = (cell) => (/^-?[\d,]+(\.\d+)?$/u.test(cell ?? '') ? Number(cell.replace(/,/gu, '')) : null);

const ws = (over = {}) => ({
  userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
  divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const itemRow = (id, name, kind, baseUnit = 'kg', density = null, over = {}) => ({
  id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [], ...over,
});

// ─── أجوبة بشكل القسم «أ» ─────────────────────────────────────────────────────────────────────────────────────────
const batchLine = (over = {}) => ({
  id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, used_qty: null, in_basis: true,
  is_substitute: false, reason: null, replaced_item_name: null, draws: null, money: { value: null }, ...over,
});
const batchJson = ({ status = 'draft', lines = null, costs = [], expensesVisible = true, scope = { input: true, output: true }, costsConfirmed = null, over = {} } = {}) => {
  const posted = status !== 'draft';
  return {
    id: 'b-1', doc_no: posted ? 'PD-2026-0003' : null, status, version: 7, produced_on: '2026-11-04', planned_kg: '1000.000',
    output_qty_kg: posted ? '990.000' : null, output_expiry_on: null, input_mass_kg: posted ? '1000.000' : null,
    shrink_kg: posted ? '10.000' : null, shrink_pct: null, shrink_reason: null, note: null, void_reason: status === 'void' ? 'إلغاء دفعة إنتاج' : null,
    costs_confirmed: costsConfirmed ?? posted,
    recipe: { id: 'r-1', name: 'علف بادئ', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
    output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: false },
    input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
    output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
    lines: lines ?? [batchLine(posted ? { used_qty: '1000.000', draws: [] } : {})],
    expenses_visible: expensesVisible,
    scope,
    money: {
      input_value: posted ? '450000.00' : null, extra_value: posted ? '15000.00' : null,
      total_value: posted ? '465000.00' : null, cost_per_kg: posted ? '469.70' : null, costs,
    },
    ...over,
  };
};
const detailCost = (over = {}) => ({ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', allocations: [], ...over });
const previewJson = ({ problems = [], costs = [], canPost = null, expensesVisible = true, costsConfirmed = false, money = true } = {}) => ({
  id: 'b-1', kind: 'production', status: 'draft', version: 7, produced_on: '2026-11-04', planned_kg: '1000.000', input_mass_kg: '1000.000', output_qty_kg: '1000.000',
  output_expiry_on: null, shrink_kg: '0.000', shrink_pct: '0.00', shrink_reason: null, shrink_ok: true, costs_confirmed: costsConfirmed,
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', division_id: 'd-mill', division_name: 'معمل العلف' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: [{ input_id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, draw_qty: '1000.000', in_basis: true, tracks_expiry: false, ...(money ? { money: { value: '450000.00' } } : {}) }],
  problems,
  can_post: canPost ?? problems.length === 0,
  plan_token: 'tok-7',
  expenses_visible: expensesVisible,
  ...(money ? { money: { input_value: '450000.00', extra_value: '15000.00', total_value: '465000.00', cost_per_kg: '465.00', costs } } : {}),
});
const previewCost = (over = {}) => ({ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', available: '4000.00', ...over });
const recipeLine = (over = {}) => ({
  id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '1000.000', unit: 'kg',
  mass_kg: '1000.000', share_pct: '100.00', in_basis: true, unit_changed: false, unit_mismatch: false, money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' }, ...over,
});
const recipeJson = ({ status = 'draft', versionId = 'v-1', versionNo = 1, versions = null, lines = [recipeLine()], massKg = '1000.000', rates = [] } = {}) => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: versions ?? [{ id: versionId, version_no: versionNo, status, basis_kg: '1000.000', activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version: 5 }],
  selected: { id: versionId, version_no: versionNo, status, basis_kg: '1000.000', note: null, activated_at: null, version: 5 },
  lines,
  mass_kg: massKg,
  pick_items: [{ id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' }],
  expense_categories: [{ id: 'c-labor', name: 'أيدي عاملة' }],
  money: { rates, expected: { materials_per_ton: '450000.00', rates_per_ton: '0.00', cost_per_ton: '450000.00', unpriced: 0 } },
});
const piece = (id, name, mass, inBasis = true) => ({ item_id: id, item_name: name, mass_kg: mass, in_basis: inBasis });
const overview = (pieces) => ({
  today: '2026-11-04',
  recipes: [
    {
      id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 1,
      output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed' },
      active: { id: 'v-1', version_no: 1, basis_kg: '1000.000', lines: pieces.length, pieces },
      draft: null, batches: 0, last_batch: null, money: { expected_cost_per_kg: '450.00' },
    },
  ],
  stores: [{ id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw' }, { id: 'w-feed', name: 'مخزن العلف', kind: 'feed' }],
  feed_items: [],
});

export default async function (t) {
  const restore = installDom();
  try {
    const m = await load(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
        "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
        "export { parseRecipe, parseBatch, parsePreview, parseRecipes } from './src/lib/repo/mill.ts';",
        "export { searchable } from './src/domain/normalize.ts';",
        "export { UnknownOutcomeError, RejectedError, NetworkError } from './src/lib/errors.ts';",
      ].join('\n'),
      [stubs],
    );
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
      }
      if (root) {
        await unmount().catch(() => {});
        root = null;
      }
    };
    const batchHandlers = (over = {}) => ({
      loadBatch: () => m.parseBatch(batchJson()),
      previewProduction: () => m.parsePreview(previewJson()),
      loadExpenseCategories: () => [{ id: 'c-labor', name: 'أيدي عاملة' }],
      ...over,
    });

    // ── Y1 (ب١): مشغّل المعمل يرى «أنتج الآن» بعد الختم، ولا يراه قبله ────────────────────────────────────────────────────
    const miller = ws({ role: 'mill_operator', canSeeCost: false, canSeeAccounts: false, canSeeSales: false });
    await step('Y1 قبل الختم', async () => {
      fresh(
        { status: 'ready', workspace: miller },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ expensesVisible: false, costsConfirmed: false })),
          previewProduction: () => m.parsePreview(previewJson({ problems: [{ code: 'costs_pending' }], expensesVisible: false, money: false })),
        }),
      );
      await mount('/mill/batch/b-1');
      t.eq(byAction('post-production').length, 0, 'Y1 مشغّل المعمل قبل ختم الكلف: لا «أنتج الآن»');
    });
    await step('Y1 بعد الختم', async () => {
      const calls = fresh(
        { status: 'ready', workspace: miller },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ expensesVisible: false, costsConfirmed: true })),
          previewProduction: () => m.parsePreview(previewJson({ expensesVisible: false, costsConfirmed: true, money: false })),
          postProduction: () => ({ doc_no: 'PD-2026-0003' }),
        }),
      );
      await mount('/mill/batch/b-1');
      const button = byAction('post-production')[0];
      t.same([Boolean(button), disabled(button)], [true, false], 'Y1 بعد ختم الكلف والمعاينة تقول can_post: «أنتج الآن» ظاهر ومفعَّل لمشغّل المعمل');
      if (button) await click(button);
      t.same(named(calls, 'postProduction').map(([batchId, version, plan]) => [batchId, version, plan]), [['b-1', 7, 'tok-7']], 'Y1 ويرحّل ببصمة المعاينة');
    });

    // ── Y2 (ب٢): التكاليف لمن يرى مصاريف وحدة المدخلات وحده، والمشكلتان الجديدتان ────────────────────────────────────────────
    const accountant = ws({ role: 'accountant', canSeeAccounts: true });
    await step('Y2 محاسب لا يرى الوحدة', async () => {
      fresh(
        { status: 'ready', workspace: accountant },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()], expensesVisible: false })),
          previewProduction: () =>
            m.parsePreview(
              previewJson({
                costs: [previewCost({ available: null })],
                // أرقام مع رمز لا يراه القارئ: الشاشة تحجب أفعال المال بـexpenses_visible لا بغياب الأرقام وحده.
                problems: [{ code: 'costs_unsealed_scope', division_name: 'معمل العلف' }, { code: 'costs_unfunded', category_id: 'c-labor', category_name: 'أيدي عاملة', need: '15000.00', have: '4000.00' }],
                canPost: false,
                expensesVisible: false,
              }),
            ),
        }),
      );
      await mount('/mill/batch/b-1');
      t.ok(text().includes('تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «معمل العلف» خارج نطاقك: يختمها محاسب أو مدير يرى تلك الوحدة، ثمّ تُرحَّل.'), 'Y2 costs_unsealed_scope بجملة تسمّي الوحدة');
      t.same(
        ['cost-amount', 'add-cost', 'remove-cost', 'new-category-name', 'seal-costs', 'record-expense', 'zero-cost'].map((name) => byAction(name).length),
        [0, 0, 0, 0, 0, 0, 0],
        'Y2 بلا expenses_visible: لا تعديل مبلغ ولا سطر جديد ولا حذف ولا فئة جديدة ولا ختم ولا «سجّل مصروفاً» ولا «صفّر السطر»',
      );
      t.ok(byAction('costs-out-of-scope')[0]?.textContent === 'تُحمَّل هذه التكاليف من مصاريف وحدة «معمل العلف» خارج نطاقك: يكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.', 'Y2 وتحت جدول التكاليف جملة تقول من يكتبها ويختمها');
      const post = byAction('post-production')[0];
      t.same([Boolean(post), disabled(post)], [true, true], 'Y2 «أنتج الآن» للمحاسب معطّل قبل الختم (can_post = false)');
    });
    await step('Y2 الكتلة', async () => {
      fresh({ status: 'ready', workspace: ws() }, batchHandlers({ previewProduction: () => m.parsePreview(previewJson({ problems: [{ code: 'no_mass_inputs' }], canPost: false })) }));
      await mount('/mill/batch/b-1');
      t.ok(text().includes('الدفعة بلا مادّة داخل الكتلة: أضف مادّة أوّلية؛ الوقود والتعبئة وحدهما لا يصنعان علفاً.'), 'Y2 no_mass_inputs بجملته');
    });
    await step('Y2 التاريخ', async () => {
      // مشكلة التاريخ (التكامل، private.date_problem منذ 0015): الصفحة لا تغيّر يوم الدفعة فالمسوّدة تكبر عليه، والخادم يرسل الرمز وجملته
      // بتاريخها؛ فتُعرض جملته لا «مشكلة في الدفعة: date_too_old».
      fresh({ status: 'ready', workspace: ws() }, batchHandlers({ previewProduction: () => m.parsePreview(previewJson({ problems: [{ code: 'date_too_old', hint: 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 05/11/2026.' }], canPost: false })) }));
      await mount('/mill/batch/b-1');
      t.same([text().includes('لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 05/11/2026.'), text().includes('date_too_old')], [true, false], 'Y2 مشكلة التاريخ بجملة الخادم لا برمزها الخام');
    });
    await step('Y2 المدير يرى الوحدة', async () => {
      fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()] })),
          previewProduction: () => m.parsePreview(previewJson({ costs: [previewCost()], problems: [{ code: 'costs_unfunded', category_id: 'c-labor', category_name: 'أيدي عاملة', need: '15000.00', have: '4000.00' }] })),
        }),
      );
      await mount('/mill/batch/b-1');
      t.same(
        ['cost-amount', 'add-cost', 'remove-cost', 'new-category-name', 'seal-costs', 'record-expense', 'zero-cost', 'costs-out-of-scope'].map((name) => byAction(name).length),
        [1, 1, 1, 1, 1, 1, 1, 0],
        'Y2 ضابط: من يرى الوحدة يكتب التكاليف ويختمها ويسجّل المصروف، ولا جملة «خارج نطاقك»',
      );
    });

    // ── Y3 (ب٣): طرفا الدفعة في النطاق ───────────────────────────────────────────────────────────────────────────────
    await step('Y3 من طرف العلف', async () => {
      fresh({ status: 'ready', workspace: ws() }, batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ status: 'posted', costs: [detailCost({ allocations: null })], expensesVisible: false, scope: { input: false, output: true } })) }));
      await mount('/mill/batch/b-1');
      t.same([byAction('open-output-lots').length, byAction('open-item-ledger').length, byAction('item-ledger-text').length], [1, 0, 1], 'Y3 بلا مخزن المواد: رابط وجبات العلف باقٍ، و«دفتر المادّة» نصّ بلا رابط');
      t.eq(byAction('void-batch').length, 0, 'Y3 ولا «ألغِ الدفعة» (الإلغاء يحتاج مخزن المدخلات)');
    });
    await step('Y3 من طرف المواد', async () => {
      fresh({ status: 'ready', workspace: ws() }, batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ status: 'posted', costs: [detailCost()], scope: { input: true, output: false } })) }));
      await mount('/mill/batch/b-1');
      t.same([byAction('open-output-lots').length, byAction('output-lots-text').length, byAction('open-item-ledger').length], [0, 1, 1], 'Y3 بلا مخزن العلف: «وجبات العلف» نصّ بلا رابط، ودفتر المادّة رابط');
      t.eq(byAction('void-batch').length, 1, 'Y3 والإلغاء ظاهر لمن مخزن المدخلات بنطاقه');
    });
    await step('Y3 مسوّدة من طرف العلف', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()], expensesVisible: false, scope: { input: false, output: true } })),
          previewProduction: () => {
            throw new m.RejectedError('out_of_scope', 'مخزن مدخلات هذه الدفعة خارج نطاقك.');
          },
        }),
      );
      await mount('/mill/batch/b-1');
      t.eq(named(calls, 'previewProduction').length, 0, 'Y3 مسوّدة من طرف العلف: لا تُطلب المعاينة');
      t.ok(text().includes('هذه الدفعة مسوّدة تُعمل من مخزن «مخزن المواد الأوّلية» خارج نطاقك') && !text().includes('تعذّر تحميل'), 'Y3 وتقول ذلك بجملة بدل «تعذّر التحميل»');
      t.same(
        ['post-production', 'discard-batch', 'add-input', 'input-actual', 'save-weight', 'seal-costs', 'replace-input'].map((name) => byAction(name).length),
        [0, 0, 0, 0, 0, 0, 0],
        'Y3 ولا فعل مسوّدة',
      );
    });

    // ── Y4 (ب٤): «سجّل مصروفاً» يسأل قبل أن يضيّع ما كُتب ولم يُحفظ ───────────────────────────────────────────────────────
    const unfundedHandlers = () =>
      batchHandlers({
        loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()] })),
        previewProduction: () => m.parsePreview(previewJson({ costs: [previewCost()], problems: [{ code: 'costs_unfunded', category_id: 'c-labor', category_name: 'أيدي عاملة', need: '15000.00', have: '4000.00' }] })),
      });
    const expensesHref = '/accounts/expenses?new=1&division=d-mill&category=c-labor&amount=11000.00&back=/mill/batch/b-1';
    await step('Y4 بمكتوب', async () => {
      fresh({ status: 'ready', workspace: ws() }, unfundedHandlers());
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      type(byAction('input-actual')[0], '1010');
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      await clickLink(byAction('record-expense')[0]);
      t.eq(globalThis.__mill.location, '/mill/batch/b-1', 'Y4 بمكتوب لم يُحفظ: النقرة لا تغادر الصفحة');
      t.ok(text().includes('ما كتبته هنا لم يُحفظ') && byAction('confirm-leave').length === 1, 'Y4 بل تسأل: «ما كتبته هنا لم يُحفظ»');
      t.ok(
        text().includes('لم يُحفظ بعد: وزن الناتج، الكمية الفعلية من «ذرة صفراء»، اسم الفئة الجديدة «نقل». الانتقال إلى صفحة المصاريف يُضيّع ما كتبته'),
        'Y4 والنتيجة تسمّي ما سيضيع وتقول إنّ الانتقال يضيّعه',
      );
      await click(buttonByText('لا، تراجع'));
      t.same([globalThis.__mill.location, byAction('output-weight')[0]?.value, byAction('confirm-leave').length], ['/mill/batch/b-1', '985', 0], 'Y4 «لا، تراجع» يبقى في الصفحة بما كُتب');
      await clickLink(byAction('record-expense')[0]);
      await click(byAction('confirm-leave')[0]);
      t.eq(globalThis.__mill.location, expensesHref, 'Y4 «انتقل بلا حفظ» يفتح نافذة المصروف المعبّأة');
    });
    await step('Y4 بلا مكتوب', async () => {
      fresh({ status: 'ready', workspace: ws() }, unfundedHandlers());
      await mount('/mill/batch/b-1');
      await clickLink(byAction('record-expense')[0]);
      t.eq(globalThis.__mill.location, expensesHref, 'Y4 ضابط: بلا مكتوب ينتقل مباشرة كما كان');
    });

    // ── Y5 (ب٥): سبب الهدر يبدأ من المحفوظ، وحفظ الوزن لا يمسحه ─────────────────────────────────────────────────────────
    await step('Y5', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ over: { output_qty_kg: '960.000', shrink_reason: 'رطوبة عالية في الذرة' } })), setBatchFields: () => 'b-1' }),
      );
      await mount('/mill/batch/b-1');
      t.eq(byAction('waste-reason')[0]?.value, 'رطوبة عالية في الذرة', 'Y5 حقل سبب الهدر يبدأ من السبب المحفوظ');
      type(byAction('output-weight')[0], '965');
      await settle();
      await click(byAction('save-weight')[0]);
      const [batchId, fields] = named(calls, 'setBatchFields')[0] ?? [];
      t.ok(batchId === 'b-1' && fields?.outputQtyKg === 965_000n && (!('shrinkReason' in (fields ?? {})) || fields.shrinkReason === 'رطوبة عالية في الذرة'), `Y5 حفظ الوزن لا يمسح السبب المحفوظ (${JSON.stringify(fields, (key, value) => (typeof value === 'bigint' ? `${value}n` : value))})`);
    });

    // ── Y6 (ب٦): تاريخ انتهاء الناتج من الشاشة يحلّ expiry_required فتُرحَّل الدفعة ─────────────────────────────────────────
    await step('Y6', async () => {
      let saved = null;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ over: { output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: true }, output_expiry_on: saved } })),
          previewProduction: () => m.parsePreview(previewJson(saved ? {} : { problems: [{ code: 'expiry_required' }], canPost: false })),
          setBatchFields: (batchId, fields) => {
            if (fields.outputExpiryOn !== undefined) saved = fields.outputExpiryOn;
            return batchId;
          },
          postProduction: () => ({ doc_no: 'PD-2026-0003' }),
        }),
      );
      await mount('/mill/batch/b-1');
      const field = byAction('output-expiry')[0];
      t.ok(Boolean(field) && disabled(byAction('post-production')[0]) === true, 'Y6 expiry_required: حقل «تاريخ انتهاء الناتج» في قسم الوزن، و«أنتج الآن» معطّل');
      type(field, '31/02/2026');
      await settle();
      t.ok(text().includes('اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') && disabled(byAction('save-weight')[0]) === true, 'Y6 يوم غير موجود بالتقويم: يُقال ولا يُحفظ');
      type(byAction('output-expiry')[0], '15/12/2026');
      await settle();
      await click(byAction('save-weight')[0]);
      t.same(named(calls, 'setBatchFields').map(([batchId, fields]) => [batchId, fields.outputExpiryOn]), [['b-1', '2026-12-15']], 'Y6 يُحفظ يوم تقويم بـsetBatchFields({ outputExpiryOn })');
      t.eq(byAction('output-expiry')[0]?.value, '15/12/2026', 'Y6 وبعد القراءة يبدأ الحقل من المحفوظ');
      const post = byAction('post-production')[0];
      t.eq(disabled(post), false, 'Y6 المعاينة بلا مشكلة: «أنتج الآن» مفعَّل');
      if (post) await click(post);
      t.eq(named(calls, 'postProduction').length, 1, 'Y6 وتُرحَّل الدفعة');
    });

    // ── Y7 (ب٧): الملغاة: «أُوقف تحميلها بالإلغاء» لكلّ قارئ ───────────────────────────────────────────────────────────────
    await step('Y7', async () => {
      fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ status: 'void', costs: [detailCost(), detailCost({ cost_id: 'pc-2', line_no: 2, category_id: 'c-power', category_name: 'كهرباء', allocations: null })] })) }),
      );
      await mount('/mill/batch/b-1');
      t.same(byAction('allocations-void').map((node) => node.textContent), ['أُوقف تحميلها بالإلغاء', 'أُوقف تحميلها بالإلغاء'], 'Y7 كلّ سطر تكاليف في الملغاة: «أُوقف تحميلها بالإلغاء»');
      t.eq(byAction('allocations-hidden').length, 0, 'Y7 ولا «خارج نطاقك» لدفعة ملغاة');
    });

    // ── Y8 (ب٨): شريط التركيبة ورقاقاته في شاشة المعمل بلا ما هو خارج الكتلة ─────────────────────────────────────────────────
    await step('Y8', async () => {
      const pieces = [
        piece('i-corn', 'ذرة صفراء', '600.000'), piece('i-soy', 'كسبة صويا', '300.000'), piece('i-bran', 'نخالة', '80.000'),
        piece('i-stone', 'حجر', '15.000'), piece('i-salt', 'ملح', '5.000'), piece('i-diesel', 'كاز المولّدة', '17.000', false),
      ];
      fresh(
        { status: 'ready', workspace: ws() },
        {
          loadMill: () => ({
            today: '2026-11-04', recipes: m.parseRecipes(overview(pieces)), stores: overview(pieces).stores, feedItems: [],
            productions: { drafts: [], rows: [], total: 0 },
          }),
        },
      );
      await mount('/mill');
      const card = all().find((n) => n.localName === 'article');
      const titles = card ? descendants(card).map((n) => n.getAttribute?.('title') ?? null).filter(Boolean) : [];
      t.ok(card && !card.textContent.includes('كاز المولّدة') && !titles.some((title) => title.includes('كاز المولّدة')), 'Y8 الكاز خارج الكتلة: لا رقاقة له ولا قطعة في الشريط');
      t.eq(titles.length, 5, 'Y8 الشريط بقطعة لكلّ مادّة داخل الكتلة');
      t.ok(card?.textContent.includes('و1 أخرى'), `Y8 و«أخرى» تعدّ ما داخل الكتلة وحده (${card?.textContent})`);
    });

    // ── Y9 (ب٩): عمود «بالكيلوغرام» في بطاقة الخلطة = مجموعه (جواب بشكل recipe_detail الحقيقي، ومحلّله الحقيقي) ──────────────────
    await step('Y9', async () => {
      // شكل recipe_detail من القاعدة كما قاسته المراجعة (#13): خلطة 1,000 ذرة و20 لتر كاز مفعَّلة.
      const diesel = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-diesel', item_name: 'كاز المولّدة', kind: 'fuel', base_unit: 'L', category_name: null, qty: '20.000', unit: 'L', mass_kg: '17.000', share_pct: '1.70', in_basis: false });
      fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', lines: [recipeLine(), diesel] })) });
      await mount('/mill/recipe/r-1');
      const table = tableOf('مواد الخلطة وحصّة كلّ مادّة من الأساس');
      const column = table?.headers.indexOf('بالكيلوغرام') ?? -1;
      const cells = (table?.rows ?? []).map((row) => row[column]);
      const sum = cells.map(number).filter((value) => value !== null).reduce((total, value) => total + value, 0);
      t.ok(column >= 0 && cells.length === 2, `Y9 الجدول وعمود الكتلة (${table?.headers.join(' | ')})`);
      t.eq(sum, number(table?.footAt(column)), `Y9 مجموع خلايا العمود = خلية المجموع (${cells.join(' + ')} ← ${table?.footAt(column)})`);
      t.eq(cells[1], '—', 'Y9 خلية الكاز خارج الكتلة «—» كالبانية');
    });

    // ── Y10 (ب١٠): «نسخة جديدة» تبدأ من المفعَّلة لا من المعروضة ─────────────────────────────────────────────────────────────
    await step('Y10', async () => {
      const versions = [
        { id: 'v-1', version_no: 1, status: 'retired', basis_kg: '1000.000', activated_at: null, version: 5 },
        { id: 'v-2', version_no: 2, status: 'active', basis_kg: '1000.000', activated_at: null, version: 5 },
      ];
      fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'retired', versions })) });
      await mount('/mill/recipe/r-1');
      t.ok(text().includes('لإضافة تكلفة أنشئ نسخة جديدة، فهي تبدأ بموادّ النسخة المفعَّلة وتكاليفها.') && !text().includes('تبدأ بموادّ هذه النسخة'), 'Y10 تحت نسخة مقاعدة: تبدأ بموادّ النسخة المفعَّلة وتكاليفها');
      await unmount();
      root = null;
      fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'retired', versions: [versions[0]] })) });
      await mount('/mill/recipe/r-1');
      t.ok(text().includes('لإضافة تكلفة أنشئ نسخة جديدة، فهي تبدأ بموادّ آخر نسخة وتكاليفها.'), 'Y10 بلا نسخة مفعَّلة: تبدأ بموادّ آخر نسخة وتكاليفها');
      await unmount();
      root = null;
      fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', versionId: 'v-2', versionNo: 2, versions })) });
      await mount('/mill/recipe/r-1');
      t.ok(text().includes('لإضافة تكلفة أنشئ نسخة جديدة، فهي تبدأ بموادّ هذه النسخة وتكاليفها.'), 'Y10 ضابط: تحت المفعَّلة الجملة كما هي');
    });

    // ── Y11 (ب١١): نصّ «فئة جديدة» يبقى بعد حفظ آخر، وcategory_name_taken بتلميحه ───────────────────────────────────────────
    await step('Y11 الدفعة', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()] })), setInputActual: () => undefined }));
      await mount('/mill/batch/b-1');
      type(byAction('new-category-name')[0], 'نقل');
      type(byAction('input-actual')[0], '990');
      await settle();
      await click(byAction('input-actual-save')[0]);
      t.same([named(calls, 'setInputActual').length, named(calls, 'loadBatch').length], [1, 2], 'Y11 حُفظت الكمية الفعلية وقُرئت الدفعة من جديد');
      t.eq(byAction('new-category-name')[0]?.value, 'نقل', 'Y11 ونصّ «فئة جديدة» باقٍ بعد القراءة');
    });
    await step('Y11 بطاقة الخلطة', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson()), setItemCostPrice: (itemId, price) => price });
      await mount('/mill/recipe/r-1');
      type(byAction('new-category-name')[0], 'نقل');
      type(byAction('cost-price')[0], '470');
      await settle();
      await click(byAction('cost-price-save')[0]);
      t.same([named(calls, 'setItemCostPrice').length, named(calls, 'loadRecipe').length], [1, 2], 'Y11 حُفظ سعر الكلفة وقُرئت البطاقة من جديد');
      t.eq(byAction('new-category-name')[0]?.value, 'نقل', 'Y11 ونصّ «فئة جديدة» باقٍ بعد القراءة');
    });
    await step('Y11 الاسم المكرّر', async () => {
      const hint = 'توجد فئة «نقل» مؤرشفة: أعِدها من الأرشيف بدل إنشاء أخرى.';
      fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()] })),
          createExpenseCategory: () => {
            throw new m.RejectedError('category_name_taken', hint);
          },
        }),
      );
      await mount('/mill/batch/b-1');
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      await click(byAction('create-category')[0]);
      t.eq(byAction('category-problem')[0]?.textContent, hint, 'Y11 category_name_taken يُعرض بتلميح الخادم كما هو');
      t.eq(byAction('new-category-name')[0]?.value, 'نقل', 'Y11 والنصّ باقٍ ليُصحَّح');
    });

    // ── البانية (ب١٢–ب١٤) ──────────────────────────────────────────────────────────────────────────────────────────
    const catalog = [itemRow('i-corn', 'ذرة صفراء', 'raw'), itemRow('i-soy', 'كسبة صويا', 'raw'), itemRow('i-diesel', 'كاز المولّدة', 'fuel', 'L', 8500n)];
    const builderHandlers = (over = {}) => ({
      loadBuilder: () => ({ feedItems: [{ id: 'f-1', name: 'علف بادئ' }], recipeNames: [], stores: [], categories: [{ id: 'c-labor', name: 'أيدي عاملة' }] }),
      listItems: ({ search: query }) => ({ rows: catalog.filter((row) => m.searchable(row.name).includes(m.searchable(query))), total: null, next: null }),
      loadItemPurchases: (itemId) => ({
        item: { id: itemId, name: 'x', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: null, costPrice: itemId === 'i-corn' ? 450_00n : null },
        warehouse: null, today: '2026-11-04', next: null, total: 1,
        rows: itemId === 'i-corn' ? [{ money: { unitCost: 400_00n, invoiceTotal: 0n, landedValue: 0n, corrected: false } }] : [],
      }),
      findItemTwins: () => [],
      loadItem: () => null,
      setItemCostPrice: (itemId, price) => price,
      createRecipe: (input) => ({ id: input.id, versionId: input.versionId, versionNo: 1, status: input.activate ? 'active' : 'draft', lines: input.lines.length, rates: input.rates.length }),
      ...over,
    });
    const fillBuilder = async () => {
      type(byAction('recipe-name')[0], 'علف بياض');
      choose(byAction('recipe-output')[0], 'f-1');
      await settle();
      await search('ذرة صفراء');
      await click(byAction('pick-material')[0]);
      type(byAction('line-qty')[0], '1000');
      await settle();
    };
    /** البانية بسطر تكلفة ومادّة باللتر (ب٢٥): فتظهر في قائمة القفل خانات جدول «تكاليف لكلّ طنّ» ووحدة السطر لتر/كغم. */
    const fillBuilderLocked = async () => {
      await fillBuilder();
      await search('كاز المولّدة');
      await click(byAction('pick-material')[0]);
      type(byAction('line-qty')[1], '20');
      await settle();
      await click(byAction('add-rate')[0]);
      choose(byAction('rate-category')[0], 'c-labor');
      type(byAction('rate-amount')[0], '5000');
      await settle();
    };
    const fields = ['recipe-name', 'recipe-basis', 'recipe-output', 'new-output-name', 'search-material', 'line-qty', 'cost-price', 'remove-line', 'add-rate', 'new-category-name', 'rate-category', 'rate-amount', 'remove-rate', 'line-unit'];

    // ── Y12 (ب١٢): البانية مقفولة أثناء الحفظ، ومنه انتظار حفظ الأسعار ─────────────────────────────────────────────────────
    await step('Y12', async () => {
      let release = null;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          setItemCostPrice: (itemId, price) =>
            new Promise((resolve) => {
              release = () => resolve(price);
            }),
        }),
      );
      await mount('/mill/new');
      await fillBuilderLocked();
      type(byAction('cost-price')[0], '470');
      await settle();
      await click(byAction('save-activate')[0]);
      t.eq(named(calls, 'createRecipe').length, 0, 'Y12 حفظ السعر ينتظر الشبكة: الخلطة لم تُرسل بعد');
      t.same(fields.map((name) => disabled(byAction(name)[0])), fields.map(() => true), `Y12 وكلّ حقل وزرّ في البانية مقفول أثناءه (${fields.filter((name) => disabled(byAction(name)[0]) !== true).join('، ')})`);
      release?.();
      await settle();
      const sent = named(calls, 'createRecipe')[0]?.[0];
      t.same([sent?.lines, sent?.rates], [[{ itemId: 'i-corn', qty: 1_000_000n, unit: 'kg' }, { itemId: 'i-diesel', qty: 20_000n, unit: 'L' }], [{ categoryId: 'c-labor', amountPerTon: 500_000n }]], 'Y12 ثم تُرسل الخلطة بما على الشاشة (المواد وتكاليف الطنّ)');
    });

    // ── Y13 (ب١٣): الخلية الممسوحة ليست سعراً معلّقاً ──────────────────────────────────────────────────────────────────
    await step('Y13', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, builderHandlers());
      await mount('/mill/new');
      await fillBuilder();
      t.eq(byAction('cost-price')[0]?.value, '450.00', 'Y13 سعر الكلفة المحفوظ في خليته');
      type(byAction('cost-price')[0], '');
      await settle();
      t.ok(byAction('planned-cost')[0]?.textContent.includes('كلفة الطنّ المتوقّعة: 450,000.00'), `Y13 التقدير بالسعر المحفوظ بعد مسح الخلية (${byAction('planned-cost')[0]?.textContent})`);
      await click(byAction('save-activate')[0]);
      t.same([named(calls, 'setItemCostPrice').length, named(calls, 'createRecipe').length], [0, 1], 'Y13 «احفظ وفعّل» لا ينادي setItemCostPrice (لا حذف للسعر المحفوظ)، والخلطة تُحفظ');
      t.ok(!(globalThis.__mill.toasts.at(-1)?.title ?? '').includes('حُفظ سعر الكلفة'), `Y13 والرسالة لا تقول «حُفظ سعر الكلفة» (${globalThis.__mill.toasts.at(-1)?.title})`);
    });

    // ── Y14 (ب١٤): بعد نتيجة مجهولة تتجمّد البانية، والإعادة بالحمولة نفسها ──────────────────────────────────────────────────
    await step('Y14 التجميد والإعادة', async () => {
      let attempt = 0;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          createRecipe: (input) => {
            attempt += 1;
            if (attempt === 1) throw new m.UnknownOutcomeError();
            return { id: input.id, versionId: input.versionId, versionNo: 1, status: 'active', lines: input.lines.length, rates: 0 };
          },
        }),
      );
      await mount('/mill/new');
      await fillBuilderLocked();
      type(byAction('cost-price')[0], '470');
      await settle();
      await click(byAction('save-activate')[0]);
      t.ok(text().includes('لا نعرف إن حُفظت الخلطة: أعد المحاولة قبل أيّ تعديل؛ لن تُكتب مرّتين.') && byAction('retry-save').length === 1, 'Y14 نتيجة مجهولة: جملة التجميد وفعل «أعد المحاولة»');
      t.same([byAction('save-activate').length, byAction('save-draft').length], [0, 0], 'Y14 وفعل واحد ظاهر (لا زرّا الحفظ)');
      t.same(fields.map((name) => disabled(byAction(name)[0])), fields.map(() => true), `Y14 والحقول والأزرار معطّلة (${fields.filter((name) => disabled(byAction(name)[0]) !== true).join('، ')})`);
      // محاولة تغيير حقل رغم القفل: الإعادة بالحمولة الأولى حرفاً.
      type(byAction('line-qty')[0], '900');
      type(byAction('recipe-name')[0], 'اسم آخر');
      await settle();
      await click(byAction('retry-save')[0]);
      const [first, second] = named(calls, 'createRecipe').map(([input]) => input);
      t.same(second, first, 'Y14 «أعد المحاولة» يرسل طلب create_recipe نفسه حرفاً (المعرّفان والمحتوى والتفعيل)');
      t.eq(named(calls, 'setItemCostPrice').length, 1, 'Y14 والأسعار التي حُفظت قبله لا تُرسل ثانية');
      t.eq(globalThis.__mill.location, `/mill/recipe/${first?.id}`, 'Y14 الجواب النهائي (نجاح) يفتح بطاقة الخلطة');
      t.ok((globalThis.__mill.toasts.at(-1)?.title ?? '').includes('وحُفظ سعر الكلفة لـذرة صفراء.'), 'Y14 والرسالة تذكر السعر الذي حُفظ قبل المحاولة الأولى');
    });
    await step('Y14 إعادة لم تصل ثم رفض', async () => {
      let attempt = 0;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          createRecipe: () => {
            attempt += 1;
            if (attempt === 1) throw new m.UnknownOutcomeError();
            if (attempt === 2) throw new m.NetworkError();
            throw new m.RejectedError('basis_mismatch', 'مجموع مواد الخلطة 1,000 كغم، والأساس 900 كغم.');
          },
        }),
      );
      await mount('/mill/new');
      await fillBuilder();
      await click(byAction('save-draft')[0]);
      await click(byAction('retry-save')[0]);
      t.ok(byAction('retry-save').length === 1 && text().includes('لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.') && disabled(byAction('line-qty')[0]) === true, 'Y14 إعادة لم تصل: تبقى البانية مجمَّدة وتقول ذلك');
      await click(byAction('retry-save')[0]);
      const sent = named(calls, 'createRecipe').map(([input]) => input);
      t.ok(sent.length === 3 && sent.every((input) => JSON.stringify(input, (key, value) => (typeof value === 'bigint' ? `${value}` : value)) === JSON.stringify(sent[0], (key, value) => (typeof value === 'bigint' ? `${value}` : value))), 'Y14 والإعادات كلّها بالحمولة الأولى');
      t.same([byAction('retry-save').length, disabled(byAction('line-qty')[0]), disabled(byAction('save-draft')[0])], [0, false, false], 'Y14 رفض نهائي يفكّ التجميد: الحقول والحفظ يعودان');
      t.ok(text().includes('مجموع مواد الخلطة 1,000 كغم، والأساس 900 كغم.'), 'Y14 والرفض يُقال بتلميحه');
    });
    await step('Y14 لم يُحفظ', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          createRecipe: () => {
            throw new m.NetworkError();
          },
        }),
      );
      await mount('/mill/new');
      await fillBuilder();
      await click(byAction('save-draft')[0]);
      t.same([byAction('retry-save').length, disabled(byAction('line-qty')[0]), disabled(byAction('save-draft')[0]), named(calls, 'createRecipe').length], [0, false, false, 1], 'Y14 ضابط: NetworkError يعني «لم يُحفظ»، فلا تجميد');
    });

    // ── Q: المحلّلات الصارمة للمفاتيح الجديدة ─────────────────────────────────────────────────────────────────────────
    await step('Q', async () => {
      const safe = (fn) => {
        try {
          return fn();
        } catch (error) {
          return error instanceof Error && error.name === 'MillShapeError' ? error.message : `threw:${error}`;
        }
      };
      const noVisible = previewJson();
      delete noVisible.expenses_visible;
      t.eq(safe(() => m.parsePreview(noVisible) && 'ok'), 'mill_shape:expenses_visible', 'Q المعاينة بلا expenses_visible: خطأ شكل (المفتاح إلزامي)');
      t.same(safe(() => [m.parsePreview(previewJson()).expensesVisible, m.parsePreview(previewJson({ expensesVisible: false })).expensesVisible]), [true, false], 'Q expenses_visible في المعاينة يُقرأ');
      const batchNoVisible = batchJson();
      delete batchNoVisible.expenses_visible;
      t.eq(safe(() => m.parseBatch(batchNoVisible) && 'ok'), 'mill_shape:expenses_visible', 'Q البطاقة بلا expenses_visible: خطأ شكل');
      const batchNoScope = batchJson();
      delete batchNoScope.scope;
      t.eq(safe(() => m.parseBatch(batchNoScope) && 'ok'), 'mill_shape:scope', 'Q البطاقة بلا scope: خطأ شكل');
      t.eq(safe(() => m.parseBatch(batchJson({ scope: { input: true } })) && 'ok'), 'mill_shape:output', 'Q وscope بلا طرف: خطأ شكل');
      t.same(safe(() => m.parseBatch(batchJson({ scope: { input: false, output: true } })).scope), { input: false, output: true }, 'Q scope يُقرأ بطرفيه');
      t.eq(safe(() => m.parsePreview(previewJson({ problems: [{ code: 'costs_unsealed_scope' }] })) && 'ok'), 'mill_shape:division_name', 'Q costs_unsealed_scope بلا division_name: خطأ شكل');
      t.same(
        safe(() => m.parsePreview(previewJson({ problems: [{ code: 'costs_unsealed_scope', division_name: 'معمل العلف' }, { code: 'no_mass_inputs' }] })).problems.map((problem) => [problem.code, problem.divisionName])),
        [['costs_unsealed_scope', 'معمل العلف'], ['no_mass_inputs', null]],
        'Q المشكلتان الجديدتان تُقرآن',
      );
      t.same(
        safe(() => m.parsePreview(previewJson({ problems: [{ code: 'date_too_old', hint: 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 05/11/2026.' }, { code: 'no_mass_inputs' }] })).problems.map((problem) => [problem.code, problem.hint])),
        [['date_too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 05/11/2026.'], ['no_mass_inputs', null]],
        'Q مشكلة التاريخ تحمل جملة الخادم (hint)، وغيرها null',
      );
      const noPieceBasis = overview([piece('i-corn', 'ذرة صفراء', '1000.000')]);
      delete noPieceBasis.recipes[0].active.pieces[0].in_basis;
      t.eq(safe(() => m.parseRecipes(noPieceBasis) && 'ok'), 'mill_shape:in_basis', 'Q قطعة بلا in_basis: خطأ شكل');
      t.same(
        safe(() => m.parseRecipes(overview([piece('i-corn', 'ذرة صفراء', '1000.000'), piece('i-diesel', 'كاز', '17.000', false)]))[0].pieces.map((entry) => [entry.key, entry.inBasis])),
        [['i-corn', true], ['i-diesel', false]],
        'Q in_basis لكلّ قطعة يُقرأ',
      );
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
