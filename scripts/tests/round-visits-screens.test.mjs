// الجولة بلا «زيارات اليوم» (0036، كلمة المالك 2026-11-24: «زيارات اليوم» و«كلّ القاعات» خرجتا من الجولة، والتصحيح من ورقة القاعة). وخرج المكوّن نفسه
// (HallVisits) من حزمة القاعات و?also= من صفحة الإضافة بلا منتِج (مراجعة 0036 R7)، ففحوصهما التي تركّبهما وحدهما خرجت معهما (L وE وE2 وX وD وO وA
// ومراجعة 0032 M2 وL3 وL4)، وبقي ما عن الجولة نفسها ومحلّلات العقد: V0 لا زرّ «زيارات اليوم» ولا قراءة round_visits من الجولة (بنت وبلا نت وبلا
// حزمة القاعات)، وG لا اختيار ولا «اصرف للمختارة» و«أضف للقاعة» لكلّ قاعة، وL7 الحفظ عملية set_flock_dead لا زيارة، وP محلّلا visit_json وround_visits
// بشكلهما، وX أجوبة القاعدة الحقيقية (fixtures/round-visits-0032.json). react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل FarmRoutes وHallsRoutes
// الحقيقيتين، وrepo الحقيقي (flocks وhalls) على core بديل يسجّل كلّ نداء ويجيب بأجوبة العقد، والطابور الحقيقي على fake-indexeddb.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const S = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'flock-issue-0019.json'), 'utf8'));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const clone = (value) => JSON.parse(JSON.stringify(value));

const STUBS = {
  session: 'export const useSession = () => globalThis.__rv.session; export const sessionStore = { get: () => globalThis.__rv?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__rv.toasts.push(spec); }; export function Toaster() { return null; }',
  // حزمة القاعات كما يحمّلها المتصفّح: الحقيقية، أو فشل تحميلها بلا نت (chunkDown).
  hallsChunk: `import * as halls from ${JSON.stringify(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'))};
    export const loadHalls = () => (globalThis.__rv?.chunkDown ? Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : Promise.resolve(halls));`,
};
// core بديل لملفّات repo: call يسجّله __rv.rpc (المحلّل الحقيقي يقرأ الجواب)، وهويّة الطابور من الجلسة (أو sessionUser: جلسة غيره فلا يُرفع شيء).
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__rv.rpc(fn, args);
export const send = async () => { throw new Error('send_unused'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ userId: globalThis.__rv?.sessionUser ?? globalThis.__rv?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as HallsRoutes } from './src/pages/halls/HallsRoutes.tsx';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { openOutbox, pendingOps, reviewEntries, saveRound } from './src/lib/outbox/index.ts';",
    "export { roundQueueStore, uploadRounds } from './src/lib/roundUploads.ts';",
    "export { parseRoundVisits } from './src/lib/repo/halls.ts';",
    "export { dayAnswer, flockDayTransport, parseVisit, visitAnswer } from './src/lib/repo/flocks.ts';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { localDay } from './src/domain/dates.ts';",
    "export { fmtInt } from './src/lib/format.ts';",
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
    loader: { '.css': 'empty' }, // الأنماط الكسولة (round.css وofficial.css وsheetGrid.css) بلا مخرَج هنا
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'rv-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/hallsChunk$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'rv-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'rv-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
          b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'rv-core' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'rv-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const click = async (node, rounds = 40) => {
  if (node) fire(node, 'click', { button: 0 });
  await settle(rounds);
};

// ── البيانات: «ما يُصرف» الحقيقية للمالك (FLOCK)، وقاعتان قائمتان معها، وفوج مغلق ─────────────────────────────────────────────────
const OPTIONS = S.flock_issue_options.owner;
const FLOCK = OPTIONS.flock_id;
const F2 = '00000000-0000-4000-8000-00000000d2f2';
const F3 = '00000000-0000-4000-8000-00000000d2f3';
const F5 = '00000000-0000-4000-8000-00000000d2f5';
const flockJson = (id, over = {}) => ({
  id, kind: 'broiler', breed: null, status: 'active', version: 1, placed_on: '2026-10-28', placed_count: 5000, age_days: 11, days_since_placement: 11, dead_total: 0,
  culled_total: 0, live: 5000, live_start_today: 5000, mortality_pct: '0.00', feed_kg_total: '0.000', feed_days: 0, feed_span_days: 11, last_weight: null, fcr: null,
  today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
});
const hall = (id, name, flock) => ({ id, name, capacity: 6000, version: 1, flock });
const overview = (today) => ({
  today,
  sites: [
    {
      id: 's-1', name: 'حقل الأمل', division_id: 'd-b', kind: 'broiler', can_manage: true,
      halls: [hall('h-1', 'قاعة 1', flockJson(FLOCK)), hall('h-2', 'قاعة 2', flockJson(F2)), hall('h-3', 'قاعة 3', flockJson(F3)), hall('h-5', 'قاعة 5', flockJson(F5, { status: 'closed' }))],
    },
  ],
});
const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer', 'feed_mill', 'general'],
  canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const OWNER = { status: 'ready', workspace: ws('owner'), offline: false };

/** visit_json بعقد 0032. */
const visitJson = (id, today, over = {}) => ({
  id, flock_id: FLOCK, on: today, recorded_at: `${today}T06:40:00+00:00`, dead: 0, culled: 0, feed_kg: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null,
  source: 'visit', version: 1, voided: false, by: 'حسن', ...over,
});
/** round_visits لفوج ويوم: الحيّة بترتيب وقتها. */
const roundVisits = (today, visits) => ({ on: today, today, flocks: visits.length ? [{ flock_id: FLOCK, hall_id: 'h-1', visits }] : [] });

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    const TODAY = m.localDay();
    const V1 = visitJson('v-1', TODAY, { recorded_at: `${TODAY}T03:05:00+00:00`, dead: 4, culled: 1, feed_kg: '120.000', source: 'legacy', by: null });
    const V2 = visitJson('v-2', TODAY, { recorded_at: `${TODAY}T05:10:00+00:00`, dead: 2, feed_kg: '50.000', eggs_cracked: null, note: 'صباحاً', version: 2 });

    const fresh = (session, rpcs = {}) => {
      const rpcLog = [];
      globalThis.__rv = {
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
    const named = (log, fn) => log.filter(([name]) => name === fn).map(([, args]) => args);
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__rv.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, null, m.h(m.Route, { path: '/halls/*', element: m.h(m.HallsRoutes) }), m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }), m.h(m.Route, { path: '/layers/*', element: m.h(m.FarmRoutes, { kind: 'layer' }) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
      await settle(60);
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
    const roundRpcs = (over = {}) => ({ flocks_overview: () => overview(TODAY), vaccine_reminders: () => ({ today: TODAY, items: [] }), ...over });
    const cardOf = (flockId) => all().find((n) => n.getAttribute('data-flock') === flockId) ?? null;
    // ── V0 (0036): لا «زيارات اليوم» في الجولة، ولا قراءة round_visits منها: بنت، وبلا نت، وبلا حزمة القاعات (والجولة تعمل) ──────────────────
    await step('V0 بنت', async () => {
      const rpcLog = fresh(OWNER, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1]) }));
      await mount('/broiler/round');
      await settle(60);
      t.same([byAction('round-visits').length, byAction('hall-visits').length, text().includes('زيارات اليوم'), named(rpcLog, 'round_visits').length, byAction('round-save').length], [0, 0, false, 0, 1], 'V0 بنت: لا زرّ «زيارات اليوم» ولا قائمة ولا قراءة، والحفظ قائم');
    });
    await step('V0 بلا نت', async () => {
      const rpcLog = fresh(OWNER, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1]) }));
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      t.same([byAction('round-visits').length, byAction('visits-offline').length, named(rpcLog, 'round_visits').length, byAction('round-save').length], [0, 0, 0, 1], 'V0 بلا نت: لا «زيارات اليوم تحتاج اتصالاً»، والجولة تعمل');
    });
    await step('V0 بلا حزمة', async () => {
      const rpcLog = fresh(OWNER, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1]) }));
      globalThis.__rv.chunkDown = true;
      await mount('/broiler/round');
      await settle(60);
      t.same([byAction('round-visits').length, named(rpcLog, 'round_visits').length, byAction('round-save').length, byAction('round-feed-offline').length], [0, 0, 1, 3], 'V0 حزمة القاعات لا تُحمَّل: الجولة تعمل، وإرسال العلف في كلّ قاعة يقول إنّه يحتاج اتصالاً');
    });
    // ── G (0036): لا اختيار ولا «اصرف من المخزن للقاعات المختارة»؛ «أضف للقاعة» لكلّ قاعة إلى صفحة الإضافة والرجوع إلى الجولة ─────────────────────
    await step('G', async () => {
      fresh(OWNER, roundRpcs({ flock_issue_options: () => clone(OPTIONS) }));
      await mount('/broiler/round');
      t.same([byAction('round-pick').length, byAction('round-pick-all').length, byAction('round-give-picked').length, byAction('round-picked').length], [0, 0, 0, 0], 'G لا مربّعات اختيار ولا «كلّ القاعات» ولا «اصرف للمختارة»');
      const give = byAction('round-give', cardOf(F3) ?? body())[0] ?? null;
      t.eq(give?.getAttribute('href'), `/halls/give/${F3}?back=%2Fbroiler%2Fround`, 'G «أضف للقاعة» على بطاقة القاعة بالرجوع إلى الجولة');
      await click(give, 80);
      const [where, query] = (globalThis.__rv.location ?? '').split('?');
      t.same([where, new URLSearchParams(query ?? '').get('back'), new URLSearchParams(query ?? '').get('also')], [`/halls/give/${F3}`, '/broiler/round', null], 'G إلى صفحة الإضافة لتلك القاعة وحدها');
    });
    await step('G المشاهد', async () => {
      fresh({ status: 'ready', workspace: ws('viewer', { userId: 'u-viewer' }), offline: false }, roundRpcs());
      await mount('/broiler/round');
      t.ok(byAction('round-give').length === 3 && byAction('round-save').length > 0 && byAction('round-pick').length === 0, 'G المشاهد: «أضف للقاعة» والحفظ كالمالك (0034)، بلا اختيار');
    });

    const dayJson = (over = {}) => ({ on_date: TODAY, version: 2, dead: 4, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, ...over });

    // ── L7 (0036): حفظ الجولة لا يقرأ «زيارات اليوم» ولا يُظهر لها عدداً؛ هلاكات القاعة عمليتها مرّة (set_flock_dead) لا زيارة ──────────────────
    await step('L7', async () => {
      const rpcLog = fresh({ status: 'ready', workspace: ws('owner', { userId: 'u-l7' }), offline: false }, roundRpcs({
        round_visits: () => roundVisits(TODAY, [V1]),
        set_flock_dead: (args) => ({ status: 'saved', day: dayJson({ dead: args.p_dead, version: 1, dead_entered: true }) }),
      }));
      await mount('/broiler/round');
      const deadOf = (flockId) => descendants(cardOf(flockId) ?? body()).find((n) => n.localName === 'input' && n.id.endsWith('-dead')) ?? null;
      type(deadOf(FLOCK), '2');
      await settle();
      await click(byAction('round-save')[0] ?? null, 150);
      t.same(
        [named(rpcLog, 'set_flock_dead').map((args) => [args.p_flock, args.p_dead, args.p_queued]), named(rpcLog, 'save_flock_visit').length, named(rpcLog, 'round_visits').length, byAction('round-visits').length],
        [[[FLOCK, 2, true]], 0, 0, 0],
        'L7 الحفظ عملية set_flock_dead بالطابور، بلا زيارة ولا قراءة «زيارات اليوم» ولا زرّها',
      );
    });

    // ── محلّلات العقد: visit_json وround_visits بشكلها، والغريب يرمي باسم خانته ─────────────────────────────────────────────────
    {
      const parsed = m.parseRoundVisits(roundVisits(TODAY, [V1, V2]));
      t.same(
        [parsed.on, parsed.flocks[0]?.hallId, parsed.flocks[0]?.visits.map((visit) => [visit.id, visit.source, visit.dead, String(visit.feedKg), visit.by, visit.version])],
        [TODAY, 'h-1', [['v-1', 'legacy', 4, '120000', null, 1], ['v-2', 'visit', 2, '50000', 'حسن', 2]]],
        'P round_visits ← الأفواج بزياراتها (العلف بالآلاف)',
      );
      const fieldOf = (fn) => {
        try {
          fn();
          return null;
        } catch (error) {
          return error.field ?? error.message;
        }
      };
      t.same(
        [
          fieldOf(() => m.parseVisit({ ...V1, voided: 'no' })),
          fieldOf(() => m.parseVisit({ ...V1, recorded_at: 'yesterday' })),
          fieldOf(() => m.parseVisit({ ...V1, on: '17/11/2026' })),
          fieldOf(() => m.parseRoundVisits({ on: TODAY, today: TODAY, flocks: [{ flock_id: FLOCK, hall_id: 'h-1' }] })),
        ],
        ['voided', 'recorded_at', 'on', 'visits'],
        'P شكل غريب يرمي باسم خانته',
      );
    }

    // ── X: أجوبة القاعدة الحقيقية (fixtures/round-visits-0032.json من supabase/tests/round-visits.test.mjs) بالمحلّلات الحقيقية ──────────────
    {
      const R = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-visits-0032.json'), 'utf8'));
      const tryParse = (label, fn) => {
        try {
          return fn();
        } catch (error) {
          t.ok(false, `X ${label}: رمى ${error?.field ?? ''} ${error?.message ?? error}`);
          return null;
        }
      };
      const lists = ['round_visits_broiler', 'round_visits_layer', 'round_visits_flock'].map((key) => [key, tryParse(key, () => m.parseRoundVisits(R[key]))]);
      t.same(
        lists.map(([key, parsed]) => [key, parsed === null ? null : parsed.flocks.reduce((n, flock) => n + flock.visits.length, 0) === R[key].flocks.reduce((n, flock) => n + flock.visits.length, 0)]),
        lists.map(([key]) => [key, true]),
        'X round_visits الحقيقية (لحم وبيّاض وفوج ليوم سابق فيه زيارة «مجموع اليوم») تُقرأ كلّها بزياراتها',
      );
      const sources = new Set(lists.flatMap(([, parsed]) => parsed?.flocks.flatMap((flock) => flock.visits.map((visit) => visit.source)) ?? []));
      t.ok(['visit', 'day_total'].every((source) => sources.has(source)), `X في العيّنات زيارة جديدة وزيارة «مجموع اليوم» (${[...sources].join('، ')})`);
      const answers = {
        saved: tryParse('saved', () => m.visitAnswer(R.save_flock_visit_saved)),
        parked: tryParse('parked', () => m.visitAnswer(R.save_flock_visit_parked)),
        stale: tryParse('stale', () => m.visitAnswer(R.save_flock_visit_stale)),
        void: tryParse('void', () => m.visitAnswer(R.save_flock_visit_void)),
        day: tryParse('day', () => m.dayAnswer(R.save_flock_day_after)),
      };
      t.same(
        [answers.saved?.kind, answers.parked?.kind, answers.stale?.kind, answers.void?.kind, answers.day?.kind, answers.day?.version],
        ['saved', 'parked', 'stale_visit', 'saved', 'saved', 3],
        'X أجوبة save_flock_visit الحقيقية (حُفظت، ورُكنت، وتغيّرت، وأُلغيت) وجواب save_flock_day بعد الهجرة بالمحلّل الحقيقيّ',
      );
    }
  } finally {
    delete globalThis.__rv;
    restore();
  }
}
