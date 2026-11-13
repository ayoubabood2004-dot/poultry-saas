// تقارير القاعات للوكيل أ (0027، كلمة المالك 2026-11-12؛ docs/HALLS_REPORTS_PLAN.md التسليم ١ وعقد scratchpad/reports/contract-0027.md): react-dom/client
// الحقيقي على DOM صغير (dom.mjs) يشغّل التقرير اليوميّ وتقارير الدورات عبر HallsRoutes الحقيقية، وصفحة «التقارير»، والتذكير المختصر في «شغل اليوم»،
// وrepo/hallReports الحقيقي (المحلّلات وبناء النداء) على core بديل يسجّل كلّ نداء ويجيب بأجوبة العقد (fixtures/reports-contract.json، مكتوبة باليد قبل
// الهجرة: حقلان، وقاعة بجولة كاملة، وقاعة بلا جولة وباقٍ سالب وسطر بلا وزن، وقاعة فارغة، وفوج بيّاض ببيضه، وقاعة مؤرشفة أُغلق فوجها يومها، وقيم null).
// الحالات:
// S التوصيل: مساران في HallsRoutes ومساران في App، والاستثناء من التثبيت المسبق بالاسم (vite.config وpwa-guard وسطر DECISIONS)، وhallReports وحدة
//   صفحات في write-guard ولا يصدّرها repo/index.
// P المحلّلات: الأشكال كما في العقد، والغائب null لا صفر، والسالب، والمراتب، والرفض بخطأ شكل يسمّي الخانة.
// D التقرير اليوميّ: halls_day(null) بلا ?on= (يوم الخادم)، والأسهم والمنتقي والرابط، و«التالي» مقفول عند يوم الخادم، و«السابق» مقفول بـprev، واليوم
//   القادم برفضه وطريقه، والقراءة الأخيرة تبقى حين تفشل التالية و«أعد المحاولة»، وبطاقات الهاتف والجدول لكلّ حقل بصفّ مجاميع الخادم و«من N قاعة»، و«—»
//   لكلّ null، والطباعة بعنوانها وA4 بالعرض، والمشاركة نصّاً حرفاً (والنسخ والإلغاء)، والروابط إلى التقويم وتقرير الدورة برجوع يقبله قارئوه، والرجوع بـ?back=.
// C تقارير الدورات: الجدول بترتيبه و«قائمة»، وروابط التقارير برجوع إليها، والمزيد والفراغ والفشل.
// H صفحة «التقارير»: المدخلان لمن بنطاقه حقول، وما خُطّط بعدُ.
// E المداخل: بند الشريط لمن بنطاقه حقول لحم أو بيض، وصفّ «تقرير القاعات اليومي» في «شغل اليوم» بعد جواب الخادم (لا يُعدّ شغلاً)، والرجوع منه.
// X أجوبة القاعدة الحقيقية (fixtures/reports-0027.json من supabase/tests/reports.test بـREPORTS_SAMPLES_OUT=1) بالمحلّلات والصفحات الحقيقية، حين توجد.
// R مراجعة 0027 (R1–R5 وN1–N2، على 52ca9fd: feed_given_cum_unweighed وfeed_given_unweighed في المجاميع): مجاميع «النازل» بسطور اليوم بلا وزن، و«الباقي
//   في القاعة» بسطوره بلا وزن حتى اليوم وسبب سالبه، وتقرير مفتوح بعد منتصف الليل (ساعة مزيّفة)، والتقويم يحمل رجوعه وكلّ قارئ لـ?back= يقبل الأطول
//   ويرفض الغريب، و«التقارير» بالتقارير القائمة لمن يفتحها الشريط. كلّ فحص منها يفشل على 52ca9fd بمفاتيح المحلّل وحدها.
// RR27 المراجعة الثانية لـ0027 (على 781f78b): زرّ رجوع جدول اللقاحات يسمّي التقويم (R4b)؛ وسبب الباقي السالب على الموزون وحده حين نزل علف بلا وزن
//   (F2a). كلّ فحص منها يفشل على 781f78b. (وF4a، ساعة الجهاز أمام الخادم، طواه H4.)
// H4 المراجعة الرابعة لـ0027 (على 9ac82f7: halls_day(null) يجيب بيوم الخادم): ثلاث جولات رقّعت اختيار «اليوم» من ساعة الجهاز (F4a ثمّ H1 ثمّ
//   V3-H1-ON-CAP وV3-H1-STEP-AFTER-UNMOUNT) فحُذف الاختيار: بلا ?on= الصفحة تتبع اليوم بـnull فلا رفض ولا خطوة ولا حدّ من يوم مرفوض؛ والعودة (الظهور
//   والتركيز) تقرأ مرّةً واحدة: null حين لا معروض أو يوم الجهاز غير يوم المعروض، و?on= يومَه حين يوم الجهاز بعد يوم الخادم في المعروض؛ و«اليوم» ظاهر ما
//   دامت لا تتبع اليوم ويعود إليها، و«اليوم التالي» والمنتقي حدّهما يوم الخادم؛ ورفض D7 لـ?on= بعد يوم الخادم كما كان. كلّ فحص H4 يفشل على DailyPage
//   في 9ac82f7.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'reports-contract.json'), 'utf8'));
const HALLS = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-contract.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__hr.session; export const sessionStore = { get: () => globalThis.__hr?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__hr.toasts.push(spec); }; export function Toaster() { return null; }',
};
// core بديل لملفّات repo: call يسجّله __hr.rpc والمحلّل الحقيقي يقرأ الجواب.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__hr.rpc(fn, args);
export const send = async () => { throw new Error('halls-reports: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ userId: globalThis.__hr?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;
const plugins = [
  {
    name: 'hr-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'hr-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'hr-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'hr-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'hr-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as HallsRoutes, Reminders } from './src/pages/halls/HallsRoutes.tsx';",
    "export { default as ReportsPage } from './src/pages/reports/ReportsPage.tsx';",
    "export { dayShareText, dayTitle, fromHalls } from './src/pages/halls/DailyPage.tsx';",
    "export { backTarget, backLabel, reportsBack } from './src/pages/halls/parts.tsx';",
    "export { giveBack } from './src/pages/halls/GivePage.tsx';",
    "export * as repo from './src/lib/repo/hallReports.ts';",
    "export { HallsShapeError } from './src/lib/repo/halls.ts';",
    "export { visibleNav } from './src/lib/nav.ts';",
    "export { localDay, addDays } from './src/domain/dates.ts';",
    "export { RejectedError, NetworkError } from './src/lib/errors.ts';",
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
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const within = (node, name) => (node ? descendants(node).filter((n) => n.getAttribute('data-action') === name) : []);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const text = () => body().textContent;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
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
const dialog = () => all().find((n) => n.getAttribute('role') === 'dialog') ?? null;
const submitDialog = async () => {
  fire(descendants(dialog()).find((n) => n.localName === 'form'), 'submit');
  await settle();
};
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
const tableRows = (caption) => {
  const table = tableOf(caption);
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableFoot = (caption) => {
  const table = tableOf(caption);
  const tfoot = table ? descendants(table).find((n) => n.localName === 'tfoot') : null;
  return tfoot ? tfoot.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableHeaders = (caption) => {
  const table = tableOf(caption);
  return table ? descendants(table).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null;
};
const styleText = () => all().filter((n) => n.localName === 'style').map((n) => n.textContent).join('\n');
const fmt = (day) => day.split('-').reverse().join('/');
const LRI = '\u{2066}';
const PDI = '\u{2069}';

const S1 = '00000000-0000-4000-8000-000000000101';
const S2 = '00000000-0000-4000-8000-000000000102';
const H1 = '00000000-0000-4000-8000-000000000201';
const H2 = '00000000-0000-4000-8000-000000000202';
const H3 = '00000000-0000-4000-8000-000000000203';
const L1 = '00000000-0000-4000-8000-000000000204';
const L2 = '00000000-0000-4000-8000-000000000205';
const F1 = '00000000-0000-4000-8000-000000000301';
const F2 = '00000000-0000-4000-8000-000000000302';

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role),
  canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const OWNER = { status: 'ready', workspace: ws('owner'), offline: false };

export default async function (t) {
  const restore = installDom();
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let root = null;
  let m = null;
  const printed = [];
  globalThis.window.print = () => printed.push(globalThis.document.title);
  globalThis.document.title = 'نظام الدواجن';
  try {
    m = await bundle();
    const TODAY = m.localDay();
    const YESTERDAY = m.addDays(TODAY, -1);
    /**
     * جواب halls_day للعقد بيوم المطلوب، واليوم الحاليّ يوم الجهاز (فالفحص لا يتعلّق بتاريخ تشغيله)؛ وon الفارغ (null) يومُ الخادم الحاليّ كما يجيب
     * halls_day(null) منذ 9ac82f7 (اليوم في over.today إن أُعطي، وإلّا يوم الجهاز).
     */
    const dayFor = (on, over = {}) => {
      const day = on ?? over.today ?? TODAY;
      return { ...clone(F.halls_day), on: day, today: TODAY, next: day < TODAY, ...over };
    };
    const fresh = (session, rpcs = {}) => {
      const rpcLog = [];
      globalThis.__hr = {
        session,
        toasts: [],
        location: null,
        rpc(fn, args) {
          rpcLog.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          const count = rpcLog.filter(([name]) => name === fn).length;
          return Promise.resolve().then(() => handler(args, count));
        },
      };
      return rpcLog;
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const lastToast = () => globalThis.__hr.toasts.at(-1)?.title ?? null;

    const mount = async (url, element = null) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Shell() {
        const location = m.useLocation();
        globalThis.__hr.location = `${location.pathname}${location.search}`;
        return m.h(
          m.Routes,
          null,
          m.h(m.Route, { path: '/halls/*', element: m.h(m.HallsRoutes) }),
          m.h(m.Route, { path: '/reports', element: m.h(m.ReportsPage) }),
          m.h(m.Route, { path: '*', element }),
        );
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Shell))));
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
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };
    const cards = () => byAction('day-cards').flatMap((node) => within(node, 'day-hall'));
    const card = (hallId) => cards().find((node) => node.getAttribute('data-hall') === hallId) ?? null;
    /** نصّ dd لمؤشّر في بطاقة قاعة. */
    const stat = (hallId, action) => {
      const box = within(card(hallId), action)[0];
      return box ? (descendants(box).find((n) => n.localName === 'dd')?.textContent ?? null) : null;
    };
    const totalStat = (action, name) => descendants(byAction(action)[0] ?? body()).filter((n) => n.getAttribute('data-action') === name).map((n) => descendants(n).find((c) => c.localName === 'dd')?.textContent ?? null)[0] ?? null;
    const href = (node) => node?.getAttribute('href') ?? null;
    const backOf = (link) => new URLSearchParams((href(link) ?? '').split('?')[1] ?? '').get('back');

    // ── S: التوصيل ────────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const routes = readFileSync(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'), 'utf8');
      const app = readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
      t.same(
        [
          routes.includes('path="day" element={<DailyPage />}'),
          routes.includes('path="cycles" element={<CyclesPage />}'),
          app.includes('<Route path="/halls/*" element={<HallsRoutes />} />'),
          app.includes('<Route path="/reports" element={<ReportsPage />} />'),
          app.includes("page(() => import('./pages/reports/ReportsPage'))"),
        ],
        [true, true, true, true, true],
        'S التقرير اليوميّ وتقارير الدورات بمساريهما في HallsRoutes، و/halls/* و/reports في App، و«التقارير» حزمة كسولة لحالها',
      );
      const vite = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
      const pwa = await import(pathToFileURL(path.join(ROOT, 'scripts', 'guards', 'pwa-guard.mjs')).href);
      const decisions = readFileSync(path.join(ROOT, 'docs', 'DECISIONS.md'), 'utf8');
      t.same(
        [
          vite.includes("'**/ReportsPage-*.{js,css}'"),
          pwa.EXCLUDED_BY_NAME.some((entry) => entry.name === 'ReportsPage' && entry.pattern.test('assets/ReportsPage-Ab12_x-Y.js')),
          pwa.NOT_PRECACHED.some((pattern) => pattern.test('assets/ReportsPage-Ab12_x-Y.js')),
          pwa.NOT_PRECACHED.some((pattern) => pattern.test('assets/ReportsDay-Ab12_x-Y.js')),
          pwa.exclusionRecordProblems(decisions).filter((problem) => problem.startsWith('ReportsPage')),
        ],
        [true, true, true, false, []],
        'S «التقارير» خارج التثبيت المسبق بالاسم كالقاعات: globIgnores وقائمة pwa-guard وسطرها في DECISIONS «السقوف المقيسة»',
      );
      const write = await import(pathToFileURL(path.join(ROOT, 'scripts', 'guards', 'write-guard.mjs')).href);
      const index = readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'index.ts'), 'utf8');
      t.same([write.PAGE_MODULES.has('hallReports'), index.includes('hallReports')], [true, false], 'S hallReports وحدة صفحات في write-guard، وrepo/index لا يصدّرها (مسار الجلسة)');
    }

    // ── P: المحلّلات ───────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const day = m.repo.parseHallsDay(clone(F.halls_day));
      const [h1, h2, h3] = day.sites[0].halls;
      const [l1, l2] = day.sites[1].halls;
      t.same(
        [day.on, day.today, day.prev, day.next, day.sites.map((site) => [site.name, site.halls.length]), h3.flock],
        ['2026-11-12', '2026-11-12', true, false, [['حقل الأمير', 3], ['حقل البيض', 2]], null],
        'P halls_day: اليوم واليوم الحاليّ والتنقّل، والحقول بقاعاتها، والقاعة الفارغة flock null',
      );
      t.same(
        [h1.flock.round, h1.flock.dead, h1.flock.liveEnd, h1.flock.mortalityCumPct, h1.flock.feedEatenKg, h1.flock.feedEatenCumKg, h1.flock.feedLeftKg, h1.flock.weight, h1.flock.lastWeight, h1.flock.fcr],
        [true, 3, 11987, 11n, 350000n, 1200500n, 799500n, { sampleCount: 50, avgG: 1805n }, { onDate: '2026-11-12', age: 6, avgG: 1805n }, null],
        'P قاعة بجولة: النافق والحيّ والنفوق بالمئات والكيلو بالآلاف والوزن بأعشار الغرام، وFCR الغائب null',
      );
      t.same(
        [h2.flock.round, h2.flock.dead, h2.flock.culled, h2.flock.feedEatenKg, h2.flock.feedGivenKg, h2.flock.feedGivenUnweighed, h2.flock.feedLeftKg, h2.flock.weight, h2.flock.issues.map((x) => [x.costKind, x.kg])],
        [false, null, null, null, 500000n, 1, -100000n, null, [['feed', 500000n], ['feed', null]]],
        'P قاعة بلا جولة: النافق والمستبعد والمأكول null لا صفر، والباقي سالب، وسطر القطعة بلا وزن null',
      );
      t.same(
        [l1.flock.kind, l1.flock.eggsTotal, l1.flock.eggsBroken, l1.flock.hdep, l2.flock.status, l2.flock.closedOn, l2.flock.feedEatenKg, l2.flock.eggsTotal, l2.flock.hdep],
        ['layer', 4100, 12, 8367n, 'closed', '2026-11-12', null, null, null],
        'P البيّاض: البيض ونسبة الإنتاج، والفوج المغلق يومه بجولة بلا علف ولا بيض (null)',
      );
      t.same(
        [day.sites[0].totals, day.totals.feedEatenKg, day.totals.feedEatenFlocks],
        [{ halls: 3, flocks: 2, rounds: 1, liveStart: 21980, dead: 3, culled: 0, liveEnd: 21977, feedEatenKg: 350000n, feedEatenFlocks: 1, feedGivenKg: 500000n, feedGivenUnweighed: 1 }, 900000n, 2],
        'P مجاميع الخادم كما هي (لا جمع في المحلّل)',
      );
      // 52ca9fd: سطور العلف بلا وزن حتى اليوم لكلّ فوج (feed_given_cum_unweighed)، وفي مجاميع اليوم (feed_given_unweighed)، عدداً صحيحاً إلزامياً.
      t.same(
        [
          [h1.flock.feedGivenCumUnweighed, h2.flock.feedGivenCumUnweighed, l1.flock.feedGivenCumUnweighed, l2.flock.feedGivenCumUnweighed],
          [...day.sites.map((site) => site.totals.feedGivenUnweighed), day.totals.feedGivenUnweighed],
        ],
        [[0, 1, 0, 0], [1, 0, 1]],
        'P سطور العلف بلا وزن حتى اليوم لكلّ فوج، وسطور اليوم بلا وزن في مجموع كلّ حقل وكلّ الحقول',
      );
      const bad = (mutate) => {
        const json = clone(F.halls_day);
        mutate(json);
        try {
          m.repo.parseHallsDay(json);
          return 'لم يرمِ';
        } catch (error) {
          return error instanceof m.HallsShapeError ? error.field : `رمى ${error}`;
        }
      };
      t.same(
        [
          bad((json) => { json.sites[0].halls[0].flock.dead = '3'; }),
          bad((json) => { json.sites[0].halls[1].flock.feed_eaten_kg = 0; }),
          bad((json) => { json.sites[0].halls[0].flock.status = 'preparing'; }),
          bad((json) => { delete json.sites[0].totals.rounds; }),
          bad((json) => { json.sites[0].halls[0].flock.vaccines[0].color = 10; }),
          bad((json) => { json.sites[0].halls[0].flock.feed_left_kg = '1.2345'; }),
          bad((json) => { json.sites[0].halls[0].flock.round = 1; }),
          bad((json) => { delete json.sites[0].halls[1].flock.feed_given_cum_unweighed; }),
          bad((json) => { json.sites[0].halls[1].flock.feed_given_cum_unweighed = '1'; }),
          bad((json) => { delete json.sites[1].totals.feed_given_unweighed; }),
          bad((json) => { json.totals.feed_given_unweighed = null; }),
        ],
        ['dead', 'feed_eaten_kg', 'status', 'rounds', 'color', 'feed_left_kg', 'round', 'feed_given_cum_unweighed', 'feed_given_cum_unweighed', 'feed_given_unweighed', 'feed_given_unweighed'],
        'P خطأ الشكل يسمّي الخانة: نصّ مكان عدد، وعدد مكان نصّ عشري، وحالة خارج العقد، وخانة غائبة، ولون خارج اللوحة، ومراتب زائدة، وعلم غير منطقي، وعدّا السطور بلا وزن غائبين أو بغير عدد',
      );
      const cycles = m.repo.parseFlockCycles(clone(F.flock_cycles));
      t.same(
        [cycles.today, cycles.more, cycles.cycles.map((row) => [row.hallName, row.status, row.closedOn, row.through, row.age, row.days, row.live, row.mortalityPct])],
        ['2026-11-12', false, [
          ['قاعة 1', 'active', null, '2026-11-12', 6, 7, 11987, 11n],
          ['قاعة 2', 'active', null, '2026-11-12', 6, 7, 9990, 10n],
          ['قاعة البيض 1', 'active', null, '2026-11-12', 223, 104, 4897, 206n],
          ['قاعة البيض 2', 'closed', '2026-11-12', '2026-11-12', 315, 196, 2700, 1000n],
          ['قاعة 1', 'closed', '2026-10-30', '2026-10-30', 40, 41, 10500, 455n],
        ]],
        'P flock_cycles: الدورات بترتيب الخادم، والإغلاق null للقائمة',
      );
    }

    // ── D: التقرير اليوميّ ──────────────────────────────────────────────────────────────────────────────────────────────
    const dayUrl = `/halls/day?on=${TODAY}`;
    const here = `/halls/day?${new URLSearchParams({ on: TODAY }).toString()}`;
    await step('D1 الفتح بلا ?on=', async () => {
      const rpcLog = fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount('/halls/day');
      t.same(named(rpcLog, 'halls_day'), [{ p_on: null }], 'D1 بلا ?on= تتبع الصفحة اليوم: halls_day(null) فيجيب الخادم بيومه، لا يوم الجهاز (H4 R-a؛ كان يوم الجهاز)');
      t.same(
        [textOf('day-title'), textOf('day-rounds'), textOf('day-org'), byAction('day-site').map((n) => n.getAttribute('data-site')), byAction('day-site').map((n) => descendants(n).find((c) => c.localName === 'h2')?.textContent)],
        [`تقرير القاعات اليومي — ${fmt(TODAY)}`, 'الجولات المسجَّلة: 3 من 4.', 'مشروع الدواجن', [S1, S2], ['حقل الأمير', 'حقل البيض']],
        'D1 العنوان بتاريخه، والجولات المسجَّلة من الأفواج، واسم المنشأة للطباعة، وقسم لكلّ حقل باسمه',
      );
      const back = byAction('back')[0];
      t.same([back?.textContent, href(back)], ['رجوع إلى التقارير', '/reports'], 'D1 الرجوع الافتراضيّ إلى «التقارير»');
    });

    await step('D2 بطاقات الهاتف', async () => {
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(dayUrl);
      t.same(cards().map((n) => n.getAttribute('data-hall')), [H1, H2, H3, L1, L2], 'D2 بطاقة لكلّ قاعة بترتيب الخادم');
      t.same(
        [
          within(card(H1), 'day-age')[0]?.textContent,
          ['stat-live', 'stat-mortality', 'stat-dead', 'stat-culled', 'stat-eaten', 'stat-given', 'stat-left', 'stat-weight'].map((name) => stat(H1, name)),
          within(card(H1), 'day-medicine').map((n) => n.textContent),
          within(card(H1), 'day-vaccine').map((n) => [n.textContent, n.getAttribute('data-state')]),
          within(card(H1), 'day-note')[0]?.textContent,
          within(card(H1), 'day-no-round').length,
        ],
        [
          'لاحم، العمر 6 أيام',
          ['11,987', '0.11%', '3', '0', '350 كغم', '0 كغم', '799.5 كغم', '180.5'],
          ['أموكسيسيلين 500 غرام (0.5 كغم)', 'فيتامين AD3E (1 مل لكلّ لتر)'],
          [['IBتمّ', 'done'], ['NDاليوم', 'today']],
          'ملاحظة: تهوية جيّدة',
          0,
        ],
        'D2 قاعة بجولة: العمر والحيّ والنفوق التراكميّ والنافق والمستبعد والمأكول والنازل والباقي والوزن، والأدوية صرفاً وتسجيلاً، واللقاحات بحالتها، والملاحظة',
      );
      t.same(
        [
          within(card(H2), 'day-no-round').map((n) => n.textContent),
          ['stat-dead', 'stat-culled', 'stat-eaten', 'stat-given', 'stat-left', 'stat-weight'].map((name) => stat(H2, name)),
          within(card(H2), 'day-medicine').length,
          within(card(H2), 'day-vaccine').map((n) => n.textContent),
        ],
        [
          ['لم تُسجَّل الجولة'],
          ['—', '—', '—', '500 كغموسطر واحد بلا وزن', `${LRI}-100${PDI} كغمخارج الكيلو: سطر واحد بلا وزن.سالب: المأكول المسجّل أكثر من النازل الموزون.`, '—آخر وزن 150.0 يوم 10/11/2026'],
          0,
          ['NDاليوم'],
        ],
        'D2 قاعة بلا جولة: «لم تُسجَّل الجولة» و«—» لا صفر، والنازل بسطره بلا وزن، والباقي السالب معزولاً بما لم يدخله وسببه، وآخر وزن قبل اليوم، والعلف ليس من الأدوية',
      );
      t.same(
        [href(within(card(H1), 'day-report-link')[0]), href(within(card(H2), 'day-calendar-link')[0])],
        [`/halls/report/${F1}?${new URLSearchParams({ back: here }).toString()}`, `/halls/calendar/${F2}?${new URLSearchParams({ m: TODAY.slice(0, 7), back: here }).toString()}`],
        'D2 من كلّ قاعة بفوج: تقرير دورتها وتقويم شهر اليوم، برجوع إلى هذا اليوم',
      );
      t.same(
        [within(card(H3), 'day-empty').map((n) => n.textContent), within(card(H3), 'stat-live').length, within(card(H3), 'day-report-link').length],
        [['فارغة'], 0, 0],
        'D2 القاعة الفارغة «فارغة» بلا أرقام ولا روابط',
      );
      t.same(
        [within(card(L1), 'day-age')[0]?.textContent, stat(L1, 'stat-eggs'), stat(L1, 'stat-hdep'), stat(L1, 'stat-weight'), within(card(L2), 'day-closed')[0]?.textContent, stat(L2, 'stat-eaten'), stat(L2, 'stat-eggs'), stat(L2, 'stat-hdep')],
        ['بيّاض، العمر 223 يوماً', '4,100', '83.67%', '—', 'أُغلقت الدورة يوم 12/11/2026.', '—', '—', '—'],
        'D2 البيّاض بالبيض ونسبة الإنتاج، والفوج المغلق يومه، و«—» للعلف والبيض الغائبين',
      );
      t.same(
        [
          ['total-live', 'total-rounds', 'total-dead', 'total-culled', 'total-eaten', 'total-given'].map((name) => totalStat('day-site-total', name)),
          ['total-live', 'total-rounds', 'total-dead', 'total-culled', 'total-eaten', 'total-given'].map((name) => totalStat('day-all-total', name)),
        ],
        [
          ['21,977', '1 من 2', '3من قاعة واحدة', '0من قاعة واحدة', '350 كغممن قاعة واحدة', '500 كغموسطر واحد بلا وزن'],
          ['29,574', '3 من 4', '5من 3 قاعات', '1من 3 قاعات', '900 كغممن قاعتين', '500 كغموسطر واحد بلا وزن'],
        ],
        'D2 مجموع الحقل ومجموع الحقول ببطاقة: أرقام الخادم و«من N قاعة» حين تنقص الجولات أو العلف، والنازل بسطوره بلا وزن',
      );
    });

    await step('D3 الجدول لكلّ حقل وصفّ المجاميع', async () => {
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(dayUrl);
      const s1 = `حقل الأمير — ${fmt(TODAY)}`;
      const s2 = `حقل البيض — ${fmt(TODAY)}`;
      const base = ['القاعة', 'العمر (يوم)', 'الحيّ أوّل اليوم', 'النافق', 'المستبعد', 'الحيّ آخر اليوم', 'النفوق التراكمي', 'المأكول (كغم)', 'النازل (كغم)', 'الباقي في القاعة (كغم)', 'الوزن (غرام)'];
      t.same(
        [tableHeaders(s1), tableHeaders(s2)],
        [[...base, 'الأدوية واللقاحات وغيرها', 'الملاحظة'], [...base, 'البيض', 'نسبة الإنتاج', 'الأدوية واللقاحات وغيرها', 'الملاحظة']],
        'D3 جدول لكلّ حقل، وعمودا البيض ونسبة الإنتاج لحقل فيه بيّاض وحده',
      );
      t.same(
        tableRows(s1),
        [
          ['قاعة 1التقويمتقرير الدورة', '6', '11,990', '3', '0', '11,987', '0.11%', '350', '0', '799.5', '180.5', 'أموكسيسيلين 500 غرام (0.5 كغم)فيتامين AD3E (1 مل لكلّ لتر)IBتمّNDاليوم', 'تهوية جيّدة'],
          [
            'قاعة 2لم تُسجَّل الجولةالتقويمتقرير الدورة', '6', '9,990', '—', '—', '9,990', '0.10%', '—', '500وسطر واحد بلا وزن',
            '-100.0خارج الكيلو: سطر واحد بلا وزن.سالب: المأكول المسجّل أكثر من النازل الموزون.', 'آخر وزن 150.0 يوم 10/11/2026', 'NDاليوم', '—',
          ],
          ['قاعة 3فارغة', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—'],
        ],
        'D3 صفوف الحقل: الأرقام بمراتب عمودها، و«—» لكلّ null (لا صفر)، والقاعة الفارغة',
      );
      t.same(
        tableFoot(s1),
        [['المجموع', '21,980', '3من قاعة واحدة', '0من قاعة واحدة', '21,977', '', '350من قاعة واحدة', '500وسطر واحد بلا وزن', '', '', '', '']],
        'D3 صفّ المجاميع من الخادم: النافق والمستبعد والمأكول «من قاعة واحدة» حين تنقص الجولات، والنازل بسطوره بلا وزن، والباقي والوزن بلا مجموع',
      );
      t.same(
        [tableRows(s2), tableFoot(s2)],
        [
          [
            ['قاعة البيض 1التقويمتقرير الدورة', '223', '4,900', '2', '1', '4,897', '2.06%', '550', '0', '500', '—', '4,100', '83.67%', '—', '—'],
            ['قاعة البيض 2التقويمتقرير الدورة', '315', '2,700', '0', '0', '2,700', '10.00%', '—', '0', '0', '—', '—', '—', '—', '—'],
          ],
          [['المجموع', '7,600', '2', '1', '7,597', '', '550من قاعة واحدة', '0', '', '', '', '', '', '']],
        ],
        'D3 حقل البيض: الجولات كاملة فلا «من»، والمأكول من قاعة واحدة',
      );
      t.same(
        [tableHeaders('مجموع كلّ الحقول'), tableRows('مجموع كلّ الحقول')],
        [
          ['القاعات', 'الأفواج', 'الجولات المسجَّلة', 'الحيّ أوّل اليوم', 'النافق', 'المستبعد', 'الحيّ آخر اليوم', 'المأكول (كغم)', 'النازل (كغم)'],
          [['5', '4', '3', '29,580', '5من 3 قاعات', '1من 3 قاعات', '29,574', '900من قاعتين', '500وسطر واحد بلا وزن']],
        ],
        'D3 مجموع كلّ الحقول صفّاً واحداً من الخادم',
      );
    });

    await step('D4 الهاتف والشاشة العريضة والطباعة', async () => {
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(dayUrl);
      const css = styleText();
      t.same(
        [
          css.includes('@page { size: A4 landscape; margin: 10mm; }'),
          css.includes('[data-action="day-table"] { display: none; }'),
          css.includes('@media (min-width: 768px) { [data-action="day-cards"] { display: none; } [data-action="day-table"] { display: block; } }'),
          css.includes('[data-action="day-cards"] { display: none !important; }'),
          css.includes('[data-action="day-table"] { display: block !important; }'),
        ],
        [true, true, true, true, true],
        'D4 البطاقات بالهاتف (390)، والجداول من 768 وفي الطباعة A4 بالعرض',
      );
      t.same(
        byAction('day-site').map((site) => [within(site, 'day-cards').length, within(site, 'day-table').length, within(within(site, 'day-table')[0], 'day-hall').length, descendants(within(site, 'day-table')[0] ?? body()).some((n) => n.localName === 'table')]),
        [[1, 1, 0, true], [1, 1, 0, true]],
        'D4 لكلّ حقل البطاقات والجدول في حاويتين يبدّلهما <style> الصفحة (بلا أصناف جديدة)',
      );
      await click(byAction('print-day')[0]);
      t.same(printed.at(-1), `تقرير القاعات اليومي — ${fmt(TODAY)}`, 'D4 «اطبع أو احفظ PDF» بعنوان الورقة (اسم ملفّ PDF)');
      fire(globalThis.window, 'afterprint', { bubbles: false });
      t.eq(globalThis.document.title, 'نظام الدواجن', 'D4 العنوان يعود بعد الطباعة');
    });

    await step('D5 الأسهم والمنتقي والرابط', async () => {
      const rpcLog = fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount('/halls/day');
      const bar = () => ({
        prev: disabled(byAction('day-prev')[0]),
        next: disabled(byAction('day-next')[0]),
        today: byAction('day-today').length,
        pick: textOf('day-pick'),
      });
      t.same([bar(), textOf('day-prev'), textOf('day-next')], [{ prev: false, next: true, today: 0, pick: fmt(TODAY) }, 'اليوم السابق', 'اليوم التالي'], 'D5 اليوم: «اليوم التالي» مقفول، ولا «اليوم»');
      await click(byAction('day-prev')[0]);
      t.same(
        [globalThis.__hr.location, named(rpcLog, 'halls_day').at(-1), textOf('day-title'), bar()],
        [`/halls/day?on=${YESTERDAY}`, { p_on: YESTERDAY }, `تقرير القاعات اليومي — ${fmt(YESTERDAY)}`, { prev: false, next: false, today: 1, pick: fmt(YESTERDAY) }],
        'D5 «اليوم السابق»: اليوم في الرابط والنداء والعنوان، و«اليوم التالي» مفتوح و«اليوم» ظاهر',
      );
      await click(byAction('day-next')[0]);
      t.same([globalThis.__hr.location, named(rpcLog, 'halls_day').at(-1), bar().next], ['/halls/day', { p_on: null }, true], 'D5 «اليوم التالي» إلى يوم الخادم يتبع اليوم: الرابط بلا ?on= والنداء null (H4 R-c)');
      await click(byAction('day-prev')[0]);
      await click(byAction('day-today')[0]);
      t.same([globalThis.__hr.location, bar().today], ['/halls/day', 0], 'D5 «اليوم» يعود إلى اليوم');
      await click(byAction('day-pick')[0]);
      const input = () => descendants(dialog()).find((n) => n.getAttribute('data-action') === 'day-pick-input');
      t.same([Boolean(dialog()), input()?.value], [true, fmt(TODAY)], 'D5 المنتقي باليوم المطلوب يوم/شهر/سنة');
      type(input(), fmt(m.addDays(TODAY, 1)));
      await submitDialog();
      t.same([Boolean(dialog()), dialog() ? descendants(dialog()).some((n) => n.textContent === 'التاريخ بعد اليوم.') : false, globalThis.__hr.location], [true, true, '/halls/day'], 'D5 يوم بعد اليوم يُرفض في المنتقي');
      type(input(), '31/02/2026');
      await submitDialog();
      t.ok(descendants(dialog()).some((n) => n.textContent === 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.'), 'D5 تاريخ غير موجود يُرفض بجملته');
      const picked = m.addDays(TODAY, -5);
      type(input(), fmt(picked));
      await submitDialog();
      t.same([Boolean(dialog()), globalThis.__hr.location, named(rpcLog, 'halls_day').at(-1)], [false, `/halls/day?on=${picked}`, { p_on: picked }], 'D5 المنتقي يفتح اليوم المكتوب في الرابط');
    });

    await step('D5 «اليوم السابق» مقفول بلا فوج قبله، ورابط بيوم غير موجود', async () => {
      const rpcLog = fresh(OWNER, { halls_day: (args) => dayFor(args.p_on, { prev: false }) });
      await mount('/halls/day?on=2026-02-30');
      t.same([named(rpcLog, 'halls_day'), disabled(byAction('day-prev')[0])], [[{ p_on: null }], true], 'D5 يوم غير موجود في الرابط كأنّه غائب (تتبع اليوم بـnull)، و«اليوم السابق» مقفول بـprev من الخادم');
    });

    await step('D6 القراءة الأخيرة تبقى حين تفشل التالية', async () => {
      let release = null;
      const rpcLog = fresh(OWNER, {
        halls_day: (args, n) => {
          if (n === 1) return dayFor(args.p_on);
          if (n === 2) return new Promise((_, reject) => { release = () => reject(new m.NetworkError()); });
          return dayFor(args.p_on);
        },
      });
      await mount('/halls/day');
      await click(byAction('day-prev')[0]);
      t.same(
        [textOf('day-title'), textOf('day-stale'), cards().length, disabled(byAction('print-day')[0]), disabled(byAction('share-day')[0]), textOf('day-pick')],
        [`تقرير القاعات اليومي — ${fmt(TODAY)}`, `جارٍ قراءة تقرير يوم ${fmt(YESTERDAY)}… المعروض تقرير يوم ${fmt(TODAY)}.`, 5, true, true, fmt(YESTERDAY)],
        'D6 أثناء قراءة يوم آخر: التقرير السابق باقٍ بتاريخه ويقال ذلك، والطباعة والمشاركة مقفولتان',
      );
      release();
      await settle();
      t.same(
        [text().includes(`تعذّر تحميل تقرير يوم ${fmt(YESTERDAY)}`), byAction('retry').length, textOf('day-title'), textOf('day-stale'), cards().length],
        [true, 1, `تقرير القاعات اليومي — ${fmt(TODAY)}`, `المعروض تقرير يوم ${fmt(TODAY)}، آخر ما قُرئ بنجاح.`, 5],
        'D6 فشلت القراءة: «تعذّر تحميل» بـ«أعد المحاولة»، والقراءة الأخيرة الناجحة باقية بتاريخها',
      );
      await click(byAction('retry')[0]);
      t.same(
        [named(rpcLog, 'halls_day').length, named(rpcLog, 'halls_day').at(-1), textOf('day-title'), byAction('day-stale').length, byAction('retry').length, disabled(byAction('print-day')[0])],
        [3, { p_on: YESTERDAY }, `تقرير القاعات اليومي — ${fmt(YESTERDAY)}`, 0, 0, false],
        'D6 «أعد المحاولة» يقرأ اليوم المطلوب ثانيةً ويعرضه',
      );
    });

    await step('D7 اليوم القادم بـ?on= صريح يُرفض بجملته وطريقه، والصفحة التي تتبع اليوم لا يصلها رفض', async () => {
      const FUTURE_HINT = 'لا تقرير ليوم لم يأتِ بعد.';
      const refuse = () => {
        throw new m.RejectedError('future_day', FUTURE_HINT);
      };
      const later = m.addDays(TODAY, 3);
      let rpcLog = fresh(OWNER, { halls_day: (args) => (args.p_on !== null && args.p_on > TODAY ? refuse() : dayFor(args.p_on)) });
      await mount(`/halls/day?on=${later}`);
      const way = byAction('day-refusal-way')[0];
      t.same([text().includes(FUTURE_HINT), way?.textContent, cards().length, byAction('day-today').length], [true, 'اليوم', 0, 1], 'D7 يوم بعد يوم الجهاز: تلميح الخادم وزرّ «اليوم» (و«اليوم» في الشريط: الصفحة لا تتبع اليوم)');
      await click(way);
      t.same(
        [globalThis.__hr.location, named(rpcLog, 'halls_day').at(-1), cards().length, byAction('day-today').length],
        ['/halls/day', { p_on: null }, 5, 0],
        'D7 و«اليوم» يتبع اليوم: halls_day(null) فيعرض يوم الخادم (H4؛ كان يومَ الجهاز)',
      );
      await unmount();
      // ساعة الجهاز قبل الخادم بيوم: يوم الجهاز نفسه «قادم» عند الخادم (يومه YESTERDAY)، وnull يومه.
      const behind = (args) => {
        const on = args.p_on ?? YESTERDAY;
        return on > YESTERDAY ? refuse() : dayFor(on, { today: YESTERDAY, next: on < YESTERDAY });
      };
      // H4 (R-a): الفتح بلا ?on= يتبع اليوم بـnull فيعرض يوم الخادم حاليّاً بنداء واحد بلا رفض. كان (9ac82f7): يوم الجهاز ثمّ خطوةً هادئة إلى اليوم قبله.
      rpcLog = fresh(OWNER, { halls_day: behind });
      await mount('/halls/day');
      t.same(
        [
          named(rpcLog, 'halls_day'),
          textOf('day-title'),
          text().includes(FUTURE_HINT),
          byAction('day-stale').length,
          cards().length,
          [disabled(byAction('day-next')[0]), byAction('day-today').length, disabled(byAction('print-day')[0]), disabled(byAction('share-day')[0])],
          globalThis.__hr.location,
        ],
        [[{ p_on: null }], `تقرير القاعات اليومي — ${fmt(YESTERDAY)}`, false, 0, 5, [true, 0, false, false], '/halls/day'],
        'D7 الفتح ويوم الجهاز بعد يوم الخادم: halls_day(null) نداءً واحداً فيُعرض يوم الخادم حاليّاً بلا رفض، و«اليوم التالي» مقفول ولا «اليوم»',
      );
      await unmount();
      // و?on= صريح بيوم الجهاز (بعد يوم الخادم): رفضٌ بطريقه «اليوم السابق» إلى يوم الخادم كما كان (D7). وهناك «اليوم التالي» مقفول عند يوم الخادم (كان
      // مفتوحاً إلى يوم الجهاز المرفوض)، و«اليوم» يتبع اليوم بـnull فيعرض يوم الخادم بلا رفض (كان: «اليوم التالي» إلى يوم الجهاز ثمّ خطوة هادئة).
      rpcLog = fresh(OWNER, { halls_day: behind });
      await mount(`/halls/day?on=${TODAY}`);
      const explicit = [named(rpcLog, 'halls_day'), text().includes(FUTURE_HINT), textOf('day-refusal-way'), cards().length];
      await click(byAction('day-refusal-way')[0]);
      const landed = [globalThis.__hr.location, named(rpcLog, 'halls_day').at(-1), cards().length, disabled(byAction('day-next')[0]), byAction('day-today').length];
      await click(byAction('day-today')[0]);
      t.same(
        [
          explicit,
          landed,
          [globalThis.__hr.location, named(rpcLog, 'halls_day').slice(2), textOf('day-title'), text().includes(FUTURE_HINT), byAction('day-stale').length, disabled(byAction('day-next')[0]), byAction('day-today').length],
        ],
        [
          [[{ p_on: TODAY }], true, 'اليوم السابق', 0],
          [`/halls/day?on=${YESTERDAY}`, { p_on: YESTERDAY }, 5, true, 1],
          ['/halls/day', [{ p_on: null }], `تقرير القاعات اليومي — ${fmt(YESTERDAY)}`, false, 0, true, 0],
        ],
        'D7 ?on= بيوم الجهاز المرفوض: تلميح الخادم وطريقه «اليوم السابق» إلى يوم الخادم و«اليوم التالي» مقفول عنده، و«اليوم» يتبع اليوم بـnull فيعرضه بلا رفض',
      );
    });

    await step('D8 المشاركة نصّاً', async () => {
      const shared = [];
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, share: async (data) => shared.push(data) }, configurable: true, writable: true });
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(dayUrl);
      await click(byAction('share-day')[0]);
      const expected = [
        `تقرير القاعات اليومي — ${fmt(TODAY)}`,
        'الجولات المسجَّلة: 3 من 4.',
        '',
        'حقل الأمير',
        'قاعة 1 (لاحم، العمر 6 أيام): الحيّ 11,987، النافق 3، المستبعد 0، النفوق التراكمي 0.11%، العلف المأكول 350 كغم، النازل 0 كغم، الباقي في القاعة 799.5 كغم، الوزن 180.5 غرام، الأدوية واللقاحات وغيرها: أموكسيسيلين 500 غرام (0.5 كغم)، فيتامين AD3E (1 مل لكلّ لتر)، IB (تمّ)، ND (اليوم)، ملاحظة: تهوية جيّدة.',
        `قاعة 2 (لاحم، العمر 6 أيام): لم تُسجَّل الجولة، الحيّ 9,990، النفوق التراكمي 0.10%، النازل 500 كغم وسطر واحد بلا وزن، الباقي في القاعة ${LRI}-100${PDI} كغم (خارج الكيلو: سطر واحد بلا وزن؛ المأكول المسجّل أكثر من النازل الموزون)، الأدوية واللقاحات وغيرها: ND (اليوم).`,
        'قاعة 3: فارغة.',
        'المجموع: الحيّ 21,977، النافق 3 (من قاعة واحدة)، المستبعد 0 (من قاعة واحدة)، العلف المأكول 350 كغم (من قاعة واحدة)، النازل 500 كغم وسطر واحد بلا وزن.',
        '',
        'حقل البيض',
        'قاعة البيض 1 (بيّاض، العمر 223 يوماً): الحيّ 4,897، النافق 2، المستبعد 1، النفوق التراكمي 2.06%، العلف المأكول 550 كغم، النازل 0 كغم، الباقي في القاعة 500 كغم، البيض 4,100، نسبة الإنتاج 83.67%.',
        'قاعة البيض 2 (بيّاض، العمر 315 يوماً): الحيّ 2,700، النافق 0، المستبعد 0، النفوق التراكمي 10.00%، النازل 0 كغم، الباقي في القاعة 0 كغم.',
        'المجموع: الحيّ 7,597، النافق 2، المستبعد 1، العلف المأكول 550 كغم (من قاعة واحدة)، النازل 0 كغم.',
        '',
        'مجموع كلّ الحقول: الحيّ 29,574، النافق 5 (من 3 قاعات)، المستبعد 1 (من 3 قاعات)، العلف المأكول 900 كغم (من قاعتين)، النازل 500 كغم وسطر واحد بلا وزن.',
      ].join('\n');
      t.same(shared, [{ title: `تقرير القاعات اليومي — ${fmt(TODAY)}`, text: expected }], 'D8 navigator.share بالعنوان والنصّ بالفصحى: سطر لكلّ قاعة، و«لم تُسجَّل الجولة» و«فارغة»، ومجموع كلّ حقل وكلّ الحقول');
      t.eq(lastToast(), null, 'D8 المشاركة بنافذة الجهاز بلا تنبيه');
      await unmount();
      const copied = [];
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, clipboard: { writeText: async (value) => copied.push(value) } }, configurable: true, writable: true });
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(dayUrl);
      await click(byAction('share-day')[0]);
      t.same([copied, lastToast()], [[expected], 'نُسخ التقرير: الصقه في واتساب أو في أيّ رسالة.'], 'D8 بلا نافذة مشاركة: النصّ نفسه يُنسخ بتنبيه');
      await unmount();
      const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
      const copiedAfterAbort = [];
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, share: async () => { throw abort; }, clipboard: { writeText: async (value) => copiedAfterAbort.push(value) } }, configurable: true, writable: true });
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(dayUrl);
      await click(byAction('share-day')[0]);
      t.same([copiedAfterAbort.length, lastToast()], [0, null], 'D8 إلغاء نافذة المشاركة ليس فشلاً: لا نسخ ولا تنبيه');
      await unmount();
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, clipboard: { writeText: async () => { throw new Error('denied'); } } }, configurable: true, writable: true });
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(dayUrl);
      await click(byAction('share-day')[0]);
      t.eq(lastToast(), 'تعذّرت المشاركة والنسخ على هذا الجهاز. اطبع التقرير أو احفظه PDF بدلاً من ذلك.', 'D8 تعذّر النسخ يُقال بطريق الطباعة');
      if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
      else delete globalThis.navigator;
    });

    await step('D9 الروابط من كلّ قاعة والرجوع', async () => {
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(`${dayUrl}&back=%2Fbroiler`);
      const withBack = `/halls/day?${new URLSearchParams({ on: TODAY, back: '/broiler' }).toString()}`;
      const reportLinks = within(card(H1), 'day-report-link');
      const calendarLinks = within(card(H1), 'day-calendar-link');
      t.same(
        [href(reportLinks[0]), href(calendarLinks[0])],
        [`/halls/report/${F1}?${new URLSearchParams({ back: withBack }).toString()}`, `/halls/calendar/${F1}?${new URLSearchParams({ m: TODAY.slice(0, 7), back: withBack }).toString()}`],
        'D9 من البطاقة: تقرير الدورة، وتقويم شهر اليوم، برجوع إلى هذا اليوم ورجوعه هو',
      );
      const tableLinks = byAction('day-table').flatMap((node) => within(node, 'day-report-link'));
      t.same([tableLinks.length, href(tableLinks[0]) === href(reportLinks[0]), href(tableLinks[1])], [4, true, `/halls/report/${F2}?${new URLSearchParams({ back: withBack }).toString()}`], 'D9 ومن الجدول كذلك، لكلّ قاعة بفوج');
      // كلّ قارئ لـ?back= يقبل القيمة الجديدة: تقرير الدورة والتقويم بـbackTarget، ولا رابط من هنا إلى صفحة الإضافة (giveBack).
      t.same(
        [m.backTarget(backOf(reportLinks[0]), 'X'), m.backTarget(backOf(calendarLinks[0]), 'X'), all().filter((n) => n.localName === 'a' && (href(n) ?? '').startsWith('/halls/give')).length, m.backLabel(backOf(reportLinks[0]))],
        [withBack, withBack, 0, 'رجوع إلى تقرير القاعات اليومي'],
        'D9 الرجوع الجديد يقبله backTarget في تقرير الدورة والتقويم، واسمه «رجوع إلى تقرير القاعات اليومي»',
      );
      const back = byAction('back')[0];
      t.same([back?.textContent, href(back)], ['رجوع إلى الحقول', '/broiler'], 'D9 ?back=/broiler (رأس الحقل): «رجوع إلى الحقول»');
      await click(reportLinks[0]);
      t.eq(globalThis.__hr.location, `/halls/report/${F1}?${new URLSearchParams({ back: withBack }).toString()}`, 'D9 والنقر يفتح تقرير الدورة');
    });

    await step('D9 الرجوع من الرئيسية ومن رابط غريب', async () => {
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount('/halls/day?back=/');
      const home = [textOf('back'), href(byAction('back')[0])];
      await unmount();
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount(`/halls/day?back=${encodeURIComponent('https://evil.example/')}`);
      t.same([home, [textOf('back'), href(byAction('back')[0])]], [['رجوع إلى الرئيسية', '/'], ['رجوع إلى التقارير', '/reports']], 'D9 ?back=/ إلى الرئيسية، ورابط خارجيّ يُهمل');
    });

    await step('D10 لا قاعات في النطاق', async () => {
      fresh(OWNER, { halls_day: (args) => dayFor(args.p_on, { sites: [], totals: { halls: 0, flocks: 0, rounds: 0, live_start: 0, dead: 0, culled: 0, live_end: 0, feed_eaten_kg: '0', feed_eaten_flocks: 0, feed_given_kg: '0', feed_given_unweighed: 0 } }) });
      await mount(dayUrl);
      t.same([text().includes('لا قاعات في نطاقك.'), cards().length, byAction('day-table').length], [true, 0, 0], 'D10 بلا قاعات: جملة واحدة بلا جداول');
    });

    // ── C: تقارير الدورات ──────────────────────────────────────────────────────────────────────────────────────────────
    await step('C1 الجدول والروابط', async () => {
      const rpcLog = fresh(OWNER, { flock_cycles: () => clone(F.flock_cycles) });
      await mount('/halls/cycles');
      t.same(named(rpcLog, 'flock_cycles').length, 1, 'C1 flock_cycles مرّة');
      t.same(
        [textOf('cycles-title'), tableHeaders('تقارير الدورات'), tableRows('تقارير الدورات')],
        [
          'تقارير الدورات',
          ['القاعة', 'الحقل', 'النوع', 'التسكين', 'الإغلاق', 'العمر (يوم)', 'الحيّ', 'النفوق'],
          [
            ['قاعة 1', 'حقل الأمير', 'لاحم', '06/11/2026', 'قائمة', '6', '11,987', '0.11%'],
            ['قاعة 2', 'حقل الأمير', 'لاحم', '06/11/2026', 'قائمة', '6', '9,990', '0.10%'],
            ['قاعة البيض 1', 'حقل البيض', 'بيّاض', '01/08/2026', 'قائمة', '223', '4,897', '2.06%'],
            ['قاعة البيض 2', 'حقل البيض', 'بيّاض', '01/05/2026', '12/11/2026', '315', '2,700', '10.00%'],
            ['قاعة 1', 'حقل الأمير', 'لاحم', '20/09/2026', '30/10/2026', '40', '10,500', '4.55%'],
          ],
        ],
        'C1 كلّ الدورات بترتيب الخادم: القائمة «قائمة» والمغلقة بيوم إغلاقها، والدورة المغلقة لقاعة تشغلها دورة جديدة',
      );
      const links = byAction('cycle-report-link');
      t.same(
        [links.map((n) => href(n)), m.backTarget(backOf(links[0]), 'X'), textOf('back'), href(byAction('back')[0])],
        [F.flock_cycles.cycles.map((row) => `/halls/report/${row.id}?back=%2Fhalls%2Fcycles`), '/halls/cycles', 'رجوع إلى التقارير', '/reports'],
        'C1 كلّ دورة إلى تقريرها برجوع إلى تقارير الدورات (يقبله backTarget)، والرجوع إلى «التقارير»',
      );
      await click(links[4]);
      t.eq(globalThis.__hr.location, `/halls/report/${F.flock_cycles.cycles[4].id}?back=%2Fhalls%2Fcycles`, 'C1 والنقر يفتح تقرير الدورة المغلقة');
    });
    await step('C2 المزيد والفراغ والفشل', async () => {
      fresh(OWNER, { flock_cycles: () => ({ ...clone(F.flock_cycles), more: true }) });
      await mount('/halls/cycles?back=%2Freports');
      const more = text().includes('تُعرض أحدث 500 دورة.');
      const linkBack = backOf(byAction('cycle-report-link')[0]);
      await unmount();
      fresh(OWNER, { flock_cycles: () => ({ today: '2026-11-12', more: false, cycles: [] }) });
      await mount('/halls/cycles');
      const empty = text().includes('لا دورات في نطاقك بعد.');
      await unmount();
      const rpcLog = fresh(OWNER, { flock_cycles: (_args, n) => (n === 1 ? Promise.reject(new m.NetworkError()) : clone(F.flock_cycles)) });
      await mount('/halls/cycles');
      const failed = [text().includes('تعذّر تحميل تقارير الدورات'), byAction('retry').length];
      await click(byAction('retry')[0]);
      t.same(
        [more, linkBack, m.backTarget(linkBack, 'X'), empty, failed, named(rpcLog, 'flock_cycles').length, byAction('cycle-report-link').length],
        [true, '/halls/cycles?back=%2Freports', '/halls/cycles?back=%2Freports', true, [true, 1], 2, 5],
        'C2 أكثر من الحدّ يُقال، والرجوع يحمل رجوع الصفحة، والفراغ جملة، والفشل «أعد المحاولة»',
      );
    });

    // ── H: صفحة «التقارير» ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('H1 المداخل لمن بنطاقه حقول', async () => {
      const rpcLog = fresh(OWNER, { halls_day: (args) => dayFor(args.p_on) });
      await mount('/reports');
      t.same(
        [
          descendants(body()).find((n) => n.localName === 'h1')?.textContent,
          [byAction('reports-day')[0], byAction('reports-cycles')[0]].map((n) => [href(n), descendants(n).find((c) => c.localName === 'span')?.textContent]),
          descendants(byAction('reports-planned')[0] ?? body()).filter((n) => n.localName === 'li').length,
          text().includes('تُبنى في المرحلة'),
        ],
        ['التقارير', [['/halls/day', 'تقرير القاعات اليومي'], ['/halls/cycles', 'تقارير الدورات']], 3, false],
        'H1 «التقارير» صفحة مداخل: التقرير اليوميّ وتقارير الدورات، وما خُطّط بعدُ ثلاثة',
      );
      await click(byAction('reports-day')[0]);
      t.same([globalThis.__hr.location, named(rpcLog, 'halls_day'), textOf('back')], ['/halls/day', [{ p_on: null }], 'رجوع إلى التقارير'], 'H1 والمدخل يفتح التقرير اليوميّ (اليوم بـnull)، والرجوع منه إلى «التقارير»');
    });
    await step('H2 بلا حقول في النطاق', async () => {
      fresh({ status: 'ready', workspace: ws('mill_operator', { divisions: ['feed_mill'] }), offline: false });
      await mount('/reports');
      t.same([byAction('reports-halls').length, byAction('reports-planned').length], [0, 1], 'H2 مشغّل المعمل: بلا مدخلي القاعات، وما خُطّط بعدُ');
    });

    // ── E: المداخل ─────────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const nav = (workspace) => m.visibleNav({ status: 'ready', workspace, offline: false });
      const reports = (workspace) => nav(workspace).filter((item) => item.to === '/reports').map((item) => [item.label, typeof item.icon === 'object' || typeof item.icon === 'function']);
      t.same(
        [
          reports(ws('owner')),
          reports(ws('hall_worker', { divisions: ['broiler'] })),
          reports(ws('manager', { divisions: ['layer'] })),
          reports(ws('mill_operator', { divisions: ['feed_mill'] })),
          reports(ws('storekeeper', { divisions: ['general', 'medicine'] })),
          m.visibleNav({ status: 'not_configured' }).some((item) => item.to === '/reports'),
        ],
        [[['التقارير', true]], [['التقارير', true]], [['التقارير', true]], [], [], true],
        'E بند «التقارير» بأيقونته لمن بنطاقه حقول لحم أو بيض (والمالك وعامل القاعة)، لا لمشغّل المعمل ولا لأمين بلا حقول، والهيكل كلّه بلا قاعدة',
      );
    }
    await step('E صفّ «تقرير القاعات اليومي» في «شغل اليوم»', async () => {
      const counts = [];
      const reminder = (when) => ({ flock_id: F1, hall_id: H1, hall_name: 'قاعة 1', site_name: 'حقل الأمير', kind: 'broiler', vaccine_id: '00000000-0000-4000-8000-000000000021', name: 'IB', color: 0, age_day: 7, due_on: TODAY, when, linked: false, item: null });
      fresh(OWNER, { vaccine_reminders: () => ({ today: TODAY, can_mark: true, items: [reminder('today')] }), halls_day: (args) => dayFor(args.p_on) });
      await mount('/', m.h(m.Reminders, { compact: true, onCount: (n) => counts.push(n) }));
      const row = byAction('today-report')[0];
      t.same(
        [byAction('today-vaccines').length, row?.textContent, href(row), String(row?.style.order), counts.at(-1)],
        [1, 'تقرير القاعات اليومي', '/halls/day?back=/', '1', 1],
        'E بعد جواب الخادم صفّ «تقرير القاعات اليومي» آخر البطاقة (order)، ولا يُعدّ شغلاً (onCount للّقاحات وحدها)',
      );
      await click(row);
      t.same([globalThis.__hr.location, textOf('back'), href(byAction('back')[0])], ['/halls/day?back=/', 'رجوع إلى الرئيسية', '/'], 'E والصفّ يفتح التقرير اليوميّ برجوع إلى الرئيسية');
    });
    await step('E الصفّ بلا لقاح وبلا خادم', async () => {
      const counts = [];
      fresh(OWNER, { vaccine_reminders: () => ({ today: TODAY, can_mark: true, items: [] }) });
      await mount('/', m.h(m.Reminders, { compact: true, onCount: (n) => counts.push(n) }));
      const quiet = [byAction('today-vaccines').length, byAction('today-report').length, counts.at(-1)];
      await unmount();
      fresh(OWNER, { vaccine_reminders: () => Promise.reject(new m.NetworkError()) });
      await mount('/', m.h(m.Reminders, { compact: true }));
      t.same([quiet, byAction('today-report').length], [[0, 1, 0], 0], 'E بلا لقاح: الصفّ وحده و«أنجزت شغل اليوم» باقية (العدد صفر)؛ وبلا جواب الخادم لا صفّ');
    });

    // ── X: أجوبة القاعدة الحقيقية حين توجد ──────────────────────────────────────────────────────────────────────────
    const REAL_PATH = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'reports-0027.json');
    const REAL = existsSync(REAL_PATH) ? JSON.parse(readFileSync(REAL_PATH, 'utf8')) : null;
    t.ok(REAL !== null, 'X عيّنات القاعدة الحقيقية موجودة (reports-0027.json)');
    if (REAL) {
      await step('X0 المحلّلات بكلّ عيّنة حقيقية', async () => {
        const days = ['halls_day', 'halls_day_layer', 'halls_day_closed'].map((key) => REAL[key]);
        const parsed = days.map((sample) => m.repo.parseHallsDay(clone(sample)));
        const cycles = m.repo.parseFlockCycles(clone(REAL.flock_cycles));
        t.same(
          [days.every(Boolean), parsed.map((p) => p.sites.reduce((n, site) => n + site.halls.length, 0)), cycles.cycles.length],
          [true, days.map((d) => d.sites.reduce((n, site) => n + site.halls.length, 0)), REAL.flock_cycles.cycles.length],
          'X0 الأجوبة الثلاثة لليوم وقائمة الدورات تمرّ بالمحلّلات الحقيقية بلا خطأ شكل',
        );
      });
      await step('X1 التقرير اليوميّ بجواب القاعدة', async () => {
        const samples = [REAL.halls_day, REAL.halls_day_layer, REAL.halls_day_closed];
        for (const sample of samples) {
          fresh(OWNER, { halls_day: () => clone(sample) });
          await mount(`/halls/day?on=${sample.on}`);
          const halls = sample.sites.reduce((n, site) => n + site.halls.length, 0);
          t.same([textOf('day-title'), cards().length, byAction('day-table').length], [`تقرير القاعات اليومي — ${fmt(sample.on)}`, halls, sample.sites.length + (sample.sites.length > 1 ? 1 : 0)], `X1 جواب القاعدة ليوم ${sample.on}: بطاقة لكلّ قاعة وجدول لكلّ حقل`);
          await unmount();
        }
      });
      await step('X3 زرّ الرجوع باسم وجهته في التقرير الكامل والتقويم', async () => {
        const sample = REAL.flock_cycle_report;
        fresh(OWNER, { flock_cycle_report: () => clone(sample) });
        await mount(`/halls/report/${sample.flock.id}?back=${encodeURIComponent('/halls/cycles')}`);
        const fromCycles = [textOf('back'), href(byAction('back')[0])];
        await unmount();
        const month = HALLS.flock_month;
        fresh(OWNER, { flock_month: () => clone(month) });
        await mount(`/halls/calendar/${month.flock.id}?back=${encodeURIComponent('/halls/day?on=2026-11-03')}`);
        const fromDay = [textOf('back'), href(byAction('back')[0])];
        await unmount();
        fresh(OWNER, { flock_cycle_report: () => clone(sample) });
        await mount(`/halls/report/${sample.flock.id}`);
        const plain = textOf('back');
        await unmount();
        t.same(
          [fromCycles, fromDay, plain],
          [['رجوع إلى تقارير الدورات', '/halls/cycles'], ['رجوع إلى تقرير القاعات اليومي', '/halls/day?on=2026-11-03'], 'رجوع إلى القاعة'],
          'X3 التقرير الكامل من تقارير الدورات والتقويم من التقرير اليوميّ: الزرّ يسمّي وجهته؛ وبلا ?back= «رجوع إلى القاعة»',
        );
      });
      await step('X2 تقارير الدورات بجواب القاعدة', async () => {
        fresh(OWNER, { flock_cycles: () => clone(REAL.flock_cycles) });
        await mount('/halls/cycles');
        t.eq(byAction('cycle-report-link').length, REAL.flock_cycles.cycles.length, 'X2 جواب القاعدة: صفّ ورابط لكلّ دورة');
      });
    }

    // ── مراجعة 0027 (R1–R5 وN1–N2): كلّ إصلاح بفحص يفشل على 52ca9fd بمفاتيح المحلّل وحدها، بعيّنات القاعدة (أو نسخة عميقة منها لحالة حدّ) ─────────
    if (REAL) {
      const realOn = REAL.halls_day.on;
      const [SA, SL, SB] = REAL.halls_day.sites;
      const [A1, A2] = SA.halls;
      const [LH] = SL.halls;
      const [B5] = SB.halls;
      const siteOf = (id) => byAction('day-site').find((n) => n.getAttribute('data-site') === id) ?? null;
      const ddOf = (box) => (box ? (descendants(box).find((n) => n.localName === 'dd')?.textContent ?? null) : null);
      const siteTotal = (siteId, name) => ddOf(within(within(siteOf(siteId), 'day-site-total')[0], name)[0]);
      const allTotal = (name) => ddOf(within(byAction('day-all-total')[0], name)[0]);
      const shareLines = (json) => m.dayShareText(m.repo.parseHallsDay(clone(json))).text.split('\n');
      /** آخر جزء من سطر مجموع في نصّ المشاركة («النازل …»). */
      const givenOfTotals = (lines) => lines.filter((line) => line.startsWith('المجموع:') || line.startsWith('مجموع كلّ الحقول:')).map((line) => line.split('، ').at(-1));
      /** جزء «الباقي في القاعة» من سطر القاعة في نصّ المشاركة. */
      const leftOfHall = (lines, hallName) => lines.find((line) => line.startsWith(`${hallName} (`))?.split('، ').find((part) => part.startsWith('الباقي في القاعة'))?.replace(/\.$/u, '') ?? null;
      const NEG = 'سالب: المأكول المسجّل أكثر من النازل للقاعة.';
      // قاعة نزل لها علف بلا وزن: السالب على الموزون وحده (مراجعة 0027 RR27-F2a).
      const NEG_W = 'سالب: المأكول المسجّل أكثر من النازل الموزون.';
      const leftNotes = (node) => [within(node, 'remain-unweighed').map((n) => n.textContent), within(node, 'remain-negative').map((n) => n.textContent)];

      await step('R1 مجموع «النازل» بسطوره بلا وزن (عيّنة القاعدة)', async () => {
        fresh(OWNER, { halls_day: () => clone(REAL.halls_day) });
        await mount(`/halls/day?on=${realOn}`);
        t.same(
          [siteTotal(SA.id, 'total-given'), allTotal('total-given'), tableFoot(`${SA.name} — ${fmt(realOn)}`)?.[0]?.[7], tableRows('مجموع كلّ الحقول')?.[0]?.[8], siteTotal(SL.id, 'total-given')],
          ['9.2 كغموسطر واحد بلا وزن', '9.2 كغموسطر واحد بلا وزن', '9.2وسطر واحد بلا وزن', '9.2وسطر واحد بلا وزن', '0 كغم'],
          'R1 مجموع الحقل ومجموع الحقول (بطاقةً وجدولاً) يقولان سطر اليوم بلا وزن كصفّ القاعة، والحقل بلا سطر بلا وزن بكيلوه وحده',
        );
        t.same(
          givenOfTotals(shareLines(REAL.halls_day)),
          ['النازل 9.2 كغم وسطر واحد بلا وزن.', 'النازل 0 كغم.', 'النازل 0 كغم.', 'النازل 9.2 كغم وسطر واحد بلا وزن.'],
          'R1 نصّ المشاركة: مجموع الحقل ومجموع كلّ الحقول بسطور اليوم بلا وزن',
        );
      });

      await step('R1 يوم نزل فيه العلف بلا وزن وحده: لا «0 كغم» وحده في أيّ مجموع', async () => {
        // نسخة من عيّنة القاعدة: قاعة 2 بلا سطر الزيت الموزون، فعلف اليوم كلّه سطر واحد بلا وزن.
        const only = clone(REAL.halls_day);
        const flock = only.sites[0].halls[1].flock;
        flock.issues = flock.issues.filter((issue) => !(issue.cost_kind === 'feed' && issue.kg !== null));
        Object.assign(flock, { feed_given_kg: '0', feed_given_cum_kg: '1200.000', feed_left_kg: '-60.000' });
        only.sites[0].totals.feed_given_kg = '0';
        only.totals.feed_given_kg = '0';
        fresh(OWNER, { halls_day: () => clone(only) });
        await mount(`/halls/day?on=${realOn}`);
        t.same(
          [
            stat(A2.hall_id, 'stat-given'),
            siteTotal(SA.id, 'total-given'),
            allTotal('total-given'),
            tableFoot(`${SA.name} — ${fmt(realOn)}`)?.[0]?.[7],
            tableRows('مجموع كلّ الحقول')?.[0]?.[8],
            givenOfTotals(shareLines(only)),
          ],
          [
            '0 كغموسطر واحد بلا وزن',
            '0 كغموسطر واحد بلا وزن',
            '0 كغموسطر واحد بلا وزن',
            '0وسطر واحد بلا وزن',
            '0وسطر واحد بلا وزن',
            ['النازل 0 كغم وسطر واحد بلا وزن.', 'النازل 0 كغم.', 'النازل 0 كغم.', 'النازل 0 كغم وسطر واحد بلا وزن.'],
          ],
          'R1 العلف النازل بلا وزن وحده: القاعة والحقل وكلّ الحقول بطاقةً وجدولاً ونصّاً تقول سطره، لا «0 كغم» وحده',
        );
      });

      await step('R5 «الباقي في القاعة» بسطوره بلا وزن حتى اليوم وسبب سالبه (عيّنة القاعدة)', async () => {
        fresh(OWNER, { halls_day: () => clone(REAL.halls_day) });
        await mount(`/halls/day?on=${realOn}`);
        t.same(
          [A1, A2, LH, B5].map((hall) => leftNotes(card(hall.hall_id))),
          [
            [['خارج الكيلو: سطر واحد بلا وزن.'], [NEG_W]],
            [['خارج الكيلو: 3 سطور بلا وزن.'], [NEG_W]],
            [[], [NEG]],
            [['خارج الكيلو: سطر واحد بلا وزن.'], [NEG_W]],
          ],
          'R5 بطاقة القاعة: سطور العلف بلا وزن حتى اليوم (قاعة 1 وقاعة 5 نزل علفهما بلا وزن أمس) بجملة تقرير الدورة، وسبب الباقي السالب (قاعة البيّاض بلا صرف)',
        );
        t.eq(stat(A1.hall_id, 'stat-left'), `${LRI}-1,200${PDI} كغمخارج الكيلو: سطر واحد بلا وزن.${NEG_W}`, 'R5 الرقم نفسه كما هو (DECISIONS 0019) وتحته الملاحظتان باهتتين');
        t.same(
          byAction('day-table').map(leftNotes),
          [
            [['خارج الكيلو: سطر واحد بلا وزن.', 'خارج الكيلو: 3 سطور بلا وزن.'], [NEG_W, NEG_W]],
            [[], [NEG]],
            [['خارج الكيلو: سطر واحد بلا وزن.'], [NEG_W]],
            [[], []],
          ],
          'R5 جدول كلّ حقل: الملاحظتان تحت الرقم في خلية الباقي (ومجموع كلّ الحقول بلا عمود باقٍ)',
        );
        const lines = shareLines(REAL.halls_day);
        t.same(
          [A1, A2, LH, B5].map((hall) => leftOfHall(lines, hall.hall_name)),
          [
            `الباقي في القاعة ${LRI}-1,200${PDI} كغم (خارج الكيلو: سطر واحد بلا وزن؛ المأكول المسجّل أكثر من النازل الموزون)`,
            `الباقي في القاعة ${LRI}-50.8${PDI} كغم (خارج الكيلو: 3 سطور بلا وزن؛ المأكول المسجّل أكثر من النازل الموزون)`,
            `الباقي في القاعة ${LRI}-1,425${PDI} كغم (المأكول المسجّل أكثر من النازل)`,
            `الباقي في القاعة ${LRI}-105${PDI} كغم (خارج الكيلو: سطر واحد بلا وزن؛ المأكول المسجّل أكثر من النازل الموزون)`,
          ],
          'R5 نصّ المشاركة: الرقم كما هو، وبعده بين قوسين وباختصار ما لم يدخله وسبب سالبه',
        );
      });

      await step('R5 باقٍ موجب بسطور بلا وزن: الملاحظة الأولى وحدها', async () => {
        const positive = clone(REAL.halls_day);
        positive.sites[0].halls[1].flock.feed_left_kg = '10.000';
        fresh(OWNER, { halls_day: () => clone(positive) });
        await mount(`/halls/day?on=${realOn}`);
        t.same(
          [stat(A2.hall_id, 'stat-left'), leftNotes(card(A2.hall_id)), leftOfHall(shareLines(positive), A2.hall_name)],
          ['10 كغمخارج الكيلو: 3 سطور بلا وزن.', [['خارج الكيلو: 3 سطور بلا وزن.'], []], 'الباقي في القاعة 10 كغم (خارج الكيلو: 3 سطور بلا وزن)'],
          'R5 الملاحظتان مستقلّتان: باقٍ موجب لم يدخله ثلاثة سطور بلا وزن يقول ذلك وحده',
        );
      });

      // RR27-F2a: قاعة نزل لها علف بلا وزن لا تعرف الشاشة كلّ ما نزل لها، فسبب باقيها السالب على الموزون وحده؛ وبلا سطر بلا وزن الجملة كما كانت. لكلّ
      // قاعة باقيها سالب في عيّنة القاعدة (وعدد سطورها بلا وزن حتى اليوم من الخادم): البطاقة وخلية الجدول وسطر المشاركة.
      await step('RR27-F2a سبب الباقي السالب على الموزون وحده حين نزل علف بلا وزن (عيّنة القاعدة)', async () => {
        fresh(OWNER, { halls_day: () => clone(REAL.halls_day) });
        await mount(`/halls/day?on=${realOn}`);
        const lines = shareLines(REAL.halls_day);
        const seen = [];
        for (const site of REAL.halls_day.sites) {
          const rows = tableRows(`${site.name} — ${fmt(realOn)}`) ?? [];
          site.halls.forEach((hall, index) => {
            if (hall.flock === null || !hall.flock.feed_left_kg.startsWith('-')) return;
            const cell = rows[index]?.[9] ?? '';
            const share = leftOfHall(lines, hall.hall_name) ?? '';
            seen.push([
              hall.hall_name,
              hall.flock.feed_given_cum_unweighed,
              within(card(hall.hall_id), 'remain-negative').map((n) => n.textContent),
              cell.includes('سالب: ') ? `سالب: ${cell.split('سالب: ').at(-1)}` : null,
              share.split(/[(؛] ?/u).at(-1)?.replace(/\)$/u, '') ?? null,
            ]);
          });
        }
        const SHORT = 'المأكول المسجّل أكثر من النازل';
        const SHORT_W = 'المأكول المسجّل أكثر من النازل الموزون';
        t.same(
          seen,
          [
            ['قاعة 1', 1, [NEG_W], NEG_W, SHORT_W],
            ['قاعة 2', 3, [NEG_W], NEG_W, SHORT_W],
            ['قاعة البيّاض', 0, [NEG], NEG, SHORT],
            ['قاعة 5', 1, [NEG_W], NEG_W, SHORT_W],
          ],
          'RR27-F2a قاعة 1 و2 و5 نزل لها علف بلا وزن: «أكثر من النازل الموزون» بطاقةً وجدولاً ونصّاً؛ وقاعة البيّاض بلا سطر بلا وزن بجملتها كما كانت',
        );
      });

      // ── H4 (مراجعة 0027 الرابعة، على 9ac82f7: halls_day(null) يجيب بيوم الخادم app_today() حرفاً كجواب ذلك اليوم) ──────────────────────────────────
      // ثلاث جولات رقّعت اختيار «اليوم» من ساعة الجهاز، وكلّ رقعة فتحت فخّاً والهاتف أمام بغداد (RR27-F4a ثمّ H1 ثمّ V3-H1-ON-CAP: حدٌّ من يوم مرفوض يحبس
      // ?on= صريحاً تحت يوم الخادم بعد منتصف ليله، وV3-H1-STEP-AFTER-UNMOUNT: الخطوة الهادئة تقرأ بعد مغادرة الصفحة). فحُذف الاختيار كلّه:
      // R-a بلا ?on= (أو بيوم غير موجود) halls_day(null)، فلا يصل الصفحةَ التي تتبع اليوم رفضُ يومٍ لم يأتِ.
      // R-b العودة (الظهور والتركيز) تقرأ مرّةً: وهي تتبع اليوم null حين لا معروض أو يوم الجهاز غير يوم المعروض، وبـ?on= يومَه حين يوم الجهاز بعد يوم الخادم
      //     في المعروض؛ وحدثا العودة الواحدة قراءة واحدة، ولا مؤقّت ولا حلقة، ولا نداء بعد مغادرة الصفحة.
      // R-c «اليوم» ظاهر ما دامت لا تتبع اليوم ويعود إليها؛ و«اليوم التالي» ما دام المطلوب قبل يوم الخادم، وإلى يوم الخادم نفسه تتبع اليوم؛ والمنتقي حدّه
      //     يوم الخادم (ويوم الجهاز قبل أيّ جواب وحده).
      // R-d ?on= صريح بعد يوم الخادم برفض D7 وطريقه كما كان، وفشل الشبكة «تعذّر» والمعروض آخر ما قُرئ بتاريخه.
      // والعودة هنا كما في الهاتف: مغادرة (الإخفاء وترك التركيز) ثمّ الظهور فالتركيز (comeBack)؛ وفحص الحدثين يجرّب الترتيبين وبلا مغادرة أيضاً.
      const FUTURE = 'لا تقرير ليوم لم يأتِ بعد.';
      /** ساعة الجهاز يوم day من تشرين الثاني 2026 الساعة hour:minute، والخادم خلفها بـlag ساعة (سالبٌ: أمامها). at وlag يتغيّران أثناء الفحص. */
      const aheadClock = ({ day = 12, hour = 22, minute = 0, lag = 1 } = {}) => {
        const RealDate = globalThis.Date;
        const clock = {
          now: new RealDate(2026, 10, day, hour, minute, 0).getTime(),
          lag,
          at(on, h, mi) {
            clock.now = new RealDate(2026, 10, on, h, mi, 0).getTime();
          },
          serverDay: () => m.localDay(new RealDate(clock.now - clock.lag * 3_600_000)),
          restore() {
            globalThis.Date = RealDate;
            delete globalThis.document.visibilityState;
          },
        };
        globalThis.Date = class extends RealDate {
          constructor(...args) {
            if (args.length === 0) super(clock.now);
            else super(...args);
          }
        };
        return clock;
      };
      /** halls_day بساعة الخادم: null يومُه الحاليّ (app_today())، ويومٌ بعده future_day بتلميحه، وغيرهما جوابه بيوم الخادم. */
      const aheadServer = (clock) => (args) => {
        const today = clock.serverDay();
        const on = args.p_on ?? today;
        return on > today ? Promise.reject(new m.RejectedError('future_day', FUTURE)) : dayFor(on, { today, next: on < today });
      };
      /** نداء يبقى في الطريق حتى تُفتح بوّابته (open). */
      const gated = (server) => {
        const gate = { promise: null, open: null };
        gate.close = () => {
          gate.promise = new Promise((resolve) => {
            gate.open = resolve;
          });
        };
        gate.release = () => {
          const open = gate.open;
          gate.promise = null;
          gate.open = null;
          if (open) open();
        };
        gate.handler = (args) => (gate.promise ? gate.promise.then(() => server(args)) : server(args));
        return gate;
      };
      const calls = (rpcLog) => named(rpcLog, 'halls_day').map((args) => args.p_on);
      const dayView = () => ({
        title: textOf('day-title'),
        pick: textOf('day-pick'),
        refused: text().includes(FUTURE),
        stale: textOf('day-stale'),
        failed: byAction('retry').length,
        next: disabled(byAction('day-next')[0]),
        today: byAction('day-today').length,
        print: disabled(byAction('print-day')[0]),
        share: disabled(byAction('share-day')[0]),
        url: globalThis.__hr.location,
      });
      /** تقرير يوم day حاليّاً والصفحة تتبع اليوم: بلا رفض ولا «المعروض…» ولا «تعذّر»، و«اليوم التالي» مقفول ولا «اليوم»، والطباعة والمشاركة له. */
      const followView = (day, over = {}) => ({
        title: `تقرير القاعات اليومي — ${fmt(day)}`,
        pick: fmt(day),
        refused: false,
        stale: null,
        failed: 0,
        next: true,
        today: 0,
        print: false,
        share: false,
        url: '/halls/day',
        ...over,
      });
      /** ?on=day صريح حاليّاً: «اليوم» ظاهر دائماً، و«اليوم التالي» مفتوح ما دام قبل يوم الخادم (open). */
      const onView = (day, open, over = {}) => followView(day, { next: !open, today: 1, url: `/halls/day?on=${day}`, ...over });
      const showPage = () => {
        globalThis.document.visibilityState = 'visible';
        fire(globalThis.document, 'visibilitychange', { bubbles: false });
      };
      const focusWindow = () => fire(globalThis.window, 'focus', { bubbles: false });
      /** المغادرة كما في الهاتف: الإخفاء وترك التركيز (لا قراءة؛ والصفحة لا تسمع ترك التركيز، فالإخفاء وحده يفصل عودتين). */
      const leave = async () => {
        globalThis.document.visibilityState = 'hidden';
        fire(globalThis.document, 'visibilitychange', { bubbles: false });
        fire(globalThis.window, 'blur', { bubbles: false });
        await settle();
      };
      /** الرجوع بعد مغادرة: الظهور ثمّ التركيز، ورُسمت الصفحة بينهما. */
      const arrive = async () => {
        showPage();
        await settle();
        focusWindow();
        await settle();
      };
      const comeBack = async () => {
        await leave();
        await arrive();
      };
      const listeners = () => [
        globalThis.document._listeners.filter((l) => l.type === 'visibilitychange').length,
        globalThis.window._listeners.filter((l) => l.type === 'focus').length,
      ];
      const pickInput = () => descendants(dialog()).find((n) => n.getAttribute('data-action') === 'day-pick-input');
      /** المنتقي بيوم: هل رفضه «التاريخ بعد اليوم.»، ثمّ «لا، تراجع»؛ والرابط بعدها. */
      const pickRefuses = async (day) => {
        await click(byAction('day-pick')[0]);
        type(pickInput(), fmt(day));
        await submitDialog();
        const refused = Boolean(dialog()) && descendants(dialog()).some((n) => n.textContent === 'التاريخ بعد اليوم.');
        const cancel = dialog() ? descendants(dialog()).find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع') : null;
        if (cancel) await click(cancel);
        return [refused, globalThis.__hr.location];
      };
      /** المنتقي بيوم يقبله: هل بقيت النافذة مفتوحة، والرابط بعده. */
      const pickDay = async (day) => {
        await click(byAction('day-pick')[0]);
        type(pickInput(), fmt(day));
        await submitDialog();
        return [Boolean(dialog()), globalThis.__hr.location];
      };
      /**
       * يفتح /halls/day وساعة الجهاز عند أوّل لحظة والخادم خلفها بـlag ساعة، ثمّ عودةٌ عند كلّ لحظة بعدها: لكلّ لحظة يوم الخادم وما طُلب فيها وما تعرضه
       * الصفحة (وatOpen بعد الفتح إن أُعطي).
       */
      const walk = async (lag, [[day, hour, minute], ...later], atOpen = null) => {
        const clock = aheadClock({ day, hour, minute, lag });
        try {
          const rpcLog = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day');
          const out = [[clock.serverDay(), calls(rpcLog), dayView()]];
          if (atOpen) out[0].push(await atOpen(rpcLog));
          for (const [on, h, mi] of later) {
            clock.at(on, h, mi);
            const before = calls(rpcLog).length;
            await comeBack();
            out.push([clock.serverDay(), calls(rpcLog).slice(before), dayView()]);
          }
          return out;
        } finally {
          await unmount();
          clock.restore();
        }
      };
      /** صفّ لحظة: يوم الخادم، وما طُلب، والصفحة تتبع اليوم على shown (يوم الخادم إن لم يُعطَ). */
      const moment = (server, asked, shown = server) => [server, asked, followView(shown)];

      // R2: تقرير فُتح الساعة العاشرة ليلاً يوم 12/11 وبقي مفتوحاً إلى الثامنة صباح 13/11 (ساعة مزيّفة؛ الخادم يتبع الساعة نفسها).
      await step('R2 تقرير مفتوح بعد منتصف الليل', async () => {
        const clock = aheadClock({ lag: 0 });
        const bar = () => [textOf('day-title'), disabled(byAction('day-next')[0]), byAction('day-today').length];
        try {
          const base = listeners();
          // بلا ?on=: تتبع اليوم.
          const rpcLog = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day');
          const night = [named(rpcLog, 'halls_day'), bar(), listeners()];
          clock.at(13, 8, 0);
          await leave();
          const whileHidden = named(rpcLog, 'halls_day').length;
          await arrive();
          t.same(
            [night, whileHidden, named(rpcLog, 'halls_day'), bar(), globalThis.__hr.location],
            [
              [[{ p_on: null }], ['تقرير القاعات اليومي — 12/11/2026', true, 0], [base[0] + 1, base[1] + 1]],
              1,
              [{ p_on: null }, { p_on: null }],
              ['تقرير القاعات اليومي — 13/11/2026', true, 0],
              '/halls/day',
            ],
            'R2 بلا ?on=: الصفحة تعود صباح 13/11 ويوم الجهاز غير يوم المعروض فتقرأ null من جديد (مرّةً للظهور والتركيز) وتعرض اليوم الجديد، والخفاء لا يقرأ، والرابط بلا ?on=',
          );
          await unmount();
          t.same(listeners(), base, 'R2 مستمعا الظهور والتركيز يُزالان عند مغادرة الصفحة');
          // بـ?on= صريح: تبقى على يومها، والعودة بعد منتصف ليل الخادم تقرؤه من جديد فيحمل جوابه اليوم الجديد إلى «اليوم التالي» والمنتقي.
          clock.at(12, 22, 0);
          const explicit = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day?on=2026-11-12');
          const atNight = bar();
          clock.at(13, 8, 0);
          await comeBack();
          const morning = [named(explicit, 'halls_day'), bar(), globalThis.__hr.location];
          const picked = await pickDay('2026-11-13');
          t.same(
            [atNight, morning, picked, named(explicit, 'halls_day').at(-1), textOf('day-title')],
            [
              ['تقرير القاعات اليومي — 12/11/2026', true, 1],
              [[{ p_on: '2026-11-12' }, { p_on: '2026-11-12' }], ['تقرير القاعات اليومي — 12/11/2026', false, 1], '/halls/day?on=2026-11-12'],
              [false, '/halls/day'],
              { p_on: null },
              'تقرير القاعات اليومي — 13/11/2026',
            ],
            'R2 بـ?on=2026-11-12: «اليوم» ظاهر، والعودة صباحاً تقرأ يومها من جديد ولا تغيّره، وجوابها بيوم الخادم 13/11 يفتح «اليوم التالي»، والمنتقي يقبل 13/11 فيتبع اليوم بـnull',
          );
        } finally {
          clock.restore();
        }
      });

      await step('H4 الصفحة تتبع اليوم والجهاز أمام الخادم بساعة و23 ساعة ويومين: كلّ نداء null، ويوم الخادم حاليّاً بلا رفض، واليوم الجديد من أوّل عودة بعد منتصف ليله', async () => {
        const seen = [];
        for (const [lag, moments] of [
          [1, [[12, 22, 0], [13, 0, 30], [13, 1, 30], [13, 20, 0], [14, 0, 30], [14, 1, 30]]],
          [23, [[13, 22, 0], [13, 23, 30], [14, 0, 30], [14, 21, 0], [14, 23, 30]]],
          [25, [[14, 0, 30], [14, 1, 30], [14, 12, 0], [15, 0, 30], [15, 1, 30]]],
          [48, [[15, 10, 0], [16, 0, 30], [16, 12, 0]]],
          [49, [[14, 22, 0], [15, 0, 30], [15, 1, 30], [16, 1, 30]]],
        ]) {
          seen.push([lag, await walk(lag, moments)]);
        }
        t.same(
          seen,
          [
            [1, [moment('2026-11-12', [null]), moment('2026-11-12', [null]), moment('2026-11-13', [null]), moment('2026-11-13', []), moment('2026-11-13', [null]), moment('2026-11-14', [null])]],
            [23, [moment('2026-11-12', [null]), moment('2026-11-13', [null]), moment('2026-11-13', [null]), moment('2026-11-13', [null]), moment('2026-11-14', [null])]],
            [25, [moment('2026-11-12', [null]), moment('2026-11-13', [null]), moment('2026-11-13', [null]), moment('2026-11-13', [null]), moment('2026-11-14', [null])]],
            [48, [moment('2026-11-13', [null]), moment('2026-11-14', [null]), moment('2026-11-14', [null])]],
            [49, [moment('2026-11-12', [null]), moment('2026-11-12', [null]), moment('2026-11-13', [null]), moment('2026-11-14', [null])]],
          ],
          'H4 الفتح وكلّ عودة عبر منتصف ليل الجهاز ثمّ منتصف ليل الخادم (أمامه بساعة، وبـ23 ساعة، وبيومين وساعة، وبيومين، وبيومين بالتاريخ قرب منتصف الليل): نداءٌ واحد بـnull حين يوم الجهاز غير يوم المعروض (ولا نداء حين يتّفقان)، ويومُ الخادم حاليّاً في كلّ لحظة بلا رفض ولا «المعروض…»، واليوم الجديد من أوّل عودة بعد منتصف ليل الخادم',
        );
      });

      await step('H4 والجهاز خلف الخادم بساعة: الفتح يعرض يوم الخادم (بعد يوم الجهاز) بـnull والمنتقي يقبله، والعودة تقرأ ما دام يوم الجهاز غير يوم المعروض', async () => {
        const out = await walk(-1, [[12, 23, 30], [12, 23, 45], [13, 0, 10], [13, 23, 30], [14, 0, 10]], async (rpcLog) => [await pickRefuses('2026-11-14'), await pickDay('2026-11-13'), calls(rpcLog)]);
        t.same(
          out,
          [
            [...moment('2026-11-13', [null]), [[true, '/halls/day'], [false, '/halls/day'], [null]]],
            moment('2026-11-13', [null]),
            moment('2026-11-13', []),
            moment('2026-11-14', [], '2026-11-13'),
            moment('2026-11-14', [null]),
          ],
          'H4 الجهاز 23:30 يوم 12/11 والخادم 00:30 يوم 13/11: null فيُعرض 13/11 حاليّاً (كان يوم الجهاز 12/11)، والمنتقي يقبل 13/11 بلا نداء ويرفض 14/11؛ والعودة تقرأ مرّة ما دام يوم الجهاز غير يوم المعروض (R-b)، فبعد منتصف ليل الخادم تنتقل من أوّل عودة بعد منتصف ليل الجهاز',
        );
      });

      await step('H4 الساعة 00:30 بالجهاز والخادم على 12/11: «شارك» تشارك 12/11 المعروض، والمنتقي يقف عند يوم الخادم بلا نداء', async () => {
        const clock = aheadClock();
        const shared = [];
        Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, share: async (data) => shared.push(data.title) }, configurable: true, writable: true });
        try {
          const rpcLog = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day');
          clock.at(13, 0, 30);
          await comeBack();
          const view = dayView();
          await click(byAction('share-day')[0]);
          t.same(
            [view, shared, await pickRefuses('2026-11-13'), calls(rpcLog)],
            [followView('2026-11-12'), ['تقرير القاعات اليومي — 12/11/2026'], [true, '/halls/day'], [null, null]],
            'H4 العودة الساعة 00:30 (الخادم 23:30 يوم 12/11): null فيبقى 12/11 حاليّاً بلا رفض و«شارك» تشاركه، والمنتقي يرفض 13/11 «التاريخ بعد اليوم.» بلا نداء',
          );
        } finally {
          clock.restore();
          if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
          else delete globalThis.navigator;
        }
      });

      await step('H4 قبل أيّ جواب: بلا ?on= لا تاريخ ولا «اليوم السابق»، وبـ?on= حدّ المنتقي يوم الجهاز وحده ويومُ الجهاز فيه يتبع اليوم بـnull', async () => {
        const clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        try {
          let gate = gated(aheadServer(clock));
          gate.close();
          let rpcLog = fresh(OWNER, { halls_day: gate.handler });
          await mount('/halls/day');
          const waiting = [textOf('day-title'), textOf('day-pick'), disabled(byAction('day-prev')[0]), disabled(byAction('day-next')[0]), byAction('day-today').length, textOf('day-loading'), calls(rpcLog)];
          gate.release();
          await settle();
          const answered = dayView();
          await unmount();
          gate = gated(aheadServer(clock));
          gate.close();
          rpcLog = fresh(OWNER, { halls_day: gate.handler });
          await mount('/halls/day?on=2026-11-10');
          const before = [textOf('day-title'), textOf('day-pick'), disabled(byAction('day-next')[0]), byAction('day-today').length];
          const refused = await pickRefuses('2026-11-14');
          const picked = [...(await pickDay('2026-11-13')), calls(rpcLog)];
          gate.release();
          await settle();
          await settle();
          t.same(
            [waiting, answered, before, refused, picked, dayView()],
            [
              ['تقرير القاعات اليومي', 'اليوم', true, true, 0, 'جارٍ الفتح…', [null]],
              followView('2026-11-12'),
              ['تقرير القاعات اليومي — 10/11/2026', '10/11/2026', true, 1],
              [true, '/halls/day?on=2026-11-10'],
              [false, '/halls/day', ['2026-11-10', null]],
              followView('2026-11-12'),
            ],
            'H4 قبل الجواب بلا ?on=: العنوان بلا تاريخ و«اليوم» مكان التاريخ (لا يوم الجهاز)، و«اليوم السابق» و«اليوم التالي» مقفولان؛ وبـ?on= قبل الجواب يرفض المنتقي ما بعد يوم الجهاز ويوم الجهاز فيه يتبع اليوم بـnull فيُعرض يوم الخادم بلا رفض',
          );
        } finally {
          clock.restore();
        }
      });

      // V3-H1-ON-CAP: ?on= صريح بيوم الخادم بقي مفتوحاً بعد منتصف ليله. مسارات Z1b وZ2 وZ3 وZ8 من مراجعة 9ac82f7 الثالثة على القواعد الجديدة.
      await step('H4 V3-H1-ON-CAP Z1b: ?on=12/11 من رابط والجهاز أمام بساعة: كلّ عودة تقرؤه، وبعد منتصف ليل الخادم «اليوم التالي» يصل اليوم الجديد و«اليوم» ظاهر', async () => {
        const clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        try {
          const rpcLog = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day?on=2026-11-12');
          const seen = [[calls(rpcLog), dayView(), await pickRefuses('2026-11-13')]];
          for (const [on, h, mi] of [
            [13, 0, 45],
            [13, 8, 0],
            [13, 20, 0],
            [14, 8, 0],
          ]) {
            clock.at(on, h, mi);
            const before = calls(rpcLog).length;
            await comeBack();
            seen.push([clock.serverDay(), calls(rpcLog).slice(before), dayView()]);
          }
          const before = calls(rpcLog).length;
          await click(byAction('day-next')[0]);
          seen.push([calls(rpcLog).slice(before), dayView()]);
          await click(byAction('day-next')[0]);
          seen.push([calls(rpcLog).slice(before + 1), dayView()]);
          t.same(
            seen,
            [
              [['2026-11-12'], onView('2026-11-12', false), [true, '/halls/day?on=2026-11-12']],
              ['2026-11-12', ['2026-11-12'], onView('2026-11-12', false)],
              ['2026-11-13', ['2026-11-12'], onView('2026-11-12', true)],
              ['2026-11-13', [], onView('2026-11-12', true)],
              ['2026-11-14', ['2026-11-12'], onView('2026-11-12', true)],
              [['2026-11-13'], onView('2026-11-13', true)],
              [[null], followView('2026-11-14')],
            ],
            'H4 Z1b ?on=12/11 الساعة 00:30 يوم 13/11: «اليوم التالي» مقفول عند يوم الخادم والمنتقي يرفض 13/11؛ وكلّ عودة ويوم الجهاز بعد يوم الخادم في المعروض تقرأ 12/11 من جديد، فبعد منتصف ليل الخادم ينفتح «اليوم التالي» (ولا قراءة ما دام يوم الجهاز يوم الخادم)؛ وصباح 14/11 يصل إلى 13/11 ثمّ يتبع اليوم بـnull، و«اليوم» ظاهر طوال ?on=',
          );
        } finally {
          clock.restore();
        }
      });

      await step('H4 V3-H1-ON-CAP Z1b والمنتقي: بعد منتصف ليل الخادم يقبل يوم الخادم فتتبع الصفحة اليوم', async () => {
        const clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        try {
          const rpcLog = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day?on=2026-11-12');
          clock.at(13, 8, 0);
          await comeBack();
          const returned = [calls(rpcLog), dayView()];
          t.same(
            [returned, await pickDay('2026-11-13'), calls(rpcLog).slice(2), dayView()],
            [[['2026-11-12', '2026-11-12'], onView('2026-11-12', true)], [false, '/halls/day'], [null], followView('2026-11-13')],
            'H4 Z1b العودة صباح 13/11 تقرأ 12/11 فيحمل جوابه يوم الخادم 13/11، والمنتقي يقبل 13/11 فتتبع الصفحة اليوم بـnull',
          );
        } finally {
          clock.restore();
        }
      });

      await step('H4 V3-H1-ON-CAP Z2: الجهاز أمام بيومين و?on= بيومٍ لم يأتِ: رفض D7 بطريقه، ثمّ بعد منتصف ليل الخادم «اليوم التالي» يصل اليوم الجديد', async () => {
        const clock = aheadClock({ day: 14, hour: 0, minute: 30, lag: 25 });
        try {
          const rpcLog = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day?on=2026-11-13');
          const opened = [calls(rpcLog), dayView(), textOf('day-refusal-way')];
          await click(byAction('day-refusal-way')[0]);
          const landed = [calls(rpcLog).slice(1), dayView()];
          clock.at(14, 1, 30);
          await comeBack();
          const returned = [calls(rpcLog).slice(2), dayView()];
          await click(byAction('day-next')[0]);
          t.same(
            [opened, landed, returned, [calls(rpcLog).slice(3), dayView()]],
            [
              [['2026-11-13'], onView('2026-11-13', false, { refused: true, print: true, share: true }), 'اليوم السابق'],
              [['2026-11-12'], onView('2026-11-12', false)],
              [['2026-11-12'], onView('2026-11-12', true)],
              [[null], followView('2026-11-13')],
            ],
            'H4 Z2 ?on=13/11 والخادم على 12/11: رفض D7 بطريقه «اليوم السابق» إلى 12/11 و«اليوم التالي» مقفول عنده؛ والعودة بعد منتصف ليل الخادم تقرأ 12/11 فينفتح «اليوم التالي» إلى 13/11 ويتبع اليوم بـnull',
          );
        } finally {
          clock.restore();
        }
      });

      await step('H4 V3-H1-ON-CAP Z3: «اليوم» يتبع اليوم دائماً، فالعودة بعد منتصف ليل الخادم تعرض اليوم الجديد', async () => {
        const clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        try {
          const rpcLog = fresh(OWNER, { halls_day: aheadServer(clock) });
          await mount('/halls/day');
          const opened = dayView();
          await click(byAction('day-prev')[0]);
          const prev = dayView();
          await click(byAction('day-today')[0]);
          const back = dayView();
          clock.at(13, 8, 0);
          await comeBack();
          t.same(
            [opened, prev, back, dayView(), calls(rpcLog)],
            [followView('2026-11-12'), onView('2026-11-11', true), followView('2026-11-12'), followView('2026-11-13'), [null, '2026-11-11', null, null]],
            'H4 Z3 الساعة 00:30 يوم 13/11: «اليوم السابق» إلى 11/11 ثمّ «اليوم» يتبع اليوم بـnull (لا ?on= بيوم مرفوض ولا حدّ)، والعودة صباحاً تعرض 13/11',
          );
        } finally {
          clock.restore();
        }
      });

      await step('H4 V3-H1-ON-CAP Z8: فشل الشبكة في العودة بـ?on= «تعذّر» والمعروض آخر ما قُرئ بتاريخه، و«اليوم» منه يتبع اليوم', async () => {
        const clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        let offline = false;
        try {
          const server = aheadServer(clock);
          const rpcLog = fresh(OWNER, { halls_day: (args) => (offline ? Promise.reject(new m.NetworkError()) : server(args)) });
          await mount('/halls/day?on=2026-11-11');
          const opened = dayView();
          offline = true;
          clock.at(13, 0, 40);
          await comeBack();
          const failed = [dayView(), text().includes('تعذّر تحميل تقرير يوم 11/11/2026')];
          offline = false;
          await click(byAction('day-today')[0]);
          const back = dayView();
          clock.at(13, 8, 0);
          await comeBack();
          t.same(
            [opened, failed, back, dayView(), calls(rpcLog)],
            [
              onView('2026-11-11', true),
              [onView('2026-11-11', true, { stale: 'المعروض تقرير يوم 11/11/2026، آخر ما قُرئ بنجاح.', failed: 1, print: true, share: true }), true],
              followView('2026-11-12'),
              followView('2026-11-13'),
              ['2026-11-11', '2026-11-11', null, null],
            ],
            'H4 Z8 ?on=11/11 والعودة بلا شبكة: «تعذّر تحميل تقرير يوم 11/11/2026» والمعروض آخر ما قُرئ بتاريخه (R-d)؛ و«اليوم» يتبع اليوم بـnull، والعودة بعد منتصف ليل الخادم تعرض 13/11',
          );
        } finally {
          clock.restore();
        }
      });

      await step('H4 R-d والصفحة تتبع اليوم: فشل الشبكة في العودة «تعذّر تحميل تقرير اليوم» والمعروض آخر ما قُرئ بتاريخه، و«أعد المحاولة» تقرأ null', async () => {
        const clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        let offline = false;
        try {
          const server = aheadServer(clock);
          const rpcLog = fresh(OWNER, { halls_day: (args) => (offline ? Promise.reject(new m.NetworkError()) : server(args)) });
          await mount('/halls/day');
          offline = true;
          clock.at(13, 0, 40);
          await comeBack();
          const failed = [dayView(), text().includes('تعذّر تحميل تقرير اليوم'), text().includes('تعذّر تحميل تقرير يوم')];
          offline = false;
          await click(byAction('retry')[0]);
          const retried = dayView();
          clock.at(13, 1, 30);
          await comeBack();
          t.same(
            [failed, retried, dayView(), calls(rpcLog)],
            [
              [followView('2026-11-12', { stale: 'المعروض تقرير يوم 12/11/2026، آخر ما قُرئ بنجاح.', failed: 1, print: true, share: true }), true, false],
              followView('2026-11-12'),
              followView('2026-11-13'),
              [null, null, null, null],
            ],
            'H4 R-d فشل null في العودة: «تعذّر تحميل تقرير اليوم» (لا يوم الجهاز) بـ«أعد المحاولة»، والمعروض 12/11 آخر ما قُرئ بتاريخه والطباعة والمشاركة مقفولتان ولا «اليوم»؛ والمحاولة تعيده حاليّاً، والعودة بعد منتصف ليل الخادم 13/11',
          );
        } finally {
          clock.restore();
        }
      });

      // V3-H1-STEP-AFTER-UNMOUNT: مسارا Z4a وZ4b على القواعد الجديدة (لا خطوة، فلا نداء بعد المغادرة).
      await step('H4 V3-H1-STEP-AFTER-UNMOUNT Z4a وZ4b: مغادرة الصفحة والقراءة في الطريق لا يتبعها نداء، والمستمعون يُزالون', async () => {
        const base = listeners();
        const out = [];
        // Z4a: يُعرض 11/11، ثمّ العودة الساعة 00:30 يوم 13/11 (الخادم 23:30 يوم 12/11) والقراءة في الطريق، ثمّ المغادرة.
        let clock = aheadClock({ day: 11 });
        try {
          const gate = gated(aheadServer(clock));
          const rpcLog = fresh(OWNER, { halls_day: gate.handler });
          await mount('/halls/day');
          clock.at(13, 0, 30);
          gate.close();
          await comeBack();
          const inFlight = calls(rpcLog);
          await unmount();
          const atUnmount = calls(rpcLog).length;
          gate.release();
          await settle();
          await settle();
          out.push([inFlight, calls(rpcLog).slice(atUnmount), listeners()]);
        } finally {
          clock.restore();
        }
        // Z4b: الفتح الساعة 00:30 يوم 13/11 والجهاز أمام بساعة، والقراءة الأولى في الطريق، ثمّ المغادرة.
        clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        try {
          const gate = gated(aheadServer(clock));
          gate.close();
          const rpcLog = fresh(OWNER, { halls_day: gate.handler });
          await mount('/halls/day');
          const inFlight = calls(rpcLog);
          await unmount();
          const atUnmount = calls(rpcLog).length;
          gate.release();
          await settle();
          await settle();
          out.push([inFlight, calls(rpcLog).slice(atUnmount), listeners()]);
        } finally {
          clock.restore();
        }
        t.same(
          out,
          [
            [[null, null], [], base],
            [[null], [], base],
          ],
          'H4 Z4a وZ4b قراءة null في الطريق حين تُغادَر الصفحة: لا نداء بعدها (لا خطوة إلى اليوم قبله)، ولا مستمع باقٍ',
        );
      });

      await step('H4 حدثا العودة الواحدة قراءة واحدة: بأيّ ترتيب، رُسمت الصفحة بينهما أو لا، والقراءة في الطريق أو انتهت؛ ولا شيء والصفحة ساكنة', async () => {
        const clock = aheadClock({ day: 13, hour: 0, minute: 30 });
        try {
          const gate = gated(aheadServer(clock));
          const count = async (rpcLog, fn) => {
            const before = calls(rpcLog).length;
            await fn();
            return calls(rpcLog).slice(before);
          };
          // والصفحة تتبع اليوم: يوم الجهاز 13/11 غير يوم المعروض 12/11، فكلّ عودة تقرأ.
          let rpcLog = fresh(OWNER, { halls_day: gate.handler });
          await mount('/halls/day');
          const opened = calls(rpcLog);
          const returns = [];
          for (const pair of [
            // الظهور ثمّ التركيز ورُسمت الصفحة بينهما (والقراءة انتهت قبل التركيز)
            async () => {
              await leave();
              showPage();
              await settle();
              focusWindow();
              await settle();
            },
            // التركيز ثمّ الظهور
            async () => {
              await leave();
              focusWindow();
              await settle();
              showPage();
              await settle();
            },
            // متتاليين بلا رسم بينهما
            async () => {
              await leave();
              showPage();
              focusWindow();
              await settle();
            },
            // والقراءة في الطريق بينهما
            async () => {
              await leave();
              gate.close();
              showPage();
              await settle();
              focusWindow();
              await settle();
              gate.release();
              await settle();
            },
            // بلا مغادرة قبلهما (الظهور ثمّ التركيز، ثمّ التركيز ثمّ الظهور)
            arrive,
            async () => {
              focusWindow();
              await settle();
              showPage();
              await settle();
            },
            // والنافذة تعود إلى التركيز ولم تُخفَ (حاسوب): تركٌ فعودة مرّتين، كلّ واحدة عودة
            async () => {
              fire(globalThis.window, 'blur', { bubbles: false });
              focusWindow();
              await settle();
            },
            async () => {
              fire(globalThis.window, 'blur', { bubbles: false });
              focusWindow();
              await settle();
            },
            // والظهور وحده بعد إخفاء (هاتف لا يرسل التركيز)
            async () => {
              await leave();
              showPage();
              await settle();
            },
          ]) {
            returns.push(await count(rpcLog, pair));
          }
          const idle = await count(rpcLog, async () => {
            await settle();
            await settle();
            await settle();
          });
          const view = dayView();
          await unmount();
          // وبـ?on= صريح: يوم الجهاز بعد يوم الخادم في المعروض.
          rpcLog = fresh(OWNER, { halls_day: gate.handler });
          await mount('/halls/day?on=2026-11-12');
          const explicit = [await count(rpcLog, comeBack), await count(rpcLog, comeBack)];
          t.same(
            [opened, returns, idle, view, explicit],
            [[null], [[null], [null], [null], [null], [null], [null], [null], [null], [null]], [], followView('2026-11-12'), [['2026-11-12'], ['2026-11-12']]],
            'H4 كلّ عودة قراءة واحدة: الظهور والتركيز بأيّ ترتيب، رُسمت الصفحة بينهما أو لا، والقراءة في الطريق أو انتهت بينهما، وبلا إخفاء قبلهما، والتركيز وحده مرّتين (حاسوب) والظهور وحده (هاتف)؛ ولا قراءة والصفحة ساكنة (لا مؤقّت ولا حلقة)؛ وبـ?on= كذلك',
          );
        } finally {
          clock.restore();
        }
      });

      await step('H4 «اليوم السابق» والقراءة بعد العودة في الطريق: اليوم الصريح يغلب ولا نداء بعده', async () => {
        const clock = aheadClock();
        try {
          const gate = gated(aheadServer(clock));
          const rpcLog = fresh(OWNER, { halls_day: gate.handler });
          await mount('/halls/day');
          // العودة الساعة 00:30 يوم 14/11 بالجهاز (23:30 يوم 13/11 عند الخادم) والقراءة في الطريق، ثمّ «اليوم السابق» باليد.
          clock.at(14, 0, 30);
          gate.close();
          await comeBack();
          const asking = [dayView(), calls(rpcLog)];
          await click(byAction('day-prev')[0]);
          gate.release();
          await settle();
          await settle();
          t.same(
            [asking, dayView(), calls(rpcLog)],
            [[followView('2026-11-12'), [null, null]], onView('2026-11-11', true), [null, null, '2026-11-11']],
            'H4 والقراءة في الطريق يبقى المعروض 12/11 حاليّاً بهدوء؛ و«اليوم السابق» منه إلى 11/11 صريحاً يغلب جوابَ null المتأخّر، بلا نداء بعده',
          );
        } finally {
          clock.restore();
        }
      });

      // R4: التقويم من التقرير اليوميّ (برجوعه هو إلى «التقارير») ثمّ تقرير الدورة ثمّ الرجوع خطوةً خطوة؛ عيّنة الشهر من القاعدة (0026).
      const R26 = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-0026.json'), 'utf8'));
      const month = R26.flock_month;
      const FID = month.flock.id;
      const dayBack = `/halls/day?${new URLSearchParams({ on: '2026-11-11', back: '/reports' }).toString()}`;
      const calendar = `/halls/calendar/${FID}?${new URLSearchParams({ m: '2026-11', back: dayBack }).toString()}`;
      const EVIL = ['https://evil.example/', '//evil.example/halls', 'javascript:alert(1)', 'data:text/html,x'];
      const rpcs26 = { flock_month: () => clone(month), flock_cycle_report: () => clone(REAL.flock_cycle_report), halls_day: (args) => dayFor(args.p_on), vaccine_board: () => clone(R26.vaccine_board) };

      await step('R4 التقويم يحمل رجوعه إلى تقرير الدورة والإضافة وجدول اللقاحات، والرجوع خطوةً خطوة', async () => {
        fresh(OWNER, rpcs26);
        await mount(calendar);
        await click(byAction('cal-day').find((n) => n.getAttribute('data-day') === '2026-11-10'));
        const links = ['cal-report', 'cal-vaccines', 'give-day'].map((name) => byAction(name)[0]);
        t.same(
          [textOf('back'), href(byAction('back')[0]), links.map(backOf)],
          ['رجوع إلى تقرير القاعات اليومي', dayBack, [calendar, calendar, calendar]],
          'R4 التقويم من التقرير اليوميّ: رجوعه إليه، وتقرير الدورة وجدول اللقاحات و«أضف لهذا اليوم» برجوع إلى التقويم نفسه برجوعه',
        );
        await click(byAction('day-close')[0]);
        await click(byAction('cal-report')[0]);
        const report = [globalThis.__hr.location.split('?')[0], textOf('back'), href(byAction('back')[0])];
        await click(byAction('back')[0]);
        const again = [globalThis.__hr.location, textOf('back'), href(byAction('back')[0])];
        await click(byAction('back')[0]);
        t.same(
          [report, again, [globalThis.__hr.location, textOf('back'), href(byAction('back')[0])]],
          [
            [`/halls/report/${FID}`, 'رجوع إلى التقويم', calendar],
            [calendar, 'رجوع إلى تقرير القاعات اليومي', dayBack],
            [dayBack, 'رجوع إلى التقارير', '/reports'],
          ],
          'R4 تقرير الدورة «رجوع إلى التقويم» إلى التقويم برجوعه، ثمّ التقرير اليوميّ، ثمّ «التقارير»',
        );
      });

      await step('R4 كلّ قارئ لـ?back= يقبل القيمة الأطول ويرفض الغريب', async () => {
        const readers = [m.backTarget(calendar, 'X'), m.giveBack(calendar), m.backLabel(calendar), EVIL.map((value) => m.backTarget(value, 'X')), EVIL.map((value) => m.giveBack(value))];
        const vaccines = [];
        for (const value of [calendar, ...EVIL, null]) {
          fresh(OWNER, rpcs26);
          await mount(value === null ? '/halls/vaccines?kind=broiler' : `/halls/vaccines?${new URLSearchParams({ kind: 'broiler', back: value }).toString()}`);
          vaccines.push([textOf('back'), href(byAction('back')[0])]);
          await unmount();
        }
        // تقويم برجوع غريب: رجوعه إلى صفحة الفوج، ورابطه لا يحمل الغريب؛ وكذلك غريب مرمَّز داخل تقويم يقبله القارئ الخارجيّ.
        const refused = [];
        for (const value of [EVIL[0], EVIL[2]]) {
          fresh(OWNER, rpcs26);
          await mount(`/halls/calendar/${FID}?${new URLSearchParams({ m: '2026-11', back: value }).toString()}`);
          refused.push([href(byAction('back')[0]), backOf(byAction('cal-report')[0])]);
          await unmount();
        }
        const inner = `/halls/calendar/${FID}?${new URLSearchParams({ m: '2026-11', back: 'javascript:alert(1)' }).toString()}`;
        fresh(OWNER, rpcs26);
        await mount(`/halls/report/${FID}?${new URLSearchParams({ back: inner }).toString()}`);
        const outer = href(byAction('back')[0]);
        await click(byAction('back')[0]);
        const plain = `/halls/calendar/${FID}?m=2026-11`;
        t.same(
          [readers, vaccines, refused, [outer, href(byAction('back')[0]), backOf(byAction('cal-report')[0])]],
          [
            [calendar, calendar, 'رجوع إلى التقويم', EVIL.map(() => 'X'), EVIL.map(() => null)],
            [['رجوع إلى التقويم', calendar], ...EVIL.map(() => ['رجوع إلى الحقول', '/broiler']), ['رجوع إلى الحقول', '/broiler']],
            [[`/broiler/flock/${FID}`, plain], [`/broiler/flock/${FID}`, plain]],
            [inner, `/broiler/flock/${FID}`, plain],
          ],
          'R4 backTarget وgiveBack وجدول اللقاحات تقبل التقويم برجوعه المتداخل وترفض الرابط الخارجيّ و//host وjavascript: وdata:؛ والتقويم لا يحمل رجوعاً رفضه؛ وزرّ جدول اللقاحات يسمّي وجهته: التقويم، وإلّا الحقول (RR27-R4b)',
        );
      });

      // RR27-R4b: جدول اللقاحات من التقويم يعود إلى التقويم، فزرّه يسمّيه (backLabel كتقرير الدورة) لا «رجوع إلى الحقول» الثابت؛ عيّنتا القاعدة (0026).
      await step('RR27-R4b جدول اللقاحات من التقويم: زرّ الرجوع يسمّي التقويم ويعود إليه', async () => {
        fresh(OWNER, rpcs26);
        await mount(calendar);
        await click(byAction('cal-vaccines')[0]);
        const vaccines = [globalThis.__hr.location.split('?')[0], textOf('back'), href(byAction('back')[0])];
        await click(byAction('back')[0]);
        t.same(
          [vaccines, globalThis.__hr.location, textOf('back')],
          [['/halls/vaccines', 'رجوع إلى التقويم', calendar], calendar, 'رجوع إلى تقرير القاعات اليومي'],
          'RR27-R4b من التقويم إلى جدول اللقاحات: «رجوع إلى التقويم» إلى التقويم برجوعه، ومنه «رجوع إلى تقرير القاعات اليومي»',
        );
      });

      await step('R3 «التقارير»: التقارير القائمة لمن يفتحها الشريط، و«تُبنى لاحقاً» لما لم يُبنَ وحده', async () => {
        const PLANNED = ['قيمة المخزون بتاريخ لكل وحدة، والصادر والوارد الداخلي بالكمية والقيمة.', 'ربح الأفواج والحقول، والربح لكل وحدة.', 'كلفة الفرخ ونسب الفقس لكل وجبة.'];
        const sessions = [
          ['owner', OWNER],
          ['hall_worker', { status: 'ready', workspace: ws('hall_worker', { divisions: ['broiler'], canSeeAccounts: false, canSeeSales: false }), offline: false }],
          ['accountant', { status: 'ready', workspace: ws('accountant'), offline: false }],
          ['storekeeper', { status: 'ready', workspace: ws('storekeeper', { divisions: ['general', 'medicine'], canSeeAccounts: false, canSeeSales: true }), offline: false }],
          ['not_configured', { status: 'not_configured' }],
        ];
        const seen = [];
        for (const [name, session] of sessions) {
          fresh(session);
          await mount('/reports');
          const opens = m.visibleNav(session).map((item) => item.to);
          seen.push([
            name,
            [byAction('reports-debts').length, byAction('reports-sales').length],
            [opens.includes('/accounts') ? 1 : 0, opens.includes('/sales') ? 1 : 0],
            byAction('reports-halls').length,
            descendants(byAction('reports-planned')[0] ?? body()).filter((n) => n.localName === 'li').map((n) => n.textContent),
          ]);
          await unmount();
        }
        t.same(
          seen,
          [
            ['owner', [1, 1], [1, 1], 1, PLANNED],
            ['hall_worker', [0, 0], [0, 0], 1, PLANNED],
            ['accountant', [1, 1], [1, 1], 1, PLANNED],
            ['storekeeper', [0, 1], [0, 1], 0, PLANNED],
            ['not_configured', [1, 1], [1, 1], 1, PLANNED],
          ],
          'R3 بطاقتا الذمم بأعمارها وتقرير المبيعات لمن يفتح الشريط «الحسابات» و«المبيعات» (الشرط نفسه)، و«تُبنى لاحقاً» ثلاثة لم تُبنَ',
        );
        fresh(OWNER);
        await mount('/reports');
        const cardOf = (name) => [href(byAction(name)[0]), byAction(name)[0] ? descendants(byAction(name)[0]).find((n) => n.localName === 'span')?.textContent : null];
        const cards = [cardOf('reports-debts'), cardOf('reports-sales')];
        if (byAction('reports-debts')[0]) await click(byAction('reports-debts')[0]);
        t.same(
          [cards, globalThis.__hr.location],
          [[['/accounts/debts', 'الذمم بأعمارها'], ['/sales', 'تقرير المبيعات']], '/accounts/debts'],
          'R3 البطاقتان إلى قائمة الذمم بأعمارها (/accounts/debts) وتقرير المبيعات (/sales)',
        );
      });
    }
  } finally {
    if (root && m) {
      const mounted = root;
      m.flushSync(() => mounted.unmount());
    }
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    delete globalThis.window.print;
    delete globalThis.__hr;
    restore();
  }
}
