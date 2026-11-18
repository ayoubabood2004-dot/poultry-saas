// شاشة البيع من جديد (تصميم المبيعات 2026-11-18، docs/SALES_UX_PLAN.md §١–٥ و§٨): react-dom الحقيقي على DOM صغير (dom.mjs) يشغّل مسارات المبيعات
// الحقيقية (SalesRoutes: /sales/new) والرئيسية الحقيقية، وrepo الحقيقي على core بديل يجيب بأجوبة القاعدة الحقيقية (fixtures/sales-0033.json: sale_catalog
// بـsold_30d وunits[].is_default)، وlocalStorage بالذاكرة (الفاتورة المفتوحة وما تتذكّره الشاشة)، وكلّ نسخة من الحزمة ذاكرة جديدة (= إعادة تحميل الصفحة).
// U1 الأكثر بيعاً أوّلاً ثمّ الاسم، والبطاقة بسعر وحدتها الافتراضية و«عندك» بها · U2 البطاقة تصير عدّاداً، والنقص إلى صفر حذفٌ بـ«تراجع» · U3 الوحدة
// الافتراضية: is_default ثمّ آخر وحدة على الجهاز ثمّ الأساس (والموزون يفتح ورقته) · U4 لوحة الأرقام (الكتابة فوق القيمة، والفاصلة، و«000»، والحذف) ·
// U5 ورقة السطر: الوحدة والقراءة الراجعة و«السعر المعتاد» · U6 السلّة: «احذف» بـ«تراجع» لا بتأكيد · U7 الدفع بقول المالك (النقديّ نقداً كلّه من آخر
// صندوق، والزبون باسمه بالدين كلّه، واختيار البائع يبقى) · U8 «دين كلّه» لزبون نقديّ يفتح «لمن؟» · U9 الفاتورة المفتوحة تُحفظ وتعود بمعرّفيها
// و«ابدأ من جديد» بـ«تراجع» وتُمحى بعد الحفظ · U10 بعد الحفظ الفاتورة مكان الشاشة (?done=1) والأوراق خارج التاريخ · U11 شريحة «فاتورة مفتوحة» في
// الرئيسية · U12 الشريط فارغاً بلا أصفار · U13 المخزن الأخير يُتذكَّر، والذاكرة بعد الحفظ · U14 زرّ الكاميرا حيث يدعمها المتصفّح وحده · U15 الرمز
// الكامل يضيف بلا Enter (بعد وقفة في الكتابة) وبدايته تصفّي، وEnter على اسم واحد يضيفه.
// ومراجعة البيع العدائية (S1–S13: الطلب مع الفاتورة المحفوظة والرفض «ربّما حُفظت»، والتبويب الباقي، والمخزن المفقود، والإغلاق الواحد، والماسح،
// والمبلغ السالب، ولوحة المفاتيح، والقفل أثناء الحفظ، و«إلى الأمام»، والوحدة الغائبة، والصندوق الغائب، وحجم الوحدة، و«صحّح») والإتاحة، ومراجعة
// التصميم (D1–D23)، والمراجعة الثانية (R1–R12: الفاصلة، والماسح ولوحة مفتوحة، واسم غير المختار، و«تراجع» أثناء الحفظ، والتبويب المجمَّد على
// غيره، والرمز بيد إنسان، والمتاح في أوّل لمسة والسلّة، والحجم والسعر معاً، والملغاة، و«لمن؟» أثناء الحفظ، وEnter بعد مفتاح اللوحة، والسطران).
// والمراجعة الثالثة على أساس جديد للوحة المفاتيح والماسح (T1–T9): اللوحة تأخذ مفاتيح الجهاز وقيمتها مركَّزة وحدها، وموجّه الشاشة يجمع ما يُكتب في
// غيرها فيصير مسحاً أو بحثاً. SELL_ONLY=S1,D3 يشغّل خطوات بعينها.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';
import { sellDriver } from './sell-ui.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033-contract.json'), 'utf8'));
const R = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'sales-0033.json'), 'utf8'));
// أنماط الشاشة كما تُنشر (sell.css?raw): قواعد التخطيط التي تُفحص بنصّها (عرض 380، وأسطر الاسم، وأهداف اللمس، والزوايا).
const CSS = readFileSync(path.join(ROOT, 'src', 'pages', 'sales', 'sell.css'), 'utf8');
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
    "export { RejectedError } from './src/lib/errors.ts';",
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * مرآة قواعد الإعادة في record_sale_v2 (0006 ref_claim و0033 فحص محتوى معرّف الفاتورة): المرجع نفسه بالمعاملات نفسها يعيد جوابه، وبغيرها ref_reused؛
 * ومعرّف فاتورة محفوظة بمحتواها يعيدها وبغيره id_conflict؛ والرفع = تراجع (لا يُحفظ المرجع). lose: الفاتورة حُفظت والجواب ضاع.
 */
function serverModel(modOf) {
  const refs = new Map();
  const sales = new Map();
  const content = (a) => JSON.stringify({ w: a.p_warehouse, p: a.p_party, on: a.p_sold_on, d: a.p_invoice_discount, n: a.p_note, l: a.p_lines.map((x) => [x.line_id, x.item_id, x.unit_id, x.qty, x.unit_price, x.discount]), g: a.p_payments.map((x) => [x.leg_id, x.cash_account_id, x.amount]) });
  const argsOf = (a) => JSON.stringify({ ...a, p_client_ref: undefined });
  const result = (a) => ({ ...clone(F.record_sale_v2), sale_id: a.p_sale_id, sold_on: a.p_sold_on });
  let posts = 0;
  return {
    posted: () => [...sales.values()],
    posts: () => posts,
    handle(a, opts = {}) {
      const ref = refs.get(a.p_client_ref);
      if (ref) {
        if (ref.args !== argsOf(a)) throw new (modOf().RejectedError)('ref_reused', 'مرجع هذه العملية استُعمل لعملية أخرى. حدّث الشاشة وأعد العملية من جديد.');
        return ref.result;
      }
      const prior = sales.get(a.p_sale_id);
      if (prior) {
        if (content(prior) === content(a)) return result(prior);
        throw new (modOf().RejectedError)('id_conflict', 'سُجّلت بهذا المعرّف فاتورة غير التي أرسلتها الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.');
      }
      sales.set(a.p_sale_id, a);
      refs.set(a.p_client_ref, { args: argsOf(a), result: result(a) });
      posts += 1;
      if (opts.lose) throw new Error('connection reset after commit');
      return result(a);
    },
  };
}

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
        globalThis.__ux.state = location.state;
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
    // SELL_ONLY=S1,D3: الخطوات بأوّل كلمة من اسمها وحدها (لإثبات فشل خطوة بعينها على شفرة أقدم بلا أثر خطوة قبلها).
    const only = (process.env.SELL_ONLY ?? '').split(',').filter(Boolean);
    const step = async (label, fn) => {
      if (only.length > 0 && !only.includes(label.split(' ')[0])) return;
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
      t.ok(starter.includes('35,000 / كيس 50 كغم') && starter.includes('عندك 8 أكياس + 24.5 كغم'), 'U1 البطاقة بسعر وحدتها الافتراضية (700 × 50) و«عندك» بها');
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
      t.same([textOf('sale-bar-total'), textOf('sale-totals-bar')?.includes('بالدينار')], ['35,000', true], 'U2 الشريط بالصافي (المبلغ وحده كبيراً، و«بالدينار» في السطر الصغير)');
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
      t.same([textOf('line-read-back'), d.lineSheet().textContent.includes('عندك 8 أكياس + 24.5 كغم'), textOf('line-total')], ['= 150 كغم', true, 'المبلغ 105,000 دينار'], 'U5 القراءة الراجعة بالأساس و«عندك» بالوحدة والمبلغ');
      await d.tab('price');
      await d.keys('34000');
      t.eq(textOf('line-usual'), 'المعتاد 35,000 — أعِده', 'U5 السعر يُغيَّر: «المعتاد … — أعِده» ظاهر');
      await click(first('line-usual'));
      t.same([d.display(), byAction('line-usual').length], ['35,000', 0], 'U5 «أعِده» يعيد سعر البيع');
      await d.keys('40');
      t.eq(byAction('line-error').length, 0, 'U5 لا خطأ قبل أوّل حفظ إلا الحيّ');
      await d.tab('qty');
      await d.keys('9');
      t.eq(textOf('line-error'), 'المتاح في «المخزن العام» 8 أكياس + 24.5 كغم فقط؛ لا يُحفظ أكثر منه.', 'U5 أكثر من المتاح يُقال حيّاً تحت الكمية نفسها، بوحدة السطر');
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
      t.same([d.cardQty(ID.starter), first('sale-search')?.value], ['1 كيس', '6260001999'], 'U15 الرمز الكامل لا يُضاف والكتابة جارية (الماسح يكتب حرفاً حرفاً، S5)');
      await wait(200);
      await settle();
      t.same([d.cardQty(ID.starter), first('sale-search')?.value], ['2 كيس', ''], 'U15 الرمز الكامل الوحيد يضيف بلا Enter بعد وقفة قصيرة في الكتابة');
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

    // ═══ مراجعة البيع العدائية (S1–S13) والإتاحة ومراجعة التصميم (D1–D23): كلّ حكم هنا السلوك الصحيح، وفشل على 02d5907 قبل الإصلاح. ═══

    /** نسخة جديدة من الحزمة (= تبويب جديد أو إعادة تحميل: ذاكرة جديدة، والتخزين كما هو). */
    const reload = async () => {
      const mm = await bundle();
      mm.onlineStore.set(true);
      current = mm;
      return mm;
    };
    const failureShown = () => (textOf('sale-failure') ?? '').trim();
    const sellState = () => globalThis.__ux.state?.sell ?? null;

    await step('S1 lost answer then tab closed: the next day restores the frozen request and posts once', async () => {
      remember('manager', { store: 'w-gen' });
      const server = serverModel(() => current);
      let first1 = true;
      fresh(MANAGER, { ...OK, record_sale_v2: (a) => { const lose = first1; first1 = false; return server.handle(a, { lose }); }, sale_detail: () => clone(F.sale_detail) }, pickers);
      // تبويب يُغلق بعده: نسخة من الحزمة له وحده (ذاكرة الطلب المعلَّق فيه تذهب معه).
      await mount('/sales/new', await reload());
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(30);
      const kept = JSON.parse(local.api.getItem(draftKey('manager')) ?? 'null');
      t.same([byAction('sale-frozen').length, server.posts(), typeof kept?.pending], [1, 1, 'string'], 'S1 جواب ضاع بعد الحفظ: الشاشة مجمَّدة، والطلب نفسه محفوظ مع الفاتورة في localStorage');
      // أُغلق التبويب (ضاعت sessionStorage) وفُتح صباح الغد: يوم الخادم +1.
      await unmount();
      session.map.clear();
      const m2 = await reload();
      const nextDay = clone(F.stores_overview);
      nextDay.today = '2026-11-18';
      fresh(MANAGER, { stores_overview: () => nextDay, sale_catalog: () => clone(CAT), record_sale_v2: (a) => server.handle(a), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new', m2);
      t.same([byAction('sale-frozen').length, byAction('save-invoice').length, byAction('sale-item-card').length], [1, 0, 0], 'S1 تعود مجمَّدة بطلبها (لا سلّة تُعدَّل وتُرسل بمرجعها)');
      await click(first('sale-retry'));
      await settle(30);
      const retry = named('record_sale_v2')[0];
      t.same(
        [server.posts(), retry?.p_sold_on, retry?.p_client_ref === server.posted()[0]?.p_client_ref, where(), local.api.getItem(draftKey('manager'))],
        [1, server.posted()[0]?.p_sold_on, true, `/sales/${server.posted()[0]?.p_sale_id}?done=1`, null],
        'S1 «أعد المحاولة» يرسل الطلب نفسه بيومه الأوّل فيُعاد جوابه: فاتورة واحدة، والفاتورة مكان الشاشة، والمحفوظ ممحوّ',
      );
    });

    await step('S1b a restored cart whose ref was already used: maybe saved, read by id, posted once', async () => {
      remember('manager', { store: 'w-gen' });
      const server = serverModel(() => current);
      let first1 = true;
      fresh(MANAGER, { ...OK, record_sale_v2: (a) => { const lose = first1; first1 = false; return server.handle(a, { lose }); } }, pickers);
      await mount('/sales/new', await reload());
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(30);
      // فاتورة محفوظة بلا طلبها (نسخة أقدم من الشاشة، أو طلب ضاع): تعود سلّةً بالمرجع المستعمل.
      const stored = JSON.parse(local.api.getItem(draftKey('manager')));
      delete stored.pending;
      local.api.setItem(draftKey('manager'), JSON.stringify(stored));
      await unmount();
      session.map.clear();
      const m2 = await reload();
      const detail = clone(F.sale_detail);
      detail.id = server.posted()[0].p_sale_id;
      fresh(MANAGER, { ...OK, record_sale_v2: (a) => server.handle(a), sale_detail: (a) => { if (a.p_sale !== detail.id) throw new current.RejectedError('doc_not_found', 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.'); return clone(detail); } }, pickers);
      await mount('/sales/new', m2);
      await d.plus(ID.starter);
      await d.next();
      for (let press = 0; press < 3 && d.paySheet(); press += 1) {
        await d.save();
        await settle(30);
      }
      t.same(
        [server.posts(), named('sale_detail')[0]?.p_sale, where(), navType, local.api.getItem(draftKey('manager')), globalThis.__ux.toasts.map((x) => x.tone)],
        [1, detail.id, `/sales/${detail.id}?done=1`, 'REPLACE', null, ['warning']],
        'S1b ref_reused: تُقرأ الفاتورة بمعرّفها فتوجد، فهي محفوظة: لا فاتورة ثانية، والفاتورة مكان الشاشة، وتنبيه أنّ ما تغيّر بعدها لم يُحفظ',
      );
    });

    await step('S1c ref used but no invoice by that id: a sure refusal with new ids', async () => {
      remember('manager', { store: 'w-gen' });
      let calls = 0;
      fresh(MANAGER, {
        ...OK,
        record_sale_v2: () => {
          calls += 1;
          if (calls === 1) throw new current.RejectedError('ref_reused', 'مرجع هذه العملية استُعمل لعملية أخرى. حدّث الشاشة وأعد العملية من جديد.');
          return clone(F.record_sale_v2);
        },
        sale_detail: () => {
          throw new current.RejectedError('doc_not_found', 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.');
        },
      }, pickers);
      await mount('/sales/new');
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(30);
      t.same([byAction('sale-frozen').length, named('sale_detail').length, failureShown().startsWith('مرجع هذه العملية')], [0, 1, true], 'S1c الفاتورة غير موجودة بمعرّفها: الرفض أكيد، والسلّة كما هي بسببه');
      await d.save();
      await settle(30);
      const [a, b] = named('record_sale_v2');
      t.same([b?.p_client_ref !== a?.p_client_ref, where()], [true, '/sales/s-7?done=1'], 'S1c والإرسال التالي بمرجع جديد');
    });

    await step('S2 a tab left open does not bring back an invoice sold in another tab', async () => {
      remember('manager', { store: 'w-gen' });
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      const mA = await reload();
      await mount('/sales/new', mA);
      await d.tap(ID.starter);
      // التبويب ب فُتح من شريحة «فاتورة مفتوحة»: الفاتورة نفسها بمرجعها.
      const mB = await reload();
      const boxB = globalThis.document.createElement('div');
      body().appendChild(boxB);
      const rootB = mB.createRoot(boxB);
      function WhereB() {
        return mB.h(mB.Routes, null, mB.h(mB.Route, { path: '/sales/*', element: mB.h(mB.SalesRoutes) }));
      }
      mB.flushSync(() => rootB.render(mB.h(mB.MemoryRouter, { initialEntries: ['/sales/new'] }, mB.h(WhereB))));
      await settle(40);
      const dB = sellDriver({ body: () => boxB, descendants, fire, settle });
      const refB = JSON.parse(local.api.getItem(draftKey('manager'))).body.ids.ref;
      current = mA;
      await d.next();
      await d.save();
      await settle(40);
      t.same([named('record_sale_v2')[0]?.p_client_ref, local.api.getItem(draftKey('manager')), JSON.parse(local.api.getItem('sales.sell.posted:u-manager:org-1') ?? '[]')], [refB, null, [refB]], 'S2 التبويب أ حفظ: الفاتورة ممحوّة ومرجعها في قائمة المحفوظ على الجهاز');
      current = mB;
      await dB.plus(ID.starter);
      const stored = JSON.parse(local.api.getItem(draftKey('manager')) ?? 'null');
      t.same(
        [mB.readSaleDraftSummary('u-manager', 'org-1'), stored?.body?.ids?.ref === refB, dB.cardQty(ID.starter), (dB.first('sale-notice')?.textContent ?? '').includes('من نافذة أخرى')],
        [null, false, null, true],
        'S2 لمسة في التبويب ب لا تعيد الفاتورة المبيعة «فاتورة مفتوحة» بمرجعها: تبدأ فاتورة جديدة ويُقال لماذا',
      );
      mB.flushSync(() => rootB.unmount());
      current = mA;
    });

    await step('S2b a stored invoice whose ref was posted is not restored', async () => {
      const draft = { warehouseId: 'w-gen', lines: [{ lineId: 'l-a', itemId: ID.starter, name: 'علف بادئ', unitId: BAG, qty: '1', price: '35000', suggestedFrom: '700', discount: '' }], invoiceDiscount: '', mode: 'walk_in', party: null, pay: 'auto', cashLegId: 'leg-a', cashBox: '', legs: [], note: '', day: null };
      local.api.setItem(draftKey('manager'), JSON.stringify({ v: 1, summary: { lines: 1, total: '3500000', store: 'w-gen' }, body: { draft, ids: { ref: 'r-sold', saleId: 's-sold' } } }));
      local.api.setItem('sales.sell.posted:u-manager:org-1', JSON.stringify(['r-sold']));
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      t.same([d.cardQty(ID.starter), byAction('sale-restored').length, local.api.getItem(draftKey('manager'))], [null, 0, null], 'S2 فاتورة محفوظة مرجعها حُفظ من قبل لا تُستعاد وتُمحى');
    });

    await step('S3 a draft for a store the user lost can pick a store again', async () => {
      const onlyFeed = clone(F.stores_overview);
      const feed = onlyFeed.rows.find((row) => row.id === 'w-feed');
      onlyFeed.rows = [...onlyFeed.rows.filter((row) => row.id !== 'w-gen'), { ...feed, id: 'w-med', name: 'مخزن الأدوية', kind: 'medicine' }];
      const draft = { warehouseId: 'w-gen', lines: [{ lineId: 'l-a', itemId: ID.starter, name: 'علف بادئ', unitId: BAG, qty: '1', price: '35000', suggestedFrom: '700', discount: '' }], invoiceDiscount: '', mode: 'walk_in', party: null, pay: 'auto', cashLegId: 'leg-a', cashBox: '', legs: [], note: '', day: null };
      local.api.setItem(draftKey('manager'), JSON.stringify({ v: 1, summary: { lines: 1, total: '3500000', store: 'w-gen' }, body: { draft, ids: { ref: 'r-1', saleId: 's-1' } } }));
      fresh(MANAGER, { stores_overview: () => onlyFeed, sale_catalog: (a) => { if (a.p_warehouse === 'w-gen') throw new current.RejectedError('out_of_scope', 'ليس في نطاقك.'); return clone(CAT); } }, pickers);
      await mount('/sales/new');
      t.same(
        [byAction('sale-store-option').length > 0 || byAction('sale-store').length > 0, (textOf('sale-notice') ?? '').includes('لم يعد في نطاقك')],
        [true, true],
        'S3 مخزن الفاتورة خارج النطاق: لا تبقى عالقة عليه، بل يُختار مخزن ويُقال لماذا',
      );
      await click(first('sale-start-over'));
      t.ok(byAction('sale-store-option').length > 0 || byAction('sale-store').length > 0, 'S3 و«ابدأ من جديد» لا يُبقي المخزن المفقود');
    });

    await step('S3b «احفظ» before the store items are read says the real reason', async () => {
      const draft = { warehouseId: 'w-gen', lines: [{ lineId: 'l-a', itemId: ID.starter, name: 'علف بادئ', unitId: BAG, qty: '1', price: '35000', suggestedFrom: '700', discount: '' }], invoiceDiscount: '', mode: 'walk_in', party: null, pay: 'auto', cashLegId: 'leg-a', cashBox: '', legs: [], note: '', day: null };
      local.api.setItem(draftKey('manager'), JSON.stringify({ v: 1, summary: { lines: 1, total: '3500000', store: 'w-gen' }, body: { draft, ids: { ref: 'r-1', saleId: 's-1' } } }));
      fresh(MANAGER, { stores_overview: () => clone(F.stores_overview), sale_catalog: () => new Promise(() => {}) }, pickers);
      await mount('/sales/new');
      await d.next();
      await d.save();
      await settle(20);
      t.same([named('record_sale_v2').length, (textOf('sale-blocked') ?? '').includes('لم تُقرأ')], [0, true], 'S3 موادّ المخزن وصناديقه لم تُقرأ: «احفظ» يقول ذلك لا «اختر الصندوق»');
    });

    await step('S4 one close closes the pay sheet after «صحّح» opened the cart', async () => {
      remember('manager', { store: 'w-gen' });
      let reads = 0;
      fresh(MANAGER, { ...OK, sale_catalog: () => { reads += 1; const c = clone(CAT); if (reads >= 2) c.items = c.items.filter((i) => i.item_id !== ID.starter); return c; } }, pickers);
      await mount('/sales/new');
      await d.tap(ID.starter);
      await d.tap(ID.sync);
      await d.tab('price');
      await d.keys('1000');
      await d.done();
      await d.next();
      await d.save();
      await settle(20);
      t.same(sellState()?.stack, ['pay', 'cart'], 'S4 مادّة غابت عند القراءة: السلّة فوق الدفع على خطئها');
      await click(first('cart-remove', d.lines()[0]));
      await d.next();
      t.same(sellState()?.stack, ['pay'], 'S4 «التالي: الدفع» من السلّة يرجع إلى ورقة الدفع لا ورقة ثانية');
      await click(first('sheet-close', d.paySheet()));
      await settle(10);
      t.eq(d.paySheet() === null, true, 'S4 إغلاق واحد يغلق ورقة الدفع');
    });

    await step('S5 a wedge scanner typing a longer code does not add a shorter code on the way', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      const input = first('sale-search');
      for (const ch of '62600017001') {
        input.value = `${input.value ?? ''}${ch}`;
        fire(input, 'input');
        await settle(2);
      }
      fire(input, 'keydown', { key: 'Enter' });
      await settle(10);
      await wait(200);
      t.same([d.cardQty(ID.starter), (textOf('sale-scan-note') ?? '').includes('62600017001')], [null, true], 'S5 «62600017001» لا يضيف «علف بادئ» (6260001)، ويُقال لا مادّة به');
    });

    await step('S6 D4 a discount bigger than the line: no negative amount, the error at once', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await d.tab('discount');
      await d.keys('40000');
      t.same(
        [textOf('line-total'), textOf('line-error')],
        ['الإجمالي 35,000 دينار − الخصم 40,000 دينار = —', 'الخصم أكبر من إجماليّ السطر (35,000 دينار).'],
        'S6 ورقة السطر: لا مبلغ سالب، والخطأ تحت الخانة قبل «احفظ»',
      );
      await d.done();
      await d.openCart();
      t.same([textOf('cart-line-total'), textOf('cart-line-error')], ['—', 'الخصم أكبر من إجماليّ السطر (35,000 دينار).'], 'S6 والسلّة: «—» لا «-5,000»، والخطأ تحته');
      await d.openLine(0);
      await d.tab('price');
      await d.clearValue();
      t.eq(textOf('line-error'), 'اكتب السعر لكل كيس 50 كغم بالدينار (صفر للتسليم بلا مقابل).', 'D4 السعر الممسوح: خطؤه تحته فوراً لا بعد «احفظ»');
    });

    await step('S8 the screen is locked while saving, the back gesture keeps the pay sheet', async () => {
      remember('manager', { store: 'w-gen' });
      let resolve;
      fresh(MANAGER, { ...OK, record_sale_v2: () => new Promise((r) => { resolve = r; }), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount(['/sales', '/sales/new']);
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(10);
      globalThis.__ux.nav(-1);
      await settle(10);
      t.same([d.paySheet() !== null, d.card(ID.sync)?.hasAttribute('disabled'), first('open-cart')?.hasAttribute('disabled'), textOf('save-invoice')], [true, true, true, 'يُحفظ…'], 'S8 D23 أثناء الحفظ: ورقة الدفع تعود بعد الرجوع، والبطاقات والشريط مقفلة، والزرّ «يُحفظ…»');
      await d.tap(ID.sync);
      resolve(clone(F.record_sale_v2));
      await settle(40);
      t.same([named('record_sale_v2')[0]?.p_lines.map((l) => l.item_id), where()], [[ID.starter], '/sales/s-7?done=1'], 'S8 لا يُضاف شيء تحت الطلب فيضيع: المرسَل هو المعروض');
    });

    await step('S9 browser forward after a sale does not reopen an empty pay sheet', async () => {
      remember('manager', { store: 'w-gen' });
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount(['/sales', '/sales/new']);
      await d.tap(ID.starter);
      await d.openCart();
      await d.next();
      await d.save();
      await settle(40);
      globalThis.__ux.nav(1);
      await settle(20);
      t.same([where(), d.paySheet() === null, d.cartSheet() === null], ['/sales/new', true, true], 'S9 «إلى الأمام» بعد الحفظ: الشاشة فارغة بلا ورقة دفع');
    });

    await step('S10 a line whose unit was removed is not counted in bags on the card', async () => {
      const TON = unitNamed('علف بادئ', 'طنّ');
      const noTon = clone(CAT);
      const starter = noTon.items.find((i) => i.item_id === ID.starter);
      starter.units = starter.units.filter((u) => u.unit_id !== TON);
      const draft = { warehouseId: 'w-gen', lines: [{ lineId: 'l-a', itemId: ID.starter, name: 'علف بادئ', unitId: TON, qty: '2', price: '700000', suggestedFrom: '700', discount: '' }], invoiceDiscount: '', mode: 'walk_in', party: null, pay: 'auto', cashLegId: 'leg-a', cashBox: '', legs: [], note: '', day: null };
      local.api.setItem(draftKey('manager'), JSON.stringify({ v: 1, summary: { lines: 1, total: '140000000', store: 'w-gen' }, body: { draft, ids: { ref: 'r-1', saleId: 's-1' } } }));
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(noTon) }, pickers);
      await mount('/sales/new?store=w-gen');
      t.same([d.cardQty(ID.starter)?.includes('كيس'), d.cardQty(ID.starter)?.includes('اختر الوحدة')], [false, true], 'S10 سطر بوحدة غابت: لا «2 كيس» على البطاقة بل «اختر الوحدة»');
    });

    await step('S11 a payment leg whose box is gone is flagged, not sent', async () => {
      const draft = { warehouseId: 'w-gen', lines: [{ lineId: 'l-a', itemId: ID.starter, name: 'علف بادئ', unitId: BAG, qty: '1', price: '35000', suggestedFrom: '700', discount: '' }], invoiceDiscount: '', mode: 'party', party: PARTY, pay: 'part', cashLegId: 'leg-a', cashBox: '', legs: [{ legId: 'leg-b', boxId: 'box-archived', amount: '10000' }], note: '', day: null };
      local.api.setItem(draftKey('manager'), JSON.stringify({ v: 1, summary: { lines: 1, total: '3500000', store: 'w-gen' }, body: { draft, ids: { ref: 'r-1', saleId: 's-1' } } }));
      fresh(MANAGER, { ...OK, record_sale_v2: () => { throw new current.RejectedError('cash_account_archived', 'الصندوق مؤرشف.'); } }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.next();
      await d.save();
      await settle(20);
      t.same([named('record_sale_v2').length, (textOf('sale-blocked') ?? '').includes('لم يعد فعّالاً')], [0, true], 'S11 صندوق ليس في القائمة: يُقال على الشاشة ولا يُرسل');
    });

    await step('S12 a resized bag is acknowledged before it is sold at the old bag price', async () => {
      let reads = 0;
      const resized = () => {
        const c = clone(CAT);
        c.items.find((i) => i.item_id === ID.starter).units.find((u) => u.unit_id === BAG).factor = '25';
        return c;
      };
      fresh(MANAGER, {
        ...OK,
        sale_catalog: () => {
          reads += 1;
          return reads === 1 ? clone(CAT) : resized();
        },
        record_sale_v2: (a) => {
          if (a.p_lines[0].factor !== '25.000000') throw new current.RejectedError('unit_changed', 'تغيّر حجم «كيس 50 كغم».');
          return clone(F.record_sale_v2);
        },
        sale_detail: () => clone(F.sale_detail),
      }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(30);
      t.same(
        [named('record_sale_v2').length, first('prices-changes')?.textContent],
        [0, '«علف بادئ»: صار «كيس 50 كغم» 25 كغم بعد أن كان 50 كغم. سعره في الفاتورة 35,000 دينار، و«اعتمد الأسعار الجديدة» تجعله 17,500 دينار.'],
        'S12 حجم الكيس تغيّر: يُسأل قبل الإرسال ولا يُرسل الكيس الأصغر بسعر الأكبر',
      );
      await click(first('prices-update'));
      await settle(10);
      await d.save();
      await settle(30);
      t.same(named('record_sale_v2').map((a) => [a.p_lines[0].factor, a.p_lines[0].unit_price]), [['25.000000', '17500.00']], 'S12 «اعتمد الأسعار الجديدة»: بالحجم الجديد وسعره');
    });

    await step('S13 «صحّح» shows only when there is something to fix', async () => {
      let reads = 0;
      fresh(MANAGER, { ...OK, sale_catalog: () => { reads += 1; const c = clone(CAT); if (reads >= 2) c.items.find((i) => i.item_id === ID.starter).sell_price = '800'; return c; } }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(20);
      await click(first('prices-update'));
      await settle(10);
      t.same([textOf('sale-blocked'), byAction('sale-fix').length], ['حُدّثت الأسعار في الفاتورة؛ راجع المجموع ثمّ احفظ.', 0], 'S13 ملاحظة لا منع: بلا «صحّح» لا يفعل شيئاً');
    });

    await step('A11y focus, live region and the tab error mark', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.plus(ID.starter);
      t.eq(textOf('sale-live'), '«علف بادئ»: 2 كيس في الفاتورة', 'A11y ± يُعلَن بكميته الجديدة (منطقة حيّة مهذّبة)');
      await d.minus(ID.starter);
      const minus = first('card-minus', d.cell(ID.starter));
      minus.focus?.();
      await d.minus(ID.starter);
      t.eq(globalThis.document.activeElement === d.card(ID.starter), true, 'A11y النقص إلى صفر: التركيز إلى البطاقة لا إلى الصفحة');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await d.clearValue();
      await d.tab('price');
      const dot = descendants(d.pick('line-tab', 'data-tab', 'qty', d.lineSheet())).find((n) => n.getAttribute('class') === 'sl-dot');
      t.same([dot?.getAttribute('role'), dot?.getAttribute('aria-label')], ['img', 'فيه خطأ'], 'A11y علامة الخطأ على التبويب صورة باسمها');
    });

    await step('D1 D17 a typed customer name blocks the save until picked, added or cleared', async () => {
      fresh(MANAGER, OK, { searchSuppliers: () => ({ parties: [], total: 0 }) });
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      d.typeIn(first('sale-party-search'), 'حاج كريم');
      await settle(20);
      t.same([textOf('save-invoice'), d.paySheet().textContent.includes('لا زبون بهذا الاسم.')], ['اختر الزبون أوّلاً', true], 'D1 اسم كُتب ولم يُختر: الزرّ «اختر الزبون أوّلاً» (D8: «لا زبون بهذا الاسم»)');
      await d.save();
      await settle(20);
      t.same([named('record_sale_v2').length, textOf('sale-party-error'), globalThis.document.activeElement === first('sale-party-search')], [0, 'لم تختر «حاج كريم»: اختره من القائمة، أو أضفه زبوناً جديداً، أو امسح الاسم.', true], 'D1 لا يُحفظ لزبون نقديّ والاسم يضيع، والسبب تحت البحث المركَّز');
      await click(first('party-walk-in'));
      t.same([first('sale-party-search')?.value, textOf('save-invoice')], ['', 'احفظ — 35,000 دينار مدفوعة كلّها'], 'D1 «زبون نقديّ» يمسح الاسم ويعود الحفظ');
      await d.payKind('debt');
      t.same([textOf('save-invoice'), byAction('party-new').length], ['اختر الزبون أوّلاً', 1], 'D17 «دين كلّه» بلا زبون: «اختر الزبون أوّلاً» و«+ زبون جديد» ظاهر');
      await click(first('party-new'));
      t.eq(globalThis.document.activeElement === first('sale-party-search'), true, 'D17 «+ زبون جديد» يركّز البحث ليُكتب الاسم');
    });

    await step('D2 D21 the bar: the amount alone on the big line, «التالي:» folds below 380px, a cart icon', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      t.same([textOf('sale-bar-total'), first('sale-next')?.getAttribute('aria-label'), byAction('sale-next')[0] && descendants(first('sale-next')).some((n) => n.getAttribute('class') === 'sl-next-pre')], ['35,000', 'التالي: الدفع', true], 'D2 المبلغ وحده في الشريط و«التالي:» جزء يُطوى');
      t.ok(/@media \(max-width: 379px\) \{\s*\.sl-next-pre \{\s*display: none;/u.test(CSS), 'D2 تحت 380 بكسل يُطوى «التالي:» فلا يُقصّ المبلغ');
      t.eq(first('back')?.textContent, 'رجوع', 'D21 الرجوع «رجوع» بيضاويّ كصفحة الفاتورة');
    });

    await step('D3 the card keeps a stock line and stops «+» at what is available', async () => {
      const two = clone(CAT);
      two.items.find((i) => i.item_id === ID.starter).available = '100.000';
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(two) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      const stockOf = () => first('card-stock', d.cell(ID.starter))?.textContent;
      t.eq(stockOf(), 'يبقى كيس واحد', 'D3 والمادّة في الفاتورة: «يبقى …» بوحدة السطر');
      await d.plus(ID.starter);
      t.same([d.cardQty(ID.starter), stockOf()], ['2 كيس', 'عندك كيسان فقط'], 'D3 عند المتاح: «عندك كيسان فقط»');
      await d.plus(ID.starter);
      t.same([d.cardQty(ID.starter), textOf('sale-live')], ['2 كيس', '«علف بادئ»: عندك كيسان فقط.'], 'D3 «+» يتوقّف عند المتاح ويقول لماذا');
    });

    await step('D5 D11 the price tab: short unit, «أعِده» above the value; the cart: the full unit, no chip', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await d.tab('price');
      await d.keys('34000');
      const sheet = descendants(d.lineSheet());
      const at = (name) => sheet.findIndex((n) => n.getAttribute('data-action') === name);
      t.same([d.lineSheet().textContent.includes('/ كيس'), at('line-usual') >= 0 && at('line-usual') < at('line-display')], [true, true], 'D5 «/ كيس» تحت القيمة، و«المعتاد … — أعِده» فوقها لا تحت اللوحة');
      await d.done();
      await d.openCart();
      t.same([descendants(d.cartSheet()).filter((n) => n.localName === 'button' && n.getAttribute('data-action') === 'cart-unit').length, textOf('cart-unit')], [0, '34,000 لكل كيس 50 كغم'], 'D11 لا شريحة وحدة مقصوصة؛ الوحدة كاملةً تحت الاسم');
    });

    await step('D6 the undo bar never covers a sheet keypad', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.tap(ID.grower);
      await d.done();
      await d.minus(ID.grower);
      t.eq(byAction('sell-snack').length, 1, 'D6 «تراجع» بعد الحذف');
      await d.openLineOf(ID.starter);
      t.eq(byAction('sell-snack').length, 0, 'D6 فتح ورقة يطوي «تراجع» فلا يغطّي لوحتها');
      await d.done();
      await d.openCart();
      await click(first('cart-remove', d.lines()[0]));
      t.eq(first('sell-snack')?.getAttribute('data-place'), 'top', 'D6 والحذف داخل ورقة: «تراجع» أعلى الشاشة');
    });

    await step('D8 D9 D13 D15 D22 words and the part-payment pad', async () => {
      current.onlineStore.set(false);
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      t.eq(textOf('sale-offline'), 'بلا اتصال: جهّز الفاتورة واحفظها حين يعود الاتصال.', 'D9 بلا اتصال: لا وعد بحفظ تلقائيّ');
      current.onlineStore.set(true);
      await settle();
      await d.tap(ID.starter);
      await d.plus(ID.starter);
      await d.openCart();
      t.eq(first('cart-total')?.parentNode?.textContent?.startsWith('المطلوب'), true, 'D8 السلّة تقول «المطلوب» كورقة الدفع');
      await d.next();
      t.same([textOf('pay-change'), d.pick('pay-kind', 'data-kind', 'part')?.textContent?.includes('جزء الآن…')], ['احسب ما تُرجعه للزبون (لا يُسجَّل)', false], 'D8 D15 «احسب ما تُرجعه للزبون» و«جزء الآن» بلا نقاط');
      await click(first('party-recent') ?? first('party-walk-in'));
      await d.party('أبو');
      await d.payKind('part');
      t.same(
        [textOf('pad-debt'), byAction('pay-quick').map((n) => n.textContent)],
        ['يبقى دين 70,000 دينار', ['المطلوب كلّه 70,000', 'النصف 35,000', '50,000']],
        'D13 لوحة «جزء الآن»: ما يبقى ديناً فوقها، والمبالغ السريعة بأسمائها',
      );
      await d.keys('20000');
      t.eq(textOf('pad-debt'), 'يبقى دين 50,000 دينار', 'D13 ويتبع ما يُكتب');
    });

    await step('D12 only the search sticks after scrolling down', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      const tools = () => descendants(body()).find((n) => n.getAttribute('class') === 'sl-tools');
      globalThis.window.scrollY = 600;
      fire(globalThis.window, 'scroll');
      await settle();
      const down = tools()?.getAttribute('data-compact');
      globalThis.window.scrollY = 0;
      fire(globalThis.window, 'scroll');
      await settle();
      t.same([down, tools()?.getAttribute('data-compact') ?? null], ['yes', null], 'D12 بعد التمرير تُطوى شرائح النوع ويبقى البحث سطراً واحداً، وتعود في الأعلى');
      delete globalThis.window.scrollY;
    });

    await step('D16 a stock refusal is said in the line unit with «صحّح الكمية»', async () => {
      let reads = 0;
      fresh(MANAGER, {
        ...OK,
        sale_catalog: () => {
          reads += 1;
          const c = clone(CAT);
          if (reads >= 3) c.items.find((i) => i.item_id === ID.starter).available = '50.000';
          return c;
        },
        record_sale_v2: () => {
          throw new current.RejectedError('insufficient_stock', 'المتاح من «علف بادئ» 50 كغم فقط.');
        },
      }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.plus(ID.starter);
      await d.next();
      await d.save();
      await settle(40);
      t.same(
        [textOf('sale-blocked'), textOf('sale-fix'), byAction('sale-failure').length],
        ['لم تُحفظ الفاتورة: المتاح في «المخزن العام» كيس واحد فقط؛ لا يُحفظ أكثر منه.', 'صحّح الكمية', 0],
        'D16 بعد قراءة الموادّ: السطر بوحدته و«صحّح الكمية»، لا نصّ الخادم بالكيلو',
      );
      await click(first('sale-fix'));
      t.same([d.lineSheet() !== null, sellState()?.tab], [true, 'qty'], 'D16 «صحّح الكمية» يفتح السطر على كميته');
    });

    await step('D20 D22 cards reserve the stepper slot; words', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new');
      t.eq(textOf('sale-store-section')?.includes('كلّ مخزن بفاتورته؛ لبيع من مخزن آخر افتح فاتورة جديدة.'), true, 'D22 «كلّ مخزن بفاتورته»');
      await d.store('w-gen');
      t.ok(d.card(ID.starter)?.textContent.includes('+ أضف'), 'D20 كلّ بطاقة تحجز مكان العدّاد («+ أضف»)، فأوّل لمسة لا تطيلها');
    });

    await step('CSS D10 D15 D19 D21 rules', async () => {
      const rule = (selector) => {
        const at = CSS.indexOf(`${selector} {`);
        return at < 0 ? '' : CSS.slice(at, CSS.indexOf('}', at));
      };
      t.same(
        [
          rule('.sl-card-name').includes('-webkit-line-clamp: 3'),
          rule('.sl-line-name').includes('-webkit-line-clamp: 2'),
          /@media \(max-width: 379px\) \{\s*\.sl-pay-kinds \{\s*grid-template-columns: minmax\(0, 1fr\);/u.test(CSS),
          rule(".sl-stepper[data-size='sm']").includes('min-height: 48px'),
          rule('.sl-text-btn,\n.sl-link').includes('min-width: 48px'),
          rule('.sl-primary').includes('border-radius: 999px'),
          [...new Set(CSS.match(/border-radius: [^;]+;/gu))].length <= 5,
        ],
        [true, true, true, true, true, true, true],
        'CSS الاسم ثلاثة أسطر والسلّة سطرين (D10)، وبطاقات الدفع عموداً تحت 380 (D15)، وأهداف 48 (D19)، والزرّ بيضاويّ والزوايا من الرموز (D21)',
      );
    });

    // ═══ المراجعة العدائية الثانية (R1–R12 وQ6): كلّ حكم السلوك الصحيح، وفشل على 81dc029 قبل الإصلاح. ═══

    /** مفتاح من لوحة مفاتيح حقيقية بوقت صريح (at مللي ثانية): الإنسان بفواصل طويلة، والماسح دفعةً بأجزاء من الثانية. */
    const hwKey = (name, at) => fire(globalThis.document.activeElement ?? body(), 'keydown', { key: name, timeStamp: at });
    const storedLine = (i = 0) => JSON.parse(local.api.getItem(draftKey('manager')) ?? 'null')?.body?.draft?.lines?.[i] ?? null;
    /** تبويب ثانٍ على الفاتورة المفتوحة نفسها (نسخة أخرى من الحزمة، والتخزين مشترك). */
    const secondTab = async () => {
      const mB = await reload();
      const box = globalThis.document.createElement('div');
      body().appendChild(box);
      const rootB = mB.createRoot(box);
      function WhereB() {
        return mB.h(mB.Routes, null, mB.h(mB.Route, { path: '/sales/*', element: mB.h(mB.SalesRoutes) }));
      }
      mB.flushSync(() => rootB.render(mB.h(mB.MemoryRouter, { initialEntries: ['/sales/new'] }, mB.h(WhereB))));
      await settle(40);
      return { mB, box, dB: sellDriver({ body: () => box, descendants, fire, settle }), close: () => mB.flushSync(() => rootB.unmount()) };
    };
    const storageEvent = (key) => fire(globalThis.window, 'storage', { key, newValue: local.api.getItem(key), bubbles: false });

    await step('R3 a typed name that differs from the picked customer blocks the save', async () => {
      fresh(MANAGER, { ...OK, record_sale_v2: () => clone(F.record_sale_v2) }, { searchSuppliers: (q) => (q.startsWith('أبو') ? { parties: [PARTY], total: 1 } : { parties: [], total: 0 }) });
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      await d.party('أبو');
      d.typeIn(first('sale-party-search'), 'حاج كريم');
      await settle(20);
      const label = textOf('save-invoice');
      await d.save();
      await settle(20);
      t.same([label, named('record_sale_v2').length, textOf('sale-party-error')], ['اختر الزبون أوّلاً', 0, 'لم تختر «حاج كريم»: اختره من القائمة، أو أضفه زبوناً جديداً، أو امسح الاسم.'], 'R3 «أبو علي» مختار ثمّ كُتب «حاج كريم»: لا يُحفظ الدين على الأوّل والاسم يضيع');
    });

    await step('R4 «تراجع» cannot change an invoice that is being saved', async () => {
      let resolve;
      fresh(MANAGER, { ...OK, record_sale_v2: () => new Promise((r) => { resolve = r; }), sale_detail: () => clone(F.sale_detail) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.tap(ID.grower);
      await d.done();
      await d.next();
      await d.save();
      await settle(20);
      // «احفظ» فتح سطر «علف نامي» (بلا سعر) فوق الدفع؛ «احذف» فيه يُظهر «تراجع» فوق ورقة الدفع.
      await click(first('line-remove', d.lineSheet()));
      await settle(10);
      const undoBefore = byAction('sell-undo').length;
      await d.save();
      await settle(10);
      t.same([undoBefore, byAction('sell-undo').length, textOf('save-invoice')], [1, 0, 'يُحفظ…'], 'R4 «احفظ» يطوي «تراجع»: لا سطر يعود تحت الطلب الخارج');
      resolve(clone(F.record_sale_v2));
      await settle(40);
      t.same(named('record_sale_v2')[0]?.p_lines.map((l) => l.item_id), [ID.starter], 'R4 والمرسَل ما كان معروضاً');
    });

    await step('R5 a tab frozen on another tab request follows it: refused there, back to the fields here', async () => {
      remember('manager', { store: 'w-gen' });
      let refuse;
      fresh(MANAGER, {
        ...OK,
        record_sale_v2: () => new Promise((_, reject) => { refuse = () => reject(new current.RejectedError('insufficient_stock', 'المتاح من «علف بادئ» 50 كغم فقط.')); }),
        sale_detail: () => clone(F.sale_detail),
      }, pickers);
      const mA = await reload();
      await mount('/sales/new', mA);
      await d.tap(ID.starter);
      const tab = await secondTab();
      current = mA;
      await d.next();
      await d.save();
      await settle(10);
      storageEvent(draftKey('manager'));
      await settle(10);
      const frozenB = tab.dB.byAction('sale-frozen').length;
      refuse();
      await settle(30);
      storageEvent(draftKey('manager'));
      await settle(20);
      const kept = JSON.parse(local.api.getItem(draftKey('manager')));
      current = tab.mB;
      await tab.dB.plus(ID.starter);
      t.same(
        [frozenB, tab.dB.byAction('sale-frozen').length, tab.dB.cardQty(ID.starter), JSON.parse(local.api.getItem(draftKey('manager')))?.body?.ids?.ref === kept?.body?.ids?.ref, (tab.dB.first('sale-notice')?.textContent ?? '').includes('من نافذة أخرى')],
        [1, 0, '2 كيس', true, true],
        'R5 رُفض هناك: هنا تعود الخانات بما حُفظ على الجهاز ومرجعه الجديد، لا «أعد المحاولة» تعيد الطلب المرفوض',
      );
      tab.close();
      current = mA;
    });

    await step('R5b a tab frozen on another tab request follows it: saved there, the invoice here', async () => {
      remember('manager', { store: 'w-gen' });
      let release;
      fresh(MANAGER, { ...OK, record_sale_v2: () => new Promise((r) => { release = () => r(clone(F.record_sale_v2)); }), sale_detail: () => clone(F.sale_detail) }, pickers);
      const mA = await reload();
      await mount('/sales/new', mA);
      await d.tap(ID.starter);
      const tab = await secondTab();
      current = mA;
      await d.next();
      await d.save();
      await settle(10);
      storageEvent(draftKey('manager'));
      await settle(10);
      release();
      await settle(40);
      current = tab.mB;
      storageEvent('sales.sell.posted:u-manager:org-1');
      await settle(20);
      t.same([tab.dB.byAction('sale-frozen').length, (tab.box.textContent ?? '').includes('لا نعرف إن حُفظت')], [0, false], 'R5 حُفظت هناك: لا تبقى هنا «لا نعرف إن حُفظت»');
      tab.close();
      current = mA;
    });

    await step('R6 a code typed by hand is not added on the way; Enter adds a full code', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      const input = first('sale-search');
      for (const ch of '62600017001') {
        input.value = `${input.value ?? ''}${ch}`;
        fire(input, 'input', { timeStamp: Date.now() });
        await settle(2);
        await wait(200);
      }
      await wait(200);
      await settle();
      t.same([d.cardQty(ID.starter), first('sale-search')?.value], [null, '62600017001'], 'R6 «62600017001» بيد إنسان (وقفات بين الحروف) لا يضيف «علف بادئ» في الطريق، والمكتوب كما هو');
      d.typeIn(input, '');
      await settle();
      for (const ch of '6260001') {
        input.value = `${input.value ?? ''}${ch}`;
        fire(input, 'input', { timeStamp: Date.now() });
        await settle(2);
        await wait(200);
      }
      await wait(200);
      await settle();
      const beforeEnter = d.cardQty(ID.starter);
      fire(input, 'keydown', { key: 'Enter' });
      await settle();
      t.same([beforeEnter, d.cardQty(ID.starter)], [null, '1 كيس'], 'R6 والرمز الكامل بيد إنسان يُضاف بـEnter');
    });

    await step('R7 no whole bag beyond what is available: the first tap and the scan say «عندك … فقط»; the cart line says it at the limit', async () => {
      const low = clone(CAT);
      low.items.find((i) => i.item_id === ID.starter).available = '24.500';
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(low) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      t.same([d.cardQty(ID.starter), textOf('sell-snack'), byAction('sell-undo').length], [null, '«علف بادئ»: عندك 24.5 كغم فقط.', 0], 'R7 أوّل لمسة لا تضيف كيس 50 كغم والمتاح 24.5 كغم، وتقول ذلك');
      await d.scan('6260001');
      t.same([d.cardQty(ID.starter), textOf('sale-scan-note')], [null, '«علف بادئ»: عندك 24.5 كغم فقط.'], 'R7 والمسح كذلك');
      await unmount();
      const two = clone(CAT);
      two.items.find((i) => i.item_id === ID.starter).available = '100.000';
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(two) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openCart();
      const below = first('cart-line-limit', d.cartSheet());
      await click(first('cart-plus', d.cartSheet()));
      t.same([below, first('cart-line-limit', d.cartSheet())?.textContent, first('cart-qty', d.cartSheet())?.textContent], [null, 'عندك كيسان فقط', '2 كيس'], 'R7 السلّة: عند المتاح يقول السطر «عندك كيسان فقط»');
      await click(first('cart-plus', d.cartSheet()));
      t.same([first('cart-qty', d.cartSheet())?.textContent, first('cart-line-limit', d.cartSheet())?.textContent], ['2 كيس', 'عندك كيسان فقط'], 'R7 و«+» بعده لا يزيد والسبب ظاهر على السطر');
    });

    await step('R8 a bag resized and repriced together is asked about once', async () => {
      let reads = 0;
      fresh(MANAGER, {
        ...OK,
        sale_catalog: () => {
          reads += 1;
          const c = clone(CAT);
          if (reads >= 2) {
            const it = c.items.find((i) => i.item_id === ID.starter);
            it.units.find((u) => u.unit_id === BAG).factor = '25';
            it.sell_price = '800';
          }
          return c;
        },
        record_sale_v2: () => clone(F.record_sale_v2),
        sale_detail: () => clone(F.sale_detail),
      }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(30);
      await click(first('prices-update'));
      await settle(10);
      await d.save();
      await settle(30);
      t.same([byAction('prices-changes').length, named('record_sale_v2').map((a) => [a.p_lines[0].factor, a.p_lines[0].unit_price])], [0, [['25.000000', '20000.00']]], 'R8 «اعتمد» على الحجم الجديد وسعره معاً: لا سؤال ثانٍ بسعر «قبل» لم يره البائع، ويُرسل 20,000 للكيس الجديد');
    });

    await step('R9 an invoice found void is not announced as saved', async () => {
      remember('manager', { store: 'w-gen' });
      const voided = clone(F.sale_detail);
      voided.status = 'void';
      let calls = 0;
      fresh(MANAGER, {
        ...OK,
        record_sale_v2: () => {
          calls += 1;
          if (calls === 1) throw new Error('connection reset after commit');
          if (calls === 2) throw new current.RejectedError('id_conflict', 'سُجّلت هذه الفاتورة من قبل ثمّ أُلغيت. سجّل فاتورة جديدة.');
          return clone(F.record_sale_v2);
        },
        // الملغاة هي الأولى وحدها؛ الفاتورة الجديدة (النداء الثالث) مرحَّلة، وإلّا أسقطت صفحتها «?done=1» لأنّها ملغاة (مراجعة الجولة ٢ Q4).
        sale_detail: () => clone(calls >= 3 ? F.sale_detail : voided),
      }, pickers);
      await mount('/sales/new');
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(30);
      await click(first('sale-retry'));
      await settle(30);
      t.same(
        [globalThis.__ux.toasts.length, where(), d.cardQty(ID.starter), failureShown()],
        [0, '/sales/new', '1 كيس', 'سُجّلت هذه الفاتورة من قبل ثمّ أُلغيت. سجّل فاتورة جديدة.'],
        'R9 وُجدت ملغاة: لا «حُفظت»، ورسالة الخادم كما هي، والسلّة باقية',
      );
      await d.next();
      await d.save();
      await settle(30);
      const [a, , c] = named('record_sale_v2');
      t.same([c?.p_sale_id !== a?.p_sale_id, c?.p_client_ref !== a?.p_client_ref, where()], [true, true, '/sales/s-7?done=1'], 'R9 والإرسال التالي بمعرّف فاتورة ومرجع جديدين');
    });

    await step('R10 no customer can be picked or added while saving', async () => {
      let resolve;
      fresh(MANAGER, { ...OK, record_sale_v2: () => new Promise((r) => { resolve = r; }), sale_detail: () => clone(F.sale_detail) }, { searchSuppliers: () => ({ parties: [], total: 0 }), supplierTwins: () => [], createCustomer: (name) => ({ id: 'p-new', name }) });
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      await d.save();
      await settle(10);
      d.typeIn(first('sale-party-search'), 'زبون جديد');
      await settle(20);
      const create = first('create-party');
      if (create) await click(create);
      t.same(
        [first('sale-party-search')?.hasAttribute('readonly'), first('party-walk-in')?.hasAttribute('disabled'), named('createCustomer').length],
        [true, true, 0],
        'R10 أثناء الحفظ: بحث «لمن؟» للقراءة وحدها، والشرائح مقفلة، ولا زبون يُضاف',
      );
      resolve(clone(F.record_sale_v2));
      await settle(40);
    });

    await step('R12 Q6 two-line labels below 380px; the note says it prints on the invoice', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openCart();
      t.ok(descendants(d.cartSheet()).some((n) => n.localName === 'label' && n.textContent === 'ملاحظة تظهر على الفاتورة (اختياريّة)'), 'Q6 الملاحظة تُطبع على ورقة الزبون، واسم خانتها يقول ذلك');
      t.ok(/@media \(max-width: 379px\) \{[^@]*\.sl-store \.sl-ellipsis,\s*\.sl-pad-title \{[^}]*-webkit-line-clamp: 2;/u.test(CSS), 'R12 تحت 380 بكسل اسم المخزن وعنوان لوحة الدفع سطران لا «…»');
    });

    // ═══ المراجعة الثالثة: أساس جديد للوحة المفاتيح والماسح (T1–T9، وS7 وR1 وR2 وR11 من جديد). كلّ حكم فشل على 9d856ce. ═══

    /** يفتح سطر المادّة من لوحة المفاتيح: العدّاد مركَّز ثمّ Enter (نقرة detail = 0). */
    const openByKeyboard = async (item) => {
      const qty = first('card-qty', d.cell(item));
      qty.focus?.();
      fire(qty, 'click', { detail: 0 });
      await settle();
    };
    /** مفاتيح الجهاز على المركَّز الآن، بلا انتظار (لا إمساك في الأساس الجديد). */
    const typeKeys = async (text) => {
      for (const ch of [...text]) {
        hwKey(ch, Date.now());
        await settle(2);
      }
    };
    /** ماسح بطيء (بلوتوث): حرف كلّ gap ms فعلاً، ثمّ Enter إن طُلب. */
    const scanSlow = async (code, gap, enter = true) => {
      for (const ch of [...code]) {
        hwKey(ch, Date.now());
        await wait(gap);
      }
      if (enter) hwKey('Enter', Date.now());
      await settle(10);
    };
    const screen = () => first('sale-checkout');

    await step('S7 a hardware keyboard types into the focused display, keys apply at once', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await openByKeyboard(ID.starter);
      const focused = globalThis.document.activeElement === first('line-display', d.lineSheet());
      hwKey('4', Date.now());
      await settle();
      const typed = d.display();
      hwKey('Backspace', Date.now());
      hwKey('\u{0663}', Date.now());
      await settle();
      const arabic = d.display();
      hwKey('Enter', Date.now());
      await settle(10);
      t.same([focused, typed, arabic, d.lineSheet() === null, d.cardQty(ID.starter)], [true, '4', '3', true, '3 كيس'], 'S7 سطر فُتح من لوحة المفاتيح: قيمته مركَّزة، و«4» تُكتب فوراً، والحذف والأرقام الهندية، وEnter «تم»');
    });

    await step('R1 a hardware comma separates thousands, it is never the decimal point', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await openByKeyboard(ID.starter);
      fire(d.pick('line-tab', 'data-tab', 'price', d.lineSheet()), 'click', { detail: 0 });
      await settle();
      await typeKeys('35,000');
      const shown = d.display();
      fire(d.pick('line-tab', 'data-tab', 'qty', d.lineSheet()), 'click', { detail: 0 });
      await settle();
      await typeKeys('1,500');
      t.same([shown, d.display()], ['35,000', '1,500'], 'R1 «35,000» من لوحة المفاتيح خمسة وثلاثون ألفاً لا 35.00، و«1,500» ألف وخمسمئة لا 1.5 (التبويب من لوحة المفاتيح يعيد التركيز إلى القيمة)');
      await typeKeys('.5');
      t.eq(d.display(), '1,500.5', 'R1 والنقطة وحدها فاصلة الكسر');
    });

    await step('R2 T1 a scanner with a touch-opened pad is scanned at any speed, never written into the pad', async () => {
      const withCodes = clone(CAT);
      withCodes.items.find((i) => i.item_id === ID.grower).alt_codes = ['55501'];
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(withCodes) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await d.tab('price');
      await scanSlow('55501', 45);
      t.same(
        [storedLine(0)?.price, storedLine(1)?.itemId, d.lineSheet() === null],
        ['35000', ID.grower, true],
        'T1 ماسح بلوتوث بحرف كلّ 45 مللي ثانية وEnter، وتبويب السعر مفتوح باللمس: السعر كما هو، والمادّة الممسوحة في الفاتورة، والورقة مطويّة',
      );
      await d.openLineOf(ID.starter);
      await scanSlow('6260001', 50, false);
      await wait(350);
      await settle();
      t.same([storedLine(0)?.qty, d.cardQty(ID.starter), d.lineSheet() === null], ['2', '2 كيس', true], 'T1 وماسح بطيء بلا Enter وتبويب الكمية مفتوح: رمز من موادّ المخزن يُمسح بعد السكون (كيس آخر) لا يصير الكمية');
      await d.next();
      await d.party('أبو');
      await d.payKind('part');
      await scanSlow('6260000000024', 5);
      t.eq(JSON.parse(local.api.getItem(draftKey('manager')))?.body?.draft?.legs?.[0]?.amount ?? '', '', 'R2 ولوحة «جزء الآن»: الرمز لا يصير المبلغ المدفوع');
    });

    await step('R11 T9 Enter on a focused control does its own action; «تم» only in the focused display', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      const five = d.pick('key', 'data-key', '5', d.lineSheet());
      const down = fire(five, 'pointerdown', { button: 0, pointerType: 'touch' });
      fire(five, 'click', { button: 0, detail: 1 });
      await settle();
      five.focus?.();
      const enterOnKey = fire(five, 'keydown', { key: 'Enter' });
      await settle(10);
      t.same([down.defaultPrevented, enterOnKey.defaultPrevented, d.lineSheet() !== null, d.display()], [true, false, true, '5'], 'R11 مفتاح اللوحة لا يأخذ التركيز باللمس، وEnter عليه لا يُختطف ولا يضغطه مرّة ثانية (لا 55)');
      const chip = d.pick('line-unit', 'data-unit', '', d.lineSheet());
      chip.focus?.();
      const enterOnChip = fire(chip, 'keydown', { key: 'Enter' });
      await settle(10);
      t.same([enterOnChip.defaultPrevented, d.lineSheet() !== null], [false, true], 'T9 Enter على شريحة وحدة مركَّزة لها (يختارها المتصفّح)، لا «تم» يغلق الورقة');
      first('line-display', d.lineSheet()).focus?.();
      hwKey('Enter', Date.now());
      await settle(10);
      t.same([d.lineSheet() === null, d.cardQty(ID.starter)], [true, '5 كيس'], 'R11 وEnter في القيمة المركَّزة «تم»');
    });

    await step('T2 two Enter-less scans in a row into the search are both added', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      const scanInto = async (code) => {
        const input = first('sale-search');
        let at = Date.now() + 5_000;
        for (const ch of code) {
          input.value = `${input.value ?? ''}${ch}`;
          fire(input, 'input', { timeStamp: at });
          at += 5;
          await settle(2);
        }
        await wait(250);
        await settle(10);
      };
      await scanInto('6260001');
      const one = [d.cardQty(ID.starter), first('sale-search')?.value];
      await scanInto('6260001');
      const two = [d.cardQty(ID.starter), first('sale-search')?.value];
      await d.scan('6260001');
      await scanInto('6260001');
      t.same([one, two, d.cardQty(ID.starter), first('sale-search')?.value], [['1 كيس', ''], ['2 كيس', ''], '4 كيس', ''], 'T2 مسحان بلا Enter في البحث (ومسح بـEnter ثمّ مسح بلاه): كلّها تُضاف، والبحث فارغ بعد كلّ مسح');
    });

    await step('T5 a scan after a scan, and a scan after «تم», are added wherever focus is', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await d.tab('price');
      await scanSlow('6260001', 5);
      const afterFirst = [d.cardQty(ID.starter), d.lineSheet() === null];
      first('card-qty', d.cell(ID.starter)).focus?.();
      await scanSlow('6260001', 5);
      const afterSecond = [d.cardQty(ID.starter), d.lineSheet() === null];
      await d.openLineOf(ID.starter);
      await d.done();
      await scanSlow('6260001', 5);
      t.same([afterFirst, afterSecond, d.cardQty(ID.starter), d.lineSheet() === null], [['2 كيس', true], ['3 كيس', true], '4 كيس', true], 'T5 مسح بعد مسح (والتركيز على العدّاد) ومسح بعد «تم»: يُضاف كلّ مرّة، وEnter الماسح لا يفتح السطر');
    });

    await step('T6 auto-repeat: a held digit types in the focused display and is not a scan elsewhere', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await openByKeyboard(ID.starter);
      fire(d.pick('line-tab', 'data-tab', 'price', d.lineSheet()), 'click', { detail: 0 });
      await settle();
      hwKey('5', Date.now());
      fire(globalThis.document.activeElement, 'keydown', { key: '0', timeStamp: Date.now() });
      for (let i = 0; i < 5; i += 1) fire(globalThis.document.activeElement, 'keydown', { key: '0', timeStamp: Date.now(), repeat: true });
      await settle();
      t.same([d.display(), d.lineSheet() !== null, textOf('sale-scan-note')], ['5,000,000', true, null], 'T6 مسك الصفر في القيمة المركَّزة يكتب أصفاراً، ولا مسح');
      hwKey('Enter', Date.now());
      await settle(10);
      screen().focus?.();
      fire(screen(), 'keydown', { key: '6' });
      for (let i = 0; i < 5; i += 1) fire(screen(), 'keydown', { key: '6', repeat: true });
      await wait(350);
      await settle();
      t.same([textOf('sale-scan-note'), first('sale-search')?.value], [null, '6'], 'T6 ومسكه خارج اللوحة حرف واحد يذهب إلى البحث، لا «لا مادّة بالباركود 666666»');
    });

    await step('T4 Escape right after a digit in the focused display keeps the digit', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await openByKeyboard(ID.starter);
      hwKey('2', Date.now());
      hwKey('5', Date.now());
      hwKey('Escape', Date.now());
      await settle(10);
      t.same([d.lineSheet() === null, storedLine(0)?.qty, d.cardQty(ID.starter)], [true, '25', '25 كيس'], 'T4 «25» ثمّ Esc فوراً: السطر 25');
    });

    await step('T3 a touch on the payment amount does not leave it focused, and a second tap keeps what was typed', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await d.next();
      await d.party('أبو');
      await d.payKind('part');
      await d.keys('5');
      const amount = first('pay-amount', d.paySheet());
      const down = fire(amount, 'pointerdown', { button: 0, pointerType: 'touch' });
      fire(amount, 'click', { button: 0, detail: 1 });
      await settle();
      await d.keys('0');
      const received = [first('pay-discount', d.paySheet())].map((n) => fire(n, 'pointerdown', { button: 0, pointerType: 'touch' }).defaultPrevented);
      t.same([down.defaultPrevented, received[0], JSON.parse(local.api.getItem(draftKey('manager')))?.body?.draft?.legs?.[0]?.amount], [true, true, '50'], 'T3 لمس المبلغ لا يتركه مركَّزاً، ولمسه ثانيةً والخانة مفتوحة لا يمحو «5» (50 لا 0)');
    });

    await step('K a keyboard-opened sheet types straight into its display; focus returns where it came from', async () => {
      fresh(MANAGER, OK, pickers);
      await mount('/sales/new?store=w-gen');
      await d.tap(ID.starter);
      await openByKeyboard(ID.starter);
      hwKey('7', Date.now());
      await settle();
      const typed = d.display();
      hwKey('Escape', Date.now());
      await settle(10);
      // يعيده Sheet (trapFocus) إلى ما فتحها؛ والشاشة لا تسحبه إلى البحث (DOM الفحص بلا isConnected، فالإعادة نفسها تُرى في Chromium).
      const back = globalThis.document.activeElement !== screen() && globalThis.document.activeElement !== first('sale-search');
      await d.openLineOf(ID.starter);
      await d.done();
      t.same([typed, back, globalThis.document.activeElement === screen()], ['7', true, true], 'K من لوحة المفاتيح: «7» في القيمة فوراً، وEsc لا يسحب التركيز من فاتحها؛ ومن اللمس: «تم» يعيده إلى الشاشة لا إلى العدّاد');
    });

    await step('T7 a weighed item with less than a kilo, and «أضف سطراً آخر» at the last bag, stay within stock', async () => {
      const low = clone(CAT);
      const grower = low.items.find((i) => i.item_id === ID.grower);
      grower.alt_codes = ['55501'];
      grower.available = '0.400';
      low.items.find((i) => i.item_id === ID.starter).available = '50.000';
      fresh(MANAGER, { ...OK, sale_catalog: () => clone(low) }, pickers);
      await mount('/sales/new?store=w-gen');
      await d.scan('55501');
      t.same([d.cardQty(ID.grower), textOf('sale-scan-note')], [null, '«علف نامي»: عندك 0.4 كغم فقط.'], 'T7 مسح موزون ومتاحه 0.4 كغم: لا سطر بكيلو، و«عندك … فقط»');
      await d.tap(ID.grower);
      t.same([d.cardQty(ID.grower), d.display(), d.lineSheet() !== null], ['0.4 كغم', '0.4', true], 'T7 ولمسه: السطر بالمتاح كلّه وورقته مفتوحة لكتابة الكمية');
      await d.done();
      await d.tap(ID.starter);
      await d.openLineOf(ID.starter);
      await click(first('line-add-another', d.lineSheet()));
      t.same([JSON.parse(local.api.getItem(draftKey('manager')))?.body?.draft?.lines?.filter((l) => l.itemId === ID.starter).length, textOf('sell-snack')], [1, '«علف بادئ»: عندك كيس واحد فقط.'], 'T7 «أضف سطراً آخر» والكيس الوحيد في الفاتورة: لا سطر ثانٍ، ويُقال لماذا');
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
