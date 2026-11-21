// صفحة القاعة، المرحلة ١ (كلمة المالك 2026-11-16: «طريقة الدخول الها واضحة ومو مبهمة… نسوي الجدول اكبر واوضح»): جدول الحقل بروابط القاعات
// وحالة جولة اليوم ونقر الصفّ، وصفحة /hall/:id بالبطاقة «اليوم» والأفعال وكلّ أيام الدورة والجولة ليوم فات، ونافذة الوزن، والعلف السالب بجملة،
// ورابط القاعة من الجولة. الشاشات الحقيقية (FarmRoutes) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، والطابور الحقيقي (saveRound
// وuploadRounds) على fake-indexeddb، وقراءات repo الحقول بدائل تمرّ بمحلّلاتها الحقيقية (parseOverview وparseDetail وparseFlockFeed)؛ وعلف القاعة
// من عيّنة القاعدة الحقيقية (fixtures/flock-issue-0019.json). يوم الخادم ثابت في الجواب (days_since_placement)، لا ساعة الجهاز.
// H1 جدول الحقل؛ H2 صفحة القاعة وتنقّلها (والسابقة والتالية في الحقل نفسه) والقاعة الفارغة والمجهولة؛ H8 رابط القاعة من الجولة؛ H9 بلا حزمة القاعات.
// ومنذ «القاعة كالورقة» (0035، طلب المالك 2026-11-21) صفحة القاعة ورقتها من hall_sheet: بطاقة «اليوم» وجدول أيام الدورة ونافذة اليوم والوزن (H3–H7)
// صارت الورقة وخاناتها، وفحوصها في hall-sheet.test.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAMPLES = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'flock-issue-0019.json'), 'utf8'));
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const SHEET = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8')).hall_sheet.broiler;
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'loadFlockFeed', 'createHall', 'updateHall', 'archiveHall', 'openFlock', 'recordFlockWeight'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__hp.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__hp.call('loadOverviewJson', []));
    export const flockDayTransport = { currentUserId: async () => globalThis.__hp.userId, send: (op) => globalThis.__hp.send(op), lookup: async () => null };`,
  session: 'export const useSession = () => globalThis.__hp.session;',
  Toast: 'export const toast = (spec) => { globalThis.__hp.toasts.push(spec); }; export function Toaster() { return null; }',
  // حزمة القاعات: صفحة القاعة وشاشة الفوج منها (خارج التثبيت المسبق)، الحقيقيّتان؛ وتذكير اللقاحات وبطاقة البيع والإغلاق ونافذة تعديل الفوج
  // فارغة هنا (لها فحوصها). وhallsOffline يُفشل تحميلها كما بلا نت (H9).
  // ورقة القاعة (0035): قارئها بديل يمرّ بمحلّله الحقيقي.
  hallSheet: `export * from ${REAL_SHEET}; import { parseHallSheet as __sheet } from ${REAL_SHEET};
    export const loadHallSheet = async (id) => __sheet(await globalThis.__hp.call('hall_sheet', [id]));`,
  FlockCard: 'export default function FlockCard() { return null; }',
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
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/hallsChunk$|\/halls\/FlockCard$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'hall-stub' }));
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
    /** ورقة القاعة (hall_sheet) لفوجها من العيّنة اليدوية للعقد. */
    const sheetFor = (flockId, hallId, hallName) => {
      const sheet = clone(SHEET);
      Object.assign(sheet.flock, { id: flockId, hall_id: hallId, hall_name: hallName, site_name: 'حقل الشمال' });
      return sheet;
    };
    const names = { 'f-10': ['h-10', 'قاعة 10'], 'f-1': ['h-1', '1'], 'f-2': ['h-2', 'قاعة 2'] };
    const hallsOverview = (canManage = true) =>
      overviewOf(
        [hall('h-10', 'قاعة 10', cycles['f-10'].summary), hall('h-1', '1', cycles['f-1'].summary), hall('h-2', 'قاعة 2', cycles['f-2'].summary), hall('h-3', 'قاعة 3', null)],
        canManage,
      );
    const hallsHandlers = (canManage = true) => ({
      loadOverviewJson: () => hallsOverview(canManage),
      hall_sheet: (id) => sheetFor(id, names[id][0], names[id][1]),
    });
    const heading = () => all().find((n) => n.localName === 'h1')?.textContent ?? null;
    const navOf = (name) => [textOf(name), hrefOf(name)];
    await step('H2 قاعة بفوجها', async () => {
      const { calls } = fresh('manager', hallsHandlers());
      await mount('/broiler/hall/h-2');
      t.same(named(calls, 'hall_sheet'), [['f-2']], 'H2 /broiler/hall/h-2 يقرأ ورقة فوج هذه القاعة وحده (f-2)');
      t.eq(heading(), 'هلاكات قاعة (2)', 'H2 عنوان الصفحة «هلاكات قاعة (2)» (0035: كالورقة)');
      t.same([navOf('hall-prev'), navOf('hall-next'), hrefOf('hall-back')], [['قاعة 1', '/broiler/hall/h-1'], ['قاعة 3', '/broiler/hall/h-3'], '/broiler'], 'H2 السابقة والتالية بترتيب الأرقام («1» ثمّ «قاعة 2» ثمّ «قاعة 3»)، والرجوع إلى الحقل');
    });
    await step('H2 القاعة «1»', async () => {
      const { calls } = fresh('manager', hallsHandlers());
      await mount('/broiler/hall/h-1');
      t.same([named(calls, 'hall_sheet'), heading(), byAction('hall-prev').length, navOf('hall-next')], [[['f-1']], 'هلاكات قاعة (1)', 0, ['قاعة 2', '/broiler/hall/h-2']], 'H2 القاعة «1»: عنوانها «هلاكات قاعة (1)»، وهي الأولى (لا سابقة)، والتالية «قاعة 2»');
    });
    await step('H2 قاعة فارغة للمدير', async () => {
      const { calls } = fresh('manager', hallsHandlers());
      await mount('/broiler/hall/h-3');
      t.same(
        [byAction('hall-empty').length, byAction('flock-open').length, byAction('hall-edit').length, hrefOf('hall-cycles'), heading(), named(calls, 'hall_sheet').length],
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
        [text().includes('هذه القاعة غير موجودة أو خارج نطاقك.'), named(calls, 'hall_sheet').length, hrefOf('hall-back')],
        [true, 0, '/broiler'],
        'H2 قاعة غير موجودة: «هذه القاعة غير موجودة أو خارج نطاقك.» والرجوع إلى الحقل، بلا قراءة فوج',
      );
    });

    // H2 السابقة والتالية في الحقل نفسه (مراجعة صفحة القاعة R7): آخر قاعة في حقل لا تقفز إلى «قاعة 1» في حقل آخر.
    await step('H2 السابقة والتالية في الحقل نفسه', async () => {
      const a1 = cycle('f-a1', 9);
      const a2 = cycle('f-a2', 9);
      const b1 = cycle('f-b1', 9);
      fresh('manager', {
        loadOverviewJson: () => ({
          today: SERVER_DAY,
          sites: [
            { id: 's-1', name: 'حقل الشمال', division_id: 'd', kind: 'broiler', can_manage: true, halls: [hall('h-a1', '1', a1.summary), hall('h-a2', '2', a2.summary)] },
            { id: 's-2', name: 'حقل الجنوب', division_id: 'd', kind: 'broiler', can_manage: true, halls: [hall('h-b1', '1', b1.summary)] },
          ],
        }),
        hall_sheet: (id) => sheetFor(id, 'h-a2', '2'),
      });
      await mount('/broiler/hall/h-a2');
      t.same([navOf('hall-prev'), byAction('hall-next').length], [['قاعة 1', '/broiler/hall/h-a1'], 0], 'H2 آخر قاعة في حقل الشمال: السابقة منه، ولا «التالية» من حقل الجنوب');
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
      t.same([text().includes('صفحة القاعة تحتاج اتصالاً بالإنترنت؛ افتحها حين يعود الاتصال.'), named(calls, 'hall_sheet').length], [true, 0], 'H9 صفحة القاعة من حزمة القاعات خارج التثبيت المسبق: بلا نت جملة تقول إنّها تحتاج اتصالاً (لا تعافٍ ولا صفحة فارغة)');
    });
  } finally {
    delete globalThis.__hp;
    restore();
  }
}
