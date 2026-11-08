// شاشات المادّة والشراء (عقد «المعمل، النسخة الثانية» ش-أ، كلمة المالك 2026-11-04): react-dom/client الحقيقي على DOM صغير (dom.mjs)
// يشغّل StockRoutes الحقيقية، وrepo المخزون والشراء والجلسة والرسائل بدائل. كل حالة تفشل على الشفرة قبلها:
// B1 «اشترِ كمية» على كلّ صفّ مادّة يستلمها المخزن لمن يكتب ورقة الاستلام (لا لغيره، ولا لمادّة لا يستلمها المخزن)، برابط
//    ‎/inventory/receipts?new=1&wh=&item=، وعلى بطاقة المادّة؛ B2 الرابط يفتح «استلام جديد» بالمخزن معبّأ (والمخازن محصورة بما
//    يستلم المادّة)، والمسوّدة بمعرّف الجهاز نفسه بعد جواب ضاع (23505 = تنفتح، لا ورقة ثانية)، ثم الورقة وسطرها بالمادّة، والسطر
//    بمعرّفه بعد جواب ضاع، والعلامة تُشال من الرابط بعد الإضافة؛ B3 التوأم بالاسم نفسه: «سجّل شراءً جديداً» أوّلاً و«احفظ مادّة
//    أخرى» ثانياً، وداخل الورقة «استعمل» المادّة الموجودة؛ B4 النوع بأمثلة، وتنبيه مخزن العلف برابط مخزن المواد الأوّلية، وتنبيه
//    نوع لا يظهر في المخزن؛ B5 تلميح التصنيف وتحذير «اسم التصنيف مثل اسم المادّة»؛ B6 سعر الكلفة ببطاقة المادّة بمحرّره المشروط،
//    والدفعة المنتجة «صُنعت بدفعة PD-…» برابط صفحة الدفعة، وحركة الإنتاج بالدفتر رابط لها؛ B7 repo: setItemCostPrice وloadItem
//    ومصدر الدفعة بشكليه وسعر الكلفة بقارئ المشتريات، وlast_production إلزامياً (كائن أو null).
// ومن مراجعة المعمل v2: B8 (ع٢، #20) بطاقة العلف المنتج: «صُنعت في المعمل — آخر دفعة …» فوق التبويبات برابطها، وفراغ المشتريات
//    «تُصنع في المعمل»، ولا «اشترِ كمية» لعلف يُصنع في مخزن العلف ولم يُشترَ؛ B9 (ع٤) حفظ سعر في بطاقة لا يمسح تعديلاً جارياً في
//    الأخرى، والسعر المحفوظ من جواب الخادم شرطاً للتعديل التالي؛ B10 (ع٣، #21) صفحة «المواد» بتدفّق نافذة «مادّة جديدة»: التوأم
//    الفعّال «سجّل شراءً جديداً» أوّلاً، والنوع بأمثلة، والتصنيف قسم لا اسم مادّة.
// «المخزن ببساطة» (كلمة المالك 2026-11-06): كلّ «اشترِ» صار «سجّل شراء» إلى ملفّ المادّة ونافذة شرائها الفوري (buyPath:
//    ‎/inventory/items/<المادّة>?buy=1)، لمن يسجّل الشراء (purchase.record: والمحاسب منهم)؛ وبطاقة المادّة القديمة صارت «دفتر المادّة
//    والوجبات» على ‎/details بلا زرّ شراء. فـB1 وB3 وB10 تحرس الرابط الجديد، وB2-follow أنّ النقر يفتح النافذة في الملفّ، وB2 باقٍ
//    على صفحة الاستلام نفسها (مسارها باقٍ للمدير بالرابط)، وB6 وB8 وB9 على ‎/details.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const INVENTORY = [
  'loadOrgSetup', 'loadStoresOverview', 'loadStockOnHand', 'loadStockValues', 'loadStockValueTotals', 'loadItemPurchases', 'loadItemLots',
  'loadItemLotValues', 'loadItemMoves', 'listItemUnits', 'listItems', 'listStockDocs', 'createItem', 'createItemUnit', 'findItemTwins',
  'setItemSellPrice', 'setItemCostPrice', 'loadItem',
];
const PURCHASING = ['loadReceipt', 'loadReceiptOrigin', 'listReceipts', 'createReceiptDraft', 'addReceiptLine', 'updateReceiptLine', 'setLineTotal', 'searchSuppliers', 'supplierTwins', 'createSupplier', 'listBoxes'];
const PURCHASES = ['loadItemsOverview', 'loadItemFile', 'recordPurchase'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__buy.call('${n}', a);`).join(' ')}`;
const STUBS = {
  inventory: routed('inventory', INVENTORY),
  purchasing: routed('purchasing', PURCHASING),
  purchases: routed('purchases', PURCHASES),
  counts: `export * from ${real('counts')}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  session: 'export const useSession = () => globalThis.__buy.session; export const sessionStore = { get: () => globalThis.__buy?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__buy.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'buy-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchasing|purchases|counts)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'buy-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'buy-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

// repo بلا شبكة: core بديل يسجّل نداء الدالّة وطلب الجدول، والملف الحقيقي (inventory.ts) يبني الطلب ويقرأ الجواب.
const CORE = `export const call = (fn, args) => globalThis.__repo.rpc(fn, args);
export const send = async (make, answers) => ({ result: await make(globalThis.__repo.db), wasOnline: true });
export const classifyPostgrest = (error) => error;
export const explained = async (error) => error;
export const updatedRows = (answer) => answer.data;
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'core-stub',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'core-stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'core-stub' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundleOf(entry, plugins) {
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
    plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const text = () => body().textContent;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};
const click = async (node, init = {}) => {
  fire(node, 'click', init);
  await settle();
};
/** قيمة قائمة اختيار كما رسمها React (الخيار المختار؛ DOM الفحص بلا value للقائمة). */
const picked = (select) => (select ? (select.value ?? select.options.find((option) => option.selected)?.getAttribute('value')) : undefined);
/** نقرة رابط كما يعالجها react-router (الزرّ الأيسر). */
const follow = (node) => click(node, { button: 0 });

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundleOf(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
        "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
        "export { searchable } from './src/domain/normalize.ts';",
        "export { NetworkError, RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
        "export { buyPath } from './src/pages/inventory/stock-shared.tsx';",
        "export { categoryNamedLikeItem, notListedHere, activeTwins } from './src/pages/inventory/ItemCreate.tsx';",
        "export { receivingStores } from './src/pages/inventory/ReceiptsPage.tsx';",
        "export { buyableIn } from './src/pages/inventory/WarehousePage.tsx';",
        // صفحة «المواد» (ع٣) والدوالّ الجديدة من مساحة الاسم: غيابها في الشفرة القديمة يُفشل فحوصها ولا يوقف الحزم.
        "export * as itemsPage from './src/pages/inventory/ItemsPage.tsx';",
        "export * as itemCard from './src/pages/inventory/ItemCardPage.tsx';",
      ].join('\n'),
      [stubs],
    );

    const ws = (role, over = {}) => ({
      userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [],
      divisions: ['feed_mill', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: role === 'accountant', canSeeSales: false,
      invites: [], subscription: 'active', confirmedAt: 1, ...over,
    });
    const keeper = ws('storekeeper', { scopes: [{ warehouseId: 'w-raw' }] });

    const org = {
      divisions: [
        { id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true },
        { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
      ],
      sites: [], packTypes: [], expenseCategories: [],
      itemCategories: [
        { id: 'c-food', version: 1, archived: false, name: 'الغذاء' },
        { id: 'c-corn', version: 1, archived: false, name: 'ذرة' },
      ],
      warehouses: [
        { id: 'w-raw', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', kind: 'raw', hasBalance: false },
        { id: 'w-feed', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن العلف', kind: 'feed', hasBalance: false },
        { id: 'w-gen', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-gen', name: 'المخزن العامّ', kind: 'general', hasBalance: false },
      ],
    };
    const card = (over) => ({
      id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw', siteId: 's-mill', siteName: 'المعمل', siteKind: 'mill', divisionId: 'd-mill', divisionKind: 'feed_mill',
      itemsCount: 2, belowMinimum: 0, nearExpiry: 0, expired: 0, stockValue: 0n, saleValue: 0n, expectedProfit: 0n, itemsUnpriced: 0, ...over,
    });
    const overview = (over = {}) => ({
      today: '2026-11-04', canManage: true, canCreateItem: true,
      rows: [card({}), card({ id: 'w-feed', name: 'مخزن العلف', kind: 'feed' }), card({ id: 'w-gen', name: 'المخزن العامّ', kind: 'general', siteId: 's-gen', siteName: 'المخزن', siteKind: 'store', divisionId: 'd-gen', divisionKind: 'general' })],
      sites: [], ...over,
    });
    const stockRow = (itemId, name, kind, over = {}) => ({
      itemId, name, kind, baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, categoryId: 'c-food', categoryName: 'الغذاء', barcode: null,
      available: 500_000n, expired: 0n, nearExpiry: 0n, belowMin: false, chickAgeHours: null, oldChicks: 0n, money: null, ...over,
    });
    const board = (warehouse, rows) => ({ warehouse: { divisionId: 'd-mill', divisionKind: 'feed_mill', archived: false, hasBalance: false, ...warehouse }, asOf: '2026-11-04T08:00:00Z', rows, next: null, total: rows.length, money: null });
    const rawBoard = board({ id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw' }, [
      stockRow('i-corn', 'ذرة صفراء', 'raw'),
      stockRow('i-salt', 'ملح', 'additive'),
      // وقود يُحفظ في مخزن المواد الأوّلية (ADMISSIBLE) ولا يُستلم فيه من المورّد (receiving_kinds): لا زرّ شراء هنا.
      stockRow('i-gas', 'كاز', 'fuel', { categoryId: null, categoryName: null }),
    ]);
    const item = (id, name, kind, over = {}) => ({ id, version: 1, archived: false, name, nameNorm: m.searchable(name), categoryId: null, kind, baseUnit: 'kg', density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [], ...over });
    const corn = item('i-corn', 'ذرة صفراء', 'raw');
    const doc = (over = {}) => ({ id: 'r-new', status: 'draft', version: 1, docNo: null, partyId: 'p-1', partyName: 'مورّد الحبوب', warehouseId: 'w-raw', bookId: 'b-mill', onDate: '2026-11-04', note: null, posted: false, voidReason: null, createdAt: '2026-11-04T08:00:00Z', copiedFrom: null, ...over });
    const purchases = (itemOver = {}) => ({
      item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: 600_00n, costPrice: 450_00n, ...itemOver },
      warehouse: null, today: '2026-11-04', next: null, total: 1,
      rows: [{
        lotId: 'l-1', receivedOn: '2026-10-28', docId: 'r-1', docNo: 'PU-2026-0003', partyId: 'p-1', partyName: 'مورّد الحبوب', warehouseId: 'w-raw', warehouseName: 'مخزن المواد الأوّلية',
        lineId: 'rl-1', qtyIn: 500_000n, qtyLeft: 300_000n, qtyInUnit: 500_000n, unitLabel: 'كغم', unitCode: null, factor: 1_000_000n, baseUnit: 'kg', supplierLotNo: null, expiryOn: null,
        money: { invoiceTotal: 250_000_00n, landedValue: 250_000_00n, unitCost: 500_00n, corrected: false },
      }],
    });

    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__buy = {
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
      };
      return calls;
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    const handlers = (over = {}) => ({
      loadOrgSetup: () => org,
      loadStoresOverview: () => overview(),
      loadStockOnHand: () => rawBoard,
      loadItemPurchases: () => purchases(),
      loadItem: (id) => (id === 'i-corn' ? corn : null),
      listItemUnits: () => [],
      listItems: () => ({ rows: [], total: 0, next: null }),
      listReceipts: () => ({ rows: [], next: null, total: 0 }),
      searchSuppliers: () => ({ parties: [{ id: 'p-1', name: 'مورّد الحبوب' }], total: 1 }),
      listBoxes: () => [],
      ...over,
    });

    let root = null;
    let where = null;
    function Probe() {
      where = m.useLocation();
      return null;
    }
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      // صفحة «المواد» بمسارها الثابت يغلب مسار المخزون، كما في App.tsx.
      m.flushSync(() =>
        root.render(
          m.h(
            m.MemoryRouter,
            { initialEntries: [url] },
            m.h(Probe),
            m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/items', element: m.h(m.itemsPage.default) }), m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) })),
          ),
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
    // كل حالة لحالها: رمية بحالة (زرّ غير موجود في الشفرة القديمة) تُحسب فشلها ولا توقف ما بعدها.
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error?.stack ?? error}`);
        await unmount();
      }
    };
    const hrefs = (action) => byAction(action).map((n) => n.getAttribute('href'));
    const dialogForm = () => all().find((n) => n.nodeName === 'FORM' && n.id.endsWith('-form'));

    // ── B1: «سجّل شراء» على صفوف المخزن، لمن يسجّل الشراء وللمادّة التي يستلمها المخزن ─────────────────────────────────
    await step('B1', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers());
      await mount('/inventory/store/w-raw');
      const links = hrefs('buy-item');
      // ومعه طريق الرجوع إلى هذا المخزن (زرّ «رجوع إلى المخزن» في الملفّ، كلمة المالك 2026-11-08).
      const corn = '/inventory/items/i-corn?buy=1&back=%2Finventory%2Fstore%2Fw-raw';
      const salt = '/inventory/items/i-salt?buy=1&back=%2Finventory%2Fstore%2Fw-raw';
      t.same(links.filter((href) => href === corn).length, 2, `B1: «سجّل شراء» للذرة بالهاتف وبجدول الحاسوب برابط ملفّها ونافذة الشراء (${JSON.stringify(links)})`);
      t.same(links.filter((href) => href === salt).length, 2, 'B1: وللإضافة (يستلمها مخزن المواد الأوّلية)');
      t.ok(!links.some((href) => href?.includes('i-gas')), 'B1: ولا زرّ لوقود لا يُستلم من المورّد في هذا المخزن');
      t.ok(!links.some((href) => href?.includes('/inventory/receipts')), 'B1: ولا رابط لورقة استلام مسوّدة');
      t.ok(text().includes('سجّل شراء') && !text().includes('اشترِ كمية'), 'B1: واسم الزرّ «سجّل شراء»');
      await unmount();
    });
    await step('B1-roles', async () => {
      fresh({ status: 'ready', workspace: ws('accountant') }, handlers({ loadStoresOverview: () => overview({ canManage: false, canCreateItem: false }) }));
      await mount('/inventory/store/w-raw');
      t.ok(text().includes('ذرة صفراء'), 'B1: ضابط: المحاسب يرى المواد');
      t.eq(byAction('buy-item').length, 4, 'B1: والمحاسب (purchase.record) يسجّل الشراء');
      await unmount();
      fresh({ status: 'ready', workspace: keeper }, handlers({ loadStoresOverview: () => overview({ canManage: false }) }));
      await mount('/inventory/store/w-raw');
      t.eq(byAction('buy-item').length, 4, 'B1: والأمين (purchase.record) يراه');
      await unmount();
      fresh({ status: 'ready', workspace: ws('viewer') }, handlers({ loadStoresOverview: () => overview({ canManage: false, canCreateItem: false }) }));
      await mount('/inventory/store/w-raw');
      t.ok(text().includes('ذرة صفراء') && byAction('buy-item').length === 0, 'B1: والمشاهد (بلا purchase.record) بلا «سجّل شراء»');
      await unmount();
    });
    await step('B1-archived', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadStockOnHand: () => ({ ...rawBoard, warehouse: { ...rawBoard.warehouse, archived: true } }) }));
      await mount('/inventory/store/w-raw');
      t.eq(byAction('buy-item').length, 0, 'B1: مخزن مؤرشف لا يُشترى إليه');
      await unmount();
    });

    // ── B1ب: «دفتر المادّة والوجبات» (البطاقة القديمة على ‎/details) بلا زرّ شراء: الشراء من ملفّ المادّة وحده ────────────────
    await step('B1-card', async () => {
      for (const who of [ws('manager'), keeper, ws('accountant')]) {
        fresh({ status: 'ready', workspace: who }, handlers());
        await mount('/inventory/items/i-corn/details?wh=w-raw');
        t.ok(text().includes('دفتر المادّة والوجبات') && byAction('buy-item').length === 0, `B1: ${who.role}: البطاقة القديمة بلا «اشترِ كمية» ولا «سجّل شراء»`);
        t.same(hrefs('back-to-file'), ['/inventory/items/i-corn'], `B1: ${who.role}: ورابطها يرجع إلى ملفّ المادّة`);
        await unmount();
      }
    });

    // ── B2: الرابط يفتح «استلام جديد» معبّأً، والمسوّدة بمعرّف الجهاز، ثم الورقة وسطرها بالمادّة ─────────────────────────
    await step('B2', async () => {
      let draftTries = 0;
      let lineTries = 0;
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({
        createReceiptDraft: () => {
          draftTries += 1;
          // المحاولة الأولى وصلت وضاع جوابها؛ الإعادة بالمعرّف نفسه 23505 = انكتبت فتنفتح.
          if (draftTries === 1) throw new m.UnknownOutcomeError();
          throw new m.RejectedError('23505', null);
        },
        loadReceipt: (id) => ({ doc: doc({ id }), lines: [], lineAmounts: [], amounts: null, charges: [] }),
        addReceiptLine: () => {
          lineTries += 1;
          if (lineTries === 1) throw new m.UnknownOutcomeError();
          throw new m.RejectedError('23505', null);
        },
        updateReceiptLine: () => ({}),
      }));
      await mount('/inventory/receipts?new=1&wh=w-raw&item=i-corn');
      t.same(named(calls, 'loadItem'), [['i-corn']], 'B2: صفحة الاستلام تقرأ المادّة من الرابط');
      const store = byAction('pick-store')[0];
      t.eq(picked(store), 'w-raw', 'B2: والمخزن معبّأ من الرابط');
      t.same((store?.options ?? []).map((o) => o.getAttribute('value')).filter(Boolean), ['w-raw'], 'B2: والمخازن محصورة بما يستلم المادّة (لا مخزن العلف ولا العامّ)');
      t.ok(text().includes('تنفتح الورقة وسطرها بـ«ذرة صفراء»'), `B2: والنموذج يقول بأيّ مادّة تنفتح الورقة (${text().slice(0, 300)})`);
      await click(byAction('pick-party')[0]);
      fire(byAction('create-receipt')[0].parentNode, 'submit');
      await settle();
      t.ok(text().includes('نتيجة العملية غير معروفة') && where.pathname === '/inventory/receipts', `B2: الجواب الضائع يبقى على النموذج ويقول ذلك (${where.pathname})`);
      fire(byAction('create-receipt')[0].parentNode, 'submit');
      await settle();
      await settle();
      const drafts = named(calls, 'createReceiptDraft');
      t.eq(drafts.length, 2, 'B2: محاولتان');
      t.eq(drafts[0]?.[0], drafts[1]?.[0], 'B2: بالمعرّف نفسه الذي وُلد بالجهاز (لا ورقتان)');
      t.same(drafts[0]?.slice(1, 3), ['w-raw', 'p-1'], 'B2: وبالمخزن والمورّد');
      t.same([where.pathname, where.search], [`/inventory/receipts/${drafts[0]?.[0]}`, '?item=i-corn'], 'B2: و23505 يفتح الورقة نفسها ومعها المادّة');
      t.ok(byAction('change-item').length === 1 && text().includes('ذرة صفراء'), `B2: والسطر ينفتح والمادّة مختارة (${text().slice(-400)})`);
      t.eq(byIdSuffix('-qty').length, 1, 'B2: وحقل كميتها جاهز');
      type(byIdSuffix('-qty')[0], '1000');
      await settle();
      fire(byAction('add-receipt-line')[0].parentNode, 'submit');
      await settle();
      fire(byAction('add-receipt-line')[0].parentNode, 'submit');
      await settle();
      const lines = named(calls, 'addReceiptLine');
      t.eq(lines.length, 2, 'B2: سطر بمحاولتين');
      t.eq(lines[0]?.[1], lines[1]?.[1], 'B2: بمعرّف السطر نفسه بعد الجواب الضائع');
      t.same([lines[0]?.[0], lines[0]?.[2]?.item_id, lines[0]?.[2]?.qty_in_unit], [drafts[0]?.[0], 'i-corn', '1000.000'], 'B2: على الورقة الجديدة بالمادّة والكمية');
      t.same(named(calls, 'updateReceiptLine').map((args) => args[0]), [lines[0]?.[1]], 'B2: و23505 يكتب فوق السطر نفسه (لا سطر ثانٍ)');
      t.eq(where.search, '', 'B2: والعلامة ?item= تُشال من الرابط بعد الإضافة فلا تعود بإعادة التحميل');
      await unmount();
    });
    await step('B2-stores', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers());
      await mount('/inventory/receipts?new=1&wh=w-gen&item=i-corn');
      t.eq(picked(byAction('pick-store')[0]), 'w-raw', 'B2: مخزن بالرابط لا يستلم المادّة لا يُملأ، والمخزن الوحيد الذي يستلمها يُختار');
      await unmount();
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItem: () => item('i-egg', 'بيض مائدة', 'table_egg', { baseUnit: 'pc' }) }));
      await mount('/inventory/receipts?new=1&item=i-egg');
      t.ok(text().includes('لا مخزن في نطاقك يستلم «بيض مائدة»'), `B2: ومادّة لا يستلمها مخزن تقول ذلك (${text().slice(0, 300)})`);
      await unmount();
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItem: () => ({ ...corn, archived: true }) }));
      await mount('/inventory/receipts?new=1&wh=w-raw&item=i-corn');
      t.ok(text().includes('«ذرة صفراء» مؤرشفة'), 'B2: ومادّة مؤرشفة لا تُستلم وتُقال');
      t.ok(!text().includes('تنفتح الورقة وسطرها'), 'B2: ولا يُعد النموذج بسطرها');
      await unmount();
    });
    await step('B2-failed', async () => {
      // قراءة المادّة فشلت بصفحة القائمة: تنبيه ونموذج عادي يبقى (بلا «أعد المحاولة» تطوي النموذج ومعرّف مسوّدته)، والمادّة تُحمل
      // إلى الورقة فتُجرَّب هناك مرّة؛ وإن فشلت هناك أيضاً فتنبيه، ونموذج السطر بالبحث باقٍ.
      let reads = 0;
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({
        loadItem: () => {
          reads += 1;
          if (reads === 1) throw new m.NetworkError();
          return corn;
        },
        createReceiptDraft: (id, warehouseId, partyId) => doc({ id, warehouseId, partyId }),
        loadReceipt: (id) => ({ doc: doc({ id }), lines: [], lineAmounts: [], amounts: null, charges: [] }),
      }));
      await mount('/inventory/receipts?new=1&wh=w-raw&item=i-corn');
      t.ok(text().includes('تعذّر تحميل المادّة المطلوب شراؤها') && byAction('retry').length === 0, `B2: فشل قراءة المادّة تنبيه بلا «أعد المحاولة» (${text().slice(0, 300)})`);
      t.eq(picked(byAction('pick-store')[0]), 'w-raw', 'B2: والنموذج يظهر والمخزن من الرابط معبّأ');
      await click(byAction('pick-party')[0]);
      fire(byAction('create-receipt')[0].parentNode, 'submit');
      await settle();
      await settle();
      const id = named(calls, 'createReceiptDraft')[0]?.[0];
      t.same([where.pathname, where.search], [`/inventory/receipts/${id}`, '?item=i-corn'], 'B2: والمادّة تُحمل إلى الورقة الجديدة');
      t.ok(byAction('change-item').length === 1 && text().includes('ذرة صفراء'), 'B2: وقراءتها هناك تفتح السطر بها');
      await unmount();
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({
        loadItem: () => { throw new m.NetworkError(); },
        loadReceipt: (id) => ({ doc: doc({ id }), lines: [], lineAmounts: [], amounts: null, charges: [] }),
      }));
      await mount('/inventory/receipts/r-1?item=i-corn');
      t.ok(text().includes('تعذّر تحميل المادّة المطلوب شراؤها؛ اخترها بالبحث في السطر.') && byAction('retry').length === 0, 'B2: وفشلها بالورقة تنبيه بلا إعادة');
      t.eq(byAction('search-item').length, 1, 'B2: ونموذج السطر بالبحث باقٍ');
      await unmount();
    });
    await step('B2-follow', async () => {
      // من صفّ المخزن إلى ملفّ المادّة ونافذة شرائها بنقرة واحدة (لا ورقة استلام).
      const file = {
        today: '2026-11-04', canRecord: true, canEdit: true,
        item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', density: null, archived: false, tracksExpiry: false, version: 1 },
        // حقول 0020 (الأفعال وأين المادّة) بقيمها لمادّة جديدة بلا موجود.
        canDelete: true, uses: [], canConvert: false, canTransfer: false, canSell: false, canPrice: false, unpricedCount: 0, stores: [], transferTargets: [],
        onHand: 0n, purchased: 0n, purchasesCount: 0, money: { purchasedValue: 0n, avgUnitPrice: null, sellPrice: null, lastUnitPrice: null }, purchases: [], more: false, cashAccounts: [],
      };
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItemFile: () => file }));
      await mount('/inventory/store/w-raw');
      await follow(byAction('buy-item').find((n) => n.getAttribute('href')?.includes('i-corn')));
      await settle();
      await settle();
      t.same([where.pathname, where.search], ['/inventory/items/i-corn', '?buy=1&back=%2Finventory%2Fstore%2Fw-raw'], 'B2: النقر ينقل لملفّ المادّة بعلامة الشراء وطريق الرجوع إلى المخزن');
      t.same(named(calls, 'loadItemFile'), [['i-corn']], 'B2: والملفّ يُقرأ');
      t.ok(text().includes('سجّل شراء «ذرة صفراء»') && byAction('save-purchase').length === 1, `B2: ونافذة «سجّل شراء» مفتوحة (${text().slice(0, 300)})`);
      t.same(named(calls, 'createReceiptDraft'), [], 'B2: ولا ورقة استلام مسوّدة');
      await unmount();
    });

    // ── B3: التوأم بالاسم نفسه ← «سجّل شراءً جديداً» ──────────────────────────────────────────────────────────────
    const twin = { id: 'i-old', name: 'ذرة صفراء', archived: false, sameName: true, codes: [] };
    const newItem = (fields) => item('i-new', fields.name, fields.kind, { categoryId: fields.category_id });
    await step('B3', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ findItemTwins: () => [twin], createItem: newItem }));
      await mount('/inventory/store/w-raw');
      await click(byAction('add-item')[0]);
      type(byIdSuffix('-name')[0], 'ذرة صفراء');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.same(named(calls, 'createItem'), [], 'B3: التوأم يوقف الحفظ أوّلاً');
      const buy = byAction('buy-item').filter((n) => n.textContent.includes('سجّل شراءً جديداً'));
      t.eq(buy.length, 1, `B3: الفعل الأوّل «سجّل شراءً جديداً لـ«ذرة صفراء»» (${text().slice(-500)})`);
      t.eq(buy[0]?.getAttribute('href'), '/inventory/items/i-old?buy=1', 'B3: برابط ملفّ المادّة الموجودة ونافذة شرائها');
      t.ok(text().includes('المادّة تُضاف مرّة واحدة، وكلّ شراء جديد (بكميته وسعره) يُسجَّل في ملفّها'), 'B3: والجملة تشرح');
      t.ok(byAction('save-new-item-twin')[0]?.textContent.includes('احفظ مادّة أخرى بالاسم نفسه'), 'B3: و«احفظ مادّة أخرى بالاسم نفسه» ثانياً');
      await follow(buy[0]);
      await settle();
      t.same([where.pathname, where.search], ['/inventory/items/i-old', '?buy=1'], 'B3: والنقر يفتح ملفّ المادّة الموجودة ونافذة شرائها');
      t.same(named(calls, 'createItem'), [], 'B3: ولا مادّة ثانية كُتبت');
      await unmount();
    });
    await step('B3-other', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ findItemTwins: () => [twin], createItem: newItem }));
      await mount('/inventory/store/w-raw');
      await click(byAction('add-item')[0]);
      type(byIdSuffix('-name')[0], 'ذرة صفراء');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.eq(named(calls, 'createItem').length, 1, 'B3: «احفظ مادّة أخرى بالاسم نفسه» يكتبها إن أصرّ');
      await unmount();
    });
    await step('B3-archived', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ findItemTwins: () => [{ ...twin, name: 'ذراء', archived: true }] }));
      await mount('/inventory/store/w-raw');
      await click(byAction('add-item')[0]);
      type(byIdSuffix('-name')[0], 'ذراء');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.ok(text().includes('احفظ رغم التشابه') && !byAction('buy-item').some((n) => n.textContent.includes('سجّل شراءً')), 'B3: توأم مؤرشف وحده: لا شراء له (لا يُستلم)، والتنبيه كما كان');
      await unmount();
    });
    await step('B3-receipt', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({
        loadReceipt: () => ({ doc: doc({ id: 'r-1' }), lines: [], lineAmounts: [], amounts: null, charges: [] }),
        findItemTwins: () => [twin],
        loadItem: (id) => (id === 'i-old' ? item('i-old', 'ذرة صفراء', 'raw') : null),
        createItem: newItem,
      }));
      await mount('/inventory/receipts/r-1');
      type(byAction('search-item')[0], 'ذرة');
      await settle();
      await click(byAction('new-item')[0]);
      fire(dialogForm(), 'submit');
      await settle();
      const use = byAction('use-twin');
      t.ok(use.length === 1 && use[0].textContent.includes('استعمل «ذرة صفراء» في هذه الورقة'), `B3: داخل ورقة الاستلام الفعل الأوّل «استعمل» المادّة الموجودة (${text().slice(-300)})`);
      await click(use[0]);
      await settle();
      t.same(named(calls, 'loadItem').at(-1), ['i-old'], 'B3: تُقرأ المادّة الموجودة');
      t.ok(byAction('change-item').length === 1 && named(calls, 'createItem').length === 0, 'B3: وتصير مختارة بالسطر، ولا مادّة ثانية');
      await unmount();
    });

    // ── B4: النوع بأمثلة، وتنبيه مخزن العلف، ونوع لا يظهر في المخزن ──────────────────────────────────────────────
    await step('B4', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers());
      await mount('/inventory/store/w-raw');
      await click(byAction('add-item')[0]);
      const options = (byAction('pick-kind')[0]?.options ?? []).map((o) => o.textContent);
      t.ok(options.includes('مادّة أوّلية للعلف: ذرة، صويا، نخالة…'), `B4: «مادّة أوّلية» بأمثلتها (${options.join(' | ')})`);
      t.ok(options.some((o) => o.startsWith('علف جاهز: ناتج المعمل')), 'B4: و«علف» هو العلف الجاهز من المعمل');
      t.ok(options.some((o) => o.startsWith('إضافة للعلف:')), 'B4: والإضافات بأمثلتها');
      t.eq(picked(byAction('pick-kind')[0]), 'raw', 'B4: ضابط: النوع المقترح في مخزن المواد الأوّلية «مادّة أوّلية»');
      t.ok(!text().includes('لن تظهر في'), 'B4: ونوع يستلمه المخزن بلا تنبيه');
      await unmount();
    });
    await step('B4-feed', async () => {
      const feedBoard = board({ id: 'w-feed', name: 'مخزن العلف', kind: 'feed' }, [stockRow('i-feed', 'علف بياض', 'feed')]);
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadStockOnHand: () => feedBoard }));
      await mount('/inventory/store/w-feed');
      t.ok(text().includes('هذا مخزن العلف الجاهز من المعمل؛ الذرة والصويا وبقيّة المواد الأوّلية مكانها «مخزن المواد الأوّلية».'), `B4: تنبيه مخزن العلف (${text().slice(0, 300)})`);
      t.same(hrefs('open-raw-store'), ['/inventory/store/w-raw'], 'B4: برابط مخزن المواد الأوّلية');
      await click(byAction('add-item')[0]);
      t.eq(picked(byAction('pick-kind')[0]), 'feed', 'B4: ضابط: النوع المقترح في مخزن العلف «علف»');
      choose(byAction('pick-kind')[0], 'raw');
      await settle();
      t.ok(text().includes('لن تظهر في «مخزن العلف» قبل أن يدخلها رصيد: «مادّة أوّلية» مكانها مخزن «موادّ أوّلية».'), `B4: واختيار «مادّة أوّلية» في مخزن العلف ينبّه قبل الحفظ (${text().slice(-500)})`);
      await unmount();
      fresh({ status: 'ready', workspace: ws('manager') }, handlers());
      await mount('/inventory/store/w-raw');
      t.ok(!text().includes('هذا مخزن العلف الجاهز'), 'B4: ومخزن غير العلف بلا تنبيهه');
      await unmount();
    });

    // ── B5: التصنيف قسم لا اسم مادّة ───────────────────────────────────────────────────────────────────────────
    await step('B5', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers());
      await mount('/inventory/store/w-raw');
      await click(byAction('add-item')[0]);
      t.ok(text().includes('التصنيف قسم يجمع موادّ متشابهة، مثل «الغذاء» أو «الإضافات».'), 'B5: تلميح التصنيف');
      type(byIdSuffix('-name')[0], 'ذرة');
      await settle();
      choose(byAction('pick-category')[0], 'c-corn');
      await settle();
      t.ok(text().includes('اسم التصنيف مثل اسم المادّة'), `B5: تصنيف «ذرة» لمادّة «ذرة» يحذّر (${text().slice(-400)})`);
      choose(byAction('pick-category')[0], 'c-food');
      await settle();
      t.ok(!text().includes('اسم التصنيف مثل اسم المادّة'), 'B5: و«الغذاء» بلا تحذير');
      await unmount();
    });

    // ── B6: سعر الكلفة ببطاقة المادّة، والدفعة المنتجة ومصدرها ───────────────────────────────────────────────────
    await step('B6', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ setItemCostPrice: (_id, price) => price }));
      await mount('/inventory/items/i-corn/details');
      const page = text();
      t.ok(page.includes('سعر الكلفة') && page.includes('سعر الكلفة الآن') && page.includes('450.00'), `B6: سعر الكلفة المكتوب بجانب سعر البيع (${page.slice(0, 400)})`);
      t.ok(page.includes('سعر الشراء (آخر شراء، تلقائياً)') && page.includes('500.00'), 'B6: وسعر الشراء تلقائياً من آخر شراء');
      t.ok(page.includes('سعر البيع الآن') && page.includes('600.00'), 'B6: ضابط: سعر البيع باقٍ');
      await click(byAction('edit-cost-price')[0]);
      type(byIdSuffix('-cost')[0], '475.5');
      await settle();
      await click(byAction('save-cost-price')[0]);
      t.same(named(calls, 'setItemCostPrice'), [['i-corn', 475_50n, 450_00n]], 'B6: والحفظ بدالّته بالفلس ومشروط بالسعر الذي شافته الشاشة');
      t.same(named(calls, 'setItemSellPrice'), [], 'B6: ولا يمسّ سعر البيع');
      await unmount();
    });
    await step('B6-roles', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItemPurchases: () => purchases({ costPrice: null }) }));
      await mount('/inventory/items/i-corn/details');
      t.ok(text().includes('لم يُكتب سعر كلفة لهذه المادّة') && byAction('edit-cost-price')[0]?.textContent === 'اكتب سعر الكلفة', 'B6: بلا سعر كلفة يقول ذلك ومعه زرّ كتابته');
      await unmount();
      fresh({ status: 'ready', workspace: ws('accountant') }, handlers());
      await mount('/inventory/items/i-corn/details');
      t.ok(text().includes('سعر الكلفة الآن') && byAction('edit-cost-price').length === 0, 'B6: المحاسب يراه ولا يكتبه (صلاحية سعر البيع نفسها)');
      await unmount();
      fresh({ status: 'ready', workspace: keeper }, handlers({ loadItemPurchases: () => purchases({ sellPrice: null, costPrice: null }) }));
      await mount('/inventory/items/i-corn/details');
      t.ok(!text().includes('سعر الكلفة'), 'B6: ودور بلا كلفة لا يرى بطاقة سعر الكلفة');
      await unmount();
    });
    await step('B6-lots', async () => {
      const lot = (over) => ({ lotId: 'l-1', qtyLeft: 1_000_000n, receivedOn: '2026-11-04', rootReceivedOn: '2026-11-04', ageDays: 0, bornAt: null, ageHours: null, expiryOn: null, expired: false, nearExpiry: false, sourceKind: 'receipt', sourceId: 'r-1', source: 'PU-2026-0003', supplierLotNo: null, ...over });
      const lots = {
        item: { id: 'i-feed', name: 'علف بياض', kind: 'feed', baseUnit: 'kg', tracksExpiry: false, minQty: null, density: null, pieceMassKg: null, archived: false },
        rows: [lot({ lotId: 'l-p', sourceKind: 'production', sourceId: 'pb-1', source: 'PD-2026-0003' }), lot({})],
        next: null, total: 2,
      };
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItemLots: () => lots, loadItemLotValues: () => new Map(), loadItem: () => item('i-feed', 'علف بياض', 'feed') }));
      await mount('/inventory/items/i-feed/details?wh=w-feed&tab=lots');
      const made = byAction('open-production');
      t.ok(made.length === 1 && made[0].textContent === 'صُنعت بدفعة PD-2026-0003', `B6: الدفعة المنتجة «صُنعت بدفعة PD-…» (${text().slice(0, 400)})`);
      t.eq(made[0]?.getAttribute('href'), '/mill/batch/pb-1', 'B6: برابط صفحة الدفعة في المعمل');
      t.ok(text().includes('PU-2026-0003'), 'B6: ضابط: دفعة الشراء برقم استلامها');
      await unmount();
      const moves = {
        rows: [{ moveId: 'mv-1', seq: 1n, movedOn: '2026-11-04', docKind: 'production', docId: 'pb-1', doc: 'PD-2026-0003', memo: 'إنتاج', qty: 1_000_000n, running: 1_000_000n, lotId: 'l-p', reversesMoveId: null, reversed: false, money: null }],
        next: null, total: 1,
      };
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItemLots: () => lots, loadItemLotValues: () => new Map(), loadItemMoves: () => moves, loadItem: () => item('i-feed', 'علف بياض', 'feed') }));
      await mount('/inventory/items/i-feed/details?wh=w-feed&tab=moves');
      t.same(all().filter((n) => n.getAttribute('data-action') === 'open-move-doc').map((n) => n.getAttribute('href')), ['/mill/batch/pb-1'], 'B6: وحركة الإنتاج بالدفتر رابط لصفحة الدفعة');
      await unmount();
    });

    // ── B8 (ع٢، الملاحظة #20): بطاقة العلف المنتج تعرف أنّه يُصنع في المعمل ────────────────────────────────────────
    const made = { batchId: 'pb-1', docNo: 'PD-2026-0001', producedOn: '2026-11-03', qtyKg: 2_000_000n, warehouseName: 'مخزن العلف' };
    const feed = item('f-1', 'علف بياض', 'feed');
    const feedBuys = (over = {}) => ({ ...purchases({ id: 'f-1', name: 'علف بياض', kind: 'feed', sellPrice: null, costPrice: null }), rows: [], total: 0, lastProduction: made, ...over });
    const MADE_LINE = 'صُنعت في المعمل — آخر دفعة PD-2026-0001 بتاريخ 03/11/2026، 2.000 طن';
    await step('B8', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItem: () => feed, loadItemPurchases: () => feedBuys() }));
      await mount('/inventory/items/f-1/details?wh=w-feed');
      const open = byAction('open-last-production');
      t.ok(text().includes(MADE_LINE), `B8: سطر «صُنعت في المعمل» برقم آخر دفعة وتاريخها وكميتها (${text().slice(0, 500)})`);
      t.same(open.map((n) => n.getAttribute('href')), ['/mill/batch/pb-1'], 'B8: ورقم الدفعة رابط لصفحتها في المعمل');
      t.ok(text().indexOf(MADE_LINE) >= 0 && text().indexOf(MADE_LINE) < text().indexOf('الوجبات المتبقّية'), 'B8: والسطر فوق التبويبات');
      t.ok(text().includes('لا شراء لهذه المادّة: تُصنع في المعمل.') && !text().includes('لا شراء لهذه المادّة بعد.'), 'B8: ونصّ فراغ المشتريات يدلّ على الإنتاج');
      t.eq(byAction('buy-item').length, 0, 'B8: ولا «اشترِ كمية» هنا (الشراء من ملفّ المادّة وحده)');
      await unmount();
    });
    await step('B8-tabs', async () => {
      const lots = { item: { id: 'f-1', name: 'علف بياض', kind: 'feed', baseUnit: 'kg', tracksExpiry: false, minQty: null, density: null, pieceMassKg: null, archived: false }, rows: [], next: null, total: 0 };
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItem: () => feed, loadItemPurchases: () => feedBuys(), loadItemLots: () => lots, loadItemLotValues: () => new Map() }));
      await mount('/inventory/items/f-1/details?wh=w-feed&tab=lots');
      t.ok(text().includes(MADE_LINE), 'B8: والسطر في تبويب الوجبات أيضاً (فوق التبويبات لا داخل المشتريات)');
      t.same(named(calls, 'loadItemPurchases').at(-1), ['f-1', 'w-feed'], 'B8: من سجلّ شراء المادّة بالمخزن المختار');
      await unmount();
    });
    await step('B8-controls', async () => {
      // علف له شراء وله إنتاج: السطر يبقى، والشراء ممكن.
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItem: () => feed, loadItemPurchases: () => ({ ...purchases({ id: 'f-1', name: 'علف بياض', kind: 'feed' }), lastProduction: made }) }));
      await mount('/inventory/items/f-1/details?wh=w-feed');
      t.ok(text().includes(MADE_LINE) && byAction('buy-item').length === 0, 'B8: علف له شراء: السطر باقٍ، والشراء من ملفّ المادّة لا من هنا');
      await unmount();
      // علف بلا إنتاج ولا شراء: لا سطر، والفراغ كما كان، والشراء ممكن.
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItem: () => feed, loadItemPurchases: () => feedBuys({ lastProduction: null }) }));
      await mount('/inventory/items/f-1/details?wh=w-feed');
      t.ok(byAction('open-last-production').length === 0 && !text().includes('صُنعت في المعمل'), 'B8: بلا دفعة إنتاج: لا سطر');
      t.ok(text().includes('لا شراء لهذه المادّة بعد.') && byAction('buy-item').length === 0, 'B8: والفراغ كما كان (بلا زرّ شراء هنا)');
      await unmount();
      // مادّة أوّلية بمخزنها: الإنتاج لا يمسّها.
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ loadItemPurchases: () => ({ ...purchases(), rows: [], total: 0, lastProduction: null }) }));
      await mount('/inventory/items/i-corn/details?wh=w-raw');
      t.ok(byAction('buy-item').length === 0 && !text().includes('تُصنع في المعمل'), 'B8: ضابط: مادّة أوّلية بلا شراء: لا «تُصنع في المعمل»');
      await unmount();
    });

    // ── B9 (ع٤): حفظ سعر في بطاقة لا يمسح تعديلاً جارياً في البطاقة الأخرى ──────────────────────────────────────────
    await step('B9', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ setItemCostPrice: (_id, price) => price, setItemSellPrice: (_id, price) => price }));
      await mount('/inventory/items/i-corn/details');
      await click(byAction('edit-sell-price')[0]);
      type(byIdSuffix('-sell')[0], '650');
      await settle();
      await click(byAction('edit-cost-price')[0]);
      type(byIdSuffix('-cost')[0], '475.5');
      await settle();
      await click(byAction('save-cost-price')[0]);
      await settle();
      t.same(named(calls, 'setItemCostPrice'), [['i-corn', 475_50n, 450_00n]], 'B9: سعر الكلفة حُفظ مشروطاً بما رأته الشاشة');
      t.eq(byIdSuffix('-sell')[0]?.value, '650', 'B9: وتعديل سعر البيع الجاري باقٍ بعد حفظ سعر الكلفة');
      t.ok(text().includes('سعر الكلفة الآن') && text().includes('475.50'), 'B9: وسعر الكلفة المحفوظ معروض من جواب الخادم');
      t.eq(named(calls, 'loadItemPurchases').length, 1, 'B9: بلا قراءة ثانية تطوي البطاقتين');
      await click(byAction('save-sell-price')[0]);
      t.same(named(calls, 'setItemSellPrice'), [['i-corn', 650_00n, 600_00n]], 'B9: ثمّ سعر البيع بالتعديل الذي بقي');
      await click(byAction('edit-cost-price')[0]);
      type(byIdSuffix('-cost')[0], '480');
      await settle();
      await click(byAction('save-cost-price')[0]);
      t.same(named(calls, 'setItemCostPrice').at(-1), ['i-corn', 480_00n, 475_50n], 'B9: والتعديل التالي مشروط بالسعر المحفوظ لا بالقديم');
      await unmount();
    });

    // ── B10 (ع٣، الملاحظة #21): صفحة «المواد» بتدفّق نافذة «مادّة جديدة» ─────────────────────────────────────────────
    await step('B10', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ findItemTwins: () => [twin], createItem: newItem }));
      await mount('/inventory/items');
      await click(byAction('new-item')[0]);
      const options = (byAction('pick-kind')[0]?.options ?? []).map((o) => o.textContent);
      t.ok(options.includes('مادّة أوّلية للعلف: ذرة، صويا، نخالة…') && options.some((o) => o.startsWith('علف جاهز: ناتج المعمل')), `B10: أنواع صفحة المواد بأمثلتها (${options.join(' | ')})`);
      type(byIdSuffix('-name')[0], 'ذرة صفراء');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.same(named(calls, 'createItem'), [], 'B10: التوأم يوقف الحفظ أوّلاً');
      const buy = byAction('buy-item').filter((n) => n.textContent.includes('سجّل شراءً جديداً'));
      t.same(buy.map((n) => [n.textContent, n.getAttribute('href')]), [['سجّل شراءً جديداً لـ«ذرة صفراء»', '/inventory/items/i-old?buy=1']], `B10: الفعل الأوّل «سجّل شراءً جديداً» برابط ملفّ المادّة الموجودة ونافذة شرائها (${text().slice(-500)})`);
      t.ok(text().includes('المادّة تُضاف مرّة واحدة، وكلّ شراء جديد (بكميته وسعره) يُسجَّل في ملفّها'), 'B10: والجملة تشرح');
      t.ok(byAction('save-item-twin')[0]?.textContent.includes('احفظ مادّة أخرى بالاسم نفسه'), 'B10: و«احفظ مادّة أخرى بالاسم نفسه» ثانياً');
      await follow(buy[0]);
      await settle();
      t.same([where.pathname, where.search], ['/inventory/items/i-old', '?buy=1'], 'B10: والنقر يفتح ملفّ المادّة الموجودة ونافذة شرائها');
      t.same(named(calls, 'createItem'), [], 'B10: ولا مادّة ثانية كُتبت');
      await unmount();
    });
    await step('B10-other', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ findItemTwins: () => [twin], createItem: newItem }));
      await mount('/inventory/items');
      await click(byAction('new-item')[0]);
      type(byIdSuffix('-name')[0], 'ذرة صفراء');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.eq(named(calls, 'createItem').length, 1, 'B10: «احفظ مادّة أخرى بالاسم نفسه» يكتبها إن أصرّ');
      await unmount();
    });
    await step('B10-archived', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ findItemTwins: () => [{ ...twin, name: 'ذراء', archived: true }] }));
      await mount('/inventory/items');
      await click(byAction('new-item')[0]);
      type(byIdSuffix('-name')[0], 'ذراء');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.ok(text().includes('احفظ رغم التشابه') && byAction('buy-item').length === 0, 'B10: توأم مؤرشف وحده: لا شراء له، والتنبيه كما كان');
      await unmount();
    });
    await step('B10-code', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, handlers({ findItemTwins: () => [{ ...twin, name: 'ذرة صفراء مستوردة', sameName: false, codes: ['X1'] }] }));
      await mount('/inventory/items');
      await click(byAction('new-item')[0]);
      type(byIdSuffix('-name')[0], 'ذرة');
      type(byIdSuffix('-barcode')[0], 'X1');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.ok(text().includes('رمز مستعمل لمادّة أخرى') && byAction('save-item')[0]?.hasAttribute('disabled') === true, `B10: رمز مشترك: الرفض كما كان (${text().slice(-400)})`);
      t.same(byAction('buy-item').map((n) => n.getAttribute('href')), ['/inventory/items/i-old?buy=1'], 'B10: ومعه شراء المادّة صاحبة الرمز (الرمز يدلّ على المادّة نفسها)');
      t.same(named(calls, 'createItem'), [], 'B10: ولا مادّة ثانية');
      await unmount();
    });
    await step('B10-edit', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers({ listItems: () => ({ rows: [corn], total: 1, next: null }), findItemTwins: () => [{ ...twin, name: 'ذرة' }] }));
      await mount('/inventory/items');
      await click(byAction('edit-item')[0]);
      type(byIdSuffix('-name')[0], 'ذرة');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.ok(text().includes('احفظ رغم التشابه') && byAction('buy-item').length === 0, 'B10: تعديل مادّة قائمة باسم توأمها: لا شراء (لا يُحلّ بشراء)، والتنبيه كما كان');
      await unmount();
    });
    await step('B10-category', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, handlers());
      await mount('/inventory/items');
      await click(byAction('new-item')[0]);
      t.ok(text().includes('التصنيف قسم يجمع موادّ متشابهة، مثل «الغذاء» أو «الإضافات».'), 'B10: تلميح التصنيف في صفحة المواد');
      type(byIdSuffix('-name')[0], 'ذرة');
      await settle();
      choose(byAction('pick-category')[0], 'c-corn');
      await settle();
      t.ok(text().includes('اسم التصنيف مثل اسم المادّة'), 'B10: وتصنيف «ذرة» لمادّة «ذرة» يحذّر');
      choose(byAction('pick-category')[0], 'c-food');
      await settle();
      t.ok(!text().includes('اسم التصنيف مثل اسم المادّة'), 'B10: و«الغذاء» بلا تحذير');
      await unmount();
    });

    // ── دوالّ صافية ─────────────────────────────────────────────────────────────────────────────────────────────
    t.same(m.buyPath('i-1'), '/inventory/items/i-1?buy=1', 'buyPath: ملفّ المادّة ونافذة الشراء (لا ورقة استلام)');
    t.same([m.categoryNamedLikeItem('ذرة', { name: 'ذرة' }), m.categoryNamedLikeItem('ذُرة ', { name: 'ذرة' }), m.categoryNamedLikeItem('ذرة', { name: 'الغذاء' }), m.categoryNamedLikeItem('', { name: '' }), m.categoryNamedLikeItem('ذرة', undefined)], [true, true, false, false, false], 'categoryNamedLikeItem: بالاسم المطبَّع، والفارغ لا يطابق');
    t.same([m.notListedHere('raw', { name: 'م', kind: 'raw' }), m.notListedHere('raw', undefined)], [null, null], 'notListedHere: نوع يستلمه المخزن (أو بلا مخزن قائمة) بلا تنبيه');
    t.ok((m.notListedHere('table_egg', { name: 'مخزن العلف', kind: 'feed' }) ?? '').includes('لا تُشترى من مورّد'), 'notListedHere: ونوع لا يُشترى يقول ذلك');
    t.same(m.activeTwins([twin, { ...twin, id: 'a', archived: true }, { ...twin, id: 'c', sameName: false, codes: ['X1'] }, { ...twin, id: 'n', sameName: false }]).map((x) => x.id), ['i-old', 'c'], 'activeTwins: الفعّالة بالاسم أو بالرمز');
    const stores = [
      { id: 'a', name: 'أ', kind: 'raw', siteId: 's', divisionId: 'd', divisionKind: 'feed_mill', archived: false, hasBalance: false },
      { id: 'b', name: 'ب', kind: 'raw', siteId: 's', divisionId: 'd', divisionKind: 'feed_mill', archived: true, hasBalance: false },
      { id: 'c', name: 'ج', kind: 'general', siteId: 's', divisionId: 'd', divisionKind: 'general', archived: false, hasBalance: false },
      { id: 'f', name: 'ف', kind: 'farm', siteId: 's', divisionId: 'd', divisionKind: 'broiler', archived: false, hasBalance: false },
    ];
    t.same([m.receivingStores(stores, null).map((s) => s.id), m.receivingStores(stores, { kind: 'raw' }).map((s) => s.id), m.receivingStores(stores, { kind: 'packaging' }).map((s) => s.id)], [['a', 'c'], ['a'], ['a', 'c']], 'receivingStores: الفعّالة التي تستلم، ومع مادّة التي تستلم نوعها');
    const buy = m.buyableIn('raw', false, true);
    t.same([buy({ kind: 'raw', archived: false }), buy({ kind: 'fuel', archived: false }), buy({ kind: 'raw', archived: true }), m.buyableIn('raw', true, true)({ kind: 'raw', archived: false }), m.buyableIn('raw', false, false)({ kind: 'raw', archived: false }), m.buyableIn(undefined, false, true)({ kind: 'raw', archived: false })], [true, false, false, false, false, false], 'buyableIn: الصلاحية والمخزن الفعّال ونوع يستلمه والمادّة الفعّالة');

    // ── B7: repo — setItemCostPrice وloadItem ومصدر الدفعة وسعر الكلفة بالقارئ ────────────────────────────────────
    const repo = await bundleOf("export { setItemCostPrice, setItemSellPrice, loadItem, parseItemLots, parseItemPurchases, RowShapeError } from './src/lib/repo/inventory.ts';", [coreStub]);
    const rpc = [];
    const tables = [];
    globalThis.__repo = {
      rpc: async (fn, args) => {
        rpc.push([fn, args]);
        if (fn === 'set_item_cost_price') return { item_id: args.p_item, cost_price: args.p_price };
        return null;
      },
      db: {
        from: (table) => ({
          select: (columns) => ({
            eq: (column, value) => ({
              limit: async (n) => {
                tables.push([table, column, value, n, columns.includes('name_norm')]);
                return value === 'i-corn'
                  ? { data: [{ id: 'i-corn', name: 'ذرة صفراء', name_norm: 'ذره صفراء', category_id: null, kind: 'raw', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null, tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [], archived_at: null, version: 3 }], error: null, status: 200 }
                  : { data: [], error: null, status: 200 };
              },
            }),
          }),
        }),
      },
    };
    try {
      t.eq(await repo.setItemCostPrice('i-corn', 475_50n, 450_00n), 475_50n, 'B7: setItemCostPrice يرجّع ما كتبه الخادم بالفلس');
      t.same(rpc.at(-1), ['set_item_cost_price', { p_item: 'i-corn', p_price: '475.50', p_expected: '450.00' }], 'B7: بنداء set_item_cost_price والسعر والمتوقَّع نصّاً عشرياً');
      t.eq(await repo.setItemCostPrice('i-corn', null, 475_50n), null, 'B7: وnull يشيل السعر');
      t.same(rpc.at(-1)?.[1], { p_item: 'i-corn', p_price: null, p_expected: '475.50' }, 'B7: بلا سعر = null بالسلك');
      const row = await repo.loadItem('i-corn');
      t.same([row?.id, row?.kind, row?.version, row?.archived], ['i-corn', 'raw', 3, false], 'B7: loadItem يقرأ المادّة بصفّ المواد نفسه');
      t.same(tables.at(-1), ['items', 'id', 'i-corn', 1, true], 'B7: من items بمعرّفها وبأعمدة المادّة');
      t.eq(await repo.loadItem('i-none'), null, 'B7: ومادّة ليست في المنشأة null');
    } finally {
      delete globalThis.__repo;
    }
    const lotItem = { id: 'i', name: 'علف', kind: 'feed', base_unit: 'kg', tracks_expiry: false, min_qty: null, density: null, piece_mass_kg: null, archived: false };
    const lotOf = (over) => ({ lot_id: 'l', qty_left: '1.000', received_on: '2026-11-04', root_received_on: '2026-11-04', age_days: 0, born_at: null, age_hours: null, expiry_on: null, expired: false, near_expiry: false, supplier_lot_no: null, ...over });
    const shape = (fn) => {
      try {
        fn();
        return 'ok';
      } catch (error) {
        return error instanceof repo.RowShapeError ? error.message : `other:${error}`;
      }
    };
    const asObject = repo.parseItemLots({ item: lotItem, rows: [lotOf({ source: { kind: 'production', id: 'pb-1', label: 'PD-2026-0003' } })], next: null, total: 1 });
    t.same([asObject.rows[0].sourceKind, asObject.rows[0].sourceId, asObject.rows[0].source], ['production', 'pb-1', 'PD-2026-0003'], 'B7: مصدر الدفعة كائناً (0016) {kind,id,label}');
    const asText = repo.parseItemLots({ item: lotItem, rows: [lotOf({ source_kind: 'production', source_id: 'pb-1', source: 'PD-2026-0003' })], next: null, total: 1 });
    t.same([asText.rows[0].sourceKind, asText.rows[0].sourceId, asText.rows[0].source], ['production', 'pb-1', 'PD-2026-0003'], 'B7: وبشكل 0007 (نصّ التسمية وsource_kind) يقبل الإنتاج');
    t.same(
      [
        shape(() => repo.parseItemLots({ item: lotItem, rows: [lotOf({ source: { kind: 'production', id: 'pb-1', label: 'x' }, source_kind: 'receipt' })], next: null, total: 1 })),
        shape(() => repo.parseItemLots({ item: lotItem, rows: [lotOf({ source: { kind: 'gift', id: 'x', label: 'x' } })], next: null, total: 1 })),
        shape(() => repo.parseItemLots({ item: lotItem, rows: [lotOf({ source: { kind: 'production', id: 'pb-1' } })], next: null, total: 1 })),
        shape(() => repo.parseItemLots({ item: lotItem, rows: [lotOf({ source_kind: 'production', source_id: 'pb-1' })], next: null, total: 1 })),
      ],
      ['row_shape:source', 'row_shape:kind', 'row_shape:label', 'row_shape:source'],
      'B7: والكائن المخالف لـsource_kind، ونوع غير معروف، وتسمية غائبة، وبلا مصدر أصلاً: كلّها خطأ شكل',
    );
    const purchasesJson = (money, extra = { last_production: null }) => ({
      item: { id: 'i-corn', name: 'ذرة', kind: 'raw', base_unit: 'kg', tracks_expiry: false, min_qty: null, archived: false, ...(money ? { money } : {}) },
      warehouse: null, today: '2026-11-04', rows: [], next: null, total: 0, ...extra,
    });
    t.same(
      [repo.parseItemPurchases(purchasesJson({ sell_price: '600.00', cost_price: '450.50' })).item.costPrice, repo.parseItemPurchases(purchasesJson({ sell_price: '600.00', cost_price: null })).item.costPrice, repo.parseItemPurchases(purchasesJson(null)).item.costPrice],
      [450_50n, null, null],
      'B7: سعر الكلفة بقارئ المشتريات داخل money بالفلس، والفارغ أو بلا money (دور بلا كلفة) null',
    );
    // ع٢ (ق١٤): last_production على المستوى الأعلى، إلزامي: كائن أو null.
    const lastJson = (over = {}) => ({ last_production: { batch_id: 'pb-1', doc_no: 'PD-2026-0001', produced_on: '2026-11-03', qty_kg: '2000.000', warehouse_name: 'مخزن العلف', ...over } });
    t.same(
      repo.parseItemPurchases(purchasesJson(null, lastJson())).lastProduction,
      { batchId: 'pb-1', docNo: 'PD-2026-0001', producedOn: '2026-11-03', qtyKg: 2_000_000n, warehouseName: 'مخزن العلف' },
      'B7: last_production مقروءاً: الدفعة ورقمها ويومها وكمية الناتج بالآلاف ومخزنه',
    );
    t.eq(repo.parseItemPurchases(purchasesJson(null)).lastProduction, null, 'B7: وnull = لم تُصنع');
    t.same(
      [
        shape(() => repo.parseItemPurchases(purchasesJson(null, {}))),
        shape(() => repo.parseItemPurchases(purchasesJson(null, { last_production: 'PD-2026-0001' }))),
        shape(() => repo.parseItemPurchases(purchasesJson(null, lastJson({ qty_kg: '2000.0001' })))),
        shape(() => repo.parseItemPurchases(purchasesJson(null, lastJson({ doc_no: null })))),
        shape(() => repo.parseItemPurchases(purchasesJson(null, lastJson({ batch_id: undefined })))),
      ],
      ['row_shape:last_production', 'row_shape:last_production', 'row_shape:qty_kg', 'row_shape:doc_no', 'row_shape:batch_id'],
      'B7: والمفتاح إلزامي، وقيمته كائن أو null، وكميته بثلاث مراتب، ورقم الدفعة ومعرّفها إلزاميان: كلّها خطأ شكل لا «لم تُصنع» صامتة',
    );
  } finally {
    delete globalThis.__buy;
    restore();
  }
}
