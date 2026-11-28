// Adversarial review of contract 0038 Part S (hall sections) on the hall sheet. Kept as the regression test of the 2026-11-27 review: each case failed on b5c2e56 and passes after its fix.
// Harness copied from sheet-grid.test.mjs (real FarmRoutes + real outbox on fake-indexeddb + real parsers).
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPLIT = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sections.hand.json'), 'utf8')).hall_sheet;
const BROILER = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8')).hall_sheet.broiler;
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS};
    export const loadOverviewJson = (...a) => globalThis.__sg.call('loadOverviewJson', a);
    export const loadOverview = async () => __parseOverview(await globalThis.__sg.call('loadOverviewJson', []));
    export const recordFlockWeight = (...a) => globalThis.__sg.call('record_flock_weight', a);
    export const flockDayTransport = { currentUserId: async () => globalThis.__sg.userId, send: (op) => globalThis.__sg.send(op), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseHallSheet as __sheet, parseFeedSent as __sent } from ${REAL_SHEET};
    export const loadHallSheet = async (id) => __sheet(await globalThis.__sg.call('hall_sheet', [id]));
    export const sendFlockFeed = async (request) => __sent(await globalThis.__sg.call('send_flock_feed', [request]));
    export const voidSheetFeed = (...a) => globalThis.__sg.call('void_flock_issue', a);
    export const decideFlockReject = async (...a) => globalThis.__sg.call('decide_flock_reject', a);`,
  session: 'export const useSession = () => globalThis.__sg.session;',
  Toast: 'export const toast = (spec) => { globalThis.__sg.toasts.push(spec); }; export function Toaster() { return null; }',
  FlockCard: 'export default function FlockCard() { return null; }',
  hallsChunk: `import FlockPage, { HallPage } from './src/pages/farm/FlockPage.tsx';
    const nothing = () => null;
    export const loadHalls = () => Promise.resolve({ HallPage, FlockPage, FlockCard: nothing, Reminders: nothing, FlockEditDialog: nothing });`,
};
const BUILD = {
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  logLevel: 'silent',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
};
async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { openOutbox, pendingOps, reviewEntries } from './src/lib/outbox/index.ts';",
  ].join('\n');
  const result = await build({
    ...BUILD,
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    plugins: [
      {
        name: 'grid-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/hallsChunk$|\/halls\/FlockCard$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'grid-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'grid-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const clone = (value) => JSON.parse(JSON.stringify(value));
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const cells = (tr) => (tr?.children ?? []).filter((c) => c.localName === 'td' || c.localName === 'th').map((c) => c.textContent);
const cursorAt = () => all().find((n) => n.getAttribute('data-cursor') === 'true')?.getAttribute('data-cell') ?? null;
const focused = () => globalThis.document.activeElement;
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0, detail: 1 });
  await settle(rounds);
};
const press = async (key, mods = {}, rounds = 30) => {
  fire(focused() ?? body(), 'keydown', { key, code: mods.code, shiftKey: Boolean(mods.shift), ctrlKey: Boolean(mods.ctrl), metaKey: false, altKey: false });
  await settle(rounds);
};
const pencil = async () => click(byAction('sheet-pencil')[0] ?? null, 30);

export default async function (t) {
  const restore = installDom();
  const savedRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  const savedClient = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Element.prototype.getBoundingClientRect = function rect() {
    if (this.localName === 'tr') {
      const rows = (this.parentNode?.children ?? []).filter((c) => c.localName === 'tr');
      return { top: 40 + rows.indexOf(this) * 40, height: 40 };
    }
    if (this.localName === 'td') return { top: 0, height: 40 };
    return { top: 0, height: 400 };
  };
  Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 400, configurable: true });
  Object.defineProperty(Element.prototype, 'scrollTop', { value: 0, writable: true, configurable: true });
  Element.prototype.scrollIntoView = function into() {};
  Object.defineProperty(Element.prototype, 'isConnected', {
    get() {
      for (let n = this; n; n = n.parentNode) if (n === globalThis.document) return true;
      return false;
    },
    configurable: true,
  });
  let root = null;
  try {
    const m = await screens();
    const ws = (userId) => ({
      userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'hall_worker', scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const summaryOf = (sheet) => ({
      id: sheet.flock.id, kind: sheet.flock.kind, breed: null, status: sheet.flock.status, version: 3, placed_on: sheet.flock.placed_on, placed_count: sheet.flock.placed_count,
      age_days_at_placement: sheet.flock.age0, age_days: 20, days_since_placement: 21, dead_total: 32, culled_total: 0, live: 3968, live_start_today: 3972, mortality_pct: '0.64',
      feed_kg_total: '0.000', feed_days: 0, feed_span_days: 20, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0,
      ...(sheet.sections ? { section_counts: [2500, 2500], section_dead: [18, 14] } : {}),
    });
    const overviewOf = (sheet) => ({
      today: sheet.today,
      sites: [{ id: 's-1', name: sheet.flock.site_name, division_id: 'd-1', kind: sheet.flock.kind, can_manage: true, halls: [{ id: sheet.flock.hall_id, name: sheet.flock.hall_name, capacity: 6000, version: 1, sections: sheet.sections ? 2 : 1, flock: summaryOf(sheet) }] }],
    });
    let userSeq = 0;
    const fresh = (handlers, { send } = {}) => {
      const sent = [];
      userSeq += 1;
      const userId = `u-zz-${userSeq}`;
      globalThis.__sg = {
        session: { status: 'ready', workspace: ws(userId), offline: false },
        userId,
        toasts: [],
        call(name, args) {
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
      return { sent, userId };
    };
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) })))));
      await settle(90);
    };
    const unmount = async () => {
      if (!root) return;
      m.flushSync(() => root.unmount());
      body().textContent = '';
      globalThis.document.activeElement = null;
      await settle();
      root = null;
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
    const open = async (sheet = SPLIT, options = {}) => {
      const ctx = fresh({ loadOverviewJson: () => overviewOf(sheet), hall_sheet: () => clone(sheet) }, options);
      await mount(`/broiler/hall/${sheet.flock.hall_id}`);
      return ctx;
    };
    const queueFor = async (userId) => m.pendingOps(await m.openOutbox(), { userId, orgId: 'org-1', displayName: 'علي' });
    const TODAY = SPLIT.today;
    const sheetTable = () => tableBy('هلاكات قاعة (7)');

    // ── R1: two section cells of the same day edited one after the other (keyboard: «5» ← «9» Enter), the second committed before the
    // first's enqueue finished. Expected: the day's op carries both sections [5, 9] (sum 14). Today on b5c2e56 the second commit
    // computes its parts from a queue read taken before the first op was written, and the queue merge replaces dead/dead_parts
    // wholesale, so ق1's 5 is silently lost: {dead: 11, dead_parts: [2, 9]}.
    await step('R1 race', async () => {
      const { userId } = await open();
      await pencil();
      m.onlineStore.set(false);
      await settle();
      t.eq(cursorAt(), '20:2', 'R1 control: cursor on today ق1');
      await press('5', {}, 0);
      await press('ArrowLeft', {}, 0); // commits ق1 = 5 and moves to ق2 (rtl)
      await press('9', {}, 0);
      await press('Enter', {}, 0); // commits ق2 = 9 while ق1's commit is still in flight
      await settle(400);
      const ops = (await queueFor(userId)).filter((op) => op.day === TODAY).map((op) => [op.fn, op.payload]);
      t.same(ops, [['save_flock_day', { dead: 14, dead_parts: [5, 9], culled: null }]], 'R1 two section edits of one day in quick succession keep both sections (ق1 5, ق2 9; sum 14)');
      t.same(cells(bodyRows(sheetTable())[20]).slice(2, 4).map((text) => text.replace('بانتظار الرفع', '')), ['5', '9'], 'R1 the cells show what was typed after the queue settles');
    });

    // ── R1 control: the same two edits with time between them (each commit finished before the next): both sections kept.
    await step('R1 control', async () => {
      const { userId } = await open();
      await pencil();
      m.onlineStore.set(false);
      await settle();
      await press('5', {}, 0);
      await press('ArrowLeft', {}, 200);
      await press('9', {}, 0);
      await press('Enter', {}, 200);
      const ops = (await queueFor(userId)).filter((op) => op.day === TODAY).map((op) => [op.fn, op.payload]);
      t.same(ops, [['save_flock_day', { dead: 14, dead_parts: [5, 9], culled: null }]], 'R1 control: sequential edits keep both sections');
    });

    // ── R1 unsplit control: the same back-to-back commits on a hall NOT split (deaths, then the note of the same day) lose nothing:
    // each field is its own key in the merged op. The loss above is specific to section cells, which rewrite dead/dead_parts as a pair.
    await step('R1 unsplit control', async () => {
      const ctx = await open(BROILER);
      await pencil();
      m.onlineStore.set(false);
      await settle();
      await press('5', {}, 0);
      await press('ArrowLeft', {}, 0); // commit deaths, move to gas
      await press('ArrowLeft', {}, 0); // kerosene
      await press('ArrowLeft', {}, 0); // feed
      await press('ArrowLeft', {}, 0); // note
      await press('\u{62A}', {}, 0);
      await press('Enter', {}, 0);
      await settle(400);
      const ops = (await queueFor(ctx.userId)).filter((op) => op.day === BROILER.today).map((op) => op.payload);
      t.same(ops, [{ dead: 5, culled: null, note: '\u{62A}' }], 'R1 unsplit control: deaths and note committed back to back are both kept');
    });

    // ── R1b: the same race through Ctrl+Z held down (key repeat): two undo steps (ق2 then ق1) of one day replayed back to back.
    // Expected after both undos: the day back to its saved sections [2, 2] (sum 4). On b5c2e56 one undo is lost.
    await step('R1b undo race', async () => {
      const { userId } = await open();
      await pencil();
      m.onlineStore.set(false);
      await settle();
      await press('5', {}, 0);
      await press('ArrowLeft', {}, 200);
      await press('9', {}, 0);
      await press('Enter', {}, 200);
      const before = (await queueFor(userId)).filter((op) => op.day === TODAY).map((op) => op.payload);
      t.same(before, [{ dead: 14, dead_parts: [5, 9], culled: null }], 'R1b control: both sections edited (one op [5, 9])');
      await press('z', { ctrl: true }, 0); // undo ق2 = 9 → 2
      await press('z', { ctrl: true }, 0); // undo ق1 = 5 → 2, before the first undo's enqueue finished
      await settle(400);
      const after = (await queueFor(userId)).filter((op) => op.day === TODAY).map((op) => op.payload);
      t.same(after, [{ dead: 4, dead_parts: [2, 2], culled: null }], 'R1b two quick undos of one day restore both sections ([2, 2], sum 4)');
    });

    // ── R3: paste into one section over several days. The sheet bounds a paste's deaths TOGETHER by the hall's live birds (G12:
    // «هلاكات اللصق معاً لا تتجاوز الحيّ (كلّ يوم وحده دونه)»), but each section only day by day: ق1 has 2,500 − 18 = 2,482 left,
    // and «1300» on two empty days passes the preview for both (each ≤ 2,482; the hall total 2,600 ≤ 3,968). The server then
    // refuses the second (live_negative naming ق1) and it lands on the review shelf. Expected: the second day refused in the preview.
    await step('R3 paste per section', async () => {
      const { sent } = await open();
      await pencil();
      const moveTo = async (row, col) => {
        const [r, c] = (cursorAt() ?? '0:0').split(':').map(Number);
        for (let i = r; i < row; i += 1) await press('ArrowDown', {}, 5);
        for (let i = r; i > row; i -= 1) await press('ArrowUp', {}, 5);
        for (let i = c; i < col; i += 1) await press('ArrowLeft', {}, 5);
        for (let i = c; i > col; i -= 1) await press('ArrowRight', {}, 5);
        await settle(10);
      };
      await moveTo(13, 2);
      await press('v', { ctrl: true });
      fire(focused() ?? body(), 'paste', { clipboardData: { getData: (kind) => (kind === 'text/plain' ? '1300\r\n1300' : '') } });
      await settle(30);
      const rows = bodyRows(tableBy('الصق في الجدول')).map(cells);
      t.same(
        rows.map((row) => [row[0], row[1], row[4]]),
        [['26/11/2026', 'هلاكات ق1', 'يُكتب'], ['27/11/2026', 'هلاكات ق1', 'لا يُكتب: هلاكات ق1 أكثر من طيوره الباقية (1,182).']],
        'R3 a paste into ق1 over two days is bounded by ق1’s remaining together (2,482: 1,300 + 1,300 refused on the second day)',
      );
      await click(byAction('grid-batch-go')[0] ?? null, 200);
      t.same(sent.map((op) => [op.day, op.payload.dead_parts]), [['2026-11-26', [1300, 0]]], 'R3 only the first day is sent');
    });

    // ── R2: a round's deaths parked by the server for a split batch (contract D2: the parked payload keeps {dead, parts}). The sheet's
    // «ما رُدّ من الأجهزة» line is what the manager re-enters from («أُدخلت»); on b5c2e56 it says «الهلاكات 5» with no section.
    await step('R2 parked parts', async () => {
      const sheet = clone(SPLIT);
      sheet.rejects = [{ id: '5e000000-0000-4000-8000-000000000699', on: '2026-11-19', reason: 'period_locked', created_at: '2026-11-28T09:15:00+03:00', payload: { dead: 5, parts: [3, 2] }, version: 1 }];
      await open(sheet);
      const line = byAction('sheet-reject')[0]?.textContent ?? '';
      t.ok(line.includes('ق1') && line.includes('ق2'), `R2 the parked line names each section's deaths (ق1 3، ق2 2): «${line}»`);
    });
  } finally {
    if (savedRect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', savedRect);
    if (savedClient) Object.defineProperty(Element.prototype, 'clientHeight', savedClient);
    restore();
  }
}
