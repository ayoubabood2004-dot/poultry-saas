// قارئا 0013 بـrepo الحقيقي على خادم PostgREST مزيّف (نفس طريقة count-merge): loadItemPurchases وloadStoresOverview
// وloadItemCategoryMap من src/lib/repo/inventory.ts كما هي (call وsend وauthed وpostgrest-js الحقيقي)، فالوسائط وأسماء
// المفاتيح والمراتب تنفحص على السلك نفسه كما بعقد الهجرة. كل حالة تفشل على الشفرة بلا إصلاحها:
// P1 وسائط item_purchases (المادّة والمخزن والمؤشّر والحدّ)؛ P2 قراءة الصفّ: الكميات بثلاث مراتب والمعامل بستّ، والمال
// بالفلس (الفاتورة بالدينار الصحيح)؛ P3 بلا money (دور بلا كلفة) الصفّ يبقى كاملاً وmoney = null؛ P4 المؤشّر يرجع للخادم
// كما جاء (received_on وseq وid) والمجموع بأوّل صفحة بس؛ P5 جواب بشكل غلط يرمي RowShapeError مو يُقبل بصمت؛
// P6 stores_overview: الحكمان والمواقع والتنبيهات وقيمة المتاح، وmoney الغايبة = null؛ P7 بلا مخزن = p_warehouse فارغ؛
// P8 loadItemCategoryMap يقرا الفعّالة بصفحات بالمعرّف ويكمل لحد ما تنتهي.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__purchaseServer.fetch(...a) });
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' }, access_token: 'a' } }, error: null }), refreshSession: async () => ({ data: { session: {} }, error: null }) },
    from: (table) => rest.from(table),
    rpc: (fn, args) => rest.rpc(fn, args),
  };
}
export const STORED_SESSION = /^sb-.+-auth-token$/;
export function addAuthListener() { return () => {}; }
export async function dropClient() {}
`;

async function bundle() {
  const result = await build({
    stdin: {
      contents: [
        "export { loadItemPurchases, loadStoresOverview, loadItemCategoryMap, parseItemPurchases, parseStoresOverview, RowShapeError } from './src/lib/repo/inventory.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [
      {
        name: 'purchase-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'purchase-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'purchase-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** خادم مزيّف: POST /rpc/<fn> يرجّع ما انحُضّر له، وGET /items يرجّع صفحة بحسب فلتر id. */
function fakeServer() {
  const server = {
    rpc: {},
    itemPages: [],
    requests: [],
    async fetch(url, init) {
      const u = new URL(String(url));
      const body = init.body ? JSON.parse(init.body) : null;
      server.requests.push({ method: init.method, path: u.pathname, query: decodeURIComponent(u.search), body });
      const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = u.pathname.slice('/rest/v1/rpc/'.length);
        const answer = server.rpc[fn];
        if (answer === undefined) return new Response(JSON.stringify({ code: '42883', message: 'no function' }), { status: 404, headers: { 'content-type': 'application/json' } });
        return json(answer);
      }
      if (u.pathname === '/rest/v1/items') return json(server.itemPages.shift() ?? []);
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    },
  };
  globalThis.__purchaseServer = server;
  return server;
}

const ROW = {
  lot_id: 'l-1',
  received_on: '2026-10-28',
  doc_id: 'r-1',
  doc_no: 'PU-2026-0003',
  party_id: 'p-1',
  party_name: 'مورّد الحبوب',
  warehouse_id: 'w-gen',
  warehouse_name: 'المخزن العامّ',
  line_id: 'rl-1',
  qty_in: '500.000',
  qty_left: '300.000',
  qty_in_unit: '10.000',
  unit_label: 'كيس 50 كغم',
  unit_code: null,
  factor: '50.000000',
  base_unit: 'kg',
  supplier_lot_no: 'L-77',
  expiry_on: null,
  money: { invoice_total: '400000', landed_value: '402500.00', unit_cost: '805.00', corrected: true },
};
const ITEM = { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', tracks_expiry: false, min_qty: '1000.000', archived: false };
const STORE = {
  id: 'w-gen',
  name: 'المخزن العامّ',
  kind: 'general',
  site_id: 's-store',
  site_name: 'مخزن المشروع',
  site_kind: 'store',
  division_id: 'd-gen',
  division_kind: 'general',
  items_count: 3,
  below_minimum: 1,
  near_expiry: 0,
  expired: 2,
  money: { stock_value: '402500.00' },
};

export default async function (t) {
  const m = await bundle();
  const server = fakeServer();
  try {
    // ── P1 وP2 وP4: الوسائط وقراءة الصفّ والمؤشّر ─────────────────────────────────────────────────────────────
    server.rpc.item_purchases = {
      item: ITEM,
      warehouse: { id: 'w-gen', name: 'المخزن العامّ', kind: 'general' },
      today: '2026-11-02',
      rows: [ROW],
      next: { received_on: '2026-10-28', seq: '41', id: 'l-1' },
      total: 7,
    };
    const page = await m.loadItemPurchases('i-corn', 'w-gen');
    const sent = server.requests.at(-1);
    t.same(sent.body, { p_item: 'i-corn', p_warehouse: 'w-gen', p_after: null, p_limit: 100 }, 'P1: وسائط item_purchases بأسمائها، والصفحة الأولى بلا مؤشّر');
    t.eq(sent.path, '/rest/v1/rpc/item_purchases', 'P1: ونداء الدالّة باسمها');
    const row = page.rows[0];
    t.same([row.qtyIn, row.qtyLeft, row.qtyInUnit], [500_000n, 300_000n, 10_000n], 'P2: الكميات بالآلاف من نصوصها العشرية');
    t.eq(row.factor, 50_000_000n, 'P2: والمعامل بستّ مراتب');
    t.same([row.money.invoiceTotal, row.money.landedValue, row.money.unitCost], [40_000_000n, 40_250_000n, 80_500n], 'P2: والمال بالفلس (الفاتورة بالدينار الصحيح والباقي بمرتبتين)');
    t.same([row.docNo, row.partyName, row.warehouseName, row.unitLabel, row.supplierLotNo, row.baseUnit], ['PU-2026-0003', 'مورّد الحبوب', 'المخزن العامّ', 'كيس 50 كغم', 'L-77', 'kg'], 'P2: ومن اشترى وبأي وحدة ولقطة وحدة الأساس');
    t.eq(row.money.corrected, true, 'P2: وعلامة تصحيح السعر الحيّ');
    t.same([page.item.name, page.item.minQty, page.warehouse.name, page.today, page.total], ['ذرة صفراء', 1_000_000n, 'المخزن العامّ', '2026-11-02', 7], 'P4: المادّة والمخزن واليوم والمجموع');
    t.same(page.next, { receivedOn: '2026-10-28', seq: 41n, id: 'l-1' }, 'P4: والمؤشّر مقروءاً');
    await m.loadItemPurchases('i-corn', 'w-gen', page.next);
    t.same(server.requests.at(-1).body, { p_item: 'i-corn', p_warehouse: 'w-gen', p_after: { received_on: '2026-10-28', seq: '41', id: 'l-1' }, p_limit: 100 }, 'P4: والصفحة الجاية ترجّع المؤشّر كما جاء من الخادم');

    // ── P7: بلا مخزن = كل مخازن النطاق ────────────────────────────────────────────────────────────────────────
    await m.loadItemPurchases('i-corn');
    t.eq(server.requests.at(-1).body.p_warehouse, null, 'P7: بلا مخزن p_warehouse فارغ (كل مخازن النطاق)');

    // ── P3: بلا money (دور بلا كلفة) ─────────────────────────────────────────────────────────────────────────
    const bare = Object.fromEntries(Object.entries(ROW).filter(([key]) => key !== 'money'));
    const masked = m.parseItemPurchases({ item: ITEM, warehouse: null, today: '2026-11-02', rows: [bare], next: null, total: 1 });
    t.eq(masked.rows[0].money, null, 'P3: money الغايبة = null، ولا يرمي');
    t.same([masked.rows[0].partyName, masked.rows[0].qtyIn, masked.rows[0].unitLabel, masked.rows[0].qtyLeft], ['مورّد الحبوب', 500_000n, 'كيس 50 كغم', 300_000n], 'P3: والصفّ يبقى بمن ومتى وبأي وحدة وكم بقي');
    t.eq(masked.warehouse, null, 'P3: ومخزن فارغ = كل المخازن');
    t.eq(masked.total, 1, 'P3: والمجموع كما جاء');

    // ── P5: جواب بشكل غلط يرمي ───────────────────────────────────────────────────────────────────────────────
    const bad = (mutate) => {
      const json = { item: ITEM, warehouse: null, today: '2026-11-02', rows: [{ ...ROW }], next: null, total: 1 };
      mutate(json);
      return () => m.parseItemPurchases(json);
    };
    t.throws(bad((json) => delete json.rows[0].doc_no), 'P5: رقم استلام ناقص يرمي');
    t.throws(bad((json) => (json.rows[0].qty_in = '500.0001')), 'P5: وكمية بمراتب أكثر من ثلاث ترمي، لا تُقرّب بصمت');
    t.throws(bad((json) => (json.rows[0].base_unit = 'ton')), 'P5: ووحدة أساس مجهولة ترمي');
    t.throws(bad((json) => (json.rows[0].money.corrected = 'yes')), 'P5: وعلامة تصحيح مو boolean ترمي');
    t.throws(bad((json) => delete json.today), 'P5: ويوم الخادم الناقص يرمي');
    t.throws(() => m.parseItemPurchases({ item: ITEM, warehouse: null, today: '2026-11-02', rows: [{ ...ROW }], next: { received_on: '2026-10-28', id: 'l-1' }, total: 1 }), 'P5: ومؤشّر بلا seq يرمي');

    // ── P6: stores_overview ──────────────────────────────────────────────────────────────────────────────────
    server.rpc.stores_overview = {
      today: '2026-11-02',
      can_manage: true,
      can_create_item: true,
      rows: [STORE],
      sites: [{ id: 's-store', name: 'مخزن المشروع', kind: 'store', division_id: 'd-gen', division_kind: 'general' }],
    };
    const overview = await m.loadStoresOverview();
    t.same(server.requests.at(-1).body, {}, 'P6: stores_overview بلا وسائط');
    t.same([overview.canManage, overview.canCreateItem, overview.today], [true, true, '2026-11-02'], 'P6: الحكمان ويوم الخادم');
    const store = overview.rows[0];
    t.same([store.name, store.siteName, store.siteKind, store.divisionKind, store.kind], ['المخزن العامّ', 'مخزن المشروع', 'store', 'general', 'general'], 'P6: اسم المخزن وموقعه ووحدته ونوعه');
    t.same([store.itemsCount, store.belowMinimum, store.nearExpiry, store.expired], [3, 1, 0, 2], 'P6: وعدد المواد وتنبيهاتها');
    t.eq(store.stockValue, 40_250_000n, 'P6: وقيمة المتاح بالفلس');
    t.same(overview.sites.map((s) => [s.id, s.name, s.divisionId]), [['s-store', 'مخزن المشروع', 'd-gen']], 'P6: ومواقع النطاق لنافذة «أضف مخزناً»');
    const noMoney = Object.fromEntries(Object.entries(STORE).filter(([key]) => key !== 'money'));
    const maskedStores = m.parseStoresOverview({ today: '2026-11-02', can_manage: false, can_create_item: true, rows: [noMoney], sites: [] });
    t.eq(maskedStores.rows[0].stockValue, null, 'P6: وmoney الغايبة = null لدور بلا كلفة');
    t.same([maskedStores.canManage, maskedStores.sites.length], [false, 0], 'P6: وبلا مواقع = «أضف الموقع أوّلاً»');
    t.throws(() => m.parseStoresOverview({ today: '2026-11-02', can_manage: true, can_create_item: true, rows: [{ ...STORE, items_count: -1 }], sites: [] }), 'P6: وعدد سالب يرمي');
    t.throws(() => m.parseStoresOverview({ today: '2026-11-02', can_create_item: true, rows: [], sites: [] }), 'P6: وحكم ناقص يرمي');

    // ── P8: تصنيف كل مادّة بصفحات بالمعرّف ───────────────────────────────────────────────────────────────────
    const many = Array.from({ length: 1000 }, (_value, index) => ({ id: `i-${String(index).padStart(4, '0')}`, category_id: index % 2 === 0 ? 'c-feed' : null }));
    server.itemPages = [many, [{ id: 'i-last', category_id: 'c-med' }]];
    const map = await m.loadItemCategoryMap();
    t.eq(map.size, 1001, 'P8: كل المواد من الصفحتين');
    t.same([map.get('i-0000'), map.get('i-0001'), map.get('i-last')], ['c-feed', null, 'c-med'], 'P8: والتصنيف لكل مادّة (والفارغ null)');
    const reads = server.requests.filter((request) => request.path === '/rest/v1/items');
    t.eq(reads.length, 2, 'P8: صفحة ثانية لمّا الأولى امتلأت، ووقوف بعد صفحة ناقصة');
    t.ok(reads[0].query.includes('archived_at=is.null') && reads[0].query.includes('select=id,category_id') && reads[0].query.includes('limit=1000'), `P8: والقراءة عمودين للفعّالة بس (${reads[0].query})`);
    t.ok(reads[1].query.includes('id=gt.i-0999'), `P8: والصفحة الثانية بعد آخر معرّف (${reads[1].query})`);
    server.itemPages = [[]];
    t.eq((await m.loadItemCategoryMap()).size, 0, 'P8: ومنشأة بلا مواد خريطة فارغة، لا دوران');
  } finally {
    delete globalThis.__purchaseServer;
  }
}
