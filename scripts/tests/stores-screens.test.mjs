// تجربة المخازن الجديدة (كلمة المالك 2026-11-02، spec ب): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes
// الحقيقية، وrepo والجلسة والرسائل بدائل. كل حالة تفشل على الشفرة بلا إصلاحها:
// S1 بطاقة لكل مخزن بنطاقه بتنبيهاتها، وقيمة المتاح تختفي لدور بلا كلفة؛ S2 «أضف مخزناً» لمن يملك stores.manage بس، وبلا
// موقع فعّال النافذة تقول «أضف الموقع أوّلاً» والحفظ معطّل؛ S3 الحفظ ينادي createWarehouse بوحدة الموقع ونوعه؛ S4 أقسام
// التصنيف (ويّا «دون تصنيف») قابلة للطيّ وعدد موادّها؛ S5 البحث يصفّي المواد ويخفي القسم الفارغ؛ S6 «أضف مادّة» لمن يملك
// item.create بس؛ S7 تنبيه التوائم قبل الحفظ، والحفظ الثاني يمرّ؛ S8 تبويب المشتريات: صفوفه وسطر «آخر شراء» ومقارنته
// بالذي قبله؛ S9 دور بلا كلفة يرى الكميات بلا أسعار؛ S10 المشتريات بلا مخزن مختار = كل المخازن (p_warehouse فارغ).
// ومن 0014: S11 المادّة برصيد صفر تظهر بقسمها وسعر بيعها وقيمته بأعمدتها وشريط أرقام المخزن من مجاميع الخادم؛
// S12 نموذج المادّة بالباركود وسعر البيع بدالّته (والأمين بلا حقله)؛ S13 بطاقة سعر البيع بمحرّرها وهامشها؛
// S14 دفتر المادّة بالبيان وداخل وخارج.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_INV = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'inventory.ts'));
const REAL_COUNTS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'counts.ts'));
const OVERRIDES = [
  'loadOrgSetup',
  'loadStoresOverview',
  'loadStockOnHand',
  'loadStockValues',
  'loadStockValueTotals',
  'loadItemPurchases',
  'loadItemLots',
  'loadItemLotValues',
  'loadItemMoves',
  'listItemUnits',
  'listItems',
  'listStockDocs',
  'createWarehouse',
  'createItem',
  'createItemUnit',
  'findItemTwins',
  'setItemSellPrice',
];
const STUBS = {
  inventory: `export * from ${REAL_INV}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__stores.call('${n}', a);`).join(' ')}`,
  counts: `export * from ${REAL_COUNTS}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  session: 'export const useSession = () => globalThis.__stores.session; export const sessionStore = { get: () => globalThis.__stores?.session ?? { status: "loading" } };',
  repo: "export const workspace = { loadMyWorkspace: (...a) => globalThis.__stores.call('loadMyWorkspace', a) };",
  Toast: 'export const toast = (spec) => { globalThis.__stores.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'stores-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/inventory$|\/lib\/repo\/counts$|\/lib\/repo$|\/Toast$/ }, (args) => {
      const tail = args.path.split('/').at(-1);
      const name = args.path.endsWith('/lib/repo') ? 'repo' : tail;
      return { path: name, namespace: 'stores-stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'stores-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { sectionsOf, sectionValue, suggestedKind } from './src/pages/inventory/WarehousePage.tsx';",
    "export { comparePrices, packQty, tabOf, cardParams } from './src/pages/inventory/ItemCardPage.tsx';",
    "export { searchable } from './src/domain/normalize.ts';",
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
const tagged = (tag) => all().filter((n) => n.nodeName === tag);
const off = (node) => node?.disabled === true || node?.getAttribute('disabled') !== null;
const submitForm = () => {
  fire(byIdSuffix('-form')[0], 'submit');
  return settle();
};

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const ws = (over = {}) => ({
      userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'manager',
      scopes: [], divisions: ['general', 'medicine'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true,
      invites: [], subscription: 'active', confirmedAt: 1, ...over,
    });
    const keeper = ws({ role: 'storekeeper', scopes: [{ warehouseId: 'w-gen' }], canSeeCost: false, canSeeAccounts: false, canSeeSales: false });

    const site = { id: 's-store', name: 'مخزن المشروع', kind: 'store', divisionId: 'd-gen', divisionKind: 'general' };
    const card = (over) => ({
      id: 'w-gen', name: 'المخزن العامّ', kind: 'general', siteId: 's-store', siteName: 'مخزن المشروع', siteKind: 'store',
      divisionId: 'd-gen', divisionKind: 'general', itemsCount: 4, belowMinimum: 1, nearExpiry: 0, expired: 2,
      stockValue: 402_500_00n, saleValue: 500_000_00n, expectedProfit: 97_500_00n, itemsUnpriced: 1, ...over,
    });
    const quiet = card({ id: 'w-med', name: 'مخزن الأدوية', kind: 'medicine', divisionId: 'd-med', divisionKind: 'medicine', itemsCount: 2, belowMinimum: 0, nearExpiry: 0, expired: 0,
      stockValue: 1_000_00n, saleValue: 0n, expectedProfit: 0n, itemsUnpriced: 0 });
    const overview = (over = {}) => ({ today: '2026-11-02', canManage: true, canCreateItem: true, rows: [card({}), quiet], sites: [site], ...over });

    const org = {
      divisions: [
        { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
        { id: 'd-med', kind: 'medicine', goLiveOn: '2026-10-01', frozen: true },
      ],
      sites: [], packTypes: [], expenseCategories: [],
      itemCategories: [
        { id: 'c-feed', version: 1, archived: false, name: 'مواد الأكل' },
        { id: 'c-med', version: 1, archived: false, name: 'أدوية' },
      ],
      warehouses: [
        { id: 'w-gen', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-store', name: 'المخزن العامّ', kind: 'general', hasBalance: false },
        { id: 'w-med', version: 1, archived: false, divisionId: 'd-med', siteId: 's-store', name: 'مخزن الأدوية', kind: 'medicine', hasBalance: false },
      ],
    };
    const stockRow = (itemId, name, baseUnit, over = {}) => ({
      itemId, name, kind: 'raw', baseUnit, tracksExpiry: false, minQty: null, archived: false,
      categoryId: 'c-feed', categoryName: 'مواد الأكل', barcode: null,
      available: 500_000n, expired: 0n, nearExpiry: 0n, belowMin: false, chickAgeHours: null, oldChicks: 0n,
      money: { stockValue: 300_000_00n, sellPrice: 1_750_00n, saleValue: 875_000_00n, expectedProfit: 575_000_00n }, ...over,
    });
    const board = {
      warehouse: { id: 'w-gen', name: 'المخزن العامّ', kind: 'general', divisionId: 'd-gen', divisionKind: 'general', archived: false, hasBalance: false },
      asOf: '2026-11-02T09:05:00Z',
      rows: [
        stockRow('i-corn', 'ذرة صفراء', 'kg'),
        stockRow('i-soy', 'صويا', 'kg', { belowMin: true, money: { stockValue: 60_000_00n, sellPrice: null, saleValue: null, expectedProfit: null } }),
        stockRow('i-oil', 'زيت نباتي', 'L', { available: 200_000n, money: { stockValue: 40_000_00n, sellPrice: null, saleValue: null, expectedProfit: null } }),
        // مادّة بلا رصيد أصلاً: تظهر بقسمها (0014)، ومادّة بتصنيف غير موجود بالقائمة.
        stockRow('i-add', 'مكمّل علفي', 'kg', { available: 0n, barcode: 'ADD-1', money: { stockValue: 0n, sellPrice: 2_000_00n, saleValue: 0n, expectedProfit: 0n } }),
        stockRow('i-vac', 'لقاح نيوكاسل', 'pc', { kind: 'vaccine', available: 30_000n, expired: 5_000n, tracksExpiry: true, categoryId: null, categoryName: null, money: { stockValue: 2_500_00n, sellPrice: null, saleValue: null, expectedProfit: null } }),
      ],
      next: null,
      total: 5,
      money: { stockValue: 402_500_00n, saleValue: 875_000_00n, expectedProfit: 575_000_00n, itemsUnpriced: 3 },
    };
    const purchase = (over) => ({
      lotId: 'l-1', receivedOn: '2026-10-28', docId: 'r-1', docNo: 'PU-2026-0003', partyId: 'p-1', partyName: 'مورّد الحبوب',
      warehouseId: 'w-gen', warehouseName: 'المخزن العامّ', lineId: 'rl-1', qtyIn: 500_000n, qtyLeft: 300_000n,
      qtyInUnit: 10_000n, unitLabel: 'كيس 50 كغم', unitCode: null, factor: 50_000_000n, baseUnit: 'kg',
      supplierLotNo: 'L-77', expiryOn: null,
      money: { invoiceTotal: 400_000_00n, landedValue: 402_500_00n, unitCost: 805_00n, corrected: true },
      ...over,
    });
    const older = purchase({
      lotId: 'l-0', receivedOn: '2026-09-15', docId: 'r-0', docNo: 'PU-2026-0001', partyName: 'مورّد ثانٍ',
      qtyLeft: 0n, money: { invoiceTotal: 350_000_00n, landedValue: 350_000_00n, unitCost: 700_00n, corrected: false },
    });
    const purchases = (rows, over = {}) => ({
      item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: 1_750_00n },
      warehouse: null, today: '2026-11-02', rows, next: null, total: rows.length, ...over,
    });

    const lots = {
      item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, density: null, archived: false },
      rows: [], next: null, total: 0,
    };
    const move = (over) => ({
      moveId: 'mv-1', seq: 1n, movedOn: '2026-10-29', docKind: 'receipt', docId: 'r-1', doc: 'PU-2026-0003', memo: 'شراء من مورّد الحبوب',
      qty: 100_000n, running: 100_000n, lotId: 'l-1', reversesMoveId: null, reversed: false,
      money: { value: 160_000_00n, runningValue: 160_000_00n }, ...over,
    });
    const moves = {
      rows: [
        move({}),
        move({ moveId: 'mv-2', seq: 2n, movedOn: '2026-11-02', docKind: 'transfer', docId: 't-1', doc: 'TR-2026-0001', memo: 'تحويل إلى مخزن حقل 1', qty: -50_000n, running: 50_000n, money: { value: -80_000_00n, runningValue: 80_000_00n } }),
      ],
      next: null,
      total: 2,
    };

    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__stores = {
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

    let root = null;
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
      await settle();
      return container;
    };
    const unmount = async () => {
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
    };

    const handlers = (over = {}) => ({
      loadOrgSetup: () => org,
      loadStoresOverview: () => overview(),
      loadStockOnHand: () => board,
      loadStockValueTotals: () => ({ units: [], available: 0n, expired: 0n, total: 0n }),
      loadItemPurchases: () => purchases([purchase({}), older]),
      listItemUnits: () => [],
      setItemSellPrice: (_item, price) => price,
      listItems: () => ({ rows: [], total: 0, next: null }),
      listStockDocs: () => ({ rows: [], next: null, total: 0 }),
      loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
      ...over,
    });

    // ── S1: بطاقة لكل مخزن بتنبيهاتها، والقيمة لأدوار الكلفة بس ───────────────────────────────────────────────
    {
      fresh({ status: 'ready', workspace: ws() }, handlers());
      await mount('/inventory');
      const tiles = byAction('open-store');
      t.eq(tiles.length, 2, 'S1: بطاقة لكل مخزن بنطاق المستخدم');
      t.same(tiles.map((n) => n.getAttribute('href')), ['/inventory/store/w-gen', '/inventory/store/w-med'], 'S1: كل بطاقة رابط يفتح مخزنها');
      const first = tiles[0].textContent;
      t.ok(first.includes('المخزن العامّ') && first.includes('مخزن المشروع'), `S1: اسم المخزن وموقعه بالبطاقة (${first})`);
      t.ok(first.includes('تحت الحدّ الأدنى: 1') && first.includes('منتهٍ: 2') && !first.includes('قريب الانتهاء'), `S1: الشارات الموجودة بس (${first})`);
      t.ok(!tiles[1].textContent.includes('تحت الحدّ الأدنى') && !tiles[1].textContent.includes('منتهٍ'), 'S1: مخزن بلا تنبيه بلا شارات');
      t.ok(first.includes('402,500.00'), 'S1: قيمة المتاح لدور الكلفة');
      await unmount();
    }
    {
      // البطاقة تجي بقيمة (لو الخادم ما شالها): الشاشة ما تعرضها لدور بلا كلفة.
      fresh({ status: 'ready', workspace: keeper }, handlers({ loadStoresOverview: () => overview({ canManage: false, rows: [card({})], canCreateItem: true }) }));
      await mount('/inventory');
      t.ok(!text().includes('402,500.00') && text().includes('المخزن العامّ'), 'S1: دور بلا كلفة: البطاقة بلا قيمة المتاح');
      t.eq(byAction('add-warehouse').length, 0, 'S2: بلا stores.manage: ماكو «أضف مخزناً»');
      await unmount();
    }

    // ── S2 وS3: «أضف مخزناً» وحالة «بلا موقع» والكتابة ────────────────────────────────────────────────────────
    {
      fresh({ status: 'ready', workspace: ws() }, handlers({ loadStoresOverview: () => overview({ sites: [] }) }));
      await mount('/inventory');
      t.eq(byAction('add-warehouse').length, 1, 'S2: «أضف مخزناً» لمن يملك stores.manage');
      fire(byAction('add-warehouse')[0], 'click');
      await settle();
      t.ok(text().includes('أضف الموقع أوّلاً'), `S2: بلا موقع فعّال النافذة تقول «أضف الموقع أوّلاً» (${text().slice(-200)})`);
      t.ok(all().some((n) => n.getAttribute('href') === '/settings/org' && n.getAttribute('data-action') === 'open-org-sites'), 'S2: ومعها رابط إضافة الموقع');
      t.ok(off(byAction('save-warehouse')[0]), 'S2: والحفظ معطّل بلا موقع');
      await unmount();
    }
    {
      const calls = fresh({ status: 'ready', workspace: ws() }, handlers({ createWarehouse: (divisionId, siteId, name, kind) => ({ id: 'w-new', version: 1, archived: false, divisionId, siteId, name, kind }) }));
      await mount('/inventory');
      fire(byAction('add-warehouse')[0], 'click');
      await settle();
      type(byIdSuffix('-name')[0], 'مخزن القاعة');
      await settle();
      await submitForm();
      t.same(calls.filter(([name]) => name === 'createWarehouse'), [['createWarehouse', ['d-gen', 's-store', 'مخزن القاعة', 'general']]], 'S3: الحفظ ينادي createWarehouse بوحدة الموقع ونوع المخزن المسموح');
      t.ok(text().includes('أُضيف المخزن «مخزن القاعة»'), 'S3: وتقول إنه أُضيف');
      await unmount();
    }

    // ── S4 وS5: أقسام التصنيف والبحث ─────────────────────────────────────────────────────────────────────────
    {
      fresh({ status: 'ready', workspace: ws() }, handlers());
      await mount('/inventory/store/w-gen');
      const sections = tagged('DETAILS');
      t.eq(sections.length, 2, 'S4: قسم لكل تصنيف موجود (ولا قسم فارغ)');
      t.ok(sections.every((node) => node.getAttribute('open') !== null || node.open === true), 'S4: الأقسام مفتوحة بالبداية وقابلة للطيّ (details/summary)');
      const summaries = sections.map((node) => node.childNodes.find((child) => child.nodeName === 'SUMMARY')?.textContent ?? '');
      t.ok(summaries[0].includes('مواد الأكل') && summaries[0].includes('4 مادّة'), `S4: «مواد الأكل» بعدد موادّه (${summaries[0]})`);
      t.ok(summaries[1].includes('دون تصنيف') && summaries[1].includes('1 مادّة'), `S4: و«دون تصنيف» آخراً (${summaries[1]})`);
      t.ok(summaries[0].includes('400,000.00'), `S4: ومجموع قيمة القسم لأدوار الكلفة (${summaries[0]})`);
      t.ok(sections[0].textContent.includes('ذرة صفراء') && sections[0].textContent.includes('زيت نباتي') && sections[1].textContent.includes('لقاح نيوكاسل'), 'S4: كل مادّة بقسم تصنيفها');
      // 0014: المادّة بلا رصيد تظهر بقسمها (قبله كانت تختفي إلى أوّل استلام)، وسعر بيعها وقيمة بيعها بأعمدتها، و«بلا سعر» لمن لا سعر لها.
      t.ok(sections[0].textContent.includes('مكمّل علفي'), `S11: المادّة برصيد صفر تظهر بقسمها (${sections[0].textContent.slice(0, 160)})`);
      const board4 = text();
      t.ok(board4.includes('1,750.00') && board4.includes('875,000.00'), `S11: سعر البيع وقيمة البيع بأعمدة القائمة (${board4.slice(0, 200)})`);
      t.ok(board4.includes('بلا سعر'), 'S11: والمادّة بلا سعر بيع تقول «بلا سعر»');
      t.ok(board4.includes('رأس المال') && board4.includes('قيمة البيع') && board4.includes('الربح المتوقّع') && board4.includes('575,000.00'), `S11: وشريط أرقام المخزن من مجاميع الخادم (${board4.slice(0, 200)})`);
      t.ok(board4.includes('3 مادّة'), 'S11: ويقول إنّ الربح لا يشمل المواد بلا سعر');
      // S5: البحث
      type(byIdSuffix('-search')[0], 'ذرة');
      await settle();
      const after = tagged('DETAILS');
      t.eq(after.length, 1, 'S5: البحث يخفي القسم الذي لا مادّة فيه');
      t.ok(after[0].textContent.includes('ذرة صفراء') && !after[0].textContent.includes('صويا'), 'S5: والمعروض المطابق بس');
      type(byIdSuffix('-search')[0], 'لا شيء مطابق');
      await settle();
      t.ok(text().includes('لا موادّ بهذا البحث'), 'S5: وبحث بلا نتيجة يقول ذلك، لا جدول فارغ');
      await unmount();
    }
    {
      const calls = fresh({ status: 'ready', workspace: keeper }, handlers({ loadStoresOverview: () => overview({ canManage: false, canCreateItem: false }) }));
      await mount('/inventory/store/w-gen');
      t.eq(byAction('add-item').length, 0, 'S6: بلا item.create: ماكو «أضف مادّة»');
      t.ok(!text().includes('400,000.00') && text().includes('ذرة صفراء'), 'S6: ودور بلا كلفة يرى المواد بلا قيمتها');
      t.same(calls.filter(([name]) => name === 'loadStockValues'), [], 'S6: ولا ينادي قيم المخزون التي يرفضها الخادم له');
      await unmount();
    }

    // ── S6 وS7: «أضف مادّة» وتنبيه التوائم ───────────────────────────────────────────────────────────────────
    {
      const twin = [{ id: 'i-old', name: 'ذرة صفراء', archived: false, sameName: true, codes: [] }];
      const calls = fresh({ status: 'ready', workspace: keeper }, handlers({
        loadStoresOverview: () => overview({ canManage: false, canCreateItem: true }),
        findItemTwins: () => twin,
        createItem: (fields) => ({ id: 'i-new', version: 1, archived: false, name: fields.name, nameNorm: m.searchable(fields.name), categoryId: fields.category_id, kind: fields.kind, baseUnit: fields.base_unit, density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [] }),
      }));
      await mount('/inventory/store/w-gen');
      t.eq(byAction('add-item').length, 1, 'S6: «أضف مادّة» لمن يملك item.create (الأمين بـ0013)');
      fire(byAction('add-item')[0], 'click');
      await settle();
      type(byIdSuffix('-name')[0], 'ذرة صفراء');
      await settle();
      choose(byAction('pick-category')[0], 'c-feed');
      await settle();
      await submitForm();
      t.same(calls.filter(([name]) => name === 'findItemTwins').length, 1, 'S7: الحفظ يفحص التوائم أوّلاً');
      t.same(calls.filter(([name]) => name === 'createItem'), [], 'S7: وما يكتب المادّة ويّا توأم بالاسم');
      t.ok(text().includes('مادّة بالاسم نفسه موجودة'), 'S7: والتنبيه يسمّي التشابه');
      await submitForm();
      const created = calls.filter(([name]) => name === 'createItem');
      t.eq(created.length, 1, 'S7: والحفظ الثاني «احفظ رغم التشابه» يكتبها');
      t.same([created[0][1][0].name, created[0][1][0].category_id, created[0][1][0].kind], ['ذرة صفراء', 'c-feed', 'other'], 'S7: بالاسم والتصنيف ونوعها المقترح من المخزن');
      await unmount();
    }
    {
      // 0014: النموذج بأسلوب دكتور فيت — الباركود وسعر البيع معه، والسعر يُكتب بدالّته بعد المادّة (والأمين لا يرى حقله).
      const calls = fresh({ status: 'ready', workspace: ws() }, handlers({
        findItemTwins: () => [],
        createItem: (fields) => ({ id: 'i-new', version: 1, archived: false, name: fields.name, nameNorm: m.searchable(fields.name), categoryId: fields.category_id, kind: fields.kind, baseUnit: fields.base_unit, density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: fields.barcode, altCodes: [] }),
      }));
      await mount('/inventory/store/w-gen');
      fire(byAction('add-item')[0], 'click');
      await settle();
      t.eq(byIdSuffix('-barcode').length, 1, 'S12: النموذج فيه الباركود');
      t.eq(byIdSuffix('-sell').length, 1, 'S12: وسعر البيع لأدوار الكلفة');
      type(byIdSuffix('-name')[0], 'نشارة خشب');
      await settle();
      type(byIdSuffix('-barcode')[0], 'SAW-9');
      await settle();
      type(byIdSuffix('-sell')[0], '1750.5');
      await settle();
      await submitForm();
      const made = calls.filter(([name]) => name === 'createItem');
      t.eq(made.length, 1, 'S12: الحفظ يكتب المادّة');
      t.eq(made[0][1][0].barcode, 'SAW-9', 'S12: بباركودها');
      t.same(calls.filter(([name]) => name === 'setItemSellPrice'), [['setItemSellPrice', ['i-new', 1_750_50n, null]]], 'S12: وسعر البيع بدالّته بالفلس، وبلا سعر سابق');
      t.ok(text().includes('تظهر في قسمها الآن برصيد صفر'), 'S12: والرسالة تقول إنّها تظهر الآن (لا بعد أوّل استلام)');
      await unmount();
    }
    {
      fresh({ status: 'ready', workspace: keeper }, handlers({ loadStoresOverview: () => overview({ canManage: false, canCreateItem: true }) }));
      await mount('/inventory/store/w-gen');
      fire(byAction('add-item')[0], 'click');
      await settle();
      t.eq(byIdSuffix('-sell').length, 0, 'S12: ودور بلا كلفة بلا حقل سعر البيع');
      await unmount();
    }

    // ── S8 وS9 وS10: تبويب المشتريات ────────────────────────────────────────────────────────────────────────
    {
      const calls = fresh({ status: 'ready', workspace: ws() }, handlers());
      await mount('/inventory/items/i-corn');
      t.same(calls.filter(([name]) => name === 'loadItemPurchases'), [['loadItemPurchases', ['i-corn', null]]], 'S10: التبويب الافتراضي المشتريات، وبلا مخزن مختار = كل المخازن');
      const page = text();
      t.ok(page.includes('PU-2026-0003') && page.includes('مورّد الحبوب') && page.includes('المخزن العامّ'), `S8: صفّ الشراء: رقم الاستلام والمورّد والمخزن (${page.slice(0, 200)})`);
      t.ok(all().some((n) => n.getAttribute('href') === '/inventory/receipts/r-1'), 'S8: ورقم الاستلام رابط لمستنده');
      t.ok(page.includes('10 كيس 50 كغم'), 'S8: والكمية كما كُتبت بوحدة التعبئة');
      t.ok(page.includes('500.000') && page.includes('300.000'), 'S8: والكمية والمتبقّي بوحدة الأساس');
      t.ok(page.includes('805.00') && page.includes('400,000') && page.includes('402,500.00'), 'S8: وسعر الوحدة ومبلغ الفاتورة والكلفة بعد التحميلات');
      t.ok(page.includes('مصحَّح'), 'S8: وعلامة تصحيح السعر الحيّ');
      t.ok(page.includes('من مورّد الحبوب') && page.includes('28/10/2026'), `S8: سطر «آخر شراء»: من مَن ومتى (${page.slice(0, 300)})`);
      t.ok(page.includes('أعلى من الشراء الذي قبله بـ105.00 (15.00%)'), `S8: ومقارنة بسعر الشراء الذي قبله (${page.slice(0, 400)})`);
      await unmount();
    }
    {
      const rows = [purchase({ money: null }), older ? purchase({ lotId: 'l-0', docNo: 'PU-2026-0001', money: null }) : null].filter(Boolean);
      fresh({ status: 'ready', workspace: keeper }, handlers({ loadItemPurchases: () => purchases(rows) }));
      await mount('/inventory/items/i-corn?wh=w-gen');
      const page = text();
      t.ok(page.includes('PU-2026-0003') && page.includes('مورّد الحبوب') && page.includes('10 كيس 50 كغم') && page.includes('500.000'), 'S9: دور بلا كلفة يرى من اشترى ومتى وبأي وحدة وكم');
      t.ok(!page.includes('805.00') && !page.includes('402,500.00') && !page.includes('سعر الوحدة') && !page.includes('مبلغ الفاتورة'), `S9: وبلا أسعار ولا أعمدة مال (${page.slice(0, 200)})`);
      await unmount();
    }

    // ── S13: بطاقة سعر البيع بمحرّرها (0014) ────────────────────────────────────────────────────────────────
    {
      const calls = fresh({ status: 'ready', workspace: ws() }, handlers());
      await mount('/inventory/items/i-corn');
      const page = text();
      t.ok(page.includes('سعر البيع الآن') && page.includes('1,750.00'), `S13: سعر البيع الحالي لوحدة الأساس (${page.slice(0, 200)})`);
      t.ok(page.includes('كلفة آخر شراء') && page.includes('805.00'), 'S13: وكلفة آخر شراء بجنبه');
      t.ok(page.includes('الربح المتوقّع 945.00 لكل كغم (117.39% من الكلفة)'), `S13: والفرق بينهما ونسبته (${page.slice(0, 400)})`);
      fire(byAction('edit-sell-price')[0], 'click');
      await settle();
      type(byIdSuffix('-sell')[0], '1900');
      await settle();
      fire(byAction('save-sell-price')[0], 'click');
      await settle();
      t.same(calls.filter(([name]) => name === 'setItemSellPrice'), [['setItemSellPrice', ['i-corn', 1_900_00n, 1_750_00n]]], 'S13: والحفظ مشروط بالسعر الذي شافته الشاشة');
      await unmount();
    }
    {
      // سعر بيع أقلّ من الكلفة: تنبيه خسارة لا ربح.
      fresh({ status: 'ready', workspace: ws() }, handlers({ loadItemPurchases: () => purchases([purchase({}), older], { item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: 700_00n } }) }));
      await mount('/inventory/items/i-corn');
      t.ok(text().includes('أقلّ من كلفتها بـ105.00 لكل كغم (13.04%)'), `S13: وسعر أقلّ من الكلفة يقول خسارتها (${text().slice(0, 300)})`);
      await unmount();
    }
    {
      fresh({ status: 'ready', workspace: ws() }, handlers({ loadItemPurchases: () => purchases([], { item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: null } }) }));
      await mount('/inventory/items/i-corn');
      t.ok(text().includes('لم يُكتب سعر بيع لهذه المادّة'), 'S13: ومادّة بلا سعر تقول ذلك');
      t.eq(byAction('edit-sell-price').length, 1, 'S13: ومعها زرّ كتابته');
      await unmount();
    }
    {
      fresh({ status: 'ready', workspace: keeper }, handlers({ loadItemPurchases: () => purchases([purchase({ money: null })], { item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: null } }) }));
      await mount('/inventory/items/i-corn');
      t.ok(!text().includes('سعر البيع'), 'S13: ودور بلا كلفة لا يرى بطاقة سعر البيع أبداً');
      await unmount();
    }

    // ── S14: دفتر المادّة بالبيان وداخل وخارج (0014) ─────────────────────────────────────────────────────────
    {
      fresh({ status: 'ready', workspace: ws() }, handlers({ loadItemLots: () => lots, loadItemLotValues: () => new Map(), loadItemMoves: () => moves }));
      await mount('/inventory/items/i-corn?wh=w-gen&tab=moves');
      const page = text();
      t.ok(page.includes('دفتر المادّة'), `S14: التبويب اسمه «دفتر المادّة» (${page.slice(0, 160)})`);
      t.ok(page.includes('البيان') && page.includes('داخل') && page.includes('خارج') && page.includes('الرصيد'), 'S14: وأعمدته مثل الكشف: التاريخ والمستند والبيان وداخل وخارج والرصيد');
      t.ok(page.includes('شراء من مورّد الحبوب') && page.includes('تحويل إلى مخزن حقل 1'), `S14: والبيان يقول من أين جاءت الحركة أو إلى أين ذهبت (${page.slice(0, 400)})`);
      t.ok(page.includes('قيمة الحركة') && page.includes('160,000.00'), 'S14: وقيمة الحركة لأدوار الكلفة');
      await unmount();
    }

    // ── دوالّ صافية: الأقسام ومجموعها، والمقارنة، والنوع المقترح، والتبويب بالرابط ──────────────────────────────
    t.same(m.sectionsOf(board.rows, org.itemCategories).map((s) => [s.name, s.rows.length]), [['مواد الأكل', 4], ['دون تصنيف', 1]], 'sectionsOf: بترتيب التصنيفات و«دون تصنيف» أخيراً');
    // تصنيف ما وصل بقائمة التصنيفات (مؤرشف أو جديد): قسمه باسمه الواصل مع الصفّ، و«دون تصنيف» أخيراً دائماً.
    t.same(m.sectionsOf(board.rows, []).map((s) => [s.name, s.rows.length]), [['مواد الأكل', 4], ['دون تصنيف', 1]], 'sectionsOf: تصنيف ما وصل بالقائمة باقٍ قسماً باسمه، و«دون تصنيف» أخيراً');
    t.eq(m.sectionValue(board.rows.slice(0, 2)), 360_000_00n, 'sectionValue: مجموع قيمة المعروض');
    t.eq(m.sectionValue(board.rows.map((row) => ({ ...row, money: null }))), null, 'sectionValue: بلا مال = null (دور بلا كلفة)');
    t.eq(m.sectionValue([board.rows[0], { ...board.rows[1], money: null }]), null, 'sectionValue: قيمة ناقصة لمادّة = null، مو مجموع ناقص');
    t.same(m.comparePrices([purchase({}), older]), { kind: 'up', diff: 105_00n, base: 700_00n }, 'comparePrices: أعلى بالفرق');
    t.same(m.comparePrices([older, purchase({})]), { kind: 'down', diff: 105_00n, base: 805_00n }, 'comparePrices: وأقلّ');
    t.same(m.comparePrices([purchase({}), purchase({ lotId: 'l-2' })]), { kind: 'same' }, 'comparePrices: السعر نفسه');
    t.eq(m.comparePrices([purchase({})]), null, 'comparePrices: شراء واحد بلا مقارنة');
    t.eq(m.comparePrices([purchase({ money: null }), purchase({ lotId: 'l-2', money: null })]), null, 'comparePrices: بلا كلفة بلا مقارنة');
    t.eq(m.packQty({ qtyInUnit: 10_500n, unitLabel: 'كيس' }), '10.5 كيس', 'packQty: الكمية بوحدة التعبئة بمراتبها المعنوية');
    t.same([m.suggestedKind('raw'), m.suggestedKind('medicine'), m.suggestedKind('chick'), m.suggestedKind('general')], ['raw', 'medicine', 'chick', 'other'], 'suggestedKind: النوع المقترح من نوع المخزن');
    t.same([m.tabOf(null), m.tabOf('lots'), m.tabOf('moves'), m.tabOf('x')], ['purchases', 'lots', 'moves', 'purchases'], 'tabOf: التبويب من الرابط، وغير المعروف = المشتريات');
    t.same([m.cardParams('w-1', 'purchases'), m.cardParams('w-1', 'moves'), m.cardParams('', 'lots')], [{ wh: 'w-1' }, { wh: 'w-1', tab: 'moves' }, { tab: 'lots' }], 'cardParams: المخزن والتبويب بالرابط');
  } finally {
    delete globalThis.__stores;
    restore();
  }
}
