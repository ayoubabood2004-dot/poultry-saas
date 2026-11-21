// الفاتورة الاحترافيّة (عقد 0033 «ب»، المرحلة ١ من docs/SALES_PLAN.md): react-dom الحقيقي على DOM صغير (dom.mjs) يشغّل مسارات المبيعات الحقيقية (SalesRoutes:
// «فاتورة بيع جديدة» /sales/new، والفاتورة /sales/:id، والقائمة /sales)، وrepo الحقيقي (sales وpurchases وinventory: المحلّلات وبناء النداء والطلب المعلَّق)
// على core بديل يجيب بأجوبة العقد (fixtures/sales-0033-contract.json، مكتوبة باليد قبل الهجرة)، والجلسة والتنبيه وبحث الجهات والصناديق وhtml-to-image بدائل.
// وكلّ نسخة من الحزمة ذاكرة جديدة (= إعادة تحميل الصفحة)، وsessionStorage بالذاكرة يبقى بينهما.
// S التوصيل: المسار new قبل :id، ووحدة الصفحات، وhtml-to-image باسم stores-admin (خارج التثبيت المسبق)، وبلا <Navigate> (حزمة الإقلاع)، ورابط الرئيسية.
// P المحلّلات: الموادّ (مصفوفة العقد، و{ items, cash_accounts })، والنتيجة، والفاتورة الجديدة والقديمة (0021)، وصفّ القائمة الجديد والقديم؛ والشكل الغريب خطأ يسمّي خانته.
// M المرآة: الإجماليّ بالدينار الصحيح، وخصم الفاتورة بأكبر الباقي (والتعادل للسطر الأوّل)، والخصم الأكبر من السطر أو المجموع، والكمية بالأساس والسعر المقترح.
// C الفاتورة الجديدة (شاشة البيع من جديد 2026-11-18، تُساق بـsell-ui.mjs): المخزن، والبطاقات بالمتاح، والوحدات والسعر لوحدته، والباركود (الرمز الكامل يضيف
//   ومسحة ثانية تزيد)، والخصمان، والسيقان والدين الحيّ، والزرّ يسمّي النتيجة، والنداء بمفاتيح العقد، والزبون النقديّ يدفع كلّه، والمتاح يمنع، والأسعار
//   المتغيّرة تُقرّ، والطلب المعلَّق بعد إعادة التحميل يُعاد حرفاً، والرفض الأكيد يعيد ما أُرسل بمرجع جديد (ومعرّفات جديدة بعد id_conflict)، والتسليم بلا
//   مقابل يُسأل عنه، والمادّة من الرابط، والصلاحيات؛ وبعد الحفظ الفاتورة مكان الشاشة بـ?done=1.
// D الفاتورة: الورقة (السطور بوحداتها وخصوماتها، والسيقان، والدين، والبائع، والملاحظة)، و«أرسل صورة» بعرض ثابت والمشاركة أو التنزيل أو «أرسلها»، و«اطبع أو
//   احفظ PDF»، و«استلم من الزبون» بدفتر الفاتورة ودينها لمن يقبض، والزبون النقديّ، والقديمة، والملغاة بلا مبالغ.
// L القائمة: الصافي والمدفوع والدين و«زبون نقديّ» والموادّ، و«بيع جديد» ورابط ?new=1 إلى /sales/new.
// X أجوبة القاعدة الحقيقية (fixtures/sales-0033.json من supabase/tests/sales-invoice.test بـSALES_SAMPLES_OUT=1) بالمحلّلات الحقيقية، حين توجد (الدمج).
import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { descendants, Element, fire, installDom, settle, Text } from './dom.mjs';
import { sellDriver } from './sell-ui.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033-contract.json'), 'utf8'));
const LEGACY = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'money-b.json'), 'utf8')).sale_detail;
const S21 = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0021.json'), 'utf8'));
const REAL_PATH = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033.json');
const clone = (value) => JSON.parse(JSON.stringify(value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__si.call('${n}', a);`).join(' ')}`;
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__si.session; export const sessionStore = { get: () => globalThis.__si?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__si.toasts.push(spec); }; export function Toaster() { return null; }',
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createCustomer', 'listBoxes']),
  image: 'export const toBlob = (node, options) => globalThis.__si.toBlob(node, options);',
};
// core بديل لملفّات repo كلّها: call يسجّل النداء ويجيب، وsend (قراءة الجداول) لا يجيب أبداً (لا جداول في هذه الفحوص).
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__si.rpc(fn, args);
export const send = () => new Promise(() => {});
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };`;
// ملفّات repo التي تصل الخادم في هذه الشاشات (والجلسة وما يليها بـcore الحقيقي، لا تُنادى هنا).
const CORE_FOR = /src\/lib\/repo\/(?:sales|purchases|inventory|purchasing|parties|cash|statement|birdSales|weighTickets|scopes)\.ts$/u;
const plugins = [
  {
    name: 'si-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/repo\/purchasing$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'si-stub' }));
      b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'si-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'si-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'si-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'si-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
      // أنماط الشاشات (sell.css?raw في شاشة البيع، 2026-11-18): نصّ فارغ هنا.
      b.onResolve({ filter: /\.css(\?raw)?$/ }, () => ({ path: 'css', namespace: 'si-css' }));
      b.onLoad({ filter: /.*/, namespace: 'si-css' }, () => ({ contents: "export default '';", loader: 'js' }));
    },
  },
];

let bundles = 0;
/** الحزمة كلّها؛ وكلّ نداء نسخة جديدة منها (ذاكرة جديدة = إعادة تحميل الصفحة). */
async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { SalesRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export * as sales from './src/lib/repo/sales.ts';",
    "export { parseSalesOverview } from './src/lib/repo/purchases.ts';",
    "export { invoiceMath, baseQtyOf, unitPriceOf } from './src/domain/saleInvoice.ts';",
    "export { saveLabel, sentText, doneText } from './src/pages/sales/SaleCheckout.tsx';",
    "export { linesText, checkoutBack, newSalePath, INVOICE_IMAGE_WIDTH } from './src/pages/sales/saleParts.tsx';",
    "export { itemsText } from './src/pages/sales/SalesPage.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
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
    plugins,
  });
  bundles += 1;
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// sales-invoice bundle ${bundles}\n`).toString('base64')}`);
}

function memoryStorage() {
  const map = new Map();
  return { map, api: { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), clear: () => map.clear() } };
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, scope = body()) => descendants(scope).filter((n) => n.getAttribute('data-action') === name);
const first = (name, scope) => byAction(name, scope)[0] ?? null;
const textOf = (name) => first(name)?.textContent ?? null;
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click', { button: 0 });
  await settle();
};
const enter = async (input) => {
  if (!input) throw new Error('no input');
  fire(input, 'keydown', { key: 'Enter' });
  await settle();
};
const buttonOf = (label) => all().find((n) => n.localName === 'button' && n.textContent === label) ?? null;
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const sectionOf = (table, tag) => (table ? table.children.find((n) => n.localName === tag) : null);
const rowsOf = (caption) => (sectionOf(tableOf(caption), 'tbody')?.children ?? []).filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent));
const footOf = (caption) => (sectionOf(tableOf(caption), 'tfoot')?.children ?? []).filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent));
const headersOf = (caption) => (tableOf(caption) ? descendants(tableOf(caption)).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null);

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: true,
  canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const sessionOf = (role) => ({ status: 'ready', workspace: ws(role), offline: false });
const MANAGER = sessionOf('manager');
const KEEPER = sessionOf('storekeeper');
const PARTY = { id: 'p-1', name: 'أبو علي' };
const BOXES = [{ id: 'c-1', name: 'الصندوق الرئيسي' }, { id: 'c-2', name: 'حوالة زين كاش' }];
const pendingKey = (role) => `sales.invoice.pending:u-${role}:org-1`;
const SAVE_TEXT = 'احفظ — 139,000 دينار، منها 50,000 دين';

export default async function (t) {
  const restoreDom = installDom();
  const saved = {
    session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    click: Object.getOwnPropertyDescriptor(Element.prototype, 'click'),
    clone: Object.getOwnPropertyDescriptor(Element.prototype, 'cloneNode'),
    textClone: Object.getOwnPropertyDescriptor(Text.prototype, 'cloneNode'),
  };
  const storage = memoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage.api, configurable: true, writable: true });
  const printed = [];
  globalThis.window.print = () => printed.push(globalThis.document.title);
  globalThis.window.getComputedStyle = () => ({ getPropertyValue: (name) => (name === '--surface' ? ' 243 248 253 ' : '') });
  const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  // ما لا يحمله dom.mjs ويحتاجه التصوير والتنزيل: نسخ العقد، والنقر على الرابط (يُسجَّل).
  const clicked = [];
  const cloneOf = function cloneNode(deep) {
    if (this.nodeType === 3) return this.ownerDocument.createTextNode(this.nodeValue);
    if (this.nodeType === 8) return this.ownerDocument.createComment(this.nodeValue);
    const copy = this.ownerDocument.createElement(this.localName);
    for (const [key, value] of this._attrs) copy._attrs.set(key, value);
    if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
    return copy;
  };
  Element.prototype.cloneNode = cloneOf;
  Text.prototype.cloneNode = cloneOf;
  Element.prototype.click = function () {
    clicked.push({ href: this.href ?? this.getAttribute('href'), download: this.download ?? this.getAttribute('download') });
  };
  URL.createObjectURL = () => 'blob:test/1';
  URL.revokeObjectURL = () => {};
  let root = null;
  let m = null;
  let current = null;
  try {
    m = await bundle();
    current = m;
    m.onlineStore.set(true);
    let log = [];
    let captures = [];
    const fresh = (who, rpcs = {}, calls = {}) => {
      log = [];
      captures = [];
      globalThis.__si = {
        session: who,
        toasts: [],
        location: null,
        rpc(fn, args) {
          log.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          const count = log.filter(([name]) => name === fn).length;
          return Promise.resolve().then(() => handler(args, count));
        },
        call(fn, args) {
          log.push([fn, args]);
          const handler = calls[fn];
          if (!handler) return new Promise(() => {});
          return Promise.resolve().then(() => handler(...args));
        },
        async toBlob(node, options) {
          captures.push({ node, options, html: node.outerHTML, inBody: descendants(body()).includes(node) });
          return new Blob(['png'], { type: 'image/png' });
        },
      };
    };
    const named = (fn) => log.filter(([name]) => name === fn).map(([, args]) => args);
    const lastToast = () => globalThis.__si.toasts.at(-1)?.title ?? null;
    const where = () => globalThis.__si.location;
    const mount = async (url, mm = current) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = mm.createRoot(container);
      function Where() {
        const location = mm.useLocation();
        globalThis.__si.location = `${location.pathname}${location.search}`;
        return mm.h(mm.Routes, null, mm.h(mm.Route, { path: '/sales/*', element: mm.h(mm.SalesRoutes) }), mm.h(mm.Route, { path: '*', element: null }));
      }
      mm.flushSync(() => root.render(mm.h(mm.MemoryRouter, { initialEntries: [url] }, mm.h(Where))));
      await settle(40);
    };
    const unmount = async () => {
      if (!root) return;
      const mounted = root;
      root = null;
      current.flushSync(() => mounted.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      for (const role of ['manager', 'storekeeper', 'owner']) m.sales.storeSalePending(pendingKey(role), null);
      storage.map.clear();
      clicked.length = 0;
      printed.length = 0;
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      current = m;
      current.onlineStore.set(true);
    };
    const OK = { stores_overview: () => clone(F.stores_overview), sale_catalog: () => clone(F.sale_catalog) };
    const pickers = { searchSuppliers: () => ({ parties: [PARTY], total: 1 }), listBoxes: () => clone(BOXES) };

    const d = sellDriver({ body, descendants, fire, settle });
    /** فاتورة العقد (العلف كيسين بخصم 1,000 والفيتامين ثلاث علب بالباركود، وخصم الفاتورة 5,000، وأبو علي، وصندوقان 50,000 و39,000) بالشاشة الجديدة. */
    const fillContract = (options) => d.fillContract(options);
    /** سطور الفاتورة كما تعرضها السلّة: [العدّاد، الوحدة، السعر لوحدته]. */
    // [العدّاد، سطر الوحدة تحت الاسم بالوحدة كاملةً] (شريحة الوحدة أُزيلت، مراجعة التصميم D11).
    const cartRows = () => d.lines().map((line) => [first('cart-qty', line)?.textContent, first('cart-unit', line)?.textContent ?? null]);

    // ── S: التوصيل ──────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const routes = readFileSync(path.join(ROOT, 'src', 'pages', 'inventory', 'StockRoutes.tsx'), 'utf8');
      const fresh0 = routes.indexOf('path="new" element={<SaleCheckoutPage />}');
      const one = routes.indexOf('path=":id" element={<SaleDocPage />}');
      t.ok(fresh0 > 0 && one > fresh0, 'S «فاتورة بيع جديدة» /sales/new في SalesRoutes (حزمة المخزون خارج التثبيت المسبق) قبل :id');
      const write = await import(pathToFileURL(path.join(ROOT, 'scripts', 'guards', 'write-guard.mjs')).href);
      const index = readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'index.ts'), 'utf8');
      t.same([write.PAGE_MODULES.has('sales'), /\bsales\b/u.test(index)], [true, false], 'S repo/sales وحدة صفحات، وrepo/index لا يصدّرها');
      const vite = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
      t.ok(vite.split('\n').some((line) => line.includes('html-to-image') && line.includes('reportImage') && line.includes("'assets/stores-admin-[hash].js'")), 'S html-to-image ومساعدها (حزمتا القاعات والمخزون) باسم stores-admin صريحاً: خارج التثبيت المسبق');
      const salesDir = path.join(ROOT, 'src', 'pages', 'sales');
      const navigates = readdirSync(salesDir).filter((name) => /import\s*\{[^}]*\bNavigate\b[^}]*\}\s*from 'react-router-dom'/u.test(readFileSync(path.join(salesDir, name), 'utf8')));
      t.same(navigates, [], 'S بلا <Navigate> في صفحات المبيعات (يُدخل مكوّناً من react-router حزمة الإقلاع: +330 بايتاً مقيسة)');
      t.ok(readFileSync(path.join(ROOT, 'src', 'pages', 'home', 'HomePage.tsx'), 'utf8').includes("to: '/sales/new'"), 'S «بِع» في الرئيسية يفتح /sales/new');
      t.same([m.checkoutBack('/inventory/items/i-1?back=%2Finventory'), m.checkoutBack('https://evil.example'), m.checkoutBack('//x'), m.checkoutBack('/')], ['/inventory/items/i-1?back=%2Finventory', '/sales', '/sales', '/'], 'S الرجوع داخليّ وحده');
      t.eq(m.newSalePath({ item: 'i-1', store: 'w-1', back: '/inventory/items/i-1' }), '/sales/new?item=i-1&store=w-1&back=%2Finventory%2Fitems%2Fi-1', 'S طريق الفاتورة الجديدة بالمادّة والمخزن والرجوع');
    }

    // ── P: المحلّلات ────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const catalog = m.sales.parseSaleCatalog(clone(F.sale_catalog));
      t.same(
        [catalog.boxes, catalog.items.map((i) => [i.id, i.name, i.barcode, i.kind, i.category, i.baseUnit, i.available, i.sellPrice, i.units.map((u) => [u.unitId, u.label, u.factor])])],
        [null, [
          ['i-feed', 'علف بادئ', '6260000000017', 'feed', 'علف', 'kg', 1500000n, 70000n, [['u-bag', 'كيس', 50000000n], ['u-ton', 'طن', 1000000000n]]],
          ['i-vit', 'فيتامين أ د', '6260000000024', 'medicine', null, 'pc', 40000n, 250000n, [['u-box', 'علبة', 10000000n]]],
          ['i-corn', 'ذرة صفراء', null, 'raw', null, 'kg', 0n, null, []],
        ]],
        'P الموادّ: المتاح بالآلاف والسعر بالفلس والمعامل بستّ مراتب، وبلا سعر null لا صفر؛ والصناديق null (مصفوفة العقد)',
      );
      const withBoxes = m.sales.parseSaleCatalog({ items: clone(F.sale_catalog), cash_accounts: clone(BOXES) });
      t.same([withBoxes.items.length, withBoxes.boxes], [3, BOXES], 'P والشكل { items, cash_accounts }: الصناديق من الخادم (للأمين)');
      const recorded = m.sales.parseRecordedInvoice(clone(F.record_sale_v2));
      t.same(
        [recorded.saleId, recorded.docNo, recorded.total, recorded.discountTotal, recorded.paid, recorded.debt, recorded.walkIn, recorded.lines.map((l) => [l.itemId, l.qtyBase, l.lineTotal])],
        ['s-7', 'MS-2026-0007', 13900000n, 600000n, 8900000n, 5000000n, false, [['i-feed', 100000n, 6660400n], ['i-vit', 30000n, 7239600n]]],
        'P نتيجة record_sale_v2: المال نصوص بالدينار ← فلس',
      );
      const invoice = m.sales.parseSaleInvoice(clone(F.sale_detail));
      t.same(
        [invoice.legacy, invoice.walkIn, invoice.note, invoice.postedByName, invoice.grossTotal, invoice.invoiceDiscount, invoice.discountTotal, invoice.total, invoice.paid, invoice.debt, invoice.cost],
        [false, false, 'تسليم بالسيارة', 'علي', 14500000n, 500000n, 600000n, 13900000n, 8900000n, 5000000n, { cost: 11000000n, profit: 2900000n }],
        'P الفاتورة: المجاميع والخصمان والدين والبائع والملاحظة والكلفة',
      );
      t.same(
        invoice.lines.map((l) => [l.itemName, l.unitLabel, l.unitQty, l.qty, l.unitPrice, l.gross, l.lineDiscount, l.invoiceShare, l.net]),
        [['علف بادئ', 'كيس', 2000n, 100000n, 3500000n, 7000000n, 100000n, 239600n, 6660400n], ['فيتامين أ د', 'علبة', 3000n, 30000n, 2500000n, 7500000n, 0n, 260400n, 7239600n]],
        'P سطور الفاتورة بوحداتها وخصوماتها',
      );
      t.same(invoice.payments.map((p) => [p.legNo, p.cashAccountName, p.amount]), [[1, 'الصندوق الرئيسي', 5000000n], [2, 'حوالة زين كاش', 3900000n]], 'P سيقان الدفع بأسماء صناديقها');
      const walkIn = m.sales.parseSaleInvoice(clone(F.sale_detail_walk_in));
      t.same([walkIn.walkIn, walkIn.debt, walkIn.cost, walkIn.lines[0].unitLabel, walkIn.lines[0].cost], [true, 0n, null, null, null], 'P الزبون النقديّ: بلا دين، ووحدة الأساس null، وبلا كلفة لغير أدوار الكلفة');
      const legacy = m.sales.parseSaleInvoice(clone(LEGACY));
      t.same(
        [legacy.legacy, legacy.lines.length, legacy.lines[0].itemName, legacy.lines[0].unitLabel, legacy.lines[0].unitQty, legacy.total, legacy.paid, legacy.debt, legacy.payments, legacy.discountTotal],
        [true, 1, 'كسبة صويا', null, 100000n, 20000000n, 0n, 20000000n, [], 0n],
        'P فاتورة 0021 الحقيقيّة (سطر واحد في الجذر) بالمحلّل نفسه: سطر بوحدة الأساس بلا خصم، والدين المبلغ كلّه',
      );
      const overview = m.parseSalesOverview(clone(F.sales_overview));
      t.same(
        overview.rows.map((r) => [r.docNo, r.lineCount, r.walkIn, r.qty, r.baseUnit, r.payment, r.money]),
        [
          ['MS-2026-0008', 1, true, 100000n, 'kg', 'cash', { unitPrice: 70000n, lineTotal: 7000000n, paid: 7000000n, debt: 0n, open: 0n, discountTotal: 0n }],
          ['MS-2026-0007', 2, false, null, null, 'mixed', { unitPrice: null, lineTotal: 13900000n, paid: 8900000n, debt: 5000000n, open: 5000000n, discountTotal: 600000n }],
        ],
        'P صفّ القائمة بشكل 0033: عدد السطور والنقديّ، والكمية لسطر واحد وحده، والصافي والمدفوع والدين والخصم',
      );
      const old = m.parseSalesOverview(clone(S21.sales_overview.owner));
      t.ok(
        old.rows.every((r) => r.lineCount === 1 && !r.walkIn && r.qty !== null && r.money && r.money.discountTotal === 0n && r.money.paid + r.money.debt === r.money.lineTotal && r.money.paid === (r.payment === 'cash' ? r.money.lineTotal : 0n)),
        'P صفّ 0021 الحقيقيّ: سطر واحد، والمدفوع المبلغ كلّه للنقد وصفر للدين',
      );
      const shape = (label, value, parse, field) => {
        try {
          parse(value);
          t.ok(false, `P ${label}: لم يرمِ`);
        } catch (error) {
          t.same([error?.name, error?.field], ['SaleShapeError', field], `P ${label}: خطأ شكل يسمّي خانته`);
        }
      };
      shape('متاح رقماً لا نصّاً', [{ ...clone(F.sale_catalog[0]), available: 1500 }], m.sales.parseSaleCatalog, 'available');
      shape('وحدة بلا معامل', [{ ...clone(F.sale_catalog[0]), units: [{ unit_id: 'u', label: 'كيس' }] }], m.sales.parseSaleCatalog, 'factor');
      shape('نوع مجهول', [{ ...clone(F.sale_catalog[0]), kind: 'gold' }], m.sales.parseSaleCatalog, 'kind');
      shape('دين مفقود', { ...clone(F.record_sale_v2), debt: undefined }, m.sales.parseRecordedInvoice, 'debt');
      shape('سطر بلا صافي', { ...clone(F.sale_detail), lines: [{ ...clone(F.sale_detail.lines[0]), line_total: null }] }, m.sales.parseSaleInvoice, 'line_total');
      shape('ساق بلا صندوق', { ...clone(F.sale_detail), payments: [{ leg_no: 1, cash_account_id: 'c-1', amount: '1' }] }, m.sales.parseSaleInvoice, 'account_name');
      try {
        m.parseSalesOverview({ ...clone(F.sales_overview), rows: [{ ...clone(F.sales_overview.rows[1]), payment: 'half' }] });
        t.ok(false, 'P دفع مجهول: لم يرمِ');
      } catch (error) {
        t.eq(error?.field, 'payment', 'P دفع مجهول في صفّ القائمة: خطأ يسمّي خانته');
      }
    }

    // ── M: المرآة ───────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const math = m.invoiceMath([{ unitQty: 2000n, unitPrice: 3500000n, discount: 100000n }, { unitQty: 3000n, unitPrice: 2500000n, discount: 0n }], 500000n);
      const invoice = m.sales.parseSaleInvoice(clone(F.sale_detail));
      t.same(
        [math.gross, math.shares, math.nets, math.grossTotal, math.discountTotal, math.total],
        [invoice.lines.map((l) => l.gross), invoice.lines.map((l) => l.invoiceShare), invoice.lines.map((l) => l.net), invoice.grossTotal, invoice.discountTotal, invoice.total],
        'M المعاينة = الفاتورة: الإجماليّ والأنصبة بأكبر الباقي (2,396 و2,604) والصوافي والصافي 139,000',
      );
      t.same(m.invoiceMath([{ unitQty: 1000n, unitPrice: 1000n, discount: 0n }, { unitQty: 1000n, unitPrice: 1000n, discount: 0n }], 100n).shares, [100n, 0n], 'M التعادل في الباقي للسطر الأوّل (ترتيب السطور)');
      const over = m.invoiceMath([{ unitQty: 1000n, unitPrice: 100000n, discount: 200000n }], 0n);
      t.same([over.overLines, over.shares, over.nets], [[0], null, null], 'M خصم السطر أكبر من إجماليّه: لا توزيع');
      t.same(m.invoiceMath([{ unitQty: 1000n, unitPrice: 100000n, discount: 0n }], 200000n).invoiceOver, true, 'M خصم الفاتورة أكبر من المجموع');
      t.same(m.invoiceMath([{ unitQty: 1500n, unitPrice: 33333n, discount: 0n }], 0n).gross, [50000n], 'M الإجماليّ مقرَّب لأقرب دينار (499.995 ← 500)');
      t.same([m.baseQtyOf(2000n, 50_000_000n), m.unitPriceOf(70000n, 50_000_000n), m.baseQtyOf(1500n, 1_000_000n)], [100000n, 3500000n, 1500n], 'M الكمية بالأساس والسعر المقترح لوحدة السطر');
      t.same([1, 2, 3, 11, 100].map((n) => m.linesText(n)), ['مادّة واحدة', 'مادّتان', '3 موادّ', '11 مادّةً', '100 مادّة'], 'M عدد الموادّ بالفصحى');
    }

    // ── C: الفاتورة الجديدة ─────────────────────────────────────────────────────────────────────────────────────────
    await step('C1 contract invoice', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new');
      t.same(byAction('sale-store-option').map((o) => o.textContent), ['المخزن العام', 'رصيد العلف'], 'C1 مخازن البيع وحدها (لا مخزن القاعة)');
      t.eq(named('sale_catalog').length, 0, 'C1 بلا مخزن مختار لا موادّ');
      await d.store('w-gen');
      t.same(named('sale_catalog'), [{ p_warehouse: 'w-gen' }], 'C1 موادّ المخزن المختار');
      const cards = byAction('sale-item-card');
      t.same(
        cards.map((n) => [n.getAttribute('data-item'), n.hasAttribute('disabled')]),
        [['i-corn', true], ['i-feed', false], ['i-vit', false]],
        'C1 بطاقات الموادّ (بلا مبيع في 30 يوماً: بالاسم)، والنافدة معطّلة',
      );
      t.ok(d.card('i-feed').textContent.includes('عندك 1,500 كغم') && d.card('i-feed').textContent.includes('700 / كغم') && d.card('i-corn').textContent.includes('نفد من هذا المخزن'), 'C1 البطاقة بالمتاح وسعر البيع لوحدتها');
      await d.tap('i-feed');
      const units = d.units().map(([, label]) => label);
      await d.unit('u-bag');
      await d.keys('2');
      const readBack = textOf('line-read-back');
      const price = [];
      await d.tab('price');
      price.push(d.display());
      await d.tab('discount');
      await d.keys('1000');
      await d.done();
      await d.scan('6260000000024');
      await d.openLineOf('i-vit');
      await d.unit('u-box');
      await d.tab('price');
      price.push(d.display());
      await d.tab('qty');
      await d.keys('3');
      await d.done();
      t.same(price, ['35,000', '25,000'], 'C1 السعر لوحدة السطر من سعر البيع × المعامل (الكيس 35,000 والعلبة 25,000)');
      t.same(units, ['كيس', 'طن', 'كغم'], 'C1 الوحدات شرائح: وحدات البيع ثمّ الأساس');
      t.eq(readBack, '= 100 كغم', 'C1 الكمية بالأساس تحت قيمة الكيس');
      t.eq(d.cardQty('i-feed'), '2 كيس', 'C1 المادّة في الفاتورة صارت عدّاداً على بطاقتها');
      await d.openCart();
      d.discountText('5000');
      d.note('تسليم بالسيارة');
      await settle();
      const caption = 'ملخّص الفاتورة قبل الحفظ';
      t.same(
        rowsOf(caption),
        [['علف بادئ', '2', 'كيس', '35,000', '70,000', '1,000', '2,396', '66,604'], ['فيتامين أ د', '3', 'علبة', '25,000', '75,000', '0', '2,604', '72,396']],
        'C1 الملخّص: خصم الفاتورة موزَّع بأكبر الباقي',
      );
      t.same(footOf(caption), [['المجموع', '145,000', '1,000', '5,000', '139,000']], 'C1 ومجاميعه');
      await d.next();
      await d.party('أبو');
      await d.payKind('part');
      await d.keys('50000');
      await d.addLeg();
      await d.keys('39000');
      await d.padDone();
      t.same(
        ['sale-total-gross', 'sale-total-discount', 'sale-total-net'].map(textOf),
        ['الإجمالي 145,000', 'الخصم 6,000', '139,000 دينار'],
        'C1 المطلوب بالإجماليّ والخصم والصافي',
      );
      t.eq(textOf('sale-debt-live'), 'المدفوع الآن 89,000 دينار، ويبقى ديناً على «أبو علي»: 50,000 دينار.', 'C1 الدين حيّاً بجملة');
      t.same(byAction('leg-box').map((n) => n.textContent), ['في «الصندوق الرئيسي»', 'في «حوالة زين كاش»'], 'C1 الساق الأولى بأوّل صندوق، و«+ صندوق آخر» بالصندوق الباقي');
      t.eq(textOf('save-invoice'), SAVE_TEXT, 'C1 الزرّ الواحد يسمّي النتيجة');
      await d.save();
      await settle(30);
      t.eq(named('sale_catalog').length, 2, 'C1 قبل الحفظ تُقرأ الأسعار والمتاح من جديد');
      const [args] = named('record_sale_v2');
      t.same(
        [
          UUID.test(args?.p_client_ref ?? ''), UUID.test(args?.p_sale_id ?? ''), args?.p_warehouse, args?.p_party, args?.p_sold_on,
          args?.p_lines.map((l) => [UUID.test(l.line_id), l.item_id, l.unit_id, l.qty, l.unit_price, l.discount]),
          args?.p_invoice_discount, args?.p_payments.map((p) => [UUID.test(p.leg_id), p.cash_account_id, p.amount]), args?.p_note,
        ],
        [
          true, true, 'w-gen', 'p-1', '2026-11-17',
          [[true, 'i-feed', 'u-bag', '2.000', '35000.00', '1000'], [true, 'i-vit', 'u-box', '3.000', '25000.00', '0']],
          '5000', [[true, 'c-1', '50000'], [true, 'c-2', '39000']], 'تسليم بالسيارة',
        ],
        'C1 record_sale_v2 بمفاتيح العقد: الكمية والسعر لوحدة السطر والخصم والسيقان بالدينار الصحيح',
      );
      t.same(Object.keys(args ?? {}).sort(), ['p_client_ref', 'p_invoice_discount', 'p_lines', 'p_note', 'p_party', 'p_payments', 'p_sale_id', 'p_sold_on', 'p_warehouse'], 'C1 بمعاملات العقد التسعة وحدها');
      t.same(
        [where(), storage.map.has(pendingKey('manager')), named('sale_detail'), lastToast()],
        ['/sales/s-7?done=1', false, [{ p_sale: 's-7' }], null],
        'C1 ثمّ الفاتورة مكان الشاشة بحالة النجاح (?done=1)، والطلب المعلَّق ممحوّ، وبلا تنبيه فوقها',
      );
      t.eq(m.doneText(m.sales.parseRecordedInvoice(clone(F.record_sale_v2))), 'حُفظت الفاتورة MS-2026-0007: 139,000 دينار، المدفوع 89,000 دينار، والباقي دين 50,000 دينار.', 'C1 جملة «حُفظت» من جواب الخادم (تنبيه حين حُفظت بعد مغادرة الشاشة)');
    });

    await step('C2 walk-in', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2_walk_in) }, { ...pickers, listBoxes: () => [BOXES[0]] });
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      t.ok(d.lineSheet() !== null, 'C2 مادّة تُوزن بالكيلو: لمسها يفتح ورقتها لكتابة الكمية');
      await d.keys('100');
      await d.done();
      await d.next();
      t.same(
        [buttonOf('زبون نقديّ')?.getAttribute('aria-checked'), d.pick('pay-kind', 'data-kind', 'cash')?.getAttribute('aria-checked'), byAction('sale-party-needed').length],
        ['true', 'true', 0],
        'C2 الافتراض بقول المالك: زبون نقديّ ونقداً كلّه، بلا اسم يُطلب',
      );
      await d.payKind('part');
      await d.keys('50000');
      await d.save();
      t.ok(textOf('sale-pay-error')?.includes('الزبون النقديّ يدفع المبلغ كلّه الآن (70,000 دينار)') && named('record_sale_v2').length === 0 && named('sale_catalog').length === 1, 'C2 نقديّ دفع جزءاً: يُقال قبل الإرسال ولا يُقرأ شيء');
      await d.payKind('cash');
      t.same([first('cash-box') === null && d.paySheet().textContent.includes('في «الصندوق الرئيسي»'), textOf('save-invoice')], [true, 'احفظ — 70,000 دينار مدفوعة كلّها'], 'C2 «نقداً كلّه» بالصندوق الوحيد والصافي كلّه');
      await d.save();
      await settle(30);
      const [args] = named('record_sale_v2');
      t.same([args?.p_party, args?.p_payments.map((p) => [p.cash_account_id, p.amount]), args?.p_lines[0].unit_id, args?.p_lines[0].unit_price], [null, [['c-1', '70000']], null, '700.00'], 'C2 p_party null للزبون النقديّ، ووحدة الأساس unit_id null');
      t.eq(where(), '/sales/s-8?done=1', 'C2 ثمّ الفاتورة بحالة النجاح');
    });

    await step('C3 over available', async () => {
      fresh(KEEPER, { ...OK, sale_catalog: () => ({ items: clone(F.sale_catalog), cash_accounts: [BOXES[0]] }) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.unit('u-bag');
      await d.keys('40');
      t.eq(textOf('line-error'), 'المتاح في «المخزن العام» 30 كيساً فقط؛ لا يُحفظ أكثر منه.', 'C3 تحذير بالمتاح حيّاً تحت الكمية بوحدة السطر (40 كيساً والمتاح 30 كيساً)');
      await d.done();
      await d.next();
      await d.save();
      t.same([named('sale_catalog').length, named('record_sale_v2').length, textOf('line-error')], [1, 0, 'المتاح في «المخزن العام» 30 كيساً فقط؛ لا يُحفظ أكثر منه.'], 'C3 أكثر من المتاح لا يُرسل، ويُفتح السطر على خطئه');
      t.eq(named('listBoxes').length, 0, 'C3 الصناديق من الخادم مع الموادّ (الأمين لا يقرأ جدولها)');
      await d.clearValue();
      await d.keys('1.5');
      await d.done();
      await click(first('sheet-close', d.paySheet()));
      await d.scan('6260000000024');
      await d.openLineOf('i-vit');
      await d.unit('u-box');
      await d.keys('0.25');
      await d.done();
      await d.next();
      await d.save();
      t.eq(textOf('line-error'), 'القطع تُعدّ عدداً صحيحاً.', 'C3 القطع بالأساس عدد صحيح (ربع علبة = 2.5 قطعة)');
      await d.done();
      await click(first('sheet-close', d.paySheet()));
      await d.scan('999');
      t.eq(textOf('sale-scan-note'), 'لا مادّة بالباركود «999» تُباع من «المخزن العام».', 'C3 الرمز المجهول يُقال برمزه');
    });

    await step('C4 barcode', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.scan('٦٢٦٠٠٠٠٠٠٠٠٢٤');
      t.same([d.cardQty('i-vit'), first('sale-search')?.value], ['1 قطعة', ''], 'C4 الرمز الكامل (أرقام شرقية تُقلب) يضيف واحداً ويفرّغ البحث');
      await d.scan('6260000000024');
      await d.openCart();
      t.same([d.lines().length, d.cardQty('i-vit')], [1, '2 قطعة'], 'C4 مسحة ثانية للمادّة نفسها تزيد السطر نفسه');
      await click(first('sheet-close', d.cartSheet()));
      type(first('sale-search'), 'فيتا');
      await settle(20);
      await enter(first('sale-search'));
      t.same([d.cardQty('i-vit'), first('sale-search')?.value], ['3 قطعة', ''], 'C4 Enter على اسم لا يطابق غير مادّة واحدة يضيفها (ويزيد سطرها)');
    });

    for (const [label, action, price] of [['update', 'prices-update', '37500.00'], ['keep', 'prices-keep', '35000.00']]) {
      await step(`C5 prices ${label}`, async () => {
        const changed = clone(F.sale_catalog);
        changed[0].sell_price = '750.00';
        fresh(MANAGER, { ...OK, sale_catalog: (_args, n) => (n === 1 ? clone(F.sale_catalog) : clone(changed)), record_sale_v2: () => clone(F.record_sale_v2) }, pickers);
        await mount('/sales/new');
        await fillContract();
        await d.save();
        await settle(20);
        t.same(
          [textOf('prices-changes'), named('record_sale_v2').length],
          ['«علف بادئ»: كان 35,000 دينار لكل كيس، وصار 37,500 دينار.', 0],
          `C5 ${label}: السعر المتغيّر يُعرض قبل الحفظ ولا يُرسل شيء`,
        );
        await click(first(action));
        await settle(20);
        if (label === 'update') {
          t.same([named('record_sale_v2').length, textOf('sale-notice'), textOf('sale-blocked')], [0, 'حُدّثت الأسعار في الفاتورة؛ راجع المجموع ثمّ احفظ.', 'حُدّثت الأسعار في الفاتورة؛ راجع المجموع ثمّ احفظ.'], 'C5 «اعتمد الأسعار الجديدة» يعيد التسعير ويعود للمراجعة');
          await d.save();
          await settle(20);
        }
        t.same(named('record_sale_v2').map((a) => a.p_lines[0].unit_price), [price], `C5 ${label}: يُحفظ بما أقرّه البائع`);
      });
    }

    await step('C6 pending and reload', async () => {
      let calls = 0;
      fresh(MANAGER, {
        ...OK,
        record_sale_v2: () => {
          calls += 1;
          if (calls === 1) throw new m.UnknownOutcomeError('fetch_failed');
          return clone(F.record_sale_v2);
        },
      }, pickers);
      await mount('/sales/new');
      await fillContract();
      await d.save();
      await settle(30);
      const sent = 'المرسَل: فاتورة من «المخزن العام» لـ«أبو علي»: علف بادئ 2 كيس، فيتامين أ د 3 علبة — الصافي 139,000 دينار، المدفوع الآن 89,000 دينار، والباقي دين 50,000 دينار.';
      t.same([byAction('sale-frozen').length, textOf('sale-sent'), storage.map.has(pendingKey('manager'))], [1, sent, true], 'C6 نتيجة مجهولة: الشاشة مجمَّدة بالطلب، والطلب في sessionStorage');
      await unmount();
      // إعادة تحميل الصفحة: نسخة جديدة من الحزمة (ذاكرة جديدة) وsessionStorage باقٍ.
      const m2 = await bundle();
      current = m2;
      m2.onlineStore.set(true);
      await mount('/sales/new', m2);
      t.same([byAction('sale-frozen').length, textOf('sale-sent'), byAction('save-invoice').length], [1, sent, 0], 'C6 بعد إعادة التحميل تعود الشاشة مجمَّدة بالطلب نفسه، بلا زرّ حفظ جديد');
      await click(first('sale-retry'));
      await settle(30);
      const [a, b] = named('record_sale_v2');
      t.same(b, a, 'C6 «أعد المحاولة» ترسل الطلب نفسه حرفاً (المرجع ومعرّف الفاتورة والسطور والسيقان)');
      t.same([where(), storage.map.has(pendingKey('manager'))], ['/sales/s-7?done=1', false], 'C6 ثمّ الفاتورة، والطلب ممحوّ');
    });

    for (const [label, code, newSale] of [['refused', 'insufficient_stock', false], ['id_conflict', 'id_conflict', true]]) {
      await step(`C7 sure refusal ${label}`, async () => {
        let calls = 0;
        fresh(MANAGER, {
          ...OK,
          record_sale_v2: () => {
            calls += 1;
            if (calls === 1) throw new m.UnknownOutcomeError('fetch_failed');
            // الرفض بصنف الحزمة الجارية (بعد إعادة التحميل: نسختها الثانية).
            if (calls === 2) throw new current.RejectedError(code, code === 'id_conflict' ? 'معرّف الفاتورة مستعمل بمحتوى آخر.' : 'المتاح من «علف بادئ» 50 كغم فقط.');
            return clone(F.record_sale_v2);
          },
          // id_conflict «ربّما حُفظت»: تُقرأ الفاتورة بمعرّفها أوّلاً (مراجعة البيع S1)؛ غيابها يجعل الرفض أكيداً.
          sale_detail: () => {
            throw new current.RejectedError('doc_not_found', 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.');
          },
        }, pickers);
        await mount('/sales/new');
        await fillContract();
        await d.save();
        await settle(30);
        await unmount();
        const m2 = await bundle();
        current = m2;
        m2.onlineStore.set(true);
        await mount('/sales/new', m2);
        await click(first('sale-retry'));
        await settle(30);
        t.ok(textOf('sale-failure')?.includes(code === 'id_conflict' ? 'معرّف الفاتورة مستعمل' : 'المتاح من «علف بادئ»'), `C7 ${label}: تلميح الخادم كما هو`);
        await d.openCart();
        const restored = [byAction('sale-frozen').length, cartRows(), first('sale-invoice-discount')?.value, storage.map.has(pendingKey('manager'))];
        await d.next();
        t.same(
          [...restored, byAction('pay-amount').map((n) => n.textContent)],
          [0, [['2 كيس', '35,000 لكل كيس'], ['3 علبة', '25,000 لكل علبة']], '5000', false, ['50,000 دينار', '39,000 دينار']],
          `C7 ${label}: الرفض الأكيد يعيد ما أُرسل إلى الفاتورة (بعد إعادة التحميل)، والطلب ممحوّ`,
        );
        await d.save();
        await settle(30);
        const [first1, , third] = named('record_sale_v2');
        t.same(
          [third?.p_client_ref !== first1?.p_client_ref, third?.p_sale_id === first1?.p_sale_id, third?.p_lines.every((l, i) => l.line_id === first1?.p_lines[i].line_id)],
          [true, !newSale, !newSale],
          `C7 ${label}: الإرسال التالي بمرجع جديد${newSale ? ' ومعرّفات فاتورة وسطور جديدة' : ' ومعرّف الفاتورة نفسه'}`,
        );
      });
    }

    await step('C8 free delivery to a new customer', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone({ ...F.record_sale_v2, total: '0', paid: '0', debt: '0', discount_total: '0' }) }, {
        ...pickers,
        searchSuppliers: () => ({ parties: [], total: 0 }),
        supplierTwins: () => [],
        createCustomer: (name) => ({ id: 'p-new', name }),
      });
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.keys('10');
      await d.tab('price');
      await d.keys('0');
      await d.done();
      await d.next();
      type(first('sale-party-search'), 'مزرعة الجار');
      await settle(20);
      t.eq(textOf('create-party'), 'زبون جديد: أضف «مزرعة الجار»', 'C8 «زبون جديد» بالاسم المكتوب');
      await click(first('create-party'));
      await settle(20);
      t.same(named('createCustomer'), [['مزرعة الجار']], 'C8 بعد فحص التوائم يُضاف زبوناً');
      t.eq(textOf('save-invoice'), 'احفظ — مادّة واحدة بلا مقابل', 'C8 الزرّ يقول «بلا مقابل»');
      await d.save();
      await settle(20);
      t.same([byAction('confirm-free-invoice').length, named('record_sale_v2').length], [1, 0], 'C8 تأكيد صريح قبل الإرسال');
      await click(first('confirm-free-invoice'));
      await settle(20);
      t.same(named('record_sale_v2').map((a) => [a.p_party, a.p_lines[0].unit_price, a.p_payments]), [['p-new', '0.00', []]], 'C8 ثمّ يُرسل للزبون الجديد بسعر صفر بلا سيقان');
    });

    await step('C9 item from link', async () => {
      fresh(KEEPER, { ...OK, sale_catalog: () => ({ items: clone(F.sale_catalog), cash_accounts: [BOXES[0]] }) }, pickers);
      await mount('/sales/new?item=i-vit&store=w-gen&back=%2Finventory%2Fitems%2Fi-vit');
      await d.openCart();
      t.same(
        [d.lines().map((n) => n.getAttribute('data-item')), cartRows()[0]?.[1], first('back')?.getAttribute('href'), first('back')?.textContent],
        [['i-vit'], '2,500 لكل قطعة', '/inventory/items/i-vit', 'رجوع'],
        'C9 «بِع» من ملفّ المادّة: المادّة في الفاتورة بمخزنها وسعرها، والرجوع إلى الملفّ',
      );
    });

    await step('C11 typed price follows the unit', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.tab('price');
      await d.keys('800');
      const prices = [];
      for (const unit of ['u-bag', 'u-ton', '']) {
        await d.unit(unit);
        await d.tab('price');
        prices.push(d.display());
      }
      t.same(prices, ['40,000', '800,000', '800'], 'C11 السعر الذي كتبه البائع (800 للكيلو) يتحوّل مع الوحدة بالسعر نفسه للأساس، لا يبقى رقم الكيلو على الكيس');
    });

    await step('C12 cart changed during the price check', async () => {
      let release = null;
      fresh(MANAGER, {
        ...OK,
        sale_catalog: (_args, n) => (n === 1 ? clone(F.sale_catalog) : new Promise((resolve) => { release = () => resolve(clone(F.sale_catalog)); })),
        record_sale_v2: () => clone(F.record_sale_v2),
      }, pickers);
      await mount('/sales/new');
      await fillContract();
      await d.save();
      // أثناء القراءة والإرسال الشاشة مقفلة (مراجعة البيع S8): العدّاد لا يغيّر الفاتورة تحت الطلب، فالمرسَل هو المعروض.
      const plus = first('card-plus', d.cell('i-vit'));
      fire(plus, 'click', { button: 0 });
      await settle();
      const shownQty = d.cardQty('i-vit');
      release();
      await settle(20);
      t.same(
        [plus?.hasAttribute('disabled'), shownQty, named('record_sale_v2').length, named('record_sale_v2')[0]?.p_lines.map((l) => l.qty)],
        [true, '3 علبة', 1, ['2.000', '3.000']],
        'C12 أثناء قراءة الأسعار لا تتغيّر الفاتورة (العدّاد مقفل)، فالمرسَل هو المعروض',
      );
    });

    await step('C10 roles', async () => {
      fresh(sessionOf('viewer'), OK, pickers);
      await mount('/sales/new');
      t.same([text().includes('دورك لا يبيع'), log.length > 0], [false, true], 'C10 المشاهد يبيع (0034: sale.record لكلّ عضو): بلا جملة المنع، والقراءة تبدأ');
    });

    // ── D: الفاتورة ────────────────────────────────────────────────────────────────────────────────────────────────
    const CAPTION = 'سطور الفاتورة MS-2026-0007';
    await step('D1 paper', async () => {
      fresh(MANAGER, { sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/s-7');
      t.same(named('sale_detail'), [{ p_sale: 's-7' }], 'D1 النداء بالفاتورة');
      // الورقة (تصميم المبيعات ٦): كلّ سطر بإجماليّه قبل الخصم، والخصم مرّة واحدة في التذييل (لا موزَّعاً على السطور بمبالغ غريبة).
      t.same(headersOf(CAPTION), ['المادّة', 'الكمية', 'الوحدة', 'السعر', 'المبلغ'], 'D1 أعمدة الورقة: الإجماليّ بلا عمودي الخصم');
      t.same(rowsOf(CAPTION), [['علف بادئ', '2', 'كيس', '35,000', '70,000'], ['فيتامين أ د', '3', 'علبة', '25,000', '75,000']], 'D1 السطور بوحداتها وإجماليّها');
      t.same(footOf(CAPTION), [['المجموع', '145,000'], ['الخصم', '-6,000']], 'D1 المجموع ثمّ الخصم مرّة واحدة (خصم السطر + خصم الفاتورة)');
      t.same(
        ['sale-paper-customer', 'sale-paper-store', 'sale-paper-total', 'sale-paper-paid', 'sale-paper-open', 'sale-paper-note', 'sale-paper-seller', 'sale-paper-thanks'].map(textOf),
        [
          'الزبون:أبو علي', null, 'الصافي:139,000 دينار',
          'المدفوع عند البيع:89,000 دينار', 'الباقي:50,000 دينار', 'ملاحظة: تسليم بالسيارة', 'البائع: علي', 'شكراً لتعاملكم',
        ],
        'D1 الورقة: الزبون والصافي والمدفوع (بلا أسماء صناديق المنشأة ولا مخزنها الداخليّ، مراجعة D24 وQ6) والباقي والملاحظة والبائع',
      );
      t.eq(byAction('sale-paper-debt').length, 0, 'D1 «دين عند البيع» لا يُكرَّر حين يساوي الباقي');
      t.ok(textOf('sale-paper-words')?.length > 10 && textOf('org-name') === 'مشروع الدواجن' && textOf('sale-paper-no') === 'رقم: MS-2026-0007' && (first('sale-paper-logo')?.getAttribute('src') ?? '').startsWith('data:image/svg+xml,'), 'D1 الشعار (مضمَّناً، مراجعة D5) واسم المنشأة والرقم والمبلغ كتابةً');
      t.same([textOf('sale-status'), textOf('sale-party'), textOf('sale-net'), textOf('sale-paid-sofar'), textOf('sale-open'), byAction('sale-payment').length], ['جزء مدفوع', 'أبو علي', '139,000دينار', '89,000', '50,000', 0], 'D1 بطاقة الإيصال: الحالة شريحةً والزبون والصافي والمدفوع والباقي (بلا جملة تكرّر الشريحة)');
      const lines = 'موادّ الفاتورة MS-2026-0007';
      t.same(headersOf(lines), ['المادّة والكمية', 'المبلغ'], 'D1 موادّ الصفحة بأعمدة الهاتف');
      t.same(rowsOf(lines), [['علف بادئ2 كيس × 35,000خصم السطر 1,000', '70,000'], ['فيتامين أ د3 علبة × 25,000', '75,000']], 'D1 المادّة وتحتها الكمية × السعر (وخصم السطر)، والمبلغ إجماليّه');
      t.same(footOf(lines), [['المجموع قبل الخصم', '145,000'], ['الخصم', '-6,000'], ['الصافي', '139,000']], 'D1 والتذييل: المجموع ثمّ الخصم ثمّ الصافي');
      // الكلفة والربح مطويّان خلف «الربح» (مراجعة D18: الهاتف يواجه الزبون عند الكاونتر).
      t.same([byAction('sale-cost').length, first('profit-toggle')?.getAttribute('aria-expanded')], [0, 'false'], 'D1 الربح مطويّ افتراضياً');
      await click(first('profit-toggle'));
      const stats = all().filter((n) => n.localName === 'dt').map((n) => `${n.textContent}=${n.nextSibling?.textContent}`);
      t.ok(stats.includes('كلفة المبيع=110,000 دينار') && stats.includes('الربح=29,000 دينار'), 'D1 الكلفة والربح لأدوار الكلفة');
      t.ok(textOf('collect-sale') === 'استلم دفعة' && textOf('collect-note') === '«استلم دفعة» يسجّل قبضاً على حساب «أبو علي» يُسدِّد أقدم ديونه أوّلاً، والمعاينة قبل الحفظ تسمّي ما يُسدَّد.', 'D1 «استلم دفعة» لمن يقبض، ويقول إنّ القبض يُسدّد الأقدم أوّلاً');
      await click(first('print-sale'));
      t.same(printed, ['فاتورة بيع MS-2026-0007'], 'D1 «PDF» بعنوان الفاتورة (اسم ملفّ PDF)');
      t.ok(all().some((n) => n.localName === 'style' && n.textContent.includes('size: A5 portrait')), 'D1 الطباعة A5');
      await click(first('collect-sale'));
      await settle(20);
      const amount = all().find((n) => n.localName === 'input' && (n.getAttribute('id') ?? '').endsWith('-amount'));
      t.same([amount?.value, text().includes('قبضنا'), text().includes('أبو علي')], ['50000', true, true], 'D1 «استلم» يفتح «قبضنا» بالزبون ومبلغ الباقي');
    });

    await step('D2 image share', async () => {
      const shared = [];
      setNavigator({ onLine: true, canShare: (data) => Array.isArray(data?.files) && data.files.every((f) => f.type === 'image/png'), share: async (data) => shared.push(data) });
      fresh(MANAGER, { sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/s-7');
      await click(first('send-image'));
      await settle(20);
      const [capture] = captures;
      const file = shared[0]?.files?.[0];
      t.same(
        [captures.length, capture?.inBody, capture?.node.hasAttribute('data-capture'), capture?.node.getAttribute('data-action'), capture?.node.style.width, capture?.options?.width, capture?.html.includes('data-action="sale-paper-total"')],
        [1, true, true, 'sale-paper', `${m.INVOICE_IMAGE_WIDTH}px`, 560, true],
        'D2 الصورة نسخة من ورقة الفاتورة بـdata-capture في المستند وبعرض ثابت 560',
      );
      t.same([shared.length, file?.type, file?.name, shared[0]?.title, all().filter((n) => n.hasAttribute('data-capture')).length, clicked.length], [1, 'image/png', 'invoice-MS-2026-0007.png', 'فاتورة بيع MS-2026-0007', 0, 0], 'D2 ثمّ نافذة المشاركة بملفّ PNG باسم الفاتورة، والنسخة أُزيلت');
    });

    await step('D3 image blocked then download', async () => {
      let tries = 0;
      setNavigator({ onLine: true, canShare: () => true, share: async () => { tries += 1; if (tries === 1) throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } });
      fresh(MANAGER, { sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/s-7');
      await click(first('send-image'));
      await settle(20);
      t.eq(byAction('image-ready').length, 1, 'D3 رفض المتصفّح فتح المشاركة بعد التجهيز: الصورة جاهزة بزرّ «أرسلها»');
      await click(first('send-ready'));
      await settle(20);
      t.same([tries, byAction('image-ready').length, captures.length], [2, 0, 1], 'D3 «أرسلها» بضغطة جديدة بالصورة نفسها');
      setNavigator({ onLine: true });
      await click(first('send-image'));
      await settle(20);
      t.same([clicked.at(-1)?.download, lastToast()?.includes('invoice-MS-2026-0007.png')], ['invoice-MS-2026-0007.png', true], 'D3 بلا مشاركة بالملفّات: تُنزَّل ويُقال أين');
    });

    await step('D4 keeper and walk-in', async () => {
      fresh(KEEPER, { sale_detail: () => clone(F.sale_detail_walk_in) }, pickers);
      await mount('/sales/s-8');
      t.same(
        [textOf('sale-paper-customer'), byAction('sale-paper-open').length, byAction('collect-sale').length, textOf('sale-status'), all().filter((n) => n.localName === 'dt').map((n) => n.textContent).includes('الربح')],
        ['الزبون:زبون نقديّ', 0, 0, 'مدفوعة', false],
        'D4 الزبون النقديّ بلا باقٍ ولا «استلم»، وحالته «مدفوعة»، والأمين بلا كلفة',
      );
      t.same(rowsOf('سطور الفاتورة MS-2026-0008'), [['علف بادئ', '100', 'كغم', '700', '70,000']], 'D4 سطر بوحدة الأساس بلا خصم');
    });

    await step('D5 legacy and void', async () => {
      fresh(MANAGER, { sale_detail: () => clone(LEGACY) }, pickers);
      await mount(`/sales/${LEGACY.id}`);
      t.same([rowsOf(`سطور الفاتورة ${LEGACY.doc_no}`), textOf('sale-paper-paid'), textOf('sale-paper-open')], [[['كسبة صويا', '100', 'كغم', '2,000', '200,000']], 'المدفوع عند البيع:لا شيء (المبلغ كلّه بالدين)', 'الباقي:200,000 دينار'], 'D5 فاتورة 0021 الحقيقيّة على الورقة نفسها');
      await unmount();
      fresh(MANAGER, { sale_detail: () => ({ ...clone(F.sale_detail), status: 'void', void_reason: 'بيع مكرّر', can_void: false }) }, pickers);
      await mount('/sales/s-7');
      t.same(
        [headersOf(CAPTION), footOf(CAPTION), byAction('sale-paper-total').length, byAction('collect-sale').length, textOf('void-stamp'), textOf('sale-status'), byAction('sale-more').length],
        [['المادّة', 'الكمية', 'الوحدة'], [], 0, 0, 'ملغى', 'ملغاة', 0],
        'D5 الملغاة بختمها (والسبب في الصفحة لا على ورقة الزبون، مراجعة Q6)، بلا سعر ولا مبلغ ولا «استلم» ولا «⋯» (مراجعة 0024 L6)',
      );
    });

    // ── L: القائمة ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('L1 list', async () => {
      fresh(sessionOf('owner'), { sales_overview: () => clone(F.sales_overview) }, pickers);
      await mount('/sales');
      const caption = all().find((n) => n.localName === 'caption' && n.textContent.startsWith('فواتير البيع'))?.textContent ?? '';
      // تصميم المبيعات ٧: أعمدة الهاتف — الزبون (وتحته الرقم واليوم) | الصافي | الباقي الآن | الحالة.
      t.same(headersOf(caption), ['الزبون', 'الصافي', 'الباقي الآن', 'الحالة'], 'L1 أعمدة الهاتف: المال في الشاشة');
      const rows = (tableOf(caption) ? sectionOf(tableOf(caption), 'tbody').children : []).map((tr) => [first('open-sale', tr)?.textContent, descendants(tr).find((n) => n.localName === 'bdi')?.textContent, ...tr.children.slice(1).map((td) => td.textContent)]);
      t.same(
        rows,
        [
          ['زبون نقديّ', 'MS-2026-0008', '70,000', '0', 'مدفوعة'],
          ['أبو علي', 'MS-2026-0007', '139,000', '50,000', 'جزء مدفوع'],
        ],
        'L1 الصفوف: «زبون نقديّ» والرقم والصافي والباقي الآن والحالة',
      );
      t.same(footOf(caption)[0]?.slice(0, 3), ['مجموع المحفوظ', '209,000', '50,000'], 'L1 المجاميع من الخادم');
      await click(first('strip-more'));
      t.same([textOf('strip-sold'), textOf('strip-paid'), textOf('strip-open')], ['209,000', '159,000', '50,000'], 'L1 شريط المدّة من مجاميع الخادم: البيع والباقي الآن، و«التفاصيل» المدفوع عند البيع');
      await click(first('new-sale'));
      t.eq(where(), '/sales/new', 'L1 «بيع جديد» يفتح الفاتورة الجديدة');
      t.same([3, 4, 12].map((n) => m.itemsText({ itemName: 'علف', lineCount: n, itemCount: n, qty: null, baseUnit: null })), ['علف ومادّتان أخريان', 'علف و3 موادّ أخرى', 'علف و11 مادّةً أخرى'], 'L1 الموادّ بالفصحى');
    });

    await step('L3 pending banner', async () => {
      fresh(MANAGER, { ...OK, sales_overview: () => clone(F.sales_overview) }, pickers);
      const request = {
        clientRef: 'r-1', saleId: 's-x', warehouseId: 'w-gen', partyId: null, soldOn: '2026-11-17', invoiceDiscount: 0n, note: null,
        lines: [{ lineId: 'l-x', itemId: 'i-feed', unitId: null, qty: 100000n, unitPrice: 70000n, discount: 0n }],
        payments: [{ legId: 'g-x', cashAccountId: 'c-1', amount: 7000000n }],
      };
      m.sales.storeSalePending(pendingKey('manager'), { request, summary: { warehouseName: 'المخزن العام', partyName: null, lines: [{ name: 'علف بادئ', qty: '100 كغم' }], total: 7000000n, paid: 7000000n } });
      await mount('/sales');
      t.ok(first('sale-pending-banner')?.textContent.includes('المرسَل: فاتورة من «المخزن العام» لزبون نقديّ: علف بادئ 100 كغم — الصافي 70,000 دينار مدفوع كلّه.'), 'L3 فاتورة لم يُعرف جوابها: شريط في المبيعات بما أُرسل');
      await click(first('retry-pending-sale'));
      await settle(20);
      t.same([where(), byAction('sale-frozen').length], ['/sales/new', 1], 'L3 «أعد المحاولة» يفتح الفاتورة الجديدة مجمَّدة بالطلب');
    });

    await step('L2 legacy new=1', async () => {
      fresh(MANAGER, { ...OK, sales_overview: () => clone(F.sales_overview) }, pickers);
      await mount('/sales?new=1');
      await settle(20);
      t.eq(where(), '/sales/new', 'L2 الرابط القديم ?new=1 يفتح /sales/new');
    });

    // ── X: أجوبة القاعدة الحقيقية (الدمج) ─────────────────────────────────────────────────────────────────────────
    if (existsSync(REAL_PATH)) {
      const R = JSON.parse(readFileSync(REAL_PATH, 'utf8'));
      const each = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' && !('item_id' in value) && !('doc_no' in value) && !('rows' in value) ? Object.values(value) : [value]);
      for (const sample of each(R.sale_catalog)) t.ok(m.sales.parseSaleCatalog(clone(sample)).items.length >= 0, 'X sale_catalog الحقيقيّ بالمحلّل');
      for (const sample of each(R.record_sale_v2)) t.ok(m.sales.parseRecordedInvoice(clone(sample)).docNo.length > 0, 'X record_sale_v2 الحقيقيّ بالمحلّل');
      for (const sample of each(R.sale_detail)) t.ok(m.sales.parseSaleInvoice(clone(sample)).lines.length > 0, 'X sale_detail الحقيقيّ بالمحلّل');
      for (const sample of each(R.sales_overview)) t.ok(m.parseSalesOverview(clone(sample)).rows.length >= 0, 'X sales_overview الحقيقيّ بالمحلّل');
      // X2 القيم لا الشكل وحده: كلّ خانة محلَّلة = خانتها في جواب القاعدة (مرّ محلّل القائمة بصفّ بعدّة سطور كأنّه سطر واحد لأنّ المفتاح lines_count).
      const dec = (text, scale) => { const [whole, part = ''] = String(text).split('.'); return BigInt(whole + (part + '000').slice(0, scale)); };
      const seen = { multi: 0, partial: 0, walkIn: 0 };
      for (const sample of each(R.sales_overview)) {
        const parsed = m.parseSalesOverview(clone(sample));
        sample.rows.forEach((raw, i) => {
          const row = parsed.rows[i];
          const got = [row.lineCount, row.walkIn, row.money?.lineTotal, row.money?.paid, row.money?.debt, row.money?.open, row.money?.discountTotal, row.canVoid];
          const want = [raw.lines_count, raw.walk_in, dec(raw.total, 2), dec(raw.paid, 2), dec(raw.debt, 2), dec(raw.open, 2), dec(raw.discount_total, 2), raw.can_void];
          t.same(got, want, `X2 صفّ ${raw.doc_no} في القائمة بقيم القاعدة`);
          if (raw.lines_count > 1) seen.multi++;
          if (raw.status === 'posted' && dec(raw.paid, 2) > 0n && dec(raw.debt, 2) > 0n) seen.partial++;
          if (raw.walk_in) seen.walkIn++;
        });
        t.same(parsed.totals.money?.open ?? null, dec(sample.totals.open, 2), `X2 مجموع الباقي الآن (totals.open) بقيمة القاعدة`);
      }
      t.ok(seen.multi > 0 && seen.partial > 0 && seen.walkIn > 0, `X2 العيّنة تمرّ بعدّة سطور وجزء مدفوع وزبون نقديّ (${JSON.stringify(seen)})`);
      for (const [name, raw] of Object.entries(R.sale_detail)) {
        const inv = m.sales.parseSaleInvoice(clone(raw));
        t.same([inv.total, inv.paid, inv.debt, inv.discountTotal, inv.walkIn, inv.lines.length], [dec(raw.total, 2), dec(raw.paid, 2), dec(raw.debt, 2), dec(raw.discount_total ?? '0', 2), raw.walk_in ?? false, raw.lines?.length ?? 1], `X2 فاتورة ${name} بقيم القاعدة`);
        (raw.lines ?? []).forEach((line, i) => {
          const got = inv.lines[i];
          // سطر وحدة الأساس: القاعدة تكتب رمزها («kg») في unit_label وunit_id null، والمحلّل يقرؤه null فتسمّيه الشاشة بالعربية (مراجعة D4).
          const label = line.unit_id === null || line.unit_label === line.base_unit ? null : (line.unit_label ?? null);
          t.same([got.qty, got.unitQty, got.unitPrice, got.net, got.unitLabel], [dec(line.qty_base, 3), dec(line.unit_qty, 3), dec(line.unit_price, 2), dec(line.line_total, 2), label], `X2 سطر ${i + 1} من ${name} بقيم القاعدة`);
        });
      }
    }
  } catch (error) {
    t.ok(false, `رمى خارج الخطوات: ${error?.stack ?? error}`);
  } finally {
    if (root && current) {
      const mounted = root;
      root = null;
      current.flushSync(() => mounted.unmount());
    }
    restoreDom();
    for (const [key, desc] of [['sessionStorage', saved.session], ['navigator', saved.navigator]]) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
    if (saved.click) Object.defineProperty(Element.prototype, 'click', saved.click);
    else delete Element.prototype.click;
    if (saved.clone) Object.defineProperty(Element.prototype, 'cloneNode', saved.clone);
    else delete Element.prototype.cloneNode;
    if (saved.textClone) Object.defineProperty(Text.prototype, 'cloneNode', saved.textClone);
    else delete Text.prototype.cloneNode;
  }
}
