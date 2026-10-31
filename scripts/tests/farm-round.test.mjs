// شاشات الحقول والجولة اليومية (المرحلة 2، النسخة الأولى): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل FarmRoutes الحقيقية،
// والطابور الحقيقي (saveRound وflush وpendingOps وreviewEntries) ونسخة الجهاز على fake-indexeddb، وrepo الحقول بدائل بس لقراءاته
// وكتاباته وناقله. وناقل الطابور الحقيقي (sendFlockDay) على postgrest-js حقيقي وخادم مزيّف: كل جواب لـsave_flock_day ← نتيجة الطابور.
// الحالات: R1 حفظ الجولة بنت (عملية لكل فوج بنسخة اليوم، والخانة اللي ما تغيّرت null)؛ R2 بلا نت تنحفظ بالجهاز وترتفع لمّا يرجع
// الاتصال؛ R3 stale_day لرفّ المراجعة بالنسختين؛ R4 parked تنشال من الطابور ويُقال إنها رُدّت للمدير؛ R5 نافق أكثر من الحيّ يُمنع قبل
// الحفظ؛ R6 البيّاض: بيض فوك الحيّ يُمنع، والبيض والمكسور بالحمولة؛ F1 المدير يضيف قاعة ويفتح فوجاً وعامل القاعة ما يشوفهما؛ F2
// مؤشّرات الفوج بمنسّقاتها و«—» ليوم بلا بيض؛ T1 ناقل الطابور يحوّل كل جواب.
// ومراجعة 2026-10-31 (كل حالة تفشل على الشفرة قبل إصلاحها): A وB لقطة التعديل ونسخته (خانة ما انلمست ما تدوس حفظ جهاز آخر،
// وstale_day ما ينكتب فوقه بالحفظ الجاي)؛ C نتيجة رفع الخلفية تظهر؛ D الرافع على مستوى التطبيق وعدّادا الرأس؛ E الجولة لمن يحفظ
// يوم الفوج بس؛ F الكتابة اللي ما انحفظت تعلّم النافذة؛ G الرئيسية تحفظ نسخة الجهاز (والرأس «غير جاهز» لحدّها)؛ H ماكو «لا أرقام
// بعد» فوق بطاقة حقول بأرقام؛ I شرح تثبيت الآيفون بعدّ الطابور الحقيقي؛ J نوافذ القاعة والفوج تعدّ كل خاناتها؛ S رفض بلا تلميح
// بجملة فصيحة؛ W «نشطة» و«رُدّت إلى المدير» بدل «شغّالة» و«الطابور».
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'createHall', 'updateHall', 'archiveHall', 'openFlock', 'recordFlockWeight'];
const STUBS = {
  // loadOverview مثل الحقيقي بالضبط (parseOverview(await loadOverviewJson())) بس عبر البديل، حتى الرئيسية القديمة تقرا من نفس الخادم المزيّف.
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__farm.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__farm.call('loadOverviewJson', []));
    export const flockDayTransport = { currentUserId: async () => globalThis.__farm.userId, send: (op) => globalThis.__farm.send(op), lookup: async () => null };`,
  session: 'export const useSession = () => globalThis.__farm.session;',
  Toast: 'export const toast = (spec) => { globalThis.__farm.toasts.push(spec); }; export function Toaster() { return null; }',
  home: 'export const loadHomeSummary = () => globalThis.__farm.call("loadHomeSummary", []);',
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
    "export { parseDetail } from './src/lib/repo/flocks.ts';",
    "export { default as HomePage } from './src/pages/home/HomePage.tsx';",
    "export { StatusChips } from './src/components/shell/StatusChips.tsx';",
    "export { InstallCard } from './src/components/shell/InstallCard.tsx';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { updateStore } from './src/lib/pwa/update.ts';",
    "export { NetworkError } from './src/lib/errors.ts';",
    "export { roundQueueStore, uploadRounds } from './src/lib/roundUploads.ts';",
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
        name: 'farm-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/Toast$|\/lib\/repo\/home$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'farm-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'farm-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__farmServer.fetch(...a) });
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
    stdin: { contents: "export { flockDayTransport, sendFlockDay } from './src/lib/repo/flocks.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [
      {
        name: 'farm-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'farm-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'farm-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const text = () => body().textContent;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};

export default async function (t) {
  // ── T1: ناقل الطابور الحقيقي (save_flock_day بمرجع العملية) على خادم PostgREST مزيّف ─────────────────────────────────────
  {
    const savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
    try {
      const tr = await transport();
      const server = (globalThis.__farmServer = {
        answer: null,
        bodies: [],
        async fetch(url, init) {
          server.bodies.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
          const next = server.answer;
          if (next === 'network') throw new TypeError('Failed to fetch');
          return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: { 'content-type': 'application/json' } });
        },
      });
      const op = { id: 'op-1', fn: 'save_flock_day', userId: 'u-1', orgId: 'o-1', displayName: 'علي', flockId: 'f-1', day: '2026-10-31', payload: { dead: 5, feed_kg: '120.500', eggs_total: null }, baseVersion: 2, state: 'pending', attempts: 0, claimToken: null, claimedAt: null, createdAt: 1, updatedAt: 1, lastError: null };
      const outcome = async (answer) => {
        server.answer = answer;
        return tr.sendFlockDay(op).then((value) => value, (error) => `throw:${error.name}`);
      };
      t.same(await outcome({ json: { status: 'saved', version: 3 } }), { kind: 'saved', version: 3 }, 'T1: saved برقم النسخة');
      const sent = server.bodies.at(-1);
      t.ok(sent.url.endsWith('/rpc/save_flock_day'), 'T1: ينادي save_flock_day');
      t.same(
        [sent.body.p_client_ref, sent.body.p_queued, sent.body.p_base_version, sent.body.p_flock, sent.body.p_date, sent.body.p_dead, sent.body.p_culled, sent.body.p_feed_kg, sent.body.p_eggs_total],
        ['op-1', true, 2, 'f-1', '2026-10-31', 5, null, '120.500', null],
        'T1: المرجع = معرّف العملية، queued، نسخة الأساس، والخانة الغائبة null («بلا تغيير»)',
      );
      const server6 = { on_date: '2026-10-31', version: 6, dead: 3 };
      t.same(await outcome({ json: { status: 'stale_day', server: server6 } }), { kind: 'stale_day', server: server6 }, 'T1: stale_day بصفّ الخادم');
      t.same(await outcome({ json: { status: 'parked', reason: 'flock_closed' } }), { kind: 'parked' }, 'T1: parked');
      t.same(
        await outcome({ status: 400, json: { code: 'P0001', message: 'eggs_over_live', hint: 'البيض أكثر من الحيّ.', details: null } }),
        { kind: 'rejected', code: 'eggs_over_live', hint: 'البيض أكثر من الحيّ.' },
        'T1: الرفض المقصود برمزه وتلميحه',
      );
      t.same(await outcome({ status: 401, json: { code: 'PGRST301', message: 'JWT expired', hint: null, details: null } }), { kind: 'identity_rejected' }, 'T1: 401 = رفض الهويّة');
      t.same(await outcome({ status: 403, json: { code: '42501', message: 'permission denied for function save_flock_day', hint: null, details: null } }), { kind: 'identity_rejected' }, 'T1: 42501 على الدالّة = رفض الهويّة');
      t.eq(await outcome('network'), 'throw:UnknownOutcomeError', 'T1: انقطاع بعد الإرسال يرمي (النتيجة مجهولة، والطابور يحسمها بنفس المرجع)');
      t.eq(await tr.flockDayTransport.lookup(op), null, 'T1: الحسم بالمرجع = الإرسال نفسه بعد فحص الهويّة');
      t.eq(await tr.flockDayTransport.currentUserId(), 'u-1', 'T1: مستخدم الجلسة');
    } finally {
      delete globalThis.__farmServer;
      if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav);
      else delete globalThis.navigator;
    }
  }

  const restore = installDom();
  try {
    const m = await screens();
    const TODAY = m.localDay();
    const ws = (over = {}) => ({ userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [], divisions: ['broiler', 'layer'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over });
    const dayRow = (over = {}) => ({ on_date: TODAY, version: 1, dead: 0, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, ...over });
    const flock = (id, kind, over = {}) => ({
      id, kind, breed: null, status: 'active', version: 1, placed_on: m.addDays(TODAY, -11), placed_count: 5000, age_days_at_placement: 0, age_days: 11,
      days_since_placement: 12, dead_total: 50, culled_total: 12, live: 4938, live_start_today: 4938, mortality_pct: '1.24', feed_kg_total: '1234.500',
      feed_days: 12, feed_span_days: 12, last_weight: { on_date: m.addDays(TODAY, -1), sample_count: 50, avg_g: '450.0' }, fcr: '0.555', today: null,
      eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
    });
    const site = (id, kind, halls, canManage = true) => ({ id, name: kind === 'broiler' ? 'حقل الشمال' : 'حقل البيض', division_id: `d-${kind}`, kind, can_manage: canManage, halls });
    const hall = (id, name, flockJson) => ({ id, name, capacity: 6000, version: 2, flock: flockJson });

    let root = null;
    const fresh = (session, handlers, send = async () => ({ kind: 'saved', version: 1 })) => {
      const calls = [];
      const sent = [];
      globalThis.__farm = {
        session,
        userId: session.workspace?.userId ?? null,
        toasts: [],
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
    const mount = async (url, { header = false } = {}) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      const routes = m.h(
        m.Routes,
        null,
        m.h(m.Route, { path: '/', element: m.h(m.HomePage) }),
        m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }),
        m.h(m.Route, { path: '/layers/*', element: m.h(m.FarmRoutes, { kind: 'layer' }) }),
      );
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, header ? m.h('div', null, m.h('header', { id: 'chips' }, m.h(m.StatusChips)), routes) : routes)));
      await settle(60);
      return container;
    };
    const chips = () => all().find((n) => n.id === 'chips')?.textContent ?? '';
    const unmount = async () => {
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
    };
    const queueOf = async (userId = 'u-1') => {
      const db = await m.openOutbox();
      const stamp = { userId, orgId: 'org-1', displayName: 'علي' };
      return { pending: await m.pendingOps(db, stamp), review: await m.reviewEntries(db, stamp) };
    };
    const statusOf = (flockId) => all().find((n) => n.getAttribute('data-flock') === flockId)?.textContent ?? '';
    const broilerOverview = () => ({
      today: TODAY,
      sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: dayRow({ version: 4, dead: 2 }) })), hall('h-2', 'قاعة 2', flock('f-b', 'broiler')), hall('h-3', 'قاعة 3', null)])],
    });

    // ── R1: الجولة بنت ← عملية لكل فوج تغيّر، بنسخة يومه، والخانة اللي ما تغيّرت null؛ والنتيجة «حُفظ 1 من 1» ──
    {
      m.onlineStore.set(true);
      const { calls, sent } = fresh({ status: 'ready', workspace: ws(), offline: false }, { loadOverviewJson: () => broilerOverview() }, async () => ({ kind: 'saved', version: 5 }));
      await mount('/broiler/round');
      t.ok(text().includes('قاعة 1') && text().includes('قاعة 2') && !text().includes('قاعة 3'), 'R1: الجولة بكل فوج شغّال (القاعة بلا فوج ما تظهر)');
      const dead = byIdSuffix('-dead');
      t.eq(dead[0]?.value, '2', 'R1: نافق اليوم المحفوظ معروض');
      type(dead[0], '5');
      type(byIdSuffix('-feedKg')[0], '120.5');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      t.eq(sent.length, 1, 'R1: عملية وحدة (الفوج الثاني ما تغيّر)');
      t.same([sent[0]?.flockId, sent[0]?.day, sent[0]?.baseVersion], ['f-a', TODAY, 4], 'R1: الفوج واليوم ونسخة صفّ اليوم');
      t.same(sent[0]?.payload, { dead: 5, culled: null, feed_kg: '120.500', water_l: null, eggs_total: null, eggs_broken: null }, 'R1: الحمولة مجموع اليوم، والخانة اللي ما تغيّرت null');
      t.ok(statusOf('f-a').includes('حُفظت') && text().includes('حُفظ 1 من 1'), 'R1: «حُفظت» و«حُفظ 1 من 1»');
      t.eq((await queueOf()).pending.length, 0, 'R1: الطابور فارغ بعد الحفظ');
      t.ok(calls.filter(([name]) => name === 'loadOverviewJson').length >= 2, 'R1: الأرقام تُقرأ من جديد بعد الحفظ');
      await unmount();
    }

    // ── R2: بلا نت ← تنحفظ بالجهاز («تنتظر الإرسال») بلا إرسال، ولمّا يرجع الاتصال ترتفع لحالها بنسخة null ──
    {
      m.onlineStore.set(true);
      const { sent } = fresh({ status: 'ready', workspace: ws(), offline: false }, { loadOverviewJson: () => broilerOverview() }, async () => ({ kind: 'saved', version: 1 }));
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      t.ok(text().includes('بلا اتصال: الجولة تُحفظ على هذا الجهاز'), 'R2: تنبيه «بلا اتصال»');
      type(byIdSuffix('-dead')[1], '3');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      t.eq(sent.length, 0, 'R2: بلا نت ما ينبعث شي');
      const queued = (await queueOf()).pending;
      t.same(queued.map((op) => [op.flockId, op.payload.dead, op.baseVersion]), [['f-b', 3, null]], 'R2: العملية بالطابور مختومة، ونسختها null (ماكو صفّ لليوم)');
      t.ok(statusOf('f-b').includes('محفوظة على هذا الجهاز') && text().includes('جولة واحدة على هذا الجهاز تنتظر الإرسال'), 'R2: «محفوظة على هذا الجهاز» وعدّاد الانتظار');
      t.eq(byIdSuffix('-dead')[1]?.value, '3', 'R2: القيمة المنتظرة معروضة فوق المحفوظ');
      m.onlineStore.set(true);
      await settle(120);
      t.same(sent.map((op) => [op.flockId, op.payload.dead]), [['f-b', 3]], 'R2: رجع الاتصال ← ارتفعت لحالها');
      t.eq((await queueOf()).pending.length, 0, 'R2: الطابور فارغ بعد الرفع');
      t.ok(!text().includes('تنتظر الإرسال'), 'R2: العدّاد اختفى');
      await unmount();
    }

    // ── R3: stale_day ← رفّ المراجعة بالنسختين (جولتك 7، المحفوظ 3)، ولا تنحذف ──
    {
      m.onlineStore.set(true);
      fresh({ status: 'ready', workspace: ws({ userId: 'u-3' }), offline: false }, { loadOverviewJson: () => broilerOverview() }, async () => ({ kind: 'stale_day', server: dayRow({ version: 6, dead: 3 }) }));
      await mount('/broiler/round');
      type(byIdSuffix('-dead')[0], '7');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      const { pending, review } = await queueOf('u-3');
      t.same([pending.length, review.length, review[0]?.reason], [0, 1, 'stale_day'], 'R3: العملية انتقلت لرفّ المراجعة');
      t.ok(statusOf('f-a').includes('راجعها في «جولات تحتاج مراجعة»'), 'R3: الصفّ يقول راجعها');
      t.ok(text().includes('جولات تحتاج مراجعة') && text().includes('حُفظ هذا اليوم من جهاز آخر قبل أن تصل جولتك'), 'R3: الرفّ بسببه');
      const shelf = all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.ok(shelf.includes('النافق') && shelf.includes('7') && shelf.includes('3'), 'R3: النسختان جنب بعض: جولتك 7 والمحفوظ 3');
      await unmount();
    }

    // ── R4: parked ← تنشال من الطابور، والصفّ يقول رُدّت للمدير ──
    {
      m.onlineStore.set(true);
      fresh({ status: 'ready', workspace: ws({ userId: 'u-4' }), offline: false }, { loadOverviewJson: () => broilerOverview() }, async () => ({ kind: 'parked' }));
      await mount('/broiler/round');
      type(byIdSuffix('-culled')[1], '1');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      const { pending, review } = await queueOf('u-4');
      t.same([pending.length, review.length], [0, 0], 'R4: parked ما تبقى بالطابور ولا بالرفّ');
      t.ok(statusOf('f-b').includes('رُدّت إلى المدير'), 'R4: «رُدّت إلى المدير»');
      t.ok(text().includes('راجع: قاعة 2'), 'R4: العدّ يسمّي القاعة');
      await unmount();
    }

    // ── R5: نافق ومستبعد أكثر من الحيّ بداية اليوم ← يُمنع قبل الحفظ بلا عملية ──
    {
      m.onlineStore.set(true);
      const { sent } = fresh({ status: 'ready', workspace: ws({ userId: 'u-5' }), offline: false }, { loadOverviewJson: () => broilerOverview() });
      await mount('/broiler/round');
      type(byIdSuffix('-dead')[1], '6000');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(60);
      t.eq(sent.length, 0, 'R5: ما انبعث شي');
      t.eq((await queueOf('u-5')).pending.length, 0, 'R5: ولا انكتب بالطابور');
      t.ok(text().includes('النافق والمستبعد أكثر من الطيور الحيّة بداية اليوم (4,938)'), 'R5: السبب بالحيّ بفواصل');
      await unmount();
    }

    // ── R6: البيّاض: بيض فوك الحيّ بداية اليوم يُمنع (القاعدة 32)، والبيض والمكسور بالحمولة ──
    {
      m.onlineStore.set(true);
      const layers = () => ({ today: TODAY, sites: [site('s-2', 'layer', [hall('h-9', 'قاعة البيّاض', flock('f-l', 'layer', { live: 1000, live_start_today: 1000, fcr: null }))])] });
      const { sent } = fresh({ status: 'ready', workspace: ws({ userId: 'u-6' }), offline: false }, { loadOverviewJson: () => layers() });
      await mount('/layers/round');
      t.ok(byIdSuffix('-eggsTotal').length === 1 && byIdSuffix('-eggsBroken').length === 1, 'R6: خانتا البيض للبيّاض');
      type(byIdSuffix('-eggsTotal')[0], '1200');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(60);
      t.ok(sent.length === 0 && text().includes('البيض أكثر من الدجاج الحيّ بداية اليوم (1,000)'), 'R6: بيض فوك الحيّ ممنوع');
      type(byIdSuffix('-eggsTotal')[0], '850');
      type(byIdSuffix('-eggsBroken')[0], '20');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      t.same([sent[0]?.payload.eggs_total, sent[0]?.payload.eggs_broken], [850, 20], 'R6: البيض والمكسور بالحمولة');
      await unmount();
    }
    {
      m.onlineStore.set(true);
      fresh({ status: 'ready', workspace: ws({ userId: 'u-7' }), offline: false }, { loadOverviewJson: () => broilerOverview() });
      await mount('/broiler/round');
      t.same(byIdSuffix('-eggsTotal').length, 0, 'R6: اللاحم بلا خانة بيض');
      await unmount();
    }

    // ── F1: المدير يضيف قاعة ويفتح فوجاً (بمرجع)، وعامل القاعة يشوف الأرقام والجولة بلا أزرارهما ──
    {
      m.onlineStore.set(true);
      const { calls } = fresh({ status: 'ready', workspace: ws(), offline: false }, { loadOverviewJson: () => broilerOverview(), openFlock: () => 'f-new' });
      await mount('/broiler');
      t.ok(text().includes('حقل الشمال') && text().includes('1.24%') && text().includes('0.555'), 'F1: الحقل والقاعات بالنفوق ومعامل التحويل');
      const farmCells = all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.ok(
        farmCells.filter((cell) => cell === '1,234.5').length === 2 && all().some((n) => n.localName === 'th' && n.textContent === 'العلف (كغم)') && !text().includes('طن'),
        'F1: عمود العلف أرقام بمراتب العمود الثابتة والوحدة برأسه (fmtQtyCell، قانون المالك)، مو «1.2345 طن» بكل خلية',
      );
      t.ok(byAction('hall-add').length === 1 && byAction('flock-open').length === 1 && byAction('farm-round').length === 1, 'F1: المدير: أضف قاعة، وافتح فوجاً للقاعة الفارغة، والجولة');
      fire(byAction('flock-open')[0], 'click');
      await settle();
      type(byIdSuffix('-count')[0], '5000');
      await settle();
      fire(byAction('flock-open-save')[0], 'click');
      await settle(60);
      const open = calls.find(([name]) => name === 'openFlock');
      t.same(open?.[1]?.[0], { hallId: 'h-3', placedOn: TODAY, placedCount: 5000, ageDays: 0, breed: '' }, 'F1: open_flock بالقاعة والتاريخ والعدد');
      t.ok(typeof open?.[1]?.[1] === 'string' && open[1][1].length > 10, 'F1: بمرجع الجهاز');
      await unmount();
    }
    {
      m.onlineStore.set(true);
      const worker = () => ({ today: TODAY, sites: [site('s-1', 'broiler', broilerOverview().sites[0].halls, false)] });
      fresh({ status: 'ready', workspace: ws({ role: 'hall_worker', divisions: ['broiler'] }), offline: false }, { loadOverviewJson: () => worker() });
      await mount('/broiler');
      t.ok(text().includes('قاعة 1') && byAction('farm-round').length === 1, 'F1: عامل القاعة يشوف قاعاته والجولة');
      t.same([byAction('hall-add').length, byAction('flock-open').length, byAction('hall-edit').length], [0, 0, 0], 'F1: عامل القاعة بلا إضافة قاعة ولا فتح فوج ولا تعديل');
      await unmount();
    }

    // ── F2: مؤشّرات الفوج وجدول أيامه بمنسّقاتها، و«—» ليوم بلا بيض (مو صفر)، ووزن العيّنة لمن يحفظ ──
    {
      const detail = (kind, canSave) => ({
        flock: { ...flock('f-1', kind, { mortality_pct: '1.25', fcr: kind === 'broiler' ? '1.523' : null, eggs_today: kind === 'layer' ? 852 : null, hdep_today: kind === 'layer' ? '85.20' : null }), hall_id: 'h-1', hall_name: 'قاعة 1', site_id: 's-1', site_name: 'حقل الشمال', closed_on: null, close_note: null },
        can_manage: false,
        can_save: canSave,
        days: [
          { ...dayRow({ on_date: TODAY, version: 2, dead: 4, culled: 1, feed_kg: '120.500', eggs_total: kind === 'layer' ? 852 : null, eggs_broken: kind === 'layer' ? 12 : null }), live_start: 4943, live_end: 4938, hdep: kind === 'layer' ? '85.20' : null },
          { ...dayRow({ on_date: m.addDays(TODAY, -1), version: 1, dead: 3, culled: 0, feed_kg: '98.250' }), live_start: 4946, live_end: 4943, hdep: null },
        ],
        weights: [{ on_date: m.addDays(TODAY, -1), sample_count: 50, avg_g: '450.0', version: 1 }],
      });
      fresh({ status: 'ready', workspace: ws({ role: 'hall_worker' }), offline: false }, { loadFlockDetail: () => m.parseDetail(detail('broiler', true)) });
      await mount('/broiler/flock/f-1');
      const cells = () => all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.ok(text().includes('1.25%') && text().includes('1.523') && text().includes('4,938') && text().includes('1.2345 طن'), 'F2: النفوق ومعامل التحويل والحيّ والعلف بمنسّقاتها');
      t.ok(cells().includes('120.50') && cells().includes('98.25') && cells().includes('4,943'), 'F2: عمود العلف بمراتب ثابتة والحيّ الجاري بفواصل');
      t.ok(cells().includes('450.0') && byAction('weight-save').length === 1, 'F2: الأوزان، ونموذج الوزن لمن يحفظ اليوم');
      await unmount();
      fresh({ status: 'ready', workspace: ws({ role: 'viewer' }), offline: false }, { loadFlockDetail: () => m.parseDetail(detail('layer', false)) });
      await mount('/layers/flock/f-1');
      const hdep = cells();
      t.ok(hdep.includes('85.20%') && hdep.includes('—'), 'F2: نسبة الإنتاج لليوم و«—» ليوم بلا بيض');
      t.ok(text().includes('852') && byAction('weight-save').length === 0, 'F2: بيض اليوم، والمشاهد بلا نموذج وزن');
      await unmount();
    }

    // ─── مراجعة 2026-10-31: خادم صغير بقاعدة save_flock_day نفسها (base_version ← stale_day، والخانة null بلا تغيير) ──────────────
    const card = (flockId) => all().find((n) => n.getAttribute('data-flock') === flockId);
    const inCard = (flockId, suffix) => descendants(card(flockId) ?? body()).find((n) => n.id.endsWith(suffix));
    const makeServer = (initial) => {
      const rows = { ...initial };
      return {
        rows,
        overview: () => ({
          today: TODAY,
          sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: rows['f-a'] ? dayRow({ ...rows['f-a'] }) : null })), hall('h-2', 'قاعة 2', flock('f-b', 'broiler', { today: rows['f-b'] ? dayRow({ ...rows['f-b'] }) : null }))])],
        }),
        async save(op) {
          const row = rows[op.flockId] ?? null;
          if ((op.baseVersion === null && row) || (op.baseVersion !== null && (!row || row.version !== op.baseVersion))) return { kind: 'stale_day', server: row ? dayRow({ ...row }) : null };
          const next = { ...(row ?? { version: 0, dead: 0, culled: 0 }) };
          for (const [field, value] of Object.entries(op.payload)) if (value !== null && value !== undefined) next[field] = value;
          next.version = (row?.version ?? 0) + 1;
          rows[op.flockId] = next;
          return { kind: 'saved', version: next.version };
        },
      };
    };

    // ── A: خانة ما انلمست من قراءة أقدم ما تدوس حفظاً أحدث من جهاز آخر: الحمولة null ونسخة اللقطة (4) فالخادم يرجّع stale_day ──
    {
      m.onlineStore.set(true);
      const server = makeServer({ 'f-a': { version: 4, dead: 2, culled: 0 }, 'f-b': null });
      const { sent } = fresh({ status: 'ready', workspace: ws({ userId: 'u-a' }), offline: false }, { loadOverviewJson: () => server.overview() }, (op) => server.save(op));
      await mount('/broiler/round');
      type(inCard('f-a', '-feedKg'), 'abc');
      type(inCard('f-b', '-dead'), '1');
      await settle();
      server.rows['f-a'] = { version: 5, dead: 9, culled: 0 };
      fire(byAction('round-save')[0], 'click');
      await settle(120);
      t.eq(inCard('f-a', '-dead')?.value, '2', 'A: ضابط: القاعة 1 باقية بخطئها وتعرض لقطة أوّل كتابة (نافق 2) والخادم صار 9');
      type(inCard('f-a', '-feedKg'), '120');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(120);
      const last = sent.at(-1);
      t.same([last?.flockId, last?.payload?.dead, last?.baseVersion], ['f-a', null, 4], 'A: النافق اللي ما انلمس null، والعملية بنسخة اللقطة 4 (مو 5)');
      t.eq(server.rows['f-a'].dead, 9, 'A: نافق الجهاز الآخر (9) يبقى بعد حفظ صحّح العلف بس');
      t.ok((await queueOf('u-a')).review.some((entry) => entry.reason === 'stale_day'), 'A: جولة القاعة 1 لرفّ المراجعة بالنسختين');
      await unmount();
    }

    // ── B: بعد stale_day الحفظ الجاي بنفس الصفّ ما يكتب القيمة المردودة فوق الخادم: التعديل ينبني من جديد فوق آخر أرقامه ونسخته ──
    {
      m.onlineStore.set(true);
      const server = makeServer({ 'f-a': { version: 4, dead: 2, culled: 0 }, 'f-b': null });
      const { sent } = fresh({ status: 'ready', workspace: ws({ userId: 'u-b' }), offline: false }, { loadOverviewJson: () => server.overview() }, (op) => server.save(op));
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-a', '-dead'), '3');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      type(inCard('f-a', '-waterL'), '50');
      await settle();
      server.rows['f-a'] = { version: 5, dead: 1, culled: 0 };
      m.onlineStore.set(true);
      await settle(150);
      t.eq((await queueOf('u-b')).review[0]?.reason, 'stale_day', 'B: ضابط: جولة النافق 3 رجعت stale_day لرفّ المراجعة');
      t.ok(card('f-a')?.textContent.includes('حُفظ هذا اليوم من جهاز آخر بعد أن بدأت التعديل'), 'B: الصفّ يقول إن تعديله انبنى من جديد فوق أرقام الجهاز الآخر');
      t.same([inCard('f-a', '-dead')?.value, inCard('f-a', '-waterL')?.value], ['1', '50'], 'B: النافق من الخادم (1) والماء المكتوب (50) باقٍ');
      fire(byAction('round-save')[0], 'click');
      await settle(120);
      t.eq(server.rows['f-a'].dead, 1, 'B: حفظ الماء ما كتب النافق المردود (3) فوق الخادم (1)');
      t.ok(!(sent.at(-1)?.payload?.dead === 3 && sent.at(-1)?.baseVersion === 5), 'B: النافق المردود ما انبعث بالنسخة الجديدة');
      t.same([sent.at(-1)?.payload?.water_l, sent.at(-1)?.baseVersion, server.rows['f-a'].water_l], ['50.000', 5, '50.000'], 'B: الماء انحفظ بنسخة الخادم الجديدة');
      await unmount();
    }

    // ── C: جولة انرفعت بالخلفية لمّا رجع الاتصال وردّها الخادم للمدير: الشاشة تقولها، ما تختفي بصمت ──
    {
      m.onlineStore.set(true);
      const server = makeServer({ 'f-a': { version: 4, dead: 2, culled: 0 }, 'f-b': null });
      fresh({ status: 'ready', workspace: ws({ userId: 'u-c' }), offline: false }, { loadOverviewJson: () => server.overview() }, async () => ({ kind: 'parked' }));
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-b', '-dead'), '3');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      t.ok(card('f-b')?.textContent.includes('محفوظة على هذا الجهاز'), 'C: ضابط: محفوظة على الجهاز');
      m.onlineStore.set(true);
      await settle(150);
      t.eq((await queueOf('u-c')).pending.length, 0, 'C: ضابط: الرفع بالخلفية جرى والخادم ركنها');
      t.ok(card('f-b')?.textContent.includes('رُدّت إلى المدير'), 'C: صفّ القاعة 2 يقول «رُدّت إلى المدير»');
      t.ok(text().includes('رُدّت إلى المدير: قاعة 2'), 'C: تنبيه يسمّي القاعة اللي رُدّت');
      const seen = byAction('round-uploads-seen')[0];
      if (seen) fire(seen, 'click');
      await settle();
      t.ok(seen && !text().includes('رُدّت إلى المدير: قاعة 2'), 'C: «حسناً» يطوي التنبيه');
      await unmount();
      await mount('/broiler/round');
      t.ok(seen && !text().includes('رُدّت إلى المدير: قاعة 2') && card('f-b')?.textContent.includes('رُدّت إلى المدير'), 'C: التنبيه المقول ما يرجع بفتح الشاشة من جديد، وحالة الصفّ باقية');
      await unmount();
    }

    // ── D: جولات الجهاز ترتفع من أيّ شاشة (الرافع بالقشرة)، والرأس يعدّها ──
    {
      m.onlineStore.set(true);
      const server = makeServer({ 'f-a': { version: 4, dead: 2, culled: 0 }, 'f-b': null });
      const { sent } = fresh({ status: 'ready', workspace: ws({ userId: 'u-d' }), offline: false }, { loadOverviewJson: () => server.overview() }, (op) => server.save(op));
      await mount('/broiler/round', { header: true });
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-b', '-dead'), '3');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      t.ok(card('f-b')?.textContent.includes('تُرسل حين يعود الاتصال'), 'D: ضابط: «تُرسل حين يعود الاتصال»');
      t.ok(chips().includes('جولاتك المنتظرة: 1'), `D: الرأس: «جولاتك المنتظرة: 1» (${chips()})`);
      fire(all().find((n) => n.localName === 'a' && n.textContent === 'إلى الحقول'), 'click', { button: 0 });
      await settle(80);
      t.ok(text().includes('قاعة 1') && byAction('round-save').length === 0, 'D: ضابط: تركت الجولة لشاشة الحقل');
      m.onlineStore.set(true);
      await settle(150);
      t.same(sent.map((op) => [op.flockId, op.payload.dead]), [['f-b', 3]], 'D: رجع الاتصال وشاشة الجولة مغلقة: جولة الجهاز ارتفعت');
      t.ok(chips().includes('كل الجولات مُرسلة') && !chips().includes('جولاتك المنتظرة'), `D: الرأس: «كل الجولات مُرسلة» (${chips()})`);
      const other = { userId: 'u-d2', orgId: 'org-1', displayName: 'حسن' };
      await m.saveRound(await m.openOutbox(), other, { fn: 'save_flock_day', flockId: 'f-a', day: TODAY, payload: { dead: 1 }, baseVersion: null });
      m.onlineStore.set(false);
      await settle(60);
      t.ok(chips().includes('جولات لغيرك: 1') && chips().includes('حسن (1)'), `D: الرأس يعدّ جولات غيره على الجهاز باسمه (${chips()})`);
      await unmount();
    }

    // ── E: المشاهد (بلا flock_day.save) ما يُعرض عليه زرّ الجولة ولا خاناتها، وما يدخل الطابور شي باسمه ──
    {
      m.onlineStore.set(true);
      const server = makeServer({ 'f-a': { version: 4, dead: 2, culled: 0 }, 'f-b': null });
      const viewerOverview = () => {
        const o = server.overview();
        o.sites[0].can_manage = false;
        return o;
      };
      const { sent } = fresh({ status: 'ready', workspace: ws({ userId: 'u-e', role: 'viewer', canSeeCost: false, canSeeAccounts: false }), offline: false }, { loadOverviewJson: viewerOverview }, async () => ({ kind: 'rejected', code: 'forbidden', hint: 'ليست لديك صلاحية.' }));
      await mount('/broiler');
      t.ok(text().includes('قاعة 1'), 'E: ضابط: المشاهد يرى الحقل');
      t.eq(byAction('farm-round').length, 0, 'E: شاشة الحقل: ماكو زرّ الجولة للمشاهد');
      await unmount();
      await mount('/broiler/round');
      t.same([byAction('round-save').length, byIdSuffix('-dead').length], [0, 0], 'E: شاشة الجولة: ماكو خانات ولا حفظ للمشاهد');
      t.ok(text().includes('تعرض هذه الصفحة أرقام اليوم فقط'), 'E: تنبيه «تعرض هذه الصفحة أرقام اليوم فقط»');
      t.same(descendants(card('f-a') ?? body()).filter((n) => n.localName === 'dd').map((n) => n.textContent), ['2', '0', '—', '—'], 'E: أرقام اليوم معروضة بلا خانات (نافق 2، مستبعد 0، والعلف والماء «—»)');
      const { pending, review } = await queueOf('u-e');
      t.same([sent.length, pending.length, review.length], [0, 0, 0], 'E: ولا عملية ولا رفّ مراجعة باسم المشاهد');
      await unmount();
    }

    // ── F: أرقام الجولة اللي ما انحفظت تعلّم النافذة (التحديث والتعافي ما يعيدان تحميلها، وإغلاق التبويب يسأل) ──
    {
      m.onlineStore.set(true);
      const server = makeServer({ 'f-a': { version: 4, dead: 2, culled: 0 }, 'f-b': null });
      fresh({ status: 'ready', workspace: ws({ userId: 'u-f' }), offline: false }, { loadOverviewJson: () => server.overview() }, (op) => server.save(op));
      await mount('/broiler/round');
      t.eq(m.isWindowDirty(), false, 'F: ضابط: نظيفة قبل الكتابة');
      type(inCard('f-a', '-dead'), '5');
      type(inCard('f-b', '-culled'), '2');
      await settle();
      t.eq(m.isWindowDirty(), true, 'F: كتابة بالجولة لم تُحفظ = نافذة وسخة');
      fire(byAction('round-save')[0], 'click');
      await settle(120);
      t.eq(m.isWindowDirty(), false, 'F: بعد الحفظ النافذة نظيفة');
      await unmount();
    }

    // ── G وH: الرئيسية تقرأ الحقول بنت وتحفظ نسخة الجهاز، فجولة عامل القاعة تنفتح بالقاعة بلا نت؛ والرأس «غير جاهز» لحدّها ──
    {
      m.onlineStore.set(true);
      m.updateStore.set((state) => ({ ...state, offlineReady: true }));
      const server = makeServer({ 'f-a': { version: 4, dead: 2, culled: 0 }, 'f-b': null });
      const worker = ws({ userId: 'u-g', role: 'hall_worker', divisions: ['broiler'], canSeeCost: false, canSeeAccounts: false });
      fresh({ status: 'ready', workspace: worker, offline: false }, { loadOverviewJson: () => new Promise(() => {}), loadHomeSummary: () => ({}) });
      await mount('/', { header: true });
      t.ok(chips().includes('غير جاهز دون اتصال'), `G: الرأس قبل أوّل قراءة للحقول: «غير جاهز دون اتصال» (${chips()})`);
      await unmount();
      const { calls } = fresh({ status: 'ready', workspace: worker, offline: false }, { loadOverviewJson: () => server.overview(), loadHomeSummary: () => ({}) });
      await mount('/', { header: true });
      await settle(60);
      t.ok(calls.some(([name]) => name === 'loadOverviewJson') && text().includes('9,876'), 'G: ضابط: الرئيسية قرأت الحقول بنت (9,876 طيراً حيّاً)');
      t.ok(!chips().includes('غير جاهز دون اتصال'), `G: بعد قراءة الرئيسية الرأس ما يقول «غير جاهز» (${chips()})`);
      t.ok(!text().includes('لا أرقام بعد'), 'H: ماكو «لا أرقام بعد … المراحل القادمة» فوق بطاقة حقول بأرقام');
      await unmount();
      m.onlineStore.set(false);
      fresh({ status: 'ready', workspace: worker, offline: true }, { loadOverviewJson: () => Promise.reject(new m.NetworkError()) });
      await mount('/broiler/round');
      t.eq(byIdSuffix('-dead').length, 2, 'G: بالقاعة بلا نت الجولة تنفتح من نسخة الرئيسية');
      t.ok(text().includes('بلا اتصال: هذه آخر نسخة محفوظة على الجهاز'), 'G: وتقول إنها نسخة الجهاز');
      await unmount();
      m.updateStore.set((state) => ({ ...state, offlineReady: false }));
    }

    // ── I: شرح التثبيت بالآيفون بعدّ الطابور الحقيقي: جولات ما انرفعت ← «ارفع جولاتك أولاً» بدل خطوات التثبيت ──
    {
      const savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 }, configurable: true, writable: true });
      try {
        m.onlineStore.set(false);
        const who = ws({ userId: 'u-i', role: 'hall_worker', divisions: ['broiler'] });
        await m.saveRound(await m.openOutbox(), { userId: 'u-i', orgId: 'org-1', displayName: 'علي' }, { fn: 'save_flock_day', flockId: 'f-a', day: TODAY, payload: { dead: 2 }, baseVersion: 4 });
        fresh({ status: 'ready', workspace: who, offline: false }, {});
        const container = globalThis.document.createElement('div');
        body().appendChild(container);
        root = m.createRoot(container);
        m.flushSync(() => root.render(m.h(m.InstallCard)));
        await settle(30);
        fire(byAction('install-app')[0], 'click');
        await settle(60);
        t.ok(text().includes('ارفع جولاتك أولاً، ثم ثبّت التطبيق') && !text().includes('إضافة إلى الشاشة الرئيسية'), 'I: جولة بالطابور: الآيفون يقول «ارفع جولاتك أولاً» بلا خطوات التثبيت');
        await unmount();
      } finally {
        if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav);
        else delete globalThis.navigator;
      }
    }

    // ── J: نافذتا القاعة والفوج تعدّان كل خانة مكتوبة (السعة، والعمر والسلالة) كتابة لم تُحفظ ──
    {
      m.onlineStore.set(true);
      const withEmpty = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler')), hall('h-3', 'قاعة 3', null)])] });
      fresh({ status: 'ready', workspace: ws({ userId: 'u-j' }), offline: false }, { loadOverviewJson: withEmpty });
      await mount('/broiler');
      fire(byAction('hall-add')[0], 'click');
      await settle();
      type(byIdSuffix('-capacity')[0], '6000');
      await settle();
      t.eq(m.isWindowDirty(), true, 'J: نافذة القاعة بالسعة وحدها كتابة لم تُحفظ');
      await unmount();
      fresh({ status: 'ready', workspace: ws({ userId: 'u-j' }), offline: false }, { loadOverviewJson: withEmpty });
      await mount('/broiler');
      fire(byAction('flock-open')[0], 'click');
      await settle();
      type(byIdSuffix('-age')[0], '21');
      type(byIdSuffix('-breed')[0], 'روس 308');
      await settle();
      t.eq(m.isWindowDirty(), true, 'J: نافذة الفوج بالعمر والسلالة (والعدد فارغ) كتابة لم تُحفظ');
      await unmount();
      t.eq(m.isWindowDirty(), false, 'J: ضابط: بعد إغلاق الشاشة النافذة نظيفة');
    }

    // ── S: رفض بلا تلميح (PGRST202: الدالّة مو بالخادم بعد) برفّ المراجعة بجملة فصيحة، مو الرمز وحده ──
    {
      m.onlineStore.set(true);
      fresh({ status: 'ready', workspace: ws({ userId: 'u-s' }), offline: false }, { loadOverviewJson: () => broilerOverview() }, async () => ({ kind: 'rejected', code: 'PGRST202', hint: null }));
      await mount('/broiler/round');
      type(byIdSuffix('-dead')[1], '1');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(80);
      const paragraphs = all().filter((n) => n.localName === 'p').map((n) => n.textContent);
      t.ok(!paragraphs.includes('PGRST202') && paragraphs.some((line) => line.includes('لم يُحفظ شيء') && line.includes('PGRST202')), `S: رفّ المراجعة بجملة «لم يُحفظ شيء (الرمز: …)» (${paragraphs.filter((line) => line.includes('PGRST')).join(' | ')})`);
      await unmount();
    }

    // ── U: الرافع الواحد: طلب أثناء رفع جارٍ ينتظره ثم يرفع مرّة ثانية؛ كل عملية تنبعث مرّة، واللي انتظر يلقى نتيجة عمليته ──
    {
      const owner = { userId: 'u-u', orgId: 'org-1', displayName: 'علي' };
      const db = await m.openOutbox();
      await m.saveRound(db, owner, { fn: 'save_flock_day', flockId: 'f-1', day: TODAY, payload: { dead: 1 }, baseVersion: null });
      let release = () => {};
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const sentU = [];
      const transport = {
        currentUserId: async () => 'u-u',
        lookup: async () => null,
        send: async (op) => {
          sentU.push(op.flockId);
          if (op.flockId === 'f-1') await gate;
          return { kind: 'saved', version: 1 };
        },
      };
      const before = m.roundQueueStore.get().seq;
      const first = m.uploadRounds(owner, async () => transport);
      await settle(20);
      await m.saveRound(db, owner, { fn: 'save_flock_day', flockId: 'f-2', day: TODAY, payload: { dead: 2 }, baseVersion: null });
      const second = m.uploadRounds(owner, async () => transport);
      const third = m.uploadRounds(owner, async () => transport);
      release();
      const [a, b, c] = await Promise.all([first, second, third]);
      t.same(sentU, ['f-1', 'f-2'], 'U: كل عملية انبعثت مرّة وحدة رغم ثلاثة طلبات رفع');
      t.ok(b.some((entry) => entry.flockId === 'f-2' && entry.result.kind === 'saved') && b.some((entry) => entry.flockId === 'f-1'), 'U: الطلب اللي انتظر يلقى نتيجة عمليته وين ما ارتفعت');
      t.same([a.map((entry) => entry.flockId).includes('f-1'), b === c || JSON.stringify(b) === JSON.stringify(c)], [true, true], 'U: الطلبان المنتظران يشتركان بنفس الرفع الثاني');
      t.same([(await m.pendingOps(db, owner)).length, m.roundQueueStore.get().key, m.roundQueueStore.get().mine, m.roundQueueStore.get().seq > before], [0, 'u-u:org-1', 0, true], 'U: الطابور فارغ، والعدّ والنتائج انتشرت بالمخزن');
    }

    // ── W: «لا أفواج نشطة» بدل «شغّالة» ──
    {
      m.onlineStore.set(true);
      fresh({ status: 'ready', workspace: ws({ userId: 'u-w' }), offline: false }, { loadOverviewJson: () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-3', 'قاعة 3', null)])] }) });
      await mount('/broiler/round');
      t.ok(text().includes('لا أفواج نشطة في نطاقك اليوم.') && !text().includes('شغّالة'), 'W: «لا أفواج نشطة في نطاقك اليوم.»');
      await unmount();
    }

    // ── F3: شاشة الفوج: تلميح FCR بأيّام العلف لحد أمس، وحدّ الوزن الأدنى (1.8 بخانة الغرامات يُمنع)، والمركونة بلا «الطابور» ──
    {
      m.onlineStore.set(true);
      const detail = {
        flock: { ...flock('f-1', 'broiler', { fcr: null, feed_days: 4, feed_span_days: 5, rejects_pending: 2 }), hall_id: 'h-1', hall_name: 'قاعة 1', site_id: 's-1', site_name: 'حقل الشمال', closed_on: null, close_note: null },
        can_manage: false,
        can_save: true,
        days: [],
        weights: [],
      };
      fresh({ status: 'ready', workspace: ws({ userId: 'u-f3', role: 'hall_worker' }), offline: false }, { loadFlockDetail: () => m.parseDetail(detail) });
      await mount('/broiler/flock/f-1');
      t.ok(text().includes('حتى أمس') && text().includes('مسجّل 4 من 5'), 'F3: تلميح FCR: علف كل يوم من التسكين حتى أمس، مسجّل 4 من 5');
      t.ok(text().includes('جولات أُرسلت من الأجهزة ورُدّت إلى المدير: 2') && !text().includes('الطابور'), 'F3: المركونة «رُدّت إلى المدير» بلا كلمة «الطابور»');
      type(byIdSuffix('-samples')[0], '50');
      type(byIdSuffix('-avg')[0], '1.8');
      await settle();
      const saveButton = () => byAction('weight-save')[0];
      t.ok(text().includes('من 20 إلى 20,000') && saveButton()?.getAttribute('disabled') !== null, 'F3: 1.8 غرام (كيلوغرام بخانة الغرامات) يُمنع قبل الحفظ');
      type(byIdSuffix('-avg')[0], '1800');
      await settle();
      t.ok(!text().includes('من 20 إلى 20,000') && saveButton()?.getAttribute('disabled') === null, 'F3: ضابط: 1800 غرام مقبول');
      await unmount();
    }
  } finally {
    delete globalThis.__farm;
    restore();
  }
}
