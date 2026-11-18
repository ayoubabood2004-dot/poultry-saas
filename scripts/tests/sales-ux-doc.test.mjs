// شاشات ما بعد البيع ومداخله (تصميم المبيعات ٥–٨، docs/SALES_UX_PLAN.md؛ كلمة المالك 2026-11-18: «شكل متطور سهل الاستخدام يسهل حياة المستخدم»).
// react-dom الحقيقي على DOM صغير (dom.mjs) يشغّل مسارات المبيعات الحقيقية (SalesRoutes) والشريط السفلي الحقيقي، وrepo الحقيقي على core بديل يجيب
// بأجوبة القاعدة الحقيقية (fixtures/sales-0033.json من supabase/tests/sales-invoice.test بـSALES_SAMPLES_OUT=1).
// N بعد الحفظ (?done=1): ✓ و«حُفظت <الرقم>» والصافي والمدفوع والباقي، و«أرسل على واتساب» و«PDF» و«بيع جديد» بالمخزن نفسه و«استلم» حين يبقى شيء.
// I الصورة تُجهَّز فور التحميل، فاللمسة الأولى تنادي navigator.share داخل النقرة نفسها بملفّ جاهز (ولا تُرسم ثانيةً).
// F الفاتورة: الحالة شريحةً بنصّ لكلّ عيّنة، والإيصال (الصافي والمدفوع والباقي)، والسطور بأعمدة الهاتف والعريضة، و«⋯» ← «ألغِ الفاتورة» بـConfirmDialog.
// P الورقة: الرقم لا ينكسر، والسطور بإجماليّها والخصم مرّة واحدة، والكمية الصحيحة بلا «.0»، والمعاينة فاتحة كالصورة.
// L القائمة: الأعمدة بالترتيب (الزبون | الصافي | الباقي الآن | الحالة)، والبحث بالزبون أو الرقم، وشرائح المدّة والتصفية، والصفّ كلّه يفتح الفاتورة
//   ورجوعها إلى القائمة كما تُركت، ولا «ألغِ» في الصفوف، و«حسب الزبون» و«حسب اليوم» يفتحان فواتيرهما، وشريط المدّة من مجاميع الخادم.
// B الشريط السفلي: «المبيعات» لمن يبيع حين يتّسع، ويختفي في /sales/new؛ والرئيسية: «بِع» ثاني أفعال الأمين والمحاسب.
// C التباين: ألوان doc.css (الشرائح والباقي والختم وقائمة الإلغاء) ≥ 4.5:1 بالسمتين، والزرّ الأساسيّ brand-600 في الداكن، والحركة ≤ 400ms وتقف لطالب
//   تقليل الحركة.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle, Text } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033.json'), 'utf8'));
const S21 = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0021.json'), 'utf8'));
const DOC_CSS = readFileSync(path.join(ROOT, 'src', 'pages', 'sales', 'doc.css'), 'utf8');
const TOKENS = readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__ux.call('${n}', a);`).join(' ')}`;
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__ux.session; export const sessionStore = { get: () => globalThis.__ux?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__ux.toasts.push(spec); }; export function Toaster() { return null; }',
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createCustomer', 'listBoxes']),
  image: 'export const toBlob = (node, options) => globalThis.__ux.toBlob(node, options);',
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__ux.rpc(fn, args);
export const send = () => new Promise(() => {});
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };`;
const CORE_FOR = /src\/lib\/repo\/(?:sales|purchases|inventory|purchasing|parties|cash|statement|birdSales|weighTickets|scopes)\.ts$/u;
const plugins = [
  {
    name: 'ux-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/repo\/purchasing$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'ux-stub' }));
      b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'ux-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'ux-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'ux-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'ux-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
      // doc.css وsell.css?raw (شاشة البيع في الحزمة نفسها): نصّ فارغ هنا، وdoc.css يُقرأ من ملفّه أعلاه.
      b.onResolve({ filter: /\.css(\?raw)?$/ }, () => ({ path: 'css', namespace: 'ux-css' }));
      b.onLoad({ filter: /.*/, namespace: 'ux-css' }, () => ({ contents: '', loader: 'js' }));
    },
  },
];

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { SalesRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { default as BottomBar, bottomItems } from './src/components/shell/BottomBar.tsx';",
    "export { homeActions, HOME_ACTIONS_SHOWN } from './src/pages/home/HomePage.tsx';",
    "export * as sales from './src/lib/repo/sales.ts';",
    "export { saleTone, rowTone, toneText } from './src/pages/sales/docKit.tsx';",
    "export { voidTargetOf } from './src/pages/sales/SaleVoidDialog.tsx';",
    "export { lineQtyText, INVOICE_IMAGE_WIDTH } from './src/pages/sales/saleParts.tsx';",
    "export { invoicesText } from './src/pages/sales/SalesPage.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
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
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// sales-ux-doc bundle\n`).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, scope = body()) => descendants(scope).filter((n) => n.getAttribute('data-action') === name);
const first = (name, scope) => byAction(name, scope)[0] ?? null;
const textOf = (name) => first(name)?.textContent ?? null;
const text = () => body().textContent;
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click', { button: 0 });
  await settle();
};
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const sectionOf = (table, tag) => (table ? table.children.find((n) => n.localName === tag) : null);
const headersOf = (caption) => (tableOf(caption) ? descendants(tableOf(caption)).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null);
const rowsOf = (caption) => (sectionOf(tableOf(caption), 'tbody')?.children ?? []).filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent));
const footOf = (caption) => (sectionOf(tableOf(caption), 'tfoot')?.children ?? []).filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent));
const listCaption = () => all().find((n) => n.localName === 'caption' && n.textContent.startsWith('فواتير البيع'))?.textContent ?? '';
/** صفوف القائمة: [الرقم، الزبون، الصافي، الباقي الآن، الحالة]. */
const listRows = () =>
  (sectionOf(tableOf(listCaption()), 'tbody')?.children ?? []).map((tr) => [
    descendants(tr).find((n) => n.localName === 'bdi')?.textContent,
    first('open-sale', tr)?.textContent,
    ...tr.children.slice(1).map((td) => td.textContent),
  ]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role),
  canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: !['hall_worker', 'mill_operator', 'hatchery_operator'].includes(role), invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const sessionOf = (role, over) => ({ status: 'ready', workspace: ws(role, over), offline: false });
const MANAGER = sessionOf('manager');

/** WCAG: التباين بين لونين [r, g, b]. */
function contrast(a, b) {
  const lum = ([r, g, bl]) => {
    const c = [r, g, bl].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** قاعدة CSS بمحدِّدها بالضبط ← خصائصها. */
function rule(css, selector) {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return null;
  const block = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries([...block.matchAll(/([\w-]+):\s*([^;]+);/gu)].map((m) => [m[1], m[2].trim()]));
}
const rgb = (value) => (value.match(/\d+/gu) ?? []).slice(0, 3).map(Number);
const tokens = (selector) => {
  const at = TOKENS.indexOf(`${selector} {`);
  const block = TOKENS.slice(at, TOKENS.indexOf('}', at));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/gu)].map((m) => [m[1], rgb(m[2])]));
};

export default async function (t) {
  const restoreDom = installDom();
  const saved = {
    session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    clone: Object.getOwnPropertyDescriptor(Element.prototype, 'cloneNode'),
    textClone: Object.getOwnPropertyDescriptor(Text.prototype, 'cloneNode'),
  };
  const store = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() }, configurable: true, writable: true });
  const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  globalThis.window.print = () => {};
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
  let root = null;
  let m = null;
  try {
    m = await bundle();
    m.onlineStore.set(true);
    let log = [];
    let captures = [];
    const fresh = (who, rpcs = {}) => {
      log = [];
      captures = [];
      globalThis.__ux = {
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
        call() {
          return new Promise(() => {});
        },
        async toBlob(node, options) {
          captures.push({ node, options });
          return new Blob(['png'], { type: 'image/png' });
        },
      };
    };
    const named = (fn) => log.filter(([name]) => name === fn).map(([, args]) => args);
    const where = () => globalThis.__ux.location;
    const mount = async (url, { bar = false } = {}) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__ux.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, null, m.h(m.Route, { path: '/sales/*', element: m.h(m.SalesRoutes) }), m.h(m.Route, { path: '*', element: null }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where), bar ? m.h(m.BottomBar, { onMenu: () => {} }) : null)));
      await settle(40);
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
      store.clear();
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };
    const D = R.sale_detail;
    const MULTI = D.owner_multi;

    // ── N: بعد الحفظ ────────────────────────────────────────────────────────────────────────────────────────────
    await step('N1 done', async () => {
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}?done=1&back=%2F`);
      t.same(
        [byAction('sale-done').length, textOf('sale-done-title'), textOf('done-net'), textOf('done-paid'), textOf('done-open'), byAction('sale-head').length],
        [1, 'حُفظت FD-2026-0001', '179,860', '80,000', '99,860', 0],
        'N1 حالة النجاح: «حُفظت» برقمها والصافي والمدفوع والباقي، مكان بطاقة الإيصال',
      );
      t.ok(first('sale-done-title')?.children.some((n) => n.localName === 'bdi' && n.getAttribute('dir') === 'ltr' && n.textContent === 'FD-2026-0001'), 'N1 الرقم في <bdi dir="ltr">');
      const done = first('sale-done');
      t.same(
        ['send-image', 'print-sale', 'collect-sale', 'sale-next', 'sale-more'].map((name) => byAction(name, done).length),
        [1, 1, 1, 1, 1],
        'N1 الأزرار: أرسل على واتساب، PDF، استلم (يبقى شيء)، بيع جديد، و«⋯»',
      );
      t.same([textOf('send-image'), textOf('sale-next')], ['أرسل على واتساب', 'بيع جديد'], 'N1 أسماء الزرّين الكبيرين');
      const next = `/sales/new?store=${MULTI.warehouse_id}&back=%2F`;
      t.eq(first('sale-next')?.getAttribute('href'), next, 'N1 «بيع جديد» بالمخزن نفسه ورجوعه حيث بدأ البيع');
      await click(first('sale-next'));
      t.eq(where(), next, 'N1 «بيع جديد» يفتح الفاتورة الجديدة بالمخزن نفسه');
    });

    await step('N2 done walk-in', async () => {
      fresh(MANAGER, { sale_detail: () => clone(D.owner_walk_in) });
      await mount(`/sales/${D.owner_walk_in.id}?done=1`);
      const openBox = first('done-open')?.parentNode;
      t.same(
        [byAction('collect-sale').length, textOf('done-open'), openBox?.hasAttribute('data-zero'), first('sale-next')?.getAttribute('href')],
        [0, '0', true, `/sales/new?store=${D.owner_walk_in.warehouse_id}`],
        'N2 الزبون النقديّ بعد الحفظ: بلا «استلم»، والباقي صفر بلا لون الباقي، و«بيع جديد» بمخزنه',
      );
    });

    await step('N3 done ignored when void', async () => {
      fresh(MANAGER, { sale_detail: () => clone(D.owner_multi_after_void) });
      await mount(`/sales/${MULTI.id}?done=1`);
      t.same([byAction('sale-done').length, byAction('sale-head').length, textOf('sale-status')], [0, 1, 'ملغاة'], 'N3 فاتورة أُلغيت بعدُ: الصفحة نفسها لا حالة النجاح');
    });

    // ── I: الصورة المجهَّزة مسبقاً ────────────────────────────────────────────────────────────────────────────────
    await step('I1 prepared image shared inside the click', async () => {
      let inClick = false;
      const shared = [];
      setNavigator({ onLine: true, canShare: () => true, share: async (data) => shared.push({ data, inClick }) });
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}?done=1`);
      t.eq(captures.length, 0, 'I1 ضابط: لا تجهيز في أوّل رسم (وقت الفراغ بعده)');
      await wait(320);
      await settle(20);
      const [capture] = captures;
      t.same(
        [captures.length, capture?.node.getAttribute('data-action'), capture?.options?.width, capture?.options?.backgroundColor, shared.length],
        [1, 'sale-paper', m.INVOICE_IMAGE_WIDTH, 'rgb(255, 255, 255)', 0],
        'I1 الصورة جُهّزت فور التحميل بلا لمس: الورقة بعرض 560 على ورق أبيض',
      );
      inClick = true;
      fire(first('send-image'), 'click', { button: 0 });
      inClick = false;
      await settle(20);
      t.same(
        [shared.length, shared[0]?.inClick, shared[0]?.data.files[0]?.name, captures.length],
        [1, true, 'invoice-FD-2026-0001.png', 1],
        'I1 اللمسة الأولى تنادي navigator.share داخل النقرة نفسها بالملفّ الجاهز، ولا تُرسم الصورة ثانيةً',
      );
    });

    // ── F: الفاتورة ───────────────────────────────────────────────────────────────────────────────────────────────
    t.same(
      ['owner_multi', 'owner_walk_in', 'owner_legacy', 'owner_refunded_leg', 'owner_multi_after_void', 'owner_collected_later'].map((name) => m.toneText(m.saleTone(m.sales.parseSaleInvoice(clone(D[name]))))),
      ['جزء مدفوع', 'مدفوعة', 'مدفوعة', 'جزء مدفوع', 'ملغاة', 'جزء مدفوع'],
      'F1 الحالة من الصافي والباقي الآن لكلّ عيّنة حقيقيّة (قبضٌ بعد البيع جزءٌ مدفوع)',
    );
    t.same(
      [m.toneText(m.saleTone(m.sales.parseSaleInvoice({ ...clone(D.owner_collected_later), open: '10000' }))), m.toneText(m.saleTone(m.sales.parseSaleInvoice({ ...clone(MULTI), total: '0', paid: '0', debt: '0', open: '0' })))],
      ['بالدين', 'بلا مقابل'],
      'F1 لم يُدفع منها شيء «بالدين»، والصفر «بلا مقابل»',
    );

    await step('F2 receipt and lines', async () => {
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      t.same(
        [textOf('sale-status'), textOf('sale-party'), textOf('sale-net'), textOf('sale-paid-sofar'), textOf('sale-open'), textOf('sale-store')],
        ['جزء مدفوع', 'أبو أحمد', '179,860دينار', '80,000', '99,860', 'رصيد العلف'],
        'F2 بطاقة الإيصال: الحالة شريحةً بنصّ والزبون والصافي كبيراً والمدفوع والباقي الآن والمخزن',
      );
      const caption = 'موادّ الفاتورة FD-2026-0001';
      t.same(headersOf(caption), ['المادّة والكمية', 'المبلغ'], 'F2 أعمدة الهاتف: المادّة والكمية في خلية والمبلغ');
      t.same(
        rowsOf(caption),
        [['علف بادئ3 كيس 50 كغم × 35,000خصم السطر 1,000', '105,000'], ['علف بادئ25.5 كغم × 720', '18,360'], ['علف نامي2 كيس 50 كغم × 30,000خصم السطر 500', '60,000']],
        'F2 الكمية بوحدتها × السعر تحت الاسم، والمبلغ الإجماليّ',
      );
      t.same(footOf(caption), [['المجموع قبل الخصم', '183,360'], ['الخصم', '-3,500'], ['الصافي', '179,860']], 'F2 الخصم مرّة واحدة ثمّ الصافي');
      t.same(rowsOf('المدفوع عند البيع للفاتورة FD-2026-0001'), [['الصندوق', '50,000'], ['المصرف', '30,000']], 'F2 سيقان الدفع جدولاً');
      t.same([byAction('void-sale').length, byAction('sale-more').length], [0, 1], 'F2 «ألغِ» ليست ظاهرة: في «⋯»');
      const actions = first('sale-actions');
      t.same(['send-image', 'print-sale', 'collect-sale', 'sale-more'].map((name) => byAction(name, actions).length), [1, 1, 1, 1], 'F2 الأفعال: أرسل على واتساب، PDF، استلم، ⋯');
      t.ok((first('send-image')?.getAttribute('class') ?? '').includes('sale-btn') && (first('print-sale')?.getAttribute('class') ?? '').includes('sale-btn'), 'F2 الأفعال بارتفاع 48 (sale-btn)');
    });

    await step('F3 wide columns', async () => {
      const before = globalThis.window.matchMedia;
      globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
      try {
        fresh(MANAGER, { sale_detail: () => clone(MULTI) });
        await mount(`/sales/${MULTI.id}`);
        t.same(headersOf('موادّ الفاتورة FD-2026-0001'), ['المادّة', 'الكمية', 'الوحدة', 'السعر', 'خصم السطر', 'المبلغ'], 'F3 الشاشة العريضة بأعمدة التفصيل');
      } finally {
        globalThis.window.matchMedia = before;
      }
    });

    await step('F4 void from the menu', async () => {
      fresh(MANAGER, { sale_detail: (_args, n) => clone(n === 1 ? MULTI : D.owner_multi_after_void), void_sale: () => clone(R.void_sale.manager_multi_kept) });
      await mount(`/sales/${MULTI.id}`);
      await click(first('sale-more'));
      t.same([first('sale-more')?.getAttribute('aria-expanded'), textOf('void-sale')], ['true', 'ألغِ الفاتورة'], 'F4 «⋯» تفتح قائمة فيها «ألغِ الفاتورة»');
      fire(globalThis.document, 'keydown', { key: 'Escape' });
      await settle();
      t.eq(byAction('void-sale').length, 0, 'F4 Esc يغلق القائمة');
      await click(first('sale-more'));
      await click(first('void-sale'));
      t.ok(text().includes('إلغاء البيع FD-2026-0001؟') && text().includes('ترجع موادّ الفاتورة (مادّتان) إلى مخزنها، ويُعكس قيد الفاتورة على «أبو أحمد».') && textOf('void-cash-kept')?.includes('(80,000 دينار)'), 'F4 ConfirmDialog يسمّي الفاتورة والبضاعة (موادّ لا سطور) والمقبوض الباقي رصيداً');
      type(first('void-sale-reason'), 'خطأ في الزبون');
      await settle();
      await click(first('confirm-void-sale'));
      await settle(20);
      t.same([named('void_sale')[0]?.p_sale_id, named('void_sale')[0]?.p_reason, named('sale_detail').length], [MULTI.id, 'خطأ في الزبون', 2], 'F4 void_sale بالفاتورة والسبب، ثمّ تُقرأ من جديد');
      t.same([textOf('sale-status'), byAction('sale-more').length, textOf('sale-voided-note')?.includes('أُلغي البيع FD-2026-0001.')], ['ملغاة', 0, true], 'F4 ثمّ «ملغاة» بلا «⋯»، وجملة الإلغاء من جواب الخادم');
      const target = m.voidTargetOf(m.sales.parseSaleInvoice(clone(D.owner_walk_in)));
      t.same([target.walkIn, target.paid, target.goods], [true, 2550000n, 'موادّ الفاتورة (مادّتان)'], 'F4 هدف الإلغاء من الفاتورة: الزبون النقديّ ومدفوعه');
    });

    // ── P: الورقة ────────────────────────────────────────────────────────────────────────────────────────────────
    await step('P1 paper', async () => {
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      const caption = 'سطور الفاتورة FD-2026-0001';
      t.same(headersOf(caption), ['المادّة', 'الكمية', 'الوحدة', 'السعر', 'المبلغ'], 'P1 الورقة بلا عمودي الخصم الموزَّع');
      t.same(rowsOf(caption).map((row) => [row[1], row[4]]), [['3', '105,000'], ['25.5', '18,360'], ['2', '60,000']], 'P1 الأكياس «3» لا «3.0» بجانب «25.5»، والمبلغ الإجماليّ قبل الخصم');
      t.same(footOf(caption), [['المجموع', '183,360'], ['الخصم', '-3,500']], 'P1 الخصم مرّة واحدة في المجاميع');
      t.same([textOf('sale-paper-total'), textOf('sale-paper-open'), textOf('sale-paper-no')], ['الصافي:179,860 دينار', 'الباقي:99,860 دينار', 'رقم: FD-2026-0001'], 'P1 الصافي والباقي والرقم');
      t.same([m.lineQtyText(3000n), m.lineQtyText(25500n), m.lineQtyText(2250n)], ['3', '25.5', '2.25'], 'P1 الكمية بمراتبها هي');
      const slot = first('sale-paper')?.parentNode;
      t.same([slot?.getAttribute('class'), slot?.hasAttribute('data-open')], ['sale-paper-slot', false], 'P1 الورقة مطويّة تحت «الورقة كما تصل الزبون»');
      await click(first('toggle-paper'));
      t.same([slot?.hasAttribute('data-open'), first('toggle-paper')?.getAttribute('aria-expanded')], [true, 'true'], 'P1 وتُفتح بلمسة');
    });
    {
      t.same(rule(DOC_CSS, '.inv-meta')?.['white-space'], 'nowrap', 'P2 رقم الفاتورة ويومها لا ينكسران («FD-2026-» / «0101»)');
      const light = tokens(':root');
      const slot = rule(DOC_CSS, '.sale-paper-slot');
      t.same(Object.keys(light).map((name) => [name, rgb(slot?.[`--${name}`] ?? '')]), Object.entries(light), 'P2 المعاينة برموز السمة الفاتحة كلّها (كصورتها) ولو كان الجهاز داكناً');
      t.ok(/@media print\s*\{\s*\.sale-paper-slot\s*\{\s*display: block !important;/u.test(DOC_CSS), 'P2 والورقة تُطبع ولو كانت مطويّة');
    }

    // ── L: القائمة ───────────────────────────────────────────────────────────────────────────────────────────────
    const AFTER = R.sales_overview.owner_after_collect_and_void;
    await step('L1 columns, chips, row click', async () => {
      fresh(MANAGER, { sales_overview: () => clone(AFTER) });
      await mount('/sales');
      t.same(headersOf(listCaption()), ['الزبون', 'الصافي', 'الباقي الآن', 'الحالة'], 'L1 ترتيب الأعمدة: الزبون | الصافي | الباقي الآن | الحالة');
      t.same(
        listRows().map(([no, , net, open, status]) => [no, net, open, status]),
        [
          ['FD-2026-0005', '24,000', '24,000', 'بالدين'],
          ['FD-2026-0004', '3,000', '2,000', 'جزء مدفوع'],
          ['FD-2026-0003', '6,000', '0', 'مدفوعة'],
          ['MS-2026-0003', '0', '0', 'بلا مقابل'],
          ['MS-2026-0002', '10,000', '6,000', 'جزء مدفوع'],
          ['MD-2026-0001', '—', '—', 'ملغاة'],
          ['MS-2026-0001', '20,000', '0', 'مدفوعة'],
          ['FD-2026-0002', '630,000', '630,000', 'بالدين'],
          ['FD-2026-0001', '—', '—', 'ملغاة'],
        ],
        'L1 كلّ صفّ: الرقم والصافي والباقي الآن والحالة شريحةً بنصّ (الملغاة «—»)',
      );
      t.eq(byAction('void-sale').length, 0, 'L1 لا «ألغِ» في الصفوف');
      t.same([textOf('strip-sold'), textOf('strip-paid'), textOf('strip-open')], ['693,000', '27,000', '662,000'], 'L1 شريط المدّة من مجاميع الخادم');
      const row = sectionOf(tableOf(listCaption()), 'tbody').children[1];
      fire(row.children[2], 'click', { button: 0 });
      await settle();
      t.eq(where(), `/sales/${AFTER.rows[1].id}`, 'L1 الصفّ كلّه يفتح الفاتورة (لا الرقم الصغير وحده)');
    });

    await step('L2 search, filters, back keeps them', async () => {
      fresh(MANAGER, { sales_overview: () => clone(AFTER) });
      await mount('/sales');
      type(first('sales-search'), 'مزرعه');
      await settle();
      t.same(listRows().map(([no]) => no), ['FD-2026-0005', 'FD-2026-0004', 'MS-2026-0003', 'MS-2026-0002', 'FD-2026-0002'], 'L2 البحث بالزبون (ة وه سواء)');
      t.ok(textOf('sales-found')?.startsWith('5 فواتير من') && byAction('sales-table')[0] && footOf(listCaption()).length === 0, 'L2 عدد ما يظهر، وبلا مجاميع الخادم فوق صفوف مصفّاة');
      type(first('sales-search'), '0004');
      await settle();
      t.same(listRows().map(([no]) => no), ['FD-2026-0004'], 'L2 البحث برقم الفاتورة');
      type(first('sales-search'), 'زبون نقدي');
      await settle();
      t.same(listRows().map(([no]) => no), ['MD-2026-0001', 'MS-2026-0001'], 'L2 «زبون نقدي» يجد فواتير الزبون النقديّ');
      await click(first('sales-search-off'));
      await click(first('sales-show-open'));
      t.same(listRows().map(([no]) => no), ['FD-2026-0005', 'FD-2026-0004', 'MS-2026-0002', 'FD-2026-0002'], 'L2 «عليها باقٍ»: المحفوظة بباقٍ الآن');
      t.eq(first('sales-show-open')?.getAttribute('aria-pressed'), 'true', 'L2 الشريحة المختارة aria-pressed');
      await click(first('sales-show-void'));
      t.same(listRows().map(([no]) => no), ['MD-2026-0001', 'FD-2026-0001'], 'L2 «ملغاة»');
      type(first('sales-search'), 'أبو');
      await settle();
      t.same(listRows(), [['FD-2026-0001', 'أبو أحمد', '—', '—', 'ملغاة']], 'L2 البحث والتصفية معاً');
      const href = first('open-sale')?.getAttribute('href') ?? '';
      const back = new URLSearchParams(href.split('?')[1] ?? '').get('back') ?? '';
      t.same([href.startsWith(`/sales/${AFTER.rows[8].id}?back=`), new URLSearchParams(back.split('?')[1]).get('f'), new URLSearchParams(back.split('?')[1]).get('q')], [true, 'void', 'أبو'], 'L2 رابط الفاتورة يعود إلى القائمة كما تُركت');
      fresh(MANAGER, { sale_detail: () => clone(D.owner_multi_after_void), sales_overview: () => clone(AFTER) });
      await click(first('open-sale'));
      await settle(20);
      t.same([first('back')?.getAttribute('href'), textOf('sale-status')], [back, 'ملغاة'], 'L2 «رجوع» الفاتورة إلى القائمة بمدّتها وبحثها وتصفيتها');
      await click(first('back'));
      await settle(20);
      t.same([first('sales-search')?.value, first('sales-show-void')?.getAttribute('aria-pressed'), listRows().map(([no]) => no)], ['أبو', 'true', ['FD-2026-0001']], 'L2 والقائمة تعود بالبحث والتصفية نفسيهما');
    });

    await step('L3 periods from the server day', async () => {
      fresh(MANAGER, { sales_overview: (args) => ({ ...clone(AFTER), from: args.p_from, to: args.p_to }) });
      await mount('/sales');
      await settle(20);
      t.same(named('sales_overview').at(-1), { p_from: '2026-11-01', p_to: '2026-11-17' }, 'L3 «الشهر» افتراضياً من يوم الخادم');
      await click(first('sales-period-today'));
      await settle(20);
      t.same([named('sales_overview').at(-1), textOf('sales-strip')?.startsWith('اليوم')], [{ p_from: '2026-11-17', p_to: '2026-11-17' }, true], 'L3 «اليوم» ويسمّيه الشريط');
      await click(first('sales-period-week'));
      await settle(20);
      t.same([named('sales_overview').at(-1), where()], [{ p_from: '2026-11-11', p_to: '2026-11-17' }, '/sales?p=week'], 'L3 «الأسبوع» آخر سبعة أيّام، والمدّة في الرابط');
      await click(first('sales-period-range'));
      await settle(20);
      const from = all().find((n) => n.localName === 'input' && (n.getAttribute('id') ?? '').endsWith('-from'));
      t.eq(from?.value, '11/11/2026', 'L3 «مدّة…» تبدأ بالمدّة المعروضة');
      type(from, '15/11/2026');
      await settle(20);
      t.same(named('sales_overview').at(-1), { p_from: '2026-11-15', p_to: '2026-11-17' }, 'L3 والمدّة المكتوبة تُقرأ');
    });

    await step('L4 by customer opens his invoices', async () => {
      fresh(MANAGER, { sales_overview: () => clone(AFTER), sales_report: () => clone(R.sales_report.owner_party) });
      await mount('/sales?view=party');
      await settle(20);
      t.same(headersOf('تقرير المبيعات حسب الزبون')?.[0], 'الزبون', 'L4 «حسب الزبون»');
      await click(byAction('report-open').find((n) => n.textContent === 'مزرعة النور'));
      await settle(20);
      t.same(
        [where().startsWith('/sales?party=' + R.sales_overview.owner.rows.find((r) => r.party_name === 'مزرعة النور').party_id), listRows().map(([no]) => no), textOf('party-off')],
        [true, ['FD-2026-0005', 'FD-2026-0004', 'MS-2026-0003', 'MS-2026-0002', 'FD-2026-0002'], 'فواتير «مزرعة النور»اعرض كلّ الزبائن'],
        'L4 صفّ الزبون يفتح فواتيره في المدّة نفسها',
      );
      await click(first('party-off'));
      t.eq(listRows().length, AFTER.rows.length, 'L4 «×» يعيد كلّ الزبائن');
      await unmount();
      fresh(MANAGER, { sales_overview: (args) => ({ ...clone(AFTER), from: args.p_from, to: args.p_to }), sales_report: () => clone(S21.sales_report.owner_day) });
      await mount('/sales?view=day');
      await settle(20);
      await click(first('report-open'));
      await settle(20);
      t.same(named('sales_overview').at(-1), { p_from: '2026-11-08', p_to: '2026-11-08' }, 'L4 و«حسب اليوم» يفتح فواتير يومه');
    });

    await step('L5 new sale reachable', async () => {
      fresh(sessionOf('storekeeper'), { sales_overview: () => clone(R.sales_overview.storekeeper) });
      await mount('/sales');
      t.same([first('new-sale')?.getAttribute('href'), first('new-sale')?.getAttribute('class')], ['/sales/new', 'sale-fab'], 'L5 «بيع جديد» زرّ ثابت (sale-fab) يفتح الفاتورة الجديدة');
      t.eq(text().includes('الربح'), false, 'L5 الأمين بلا كلفة ولا ربح');
    });

    // ── B: الشريط السفلي والرئيسية ─────────────────────────────────────────────────────────────────────────────
    {
      const items = (role, over = {}) => m.bottomItems(sessionOf(role, over)).map((item) => item.to);
      t.same(
        [items('storekeeper', { divisions: ['general'] }), items('accountant', { divisions: ['general'] }), items('owner')],
        [['/', '/inventory', '/sales'], ['/', '/inventory', '/accounts', '/sales'], ['/', '/broiler/round', '/inventory', '/accounts']],
        'B1 «المبيعات» في الشريط لمن يبيع حين يتّسع (والمالك بجولته وحساباته كما كان: خمسة بنود مع «القائمة»)',
      );
      t.same(items('viewer', { divisions: ['general'] }).includes('/sales'), false, 'B1 من لا يبيع بلا بند المبيعات');
      const keys = (role) => m.homeActions({ role, canSeeAccounts: true }).map((action) => action.key);
      t.same([keys('storekeeper')[1], keys('accountant')[1], m.HOME_ACTIONS_SHOWN], ['sale', 'sale', 4], 'B2 «بِع» ثاني أفعال الأمين والمحاسب في الرئيسية (ظاهراً لا خلف «أعمال أخرى»)');
    }
    await step('B3 bottom bar hidden on the sell screen', async () => {
      fresh(sessionOf('storekeeper', { divisions: ['general'] }));
      await mount('/sales', { bar: true });
      t.same(descendants(all().find((n) => n.localName === 'nav') ?? body()).filter((n) => n.localName === 'a').map((n) => n.getAttribute('href')), ['/', '/inventory', '/sales'], 'B3 الشريط في المبيعات بالبند');
      await unmount();
      fresh(sessionOf('storekeeper', { divisions: ['general'] }));
      await mount('/sales/new', { bar: true });
      t.same([all().filter((n) => n.localName === 'nav').length, byAction('tab-menu').length], [0, 0], 'B3 ولا شريط في /sales/new (شاشة البيع ترسم شريطها)');
    });

    // ── C: التباين والحركة ──────────────────────────────────────────────────────────────────────────────────────
    {
      const light = tokens(':root');
      const dark = tokens('.dark');
      const chips = ['paid', 'partial', 'credit'].flatMap((tone) => {
        const l = rule(DOC_CSS, `.sale-chip[data-tone='${tone}']`);
        const d = rule(DOC_CSS, `.dark .sale-chip[data-tone='${tone}']`);
        return [[`${tone} light`, contrast(rgb(l['--chip-ink']), rgb(l['--chip-bg']))], [`${tone} dark`, contrast(rgb(d['--chip-ink']), rgb(d['--chip-bg']))]];
      });
      chips.push(['void light', contrast(light['ink-muted'], light['surface-3'])], ['void dark', contrast(dark['ink-muted'], dark['surface-3'])]);
      const open = rule(DOC_CSS, "[data-part='open']:not([data-zero]) dd");
      const openDark = rule(DOC_CSS, ".dark [data-part='open']:not([data-zero]) dd");
      const stamp = rule(DOC_CSS, '.inv-stamp');
      const menu = rule(DOC_CSS, '.dark .sale-menu-danger');
      const fab = rule(DOC_CSS, '.sale-fab');
      const pill = rule(DOC_CSS, ".sale-pill[aria-pressed='true']");
      const pairs = [
        ...chips,
        ['open light', contrast(rgb(open.color), light['surface-1'])],
        ['open dark', contrast(rgb(openDark.color), dark['surface-1'])],
        ['void stamp (paper is always light)', contrast(rgb(stamp.color), [255, 255, 255])],
        ['void menu dark', contrast(rgb(menu.color), dark['surface-1'])],
        ['fab', contrast(rgb(fab.color), rgb(fab.background))],
        ['pill', contrast(rgb(pill.color), rgb(pill.background))],
      ];
      const weak = pairs.filter(([, ratio]) => ratio < 4.5).map(([name, ratio]) => `${name} ${ratio.toFixed(2)}`);
      t.same(weak, [], `C1 كلّ نصّ في شاشات ما بعد البيع ≥ 4.5:1 بالسمتين (${pairs.length} زوجاً)`);
      const button = readFileSync(path.join(ROOT, 'src', 'components', 'ui', 'Button.tsx'), 'utf8');
      const primary = button.match(/primary: '([^']+)'/u)?.[1] ?? '';
      t.ok(primary.includes('bg-brand-600') && !primary.includes('dark:bg-brand-500') && contrast([255, 255, 255], [0x12, 0x66, 0xd8]) >= 4.5, 'C1 الزرّ الأساسيّ brand-600 بالسمتين (أبيض عليه ≥ 4.5:1؛ brand-500 كان 3.86)');
      const ms = (value) => (value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000);
      const pop = /animation: sale-pop (\d+ms)/u.exec(DOC_CSS)?.[1] ?? '';
      const draw = /animation: sale-draw (\d+ms) (\d+ms)/u.exec(DOC_CSS);
      t.ok(ms(pop) <= 400 && draw && ms(draw[1]) + ms(draw[2]) <= 400, `C2 علامة ✓ بحركة ≤ 400ms (${pop}، ${draw?.[1]}+${draw?.[2]})`);
      const reduced = DOC_CSS.slice(DOC_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
      t.ok(/animation: none;/u.test(reduced.slice(0, 300)) && /stroke-dashoffset: 0;/u.test(reduced.slice(0, 300)), 'C2 وبلا حركة لطالب تقليل الحركة، والعلامة مرسومة كاملة');
      const kit = readFileSync(path.join(ROOT, 'src', 'pages', 'sales', 'docKit.tsx'), 'utf8');
      t.ok(kit.includes("import './doc.css';"), 'C3 الأنماط في doc.css الكسول تستورده حزمة المبيعات');
    }
  } catch (error) {
    t.ok(false, `رمى خارج الخطوات: ${error?.stack ?? error}`);
  } finally {
    if (root && m) {
      const mounted = root;
      root = null;
      m.flushSync(() => mounted.unmount());
    }
    restoreDom();
    for (const [key, desc] of [['sessionStorage', saved.session], ['navigator', saved.navigator]]) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
    if (saved.clone) Object.defineProperty(Element.prototype, 'cloneNode', saved.clone);
    else delete Element.prototype.cloneNode;
    if (saved.textClone) Object.defineProperty(Text.prototype, 'cloneNode', saved.textClone);
    else delete Text.prototype.cloneNode;
  }
}
