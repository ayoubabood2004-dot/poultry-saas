// صفحة القاعة، المرحلة ١ (كلمة المالك 2026-11-16: «طريقة الدخول الها واضحة ومو مبهمة… نسوي الجدول اكبر واوضح»): جدول الحقل بروابط القاعات
// وحالة جولة اليوم ونقر الصفّ، وصفحة /hall/:id بالبطاقة «اليوم» والأفعال وكلّ أيام الدورة والجولة ليوم فات، ونافذة الوزن، والعلف السالب بجملة،
// ورابط القاعة من الجولة. الشاشات الحقيقية (FarmRoutes) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، والطابور الحقيقي (saveRound
// وuploadRounds) على fake-indexeddb، وقراءات repo الحقول بدائل تمرّ بمحلّلاتها الحقيقية (parseOverview وparseDetail وparseFlockFeed)؛ وعلف القاعة
// من عيّنة القاعدة الحقيقية (fixtures/flock-issue-0019.json). يوم الخادم ثابت في الجواب (days_since_placement)، لا ساعة الجهاز.
// H1 جدول الحقل؛ H2 صفحة القاعة وتنقّلها والقاعة الفارغة والمجهولة؛ H3 بطاقة اليوم؛ H4 جدول أيام الدورة؛ H5 جولة يوم من الصفحة (الطابور)؛
// H6 العلف السالب جملة؛ H7 الوزن نافذة؛ H8 رابط القاعة من الجولة. ومنذ 0032 (الجولة زيارات في اليوم): H3 «سجّل زيارة»، وH5 نافذة اليوم «زيارة»
// جديدة بخانات فارغة و«اليوم حتى الآن» (المحفوظ وعمليات الجهاز) وتحتها «زيارات هذا اليوم»، والفحص على المجموع بعد الزيارة.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAMPLES = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'flock-issue-0019.json'), 'utf8'));
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'loadFlockFeed', 'createHall', 'updateHall', 'archiveHall', 'openFlock', 'recordFlockWeight'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__hp.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__hp.call('loadOverviewJson', []));
    export const flockDayTransport = { currentUserId: async () => globalThis.__hp.userId, send: (op) => globalThis.__hp.send(op), lookup: async () => null };`,
  session: 'export const useSession = () => globalThis.__hp.session;',
  Toast: 'export const toast = (spec) => { globalThis.__hp.toasts.push(spec); }; export function Toaster() { return null; }',
  // حزمة القاعات: صفحة القاعة وشاشة الفوج منها (خارج التثبيت المسبق)، الحقيقيّتان؛ وتذكير اللقاحات وبطاقة البيع والإغلاق ونافذة تعديل الفوج
  // فارغة هنا (لها فحوصها). وhallsOffline يُفشل تحميلها كما بلا نت (H9).
  hallsChunk: `import FlockPage, { HallPage } from './src/pages/farm/FlockPage.tsx';
    const nothing = () => null;
    export const loadHalls = () => (globalThis.__hp.hallsOffline ? Promise.reject(new Error('offline')) : Promise.resolve({ HallPage, FlockPage, FlockCard: nothing, Reminders: nothing, FlockEditDialog: nothing }));`,
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { addDays } from './src/domain/dates.ts';",
    "export { openOutbox, pendingOps } from './src/lib/outbox/index.ts';",
    "export { parseDetail, parseFlockFeed } from './src/lib/repo/flocks.ts';",
    "export { fmtDay, fmtQty } from './src/lib/format.ts';",
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
    plugins: [
      {
        name: 'hall-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/Toast$|\/lib\/hallsChunk$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'hall-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'hall-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const textOf = (name, root = body()) => byAction(name, root)[0]?.textContent ?? null;
const hrefOf = (name, root = body()) => byAction(name, root)[0]?.getAttribute('href') ?? null;
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
/** نقرة بالزرّ الأيسر (الروابط تتبعها)، ولا شيء إن غاب العنصر: كلّ فحص يفشل وحده على الشفرة القديمة بدل أن يسقط الملفّ. */
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0 });
  await settle(rounds);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const clone = (value) => JSON.parse(JSON.stringify(value));
/** «يوماً» بعد عدد من 1 إلى 10 ليس فصحى («يوم واحد»، «يومان»، «3 أيام»… «10 أيام»؛ و«يوماً» من 11 إلى 99). */
const BAD_DAYS = /(?:^|[^0-9])(?:[1-9]|10) يوماً/u;

const ancestor = (node, test) => {
  for (let n = node?.parentNode ?? null; n; n = n.parentNode) if (test(n)) return n;
  return null;
};
const trOf = (node) => ancestor(node, (n) => n.localName === 'tr');
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const headers = (table) => descendants(section(table, 'thead') ?? body()).filter((n) => n.localName === 'th').map((n) => n.textContent);
const cellsOf = (tr) => (tr?.children ?? []).filter((c) => c.localName === 'td');
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
const inDialog = (dialog, suffix) => (dialog ? descendants(dialog).find((n) => n.localName === 'input' && n.id.endsWith(suffix)) ?? null : null);

export default async function (t) {
  const restore = installDom();
  try {
    const m = await screens();
    // يوم الخادم ثابت (لا ساعة الجهاز): كلّ تاريخ في الجواب منه، وصفحة القاعة تحسبه من التسكين وdays_since_placement.
    const SERVER_DAY = '2026-11-14';
    const ago = (n) => m.addDays(SERVER_DAY, -n);
    const kgOf = (textValue) => {
      const [whole, frac = ''] = textValue.split('.');
      const shown = m.fmtQty(BigInt(whole + frac.padEnd(3, '0').slice(0, 3)), 'kg');
      return shown.sub ?? shown.main;
    };
    const ws = (role, userId) => ({
      userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });

    // ── البيانات: أيام الدورة بأحياء متّصلة (الحيّ أوّل اليوم = آخر الذي قبله)، والأحدث أوّلاً كما يرسلها flock_detail ──
    const dayJson = (n, over = {}) => ({ on_date: ago(n), version: 1, dead: 0, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, ...over });
    /** فوج قائم سُكّن قبل placedAgo يوماً من يوم الخادم، وأيامه المسجّلة [قبل كم يوم، قيمه]. */
    const cycle = (id, placedAgo, recorded = [], over = {}) => {
      let live = 5000;
      let dead = 0;
      let culled = 0;
      const lines = [];
      for (const [n, values] of [...recorded].sort((a, b) => b[0] - a[0])) {
        const row = dayJson(n, values);
        const start = live;
        live = start - row.dead - row.culled;
        dead += row.dead;
        culled += row.culled;
        lines.unshift({ ...row, live_start: start, live_end: live, hdep: null });
      }
      const todayLine = lines.find((line) => line.on_date === SERVER_DAY) ?? null;
      const summary = {
        id, kind: 'broiler', breed: null, status: 'active', version: 1, placed_on: ago(placedAgo), placed_count: 5000, age_days_at_placement: 0, age_days: placedAgo,
        days_since_placement: placedAgo + 1, dead_total: dead, culled_total: culled, live, live_start_today: todayLine ? todayLine.live_start : live, mortality_pct: '0.00',
        feed_kg_total: '0.000', feed_days: 0, feed_span_days: placedAgo, last_weight: placedAgo >= 1 ? { on_date: ago(1), sample_count: 50, avg_g: '450.0' } : null, fcr: null,
        today: todayLine ? dayJson(0, recorded.find(([n]) => n === 0)[1]) : null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
      };
      return { id, summary, lines };
    };
    const detailJson = (c, { hallId = 'h-1', hallName = '1', canSave = true, canManage = false } = {}) => ({
      flock: { ...c.summary, hall_id: hallId, hall_name: hallName, site_id: 's-1', site_name: 'حقل الشمال', closed_on: null, close_note: null },
      can_manage: canManage,
      can_save: canSave,
      days: c.lines,
      weights: [],
    });
    const hall = (id, name, flock) => ({ id, name, capacity: 6000, version: 1, flock });
    const overviewOf = (halls, canManage = true) => ({ today: SERVER_DAY, sites: [{ id: 's-1', name: 'حقل الشمال', division_id: 'd-broiler', kind: 'broiler', can_manage: canManage, halls }] });

    // ── الحامل: الجلسة والبدائل والطابور ──
    let root = null;
    const fresh = (role, handlers, { userId = 'u-hp', send } = {}) => {
      const calls = [];
      const sent = [];
      globalThis.__hp = {
        session: { status: 'ready', workspace: ws(role, userId), offline: false },
        userId,
        toasts: [],
        location: null,
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
        async send(op) {
          sent.push(op);
          return send ? send(op) : { kind: 'saved', version: 99 };
        },
      };
      return { calls, sent };
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__hp.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
      await settle(90);
    };
    const step = async (label, fn) => {
      m.onlineStore.set(true);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      if (root) {
        m.flushSync(() => root.unmount());
        body().textContent = '';
        await settle();
        root = null;
      }
      m.onlineStore.set(true);
    };
    const where = () => globalThis.__hp.location;
    /** القاعة في صفحتها: الحقل يعرضها، وflock_detail لفوجها. */
    const hallSetup = (c, opts = {}, extra = {}) => ({
      loadOverviewJson: () => overviewOf([hall(opts.hallId ?? 'h-1', opts.hallName ?? '1', c.summary)], opts.canManage ?? true),
      loadFlockDetail: () => m.parseDetail(detailJson(c, opts)),
      ...extra,
    });
    const daysTable = () => tableBy('أيام الدورة');
    const dayRowOf = (n) => bodyRows(daysTable()).find((tr) => descendants(tr).find((c) => c.localName === 'bdi')?.textContent === m.fmtDay(ago(n))) ?? null;
    const rowDates = () => bodyRows(daysTable()).map((tr) => descendants(tr).find((c) => c.localName === 'bdi')?.textContent ?? null);
    const fmtAgo = (list) => list.map((n) => m.fmtDay(ago(n)));

    // ── H1: جدول الحقل ─────────────────────────────────────────────────────────────────────────────────────────────
    const farm = () =>
      overviewOf([
        // ترتيب القاعدة حرفاً حرفاً («قاعة 10» قبل «قاعة 2»)، والشاشة بأرقام الأسماء.
        hall('h-10', 'قاعة 10', cycle('f-10', 9, [[0, { dead: 3, version: 2 }]]).summary),
        hall('h-1', '1', cycle('f-1', 9).summary),
        hall('h-2', 'قاعة 2', null),
        hall('h-3', 'قاعة 3', { ...cycle('f-3', 0).summary, status: 'preparing', placed_on: null, days_since_placement: null, age_days: null, last_weight: null }),
      ]);
    const farmTable = () => tableBy('حقل الشمال');
    const farmRowOf = (hallId) => trOf(byAction('hall-open').find((a) => a.getAttribute('href') === `/broiler/hall/${hallId}`)) ?? null;
    const HALLS = ['h-10', 'h-1', 'h-2', 'h-3'];
    await step('H1', async () => {
      fresh('manager', { loadOverviewJson: farm });
      await mount('/broiler');
      t.same(
        byAction('hall-open').map((a) => [a.localName, a.textContent, a.getAttribute('href')]),
        [
          ['a', 'قاعة 1', '/broiler/hall/h-1'],
          ['a', 'قاعة 2', '/broiler/hall/h-2'],
          ['a', 'قاعة 3', '/broiler/hall/h-3'],
          ['a', 'قاعة 10', '/broiler/hall/h-10'],
        ],
        'H1 اسم كلّ قاعة رابط إلى صفحتها /broiler/hall/<القاعة> (والفارغة أيضاً)، و«1» وحده «قاعة 1»، وبترتيب الأرقام',
      );
      t.same(
        HALLS.map((id) => {
          const chip = farmRowOf(id) ? byAction('hall-today', farmRowOf(id))[0] : null;
          return [chip?.textContent ?? null, chip?.getAttribute('data-state') ?? null];
        }),
        [['سُجّلت', 'ok'], ['لم تُسجَّل', 'warn'], ['فارغة', 'idle'], ['قيد التجهيز', 'idle']],
        'H1 «جولة اليوم» مكتوبة لكلّ قاعة: سُجّلت (ok)، ولم تُسجَّل (warn) لفوج قائم بلا صفّ اليوم، وفارغة، وقيد التجهيز (idle)',
      );
      t.same(
        HALLS.map((id) => (farmRowOf(id)?.getAttribute('class') ?? '').includes('bg-warn-50')),
        [false, true, false, false],
        'H1 خلفية التحذير لصفّ القاعة التي فيها فوج قائم بلا جولة اليوم وحده',
      );
      const head = headers(farmTable());
      const deadAt = head.indexOf('نافق اليوم');
      t.same([deadAt >= 0, cellsOf(farmRowOf('h-10'))[deadAt]?.textContent ?? null, cellsOf(farmRowOf('h-1'))[deadAt]?.textContent ?? null], [true, '3', '—'], `H1 عمود «نافق اليوم»: 3 للقاعة المسجّلة و«—» لغيرها (${head.join('|')})`);
      // نقر خليّة لا شيء فيها يُضغط (العمر) يفتح صفحة قاعتها.
      const ageAt = head.indexOf('العمر (يوم)');
      await click(cellsOf(farmRowOf('h-10'))[ageAt] ?? null);
      t.eq(where(), '/broiler/hall/h-10', 'H1 نقر خليّة عاديّة في صفّ القاعة يفتح صفحة القاعة');
    });
    await step('H1 أزرار الصفّ', async () => {
      fresh('manager', { loadOverviewJson: farm });
      await mount('/broiler');
      await click(byAction('flock-open')[0] ?? null);
      t.same(
        [Boolean(dialogTitled('فوج جديد في «قاعة 2»')), byAction('flock-open-save').length, where()],
        [true, 1, '/broiler'],
        'H1 «افتح فوجاً» في صفّ القاعة الفارغة يفتح نافذة الفوج، والصفحة باقية /broiler (الزرّ يأخذ النقرة لا الصفّ)',
      );
    });
    await step('H1 رابط في الصفّ', async () => {
      fresh('manager', { loadOverviewJson: farm });
      await mount('/broiler');
      const issue = farmRowOf('h-1') ? byAction('hall-issue', farmRowOf('h-1'))[0] : null;
      await click(issue);
      t.eq(where(), '/halls/give/f-1?back=%2Fbroiler', 'H1 «اصرف» في الصفّ يتبع رابطه (صفحة الإضافة) ولا يفتح القاعة فوقه');
    });

    // ── H2: صفحة القاعة ────────────────────────────────────────────────────────────────────────────────────────────
    const cycles = { 'f-10': cycle('f-10', 9), 'f-1': cycle('f-1', 9), 'f-2': cycle('f-2', 9) };
    const names = { 'f-10': ['h-10', 'قاعة 10'], 'f-1': ['h-1', '1'], 'f-2': ['h-2', 'قاعة 2'] };
    const hallsOverview = (canManage = true) =>
      overviewOf(
        [hall('h-10', 'قاعة 10', cycles['f-10'].summary), hall('h-1', '1', cycles['f-1'].summary), hall('h-2', 'قاعة 2', cycles['f-2'].summary), hall('h-3', 'قاعة 3', null)],
        canManage,
      );
    const hallsHandlers = (canManage = true) => ({
      loadOverviewJson: () => hallsOverview(canManage),
      loadFlockDetail: (id) => m.parseDetail(detailJson(cycles[id], { hallId: names[id][0], hallName: names[id][1], canManage })),
    });
    const heading = () => all().find((n) => n.localName === 'h1')?.textContent ?? null;
    const navOf = (name) => [textOf(name), hrefOf(name)];
    await step('H2 قاعة بفوجها', async () => {
      const { calls } = fresh('manager', hallsHandlers());
      await mount('/broiler/hall/h-2');
      t.same(named(calls, 'loadFlockDetail'), [['f-2']], 'H2 /broiler/hall/h-2 يقرأ تفاصيل فوج هذه القاعة وحده (f-2)');
      t.eq(heading(), 'قاعة 2', 'H2 عنوان الصفحة اسم القاعة');
      t.same([navOf('hall-prev'), navOf('hall-next'), hrefOf('hall-back')], [['قاعة 1', '/broiler/hall/h-1'], ['قاعة 3', '/broiler/hall/h-3'], '/broiler'], 'H2 السابقة والتالية بترتيب الأرقام («1» ثمّ «قاعة 2» ثمّ «قاعة 3»)، والرجوع إلى الحقل');
    });
    await step('H2 القاعة «1»', async () => {
      const { calls } = fresh('manager', hallsHandlers());
      await mount('/broiler/hall/h-1');
      t.same([named(calls, 'loadFlockDetail'), heading(), byAction('hall-prev').length, navOf('hall-next')], [[['f-1']], 'قاعة 1', 0, ['قاعة 2', '/broiler/hall/h-2']], 'H2 القاعة «1»: عنوانها «قاعة 1»، وهي الأولى (لا سابقة)، والتالية «قاعة 2»');
    });
    await step('H2 قاعة فارغة للمدير', async () => {
      const { calls } = fresh('manager', hallsHandlers());
      await mount('/broiler/hall/h-3');
      t.same(
        [byAction('hall-empty').length, byAction('flock-open').length, byAction('hall-edit').length, hrefOf('hall-cycles'), heading(), named(calls, 'loadFlockDetail').length],
        [1, 1, 1, `/halls/cycles?back=${encodeURIComponent('/broiler/hall/h-3')}`, 'قاعة 3', 0],
        'H2 القاعة الفارغة تقول ذلك، وللمدير «افتح فوجاً» و«عدّل القاعة»، و«الدورات السابقة» برجوع إليها، بلا قراءة فوج',
      );
      t.same([navOf('hall-prev'), navOf('hall-next')], [['قاعة 2', '/broiler/hall/h-2'], ['قاعة 10', '/broiler/hall/h-10']], 'H2 «قاعة 2» قبل «قاعة 10» (ترتيب الأرقام لا ترتيب الحروف)');
      await click(byAction('flock-open')[0] ?? null);
      t.same([Boolean(dialogTitled('فوج جديد في «قاعة 3»')), where()], [true, '/broiler/hall/h-3'], 'H2 «افتح فوجاً» يفتح نافذة الفوج لهذه القاعة');
    });
    await step('H2 قاعة فارغة لغير المدير', async () => {
      fresh('hall_worker', hallsHandlers(false));
      await mount('/broiler/hall/h-3');
      t.same([byAction('hall-empty').length, byAction('flock-open').length, byAction('hall-edit').length, byAction('hall-cycles').length], [1, 0, 0, 1], 'H2 عامل القاعة يرى القاعة فارغة ودوراتها، بلا «افتح فوجاً» ولا «عدّل القاعة»');
    });
    await step('H2 قاعة مجهولة', async () => {
      const { calls } = fresh('manager', hallsHandlers());
      await mount('/broiler/hall/h-zz');
      t.same(
        [text().includes('هذه القاعة غير موجودة أو خارج نطاقك.'), named(calls, 'loadFlockDetail').length, hrefOf('hall-back')],
        [true, 0, '/broiler'],
        'H2 قاعة غير موجودة: «هذه القاعة غير موجودة أو خارج نطاقك.» والرجوع إلى الحقل، بلا قراءة فوج',
      );
    });

    // ── H3: بطاقة «اليوم» ─────────────────────────────────────────────────────────────────────────────────────────
    // سُكّن قبل 9 أيام؛ المسجّل قبل 2 و5 و8 أيام. الناقص في الأيام السبعة الماضية (لا اليوم): 1 و3 و4 و6 و7 = 5.
    const PAST = [
      [2, { dead: 4, culled: 1, feed_kg: '98.250', version: 7 }],
      [5, { dead: 2, version: 2 }],
      [8, { dead: 1, version: 1 }],
    ];
    const MISSING_SENTENCE = (n) => `ولم تُسجَّل جولة ${n} من الأيام السبعة الماضية: سجّلها من «أيام الدورة» قبل أن تفوت.`;
    const card = () => byAction('hall-today-card')[0] ?? null;
    const cardHeading = () => (card() ? descendants(card()).find((n) => n.localName === 'h2')?.textContent ?? null : null);
    await step('H3 لم تُسجَّل', async () => {
      fresh('hall_worker', hallSetup(cycle('f-1', 9, PAST)));
      await mount('/broiler/hall/h-1');
      t.same(
        [card()?.getAttribute('data-state') ?? null, cardHeading(), textOf('hall-today-record')],
        ['missing', `جولة اليوم ${m.fmtDay(SERVER_DAY)} لم تُسجَّل`, 'سجّل زيارة'],
        'H3 جولة اليوم ناقصة: البطاقة missing بيوم الخادم، و«سجّل زيارة» لمن يحفظ',
      );
      t.eq(textOf('hall-missing'), MISSING_SENTENCE(5), 'H3 الناقص من الأيام السبعة الماضية بلا اليوم: 5 بالضبط');
      const subtitle = all().find((n) => n.localName === 'h1')?.parentNode?.children.find((n) => n.localName === 'p')?.textContent ?? '';
      t.ok(subtitle.includes('حقل الشمال') && !BAD_DAYS.test(subtitle), `H3 عنوان الصفحة الفرعيّ بالعمر فصحى («العمر 9 أيام» لا «9 يوماً»): «${subtitle}»`);
    });
    await step('H3 سُجّلت', async () => {
      fresh('hall_worker', hallSetup(cycle('f-1', 9, [[0, { dead: 3, version: 4 }], ...PAST])));
      await mount('/broiler/hall/h-1');
      t.same(
        [card()?.getAttribute('data-state') ?? null, cardHeading(), textOf('hall-today-record'), textOf('hall-today-values')],
        ['done', `سُجّلت جولة اليوم ${m.fmtDay(SERVER_DAY)}`, 'سجّل زيارة', 'النافق 3 · المستبعد 0 · العلف —'],
        'H3 جولة اليوم مسجّلة: البطاقة done بأرقامها، و«سجّل زيارة» (زيارة أخرى تُضاف)',
      );
      t.eq(textOf('hall-missing'), MISSING_SENTENCE(5), 'H3 والناقص 5 كما هو (اليوم لا يُعدّ)');
    });
    await step('H3 المشاهد', async () => {
      fresh('viewer', hallSetup(cycle('f-1', 9, PAST), { canSave: false, canManage: false }));
      await mount('/broiler/hall/h-1');
      t.same(
        [card()?.getAttribute('data-state') ?? null, byAction('hall-today-record').length, text().includes('يسجّلها عامل القاعة أو المدير.'), textOf('hall-missing')],
        ['missing', 0, true, MISSING_SENTENCE(5)],
        'H3 المشاهد (بلا flock_day.save): لا زرّ تسجيل، و«يسجّلها عامل القاعة أو المدير.»، والناقص يُعدّ له أيضاً',
      );
    });
    await step('H3 فوج صغير', async () => {
      // سُكّن قبل 3 أيام بلا جولة: الناقص قبل اليوم 3 (لا ما قبل التسكين).
      fresh('hall_worker', hallSetup(cycle('f-1', 3)));
      await mount('/broiler/hall/h-1');
      t.eq(textOf('hall-missing'), MISSING_SENTENCE(3), 'H3 فوج سُكّن قبل 3 أيام: الناقص 3 (الأيام قبل التسكين لا تُعدّ)');
    });
    await step('H3 لا ناقص', async () => {
      fresh('hall_worker', hallSetup(cycle('f-1', 9, [1, 2, 3, 4, 5, 6, 7].map((n) => [n, { dead: 1 }]))));
      await mount('/broiler/hall/h-1');
      t.same([card()?.getAttribute('data-state') ?? null, byAction('hall-missing').length], ['missing', 0], 'H3 الأيام السبعة الماضية كلّها مسجّلة: لا جملة ناقص');
    });

    // ── H4: جدول «أيام الدورة» ───────────────────────────────────────────────────────────────────────────────────
    /** لكلّ صفّ: [التاريخ، لم تُسجَّل، سجّل، فاتت، عدّل]. */
    const flagsOf = (tr) => [
      descendants(tr).find((c) => c.localName === 'bdi')?.textContent ?? null,
      byAction('day-missing', tr).length,
      byAction('day-record', tr).length,
      byAction('day-lost', tr).length,
      byAction('day-edit', tr).length,
    ];
    await step('H4 فوج صغير', async () => {
      fresh('hall_worker', hallSetup(cycle('f-1', 9, [[0, { dead: 3, version: 4 }], ...PAST])));
      await mount('/broiler/hall/h-1');
      t.same(rowDates(), fmtAgo([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 'H4 كلّ يوم من التسكين حتى يوم الخادم صفّ (10 أيام)، الأحدث أوّلاً');
      t.same(
        bodyRows(daysTable()).map(flagsOf),
        [
          [m.fmtDay(ago(0)), 0, 0, 0, 1],
          [m.fmtDay(ago(1)), 1, 1, 0, 0],
          [m.fmtDay(ago(2)), 0, 0, 0, 1],
          [m.fmtDay(ago(3)), 1, 1, 0, 0],
          [m.fmtDay(ago(4)), 1, 1, 0, 0],
          [m.fmtDay(ago(5)), 0, 0, 0, 1],
          [m.fmtDay(ago(6)), 1, 1, 0, 0],
          [m.fmtDay(ago(7)), 1, 1, 0, 0],
          [m.fmtDay(ago(8)), 0, 0, 0, 0],
          [m.fmtDay(ago(9)), 0, 0, 1, 0],
        ],
        'H4 الناقص ضمن الأيام السبعة «سجّل» في خليّة التاريخ، وما قبلها «فاتت»، و«عدّل» للمسجّل ضمنها وحده (المسجّل قبلها بلا زرّ)',
      );
      t.ok(
        byAction('day-record').length === 5 && byAction('day-record').every((button) => button.localName === 'button' && button.textContent === 'سجّل' && ancestor(button, (n) => n.getAttribute('data-action') === 'day-missing') !== null),
        'H4 «سجّل» زرّ داخل علامة اليوم الناقص (خليّة التاريخ الثابتة، لا آخر عمود)',
      );
      t.same(
        bodyRows(daysTable()).map((tr) => (tr.getAttribute('class') ?? '').includes('bg-warn-50')),
        [false, true, false, true, true, false, true, true, false, false],
        'H4 خلفية التحذير للناقص ضمن الأيام السبعة وحده',
      );
      t.eq(byAction('days-older-missing').length, 0, 'H4 فوج أصغر من 30 يوماً: لا سطر «وقبل هذه الأيام»');
    });
    await step('H4 المشاهد', async () => {
      fresh('viewer', hallSetup(cycle('f-1', 9, [[0, { dead: 3, version: 4 }], ...PAST]), { canSave: false, canManage: false }));
      await mount('/broiler/hall/h-1');
      t.same(
        [byAction('day-missing').map((n) => n.textContent), byAction('day-record').length, byAction('day-edit').length, byAction('day-lost').length, headers(daysTable()).includes('الجولة')],
        [['لم تُسجَّل', 'لم تُسجَّل', 'لم تُسجَّل', 'لم تُسجَّل', 'لم تُسجَّل'], 0, 0, 1, false],
        'H4 المشاهد: الناقص ضمن الأيام السبعة «لم تُسجَّل» بلا زرّ، و«فاتت» لما قبلها، ولا عمود «الجولة»',
      );
    });
    await step('H4 فوج أكبر من 30 يوماً', async () => {
      // سُكّن قبل 44 يوماً (45 يوماً): آخر 30 يوماً كلّها، ثمّ المسجّل قبلها (30 و35 و44)، والناقص قبلها 15 − 3 = 12.
      const recorded = [0, 10, 29, 30, 35, 44].map((n) => [n, { dead: 1 }]);
      fresh('hall_worker', hallSetup(cycle('f-1', 44, recorded)));
      await mount('/broiler/hall/h-1');
      const recent = Array.from({ length: 30 }, (_, i) => i);
      t.same(rowDates(), fmtAgo([...recent, 30, 35, 44]), 'H4 30 يوماً أخيرة كلّها (المسجّل والناقص) ثمّ المسجّل قبلها وحده: 33 صفّاً');
      t.eq(textOf('days-older-missing'), 'وقبل هذه الأيام 12 يوماً بلا جولة.', 'H4 سطر الناقص قبل الأيام الظاهرة: 12');
      t.same(
        [byAction('day-missing').length, byAction('day-lost').length, byAction('day-edit').length],
        [7, 20, 1],
        'H4 الناقص ضمن الأيام السبعة 7، و«فاتت» للناقص من اليوم 8 إلى 29 (20)، و«عدّل» لليوم المسجّل ضمنها',
      );
    });
    await step('H4 الحدّ', async () => {
      // سُكّن قبل 29 يوماً (30 يوماً بالضبط): كلّها ظاهرة، ولا سطر.
      fresh('hall_worker', hallSetup(cycle('f-1', 29)));
      await mount('/broiler/hall/h-1');
      t.same([rowDates().length, byAction('days-older-missing').length], [30, 0], 'H4 فوج عمره 30 يوماً بالضبط: 30 صفّاً بلا سطر «وقبل هذه الأيام»');
    });
    await step('H4 العدد الصغير', async () => {
      // سُكّن قبل 34 يوماً بلا جولة قبل الثلاثين: 5 أيام ناقصة قبلها.
      fresh('hall_worker', hallSetup(cycle('f-1', 34)));
      await mount('/broiler/hall/h-1');
      const line = textOf('days-older-missing') ?? '';
      t.ok(line.includes('5') && !BAD_DAYS.test(line), `H4 «وقبل هذه الأيام» بعدد 5 فصحى («5 أيام» لا «5 يوماً»): «${line}»`);
    });

    // ── H5: جولة يوم من صفحة القاعة بالطابور الحقيقي ─────────────────────────────────────────────────────────────────
    const stampOf = (userId) => ({ userId, orgId: 'org-1', displayName: 'علي' });
    const dayDialog = () => dialogTitled('زيارة ');
    const dayField = (name) => (dayDialog() ? byAction(`day-${name}`, dayDialog())[0] ?? null : null);
    /** «اليوم حتى الآن» تحت خانة النافذة (تلميح الحقل). */
    const soFarIn = (name) => dayField(name)?.parentNode?.children.find((n) => n.localName === 'p')?.textContent ?? null;
    /** محتوى الزيارة بلا معرّفها ووقتها (يولدان بالجهاز). */
    const contentOf = (op) => Object.fromEntries(Object.entries(op?.payload ?? {}).filter(([key]) => key !== 'visitId' && key !== 'recordedAt'));
    const NEW_VISIT = { dead: null, culled: null, feed_kg: null, eggs_total: null, eggs_broken: null, eggs_cracked: null, note: null, void: false };
    const H5_CYCLE = () => cycle('f-1', 9, [[0, { dead: 3, version: 4 }], ...PAST]);
    await step('H5 يوم ناقص', async () => {
      const { calls, sent } = fresh('hall_worker', hallSetup(H5_CYCLE()), { userId: 'u-h5a' });
      await mount('/broiler/hall/h-1');
      await click(dayRowOf(3) ? byAction('day-record', dayRowOf(3))[0] : null);
      t.eq(dayDialog()?.textContent.startsWith(`زيارة قاعة 1 ليوم ${m.fmtDay(ago(3))}`) ?? false, true, 'H5 «سجّل» يفتح زيارة القاعة لذلك اليوم بعينه');
      t.same([dayField('dead')?.value, dayField('culled')?.value, dayField('feedKg')?.value, soFarIn('dead')], ['', '', '', 'اليوم حتى الآن: 0'], 'H5 يوم بلا سطر: الخانات فارغة و«اليوم حتى الآن: 0»');
      t.ok(byAction('day-visits', dayDialog() ?? body()).length === 1 && byAction('hall-visits', dayDialog() ?? body()).length === 1, 'H5 وتحتها «زيارات هذا اليوم» بالمكوّن نفسه');
      type(dayField('dead'), '3');
      await settle();
      await click(dayField('dead') ? byAction('day-save', dayDialog())[0] : null, 120);
      t.same(
        sent.map((op) => [op.fn, op.flockId, op.day, op.baseVersion, contentOf(op)]),
        [['save_flock_visit', 'f-1', ago(3), null, { ...NEW_VISIT, dead: 3 }]],
        'H5 زيارة جديدة لذلك اليوم بالضبط، بلا نسخة، بمحتواها كاملاً',
      );
      t.same([globalThis.__hp.toasts.at(-1)?.title ?? null, Boolean(dayDialog()), named(calls, 'loadFlockDetail').length >= 2], ['حُفظت الزيارة.', false, true], 'H5 «حُفظت الزيارة.» والنافذة تُغلق والفوج يُقرأ من جديد');
      t.eq((await m.pendingOps(await m.openOutbox(), stampOf('u-h5a'))).length, 0, 'H5 الطابور فارغ بعد الرفع');
    });
    await step('H5 يوم مسجّل', async () => {
      const { sent } = fresh('hall_worker', hallSetup(H5_CYCLE()), { userId: 'u-h5b' });
      await mount('/broiler/hall/h-1');
      t.eq(dayRowOf(2) ? byAction('day-edit', dayRowOf(2))[0]?.textContent : null, 'الزيارات', 'H5 اليوم المسجّل: «الزيارات»');
      await click(dayRowOf(2) ? byAction('day-edit', dayRowOf(2))[0] : null);
      t.same(
        [dayField('dead')?.value, dayField('feedKg')?.value, soFarIn('dead'), soFarIn('culled'), soFarIn('feedKg')],
        ['', '', 'اليوم حتى الآن: 4', 'اليوم حتى الآن: 1', 'اليوم حتى الآن: 98.25'],
        'H5 يوم مسجّل: زيارة جديدة بخانات فارغة، و«اليوم حتى الآن» بمجموع ذلك اليوم',
      );
      // الفحص على المجموع بعد الزيارة: الحيّ الآن 4,989 (5,000 − 11)؛ زيارة بنافق 4,990 لذلك اليوم تجعله سالباً (و4,989 تُقبل).
      type(dayField('dead'), '4990');
      await settle();
      await click(byAction('day-save', dayDialog() ?? body())[0] ?? null, 60);
      t.same([sent.length, Boolean(dayDialog()), dayDialog() ? descendants(dayDialog()).some((n) => n.getAttribute('role') === 'alert' && n.textContent.includes('الحيّ الآن 4,989')) : false], [0, true, true], 'H5 زيارة تجعل الحيّ سالباً تُمنع قبل الإرسال بجملتها');
      type(dayField('dead'), '');
      type(dayField('feedKg'), '100');
      await settle();
      await click(dayField('feedKg') ? byAction('day-save', dayDialog())[0] : null, 120);
      t.same(sent.map((op) => [op.day, op.baseVersion, contentOf(op)]), [[ago(2), null, { ...NEW_VISIT, feed_kg: '100.000' }]], 'H5 زيارة ليوم مسجّل تُضاف إليه: بلا نسخة، والعلف وحده');
    });
    await step('H5 جولة اليوم من البطاقة', async () => {
      const { sent } = fresh('hall_worker', hallSetup(H5_CYCLE()), { userId: 'u-h5c' });
      await mount('/broiler/hall/h-1');
      await click(byAction('hall-today-record')[0] ?? null);
      t.eq(dayDialog()?.textContent.startsWith(`زيارة قاعة 1 ليوم ${m.fmtDay(SERVER_DAY)}`) ?? false, true, 'H5 «سجّل زيارة» يفتح زيارة يوم الخادم (لا يوم الجهاز)');
      t.eq(soFarIn('dead'), 'اليوم حتى الآن: 3', 'H5 «اليوم حتى الآن» بنافق اليوم المحفوظ');
      type(dayField('culled'), '2');
      await settle();
      await click(dayField('culled') ? byAction('day-save', dayDialog())[0] : null, 120);
      t.same(sent.map((op) => [op.day, op.baseVersion, op.payload.dead, op.payload.culled]), [[SERVER_DAY, null, null, 2]], 'H5 زيارة اليوم بيوم الخادم، بلا نسخة (النافق الفارغ null)');
    });
    await step('H5 بلا اتصال', async () => {
      const { sent } = fresh('hall_worker', hallSetup(H5_CYCLE()), { userId: 'u-h5d' });
      await mount('/broiler/hall/h-1');
      m.onlineStore.set(false);
      await settle();
      await click(dayRowOf(4) ? byAction('day-record', dayRowOf(4))[0] : null);
      type(dayField('culled'), '2');
      await settle();
      await click(dayField('culled') ? byAction('day-save', dayDialog())[0] : null, 120);
      const pending = await m.pendingOps(await m.openOutbox(), stampOf('u-h5d'));
      t.same(
        [sent.length, pending.map((op) => [op.fn, op.flockId, op.day, op.baseVersion, op.payload.culled])],
        [0, [['save_flock_visit', 'f-1', ago(4), null, 2]]],
        'H5 بلا اتصال: لا إرسال، والزيارة في طابور الجهاز بيومها',
      );
      t.eq(globalThis.__hp.toasts.at(-1)?.title ?? null, 'محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال', 'H5 الرسالة «محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال»');
      // اليوم على الجهاز: «الزيارات» تفتح زيارة أخرى، و«اليوم حتى الآن» يجمع ما على الجهاز؛ وزيارات اليوم تحتاج اتصالاً.
      await click(dayRowOf(4) ? byAction('day-record', dayRowOf(4))[0] : null);
      t.same([soFarIn('culled'), byAction('visits-offline', dayDialog() ?? body()).length], ['اليوم حتى الآن: 2', 1], 'H5 «اليوم حتى الآن» يجمع زيارة الجهاز المنتظرة، و«زيارات اليوم تحتاج اتصالاً»');
    });

    // ── H6: علف القاعة: الباقي السالب جملة ─────────────────────────────────────────────────────────────────────────
    const FEED = SAMPLES.flock_feed.owner;
    const feedWith = (left) => {
      const json = clone(FEED);
      json.remaining_feed_kg = left;
      return m.parseFlockFeed(json);
    };
    const firstLine = () => (byAction('feed-line')[0]?.children ?? []).find((n) => n.localName === 'p')?.textContent ?? null;
    const SHORT_LINE = `المصروف للقاعة: ${kgOf(FEED.issued_feed_kg)} — المستهلك المسجّل: ${kgOf(FEED.consumed_feed_kg)}`;
    const NEGATIVE = `سُجّل أكل ${kgOf('12.500')} أكثر ممّا صُرف لهذه القاعة: سجّل الصرف، أو صحّح علف الجولات.`;
    const GIVE_FROM_HALL = `/halls/give/f-1?back=${encodeURIComponent('/broiler/hall/h-1')}`;
    await step('H6 سالب في صفحة القاعة', async () => {
      fresh('hall_worker', hallSetup(cycle('f-1', 9, PAST), {}, { loadFlockFeed: () => feedWith('-12.500') }));
      await mount('/broiler/hall/h-1');
      t.same(
        [firstLine(), textOf('feed-negative'), hrefOf('feed-negative-give'), textOf('feed-negative-give')],
        [SHORT_LINE, `${NEGATIVE} أضف للقاعة`, GIVE_FROM_HALL, 'أضف للقاعة'],
        'H6 الباقي السالب: السطر الأوّل بلا «الباقي في القاعة»، وجملة بالكيلوغرامات موجبة، ورابط «أضف للقاعة» برجوع إلى صفحة القاعة',
      );
    });
    await step('H6 سالب في صفحة الفوج', async () => {
      fresh('hall_worker', hallSetup(cycle('f-1', 9, PAST), {}, { loadFlockFeed: () => feedWith('-12.500') }));
      await mount('/broiler/flock/f-1');
      const line = textOf('feed-line') ?? '';
      t.same([firstLine(), textOf('feed-negative')?.startsWith(NEGATIVE) ?? false, line.includes('الباقي في القاعة'), line.includes('-')], [SHORT_LINE, true, false, false], 'H6 شاشة الفوج بعينه: الجملة نفسها، ولا «الباقي في القاعة» ولا إشارة سالبة');
    });
    await step('H6 موجب', async () => {
      fresh('hall_worker', hallSetup(cycle('f-1', 9, PAST), {}, { loadFlockFeed: () => feedWith('30.000') }));
      await mount('/broiler/flock/f-1');
      t.same(
        [firstLine(), byAction('feed-negative').length],
        [`${SHORT_LINE} — الباقي في القاعة: ${kgOf('30.000')}`, 0],
        'H6 الباقي الموجب: السطر القديم بالضبط بـ«الباقي في القاعة»، ولا جملة سالب',
      );
    });

    // ── H7: الوزن نافذة ────────────────────────────────────────────────────────────────────────────────────────────
    await step('H7', async () => {
      const { calls } = fresh('hall_worker', hallSetup(cycle('f-1', 9, PAST), {}, { recordFlockWeight: () => undefined }));
      await mount('/broiler/hall/h-1');
      t.same([byAction('weight-open').length, byAction('weight-save').length], [1, 0], 'H7 «وزن عيّنة» زرّ، ولا نموذج وزن قبل فتحه');
      await click(byAction('weight-open')[0] ?? null);
      const dialog = dialogTitled('وزن عيّنة');
      t.same([byAction('weight-save').length, dialog ? descendants(dialog).find((n) => n.localName === 'h2')?.textContent : null, inDialog(dialog, '-day')?.value ?? null], [1, 'وزن عيّنة قاعة 1', m.fmtDay(SERVER_DAY)], 'H7 النافذة تُفتح باسم القاعة وتاريخ يوم الخادم');
      type(inDialog(dialog, '-samples'), '50');
      type(inDialog(dialog, '-avg'), '1850');
      await settle();
      await click(byAction('weight-save')[0] ?? null);
      const [args] = named(calls, 'recordFlockWeight');
      t.same([args?.slice(0, 4) ?? null, UUID.test(args?.[4] ?? ''), globalThis.__hp.toasts.at(-1)?.title ?? null], [['f-1', SERVER_DAY, 50, '1850.0'], true, `حُفظ وزن العيّنة ليوم ${m.fmtDay(SERVER_DAY)}.`], 'H7 الحفظ: record_flock_weight بالفوج ويوم الخادم والعيّنة والمعدّل ومرجع من الجهاز');
    });

    // ── H8: رابط القاعة من الجولة اليومية ─────────────────────────────────────────────────────────────────────────────
    await step('H8', async () => {
      fresh('hall_worker', { loadOverviewJson: () => overviewOf([hall('h-1', '1', cycle('f-1', 9).summary), hall('h-2', 'قاعة 2', null)], false) });
      await mount('/broiler/round');
      t.same(byAction('round-hall').map((a) => [a.textContent, a.getAttribute('href')]), [['قاعة 1', '/broiler/hall/h-1']], 'H8 اسم القاعة في الجولة رابط إلى صفحتها («1» = «قاعة 1»)');
      await click(byAction('round-hall')[0] ?? null);
      t.eq(where(), '/broiler/hall/h-1', 'H8 والنقر يفتح صفحة القاعة');
    });
    await step('H9 بلا حزمة القاعات', async () => {
      const { calls } = fresh('manager', { loadOverviewJson: () => overviewOf([hall('h-1', '1', cycle('f-1', 9).summary)], true) });
      globalThis.__hp.hallsOffline = true;
      await mount('/broiler/hall/h-1');
      t.same([text().includes('صفحة القاعة تحتاج اتصالاً بالإنترنت؛ افتحها حين يعود الاتصال.'), named(calls, 'loadFlockDetail').length], [true, 0], 'H9 صفحة القاعة من حزمة القاعات خارج التثبيت المسبق: بلا نت جملة تقول إنّها تحتاج اتصالاً (لا تعافٍ ولا صفحة فارغة)');
    });
  } finally {
    delete globalThis.__hp;
    restore();
  }
}
