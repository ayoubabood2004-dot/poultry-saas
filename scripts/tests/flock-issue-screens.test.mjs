// الصرف لفوج القاعة (0019، كلمة المالك 2026-11-07: «لمن اروح للقاعات اريد اصرفلهم مادة معينة الكي المواد الي اني صنعتها بالمعمل… ويكلي شكد
// عندك واكدر اصرف منها للقاعة»). أجوبة القاعدة الحقيقية (fixtures/flock-issue-0019.json: التقطها supabase/tests/flock-issue.test.mjs على
// بوستغريس الحزمة، لكلّ دور ولكلّ رفض بتلميحه) تمرّ بالمحلّلات الحقيقية (flocks.ts وflockIssues.ts محزومين بـesbuild) — لا أجوبة بخطّ اليد؛
// والشاشات الحقيقية (FarmRoutes وStockRoutes) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، وrepo الحقيقي على core بديل يسجّل كلّ نداء.
// P المحلّلات بأجوبة القاعدة: ما يُصرف (المالك والأمين وعامل القاعة)، والصرف (بالمال وبلاه)، والإلغاء، وعلف القاعة (المال يغيب للأمين)، والصرامة؛
// D1 «اصرف علفاً أو دواءً»: بطاقات بـ«عندك» وشارة «من إنتاج المعمل»، والكمية بوحدتها واليوم، وزرّ يسمّي ما سيحدث، وrecord_flock_issue بمفاتيحه
//    الثمانية، ثمّ تُقرأ الصفحة من جديد؛ D2 store_required ← المخازن بكمياتها، والإرسال ثانيةً بالمعرّفات نفسها ومعه المخزن؛ D3 insufficient_stock
//    بتلميح الخادم؛ D4 نتيجة مجهولة ← «أعد المحاولة» بالنداء نفسه حرفاً؛ D5 «ألغِ» لكلّ سطر من can_void السطر نفسه (لا من رأس الجدول: مدير حقل لا يلغي
//    صرفاً من مخزن المعمل)، بتأكيد يسمّي الأثر وسبب إلزامي؛ D6 الأمين بلا عمود القيمة ولا
//    «ألغِ»؛ E المداخل: «اصرف» في جدول الحقل لكلّ قاعة بفوج قائم يفتح نافذة الصرف لفوجها، وشاشة الفوج بسطر العلف وزرّها (لا لعامل القاعة).
// كلّ حالة تفشل على الشفرة قبل 0019 في الشاشات (لا flockIssues ولا صفحة issue/:flockId ولا سطر العلف ولا رابط «اصرف»).
// ومراجعة الشاشات (كلّ حالة R تفشل على fab1c66): F10 صرف لم يُعرف جوابه يبقى بعد إغلاق النافذة (والإغلاق يسأل) وفتحها يعيده بالنداء نفسه، فلا
// يُصرف مرّتين بمعرّفين؛ F1 اليوم مقفول بعد النتيجة المجهولة؛ F34 قيمة الملغى «—»؛ F7 فشل «ما يُصرف» يُقال بإعادته، وفشل القراءة من جديد ولو بقي
// المعروض القديم؛ F8 شاشة الفوج: فشل علف القاعة يُقال وزرّ الصرف باقٍ؛ F9 id_conflict ← معرّفات جديدة بتلميح الخادم.
// ويوم المالك (2026-11-07؛ تفشلان على df1c736): K1 البطاقة تقول نوع المادّة («مادّة أوّلية»، «وقود»، «دواء»…) لا نوع كلفتها، وتحت المادّة
// الأوّلية «تُحسب كلفةَ علف»؛ K2 الزرّ لا يجعل الكمية مفعولاً («اصرف قطعتان «كاز»» لحن): «اصرف «كاز» (قطعتان) لـ«قاعة 2»» لكلّ عدد.
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
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
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
const STARTER = SAMPLES.record_flock_issue.storekeeper.item_id; // «علف بادئ» من إنتاج المعمل
const FEED_STORE = SAMPLES.record_flock_issue.storekeeper.warehouse_id; // «مخزن العلف»
const FARM_STORE = SAMPLES.record_flock_issue.owner_farm_store_by_keeper_farm.warehouse_id; // «مخزن حقل الأمل»
/** «ما يُصرف» للمالك وفيه «علف بادئ» في مخزنين (كما في تلميح store_required الحقيقي: 600 كغم و100 كغم). */
const twoStores = () => {
  const json = clone(SAMPLES.flock_issue_options.owner);
  const starter = json.items.find((item) => item.item_id === STARTER);
  starter.stores = [
    { warehouse_id: FEED_STORE, name: 'مخزن العلف', qty: '600.000' },
    { warehouse_id: FARM_STORE, name: 'مخزن حقل الأمل', qty: '100.000' },
  ];
  starter.on_hand_qty = '700.000';
  return json;
};

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
      [feedOwner.issuedFeedKg, feedOwner.consumedFeedKg, feedOwner.remainingFeedKg, feedOwner.unweighedFeedLines, feedOwner.issues.length, feedOwner.issues.at(-1).status, feedOwner.canVoid, feedOwner.money],
      [scaledOf(raw.issued_feed_kg, 3), scaledOf(raw.consumed_feed_kg, 3), scaledOf(raw.remaining_feed_kg, 3), raw.unweighed_feed_lines, raw.issues.length, 'void', true, { issuedValue: scaledOf(raw.money.issued_value, 2) }],
      'P علف القاعة للمالك: المصروف والمستهلك والباقي، والسطور الأحدث أوّلاً والملغى بحاله، و«ألغِ» والمال',
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
      [shape(() => p.parseFlockFeed(noKey)), p.parseFlockFeed(negative).remainingFeedKg, p.parseFlockFeed(nullValue).issues[0].money, shape(() => p.parseIssueOptions(badKind))],
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
    const FEED_LINE = `المصروف للقاعة: ${kgOf(OWNER_FEED.issued_feed_kg)} — المستهلك المسجّل: ${kgOf(OWNER_FEED.consumed_feed_kg)} — الباقي بالقاعة: ${kgOf(OWNER_FEED.remaining_feed_kg)}`;
    const UNWEIGHED = OWNER_FEED.unweighed_feed_lines > 0 ? `سطور علف لا يُعرف وزنها (سائل بلا كثافة أو كيس بلا وزن) فلم تُحسب في المصروف: ${m.fmtInt(OWNER_FEED.unweighed_feed_lines)}.` : '';
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
    const cardOf = (itemId) => byAction('issue-card').find((node) => node.getAttribute('data-item') === itemId);
    const labelOf = (input) => (input ? all().find((n) => n.localName === 'label' && n.getAttribute('for') === input.getAttribute('id'))?.textContent : null);
    const ownerRpc = (over = {}) => ({
      flock_issue_options: () => clone(SAMPLES.flock_issue_options.owner),
      flock_feed: () => clone(SAMPLES.flock_feed.owner),
      record_flock_issue: () => clone(SAMPLES.record_flock_issue.storekeeper),
      ...over,
    });

    // ── D1: البطاقات والكمية واليوم والزرّ الذي يسمّي الأثر، والنداء بمفاتيحه الثمانية ───────────────────────────────────────
    await step('D1', async () => {
      const calls = fresh('owner', ownerRpc());
      await mount(ISSUE_URL);
      t.eq(textOf('feed-line'), `${FEED_LINE}${UNWEIGHED}`, 'D1 سطر علف القاعة ومعه ما لم يُحسب وزنه');
      t.eq(byAction('issue-card').length, 10, 'D1 ‎?open=1 يفتح نافذة الصرف ببطاقة لكلّ مادّة متاحة');
      const first = byAction('issue-card')[0];
      t.ok(first?.textContent.startsWith('علف بادئ') && first.textContent.includes('من إنتاج المعمل') && first.textContent.includes('عندك: 1,200 كغم'), `D1 علف المعمل أوّلاً بشارته و«عندك» (${first?.textContent})`);
      t.eq(byAction('made-in-mill').length, 1, 'D1 والشارة له وحده');
      t.same([textOf('issue-save'), disabled(byAction('issue-save')[0])], ['اختر المادّة واكتب كميتها', true], 'D1 قبل الاختيار: الزرّ يقول ما ينقص ومعطّل');
      await click(cardOf(STARTER));
      const qty = byAction('issue-qty')[0];
      const day = all().find((n) => n.localName === 'input' && labelOf(n) === 'يوم الصرف');
      t.same([cardOf(STARTER)?.getAttribute('aria-pressed'), labelOf(qty), day?.value ?? null], ['true', 'الكمية (كغم)', '07/11/2026'], 'D1 لمس البطاقة يختارها: الكمية بوحدتها، واليوم اليوم');
      type(qty, '5000');
      await settle();
      t.ok(text().includes('عندك 1,200 كغم فقط.') && disabled(byAction('issue-save')[0]) === true, 'D1 كمية أكبر من الموجود تُقال قبل الإرسال');
      type(qty, '500');
      await settle();
      t.same([textOf('issue-save'), disabled(byAction('issue-save')[0])], ['اصرف «علف بادئ» (500 كغم) لـ«قاعة 1»', false], 'D1 الزرّ يسمّي ما سيحدث');
      await click(byAction('issue-save')[0]);
      const [args] = named(calls, 'rpc:record_flock_issue');
      t.same(Object.keys(args ?? {}).sort(), ['p_client_ref', 'p_flock', 'p_issue_id', 'p_issued_on', 'p_item', 'p_line_id', 'p_qty', 'p_warehouse'], 'D1 record_flock_issue بالمفاتيح الثمانية');
      t.same([args?.p_flock, args?.p_item, args?.p_qty, args?.p_issued_on, args?.p_warehouse], [FLOCK, STARTER, '500.000', '2026-11-07', null], 'D1 الفوج والمادّة والكمية بوحدة أساسها واليوم، والمخزن null (الخادم يختار الوحيد)');
      t.ok([args?.p_client_ref, args?.p_issue_id, args?.p_line_id].every((value) => UUID.test(value ?? '')) && new Set([args?.p_client_ref, args?.p_issue_id, args?.p_line_id]).size === 3, 'D1 المرجع والمعرّفان من الجهاز');
      t.eq(globalThis.__fi.toasts.at(-1)?.title, 'صُرف 500 كغم «علف بادئ» لـ«قاعة 1» من «مخزن العلف» (FI-2026-0001).', 'D1 الرسالة تقول ما صُرف ومن أين ورقمه');
      t.same([byAction('issue-card').length, named(calls, 'rpc:flock_feed').length, named(calls, 'rpc:flock_issue_options').length], [0, 2, 2], 'D1 ثمّ تُغلق النافذة وتُقرأ علف القاعة وما يُصرف من جديد');
    });

    // ── K1: البطاقة بنوع المادّة، و«تُحسب كلفةَ علف» تحت المادّة الأوّلية والإضافة ─────────────────────────────────────────────
    await step('K1', async () => {
      fresh('owner', ownerRpc());
      await mount(ISSUE_URL);
      const KIND = { feed: 'علف', raw: 'مادّة أوّلية', additive: 'إضافة', equipment: 'معدّات', medicine: 'دواء', vaccine: 'لقاح', fuel: 'وقود', other: 'أخرى' };
      const items = SAMPLES.flock_issue_options.owner.items;
      const shown = byAction('issue-card').map((card) => {
        const inner = descendants(card);
        const pick = (name) => inner.find((n) => n.getAttribute('data-action') === name)?.textContent ?? null;
        return [card.getAttribute('data-item'), pick('made-in-mill') ? 'من إنتاج المعمل' : pick('issue-kind'), pick('issue-feed-cost')];
      });
      t.same(
        shown,
        items.map((item) => [item.item_id, item.made_in_mill ? 'من إنتاج المعمل' : KIND[item.kind], item.kind === 'raw' || item.kind === 'additive' ? 'تُحسب كلفةَ علف' : null]),
        'K1 كلّ بطاقة بنوع مادّتها (وعلف المعمل بشارته)، و«تُحسب كلفةَ علف» تحت المادّة الأوّلية وحدها',
      );
      const named = (name) => byAction('issue-card').find((card) => card.textContent.startsWith(name))?.textContent ?? '';
      t.ok(named('كاز').includes('وقود') && !named('كاز').includes('كلفةَ علف') && named('ذرة صفراء').includes('مادّة أوّلية') && named('ستائر').includes('معدّات'), `K1 «كاز» وقود و«ذرة صفراء» مادّة أوّلية و«ستائر» معدّات (${named('ذرة صفراء')})`);
    });

    // ── K2: الكمية بين قوسين لا مفعولاً للفعل، لكلّ عدد ───────────────────────────────────────────────────────────────────
    await step('K2', async () => {
      fresh('owner', ownerRpc());
      await mount(ISSUE_URL);
      const idOf = (name) => SAMPLES.flock_issue_options.owner.items.find((item) => item.name === name).item_id;
      const said = [];
      const sayFor = async (name, qtys) => {
        await click(cardOf(idOf(name)));
        for (const qty of qtys) {
          type(byAction('issue-qty')[0], qty);
          await settle();
          said.push(textOf('issue-save'));
        }
        await click(cardOf(idOf(name)));
      };
      await sayFor('ستائر', ['1', '2', '3', '10']);
      await sayFor('لقاح نيوكاسل', ['11', '100']);
      await sayFor('كاز', ['20']);
      await sayFor('علف بادئ', ['500', '1.5']);
      t.same(
        said,
        [
          'اصرف «ستائر» (قطعة واحدة) لـ«قاعة 1»',
          'اصرف «ستائر» (قطعتان) لـ«قاعة 1»',
          'اصرف «ستائر» (3 قطع) لـ«قاعة 1»',
          'اصرف «ستائر» (10 قطع) لـ«قاعة 1»',
          'اصرف «لقاح نيوكاسل» (11 قطعة) لـ«قاعة 1»',
          'اصرف «لقاح نيوكاسل» (100 قطعة) لـ«قاعة 1»',
          'اصرف «كاز» (20 لتراً) لـ«قاعة 1»',
          'اصرف «علف بادئ» (500 كغم) لـ«قاعة 1»',
          'اصرف «علف بادئ» (1.5 كغم) لـ«قاعة 1»',
        ],
        'K2 «اصرف «المادّة» (الكمية) لـ«القاعة»»: الكمية بين قوسين للقطعة والقطعتين والقطع والكيلو واللتر',
      );
    });

    // ── D2: store_required ← المخازن بكمياتها والإرسال ثانيةً بالمعرّفات نفسها ───────────────────────────────────────────────
    await step('D2', async () => {
      let reads = 0;
      const hint = SAMPLES.refusals.store_required.hint;
      let first = true;
      const calls = fresh(
        'owner',
        ownerRpc({
          flock_issue_options: () => {
            reads += 1;
            return reads === 1 ? clone(SAMPLES.flock_issue_options.owner) : twoStores();
          },
          record_flock_issue: () => {
            if (first) {
              first = false;
              throw new m.RejectedError('store_required', hint);
            }
            return clone(SAMPLES.record_flock_issue.owner_farm_store_by_keeper_farm);
          },
        }),
      );
      await mount(ISSUE_URL);
      await click(cardOf(STARTER));
      type(byAction('issue-qty')[0], '100');
      await settle();
      t.eq(byAction('issue-stores').length, 0, 'D2 مخزن واحد في «ما يُصرف»: لا اختيار');
      await click(byAction('issue-save')[0]);
      t.same([reads, textOf('issue-stores')?.startsWith(hint)], [2, true], 'D2 store_required: «ما يُصرف» تُقرأ من جديد، وتلميح الخادم فوق المخازن');
      t.same(byAction('issue-store').map((node) => node.textContent), ['مخزن العلف (600 كغم)', 'مخزن حقل الأمل (100 كغم)'], 'D2 كلّ مخزن بكميته');
      t.same([byAction('issue-qty')[0]?.value, disabled(byAction('issue-save')[0])], ['100', true], 'D2 الكمية باقية، والصرف ينتظر اختيار المخزن');
      await click(byAction('issue-store').find((node) => node.getAttribute('data-store') === FARM_STORE));
      await click(byAction('issue-save')[0]);
      const [one, two] = named(calls, 'rpc:record_flock_issue');
      t.same(
        [two?.p_client_ref, two?.p_issue_id, two?.p_line_id, two?.p_qty, one?.p_warehouse, two?.p_warehouse],
        [one?.p_client_ref, one?.p_issue_id, one?.p_line_id, '100.000', null, FARM_STORE],
        'D2 الإرسال الثاني بالمعرّفات والمرجع أنفسها ومعه المخزن المختار (الرفض لم يكتب شيئاً)',
      );
      t.ok(globalThis.__fi.toasts.at(-1)?.title.includes('من «مخزن حقل الأمل» (FI-2026-0002)'), 'D2 وصُرف من المخزن المختار');
    });

    // ── D3: insufficient_stock بتلميح الخادم، والنافذة باقية ──────────────────────────────────────────────────────────────
    await step('D3', async () => {
      const hint = SAMPLES.refusals['insufficient_stock (قبل الاستلام)'].hint;
      const calls = fresh(
        'owner',
        ownerRpc({
          record_flock_issue: () => {
            throw new m.RejectedError('insufficient_stock', hint);
          },
        }),
      );
      await mount(ISSUE_URL);
      await click(cardOf(STARTER));
      type(byAction('issue-qty')[0], '1000');
      await settle();
      await click(byAction('issue-save')[0]);
      t.ok(text().includes(hint), `D3 تلميح الخادم كما هو («عندك …» وما استُلم بعد التاريخ)`);
      t.same([byAction('issue-card').length, byAction('issue-qty')[0]?.value, named(calls, 'rpc:flock_issue_options').length], [10, '1000', 2], 'D3 النافذة باقية بما كُتب، و«ما يُصرف» تُقرأ من جديد');
      const sample = SAMPLES.refusals.date_too_old.hint;
      globalThis.__fi.rpc = (fn) => (fn === 'record_flock_issue' ? Promise.reject(new m.RejectedError('date_too_old', sample)) : new Promise(() => {}));
      type(byAction('issue-qty')[0], '10');
      await settle();
      await click(byAction('issue-save')[0]);
      const day = all().find((n) => n.localName === 'input' && labelOf(n) === 'يوم الصرف');
      const alert = day?.parentNode?.childNodes.find((n) => n.getAttribute?.('role') === 'alert')?.textContent ?? null;
      t.eq(alert, sample, 'D3 رفض التاريخ يُقال تحت حقل اليوم');
    });

    // ── D4: نتيجة مجهولة ← النافذة مجمَّدة و«أعد المحاولة» بالنداء نفسه حرفاً ───────────────────────────────────────────────────
    await step('D4', async () => {
      let attempt = 0;
      const calls = fresh(
        'owner',
        ownerRpc({
          record_flock_issue: () => {
            attempt += 1;
            if (attempt === 1) throw new m.UnknownOutcomeError();
            return clone(SAMPLES.record_flock_issue.storekeeper);
          },
        }),
      );
      await mount(ISSUE_URL);
      await click(cardOf(STARTER));
      type(byAction('issue-qty')[0], '500');
      await settle();
      await click(byAction('issue-save')[0]);
      t.same([text().includes('لا نعرف إن سُجّل الصرف: أعد المحاولة؛ لن يُسجَّل مرّتين.'), textOf('issue-save'), disabled(byAction('issue-qty')[0])], [true, 'أعد المحاولة', true], 'D4 نتيجة مجهولة: جملة وفعل واحد، والحقول مقفولة');
      await click(byAction('issue-save')[0]);
      const [one, two] = named(calls, 'rpc:record_flock_issue');
      t.same(two, one, 'D4 الإعادة بالنداء نفسه حرفاً (المعرّفات والمرجع والمحتوى)');
      t.eq(byAction('issue-card').length, 0, 'D4 والجواب النهائي يغلق النافذة');
    });

    // ── D5: «ألغِ» بتأكيد يسمّي الأثر وسبب إلزامي ─────────────────────────────────────────────────────────────────────────
    await step('D5', async () => {
      // سطر أوّل لا يلغيه هذا القارئ (صرف من مخزن خارج نطاقه، والرأس can_void = true): لا «ألغِ» عليه وحده.
      const feedJson = withRowVoid(SAMPLES.flock_feed.owner);
      const blockedRow = feedJson.issues.find((issue) => issue.status === 'posted');
      blockedRow.can_void = false;
      const calls = fresh('owner', ownerRpc({ flock_feed: () => clone(feedJson), void_flock_issue: () => clone(SAMPLES.void_flock_issue.manager) }));
      await mount(`/inventory/issue/${FLOCK}`);
      t.same([byAction('issue-card').length, byAction('issue-open').length], [0, 1], 'D5 بلا ‎?open=1 لا نافذة، والزرّ الكبير ظاهر');
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
    const dayInput = () => all().find((n) => n.localName === 'input' && labelOf(n) === 'يوم الصرف');
    const unknownThenStored = () => {
      let attempt = 0;
      return () => {
        attempt += 1;
        if (attempt === 1) throw new m.UnknownOutcomeError();
        return clone(SAMPLES.record_flock_issue.storekeeper);
      };
    };
    await step('R F10', async () => {
      const calls = fresh('owner', ownerRpc({ record_flock_issue: unknownThenStored() }));
      await mount(ISSUE_URL);
      await click(cardOf(STARTER));
      type(byAction('issue-qty')[0], '500');
      await settle();
      await click(byAction('issue-save')[0]);
      await click(byAction('dialog-close')[0]);
      t.eq(byAction('dialog-discard').length, 1, 'R F10 إغلاق النافذة بعد نتيجة مجهولة يسأل أوّلاً (الصرف المرسَل «وسخ»)');
      await click(byAction('dialog-discard')[0]);
      t.same([byAction('issue-card').length, byAction('issue-pending').length], [0, 1], 'R F10 أُغلقت، وفي الصفحة تنبيه بالصرف الذي لم يُعرف جوابه');
      await click(byAction('issue-open')[0]);
      t.same([textOf('issue-save'), byAction('issue-qty')[0]?.value ?? null, disabled(byAction('issue-qty')[0])], ['أعد المحاولة', '500', true], 'R F10 فتحها ثانيةً يرجّع الصرف المرسَل بفعله الوحيد «أعد المحاولة»');
      await click(byAction('issue-save')[0]);
      const [one, two] = named(calls, 'rpc:record_flock_issue');
      t.same([named(calls, 'rpc:record_flock_issue').length, two], [2, one], 'R F10 والإعادة بالنداء نفسه حرفاً: لا صرف ثانٍ بمعرّفات جديدة');
    });
    await step('R F1', async () => {
      fresh('owner', ownerRpc({ record_flock_issue: () => Promise.reject(new m.UnknownOutcomeError()) }));
      await mount(ISSUE_URL);
      await click(cardOf(STARTER));
      type(byAction('issue-qty')[0], '500');
      await settle();
      t.eq(disabled(dayInput()), false, 'R F1 ضابط: اليوم يُكتب قبل الإرسال');
      await click(byAction('issue-save')[0]);
      t.eq(disabled(dayInput()), true, 'R F1 بعد نتيجة مجهولة: اليوم مقفول كالكمية (ما يُكتب بعدها لا يُرسل)');
    });
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
      await mount(ISSUE_URL);
      t.ok(text().includes('تعذّر تحميل ما يُصرف للقاعة') && byAction('issue-card').length === 0, 'R F7 فشل «ما يُصرف» يُقال (لا صمت) ولو طُلبت النافذة');
      const retry = byAction('retry').find((node) => node.parentNode?.textContent.includes('ما يُصرف للقاعة'));
      await click(retry);
      t.eq(byAction('issue-card').length, 10, 'R F7 «أعد المحاولة» يقرؤها فتنفتح النافذة المطلوبة');
    });
    await step('R F7 القراءة من جديد', async () => {
      let feeds = 0;
      fresh(
        'owner',
        ownerRpc({
          flock_feed: () => {
            feeds += 1;
            if (feeds > 1) throw new m.NetworkError();
            return clone(SAMPLES.flock_feed.owner);
          },
        }),
      );
      await mount(ISSUE_URL);
      await click(cardOf(STARTER));
      type(byAction('issue-qty')[0], '500');
      await settle();
      await click(byAction('issue-save')[0]);
      t.same([byAction('feed-line').length, text().includes('تعذّر تحميل علف القاعة')], [1, true], 'R F7 فشل القراءة بعد الصرف يُقال، والمعروض القديم باقٍ تحته');
    });
    await step('R F9', async () => {
      const hint = SAMPLES.refusals['id_conflict (أُلغي، المرجع نفسه)'].hint;
      let attempt = 0;
      const calls = fresh(
        'owner',
        ownerRpc({
          record_flock_issue: () => {
            attempt += 1;
            if (attempt === 1) throw new m.RejectedError('id_conflict', hint);
            return clone(SAMPLES.record_flock_issue.storekeeper);
          },
        }),
      );
      await mount(ISSUE_URL);
      await click(cardOf(STARTER));
      type(byAction('issue-qty')[0], '500');
      await settle();
      await click(byAction('issue-save')[0]);
      t.same([text().includes(hint), named(calls, 'rpc:flock_feed').length], [true, 2], 'R F9 id_conflict بتلميح الخادم، والصفحة تُقرأ من جديد');
      await click(byAction('issue-save')[0]);
      const [one, two] = named(calls, 'rpc:record_flock_issue');
      t.ok(two && two.p_issue_id !== one.p_issue_id && two.p_line_id !== one.p_line_id && two.p_client_ref !== one.p_client_ref, 'R F9 والإرسال التالي بمعرّفات جديدة، فلا يُرفض بالسبب نفسه أبداً');
      t.eq(byAction('issue-card').length, 0, 'R F9 فيُصرف وتُغلق النافذة');
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
      t.same([byAction('feed-failed').length, byAction('flock-issue').length, byAction('feed-line').length], [1, 1, 0], 'R F8 فشل علف القاعة يُقال، وزرّ «اصرف علفاً أو دواءً» باقٍ (لا يحتاج سطر العلف)');
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
      t.same(links.map((node) => [node.textContent, node.getAttribute('href')]), [['اصرف', `/inventory/issue/${FLOCK}?back=%2Fbroiler&open=1`]], 'E «اصرف» لكلّ قاعة بفوج قائم (لا للقاعة الفارغة) إلى نافذة الصرف لفوجها');
      fire(links[0], 'click', { button: 0 });
      await settle(60);
      t.same([globalThis.__fi.location.startsWith(`/inventory/issue/${FLOCK}`), byAction('issue-card').length, byAction('issue-back')[0]?.getAttribute('href') ?? null], [true, 6, '/broiler'], 'E والنقر يفتح نافذة الصرف ببطاقاتها، والرجوع إلى الحقل');
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
        [textOf('flock-issue'), byAction('flock-issue')[0]?.getAttribute('href'), byAction('flock-issues')[0]?.getAttribute('href')],
        ['اصرف علفاً أو دواءً', `/inventory/issue/${FLOCK}?back=${back}&open=1`, `/inventory/issue/${FLOCK}?back=${back}`],
        'E وزرّ «اصرف علفاً أو دواءً» إلى نافذة الصرف، ورابط سجلّ الصرف، والرجوع إلى الفوج نفسه',
      );
    });
    await step('E شاشة الفوج لعامل القاعة', async () => {
      fresh('hall_worker', { flock_feed: () => clone(SAMPLES.flock_feed.storekeeper) }, { loadFlockDetail: () => m.parseDetail(detail()) });
      await mount(`/broiler/flock/${FLOCK}`);
      t.same([byAction('feed-line').length, byAction('flock-issue').length, byAction('flock-issues').length], [1, 0, 1], 'E عامل القاعة يرى علف قاعته وسجلّها، بلا زرّ الصرف');
    });
  } finally {
    delete globalThis.__fi;
    restore();
  }
}
