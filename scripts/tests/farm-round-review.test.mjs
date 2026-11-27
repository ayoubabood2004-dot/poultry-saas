// مراجعة عدائية لجولة 0036 (عقد docs/plans/0036/contract-0036.md «الجزء R») وإصلاحاتها (فرع fix-0036-round): فحوص المراجع (R1–R11، كتبها على a6d7e2a في
// scripts/tests/review-0036-round.test.mjs بالفرع review-0036-round، 14 فاشلاً و10 ضوابط) منقولة ومكيَّفة، وكلّ فحص R يفشل على الالتزام cfe9710 وينجح بعد
// إصلاحه؛ وفوقها فحوص تقتل طفرات عبرت فحوص الجولة (M7 وM15 وM18 وM19 وM27 وM28 وM29 وM37 وM49 وM51 وM58 وM61 في سجلّ الطفرات).
// الأداة كفحص farm-round: react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل FarmRoutes الحقيقية وحزمة القاعات الحقيقية (أو فشل تحميلها: chunkDown)،
// والطابور الحقيقي ونسخة الجهاز على fake-indexeddb، وrepo الحقول بدائل لقراءاته وكتاباته وناقله، وإرسال العلف بمحلّله الحقيقي (parseFeedSent). وجواب
// القراءة نسخة من حال الخادم (clone) كما يصل من الشبكة، لا مرجع إلى كائناته الحيّة.
// R1 علف اختير ثمّ خرج من «رصيد العلف»: لا يُرسل المكتوب من علف آخر بصمت — «أرسل» مقفول والكمية باقية وجملة تقول اختر علفاً.
// R2 بعد رفع حُفظ والقراءة بعده بطيئة أو فاشلة: الهلاكات مقفولة برقمها وغاز اليوم بإضافته (نتائج الرفع فوق القراءة حتى تصل أحدث)؛ R2b العلف كذلك (سطره
//    و«عندك» بعده)؛ R2c وفتح التطبيق بلا نت بعده يعرض المحفوظ من نسخة الجهاز (الهلاكات والغاز والعلف)؛ R2e وبيض البيّاض («اليوم حتى الآن»).
// R3 فشل كتابة في منتصف «احفظ الجولة»: لا شيء في الطابور (معاملة واحدة)، والخانات باقية، والضغطة الثانية ترسل القنينتين مرّة.
// R5 الجولة فُتحت بلا نت (حزمة القاعات لم تُحمَّل): رجع الاتصال فتظهر بطاقات العلف بلا فتح الجولة من جديد.
// R6 «جولة اليوم» بهلاكاتها (الخادم أو عملية على هذا الجهاز): في الرئيسية وجدول الحقل؛ بيض البيّاض وحده لا يكملها.
// R7 «زيارات اليوم» (HallVisits) و?also= خرجا مع منتجيهما.
// R8 إضافة غاز مجهولة النتيجة: جملة واحدة، لا «لم يُسجَّل غاز» و«منها ما ينتظر الرفع» معاً (وهي لا تُعدّ فوق المحفوظ: M7).
// R9 dead_recorded في رفّ المراجعة: «للتصحيح: صفحة القاعة ← ✎ تعديل» رابطاً، والرفّ يقول إنّ الهلاكات المسجّلة من صفحة القاعة.
// R10 علف اليوم بلا كتلة (قطع بلا وزن، أو لتر بلا كثافة: feed_today_kg = null وسطوره موجودة): «أُرسل اليوم» بسطوره؛ وجواب إرسالها (day.feed_kg = null)
//     يُقرأ «حُفظ» لا شكلاً غريباً يجمّد الطلب.
// R11 ما يُكتب في كمية العلف والإرسال في الطريق يبقى بعد جوابه.
// C أنماط الجولة الكسولة (round.css): شريط الحفظ لا يبتلع اللمس، وهامش التمرير تحت الخانات، وإطار المختار وعلامته (القياس في Chromium بسكربتات خارج المستودع).
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const HALLS = JSON.stringify(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'));
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'archiveHall', 'recordFlockWeight'];
const ADMIN = ['createHall', 'updateHall', 'openFlock', 'setHallSections'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__r36.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__r36.call('loadOverviewJson', []));
    export const flockDayTransport = { currentUserId: async () => globalThis.__r36.userId, send: (op) => globalThis.__r36.send(op), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseFeedSent as __sent } from ${REAL_SHEET};
    export const sendFlockFeed = async (request) => __sent(await globalThis.__r36.call('sendFlockFeed', [request]));`,
  session: 'export const useSession = () => globalThis.__r36.session;',
  Toast: 'export const toast = (spec) => { globalThis.__r36.toasts.push(spec); }; export function Toaster() { return null; }',
  home: 'export const loadHomeSummary = () => globalThis.__r36.call("loadHomeSummary", []);',
  // حزمة القاعات كما يحمّلها المتصفّح: الحقيقية، أو فشل تحميلها بلا نت (chunkDown).
  // إدارة القاعات (hallAdmin: خارج flocks.ts لحجم التثبيت المسبق) عبر البديل نفسه.
  hallAdmin: ADMIN.map((n) => `export const ${n} = (...a) => globalThis.__r36.call('${n}', a);`).join(' '),
  hallsChunk: `import * as halls from ${HALLS};
    export const loadHalls = () => {
      if (globalThis.__r36) globalThis.__r36.loads += 1;
      return globalThis.__r36?.chunkDown ? Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : Promise.resolve(halls);
    };`,
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { localDay, addDays } from './src/domain/dates.ts';",
    "export { openOutbox, pendingOps, reviewEntries, saveRound } from './src/lib/outbox/index.ts';",
    "export * as repo from './src/lib/repo/flocks.ts';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { NetworkError, RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
    "export { roundQueueStore } from './src/lib/roundUploads.ts';",
    "export { default as HomePage, farmTasks } from './src/pages/home/HomePage.tsx';",
    "export * as farmCopy from './src/lib/farmCopy.ts';",
    "export { pendingKey, readPending, storePending } from './src/pages/halls/GivePage.tsx';",
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
        name: 'r36-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallAdmin$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/repo\/home$|\/lib\/hallsChunk$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'r36-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'r36-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const readText = (...parts) => {
  try {
    return readFileSync(path.join(ROOT, ...parts), 'utf8');
  } catch {
    return '';
  }
};

function putOp(db, op) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ops', 'readwrite');
    tx.objectStore('ops').put(op);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

/** كلّ ملف تحت src (لـR7). */
function sourceFiles(dir = path.join(ROOT, 'src')) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/u.test(name)) out.push(full);
  }
  return out;
}

export default async function (t) {
  const restore = installDom();
  let root = null;
  // فشل كتابة IndexedDB عند الطلب (R3): QuotaExceededError كما يرميه المتصفّح حين يمتلئ التخزين.
  const realAdd = globalThis.IDBObjectStore.prototype.add;
  globalThis.IDBObjectStore.prototype.add = function (value, key) {
    if (globalThis.__r36?.failAdd?.(value)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return key === undefined ? realAdd.call(this, value) : realAdd.call(this, value, key);
  };
  try {
    const m = await screens();
    const TODAY = m.localDay();
    const YESTERDAY = m.addDays(TODAY, -1);
    const ws = (over = {}) => ({ userId: 'u-r36', orgId: 'org-r36', orgName: 'مزرعة', memberId: 'mm-r36', displayName: 'علي', phone: null, role: 'manager', scopes: [], divisions: ['broiler', 'layer'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over });
    const dayRow = (over = {}) => ({ on_date: TODAY, version: 1, dead: 0, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, ...over });
    const flock = (id, kind, over = {}) => ({
      id, kind, breed: null, status: 'active', version: 1, placed_on: m.addDays(TODAY, -11), placed_count: 5000, age_days_at_placement: 0, age_days: 11,
      days_since_placement: 12, dead_total: 50, culled_total: 12, live: 4938, live_start_today: 4938, mortality_pct: '1.24', feed_kg_total: '1234.500',
      feed_days: 12, feed_span_days: 12, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
    });
    const site = (id, kind, halls) => ({ id, name: kind === 'broiler' ? 'حقل الشمال' : 'حقل البيض', division_id: `d-${kind}`, kind, can_manage: true, halls });
    const hall = (id, name, flockJson) => ({ id, name, capacity: 6000, version: 2, flock: flockJson });
    const FEED = [
      { item_id: 'i-start', name: 'علف بادئ', base_unit: 'kg', on_hand: '1860.000', units: [{ id: 'u-start', name: 'كيس 50 كغم', base_qty: '50.000000' }] },
      { item_id: 'i-end', name: 'علف ناهي', base_unit: 'kg', on_hand: '950.000', units: [{ id: 'u-end', name: 'كيس 50 كغم', base_qty: '50' }] },
    ];

    const fresh = (session, handlers, send = async () => ({ kind: 'saved', version: 1 })) => {
      const calls = [];
      const sent = [];
      globalThis.__r36 = {
        session,
        userId: session.workspace?.userId ?? null,
        toasts: [],
        failAdd: null,
        chunkDown: false,
        loads: 0,
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
          return send(op);
        },
      };
      return { calls, sent };
    };
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      const routes = m.h(m.Routes, null, m.h(m.Route, { path: '/', element: m.h(m.HomePage) }), m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }), m.h(m.Route, { path: '/layers/*', element: m.h(m.FarmRoutes, { kind: 'layer' }) }));
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, routes)));
      await settle(80);
      return container;
    };
    const unmount = async () => {
      if (root) m.flushSync(() => root.unmount());
      root = null;
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      m.onlineStore.set(true);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      if (globalThis.__r36) globalThis.__r36.failAdd = null;
      await unmount();
      m.onlineStore.set(true);
    };
    const stampOf = (userId) => ({ userId, orgId: 'org-r36', displayName: 'علي' });
    const queueOf = async (userId) => {
      const db = await m.openOutbox();
      return { pending: await m.pendingOps(db, stampOf(userId)), review: await m.reviewEntries(db, stampOf(userId)) };
    };
    const card = (flockId) => all().find((n) => n.getAttribute('data-flock') === flockId) ?? null;
    const inCard = (flockId, suffix) => (card(flockId) ? descendants(card(flockId)).find((n) => n.id.endsWith(suffix)) ?? null : null);
    const actionIn = (flockId, action) => (card(flockId) ? byAction(action, card(flockId)) : []);
    const textIn = (flockId, action) => actionIn(flockId, action)[0]?.textContent ?? null;
    const feedItem = (flockId, itemId) => actionIn(flockId, 'round-feed-item').find((n) => n.getAttribute('data-item') === itemId) ?? null;
    const checked = (flockId) => actionIn(flockId, 'round-feed-item').find((n) => n.getAttribute('aria-checked') === 'true')?.getAttribute('data-item') ?? null;
    const save = async (rounds = 120) => {
      fire(byAction('round-save')[0] ?? body(), 'click');
      await settle(rounds);
    };
    const sendsOf = (calls) => calls.filter(([name]) => name === 'sendFlockFeed').map(([, args]) => args[0]);

    /** خادم صغير بقواعد العقد (كفحص farm-round): set_flock_dead مرّة لليوم، وadd_flock_gas يضيف، وsend_flock_feed يصرف من «عندك» (والنافد يخرج من feed_items). */
    const makeServer = (initial = {}) => {
      const rows = { 'f-a': { day: null, gas: null, feed: [] }, 'f-b': { day: null, gas: null, feed: [] }, ...initial };
      const feed = clone(FEED);
      const dayOf = (row) => (row.day ? dayRow({ version: row.day.version, dead: row.day.dead, culled: row.day.culled ?? 0, eggs_total: row.day.eggs ?? null, dead_entered: row.day.entered }) : null);
      const keys = (id) => {
        const row = rows[id];
        const kg = row.feed.reduce((sum, line) => sum + line.kg, 0);
        return {
          today: dayOf(row),
          gas_today: row.gas?.cylinders ?? null,
          gas_today_version: row.gas?.version ?? null,
          feed_today_kg: row.feed.length ? `${kg}.000` : null,
          feed_today: row.feed.map((line) => ({ item_id: line.itemId, item_name: line.name, qty: `${line.kg}.000`, unit: 'kg' })),
          last_feed_item_id: row.feed.at(-1)?.itemId ?? row.last ?? null,
        };
      };
      return {
        rows,
        feed,
        // نسخة من حال الخادم كما تصل من الشبكة (لا مرجع إلى كائناته الحيّة).
        overview: () =>
          clone({
            today: TODAY,
            sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', keys('f-a'))), hall('h-2', 'قاعة 2', flock('f-b', 'broiler', keys('f-b')))])],
            feed_items: feed.filter((item) => item.on_hand !== '0.000'),
          }),
        async send(op) {
          const row = rows[op.flockId];
          if (op.fn === 'set_flock_dead') {
            if (row.day?.entered) return row.day.dead + (row.day.culled ?? 0) === op.payload.dead ? { kind: 'saved', version: row.day.version, day: dayOf(row) } : { kind: 'dead_recorded', server: dayOf(row) };
            row.day = { ...(row.day ?? { version: 0, dead: 0, culled: 0 }), dead: (row.day?.dead ?? 0) + op.payload.dead, entered: true, version: (row.day?.version ?? 0) + 1 };
            return { kind: 'saved', version: row.day.version, day: dayOf(row) };
          }
          if (op.fn === 'add_flock_gas') {
            row.gas = { cylinders: (row.gas?.cylinders ?? 0) + op.payload.add, version: (row.gas?.version ?? 0) + 1 };
            return { kind: 'saved', version: row.gas.version, gas: { on: TODAY, cylinders: row.gas.cylinders, version: row.gas.version } };
          }
          return { kind: 'saved', version: 1 };
        },
        sendFeed(request) {
          const item = feed.find((entry) => entry.item_id === request.itemId);
          const kg = Number(request.qty / 1000n);
          const have = Number(item.on_hand.split('.')[0]);
          if (kg > have) throw new m.RejectedError('insufficient_stock', 'لا يكفي «رصيد العلف».');
          item.on_hand = `${have - kg}.000`;
          rows[request.flockId].feed.push({ itemId: item.item_id, name: item.name, kg });
          const total = rows[request.flockId].feed.reduce((sum, line) => sum + line.kg, 0);
          return { status: 'saved', issue: { id: request.issueId, doc_no: `FI-2026-${String(rows[request.flockId].feed.length).padStart(4, '0')}`, item_id: item.item_id, item_name: item.name, qty: `${kg}.000`, unit: 'kg', issued_on: TODAY, for_day: request.forDay }, day: { on: request.forDay, feed_kg: `${total}.000` } };
        },
      };
    };
    const owner = (userId) => ({ status: 'ready', workspace: ws({ userId }), offline: false });
    const roundWith = (server, userId, extra = {}) => fresh(owner(userId), { loadOverviewJson: () => server.overview(), sendFlockFeed: (request) => server.sendFeed(request), ...extra }, (op) => server.send(op));

    // ── R1: علف اختير وكُتبت كميته ثمّ خرج من «رصيد العلف» (قاعة أخرى في الجولة نفسها أرسلته كلّه): لا ينتقل الاختيار بصمت إلى علف آخر بالكمية نفسها ─────────
    await step('R1', async () => {
      const server = makeServer();
      const { calls } = roundWith(server, 'u-r36-1');
      await mount('/broiler/round');
      await settle(60);
      fire(feedItem('f-a', 'i-end') ?? body(), 'click');
      await settle();
      type(actionIn('f-a', 'round-feed-qty')[0], '2');
      await settle();
      const before = [checked('f-a'), textIn('f-a', 'round-feed-send')];
      // قاعة 2 ترسل ما بقي من «علف ناهي» كلّه (19 كيساً = 950 كغم): يخرج من feed_items.
      fire(feedItem('f-b', 'i-end') ?? body(), 'click');
      await settle();
      type(actionIn('f-b', 'round-feed-qty')[0], '19');
      await settle();
      fire(actionIn('f-b', 'round-feed-send')[0] ?? body(), 'click');
      await settle(150);
      const after = [checked('f-a'), actionIn('f-a', 'round-feed-qty')[0]?.value ?? null, textIn('f-a', 'round-feed-send'), actionIn('f-a', 'round-feed-send')[0]?.hasAttribute('disabled') ?? null];
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(150);
      t.same(before, ['i-end', 'أرسل 100 كغممن «علف ناهي»'], 'R1 ضابط: قاعة 1 اختارت «علف ناهي» وكتبت كيسين (100 كغم)');
      t.same(sendsOf(calls).filter((request) => request.flockId === 'f-a').map((request) => [request.itemId, request.qty]), [], `R1 «علف ناهي» خرج من «رصيد العلف» بعد ما اختارته قاعة 1 وكتبت كميته: لا يُرسل الكيسان من علف آخر (بعد القراءة: ${JSON.stringify(after)})`);
      t.same(
        [...after, textIn('f-a', 'round-feed-gone')],
        [null, '2', 'أرسل', true, '«علف ناهي» لم يعد في «رصيد العلف»: اختر علفاً لترسل الكمية المكتوبة.'],
        'R1 لا علف مختار، والكمية «2» باقية ظاهرة، و«أرسل» مقفول، وجملة تقول إنّه لم يعد في «رصيد العلف» وتطلب الاختيار',
      );
      // اختيار العلف بيد العامل: الكمية نفسها من «علف بادئ» الآن، والجملة تذهب.
      fire(feedItem('f-a', 'i-start') ?? body(), 'click');
      await settle();
      t.same([checked('f-a'), textIn('f-a', 'round-feed-send'), actionIn('f-a', 'round-feed-gone').length], ['i-start', 'أرسل 100 كغممن «علف بادئ»', 0], 'R1 ضابط: اختار «علف بادئ» بيده فالكمية منه و«أرسل» مفتوح');
    });

    // ── R2: بعد رفع حُفظ والقراءة بعده بطيئة (2G): الهلاكات مقفولة برقمها وغاز اليوم بإضافته من نتائج الرفع (حتى تصل قراءة أحدث) ───────────────────
    await step('R2', async () => {
      const server = makeServer();
      let slow = false;
      const { sent } = fresh(owner('u-r36-2'), { loadOverviewJson: () => (slow ? new Promise(() => {}) : server.overview()), sendFlockFeed: (request) => server.sendFeed(request) }, (op) => server.send(op));
      await mount('/broiler/round');
      type(inCard('f-a', '-dead'), '5');
      type(inCard('f-a', '-gas'), '2');
      await settle();
      slow = true;
      await save(150);
      t.same([sent.map((op) => op.fn), server.rows['f-a'].day?.dead, server.rows['f-a'].gas?.cylinders, card('f-a')?.textContent.includes('حُفظت')], [['set_flock_dead', 'add_flock_gas'], 5, 2, true], 'R2 ضابط: الهلاكات 5 والقنينتان حُفظتا في الخادم و«حُفظت»');
      t.same([Boolean(inCard('f-a', '-dead')), textIn('f-a', 'round-dead-value'), textIn('f-a', 'round-gas-today')], [false, '5', 'اليوم: قنينتان'], 'R2 بعد رفع حُفظ والقراءة بعده لم تصل: الهلاكات مقفولة برقمها وغاز اليوم بإضافته (لا خانة هلاكات مفتوحة ولا «لم يُسجَّل غاز»)');
      if (textIn('f-a', 'round-gas-today') === 'اليوم: لم يُسجَّل غاز') {
        type(inCard('f-a', '-gas'), '2');
        await settle();
        await save(150);
      }
      t.eq(server.rows['f-a'].gas?.cylinders, 2, 'R2 قنينتان أُرسلتا مرّة لا تُعدّان أربعاً في الخادم لأنّ البطاقة عرضت غاز اليوم بلا إضافتها');
      // قراءة أحدث تغلب ما فوقها: جهاز آخر أضاف قنينة وصحّح الهلاكات من ورقة القاعة، فاليوم 3 قناني و7 هلاكات من الخادم لا 2 و5 من الرفع.
      server.rows['f-a'].gas = { cylinders: 3, version: 2 };
      server.rows['f-a'].day = { version: 2, dead: 7, culled: 0, entered: true };
      slow = false;
      m.roundQueueStore.set((state) => ({ ...state, seq: state.seq + 1 }));
      await settle(80);
      t.same([textIn('f-a', 'round-gas-today'), textIn('f-a', 'round-dead-value')], ['اليوم: 3 قناني', '7'], 'R2 قراءة أحدث (نسخة غاز وصفّ يوم أكبر) تغلب نتائج الرفع');
    });

    // ── R2c: والاتصال انقطع بعد الرفع: القراءة ترجع إلى نسخة الجهاز، وفتح الجولة من جديد بلا نت (التطبيق أُعيد فتحه، لا نتائج رفع في الذاكرة) يعرض المحفوظ ──
    await step('R2c', async () => {
      const server = makeServer();
      let down = false;
      const read = () => (down ? Promise.reject(new m.NetworkError()) : server.overview());
      fresh(owner('u-r36-2c'), { loadOverviewJson: read, sendFlockFeed: (request) => server.sendFeed(request) }, (op) => server.send(op));
      await mount('/broiler/round');
      await settle(40);
      type(inCard('f-a', '-dead'), '5');
      type(inCard('f-a', '-gas'), '2');
      await settle();
      down = true;
      await save(150);
      await unmount();
      m.roundQueueStore.set((state) => ({ ...state, runs: [] }));
      m.onlineStore.set(false);
      fresh(owner('u-r36-2c'), { loadOverviewJson: read }, (op) => server.send(op));
      await mount('/broiler/round');
      await settle(80);
      t.same([server.rows['f-a'].day?.dead, server.rows['f-a'].gas?.cylinders, (await queueOf('u-r36-2c')).pending.length], [5, 2, 0], 'R2c ضابط: الهلاكات 5 والقنينتان في الخادم، والطابور فارغ');
      t.same([Boolean(inCard('f-a', '-dead')), textIn('f-a', 'round-gas-today')], [false, 'اليوم: قنينتان'], 'R2c بعد حفظ رُفع ثمّ انقطاع وإعادة فتح بلا نت: الهلاكات مقفولة وغاز اليوم بإضافته (لا خانة مفتوحة ولا «لم يُسجَّل غاز» من نسخة قبل الحفظ)');
    });
    await step('R2c علف', async () => {
      const server = makeServer();
      let down = false;
      const read = () => (down ? Promise.reject(new m.NetworkError()) : server.overview());
      fresh(owner('u-r36-2cf'), { loadOverviewJson: read, sendFlockFeed: (request) => server.sendFeed(request) }, (op) => server.send(op));
      await mount('/broiler/round');
      await settle(60);
      fire(feedItem('f-a', 'i-end') ?? body(), 'click');
      await settle();
      type(actionIn('f-a', 'round-feed-qty')[0], '2');
      await settle();
      down = true;
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(150);
      await unmount();
      // التطبيق أُعيد فتحه بلا نت: لا أجوبة إرسال في الذاكرة.
      m.farmCopy.fedStore.set([]);
      m.onlineStore.set(false);
      fresh(owner('u-r36-2cf'), { loadOverviewJson: read });
      await mount('/broiler/round');
      await settle(80);
      t.same([server.feed.find((item) => item.item_id === 'i-end').on_hand, server.rows['f-a'].feed.length], ['850.000', 1], 'R2c علف ضابط: أُرسل 100 كغم (المخزن 850)');
      t.same([textIn('f-a', 'round-feed-today'), feedItem('f-a', 'i-end')?.textContent ?? null], ['أُرسل اليوم: 100 كغم«علف ناهي»: 100 كغم', 'علف ناهيعندك 850 كغم'], 'R2c علف وإعادة فتح بلا نت: نسخة الجهاز بالإرسال («أُرسل اليوم» بسطره، و«عندك» بعده)');
    });

    // ── R2b: العلف كذلك (يمسّ المخزن): إرسال حُفظ والقراءة بعده بطيئة، فـ«أُرسل اليوم» بالإرسال و«عندك» بعده ──────────────────────────────────────────
    await step('R2b', async () => {
      const server = makeServer();
      let slow = false;
      const { calls } = fresh(owner('u-r36-2b'), { loadOverviewJson: () => (slow ? new Promise(() => {}) : server.overview()), sendFlockFeed: (request) => server.sendFeed(request) }, (op) => server.send(op));
      await mount('/broiler/round');
      await settle(60);
      fire(feedItem('f-a', 'i-end') ?? body(), 'click');
      await settle();
      type(actionIn('f-a', 'round-feed-qty')[0], '2');
      await settle();
      slow = true;
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(150);
      t.same([sendsOf(calls).length, server.feed.find((item) => item.item_id === 'i-end').on_hand, globalThis.__r36.toasts.at(-1)?.tone], [1, '850.000', 'success'], 'R2b ضابط: أُرسل 100 كغم من «علف ناهي» (المخزن 850) والتنبيه نجاح');
      t.same([textIn('f-a', 'round-feed-today'), feedItem('f-a', 'i-end')?.textContent ?? null], ['أُرسل اليوم: 100 كغم«علف ناهي»: 100 كغم', 'علف ناهيعندك 850 كغم'], 'R2b بعد إرسال حُفظ والقراءة بعده لم تصل: «أُرسل اليوم» بالإرسال و«عندك» بعده (لا «لم يُرسل علف اليوم بعد.» و«عندك 950»)');
      t.same([textIn('f-b', 'round-feed-today'), feedItem('f-b', 'i-end')?.textContent ?? null], ['لم يُرسل علف اليوم بعد.', 'علف ناهيعندك 850 كغم'], 'R2b والقاعة الأخرى: لا سطر لها، و«عندك» نفسه بعد الإرسال');
    });

    // ── R2e: بيض البيّاض: زيارة حُفظت والقراءة بعدها بطيئة، فـ«اليوم حتى الآن» بالبيض من صفّ اليوم بعدها، لا قبله (فلا يُكتب ثانيةً) ────────────────
    await step('R2e', async () => {
      let day = { version: 1, eggs: 400 };
      let slow = false;
      const layers = () => clone({ today: TODAY, sites: [site('s-2', 'layer', [hall('h-9', 'قاعة البيّاض', flock('f-l', 'layer', { live: 1000, live_start_today: 1000, today: dayRow({ version: day.version, eggs_total: day.eggs, dead_entered: false }) }))])], feed_items: [] });
      fresh(owner('u-r36-2e'), { loadOverviewJson: () => (slow ? new Promise(() => {}) : layers()) }, async (op) => {
        day = { version: day.version + 1, eggs: day.eggs + (op.payload.eggs_total ?? 0) };
        return { kind: 'saved', version: 1, visit: null, day: dayRow({ version: day.version, eggs_total: day.eggs, dead_entered: false }) };
      });
      await mount('/layers/round');
      const soFarText = () => descendants(card('f-l') ?? body()).find((n) => n.getAttribute('data-field') === 'eggsTotal')?.textContent ?? null;
      t.eq(soFarText(), 'اليوم حتى الآن: 400', 'R2e ضابط: 400 قبل الحفظ');
      type(inCard('f-l', '-eggsTotal'), '100');
      await settle();
      slow = true;
      await save(150);
      t.same([day.eggs, soFarText(), Boolean(inCard('f-l', '-dead'))], [500, 'اليوم حتى الآن: 500', true], 'R2e بعد زيارة بيض حُفظت والقراءة بعدها لم تصل: «اليوم حتى الآن: 500» (والهلاكات خانة: البيض لا يقفلها)');
    });

    // ── R3: فشل كتابة في منتصف «احفظ الجولة» (QuotaExceededError على عملية القاعة الثانية): لا شيء يُكتب، والخانات باقية، والضغطة الثانية ترسل مرّة ──────
    await step('R3', async () => {
      const server = makeServer();
      roundWith(server, 'u-r36-3');
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-a', '-gas'), '2');
      type(inCard('f-b', '-dead'), '3');
      await settle();
      globalThis.__r36.failAdd = (value) => value?.fn === 'set_flock_dead' && value.flockId === 'f-b';
      await save(100);
      globalThis.__r36.failAdd = null;
      const afterFail = (await queueOf('u-r36-3')).pending.map((op) => [op.fn, op.flockId, op.payload.add ?? op.payload.dead]);
      t.same([inCard('f-a', '-gas')?.value ?? null, inCard('f-b', '-dead')?.value ?? null, byAction('round-save')[0]?.textContent ?? null], ['2', '3', 'احفظ الجولة لقاعتين'], 'R3 ضابط: بعد الفشل الخانتان باقيتان «2» و«3» والزرّ يعدّ القاعتين');
      t.same(afterFail, [], 'R3 فشل كتابة في منتصف الحفظ لا يُبقي شيئاً في الطابور (الجولة كلّها بمعاملة واحدة)');
      await save(100);
      const adds = (await queueOf('u-r36-3')).pending.filter((op) => op.fn === 'add_flock_gas' && op.flockId === 'f-a').reduce((sum, op) => sum + op.payload.add, 0);
      t.eq(adds, 2, 'R3 قنينتان كُتبتا مرّة تُرسلان مرّة: بعد فشل كتابة في منتصف الحفظ وضغطة ثانية على «احفظ الجولة» لا تُجمعان 4');
      t.same((await queueOf('u-r36-3')).pending.map((op) => [op.fn, op.flockId]).sort(), [['add_flock_gas', 'f-a'], ['set_flock_dead', 'f-b']], 'R3 والضغطة الثانية كتبت القاعتين');
    });

    // ── R5: الجولة فُتحت بلا نت فلم تُحمَّل حزمة القاعات؛ رجع الاتصال فتظهر البطاقات بلا فتح الجولة من جديد ───────────────────────────────────────────
    await step('R5 ضابط', async () => {
      // رجع الاتصال والحزمة ما زالت لا تُحمَّل: الجملة باقية، والاستيراد مرّة لهذه العودة تتشاركه القاعتان، لا بكلّ رسم.
      const server = makeServer();
      roundWith(server, 'u-r36-5b');
      globalThis.__r36.chunkDown = true;
      m.onlineStore.set(false);
      await mount('/broiler/round');
      await settle(40);
      const opened = globalThis.__r36.loads;
      m.onlineStore.set(true);
      await settle(80);
      type(inCard('f-a', '-dead'), '1');
      type(inCard('f-b', '-gas'), '1');
      await settle(40);
      t.same([opened, globalThis.__r36.loads, byAction('round-feed-item').length, byAction('round-feed-offline').length], [1, 2, 0, 2], 'R5 ضابط: الحزمة ما زالت لا تُحمَّل بعد العودة: استيراد واحد للفتح وواحد للعودة (لا بكلّ رسم)، وجملة «يحتاج اتصالاً» في القاعتين');
    });
    await step('R5', async () => {
      const server = makeServer();
      roundWith(server, 'u-r36-5');
      globalThis.__r36.chunkDown = true;
      m.onlineStore.set(false);
      await mount('/broiler/round');
      await settle(60);
      const offline = [byAction('round-feed-item').length, textIn('f-a', 'round-feed-offline')];
      globalThis.__r36.chunkDown = false;
      m.onlineStore.set(true);
      await settle(150);
      t.same(offline, [0, 'إرسال العلف يحتاج اتصالاً بالإنترنت: يخرج من «رصيد العلف» لحظة الإرسال. أرسله حين يعود الاتصال.'], 'R5 ضابط: بلا نت وبلا حزمة القاعات: لا بطاقات وجملة «يحتاج اتصالاً»');
      const online = [byAction('round-feed-item').length, textIn('f-a', 'round-feed-offline')];
      t.ok(online[0] > 0 && online[1] === null, `R5 رجع الاتصال: بطاقات العلف تظهر ولا تبقى جملة «أرسله حين يعود الاتصال» (الآن: ${JSON.stringify(online)})`);
    });

    // ── R6: «جولة اليوم» بهلاكاتها: بيض البيّاض وحده لا يكملها، وهلاكات على هذا الجهاز لم تُرفع تكملها (الرئيسية وجدول الحقل) ─────────────────────────
    await step('R6', async () => {
      const overview = m.repo.parseOverview({ today: TODAY, sites: [site('s-2', 'layer', [hall('h-9', 'قاعة البيّاض', flock('f-l', 'layer', { live: 1000, live_start_today: 1000, today: dayRow({ eggs_total: 300, dead_entered: false }) }))])], feed_items: [] });
      t.eq(overview.sites[0].halls[0].flock.today.deadEntered, false, 'R6 ضابط: هلاكات اليوم لم تُدخل');
      t.same(m.farmTasks(overview).left, { broiler: 0, layer: 1 }, 'R6 قاعة بيّاض لم تُدخل هلاكات يومها (بيضها وحده سُجّل) تبقى في «شغل اليوم» قاعةً لم تُكمل جولتها');
      const db = await m.openOutbox();
      const op = await m.saveRound(db, stampOf('u-r36-6'), { fn: 'set_flock_dead', flockId: 'f-l', day: TODAY, payload: { dead: 2 }, baseVersion: null });
      t.same(m.farmTasks(overview, [op]).left, { broiler: 0, layer: 0 }, 'R6 وهلاكاتها على هذا الجهاز لم تُرفع: أكملت جولتها');
    });
    await step('R6 الحقل', async () => {
      const db = await m.openOutbox();
      await m.saveRound(db, stampOf('u-r36-6f'), { fn: 'set_flock_dead', flockId: 'f-m', day: TODAY, payload: { dead: 2 }, baseVersion: null });
      const layers = () => clone({
        today: TODAY,
        sites: [site('s-2', 'layer', [hall('h-9', 'قاعة 9', flock('f-l', 'layer', { today: dayRow({ eggs_total: 300, dead_entered: false }) })), hall('h-10', 'قاعة 10', flock('f-m', 'layer'))])],
        feed_items: [],
      });
      fresh(owner('u-r36-6f'), { loadOverviewJson: layers });
      globalThis.__r36.userId = 'someone-else'; // لا رفع
      await mount('/layers');
      await settle(60);
      const chip = (hallId) => {
        const link = byAction('hall-open').find((a) => a.getAttribute('href') === `/layers/hall/${hallId}`);
        let row = link;
        while (row && row.localName !== 'tr') row = row.parentNode;
        return row ? (byAction('hall-today', row)[0]?.textContent ?? null) : null;
      };
      t.same([chip('h-9'), chip('h-10')], ['لم تُسجَّل', 'سُجّلت'], 'R6 جدول الحقل: بيض اليوم وحده «لم تُسجَّل»، وهلاكات على هذا الجهاز لم تُرفع «سُجّلت»');
    });

    await step('R6 الرئيسية', async () => {
      const db = await m.openOutbox();
      await m.saveRound(db, stampOf('u-r36-6h'), { fn: 'set_flock_dead', flockId: 'f-a', day: TODAY, payload: { dead: 2 }, baseVersion: null });
      const server = makeServer();
      fresh(owner('u-r36-6h'), { loadOverviewJson: () => server.overview(), loadHomeSummary: () => ({}) });
      globalThis.__r36.userId = 'someone-else'; // لا رفع
      await mount('/');
      await settle(80);
      const row = byAction('today-round_broiler')[0]?.textContent ?? null;
      t.eq(row, 'جولة حقول اللحم: قاعة واحدة باقية', 'R6 «شغل اليوم» في الرئيسية: قاعة هلاكاتها على هذا الجهاز لم تُرفع أكملت جولتها (قاعة واحدة باقية لا قاعتان)');
    });

    // ── R7: «زيارات اليوم» (HallVisits) و?also= بلا مدخل ولا منتِج: خرجا ────────────────────────────────────────────────────────────────────────────
    await step('R7', async () => {
      const files = sourceFiles();
      const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
      const importers = files.filter((file) => !/HallVisits\.tsx$|HallsRoutes\.tsx$/u.test(file) && /HallVisits/u.test(readFileSync(file, 'utf8'))).map(rel);
      const exported = /export \{ default as HallVisits \}/u.test(readFileSync(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'), 'utf8'));
      t.ok(!exported || importers.length > 0, `R7 مكوّن بلا مدخل لا يُشحن: HallVisits مصدَّر من HallsRoutes (${exported}) ولا شاشة تستعمله (${JSON.stringify(importers)})`);
      const alsoProducers = files.filter((file) => !/GivePage\.tsx$/u.test(file) && /[?&]also=|also:/u.test(readFileSync(file, 'utf8'))).map(rel);
      t.ok(alsoProducers.length > 0 || !/params\.get\('also'\)/u.test(readFileSync(path.join(ROOT, 'src', 'pages', 'halls', 'GivePage.tsx'), 'utf8')), `R7 ?also= في صفحة الإضافة بلا منتِج بعد حذف «اصرف للمختارة» (${JSON.stringify(alsoProducers)})`);
    });

    // ── R9: dead_recorded في رفّ المراجعة: الهلاكات في الجولة مقفولة، فالصفّ يدلّ على التصحيح (صفحة القاعة ← ✎ تعديل) ─────────────────────────────
    await step('R9', async () => {
      const server = makeServer();
      roundWith(server, 'u-r36-9');
      await mount('/broiler/round');
      type(inCard('f-a', '-dead'), '7');
      await settle();
      server.rows['f-a'].day = { version: 2, dead: 4, culled: 1, entered: true };
      await save(150);
      const entry = all().find((n) => n.getAttribute('data-review') !== null) ?? null;
      const shelf = entry?.parentNode ?? null;
      t.same([(await queueOf('u-r36-9')).review.map((row) => row.reason), Boolean(inCard('f-a', '-dead'))], [['dead_recorded'], false], 'R9 ضابط: dead_recorded في الرفّ والهلاكات في الجولة مقفولة');
      const links = entry ? descendants(entry).filter((n) => n.localName === 'a').map((n) => n.getAttribute('href')) : [];
      const tellsRound = Boolean(shelf?.textContent.includes('أعد إدخال ما تراه صحيحاً في الجولة'));
      t.ok(links.includes('/broiler/hall/h-1') || !tellsRound, `R9 صفّ «سُجّلت هلاكات هذا اليوم من جهاز آخر» يدلّ على التصحيح (صفحة القاعة ← ✎ تعديل) لا على الجولة المقفولة (روابط الصفّ ${JSON.stringify(links)}، والرفّ يقول «أعد إدخال … في الجولة»: ${tellsRound})`);
      const fix = entry ? byAction('review-dead-fix', entry)[0] : null;
      t.same([fix?.getAttribute('href') ?? null, fix?.textContent ?? null, fix?.parentNode?.textContent ?? null, shelf?.textContent.includes('(الهلاكات المسجّلة والغاز والكاز) من صفحة القاعة')], ['/broiler/hall/h-1', 'صفحة القاعة ← ✎ تعديل', 'للتصحيح: صفحة القاعة ← ✎ تعديل', true], 'R9 «للتصحيح: صفحة القاعة ← ✎ تعديل» رابطاً في الصفّ، والرفّ يقول إنّ الهلاكات المسجّلة (وغاز الورقة وكازها، مراجعة 2026-11-27) من صفحة القاعة');
    });

    // ── R10: علف اليوم كلّه بلا كتلة (feed_today_kg = null وسطوره موجودة): «أُرسل اليوم» بسطوره؛ وجواب إرسال كهذا (day.feed_kg = null) «حُفظ» ─────────
    await step('R10', async () => {
      const blocks = { item_id: 'i-block', name: 'كتل لحس', base_unit: 'pc', on_hand: '40.000', units: [] };
      const overview = () => ({
        today: TODAY,
        sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { feed_today_kg: null, feed_today: [{ item_id: 'i-block', item_name: 'كتل لحس', qty: '3.000', unit: 'pc' }], last_feed_item_id: 'i-block' }))])],
        feed_items: [blocks],
      });
      fresh(owner('u-r36-10'), { loadOverviewJson: overview });
      await mount('/broiler/round');
      await settle(60);
      const today = textIn('f-a', 'round-feed-today');
      t.ok(Boolean(today?.includes('«كتل لحس»: 3 قطع')), `R10 ضابط: سطر ما أُرسل اليوم ظاهر (${today})`);
      t.ok(!today?.includes('لم يُرسل علف اليوم بعد.'), `R10 لا «لم يُرسل علف اليوم بعد.» فوق علف أُرسل اليوم (${today})`);
      t.eq(today, 'أُرسل اليوم:«كتل لحس»: 3 قطع', 'R10 «أُرسل اليوم:» بسطوره بلا مجموع بالكيلو');
    });
    await step('R10 إرسال', async () => {
      let lines = [];
      const blocks = { item_id: 'i-block', name: 'كتل لحس', base_unit: 'pc', on_hand: '40.000', units: [] };
      const overview = () => clone({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { feed_today_kg: null, feed_today: lines, last_feed_item_id: null }))])], feed_items: [blocks] });
      const { calls } = fresh(owner('u-r36-10s'), {
        loadOverviewJson: overview,
        // send_flock_feed بقطع بلا وزن قطعة: hall_feed_kg فارغ، فـday.feed_kg = null كما ترجعه القاعدة.
        sendFlockFeed: (request) => {
          lines = [{ item_id: 'i-block', item_name: 'كتل لحس', qty: '3.000', unit: 'pc' }];
          blocks.on_hand = '37.000';
          return { status: 'saved', issue: { id: request.issueId, doc_no: 'FI-2026-0009', item_id: 'i-block', item_name: 'كتل لحس', qty: '3.000', unit: 'pc', issued_on: TODAY, for_day: request.forDay }, day: { on: request.forDay, feed_kg: null } };
        },
      });
      await mount('/broiler/round');
      await settle(60);
      type(actionIn('f-a', 'round-feed-qty')[0], '3');
      await settle();
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(150);
      t.same(
        [sendsOf(calls).length, globalThis.__r36.toasts.at(-1)?.tone, actionIn('f-a', 'round-feed-pending').length, textIn('f-a', 'round-feed-today')],
        [1, 'success', 0, 'أُرسل اليوم:«كتل لحس»: 3 قطع'],
        'R10 إرسال قطع بلا وزن (day.feed_kg = null): حُفظ (لا طلب مجمَّد «لم يُعرف مصيره» يُعاد أبداً)، و«أُرسل اليوم:» بسطره',
      );
    });

    // ── R11: ما يُكتب في خانة كمية العلف والإرسال في الطريق يبقى بعد جوابه ────────────────────────────────────────────────────────────────────
    await step('R11', async () => {
      const server = makeServer();
      let answer = () => {};
      fresh(owner('u-r36-11'), { loadOverviewJson: () => server.overview(), sendFlockFeed: (request) => new Promise((resolve) => { answer = () => resolve(server.sendFeed(request)); }) }, (op) => server.send(op));
      await mount('/broiler/round');
      await settle(60);
      type(actionIn('f-a', 'round-feed-qty')[0], '2');
      await settle();
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(40);
      const during = actionIn('f-a', 'round-feed-qty')[0]?.hasAttribute('disabled') ?? null;
      type(actionIn('f-a', 'round-feed-qty')[0], '3');
      await settle();
      answer();
      await settle(150);
      t.same([during, globalThis.__r36.toasts.at(-1)?.tone], [false, 'success'], 'R11 ضابط: الخانة مفتوحة أثناء الإرسال، والإرسال حُفظ');
      t.eq(actionIn('f-a', 'round-feed-qty')[0]?.value ?? null, '3', 'R11 «3» كُتبت والإرسال الأوّل في الطريق تبقى بعد جوابه');
    });

    // ── R8 / M7: إضافة غاز على الجهاز نتيجتها مجهولة: جملة واحدة، ولا تُعدّ فوق المحفوظ (ربّما فيه) ──────────────────────────────────────────────
    await step('R8', async () => {
      const server = makeServer();
      roundWith(server, 'u-r36-8');
      const db = await m.openOutbox();
      const op = await m.saveRound(db, stampOf('u-r36-8'), { fn: 'add_flock_gas', flockId: 'f-a', day: TODAY, payload: { add: 2 }, baseVersion: null });
      await putOp(db, { ...op, state: 'unknown', attempts: 1, lastError: 'network' });
      globalThis.__r36.userId = 'someone-else'; // لا رفع
      await mount('/broiler/round');
      await settle(60);
      const shown = [textIn('f-a', 'round-gas-today'), textIn('f-a', 'round-gas-pending')];
      t.ok(!(shown[0] === 'اليوم: لم يُسجَّل غاز' && shown[1] !== null), `R8 لا «لم يُسجَّل غاز» مع «منها ما ينتظر الرفع» لإضافة مجهولة النتيجة (${JSON.stringify(shown)})`);
      t.same(shown, ['اليوم: لم يُسجَّل غاز، ولم يُعرف بعد مصير إضافة من هذا الجهاز: قنينتان.', null], 'R8 جملة واحدة تقول إنّ الإضافة لم يُعرف مصيرها');
      await new Promise((resolve) => {
        const tx = db.transaction('ops', 'readwrite');
        tx.objectStore('ops').delete(op.id);
        tx.oncomplete = resolve;
      });
    });
    await step('M7', async () => {
      // الخادم حفظ الإضافة (2) وجوابها ضاع: لا تُعدّ مرّتين (2 لا 4).
      const server = makeServer({ 'f-a': { day: null, gas: { cylinders: 2, version: 1 }, feed: [] } });
      roundWith(server, 'u-r36-m7');
      const db = await m.openOutbox();
      const op = await m.saveRound(db, stampOf('u-r36-m7'), { fn: 'add_flock_gas', flockId: 'f-a', day: TODAY, payload: { add: 2 }, baseVersion: null });
      await putOp(db, { ...op, state: 'unknown', attempts: 1, lastError: 'network' });
      globalThis.__r36.userId = 'someone-else';
      await mount('/broiler/round');
      await settle(60);
      t.eq(textIn('f-a', 'round-gas-today'), 'اليوم: قنينتان، ولم يُعرف بعد مصير إضافة من هذا الجهاز: قنينتان.', 'M7 إضافة مجهولة لا تُعدّ فوق المحفوظ (قنينتان لا 4)');
    });

    // ── M15: هلاكات كُتبت في قاعة قُفلت قبل الحفظ ومعها غاز: يُرسل الغاز وحده ──────────────────────────────────────────────────────────────────────
    await step('M15', async () => {
      const server = makeServer();
      const { sent } = roundWith(server, 'u-r36-m15');
      await mount('/broiler/round');
      type(inCard('f-a', '-dead'), '9');
      type(inCard('f-a', '-gas'), '1');
      await settle();
      server.rows['f-a'].day = { version: 1, dead: 3, culled: 0, entered: true };
      m.roundQueueStore.set((state) => ({ ...state, seq: state.seq + 1 }));
      await settle(80);
      await save(150);
      t.same(sent.map((op) => [op.fn, op.flockId]), [['add_flock_gas', 'f-a']], 'M15 القاعة المقفولة: الغاز وحده يُرسل، لا الهلاكات المكتوبة قبل القفل');
    });

    // ── M18: ما يُكتب أثناء الرفع في القاعة نفسها (خانة غيّرها العامل) يبقى ──────────────────────────────────────────────────────────────────────
    await step('M18', async () => {
      let release = () => {};
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const server = makeServer();
      fresh(owner('u-r36-m18'), { loadOverviewJson: () => server.overview() }, async (op) => {
        await gate;
        return server.send(op);
      });
      await mount('/broiler/round');
      type(inCard('f-a', '-gas'), '2');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(40);
      type(inCard('f-a', '-gas'), '5');
      await settle();
      release();
      await settle(150);
      t.same([inCard('f-a', '-gas')?.value ?? null, server.rows['f-a'].gas?.cylinders], ['5', 2], 'M18 «5» كُتبت في غاز القاعة نفسها والرفع في الطريق تبقى، وما حُفظ (2) فرغ');
    });

    // ── M19: نقرتان على «أرسل» قبل أن يُرسم «يُرسل» لا تخرجان طلبين ─────────────────────────────────────────────────────────────────────────────
    await step('M19', async () => {
      const server = makeServer();
      const { calls } = roundWith(server, 'u-r36-m19');
      await mount('/broiler/round');
      await settle(60);
      type(actionIn('f-a', 'round-feed-qty')[0], '1');
      await settle();
      const button = actionIn('f-a', 'round-feed-send')[0] ?? body();
      fire(button, 'click');
      fire(button, 'click');
      await settle(150);
      t.same([sendsOf(calls).length, server.rows['f-a'].feed.length], [1, 1], 'M19 نقرتان متتاليتان: طلب إرسال واحد');
    });

    // ── M27/M28/M29: قراءة يوم أقدم (نسخة البارحة): لا هلاكات اليوم مقفولة منها، ولا غاز، ولا «أُرسل اليوم» ──────────────────────────────────────────
    await step('M27-29', async () => {
      const yesterday = () => clone({
        today: YESTERDAY,
        sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: dayRow({ on_date: YESTERDAY, version: 3, dead: 6, dead_entered: true }), gas_today: 5, gas_today_version: 2, feed_today_kg: '50.000', feed_today: [{ item_id: 'i-end', item_name: 'علف ناهي', qty: '50.000', unit: 'kg' }], last_feed_item_id: 'i-end' }))])],
        feed_items: clone(FEED),
      });
      fresh(owner('u-r36-m27'), { loadOverviewJson: yesterday });
      await mount('/broiler/round');
      await settle(60);
      t.same(
        [Boolean(inCard('f-a', '-dead')), textIn('f-a', 'round-gas-today'), textIn('f-a', 'round-feed-today')],
        [true, 'اليوم: لم يُسجَّل غاز', null],
        'M27-29 قراءة البارحة: هلاكات اليوم خانة (M29)، ولا غاز اليوم (M28)، ولا «أُرسل اليوم» من البارحة (M27)',
      );
    });

    // ── M58: نسخة البارحة وعلى الجهاز هلاكات البارحة لم تُرفع: الحيّ بداية اليوم ينقصها ─────────────────────────────────────────────────────────────
    await step('M58', async () => {
      const db = await m.openOutbox();
      await m.saveRound(db, stampOf('u-r36-m58'), { fn: 'set_flock_dead', flockId: 'f-a', day: YESTERDAY, payload: { dead: 8 }, baseVersion: null });
      const yesterday = () => clone({ today: YESTERDAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: dayRow({ on_date: YESTERDAY, version: 1, dead: 0, dead_entered: false }) }))])], feed_items: [] });
      fresh(owner('u-r36-m58'), { loadOverviewJson: yesterday });
      globalThis.__r36.userId = 'someone-else';
      await mount('/broiler/round');
      await settle(60);
      t.ok(Boolean(card('f-a')?.textContent.includes('الحيّ بداية اليوم: 4,930')), `M58 الحيّ بداية اليوم = 4,938 − هلاكات البارحة على الجهاز (8) (${card('f-a')?.textContent.slice(0, 80)})`);
    });

    // ── M37: طلب علف مجمَّد (نتيجة مجهولة) بعد إعادة فتح الجولة والخانة فارغة: النافذة «فيها ما لم يُحفظ» ────────────────────────────────────────────
    await step('M37', async () => {
      const server = makeServer();
      roundWith(server, 'u-r36-m37', { sendFlockFeed: () => Promise.reject(new m.UnknownOutcomeError()) });
      await mount('/broiler/round');
      await settle(60);
      type(actionIn('f-a', 'round-feed-qty')[0], '1');
      await settle();
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(80);
      await unmount();
      roundWith(server, 'u-r36-m37', { sendFlockFeed: () => new Promise(() => {}) });
      await mount('/broiler/round');
      await settle(60);
      t.same([actionIn('f-a', 'round-feed-pending').length, m.isWindowDirty()], [1, true], 'M37 الطلب المجمَّد بعد إعادة الفتح (والخانة فارغة) يعلّم النافذة «فيها ما لم يُحفظ»');
    });

    // ── M49: زيارة بيض وحده على الجهاز لا تقفل هلاكات اليوم ─────────────────────────────────────────────────────────────────────────────────────
    await step('M49', async () => {
      const layers = () => clone({ today: TODAY, sites: [site('s-2', 'layer', [hall('h-9', 'قاعة البيّاض', flock('f-l', 'layer', { live: 1000, live_start_today: 1000 }))])], feed_items: [] });
      fresh(owner('u-r36-m49'), { loadOverviewJson: layers });
      await mount('/layers/round');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-l', '-eggsTotal'), '300');
      await settle();
      await save(80);
      t.same([(await queueOf('u-r36-m49')).pending.map((op) => [op.fn, op.payload.dead]), Boolean(inCard('f-l', '-dead'))], [[['save_flock_visit', null]], true], 'M49 زيارة البيض وحده على الجهاز: الهلاكات ما زالت خانة');
    });

    // ── M51: حدّ 1,000 قنينة لليوم يعدّ ما على الجهاز لم يُرفع ─────────────────────────────────────────────────────────────────────────────────────
    await step('M51', async () => {
      const server = makeServer({ 'f-a': { day: null, gas: { cylinders: 5, version: 1 }, feed: [] } });
      roundWith(server, 'u-r36-m51');
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-a', '-gas'), '990');
      await settle();
      await save(80);
      type(inCard('f-a', '-gas'), '10');
      await settle();
      await save(80);
      t.same([textIn('f-a', 'round-error'), (await queueOf('u-r36-m51')).pending.map((op) => op.payload.add)], ['مجموع غاز اليوم لا يتجاوز 1,000 قنينة، والمسجّل الآن 995.', [990]], 'M51 5 + 990 على الجهاز + 10 فوق 1,000: يُمنع ويسمّي 995');
    });

    // ── M61: طلب العلف المجمَّد للجولة بمفتاح نافذة العلف في ورقة القاعة نفسه: ما جُمِّد في إحداهما يُرى في الأخرى ───────────────────────────────────────
    await step('M61', async () => {
      const prefix = /pendingKey\(scope, `([^`$]+)\$\{sheet\.flock\.id\}`\)/u.exec(readText('src', 'pages', 'farm', 'FlockPage.tsx'))?.[1] ?? null;
      t.eq(prefix, 'sheet-feed:', 'M61 ضابط: مفتاح نافذة العلف في ورقة القاعة (FlockPage) يُقرأ من مصدرها');
      const sheetKey = (userId, flockId) => m.pendingKey(`${userId}:org-r36`, `${prefix}${flockId}`);
      // جُمِّد في الجولة: يُحفظ بمفتاح الورقة.
      const server = makeServer();
      roundWith(server, 'u-r36-m61', { sendFlockFeed: () => Promise.reject(new m.UnknownOutcomeError()) });
      await mount('/broiler/round');
      await settle(60);
      type(actionIn('f-a', 'round-feed-qty')[0], '1');
      await settle();
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(80);
      const stored = m.readPending(sheetKey('u-r36-m61', 'f-a'));
      t.same([stored?.itemId ?? null, stored?.qty ?? null], ['i-start', 50000n], 'M61 طلب الجولة المجمَّد بمفتاح ورقة القاعة');
      await unmount();
      // جُمِّد في الورقة (بمفتاحها): الجولة تراه مجمَّداً.
      m.storePending(sheetKey('u-r36-m61b', 'f-b'), { clientRef: 'c-1', issueId: 'x-1', lineId: 'l-1', flockId: 'f-b', itemId: 'i-end', qty: 100000n, forDay: TODAY, itemName: 'علف ناهي', baseUnit: 'kg' });
      roundWith(makeServer(), 'u-r36-m61b');
      await mount('/broiler/round');
      await settle(60);
      t.ok(Boolean(textIn('f-b', 'round-feed-pending')?.includes('100 كغم من «علف ناهي»')), `M61 طلب جمّدته ورقة القاعة يُرى في الجولة مجمَّداً (${textIn('f-b', 'round-feed-pending')})`);
      m.storePending(sheetKey('u-r36-m61b', 'f-b'), null);
    });

    // ── C: أنماط الجولة الكسولة (round.css) وعلامة المختار ─────────────────────────────────────────────────────────────────────────────────────────
    await step('C', async () => {
      const css = readText('src', 'pages', 'farm', 'round.css').replace(/\s+/gu, ' ');
      t.ok(css.includes('.round-save { pointer-events: none; }') && css.includes('.round-save > * { pointer-events: auto; }'), 'C شريط «احفظ الجولة» بعرض الصفحة لا يبتلع اللمس (والزرّ وحده يأخذه)');
      t.ok(css.includes('input[data-round-field] { scroll-margin-bottom: calc(8.5rem + env(safe-area-inset-bottom)); }'), 'C خانات الجولة بهامش تمرير يبقيها فوق الزرّ الثابت والشريط السفليّ');
      t.ok(css.includes(".round-pick[aria-checked='true'] { border-color: rgb(var(--ring)); box-shadow: inset 0 0 0 1px rgb(var(--ring)); }"), 'C المختار بإطار لون التركيز');
      const server = makeServer();
      roundWith(server, 'u-r36-c');
      await mount('/broiler/round');
      await settle(60);
      const marks = (action) => actionIn('f-a', action).map((n) => [n.getAttribute('aria-checked'), (n.getAttribute('class') ?? '').split(' ').includes('round-pick'), descendants(n).some((c) => c.localName === 'svg' && (c.getAttribute('class') ?? '').split(' ').includes('round-check'))]);
      t.same([marks('round-feed-item'), marks('round-feed-unit')], [[['true', true, true], ['false', true, false]], [['true', true, true], ['false', true, false]]], 'C بطاقة العلف ورقيقة الوحدة المختارتان بعلامة ✓، وغير المختار بلا علامة');
    });
  } finally {
    globalThis.IDBObjectStore.prototype.add = realAdd;
    delete globalThis.__r36;
    restore();
  }
}
