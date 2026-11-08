// «المخزن ببساطة» (كلمة المالك 2026-11-06، عقد scratchpad/simple §3): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// StockRoutes وMillRoutes الحقيقيتين، وrepo/purchases الحقيقي (المحلّلات وبناء معاملات record_purchase) على core بديل يجيب بأجوبة
// بشكل العقد (نصوص عشرية، ومفتاح money يغيب لمن لا يراه)؛ وrepo المخزون والشراء القديم والمعمل والجلسة بدائل. الحالات:
// P1 بطاقات المواد: الموجود ومجموع المشترى بوحدة الأساس وسعر البيع لمن يرى المال، والبحث، والفراغ، و«إعداد المخزن» للمدير وحده،
//    ولا رابط لورقة الاستلام؛ P2 «أضف مادّة»: الاسم وطريقة الحساب ووزن اللتر إلزامياً للتر، والحفظ بـcreateItem ثمّ ملفّ المادّة، والتوأم
//    «موجودة: افتح ملفّها»؛ P3 ملفّ المادّة: الأرقام الأربعة والجدول، و«سجّل شراء» لمن يسجّل (الأمين) لا لمشغّل المعمل (ولا مال له)؛
//    P4 شراء بالدين: المجموع حيّاً، وزرّ يسمّي أثره، ومعاملات الدالّة بالعقد، ثمّ الصفّ والأرقام من قراءة جديدة؛ P5 شراء نقداً بالصندوق
//    الوحيد؛ P6 رسائل الحقول، والتقريب لأقرب دينار (333.333 × 1.50 = 500)، والمجموع صفر، والقطع عدد صحيح، والتاريخ الأقدم من 7 أيام؛
//    P7 store_required: قائمة المخازن والإعادة بالمعرّفات نفسها؛ P8 نتيجة مجهولة: «لم يُعرف إن حُفظ» والإعادة بالمعرّفات والمحتوى نفسه؛
//    P9 بلا اتصال «يحتاج اتصالاً» ولا إرسال؛ P10 «عندك» على بطاقات مواد البانية وفي بطاقة الخلطة وبطاقات «أضف مواد» (2026-11-07)، بمحلّل items_overview الحقيقي؛ P11 ‎?buy=1 يفتح النافذة.
// ومراجعة الجولة الأولى: م١ إعادة النتيجة المجهولة تبقى مجهولة ما لم يرفضها الخادم رفضاً أكيداً (55P03 وانقطاع)، والإغلاق يقرأ الملفّ؛
//    ل٧ قائمة المخازن بعد store_required بـ«جارٍ التحميل» وفشلها بـ«أعد المحاولة»؛ م٣ «تاريخ الانتهاء» لمادّة تتبّعه و«وقت الفقس»
//    للأفراخ، وp_expiry_on وp_born_at مفتاحان دائماً؛ م٢ «مصحَّح» على السطر المصحَّح.
// وتجربة المالك على الآيباد (2026-11-06، «الصفحة صغيرة سويها واسعة»): ي٢ نافذتا الشراء و«أضف مادّة» عريضتان بعمودين.
// ويوم المالك (2026-11-07؛ كلّها تفشل على df1c736): U1 «أضف مادّة» فيها «وقود: كاز، غاز، بنزين» (fuel)، وشراؤه يقول «يدخل «المخزن العام»»؛
//    U2 سطر «أين يدخل» قبل الحفظ: المخزن الوحيد بنطاقك، أو المخازن إن تعدّدت، أو نوع المخزن الناقص (و«إعداد المخزن» للمدير)، وفشل قراءة
//    المخازن بـ«أعد المحاولة»؛ U3 «عدّل نوع المادّة» لمن يعدّل الموادّ ما دامت بلا موجود ولا شراء، إلى نافذة التعديل وبالرجوع إلى الملفّ.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__sp.call('${n}', a);`).join(' ')}`;
const STUBS = {
  inventory: routed('inventory', ['loadOrgSetup', 'createItem', 'findItemTwins', 'listItems', 'loadItem', 'listItemUnits', 'loadItemPurchases', 'loadStoresOverview', 'createItemUnit', 'setItemSellPrice', 'updateItem', 'createExpenseCategory', 'setItemCostPrice']),
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createSupplier', 'listBoxes']),
  counts: `export * from ${real('counts')}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  mill: routed('mill', ['loadMill', 'loadBuilder', 'loadRecipe', 'loadExpenseCategories', 'loadMillStores', 'createRecipe', 'addRecipeLine', 'setRecipeLine']),
  session: 'export const useSession = () => globalThis.__sp.session; export const sessionStore = { get: () => globalThis.__sp?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__sp.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'sp-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchasing|counts|mill)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'sp-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'sp-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
    // repo/purchases الحقيقي يبني النداء ويقرأ الجواب؛ core بديل له وحده يسجّل النداء ويجيب بشكل العقد.
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').endsWith('src/lib/repo/purchases.ts') ? { path: 'core', namespace: 'sp-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'sp-core' }, () => ({ contents: 'export const call = async (fn, args) => globalThis.__sp.rpc(fn, args);', resolveDir: ROOT, loader: 'js' }));
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
    "export { parseRecipe } from './src/lib/repo/mill.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { NetworkError, RejectedError, RetryableError, UnknownOutcomeError } from './src/lib/errors.ts';",
    "export { purchaseTotal } from './src/pages/inventory/PurchaseDialog.tsx';",
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
const click = async (node, init = {}) => {
  fire(node, 'click', init);
  await settle();
};
const off = (node) => node?.hasAttribute('disabled') ?? null;
/** الزرّ أو الخيار بنصّه (الشريحة المقسّمة أزرار radio بلا data-action). */
const buttonWith = (label) => all().find((n) => n.localName === 'button' && n.textContent === label);
const dialogForm = () => all().find((n) => n.localName === 'form' && n.id.endsWith('-form'));
const submit = async () => {
  fire(dialogForm(), 'submit');
  await settle();
  await settle();
};

// ─── أجوبة بشكل العقد ───────────────────────────────────────────────────────────────────────────────────────────
const TODAY = '2026-11-06';
const overviewJson = (over = {}) => ({
  today: TODAY,
  can_record: true,
  can_add_item: true,
  items: [
    { id: 'i-corn', name: 'ذرة', kind: 'raw', base_unit: 'kg', on_hand_qty: '20000.000', purchased_qty: '25000.000', last_purchase_on: '2026-11-05', money: { sell_price: '600.00', avg_unit_price: '450.00' } },
    { id: 'i-oil', name: 'زيت', kind: 'raw', base_unit: 'L', on_hand_qty: '0.000', purchased_qty: '0.000', last_purchase_on: null, money: { sell_price: null, avg_unit_price: null } },
  ],
  ...over,
});
/** بلا مفتاح money (القناع لمن لا يرى المال). */
const withoutMoney = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'money'));
const masked = (json) => ({ ...json, items: json.items.map(withoutMoney) });
const purchaseRow = (over = {}) => ({
  line_id: 'rl-1', doc_id: 'r-1', doc_no: 'PU-2026-0001', received_on: '2026-11-05', party_id: 'p-1', party_name: 'مورّد الحبوب', warehouse_name: 'مخزن المواد الأوّلية',
  qty: '25000.000', payment: 'credit', money: { unit_price: '450.00', line_total: '11250000.00', sell_price: '600.00', corrected: false }, ...over,
});
const fileJson = (over = {}) => ({
  today: TODAY,
  can_record: true,
  can_edit: false,
  item: { id: 'i-corn', name: 'ذرة', kind: 'raw', base_unit: 'kg', density_kg_per_l: null, archived: false, tracks_expiry: false },
  on_hand_qty: '20000.000',
  purchased_qty: '25000.000',
  purchases_count: 1,
  money: { purchased_value: '11250000.00', avg_unit_price: '450.00', sell_price: '600.00', last_unit_price: '450.00' },
  purchases: [purchaseRow()],
  more: false,
  ...over,
});
/** الملفّ بعد شراء 1,000 كغم بـ450: الصفّ الجديد أوّلاً والأرقام من الخادم. */
const fileAfter = (payment) =>
  fileJson({
    on_hand_qty: '21000.000',
    purchased_qty: '26000.000',
    purchases_count: 2,
    money: { purchased_value: '11700000.00', avg_unit_price: '450.00', sell_price: '600.00', last_unit_price: '450.00' },
    purchases: [purchaseRow({ line_id: 'rl-2', doc_id: 'r-2', doc_no: 'PU-2026-0002', received_on: TODAY, qty: '1000.000', payment, money: { unit_price: '450.00', line_total: '450000.00', sell_price: '600.00', corrected: false } }), purchaseRow()],
  });
const recorded = (args) => ({
  id: args.p_receipt_id, doc_no: 'PU-2026-0002', line_id: args.p_line_id, lot_id: 'lot-9', item_id: args.p_item, warehouse_id: args.p_warehouse ?? 'w-raw', warehouse_name: 'مخزن المواد الأوّلية',
  received_on: args.p_received_on, qty: args.p_qty, payment: args.p_payment, party_id: args.p_party, party_name: 'مورّد الحبوب',
  money: { unit_price: args.p_unit_price, line_total: '450000.00', sell_price: args.p_sell_price, paid_now: args.p_payment === 'cash' ? '450000.00' : '0.00' },
});

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: false,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const KEEPER = ws('storekeeper', { scopes: [{ warehouseId: 'w-raw' }] });
const MANAGER = ws('manager');
const MILLER = ws('mill_operator', { scopes: [{ siteId: 's-mill' }] });
const org = (stores) => ({
  divisions: [{ id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true }],
  sites: [], packTypes: [], expenseCategories: [], itemCategories: [],
  warehouses: stores.map(([id, name, kind = 'raw']) => ({ id, version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name, kind, hasBalance: false })),
});
const itemRow = (id, name, kind, baseUnit = 'kg') => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [] });
const recipeJson = () => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: [{ id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 5 }],
  selected: { id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', note: null, activated_at: null, version: 5 },
  lines: [
    { id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '600.000', unit: 'kg', mass_kg: '600.000', share_pct: '60.00', in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false },
  ],
  mass_kg: '600.000',
  pick_items: [{ id: 'i-corn', name: 'ذرة', base_unit: 'kg', category_name: 'الغذاء' }, { id: 'i-soy', name: 'صويا', base_unit: 'kg', category_name: null }],
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
      globalThis.__sp = {
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
          m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Probe), m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }), m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }))),
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
    const suppliers = { searchSuppliers: () => ({ parties: [{ id: 'p-1', name: 'مورّد الحبوب' }], total: 1 }) };
    const openDialog = async () => {
      await click(byAction('record-purchase')[0]);
      await settle();
    };
    const fillPurchase = async ({ qty = '1000', price = '450' } = {}) => {
      await click(byAction('pick-party')[0]);
      type(byAction('purchase-qty')[0], qty);
      type(byIdSuffix('-price')[0], price);
      await settle();
    };
    const saveButton = () => byAction('save-purchase')[0];

    // ── P1: بطاقات المواد ────────────────────────────────────────────────────────────────────────────────────────
    await step('P1', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: MANAGER }, {}, { items_overview: async () => overviewJson() });
      await mount('/inventory');
      const tiles = byAction('open-item-file');
      t.same(tiles.map((n) => n.getAttribute('href')), ['/inventory/items/i-corn', '/inventory/items/i-oil'], 'P1: بطاقة لكلّ مادّة برابط ملفّها');
      const corn = tiles[0]?.textContent ?? '';
      t.ok(corn.includes('الموجود:20,000 كغم') && corn.includes('مجموع ما اشتريته:25,000 كغم'), `P1: الموجود ومجموع المشترى بالكيلوغرام لا بالطنّ (${corn})`);
      t.ok(corn.includes('سعر البيع:600.00 دينار لكل كغم') && corn.includes('آخر شراء: 05/11/2026'), 'P1: وسعر البيع وآخر شراء');
      t.ok((tiles[1]?.textContent ?? '').includes('لم تُشترَ بعد') && !(tiles[1]?.textContent ?? '').includes('سعر البيع'), 'P1: مادّة بلا شراء ولا سعر تقول ذلك');
      t.same(named(rpcCalls, 'items_overview'), [{}], 'P1: قراءة واحدة لـitems_overview');
      t.eq(byAction('open-store-setup').length, 1, 'P1: «إعداد المخزن» للمدير');
      t.ok(!all().some((n) => (n.getAttribute('href') ?? '').startsWith('/inventory/receipts')), 'P1: ولا رابط لورقة الاستلام في الطريق اليومي');
      t.ok(all().some((n) => n.getAttribute('href') === '/inventory/stores'), 'P1: وبطاقات المخازن تحت «أعمال أخرى»');
      type(byAction('search-board')[0], 'زيت');
      await settle();
      t.same(byAction('open-item-file').map((n) => n.getAttribute('href')), ['/inventory/items/i-oil'], 'P1: البحث بالاسم يصفّي البطاقات');
      type(byAction('search-board')[0], 'قمح');
      await settle();
      t.ok(text().includes('لا مادّة باسم «قمح»') && byAction('add-searched-item').length === 1, 'P1: بحث بلا نتيجة لا يسكت ويقترح الإضافة');
      await click(byAction('add-searched-item')[0]);
      t.eq(byAction('simple-item-name')[0]?.value, 'قمح', 'P1: و«أضف» تفتح النافذة بالاسم المكتوب');
    });
    await step('P1-roles', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, {}, { items_overview: async () => overviewJson() });
      await mount('/inventory');
      t.ok(byAction('open-store-setup').length === 0 && byAction('add-item').length === 1, 'P1: الأمين: «أضف مادّة» بلا «إعداد المخزن»');
      await unmount();
      fresh({ status: 'ready', workspace: ws('viewer') }, {}, { items_overview: async () => masked(overviewJson({ can_record: false, can_add_item: false })) });
      await mount('/inventory');
      t.ok(text().includes('20,000 كغم') && !text().includes('سعر البيع') && byAction('add-item').length === 0, 'P1: المشاهد: الكميات بلا مال ولا «أضف مادّة»');
      await unmount();
      fresh({ status: 'ready', workspace: MANAGER }, {}, { items_overview: async () => overviewJson({ items: [] }) });
      await mount('/inventory');
      t.ok(text().includes('لا مواد بعد. أضف أوّل مادّة: اكتب اسمها واختر طريقة حسابها.'), 'P1: الفراغ يقول ما العمل');
    });

    // ── P2: «أضف مادّة» ───────────────────────────────────────────────────────────────────────────────────────────
    await step('P2', async () => {
      const { calls } = fresh(
        { status: 'ready', workspace: MANAGER },
        { findItemTwins: () => [], createItem: (fields) => ({ ...itemRow('i-new', fields.name, fields.kind, fields.base_unit), density: 9200n }) },
        { items_overview: async () => overviewJson(), item_file: async () => fileJson({ item: { id: 'i-new', name: 'زيت صويا', kind: 'raw', base_unit: 'L', density_kg_per_l: '0.9200', archived: false, tracks_expiry: false }, purchases: [], purchases_count: 0 }) },
      );
      await mount('/inventory');
      await click(byAction('add-item')[0]);
      const options = (byAction('simple-item-kind')[0]?.options ?? []).map((o) => o.textContent);
      t.same(options, ['مادّة للمعمل', 'علف جاهز', 'دواء', 'وقود: كاز، غاز، بنزين', 'أخرى'], 'P2: النوع بكلمات بسيطة، والأوّل «مادّة للمعمل»');
      t.ok(['كيلوغرام', 'لتر', 'قطعة'].every((label) => buttonWith(label)), 'P2: «طريقة الحساب» كيلوغرام / لتر / قطعة');
      type(byAction('simple-item-name')[0], 'زيت صويا');
      await click(buttonWith('لتر'));
      await submit();
      t.ok(text().includes('اكتب كم يزن اللتر بالكيلوغرام') && named(calls, 'createItem').length === 0, 'P2: اللتر بلا وزنه يُرفض قبل الإرسال');
      type(byAction('simple-item-density')[0], '0.92');
      await settle();
      await submit();
      await settle();
      const created = named(calls, 'createItem')[0]?.[0] ?? {};
      t.same(
        [created.name, created.kind, created.base_unit, created.density_kg_per_l, created.scale_step, created.category_id],
        ['زيت صويا', 'raw', 'L', '0.9200', '0.100', null],
        'P2: createItem بالاسم والنوع ووحدة اللتر ووزنه',
      );
      t.same(named(calls, 'findItemTwins')[0], ['زيت صويا', []], 'P2: والتوائم بالاسم قبل الحفظ');
      t.eq(where?.pathname, '/inventory/items/i-new', 'P2: وبعد الحفظ يفتح ملفّ المادّة الجديدة');
    });
    await step('P2-twin', async () => {
      const { calls } = fresh(
        { status: 'ready', workspace: KEEPER },
        { findItemTwins: () => [{ id: 'i-corn', name: 'ذرة', archived: false, sameName: true, codes: [] }], createItem: (fields) => itemRow('i-x', fields.name, fields.kind) },
        { items_overview: async () => overviewJson() },
      );
      await mount('/inventory');
      await click(byAction('add-item')[0]);
      type(byAction('simple-item-name')[0], 'ذرة');
      await settle();
      await submit();
      t.same(byAction('open-twin-file').map((n) => [n.textContent, n.getAttribute('href')]), [['موجودة: افتح ملفّ «ذرة»', '/inventory/items/i-corn']], 'P2: التوأم بالاسم: «موجودة: افتح ملفّها»');
      t.eq(named(calls, 'createItem').length, 0, 'P2: ولا مادّة ثانية قبل الإصرار');
      await submit();
      t.eq(named(calls, 'createItem').length, 1, 'P2: و«احفظ مادّة أخرى بالاسم نفسه» يكتبها إن أصرّ');
    });

    // ── P3: ملفّ المادّة ──────────────────────────────────────────────────────────────────────────────────────────
    await step('P3', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      t.same(named(rpcCalls, 'item_file'), [{ p_item: 'i-corn' }], 'P3: قراءة واحدة لـitem_file');
      const tiles = all().filter((n) => n.localName === 'dt').map((n) => `${n.textContent}=${n.nextSibling?.textContent}`);
      t.same(tiles, ['الموجود الآن=20,000 كغم', 'مجموع ما اشتريته=25,000 كغم', 'متوسّط سعر الشراء=450.00 دينار لكل كغم', 'سعر البيع=600.00 دينار لكل كغم'], 'P3: الأرقام الأربعة');
      const heads = all().filter((n) => n.localName === 'th').map((n) => n.textContent);
      t.same(heads.slice(0, 7), ['التاريخ', 'المورّد', 'الكمية (كغم)', 'سعر الشراء', 'المجموع', 'سعر البيع', 'الدفع'], 'P3: جدول واحد بأعمدة العقد');
      const cells = all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.same(cells.slice(0, 7), ['05/11/2026', 'مورّد الحبوب', '25,000', '450.00', '11,250,000', '600.00', 'بالدين'], 'P3: صفّ الشراء بقيمه');
      t.eq(byAction('record-purchase').length, 1, 'P3: الأمين يرى «سجّل شراء»');
      t.ok(byAction('pick-store').length === 0 && !text().includes('الوجبات المتبقّية'), 'P3: بلا اختيار مخزن ولا تبويبات');
      t.eq(byAction('open-item-details').length, 0, 'P3: ورابط «دفتر المادّة والوجبات» لأدوار الكلفة وحدها');
    });
    await step('P3-miller', async () => {
      fresh({ status: 'ready', workspace: MILLER }, suppliers, { item_file: async () => ({ ...withoutMoney(fileJson({ can_record: false })), purchases: [withoutMoney(purchaseRow())] }) });
      await mount('/inventory/items/i-corn');
      t.ok(text().includes('20,000 كغم') && text().includes('مورّد الحبوب'), 'P3: مشغّل المعمل يرى الكميات والمشتريات');
      t.eq(byAction('record-purchase').length, 0, 'P3: ولا «سجّل شراء» له');
      t.ok(!text().includes('سعر الشراء') && !text().includes('متوسّط سعر الشراء') && !text().includes('11,250,000'), 'P3: ولا مال له');
    });
    await step('P3-manager', async () => {
      fresh({ status: 'ready', workspace: MANAGER }, suppliers, { item_file: async () => fileJson({ can_edit: true }) });
      await mount('/inventory/items/i-corn');
      t.eq(byAction('open-item-details')[0]?.getAttribute('href'), '/inventory/items/i-corn/details', 'P3: المدير: «دفتر المادّة والوجبات» إلى البطاقة القديمة');
      t.eq(byAction('edit-item-file')[0]?.getAttribute('href'), '/inventory/items?edit=i-corn&back=%2Finventory%2Fitems%2Fi-corn', 'P3: و«عدّل المادّة» يرجع إلى الملفّ');
    });

    // ── P4: شراء بالدين ───────────────────────────────────────────────────────────────────────────────────────────
    await step('P4', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, {
        item_file: async (_args, n) => (n === 1 ? fileJson() : fileAfter('credit')),
        record_purchase: async (args) => recorded(args),
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      t.ok(text().includes('سجّل شراء «ذرة»'), 'P4: النافذة باسم المادّة');
      t.eq(byIdSuffix('-day')[0]?.value, '06/11/2026', 'P4: التاريخ اليوم افتراضياً');
      t.eq(byIdSuffix('-sell')[0]?.value, '600', 'P4: سعر البيع معبّأ من الملفّ');
      // السعر اختياريّ (0020): قبل كتابته الدفع بالدين وحده بسطر يقول ذلك، وبعده الاختيار والدين افتراضاً.
      t.ok(byAction('purchase-unpriced')[0]?.textContent === 'بالدين على المورّد: يدخل المخزن الآن، وتكمّل السعر لاحقاً.' && !buttonWith('نقداً من الصندوق'), 'P4: بلا سعر: بالدين وحده بسطر يشرحه');
      await fillPurchase();
      t.eq(buttonWith('بالدين على المورّد')?.getAttribute('aria-checked'), 'true', 'P4: الدفع بالدين افتراضياً');
      t.ok(byAction('purchase-total')[0]?.textContent === 'المجموع: 450,000 دينار', `P4: المجموع حيّاً (${byAction('purchase-total')[0]?.textContent})`);
      t.eq(saveButton()?.textContent, 'احفظ الشراء: 1,000 كغم ذرة بـ450,000 دينار بالدين على مورّد الحبوب', 'P4: زرّ الحفظ يسمّي أثره');
      await submit();
      await settle();
      const sent = named(rpcCalls, 'record_purchase');
      t.eq(sent.length, 1, 'P4: نداء واحد لـrecord_purchase');
      const args = sent[0] ?? {};
      t.same(
        { ...args, p_client_ref: typeof args.p_client_ref, p_receipt_id: typeof args.p_receipt_id, p_line_id: typeof args.p_line_id },
        { p_client_ref: 'string', p_receipt_id: 'string', p_line_id: 'string', p_item: 'i-corn', p_party: 'p-1', p_received_on: TODAY, p_qty: '1000.000', p_unit_price: '450.00', p_sell_price: '600.00', p_payment: 'credit', p_cash_account: null, p_warehouse: null, p_expiry_on: null, p_born_at: null },
        'P4: المعاملات بالعقد: الكمية والسعر نصّان عشريان، والمخزن يختاره الخادم',
      );
      t.ok(new Set([args.p_client_ref, args.p_receipt_id, args.p_line_id]).size === 3, 'P4: ثلاثة معرّفات مختلفة من الجهاز');
      t.eq(byAction('save-purchase').length, 0, 'P4: النافذة أُغلقت بعد الحفظ');
      t.eq(named(rpcCalls, 'item_file').length, 2, 'P4: والملفّ يُقرأ من جديد');
      t.ok(text().includes('حُفظ الشراء PU-2026-0002: 1,000 كغم ذرة من مورّد الحبوب بـ450,000 دينار بالدين عليه، إلى «مخزن المواد الأوّلية».'), `P4: جملة الحفظ من جواب الخادم (${text().slice(0, 300)})`);
      const tiles = all().filter((n) => n.localName === 'dt').map((n) => n.nextSibling?.textContent);
      t.same(tiles.slice(0, 2), ['21,000 كغم', '26,000 كغم'], 'P4: والأرقام من القراءة الجديدة');
      const cells = all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.same(cells.slice(0, 7), ['06/11/2026', 'مورّد الحبوب', '1,000', '450.00', '450,000', '600.00', 'بالدين'], 'P4: والصفّ الجديد أوّلاً');
    });

    // ── P5: شراء نقداً ────────────────────────────────────────────────────────────────────────────────────────────
    await step('P5', async () => {
      // الأمين لا يقرأ جدول الصناديق (can_see_accounts)، فالخادم يرسلها مع الملفّ (cash_accounts).
      const { rpcCalls, calls } = fresh({ status: 'ready', workspace: KEEPER }, { ...suppliers, listBoxes: () => [] }, {
        item_file: async (_args, n) => ({ ...(n === 1 ? fileJson() : fileAfter('cash')), cash_accounts: [{ id: 'b-1', name: 'الصندوق الرئيسي' }] }),
        record_purchase: async (args) => recorded(args),
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await click(buttonWith('نقداً من الصندوق'));
      await settle();
      t.eq(named(calls, 'listBoxes').length, 0, 'P5: الصناديق من الملفّ لا من جدولها (الأمين لا يقرؤه)');
      // DOM الفحص لا يطفئ الخيار السابق كالمتصفّح: المختار = خيار الصندوق نفسه وعليه selected.
      t.eq((byAction('pick-box')[0]?.options ?? []).find((o) => o.getAttribute('value') === 'b-1')?.selected, true, 'P5: الصندوق الوحيد مختار وحده');
      t.eq(saveButton()?.textContent, 'احفظ الشراء: 1,000 كغم ذرة بـ450,000 دينار نقداً من الصندوق الرئيسي', 'P5: الزرّ يسمّي الصندوق');
      await submit();
      await settle();
      const args = named(rpcCalls, 'record_purchase')[0] ?? {};
      t.same([args.p_payment, args.p_cash_account], ['cash', 'b-1'], 'P5: النقد بصندوقه');
      t.ok(text().includes('بـ450,000 دينار نقداً') && all().filter((n) => n.localName === 'td').map((n) => n.textContent)[6] === 'نقداً', 'P5: والجملة والصفّ يقولان «نقداً»');
    });
    await step('P5-two-boxes', async () => {
      // جواب بلا cash_accounts: الصناديق من جدولها (من يقرؤه).
      const { rpcCalls, calls } = fresh({ status: 'ready', workspace: MANAGER }, { ...suppliers, listBoxes: () => [{ id: 'b-1', name: 'الصندوق الرئيسي' }, { id: 'b-2', name: 'صندوق المعمل' }] }, { item_file: async () => fileJson(), record_purchase: async (args) => recorded(args) });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await click(buttonWith('نقداً من الصندوق'));
      await submit();
      t.ok(text().includes('اختر الصندوق الذي دُفع منه.') && named(rpcCalls, 'record_purchase').length === 0, 'P5: صندوقان بلا اختيار: رسالة ولا إرسال');
      t.eq(named(calls, 'listBoxes').length, 1, 'P5: وبلا cash_accounts في الجواب تُقرأ من جدولها');
    });

    // ── P6: رسائل الحقول والتقريب ─────────────────────────────────────────────────────────────────────────────────
    await step('P6', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson(), record_purchase: async (args) => recorded(args) });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await submit();
      const page = text();
      t.ok(page.includes('اختر المورّد، أو أضفه باسمه.') && page.includes('اكتب الكمية (كغم) رقماً أكبر من صفر') && !page.includes('اكتب سعر الشراء لكل كغم'), `P6: رسائل الحقول الفارغة، والسعر اختياريّ بلا رسالة (${page.slice(0, 600)})`);
      t.eq(named(rpcCalls, 'record_purchase').length, 0, 'P6: ولا إرسال');
      await fillPurchase({ qty: '333.333', price: '1.5' });
      t.eq(byAction('purchase-total')[0]?.textContent, 'المجموع: 500 دينار(مقرَّب لأقرب دينار)', 'P6: 333.333 × 1.50 = 500 دينار، ويقول إنّه مقرَّب');
      t.same([m.purchaseTotal(333_333n, 150n).total, m.purchaseTotal(1_000_000n, 45_000n).rounded], [50_000n, false], 'P6: المرآة نفسها: 50,000 فلس، والصحيح بلا «مقرَّب»');
      type(byAction('purchase-qty')[0], '0.001');
      type(byIdSuffix('-price')[0], '0.01');
      await settle();
      await submit();
      t.ok(text().includes('المجموع صفر بعد التقريب لأقرب دينار؛ راجع الكمية والسعر.'), 'P6: المجموع صفر يُرفض قبل الإرسال');
      type(byAction('purchase-qty')[0], '10');
      type(byIdSuffix('-price')[0], '450');
      type(byIdSuffix('-day')[0], '01/10/2026');
      await settle();
      await submit();
      t.ok(text().includes('لا يُقبل تاريخ أقدم من 7 أيام') && named(rpcCalls, 'record_purchase').length === 0, 'P6: تاريخ أقدم من 7 أيام يُرفض');
      type(byIdSuffix('-day')[0], '07/11/2026');
      await settle();
      await submit();
      t.ok(text().includes('التاريخ بعد اليوم.') && named(rpcCalls, 'record_purchase').length === 0, 'P6: وتاريخ بعد اليوم كذلك');
    });
    await step('P6-pieces', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson({ item: { id: 'i-box', name: 'معلف', kind: 'other', base_unit: 'pc', density_kg_per_l: null, archived: false, tracks_expiry: false }, on_hand_qty: '3.000', purchased_qty: '3.000', purchases: [] }) });
      await mount('/inventory/items/i-box');
      await openDialog();
      await fillPurchase({ qty: '2.5', price: '1000' });
      await submit();
      t.ok(text().includes('القطع تُعدّ عدداً صحيحاً.') && named(rpcCalls, 'record_purchase').length === 0, 'P6: القطع عدد صحيح');
    });

    // ── P7: store_required ─────────────────────────────────────────────────────────────────────────────────────────
    await step('P7', async () => {
      const hint = 'لهذه المادّة مخزنان يستلمانها: «مخزن المواد الأوّلية» و«مخزن الحبوب»؛ اختر واحداً.';
      const { rpcCalls, calls } = fresh({ status: 'ready', workspace: MANAGER }, { ...suppliers, loadOrgSetup: () => org([['w-raw', 'مخزن المواد الأوّلية'], ['w-grain', 'مخزن الحبوب']]) }, {
        item_file: async () => fileJson(),
        record_purchase: async (args, n) => {
          if (n === 1) throw new m.RejectedError('store_required', hint);
          return recorded(args);
        },
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await submit();
      await settle();
      t.ok(byAction('purchase-store-pick').length === 1 && text().includes(hint), `P7: قائمة المخازن وتلميح الخادم (${text().slice(-500)})`);
      t.eq(named(calls, 'loadOrgSetup').length, 1, 'P7: المخازن قراءة واحدة (عند الفتح لسطر «يدخل…»)، والقائمة منها');
      const select = byAction('pick-store')[0];
      t.same((select?.options ?? []).map((o) => o.getAttribute('value')).filter(Boolean), ['w-grain', 'w-raw'], 'P7: المخازن التي تستلم نوعها');
      await submit();
      t.ok(text().includes('اختر المخزن.') && named(rpcCalls, 'record_purchase').length === 1, 'P7: بلا اختيار: رسالة ولا إعادة');
      choose(select, 'w-grain');
      await settle();
      await submit();
      await settle();
      const [first, second] = named(rpcCalls, 'record_purchase');
      t.same([second?.p_client_ref, second?.p_receipt_id, second?.p_line_id], [first?.p_client_ref, first?.p_receipt_id, first?.p_line_id], 'P7: الإعادة بالمعرّفات نفسها');
      t.same([first?.p_warehouse, second?.p_warehouse], [null, 'w-grain'], 'P7: والمخزن المختار');
      t.eq(byAction('save-purchase').length, 0, 'P7: وحُفظ فأُغلقت النافذة');
    });

    // ── يوم المالك ────────────────────────────────────────────────────────────────────────────────────────────────
    const fuelFile = (over = {}) =>
      fileJson({
        can_edit: true,
        item: { id: 'i-new', name: 'كاز', kind: 'fuel', base_unit: 'L', density_kg_per_l: '0.8000', archived: false, tracks_expiry: false },
        on_hand_qty: '0.000',
        purchased_qty: '0.000',
        purchases_count: 0,
        purchases: [],
        money: { purchased_value: '0.00', avg_unit_price: null, sell_price: null, last_unit_price: null },
        ...over,
      });
    const STORES = [['w-raw', 'مخزن المواد الأوّلية', 'raw'], ['w-gen', 'المخزن العام', 'general']];
    await step('U1-fuel', async () => {
      const { calls } = fresh(
        { status: 'ready', workspace: MANAGER },
        { findItemTwins: () => [], createItem: (fields) => itemRow('i-new', fields.name, fields.kind, fields.base_unit), loadOrgSetup: () => org(STORES), ...suppliers },
        { items_overview: async () => overviewJson(), item_file: async () => fuelFile() },
      );
      await mount('/inventory');
      await click(byAction('add-item')[0]);
      const select = byAction('simple-item-kind')[0];
      t.ok((select?.options ?? []).some((o) => o.getAttribute('value') === 'fuel' && o.textContent === 'وقود: كاز، غاز، بنزين'), 'U1: «أضف مادّة» فيها «وقود: كاز، غاز، بنزين»');
      type(byAction('simple-item-name')[0], 'كاز');
      choose(select, 'fuel');
      await settle();
      await submit();
      await settle();
      const created = named(calls, 'createItem')[0]?.[0] ?? {};
      t.same([created.name, created.kind], ['كاز', 'fuel'], 'U1: والمادّة تُنشأ وقوداً');
      t.eq(where?.pathname, '/inventory/items/i-new', 'U1: ثمّ ملفّها');
      await openDialog();
      t.eq(byAction('purchase-destination')[0]?.textContent, 'يدخل «المخزن العام».', 'U1: وشراؤها يقول قبل الحفظ إنّه يدخل «المخزن العام» (مرآة receiving_kinds: الوقود ← العامّ)');
    });
    await step('U2-destination', async () => {
      // الأمين بنطاق «مخزن المواد الأوّلية» وحده: المخزن الوحيد بنطاقه ولو كان في المنشأة مخزن موادّ آخر.
      fresh({ status: 'ready', workspace: KEEPER }, { ...suppliers, loadOrgSetup: () => org([['w-raw', 'مخزن المواد الأوّلية'], ['w-grain', 'مخزن الحبوب']]) }, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      await openDialog();
      t.same([byAction('purchase-destination')[0]?.textContent, byAction('purchase-edit-kind').length, byAction('purchase-dest-setup').length], ['يدخل «مخزن المواد الأوّلية».', 0, 0], 'U2: الأمين: المخزن الوحيد بنطاقه، بلا روابط');
      await unmount();
      fresh({ status: 'ready', workspace: MANAGER }, { ...suppliers, loadOrgSetup: () => org([['w-raw', 'مخزن المواد الأوّلية'], ['w-grain', 'مخزن الحبوب'], ['w-gen', 'المخزن العام', 'general']]) }, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      await openDialog();
      t.eq(byAction('purchase-destination')[0]?.textContent, 'يدخل أحد هذه المخازن: «مخزن الحبوب»، «مخزن المواد الأوّلية»؛ يُطلب اختياره عند الحفظ.', 'U2: المدير ومخزنا موادّ: يسمّيهما ويقول إنّ الاختيار عند الحفظ (والعامّ لا يستلم الذرة)');
      await unmount();
      fresh({ status: 'ready', workspace: MANAGER }, { ...suppliers, loadOrgSetup: () => org([['w-gen', 'المخزن العام', 'general']]) }, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      await openDialog();
      t.same(
        [byAction('purchase-destination')[0]?.textContent, byAction('purchase-dest-setup')[0]?.getAttribute('href')],
        ['لا يوجد في نطاقك مخزن «موادّ أوّلية» يستلم هذه المادّة، فلن يُحفظ شراؤها.', '/inventory/setup'],
        'U2: بلا مخزن يستلمها: يسمّي نوع المخزن الناقص، و«إعداد المخزن» للمدير',
      );
      await unmount();
      let failNext = true;
      const { calls } = fresh({ status: 'ready', workspace: KEEPER }, {
        ...suppliers,
        loadOrgSetup: () => {
          if (failNext) {
            failNext = false;
            throw new m.RetryableError('55P03');
          }
          return org([['w-raw', 'مخزن المواد الأوّلية']]);
        },
      }, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await settle();
      t.ok(text().includes('تعذّر تحميل قائمة المخازن') && byAction('retry').length === 1 && byAction('purchase-destination').length === 0, 'U2: فشل قراءة المخازن يُقال بـ«أعد المحاولة» لا سطراً فارغاً');
      await click(byAction('retry')[0]);
      await settle();
      t.same([named(calls, 'loadOrgSetup').length, byAction('purchase-destination')[0]?.textContent], [2, 'يدخل «مخزن المواد الأوّلية».'], 'U2: والإعادة تقرأ من جديد فيظهر السطر');
    });
    await step('U3-edit-kind', async () => {
      fresh({ status: 'ready', workspace: MANAGER }, { ...suppliers, loadOrgSetup: () => org(STORES) }, { item_file: async () => fuelFile({ item: { id: 'i-new', name: 'كاز', kind: 'raw', base_unit: 'pc', density_kg_per_l: null, archived: false, tracks_expiry: false } }) });
      await mount('/inventory/items/i-new');
      await openDialog();
      const link = byAction('purchase-edit-kind')[0];
      t.same(
        [byAction('purchase-destination')[0]?.textContent, link?.textContent, link?.getAttribute('href')],
        ['يدخل «مخزن المواد الأوّلية».', 'عدّل نوع المادّة', '/inventory/items?edit=i-new&back=%2Finventory%2Fitems%2Fi-new'],
        'U3: «كاز» مادّةً أوّلية بلا شراء: يقول أين يدخل، و«عدّل نوع المادّة» إلى نافذة التعديل بالرجوع إلى الملفّ',
      );
      fire(link, 'click', { button: 0 });
      await settle();
      t.eq(`${where?.pathname}${where?.search}`, '/inventory/items?edit=i-new&back=%2Finventory%2Fitems%2Fi-new', 'U3: والرابط يفتح التعديل');
      await unmount();
      // بموجود أو شراء النوع مجمَّد: لا رابط؛ ولمن لا يعدّل الموادّ لا رابط.
      fresh({ status: 'ready', workspace: MANAGER }, { ...suppliers, loadOrgSetup: () => org(STORES) }, { item_file: async () => fileJson({ can_edit: true }) });
      await mount('/inventory/items/i-corn');
      await openDialog();
      t.same([byAction('purchase-destination').length, byAction('purchase-edit-kind').length], [1, 0], 'U3: مادّة لها موجود وشراء: بلا رابط');
      await unmount();
      fresh({ status: 'ready', workspace: KEEPER }, { ...suppliers, loadOrgSetup: () => org(STORES) }, { item_file: async () => fuelFile({ can_edit: false }) });
      await mount('/inventory/items/i-new');
      await openDialog();
      t.same(
        [byAction('purchase-destination')[0]?.textContent, byAction('purchase-edit-kind').length, byAction('purchase-dest-setup').length],
        ['لا يوجد في نطاقك مخزن «عامّ» يستلم هذه المادّة، فلن يُحفظ شراؤها.', 0, 0],
        'U3: الأمين بنطاق مخزن الموادّ وحده (لا يعدّل الموادّ ولا المخازن): الوقود لا مخزن له بنطاقه، والسطر يقوله بلا روابط',
      );
    });

    // ── P8: نتيجة مجهولة ───────────────────────────────────────────────────────────────────────────────────────────
    await step('P8', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, {
        item_file: async (_args, n) => (n === 1 ? fileJson() : fileAfter('credit')),
        record_purchase: async (args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          return recorded(args);
        },
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await submit();
      await settle();
      t.ok(text().includes('لم يُعرف إن حُفظ؛ أعد المحاولة') && saveButton()?.textContent === 'أعد المحاولة', `P8: «لم يُعرف إن حُفظ؛ أعد المحاولة» (${text().slice(-400)})`);
      t.ok(byAction('purchase-qty').length === 0 && byAction('purchase-sent')[0]?.textContent.includes('1,000 كغم ذرة بـ450,000 دينار'), 'P8: الحقول تُقفل ويُعرض ما أُرسل');
      await submit();
      await settle();
      const [first, second] = named(rpcCalls, 'record_purchase');
      t.same(second, first, 'P8: الإعادة بالمعرّفات والمرجع والمحتوى نفسه');
      t.ok(byAction('save-purchase').length === 0 && text().includes('حُفظ الشراء PU-2026-0002'), 'P8: ثمّ حُفظ');
    });
    await step('P8-close', async () => {
      // نتيجة مجهولة ثمّ «أغلق»: ربّما حُفظ، فالملفّ يُقرأ من جديد ويُظهره إن كان قد حُفظ.
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, {
        item_file: async (_args, n) => (n === 1 ? fileJson() : fileAfter('credit')),
        record_purchase: async () => {
          throw new m.UnknownOutcomeError();
        },
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await submit();
      await settle();
      t.eq(byAction('purchase-cancel')[0]?.textContent, 'أغلق', 'P8: الزرّ الثاني «أغلق»');
      await click(byAction('purchase-cancel')[0]);
      await settle();
      t.same([byAction('save-purchase').length, named(rpcCalls, 'item_file').length], [0, 2], 'P8: الإغلاق بعد نتيجة مجهولة يقرأ الملفّ من جديد');
      t.eq(all().filter((n) => n.localName === 'td').map((n) => n.textContent)[2], '1,000', 'P8: فيظهر الشراء إن كان قد حُفظ');
    });

    // ── P9: بلا اتصال ───────────────────────────────────────────────────────────────────────────────────────────────
    await step('P9', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson(), record_purchase: async (args) => recorded(args) });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      m.onlineStore.set(false);
      await settle();
      t.ok(text().includes('يحتاج اتصالاً') && off(saveButton()) === true, 'P9: بلا اتصال: «يحتاج اتصالاً» والحفظ معطّل');
      await submit();
      t.eq(named(rpcCalls, 'record_purchase').length, 0, 'P9: ولا إرسال');
      m.onlineStore.set(true);
      await settle();
      t.eq(off(saveButton()), false, 'P9: ويعود حين يعود الاتصال');
    });

    // ── P10: «عندك» في المعمل ───────────────────────────────────────────────────────────────────────────────────────
    await step('P10-builder', async () => {
      const { rpcCalls } = fresh(
        { status: 'ready', workspace: MANAGER },
        { loadBuilder: () => ({ feedItems: [{ id: 'f-1', name: 'علف بادئ' }], recipeNames: [], stores: [], categories: [] }), listItems: () => ({ rows: [itemRow('i-corn', 'ذرة', 'raw')], total: 1, next: null }) },
        { items_overview: async () => overviewJson() },
      );
      await mount('/mill/new');
      const cards = byAction('material-card');
      t.same(cards.map((node) => node.getAttribute('data-item')), ['i-corn', 'i-oil'], 'P10: بطاقات مواد البانية من items_overview (بمحلّله الحقيقي)');
      t.ok(cards[0]?.textContent.includes('ذرة') && cards[0].textContent.includes('عندك: 20,000 كغم'), `P10: بطاقة البانية تقول «عندك: 20,000 كغم» (${cards[0]?.textContent})`);
      t.eq(named(rpcCalls, 'items_overview').length, 1, 'P10: بقراءة واحدة للصفحة (البطاقات و«عندك» معاً)');
    });
    await step('P10-recipe', async () => {
      fresh({ status: 'ready', workspace: MANAGER }, { loadRecipe: () => m.parseRecipe(recipeJson()) }, { items_overview: async () => overviewJson({ items: [...overviewJson().items, { id: 'i-soy', name: 'صويا', kind: 'raw', base_unit: 'kg', on_hand_qty: '1500.500', purchased_qty: '2000.000', last_purchase_on: '2026-11-01' }] }) });
      await mount('/mill/recipe/r-1');
      t.ok(byAction('recipe-on-hand')[0]?.textContent.includes('ذرة — عندك: 20,000 كغم'), `P10: بطاقة الخلطة: «في المخزن الآن» لكلّ مادّة (${byAction('recipe-on-hand')[0]?.textContent})`);
      await click(byAction('add-line')[0]);
      const cards = byAction('material-card');
      t.same(
        cards.map((node) => [node.getAttribute('data-item'), node.textContent.includes('عندك: ') ? node.textContent.slice(node.textContent.indexOf('عندك: ')) : null]),
        [['i-oil', 'عندك: 0 لتر'], ['i-soy', 'عندك: 1,500.5 كغم']],
        'P10: وبطاقات «أضف مواد» تقول «عندك» لكلّ مادّة ليست في الخلطة',
      );
    });

    // ── P11: ‎?buy=1 يفتح النافذة ───────────────────────────────────────────────────────────────────────────────────
    await step('P11', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn?buy=1');
      t.eq(byAction('save-purchase').length, 1, 'P11: رابط الشراء يفتح النافذة مباشرةً');
      await click(byAction('purchase-cancel')[0]);
      t.same([byAction('save-purchase').length, where?.search], [0, ''], 'P11: والإغلاق يشيل العلامة من الرابط');
      await unmount();
      fresh({ status: 'ready', workspace: MILLER }, suppliers, { item_file: async () => fileJson({ can_record: false }) });
      await mount('/inventory/items/i-corn?buy=1');
      t.eq(byAction('save-purchase').length, 0, 'P11: ولمن لا يسجّل الشراء لا تُفتح');
    });

    // ── مراجعة الجولة الأولى ───────────────────────────────────────────────────────────────────────────────────────
    // م١: إعادة نتيجة مجهولة تفشل بغير رفض أكيد (55P03: انتظرت خلف الأصل الذي ما زال يعمل، أو انقطاع) تُبقيها مجهولة.
    await step('R1-M1', async () => {
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, {
        item_file: async (_args, n) => (n === 1 ? fileJson() : fileAfter('credit')),
        record_purchase: async (_args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError('fetch_failed');
          if (n === 2) throw new m.RetryableError('55P03');
          throw new m.NetworkError();
        },
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await submit();
      await submit();
      await settle();
      t.eq(named(rpcCalls, 'record_purchase').length, 2, 'م١: الإعادة أُرسلت');
      t.ok(text().includes('لم يُعرف إن حُفظ؛ أعد المحاولة') && !text().includes('لم يُحفظ'), `م١: إعادة فشلت بـ55P03 تُبقي «لم يُعرف إن حُفظ» ولا تقول «لم يُحفظ شيء» (${text().slice(-500)})`);
      t.same([saveButton()?.textContent, byAction('purchase-cancel')[0]?.textContent, byAction('purchase-qty').length], ['أعد المحاولة', 'أغلق', 0], 'م١: والزرّ «أعد المحاولة» والحقول مقفلة والثاني «أغلق»');
      t.eq(byAction('purchase-retry-unknown').length, 1, 'م١: ويقول إنّ الإعادة لم تكتمل أيضاً');
      await submit();
      await settle();
      const [first, second, third] = named(rpcCalls, 'record_purchase');
      t.ok(text().includes('لم يُعرف إن حُفظ') && !text().includes('لم يُحفظ'), 'م١: وانقطاع الإعادة الثانية كذلك');
      t.same([second, third], [first, first], 'م١: كلّ إعادة بالمعرّفات والمحتوى نفسه');
      await click(byAction('purchase-cancel')[0]);
      await settle();
      t.same([byAction('save-purchase').length, named(rpcCalls, 'item_file').length], [0, 2], 'م١: والإغلاق يقرأ الملفّ من جديد');
    });
    await step('R1-M1-control', async () => {
      // ضابط: رفض أكيد للإعادة (id_conflict) يُنهي «المجهول» ويعرض تلميح الخادم.
      const hint = 'هذا الشراء سُجّل بمحتوى آخر؛ أغلق النافذة وراجع الملفّ.';
      fresh({ status: 'ready', workspace: KEEPER }, suppliers, {
        item_file: async () => fileJson(),
        record_purchase: async (_args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          throw new m.RejectedError('id_conflict', hint);
        },
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await submit();
      await submit();
      await settle();
      t.ok(!text().includes('لم يُعرف إن حُفظ') && text().includes(hint), 'م١ ضابط: الرفض الأكيد يُنهي «المجهول» ويقول سببه');
    });

    // ل٧: قائمة المخازن بعد store_required: «جارٍ التحميل» أثناءها، وفشلها بزرّ «أعد المحاولة».
    await step('R1-L7', async () => {
      let rejectFirst = null;
      const { calls, rpcCalls } = fresh({ status: 'ready', workspace: MANAGER }, {
        ...suppliers,
        loadOrgSetup: () => {
          const n = calls.filter(([name]) => name === 'loadOrgSetup').length;
          if (n === 1) return new Promise((_resolve, reject) => { rejectFirst = reject; });
          return org([['w-raw', 'مخزن المواد الأوّلية'], ['w-grain', 'مخزن الحبوب']]);
        },
      }, {
        item_file: async () => fileJson(),
        record_purchase: async (args, n) => {
          if (n === 1) throw new m.RejectedError('store_required', 'اختر المخزن.');
          return recorded(args);
        },
      });
      await mount('/inventory/items/i-corn');
      await openDialog();
      await fillPurchase();
      await submit();
      await settle();
      t.ok(byAction('purchase-stores-loading')[0]?.textContent === 'جارٍ تحميل المخازن…' && byAction('pick-store').length === 0, 'ل٧: «جارٍ تحميل المخازن…» أثناء القراءة');
      rejectFirst?.(new m.RetryableError('55P03'));
      await settle();
      t.ok(text().includes('تعذّر تحميل قائمة المخازن') && byAction('retry').length === 1 && byAction('pick-store').length === 0, `ل٧: فشلها يُعرض بـ«أعد المحاولة» لا قائمة فارغة (${text().slice(-300)})`);
      await click(byAction('retry')[0]);
      await settle();
      const options = (byAction('pick-store')[0]?.options ?? []).map((o) => o.getAttribute('value')).filter(Boolean);
      t.same([named(calls, 'loadOrgSetup').length, options], [2, ['w-grain', 'w-raw']], 'ل٧: «أعد المحاولة» يقرأ من جديد فتظهر المخازن');
      choose(byAction('pick-store')[0], 'w-raw');
      await settle();
      await submit();
      await settle();
      t.same(named(rpcCalls, 'record_purchase').map((args) => args.p_warehouse), [null, 'w-raw'], 'ل٧: ثمّ الإعادة بالمخزن المختار');
    });

    // م٣: «تاريخ الانتهاء» لمادّة تتبّعه، و«وقت الفقس» للأفراخ، والمفتاحان يُرسلان دائماً.
    await step('R1-M3-expiry', async () => {
      const medicine = { id: 'i-med', name: 'مضادّ حيوي', kind: 'medicine', base_unit: 'pc', density_kg_per_l: null, archived: false, tracks_expiry: true };
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson({ item: medicine, purchases: [] }), record_purchase: async (args) => recorded(args) });
      await mount('/inventory/items/i-med');
      await openDialog();
      t.same([byAction('purchase-expiry').length, byAction('purchase-born').length], [1, 0], 'م٣: مادّة تتبّع الانتهاء: «تاريخ الانتهاء» وحده');
      await fillPurchase({ qty: '10', price: '2500' });
      await submit();
      t.ok(text().includes('اكتب تاريخ انتهاء «مضادّ حيوي».') && named(rpcCalls, 'record_purchase').length === 0, 'م٣: بلا تاريخ الانتهاء رسالة ولا إرسال');
      type(byIdSuffix('-expiry')[0], '01/12/2026');
      await settle();
      await submit();
      const args = named(rpcCalls, 'record_purchase')[0] ?? {};
      t.same([args.p_expiry_on, args.p_born_at, 'p_born_at' in args], ['2026-12-01', null, true], 'م٣: p_expiry_on باليوم المقروء، وp_born_at مفتاح بـnull');
    });
    await step('R1-M3-chick', async () => {
      const chick = { id: 'i-chick', name: 'أفراخ لاحم', kind: 'chick', base_unit: 'pc', density_kg_per_l: null, archived: false, tracks_expiry: false };
      const { rpcCalls } = fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson({ item: chick, purchases: [] }), record_purchase: async (args) => recorded(args) });
      await mount('/inventory/items/i-chick');
      await openDialog();
      t.same([byAction('purchase-expiry').length, byAction('purchase-born')[0]?.value], [0, '06/11/2026 00:00'], 'م٣: الأفراخ: «وقت الفقس» يبدأ بيوم الشراء، ولا «تاريخ انتهاء»');
      await fillPurchase({ qty: '5000', price: '650' });
      type(byAction('purchase-born')[0], 'أمس');
      await settle();
      await submit();
      t.ok(text().includes('اكتب وقت الفقس يوم/شهر/سنة ثم الساعة والدقيقة') && named(rpcCalls, 'record_purchase').length === 0, 'م٣: وقت فقس لا يُقرأ: رسالة ولا إرسال');
      type(byAction('purchase-born')[0], '05/11/2026 06:30');
      await settle();
      t.ok(text().includes('يُقرأ: 05/11/2026 الساعة 6:30'), 'م٣: والقراءة تحت الحقل');
      await submit();
      const args = named(rpcCalls, 'record_purchase')[0] ?? {};
      t.same([args.p_born_at, args.p_expiry_on, 'p_expiry_on' in args], [new Date(2026, 10, 5, 6, 30).toISOString(), null, true], 'م٣: p_born_at لحظة الفقس، وp_expiry_on مفتاح بـnull');
    });
    await step('R1-M3-plain', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson() });
      await mount('/inventory/items/i-corn');
      await openDialog();
      t.same([byAction('purchase-expiry').length, byAction('purchase-born').length], [0, 0], 'م٣: مادّة عادية بلا الحقلين');
    });
    await step('R1-M2-corrected', async () => {
      // م٢ (شاشة): سطر عليه تصحيح سعر مرحَّل يقول «مصحَّح» بجانب مجموعه.
      const rows = [purchaseRow({ line_id: 'rl-c', money: { unit_price: '440.00', line_total: '11000000.00', sell_price: '600.00', corrected: true } }), purchaseRow({ line_id: 'rl-p' })];
      fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson({ purchases: rows, purchases_count: 2 }) });
      await mount('/inventory/items/i-corn');
      const cells = all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.same([cells[4], cells[11]], ['11,000,000مصحَّح', '11,250,000'], 'م٢: «مصحَّح» على السطر المصحَّح وحده، بجانب مجموعه');
      t.eq(byAction('purchase-corrected').length, 1, 'م٢: علامة واحدة');
    });

    // ي٢: «الصفحة صغيرة سويها واسعة»: نافذتا الشراء و«أضف مادّة» عريضتان بعمودين من sm فما فوق.
    await step('R2-wide', async () => {
      fresh({ status: 'ready', workspace: KEEPER }, suppliers, { item_file: async () => fileJson(), items_overview: async () => overviewJson() });
      await mount('/inventory/items/i-corn');
      await openDialog();
      const grid = byAction('purchase-grid')[0];
      const panel = all().find((n) => n.getAttribute('role') === 'dialog' && grid && n.contains(grid));
      t.ok((panel?.getAttribute('class') ?? '').split(' ').includes('sm:max-w-3xl') && !(panel?.getAttribute('class') ?? '').includes('sm:max-w-lg'), `ي٢: نافذة الشراء عريضة (${panel?.getAttribute('class')})`);
      const cls = (grid?.getAttribute('class') ?? '').split(' ');
      t.ok(cls.includes('grid') && cls.includes('sm:grid-cols-2'), 'ي٢: وحقولها بعمودين');
      const total = byAction('purchase-total')[0]?.parentNode;
      t.ok(grid?.contains(byIdSuffix('-day')[0]) && grid.contains(byAction('purchase-qty')[0]) && (total?.getAttribute('class') ?? '').split(' ').includes('sm:col-span-2'), 'ي٢: التاريخ والكمية في الشبكة، والمجموع بعرضها');
      await unmount();
      fresh({ status: 'ready', workspace: MANAGER }, {}, { items_overview: async () => overviewJson() });
      await mount('/inventory');
      await click(byAction('add-item')[0]);
      const itemGrid = byAction('simple-item-grid')[0];
      const itemPanel = all().find((n) => n.getAttribute('role') === 'dialog' && itemGrid && n.contains(itemGrid));
      t.ok((itemPanel?.getAttribute('class') ?? '').split(' ').includes('sm:max-w-3xl') && (itemGrid?.getAttribute('class') ?? '').split(' ').includes('sm:grid-cols-2'), 'ي٢: و«أضف مادّة» عريضة بعمودين');
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
    delete globalThis.__sp;
    restore();
  }
}
