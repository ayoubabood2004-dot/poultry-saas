// شاشة البيع من جديد (تصميم المبيعات 2026-11-18، docs/SALES_UX_PLAN.md §١–٥ و§٨): react-dom الحقيقي على DOM صغير (dom.mjs) يشغّل مسارات المبيعات
// الحقيقية (SalesRoutes: /sales/new) والرئيسية الحقيقية، وrepo الحقيقي على core بديل يجيب بأجوبة القاعدة الحقيقية (fixtures/sales-0033.json: sale_catalog
// بـsold_30d وunits[].is_default)، وlocalStorage بالذاكرة (الفاتورة المفتوحة وما تتذكّره الشاشة)، وكلّ نسخة من الحزمة ذاكرة جديدة (= إعادة تحميل الصفحة).
// U1 الأكثر بيعاً أوّلاً ثمّ الاسم، والبطاقة بسعر وحدتها الافتراضية و«عندك» بها · U2 البطاقة تصير عدّاداً، والنقص إلى صفر حذفٌ بـ«تراجع» · U3 الوحدة
// الافتراضية: is_default ثمّ آخر وحدة على الجهاز ثمّ الأساس (والموزون يفتح ورقته) · U4 لوحة الأرقام (الكتابة فوق القيمة، والفاصلة، و«000»، والحذف) ·
// U5 ورقة السطر: الوحدة والقراءة الراجعة و«السعر المعتاد» · U6 السلّة: «احذف» بـ«تراجع» لا بتأكيد · U7 الدفع بقول المالك (النقديّ نقداً كلّه من آخر
// صندوق، والزبون باسمه بالدين كلّه، واختيار البائع يبقى) · U8 «دين كلّه» لزبون نقديّ يفتح «لمن؟» · U9 الفاتورة المفتوحة تُحفظ وتعود بمعرّفيها
// و«ابدأ من جديد» بـ«تراجع» وتُمحى بعد الحفظ · U10 بعد الحفظ الفاتورة مكان الشاشة (?done=1) والأوراق خارج التاريخ · U11 شريحة «فاتورة مفتوحة» في
// الرئيسية · U12 الشريط فارغاً بلا أصفار · U13 المخزن الأخير يُتذكَّر، والذاكرة بعد الحفظ · U14 زرّ الكاميرا حيث يدعمها المتصفّح وحده · U15 الرمز
// الكامل يضيف بلا Enter وبدايته تصفّي، وEnter على اسم واحد يضيفه.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';
import { sellDriver } from './sell-ui.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033-contract.json'), 'utf8'));
const R = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__ux.call('${n}', a);`).join(' ')}`;
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__ux.session; export const sessionStore = { get: () => globalThis.__ux?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__ux.toasts.push(spec); }; export function Toaster() { return null; }',
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createCustomer', 'listBoxes']),
  image: 'export const toBlob = () => new Promise(() => {});',
  home: 'export const loadHomeSummary = () => new Promise(() => {}); export const countDraftReceipts = () => new Promise(() => {});',
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
      b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/repo\/purchasing$|\/lib\/repo\/home$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'ux-stub' }));
      b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'ux-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'ux-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'ux-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'ux-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
      // sell.css?raw: النصّ نفسه (يُفحص أنّه يصل إلى <style>).
      b.onResolve({ filter: /\.css(\?raw)?$/ }, (args) => ({ path: path.join(args.resolveDir, args.path.replace(/\?raw$/u, '')), namespace: 'ux-css' }));
      b.onLoad({ filter: /.*/, namespace: 'ux-css' }, (args) => ({ contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))};`, loader: 'js' }));
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
    "export { MemoryRouter, Routes, Route, useLocation, useNavigationType, useNavigate } from 'react-router-dom';",
    "export { SalesRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { default as HomePage } from './src/pages/home/HomePage.tsx';",
    "export * as sales from './src/lib/repo/sales.ts';",
    "export { applyPadKey } from './src/pages/sales/sellKit.tsx';",
    "export { readSaleDraftSummary, saleDraftKey } from './src/pages/sales/saleDraft.ts';",
    "export { sellMemoryKey } from './src/pages/sales/sellMemory.ts';",
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
  bundles += 1;
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// sales-ux-sell bundle ${bundles}\n`).toString('base64')}`);
}

function memoryStorage() {
  const map = new Map();
  return { map, api: { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), clear: () => map.clear(), key: (i) => [...map.keys()][i] ?? null, get length() { return map.size; } } };
}

const body = () => globalThis.document.body;
const byAction = (name, scope = body()) => descendants(scope).filter((n) => n.getAttribute('data-action') === name);
const first = (name, scope) => byAction(name, scope)[0] ?? null;
const textOf = (name) => first(name)?.textContent ?? null;
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click', { button: 0 });
  await settle();
};

const CAT = R.sale_catalog.storekeeper_feed;
// المعرّفات من العيّنة الحقيقية بالاسم (تتغيّر بكلّ توليد للعيّنات: SALES_SAMPLES_OUT=1).
const itemNamed = (name) => { const item = CAT.items.find((i) => i.name === name); if (!item) throw new Error('no sample item ' + name); return item; };
const ID = { starter: itemNamed('علف بادئ').item_id, grower: itemNamed('علف نامي').item_id, sync: itemNamed('علف التزامن').item_id, conc: itemNamed('علف مركّز').item_id };
const unitNamed = (name, label) => itemNamed(name).units.find((u) => u.label === label).unit_id;
const BAG = unitNamed('علف بادئ', 'كيس 50 كغم');
const GROWER_BAG = unitNamed('علف نامي', 'كيس 50 كغم');
const BOX2 = CAT.cash_accounts[1];
const ws = (role) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['general', 'feed_mill'],
  canSeeCost: role !== 'storekeeper', canSeeAccounts: role !== 'storekeeper', canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
});
const sessionOf = (role) => ({ status: 'ready', workspace: ws(role), offline: false });
const MANAGER = sessionOf('manager');
const PARTY = { id: 'p-1', name: 'أبو علي' };

export default async function (t) {
  const restoreDom = installDom();
  const saved = {
    session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
    local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    scroll: Object.getOwnPropertyDescriptor(globalThis.window, 'scrollIntoView'),
  };
  const session = memoryStorage();
  const local = memoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: session.api, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: local.api, configurable: true, writable: true });
  let root = null;
  let m = null;
  let current = null;
  try {
    m = await bundle();
    current = m;
    m.onlineStore.set(true);
    let log = [];
    let navType = null;
    const fresh = (who, rpcs = {}, calls = {}) => {
      log = [];
      globalThis.__ux = {
        session: who,
        toasts: [],
        location: null,
        nav: null,
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
      };
    };
    const named = (fn) => log.filter(([name]) => name === fn).map(([, args]) => args);
    const where = () => globalThis.__ux.location;
    const mount = async (entries, mm = current) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = mm.createRoot(container);
      function Where() {
        const location = mm.useLocation();
        navType = mm.useNavigationType();
        globalThis.__ux.nav = mm.useNavigate();
        globalThis.__ux.location = `${location.pathname}${location.search}`;
        return mm.h(mm.Routes, null, mm.h(mm.Route, { path: '/', element: mm.h(mm.HomePage) }), mm.h(mm.Route, { path: '/sales/*', element: mm.h(mm.SalesRoutes) }), mm.h(mm.Route, { path: '*', element: null }));
      }
      const list = Array.isArray(entries) ? entries : [entries];
      mm.flushSync(() => root.render(mm.h(mm.MemoryRouter, { initialEntries: list, initialIndex: list.length - 1 }, mm.h(Where))));
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
      session.map.clear();
      local.map.clear();
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      current = m;
      current.onlineStore.set(true);
    };
    const remember = (role, value) => local.api.setItem(`sales.sell.memory:u-${role}:org-1`, JSON.stringify({ store: null, box: null, units: {}, recent: [], ...value }));
    const memory = (role) => JSON.parse(local.api.getItem(`sales.sell.memory:u-${role}:org-1`) ?? 'null');
    const draftKey = (role) => `sales.invoice.draft:u-${role}:org-1`;
    const OK = { stores_overview: () => clone(F.stores_overview), sale_catalog: () => clone(CAT) };
    const pickers = { searchSuppliers: () => ({ parties: [PARTY], total: 1 }) };
    const d = sellDriver({ body, descendants, fire, settle });
    const cards = () => byAction('sale-item-card').map((n) => n.getAttribute('data-item'));

    await step('U1 order and card', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      t.same(cards(), [ID.starter, ID.grower, ID.sync, ID.conc], 'U1 الأكثر بيعاً هنا أوّلاً (sold_30d الحقيقيّ: 2 ثمّ 0)، وبالاسم عند التساوي');
      const starter = d.card(ID.starter).textContent;
      t.ok(starter.includes('35,000 / كيس 50 كغم') && starter.includes('عندك 8 كيس + 24.5 كغم'), 'U1 البطاقة بسعر وحدتها الافتراضية (700 × 50) و«عندك» بها');
      t.ok(d.card(ID.grower).textContent.includes('بلا سعر بيع') && d.card(ID.conc).textContent.includes('نفد من هذا المخزن') && d.card(ID.conc).hasAttribute('disabled'), 'U1 «بلا سعر بيع» و«نفد» نصّاً، والنافدة لا تُلمس');
      t.ok((descendants(body()).find((n) => n.localName === 'style')?.textContent ?? '').includes('.sl-card'), 'U1 أنماط sell.css في الصفحة (?raw، لا صنف Tailwind جديد)');
    });

    await step('U2 card becomes a stepper', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      t.same([d.cardQty(ID.starter), textOf('card-badge'), d.lineSheet()], ['1 كيس', '1', null], 'U2 لمس البطاقة يضيف كيساً واحداً (الوحدة الافتراضية) فتصير عدّاداً بشارته، بلا ورقة');
      await d.plus(ID.starter);
      await d.tap(ID.starter);
      t.eq(d.cardQty(ID.starter), '3 كيس', 'U2 «+» ولمس البطاقة ثانيةً يزيدان السطر نفسه');
      await d.minus(ID.starter);
      t.eq(d.cardQty(ID.starter), '2 كيس', 'U2 «−» ينقص واحداً');
      await d.minus(ID.starter);
      await d.minus(ID.starter);
      t.same([d.cardQty(ID.starter), textOf('sell-snack')?.startsWith('حُذفت «علف بادئ» من الفاتورة'), byAction('confirm').length], [null, true, 0], 'U2 النقص إلى صفر يحذف السطر بلا تأكيد، و«تراجع» ظاهر');
      await click(first('sell-undo'));
      t.same([d.cardQty(ID.starter), byAction('sell-snack').length], ['1 كيس', 0], 'U2 «تراجع» يعيد السطر كما كان');
      t.eq(textOf('sale-bar-total'), '35,000 دينار', 'U2 الشريط بالصافي');
    });

    await step('U3 default unit', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.grower);
      t.same([d.lineSheet() !== null, d.units().map(([unit, , on]) => [unit, on])], [true, [[GROWER_BAG, 'false'], ['', 'true']]], 'U3 بلا وحدة افتراضية ولا ذاكرة: الأساس (كغم)، والموزون يفتح ورقته لكتابة الكمية');
      await d.unit(GROWER_BAG);
      await d.done();
      await unmount();
      t.same(memory('manager')?.units?.[ID.grower], GROWER_BAG, 'U3 الوحدة المختارة تُتذكَّر للمادّة (لكلّ مستخدم ومنشأة)');
      local.map.delete(draftKey('manager'));
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.grower);
      t.same([d.cardQty(ID.grower), d.lineSheet()], ['1 كيس', null], 'U3 ثمّ آخر وحدة على الجهاز: كيس، بلا ورقة');
    });

    await step('U4 keypad', async () => {
      const k = m.applyPadKey;
      t.same(
        [k('1', '4', 3, true), k('1', '4', 3, false), k('2.5', 'back', 3, true), k('', '.', 3), k('0.12', '5', 2), k('7', '000', 0), k('7', '.', 0), k('0', '3', 3), k('1234567', '8', 3, false, 7), k('12', 'clear', 3)],
        ['4', '14', '2.', '0.', '0.12', '7000', '7', '3', '1234567', ''],
        'U4 لوحة الأرقام: أوّل ضغطة تحلّ محلّ القيمة، والحذف يحذف آخرها، والفاصلة والمراتب، و«000»، والصفر الأوّل، والحدّ',
      );
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await d.keys('4');
      t.same([d.display(), d.cardQty(ID.starter)], ['4', '4 كيس'], 'U4 فتح العدّاد ثمّ «4» = 4 لا 14');
      await d.tab('discount');
      const pad = first('sale-pad', d.lineSheet());
      t.same([d.pick('key', 'data-key', '000', pad) !== null, d.pick('key', 'data-key', '.', pad)], [true, null], 'U4 الخصم بالدينار الصحيح: «000» بدل الفاصلة');
    });

    await step('U5 line sheet', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await d.keys('3');
      t.same([textOf('line-read-back'), d.lineSheet().textContent.includes('عندك 8 كيس + 24.5 كغم'), textOf('line-total')], ['= 150 كغم', true, 'المبلغ 105,000 دينار'], 'U5 القراءة الراجعة بالأساس و«عندك» بالوحدة والمبلغ');
      await d.tab('price');
      await d.keys('34000');
      t.eq(textOf('line-usual'), 'السعر المعتاد 35,000 — أعِده', 'U5 السعر يُغيَّر: «السعر المعتاد» ظاهر');
      await click(first('line-usual'));
      t.same([d.display(), byAction('line-usual').length], ['35,000', 0], 'U5 «أعِده» يعيد سعر البيع');
      await d.keys('40');
      t.eq(byAction('line-error').length, 0, 'U5 لا خطأ قبل أوّل حفظ إلا الحيّ');
      await d.tab('qty');
      await d.keys('9');
      t.eq(textOf('line-error'), 'المتاح في «المخزن العام» 424.5 كغم فقط؛ لا يُحفظ أكثر منه.', 'U5 أكثر من المتاح يُقال حيّاً تحت الكمية نفسها');
    });

    await step('U6 cart undo', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.tap(ID.sync);
      await d.done();
      await d.openCart();
      t.same(d.lines().map((n) => n.getAttribute('data-item')), [ID.starter, ID.sync], 'U6 السلّة بسطورها');
      await click(first('cart-remove', d.lines()[0]));
      t.same([d.lines().map((n) => n.getAttribute('data-item')), byAction('confirm').length, textOf('sell-snack')?.includes('علف بادئ')], [[ID.sync], 0, true], 'U6 «احذف» يحذف فوراً بلا تأكيد، و«تراجع» يسمّي ما حُذف');
      await click(first('sell-undo'));
      t.same(d.lines().map((n) => n.getAttribute('data-item')), [ID.starter, ID.sync], 'U6 «تراجع» يعيده في مكانه');
    });

    await step('U7 payment defaults', async () => {
      remember('manager', { store: 'w-gen', box: BOX2.id, recent: [PARTY] });
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new');
      await d.tap(ID.starter);
      await d.next();
      const kind = (name) => d.pick('pay-kind', 'data-kind', name)?.getAttribute('aria-checked');
      t.same([first('party-walk-in')?.getAttribute('aria-checked'), kind('cash'), textOf('sale-debt-live')], ['true', 'true', `مدفوعة كلّها: 35,000 دينار في «${BOX2.name}».`], 'U7 الزبون النقديّ: نقداً كلّه من آخر صندوق (المتذكَّر)');
      await click(first('party-recent'));
      t.same([kind('debt'), textOf('save-invoice'), textOf('sale-debt-live')], ['true', 'احفظ — 35,000 دينار بالدين كلّه', 'يبقى ديناً على «أبو علي»: 35,000 دينار.'], 'U7 زبون باسمه (من آخر الزبائن شرائح): دين كلّه');
      await d.payKind('cash');
      await click(first('party-walk-in'));
      await click(first('party-recent'));
      t.eq(kind('cash'), 'true', 'U7 ما اختاره البائع يبقى حين يتغيّر الزبون');
    });

    await step('U8 walk-in debt opens who', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      await d.payKind('debt');
      t.same(
        [first('party-walk-in')?.getAttribute('aria-checked'), textOf('sale-party-needed'), globalThis.document.activeElement === first('sale-party-search')],
        ['false', 'الدين يحتاج اسم الزبون: اختره أو ابحث عنه أو أضفه.', true],
        'U8 «دين كلّه» لزبون نقديّ: «لمن؟» يُفتح بجملته والبحث مركَّز',
      );
      await d.party('أبو');
      t.same([d.pick('pay-kind', 'data-kind', 'debt')?.getAttribute('aria-checked'), byAction('sale-party-needed').length], ['true', 0], 'U8 ثمّ اختيار الزبون يُبقي الدين');
    });

    await step('U9 open invoice on the device', async () => {
      remember('manager', { store: 'w-gen' });
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new');
      await d.tap(ID.starter);
      await d.plus(ID.starter);
      const stored = JSON.parse(local.api.getItem(draftKey('manager')) ?? 'null');
      t.same(
        [stored?.v, m.readSaleDraftSummary('u-manager', 'org-1'), m.readSaleDraftSummary('u-other', 'org-1')],
        [1, { lines: 1, total: 7000000n, storeId: 'w-gen' }, null],
        'U9 الفاتورة المفتوحة تُحفظ بعد كلّ تغيير بمفتاح المستخدم والمنشأة، وملخّصها للرئيسية',
      );
      await unmount();
      const m2 = await bundle();
      current = m2;
      m2.onlineStore.set(true);
      await mount('/sales/new', m2);
      t.same([byAction('sale-restored').length, d.cardQty(ID.starter)], [1, '2 كيس'], 'U9 بعد إعادة التحميل تعود كما تُركت، بجملة «فاتورة محفوظة على الجهاز»');
      await click(first('sale-start-over'));
      t.same([d.cardQty(ID.starter), local.api.getItem(draftKey('manager')), byAction('sell-snack').length], [null, null, 1], 'U9 «ابدأ من جديد» يفرّغها ويمحوها، بـ«تراجع»');
      await click(first('sell-undo'));
      t.eq(d.cardQty(ID.starter), '2 كيس', 'U9 «تراجع» يعيدها');
      await d.next();
      await d.save();
      await settle(30);
      t.same(
        [named('record_sale_v2')[0]?.p_client_ref, named('record_sale_v2')[0]?.p_sale_id, local.api.getItem(draftKey('manager')), where()],
        [stored?.body?.ids?.ref, stored?.body?.ids?.saleId, null, '/sales/s-7?done=1'],
        'U9 تُرسل بالمرجع ومعرّف الفاتورة المحفوظين معها (إعادة بعد إغلاق الصفحة لا تُسجَّل مرّتين)، وتُمحى بعد الحفظ',
      );
    });

    await step('U10 done replaces the sell screen', async () => {
      remember('manager', { store: 'w-gen' });
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount(['/sales', '/sales/new']);
      await d.tap(ID.starter);
      await d.openCart();
      await d.next();
      await d.save();
      await settle(40);
      t.same([where(), navType], ['/sales/s-7?done=1', 'REPLACE'], 'U10 بعد الحفظ: الفاتورة بحالة النجاح مكان الشاشة');
      globalThis.__ux.nav(-1);
      await settle(20);
      t.eq(where(), '/sales', 'U10 والرجوع منها إلى ما قبل البيع، لا إلى ورقة الدفع ولا إلى فاتورة حُفظت');
    });

    await step('U11 home chip', async () => {
      fresh(sessionOf('storekeeper'), {}, {});
      await mount('/');
      t.eq(byAction('home-open-sale').length, 0, 'U11 بلا فاتورة مفتوحة: لا شريحة');
      await unmount();
      local.api.setItem(draftKey('storekeeper'), JSON.stringify({ v: 1, summary: { lines: 3, total: '21875000', store: 'w-gen' }, body: {} }));
      local.api.setItem(draftKey('manager'), JSON.stringify({ v: 1, summary: { lines: 1, total: '100', store: 'w-gen' }, body: {} }));
      fresh(sessionOf('storekeeper'), {}, {});
      await mount('/');
      const chip = first('home-open-sale');
      t.same([chip?.textContent, chip?.getAttribute('href')], ['فاتورة مفتوحة: 3 موادّ · 218,750', '/sales/new'], 'U11 «فاتورة مفتوحة» بعدد الموادّ والصافي تفتح البيع، ولكلّ مستخدم فاتورته');
    });

    await step('U12 empty bar', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      t.same([textOf('sale-bar-empty'), byAction('sale-next').length, (textOf('sale-totals-bar') ?? '').includes('0')], ['اختر موادّ الفاتورة', 0, false], 'U12 الشريط فارغاً: «اختر موادّ الفاتورة» بلا أصفار ولا زرّ');
    });

    await step('U13 store remembered', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new');
      t.same([byAction('sale-store-option').length, named('sale_catalog').length], [2, 0], 'U13 أوّل مرّة بمخزنين: «من أيّ مخزن تبيع؟»');
      await d.store('w-feed');
      t.same([named('sale_catalog'), memory('manager')?.store], [[{ p_warehouse: 'w-feed' }], 'w-feed'], 'U13 والمختار يُتذكَّر');
      await d.tap(ID.starter);
      await d.next();
      await d.payKind('cash');
      await click(d.pick('pay-box-option', 'data-box', BOX2.id) ?? first('cash-box'));
      await click(d.pick('pay-box-option', 'data-box', BOX2.id));
      await d.party('أبو');
      await d.save();
      await settle(30);
      t.same([memory('manager')?.box, memory('manager')?.units?.[ID.starter], memory('manager')?.recent], [BOX2.id, BAG, [PARTY]], 'U13 بعد الحفظ: الصندوق والوحدة والزبون تُتذكَّر');
      await unmount();
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new');
      t.same([byAction('sale-store-option').length, named('sale_catalog')], [0, [{ p_warehouse: 'w-feed' }]], 'U13 والمرّة التالية بلا سؤال: آخر مخزن');
    });

    await step('U14 camera only where supported', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      t.eq(byAction('sale-camera').length, 0, 'U14 بلا BarcodeDetector: لا زرّ كاميرا');
      await unmount();
      globalThis.window.BarcodeDetector = class {};
      try {
        fresh(MANAGER, OK, pickers);
        await mount('/sales/new?store=w-gen');
        t.eq(byAction('sale-camera').length, 1, 'U14 حيث يدعمها المتصفّح: زرّ «امسح الرمز بالكاميرا»');
      } finally {
        delete globalThis.window.BarcodeDetector;
      }
    });

    await step('U15 codes', async () => {
      const withCodes = clone(CAT);
      withCodes.items[1].alt_codes = ['55501', '6260001999'];
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(withCodes) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.search('626000');
      t.same([cards(), d.cardQty(ID.starter)], [[ID.starter], null], 'U15 بداية الرمز تصفّي ولا تضيف (رمز أطول يبدأ بها)');
      await d.search('6260001');
      t.same([cards(), d.cardQty(ID.starter)], [[ID.starter], null], 'U15 رمز كامل وله رمز أطول يبدأ به: لا يُضاف قبل Enter');
      fire(first('sale-search'), 'keydown', { key: 'Enter' });
      await settle();
      t.same([d.cardQty(ID.starter), first('sale-search')?.value], ['1 كيس', ''], 'U15 ثمّ Enter يضيفه');
      await d.search('6260001999');
      t.same([d.cardQty(ID.starter), first('sale-search')?.value], ['2 كيس', ''], 'U15 الرمز الكامل الوحيد يضيف بلا Enter (ماسح أو كتابة)');
      await d.search('55501');
      t.same([d.cardQty(ID.starter)], ['2 كيس'], 'U15 رمز أقصر من ستّة لا يُضاف وحده');
      fire(first('sale-search'), 'keydown', { key: 'Enter' });
      await settle();
      t.eq(d.cardQty(ID.starter), '3 كيس', 'U15 Enter عليه يضيفه');
      await d.search('تزامن');
      fire(first('sale-search'), 'keydown', { key: 'Enter' });
      await settle();
      t.same([d.cardQty(ID.sync), d.lineSheet() !== null], ['1 كغم', true], 'U15 Enter على اسم لا يطابق غير مادّة يضيفها');
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
    for (const [key, desc] of [['sessionStorage', saved.session], ['localStorage', saved.local]]) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
  }
}
