// «القاعة كالورقة» (طلب المالك 2026-11-21 بصورة ورقته «هلاكات قاعة (7)»، «وجبة 2026-11-13»؛ عقد 0034/0035 الجزء B4 وC/S2): ورقة القاعة من hall_sheet.
// الشاشات الحقيقية (FarmRoutes بصفحة القاعة، وتقرير الوجبة ReportPage) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، والطابور الحقيقي (saveRound
// وuploadRounds) على fake-indexeddb، والمحلّل الحقيقي (parseHallSheet وparseFeedSent وgasAnswer) على العيّنة اليدوية للعقد (fixtures/hall-sheet.hand.json؛
// الجلسة الرئيسية تبدّلها بعيّنات القاعدة الحقيقية). كلّ حالة تفشل على الشفرة قبلها (لا hall_sheet ولا غاز ولا ورقة).
// P المحلّل: الشكل والقيم، والصرامة لكلّ مفتاح (نصّ مكان عدد، وفاصلة في رقم، وفجوة في الأيام، وthrough، والمستبعد فوق الهلاكات، وغاز بلا نسخة، وبيض للّاحم…)،
//   وجواب send_flock_feed وset_flock_gas، وتحويل الكيس إلى الكيلو.
// S الورقة: العنوان و«وجبة»، والأعمدة، وصفّ لكلّ يوم من التسكين حتى through، واليوم معلَّم ومُمرَّر إليه، والمجموع من الخادم، والمستبعد القديم داخل الهلاكات،
//   وعلف يوم فات في يومه، وصفّ الأفعال، والمركون بـ«أُدخلت»/«تجاهل»، والبيّاض بعمود البيض.
// E الخانات: هلاكات يوم بثلاث لمسات بالطابور (save_flock_day بنسخة صفّ اليوم)، والمستبعد القديم يُصفَّر، ويوم قبل 20 يوماً يُكتب، والغاز بالطابور ويندمج
//   و«بانتظار الرفع»، والملاحظة، ولا كتابة ليوم قادم ولا لوجبة مغلقة، وحدّ الحيّ.
// F العلف: ورقة اليوم بما أُرسل و«ألغِ» بتأكيد يسمّي المادّة والكمية واليوم، والإرسال من «رصيد العلف» بثلاث لمسات (آخر علف جاهز والكيس افتراضاً)، ويوم فات
//   بيومه، والنتيجة المجهولة تُعاد بالمرجع نفسه بعد إعادة الفتح، وبلا اتصال جملة.
// Q المركون على الجهاز يُدلّ عليه في الورقة. R تقرير الوجبة: الخلاصة من الخادم وحسابها من العيّنة، والجدول بالمجموعين التراكميين حتى اليوم، والصورة والطباعة.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8'));
// عيّنات القاعدة الحقيقية (supabase/tests/hall-sheet.test.mjs بـHALL_SHEET_SAMPLES_OUT=1): تمرّ بالمحلّلات الحقيقية (تكامل 0035).
const REAL = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet-0035.json'), 'utf8'));
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
  // بطاقة البيع والإغلاق (0028) لها فحوصها؛ هنا فارغة فلا تقرأ الخادم.
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
    "export { openOutbox, pendingOps, reviewEntries } from './src/lib/outbox/index.ts';",
    "export { uploadRounds } from './src/lib/roundUploads.ts';",
    "export { parseHallSheet, parseFeedSent, toBaseQty, HallSheetShapeError } from './src/lib/repo/hallSheet.ts';",
    "export { gasAnswer } from './src/lib/repo/flocks.ts';",
    "export { UnknownOutcomeError } from './src/lib/errors.ts';",
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
const hrefOf = (name, root = body()) => byAction(name, root)[0]?.getAttribute('href') ?? null;
const text = () => body().textContent;
const clone = (value) => JSON.parse(JSON.stringify(value));
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0, detail: 1 });
  await settle(rounds);
};
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ancestor = (node, test) => {
  for (let n = node?.parentNode ?? null; n; n = n.parentNode) if (test(n)) return n;
  return null;
};
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const footRow = (table) => (section(table, 'tfoot')?.children ?? []).find((c) => c.localName === 'tr') ?? null;
const headers = (table) => descendants(section(table, 'thead') ?? body()).filter((n) => n.localName === 'th').map((n) => n.textContent);
const cells = (tr) => (tr?.children ?? []).filter((c) => c.localName === 'td' || c.localName === 'th').map((c) => c.textContent);
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
/** مفتاح لوحة الأرقام (WeightPad) بقيمته داخل النافذة. */
const key = (dialog, value) => (dialog ? descendants(dialog).find((n) => n.localName === 'button' && n.getAttribute('aria-label') === value) ?? null : null);
/** سطور زرّ بسطرين (الفعل، وتحته ما يُرسل): نصوص أوراقه. */
const lines = (node) => (node ? descendants(node).filter((n) => n.localName === 'span' && !n.children.some((c) => c.localName === 'span')).map((n) => n.textContent) : null);
const classOf = (node) => node?.getAttribute('class') ?? '';

export default async function (t) {
  const restore = installDom();
  // تمرير صفّ اليوم إلى وسط الجدول: مواضع بسيطة لكلّ صفّ (40 نقطة) والحاوية بارتفاع 400.
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
  try {
    const m = await screens();
    const BROILER = FIX.hall_sheet.broiler;
    const LAYER = FIX.hall_sheet.layer;
    const TODAY = BROILER.today;
    const F7 = BROILER.flock.id;
    const H7 = BROILER.flock.hall_id;
    const GROWER = BROILER.feed_items.find((item) => item.last).item_id;

    // ── I: عيّنات القاعدة الحقيقية بالمحلّلات الحقيقية ─────────────────────────────────────────────────
    for (const name of ['hall_sheet_broiler', 'hall_sheet_layer', 'hall_sheet_closed']) {
      const raw = REAL[name];
      const sheet = m.parseHallSheet(clone(raw));
      t.same([sheet.days.length, sheet.days[0].on, sheet.days.at(-1).on], [raw.days.length, raw.placed_on ?? raw.flock.placed_on, raw.through], `I ${name}: صفّ لكلّ يوم من التسكين حتى through`);
      t.same(sheet.days.map((day) => [day.dead, day.gas, day.note]), raw.days.map((day) => [day.day_version === null ? 0 : day.dead, day.gas, day.note]), `I ${name}: الهلاكات والغاز والملاحظة كما أرسلها الخادم (يوم بلا جولة هلاكاته null من الخادم وصفر بالمحلّل؛ «سُجّل؟» من النسخة)`);
    }
    {
      const sheet = m.parseHallSheet(clone(REAL.hall_sheet_broiler));
      t.same([sheet.days.filter((day) => day.feed.length > 0).length > 0, sheet.feedItems.length > 0], [true, true], 'I الدجاج: علف مرسل في يومه، وعلف يُختار');
      t.same(m.parseHallSheet(clone(REAL.hall_sheet_closed)).rejects.length > 0, true, 'I الوجبة المغلقة: المردود يظهر');
      t.same(m.parseFeedSent(clone(REAL.send_flock_feed)).issue.forDay ?? null, REAL.send_flock_feed.issue.for_day, 'I send_flock_feed الحقيقي');
      t.same([m.gasAnswer(clone(REAL.set_flock_gas_saved)).kind, m.gasAnswer(clone(REAL.set_flock_gas_stale)).kind], ['saved', 'stale_gas'], 'I set_flock_gas الحقيقي: saved وstale_gas');
    }
    // ── P: المحلّل ──────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const sheet = m.parseHallSheet(clone(BROILER));
      t.same(
        [sheet.days.length, sheet.days[0].on, sheet.days.at(-1).on, sheet.through, sheet.days[0].age, sheet.canWrite, sheet.flock.kind, sheet.flock.hallName],
        [46, '2026-11-13', '2026-12-28', '2026-12-28', 0, true, 'broiler', '7'],
        'P الورقة صفّ لكلّ يوم من التسكين (عمر 0) حتى through (التسكين + 45 للّاحم بلا نهاية مخطّطة)',
      );
      const cull = sheet.days.find((day) => day.on === '2026-11-15');
      const late = sheet.days.find((day) => day.on === '2026-11-20');
      t.same(
        [cull.dead, cull.culled, cull.dayVersion, late.feedKg, late.feed.map((line) => [line.itemName, line.qty, line.issuedOn, line.canVoid]), sheet.days[0].dayVersion, sheet.days[0].gas, sheet.days[0].gasVersion],
        [5, 2, 2, 200000n, [['علف بادئ', 200000n, '2026-12-01', true]], null, 4, 1],
        'P المستبعد القديم داخل الهلاكات، وعلف يوم فات بيوم خروجه، واليوم بلا صفّ نسخته null، والغاز بنسخته',
      );
      t.same(
        [sheet.totals, sheet.summary],
        [
          { dead: 32, gas: 17, feedKg: 1000000n, feedBackKg: null, soldBirds: 1000, soldNetKg: 2350500n, eggsTotal: null },
          { placed: 5000, dead: 32, mortalityPct: 64n, live: 3968, feedKg: 1000000n, feedBags: 20000n, feedBackKg: null, feedNetKg: 1000000n, gas: 17, soldBirds: 1000, soldNetKg: 2350500n, avgWeightKg: 2351n, fcr: 425n },
        ],
        'P المجاميع والخلاصة من الخادم كما هي (بالآلاف والمئات)',
      );
      t.same(
        [sheet.feedItems.map((item) => [item.name, item.onHand, item.units.map((unit) => [unit.name, unit.baseQty]), item.last]), sheet.rejects.map((reject) => [reject.on, reject.reason])],
        [[['علف بادئ', 1200000n, [['كيس 50 كغم', 50000000n]], false], ['علف نامي', 850500n, [['كيس 50 كغم', 50000000n]], true]], [['2026-11-19', 'date_too_old'], ['2026-11-21', 'period_locked']]],
        'P أعلاف «رصيد العلف» بعندك ووحداتها (العامل بستّ مراتب) وآخرها، والمركون',
      );
      t.same(m.parseHallSheet(clone(LAYER)).days.map((day) => day.eggsTotal), [null, 2100, 2250, 2300, null, 2280, 2310], 'P البيّاض ببيضه، والغائب null لا صفر');
      const bad = (mutate) => {
        const json = clone(BROILER);
        mutate(json);
        try {
          m.parseHallSheet(json);
          return 'parsed';
        } catch (error) {
          return error instanceof m.HallSheetShapeError ? error.field : `other:${error?.message}`;
        }
      };
      t.same(
        [
          bad((j) => { j.days[1].dead = '6'; }),
          bad((j) => { j.days[0].feed_kg = 100; }),
          bad((j) => { j.totals.feed_kg = '1,000.000'; }),
          bad((j) => { j.days.splice(3, 1); }),
          bad((j) => { j.through = '2026-12-29'; }),
          bad((j) => { j.days[2].culled = 9; }),
          bad((j) => { j.days[0].gas_version = null; }),
          bad((j) => { j.flock.kind = 'pigeon'; }),
          bad((j) => { j.days[1].eggs_total = 10; }),
          bad((j) => { j.feed_items[0].units[0].base_qty = '0'; }),
          bad((j) => { j.rejects[0].created_at = 'أمس'; }),
          bad((j) => { delete j.can_write; }),
          bad((j) => { j.feed_items[0].on_hand = null; }),
          bad((j) => { j.days[0].feed[0].qty = '0'; }),
        ],
        ['dead', 'feed_kg', 'feed_kg', 'days', 'through', 'culled', 'gas_version', 'kind', 'eggs_total', 'base_qty', 'created_at', 'can_write', 'on_hand', 'qty'],
        'P الصرامة: كلّ مفتاح بنوعه، والرقم العشري نصّ بلا فواصل، وصفّ لكلّ يوم بلا فجوة حتى through، والمستبعد لا يتجاوز الهلاكات، والغاز ونسخته معاً، ولا بيض للّاحم',
      );
      const sent = m.parseFeedSent(clone(FIX.send_flock_feed));
      t.same([sent.issue.docNo, sent.issue.qty, sent.issue.forDay, sent.issue.issuedOn, sent.day.feedKg], ['FI-2026-0321', 100000n, '2026-11-21', TODAY, 100000n], 'P جواب send_flock_feed: الصرف بيوم خروجه ويومه');
      t.throws(() => m.parseFeedSent({ ...clone(FIX.send_flock_feed), status: 'parked' }), 'P send_flock_feed بغير saved يرمي');
      const gas = FIX.set_flock_gas;
      t.same(
        [m.gasAnswer(clone(gas.saved)), m.gasAnswer(clone(gas.stale)), m.gasAnswer(clone(gas.parked))],
        [{ kind: 'saved', version: 1 }, { kind: 'stale_gas', server: gas.stale.server }, { kind: 'parked', reason: 'period_locked' }],
        'P جواب set_flock_gas ← نتيجة الطابور: saved بنسخة الصفّ، وstale_gas بقيمة الخادم، وparked بسببه',
      );
      t.throws(() => m.gasAnswer({ status: 'saved', gas: { on: TODAY, cylinders: 1001, version: 1 } }), 'P غاز فوق 1,000 قنينة شكلٌ غريب (يبقى بالطابور)');
      const bag = sheet.feedItems[1].units[0];
      t.same([m.toBaseQty(2000n, bag), m.toBaseQty(1500n, bag), m.toBaseQty(120500n, null)], [100000n, 75000n, 120500n], 'P كيسان من 50 كغم = 100 كغم، وكيس ونصف = 75، والكيلو كما هو');
    }

    // ── الحامل ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const ws = (role, userId) => ({
      userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const summaryOf = (sheet) => ({
      id: sheet.flock.id, kind: sheet.flock.kind, breed: null, status: sheet.flock.status, version: 3, placed_on: sheet.flock.placed_on, placed_count: sheet.flock.placed_count,
      age_days_at_placement: sheet.flock.age0, age_days: 20, days_since_placement: 21, dead_total: 30, culled_total: 2, live: 3968, live_start_today: 3972, mortality_pct: '0.64',
      feed_kg_total: '0.000', feed_days: 0, feed_span_days: 20, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 2,
    });
    const overviewOf = (sheet, canManage = true) => ({
      today: TODAY,
      sites: [
        {
          id: 's-1', name: sheet.flock.site_name, division_id: 'd-1', kind: sheet.flock.kind, can_manage: canManage,
          halls: [
            { id: 'h-6', name: '6', capacity: 6000, version: 1, flock: null },
            { id: sheet.flock.hall_id, name: sheet.flock.hall_name, capacity: 6000, version: 1, flock: summaryOf(sheet) },
            { id: 'h-8', name: '8', capacity: 6000, version: 1, flock: null },
          ],
        },
      ],
    });
    let root = null;
    const fresh = (role, handlers, { userId = 'u-hs', send } = {}) => {
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
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
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
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      m.onlineStore.set(true);
    };
    const sheetSetup = (sheet = BROILER, extra = {}, canManage = true) => ({ loadOverviewJson: () => overviewOf(sheet, canManage), hall_sheet: () => clone(sheet), ...extra });
    const sheetTable = () => tableBy('هلاكات قاعة (7)');
    // التاريخ في صفّ الورقة يوم/شهر (السنة في سطر «وجبة»: مراجعة 0035، عرض 360).
    const rowOn = (on) => bodyRows(sheetTable()).find((tr) => cells(tr)[1]?.startsWith(m.fmtDay(on).slice(0, 5))) ?? null;
    const cellIn = (on, action) => (rowOn(on) ? byAction(action, rowOn(on))[0] ?? null : null);
    const queue = async (userId = 'u-hs') => {
      const db = await m.openOutbox();
      const owner = { userId, orgId: 'org-1', displayName: 'علي' };
      return { pending: await m.pendingOps(db, owner), review: await m.reviewEntries(db, owner) };
    };

    // ── S: الورقة ───────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S1', async () => {
      const { calls } = fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      t.same(named(calls, 'hall_sheet'), [[F7]], 'S1 الورقة بقراءة hall_sheet واحدة لفوج القاعة');
      t.same([textOf('sheet-title'), textOf('sheet-batch')?.startsWith('وجبة 13/11/2026')], ['هلاكات قاعة (7)', true], 'S1 العنوان «هلاكات قاعة (7)» وتحته «وجبة 13/11/2026»');
      t.same(headers(sheetTable()), ['العمر', 'التاريخ', 'الهلاكات', 'الغاز', 'العلف (كغم)', 'الملاحظات'], 'S1 أعمدة الورقة: العمر | التاريخ | الهلاكات | الغاز | العلف | الملاحظات');
      const rows = bodyRows(sheetTable());
      t.same([rows.length, cells(rows[0]).slice(0, 2), cells(rows.at(-1)).slice(0, 2)], [46, ['0', '13/11'], ['45', '28/12']], 'S1 صفّ لكلّ يوم من عمر 0 حتى نهاية الوجبة، ولو بلا شيء (التاريخ يوم/شهر، والسنة في سطر «وجبة»)');
      const today = rowOn(TODAY);
      t.same([today?.getAttribute('data-tone'), byAction('sheet-today').length, byAction('sheet-today', today ?? body()).length, cells(today).slice(0, 5)], ['mark', 1, 1, ['20', '03/12اليوم', '4', '', '300']], 'S1 صفّ اليوم معلَّم («اليوم» وخلفية الصفّ المختار) بقيمه');
      const box = ancestor(sheetTable(), (n) => (n.getAttribute?.('class') ?? '').includes('overflow-auto'));
      t.ok(box && box.scrollTop > 0, `S1 الجدول مُمرَّر إلى صفّ اليوم عند الفتح (scrollTop ${box?.scrollTop})`);
      t.same(
        [cells(rowOn('2026-11-15')).slice(2, 4), cells(rowOn('2026-11-13')).slice(2, 5), cells(rowOn('2026-11-20')).slice(2, 5), cells(rowOn('2026-11-19')).slice(2, 6), cells(rowOn('2026-11-16'))[5]],
        [['5', '3'], ['', '4', '100منقول'], ['5', '', '200'], ['', '', '', ''], 'تلقيح نيوكاسل'],
        'S1 المستبعد القديم داخل الهلاكات (3 + 2)، واليوم بلا صفّ فارغ لا صفر، وعلف 20/11 الذي خرج يوم 01/12 في يومه، والملاحظة',
      );
      t.same(cells(footRow(sheetTable())), ['المجموع', '32', '17', '1,000', ''], 'S1 صفّ المجموع من الخادم (totals)');
      t.ok(!text().includes('المستبعد'), 'S1 لا «المستبعد» في الورقة');
      const back = encodeURIComponent(`/broiler/hall/${H7}`);
      t.same(
        [textOf('sheet-feed'), hrefOf('sheet-sell'), hrefOf('sheet-report'), textOf('sheet-edit'), hrefOf('sheet-close'), byAction('sheet-reopen').length],
        ['أرسل علفاً', `/halls/ticket/new?site=s-1&hall=${H7}&back=${back}`, `/halls/report/${F7}?back=${back}`, 'عدّل الوجبة', `/halls/close/${F7}?back=${back}`, 0],
        'S1 صفّ الأفعال الكبيرة: «أرسل علفاً» و«بيع» (تذكرة الوزن بحقلها وقاعتها) و«التقرير» و«عدّل الوجبة» و«أغلق الوجبة»، بلا قوائم داخل قوائم',
      );
      t.same([hrefOf('hall-prev'), hrefOf('hall-next')], ['/broiler/hall/h-6', '/broiler/hall/h-8'], 'S1 القاعة السابقة والتالية في الحقل');
    });

    await step('S2 المركون', async () => {
      let decided = 0;
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { decide_flock_reject: () => { decided += 1; return { status: 'saved' }; } }));
      await mount(`/broiler/hall/${H7}`);
      const lines = byAction('sheet-reject').map((n) => descendants(n).find((c) => c.localName === 'span')?.textContent ?? null);
      t.same(
        lines,
        ['يوم 19/11/2026: الهلاكات 7 — كان اليوم أقدم من سبعة أيام قبل أن يُرفع هذا الحدّ.', 'يوم 21/11/2026: الغاز 2 — كان اليوم في فترة حسابات مقفلة.'],
        'S2 كلّ مركون بجملة: يومه، وما حمله، ولماذا',
      );
      await click(byAction('reject-handled')[0]);
      await click(byAction('reject-refused')[1]);
      t.same([named(calls, 'decide_flock_reject'), decided, named(calls, 'hall_sheet').length >= 3], [[[BROILER.rejects[0].id, 'handled', 1], [BROILER.rejects[1].id, 'refused', 2]], 2, true], 'S2 «أُدخلت» handled و«تجاهل» refused بنسخة المركون كما عُرض، ثمّ تُقرأ الورقة من جديد');
    });

    await step('S3 البيّاض', async () => {
      fresh('manager', sheetSetup(LAYER));
      await mount(`/layers/hall/${LAYER.flock.hall_id}`);
      const table = tableBy('هلاكات قاعة (3)');
      t.same([headers(table), cells(footRow(table))], [['العمر', 'التاريخ', 'الهلاكات', 'الغاز', 'العلف (كغم)', 'البيض', 'الملاحظات'], ['المجموع', '4', '3', '100', '11,240', '']], 'S3 البيّاض بعمود البيض ومجموعه');
    });

    // ── E: الخانات ──────────────────────────────────────────────────────────────────────────────────────────────────
    await step('E1 هلاكات اليوم بثلاث لمسات', async () => {
      const { sent, calls } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn(TODAY, 'cell-dead'));
      const dialog = dialogTitled('الهلاكات — يوم 03/12/2026');
      t.same([Boolean(dialog), textOf('cell-current', dialog ?? body())], [true, 'المسجّل الآن: 4'], 'E1 لمسة الخانة تفتح ورقة الهلاكات بلوحة الأرقام والمسجّل');
      await click(key(dialog, '7'));
      await click(byAction('cell-done', dialogTitled('الهلاكات') ?? body())[0], 120);
      t.same(
        sent.map((op) => [op.fn, op.flockId, op.day, op.payload, op.baseVersion]),
        [['save_flock_day', F7, TODAY, { dead: 7, culled: null }, 1]],
        'E1 ثلاث لمسات (الخانة، 7، «تم»): save_flock_day بهلاكات اليوم ونسخة صفّه (لا مستبعد يُصفَّر)',
      );
      t.same([dialogTitled('الهلاكات') === null, globalThis.__hs.toasts.at(-1)?.title, named(calls, 'hall_sheet').length], [true, 'حُفظ.', 2], 'E1 النافذة تُغلق و«حُفظ.» والورقة تُقرأ من جديد');
    });

    await step('E2 المستبعد القديم يُصفَّر', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn('2026-11-15', 'cell-dead'));
      const dialog = dialogTitled('الهلاكات — يوم 15/11/2026');
      t.ok(textOf('cell-current', dialog ?? body())?.includes('منها 2 مستبعد قديم'), 'E2 الورقة تقول إنّ المستبعد القديم داخل الرقم');
      await click(key(dialog, '4'));
      await click(byAction('cell-done', dialog ?? body())[0], 120);
      t.same(sent.map((op) => [op.payload, op.baseVersion]), [[{ dead: 4, culled: 0 }, 2]], 'E2 هلاكات يومٍ فيه مستبعد قديم: النافق الجديد والمستبعد صفر بنسخة الصفّ');
    });

    await step('E3 يوم قبل 20 يوماً', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      const old = '2026-11-13';
      t.same([cellIn(old, 'cell-dead')?.localName, cellIn(old, 'cell-gas')?.localName, cellIn(old, 'cell-note')?.localName], ['button', 'button', 'button'], 'E3 خانات يومٍ قبل 20 يوماً تُلمس (لا حدّ أيام سبعة)');
      await click(cellIn(old, 'cell-dead'));
      await click(key(dialogTitled('الهلاكات'), '2'));
      await click(byAction('cell-done', dialogTitled('الهلاكات') ?? body())[0], 120);
      t.same(sent.map((op) => [op.day, op.payload.dead, op.baseVersion]), [[old, 2, null]], 'E3 تُحفظ بالخطوات نفسها، بنسخة null (لا صفّ بعد)');
    });

    await step('E4 الغاز بالطابور', async () => {
      const { sent } = fresh('hall_worker', sheetSetup(), { userId: 'u-gas' });
      await mount(`/broiler/hall/${H7}`);
      m.onlineStore.set(false);
      await settle();
      const day = '2026-11-17';
      await click(cellIn(day, 'cell-gas'));
      t.ok(textOf('cell-offline', dialogTitled('الغاز') ?? body())?.includes('بلا اتصال'), 'E4 بلا اتصال: الورقة تقول إنّه يُحفظ على الجهاز');
      await click(key(dialogTitled('الغاز'), '3'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      t.same([sent.length, cells(rowOn(day))[3]], [0, '3بانتظار الرفع'], 'E4 بلا نت لا إرسال، والخانة بقيمتها و«بانتظار الرفع»');
      await click(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '5'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      const { pending } = await queue('u-gas');
      t.same(pending.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), [['set_flock_gas', day, { cylinders: 5 }, null]], 'E4 تعديل ثانٍ قبل الرفع يندمج بالعملية نفسها (فوج + يوم)، بنسخة صفّ الغاز');
      m.onlineStore.set(true);
      await settle(120);
      await click(byAction('hall-reread')[0] ?? null);
      // الرفع يحدث مع الحفظ التالي أو من الجولة؛ هنا من خانة أخرى بنت.
      await click(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '6'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      t.same(sent.map((op) => [op.fn, op.payload.cylinders]), [['set_flock_gas', 6]], 'E4 بنت: عملية غاز واحدة بآخر قيمة (set_flock_gas)');
      t.eq((await queue('u-gas')).pending.length, 0, 'E4 الطابور فارغ بعد الرفع');
    });

    await step('E5 الملاحظة', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn('2026-11-16', 'cell-note'));
      const dialog = dialogTitled('الملاحظات');
      const area = dialog ? descendants(dialog).find((n) => n.localName === 'textarea') : null;
      t.eq(area?.value, 'تلقيح نيوكاسل', 'E5 الملاحظة بنصّها');
      type(area, 'تلقيح نيوكاسل ثانٍ');
      await settle();
      await click(byAction('cell-done', dialog ?? body())[0], 120);
      t.same(sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), [['save_flock_day', '2026-11-16', { note: 'تلقيح نيوكاسل ثانٍ' }, 1]], 'E5 الملاحظة save_flock_day بنسخة صفّ اليوم');
    });

    await step('E6 يوم قادم والوجبة المغلقة', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      t.same([cellIn('2026-12-04', 'cell-dead')?.localName, cellIn('2026-12-04', 'cell-gas')?.localName], ['span', 'span'], 'E6 يوم لم يأتِ: الخانة قراءة لا زرّ');
      await unmount();
      const closed = clone(BROILER);
      Object.assign(closed.flock, { status: 'closed', closed_on: '2026-12-02' });
      closed.can_write = false;
      closed.through = '2026-12-02';
      closed.days = closed.days.filter((day) => day.on <= '2026-12-02');
      fresh('manager', { hall_sheet: () => clone(closed) });
      await mount(`/broiler/flock/${F7}`);
      t.same(
        [all().filter((n) => n.localName === 'button' && /^cell-(?:dead|gas|eggs|note)$/u.test(n.getAttribute('data-action') ?? '')).length, textOf('sheet-read-only'), byAction('sheet-feed').length, byAction('sheet-close').length, hrefOf('sheet-reopen')],
        [0, 'الوجبة مغلقة: الورقة للقراءة فقط. «أعِد فتحها» لتعديلها.', 0, 0, `/halls/cycle/${F7}?back=%2Fbroiler%2Fhall%2F${H7}&act=reopen`],
        'E6 الوجبة المغلقة قراءة فقط: لا خانة كتابة تُلمس (خانة العلف تعرض ما أُرسل وحده) ولا «أرسل علفاً» ولا «أغلق»، و«أعِد فتحها» إلى التقرير المفصّل مفتوحاً عليها',
      );
    });

    await step('E7 حدّ الحيّ', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn(TODAY, 'cell-dead'));
      const dialog = dialogTitled('الهلاكات');
      for (const digit of ['9', '9', '9', '9']) await click(key(dialog, digit), 5);
      await click(byAction('cell-done', dialog ?? body())[0], 60);
      t.same([sent.length, Boolean(dialogTitled('الهلاكات')), text().includes('الهلاكات أكثر من الطيور الحيّة (3,972)')], [0, true, true], 'E7 9,999 أكثر من الحيّ (3,968 + 4 اليوم): يُمنع قبل الحفظ بجملته');
    });

    // ── F: العلف ────────────────────────────────────────────────────────────────────────────────────────────────────
    const feedOk = (request) => ({ ...clone(FIX.send_flock_feed), issue: { ...FIX.send_flock_feed.issue, qty: request.qty.toString().replace(/(\d{3})$/u, '.$1'), for_day: request.forDay, item_id: request.itemId } });
    await step('F1 علف اليوم بثلاث لمسات', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      const sentTable = dialog ? tableBy('ما أُرسل لهذا اليوم') : null;
      t.same([bodyRows(sentTable).map((tr) => cells(tr).slice(0, 4)), byAction('feed-void', dialog ?? body()).length], [[['علف نامي', '300', 'كغم', '03/12/2026']], 1], 'F1 ورقة اليوم بما أُرسل له و«ألغِ»');
      const chips = byAction('feed-item', dialog ?? body());
      t.same(
        chips.map((n) => [n.getAttribute('aria-checked'), n.textContent]),
        [['false', 'علف بادئعندك 1,200 كغم'], ['true', 'علف ناميعندك 850.5 كغم']],
        'F1 أعلاف «رصيد العلف» بعندك، وآخر علف لهذه القاعة مختار مسبقاً',
      );
      const unit = descendants(dialog ?? body()).find((n) => n.getAttribute('role') === 'radio' && n.getAttribute('aria-checked') === 'true' && n.textContent === 'كيس 50 كغم');
      t.ok(Boolean(unit), 'F1 الوحدة الكيس افتراضاً (والكيلو بجانبه)');
      await click(key(dialog, '2'));
      t.same([textOf('feed-base', dialog ?? body()), lines(byAction('feed-send', dialog ?? body())[0])], ['= 100 كغم', ['أرسل 100 كغم', 'من «علف نامي»']], 'F1 الكمية بالكيس وما تساويه بالكيلو، والزرّ يسمّي ما يُرسل بالكيلو وبسطرين (لا «2 كيس»)');
      await click(byAction('feed-send', dialog ?? body())[0], 120);
      const [request] = named(calls, 'send_flock_feed').map(([r]) => r);
      t.same(
        request && [UUID.test(request.clientRef), UUID.test(request.issueId), UUID.test(request.lineId), request.flockId, request.itemId, request.qty, request.forDay],
        [true, true, true, F7, GROWER, 100000n, TODAY],
        'F1 ثلاث لمسات (الخانة، 2، «أرسل»): send_flock_feed بـ100 كغم من آخر علف ليومه بمعرّفات من الجهاز',
      );
      t.same([dialogTitled('علف يوم') === null, globalThis.__hs.toasts.at(-1)?.title?.startsWith('أُرسل 100 كغم من «علف نامي» ليوم 03/12/2026')], [true, true], 'F1 النافذة تُغلق وتنبيه بما أُرسل');
    });

    await step('F2 علف يوم فات', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      t.eq(byAction('sheet-feed')[0]?.textContent, 'أرسل علفاً', 'F2 ضابط');
      await click(cellIn('2026-11-21', 'cell-feed'));
      const dialog = dialogTitled('علف يوم 21/11/2026');
      await click(descendants(dialog ?? body()).find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'كغم') ?? null);
      for (const digit of ['1', '2', '0']) await click(key(dialog, digit), 5);
      await click(byAction('feed-send', dialog ?? body())[0], 120);
      t.same(named(calls, 'send_flock_feed').map(([r]) => [r.qty, r.forDay]), [[120000n, '2026-11-21']], 'F2 علف يوم فات بالكيلو بيومه (for_day)، ويخرج من المخزن يوم تسجيله في الخادم');
    });

    await step('F3 النتيجة المجهولة', async () => {
      let attempt = 0;
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, {
        send_flock_feed: (request) => {
          attempt += 1;
          if (attempt === 1) throw new m.UnknownOutcomeError();
          return feedOk(request);
        },
      }));
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn(TODAY, 'cell-feed'));
      await click(key(dialogTitled('علف يوم'), '1'));
      await click(byAction('feed-send')[0], 120);
      t.same([textOf('feed-pending')?.startsWith('علف يوم 03/12/2026 لم يُعرف مصيره: أعد المحاولة.'), lines(byAction('feed-retry')[0])], [true, ['أعد المحاولة', 'علف يوم 03/12/2026: 50 كغم من «علف نامي»']], 'F3 لا نعرف إن صُرف: الطلب مجمَّد بيومه و«أعد المحاولة»');
      await click(byAction('dialog-close')[0]);
      await click(byAction('dialog-discard')[0] ?? null);
      t.eq(dialogTitled('علف يوم'), null, 'F3 ضابط: الورقة أُغلقت');
      await click(cellIn(TODAY, 'cell-feed'));
      t.ok(textOf('feed-retry')?.includes('علف يوم 03/12/2026: 50 كغم من «علف نامي»'), 'F3 إعادة فتح الورقة تعود مجمَّدة بالطلب نفسه (محفوظ خارج المكوّن)');
      await click(byAction('feed-retry')[0], 120);
      const [first, second] = named(calls, 'send_flock_feed').map(([r]) => r);
      t.same([second && [second.clientRef, second.issueId, second.lineId, second.qty] , named(calls, 'send_flock_feed').length], [first && [first.clientRef, first.issueId, first.lineId, first.qty], 2], 'F3 الإعادة بالمرجع والمعرّفات نفسها حرفاً، فلا يُصرف مرّتين');
    });

    await step('F4 «ألغِ»', async () => {
      const { calls } = fresh('manager', sheetSetup(BROILER, { void_flock_issue: () => ({ status: 'void', id: 'x', doc_no: 'FI-2026-0303', voided_on: TODAY }) }));
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn('2026-11-20', 'cell-feed'));
      await click(byAction('feed-void')[0]);
      t.eq(textOf('feed-void-text'), 'يُلغى صرف 200 كغم من «علف بادئ» ليوم 20/11/2026 (المستند FI-2026-0303)، ويعود العلف إلى «رصيد العلف» بحركة عكسية بتاريخ اليوم.', 'F4 التأكيد يسمّي المادّة والكمية واليوم والمستند ونتيجته');
      t.eq(named(calls, 'void_flock_issue').length, 0, 'F4 لا إلغاء قبل التأكيد');
      await click(byAction('feed-void-go')[0], 120);
      const [args] = named(calls, 'void_flock_issue');
      t.same(args && [args[0], args[1], UUID.test(args[2])], [BROILER.days.find((day) => day.on === '2026-11-20').feed[0].issue_id, 'تصحيح من ورقة القاعة', true], 'F4 void_flock_issue بالصرف وسببه ومرجعه');
    });

    await step('F5 بلا اتصال', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      m.onlineStore.set(false);
      await settle();
      await click(byAction('sheet-feed')[0]);
      const dialog = dialogTitled('علف يوم 03/12/2026');
      t.ok(dialog?.textContent.includes('إرسال العلف يحتاج اتصالاً بالإنترنت'), 'F5 بلا اتصال: جملة تقول إنّ الإرسال يحتاج اتصالاً');
      await click(key(dialog, '1'));
      t.same([byAction('feed-send', dialog ?? body())[0]?.getAttribute('disabled') !== null, named(calls, 'send_flock_feed').length], [true, 0], 'F5 «أرسل» مقفول ولا إرسال');
    });

    // ── Q: المركون على الجهاز ────────────────────────────────────────────────────────────────────────────────────────
    await step('Q المركون باقٍ ويُدلّ عليه', async () => {
      fresh('hall_worker', sheetSetup(), { userId: 'u-park', send: async () => ({ kind: 'parked', reason: 'period_locked' }) });
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn('2026-11-22', 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '2'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      const { pending, review } = await queue('u-park');
      t.same([pending.length, review.map((entry) => [entry.reason, entry.hint, entry.op.fn])], [0, [['parked', 'period_locked', 'set_flock_gas']]], 'Q المركون يبقى على الجهاز في رفّ المراجعة بسببه');
      t.same(
        [globalThis.__hs.toasts.at(-1)?.title, textOf('sheet-review') !== null, hrefOf('sheet-review')],
        ['لم يُحفظ: كان اليوم في فترة حسابات مقفلة.', true, '/broiler/round'],
        'Q التنبيه يقول السبب، والورقة تدلّ على ما بقي على الجهاز في «جولات تحتاج مراجعة»',
      );
    });

    // ── مراجعة 0035 (S2): كلّ حالة تفشل على c69c13f ─────────────────────────────────────────────────────────────────
    const owner = (userId) => ({ userId, orgId: 'org-1', displayName: 'علي' });
    /** رافع الخلفية (RoundQueue) حين يعود الاتصال: يرفع الطابور ولا يعيد قراءة الورقة بنفسه. */
    const background = async (userId) => {
      await m.uploadRounds(owner(userId), async () => ({ currentUserId: async () => userId, send: (op) => globalThis.__hs.send(op), lookup: async () => null }));
      await settle(120);
    };
    /** القراءة الأولى للورقة، وكلّ قراءة بعدها في الطريق لا تصل (شبكة بطيئة): الورقة المعروضة قديمة. */
    const slowRereads = (sheet = BROILER) => {
      let reads = 0;
      return () => (reads++ === 0 ? clone(sheet) : new Promise(() => {}));
    };
    const doneIn = async (title, rounds = 120) => click(byAction('cell-done', dialogTitled(title) ?? body())[0], rounds);

    await step('H1 رفع في الخلفية: ما حُفظ لا يرجع، والتعديل التالي بنسخته', async () => {
      let n = 0;
      const { sent, calls } = fresh('hall_worker', sheetSetup(BROILER, { hall_sheet: slowRereads() }), { userId: 'u-h1', send: async () => ({ kind: 'saved', version: 1 + ++n }) });
      await mount(`/broiler/hall/${H7}`);
      m.onlineStore.set(false);
      await settle();
      await click(cellIn(TODAY, 'cell-dead'));
      await click(key(dialogTitled('الهلاكات'), '7'));
      await doneIn('الهلاكات');
      t.same([sent.length, cells(rowOn(TODAY))[2]], [0, '7بانتظار الرفع'], 'H1 ضابط: بلا نت على الجهاز «بانتظار الرفع»');
      m.onlineStore.set(true);
      await background('u-h1');
      t.same(
        [sent.map((op) => [op.payload.dead, op.baseVersion]), cells(rowOn(TODAY))[2], named(calls, 'hall_sheet').length],
        [[[7, 1]], '7', 2],
        'H1 بعد رفع الخلفية: الخانة 7 محفوظةً (لا ترجع إلى 4 ولا «بانتظار الرفع») والقراءة الجديدة لم تصل، والورقة تُقرأ من جديد',
      );
      await click(cellIn(TODAY, 'cell-dead'));
      t.eq(textOf('cell-current', dialogTitled('الهلاكات') ?? body()), 'المسجّل الآن: 7', 'H1 الورقة تقول المحفوظ (7)');
      await click(key(dialogTitled('الهلاكات'), '9'));
      await doneIn('الهلاكات');
      t.same(sent.map((op) => [op.payload.dead, op.baseVersion]), [[7, 1], [9, 2]], 'H1 التعديل التالي بنسخة ما حُفظ (2) لا بنسخة القراءة القديمة (1) فيُرَدّ stale_day');
    });

    await step('H2 ملاحظة والقراءة بعد الحفظ في الطريق', async () => {
      let n = 0;
      const { sent } = fresh('hall_worker', sheetSetup(BROILER, { hall_sheet: slowRereads() }), { userId: 'u-h2', send: async () => ({ kind: 'saved', version: 1 + ++n }) });
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn(TODAY, 'cell-dead'));
      await click(key(dialogTitled('الهلاكات'), '7'));
      await doneIn('الهلاكات');
      await click(cellIn(TODAY, 'cell-note'));
      const dialog = dialogTitled('الملاحظات');
      type(dialog ? descendants(dialog).find((n2) => n2.localName === 'textarea') : null, 'تهوية');
      await settle();
      await doneIn('الملاحظات');
      t.same(sent.map((op) => [Object.keys(op.payload).sort().join(','), op.baseVersion]), [['culled,dead', 1], ['note', 2]], 'H2 الملاحظة بعد حفظ الهلاكات والقراءة في الطريق بنسخة ما حُفظ (2)، فلا stale_day');
    });

    await step('H3 غاز بلا نت ثمّ تعديله', async () => {
      const versions = { set_flock_gas: 0, save_flock_day: 1 };
      const { sent } = fresh('hall_worker', sheetSetup(BROILER, { hall_sheet: slowRereads() }), { userId: 'u-h3', send: async (op) => ({ kind: 'saved', version: ++versions[op.fn] }) });
      await mount(`/broiler/hall/${H7}`);
      const day = '2026-11-17';
      m.onlineStore.set(false);
      await settle();
      await click(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '3'));
      await doneIn('الغاز');
      m.onlineStore.set(true);
      await background('u-h3');
      t.eq(cells(rowOn(day))[3], '3', 'H3 الغاز المحفوظ يبقى ظاهراً بعد رفع الخلفية (لا يرجع فارغاً)');
      await click(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '5'));
      await doneIn('الغاز');
      t.same(sent.map((op) => [op.payload.cylinders, op.baseVersion]), [[3, null], [5, 1]], 'H3 تعديل الغاز بعد رفعه بنسخة صفّه المحفوظ (1) لا null فيُرَدّ stale_gas');
    });

    await step('D1 المركون يُعدّ مرّة ويُقرَّر فيه مرّة', async () => {
      const decided = [];
      fresh('hall_worker', sheetSetup(BROILER, { decide_flock_reject: (id, decision, version) => (decided.push([id, decision, version]), clone(FIX.decide_flock_reject.saved)) }), { userId: 'u-d1', send: async () => ({ kind: 'parked', reason: 'period_locked' }) });
      await mount(`/broiler/hall/${H7}`);
      // هذا الجهاز ركن غاز 21/11 (قنينتان، فترة مقفلة)، والخادم يعرض المركون نفسه.
      await click(cellIn('2026-11-21', 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '2'));
      await doneIn('الغاز');
      t.same(
        [(await queue('u-d1')).review.length, textOf('sheet-attention'), byAction('sheet-review').length, byAction('sheet-reject').length],
        [1, 'لم يُحفظ من الأجهزة: 2، وتفصيله تحت الجدول.', 0, 2],
        'D1 المركون على الجهاز والخادم واحد: يُعدّ مرّة (2 لا 3)، ولا تنبيه «على هذا الجهاز» له',
      );
      await click(byAction('reject-handled')[1], 120);
      t.same([decided, (await queue('u-d1')).review.length], [[[BROILER.rejects[1].id, 'handled', 2]], 0], 'D1 «أُدخلت» بنسخته يحذف نسخة هذا الجهاز من رفّ المراجعة معه');
    });

    await step('D2 المركون على وجبة مغلقة', async () => {
      const closed = clone(BROILER);
      Object.assign(closed.flock, { status: 'closed', closed_on: '2026-12-02' });
      closed.can_write = false;
      closed.through = '2026-12-02';
      closed.days = closed.days.filter((day) => day.on <= '2026-12-02');
      fresh('manager', { hall_sheet: () => clone(closed) });
      await mount(`/broiler/flock/${F7}`);
      t.same(
        [byAction('reject-handled').length, byAction('reject-refused').length, textOf('sheet-rejects-hint')],
        [0, 2, 'الوجبة مغلقة: أعِد فتحها لإدخاله، أو اضغط «تجاهل».'],
        'D2 الوجبة المغلقة: لا «أُدخلت» إلى جدول للقراءة، بل «تجاهل» وجملة «أعِد فتحها لإدخاله»',
      );
    });

    await step('D3 مركون تغيّر بعد عرضه', async () => {
      const decided = [];
      fresh('hall_worker', sheetSetup(BROILER, { decide_flock_reject: (id, decision, version) => (decided.push([id, version]), clone(FIX.decide_flock_reject.stale)) }));
      await mount(`/broiler/hall/${H7}`);
      await click(byAction('reject-refused')[1], 120);
      const line = byAction('sheet-reject')[1];
      t.same(
        [decided, line ? descendants(line).find((n2) => n2.localName === 'span')?.textContent : null, globalThis.__hs.toasts.at(-1)?.title],
        [[[BROILER.rejects[1].id, 2]], 'يوم 21/11/2026: الغاز 3 — كان اليوم في فترة حسابات مقفلة.', 'تغيّر هذا المركون منذ عُرض، فلم يُقرَّر فيه شيء: راجع محتواه الجديد ثمّ قرّر.'],
        'D3 stale_reject: لم يُقرَّر شيء، والمركون بمحتواه الجديد (الغاز 3) أمام صاحبه',
      );
      await click(byAction('reject-refused')[1], 120);
      t.same(decided.at(-1), [BROILER.rejects[1].id, 3], 'D3 القرار التالي بنسخة ما عُرض الآن (3)');
    });

    await step('E8 امسح الغاز', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn('2026-11-13', 'cell-gas'));
      const dialog = dialogTitled('الغاز');
      t.same([textOf('cell-current', dialog ?? body()), textOf('cell-clear', dialog ?? body()), byAction('cell-done', dialog ?? body())[0]?.getAttribute('disabled') !== null], ['المسجّل الآن: 4', 'امسح الغاز', true], 'E8 الغاز المسجّل يُمسح بزرّ «امسح الغاز» («تم» حين يُكتب رقم)');
      await click(byAction('cell-clear', dialog ?? body())[0], 120);
      t.same([sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), cells(rowOn('2026-11-13'))[3]], [[['set_flock_gas', '2026-11-13', { cylinders: null }, 1]], ''], 'E8 المسح set_flock_gas بقناني null ونسخة الصفّ، والخانة فارغة');
    });

    await step('F6 الطلب المجمَّد يسمّي يومه', async () => {
      fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: () => { throw new m.UnknownOutcomeError(); } }), { userId: 'u-f6' });
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn(TODAY, 'cell-feed'));
      await click(key(dialogTitled('علف يوم'), '1'));
      await click(byAction('feed-send')[0], 120);
      await click(byAction('dialog-close')[0]);
      await click(byAction('dialog-discard')[0] ?? null);
      await click(cellIn('2026-11-21', 'cell-feed'));
      const dialog = dialogTitled('علف يوم 21/11/2026');
      t.same(
        [Boolean(dialog), textOf('feed-pending', dialog ?? body())?.startsWith('علف يوم 03/12/2026 لم يُعرف مصيره'), lines(byAction('feed-retry', dialog ?? body())[0])?.[1], byAction('feed-send', dialog ?? body()).length],
        [true, true, 'علف يوم 03/12/2026: 50 كغم من «علف نامي»', 0],
        'F6 ورقة يوم آخر: الطلب المجمَّد بيومه هو (03/12) لا كأنّه ليوم الورقة، والإرسال مقفول حتى يُعرف مصيره',
      );
    });

    await step('F7 زرّ الإرسال بفواصل الآلاف وبسطرين', async () => {
      fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await click(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      await click(byAction('feed-unit', dialog ?? body()).find((n2) => n2.textContent === 'كغم') ?? null);
      for (const digit of ['2', '5', '0', '0']) await click(key(dialog, digit), 5);
      t.same(lines(byAction('feed-send', dialog ?? body())[0]), ['أرسل 2,500 كغم', 'من «علف نامي»'], 'F7 «أرسل 2,500 كغم» بفاصلة الآلاف، والعلف في سطر ثانٍ');
    });

    await step('F8 المنقول والمرتجع', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      t.same(byAction('cell-carry', rowOn('2026-11-13') ?? body()).map((n2) => n2.textContent), ['منقول'], 'F8 علف يوم التسكين معلَّم «منقول»');
      await click(cellIn('2026-11-13', 'cell-feed'));
      t.eq(textOf('feed-carry'), 'منقول من الوجبة السابقة: 50 كغم، داخل علف هذا اليوم (ليس صرفاً من المخزن).', 'F8 ورقة العلف تقول المنقول من الوجبة السابقة');
    });

    await step('L1 الورقة بعرض الهاتف', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      const table = sheetTable();
      const noteCell = ancestor(cellIn(TODAY, 'cell-note'), (n2) => n2.localName === 'td');
      const feedHead = descendants(section(table, 'thead') ?? body()).find((n2) => n2.localName === 'th' && n2.textContent === 'العلف (كغم)');
      t.same(
        [cells(rowOn(TODAY))[1], /min-w-48|whitespace-nowrap/u.test(classOf(noteCell)), /whitespace-nowrap/u.test(classOf(feedHead)), /px-3/u.test(classOf(noteCell))],
        ['03/12اليوم', false, false, false],
        'L1 التاريخ يوم/شهر، والملاحظات تلتفّ بلا عرض أدنى، ورأس العلف يلتفّ، والحشوة أضيق (العقد: ستّة أعمدة بعرض 360 بلا تمرير أفقيّ)',
      );
    });

    await step('T1 أهداف اللمس 44 نقطة', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      const rejectButtons = [...byAction('reject-handled'), ...byAction('reject-refused')];
      await click(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      const units = descendants(dialog ?? body()).filter((n2) => n2.getAttribute('role') === 'radio' && (n2.textContent === 'كغم' || n2.textContent === 'كيس 50 كغم'));
      t.same(
        [rejectButtons.length, rejectButtons.every((n2) => /\bh-11\b/u.test(classOf(n2))), /\bh-11\b/u.test(classOf(byAction('feed-void', dialog ?? body())[0])), units.length, units.every((n2) => /\bmin-h-11\b/u.test(classOf(n2)))],
        [4, true, true, 2, true],
        'T1 «أُدخلت» و«تجاهل» و«ألغِ» ووحدة العلف بارتفاع 44 نقطة على الأقل',
      );
    });

    await step('R2 عنوان التقرير بقاعة اسمها «قاعة 7» (عيّنة القاعدة)', async () => {
      fresh('viewer', { hall_sheet: () => clone(REAL.hall_sheet_broiler) });
      await mount(`/halls/report/${REAL.hall_sheet_broiler.flock.id}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      t.eq(textOf('batch-title'), 'تقرير وجبة قاعة 7 — حقل الورقة', 'R2 لا «قاعة قاعة 7» (العنوان نفسه للصورة والطباعة)');
    });

    await step('R3 خلاصة بالمرتجع والمنقول وصافي العلف', async () => {
      const closed = clone(BROILER);
      Object.assign(closed.flock, { status: 'closed', closed_on: '2026-12-02' });
      closed.can_write = false;
      closed.through = '2026-12-02';
      closed.days = closed.days.filter((day) => day.on <= '2026-12-02');
      closed.days.at(-1).feed_back_kg = '100.000';
      closed.totals.feed_back_kg = '100.000';
      Object.assign(closed.summary, { feed_back_kg: '100.000', feed_net_kg: '900.000', fcr: '0.383' });
      fresh('viewer', { hall_sheet: () => clone(closed) });
      await mount(`/halls/report/${F7}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      const rows = bodyRows(tableBy('خلاصة الوجبة')).map(cells);
      t.same(
        rows.filter((row) => row[0].startsWith('العلف') || row[0].startsWith('المرتجع') || row[0].startsWith('صافي العلف') || row[0].startsWith('معامل')),
        [['العلف المرسل (كغم)', '1,000'], ['العلف المرسل (أكياس)', '20'], ['المرتجع والمنقول (كغم)', '100'], ['صافي العلف (كغم)', '900'], ['معامل التحويل (صافي العلف ÷ صافي المباع)', '0.383']],
        'R3 المرسل كغم وأكياساً، والمرتجع والمنقول (حين فوق الصفر)، وصافي العلف، ومعامل التحويل على الصافي',
      );
      t.throws(() => m.parseHallSheet({ ...clone(BROILER), rejects: [{ ...clone(BROILER.rejects[0]), version: '1' }] }), 'R3 نسخة المركون نصّاً تُرفض (المفتاح الجديد بشكله)');
      t.throws(() => m.parseHallSheet((() => { const j = clone(BROILER); j.days[3].carry_in_kg = '10.000'; return j; })()), 'R3 منقول في غير يوم التسكين يُرفض');
    });

    // ── R: تقرير الوجبة ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('R تقرير الوجبة', async () => {
      fresh('viewer', { hall_sheet: () => clone(BROILER) });
      await mount(`/halls/report/${F7}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      t.eq(textOf('batch-title'), 'تقرير وجبة قاعة 7 — حقل الشمال', 'R العنوان');
      const summary = bodyRows(tableBy('خلاصة الوجبة')).map(cells);
      t.same(
        summary,
        [
          ['الداخل', '5,000'], ['الهلاكات', '32'], ['نسبة الهلاكات', '0.64%'], ['الباقي', '3,968'], ['العلف المرسل (كغم)', '1,000'], ['العلف المرسل (أكياس)', '20'], ['صافي العلف (كغم)', '1,000'],
          ['الغاز (قناني)', '17'], ['المباع (طير)', '1,000'], ['صافي وزن المباع (كغم)', '2,350.5'], ['معدّل وزن الطير (كغم)', '2.351'], ['معامل التحويل (صافي العلف ÷ صافي المباع)', '0.425'],
        ],
        'R الخلاصة من الخادم: الداخل والهلاكات ونسبتها والباقي والعلف المرسل كغم وأكياساً وصافي العلف (بلا مرتجع: لا سطر له) والغاز والمباع وصافيه ومعدّله ومعامل التحويل على الصافي',
      );
      // حساب الخلاصة من أيام العيّنة: تتّسق بتعريفاتها (النسبة = الهلاكات ÷ الداخل، والمعدّل = الصافي ÷ المباع، والمعامل = العلف ÷ الصافي، والأكياس = العلف ÷ 50).
      const s = BROILER.summary;
      const milli = (text) => BigInt(text.replace('.', ''));
      const half = (num, den) => (num % den) * 2n >= den ? num / den + 1n : num / den;
      const days = BROILER.days;
      const feed = days.reduce((sum, day) => sum + (day.feed_kg ? milli(day.feed_kg) : 0n), 0n);
      const net = days.reduce((sum, day) => sum + (day.sold_net_kg ? milli(day.sold_net_kg) : 0n), 0n);
      const dead = days.reduce((sum, day) => sum + day.dead, 0);
      const sold = days.reduce((sum, day) => sum + day.sold_birds, 0);
      t.same(
        [dead, s.placed - dead - sold, half(BigInt(dead) * 10000n, BigInt(s.placed)), feed, half(feed * 1000n, 50000n), half(net, BigInt(sold)), half(feed * 1000n, net)],
        [s.dead, s.live, milli(s.mortality_pct), milli(s.feed_kg), milli(s.feed_bags), milli(s.avg_weight_kg), milli(s.fcr)],
        'R حساب الخلاصة من أيام العيّنة يساوي خلاصة الخادم (بالتقريب الواحد)',
      );
      const table = tableBy('أيام الوجبة');
      const rows = bodyRows(table).map(cells);
      t.same(
        [headers(table), rows.length, rows.at(-1)?.slice(0, 7), rows.find((row) => row[1] === '20/11/2026')?.slice(2, 7)],
        [
          ['العمر', 'التاريخ', 'الهلاكات', 'مجموع الهلاكات', 'الغاز', 'العلف (كغم)', 'مجموع العلف (كغم)', 'المباع (طير)', 'صافي المباع (كغم)', 'الملاحظات'],
          21,
          ['20', '03/12/2026', '4', '32', '', '300', '1,000'],
          ['5', '22', '', '200', '450'],
        ],
        'R جدول الورقة حتى اليوم بمجموعَي الهلاكات والعلف التراكميين (علف 20/11 في يومه)، والمباع وصافيه، بلا وزن يوميّ ولا علف مأكول',
      );
      t.same(cells(footRow(table)).slice(0, 5), ['المجموع', '32', '', '17', '1,000'], 'R صفّ المجموع من الخادم (والتراكميّ بلا مجموع)');
      t.same(
        [textOf('batch-image'), textOf('batch-print'), hrefOf('batch-detailed'), text().includes('الوزن'), text().includes('المأكول')],
        ['أرسل صورة', 'اطبع / PDF', `/halls/cycle/${F7}?back=%2Fhalls%2Freport%2F${F7}`, false, false],
        'R «أرسل صورة» و«اطبع / PDF»، والتقرير المفصّل رابطٌ؛ ولا وزن ولا مأكول',
      );
      t.same(
        ['batch-image', 'batch-print'].map((action) => [byAction(action).length, /\bh-11\b/u.test(classOf(byAction(action)[0])), /\bh-9\b/u.test(classOf(byAction(action)[0]))]),
        [[1, true, false], [1, true, false]],
        'T1 «أرسل صورة» و«اطبع / PDF» في تقرير الوجبة بارتفاع 44 نقطة على الأقل (h-11، لا h-9)',
      );
    });
  } finally {
    if (savedRect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', savedRect);
    else delete Element.prototype.getBoundingClientRect;
    if (savedClient) Object.defineProperty(Element.prototype, 'clientHeight', savedClient);
    else delete Element.prototype.clientHeight;
    delete Element.prototype.scrollTop;
    delete globalThis.__hs;
    restore();
  }
}
