// توصيل شاشات 0028 بمفاتيح مراجعة القاعدة (2d2005e) وأجوبة المالك 2026-11-13، بأجوبة القاعدة الحقيقية (fixtures/birds-0028.json) تمرّ بالمحلّلات والصفحات
// الحقيقية محزومةً بـesbuild (درس 2026-11-02)، ومنها عيّنات الفاتورة المتأخّرة التي أعادتها القاعدة بأجوبة المالك (3eb8bc2: _late). وكلّ فحص هنا عن
// الشاشات يفشل على شاشات d13246a (والفحوص التي تثبت ما في العيّنات وحدها تمرّ عليها):
// W1 (M4) «أغلق الدورة» يرسل بصمة ما في القاعة من النموذج (p_expected_plan، الوسيط الحادي عشر)، وبلاها يرفض الخادم كلّ إغلاق.
// W2 (S1) نافذة «فرق العدّ» بيوم الخادم وأقدم يوم يقبله (flock_sales: today وearliest_on) لا بساعة الجهاز، و«سجّل» مقفول ما دامت البطاقة تُقرأ من جديد
//    بعد رفض، والطلب التالي بحيّ القراءة الجديدة التي يعرضها النصّ.
// W3 (S9) ختم إلغاء فاتورة الطيور بيوم الخادم (voided_on) لا بيوم الجهاز من voided_at.
// W4 (O2/M5) «الباقي في القاعة» بتعريفه الواحد (left_in_hall_kg) في تقرير الدورة (المؤشّر وجدول الأيّام وجدول الباقي) وعلف القاعة والتقرير اليوميّ ونموذج
//    الإغلاق: القاعة المغلقة صفر، والفوج التالي يعدّ منقوله، ولا قيمتان لقاعة واحدة.
// W5 (O3) فروق العدّ بأسبابها: جدول «فروق العدّ» في تقرير الدورة بيومها ومصدرها، والسبب في بطاقة القاعة اليوميّة ونصّ المشاركة.
// W6 (O7) يومٌ بدأ بلا طير حيّ لا ينتظر جولة: لا «لم تُسجَّل الجولة» له، و«الجولات المسجَّلة n من m» من المنتظرة، والأسبوع من أيّامه المنتظرة.
// W7 (O6) «أعد فتح الدورة» حين يجيزها الخادم (can.reopen) وإلّا لماذا لا (reopen_why)، في البطاقة والتقرير، والزرّ مقفول ما دامت القراءة في الطريق.
// W8 (M3) المقبوض الذي رُدّ للتاجر: على ورقة الفاتورة وصفحتها وفي قائمة المبيعات.
// W9 (O4، أجوبة المالك) التذكرة الأقدم من سبعة أيّام: فاتورتها بتاريخ اليوم (sold_on) والطيور بيوم التذكرة (ticket_on) والمقبوض يوم الإصدار (paid_on)،
//    في النموذج وتأكيده والتذكرة والقوائم والورقة و«أغلق الدورة»؛ والممنوع بطريقه؛ والمحلّلات تقرأ غياب المفاتيح سلوكَ اليوم، ولا too_old.
// W10 (O10) جملة الطيور في المبيعات: الإيراد وكلفة الفوج في تقرير الفوج، والربح بعد كلفة الفراخ.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__w8.call('${n}', a);`).join(' ')}`;
const STUBS = {
  session: 'export const useSession = () => globalThis.__w8.session; export const sessionStore = { get: () => globalThis.__w8?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__w8.toasts.push(spec); }; export function Toaster() { return null; }',
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createSupplier', 'createCustomer', 'listBoxes']),
};
// core بديل لوحدات القاعات والمبيعات: call يسجّله __w8.rpc والمحلّل الحقيقي يقرأ الجواب (غيرها بـcore الحقيقي، لا تنادي في هذه الفحوص).
const CORE_FOR = /src\/lib\/repo\/(?:birdSales|purchases|weighTickets|statement|flockClose|halls|hallReports|flocks|flockIssues|money)\.ts$/u;
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__w8.rpc(fn, args);
export const send = async () => { throw new Error('wire-0028: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ userId: globalThis.__w8?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as HallsRoutes, FlockCard } from './src/pages/halls/HallsRoutes.tsx';",
    "export { SalesRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { FeedLine } from './src/pages/farm/feed.tsx';",
    "export * as birds from './src/lib/repo/birdSales.ts';",
    "export * as flocks from './src/lib/repo/flocks.ts';",
    "export * as halls from './src/lib/repo/halls.ts';",
    "export * as tickets from './src/lib/repo/weighTickets.ts';",
    "export { dayShareText } from './src/pages/halls/DailyPage.tsx';",
    "export * as days from './src/lib/repo/hallReports.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { signedCount } from './src/pages/halls/ticketParts.tsx';",
    "export { fmtDay, fmtInt } from './src/lib/format.ts';",
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
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'wire-0028-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/repo\/purchasing$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'w8-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'w8-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
          b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'w8-core' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'w8-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// wire-0028 bundle\n`).toString('base64')}`);
}

function memoryStorage() {
  const map = new Map();
  return { map, api: { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), clear: () => map.clear() } };
}

const ws = (role) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role),
  canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: !['hall_worker', 'mill_operator', 'hatchery_operator'].includes(role), invites: [], subscription: 'active', confirmedAt: 1,
});
const sessionOf = (role) => ({ status: 'ready', workspace: ws(role), offline: false });
const MANAGER = sessionOf('manager');
const ACCOUNTANT = sessionOf('accountant');
const LRI = '\u{2066}';
const PDI = '\u{2069}';
const signed = (n) => (n === 0 ? '0' : `${LRI}${n > 0 ? '+' : '-'}${Math.abs(n).toLocaleString('en-US')}${PDI}`);

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const within = (node, name) => (node ? descendants(node).filter((n) => n.getAttribute('data-action') === name) : []);
const withAttr = (action, attr, value) => byAction(action).find((n) => n.getAttribute(attr) === value) ?? null;
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const text = () => body().textContent;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
const href = (node) => node?.getAttribute('href') ?? null;
const dialog = () => all().filter((n) => n.getAttribute('role') === 'dialog').at(-1) ?? null;
const inputBy = (suffix) => all().find((n) => (n.localName === 'input' || n.localName === 'select') && (n.getAttribute('id') ?? '').endsWith(suffix)) ?? null;
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
const tableOf = (match) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && (typeof match === 'string' ? c.textContent === match : match.test(c.textContent)))) ?? null;
const part = (table, tag) => (table ? descendants(table).find((n) => n.localName === tag) : null);
const rowsOf = (match) => {
  const tbody = part(tableOf(match), 'tbody');
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const footOf = (match) => {
  const tfoot = part(tableOf(match), 'tfoot');
  return tfoot ? tfoot.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const headersOf = (match) => (tableOf(match) ? descendants(tableOf(match)).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null);
/** صفّ مؤشّر في تقرير الدورة: [القيمة، الملاحظة]. */
const kpi = (key) => {
  const value = all().find((n) => n.getAttribute('data-action') === 'kpi-value' && n.getAttribute('data-key') === key);
  const note = all().find((n) => (n.getAttribute('data-action') === 'kpi-note' || n.getAttribute('data-action') === 'kpi-reason') && n.getAttribute('data-key') === key);
  return value ? [value.textContent, note?.textContent ?? null] : null;
};

/** ساعة الجهاز: new Date() بلا معامل وحده يتبدّل (localDay منه)، والوقت الصريح كما هو. */
function deviceClock(at) {
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(at);
      else super(...args);
    }
  };
  return () => {
    globalThis.Date = RealDate;
  };
}

export default async function (t) {
  const restore = installDom();
  const saved = { session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  const session = memoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: session.api, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage().api, configurable: true, writable: true });
  globalThis.window.print = () => {};
  let root = null;
  let m = null;
  let undoClock = null;
  try {
    m = await bundle();
    m.onlineStore.set(true);
    let log = [];
    const fresh = (who, rpcs = {}, calls = {}) => {
      log = [];
      globalThis.__w8 = {
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
    const mount = async (url, element = null) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__w8.location = `${location.pathname}${location.search}`;
        return (
          element ??
          m.h(
            m.Routes,
            null,
            m.h(m.Route, { path: '/halls/*', element: m.h(m.HallsRoutes) }),
            m.h(m.Route, { path: '/sales/*', element: m.h(m.SalesRoutes) }),
            m.h(m.Route, { path: '*', element: null }),
          )
        );
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
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
      session.map.clear();
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      if (undoClock) {
        undoClock();
        undoClock = null;
      }
    };
    /** نداء يبقى في الطريق حتى يُفتح. */
    const gate = () => {
      let open = null;
      const promise = new Promise((resolve) => {
        open = resolve;
      });
      return { promise, open: () => open() };
    };
    const flockOf = (sales) => ({ id: sales.flock_id, kind: sales.kind, siteId: 's-1', hallId: 'h-1', hallName: 'قاعة', siteName: 'حقل', status: sales.status });

    // ── W1 (M4): «أغلق الدورة» يرسل بصمة ما في القاعة ───────────────────────────────────────────────────────────────────
    await step('W1', async () => {
      const form = B.flock_close_form_plan;
      fresh(MANAGER, { flock_close_form: () => clone(form), close_flock: () => clone(B.close_flock) });
      await mount(`/halls/close/${form.flock.id}`);
      type(byAction('close-reason')[0], 'عُدّت القاعة');
      await settle();
      await click(byAction('close-go')[0]);
      await click(byAction('close-confirm')[0]);
      await settle(30);
      const sent = named('close_flock');
      t.same(
        [typeof form.plan, sent.length, sent[0]?.p_expected_plan ?? 'غائب', 'p_expected_plan' in (sent[0] ?? {})],
        ['string', 1, form.plan, true],
        'W1 «أغلق الدورة» نداء واحد يحمل p_expected_plan = بصمة النموذج نفسه (flock_close_form.plan، مراجعة 0028 M4؛ كان بلا الوسيط الحادي عشر فيرفضه الخادم)',
      );
    });

    // ── W2 (S1): نافذة «فرق العدّ» بيوم الخادم وحدّيه، ومقفولة أثناء القراءة ─────────────────────────────────────────────────
    await step('W2', async () => {
      const sales = B.flock_sales_server_days;
      // ساعة الجهاز بعد يوم الخادم بثمانية أيّام: النافذة لا تأخذ منها اليوم ولا الحدّين.
      undoClock = deviceClock('2026-11-20T09:00:00');
      const reread = gate();
      fresh(MANAGER, {
        flock_sales: (_args, n) => (n === 1 ? clone(sales) : reread.promise.then(() => ({ ...clone(sales), live: sales.live - 10 }))),
        record_flock_count_adjust: (_args, n) =>
          n === 1
            ? Promise.reject(new m.RejectedError('live_changed', `تغيّر عدد الطيور الحيّة منذ فتحت الشاشة: كان ${sales.live} وصار ${sales.live - 10}. راجع الأرقام وأعد المحاولة.`))
            : clone(B.record_flock_count_adjust),
      });
      await mount('/broiler/flock/x', m.h(m.FlockCard, { flock: flockOf(sales) }));
      await click(byAction('card-count')[0]);
      const opened = byAction('count-day')[0]?.value ?? null;
      type(byAction('count-n')[0], '10');
      type(byAction('count-reason')[0], 'عُدّت القاعة');
      type(byAction('count-day')[0], m.fmtDay('2026-11-04'));
      await settle();
      const tooOld = dialog()?.textContent.includes(`أقدم يوم يُقبل لفرق العدّ ${m.fmtDay(sales.earliest_on)}`) ?? false;
      type(byAction('count-day')[0], m.fmtDay('2026-11-20'));
      await settle();
      const future = dialog()?.textContent.includes('التاريخ بعد اليوم.') ?? false;
      type(byAction('count-day')[0], m.fmtDay(sales.today));
      await settle();
      await click(byAction('count-go')[0]);
      await settle(20);
      // رفض live_changed: البطاقة تُقرأ من جديد، و«سجّل» مقفول بجملة ما دامت القراءة في الطريق (والمعروض الحيّ القديم).
      const whileReading = [disabled(byAction('count-go')[0]), byAction('count-reading').length, named('flock_sales').length];
      reread.open();
      await settle(30);
      const afterRead = [disabled(byAction('count-go')[0]), byAction('count-reading').length, textOf('count-live')];
      await click(byAction('count-go')[0]);
      await settle(20);
      t.same(
        [opened, tooOld, future, whileReading, afterRead, named('record_flock_count_adjust').map((args) => [args.p_on, args.p_birds, args.p_expected_live])],
        [
          m.fmtDay(sales.today),
          true,
          true,
          [true, 1, 2],
          [false, 0, `الحيّ الآن ${m.fmtInt(sales.live - 10)}، وبعد فرق العدّ ${m.fmtInt(sales.live - 20)}.`],
          [[sales.today, -10, sales.live], [sales.today, -10, sales.live - 10]],
        ],
        'W2 «فرق العدّ» يومه المقترح يوم الخادم (12/11 والجهاز 20/11)، وأقدم يوم يقبله earliest_on (05/11)، وما بعد يوم الخادم «بعد اليوم»؛ وبعد رفض live_changed «سجّل» مقفول بجملة حتى تصل القراءة، ثمّ الطلب بحيّها الذي يعرضه النصّ (مراجعة 0028 S1)',
      );
    });

    // ── W3 (S9): ختم الإلغاء بيوم الخادم ──────────────────────────────────────────────────────────────────────────────
    await step('W3', async () => {
      // voided_at بيومٍ غير voided_on في كلّ منطقة (ظهر 14/11 بتوقيت غرينتش)، كجهاز يقرأ الوقت بساعته.
      const voided = { ...clone(B.bird_sale_detail_void), voided_at: '2026-11-14T12:00:00+00:00' };
      fresh(ACCOUNTANT, { bird_sale_detail: () => clone(voided) });
      await mount(`/sales/birds/${voided.id}`);
      t.same(
        [voided.voided_on, textOf('void-stamp')],
        ['2026-11-12', `ملغىأُلغي بتاريخ ${m.fmtDay(voided.voided_on)}. السبب: ${voided.void_reason}`],
        'W3 ختم «ملغى» على فاتورة الطيور بيوم الخادم (bird_sale_detail.voided_on = 12/11) لا بيوم الجهاز من voided_at (14/11) (مراجعة 0028 S9)',
      );
    });

    // ── W4 (O2/M5): «الباقي في القاعة» بتعريفه الواحد ────────────────────────────────────────────────────────────────────
    const DAYS = 'أيّام الدورة';
    const BALANCE = 'المصروف والمستهلك والباقي';
    await step('W4 التقرير المغلق', async () => {
      const report = B.flock_cycle_report_left_in_hall;
      fresh(MANAGER, { flock_cycle_report: () => clone(report), flock_sales: () => clone(B.flock_sales_reopen_blocked) });
      await mount(`/halls/report/${report.flock.id}`);
      const heads = headersOf(DAYS) ?? [];
      const lastDay = (rowsOf(DAYS) ?? []).at(-1) ?? [];
      const balanceHeads = headersOf(BALANCE) ?? [];
      const balance = (rowsOf(BALANCE) ?? [])[0] ?? [];
      t.same(
        [report.kpis.left_in_hall_kg, report.feed.left_in_hall_kg, report.days.at(-1).left_in_hall_kg, report.kpis.feed_left_kg, report.feed.remaining_kg],
        ['0.000', '0.000', '0.000', '150.000', '500.000'],
        'W4 العيّنة: القاعة المغلقة باقيها في القاعة صفر بالتعريف الواحد (والقديمان 150 و500)',
      );
      t.same(
        [kpi('left')?.[0], lastDay[heads.indexOf('الباقي في القاعة (كغم)')] ?? null, balanceHeads.at(-1), balance.at(-1) ?? null, textOf('rep-left-note')],
        ['0', '0', 'الباقي في القاعة (كغم)', '0', 'الباقي في القاعة يعدّ العلف المنقول إليها من الدورة السابقة، ويُنقص ما رجع منها أو نُقل أو حُسب مستهلَكاً عند الإغلاق.'],
        'W4 تقرير الدورة المغلقة: المؤشّر وآخر يوم وجدول الباقي «0» كلّها من left_in_hall_kg (كانت 150 و150 و500)، وجملة تقول لماذا لا يساوي المصروف − المستهلك',
      );
    });
    {
      // تقرير بلا يوم (المؤشّرات null): «الباقي في القاعة» في قسم العلف null من الخادم، فالمحلّل لا يرمي ويأخذ المصروف − المستهلك كخادم قبل 0028.
      const report = clone(B.flock_cycle_report_left_in_hall);
      Object.assign(report.feed, { left_in_hall_kg: null, left_in_hall_unweighed: null });
      let parsed = null;
      try {
        parsed = m.halls.parseCycleReport(report);
      } catch (error) {
        parsed = { error: error?.field ?? String(error) };
      }
      const full = m.halls.parseCycleReport(clone(B.flock_cycle_report_left_in_hall));
      t.same(
        [parsed?.feed?.leftInHallKg ?? parsed?.error ?? null, parsed?.feed?.leftInHallUnweighed ?? null, full.feed.leftInHallKg, full.cycle.kpis.leftInHallKg, full.cycle.days.at(-1).leftInHallKg],
        [500_000n, 0, 0n, 0n, 0n],
        'W4 المحلّل: قسم العلف والمؤشّرات وآخر يوم من left_in_hall_kg (صفر للقاعة المغلقة)، وقسم العلف بلا يوم (null) يأخذ المصروف − المستهلك ولا يرمي',
      );
    }
    await step('W4 القاعة التالية: علفها ويومها', async () => {
      const feed = B.flock_feed_left_in_hall;
      const day = B.halls_day_count_diffs;
      const hall = day.sites.flatMap((site) => site.halls).find((h) => h.flock?.id === feed.flock_id);
      fresh(MANAGER, { halls_day: () => clone(day) });
      await mount('/broiler/flock/x', m.h(m.FeedLine, { feed: m.flocks.parseFlockFeed(clone(feed)) }));
      const line = textOf('feed-line');
      await unmount();
      await mount(`/halls/day?on=${day.on}`);
      const card = withAttr('day-hall', 'data-hall', hall.hall_id);
      const stat = within(card, 'stat-left')[0];
      const daily = stat ? descendants(stat).find((n) => n.localName === 'dd')?.textContent ?? null : null;
      t.same(
        [feed.remaining_feed_kg, feed.carry_in_feed_kg, feed.left_in_hall_kg, hall.flock.left_in_hall_kg],
        ['-100.000', '250.000', '150.000', '150.000'],
        'W4 العيّنة: الفوج التالي في «قاعة الباقي» نُقل إليه 250 كغم وأكل 100 (والباقي القديم المصروف − المستهلك −100)',
      );
      t.same(
        [line?.includes('الباقي في القاعة: 150 كغم') ?? false, daily],
        [true, '150 كغم'],
        'W4 علف القاعة (شاشة الفوج المحفوظة) يعدّ المنقول: «الباقي في القاعة: 150 كغم» كالتقرير اليوميّ للقاعة نفسها (كان «الباقي بالقاعة: −100 كغم»)',
      );
    });
    await step('W4 نموذج الإغلاق', async () => {
      const form = B.flock_close_form_closed;
      fresh(MANAGER, { flock_close_form: () => clone(form) });
      await mount(`/halls/close/${form.flock.id}`);
      t.same(
        [form.flock.status, form.feed.estimate_left_kg, form.feed.left_in_hall_kg, textOf('close-estimate')?.split('.')[0] ?? null],
        ['closed', '37500.000', '35412.000', 'النازل للقاعة 40,500 كغم، والمأكول المسجّل 3,000 كغم، والباقي في القاعة 35,412 كغم'],
        'W4 نموذج الإغلاق: «الباقي في القاعة» من left_in_hall_kg (35,412) لا من التقدير القديم (37,500)، وبعد الإغلاق بلا «فالمتوقّع» (ما خرج عنده لا يُطرح في الجملة)',
      );
    });

    // ── W5 (O3): فروق العدّ بأسبابها ───────────────────────────────────────────────────────────────────────────────────
    await step('W5 التقرير', async () => {
      const report = B.flock_cycle_report_count_diffs;
      fresh(MANAGER, { flock_cycle_report: () => clone(report) });
      await mount(`/halls/report/${report.flock.id}`);
      t.same(
        [headersOf('فروق العدّ'), rowsOf('فروق العدّ'), footOf('فروق العدّ')?.[0]?.slice(0, 2), kpi('count_diff')],
        [
          ['التاريخ', 'فرق العدّ', 'المصدر', 'السبب'],
          report.count_diffs.map((diff) => [m.fmtDay(diff.on), signed(diff.birds), diff.source === 'close' ? 'عند الإغلاق' : 'سُجّل يدويّاً', diff.reason]),
          ['المجموع', signed(report.birds.count_diff)],
          [signed(report.birds.count_diff), 'أسبابه في جدول «فروق العدّ». يظهر وحده لا مع النافق.'],
        ],
        'W5 تقرير الدورة: جدول «فروق العدّ» بكلّ فرق بيومه وعدده ومصدره (يدويّاً أو عند الإغلاق) وسببه والمجموع من الخادم، والمؤشّر يدلّ عليه (كان سبب الإغلاق وحده)',
      );
      t.same([report.count_diffs.length, report.count_diffs.map((d) => d.source)], [2, ['manual', 'close']], 'W5 العيّنة: فرق يدويّ وفرق الإغلاق');
    });
    await step('W5 اليوميّ', async () => {
      const day = B.halls_day_count_diffs;
      const hall = day.sites.flatMap((site) => site.halls).find((h) => h.flock?.count_diffs?.length);
      fresh(MANAGER, { halls_day: () => clone(day) });
      await mount(`/halls/day?on=${day.on}`);
      const diff = hall.flock.count_diffs[0];
      const card = withAttr('day-hall', 'data-hall', hall.hall_id);
      const shared = m.dayShareText(m.days.parseHallsDay(clone(day))).text.split('\n').find((line) => line.startsWith(`${hall.hall_name} (`)) ?? '';
      t.same(
        [within(card, 'day-sales')[0]?.textContent ?? null, shared.includes(`فرق العدّ ${signed(diff.birds)} (${diff.reason})`)],
        [`فرق العدّ ${signed(diff.birds)} (${diff.reason})`, true],
        'W5 بطاقة القاعة في التقرير اليوميّ ونصّ مشاركته: فرق العدّ بسببه («فرق العدّ −10 (طيور مسروقة)»؛ كان العدد وحده)',
      );
    });

    // ── W6 (O7): يومٌ بلا طير حيّ لا ينتظر جولة ────────────────────────────────────────────────────────────────────────────
    await step('W6 اليوميّ', async () => {
      const day = B.halls_day_zero_live;
      const empty = day.sites.flatMap((site) => site.halls).find((h) => h.flock && h.flock.expects_round === false);
      fresh(MANAGER, { halls_day: () => clone(day) });
      await mount(`/halls/day?on=${day.on}`);
      const card = withAttr('day-hall', 'data-hall', empty.hall_id);
      const rounds = within(byAction('day-site-total')[0], 'total-rounds')[0];
      t.same(
        [
          [day.totals.rounds, day.totals.flocks, day.totals.rounds_expected],
          textOf('day-rounds'),
          within(card, 'day-no-round').length,
          within(card, 'day-no-live')[0]?.textContent ?? null,
          byAction('day-no-round').length,
          rounds ? descendants(rounds).find((n) => n.localName === 'dd')?.textContent : null,
        ],
        [[0, 10, 9], 'الجولات المسجَّلة: 0 من 9.', 0, 'لا طيور حيّة أوّل اليوم، فلا جولة تُنتظر.', 2 * 9, '0 من 9'],
        'W6 التقرير اليوميّ: «الجولات المسجَّلة 0 من 9» من الأفواج المنتظرة (rounds_expected، لا 10)، والقاعة التي بيعت طيورها قبل يومها بلا «لم تُسجَّل الجولة» (البطاقة والجدول للتسع وحدها)',
      );
    });
    await step('W6 تقرير الدورة', async () => {
      const report = B.flock_cycle_report_zero_live;
      fresh(MANAGER, { flock_cycle_report: () => clone(report) });
      await mount(`/halls/report/${report.flock.id}`);
      const week = byAction('week-rounds')[0];
      t.same(
        [
          report.days.filter((d) => !d.expects_round).length,
          byAction('rep-no-round').length,
          byAction('rep-no-live').length,
          byAction('rep-days-missing').length,
          week?.textContent ?? null,
          week?.getAttribute('class') ?? null,
        ],
        [4, 0, 4, 0, '3 من 3', null],
        'W6 تقرير الدورة: الأيّام الأربعة بلا طير حيّ «لا طيور حيّة أوّل اليوم» لا «لم تُسجَّل الجولة»، ولا «أيّام بلا جولة»، والأسبوع «3 من 3» بلا تنبيه (expected_days، كان «3 من 7»)',
      );
    });

    // ── W7 (O6): «أعد فتح الدورة» حين يجيزها الخادم ──────────────────────────────────────────────────────────────────────
    const REUSED = 'لا يُعاد فتح هذه الدورة: سُكّن في القاعة فوجٌ بعدها.';
    await step('W7 البطاقة', async () => {
      const blocked = B.flock_sales_reopen_blocked;
      fresh(MANAGER, { flock_sales: () => clone(blocked) });
      await mount('/broiler/flock/x', m.h(m.FlockCard, { flock: flockOf(blocked) }));
      const blockedSeen = [blocked.can.reopen, blocked.reopen_why, byAction('card-reopen').length, textOf('card-reopen-why')];
      await unmount();
      const open = B.flock_sales_closed;
      fresh(MANAGER, { flock_sales: () => clone(open) });
      await mount('/broiler/flock/x', m.h(m.FlockCard, { flock: flockOf(open) }));
      t.same(
        [blockedSeen, [open.can.reopen, open.reopen_why, byAction('card-reopen').length, byAction('card-reopen-why').length]],
        [[false, 'hall_reused', 0, REUSED], [true, null, 1, 0]],
        'W7 بطاقة الفوج المغلق: بلا «أعد فتح الدورة» والخادم لا يجيزها وجملة لماذا لا (reopen_why = hall_reused) للمدير؛ وبه حين يجيزها',
      );
    });
    await step('W7 التقرير', async () => {
      const blocked = B.flock_cycle_report_left_in_hall;
      fresh(MANAGER, { flock_cycle_report: () => clone(blocked), flock_sales: () => clone(B.flock_sales_reopen_blocked) });
      await mount(`/halls/report/${blocked.flock.id}`);
      const blockedSeen = [B.flock_sales_reopen_blocked.flock_id === blocked.flock.id, byAction('reopen-open').length, textOf('reopen-why')];
      await unmount();
      const open = B.flock_cycle_report_closed;
      fresh(MANAGER, { flock_cycle_report: () => clone(open), flock_sales: () => clone(B.flock_sales_closed) });
      await mount(`/halls/report/${open.flock.id}`);
      t.same(
        [blockedSeen, [B.flock_sales_closed.flock_id === open.flock.id, disabled(byAction('reopen-open')[0]), byAction('reopen-why').length]],
        [[true, 0, REUSED], [true, false, 0]],
        'W7 تقرير الدورة المغلقة: لا «أعد فتح الدورة» حين لا يجيزها الخادم (كان للمدير بدوره وحده) وجملة لماذا لا؛ والزرّ متاح حين يجيزها',
      );
    });
    await step('W7 ?act=reopen والقاعة أُعيد استعمالها', async () => {
      const report = B.flock_cycle_report_left_in_hall;
      fresh(MANAGER, { flock_cycle_report: () => clone(report), flock_sales: () => clone(B.flock_sales_reopen_blocked) });
      await mount(`/halls/report/${report.flock.id}?act=reopen`);
      t.same(
        [B.flock_sales_reopen_blocked.reopen_why, dialog() !== null, byAction('reopen-open').length, textOf('reopen-why')],
        ['hall_reused', false, 0, REUSED],
        'W7 ?act=reopen لا يفتح النافذة لدورة يرفض الخادم إعادة فتحها (hall_reused)، والجملة تقول لماذا',
      );
    });
    await step('W7 مقفول أثناء القراءة', async () => {
      const report = B.flock_cycle_report_closed;
      const reading = gate();
      fresh(MANAGER, { flock_cycle_report: () => clone(report), flock_sales: () => reading.promise.then(() => clone(B.flock_sales_closed)) });
      await mount(`/halls/report/${report.flock.id}?act=reopen`);
      const before = [disabled(byAction('reopen-open')[0]), dialog() !== null];
      reading.open();
      await settle(30);
      t.same(
        [B.flock_sales_closed.can.reopen, before, disabled(byAction('reopen-open')[0]), byAction('reopen-text').length],
        [true, [true, false], false, 1],
        'W7 «أعد فتح الدورة» مقفول ولا نافذة ما دامت قراءة ما يجوز في الطريق، ثمّ ?act=reopen يفتحها حين يجيزها الخادم',
      );
    });

    // ── W8 (M3): المقبوض الذي رُدّ ────────────────────────────────────────────────────────────────────────────────────
    await step('W8 الفاتورة', async () => {
      const sale = B.bird_sale_detail_refunded;
      fresh(ACCOUNTANT, { bird_sale_detail: () => clone(sale) });
      await mount(`/sales/birds/${sale.id}`);
      t.same(
        [sale.payment_refunded, sale.money.paid_now, textOf('bird-paper-paid'), byAction('bird-payment-refunded').length, textOf('bird-paper-credit')],
        [true, '0', `المقبوض الآن:قُبض في «${sale.account_name}» ثمّ رُدّ للتاجر، فالمبلغ كلّه بالدين`, 1, `الباقي على الحساب:${m.fmtInt(Number(sale.money.total))} دينار`],
        'W8 ورقة الفاتورة وصفحتها: المقبوض رُدّ للتاجر بصندوقه والمبلغ كلّه بالدين (كانت «لا شيء»)، والباقي على الحساب كلّه من الخادم',
      );
    });
    await step('W8 قائمة المبيعات', async () => {
      const overview = B.sales_overview_refunded;
      fresh(ACCOUNTANT, { sales_overview: () => clone(overview) });
      await mount('/sales');
      const heads = headersOf(/^فواتير الطيور من/u) ?? [];
      const rows = rowsOf(/^فواتير الطيور من/u) ?? [];
      t.same(
        [overview.birds.rows.map((row) => [row.paid, row.payment_refunded]), rows.map((row) => row[heads.indexOf('الدفع')])],
        [[['credit', true]], ['بالدين بعد ردّ المقبوض']],
        'W8 قائمة المبيعات: فاتورة الطيور التي رُدّ مقبوضها «بالدين بعد ردّ المقبوض» (كانت «بالدين» بلا ما حدث)',
      );
    });

    // ── W9 (O4، أجوبة المالك 2026-11-13): الفاتورة المتأخّرة، بعيّنات القاعدة الحقيقية (3eb8bc2: _late) ────────────────────────────
    const PARTY = { id: B.bird_sale_detail.party_id, name: B.bird_sale_detail.party_name };
    const BOX = { id: B.record_bird_sale_paid.cash_account_id, name: B.record_bird_sale_paid.account_name };
    const pickers = { searchSuppliers: () => ({ parties: [PARTY], total: 1 }), listBoxes: () => [BOX] };
    /** يملأ النموذج: التاجر من البحث، وسعر الكيلو إن لم يُقترح، و«المقبوض الآن» (الصندوق الوحيد يُختار وحده)، ثمّ «أصدر الفاتورة». */
    const fillAndSubmit = async (price) => {
      type(all().find((n) => n.localName === 'input' && n.getAttribute('type') === 'search'), 'تاجر');
      await settle(20);
      await click(byAction('pick-party')[0]);
      if (price !== null) type(inputBy('-price'), price);
      type(inputBy('-paid'), '1000');
      await settle(20);
      const paidDay = textOf('bird-paid-day');
      fire(byAction('bird-sale-form')[0], 'submit');
      await settle();
      return { paidDay, confirm: within(dialog(), 'bird-confirm-text')[0]?.textContent ?? '' };
    };
    await step('W9 النموذج وتأكيده', async () => {
      const form = B.bird_sale_form_late;
      const ticketDay = m.fmtDay(form.ticket.on_date);
      const today = m.fmtDay(form.today);
      fresh(ACCOUNTANT, { bird_sale_form: () => clone(form) }, pickers);
      await mount(`/sales/birds/new?ticket=${form.ticket.id}`);
      const late = textOf('bird-late');
      const facts = text().includes(`يوم الفاتورة: ${today} (اليوم)، ويوم التذكرة ${ticketDay}`);
      const { paidDay, confirm } = await fillAndSubmit(form.suggested_price === null ? '2000' : null);
      t.same(
        [[form.late, form.invoice_on, form.paid_on, form.ticket.on_date < form.today, form.ticket.invoice_late], late, facts, paidDay],
        [
          [true, form.today, form.today, true, true],
          `التذكرة ${form.ticket.ticket_no} بيوم ${ticketDay}، أقدم من سبعة أيّام: تُسجَّل الفاتورة بتاريخ اليوم ${today}، وتخرج الطيور من القاعات بتاريخ التذكرة ${ticketDay}.والمقبوض الآن يدخل الصندوق بتاريخ اليوم ${today}.`,
          true,
          null,
        ],
        'W9 نموذج فاتورة التذكرة الأقدم من سبعة أيّام (bird_sale_form_late): الفاتورة بتاريخ اليوم والطيور تخرج بيوم التذكرة والمقبوض يدخل الصندوق اليوم، صراحةً (أجوبة المالك 2026-11-13)',
      );
      t.same(
        [
          confirm.startsWith(`تُسجَّل فاتورة BR بتاريخ اليوم ${today} لأنّ التذكرة أقدم من سبعة أيّام، بمبلغ `),
          confirm.includes(`وتخرج ${form.flocks[0].birds} طير من «${form.flocks[0].hall_name}» بتاريخ التذكرة ${ticketDay}.`),
          confirm.includes(`ويُقبض الآن 1,000 دينار في «${BOX.name}» بتاريخ اليوم ${today}`),
        ],
        [true, true, true],
        `W9 التأكيد يسمّي يوم الفاتورة (اليوم) ويوم خروج الطيور (يوم التذكرة) ويوم دخول المقبوض الصندوق (${confirm})`,
      );
    });
    await step('W9 المقبوض يوم الإصدار وتذكرة يومٍ مضى', async () => {
      // bird_sale_form_open: تذكرة في حدّ الأيّام السبعة، فالفاتورة بيومها (invoice_on) والمقبوض يدخل الصندوق يوم إصدارها (paid_on = اليوم).
      const form = B.bird_sale_form_open;
      fresh(ACCOUNTANT, { bird_sale_form: () => clone(form) }, pickers);
      await mount(`/sales/birds/new?ticket=${form.ticket.id}`);
      const { paidDay, confirm } = await fillAndSubmit(form.suggested_price === null ? '2000' : null);
      const ticketDay = m.fmtDay(form.ticket.on_date);
      const today = m.fmtDay(form.today);
      t.same(
        [
          [form.late, form.invoice_on, form.paid_on],
          byAction('bird-late').length,
          text().includes(`يوم الفاتورة: ${ticketDay} (يوم التذكرة)`),
          paidDay,
          confirm.startsWith('تُسجَّل فاتورة BR بمبلغ '),
          confirm.includes(`ويُقبض الآن 1,000 دينار في «${BOX.name}» بتاريخ اليوم ${today}`),
        ],
        [[false, form.ticket.on_date, form.today], 0, true, `يدخل المقبوض الصندوق بتاريخ اليوم ${today}، والفاتورة بتاريخ ${ticketDay}.`, true, true],
        'W9 تذكرة يومٍ مضى في الحدّ: الفاتورة بيوم التذكرة، والمقبوض يدخل الصندوق بتاريخ اليوم (paid_on) يقوله النموذج والتأكيد',
      );
    });
    await step('W9 الممنوع بطريقه', async () => {
      const locked = B.bird_sale_form_period_locked_late;
      fresh(ACCOUNTANT, { bird_sale_form: () => clone(locked) });
      await mount(`/sales/birds/new?ticket=${locked.ticket.id}`);
      const lockedText = text();
      const lockedForm = byAction('bird-sale-form').length;
      await unmount();
      const scope = B.bird_sale_form_out_of_scope;
      fresh(ACCOUNTANT, { bird_sale_form: () => clone(scope) });
      await mount(`/sales/birds/new?ticket=${scope.ticket.id}`);
      t.same(
        [
          [locked.why, locked.late, locked.invoiceable],
          lockedText.includes(`يوم التذكرة ${m.fmtDay(locked.ticket.on_date)} في فترة مقفلة، والطيور تخرج من القاعات بيوم التذكرة، فلا تُصدر فاتورتها. إن كان اليوم صحيحاً فاطلب من مالك المنشأة فتح الفترة.`),
          lockedText.includes('أقدم من سبعة أيّام: تُسجَّل الفاتورة'),
          lockedForm,
          text().includes('دفتر وحدة هذا الحقل خارج نطاقك، فلا تُصدر فيه فاتورة طيور. يصدرها مالك المنشأة أو من في نطاقه دفتر الوحدة.'),
          byAction('bird-sale-form').length,
        ],
        [['period_locked', true, false], true, false, 0, true, 0],
        'W9 الممنوع الباقي بجملة تقول من يفعل ماذا ولا نموذج: يوم التذكرة في فترة مقفلة (bird_sale_form_period_locked_late، ولو كانت متأخّرة لا تُعرض جملة التأريخ) ونطاق الدفتر',
      );
    });
    await step('W9 التذكرة', async () => {
      const late = B.weigh_ticket_late;
      fresh(ACCOUNTANT, { weigh_ticket: () => clone(late) });
      await mount(`/halls/ticket/${late.id}`);
      const lateSeen = [late.invoice_late, late.can.invoice, byAction('ticket-invoice').length, textOf('ticket-invoice-late')];
      await unmount();
      // التذكرة نفسها كما في نموذج الفاتورة الممنوعة (weigh_ticket_json بلا can)، بأفعالها كما يرسلها الخادم لها (لا «أصدر الفاتورة» مع invoice_why).
      const locked = { ...clone(B.bird_sale_form_period_locked_late.ticket), can: { edit: false, finish: false, void: false, invoice: false } };
      fresh(ACCOUNTANT, { weigh_ticket: () => clone(locked) });
      await mount(`/halls/ticket/${locked.id}`);
      t.same(
        [lateSeen, locked.invoice_why, byAction('ticket-invoice').length, textOf('ticket-invoice-why')],
        [
          [true, true, 1, `التذكرة أقدم من سبعة أيّام: تُسجَّل فاتورتها بتاريخ اليوم، وتخرج الطيور من القاعات بتاريخ التذكرة ${m.fmtDay(late.on_date)}.`],
          'period_locked',
          0,
          `يوم التذكرة ${m.fmtDay(locked.on_date)} في فترة مقفلة، فلا تُصدر فاتورتها. إن كان اليوم صحيحاً فاطلب من مالك المنشأة فتح الفترة.`,
        ],
        'W9 التذكرة المكتملة الأقدم من سبعة أيّام (weigh_ticket_late): «أصدر الفاتورة» وجملة أنّها تُؤرَّخ اليوم والطيور بيومها (invoice_late)؛ والممنوعة بسببها وطريقه (invoice_why)',
      );
    });
    await step('W9 القوائم', async () => {
      // القائمتان من القاعدة بتذكرة متأخّرة، ومعها صفّ ممنوع بشكل الصفّ نفسه (invoice_why = period_locked، كتذكرة النموذج الممنوع).
      const list = clone(B.weigh_tickets_awaiting_late);
      const lateRow = list.rows[0];
      list.rows.push({ ...clone(lateRow), id: B.bird_sale_form_period_locked_late.ticket.id, ticket_no: B.bird_sale_form_period_locked_late.ticket.ticket_no, invoice_why: 'period_locked', invoiceable: false });
      fresh(ACCOUNTANT, { weigh_tickets: () => clone(list) });
      await mount('/halls/tickets');
      const tickets = [byAction('tickets-late').map((n) => n.textContent), byAction('tickets-why').map((n) => n.textContent)];
      await unmount();
      const overview = clone(B.sales_overview_late);
      const lateAwaiting = overview.birds.awaiting[0];
      const blocked = { ...clone(lateAwaiting), ticket_id: B.bird_sale_form_period_locked_late.ticket.id, ticket_no: B.bird_sale_form_period_locked_late.ticket.ticket_no, invoiceable: false, why: 'period_locked' };
      overview.birds.awaiting.push(blocked);
      fresh(ACCOUNTANT, { sales_overview: () => clone(overview) });
      await mount('/sales');
      const links = byAction('invoice-ticket').map((n) => href(n));
      t.same(
        [
          [lateRow.invoice_late, lateRow.invoiceable, lateAwaiting.late, lateAwaiting.invoiceable],
          tickets,
          byAction('awaiting-late').map((n) => n.textContent),
          byAction('awaiting-why').map((n) => n.textContent),
          links.map((link) => link.includes(lateAwaiting.ticket_id)),
        ],
        [[true, true, true, true], [['تُؤرَّخ فاتورتها اليوم'], ['يومها في فترة مقفلة']], ['تُؤرَّخ فاتورتها اليوم'], ['يومها في فترة مقفلة: يفتحها مالك المنشأة'], [true]],
        'W9 تذاكر الوزن والمبيعات (weigh_tickets_awaiting_late وsales_overview_late): المتأخّرة «تُؤرَّخ فاتورتها اليوم» و«أصدر الفاتورة» لها، والممنوعة بسببها بلا «أصدر الفاتورة»',
      );
    });
    await step('W9 الورقة', async () => {
      const late = B.bird_sale_detail_late;
      fresh(ACCOUNTANT, { bird_sale_detail: () => clone(late) });
      await mount(`/sales/birds/${late.id}`);
      const lateSeen = [textOf('bird-paper-date'), textOf('bird-paper-ticket-date'), textOf('bird-paper-paid')];
      await unmount();
      // المقبوض يوم الإصدار بعد يوم الفاتورة (paid_on بعد sold_on، الفاتورة الملغاة تحمل مقبوضها): يومه على الورقة.
      const paidLater = B.bird_sale_detail_void;
      fresh(ACCOUNTANT, { bird_sale_detail: () => clone(paidLater) });
      await mount(`/sales/birds/${paidLater.id}`);
      t.same(
        [lateSeen, [paidLater.sold_on, paidLater.paid_on], textOf('bird-paper-paid'), byAction('bird-paper-ticket-date').length],
        [
          [`التاريخ: ${m.fmtDay(late.sold_on)}`, `يوم التذكرة وخروج الطيور: ${m.fmtDay(late.ticket_on)}`, `المقبوض الآن:${m.fmtInt(Number(late.money.paid_now))} دينار في «${late.account_name}»`],
          ['2026-11-11', '2026-11-12'],
          `المقبوض الآن:${m.fmtInt(Number(paidLater.money.paid_now))} دينار في «${paidLater.account_name}» بتاريخ ${m.fmtDay(paidLater.paid_on)}`,
          0,
        ],
        'W9 ورقة الفاتورة: المتأخّرة بيومها (sold_on) ويوم التذكرة وخروج الطيور (ticket_on)، والمقبوض بيومه (paid_on) حين يخالف يوم الفاتورة',
      );
    });
    {
      // المحلّلات: مفاتيح أجوبة المالك كما أرسلها الخادم، وغيابها (خادم قبلها) سلوك اليوم: الفاتورة والتذكرة والمقبوض بيوم الفاتورة.
      const strip = (value, keys) => {
        const out = clone(value);
        for (const key of keys) delete out[key];
        return out;
      };
      const form = m.birds.parseBirdSaleForm(clone(B.bird_sale_form_late));
      const oldForm = m.birds.parseBirdSaleForm({ ...strip(B.bird_sale_form_late, ['invoice_on', 'late', 'paid_on']), ticket: strip(B.bird_sale_form_late.ticket, ['invoice_late']) });
      const sale = m.birds.parseBirdSale(clone(B.record_bird_sale_late));
      const refunded = m.birds.parseBirdSale(clone(B.bird_sale_detail_refunded));
      const oldSale = m.birds.parseBirdSale(strip(B.record_bird_sale_late, ['ticket_on', 'paid_on']));
      const ticket = m.tickets.parseWeighTicket(clone(B.weigh_ticket_late));
      const oldTicket = m.tickets.parseWeighTicket(strip(B.weigh_ticket_late, ['invoice_late']));
      const section = m.birds.parseBirdSalesSection(clone(B.sales_overview_late.birds));
      const oldSection = m.birds.parseBirdSalesSection({ ...clone(B.sales_overview_late.birds), awaiting: B.sales_overview_late.birds.awaiting.map((row) => strip(row, ['late'])) });
      t.same(
        [
          [form.late, form.invoiceOn, form.paidOn, form.ticket.invoiceLate],
          [oldForm.late, oldForm.invoiceOn, oldForm.paidOn, oldForm.ticket.invoiceLate],
          [sale.soldOn, sale.ticketOn, sale.paidOn, refunded.paidOn],
          [oldSale.soldOn, oldSale.ticketOn, oldSale.paidOn],
          [ticket.invoiceLate, oldTicket.invoiceLate],
          [section.awaiting.map((row) => row.late), oldSection.awaiting.map((row) => row.late)],
          'on' in sale,
        ],
        [
          [true, '2026-11-12', '2026-11-12', true],
          [false, B.bird_sale_form_late.ticket.on_date, B.bird_sale_form_late.ticket.on_date, false],
          ['2026-11-12', '2026-11-04', '2026-11-12', null],
          ['2026-11-12', '2026-11-12', '2026-11-12'],
          [true, false],
          [[true], [false]],
          false,
        ],
        'W9 المحلّلات: يوم الفاتورة sold_on ويوم التذكرة ticket_on ويوم المقبوض paid_on (null حين رُدّ) كما أرسلها الخادم، وبلا مفاتيح أجوبة المالك (خادم قبلها) الثلاثة يوم الفاتورة وlate = false',
      );
      t.same(
        [m.birds.FORM_WHY.includes('too_old'), Array.isArray(m.tickets.INVOICE_WHY) && !m.tickets.INVOICE_WHY.includes('too_old')],
        [false, true],
        'W9 too_old لم يعد يُرسل: لا يقبله المحلّلان (FORM_WHY وINVOICE_WHY)',
      );
    }
    await step('W9 نموذج الإغلاق: يوم خروج الطيور', async () => {
      // فاتورة متأخّرة على الفوج: يومها (sold_on) بعد يوم تذكرتها (ticket_on) بأكثر من سبعة أيّام؛ وعمود «اليوم» يوم خروج الطيور وتحته يوم الفاتورة.
      const form = clone(B.flock_close_form);
      Object.assign(form.sales.invoices[0], { ticket_on: '2026-11-02', sold_on: '2026-11-10' });
      fresh(MANAGER, { flock_close_form: () => clone(form) });
      await mount(`/halls/close/${form.flock.id}`);
      const rows = rowsOf('فواتير الطيور المرحّلة') ?? [];
      t.same(
        [B.flock_close_form.sales.invoices.map((row) => row.ticket_on === row.sold_on), rows.map((row) => row[0]), textOf('close-invoice-day')],
        [[true], ['02/11/2026الفاتورة بتاريخ 10/11/2026'], 'الفاتورة بتاريخ 10/11/2026'],
        'W9 «أغلق الدورة»: فاتورة الطيور تحت «اليوم» بيوم خروج الطيور (ticket_on) وتحته يوم الفاتورة حين يختلف (كانت يوم الفاتورة sold_on وحده)',
      );
    });

    // ── W10 (O10): جملة الطيور في المبيعات ──────────────────────────────────────────────────────────────────────────────
    await step('W10', async () => {
      fresh(ACCOUNTANT, { sales_overview: () => clone(B.sales_overview) });
      await mount('/sales');
      t.eq(textOf('bird-profit-note'), 'إيراد الطيور وكلفة الفوج في تقرير الفوج؛ الربح بعد كلفة الفراخ.', 'W10 المبيعات: إيراد الطيور وكلفة الفوج في تقرير الفوج، والربح بعد كلفة الفراخ (كخلاصة المال؛ كانت «ربح الطيور في تقرير الفوج»)');
    });
  } finally {
    if (root) {
      try {
        m?.flushSync(() => root.unmount());
      } catch {
        // swallow-ok: التنظيف بعد فحص رمى
      }
    }
    if (undoClock) undoClock();
    for (const [name, descriptor] of [['sessionStorage', saved.session], ['localStorage', saved.local]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    delete globalThis.__w8;
    restore();
  }
}
