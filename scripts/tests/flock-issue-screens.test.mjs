// الصرف لفوج القاعة (0019، كلمة المالك 2026-11-07: «لمن اروح للقاعات اريد اصرفلهم مادة معينة الكي المواد الي اني صنعتها بالمعمل… ويكلي شكد
// عندك واكدر اصرف منها للقاعة»). أجوبة القاعدة الحقيقية (fixtures/flock-issue-0019.json: التقطها supabase/tests/flock-issue.test.mjs على
// بوستغريس الحزمة، لكلّ دور ولكلّ رفض بتلميحه) تمرّ بالمحلّلات الحقيقية (flocks.ts وflockIssues.ts محزومين بـesbuild) — لا أجوبة بخطّ اليد؛
// والشاشات الحقيقية (FarmRoutes وStockRoutes) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، وrepo الحقيقي على core بديل يسجّل كلّ نداء.
// P المحلّلات بأجوبة القاعدة: ما يُصرف (المالك والأمين وعامل القاعة)، والصرف (بالمال وبلاه)، والإلغاء، وعلف القاعة (المال يغيب للأمين)، والصرامة؛
// D5 «ألغِ» لكلّ سطر من can_void السطر نفسه (لا من رأس الجدول: مدير حقل لا يلغي صرفاً من مخزن المعمل)، بتأكيد يسمّي الأثر وسبب إلزامي؛ D6 الأمين
//    بلا عمود القيمة ولا «ألغِ»؛ E المداخل: «اصرف» في جدول الحقل لكلّ قاعة بفوج قائم، وشاشة الفوج بسطر العلف وأفعال القاعة.
// و«القاعات بين يديك» (0026، كلمة المالك 2026-11-11): الصرف طريق واحد، صفحة الإضافة لعدّة قاعات (/halls/give، فحوصها في halls-give.test)؛
// فنافذة الصرف لمادّة واحدة في هذه الصفحة انشالت ومعها فحوصها (D1–D4 وK1 وK2 وF10 وF1 وF9، وما تحرسه صار على صفحة الإضافة)، وG يحرس أنّ
// «أضف للقاعة» رابط إليها وأنّ روابط ‎?open=1 القديمة تنتقل إليها، وE أنّ الحقل والفوج يدلّان عليها.
// كلّ حالة تفشل على الشفرة قبل 0019 في الشاشات (لا flockIssues ولا صفحة issue/:flockId ولا سطر العلف ولا رابط «اصرف»).
// ومراجعة الشاشات (كلّ حالة R تفشل على fab1c66): F34 قيمة الملغى «—»؛ F7 فشل «ما يُصرف» يُقال بإعادته، وفشل القراءة من جديد (بعد الإلغاء) ولو بقي
// المعروض القديم؛ F8 شاشة الفوج: فشل علف القاعة يُقال وزرّ «أضف للقاعة» باقٍ.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAMPLES = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'flock-issue-0019.json'), 'utf8'));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
// قراءات الحقل وشاشة الفوج بدائل (نسخة الجهاز والطابور حقيقيّان كما في farm-round)، وflock_feed وما بعده حقيقيّ على core البديل.
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__fi.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__fi.call('loadOverviewJson', []));`,
  session: 'export const useSession = () => globalThis.__fi.session; export const sessionStore = { get: () => globalThis.__fi?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__fi.toasts.push(spec); }; export function Toaster() { return null; }',
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__fi.rpc(fn, args);
export const send = async (make) => ({ result: await make(null), wasOnline: true });
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = (answer) => {
  if (answer.error) throw answer.error;
  const rows = answer.data === null ? [] : Array.isArray(answer.data) ? answer.data : [answer.data];
  if (!rows.length) throw new ZeroRowsError();
  return rows;
};
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const plugins = [
  {
    name: 'fi-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'fi-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'fi-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      // core البديل لملفات الحزم التي تقرأ وتكتب هنا وحدها (auth وindex على core الحقيقي: لا تُنادى في هذه الشاشات).
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (/src\/lib\/repo\/(?:flocks|flockIssues|uses|inventory|purchases|purchasing|counts)\.ts$/u.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'fi-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'fi-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];
const OPTIONS = {
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
};
const load = async (contents, withStubs) => {
  const result = await build({ ...OPTIONS, stdin: { contents, resolveDir: ROOT, loader: 'tsx' }, plugins: withStubs ? plugins : [] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const textOf = (name) => byAction(name)[0]?.textContent ?? null;
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const click = async (node) => {
  if (node) fire(node, 'click');
  await settle(40);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const clone = (value) => JSON.parse(JSON.stringify(value));
/** نصّ عشريّ من الخادم ← آلاف (الكمية بثلاث مراتب)، والمال ← فلس: الأرقام المتوقّعة من الجواب نفسه لا مكتوبة باليد. */
const scaledOf = (text, scale) => {
  const [whole, frac = ''] = text.replace('-', '').split('.');
  const value = BigInt(whole + frac.padEnd(scale, '0').slice(0, scale));
  return text.startsWith('-') ? -value : value;
};
/**
 * علف القاعة بصلاحية الإلغاء لكلّ سطر: عقد 0019 الأوّل بلا can_void على السطر، والمراجع يضيفه؛ الجواب القديم يُكمَّل بما يقوله رأسه لكلّ سطر
 * مرحَّل (الشكل الجديد)، والجديد يبقى كما هو.
 */
const withRowVoid = (json) => {
  const copy = clone(json);
  for (const issue of copy.issues) if (issue.can_void === undefined) issue.can_void = copy.can_void && issue.status === 'posted';
  return copy;
};

const FLOCK = SAMPLES.flock_issue_options.owner.flock_id;

export default async function (t) {
  // ── P: المحلّلات الحقيقية بأجوبة القاعدة الحقيقية ──────────────────────────────────────────────────────────────────
  const p = await load(
    [
      "export { parseFlockFeed, FlockShapeError } from './src/lib/repo/flocks.ts';",
      "export { parseIssueOptions, parseRecordedIssue, parseVoidedIssue, FlockIssueShapeError } from './src/lib/repo/flockIssues.ts';",
    ].join('\n'),
    false,
  );
  const shape = (fn) => {
    try {
      fn();
      return 'ok';
    } catch (error) {
      return error instanceof p.FlockShapeError || error instanceof p.FlockIssueShapeError ? error.message : `threw:${error}`;
    }
  };
  {
    const owner = p.parseIssueOptions(SAMPLES.flock_issue_options.owner);
    const oil = owner.items.find((item) => item.name === 'زيت الصويا');
    t.same(
      [owner.hallName, owner.siteName, owner.today, owner.earliestOn, owner.canIssue, owner.items.length, owner.items[0].name, owner.items[0].madeInMill, owner.items[0].onHand, owner.items[0].stores[0].qty],
      ['قاعة 1', 'حقل الأمل', '2026-11-07', '2026-10-31', true, SAMPLES.flock_issue_options.owner.items.length, 'علف بادئ', true, 1_200_000n, 1_200_000n],
      'P ما يُصرف للمالك: القاعة والحقل واليوم وأقدم تاريخ، وعلف المعمل أوّلاً بموجوده ومخزنه',
    );
    t.same([oil.baseUnit, oil.density, owner.items.find((item) => item.name === 'دبس').density, owner.items.map((item) => item.costKind).join(',')], ['L', 9_200n, null, 'feed,feed,feed,feed,feed,feed,other,medicine,fuel,vaccine'], 'P الكثافة بأربع مراتب (0.92) أو null، ونوع الكلفة لكلّ مادّة');
    const keeper = p.parseIssueOptions(SAMPLES.flock_issue_options.storekeeper);
    const worker = p.parseIssueOptions(SAMPLES.flock_issue_options.hall_worker);
    t.same([keeper.canIssue, keeper.items.length, worker.canIssue, worker.items.length], [true, 6, false, 0], 'P الأمين يصرف من مخازن نطاقه، وعامل القاعة لا يصرف ولا يرى شيئاً');
    const kept = p.parseRecordedIssue(SAMPLES.record_flock_issue.storekeeper);
    const owned = p.parseRecordedIssue(SAMPLES.record_flock_issue.owner);
    t.same([kept.docNo, kept.qty, kept.baseUnit, kept.money, kept.warehouseName], ['FI-2026-0001', 500_000n, 'kg', null, 'مخزن العلف'], 'P الصرف للأمين: الكمية «500» نصّاً بلا مراتب، ولا مال');
    t.same([owned.qty, owned.baseUnit, owned.money], [100_000n, 'L', { value: 15_000_000n }], 'P الصرف للمالك بقيمته بالفلس');
    t.same(p.parseVoidedIssue(SAMPLES.void_flock_issue.manager), { id: SAMPLES.void_flock_issue.manager.id, docNo: 'FI-2026-0008', voidedOn: '2026-11-07' }, 'P الإلغاء');
    const feedOwner = p.parseFlockFeed(SAMPLES.flock_feed.owner);
    const raw = SAMPLES.flock_feed.owner;
    const feedKeeper = p.parseFlockFeed(SAMPLES.flock_feed.storekeeper);
    const feedAccountant = p.parseFlockFeed(SAMPLES.flock_feed.accountant);
    t.same(
      [feedOwner.issuedFeedKg, feedOwner.consumedFeedKg, feedOwner.leftInHallKg, feedOwner.leftInHallUnweighed, feedOwner.issues.length, feedOwner.issues.at(-1).status, feedOwner.canVoid, feedOwner.money],
      [scaledOf(raw.issued_feed_kg, 3), scaledOf(raw.consumed_feed_kg, 3), scaledOf(raw.remaining_feed_kg, 3), raw.unweighed_feed_lines, raw.issues.length, 'void', true, { issuedValue: scaledOf(raw.money.issued_value, 2) }],
      'P علف القاعة للمالك: المصروف والمستهلك والباقي (عيّنة 0019 بلا left_in_hall_kg: الباقي وسطوره بلا وزن من مفتاحَي 0019)، والسطور الأحدث أوّلاً والملغى بحاله، و«ألغِ» والمال',
    );
    t.same([feedKeeper.money, feedKeeper.issues.every((issue) => issue.money === null), feedKeeper.canVoid, feedAccountant.money !== null, feedAccountant.canVoid], [null, true, false, true, false], 'P الأمين بلا مال (المفتاح غائب) ولا إلغاء، والمحاسب يرى المال ولا يلغي');
    // can_void على السطر: غيابه (العقد الأوّل) = لا إلغاء، وحضوره كما هو.
    const rowVoid = withRowVoid(SAMPLES.flock_feed.owner);
    rowVoid.issues[0].can_void = false;
    const noRowVoid = clone(SAMPLES.flock_feed.owner);
    for (const issue of noRowVoid.issues) delete issue.can_void;
    const badRowVoid = withRowVoid(SAMPLES.flock_feed.owner);
    badRowVoid.issues[0].can_void = 'yes';
    t.same(
      [p.parseFlockFeed(noRowVoid).issues.some((issue) => issue.canVoid), p.parseFlockFeed(rowVoid).issues.map((issue) => issue.canVoid), shape(() => p.parseFlockFeed(badRowVoid))],
      [false, rowVoid.issues.map((issue) => issue.can_void), 'flock_shape:can_void'],
      'P «ألغِ» لكلّ سطر من can_void السطر: غيابه لا إلغاء، وحضوره كما هو، وغير المنطقيّ خطأ شكل',
    );
    const noKey = clone(SAMPLES.flock_feed.owner);
    delete noKey.remaining_feed_kg;
    const negative = clone(SAMPLES.flock_feed.owner);
    negative.remaining_feed_kg = '-12.500';
    const nullValue = clone(SAMPLES.flock_feed.owner);
    nullValue.issues[0].money.value = null;
    const badKind = clone(SAMPLES.flock_issue_options.owner);
    badKind.items[0].cost_kind = 'chicks';
    t.same(
      [shape(() => p.parseFlockFeed(noKey)), p.parseFlockFeed(negative).leftInHallKg, p.parseFlockFeed(nullValue).issues[0].money, shape(() => p.parseIssueOptions(badKind))],
      ['flock_shape:remaining_feed_kg', -12_500n, { value: null }, 'flock_issue_shape:cost_kind'],
      'P الصرامة: مفتاح غائب خطأ شكل، والباقي السالب يُقرأ كما هو، وقيمة null تُقبل، ونوع كلفة مجهول يُرفض',
    );
  }

  const restore = installDom();
  try {
    const m = await load(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
        "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
        "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
        "export { onlineStore } from './src/lib/online.ts';",
        "export { localDay } from './src/domain/dates.ts';",
        "export { parseDetail } from './src/lib/repo/flocks.ts';",
        "export { RejectedError, UnknownOutcomeError, NetworkError } from './src/lib/errors.ts';",
        "export { fmtQty, fmtInt } from './src/lib/format.ts';",
      ].join('\n'),
      true,
    );
    // سطر علف القاعة المتوقّع من جواب المالك نفسه (بالكيلوغرام بمنسّق الشاشات).
    const kgOf = (text) => {
      const shown = m.fmtQty(scaledOf(text, 3), 'kg');
      return shown.sub ?? shown.main;
    };
    const OWNER_FEED = SAMPLES.flock_feed.owner;
    const FEED_LINE = `المصروف للقاعة: ${kgOf(OWNER_FEED.issued_feed_kg)} — المستهلك المسجّل: ${kgOf(OWNER_FEED.consumed_feed_kg)} — الباقي في القاعة: ${kgOf(OWNER_FEED.remaining_feed_kg)}`;
    const UNWEIGHED = OWNER_FEED.unweighed_feed_lines > 0 ? `سطور علف لا يُعرف وزنها (سائل بلا كثافة أو كيس بلا وزن) فلم تُحسب بالكيلو: ${m.fmtInt(OWNER_FEED.unweighed_feed_lines)}.` : '';
    const ws = (role, over = {}) => ({
      userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'feed_mill', 'general'],
      canSeeCost: role !== 'storekeeper' && role !== 'hall_worker', canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
    });
    let root = null;
    const fresh = (role, rpc, handlers = {}) => {
      const calls = [];
      globalThis.__fi = {
        session: { status: 'ready', workspace: ws(role), offline: false },
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
        rpc(fn, args) {
          calls.push([`rpc:${fn}`, args]);
          const handler = rpc[fn];
          if (!handler) return new Promise(() => {});
          try {
            return Promise.resolve(handler(args));
          } catch (error) {
            return Promise.reject(error);
          }
        },
      };
      return calls;
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__fi.location = `${location.pathname}${location.search}`;
        return m.h(
          m.Routes,
          null,
          m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }),
          m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }),
        );
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
      await settle(60);
    };
    const step = async (label, fn) => {
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
    };
    m.onlineStore.set(true);
    const ISSUE_URL = `/inventory/issue/${FLOCK}?back=${encodeURIComponent(`/broiler/flock/${FLOCK}`)}&open=1`;
    const ownerRpc = (over = {}) => ({
      flock_issue_options: () => clone(SAMPLES.flock_issue_options.owner),
      flock_feed: () => clone(SAMPLES.flock_feed.owner),
      record_flock_issue: () => clone(SAMPLES.record_flock_issue.storekeeper),
      ...over,
    });

    // ── G: طريق واحد للصرف (0026): «أضف للقاعة» رابط إلى صفحة الإضافة، والرجوع منها إلى هذا السجلّ؛ وروابط ‎?open=1 القديمة تنتقل إليها ──────
    const ISSUE_PAGE = `/inventory/issue/${FLOCK}?back=${encodeURIComponent(`/broiler/flock/${FLOCK}`)}`;
    const GIVE_HERE = `/halls/give/${FLOCK}?back=${encodeURIComponent(ISSUE_PAGE)}`;
    await step('G', async () => {
      fresh('owner', ownerRpc());
      await mount(ISSUE_PAGE);
      t.eq(textOf('feed-line'), `${FEED_LINE}${UNWEIGHED}`, 'G سطر علف القاعة ومعه ما لم يُحسب وزنه');
      const give = byAction('issue-open')[0];
      t.same([give?.localName, give?.textContent, give?.getAttribute('href')], ['a', 'أضف للقاعة', GIVE_HERE], 'G «أضف للقاعة» رابط إلى صفحة الإضافة لعدّة قاعات، والرجوع منها إلى هذا السجلّ ومعه رجوعه');
      t.same([byAction('issue-card').length, byAction('issue-save').length, byAction('issue-pending').length], [0, 0, 0], 'G لا نافذة صرف لمادّة واحدة بعد اليوم');
    });
    await step('G ‎?open=1', async () => {
      const calls = fresh('owner', ownerRpc());
      await mount(ISSUE_URL);
      t.same([globalThis.__fi.location, named(calls, 'rpc:record_flock_issue').length], [GIVE_HERE, 0], 'G رابط ‎?open=1 القديم ينتقل إلى صفحة الإضافة (والرجوع منها إلى السجلّ)');
    });

    // ── D5: «ألغِ» بتأكيد يسمّي الأثر وسبب إلزامي ─────────────────────────────────────────────────────────────────────────
    await step('D5', async () => {
      // سطر أوّل لا يلغيه هذا القارئ (صرف من مخزن خارج نطاقه، والرأس can_void = true): لا «ألغِ» عليه وحده.
      const feedJson = withRowVoid(SAMPLES.flock_feed.owner);
      const blockedRow = feedJson.issues.find((issue) => issue.status === 'posted');
      blockedRow.can_void = false;
      const calls = fresh('owner', ownerRpc({ flock_feed: () => clone(feedJson), void_flock_issue: () => clone(SAMPLES.void_flock_issue.manager) }));
      await mount(`/inventory/issue/${FLOCK}`);
      t.same([byAction('issue-card').length, byAction('issue-open').length], [0, 1], 'D5 لا نافذة صرف، و«أضف للقاعة» ظاهر');
      const posted = feedJson.issues.filter((issue) => issue.status === 'posted' && issue.can_void);
      t.same(
        [byAction('issue-void').length, byAction('issue-void-note').length, all().some((n) => n.localName === 'th' && n.textContent === 'الحالة والإلغاء')],
        [posted.length, 1, true],
        'D5 «ألغِ» لكلّ سطر يلغيه هذا القارئ (can_void السطر) لا للسطر الممنوع، والملغى بسببه، وعمود الإلغاء من الرأس',
      );
      t.ok(posted.length > 0, 'D5 ضابط: في الجواب سطر يُلغى');
      await click(byAction('issue-void')[0]);
      t.ok(text().includes(`إلغاء الصرف ${posted[0].doc_no}؟`) && text().includes(`من «${posted[0].item_name}» إلى «${posted[0].warehouse_name}»، وتُلغى كلفته على الفوج.`), 'D5 التأكيد يسمّي الصرف وأثره');
      await click(byAction('issue-void-confirm')[0]);
      t.same([named(calls, 'rpc:void_flock_issue').length, text().includes('اكتب سبب الإلغاء.')], [0, true], 'D5 بلا سبب: لا إرسال، وجملة تطلبه');
      type(byAction('issue-void-reason')[0], 'صُرفت لقاعة أخرى');
      await settle();
      await click(byAction('issue-void-confirm')[0]);
      const [args] = named(calls, 'rpc:void_flock_issue');
      t.same([args?.p_issue_id, args?.p_reason, UUID.test(args?.p_client_ref ?? '')], [posted[0].id, 'صُرفت لقاعة أخرى', true], 'D5 void_flock_issue بالصرف والسبب ومرجع من الجهاز');
      t.same([globalThis.__fi.toasts.at(-1)?.title, named(calls, 'rpc:flock_feed').length], ['أُلغي الصرف FI-2026-0008 ورجعت كميته إلى مخزنها.', 2], 'D5 الرسالة، ثمّ تُقرأ علف القاعة من جديد');
    });

    // ── D6: الأمين بلا عمود القيمة ولا «ألغِ» ───────────────────────────────────────────────────────────────────────────
    await step('D6', async () => {
      fresh('storekeeper', { flock_issue_options: () => clone(SAMPLES.flock_issue_options.storekeeper), flock_feed: () => clone(SAMPLES.flock_feed.storekeeper) });
      await mount(`/inventory/issue/${FLOCK}`);
      const headers = all().filter((n) => n.localName === 'th').map((n) => n.textContent);
      t.ok(headers.includes('المادّة') && headers.includes('المخزن') && !headers.includes('القيمة'), `D6 الأمين: الجدول بلا عمود القيمة (${headers.join('|')})`);
      t.same([byAction('issue-void').length, byAction('issue-open').length], [0, 1], 'D6 ولا «ألغِ» (can_void = false)، و«اصرف» له');
      fresh('owner', ownerRpc());
      await settle();
    });

    // ── مراجعة الشاشات ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('R F34', async () => {
      fresh('owner', ownerRpc());
      await mount(`/inventory/issue/${FLOCK}`);
      const voided = SAMPLES.flock_feed.owner.issues.find((issue) => issue.status === 'void');
      const row = byAction('issue-void-note')[0]?.parentNode;
      const tr = (() => {
        let node = row;
        while (node && node.localName !== 'tr') node = node.parentNode;
        return node;
      })();
      const headers = all().filter((n) => n.localName === 'th').map((n) => n.textContent);
      const cells = tr ? descendants(tr).filter((n) => n.localName === 'td' || n.localName === 'th').map((n) => n.textContent) : [];
      const value = cells[headers.indexOf('القيمة')] ?? null;
      t.same([value, cells.some((cell) => cell.startsWith('ملغى'))], ['—', true], `R F34 الصرف الملغى بلا قيمة في عمود يجمع صافي المرحَّل، وحالته ظاهرة (${voided.doc_no})`);
    });
    await step('R F7', async () => {
      let reads = 0;
      fresh(
        'owner',
        ownerRpc({
          flock_issue_options: () => {
            reads += 1;
            if (reads === 1) throw new m.NetworkError();
            return clone(SAMPLES.flock_issue_options.owner);
          },
        }),
      );
      await mount(ISSUE_PAGE);
      t.ok(text().includes('تعذّر تحميل ما يُصرف للقاعة'), 'R F7 فشل «ما يُصرف» يُقال (لا صمت)');
      const retry = byAction('retry').find((node) => node.parentNode?.textContent.includes('ما يُصرف للقاعة'));
      await click(retry);
      t.same([reads, text().includes('تعذّر تحميل ما يُصرف للقاعة')], [2, false], 'R F7 «أعد المحاولة» يقرؤها من جديد');
    });
    await step('R F7 القراءة من جديد', async () => {
      let feeds = 0;
      const feedJson = withRowVoid(SAMPLES.flock_feed.owner);
      fresh(
        'owner',
        ownerRpc({
          flock_feed: () => {
            feeds += 1;
            if (feeds > 1) throw new m.NetworkError();
            return clone(feedJson);
          },
          void_flock_issue: () => clone(SAMPLES.void_flock_issue.manager),
        }),
      );
      await mount(ISSUE_PAGE);
      await click(byAction('issue-void')[0]);
      type(byAction('issue-void-reason')[0], 'صُرفت لقاعة أخرى');
      await settle();
      await click(byAction('issue-void-confirm')[0]);
      t.same([feeds, byAction('feed-line').length, text().includes('تعذّر تحميل علف القاعة')], [2, 1, true], 'R F7 فشل القراءة بعد الإلغاء يُقال، والمعروض القديم باقٍ تحته');
    });
    await step('R F8', async () => {
      let feeds = 0;
      const detailOf = () => ({
        flock: { id: FLOCK, kind: 'broiler', breed: null, status: 'active', version: 1, placed_on: '2026-10-28', placed_count: 5000, age_days_at_placement: 0, age_days: 11, days_since_placement: 11, dead_total: 0, culled_total: 0, live: 5000, live_start_today: 5000, mortality_pct: '0.00', feed_kg_total: '0.000', feed_days: 0, feed_span_days: 11, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, hall_id: 'h-1', hall_name: 'قاعة 1', site_id: 's-1', site_name: 'حقل الأمل', closed_on: null, close_note: null },
        can_manage: false, can_save: true, days: [], weights: [],
      });
      fresh(
        'owner',
        {
          flock_feed: () => {
            feeds += 1;
            if (feeds === 1) throw new m.NetworkError();
            return clone(SAMPLES.flock_feed.owner);
          },
        },
        { loadFlockDetail: () => m.parseDetail(detailOf()) },
      );
      await mount(`/broiler/flock/${FLOCK}`);
      t.same([byAction('feed-failed').length, byAction('flock-give').length, byAction('feed-line').length], [1, 1, 0], 'R F8 فشل علف القاعة يُقال، و«أضف للقاعة» باقٍ (لا يحتاج سطر العلف)');
      await click(byAction('feed-retry')[0]);
      t.same([byAction('feed-failed').length, byAction('feed-line').length], [0, 1], 'R F8 «أعد المحاولة» يقرأ السطر');
    });

    // ── E: المداخل — «اصرف» في جدول الحقل، وسطر العلف وزرّه في شاشة الفوج ────────────────────────────────────────────────────
    const TODAY = m.localDay();
    const flockJson = (id, over = {}) => ({
      id, kind: 'broiler', breed: null, status: 'active', version: 1, placed_on: '2026-10-28', placed_count: 5000, age_days_at_placement: 0, age_days: 11,
      days_since_placement: 11, dead_total: 50, culled_total: 12, live: 4938, live_start_today: 4938, mortality_pct: '1.24', feed_kg_total: '250.500',
      feed_days: 11, feed_span_days: 11, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
    });
    const overview = () => ({
      today: TODAY,
      sites: [
        {
          id: 's-1', name: 'حقل الأمل', division_id: 'd-broiler', kind: 'broiler', can_manage: true,
          halls: [
            { id: 'h-1', name: 'قاعة 1', capacity: 6000, version: 2, flock: flockJson(FLOCK) },
            { id: 'h-2', name: 'قاعة 2', capacity: 6000, version: 2, flock: null },
          ],
        },
      ],
    });
    const detail = () => ({
      flock: { ...flockJson(FLOCK), hall_id: 'h-1', hall_name: 'قاعة 1', site_id: 's-1', site_name: 'حقل الأمل', closed_on: null, close_note: null },
      can_manage: false,
      can_save: true,
      days: [],
      weights: [],
    });
    await step('E الحقل', async () => {
      fresh('storekeeper', { flock_feed: () => clone(SAMPLES.flock_feed.storekeeper), flock_issue_options: () => clone(SAMPLES.flock_issue_options.storekeeper) }, { loadOverviewJson: overview });
      await mount('/broiler');
      const links = byAction('hall-issue');
      t.same(links.map((node) => [node.textContent, node.getAttribute('href')]), [['اصرف', `/halls/give/${FLOCK}?back=%2Fbroiler`]], 'E «اصرف» لكلّ قاعة بفوج قائم (لا للقاعة الفارغة) إلى صفحة الإضافة لفوجها');
      t.eq(byAction('farm-vaccines')[0]?.getAttribute('href') ?? null, '/halls/vaccines?kind=broiler', 'E ورأس الحقل يدلّ على جدول لقاحات نوعه');
      t.same(byAction('farm-day-report').map((node) => [node.textContent, node.getAttribute('href')]), [['تقرير اليوم', '/halls/day?back=/broiler']], 'E ورأسه يدلّ على تقرير القاعات اليومي برجوع إلى الحقل (0027)');
      fire(links[0], 'click', { button: 0 });
      await settle(60);
      t.eq(globalThis.__fi.location, `/halls/give/${FLOCK}?back=%2Fbroiler`, 'E والنقر يفتح صفحة الإضافة، والرجوع منها إلى الحقل');
    });
    await step('E عامل القاعة', async () => {
      fresh('hall_worker', { flock_feed: () => clone(SAMPLES.flock_feed.storekeeper) }, { loadOverviewJson: overview, loadFlockDetail: () => m.parseDetail(detail()) });
      await mount('/broiler');
      t.eq(byAction('hall-issue').length, 0, 'E عامل القاعة: لا «اصرف» في جدول الحقل');
    });
    await step('E شاشة الفوج', async () => {
      fresh('owner', { flock_feed: () => clone(SAMPLES.flock_feed.owner) }, { loadFlockDetail: () => m.parseDetail(detail()) });
      await mount(`/broiler/flock/${FLOCK}`);
      t.ok(textOf('feed-line')?.startsWith(FEED_LINE), `E شاشة الفوج: سطر علف القاعة (${textOf('feed-line')})`);
      const back = encodeURIComponent(`/broiler/flock/${FLOCK}`);
      t.same(
        [textOf('flock-give'), byAction('flock-give')[0]?.getAttribute('href'), byAction('flock-issues')[0]?.getAttribute('href'), byAction('flock-calendar')[0]?.getAttribute('href'), byAction('flock-report')[0]?.getAttribute('href')],
        ['أضف للقاعة', `/halls/give/${FLOCK}?back=${back}`, `/inventory/issue/${FLOCK}?back=${back}`, `/halls/calendar/${FLOCK}`, `/halls/report/${FLOCK}`],
        'E «أضف للقاعة» إلى صفحة الإضافة، وسجلّ الصرف، وتقويم القاعة وتقرير الدورة، والرجوع إلى الفوج نفسه',
      );
    });
    await step('E شاشة الفوج لعامل القاعة', async () => {
      fresh('hall_worker', { flock_feed: () => clone(SAMPLES.flock_feed.storekeeper) }, { loadFlockDetail: () => m.parseDetail(detail()) });
      await mount(`/broiler/flock/${FLOCK}`);
      t.same([byAction('feed-line').length, byAction('flock-give').length, byAction('flock-issues').length], [1, 1, 1], 'E عامل القاعة يرى علف قاعته وسجلّها، و«أضف للقاعة» (يسجّل الدواء الذي ليس في المخزن)');
    });
    await step('E شاشة الفوج للمشاهد', async () => {
      fresh('viewer', { flock_feed: () => clone(SAMPLES.flock_feed.storekeeper) }, { loadFlockDetail: () => m.parseDetail(detail()) });
      await mount(`/broiler/flock/${FLOCK}`);
      t.same([byAction('feed-line').length, byAction('flock-give').length, byAction('flock-calendar').length], [1, 0, 1], 'E المشاهد يقرأ علف القاعة وتقويمها، بلا «أضف للقاعة»');
    });
  } finally {
    delete globalThis.__fi;
    restore();
  }
}
