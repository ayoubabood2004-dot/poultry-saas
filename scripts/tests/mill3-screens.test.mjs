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
// «الخلطة موادّ بلا كميات» (0025): شاشة الإنتاج أُعيد بناؤها على production_form وproduce_batch، ففحوص R2–R12 وV1–V5 (التخطيط بنسبة الخلطة وكمية الإنتاج
// الكلّية وrecord_production) حلّت محلّها فحوص mill4-screens (التعبئة من آخر إنتاج، و«أزل» و«أضف مادّة» و«قرّب»، والاختيار، والطلب المعلَّق والتجميد)؛
// وبقيت هنا معادلات «قرّب» والكتلة، وR1 («أنتج» يفتح الشاشة)، وB1 بلا كميات. وعيّنات 0023 تُقرأ بمفاتيح قرّاء 0025 الإلزامية (as0025): نسخها بكميات
// = materials_only false وقطعها من النسخة، كما يرسلها قارئ 0025 لنسخة قديمة؛ وإن أُعيد توليد العيّنة بعد 0025 فالمفاتيح فيها ولا يُغيَّر شيء.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** مفاتيح قرّاء 0025 على عيّنات 0023 (نسخ بكميات): لا تُغيَّر إن كانت حاضرة. */
function as0025(samples) {
  for (const recipe of samples.recipes_overview?.ordered?.recipes ?? []) {
    if (recipe.active && !('materials_only' in recipe.active)) recipe.active.materials_only = false;
    if (recipe.active && !('pieces_source' in recipe.active)) recipe.active.pieces_source = 'recipe';
  }
  const detail = samples.recipe_detail?.draft;
  for (const version of [detail?.selected, ...(detail?.versions ?? [])]) if (version && !('materials_only' in version)) version.materials_only = version.basis_kg === null;
  return samples;
}
const F = as0025(JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'mill3-0023.json'), 'utf8')));
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
    "export { massOf, gapQty, nextTon, tonsText } from './src/pages/mill/ProducePage.tsx';",
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
const bodyRows = () => {
  const tbody = all().find((n) => n.localName === 'tbody');
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : [];
};
const radio = (label) => all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === label);
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

// ── خلطة مفعَّلة بشكل recipe_detail (0016) لـ«أنتج» من صفحة الخلطة (R1): ذرة وكسبة وزيت وملح، والكاز خارج الكتلة ─────────────────────────────
const OVERVIEW = F.recipes_overview.ordered;
const TODAY = OVERVIEW.today;
const RAW = OVERVIEW.stores.find((store) => store.kind === 'raw');
const FEED = OVERVIEW.stores.find((store) => store.kind === 'feed');
const P = { recipe: 'r-prod', version: 'v-prod' };
const line = (id, no, item, name, kind, baseUnit, qty, unit, mass, inBasis = true, over = {}) => ({
  id, line_no: no, item_id: item, item_name: name, kind, base_unit: baseUnit, unit_changed: false, unit_mismatch: false, density_missing: false, in_basis: inBasis,
  category_id: null, category_name: null, qty, unit, mass_kg: mass, share_pct: null, money: { unit_cost: null, cost_price: null, last_price: null }, ...over,
});
const activeJson = ({ tracks = false, status = 'active', archived = false, lineOver = {} } = {}) => ({
  id: P.recipe, name: 'علف بادئ', note: null, archived, version: 3,
  output_item: { id: 'f-prod', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: tracks },
  versions: [{ id: P.version, version_no: 2, status, basis_kg: '1000.000', materials_only: false, activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version: 4 }],
  selected: { id: P.version, version_no: 2, status, basis_kg: '1000.000', materials_only: false, note: null, activated_at: null, version: 4 },
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
const itemRow = (id, name, kind, baseUnit, density, scaleStep) => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep, minQty: null, barcode: null, altCodes: [] });
const overviewItems = (rows) => ({ today: TODAY, canRecord: true, canAddItem: true, items: rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, baseUnit: row.baseUnit, onHand: 0n, purchased: 0n, lastPurchaseOn: null, unpricedCount: 0, money: null })) });

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    const fresh = (session, { rpcs = {}, calls = {}, tables = {} } = {}) => {
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

    // ── X: الكتلة و«قرّب» (produce_batch يكتب الكمية كما هي، فلا تخطيط بنسبة الخلطة بعد 0025) ─────────────────────────────────────────
    {
      t.same([m.massOf(19_700n, 'L', 9_200n), m.massOf(591_000n, 'kg', null), m.massOf(1n, 'L', null)], [18_124n, 591_000n, null], 'X الكتلة: اللتر × الكثافة بثلاث مراتب');
      // الفرق 15.076 كغم: سطر بالكيلوغرام بالفرق نفسه، ومادّة تُضاف بخطوة 0.1 مرفوعةً 15.1، وبخطوة 0.001 بالضبط، والزيت (19.7 لتر) أقلّ خطوات تبلغه: 16.4 لتر.
      t.same(
        [m.gapQty(591_000n, 15_076n, 'kg', null, 100n, true), m.gapQty(0n, 15_076n, 'kg', null, 100n, false), m.gapQty(0n, 15_076n, 'kg', null, 1n, false), m.gapQty(19_700n, 15_076n, 'L', 9_200n, 100n, true)],
        [15_076n, 15_100n, 15_076n, 16_400n],
        'X «قرّب»: كيلوغرام بالضبط، ومضافة بخطوة عدّادها، ولتر بأقلّ خطوات تبلغ الفرق',
      );
      // بلا خطوة (0025): اللتر بأجزاء الألف، أقلّ كمية تبلغ كتلتُها الفرق.
      t.same([m.gapQty(19_700n, 15_076n, 'L', 9_200n, 0n, true), m.gapQty(0n, 1n, 'L', 9_200n, 0n, true)], [16_387n, 1n], 'X «قرّب» بلا خطوة: لتر بأجزاء الألف');
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

    // ── L: ترتيب موادّ المسوّدة ─────────────────────────────────────────────────────────────────────────────────────
    const lineIds = DRAFT.lines.map((entry) => entry.id);
    const draftUrl = `/mill/recipe/${DRAFT.id}?version=${DRAFT.selected.id}`;
    // العمود الأوّل «#» (0025: الترتيب رقماً)، والمادّة في الثاني.
    const tableNames = () => bodyRows().map((row) => row[1]);
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
      await settle();
      t.same([disabled(withId('line-up', 'i-corn')), disabled(withId('line-down', 'i-salt'))], [true, true], 'B1 الأولى بلا «قدّم» والأخيرة بلا «أخّر»');
      await click(withId('line-up', 'i-salt'));
      const order = ['ذرة صفراء', 'ملح', 'كسبة صويا'];
      t.ok(tableNames().length === 3 && tableNames().every((cell, index) => cell.startsWith(order[index] ?? '-')), `B1 «قدّم» ينقل المادّة في الجدول (${tableNames().join(' | ')})`);
      type(byAction('recipe-name')[0], 'علف تجربة');
      choose(byAction('recipe-output')[0], OVERVIEW.feed_items[0].id);
      await settle();
      await click(byAction('save-activate')[0]);
      t.same(named(rpcLog, 'create_recipe')[0]?.p_lines, [{ item_id: 'i-corn' }, { item_id: 'i-salt' }, { item_id: 'i-soy' }], 'B1 create_recipe بالسطور بترتيب الجدول (موادّ بلا كميات)');
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
