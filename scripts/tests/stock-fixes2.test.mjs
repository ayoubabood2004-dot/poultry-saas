// شاشات المادّة والمصاريف في الجولة الثانية من إصلاحات المعمل v2 (القسم «ج» من مواصفتها): react-dom/client الحقيقي على DOM صغير
// (dom.mjs). كلّ حالة بحالها، والإصلاح بحالة تفشل على الشفرة قبله (الالتزام 203bacb):
// C1 (ج١، الملاحظة #9) بطاقة المادّة: السعران المحفوظان (البيع والكلفة) يبقيان بعد تبديل التبويب ذهاباً وإياباً، والتعديل التالي
//    يُرسل السعر الجديد سعراً سابقاً فيقبله الخادم — البديل يحاكي set_item_sell_price وset_item_cost_price (price_changed إن خالف
//    السابق ما في الخادم)، وloadItemPurchases يقرأ ما في الخادم؛ وتغيير المخزن قراءة جديدة تغلب المحفوظ. على 203bacb كان السعر
//    القديم يرجع بعد التبديل والتعديل التالي يُرفض.
// C2 (ج٢، ق٢٥، الملاحظتان #7 و#15) أمين نطاقه مخزن العلف وحده يصل من كلّ رابط دفعة في بطاقة المادّة (آخر دفعة فوق التبويبات،
//    و«صُنعت بدفعة» في الوجبات، ومستند الحركة في الدفتر) إلى صفحة الدفعة الحقيقية (MillRoutes)، والبديل يرسل جواب production_detail
//    بشكله الجديد (scope وexpenses_visible، بلا مال) عبر parseBatch الحقيقي؛ ومن الصفحة لا رابط إلى دفتر مخزن المواد الذي لا يُفتح
//    له (ب٣)، و«افتح وجبات العلف في مخزنه» يرجع إلى البطاقة. والمدير ضابط: رابط دفتر مخزن المواد له.
// C3 (ج٣، ق٢٦) رفض category_name_taken في «إعدادات المنشأة» يظهر بتلميح الخادم في نافذة «فئة مصروف جديدة» وفي نافذة تغيير الاسم،
//    والنافذة والنصّ المكتوب باقيان: repo المخزون الحقيقي (createExpenseCategory وrename) وcore الحقيقي على عميل postgrest-js بخادم
//    مزيّف يرجّع رفض المحفّز (P0001 برمزه وتلميحه) بالاسم المطبَّع (searchable، مرآة private.searchable)؛ فالعرض العامّ للرفض يكفي
//    بلا تغيير في الشاشة.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const DEFINE = { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' };

// ─── حزمة الشاشات (C1 وC2): StockRoutes وMillRoutes الحقيقيتان، وrepo المخزون والمعمل والجلسة والرسائل بدائل ───────────────
const INVENTORY = ['loadOrgSetup', 'loadItemPurchases', 'loadItemLots', 'loadItemLotValues', 'loadItemMoves', 'listItemUnits', 'loadItem', 'setItemSellPrice', 'setItemCostPrice'];
const MILL = ['loadBatch', 'previewProduction', 'loadExpenseCategories'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__c.call('${n}', a);`).join(' ')}`;
const SCREEN_STUBS = {
  inventory: routed('inventory', INVENTORY),
  mill: routed('mill', MILL),
  counts: `export * from ${real('counts')}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  session: 'export const useSession = () => globalThis.__c.session; export const sessionStore = { get: () => globalThis.__c?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__c.toasts.push(spec); }; export function Toaster() { return null; }',
};
const screenStubs = {
  name: 'stock-fixes2-screens',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|mill|counts)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'c-screen' }));
    b.onLoad({ filter: /.*/, namespace: 'c-screen' }, (args) => ({ contents: SCREEN_STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

// ─── حزمة الإعدادات (C3): OrgSettingsPage الحقيقية، وrepo المخزون الحقيقي إلّا قراءة الإعداد، وcore الحقيقي على عميل مزيّف ──────
const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__c3.fetch(...a) });
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
const SETTINGS_STUBS = {
  inventory: `export * from ${real('inventory')}; export const loadOrgSetup = () => Promise.resolve(globalThis.__c3.loadOrgSetup());`,
  session: 'export const useSession = () => globalThis.__c3.session; export const sessionStore = { get: () => globalThis.__c3?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__c3.toasts.push(spec); }; export function Toaster() { return null; }',
};
const settingsStubs = {
  name: 'stock-fixes2-settings',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/inventory$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'c-settings' }));
    b.onLoad({ filter: /.*/, namespace: 'c-settings' }, (args) => ({ contents: SETTINGS_STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
    b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('/src/lib/repo/') ? { path: 'client', namespace: 'c-client' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'c-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundleOf(entry, plugins) {
  const result = await build({
    stdin: { contents: entry.join('\n'), resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: DEFINE,
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
/** نقرة رابط كما يعالجها react-router (الزرّ الأيسر). */
const follow = async (node) => {
  await click(node, { button: 0 });
  await settle();
};
/** زرّ تبويب بطاقة المادّة باسمه (Segmented: role=radio). */
const tab = (label) => all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === label);
/** نصّ بطاقة السعر باسمها (section بـaria-label)، فلا يختلط بأرقام الصفحة الأخرى. */
const card = (label) => all().find((n) => n.localName === 'section' && n.getAttribute('aria-label') === label)?.textContent ?? '';
/** روابط الصفحة إلى مخزن بعينه. */
const linksTo = (warehouseId) => all().filter((n) => n.localName === 'a' && (n.getAttribute('href') ?? '').includes(`wh=${warehouseId}`)).map((n) => n.getAttribute('href'));

// تلميحا price_changed كما في 0016 (set_item_sell_price وset_item_cost_price).
const SELL_CHANGED = 'تغيّر سعر البيع من نافذة أو جهاز آخر بعد أن بدأت تعديله. حدّث الشاشة ثمّ أعِد الكتابة.';
const COST_CHANGED = 'تغيّر سعر الكلفة من نافذة أو جهاز آخر بعد أن بدأت تعديله. حدّث الشاشة ثمّ أعِد الكتابة.';

export default async function (t) {
  const restore = installDom();
  // core يقرأ navigator.onLine لحظة الإرسال (C3)؛ يرجع كما كان بعد الملف (الفحوص بعملية واحدة).
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'node' }, configurable: true, writable: true });
  let root = null;
  const unmount = async () => {
    if (!root) return;
    const mounted = root;
    root = null;
    mounted.flushSync(() => mounted.root.unmount());
    body().textContent = '';
    await settle();
  };
  // كل حالة لحالها: رمية بحالة (زرّ غير موجود في الشفرة القديمة) تُحسب فشلها ولا توقف ما بعدها.
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      // رسالة الرمية وحدها: سطور المكدّس تحمل الحزمة كلّها برابط data.
      t.ok(false, `${name}: رمى ${error?.name ?? ''} ${error?.message ?? error}`);
    }
    await unmount();
  };
  try {
    const m = await bundleOf(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
        "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
        "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
        "export { parseBatch } from './src/lib/repo/mill.ts';",
        "export { searchable } from './src/domain/normalize.ts';",
        "export { RejectedError } from './src/lib/errors.ts';",
      ],
      [screenStubs],
    );

    const ws = (role, over = {}) => ({
      userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [],
      divisions: ['feed_mill', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: role === 'accountant', canSeeSales: false,
      invites: [], subscription: 'active', confirmedAt: 1, ...over,
    });
    // أمين نطاقه مخزن العلف وحده (add_member_v2 بـwarehouses [مخزن العلف]): لا مخزن المواد ولا وحدته.
    const feedKeeper = ws('storekeeper', { scopes: [{ warehouseId: 'w-feed' }] });
    const org = {
      divisions: [
        { id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true },
        { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
      ],
      sites: [], packTypes: [], expenseCategories: [], itemCategories: [],
      warehouses: [
        { id: 'w-raw', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', kind: 'raw', hasBalance: false },
        { id: 'w-feed', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن العلف', kind: 'feed', hasBalance: false },
        { id: 'w-gen', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-gen', name: 'المخزن العامّ', kind: 'general', hasBalance: false },
      ],
    };
    const item = (id, name, kind, over = {}) => ({ id, version: 1, archived: false, name, nameNorm: m.searchable(name), categoryId: null, kind, baseUnit: 'kg', density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [], ...over });
    const purchases = (itemOver = {}) => ({
      item: { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, archived: false, sellPrice: 600_00n, costPrice: 450_00n, ...itemOver },
      warehouse: null, today: '2026-11-04', next: null, total: 1, lastProduction: null,
      rows: [{
        lotId: 'l-1', receivedOn: '2026-10-28', docId: 'r-1', docNo: 'PU-2026-0003', partyId: 'p-1', partyName: 'مورّد الحبوب', warehouseId: 'w-raw', warehouseName: 'مخزن المواد الأوّلية',
        lineId: 'rl-1', qtyIn: 500_000n, qtyLeft: 300_000n, qtyInUnit: 500_000n, unitLabel: 'كغم', unitCode: null, factor: 1_000_000n, baseUnit: 'kg', supplierLotNo: null, expiryOn: null,
        money: { invoiceTotal: 250_000_00n, landedValue: 250_000_00n, unitCost: 500_00n, corrected: false },
      }],
    });

    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__c = {
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

    let where = null;
    function Probe() {
      where = m.useLocation();
      return null;
    }
    // المساران كما في App.tsx: المخزون تحت ‎/inventory والمعمل تحت ‎/mill، فالرابط من بطاقة المادّة يفتح صفحة الدفعة الحقيقية.
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = { root: m.createRoot(container), flushSync: m.flushSync };
      m.flushSync(() =>
        root.root.render(
          m.h(
            m.MemoryRouter,
            { initialEntries: [url] },
            m.h(Probe),
            m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }), m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) })),
          ),
        ),
      );
      await settle();
      await settle();
    };

    // ── C1 (ج١، الملاحظة #9): السعران المحفوظان يبقيان بعد تبديل التبويب، والتعديل التالي يُرسل الجديد سعراً سابقاً ──────────────
    await step('C1', async () => {
      const server = { sell: 600_00n, cost: 450_00n };
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, {
        loadOrgSetup: () => org,
        loadItem: () => item('i-corn', 'ذرة صفراء', 'raw'),
        listItemUnits: () => [],
        // القارئ يرجّع ما في الخادم الآن؛ والدالّتان مشروطتان بالسعر السابق كما في القاعدة.
        loadItemPurchases: () => purchases({ sellPrice: server.sell, costPrice: server.cost }),
        setItemSellPrice: (_id, price, previous) => {
          if (previous !== server.sell) throw new m.RejectedError('price_changed', SELL_CHANGED);
          server.sell = price;
          return price;
        },
        setItemCostPrice: (_id, price, previous) => {
          if (previous !== server.cost) throw new m.RejectedError('price_changed', COST_CHANGED);
          server.cost = price;
          return price;
        },
      });
      await mount('/inventory/items/i-corn/details');
      t.ok(card('سعر البيع').includes('600.00') && card('سعر الكلفة').includes('450.00'), `C1: ضابط: البطاقتان بسعري الخادم (${card('سعر البيع')} | ${card('سعر الكلفة')})`);

      // سعر البيع: يُحفظ 650، ثمّ «دفتر المادّة»، ثمّ «المشتريات».
      await click(byAction('edit-sell-price')[0]);
      type(byIdSuffix('-sell')[0], '650');
      await settle();
      await click(byAction('save-sell-price')[0]);
      t.same(named(calls, 'setItemSellPrice'), [['i-corn', 650_00n, 600_00n]], 'C1: سعر البيع حُفظ مشروطاً بما رأته الشاشة');
      await click(tab('دفتر المادّة'));
      t.eq(card('سعر البيع'), '', 'C1: ضابط: تبويب الدفتر يُزيل بطاقة السعر من الشاشة');
      await click(tab('المشتريات'));
      t.ok(card('سعر البيع').includes('650.00') && !card('سعر البيع').includes('600.00'), `C1: بعد التبديل ذهاباً وإياباً يبقى سعر البيع المحفوظ 650.00 (كان يرجع 600.00) (${card('سعر البيع')})`);
      await click(byAction('edit-sell-price')[0]);
      t.eq(byIdSuffix('-sell')[0]?.value, '650.00', 'C1: والمحرّر يبدأ من السعر المحفوظ');
      type(byIdSuffix('-sell')[0], '700');
      await settle();
      await click(byAction('save-sell-price')[0]);
      t.same(named(calls, 'setItemSellPrice').at(-1), ['i-corn', 700_00n, 650_00n], 'C1: والتعديل التالي يُرسل السعر المحفوظ سعراً سابقاً');
      t.ok(server.sell === 700_00n && card('سعر البيع').includes('700.00') && !text().includes(SELL_CHANGED), `C1: فيقبله الخادم بلا «تغيّر من نافذة أو جهاز آخر» (${card('سعر البيع')})`);

      // سعر الكلفة: يُحفظ 475.50، ثمّ «الوجبات المتبقّية»، ثمّ «المشتريات».
      await click(byAction('edit-cost-price')[0]);
      type(byIdSuffix('-cost')[0], '475.5');
      await settle();
      await click(byAction('save-cost-price')[0]);
      t.same(named(calls, 'setItemCostPrice'), [['i-corn', 475_50n, 450_00n]], 'C1: سعر الكلفة حُفظ مشروطاً بما رأته الشاشة');
      await click(tab('الوجبات المتبقّية'));
      await click(tab('المشتريات'));
      t.ok(card('سعر الكلفة').includes('475.50') && !card('سعر الكلفة').includes('450.00'), `C1: وسعر الكلفة المحفوظ يبقى بعد التبديل (${card('سعر الكلفة')})`);
      t.ok(card('سعر البيع').includes('700.00'), 'C1: ومعه سعر البيع المحفوظ قبله (حفظ سعر لا يمسح الآخر)');
      await click(byAction('edit-cost-price')[0]);
      type(byIdSuffix('-cost')[0], '480');
      await settle();
      await click(byAction('save-cost-price')[0]);
      t.same(named(calls, 'setItemCostPrice').at(-1), ['i-corn', 480_00n, 475_50n], 'C1: والتعديل التالي لسعر الكلفة يُرسل المحفوظ سعراً سابقاً');
      t.ok(server.cost === 480_00n && !text().includes(COST_CHANGED), 'C1: فيقبله الخادم');
      t.eq(named(calls, 'loadItemPurchases').length, 1, 'C1: ضابط: السعر الباقي من جواب الحفظ لا من قراءة ثانية');

      // قراءة جديدة (مخزن آخر) تأتي بما في الخادم فتغلب المحفوظ: جهاز آخر غيّر سعر البيع بعد آخر حفظ هنا.
      server.sell = 720_00n;
      choose(byAction('pick-store')[0], 'w-raw');
      await settle();
      await settle();
      t.same(named(calls, 'loadItemPurchases').at(-1), ['i-corn', 'w-raw'], 'C1: ضابط: تغيير المخزن قراءة جديدة');
      t.ok(card('سعر البيع').includes('720.00') && !card('سعر البيع').includes('700.00'), `C1: ضابط: والقراءة الجديدة تغلب المحفوظ من قراءة قبلها (${card('سعر البيع')})`);
    });

    // ── C2 (ج٢، ق٢٥): أمين مخزن العلف وحده يصل من كلّ رابط دفعة في بطاقة المادّة إلى صفحة الدفعة ──────────────────────────────
    const made = { batchId: 'pb-1', docNo: 'PD-2026-0001', producedOn: '2026-11-03', qtyKg: 2_000_000n, warehouseName: 'مخزن العلف' };
    const feedBuys = { ...purchases({ id: 'f-1', name: 'علف بياض', kind: 'feed', sellPrice: null, costPrice: null }), rows: [], total: 0, lastProduction: made };
    const feedLots = {
      item: { id: 'f-1', name: 'علف بياض', kind: 'feed', baseUnit: 'kg', tracksExpiry: false, minQty: null, density: null, pieceMassKg: null, archived: false },
      rows: [{ lotId: 'l-p', qtyLeft: 2_000_000n, receivedOn: '2026-11-03', rootReceivedOn: '2026-11-03', ageDays: 1, bornAt: null, ageHours: null, expiryOn: null, expired: false, nearExpiry: false, sourceKind: 'production', sourceId: 'pb-1', source: 'PD-2026-0001', supplierLotNo: null }],
      next: null, total: 1,
    };
    const feedMoves = {
      rows: [{ moveId: 'mv-1', seq: 1n, movedOn: '2026-11-03', docKind: 'production', docId: 'pb-1', doc: 'PD-2026-0001', memo: 'إنتاج بدفعة PD-2026-0001', qty: 2_000_000n, running: 2_000_000n, lotId: 'l-p', reversesMoveId: null, reversed: false, money: null }],
      next: null, total: 1,
    };
    /** جواب production_detail كما يرسله 0016 بعد ق٢٥ (scope وexpenses_visible على الجذر، والمال يشيله القناع لغير أدوار الكلفة). */
    const batchJson = (scope, money) => ({
      id: 'pb-1', doc_no: 'PD-2026-0001', status: 'posted', version: 4, produced_on: '2026-11-03', planned_kg: '2000.000',
      output_qty_kg: '2000.000', output_expiry_on: null, input_mass_kg: '2010.000', shrink_kg: '10.000', shrink_pct: '0.50', shrink_reason: null,
      note: null, void_reason: null, costs_confirmed: true, scope, expenses_visible: money,
      saved_to_recipe: false,
      recipe: { id: 'r-1', name: 'علف بياض', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
      output_item: { id: 'f-1', name: 'علف بياض', base_unit: 'kg', tracks_expiry: false },
      input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
      output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
      lines: [
        {
          id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '2000.000', actual_qty: '2010.000', used_qty: '2010.000',
          in_basis: true, is_substitute: false, reason: null, replaced_item_name: null,
          draws: [{ lot_id: 'lot-1', qty: '2010.000', received_on: '2026-10-28', source: 'PU-2026-0003' }],
          ...(money ? { money: { value: '1005000.00' } } : {}),
        },
        // كاز لم يُستعمل (الفعلي صفر): بلا وجبات، فخانته «دفتر المادّة» في مخزن المواد — رابطاً لمن يفتحه وحده.
        {
          id: 'in-2', line_no: 2, item_id: 'i-gas', item_name: 'كاز', base_unit: 'L', planned_qty: '4.000', actual_qty: '0.000', used_qty: '0',
          in_basis: false, is_substitute: false, reason: null, replaced_item_name: null, draws: [],
          ...(money ? { money: { value: null } } : {}),
        },
      ],
      ...(money ? { money: { input_value: '1005000.00', extra_value: '0.00', total_value: '1005000.00', cost_per_kg: '502.50', costs: [] } } : {}),
    });
    const millHandlers = (scope, money) => ({
      loadOrgSetup: () => org,
      loadItem: () => item('f-1', 'علف بياض', 'feed'),
      loadItemPurchases: () => feedBuys,
      loadItemLots: () => feedLots,
      loadItemLotValues: () => new Map(),
      loadItemMoves: () => feedMoves,
      listItemUnits: () => [],
      // الدفعة تُقرأ من طرفيها (ق٢٥)، وscope يقول أيّهما في نطاق القارئ؛ والمحلّل الحقيقي يقرأ الجواب.
      loadBatch: (id) => {
        if (!scope.input && !scope.output) throw new m.RejectedError('out_of_scope', 'مخزنا هذه الدفعة (مخزن المواد ومخزن العلف) خارج نطاقك.');
        return m.parseBatch({ ...batchJson(scope, money), id });
      },
      // المعاينة بنطاق مخزن المدخلات وحده.
      previewProduction: () => {
        if (!scope.input) throw new m.RejectedError('out_of_scope', 'مخزن مدخلات هذه الدفعة خارج نطاقك.');
        return new Promise(() => {});
      },
      loadExpenseCategories: () => [],
    });
    const reached = (from) => {
      t.eq(where?.pathname, '/mill/batch/pb-1', `C2: من ${from}: الرابط يفتح صفحة الدفعة`);
      t.ok(text().includes('دفعة «علف بياض»') && text().includes('PD-2026-0001') && text().includes('دخل الناتج'), `C2: من ${from}: والصفحة تعرض الدفعة المرحَّلة (${text().slice(0, 300)})`);
      t.ok(!text().includes('تعذّر تحميل'), `C2: من ${from}: لا «تعذّر تحميل دفعة الإنتاج»`);
    };

    await step('C2-last', async () => {
      fresh({ status: 'ready', workspace: feedKeeper }, millHandlers({ input: false, output: true }, false));
      await mount('/inventory/items/f-1/details?wh=w-feed');
      const last = byAction('open-last-production');
      t.same(last.map((n) => n.getAttribute('href')), ['/mill/batch/pb-1'], `C2: «آخر دفعة» فوق التبويبات رابط لأمين مخزن العلف (${text().slice(0, 300)})`);
      await follow(last[0]);
      reached('«آخر دفعة»');
    });
    await step('C2-lots', async () => {
      fresh({ status: 'ready', workspace: feedKeeper }, millHandlers({ input: false, output: true }, false));
      await mount('/inventory/items/f-1/details?wh=w-feed&tab=lots');
      const lot = byAction('open-production');
      t.same(lot.map((n) => [n.textContent, n.getAttribute('href')]), [['صُنعت بدفعة PD-2026-0001', '/mill/batch/pb-1']], 'C2: «صُنعت بدفعة» في الوجبات رابط');
      await follow(lot[0]);
      reached('«صُنعت بدفعة» في الوجبات');
    });
    await step('C2-moves', async () => {
      const calls = fresh({ status: 'ready', workspace: feedKeeper }, millHandlers({ input: false, output: true }, false));
      await mount('/inventory/items/f-1/details?wh=w-feed&tab=moves');
      const doc = byAction('open-move-doc');
      t.same(doc.map((n) => n.getAttribute('href')), ['/mill/batch/pb-1'], 'C2: مستند حركة الإنتاج في الدفتر رابط');
      await follow(doc[0]);
      reached('مستند الحركة في الدفتر');
      t.same(linksTo('w-raw'), [], 'C2: ومن صفحة الدفعة لا رابط إلى دفتر مخزن المواد الذي لا يُفتح له (ب٣)');
      const back = byAction('open-output-lots');
      t.same(back.map((n) => n.getAttribute('href')), ['/inventory/items/f-1/details?wh=w-feed&tab=lots&back=%2Fmill%2Fbatch%2Fpb-1'], 'C2: و«افتح وجبات العلف في مخزنه» رابط لبطاقة المادّة في مخزنه (والرجوع منها إلى الدفعة)');
      await follow(back[0]);
      t.ok(where?.pathname === '/inventory/items/f-1/details' && byAction('open-production').length === 1, `C2: والرابط يرجع إلى وجبات العلف بدفعتها (${where?.pathname})`);
      t.same(named(calls, 'previewProduction'), [], 'C2: ولا معاينة تُطلب لدفعة مرحَّلة');
      t.same(named(calls, 'loadBatch'), [['pb-1']], 'C2: والدفعة قُرئت بمعرّفها مرّة');
    });
    await step('C2-control', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, millHandlers({ input: true, output: true }, true));
      await mount('/inventory/items/f-1/details?wh=w-feed&tab=moves');
      await follow(byAction('open-move-doc')[0]);
      reached('الدفتر (المدير)');
      t.same(linksTo('w-raw'), ['/inventory/items/i-gas/details?wh=w-raw&tab=moves'], 'C2: ضابط: المدير (مخزن المواد بنطاقه) يرى رابط دفتر الكاز في مخزن المواد');
    });

    // ── C3 (ج٣، ق٢٦): رفض category_name_taken بتلميحه في «إعدادات المنشأة» ───────────────────────────────────────────────
    const s = await bundleOf(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter } from 'react-router-dom';",
        "export { default as OrgSettingsPage } from './src/pages/settings/OrgSettingsPage.tsx';",
        "export { searchable } from './src/domain/normalize.ts';",
      ],
      [settingsStubs],
    );
    const categories = [
      { id: 'e-power', version: 1, archived: false, name: 'كهرباء', systemCode: null },
      { id: 'e-move', version: 2, archived: true, name: 'نقل', systemCode: null },
      { id: 'e-count', version: 1, archived: false, name: 'فرق جرد', systemCode: 'count_diff' },
      { id: 'e-labor', version: 4, archived: false, name: 'أيدي عاملة', systemCode: null },
    ];
    const setup = { divisions: [{ id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true }], sites: [], warehouses: [], packTypes: [], itemCategories: [], expenseCategories: categories };
    /**
     * PostgREST مزيّف لجدول فئات المصاريف: الإدراج والتعديل يمرّان بمحفّز expense_categories_name_guard كما في 0016 (الاسم
     * المطبَّع، والمطابقة الأولى الفعّالة ثمّ النظامية ثمّ المؤرشفة، والتلميح يقول حالها)، والرفض P0001 برمزه وتلميحه.
     */
    const categoryServer = () => {
      const server = {
        rows: categories.map((row) => ({ ...row })),
        requests: [],
        async fetch(url, init) {
          const u = new URL(String(url));
          const body = init.body ? JSON.parse(init.body) : null;
          const param = (key) => (u.searchParams.get(key) ?? '').replace(/^eq\./u, '') || null;
          const self = param('id');
          server.requests.push({ method: init.method, table: u.pathname.split('/').at(-1), id: self, body });
          const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
          if (u.pathname !== '/rest/v1/expense_categories' || (init.method !== 'POST' && init.method !== 'PATCH')) throw new Error(`طلب غير متوقّع ${init.method} ${u.pathname}`);
          const name = String(body.name);
          const match = server.rows
            .filter((row) => row.id !== self && s.searchable(row.name.trim()) === s.searchable(name.trim()))
            .sort((a, b) => Number(a.archived) - Number(b.archived) || Number(a.systemCode !== null) - Number(b.systemCode !== null))[0];
          if (match) {
            const hint = match.archived
              ? `توجد فئة «${match.name}» مؤرشفة: أعِدها من الأرشيف بدل إنشاء أخرى.`
              : match.systemCode !== null
                ? `«${match.name}» اسم فئة نظامية يكتبها النظام؛ اختر اسماً آخر.`
                : `توجد فئة «${match.name}»: اخترها بدل إنشاء أخرى.`;
            return json(400, { code: 'P0001', message: 'category_name_taken', details: null, hint });
          }
          if (init.method === 'POST') {
            const row = { id: `e-${server.rows.length + 1}`, version: 1, archived: false, name, systemCode: null };
            server.rows.push(row);
            return json(201, [{ id: row.id, name, archived_at: null, version: 1, system_code: null }]);
          }
          const row = server.rows.find((r) => r.id === self);
          if (!row || row.version !== Number(param('version'))) return json(200, []);
          row.name = name;
          row.version += 1;
          return json(200, [{ id: row.id, version: row.version }]);
        },
      };
      return server;
    };
    const mountSettings = async () => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = { root: s.createRoot(container), flushSync: s.flushSync };
      s.flushSync(() => root.root.render(s.h(s.MemoryRouter, { initialEntries: ['/settings/org'] }, s.h(s.OrgSettingsPage, { sections: ['expenses'] }))));
      await settle();
      await settle();
    };
    const submit = async () => {
      fire(byIdSuffix('-form')[0], 'submit');
      await settle();
      await settle();
    };
    const ARCHIVED = 'توجد فئة «نقل» مؤرشفة: أعِدها من الأرشيف بدل إنشاء أخرى.';
    const SYSTEM = '«فرق جرد» اسم فئة نظامية يكتبها النظام؛ اختر اسماً آخر.';
    const ACTIVE = 'توجد فئة «كهرباء»: اخترها بدل إنشاء أخرى.';

    await step('C3-new', async () => {
      const server = categoryServer();
      globalThis.__c3 = { session: { status: 'ready', workspace: ws('manager') }, toasts: [], loadOrgSetup: () => setup, fetch: server.fetch };
      await mountSettings();
      await click(byAction('new-expense')[0]);
      // بتشكيل ومسافة: الاسم المطبَّع «نقل» مؤرشفة.
      type(byIdSuffix('-name')[0], 'نَقل ');
      await settle();
      await submit();
      t.same(server.requests.map((r) => [r.method, r.table, r.body]), [['POST', 'expense_categories', { name: 'نَقل' }]], 'C3: الإضافة بـcreateExpenseCategory الحقيقي (POST على expense_categories)');
      t.ok(text().includes('الخادم رفض العملية') && text().includes(ARCHIVED), `C3: رفض الاسم المؤرشف يظهر بتلميح الخادم في النافذة (${text().slice(-300)})`);
      t.eq(byIdSuffix('-name')[0]?.value, 'نَقل ', 'C3: والنافذة باقية بالنصّ المكتوب');
      t.same(globalThis.__c3.toasts, [], 'C3: ولا «حُفظ»');
      type(byIdSuffix('-name')[0], 'فرق جرد');
      await settle();
      await submit();
      t.ok(text().includes(SYSTEM) && !text().includes(ARCHIVED), 'C3: واسم فئة نظامية بتلميحه (والتلميح السابق يُستبدل)');
      type(byIdSuffix('-name')[0], 'كهرباء');
      await settle();
      await submit();
      t.ok(text().includes(ACTIVE), 'C3: واسم فئة فعّالة بتلميحه');
      // ضابط: اسم جديد يُحفظ ويُغلق النافذة.
      type(byIdSuffix('-name')[0], 'صيانة');
      await settle();
      await submit();
      t.ok(server.rows.some((row) => row.name === 'صيانة') && byIdSuffix('-form').length === 0, 'C3: ضابط: الاسم الجديد يُحفظ وتُغلق النافذة');
      t.same(globalThis.__c3.toasts.map((toast) => toast.title), ['حُفظ'], 'C3: ضابط: و«حُفظ»');
    });
    await step('C3-rename', async () => {
      const server = categoryServer();
      globalThis.__c3 = { session: { status: 'ready', workspace: ws('manager') }, toasts: [], loadOrgSetup: () => setup, fetch: server.fetch };
      await mountSettings();
      await click(all().find((n) => n.getAttribute('aria-label') === 'غيّر اسم أيدي عاملة'));
      t.eq(byIdSuffix('-name')[0]?.value, 'أيدي عاملة', 'C3: نافذة تغيير الاسم بالاسم الحالي');
      type(byIdSuffix('-name')[0], 'كهرباء');
      await settle();
      await submit();
      t.same(server.requests.map((r) => [r.method, r.id, r.body]), [['PATCH', 'e-labor', { name: 'كهرباء' }]], 'C3: تغيير الاسم بـrename الحقيقي (PATCH بمعرّف الفئة)');
      t.ok(text().includes('الخادم رفض العملية') && text().includes(ACTIVE), `C3: وتغيير الاسم إلى اسم موجود يظهر بتلميح الخادم (${text().slice(-300)})`);
      t.eq(byIdSuffix('-name')[0]?.value, 'كهرباء', 'C3: والنافذة باقية بالنصّ المكتوب');
      type(byIdSuffix('-name')[0], 'أجور العمّال');
      await settle();
      await submit();
      t.ok(server.rows.find((row) => row.id === 'e-labor')?.name === 'أجور العمّال' && byIdSuffix('-form').length === 0, 'C3: ضابط: الاسم غير المكرّر يُحفظ');
    });
  } finally {
    await unmount();
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete globalThis.navigator;
    delete globalThis.__c;
    delete globalThis.__c3;
    restore();
  }
}
