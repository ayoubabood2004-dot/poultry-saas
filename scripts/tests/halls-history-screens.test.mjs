// «منذ أن بدأنا» في تقرير القاعات اليوميّ (عقد 0031، docs/plans/0031/contract-0031.md؛ كلمة المالك 2026-11-17): react-dom/client الحقيقي على DOM صغير
// (dom.mjs) يشغّل التقرير اليوميّ عبر HallsRoutes الحقيقية، وrepo/hallReports الحقيقي (المحلّلات وبناء النداء) على core بديل يسجّل كلّ نداء ويجيب بجواب
// العقد مكتوباً باليد هنا (قبل الهجرة: لاحم بشهرين وأحداث ويوم بلا جولة، وبيّاض ببيضه بدأ في الشهر، وملاحظتان)، وhtml-to-image بديل يسجّل ما يُصوَّر.
// وجواب halls_day من fixtures/reports-contract.json (حقلان) بيوم الطلب.
// P المحلّلات: شكل العقد بالكيلو بالآلاف والوزن بأعشار الغرام والنسبة بالمئات، والغائب null حيث يسمح العقد وحده، والرفض بخطأ شكل يسمّي الخانة؛
//   والنداءان بمعاملاتهما.
// T الجداول: أيّام الشهر بأعمدة العقد (وأعمدة البيض للبيّاض وحده) وصفّ المجموع سطرُ الشهر من الخادم لا جمع الصفوف، ويوم التقرير مميَّز؛ والأشهر بصفّ
//   «منذ البداية» من total.
// W «ما جرى»: الجملة بالعدد الفصيح، والأحداث مجمَّعة باليوم ويوم التقرير مميَّز.
// M الشهر يتبع يوم التقرير المختار (أوّل شهره، والقراءة بعد كلّ تقرير يوم).
// N الملاحظة: لمن له halls_note.write وحده، والنافذة بلقطة النصّ والنسخة حين فُتحت، والحفظ بشرطها، وnote_changed يُقال ويُقرأ من جديد، والمسح، والحدّ،
//   والقصّ مرآة الخادم (قائمة الرصيد اليومي نفسها).
// I «أرسل صورة»: PNG بعرض ثابت ومقياس 2 وخلفية السمة، ثمّ المشاركة بالملفّ إن قُبل وإلّا التنزيل برسالة، والإلغاء، والصورة الجاهزة بضغطة جديدة،
//   والفشل؛ ولا صورة قبل أن يصل «منذ أن بدأنا».
// F قراءة «منذ أن بدأنا» تفشل أو تُرفض: الجملة وإعادة المحاولة، والتقرير اليوميّ باقٍ.
// S الطباعة تطبع الأقسام الجديدة، و«شارك نصّاً» ثانويّ باقٍ.
// X أجوبة القاعدة الحقيقية (fixtures/halls-history-0031.json حين توجد) بالمحلّل الحقيقي.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Comment, descendants, Element, fire, installDom, settle, Text } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'reports-contract.json'), 'utf8'));
const REAL = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-history-0031.json');
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__hh.session; export const sessionStore = { get: () => globalThis.__hh?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__hh.toasts.push(spec); }; export function Toaster() { return null; }',
  image: 'export const toBlob = (node, options) => globalThis.__hh.toBlob(node, options);',
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__hh.rpc(fn, args);
export const send = async () => { throw new Error('halls-history: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ userId: globalThis.__hh?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;
const plugins = [
  {
    name: 'hh-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'hh-stub' }));
      b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'hh-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'hh-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'hh-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'hh-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as HallsRoutes } from './src/pages/halls/HallsRoutes.tsx';",
    "export * as repo from './src/lib/repo/hallReports.ts';",
    "export * as hist from './src/pages/halls/dailyHistory.tsx';",
    "export { IMAGE_WIDTH, imageName } from './src/pages/halls/reportImage.ts';",
    "export { NOTE_SPACES, noteText } from './src/pages/inventory/DayBalanceView.tsx';",
    "export { HallsShapeError } from './src/lib/repo/halls.ts';",
    "export { RejectedError, NetworkError } from './src/lib/errors.ts';",
    "export { wideStore } from './src/lib/wide.ts';",
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
    plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

// ─── جواب العقد باليد ─────────────────────────────────────────────────────────────────────────────────────────────

const TODAY = '2026-11-17';
const pad = (n) => String(n).padStart(2, '0');
const nov = (d) => `2026-11-${pad(d)}`;
const oct = (d) => `2026-10-${pad(d)}`;
const SITE = 'حقل الأمير';
const EGG_SITE = 'حقل البيض';

/** يوم لاحم: ثلاثة أفواج، ويوم 3 بلا جولة (النافق والمستبعد والمأكول null)، ويوم 17 بجولة من ثلاث، وبيع يوم 10 وفرق عدّ يوم 12، ونازل بلا وزن يوم 5. */
function broilerDay(on, d) {
  const noRound = on === nov(3);
  return {
    on,
    flocks: 3,
    rounds: noRound ? 0 : on === nov(17) ? 1 : 3,
    rounds_expected: 3,
    placed: on === nov(1) ? 1000 : on === oct(20) ? 12000 : 0,
    live_start: 13000 - d * 3,
    dead: noRound ? null : d % 5,
    culled: noRound ? null : d % 2 === 0 ? 1 : 0,
    sold: on === nov(10) ? 900 : 0,
    count_diff: on === nov(12) ? -30 : 0,
    live_end: 12997 - d * 3,
    feed_kg: noRound ? null : `${100 + d}.500`,
    given_kg: on === nov(5) ? '500.000' : '0.000',
    given_unweighed: on === nov(5) ? 2 : 0,
    eggs_total: null,
    eggs_broken: null,
    hdep: null,
  };
}
/** يوم بيّاض: فوج واحد سُكّن يوم 5 (بلا بيض يومه)، وبيضه ونسبته بعده. */
function layerDay(on, d) {
  const first = on === nov(5);
  return {
    on,
    flocks: 1,
    rounds: 1,
    rounds_expected: 1,
    placed: first ? 5000 : 0,
    live_start: 5000 - (d - 5),
    dead: 1,
    culled: 0,
    sold: 0,
    count_diff: 0,
    live_end: 4999 - (d - 5),
    feed_kg: '550.000',
    given_kg: '0.000',
    given_unweighed: 0,
    eggs_total: first ? null : 4100,
    eggs_broken: first ? null : 12,
    hdep: first ? null : '83.67',
  };
}
// سطور الأشهر وtotal كما يقولها الخادم: أرقام الشهر غير مجموع أيّامه عمداً، فصفّ المجموع منها يثبت أنّ الشاشة لا تجمع.
const BROILER_MONTHS = [
  { month: '2026-10-01', days: 12, placed: 12000, dead: 30, culled: 5, sold: 0, count_diff: 0, feed_kg: '3000.000', given_kg: '3500.000', given_unweighed: 0, eggs_total: null, eggs_broken: null, hdep: null, live_end: 11965, opened: 2, closed: 0 },
  { month: '2026-11-01', days: 17, placed: 1000, dead: 777, culled: 11, sold: 900, count_diff: -30, feed_kg: '9999.500', given_kg: '4500.000', given_unweighed: 2, eggs_total: null, eggs_broken: null, hdep: null, live_end: 12949, opened: 1, closed: 1 },
];
const BROILER_TOTAL = { days: 29, placed: 13000, dead: 807, culled: 16, sold: 900, count_diff: -30, feed_kg: '12999.500', given_kg: '8000.000', given_unweighed: 2, eggs_total: null, eggs_broken: null, hdep: null, live_now: 12949, opened: 3, closed: 1, halls: 3 };
const LAYER_MONTHS = [{ month: '2026-11-01', days: 13, placed: 5000, dead: 13, culled: 0, sold: 0, count_diff: 0, feed_kg: '7150.000', given_kg: '0.000', given_unweighed: 0, eggs_total: 49200, eggs_broken: 144, hdep: '83.10', live_end: 4987, opened: 1, closed: 0 }];
const LAYER_TOTAL = { ...LAYER_MONTHS[0], live_now: 4987, halls: 1 };
delete LAYER_TOTAL.month;
delete LAYER_TOTAL.live_end;
const ev = (on, type, hall, extra = {}) => ({ on, type, hall, site: hall.startsWith('قاعة البيض') ? EGG_SITE : SITE, ...extra });
const NOV_EVENTS = [
  ev(nov(1), 'placed', 'قاعة 3', { birds: 1000 }),
  ev(nov(9), 'vaccine', 'قاعة 1', { name: 'نيوكاسل' }),
  ev(nov(9), 'vaccine', 'قاعة 2', { name: 'نيوكاسل' }),
  ev(nov(10), 'sold', 'قاعة 1', { birds: 900, kg: '1800.000' }),
  ev(nov(12), 'count_diff', 'قاعة 2', { birds: -30 }),
  ev(nov(12), 'weight', 'قاعة 1', { avg_g: '450.0' }),
  ev(nov(15), 'closed', 'قاعة 1'),
];
const NOTES = [
  { on: nov(5), text: 'بدأنا حقل البيض.', version: 3 },
  { on: nov(17), text: 'سطر أوّل\nسطر ثانٍ', version: 7 },
];
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** جواب halls_history لشهر (أوّل يومه): تشرين الثاني بأيّامه 1–17، وتشرين الأوّل من 20 (بداية اللاحم) والبيّاض بلا أيّام فيه. */
function historyFor(month, over = {}) {
  const november = month === '2026-11-01';
  return {
    today: TODAY,
    month,
    prev: november,
    next: !november,
    kinds: [
      {
        kind: 'broiler',
        start: oct(20),
        days: november ? range(1, 17).map((d) => broilerDay(nov(d), d)) : range(20, 31).map((d) => broilerDay(oct(d), d)),
        months: clone(BROILER_MONTHS),
        total: clone(BROILER_TOTAL),
        events: november ? clone(NOV_EVENTS) : [ev(oct(20), 'placed', 'قاعة 1', { birds: 6000 }), ev(oct(20), 'placed', 'قاعة 2', { birds: 6000 })],
      },
      {
        kind: 'layer',
        start: nov(5),
        days: november ? range(5, 17).map((d) => layerDay(nov(d), d)) : [],
        months: clone(LAYER_MONTHS),
        total: clone(LAYER_TOTAL),
        events: november ? [ev(nov(5), 'placed', 'قاعة البيض 1', { birds: 5000 })] : [],
      },
    ],
    notes: november ? clone(NOTES) : [],
    ...over,
  };
}
const dayFor = (on) => ({ ...clone(F.halls_day), on: on ?? TODAY, today: TODAY, next: (on ?? TODAY) < TODAY });

// ─── أدوات DOM ─────────────────────────────────────────────────────────────────────────────────────────────────────

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const within = (node, name) => (node ? descendants(node).filter((n) => n.getAttribute('data-action') === name) : []);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click', { button: 0 });
  await settle();
};
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const dialog = () => all().find((n) => n.getAttribute('role') === 'dialog') ?? null;
const submitDialog = async () => {
  fire(descendants(dialog()).find((n) => n.localName === 'form'), 'submit');
  await settle();
};
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
const section = (name) => tableOf(name);
const rowsOf = (caption) => {
  const tbody = section(caption) ? descendants(section(caption)).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr') : null;
};
const tableRows = (caption) => rowsOf(caption)?.map((tr) => tr.children.map((td) => td.textContent)) ?? null;
const tableFoot = (caption) => {
  const tfoot = section(caption) ? descendants(section(caption)).find((n) => n.localName === 'tfoot') : null;
  return tfoot ? tfoot.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableHeaders = (caption) => (section(caption) ? descendants(section(caption)).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null);
const styleText = () => all().filter((n) => n.localName === 'style').map((n) => n.textContent).join('\n');
const fmt = (day) => day.split('-').reverse().join('/');
const LRI = '\u{2066}';
const PDI = '\u{2069}';
const signed = (n) => (n === 0 ? '0' : `${LRI}${n > 0 ? '+' : ''}${n.toLocaleString('en-US')}${PDI}`);

const BR = 'حقول اللحم منذ أن بدأنا';
const LY = 'حقول البيض منذ أن بدأنا';
const NOV_NAME = 'تشرين الثاني 2026';
const OCT_NAME = 'تشرين الأول 2026';
const daysCaption = (kind, month) => `${kind} — أيّام ${month}`;
const monthsCaption = (kind) => `${kind} — الأشهر من البداية`;

const ws = (role) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: true,
  canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
});
const as = (role) => ({ status: 'ready', workspace: ws(role), offline: false });

export default async function (t) {
  const restoreDom = installDom();
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  // ما لا يحمله dom.mjs ويحتاجه التصوير والتنزيل: نسخ العقد، والنقر على الرابط (يُسجَّل).
  const clicked = [];
  const cloneOf = function cloneNode(deep) {
    if (this.nodeType === 3) return this.ownerDocument.createTextNode(this.nodeValue);
    if (this.nodeType === 8) return this.ownerDocument.createComment(this.nodeValue);
    const copy = this.ownerDocument.createElement(this.localName);
    for (const [key, value] of this._attrs) copy._attrs.set(key, value);
    if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
    return copy;
  };
  Element.prototype.cloneNode = cloneOf;
  Text.prototype.cloneNode = cloneOf;
  Comment.prototype.cloneNode = cloneOf;
  Element.prototype.click = function recordClick() {
    clicked.push({ tag: this.localName, href: this.href, download: this.download, inBody: body().contains(this) });
  };
  globalThis.window.print = () => {};
  globalThis.document.title = 'نظام الدواجن';
  let root = null;
  let m = null;
  const unmount = async () => {
    if (!root) return;
    const mounted = root;
    root = null;
    m.flushSync(() => mounted.unmount());
    body().textContent = '';
    await settle();
  };
  try {
    m = await bundle();

    const fresh = (session, rpcs = {}, toBlob = null) => {
      const rpcLog = [];
      const captures = [];
      globalThis.__hh = {
        session,
        toasts: [],
        rpc(fn, args) {
          rpcLog.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          const count = rpcLog.filter(([name]) => name === fn).length;
          return Promise.resolve().then(() => handler(args, count));
        },
        async toBlob(node, options) {
          captures.push({ node, options, html: node.outerHTML, inBody: body().contains(node) });
          if (toBlob) return toBlob(node, options);
          return new Blob(['png'], { type: 'image/png' });
        },
      };
      return { rpcLog, captures };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const toasts = () => globalThis.__hh.toasts.map((spec) => spec.title);
    const lastToast = () => globalThis.__hh.toasts.at(-1)?.title ?? null;
    const OK = { halls_day: (args) => dayFor(args.p_on), halls_history: (args) => historyFor(args.p_month) };

    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/*', element: m.h(m.HallsRoutes) })))));
      await settle();
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
    const shapeError = (fn) => {
      try {
        fn();
        return 'لم يرمِ';
      } catch (error) {
        return error instanceof m.HallsShapeError ? error.field : `${error?.name}: ${error?.message}`;
      }
    };

    // ── P: المحلّلات ───────────────────────────────────────────────────────────────────────────────────────────────
    {
      const parsed = m.repo.parseHallsHistory(historyFor('2026-11-01'));
      const [broiler, layer] = parsed.kinds;
      const d3 = broiler.days[2];
      const d5 = broiler.days[4];
      const d12 = broiler.days[11];
      t.same(
        [parsed.today, parsed.month, parsed.prev, parsed.next, parsed.kinds.map((k) => [k.kind, k.start, k.days.length, k.months.length, k.events.length]), parsed.notes],
        [TODAY, '2026-11-01', true, false, [['broiler', oct(20), 17, 2, 7], ['layer', nov(5), 13, 1, 1]], [{ on: nov(5), text: 'بدأنا حقل البيض.', version: 3 }, { on: nov(17), text: 'سطر أوّل\nسطر ثانٍ', version: 7 }]],
        'P1 الشكل: يوم الخادم والشهر والتنقّل، والنوعان بترتيبهما بأيّامهما وأشهرهما وأحداثهما، والملاحظات بنصّها ونسختها',
      );
      t.same(
        [
          [d3.on, d3.rounds, d3.roundsExpected, d3.dead, d3.culled, d3.feedKg, d3.eggsTotal, d3.hdep],
          [d5.givenKg, d5.givenUnweighed, d5.feedKg, d5.countDiff],
          [d12.countDiff, broiler.days[9].sold],
        ],
        [
          [nov(3), 0, 3, null, null, null, null, null],
          [500000n, 2, 105500n, 0],
          [-30, 900],
        ],
        'P1 اليوم: الغائب null لا صفر (بلا جولة: النافق والمستبعد والمأكول، وبيض اللاحم)، والكيلو بالآلاف، وفرق العدّ بإشارته',
      );
      t.same(
        [layer.days[0].eggsTotal, layer.days[0].hdep, layer.days[1].eggsTotal, layer.days[1].eggsBroken, layer.days[1].hdep, layer.months[0].hdep, layer.total.hdep, layer.total.liveNow, layer.total.halls],
        [null, null, 4100, 12, 8367n, 8310n, 8310n, 4987, 1],
        'P1 البيّاض: البيض والمكسور ونسبة الإنتاج بالمئات بمرتبتين، وnull يوم بلا بيض',
      );
      const nov11 = broiler.months[1];
      t.same(
        [nov11.month, nov11.days, nov11.dead, nov11.feedKg, nov11.givenKg, nov11.liveEnd, nov11.opened, nov11.closed, nov11.eggsTotal, broiler.total.feedKg, broiler.total.liveNow, broiler.total.halls],
        ['2026-11-01', 17, 777, 9999500n, 4500000n, 12949, 1, 1, null, 12999500n, 12949, 3],
        'P1 سطر الشهر و«منذ البداية» أرقام (والبيض null للّاحم)',
      );
      t.same(
        broiler.events.map((e) => [e.on, e.type, e.hall, e.site, e.birds ?? null, e.kg ?? null, e.avgG ?? null, e.name ?? null]),
        [
          [nov(1), 'placed', 'قاعة 3', SITE, 1000, null, null, null],
          [nov(9), 'vaccine', 'قاعة 1', SITE, null, null, null, 'نيوكاسل'],
          [nov(9), 'vaccine', 'قاعة 2', SITE, null, null, null, 'نيوكاسل'],
          [nov(10), 'sold', 'قاعة 1', SITE, 900, 1800000n, null, null],
          [nov(12), 'count_diff', 'قاعة 2', SITE, -30, null, null, null],
          [nov(12), 'weight', 'قاعة 1', SITE, null, null, 4500n, null],
          [nov(15), 'closed', 'قاعة 1', SITE, null, null, null, null],
        ],
        'P1 الأحداث بأنواعها: الطيور والكيلو بالآلاف والوزن بأعشار الغرام واسم اللقاح',
      );
      t.same(m.repo.parseHallsHistory({ today: TODAY, month: '2026-11-01', prev: false, next: false, kinds: [], notes: [] }).kinds, [], 'P1 بلا أيّ فوج: kinds فارغة');

      const bad = (mutate) => {
        const value = historyFor('2026-11-01');
        mutate(value);
        return shapeError(() => m.repo.parseHallsHistory(value));
      };
      t.same(
        [
          shapeError(() => m.repo.parseHallsHistory(null)),
          shapeError(() => m.repo.parseHallsHistory([])),
          bad((v) => delete v.today),
          bad((v) => (v.month = '2026-11-17')),
          bad((v) => (v.today = '2026-11-1')),
          bad((v) => (v.prev = 'true')),
          bad((v) => delete v.notes),
          bad((v) => (v.kinds[0].kind = 'quail')),
          bad((v) => v.kinds.reverse()),
          bad((v) => (v.kinds[1].kind = 'broiler')),
          bad((v) => (v.kinds[0].days[0].flocks = '3')),
          bad((v) => (v.kinds[0].days[0].placed = -1)),
          bad((v) => (v.kinds[0].days[0].dead = 1.5)),
          bad((v) => delete v.kinds[0].days[0].count_diff),
          bad((v) => (v.kinds[0].days[0].given_kg = null)),
          bad((v) => (v.kinds[0].days[0].feed_kg = '100.5555')),
          bad((v) => (v.kinds[0].days[0].feed_kg = 100.5)),
          bad((v) => (v.kinds[0].days[1].on = v.kinds[0].days[0].on)),
          bad((v) => (v.kinds[0].months[1].feed_kg = null)),
          bad((v) => (v.kinds[0].months[1].dead = null)),
          bad((v) => (v.kinds[0].months[1].month = '2026-11-02')),
          bad((v) => v.kinds[0].months.reverse()),
          bad((v) => delete v.kinds[0].total.live_now),
          bad((v) => (v.kinds[0].total.halls = null)),
          bad((v) => (v.kinds[0].events[0].type = 'moved')),
          bad((v) => delete v.kinds[0].events[3].kg),
          bad((v) => (v.kinds[0].events[5].avg_g = 450)),
          bad((v) => (v.kinds[0].events[1].name = '')),
          bad((v) => delete v.kinds[0].events[0].site),
          bad((v) => (v.notes[0].version = 0)),
          bad((v) => (v.notes[1].on = v.notes[0].on)),
          bad((v) => (v.notes[0].text = 7)),
          bad((v) => (v.kinds[1].days[1].hdep = 83.67)),
        ],
        [
          'halls_history', 'halls_history', 'today', 'month', 'today', 'prev', 'notes', 'kind', 'kinds', 'kinds',
          'flocks', 'placed', 'dead', 'count_diff', 'given_kg', 'feed_kg', 'feed_kg', 'days',
          'feed_kg', 'dead', 'month', 'months', 'live_now', 'halls',
          'type', 'kg', 'avg_g', 'name', 'site', 'version', 'notes', 'text', 'hdep',
        ],
        'P2 الرفض بخطأ شكل يسمّي الخانة: الجذر، والأيّام بشكلها وأوّل الشهر، والنوع المجهول والمكرّر والمقلوب، والعدد نصّاً أو سالباً أو كسراً، والكيلو الغائب أو بأربع مراتب أو رقماً، واليوم المكرّر، ومجموع الشهر null، والأشهر المقلوبة، والحدث المجهول أو الناقص، والنسخة 0 والملاحظتان ليوم، والنسبة رقماً',
      );

      t.same(
        [
          m.repo.parseHallsNote({ on: nov(17), note: { text: 'نصّ', version: 9 } }),
          m.repo.parseHallsNote({ on: nov(17), note: null }),
          shapeError(() => m.repo.parseHallsNote({ on: nov(17), note: { text: 'نصّ', version: 0 } })),
          shapeError(() => m.repo.parseHallsNote({ on: '17/11/2026', note: null })),
          shapeError(() => m.repo.parseHallsNote({ on: nov(17), note: 'نصّ' })),
        ],
        [{ on: nov(17), note: { text: 'نصّ', version: 9 } }, { on: nov(17), note: null }, 'version', 'on', 'note'],
        'P3 جواب set_halls_note: الملاحظة بنسختها أو null، والرفض بخطأ شكل',
      );

      const { rpcLog } = fresh(as('owner'), { halls_history: (args) => historyFor(args.p_month ?? '2026-11-01'), set_halls_note: (args) => ({ on: args.p_on, note: { text: args.p_note, version: 11 } }) });
      const loaded = await m.repo.loadHallsHistory('2026-11-01');
      await m.repo.loadHallsHistory(null);
      const saved = await m.repo.setHallsNote(nov(17), 'نصّ', 7);
      t.same(
        [rpcLog, loaded.kinds.length, saved],
        [
          [
            ['halls_history', { p_month: '2026-11-01' }],
            ['halls_history', { p_month: null }],
            ['set_halls_note', { p_on: nov(17), p_note: 'نصّ', p_expected_version: 7 }],
          ],
          2,
          { on: nov(17), note: { text: 'نصّ', version: 11 } },
        ],
        'P4 النداءان: halls_history بـp_month (أو null لشهر الخادم)، وset_halls_note بـp_on وp_note وp_expected_version، والجوابان بمحلّليهما',
      );
    }

    // ── T: الجداول ───────────────────────────────────────────────────────────────────────────────────────────────────
    const urlOf = (on) => `/halls/day?on=${on}`;
    await step('T الجداول', async () => {
      const { rpcLog } = fresh(as('owner'), OK);
      await mount(urlOf(TODAY));
      t.same(
        [named(rpcLog, 'halls_day'), named(rpcLog, 'halls_history')],
        [[{ p_on: TODAY }], [{ p_month: '2026-11-01' }]],
        'T1 يوم التقرير ثمّ «منذ أن بدأنا» لأوّل شهره',
      );
      const kinds = byAction('hist-kind');
      t.same(
        [kinds.map((n) => n.getAttribute('data-kind')), kinds.map((n) => descendants(n).find((c) => c.localName === 'h2')?.textContent), kinds.map((n) => within(n, 'hist-start')[0]?.textContent)],
        [['broiler', 'layer'], [BR, LY], [`بدأنا يوم ${fmt(oct(20))} — منذ البداية 29 يوماً.`, `بدأنا يوم ${fmt(nov(5))} — منذ البداية 13 يوماً.`]],
        'T1 قسم لكلّ نوع (اللاحم ثمّ البيّاض) بعنوانه، وسطر البداية بعدد الأيّام الفصيح',
      );
      // الأقسام بعد أقسام اليوم.
      const order = all().filter((n) => ['day-report', 'hist-kind', 'hist-note'].includes(n.getAttribute('data-action'))).map((n) => n.getAttribute('data-action'));
      t.same(order, ['day-report', 'hist-kind', 'hist-kind', 'hist-note'], 'T1 بعد أقسام اليوم: «منذ أن بدأنا» لكلّ نوع ثمّ ملاحظة اليوم');

      const brDays = daysCaption(BR, NOV_NAME);
      t.same(
        tableHeaders(brDays),
        ['التاريخ', 'الأفواج', 'المسكَّن', 'النافق', 'المستبعد', 'المبيع', 'فرق العدّ', 'المأكول (كغم)', 'النازل من المخزن (كغم)', 'الحيّ آخر اليوم'],
        'T2 أيّام الشهر للّاحم بأعمدة العقد (بلا أعمدة البيض)، والنازل «من المخزن» (المنقول من دورة سابقة لا يُعدّ ثانيةً؛ مراجعة 0031 M1)',
      );
      const rows = tableRows(brDays);
      t.same(
        [rows.length, rows[0], rows[2], rows[4], rows[9], rows[11]],
        [
          17,
          [fmt(nov(1)), '3', '1,000', '1', '0', '0', '0', '101.5', '0', '12,994'],
          [fmt(nov(3)), '3الجولات 0 من 3', '0', '—', '—', '0', '0', '—', '0', '12,988'],
          [fmt(nov(5)), '3', '0', '0', '0', '0', '0', '105.5', '500وسطران بلا وزن', '12,982'],
          [fmt(nov(10)), '3', '0', '0', '1', '900', '0', '110.5', '0', '12,967'],
          [fmt(nov(12)), '3', '0', '2', '1', '0', signed(-30), '112.5', '0', '12,961'],
        ],
        'T2 الصفوف يوماً بيوم: «—» للغائب لا صفر، والجولات الناقصة تحت الأفواج، وسطور النازل بلا وزن، وفرق العدّ بإشارته معزولاً، والكيلو بمراتب العمود',
      );
      t.same(
        tableFoot(brDays),
        [['مجموع الشهر', '1,000', '777', '11', '900', signed(-30), '9,999.5', '4,500وسطران بلا وزن', '12,949']],
        'T2 صفّ المجموع سطرُ الشهر من الخادم حرفاً (النافق 777 لا مجموع الصفوف)، والحيّ آخر الشهر',
      );
      const marked = rowsOf(brDays).filter((tr) => tr.getAttribute('data-tone') === 'mark');
      t.same(
        [marked.length, marked[0]?.children[0]?.textContent, within(marked[0], 'hist-selected').length, rowsOf(brDays).filter((tr) => within(tr, 'hist-selected').length).length],
        [1, `${fmt(nov(17))}يوم التقرير`, 1, 1],
        'T2 يوم التقرير مميَّز وحده: خلفية الصفّ وكلمة «يوم التقرير» في خلية التاريخ (الخلفية لا تُطبع)',
      );
      const lyDays = daysCaption(LY, NOV_NAME);
      t.same(
        [tableHeaders(lyDays).slice(-3), tableRows(lyDays).length, tableRows(lyDays)[0].slice(-3), tableRows(lyDays)[1].slice(-3), tableFoot(lyDays)[0].slice(-3)],
        [['البيض', 'المكسور', 'نسبة الإنتاج'], 13, ['—', '—', '—'], ['4,100', '12', '83.67%'], ['49,200', '144', '83.10%']],
        'T2 أعمدة البيض للبيّاض وحده: البيض والمكسور ونسبة الإنتاج، و«—» يوم بلا بيض، ومجموعها من سطر الشهر',
      );

      const brMonths = monthsCaption(BR);
      t.same(
        [tableHeaders(brMonths), tableRows(brMonths), tableFoot(brMonths)],
        [
          ['الشهر', 'الأيّام', 'المسكَّن', 'النافق', 'المستبعد', 'المبيع', 'فرق العدّ', 'المأكول (كغم)', 'النازل من المخزن (كغم)', 'الحيّ آخر الشهر'],
          [
            [OCT_NAME, '12', '12,000', '30', '5', '0', '0', '3,000.0', '3,500', '11,965'],
            [NOV_NAME, '17', '1,000', '777', '11', '900', signed(-30), '9,999.5', '4,500وسطران بلا وزن', '12,949'],
          ],
          [['منذ البداية', '29', '13,000', '807', '16', '900', signed(-30), '12,999.5', '8,000وسطران بلا وزن', '12,949']],
        ],
        'T3 الأشهر من البداية بأعمدة العقد وفرق العدّ (يُكمل حساب الحيّ في سطر الشهر؛ مراجعة 0031 L2)، وصفّ «منذ البداية» من total (والحيّ فيه حيّ اليوم)',
      );
      t.same(
        rowsOf(brMonths).map((tr) => tr.getAttribute('data-tone')),
        [null, 'mark'],
        'T3 شهر يوم التقرير مميَّز',
      );
      t.same(
        [tableHeaders(monthsCaption(LY)).slice(-2), tableFoot(monthsCaption(LY))[0].slice(-2)],
        [['البيض', 'نسبة الإنتاج'], ['49,200', '83.10%']],
        'T3 أعمدة البيض للبيّاض وحده',
      );
    });

    // ── W: «ما جرى» ──────────────────────────────────────────────────────────────────────────────────────────────────
    await step('W ما جرى', async () => {
      fresh(as('owner'), OK);
      await mount(urlOf(nov(12)));
      const [brWhat, lyWhat] = byAction('hist-what');
      t.same(
        [within(brWhat, 'hist-sentence')[0]?.textContent, within(lyWhat, 'hist-sentence')[0]?.textContent],
        [
          `منذ ${fmt(oct(20))}: سُكّن 13,000 طير في 3 أفواج، ونفق 807 طيور، واستُبعد 16 طيراً، وبيع 900 طير، وفرق العدّ ${signed(-30)}، وأُكل من العلف 12,999.5 كغم، ونزل إلى القاعات من العلف 8,000 كغم وسطران بلا وزن، وأُغلق فوج واحد، واستُعملت 3 قاعات، والحيّ الآن 12,949 طيراً.`,
          `منذ ${fmt(nov(5))}: سُكّن 5,000 طير في فوج واحد، ونفق 13 طيراً، وأُكل من العلف 7,150 كغم، وجُمع 49,200 بيضة بنسبة إنتاج 83.10%، واستُعملت قاعة واحدة، والحيّ الآن 4,987 طيراً.`,
        ],
        'W1 الجملة من total بالعدد الفصيح (807 طيور، 16 طيراً، 900 طير، فوج واحد، 3 قاعات)، وما كان صفراً لا يُذكر',
      );
      const groups = within(brWhat, 'hist-event-day');
      t.same(
        groups.map((g) => [g.getAttribute('data-day'), within(g, 'hist-event').map((e) => e.textContent)]),
        [
          [nov(1), ['قاعة 3 (حقل الأمير): سُكّن 1,000 طير.']],
          [nov(9), ['قاعة 1 (حقل الأمير): أُعطي لقاح «نيوكاسل».', 'قاعة 2 (حقل الأمير): أُعطي لقاح «نيوكاسل».']],
          [nov(10), ['قاعة 1 (حقل الأمير): بيع 900 طير وزنها 1,800 كغم.']],
          [nov(12), [`قاعة 2 (حقل الأمير): فرق العدّ ${signed(-30)}.`, 'قاعة 1 (حقل الأمير): وزن العيّنة 450.0 غرام.']],
          [nov(15), ['قاعة 1 (حقل الأمير): أُغلقت الدورة.']],
        ],
        'W2 أحداث الشهر مجمَّعة باليوم بترتيب الخادم، وكلّ حدث بقاعته وحقله وجملته',
      );
      t.same(
        groups.map((g) => [g.getAttribute('aria-current'), within(g, 'hist-selected').length]),
        [[null, 0], [null, 0], [null, 0], ['date', 1], [null, 0]],
        'W2 يوم التقرير (12) مميَّز بين أيّام الأحداث',
      );
      t.same(
        [within(lyWhat, 'hist-event').map((e) => e.textContent), m.hist.eventsByDay([]).length],
        [['قاعة البيض 1 (حقل البيض): سُكّن 5,000 طير.'], 0],
        'W2 أحداث البيّاض في قسمه',
      );
      t.same(
        [m.hist.flocksText(1), m.hist.flocksText(2), m.hist.flocksText(5), m.hist.flocksText(12), m.hist.flocksText(100), m.hist.ofFlocksText(2), m.hist.hallsText(2), m.hist.hallsText(11), m.hist.eggsText(2), m.hist.eggsText(15)],
        ['فوج واحد', 'فوجان', '5 أفواج', '12 فوجاً', '100 فوج', 'فوجين', 'قاعتان', '11 قاعةً', 'بيضتان', '15 بيضة'],
        'W3 صيغ العدد: الأفواج مرفوعة ومجرورة، والقاعات، والبيض',
      );
    });

    // ── M: الشهر يتبع يوم التقرير ───────────────────────────────────────────────────────────────────────────────────
    await step('M الشهر يتبع اليوم', async () => {
      const { rpcLog } = fresh(as('owner'), OK);
      await mount(urlOf(nov(1)));
      const before = [named(rpcLog, 'halls_history'), rowsOf(daysCaption(BR, NOV_NAME)).findIndex((tr) => tr.getAttribute('data-tone') === 'mark')];
      await click(byAction('day-prev')[0]);
      await settle();
      const october = [
        named(rpcLog, 'halls_day').at(-1),
        named(rpcLog, 'halls_history').at(-1),
        tableRows(daysCaption(BR, OCT_NAME))?.length,
        rowsOf(daysCaption(BR, OCT_NAME)).findIndex((tr) => tr.getAttribute('data-tone') === 'mark'),
        tableRows(daysCaption(LY, OCT_NAME)),
        byAction('hist-kind').map((n) => within(n, 'hist-no-events').length),
        tableFoot(daysCaption(LY, OCT_NAME)),
      ];
      t.same(
        [before, october],
        [
          [[{ p_month: '2026-11-01' }], 0],
          [{ p_on: oct(31) }, { p_month: '2026-10-01' }, 12, 11, [['لا أيّام من تشرين الأول 2026 في المدّة: بدأنا يوم 05/11/2026.']], [0, 1], null],
        ],
        'M1 «اليوم السابق» إلى 31/10: الشهر صار تشرين الأول (يوم 31 مميَّز)، والبيّاض الذي بدأ بعده بلا أيّام ولا مجموع ولا أحداث',
      );
      await click(byAction('day-next')[0]);
      await click(byAction('day-next')[0]);
      t.same(
        [named(rpcLog, 'halls_history').map((args) => args.p_month), rowsOf(daysCaption(BR, NOV_NAME)).findIndex((tr) => tr.getAttribute('data-tone') === 'mark')],
        [['2026-11-01', '2026-10-01', '2026-11-01', '2026-11-01'], 1],
        'M2 العودة إلى تشرين الثاني ثمّ يوم 2: يُقرأ الشهر بعد كلّ تقرير يوم (فلا يتأخّر عن اليوم المعروض)، والتمييز ينتقل إلى يوم 2',
      );
    });

    await step('M3 المتابعة بلا ?on=', async () => {
      const { rpcLog } = fresh(as('owner'), OK);
      await mount('/halls/day');
      t.same(
        [named(rpcLog, 'halls_day'), named(rpcLog, 'halls_history')],
        [[{ p_on: null }], [{ p_month: '2026-11-01' }]],
        'M3 الصفحة تتبع اليوم: الشهر من يوم الخادم في جواب halls_day لا من ساعة الجهاز',
      );
    });

    // ── N: الملاحظة ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('N1 الصلاحية والعرض', async () => {
      const seen = [];
      for (const role of ['owner', 'manager', 'accountant', 'hall_worker', 'viewer']) {
        fresh(as(role), OK);
        await mount(urlOf(TODAY));
        seen.push([role, textOf('hist-note-text'), byAction('hist-note-write').length, textOf('hist-note-write')]);
        await unmount();
      }
      t.same(
        seen,
        [
          ['owner', 'سطر أوّل\nسطر ثانٍ', 1, 'عدّل الملاحظة'],
          ['manager', 'سطر أوّل\nسطر ثانٍ', 1, 'عدّل الملاحظة'],
          ['accountant', 'سطر أوّل\nسطر ثانٍ', 1, 'عدّل الملاحظة'],
          ['hall_worker', 'سطر أوّل\nسطر ثانٍ', 1, 'عدّل الملاحظة'],
          ['viewer', 'سطر أوّل\nسطر ثانٍ', 1, 'عدّل الملاحظة'],
        ],
        'N1 ملاحظة اليوم يراها ويكتبها كلّ عضو (0034، كلمة المالك 2026-11-21: «الكل مثل المالك بكل شيء»)',
      );
      fresh(as('owner'), OK);
      await mount(urlOf(nov(16)));
      t.same(
        [descendants(byAction('hist-note')[0]).find((n) => n.localName === 'h2')?.textContent, textOf('hist-note-none'), textOf('hist-note-write')],
        [`ملاحظة يوم ${fmt(nov(16))}`, 'لا ملاحظة لهذا اليوم.', 'اكتب ملاحظة'],
        'N1 يومٌ بلا ملاحظة: «لا ملاحظة» و«اكتب ملاحظة»',
      );
    });

    await step('N2 الحفظ بشرط اللقطة', async () => {
      const { rpcLog } = fresh(as('owner'), { ...OK, set_halls_note: (args) => ({ on: args.p_on, note: { text: args.p_note, version: 9 } }) });
      await mount(urlOf(TODAY));
      await click(byAction('hist-note-write')[0]);
      const input = byAction('halls-note-input')[0];
      const opened = [dialog() !== null, input?.value];
      type(input, '  ملاحظة جديدة\u{200B} ');
      await settle();
      const reads = named(rpcLog, 'halls_history').length;
      await submitDialog();
      t.same(
        [opened, named(rpcLog, 'set_halls_note'), dialog(), lastToast(), named(rpcLog, 'halls_history').length - reads],
        [[true, 'سطر أوّل\nسطر ثانٍ'], [{ p_on: TODAY, p_note: 'ملاحظة جديدة', p_expected_version: 7 }], null, `حُفظت ملاحظة يوم ${fmt(TODAY)}.`, 1],
        'N2 النافذة بنصّ الملاحظة، والحفظ مقصوصاً كالخادم وبشرط نسختها حين فُتحت (7)، ثمّ التنبيه وقراءة الشهر من جديد',
      );
    });

    await step('N3 note_changed', async () => {
      const { rpcLog } = fresh(as('owner'), {
        halls_day: (args) => dayFor(args.p_on),
        halls_history: (args, n) => {
          const value = historyFor(args.p_month);
          if (n >= 2) value.notes[1] = { on: nov(17), text: 'كتبها غيري', version: 8 };
          return value;
        },
        set_halls_note: (args, n) => (n === 1 ? Promise.reject(new m.RejectedError('note_changed', 'غُيّرت الملاحظة.')) : { on: args.p_on, note: { text: args.p_note, version: 10 } }),
      });
      await mount(urlOf(TODAY));
      await click(byAction('hist-note-write')[0]);
      type(byAction('halls-note-input')[0], 'ما كتبته أنا');
      await settle();
      await submitDialog();
      await settle();
      const afterReject = [textOf('halls-note-changed'), byAction('halls-note-input')[0]?.value, named(rpcLog, 'halls_history').length];
      await submitDialog();
      t.same(
        [afterReject, named(rpcLog, 'set_halls_note').map((args) => args.p_expected_version), dialog()],
        [
          ['غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت. الملاحظة الآن: «كتبها غيري». ما كتبته باقٍ هنا: احفظه ليحلّ محلّها، أو أغلق النافذة.', 'ما كتبته أنا', 2],
          [7, 8],
          null,
        ],
        'N3 note_changed يُقال ويُقرأ الشهر من جديد، وأوّل قراءة بعده تصير الأساس («الملاحظة الآن») وما كُتب باقٍ، والحفظ الثاني بشرط النسخة الجديدة (8)',
      );
    });

    await step('N4 الفشل بعد note_changed', async () => {
      const { rpcLog } = fresh(as('owner'), {
        halls_day: (args) => dayFor(args.p_on),
        halls_history: (args, n) => (n === 2 ? Promise.reject(new m.NetworkError()) : historyFor(args.p_month)),
        set_halls_note: () => Promise.reject(new m.RejectedError('note_changed', 'غُيّرت الملاحظة.')),
      });
      await mount(urlOf(TODAY));
      await click(byAction('hist-note-write')[0]);
      type(byAction('halls-note-input')[0], 'نصّ');
      await settle();
      await submitDialog();
      await settle();
      const failed = [textOf('halls-note-changed')?.includes('وتعذّرت قراءة الملاحظة الحاليّة'), disabled(byAction('save-halls-note')[0]), byAction('halls-note-reread').length];
      await click(byAction('halls-note-reread')[0]);
      await settle();
      t.same(
        [failed, named(rpcLog, 'halls_history').length, textOf('halls-note-changed')?.includes('الملاحظة الآن: «سطر أوّل'), disabled(byAction('save-halls-note')[0])],
        [[true, true, 1], 3, true, false],
        'N4 قراءة فاشلة بعد note_changed: يُقال ذلك و«احفظ» مقفول حتى «أعد القراءة»، ثمّ الأساس من القراءة الناجحة',
      );
    });

    await step('N5 المسح والفراغ والحدّ', async () => {
      const { rpcLog } = fresh(as('owner'), { ...OK, set_halls_note: (args) => ({ on: args.p_on, note: null }) });
      await mount(urlOf(TODAY));
      await click(byAction('hist-note-write')[0]);
      await click(byAction('erase-halls-note')[0]);
      const erased = [named(rpcLog, 'set_halls_note'), lastToast(), dialog()];
      await unmount();
      const second = fresh(as('owner'), OK);
      await mount(urlOf(nov(16)));
      await click(byAction('hist-note-write')[0]);
      const noErase = byAction('erase-halls-note').length;
      type(byAction('halls-note-input')[0], ' \u{2060} ');
      await settle();
      await submitDialog();
      const emptyClosed = dialog();
      await click(byAction('hist-note-write')[0]);
      type(byAction('halls-note-input')[0], 'ب'.repeat(501));
      await settle();
      await submitDialog();
      t.same(
        [erased, noErase, emptyClosed, descendants(dialog() ?? body()).find((n) => n.getAttribute('role') === 'alert')?.textContent, named(second.rpcLog, 'set_halls_note')],
        [[[{ p_on: TODAY, p_note: '', p_expected_version: 7 }], `مُسحت ملاحظة يوم ${fmt(TODAY)}.`, null], 0, null, 'الملاحظة أطول من 500 حرف (501). اختصرها.', []],
        'N5 «امسح الملاحظة» نصٌّ فارغ بشرط نسختها؛ ويومٌ بلا ملاحظة: لا «امسح»، وحروف خفيّة وحدها تُغلق النافذة بلا نداء، و501 حرف تُرفض قبل الإرسال',
      );
      t.same(
        [[...m.hist.HALLS_NOTE_SPACES], m.hist.hallsNoteText('\u{200F} نصّ\u{2060}\u{FEFF} '), m.hist.hallsNoteText('\u{85}a b\u{A0}')],
        [[...m.NOTE_SPACES], m.noteText('\u{200F} نصّ\u{2060}\u{FEFF} '), 'a b'],
        'N5 القصّ مرآة private.note_text: قائمة الرصيد اليومي نفسها حرفاً',
      );
    });

    await step('N6 اللقطة لا القراءة اللاحقة', async () => {
      // قراءةٌ وصلت والنافذة مفتوحة (ملاحظة غيّرها غيره إلى النسخة 8) لا تغيّر ما رآه الكاتب: الحفظ بشرط نسخة اللقطة (7)، فيرفضه الخادم بـnote_changed
      // بدل أن يكتب فوق ما لم يُعرض (درس 2026-11-09).
      const { rpcLog } = fresh(as('owner'), { set_halls_note: (args) => ({ on: args.p_on, note: { text: args.p_note, version: 12 } }) });
      const saved = [];
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      const props = (latest, reads) => ({ day: TODAY, shown: { text: 'ما رآه', version: 7 }, latest, reads, failed: false, onClose: () => {}, onSaved: (r) => saved.push(r), onReread: () => {} });
      m.flushSync(() => root.render(m.h(m.hist.HallsNoteDialog, props({ text: 'ما رآه', version: 7 }, 1))));
      await settle();
      m.flushSync(() => root.render(m.h(m.hist.HallsNoteDialog, props({ text: 'كتبها غيري', version: 8 }, 2))));
      await settle();
      const value = byAction('halls-note-input')[0]?.value;
      type(byAction('halls-note-input')[0], 'ما كتبته');
      await settle();
      await submitDialog();
      t.same(
        [value, named(rpcLog, 'set_halls_note'), saved.length],
        ['ما رآه', [{ p_on: TODAY, p_note: 'ما كتبته', p_expected_version: 7 }], 1],
        'N6 النصّ والنسخة من لقطة الفتح: قراءةٌ لاحقة لم تُعرض لا تغيّر شرط الحفظ',
      );
    });

    // ── I: «أرسل صورة» ─────────────────────────────────────────────────────────────────────────────────────────────
    const savedComputed = globalThis.window.getComputedStyle;
    globalThis.window.getComputedStyle = () => ({ getPropertyValue: (name) => (name === '--surface' ? ' 8 13 23 ' : '') });
    try {
      await step('I1 المشاركة بملفّ PNG', async () => {
        const shared = [];
        setNavigator({ onLine: true, canShare: (data) => Array.isArray(data?.files) && data.files.every((f) => f.type === 'image/png'), share: async (data) => shared.push(data) });
        const { captures } = fresh(as('owner'), OK);
        await mount(urlOf(TODAY));
        const button = byAction('send-image')[0];
        const label = button?.textContent;
        await click(button);
        await settle();
        const [capture] = captures;
        const file = shared[0]?.files?.[0];
        t.same(
          [
            label,
            captures.length,
            capture?.inBody,
            capture?.node.hasAttribute('data-capture'),
            capture?.node.getAttribute('data-action'),
            capture?.node.style.width,
            capture?.options,
            ['day-title', 'hist-kind', 'hist-note', 'hist-note-text'].map((name) => capture?.html.includes(`data-action="${name}"`)),
          ],
          [
            'أرسل صورة',
            1,
            true,
            true,
            'daily-page',
            `${m.IMAGE_WIDTH}px`,
            { width: 720, pixelRatio: 2, backgroundColor: 'rgb(8, 13, 23)', preferredFontFormat: 'woff2', style: { margin: '0' } },
            [true, true, true, true],
          ],
          'I1 الصورة نسخةٌ من الصفحة كلّها (اليوم و«منذ أن بدأنا» والملاحظة) بـdata-capture في المستند وبعرض ثابت 720 ومقياس 2 وخلفية سطح السمة الحاليّة',
        );
        t.same(
          [shared.length, file instanceof File, file?.type, file?.name, shared[0]?.title, all().filter((n) => n.hasAttribute('data-capture')).length, toasts(), clicked.length],
          [1, true, 'image/png', 'halls-report-2026-11-17.png', `تقرير القاعات اليومي — ${fmt(TODAY)}`, 0, [], 0],
          'I1 ثمّ navigator.share بملفّ PNG واحد باسم اليوم وعنوان التقرير، والنسخة أُزيلت، بلا تنبيه ولا تنزيل',
        );
      });

      await step('I2 بلا مشاركة بالملفّات: التنزيل', async () => {
        const shared = [];
        setNavigator({ onLine: true, share: async (data) => shared.push(data) });
        clicked.length = 0;
        fresh(as('owner'), OK);
        await mount(urlOf(TODAY));
        await click(byAction('send-image')[0]);
        await settle();
        t.same(
          [shared, clicked.map((c) => [c.tag, c.download, c.inBody, String(c.href).startsWith('blob:')]), lastToast(), all().filter((n) => n.localName === 'a' && n.download).length],
          [[], [['a', 'halls-report-2026-11-17.png', true, true]], 'حُفظت الصورة «halls-report-2026-11-17.png» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى من تريد.', 0],
          'I2 نافذة مشاركة لا تقبل الملفّات (لا canShare): تُنزَّل الصورة برابط مؤقّت ويُقال أين حُفظت',
        );
        await unmount();
        clicked.length = 0;
        setNavigator({ onLine: true, canShare: () => false, share: async (data) => shared.push(data) });
        fresh(as('owner'), OK);
        await mount(urlOf(TODAY));
        await click(byAction('send-image')[0]);
        await settle();
        t.same([shared.length, clicked.length], [0, 1], 'I2 canShare يرفض الملفّ: التنزيل لا المشاركة');
      });

      await step('I3 الإلغاء والضغطة القديمة والفشل', async () => {
        clicked.length = 0;
        setNavigator({ onLine: true, canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
        fresh(as('owner'), OK);
        await mount(urlOf(TODAY));
        await click(byAction('send-image')[0]);
        await settle();
        const cancelled = [toasts(), clicked.length, byAction('send-ready').length];
        await unmount();

        const shared = [];
        let first = true;
        setNavigator({
          onLine: true,
          canShare: () => true,
          share: async (data) => {
            if (first) {
              first = false;
              throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
            }
            shared.push(data);
          },
        });
        const { captures } = fresh(as('owner'), OK);
        await mount(urlOf(TODAY));
        await click(byAction('send-image')[0]);
        await settle();
        const blocked = [byAction('send-ready').length, byAction('download-ready').length, captures.length];
        await click(byAction('send-ready')[0]);
        await settle();
        t.same(
          [cancelled, blocked, shared.map((d) => d.files[0].name), captures.length, byAction('send-ready').length],
          [[[], 0, 0], [1, 1, 1], ['halls-report-2026-11-17.png'], 1, 0],
          'I3 إغلاق نافذة المشاركة ليس فشلاً؛ ورفض المتصفّح بعد التجهيز (NotAllowedError) يُبقي الصورة جاهزة بزرّ «أرسلها» يشاركها بضغطة جديدة بلا تصوير ثانٍ',
        );
        await unmount();

        clicked.length = 0;
        setNavigator({ onLine: true, canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } });
        fresh(as('owner'), OK);
        await mount(urlOf(TODAY));
        await click(byAction('send-image')[0]);
        await settle();
        await click(byAction('download-ready')[0]);
        t.same([clicked.length, byAction('send-ready').length, lastToast()?.startsWith('حُفظت الصورة')], [1, 0, true], 'I3 «نزّلها» من الصورة الجاهزة');
        await unmount();

        setNavigator({ onLine: true, canShare: () => true, share: async () => {} });
        const failing = fresh(as('owner'), OK, () => Promise.reject(new Error('canvas')));
        await mount(urlOf(TODAY));
        await click(byAction('send-image')[0]);
        await settle();
        t.same(
          [failing.captures.length, lastToast(), globalThis.__hh.toasts.at(-1)?.tone, all().filter((n) => n.hasAttribute('data-capture')).length, disabled(byAction('send-image')[0])],
          [1, 'تعذّر تجهيز الصورة على هذا الجهاز. اطبع التقرير أو احفظه PDF بدلاً من ذلك.', 'danger', 0, false],
          'I3 تعذّر التصوير: تنبيه بطريق الطباعة، والنسخة أُزيلت، والزرّ يعود',
        );
      });

      await step('I4 لا صورة قبل «منذ أن بدأنا»', async () => {
        setNavigator({ onLine: true, canShare: () => true, share: async () => {} });
        let release = null;
        fresh(as('owner'), { halls_day: (args) => dayFor(args.p_on), halls_history: (args) => new Promise((resolve) => { release = () => resolve(historyFor(args.p_month)); }) });
        await mount(urlOf(TODAY));
        const waiting = [disabled(byAction('send-image')[0]), disabled(byAction('print-day')[0]), textOf('hist-loading')];
        release();
        await settle();
        t.same(
          [waiting, disabled(byAction('send-image')[0]), byAction('hist-loading').length],
          [[true, false, 'جارٍ قراءة ما جرى منذ أن بدأنا…'], false, 0],
          'I4 «أرسل صورة» مقفول حتى يصل «منذ أن بدأنا» لشهر اليوم (الصورة التقرير كلّه)، و«اطبع» كما كان',
        );
      });
    } finally {
      globalThis.window.getComputedStyle = savedComputed;
    }

    // ── F: فشل القراءة ───────────────────────────────────────────────────────────────────────────────────────────────
    // ── R: مراجعة 0031 ───────────────────────────────────────────────────────────────────────────────────────────────
    await step('R1 أحداث اليوم بأرقام القاعات', async () => {
      // ترتيب الخادم (النوع ثمّ اسم القاعة حرفاً حرفاً): «قاعة 1» ثمّ «قاعة 44» ثمّ «قاعة 5».
      const day = [
        ev(nov(3), 'placed', 'قاعة 1', { birds: 100 }),
        ev(nov(3), 'placed', 'قاعة 44', { birds: 100 }),
        ev(nov(3), 'placed', 'قاعة 5', { birds: 100 }),
        ev(nov(3), 'vaccine', 'قاعة 2', { name: 'نيوكاسل' }),
      ];
      const groups = m.hist.eventsByDay(m.repo.parseHallsHistory({ ...historyFor('2026-11-01'), kinds: [{ ...historyFor('2026-11-01').kinds[0], events: day }] }).kinds[0].events);
      t.same(
        groups.map((g) => [g.on, g.events.map((e) => `${e.type} ${e.hall}`)]),
        [[nov(3), ['placed قاعة 1', 'placed قاعة 5', 'placed قاعة 44', 'vaccine قاعة 2']]],
        'R1 أحداث اليوم بنوعها ثمّ بأرقام القاعات («قاعة 5» قبل «قاعة 44» كجدول الحقل؛ مراجعة 0031 L1)',
      );
    });

    await step('R2 ملاحظة المنشأة لمن نطاقه المنشأة كلّها', async () => {
      const seen = [];
      for (const [label, scopes] of [['manager بلا نطاق', []], ['manager محصور بحقل', [{ siteId: 's-b', divisionId: null, warehouseId: null, hallId: null }]]]) {
        fresh({ status: 'ready', workspace: { ...ws('manager'), scopes }, offline: false }, OK);
        await mount(urlOf(TODAY));
        seen.push([label, textOf('hist-note-text'), byAction('hist-note-write').length]);
        await unmount();
      }
      t.same(seen, [['manager بلا نطاق', 'سطر أوّل\nسطر ثانٍ', 1], ['manager محصور بحقل', 'سطر أوّل\nسطر ثانٍ', 1]],
        'R2 صفوف النطاق لا تحجب زرّ الملاحظة بعد 0034 (النطاق المنشأة كلّها لكلّ عضو)');
    });

    await step('R3 الصورة بعد حفظ الملاحظة', async () => {
      // القراءة الأولى تصل، والتي بعد الحفظ معلّقة: الملاحظة المعروضة ما حُفظ للتوّ، و«أرسل صورة» ينتظر القراءة (مراجعة 0031 M2).
      const { rpcLog, captures } = fresh(as('owner'), {
        halls_day: (args) => dayFor(args.p_on),
        halls_history: (args, n) => (n === 1 ? historyFor(args.p_month) : new Promise(() => {})),
        set_halls_note: (args) => ({ on: args.p_on, note: { text: args.p_note, version: 11 } }),
      });
      await mount(urlOf(TODAY));
      const before = disabled(byAction('send-image')[0]);
      await click(byAction('hist-note-write')[0]);
      type(byAction('halls-note-input')[0], 'بعد الحفظ مباشرةً');
      await settle();
      await submitDialog();
      await settle();
      t.same(
        [before, named(rpcLog, 'halls_history').length, textOf('hist-note-text'), disabled(byAction('send-image')[0]), captures.length],
        [false, 2, 'بعد الحفظ مباشرةً', true, 0],
        'R3 بعد الحفظ والقراءة التالية في الطريق: الملاحظة المعروضة المحفوظة للتوّ، و«أرسل صورة» معطّل حتى تصل القراءة',
      );
    });

    await step('R4 فشل القراءة بعد الحفظ', async () => {
      // القراءة بعد الحفظ تفشل: الملاحظة المعروضة والصورة والتعديل بالمحفوظ (نصّه ونسخته 11)، لا بما قبل الحفظ (7).
      const { rpcLog, captures } = fresh(as('owner'), {
        halls_day: (args) => dayFor(args.p_on),
        halls_history: (args, n) => (n === 1 ? historyFor(args.p_month) : Promise.reject(new m.RejectedError('timeout', ''))),
        set_halls_note: (args, n) => ({ on: args.p_on, note: { text: args.p_note, version: n === 1 ? 11 : 12 } }),
      });
      await mount(urlOf(TODAY));
      await click(byAction('hist-note-write')[0]);
      type(byAction('halls-note-input')[0], 'المحفوظة');
      await settle();
      await submitDialog();
      await settle();
      const afterFail = [byAction('hist-failed').length, textOf('hist-note-text'), disabled(byAction('send-image')[0])];
      await click(byAction('send-image')[0]);
      await settle();
      const imaged = captures.at(-1)?.html ?? '';
      await click(byAction('hist-note-write')[0]);
      const reopened = byAction('halls-note-input')[0]?.value;
      type(byAction('halls-note-input')[0], 'تعديل بعدها');
      await settle();
      await submitDialog();
      await settle();
      t.same(
        [afterFail, imaged.includes('المحفوظة') && !imaged.includes('سطر ثانٍ'), reopened, named(rpcLog, 'set_halls_note').map((a) => a.p_expected_version)],
        [[1, 'المحفوظة', false], true, 'المحفوظة', [7, 11]],
        'R4 فشل القراءة بعد الحفظ: المعروض والصورة بالمحفوظ، والتعديل التالي بنصّه وبشرط نسخته (11) لا بما قبل الحفظ',
      );
    });

    await step('F فشل «منذ أن بدأنا» ورفضه', async () => {
      const { rpcLog } = fresh(as('owner'), { halls_day: (args) => dayFor(args.p_on), halls_history: (args, n) => (n === 1 ? Promise.reject(new m.NetworkError()) : historyFor(args.p_month)) });
      await mount(urlOf(TODAY));
      const failed = [byAction('hist-failed').length, within(byAction('hist-failed')[0], 'retry').length, byAction('hist-kind').length, byAction('day-report').length, disabled(byAction('send-image')[0])];
      await click(within(byAction('hist-failed')[0], 'retry')[0]);
      await settle();
      t.same(
        [failed, named(rpcLog, 'halls_history').length, byAction('hist-failed').length, byAction('hist-kind').length],
        [[1, 1, 0, 1, true], 2, 0, 2],
        'F1 القراءة الفاشلة بـ«أعد المحاولة» (لا تُطبع)، والتقرير اليوميّ باقٍ، ثمّ الأقسام',
      );
      await unmount();
      fresh(as('owner'), { halls_day: (args) => dayFor(args.p_on), halls_history: () => Promise.reject(new m.RejectedError('future_month', 'لا شهر بعد شهر اليوم.')) });
      await mount(urlOf(TODAY));
      t.same(
        [byAction('hist-failed')[0]?.textContent, byAction('hist-kind').length],
        ['لا شهر بعد شهر اليوم.', 0],
        'F2 الرفض بتلميح الخادم',
      );
    });

    // ── S: الطباعة والمشاركة نصّاً ─────────────────────────────────────────────────────────────────────────────────
    await step('S الطباعة والنصّ', async () => {
      const shared = [];
      setNavigator({ onLine: true, share: async (data) => shared.push(data) });
      fresh(as('owner'), OK);
      await mount(urlOf(TODAY));
      const css = styleText();
      t.same(
        [
          css.includes('[data-action="hist-kind"] h2, [data-action="hist-kind"] h3, [data-action="hist-note"] h2 { break-after: avoid; }'),
          css.includes('[data-action="hist-event-day"] { break-inside: avoid; }'),
          css.includes('[data-capture] [class~="print:hidden"] { display: none !important; }'),
          css.includes('[data-capture] [data-action="day-report"] > div, [data-capture] [data-action="hist-table"] > div { max-height: none; overflow: visible; }'),
          byAction('hist-table').every((n) => (n.getAttribute('class') ?? '').includes('print:[&>div]:max-h-none')),
          byAction('hist-note-write')[0]?.parentNode?.getAttribute('class'),
        ],
        [true, true, true, true, true, 'print:hidden'],
        'S1 الأقسام الجديدة تُطبع كاملة (الجداول بلا حدّ ارتفاع، والعناوين لا تنفصل عمّا بعدها)، وزرّ الملاحظة لا يُطبع ولا يُصوَّر',
      );
      const share = byAction('share-day')[0];
      await click(share);
      t.same(
        [share?.textContent, (share?.getAttribute('class') ?? '').includes('text-ink-muted'), shared.length, shared[0]?.title, byAction('print-day')[0]?.textContent],
        ['شارك نصّاً', true, 1, `تقرير القاعات اليومي — ${fmt(TODAY)}`, 'اطبع أو احفظ PDF'],
        'S2 «شارك نصّاً» ثانويّ ويشارك النصّ كما كان، و«اطبع أو احفظ PDF» باقٍ',
      );
    });

    // ── O: الشكل الرسميّ (عقد 0036 S1، «مثل تقارير المستشفيات») ────────────────────────────────────────────────────────
    // ساعة الجهاز ثابتة («طُبع في» من new Date)، وتتقدّم قبل الطباعة وقبل الصورة: الوقت المكتوب في الصفحة يتجدّد قبل أن تلتقطه.
    const RealDate = Date;
    let clock = new RealDate(2026, 10, 17, 9, 5).getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(clock);
      }
      static now() {
        return clock;
      }
    }
    const ofcOf = (cls) => all().filter((n) => (n.getAttribute('class') ?? '').split(' ').includes(cls));
    const infoOf = () => (byAction('report-info')[0]?.children ?? []).map((cell) => cell.children.map((n) => n.textContent));
    await step('O1 التقرير اليوميّ ورقةٌ رسمية', async () => {
      globalThis.Date = FixedDate;
      try {
        const shared = [];
        setNavigator({ onLine: true, canShare: () => true, share: async (data) => shared.push(data) });
        const { captures } = fresh(as('owner'), OK);
        await mount(urlOf(TODAY));
        const paper = byAction('day-paper')[0];
        const inPaper = (name) => within(paper, name).length;
        t.same(
          [textOf('day-org'), (byAction('day-org')[0]?.getAttribute('class') ?? '').split(' ').includes('hidden'), textOf('day-title'), textOf('day-rounds'), infoOf()],
          [
            'مشروع الدواجن',
            false,
            `تقرير القاعات اليومي — ${fmt(TODAY)}`,
            'الجولات المسجَّلة: 3 من 4.',
            [['اليوم', fmt(TODAY)], ['الحقول', '2'], ['القاعات', '5'], ['تاريخ التقرير', fmt(TODAY)], ['طُبع في', '17/11/2026 الساعة 09:05']],
          ],
          'O1 الرأس: اسم المنشأة ظاهرٌ على الشاشة (كان للطباعة وحدها)، والعنوان، وسطر الجولات، وشبكة البيانات (اليوم والحقول والقاعات وتاريخ التقرير ووقت الطباعة)',
        );
        t.same(
          [
            ofcOf('ofc-band').map((n) => n.textContent),
            ofcOf('ofc-bar').map((n) => [n.localName, n.textContent]),
            ofcOf('ofc-subbar').map((n) => [n.localName, n.textContent]),
          ],
          [
            [`القاعات — ${fmt(TODAY)}`, `أيّام ${NOV_NAME}`, 'الأشهر من البداية', `أيّام ${NOV_NAME}`, 'الأشهر من البداية'],
            [['h2', BR], ['h2', LY], ['h2', `ملاحظة يوم ${fmt(TODAY)}`]],
            [['h3', 'ما جرى'], ['h3', 'ما جرى']],
          ],
          'O1 الجداول رسمية بشريط اسمها الملوّن (جدول اليوم، وأيّام الشهر والأشهر لكلّ نوع)، وعنوان كلّ نوع والملاحظة شريطُ قسم، و«ما جرى» عنوانٌ فرعيّ',
        );
        t.same(
          [
            textOf('report-by'),
            textOf('report-printed'),
            descendants(byAction('report-sign')[0] ?? body()).filter((n) => n.localName === 'p').map((n) => n.textContent),
            ['report-head', 'day-report', 'hist-kind', 'hist-note', 'report-foot'].map(inPaper),
            ['day-controls', 'back'].map(inPaper),
            m.wideStore.get(),
          ],
          ['أعدّه: علي', 'طُبع في 17/11/2026 الساعة 09:05', ['المسؤول: ………………………', 'التوقيع: ………………………'], [1, 1, 2, 1, 1], [0, 0], 1],
          'O1 التذييل: «أعدّه» باسم المستخدم و«طُبع في» وسطرا «المسؤول» و«التوقيع»؛ والورقة تحمل التقرير كلّه والأزرار خارجها؛ والصفحة عريضة',
        );
        t.same(
          ['send-image', 'print-day', 'share-day'].map((name) => (byAction(name)[0]?.getAttribute('class') ?? '').split(' ').includes('h-11')),
          [true, true, true],
          'O1 «أرسل صورة» و«اطبع أو احفظ PDF» و«شارك نصّاً» بارتفاع 44 نقطة',
        );
        // الطباعة: «طُبع في» يتجدّد عند beforeprint (اطبع وCtrl+P) قبل أن تلتقط الورقة.
        clock = new RealDate(2026, 10, 17, 14, 47).getTime();
        fire(globalThis.window, 'beforeprint', { bubbles: false });
        await settle();
        const printedNow = [textOf('report-printed'), infoOf().at(-1)];
        // والصورة: الوقت يُكتب قبل النسخ.
        clock = new RealDate(2026, 10, 17, 16, 2).getTime();
        await click(byAction('send-image')[0]);
        await settle();
        t.same(
          [printedNow, captures.length, captures[0]?.html.includes('طُبع في 17/11/2026 الساعة 16:02'), captures[0]?.html.includes('data-action="report-foot"'), shared.length],
          [['طُبع في 17/11/2026 الساعة 14:47', ['طُبع في', '17/11/2026 الساعة 14:47']], 1, true, true, 1],
          'O1 «طُبع في» يتجدّد قبل الطباعة وقبل الصورة (الصورة تحمل الرأس والتذييل بوقتها)',
        );
      } finally {
        globalThis.Date = RealDate;
      }
    });
    await step('O2 الصفحة العريضة تُترك عند المغادرة', async () => {
      t.eq(m.wideStore.get(), 0, 'O2 بعد إزالة التقرير اليوميّ يعود العدّاد صفراً (القشرة تشيل data-wide)');
    });

    // ── X: أجوبة القاعدة الحقيقية ──────────────────────────────────────────────────────────────────────────────────
    if (existsSync(REAL)) {
      const samples = [];
      const walk = (value) => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') {
          if ('kinds' in value && 'notes' in value && 'month' in value) samples.push(value);
          else Object.values(value).forEach(walk);
        }
      };
      walk(JSON.parse(readFileSync(REAL, 'utf8')));
      const parsed = samples.map((sample) => shapeError(() => m.repo.parseHallsHistory(sample)));
      t.ok(samples.length > 0, 'X عيّنات halls_history الحقيقية موجودة');
      t.same(parsed, samples.map(() => 'لم يرمِ'), 'X كلّ عيّنة حقيقية يقرؤها المحلّل بلا خطأ شكل');

      // التكامل: جواب القاعدة الحقيقي يمرّ بالصفحة الحقيقية (درس 2026-11-02)، لا بالمحلّل وحده: جداول كلّ نوع بعدد أيّامه وأشهره، والمجاميع من
      // سطور الخادم، وأحداث الشهر، وملاحظة اليوم المختار.
      await step('X2 الصفحة على العيّنة الحقيقية', async () => {
        const real = JSON.parse(readFileSync(REAL, 'utf8')).halls_history;
        fresh(as('owner'), { halls_day: (args) => dayFor(args.p_on), halls_history: () => JSON.parse(JSON.stringify(real)) });
        await mount('/halls/day?on=2026-11-14');
        const kinds = byAction('hist-kind');
        const [br, ly] = real.kinds;
        const cellsOf = (rows) => (rows ?? []).flat();
        t.same(
          [
            kinds.map((n) => n.getAttribute('data-kind')),
            tableRows(daysCaption(BR, NOV_NAME))?.length,
            tableRows(daysCaption(LY, NOV_NAME))?.length,
            tableRows(monthsCaption(BR))?.length,
            ['27', '3'].every((cell) => cellsOf(tableFoot(daysCaption(BR, NOV_NAME))).includes(cell)),
            ['52', '400'].every((cell) => cellsOf(tableFoot(monthsCaption(BR))).includes(cell)),
            within(kinds[0], 'hist-event').length,
            within(kinds[1], 'hist-no-events').length,
            textOf('hist-note-text')?.includes('ملاحظة جديدة بعد المسح') ?? false,
          ],
          [['broiler', 'layer'], br.days.length, ly.days.length, br.months.length, true, true, br.events.length, 1, true],
          'X2 العيّنة الحقيقية في الصفحة: أيّام كلّ نوع وأشهره، ومجموع الشهر و«منذ البداية» من سطور الخادم (27 نافقاً و3 مستبعدين، و52 و400 مبيعاً)، وأحداث اللاحم الخمسة وبلا أحداث للبيّاض، وملاحظة يوم 14',
        );
      });
    }
  } finally {
    await unmount();
    delete Element.prototype.cloneNode;
    delete Text.prototype.cloneNode;
    delete Comment.prototype.cloneNode;
    delete Element.prototype.click;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete globalThis.navigator;
    delete globalThis.__hh;
    restoreDom();
  }
}
