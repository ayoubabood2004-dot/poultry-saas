// شاشات «القاعات بين يديك» للوكيل ب (0026، كلمة المالك 2026-11-11؛ docs/HALLS_PLAN.md وعقد scratchpad/halls/contract-0026.md): react-dom/client
// الحقيقي على DOM صغير (dom.mjs) يشغّل تقويم القاعة وتقرير الدورة وجدول اللقاحات الحقيقية، وrepo القاعات الحقيقي (المحلّلات وبناء النداءات) على core
// بديل يسجّل كلّ نداء ويجيب بأجوبة العقد (fixtures/halls-contract.json، مكتوبة باليد بأشكال العقد قبل الهجرة). والجلسة والتنبيه بديلان. الصفحات تُركَّب
// بمساراتها في HallsRoutes نفسها (والفحص S يقرأ HallsRoutes.tsx ليثبت التوصيل)، لا عبر HallsRoutes: صفحة الإضافة والتذكير للوكيل أ، فلا يتعلّق هذا
// الفحص بما يستوردانه. الحالات:
// C التقويم: الشهر بمربّعاته (العلف النازل والأدوية والتسجيل بلا مخزن واللقاحات بحالاتها والنافق والملاحظة واليوم الحاليّ وما خارج العمر)، والتنقّل
//   بـp_month، وتفاصيل اليوم، وحذف التسجيل وإلغاء التأشير بمعاملاتهما حرفاً (السبب إلزاميّ مع صرف) والنتيجة المجهولة بالنداء نفسه، والصلاحيات، والطباعة.
// R تقرير الدورة: كلّ قسم بجدوله بالمال وبلا مال، والطباعة.
// V جدول اللقاحات: اختيار عدّة لقاحات والضغط على عدّة أيام، وp_days حرفاً بترتيبها (يوم العمر ثمّ ترتيب اللقاح في القائمة) بالنسخة المقروءة،
//   وstale_program يُبقي التعديل بجدول الفروق ثمّ «اعتمد تعديلي»، والحذف «يُحذف» أو «يُخفى» بـin_use، والإضافة والتعديل، ونهاية الدورة وما يُشال،
//   والقراءة وحدها، والنتيجة المجهولة والتحقّق بعد إعادة رُفضت بشرط النسخة، والصفحات بـ70 يوماً.
// ومراجعة 0026: رقم صرف اللقاح المؤشَّر من مدخله (C1 وX1 بجواب القاعدة)، وحذف التسجيل بعد إعادة بلا «من جهاز آخر» (C4)، والفائت أقدم من سبعة أيام
//   بلا رابط إلى الجولة (C8)، والعلف بلا وزن في الشريط والمجاميع (C9) وتحت كيلو المادّة في التقرير (R4)، ولقاح حُذف من جهاز آخر والجدول يُحفظ
//   (V11–V13)، ونافذتا اللقاح وحذفه بعد stale_vaccine (V14–V15).
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
  session: 'export const useSession = () => globalThis.__hv.session; export const sessionStore = { get: () => globalThis.__hv?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__hv.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'halls-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'halls-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'halls-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};
// core بديل لملفّات repo: call يسجّله __hv.rpc والمحلّل الحقيقي يقرأ الجواب.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__hv.rpc(fn, args);
export const send = async () => { throw new Error('halls-views: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'halls-core',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'halls-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'halls-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as CalendarPage } from './src/pages/halls/CalendarPage.tsx';",
    "export { default as ReportPage } from './src/pages/halls/ReportPage.tsx';",
    "export { default as VaccinesPage } from './src/pages/halls/VaccinesPage.tsx';",
    "export * as repo from './src/lib/repo/halls.ts';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { localDay } from './src/domain/dates.ts';",
    "export { RejectedError, UnknownOutcomeError, NetworkError } from './src/lib/errors.ts';",
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
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const withId = (action, id) => byAction(action).find((n) => n.getAttribute('data-id') === id);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const text = () => body().textContent;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  if (!select) throw new Error('no select');
  select.value = value;
  fire(select, 'change');
};
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click');
  await settle();
};
/** اليوم الذي فيه العقدة (أقرب أب بـdata-day). */
const dayOf = (node) => {
  for (let n = node; n; n = n.parentNode) if (n.getAttribute?.('data-day')) return n.getAttribute('data-day');
  return null;
};
const cell = (day) => byAction('cal-day').find((n) => n.getAttribute('data-day') === day);
const ageCell = (age) => byAction('age-day').find((n) => n.getAttribute('data-age') === String(age));
const bandsOf = (age) => descendants(ageCell(age)).filter((n) => n.getAttribute('data-action') === 'age-band').map((n) => n.textContent);
/** صفوف جدول بعنوانه (caption): نصّ كلّ خلية. */
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** مبلغ عيّنات العقد كما يعرضه fmtMoney («650,000.00»، بفواصل الآلاف ومرتبتين): لا يظهر لمن لا يرى المال (ونسبة النفوق «1.30%» ليست مبلغاً). */
const MONEY_SHAPE = /\d{1,3}(?:,\d{3})+\.\d{2}(?!\d)/u;
/** كلّ عقدة نصّ وحدها (نصّ الخلايا المتجاورة يلتصق في textContent: «2,000.0» ثمّ «1,450.5» تُقرأ «2,000.01»). */
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

const FLOCK = '00000000-0000-4000-8000-000000000001';
const IB = '00000000-0000-4000-8000-000000000021';
const ND = '00000000-0000-4000-8000-000000000022';
const GUM = '00000000-0000-4000-8000-000000000023';
const IB_ITEM = '00000000-0000-4000-8000-000000000034';

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['broiler_farm'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: true,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws('manager') };

/** شهر كانون الأوّل 2026 لفوج سُكّن 1 تشرين الثاني بعمر 1: أيامه كلّها بلا حركة. */
function december() {
  const month = clone(F.flock_month);
  month.month = '2026-12-01';
  month.prev = true;
  month.next = false;
  month.totals = { feed_kg: '0', dead: 0, culled: 0 };
  month.days = Array.from({ length: 31 }, (_, index) => {
    const date = `2026-12-${String(index + 1).padStart(2, '0')}`;
    return { on: date, age: 31 + index, dead: null, culled: null, feed_kg: null, note: null, issues: [], logs: [], vaccines: [] };
  });
  return month;
}

/** لوحة اللقاحات بجدول اللاحم بأيام ونسخة. */
function boardWith(days, version, over = {}) {
  const board = clone(F.vaccine_board);
  board.programs.broiler = { version, end_age: 42, days: days.map(([vaccine, age]) => ({ vaccine_id: vaccine, age_day: age })) };
  return { ...board, ...over };
}

export default async function (t) {
  const restore = installDom();
  let root = null;
  let m = null;
  const printed = [];
  globalThis.window.print = () => printed.push(globalThis.document.title);
  globalThis.document.title = 'نظام الدواجن';
  try {
    m = await bundle();
    const fresh = (session, { rpcs = {} } = {}) => {
      const rpcLog = [];
      globalThis.__hv = {
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
      return { rpcLog };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const lastToast = () => globalThis.__hv.toasts.at(-1)?.title ?? null;

    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        globalThis.__hv.location = `${location.pathname}${location.search}`;
        return m.h(
          m.Routes,
          null,
          m.h(m.Route, { path: '/halls/calendar/:flockId', element: m.h(m.CalendarPage) }),
          m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) }),
          m.h(m.Route, { path: '/halls/vaccines', element: m.h(m.VaccinesPage) }),
          m.h(m.Route, { path: '*', element: null }),
        );
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
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

    // ── S: التوصيل في HallsRoutes ─────────────────────────────────────────────────────────────────────────────────────
    {
      const routes = readFileSync(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'), 'utf8');
      t.same(
        ['path="calendar/:flockId" element={<CalendarPage />}', 'path="report/:flockId" element={<ReportPage />}', 'path="vaccines" element={<VaccinesPage />}'].map((route) => routes.includes(route)),
        [true, true, true],
        'S الصفحات الثلاث بمساراتها في HallsRoutes (المعامل flockId)',
      );
    }

    // ── C: تقويم القاعة ─────────────────────────────────────────────────────────────────────────────────────────────
    const calendarUrl = `/halls/calendar/${FLOCK}?m=2026-11`;
    await step('C1 الشهر بمربّعاته', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { flock_month: () => clone(F.flock_month) } });
      await mount(calendarUrl);
      t.same(named(rpcLog, 'flock_month'), [{ p_flock: FLOCK, p_month: '2026-11-01' }], 'C1 flock_month بالفوج وأوّل الشهر المطلوب');
      t.same(
        [textOf('cal-title'), textOf('cal-flock'), textOf('cal-end'), textOf('cal-ages'), textOf('cal-month')],
        ['تقويم قاعة 1 — حقل الأمير', 'فوج لاحم سُكّن يوم 01/11/2026، بعدد 1,000.', 'نهاية الدورة المخطّطة: 12/12/2026 (العمر: 42 يوماً).', 'العمر في تشرين الثاني 2026: من 1 إلى 30.', 'تشرين الثاني 2026'],
        'C1 الرأس: القاعة والحقل، والتسكين، ونهاية الدورة المخطّطة، ومدى العمر في الشهر',
      );
      t.same([byAction('cal-day').length, byAction('day-blank').length, byAction('weekday').map((n) => n.textContent)], [30, 1, ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']], 'C1 ثلاثون مربّعاً، والأسبوع من السبت، فالأحد 1 تشرين الثاني بعد خانة واحدة');
      t.same(
        byAction('feed-band').map((n) => [dayOf(n), n.textContent]),
        [['2026-11-01', 'علف 1,000 كغم'], ['2026-11-04', 'علف 1,000 كغم'], ['2026-11-08', 'علف 1,000 كغم']],
        'C1 العلف النازل شريط بالكيلو في أيامه وحدها (الطنّ يكفي ثلاثة أيام)',
      );
      t.same(
        [byAction('day-medicine').map((n) => [dayOf(n), n.textContent]), byAction('day-log').map((n) => [dayOf(n), n.textContent])],
        [[['2026-11-03', 'أموكسيسيلين']], [['2026-11-05', 'فيتامين AD3E (بلا مخزن)']]],
        'C1 الدواء من المخزن باسمه، والمسجّل بلا مخزن بعلامته',
      );
      t.same(
        byAction('vac-band').map((n) => [dayOf(n), n.getAttribute('data-state'), n.textContent, n.style.borderInlineStart]),
        [
          ['2026-11-07', 'done', 'IB تمّ', '4px solid #6180fe'],
          ['2026-11-07', 'missed', 'ND فات', '4px solid #0369a1'],
          ['2026-11-12', 'planned', 'غمبورو قادم', '4px solid #8832fd'],
          ['2026-11-14', 'planned', 'ND قادم', '4px solid #0369a1'],
          ['2026-11-21', 'planned', 'IB قادم', '4px solid #6180fe'],
        ],
        'C1 اللقاحات بخطّ لونها واسمها وحالتها كلمةً (تمّ، فات، قادم)',
      );
      t.same(
        [textOf('day-dead'), dayOf(byAction('day-dead')[0]), descendants(cell('2026-11-05')).find((n) => n.getAttribute('data-action') === 'day-dead')?.textContent, byAction('day-note-mark').map(dayOf)],
        ['نافق 1', '2026-11-01', 'نافق 2، مستبعد 2', ['2026-11-06']],
        'C1 النافق والمستبعد صغيرين، وعلامة الملاحظة في يومها',
      );
      t.same(
        [cell('2026-11-11')?.getAttribute('aria-current'), cell('2026-11-11')?.style.boxShadow, cell('2026-11-10')?.getAttribute('aria-current'), cell('2026-11-10')?.localName],
        ['date', 'inset 0 0 0 2px rgb(var(--ring))', null, 'button'],
        'C1 اليوم الحاليّ بإطار، وأيام العمر أزرار',
      );
      t.eq(textOf('cal-totals'), 'العلف النازل في الشهر: 3,000 كغم — النافق: 12 — المستبعد: 2', 'C1 سطر المجاميع من totals');
      t.same([disabled(byAction('month-prev')[0]), disabled(byAction('month-next')[0])], [true, false], 'C1 «الشهر السابق» مقفول بـprev، و«التالي» مفتوح بـnext');
      t.eq(showsMoney(), false, 'C1 لا مال في التقويم');
    });
    await step('C1 بلا مال وما خارج العمر', async () => {
      const month = clone(F.flock_month_no_money);
      month.flock.placed_on = '2026-11-04';
      month.flock.age0 = 4;
      for (const day of month.days.slice(0, 3)) Object.assign(day, { age: null, dead: null, culled: null, feed_kg: null, issues: [], logs: [], vaccines: [] });
      fresh(MANAGER, { rpcs: { flock_month: () => month } });
      await mount(calendarUrl);
      const before = cell('2026-11-02');
      t.same(
        [before?.localName, before?.getAttribute('data-outside'), String(before?.style.opacity), cell('2026-11-04')?.localName, textOf('cal-ages')],
        ['div', '1', '0.45', 'button', 'العمر في تشرين الثاني 2026: من 4 إلى 30.'],
        'C1 ما قبل التسكين باهت بلا ضغط، ومدى العمر من يوم التسكين',
      );
      t.same([byAction('feed-band').length, showsMoney()], [2, false], 'C1 عيّنة بلا مال: الأشرطة كما هي ولا مبلغ يظهر');
    });

    await step('C1 صرف اللقاح المؤشَّر مع تأشيره لا مع الأدوية', async () => {
      // بشكل الخادم الحقيقي (مراجعة 0026 A): flock_month يخرج صرف التأشير الحيّ من سطور اليوم، ورقمه (FI) في مدخل اللقاح نفسه (doc_no).
      const month = clone(F.flock_month);
      fresh(MANAGER, { rpcs: { flock_month: () => month } });
      await mount(calendarUrl);
      t.same([byAction('day-medicine').map(dayOf), month.days[6].issues.length], [['2026-11-03'], 0], 'C1 صرف اللقاح المؤشَّر ليس في سطور يومه ولا يظهر دواءً في مربّعه');
      await click(cell('2026-11-07'));
      t.same(
        [byAction('day-issue').length, byAction('vac-row').map((row) => row.textContent.includes('وصُرف من المخزن بالمستند FI-2026-0101'))],
        [0, [true, false]],
        'C1 وفي تفاصيل اليوم: رقم صرف اللقاح المؤشَّر من مدخله مع تأشيره، لا في «ما نزل من المخزن»',
      );
    });

    await step('C2 التنقّل بين الأشهر', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { flock_month: (args) => (args.p_month === '2026-12-01' ? december() : clone(F.flock_month)) } });
      await mount(calendarUrl);
      await click(byAction('month-next')[0]);
      await settle();
      t.same([named(rpcLog, 'flock_month').map((args) => args.p_month), globalThis.__hv.location], [['2026-11-01', '2026-12-01'], `/halls/calendar/${FLOCK}?m=2026-12`], 'C2 «الشهر التالي» يقرأ p_month = 2026-12-01 ويكتب ?m=');
      t.same([textOf('cal-month'), byAction('cal-day').length, byAction('day-blank').length, disabled(byAction('month-next')[0]), disabled(byAction('month-prev')[0])], ['كانون الأول 2026', 31, 3, true, false], 'C2 كانون الأوّل بأيامه الواحد والثلاثين يبدأ الثلاثاء (بعد السبت والأحد والاثنين)');
      await click(byAction('month-prev')[0]);
      await settle();
      t.same([named(rpcLog, 'flock_month').map((args) => args.p_month).at(-1), globalThis.__hv.location], ['2026-11-01', `/halls/calendar/${FLOCK}?m=2026-11`], 'C2 «الشهر السابق» يعود بـp_month = 2026-11-01');
    });
    await step('C2 بلا ?m=: شهر الجهاز، وفوج أُغلق قبله', async () => {
      const device = `${m.localDay().slice(0, 7)}-01`;
      const closed = clone(F.flock_month);
      closed.flock.status = 'closed';
      closed.flock.closed_on = '2026-10-20';
      closed.flock.placed_on = '2026-09-15';
      for (const day of closed.days) Object.assign(day, { age: null, dead: null, culled: null, feed_kg: null, note: null, issues: [], logs: [], vaccines: [] });
      const { rpcLog } = fresh(MANAGER, { rpcs: { flock_month: () => closed } });
      await mount(`/halls/calendar/${FLOCK}`);
      await settle();
      const months = named(rpcLog, 'flock_month').map((args) => args.p_month);
      t.same(months, device > '2026-10-01' ? [device, '2026-10-01'] : [device], 'C2 بلا ?m= يُقرأ شهر الجهاز، وإن وقع كلّه بعد إغلاق الفوج يُقرأ شهر إغلاقه');
    });

    await step('C3 تفاصيل اليوم', async () => {
      fresh(MANAGER, { rpcs: { flock_month: () => clone(F.flock_month) } });
      await mount(calendarUrl);
      await click(cell('2026-11-07'));
      const rows = byAction('vac-row');
      t.same(
        rows.map((row) => [row.getAttribute('data-state'), descendants(row).some((n) => n.getAttribute('data-action') === 'vac-undo'), descendants(row).find((n) => n.getAttribute('data-action') === 'vac-round')?.getAttribute('href') ?? null]),
        [['done', true, null], ['missed', false, '/broiler/round']],
        'C3 المؤشَّر بـ«ألغِ التأشير»، والفائت يُؤشَّر في جولة اللاحم',
      );
      t.eq(
        byAction('give-day')[0]?.getAttribute('href'),
        `/halls/give/${FLOCK}?on=2026-11-07&back=%2Fhalls%2Fcalendar%2F${FLOCK}%3Fm%3D2026-11`,
        'C3 «أضف لهذا اليوم» بيومه وطريق الرجوع إلى التقويم',
      );
      await click(byAction('day-close')[0]);
      await click(cell('2026-11-01'));
      t.same(
        [byAction('day-issue').map((n) => n.textContent), byAction('give-day').length],
        [['FI-2026-0001علف بادئ1.000 طن (1,000 كغم)علف'], 0],
        'C3 ما نزل بمستنده ومادّته وكميته (fmtQty)، ولا «أضف» لأقدم من سبعة أيام',
      );
      await click(byAction('day-close')[0]);
      await click(cell('2026-11-03'));
      t.same(byAction('day-issue').map((n) => n.textContent), ['FI-2026-0100أموكسيسيلينلتران'], 'C3 دواء المخزن بكميته');
      await click(byAction('day-close')[0]);
      await click(cell('2026-11-06'));
      t.same([textOf('day-note'), textOf('day-consumed')], ['تهوية إضافية بعد الظهر', '140 كغم'], 'C3 الجولة: الملاحظة والاستهلاك المسجّل');
      await click(byAction('day-close')[0]);
      await click(cell('2026-11-12'));
      t.same([byAction('give-day').length, byAction('vac-row').map((row) => row.getAttribute('data-state')), byAction('vac-undo').length, byAction('vac-round').length], [0, ['planned'], 0, 0], 'C3 يوم قادم: لا «أضف» ولا أفعال على الموعد القادم');
    });

    await step('C4 حذف التسجيل بلا مخزن', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          flock_month: () => clone(F.flock_month),
          remove_flock_log: (args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            return { id: args.p_id, removed: false };
          },
        },
      });
      await mount(calendarUrl);
      await click(cell('2026-11-05'));
      await click(withId('log-remove', '00000000-0000-4000-8000-000000000305'));
      t.ok(
        textOf('log-remove-dialog')?.includes('يُحذف تسجيل الدواء «فيتامين AD3E» من يوم 05/11/2026 وحده') && textOf('log-remove-dialog')?.includes('فلا يمسّ المخزون ولا المال'),
        `C4 التأكيد يسمّي الدواء ويومه ويقول إنّ التسجيل وحده يُحذف (${textOf('log-remove-dialog')})`,
      );
      await click(byAction('log-remove-go')[0]);
      t.same([named(rpcLog, 'remove_flock_log'), byAction('log-remove-retry').length], [[{ p_id: '00000000-0000-4000-8000-000000000305' }], 1], 'C4 remove_flock_log بمعرّف التسجيل، والنتيجة المجهولة تجمّد بـ«أعد المحاولة»');
      await click(byAction('log-remove-retry')[0]);
      await settle();
      // «كان محذوفاً» بعد إعادة لنتيجة مجهولة أرجح ما يعني أنّ المحاولة الأولى حذفته (مراجعة 0026 G): «حُذف» بلا «من جهاز آخر».
      t.same(
        [named(rpcLog, 'remove_flock_log'), lastToast(), named(rpcLog, 'flock_month').length],
        [[{ p_id: '00000000-0000-4000-8000-000000000305' }, { p_id: '00000000-0000-4000-8000-000000000305' }], 'حُذف تسجيل «فيتامين AD3E».', 2],
        'C4 الإعادة بالمعرّف نفسه، وجوابها «كان محذوفاً» يُقال «حُذف» بلا «من جهاز آخر»، ويُقرأ الشهر من جديد',
      );
    });
    await step('C4 أوّل محاولة تجده محذوفاً', async () => {
      fresh(MANAGER, { rpcs: { flock_month: () => clone(F.flock_month), remove_flock_log: (args) => ({ id: args.p_id, removed: false }) } });
      await mount(calendarUrl);
      await click(cell('2026-11-05'));
      await click(withId('log-remove', '00000000-0000-4000-8000-000000000305'));
      await click(byAction('log-remove-go')[0]);
      await settle();
      t.eq(lastToast(), 'كان تسجيل «فيتامين AD3E» محذوفاً من جهاز آخر.', 'C4 ضابط: أوّل محاولة جوابها «كان محذوفاً»: حذفه جهاز آخر');
    });

    await step('C5 إلغاء تأشير بصرف: السبب إلزاميّ والإعادة حرفاً', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          flock_month: () => clone(F.flock_month),
          undo_vaccination: (args, n) => {
            if (n === 1) throw new m.RejectedError('void_blocked', 'لا يُلغى الصرف: صُرف من دفعته بعده.');
            if (n === 2) throw new m.UnknownOutcomeError();
            return { id: args.p_id, status: 'void', issue_voided: true };
          },
        },
      });
      await mount(calendarUrl);
      await click(cell('2026-11-07'));
      await click(byAction('vac-undo')[0]);
      t.ok(textOf('undo-dialog')?.includes('يُعكس صرف اللقاح من المخزن بحركة عكسية') && textOf('undo-dialog')?.includes('سبب الإلغاء (إلزامي)'), 'C5 التأكيد يقول إنّ الصرف يُعكس والسبب إلزاميّ');
      await click(byAction('undo-go')[0]);
      t.same([named(rpcLog, 'undo_vaccination').length, textOf('undo-dialog')?.includes('اكتب سبب الإلغاء: يُعكس صرف اللقاح من المخزن.')], [0, true], 'C5 بلا سبب لا يُرسل شيء');
      type(byAction('undo-reason')[0], '  أُشِّر خطأً  ');
      await settle();
      await click(byAction('undo-go')[0]);
      const first = named(rpcLog, 'undo_vaccination')[0];
      t.same([first?.p_id, first?.p_reason, UUID.test(first?.p_client_ref ?? '')], ['00000000-0000-4000-8000-000000000401', 'أُشِّر خطأً', true], 'C5 undo_vaccination بمعرّف التأشير والسبب مقصوصاً ومرجع من الجهاز');
      t.same([textOf('undo-dialog')?.includes('لا يُلغى الصرف: صُرف من دفعته بعده.'), byAction('undo-reason')[0]?.value, byAction('undo-go').length], [true, '  أُشِّر خطأً  ', 1], 'C5 الرفض الأكيد يُقال والسبب المكتوب باقٍ');
      await click(byAction('undo-go')[0]);
      const second = named(rpcLog, 'undo_vaccination')[1];
      t.same([second?.p_reason, second?.p_client_ref !== first?.p_client_ref, UUID.test(second?.p_client_ref ?? ''), byAction('undo-retry').length, byAction('undo-reason')[0]?.hasAttribute('readonly')], ['أُشِّر خطأً', true, true, 1, true], 'C5 المحاولة بعد رفض أكيد بمرجع جديد، والنتيجة المجهولة تجمّد بالسبب');
      await click(byAction('undo-retry')[0]);
      await settle();
      const third = named(rpcLog, 'undo_vaccination')[2];
      t.same(
        [JSON.stringify(third) === JSON.stringify(second), lastToast(), named(rpcLog, 'flock_month').length],
        [true, 'أُلغي تأشير «IB» ورجعت كمية اللقاح إلى مخزنها.', 2],
        'C5 «أعد المحاولة» بالنداء نفسه حرفاً (المعرّف والسبب والمرجع)، ثمّ يُقرأ الشهر',
      );
    });
    await step('C5 إلغاء تأشير بلا صرف: السبب اختياريّ', async () => {
      const month = clone(F.flock_month);
      month.days[6].vaccines[0].issue_id = null;
      const { rpcLog } = fresh(MANAGER, { rpcs: { flock_month: () => month, undo_vaccination: (args) => ({ id: args.p_id, status: 'void', issue_voided: false }) } });
      await mount(calendarUrl);
      await click(cell('2026-11-07'));
      await click(byAction('vac-undo')[0]);
      t.ok(textOf('undo-dialog')?.includes('سبب الإلغاء (اختياري)') && textOf('undo-dialog')?.includes('لم يُصرف شيء من المخزن'), 'C5 تأشير بلا صرف: السبب اختياريّ');
      await click(byAction('undo-go')[0]);
      const sent = named(rpcLog, 'undo_vaccination')[0];
      t.same([sent?.p_id, sent?.p_reason, UUID.test(sent?.p_client_ref ?? ''), lastToast()], ['00000000-0000-4000-8000-000000000401', null, true, 'أُلغي تأشير «IB».'], 'C5 بلا سبب: p_reason فارغ');
    });

    await step('C6 الصلاحيات', async () => {
      const month = clone(F.flock_month);
      month.can = { give: false, log: false, vaccinate: false, undo_issue: false };
      fresh(MANAGER, { rpcs: { flock_month: () => month } });
      await mount(calendarUrl);
      await click(cell('2026-11-07'));
      t.same([byAction('vac-undo').length, byAction('vac-round').length, byAction('give-day').length], [0, 0, 0], 'C6 بلا صلاحية: لا إلغاء ولا جولة ولا «أضف»');
      await click(byAction('day-close')[0]);
      await click(cell('2026-11-05'));
      t.eq(byAction('log-remove').length, 0, 'C6 بلا flock_day.save: لا «احذف»');
    });
    await step('C6 يؤشّر ولا يلغي الصرف', async () => {
      const month = clone(F.flock_month);
      month.can = { give: true, log: true, vaccinate: true, undo_issue: false };
      fresh(MANAGER, { rpcs: { flock_month: () => month } });
      await mount(calendarUrl);
      await click(cell('2026-11-07'));
      t.same([byAction('vac-undo').length, text().includes('إلغاء هذا التأشير يعكس صرفاً من المخزن، فهو لمن يلغي الصرف.')], [0, true], 'C6 تأشير بصرف بلا صلاحية الإلغاء: يُقال لمن هو');
    });

    await step('C7 الطباعة', async () => {
      fresh(MANAGER, { rpcs: { flock_month: () => clone(F.flock_month) } });
      await mount(calendarUrl);
      await click(byAction('print-month')[0]);
      t.same(printed.at(-1), 'تقويم قاعة 1 — حقل الأمير — تشرين الثاني 2026', 'C7 «اطبع الشهر» بعنوان الورقة (اسم ملفّ PDF)');
      fire(globalThis.window, 'afterprint', { bubbles: false });
      t.eq(globalThis.document.title, 'نظام الدواجن', 'C7 ويعود عنوان الصفحة بعد الطباعة');
      t.ok(styleText().includes('@page { size: A4 landscape; margin: 8mm; }') && styleText().includes('print-color-adjust: exact'), 'C7 A4 عرضاً، وألوان العلف واللقاحات تُطبع');
      t.ok(textOf('cal-org') === 'مشروع الدواجن' && byAction('cal-bar')[0]?.getAttribute('class')?.includes('print:hidden'), 'C7 اسم المنشأة في الورقة، والأزرار لا تُطبع');
    });

    await step('C8 الفائت أقدم من سبعة أيام', async () => {
      // مراجعة 0026 E: التأشير في الجولة من تذكيرها، والتذكير والخادم يقبلان الفائت حتى سبعة أيام بعد موعده؛ الأقدم «فات ولم يُؤشَّر» بلا رابط.
      const month = clone(F.flock_month);
      month.today = '2026-11-21';
      month.days.find((day) => day.on === '2026-11-14').vaccines[0].state = 'missed';
      fresh(MANAGER, { rpcs: { flock_month: () => month } });
      await mount(calendarUrl);
      const missed = () =>
        byAction('vac-row')
          .filter((row) => row.getAttribute('data-state') === 'missed')
          .map((row) => {
            const inside = (action) => descendants(row).find((n) => n.getAttribute('data-action') === action);
            return [inside('vac-round')?.getAttribute('href') ?? null, inside('vac-too-old')?.textContent ?? null];
          });
      await click(cell('2026-11-07'));
      t.same(missed(), [[null, 'فات ولم يُؤشَّر']], 'C8 فات منذ 14 يوماً: «فات ولم يُؤشَّر» بلا رابط إلى جولة لا تذكّر به');
      await click(byAction('day-close')[0]);
      await click(cell('2026-11-14'));
      t.same(missed(), [['/broiler/round', null]], 'C8 فات منذ سبعة أيام بالضبط (أوّل يوم في نافذة التذكير): «أشّره في الجولة»');
    });

    await step('C9 علف بعضه بلا وزن', async () => {
      // مراجعة 0026 D: شريط اليوم وسطر المجاميع يقولان ما لا وزن له (قطعة بلا وزن أو لتر بلا كثافة) بكميته، فلا يبدو الكيلو رقماً كاملاً.
      const month = clone(F.flock_month);
      const BAGS = '00000000-0000-4000-8000-000000000036';
      const STARTER = '00000000-0000-4000-8000-000000000031';
      const feed = (n, doc, item, name, qty, unit, kg) => ({ issue_id: `00000000-0000-4000-8000-00000000090${n}`, doc_no: doc, item_id: item, name, cost_kind: 'feed', qty, base_unit: unit, kg });
      month.days.find((day) => day.on === '2026-11-09').issues = [feed(1, 'FI-2026-0010', BAGS, 'علف أكياس', '3', 'pc', null)];
      month.days.find((day) => day.on === '2026-11-10').issues = [
        feed(2, 'FI-2026-0011', BAGS, 'علف أكياس', '10', 'pc', null),
        feed(3, 'FI-2026-0012', STARTER, 'علف بادئ', '1000', 'kg', '1000'),
        feed(4, 'FI-2026-0013', BAGS, 'علف أكياس', '10', 'pc', '500'),
      ];
      month.totals.feed_kg = '4500';
      fresh(MANAGER, { rpcs: { flock_month: () => month } });
      await mount(calendarUrl);
      t.same(
        byAction('feed-band').map((n) => [dayOf(n), n.textContent]),
        [
          ['2026-11-01', 'علف 1,000 كغم'],
          ['2026-11-04', 'علف 1,000 كغم'],
          ['2026-11-08', 'علف 1,000 كغم'],
          ['2026-11-09', 'علف 3 قطع بلا وزن'],
          ['2026-11-10', 'علف 1,500 كغم + 10 قطع بلا وزن'],
        ],
        'C9 شريط اليوم: الكيلو الموزون وما بلا وزن بكميته، ويوم كلّه بلا وزن بكميته، ويوم كلّه موزون كما هو',
      );
      t.eq(textOf('cal-totals'), 'العلف النازل في الشهر: 4,500 كغم + 13 قطعة بلا وزن — النافق: 12 — المستبعد: 2', 'C9 سطر المجاميع: كيلو الشهر من الخادم وما بلا وزن من سطور أيّامه');
    });

    // ── R: تقرير الدورة ───────────────────────────────────────────────────────────────────────────────────────────
    const reportUrl = `/halls/report/${FLOCK}`;
    await step('R1 التقرير بالمال', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { flock_cycle_report: () => clone(F.flock_cycle_report) } });
      await mount(reportUrl);
      t.same(named(rpcLog, 'flock_cycle_report'), [{ p_flock: FLOCK }], 'R1 flock_cycle_report بالفوج');
      t.same(
        [textOf('rep-title'), textOf('rep-flock'), textOf('rep-through')],
        ['تقرير دورة قاعة 1 — حقل الأمير', 'فوج لاحم سُكّن يوم 01/11/2026، بعدد 1,000.', 'التقرير حتى 11/11/2026 (العمر: 11 يوماً). نهاية الدورة المخطّطة: 12/12/2026 (العمر: 42 يوماً).'],
        'R1 الرأس: القاعة والتسكين وحتى متى والعمر ونهاية الدورة',
      );
      t.same(
        ['rep-birds', 'rep-feed', 'rep-by-item', 'rep-balance', 'rep-medicines', 'rep-vaccines', 'rep-money'].map((name) => byAction(name).length),
        [1, 1, 1, 1, 1, 1, 1],
        'R1 الأقسام السبعة',
      );
      t.same([tableHeaders('الطيور'), tableRows('الطيور')], [['المسكَّن', 'النافق', 'المستبعد', 'الحيّ', 'نسبة النفوق'], [['1,000', '11', '2', '987', '1.30%']]], 'R1 الطيور ونسبة النفوق');
      t.same(
        [tableHeaders('العلف النازل للقاعة'), tableRows('العلف النازل للقاعة'), tableFoot('العلف النازل للقاعة')],
        [
          ['التاريخ', 'المستند', 'المادّة', 'الكمية', 'الوحدة', 'الكيلو (كغم)', 'التراكمي (كغم)', 'القيمة'],
          [
            ['01/11/2026', 'FI-2026-0001', 'علف بادئ', '1,000', 'كغم', '1,000', '1,000', '650,000.00'],
            ['04/11/2026', 'FI-2026-0004', 'علف بادئ', '1,000', 'كغم', '1,000', '2,000', '650,000.00'],
            ['08/11/2026', 'FI-2026-0008', 'علف نامي', '40', 'قطعة', '—', '2,000', '700,000.00'],
          ],
          [['المجموع', '2,000', '', '2,000,000.00']],
        ],
        'R1 العلف بكلّ نزول: التاريخ والمستند والمادّة والكمية والكيلو والتراكمي والقيمة، والمجموع من الخادم',
      );
      t.same([tableRows('العلف حسب المادّة'), tableFoot('العلف حسب المادّة')], [[['علف بادئ', '2,000', 'كغم', '2,000'], ['علف نامي', '40', 'قطعة', '—']], [['المجموع', '2,000']]], 'R1 العلف حسب المادّة');
      t.same(
        [tableHeaders('المصروف والمستهلك والباقي'), tableRows('المصروف والمستهلك والباقي'), textOf('rep-unweighed')],
        [['المصروف للقاعة (كغم)', 'المستهلك المسجّل (كغم)', 'الباقي في القاعة (كغم)'], [['2,000.0', '1,450.5', '549.5']], 'لم يُحسب في الكيلو سطر واحد بلا وزن (لتر بلا كثافة أو قطعة بلا وزن).'],
        'R1 المصروف والمستهلك والباقي، و«لم يُحسب في الكيلو سطر واحد بلا وزن» (الفعل قبل فاعله العدد، مراجعة 0027 V3-H2-BALANCE-VERB)',
      );
      t.same(
        tableRows('الأدوية'),
        [['03/11/2026', 'أموكسيسيلين', 'من المخزن', '2', 'لتر', '—', 'FI-2026-0100'], ['05/11/2026', 'فيتامين AD3E', 'بلا مخزن', '—', '—', '1 مل لكلّ لتر', '—']],
        'R1 الأدوية من المخزن وبلا مخزن',
      );
      t.same(
        [tableRows('اللقاحات'), textOf('rep-vaccines-summary')],
        [
          [
            ['7', 'IB', '07/11/2026', 'تمّ', '07/11/2026', 'FI-2026-0101'],
            ['7', 'ND', '07/11/2026', 'فات', '—', '—'],
            ['12', 'غمبورو', '12/11/2026', 'قادم', '—', '—'],
            ['14', 'ND', '14/11/2026', 'قادم', '—', '—'],
            ['21', 'IB', '21/11/2026', 'قادم', '—', '—'],
          ],
          'المواعيد: 5، المنفَّذ منها: 1، والفائت: 1.',
        ],
        'R1 اللقاحات المخطّطة والمنفَّذة بحالتها',
      );
      t.same(
        [tableRows('كلفة الدورة'), tableFoot('كلفة الدورة')],
        [[['العلف', '2,000,000.00'], ['الأدوية', '50,000.00'], ['اللقاحات', '30,000.00'], ['أخرى', '0.00']], [['المجموع', '2,080,000.00']]],
        'R1 كلفة الدورة لأدوار الكلفة',
      );
      t.eq(showsMoney(), true, 'R1 ضابط: فحص «لا مبلغ» يرى المبلغ حين يُعرض');
    });
    // مراجعة 0027 V3-H2-BALANCE-VERB: جملة «المصروف والمستهلك والباقي» كان عددها فاعلاً قبل «فلم تُحسب» فلا يطابقه الفعل في الواحد والاثنين («سطران … فلم
    // تُحسب»)؛ والفعل الآن قبل فاعله مفرداً مذكّراً يصلح لكلّ عدد. الملاحظة تقرأ feed.unweighed وحده.
    await step('R1 جملة السطور بلا وزن فوق «المصروف والمستهلك والباقي» لكلّ عدد', async () => {
      const notes = [];
      for (const n of [1, 2, 3, 11, 100]) {
        const report = clone(F.flock_cycle_report);
        report.feed.unweighed = n;
        fresh(MANAGER, { rpcs: { flock_cycle_report: () => report } });
        await mount(reportUrl);
        notes.push(textOf('rep-unweighed'));
        await unmount();
      }
      const note = (lines) => `لم يُحسب في الكيلو ${lines} بلا وزن (لتر بلا كثافة أو قطعة بلا وزن).`;
      t.same(
        notes,
        [note('سطر واحد'), note('سطران'), note('3 سطور'), note('11 سطراً'), note('100 سطر')],
        'R1 «لم يُحسب في الكيلو» قبل العدد: سطر واحد وسطران و3 سطور و11 سطراً و100 سطر، والفعل المفرد يطابق كلّ عدد (كان «سطران … فلم تُحسب»)',
      );
    });
    await step('R2 التقرير بلا مال', async () => {
      fresh(MANAGER, { rpcs: { flock_cycle_report: () => clone(F.flock_cycle_report_no_money) } });
      await mount(reportUrl);
      t.same(
        [
          tableHeaders('العلف النازل للقاعة'),
          byAction('rep-money').length,
          ['rep-birds', 'rep-feed', 'rep-by-item', 'rep-balance', 'rep-medicines', 'rep-vaccines'].map((name) => byAction(name).length),
          tableFoot('العلف النازل للقاعة'),
          showsMoney(),
        ],
        [['التاريخ', 'المستند', 'المادّة', 'الكمية', 'الوحدة', 'الكيلو (كغم)', 'التراكمي (كغم)'], 0, [1, 1, 1, 1, 1, 1], [['المجموع', '2,000', '']], false],
        'R2 بلا مال: لا عمود القيمة ولا قسم الكلفة ولا مبلغ، والأقسام الستّة كما هي',
      );
    });
    await step('R3 الطباعة', async () => {
      fresh(MANAGER, { rpcs: { flock_cycle_report: () => clone(F.flock_cycle_report) } });
      await mount(reportUrl);
      await click(byAction('print-report')[0]);
      t.same(printed.at(-1), 'تقرير دورة قاعة 1 — حقل الأمير 11/11/2026', 'R3 «اطبع التقرير» بعنوانه وتاريخه');
      fire(globalThis.window, 'afterprint', { bubbles: false });
      t.ok(styleText().includes('@page { size: A4 portrait; margin: 12mm; }') && textOf('rep-org') === 'مشروع الدواجن', 'R3 A4 طولاً واسم المنشأة في الورقة');
    });
    await step('R4 مادّة بعض سطورها بلا وزن', async () => {
      // مراجعة 0026 C: كيلو المادّة مجموع سطورها الموزونة (فالصفوف تُجمع إلى «المصروف للقاعة»)، وما بلا وزن منها يُقال تحت رقمها فلا يبدو كاملاً.
      const report = clone(F.flock_cycle_report);
      const line = (on, doc, name, qty, unit, kg, cum) => ({ on, doc_no: doc, item_name: name, qty, base_unit: unit, kg, cum_kg: cum, money: { value: '100000.00' } });
      report.feed.lines = [
        line('2026-11-01', 'FI-2026-0001', 'علف بادئ', '1000', 'kg', '1000', '1000'),
        line('2026-11-02', 'FI-2026-0002', 'علف أكياس', '10', 'pc', null, '1000'),
        line('2026-11-05', 'FI-2026-0005', 'علف أكياس', '10', 'pc', '500', '1500'),
      ];
      report.feed.by_item = [
        { item_id: '00000000-0000-4000-8000-000000000036', name: 'علف أكياس', qty: '20', base_unit: 'pc', kg: '500', unweighed: 1 },
        { item_id: '00000000-0000-4000-8000-000000000031', name: 'علف بادئ', qty: '1000', base_unit: 'kg', kg: '1000', unweighed: 0 },
      ];
      Object.assign(report.feed, { delivered_kg: '1500', remaining_kg: '49.5', unweighed: 1 });
      fresh(MANAGER, { rpcs: { flock_cycle_report: () => report } });
      await mount(reportUrl);
      t.same(
        [tableRows('العلف حسب المادّة'), byAction('rep-item-unweighed').map((n) => n.textContent), tableFoot('العلف حسب المادّة')],
        [[['علف أكياس', '20', 'قطعة', '500وسطر واحد بلا وزن'], ['علف بادئ', '1,000', 'كغم', '1,000']], ['وسطر واحد بلا وزن'], [['المجموع', '1,500']]],
        'R4 كيلو المادّة الموزون وتحته ما بلا وزن منها، والصفوف (500 و1,000) تُجمع إلى المجموع 1,500',
      );
    });

    // ── V: جدول اللقاحات ────────────────────────────────────────────────────────────────────────────────────────────
    const SAVED_DAYS = [[IB, 7], [ND, 7], [GUM, 12], [ND, 14], [IB, 21]];
    await step('V1 القائمة والجدول', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { vaccine_board: () => clone(F.vaccine_board) } });
      await mount('/halls/vaccines');
      t.same(named(rpcLog, 'vaccine_board'), [undefined], 'V1 vaccine_board بلا معاملات');
      t.same(
        [byAction('vac-chip').map((n) => n.getAttribute('data-id')), byAction('vac-pick').map((n) => n.textContent), byAction('kind-tabs').length, textOf('program-title'), textOf('cycle-end-text'), byAction('cycle-end')[0]?.value],
        [[IB, ND, GUM], ['IB', 'ND', 'غمبورو'], 0, 'جدول لقاحات اللاحم', 'نهاية الدورة: 42 يوماً', '42'],
        'V1 اللقاحات بالاسم، ونوع واحد بلا تبويب، ونهاية الدورة 42',
      );
      t.same([byAction('age-day').length, bandsOf(7), bandsOf(12), bandsOf(14), bandsOf(21), bandsOf(8)], [42, ['IB', 'ND'], ['غمبورو'], ['ND'], ['IB'], []], 'V1 المربّعات من 1 إلى 42 وفي كلّ يوم لقاحاته');
      t.same(tableRows('مواعيد كلّ لقاح'), [['IB', '7، 21', '2'], ['ND', '7، 14', '2'], ['غمبورو', '12', '1']], 'V1 مواعيد كلّ لقاح');
      t.eq(m.isWindowDirty(), false, 'V1 النافذة نظيفة بلا تعديل');
    });
    await step('V2 عدّة لقاحات على عدّة أيام والحفظ حرفاً', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : boardWith([[IB, 10], [ND, 10], [GUM, 12], [IB, 14], [ND, 14], [IB, 21], [GUM, 28]], 4)),
          save_vaccine_program: (args) => ({ kind: args.p_kind, version: 4, end_age: args.p_end_age, days: args.p_days.length }),
        },
      });
      await mount('/halls/vaccines');
      await click(byAction('age-day')[9]);
      t.same([textOf('pick-hint'), bandsOf(10)], ['اختر لقاحاً أو أكثر من القائمة أوّلاً، ثمّ اضغط الأيام.', []], 'V2 بلا لقاح مختار: الضغط يقول ما يُفعل ولا يغيّر شيئاً');
      await click(withId('vac-pick', IB));
      await click(withId('vac-pick', ND));
      t.same([withId('vac-pick', IB)?.getAttribute('aria-pressed'), withId('vac-pick', ND)?.getAttribute('aria-pressed'), withId('vac-pick', GUM)?.getAttribute('aria-pressed'), textOf('pick-help')?.startsWith('المختار: IB، ND.')], ['true', 'true', 'false', true], 'V2 اختيار لقاحين معاً');
      await click(ageCell(10));
      await click(ageCell(7));
      t.same([bandsOf(10), bandsOf(7), m.isWindowDirty(), textOf('program-dirty')], [['IB', 'ND'], [], true, 'في الجدول تعديل لم يُحفظ.'], 'V2 الضغط يضيف المختار كلّه إلى يوم خالٍ، ويشيله كلّه من يوم فيه كلّه');
      await click(ageCell(14));
      t.same(bandsOf(14), ['IB', 'ND'], 'V2 يوم فيه بعض المختار (ND وحده): يُكمَّل بالباقي');
      await click(withId('vac-pick', IB));
      await click(withId('vac-pick', ND));
      await click(withId('vac-pick', GUM));
      await click(ageCell(28));
      t.same([bandsOf(14), bandsOf(28), bandsOf(12)], [['IB', 'ND'], ['غمبورو'], ['غمبورو']], 'V2 لقاح ثالث وحده على يوم آخر');
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        named(rpcLog, 'save_vaccine_program'),
        [
          {
            p_kind: 'broiler',
            p_end_age: 42,
            p_days: [
              { vaccine_id: IB, age_day: 10 },
              { vaccine_id: ND, age_day: 10 },
              { vaccine_id: GUM, age_day: 12 },
              { vaccine_id: IB, age_day: 14 },
              { vaccine_id: ND, age_day: 14 },
              { vaccine_id: IB, age_day: 21 },
              { vaccine_id: GUM, age_day: 28 },
            ],
            p_expected_version: 3,
          },
        ],
        'V2 «احفظ الجدول» نداء واحد: p_days بيوم العمر ثمّ بترتيب اللقاح في القائمة (IB ثمّ ND ثمّ غمبورو، بالاسم كالخادم)، بالنسخة المقروءة 3',
      );
      t.same([lastToast(), named(rpcLog, 'vaccine_board').length, m.isWindowDirty(), byAction('program-dirty').length, bandsOf(10)], ['حُفظ جدول لقاحات اللاحم: 7 مواعيد، ونهاية الدورة 42 يوماً.', 2, false, 0, ['IB', 'ND']], 'V2 ثمّ يُقرأ الجدول والنافذة نظيفة');
    });

    await step('V3 stale_program يبقي التعديل ثمّ «اعتمد تعديلي»', async () => {
      const otherDevice = [...SAVED_DAYS, [GUM, 35]];
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : boardWith(otherDevice, 4)),
          save_vaccine_program: (args, n) => {
            if (n === 1) throw new m.RejectedError('stale_program', 'تغيّر جدول اللقاحات من جهاز آخر؛ قُرئ من جديد.');
            return { kind: args.p_kind, version: 5, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', IB));
      await click(ageCell(10));
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [byAction('program-conflict').length, textOf('program-conflict')?.startsWith('تغيّر جدول اللقاحات من جهاز آخر؛ قُرئ من جديد.'), bandsOf(10), bandsOf(35), disabled(byAction('save-program')[0]), m.isWindowDirty()],
        [1, true, ['IB'], [], true, true],
        'V3 الرفض يُقال، والجدول يُقرأ، وتعديلك ظاهر في المربّعات (لا ما حفظه الجهاز الآخر)، والحفظ مقفول',
      );
      t.same(
        tableRows('الفرق بين تعديلك والجدول المحفوظ الآن'),
        [['10', 'IB', 'ليس فيه', 'فيه'], ['35', 'غمبورو', 'فيه', 'ليس فيه']],
        'V3 جدول الفروق: ما في تعديلك وليس في المحفوظ، وما في المحفوظ وليس في تعديلك',
      );
      await click(byAction('reapply')[0]);
      t.same([byAction('program-conflict').length, disabled(byAction('save-program')[0])], [0, false], 'V3 «اعتمد تعديلي» يفتح الحفظ على النسخة الجديدة');
      await click(byAction('save-program')[0]);
      const second = named(rpcLog, 'save_vaccine_program')[1];
      t.same([second?.p_expected_version, second?.p_days.map((day) => [day.vaccine_id === IB ? 'IB' : day.vaccine_id === ND ? 'ND' : 'GUM', day.age_day])], [4, [['IB', 7], ['ND', 7], ['IB', 10], ['GUM', 12], ['ND', 14], ['IB', 21]]], 'V3 ثمّ يُحفظ تعديلك كما هو بالنسخة 4');
    });
    await step('V3 «خذ الجدول المحفوظ»', async () => {
      fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : boardWith([...SAVED_DAYS, [GUM, 35]], 4)),
          save_vaccine_program: () => {
            throw new m.RejectedError('stale_program', 'تغيّر جدول اللقاحات من جهاز آخر؛ قُرئ من جديد.');
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', IB));
      await click(ageCell(10));
      await click(byAction('save-program')[0]);
      await settle();
      await click(byAction('take-saved')[0]);
      t.same([byAction('program-conflict').length, bandsOf(10), bandsOf(35), m.isWindowDirty()], [0, [], ['غمبورو'], false], 'V3 «خذ الجدول المحفوظ» يترك تعديلك ويعرض المحفوظ');
    });

    await step('V4 الحذف: يُحذف أو يُخفى', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: () => clone(F.vaccine_board),
          delete_vaccine: (args) => ({ id: args.p_id, result: args.p_id === IB ? 'archived' : 'deleted' }),
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-delete', ND));
      t.same(
        [all().find((n) => n.localName === 'h2' && n.textContent.startsWith('احذف لقاح'))?.textContent, textOf('delete-effect'), byAction('delete-days').map((n) => n.textContent), textOf('delete-go')],
        ['احذف لقاح «ND»', 'لم يُؤشَّر هذا اللقاح قطّ، فيُحذف نهائياً ويُشال من جدولي اللاحم والبيّاض.', ['أيّامه في جدول اللاحم: 7، 14.'], 'احذف اللقاح'],
        'V4 لقاح لم يُؤشَّر: «يُحذف نهائياً» بأيّامه في الجدول',
      );
      await click(byAction('delete-go')[0]);
      await settle();
      t.same([named(rpcLog, 'delete_vaccine'), lastToast()], [[{ p_id: ND, p_expected_version: 1 }], 'حُذف اللقاح «ND» وأُزيلت أيّامه من الجدولين.'], 'V4 delete_vaccine بنسخته، و«حُذف»');
      await click(withId('vac-delete', IB));
      t.same(
        [all().find((n) => n.localName === 'h2' && n.textContent.startsWith('أخفِ لقاح'))?.textContent, textOf('delete-effect'), textOf('delete-go')],
        ['أخفِ لقاح «IB»', 'أُشِّر هذا اللقاح من قبل، فلا يُمحى: يُخفى من القائمة ومن جدولي اللاحم والبيّاض، وتبقى تأشيراته السابقة باسمه.', 'أخفِ اللقاح'],
        'V4 لقاح أُشِّر من قبل (in_use): «يُخفى» لا «يُحذف»',
      );
      await click(byAction('delete-go')[0]);
      await settle();
      t.same([named(rpcLog, 'delete_vaccine')[1], lastToast()], [{ p_id: IB, p_expected_version: 2 }, 'أُخفي اللقاح «IB» وأُزيلت أيّامه من الجدولين: أُشِّر من قبل، فبقيت تأشيراته باسمه.'], 'V4 وجواب archived يُقال «أُخفي»');
    });
    await step('V4 الحذف وفي الجدول تعديل', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { vaccine_board: () => clone(F.vaccine_board), delete_vaccine: (args) => ({ id: args.p_id, result: 'deleted' }) } });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', IB));
      await click(ageCell(10));
      await click(withId('vac-delete', GUM));
      await click(byAction('delete-go')[0]);
      t.same([named(rpcLog, 'delete_vaccine').length, textOf('delete-dialog')?.includes('احفظ تعديل الجدول أو تراجع عنه قبل حذف لقاح: الحذف يغيّر الجدول.')], [0, true], 'V4 لا حذف وفي الجدول تعديل لم يُحفظ (الحذف يغيّر نسخة الجدول)');
    });
    await step('V4 حذف بنتيجة مجهولة ثمّ vaccine_not_found', async () => {
      const gone = clone(F.vaccine_board);
      gone.vaccines = gone.vaccines.filter((vaccine) => vaccine.id !== ND);
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : gone),
          delete_vaccine: (_args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            throw new m.RejectedError('vaccine_not_found', 'اللقاح غير موجود.');
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-delete', ND));
      await click(byAction('delete-go')[0]);
      t.same([byAction('delete-retry').length, textOf('delete-dialog')?.includes('لا نعرف إن حُذف اللقاح: أعد المحاولة؛ لن يُحذف مرّتين.')], [1, true], 'V4 النتيجة المجهولة تجمّد بـ«أعد المحاولة»');
      await click(byAction('delete-retry')[0]);
      await settle();
      t.same([named(rpcLog, 'delete_vaccine'), lastToast(), byAction('delete-dialog').length], [[{ p_id: ND, p_expected_version: 1 }, { p_id: ND, p_expected_version: 1 }], 'حُذف اللقاح «ND» وأُزيلت أيّامه من الجدولين.', 0], 'V4 الإعادة حرفاً؛ ورفضها بـvaccine_not_found يُقرأ فيه اللقاح غائباً: حُذف بالأولى');
    });

    await step('V5 إضافة لقاح وتعديله', async () => {
      const NEW = { color: 3, version: 1, in_use: false };
      let added = null;
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: () => {
            const board = clone(F.vaccine_board);
            if (added) board.vaccines.push({ id: added, name: 'IBD', ...NEW, item: { id: IB_ITEM, name: 'لقاح IB', base_unit: 'pc' } });
            return board;
          },
          save_vaccine: (args, n) => {
            if (n === 2) throw new m.RejectedError('name_taken', 'يوجد لقاح بهذا الاسم.');
            if (args.p_expected_version === null) added = args.p_id;
            return { id: args.p_id, version: args.p_expected_version === null ? 1 : args.p_expected_version + 1, color: 3 };
          },
        },
      });
      await mount('/halls/vaccines');
      await click(byAction('vac-add')[0]);
      t.ok(textOf('vac-dialog')?.includes('اللقاح المربوط بمادّة يُصرف من المخزن حين يُؤشَّر «تمّ»، وغير المربوط يُؤشَّر فقط.'), 'V5 سطر يشرح ربط اللقاح بمادّة');
      t.same(byAction('vac-item')[0]?.options.map((option) => option.textContent), ['بلا مادّة: يُؤشَّر فقط', 'أموكسيسيلين (دواء)', 'لقاح IB (لقاح)'], 'V5 المادّة من items (لقاح أو دواء) أو بلا مادّة');
      await click(byAction('vac-save')[0]);
      t.same([named(rpcLog, 'save_vaccine').length, textOf('vac-dialog')?.includes('اكتب اسم اللقاح، 40 حرفاً على الأكثر.')], [0, true], 'V5 بلا اسم لا يُرسل');
      type(byAction('vac-name')[0], '  IBD  ');
      choose(byAction('vac-item')[0], IB_ITEM);
      await settle();
      await click(byAction('vac-save')[0]);
      await settle();
      const sent = named(rpcLog, 'save_vaccine')[0];
      t.same([UUID.test(sent?.p_id ?? ''), sent?.p_name, sent?.p_item, sent?.p_expected_version], [true, 'IBD', IB_ITEM, null], 'V5 save_vaccine جديد: معرّف من الجهاز والاسم مقصوصاً والمادّة وبلا نسخة');
      t.same([lastToast(), withId('vac-pick', sent?.p_id)?.getAttribute('aria-pressed')], ['أُضيف اللقاح «IBD».', 'true'], 'V5 «أُضيف» واللقاح الجديد مختار ليُضغط به على الأيام');
      await click(withId('vac-edit', IB));
      t.same([byAction('vac-name')[0]?.value, byAction('vac-item')[0]?.options.find((option) => option.selected)?.value], ['IB', IB_ITEM], 'V5 «عدّل» باسمه ومادّته');
      type(byAction('vac-name')[0], 'IB H120');
      await settle();
      await click(byAction('vac-save')[0]);
      t.same([named(rpcLog, 'save_vaccine')[1], textOf('vac-dialog')?.includes('يوجد لقاح بهذا الاسم.'), byAction('vac-name')[0]?.value], [{ p_id: IB, p_name: 'IB H120', p_item: IB_ITEM, p_expected_version: 2 }, true, 'IB H120'], 'V5 التعديل بنسخته، والرفض يُقال والاسم المكتوب باقٍ');
      await click(byAction('vac-save')[0]);
      await settle();
      t.same([named(rpcLog, 'save_vaccine')[2], lastToast()], [{ p_id: IB, p_name: 'IB H120', p_item: IB_ITEM, p_expected_version: 2 }, 'حُفظ اللقاح «IB H120».'], 'V5 ثمّ يُحفظ');
    });

    await step('V6 نهاية الدورة وما يُشال', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { vaccine_board: () => clone(F.vaccine_board), save_vaccine_program: (args) => ({ kind: args.p_kind, version: 4, end_age: args.p_end_age, days: args.p_days.length }) } });
      await mount('/halls/vaccines');
      type(byAction('cycle-end')[0], '0');
      await settle();
      t.same([text().includes('من 1 إلى 1,000.'), disabled(byAction('save-program')[0])], [true, true], 'V6 نهاية خارج 1..1000 تُرفض والحفظ مقفول');
      type(byAction('cycle-end')[0], '20');
      await settle();
      t.same([textOf('cycle-end-text'), byAction('age-day').length, textOf('dropped')], ['نهاية الدورة: 20 يوماً', 20, '«IB» يوم 21'], 'V6 الإنقاص قبل يوم في الجدول يُنبّه ويسمّي ما يُشال');
      await click(byAction('save-program')[0]);
      t.same(named(rpcLog, 'save_vaccine_program')[0], { p_kind: 'broiler', p_end_age: 20, p_days: [{ vaccine_id: IB, age_day: 7 }, { vaccine_id: ND, age_day: 7 }, { vaccine_id: GUM, age_day: 12 }, { vaccine_id: ND, age_day: 14 }], p_expected_version: 3 }, 'V6 الحفظ بالنهاية الجديدة وبلا ما بعدها');
    });

    await step('V7 القراءة وحدها', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => ({ ...clone(F.vaccine_board), can_edit: false }) } });
      await mount('/halls/vaccines');
      t.same(
        [byAction('vac-pick').length, byAction('vac-add').length, byAction('vac-delete').length, byAction('save-program').length, byAction('cycle-end').length, ageCell(7)?.localName, bandsOf(7), text().includes('جدول اللقاحات يعدّله المالك أو المدير؛ هنا للعرض.')],
        [0, 0, 0, 0, 0, 'div', ['IB', 'ND'], true],
        'V7 can_edit = false: الجدول للعرض بلا اختيار ولا حفظ',
      );
    });

    await step('V8 النتيجة المجهولة والتحقّق', async () => {
      const mine = [[IB, 7], [ND, 7], [IB, 10], [GUM, 12], [ND, 14], [IB, 21]];
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : boardWith(mine, 4)),
          save_vaccine_program: (_args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            if (n === 2) throw new m.NetworkError();
            throw new m.RejectedError('stale_program', 'تغيّر جدول اللقاحات من جهاز آخر.');
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', IB));
      await click(ageCell(10));
      await click(byAction('save-program')[0]);
      t.same([byAction('retry-program').length, byAction('save-program').length, disabled(ageCell(11)), m.isWindowDirty()], [1, 0, true, true], 'V8 نتيجة مجهولة: «أعد المحاولة» وحدها والجدول مقفول والنافذة «فيها ما لم يُحفظ»');
      await click(byAction('retry-program')[0]);
      t.same([byAction('retry-program').length, textOf('program-failure')], [1, 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.'], 'V8 إعادة لم تصل: تبقى مجمَّدة');
      await click(byAction('retry-program')[0]);
      await settle();
      const sent = named(rpcLog, 'save_vaccine_program');
      t.same(
        [sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0]), JSON.stringify(sent[2]) === JSON.stringify(sent[0]), lastToast(), byAction('program-conflict').length, byAction('retry-program').length],
        [3, true, true, 'حُفظ جدول لقاحات اللاحم: 6 مواعيد، ونهاية الدورة 42 يوماً.', 0, 0],
        'V8 كلّ إعادة بالنداء نفسه حرفاً؛ ورفضها بشرط النسخة والجدول المقروء = ما أُرسل: حُفظ بالأولى، لا «تغيّر من جهاز آخر»',
      );
      await settle();
      t.eq(m.isWindowDirty(), false, 'V8 ثمّ النافذة نظيفة');
    });

    await step('V9 البيّاض والصفحات بسبعين يوماً', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { vaccine_board: () => clone(F.vaccine_board), save_vaccine_program: (args) => ({ kind: args.p_kind, version: 1, end_age: args.p_end_age, days: args.p_days.length }) } });
      await mount('/halls/vaccines?kind=layer');
      t.same(
        [textOf('program-title'), textOf('cycle-end-text'), byAction('kind-tabs').length, byAction('age-page').length, byAction('age-day').length, ageCell(1) !== undefined, ageCell(70) !== undefined, ageCell(71)],
        ['جدول لقاحات البيّاض', 'نهاية الدورة: 500 يوم (لا جدول محفوظ بعد).', 1, 8, 70, true, true, undefined],
        'V9 ?kind=layer: البيّاض بلا جدول، ونهايته 500، وثماني صفحات بسبعين يوماً',
      );
      await click(byAction('age-page')[7]);
      t.same([byAction('age-day').length, ageCell(491) !== undefined, ageCell(500) !== undefined, byAction('age-page')[7]?.textContent], [10, true, true, 'من 491 إلى 500'], 'V9 الصفحة الأخيرة من 491 إلى 500');
      await click(withId('vac-pick', IB));
      await click(ageCell(495));
      await click(byAction('save-program')[0]);
      t.same(named(rpcLog, 'save_vaccine_program')[0], { p_kind: 'layer', p_end_age: 500, p_days: [{ vaccine_id: IB, age_day: 495 }], p_expected_version: 0 }, 'V9 جدول البيّاض الأوّل بالنسخة 0 ونهايته الافتراضية');
      await click(all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'اللاحم'));
      t.same([globalThis.__hv.location, textOf('program-title')], ['/halls/vaccines?kind=broiler', 'جدول لقاحات اللاحم'], 'V9 التبويب إلى اللاحم');
    });

    await step('V10 «تراجع عن التعديل»', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => clone(F.vaccine_board) } });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', GUM));
      await click(ageCell(30));
      t.same([bandsOf(30), m.isWindowDirty()], [['غمبورو'], true], 'V10 تعديل لم يُحفظ');
      await click(byAction('discard-program')[0]);
      t.same([bandsOf(30), m.isWindowDirty(), byAction('program-dirty').length], [[], false, 0], 'V10 «تراجع عن التعديل» يعيد المحفوظ والنافذة نظيفة');
    });

    // ── مراجعة 0026 F: لقاح حُذف من جهاز آخر والجدول يُحفظ ──
    const GONE_HINT = 'في الجدول لقاح غير موجود في القائمة. حدّث الشاشة.';
    await step('V11 حُذف «غمبورو» وأيّامه في الجدول (vaccine_not_found ونسخة الجدول تقدّمت)', async () => {
      const afterDelete = boardWith([[IB, 7], [ND, 7], [ND, 14], [IB, 21]], 4);
      afterDelete.vaccines = afterDelete.vaccines.filter((vaccine) => vaccine.id !== GUM);
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : clone(afterDelete)),
          save_vaccine_program: (args, n) => {
            if (n === 1) throw new m.RejectedError('vaccine_not_found', GONE_HINT);
            return { kind: args.p_kind, version: 5, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', IB));
      await click(ageCell(10));
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'vaccine_board').length, withId('vac-chip', GUM) === undefined, byAction('program-conflict').length, disabled(byAction('save-program')[0]), textOf('gone-days'), bandsOf(10), bandsOf(12)],
        [2, true, 1, true, '«غمبورو» يوم 12', ['IB'], []],
        'V11 الرفض يقرأ الجدول: «غمبورو» خرج من القائمة، وتعديلك ظاهر للمقارنة بلا يومه بجملة تسمّيه، والحفظ مقفول حتّى «اعتمد تعديلي»',
      );
      t.same(tableRows('الفرق بين تعديلك والجدول المحفوظ الآن'), [['10', 'IB', 'ليس فيه', 'فيه']], 'V11 وجدول الفروق بلا أيّام اللقاح المحذوف');
      await click(byAction('reapply')[0]);
      await click(byAction('save-program')[0]);
      await settle();
      const second = named(rpcLog, 'save_vaccine_program')[1];
      t.same(
        [second?.p_expected_version, second?.p_days.map((day) => [day.vaccine_id === IB ? 'IB' : day.vaccine_id === ND ? 'ND' : 'GUM', day.age_day])],
        [4, [['IB', 7], ['ND', 7], ['IB', 10], ['ND', 14], ['IB', 21]]],
        'V11 ثمّ يُحفظ تعديلك بالنسخة الجديدة بلا أيّام «غمبورو»',
      );
    });
    await step('V12 حُذف لقاح بلا أيّام محفوظة (vaccine_not_found ونسخة الجدول كما هي)', async () => {
      const IBD = '00000000-0000-4000-8000-000000000024';
      const withIbd = clone(F.vaccine_board);
      withIbd.vaccines.push({ id: IBD, name: 'IBD', color: 3, version: 1, in_use: false, item: null });
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(withIbd) : clone(F.vaccine_board)),
          save_vaccine_program: (args, n) => {
            if (n === 1) throw new m.RejectedError('vaccine_not_found', GONE_HINT);
            return { kind: args.p_kind, version: 4, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', IBD));
      await click(ageCell(10));
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'vaccine_board').length, byAction('program-conflict').length, textOf('gone-days'), bandsOf(10), disabled(byAction('save-program')[0]), text().includes(GONE_HINT)],
        [2, 0, '«IBD» يوم 10', [], false, true],
        'V12 الرفض يقرأ الجدول: «IBD» خرج من القائمة ونسخة الجدول كما هي، فلا فروق، وجملة تسمّي يومه وتلميح الخادم، والحفظ مفتوح',
      );
      await click(byAction('save-program')[0]);
      await settle();
      const second = named(rpcLog, 'save_vaccine_program')[1];
      t.same([second?.p_expected_version, second?.p_days.length, second?.p_days.some((day) => day.vaccine_id === IBD)], [3, 5, false], 'V12 والحفظ التالي بلا أيّام «IBD» (لا يُرفض إلى الأبد)');
    });
    await step('V13 حُفظ بالأولى ثمّ حُذف لقاح منه فرُفضت الإعادة', async () => {
      // نتيجة مجهولة حُفظت، ثمّ حذف جهاز آخر «غمبورو» (فأُزيل يومه من الجدول)، فرُفضت «أعد المحاولة»: يُقرأ الجدول ويُقارن بما أُرسل بلا أيّام اللقاح
      // المحذوف، فهو «حُفظ». vaccine_archived كالخادم قبل نقل فحص النسخة أوّلاً، وstale_program بعده.
      for (const code of ['vaccine_archived', 'stale_program']) {
        const stored = boardWith([[IB, 7], [ND, 7], [IB, 10], [ND, 14], [IB, 21]], 5);
        stored.vaccines = stored.vaccines.filter((vaccine) => vaccine.id !== GUM);
        const { rpcLog } = fresh(MANAGER, {
          rpcs: {
            vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : clone(stored)),
            save_vaccine_program: (_args, n) => {
              if (n === 1) throw new m.UnknownOutcomeError();
              throw new m.RejectedError(code, 'اللقاح «غمبورو» حُذف من القائمة. حدّث الشاشة.');
            },
          },
        });
        await mount('/halls/vaccines');
        await click(withId('vac-pick', IB));
        await click(ageCell(10));
        await click(byAction('save-program')[0]);
        await click(byAction('retry-program')[0]);
        await settle();
        await settle();
        t.same(
          [named(rpcLog, 'save_vaccine_program').length, lastToast(), byAction('retry-program').length, byAction('program-failure').length, byAction('program-conflict').length, byAction('program-dirty').length, m.isWindowDirty()],
          [2, 'حُفظ جدول لقاحات اللاحم: 5 مواعيد، ونهاية الدورة 42 يوماً.', 0, 0, 0, 0, false],
          `V13 الإعادة رُفضت بـ${code} والجدول المقروء = ما أُرسل بلا أيّام «غمبورو»: «حُفظ» بالأولى، لا رفض ولا «تغيّر من جهاز آخر»`,
        );
        await unmount();
      }
    });
    await step('V13 لم تُحفظ الأولى ثمّ حُذف لقاحها الجديد', async () => {
      // ضابط التحقّق: الأولى لم تُحفظ (نسخة الجدول كما هي)، وحذف جهاز آخر «IBD» الذي أُضيف يومه، فرُفضت الإعادة. ما في الجدول = ما أُرسل بلا يوم
      // «IBD»، لكنّ النسخة لم تتقدّم: لم يُحفظ شيء، فلا «حُفظ»؛ يُقرأ الجدول ويبقى التعديل بجملة تسمّي يوم «IBD».
      const IBD = '00000000-0000-4000-8000-000000000024';
      const withIbd = clone(F.vaccine_board);
      withIbd.vaccines.push({ id: IBD, name: 'IBD', color: 3, version: 1, in_use: false, item: null });
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(withIbd) : clone(F.vaccine_board)),
          save_vaccine_program: (_args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            throw new m.RejectedError('vaccine_not_found', GONE_HINT);
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-pick', IBD));
      await click(ageCell(10));
      await click(byAction('save-program')[0]);
      await click(byAction('retry-program')[0]);
      await settle();
      await settle();
      t.same(
        [named(rpcLog, 'save_vaccine_program').length, lastToast(), byAction('retry-program').length, text().includes(GONE_HINT), textOf('gone-days'), byAction('program-dirty').length],
        [2, null, 0, true, '«IBD» يوم 10', 1],
        'V13 ضابط: الإعادة رُفضت ونسخة الجدول كما هي: لا «حُفظ»، وتلميح الخادم وجملة يوم «IBD»، والتعديل باقٍ',
      );
    });

    // ── مراجعة 0026 I: نافذة اللقاح أو حذفه بعد stale_vaccine ──
    const STALE_HINT = 'غُيّر هذا اللقاح من جهاز آخر. حدّث الشاشة.';
    await step('V14 تعديل لقاح غيّره جهاز آخر', async () => {
      const changed = clone(F.vaccine_board);
      Object.assign(changed.vaccines.find((vaccine) => vaccine.id === ND), { version: 2, name: 'ND Lasota', item: { id: IB_ITEM, name: 'لقاح IB', base_unit: 'pc' } });
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : clone(changed)),
          save_vaccine: (args) => {
            if (args.p_expected_version !== 2) throw new m.RejectedError('stale_vaccine', STALE_HINT);
            return { id: args.p_id, version: 3, color: 1 };
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-edit', ND));
      type(byAction('vac-name')[0], 'ND Clone');
      await settle();
      await click(byAction('vac-save')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'vaccine_board').length, byAction('vac-name')[0]?.value, textOf('vac-dialog')?.includes('غُيّر هذا اللقاح من جهاز آخر، والمحفوظ الآن «ND Lasota» بمادّة «لقاح IB». ما كتبته باقٍ: احفظ ليُكتب فوقه.')],
        [2, 'ND Clone', true],
        'V14 الرفض يقرأ اللوحة، والنافذة تقول ما المحفوظ الآن وما كتبته باقٍ',
      );
      await click(byAction('vac-save')[0]);
      await settle();
      t.same([named(rpcLog, 'save_vaccine').map((args) => args.p_expected_version), lastToast(), byAction('vac-dialog').length], [[1, 2], 'حُفظ اللقاح «ND Clone».', 0], 'V14 والحفظ التالي بنسخته الجديدة فيُحفظ');
    });
    await step('V15 حذف لقاح غيّره جهاز آخر', async () => {
      const changed = clone(F.vaccine_board);
      Object.assign(changed.vaccines.find((vaccine) => vaccine.id === GUM), { version: 2, in_use: true });
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? clone(F.vaccine_board) : clone(changed)),
          delete_vaccine: (args) => {
            if (args.p_expected_version !== 2) throw new m.RejectedError('stale_vaccine', STALE_HINT);
            return { id: args.p_id, result: 'archived' };
          },
        },
      });
      await mount('/halls/vaccines');
      await click(withId('vac-delete', GUM));
      await click(byAction('delete-go')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'vaccine_board').length, textOf('delete-go'), textOf('delete-dialog')?.includes('غُيّر هذا اللقاح من جهاز آخر فقُرئ من جديد: راجع ما يُحذف أعلاه ثمّ أكّد.')],
        [2, 'أخفِ اللقاح', true],
        'V15 الرفض يقرأ اللوحة، ونافذة الحذف باللقاح كما هو الآن (أُشِّر من قبل: «أخفِ») بجملة تقول ذلك',
      );
      await click(byAction('delete-go')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'delete_vaccine').map((args) => args.p_expected_version), lastToast()],
        [[1, 2], 'أُخفي اللقاح «غمبورو» وأُزيلت أيّامه من الجدولين: أُشِّر من قبل، فبقيت تأشيراته باسمه.'],
        'V15 والحذف التالي بنسخته الجديدة',
      );
    });

    // ── X: أجوبة القاعدة الحقيقية (fixtures/halls-0026.json من supabase/tests/halls.test بـHALLS_SAMPLES_OUT=1) بالمحلّلات والصفحات الحقيقية ──
    const REAL_PATH = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-0026.json');
    const REAL = existsSync(REAL_PATH) ? JSON.parse(readFileSync(REAL_PATH, 'utf8')) : null;
    t.ok(REAL !== null, 'X عيّنات القاعدة الحقيقية موجودة (halls-0026.json)');
    if (REAL) {
      await step('X1 التقويم بجواب القاعدة', async () => {
        const month = REAL.flock_month;
        fresh(MANAGER, { rpcs: { flock_month: () => clone(month) } });
        await mount(`/halls/calendar/${month.flock.id}?m=${month.month.slice(0, 7)}`);
        const today = cell(month.today);
        const text = today ? today.textContent : '';
        // علف اليوم مجموع صرف العلف فيه بجواب القاعدة (1,000 كغم من الإضافة و200 من فحص التزامن): الشاشة تجمعه في شريط واحد.
        const feedKg = month.days.find((d) => d.on === month.today).issues.filter((x) => x.cost_kind === 'feed').reduce((sum, x) => sum + Number(x.kg), 0);
        const feedText = String(feedKg).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
        t.same([textOf('cal-title'), Boolean(today), [feedText, 'IB', 'ND'].filter((part) => !text.includes(part)), showsMoney()],
          [`تقويم ${month.flock.hall_name} — ${month.flock.site_name}`, true, [], false], 'X1 تقويم «قاعة 1» بجواب القاعدة: يوم الإضافة بعلفه ولقاحيه، وبلا مال');
        // مراجعة 0026 A بجواب القاعدة: صرف التأشير ليس في سطور اليوم، ورقمه في مدخل اللقاح، فيظهر مع تأشيره في تفاصيل اليوم.
        const marked = month.days.find((d) => d.on === month.today).vaccines.find((v) => v.issue_id !== null);
        await click(today);
        const row = byAction('vac-row').find((n) => n.textContent.startsWith(marked.name));
        t.same(
          [month.days.find((d) => d.on === month.today).issues.some((x) => x.doc_no === marked.doc_no), Boolean(row?.textContent.includes(`وصُرف من المخزن بالمستند ${marked.doc_no}`))],
          [false, true],
          `X1 تفاصيل اليوم بجواب القاعدة: «${marked.name}» برقم صرفه ${marked.doc_no} من مدخله`,
        );
      });
      await step('X2 تقرير الدورة بجواب القاعدة', async () => {
        const flock = REAL.flock_cycle_report.flock.id;
        fresh(MANAGER, { rpcs: { flock_cycle_report: () => clone(REAL.flock_cycle_report) } });
        await mount(`/halls/report/${flock}`);
        const withMoney = [showsMoney(), body().textContent.includes('فيتامين سائل'), body().textContent.includes('IB')];
        await unmount();
        fresh(MANAGER, { rpcs: { flock_cycle_report: () => clone(REAL.flock_cycle_report_no_money) } });
        await mount(`/halls/report/${flock}`);
        t.same([...withMoney, showsMoney()], [true, true, true, false], 'X2 التقرير بجواب القاعدة: الدواء من المخزن واللقاحات بالمخطّط، والمال لأدوار الكلفة وحدها');
      });
      await step('X3 جدول اللقاحات بجواب القاعدة', async () => {
        fresh(MANAGER, { rpcs: { vaccine_board: () => clone(REAL.vaccine_board) } });
        await mount('/halls/vaccines?kind=broiler');
        t.same([bandsOf(7), bandsOf(14), bandsOf(12)], [['ND'], ['ND'], []], 'X3 جدول اللاحم بجواب القاعدة بعد الحذف: ND في اليومين 7 و14 وحده');
      });
      t.same(m.repo.parseGiveResult(clone(REAL.give_to_flocks)).issues.map((x) => x.docNo.startsWith('FI-')), REAL.give_to_flocks.issues.map(() => true), 'X4 جواب الإضافة الحقيقي بمحلّله');
    }
  } finally {
    if (root && m) {
      const mounted = root;
      m.flushSync(() => mounted.unmount());
    }
    delete globalThis.window.print;
    delete globalThis.__hv;
    restore();
  }
}
