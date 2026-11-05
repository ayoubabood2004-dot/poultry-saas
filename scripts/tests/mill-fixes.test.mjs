// إصلاحات مراجعة المعمل v2 (القسم «ب» من مواصفة الإصلاحات، م١–م١٤): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// MillRoutes الحقيقية، وrepo المعمل والمخزون والجلسة والرسائل بدائل (والمحلّلات الحقيقية تقرأ أجوبة بشكل القسم «أ»)؛ ومحلّلات
// mill.ts وطلباته على core بديل. كلّ حالة تفشل على نسخة 4d36b0d من الشاشات:
// X1 id_conflict من create_recipe يُقال برابط الخلطة المحفوظة والبانية بمحتواها والمعرّفان يبقيان (م١)؛ X2 مفتاح معرّف المادّة
// المضافة يحمل الكمية والسبب، وid_conflict بجملته (م٢)؛ X3 فئة المصروف من مكانها دائماً في البانية وبطاقة الخلطة وصفحة الدفعة، ولا
// رابط إعدادات (م٣)؛ X4 تلميح التكاليف والتنبيه بلا أرقام يسمّيان الوحدة ولا رابط تسجيل بلا أرقام (م٤)؛ X5 ما ينقص تحت الزرّين،
// والسطر الفارغ يُتجاهل، و«جاهزة للتفعيل» حين يمكن فعلاً (م٥)؛ X6 سعر الكلفة المكتوب يُحفظ قبل الخلطة أو يوقفها (م٦)؛ X7 «نسخة
// جديدة» بـnew_recipe_version ومعرّف يبقى للإعادة، ونصّ «لا تكاليف» على نسخة مجمَّدة (م٧)؛ X8 «اجعلها مادّة أوّلية» بلا رابط يغادر،
// و«أنشئ» المادّة والمنتج يمرّان بالتوائم (م٨)؛ X9 «أنتج» من بطاقة الخلطة (م٩)؛ X10 حذف المسوّدة بتأكيد (م١٠)؛ X11 الوقود
// والتعبئة خارج الكتلة (م١١)؛ X12 التحميلات والمتاح المحجوبة (م١٢)؛ X13 draws إلزامي (م١٣)؛ X14 الناتج المنتهي بتاريخيه (م١٤)؛
// P المحلّلات الصارمة وطلبا new_recipe_version وrecipes_overview.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
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

// core بديل لـrepo بلا شبكة (مثل mill-screens): نداء الدالّة يسجّله globalThis.__repo، والملف الحقيقي يبني الطلب ويقرأ الجواب.
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const search = async (value) => {
  const input = byAction('search-material').at(-1);
  type(input, value);
  await wait(320);
  await settle();
};
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
/** القيمة المختارة في <select> مُدار: React يعلّم الخيار المختار (selected) ولا يكتب value على العنصر نفسه. */
const picked = (select) => (select ? (select.options.find((option) => option.selected === true)?.value ?? null) : null);
const hrefs = () => all().filter((n) => n.localName === 'a').map((n) => n.getAttribute('href') ?? '');

const ws = (over = {}) => ({
  userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
  divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const itemRow = (id, name, kind, baseUnit = 'kg', density = null, over = {}) => ({
  id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [], ...over,
});

// ─── أجوبة بشكل العقد والقسم «أ» ─────────────────────────────────────────────────────────────────────────────────────
const recipeLine = (over = {}) => ({
  id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '1000.000', unit: 'kg',
  mass_kg: '1000.000', share_pct: '100.00', in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false, money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' }, ...over,
});
const recipeJson = ({ status = 'draft', versionId = 'v-1', versionNo = 1, versions = null, lines = [recipeLine()], rates = [], categories = [{ id: 'c-labor', name: 'أيدي عاملة' }] } = {}) => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: versions ?? [{ id: versionId, version_no: versionNo, status, basis_kg: '1000.000', activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version: 5 }],
  selected: { id: versionId, version_no: versionNo, status, basis_kg: '1000.000', note: null, activated_at: null, version: 5 },
  lines,
  mass_kg: '1000.000',
  pick_items: [{ id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' }],
  expense_categories: categories,
  money: { rates, expected: { materials_per_ton: '450000.00', rates_per_ton: '0.00', cost_per_ton: '450000.00', unpriced: 0 } },
});
const batchLine = (over = {}) => ({
  id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, used_qty: null, in_basis: true,
  is_substitute: false, reason: null, replaced_item_name: null, draws: null, money: { value: null }, ...over,
});
const batchJson = ({ status = 'draft', lines = [batchLine()], costs = [], expensesVisible = true, scope = { input: true, output: true } } = {}) => ({
  id: 'b-1', doc_no: status === 'posted' ? 'PD-2026-0003' : null, status, version: 7, produced_on: '2026-11-04', planned_kg: '1000.000',
  output_qty_kg: status === 'posted' ? '990.000' : null, output_expiry_on: null, input_mass_kg: status === 'posted' ? '1000.000' : null,
  shrink_kg: status === 'posted' ? '10.000' : null, shrink_pct: null, shrink_reason: null, note: null, void_reason: null, costs_confirmed: status === 'posted',
  recipe: { id: 'r-1', name: 'علف بادئ', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: true },
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines,
  expenses_visible: expensesVisible,
  scope,
  money: {
    input_value: status === 'posted' ? '450000.00' : null, extra_value: status === 'posted' ? '15000.00' : null,
    total_value: status === 'posted' ? '465000.00' : null, cost_per_kg: status === 'posted' ? '469.70' : null, costs,
  },
});
const detailCost = (over = {}) => ({ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', allocations: [], ...over });
const previewJson = ({ problems = [], costs = [], lines = null, expensesVisible = true } = {}) => ({
  id: 'b-1', kind: 'production', status: 'draft', version: 7, produced_on: '2026-11-04', planned_kg: '1000.000', input_mass_kg: '1000.000', output_qty_kg: '1000.000',
  output_expiry_on: null, shrink_kg: '0.000', shrink_pct: '0.00', shrink_reason: null, shrink_ok: true, costs_confirmed: false,
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', division_id: 'd-mill', division_name: 'معمل العلف' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: lines ?? [{ input_id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, draw_qty: '1000.000', in_basis: true, tracks_expiry: false, money: { value: '450000.00' } }],
  problems,
  can_post: problems.length === 0,
  plan_token: 'tok-7',
  expenses_visible: expensesVisible,
  money: { input_value: '450000.00', extra_value: '15000.00', total_value: '465000.00', cost_per_kg: '465.00', costs },
});
const previewCost = (over = {}) => ({ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', available: '4000.00', ...over });

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
        "export { UnknownOutcomeError, RejectedError } from './src/lib/errors.ts';",
        "export { NewCategoryField } from './src/pages/mill/pickers.tsx';",
        "export { renderToStaticMarkup } from 'react-dom/server.browser';",
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

    const catalog = [
      itemRow('i-corn', 'ذرة صفراء', 'raw'),
      itemRow('i-fc', 'ذرة', 'feed'),
      itemRow('i-soy', 'كسبة صويا', 'raw'),
      itemRow('i-diesel', 'كاز المولّدة', 'fuel', 'L', 8_500n),
    ];
    const builderHandlers = (over = {}) => ({
      loadBuilder: () => ({ feedItems: [{ id: 'f-1', name: 'علف بادئ' }], recipeNames: [], stores: [], categories: [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }] }),
      listItems: ({ search: query }) => ({ rows: catalog.filter((row) => m.searchable(row.name).includes(m.searchable(query))), total: null, next: null }),
      loadItemPurchases: (itemId) => ({
        item: { id: itemId, name: 'x', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: null, costPrice: itemId === 'i-corn' ? 450_00n : null },
        warehouse: null, today: '2026-11-04', next: null, total: 1,
        rows: itemId === 'i-corn' ? [{ money: { unitCost: 440_25n, invoiceTotal: 0n, landedValue: 0n, corrected: false } }] : [],
      }),
      createItem: (fields) => itemRow(`new-${fields.kind}-${fields.name}`, fields.name, fields.kind, fields.base_unit),
      findItemTwins: () => [],
      loadItem: () => null,
      setItemCostPrice: (itemId, price) => price,
      createExpenseCategory: (name) => ({ id: `c-new-${name}`, version: 1, archived: false, name, systemCode: null }),
      createRecipe: (input) => ({ id: input.id, versionId: input.versionId, versionNo: 1, status: input.activate ? 'active' : 'draft', lines: input.lines.length, rates: input.rates.length }),
      ...over,
    });
    /** بانية مملوءة: الاسم والمنتج المختار وسطر ذرة صفراء بكمية. */
    const fillBuilder = async (qty = '1000') => {
      type(byAction('recipe-name')[0], 'علف بياض');
      choose(byAction('recipe-output')[0], 'f-1');
      await settle();
      await search('ذرة صفراء');
      await click(byAction('pick-material')[0]);
      type(byAction('line-qty')[0], qty);
      await settle();
    };

    // ── X1 (م١): id_conflict يُقال برابط الخلطة المحفوظة، والبانية بمحتواها، والمعرّفان يبقيان ─────────────────────────────────
    await step('X1', async () => {
      let attempt = 0;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          createRecipe: () => {
            attempt += 1;
            if (attempt === 1) throw new m.UnknownOutcomeError();
            throw new m.RejectedError('id_conflict', 'حُفظت هذه الخلطة بمحاولة سابقة بمحتوى غير الذي أرسلته الآن. افتحها لترى ما حُفظ.');
          },
        }),
      );
      await mount('/mill/new');
      await fillBuilder('1000');
      await click(byAction('save-draft')[0]);
      // بعد النتيجة المجهولة تتجمّد البانية (ب١٤): الإعادة بـ«أعد المحاولة» وحدها، وid_conflict (من جهاز آخر) جوابها هنا.
      await click(byAction('retry-save')[0]);
      const [first] = named(calls, 'createRecipe').map(([input]) => input);
      t.ok(text().includes('حُفظت هذه الخلطة بمحاولة سابقة بمحتوى غير الذي تراه الآن. افتحها لترى ما حُفظ، وعدّلها بنسخة جديدة.'), 'X1 id_conflict بجملة تقول إنّ ما حُفظ غير ما تراه');
      t.eq(byAction('open-saved-recipe')[0]?.getAttribute('href'), `/mill/recipe/${first?.id}`, 'X1 ورابط الخلطة المحفوظة بالمعرّف الذي أُرسل');
      type(byAction('line-qty')[0], '900');
      await settle();
      t.same([globalThis.__mill.location, byAction('recipe-name')[0]?.value, byAction('line-qty')[0]?.value], ['/mill/new', 'علف بياض', '900'], 'X1 والبانية بمحتواها تُعدَّل بعد الجواب النهائي (لا انتقال ولا مسح)');
      await click(byAction('save-draft')[0]);
      const third = named(calls, 'createRecipe')[2]?.[0];
      t.same([third?.id, third?.versionId], [first?.id, first?.versionId], 'X1 والمحاولة التالية بالمعرّفين أنفسهما: لا خلطة ثانية تُولد بصمت');
    });

    // ── X2 (م٢): معرّف المادّة المضافة يحمل كميتها، وid_conflict بجملته ───────────────────────────────────────────────────
    const batchHandlers = (over = {}) => ({
      loadBatch: () => m.parseBatch(batchJson()),
      previewProduction: () => m.parsePreview(previewJson()),
      loadExpenseCategories: () => [{ id: 'c-labor', name: 'أيدي عاملة' }],
      listItems: ({ search: query }) => ({ rows: [itemRow('i-corn', 'ذرة صفراء', 'raw'), itemRow('i-soy44', 'كسبة صويا 44٪', 'raw')].filter((row) => m.searchable(row.name).includes(m.searchable(query))), total: null, next: null }),
      ...over,
    });
    await step('X2', async () => {
      let attempt = 0;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({
          addProductionInput: (input) => {
            attempt += 1;
            if (attempt === 1 || attempt === 2) throw new m.UnknownOutcomeError();
            if (attempt === 3) return { id: input.id, lineNo: 2, version: 8 };
            throw new m.RejectedError('id_conflict', 'هذا المعرّف لسطر آخر. حدّث الشاشة وأعد المحاولة.');
          },
        }),
      );
      await mount('/mill/batch/b-1');
      await click(byAction('add-input')[0]);
      await search('صويا 44');
      await click(byAction('pick-material')[0]);
      type(byAction('input-qty')[0], '50');
      await settle();
      await click(byAction('input-save')[0]);
      await click(byAction('input-save')[0]);
      type(byAction('input-qty')[0], '80');
      await settle();
      await click(byAction('input-save')[0]);
      const [one, two, three] = named(calls, 'addProductionInput').map(([input]) => input);
      t.eq(two?.id, one?.id, 'X2 الإعادة بالكمية نفسها بعد نتيجة مجهولة بالمعرّف نفسه (لا سطر ثانٍ)');
      t.ok(three && three.id !== one?.id && three.qty === 80_000n, 'X2 كمية أخرى بعد نتيجة مجهولة: معرّف آخر، فلا يُرجَع «نجح» بالكمية الأولى بصمت');
      await unmount();
      root = null;
      await mount('/mill/batch/b-1');
      await click(byAction('add-input')[0]);
      await search('صويا 44');
      await click(byAction('pick-material')[0]);
      type(byAction('input-qty')[0], '60');
      await settle();
      await click(byAction('input-save')[0]);
      t.ok(text().includes('أُضيفت هذه المادّة بمحاولة سابقة بكمية أخرى؛ حدّث الصفحة وعدّل كميتها الفعلية.'), 'X2 id_conflict بجملة تقول ما العمل');
    });

    // ── X3 (م٣): فئة المصروف من مكانها، دائماً، ولا رابط إعدادات ──────────────────────────────────────────────────────────
    await step('X3 البانية', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, builderHandlers());
      await mount('/mill/new');
      t.ok(byAction('new-category-name').length === 1 && byAction('create-category').length === 1, 'X3 حقل «فئة مصروف جديدة» ظاهر ولو وُجدت فئات');
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      await click(byAction('create-category')[0]);
      t.same(named(calls, 'createExpenseCategory'), [['نقل']], 'X3 الفئة تُنشأ من البانية بـcreateExpenseCategory');
      t.same(byAction('rate-category').map(picked), ['c-new-نقل'], 'X3 والفئة الجديدة مختارة في سطر تكلفة فوراً');
      type(byAction('new-category-name')[0], ' كهرباء ');
      await settle();
      await click(byAction('create-category')[0]);
      t.eq(named(calls, 'createExpenseCategory').length, 1, 'X3 فئة بالاسم نفسه موجودة: لا فئة ثانية');
      t.ok(text().includes('الفئة «كهرباء» موجودة: اخترها من القائمة.'), 'X3 ويُقال إنّها موجودة');
      t.same(byAction('rate-category').map(picked), ['c-new-نقل', 'c-power'], 'X3 وتُختار في سطر');
      await unmount();
      root = null;
      fresh({ status: 'ready', workspace: ws() }, builderHandlers({ loadBuilder: () => ({ feedItems: [], recipeNames: [], stores: [], categories: [] }) }));
      await mount('/mill/new');
      t.ok(!hrefs().some((href) => href.startsWith('/settings')) && byAction('new-category-name').length === 1, 'X3 بلا فئات: لا رابط إعدادات يغادر البانية، والحقل مكانه');
    });
    await step('X3 بلا صلاحية الفئات', async () => {
      // كلّ دور يكتب التكاليف اليوم يملك expense_categories.manage، فالجملة البديلة تُرسم مباشرة.
      const html = m.renderToStaticMarkup(m.h(m.NewCategoryField, { id: 'x', categories: [], canManage: false, onPick: () => {} }));
      t.ok(html.includes('لا فئة مناسبة؟ اطلب من المدير أو المحاسب إضافتها.') && !html.includes('<input'), 'X3 لمن لا يملك إضافة الفئات: «اطلب من المدير أو المحاسب» بلا حقل');
    });
    await step('X3 بطاقة الخلطة', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        {
          loadRecipe: () => m.parseRecipe(recipeJson({ rates: [{ id: 'rt-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', amount_per_ton: '15000.00' }] })),
          createExpenseCategory: (name) => ({ id: 'c-move', version: 1, archived: false, name, systemCode: null }),
          addRecipeRate: () => undefined,
        },
      );
      await mount('/mill/recipe/r-1');
      t.ok(byAction('new-rate-category').length === 1 && byAction('new-category-name').length === 1, 'X3 المسوّدة وكلّ فئاتها مكتوبة: نموذج التكلفة والفئة الجديدة ظاهران');
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      await click(byAction('create-category')[0]);
      type(byAction('new-rate-amount')[0], '5000');
      await settle();
      await click(byAction('add-rate')[0]);
      const rate = named(calls, 'addRecipeRate')[0];
      t.same([named(calls, 'createExpenseCategory'), rate?.[0], rate?.[2], rate?.[3]], [[['نقل']], 'v-1', 'c-move', 5_000_00n], 'X3 الفئة الجديدة مختارة في سطر التكلفة الجديد (تصل إلى الإضافة)');
      t.ok(!hrefs().some((href) => href.startsWith('/settings')), 'X3 ولا رابط إعدادات');
    });
    await step('X3 الدفعة', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()] })),
          previewProduction: () => m.parsePreview(previewJson({ costs: [previewCost()] })),
          createExpenseCategory: (name) => ({ id: 'c-move', version: 1, archived: false, name, systemCode: null }),
          addBatchCost: () => undefined,
        }),
      );
      await mount('/mill/batch/b-1');
      t.ok(byAction('new-cost-category').length === 1 && byAction('new-category-name').length === 1, 'X3 الدفعة وكلّ فئاتها مستعملة: سطر التكلفة الجديد والفئة الجديدة ظاهران');
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      await click(byAction('create-category')[0]);
      type(byAction('new-cost-amount')[0], '2500');
      await settle();
      await click(byAction('add-cost')[0]);
      const cost = named(calls, 'addBatchCost')[0];
      t.same([named(calls, 'createExpenseCategory'), cost?.[0], cost?.[2], cost?.[3]], [[['نقل']], 'b-1', 'c-move', 2_500_00n], 'X3 الفئة الجديدة مختارة في سطر تكلفة الدفعة الجديد (تصل إلى الإضافة)');
    });

    // ── X4 (م٤): الوحدة في التلميح، وتنبيه بلا أرقام يسمّيها ولا رابط تسجيل ───────────────────────────────────────────────
    await step('X4', async () => {
      fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({
          loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()], expensesVisible: false })),
          previewProduction: () => m.parsePreview(previewJson({ costs: [previewCost({ available: null })], problems: [{ code: 'costs_unfunded' }], expensesVisible: false })),
        }),
      );
      await mount('/mill/batch/b-1');
      t.ok(text().includes('عند الإنتاج يُحمَّل كلّ سطر من مصاريف وحدة «معمل العلف» المسجّلة بفئته'), 'X4 تلميح التكاليف يسمّي وحدة مخزن المدخلات');
      t.ok(text().includes('تكاليف الدفعة أكبر من المتاح في مصاريف وحدة «معمل العلف» المسجّلة'), 'X4 «المصاريف لا تكفي» بلا أرقام يسمّي الوحدة');
      t.eq(byAction('record-expense').length, 0, 'X4 ولا رابط «سجّل مصروفاً» لمن لا يرى مصاريف الوحدة (لا يسجّل عليها)');
    });

    // ── X5 (م٥): ما ينقص تحت الزرّين، والسطر الفارغ يُتجاهل، و«جاهزة للتفعيل» حين يمكن فعلاً ──────────────────────────────────
    await step('X5', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, builderHandlers());
      await mount('/mill/new');
      type(byAction('recipe-name')[0], 'علف بياض');
      type(byAction('new-output-name')[0], 'علف جديد');
      await settle();
      await search('ذرة صفراء');
      await click(byAction('pick-material')[0]);
      type(byAction('line-qty')[0], '1000');
      await settle();
      t.same([disabled(byAction('save-activate')[0]), disabled(byAction('save-draft')[0])], [true, true], 'X5 منتج مكتوب لم يُنشأ: الزرّان معطّلان');
      t.ok(byAction('save-missing')[0]?.textContent.includes('المنتج «علف جديد» مكتوب ولم يُنشأ: اضغط «أنشئ» أو اختر منتجاً من القائمة.'), `X5 والسبب مكتوب تحتهما (${byAction('save-missing')[0]?.textContent ?? 'لا قائمة'})`);
      t.ok(!byAction('builder-sum')[0]?.textContent.includes('جاهزة للتفعيل'), `X5 ولا تُقال «جاهزة للتفعيل» والحفظ معطّل (${byAction('builder-sum')[0]?.textContent})`);
      type(byAction('new-output-name')[0], '');
      choose(byAction('recipe-output')[0], 'f-1');
      await settle();
      t.ok(byAction('builder-sum')[0]?.textContent.includes('جاهزة للتفعيل') && byAction('save-missing').length === 0, 'X5 كلّ شيء صالح: «جاهزة للتفعيل» ولا قائمة');
      await click(byAction('add-rate')[0]);
      t.same([disabled(byAction('save-activate')[0]), disabled(byAction('save-draft')[0])], [false, false], 'X5 سطر تكلفة فارغ كلّه يُتجاهل ولا يعطّل الحفظ');
      choose(byAction('rate-category')[0], 'c-labor');
      await settle();
      t.ok(disabled(byAction('save-draft')[0]) === true && byAction('save-missing')[0]?.textContent.includes('اكتب مبلغ تكلفة «أيدي عاملة» لكلّ طنّ أكبر من صفر، أو احذف السطر.'), 'X5 سطر تكلفة بفئة بلا مبلغ: الحفظ معطّل والسبب مكتوب');
      choose(byAction('rate-category')[0], '');
      await settle();
      type(byAction('line-qty')[0], '900');
      await settle();
      t.ok(disabled(byAction('save-draft')[0]) === false && byAction('save-missing')[0]?.textContent.includes('المجموع 900 كغم أقلّ من الأساس 1.000 طن بـ100 كغم.'), `X5 المجموع ≠ الأساس: المسوّدة تُحفظ والتفعيل يقول ما ينقص بالأرقام (${byAction('save-missing')[0]?.textContent ?? ''})`);
      type(byAction('line-qty')[0], '1000');
      await settle();
      await click(byAction('save-activate')[0]);
      t.same(named(calls, 'createRecipe')[0]?.[0]?.rates, [], 'X5 والسطر الفارغ لا يُرسل');
    });

    // ── X6 (م٦): سعر الكلفة المكتوب يُحفظ قبل الخلطة، وفشله يوقفها ويسمّي المادّة ────────────────────────────────────────────
    await step('X6 الحفظ', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, builderHandlers());
      await mount('/mill/new');
      await fillBuilder('1000');
      type(byAction('cost-price')[0], '470');
      await settle();
      await click(byAction('save-activate')[0]);
      const order = calls.map(([name]) => name).filter((name) => name === 'setItemCostPrice' || name === 'createRecipe');
      t.same([named(calls, 'setItemCostPrice'), order], [[['i-corn', 470_00n, 450_00n]], ['setItemCostPrice', 'createRecipe']], 'X6 السعر المكتوب يُرسل أوّلاً بشرط السعر الذي رأته الشاشة، ثم الخلطة');
      t.ok(globalThis.__mill.toasts.at(-1)?.title.includes('وحُفظ سعر الكلفة لـذرة صفراء.'), `X6 والرسالة تقول إنّ السعر حُفظ (${globalThis.__mill.toasts.at(-1)?.title})`);
    });
    await step('X6 الفشل', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          setItemCostPrice: () => {
            throw new m.RejectedError('price_changed', 'تغيّر سعر الكلفة من شاشة أخرى. حدّث الشاشة.');
          },
        }),
      );
      await mount('/mill/new');
      await fillBuilder('1000');
      type(byAction('cost-price')[0], '470');
      await settle();
      await click(byAction('save-activate')[0]);
      t.eq(named(calls, 'createRecipe').length, 0, 'X6 فشل حفظ السعر يوقف الحفظ قبل الخلطة');
      t.ok(text().includes('لم يُحفظ سعر كلفة «ذرة صفراء»، فلم تُحفظ الخلطة بعد'), 'X6 ويسمّي المادّة ولماذا');
    });

    // ── X7 (م٧): «نسخة جديدة» بـnew_recipe_version، والمعرّف يبقى للإعادة، ونصّ «لا تكاليف» على نسخة مجمَّدة ───────────────────
    await step('X7', async () => {
      let attempt = 0;
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        {
          loadRecipe: (recipeId, versionId) =>
            m.parseRecipe(
              versionId === 'v-3'
                ? recipeJson({
                    status: 'draft', versionId: 'v-3', versionNo: 3,
                    versions: [{ id: 'v-1', version_no: 1, status: 'active', basis_kg: '1000.000', activated_at: null, version: 5 }, { id: 'v-3', version_no: 3, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 1 }],
                  })
                : recipeJson({ status: 'active' }),
            ),
          newRecipeVersion: (recipeId) => {
            attempt += 1;
            if (attempt === 1) throw new m.UnknownOutcomeError();
            return { recipeId, versionId: 'v-3', versionNo: 3, status: 'draft', lines: 1, rates: 0, existing: false, skipped: [] };
          },
        },
      );
      await mount('/mill/recipe/r-1');
      t.ok(text().includes('لا تكاليف على هذه النسخة: لإضافة تكلفة أنشئ نسخة جديدة') && byAction('rates-new-version').length === 1, 'X7 نسخة مفعَّلة بلا تكاليف: النصّ يدلّ على «نسخة جديدة» وزرّها معه');
      await click(byAction('new-version')[0]);
      await click(byAction('new-version')[0]);
      const [first, second] = named(calls, 'newRecipeVersion');
      t.ok(first?.[0] === 'r-1' && /^[0-9a-f-]{36}$/u.test(first?.[1] ?? ''), 'X7 «نسخة جديدة» تنادي new_recipe_version بالخلطة ومعرّف من الجهاز');
      t.eq(second?.[1], first?.[1], 'X7 والإعادة بعد نتيجة مجهولة بالمعرّف نفسه (لا نسخة ثانية)');
      t.eq(named(calls, 'createVersion').length, 0, 'X7 ولا نسخة فارغة بإدراج مباشر');
      t.ok(named(calls, 'loadRecipe').some(([, versionId]) => versionId === 'v-3') && text().includes('نسخة 3 (مسوّدة)'), 'X7 ثم تُفتح المسوّدة المنسوخة');
    });

    // ── X8 (م٨): «اجعلها مادّة أوّلية» بلا رابط يغادر، و«أنشئ» المادّة والمنتج بالتوائم أوّلاً ─────────────────────────────────
    await step('X8 النوع', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, builderHandlers({ updateItem: (id, version, patch) => itemRow(id, 'ذرة', patch.kind, 'kg', null, { version: version + 1 }) }));
      await mount('/mill/new');
      await search('ذرة');
      t.ok(byAction('make-raw').length === 1 && !hrefs().some((href) => href.startsWith('/inventory')), 'X8 مطابق بنوع علف: «اجعلها مادّة أوّلية» ولا رابط يغادر البانية');
      await click(byAction('make-raw')[0]);
      t.same(named(calls, 'updateItem'), [['i-fc', 1, { kind: 'raw' }]], 'X8 تعديل نوعها بدالّة تعديل المادّة القائمة بشرط نسختها');
      t.ok(byAction('line-qty').length === 1 && text().includes('ذرة'), 'X8 ثم تُضاف سطراً في الخلطة');
    });
    await step('X8 مجمّد', async () => {
      fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          updateItem: () => {
            throw new m.RejectedError('frozen_column', 'للمادّة «ذرة» حركات مخزون، فنوعها ووحدة أساسها ثابتان.');
          },
        }),
      );
      await mount('/mill/new');
      await search('ذرة');
      await click(byAction('make-raw')[0]);
      t.ok(text().includes('على «ذرة» حركات مخزون بنوع «علف» فلا يتغيّر نوعها؛ أنشئ مادّة أوّلية باسم آخر (مثل «ذرة خام»).'), 'X8 النوع مجمَّد بحركات: جملة تقول ما العمل');
    });
    await step('X8 أنشئ', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          findItemTwins: (name) => (m.searchable(name) === m.searchable('نخالة') ? [{ id: 'i-bran', name: 'نخالة', archived: true, sameName: true, codes: [] }] : []),
          loadItem: (id) => (id === 'i-bran' ? itemRow('i-bran', 'نخالة', 'raw', 'kg', null, { archived: true }) : null),
        }),
      );
      await mount('/mill/new');
      await search('نخالة');
      await click(byAction('create-material')[0]);
      t.same([named(calls, 'findItemTwins').map(([name]) => name), named(calls, 'createItem').length], [['نخالة'], 0], 'X8 «أنشئ» يسأل find_item_twins أوّلاً، والتوأم يوقف الإنشاء');
      t.ok(byAction('material-twins')[0]?.textContent.includes('«نخالة» مؤرشفة') && byAction('create-anyway').length === 1, 'X8 ويُعرض التوأم بحاله، والإنشاء رغمه فعل ثانٍ');
      await click(byAction('create-anyway')[0]);
      t.same(named(calls, 'createItem').map(([fields]) => [fields.name, fields.kind]), [['نخالة', 'raw']], 'X8 «أنشئ رغم ذلك» يُنشئ');
    });
    await step('X8 المنتج', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        builderHandlers({
          findItemTwins: () => [{ id: 'i-soy', name: 'كسبة صويا', archived: false, sameName: true, codes: [] }],
          loadItem: () => itemRow('i-soy', 'كسبة صويا', 'raw'),
          updateItem: (id, version, patch) => itemRow(id, 'كسبة صويا', patch.kind, 'kg', null, { version: version + 1 }),
        }),
      );
      await mount('/mill/new');
      type(byAction('new-output-name')[0], 'كسبة صويا');
      await settle();
      await click(byAction('create-output')[0]);
      t.same([named(calls, 'findItemTwins').length, named(calls, 'createItem').length], [1, 0], 'X8 «أنشئ» المنتج يسأل التوائم أوّلاً ولا يُنشئ توأماً');
      t.ok(byAction('output-twins')[0]?.textContent.includes('«كسبة صويا» موجودة بنوع «مادّة أوّلية»') && byAction('make-feed').length === 1 && byAction('create-output-anyway').length === 1, 'X8 ويُعرض التوأم بنوعه و«اجعلها علفاً جاهزاً» و«أنشئ رغم ذلك»');
      await click(byAction('make-feed')[0]);
      type(byAction('recipe-name')[0], 'علف بياض');
      await search('ذرة صفراء');
      await click(byAction('pick-material')[0]);
      type(byAction('line-qty')[0], '1000');
      await settle();
      await click(byAction('save-draft')[0]);
      t.same([named(calls, 'updateItem'), named(calls, 'createRecipe')[0]?.[0]?.outputItemId], [[['i-soy', 1, { kind: 'feed' }]], 'i-soy'], 'X8 «اجعلها علفاً جاهزاً» بشرط نسختها، ثم تُختار منتجاً للخلطة');
    });

    // ── X9 (م٩): «أنتج» من بطاقة الخلطة للنسخة المفعَّلة ────────────────────────────────────────────────────────────────
    await step('X9', async () => {
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        {
          loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active' })),
          loadMillStores: () => ({ today: '2026-11-04', stores: [{ id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw' }, { id: 'w-feed', name: 'مخزن العلف', kind: 'feed' }] }),
          createProduction: (id) => ({ id }),
        },
      );
      await mount('/mill/recipe/r-1');
      t.eq(byAction('produce').length, 1, 'X9 بطاقة خلطة مفعَّلة فيها «أنتج»');
      await click(byAction('produce')[0]);
      await click(byAction('quick-qty')[1]);
      await click(byAction('produce-start')[0]);
      const [batchId, versionId, kg, from, to, day] = named(calls, 'createProduction')[0] ?? [];
      t.same([versionId, kg, from, to, day], ['v-1', 1_000_000n, 'w-raw', 'w-feed', '2026-11-04'], 'X9 نافذة الإنتاج نفسها: النسخة المفعَّلة والكمية ومخزنا المعمل ويوم الخادم');
      t.eq(globalThis.__mill.location, `/mill/batch/${batchId}`, 'X9 ثم صفحة الدفعة');
      await unmount();
      root = null;
      fresh({ status: 'ready', workspace: ws({ role: 'viewer', canSeeCost: false }) }, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active' })) });
      await mount('/mill/recipe/r-1');
      t.eq(byAction('produce').length, 0, 'X9 ولا «أنتج» لمن لا يملك production.draft');
    });

    // ── X10 (م١٠): «احذف المسوّدة» بتأكيد يسمّي الدفعة ونتيجتها ─────────────────────────────────────────────────────────
    await step('X10', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, batchHandlers({ discardBatch: () => ({ discarded: true }) }));
      await mount('/mill/batch/b-1');
      t.eq(byAction('discard-batch')[0]?.textContent, 'احذف المسوّدة', 'X10 الزرّ «احذف المسوّدة» لا «اطوِ»');
      await click(byAction('discard-batch')[0]);
      t.eq(named(calls, 'discardBatch').length, 0, 'X10 نقرة واحدة لا تحذف: تفتح التأكيد');
      t.ok(text().includes('احذف مسوّدة الدفعة') && text().includes('تُلغى مسوّدة دفعة «علف بادئ» (1.000 طن) بموادّها المعدّلة وأسباب التبديل وتكاليفها، بلا رقم ولا حركات، ولا ترجع. الخلطة لا تتغيّر.'), 'X10 التأكيد يسمّي الدفعة ونتيجتها');
      await click(byAction('confirm-discard')[0]);
      t.same([named(calls, 'discardBatch'), globalThis.__mill.location], [[['b-1', 7]], '/mill'], 'X10 التأكيد يحذف بنسخة الدفعة ويرجع إلى المعمل');
    });

    // ── X11 (م١١): الوقود والتعبئة خارج الكتلة في البانية وبطاقة الخلطة وصفحة الدفعة ───────────────────────────────────────
    await step('X11 البانية', async () => {
      const calls = fresh({ status: 'ready', workspace: ws() }, builderHandlers());
      await mount('/mill/new');
      await fillBuilder('1000');
      await search('كاز');
      await click(byAction('pick-material')[0]);
      type(byAction('line-qty')[1], '20');
      await settle();
      t.ok(byAction('builder-sum')[0]?.textContent.includes('المجموع 1.000 طن = الأساس'), `X11 الكاز لا يدخل المجموع (${byAction('builder-sum')[0]?.textContent})`);
      t.ok(byAction('out-of-basis').length === 1 && byAction('mass-note').length === 1, 'X11 والسطر «خارج الكتلة» بجملة تشرح');
      t.eq(disabled(byAction('save-activate')[0]), false, 'X11 و«احفظ وفعّل» يعمل (1,000 ذرة + 20 لتر كاز = الأساس)');
      await click(byAction('save-activate')[0]);
      t.same(named(calls, 'createRecipe')[0]?.[0]?.lines.map((line) => line.itemId), ['i-corn', 'i-diesel'], 'X11 والكاز يُرسل سطراً (يُسحب وتُحسب كلفته)');
    });
    await step('X11 البطاقة والدفعة', async () => {
      const fuel = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-diesel', item_name: 'كاز المولّدة', kind: 'fuel', base_unit: 'L', category_name: null, qty: '20.000', unit: 'L', mass_kg: '17.000', share_pct: '0.00', in_basis: false });
      fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: [recipeLine(), fuel] })) });
      await mount('/mill/recipe/r-1');
      t.eq(byAction('out-of-basis').length, 1, 'X11 بطاقة الخلطة تقرأ in_basis: الكاز «خارج الكتلة» لا حصّة');
      await unmount();
      root = null;
      const diesel = batchLine({ id: 'in-2', line_no: 2, item_id: 'i-diesel', item_name: 'كاز المولّدة', base_unit: 'L', planned_qty: '20.000', in_basis: false });
      const previewLines = [
        { input_id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, draw_qty: '1000.000', in_basis: true, tracks_expiry: false, money: { value: '450000.00' } },
        { input_id: 'in-2', line_no: 2, item_id: 'i-diesel', item_name: 'كاز المولّدة', base_unit: 'L', planned_qty: '20.000', actual_qty: null, draw_qty: '20.000', in_basis: false, tracks_expiry: false, money: { value: '20000.00' } },
      ];
      fresh({ status: 'ready', workspace: ws() }, batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ lines: [batchLine(), diesel] })), previewProduction: () => m.parsePreview(previewJson({ lines: previewLines })) }));
      await mount('/mill/batch/b-1');
      t.ok(text().includes('خارج الكتلة: وقود أو تعبئة') && !text().includes('مادّة إضافية'), 'X11 صفحة الدفعة: «خارج الكتلة» لا «مادّة إضافية»');
    });

    // ── X12 (م١٢): التحميلات والمتاح المحجوبة بلا أرقام ───────────────────────────────────────────────────────────────
    await step('X12', async () => {
      fresh(
        { status: 'ready', workspace: ws() },
        batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ status: 'posted', lines: [batchLine({ used_qty: '1000.000', draws: [] })], costs: [detailCost({ allocations: null })] })) }),
      );
      await mount('/mill/batch/b-1');
      t.ok(byAction('allocations-hidden')[0]?.textContent === 'محمَّلة من مصاريف وحدة خارج نطاقك', 'X12 allocations = null: «محمَّلة من مصاريف وحدة خارج نطاقك» بلا أرقام');
      await unmount();
      root = null;
      // available = null يعني أنّ القارئ لا يرى مصاريف الوحدة (ق١١، ق٢١): لا رقم يُعرض، ولا مبلغ يُكتب (ب٢).
      fresh({ status: 'ready', workspace: ws() }, batchHandlers({ loadBatch: () => m.parseBatch(batchJson({ costs: [detailCost()], expensesVisible: false })), previewProduction: () => m.parsePreview(previewJson({ costs: [previewCost({ available: null })], expensesVisible: false })) }));
      await mount('/mill/batch/b-1');
      t.ok(text().includes('المتاح من المصاريف') && !text().includes('4,000.00') && byAction('cost-amount').length === 0, 'X12 available = null في المعاينة: لا رقم يُعرض والصفحة تعمل (والمبلغ لا يُكتب)');
    });

    // ── X14 (م١٤): الناتج المنتهي بجملة تسمّي التاريخين ─────────────────────────────────────────────────────────────────
    await step('X14', async () => {
      fresh({ status: 'ready', workspace: ws() }, batchHandlers({ previewProduction: () => m.parsePreview(previewJson({ problems: [{ code: 'output_expired', expiry_on: '2026-10-05', produced_on: '2026-11-04' }] })) }));
      await mount('/mill/batch/b-1');
      t.ok(text().includes('تاريخ انتهاء الناتج 05/10/2026 قبل يوم الإنتاج 04/11/2026: صحّح تاريخ الانتهاء قبل الترحيل.'), 'X14 output_expired بجملة تسمّي التاريخين');
    });

    // ── P: المحلّلات الصارمة وطلبا new_recipe_version وrecipes_overview ────────────────────────────────────────────────
    await step('P', async () => {
      const repo = await load("export * from './src/lib/repo/mill.ts';", [coreStub]);
      /** كلّ فحص محلّل منفرداً: الرمي يصير قيمة تُقارَن، فلا يُخفي فحصٌ رمى الفحوصَ بعده (على النسخة القديمة أيضاً). */
      const safe = (fn) => {
        try {
          return fn();
        } catch (error) {
          return error instanceof Error && error.name === 'MillShapeError' ? error.message : `threw:${error}`;
        }
      };
      const noBasis = recipeJson();
      delete noBasis.lines[0].in_basis;
      t.eq(safe(() => repo.parseRecipe(noBasis) && 'ok'), 'mill_shape:in_basis', 'P سطر خلطة بلا in_basis: خطأ شكل (المفتاح إلزامي)');
      t.same(safe(() => repo.parseRecipe(recipeJson({ lines: [recipeLine({ in_basis: false })] })).lines.map((line) => line.inBasis)), [false], 'P in_basis يُقرأ');
      const noDivision = previewJson();
      delete noDivision.input_warehouse.division_id;
      t.eq(safe(() => repo.parsePreview(noDivision) && 'ok'), 'mill_shape:division_id', 'P مخزن المدخلات بلا وحدة في المعاينة: خطأ شكل');
      t.same(safe(() => repo.parsePreview(previewJson()).inputWarehouse), { id: 'w-raw', name: 'مخزن المواد الأوّلية', divisionId: 'd-mill', divisionName: 'معمل العلف' }, 'P مخزن المدخلات بوحدته');
      t.eq(safe(() => repo.parsePreview(previewJson({ costs: [previewCost({ available: null })] })).costs?.[0]?.available), null, 'P available = null يُقرأ null (محجوب)');
      const noAvailable = previewJson({ costs: [previewCost()] });
      delete noAvailable.money.costs[0].available;
      t.eq(safe(() => repo.parsePreview(noAvailable) && 'ok'), 'mill_shape:available', 'P وavailable الغائب خطأ شكل لا null صامت');
      t.eq(safe(() => repo.parseBatch(batchJson({ costs: [detailCost({ allocations: null })] })).costs?.[0]?.allocations), null, 'P allocations = null يُقرأ null (محجوبة)');
      const noAllocations = batchJson({ costs: [detailCost()] });
      delete noAllocations.money.costs[0].allocations;
      t.eq(safe(() => repo.parseBatch(noAllocations) && 'ok'), 'mill_shape:allocations', 'P وallocations الغائب خطأ شكل');
      const noDraws = batchJson({ status: 'posted', lines: [batchLine({ used_qty: '1000.000' })] });
      delete noDraws.lines[0].draws;
      t.eq(safe(() => repo.parseBatch(noDraws) && 'ok'), 'mill_shape:draws', 'P سطر دفعة بلا draws: خطأ شكل (المفتاح إلزامي)');
      t.same(
        safe(() => repo.parseBatch(batchJson({ status: 'posted', lines: [batchLine({ used_qty: '1000.000', draws: [{ lot_id: 'lot-1', qty: '1000.000', received_on: '2026-10-20', source: 'RC-2026-0004' }] })] })).lines[0].draws),
        [{ lotId: 'lot-1', qty: 1_000_000n, receivedOn: '2026-10-20', source: 'RC-2026-0004' }],
        'P draws للمرحَّلة بشكل ق١٦',
      );
      t.eq(safe(() => repo.parseBatch(batchJson()).lines[0].draws), null, 'P وdraws = null للمسوّدة');
      t.same(
        safe(() => {
          const expired = repo.parsePreview(previewJson({ problems: [{ code: 'output_expired', expiry_on: '2026-10-05', produced_on: '2026-11-04' }] })).problems[0];
          return [expired.code, expired.expiryOn, expired.producedOn];
        }),
        ['output_expired', '2026-10-05', '2026-11-04'],
        'P output_expired بتاريخيه',
      );
      t.eq(safe(() => repo.parsePreview(previewJson({ problems: [{ code: 'output_expired', produced_on: '2026-11-04' }] })) && 'ok'), 'mill_shape:expiry_on', 'P وoutput_expired بلا تاريخ الانتهاء خطأ شكل');
      const made = { recipe_id: 'r-1', version_id: 'v-3', version_no: 3, status: 'draft', lines: 2, rates: 1, existing: false, skipped: [] };
      t.same(safe(() => repo.parseNewRecipeVersion(made)), { recipeId: 'r-1', versionId: 'v-3', versionNo: 3, status: 'draft', lines: 2, rates: 1, existing: false, skipped: [] }, 'P جواب new_recipe_version');
      const noExisting = { ...made };
      delete noExisting.existing;
      t.eq(safe(() => repo.parseNewRecipeVersion(noExisting) && 'ok'), 'mill_shape:existing', 'P وexisting الغائب خطأ شكل');
      const rpc = [];
      globalThis.__repo = {
        db: null,
        rpc: async (fn, args) => {
          rpc.push([fn, args]);
          if (fn === 'new_recipe_version') return { ...made, existing: true };
          return { today: '2026-11-04', recipes: [], stores: [{ id: 'w-raw', name: 'مخزن المواد', kind: 'raw' }], feed_items: [] };
        },
      };
      try {
        const answer = await Promise.resolve()
          .then(() => repo.newRecipeVersion('r-1', 'v-9'))
          .catch((error) => ({ existing: `threw:${error}` }));
        t.same([rpc.at(-1), answer.existing], [['new_recipe_version', { p_recipe: 'r-1', p_id: 'v-9' }], true], 'P newRecipeVersion: الخلطة والمعرّف من الجهاز');
        const stores = await Promise.resolve()
          .then(() => repo.loadMillStores())
          .catch((error) => `threw:${error}`);
        t.same(stores, { today: '2026-11-04', stores: [{ id: 'w-raw', name: 'مخزن المواد', kind: 'raw' }] }, 'P loadMillStores: يوم الخادم ومخازن المعمل من recipes_overview');
      } finally {
        delete globalThis.__repo;
      }
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
