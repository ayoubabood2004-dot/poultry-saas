// عمليات المخزن البسيطة والبيع (كلمة المالك 2026-11-08، عقد scratchpad/simple/contract-0020.md «Screens»): react-dom/client الحقيقي على DOM
// صغير (dom.mjs) يشغّل StockRoutes وMillRoutes الحقيقيتين، وrepo الحقيقي (purchases وما بعده) على core بديل يجيب، وrepo المخزون والمعمل
// والجلسة بدائل. الحالات (كلّها تفشل على f2c1d5e):
// K1 زرّ «رجوع إلى المخزن» أعلى ملفّ المادّة قبل العنوان، إلى حيث جاء (?back= داخليّ وحده)، وأثناء الفتح وفشله أيضاً، وإغلاق نافذة الشراء
//    يُبقي طريق الرجوع؛ K2 «دفتر المادّة والوجبات» يرجع إلى المخزن الذي فُتح منه أو إلى الملفّ؛ K3 صفحة الخلطة ودفعة الإنتاج وبانية الخلطة
//    بزرّ «رجوع إلى المعمل»؛ K4 صفّ الأفعال: «اشترِ»، و«أخفِ» لمن يدير المخازن بتأكيد يسمّي أثره (الأرشفة بنسخة المادّة الحاليّة)، وفشلها
//    داخل التأكيد، و«أظهِرها» للمؤرشفة؛ والأمين بلا «أخفِ».
// وأجوبة القاعدة الحقيقية (fixtures/store-ops-0020.json: التقطها supabase/tests/simple-ops.test.mjs على بوستغريس الحزمة) تمرّ بالمحلّلات الحقيقية
// وبالشاشات: S1 المحلّلات (ملفّ المادّة بأفعاله ومخازنه ووجهاته وسطر «بلا سعر»، والشراء بلا سعر، و«أكمل السعر»، والتحويل والنقل)؛ S2 الشراء بلا سعر:
//    الدفع بالدين وحده بسطر يشرحه، وp_unit_price فارغ؛ S3 «بلا سعر» في الجدول و«أكمل السعر» بنداء price_purchase؛ S4 «انقل»؛ S5 «حوّل» ببطاقات
//    المواد؛ S6 «احذف» لمادّة لم تُستعمل، وitem_in_use ← «أخفِها بدلاً من ذلك»؛ S7 بطاقة المادّة تقول «مشتريات بلا سعر»؛ S8 «بِع»: الجهة (و«جهة
//    جديدة» زبوناً لمن يدير الجهات)، والمخزن من مخزنين بمتاحهما، والسعر من سعر البيع الحاليّ، والنقد بصندوقه، والسعر صفر «تسليم بلا مقابل» بتأكيد.
// وأجوبة 0021 الحقيقية (fixtures/sales-0021.json من supabase/tests/sales.test.mjs): S9 المحلّلات (الفاتورة والإلغاء والقائمة والتقرير، والكلفة والربح
//    تغيب لغير أدوار الكلفة)؛ S10 «بِع» من ملفّ المادّة بجواب حقيقيّ؛ S11 صفحة المبيعات: المجاميع والجدول و«ملغى» و«بلا مقابل» و«ألغِ» لمن يلغي،
//    والتقرير بالجهة والمادّة واليوم (الربح للمالك وحده)، والمدّة؛ S12 «ألغِ» بسبب إلزاميّ والمقبوض نقداً يبقى رصيداً للجهة؛ S13 «بيع جديد» (?new=1).
// ومراجعة الشاشات (كلّ حالة R تفشل على f066d09): H1 نتيجة مجهولة ثمّ «أغلق» تبقي النداء ومعرّفاته في الصفحة (شريط «لم يُعرف إن حُفظ — أعد
//    المحاولة»)، وفتحه يعيده حرفاً — للبيع من الملفّ ومن صفحة المبيعات وللتحويل والنقل، ومعرّفات جديدة بعد الحفظ وحده؛ M1 الملغى «—» في السعر
//    والمبلغ؛ M2 «ملفّ المادّة» بجانب الرجوع؛ M3 store_required في «بِع» ← قائمة المخازن من جديد، وfrom_store_required في «حوّل» ← مخزن المصدر
//    وstore_required ← مخزن الوجهة (الرفضان الحقيقيّان)؛ L1 إلغاء التسليم بلا مقابل بلا «يُعكس قيد الفاتورة»؛ والمدّة من يوم الخادم؛ وبعد item_in_use
//    «أخفِها» وحدها؛ و«المرسَل» للتسليم بلا مقابل بلا «بـ0 دينار»؛ وإلغاء مجهول يُعاد بالسبب والمرجع نفسيهما؛ والنقد المردود (payment_refunded)
//    «نقداً، ثمّ رُدّ المبلغ» وإلغاؤه لا يدّعي رصيداً باقياً.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const S20 = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'store-ops-0020.json'), 'utf8'));
const S21 = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0021.json'), 'utf8'));
// يوم الخادم في العيّنة يوم التقاطها، والصفحة تعيد القراءة بيوم الخادم إن خالف يوم الجهاز (يفحصه R-today)؛ فـS11 وS12 اللذان يعدّان
// النداءات يأخذان يوم الجهاز، وإلّا فشلا من اليوم التالي للالتقاط (2026-11-09، كما في farm-round).
const DEVICE_DAY = (() => {
  const d = new Date();
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
for (const sample of [S21.sales_overview.owner, S21.sales_overview.storekeeper]) {
  Object.assign(sample, { today: DEVICE_DAY, from: `${DEVICE_DAY.slice(0, 8)}01`, to: DEVICE_DAY });
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__so.call('${n}', a);`).join(' ')}`;
const STUBS = {
  inventory: routed('inventory', ['loadOrgSetup', 'createItem', 'findItemTwins', 'listItems', 'loadItem', 'setArchived', 'listItemUnits', 'loadItemPurchases', 'loadStoresOverview', 'loadStockOnHand', 'loadStockValues', 'loadItemLots', 'loadItemMoves', 'updateItem']),
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createSupplier', 'createCustomer', 'listBoxes']),
  counts: `export * from ${real('counts')}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  mill: routed('mill', ['loadMill', 'loadBuilder', 'loadRecipe', 'loadBatch', 'loadExpenseCategories', 'loadMillStores', 'archiveRecipe', 'newRecipeVersion']),
  session: 'export const useSession = () => globalThis.__so.session; export const sessionStore = { get: () => globalThis.__so?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__so.toasts.push(spec); }; export function Toaster() { return null; }',
};
const CORE_FOR = /src\/lib\/repo\/(?:purchases|sales|storeOps)\.ts$/u;
const stubs = {
  name: 'so-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchasing|counts|mill)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'so-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'so-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
    // repo الحقيقي يبني النداء ويقرأ الجواب؛ core بديل له وحده يسجّل النداء ويجيب.
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'so-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'so-core' }, () => ({ contents: 'export const call = async (fn, args) => globalThis.__so.rpc(fn, args);', resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
    "export { SalesRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { localDay } from './src/domain/dates.ts';",
    "export { parseRecordedSale, parseVoidedSale, parseSalesOverview, parseSalesReport } from './src/lib/repo/purchases.ts';",
    "export { parseRecipe } from './src/lib/repo/mill.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { NetworkError, RejectedError, RetryableError, UnknownOutcomeError, ZeroRowsError } from './src/lib/errors.ts';",
    "export { parseItemFile, parseRecordPurchase, parsePricedPurchase, parseRecordedConversion, parseRecordedTransfer, parseItemsOverview } from './src/lib/repo/purchases.ts';",
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
const click = async (node, init = {}) => {
  fire(node, 'click', init);
  await settle();
};
/** هل يسبق الأوّلُ الثاني في ترتيب المستند. */
const before = (a, b) => {
  const nodes = all();
  return a !== undefined && b !== undefined && nodes.indexOf(a) >= 0 && nodes.indexOf(a) < nodes.indexOf(b);
};

const TODAY = '2026-11-08';
const fileJson = (over = {}) => ({
  today: TODAY,
  can_record: true,
  can_edit: false,
  item: { id: 'i-corn', name: 'ذرة', kind: 'raw', base_unit: 'kg', density_kg_per_l: null, archived: false, tracks_expiry: false },
  on_hand_qty: '20000.000',
  purchased_qty: '25000.000',
  purchases_count: 1,
  money: { purchased_value: '11250000.00', avg_unit_price: '450.00', sell_price: '600.00', last_unit_price: '450.00' },
  purchases: [
    {
      line_id: 'rl-1', doc_id: 'r-1', doc_no: 'PU-2026-0001', received_on: '2026-11-05', party_id: 'p-1', party_name: 'مورّد الحبوب', warehouse_name: 'مخزن المواد الأوّلية',
      qty: '25000.000', payment: 'credit', money: { unit_price: '450.00', line_total: '11250000.00', sell_price: '600.00', corrected: false },
    },
  ],
  more: false,
  ...over,
});
const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: false,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const KEEPER = ws('storekeeper', { scopes: [{ warehouseId: 'w-raw' }] });
const MANAGER = ws('manager');
const itemRow = (over = {}) => ({ id: 'i-corn', version: 7, archived: false, name: 'ذرة', nameNorm: 'ذرة', categoryId: null, kind: 'raw', baseUnit: 'kg', density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [], ...over });
const recipeJson = () => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: [{ id: 'v-2', version_no: 2, status: 'active', basis_kg: '1000.000', materials_only: false, activated_at: '2026-11-01T08:00:00Z', version: 5 }],
  selected: { id: 'v-2', version_no: 2, status: 'active', basis_kg: '1000.000', materials_only: false, note: null, activated_at: '2026-11-01T08:00:00Z', version: 5 },
  lines: [
    { id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة', kind: 'raw', base_unit: 'kg', category_id: null, category_name: null, qty: '1000.000', unit: 'kg', mass_kg: '1000.000', share_pct: '100.00', in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false },
  ],
  mass_kg: '1000.000',
  pick_items: [],
  expense_categories: [],
});

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    m.onlineStore.set(true);
    let where = null;
    function Probe() {
      where = m.useLocation();
      return null;
    }
    const fresh = (session, handlers = {}, rpcs = {}) => {
      const calls = [];
      const rpcCalls = [];
      globalThis.__so = {
        session,
        toasts: [],
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
          rpcCalls.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          return handler(args, rpcCalls.filter(([name]) => name === fn).length);
        },
      };
      return { calls, rpcCalls };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() =>
        root.render(
          m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Probe), m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }), m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }), m.h(m.Route, { path: '/sales/*', element: m.h(m.SalesRoutes) }))),
        ),
      );
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
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };
    const h1 = () => all().find((n) => n.localName === 'h1');
    const backOf = (action) => {
      const node = byAction(action)[0];
      return node ? [node.getAttribute('href'), node.textContent] : null;
    };

    // ── K1: زرّ الرجوع في ملفّ المادّة ─────────────────────────────────────────────────────────────────────────────
    await step('K1', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, {}, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      t.same(backOf('back-to-board'), ['/inventory', 'رجوع إلى المخزن'], 'K1: «رجوع إلى المخزن» إلى بطاقات المخزن افتراضاً');
      t.ok(before(byAction('back-to-board')[0], h1()), 'K1: والزرّ أعلى الملفّ قبل العنوان');
      await unmount();
      for (const [back, expected] of [
        ['/inventory/store/w-raw', ['/inventory/store/w-raw', 'رجوع إلى المخزن']],
        ['/mill', ['/mill', 'رجوع إلى المعمل']],
        ['https://evil.example', ['/inventory', 'رجوع إلى المخزن']],
        ['//evil.example/inventory', ['/inventory', 'رجوع إلى المخزن']],
      ]) {
        fresh({ status: 'ready', workspace: KEEPER }, {}, { item_file: async () => fileJson() });
        await mount(`/inventory/items/i-corn?${new URLSearchParams({ back })}`);
        t.same(backOf('back-to-board'), expected, `K1: ?back=${back} ← ${expected[0]}`);
        await unmount();
      }
      // أثناء الفتح وبعد فشله: الزرّ موجود (لا صفحة بلا مخرج).
      fresh({ status: 'ready', workspace: KEEPER }, {}, {});
      await mount('/inventory/items/i-corn');
      t.same(backOf('back-to-board'), ['/inventory', 'رجوع إلى المخزن'], 'K1: أثناء الفتح');
      await unmount();
      fresh({ status: 'ready', workspace: KEEPER }, {}, { item_file: async () => { throw new m.RetryableError('55P03'); } });
      await mount('/inventory/items/i-corn');
      t.ok(backOf('back-to-board') !== null && text().includes('تعذّر تحميل ملفّ المادّة'), 'K1: وبعد فشل الفتح');
      await unmount();
      // نافذة الشراء من صفحة مخزن (?buy=1&back=…): إغلاقها يشيل علامة الشراء ويُبقي طريق الرجوع.
      fresh({ status: 'ready', workspace: KEEPER }, {}, { item_file: async () => fileJson() });
      await mount(`/inventory/items/i-corn?buy=1&${new URLSearchParams({ back: '/inventory/store/w-raw' })}`);
      t.eq(byAction('save-purchase').length, 1, 'K1: ?buy=1 يفتح نافذة الشراء');
      await click(byAction('purchase-cancel')[0]);
      t.same([where?.search, backOf('back-to-board')?.[0]], ['?back=%2Finventory%2Fstore%2Fw-raw', '/inventory/store/w-raw'], 'K1: وإغلاقها يُبقي طريق الرجوع إلى المخزن');
    });

    // ── K2: «دفتر المادّة والوجبات» يرجع إلى حيث فُتح ───────────────────────────────────────────────────────────────
    await step('K2', async () => {
      fresh({ status: 'ready', workspace: MANAGER }, {});
      await mount(`/inventory/items/i-corn/details?${new URLSearchParams({ wh: 'w-raw', back: '/inventory/store/w-raw' })}`);
      t.same(backOf('back-to-file'), ['/inventory/store/w-raw', 'رجوع إلى المخزن'], 'K2: من صفحة المخزن: «رجوع إلى المخزن»');
      t.ok(before(byAction('back-to-file')[0], h1()), 'K2: قبل العنوان');
      await unmount();
      fresh({ status: 'ready', workspace: MANAGER }, {});
      await mount('/inventory/items/i-corn/details');
      t.same(backOf('back-to-file'), ['/inventory/items/i-corn', 'رجوع إلى ملفّ المادّة'], 'K2: وإلّا إلى ملفّ المادّة');
    });

    // ── K3: صفحات المعمل ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('K3', async () => {
      fresh({ status: 'ready', workspace: MANAGER }, { loadRecipe: () => m.parseRecipe(recipeJson()) }, { items_overview: async () => ({ today: TODAY, can_record: true, can_add_item: true, items: [] }) });
      await mount('/mill/recipe/r-1');
      t.same(backOf('back-to-mill'), ['/mill', 'رجوع إلى المعمل'], 'K3: الخلطة: «رجوع إلى المعمل»');
      t.ok(before(byAction('back-to-mill')[0], h1()), 'K3: قبل العنوان');
      await unmount();
      fresh({ status: 'ready', workspace: MANAGER }, { loadBuilder: () => ({ feedItems: [], recipeNames: [], stores: [], categories: [] }) }, { items_overview: async () => ({ today: TODAY, can_record: true, can_add_item: true, items: [] }) });
      await mount('/mill/new');
      t.same(backOf('back-to-mill'), ['/mill', 'رجوع إلى المعمل'], 'K3: وبانية الخلطة');
    });

    // ── K3-recipe: تعديل الخلطة وحذفها (كلمة المالك 2026-11-09: «ما اكدر اعدل عليها ولا احذفها») ─────────────────────────────
    const noItems = { items_overview: async () => ({ today: TODAY, can_record: true, can_add_item: true, items: [] }) };
    await step('K3-recipe-edit-delete', async () => {
      const { calls } = fresh(
        { status: 'ready', workspace: MANAGER },
        { loadRecipe: () => m.parseRecipe(recipeJson()), newRecipeVersion: () => ({ versionId: 'v-3', existing: false, skipped: [] }), archiveRecipe: () => 'r-1' },
        noItems,
      );
      await mount('/mill/recipe/r-1');
      const row = byAction('recipe-actions')[0];
      t.same([byAction('new-version')[0]?.textContent, byAction('delete-recipe')[0]?.textContent, Boolean(row?.contains(byAction('new-version')[0]))], ['عدّل الخلطة', 'احذف الخلطة', true], 'K3-recipe: «عدّل الخلطة» و«احذف الخلطة» في صفّ واحد');
      t.ok(before(h1(), row) && before(row, byAction('pick-version')[0]), 'K3-recipe: تحت العنوان وقبل أزرار النسخ');
      await click(byAction('new-version')[0]);
      await settle();
      t.same([named(calls, 'newRecipeVersion').map((args) => args[0]), where?.search], [['r-1'], '?version=v-3'], 'K3-recipe: «عدّل الخلطة» تنشئ مسوّدة من المفعَّلة وتفتحها');
      await click(byAction('delete-recipe')[0]);
      t.ok(text().includes('حذف الخلطة «علف بادئ»؟') && text().includes('تختفي «علف بادئ» من المعمل ولا يُنتَج بها بعد الآن، وتبقى دفعاتها السابقة في سجلّ الإنتاج'), 'K3-recipe: التأكيد يسمّي الخلطة وأثر حذفها');
      t.eq(named(calls, 'archiveRecipe').length, 0, 'K3-recipe: ولا شيء قبل التأكيد');
      await click(byAction('confirm-recipe-op')[0]);
      await settle();
      t.same(named(calls, 'archiveRecipe'), [['r-1', 2, true]], 'K3-recipe: الأرشفة القائمة بنسخة الخلطة كما قُرئت');
      t.same([where?.pathname, globalThis.__so.toasts.at(-1)?.title], ['/mill', 'حُذفت الخلطة «علف بادئ» من المعمل.'], 'K3-recipe: ثمّ يرجع إلى المعمل ويقول إنّها حُذفت');
    });
    await step('K3-recipe-draft', async () => {
      const draft = { id: 'v-3', version_no: 3, status: 'draft', basis_kg: '1000.000', materials_only: false, activated_at: null, version: 1 };
      const withDraft = (versionId) => ({ ...recipeJson(), versions: [...recipeJson().versions, draft], selected: versionId === 'v-3' ? { ...draft, note: null } : recipeJson().selected });
      fresh({ status: 'ready', workspace: MANAGER }, { loadRecipe: (_id, versionId) => m.parseRecipe(withDraft(versionId)) }, noItems);
      await mount('/mill/recipe/r-1');
      t.same([byAction('new-version').length, byAction('open-draft')[0]?.textContent], [0, 'أكمل تعديل الخلطة'], 'K3-recipe: لها مسوّدة: «أكمل تعديل الخلطة» بدل نسخة ثانية');
      await click(byAction('open-draft')[0]);
      await settle();
      t.same(
        [where?.search, byAction('open-draft').length, byAction('editing-hint')[0]?.textContent],
        ['?version=v-3', 0, 'تعدّل الآن مسوّدة الخلطة: أضف الموادّ أو احذفها أو رتّبها، ثمّ اضغط «فعّل النسخة» لتصير هي المعتمدة في الإنتاج.'],
        'K3-recipe: تفتح المسوّدة وتقول ما بعدها',
      );
    });
    await step('K3-recipe-restore', async () => {
      let archived = true;
      let fail = true;
      const { calls } = fresh(
        { status: 'ready', workspace: MANAGER },
        {
          loadRecipe: () => m.parseRecipe({ ...recipeJson(), archived }),
          archiveRecipe: () => {
            if (fail) {
              fail = false;
              throw new m.ZeroRowsError();
            }
            archived = false;
            return 'r-1';
          },
        },
        noItems,
      );
      await mount('/mill/recipe/r-1');
      t.ok(text().includes('هذه الخلطة محذوفة من المعمل') && byAction('recipe-actions').length === 0 && byAction('produce').length === 0, 'K3-recipe: المحذوفة تقول ذلك بلا «عدّل» ولا «أنتج»');
      await click(byAction('restore-recipe')[0]);
      t.ok(text().includes('إعادة الخلطة «علف بادئ»؟') && text().includes('تعود «علف بادئ» إلى قائمة المعمل'), 'K3-recipe: «أعِدها» بتأكيد يسمّي الأثر');
      await click(byAction('confirm-recipe-op')[0]);
      await settle();
      t.ok(byAction('recipe-op-failed').length === 1 && byAction('confirm-recipe-op').length === 1, 'K3-recipe: الفشل يُقال داخل التأكيد ولا يُغلق');
      await click(byAction('confirm-recipe-op')[0]);
      await settle();
      t.same(named(calls, 'archiveRecipe').map((args) => args[2]), [false, false], 'K3-recipe: والإعادة تُظهرها');
      t.ok(byAction('confirm-recipe-op').length === 0 && byAction('recipe-actions').length === 1 && byAction('restore-recipe').length === 0, 'K3-recipe: ثمّ تُقرأ من جديد ظاهرة');
    });
    await step('K3-recipe-viewer', async () => {
      fresh({ status: 'ready', workspace: ws('viewer') }, { loadRecipe: () => m.parseRecipe(recipeJson()) }, noItems);
      await mount('/mill/recipe/r-1');
      t.same([byAction('recipe-actions').length, byAction('delete-recipe').length, byAction('new-version').length], [0, 0, 0], 'K3-recipe: من لا يفعّل الخلطات: بلا «عدّل» ولا «احذف»');
    });

    // ── K4: صفّ الأفعال و«احذف» للمستعملة──────────────────────────────────────────────────────────────────────────────────────
    await step('K4', async () => {
      const { calls, rpcCalls } = fresh(
        { status: 'ready', workspace: MANAGER },
        { loadItem: () => itemRow(), setArchived: () => 8 },
        { item_file: async () => fileJson({ can_edit: true, can_delete: false, uses: ['لها مشتريات'] }) },
      );
      // كلمة المالك 2026-11-09 («تختفي من كلّ مكان»): «احذف» واحد لا يرفض؛ المادّة المستعملة تختفي بالأرشفة القائمة ويبقى سجلّها.
      await mount('/inventory/items/i-corn');
      const row = byAction('file-actions')[0];
      t.ok(row !== undefined && row.contains(byAction('record-purchase')[0]) && row.contains(byAction('delete-item')[0]) && byAction('hide-item').length === 0, 'K4: صفّ أفعال واحد فيه «اشترِ» و«احذف» بلا «أخفِ»');
      t.same([byAction('record-purchase')[0]?.textContent, byAction('delete-item')[0]?.textContent], ['اشترِ', 'احذف'], 'K4: بأسمائها');
      await click(byAction('delete-item')[0]);
      t.ok(
        text().includes('حذف «ذرة»؟') && !text().includes('نهائياً') && byAction('delete-hides').length === 1
          && text().includes('«ذرة» لها مشتريات، فلا يُمحى سجلّها: تختفي من بطاقات المخزن وقوائم الشراء والبيع والصرف والخلطات'),
        'K4: المستعملة: التأكيد يقول إنّها تختفي ويبقى سجلّها، لا «نهائياً»',
      );
      t.eq(byAction('delete-on-hand')[0]?.textContent, 'وعندك منها 20,000 كغم: تبقى محسوبة في قيمة المخزن.', 'K4: ويقول كم بقي منها');
      t.eq(named(calls, 'setArchived').length, 0, 'K4: ولا شيء قبل التأكيد');
      await click(byAction('confirm-delete-item')[0]);
      await settle();
      t.same([named(calls, 'setArchived'), named(rpcCalls, 'delete_item').length], [[['items', 'i-corn', 7, true]], 0], 'K4: الأرشفة القائمة بنسخة المادّة كما تُقرأ الآن، بلا delete_item');
      t.same([where?.pathname, globalThis.__so.toasts.at(-1)?.title], ['/inventory', 'حُذفت «ذرة» من القوائم، وسجلّها باقٍ في التقارير.'], 'K4: ثمّ يرجع ويقول إنّها حُذفت من القوائم');
    });
    await step('K4-show-and-fail', async () => {
      let fail = true;
      const { calls } = fresh(
        { status: 'ready', workspace: MANAGER },
        { loadItem: () => itemRow({ archived: true }), setArchived: () => { if (fail) { fail = false; throw new m.ZeroRowsError(); } return 9; } },
        { item_file: async () => fileJson({ can_edit: true, item: { ...fileJson().item, archived: true } }) },
      );
      await mount('/inventory/items/i-corn');
      await click(byAction('show-item')[0]);
      t.ok(text().includes('إظهار «ذرة»؟') && text().includes('تعود «ذرة» إلى بطاقات المخزن'), 'K4: «أظهِرها» بتأكيد يسمّي الأثر');
      await click(byAction('confirm-hide-item')[0]);
      await settle();
      t.ok(byAction('hide-failed').length === 1 && byAction('confirm-hide-item').length === 1, 'K4: الفشل يُقال داخل التأكيد ولا يُغلق');
      await click(byAction('confirm-hide-item')[0]);
      await settle();
      t.same(named(calls, 'setArchived').map((args) => args[3]), [false, false], 'K4: والإعادة تُظهرها');
      t.eq(byAction('confirm-hide-item').length, 0, 'K4: ثمّ يُغلق');
    });
    // ── S1: المحلّلات الحقيقية بأجوبة القاعدة الحقيقية ─────────────────────────────────────────────────────────────────
    {
      const unpriced = m.parseItemFile(S20.item_file.storekeeper_unpriced);
      const row = unpriced.purchases[0];
      t.same(
        [unpriced.canSell, unpriced.canConvert, unpriced.canTransfer, unpriced.canDelete, unpriced.canPrice, unpriced.unpricedCount, unpriced.uses, unpriced.item.version],
        [true, true, true, false, true, 1, ['لها مشتريات', 'لها حركات مخزون'], 1],
        'S1 ملفّ المادّة للأمين: أفعاله من الخادم، وسبب «لا تُحذف»، ونسخة المادّة',
      );
      t.same([row.priced, row.canPrice, row.money?.unitPrice, row.money?.lineTotal], [false, true, null, 0n], 'S1 سطر الشراء بلا سعر: priced=false وسعره null');
      t.same([unpriced.stores.map((x) => [x.name, x.available]), unpriced.transferTargets.map((x) => x.name)], [[['مخزن المواد الأوّلية', 1_000_000n]], ['مخزن المواد الأوّلية', 'مخزن مواد ثانٍ']], 'S1 أين المادّة بمتاحها، ووجهات النقل');
      const viewer = m.parseItemFile(S20.item_file.viewer_unpriced);
      t.same([viewer.money, viewer.canSell, viewer.stores.length], [null, false, 0], 'S1 المشاهد بلا مال ولا أفعال');
      const fresh0 = m.parseItemFile(S20.item_file.manager_fresh_before_delete);
      t.same([fresh0.canDelete, fresh0.uses.length, fresh0.canEdit], [true, 0, true], 'S1 مادّة لم تُستعمل: «احذف» للمدير');
      const bought = m.parseRecordPurchase(S20.record_purchase_unpriced.storekeeper);
      t.same([bought.priced, bought.money?.unitPrice, bought.money?.lineTotal, bought.payment, bought.qty], [false, null, 0n, 'credit', 1_000_000n], 'S1 الشراء بلا سعر: priced=false بالدين ومبلغه صفر');
      const priced = m.parsePricedPurchase(S20.price_purchase.storekeeper);
      t.same([priced.docNo, priced.usedBeforePricing, priced.money], ['PU-2026-0001', true, { unitPrice: 50_000n, lineTotal: 50_000_000n }], 'S1 «أكمل السعر»: المجموع بالفلس، وصُرف منه قبل السعر');
      const converted = m.parseRecordedConversion(S20.record_conversion.owner);
      t.same([converted.docNo, converted.from.qty, converted.from.baseUnit, converted.to.qty, converted.to.warehouseName, converted.value], [S20.record_conversion.owner.doc_no, 20_000n, 'pc', 1_000_000n, 'مخزن العلف', 20_000_000n], 'S1 التحويل: 20 قطعة ← 1,000 كغم بالقيمة نفسها');
      const moved = m.parseRecordedTransfer(S20.record_transfer.storekeeper);
      t.same([moved.docNo, moved.qty, moved.fromName, moved.toName], ['TR-2026-0001', 100_000n, 'مخزن المواد الأوّلية', 'مخزن مواد ثانٍ'], 'S1 النقل بخطوة واحدة');
      const overview = m.parseItemsOverview(S20.items_overview.storekeeper);
      t.same(overview.items.filter((item) => item.unpricedCount > 0).map((item) => [item.name, item.unpricedCount]), [['صويا', 1]], 'S1 بطاقات المواد: عدد المشتريات بلا سعر');
    }

    const SK = S20.item_file.storekeeper_unpriced;
    const SK_ID = SK.item.id;
    const PARTY = { id: S20.record_purchase_unpriced.storekeeper.party_id, name: S20.record_purchase_unpriced.storekeeper.party_name };
    const suppliers = { searchSuppliers: () => ({ parties: [PARTY], total: 1 }) };
    const typeIn = (input, value) => {
      input.value = value;
      fire(input, 'input');
    };
    const choose = (select, value) => {
      select.value = value;
      fire(select, 'change');
    };
    const dialogForm = () => all().find((n) => n.localName === 'form' && n.id.endsWith('-form'));
    const submit = async () => {
      fire(dialogForm(), 'submit');
      await settle();
      await settle();
    };

    // ── S2: الشراء بلا سعر ──────────────────────────────────────────────────────────────────────────────────────────
    await step('S2', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, {
        item_file: async () => clone(SK),
        record_purchase: async () => clone(S20.record_purchase_unpriced.storekeeper),
      });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('record-purchase')[0]);
      await click(byAction('pick-party')[0]);
      typeIn(byAction('purchase-qty')[0], '1000');
      await settle();
      t.ok(byAction('purchase-unpriced').length === 1 && byAction('purchase-total')[0]?.textContent === 'المجموع: يُحسب حين تكتب السعر', 'S2 بلا سعر: الدفع بالدين بسطر يشرحه، والمجموع حين يُكتب السعر');
      t.eq(byAction('save-purchase')[0]?.textContent, 'احفظ الشراء: 1,000 كغم صويا بلا سعر، بالدين على مورّد الحبوب', 'S2 الزرّ يسمّي الشراء بلا سعر');
      await submit();
      const [args] = named(rpcCalls, 'record_purchase');
      t.same([args?.p_unit_price, args?.p_payment, args?.p_cash_account, args?.p_qty], [null, 'credit', null, '1000.000'], 'S2 record_purchase بسعر فارغ وبالدين');
      t.ok(text().includes('حُفظ الشراء PU-2026-0001: 1,000 كغم صويا من مورّد الحبوب بلا سعر، إلى «مخزن المواد الأوّلية». أكمل السعر من الجدول حين تعرفه.'), `S2 جملة الحفظ من جواب الخادم (${text().slice(0, 400)})`);
    });
    await step('S2-cash-then-clear', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => ({ ...clone(SK), cash_accounts: [{ id: 'b-1', name: 'الصندوق' }] }), record_purchase: async () => clone(S20.record_purchase_unpriced.storekeeper) });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('record-purchase')[0]);
      await click(byAction('pick-party')[0]);
      typeIn(byAction('purchase-qty')[0], '1000');
      typeIn(all().find((n) => n.id.endsWith('-price')), '0');
      await settle();
      await submit();
      t.ok(text().includes('اكتب سعر الشراء لكل كغم بالدينار رقماً أكبر من صفر، أو اتركه فارغاً وأكمله لاحقاً.') && named(rpcCalls, 'record_purchase').length === 0, 'S2 سعر صفر: رسالة تقول «أو اتركه فارغاً»');
      typeIn(all().find((n) => n.id.endsWith('-price')), '500');
      await settle();
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'نقداً من الصندوق'));
      t.eq(byAction('pick-box').length, 1, 'S2 بالسعر يعود اختيار النقد والصندوق');
      typeIn(all().find((n) => n.id.endsWith('-price')), '');
      await settle();
      t.same([byAction('pick-box').length, byAction('purchase-unpriced').length], [0, 1], 'S2 ومسح السعر يرجعه بالدين وحده (لا نقد بلا مبلغ)');
      await submit();
      t.same(named(rpcCalls, 'record_purchase').map((args) => [args.p_payment, args.p_unit_price]), [['credit', null]], 'S2 فيُرسل بالدين');
    });

    // ── S3: «بلا سعر» و«أكمل السعر» ────────────────────────────────────────────────────────────────────────────────
    await step('S3', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, {
        item_file: async (_args, n) => (n === 1 ? clone(SK) : clone(S20.item_file.storekeeper_bulk)),
        price_purchase: async () => clone(S20.price_purchase.storekeeper),
      });
      await mount(`/inventory/items/${SK_ID}`);
      t.same([byAction('purchase-unpriced-row')[0]?.textContent, byAction('price-purchase')[0]?.textContent], ['بلا سعر', 'أكمل السعر'], 'S3 السطر «بلا سعر» ومعه «أكمل السعر»');
      await click(byAction('price-purchase')[0]);
      t.ok(byAction('price-line')[0]?.textContent === 'شراء 1,000 كغم من مورّد الحبوب بتاريخ 05/11/2026، دخل المخزن بلا سعر.', 'S3 النافذة تسمّي الشراء');
      await submit();
      t.ok(text().includes('اكتب سعر الشراء لكل كغم بالدينار، رقماً أكبر من صفر.') && named(rpcCalls, 'price_purchase').length === 0, 'S3 بلا سعر: رسالة ولا إرسال');
      typeIn(all().find((n) => n.id.endsWith('-price')), '500');
      await settle();
      t.eq(byAction('save-price')[0]?.textContent, 'اكتب السعر: 500,000 دينار بالدين على مورّد الحبوب', 'S3 الزرّ يسمّي المجموع والدين');
      await submit();
      const [args] = named(rpcCalls, 'price_purchase');
      t.same([UUID.test(args?.p_client_ref ?? ''), args?.p_line_id, args?.p_unit_price, args?.p_sell_price], [true, SK.purchases[0].line_id, '500.00', null], 'S3 price_purchase بالسطر والسعر');
      t.ok(text().includes('كُتب سعر الشراء PU-2026-0001: 500,000 دينار بالدين على مورّد الحبوب.') && named(rpcCalls, 'item_file').length === 2, 'S3 الجملة من الجواب، والملفّ يُقرأ من جديد');
    });

    // ── S4: «انقل» ───────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S4', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => clone(SK), record_transfer: async () => clone(S20.record_transfer.storekeeper) });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('move-item')[0]);
      t.eq(byAction('move-from')[0]?.textContent, 'من «مخزن المواد الأوّلية»: فيه 1,000 كغم', 'S4 المخزن الوحيد بمتاحه');
      const options = (byAction('move-to-store')[0]?.options ?? []).map((o) => o.textContent).filter((label) => label !== 'اختر المخزن');
      t.same(options, ['مخزن مواد ثانٍ'], 'S4 الوجهات من الخادم عدا مخزن الخروج');
      typeIn(byAction('move-qty')[0], '5000');
      choose(byAction('move-to-store')[0], SK.transfer_targets[1].warehouse_id);
      await settle();
      await submit();
      t.ok(text().includes('الموجود 1,000 كغم فقط.') && named(rpcCalls, 'record_transfer').length === 0, 'S4 أكثر من المتاح يُقال قبل الإرسال');
      typeIn(byAction('move-qty')[0], '100');
      await settle();
      t.eq(byAction('save-move')[0]?.textContent, 'انقل 100 كغم «صويا» من «مخزن المواد الأوّلية» إلى «مخزن مواد ثانٍ»', 'S4 الزرّ يسمّي النقل');
      await submit();
      const [args] = named(rpcCalls, 'record_transfer');
      t.same(
        [args?.p_item, args?.p_qty, args?.p_from_warehouse, args?.p_to_warehouse, args?.p_on, [args?.p_client_ref, args?.p_doc_id, args?.p_line_id].every((x) => UUID.test(x ?? ''))],
        [SK_ID, '100.000', SK.stores[0].warehouse_id, SK.transfer_targets[1].warehouse_id, '2026-11-08', true],
        'S4 record_transfer بمفاتيحه',
      );
      t.ok(text().includes('نُقل 100 كغم «صويا» من «مخزن المواد الأوّلية» إلى «مخزن مواد ثانٍ» (TR-2026-0001).'), 'S4 الجملة من جواب الخادم');
    });
    await step('S4-two-stores', async () => {
      const bulk = S20.item_file.storekeeper_bulk;
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => clone(bulk), record_transfer: async () => clone(S20.record_transfer.owner_farm) });
      await mount(`/inventory/items/${bulk.item.id}`);
      await click(byAction('move-item')[0]);
      const from = byAction('move-from-store')[0];
      t.same((from?.options ?? []).map((o) => o.textContent).slice(1), ['مخزن العلف (600 كغم)', 'مخزن علف ثانٍ (100 كغم)'], 'S4 مخزنان: الاختيار بمتاح كلّ واحد');
      choose(from, bulk.stores[1].warehouse_id);
      await settle();
      const to = (byAction('move-to-store')[0]?.options ?? []).map((o) => o.textContent).slice(1);
      t.ok(!to.includes('مخزن علف ثانٍ') && to.length === bulk.transfer_targets.length - 1, `S4 والوجهات بلا مخزن الخروج (${to.join('، ')})`);
      typeIn(byAction('move-qty')[0], '300');
      await settle();
      await submit();
      t.ok(text().includes('الموجود 100 كغم فقط.') && named(rpcCalls, 'record_transfer').length === 0, 'S4 المتاح من المخزن المختار');
    });

    // ── S5: «حوّل» ───────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S5', async () => {
      // ملفّ «علف بادئ أكياس» (بالقطعة) من جواب حقيقيّ بمادّته ومخزنه كما في جواب التحويل.
      const conv = S20.record_conversion.owner;
      const bags = { ...clone(S20.item_file.owner_bulk), item: { ...clone(S20.item_file.owner_bulk.item), id: conv.from.item_id, name: conv.from.item_name, base_unit: 'pc' }, stores: [{ ...clone(S20.item_file.owner_bulk.stores[0]), qty: '100.000', available: '100.000' }] };
      const { rpcCalls } = fresh({ status: 'ready', workspace: ws('owner') }, suppliers, {
        item_file: async () => clone(bags),
        items_overview: async () => clone(S20.items_overview.storekeeper),
        record_conversion: async () => clone(conv),
      });
      await mount(`/inventory/items/${conv.from.item_id}`);
      await click(byAction('convert-item')[0]);
      await settle();
      const cards = byAction('op-item-card').map((n) => n.getAttribute('data-item'));
      t.ok(!cards.includes(conv.from.item_id) && !cards.includes(S20.items_overview.storekeeper.items.find((x) => x.kind === 'chick').id), 'S5 بطاقات المواد بلا المادّة نفسها ولا الأفراخ');
      typeIn(byAction('op-item-search')[0], 'سائب');
      await settle();
      await click(byAction('op-item-card').find((n) => n.getAttribute('data-item') === conv.to.item_id));
      t.eq(byAction('convert-target')[0]?.textContent, 'إلى «علف بادئ سائب» (كغم)', 'S5 المادّة الثانية بوحدتها');
      typeIn(byAction('convert-from-qty')[0], '20');
      await settle();
      t.eq(byAction('convert-to-qty')[0]?.value, '', 'S5 بوحدتين مختلفتين لا تُنسخ الكمية');
      typeIn(byAction('convert-to-qty')[0], '1000');
      await settle();
      t.eq(byAction('save-convert')[0]?.textContent, 'حوّل 20 قطعة من «علف بادئ أكياس» إلى 1,000 كغم من «علف بادئ سائب»', 'S5 الزرّ يسمّي الكميتين');
      await submit();
      const [args] = named(rpcCalls, 'record_conversion');
      t.same([args?.p_from_item, args?.p_from_qty, args?.p_to_item, args?.p_to_qty, args?.p_from_warehouse, args?.p_to_warehouse], [conv.from.item_id, '20.000', conv.to.item_id, '1000.000', null, null], 'S5 record_conversion: المخزنان يختارهما الخادم');
      t.ok(text().includes(`حُوِّل 20 قطعة من «علف بادئ أكياس» في «مخزن العلف» إلى 1,000 كغم من «علف بادئ سائب» في «مخزن العلف» (${conv.doc_no}).`), `S5 الجملة من جواب الخادم (${text().slice(0, 300)})`);
    });
    await step('S5-same-unit', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => clone(SK), items_overview: async () => clone(S20.items_overview.storekeeper) });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('convert-item')[0]);
      await settle();
      const crushed = S20.items_overview.storekeeper.items.find((x) => x.name === 'صويا مجروشة');
      await click(byAction('op-item-card').find((n) => n.getAttribute('data-item') === crushed.id));
      typeIn(byAction('convert-from-qty')[0], '250');
      await settle();
      t.eq(byAction('convert-to-qty')[0]?.value, '250', 'S5 بالوحدة نفسها كمية الثانية تتبع الأولى');
      typeIn(byAction('convert-to-qty')[0], '240');
      typeIn(byAction('convert-from-qty')[0], '260');
      await settle();
      t.eq(byAction('convert-to-qty')[0]?.value, '240', 'S5 وبعد كتابتها يدوياً لا تتبعها');
    });

    // ── S6: «احذف» و«أخفِها بدلاً من ذلك» ────────────────────────────────────────────────────────────────────────────
    await step('S6', async () => {
      const file = S20.item_file.manager_fresh_before_delete;
      const { rpcCalls } = fresh({ status: 'ready', workspace: MANAGER }, {}, { item_file: async () => clone(file), delete_item: async () => clone(S20.delete_item.manager) });
      await mount(`/inventory/items/${file.item.id}?${new URLSearchParams({ back: '/inventory/store/w-raw' })}`);
      t.same([byAction('delete-item')[0]?.textContent, byAction('hide-item').length], ['احذف', 0], 'S6 مادّة لم تُستعمل: «احذف» بلا «أخفِ»');
      await click(byAction('delete-item')[0]);
      t.ok(text().includes('حذف «مادّة للحذف» نهائياً؟') && text().includes('لم تُشترَ ولم تتحرّك ولم تدخل خلطة ولا مستنداً'), 'S6 التأكيد يسمّي المادّة وأثر الحذف');
      await click(byAction('confirm-delete-item')[0]);
      await settle();
      t.same(named(rpcCalls, 'delete_item'), [{ p_item: file.item.id, p_expected_version: 1 }], 'S6 delete_item بنسخة المادّة من الملفّ');
      t.same([where?.pathname, globalThis.__so.toasts.at(-1)?.title], ['/inventory/store/w-raw', 'حُذفت «مادّة للحذف».'], 'S6 ثمّ يرجع إلى حيث جاء ويقول «حُذفت»');
    });
    await step('S6-in-use', async () => {
      const file = S20.item_file.manager_fresh_before_delete;
      const { calls } = fresh({ status: 'ready', workspace: MANAGER }, { loadItem: () => itemRow({ id: file.item.id, name: file.item.name, version: 1 }), setArchived: () => 2 }, {
        item_file: async () => clone(file),
        delete_item: async () => {
          throw new m.RejectedError(S20.refusals.item_in_use.code, S20.refusals.item_in_use.hint);
        },
      });
      await mount(`/inventory/items/${file.item.id}`);
      await click(byAction('delete-item')[0]);
      await click(byAction('confirm-delete-item')[0]);
      await settle();
      // سباق (استُعملت بعد الفتح): التأكيد نفسه يصير تأكيد الإخفاء، بلا خطوة ثانية ولا رفض يُعرض (كلمة المالك 2026-11-09).
      t.ok(byAction('delete-hides').length === 1 && byAction('delete-failed').length === 0 && byAction('hide-instead').length === 0
        && text().includes('استُعملت «مادّة للحذف» للتوّ من نافذة أو جهاز آخر، فلا يُمحى سجلّها'), 'S6 item_in_use: التأكيد نفسه يقول إنّها تختفي ويبقى سجلّها');
      await click(byAction('confirm-delete-item')[0]);
      await settle();
      t.same(named(calls, 'setArchived'), [['items', file.item.id, 1, true]], 'S6 والضغطة التالية تُخفيها بالأرشفة القائمة');
      t.eq(globalThis.__so.toasts.at(-1)?.title, 'حُذفت «مادّة للحذف» من القوائم، وسجلّها باقٍ في التقارير.', 'S6 وتقول إنّها حُذفت من القوائم');
    });
    await step('S6-uses', async () => {
      const file = S20.item_file.owner_bulk;
      const { calls, rpcCalls } = fresh({ status: 'ready', workspace: ws('owner') }, { loadItem: () => itemRow({ id: file.item.id, name: file.item.name, version: 3 }), setArchived: () => 4 }, {
        item_file: async () => clone(file),
      });
      await mount(`/inventory/items/${file.item.id}?${new URLSearchParams({ back: '/inventory/store/w-feed' })}`);
      t.same([byAction('delete-item')[0]?.textContent, byAction('hide-item').length, byAction('file-uses').length], ['احذف', 0, 0], 'S6 مادّة مستعملة: «احذف» نفسه، بلا «أخفِ» ولا «لا تُحذف»');
      t.same(['sell-item', 'convert-item', 'move-item'].map((action) => byAction(action)[0]?.textContent), ['بِع', 'حوّل', 'انقل'], 'S6 صفّ الأفعال: «بِع» و«حوّل» و«انقل»');
      await click(byAction('delete-item')[0]);
      t.ok(text().includes(`«${file.item.name}» ${file.uses.join('، ')}، فلا يُمحى سجلّها`), 'S6 التأكيد يسمّي استعمالاتها من الخادم');
      t.eq(byAction('delete-on-hand')[0]?.textContent, 'وعندك منها 1,000 كغم: تبقى محسوبة في قيمة المخزن.', 'S6 ورصيدها الباقي');
      await click(byAction('confirm-delete-item')[0]);
      await settle();
      t.same([named(calls, 'setArchived'), named(rpcCalls, 'delete_item').length, where?.pathname], [[['items', file.item.id, 3, true]], 0, '/inventory/store/w-feed'], 'S6 تُخفى بنسختها بلا delete_item، ويرجع إلى حيث جاء');
    });
    await step('S6-recipe-uses', async () => {
      // في خلطة أو ناتج خلطة: التأكيد يقول ما يلزم بعد إخفائها (وإلّا لا يُنتَج بها).
      fresh({ status: 'ready', workspace: MANAGER }, {}, { item_file: async () => fileJson({ can_edit: true, can_delete: false, uses: ['لها مشتريات', 'في خلطة', 'ناتج خلطة'] }) });
      await mount('/inventory/items/i-corn');
      await click(byAction('delete-item')[0]);
      t.same([byAction('delete-in-recipe')[0]?.textContent, byAction('delete-recipe-output')[0]?.textContent], ['وهي في خلطة: عدّل الخلطة وأزلها منها، وإلّا لا يُنتَج بها.', 'وهي ما تنتجه خلطة: احذف الخلطة من المعمل أيضاً، فلا يُنتَج بها بعد.'], 'S6 في خلطة وناتج خلطة: ما يلزم بعد الإخفاء');
    });
    await step('S6-viewer', async () => {
      fresh({ status: 'ready', workspace: ws('viewer') }, {}, { item_file: async () => clone(S20.item_file.viewer_unpriced) });
      await mount(`/inventory/items/${SK_ID}`);
      t.same(['record-purchase', 'sell-item', 'convert-item', 'move-item', 'delete-item', 'hide-item', 'file-actions'].map((action) => byAction(action).length), [0, 0, 0, 0, 0, 0, 0], 'S6 المشاهد: بلا صفّ أفعال');
    });

    // ── S7: بطاقة المادّة تقول «مشتريات بلا سعر» ───────────────────────────────────────────────────────────────────
    await step('S7', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, {}, { items_overview: async () => clone(S20.items_overview.storekeeper) });
      await mount('/inventory');
      const tiles = byAction('tile-unpriced').map((n) => [n.parentNode?.getAttribute('href'), n.textContent]);
      t.same(tiles, [[`/inventory/items/${S20.items_overview.storekeeper.items.find((x) => x.name === 'صويا').id}`, 'مشتريات بلا سعر: 1']], 'S7 بطاقة «صويا» وحدها: «مشتريات بلا سعر: 1»');
    });

    // ── S8: «بِع» (الطلب؛ وجواب البيع الحقيقيّ في S9 بعد 0021) ───────────────────────────────────────────────────────
    const BULK = S20.item_file.storekeeper_bulk;
    const bulkWithPrice = () => ({ ...clone(BULK), money: { ...clone(BULK.money), sell_price: '700' }, cash_accounts: [{ id: 'b-1', name: 'الصندوق الرئيسي' }] });
    await step('S8', async () => {
      const { rpcCalls, calls } = fresh({ status: 'ready', workspace: KEEPER }, { searchSuppliers: () => ({ parties: [{ id: 'p-9', name: 'أبو علي' }], total: 1 }) }, { item_file: async () => bulkWithPrice() });
      await mount(`/inventory/items/${BULK.item.id}`);
      await click(byAction('sell-item')[0]);
      t.ok(text().includes('بِع «علف بادئ سائب»'), 'S8 النافذة باسم المادّة');
      t.eq(all().find((n) => n.id.endsWith('-price'))?.value, '700', 'S8 السعر من سعر البيع الحاليّ');
      typeIn(all().find((n) => n.id.endsWith('-party')), 'زبون جديد');
      await settle();
      // 0024 (المهمّة #58، جواب المالك 2026-11-08): الأمين يضيف الزبون بنفسه، فبوّابة «جهة جديدة» party.create لا parties.manage.
      t.ok(byAction('create-party')[0]?.textContent === 'جهة جديدة: أضف «زبون جديد»' && byAction('party-create-hint').length === 0, 'S8 الأمين يضيف الزبون (0024 #58): «جهة جديدة» بالاسم المكتوب، بلا سطر «يضيفه غيره»');
      await click(byAction('pick-party')[0]);
      t.same((byAction('sale-store')[0]?.options ?? []).map((o) => o.textContent).slice(1), ['مخزن العلف (600 كغم)', 'مخزن علف ثانٍ (100 كغم)'], 'S8 مخزنان: الاختيار بمتاح كلّ واحد');
      typeIn(byAction('sale-qty')[0], '200');
      choose(byAction('sale-store')[0], BULK.stores[1].warehouse_id);
      await settle();
      await submit();
      t.ok(text().includes('الموجود 100 كغم فقط.') && named(rpcCalls, 'record_sale').length === 0, 'S8 أكثر من متاح المخزن المختار يُقال قبل الإرسال');
      choose(byAction('sale-store')[0], BULK.stores[0].warehouse_id);
      await settle();
      t.same([byAction('sale-total')[0]?.textContent, byAction('save-sale')[0]?.textContent], ['المجموع: 140,000 دينار', 'بِع 200 كغم علف بادئ سائب لـ«أبو علي» بـ140,000 دينار بالدين'], 'S8 المجموع حيّاً وزرّ يسمّي البيع بالدين');
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'نقداً إلى الصندوق'));
      t.eq(byAction('save-sale')[0]?.textContent, 'بِع 200 كغم علف بادئ سائب لـ«أبو علي» بـ140,000 دينار نقداً إلى الصندوق الرئيسي', 'S8 النقد إلى الصندوق الوحيد');
      await submit();
      const [args] = named(rpcCalls, 'record_sale');
      t.same(
        [args?.p_party, args?.p_item, args?.p_qty, args?.p_unit_price, args?.p_sold_on, args?.p_payment, args?.p_cash_account, args?.p_warehouse, [args?.p_client_ref, args?.p_sale_id, args?.p_line_id].every((x) => UUID.test(x ?? ''))],
        ['p-9', BULK.item.id, '200.000', '700.00', '2026-11-08', 'cash', 'b-1', BULK.stores[0].warehouse_id, true],
        'S8 record_sale بمفاتيحه الأحد عشر',
      );
      t.eq(named(calls, 'listBoxes').length, 0, 'S8 الصناديق من الملفّ (الأمين لا يقرأ جدولها)');
    });
    await step('S8-free-and-customer', async () => {
      const { rpcCalls, calls } = fresh({ status: 'ready', workspace: MANAGER }, { searchSuppliers: () => ({ parties: [], total: 0 }), supplierTwins: () => [], createCustomer: (name) => ({ id: 'p-new', name }) }, { item_file: async () => clone(S20.item_file.storekeeper_unpriced) });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('sell-item')[0]);
      typeIn(all().find((n) => n.id.endsWith('-party')), 'مزرعة الجار');
      await settle();
      t.eq(byAction('create-party')[0]?.textContent, 'جهة جديدة: أضف «مزرعة الجار»', 'S8 المدير: «جهة جديدة» بالاسم المكتوب');
      await click(byAction('create-party')[0]);
      await settle();
      t.same(named(calls, 'createCustomer'), [['مزرعة الجار']], 'S8 والجهة الجديدة زبون');
      t.eq(byAction('sale-store').length, 0, 'S8 مخزن واحد: لا اختيار');
      typeIn(byAction('sale-qty')[0], '10');
      typeIn(all().find((n) => n.id.endsWith('-price')), '0');
      await settle();
      t.eq(byAction('save-sale')[0]?.textContent, 'سلّم 10 كغم صويا لـ«مزرعة الجار» بلا مقابل', 'S8 السعر صفر: «سلّم … بلا مقابل»');
      await submit();
      t.ok(text().includes('تسليم بلا مقابل؟') && text().includes('بفاتورة بيع بسعر صفر') && named(rpcCalls, 'record_sale').length === 0, 'S8 تأكيد صريح قبل الإرسال');
      await click(byAction('confirm-free-sale')[0]);
      await settle();
      const [args] = named(rpcCalls, 'record_sale');
      t.same([args?.p_unit_price, args?.p_payment, args?.p_party, args?.p_warehouse], ['0.00', 'credit', 'p-new', null], 'S8 ثمّ يُرسل بسعر صفر');
    });

    // ── S9: محلّلات 0021 بأجوبة القاعدة الحقيقية ────────────────────────────────────────────────────────────────────────
    {
      const credit = m.parseRecordedSale(S21.record_sale.storekeeper_credit);
      const cash = m.parseRecordedSale(S21.record_sale.owner_cash);
      const free = m.parseRecordedSale(S21.record_sale.storekeeper_free);
      t.same([credit.docNo, credit.money, credit.cost, credit.payment], ['FD-2026-0001', { unitPrice: 75_000n, lineTotal: 7_500_000n }, null, 'credit'], 'S9 بيع الأمين بالدين: المبلغ بلا كلفة (الكلفة لأدوار الكلفة)');
      t.same([cash.docNo, cash.cost, cash.payment], ['MS-2026-0001', { cost: 9_000_000n, profit: 3_000_000n }, 'cash'], 'S9 بيع المالك نقداً: الكلفة والربح');
      t.same([free.free, free.money?.lineTotal], [true, 0n], 'S9 التسليم بلا مقابل: free والمبلغ صفر');
      t.same([m.parseVoidedSale(S21.void_sale.manager_cash_kept).paymentKept, m.parseVoidedSale(S21.void_sale.manager_credit).paymentKept], [12_000_000n, 0n], 'S9 الإلغاء: المقبوض نقداً يبقى رصيداً، والدين صفر');
      const owner = m.parseSalesOverview(S21.sales_overview.owner);
      const keeper = m.parseSalesOverview(S21.sales_overview.storekeeper);
      t.same([owner.totals.count, owner.totals.voided, owner.totals.money?.revenue, owner.totals.cost, owner.canVoid, owner.rows.map((row) => row.status)], [2, 2, 7_500_000n, { cost: 6_800_000n, profit: 700_000n }, true, S21.sales_overview.owner.rows.map((row) => row.status)], 'S9 قائمة المالك: المجاميع للمحفوظ والكلفة والربح');
      t.same([keeper.totals.cost, keeper.rows.every((row) => row.cost === null), keeper.canVoid], [null, true, false], 'S9 قائمة الأمين: بلا كلفة ولا ربح ولا «ألغِ»');
      const items = m.parseSalesReport(S21.sales_report.owner_item);
      t.same(items.rows.map((row) => [row.label, row.qty, row.baseUnit, row.revenue, row.cost?.profit]), [['علف بادئ', 100_000n, 'kg', 7_500_000n, 1_500_000n], ['كاز', 10_000n, 'L', 0n, -800_000n]], 'S9 التقرير بالمادّة: الكمية بوحدتها والربح (والتسليم بلا مقابل ربحه سالب)');
      t.same([m.parseSalesReport(S21.sales_report.owner_party).rows[0].qty, m.parseSalesReport(S21.sales_report.storekeeper_party).totals.cost], [null, null], 'S9 بالجهة بلا كمية، وللأمين بلا كلفة');
    }

    // payment_refunded (مراجعة 0021): النقد المردود يُقرأ بالدين، والعلامة تقول إنّه رُدّ.
    {
      const refunded = m.parseSalesOverview(S21.sales_overview.owner).rows.find((row) => row.docNo === 'MS-2026-0001');
      t.same([refunded?.payment, refunded?.paymentRefunded, m.parseRecordedSale(S21.record_sale.owner_cash).paymentRefunded], ['credit', true, false], 'S9 payment_refunded: البيع النقديّ المردود مبلغه بالدين وعلامته true');
    }

    // ── S10: «بِع» من ملفّ المادّة بجواب حقيقيّ ──────────────────────────────────────────────────────────────────────
    await step('S10', async () => {
      const starter = S21.item_file_storekeeper_starter;
      const sold = S21.record_sale.storekeeper_credit;
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, { searchSuppliers: () => ({ parties: [{ id: sold.party_id, name: sold.party_name }], total: 1 }) }, { item_file: async () => clone(starter), record_sale: async () => clone(sold) });
      await mount(`/inventory/items/${starter.item.id}`);
      await click(byAction('sell-item')[0]);
      await click(byAction('pick-party')[0]);
      choose(byAction('sale-store')[0], sold.warehouse_id);
      typeIn(byAction('sale-qty')[0], '100');
      typeIn(all().find((n) => n.id.endsWith('-price')), '750');
      await settle();
      await submit();
      const [args] = named(rpcCalls, 'record_sale');
      t.same([args?.p_warehouse, args?.p_qty, args?.p_unit_price, args?.p_payment], [sold.warehouse_id, '100.000', '750.00', 'credit'], 'S10 record_sale بالمخزن المختار');
      t.ok(text().includes('حُفظ البيع FD-2026-0001: 100 كغم «علف بادئ» لـ«أبو أحمد» من «مخزن العلف» بـ75,000 دينار بالدين عليها.') && named(rpcCalls, 'item_file').length === 2, `S10 الجملة من جواب الخادم والملفّ يُقرأ من جديد (${text().slice(0, 300)})`);
    });

    // ── S11: صفحة المبيعات ────────────────────────────────────────────────────────────────────────────────────────────
    const monthFrom = () => `${m.localDay().slice(0, 8)}01`;
    /** خلايا رأس الجدول وحدها (لا «المجموع» في تذييله). */
    const headCells = () => all().filter((n) => n.localName === 'th' && n.parentNode?.parentNode?.localName === 'thead').map((n) => n.textContent);
    await step('S11', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: ws('owner') }, {}, {
        sales_overview: async () => clone(S21.sales_overview.owner),
        sales_report: async (args) => clone(S21.sales_report[`owner_${args.p_group}`]),
      });
      await mount('/sales');
      t.same(named(rpcCalls, 'sales_overview'), [{ p_from: monthFrom(), p_to: m.localDay() }], 'S11 المدّة الافتراضية من أوّل الشهر إلى اليوم');
      const stats = all().filter((n) => n.localName === 'dt').map((n) => `${n.textContent}=${n.nextSibling?.textContent}`);
      t.same(stats, ['فواتير محفوظة=2', 'مجموع البيع=75,000 دينار', 'منه نقداً=0 دينار', 'منه بالدين=75,000 دينار', 'كلفة المبيع=68,000 دينار', 'الربح=7,000 دينار'], 'S11 المجاميع من الخادم، والكلفة والربح للمالك');
      const heads = all().filter((n) => n.localName === 'th').map((n) => n.textContent);
      // والكمية رقماً بمراتب العمود والوحدة بعمودها (مراجعة 0021 L2، نمط 0019).
      t.same(heads.slice(0, 10), ['التاريخ', 'الرقم', 'الجهة', 'المادّة', 'الكمية', 'الوحدة', 'السعر', 'المبلغ', 'الدفع', 'الحالة'], 'S11 جدول واحد بأعمدة العقد، والوحدة بعمودها');
      const firstRow = all().filter((n) => n.localName === 'td').slice(0, 9).map((n) => n.textContent);
      t.same(firstRow, ['08/11/2026', 'MS-2026-0002', 'أبو أحمد', 'كاز', '10', 'لتر', '0.00', '0', 'بلا مقابل'], 'S11 صفّ التسليم بلا مقابل');
      t.same([byAction('sale-voided').length, byAction('void-sale').length], [2, 2], 'S11 الملغاة «ملغى»، والمحفوظة بـ«ألغِ» للمالك');
      t.ok(text().includes('مجموع المحفوظ'), 'S11 وصفّ المجموع');
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'حسب المادّة'));
      await settle();
      t.same(named(rpcCalls, 'sales_report').map((args) => args.p_group), ['item'], 'S11 «حسب المادّة» يقرأ التقرير');
      const reportHeads = headCells();
      t.same(reportHeads, ['المادّة', 'عدد الفواتير', 'الكمية', 'الوحدة', 'المبلغ', 'الكلفة', 'الربح'], 'S11 التقرير بالمادّة بالكمية ووحدتها والكلفة والربح');
      const reportCells = all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.same(reportCells.slice(0, 7), ['علف بادئ', '1', '100', 'كغم', '75,000', '60,000', '15,000'], 'S11 صفّ المادّة بأرقامه');
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'حسب الجهة'));
      await settle();
      t.same(headCells(), ['الجهة', 'عدد الفواتير', 'المبلغ', 'الكلفة', 'الربح'], 'S11 بالجهة بلا كمية (وحدات مختلفة)');
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'حسب اليوم'));
      await settle();
      t.eq(all().filter((n) => n.localName === 'td').map((n) => n.textContent)[0], '08/11/2026', 'S11 باليوم');
      typeIn(all().find((n) => n.id.endsWith('-from')), 'أمس');
      await settle();
      t.ok(text().includes('اكتب التاريخ يوم/شهر/سنة') && named(rpcCalls, 'sales_report').length === 3, 'S11 مدّة لا تُقرأ: رسالة ولا قراءة');
    });
    await step('S11-keeper', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, {}, { sales_overview: async () => clone(S21.sales_overview.storekeeper), sales_report: async () => clone(S21.sales_report.storekeeper_party) });
      await mount('/sales');
      const stats = all().filter((n) => n.localName === 'dt').map((n) => n.textContent);
      t.ok(!stats.includes('الربح') && !stats.includes('كلفة المبيع') && byAction('void-sale').length === 0 && byAction('new-sale').length === 1, 'S11 الأمين: «بيع جديد» بلا كلفة ولا ربح ولا «ألغِ»');
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'حسب الجهة'));
      await settle();
      t.same(headCells(), ['الجهة', 'عدد الفواتير', 'المبلغ'], 'S11 وتقريره بلا كلفة ولا ربح');
    });

    // ── S12: «ألغِ» البيع ──────────────────────────────────────────────────────────────────────────────────────────────
    await step('S12', async () => {
      // صفّ البيع النقديّ محفوظاً قبل إلغائه وقبل ردّ مبلغه، من الجواب الحقيقيّ نفسه (في العيّنة أُلغي ورُدّ مبلغه فقُرئ بالدين).
      const overview = clone(S21.sales_overview.owner);
      const cashRow = overview.rows.find((row) => row.doc_no === 'MS-2026-0001');
      Object.assign(cashRow, { status: 'posted', payment: 'cash', payment_refunded: false });
      const { rpcCalls } = fresh({ status: 'ready', workspace: MANAGER }, {}, { sales_overview: async (_args, n) => (n === 1 ? overview : clone(S21.sales_overview.owner)), void_sale: async () => clone(S21.void_sale.manager_cash_kept) });
      await mount('/sales');
      const buttons = byAction('void-sale');
      const rowOf = (button) => { let n = button; while (n && n.localName !== 'tr') n = n.parentNode; return n?.textContent ?? ''; };
      await click(buttons.find((button) => rowOf(button).includes('MS-2026-0001')));
      t.ok(text().includes('إلغاء البيع MS-2026-0001؟') && byAction('void-cash-kept')[0]?.textContent.includes('والمبلغ المقبوض نقداً (120,000 دينار) يبقى رصيداً لـ«شركة الدواجن»'), 'S12 التأكيد يسمّي الأثر ويقول إنّ المقبوض يبقى رصيداً');
      await click(byAction('confirm-void-sale')[0]);
      t.ok(text().includes('اكتب سبب الإلغاء.') && named(rpcCalls, 'void_sale').length === 0, 'S12 السبب إلزاميّ');
      typeIn(byAction('void-sale-reason')[0], 'خطأ في الجهة');
      await settle();
      await click(byAction('confirm-void-sale')[0]);
      await settle();
      const [args] = named(rpcCalls, 'void_sale');
      t.same([args?.p_sale_id, args?.p_reason, UUID.test(args?.p_client_ref ?? '')], [cashRow.id, 'خطأ في الجهة', true], 'S12 void_sale بالفاتورة والسبب والمرجع');
      t.ok(text().includes('أُلغي البيع MS-2026-0001. والمقبوض 120,000 دينار باقٍ رصيداً لـ«شركة الدواجن».') && named(rpcCalls, 'sales_overview').length === 2, 'S12 الجملة من جواب الخادم، والقائمة تُقرأ من جديد');
    });

    // ── S13: «بيع جديد» من الرئيسية (?new=1) ────────────────────────────────────────────────────────────────────────────
    await step('S13', async () => {
      const starter = S21.item_file_storekeeper_starter;
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, {}, { sales_overview: async () => clone(S21.sales_overview.storekeeper), items_overview: async () => clone(S20.items_overview.storekeeper), item_file: async () => clone(starter) });
      await mount('/sales?new=1');
      await settle();
      const cards = byAction('op-item-card').map((n) => n.textContent.split('عندك')[0]);
      t.same(cards, S20.items_overview.storekeeper.items.filter((x) => x.on_hand_qty !== '0' && !['chick', 'hatching_egg', 'table_egg'].includes(x.kind)).map((x) => x.name), 'S13 «بيع جديد»: بطاقات ما في المخزن منه شيء، بلا الأفراخ والبيض');
      await click(byAction('op-item-card')[0]);
      await settle();
      t.ok(byAction('save-sale').length === 1 && named(rpcCalls, 'item_file').length === 1, 'S13 ثمّ نافذة «بِع» بأرقام ملفّ المادّة');
      await click(byAction('sale-cancel')[0]);
      t.same([byAction('save-sale').length, where?.search], [0, ''], 'S13 والإغلاق يشيل العلامة');
    });

    // ── R: مراجعة الشاشات ─────────────────────────────────────────────────────────────────────────────────────────
    const unknownOnce = (result) => {
      let first = true;
      return async () => {
        if (first) {
          first = false;
          throw new m.UnknownOutcomeError('fetch_failed');
        }
        return clone(result);
      };
    };
    const starter = S21.item_file_storekeeper_starter;
    const soldCredit = S21.record_sale.storekeeper_credit;
    const sellFromFile = async () => {
      await click(byAction('sell-item')[0]);
      await click(byAction('pick-party')[0]);
      choose(byAction('sale-store')[0], soldCredit.warehouse_id);
      typeIn(byAction('sale-qty')[0], '100');
      typeIn(all().find((n) => n.id.endsWith('-price')), '750');
      await settle();
      await submit();
    };
    await step('R-H1-sale-file', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, { searchSuppliers: () => ({ parties: [{ id: soldCredit.party_id, name: soldCredit.party_name }], total: 1 }) }, { item_file: async () => clone(starter), record_sale: unknownOnce(soldCredit) });
      await mount(`/inventory/items/${starter.item.id}`);
      await sellFromFile();
      t.ok(text().includes('لم يُعرف إن حُفظ؛ أعد المحاولة') && byAction('save-sale')[0]?.textContent === 'أعد المحاولة', 'H1 البيع: نتيجة مجهولة');
      await click(byAction('sale-cancel')[0]);
      await settle();
      t.ok(byAction('save-sale').length === 0 && byAction('retry-pending-sell').length === 1 && text().includes('لم يُعرف إن حُفظ البيع — أعد المحاولة') && text().includes('المرسَل: 100 كغم علف بادئ بـ75,000 دينار، بتاريخ 08/11/2026.'), `H1 البيع: «أغلق» يبقي النداء بشريط في الملفّ (${text().slice(0, 400)})`);
      await click(byAction('sell-item')[0]);
      t.same([byAction('save-sale')[0]?.textContent, byAction('sale-sent')[0]?.textContent, byAction('sale-qty').length], ['أعد المحاولة', 'المرسَل: 100 كغم علف بادئ بـ75,000 دينار، بتاريخ 08/11/2026.', 0], 'H1 البيع: «بِع» ثانيةً يفتح النداء المعلَّق نفسه لا نموذجاً جديداً');
      await submit();
      await settle();
      const [first, second] = named(rpcCalls, 'record_sale');
      t.same(second, first, 'H1 البيع: الإعادة بالمعرّفات والمحتوى نفسه حرفاً (لا بيع ثانٍ بمعرّفين)');
      t.ok(text().includes('حُفظ البيع FD-2026-0001') && byAction('retry-pending-sell').length === 0, 'H1 البيع: ثمّ حُفظ وانتهى الشريط');
    });
    await step('R-H1-sale-new-ids', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, { searchSuppliers: () => ({ parties: [{ id: soldCredit.party_id, name: soldCredit.party_name }], total: 1 }) }, { item_file: async () => clone(starter), record_sale: async () => clone(soldCredit) });
      await mount(`/inventory/items/${starter.item.id}`);
      await sellFromFile();
      await settle();
      await sellFromFile();
      await settle();
      const [a, b] = named(rpcCalls, 'record_sale');
      t.ok(a && b && a.p_sale_id !== b.p_sale_id && a.p_client_ref !== b.p_client_ref, 'H1 البيع: بعد الحفظ بيع جديد بمعرّفات جديدة');
    });
    await step('R-H1-sale-page', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, { searchSuppliers: () => ({ parties: [{ id: soldCredit.party_id, name: soldCredit.party_name }], total: 1 }) }, {
        sales_overview: async () => clone(S21.sales_overview.storekeeper),
        items_overview: async () => clone(S20.items_overview.storekeeper),
        item_file: async () => clone(starter),
        record_sale: unknownOnce(soldCredit),
      });
      await mount('/sales?new=1');
      await settle();
      await click(byAction('op-item-card')[0]);
      await settle();
      await click(byAction('pick-party')[0]);
      choose(byAction('sale-store')[0], soldCredit.warehouse_id);
      typeIn(byAction('sale-qty')[0], '100');
      typeIn(all().find((n) => n.id.endsWith('-price')), '750');
      await settle();
      await submit();
      await click(byAction('sale-cancel')[0]);
      await settle();
      t.ok(byAction('retry-pending-sale').length === 1 && byAction('save-sale').length === 0, 'H1 صفحة المبيعات: الإغلاق بعد نتيجة مجهولة يبقي شريط «أعد المحاولة»');
      await click(byAction('retry-pending-sale')[0]);
      await settle();
      t.eq(byAction('save-sale')[0]?.textContent, 'أعد المحاولة', 'H1 صفحة المبيعات: الشريط يفتح النداء المعلَّق نفسه');
      await submit();
      await settle();
      const [first, second] = named(rpcCalls, 'record_sale');
      t.same(second, first, 'H1 صفحة المبيعات: الإعادة بالنداء نفسه حرفاً');
      t.ok(text().includes('حُفظ البيع FD-2026-0001') && byAction('retry-pending-sale').length === 0, 'H1 صفحة المبيعات: ثمّ حُفظ');
    });
    await step('R-H1-convert', async () => {
      const conv = S20.record_conversion.owner;
      const crushed = S20.items_overview.storekeeper.items.find((x) => x.name === 'صويا مجروشة');
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => clone(SK), items_overview: async () => clone(S20.items_overview.storekeeper), record_conversion: unknownOnce(conv) });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('convert-item')[0]);
      await settle();
      await click(byAction('op-item-card').find((n) => n.getAttribute('data-item') === crushed.id));
      typeIn(byAction('convert-from-qty')[0], '250');
      await settle();
      await submit();
      await click(byAction('convert-cancel')[0]);
      await settle();
      t.ok(byAction('retry-pending-convert').length === 1 && text().includes('لم يُعرف إن حُفظ التحويل — أعد المحاولة'), 'H1 التحويل: الإغلاق يبقي الشريط');
      await click(byAction('retry-pending-convert')[0]);
      t.ok(byAction('convert-sent')[0]?.textContent.includes('حوّل 250 كغم من «صويا» إلى 250 كغم من «صويا مجروشة»') && byAction('save-convert')[0]?.textContent === 'أعد المحاولة', 'H1 التحويل: النداء المعلَّق بملخّصه');
      await submit();
      await settle();
      const [first, second] = named(rpcCalls, 'record_conversion');
      t.same(second, first, 'H1 التحويل: الإعادة بالنداء نفسه حرفاً');
    });
    await step('R-H1-move', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => clone(SK), record_transfer: unknownOnce(S20.record_transfer.storekeeper) });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('move-item')[0]);
      typeIn(byAction('move-qty')[0], '100');
      choose(byAction('move-to-store')[0], SK.transfer_targets[1].warehouse_id);
      await settle();
      await submit();
      await click(byAction('move-cancel')[0]);
      await settle();
      t.ok(byAction('retry-pending-move').length === 1, 'H1 النقل: الإغلاق يبقي الشريط');
      await click(byAction('move-item')[0]);
      t.ok(byAction('move-sent')[0]?.textContent.includes('انقل 100 كغم «صويا» من «مخزن المواد الأوّلية» إلى «مخزن مواد ثانٍ»') && byAction('move-qty').length === 0, 'H1 النقل: «انقل» ثانيةً يفتح النداء المعلَّق نفسه');
      await submit();
      await settle();
      const [first, second] = named(rpcCalls, 'record_transfer');
      t.same(second, first, 'H1 النقل: الإعادة بالنداء نفسه حرفاً');
      t.ok(text().includes('(TR-2026-0001)') && byAction('retry-pending-move').length === 0, 'H1 النقل: ثمّ حُفظ');
    });

    await step('R-M1-L1', async () => {
      fresh({ status: 'ready', workspace: ws('owner') }, {}, { sales_overview: async () => clone(S21.sales_overview.owner) });
      await mount('/sales');
      const rows = all().filter((n) => n.localName === 'tr' && n.parentNode?.localName === 'tbody').map((tr) => descendants(tr).filter((n) => n.localName === 'td').map((n) => n.textContent));
      const voided = rows.filter((cells) => cells.includes('ملغى'));
      t.same(voided.map((cells) => [cells[1], cells[6], cells[7]]), [['MD-2026-0001', '—', '—'], ['MS-2026-0001', '—', '—']], 'M1 الملغاة: «—» في السعر والمبلغ (المجموع للمحفوظ وحده)');
      // التسليم بلا مقابل: لا «يُعكس قيد الفاتورة».
      const freeRow = all().find((n) => n.localName === 'tr' && n.textContent.includes('MS-2026-0002'));
      await click(descendants(freeRow).find((n) => n.getAttribute('data-action') === 'void-sale'));
      t.ok(text().includes('تسليم بلا مقابل لـ«أبو أحمد»: لا قيد عليه') && !text().includes('ويُعكس قيد الفاتورة'), 'L1 إلغاء التسليم بلا مقابل بلا «يُعكس قيد الفاتورة»');
    });
    await step('R-refunded', async () => {
      // بيع نقديّ رُدّ مبلغه (ألغِ القبض) ثمّ يُلغى: لا يُقال إنّ المقبوض يبقى رصيداً.
      const overview = clone(S21.sales_overview.owner);
      const row = overview.rows.find((x) => x.doc_no === 'MS-2026-0001');
      row.status = 'posted';
      fresh({ status: 'ready', workspace: MANAGER }, {}, { sales_overview: async () => overview });
      await mount('/sales');
      const tr = all().find((n) => n.localName === 'tr' && n.textContent.includes('MS-2026-0001'));
      t.ok(tr?.textContent.includes('نقداً، ثمّ رُدّ المبلغ'), `الجدول يقول «نقداً، ثمّ رُدّ المبلغ» (${tr?.textContent})`);
      await click(descendants(tr).find((n) => n.getAttribute('data-action') === 'void-sale'));
      t.same([byAction('void-refunded')[0]?.textContent, byAction('void-cash-kept').length], ['ومبلغها المقبوض رُدّ لـ«شركة الدواجن» من قبل، فلا يبقى منه رصيد.', 0], 'تأكيد الإلغاء لا يدّعي أنّ المقبوض يبقى رصيداً بعد ردّه');
    });
    await step('R-M2', async () => {
      fresh({ status: 'ready', workspace: MANAGER }, {});
      await mount(`/inventory/items/i-corn/details?${new URLSearchParams({ wh: 'w-raw', back: '/inventory/store/w-raw' })}`);
      t.same(byAction('open-item-file').map((n) => [n.getAttribute('href'), n.textContent]), [['/inventory/items/i-corn', 'ملفّ المادّة']], 'M2 الرجوع إلى المخزن ومعه «ملفّ المادّة»');
      await unmount();
      fresh({ status: 'ready', workspace: MANAGER }, {});
      await mount('/inventory/items/i-corn/details');
      t.eq(byAction('open-item-file').length, 0, 'M2 والرجوع إلى الملفّ نفسه بلا رابط ثانٍ');
    });
    await step('R-M3-sale', async () => {
      // الملفّ بمخزن واحد ثمّ صار مخزنين (المادّة دخلت مخزناً ثانياً بعد الفتح): store_required ← القائمة من جديد بتلميح الخادم.
      const one = { ...clone(starter), stores: [clone(starter.stores[0])] };
      let sales = 0;
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, { searchSuppliers: () => ({ parties: [{ id: soldCredit.party_id, name: soldCredit.party_name }], total: 1 }) }, {
        item_file: async (_args, n) => (n === 1 ? one : clone(starter)),
        record_sale: async () => {
          sales += 1;
          if (sales === 1) throw new m.RejectedError(S21.refusals['sale.store_required'].code, S21.refusals['sale.store_required'].hint);
          return clone(soldCredit);
        },
      });
      await mount(`/inventory/items/${starter.item.id}`);
      await click(byAction('sell-item')[0]);
      await click(byAction('pick-party')[0]);
      t.eq(byAction('sale-store').length, 0, 'M3 البيع: مخزن واحد في الملفّ بلا اختيار');
      typeIn(byAction('sale-qty')[0], '100');
      typeIn(all().find((n) => n.id.endsWith('-price')), '750');
      await settle();
      await submit();
      await settle();
      t.ok(byAction('sale-store-hint')[0]?.textContent.includes(S21.refusals['sale.store_required'].hint) && byAction('sale-store').length === 1 && named(rpcCalls, 'item_file').length === 2, 'M3 البيع: store_required يقرأ المخازن من جديد ويعرض الاختيار بتلميح الخادم');
      t.same((byAction('sale-store')[0]?.options ?? []).map((o) => o.getAttribute('value')).filter(Boolean), starter.stores.map((x) => x.warehouse_id), 'M3 البيع: بالمخزنين');
      await submit();
      t.ok(text().includes('اختر المخزن.') && named(rpcCalls, 'record_sale').length === 1, 'M3 البيع: بلا اختيار رسالة ولا إرسال');
      choose(byAction('sale-store')[0], soldCredit.warehouse_id);
      await settle();
      await submit();
      await settle();
      const [first, second] = named(rpcCalls, 'record_sale');
      t.same([second?.p_sale_id, second?.p_warehouse, first?.p_warehouse], [first?.p_sale_id, soldCredit.warehouse_id, null], 'M3 البيع: الإعادة بالمعرّفات نفسها ومعها المخزن');
    });
    // الرفضان الحقيقيّان من القاعدة (مراجعة 0020): from_store_required لمخزن المصدر، وstore_required لمخزن الوجهة.
    for (const [label, refusal, expect] of [
      ['from_store_required', S20.refusals['conversion.from_store_required'], 'from'],
      ['store_required للوجهة', S20.refusals['conversion.store_required'], 'to'],
    ]) {
      const { code, hint } = refusal;
      await step(`R-M3-convert ${label}`, async () => {
        const crushed = S20.items_overview.storekeeper.items.find((x) => x.name === 'صويا مجروشة');
        const two = { ...clone(SK), stores: [clone(SK.stores[0]), { ...clone(SK.stores[0]), warehouse_id: SK.transfer_targets[1].warehouse_id, name: 'مخزن مواد ثانٍ', qty: '50.000', available: '50.000' }] };
        let n = 0;
        const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, { ...suppliers, loadOrgSetup: () => ({ divisions: [], sites: [], packTypes: [], expenseCategories: [], itemCategories: [], warehouses: [] }) }, {
          item_file: async (_args, k) => (k === 1 ? clone(SK) : two),
          items_overview: async () => clone(S20.items_overview.storekeeper),
          record_conversion: async () => {
            n += 1;
            if (n === 1) throw new m.RejectedError(code, hint);
            return clone(S20.record_conversion.owner);
          },
        });
        await mount(`/inventory/items/${SK_ID}`);
        await click(byAction('convert-item')[0]);
        await settle();
        await click(byAction('op-item-card').find((node) => node.getAttribute('data-item') === crushed.id));
        typeIn(byAction('convert-from-qty')[0], '20');
        await settle();
        await submit();
        await settle();
        if (expect === 'from') {
          t.ok(byAction('convert-from-hint')[0]?.textContent.includes(hint) && byAction('convert-from-store').length === 1 && byAction('convert-to-store-pick').length === 0 && named(rpcCalls, 'item_file').length === 2, `M3 التحويل (${label}): اختيار مخزن المصدر بعد قراءة المخازن من جديد`);
          choose(byAction('convert-from-store')[0], two.stores[1].warehouse_id);
          await settle();
          await submit();
          await settle();
          const [first, second] = named(rpcCalls, 'record_conversion');
          t.same([second?.p_doc_id, second?.p_from_warehouse, second?.p_to_warehouse], [first?.p_doc_id, two.stores[1].warehouse_id, null], `M3 التحويل (${label}): الإعادة بمخزن المصدر`);
        } else {
          t.ok(byAction('convert-to-store-pick').length === 1 && byAction('convert-from-hint').length === 0, `M3 التحويل (${label}): اختيار مخزن الوجهة`);
        }
      });
    }
    await step('R-today', async () => {
      // يوم الخادم غير يوم الجهاز: المدّة الافتراضية تُعاد منه.
      const later = { ...clone(S21.sales_overview.storekeeper), today: '2026-12-03', from: '2026-12-01', to: '2026-12-03' };
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, {}, { sales_overview: async () => later });
      await mount('/sales');
      await settle();
      t.same(named(rpcCalls, 'sales_overview').at(-1), { p_from: '2026-12-01', p_to: '2026-12-03' }, 'المدّة الافتراضية من يوم الخادم (أوّل شهره إلى يومه)');
      t.eq(all().find((n) => n.id.endsWith('-to'))?.value, '03/12/2026', 'وحقل «إلى» يقول يوم الخادم');
    });
    await step('R-in-use', async () => {
      const file = S20.item_file.manager_fresh_before_delete;
      fresh({ status: 'ready', workspace: MANAGER }, {}, { item_file: async () => clone(file), delete_item: async () => { throw new m.RejectedError(S20.refusals.item_in_use.code, S20.refusals.item_in_use.hint); } });
      await mount(`/inventory/items/${file.item.id}`);
      await click(byAction('delete-item')[0]);
      await click(byAction('confirm-delete-item')[0]);
      await settle();
      // كلمة المالك 2026-11-09: بعد item_in_use لا رفض ولا خطوة ثانية؛ «احذفها» نفسها تُخفيها الآن (وليس delete_item مرّة ثانية).
      t.same([byAction('confirm-delete-item')[0]?.textContent, byAction('hide-instead').length, byAction('delete-hides').length], ['احذفها', 0, 1], 'بعد item_in_use: «احذفها» نفسها صارت إخفاءً');
    });
    await step('R-free-pending', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: MANAGER }, { searchSuppliers: () => ({ parties: [{ id: 'p-1', name: 'أبو أحمد' }], total: 1 }) }, { item_file: async () => clone(SK), record_sale: async () => { throw new m.UnknownOutcomeError(); } });
      await mount(`/inventory/items/${SK_ID}`);
      await click(byAction('sell-item')[0]);
      await click(byAction('pick-party')[0]);
      typeIn(byAction('sale-qty')[0], '10');
      typeIn(all().find((n) => n.id.endsWith('-price')), '0');
      await settle();
      await submit();
      await click(byAction('confirm-free-sale')[0]);
      await settle();
      t.same([named(rpcCalls, 'record_sale').length, byAction('sale-sent')[0]?.textContent], [1, 'المرسَل: تسليم 10 كغم صويا بلا مقابل، بتاريخ 08/11/2026.'], '«المرسَل» للتسليم بلا مقابل بلا «بـ0 دينار»');
    });
    await step('R-void-unknown', async () => {
      const overview = clone(S21.sales_overview.owner);
      const target = overview.rows.find((row) => row.status === 'posted' && !row.free);
      let n = 0;
      const { rpcCalls } = fresh({ status: 'ready', workspace: MANAGER }, {}, {
        sales_overview: async () => clone(overview),
        void_sale: async () => {
          n += 1;
          if (n === 1) throw new m.UnknownOutcomeError();
          return clone(S21.void_sale.manager_credit);
        },
      });
      await mount('/sales');
      const row = all().find((node) => node.localName === 'tr' && node.textContent.includes(target.doc_no));
      await click(descendants(row).find((node) => node.getAttribute('data-action') === 'void-sale'));
      typeIn(byAction('void-sale-reason')[0], 'خطأ في الكمية');
      await settle();
      await click(byAction('confirm-void-sale')[0]);
      await settle();
      t.ok(byAction('void-sale-unknown').length === 1 && byAction('void-sale-reason')[0]?.hasAttribute('disabled'), 'إلغاء مجهول: يقول ذلك والسبب مقفول');
      typeIn(byAction('void-sale-reason')[0], 'سبب آخر');
      await settle();
      await click(byAction('confirm-void-sale')[0]);
      await settle();
      const [first, second] = named(rpcCalls, 'void_sale');
      t.same([second?.p_client_ref, second?.p_reason], [first?.p_client_ref, 'خطأ في الكمية'], 'إلغاء مجهول: الإعادة بالمرجع والسبب نفسيهما (لا ref_reused)');
    });

    await step('K4-keeper', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, {}, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      t.same([byAction('record-purchase').length, byAction('hide-item').length, byAction('show-item').length], [1, 0, 0], 'K4: الأمين: «اشترِ» بلا «أخفِ»');
    });
  } finally {
    if (root) {
      const mounted = root;
      root = null;
      try {
        mounted.unmount();
      } catch {
        /* swallow-ok: تنظيف بعد رمية */
      }
    }
    delete globalThis.__so;
    restore();
  }
}
