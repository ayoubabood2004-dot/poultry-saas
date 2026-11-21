// الجولة بزيارات في اليوم (0032، كلمة المالك 2026-11-17؛ عقد docs/plans/0032/contract-0032.md «ب. الشاشات»): react-dom/client الحقيقي على DOM صغير
// (dom.mjs) يشغّل FarmRoutes وHallsRoutes الحقيقيتين، وrepo الحقيقي (flocks وhalls: المحلّلات وبناء النداءات) على core بديل يسجّل كلّ نداء ويجيب
// بأجوبة العقد مكتوبة باليد (visit_json وround_visits وsave_flock_visit)، والطابور الحقيقي على fake-indexeddb. الدمج يمرّر عيّنات القاعدة الحقيقية
// (fixtures/round-visits-0032.json) بالمحلّلات نفسها. الحالات:
// L «زيارات اليوم» من الجولة: round_visits لفوج ويوم، كلّ زيارة بوقتها وأرقامها وكاتبها ومصدرها («قديمة» و«مجموع اليوم»)، وصفّ «مجموع اليوم»، والعدد
//   على الزرّ؛ E «عدّل»: نافذة بالمحتوى كاملاً بلقطة الزيارة ونسختها لحظة الفتح (قراءة أحدث بعدها لا تغيّرها)، فعملية بنسختها ومحتواها كاملاً، وstale_visit
//   تنبيه ورفّ «زيارتك والمحفوظة»؛ X «ألغِ»: تأكيد يسمّي ما يُطرح من مجموع اليوم، فعملية p_void بنسختها؛ D زيارات هذا الجهاز المنتظرة «على هذا الجهاز»،
//   وتعديل إحداها يحلّ محلّ عمليتها وإلغاؤها يحذفها، وما في الطريق بلا أفعال؛ O بلا نت أو بلا حزمة القاعات «تحتاج اتصالاً» بلا نداء، وفشل القراءة
//   «أعد المحاولة»؛ G «اصرف من المخزن للقاعات المختارة» إلى صفحة الإضافة بأوّل قاعة مختارة و?also= بالباقية، وبلا نت «يحتاج اتصالاً»؛ A ‎?also= يختار
//   القاعات مسبقاً في «كرّر في القاعات الأخرى» ويقول عدد المُهمَل، والاختيار المسبق ليس «ما لم يُحفظ».
// ومراجعة 0032 (كلّ حالة تفشل على الشفرة قبل إصلاحها): M2 «ألغِ»/«عدّل» لزيارة «على هذا الجهاز» رُفعت إضافتها والنافذة مفتوحة ← عملية بنسخة 1 تُرسل
//   (لا «أُلغيت قبل أن تُرسل» ولا إضافة ثانية)؛ L3 stale_visit بجملة الخادم (تغيّرت، أو أُلغيت: voided، أو لم تصل: null) في التنبيه والرفّ، بعيّنة
//   save_flock_visit_stale الحقيقية؛ L4 المشعور الباقي في فحص «عدّل»؛ L7 عدد «زيارات اليوم» بعد الحفظ؛ وتأكيد «ألغِ» يقول ما يذهب مع الزيارة.
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
const withAttr = (action, attr, value) => byAction(action).find((n) => n.getAttribute(attr) === value) ?? null;
const textOf = (action, root = body()) => byAction(action, root)[0]?.textContent ?? null;
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
const tick = async (box) => {
  if (!box) return;
  box.checked = !box.checked;
  fire(box, 'click');
  await settle();
};
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
const tableRows = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableFoot = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
  const tfoot = table ? descendants(table).find((n) => n.localName === 'tfoot') : null;
  return tfoot ? descendants(tfoot).filter((n) => n.localName === 'td' || n.localName === 'th').map((n) => n.textContent) : null;
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
  canSeeCost: role === 'owner', canSeeAccounts: role === 'owner', canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const OWNER = { status: 'ready', workspace: ws('owner'), offline: false };
const stampOf = (userId) => ({ userId, orgId: 'org-1', displayName: 'علي' });

/** visit_json بعقد 0032. */
const visitJson = (id, today, over = {}) => ({
  id, flock_id: FLOCK, on: today, recorded_at: `${today}T06:40:00+00:00`, dead: 0, culled: 0, feed_kg: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null,
  source: 'visit', version: 1, voided: false, by: 'حسن', ...over,
});
/** round_visits لفوج ويوم: الحيّة بترتيب وقتها. */
const roundVisits = (today, visits) => ({ on: today, today, flocks: visits.length ? [{ flock_id: FLOCK, hall_id: 'h-1', visits }] : [] });
const pad = (n) => `${n < 10 ? '0' : ''}${n}`;
const clockOf = (iso) => {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    const TODAY = m.localDay();
    const V1 = visitJson('v-1', TODAY, { recorded_at: `${TODAY}T03:05:00+00:00`, dead: 4, culled: 1, feed_kg: '120.000', source: 'legacy', by: null });
    const V2 = visitJson('v-2', TODAY, { recorded_at: `${TODAY}T05:10:00+00:00`, dead: 2, feed_kg: '50.000', eggs_cracked: null, note: 'صباحاً', version: 2 });
    const V3 = visitJson('v-3', TODAY, { recorded_at: `${TODAY}T07:20:00+00:00`, dead: 3, feed_kg: '50.000', source: 'day_total', by: 'علي' });

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
    const openVisits = async (flockId = FLOCK) => click(byAction('round-visits', cardOf(flockId) ?? body())[0] ?? null, 80);
    const visitRow = (time) => (tableRows('زيارات اليوم') ?? []).find((row) => row[0] === time) ?? null;
    const actionIn = (time, action) => {
      const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === 'زيارات اليوم'));
      const tr = table ? descendants(table).find((n) => n.localName === 'tr' && n.children[0]?.textContent === time) : null;
      return tr ? (byAction(action, tr)[0] ?? null) : null;
    };
    const queue = async (userId) => {
      const db = await m.openOutbox();
      return { pending: await m.pendingOps(db, stampOf(userId)), review: await m.reviewEntries(db, stampOf(userId)) };
    };

    // ── L: القائمة من round_visits ───────────────────────────────────────────────────────────────────────────────────────────
    await step('L', async () => {
      const rpcLog = fresh(OWNER, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1, V2, V3]) }));
      await mount('/broiler/round');
      t.same([textOf('round-visits', cardOf(FLOCK) ?? body()), named(rpcLog, 'round_visits').length], ['زيارات اليوم', 0], 'L ضابط: «زيارات اليوم» مطويّة ولا قراءة قبل فتحها');
      await openVisits();
      t.same(named(rpcLog, 'round_visits'), [{ p_on: TODAY, p_kind: 'broiler', p_flock: FLOCK }], 'L round_visits ليوم الجولة ونوعها والفوج وحده');
      t.same(
        tableRows('زيارات اليوم')?.map((row) => row.slice(0, 4)),
        [
          [clockOf(V1.recorded_at), '5', '120', '— · قديمة'],
          [clockOf(V2.recorded_at), '2', '50', 'حسن'],
          [clockOf(V3.recorded_at), '3', '50', 'علي · مجموع اليوم'],
        ],
        'L كلّ زيارة بوقتها بساعة الجهاز وهلاكاتها (النافق والمستبعد القديم معاً، 0035) وعلفها بمراتب العمود وكاتبها ومصدرها',
      );
      t.same(tableFoot('زيارات اليوم')?.slice(0, 3), ['مجموع اليوم', '10', '220'], 'L صفّ «مجموع اليوم» بمجموع الزيارات (الهلاكات 4 + 1 مستبعد قديم + 2 + 3)');
      t.eq(textOf('round-visits', cardOf(FLOCK) ?? body()), 'زيارات اليوم (3)', 'L الزرّ بعدد زيارات اليوم بعد القراءة');
    });

    // ── E: «عدّل» بلقطة الزيارة ونسختها لحظة الفتح ───────────────────────────────────────────────────────────────────────────
    await step('E', async () => {
      let version = 2;
      const rpcLog = fresh(OWNER, roundRpcs({
        round_visits: () => roundVisits(TODAY, [V1, { ...V2, version, dead: version === 2 ? 2 : 9 }, V3]),
        save_flock_visit: () => ({ status: 'stale_visit', server: { ...V2, version: 3, dead: 9 } }),
      }));
      await mount('/broiler/round');
      await openVisits();
      await click(actionIn(clockOf(V2.recorded_at), 'visit-edit'));
      const dialog = () => dialogTitled('عدّل زيارة');
      const field = (name) => (dialog() ? byAction(`visit-${name}`, dialog())[0] ?? null : null);
      t.same([field('dead')?.value, field('culled'), field('feedKg')], ['2', null, null], 'E النافذة بنافق الزيارة وحده (0035: لا مستبعد ولا علف في الإدخال؛ يُرسلان كما في اللقطة)');
      t.ok(dialog()?.textContent.includes('والماء والحرارة والملاحظة تبقى كما هي'), 'E التلميح يقول ما يبقى كما هو');
      // زيارة تغيّرت من جهاز آخر بعد الفتح، والقائمة تُقرأ من جديد: اللقطة والنسخة كما فُتحت.
      version = 3;
      m.roundQueueStore.set((state) => ({ ...state, seq: state.seq + 1 }));
      await settle(60);
      t.same([Boolean(dialog()), field('dead')?.value], [true, '2'], 'E قراءة أحدث بعد الفتح لا تغيّر النافذة');
      type(field('dead'), '5');
      await settle();
      await click(byAction('visit-edit-save', dialog() ?? body())[0] ?? null, 120);
      const [args] = named(rpcLog, 'save_flock_visit');
      t.same(
        args && { ...args, p_client_ref: typeof args.p_client_ref },
        { p_visit: 'v-2', p_flock: FLOCK, p_date: TODAY, p_recorded_at: V2.recorded_at, p_dead: 5, p_culled: 0, p_feed_kg: '50.000', p_eggs_total: null, p_eggs_cracked: null, p_eggs_broken: null, p_note: 'صباحاً', p_base_version: 2, p_void: false, p_client_ref: 'string', p_queued: true },
        'E عملية بنسخة اللقطة (2 لا 3) والمحتوى كاملاً (العلف كما هو، والملاحظة محفوظة، ووقت الزيارة الأصليّ)',
      );
      const last = globalThis.__rv.toasts.at(-1);
      t.same([last?.tone, last?.title], ['danger', 'تغيّرت هذه الزيارة من جهاز آخر قبل أن يصل طلبك، فلم يُكتب فوقها.'], 'E stale_visit: تنبيه لا يكتب فوقها');
      const { review } = await queue('u-owner');
      t.same([review.length, review[0]?.reason, review[0]?.op.payload.dead, review[0]?.server?.dead], [1, 'stale_visit', 5, 9], 'E ورفّ المراجعة بالنسختين');
      t.ok(text().includes('تعديل زيارة') && text().includes('زيارتك') && text().includes('المحفوظة'), 'E الرفّ في الجولة: «تعديل زيارة» و«زيارتك» و«المحفوظة»');
    });

    // ── E2: فحص الحيّ في «عدّل» على مجموع اليوم بلا الزيارة المعدَّلة (الحيّ بداية اليوم 5,000؛ غيرها 8)، ولو قُرئت القائمة من جديد بعد الفتح ──
    await step('E2', async () => {
      const rpcLog = fresh({ status: 'ready', workspace: ws('owner', { userId: 'u-e2' }), offline: false }, roundRpcs({
        round_visits: () => roundVisits(TODAY, [V1, V2, V3]),
        save_flock_visit: () => ({ status: 'saved', visit: { ...V2, dead: 4991, version: 3 }, day: null }),
      }));
      await mount('/broiler/round');
      await openVisits();
      await click(actionIn(clockOf(V2.recorded_at), 'visit-edit'));
      m.roundQueueStore.set((state) => ({ ...state, seq: state.seq + 1 }));
      await settle(60);
      const dialog = () => dialogTitled('عدّل زيارة');
      type(byAction('visit-dead', dialog() ?? body())[0] ?? null, '4993');
      await settle();
      await click(byAction('visit-edit-save', dialog() ?? body())[0] ?? null, 60);
      t.same(
        [named(rpcLog, 'save_flock_visit').length, Boolean(dialog()) && descendants(dialog()).some((n) => n.getAttribute('role') === 'alert' && n.textContent.includes('(5,000)'))],
        [0, true],
        'E2 8 + 4,993 > 5,000: يُمنع قبل الإرسال',
      );
      type(byAction('visit-dead', dialog() ?? body())[0] ?? null, '4991');
      await settle();
      await click(byAction('visit-edit-save', dialog() ?? body())[0] ?? null, 120);
      t.same(named(rpcLog, 'save_flock_visit').map((args) => [args.p_visit, args.p_dead, args.p_base_version]), [['v-2', 4991, 2]], 'E2 8 + 4,991 يُقبل: الزيارة المعدَّلة لا تُعدّ مرّتين بعد قراءة جديدة');
    });

    // ── X: «ألغِ» بتأكيد يسمّي ما يُطرح ─────────────────────────────────────────────────────────────────────────────────────
    await step('X', async () => {
      let voided = false;
      const rpcLog = fresh({ status: 'ready', workspace: ws('owner', { userId: 'u-x' }), offline: false }, roundRpcs({
        round_visits: () => roundVisits(TODAY, voided ? [V1, V2] : [V1, V2, V3]),
        save_flock_visit: () => {
          voided = true;
          return { status: 'saved', visit: { ...V3, voided: true, version: 2 }, day: { on_date: TODAY, version: 9, dead: 6, culled: 1, feed_kg: '170.000', water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null } };
        },
      }));
      await mount('/broiler/round');
      await openVisits();
      await click(actionIn(clockOf(V3.recorded_at), 'visit-void'));
      const confirm = dialogTitled('ألغِ زيارة');
      t.eq(
        confirm ? descendants(confirm).find((n) => n.localName === 'div' && n.getAttribute('class') === 'text-ink-muted')?.textContent : null,
        `تُلغى زيارة ${clockOf(V3.recorded_at)}، ويُطرح من مجموع اليوم: النافق 3، والعلف 50 كغم. ويُلغى معها ما سُجّل فيها من ماء وحرارة وملاحظة، إن وُجد.`,
        'X التأكيد يسمّي الزيارة بوقتها وما يُطرح من مجموع اليوم، وما يذهب مع زيارة «مجموع اليوم» (الماء والحرارة والملاحظة لا تُعرض في القائمة)',
      );
      t.eq(named(rpcLog, 'save_flock_visit').length, 0, 'X ضابط: لا إرسال قبل التأكيد');
      await click(byAction('visit-void-confirm')[0] ?? null, 120);
      const [args] = named(rpcLog, 'save_flock_visit');
      t.same([args?.p_visit, args?.p_void, args?.p_base_version, args?.p_dead, args?.p_feed_kg], ['v-3', true, 1, 3, '50.000'], 'X عملية الإلغاء بنسختها ومحتواها');
      t.same([globalThis.__rv.toasts.at(-1)?.title, (tableRows('زيارات اليوم') ?? []).length, textOf('round-visits', cardOf(FLOCK) ?? body())], ['أُلغيت الزيارة وطُرح ما فيها من مجموع اليوم.', 2, 'زيارات اليوم (2)'], 'X التنبيه، والقائمة تُقرأ من جديد بلا الملغاة');
      await click(actionIn(clockOf(V2.recorded_at), 'visit-void'));
      const note = dialogTitled('ألغِ زيارة');
      t.eq(note ? descendants(note).find((n) => n.localName === 'div' && n.getAttribute('class') === 'text-ink-muted')?.textContent : null, `تُلغى زيارة ${clockOf(V2.recorded_at)}، ويُطرح من مجموع اليوم: النافق 2، والعلف 50 كغم. وتُلغى معها ملاحظتها.`, 'X وزيارة بملاحظة: «وتُلغى معها ملاحظتها»');
    });

    // ── D: زيارات هذا الجهاز المنتظرة ───────────────────────────────────────────────────────────────────────────────────────
    await step('D', async () => {
      const user = 'u-d';
      const db = await m.openOutbox();
      const content = (visitId, over = {}) => ({ visitId, recordedAt: `${TODAY}T08:30:00.000Z`, dead: 4, culled: 0, feed_kg: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, void: false, ...over });
      await m.saveRound(db, stampOf(user), { fn: 'save_flock_visit', flockId: FLOCK, day: TODAY, payload: content('v-dev'), baseVersion: null });
      await m.saveRound(db, stampOf(user), { fn: 'save_flock_visit', flockId: FLOCK, day: TODAY, payload: { ...content('v-2', { recordedAt: V2.recorded_at, dead: 6, feed_kg: '50.000', note: 'صباحاً' }) }, baseVersion: 2 });
      const rpcLog = fresh({ status: 'ready', workspace: ws('owner', { userId: user }), offline: false }, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1, V2, V3]) }));
      // جلسة غيره: الرفع لا يرسل شيئاً، فتبقى العمليات منتظرة.
      globalThis.__rv.sessionUser = 'someone-else';
      await mount('/broiler/round');
      await openVisits();
      const dev = clockOf(`${TODAY}T08:30:00.000Z`);
      t.same(
        [visitRow(clockOf(V2.recorded_at))?.slice(1, 4), visitRow(dev)?.slice(1, 4)],
        [['6', '50', 'حسن · على هذا الجهاز'], ['4', '—', 'علي · على هذا الجهاز']],
        'D تعديل الجهاز فوق زيارة الخادم، والزيارة الجديدة بكاتبها، كلتاهما «على هذا الجهاز»',
      );
      t.same(tableFoot('زيارات اليوم')?.slice(0, 2), ['مجموع اليوم', '18'], 'D المجموع بما على الجهاز (4 + 1 مستبعد قديم + 6 + 3 + 4)');
      await click(actionIn(dev, 'visit-edit'));
      type(byAction('visit-dead', dialogTitled('عدّل زيارة') ?? body())[0] ?? null, '5');
      await settle();
      await click(byAction('visit-edit-save', dialogTitled('عدّل زيارة') ?? body())[0] ?? null, 120);
      let ops = (await queue(user)).pending.filter((op) => op.payload.visitId === 'v-dev');
      t.same([ops.length, ops[0]?.payload.dead, ops[0]?.baseVersion, named(rpcLog, 'save_flock_visit').length], [1, 5, null, 0], 'D تعديل زيارة لم تُرفع يحلّ محلّ عمليتها (لا عملية ثانية)');
      await click(actionIn(dev, 'visit-void'));
      await click(byAction('visit-void-confirm')[0] ?? null, 120);
      ops = (await queue(user)).pending.filter((op) => op.payload.visitId === 'v-dev');
      t.same([ops.length, globalThis.__rv.toasts.at(-1)?.title, visitRow(dev)], [0, 'أُلغيت الزيارة من هذا الجهاز قبل أن تُرسل.', null], 'D إلغاء زيارة لم تُرفع يحذف عمليتها');
      // عملية في الطريق (ممسوكة): بلا أفعال.
      const [held] = (await queue(user)).pending;
      const raw = await new Promise((resolve) => {
        const tx = db.transaction('ops', 'readwrite');
        tx.objectStore('ops').put({ ...held, state: 'sending', claimToken: 'tab-b', claimedAt: Date.now() });
        tx.oncomplete = resolve;
      });
      void raw;
      m.roundQueueStore.set((state) => ({ ...state, seq: state.seq + 1 }));
      await settle(60);
      t.same([actionIn(clockOf(V2.recorded_at), 'visit-edit'), actionIn(clockOf(V1.recorded_at), 'visit-edit') !== null], [null, true], 'D زيارة عمليتها في الطريق بلا «عدّل» ولا «ألغِ» (وغيرها بأفعالها)');
    });

    // ── O: بلا نت، وبلا حزمة القاعات، وفشل القراءة ─────────────────────────────────────────────────────────────────────────────
    await step('O بلا نت', async () => {
      const rpcLog = fresh(OWNER, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1]) }));
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      await openVisits();
      t.same([textOf('visits-offline'), named(rpcLog, 'round_visits').length], ['زيارات اليوم تحتاج اتصالاً بالإنترنت.', 0], 'O بلا نت: «تحتاج اتصالاً» بلا نداء');
    });
    await step('O بلا حزمة', async () => {
      const rpcLog = fresh(OWNER, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1]) }));
      globalThis.__rv.chunkDown = true;
      await mount('/broiler/round');
      await openVisits();
      t.same([textOf('visits-offline'), named(rpcLog, 'round_visits').length, byAction('round-save').length], ['زيارات اليوم تحتاج اتصالاً بالإنترنت.', 0, 1], 'O حزمة القاعات لا تُحمَّل: «تحتاج اتصالاً»، والجولة تعمل');
    });
    await step('O فشل القراءة', async () => {
      let fail = true;
      const rpcLog = fresh(OWNER, roundRpcs({
        round_visits: () => {
          if (fail) throw new m.RejectedError('bad_kind', 'نوع غير معروف.');
          return roundVisits(TODAY, [V1]);
        },
      }));
      await mount('/broiler/round');
      await openVisits();
      const retry = all().find((n) => n.localName === 'button' && n.textContent === 'أعد المحاولة');
      t.ok(Boolean(retry) && !tableRows('زيارات اليوم'), 'O فشل القراءة: «أعد المحاولة» بلا قائمة');
      fail = false;
      await click(retry ?? null, 60);
      t.same([named(rpcLog, 'round_visits').length, (tableRows('زيارات اليوم') ?? []).length], [2, 1], 'O وإعادتها تقرأ وتعرض');
    });

    // ── G: «اصرف من المخزن للقاعات المختارة» ─────────────────────────────────────────────────────────────────────────────────
    await step('G', async () => {
      fresh(OWNER, roundRpcs({ flock_issue_options: () => clone(OPTIONS) }));
      await mount('/broiler/round');
      await tick(withAttr('round-pick', 'aria-label', 'اختر قاعة 2'));
      t.eq(textOf('round-picked'), 'المختارة: 2 من 3', 'G ضابط: قاعة 2 مستثناة');
      await click(byAction('round-give-picked')[0] ?? null, 80);
      const [where, query] = (globalThis.__rv.location ?? '').split('?');
      const params = new URLSearchParams(query ?? '');
      t.same([where, params.get('also'), params.get('back')], [`/halls/give/${FLOCK}`, F3, '/broiler/round'], 'G إلى صفحة الإضافة بأوّل قاعة مختارة، والباقية مختارة معها (?also=)، والرجوع إلى الجولة');
      t.same(byAction('give-hall').filter((n) => n.checked).map((n) => n.getAttribute('data-flock')), [F3], 'G صفحة الإضافة: القاعة الأخرى المختارة في الجولة مختارة مسبقاً');
    });
    await step('G بلا نت', async () => {
      fresh(OWNER, roundRpcs());
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      t.same([byAction('round-give-picked')[0]?.hasAttribute('disabled'), textOf('round-give-offline')], [true, 'يحتاج اتصالاً.'], 'G بلا نت: معطّل و«يحتاج اتصالاً»');
    });
    await step('G المشاهد', async () => {
      fresh({ status: 'ready', workspace: ws('viewer', { userId: 'u-viewer' }), offline: false }, roundRpcs());
      await mount('/broiler/round');
      t.same([byAction('round-give-picked').length, byAction('round-pick').length, byAction('round-save').length], [0, 0, 0], 'G المشاهد: لا اختيار ولا صرف ولا حفظ');
    });

    // ── A: ?also= في صفحة الإضافة ────────────────────────────────────────────────────────────────────────────────────────────
    await step('A', async () => {
      fresh(OWNER, { flock_issue_options: () => clone(OPTIONS), flocks_overview: () => overview(TODAY) });
      const also = [F2, 'ffffffff-0000-4000-8000-000000000000', F5, FLOCK, F3].join(',');
      await mount(`/halls/give/${FLOCK}?${new URLSearchParams({ also, back: '/broiler/round' }).toString()}`);
      t.same(byAction('give-hall').filter((n) => n.checked).map((n) => n.getAttribute('data-flock')), [F2, F3], 'A القاعات القائمة في النطاق من ?also= مختارة مسبقاً (والحالية لا تُكرَّر)');
      t.eq(textOf('give-also-ignored'), 'قاعات اختيرت في الجولة ولم تُضف هنا (ليس فيها فوج قائم الآن أو خارج نطاقك): 2.', 'A المجهول والمغلق يُهملان ويُقال عددهما');
      t.eq(m.isWindowDirty(), false, 'A الاختيار المسبق ليس «ما لم يُحفظ»');
      await tick(withAttr('give-hall', 'data-flock', F2));
      t.eq(m.isWindowDirty(), true, 'A وتغييره كتابة لم تُحفظ');
    });
    await step('A بلا ?also=', async () => {
      fresh(OWNER, { flock_issue_options: () => clone(OPTIONS), flocks_overview: () => overview(TODAY) });
      await mount(`/halls/give/${FLOCK}`);
      t.same([byAction('give-hall').filter((n) => n.checked).length, byAction('give-also-ignored').length], [0, 0], 'A ضابط: بلا ?also= لا اختيار مسبق ولا جملة');
    });

// ─── مراجعة 0032 (كلّ حالة تفشل على الشفرة قبل إصلاحها) ─────────────────────────────────────────────────────────────────────
    const R0032 = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-visits-0032.json'), 'utf8'));
    const dayJson = (over = {}) => ({ on_date: TODAY, version: 2, dead: 4, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, ...over });
    const inDialog = (start, action) => byAction(action, dialogTitled(start) ?? body())[0] ?? null;

    // ── M2: «ألغِ» و«عدّل» لزيارة «على هذا الجهاز» رُفعت إضافتها والنافذة مفتوحة: عملية بنسخة 1 تُرسل، لا «أُلغيت قبل أن تُرسل» ولا إضافة ثانية ──
    const deviceVisit = async (user, visitId) => {
      const payload = { visitId, recordedAt: TODAY + 'T08:30:00.000Z', dead: 4, culled: 0, feed_kg: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, void: false };
      await m.saveRound(await m.openOutbox(), stampOf(user), { fn: 'save_flock_visit', flockId: FLOCK, day: TODAY, payload, baseVersion: null });
      const onServer = visitJson(visitId, TODAY, { recorded_at: payload.recordedAt, dead: 4, by: 'علي' });
      const state = { uploaded: false };
      const rpcs = roundRpcs({
        round_visits: () => roundVisits(TODAY, state.uploaded ? [V1, onServer] : [V1]),
        // save_flock_visit بعقد 0032: الإضافة الأولى تُحفظ بنسخة 1، وإضافة ثانية لمعرّف موجود بمحتوى آخر stale_visit، والتعديل والإلغاء بنسخة 1 يُحفظان.
        save_flock_visit: (args) => {
          if (args.p_base_version === null) {
            if (state.uploaded) return { status: 'stale_visit', server: onServer };
            state.uploaded = true;
            return { status: 'saved', visit: onServer, day: dayJson() };
          }
          if (args.p_base_version !== 1) return { status: 'stale_visit', server: onServer };
          if (args.p_void) return { status: 'saved', visit: { ...onServer, voided: true, version: 2 }, day: null };
          return { status: 'saved', visit: { ...onServer, dead: args.p_dead, version: 2 }, day: dayJson({ dead: args.p_dead, version: 3 }) };
        },
      });
      return { time: clockOf(payload.recordedAt), rpcs };
    };
    /** الإضافة تُرفع (الرافع الحقيقيّ بالناقل الحقيقيّ) والنافذة مفتوحة على لقطتها. */
    const uploadNow = async (user) => {
      delete globalThis.__rv.sessionUser;
      await m.uploadRounds(stampOf(user), async () => m.flockDayTransport);
      await settle(60);
    };
    await step('M2 ألغِ', async () => {
      const user = 'u-m2v';
      const { time, rpcs } = await deviceVisit(user, 'v-m2v');
      const rpcLog = fresh({ status: 'ready', workspace: ws('owner', { userId: user }), offline: false }, rpcs);
      globalThis.__rv.sessionUser = 'someone-else';
      await mount('/broiler/round');
      await openVisits();
      t.eq(visitRow(time)?.[3], 'علي · على هذا الجهاز', 'M2 ضابط: الزيارة «على هذا الجهاز» قبل رفعها');
      await click(actionIn(time, 'visit-void'));
      await uploadNow(user);
      t.same(
        [named(rpcLog, 'save_flock_visit').map((args) => [args.p_visit, args.p_base_version, args.p_void]), (await queue(user)).pending.length, Boolean(dialogTitled('ألغِ زيارة'))],
        [[['v-m2v', null, false]], 0, true],
        'M2 ضابط: رُفعت الإضافة (نسختها 1 بالخادم) والطابور فارغ، والتأكيد ما زال مفتوحاً',
      );
      await click(byAction('visit-void-confirm')[0] ?? null, 120);
      const sent = named(rpcLog, 'save_flock_visit');
      t.same([sent.length, sent.at(-1)?.p_visit, sent.at(-1)?.p_void, sent.at(-1)?.p_base_version], [2, 'v-m2v', true, 1], 'M2 «ألغِ» بعد رفع الإضافة: عملية إلغاء بنسخة 1 تُرسل (لا تُسقط بصمت)');
      t.eq(globalThis.__rv.toasts.at(-1)?.title, 'أُلغيت الزيارة وطُرح ما فيها من مجموع اليوم.', 'M2 والتنبيه «أُلغيت… وطُرح»، لا «أُلغيت من هذا الجهاز قبل أن تُرسل»');
    });
    await step('M2 عدّل', async () => {
      const user = 'u-m2e';
      const { time, rpcs } = await deviceVisit(user, 'v-m2e');
      const rpcLog = fresh({ status: 'ready', workspace: ws('owner', { userId: user }), offline: false }, rpcs);
      globalThis.__rv.sessionUser = 'someone-else';
      await mount('/broiler/round');
      await openVisits();
      await click(actionIn(time, 'visit-edit'));
      await uploadNow(user);
      t.same([named(rpcLog, 'save_flock_visit').length, Boolean(dialogTitled('عدّل زيارة'))], [1, true], 'M2 ضابط: رُفعت الإضافة والنافذة مفتوحة');
      type(inDialog('عدّل زيارة', 'visit-dead'), '5');
      await settle();
      await click(inDialog('عدّل زيارة', 'visit-edit-save'), 120);
      const sent = named(rpcLog, 'save_flock_visit');
      t.same([sent.length, sent.at(-1)?.p_visit, sent.at(-1)?.p_void, sent.at(-1)?.p_base_version, sent.at(-1)?.p_dead], [2, 'v-m2e', false, 1, 5], 'M2 «عدّل» بعد رفع الإضافة: تعديل بنسخة 1 (لا إضافة ثانية لمعرّف موجود)');
      const { review } = await queue(user);
      t.same([globalThis.__rv.toasts.at(-1)?.title, review.length], ['حُفظ تعديل الزيارة.', 0], 'M2 والتنبيه «حُفظ تعديل الزيارة.» بلا رفّ مراجعة');
    });

    // ── L3: stale_visit بجملة الخادم الحقيقية (عيّنة save_flock_visit_stale، وملغاة، وبلا زيارة) في التنبيه والرفّ ──
    const staleCases = [
      ['تغيّرت', R0032.save_flock_visit_stale, 'تغيّرت هذه الزيارة من جهاز آخر قبل أن يصل طلبك، فلم يُكتب فوقها.'],
      ['أُلغيت', { ...R0032.save_flock_visit_stale, server: { ...R0032.save_flock_visit_stale.server, voided: true, version: 3 } }, 'أُلغيت هذه الزيارة من جهاز آخر قبل أن يصل طلبك، فلم يُكتب شيء.'],
      ['لم تصل', { ...R0032.save_flock_visit_stale, server: null }, 'لم تصل هذه الزيارة إلى الخادم (رُدّت إضافتها أو لم تُحفظ)، فلا شيء فيه يُعدَّل أو يُلغى.'],
    ];
    for (const [index, [label, answer, sentence]] of staleCases.entries()) {
      await step('L3 ' + label, async () => {
        fresh({ status: 'ready', workspace: ws('owner', { userId: 'u-l3-' + index }), offline: false }, roundRpcs({ round_visits: () => roundVisits(TODAY, [V1, V2, V3]), save_flock_visit: () => clone(answer) }));
        await mount('/broiler/round');
        await openVisits();
        await click(actionIn(clockOf(V2.recorded_at), 'visit-edit'));
        type(inDialog('عدّل زيارة', 'visit-dead'), '5');
        await settle();
        await click(inDialog('عدّل زيارة', 'visit-edit-save'), 120);
        await settle(60);
        const shelf = all().filter((n) => n.getAttribute('data-review') !== null).map((n) => n.textContent);
        t.same([globalThis.__rv.toasts.at(-1)?.title, shelf.length, shelf.some((entry) => entry.includes(sentence))], [sentence, 1, true], 'L3 ' + label + ': التنبيه والرفّ «' + sentence + '»');
      });
    }

    // ── L4: «عدّل» زيارة بيّاض فيها مشعور يبقى كما هو: المكسور والمشعور معاً لا يزيدان على مجموع البيض (يُمنع في النافذة بلا عملية) ──
    await step('L4', async () => {
      const LF = '00000000-0000-4000-8000-00000000d2f9';
      const layer = { today: TODAY, sites: [{ id: 's-l', name: 'حقل البيض', division_id: 'd-l', kind: 'layer', can_manage: true, halls: [hall('h-l', 'قاعة 7', flockJson(LF, { kind: 'layer' }))] }] };
      const LV = visitJson('v-l4', TODAY, { flock_id: LF, recorded_at: TODAY + 'T06:00:00+00:00', dead: 1, eggs_total: 1200, eggs_cracked: 10, eggs_broken: 5 });
      const user = 'u-l4';
      const rpcLog = fresh({ status: 'ready', workspace: ws('owner', { userId: user }), offline: false }, {
        flocks_overview: () => layer,
        vaccine_reminders: () => ({ today: TODAY, items: [] }),
        round_visits: () => ({ on: TODAY, today: TODAY, flocks: [{ flock_id: LF, hall_id: 'h-l', visits: [LV] }] }),
        save_flock_visit: (args) => ({ status: 'saved', visit: { ...LV, eggs_total: args.p_eggs_total, version: 2 }, day: null }),
      });
      await mount('/layers/round');
      await openVisits(LF);
      await click(actionIn(clockOf(LV.recorded_at), 'visit-edit'));
      t.eq(inDialog('عدّل زيارة', 'visit-eggsTotal')?.value, '1200', 'L4 ضابط: النافذة ببيض الزيارة 1,200');
      type(inDialog('عدّل زيارة', 'visit-eggsTotal'), '12');
      await settle();
      await click(inDialog('عدّل زيارة', 'visit-edit-save'), 80);
      const alerts = descendants(dialogTitled('عدّل زيارة') ?? body()).filter((n) => n.getAttribute('role') === 'alert').map((n) => n.textContent);
      t.same(
        [named(rpcLog, 'save_flock_visit').length, (await queue(user)).pending.length, alerts.some((line) => line.includes('المكسور والمشعور معاً أكثر من مجموع البيض'))],
        [0, 0, true],
        'L4 1,200 ← 12 والمشعور 10 والمكسور 5: يُمنع في النافذة (15 > 12) بلا عملية',
      );
      type(inDialog('عدّل زيارة', 'visit-eggsTotal'), '15');
      await settle();
      await click(inDialog('عدّل زيارة', 'visit-edit-save'), 120);
      const [args] = named(rpcLog, 'save_flock_visit');
      t.same([args?.p_eggs_total, args?.p_eggs_cracked, args?.p_eggs_broken], [15, 10, 5], 'L4 ضابط: 15 يُقبل، والمشعور كما هو');
    });

    // ── L7: «زيارات اليوم (n)» على بطاقة مطويّة لا يبقى بعد حفظ زيارة (كان «(1)» وفيها زيارتان)؛ والمفتوحة تعيد عددها بعد قراءتها ──
    await step('L7', async () => {
      const added = { [FLOCK]: 0 };
      const extra = (n) => visitJson('v-l7-' + n, TODAY, { recorded_at: TODAY + 'T0' + (8 + n) + ':00:00+00:00', dead: 1 });
      fresh({ status: 'ready', workspace: ws('owner', { userId: 'u-l7' }), offline: false }, roundRpcs({
        round_visits: () => roundVisits(TODAY, [V1, ...Array.from({ length: added[FLOCK] }, (_, n) => extra(n))]),
        save_flock_visit: (args) => {
          if (args.p_flock === FLOCK) added[FLOCK] += 1;
          return { status: 'saved', visit: visitJson(args.p_visit, TODAY, { flock_id: args.p_flock, recorded_at: args.p_recorded_at, dead: args.p_dead ?? 0 }), day: dayJson({ dead: args.p_dead ?? 0 }) };
        },
      }));
      await mount('/broiler/round');
      const label = () => textOf('round-visits', cardOf(FLOCK) ?? body());
      const deadOf = (flockId) => descendants(cardOf(flockId) ?? body()).find((n) => n.localName === 'input' && n.id.endsWith('-dead')) ?? null;
      await openVisits();
      t.eq(label(), 'زيارات اليوم (1)', 'L7 ضابط: زيارة واحدة');
      await openVisits();
      type(deadOf(FLOCK), '2');
      await settle();
      await click(byAction('round-save')[0] ?? null, 120);
      t.same([added[FLOCK], label()], [1, 'زيارات اليوم'], 'L7 بعد حفظ زيارة والبطاقة مطويّة: لا عدد قديم «(1)»');
      await openVisits();
      t.eq(label(), 'زيارات اليوم (2)', 'L7 وفتحها يعدّها من جديد');
      type(deadOf(F2), '1');
      await settle();
      await click(byAction('round-save')[0] ?? null, 120);
      t.same([added[FLOCK], label()], [1, 'زيارات اليوم (2)'], 'L7 والمفتوحة بعد حفظ لقاعة أخرى تعيد عددها بعد قراءتها (لا يضيع)');
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
