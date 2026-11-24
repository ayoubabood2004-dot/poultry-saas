// شاشات الحقول والجولة اليومية: react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل FarmRoutes الحقيقية (وحزمة القاعات الحقيقية لإرسال العلف
// الكسول)، والطابور الحقيقي (saveRound وflush وpendingOps وreviewEntries) ونسخة الجهاز على fake-indexeddb، وrepo الحقول بدائل بس لقراءاته وكتاباته
// وناقله، وإرسال العلف (repo/hallSheet.sendFlockFeed) بديلاً بمحلّله الحقيقي. وناقل الطابور الحقيقي (sendFlockDay) على postgrest-js حقيقي وخادم مزيّف.
// منذ عقد 0036 الجزء R (كلمة المالك 2026-11-24 بصورة الجولة؛ كلّ حالة تفشل على الشفرة قبله):
// N1 لا «كلّ القاعات» (الاختيار و«اصرف للمختارة» و«نفس الرقم») ولا «زيارات اليوم»، و«أضف للقاعة» لكلّ قاعة ورفّ المراجعة باقيان؛
// N2 هلاكات يوم لم تُسجَّل: خانة، والحفظ set_flock_dead (لا زيارة) بلا نسخة؛ N3 سُجّلت (dead_entered، وخادم قبل 0036: في اليوم هلاكات): صندوق مقفول
// برقمها و«سُجّلت هلاكات اليوم» وطريق التصحيح إلى صفحة القاعة، بلا خانة؛ N4 وعملية هلاكات على الجهاز لم تُرفع تقفلها برقمها و«بانتظار الرفع»؛ N5 بطاقات
// العلف بـ«عندك» وآخر علف للقاعة مختار ورقائق الوحدة؛ N6 الإرسال الفوريّ (send_flock_feed ليوم الجولة) وقراءة الجولة بعده، والرفض الأكيد يبقي المكتوب،
// والنتيجة المجهولة تجمّد الطلب بـ«أعد المحاولة» (ولو أُعيد فتح الجولة) ويُعاد بمرجعه نفسه؛ N7 أكثر ممّا عندك: «أرسل» مقفول وسببه؛ N8 بلا نت: مقفول
// وجملته؛ N9 الغاز يُضاف: add_flock_gas بالقناني، و«اليوم» = المسجّل + ما على الجهاز، والصفر والأكثر من 1,000 يُمنعان؛ N10 البيّاض: البيض زيارة بلا
// هلاكات؛ N11 Enter ينقل إلى الخانة نفسها في القاعة التالية ولا يحفظ؛ N12 «احفظ الجولة» بعدد القاعات؛ N13 dead_recorded إلى الرفّ بالرقمين؛ N14 هلاكات
// كُتبت ثمّ سُجّلت قبل الحفظ تُقال ولا تُرسل؛ H العيّنة اليدوية بأشكال العقد (fixtures/round-once.hand.json) بالمحلّلات الحقيقية في الشاشة.
// وما بقي من قبل بعد تكييفه: T1 ناقل الطابور (save_flock_day وsave_flock_visit، ومنذ 0036 set_flock_dead وadd_flock_gas)؛ R2 بلا نت تُحفظ وترتفع لمّا
// يرجع الاتصال؛ R3 stale_visit (بيض البيّاض) وR3b stale_day (عملية قديمة) إلى الرفّ؛ R4 parked إلى الرفّ و«احذفه» بتأكيد؛ R5 الهلاكات فوق الحيّ تُمنع؛
// F1 الحقل؛ V5 فحص الحيّ؛ L5 ما يُكتب أثناء الرفع يبقى؛ L6 عملية هلاكات مجهولة النتيجة لا تُعدّ مرّتين؛ C نتيجة رفع الخلفية تظهر؛ D الرافع على مستوى
// التطبيق وعدّادا الرأس؛ E المشاهد كالمالك (0034)؛ F الكتابة التي لم تُحفظ تعلّم النافذة؛ G وH الرئيسية تحفظ نسخة الجهاز؛ I شرح الآيفون؛ J نوافذ الحقل؛
// S رفض بلا تلميح بجملة فصيحة؛ U الرافع الواحد؛ W «لا أفواج نشطة».
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const HAND = readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-once.hand.json'), 'utf8');
// عيّنات القاعدة الحقيقية (round-once.test بـROUND_ONCE_SAMPLES_OUT=1، يومها المثبَّت 2026-11-24): تكامل 0036، جواب القاعدة بمحلّلات الشاشة الحقيقية.
const REAL36 = readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-once-0036.json'), 'utf8');
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'createHall', 'updateHall', 'archiveHall', 'openFlock', 'recordFlockWeight'];
const STUBS = {
  // loadOverview مثل الحقيقي بالضبط (parseOverview(await loadOverviewJson())) بس عبر البديل، حتى الرئيسية القديمة تقرا من نفس الخادم المزيّف.
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__farm.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__farm.call('loadOverviewJson', []));
    export const flockDayTransport = { currentUserId: async () => globalThis.__farm.userId, send: (op) => globalThis.__farm.send(op), lookup: async () => null };`,
  // إرسال العلف: جواب الخادم المزيّف بمحلّله الحقيقي (parseFeedSent).
  hallSheet: `export * from ${REAL_SHEET}; import { parseFeedSent as __sent } from ${REAL_SHEET};
    export const sendFlockFeed = async (request) => __sent(await globalThis.__farm.call('sendFlockFeed', [request]));`,
  session: 'export const useSession = () => globalThis.__farm.session;',
  Toast: 'export const toast = (spec) => { globalThis.__farm.toasts.push(spec); }; export function Toaster() { return null; }',
  home: 'export const loadHomeSummary = () => globalThis.__farm.call("loadHomeSummary", []);',
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { localDay, addDays } from './src/domain/dates.ts';",
    "export { openOutbox, pendingOps, reviewEntries, saveRound } from './src/lib/outbox/index.ts';",
    "export * as repo from './src/lib/repo/flocks.ts';",
    "export { fmtDay, fmtInt } from './src/lib/format.ts';",
    "export { default as HomePage } from './src/pages/home/HomePage.tsx';",
    "export { StatusChips } from './src/components/shell/StatusChips.tsx';",
    "export { InstallCard } from './src/components/shell/InstallCard.tsx';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { updateStore } from './src/lib/pwa/update.ts';",
    "export { NetworkError, RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
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
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'farm-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/repo\/home$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'farm-stub' }));
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
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const clone = (value) => JSON.parse(JSON.stringify(value));
/** يرمي ويرجّع اسم الخانة، أو «parsed». */
const fieldOf = (fn) => {
  try {
    fn();
    return 'parsed';
  } catch (error) {
    return error?.field ?? `other:${error?.message}`;
  }
};

export default async function (t) {
  // ── T1: ناقل الطابور الحقيقي على خادم PostgREST مزيّف: كلّ جواب ← نتيجة الطابور، ومعاملات كلّ دالّة بأسمائها ─────────────────────
  {
    const savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
    try {
      const { repo: tr } = await transport();
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
      const outcome = async (answer, theOp = op) => {
        server.answer = answer;
        return tr.sendFlockDay(theOp).then((value) => value, (error) => `throw:${error.name}`);
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
      t.same(await outcome({ json: { status: 'parked', reason: 'flock_closed' } }), { kind: 'parked', reason: 'flock_closed' }, 'T1: parked بسببه (0035: يبقى في رفّ الجهاز بسببه)');
      t.same(
        await outcome({ status: 400, json: { code: 'P0001', message: 'eggs_over_live', hint: 'البيض أكثر من الحيّ.', details: null } }),
        { kind: 'rejected', code: 'eggs_over_live', hint: 'البيض أكثر من الحيّ.' },
        'T1: الرفض المقصود برمزه وتلميحه',
      );
      t.same(await outcome({ status: 401, json: { code: 'PGRST301', message: 'JWT expired', hint: null, details: null } }), { kind: 'identity_rejected' }, 'T1: 401 = رفض الهويّة');
      t.same(await outcome({ status: 403, json: { code: '42501', message: 'permission denied for function save_flock_day', hint: null, details: null } }), { kind: 'identity_rejected' }, 'T1: 42501 على الدالّة = رفض الهويّة');
      t.eq(await outcome('network'), 'throw:UnknownOutcomeError', 'T1: انقطاع بعد الإرسال يرمي (النتيجة مجهولة، والطابور يحسمها بنفس المرجع)');
      t.eq(await tr.flockDayTransport.lookup(op), null, 'T1: الحسم بالمرجع = الإرسال نفسه بعد فحص الهويّة');

      // 0032: عملية زيارة تنادي save_flock_visit بمحتواها كاملاً، والجواب بعقده (visit_json وصفّ اليوم).
      const visitOp = { ...op, id: 'op-2', fn: 'save_flock_visit', payload: { visitId: 'v-1', recordedAt: '2026-10-31T06:40:00.000Z', dead: 3, culled: 0, feed_kg: '50.000', eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, void: false }, baseVersion: null };
      const visitJson = { id: 'v-1', flock_id: 'f-1', on: '2026-10-31', recorded_at: '2026-10-31T06:40:00+00:00', dead: 3, culled: 0, feed_kg: '50.000', eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, source: 'visit', version: 1, voided: false, by: 'علي' };
      const dayJson = { on_date: '2026-10-31', version: 6, dead: 5, culled: 0, feed_kg: '170.500', water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null };
      t.same(await outcome({ json: { status: 'saved', visit: visitJson, day: dayJson } }, visitOp), { kind: 'saved', version: 1, visit: visitJson, day: dayJson }, 'T1 زيارة: saved بنسخة الزيارة ومعها الزيارة وصفّ اليوم');
      t.same(server.bodies.at(-1).body, { p_visit: 'v-1', p_flock: 'f-1', p_date: '2026-10-31', p_recorded_at: '2026-10-31T06:40:00.000Z', p_dead: 3, p_culled: 0, p_feed_kg: '50.000', p_eggs_total: null, p_eggs_cracked: null, p_eggs_broken: null, p_note: null, p_base_version: null, p_void: false, p_client_ref: 'op-2', p_queued: true }, 'T1 زيارة: معاملات العقد كلّها');
      t.same(
        [await outcome({ json: { status: 'saved', visit: visitJson } }, visitOp), await outcome({ json: { status: 'stale_visit' } }, visitOp), await outcome({ json: { status: 'stale_day', server: null } }, visitOp)],
        ['throw:FlockShapeError', 'throw:FlockShapeError', 'throw:FlockShapeError'],
        'T1 زيارة: شكل غريب يرمي (يبقى بالطابور)',
      );

      // 0036: هلاكات اليوم مرّة (set_flock_dead) وقناني تُضاف (add_flock_gas): معاملات العقد D2/D3 بأسمائها والمرجع معرّف العملية، والأجوبة صارمة.
      const H = JSON.parse(HAND);
      const deadOp = { ...op, id: 'op-d', fn: 'set_flock_dead', payload: { dead: 5 }, baseVersion: null };
      t.same(await outcome({ json: H.set_flock_dead_saved }, deadOp), { kind: 'saved', version: 1, day: H.set_flock_dead_saved.day }, 'T2: set_flock_dead saved بنسخة صفّ اليوم وصفّه');
      t.same([server.bodies.at(-1).url.endsWith('/rpc/set_flock_dead'), server.bodies.at(-1).body], [true, { p_flock: 'f-1', p_on: '2026-10-31', p_dead: 5, p_client_ref: 'op-d', p_queued: true }], 'T2: set_flock_dead بمعاملات العقد (p_flock وp_on وp_dead وp_client_ref وp_queued)');
      t.same(await outcome({ json: H.set_flock_dead_recorded }, deadOp), { kind: 'dead_recorded', server: H.set_flock_dead_recorded.day }, 'T2: dead_recorded بصفّ اليوم كما هو');
      t.same(await outcome({ json: H.set_flock_dead_parked }, deadOp), { kind: 'parked', reason: 'flock_closed' }, 'T2: set_flock_dead parked بسببه');
      t.same(
        await outcome({ status: 400, json: { code: 'P0001', message: 'live_negative', hint: 'الهلاكات أكثر من الحيّ.', details: null } }, deadOp),
        { kind: 'rejected', code: 'live_negative', hint: 'الهلاكات أكثر من الحيّ.' },
        'T2: رفض set_flock_dead المقصود برمزه وتلميحه',
      );
      t.same(
        [
          await outcome({ json: { status: 'saved' } }, deadOp),
          await outcome({ json: { status: 'saved', day: null } }, deadOp),
          await outcome({ json: { status: 'saved', day: { ...H.set_flock_dead_saved.day, dead_entered: false } } }, deadOp),
          await outcome({ json: { status: 'dead_recorded', day: { ...H.set_flock_dead_saved.day, dead_entered: 'yes' } } }, deadOp),
          await outcome({ json: { status: 'stale_day', server: null } }, deadOp),
        ],
        ['throw:FlockShapeError', 'throw:FlockShapeError', 'throw:FlockShapeError', 'throw:FlockShapeError', 'throw:FlockShapeError'],
        'T2: set_flock_dead بشكل غريب يرمي (بلا صفّ يوم، أو يوم لم يُعلَّم «سُجّلت»، أو حالة غريبة): يبقى بالطابور',
      );
      const gasOp = { ...op, id: 'op-g', fn: 'add_flock_gas', payload: { add: 1 }, baseVersion: null };
      t.same(await outcome({ json: H.add_flock_gas_saved }, gasOp), { kind: 'saved', version: 2, gas: H.add_flock_gas_saved.gas }, 'T2: add_flock_gas saved بنسخة صفّ الغاز وغاز اليوم بعد الإضافة');
      t.same([server.bodies.at(-1).url.endsWith('/rpc/add_flock_gas'), server.bodies.at(-1).body], [true, { p_flock: 'f-1', p_on: '2026-10-31', p_add: 1, p_client_ref: 'op-g', p_queued: true }], 'T2: add_flock_gas بمعاملات العقد');
      t.same(await outcome({ json: H.add_flock_gas_parked }, gasOp), { kind: 'parked', reason: 'period_locked' }, 'T2: add_flock_gas parked بسببه');
      t.same(
        [
          await outcome({ json: { status: 'saved', gas: { on: '2026-10-31', cylinders: null, version: 2 } } }, gasOp),
          await outcome({ json: { status: 'saved', gas: { on: '2026-10-31', cylinders: 1001, version: 2 } } }, gasOp),
          await outcome({ json: { status: 'stale_gas', server: { on: '2026-10-31', cylinders: 2, version: 2 } } }, gasOp),
        ],
        ['throw:FlockShapeError', 'throw:FlockShapeError', 'throw:FlockShapeError'],
        'T2: add_flock_gas بشكل غريب يرمي (لا قناني بعد إضافة، أو فوق 1,000، أو حالة غير حالتيه)',
      );
      t.eq(await tr.flockDayTransport.currentUserId(), 'u-1', 'T1: مستخدم الجلسة');
    } catch (error) {
      t.ok(false, `T1/T2: رمى ${error?.stack ?? error}`);
    } finally {
      delete globalThis.__farmServer;
      if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav);
      else delete globalThis.navigator;
    }
  }

  const restore = installDom();
  let root = null;
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
    const FEED = [
      { item_id: 'i-start', name: 'علف بادئ', base_unit: 'kg', on_hand: '1860.000', units: [{ id: 'u-start', name: 'كيس 50 كغم', base_qty: '50.000000' }] },
      { item_id: 'i-end', name: 'علف ناهي', base_unit: 'kg', on_hand: '950.000', units: [{ id: 'u-end', name: 'كيس 50 كغم', base_qty: '50' }] },
    ];

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
      await settle(80);
      return container;
    };
    const chips = () => all().find((n) => n.id === 'chips')?.textContent ?? '';
    const unmount = async () => {
      if (root) m.flushSync(() => root.unmount());
      root = null;
      body().textContent = '';
      await settle();
    };
    /** كلّ حالة بخطوتها: رميةٌ فيها فشلٌ باسمها (لا تُسقط ما بعدها)، والشاشة تُنزع بعدها دائماً. */
    const step = async (label, fn) => {
      m.onlineStore.set(true);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      m.onlineStore.set(true);
    };
    const queueOf = async (userId = 'u-1') => {
      const db = await m.openOutbox();
      const stamp = { userId, orgId: 'org-1', displayName: 'علي' };
      return { pending: await m.pendingOps(db, stamp), review: await m.reviewEntries(db, stamp) };
    };
    const card = (flockId) => all().find((n) => n.getAttribute('data-flock') === flockId) ?? null;
    const inCard = (flockId, suffix) => (card(flockId) ? descendants(card(flockId)).find((n) => n.id.endsWith(suffix)) ?? null : null);
    const actionIn = (flockId, action) => (card(flockId) ? byAction(action, card(flockId)) : []);
    const textIn = (flockId, action) => actionIn(flockId, action)[0]?.textContent ?? null;
    const statusOf = (flockId) => card(flockId)?.textContent ?? '';
    const save = async (rounds = 120) => {
      fire(byAction('round-save')[0] ?? body(), 'click');
      await settle(rounds);
    };

    /**
     * خادم صغير بقواعد العقد: set_flock_dead مرّة لليوم (سُجّلت بالرقم نفسه saved بلا كتابة، وبغيره dead_recorded، ولا يُضاف أبداً)، وadd_flock_gas يضيف،
     * وزيارة البيض تُضاف، وsend_flock_feed يصرف من «عندك»؛ والقراءة (flocks_overview) بمفاتيح 0036 من حاله.
     */
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
        overview: () => ({
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
          if (op.fn === 'save_flock_visit') {
            row.day = { ...(row.day ?? { version: 0, dead: 0, culled: 0, entered: false }), eggs: (row.day?.eggs ?? 0) + (op.payload.eggs_total ?? 0), version: (row.day?.version ?? 0) + 1 };
            return { kind: 'saved', version: 1, visit: null, day: dayOf(row) };
          }
          return { kind: 'saved', version: 1 };
        },
        /** send_flock_feed: يصرف من «عندك» ويضيف إلى علف يوم الفوج؛ الأكثر يُرفض. */
        sendFeed(request) {
          const item = feed.find((entry) => entry.item_id === request.itemId);
          const kg = Number(request.qty / 1000n);
          const have = Number(item.on_hand.split('.')[0]);
          if (kg > have) throw new m.RejectedError('insufficient_stock', 'لا يكفي «رصيد العلف».');
          item.on_hand = `${have - kg}.000`;
          rows[request.flockId].feed.push({ itemId: item.item_id, name: item.name, kg });
          return { status: 'saved', issue: { id: request.issueId, doc_no: `FI-2026-${String(rows[request.flockId].feed.length).padStart(4, '0')}`, item_id: item.item_id, item_name: item.name, qty: `${kg}.000`, unit: 'kg', issued_on: TODAY, for_day: request.forDay }, day: { on: request.forDay, feed_kg: `${kg}.000` } };
        },
      };
    };
    const owner = (userId) => ({ status: 'ready', workspace: ws({ userId }), offline: false });
    const roundWith = (server, userId, extra = {}) => fresh(owner(userId), { loadOverviewJson: () => server.overview(), sendFlockFeed: (request) => server.sendFeed(request), ...extra }, (op) => server.send(op));

    // ── N1: «كلّ القاعات» و«زيارات اليوم» خرجتا من الجولة؛ «أضف للقاعة» لكلّ قاعة ورفّ المراجعة باقيان ──────────────────────────────
    await step('N1', async () => {
      const server = makeServer();
      roundWith(server, 'u-n1');
      await mount('/broiler/round');
      t.ok(Boolean(card('f-a')) && Boolean(card('f-b')), 'N1 ضابط: بطاقة لكلّ قاعة قائمة');
      t.same(
        [byAction('round-picks').length, byAction('round-pick-all').length, byAction('round-pick').length, byAction('round-give-picked').length, byAction('round-same').length, byAction('round-same-value').length, byAction('round-visits').length],
        [0, 0, 0, 0, 0, 0, 0],
        'N1 لا بطاقة «كلّ القاعات» (الاختيار و«اصرف للمختارة» و«نفس الرقم») ولا «زيارات اليوم»',
      );
      t.same(
        [text().includes('كلّ القاعات'), text().includes('اصرف من المخزن للقاعات المختارة'), text().includes('نفس الرقم لكلّ القاعات'), text().includes('طبّق على المختارة'), text().includes('زيارات اليوم')],
        [false, false, false, false, false],
        'N1 ولا نصوصها',
      );
      t.same(byAction('round-give').map((n) => n.getAttribute('href')), ['f-a', 'f-b'].map((id) => `/halls/give/${id}?back=%2Fbroiler%2Fround`), 'N1 «أضف للقاعة» (الدواء والعلف) لكلّ قاعة بالرجوع إلى الجولة');
      t.same(byAction('round-sections').length, 2, 'N1 أقسام بطاقة لكلّ قاعة (الهلاكات والعلف والغاز)');
    });

    // ── N2: هلاكات يوم لم تُسجَّل: خانة «هلاكات اليوم»، والحفظ عملية set_flock_dead (لا زيارة) بلا نسخة، ثمّ تُقفل ──────────────────
    await step('N2', async () => {
      const server = makeServer();
      const { sent, calls } = roundWith(server, 'u-n2');
      await mount('/broiler/round');
      t.same([Boolean(inCard('f-a', '-dead')), Boolean(inCard('f-b', '-dead')), actionIn('f-a', 'round-dead-locked').length], [true, true, 0], 'N2 ضابط: لا هلاكات اليوم: خانة لكلّ قاعة بلا صندوق مقفول');
      t.same([byIdSuffix('-culled').length, byIdSuffix('-feedKg').length, byIdSuffix('-waterL').length, text().includes('المستبعد'), text().includes('الماء')], [0, 0, 0, false, false], 'N2 لا مستبعد ولا علف مأكول ولا ماء في الجولة');
      type(inCard('f-b', '-dead'), '5');
      await settle();
      await save();
      t.same(sent.map((op) => [op.fn, op.flockId, op.day, op.baseVersion, op.payload]), [['set_flock_dead', 'f-b', TODAY, null, { dead: 5 }]], 'N2 عملية set_flock_dead واحدة بالعدد كما كُتب، بلا نسخة (لا زيارة)');
      t.ok(statusOf('f-b').includes('حُفظت') && text().includes('حُفظ 1 من 1'), 'N2 «حُفظت» و«حُفظ 1 من 1»');
      t.same([(await queueOf('u-n2')).pending.length, calls.filter(([name]) => name === 'loadOverviewJson').length >= 2], [0, true], 'N2 الطابور فارغ والجولة قُرئت من جديد');
      t.same([Boolean(inCard('f-b', '-dead')), textIn('f-b', 'round-dead-value'), textIn('f-b', 'round-dead-locked')?.includes('سُجّلت هلاكات اليوم')], [false, '5', true], 'N2 بعد الحفظ تُقفل الهلاكات برقمها (لا خانة)');
      // R1z: «زرت القاعة ولا هلاكات» — الصفر المكتوب يُسجَّل مرّةً ويُقفل.
      type(inCard('f-a', '-dead'), '0');
      await settle();
      await save();
      t.same([sent.at(-1)?.fn, sent.at(-1)?.payload, textIn('f-a', 'round-dead-value')], ['set_flock_dead', { dead: 0 }, '0'], 'N2 الصفر المكتوب هلاكات اليوم (لا هلاكات) ويُقفل بصفر');
    });

    // ── N3: سُجّلت هلاكات اليوم: صندوق مقفول برقمها (النافق والمستبعد القديم معاً) و«سُجّلت هلاكات اليوم» وطريق التصحيح، بلا خانة؛ وخادم قبل 0036 بالهجرة ──
    await step('N3', async () => {
      const server = makeServer({ 'f-a': { day: { version: 3, dead: 3, culled: 1, entered: true }, gas: null, feed: [] }, 'f-b': { day: { version: 1, dead: 0, culled: 0, entered: false }, gas: null, feed: [] } });
      const { sent } = roundWith(server, 'u-n3');
      await mount('/broiler/round');
      const box = actionIn('f-a', 'round-dead-locked')[0];
      t.same([Boolean(inCard('f-a', '-dead')), textIn('f-a', 'round-dead-value'), Boolean(box?.textContent.includes('سُجّلت هلاكات اليوم'))], [false, '4', true], 'N3 dead_entered: بلا خانة، والصندوق برقمها 4 (3 + مستبعد قديم 1) و«سُجّلت هلاكات اليوم»');
      const fix = actionIn('f-a', 'round-dead-fix')[0];
      t.same([fix?.getAttribute('href'), fix?.textContent, box?.textContent.includes('للتصحيح:')], ['/broiler/hall/h-1', 'صفحة القاعة ← ✎ تعديل', true], 'N3 «للتصحيح: صفحة القاعة ← ✎ تعديل» رابطاً إلى صفحة القاعة');
      t.same([Boolean(inCard('f-b', '-dead')), actionIn('f-b', 'round-dead-locked').length], [true, 0], 'N3 dead_entered: false بلا هلاكات: خانة');
      type(inCard('f-b', '-dead'), '2');
      await settle();
      t.eq(byAction('round-save')[0]?.textContent, 'احفظ الجولة لـ«قاعة 2»', 'N3 القاعة المقفولة لا تدخل الحفظ');
      await save();
      t.same(sent.map((op) => [op.fn, op.flockId]), [['set_flock_dead', 'f-b']], 'N3 لا عملية هلاكات للمقفولة');
      await unmount();
      // خادم قبل 0036 (أو نسخة جهاز منه) بلا dead_entered: «سُجّلت» = في اليوم هلاكات، كما ملأته الهجرة.
      const old = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: dayRow({ version: 4, dead: 2 }) })), hall('h-2', 'قاعة 2', flock('f-b', 'broiler', { today: dayRow({ version: 1, dead: 0, note: 'تهوية' }) }))])] });
      fresh(owner('u-n3b'), { loadOverviewJson: old });
      await mount('/broiler/round');
      t.same([Boolean(inCard('f-a', '-dead')), textIn('f-a', 'round-dead-value'), Boolean(inCard('f-b', '-dead'))], [false, '2', true], 'N3 بلا dead_entered: يوم فيه هلاكات مقفول، ويوم بلا هلاكات خانة');
      t.same([byAction('round-feed-item').length, textIn('f-a', 'round-gas-today')], [0, 'اليوم: لم يُسجَّل غاز'], 'N3 وبلا مفاتيح 0036: لا بطاقات علف ولا غاز اليوم');
    });

    // ── N4: عملية هلاكات على هذا الجهاز لم تُرفع تقفل اليوم برقمها و«بانتظار الرفع»؛ وتُعدّ مرّة ──────────────────────────────────────
    await step('N4', async () => {
      const server = makeServer();
      const { sent } = roundWith(server, 'u-n4');
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-a', '-dead'), '6');
      await settle();
      await save(80);
      t.same([sent.length, (await queueOf('u-n4')).pending.map((op) => [op.fn, op.payload.dead])], [0, [['set_flock_dead', 6]]], 'N4 ضابط: بلا نت بالطابور ولا إرسال');
      t.same([Boolean(inCard('f-a', '-dead')), textIn('f-a', 'round-dead-value'), actionIn('f-a', 'round-dead-pending').length, actionIn('f-a', 'round-dead-locked')[0]?.getAttribute('data-pending')], [false, '6', 1, 'true'], 'N4 مقفولة برقم العملية المنتظرة و«بانتظار الرفع»');
      await unmount();
      // فتح الجولة من جديد والعملية ما زالت على الجهاز: مقفولة أيضاً.
      const again = roundWith(server, 'u-n4');
      globalThis.__farm.userId = 'someone-else'; // لا رفع
      await mount('/broiler/round');
      t.same([Boolean(inCard('f-a', '-dead')), textIn('f-a', 'round-dead-value')], [false, '6'], 'N4 وبعد إعادة الفتح ما دامت العملية على الجهاز');
      globalThis.__farm.userId = 'u-n4';
      m.onlineStore.set(true);
      await settle(150);
      t.same([[...sent, ...again.sent].map((op) => op.payload.dead), (await queueOf('u-n4')).pending.length, textIn('f-a', 'round-dead-value'), actionIn('f-a', 'round-dead-pending').length], [[6], 0, '6', 0], 'N4 رجع الاتصال: ارتفعت مرّة، وبقيت مقفولة برقمها من الخادم بلا «بانتظار الرفع»');
    });

    // ── N5: بطاقات العلف من «رصيد العلف» بـ«عندك»، وآخر علف للقاعة مختار، ورقائق الوحدة (الكيس ثمّ الكيلو)، و«أُرسل اليوم» فوقها ─────────
    await step('N5', async () => {
      const server = makeServer({ 'f-a': { day: null, gas: null, feed: [{ itemId: 'i-end', name: 'علف ناهي', kg: 50 }] }, 'f-b': { day: null, gas: null, feed: [], last: null } });
      roundWith(server, 'u-n5');
      await mount('/broiler/round', {});
      await settle(60);
      const items = (flockId) => actionIn(flockId, 'round-feed-item').map((n) => [n.getAttribute('data-item'), n.textContent, n.getAttribute('aria-checked')]);
      t.same(items('f-a'), [['i-start', 'علف بادئعندك 1,860 كغم', 'false'], ['i-end', 'علف ناهيعندك 950 كغم', 'true']], 'N5 بطاقة لكلّ علف باسمه و«عندك» بفواصل، وآخر علف أُرسل للقاعة مختار');
      t.same(items('f-b').map(([id, , checked]) => [id, checked]), [['i-start', 'true'], ['i-end', 'false']], 'N5 قاعة بلا علف سابق: الأوّل مختار');
      t.same(actionIn('f-a', 'round-feed-unit').map((n) => [n.textContent, n.getAttribute('aria-checked')]), [['كيس 50 كغم', 'true'], ['كغم', 'false']], 'N5 رقائق الوحدة: الكيس أوّلاً (مختار) ثمّ وحدة الأساس');
      t.same([textIn('f-a', 'round-feed-today'), textIn('f-b', 'round-feed-today')], ['أُرسل اليوم: 50 كغم«علف ناهي»: 50 كغم', 'لم يُرسل علف اليوم بعد.'], 'N5 «أُرسل اليوم» بمجموعه وسطر لكلّ مادّة فوق البطاقات');
      t.same([byAction('round-feed-send')[0]?.textContent, byAction('round-feed-send')[0]?.hasAttribute('disabled')], ['أرسل', true], 'N5 «أرسل» مقفول قبل الكمية');
    });

    // ── N6: الإرسال فوريّ (send_flock_feed ليوم الجولة) بالكيس، والجولة تُقرأ بعده؛ والرفض الأكيد يبقي المكتوب؛ والنتيجة المجهولة تُجمَّد وتُعاد بمرجعها ──
    await step('N6', async () => {
      const server = makeServer();
      const { calls } = roundWith(server, 'u-n6');
      await mount('/broiler/round');
      await settle(60);
      fire(actionIn('f-a', 'round-feed-item').find((n) => n.getAttribute('data-item') === 'i-end') ?? body(), 'click');
      await settle();
      type(actionIn('f-a', 'round-feed-qty')[0], '2');
      await settle();
      t.same([textIn('f-a', 'round-feed-base'), textIn('f-a', 'round-feed-send')], ['= 100 كغم', 'أرسل 100 كغممن «علف ناهي»'], 'N6 كيسان = 100 كغم، و«أرسل 100 كغم» وتحته «من «علف ناهي»»');
      const reads = calls.filter(([name]) => name === 'loadOverviewJson').length;
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(120);
      const [request] = calls.filter(([name]) => name === 'sendFlockFeed').map(([, args]) => args[0]);
      t.same([request?.flockId, request?.itemId, request?.qty, request?.forDay, typeof request?.clientRef], ['f-a', 'i-end', 100000n, TODAY, 'string'], 'N6 send_flock_feed للقاعة والعلف والكمية بوحدة الأساس ليوم الجولة');
      t.same([globalThis.__farm.toasts.at(-1)?.tone, globalThis.__farm.toasts.at(-1)?.title], ['success', `أُرسل 100 كغم من «علف ناهي» ليوم ${m.fmtDay(TODAY)} (FI-2026-0001).`], 'N6 تنبيه النجاح بمستنده');
      t.ok(calls.filter(([name]) => name === 'loadOverviewJson').length > reads, 'N6 الجولة تُقرأ من جديد بعد الإرسال');
      t.same([actionIn('f-a', 'round-feed-qty')[0]?.value, textIn('f-a', 'round-feed-today'), actionIn('f-a', 'round-feed-item').find((n) => n.getAttribute('data-item') === 'i-end')?.textContent], ['', 'أُرسل اليوم: 100 كغم«علف ناهي»: 100 كغم', 'علف ناهيعندك 850 كغم'], 'N6 الخانة فرغت، و«أُرسل اليوم» و«عندك» من القراءة الجديدة');
      // رفض أكيد: المكتوب باقٍ والجملة تحت الزرّ، ولا تجميد.
      globalThis.__farm.call = ((original) => (name, args) => (name === 'sendFlockFeed' ? Promise.reject(new m.RejectedError('period_locked', 'اليوم في فترة مقفلة.')) : original(name, args)))(globalThis.__farm.call);
      type(actionIn('f-b', 'round-feed-qty')[0], '1');
      await settle();
      fire(actionIn('f-b', 'round-feed-send')[0] ?? body(), 'click');
      await settle(80);
      t.same([textIn('f-b', 'round-feed-error'), actionIn('f-b', 'round-feed-qty')[0]?.value, actionIn('f-b', 'round-feed-pending').length], ['اليوم في فترة مقفلة.', '1', 0], 'N6 الرفض الأكيد: تلميح الخادم، والمكتوب باقٍ، ولا طلب مجمَّد');
    });
    await step('N6 مجهولة', async () => {
      const server = makeServer();
      let fail = true;
      const sends = [];
      const feedOnce = (request) => {
        sends.push(request);
        return fail ? Promise.reject(new m.UnknownOutcomeError()) : server.sendFeed(request);
      };
      roundWith(server, 'u-n6b', { sendFlockFeed: feedOnce });
      await mount('/broiler/round');
      await settle(60);
      type(actionIn('f-b', 'round-feed-qty')[0], '3');
      await settle();
      fire(actionIn('f-b', 'round-feed-send')[0] ?? body(), 'click');
      await settle(80);
      const pending = textIn('f-b', 'round-feed-pending');
      t.ok(Boolean(pending?.includes(`علف يوم ${m.fmtDay(TODAY)} لم يُعرف مصيره`) && pending.includes('150 كغم من «علف بادئ»') && pending.includes('أعد المحاولة')), `N6 مجهولة: الطلب مجمَّد بيومه وكميته ومادّته و«أعد المحاولة» (${pending})`);
      t.same([actionIn('f-b', 'round-feed-item').length, actionIn('f-b', 'round-feed-send').length, m.isWindowDirty()], [0, 0, true], 'N6 مجهولة: لا بطاقات ولا إرسال آخر حتى يُعرف مصيره، والنافذة «فيها ما لم يُحفظ»');
      await unmount();
      // إعادة فتح الجولة: الطلب المجمَّد باقٍ (خارج المكوّن)، و«أعد المحاولة» ترسله بمرجعه نفسه.
      roundWith(server, 'u-n6b', { sendFlockFeed: feedOnce });
      await mount('/broiler/round');
      await settle(60);
      t.ok(Boolean(textIn('f-b', 'round-feed-pending')), 'N6 مجهولة: بعد إعادة الفتح ما زال مجمَّداً');
      fail = false;
      fire(actionIn('f-b', 'round-feed-retry')[0] ?? body(), 'click');
      await settle(120);
      t.same(
        [globalThis.__farm.toasts.at(-1)?.tone, textIn('f-b', 'round-feed-pending'), actionIn('f-b', 'round-feed-item').length > 0, sends.length, sends[1]?.clientRef === sends[0]?.clientRef],
        ['success', null, true, 2, true],
        'N6 مجهولة: «أعد المحاولة» بعد إعادة الفتح أرسل الطلب نفسه (مرجعه) فحُفظ، وعادت البطاقات',
      );
    });
    await step('N6 المرجع نفسه', async () => {
      const server = makeServer();
      const seen = [];
      let fail = true;
      roundWith(server, 'u-n6c', {
        sendFlockFeed: (request) => {
          seen.push(request);
          return fail ? Promise.reject(new m.UnknownOutcomeError()) : server.sendFeed(request);
        },
      });
      await mount('/broiler/round');
      await settle(60);
      type(actionIn('f-a', 'round-feed-qty')[0], '1');
      await settle();
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(80);
      fail = false;
      fire(actionIn('f-a', 'round-feed-retry')[0] ?? body(), 'click');
      await settle(120);
      t.same([seen.length, seen[1]?.clientRef === seen[0]?.clientRef, seen[1]?.issueId === seen[0]?.issueId, seen[1]?.lineId === seen[0]?.lineId, seen[1]?.qty], [2, true, true, true, 50000n], 'N6 «أعد المحاولة» يرسل الطلب حرفاً (المرجع والمعرّفات والكمية): لن يُصرف مرّتين');
    });

    // ── N7: أكثر ممّا عندك: «أرسل» مقفول وسطره الثاني «أكثر ممّا عندك»، والجملة وهو يُكتب ───────────────────────────────────────────
    await step('N7', async () => {
      const server = makeServer();
      const { calls } = roundWith(server, 'u-n7');
      await mount('/broiler/round');
      await settle(60);
      fire(actionIn('f-a', 'round-feed-item').find((n) => n.getAttribute('data-item') === 'i-end') ?? body(), 'click');
      await settle();
      type(actionIn('f-a', 'round-feed-qty')[0], '20');
      await settle();
      const button = actionIn('f-a', 'round-feed-send')[0];
      t.same([button?.hasAttribute('disabled'), button?.textContent, textIn('f-a', 'round-feed-over')], [true, 'أرسل 1,000 كغمأكثر ممّا عندك: 950 كغم', 'أكثر ما يُرسل من «علف ناهي» مرّة واحدة 950 كغم.'], 'N7 عشرون كيساً (1,000 كغم) فوق 950: مقفول وسببه في سطره الثاني والجملة');
      fire(button ?? body(), 'click');
      fire(actionIn('f-a', 'round-feed-qty')[0] ?? body(), 'keydown', { key: 'Enter' });
      await settle(40);
      t.eq(calls.filter(([name]) => name === 'sendFlockFeed').length, 0, 'N7 لا إرسال بالنقر ولا بـEnter');
      type(actionIn('f-a', 'round-feed-qty')[0], '19');
      await settle();
      t.eq(actionIn('f-a', 'round-feed-send')[0]?.hasAttribute('disabled'), false, 'N7 ضابط: 950 كغم بالضبط يُرسل');
      type(actionIn('f-a', 'round-feed-qty')[0], '1.2.3');
      await settle();
      t.same([textIn('f-a', 'round-feed-bad'), actionIn('f-a', 'round-feed-send')[0]?.hasAttribute('disabled')], ['اكتب كمية صحيحة بثلاث مراتب عشرية على الأكثر، مثل 1250.5.', true], 'N7 كمية غير صحيحة تُقال، و«أرسل» مقفول');
    });

    // ── N8: بلا نت: «أرسل» مقفول وجملته، والجولة نفسها تُحفظ على الجهاز ────────────────────────────────────────────────────────────
    await step('N8', async () => {
      const server = makeServer();
      const { calls } = roundWith(server, 'u-n8');
      await mount('/broiler/round');
      await settle(60);
      m.onlineStore.set(false);
      await settle();
      type(actionIn('f-a', 'round-feed-qty')[0], '1');
      await settle();
      t.same(
        [actionIn('f-a', 'round-feed-send')[0]?.hasAttribute('disabled'), textIn('f-a', 'round-feed-offline')],
        [true, 'إرسال العلف يحتاج اتصالاً بالإنترنت: يخرج من «رصيد العلف» لحظة الإرسال. أرسله حين يعود الاتصال.'],
        'N8 بلا نت: «أرسل» مقفول وجملته في القسم',
      );
      fire(actionIn('f-a', 'round-feed-send')[0] ?? body(), 'click');
      await settle(40);
      t.eq(calls.filter(([name]) => name === 'sendFlockFeed').length, 0, 'N8 لا إرسال بلا نت');
    });

    // ── N9: الغاز يُضاف إلى مجموع اليوم (add_flock_gas)، و«اليوم» = المسجّل + ما على الجهاز؛ والصفر وما يتجاوز 1,000 يُمنعان قبل الحفظ ──────────
    await step('N9', async () => {
      const server = makeServer({ 'f-a': { day: null, gas: { cylinders: 2, version: 1 }, feed: [] } });
      const { sent } = roundWith(server, 'u-n9');
      await mount('/broiler/round');
      t.same([textIn('f-a', 'round-gas-today'), textIn('f-b', 'round-gas-today'), Boolean(inCard('f-a', '-gas'))], ['اليوم: قنينتان', 'اليوم: لم يُسجَّل غاز', true], 'N9 «قناني أُرسلت الآن» خانة، وتحتها مجموع اليوم من الخادم');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-a', '-gas'), '1');
      await settle();
      t.eq(byAction('round-save')[0]?.textContent, 'احفظ الجولة لـ«قاعة 1»', 'N9 الغاز وحده يكفي للحفظ');
      await save(80);
      t.same((await queueOf('u-n9')).pending.map((op) => [op.fn, op.payload, op.baseVersion]), [['add_flock_gas', { add: 1 }, null]], 'N9 بلا نت: عملية add_flock_gas بالقناني، بلا نسخة');
      t.same([inCard('f-a', '-gas')?.value, textIn('f-a', 'round-gas-today'), actionIn('f-a', 'round-gas-pending').length], ['', 'اليوم: 3 قناني', 1], 'N9 الخانة فرغت، و«اليوم: 3 قناني» (2 + 1 على الجهاز) و«ينتظر الرفع»');
      type(inCard('f-a', '-gas'), '2');
      await settle();
      await save(80);
      t.same([(await queueOf('u-n9')).pending.map((op) => op.payload.add), textIn('f-a', 'round-gas-today')], [[3], 'اليوم: 5 قناني'], 'N9 إضافة ثانية قبل الرفع تُجمع في العملية نفسها (3)، و«اليوم: 5 قناني»');
      m.onlineStore.set(true);
      await settle(150);
      t.same([sent.map((op) => [op.fn, op.payload.add]), server.rows['f-a'].gas.cylinders, textIn('f-a', 'round-gas-today')], [[['add_flock_gas', 3]], 5, 'اليوم: 5 قناني'], 'N9 رجع الاتصال: إضافة واحدة بثلاث قناني، ومجموع الخادم 5');
      type(inCard('f-b', '-gas'), '0');
      await settle();
      await save(60);
      t.same([textIn('f-b', 'round-error'), sent.length], ['اكتب عدد القناني: من 1 إلى 1,000، أو اترك الخانة فارغة.', 1], 'N9 الصفر يُمنع قبل الحفظ');
      type(inCard('f-a', '-gas'), '996');
      await settle();
      await save(60);
      t.same([textIn('f-a', 'round-error'), sent.length], ['مجموع غاز اليوم لا يتجاوز 1,000 قنينة، والمسجّل الآن 5.', 1], 'N9 مجموع اليوم فوق 1,000 يُمنع قبل الحفظ ويسمّي المسجّل');
      type(inCard('f-a', '-gas'), '995');
      type(inCard('f-b', '-gas'), '');
      await settle();
      await save(120);
      t.same(sent.map((op) => op.payload.add), [3, 995], 'N9 ضابط: 5 + 995 = 1,000 يُقبل');
    });

    // ── N10: البيّاض: البيض زيارة تُضاف بلا هلاكات، والهلاكات عمليتها مرّة؛ وبيض فوق الحيّ يُمنع ────────────────────────────────────
    await step('N10', async () => {
      const layers = () => ({ today: TODAY, sites: [site('s-2', 'layer', [hall('h-9', 'قاعة البيّاض', flock('f-l', 'layer', { live: 1000, live_start_today: 1000, fcr: null, today: dayRow({ eggs_total: 400, dead_entered: false }) }))])], feed_items: [] });
      const { sent } = fresh(owner('u-n10'), { loadOverviewJson: layers });
      await mount('/layers/round');
      t.same([Boolean(inCard('f-l', '-eggsTotal')), Boolean(inCard('f-l', '-eggsBroken')), descendants(card('f-l') ?? body()).filter((n) => n.getAttribute('data-action') === 'round-so-far').map((n) => n.textContent)], [true, true, ['اليوم حتى الآن: 400', 'اليوم حتى الآن: —']], 'N10 خانتا البيض و«اليوم حتى الآن»');
      type(inCard('f-l', '-eggsTotal'), '700');
      await settle();
      await save(60);
      t.same([sent.length, textIn('f-l', 'round-error')], [0, 'البيض أكثر من الدجاج الحيّ بداية اليوم (1,000)، والنسبة فوق 100% غلط إدخال.'], 'N10 400 + 700 فوق الحيّ (1,000): يُمنع');
      type(inCard('f-l', '-eggsTotal'), '550');
      type(inCard('f-l', '-eggsBroken'), '20');
      type(inCard('f-l', '-dead'), '3');
      await settle();
      await save(120);
      const visit = sent.find((op) => op.fn === 'save_flock_visit');
      t.same(sent.map((op) => op.fn), ['set_flock_dead', 'save_flock_visit'], 'N10 الهلاكات عمليتها، والبيض زيارة بعدها');
      t.same([visit?.payload.dead, visit?.payload.culled, visit?.payload.feed_kg, visit?.payload.eggs_total, visit?.payload.eggs_broken, visit?.baseVersion], [null, null, null, 550, 20, null], 'N10 زيارة البيض بلا هلاكات ولا علف، بالبيض والمكسور، بلا نسخة');
    });

    // ── N11: Enter في خانة ينقل إلى الخانة نفسها في القاعة التالية (التي فيها الخانة)، ولا يحفظ ─────────────────────────────────────
    await step('N11', async () => {
      const three = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler')), hall('h-2', 'قاعة 2', flock('f-b', 'broiler', { today: dayRow({ version: 2, dead: 4, dead_entered: true }) })), hall('h-4', 'قاعة 4', flock('f-c', 'broiler'))])], feed_items: [] });
      const { sent } = fresh(owner('u-n11'), { loadOverviewJson: three });
      await mount('/broiler/round');
      type(inCard('f-a', '-dead'), '1');
      await settle();
      const enter = fire(inCard('f-a', '-dead') ?? body(), 'keydown', { key: 'Enter' });
      await settle(40);
      t.same([globalThis.document.activeElement === inCard('f-c', '-dead'), enter.defaultPrevented, sent.length, (await queueOf('u-n11')).pending.length], [true, true, 0, 0], 'N11 Enter في هلاكات قاعة 1 ← هلاكات قاعة 4 (قاعة 2 مقفولة)، بلا حفظ');
      fire(inCard('f-a', '-gas') ?? body(), 'keydown', { key: 'Enter' });
      await settle();
      t.eq(globalThis.document.activeElement === inCard('f-b', '-gas'), true, 'N11 Enter في غاز قاعة 1 ← غاز قاعة 2');
      fire(inCard('f-c', '-gas') ?? body(), 'keydown', { key: 'Enter' });
      await settle();
      t.same([globalThis.document.activeElement === inCard('f-b', '-gas'), sent.length], [true, 0], 'N11 في آخر قاعة لا ينتقل ولا يحفظ');
      const mode = (input) => input?.getAttribute('inputMode') ?? input?.getAttribute('inputmode') ?? null;
      t.same([mode(inCard('f-a', '-dead')), mode(inCard('f-a', '-gas'))], ['numeric', 'numeric'], 'N11 الخانات inputMode رقميّ');
    });

    // ── N12: «احفظ الجولة» معطّل بلا شيء يُرسل ويسمّي عدد القاعات ─────────────────────────────────────────────────────────────
    await step('N12', async () => {
      const three = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler')), hall('h-2', 'قاعة 2', flock('f-b', 'broiler')), hall('h-4', 'قاعة 4', flock('f-c', 'broiler'))])], feed_items: [] });
      fresh(owner('u-n12'), { loadOverviewJson: three });
      await mount('/broiler/round');
      t.same([byAction('round-save')[0]?.textContent, byAction('round-save')[0]?.hasAttribute('disabled')], ['احفظ الجولة', true], 'N12 بلا أرقام: «احفظ الجولة» معطّل');
      type(inCard('f-a', '-dead'), '1');
      type(inCard('f-b', '-gas'), '1');
      await settle();
      t.eq(byAction('round-save')[0]?.textContent, 'احفظ الجولة لقاعتين', 'N12 «احفظ الجولة لقاعتين»');
      type(inCard('f-c', '-dead'), '2');
      await settle();
      t.eq(byAction('round-save')[0]?.textContent, 'احفظ الجولة لـ3 قاعات', 'N12 «احفظ الجولة لـ3 قاعات»');
      // الزرّ الثابت فوق الشريط السفليّ للهاتف (كان bottom-4 فيختفي تحت BottomBar الثابت)، وبالحاسوب على بُعد 1rem: أنماط round.css الكسولة.
      const css = (() => {
        try {
          return readFileSync(path.join(ROOT, 'src', 'pages', 'farm', 'round.css'), 'utf8').replace(/\s+/gu, ' ');
        } catch {
          return '';
        }
      })();
      const bar = byAction('round-save')[0]?.parentNode;
      t.same(
        [bar?.getAttribute('class')?.split(' ').includes('round-save'), bar?.getAttribute('class')?.split(' ').includes('bottom-4'), css.includes('.round-save { bottom: calc(4.5rem + env(safe-area-inset-bottom)); }'), /@media \(min-width: 768px\) \{ \.round-save \{ bottom: 1rem; \} \}/u.test(css)],
        [true, false, true, true],
        'N12 «احفظ الجولة» ثابت فوق الشريط السفليّ للهاتف (4.5rem وحافّة الجهاز) وعلى بُعد 1rem بالحاسوب',
      );
    });

    // ── N13: dead_recorded (سُجّلت من جهاز آخر قبل أن تصل): الرفّ بـ«الهلاكات» وما كتبته وما سُجّل، وجملته ────────────────────────────
    await step('N13', async () => {
      const server = makeServer();
      const { sent } = roundWith(server, 'u-n13');
      await mount('/broiler/round');
      type(inCard('f-a', '-dead'), '7');
      await settle();
      // جهاز آخر سجّل هلاكات اليوم (4 + مستبعد قديم 1) قبل أن تصل.
      server.rows['f-a'].day = { version: 2, dead: 4, culled: 1, entered: true };
      await save(150);
      const { pending, review } = await queueOf('u-n13');
      t.same([sent.map((op) => op.fn), pending.length, review.map((entry) => [entry.reason, entry.op.fn, entry.op.payload.dead])], [['set_flock_dead'], 0, [['dead_recorded', 'set_flock_dead', 7]]], 'N13 dead_recorded: خرجت إلى رفّ المراجعة بسببها');
      t.ok(statusOf('f-a').includes('راجعها في «جولات تحتاج مراجعة»') && text().includes('راجع: قاعة 1'), 'N13 القاعة تقول راجعها');
      const shelf = all().find((n) => n.getAttribute('data-review') !== null);
      const cells = shelf ? descendants(shelf).filter((n) => n.localName === 'td').map((n) => n.textContent) : [];
      t.ok(Boolean(shelf?.textContent.includes('سُجّلت هلاكات هذا اليوم من جهاز آخر: 5') && shelf.textContent.includes('هلاكات اليوم')), `N13 الرفّ: «سُجّلت هلاكات هذا اليوم من جهاز آخر: 5» (${shelf?.textContent})`);
      t.same(cells, ['الهلاكات', '7', '5'], 'N13 صفّ الرفّ: الخانة «الهلاكات» وما كتبته (7) وما سُجّل (5)');
      t.same([textIn('f-a', 'round-dead-value'), Boolean(inCard('f-a', '-dead'))], ['5', false], 'N13 والقاعة مقفولة بما سُجّل (لا يُضاف إليه)');
    });

    // ── N14: هلاكات كُتبت ثمّ سُجّلت قبل الحفظ: تُقال ولا تُرسل، و«حسناً» يمسحها ─────────────────────────────────────────────────────
    await step('N14', async () => {
      const server = makeServer();
      const { sent } = roundWith(server, 'u-n14');
      await mount('/broiler/round');
      type(inCard('f-a', '-dead'), '9');
      type(inCard('f-b', '-gas'), '1');
      await settle();
      // رفعٌ من شاشة أخرى يعيد قراءة الجولة وقد سُجّلت هلاكات قاعة 1.
      server.rows['f-a'].day = { version: 1, dead: 3, culled: 0, entered: true };
      m.roundQueueStore.set((state) => ({ ...state, seq: state.seq + 1 }));
      await settle(80);
      t.same([textIn('f-a', 'round-dead-value'), textIn('f-a', 'round-dead-late')?.startsWith('كتبت «9» ثمّ سُجّلت هلاكات اليوم قبل أن تحفظ'), byAction('round-save')[0]?.textContent], ['3', true, 'احفظ الجولة لـ«قاعة 2»'], 'N14 المكتوب يُقال ولا يُعدّ في الحفظ');
      await save(120);
      t.same(sent.map((op) => [op.fn, op.flockId]), [['add_flock_gas', 'f-b']], 'N14 لا عملية هلاكات لقاعة 1');
      fire(actionIn('f-a', 'round-dead-late-ok')[0] ?? body(), 'click');
      await settle();
      t.same([actionIn('f-a', 'round-dead-late').length, m.isWindowDirty()], [0, false], 'N14 «حسناً» يمسحه والنافذة نظيفة');
    });

    // ── H: العيّنة اليدوية بأشكال العقد (fixtures/round-once.hand.json) بالمحلّلات الحقيقية في الجولة ───────────────────────────────────
    await step('H', async () => {
      const shifted = (key) => JSON.parse(HAND.replaceAll('2026-11-24', TODAY).replaceAll('2026-11-13', m.addDays(TODAY, -11)))[key];
      fresh(owner('u-h'), { loadOverviewJson: () => shifted('flocks_overview_broiler') });
      const F1 = '0036a000-0000-4000-8000-0000000000f1';
      const F2 = '0036a000-0000-4000-8000-0000000000f2';
      const F3 = '0036a000-0000-4000-8000-0000000000f3';
      await mount('/broiler/round');
      await settle(60);
      t.same([textIn(F1, 'round-dead-value'), Boolean(inCard(F1, '-dead')), Boolean(inCard(F2, '-dead')), Boolean(inCard(F3, '-dead'))], ['7', false, true, true], 'H القاعة 1 مقفولة (7)، و2 بلا صفّ و3 بصفّ لم تُسجَّل هلاكاته: خانتان');
      t.same([textIn(F1, 'round-gas-today'), textIn(F2, 'round-gas-today'), textIn(F3, 'round-gas-today')], ['اليوم: قنينتان', 'اليوم: لم يُسجَّل غاز', 'اليوم: لم يُسجَّل غاز'], 'H الغاز: 2، ولا صفّ، والممسوح (نسخة بلا عدد)');
      t.eq(textIn(F1, 'round-feed-today'), 'أُرسل اليوم: 150 كغم«علف بادئ»: 100 كغم«علف ناهي»: 50 كغم', 'H «أُرسل اليوم» ولكلّ مادّة سطرها بترتيبها');
      const checked = (flockId) => actionIn(flockId, 'round-feed-item').find((n) => n.getAttribute('aria-checked') === 'true')?.getAttribute('data-item') ?? null;
      t.same([checked(F1), checked(F2), checked(F3)], ['0036a000-0000-4000-8000-0000000000c2', '0036a000-0000-4000-8000-0000000000c1', '0036a000-0000-4000-8000-0000000000c1'], 'H آخر علف لكلّ قاعة مختار (والقاعة بلا آخر: الأوّل)');
      t.same(actionIn(F1, 'round-feed-item').map((n) => n.textContent), ['علف بادئعندك 1,860 كغم', 'علف ناهيعندك 950 كغم'], 'H «عندك» من feed_items');
      await unmount();
      fresh(owner('u-h'), { loadOverviewJson: () => shifted('flocks_overview_layer') });
      await mount('/layers/round');
      await settle(60);
      const LF = '0036a000-0000-4000-8000-0000000000f9';
      t.same([Boolean(inCard(LF, '-dead')), Boolean(inCard(LF, '-eggsTotal')), actionIn(LF, 'round-feed-item').map((n) => n.textContent), actionIn(LF, 'round-feed-unit').length], [true, true, ['علف بيّاضعندك 700.5 كغم'], 0], 'H البيّاض: الهلاكات والبيض، وعلف بلا وحدات (لا رقائق)');
    });

    // ── P: المحلّلات بالعيّنة اليدوية: مفاتيح 0036، والغائب (خادم قبلها) null و[]، والشكل الغريب يرمي باسم خانته ─────────────────────────
    await step('P', async () => {
      const H = JSON.parse(HAND);
      const parsed = m.repo.parseOverview(clone(H.flocks_overview_broiler));
      const [f1, f2, f3] = parsed.sites[0].halls.map((entry) => entry.flock);
      t.same(
        [f1.today.deadEntered, f1.gasToday, f1.gasTodayVersion, f1.feedTodayKg, f1.feedToday.map((line) => [line.itemName, line.qty, line.unit]), f1.lastFeedItemId],
        [true, 2, 1, 150000n, [['علف بادئ', 100000n, 'kg'], ['علف ناهي', 50000n, 'kg']], '0036a000-0000-4000-8000-0000000000c2'],
        'P مفاتيح الجولة في ملخّص الفوج (العلف بالآلاف)',
      );
      t.same([f2.today, f2.gasToday, f2.feedTodayKg, f2.feedToday, f2.lastFeedItemId, f3.today.deadEntered, f3.gasToday, f3.gasTodayVersion], [null, null, null, [], null, false, null, 2], 'P القاعة بلا شيء اليوم، والغاز الممسوح (عدد null ونسخته)');
      t.same(parsed.feedItems.map((item) => [item.name, item.baseUnit, item.onHand, item.units.map((unit) => [unit.name, unit.baseQty])]), [['علف بادئ', 'kg', 1860000n, [['كيس 50 كغم', 50000000n]]], ['علف ناهي', 'kg', 950000n, [['كيس 50 كغم', 50000000n]]]], 'P feed_items بـ«عندك» بالآلاف والعامل بستّ مراتب');
      // خادم قبل 0036: بلا المفاتيح كلّها.
      const old = clone(H.flocks_overview_broiler);
      delete old.feed_items;
      for (const entry of old.sites[0].halls) {
        for (const key of ['gas_today', 'gas_today_version', 'feed_today_kg', 'feed_today', 'last_feed_item_id']) delete entry.flock[key];
        if (entry.flock.today) delete entry.flock.today.dead_entered;
      }
      const before = m.repo.parseOverview(old);
      t.same([before.feedItems, before.sites[0].halls[0].flock.today.deadEntered, before.sites[0].halls[0].flock.gasToday, before.sites[0].halls[0].flock.feedToday, before.sites[0].halls[0].flock.lastFeedItemId], [[], null, null, [], null], 'P خادم قبل 0036 (أو نسخة جهاز منه): null و[]');
      const bad = (mutate) => {
        const json = clone(H.flocks_overview_broiler);
        mutate(json);
        return fieldOf(() => m.repo.parseOverview(json));
      };
      const f = (json) => json.sites[0].halls[0].flock;
      t.same(
        [
          bad((j) => { f(j).today.dead_entered = 'yes'; }),
          bad((j) => { f(j).gas_today = 1001; }),
          bad((j) => { f(j).gas_today_version = null; }),
          bad((j) => { f(j).feed_today_kg = '1,000.000'; }),
          bad((j) => { f(j).feed_today[0].qty = '0.000'; }),
          bad((j) => { f(j).feed_today[0].unit = 'ton'; }),
          bad((j) => { f(j).feed_today = null; }),
          bad((j) => { j.feed_items[0].on_hand = null; }),
          bad((j) => { j.feed_items[1].units[0].base_qty = '0'; }),
          bad((j) => { j.feed_items = {}; }),
          bad(() => {}),
        ],
        ['dead_entered', 'gas_today', 'gas_today_version', 'feed_today_kg', 'qty', 'unit', 'feed_today', 'on_hand', 'base_qty', 'feed_items', 'parsed'],
        'P الصرامة: كلّ مفتاح جديد بنوعه حين يوجد (الرقم العشري نصّ بلا فواصل، والغاز ونسخته معاً)، والعيّنة كما هي تُقرأ',
      );
    });

    // ── Q36: عيّنات القاعدة الحقيقية (fixtures/round-once-0036.json) بالمحلّلات الحقيقية وفي الجولة (تكامل 0036) ─────────────────────────────
    await step('Q36', async () => {
      const real = JSON.parse(REAL36);
      // أجوبة الكاتبين كما أرجعتها القاعدة.
      const kinds = (result) => [result.kind, result.reason ?? null, result.version ?? null];
      t.same(
        [
          kinds(m.repo.deadAnswer(clone(real.set_flock_dead_saved))),
          kinds(m.repo.deadAnswer(clone(real.set_flock_dead_recorded))),
          kinds(m.repo.deadAnswer(clone(real.set_flock_dead_parked))),
          kinds(m.repo.gasAddAnswer(clone(real.add_flock_gas_saved))),
          kinds(m.repo.gasAddAnswer(clone(real.add_flock_gas_parked))),
        ],
        [['saved', null, 1], ['dead_recorded', null, null], ['parked', 'flock_closed', null], ['saved', null, 1], ['parked', 'flock_closed', null]],
        'Q36 أجوبة set_flock_dead وadd_flock_gas الحقيقية تُقرأ: حُفظ بنسخته، وسُجّلت قبل، ورُكن بسببه',
      );
      // القارئ كما أرجعته القاعدة.
      const parsed = m.repo.parseOverview(clone(real.flocks_overview));
      const broiler = parsed.sites.find((site) => site.kind === 'broiler');
      const [h1, h2, h3] = broiler.halls;
      t.same(
        [
          h1.flock.today.deadEntered, h1.flock.gasToday, h1.flock.gasTodayVersion, h1.flock.feedTodayKg, h1.flock.feedToday.map((line) => [line.itemName, line.qty]), h1.flock.lastFeedItemId,
          h2.flock.today, h2.flock.gasToday, h2.flock.feedToday, h3.flock,
          parsed.feedItems.map((item) => [item.name, item.onHand, item.units.map((unit) => unit.name)]),
        ],
        [
          true, 3, 2, 180000n, [['علف بادئ', 120000n], ['علف ناهي', 50000n], ['ذرة صفراء', 10000n]], 'b9e2820b-9a3d-4bb8-9e59-b8f0a936d41a',
          null, null, [], null,
          [['علف بادئ', 1880000n, ['كيس 50 كغم']], ['علف ناهي', 1500000n, ['كيس 25 كغم', 'كيس 50 كغم']]],
        ],
        'Q36 flocks_overview الحقيقيّ: هلاكات «قاعة 1» مسجّلة وغازها 3 بنسختها وعلفها 180 كغم بثلاث موادّ وآخر علفها؛ و«قاعة 2» بلا شيء؛ والمغلقة بلا فوج؛ وfeed_items بـ«عندك»',
      );
      // الجولة نفسها بالعيّنة (اليوم المثبَّت يُزاح إلى يوم الفحص).
      const shifted = () => JSON.parse(REAL36.replaceAll('2026-11-24', TODAY).replaceAll('2026-11-23', m.addDays(TODAY, -1))).flocks_overview;
      fresh(owner('u-q36'), { loadOverviewJson: shifted });
      await mount('/broiler/round');
      await settle(60);
      const F1 = 'a879ac60-81f0-45bd-9543-c6a3928197fa';
      const F2 = 'ea737821-87eb-47dd-8b06-8118a53db54e';
      t.same(
        [textIn(F1, 'round-dead-value'), Boolean(inCard(F1, '-dead')), Boolean(inCard(F2, '-dead')), textIn(F1, 'round-gas-today'), textIn(F2, 'round-gas-today')],
        ['2', false, true, 'اليوم: 3 قناني', 'اليوم: لم يُسجَّل غاز'],
        'Q36 «قاعة 1» هلاكاتها مقفولة (2) وغازها اليوم 3؛ و«قاعة 2» بخانة هلاكات وبلا غاز',
      );
      t.eq(textIn(F1, 'round-feed-today'), 'أُرسل اليوم: 180 كغم«علف بادئ»: 120 كغم«علف ناهي»: 50 كغم«ذرة صفراء»: 10 كغم', 'Q36 «أُرسل اليوم» بموادّه الثلاث كما عدّتها القاعدة');
      const checked = (flockId) => actionIn(flockId, 'round-feed-item').find((n) => n.getAttribute('aria-checked') === 'true')?.getAttribute('data-item') ?? null;
      t.same(
        [actionIn(F1, 'round-feed-item').map((n) => n.textContent), checked(F1), checked(F2)],
        [['علف بادئعندك 1,880 كغم', 'علف ناهيعندك 1,500 كغم'], 'b9e2820b-9a3d-4bb8-9e59-b8f0a936d41a', '30aa7674-14b9-4c9f-9d33-2908ffc73812'],
        'Q36 بطاقات العلف بـ«عندك» من القاعدة، وآخر علف القاعة مختار (وبلا آخر: الأوّل)',
      );
      await unmount();
      fresh(owner('u-q36'), { loadOverviewJson: shifted });
      await mount('/layers/round');
      await settle(60);
      const LF = 'c672387c-e2e1-43ed-8aa6-f008dbbcde48';
      t.same([Boolean(inCard(LF, '-dead')), Boolean(inCard(LF, '-eggsTotal'))], [true, true], 'Q36 البيّاض الحقيقيّ: بيض اليوم لا يقفل الهلاكات (dead_entered false)، وخانة البيض قائمة');
    });

    // ── R2: بلا نت تُحفظ بالجهاز («تنتظر الإرسال») بلا إرسال، ولمّا يرجع الاتصال ترتفع لحالها ─────────────────────────────────────
    await step('R2', async () => {
      const server = makeServer();
      const { sent } = roundWith(server, 'u-r2');
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      t.ok(text().includes('بلا اتصال: الهلاكات والغاز والبيض تُحفظ على هذا الجهاز'), 'R2: تنبيه «بلا اتصال»');
      type(inCard('f-b', '-dead'), '3');
      await settle();
      await save(80);
      t.eq(sent.length, 0, 'R2: بلا نت ما ينبعث شي');
      t.same((await queueOf('u-r2')).pending.map((op) => [op.fn, op.flockId, op.payload.dead, op.baseVersion]), [['set_flock_dead', 'f-b', 3, null]], 'R2: العملية بالطابور مختومة بلا نسخة');
      t.ok(statusOf('f-b').includes('محفوظة على هذا الجهاز') && text().includes('جولة واحدة على هذا الجهاز تنتظر الإرسال'), 'R2: «محفوظة على هذا الجهاز» وعدّاد الانتظار');
      m.onlineStore.set(true);
      await settle(150);
      t.same([sent.map((op) => [op.flockId, op.payload.dead]), (await queueOf('u-r2')).pending.length, text().includes('تنتظر الإرسال')], [[['f-b', 3]], 0, false], 'R2: رجع الاتصال ← ارتفعت لحالها والعدّاد اختفى');
    });

    // ── R3: stale_visit (زيارة بيض البيّاض) ← رفّ المراجعة بـ«زيارتك» و«المحفوظة»، ولا تنحذف ──────────────────────────────────────────
    await step('R3', async () => {
      const stored = { id: 'v-9', flock_id: 'f-l', on: TODAY, recorded_at: `${TODAY}T05:00:00+00:00`, dead: 0, culled: 0, feed_kg: null, eggs_total: 300, eggs_cracked: null, eggs_broken: null, note: null, source: 'visit', version: 2, voided: false, by: 'حسن' };
      const layers = () => ({ today: TODAY, sites: [site('s-2', 'layer', [hall('h-9', 'قاعة البيّاض', flock('f-l', 'layer', { live: 1000, live_start_today: 1000, fcr: null }))])] });
      fresh(owner('u-r3'), { loadOverviewJson: layers }, async () => ({ kind: 'stale_visit', server: stored }));
      await mount('/layers/round');
      type(inCard('f-l', '-eggsTotal'), '350');
      await settle();
      await save(80);
      const { pending, review } = await queueOf('u-r3');
      t.same([pending.length, review.length, review[0]?.reason, review[0]?.op.fn], [0, 1, 'stale_visit', 'save_flock_visit'], 'R3: الزيارة انتقلت لرفّ المراجعة');
      t.ok(text().includes('جولات تحتاج مراجعة') && text().includes('تغيّرت هذه الزيارة من جهاز آخر قبل أن يصل طلبك') && text().includes('زيارة جديدة'), 'R3: الرفّ بسببه ونوعها');
      const heads = all().filter((n) => n.localName === 'th').map((n) => n.textContent);
      const cells = all().filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.ok(heads.includes('زيارتك') && heads.includes('المحفوظة') && cells.includes('350') && cells.includes('300'), 'R3: «زيارتك» 350 و«المحفوظة» 300 جنب بعض');
    });

    // ── R3b: عملية مجموع يوم قديمة (save_flock_day قبل 0032) بالطابور ترتفع كما كانت، وstale_day لرفّها ───────────────────────────────
    await step('R3b', async () => {
      m.onlineStore.set(false);
      await m.saveRound(await m.openOutbox(), { userId: 'u-3b', orgId: 'org-1', displayName: 'علي' }, { fn: 'save_flock_day', flockId: 'f-a', day: TODAY, payload: { dead: 7 }, baseVersion: 4 });
      m.onlineStore.set(true);
      const server = makeServer();
      const { sent } = fresh(owner('u-3b'), { loadOverviewJson: () => server.overview() }, async () => ({ kind: 'stale_day', server: dayRow({ version: 6, dead: 3 }) }));
      await mount('/broiler/round');
      await settle(80);
      const { review } = await queueOf('u-3b');
      t.same([sent.map((op) => [op.fn, op.baseVersion, op.payload.dead]), review[0]?.reason], [[['save_flock_day', 4, 7]], 'stale_day'], 'R3b: العملية القديمة ارتفعت بنسختها وحمولتها، وstale_day لرفّها');
      const heads = all().filter((n) => n.localName === 'th').map((n) => n.textContent);
      t.ok(text().includes('حُفظ هذا اليوم من جهاز آخر قبل أن تصل جولتك') && heads.includes('جولتك') && heads.includes('المحفوظ في الخادم'), 'R3b: الرفّ بنصّ مجموع اليوم القديم');
    });

    // ── R4: parked ← رفّ المراجعة بسببها، و«احذفه» بتأكيد يحذفها ─────────────────────────────────────────────────────────────────
    await step('R4', async () => {
      const server = makeServer();
      fresh(owner('u-4'), { loadOverviewJson: () => server.overview() }, async () => ({ kind: 'parked', reason: 'period_locked' }));
      await mount('/broiler/round');
      type(inCard('f-b', '-dead'), '1');
      type(inCard('f-b', '-gas'), '2');
      await settle();
      await save(100);
      const { pending, review } = await queueOf('u-4');
      t.same([pending.length, review.map((entry) => [entry.reason, entry.hint, entry.op.fn]).sort()], [0, [['parked', 'period_locked', 'add_flock_gas'], ['parked', 'period_locked', 'set_flock_dead']]], 'R4: الهلاكات والغاز المركونان على الجهاز في الرفّ بسببهما');
      t.ok(statusOf('f-b').includes('بقيت على هذا الجهاز في «جولات تحتاج مراجعة»') && text().includes('راجع: قاعة 2'), 'R4: القاعة تقول إنّها بقيت في الرفّ');
      const shelves = all().filter((n) => n.getAttribute('data-review') !== null);
      const rowsOf = (entry) => descendants(entry).filter((n) => n.localName === 'td').map((n) => n.textContent);
      t.same(shelves.map(rowsOf).sort(), [['الغاز المضاف (قناني)', '2', '—'], ['الهلاكات', '1', '—']], 'R4: صفّ كلّ مركون باسم خانته وقيمتك (والمحفوظ «—»)');
      t.ok(text().includes('كان اليوم في فترة حسابات مقفلة'), 'R4: السبب بجملة');
      fire(byAction('review-remove')[0] ?? body(), 'click');
      await settle(40);
      t.eq((await queueOf('u-4')).review.length, 2, 'R4: لا حذف قبل التأكيد');
      fire(byAction('review-remove-go')[0] ?? body(), 'click');
      await settle(80);
      t.eq((await queueOf('u-4')).review.length, 1, 'R4: بعد التأكيد حُذف ما اختير وحده');
    });

    // ── R5/V5: الهلاكات فوق الحيّ بداية اليوم تُمنع قبل الحفظ (4,939 من 4,938)، والحدّ يُقبل ──────────────────────────────────────────
    await step('R5', async () => {
      const server = makeServer();
      const { sent } = roundWith(server, 'u-5');
      await mount('/broiler/round');
      type(inCard('f-b', '-dead'), '4939');
      await settle();
      await save(60);
      t.same([sent.length, (await queueOf('u-5')).pending.length, textIn('f-b', 'round-error'), inCard('f-b', '-dead')?.value], [0, 0, 'الهلاكات أكثر من الطيور الحيّة بداية اليوم (4,938).', '4939'], 'R5: لا عملية، والسبب بالحيّ بفواصل، والمكتوب باقٍ');
      type(inCard('f-b', '-dead'), '4938');
      await settle();
      await save(120);
      t.same(sent.map((op) => op.payload.dead), [4938], 'R5 ضابط: الحيّ كلّه يُقبل');
    });

    // ── F1: المدير يضيف قاعة ويفتح فوجاً (بمرجع)، وعامل القاعة يشوف الأرقام والجولة بلا أزرارهما ──────────────────────────────────
    await step('F1', async () => {
      const broiler = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: dayRow({ version: 4, dead: 2 }) })), hall('h-2', 'قاعة 2', flock('f-b', 'broiler')), hall('h-3', 'قاعة 3', null)])] });
      const { calls } = fresh(owner('u-1'), { loadOverviewJson: broiler, openFlock: () => 'f-new' });
      await mount('/broiler');
      t.ok(text().includes('حقل الشمال') && text().includes('1.24%') && text().includes('0.555'), 'F1: الحقل والقاعات بالنفوق ومعامل التحويل');
      t.ok(byAction('hall-add').length === 1 && byAction('flock-open').length === 1 && byAction('farm-round').length === 1, 'F1: المدير: أضف قاعة، وافتح فوجاً للقاعة الفارغة، والجولة');
      fire(byAction('flock-open')[0], 'click');
      await settle();
      type(byIdSuffix('-count')[0], '5000');
      await settle();
      fire(byAction('flock-open-save')[0], 'click');
      await settle(60);
      const open = calls.find(([name]) => name === 'openFlock');
      t.same(open?.[1]?.[0], { hallId: 'h-3', placedOn: TODAY, placedCount: 5000, ageDays: 0, breed: '' }, 'F1: open_flock بالقاعة والتاريخ والعدد');
      await unmount();
      const worker = () => ({ today: TODAY, sites: [site('s-1', 'broiler', broiler().sites[0].halls, false)] });
      fresh({ status: 'ready', workspace: ws({ role: 'hall_worker', divisions: ['broiler'] }), offline: false }, { loadOverviewJson: worker });
      await mount('/broiler');
      t.same([byAction('farm-round').length, byAction('hall-add').length, byAction('flock-open').length], [1, 0, 0], 'F1: عامل القاعة يشوف الجولة بلا إضافة قاعة ولا فتح فوج');
    });

    // ── L5: ما يُكتب أثناء رفع الحفظ يبقى (غاز قاعة أخرى)، وما حُفظ يُفرغ ─────────────────────────────────────────────────────────
    await step('L5', async () => {
      let release = () => {};
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const server = makeServer();
      const { sent } = fresh(owner('u-l5'), { loadOverviewJson: () => server.overview() }, async (op) => {
        await gate;
        return server.send(op);
      });
      await mount('/broiler/round');
      type(inCard('f-a', '-dead'), '3');
      await settle();
      fire(byAction('round-save')[0], 'click');
      await settle(40);
      t.same(sent.map((op) => [op.flockId, op.payload.dead]), [['f-a', 3]], 'L5 ضابط: العملية في الطريق (الرفع ينتظر)');
      type(inCard('f-b', '-gas'), '7');
      await settle();
      release();
      await settle(150);
      t.same([Boolean(inCard('f-a', '-dead')), inCard('f-b', '-gas')?.value, text().includes('حُفظ 1 من 1')], [false, '7', true], 'L5 بعد الرفع: هلاكات قاعة 1 حُفظت وقُفلت، والمكتوب أثناء الرفع (غاز قاعة 2) باقٍ');
    });

    // ── L6: عملية هلاكات مجهولة النتيجة لا تُعدّ مرّتين فوق محفوظ قد يحملها ──────────────────────────────────────────────────────
    await step('L6', async () => {
      const ownerStamp = { userId: 'u-l6', orgId: 'org-1', displayName: 'علي' };
      const db = await m.openOutbox();
      const unknown = await m.saveRound(db, ownerStamp, { fn: 'set_flock_dead', flockId: 'f-a', day: TODAY, payload: { dead: 5 }, baseVersion: null });
      await new Promise((resolve) => {
        const tx = db.transaction('ops', 'readwrite');
        tx.objectStore('ops').put({ ...unknown, state: 'unknown', lastError: 'network' });
        tx.oncomplete = resolve;
      });
      // الخادم حفظها (5 وسُجّلت) وجوابها ضاع.
      const small = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { live: 10, live_start_today: 15, today: dayRow({ version: 2, dead: 5, dead_entered: true }) }))])] });
      fresh(owner('u-l6'), { loadOverviewJson: small });
      globalThis.__farm.userId = 'someone-else'; // جلسة غيره: لا رفع، فتبقى المجهولة مجهولة
      await mount('/broiler/round');
      t.same([textIn('f-a', 'round-dead-value'), actionIn('f-a', 'round-dead-pending').length], ['5', 1], 'L6 المحفوظ 5 وعملية مجهولة 5: «5» لا «10»، و«بانتظار الرفع»');
      await unmount();
      // ويوم لم يصله شيء بعد (القراءة قبلها): رقم العملية وحده.
      const before = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { live: 15, live_start_today: 15, today: null }))])] });
      fresh(owner('u-l6'), { loadOverviewJson: before });
      globalThis.__farm.userId = 'someone-else';
      await mount('/broiler/round');
      t.eq(textIn('f-a', 'round-dead-value'), '5', 'L6 وقراءة قبل وصولها: «5»');
      await new Promise((resolve) => {
        const tx = db.transaction('ops', 'readwrite');
        tx.objectStore('ops').delete(unknown.id);
        tx.oncomplete = resolve;
      });
    });

    // ── C: جولة انرفعت بالخلفية لمّا رجع الاتصال وردّها الخادم: الشاشة تقولها، ما تختفي بصمت ─────────────────────────────────────
    await step('C', async () => {
      const server = makeServer();
      fresh(owner('u-c'), { loadOverviewJson: () => server.overview() }, async () => ({ kind: 'parked' }));
      await mount('/broiler/round');
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-b', '-dead'), '3');
      await settle();
      await save(80);
      t.ok(statusOf('f-b').includes('محفوظة على هذا الجهاز'), 'C: ضابط: محفوظة على الجهاز');
      m.onlineStore.set(true);
      await settle(150);
      t.eq((await queueOf('u-c')).pending.length, 0, 'C: ضابط: الرفع بالخلفية جرى والخادم ركنها');
      t.ok(statusOf('f-b').includes('بقيت على هذا الجهاز في «جولات تحتاج مراجعة»') && text().includes('رُدّت وبقيت في «جولات تحتاج مراجعة»: قاعة 2'), 'C: القاعة والتنبيه يقولان «رُدّت»');
      const seen = byAction('round-uploads-seen')[0];
      if (seen) fire(seen, 'click');
      await settle();
      t.ok(Boolean(seen) && !text().includes('رُدّت وبقيت في «جولات تحتاج مراجعة»: قاعة 2'), 'C: «حسناً» يطوي التنبيه');
    });

    // ── D: جولات الجهاز ترتفع من أيّ شاشة (الرافع بالقشرة)، والرأس يعدّها ───────────────────────────────────────────────────────
    await step('D', async () => {
      const server = makeServer();
      const { sent } = roundWith(server, 'u-d');
      await mount('/broiler/round', { header: true });
      m.onlineStore.set(false);
      await settle();
      type(inCard('f-b', '-dead'), '3');
      await settle();
      await save(80);
      t.ok(chips().includes('جولاتك المنتظرة: 1'), `D: الرأس: «جولاتك المنتظرة: 1» (${chips()})`);
      fire(all().find((n) => n.localName === 'a' && n.textContent === 'إلى الحقول') ?? body(), 'click', { button: 0 });
      await settle(80);
      t.ok(text().includes('قاعة 1') && byAction('round-save').length === 0, 'D: ضابط: تركت الجولة لشاشة الحقل');
      m.onlineStore.set(true);
      await settle(150);
      t.same(sent.map((op) => [op.fn, op.flockId, op.payload.dead]), [['set_flock_dead', 'f-b', 3]], 'D: رجع الاتصال وشاشة الجولة مغلقة: الجولة ارتفعت');
      t.ok(chips().includes('كل الجولات مُرسلة') && !chips().includes('جولاتك المنتظرة'), `D: الرأس: «كل الجولات مُرسلة» (${chips()})`);
    });

    // ── E: المشاهد (0034، «الكلّ مثل المالك») يُعرض عليه ما يُعرض على المالك، وما يدخل الطابور شيء باسمه ما لم يكتب ─────────────────
    await step('E', async () => {
      const server = makeServer();
      const { sent } = fresh({ status: 'ready', workspace: ws({ userId: 'u-e', role: 'viewer' }), offline: false }, { loadOverviewJson: () => server.overview() });
      await mount('/broiler/round');
      await settle(60);
      t.same([byAction('round-save').length > 0, byIdSuffix('-dead').length, byIdSuffix('-gas').length, byAction('round-give').length, byAction('round-feed-item').length > 0], [true, 2, 2, 2, true], 'E: خانات الهلاكات والغاز، و«أضف للقاعة»، وبطاقات العلف، والحفظ للمشاهد');
      t.ok(!text().includes('تعرض هذه الصفحة أرقام اليوم فقط'), 'E: بلا تنبيه «للقراءة فقط»');
      const { pending, review } = await queueOf('u-e');
      t.same([sent.length, pending.length, review.length], [0, 0, 0], 'E: ولا عملية باسم المشاهد');
    });

    // ── F: أرقام الجولة اللي ما انحفظت تعلّم النافذة، وبعد الحفظ نظيفة ──────────────────────────────────────────────────────────
    await step('F', async () => {
      const server = makeServer();
      roundWith(server, 'u-f');
      await mount('/broiler/round');
      t.eq(m.isWindowDirty(), false, 'F: ضابط: نظيفة قبل الكتابة');
      type(inCard('f-a', '-dead'), '5');
      type(inCard('f-b', '-gas'), '2');
      await settle();
      t.eq(m.isWindowDirty(), true, 'F: كتابة بالجولة لم تُحفظ = نافذة وسخة');
      await save(150);
      t.eq(m.isWindowDirty(), false, 'F: بعد الحفظ النافذة نظيفة');
      type(actionIn('f-a', 'round-feed-qty')[0], '1');
      await settle();
      t.eq(m.isWindowDirty(), true, 'F: كمية علف لم تُرسل = نافذة وسخة');
    });

    // ── G وH: الرئيسية تقرأ الحقول بنت وتحفظ نسخة الجهاز، فالجولة تنفتح بالقاعة بلا نت؛ والرأس «غير جاهز» لحدّها ───────────────────
    await step('G', async () => {
      m.updateStore.set((state) => ({ ...state, offlineReady: true }));
      const server = makeServer({ 'f-a': { day: { version: 4, dead: 2, culled: 0, entered: true }, gas: null, feed: [] } });
      const worker = ws({ userId: 'u-g', role: 'hall_worker', divisions: ['broiler'] });
      fresh({ status: 'ready', workspace: worker, offline: false }, { loadOverviewJson: () => new Promise(() => {}), loadHomeSummary: () => ({}) });
      await mount('/', { header: true });
      t.ok(chips().includes('غير جاهز دون اتصال'), `G: الرأس قبل أوّل قراءة للحقول: «غير جاهز دون اتصال» (${chips()})`);
      await unmount();
      const { calls } = fresh({ status: 'ready', workspace: worker, offline: false }, { loadOverviewJson: () => server.overview(), loadHomeSummary: () => ({}) });
      await mount('/', { header: true });
      await settle(60);
      t.ok(calls.some(([name]) => name === 'loadOverviewJson') && !chips().includes('غير جاهز دون اتصال'), `G: الرئيسية قرأت الحقول بنت فالرأس ما يقول «غير جاهز» (${chips()})`);
      t.ok(!text().includes('لا أرقام بعد'), 'H: ماكو «لا أرقام بعد … المراحل القادمة» فوق بطاقة حقول بأرقام');
      await unmount();
      m.onlineStore.set(false);
      fresh({ status: 'ready', workspace: worker, offline: true }, { loadOverviewJson: () => Promise.reject(new m.NetworkError()) });
      await mount('/broiler/round');
      t.same([Boolean(card('f-a')) && Boolean(card('f-b')), textIn('f-a', 'round-dead-value'), Boolean(inCard('f-b', '-dead'))], [true, '2', true], 'G: بالقاعة بلا نت الجولة تنفتح من نسخة الرئيسية (هلاكات قاعة 1 مقفولة، وقاعة 2 خانة)');
      t.ok(text().includes('بلا اتصال: هذه آخر نسخة محفوظة على الجهاز'), 'G: وتقول إنها نسخة الجهاز');
      m.updateStore.set((state) => ({ ...state, offlineReady: false }));
    });

    // ── I: شرح التثبيت بالآيفون بعدّ الطابور الحقيقي: جولات ما انرفعت ← «ارفع جولاتك أولاً» بدل خطوات التثبيت ─────────────────────
    {
      const savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 }, configurable: true, writable: true });
      try {
        m.onlineStore.set(false);
        const who = ws({ userId: 'u-i', role: 'hall_worker', divisions: ['broiler'] });
        await m.saveRound(await m.openOutbox(), { userId: 'u-i', orgId: 'org-1', displayName: 'علي' }, { fn: 'set_flock_dead', flockId: 'f-a', day: TODAY, payload: { dead: 2 }, baseVersion: null });
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
        m.onlineStore.set(true);
      }
    }

    // ── J: نافذتا القاعة والفوج تعدّان كل خانة مكتوبة كتابة لم تُحفظ ───────────────────────────────────────────────────────────
    await step('J', async () => {
      const withEmpty = () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler')), hall('h-3', 'قاعة 3', null)])] });
      fresh(owner('u-j'), { loadOverviewJson: withEmpty });
      await mount('/broiler');
      fire(byAction('hall-add')[0], 'click');
      await settle();
      type(byIdSuffix('-capacity')[0], '6000');
      await settle();
      t.eq(m.isWindowDirty(), true, 'J: نافذة القاعة بالسعة وحدها كتابة لم تُحفظ');
      await unmount();
      fresh(owner('u-j'), { loadOverviewJson: withEmpty });
      await mount('/broiler');
      fire(byAction('flock-open')[0], 'click');
      await settle();
      type(byIdSuffix('-age')[0], '21');
      type(byIdSuffix('-breed')[0], 'روس 308');
      await settle();
      t.eq(m.isWindowDirty(), true, 'J: نافذة الفوج بالعمر والسلالة كتابة لم تُحفظ');
    });

    // ── S: رفض بلا تلميح (PGRST202: الدالّة مو بالخادم بعد) برفّ المراجعة بجملة فصيحة، مو الرمز وحده ───────────────────────────────
    await step('S', async () => {
      const server = makeServer();
      fresh(owner('u-s'), { loadOverviewJson: () => server.overview() }, async () => ({ kind: 'rejected', code: 'PGRST202', hint: null }));
      await mount('/broiler/round');
      type(inCard('f-b', '-dead'), '1');
      await settle();
      await save(80);
      const paragraphs = all().filter((n) => n.localName === 'p').map((n) => n.textContent);
      t.ok(!paragraphs.includes('PGRST202') && paragraphs.some((line) => line.includes('لم يُحفظ شيء') && line.includes('PGRST202')), `S: رفّ المراجعة بجملة «لم يُحفظ شيء (الرمز: …)» (${paragraphs.filter((line) => line.includes('PGRST')).join(' | ')})`);
    });

    // ── U: الرافع الواحد: طلب أثناء رفع جارٍ ينتظره ثم يرفع مرّة ثانية؛ كل عملية تنبعث مرّة ─────────────────────────────────────────
    {
      const ownerStamp = { userId: 'u-u', orgId: 'org-1', displayName: 'علي' };
      const db = await m.openOutbox();
      await m.saveRound(db, ownerStamp, { fn: 'set_flock_dead', flockId: 'f-1', day: TODAY, payload: { dead: 1 }, baseVersion: null });
      let release = () => {};
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const sentU = [];
      const tr = {
        currentUserId: async () => 'u-u',
        lookup: async () => null,
        send: async (op) => {
          sentU.push(op.flockId);
          if (op.flockId === 'f-1') await gate;
          return { kind: 'saved', version: 1, day: null };
        },
      };
      const first = m.uploadRounds(ownerStamp, async () => tr);
      await settle(20);
      await m.saveRound(db, ownerStamp, { fn: 'add_flock_gas', flockId: 'f-2', day: TODAY, payload: { add: 2 }, baseVersion: null });
      const second = m.uploadRounds(ownerStamp, async () => tr);
      const third = m.uploadRounds(ownerStamp, async () => tr);
      release();
      const [a, b, c] = await Promise.all([first, second, third]);
      t.same(sentU, ['f-1', 'f-2'], 'U: كل عملية انبعثت مرّة وحدة رغم ثلاثة طلبات رفع');
      t.ok(b.some((entry) => entry.flockId === 'f-2' && entry.result.kind === 'saved') && a.some((entry) => entry.flockId === 'f-1') && JSON.stringify(b) === JSON.stringify(c), 'U: الطلبان المنتظران يشتركان بنفس الرفع الثاني ويلقيان نتيجة عملياتهما');
    }

    // ── W: «لا أفواج نشطة» بدل «شغّالة» ─────────────────────────────────────────────────────────────────────────────────
    await step('W', async () => {
      fresh(owner('u-w'), { loadOverviewJson: () => ({ today: TODAY, sites: [site('s-1', 'broiler', [hall('h-3', 'قاعة 3', null)])] }) });
      await mount('/broiler/round');
      t.ok(text().includes('لا أفواج نشطة اليوم.') && !text().includes('شغّالة'), 'W: «لا أفواج نشطة اليوم.»');
    });
  } finally {
    delete globalThis.__farm;
    restore();
  }
}
