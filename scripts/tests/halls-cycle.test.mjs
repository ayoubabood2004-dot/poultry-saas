// تقرير الدورة الكامل (0027، كلمة المالك 2026-11-12؛ docs/HALLS_REPORTS_PLAN.md التسليم ١، العقد §2): react-dom/client الحقيقي على DOM صغير
// (dom.mjs) يشغّل صفحة التقرير الحقيقية ورسومها، وrepo القاعات الحقيقي (parseCycleReport) على core بديل يجيب بأجوبة العقد (fixtures/halls-contract.json:
// المفاتيح الجديدة محسوبة من صفوف خام بتعريفات العقد، بأداة طابقت عيّنات القاعدة الحقيقية الخمس حرفاً بحرف). الحالات:
// P المحلّل: الأنواع والقيم، وnull لا صفر، والمفاتيح الأربعة معاً أو لا شيء (خادم قبل 0027)، وخطأ الشكل لكلّ نوع خاطئ؛ واتّساق العيّنات بتعريفات العقد.
// K المؤشّرات: كلّ قيمة، وكلّ «—» بسببه (معامل التحويل ومؤشّر الإنتاج والعلف لكلّ طير والوزن وتقرير بلا أيّام)، واللاحم والبيّاض.
// W وD وG: جداول الأسابيع والأيّام والأوزان بصفوفها ومجاميعها (من مؤشّرات الخادم، وتساوي جمع الصفوف)، وأعمدة البيّاض، ويوم بلا جولة.
// C الرسوم: ثلاثة بعنوان ووصف، وبلا NaN في أيّ مسار أو إحداثيّ، وتسمياتها، وأسبوع بلا علف، ويوم واحد، وبلا بيانات.
// M المال لأدوار الكلفة وحدها كما كان؛ PR الطباعة؛ O خادم قبل 0027؛ X عيّنات القاعدة الحقيقية (reports-0027.json) حين تكون في الشجرة.
// S مراجعة 0027 (S1–S4 وS6، على 52ca9fd: feed_given_unweighed وfeed_given_cum_unweighed لكلّ يوم): المجموع بلا جولة «—»، واكتمال الجولات تحت «الحيّ»
//   بعدّ قسم الأيّام نفسه، وسطور اليوم بلا وزن في جدول الأيّام، وسبب «—» مؤشّر الإنتاج، ورسم العلف بلا تراكب في الدورات الطويلة. كلّ فحص منها يفشل على
//   52ca9fd بمفاتيح المحلّل وحدها.
// RR27 المراجعة الثانية لـ0027 (على 781f78b): مجموع «النازل» في جدول الأيّام تحته سطور الدورة بلا وزن كصفوفه، وجملة فوق الجدول للتراكميّ والباقي معاً
//   (S3b)؛ و«العلف الباقي» السالب على الموزون وحده حين نزل علف بلا وزن (F2a). كلّ فحص منها يفشل على 781f78b.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-contract.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__hc.session; export const sessionStore = { get: () => globalThis.__hc?.session ?? { status: "loading" } };',
  Toast: 'export const toast = () => {}; export function Toaster() { return null; }',
};
const stubs = {
  name: 'cycle-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'cycle-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'cycle-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__hc.rpc(fn, args);
export const send = async () => { throw new Error('halls-cycle: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'cycle-core',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'cycle-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'cycle-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as ReportPage } from './src/pages/halls/ReportPage.tsx';",
    "export * as charts from './src/pages/halls/charts.tsx';",
    "export * as repo from './src/lib/repo/halls.ts';",
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
    plugins: [stubs, coreStub],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const byPart = (root, name) => descendants(root).filter((n) => n.getAttribute('data-part') === name);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
const tableRows = (caption) => {
  const table = tableOf(caption);
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableFoot = (caption) => {
  const table = tableOf(caption);
  const tfoot = table ? descendants(table).find((n) => n.localName === 'tfoot') : null;
  return tfoot ? tfoot.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableHeaders = (caption) => {
  const table = tableOf(caption);
  return table ? descendants(table).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null;
};
const styleText = () => all().filter((n) => n.localName === 'style').map((n) => n.textContent).join('\n');
/** مبلغ كما يعرضه fmtMoney (فواصل الآلاف ومرتبتان)، في عقدة نصّ وحدها. */
const MONEY_SHAPE = /\d{1,3}(?:,\d{3})+\.\d{2}(?!\d)/u;
const textNodes = (node) => {
  const out = [];
  const walk = (current) => {
    for (const child of current.childNodes) {
      if (child.nodeType === 3) out.push(child.nodeValue);
      else walk(child);
    }
  };
  walk(node);
  return out;
};
const showsMoney = () => textNodes(body()).some((value) => MONEY_SHAPE.test(value));
/** كلّ سمة في الرسوم (المسارات والإحداثيّات والنصوص): لا NaN ولا undefined ولا null ولا Infinity. */
const BAD_VALUE = /NaN|undefined|null|Infinity/u;
const badChartAttributes = () =>
  all()
    .filter((n) => n.namespaceURI === 'http://www.w3.org/2000/svg')
    .flatMap((n) => [...n._attrs].filter(([, value]) => BAD_VALUE.test(value)).map(([name, value]) => `${n.localName}.${name}=${value}`));
/** المؤشّرات بمفتاح: [القيمة، نوع الملاحظة (reason لسبب «—»، note لملاحظة، none بلا)، نصّها]. */
const KPI = 'مؤشّرات الدورة';
const keyed = (action, key) => byAction(action).find((n) => n.getAttribute('data-key') === key);
const kpiOf = (key) => {
  const value = keyed('kpi-value', key);
  const reason = keyed('kpi-reason', key);
  const note = keyed('kpi-note', key);
  return value ? [value.textContent, reason ? 'reason' : note ? 'note' : 'none', (reason ?? note)?.textContent ?? ''] : null;
};
/** جدول المؤشّرات صفّاً صفّاً: [المؤشّر، القيمة، الملاحظة تحت المؤشّر]. */
const kpiTable = () =>
  byAction('kpi-label').map((label) => {
    const key = label.getAttribute('data-key');
    return [label.textContent, keyed('kpi-value', key)?.textContent ?? null, (keyed('kpi-reason', key) ?? keyed('kpi-note', key))?.textContent ?? ''];
  });
/** إحداثيّات مسار من M وL: [[x, y], …]. */
const pointsOf = (d) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/gu)].map((match) => [Number(match[1]), Number(match[2])]);

const FLOCK = '00000000-0000-4000-8000-000000000001';
const LAYER = '00000000-0000-4000-8000-000000000002';
const ws = (role) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['broiler_farm', 'layer_farm'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: true,
  invites: [], subscription: 'active', confirmedAt: 1,
});
const MANAGER = { status: 'ready', workspace: ws('manager') };
const WORKER = { status: 'ready', workspace: ws('hall_worker') };

/** تقرير اللاحم بمؤشّرات معدّلة (حالات «—»): الأيّام والأسابيع كما هي، والمؤشّرات وحدها تتغيّر. */
const withKpis = (over) => {
  const report = clone(F.flock_cycle_report);
  Object.assign(report.kpis, over);
  return report;
};

export default async function (t) {
  const restore = installDom();
  let root = null;
  let m = null;
  const printed = [];
  globalThis.window.print = () => printed.push(globalThis.document.title);
  globalThis.document.title = 'نظام الدواجن';
  try {
    m = await bundle();
    const fresh = (session, report) => {
      const rpcLog = [];
      globalThis.__hc = {
        session,
        rpc(fn, args) {
          rpcLog.push([fn, args]);
          if (fn !== 'flock_cycle_report') return new Promise(() => {});
          return Promise.resolve().then(() => (typeof report === 'function' ? report(args) : clone(report)));
        },
      };
      return { rpcLog };
    };
    const mount = async (flockId = FLOCK) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() =>
        root.render(
          m.h(m.MemoryRouter, { initialEntries: [`/halls/report/${flockId}`] }, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) }))),
        ),
      );
      await settle();
      await settle();
    };
    const unmount = async () => {
      if (!root) return;
      const mounted = root;
      root = null;
      m.flushSync(() => mounted.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };
    const parse = (value) => m.repo.parseCycleReport(value);
    const shapeError = (value) => {
      try {
        parse(value);
        return null;
      } catch (error) {
        return error instanceof m.repo.HallsShapeError ? error.field : `other:${error}`;
      }
    };

    // ── P: المحلّل ─────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const cycle = parse(clone(F.flock_cycle_report)).cycle;
      const first = cycle.days[0];
      const last = cycle.days.at(-1);
      t.same(
        [cycle.days.length, first.on, first.age, first.dayNo, first.round, first.liveStart, first.dead, first.culled, first.liveEnd, first.mortalityCumPct, first.feedEatenKg, first.feedEatenCumKg, first.feedGivenKg, first.feedGivenCumKg, first.feedLeftKg, first.weight, first.eggsTotal, first.hdep, first.note],
        [11, '2026-11-01', 1, 1, true, 1000, 2, 0, 998, 20n, 100_000n, 100_000n, 1_000_000n, 1_000_000n, 900_000n, null, null, null, null],
        'P1 أوّل يوم بأنواعه: الكيلو بالآلاف والنسبة بمرتبتين والعدد رقماً',
      );
      t.same(
        [last.on, last.round, last.dead, last.culled, last.feedEatenKg, last.liveStart, last.liveEnd, last.feedEatenCumKg, last.feedGivenKg],
        ['2026-11-11', false, null, null, null, 987, 987, 1_450_500n, 0n],
        'P1 يوم بلا جولة: نافقه ومستبعده وعلفه null لا صفر، والحيّ لا ينقص، والنازل صفر حقيقيّ («0»)',
      );
      t.same(cycle.days[3].weight, { sampleCount: 40, avgG: 1150n }, 'P1 وزن اليوم بأعشار الغرام');
      t.same(
        [cycle.days.map((day) => day.feedGivenUnweighed), cycle.days.map((day) => day.feedGivenCumUnweighed)],
        [[0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]],
        'P1 سطور العلف بلا وزن في اليوم وحتى اليوم (52ca9fd): سطر القطع بلا وزن يوم 08/11 يُعدّ يومه وكلّ يوم بعده',
      );
      t.same(
        cycle.weeks.map((week) => [week.week, week.fromAge, week.toAge, week.fromOn, week.toOn, week.days, week.roundDays, week.dead, week.culled, week.mortalityPct, week.mortalityCumPct, week.liveEnd, week.feedEatenKg, week.feedGPerBirdDay, week.weight, week.fcr]),
        [
          [1, 1, 7, '2026-11-01', '2026-11-07', 7, 7, 8, 1, 90n, 90n, 991, 910_500n, 1307n, { on: '2026-11-07', age: 7, avgG: 1855n }, 4953n],
          [2, 8, 11, '2026-11-08', '2026-11-11', 4, 3, 3, 1, 40n, 130n, 987, 540_000n, 1819n, { on: '2026-11-10', age: 10, avgG: 2800n }, 5249n],
        ],
        'P1 الأسابيع بعمر الطيور (العمر 1 في الأوّل)',
      );
      t.same(cycle.weights.map((w) => [w.on, w.age, w.sampleCount, w.avgG]), [['2026-11-04', 4, 40, 1150n], ['2026-11-07', 7, 40, 1855n], ['2026-11-10', 10, 50, 2800n]], 'P1 الأوزان الأقدم أوّلاً');
      t.same(
        cycle.kpis,
        {
          days: 11, ageEnd: 11, placed: 1000, dead: 11, culled: 2, live: 987, mortalityPct: 130n, livabilityPct: 9870n,
          feedGivenKg: 2_000_000n, feedEatenKg: 1_450_500n, feedLeftKg: 549_500n, feedDays: 10, feedSpan: 10, feedPerBirdKg: 1451n,
          lastWeight: { on: '2026-11-10', age: 10, avgG: 2800n }, fcr: 5249n, epef: 48n,
        },
        'P1 المؤشّرات كلّها بأنواعها',
      );
      const layer = parse(clone(F.flock_cycle_report_layer)).cycle;
      t.same(
        [layer.days[0].eggsTotal, layer.days[0].hdep, layer.days[4].eggsTotal, layer.days[4].hdep, layer.kpis.lastWeight, layer.kpis.fcr, layer.kpis.epef, layer.kpis.feedLeftKg, layer.weeks.map((w) => w.week)],
        [3000, 7500n, null, null, null, null, null, -2_255_000n, [20, 21, 22]],
        'P2 البيّاض: البيض ونسبة الإنتاج، وnull ليوم بلا جولة، والمؤشّرات الناقصة null، والباقي سالب، وأسابيعه 20 و21 و22',
      );

      const old = clone(F.flock_cycle_report);
      for (const key of ['days', 'weeks', 'weights', 'kpis']) delete old[key];
      t.same([parse(old).cycle, parse(old).birds.dead], [null, 11], 'P3 خادم قبل 0027 (المفاتيح الأربعة غائبة): cycle null والتقرير القديم كما هو');
      const partial = clone(F.flock_cycle_report);
      delete partial.weeks;
      const noKpis = clone(F.flock_cycle_report);
      delete noKpis.kpis;
      t.same([shapeError(partial), shapeError(noKpis)], ['weeks', 'kpis'], 'P3 بعض المفاتيح دون بعض: خطأ شكل باسم الغائب');
      const broken = (mutate) => {
        const report = clone(F.flock_cycle_report);
        mutate(report);
        return shapeError(report);
      };
      t.same(
        [
          broken((r) => (r.days[0].dead = '2')),
          broken((r) => (r.days[0].round = 'yes')),
          broken((r) => (r.days[0].feed_left_kg = null)),
          broken((r) => (r.days[0].feed_eaten_kg = 'x')),
          broken((r) => (r.weeks[0].live_end = null)),
          broken((r) => (r.weights[0].avg_g = null)),
          broken((r) => (r.kpis.fcr = 1.629)),
          broken((r) => (r.kpis.days = null)),
          broken((r) => (r.kpis.last_weight = { on_date: '2026-11-10', age: 10 })),
          broken((r) => (r.days = null)),
          broken((r) => (r.kpis.epef = '47.9')),
          broken((r) => delete r.days[7].feed_given_unweighed),
          broken((r) => (r.days[9].feed_given_cum_unweighed = '1')),
        ],
        ['dead', 'round', 'feed_left_kg', 'feed_eaten_kg', 'live_end', 'avg_g', 'fcr', 'days', 'avg_g', 'days', 'epef', 'feed_given_unweighed', 'feed_given_cum_unweighed'],
        'P3 كلّ نوع خاطئ خطأ شكل باسم خانته (ومؤشّر الإنتاج عدد صحيح، وعدّا السطور بلا وزن إلزاميّان)',
      );

      // اتّساق العيّنات بتعريفات العقد: مجاميع الأيّام = مفاتيح birds وfeed وkpis، وسلسلة الحيّ، والأسابيع من الأيّام.
      for (const key of ['flock_cycle_report', 'flock_cycle_report_layer']) {
        const raw = F[key];
        const sum = (values) => values.reduce((total, value) => total + value, 0);
        const kg = (text) => BigInt(Math.round(Number(text) * 1000));
        const chain = raw.days.every((day, i) => i === 0 ? day.live_start === raw.flock.placed_count : day.live_start === raw.days[i - 1].live_end);
        const ends = raw.days.every((day) => day.live_end === day.live_start - (day.dead ?? 0) - (day.culled ?? 0));
        const noRoundNull = raw.days.every((day) => day.round || (day.dead === null && day.culled === null && day.feed_eaten_kg === null && day.eggs_total === null));
        const weekOf = (age) => Math.max(1, Math.floor((age + 6) / 7));
        const weeksOk = raw.weeks.every((week) => {
          const days = raw.days.filter((day) => weekOf(day.age) === week.week);
          const rounds = days.filter((day) => day.round);
          return days.length === week.days && rounds.length === week.round_days && days[0].on === week.from_on && days.at(-1).on === week.to_on
            && (rounds.length ? sum(rounds.map((day) => day.dead)) === week.dead : week.dead === null) && days.at(-1).live_end === week.live_end;
        });
        const lastDay = raw.days.at(-1);
        t.same(
          [
            sum(raw.days.map((day) => day.dead ?? 0)), sum(raw.days.map((day) => day.culled ?? 0)), lastDay.live_end, kg(lastDay.feed_eaten_cum_kg), kg(lastDay.feed_given_cum_kg),
            raw.days.length, raw.weeks.reduce((total, week) => total + week.days, 0), chain, ends, noRoundNull, weeksOk,
            raw.days.filter((day) => day.feed_eaten_kg !== null).length,
            sum(raw.days.map((day) => day.feed_given_unweighed)), lastDay.feed_given_cum_unweighed,
          ],
          [
            raw.birds.dead, raw.birds.culled, raw.birds.live, kg(raw.feed.consumed_kg), kg(raw.feed.delivered_kg),
            raw.kpis.days, raw.kpis.days, true, true, true, true,
            raw.kpis.feed_days,
            raw.feed.unweighed, raw.feed.unweighed,
          ],
          `P4 ${key}: مجموع الأيّام = الطيور والعلف (والمؤشّرات)، وسلسلة الحيّ، والأسابيع من الأيّام، وأيّام العلف`,
        );
      }
    }

    // ── K: المؤشّرات ──────────────────────────────────────────────────────────────────────────────────────────────
    await step('K1 مؤشّرات اللاحم', async () => {
      const { rpcLog } = fresh(MANAGER, F.flock_cycle_report);
      await mount();
      t.same(rpcLog.map(([fn, args]) => [fn, args]), [['flock_cycle_report', { p_flock: FLOCK }]], 'K1 نداء واحد بالفوج');
      t.same(
        [tableHeaders(KPI), tableRows(KPI).map((row) => row.length), tableRows(KPI)[0]],
        [['المؤشّر', 'القيمة'], Array(13).fill(2), ['أيّام الدورةمن 01/11/2026 حتى 11/11/2026.', '11']],
        'K1 جدول المؤشّرات بعمودين (يتّسع للهاتف): المؤشّر وملاحظته تحته، والقيمة',
      );
      t.same(
        kpiTable(),
        [
          ['أيّام الدورة', '11', 'من 01/11/2026 حتى 11/11/2026.'],
          ['العمر (يوم)', '11', 'العمر عند التسكين: 1.'],
          ['المسكَّن', '1,000', ''],
          ['الحيّ', '987', 'النافق 11 والمستبعد 2. سُجّلت الجولة في 10 من 11 يوماً.'],
          ['نسبة النفوق', '1.30%', ''],
          ['نسبة الحيوية', '98.70%', 'نسبة ما بقي حيّاً من المسكَّن.'],
          ['العلف النازل للقاعة (كغم)', '2,000', 'خارج الكيلو: سطر واحد بلا وزن.'],
          ['العلف المأكول المسجّل (كغم)', '1,450.5', 'سُجّل العلف 10 من 10 أيام.'],
          ['العلف الباقي في القاعة (كغم)', '549.5', ''],
          ['العلف لكلّ طير مسكَّن (كغم)', '1.451', ''],
          ['آخر وزن عيّنة (غم)', '280.0', 'يوم 10/11/2026، والعمر 10.'],
          ['معامل التحويل الغذائي', '5.249', 'كغم علف لكلّ كغم من الوزن الحيّ.'],
          ['مؤشّر الإنتاج (EPEF)', '48', 'الحيوية × الوزن بالكيلو ÷ (العمر × معامل التحويل) × 100.'],
        ],
        'K1 كلّ مؤشّر بقيمته وملاحظته',
      );
      const order = ['rep-kpis', 'rep-birds', 'rep-charts', 'rep-weeks', 'rep-days', 'rep-weights', 'rep-feed', 'rep-by-item', 'rep-balance', 'rep-medicines', 'rep-vaccines', 'rep-money'];
      const sections = all().filter((n) => n.localName === 'section').map((n) => n.getAttribute('data-action'));
      t.same(sections, order, 'K1 المؤشّرات أوّل التقرير، ثمّ الطيور والرسوم والأسابيع والأيّام والأوزان، ثمّ الأقسام القديمة كما هي');
      t.same([byAction('kpi-reason').length, byAction('rep-no-cycle').length], [0, 0], 'K1 لا «—» حين المدخلات كاملة');
    });

    const REASONS = [
      [
        'K2 علف ناقص يوماً',
        { feed_days: 9, fcr: null, epef: null },
        {
          eaten: ['1,450.5', 'note', 'سُجّل العلف 9 من 10 أيام.'],
          fcr: ['—', 'reason', 'يحتاج علف كلّ يوم من التسكين (سُجّل العلف 9 من 10 أيام).'],
          epef: ['—', 'reason', 'يحتاج معامل التحويل.'],
        },
      ],
      [
        'K3 بلا وزن عيّنة',
        { last_weight: null, fcr: null, epef: null },
        {
          weight: ['—', 'reason', 'لم تُوزن عيّنة بعد.'],
          fcr: ['—', 'reason', 'يحتاج وزن عيّنة.'],
          epef: ['—', 'reason', 'يحتاج معامل التحويل.'],
        },
      ],
      [
        'K4 علف ناقص وبلا وزن',
        { feed_days: 9, last_weight: null, fcr: null, epef: null },
        { fcr: ['—', 'reason', 'يحتاج علف كلّ يوم ووزن عيّنة (سُجّل العلف 9 من 10 أيام).'] },
      ],
      [
        'K5 علف مسجّل مجموعه صفر',
        { feed_eaten_kg: '0.000', feed_per_bird_kg: null, fcr: null, epef: null },
        {
          eaten: ['0', 'note', 'سُجّل العلف 10 من 10 أيام.'],
          per_bird: ['—', 'reason', 'لم يُسجَّل علف مأكول بعد.'],
          fcr: ['—', 'reason', 'العلف المسجّل صفر.'],
        },
      ],
      [
        'K6 لا طيور حيّة',
        { live: 0, mortality_pct: '100.00', livability_pct: '0.00', fcr: null, epef: null },
        { live: ['0', 'note', 'النافق 11 والمستبعد 2. سُجّلت الجولة في 10 من 11 يوماً.'], livability: ['0.00%', 'note', 'نسبة ما بقي حيّاً من المسكَّن.'], fcr: ['—', 'reason', 'لا طيور حيّة.'] },
      ],
      // مراجعة 0027 S4: حيوية قُرّبت إلى 0.00% والحيّ فوق الصفر (987) سببها التقريب لا «لا طيور حيّة.»، وهذه لحيّ صفر وحده (K7b).
      ['K7 مؤشّر الإنتاج بحيوية قُرّبت إلى صفر والحيّ فوقه', { livability_pct: '0.00', epef: null }, { live: ['987', 'note', 'النافق 11 والمستبعد 2. سُجّلت الجولة في 10 من 11 يوماً.'], fcr: ['5.249', 'note', 'كغم علف لكلّ كغم من الوزن الحيّ.'], epef: ['—', 'reason', 'نسبة الحيوية قُرّبت إلى صفر.'] }],
      ['K7b مؤشّر الإنتاج بلا طيور حيّة', { live: 0, mortality_pct: '100.00', livability_pct: '0.00', epef: null }, { live: ['0', 'note', 'النافق 11 والمستبعد 2. سُجّلت الجولة في 10 من 11 يوماً.'], epef: ['—', 'reason', 'لا طيور حيّة.'] }],
      ['K8 مؤشّر الإنتاج بعمر صفر', { age_end: 0, epef: null }, { age: ['0', 'note', 'العمر عند التسكين: 1.'], epef: ['—', 'reason', 'يحتاج عمراً أكبر من صفر.'] }],
      [
        'K9 أوّل يوم بلا علف ولا وزن',
        { feed_days: 0, feed_span: 0, last_weight: null, fcr: null, epef: null },
        { eaten: ['1,450.5', 'none', ''], fcr: ['—', 'reason', 'يحتاج أوّل جولة بعلفها ووزن عيّنة.'] },
      ],
      ['K10 أوّل يوم بوزن وبلا علف', { feed_days: 0, feed_span: 0, fcr: null, epef: null }, { fcr: ['—', 'reason', 'يحتاج أوّل جولة بعلفها.'] }],
      ['K11 مدخلات كاملة ولا معامل', { fcr: null, epef: null }, { fcr: ['—', 'reason', 'مدخلاته غير مكتملة.'], epef: ['—', 'reason', 'يحتاج معامل التحويل.'] }],
      ['K12 مؤشّر إنتاج بلا سبب ظاهر', { epef: null }, { epef: ['—', 'reason', 'مدخلاته غير مكتملة.'] }],
    ];
    for (const [label, over, expected] of REASONS) {
      await step(label, async () => {
        fresh(MANAGER, withKpis(over));
        await mount();
        const keys = Object.keys(expected);
        t.same(keys.map(kpiOf), keys.map((key) => expected[key]), `${label}: القيمة والسبب`);
        const dashes = byAction('kpi-value').filter((n) => n.textContent === '—').map((n) => n.getAttribute('data-key'));
        const reasons = byAction('kpi-reason').filter((n) => n.textContent.length > 0).map((n) => n.getAttribute('data-key'));
        t.same(reasons, dashes, `${label}: كلّ «—» بجانبه سببه، ولا سبب بلا «—»`);
      });
    }
    await step('K13 تقرير بلا أيّام', async () => {
      const report = clone(F.flock_cycle_report);
      Object.assign(report, { days: [], weeks: [], weights: [] });
      report.kpis = {
        days: 0, age_end: null, placed: 1000, dead: null, culled: null, live: null, mortality_pct: null, livability_pct: null,
        feed_given_kg: null, feed_eaten_kg: null, feed_left_kg: null, feed_days: null, feed_span: null, feed_per_bird_kg: null, last_weight: null, fcr: null, epef: null,
      };
      fresh(MANAGER, report);
      await mount();
      const NO = 'لا أيّام في التقرير بعد.';
      t.same(
        kpiTable(),
        [
          ['أيّام الدورة', '0', ''],
          ['العمر (يوم)', '—', NO],
          ['المسكَّن', '1,000', ''],
          ['الحيّ', '—', NO],
          ['نسبة النفوق', '—', NO],
          ['نسبة الحيوية', '—', NO],
          ['العلف النازل للقاعة (كغم)', '—', NO],
          ['العلف المأكول المسجّل (كغم)', '—', NO],
          ['العلف الباقي في القاعة (كغم)', '—', NO],
          ['العلف لكلّ طير مسكَّن (كغم)', '—', NO],
          ['آخر وزن عيّنة (غم)', '—', 'لم تُوزن عيّنة بعد.'],
          ['معامل التحويل الغذائي', '—', NO],
          ['مؤشّر الإنتاج (EPEF)', '—', NO],
        ],
        'K13 كلّ مؤشّر ناقص «—» بسببه: لا أيّام بعد (والوزن: لم تُوزن عيّنة)',
      );
      t.same(
        [tableRows('أيّام الدورة'), tableRows('الأسابيع'), ['chart-mortality', 'chart-feed', 'chart-weight'].map((name) => byPart(byAction(name)[0], 'chart-empty')[0]?.textContent ?? null), badChartAttributes()],
        [[['لا أيّام في التقرير بعد.']], [['لا أيّام في التقرير بعد.']], ['لا أيّام في التقرير بعد.', 'لم يُسجَّل علف مأكول بعد.', 'لم تُوزن عيّنة بعد.'], []],
        'K13 الجداول بجملة الفراغ، والرسوم بجملة بدل الرسم',
      );
    });
    await step('K14 مؤشّرات البيّاض', async () => {
      fresh(MANAGER, F.flock_cycle_report_layer);
      await mount(LAYER);
      t.same(
        kpiTable(),
        [
          ['أيّام الدورة', '11', 'من 01/11/2026 حتى 11/11/2026.'],
          ['العمر (يوم)', '150', 'العمر عند التسكين: 140.'],
          ['المسكَّن', '4,000', ''],
          ['الحيّ', '3,992', 'النافق 6 والمستبعد 2. سُجّلت الجولة في 10 من 11 يوماً.'],
          ['نسبة النفوق', '0.20%', ''],
          ['نسبة الحيوية', '99.80%', 'نسبة ما بقي حيّاً من المسكَّن.'],
          ['العلف النازل للقاعة (كغم)', '2,000', ''],
          ['العلف المأكول المسجّل (كغم)', '4,255', 'سُجّل العلف 9 من 11 يوماً.'],
          ['العلف الباقي في القاعة (كغم)', '-2,255', 'سالب: المأكول المسجّل أكثر من النازل للقاعة.'],
          ['العلف لكلّ طير مسكَّن (كغم)', '1.064', ''],
        ],
        'K14 البيّاض بلا وزن ولا معامل تحويل ولا مؤشّر إنتاج (للّاحم)، والباقي السالب بسببه',
      );
    });

    // ── W وD وG: الأسابيع والأيّام والأوزان ─────────────────────────────────────────────────────────────────────────────
    await step('W1 أسابيع اللاحم', async () => {
      fresh(MANAGER, F.flock_cycle_report);
      await mount();
      t.same(
        [tableHeaders('الأسابيع'), tableRows('الأسابيع'), tableFoot('الأسابيع')],
        [
          ['الأسبوع', 'العمر (يوم)', 'من', 'إلى', 'الجولات', 'النافق', 'المستبعد', 'نفوق الأسبوع', 'النفوق التراكميّ', 'الحيّ آخر الأسبوع', 'المأكول (كغم)', 'غم لكلّ طير في اليوم', 'الوزن (غم)', 'معامل التحويل'],
          [
            ['1', '1–7', '01/11/2026', '07/11/2026', '7 من 7', '8', '1', '0.90%', '0.90%', '991', '910.5', '130.7', '185.5', '4.953'],
            ['2', '8–11', '08/11/2026', '11/11/2026', '3 من 4', '3', '1', '0.40%', '1.30%', '987', '540.0', '181.9', '280.0', '5.249'],
          ],
          [['المجموع', '11', '2', '', '', '', '1,450.5', '', '', '']],
        ],
        'W1 الأسابيع بعمر الطيور بأعمدتها، والمجموع من المؤشّرات',
      );
      t.same(
        [byAction('week-rounds').map((n) => n.getAttribute('class')), textOf('rep-weeks-note')],
        [[null, 'font-semibold text-warn-800 dark:text-warn-200'], 'الأسبوع بعمر الطيور: الأوّل للأعمار حتى 7، والثاني من 8 إلى 14، وهكذا.'],
        'W1 أسبوع ناقص الجولات وحده بلون التنبيه، وسطر يشرح الأسبوع بعمر الطيور',
      );
    });
    await step('W2 أسابيع البيّاض', async () => {
      fresh(MANAGER, F.flock_cycle_report_layer);
      await mount(LAYER);
      t.same(
        [tableHeaders('الأسابيع'), tableRows('الأسابيع'), tableFoot('الأسابيع')],
        [
          ['الأسبوع', 'العمر (يوم)', 'من', 'إلى', 'الجولات', 'النافق', 'المستبعد', 'نفوق الأسبوع', 'النفوق التراكميّ', 'الحيّ آخر الأسبوع', 'المأكول (كغم)', 'غم لكلّ طير في اليوم'],
          [
            ['20', '140', '01/11/2026', '01/11/2026', '1 من 1', '1', '0', '0.03%', '0.03%', '3,999', '460', '115.0'],
            ['21', '141–147', '02/11/2026', '08/11/2026', '6 من 7', '4', '1', '0.13%', '0.15%', '3,994', '2,830', '118.0'],
            ['22', '148–150', '09/11/2026', '11/11/2026', '3 من 3', '1', '1', '0.05%', '0.20%', '3,992', '965', '120.8'],
          ],
          [['المجموع', '6', '2', '', '', '', '4,255', '']],
        ],
        'W2 البيّاض: أسابيع 20 إلى 22 بأعمارها، بلا وزن ولا معامل تحويل',
      );
    });
    await step('D1 أيّام اللاحم', async () => {
      fresh(MANAGER, F.flock_cycle_report);
      await mount();
      t.same(
        tableHeaders('أيّام الدورة'),
        ['التاريخ', 'العمر', 'الحيّ أوّل اليوم', 'النافق', 'المستبعد', 'الحيّ آخر اليوم', 'النفوق التراكميّ', 'المأكول (كغم)', 'المأكول التراكميّ (كغم)', 'النازل (كغم)', 'النازل التراكميّ (كغم)', 'الباقي في القاعة (كغم)', 'الوزن (غم)', 'الملاحظة'],
        'D1 أعمدة الأيّام',
      );
      t.same(
        tableRows('أيّام الدورة'),
        [
          ['01/11/2026', '1', '1,000', '2', '0', '998', '0.20%', '100.0', '100.0', '1,000', '1,000', '900.0', '', ''],
          ['02/11/2026', '2', '998', '1', '0', '997', '0.30%', '110.5', '210.5', '0', '1,000', '789.5', '', ''],
          ['03/11/2026', '3', '997', '1', '1', '995', '0.50%', '120.0', '330.5', '0', '1,000', '669.5', '', ''],
          ['04/11/2026', '4', '995', '2', '0', '993', '0.70%', '130.0', '460.5', '1,000', '2,000', '1,539.5', '115.0', ''],
          ['05/11/2026', '5', '993', '0', '0', '993', '0.70%', '140.0', '600.5', '0', '2,000', '1,399.5', '', ''],
          ['06/11/2026', '6', '993', '1', '0', '992', '0.80%', '150.0', '750.5', '0', '2,000', '1,249.5', '', 'تهوية'],
          ['07/11/2026', '7', '992', '1', '0', '991', '0.90%', '160.0', '910.5', '0', '2,000', '1,089.5', '185.5', ''],
          ['08/11/2026', '8', '991', '1', '1', '989', '1.10%', '170.0', '1,080.5', '0وسطر واحد بلا وزن', '2,000', '919.5', '', ''],
          ['09/11/2026', '9', '989', '1', '0', '988', '1.20%', '180.0', '1,260.5', '0', '2,000', '739.5', '', ''],
          ['10/11/2026', '10', '988', '1', '0', '987', '1.30%', '190.0', '1,450.5', '0', '2,000', '549.5', '280.0', 'حرارة مرتفعة'],
          ['11/11/2026', '11', '987', '—', '—', '987', '1.30%', '—', '1,450.5', '0', '2,000', '549.5', '', 'لم تُسجَّل الجولة'],
        ],
        'D1 كلّ يوم من التسكين إلى «حتى»، واليوم بلا جولة «—» لا صفر ومكتوب «لم تُسجَّل الجولة»',
      );
      t.same(tableFoot('أيّام الدورة'), [['المجموع', '11', '2', '', '', '1,450.5', '', '2,000وسطر واحد بلا وزن', '', '', '', '']], 'D1 المجموع من المؤشّرات: النافق والمستبعد والمأكول والنازل (وتحته سطر الدورة بلا وزن)');
      const rows = tableRows('أيّام الدورة');
      // الرقم أوّل الخلية (وتحته قد تكون ملاحظة «وسطر واحد بلا وزن»).
      const number = (text) => (text === '—' ? 0 : Number(/^-?[\d,.]+/u.exec(text)?.[0].replace(/,/gu, '') ?? NaN));
      const foot = tableFoot('أيّام الدورة')[0];
      t.same(
        [rows.reduce((s, r) => s + number(r[3]), 0), rows.reduce((s, r) => s + number(r[4]), 0), Math.round(rows.reduce((s, r) => s + number(r[7]), 0) * 10) / 10, rows.reduce((s, r) => s + number(r[9]), 0)],
        [number(foot[1]), number(foot[2]), number(foot[5]), number(foot[7])],
        'D1 جمع الصفوف المعروضة = المجموع المعروض',
      );
      t.same(
        [byAction('rep-no-round').length, byAction('rep-no-round')[0]?.getAttribute('class'), textOf('rep-days-missing'), byAction('rep-no-feed').length],
        [1, 'block font-semibold text-warn-800 dark:text-warn-200', 'يوم واحد بلا جولة مسجّلة.', 0],
        'D1 اليوم بلا جولة بلون التنبيه، وسطر «يوم واحد بلا جولة مسجّلة.» فوق الجدول',
      );
      t.same(
        [tableHeaders('أوزان العيّنات'), tableRows('أوزان العيّنات')],
        [['التاريخ', 'العمر', 'عدد طيور العيّنة', 'معدّل وزن الطير (غرام)'], [['04/11/2026', '4', '40', '115.0'], ['07/11/2026', '7', '40', '185.5'], ['10/11/2026', '10', '50', '280.0']]],
        'G1 الأوزان بتاريخها وعمرها وعيّنتها ومعدّلها',
      );
    });
    await step('D2 أيّام البيّاض', async () => {
      fresh(MANAGER, F.flock_cycle_report_layer);
      await mount(LAYER);
      const rows = tableRows('أيّام الدورة');
      t.same(
        [tableHeaders('أيّام الدورة'), rows[0], rows[4], rows[5], rows[8]],
        [
          ['التاريخ', 'العمر', 'الحيّ أوّل اليوم', 'النافق', 'المستبعد', 'الحيّ آخر اليوم', 'النفوق التراكميّ', 'المأكول (كغم)', 'المأكول التراكميّ (كغم)', 'النازل (كغم)', 'النازل التراكميّ (كغم)', 'الباقي في القاعة (كغم)', 'البيض (المجموع)', 'نسبة الإنتاج', 'الملاحظة'],
          ['01/11/2026', '140', '4,000', '1', '0', '3,999', '0.03%', '460', '460', '2,000', '2,000', '1,540', '3,000', '75.00%', ''],
          ['05/11/2026', '144', '3,996', '—', '—', '3,996', '0.10%', '—', '1,865', '0', '2,000', '135', '—', '—', 'لم تُسجَّل الجولة'],
          ['06/11/2026', '145', '3,996', '1', '0', '3,995', '0.13%', '475', '2,340', '0', '2,000', '-340', '3,080', '77.08%', 'إضاءة'],
          ['09/11/2026', '148', '3,994', '0', '1', '3,993', '0.18%', '—', '3,290', '0', '2,000', '-1,290', '3,090', '77.37%', 'لم يُسجَّل العلف'],
        ],
        'D2 البيّاض: البيض ونسبة الإنتاج، ويوم بلا جولة، ويوم جولة بلا علف «لم يُسجَّل العلف»، والباقي السالب؛ بلا عمود وزن',
      );
      t.same(
        [rows.length, tableFoot('أيّام الدورة'), byAction('rep-weights').length, byAction('chart-weight').length],
        [11, [['المجموع', '6', '2', '', '', '4,255', '', '2,000', '', '', '', '', '']], 0, 0],
        'D2 البيّاض بلا أوزان: لا جدول أوزان ولا منحنى وزن',
      );
    });

    // ── C: الرسوم ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('C1 رسوم اللاحم', async () => {
      fresh(MANAGER, F.flock_cycle_report);
      await mount();
      const figures = ['chart-mortality', 'chart-feed', 'chart-weight'].map((name) => byAction(name)[0]);
      const accessible = figures.map((figure) => {
        const svg = descendants(figure).find((n) => n.localName === 'svg');
        const [titleId, descId] = (svg?.getAttribute('aria-labelledby') ?? '').split(' ');
        const title = descendants(svg).find((n) => n.localName === 'title' && n.getAttribute('id') === titleId);
        const desc = descendants(svg).find((n) => n.localName === 'desc' && n.getAttribute('id') === descId);
        const caption = descendants(figure).find((n) => n.localName === 'figcaption');
        return [svg?.getAttribute('role'), svg?.getAttribute('viewBox'), title?.textContent, caption?.textContent === title?.textContent, desc?.textContent];
      });
      t.same(
        accessible,
        [
          ['img', '0 0 352 200', 'النفوق التراكميّ (٪) بالعمر', true, 'النفوق التراكميّ من 0.20% في العمر 1 إلى 1.30% في العمر 11.'],
          ['img', '0 0 352 200', 'العلف لكلّ طير في اليوم (غم) بالأسبوع', true, 'غرام العلف المأكول لكلّ طير في اليوم: الأسبوع 1: 130.7، الأسبوع 2: 181.9.'],
          ['img', '0 0 352 200', 'منحنى الوزن (غم) بالعمر', true, 'معدّل وزن الطير من 115.0 غم في العمر 4 إلى 280.0 غم في العمر 10.'],
        ],
        'C1 ثلاثة رسوم، لكلّ واحد role=img وعنوان ووصف بمعرّفيهما، والعنوان نفسه فوق الرسم',
      );
      t.same(badChartAttributes(), [], 'C1 لا NaN ولا undefined ولا null ولا Infinity في أيّ سمة من سمات الرسوم');
      const [mortality, feed, weight] = figures;
      const texts = (figure, part) => byPart(figure, part).map((n) => n.textContent);
      t.same(
        [texts(mortality, 'unit'), texts(mortality, 'y-tick'), texts(mortality, 'x-tick'), texts(mortality, 'x-title'), texts(mortality, 'last-label')],
        [['%'], ['0.0', '0.5', '1.0', '1.5'], ['1', '7', '11'], ['العمر (يوم)'], ['1.30%']],
        'C1 النفوق: محور واحد بوحدته وعلامات لطيفة من الصفر، والأعمار بالأسبوع وطرفيه، وتسمية آخر نقطة',
      );
      const line = pointsOf(byPart(mortality, 'line')[0]?.getAttribute('d') ?? '');
      t.same(
        [line.length, line.every(([, y], i) => i === 0 || y <= line[i - 1][1]), line.every(([x], i) => i === 0 || x > line[i - 1][0]), line[0][1] < 166 && line.at(-1)[1] >= 24],
        [11, true, true, true],
        'C1 خطّ النفوق: نقطة لكلّ يوم، والتراكميّ لا ينزل، والعمر يتقدّم يساراً إلى يمين، وكلّه داخل الرسم',
      );
      t.same(
        [texts(feed, 'unit'), texts(feed, 'y-tick'), texts(feed, 'x-tick'), texts(feed, 'bar-label'), byPart(feed, 'bar').length, byPart(feed, 'bar').map((n) => descendants(n).find((c) => c.localName === 'title')?.textContent)],
        [['غم'], ['0', '50', '100', '150', '200'], ['1', '2'], ['130.7', '181.9'], 2, ['الأسبوع 1: 130.7', 'الأسبوع 2: 181.9']],
        'C1 العلف: عمود لكلّ أسبوع بقيمته على رأسه وعنوانه عند المرور',
      );
      const tops = byPart(feed, 'bar').map((n) => Number(/V(-?[\d.]+) Q/u.exec(n.getAttribute('d'))?.[1]));
      t.ok(tops.length === 2 && tops[1] < tops[0] && tops.every((y) => y >= 24 && y <= 166), 'C1 العمود الأعلى قيمةً أعلى رسماً، وكلاهما داخل الرسم');
      t.same(
        [texts(weight, 'unit'), texts(weight, 'y-tick'), byPart(weight, 'dot').length, pointsOf(byPart(weight, 'line')[0]?.getAttribute('d') ?? '').length, texts(weight, 'last-label'), byPart(weight, 'dot').map((n) => descendants(n).find((c) => c.localName === 'title')?.textContent)],
        [['غم'], ['0', '100', '200', '300'], 3, 3, ['280.0'], ['04/11/2026، العمر 4: 115.0 غم', '07/11/2026، العمر 7: 185.5 غم', '10/11/2026، العمر 10: 280.0 غم']],
        'C1 الوزن: نقطة لكلّ عيّنة بخطّ بينها، وآخرها مسمّاة، وعنوان كلّ نقطة',
      );
      // react-dom يكتب النمط في كائن style (DOM الصغير لا يحوّله سمةً): الألوان من قيمه.
      const svgNodes = all().filter((n) => n.namespaceURI === 'http://www.w3.org/2000/svg');
      const colours = svgNodes.flatMap((n) => ['fill', 'stroke'].map((name) => n.style[name]).filter((value) => typeof value === 'string')).join(' ');
      const paintAttributes = svgNodes.flatMap((n) => ['fill', 'stroke', 'color'].map((name) => n.getAttribute(name)).filter((value) => value !== null && value !== 'none'));
      t.same(
        [
          descendants(mortality).find((n) => n.localName === 'svg')?.style.direction,
          [...colours.matchAll(/#[0-9a-f]{3,6}|rgb\((?!var)/giu)].length,
          ['--ring', '--line', '--line-strong', '--ink-muted', '--ink', '--surface-1'].every((token) => colours.includes(`var(${token})`)),
          paintAttributes,
        ],
        ['ltr', 0, true, []],
        'C1 الزمن من اليسار، والألوان كلّها من رموز CSS في النمط (لا لون مكتوب ولا سمة لون)، فتتبع الفاتح والداكن والطباعة',
      );
    });
    await step('C2 أسبوع بلا علف ويوم واحد', async () => {
      const report = clone(F.flock_cycle_report);
      report.weeks[0].feed_g_per_bird_day = null;
      report.weeks[0].feed_eaten_kg = null;
      fresh(MANAGER, report);
      await mount();
      const feed = byAction('chart-feed')[0];
      t.same(
        [byPart(feed, 'bar').length, byPart(feed, 'bar-missing').map((n) => n.textContent), byPart(feed, 'bar-label').map((n) => n.textContent), badChartAttributes()],
        [1, ['—1'], ['181.9'], []],
        'C2 أسبوع بلا علف مسجّل «—» عند القاعدة بلا عمود (لا صفر)',
      );
      await unmount();
      const single = clone(F.flock_cycle_report);
      single.days = single.days.slice(0, 1);
      single.weeks = [{ ...single.weeks[0], to_age: 1, to_on: '2026-11-01', days: 1, round_days: 1, dead: 2, culled: 0, mortality_pct: '0.20', mortality_cum_pct: '0.20', live_end: 998, feed_eaten_kg: '100.000', feed_g_per_bird_day: '100.0', weight: null, fcr: null }];
      single.weights = [{ on_date: '2026-11-01', age: 1, sample_count: 30, avg_g: '42.0' }];
      fresh(MANAGER, single);
      await mount();
      const weight = byAction('chart-weight')[0];
      const label = byPart(weight, 'last-label')[0];
      t.same(
        [badChartAttributes(), pointsOf(byPart(byAction('chart-mortality')[0], 'line')[0]?.getAttribute('d') ?? '').length, byPart(weight, 'dot').length, byPart(weight, 'line').length, label?.getAttribute('text-anchor')],
        [[], 1, 1, 0, 'start'],
        'C2 يوم واحد: نقطة واحدة بلا NaN (المدى صفر)، ونقطة وزن بلا خطّ، وتسميتها يمينها لا فوق المحور',
      );
    });
    {
      const ticks = (values, empty) => m.charts.yTicks(values, empty).map(String);
      t.same(
        [ticks([130n], 100n), ticks([], 100n), ticks([0n, 0n], 1000n), ticks([1819n], 100n), ticks([5n], 100n), ticks([1n], 100n), ticks([2800n, 1150n], 1000n), ticks([28000n], 1000n)],
        [['0', '50', '100', '150'], ['0', '50', '100'], ['0', '500', '1000'], ['0', '500', '1000', '1500', '2000'], ['0', '2', '4', '6'], ['0', '1'], ['0', '1000', '2000', '3000'], ['0', '10000', '20000', '30000']],
        'C3 علامات المحور: من الصفر بخطوة 1 أو 2 أو 5 × 10^ن وأربع فترات على الأكثر، والقيم كلّها صفر بمدى معقول',
      );
    }

    // ── M وPR وO: المال والطباعة وخادم قبل 0027 ────────────────────────────────────────────────────────────────────
    await step('M1 المال لأدوار الكلفة وحدها', async () => {
      fresh(MANAGER, F.flock_cycle_report);
      await mount();
      const withMoney = [byAction('rep-money').length, showsMoney(), tableRows(KPI), tableRows('أيّام الدورة'), tableRows('الأسابيع')];
      await unmount();
      fresh(WORKER, F.flock_cycle_report_no_money);
      await mount();
      t.same(
        [withMoney[0], withMoney[1], byAction('rep-money').length, showsMoney(), tableRows(KPI), tableRows('أيّام الدورة'), tableRows('الأسابيع')],
        [1, true, 0, false, withMoney[2], withMoney[3], withMoney[4]],
        'M1 كلفة الدورة لمن يرى الكلفة وحده، والمؤشّرات والأيّام والأسابيع نفسها بلا مال للجميع',
      );
    });
    await step('PR1 الطباعة', async () => {
      fresh(MANAGER, F.flock_cycle_report);
      await mount();
      fire(byAction('print-report')[0], 'click');
      await settle();
      const style = styleText();
      t.same(
        [
          printed.at(-1),
          style.includes('@page { size: A4 portrait; margin: 12mm; }'),
          style.includes('@page days { size: A4 landscape; margin: 10mm; }'),
          style.includes('[data-action="rep-days"] { page: days; }'),
          style.includes('[data-action="rep-charts"] svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'),
          descendants(byAction('rep-days')[0]).find((n) => n.localName === 'th' && n.textContent === 'التاريخ') !== undefined,
        ],
        ['تقرير دورة قاعة 1 — حقل الأمير 11/11/2026', true, true, true, true, true],
        'PR1 «اطبع التقرير» بعنوانه، والتقرير A4 طولاً وجدول الأيّام وحده عرضاً، والرسوم بألوانها',
      );
      fire(globalThis.window, 'afterprint', { bubbles: false });
    });
    await step('O1 خادم قبل 0027', async () => {
      const old = clone(F.flock_cycle_report);
      for (const key of ['days', 'weeks', 'weights', 'kpis']) delete old[key];
      fresh(MANAGER, old);
      await mount();
      t.same(
        [textOf('rep-no-cycle'), ['rep-kpis', 'rep-charts', 'rep-weeks', 'rep-days', 'rep-weights'].map((name) => byAction(name).length), ['rep-birds', 'rep-feed', 'rep-money'].map((name) => byAction(name).length), tableRows('الطيور')],
        ['المؤشّرات وجداول الأسابيع والأيّام تظهر بعد تحديث الخادم.', [0, 0, 0, 0, 0], [1, 1, 1], [['1,000', '11', '2', '987', '1.30%']]],
        'O1 بلا مفاتيح 0027: الأقسام القديمة كما هي وجملة بدل الجديدة',
      );
    });
    await step('O2 شكل ناقص', async () => {
      const partial = clone(F.flock_cycle_report);
      delete partial.weights;
      fresh(MANAGER, partial);
      await mount();
      t.same([byAction('rep-kpis').length, byAction('cycle-report').length, byAction('rep-loading').length], [0, 0, 0], 'O2 بعض المفاتيح دون بعض: لا تقرير ناقص يُعرض (خطأ القراءة)');
    });

    // ── X: عيّنات القاعدة الحقيقية (fixtures/reports-0027.json من supabase/tests/reports.test بـREPORTS_SAMPLES_OUT=1) ─────────────────
    const REAL_PATH = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'reports-0027.json');
    const REAL = existsSync(REAL_PATH) ? JSON.parse(readFileSync(REAL_PATH, 'utf8')) : null;
    t.ok(REAL !== null, 'X عيّنات القاعدة الحقيقية موجودة (reports-0027.json)');
    t.eq(REAL === null ? 0 : Object.keys(REAL).filter((name) => name.startsWith('flock_cycle_report')).length, 5, 'X خمس عيّنات للتقرير الكامل (العادي وبلا مال والفجوات والبيّاض والمغلق)');
    if (REAL) {
      for (const key of Object.keys(REAL).filter((name) => name.startsWith('flock_cycle_report'))) {
        await step(`X ${key}`, async () => {
          const sample = REAL[key];
          const parsed = parse(clone(sample));
          fresh('money' in sample ? MANAGER : WORKER, sample);
          await mount(sample.flock.id);
          const k = sample.kpis;
          const dashes = byAction('kpi-value').filter((n) => n.textContent === '—').map((n) => n.getAttribute('data-key'));
          const reasons = byAction('kpi-reason').filter((n) => n.textContent.length > 0).map((n) => n.getAttribute('data-key'));
          const foot = tableFoot('أيّام الدورة')?.[0] ?? [];
          const count = (text) => (text === undefined ? null : Number(text.replace(/,/gu, '')));
          t.same(
            [
              parsed.cycle !== null, tableRows('أيّام الدورة')?.length, tableRows('الأسابيع')?.length, count(foot[1]), count(foot[2]), reasons, badChartAttributes(),
              byAction('rep-money').length, 'money' in sample || !showsMoney(), byAction('rep-no-round').length,
            ],
            [
              true, k.days, sample.weeks.length, k.dead, k.culled, dashes, [],
              'money' in sample ? 1 : 0, true, sample.days.filter((day) => !day.round).length,
            ],
            `X ${key}: جواب القاعدة بالمحلّل والصفحة: يوم لكلّ يوم، والمجموع من المؤشّرات، وكلّ «—» بسببه، والرسوم بلا NaN، والمال لأدوار الكلفة وحدها`,
          );
        });
      }

      // ── مراجعة 0027 (S1–S4 وS6): كلّ إصلاح بفحص يفشل على 52ca9fd بمفاتيح المحلّل وحدها، بعيّنات القاعدة (أو نسخة عميقة منها لحالة حدّ) ─────────────
      const sessionOf = (sample) => ('money' in sample ? MANAGER : WORKER);
      /** دورة بلا جولة مسجّلة: أوّل ثمانية أيام من عيّنة البيّاض (02/11 إلى 09/11 كلّها بلا جولة) بأسبوعيها 20 و21، ومؤشّراتها لذلك اليوم. */
      const noRounds = () => {
        const report = clone(REAL.flock_cycle_report_layer);
        report.days = report.days.slice(0, 8);
        report.weeks = report.weeks.slice(0, 2);
        report.through = report.days.at(-1).on;
        Object.assign(report.kpis, {
          days: 8, age_end: report.days.at(-1).age, dead: 0, culled: 0, live: report.kpis.placed, mortality_pct: '0.00', livability_pct: '100.00',
          feed_eaten_kg: '0.000', feed_left_kg: '0.000', feed_days: 0, feed_span: 7, feed_per_bird_kg: null, fcr: null, epef: null,
        });
        Object.assign(report.birds, { dead: 0, culled: 0, live: report.kpis.placed, mortality_pct: '0.00' });
        Object.assign(report.feed, { consumed_kg: '0.000', remaining_kg: '0.000' });
        return report;
      };
      const feet = () => {
        const days = tableFoot('أيّام الدورة')?.[0] ?? [];
        const weeks = tableFoot('الأسابيع')?.[0] ?? [];
        return { days: [days[1], days[2], days[5]], weeks: [weeks[1], weeks[2], weeks[6]] };
      };
      const view = async (sample, read) => {
        fresh(sessionOf(sample), sample);
        await mount(sample.flock.id);
        const out = read();
        await unmount();
        return out;
      };

      await step('S1 دورة بلا جولة مسجّلة: مجموع النافق والمستبعد والمأكول «—» لا صفر، ومع أيّ جولة كما كان', async () => {
        // جولات بلا علف مأكول مسجّل: عيّنة المغلقة بعلف أيّام جولاتها الثلاثة null.
        const noEaten = clone(REAL.flock_cycle_report_closed);
        for (const day of noEaten.days) Object.assign(day, { feed_eaten_kg: null, feed_eaten_cum_kg: '0.000', feed_left_kg: day.feed_given_cum_kg });
        for (const week of noEaten.weeks) Object.assign(week, { feed_eaten_kg: null, feed_g_per_bird_day: null });
        Object.assign(noEaten.kpis, { feed_eaten_kg: '0.000', feed_left_kg: noEaten.kpis.feed_given_kg, feed_days: 0, feed_per_bird_kg: null });
        t.same(
          [await view(noRounds(), feet), await view(noEaten, feet), await view(REAL.flock_cycle_report_layer, feet), await view(REAL.flock_cycle_report_gaps, feet)],
          [
            { days: ['—', '—', '—'], weeks: ['—', '—', '—'] },
            { days: ['6', '1', '—'], weeks: ['6', '1', '—'] },
            { days: ['3', '1', '1,425'], weeks: ['3', '1', '1,425'] },
            { days: ['16', '3', '2,700'], weeks: ['16', '3', '2,700'] },
          ],
          'S1 صفّ «المجموع» في الأيّام والأسابيع: النافق والمستبعد «—» بلا جولة واحدة، والمأكول «—» بلا علف مأكول مسجّل؛ ومع جولة واحدة أرقام المؤشّرات كما هي',
        );
      });

      await step('S2 «الحيّ» يقول اكتمال الجولات بعدّ قسم الأيّام نفسه', async () => {
        const read = () => [kpiOf('live'), textOf('rep-days-missing'), kpiOf('mortality'), kpiOf('livability')];
        const LIVABLE = 'نسبة ما بقي حيّاً من المسكَّن.';
        const samples = [REAL.flock_cycle_report_gaps, REAL.flock_cycle_report_layer, REAL.flock_cycle_report_closed, REAL.flock_cycle_report, noRounds()];
        const seen = [];
        for (const sample of samples) seen.push(await view(sample, read));
        t.same(
          seen,
          [
            [['11,981', 'note', 'النافق 16 والمستبعد 3. سُجّلت الجولة في 10 من 12 يوماً.'], 'يومان بلا جولة مسجّلة.', ['0.16%', 'none', ''], ['99.84%', 'note', LIVABLE]],
            [['3,996', 'note', 'النافق 3 والمستبعد 1. سُجّلت الجولة في 3 من 11 يوماً.'], '8 أيام بلا جولة مسجّلة.', ['0.10%', 'none', ''], ['99.90%', 'note', LIVABLE]],
            [['993', 'note', 'النافق 6 والمستبعد 1. سُجّلت الجولة في 3 من 16 يوماً.'], '13 يوماً بلا جولة مسجّلة.', ['0.70%', 'none', ''], ['99.30%', 'note', LIVABLE]],
            [['2,975', 'note', 'النافق 21 والمستبعد 4.'], null, ['0.83%', 'none', ''], ['99.17%', 'note', LIVABLE]],
            [['4,000', 'note', 'لم تُسجَّل جولة بعد.'], '8 أيام بلا جولة مسجّلة.', ['0.00%', 'none', ''], ['100.00%', 'note', LIVABLE]],
          ],
          'S2 تحت «الحيّ»: «سُجّلت الجولة في n من m.» حين تنقص و«لم تُسجَّل جولة بعد.» بلا جولة، والنفوق والحيوية كما هما',
        );
        // لا يختلف العدّان: n من الملاحظة وm − n من جملة الأيّام كلاهما من أيّام الجولة في العيّنة نفسها.
        const agree = samples.map((sample, i) => {
          const recorded = sample.days.filter((day) => day.round).length;
          const all = sample.days.length;
          const note = seen[i][0][2];
          const said = /سُجّلت الجولة في (\d+) من/u.exec(note)?.[1];
          const kpiSays = recorded === 0 ? note === 'لم تُسجَّل جولة بعد.' : recorded < all ? Number(said) === recorded : said === undefined;
          return [kpiSays, (seen[i][1] !== null) === recorded < all];
        });
        t.same(agree, samples.map(() => [true, true]), 'S2 عدد الجولات تحت «الحيّ» وجملة الأيّام بلا جولة فوق جدول الأيّام من العدّ نفسه في كلّ عيّنة');
      });

      await step('S3 أيّام الدورة: سطور اليوم بلا وزن تحت نازله، وجملة الباقي فوق الجدول', async () => {
        const read = () => {
          const table = tableOf('أيّام الدورة');
          const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
          const rows = tbody ? tbody.children.filter((n) => n.localName === 'tr') : [];
          return [rows.flatMap((tr) => byAction('rep-day-unweighed', tr).map((n) => [tr.children[0]?.textContent, tr.children[9]?.textContent, n.textContent])), textOf('rep-days-unweighed')];
        };
        t.same(
          [await view(REAL.flock_cycle_report_gaps, read), await view(REAL.flock_cycle_report, read), await view(REAL.flock_cycle_report_layer, read), await view(F.flock_cycle_report, read)],
          [
            [[['11/11/2026', '0وسطر واحد بلا وزن', 'وسطر واحد بلا وزن']], 'النازل التراكميّ والباقي في القاعة لا يشملان سطر واحد بلا وزن.'],
            [[['11/11/2026', '0.0وسطران بلا وزن', 'وسطران بلا وزن'], ['12/11/2026', '9.2وسطر واحد بلا وزن', 'وسطر واحد بلا وزن']], 'النازل التراكميّ والباقي في القاعة لا يشملان 3 سطور بلا وزن.'],
            [[], null],
            [[['08/11/2026', '0وسطر واحد بلا وزن', 'وسطر واحد بلا وزن']], 'النازل التراكميّ والباقي في القاعة لا يشملان سطر واحد بلا وزن.'],
          ],
          'S3 يوم نزلت فيه أكياس بلا وزن: الرقم كما هو وتحته سطوره، وفوق جدول الأيّام ما لا يشمله التراكميّ والباقي؛ ودورة بلا سطر بلا وزن بلا شيء من ذلك',
        );
      });

      // ── مراجعة 0027 الثانية (RR27-S3b وRR27-F2a، على 781f78b): بعيّنات القاعدة، ونسخة عميقة من عيّنة الفجوات علفها كلّه السطر بلا وزن ─────────────
      /** عيّنة الفجوات بلا السطرين الموزونين: علف الدورة كلّه قطعتان بلا وزن يوم 11/11، فالنازل وتراكمه صفر والباقي سالب المأكول. */
      const onlyUnweighed = () => {
        const report = clone(REAL.flock_cycle_report_gaps);
        for (const day of report.days) Object.assign(day, { feed_given_kg: '0', feed_given_cum_kg: '0.000', feed_left_kg: day.feed_eaten_cum_kg === '0.000' ? '0.000' : `-${day.feed_eaten_cum_kg}` });
        Object.assign(report.kpis, { feed_given_kg: '0.000', feed_left_kg: `-${report.kpis.feed_eaten_kg}` });
        report.feed.lines = report.feed.lines.filter((line) => line.kg === null).map((line) => ({ ...line, cum_kg: '0.000' }));
        report.feed.by_item = report.feed.by_item.filter((row) => row.kg === null);
        Object.assign(report.feed, { delivered_kg: '0.000', remaining_kg: `-${report.kpis.feed_eaten_kg}` });
        return report;
      };

      await step('RR27-S3b جدول الأيّام: مجموع «النازل» بسطور الدورة بلا وزن كصفوفه، والتراكميّ والباقي بجملة فوق الجدول', async () => {
        const read = () => {
          const foot = tableFoot('أيّام الدورة')?.[0] ?? [];
          const rows = tableRows('أيّام الدورة') ?? [];
          return [
            foot[7] ?? null,
            byAction('rep-total-unweighed').map((n) => n.textContent),
            rows.filter((row) => row[9]?.includes('بلا وزن')).map((row) => [row[0], row[9]]),
            rows.at(-1)?.[10] ?? null,
            textOf('rep-days-unweighed'),
          ];
        };
        t.same(
          [await view(REAL.flock_cycle_report, read), await view(REAL.flock_cycle_report_gaps, read), await view(onlyUnweighed(), read), await view(REAL.flock_cycle_report_layer, read)],
          [
            ['1,209.2و3 سطور بلا وزن', ['و3 سطور بلا وزن'], [['11/11/2026', '0.0وسطران بلا وزن'], ['12/11/2026', '9.2وسطر واحد بلا وزن']], '1,209.2', 'النازل التراكميّ والباقي في القاعة لا يشملان 3 سطور بلا وزن.'],
            ['1,500وسطر واحد بلا وزن', ['وسطر واحد بلا وزن'], [['11/11/2026', '0وسطر واحد بلا وزن']], '1,500', 'النازل التراكميّ والباقي في القاعة لا يشملان سطر واحد بلا وزن.'],
            ['0وسطر واحد بلا وزن', ['وسطر واحد بلا وزن'], [['11/11/2026', '0وسطر واحد بلا وزن']], '0', 'النازل التراكميّ والباقي في القاعة لا يشملان سطر واحد بلا وزن.'],
            ['0', [], [], '0', null],
          ],
          'RR27-S3b مجموع «النازل» تحته سطور الدورة بلا وزن من الخادم كصفوفه (قاعة 2 والفجوات، ولا «0» وحده لدورة علفها كلّه بلا وزن)، و«النازل التراكميّ» كما هو وجملة فوق الجدول تقول إنّه والباقي لا يشملانها؛ ودورة بلا سطر بلا وزن بلا شيء من ذلك',
        );
      });

      await step('RR27-F2a «العلف الباقي» السالب: على الموزون وحده حين نزل علف بلا وزن (عيّنة القاعدة)', async () => {
        const NEG = 'سالب: المأكول المسجّل أكثر من النازل للقاعة.';
        const NEG_W = 'سالب: المأكول المسجّل أكثر من النازل الموزون.';
        const read = () => [kpiOf('given'), kpiOf('left')];
        t.same(
          [await view(REAL.flock_cycle_report, read), await view(REAL.flock_cycle_report_gaps, read), await view(onlyUnweighed(), read), await view(REAL.flock_cycle_report_layer, read)],
          [
            [['1,209.2', 'note', 'خارج الكيلو: 3 سطور بلا وزن.'], ['-50.8', 'note', NEG_W]],
            [['1,500', 'note', 'خارج الكيلو: سطر واحد بلا وزن.'], ['-1,200', 'note', NEG_W]],
            [['0', 'note', 'خارج الكيلو: سطر واحد بلا وزن.'], ['-2,700', 'note', NEG_W]],
            [['0', 'none', ''], ['-1,425', 'note', NEG]],
          ],
          'RR27-F2a الباقي السالب ودورته نزل لها علف بلا وزن (قاعة 2 والفجوات والعلف كلّه بلا وزن): «أكثر من النازل الموزون»؛ وبلا سطر بلا وزن (البيّاض) الجملة كما كانت',
        );
      });

      await step('S4 سبب «—» مؤشّر الإنتاج: «لا طيور حيّة.» للحيّ صفراً وحده (عيّنة القاعدة)', async () => {
        const rounded = clone(REAL.flock_cycle_report);
        Object.assign(rounded.kpis, { live: 1, mortality_pct: '100.00', livability_pct: '0.00', epef: null });
        const none = clone(REAL.flock_cycle_report);
        Object.assign(none.kpis, { live: 0, mortality_pct: '100.00', livability_pct: '0.00', epef: null });
        const read = () => ['live', 'livability', 'fcr', 'epef'].map(kpiOf);
        t.same(
          [await view(rounded, read), await view(none, read)],
          [
            [['1', 'note', 'النافق 21 والمستبعد 4.'], ['0.00%', 'note', 'نسبة ما بقي حيّاً من المسكَّن.'], ['1.629', 'note', 'كغم علف لكلّ كغم من الوزن الحيّ.'], ['—', 'reason', 'نسبة الحيوية قُرّبت إلى صفر.']],
            [['0', 'note', 'النافق 21 والمستبعد 4.'], ['0.00%', 'note', 'نسبة ما بقي حيّاً من المسكَّن.'], ['1.629', 'note', 'كغم علف لكلّ كغم من الوزن الحيّ.'], ['—', 'reason', 'لا طيور حيّة.']],
          ],
          'S4 حيّ واحد بحيوية قُرّبت إلى 0.00%: السبب التقريب لا «لا طيور حيّة.»؛ وبلا حيّ «لا طيور حيّة.»',
        );
      });

      await step('S6 رسم العلف: أرقام الأسابيع وتسميات القيم لا تتراكب في الدورات الطويلة', async () => {
        const weekRow = REAL.flock_cycle_report_layer.weeks.at(-1);
        const tenths = (n) => `${Math.floor(n / 10)}.${n % 10}`;
        const weeksOf = (n, valueOf) => {
          const report = clone(REAL.flock_cycle_report_layer);
          report.weeks = Array.from({ length: n }, (_, i) => ({ ...clone(weekRow), week: 20 + i, from_age: 140 + 7 * i, to_age: 146 + 7 * i, feed_g_per_bird_day: tenths(valueOf(i, n)) }));
          return parse(report).cycle.weeks;
        };
        const chart = async (weeks) => {
          const container = globalThis.document.createElement('div');
          body().appendChild(container);
          root = m.createRoot(container);
          m.flushSync(() => root.render(m.h(m.charts.FeedChart, { weeks })));
          await settle();
          const figure = byAction('chart-feed')[0];
          const ticks = byPart(figure, 'x-tick').map((n) => [Number(n.getAttribute('x')), n.textContent]);
          const labels = byPart(figure, 'bar-label').map((n) => [Number(n.getAttribute('x')), n.textContent]);
          const bad = badChartAttributes();
          await unmount();
          return { ticks, labels, bad };
        };
        const gap = (xs) => xs.slice(1).reduce((least, x, i) => Math.min(least, x - xs[i]), Infinity);
        const rising = (i) => 1000 + 3 * i;
        const seen = [];
        for (const n of [26, 29, 34, 38, 42, 47, 51, 56, 57, 65, 66, 74, 75, 76]) {
          const { ticks, labels, bad } = await chart(weeksOf(n, rising));
          const xs = ticks.map(([x]) => x);
          seen.push([n, gap(xs) >= 16, ticks[0]?.[1], ticks.at(-1)?.[1], labels.map(([, text]) => text), bad]);
        }
        t.same(
          seen,
          [26, 29, 34, 38, 42, 47, 51, 56, 57, 65, 66, 74, 75, 76].map((n) => [n, true, '20', String(19 + n), [tenths(rising(n - 1))], []]),
          'S6 من 26 إلى 76 أسبوعاً: لا رقما أسبوعين أقرب من 16 بكسلاً، وأوّل أسبوع وآخره مكتوبان دائماً، والقمّة آخر أسبوع فتسمية واحدة',
        );
        // القمّة الأسبوع قبل الأخير (119.9 ثمّ 119.6): تسمية آخر أسبوع وحدها لا تسميتان متراكبتان؛ وقمّة بعيدة عن آخر أسبوع تُسمّى معه.
        const beforeLast = await chart(weeksOf(42, (i, n) => (i === n - 2 ? 1199 : i === n - 1 ? 1196 : 1000 + 4 * i)));
        const farPeak = await chart(weeksOf(42, (i) => (i === 10 ? 1500 : 1000 + i)));
        t.same(
          [beforeLast.labels.map(([, text]) => text), farPeak.labels.map(([, text]) => text), farPeak.labels.length === 2 && farPeak.labels[1][0] - farPeak.labels[0][0] >= 34],
          [['119.6'], ['150.0', '104.1'], true],
          'S6 القمّة قبل آخر أسبوع بأقلّ من عرض تسمية: آخر أسبوع وحده؛ والقمّة البعيدة تُسمّى مع آخر أسبوع',
        );
      });
    }
  } finally {
    if (root && m) {
      const mounted = root;
      m.flushSync(() => mounted.unmount());
    }
    delete globalThis.window.print;
    delete globalThis.__hc;
    restore();
  }
}
