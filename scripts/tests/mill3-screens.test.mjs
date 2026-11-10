// «ترتيب معمل العلف» (0023، كلمة المالك 2026-11-10؛ عقد scratchpad/mill3/contract-0023.md القسم B1): react-dom/client الحقيقي على DOM صغير
// (dom.mjs) يشغّل MillRoutes الحقيقية، وrepo المعمل الحقيقي (المحلّلات وبناء النداءات) على core بديل يسجّل كلّ نداء ويجيب بأجوبة القاعدة
// (fixtures/mill3-0023.json بمفاتيح العقد: يقرأ هذا الفحص قيمه منها لا من نصوص بخطّ اليد)، وقراءات الجداول المباشرة بسلسلة PostgREST مسجَّلة؛ وrepo
// المخزون والمشتريات والجلسة والتنبيه بدائل. الحالات (كلّها تفشل على الشفرة قبل 0023: لا «رتّب العلائق» ولا أسهم ولا شاشة إنتاج ولا كثافة في «مادّة جديدة»):
// P المحلّلات بكلّ عيّنة وصرامتها؛ M «رتّب العلائق» في المعمل: الترتيب يُرسل كاملاً بشرط ما عُرض، وrecipes_changed يُقال ويُقرأ من جديد ويبقى ترتيب
// المستخدم (ما حُذف يخرج وما أُضيف في آخره)، والأزرار معطّلة أثناء القراءة، وفشلها «أعد القراءة»؛ L ترتيب موادّ المسوّدة (الجدول بـline_no، والأسهم في
// «عدّل الخلطة» وحدها، وlines_changed كذلك، والترتيب المعلّق يقفل الإضافة والتفعيل)؛ B البانية ترسل p_lines بترتيب الجدول بعد «قدّم/أخّر»؛ R شاشة الإنتاج
// الواحدة: المخطّط كما يخطّطه الخادم (الكثافة وخطوة العدّاد)، و«عندك» من المخزن المختار والنقص، والكتلة الحيّة، و«قرّب إلى طنّ» بسطر خلطة (p_actuals)
// أو بمادّة من المخزن (p_extra) أو بسائل (الكثافة والخطوة)، والطلب حرفاً، والنتيجة المرحَّلة والمسوّدة، والرفض بتلميحه بمعرّفين جديدين بعده، والنتيجة
// المجهولة بالمعرّفين أنفسهما، والوزن والهدر وسببه، والانتهاء، واليوم، والطنّ وحدةً، والتعديلات المربوطة بكميتها؛ I الكثافة عند إنشاء مادّة سائلة.
// وتحديث العقد بعد مراجعة القاعدة: «أنتج» والشاشة لـproduction.draft وحده (R10)، والنتيجة بحسب الجواب لا الدور (R7-manager)، و«احفظ مسوّدة» الثانويّ
// (create_production بمعرّف يبقى للإعادة ثمّ صفحة الدفعة، و23505 يفتحها، R11)، والرفوض الجديدة بتلميحها (qty_too_large وstale_preview، وid_conflict
// كالنتيجة المجهولة، R12)، ونقرتان سريعتان طلبٌ واحد؛ وnot_draft في ترتيب الموادّ (L5).
// شروط العيّنات تُفحص أوّلاً (عيّنة لا تحقّقها تفشل باسمها): recipes_overview.ordered فيه ثلاث علائق ظاهرة فأكثر ومحذوفة، ومخزن موادّ ومخزن علف،
// وأولى العلائق بنسخة مفعَّلة؛ recipe_detail.draft مسوّدة بثلاثة سطور فأكثر.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'mill3-0023.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const INVENTORY = ['listItems', 'createItem', 'loadItemPurchases', 'setItemCostPrice', 'findItemTwins', 'loadItem', 'updateItem', 'createExpenseCategory', 'loadStockOnHand', 'createItemUnit', 'setItemSellPrice'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__m3.call('${n}', a);`).join(' ')}`;
const STUBS = {
  inventory: routed('inventory', INVENTORY),
  purchases: routed('purchases', ['loadItemsOverview']),
  session: 'export const useSession = () => globalThis.__m3.session; export const sessionStore = { get: () => globalThis.__m3?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__m3.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'mill3-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchases)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'mill3-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'mill3-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};
// core بديل لملفّات repo: call يسجّله __m3.rpc (المحلّل الحقيقي يقرأ الجواب)، وsend يبني سلسلة PostgREST مسجَّلة يجيبها __m3.tables باسم الجدول.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__m3.rpc(fn, args);
export const send = async (make) => ({ result: await make(globalThis.__m3.db()), wasOnline: true });
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
  name: 'mill3-core',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'mill3-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'mill3-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
    "export { AddItemDialog, addItemFields, liquidDensity, simpleItemFields } from './src/pages/inventory/ItemCreate.tsx';",
    "export { parseRecipes, parseRecipe, parseRecipeOrder, parseLineOrder, parseRecordedProduction, MillShapeError } from './src/lib/repo/mill.ts';",
    "export { plannedQty, plannedMass, massOf, gapQty, nextTon, tonsText, pendingKey, storePending, readPending } from './src/pages/mill/ProducePage.tsx';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { reconcileOrder, moveId, sameOrder } from './src/pages/mill/shared.tsx';",
    "export { RejectedError, UnknownOutcomeError, NetworkError } from './src/lib/errors.ts';",
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
const withId = (action, id) => byAction(action).find((n) => n.getAttribute('data-id') === id);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const text = () => body().textContent;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  if (!select) throw new Error('no select');
  select.value = value;
  fire(select, 'change');
};
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click');
  await settle();
};
const qtyInput = (name) => all().find((n) => n.getAttribute('aria-label') === `كمية «${name}»`);
const bodyRows = () => {
  const tbody = all().find((n) => n.localName === 'tbody');
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : [];
};
const headers = () => all().filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent);
const radio = (label) => all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === label);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** الكمية النصّية بالآلاف (Milli) كما يقرؤها المحلّل. */
const milli = (value) => {
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const units = BigInt(`${whole}${fraction.padEnd(3, '0')}`);
  return value.startsWith('-') ? -units : units;
};
const fils = (value) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(2, '0')}`);
};
/** وعد يُحلّ من خارجه: قراءة تنتظر حتّى يُفحص ما تعرضه الشاشة أثناءها. */
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: true,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws('manager') };
const OPERATOR = { status: 'ready', workspace: ws('mill_operator') };
const ACCOUNTANT = { status: 'ready', workspace: ws('accountant') };

// ── شاشة الإنتاج: خلطة مفعَّلة بشكل recipe_detail (0016) وقراءتا الجدولين، كما في منشأة ─────────────────────────────────────────────
// ذرة 600 وكسبة 377.7 كغم وزيت 20 لتراً (كثافة 0.92 ← 18.4 كغم) وملح 3.9 كغم = 1,000 كغم، والكاز 2 لتر خارج الكتلة؛ وخطوة العدّاد 0.1.
const OVERVIEW = F.recipes_overview.ordered;
const TODAY = OVERVIEW.today;
const RAW = OVERVIEW.stores.find((store) => store.kind === 'raw');
const FEED = OVERVIEW.stores.find((store) => store.kind === 'feed');
const fmt = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const P = { recipe: 'r-prod', version: 'v-prod' };
const line = (id, no, item, name, kind, baseUnit, qty, unit, mass, inBasis = true, over = {}) => ({
  id, line_no: no, item_id: item, item_name: name, kind, base_unit: baseUnit, unit_changed: false, unit_mismatch: false, density_missing: false, in_basis: inBasis,
  category_id: null, category_name: null, qty, unit, mass_kg: mass, share_pct: null, money: { unit_cost: null, cost_price: null, last_price: null }, ...over,
});
const activeJson = ({ tracks = false, status = 'active', archived = false, lineOver = {} } = {}) => ({
  id: P.recipe, name: 'علف بادئ', note: null, archived, version: 3,
  output_item: { id: 'f-prod', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: tracks },
  versions: [{ id: P.version, version_no: 2, status, basis_kg: '1000.000', activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version: 4 }],
  selected: { id: P.version, version_no: 2, status, basis_kg: '1000.000', note: null, activated_at: null, version: 4 },
  lines: [
    line('l-a1', 1, 'i-corn', 'ذرة صفراء', 'raw', 'kg', '600.000', 'kg', '600.000'),
    line('l-a2', 2, 'i-soy', 'كسبة صويا', 'raw', 'kg', '377.700', 'kg', '377.700'),
    line('l-a3', 3, 'i-oil', 'زيت', 'raw', 'L', '20.000', 'L', '18.400', true, lineOver['l-a3'] ?? {}),
    line('l-a4', 4, 'i-salt', 'ملح', 'additive', 'kg', '3.900', 'kg', '3.900'),
    line('l-a5', 5, 'i-diesel', 'كاز المولّدة', 'fuel', 'L', '2.000', 'L', '1.700', false),
  ],
  mass_kg: '1000.000', pick_items: [], expense_categories: [],
  money: { rates: [], expected: { materials_per_ton: '600000.00', rates_per_ton: '0.00', cost_per_ton: '600000.00', unpriced: 0, unconverted: 0 } },
});
const TABLES = {
  recipe_lines: () => [{ id: 'l-a1', density_kg_per_l: null }, { id: 'l-a2', density_kg_per_l: null }, { id: 'l-a3', density_kg_per_l: '0.9200' }, { id: 'l-a4', density_kg_per_l: null }, { id: 'l-a5', density_kg_per_l: '0.8500' }],
  items: () => [
    { id: 'i-corn', base_unit: 'kg', density_kg_per_l: null, scale_step: '0.100' },
    { id: 'i-soy', base_unit: 'kg', density_kg_per_l: null, scale_step: '0.100' },
    // كثافة المادّة الآن غير لقطة السطر: التخطيط بلقطة السطر (create_production: coalesce(لقطة السطر، كثافة المادّة)).
    { id: 'i-oil', base_unit: 'L', density_kg_per_l: '0.9100', scale_step: '0.100' },
    { id: 'i-salt', base_unit: 'kg', density_kg_per_l: null, scale_step: '0.100' },
    { id: 'i-diesel', base_unit: 'L', density_kg_per_l: '0.8500', scale_step: '0.100' },
  ],
};
const stockRow = (itemId, name, kind, baseUnit, available, archived = false) => ({ itemId, name, kind, baseUnit, archived, available, tracksExpiry: false, minQty: null, expired: 0n, nearExpiry: 0n, belowMin: false, categoryId: null, categoryName: null, barcode: null, chickAgeHours: null, oldChicks: 0n, money: null });
const STOCK = [
  stockRow('i-corn', 'ذرة صفراء', 'raw', 'kg', 20_000_000n),
  stockRow('i-soy', 'كسبة صويا', 'raw', 'kg', 300_000n),
  stockRow('i-oil', 'زيت', 'raw', 'L', 500_000n),
  stockRow('i-salt', 'ملح', 'additive', 'kg', 50_000n),
  stockRow('i-diesel', 'كاز المولّدة', 'fuel', 'L', 100_000n),
  stockRow('i-premix', 'برمكس', 'additive', 'kg', 40_000n),
  stockRow('i-lime', 'حجر الكلس', 'raw', 'kg', 200_000n),
  stockRow('i-bag', 'كيس', 'packaging', 'pc', 900_000n),
  stockRow('i-gone', 'برمكس قديم', 'additive', 'kg', 0n, true),
];
const board = (rows) => ({ warehouse: { id: RAW.id, name: RAW.name, kind: 'raw', divisionId: 'd-1', divisionKind: 'feed_mill', archived: false, hasBalance: true }, asOf: '2026-11-10T08:00:00Z', rows, next: null, total: rows.length, money: null });
const itemRow = (id, name, kind, baseUnit, density, scaleStep) => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep, minQty: null, barcode: null, altCodes: [] });
const ITEMS = {
  'i-premix': itemRow('i-premix', 'برمكس', 'additive', 'kg', null, 1n),
  'i-lime': itemRow('i-lime', 'حجر الكلس', 'raw', 'kg', null, 100n),
};
const overviewItems = (rows) => ({ today: TODAY, canRecord: true, canAddItem: true, items: rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, baseUnit: row.baseUnit, onHand: 0n, purchased: 0n, lastPurchaseOn: null, unpricedCount: 0, money: null })) });

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    const fresh = (session, { rpcs = {}, calls = {}, tables = {} } = {}) => {
      // الطلب المعلَّق (S1) خارج المكوّن: كلّ خطوة تبدأ بلا طلب من خطوة قبلها لهذه الخلطة.
      if (session?.workspace) m.storePending(m.pendingKey(`${session.workspace.userId}:${session.workspace.orgId}`, 'r-prod'), null);
      const rpcLog = [];
      const callLog = [];
      const reads = [];
      globalThis.__m3 = {
        session,
        toasts: [],
        location: null,
        db() {
          return {
            from(table) {
              const query = { table, ops: [] };
              const chain = {};
              for (const op of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
                chain[op] = (...args) => {
                  query.ops.push([op, ...args]);
                  return chain;
                };
              }
              chain.then = (resolve, reject) => {
                reads.push(query);
                const handler = tables[query.table];
                const answer = handler ? Promise.resolve().then(() => handler(query)).then((data) => ({ data, error: null, status: 200 })) : new Promise(() => {});
                return answer.then(resolve, reject);
              };
              return chain;
            },
          };
        },
        call(name, args) {
          callLog.push([name, args]);
          const handler = calls[name];
          if (!handler) return new Promise(() => {});
          return Promise.resolve().then(() => handler(...args));
        },
        rpc(fn, args) {
          rpcLog.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          const count = rpcLog.filter(([name]) => name === fn).length;
          return Promise.resolve().then(() => handler(args, count));
        },
      };
      return { rpcLog, callLog, reads };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const refused = (key) => new m.RejectedError(F.refusals[key].code, F.refusals[key].hint);

    const mount = async (url, element = null) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        globalThis.__m3.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }), m.h(m.Route, { path: '*', element: null }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, element ?? m.h(Keyed))));
      await settle();
      await settle();
    };
    const unmount = async () => {
      if (!root) return;
      const mounted = root;
      root = null;
      m.flushSync(() => mounted.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };

    // ── شروط العيّنات ───────────────────────────────────────────────────────────────────────────────────────────────
    const LIVE = OVERVIEW.recipes.filter((recipe) => !recipe.archived).map((recipe) => recipe.id);
    const FIRST = OVERVIEW.recipes.find((recipe) => !recipe.archived);
    t.same(
      [LIVE.length >= 3, OVERVIEW.recipes.some((recipe) => recipe.archived), Boolean(RAW), Boolean(FEED), Boolean(FIRST?.active)],
      [true, true, true, true, true],
      'شرط recipes_overview.ordered: ثلاث علائق ظاهرة فأكثر ومحذوفة، ومخزن موادّ ومخزن علف، وأولى الظاهرة بنسخة مفعَّلة',
    );
    const DRAFT = F.recipe_detail.draft;
    t.same([DRAFT.selected?.status, DRAFT.lines.length >= 3], ['draft', true], 'شرط recipe_detail.draft: مسوّدة بثلاثة سطور فأكثر');
    t.same(
      ['recipes_changed', 'lines_changed', 'production_blocked'].map((key) => [F.refusals[key]?.code, Boolean(F.refusals[key]?.hint)]),
      [['recipes_changed', true], ['lines_changed', true], ['production_blocked', true]],
      'شرط الرفوض بتلميحها',
    );

    // ── P: المحلّلات الحقيقية بأجوبة القاعدة ─────────────────────────────────────────────────────────────────────────
    t.same(m.parseRecipes(clone(OVERVIEW)).map((recipe) => recipe.id), OVERVIEW.recipes.map((recipe) => recipe.id), 'P recipes_overview: ترتيب المصفوفة هو ترتيب العرض (position ثمّ الاسم)');
    t.same(m.parseRecipeOrder(clone(F.set_recipe_order.ok)), { count: F.set_recipe_order.ok.count }, 'P set_recipe_order: العدد');
    t.same(
      m.parseLineOrder(clone(F.set_recipe_line_order.ok)),
      { versionId: F.set_recipe_line_order.ok.version_id, count: F.set_recipe_line_order.ok.count, version: F.set_recipe_line_order.ok.version },
      'P set_recipe_line_order: النسخة وعددها ونسختها بعد الترتيب',
    );
    {
      const sample = F.record_production.posted;
      const parsed = m.parseRecordedProduction(clone(sample));
      t.same(
        [parsed.status, parsed.id, parsed.docNo, parsed.producedOn, parsed.recipeName, parsed.outputItemName, parsed.inputWarehouseName, parsed.outputWarehouseName, parsed.outputQtyKg, parsed.inputMassKg, parsed.shrinkKg, parsed.note],
        ['posted', sample.id, sample.doc_no, sample.produced_on, sample.recipe_name, sample.output_item_name, sample.input_warehouse_name, sample.output_warehouse_name, milli(sample.output_qty_kg), milli(sample.input_mass_kg), milli(sample.shrink_kg), sample.note],
        'P record_production.posted: الحقول والكميات بالآلاف',
      );
      t.same(
        parsed.money,
        sample.money ? { inputValue: fils(sample.money.input_value), extraValue: fils(sample.money.extra_value), totalValue: fils(sample.money.total_value), costPerKg: sample.money.cost_per_kg === null ? null : fils(sample.money.cost_per_kg) } : null,
        'P record_production.posted: المال بالفلس (null لغير أدوار الكلفة)',
      );
      const masked = { ...clone(sample) };
      delete masked.money;
      t.eq(m.parseRecordedProduction(masked).money, null, 'P بلا money (private.mask): null لا رمي');
      const draft = m.parseRecordedProduction(clone(F.record_production.draft));
      t.same([draft.status, draft.id, draft.awaiting, draft.recipeName, draft.plannedKg], ['draft', F.record_production.draft.id, 'costs', F.record_production.draft.recipe_name, milli(F.record_production.draft.planned_kg)], 'P record_production.draft: تنتظر الكلف');
      const broken = (patch) => () => m.parseRecordedProduction({ ...clone(sample), ...patch });
      t.throws(broken({ doc_no: null }), 'P صرامة: مرحَّلة بلا رقم');
      t.throws(broken({ output_qty_kg: null }), 'P صرامة: بلا كمية الناتج (لا «دخل 0 كغم»)');
      t.throws(broken({ status: 'void' }), 'P صرامة: حالة غير معروفة');
      t.throws(() => m.parseRecordedProduction({ ...clone(F.record_production.draft), awaiting: 'post' }), 'P صرامة: مسوّدة تنتظر غير الكلف');
      t.throws(() => m.parseRecordedProduction({ ...clone(F.record_production.draft), planned_kg: null }), 'P صرامة: مسوّدة بلا كمية');
      t.throws(() => m.parseLineOrder({ count: 3, version: 8 }), 'P صرامة: ترتيب سطور بلا نسخة');
      t.throws(() => m.parseRecipeOrder({ count: -1 }), 'P صرامة: عدد سالب');
    }

    // ── O: أدوات الترتيب ───────────────────────────────────────────────────────────────────────────────────────────
    t.same(m.reconcileOrder(['b', 'a', 'c'], ['c', 'a', 'b', 'd']), ['b', 'a', 'c', 'd'], 'O ترتيب المستخدم يبقى والجديد في آخره');
    t.same(m.reconcileOrder(['b', 'a', 'c'], ['a', 'c']), ['a', 'c'], 'O ما حُذف يخرج');
    t.same([m.moveId(['a', 'b', 'c'], 0, 1), m.moveId(['a', 'b', 'c'], 2, -1), m.moveId(['a', 'b'], 0, -1)], [['b', 'a', 'c'], ['a', 'c', 'b'], ['a', 'b']], 'O قدّم وأخّر، وخارج الحدّين كما هو');
    t.same([m.sameOrder(['a', 'b'], ['a', 'b']), m.sameOrder(['a', 'b'], ['b', 'a']), m.sameOrder(['a'], ['a', 'b'])], [true, false, false], 'O الترتيبان واحد');

    // ── X: معادلة التخطيط مرآة create_production ─────────────────────────────────────────────────────────────────
    {
      const kgLine = (lineKg) => ({ lineKg, baseUnit: 'kg', density: null, scaleStep: 100n });
      // 377.7 كغم من 1,000 لـ985 كغم: 372.0345 ← خطوات 0.1 بتقريب واحد ← 372.0؛ و3.9 ← 3.8415 ← 3.8؛ ولـ1,500: 566.55 ← 566.6 (نصفاً بعيداً عن الصفر).
      t.same([m.plannedQty(kgLine(377_700n), 985_000n, 1_000_000n), m.plannedQty(kgLine(3_900n), 985_000n, 1_000_000n), m.plannedQty(kgLine(377_700n), 1_500_000n, 1_000_000n)], [372_000n, 3_800n, 566_600n], 'X المخطّط بخطوة العدّاد بتقريب واحد');
      // زيت 18.4 كغم في الخلطة بلقطة كثافة 0.92: لـ985 كغم 19.7 لتر (لا من الكتلة المقرّبة)، ولـ1,500 كغم 30 لتراً.
      const oil = { lineKg: 18_400n, baseUnit: 'L', density: 9_200n, scaleStep: 100n };
      t.same([m.plannedQty(oil, 985_000n, 1_000_000n), m.plannedQty(oil, 1_500_000n, 1_000_000n)], [19_700n, 30_000n], 'X السائل: كتلة السطر ÷ (الأساس × الكثافة × الخطوة)');
      t.eq(m.plannedQty({ ...oil, density: null }, 985_000n, 1_000_000n), null, 'X سائل بلا كثافة لا يُخطَّط');
      t.same([m.plannedQty({ ...kgLine(377_700n), scaleStep: 0n }, 985_000n, 1_000_000n), m.plannedMass(377_700n, 985_000n, 1_000_000n)], [372_035n, 372_035n], 'X بلا خطوة: ثلاث مراتب، والكتلة المخطّطة بتقريب واحد');
      t.same([m.massOf(19_700n, 'L', 9_200n), m.massOf(591_000n, 'kg', null), m.massOf(1n, 'L', null)], [18_124n, 591_000n, null], 'X الكتلة: اللتر × الكثافة بثلاث مراتب');
      // الفرق 15.076 كغم: سطر بالكيلوغرام بالفرق نفسه، ومادّة تُضاف بخطوة 0.1 مرفوعةً 15.1، وبخطوة 0.001 بالضبط، والزيت (19.7 لتر) أقلّ خطوات تبلغه: 16.4 لتر.
      t.same(
        [m.gapQty(591_000n, 15_076n, 'kg', null, 100n, true), m.gapQty(0n, 15_076n, 'kg', null, 100n, false), m.gapQty(0n, 15_076n, 'kg', null, 1n, false), m.gapQty(19_700n, 15_076n, 'L', 9_200n, 100n, true)],
        [15_076n, 15_100n, 15_076n, 16_400n],
        'X «قرّب»: كيلوغرام بالضبط، ومضافة بخطوة عدّادها، ولتر بأقلّ خطوات تبلغ الفرق',
      );
      t.same([m.gapQty(0n, 15_076n, 'L', null, 100n, false), m.gapQty(0n, 0n, 'kg', null, 100n, true)], [null, null], 'X سائل بلا كثافة أو بلا فرق: لا إكمال');
      t.same([m.nextTon(984_924n), m.nextTon(1_000_000n), m.nextTon(1_500_100n)], [1_000_000n, 1_000_000n, 2_000_000n], 'X الطنّ التالي');
      t.same([m.tonsText(1_000_000n), m.tonsText(2_000_000n), m.tonsText(3_000_000n), m.tonsText(12_000_000n), m.tonsText(100_000_000n)], ['طنّ واحد', 'طنّين', '3 أطنان', '12 طنّاً', '100 طنّ'], 'X الأطنان بالفصحى بعد حرف جرّ');
    }

    const millRpcs = (over = {}) => ({
      recipes_overview: () => clone(OVERVIEW),
      productions_overview: () => ({ drafts: [], rows: [], total: 0 }),
      ...over,
    });

    // ── M: «رتّب العلائق» في المعمل ───────────────────────────────────────────────────────────────────────────────
    await step('M1', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: millRpcs({ set_recipe_order: () => clone(F.set_recipe_order.ok) }) });
      await mount('/mill');
      t.eq(byAction('arrange-recipes').length, 1, 'M1 «رتّب العلائق» للمدير');
      await click(byAction('arrange-recipes')[0]);
      t.same(byAction('arrange-card').map((n) => n.getAttribute('data-id')), LIVE, 'M1 العلائق الظاهرة بترتيب الخادم (لا المحذوفة)');
      t.same([disabled(byAction('save-arrangement')[0]), disabled(withId('recipe-up', LIVE[0])), disabled(withId('recipe-down', LIVE.at(-1)))], [true, true, true], 'M1 «احفظ» معطّل بلا تغيير، والأولى بلا «قدّم» والأخيرة بلا «أخّر»');
      await click(withId('recipe-down', LIVE[0]));
      const moved = [LIVE[1], LIVE[0], ...LIVE.slice(2)];
      t.same(byAction('arrange-card').map((n) => n.getAttribute('data-id')), moved, 'M1 «أخّر» ينقل العليقة مرتبة');
      const before = named(rpcLog, 'recipes_overview').length;
      await click(byAction('save-arrangement')[0]);
      t.same(named(rpcLog, 'set_recipe_order'), [{ p_ids: moved, p_expected: LIVE }], 'M1 set_recipe_order بالترتيب الجديد كاملاً وشرطه الترتيب الذي عُرض');
      t.same([globalThis.__m3.toasts.at(-1)?.title, byAction('arranging').length, named(rpcLog, 'recipes_overview').length > before], ['حُفظ ترتيب العلائق.', 0, true], 'M1 بعد الحفظ: تنبيه، ويُغلق الترتيب، ويُقرأ المعمل من جديد');
    });
    await step('M2', async () => {
      const reread = deferred();
      // الخادم بعد الرفض: الترتيب تغيّر (الأخيرة صارت أولى) وأُضيفت عليقة.
      const added = { ...clone(OVERVIEW.recipes.find((recipe) => !recipe.archived)), id: 'a1111111-0000-4000-8000-0000000000aa', name: 'علف تسمين' };
      const live = OVERVIEW.recipes.filter((recipe) => !recipe.archived);
      const changed = { ...clone(OVERVIEW), recipes: [clone(live.at(-1)), ...clone(live.slice(0, -1)), added, ...clone(OVERVIEW.recipes.filter((recipe) => recipe.archived))] };
      const serverNow = [live.at(-1).id, ...live.slice(0, -1).map((recipe) => recipe.id), added.id];
      const { rpcLog } = fresh(MANAGER, {
        rpcs: millRpcs({
          recipes_overview: (_args, n) => (n === 1 ? clone(OVERVIEW) : n === 2 ? reread.promise : clone(changed)),
          set_recipe_order: (_args, n) => {
            if (n === 1) throw refused('recipes_changed');
            return clone(F.set_recipe_order.ok);
          },
        }),
      });
      await mount('/mill');
      await click(byAction('arrange-recipes')[0]);
      await click(withId('recipe-down', LIVE[0]));
      const mine = [LIVE[1], LIVE[0], ...LIVE.slice(2)];
      await click(byAction('save-arrangement')[0]);
      t.ok(textOf('arrange-changed')?.includes(F.refusals.recipes_changed.hint) && textOf('arrange-changed')?.includes('جارٍ قراءة العلائق من جديد'), `M2 recipes_changed: تلميح الخادم وأنّ العلائق تُقرأ (${textOf('arrange-changed')})`);
      t.same(
        [disabled(byAction('save-arrangement')[0]), disabled(withId('recipe-up', LIVE[1])), byAction('arrange-card').map((n) => n.getAttribute('data-id'))],
        [true, true, mine],
        'M2 أثناء القراءة: «احفظ» والأسهم معطّلة، وترتيب المستخدم باقٍ',
      );
      reread.resolve(clone(changed));
      await settle();
      const kept = [...mine, added.id];
      t.same(byAction('arrange-card').map((n) => n.getAttribute('data-id')), kept, 'M2 بعد القراءة: ترتيب المستخدم باقٍ والعليقة الجديدة في آخره');
      t.ok(textOf('arrange-changed')?.includes('ترتيبك باقٍ'), 'M2 والجملة تقول إنّ الترتيب باقٍ ليُحفظ');
      await click(byAction('save-arrangement')[0]);
      t.same(named(rpcLog, 'set_recipe_order')[1], { p_ids: kept, p_expected: serverNow }, 'M2 الحفظ الثاني بشرط ما قُرئ بعد الرفض لا ما قبله');
    });
    await step('M3', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: millRpcs({
          recipes_overview: (_args, n) => {
            if (n === 2) throw new m.NetworkError();
            return clone(OVERVIEW);
          },
          set_recipe_order: (_args, n) => {
            if (n === 1) throw refused('recipes_changed');
            return clone(F.set_recipe_order.ok);
          },
        }),
      });
      await mount('/mill');
      await click(byAction('arrange-recipes')[0]);
      await click(withId('recipe-down', LIVE[0]));
      await click(byAction('save-arrangement')[0]);
      t.ok(textOf('arrange-changed')?.includes('تعذّرت قراءة العلائق من جديد') && byAction('arrange-reread').length === 1 && disabled(byAction('save-arrangement')[0]), 'M3 فشل القراءة بعد الرفض: يُقال، و«أعد القراءة»، والحفظ مقفول');
      await click(byAction('arrange-reread')[0]);
      t.same([disabled(byAction('save-arrangement')[0]), named(rpcLog, 'recipes_overview').length], [false, 3], 'M3 «أعد القراءة» يقرأ، ثمّ يُحفظ الترتيب');
      await click(byAction('cancel-arrangement')[0]);
      t.same([byAction('arranging').length, named(rpcLog, 'set_recipe_order').length], [0, 1], 'M3 «تراجع» يغلق الترتيب بلا نداء');
    });
    await step('M4', async () => {
      fresh(OPERATOR, { rpcs: millRpcs() });
      await mount('/mill');
      t.same([byAction('arrange-recipes').length, byAction('open-recipe').length >= LIVE.length], [0, true], 'M4 مشغّل المعمل بلا «رتّب العلائق»');
    });

    // ── R1: «أنتج» يفتح شاشة الإنتاج الواحدة ──────────────────────────────────────────────────────────────────────────
    await step('R1', async () => {
      fresh(MANAGER, { rpcs: millRpcs() });
      await mount('/mill');
      const first = byAction('produce')[0];
      await click(first);
      t.eq(globalThis.__m3.location, `/mill/produce/${FIRST.id}`, 'R1 «أنتج» على بطاقة العليقة يفتح شاشة الإنتاج (لا نافذة)');
      await unmount();
      fresh(MANAGER, { rpcs: { recipe_detail: () => activeJson() }, calls: { loadItemsOverview: () => overviewItems([]) } });
      await mount(`/mill/recipe/${P.recipe}`);
      await click(byAction('produce')[0]);
      t.eq(globalThis.__m3.location, `/mill/produce/${P.recipe}`, 'R1 و«أنتج» في صفحة العليقة كذلك');
    });

    const produceSetup = (session, { detail = activeJson(), record = () => clone(F.record_production.posted), create = (args) => ({ id: args.p_id, status: 'draft' }), stock = STOCK } = {}) =>
      fresh(session, {
        rpcs: { recipes_overview: () => clone(OVERVIEW), recipe_detail: () => clone(detail), record_production: record, create_production: create },
        calls: { loadStockOnHand: () => board(stock), loadItem: (id) => ITEMS[id] ?? null },
        tables: TABLES,
      });

    // ── R2: المخطّط كما يخطّطه الخادم، و«عندك»، والكتلة الحيّة ───────────────────────────────────────────────────────────
    await step('R2', async () => {
      const { reads, callLog } = produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      const field = byAction('produce-qty')[0];
      const label = field ? all().find((n) => n.localName === 'label' && n.getAttribute('for') === field.getAttribute('id'))?.textContent : null;
      t.same([label, field?.value, textOf('produce-total')], ['كم تنتج؟', '1,000', 'مجموع الخلطة 1,000 كغم: الناتج قبل الهدر = مجموع المواد المسحوبة.'], 'R2 «كم تنتج؟» يبدأ بمجموع الخلطة');
      t.same(byAction('quick-qty').map((n) => n.textContent), ['نصف طنّ', 'طنّ', 'طنّان', '5 أطنان'], 'R2 أربع كميات سريعة');
      t.same(
        reads.map((read) => [read.table, read.ops.find(([op]) => op === 'eq' || op === 'in')]),
        [['recipe_lines', ['eq', 'version_id', P.version]], ['items', ['in', 'id', ['i-corn', 'i-soy', 'i-oil', 'i-salt', 'i-diesel']]]],
        'R2 لقطات كثافة السطور ومواد الخلطة تُقرأ بنسختها المفعَّلة',
      );
      t.same(named(callLog, 'loadStockOnHand')[0], [RAW.id, null], 'R2 «عندك» من مخزن المواد المختار');
      t.ok(headers().includes(`عندك في «${RAW.name}»`), `R2 عمود «عندك» يسمّي المخزن (${headers().join(' | ')})`);
      t.eq(textOf('produce-mass'), 'كتلة المواد = الناتج المتوقّع: 1,000 كغم (قبل الهدر)', 'R2 بمجموع الخلطة: الكتلة طنّ كامل');
      t.same([byAction('round-ton').length, byAction('out-of-basis').length], [0, 1], 'R2 الطنّ كامل فلا «قرّب»، والكاز «خارج الكتلة»');
      type(byAction('produce-qty')[0], '985');
      await settle();
      t.same(
        ['ذرة صفراء', 'كسبة صويا', 'زيت', 'ملح', 'كاز المولّدة'].map((name) => qtyInput(name)?.value),
        ['591', '372', '19.7', '3.8', '2'],
        'R2 لـ985 كغم: كلّ مادّة بنسبتها وبخطوة عدّادها (الزيت 19.7 لتراً بلقطة كثافة السطر 0.92 لا كثافة المادّة 0.91)',
      );
      t.same(bodyRows().map((row) => row[1]), ['591.0', '372.0', '19.7', '3.8', '2.0'], 'R2 عمود «المخطّط» بمراتب ثابتة');
      t.eq(textOf('produce-mass'), 'كتلة المواد = الناتج المتوقّع: 984.924 كغم (قبل الهدر)', 'R2 الكتلة حيّة: 591 + 372 + 18.124 (19.7 لتر × 0.92) + 3.8، والكاز خارجها');
      t.ok(withId('line-short', 'i-soy')?.textContent === 'ينقص 72 كغم' && text().includes('المخزن لا يكفي هذه الكميات: كسبة صويا.'), 'R2 النقص على سطره وفي جملة');
      t.eq(textOf('round-ton'), 'قرّب إلى طنّ واحد (+15.076 كغم)', 'R2 «قرّب إلى طنّ واحد» بالفرق');
      type(qtyInput('كسبة صويا'), '300');
      await settle();
      t.same([textOf('produce-mass'), withId('line-short', 'i-soy'), textOf('round-ton')], ['كتلة المواد = الناتج المتوقّع: 912.924 كغم (قبل الهدر)', undefined, 'قرّب إلى طنّ واحد (+87.076 كغم)'], 'R2 تعديل الكمية يغيّر الكتلة والفرق، ويزول النقص');
    });

    // ── R3: «قرّب» بسطر خلطة بالكيلوغرام ثمّ التراجع، ثمّ بمادّة من المخزن، والطلب حرفاً ──────────────────────────────────────
    await step('R3', async () => {
      const { rpcLog } = produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      type(byAction('produce-qty')[0], '985');
      await settle();
      await click(byAction('round-ton')[0]);
      t.ok(text().includes('من أيّ مادّة يُكمَل الفرق (15.076 كغم)؟'), 'R3 «قرّب» يسأل من أيّ مادّة يُكمَل الفرق');
      t.same(
        byAction('complete-option').map((n) => n.getAttribute('data-id')),
        ['i-corn', 'i-soy', 'i-oil', 'i-salt', 'i-premix', 'i-lime'],
        'R3 موادّ الخلطة أوّلاً ثمّ موادّ المخزن الصالحة (لا الكاز الخارج عن الكتلة ولا الكيس بالقطعة ولا المؤرشفة)',
      );
      type(byAction('complete-search')[0], 'ذرة');
      await settle();
      t.same(byAction('complete-option').map((n) => n.getAttribute('data-id')), ['i-corn'], 'R3 الاسم يصفّي المرشّحات');
      await click(byAction('complete-option')[0]);
      t.same(
        [qtyInput('ذرة صفراء')?.value, textOf('produce-mass'), textOf('round-added'), textOf('round-note')?.startsWith('+15.076 كغم من «ذرة صفراء» لإكمال طنّ واحد.'), byAction('round-ton').length],
        ['606.076', 'كتلة المواد = الناتج المتوقّع: 1,000 كغم (قبل الهدر)', '+15.076 كغم لإكمال طنّ واحد', true, 0],
        'R3 الفرق كلّه على الذرة: كميتها 606.076 والمجموع طنّ بالضبط، والإضافة ظاهرة على سطرها وتحت الجدول',
      );
      await click(byAction('undo-round')[0]);
      t.same([qtyInput('ذرة صفراء')?.value, textOf('produce-mass'), byAction('round-note').length], ['591', 'كتلة المواد = الناتج المتوقّع: 984.924 كغم (قبل الهدر)', 0], 'R3 «تراجع عن الإكمال» يعيد السطر كما كان');
      await click(byAction('round-ton')[0]);
      type(byAction('complete-search')[0], 'برمكس');
      await settle();
      t.same(byAction('complete-option').map((n) => n.getAttribute('data-id')), ['i-premix'], 'R3 «برمكس» من المخزن (والمؤرشفة بالاسم نفسه لا تُعرض)');
      await click(byAction('complete-option')[0]);
      const extraRow = bodyRows().find((row) => row[0].startsWith('برمكس'));
      t.ok(extraRow && extraRow[0].includes('+15.076 كغم لإكمال طنّ واحد') && extraRow[2] === '15.076', `R3 «برمكس» سطر مضاف بالفرق كلّه (${extraRow})`);
      t.eq(textOf('produce-mass'), 'كتلة المواد = الناتج المتوقّع: 1,000 كغم (قبل الهدر)', 'R3 والمجموع طنّ بالضبط');
      type(byAction('produce-note')[0], '  أكملنا الطنّ بالبرمكس  ');
      await settle();
      await click(byAction('produce-go')[0]);
      const [sent] = named(rpcLog, 'record_production');
      t.ok(UUID.test(sent?.p_id ?? '') && UUID.test(sent?.p_client_ref ?? '') && UUID.test(sent?.p_extra?.[0]?.id ?? ''), 'R3 معرّف الدفعة ومرجع المحاولة ومعرّف السطر المضاف من الجهاز');
      t.same(
        { ...sent, p_id: 'ID', p_client_ref: 'REF', p_extra: sent?.p_extra?.map((row) => ({ ...row, id: 'EXTRA' })) },
        {
          p_id: 'ID', p_recipe_version: P.version, p_planned_kg: '985.000', p_wh_in: RAW.id, p_wh_out: FEED.id, p_produced_on: TODAY, p_actuals: [],
          p_extra: [{ id: 'EXTRA', item_id: 'i-premix', qty: '15.076' }], p_output_kg: null, p_expiry: null, p_shrink_reason: null, p_note: 'أكملنا الطنّ بالبرمكس', p_client_ref: 'REF',
        },
        'R3 record_production: الكمية المختارة، ولا فعلية والمواد على المخطّط، والفرق سطرٌ مضاف (p_extra)، والملاحظة مقصوصة',
      );
      const posted = F.record_production.posted;
      t.eq(textOf('produced-text'), `دخل ${kgOfText(posted.output_qty_kg)} من «${posted.output_item_name}» إلى «${posted.output_warehouse_name}».`, 'R3 النتيجة: كم دخل العلف وأين');
      t.same(
        [textOf('produced-doc'), byAction('result-batch')[0]?.getAttribute('href'), byAction('result-report')[0]?.getAttribute('href'), byAction('produced-cost').length === (posted.money?.cost_per_kg ? 1 : 0)],
        [posted.doc_no, `/mill/batch/${posted.id}`, `/mill/recipe/${P.recipe}/report`, true],
        'R3 رقم الدفعة ورابطاها (صفحتها وتقرير العليقة) وكلفة الكيلو لأدوار الكلفة',
      );
    });

    // ── R4: «قرّب» بسائل في الخلطة (الكثافة وخطوة العدّاد) ─────────────────────────────────────────────────────────────
    await step('R4', async () => {
      const { rpcLog } = produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      type(byAction('produce-qty')[0], '985');
      await settle();
      await click(byAction('round-ton')[0]);
      await click(withId('complete-option', 'i-oil'));
      t.same(
        [qtyInput('زيت')?.value, textOf('produce-mass'), textOf('round-note')?.includes('+16.4 لتر من «زيت» لإكمال طنّ واحد.'), textOf('round-note')?.includes('المجموع 1,000.012 كغم: لا يبلغ الطنّ بالضبط بخطوة عدّاد «زيت».'), byAction('round-ton').length],
        ['36.1', 'كتلة المواد = الناتج المتوقّع: 1,000.012 كغم (قبل الهدر)', true, true, 0],
        'R4 الزيت: 16.4 لتر (أقلّ خطوات 0.1 تبلغ 15.076 كغم بكثافة 0.92)، والمجموع فوق الطنّ يُقال ولا يُعاد «قرّب»',
      );
      await click(byAction('produce-go')[0]);
      t.same([named(rpcLog, 'record_production')[0]?.p_actuals, named(rpcLog, 'record_production')[0]?.p_extra], [[{ line_no: 3, qty: '36.100' }], []], 'R4 سطر الخلطة يُرسل كمية فعلية (p_actuals) بلا سطر مضاف');
    });
    await step('R4-step', async () => {
      const { rpcLog } = produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      type(byAction('produce-qty')[0], '985');
      await settle();
      await click(byAction('round-ton')[0]);
      await click(withId('complete-option', 'i-lime'));
      t.ok(textOf('round-note')?.includes('+15.1 كغم من «حجر الكلس»') && textOf('round-note')?.includes('المجموع 1,000.024 كغم'), `R4 مادّة مضافة بخطوة 0.1: 15.1 كغم والمجموع يُقال (${textOf('round-note')})`);
      await click(byAction('produce-go')[0]);
      t.same(named(rpcLog, 'record_production')[0]?.p_extra?.map((row) => [row.item_id, row.qty]), [['i-lime', '15.100']], 'R4 الكمية المرسلة مضاعف خطوة العدّاد (الخادم لا يغيّرها)');
    });

    // ── R5: الرفض بتلميحه والمكتوب باقٍ، والمحاولة التالية بمعرّفين جديدين ─────────────────────────────────────────────
    await step('R5', async () => {
      const { rpcLog } = produceSetup(MANAGER, {
        record: (_args, n) => {
          if (n === 1) throw refused('production_blocked');
          return clone(F.record_production.posted);
        },
      });
      await mount(`/mill/produce/${P.recipe}`);
      type(byAction('produce-qty')[0], '985');
      await settle();
      type(qtyInput('ملح'), '4.2');
      await settle();
      await click(byAction('produce-go')[0]);
      t.ok(text().includes(F.refusals.production_blocked.hint), 'R5 production_blocked: تلميح الخادم كما هو');
      t.same([byAction('produce-qty')[0]?.value, qtyInput('ملح')?.value, disabled(byAction('produce-go')[0])], ['985', '4.2', false], 'R5 المكتوب باقٍ و«أنتج» متاح');
      await click(byAction('produce-go')[0]);
      const [first, second] = named(rpcLog, 'record_production');
      t.same([first?.p_actuals, second?.p_actuals], [[{ line_no: 4, qty: '4.200' }], [{ line_no: 4, qty: '4.200' }]], 'R5 السطر المعدَّل وحده كمية فعلية');
      t.ok(first.p_id !== second.p_id && first.p_client_ref !== second.p_client_ref, 'R5 بعد رفض أكيد: المحاولة التالية بمعرّف ومرجع جديدين');
      t.eq(byAction('produced-posted').length, 1, 'R5 ثمّ تمّ الإنتاج');
    });

    // ── R6: النتيجة المجهولة تجمّد الشاشة، والإعادة بالطلب نفسه حرفاً ──────────────────────────────────────────────────
    await step('R6', async () => {
      const { rpcLog } = produceSetup(MANAGER, {
        record: (_args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          if (n === 2) throw new m.NetworkError();
          return clone(F.record_production.posted);
        },
      });
      await mount(`/mill/produce/${P.recipe}`);
      await click(byAction('produce-go')[0]);
      t.ok(text().includes('لا نعرف إن سُجّل الإنتاج') && byAction('retry-produce').length === 1 && byAction('produce-go').length === 0, 'R6 نتيجة مجهولة: «أعد المحاولة» وحده');
      t.same([disabled(byAction('produce-qty')[0]), disabled(qtyInput('ذرة صفراء')), disabled(byAction('produce-note')[0])], [true, true, true], 'R6 والمكتوب مقفول حتّى تُعرف النتيجة');
      await click(byAction('retry-produce')[0]);
      t.ok(text().includes('لم تصل الإعادة إلى الخادم') && byAction('retry-produce').length === 1, 'R6 إعادة لم تصل: تبقى الشاشة مجمَّدة');
      await click(byAction('retry-produce')[0]);
      const sent = named(rpcLog, 'record_production');
      t.same([sent.length, sent[1], sent[2]], [3, sent[0], sent[0]], 'R6 كلّ إعادة بالطلب نفسه حرفاً (المعرّف والمرجع نفسيهما): لا دفعة ثانية');
      t.eq(byAction('produced-posted').length, 1, 'R6 ثمّ النتيجة');
    });

    // ── R7: مشغّل المعمل: مسوّدة تنتظر ختم الكلف ────────────────────────────────────────────────────────────────────
    await step('R7', async () => {
      produceSetup(OPERATOR, { record: () => clone(F.record_production.draft) });
      await mount(`/mill/produce/${P.recipe}`);
      await click(byAction('produce-go')[0]);
      const draft = F.record_production.draft;
      t.ok(
        textOf('produced-draft-text')?.includes(`«${draft.recipe_name}» (المخطّط ${kgOfText(draft.planned_kg)})`) && textOf('produced-draft-text')?.includes('«اختم الكلف»'),
        `R7 حُفظت مسوّدة تنتظر ختم الكلف (${textOf('produced-draft-text')})`,
      );
      t.same([byAction('result-batch')[0]?.getAttribute('href'), byAction('result-report').length], [`/mill/batch/${draft.id}`, 0], 'R7 برابط صفحة الدفعة (هناك تُختم وتُرحَّل)');
    });
    // جواب المسوّدة لأيّ دور (العقد بعد مراجعة القاعدة): مدير لا يرى نطاقُه وحدة التكاليف يأخذه أيضاً، والشاشة تتبع الجواب لا الدور.
    await step('R7-manager', async () => {
      produceSetup(MANAGER, { record: () => clone(F.record_production.draft) });
      await mount(`/mill/produce/${P.recipe}`);
      await click(byAction('produce-go')[0]);
      t.same([byAction('produced-draft').length, byAction('produced-posted').length], [1, 0], 'R7 المدير بجواب المسوّدة: «تنتظر ختم الكلف» لا «تمّ الإنتاج»');
    });

    // ── R8: الوزن والهدر وسببه، ويوم الإنتاج، والطنّ وحدةً ───────────────────────────────────────────────────────────
    await step('R8', async () => {
      const { rpcLog } = produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      type(byAction('produce-qty')[0], '985');
      await settle();
      await click(byAction('weighed-toggle')[0]);
      t.ok(disabled(byAction('produce-go')[0]) && textOf('produce-missing')?.includes('اكتب وزن الناتج، أو أغلق «وزنت الناتج؟».'), 'R8 «وزنت الناتج؟» بلا وزن: لا يُنتَج');
      type(byAction('output-weight')[0], '980');
      await settle();
      t.same([textOf('waste'), byAction('waste-reason').length, disabled(byAction('produce-go')[0])], ['الهدر 4.924 كغم (0.50٪ من كتلة المواد).', 0, false], 'R8 الهدر داخل المدى: بلا سبب');
      type(byAction('output-weight')[0], '950');
      await settle();
      t.ok(byAction('waste-reason').length === 1 && disabled(byAction('produce-go')[0]) && textOf('produce-missing')?.includes('الهدر خارج المدى المقبول'), 'R8 هدر 3.55٪: سببه مطلوب قبل «أنتج»');
      type(byAction('waste-reason')[0], 'تسرّب من الخلّاط');
      await settle();
      type(byAction('produced-on')[0], fmt(shift(TODAY, 1)));
      await settle();
      t.ok(disabled(byAction('produce-go')[0]) && textOf('produce-missing')?.includes('يوم الإنتاج بعد اليوم'), 'R8 يوم بعد اليوم: لا يُنتَج');
      type(byAction('produced-on')[0], fmt(shift(TODAY, -1)));
      await settle();
      await click(byAction('produce-go')[0]);
      const sent = named(rpcLog, 'record_production')[0];
      t.same([sent?.p_output_kg, sent?.p_shrink_reason, sent?.p_produced_on], ['950.000', 'تسرّب من الخلّاط', shift(TODAY, -1)], 'R8 الوزن والسبب واليوم المكتوب');
      await unmount();

      const { rpcLog: second } = produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      choose(byAction('produce-unit')[0], 'ton');
      type(byAction('produce-qty')[0], '1.5');
      await settle();
      t.same(
        [['ذرة صفراء', 'كسبة صويا', 'زيت', 'ملح'].map((name) => qtyInput(name)?.value), textOf('round-ton')],
        [['900', '566.6', '30', '5.9'], 'قرّب إلى طنّين (+499.9 كغم)'],
        'R8 بالطنّ: 1.5 طنّ = 1,500 كغم، و«قرّب إلى طنّين»',
      );
      await click(byAction('produce-go')[0]);
      t.eq(named(second, 'record_production')[0]?.p_planned_kg, '1500.000', 'R8 الكمية تُرسل بالكيلوغرام');
    });

    // ── R9: التعديلات مربوطة بكميتها ─────────────────────────────────────────────────────────────────────────────────
    await step('R9', async () => {
      produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      type(byAction('produce-qty')[0], '985');
      await settle();
      type(qtyInput('كسبة صويا'), '300');
      await settle();
      await click(byAction('quick-qty')[1]);
      t.same(
        [byAction('produce-qty')[0]?.value, qtyInput('كسبة صويا')?.value, text().includes('تعديلاتك على المواد كانت لكمية 985 كغم')],
        ['1,000', '377.7', true],
        'R9 تغيير الكمية بعد التعديل: المواد على مخطّط الكمية الجديدة، والتعديلات تُقال لا تُطبَّق على غير كميتها',
      );
      await click(byAction('restore-qty')[0]);
      t.same([byAction('produce-qty')[0]?.value, qtyInput('كسبة صويا')?.value, byAction('restore-qty').length], ['985', '300', 0], 'R9 «أرجع الكمية» يعيدها ويعيد التعديلات');
    });

    // ── R10: الانتهاء، وسطر لا يُنتَج به، وبلا نسخة مفعَّلة، ومن لا يسجّل الإنتاج ─────────────────────────────────────────────
    await step('R10', async () => {
      const { rpcLog } = produceSetup(MANAGER, { detail: activeJson({ tracks: true }) });
      await mount(`/mill/produce/${P.recipe}`);
      t.ok(disabled(byAction('produce-go')[0]) && textOf('produce-missing')?.includes('اكتب تاريخ انتهاء الناتج'), 'R10 ناتج يُتابَع انتهاؤه: التاريخ مطلوب');
      type(byAction('output-expiry')[0], fmt(shift(TODAY, -1)));
      await settle();
      t.ok(disabled(byAction('produce-go')[0]) && textOf('produce-missing')?.includes('تاريخ الانتهاء قبل يوم الإنتاج.'), 'R10 انتهاء قبل يوم الإنتاج: لا يُنتَج');
      type(byAction('output-expiry')[0], fmt(shift(TODAY, 30)));
      await settle();
      await click(byAction('produce-go')[0]);
      t.eq(named(rpcLog, 'record_production')[0]?.p_expiry, shift(TODAY, 30), 'R10 تاريخ الانتهاء يُرسل');
      await unmount();

      produceSetup(MANAGER, { detail: activeJson({ lineOver: { 'l-a3': { unit_changed: true } } }) });
      await mount(`/mill/produce/${P.recipe}`);
      t.ok(disabled(byAction('produce-go')[0]) && textOf('produce-missing')?.includes('تغيّرت وحدة «زيت» بعد تفعيل الخلطة'), 'R10 سطر تغيّرت وحدته بعد التفعيل: يُسمّى ولا يُنتَج (item_changed)');
      await unmount();

      produceSetup(MANAGER, { detail: activeJson({ status: 'draft' }) });
      await mount(`/mill/produce/${P.recipe}`);
      t.same([text().includes('هذه الخلطة بلا نسخة مفعَّلة.'), byAction('open-recipe')[0]?.getAttribute('href'), byAction('produce-go').length], [true, `/mill/recipe/${P.recipe}`, 0], 'R10 بلا نسخة مفعَّلة: جملة ورابط الخلطة بلا «أنتج»');
      await unmount();

      produceSetup(ACCOUNTANT);
      await mount(`/mill/produce/${P.recipe}`);
      t.same([text().includes('تسجيل الإنتاج للمالك والمدير ومشغّل المعمل.'), byAction('produce-go').length, byAction('save-batch-draft').length], [true, 0, 0], 'R10 المحاسب لا يسجّل الإنتاج ولا المسوّدة (production.draft)');
    });

    // ── R11: «احفظ مسوّدة» لما لا تفعله الشاشة (إخراج مادّة أو تبديلها وتكاليف الدفعة) ─────────────────────────────────────────
    await step('R11', async () => {
      const { rpcLog } = produceSetup(MANAGER);
      await mount(`/mill/produce/${P.recipe}`);
      t.same([textOf('save-batch-draft'), textOf('draft-help'), byAction('draft-not-carried').length], ['احفظ مسوّدة', 'لإخراج مادّة أو تبديلها أو تعديل تكاليف الدفعة', 0], 'R11 زرّ ثانويّ «احفظ مسوّدة» وسطر عونه');
      type(byAction('produce-qty')[0], '985');
      await settle();
      type(qtyInput('كسبة صويا'), '300');
      await settle();
      t.ok(textOf('draft-not-carried')?.startsWith('المسوّدة تُحفظ بكميات الخلطة المخطّطة وحدها'), 'R11 ما عُدّل هنا لا ينتقل إلى المسوّدة: يُقال قبل النقر');
      await click(byAction('save-batch-draft')[0]);
      const [sent] = named(rpcLog, 'create_production');
      t.ok(UUID.test(sent?.p_id ?? ''), 'R11 معرّف الدفعة من الجهاز');
      t.same(
        { ...sent, p_id: 'ID' },
        { p_id: 'ID', p_recipe_version: P.version, p_planned_kg: '985.000', p_wh_in: RAW.id, p_wh_out: FEED.id, p_produced_on: TODAY },
        'R11 create_production القائم بالكمية والمخزنين ويوم الإنتاج',
      );
      t.eq(globalThis.__m3.location, `/mill/batch/${sent?.p_id}`, 'R11 ثمّ صفحة الدفعة');
    });
    await step('R11-retry', async () => {
      const hint = 'تغيّرت وحدة «زيت» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.';
      const { rpcLog } = produceSetup(MANAGER, {
        create: (_args, n) => {
          if (n === 1) throw new m.RejectedError('item_changed', hint);
          if (n === 2) throw new m.UnknownOutcomeError();
          throw new m.RejectedError('23505', null);
        },
      });
      await mount(`/mill/produce/${P.recipe}`);
      await click(byAction('save-batch-draft')[0]);
      t.same([text().includes(hint), globalThis.__m3.location], [true, `/mill/produce/${P.recipe}`], 'R11 رفض المسوّدة بتلميحه ولا تُفتح دفعة');
      await click(byAction('save-batch-draft')[0]);
      await click(byAction('save-batch-draft')[0]);
      const ids = named(rpcLog, 'create_production').map((args) => args.p_id);
      t.same([ids.length, new Set(ids).size, globalThis.__m3.location], [3, 1, `/mill/batch/${ids[0]}`], 'R11 الإعادة بالمعرّف نفسه، و23505 (أُنشئت بمحاولة ضاع جوابها) تفتح الدفعة نفسها');
    });

    // ── R12: رفوض record_production الجديدة بتلميحها كما هو ─────────────────────────────────────────────────────────
    for (const code of ['qty_too_large', 'stale_preview', 'ref_reused']) {
      await step(`R12 ${code}`, async () => {
        const { rpcLog } = produceSetup(MANAGER, {
          record: (_args, n) => {
            if (n === 1) throw refused(code);
            return clone(F.record_production.posted);
          },
        });
        await mount(`/mill/produce/${P.recipe}`);
        await click(byAction('produce-go')[0]);
        t.same([text().includes(F.refusals[code].hint), byAction('produced-posted').length, disabled(byAction('produce-go')[0])], [true, 0, false], `R12 ${code}: التلميح كما هو، ولا شيء سُجّل، و«أنتج» متاح`);
        await click(byAction('produce-go')[0]);
        const [first, second] = named(rpcLog, 'record_production');
        t.ok(first.p_id !== second.p_id && first.p_client_ref !== second.p_client_ref, `R12 ${code}: المحاولة التالية بمعرّفين جديدين`);
      });
    }
    await step('R12 id_conflict', async () => {
      const { rpcLog } = produceSetup(MANAGER, {
        record: (_args, n) => {
          if (n === 1) throw refused('id_conflict');
          return clone(F.record_production.posted);
        },
      });
      await mount(`/mill/produce/${P.recipe}`);
      await click(byAction('produce-go')[0]);
      t.same([text().includes(F.refusals.id_conflict.hint), byAction('retry-produce').length, byAction('produce-go').length], [true, 1, 0], 'R12 id_conflict (طلب بالمعرّف نفسه يسابقه): تلميحه، والشاشة مجمَّدة بـ«أعد المحاولة» (لعلّه سُجّل)');
      await click(byAction('retry-produce')[0]);
      const [first, second] = named(rpcLog, 'record_production');
      t.same([second, byAction('produced-posted').length], [first, 1], 'R12 والإعادة بالطلب نفسه حرفاً ترجّع نتيجته');
    });
    await step('R12 double-tap', async () => {
      const answer = deferred();
      const { rpcLog } = produceSetup(MANAGER, { record: () => answer.promise });
      await mount(`/mill/produce/${P.recipe}`);
      const go = byAction('produce-go')[0];
      fire(go, 'click');
      fire(go, 'click');
      await settle();
      t.eq(named(rpcLog, 'record_production').length, 1, 'R12 نقرتان سريعتان: طلب واحد');
      answer.resolve(clone(F.record_production.posted));
      await settle();
    });

    // ── L: ترتيب موادّ المسوّدة ─────────────────────────────────────────────────────────────────────────────────────
    const lineIds = DRAFT.lines.map((entry) => entry.id);
    // ── V: إصلاحات مراجعة الشاشات (S1 وS2 وS3 وS5)، وكلّها فشلت على الشفرة قبلها ─────────────────────────────────────────────────
    const produceUrl = `/mill/produce/${P.recipe}`;
    await step('V1 S1', async () => {
      const { rpcLog } = produceSetup(MANAGER, {
        record: (_args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          return clone(F.record_production.posted);
        },
      });
      await mount(produceUrl);
      await click(byAction('produce-go')[0]);
      t.eq(byAction('retry-produce').length, 1, 'V1 نتيجة مجهولة: الشاشة مجمَّدة');
      await unmount();
      await mount(produceUrl);
      t.same([byAction('retry-produce').length, byAction('produce-go').length], [1, 0], 'V1 (S1) الرجوع ثمّ العودة: الشاشة مجمَّدة بطلبها، لا «أنتج» بمعرّف جديد');
      await click(byAction('retry-produce')[0]);
      const sent = named(rpcLog, 'record_production');
      t.same([sent.length, sent[1]], [2, sent[0]], 'V1 (S1) الإعادة بالطلب نفسه حرفاً (المعرّف والمرجع نفسيهما): لا دفعة ثانية');
      await unmount();
      await mount(produceUrl);
      t.same([byAction('retry-produce').length, byAction('produce-go').length], [0, 1], 'V1 وبعد الجواب النهائي: لا طلب معلَّق، والشاشة من أوّلها');
    });
    await step('V1 S1 in flight', async () => {
      const held = deferred();
      const { rpcLog } = produceSetup(MANAGER, { record: (_args, n) => (n === 1 ? held.promise : clone(F.record_production.posted)) });
      await mount(produceUrl);
      await click(byAction('produce-go')[0]);
      await unmount();
      await mount(produceUrl);
      t.same([byAction('retry-produce').length, byAction('produce-go').length], [1, 0], 'V1 (S1) الطلب في الطريق ثمّ الرجوع والعودة: الشاشة مجمَّدة بطلبها');
      held.resolve(clone(F.record_production.posted));
      await settle();
      await click(byAction('retry-produce')[0]);
      const sent = named(rpcLog, 'record_production');
      t.same([sent.length, sent[1]], [2, sent[0]], 'V1 (S1) والإعادة بالطلب نفسه حرفاً');
    });
    await step('V2 S2', async () => {
      const held = deferred();
      produceSetup(MANAGER, { record: (_args, n) => (n === 1 ? held.promise : clone(F.record_production.posted)) });
      await mount(produceUrl);
      const before = m.isWindowDirty();
      await click(byAction('produce-go')[0]);
      const sending = m.isWindowDirty();
      held.reject(new m.UnknownOutcomeError());
      await settle();
      const frozen = m.isWindowDirty();
      await click(byAction('retry-produce')[0]);
      t.same([before, sending, frozen, m.isWindowDirty()], [false, true, true, false],
        'V2 (S2) النافذة «فيها ما لم يُحفظ» والطلب في الطريق وبعد النتيجة المجهولة (فلا يعيد التحديث تحميلها)، ونظيفة بعد الجواب');
    });
    await step('V3 S3', async () => {
      produceSetup(MANAGER);
      await mount(produceUrl);
      t.ok(/(^|\s)w-32(\s|$)/u.test(qtyInput('ذرة صفراء')?.getAttribute('class') ?? ''), 'V3 (S3) خانة الكمية بعرض ثابت (w-32): لا تنكمش في الهاتف إلى عرض رأس العمود');
    });
    await step('V5 S5', async () => {
      produceSetup(OPERATOR, { record: () => clone(F.record_production.draft) });
      await mount(produceUrl);
      await click(byAction('produce-go')[0]);
      t.ok(textOf('produced-draft-text')?.includes(`(المخطّط ${kgOfText(F.record_production.draft.planned_kg)})`), `V5 (S5) رقم المسوّدة يُسمّى «المخطّط» (${textOf('produced-draft-text')})`);
    });

    const draftUrl = `/mill/recipe/${DRAFT.id}?version=${DRAFT.selected.id}`;
    const tableNames = () => bodyRows().map((row) => row[0]);
    await step('L1', async () => {
      const shuffled = { ...clone(DRAFT), lines: [...clone(DRAFT.lines)].reverse() };
      const { rpcLog } = fresh(MANAGER, {
        rpcs: { recipe_detail: () => clone(shuffled), set_recipe_line_order: () => clone(F.set_recipe_line_order.ok) },
        calls: { loadItemsOverview: () => overviewItems([]) },
      });
      await mount(draftUrl);
      t.same(tableNames(), DRAFT.lines.map((entry) => entry.item_name), 'L1 السطور بترتيب line_no ولو وصلت بغيره');
      t.same([disabled(withId('line-up', lineIds[0])), disabled(withId('line-down', lineIds.at(-1))), byAction('save-line-order').length], [true, true, 0], 'L1 الأولى بلا «قدّم» والأخيرة بلا «أخّر»، ولا «احفظ» بلا تغيير');
      await click(withId('line-up', lineIds[2]));
      const moved = [lineIds[0], lineIds[2], lineIds[1], ...lineIds.slice(3)];
      t.same(tableNames(), moved.map((id) => DRAFT.lines.find((entry) => entry.id === id).item_name), 'L1 «قدّم» ينقل المادّة في الجدول');
      t.same([disabled(byAction('add-line')[0]), disabled(byAction('activate-version')[0]), byAction('save-line-order').length], [true, true, 1], 'L1 الترتيب المعلّق يقفل «أضف مواد» و«فعّل النسخة» حتّى يُحفظ');
      await click(byAction('save-line-order')[0]);
      t.same(named(rpcLog, 'set_recipe_line_order'), [{ p_version: DRAFT.selected.id, p_lines: moved, p_expected: lineIds }], 'L1 set_recipe_line_order بكلّ السطور بالترتيب الجديد وشرطه ما عُرض');
      t.same([globalThis.__m3.toasts.at(-1)?.title, named(rpcLog, 'recipe_detail').length], ['حُفظ ترتيب موادّ الخلطة.', 2], 'L1 تنبيه وقراءة من جديد');
    });
    await step('L2', async () => {
      const reread = deferred();
      const extra = { ...clone(DRAFT.lines[0]), id: '71111111-0000-4000-8000-0000000000ee', line_no: DRAFT.lines.length + 1, item_id: 'c1111111-0000-4000-8000-0000000000ee', item_name: 'حجر الكلس' };
      const grown = { ...clone(DRAFT), lines: [...clone(DRAFT.lines), extra] };
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          recipe_detail: (_args, n) => (n === 1 ? clone(DRAFT) : n === 2 ? reread.promise : clone(grown)),
          set_recipe_line_order: (_args, n) => {
            if (n === 1) throw refused('lines_changed');
            return clone(F.set_recipe_line_order.ok);
          },
        },
        calls: { loadItemsOverview: () => overviewItems([]) },
      });
      await mount(draftUrl);
      await click(withId('line-up', lineIds[2]));
      const mine = [lineIds[0], lineIds[2], lineIds[1], ...lineIds.slice(3)];
      await click(byAction('save-line-order')[0]);
      t.ok(textOf('line-order-changed')?.includes(F.refusals.lines_changed.hint) && textOf('line-order-changed')?.includes('جارٍ قراءة الخلطة من جديد'), `L2 lines_changed: تلميح الخادم وأنّ الخلطة تُقرأ (${textOf('line-order-changed')})`);
      t.same([disabled(byAction('save-line-order')[0]), disabled(withId('line-up', lineIds[1]))], [true, true], 'L2 أثناء القراءة: الحفظ والأسهم معطّلة');
      reread.resolve(clone(grown));
      await settle();
      t.same(tableNames(), [...mine.map((id) => DRAFT.lines.find((entry) => entry.id === id).item_name), 'حجر الكلس'], 'L2 بعد القراءة: ترتيب المستخدم باقٍ والمادّة الجديدة في آخره');
      await click(byAction('save-line-order')[0]);
      t.same(named(rpcLog, 'set_recipe_line_order')[1], { p_version: DRAFT.selected.id, p_lines: [...mine, extra.id], p_expected: [...lineIds, extra.id] }, 'L2 الحفظ الثاني بشرط ما قُرئ بعد الرفض');
    });
    await step('L3', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: { recipe_detail: (_args, n) => (n === 2 ? Promise.reject(new m.NetworkError()) : clone(DRAFT)), set_recipe_line_order: () => { throw refused('lines_changed'); } },
        calls: { loadItemsOverview: () => overviewItems([]) },
      });
      await mount(draftUrl);
      await click(withId('line-down', lineIds[0]));
      await click(byAction('save-line-order')[0]);
      t.ok(textOf('line-order-changed')?.includes('تعذّرت قراءة الخلطة من جديد') && byAction('line-order-reread').length === 1, 'L3 فشل القراءة بعد الرفض: يُقال بـ«أعد القراءة» والصفحة لا تُطوى');
      await click(byAction('line-order-reread')[0]);
      t.same([named(rpcLog, 'recipe_detail').length, disabled(byAction('save-line-order')[0])], [3, false], 'L3 «أعد القراءة» يقرأ ثمّ يُحفظ');
      await click(byAction('cancel-line-order')[0]);
      t.same([tableNames(), byAction('line-order-bar').length], [DRAFT.lines.map((entry) => entry.item_name), 0], 'L3 «تراجع» يعيد الترتيب المحفوظ بلا نداء');
    });
    await step('L5', async () => {
      // فُعّلت المسوّدة من جهاز آخر بعد ما فُتحت: not_draft بتلميحه، ويسقط الترتيب، وتُقرأ الخلطة (مفعَّلة، فلا أسهم).
      const activated = { ...clone(DRAFT), versions: DRAFT.versions.map((entry) => ({ ...clone(entry), status: 'active' })), selected: { ...clone(DRAFT.selected), status: 'active' } };
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          recipe_detail: (_args, n) => (n === 1 ? clone(DRAFT) : clone(activated)),
          set_recipe_line_order: () => {
            throw refused('not_draft');
          },
        },
        calls: { loadItemsOverview: () => overviewItems([]) },
      });
      await mount(draftUrl);
      await click(withId('line-down', lineIds[0]));
      await click(byAction('save-line-order')[0]);
      t.same(
        [text().includes(F.refusals.not_draft.hint), byAction('line-order-bar').length, byAction('line-up').length, named(rpcLog, 'recipe_detail').length],
        [true, 0, 0, 2],
        'L5 not_draft: تلميحه، ويسقط الترتيب، وتُقرأ الخلطة مفعَّلةً بلا أسهم',
      );
    });
    // ── V4: ترتيب رجع إلى ما يعرفه لا يبقى ساكناً (S4)، وفشل على الشفرة قبله ─────────────────────────────────────────────────────
    // «احذف» بلا data-id: زرّ السطر بجانب سهميه في الخليّة نفسها.
    const removeOf = (id) => (withId('line-up', id)?.parentNode?.children ?? []).find((n) => n.getAttribute?.('data-action') === 'remove-line');
    const withoutLast = (order) => {
      const kept = clone(DRAFT);
      // ترتيب الخادم بـline_no (الصفحة تعرض به)، لا بترتيب المصفوفة.
      kept.lines = order.map((id, index) => ({ ...clone(DRAFT.lines.find((entry) => entry.id === id)), line_no: index + 1 }));
      kept.mass_kg = kept.selected.basis_kg;
      return kept;
    };
    await step('V4 S4 basis', async () => {
      const [A, B, C] = lineIds;
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          recipe_detail: (_args, n) => (n === 1 ? clone(DRAFT) : withoutLast([A, B])),
          delete_draft_line: () => ({ ok: true }),
          set_recipe_line_order: () => clone(F.set_recipe_line_order.ok),
        },
        calls: { loadItemsOverview: () => overviewItems([]) },
      });
      await mount(draftUrl);
      await click(withId('line-down', A));
      await click(withId('line-up', A));
      await click(removeOf(C));
      await click(byAction('confirm')[0]);
      await click(withId('line-up', B));
      await click(byAction('save-line-order')[0]);
      t.same(named(rpcLog, 'set_recipe_line_order')[0], { p_version: DRAFT.selected.id, p_lines: [B, A], p_expected: [A, B] },
        'V4 (S4) نقل ثمّ إرجاع ثمّ حذف سطر: شرط الحفظ ما يعرضه الخادم الآن، لا أساس الترتيب الساكن');
    });
    await step('V4 S4 shown', async () => {
      const [A, B, C] = lineIds;
      fresh(MANAGER, {
        rpcs: { recipe_detail: (_args, n) => (n === 1 ? clone(DRAFT) : withoutLast([B, A])), delete_draft_line: () => ({ ok: true }) },
        calls: { loadItemsOverview: () => overviewItems([]) },
      });
      await mount(draftUrl);
      await click(withId('line-down', A));
      await click(withId('line-up', A));
      await click(removeOf(C));
      await click(byAction('confirm')[0]);
      const name = (id) => DRAFT.lines.find((entry) => entry.id === id).item_name;
      t.same([tableNames(), byAction('line-order-bar').length], [[name(B), name(A)], 0], 'V4 (S4) وبعد القراءة: ترتيب الخادم يُعرض، لا ترتيب ساكن بلا شريط');
    });
    await step('L4', async () => {
      fresh(MANAGER, { rpcs: { recipe_detail: () => activeJson() }, calls: { loadItemsOverview: () => overviewItems([]) } });
      await mount(`/mill/recipe/${P.recipe}`);
      t.same([byAction('line-up').length, byAction('line-down').length], [0, 0], 'L4 النسخة المفعَّلة مجمَّدة: لا أسهم (الترتيب في «عدّل الخلطة»)');
    });

    // ── B: البانية ترسل السطور بترتيب الجدول ─────────────────────────────────────────────────────────────────────────
    await step('B1', async () => {
      const catalog = [itemRow('i-corn', 'ذرة صفراء', 'raw', 'kg', null, 100n), itemRow('i-soy', 'كسبة صويا', 'raw', 'kg', null, 100n), itemRow('i-salt', 'ملح', 'additive', 'kg', null, 100n)];
      const { rpcLog } = fresh({ status: 'ready', workspace: ws('manager', { canSeeCost: false }) }, {
        rpcs: { recipes_overview: () => clone(OVERVIEW), create_recipe: (args) => ({ id: args.p_id, version_id: args.p_version_id, version_no: 1, status: 'draft', lines: args.p_lines.length, rates: 0 }) },
        calls: { loadItemsOverview: () => overviewItems(catalog), listItems: () => ({ rows: [], total: 0, next: null }) },
        tables: { expense_categories: () => [] },
      });
      await mount('/mill/new');
      for (const id of ['i-corn', 'i-soy', 'i-salt']) await click(byAction('material-card').find((n) => n.getAttribute('data-item') === id));
      type(qtyInput('ذرة صفراء'), '600');
      type(qtyInput('كسبة صويا'), '370');
      type(qtyInput('ملح'), '30');
      await settle();
      t.same([disabled(withId('line-up', 'i-corn')), disabled(withId('line-down', 'i-salt'))], [true, true], 'B1 الأولى بلا «قدّم» والأخيرة بلا «أخّر»');
      await click(withId('line-up', 'i-salt'));
      const order = ['ذرة صفراء', 'ملح', 'كسبة صويا'];
      t.ok(tableNames().length === 3 && tableNames().every((cell, index) => cell.startsWith(order[index] ?? '-')), `B1 «قدّم» ينقل المادّة في الجدول (${tableNames().join(' | ')})`);
      type(byAction('recipe-name')[0], 'علف تجربة');
      choose(byAction('recipe-output')[0], OVERVIEW.feed_items[0].id);
      await settle();
      await click(byAction('save-draft')[0]);
      t.same(named(rpcLog, 'create_recipe')[0]?.p_lines?.map((row) => [row.item_id, row.qty]), [['i-corn', '600.000'], ['i-salt', '30.000'], ['i-soy', '370.000']], 'B1 create_recipe بالسطور بترتيب الجدول');
    });

    // ── I: الكثافة عند إنشاء مادّة سائلة (نافذة «مادّة جديدة») ────────────────────────────────────────────────────────────
    t.same([m.liquidDensity('kg', '0.92'), m.liquidDensity('L', '0.92'), m.liquidDensity('L', '').error !== null, m.liquidDensity('L', 'abc').error !== null], [{ density: null, error: null }, { density: 9_200n, error: null }, true, true], 'I وزن اللتر: للسائل وحده، وإلزامي له');
    {
      const form = { name: 'زيت صويا', kind: 'raw', baseUnit: 'L', categoryId: '', packLabel: '', packFactor: '', minQty: '', barcode: '', sellPrice: '', density: '' };
      t.same([m.addItemFields(form).errors.density, m.addItemFields({ ...form, density: '0.92' }).fields.density_kg_per_l, m.addItemFields({ ...form, baseUnit: 'kg', density: '0.92' }).fields.density_kg_per_l], ['اكتب كم يزن اللتر بالكيلوغرام، فمنه تُحسب كميتها في خلطات المعمل.', '0.9200', null], 'I addItemFields: السائل بلا كثافة لا يُحفظ، وبها تُكتب، وللكيلوغرام لا كثافة');
      const simple = { name: 'زيت', baseUnit: 'L', kind: 'raw', density: '' };
      t.same([m.simpleItemFields(simple).errors.density, m.simpleItemFields({ ...simple, density: '0.92' }).fields.density_kg_per_l], [m.addItemFields(form).errors.density, '0.9200'], 'I «أضف مادّة» البسيطة بالقاعدة نفسها');
    }
    await step('I1', async () => {
      const saved = [];
      const { callLog } = fresh(MANAGER, {
        calls: { findItemTwins: () => [], createItem: (fields) => ({ ...itemRow('i-new', fields.name, fields.kind, fields.base_unit, fields.density_kg_per_l === null ? null : 9_200n, 100n) }) },
      });
      await mount('/', m.h(m.AddItemDialog, { categories: [], storeKind: 'raw', costs: false, onClose: () => {}, onSaved: (item) => saved.push(item) }));
      t.eq(byAction('new-item-density').length, 0, 'I1 بالكيلوغرام لا يُسأل عن الكثافة');
      await click(radio('بالحجم (لتر)'));
      t.eq(byAction('new-item-density').length, 1, 'I1 السائل يُسأل عن وزن لتره');
      const nameLabel = all().find((n) => n.localName === 'label' && n.textContent === 'اسم المادّة');
      type(all().find((n) => n.localName === 'input' && n.getAttribute('id') === nameLabel?.getAttribute('for')), 'زيت صويا');
      await settle();
      fire(all().find((n) => n.localName === 'form'), 'submit');
      await settle();
      t.same([text().includes('اكتب كم يزن اللتر بالكيلوغرام'), named(callLog, 'createItem').length], [true, 0], 'I1 بلا كثافة: يُقال ولا يُنشأ');
      type(byAction('new-item-density')[0], '0.92');
      await settle();
      fire(all().find((n) => n.localName === 'form'), 'submit');
      await settle();
      const [fields] = named(callLog, 'createItem')[0] ?? [];
      t.same([fields?.base_unit, fields?.density_kg_per_l, saved.length], ['L', '0.9200', 1], 'I1 تُنشأ باللتر وكثافتها 0.9200');
    });
  } finally {
    if (root) {
      const mounted = root;
      root = null;
      try {
        mounted.unmount();
      } catch {
        // swallow-ok: تنظيف بعد فشل
      }
    }
    delete globalThis.__m3;
    restore();
  }
}

/** «1,000 كغم» بالكيلوغرام كما تعرضه الشاشة (kgText): من الطنّ بفاصلة الآلاف وكسره بلا أصفار. */
function kgOfText(value) {
  const units = milli(value);
  const whole = (units / 1000n).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  const fraction = (units % 1000n).toString().padStart(3, '0').replace(/0+$/u, '');
  return `${fraction ? `${whole}.${fraction}` : whole} كغم`;
}

/** اليوم ± أيّام بالتقويم (YYYY-MM-DD). */
function shift(day, n) {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}
