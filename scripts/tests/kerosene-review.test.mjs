// مراجعة الكاز العدائية (عقد 0037 الجزء S، 2026-11-27): كلّ حالة هنا فشلت على الشفرة قبل إصلاحها.
// Q: الطابور الحقيقي والناقل الحقيقي (sendFlockDay على postgrest-js) أمام خادمٍ يجيب كما يقول العقد (D2/D3) بالضبط: مسحٌ لكازٍ أو غازٍ لم يُرسل قطّ يحذف
//    عمليته، والخادم يجيب مسح يومٍ بلا صفّ «حُفظ» بلا نسخة فيُقرأ (كان يرمي فيعلق طابور الجهاز كلّه)، ومسحٌ خلف قيمة في الطريق يصل.
// U1 وR1 وS1 وP1: ورقة القاعة الحقيقية (FarmRoutes ← FlockPage وSheetGrid وCellSheet) على الـDOM المصغّر، والطابور الحقيقي على fake-indexeddb.
// (والمعروف المتروك: تصحيحٌ أثناء رفعٍ جارٍ يُرسل بلا نسخته فيُردّ إلى رفّ المراجعة — قائمٌ منذ غاز 0035، DECISIONS 2026-11-27.)
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';
import { loadSrc } from './load-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8'));

const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__zzServer.fetch(...a) });
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' }, access_token: 'a' } }, error: null }), refreshSession: async () => ({ data: { session: {} }, error: null }) },
    from: (table) => rest.from(table),
    rpc: (fn, args) => rest.rpc(fn, args),
  };
}
export const STORED_SESSION = /^sb-.+-auth-token$/;
export function addAuthListener() { return () => {}; }
export async function dropClient() {}
`;

async function transport() {
  const result = await build({
    stdin: { contents: "export * as repo from './src/lib/repo/flocks.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [
      {
        name: 'zz-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'zz-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'zz-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/**
 * set_flock_kerosene exactly as contract D3 (= set_flock_gas of 0035 with kerosene names): ref replay; no row and p_liters null, or the same value
 * now -> saved with flock_kerosene_json(p_on, k) (no row -> liters and version null, D2); version differs -> stale_kerosene; else insert/update.
 * args: { p_flock, p_on, p_liters, p_expected_version, p_client_ref }.
 */
function keroseneRpc() {
  const rows = new Map();
  const refs = new Map();
  return {
    rows,
    answer(body) {
      const cached = refs.get(body.p_client_ref);
      if (cached !== undefined) return cached;
      const key = `${body.p_flock}|${body.p_on}`;
      const k = rows.get(key) ?? null;
      const shape = (row) => ({ on: body.p_on, liters: row ? row.liters : null, version: row ? row.version : null });
      let json;
      if ((k === null && body.p_liters === null) || (k !== null && k.liters === body.p_liters)) json = { status: 'saved', kerosene: shape(k) };
      else if ((body.p_expected_version ?? null) !== (k ? k.version : null)) json = { status: 'stale_kerosene', server: shape(k) };
      else {
        const next = { liters: body.p_liters, version: (k?.version ?? 0) + 1 };
        rows.set(key, next);
        json = { status: 'saved', kerosene: shape(next) };
      }
      refs.set(body.p_client_ref, json);
      return json;
    },
  };
}
const keroArgs = (op) => ({ p_flock: op.flockId, p_on: op.day, p_liters: op.payload.liters, p_expected_version: op.baseVersion, p_client_ref: op.id });

/** set_flock_gas (0035) كما هو: مثل الكاز بالقناني. */
function gasRpc() {
  const rows = new Map();
  const refs = new Map();
  return {
    rows,
    answer(body) {
      const cached = refs.get(body.p_client_ref);
      if (cached !== undefined) return cached;
      const key = `${body.p_flock}|${body.p_on}`;
      const g = rows.get(key) ?? null;
      const shape = (row) => ({ on: body.p_on, cylinders: row ? row.cylinders : null, version: row ? row.version : null });
      let json;
      if ((g === null && body.p_cylinders === null) || (g !== null && g.cylinders === body.p_cylinders)) json = { status: 'saved', gas: shape(g) };
      else if ((body.p_expected_version ?? null) !== (g ? g.version : null)) json = { status: 'stale_gas', server: shape(g) };
      else {
        const next = { cylinders: body.p_cylinders, version: (g?.version ?? 0) + 1 };
        rows.set(key, next);
        json = { status: 'saved', gas: shape(next) };
      }
      refs.set(body.p_client_ref, json);
      return json;
    },
  };
}

function contractServer() {
  const kero = keroseneRpc();
  const gas = gasRpc();
  let down = 0;
  const days = new Map();
  const refs = new Map();
  const calls = [];
  return {
    calls,
    kero,
    gas,
    /** الطلبات n التالية تنقطع (لا جواب): النتيجة مجهولة والعملية تبقى بالطابور. */
    dropNext(n) {
      down = n;
    },
    async fetch(url, init) {
      const fn = String(url).split('/rpc/')[1];
      const body = init.body ? JSON.parse(init.body) : {};
      calls.push([fn, body]);
      if (down > 0) {
        down -= 1;
        throw new TypeError('Failed to fetch');
      }
      let json;
      if (fn === 'set_flock_kerosene') json = kero.answer(body);
      else if (fn === 'set_flock_gas') json = gas.answer(body);
      else if (refs.has(body.p_client_ref)) json = refs.get(body.p_client_ref);
      else if (fn === 'save_flock_day') {
        const key = `${body.p_flock}|${body.p_date}`;
        const row = days.get(key) ?? null;
        if ((body.p_base_version ?? null) !== (row ? row.version : null)) json = { status: 'stale_day', server: row };
        else {
          const version = (row?.version ?? 0) + 1;
          days.set(key, { version, dead: body.p_dead });
          json = { status: 'saved', version };
        }
        refs.set(body.p_client_ref, json);
      } else json = { status: 'unknown_fn' };
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

// ─── screen harness (as hall-sheet.test) ──────────────────────────────────────────────────────────────────────────
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS};
    export const loadOverviewJson = (...a) => globalThis.__hs.call('loadOverviewJson', a);
    export const loadOverview = async () => __parseOverview(await globalThis.__hs.call('loadOverviewJson', []));
    export const recordFlockWeight = (...a) => globalThis.__hs.call('record_flock_weight', a);
    export const flockDayTransport = { currentUserId: async () => globalThis.__hs.userId, send: (op) => globalThis.__hs.send(op), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseHallSheet as __sheet, parseFeedSent as __sent } from ${REAL_SHEET};
    export const loadHallSheet = async (id) => __sheet(await globalThis.__hs.call('hall_sheet', [id]));
    export const sendFlockFeed = async (request) => __sent(await globalThis.__hs.call('send_flock_feed', [request]));
    export const voidSheetFeed = (...a) => globalThis.__hs.call('void_flock_issue', a);
    import * as __S from ${REAL_SHEET}; const __outcome = (answer) => (__S.rejectOutcome ? __S.rejectOutcome(answer) : answer);
    export const decideFlockReject = async (...a) => __outcome(await globalThis.__hs.call('decide_flock_reject', a));`,
  session: 'export const useSession = () => globalThis.__hs.session;',
  Toast: 'export const toast = (spec) => { globalThis.__hs.toasts.push(spec); }; export function Toaster() { return null; }',
  FlockCard: 'export default function FlockCard() { return null; }',
  hallsChunk: `import FlockPage, { HallPage } from './src/pages/farm/FlockPage.tsx';
    const nothing = () => null;
    export const loadHalls = () => Promise.resolve({ HallPage, FlockPage, FlockCard: nothing, Reminders: nothing, FlockEditDialog: nothing });`,
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { default as ReportPage, summaryRows, reportDays } from './src/pages/halls/ReportPage.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { openOutbox, pendingOps, reviewEntries, saveRound } from './src/lib/outbox/index.ts';",
    "export { uploadRounds, roundQueueStore } from './src/lib/roundUploads.ts';",
    "export { parseHallSheet } from './src/lib/repo/hallSheet.ts';",
    "export { keroseneAnswer } from './src/lib/repo/flocks.ts';",
    "export { fmtDay, fmtInt } from './src/lib/format.ts';",
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
        name: 'sheet-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/hallsChunk$|\/halls\/FlockCard$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'sheet-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'sheet-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
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
const clone = (value) => JSON.parse(JSON.stringify(value));
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0, detail: 1 });
  await settle(rounds);
};
const tap = async (node, rounds = 60) => {
  if (node) {
    fire(node, 'pointerdown', { pointerType: 'touch', button: 0, buttons: 1 });
    fire(node, 'click', { button: 0, detail: 1 });
  }
  await settle(rounds);
};
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const footRow = (table) => (section(table, 'tfoot')?.children ?? []).find((c) => c.localName === 'tr') ?? null;
const headers = (table) => descendants(section(table, 'thead') ?? body()).filter((n) => n.localName === 'th').map((n) => n.textContent);
const cells = (tr) => (tr?.children ?? []).filter((c) => c.localName === 'td' || c.localName === 'th').map((c) => c.textContent);
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
const key = (dialog, value) => (dialog ? descendants(dialog).find((n) => n.localName === 'button' && n.getAttribute('aria-label') === value) ?? null : null);
const pencil = async () => {
  const button = byAction('sheet-pencil')[0] ?? null;
  if (button) fire(button, 'click', { button: 0, detail: 1 });
  await settle(30);
};

export default async function (t) {
  // ── Q: الطابور والناقل الحقيقيان أمام خادم العقد ───────────────────────────────────────────────────────────────────────
  {
    const savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
    try {
      const { repo } = await transport();
      const q = await loadSrc('src/lib/outbox/index.ts');
      const STAMP = { userId: 'u-1', orgId: 'o-1', displayName: 'علي' };
      const ops = async (db) => (await q.pendingOps(db, STAMP)).map((op) => [op.fn, op.payload, op.baseVersion, op.state]);
      for (const [fn, field, value] of [
        ['set_flock_kerosene', 'liters', 300],
        ['set_flock_gas', 'cylinders', 4],
      ]) {
        const table = fn === 'set_flock_kerosene' ? 'kero' : 'gas';
        // Q1: قيمة ليومٍ بلا صفّ ثمّ مسحها قبل أن تُرسل (بلا نت، أو «امسح» أو Ctrl+Z): لا شيء يُرسل، وما بعدها يُرفع.
        {
          const server = (globalThis.__zzServer = contractServer());
          const db = await q.openOutbox(`kero-review-q1-${table}`);
          await q.saveRound(db, STAMP, { fn, flockId: 'f-1', day: '2026-11-20', payload: { [field]: value }, baseVersion: null });
          const dropped = await q.saveRound(db, STAMP, { fn, flockId: 'f-1', day: '2026-11-20', payload: { [field]: null }, baseVersion: null });
          await q.saveRound(db, STAMP, { fn: 'save_flock_day', flockId: 'f-1', day: '2026-11-21', payload: { dead: 2 }, baseVersion: null });
          t.same([dropped, await ops(db)], [null, [['save_flock_day', { dead: 2 }, null, 'pending']]], `Q1 ${fn}: مسح قيمةٍ لم تُرسل قطّ ليومٍ بلا صفّ يحذف عمليتها`);
          const run = await q.flush(db, STAMP, repo.flockDayTransport);
          t.same([run.stopped, await ops(db), server.calls.map(([name]) => name)], ['done', [], ['save_flock_day']], `Q1 ${fn}: الرفع يُفرغ الطابور ولا يرسل للمسح شيئاً`);
        }
        // Q2: مسحٌ وحده ليومٍ بلا صفّ (لا عملية منتظرة يُدمج فيها): الخادم يجيب «حُفظ» بلا صفّ ولا نسخة، فيُقرأ ولا يعلق الطابور.
        {
          const server = (globalThis.__zzServer = contractServer());
          const db = await q.openOutbox(`kero-review-q2-${table}`);
          await q.saveRound(db, STAMP, { fn, flockId: 'f-1', day: '2026-11-20', payload: { [field]: null }, baseVersion: null });
          await q.saveRound(db, STAMP, { fn: 'save_flock_day', flockId: 'f-1', day: '2026-11-21', payload: { dead: 2 }, baseVersion: null });
          const first = await q.flush(db, STAMP, repo.flockDayTransport);
          t.same(
            // يوما العمليتين مختلفان، فترتيب إرسالهما غير ثابت (قد يتساوى وقتاهما): المهمّ أنّ كلتيهما أُرسلتا.
            [first.stopped, await ops(db), server.calls.map(([name]) => name).sort()],
            ['done', [], [fn, 'save_flock_day'].sort()],
            `Q2 ${fn}: «حُفظ» بلا نسخة (لا صفّ) يُقرأ، والعملية بعده تُرفع (لا يعلق طابور الجهاز)`,
          );
        }
        // Q3: قيمةٌ في الطريق (أُرسلت وضاع جوابها) ثمّ تصحيحٌ ثمّ مسح: المنتظرة ليست وحدها لنوعها، فالمسح يُدمج فيها ولا يحذفها، فيصل الخادمَ بعد تلك.
        {
          const server = (globalThis.__zzServer = contractServer());
          const db = await q.openOutbox(`kero-review-q3-${table}`);
          await q.saveRound(db, STAMP, { fn, flockId: 'f-1', day: '2026-11-20', payload: { [field]: value }, baseVersion: null });
          server.dropNext(1);
          const lost = await q.flush(db, STAMP, repo.flockDayTransport);
          await q.saveRound(db, STAMP, { fn, flockId: 'f-1', day: '2026-11-20', payload: { [field]: value + 50 }, baseVersion: null });
          const merged = await q.saveRound(db, STAMP, { fn, flockId: 'f-1', day: '2026-11-20', payload: { [field]: null }, baseVersion: null });
          t.same([lost.stopped, merged?.payload ?? null, (await ops(db)).map(([, , , state]) => state)], ['network', { [field]: null }, ['unknown', 'pending']], `Q3 ${fn}: المسح يُدمج في المنتظرة خلف عمليةٍ في الطريق`);
          await q.flush(db, STAMP, repo.flockDayTransport);
          const row = server[table].rows.get('f-1|2026-11-20') ?? null;
          t.same([await ops(db), row ? row[field] : 'none', row?.version ?? null], [[], null, 2], `Q3 ${fn}: القيمة الأولى تُحفظ (1) ثمّ المسح بنسختها (2): الخادم بلا قيمة كما أراد المستخدم`);
        }
      }
      // Q4: المحلّلان يقرآن «حُفظ» بلا صفّ (قيمة ونسخة فارغتان معاً)، ويرفضان نسخةً فارغة مع قيمة.
      t.same(
        [
          repo.keroseneAnswer({ status: 'saved', kerosene: { on: '2026-11-20', liters: null, version: null } }),
          repo.gasAnswer({ status: 'saved', gas: { on: '2026-11-20', cylinders: null, version: null } }),
        ].map((result) => [result.kind, result.version]),
        [
          ['saved', null],
          ['saved', null],
        ],
        'Q4 «حُفظ» بلا صفّ: saved بلا نسخة (لا تنتقل نسخة لما بعدها)',
      );
      t.throws(() => repo.keroseneAnswer({ status: 'saved', kerosene: { on: '2026-11-20', liters: 5, version: null } }), 'Q4 كازٌ بلترات بلا نسخة شكلٌ غريب');
      t.throws(() => repo.gasAnswer({ status: 'saved', gas: { on: '2026-11-20', cylinders: 2, version: null } }), 'Q4 غازٌ بقناني بلا نسخة شكلٌ غريب');
    } catch (error) {
      t.ok(false, `Q threw ${error?.stack ?? error}`);
    } finally {
      delete globalThis.__zzServer;
      if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav);
      else delete globalThis.navigator;
    }
  }

  // ── screens ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const restore = installDom();
  const savedRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  const savedClient = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Element.prototype.getBoundingClientRect = function rect() {
    if (this.localName === 'tr') {
      const rows = (this.parentNode?.children ?? []).filter((c) => c.localName === 'tr');
      return { top: 40 + rows.indexOf(this) * 40, height: 40 };
    }
    return { top: 0, height: 400 };
  };
  Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 400, configurable: true });
  Object.defineProperty(Element.prototype, 'scrollTop', { value: 0, writable: true, configurable: true });
  let root = null;
  let m = null;
  try {
    m = await screens();
    const BROILER = FIX.hall_sheet.broiler;
    const TODAY = BROILER.today;
    const H7 = BROILER.flock.hall_id;
    const F7 = BROILER.flock.id;
    const ws = (role, userId) => ({
      userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const summaryOf = (sheet) => ({
      id: sheet.flock.id, kind: sheet.flock.kind, breed: null, status: sheet.flock.status, version: 3, placed_on: sheet.flock.placed_on, placed_count: sheet.flock.placed_count,
      age_days_at_placement: sheet.flock.age0, age_days: 20, days_since_placement: 21, dead_total: 30, culled_total: 2, live: 3968, live_start_today: 3972, mortality_pct: '0.64',
      feed_kg_total: '0.000', feed_days: 0, feed_span_days: 20, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 2,
    });
    const overviewOf = (sheet) => ({
      today: TODAY,
      sites: [
        {
          id: 's-1', name: sheet.flock.site_name, division_id: 'd-1', kind: sheet.flock.kind, can_manage: true,
          halls: [{ id: sheet.flock.hall_id, name: sheet.flock.hall_name, capacity: 6000, version: 1, flock: summaryOf(sheet) }],
        },
      ],
    });
    const fresh = (role, handlers, { userId = 'u-zz', send } = {}) => {
      const calls = [];
      const sent = [];
      globalThis.__hs = {
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
    const mount = async (url, element) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__hs.location = `${location.pathname}${location.search}`;
        return element ?? m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }), m.h(m.Route, { path: '/layers/*', element: m.h(m.FarmRoutes, { kind: 'layer' }) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
      await settle(90);
    };
    const unmount = async () => {
      if (!root) return;
      m.flushSync(() => root.unmount());
      body().textContent = '';
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
    const sheetSetup = (sheet = BROILER, extra = {}) => ({ loadOverviewJson: () => overviewOf(sheet), hall_sheet: () => clone(sheet), ...extra });
    const sheetTable = () => tableBy('هلاكات قاعة (7)');
    const rowOn = (on) => bodyRows(sheetTable()).find((tr) => cells(tr)[1]?.startsWith(m.fmtDay(on).slice(0, 5))) ?? null;
    const cellIn = (on, action) => (rowOn(on) ? byAction(action, rowOn(on))[0] ?? null : null);
    const owner = (userId) => ({ userId, orgId: 'org-1', displayName: 'علي' });
    const queue = async (userId) => {
      const db = await m.openOutbox();
      return { pending: await m.pendingOps(db, owner(userId)), review: await m.reviewEntries(db, owner(userId)) };
    };
    const transportOf = () => async () => ({ currentUserId: async () => globalThis.__hs.userId, send: (op) => globalThis.__hs.send(op), lookup: async () => null });

    // ── U1: the hall sheet itself: offline, «الكاز» 300 on a day without kerosene, then «امسح الكاز» before it is sent; back online the queue wedges ──
    await step('U1', async () => {
      const rpc = keroseneRpc();
      // The real transport parses the RPC answer with keroseneAnswer (sendFlockDay); the same parser here on the contract's answer.
      fresh('hall_worker', sheetSetup(), { userId: 'u-zz1', send: (op) => (op.fn === 'set_flock_kerosene' ? m.keroseneAnswer(rpc.answer(keroArgs(op))) : { kind: 'saved', version: 99 }) });
      m.onlineStore.set(false);
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      const day = '2026-11-17';
      await tap(cellIn(day, 'cell-kerosene'));
      let dialog = dialogTitled('الكاز (لتر)');
      for (const digit of ['3', '0', '0']) await click(key(dialog, digit));
      await click(byAction('cell-done', dialog ?? body())[0], 120);
      await tap(cellIn(day, 'cell-kerosene'));
      dialog = dialogTitled('الكاز (لتر)');
      const current = textOf('cell-current', dialog ?? body());
      await click(byAction('cell-clear', dialog ?? body())[0], 120);
      const offline = (await queue('u-zz1')).pending.map((op) => [op.fn, op.day, op.payload, op.baseVersion]);
      t.same([current, offline], ['المسجّل الآن: 300 لتر', []], 'U1 الورقة تعرض 300 منتظرة، و«امسح الكاز» قبل الإرسال يحذف عمليتها (لا شيء يُرسل)');
      m.onlineStore.set(true);
      const stamp = owner('u-zz1');
      await m.uploadRounds(stamp, transportOf());
      await m.uploadRounds(stamp, transportOf());
      await settle(60);
      const after = await queue('u-zz1');
      t.same(
        [after.pending.map((op) => [op.fn, op.state, op.lastError]), after.review.length],
        [[], 0],
        `U1 back online the kerosene op leaves the queue (nothing was ever written on the server for that day); got ${JSON.stringify(after.pending.map((op) => [op.fn, op.state, op.lastError]))}`,
      );
      // And it blocks every later op of this user: a deaths correction for another day stays on the device.
      await m.saveRound(await m.openOutbox(), stamp, { fn: 'save_flock_day', flockId: F7, day: '2026-11-18', payload: { dead: 1 }, baseVersion: 1 });
      await m.uploadRounds(stamp, transportOf());
      const later = (await queue('u-zz1')).pending.map((op) => op.fn);
      t.same(later, [], `U1 a later sheet edit (deaths of 18/11) is uploaded too; still on the device: ${JSON.stringify(later)}`);
    });

    // ── R1: batch report: kerosene recorded as 0 litres -> the column is shown (with 0s) but the summary row is not ──
    await step('R1', async () => {
      const sample = clone(BROILER);
      for (const day of sample.days) {
        if (day.on === '2026-11-15') Object.assign(day, { kerosene: 0, kerosene_version: 1 });
      }
      sample.totals.kerosene = 0;
      sample.summary.kerosene = 0;
      fresh('viewer', { hall_sheet: () => clone(sample) });
      await mount(`/halls/report/${F7}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      const daysTable = tableBy('أيام الوجبة');
      const column = headers(daysTable).includes('الكاز (لتر)');
      const summaryRow = bodyRows(tableBy('خلاصة الوجبة')).map(cells).find((row) => row[0] === 'الكاز (لتر)') ?? null;
      t.same([column, summaryRow], [true, ['الكاز (لتر)', '0']], `R1 the report names the kerosene in both places or in neither (column ${column}, summary row ${JSON.stringify(summaryRow)}, foot ${JSON.stringify(cells(footRow(daysTable)))})`);
    });

    // ── S1: the round's review shelf for a kerosene entry: kerosene exists only on the hall sheet, but the card has no way there (the hint says «re-enter it in
    // the round», where there is no kerosene box); dead_recorded entries get «صفحة القاعة ← ✎ تعديل» ──
    await step('S1', async () => {
      const stamp = owner('u-zz4');
      fresh('hall_worker', sheetSetup(), { userId: 'u-zz4', send: async () => ({ kind: 'stale_kerosene', server: { on: '2026-11-17', liters: 200, version: 2 } }) });
      await m.saveRound(await m.openOutbox(), stamp, { fn: 'set_flock_kerosene', flockId: F7, day: '2026-11-17', payload: { liters: 600 }, baseVersion: 1 });
      await m.uploadRounds(stamp, transportOf());
      await mount('/broiler/round');
      await settle(60);
      const shelf = all().find((n) => n.getAttribute('data-review') !== null) ?? null;
      const links = shelf ? descendants(shelf).filter((n) => n.localName === 'a').map((n) => n.getAttribute('href')) : null;
      const hint = all().find((n) => n.localName === 'p' && n.textContent.startsWith('لم يقبلها الخادم كما هي'))?.textContent ?? null;
      t.ok(
        Boolean(shelf && links.some((href) => href === `/broiler/hall/${H7}`)),
        `S1 the kerosene card leads to the hall sheet where kerosene is entered (links ${JSON.stringify(links)}; hint: ${hint})`,
      );
    });

    // ── P1: a parked kerosene clear (payload {"kerosene": null}) on the sheet's «أُرسلت من الأجهزة ولم تُحفظ» does not say it is the kerosene ──
    await step('P1', async () => {
      const sample = clone(BROILER);
      sample.rejects = [{ id: 'zz-rk', on: '2026-11-17', reason: 'period_locked', created_at: '2026-11-26T08:00:00Z', payload: { kerosene: null }, client_ref: null, version: 1 }];
      fresh('hall_worker', sheetSetup(sample), { userId: 'u-zz3' });
      await mount(`/broiler/hall/${H7}`);
      const line = byAction('sheet-reject')[0]?.textContent ?? null;
      t.ok(Boolean(line && line.includes('الكاز')), `P1 the parked line names the kerosene (and that it was a clear), got: ${line}`);
    });
  } catch (error) {
    t.ok(false, `screens threw ${error?.stack ?? error}`);
  } finally {
    if (root && m) m.flushSync(() => root.unmount());
    restore();
    if (savedRect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', savedRect);
    else delete Element.prototype.getBoundingClientRect;
    if (savedClient) Object.defineProperty(Element.prototype, 'clientHeight', savedClient);
    else delete Element.prototype.clientHeight;
    delete Element.prototype.scrollTop;
    delete globalThis.__hs;
  }
}
