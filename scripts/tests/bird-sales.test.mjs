// فاتورة الطيور BR (0028، الوكيل ب للمبيعات والمال؛ عقد scratchpad/reports/contract-0028.md §4.4–§4.5 و§5.4–§5.5 و§6 و§10 و§11): react-dom الحقيقي على DOM
// صغير (dom.mjs) يشغّل مسارات المبيعات الحقيقية (SalesRoutes: «أصدر الفاتورة» /sales/birds/new?ticket= والفاتورة /sales/birds/:id وقائمة المبيعات)،
// وrepo الحقيقي (birdSales: المحلّلات وبناء النداء والطلب المعلَّق) على core بديل يجيب بأجوبة العقد (fixtures/bird-sales-contract.json، مكتوبة باليد قبل
// الهجرة)، والجلسة والتنبيه وبحث الجهات والصناديق بدائل. وكلّ نسخة من الحزمة ذاكرة جديدة (= إعادة تحميل الصفحة)، وsessionStorage بالذاكرة يبقى بينهما.
// S التوصيل: المساران في SalesRoutes، ووحدة الصفحات في write-guard لا يصدّرها repo/index، وقاموس القيود بأسماء العقد §2.5–§2.6، وتسمية الحزم المشتركة.
// P المحلّلات: النموذج والفاتورة وتفصيلها والإلغاء ومفتاحا birds؛ والشكل الغريب خطأ يسمّي خانته؛ وخادم قبل 0028 بلا birds = null؛ والمال المحجوب null.
// M المعاينة = مرآة الخادم: G4 (4,079.500 و11,214,546 والحصّتان 4,923,459 و6,291,087) وG1، ونسبة التنزيل من النصّ.
// N «أصدر الفاتورة»: الجدول والسعر المقترح والتاجر والتنزيل والمعاينة الحيّة وحصّة كلّ قاعة والمقبوض بصندوقه والباقي، والتأكيد يسمّي النتيجة، والنداء
//   بمفاتيح العقد، والنتيجة ← صفحة الفاتورة.
// U النتيجة المجهولة (درس 2026-11-10): الطلب خارج المكوّن قبل أن يخرج، والصفحة مجمَّدة به بعد إعادة التحميل، والإعادة بالطلب نفسه حرفاً؛ والرفض الأكيد
//   يعيد ما أُرسل إلى الخانات بمرجع جديد (ومعرّف فاتورة جديد بعد id_conflict) ويقرأ النموذج من جديد.
// B الحالات الممنوعة: طيور أكثر من الحيّ، وصدرت الفاتورة، وفوج مغلق، ودور لا يصدر، وبلا تذكرة. V أخطاء الخانات.
// D الفاتورة: الورقة A5 بالمبلغ كتابةً والتواقيع وطباعتها بعنوانها، و«ألغِ الفاتورة» للمدير بتأكيده ونداءه، وتلميح الخادم لفوج مغلق، والإعادة بعد نتيجة
//   مجهولة بالسبب والمرجع نفسيهما، والملغاة بختمها والمقبوض الباقي رصيداً، والفوج المغلق بجملته.
// L قائمة المبيعات: «تذاكر وزن بانتظار الفاتورة» بـ«أصدر الفاتورة» لمن يصدرها، وفواتير الطيور بمجاميعها، والتقرير بمجموعات الطيور، وخادم قبل 0028.
// X أجوبة القاعدة الحقيقية (fixtures/birds-0028.json من supabase/tests/birds.test بـBIRDS_SAMPLES_OUT=1) بالمحلّلات الحقيقية والمرآة، حين توجد.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'bird-sales-contract.json'), 'utf8'));
const REAL_PATH = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
const clone = (value) => JSON.parse(JSON.stringify(value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__bs.call('${n}', a);`).join(' ')}`;
const STUBS = {
  session: 'export const useSession = () => globalThis.__bs.session; export const sessionStore = { get: () => globalThis.__bs?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__bs.toasts.push(spec); }; export function Toaster() { return null; }',
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createSupplier', 'createCustomer', 'listBoxes']),
};
const CORE_FOR = /src\/lib\/repo\/(?:birdSales|purchases|weighTickets|statement)\.ts$/u;
const CORE = 'export const call = (fn, args) => globalThis.__bs.rpc(fn, args);';
const plugins = [
  {
    name: 'bs-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/repo\/purchasing$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'bs-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'bs-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      // repo الحقيقي يبني النداء ويقرأ الجواب؛ core بديل لوحدات المبيعات وحدها يسجّل النداء ويجيب (غيرها بـcore الحقيقي، لا تنادي في هذه الفحوص).
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'bs-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'bs-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
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
    "export * as birds from './src/lib/repo/birdSales.ts';",
    "export { BIRD_SALES_CONSTRAINT_HINTS } from './src/lib/repo/constraints-birdsales.ts';",
    "export { constraintHint } from './src/lib/repo/constraints.ts';",
    "export { birdPreview, parseDeduction, consequenceText } from './src/pages/sales/BirdSaleNew.tsx';",
    "export { birdBack, birdsText } from './src/pages/sales/birdParts.tsx';",
    "export { billedKg, saleTotal, revenueSplit } from './src/domain/weighTicket.ts';",
    "export { amountInWords } from './src/domain/amountWords.ts';",
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
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins,
  });
  bundles += 1;
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// bird-sales bundle ${bundles}\n`).toString('base64')}`);
}

function memoryStorage() {
  const map = new Map();
  return { map, api: { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), clear: () => map.clear() } };
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const within = (node, name) => (node ? descendants(node).filter((n) => n.getAttribute('data-action') === name) : []);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const text = () => body().textContent;
const href = (node) => node?.getAttribute('href') ?? null;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
const inputBy = (suffix) => all().find((n) => (n.localName === 'input' || n.localName === 'select') && (n.getAttribute('id') ?? '').endsWith(suffix)) ?? null;
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  if (!select) throw new Error('no select');
  select.value = value;
  fire(select, 'change');
};
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click', { button: 0 });
  await settle();
};
const dialog = () => all().filter((n) => n.getAttribute('role') === 'dialog').at(-1) ?? null;
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, tag) => (table ? descendants(table).find((n) => n.localName === tag) : null);
const rowsOf = (caption) => {
  const tbody = section(tableOf(caption), 'tbody');
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const footOf = (caption) => {
  const tfoot = section(tableOf(caption), 'tfoot');
  return tfoot ? tfoot.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const headersOf = (caption) => (tableOf(caption) ? descendants(tableOf(caption)).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null);

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role),
  canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: !['hall_worker', 'mill_operator', 'hatchery_operator'].includes(role), invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const sessionOf = (role) => ({ status: 'ready', workspace: ws(role), offline: false });
const ACCOUNTANT = sessionOf('accountant');
const MANAGER = sessionOf('manager');
const KEEPER = sessionOf('storekeeper');

const FORM = F.bird_sale_form;
const TICKET = FORM.ticket;
const SALE = F.record_bird_sale;
const PARTY = { id: SALE.party_id, name: SALE.party_name };
const BOX = { id: SALE.cash_account_id, name: SALE.account_name };
const NEW_URL = `/sales/birds/new?ticket=${TICKET.id}&back=%2Fsales`;
const PENDING_KEY = `sales.birds.pending:u-accountant:org-1:${TICKET.id}`;
const CONFIRM_TEXT =
  'تُسجَّل فاتورة BR بمبلغ 11,214,546 دينار على حساب «أبو حيدر للدواجن»، وتخرج 800 طير من «قاعة 1» و1,000 طير من «قاعة 2». ويُقبض الآن 5,000,000 دينار في «صندوق البيع»، ويبقى 6,214,546 دينار على حسابه.';

export default async function (t) {
  const restore = installDom();
  const saved = { session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
  const session = memoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: session.api, configurable: true, writable: true });
  const printed = [];
  globalThis.window.print = () => printed.push(globalThis.document.title);
  globalThis.window.addEventListener = globalThis.window.addEventListener ?? (() => {});
  let root = null;
  let m = null;
  let current = null;
  try {
    m = await bundle();
    current = m;
    m.onlineStore.set(true);
    let log = [];
    const fresh = (who, rpcs = {}, calls = {}) => {
      log = [];
      globalThis.__bs = {
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
      };
      return log;
    };
    const named = (fn) => log.filter(([name]) => name === fn).map(([, args]) => args);
    const lastToast = () => globalThis.__bs.toasts.at(-1)?.title ?? null;
    const mount = async (url, mm = current) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = mm.createRoot(container);
      function Where() {
        const location = mm.useLocation();
        globalThis.__bs.location = `${location.pathname}${location.search}`;
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
      // الطلب المعلَّق في ذاكرة نسخة الحزمة الأولى (الاحتياط بلا sessionStorage) يُمحى مع التخزين، فلا يجمّد فحصاً بعده.
      m.birds.storeBirdSalePending(PENDING_KEY, null);
      session.map.clear();
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      current = m;
      current.onlineStore.set(true);
    };
    const formRpc = (sample = FORM) => ({ bird_sale_form: () => clone(sample) });
    const pickers = { searchSuppliers: () => ({ parties: [PARTY], total: 1 }), listBoxes: () => [BOX] };
    /** يملأ النموذج: التاجر من البحث، والتنزيل، والمقبوض (الصندوق الوحيد يُختار وحده). */
    const fill = async ({ pct = '0.5', paid = '5000000' } = {}) => {
      type(all().find((n) => n.localName === 'input' && n.getAttribute('type') === 'search'), 'أبو');
      await settle(20);
      await click(byAction('pick-party')[0]);
      type(inputBy('-pct'), pct);
      await settle();
      type(inputBy('-paid'), paid);
      await settle(20);
    };
    const submit = async () => {
      fire(byAction('bird-sale-form')[0], 'submit');
      await settle();
    };

    // ── S: التوصيل ────────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const routes = readFileSync(path.join(ROOT, 'src', 'pages', 'inventory', 'StockRoutes.tsx'), 'utf8');
      const birdNew = routes.indexOf('path="birds/new" element={<BirdSaleNewPage />}');
      const birdOne = routes.indexOf('path="birds/:id" element={<BirdSalePage />}');
      const saleOne = routes.indexOf('path=":id" element={<SaleDocPage />}');
      t.same([birdNew > 0, birdOne > birdNew, saleOne > birdOne], [true, true, true], 'S المساران في SalesRoutes (حزمة المخزون خارج التثبيت المسبق) قبل :id');
      const write = await import(pathToFileURL(path.join(ROOT, 'scripts', 'guards', 'write-guard.mjs')).href);
      const index = readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'index.ts'), 'utf8');
      t.same([write.PAGE_MODULES.has('birdSales'), index.includes('birdSales')], [true, false], 'S birdSales وحدة صفحات، وrepo/index لا يصدّرها');
      const vite = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
      const storesAdmin = vite.split('\n').find((line) => line.includes("'assets/stores-admin-[hash].js'")) ?? '';
      const office = vite.split('\n').find((line) => line.includes("'assets/accounts-office-[hash].js'")) ?? '';
      t.same([storesAdmin.includes('weighTicket|allocation'), storesAdmin.includes('weighTickets'), office.includes('domain\\/amountWords\\.ts')], [true, true, true], 'S المرآة وrepo/weighTickets (حزمتا القاعات والمخزون) باسم stores-admin، والمبلغ كتابةً (المخزون والحسابات) باسم accounts-office');
      const names = [
        'bird_sales_doc_no_check', 'bird_sales_birds_check', 'bird_sales_price_check', 'bird_sales_deduction_check', 'bird_sales_billed_check', 'bird_sales_total_check',
        'bird_sales_paid_check', 'bird_sales_payment_check', 'bird_sales_status_check', 'bird_sales_void_check', 'bird_sales_void_reason_check', 'bird_sales_note_check',
        'bird_sales_version_check', 'bird_sale_sources_qty_check', 'bird_sale_sources_revenue_check',
      ];
      t.same(Object.keys(m.BIRD_SALES_CONSTRAINT_HINTS).sort(), [...names].sort(), 'S قاموس القيود (constraints-birdsales) بأسماء العقد §2.5–§2.6 كلّها');
      t.same(
        [m.constraintHint('bird_sales_deduction_check'), m.constraintHint('bird_sale_sources_revenue_check')],
        ['نسبة التنزيل من 0 إلى 10٪، بمرتبتين عشريتين على الأكثر.', 'حصّة الفوج من الفاتورة بالدينار الصحيح من صفر فأكثر.'],
        'S القاموس مسجَّل: رفض القيد يقول جملته بالعقد',
      );
      const repo = readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'birdSales.ts'), 'utf8');
      t.ok(repo.includes("import './constraints-birdsales';") && !readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'constraints.ts'), 'utf8').includes('birdsales'), 'S القاموس يحمّله ملف وحدته وحده (حزمة المبيعات)');
    }

    // ── P: المحلّلات ──────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const form = m.birds.parseBirdSaleForm(clone(FORM));
      t.same(
        [form.ticket.id, form.ticket.ticketNo, form.ticket.version, form.ticket.netKg, form.ticket.stops.map((s) => [s.hallName, s.birds, s.netKg]), form.ticket.can, form.invoiceable, form.why, form.book, form.flocks.map((f) => [f.live, f.birds, f.overLive]), form.suggestedPrice, form.sale, form.today, form.canPost],
        [TICKET.id, 'WT-2026-0007', 5, 4100000n, [['قاعة 1', 800, 1800000n], ['قاعة 2', 1000, 2300000n]], { edit: false, finish: false, void: false, invoice: false }, true, null, { id: FORM.book.id, name: 'دفتر حقول اللحم' }, [[9730, 800, false], [5000, 1000, false]], 274900n, null, '2026-11-12', true],
        'P النموذج: التذكرة بمحلّلها (بلا أفعال)، والدفتر، والحيّ لكلّ قاعة، والسعر المقترح بالفلس',
      );
      const invoiced = m.birds.parseBirdSaleForm(clone(F.bird_sale_form_invoiced));
      t.same([invoiced.invoiceable, invoiced.why, invoiced.sale?.docNo, invoiced.canPost], [false, 'invoiced', 'BR-2026-0004', false], 'P النموذج بعد الفاتورة: لماذا وفاتورتها');
      const sale = m.birds.parseBirdSale(clone(SALE));
      t.same(
        [sale.docNo, sale.status, sale.soldOn, sale.birds, sale.netKg, sale.billedKg, sale.deduction, sale.avgKg, sale.money, sale.sources.map((s) => [s.hallName, s.birds, s.netKg, s.revenue]), sale.accountName],
        ['BR-2026-0004', 'posted', '2026-11-12', 1800, 4100000n, 4079500n, 50n, 2278n, { unitPrice: 274900n, total: 1121454600n, paidNow: 500000000n }, [['قاعة 1', 800, 1800000n, 492345900n], ['قاعة 2', 1000, 2300000n, 629108700n]], 'صندوق البيع'],
        'P الفاتورة: الطيور والصافي والمحسوب والتنزيل بالمئات والمال بالفلس وحصّة كلّ فوج',
      );
      const detail = m.birds.parseBirdSaleDetail(clone(F.bird_sale_detail));
      t.same([detail.ticket, detail.partyPhone, detail.remaining, detail.paymentKept, detail.canVoid], [{ ticketNo: 'WT-2026-0007', vehicle: '12345 بغداد', driver: 'حسين علي', method: 'scale' }, '0770 123 4567', 0n, null, true], 'P تفصيل الفاتورة: التذكرة وسيّارتها وهاتف التاجر والمتبقّي وهل تُلغى');
      const voided = m.birds.parseVoidedBirdSale(clone(F.void_bird_sale));
      t.same([voided.docNo, voided.voidedOn, voided.paymentEntryId !== null, voided.total, voided.paymentKept], ['BR-2026-0003', '2026-11-12', true, 2489987500n, 2489987500n], 'P نتيجة الإلغاء: المقبوض باقٍ رصيداً');
      const list = m.birds.parseBirdSalesSection(clone(F.sales_overview.birds));
      t.same(
        [list.rows.map((r) => [r.docNo, r.status, r.paid, r.deduction, r.money?.total]), list.totals, list.awaiting.map((a) => [a.ticketNo, a.birds, a.netKg]), list.canRecord, list.more],
        [[['BR-2026-0004', 'posted', 'partial', 50n, 1121454600n], ['BR-2026-0003', 'void', 'cash', 50n, 2489987500n]], { count: 1, voided: 1, birds: 1800, netKg: 4100000n, money: { revenue: 1121454600n, paidNow: 500000000n, credit: 621454600n } }, [['WT-2026-0009', 60, 144000n], ['WT-2026-0005', 4000, 9100000n]], true, false],
        'P مفتاح birds في قائمة المبيعات: الصفوف والمجاميع والتذاكر بانتظار الفاتورة',
      );
      const groups = m.birds.parseBirdSalesGroups(clone(F.sales_report.item.birds));
      t.same([groups.rows.map((r) => [r.key, r.label, r.count, r.birds, r.netKg, r.revenue]), groups.totals.revenue], [[['birds', 'دجاج لحم حيّ', 1, 1800, 4100000n, 1121454600n]], 1121454600n], 'P مفتاح birds في التقرير: «دجاج لحم حيّ»');
      t.same([m.birds.parseBirdSalesSection(undefined), m.birds.parseBirdSalesGroups(null)], [null, null], 'P خادم قبل 0028 بلا مفتاح birds: null لا صفر');
      const masked = clone(SALE);
      delete masked.money;
      for (const source of masked.sources) delete source.money;
      const blind = m.birds.parseBirdSale(masked);
      t.same([blind.money, blind.sources.map((s) => s.revenue)], [null, [null, null]], 'P المال المحجوب (القناع): null لا صفر');
      const shape = (label, value, parse, field) => {
        try {
          parse(value);
          t.ok(false, `P ${label}: لم يرمِ`);
        } catch (error) {
          t.same([error?.name, error?.field ?? null], [field === 'ticket' ? 'TicketShapeError' : 'BirdSaleShapeError', field === 'ticket' ? error?.field : field], `P ${label}: خطأ شكل يسمّي خانته`);
        }
      };
      shape('سعر رقماً لا نصّاً', { ...clone(SALE), money: { ...SALE.money, unit_price: 2749 } }, m.birds.parseBirdSale, 'unit_price');
      shape('حالة مجهولة', { ...clone(SALE), status: 'draft' }, m.birds.parseBirdSale, 'status');
      shape('لماذا مجهول', { ...clone(FORM), why: 'unknown' }, m.birds.parseBirdSaleForm, 'why');
      shape('دفع مجهول', { ...clone(F.sales_overview.birds), rows: [{ ...clone(F.sales_overview.birds.rows[0]), paid: 'half' }] }, m.birds.parseBirdSalesSection, 'paid');
      shape('تذكرة بلا وقفات', { ...clone(FORM), ticket: { ...clone(TICKET), stops: null } }, m.birds.parseBirdSaleForm, 'ticket');
    }

    // ── M: المعاينة = مرآة الخادم ───────────────────────────────────────────────────────────────────────────────────────
    {
      const form = m.birds.parseBirdSaleForm(clone(FORM));
      const preview = m.birdPreview(form.ticket, 50n, 274900n);
      const sale = m.birds.parseBirdSale(clone(SALE));
      t.same(
        [preview.billedKg, preview.total, preview.shares],
        [sale.billedKg, sale.money.total, sale.sources.map((s) => s.revenue)],
        'M G4: المعاينة = الفاتورة (4,079.500 و11,214,546 والحصّتان بأكبر الباقي بالصافي)',
      );
      t.same([preview.billedKg, preview.total, preview.shares], [4079500n, 1121454600n, [492345900n, 629108700n]], 'M G4 بالأرقام: 4,079.500 كغم، و11,214,546 دينار، و4,923,459 + 6,291,087');
      const one = { netKg: 9100000n, stops: [{ netKg: 9100000n }] };
      const g1 = m.birdPreview(one, 50n, 275000n);
      t.same([g1.billedKg, g1.total, g1.shares], [9054500n, 2489987500n, [2489987500n]], 'M G1: 9,054.500 كغم × 2,750 = 24,899,875');
      t.same([m.birdPreview(form.ticket, 0n, 274900n).total, m.birdPreview({ netKg: null, stops: [] }, 0n, 100n), m.birdPreview({ netKg: 1000n, stops: [{ netKg: 1000n }] }, 0n, 1n).total], [1127090000n, null, 0n], 'M بلا تنزيل الصافي كلّه، وبلا صافٍ لا معاينة، والمبلغ الصغير يُقرَّب إلى صفر');
      t.same(['0.5', '0.50', '10', '0', '٠٫٥', '10.01', '-1', '0.505', 'x'].map((text) => m.parseDeduction(text)), [50n, 50n, 1000n, 0n, 50n, null, null, null, null], 'M نسبة التنزيل من النصّ: بمرتبتين من 0 إلى 10٪، والأرقام الشرقية تُقرأ');
    }

    // ── N: «أصدر الفاتورة» ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('N', async () => {
      fresh(ACCOUNTANT, { ...formRpc(), record_bird_sale: () => clone(SALE), bird_sale_detail: () => clone(F.bird_sale_detail) }, pickers);
      await mount(NEW_URL);
      t.same(named('bird_sale_form'), [{ p_ticket: TICKET.id }], 'N النداء بمعرّف التذكرة');
      t.eq(all().find((n) => n.localName === 'h1')?.textContent, 'فاتورة طيور للتذكرة WT-2026-0007', 'N العنوان باسم التذكرة');
      t.ok(text().includes('الحقل: حقل الأمير، يوم الفاتورة: 12/11/2026 (يوم التذكرة)، الحساب: دفتر حقول اللحم'), 'N الحقل ويوم الفاتورة = يوم التذكرة والحساب');
      const caption = 'قاعات التذكرة WT-2026-0007';
      t.same(headersOf(caption), ['القاعة', 'الطيور', 'الصافي (كغم)', 'معدّل الطير (كغم)', 'الحيّ الآن', 'الحصّة (دينار)'], 'N جدول القاعات بأعمدته (والحصّة لأنّ السعر مقترح)');
      t.same(rowsOf(caption), [['قاعة 1', '800', '1,800', '2.250', '9,730', '4,948,200'], ['قاعة 2', '1,000', '2,300', '2.300', '5,000', '6,322,700']], 'N كلّ قاعة بطيورها وصافيها ومعدّلها وحيّها، والحصّة بالسعر المقترح بلا تنزيل');
      t.eq(inputBy('-price')?.value, '2749', 'N سعر الكيلو من آخر فاتورة طيور');
      t.eq(textOf('bird-price-suggested'), 'من آخر فاتورة طيور؛ عدّله إن بعت بغيره.', 'N جملة السعر المقترح (تبقى مع قراءة المبلغ تحت الخانة)');
      t.eq(textOf('bird-preview'), 'الصافي 4,100 كغم، الوزن المحسوب 4,100 كغم × 2,749 دينار = 11,270,900 دينار', 'N المعاينة بلا تنزيل');
      t.eq(byAction('pick-box').length, 0, 'N بلا مقبوض لا صندوق (بالدين افتراضاً، O7)');
      await fill();
      t.eq(textOf('bird-preview'), 'الصافي 4,100 كغم بعد تنزيل 0.50٪، الوزن المحسوب 4,079.5 كغم × 2,749 دينار = 11,214,546 دينار', 'N المعاينة الحيّة بالتنزيل (القاعدة 26)');
      t.same(rowsOf(caption).map((row) => row[5]), ['4,923,459', '6,291,087'], 'N حصّة كلّ قاعة بأكبر الباقي بصافيها');
      t.same(footOf(caption)?.[0]?.slice(-1), ['11,214,546'], 'N ومجموع الحصص = المبلغ');
      t.same([byAction('pick-box').length, (byAction('pick-box')[0]?.options ?? []).map((option) => option.textContent)], [1, ['اختر الصندوق', BOX.name]], 'N المقبوض يُظهر الصندوق (والوحيد يُختار وحده: يسمّيه التأكيد ويُرسل في النداء)');
      t.eq(textOf('bird-credit'), 'الباقي على الحساب: 6,214,546 دينار', 'N الباقي على الحساب');
      t.eq(textOf('bird-sale-submit'), 'أصدر الفاتورة بـ11,214,546 دينار', 'N الزرّ يسمّي المبلغ');
      await submit();
      t.eq(within(dialog(), 'bird-confirm-text')[0]?.textContent, CONFIRM_TEXT, 'N التأكيد يسمّي المبلغ والتاجر والطيور الخارجة من كلّ قاعة والمقبوض والباقي');
      t.eq(named('record_bird_sale').length, 0, 'N لا نداء قبل التأكيد');
      await click(byAction('bird-sale-confirm')[0]);
      await settle(40);
      const [args] = named('record_bird_sale');
      t.same(
        { ...args, p_client_ref: UUID.test(args?.p_client_ref ?? ''), p_sale_id: UUID.test(args?.p_sale_id ?? '') },
        { p_client_ref: true, p_sale_id: true, p_ticket: TICKET.id, p_ticket_version: 5, p_party: PARTY.id, p_unit_price: '2749.00', p_deduction_pct: '0.50', p_paid_now: '5000000', p_cash_account: BOX.id, p_note: null },
        'N النداء بمفاتيح العقد: المرجع ومعرّف الفاتورة من الجهاز، ونسخة التذكرة شرطاً، والمبالغ نصوصاً ثابتة المراتب',
      );
      t.eq(globalThis.__bs.location, `/sales/birds/${SALE.id}?back=%2Fsales`, 'N النتيجة ← صفحة الفاتورة بطريق الرجوع');
      t.eq(lastToast(), 'صدرت الفاتورة BR-2026-0004 بمبلغ 11,214,546 دينار على «أبو حيدر للدواجن».', 'N التنبيه برقم الفاتورة ومبلغها');
      t.eq(session.map.has(PENDING_KEY), false, 'N الطلب يُمحى بعد الجواب');
    });

    await step('N credit', async () => {
      fresh(ACCOUNTANT, { ...formRpc(F.bird_sale_form_no_suggestion), record_bird_sale: () => clone(SALE) }, pickers);
      await mount(NEW_URL);
      t.same([inputBy('-price')?.value, textOf('bird-preview'), headersOf('قاعات التذكرة WT-2026-0007')?.length], ['', 'المبلغ: اكتب سعر الكيلو', 5], 'N بلا فاتورة طيور سابقة: السعر فارغ وبلا معاينة ولا عمود حصّة');
      await fill({ pct: '', paid: '' });
      type(inputBy('-price'), '2,750');
      await settle();
      await submit();
      t.eq(
        within(dialog(), 'bird-confirm-text')[0]?.textContent,
        'تُسجَّل فاتورة BR بمبلغ 11,275,000 دينار على حساب «أبو حيدر للدواجن»، وتخرج 800 طير من «قاعة 1» و1,000 طير من «قاعة 2». والمبلغ كلّه بالدين على حسابه.',
        'N بالدين كلّه: التأكيد يقوله',
      );
      await click(byAction('bird-sale-confirm')[0]);
      await settle(40);
      t.same([named('record_bird_sale')[0]?.p_deduction_pct, named('record_bird_sale')[0]?.p_paid_now, named('record_bird_sale')[0]?.p_cash_account, named('record_bird_sale')[0]?.p_unit_price], ['0.00', '0', null, '2750.00'], 'N بلا تنزيل ولا مقبوض: صفران وبلا صندوق');
    });

    // ── V: أخطاء الخانات ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('V', async () => {
      fresh(ACCOUNTANT, formRpc(), { ...pickers, listBoxes: () => [BOX, { id: 'box-2', name: 'الصندوق الرئيسي' }] });
      await mount(NEW_URL);
      await submit();
      t.same([dialog(), text().includes('اختر التاجر، أو أضفه باسمه.')], [null, true], 'V بلا تاجر: لا تأكيد، والخطأ يسمّيه');
      await fill({ pct: '11', paid: '20000000' });
      t.eq(byAction('bird-price-suggested').length, 1, 'V جملة السعر المقترح ما دام السعر لم يُلمس');
      type(inputBy('-price'), '2749');
      await settle();
      t.eq(byAction('bird-price-suggested').length, 0, 'V وتزول حين يُكتب السعر');
      await submit();
      t.same(
        [text().includes('نسبة التنزيل من 0 إلى 10٪، بمرتبتين عشريتين على الأكثر.'), text().includes('المقبوض الآن مبلغ بالدينار الصحيح من صفر'), textOf('bird-preview'), dialog()],
        [true, false, 'المبلغ: اكتب سعر الكيلو', null],
        'V تنزيل فوق 10٪ مرفوض بجملة الخادم نفسها، وبلا معاينة (ولا حدّ للمقبوض بعد)',
      );
      type(inputBy('-paid'), '12.5');
      await settle(20);
      t.ok(text().includes('المقبوض الآن مبلغ بالدينار الصحيح من صفر فأكثر.'), 'V مقبوض بكسر مرفوض: دينار صحيح');
      type(inputBy('-paid'), '20000000');
      type(inputBy('-pct'), '0.5');
      await settle(20);
      t.ok(text().includes('المقبوض الآن مبلغ بالدينار الصحيح من صفر حتى مبلغ الفاتورة (11,214,546 دينار).'), 'V مقبوض أكثر من المبلغ مرفوض بحدّه');
      type(inputBy('-paid'), '1000');
      await settle(20);
      await submit();
      t.same([dialog(), text().includes('اختر الصندوق الذي قبضت فيه.')], [null, true], 'V صندوقان: يُختار الصندوق صراحةً');
      choose(byAction('pick-box')[0], 'box-2');
      await settle();
      await submit();
      t.ok(dialog() !== null && within(dialog(), 'bird-confirm-text')[0]?.textContent.includes('ويُقبض الآن 1,000 دينار في «الصندوق الرئيسي»'), 'V ثمّ التأكيد بالصندوق المختار');
    });

    // ── U: النتيجة المجهولة خارج المكوّن ───────────────────────────────────────────────────────────────────────────────
    await step('U', async () => {
      let release = null;
      fresh(ACCOUNTANT, { ...formRpc(), record_bird_sale: () => new Promise((_, reject) => { release = reject; }) }, pickers);
      await mount(NEW_URL);
      await fill();
      await submit();
      await click(byAction('bird-sale-confirm')[0]);
      await settle();
      t.same([session.map.has(PENDING_KEY), JSON.parse(session.map.get(PENDING_KEY) ?? 'null')?.request?.ticketId], [true, TICKET.id], 'U الطلب محفوظ خارج المكوّن قبل أن يعود الجواب');
      release(new current.UnknownOutcomeError());
      await settle(40);
      t.ok(byAction('bird-sale-frozen').length === 1 && byAction('bird-sale-retry').length === 1, 'U نتيجة مجهولة: الصفحة مجمَّدة بطلبها و«أعد المحاولة» وحدها');
      t.eq(textOf('bird-sale-sent'), `المرسَل: ${CONFIRM_TEXT}`, 'U وتقول ما أُرسل');
      const first = named('record_bird_sale')[0];
      await unmount();
      // إعادة التحميل: نسخة جديدة من الحزمة (ذاكرة جديدة)، وsessionStorage باقٍ.
      current = await bundle();
      current.onlineStore.set(true);
      fresh(ACCOUNTANT, { ...formRpc(), record_bird_sale: () => clone(SALE), bird_sale_detail: () => clone(F.bird_sale_detail) }, pickers);
      await mount(NEW_URL);
      t.ok(byAction('bird-sale-frozen').length === 1 && textOf('bird-sale-sent') === `المرسَل: ${CONFIRM_TEXT}`, 'U بعد إعادة التحميل: مجمَّدة بالطلب نفسه');
      await click(byAction('bird-sale-retry')[0]);
      await settle(40);
      t.same(named('record_bird_sale'), [first], 'U «أعد المحاولة» ترسل الطلب نفسه حرفاً (المرجع ومعرّف الفاتورة)');
      t.same([globalThis.__bs.location, session.map.has(PENDING_KEY)], [`/sales/birds/${SALE.id}?back=%2Fsales`, false], 'U ثمّ صفحة الفاتورة، والطلب يُمحى');
    });

    await step('U refused', async () => {
      fresh(ACCOUNTANT, { ...formRpc(), record_bird_sale: () => Promise.reject(new current.UnknownOutcomeError()) }, pickers);
      await mount(NEW_URL);
      await fill();
      await submit();
      await click(byAction('bird-sale-confirm')[0]);
      await settle(40);
      const first = named('record_bird_sale')[0];
      await unmount();
      current = await bundle();
      current.onlineStore.set(true);
      let refusals = 0;
      fresh(
        ACCOUNTANT,
        {
          ...formRpc(),
          record_bird_sale: () => {
            refusals += 1;
            return Promise.reject(refusals === 1 ? new current.RejectedError('stale_ticket', 'تغيّرت التذكرة منذ فتحتها. حدّث الشاشة وراجعها ثمّ أعد المحاولة.') : new current.RejectedError('id_conflict', 'سُجّلت هذه الفاتورة ثمّ أُلغيت. أصدر فاتورة جديدة للتذكرة.'));
          },
        },
        pickers,
      );
      await mount(NEW_URL);
      const reads = named('bird_sale_form').length;
      await click(byAction('bird-sale-retry')[0]);
      await settle(40);
      t.same(
        [byAction('bird-sale-frozen').length, session.map.has(PENDING_KEY), text().includes('تغيّرت التذكرة منذ فتحتها. حدّث الشاشة وراجعها ثمّ أعد المحاولة.'), named('bird_sale_form').length > reads],
        [0, false, true, true],
        'U رفض أكيد بعد إعادة التحميل: تُفكّ الصفحة ويُمحى الطلب ويظهر التلميح ويُقرأ النموذج من جديد',
      );
      t.same(
        [byAction('change-party').length, all().find((n) => n.localName === 'span' && n.textContent === PARTY.name) !== undefined, inputBy('-price')?.value, inputBy('-pct')?.value, inputBy('-paid')?.value],
        [1, true, '2749', '0.50', '5000000'],
        'U ما أُرسل يعود إلى الخانات (التاجر والسعر والتنزيل والمقبوض)، لا المقترح',
      );
      await submit();
      await click(byAction('bird-sale-confirm')[0]);
      await settle(40);
      await submit();
      await click(byAction('bird-sale-confirm')[0]);
      await settle(40);
      const [again, second, third] = named('record_bird_sale');
      t.same(again, first, 'U الإعادة المجمَّدة بعد إعادة التحميل بالطلب نفسه حرفاً');
      t.same([second?.p_client_ref !== first.p_client_ref, second?.p_sale_id === first.p_sale_id], [true, true], 'U بعد الرفض الأكيد: مرجع جديد ومعرّف الفاتورة نفسه');
      t.same([third?.p_sale_id !== first.p_sale_id, third?.p_client_ref !== second?.p_client_ref], [true, true], 'U بعد id_conflict: معرّف فاتورة جديد ومرجع جديد');
    });

    // ── B: الحالات الممنوعة ────────────────────────────────────────────────────────────────────────────────────────────
    await step('B over live', async () => {
      fresh(ACCOUNTANT, formRpc(F.bird_sale_form_over_live), pickers);
      await mount(NEW_URL);
      t.eq(
        textOf('bird-over-live'),
        'في «قاعة 2» بحسب النظام 950 طيراً حيّاً، وفي التذكرة 1,000 طير. إن كان العدد الفعليّ أكبر فليسجّل المدير «فرق العدّ» بتاريخ 12/11/2026 أو قبله، ثمّ أعد القراءة.',
        'B طيور التذكرة أكثر من الحيّ: الجملة تدلّ على «فرق العدّ» بيوم التذكرة',
      );
      await fill();
      t.eq(disabled(byAction('bird-sale-submit')[0]), true, 'B والإصدار ممنوع');
      const reads = named('bird_sale_form').length;
      await click(byAction('bird-form-reread')[0]);
      await settle(20);
      t.eq(named('bird_sale_form').length, reads + 1, 'B «أعد القراءة» تقرأ النموذج من جديد');
    });
    await step('B invoiced', async () => {
      fresh(ACCOUNTANT, formRpc(F.bird_sale_form_invoiced), pickers);
      await mount(NEW_URL);
      t.same([text().includes('صدرت لهذه التذكرة الفاتورة BR-2026-0004.'), href(byAction('bird-sale-open')[0]), byAction('bird-sale-form').length], [true, `/sales/birds/${SALE.id}?back=%2Fsales`, 0], 'B صدرت فاتورتها: رابطها وبلا نموذج');
    });
    await step('B closed', async () => {
      fresh(ACCOUNTANT, formRpc(F.bird_sale_form_closed), pickers);
      await mount(NEW_URL);
      t.same([text().includes('فوج قاعة من قاعات هذه التذكرة مغلق، فلا تُصدر فاتورتها. أعد فتح الدورة أوّلاً إن كان الإغلاق خطأ.'), byAction('bird-sale-form').length], [true, 0], 'B فوج مغلق: جملته وبلا نموذج');
    });
    await step('B role', async () => {
      fresh(KEEPER, formRpc({ ...clone(FORM), can_post: false }), pickers);
      await mount(NEW_URL);
      t.same([text().includes('إصدار فاتورة الطيور للمحاسب والمدير.'), byAction('bird-sale-form').length], [true, 0], 'B دور لا يصدر: جملته وبلا نموذج');
    });
    await step('B no ticket', async () => {
      fresh(ACCOUNTANT, formRpc(), pickers);
      await mount('/sales/birds/new');
      t.same([named('bird_sale_form').length, text().includes('افتح «أصدر الفاتورة» من تذكرة وزن مكتملة'), href(byAction('back')[0])], [0, true, '/sales'], 'B بلا تذكرة: لا نداء، وجملة تدلّ، والرجوع إلى المبيعات');
    });
    t.same(
      [m.birdBack('/sales?view=list', '/x'), m.birdBack('/halls/ticket/abc', '/x'), m.birdBack('/accounts/parties/p?from=2026-11-01', '/x'), m.birdBack('//evil.com', '/x'), m.birdBack('https://evil.com', '/x'), m.birdBack('/inventory', '/x')],
      ['/sales?view=list', '/halls/ticket/abc', '/accounts/parties/p?from=2026-11-01', '/x', '/x', '/x'],
      'B طريق الرجوع: مسارات المبيعات والحسابات والتذاكر وحدها',
    );

    // ── D: الفاتورة وورقتها وإلغاؤها ───────────────────────────────────────────────────────────────────────────────────
    const SALE_URL = `/sales/birds/${SALE.id}?back=%2Fsales`;
    await step('D paper', async () => {
      fresh(ACCOUNTANT, { bird_sale_detail: () => clone(F.bird_sale_detail) });
      await mount(SALE_URL);
      t.same(named('bird_sale_detail'), [{ p_sale: SALE.id }], 'D النداء بمعرّف الفاتورة');
      t.same(
        [textOf('bird-paper-title'), textOf('bird-paper-no'), textOf('bird-paper-date'), textOf('org-name')],
        ['فاتورة بيع دجاج لحم حيّ', 'رقم: BR-2026-0004', 'التاريخ: 12/11/2026', 'مشروع الدواجن'],
        'D رأس الورقة: المنشأة واسم الفاتورة ورقمها ويومها',
      );
      const party = byAction('bird-paper-party')[0];
      t.same([party?.textContent, descendants(party).some((n) => n.localName === 'bdi' && n.getAttribute('dir') === 'ltr' && n.textContent === '0770 123 4567')], ['التاجر:أبو حيدر للدواجن، 0770 123 4567', true], 'D التاجر وهاتفه معزولاً LTR');
      t.eq(textOf('bird-paper-ticket'), 'تذكرة الوزن:WT-2026-0007، السيارة: 12345 بغداد، السائق: حسين علي', 'D التذكرة والسيارة والسائق');
      t.same(headersOf('القاعات'), ['القاعة', 'الطيور', 'الصافي (كغم)', 'معدّل الطير (كغم)'], 'D جدول القاعات بأعمدة العقد');
      t.same([rowsOf('القاعات'), footOf('القاعات')], [[['قاعة 1', '800', '1,800', '2.250'], ['قاعة 2', '1,000', '2,300', '2.300']], [['المجموع', '1,800', '4,100', '2.278']]], 'D القاعات ومجموعها');
      t.same(
        ['bird-paper-deduction', 'bird-paper-billed', 'bird-paper-price', 'bird-paper-total', 'bird-paper-paid', 'bird-paper-credit'].map(textOf),
        ['التنزيل:0.50٪', 'الوزن المحسوب:4,079.5 كغم', 'سعر الكيلو:2,749 دينار', 'المبلغ:11,214,546 دينار', 'المقبوض الآن:5,000,000 دينار في «صندوق البيع»', 'الباقي على الحساب:6,214,546 دينار'],
        'D التنزيل والوزن المحسوب وسعر الكيلو والمبلغ والمقبوض بصندوقه والباقي',
      );
      t.eq(textOf('bird-paper-words'), m.amountInWords(1121454600n), 'D المبلغ كتابةً');
      t.same(within(byAction('signatures')[0], 'signatures').length === 0 ? byAction('signatures')[0]?.children.map((n) => n.textContent) : null, ['المحاسب', 'المستلم'], 'D التوقيعان');
      t.same([byAction('void-stamp').length, byAction('bird-sale-void').length, byAction('bird-void-closed').length], [0, 0, 0], 'D المحاسب: بلا ختم ولا إلغاء');
      t.eq(textOf('bird-sale-remaining'), 'المتبقّي اليوم من هذه الفاتورة على التاجر: 0 دينار.', 'D المتبقّي اليوم حين يخالف الباقي عند البيع (رصيد التاجر سدّده)');
      t.eq(href(byAction('bird-sale-ticket')[0]), `/halls/ticket/${TICKET.id}`, 'D رابط التذكرة');
      const style = all().find((n) => n.localName === 'style');
      t.ok(Boolean(style) && style.textContent.includes('size: A5 portrait'), 'D الطباعة A5');
      await click(byAction('bird-sale-print')[0]);
      t.eq(printed.at(-1), 'فاتورة بيع دجاج لحم حيّ BR-2026-0004', 'D «اطبع الفاتورة» بعنوانها (اسم ملفّ PDF)');
      t.eq(href(byAction('back')[0]), '/sales', 'D الرجوع إلى المبيعات');
    });

    await step('D void', async () => {
      let detail = clone(F.bird_sale_detail);
      fresh(MANAGER, { bird_sale_detail: () => clone(detail), void_bird_sale: () => { detail = { ...clone(detail), status: 'void', voided_at: '2026-11-12T09:00:00+00:00', void_reason: 'سعر خاطئ', payment_kept: '5000000', can_void: false }; return { ...clone(F.void_bird_sale), id: SALE.id, doc_no: SALE.doc_no, money: { total: SALE.money.total, payment_kept: '5000000' } }; } });
      await mount(SALE_URL);
      await click(byAction('bird-sale-void')[0]);
      t.eq(
        textOf('bird-void-text'),
        'تُلغى الفاتورة BR-2026-0004 وتعود 800 طير إلى «قاعة 1» و1,000 طير إلى «قاعة 2» حيّةً؛ والمقبوض (5,000,000 دينار) يبقى رصيداً للتاجر «أبو حيدر للدواجن» يُخصم من فاتورة لاحقة أو يُردّ من كشفه.',
        'D التأكيد يسمّي الطيور العائدة والمقبوض الباقي رصيداً',
      );
      await click(byAction('bird-void-confirm')[0]);
      t.same([named('void_bird_sale').length, text().includes('اكتب سبب الإلغاء.')], [0, true], 'D السبب إلزاميّ');
      type(byAction('bird-void-reason')[0], 'سعر خاطئ');
      await settle();
      await click(byAction('bird-void-confirm')[0]);
      await settle(40);
      const [args] = named('void_bird_sale');
      t.same({ ...args, p_client_ref: UUID.test(args?.p_client_ref ?? '') }, { p_sale_id: SALE.id, p_reason: 'سعر خاطئ', p_client_ref: true }, 'D النداء بالمعرّف والسبب والمرجع');
      t.eq(lastToast(), 'أُلغيت الفاتورة BR-2026-0004 وعادت الطيور إلى قاعاتها. والمقبوض 5,000,000 دينار باقٍ رصيداً للتاجر «أبو حيدر للدواجن».', 'D التنبيه يقول المقبوض الباقي');
      t.same(
        [named('bird_sale_detail').length, textOf('bird-sale-title'), byAction('void-stamp').length, byAction('bird-sale-void').length, textOf('bird-payment-kept')],
        [2, 'فاتورة بيع دجاج لحم حيّ BR-2026-0004 — ملغاة', 1, 0, 'المقبوض (5,000,000 دينار) باقٍ رصيداً للتاجر «أبو حيدر للدواجن»: يُخصم من فاتورة لاحقة أو يُردّ من كشفه.'],
        'D بعد الإلغاء: تُقرأ من جديد ملغاةً بختمها وبلا إلغاء، والمقبوض باقٍ',
      );
    });

    await step('D void refused', async () => {
      fresh(MANAGER, { bird_sale_detail: () => clone(F.bird_sale_detail), void_bird_sale: () => Promise.reject(new current.RejectedError(F.refusal_flock_closed.code, F.refusal_flock_closed.hint)) });
      await mount(SALE_URL);
      await click(byAction('bird-sale-void')[0]);
      type(byAction('bird-void-reason')[0], 'خطأ');
      await settle();
      await click(byAction('bird-void-confirm')[0]);
      await settle(40);
      t.ok(dialog() !== null && dialog().textContent.includes(F.refusal_flock_closed.hint), 'D فوج أُغلق بعد القراءة: تلميح الخادم في التأكيد');
    });

    await step('D void unknown', async () => {
      let attempts = 0;
      fresh(MANAGER, { bird_sale_detail: () => clone(F.bird_sale_detail), void_bird_sale: () => { attempts += 1; return attempts === 1 ? Promise.reject(new current.UnknownOutcomeError()) : { ...clone(F.void_bird_sale), id: SALE.id, doc_no: SALE.doc_no }; } });
      await mount(SALE_URL);
      await click(byAction('bird-sale-void')[0]);
      type(byAction('bird-void-reason')[0], 'سبب أوّل');
      await settle();
      await click(byAction('bird-void-confirm')[0]);
      await settle(40);
      t.same([byAction('bird-void-unknown').length, disabled(byAction('bird-void-reason')[0])], [1, true], 'D نتيجة مجهولة: السبب مقفول وجملة الإعادة');
      await click(byAction('bird-void-confirm')[0]);
      await settle(40);
      const [first, second] = named('void_bird_sale');
      t.same([second?.p_client_ref === first?.p_client_ref, second?.p_reason], [true, 'سبب أوّل'], 'D الإعادة بالسبب والمرجع نفسيهما');
    });

    await step('D closed', async () => {
      fresh(MANAGER, { bird_sale_detail: () => ({ ...clone(F.bird_sale_detail), can_void: false }) });
      await mount(SALE_URL);
      t.same([byAction('bird-sale-void').length, textOf('bird-void-closed')], [0, 'لا تُلغى هذه الفاتورة الآن: دورة قاعة من قاعاتها مغلقة. أعد فتح الدورة أوّلاً إن كان الإغلاق خطأ.'], 'D فوج مغلق: بلا إلغاء وجملة تقول لماذا');
    });

    await step('D void paper', async () => {
      fresh(ACCOUNTANT, { bird_sale_detail: () => clone(F.bird_sale_detail_void) });
      await mount(`/sales/birds/${F.bird_sale_detail_void.id}`);
      const stamp = byAction('void-stamp')[0];
      t.ok(Boolean(stamp) && stamp.textContent.startsWith('ملغى') && stamp.textContent.includes('السبب: وزن خاطئ'), 'D الملغاة: ختم «ملغى» بيومه وسببه');
      t.same([textOf('bird-paper-note'), byAction('bird-sale-remaining').length, href(byAction('back')[0])], ['ملاحظة: السيارة الأولى', 0, '/sales'], 'D ملاحظتها، وبلا متبقٍّ للملغاة، والرجوع بلا ?back إلى المبيعات');
    });

    // ── L: قائمة المبيعات ───────────────────────────────────────────────────────────────────────────────────────────────
    const AWAIT = 'تذاكر وزن بانتظار الفاتورة';
    const LIST = 'فواتير الطيور من 01/11/2026 إلى 12/11/2026، الأحدث أوّلاً';
    await step('L', async () => {
      fresh(ACCOUNTANT, { sales_overview: () => clone(F.sales_overview), sales_report: (args) => clone(F.sales_report[args.p_group]) });
      await mount('/sales');
      t.same(
        [log.every(([fn]) => fn === 'sales_overview'), named('sales_overview').at(-1)],
        [true, { p_from: '2026-11-01', p_to: '2026-11-12' }],
        'L نداء sales_overview وحده للموادّ والطيور (بلا نداء ثانٍ للطيور)، والمدّة من يوم الخادم',
      );
      t.same(headersOf(AWAIT), ['التاريخ', 'التذكرة', 'الحقل', 'الطيور', 'الصافي (كغم)', 'الفاتورة'], 'L التذاكر بانتظار الفاتورة بأعمدتها');
      t.same(rowsOf(AWAIT), [['12/11/2026', 'WT-2026-0009', 'حقل الأمير', '60', '144', 'أصدر الفاتورة'], ['11/11/2026', 'WT-2026-0005', 'حقل الأمير', '4,000', '9,100', 'أصدر الفاتورة']], 'L كلّ تذكرة بيومها وحقلها وطيورها وصافيها');
      t.same(
        [byAction('invoice-ticket').map(href), byAction('open-ticket').map(href)],
        [[`/sales/birds/new?ticket=${F.sales_overview.birds.awaiting[0].ticket_id}&back=%2Fsales`, `/sales/birds/new?ticket=${F.sales_overview.birds.awaiting[1].ticket_id}&back=%2Fsales`], F.sales_overview.birds.awaiting.map((a) => `/halls/ticket/${a.ticket_id}?back=%2Fsales`)],
        'L «أصدر الفاتورة» والتذكرة نفسها برابطيهما وطريق الرجوع',
      );
      t.same(headersOf(LIST), ['التاريخ', 'الرقم', 'الجهة', 'التذكرة', 'الطيور', 'الصافي (كغم)', 'سعر الكيلو', 'المبلغ', 'الدفع', 'الحالة'], 'L فواتير الطيور بأعمدتها');
      t.same(
        rowsOf(LIST),
        [
          ['12/11/2026', 'BR-2026-0004', 'أبو حيدر للدواجن', 'WT-2026-0007', '1,800', '4,100', '2,749.00', '11,214,546', 'جزء نقداً', 'مرحَّلة'],
          ['11/11/2026', 'BR-2026-0003', 'أبو حيدر للدواجن', 'WT-2026-0005', '4,000', '9,100', '—', '—', 'نقداً', 'ملغاة'],
        ],
        'L المرحّلة بسعرها ومبلغها ودفعها، والملغاة «—» بعلامتها',
      );
      t.same(footOf(LIST), [['مجموع المرحَّل', '1,800', '4,100', '', '11,214,546', '', '']], 'L المجموع للمرحَّل من الخادم');
      t.same(byAction('open-bird-sale').map(href), [`/sales/birds/${SALE.id}?back=%2Fsales`, `/sales/birds/${F.bird_sale_detail_void.id}?back=%2Fsales`], 'L الرقم يفتح الفاتورة');
      t.ok(['فواتير طيور مرحَّلة', 'الطيور المباعة', 'صافيها', '4,100 كغم', 'مجموعها', '11,214,546 دينار', 'منه مقبوض عند البيع', '5,000,000 دينار', 'منه بالدين', '6,214,546 دينار'].every((part) => text().includes(part)), 'L أرقام المدّة من الخادم');
      t.eq(textOf('bird-profit-note'), 'ربح الطيور في تقرير الفوج: إيراد كلّ فاتورة مقسوم على الأفواج بصافي قاعاتها.', 'L بلا كلفة ولا ربح للطيور: جملة تدلّ على تقرير الفوج');
      const item = all().find((n) => n.localName === 'button' && n.textContent === 'حسب المادّة');
      await click(item);
      await settle(20);
      t.same([named('sales_report').at(-1)?.p_group, rowsOf('فواتير الطيور حسب المادّة'), footOf('فواتير الطيور حسب المادّة')], ['item', [['دجاج لحم حيّ', '1', '1,800', '4,100', '11,214,546']], [['المجموع', '1', '1,800', '4,100', '11,214,546']]], 'L التقرير بالمادّة: صفّ «دجاج لحم حيّ»');
    });

    await step('L keeper', async () => {
      fresh(KEEPER, { sales_overview: () => ({ ...clone(F.sales_overview), birds: { ...clone(F.sales_overview.birds), can_record: false } }) });
      await mount('/sales');
      t.same([headersOf(AWAIT)?.includes('الفاتورة'), byAction('invoice-ticket').length, rowsOf(AWAIT)?.length], [false, 0, 2], 'L من لا يصدر الفاتورة يرى التذاكر بلا «أصدر الفاتورة»');
    });

    await step('L old server', async () => {
      const old = clone(F.sales_overview);
      delete old.birds;
      fresh(ACCOUNTANT, { sales_overview: () => old });
      await mount('/sales');
      t.same([byAction('bird-sales').length, tableOf(LIST)], [0, null], 'L خادم قبل 0028: لا قسم طيور');
    });

    // ── X: أجوبة القاعدة الحقيقية ─────────────────────────────────────────────────────────────────────────────────────
    if (existsSync(REAL_PATH)) {
      const R = JSON.parse(readFileSync(REAL_PATH, 'utf8'));
      const form = m.birds.parseBirdSaleForm(clone(R.bird_sale_form_open));
      const sale = m.birds.parseBirdSale(clone(R.record_bird_sale_paid));
      const preview = m.birdPreview(form.ticket, sale.deduction, sale.money.unitPrice);
      t.same([preview.billedKg, preview.total, preview.shares], [sale.billedKg, sale.money.total, sale.sources.map((s) => s.revenue)], 'X المعاينة = جواب record_bird_sale الحقيقي (الوزن المحسوب والمبلغ والحصص)');
      t.same([sale.money.total, sale.billedKg], [2489987500n, 9054500n], 'X G1 من القاعدة: 24,899,875 و9,054.500');
      const detail = m.birds.parseBirdSaleDetail(clone(R.bird_sale_detail_void));
      t.same([detail.status, detail.canVoid, detail.paymentKept], ['void', false, sale.money.paidNow], 'X تفصيل الملغاة الحقيقيّ: المقبوض باقٍ رصيداً');
      t.ok(m.birds.parseVoidedBirdSale(clone(R.void_bird_sale)).docNo === sale.docNo, 'X نتيجة الإلغاء الحقيقية');
      const list = m.birds.parseBirdSalesSection(clone(R.sales_overview.birds));
      t.ok(list.totals.count === list.rows.filter((row) => row.status === 'posted').length || list.more, 'X قائمة الطيور الحقيقية: العدد = المرحَّل');
      for (const group of ['party', 'day', 'item']) t.ok(m.birds.parseBirdSalesGroups(clone(R[`sales_report_${group}`].birds)) !== null, `X تقرير الطيور الحقيقي بالتجميع ${group}`);
      t.ok(m.birds.parseBirdSaleForm(clone(R.bird_sale_form_invoiced)).why === 'invoiced', 'X النموذج الحقيقي بعد الفاتورة');

      // صفحات المبيعات بأجوبة القاعدة الحقيقية (درس 2026-11-02: الجواب الحقيقي بالصفحة الحقيقية، لا بالمحلّل وحده).
      const grouped = (text) => String(text).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
      await step('X الفاتورة الحقيقية', async () => {
        const real = R.bird_sale_detail;
        fresh(MANAGER, { bird_sale_detail: () => clone(real) });
        await mount(`/sales/birds/${real.id}`);
        t.same(
          [textOf('bird-paper-no'), rowsOf('القاعات')?.map((row) => row[0]), textOf('bird-paper-total'), textOf('bird-paper-words'), byAction('bird-sale-void').length],
          [`رقم: ${real.doc_no}`, real.sources.map((source) => source.hall_name), `المبلغ:${grouped(real.money.total)} دينار`, m.amountInWords(BigInt(real.money.total) * 100n), real.can_void ? 1 : 0],
          'X ورقة الفاتورة بجواب القاعدة: رقمها وقاعاتها ومبلغها رقماً وكتابةً، و«ألغِ الفاتورة» بما يجيزه الخادم',
        );
      });
      await step('X قائمة المبيعات الحقيقية', async () => {
        fresh(ACCOUNTANT, { sales_overview: () => clone(R.sales_overview), sales_report: (args) => clone(R[`sales_report_${args.p_group}`]) });
        await mount('/sales');
        const birds = R.sales_overview.birds;
        t.same(
          [rowsOf(LIST)?.map((row) => row[1]), rowsOf(AWAIT)?.map((row) => row[1]), byAction('invoice-ticket').length],
          [birds.rows.map((row) => row.doc_no), birds.awaiting.map((row) => row.ticket_no), birds.can_record ? birds.awaiting.length : 0],
          'X قائمة المبيعات بجواب القاعدة: فواتير الطيور بأرقامها، والتذاكر بانتظار الفاتورة بأرقامها و«أصدر الفاتورة» لكلّ واحدة',
        );
      });
      await step('X نموذج الفاتورة الحقيقيّ', async () => {
        fresh(ACCOUNTANT, formRpc(R.bird_sale_form_open), pickers);
        await mount(`/sales/birds/new?ticket=${R.bird_sale_form_open.ticket.id}`);
        t.same(
          [byAction('bird-sale-form').length, byAction('bird-over-live').length, textOf('bird-price-suggested') !== null || R.bird_sale_form_open.suggested_price === null],
          [1, R.bird_sale_form_open.flocks.some((flock) => flock.over_live) ? 1 : 0, true],
          'X نموذج «أصدر الفاتورة» بجواب القاعدة: يُرسم بقاعاته، والسعر المقترح حين يرسله الخادم',
        );
      });
    }
  } finally {
    if (root) {
      const mounted = root;
      root = null;
      try {
        current?.flushSync(() => mounted.unmount());
      } catch {
        // swallow-ok: التنظيف بعد فحص رمى
      }
    }
    delete globalThis.__bs;
    if (saved.session) Object.defineProperty(globalThis, 'sessionStorage', saved.session);
    else delete globalThis.sessionStorage;
    restore();
  }
}
