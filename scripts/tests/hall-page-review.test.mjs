// مراجعة عدائية لصفحة القاعة (المرحلة ١، 2026-11-16): كلّ حالة أثبتت عيباً (فشلت 12 من 13 على b2414d0) وتحرس إصلاحه: R1 الصفحة ونوافذها
// لا تُطوى برفع جولات قاعة أخرى، R2 الحفظ بلا نت لا يمحو الصفحة، R3 نتائج القاعات الأخرى لا تُخفى، R4 حدّ الحيّ من الخادم، R5 الحذف يغلق النافذة
// ويُظهر القاعة فارغة، R6 نتيجة هذا اليوم آخرها، R7 السابقة والتالية في الحقل نفسه، R8 رابط الإضافة لمن يضيف. ومنذ 0032 نافذة اليوم «زيارة» جديدة، ونتيجتها «حُفظت الزيارة.».
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'loadFlockFeed', 'createHall', 'updateHall', 'archiveHall', 'openFlock', 'recordFlockWeight'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__hp.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__hp.call('loadOverviewJson', []));
    export const flockDayTransport = { currentUserId: async () => globalThis.__hp.userId, send: (op) => globalThis.__hp.send(op), lookup: async () => null };`,
  session: 'export const useSession = () => globalThis.__hp.session; export const sessionStore = { get: () => globalThis.__hp?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__hp.toasts.push(spec); }; export function Toaster() { return null; }',
  hallsChunk: `import FlockPage, { HallPage } from './src/pages/farm/FlockPage.tsx';
    import { FlockEditDialog } from './src/pages/farm/FlockEditDialog.tsx';
    const nothing = () => null;
    export const loadHalls = () => (globalThis.__hp.hallsOffline ? Promise.reject(new Error('offline')) : Promise.resolve({ HallPage, FlockPage, FlockCard: nothing, Reminders: nothing, FlockEditDialog }));`,
};
const CORE = `export const call = (fn, args) => globalThis.__hp.rpc(fn, args);`;

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { addDays } from './src/domain/dates.ts';",
    "export { openOutbox, pendingOps, saveRound, reviewEntries } from './src/lib/outbox/index.ts';",
    "export { roundQueueStore, publishRun, stampKey, uploadRounds } from './src/lib/roundUploads.ts';",
    "export { parseDetail, parseFlockFeed } from './src/lib/repo/flocks.ts';",
    "export { fmtDay, fmtQty, fmtInt } from './src/lib/format.ts';",
    `export { NetworkError } from ${ERRORS};`,
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
          b.onResolve({ filter: /^\.\/core$/ }, (args) => (/src\/lib\/repo\/flockEdits\.ts$/u.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'zz-core' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'zz-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
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
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0 });
  await settle(rounds);
};
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
const inDialog = (dialog, suffix) => (dialog ? descendants(dialog).find((n) => n.localName === 'input' && n.id.endsWith(suffix)) ?? null : null);

export default async function (t) {
  const restore = installDom();
  try {
    const m = await screens();
    const SERVER_DAY = '2026-11-14';
    const ago = (n) => m.addDays(SERVER_DAY, -n);
    const ws = (role, userId) => ({
      userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const dayJson = (n, over = {}) => ({ on_date: ago(n), version: 1, dead: 0, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, ...over });
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
        lines.unshift({ ...row, live_start: start, live_end: live, sold: 0, count_diff: 0, hdep: null });
      }
      const todayLine = lines.find((line) => line.on_date === SERVER_DAY) ?? null;
      const summary = {
        id, kind: 'broiler', breed: null, status: 'active', version: 3, placed_on: ago(placedAgo), placed_count: 5000, age_days_at_placement: 0, age_days: placedAgo,
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

    let root = null;
    const fresh = (role, handlers, { userId = 'u-zz', send, rpc } = {}) => {
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
        async rpc(fn, args) {
          calls.push([`rpc:${fn}`, args]);
          return rpc ? rpc(fn, args) : null;
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
        globalThis.__hp.location = `${location.pathname}${location.search}#${location.key}`;
        return m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
      await settle(90);
    };
    const unmount = async () => {
      if (root) {
        m.flushSync(() => root.unmount());
        body().textContent = '';
        await settle();
        root = null;
      }
    };
    const step = async (label, fn) => {
      m.onlineStore.set(true);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: threw ${error?.stack ?? error}`);
      }
      await unmount();
      m.onlineStore.set(true);
    };
    const stampOf = (userId) => ({ userId, orgId: 'org-1', displayName: 'علي' });
    const dayDialog = () => dialogTitled('زيارة ');
    const dayField = (name) => (dayDialog() ? byAction(`day-${name}`, dayDialog())[0] ?? null : null);
    const daysTable = () => tableBy('أيام الدورة');
    const dayRowOf = (n) => bodyRows(daysTable()).find((tr) => descendants(tr).find((c) => c.localName === 'bdi')?.textContent === m.fmtDay(ago(n))) ?? null;
    const transport = (userId, send) => async () => ({ currentUserId: async () => userId, send, lookup: async () => null });

    // ── R1: any upload run with results (shell, other screen) blanks the hall page and destroys open dialogs with typed data ──
    await step('R1 weight dialog vs background upload', async () => {
      const c = cycle('f-1', 9, [[2, { dead: 1 }]]);
      const other = cycle('f-2', 9);
      fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary), hall('h-2', '2', other.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r1' });
      await mount('/broiler/hall/h-1');
      await click(byAction('weight-open')[0] ?? null);
      type(inDialog(dialogTitled('وزن عيّنة'), '-samples'), '50');
      await settle();
      const before = [Boolean(dialogTitled('وزن عيّنة')), inDialog(dialogTitled('وزن عيّنة'), '-samples')?.value ?? null];
      // a round for hall 2 waiting on the device (saved offline earlier) is uploaded in the background (shell: online / visibilitychange)
      await m.saveRound(await m.openOutbox(), stampOf('u-r1'), { fn: 'save_flock_day', flockId: 'f-2', day: SERVER_DAY, payload: { dead: 2 }, baseVersion: null });
      await m.uploadRounds(stampOf('u-r1'), transport('u-r1', async () => ({ kind: 'saved', version: 1 })));
      await settle(120);
      const after = [Boolean(dialogTitled('وزن عيّنة')), inDialog(dialogTitled('وزن عيّنة'), '-samples')?.value ?? null];
      t.same([before, after], [[true, '50'], [true, '50']], 'R1 an open weight dialog with typed samples survives a background round upload for ANOTHER hall');
    });

    await step('R1b day dialog vs background upload', async () => {
      const c = cycle('f-1', 9, [[2, { dead: 1 }]]);
      const other = cycle('f-2', 9);
      const { calls } = fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary), hall('h-2', '2', other.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r1b' });
      await mount('/broiler/hall/h-1');
      await click(dayRowOf(3) ? byAction('day-record', dayRowOf(3))[0] : null);
      type(dayField('dead'), '7');
      await settle();
      const reads = named(calls, 'loadFlockDetail').length;
      await m.saveRound(await m.openOutbox(), stampOf('u-r1b'), { fn: 'save_flock_day', flockId: 'f-2', day: SERVER_DAY, payload: { dead: 2 }, baseVersion: null });
      await m.uploadRounds(stampOf('u-r1b'), transport('u-r1b', async () => ({ kind: 'saved', version: 1 })));
      await settle(120);
      t.same([Boolean(dayDialog()), dayField('dead')?.value ?? null, named(calls, 'loadFlockDetail').length - reads], [true, '7', 0], 'R1b an open day dialog with typed dead survives a background upload, and the hall\'s flock is not re-read from scratch');
    });

    // ── R2: offline save from the hall page replaces the whole page with a load failure ──
    await step('R2 offline save', async () => {
      const c = cycle('f-1', 9, [[2, { dead: 1 }]]);
      let offline = false;
      fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary)], false),
        loadFlockDetail: () => {
          if (offline) throw new m.NetworkError();
          return m.parseDetail(detailJson(c));
        },
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r2' });
      await mount('/broiler/hall/h-1');
      // the worker walks into the hall: no signal
      offline = true;
      m.onlineStore.set(false);
      await settle();
      await click(dayRowOf(3) ? byAction('day-record', dayRowOf(3))[0] : null);
      type(dayField('dead'), '3');
      await settle();
      await click(byAction('day-save', dayDialog() ?? body())[0] ?? null, 120);
      const toast = globalThis.__hp.toasts.at(-1)?.title ?? null;
      t.same(
        [toast, byAction('hall-today-card').length, bodyRows(daysTable()).length > 0, byAction('day-record').length > 0],
        ['محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال', 1, true, true],
        `R2 after an offline save the hall page keeps its today card and days (to record the next missing day); body now: «${text().slice(0, 160)}»`,
      );
    });

    // ── R3: DayDialog acks every run, hiding «returned to the manager» for other halls from the round page ──
    await step('R3 ack hides other results', async () => {
      const c = cycle('f-1', 9, [[2, { dead: 1 }]]);
      const other = cycle('f-2', 9);
      fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary), hall('h-2', '2', other.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r3', send: (op) => (op.flockId === 'f-2' ? { kind: 'parked' } : { kind: 'saved', version: 1 }) });
      // hall 2's round saved on this device earlier (e.g. offline), not yet sent
      await m.saveRound(await m.openOutbox(), stampOf('u-r3'), { fn: 'save_flock_day', flockId: 'f-2', day: SERVER_DAY, payload: { dead: 2 }, baseVersion: null });
      await mount('/broiler/hall/h-1');
      await click(dayRowOf(3) ? byAction('day-record', dayRowOf(3))[0] : null);
      type(dayField('dead'), '3');
      await settle();
      await click(byAction('day-save', dayDialog() ?? body())[0] ?? null, 160);
      const toasts = globalThis.__hp.toasts.map((x) => x.title);
      await unmount();
      await mount('/broiler/round');
      t.ok(
        text().includes('جولات أُرسلت من هذا الجهاز ولم تُحفظ كما هي') || toasts.some((x) => x.includes('قاعة 2') || x.includes('رُدّت')),
        `R3 hall 2's round was parked by the upload the hall page triggered; it must be told somewhere (toasts: ${JSON.stringify(toasts)}; round page notice present: ${text().includes('جولات أُرسلت من هذا الجهاز ولم تُحفظ كما هي')})`,
      );
    });

    await step('R3 control (no hall-page save)', async () => {
      const c = cycle('f-1', 9, [[2, { dead: 1 }]]);
      const other = cycle('f-2', 9);
      fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary), hall('h-2', '2', other.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r3c' });
      await m.saveRound(await m.openOutbox(), stampOf('u-r3c'), { fn: 'save_flock_day', flockId: 'f-2', day: SERVER_DAY, payload: { dead: 2 }, baseVersion: null });
      await m.uploadRounds(stampOf('u-r3c'), transport('u-r3c', async () => ({ kind: 'parked' })));
      await mount('/broiler/round');
      t.ok(text().includes('جولات أُرسلت من هذا الجهاز ولم تُحفظ كما هي'), 'R3 control: the same parked result IS announced on the round page when the hall page did not ack it');
    });

    // ── R1c: every online save from the hall page remounts the whole page (overview re-read, page renders null in between) ──
    await step('R1c save remounts page', async () => {
      const c = cycle('f-1', 9, [[2, { dead: 1 }]]);
      const { calls } = fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r1c' });
      await mount('/broiler/hall/h-1');
      const card = byAction('hall-today-card')[0];
      const overviewReads = named(calls, 'loadOverviewJson').length;
      let blank = false;
      const unsub = m.roundQueueStore.subscribe?.(() => {
        queueMicrotask(() => {
          if (byAction('hall-today-card').length === 0 && !text().includes('تعذّر')) blank = true;
        });
      });
      await click(dayRowOf(3) ? byAction('day-record', dayRowOf(3))[0] : null);
      type(dayField('dead'), '3');
      await settle();
      await click(byAction('day-save', dayDialog() ?? body())[0] ?? null, 160);
      if (typeof unsub === 'function') unsub();
      t.same(
        [byAction('hall-today-card')[0] === card, named(calls, 'loadOverviewJson').length - overviewReads],
        [true, 0],
        `R1c saving one day keeps the page mounted (same today-card node) and does not re-read all fields (blank seen: ${blank})`,
      );
    });

    // ── R8: the negative-feed sentence links to «أضف للقاعة» exactly when the button is there (0034: a viewer can give) ──
    await step('R8 viewer feed link', async () => {
      const c = cycle('f-1', 9);
      const raw = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'flock-issue-0019.json'), 'utf8')).flock_feed.owner;
      raw.remaining_feed_kg = '-12.500';
      const feed = m.parseFlockFeed(raw);
      fresh('viewer', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c, { canSave: false })),
        loadFlockFeed: () => feed,
      }, { userId: 'u-r8' });
      await mount('/broiler/hall/h-1');
      t.same(
        [byAction('flock-give').length, byAction('feed-negative').length, byAction('feed-negative-give').length],
        [1, 1, 1],
        `R8 viewer (0034, everyone like the owner): «أضف للقاعة» is there, and the negative-feed sentence links to the give page (${textOf('feed-negative')})`,
      );
    });

    // ── R4: live start of a day without a line ignores sales/count diffs (server value differs) ──
    await step('R4 live start after a sale', async () => {
      // placed 5000 nine days ago; day 8 recorded (no loss); 3000 birds sold on day 5 ago (no round that day): live now 2000
      const c = cycle('f-1', 9, [[8, { dead: 0 }]], { live: 2000, live_start_today: 2000 });
      fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r4' });
      await mount('/broiler/hall/h-1');
      await click(byAction('hall-today-record')[0] ?? null);
      const hint = dayDialog() ? descendants(dayDialog()).find((n) => n.localName === 'p')?.textContent ?? '' : '';
      t.ok(hint.includes('2,000'), `R4 today's dialog says the server's live start of today (2,000, flock.liveStartToday as on the round page): «${hint}»`);
      type(dayField('dead'), '2500');
      await settle();
      const fieldError = dayDialog() ? textOf('day-dead', dayDialog()) : null;
      await click(byAction('day-save', dayDialog() ?? body())[0] ?? null, 120);
      t.same([globalThis.__hp.toasts.length, Boolean(dayDialog())], [0, true], `R4 dead 2,500 > 2,000 alive is refused before sending (like the round page), not sent and later rejected (toasts: ${JSON.stringify(globalThis.__hp.toasts.map((x) => x.title))}, ${fieldError})`);
    });

    await step('R4b positive count diff blocks a valid round', async () => {
      // placed 5000; day 8 ago: dead 4990 (end 10); manager's count adjust +500 on day 6 ago (no round): live now 510
      const c = cycle('f-1', 9, [[8, { dead: 4990 }]], { live: 510, live_start_today: 510 });
      fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r4b' });
      await mount('/broiler/hall/h-1');
      await click(byAction('hall-today-record')[0] ?? null);
      type(dayField('dead'), '20');
      await settle();
      await click(byAction('day-save', dayDialog() ?? body())[0] ?? null, 120);
      const err = dayDialog() ? descendants(dayDialog()).filter((n) => n.getAttribute('role') === 'alert' || /error/u.test(n.id ?? '')).map((n) => n.textContent).join(' | ') : '';
      t.same([Boolean(dayDialog()), globalThis.__hp.toasts.map((x) => x.title)], [false, ['حُفظت الزيارة.']], `R4b dead 20 of 510 alive (server accepts) is not blocked by the dialog: «${err || text().slice(-200)}»`);
    });

    // ── R5: deleting the flock from the hall page leaves a locked dialog over a deleted flock ──
    await step('R5 delete from hall page', async () => {
      const c = cycle('f-1', 9);
      let deleted = false;
      const { calls } = fresh('manager', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', deleted ? null : c.summary)], true),
        loadFlockDetail: () => m.parseDetail(detailJson(c, { canManage: true })),
        loadFlockFeed: () => new Promise(() => {}),
      }, {
        userId: 'u-r5',
        rpc: (fn) => {
          if (fn === 'delete_flock') {
            deleted = true;
            return { flock_id: 'f-1', deleted: true };
          }
          return null;
        },
      });
      await mount('/broiler/hall/h-1');
      await click(byAction('flock-edit')[0] ?? null, 90);
      const opened = Boolean(dialogTitled('تعديل فوج'));
      await click(byAction('flock-delete')[0] ?? null, 60);
      await click(byAction('flock-delete-confirm')[0] ?? null, 120);
      t.same(
        [opened, named(calls, 'rpc:delete_flock').length, Boolean(dialogTitled('تعديل فوج')), byAction('hall-today-card').length, byAction('hall-empty').length],
        [true, 1, false, 0, 1],
        `R5 after «احذف الفوج» on /broiler/hall/h-1: dialog closed, the deleted flock gone, the hall shown empty (overview reads: ${named(calls, 'loadOverviewJson').length}, location ${globalThis.__hp.location}, close disabled: ${byAction('dialog-close', dialogTitled('تعديل فوج') ?? body())[0]?.getAttribute('disabled') !== null}, aria-busy: ${descendants(dialogTitled('تعديل فوج') ?? body()).some((n) => n.getAttribute('aria-busy') === 'true')}, toast: ${globalThis.__hp.toasts.at(-1)?.title})`,
      );
    });

    // ── R6: toast reports the first result for (flock, day) in the joined uploads, not this save's ──
    await step('R6 joined upload result', async () => {
      const c = cycle('f-1', 9, [[2, { dead: 1 }]]);
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      fresh('hall_worker', {
        loadOverviewJson: () => overviewOf([hall('h-1', '1', c.summary)], false),
        loadFlockDetail: () => m.parseDetail(detailJson(c)),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r6' });
      // an earlier round for day 3 ago (from the round page or another tab) is being sent right now on a slow line
      await m.saveRound(await m.openOutbox(), stampOf('u-r6'), { fn: 'save_flock_day', flockId: 'f-1', day: ago(3), payload: { dead: 1 }, baseVersion: null });
      let n = 0;
      const running = m.uploadRounds(stampOf('u-r6'), transport('u-r6', async () => {
        n += 1;
        if (n === 1) {
          await gate;
          return { kind: 'stale_day', server: {} };
        }
        return { kind: 'saved', version: 2 };
      }));
      await settle(20);
      await mount('/broiler/hall/h-1');
      await click(dayRowOf(3) ? byAction('day-record', dayRowOf(3))[0] : null);
      type(dayField('culled'), '4');
      await settle();
      const saving = click(byAction('day-save', dayDialog() ?? body())[0] ?? null, 40);
      await settle(20);
      release();
      await running;
      await saving;
      await settle(160);
      const review = await m.reviewEntries(await m.openOutbox(), stampOf('u-r6'));
      t.same(
        [review.map((entry) => entry.op.payload.culled ?? null), globalThis.__hp.toasts.at(-1)?.title ?? null],
        [[null], 'حُفظت الزيارة.'],
        'R6 this dialog\'s op (culled 4) was saved; only the older op went to review — the toast must say saved',
      );
    });

    // ── R7: prev/next crosses into another site with an indistinguishable label ──
    await step('R7 prev/next across sites', async () => {
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
        loadFlockDetail: () => m.parseDetail(detailJson(a2, { hallId: 'h-a2', hallName: '2' })),
        loadFlockFeed: () => new Promise(() => {}),
      }, { userId: 'u-r7' });
      await mount('/broiler/hall/h-a2');
      const next = byAction('hall-next')[0];
      t.same([next?.getAttribute('href') ?? null, next?.textContent ?? null], [null, null], `R7 «التالية» from the last hall of حقل الشمال should stay in that field (got ${next?.getAttribute('href')} labelled «${next?.textContent}» = حقل الجنوب's hall 1)`);
    });
  } finally {
    delete globalThis.__hp;
    restore();
  }
}
