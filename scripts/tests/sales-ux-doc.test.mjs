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
// C التباين: ألوان doc.css رموز --sd- (الشرائح والباقي والروابط وقائمة الإلغاء والعلامة) ≥ 4.5:1 بالسمتين و«وضوح»، ولا لون مكتوب خارج كتل الرموز،
//   والزرّ الأساسيّ brand-600 في الداكن، والحركة ≤ 400ms وتقف لطالب تقليل الحركة.
// مراجعة ما بعد البيع (A2–A11 وS14 وD7–D24): N4–N6 وI2 وF5–F12 وP3 وL6–L11 وB4–B5، وكلّ منها فشل على 02d5907 قبل إصلاحه.
// R المراجعة الثانية (Q1–Q12 وقراءة A10): كلّ خطوة R فشلت على 81dc029 قبل إصلاحها.
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
    "export { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';",
    "export { SalesRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { default as BottomBar, bottomItems } from './src/components/shell/BottomBar.tsx';",
    "export { homeActions, HOME_ACTIONS_SHOWN } from './src/pages/home/HomePage.tsx';",
    "export * as sales from './src/lib/repo/sales.ts';",
    "export { saleTone, rowTone, toneText } from './src/pages/sales/docKit.tsx';",
    "export { lineQtyText, INVOICE_IMAGE_WIDTH } from './src/pages/sales/saleParts.tsx';",
    "export { invoicesText, stripName, stripCount } from './src/pages/sales/SalesPage.tsx';",
    "export { saleDraftKey } from './src/pages/sales/saleDraft.ts';",
    "export { voidTargetOf, voidPendingKey } from './src/pages/sales/SaleVoidDialog.tsx';",
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
    local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    clone: Object.getOwnPropertyDescriptor(Element.prototype, 'cloneNode'),
    textClone: Object.getOwnPropertyDescriptor(Text.prototype, 'cloneNode'),
  };
  const store = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() }, configurable: true, writable: true });
  // localStorage للجهاز (الربح المفتوح، وشرح «استلم دفعة» قُرئ، والفاتورة المفتوحة): يُمسح أوّل كلّ خطوة ويبقى بين التركيبين داخلها (= إعادة تحميل).
  const local = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, String(v)), removeItem: (k) => local.delete(k), clear: () => local.clear() }, configurable: true, writable: true });
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
        globalThis.__ux.nav = m.useNavigate();
        return m.h(m.Routes, null, m.h(m.Route, { path: '/sales/*', element: m.h(m.SalesRoutes) }), m.h(m.Route, { path: '*', element: null }));
      }
      const entries = Array.isArray(url) ? url : [url];
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: entries, initialIndex: entries.length - 1 }, m.h(Where), bar ? m.h(m.BottomBar, { onMenu: () => {} }) : null)));
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
      local.clear();
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
      const actions = first('sale-done')?.children.find((n) => n.getAttribute('class') === 'sale-done-actions');
      t.same(
        [byAction('collect-sale').length, byAction('done-open').length, textOf('done-paid-all'), first('sale-next')?.getAttribute('href')],
        [0, 0, 'مدفوعة كلّها', `/sales/new?store=${D.owner_walk_in.warehouse_id}`],
        'N2 الزبون النقديّ بعد الحفظ: بلا «استلم دفعة»، و«مدفوعة كلّها» مكان «الباقي 0» («الباقي» للدين القائم وحده، D7/D8)، و«بيع جديد» بمخزنه',
      );
      t.same(
        [actions?.children[0]?.getAttribute('data-action'), first('sale-next')?.hasAttribute('data-primary'), first('send-image')?.getAttribute('class')?.includes('bg-brand-600')],
        ['sale-next', true, false],
        'N2 الزبون النقديّ بلا جهة يُرسل إليها: «بيع جديد» الزرّ الأساسيّ الأوّل، و«أرسل على واتساب» ثانويّ (D7)',
      );
    });

    await step('N3 done ignored when void', async () => {
      fresh(MANAGER, { sale_detail: () => clone(D.owner_multi_after_void) });
      await mount(`/sales/${MULTI.id}?done=1`);
      t.same([byAction('sale-done').length, byAction('sale-head').length, textOf('sale-status')], [0, 1, 'ملغاة'], 'N3 فاتورة أُلغيت بعدُ: الصفحة نفسها لا حالة النجاح');
    });

    await step('N4 done once, and only who sells gets «بيع جديد»', async () => {
      // A9: ?done=1 يُمحى من سجلّ المتصفّح بعد أوّل رسم (البطاقة تبقى لهذه الزيارة)، فلا تعود بإعادة التحميل ولا بالرجوع ولا برابط منسوخ.
      const calls = [];
      const before = { history: globalThis.window.history, location: globalThis.window.location };
      globalThis.window.history = { state: { idx: 3, key: 'k' }, replaceState: (...args) => calls.push(args) };
      globalThis.window.location = { pathname: `/sales/${MULTI.id}`, search: '?done=1&back=%2F', hash: '' };
      try {
        fresh(sessionOf('viewer'), { sale_detail: () => clone(MULTI) });
        await mount(`/sales/${MULTI.id}?done=1&back=%2F`);
        t.same(
          [byAction('sale-done').length, byAction('sale-next').length, calls.map(([state, , url]) => [state?.idx, url])],
          [1, 1, [[3, `/sales/${MULTI.id}?back=%2F`]]],
          'N4 بطاقة النجاح لهذه الزيارة، و?done=1 يُمحى بحالة السجلّ نفسها (A9)؛ والمشاهد يبيع فله «بيع جديد» (0034)',
        );
      } finally {
        globalThis.window.history = before.history;
        globalThis.window.location = before.location;
      }
    });

    await step('N5 done is announced', async () => {
      // A6 (U10 وX3): «حُفظت» في منطقة حيّة، والتركيز عليها حين تظهر.
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}?done=1`);
      const live = all().filter((n) => n.getAttribute('role') === 'status' && (n.textContent ?? '').includes('حُفظت'));
      t.same([live.length, globalThis.document.activeElement?.getAttribute('data-action'), first('sale-done-title')?.getAttribute('tabindex')], [1, 'sale-done-title', '-1'], 'N5 «حُفظت» تصل قارئ الشاشة: منطقة حيّة والتركيز عليها');
    });

    await step('N6 bottom bar hidden on the success state', async () => {
      fresh(sessionOf('storekeeper', { divisions: ['general'] }), { sale_detail: () => clone(D.storekeeper_multi) });
      await mount(`/sales/${MULTI.id}?done=1`, { bar: true });
      t.same([byAction('sale-done').length, all().filter((n) => n.localName === 'nav').length], [1, 0], 'N6 بعد الحفظ لا شريط سفليّ فوق الخطوة التالية (D7)');
      await unmount();
      fresh(sessionOf('storekeeper', { divisions: ['general'] }), { sale_detail: () => clone(D.storekeeper_multi) });
      await mount(`/sales/${MULTI.id}`, { bar: true });
      t.eq(all().filter((n) => n.localName === 'nav').length, 1, 'N6 ضابط: صفحة الفاتورة نفسها بالشريط');
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

    await step('I2 double tap while the share sheet opens', async () => {
      // A8 (X5): لمسة ثانية والمشاركة مفتوحة لا تفتح أخرى، ولا تنزّل الصورة ولا تقول «حُفظت في التنزيلات».
      let calls = 0;
      setNavigator({
        onLine: true,
        canShare: () => true,
        share: () => {
          calls += 1;
          if (calls === 1) return new Promise(() => {});
          return Promise.reject(Object.assign(new Error('An earlier share has not yet completed.'), { name: 'InvalidStateError' }));
        },
      });
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}?done=1`);
      await wait(320);
      await settle(20);
      fire(first('send-image'), 'click', { button: 0 });
      fire(first('send-image'), 'click', { button: 0 });
      await settle(20);
      t.same([calls, globalThis.__ux.toasts.length, first('send-image')?.getAttribute('aria-busy')], [1, 0, 'true'], 'I2 لمستان: مشاركة واحدة، بلا تنزيل ولا تنبيه، والزرّ مشغول');
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

    const LATER = D.owner_collected_later;
    await step('F5 void names the money the server moves', async () => {
      // A3 (X1): void_sale يحرّر كلّ ما دُفع (عند البيع وبعده) ويوزّعه على أقدم ما على الزبون، وما يبقى رصيد له.
      fresh(MANAGER, { sale_detail: () => clone(LATER) });
      await mount(`/sales/${LATER.id}`);
      await click(first('sale-more'));
      await click(first('void-sale'));
      t.eq(
        textOf('void-cash-kept'),
        `وما سُدِّد منها بعد البيع (4,000 دينار) يُحسب لـ«${LATER.party_name}»: يُسدَّد به أقدم ما عليه من فواتير مفتوحة في الدفتر نفسه أوّلاً، وما يبقى منه رصيد له.`,
        'F5 وR5 الفاتورة التي سُدِّد منها 4,000 بعد البيع (قبضٌ أو إعفاءٌ أو تسوية، لا «قُبض» وحده، Q5): التأكيد يسمّيها ويقول أين تذهب في الدفتر نفسه',
      );
      const both = m.voidTargetOf(m.sales.parseSaleInvoice({ ...clone(LATER), paid: '3000', open: '2000' }));
      t.same([both.paid, both.collectedLater], [300000n, 500000n], 'F5 المدفوع عند البيع والمقبوض بعده = الصافي − الباقي − المدفوع');
    });

    await step('F6 failed re-read after a void', async () => {
      // A2 (X2): الإلغاء نجح والقراءة بعده فشلت: لا «جزء مدفوع» ولا «⋯» ولا «استلم دفعة»، ولا تُرسل صورة ما قبل الإلغاء، و«أعد القراءة».
      const shared = [];
      setNavigator({ onLine: true, canShare: () => true, share: async (data) => shared.push(data) });
      let fail = true;
      fresh(MANAGER, {
        sale_detail: (_args, n) => {
          if (n === 1) return clone(MULTI);
          if (fail) throw new Error('fetch failed');
          return clone(D.owner_multi_after_void);
        },
        void_sale: () => clone(R.void_sale.manager_multi_kept),
      });
      await mount(`/sales/${MULTI.id}`);
      await wait(320);
      await settle(20);
      const before = captures.length;
      await click(first('sale-more'));
      await click(first('void-sale'));
      type(first('void-sale-reason'), 'خطأ');
      await settle();
      await click(first('confirm-void-sale'));
      await settle(30);
      fire(first('send-image'), 'click', { button: 0 });
      await settle(20);
      t.same(
        [textOf('sale-status'), byAction('sale-more').length, byAction('collect-sale').length, first('send-image')?.hasAttribute('disabled'), shared.length, captures.length - before, byAction('sale-reread').length],
        ['ملغاة', 0, 0, true, 0, 0, 1],
        'F6 الإلغاء نجح والقراءة فشلت: «ملغاة» بلا «⋯» ولا «استلم دفعة»، والإرسال معطّل حتى تُقرأ، و«أعد القراءة»',
      );
      fail = false;
      await click(first('sale-reread'));
      await settle(30);
      t.same([textOf('sale-status'), byAction('sale-stale').length, first('send-image')?.hasAttribute('disabled')], ['ملغاة', 0, false], 'F6 ثمّ قراءة جديدة: الفاتورة من الخادم والإرسال يعود');
    });

    await step('F7 blocked image does not survive a void', async () => {
      // A2 (X10): «الصورة جاهزة — أرسلها» مربوطة بالقراءة التي صُنعت منها، فتختفي بعد الإلغاء ولا تُرسل صورة ما قبله.
      const shared = [];
      let calls = 0;
      setNavigator({ onLine: true, canShare: () => true, share: async (data) => { calls += 1; if (calls === 1) throw Object.assign(new Error('no activation'), { name: 'NotAllowedError' }); shared.push(data); } });
      fresh(MANAGER, { sale_detail: (_args, n) => clone(n === 1 ? MULTI : D.owner_multi_after_void), void_sale: () => clone(R.void_sale.manager_multi_kept) });
      await mount(`/sales/${MULTI.id}`);
      fire(first('send-image'), 'click', { button: 0 });
      await settle(30);
      const readyBefore = byAction('image-ready').length;
      await click(first('sale-more'));
      await click(first('void-sale'));
      type(first('void-sale-reason'), 'خطأ');
      await settle();
      await click(first('confirm-void-sale'));
      await settle(40);
      t.same([readyBefore, byAction('image-ready').length, shared.length], [1, 0, 0], 'F7 «أرسلها» القديمة تختفي بالإلغاء');
    });

    await step('F8 unknown void survives closing and reload', async () => {
      // A11: الطلب المجهول محفوظ بمفتاح المستخدم والمنشأة والفاتورة؛ «لا، تراجع» يقرأ الفاتورة من جديد؛ وبعد إعادة التحميل يعود بالمرجع والسبب.
      let n = 0;
      fresh(MANAGER, {
        sale_detail: () => clone(MULTI),
        void_sale: () => {
          n += 1;
          if (n === 1) throw new m.UnknownOutcomeError('fetch_failed');
          return clone(R.void_sale.manager_multi_kept);
        },
      });
      await mount(`/sales/${MULTI.id}`);
      await click(first('sale-more'));
      await click(first('void-sale'));
      type(first('void-sale-reason'), 'زبون آخر');
      await settle();
      await click(first('confirm-void-sale'));
      await settle(20);
      const key = m.voidPendingKey('u-manager', 'org-1', MULTI.id);
      const kept = JSON.parse(store.get(key) ?? 'null');
      const firstRef = named('void_sale')[0]?.p_client_ref;
      t.same([kept?.reason, kept?.ref === firstRef, byAction('void-sale-unknown').length], ['زبون آخر', true, 1], 'F8 نتيجة مجهولة: السبب والمرجع محفوظان خارج النافذة');
      const reads = named('sale_detail').length;
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع'));
      await settle(20);
      t.same([named('sale_detail').length, byAction('void-pending-banner').length], [reads + 1, 1], 'F8 «لا، تراجع» يقرأ الفاتورة من جديد، والشريط يقول إنّ الإلغاء لم يُعرف');
      await unmount();
      await mount(`/sales/${MULTI.id}`);
      await click(first('void-pending-retry'));
      t.same([first('void-sale-reason')?.value, first('void-sale-reason')?.hasAttribute('disabled')], ['زبون آخر', true], 'F8 بعد إعادة التحميل: الإلغاء يعود مجمَّداً بسببه');
      await click(first('confirm-void-sale'));
      await settle(20);
      t.same([named('void_sale').at(-1)?.p_client_ref, store.has(key)], [firstRef, false], 'F8 والإعادة بالمرجع نفسه، ثمّ يُمحى');
    });

    await step('F9 why a manager cannot void', async () => {
      // A11: void_block لمن يُلغي عادةً ولا يرى «⋯».
      fresh(MANAGER, { sale_detail: () => ({ ...clone(MULTI), can_void: false, void_block: 'period_locked' }) });
      await mount(`/sales/${MULTI.id}`);
      t.same([byAction('sale-more').length, textOf('void-block')], [0, 'لا تُلغى هذه الفاتورة الآن: الفترة مقفلة، ويفتحها مالك المنشأة.'], 'F9 الفترة مقفلة: الجملة مكان «⋯»');
      await unmount();
      fresh(sessionOf('storekeeper'), { sale_detail: () => clone(D.storekeeper_multi) });
      await mount(`/sales/${MULTI.id}`);
      t.eq(byAction('void-block').length, 0, 'F9 ضابط: الدور لا يُلغي (forbidden) فلا جملة');
      t.eq(m.sales.parseSaleInvoice(clone(D.storekeeper_multi)).voidBlock, 'forbidden', 'F9 void_block الحقيقيّ محلَّل');
    });

    await step('F10 Esc returns focus to «⋯»', async () => {
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      await click(first('sale-more'));
      t.eq(globalThis.document.activeElement?.getAttribute('data-action'), 'void-sale', 'F10 القائمة تفتح والتركيز على «ألغِ الفاتورة»');
      fire(globalThis.document, 'keydown', { key: 'Escape' });
      await settle();
      t.same([byAction('void-sale').length, globalThis.document.activeElement?.getAttribute('data-action')], [0, 'sale-more'], 'F10 Esc يغلقها ويعيد التركيز إلى «⋯»');
    });

    await step('F11 profit folded and remembered', async () => {
      // D18: الكلفة والربح خلف «الربح» مطويّين، ويتذكّر الجهاز اختيار المستخدم.
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      t.same([byAction('sale-cost').length, first('profit-toggle')?.getAttribute('aria-expanded')], [0, 'false'], 'F11 الربح مطويّ افتراضياً');
      await click(first('profit-toggle'));
      t.same([byAction('sale-cost').length, local.get('sales.profit.open:u-manager')], [1, '1'], 'F11 ويُفتح بلمسة ويُتذكَّر');
      await unmount();
      await mount(`/sales/${MULTI.id}`);
      t.eq(byAction('sale-cost').length, 1, 'F11 والفتح التالي كما تركه');
    });

    await step('F12 collect note once, words', async () => {
      // D22 وD8: شرح «استلم دفعة» أوّل مرّة وحدها، و«ملفّ PDF»، و«الزبون» لا «الجهة».
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      t.same([textOf('collect-sale'), textOf('print-sale'), byAction('collect-note').length], ['استلم دفعة', 'ملفّ PDF', 1], 'F12 «استلم دفعة» و«ملفّ PDF»، والشرح أوّل مرّة');
      await unmount();
      await mount(`/sales/${MULTI.id}`);
      t.eq(byAction('collect-note').length, 0, 'F12 ثمّ لا يتكرّر الشرح');
      await unmount();
      fresh(MANAGER, { sale_detail: () => clone(D.owner_multi_after_void) });
      await mount(`/sales/${MULTI.id}`);
      t.same([textOf('sale-void')?.includes('ولا دين بها على الزبون.'), textOf('sale-payment')], [true, 'ملغاة، وما دُفع لها حُسب للزبون'], 'F12 «الزبون» لا «الجهة» في الملغاة');
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

    await step('P3 customer paper without the farm box names', async () => {
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      t.same([textOf('sale-paper-paid'), rowsOf('المدفوع عند البيع للفاتورة FD-2026-0001').map((row) => row[0])], ['المدفوع عند البيع:80,000 دينار', ['الصندوق', 'المصرف']], 'P3 الورقة بالمبلغ وحده (D24)، والصناديق في صفحة التطبيق');
    });

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
      t.same([textOf('strip-sold'), textOf('strip-open'), byAction('strip-paid').length], ['693,000', '662,000', 0], 'L1 شريط المدّة بسطر واحد من مجاميع الخادم: البيع والباقي الآن (D14)');
      await click(first('strip-more'));
      t.eq(textOf('strip-paid'), '27,000', 'L1 و«التفاصيل» تفتح المدفوع عند البيع');
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
      t.same(
        [first('new-sale')?.getAttribute('href'), first('new-sale')?.parentNode?.getAttribute('class'), all().some((n) => (n.getAttribute('class') ?? '').includes('sale-fab'))],
        ['/sales/new', 'sale-list-head', false],
        'L5 «بيع جديد» في صفّ العنوان الثابت (لا زرّ يطفو فوق خلايا المال، D14)',
      );
      t.eq(text().includes('الربح'), false, 'L5 الأمين بلا كلفة ولا ربح');
    });

    await step('L6 strip named by the data it shows', async () => {
      // A4 (X9): «اليوم» لا يُكتب فوق أرقام الشهر وقراءةُ اليوم في الطريق؛ والمعروض يخفت.
      fresh(MANAGER, { sales_overview: (args) => (args.p_from === args.p_to ? new Promise(() => {}) : { ...clone(AFTER), from: args.p_from, to: args.p_to }) });
      await mount('/sales');
      await settle(30);
      await click(first('sales-period-today'));
      await settle(30);
      t.same([first('strip-count')?.parentNode?.children[0]?.textContent, first('sales-strip')?.hasAttribute('data-stale'), first('sales-table')?.hasAttribute('data-stale')], ['هذا الشهر', true, true], 'L6 الشريط باسم مدّة أرقامه، ويخفت والجدول حتى تصل قراءة «اليوم»');
      t.same(
        [m.stripName({ from: '2026-11-17', to: '2026-11-17', today: '2026-11-17' }), m.stripName({ from: '2026-11-11', to: '2026-11-17', today: '2026-11-17' }), m.stripName({ from: '2026-11-01', to: '2026-11-17', today: '2026-11-17' }), m.stripName({ from: '2026-11-03', to: '2026-11-05', today: '2026-11-17' })],
        ['اليوم', 'آخر سبعة أيّام', 'هذا الشهر', 'من 03/11/2026 إلى 05/11/2026'],
        'L6 اسم المدّة من from وto وtoday في الجواب',
      );
    });

    await step('L7 back button from a drill-down', async () => {
      // A5 (X7): فواتير زبون أو يوم من التقرير خطوة جديدة: زرّ الرجوع يعود إلى التقرير.
      fresh(MANAGER, { sales_overview: () => clone(AFTER), sales_report: () => clone(R.sales_report.owner_party) });
      await mount(['/', '/sales?view=party']);
      await settle(20);
      await click(byAction('report-open').find((n) => n.textContent === 'مزرعة النور'));
      await settle(20);
      m.flushSync(() => globalThis.__ux.nav(-1));
      await settle(20);
      t.eq(where(), '/sales?view=party', 'L7 الرجوع من فواتير الزبون إلى «حسب الزبون»');
    });

    await step('L8 report period from the server day', async () => {
      // A7 (X4): ساعة الجهاز 25/11 ويوم الخادم 17/11 (today في sales_report): المدّة تُصحَّح منه.
      const RealDate = Date;
      const fixed = new RealDate('2026-11-25T10:00:00').getTime();
      globalThis.Date = class extends RealDate {
        constructor(...a) {
          if (a.length === 0) super(fixed);
          else super(...a);
        }
        static now() {
          return fixed;
        }
      };
      try {
        fresh(MANAGER, { sales_report: (args) => ({ ...clone(R.sales_report.owner_party), from: args.p_from, to: args.p_to }) });
        await mount('/sales?view=party&p=week');
        await settle(30);
        t.same([named('sales_report')[0]?.p_to, named('sales_report').at(-1)], ['2026-11-25', { p_from: '2026-11-11', p_to: '2026-11-17', p_group: 'party' }], 'L8 التقرير يقرأ مدّته من يوم الخادم لا من ساعة الهاتف');
      } finally {
        globalThis.Date = RealDate;
      }
    });

    await step('L9 one count for the strip and the search line', async () => {
      // A10 (X8): الشريط والبحث يعدّان الفواتير نفسها (والملغاة منها).
      fresh(MANAGER, { sales_overview: () => clone(AFTER) });
      await mount('/sales');
      type(first('sales-search'), 'مزرعه');
      await settle();
      t.same([textOf('strip-count'), textOf('sales-found')], ['9 فواتير، الملغاة منها: 2', '5 فواتير من 9 فواتير'], 'L9 تسع فواتير في الشريط وفي سطر البحث');
    });

    await step('L10 first screen for the table', async () => {
      // D14: الأمين يبدأ باليوم والمالك بالشهر، والمدّة والتصفية صفّ شرائح واحد.
      fresh(sessionOf('storekeeper'), { sales_overview: (args) => ({ ...clone(R.sales_overview.storekeeper), from: args.p_from, to: args.p_to }) });
      await mount('/sales');
      await settle(20);
      const chips = first('sales-chips');
      t.same(
        [named('sales_overview').at(-1)?.p_from === named('sales_overview').at(-1)?.p_to, first('sales-period-today')?.getAttribute('aria-pressed'), byAction('sales-period', chips).length, byAction('sales-show', chips).length],
        [true, 'true', 1, 1],
        'L10 الأمين: «اليوم» افتراضياً، والمدّة والتصفية في صفّ واحد',
      );
      await unmount();
      fresh(MANAGER, { sales_overview: (args) => ({ ...clone(AFTER), from: args.p_from, to: args.p_to }) });
      await mount('/sales');
      await settle(20);
      t.eq(first('sales-period-month')?.getAttribute('aria-pressed'), 'true', 'L10 أدوار الكلفة: «الشهر» افتراضياً');
    });

    await step('L11 open sale chip', async () => {
      // S14: سلّة بيع مفتوحة على الجهاز تعود من المبيعات بلمسة.
      local.set(m.saleDraftKey('u-storekeeper', 'org-1'), JSON.stringify({ v: 1, summary: { lines: 3, total: '21875000', store: 'w-1' } }));
      fresh(sessionOf('storekeeper'), { sales_overview: () => clone(R.sales_overview.storekeeper) });
      await mount('/sales');
      t.same([textOf('sales-open-sale'), first('sales-open-sale')?.getAttribute('href')], ['فاتورة مفتوحة: 3 موادّ · 218,750', '/sales/new'], 'L11 «فاتورة مفتوحة» في المبيعات');
    });

    // ── B: الشريط السفلي والرئيسية ─────────────────────────────────────────────────────────────────────────────
    {
      const items = (role, over = {}) => m.bottomItems(sessionOf(role, over)).map((item) => item.to);
      t.same(
        [items('storekeeper', { divisions: ['general'] }), items('accountant', { divisions: ['general'] }), items('owner')],
        [['/', '/inventory', '/sales'], ['/', '/inventory', '/accounts', '/sales'], ['/', '/broiler/round', '/inventory', '/accounts']],
        'B1 «المبيعات» في الشريط لمن يبيع حين يتّسع (والمالك بجولته وحساباته كما كان: خمسة بنود مع «القائمة»)',
      );
      t.same(items('viewer', { divisions: ['general'] }).includes('/sales'), true, 'B1 المشاهد يبيع فله بند المبيعات (0034)');
      const keys = (role) => m.homeActions({ role, canSeeAccounts: true }).map((action) => action.key);
      t.same([keys('storekeeper')[1], keys('accountant')[1], m.HOME_ACTIONS_SHOWN], ['sale', 'sale', 4], 'B2 «بِع» ثاني أفعال الأمين والمحاسب في الرئيسية (ظاهراً لا خلف «أعمال أخرى»)');
    }
    {
      // D21: «المبيعات» بعربة البيع كزرّ «بِع» في الرئيسية، لا إيصال بعلامة الدولار.
      const sales = m.bottomItems(sessionOf('storekeeper', { divisions: ['general'] })).find((item) => item.to === '/sales');
      const sell = m.homeActions(null).find((action) => action.key === 'sale');
      t.ok(sales && sell && sales.icon === sell.icon, 'B4 أيقونة المبيعات عربة البيع نفسها في الرئيسية');
      // D19: «أعمال أخرى» ≥ 44 بكسل (py-3 مع سطر text-sm: 12 + 20 + 12).
      const home = readFileSync(path.join(ROOT, 'src', 'pages', 'home', 'HomePage.tsx'), 'utf8');
      const summary = /data-action="more-actions"\s+className="([^"]+)"/u.exec(home)?.[1] ?? '';
      t.ok(summary.includes('py-3') && summary.includes('text-sm') && !summary.includes('py-2'), `B5 «أعمال أخرى» بارتفاع 44 (${summary})`);
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

    // ── R: المراجعة الثانية ────────────────────────────────────────────────────────────────────────────────────
    const radio = (label) => all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === label);
    const cancelBtn = () => all().find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع');
    const deferred = () => {
      let resolve;
      let reject;
      const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
      return { promise, resolve, reject };
    };
    /** أخطاء React أثناء fn (#301 «Too many re-renders» ونحوها): ما يُكتب في console.error وما يُرمى بلا التقاط. */
    const reactErrors = async (fn) => {
      const errors = [];
      const before = console.error;
      console.error = (...a) => errors.push(String(a[0]?.message ?? a[0]).slice(0, 160));
      const onError = (e) => errors.push(`uncaught: ${String(e?.message ?? e).slice(0, 160)}`);
      process.on('uncaughtException', onError);
      try {
        await fn();
      } finally {
        console.error = before;
        process.off('uncaughtException', onError);
      }
      return errors;
    };
    const voidFromMenu = async (reason = 'خطأ') => {
      await click(first('sale-more'));
      await click(first('void-sale'));
      type(first('void-sale-reason'), reason);
      await settle();
      await click(first('confirm-void-sale'));
      await settle(30);
    };

    for (const [label, listDays, reportDays, start, then, want] of [
      ['list from yesterday, then the report this morning', ['2026-11-17'], ['2026-11-18'], '/sales', async () => click(radio('حسب الزبون')), 'report'],
      ['report from yesterday, then the list this morning', ['2026-11-17', '2026-11-18'], ['2026-11-17'], '/sales?view=party', async () => {
        await click(radio('الفواتير'));
        await settle(30);
        await click(first('sales-period-week'));
      }, 'list'],
      ['control: one server day', ['2026-11-17'], ['2026-11-17'], '/sales', async () => click(radio('حسب الزبون')), 'report'],
    ]) {
      await step(`R1 ${label}`, async () => {
        // Q1: صفحة مفتوحة عبر منتصف ليل الخادم: القائمة المحفوظة بيوم والتقرير بيوم بعده. يوم الخادم يتقدّم ولا يرجع، فلا تقلّب بلا نهاية.
        let lists = 0;
        let reports = 0;
        fresh(MANAGER, {
          sales_overview: (args) => ({ ...clone(AFTER), from: args.p_from, to: args.p_to, today: listDays[Math.min(lists++, listDays.length - 1)] }),
          sales_report: (args) => ({ ...clone(R.sales_report.owner_party), from: args.p_from, to: args.p_to, today: reportDays[Math.min(reports++, reportDays.length - 1)] }),
        });
        const errors = await reactErrors(async () => {
          await mount(start);
          await settle(30);
          await then();
          await settle(60);
        });
        const newest = [...listDays, ...reportDays].sort().at(-1);
        const last = want === 'report' ? named('sales_report').at(-1) : named('sales_overview').at(-1);
        t.same(
          [byAction(want === 'report' ? 'sales-report' : 'sales-table').length, errors, last?.p_to],
          [1, [], newest],
          `R1 ${label}: الصفحة تُرسم بلا خطأ، والمدّة من أحدث يوم للخادم (${newest})`,
        );
      });
    }

    await step('R2 voided on another device', async () => {
      // Q2: «ألغِ» يلقى already_void: الفاتورة ملغاة، فتُغلق النافذة وتُقرأ، لا خطأ تحت «⋯» و«استلم دفعة».
      fresh(MANAGER, {
        sale_detail: (_args, n) => clone(n === 1 ? MULTI : D.owner_multi_after_void),
        void_sale: () => {
          throw new m.RejectedError('already_void', 'البيع FD-2026-0001 ملغى من قبل.');
        },
      });
      await mount(`/sales/${MULTI.id}`);
      await voidFromMenu();
      t.same(
        [byAction('confirm-void-sale').length, textOf('sale-voided-note'), named('sale_detail').length, textOf('sale-status'), byAction('sale-more').length, byAction('collect-sale').length],
        [0, 'أُلغيت الفاتورة FD-2026-0001 من قبل.', 2, 'ملغاة', 0, 0],
        'R2 already_void: النافذة تُغلق، «أُلغيت من قبل»، وتُقرأ الفاتورة فتظهر ملغاة بلا «⋯» ولا «استلم دفعة»',
      );
    });

    await step('R2b same-ref retry meets another void', async () => {
      let n = 0;
      fresh(MANAGER, {
        sale_detail: (_args, reads) => clone(reads === 1 ? MULTI : D.owner_multi_after_void),
        void_sale: () => {
          n += 1;
          if (n === 1) throw new m.UnknownOutcomeError('fetch_failed');
          throw new m.RejectedError('already_void', 'البيع FD-2026-0001 ملغى من قبل.');
        },
      });
      await mount(`/sales/${MULTI.id}`);
      await voidFromMenu();
      await click(first('confirm-void-sale'));
      await settle(30);
      t.same(
        [byAction('confirm-void-sale').length, store.has(m.voidPendingKey('u-manager', 'org-1', MULTI.id)), textOf('sale-status'), byAction('void-pending-banner').length],
        [0, false, 'ملغاة', 0],
        'R2b الإعادة بالمرجع نفسه تلقى already_void: الطلب المعلَّق يُمحى، والفاتورة ملغاة',
      );
    });

    await step('R2c cancel after a refusal re-reads', async () => {
      fresh(MANAGER, {
        sale_detail: () => clone(MULTI),
        void_sale: () => {
          throw new m.RejectedError('period_locked', 'الفترة مقفلة.');
        },
      });
      await mount(`/sales/${MULTI.id}`);
      await voidFromMenu();
      const reads = named('sale_detail').length;
      await click(cancelBtn());
      await settle(20);
      t.eq(named('sale_detail').length, reads + 1, 'R2c «لا، تراجع» بعد رفضٍ يقرأ الفاتورة من جديد (حالها الآن)');
    });

    await step('R3 a read lands while the void is on its way', async () => {
      // Q3: نتيجة مجهولة ← «لا، تراجع» تبدأ قراءة ← إعادة الإلغاء والقراءة في الطريق ← تصل القراءة (قبل الإلغاء) ← ينجح الإلغاء ← تفشل القراءة بعده.
      let reads = 0;
      const r2 = deferred();
      const v2 = deferred();
      let voids = 0;
      fresh(MANAGER, {
        sale_detail: () => {
          reads += 1;
          if (reads === 1) return clone(MULTI);
          if (reads === 2) return r2.promise;
          throw new Error('fetch failed');
        },
        void_sale: () => {
          voids += 1;
          if (voids === 1) throw new m.UnknownOutcomeError('fetch_failed');
          return v2.promise;
        },
      });
      await mount(`/sales/${MULTI.id}`);
      await voidFromMenu();
      await click(cancelBtn());
      await settle(20);
      await click(first('void-pending-retry'));
      await settle(10);
      await click(first('confirm-void-sale'));
      await settle(10);
      r2.resolve(clone(MULTI));
      await settle(20);
      v2.resolve(clone(R.void_sale.manager_multi_kept));
      await settle(40);
      t.same(
        [textOf('sale-status'), byAction('sale-reread').length, byAction('sale-more').length, byAction('collect-sale').length, first('send-image')?.hasAttribute('disabled'), textOf('stale-badge')],
        ['ملغاة', 1, 0, 0, true, 'قبل التعديل'],
        'R3 القراءة التي بدأت قبل تمام الإلغاء قديمة ولو وصلت بعد النقر: «ملغاة» و«أعد القراءة» بلا «⋯» ولا «استلم دفعة»، والإرسال معطّل',
      );
    });

    await step('R4 bottom bar back after a void from the done card', async () => {
      fresh(MANAGER, { sale_detail: (_args, n) => clone(n === 1 ? MULTI : D.owner_multi_after_void), void_sale: () => clone(R.void_sale.manager_multi_kept) });
      await mount(`/sales/${MULTI.id}?done=1`, { bar: true });
      const before = all().filter((n) => n.localName === 'nav').length;
      await voidFromMenu();
      await settle(20);
      t.same([before, byAction('sale-done').length, all().filter((n) => n.localName === 'nav').length], [0, 0, 1], 'R4 بطاقة النجاح زالت بالإلغاء فيعود الشريط السفليّ (من حالة الصفحة لا من ?done=1، Q4)');
    });

    await step('R5 void result wording', async () => {
      fresh(MANAGER, { sale_detail: (_args, n) => clone(n === 1 ? MULTI : D.owner_multi_after_void), void_sale: () => clone(R.void_sale.manager_multi_kept) });
      await mount(`/sales/${MULTI.id}`);
      await voidFromMenu();
      t.eq(
        textOf('sale-voided-note'),
        'أُلغي البيع FD-2026-0001. وما سُدِّد منها (80,000 دينار) حُسب لـ«أبو أحمد»: يُسدَّد به أقدم فواتيره المفتوحة في الدفتر نفسه، وما يبقى رصيد له.',
        'R5 جملة النتيجة: «ما سُدِّد منها» في الدفتر نفسه (Q5)',
      );
    });

    await step('R6 nothing internal on the customer paper', async () => {
      // Q6: لا سبب الإلغاء على الختم ولا «من مخزن» على الورقة؛ والملاحظة تُطبع، فالصفحة تقول ذلك؛ والإرسال للملغاة باقٍ (الصورة تقول «ملغى»).
      fresh(MANAGER, { sale_detail: () => ({ ...clone(D.owner_multi_after_void), note: 'تسليم في الحقل', void_reason: 'الزبون يماطل' }) });
      await mount(`/sales/${MULTI.id}`);
      t.same(
        [textOf('void-stamp'), byAction('sale-paper-store').length, textOf('sale-paper-note'), textOf('sale-by')?.startsWith('ملاحظة (تظهر على الفاتورة): تسليم في الحقل'), textOf('sale-void')?.includes('السبب: الزبون يماطل'), first('send-image')?.hasAttribute('disabled')],
        ['ملغى', 0, 'ملاحظة: تسليم في الحقل', true, true, false],
        'R6 الورقة بلا السبب ولا المخزن الداخليّ، والسبب في الصفحة، والملاحظة «تظهر على الفاتورة»، والإرسال متاح',
      );
    });

    await step('R7 focus after the dialogs', async () => {
      // Q7: ما فتح النافذة زال (بند القائمة، «أعد المحاولة»، «استلم دفعة» والفاتورة قديمة): التركيز إلى «⋯» أو العنوان، لا جسم الصفحة.
      fresh(MANAGER, { sale_detail: (_args, n) => clone(n === 1 ? MULTI : D.owner_multi_after_void), void_sale: () => clone(R.void_sale.manager_multi_kept) });
      await mount(`/sales/${MULTI.id}`);
      await click(first('sale-more'));
      await click(first('void-sale'));
      await click(cancelBtn());
      await settle(20);
      const afterCancel = globalThis.document.activeElement?.getAttribute('data-action');
      await voidFromMenu();
      await settle(20);
      t.same([afterCancel, globalThis.document.activeElement?.getAttribute('data-action'), first('sale-title')?.getAttribute('tabindex')], ['sale-more', 'sale-title', '-1'], 'R7 «لا، تراجع» إلى «⋯»، وبعد الإلغاء («⋯» زالت) إلى العنوان');
    });

    await step('R8 stale marks and button heights', async () => {
      fresh(MANAGER, { sale_detail: (_args, n) => (n === 1 ? clone(MULTI) : Promise.reject(new Error('fetch failed'))), void_sale: () => clone(R.void_sale.manager_multi_kept) });
      await mount(`/sales/${MULTI.id}`);
      await voidFromMenu();
      t.same(
        [textOf('stale-badge'), first('sale-head')?.hasAttribute('data-stale'), (first('sale-reread')?.getAttribute('class') ?? '').includes('sale-btn')],
        ['قبل التعديل', true, true],
        'R8 الفاتورة القديمة بشارة «قبل التعديل»، و«أعد القراءة» بارتفاع 48 (sale-btn)',
      );
      await unmount();
      store.set(m.voidPendingKey('u-manager', 'org-1', MULTI.id), JSON.stringify({ ref: 'r-1', reason: 'خطأ' }));
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}?done=1`);
      t.same(
        [(first('void-pending-retry')?.getAttribute('class') ?? '').includes('sale-btn'), first('sale-done')?.hasAttribute('data-stale')],
        [true, false],
        'R8 «أعد المحاولة» للإلغاء المعلَّق بارتفاع 48 أيضاً',
      );
    });

    await step('R9 free delivery on the done card', async () => {
      fresh(MANAGER, { sale_detail: () => ({ ...clone(MULTI), total: '0', paid: '0', debt: '0', open: '0', payments: [], can_collect: false }) });
      await mount(`/sales/${MULTI.id}?done=1`);
      t.same([textOf('done-free'), byAction('done-paid-all').length], ['بلا مقابل', 0], 'R9 التسليم بلا مقابل «بلا مقابل» لا «مدفوعة كلّها» بجانب «الصافي 0» (Q9)');
    });

    await step('R10 a real share refusal offers «أرسلها»', async () => {
      setNavigator({ onLine: true, canShare: () => true, share: () => Promise.reject(Object.assign(new Error('Document is not fully active'), { name: 'InvalidStateError' })) });
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      await wait(320);
      await settle(20);
      fire(first('send-image'), 'click', { button: 0 });
      await settle(30);
      t.same([byAction('image-ready').length, byAction('send-ready').length, byAction('download-ready').length], [1, 1, 1], 'R10 InvalidStateError والصفحة لا تشارك غيرها: «أرسلها» و«نزّلها» لا صمت (Q10)');
    });

    await step('R11 search box follows the URL back', async () => {
      // Q11: «أبو» ← «حسب الزبون» ← زبون ← رجوع ← «الفواتير»: الرابط فيه q=أبو، فالخانة والقائمة به.
      fresh(MANAGER, { sales_overview: () => clone(AFTER), sales_report: () => clone(R.sales_report.owner_party) });
      await mount(['/', '/sales']);
      await settle(20);
      type(first('sales-search'), 'أبو');
      await settle(20);
      await click(radio('حسب الزبون'));
      await settle(20);
      await click(byAction('report-open').find((n) => n.textContent === 'مزرعة النور'));
      await settle(20);
      m.flushSync(() => globalThis.__ux.nav(-1));
      await settle(20);
      await click(radio('الفواتير'));
      await settle(20);
      const want = AFTER.rows.filter((row) => (row.party_name ?? '').includes('أبو')).map((row) => row.doc_no);
      t.same(
        [new URLSearchParams(where().split('?')[1] ?? '').get('q'), first('sales-search')?.value, listRows().map(([no]) => no)],
        ['أبو', 'أبو', want],
        'R11 بعد الرجوع: الخانة والقائمة كما في الرابط',
      );
    });

    await step('R12 layout: one-line phrases and chips that wrap', async () => {
      fresh(MANAGER, { sales_overview: () => clone(AFTER), sale_detail: () => clone(MULTI) });
      await mount('/sales');
      const keep = descendants(first('strip-count') ?? body()).find((n) => n.getAttribute('class') === 'sale-nowrap');
      t.same(keep?.textContent, 'الملغاة منها: 2', 'R12 «الملغاة منها: 2» لا تنكسر بعد النقطتين');
      await unmount();
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}`);
      t.eq(first('sale-store')?.parentNode?.textContent, '\u{b7}\u{a0}رصيد العلف', 'R12 «·» مع المخزن بمسافة لا تنكسر، لا آخر السطر');
      await unmount();
      fresh(MANAGER, { sale_detail: () => clone(MULTI) });
      await mount(`/sales/${MULTI.id}?done=1`);
      t.ok(all().some((n) => n.getAttribute('class') === 'sale-done-who' && n.textContent.includes(' \u{b7}\u{a0}17/11/2026')), 'R12 «·» مع اليوم في بطاقة النجاح');
      const chips = rule(DOC_CSS, '.sale-chips');
      t.same([chips?.['flex-wrap'], chips?.['overflow-x'], rule(DOC_CSS, '.sale-pills')?.['flex-wrap']], ['wrap', undefined, 'wrap'], 'R12 الشرائح تلتفّ ولا تُقصّ (لا تمرير أفقيّ يخفي «ملغاة»)');
    });

    await step('R13 search count over the first 1,000', async () => {
      fresh(MANAGER, { sales_overview: () => ({ ...clone(AFTER), more: true }) });
      await mount('/sales');
      type(first('sales-search'), 'مزرعه');
      await settle();
      t.eq(textOf('sales-found'), '5 فواتير من آخر 9 فواتير معروضة', 'R13 فوق 1,000 فاتورة: سطر البحث يعدّ المعروضة ويقول ذلك (قراءة A10)');
    });

    // ── C: التباين والحركة ──────────────────────────────────────────────────────────────────────────────────────
    {
      const light = tokens(':root');
      const dark = tokens('.dark');
      // D21: الألوان رموز --sd- على .sale-ui (والمحايدة من tokens.css)، بالسمتين و«وضوح»: كلّ زوج ≥ 4.5:1 في الأوضاع الأربعة.
      const block = (selector) => {
        const at = DOC_CSS.indexOf(`${selector} {`);
        const body = at < 0 ? '' : DOC_CSS.slice(DOC_CSS.indexOf('{', at) + 1, DOC_CSS.indexOf('}', at));
        return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/gu)].map((match) => [match[1], match[2].trim()]));
      };
      const clarity = tokens('.clarity');
      const darkClarity = tokens('.dark.clarity');
      const modes = {
        light: { ...light, ...block('.sale-ui') },
        dark: { ...dark, ...block('.sale-ui'), ...block('.dark .sale-ui') },
        'clarity light': { ...light, ...clarity, ...block('.sale-ui'), ...block('.clarity .sale-ui') },
        'clarity dark': { ...dark, ...darkClarity, ...block('.sale-ui'), ...block('.dark .sale-ui'), ...block('.clarity .sale-ui'), ...block('.dark.clarity .sale-ui') },
      };
      const value = (mode, name) => {
        const raw = mode[name];
        if (Array.isArray(raw)) return raw;
        const ref = /^var\(--([\w-]+)\)$/u.exec(raw ?? '');
        return ref ? value(mode, ref[1]) : rgb(raw ?? '');
      };
      const PAIRS = [
        ['chip paid', 'sd-ok-ink', 'sd-ok-soft'],
        ['chip partial', 'sd-due-ink', 'sd-due-soft'],
        ['chip credit', 'sd-debt-ink', 'sd-debt-soft'],
        ['chip free', 'sd-link', 'sd-link-soft'],
        ['chip void', 'ink-muted', 'surface-3'],
        ['remaining', 'sd-open', 'surface-1'],
        ['remaining on done sums', 'sd-open', 'surface-2'],
        ['paid in full', 'sd-ok-ink', 'surface-1'],
        ['links', 'sd-link', 'surface-1'],
        ['void menu', 'sd-danger', 'surface-1'],
        ['primary fills', 'sd-on-brand', 'sd-brand'],
        ['done mark', 'sd-ok-mark', 'sd-ok-mark-bg'],
        ['stale badge', 'sd-due-ink', 'sd-due-soft'],
      ];
      const pairs = Object.entries(modes).flatMap(([name, mode]) => PAIRS.map(([label, ink, bg]) => [`${label} ${name}`, contrast(value(mode, ink), value(mode, bg))]));
      const sheet = block('.inv-sheet');
      pairs.push(['void stamp (paper is always light)', contrast(rgb(sheet['sd-stamp'] ?? ''), [255, 255, 255])]);
      const outside = DOC_CSS.replace(/(?:\.dark\.clarity |\.dark |\.clarity )?\.sale-ui \{[^}]*\}/gu, '').replace(/\.inv-sheet \{[^}]*\}/u, '').replace(/\.sale-paper-slot \{[^}]*\}/u, '');
      const badge = rule(DOC_CSS, '.sale-stale-badge');
      t.same(
        [rule(DOC_CSS, '[data-stale]')?.opacity, badge?.color, badge?.background],
        [undefined, 'rgb(var(--sd-due-ink))', 'rgb(var(--sd-due-soft))'],
        'R8 القراءة القديمة بشارة كاملة التباين لا بالخفوت (Q8: الخفوت أنزل «ملغاة» إلى 2.15 والصافي إلى 3.88)',
      );
      // T8 (الجولة ٣): غلاف جدول القائمة بلا إطار، فقاعدة [data-stale] وحدها لا تُظهر شيئاً عليه بعد أن يمرّر الشريط بشارته.
      const listStale = rule(DOC_CSS, '.sale-list[data-stale]');
      t.same([listStale?.outline, listStale?.['outline-offset']], ['2px dashed rgb(var(--sd-due-ink))', '4px'], 'T8 جدول القائمة القديم بخطّ متقطّع ظاهر عليه نفسه');
      t.same(outside.match(/rgb\(\d[^)]*\)|#[0-9a-f]{3,6}\b/giu) ?? [], [], 'C1 لا لون مكتوب خارج كتل الرموز (D21)');
      const weak = pairs.filter(([, ratio]) => !(ratio >= 4.5)).map(([name, ratio]) => `${name} ${ratio.toFixed(2)}`);
      t.same(weak, [], `C1 كلّ نصّ في شاشات ما بعد البيع ≥ 4.5:1 بالسمتين و«وضوح» (${pairs.length} زوجاً)`);
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
    for (const [key, desc] of [['sessionStorage', saved.session], ['localStorage', saved.local], ['navigator', saved.navigator]]) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
    if (saved.clone) Object.defineProperty(Element.prototype, 'cloneNode', saved.clone);
    else delete Element.prototype.cloneNode;
    if (saved.textClone) Object.defineProperty(Text.prototype, 'cloneNode', saved.textClone);
    else delete Text.prototype.cloneNode;
  }
}
