// بطاقات مواد المعمل (كلمة المالك 2026-11-07: «اشوف المواد على شكل بطاقات واحدد على كل مادة واختار شكد استخدم كمية… واختار اكثر من مادة بنفس
// الوقت حتى انتج مادة جديدة وكل ما اسوي انتاج يحسبلي الناتج الي صار من مجموع المواد»): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// MillRoutes الحقيقية؛ وitems_overview وcreate_recipe يمرّان بملفّي repo الحقيقيين (purchases.ts وmill.ts) على core بديل يسجّل النداء، فالمحلّل
// الحقيقي يقرأ جواب البطاقات والطلب المرسَل يُقرأ بمفاتيحه (p_basis_kg وp_lines). وبقيّة repo المعمل والمخزون بدائل.
// C1 البانية: بطاقات المواد الصالحة وحدها بـ«عندك»، واختيار أكثر من مادّة معاً بكمية على كلّ بطاقة، و«مجموع الخلطة» و«الناتج المتوقّع» حيّان،
//    ولمسة ثانية تترك المادّة، والحفظ يرسل p_basis_kg = المجموع والسطور بترتيب الاختيار؛
// C2 سائل بلا كثافة يُقال على بطاقته ويمنع الحفظ، وكثافته تُكتب هناك بشرط نسخة المادّة فيُحسب وزنه ويدخل الأساس؛
// C3 البحث يصفّي البطاقات فوراً، وبلا مطابق «لا مادّة باسم س» و«أنشئها»، والمُنشأة بطاقة مختارة تحت البحث؛
// C4 بطاقة الخلطة: «أضف مواد» بالبطاقات (أكثر من مادّة بنقرة، والمكتوبة في الخلطة لا تُعرض)، وفشل في الوسط يُقال ويبقي الباقي مختاراً بعد
//    القراءة من جديد؛ ولا حقل أساس: «فعّل النسخة» تكتب الأساس = المجموع بنسخة المسوّدة ثمّ تفعّل بالتالية؛
// C5 «أنتج» يفتح شاشة الإنتاج الواحدة (0023): «كم تنتج؟» يبدأ بمجموع الخلطة ويُرسل كما هو (record_production).
// كلّ حالة تفشل على شاشات 1110eb0 (لا بطاقات material-card، ولا builder-output ولا add-lines-save ولا produce-total، و«كمية الإنتاج» فارغة).
// ومراجعة الشاشات (كلّ حالة R تفشل على fab1c66): M1 مطابقات الخادم التي ليست بطاقة (أُنشئت بعد القراءة، أو طابقت باركودها) أزرارُ اختيار، ولا «أنشئ»
// لرمز؛ M2 كلّ تغيير في سطور المسوّدة يكتب أساسها = مجموعها، ولوحة كلفة الطنّ لا تُعرض والأساس غير المجموع؛ M3 basis_mismatch يقرأ من جديد
// (بطاقة الخلطة) أو يعيد قراءة المواد (البانية) بجملة لا تذكر «الأساس»؛ M4 ما يمنع «أضف المختار» مكتوب تحته.
// «الخلطة موادّ بلا كميات» (0025، كلمة المالك 2026-11-10): البطاقة المختارة بلا خانة كمية ولا وحدة، ولا «مجموع الخلطة» ولا أساس؛ فـC1 الحفظ يرسل
// p_basis_kg فارغاً والسطور بمعرّفات الموادّ بترتيب الاختيار، وC2 الكثافة وحدها على بطاقة السائل، وC4 «أضف مواد» بلا كمية والتفعيل بنسخة المسوّدة بلا
// أساس يُكتب. وفحوص الأساس وكلفة الطنّ (M2) خرجت معه؛ وM3 صار رفض density_required (البانية تعيد قراءة الكثافة) وmixed_quantities (بطاقة الخلطة تُقرأ من
// جديد)؛ وM4 سبب المنع كثافة سائل؛ وC5 «أنتج» يفتح شاشة الإنتاج على production_form ويرسل produce_batch الحقيقي.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
// createRecipe ليس هنا: الحقيقي يبني طلب create_recipe ويمرّ بـcore البديل.
const MILL = ['loadMill', 'loadBuilder', 'loadRecipe', 'loadBatch', 'addRecipeLine', 'clearRecipeLineQty', 'deleteRecipeLine', 'activateVersion', 'loadMillStores', 'newRecipeVersion', 'loadProduceForm', 'loadRecipeHistory'];
const INVENTORY = ['listItems', 'createItem', 'loadItemPurchases', 'setItemCostPrice', 'findItemTwins', 'loadItem', 'updateItem', 'createExpenseCategory', 'loadStockOnHand'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__mill.call('${n}', a);`).join(' ')}`;
const STUBS = {
  mill: routed('mill', MILL),
  inventory: routed('inventory', INVENTORY),
  session: 'export const useSession = () => globalThis.__mill.session; export const sessionStore = { get: () => globalThis.__mill?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__mill.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'cards-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(mill|inventory)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'cards-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'cards-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};
// core بديل (كما في mill-fixes): call يسجّله globalThis.__mill.rpc، والملفّ الحقيقي يبني الطلب ويقرأ الجواب.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__mill.rpc(fn, args);
export const send = async (make) => ({ result: await make(null), wasOnline: true });
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = (answer) => {
  if (answer.error) throw answer.error;
  const rows = answer.data === null ? [] : Array.isArray(answer.data) ? answer.data : [answer.data];
  if (!rows.length) throw new ZeroRowsError();
  return rows;
};
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'core-stub',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'core-stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'core-stub' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
    "export { parseRecipe } from './src/lib/repo/mill.ts';",
    "export { searchable } from './src/domain/normalize.ts';",
    "export { RejectedError } from './src/lib/errors.ts';",
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
    plugins: [stubs, coreStub],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  if (!select) return;
  select.value = value;
  fire(select, 'change');
};
const click = async (node) => {
  if (node) fire(node, 'click');
  await settle();
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
const cards = () => byAction('material-card').map((node) => node.getAttribute('data-item'));
const cardOf = (id) => byAction('material-card').find((node) => node.getAttribute('data-item') === id);
const pressed = (id) => cardOf(id)?.getAttribute('aria-pressed') ?? null;
const qtyOf = (name) => all().find((node) => node.getAttribute('aria-label') === `كمية «${name}»`);
const densityOf = (name) => all().find((node) => node.getAttribute('aria-label') === `كثافة «${name}» (كغم لكلّ لتر)`);
const textOf = (name) => byAction(name)[0]?.textContent ?? null;
const search = async (value) => {
  type(byAction('search-material').at(-1), value);
  await settle();
};

const MANAGER = {
  status: 'ready',
  workspace: {
    userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
    divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
  },
};
const itemRow = (id, name, kind, baseUnit = 'kg', density = null, version = 1) => ({
  id, version, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [],
});
// المواد كما في منشأة: صالحة للخلطة (ذرة، كسبة، زيت سائل بلا كثافة، كاز وقود سائل) وغير صالحة (علف جاهز، وأكياس بالقطعة).
const CATALOG = [
  itemRow('i-corn', 'ذرة صفراء', 'raw'),
  itemRow('i-soy', 'كسبة صويا', 'raw'),
  itemRow('i-oil', 'زيت', 'raw', 'L', null, 3),
  itemRow('i-diesel', 'كاز المولّدة', 'fuel', 'L', 8_500n),
  itemRow('f-1', 'علف بادئ', 'feed'),
  itemRow('i-bag', 'كيس', 'packaging', 'pc'),
];
const HAND = { 'i-corn': '20000.000', 'i-soy': '1500.500' };
/** جواب items_overview بشكل السلك (المحلّل الحقيقي يقرؤه). */
const overviewJson = () => ({
  today: '2026-11-07', can_record: true, can_add_item: true,
  items: CATALOG.map((row) => ({ id: row.id, name: row.name, kind: row.kind, base_unit: row.baseUnit, on_hand_qty: HAND[row.id] ?? '0.000', purchased_qty: '0.000', last_purchase_on: null, money: { sell_price: null, avg_unit_price: null } })),
});

const recipeLine = (over = {}) => ({
  id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: null, qty: '600.000', unit: 'kg',
  mass_kg: '600.000', share_pct: null, in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false,
  money: { unit_cost: null, cost_price: null, last_price: null }, ...over,
});
/** خلطة «علف بادئ» بنسخة واحدة (مسوّدة أو مفعَّلة) بأساسها المحفوظ وسطورها وكتلتها. */
const recipeJson = ({ status = 'draft', version = 5, basis = '1000.000', lines = [recipeLine()], massKg = '600.000', perTon = '0.00' } = {}) => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: [{ id: 'v-2', version_no: 1, status, basis_kg: basis, materials_only: false, activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version }],
  selected: { id: 'v-2', version_no: 1, status, basis_kg: basis, materials_only: false, note: null, activated_at: null, version },
  lines,
  mass_kg: massKg,
  pick_items: [],
  expense_categories: [],
  money: { rates: [], expected: { materials_per_ton: perTon, rates_per_ton: '0.00', cost_per_ton: perTon, unpriced: perTon === '0.00' ? lines.length : 0, unconverted: 0 } },
});

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const fresh = (handlers, rpc = {}) => {
      const calls = [];
      globalThis.__mill = {
        session: MANAGER,
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
        rpc(fn, args) {
          calls.push([`rpc:${fn}`, [args]]);
          const handler = rpc[fn];
          if (!handler) return new Promise(() => {});
          try {
            return Promise.resolve(handler(args));
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
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      if (root) {
        m.flushSync(() => root.unmount());
        body().textContent = '';
        await settle();
        root = null;
      }
    };

    /** البانية: المواد من items_overview الحقيقي، والبحث من الكتالوج ومعه ما أُنشئ، والحفظ create_recipe الحقيقي. */
    const builder = (over = {}, rpcOver = {}) => {
      const created = [];
      const handlers = {
        loadBuilder: () => ({ feedItems: [{ id: 'f-1', name: 'علف بادئ' }], recipeNames: [], stores: [], categories: [] }),
        listItems: ({ search: query }) => ({ rows: [...CATALOG, ...created].filter((row) => m.searchable(row.name).includes(m.searchable(query))), total: null, next: null }),
        loadItemPurchases: (itemId) => ({ item: { id: itemId, name: 'x', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: null, costPrice: null }, warehouse: null, today: '2026-11-07', next: null, total: 0, rows: [] }),
        loadItem: (id) => CATALOG.find((row) => row.id === id) ?? null,
        findItemTwins: () => [],
        createItem: (fields) => {
          const row = itemRow('i-bran', fields.name, fields.kind, fields.base_unit);
          created.push(row);
          return row;
        },
        ...over,
      };
      const rpc = {
        items_overview: () => overviewJson(),
        create_recipe: (args) => ({ id: args.p_id, version_id: args.p_version_id, version_no: 1, status: args.p_activate ? 'active' : 'draft', lines: args.p_lines.length, rates: args.p_rates.length }),
        ...rpcOver,
      };
      return fresh(handlers, rpc);
    };
    const nameAndOutput = async () => {
      type(byAction('recipe-name')[0], 'علف ناهٍ');
      choose(byAction('recipe-output')[0], 'f-1');
      await settle();
    };

    // ── C1: أكثر من مادّة معاً بلا كميات، ولمسة ثانية تترك، والحفظ يرسل الموادّ بترتيب الاختيار بلا أساس ─────────────────────────────────
    await step('C1', async () => {
      const calls = builder();
      await mount('/mill/new');
      t.same(cards(), ['i-corn', 'i-soy', 'i-oil', 'i-diesel'], 'C1 بطاقة لكلّ مادّة تصلح للخلطة (لا العلف الجاهز ولا القطعة)');
      t.ok(cardOf('i-corn')?.textContent.includes('عندك: 20,000 كغم') && cardOf('i-soy')?.textContent.includes('عندك: 1,500.5 كغم'), `C1 «عندك» على كلّ بطاقة بالكيلوغرام (${cardOf('i-corn')?.textContent})`);
      t.eq(named(calls, 'rpc:items_overview').length, 1, 'C1 البطاقات و«عندك» بقراءة items_overview واحدة');
      t.same([byAction('recipe-basis').length, byAction('card-qty').length], [0, 0], 'C1 لا «أساس الخلطة» يُكتب، ولا خانة كمية');
      await click(cardOf('i-corn'));
      await click(cardOf('i-soy'));
      t.same([pressed('i-corn'), pressed('i-soy'), pressed('i-oil'), byAction('card-qty').length, byAction('builder-sum').length], ['true', 'true', 'false', 0, 0], 'C1 مادّتان مختارتان معاً، مضاءتان، بلا خانة كمية ولا مجموع');
      await click(cardOf('i-soy'));
      t.same([pressed('i-soy'), byAction('remove-line').length], ['false', 1], 'C1 لمسة ثانية تترك المادّة وتخرج من الجدول');
      await click(cardOf('i-soy'));
      await nameAndOutput();
      t.same([disabled(byAction('save-activate')[0]), byAction('save-missing').length], [false, 0], 'C1 الاسم والمنتج والموادّ: «احفظ الخلطة» يعمل بلا كميات');
      await click(byAction('save-activate')[0]);
      const sent = named(calls, 'rpc:create_recipe')[0]?.[0];
      t.same(
        [sent?.p_basis_kg, sent?.p_lines, sent?.p_activate],
        [null, [{ item_id: 'i-corn' }, { item_id: 'i-soy' }], true],
        'C1 create_recipe: p_basis_kg فارغ، والسطور بمعرّفات الموادّ بترتيب الاختيار، والتفعيل فوراً',
      );
      t.ok(globalThis.__mill.location.startsWith('/mill/recipe/'), 'C1 ثمّ تُفتح بطاقة الخلطة');
    });

    // ── C2: سائل بلا كثافة يمنع الحفظ، وكثافته تُكتب على بطاقته ─────────────────────────────────────────────────────────────────
    await step('C2', async () => {
      const calls = builder({ updateItem: (id, version, patch) => itemRow(id, 'زيت', 'raw', 'L', BigInt(patch.density_kg_per_l.replace('.', '')), version + 1) });
      await mount('/mill/new');
      await nameAndOutput();
      await click(cardOf('i-corn'));
      await click(cardOf('i-oil'));
      await settle();
      t.same(named(calls, 'loadItem'), [['i-oil']], 'C2 كثافة السائل تُقرأ حين يُختار (الكيلوغرام لا يحتاجها)');
      t.same([byAction('card-unit').length, byAction('card-qty').length], [0, 0], 'C2 لا وحدة ولا كمية على بطاقة السائل');
      t.ok(textOf('card-density')?.startsWith('«زيت» سائل بلا كثافة، ولا تُحفظ الخلطة به قبلها: اكتب كثافته هنا.'), `C2 البطاقة تقول إنّه بلا كثافة (${textOf('card-density')})`);
      t.eq(disabled(byAction('save-activate')[0]), true, 'C2 لا حفظ وفي المختار سائل بلا كثافة (density_required)');
      t.ok(textOf('save-missing')?.includes('«زيت» سائل بلا كثافة: اكتب كثافته على بطاقته.'), `C2 والسبب تحت الزرّ (${textOf('save-missing')})`);
      t.eq(all().filter((n) => n.localName === 'a' && (n.getAttribute('href') ?? '').startsWith('/inventory')).length, 0, 'C2 ولا رابط يغادر البانية فيضيع المختار');
      type(densityOf('زيت'), '0.92');
      await settle();
      await click(byAction('card-density-save')[0]);
      t.same(named(calls, 'updateItem'), [['i-oil', 3, { density_kg_per_l: '0.9200' }]], 'C2 الكثافة تُحفظ بتعديل المادّة بشرط نسختها');
      t.same([byAction('card-density').length, disabled(byAction('save-activate')[0])], [0, false], 'C2 ثمّ يُفتح الحفظ');
      await click(byAction('save-activate')[0]);
      const sent = named(calls, 'rpc:create_recipe')[0]?.[0];
      t.same([sent?.p_basis_kg, sent?.p_lines], [null, [{ item_id: 'i-corn' }, { item_id: 'i-oil' }]], 'C2 والسائل سطر بمعرّفه وحده (كثافته على المادّة)');
    });

    // ── C3: البحث يصفّي البطاقات، وبلا مطابق «لا مادّة» و«أنشئها» ───────────────────────────────────────────────────────────────
    await step('C3', async () => {
      const calls = builder();
      await mount('/mill/new');
      await search('صويا');
      t.same(cards(), ['i-soy'], 'C3 البحث يصفّي البطاقات فوراً');
      await search('');
      t.eq(cards().length, 4, 'C3 مسح البحث يعيد البطاقات كلّها');
      await search('نخالة');
      await wait(320);
      await settle();
      t.same([cards(), textOf('picker-none')], [[], 'لا مادّة أوّلية باسم «نخالة» في منشأتك.'], 'C3 بلا مطابق: لا بطاقة، والمنتقي لا يسكت');
      t.eq(textOf('create-material'), 'أنشئ «نخالة» مادّةً أوّلية جديدة بالكيلوغرام', 'C3 و«أنشئها» باسمها');
      await click(byAction('create-material')[0]);
      await wait(320);
      await settle();
      t.same([named(calls, 'findItemTwins').map(([name]) => name), named(calls, 'createItem').map(([fields]) => [fields.name, fields.kind, fields.base_unit])], [['نخالة'], [['نخالة', 'raw', 'kg']]], 'C3 «أنشئ» يسأل التوائم ثمّ يُنشئها مادّةً أوّلية بالكيلوغرام');
      t.same([cards(), pressed('i-bran'), byAction('card-qty').length, byAction('create-material').length], [['i-bran'], 'true', 0, 0], 'C3 والمُنشأة بطاقة مختارة تحت البحث (بلا خانة كمية)، ولا «أنشئ» ثانٍ');
    });

    // ── C4: «أضف مواد» بالبطاقات في بطاقة الخلطة بلا كميات، والتفعيل بنسخة المسوّدة ───────────────────────────────────────────────────
    const recipeServer = ({ failOn = null, legacy = false } = {}) => {
      const state = { version: 5, status: 'draft', lines: [recipeLine(legacy ? {} : { qty: null, mass_kg: null })] };
      let reads = 0;
      const handlers = {
        loadItem: (id) => CATALOG.find((row) => row.id === id) ?? null,
        loadRecipe: () => {
          reads += 1;
          return m.parseRecipe({
            ...recipeJson({ status: state.status, version: state.version, basis: legacy ? '1000.000' : null, lines: state.lines, massKg: null }),
            selected: { id: 'v-2', version_no: 1, status: state.status, basis_kg: legacy ? '1000.000' : null, materials_only: !legacy, note: null, activated_at: null, version: state.version },
            versions: [{ id: 'v-2', version_no: 1, status: state.status, basis_kg: legacy ? '1000.000' : null, materials_only: !legacy, activated_at: null, version: state.version }],
            money: { rates: [], expected: null },
          });
        },
        addRecipeLine: (versionId, itemId, ...rest) => {
          if (rest.length) throw new Error(`addRecipeLine بكمية: ${rest.join(',')}`);
          if (itemId === failOn) {
            failOn = null;
            throw new m.RejectedError('item_not_found', 'هذه المادّة غير موجودة في منشأتك أو مؤرشفة. حدّث الشاشة واختر من جديد.');
          }
          const row = CATALOG.find((entry) => entry.id === itemId);
          state.lines.push(recipeLine({ id: `l-${itemId}`, line_no: state.lines.length + 1, item_id: itemId, item_name: row.name, kind: row.kind, base_unit: row.baseUnit, qty: null, unit: row.baseUnit === 'L' ? 'L' : 'kg', mass_kg: null, in_basis: row.kind !== 'fuel', density_missing: row.baseUnit === 'L' && row.density === null }));
          state.version += 1;
          return `l-${itemId}`;
        },
        clearRecipeLineQty: (lineId) => {
          state.lines = state.lines.map((line) => (line.id === lineId ? { ...line, qty: null, mass_kg: null } : line));
          state.version += 1;
          return lineId;
        },
        activateVersion: (versionId, version) => {
          if (version !== state.version) throw new m.RejectedError('stale_draft', 'تغيّرت الخلطة بعد فتحها.');
          state.status = 'active';
          return { ok: true };
        },
      };
      return { state, handlers, reads: () => reads };
    };
    await step('C4', async () => {
      const server = recipeServer({ failOn: 'i-diesel' });
      const calls = fresh(server.handlers, { items_overview: () => overviewJson() });
      await mount('/mill/recipe/r-1');
      t.same(
        [byAction('recipe-total').length, byAction('save-basis').length, byAction('edit-line').length, all().some((n) => n.localName === 'label' && n.textContent === 'أساس الخلطة (كغم)')],
        [0, 0, 0, false],
        'C4 المسوّدة بلا مجموع ولا أساس ولا تعديل كمية',
      );
      t.eq(textOf('add-line'), 'أضف مواد', 'C4 «أضف مواد» (أكثر من مادّة)');
      await click(byAction('add-line')[0]);
      t.same(cards(), ['i-soy', 'i-oil', 'i-diesel'], 'C4 النافذة ببطاقات المواد، بلا المكتوبة في الخلطة');
      await click(cardOf('i-soy'));
      await click(cardOf('i-diesel'));
      await settle();
      t.ok(textOf('add-sum')?.includes('المختار: كسبة صويا، كاز المولّدة') && byAction('card-qty').length === 0, `C4 ما سيُضاف بأسمائه، بلا كميات (${textOf('add-sum')})`);
      await click(byAction('add-lines-save')[0]);
      t.same(named(calls, 'addRecipeLine'), [['v-2', 'i-soy'], ['v-2', 'i-diesel']], 'C4 سطر لكلّ مادّة مختارة بترتيبها، بمعرّفها وحده (لا كمية ولا وحدة)');
      t.ok(text().includes('أُضيفت كسبة صويا، ثمّ توقّفت الإضافة: '), 'C4 رفض في الوسط يُقال باسم ما أُضيف قبله');
      t.same([cards(), pressed('i-diesel')], [['i-oil', 'i-diesel'], 'true'], 'C4 بعد القراءة من جديد: المُضافة خرجت من البطاقات، والباقية مختارة');
      await click(byAction('add-lines-save')[0]);
      t.same([named(calls, 'addRecipeLine').length, byAction('add-lines-save').length], [3, 0], 'C4 الإعادة تضيف الباقية وحدها، وتُغلق النافذة');
      t.eq(disabled(byAction('activate-version')[0]), false, 'C4 «فعّل النسخة» مفتوح');
      await click(byAction('activate-version')[0]);
      t.same(named(calls, 'activateVersion'), [['v-2', 7]], 'C4 التفعيل بنسخة المسوّدة الآن (لا أساس يُكتب قبله)');
      t.eq(server.state.status, 'active', 'C4 فُعّلت');
    });

    // ── مراجعة الشاشات ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('R M1', async () => {
      const late = itemRow('i-late', 'نخالة القمح', 'raw');
      const coded = { ...itemRow('i-corn', 'ذرة صفراء', 'raw'), barcode: '6291000000017' };
      const calls = builder({ listItems: ({ search: query }) => ({ rows: [coded, late].filter((row) => m.searchable(row.name).includes(m.searchable(query)) || row.barcode === query), total: null, next: null }) });
      await mount('/mill/new');
      t.eq(cardOf('i-late'), undefined, 'R M1 ضابط: مادّة أُنشئت بعد قراءة البطاقات لا بطاقة لها');
      await search('نخالة');
      await wait(320);
      await settle();
      const lateButton = byAction('pick-material').find((node) => node.textContent.startsWith('نخالة القمح'));
      t.ok(lateButton !== undefined && byAction('picker-none').length === 0, 'R M1 مطابق الخادم الذي ليس بطاقة زرُّ اختيار (لا صمت ولا «لا مادّة»)');
      await click(lateButton);
      t.same([pressed('i-late'), byAction('remove-line').length], ['true', 1], 'R M1 واختياره يضيفه بطاقةً مختارة وسطراً في الجدول');
      await search('6291000000017');
      await wait(320);
      await settle();
      t.same(
        [byAction('pick-material').map((node) => node.textContent.split(' · ')[0]), byAction('create-material').length],
        [['ذرة صفراء'], 0],
        'R M1 البحث بالباركود: المادّة زرّ اختيار، ولا «أنشئ «6291000000017»» (لا توأم باسم رمز)',
      );
      await click(byAction('pick-material')[0]);
      t.same([pressed('i-corn'), named(calls, 'createItem').length], ['true', 0], 'R M1 فتُختار بطاقتها ولا يُنشأ شيء');
    });
    await step('R M3 بطاقة الخلطة', async () => {
      // مسوّدة جمعت موادّ بكميات وموادّ بلاها من جهاز آخر بعد القراءة: mixed_quantities يقرأ الخلطة من جديد بتلميح الخادم.
      const server = recipeServer();
      let refuse = true;
      const handlers = {
        ...server.handlers,
        activateVersion: (versionId, version) => {
          if (refuse) {
            refuse = false;
            throw new m.RejectedError('mixed_quantities', 'في هذه النسخة موادّ بكميات وموادّ بلا كميات: احذف الكميات كلّها.');
          }
          return server.handlers.activateVersion(versionId, version);
        },
      };
      const calls = fresh(handlers, { items_overview: () => overviewJson() });
      await mount('/mill/recipe/r-1');
      await click(byAction('activate-version')[0]);
      t.same([server.reads(), text().includes('في هذه النسخة موادّ بكميات وموادّ بلا كميات: احذف الكميات كلّها.'), text().includes('قُرئت الخلطة من جديد بما حُفظ الآن')], [2, true, true], 'R M3 mixed_quantities يقرأ الخلطة من جديد ويقول تلميح الخادم');
      await click(byAction('activate-version')[0]);
      t.same([named(calls, 'activateVersion').length, server.state.status], [2, 'active'], 'R M3 والتفعيل التالي بالمقروء الآن ينجح (لا حلقة)');
    });
    await step('R M3 مسوّدة بكميات', async () => {
      // مسوّدة كُتبت بكميات قبل 0025: لا تُفعَّل قبل محو كمياتها («امحُ الكميات» سطراً سطراً)، ثمّ تُفعَّل موادّ بلا كميات.
      const server = recipeServer({ legacy: true });
      const calls = fresh(server.handlers, { items_overview: () => overviewJson() });
      await mount('/mill/recipe/r-1');
      t.same([disabled(byAction('activate-version')[0]), byAction('erase-qty').length], [true, 1], 'R M3 مسوّدة بكميات: «فعّل النسخة» معطّل و«امحُ الكميات» ظاهر');
      await click(byAction('erase-qty')[0]);
      t.same([named(calls, 'clearRecipeLineQty'), byAction('erase-qty').length, disabled(byAction('activate-version')[0])], [[['l-1']], 0, false], 'R M3 «امحُ الكميات» يمحو كمية كلّ سطر بها، ثمّ تُفعَّل');
    });
    await step('R M3 البانية', async () => {
      // كثافة مُحيت من جهاز آخر بعد قراءة البطاقة: density_required يعيد قراءة كثافة المختار، والرفض بتلميحه.
      const calls = builder(
        { updateItem: () => null },
        {
          create_recipe: () => {
            throw new m.RejectedError('density_required', '«زيت» سائل بلا كثافة: اكتب كثافته من «المواد» أوّلاً.');
          },
        },
      );
      const oilRead = { n: 0 };
      globalThis.__mill.call = ((original) => (name, args) => {
        if (name === 'loadItem' && args[0] === 'i-oil') {
          oilRead.n += 1;
          calls.push([name, args]);
          return Promise.resolve(itemRow('i-oil', 'زيت', 'raw', 'L', oilRead.n === 1 ? 9_200n : null, 4));
        }
        return original(name, args);
      })(globalThis.__mill.call.bind(globalThis.__mill));
      await mount('/mill/new');
      await nameAndOutput();
      await click(cardOf('i-corn'));
      await click(cardOf('i-oil'));
      await settle();
      t.eq(byAction('card-density').length, 0, 'R M3 ضابط: الزيت بكثافته المقروءة أوّلاً');
      await click(byAction('save-activate')[0]);
      t.same(
        [named(calls, 'loadItem').filter(([itemId]) => itemId === 'i-oil').length, text().includes('«زيت» سائل بلا كثافة: اكتب كثافته من «المواد» أوّلاً.'), byAction('card-density').length],
        [2, true, 1],
        'R M3 البانية: density_required يعيد قراءة كثافة المختار ويقول تلميح الخادم، والبطاقة تطلب الكثافة',
      );
    });
    await step('R M4', async () => {
      const server = recipeServer();
      fresh(server.handlers, { items_overview: () => overviewJson() });
      await mount('/mill/recipe/r-1');
      await click(byAction('add-line')[0]);
      await click(cardOf('i-soy'));
      await click(cardOf('i-oil'));
      await settle();
      t.same(
        [disabled(byAction('add-lines-save')[0]), textOf('add-missing')],
        [true, '«زيت» سائل بلا كثافة: اكتب كثافته على بطاقته.'],
        'R M4 «أضف المختار» معطّل والسبب تحته (سائل بلا كثافة)',
      );
    });

    // ── C5: «أنتج» من بطاقة الخلطة يفتح شاشة الإنتاج (0025: production_form، وproduce_batch الحقيقي) ────────────────────────────────
    await step('C5', async () => {
      const active = m.parseRecipe(recipeJson({ status: 'active', basis: '1000.000', massKg: '1000.000', lines: [recipeLine({ qty: '1000.000', mass_kg: '1000.000' })] }));
      const calls = fresh(
        {
          loadRecipe: () => active,
          loadProduceForm: () => ({
            today: '2026-11-07',
            recipe: { id: 'r-1', name: 'علف بادئ', archived: false, outputItem: { id: 'f-1', name: 'علف بادئ' } },
            active: { id: 'v-2', versionNo: 1, materialsOnly: false },
            materials: [{ lineNo: 1, itemId: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', density: null, inBasis: true, scaleStep: 100n, defaultQty: 1_000_000n, defaultSource: 'recipe' }],
            last: null,
            stores: [{ id: 'w-raw', name: 'مخزن المواد الأوّلية' }],
            outputStore: { id: 'w-feed', name: 'رصيد العلف' },
            canEditRecipe: true,
            draftExists: false,
            tracksExpiry: false,
          }),
          loadStockOnHand: () => ({ warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw', divisionId: 'd-1', divisionKind: 'feed_mill', archived: false, hasBalance: true }, asOf: '2026-11-07T08:00:00Z', rows: [], next: null, total: 0, money: null }),
        },
        {
          items_overview: () => overviewJson(),
          produce_batch: (args) => ({
            id: args.p_id, status: 'posted', doc_no: 'PD-2026-0001', produced_on: '2026-11-07', recipe_name: 'علف بادئ', output_item_name: 'علف بادئ',
            input_warehouse_name: 'مخزن المواد الأوّلية', output_warehouse_name: 'رصيد العلف', output_qty_kg: '1000.000', input_mass_kg: '1000.000', shrink_kg: '0.000', note: null,
            saved_to_recipe: false, recipe_version_id: 'v-2', version_no: 1,
          }),
        },
      );
      await mount('/mill/recipe/r-1');
      await click(byAction('produce')[0]);
      await settle();
      t.eq(globalThis.__mill.location, '/mill/produce/r-1', 'C5 «أنتج» يفتح شاشة الإنتاج الواحدة');
      t.same([qtyOf('ذرة صفراء')?.value ?? null, byAction('line-source')[0]?.textContent ?? null], ['1,000', 'من الخلطة'], 'C5 خلطة قديمة بكميات بلا إنتاج: الكمية من الخلطة بعلامتها');
      await click(byAction('produce-go')[0]);
      const [args] = named(calls, 'rpc:produce_batch')[0] ?? [];
      t.same(
        [args?.p_recipe, args?.p_expected_version, args?.p_wh_in, args?.p_lines, args?.p_save_recipe, args?.p_draft],
        ['r-1', 'v-2', 'w-raw', [{ item_id: 'i-corn', qty: '1000.000' }], null, false],
        'C5 «أنتج» يرسل produce_batch بالموادّ وكمياتها كما في الشاشة',
      );
      t.eq(textOf('produced-text'), 'دخل 1,000 كغم من «علف بادئ» إلى «رصيد العلف».', 'C5 ثمّ النتيجة');
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
