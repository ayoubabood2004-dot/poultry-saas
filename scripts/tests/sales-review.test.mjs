// مراجعة شاشات الفاتورة الاحترافيّة (0033، المرحلة ١): كلّ ملاحظة أثبتها المراجعان على الشفرة الحقيقية بفحص يفشل على الشفرة قبل إصلاحها. react-dom الحقيقي
// على DOM صغير (dom.mjs) يشغّل مسارات المبيعات الحقيقية (SalesRoutes)، وrepo الحقيقي على core بديل، وأجوبة القاعدة الحقيقية (fixtures/sales-0033.json من
// supabase/tests/sales-invoice.test بـSALES_SAMPLES_OUT=1) حيث توجد، وإلّا أجوبة العقد (fixtures/sales-0033-contract.json). C ملاحظات شاشة البيع، وD ما بعد
// البيع (الفاتورة والقائمة والكشف).
// D1 «استلم من الزبون» بقول الخادم (can_collect) والمتبقّي الآن (open) لا دين البيع، والنافذة المملوءة مسبقاً لا تُعدّ معدَّلة · C1/D4 سطر وحدة الأساس
// بالعربية لا «kg» · D2 صورة الفاتورة فاتحة في الوضع الداكن · D3 رُدّت ساق لا كلّ السيقان · C2 زرّ الحفظ يطول ولا يُقصّ · C3 المادّة نفسها بسطرين ·
// C4 ما يوقف «احفظ» يُقال بجانب الزرّ ويُمرَّر إليه · C5 البحث بالرمز وبجملة المخزن · C6 الرموز الأخرى للماسح · C7 لا سطر مكرّر بعد طلب مستعاد ·
// C8 الزرّ والمجموع لا يقولان غير الصحيح · C9 مرآة total_zero · C10 منتهية الصلاحية لا «نفد» · C11 المعامل ورموز الرفض والوحدة الغائبة · D5 الشعار
// مضمَّن · D6 بلا مقابل · D7 الملغاة · D8 عدد الموادّ لا السطور · D9 الرجوع بعد الحفظ · D10 الكشف بوحدة السطر وخصمه · D11 «منه مدفوع عند البيع».
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle, Text } from './dom.mjs';
import { sellDriver } from './sell-ui.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033-contract.json'), 'utf8'));
const R = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__sr.call('${n}', a);`).join(' ')}`;
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__sr.session; export const sessionStore = { get: () => globalThis.__sr?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__sr.toasts.push(spec); }; export function Toaster() { return null; }',
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createCustomer', 'listBoxes']),
  image: 'export const toBlob = (node, options) => globalThis.__sr.toBlob(node, options);',
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__sr.rpc(fn, args);
export const send = () => new Promise(() => {});
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };`;
const CORE_FOR = /src\/lib\/repo\/(?:sales|purchases|inventory|purchasing|parties|cash|statement|birdSales|weighTickets|scopes)\.ts$/u;
const plugins = [
  {
    name: 'sr-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/repo\/purchasing$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'sr-stub' }));
      b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'sr-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'sr-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'sr-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'sr-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
      // أنماط الشاشات (sell.css?raw في شاشة البيع، 2026-11-18): نصّ فارغ هنا.
      b.onResolve({ filter: /\.css(\?raw)?$/ }, () => ({ path: 'css', namespace: 'sr-css' }));
      b.onLoad({ filter: /.*/, namespace: 'sr-css' }, () => ({ contents: "export default '';", loader: 'js' }));
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
    "export { MemoryRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';",
    "export { SalesRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export * as sales from './src/lib/repo/sales.ts';",
    "export { parseSalesOverview } from './src/lib/repo/purchases.ts';",
    "export { parseDetail } from './src/lib/repo/statement.ts';",
    "export { docItemsOf, lineMemo } from './src/pages/accounts/statement/text.ts';",
    "export { saleBack } from './src/pages/sales/SaleDocPage.tsx';",
    "export { itemsText } from './src/pages/sales/SalesPage.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
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
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// sales-review bundle ${bundles}\n`).toString('base64')}`);
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
const card = (item) => byAction('sale-item-card').find((n) => n.getAttribute('data-item') === item) ?? null;
const listCaption = () => all().find((n) => n.localName === 'caption' && n.textContent.startsWith('فواتير البيع'))?.textContent ?? '';

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role),
  canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: !['hall_worker', 'mill_operator', 'hatchery_operator'].includes(role), invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const sessionOf = (role) => ({ status: 'ready', workspace: ws(role), offline: false });
const MANAGER = sessionOf('manager');
const KEEPER = sessionOf('storekeeper');
const PARTY = { id: 'p-1', name: 'أبو علي' };
const BOXES = [{ id: 'c-1', name: 'الصندوق الرئيسي' }, { id: 'c-2', name: 'حوالة زين كاش' }];
const pendingKey = (role) => `sales.invoice.pending:u-${role}:org-1`;
/** رموز :root في tokens.css كما هي (السمة الفاتحة). */
const lightTokens = () => {
  const css = readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
  const block = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/gu)].map((match) => [match[1], match[2].trim()]));
};

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
    scroll: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView'),
  };
  const storage = memoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage.api, configurable: true, writable: true });
  globalThis.window.print = () => {};
  // الجهاز بالسمة الداكنة (D2): --surface الداكن من getComputedStyle.
  globalThis.window.getComputedStyle = () => ({ getPropertyValue: (name) => (name === '--surface' ? ' 8 13 23 ' : '') });
  const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
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
  Element.prototype.click = function () {};
  const scrolled = [];
  Element.prototype.scrollIntoView = function () {
    scrolled.push(this);
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
    let navType = null;
    const fresh = (who, rpcs = {}, calls = {}) => {
      log = [];
      captures = [];
      scrolled.length = 0;
      globalThis.__sr = {
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
          captures.push({ node, options, host: node.parentNode });
          return new Blob(['png'], { type: 'image/png' });
        },
      };
    };
    const named = (fn) => log.filter(([name]) => name === fn).map(([, args]) => args);
    const where = () => globalThis.__sr.location;
    const mount = async (url, mm = current) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = mm.createRoot(container);
      function Where() {
        const location = mm.useLocation();
        navType = mm.useNavigationType();
        globalThis.__sr.location = `${location.pathname}${location.search}`;
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
    /** الزبون «أبو علي» من بحث «لمن؟» في ورقة الدفع. */
    const pickParty = () => d.party('أبو');
    /** فاتورة العقد (علف بادئ كيسين بخصم 1,000 وفيتامين ثلاث علب، وخصم الفاتورة 5,000، وأبو علي، وصندوقان 50,000 و39,000) بالشاشة الجديدة. */
    const fillContract = () => d.fillContract({ note: false });
    const dec = (text, scale) => { const [whole, part = ''] = String(text).split('.'); return BigInt(whole + (part + '000000').slice(0, scale)); };

    // ── المحلّلات بأجوبة القاعدة الحقيقية ──────────────────────────────────────────────────────────────────────────
    {
      const multi = m.sales.parseSaleInvoice(clone(R.sale_detail.owner_multi));
      const keeper = m.sales.parseSaleInvoice(clone(R.sale_detail.storekeeper_multi));
      const afterVoid = m.sales.parseSaleInvoice(clone(R.sale_detail.owner_multi_after_void));
      t.same(
        [multi.open, multi.canCollect, keeper.canCollect, afterVoid.open, afterVoid.canCollect],
        [dec(R.sale_detail.owner_multi.open, 2), true, false, 0n, false],
        'D1 sale_detail الحقيقيّ: المتبقّي الآن (open) و«يُستلم» (can_collect) محلَّلان',
      );
      const leg = m.sales.parseSaleInvoice(clone(R.sale_detail.owner_refunded_leg));
      t.same(leg.payments.map((p) => [p.cashAccountName, p.amount, p.refunded]), [['الصندوق', 100000n, false], ['المصرف', 200000n, true]], 'D3 كلّ ساق بعلم ردّها (payments[].refunded الحقيقيّ)');
      t.same(
        multi.lines.map((line) => [line.unitLabel, line.baseUnit]),
        [['كيس 50 كغم', 'kg'], [null, 'kg'], ['كيس 50 كغم', 'kg']],
        'C1/D4 سطر وحدة الأساس (unit_id null وunit_label «kg» في القاعدة) يُقرأ بلا اسم فتسمّيه الشاشة بالعربية',
      );
      const catalog = m.sales.parseSaleCatalog(clone(R.sale_catalog.storekeeper_feed));
      t.same(catalog.items.map((item) => [item.name, item.altCodes, item.expired]), R.sale_catalog.storekeeper_feed.items.map((item) => [item.name, [], 0n]), 'C6/C10 الرموز الأخرى والمنتهي من sale_catalog الحقيقيّ محلَّلان');
      const overview = m.parseSalesOverview(clone(R.sales_overview.owner));
      t.same(
        overview.rows.map((row) => [row.docNo, row.lineCount, row.itemCount]),
        R.sales_overview.owner.rows.map((row) => [row.doc_no, row.lines_count, row.items_count]),
        'D8 عدد الموادّ (items_count) لكلّ صفّ بقيم القاعدة',
      );
      t.same([m.saleBack('/inventory/items/i-1'), m.saleBack('/'), m.saleBack('https://evil.example'), m.saleBack('//x')], ['/inventory/items/i-1', '/', '/sales', '/sales'], 'D9 الرجوع من الفاتورة يقبل المخزن والرئيسية (داخليّ وحده)');
    }

    // ── D10 الكشف: فاتورة 0033 بوحدة السطر وسعرها وإجماليّه، والخصم سطراً كالشراء (entry_detail الحقيقيّ) ──────────
    {
      const detail = m.parseDetail(clone(R.entry_detail.invoice));
      const items = m.docItemsOf({ detail, reverses: null });
      t.same(
        items?.items.map((item) => [item.name, item.qty, item.unit, item.price, item.amount]),
        [
          ['علف بادئ', 3000n, 'كيس 50 كغم', 3500000n, 10500000n],
          ['علف بادئ', 25500n, 'كغم', 72000n, 1836000n],
          ['علف نامي', 2000n, 'كيس 50 كغم', 3000000n, 6000000n],
        ],
        'D10 موادّ الفاتورة في الكشف بالكمية بوحدة السطر × سعرها = إجماليّه',
      );
      t.same(items?.footers.map((footer) => [footer.key, footer.amount]), [['sum', 18336000n], ['discount', -350000n], ['net', 17986000n]], 'D10 ثمّ مجموع الموادّ والخصم والصافي = مبلغ الحركة');
      t.eq(
        m.lineMemo({ kind: 'invoice', account: null, reason: null, detail, reverses: null, reversed: false }),
        'بيع مادّتين — رصيد العلف، بعد خصم 3,500',
        'D10/D8 البيان بعدد الموادّ (لا السطور) وبعد الخصم',
      );
    }

    // ── D: الفاتورة ────────────────────────────────────────────────────────────────────────────────────────────────
    await step('D1 collect open', async () => {
      const sample = { ...clone(R.sale_detail.owner_multi), open: '49860' };
      fresh(MANAGER, { sale_detail: () => clone(sample) }, pickers);
      await mount(`/sales/${sample.id}`);
      // «دين» = ما بقي عند البيع (لا يتغيّر بالقبض)، و«الباقي» = ما بقي الآن (open): كلمتان لا ستّ (تصميم المبيعات ٦).
      t.same(
        [textOf('sale-paper-debt'), textOf('sale-paper-open'), textOf('collect-note')?.includes('على حساب «أبو أحمد» يُسدِّد أقدم ديونه أوّلاً'), textOf('sale-open'), textOf('sale-payment')],
        ['دين عند البيع:99,860 دينار', 'الباقي:49,860 دينار', true, '49,860', 'دين عند البيع 99,860 دينار، والباقي الآن 49,860 دينار.'],
        'D1 بعد قبض لاحق: دين البيع كما هو و«الباقي» من open على الورقة والصفحة',
      );
      await click(first('collect-sale'));
      await settle(20);
      const amount = all().find((n) => n.localName === 'input' && (n.getAttribute('id') ?? '').endsWith('-amount'));
      t.eq(amount?.value, '49860', 'D1 «استلم» يملأ الباقي الآن (open) لا دين البيع');
      await click(first('dialog-close'));
      await settle(20);
      t.same([byAction('dialog-discard').length, byAction('review-payment').length], [0, 0], 'D1 النافذة المملوءة مسبقاً تُغلق بلا «الخروج دون حفظ؟» (لم يُكتب فيها شيء)');
    });

    await step('D1 can_collect', async () => {
      const paidLater = { ...clone(R.sale_detail.owner_multi), open: '0', can_collect: false };
      fresh(MANAGER, { sale_detail: () => clone(paidLater) }, pickers);
      await mount(`/sales/${paidLater.id}`);
      t.eq(byAction('collect-sale').length, 0, 'D1 سُدّدت كلّها بعد البيع (open 0، can_collect false): لا «استلم من الزبون» ولو بقي دين البيع');
      await unmount();
      fresh(MANAGER, { sale_detail: () => clone(R.sale_detail.storekeeper_multi) }, pickers);
      await mount(`/sales/${R.sale_detail.storekeeper_multi.id}`);
      t.eq(byAction('collect-sale').length, 0, 'D1 can_collect false من القاعدة (عيّنة الأمين): لا «استلم من الزبون»');
    });

    await step('C1/D4 base unit label', async () => {
      fresh(MANAGER, { sale_detail: () => clone(R.sale_detail.owner_multi) }, pickers);
      await mount(`/sales/${R.sale_detail.owner_multi.id}`);
      t.same(rowsOf(`سطور الفاتورة ${R.sale_detail.owner_multi.doc_no}`).map((row) => row[2]), ['كيس 50 كغم', 'كغم', 'كيس 50 كغم'], 'C1/D4 الورقة (والطباعة والصورة منها): سطر الأساس «كغم» لا «kg»');
    });

    await step('D2/D5 light image, inline logo', async () => {
      const shared = [];
      setNavigator({ onLine: true, canShare: () => true, share: async (data) => shared.push(data) });
      fresh(MANAGER, { sale_detail: () => clone(R.sale_detail.owner_multi) }, pickers);
      await mount(`/sales/${R.sale_detail.owner_multi.id}`);
      t.ok((first('sale-paper-logo')?.getAttribute('src') ?? '').startsWith('data:image/svg+xml,'), 'D5 الشعار مضمَّن (لا /favicon.svg يُطلب من الشبكة)');
      await click(first('send-image'));
      await settle(20);
      const [capture] = captures;
      const tokens = lightTokens();
      const style = capture?.host?.style ?? {};
      t.same(
        Object.keys(tokens).map((name) => [name, style[`--${name}`] ?? null]),
        Object.entries(tokens),
        'D2 حاوية الصورة برموز السمة الفاتحة كلّها (كما في tokens.css) والجهاز داكن',
      );
      t.same([style['color-scheme'] ?? style.colorScheme ?? null, capture?.options?.backgroundColor], ['light', 'rgb(255, 255, 255)'], 'D2 وcolor-scheme فاتح، والخلفية ورق أبيض (تصميم المبيعات ٦)');
      t.eq(typeof capture?.options?.imagePlaceholder === 'string' && capture.options.imagePlaceholder.startsWith('data:'), true, 'D5 صورة بديلة لصورة تعذّر جلبها (لا يُرفض الرسم كلّه بلا اتصال)');
    });

    await step('D3 one leg refunded', async () => {
      const sample = R.sale_detail.owner_refunded_leg;
      fresh(MANAGER, { sale_detail: () => clone(sample) }, pickers);
      await mount(`/sales/${sample.id}`);
      t.same(
        [textOf('sale-paper-paid'), textOf('sale-status'), textOf('leg-refunded')],
        ['المدفوع عند البيع:1,000 دينار، ورُدّ 2,000 دينار', 'جزء مدفوع', 'المصرف — رُدّ للزبون'],
        'D3 رُدّت ساق من ساقين: الباقية مدفوعة والمردودة بمبلغها (والصندوق في الصفحة لا على ورقة الزبون، D24)، لا «رُدّ المبلغ» كلّه',
      );
      // و«ألغِ الفاتورة» (في «⋯» الفاتورة منذ تصميم المبيعات ٦): ما بقي مدفوعاً (1,000) يبقى رصيداً، ولا جملة «رُدّ» لساقٍ من ساقين (A3).
      await click(first('sale-more'));
      await click(first('void-sale'));
      t.same(
        [textOf('void-cash-kept')?.includes('(1,000 دينار)'), textOf('void-refunded')],
        [true, null],
        'D3 تأكيد الإلغاء: ما بقي مدفوعاً (1,000) يبقى رصيداً، ولا جملة «رُدّ» لساقٍ من ساقين (payment_refunded = رُدّ كلّه، A3)',
      );
    });

    await step('D6 free paper', async () => {
      const sample = clone(R.sale_detail.owner_multi);
      Object.assign(sample, { total: '0', paid: '0', debt: '0', open: '0', can_collect: false, payments: [], discount_total: '0', invoice_discount: '0' });
      fresh(MANAGER, { sale_detail: () => clone(sample) }, pickers);
      await mount(`/sales/${sample.id}`);
      t.same([textOf('sale-paper-paid'), byAction('sale-paper-debt').length], ['الدفع:تسليم بلا مقابل', 0], 'D6 فاتورة بلا مقابل: «تسليم بلا مقابل» بلا «الباقي ديناً: 0»');
    });

    await step('D7 void head', async () => {
      const sample = R.sale_detail.owner_multi_after_void;
      fresh(MANAGER, { sale_detail: () => clone(sample) }, pickers);
      await mount(`/sales/${sample.id}`);
      t.eq(textOf('sale-payment'), 'ملغاة، وما دُفع لها حُسب للزبون', 'D7 الملغاة (حقيقيّة) تقول ما حدث لمقبوضها (حُسب للزبون: يُسدَّد به أقدم ما عليه، A3)، لا «جزء مدفوع، والباقي دين»');
    });

    // ── D: القائمة ─────────────────────────────────────────────────────────────────────────────────────────────────
    /** القائمة بعرض الشاشة العريضة (matchMedia بديل): أعمدة الموادّ والمدفوع أيضاً. */
    const wideScreen = () => {
      const before = globalThis.window.matchMedia;
      globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
      return () => {
        if (before) globalThis.window.matchMedia = before;
        else delete globalThis.window.matchMedia;
      };
    };
    /** صفوف القائمة بالرقم: [الزبون، الموادّ، الصافي، المدفوع، الباقي الآن، الحالة] (بالعرض العريض). */
    const listByNo = () =>
      Object.fromEntries(
        (sectionOf(tableOf(listCaption()), 'tbody')?.children ?? []).map((tr) => [descendants(tr).find((n) => n.localName === 'bdi')?.textContent, [first('open-sale', tr)?.textContent, ...tr.children.slice(1).map((td) => td.textContent)]]),
      );
    await step('D3/D7/D8/D11 list', async () => {
      // عيّنة القاعدة بعد قبض لاحق وإلغاءين (owner_after_collect_and_void): الحالة شريحةً لكلّ صفّ، والباقي الآن open.
      const restore = wideScreen();
      try {
        const overview = clone(R.sales_overview.owner_after_collect_and_void);
        fresh(MANAGER, { sales_overview: () => clone(overview) }, pickers);
        await mount('/sales');
        const rows = listByNo();
        t.same(
          [rows['FD-2026-0004']?.[5], rows['FD-2026-0001']?.[5], rows['MD-2026-0001']?.[5], rows['MS-2026-0003']?.[5]],
          ['جزء مدفوع', 'ملغاة', 'ملغاة', 'بلا مقابل'],
          'D3/D7 الحالة في القائمة: ساق رُدّت من ساقين جزءٌ مدفوع، والملغاة «ملغاة» (وما حدث لمقبوضها في الفاتورة، D7)، والتسليم بلا مقابل',
        );
        t.same([rows['FD-2026-0002']?.[1], rows['FD-2026-0005']?.[1]], ['علف بادئ', 'علف التزامن'], 'D8 مادّة واحدة بسطرين: اسمها لا «ومادّة أخرى»');
        const stats = all().filter((n) => n.localName === 'dt').map((n) => n.textContent);
        t.ok(stats.includes('المدفوع عند البيع') && !stats.includes('منه نقداً'), 'D11 المدفوع عند البيع من كلّ الصناديق، لا «منه نقداً»');
        t.eq(textOf('strip-paid'), '27,000', 'D11 المدفوع عند البيع من مجاميع الخادم (cash)');
      } finally {
        restore();
      }
    });

    await step('A1 list open', async () => {
      const overview = clone(R.sales_overview.owner_after_collect_and_void);
      overview.rows.find((r) => r.doc_no === 'FD-2026-0005').can_void = false;
      fresh(MANAGER, { sales_overview: () => clone(overview) }, pickers);
      await mount('/sales');
      const heads = tableOf(listCaption()) ? descendants(tableOf(listCaption())).filter((n) => n.localName === 'th').map((n) => n.textContent) : [];
      // بأعمدة الهاتف: [الزبون، الصافي، الباقي الآن، الحالة].
      const rows = listByNo();
      t.same([heads.includes('الباقي الآن'), rows['MS-2026-0002']?.[2], rows['FD-2026-0004']?.[2], rows['FD-2026-0001']?.[2]], [true, '6,000', '2,000', '—'], 'A1 الباقي الآن بعد قبض لاحق (10,000 دين عند البيع ← 6,000)، والملغاة «—»');
      t.ok(all().some((n) => n.localName === 'dt' && n.textContent === 'الباقي الآن') && textOf('strip-open') === '662,000', 'A1 مجموع الباقي الآن من الخادم (662,000) لا الدين عند البيع (666,000)');
      // V1: «ألغِ» خرج من الصفوف كلّها (تصميم المبيعات ٧)، وفي الفاتورة تحت «⋯» بعلم الخادم (can_void) لا بعلم الصفحة.
      t.eq(byAction('void-sale').length, 0, 'V1 لا «ألغِ» في صفوف القائمة');
    });

    await step('V1 void on the invoice', async () => {
      fresh(MANAGER, { sale_detail: () => clone(R.sale_detail.owner_multi) }, pickers);
      await mount(`/sales/${R.sale_detail.owner_multi.id}`);
      t.eq(byAction('sale-more').length, 1, 'V1 «⋯» في الفاتورة بعلم الخادم (can_void true)');
      await unmount();
      fresh(MANAGER, { sale_detail: () => clone(R.sale_detail.storekeeper_multi) }, pickers);
      await mount(`/sales/${R.sale_detail.storekeeper_multi.id}`);
      t.eq(byAction('sale-more').length, 0, 'V1 can_void false من القاعدة: لا «⋯» ولا «ألغِ» ولو سمح الدور');
    });

    await step('D8 owner list', async () => {
      const restore = wideScreen();
      try {
        fresh(sessionOf('owner'), { sales_overview: () => clone(R.sales_overview.owner) }, pickers);
        await mount('/sales');
        const rows = listByNo();
        t.same([rows['FD-2026-0001']?.[1], rows['FD-2026-0002']?.[1]], ['علف بادئ ومادّة أخرى', 'علف بادئ'], 'D8 ثلاثة سطور لمادّتين «ومادّة أخرى»، وسطران لمادّة واحدة اسمها');
      } finally {
        restore();
      }
    });

    await step('C2/C11a contract invoice', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new');
      await fillContract();
      const css = readFileSync(path.join(ROOT, 'src', 'pages', 'sales', 'sell.css'), 'utf8');
      const rule = (selector) => {
        const at = css.indexOf(`\n${selector} {`);
        return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
      };
      t.ok(/height: auto;/u.test(rule('.sl-save')) && /white-space: normal;/u.test(rule('.sl-save')) && /min-height: 56px;/u.test(rule('.sl-primary')), 'C2 زرّ الحفظ يطول بسطوره (height: auto وwhite-space: normal، و56 بكسل أدنى) فلا يُقصّ أوّل سطره');
      t.eq(textOf('save-invoice'), 'احفظ — 139,000 دينار، منها 50,000 دين', 'C2 الزرّ بالصافي والدين بلا عدد الموادّ، و«احفظ» وحدها (سطر واحد في 390)');
      await d.save();
      await settle(30);
      t.same(named('record_sale_v2')[0]?.p_lines.map((line) => line.factor), ['50.000000', '10.000000'], 'C11 كلّ سطر بمعامل وحدته كما رأته الشاشة (unit_changed بالخادم)');
    });

    await step('C3 same item twice', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.unit('u-bag');
      await d.keys('3');
      await d.done();
      t.eq(card('i-feed')?.hasAttribute('disabled'), false, 'C3 بطاقة مادّة في الفاتورة تبقى تُلمس (تزيد سطرها)');
      await d.openLineOf('i-feed');
      await click(first('line-add-another'));
      await d.keys('25.5');
      await d.tab('price');
      await d.keys('720');
      await d.done();
      await d.openCart();
      t.same(d.lines().map((n) => n.getAttribute('data-item')), ['i-feed', 'i-feed'], 'C3 المادّة نفسها بسطرين (أكياس وفرط) من «أضف سطراً آخر لها»');
      await d.next();
      await pickParty();
      await d.save();
      await settle(30);
      t.same(
        named('record_sale_v2')[0]?.p_lines.map((line) => [line.item_id, line.unit_id, line.qty, line.unit_price]),
        [['i-feed', 'u-bag', '3.000', '35000.00'], ['i-feed', null, '25.500', '720.00']],
        'C3 والنداء بسطرين للمادّة نفسها',
      );
    });

    await step('C4 stopped save says why', async () => {
      const less = clone(F.sale_catalog);
      less[0].available = '50.000';
      fresh(MANAGER, { ...OK, sale_catalog: (_args, n) => (n === 1 ? clone(F.sale_catalog) : clone(less)) }, pickers);
      await mount('/sales/new');
      await fillContract();
      await d.save();
      await settle(30);
      // المتاح بوحدة السطر (مراجعة التصميم D3): 50 كغم كيس واحد.
      const over = 'المتاح في «المخزن العام» كيس واحد فقط؛ لا يُحفظ أكثر منه.';
      t.same([named('record_sale_v2').length, textOf('sale-blocked')], [0, `لم تُحفظ الفاتورة: ${over}`], 'C4 المتاح قلّ عند القراءة قبل الحفظ: يُقال بجانب الزرّ الثابت');
      t.same(
        [scrolled.at(-1)?.textContent ?? null, globalThis.document.activeElement === first('line-display', d.lineSheet())],
        [over, true],
        'C4 ويُفتح السطر ويُمرَّر إلى خطئه وتُركَّز خانته (الكمية)',
      );
    });

    await step('C4 blocked before reading', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.keys('10');
      await d.done();
      await d.next();
      await d.payKind('debt');
      t.same([buttonOf('زبون نقديّ')?.getAttribute('aria-checked'), textOf('sale-party-needed')], ['false', 'الدين يحتاج اسم الزبون: اختره أو ابحث عنه أو أضفه.'], 'C4 «دين كلّه» لزبون نقديّ يفتح «لمن؟»: الدين يحتاج اسم الزبون');
      // الزرّ نفسه يقول ما يلزم (مراجعة التصميم D17)، والسبب تحت «لمن؟» مرّة واحدة لا مكرّراً بجانب الزرّ.
      t.eq(textOf('save-invoice'), 'اختر الزبون أوّلاً', 'C4 «دين كلّه» بلا زبون: الزرّ «اختر الزبون أوّلاً»');
      await d.save();
      await settle(20);
      t.same(
        [named('sale_catalog').length, textOf('sale-party-error'), textOf('sale-blocked'), globalThis.document.activeElement === first('sale-party-search')],
        [1, 'اختر الزبون، أو أضفه باسمه، أو اختر «زبون نقديّ» إن دفع المبلغ كلّه.', null, true],
        'C4 بلا زبون: لا قراءة ولا إرسال، والسبب تحت «لمن؟» مرّة واحدة، والبحث عن الزبون مركَّز',
      );
    });

    await step('C5 search by code, store in the empty result', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      type(first('sale-search'), '626000000002');
      await settle(20);
      t.same(byAction('sale-item-card').map((n) => n.getAttribute('data-item')), ['i-vit'], 'C5 بداية الرمز في البحث تجد مادّته');
      await d.search('زيت');
      t.eq(textOf('sale-items-none'), 'لا مادّة باسم «زيت» تُباع من «المخزن العام».', 'C5 البحث بلا نتيجة يسمّي المخزن (قد تُباع من غيره)');
      await enter(first('sale-search'));
      t.same([byAction('sale-scan-note').length, first('sale-search')?.value], [0, 'زيت'], 'C5 Enter على اسم بلا مادّة لا يضيف شيئاً ولا يُقرأ رمزاً');
    });

    await step('C6/C10 alt codes and expired', async () => {
      const catalog = clone(F.sale_catalog);
      catalog[1].alt_codes = ['8800001112223'];
      catalog[2].expired = '12.000';
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(catalog) }, pickers);
      await mount('/sales/new?store=w-gen');
      t.ok(card('i-corn')?.textContent.includes('منتهية الصلاحية: 12 كغم') && !card('i-corn')?.textContent.includes('نفد'), 'C10 كلّها منتهية الصلاحية: يُقال ذلك بكميته لا «نفد»');
      await d.scan('8800001112223');
      t.same([d.cardQty('i-vit'), textOf('sale-scan-note')], ['1 قطعة', null], 'C6 الماسح يقرأ الرموز الأخرى (alt_codes)');
    });

    await step('C7 restored request and ?item=', async () => {
      const request = {
        clientRef: 'r-1', saleId: 's-x', warehouseId: 'w-gen', partyId: 'p-1', soldOn: '2026-11-17', invoiceDiscount: 0n, note: null,
        lines: [{ lineId: 'l-x', itemId: 'i-vit', unitId: null, qty: 2000n, unitPrice: 250000n, discount: 0n }],
        payments: [],
      };
      m.sales.storeSalePending(pendingKey('manager'), { request, summary: { warehouseName: 'المخزن العام', partyName: 'أبو علي', lines: [{ name: 'فيتامين أ د', qty: '2 قطعة' }], total: 500000n, paid: 0n } });
      fresh(MANAGER, { ...OK, record_sale_v2: () => { throw new current.RejectedError('insufficient_stock', R.refusals.insufficient_stock.hint); } }, pickers);
      await mount('/sales/new?item=i-vit&store=w-gen');
      t.eq(byAction('sale-frozen').length, 1, 'C7 الطلب المستعاد يجمّد الشاشة');
      await click(first('sale-retry'));
      await settle(40);
      await d.openCart();
      t.same([d.lines().map((n) => n.getAttribute('data-item')), d.cardQty('i-vit')], [['i-vit'], '2 قطعة'], 'C7 بعد الرفض الأكيد يعود السطر المرسَل وحده، بلا سطر مكرّر من ?item=');
    });

    await step('C8 walk-in unpaid', async () => {
      fresh(MANAGER, OK, { ...pickers, listBoxes: () => [BOXES[0]] });
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.keys('100');
      await d.done();
      await d.next();
      await d.payKind('part');
      t.eq(textOf('save-invoice')?.includes('مدفوعة'), false, 'C8 زبون نقديّ لم يدفع: الزرّ لا يقول «مدفوعة كلّها»');
    });

    await step('C8 overpaid and discount over', async () => {
      fresh(MANAGER, OK, { ...pickers, listBoxes: () => [BOXES[0]] });
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.keys('100');
      await d.done();
      await d.next();
      await d.payKind('part');
      await d.keys('80000');
      t.same(
        [textOf('sale-debt-live'), textOf('save-invoice')],
        ['المدفوع أكثر من الصافي بـ10,000 دينار؛ أنقص المبلغ.', 'احفظ — 70,000 دينار'],
        'C8 مدفوع أكثر من الصافي: جملة بلا دين سالب، والزرّ بلا «مدفوعة» ولا دين',
      );
      await click(first('pay-remove'));
      await click(first('pay-discount'));
      await d.keys('90000');
      t.same([textOf('sale-total-net'), textOf('sale-debt-live'), textOf('save-invoice')], ['—', 'الدين يُحسب بعد تصحيح الخصم.', 'احفظ — مادّة واحدة'], 'C8 خصم أكبر من المجموع: المطلوب «—» لا رقماً سالباً');
    });

    await step('C9 total_zero mirror', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => { throw new current.RejectedError(R.refusals['v2.total_zero'].code, R.refusals['v2.total_zero'].hint); } }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap('i-feed');
      await d.keys('0.001');
      await d.tab('price');
      await d.keys('100');
      await d.done();
      await d.next();
      await pickParty();
      await d.save();
      await settle(30);
      t.same(
        [byAction('confirm-free-invoice').length, named('record_sale_v2').length, textOf('line-error')],
        [0, 0, 'مبلغ هذا السطر يُقرَّب إلى صفر دينار: راجع الكمية والسعر، أو اكتب السعر صفراً للتسليم بلا مقابل.'],
        'C9 سعر فوق الصفر يُقرَّب مبلغه إلى صفر: خطأ على السطر كالخادم (يُفتح على السعر)، لا «تسليم بلا مقابل؟» ثمّ رفض',
      );
    });

    await step('C11b reread on unit_mismatch', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => { throw new current.RejectedError(R.refusals['v2.unit_mismatch'].code, R.refusals['v2.unit_mismatch'].hint); } }, pickers);
      await mount('/sales/new');
      await fillContract();
      await d.save();
      await settle(40);
      t.same([named('record_sale_v2').length, named('sale_catalog').length], [1, 3], 'C11 رفض unit_mismatch (رمز القاعدة الحقيقيّ) يقرأ الموادّ ووحداتها من جديد');
    });

    await step('C11c unit gone', async () => {
      const noBag = clone(F.sale_catalog);
      noBag[0].units = noBag[0].units.filter((unit) => unit.unit_id !== 'u-bag');
      fresh(MANAGER, { ...OK, sale_catalog: (_args, n) => (n === 1 ? clone(F.sale_catalog) : clone(noBag)) }, pickers);
      await mount('/sales/new');
      await fillContract();
      await d.save();
      await settle(30);
      const checked = d.units().filter(([, , on]) => on === 'true');
      const unitError = textOf('line-unit-error');
      await d.tab('price');
      t.same(
        [checked, unitError, d.display(), named('record_sale_v2').length],
        [[], 'اختر الوحدة.', '—', 0],
        'C11 غابت وحدة السطر: لا شريحة مختارة و«اختر الوحدة» تحتها، وسعرها القديم يُمحى',
      );
    });

    await step('C11 boxes reread on cash_account_archived', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => { throw new current.RejectedError(R.refusals['v2.cash_account_archived'].code, R.refusals['v2.cash_account_archived'].hint); } }, pickers);
      await mount('/sales/new');
      await fillContract();
      const before = named('listBoxes').length;
      await d.save();
      await settle(40);
      t.eq(named('listBoxes').length, before + 1, 'صندوق أُرشف (cash_account_archived): تُقرأ الصناديق من جديد');
    });

    await step('D9 back after saving', async () => {
      fresh(KEEPER, { ...OK, sale_catalog: () => ({ items: clone(F.sale_catalog), cash_accounts: [BOXES[0]] }), record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new?item=i-vit&store=w-gen&back=%2Finventory%2Fitems%2Fi-vit');
      await d.plus('i-vit');
      await d.next();
      await pickParty();
      await d.save();
      await settle(40);
      t.same(
        [where(), navType, first('back')?.getAttribute('href') ?? null],
        ['/sales/s-7?done=1&back=%2Finventory%2Fitems%2Fi-vit', 'REPLACE', '/inventory/items/i-vit'],
        'D9 بعد الحفظ: الفاتورة مكان الشاشة (?done=1، والأوراق مطويّة من التاريخ)، ورجوعها إلى ملفّ المادّة الذي بدأ منه البيع',
      );
    });
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
    for (const [proto, key, desc] of [
      [Element.prototype, 'click', saved.click],
      [Element.prototype, 'cloneNode', saved.clone],
      [Text.prototype, 'cloneNode', saved.textClone],
      [Element.prototype, 'scrollIntoView', saved.scroll],
    ]) {
      if (desc) Object.defineProperty(proto, key, desc);
      else delete proto[key];
    }
  }
}
