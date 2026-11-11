// «أضف للقاعة» وتذكير اللقاحات والجولة بلا ماء (0026، كلمة المالك 2026-11-11؛ عقد scratchpad/halls/contract-0026.md): react-dom/client الحقيقي على DOM صغير
// (dom.mjs) يشغّل HallsRoutes وFarmRoutes الحقيقيتين، وrepo الحقيقي (halls وflockIssues وflocks: المحلّلات وبناء النداءات) على core بديل يسجّل كلّ نداء
// ويجيب بأجوبة العقد (fixtures/halls-contract.json، مكتوبة باليد قبل الهجرة) وبأجوبة القاعدة الحقيقية لـ«ما يُصرف» (fixtures/flock-issue-0019.json)؛
// والجلسة والتنبيه بديلان، والطابور حقيقيّ على fake-indexeddb. الحالات:
// A مادّتان لثلاث قاعات: p_lines حرفاً (الترتيب والمفاتيح ونصّ الكمية والمعرّفات)، والتأكيد بما يُضاف لكلّ قاعة ومجموع كلّ مادّة أمام «عندك»، ثمّ
//   التنبيه بالمستندات والرجوع؛ Q كمية مختلفة لكلّ قاعة (والخانة الفارغة لا شيء لقاعتها)؛ L دواء ليس في المخزن سطر log لكلّ قاعة، وعامل القاعة
//   بلا بطاقات؛ T المجموع فوق «عندك» يُمنع قبل الإرسال؛ Y اليوم من ‎?on بين أقدم يوم واليوم؛ U النتيجة المجهولة: تجميد و«أعد المحاولة» بالنداء
//   نفسه حرفاً، وبعد الرجوع والعودة، وفي الطريق، وبعد إعادة التحميل (sessionStorage، نسخة ثانية من الحزمة)؛ X الرفض الأكيد يبقي ما كُتب ومعرّفاته
//   بمرجع جديد، وid_conflict بمعرّفات جديدة؛ B طريق الرجوع؛ R التذكير: المجموعات ونصوصها وألوانها، و«تمّ» للقاح مربوط بسطور vaccination ومعها
//   الصرف ولغير المربوط بلاه ثمّ يُقرأ من جديد، والنتيجة المجهولة، ولا شيء حين يفشل النداء، والصفّ المختصر؛ W الجولة: بلا خانة ماء ولا water_l في
//   حمولتها (والعملية القديمة بالطابور ترسل مائها كما هو)، وشريط التذكير و«أضف للقاعة» لكلّ قاعة.
// ومراجعة 0026: R vaccine_relinked يُعيد قراءة التذكير؛ GR-1 حزمة القاعات تفشل كغلاف Vite (vite:preloadError) بواي فاي بلا نت والتعافي الحقيقي يسمع:
//   تحميل واحد لكلّ فتح للجولة ولا تعافٍ من القشرة القديمة؛ GR-2 جواب الإضافة أو «تمّ» بعد مغادرة الصفحة في الموجّه نفسه: لا تنقّل، والرفض والنتيجة
//   المجهولة بتنبيه.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const C = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-contract.json'), 'utf8'));
const S = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'flock-issue-0019.json'), 'utf8'));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const clone = (value) => JSON.parse(JSON.stringify(value));

const STUBS = {
  session: 'export const useSession = () => globalThis.__hg.session; export const sessionStore = { get: () => globalThis.__hg?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__hg.toasts.push(spec); }; export function Toaster() { return null; }',
  // حزمة القاعات كما يحمّلها المتصفّح: الحقيقية، أو فشل تحميلها بلا نت (chunkDown) كما يرفض import() لملفّ خارج التثبيت المسبق. وchunkDown
  // 'vite' (بعد 10 مللي) و'vite-now' (فوراً) فشلٌ كغلاف Vite في البناء (__vitePreload): يطلق vite:preloadError قابلاً للإلغاء بالخطأ على window ثمّ
  // يرمي ما لم يُلغَ. وكلّ تحميل يُعدّ (loads)، وكلّ حدث (preloadErrors) وكلّ إلغاء له (prevented).
  hallsChunk: `import * as halls from ${JSON.stringify(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'))};
    const viteFailure = (error) => {
      const hg = globalThis.__hg;
      const event = { type: 'vite:preloadError', cancelable: true, defaultPrevented: false, payload: error, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
      if (hg) hg.preloadErrors = (hg.preloadErrors ?? 0) + 1;
      window.dispatchEvent(event);
      if (!event.defaultPrevented) throw error;
      if (hg) hg.prevented = (hg.prevented ?? 0) + 1;
    };
    export const loadHalls = () => {
      const hg = globalThis.__hg;
      if (hg) hg.loads = (hg.loads ?? 0) + 1;
      const down = hg?.chunkDown;
      if (down === 'vite' || down === 'vite-now') {
        const error = new TypeError('Failed to fetch dynamically imported module: http://localhost/assets/HallsRoutes-test.js');
        return (down === 'vite' ? new Promise((_, reject) => setTimeout(() => reject(error), 10)) : Promise.reject(error)).catch(viteFailure);
      }
      return down ? Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : Promise.resolve(halls);
    };`,
};
// core بديل لملفّات repo: call يسجّله __hg.rpc (المحلّل الحقيقي يقرأ الجواب)، وهويّة الطابور من الجلسة.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__hg.rpc(fn, args);
export const send = async () => { throw new Error('send_unused'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ userId: globalThis.__hg?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;
const plugins = [
  {
    name: 'hg-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$|\/lib\/hallsChunk$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'hg-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'hg-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'hg-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'hg-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];

/**
 * الحزمة كلّها؛ وكلّ نداء نسخة جديدة منها (ذاكرة وحدات جديدة = إعادة تحميل الصفحة). عنوان data: نفسه يرجّع الوحدة المحفوظة نفسها، فلكلّ نسخة
 * تعليق بعدّادها يجعل عنوانها جديداً.
 */
let bundles = 0;
async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';",
    "export { default as HallsRoutes, Reminders } from './src/pages/halls/HallsRoutes.tsx';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { giveBack, pendingKey, storePending } from './src/pages/halls/GivePage.tsx';",
    "export { vaccineColor } from './src/pages/halls/palette.ts';",
    "export { sendFlockDay } from './src/lib/repo/flocks.ts';",
    "export { openOutbox, pendingOps } from './src/lib/outbox/index.ts';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { initRecovery, recoveryStore } from './src/lib/pwa/recovery.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
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
    plugins,
  });
  bundles += 1;
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// halls-give bundle ${bundles}\n`).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const withAttr = (action, attr, value) => byAction(action).find((n) => n.getAttribute(attr) === value);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const text = () => body().textContent;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click');
  await settle();
};
// خانة اختيار: المتصفّح يقلب checked قبل حدث النقر، وReact يقرأ القيمة الجديدة منه.
const tick = async (box) => {
  if (!box) throw new Error('no box');
  box.checked = !box.checked;
  fire(box, 'click');
  await settle();
};
const byLabel = (label) => all().find((n) => n.getAttribute('aria-label') === label);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** صفوف جدول بعنوانه (caption): نصّ كلّ خلية. */
const tableRows = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent.startsWith(caption)));
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const deferred = () => {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};

// ── أجوبة: «ما يُصرف» الحقيقية للمالك (القاعة 1 في «حقل الأمل»، اليوم 2026-11-07، وأقدم يوم 2026-10-31) ─────────────────────────
const OPTIONS = S.flock_issue_options.owner;
const FLOCK = OPTIONS.flock_id;
const itemOf = (name) => OPTIONS.items.find((item) => item.name === name);
const STARTER = itemOf('علف بادئ');
const VITAMIN = itemOf('فيتامين');
const F2 = '00000000-0000-4000-8000-0000000000f2';
const F3 = '00000000-0000-4000-8000-0000000000f3';
const F5 = '00000000-0000-4000-8000-0000000000f5';
const F7 = '00000000-0000-4000-8000-0000000000f7';
const flockJson = (id, over = {}) => ({
  id, kind: 'broiler', breed: null, status: 'active', version: 1, placed_on: '2026-10-28', placed_count: 5000, age_days: 11, days_since_placement: 11, dead_total: 0,
  culled_total: 0, live: 5000, live_start_today: 5000, mortality_pct: '0.00', feed_kg_total: '0.000', feed_days: 0, feed_span_days: 11, last_weight: null, fcr: null,
  today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
});
const hall = (id, name, flock) => ({ id, name, capacity: 6000, version: 1, flock });
/** قراءة الحقول: القاعة الحالية وقاعتان قائمتان معها، وقاعة بلا فوج وفوج مغلق (لا يُعرضان)، وقاعة بيّاض في حقل آخر. */
const overview = (today = '2026-11-07') => ({
  today,
  sites: [
    {
      id: 's-1', name: 'حقل الأمل', division_id: 'd-b', kind: 'broiler', can_manage: true,
      halls: [hall('h-1', 'قاعة 1', flockJson(FLOCK)), hall('h-2', 'قاعة 2', flockJson(F2)), hall('h-3', 'قاعة 3', flockJson(F3)), hall('h-4', 'قاعة 4', null), hall('h-5', 'قاعة 5', flockJson(F5, { status: 'closed' }))],
    },
    { id: 's-2', name: 'حقل البيض', division_id: 'd-l', kind: 'layer', can_manage: true, halls: [hall('h-7', 'قاعة البيض', flockJson(F7, { kind: 'layer' }))] },
  ],
});
const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer', 'feed_mill', 'general'],
  canSeeCost: role === 'owner', canSeeAccounts: role === 'owner', canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const OWNER = { status: 'ready', workspace: ws('owner'), offline: false };
const WORKER = { status: 'ready', workspace: ws('hall_worker'), offline: false };
const BACK = `/broiler/flock/${FLOCK}`;
const GIVE_URL = `/halls/give/${FLOCK}?back=${encodeURIComponent(BACK)}`;
const ISSUE_KEYS = ['kind', 'flock_id', 'issue_id', 'line_id', 'item_id', 'warehouse_id', 'qty'];

export default async function (t) {
  const restore = installDom();
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  // sessionStorage بالذاكرة (يبقى بين نسختي الحزمة كما يبقى بين إعادتي تحميل في التبويب نفسه).
  const storage = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    configurable: true,
    writable: true,
  });
  let root = null;
  /** نسخة الحزمة التي تُركَّب بها الشاشة الآن (الأولى، أو نسخة «إعادة التحميل»). */
  let current = null;
  try {
    const m = await bundle();
    current = m;
    const fresh = (session, rpcs = {}) => {
      const rpcLog = [];
      globalThis.__hg = {
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
    const mount = async (url, element = null, bundleOf = current) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = bundleOf.createRoot(container);
      const mm = bundleOf;
      function Where() {
        const location = mm.useLocation();
        globalThis.__hg.location = `${location.pathname}${location.search}`;
        // التنقّل داخل الموجّه نفسه (زرّ الرجوع في أندرويد أو المتصفّح): الصفحة السابقة تُفكّ والموجّه باقٍ.
        globalThis.__hg.navigate = mm.useNavigate();
        return element ?? mm.h(mm.Routes, { key: location.pathname }, mm.h(mm.Route, { path: '/halls/*', element: mm.h(mm.HallsRoutes) }), mm.h(mm.Route, { path: '/broiler/*', element: mm.h(mm.FarmRoutes, { kind: 'broiler' }) }), mm.h(mm.Route, { path: '*', element: null }));
      }
      mm.flushSync(() => root.render(mm.h(mm.MemoryRouter, { initialEntries: [url] }, mm.h(Where))));
      await settle(60);
    };
    const unmount = async () => {
      if (!root) return;
      const mounted = root;
      root = null;
      current.flushSync(() => mounted.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      // كلّ خطوة بلا طلب معلَّق من خطوة قبلها (في sessionStorage وفي ذاكرة الحزمة).
      storage.clear();
      for (const role of ['owner', 'hall_worker']) for (const thing of [FLOCK, 'mark:broiler', 'mark:all']) m.storePending(m.pendingKey(`u-${role}:org-1`, thing), null);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      current = m;
    };
    const giveRpcs = (over = {}) => ({ flock_issue_options: () => clone(OPTIONS), flocks_overview: () => overview(), give_to_flocks: () => clone(C.give_to_flocks), ...over });
    const card = (item) => withAttr('give-card', 'data-item', item.item_id);
    const qtyOf = (item) => descendants(withAttr('give-pick', 'data-item', item.item_id) ?? body()).find((n) => n.getAttribute('data-action') === 'give-qty');
    const hallBox = (flockId) => withAttr('give-hall', 'data-flock', flockId);
    /** يختار المادّتين ويكتب كميتيهما ويضمّ القاعتين 2 و3. */
    const twoItemsThreeHalls = async () => {
      await click(card(STARTER));
      await click(card(VITAMIN));
      type(qtyOf(STARTER), '100');
      type(qtyOf(VITAMIN), '0.5');
      await settle();
      await click(byAction('give-others')[0]);
      await tick(hallBox(F2));
      await tick(hallBox(F3));
    };
    const confirmGive = async () => {
      await click(byAction('give-go')[0]);
      await click(byAction('give-confirm')[0]);
      await settle(30);
    };
    const IB = C.vaccine_reminders.items.find((item) => item.name === 'IB');

    // ── A: مادّتان لثلاث قاعات بنداء واحد ─────────────────────────────────────────────────────────────────────────────────
    await step('A', async () => {
      const rpcLog = fresh(OWNER, giveRpcs());
      await mount(GIVE_URL);
      t.eq(byAction('give-card').length, OPTIONS.items.length, 'A بطاقة لكلّ ما يُصرف من مخازن النطاق');
      const first = byAction('give-card')[0];
      t.ok(first?.textContent.startsWith('علف بادئ') && first.textContent.includes('من إنتاج المعمل') && first.textContent.includes('عندك: 1,200 كغم'), `A علف المعمل أوّلاً بشارته و«عندك» (${first?.textContent})`);
      t.same([textOf('give-go'), disabled(byAction('give-go')[0])], ['اختر ما تضيفه للقاعة', true], 'A قبل الاختيار: الزرّ يقول ما ينقص ومعطّل');
      await twoItemsThreeHalls();
      t.same(byAction('give-hall').map((n) => n.getAttribute('data-flock')), [F2, F3, F7], 'A «كرّر في القاعات الأخرى»: أفواج النطاق القائمة بلا الحالية ولا القاعة الفارغة ولا المغلق');
      t.same(byAction('give-site').map((n) => n.firstChild?.textContent), ['حقل الأمل', 'حقل البيض'], 'A القاعات الأخرى بحقولها');
      t.same([textOf('give-go'), disabled(byAction('give-go')[0])], ['أضف لـ3 قاعات', false], 'A الزرّ يسمّي النتيجة');
      await click(byAction('give-go')[0]);
      t.same(
        tableRows('ما يُضاف لكلّ قاعة')?.map((row) => [row[0], row[1], row[2], row[4]]),
        [
          ['قاعة 1', 'علف بادئ', '100.0', 'مخزن العلف'],
          ['قاعة 1', 'فيتامين', '0.5', 'مخزن الأدوية'],
          ['قاعة 2', 'علف بادئ', '100.0', 'مخزن العلف'],
          ['قاعة 2', 'فيتامين', '0.5', 'مخزن الأدوية'],
          ['قاعة 3', 'علف بادئ', '100.0', 'مخزن العلف'],
          ['قاعة 3', 'فيتامين', '0.5', 'مخزن الأدوية'],
        ],
        'A التأكيد: ما يُضاف لكلّ قاعة بكميته ومخزنه',
      );
      t.same(tableRows('مجموع كلّ مادّة')?.map((row) => row.slice(0, 4)), [['علف بادئ', 'مخزن العلف', '300.0', '1,200.0'], ['فيتامين', 'مخزن الأدوية', '1.5', '20.0']], 'A ومجموع كلّ مادّة أمام «عندك»');
      t.eq(named(rpcLog, 'give_to_flocks').length, 0, 'A ضابط: لا إرسال قبل التأكيد');
      await click(byAction('give-confirm')[0]);
      await settle(30);
      const [args] = named(rpcLog, 'give_to_flocks');
      t.same([Object.keys(args ?? {}), args?.p_on], [['p_client_ref', 'p_on', 'p_lines'], '2026-11-07'], 'A give_to_flocks بالمرجع واليوم والسطور');
      t.same(
        args?.p_lines.map((line) => [line.kind, line.flock_id, line.item_id, line.warehouse_id, line.qty]),
        [
          ['issue', FLOCK, STARTER.item_id, STARTER.stores[0].warehouse_id, '100.000'],
          ['issue', FLOCK, VITAMIN.item_id, VITAMIN.stores[0].warehouse_id, '0.500'],
          ['issue', F2, STARTER.item_id, STARTER.stores[0].warehouse_id, '100.000'],
          ['issue', F2, VITAMIN.item_id, VITAMIN.stores[0].warehouse_id, '0.500'],
          ['issue', F3, STARTER.item_id, STARTER.stores[0].warehouse_id, '100.000'],
          ['issue', F3, VITAMIN.item_id, VITAMIN.stores[0].warehouse_id, '0.500'],
        ],
        'A السطور قاعة بعد قاعة (الحالية أوّلاً) وموادّها بترتيب اختيارها، والكمية نصّاً بثلاث مراتب',
      );
      t.ok(args?.p_lines.every((line) => JSON.stringify(Object.keys(line)) === JSON.stringify(ISSUE_KEYS)), 'A كلّ سطر بمفاتيح العقد بترتيبها');
      const ids = [args?.p_client_ref, ...(args?.p_lines ?? []).flatMap((line) => [line.issue_id, line.line_id])];
      t.ok(ids.length === 13 && ids.every((id) => UUID.test(id ?? '')) && new Set(ids).size === 13, 'A المرجع ومعرّفات السطور من الجهاز، كلّها مختلفة');
      t.same(
        [globalThis.__hg.toasts.at(-1)?.title, globalThis.__hg.toasts.at(-1)?.detail],
        ['أُضيف إلى قاعة 1، قاعة 2، قاعة 3 يوم 11/11/2026.', 'مستندات الصرف: FI-2026-0201، FI-2026-0202، FI-2026-0203.'],
        'A التنبيه يسمّي القاعات ويوم الإضافة ومستندات الصرف',
      );
      t.same([globalThis.__hg.location, m.isWindowDirty()], [BACK, false], 'A ثمّ الرجوع إلى صفحة الفوج، والنافذة نظيفة');
    });

    // ── Q: كمية مختلفة لكلّ قاعة ──────────────────────────────────────────────────────────────────────────────────────
    await step('Q', async () => {
      const rpcLog = fresh(OWNER, giveRpcs());
      await mount(GIVE_URL);
      await click(card(STARTER));
      type(qtyOf(STARTER), '100');
      await settle();
      await click(byAction('give-others')[0]);
      await tick(hallBox(F2));
      const toggle = all().find((n) => n.getAttribute('role') === 'switch');
      t.ok(toggle !== undefined, 'Q «كمية مختلفة لكلّ قاعة» يظهر لأكثر من قاعة');
      await click(toggle);
      const cell = (name) => byLabel(`كمية «علف بادئ» لـ«${name}»`);
      t.same([byAction('give-grid-qty').length, cell('قاعة 1')?.value, cell('قاعة 2')?.value, qtyOf(STARTER)], [2, '100', '100', undefined], 'Q الشبكة بقاعة لكلّ صفّ تبدأ بالكمية المشتركة، وخانتها المشتركة تختفي');
      type(cell('قاعة 2'), '');
      await settle();
      t.eq(textOf('give-go'), 'أضف لـ«قاعة 1»', 'Q الخانة الفارغة لا شيء لقاعتها: الزرّ يسمّي القاعة الوحيدة');
      type(cell('قاعة 2'), '250');
      await settle();
      t.eq(textOf('give-go'), 'أضف لقاعتين', 'Q ولقاعتين');
      await confirmGive();
      const [args] = named(rpcLog, 'give_to_flocks');
      t.same(args?.p_lines.map((line) => [line.flock_id, line.qty]), [[FLOCK, '100.000'], [F2, '250.000']], 'Q لكلّ قاعة كميتها');
    });

    // ── L: دواء ليس في المخزن ────────────────────────────────────────────────────────────────────────────────────────
    await step('L', async () => {
      const rpcLog = fresh(OWNER, giveRpcs());
      await mount(GIVE_URL);
      await click(byAction('give-log-add')[0]);
      type(byAction('give-log-name')[0], 'أموكسيسيلين');
      type(byAction('give-log-dose')[0], '1 غم لكل لتر');
      await settle();
      await click(byAction('give-others')[0]);
      await tick(hallBox(F7));
      await click(byAction('give-go')[0]);
      t.same(tableRows('ما يُضاف لكلّ قاعة')?.map((row) => [row[0], row[1], row[4]]), [['قاعة 1', 'أموكسيسيلين (1 غم لكل لتر)', 'بلا مخزن'], ['قاعة البيض', 'أموكسيسيلين (1 غم لكل لتر)', 'بلا مخزن']], 'L التأكيد: الدواء بجرعته «بلا مخزن» لكلّ قاعة');
      await click(byAction('give-confirm')[0]);
      await settle(30);
      const [args] = named(rpcLog, 'give_to_flocks');
      t.same(args?.p_lines.map((line) => Object.keys(line)), [['kind', 'flock_id', 'id', 'name', 'dose'], ['kind', 'flock_id', 'id', 'name', 'dose']], 'L سطر log بمفاتيح العقد');
      t.same(args?.p_lines.map((line) => [line.kind, line.flock_id, line.name, line.dose]), [['log', FLOCK, 'أموكسيسيلين', '1 غم لكل لتر'], ['log', F7, 'أموكسيسيلين', '1 غم لكل لتر']], 'L لكلّ قاعة مختارة سطر باسم الدواء وجرعته');
      t.ok(args && args.p_lines[0].id !== args.p_lines[1].id && args.p_lines.every((line) => UUID.test(line.id)), 'L ولكلّ سطر معرّفه');
    });
    await step('L عامل القاعة', async () => {
      const rpcLog = fresh(WORKER, giveRpcs({ flock_issue_options: () => clone(S.flock_issue_options.hall_worker) }));
      await mount(GIVE_URL);
      t.same([byAction('give-store').length, byAction('give-cards').length, byAction('give-logs').length], [0, 0, 1], 'L عامل القاعة: لا صرف من المخزن، و«دواء ليس في المخزن» له');
      await click(byAction('give-log-add')[0]);
      type(byAction('give-log-name')[0], 'فيتامين ب');
      await settle();
      await confirmGive();
      const [args] = named(rpcLog, 'give_to_flocks');
      t.same(args?.p_lines.map((line) => [line.kind, line.name, line.dose]), [['log', 'فيتامين ب', null]], 'L الجرعة الفارغة null');
    });

    // ── S: المخزن يُختار حين تكون المادّة في أكثر من مخزن، وافتراضاً أكثرها ─────────────────────────────────────────────────
    await step('S', async () => {
      const FARM = '00000000-0000-4000-8000-0000000000a2';
      const FEED = STARTER.stores[0].warehouse_id;
      const twoStores = clone(OPTIONS);
      const starter = twoStores.items.find((item) => item.item_id === STARTER.item_id);
      starter.stores = [{ warehouse_id: FARM, name: 'مخزن حقل الأمل', qty: '100.000' }, { warehouse_id: FEED, name: 'مخزن العلف', qty: '600.000' }];
      starter.on_hand_qty = '700.000';
      const rpcLog = fresh(OWNER, giveRpcs({ flock_issue_options: () => clone(twoStores) }));
      await mount(GIVE_URL);
      await click(card(VITAMIN));
      t.eq(byAction('give-stores').length, 0, 'S مادّة في مخزن واحد: لا اختيار');
      await click(card(STARTER));
      const pressed = () => byAction('give-store-pick').find((n) => n.getAttribute('aria-pressed') === 'true')?.getAttribute('data-store');
      t.same([byAction('give-store-pick').map((n) => n.textContent), pressed()], [['مخزن حقل الأمل (100 كغم)', 'مخزن العلف (600 كغم)'], FEED], 'S في مخزنين: كلّ مخزن بكميته، والمختار افتراضاً أكثرهما');
      await click(withAttr('give-store-pick', 'data-store', FARM));
      type(qtyOf(STARTER), '50');
      type(qtyOf(VITAMIN), '1');
      await settle();
      await confirmGive();
      t.same(named(rpcLog, 'give_to_flocks')[0]?.p_lines.map((line) => [line.item_id, line.warehouse_id]), [[VITAMIN.item_id, VITAMIN.stores[0].warehouse_id], [STARTER.item_id, FARM]], 'S كلّ سطر بمخزنه، والمختار باليد');
    });

    // ── T: المجموع فوق «عندك» يُمنع قبل الإرسال ──────────────────────────────────────────────────────────────────────────
    await step('T', async () => {
      const rpcLog = fresh(OWNER, giveRpcs());
      await mount(GIVE_URL);
      await click(card(STARTER));
      type(qtyOf(STARTER), '500');
      await settle();
      await click(byAction('give-others')[0]);
      await tick(hallBox(F2));
      t.eq(disabled(byAction('give-go')[0]), false, 'T ضابط: لقاعتين 1,000 كغم من 1,200 يُقبل');
      await tick(hallBox(F3));
      t.same(
        [textOf('give-missing'), disabled(byAction('give-go')[0])],
        ['مجموع ما تطلبه من «علف بادئ» 1,500 كغم، وعندك في «مخزن العلف» 1,200 كغم.', true],
        'T لثلاث قاعات المجموع فوق «عندك»: جملة تسمّي المادّة والمجموع وما عندك، والزرّ معطّل',
      );
      t.eq(named(rpcLog, 'give_to_flocks').length, 0, 'T ولا إرسال');
    });

    // ── Y: اليوم ─────────────────────────────────────────────────────────────────────────────────────────────────────
    await step('Y', async () => {
      const rpcLog = fresh(OWNER, giveRpcs());
      await mount(`/halls/give/${FLOCK}?on=2026-11-05&back=${encodeURIComponent(BACK)}`);
      t.eq(byAction('give-day')[0]?.value, '05/11/2026', 'Y ‎?on داخل المدى يوماً افتراضياً');
      await click(card(STARTER));
      type(qtyOf(STARTER), '10');
      await settle();
      await confirmGive();
      t.eq(named(rpcLog, 'give_to_flocks')[0]?.p_on, '2026-11-05', 'Y ويُرسل يوماً للإضافة');
    });
    await step('Y خارج المدى', async () => {
      fresh(OWNER, giveRpcs());
      await mount(`/halls/give/${FLOCK}?on=2026-10-01`);
      t.eq(byAction('give-day')[0]?.value, '07/11/2026', 'Y ‎?on أقدم من أقدم يوم يُقبل: اليوم بدله');
      await click(card(STARTER));
      type(qtyOf(STARTER), '10');
      type(byAction('give-day')[0], '08/11/2026');
      await settle();
      t.same([text().includes('التاريخ بعد اليوم.'), disabled(byAction('give-go')[0])], [true, true], 'Y يوم بعد اليوم يُمنع');
      type(byAction('give-day')[0], '30/10/2026');
      await settle();
      t.same([text().includes('أقدم تاريخ يُقبل 31/10/2026.'), disabled(byAction('give-go')[0])], [true, true], 'Y ويوم قبل أقدم يوم يُقبل');
    });

    // ── U: النتيجة المجهولة ────────────────────────────────────────────────────────────────────────────────────────────
    await step('U', async () => {
      const rpcLog = fresh(OWNER, giveRpcs({
        give_to_flocks: (_args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          if (n === 2) throw new m.NetworkError();
          return clone(C.give_to_flocks);
        },
      }));
      await mount(GIVE_URL);
      await twoItemsThreeHalls();
      await confirmGive();
      t.same([byAction('give-frozen').length, byAction('give-retry').length, byAction('give-go').length, byAction('give-card').length], [1, 1, 0, 0], 'U نتيجة مجهولة: الصفحة مجمَّدة بطلبها و«أعد المحاولة» وحدها');
      t.eq(tableRows('ما أُرسل')?.length, 6, 'U وتعرض ما أُرسل');
      t.eq(m.isWindowDirty(), true, 'U والنافذة «فيها ما لم يُحفظ» وهي مجمَّدة');
      await unmount();
      await mount(GIVE_URL);
      t.same([byAction('give-retry').length, byAction('give-go').length], [1, 0], 'U الرجوع ثمّ العودة: مجمَّدة بطلبها، لا نموذج بمعرّفات جديدة');
      await click(byAction('give-retry')[0]);
      t.ok(text().includes('لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.') && byAction('give-retry').length === 1, 'U إعادة لم تصل: تبقى مجمَّدة');
      await click(byAction('give-retry')[0]);
      await settle(30);
      const sent = named(rpcLog, 'give_to_flocks');
      t.same([sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0]), JSON.stringify(sent[2]) === JSON.stringify(sent[0])], [3, true, true], 'U كلّ إعادة بالنداء نفسه حرفاً (المرجع والمعرّفات والكميات)');
      t.same([globalThis.__hg.location, m.isWindowDirty()], [BACK, false], 'U ثمّ الجواب: الرجوع، والنافذة نظيفة');
      await unmount();
      fresh(OWNER, giveRpcs());
      await mount(GIVE_URL);
      t.same([byAction('give-retry').length, byAction('give-cards').length], [0, 1], 'U بعد الجواب النهائي لا طلب معلَّق');
    });
    await step('U في الطريق', async () => {
      const held = deferred();
      const rpcLog = fresh(OWNER, giveRpcs({ give_to_flocks: (_args, n) => (n === 1 ? held.promise : clone(C.give_to_flocks)) }));
      await mount(GIVE_URL);
      await click(card(STARTER));
      type(qtyOf(STARTER), '100');
      await settle();
      await click(byAction('give-go')[0]);
      await click(byAction('give-confirm')[0]);
      await click(byAction('give-confirm')[0]);
      t.same([m.isWindowDirty(), named(rpcLog, 'give_to_flocks').length], [true, 1], 'U الطلب في الطريق: النافذة «فيها ما لم يُحفظ»، ونقرة ثانية لا ترسل');
      await unmount();
      await mount(GIVE_URL);
      t.same([byAction('give-retry').length, byAction('give-go').length], [1, 0], 'U الرجوع والطلب في الطريق: مجمَّدة بطلبه');
      held.resolve(clone(C.give_to_flocks));
      await settle();
      await click(byAction('give-retry')[0]);
      await settle(30);
      const sent = named(rpcLog, 'give_to_flocks');
      t.same([sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0])], [2, true], 'U والإعادة بالنداء نفسه حرفاً');
    });
    await step('U إعادة التحميل', async () => {
      const rpcLog = fresh(OWNER, giveRpcs({ give_to_flocks: (_args, n) => (n === 1 ? Promise.reject(new m.UnknownOutcomeError()) : clone(C.give_to_flocks)) }));
      await mount(GIVE_URL);
      await twoItemsThreeHalls();
      await confirmGive();
      t.eq(byAction('give-retry').length, 1, 'U ضابط: مجمَّدة');
      await unmount();
      // نسخة ثانية من الحزمة: ذاكرة الصفحة الأولى ذهبت، وsessionStorage باقٍ كما بعد إعادة التحميل.
      current = await bundle();
      await mount(GIVE_URL);
      t.same([byAction('give-retry').length, tableRows('ما أُرسل')?.length], [1, 6], 'U بعد إعادة التحميل: مجمَّدة بالطلب من sessionStorage');
      await click(byAction('give-retry')[0]);
      await settle(30);
      const sent = named(rpcLog, 'give_to_flocks');
      t.same([sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0])], [2, true], 'U والإعادة بعدها بالنداء نفسه حرفاً (والكمية bigint محفوظة نصّاً)');
    });

    // ── X: الرفض الأكيد ──────────────────────────────────────────────────────────────────────────────────────────────
    await step('X', async () => {
      const shortage = 'مجموع ما طلبته من «علف بادئ» لقاعتين 2,000 كغم، وعندك 1,200 كغم.';
      const conflict = 'معرّفات الإضافة مستعملة في إضافة أخرى.';
      let reads = 0;
      const rpcLog = fresh(OWNER, giveRpcs({
        flock_issue_options: () => {
          reads += 1;
          return clone(OPTIONS);
        },
        give_to_flocks: (_args, n) => {
          if (n === 1) throw new m.RejectedError('insufficient_stock', shortage);
          if (n === 2) throw new m.RejectedError('id_conflict', conflict);
          return clone(C.give_to_flocks);
        },
      }));
      await mount(GIVE_URL);
      await click(card(STARTER));
      type(qtyOf(STARTER), '100');
      await settle();
      await click(byAction('give-others')[0]);
      await tick(hallBox(F2));
      await confirmGive();
      t.same([textOf('give-failure'), qtyOf(STARTER)?.value, hallBox(F2)?.checked, reads, byAction('give-retry').length], [shortage, '100', true, 2, 0], 'X الرفض بتلميح الخادم كما هو، وما كُتب باقٍ، و«ما يُصرف» تُقرأ من جديد، ولا تجميد');
      await confirmGive();
      const [one, two] = named(rpcLog, 'give_to_flocks');
      t.same([two?.p_client_ref !== one?.p_client_ref, JSON.stringify(two?.p_lines) === JSON.stringify(one?.p_lines)], [true, true], 'X الإرسال التالي بمرجع جديد ومعرّفات السطور نفسها');
      t.ok(text().includes(conflict) && text().includes('المحاولة السابقة سُجّلت أو أُلغيت'), 'X id_conflict بتلميحه');
      await confirmGive();
      const three = named(rpcLog, 'give_to_flocks')[2];
      const lineIds = (args) => args.p_lines.flatMap((line) => [line.issue_id, line.line_id]);
      t.ok(three && three.p_client_ref !== two.p_client_ref && lineIds(three).every((id) => !lineIds(two).includes(id)), 'X وبعد id_conflict معرّفات جديدة كلّها');
      t.eq(globalThis.__hg.location, BACK, 'X ثمّ يُضاف ويرجع');
    });

    // ── B: طريق الرجوع ────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const accepted = ['/broiler', '/layers/round', `/broiler/flock/${FLOCK}`, `/inventory/issue/${FLOCK}?back=%2Fbroiler%2Fflock%2F${FLOCK}`, `/halls/calendar/${FLOCK}?m=2026-11`];
      const refused = ['https://evil.example/x', '//evil.example', '/mill', '/broiler/flock/x/../y', 'javascript:alert(1)', null];
      t.same([accepted.map((value) => m.giveBack(value)), refused.map((value) => m.giveBack(value))], [accepted, refused.map(() => null)], 'B طريق الرجوع داخليّ في الحقول والسجلّ والتقويم وحده');
    }
    await step('B', async () => {
      fresh(OWNER, giveRpcs());
      await mount(`/halls/give/${FLOCK}?back=${encodeURIComponent('/broiler/round')}`);
      t.same([textOf('give-back'), byAction('give-back')[0]?.getAttribute('href')], ['رجوع إلى الجولة', '/broiler/round'], 'B «رجوع إلى الجولة»');
    });

    // ── R: التذكير ───────────────────────────────────────────────────────────────────────────────────────────────────
    const reminders = async (props = { kind: 'broiler' }) => {
      await mount('/', current.h(current.Reminders, props));
    };
    await step('R', async () => {
      fresh(OWNER, { vaccine_reminders: () => clone(C.vaccine_reminders) });
      await reminders();
      t.same(
        byAction('reminder-text').map((n) => n.textContent),
        ['ND · يوم العمر 7 · فات منذ 4 أيام: قاعة 1', 'IB · يوم العمر 7 · اليوم: قاعة 2، قاعة 3', 'غمبورو · يوم العمر 12 · غداً: قاعة 1'],
        'R المجموعات بـ(اللقاح، يوم العمر، يوم الاستحقاق) بترتيب الخادم، والفائت بعدد أيّامه',
      );
      const swatches = byAction('reminder-swatch');
      t.same([swatches.map((n) => n.getAttribute('data-color')), swatches.map((n) => n.style.backgroundColor)], [['1', '0', '2'], [1, 0, 2].map((slot) => m.vaccineColor(slot))], 'R لون اللقاح نقطةً بلونه من اللوحة');
      t.same(byAction('reminder').map((n) => n.getAttribute('data-when')), ['overdue', 'today', 'tomorrow'], 'R متى لكلّ مجموعة');
      t.eq(byAction('reminder-done').length, 3, 'R «تمّ» لمن يحفظ يوم القاعة');
    });
    await step('R تمّ مربوط', async () => {
      const MED = '00000000-0000-4000-8000-0000000000a1';
      const FARM = '00000000-0000-4000-8000-0000000000a2';
      const stock = clone(OPTIONS);
      stock.flock_id = IB.flock_id;
      stock.items.push({ item_id: IB.item.id, name: 'لقاح IB', kind: 'vaccine', cost_kind: 'vaccine', base_unit: 'pc', density_kg_per_l: null, on_hand_qty: '600.000', made_in_mill: false, stores: [{ warehouse_id: FARM, name: 'مخزن الحقل', qty: '100.000' }, { warehouse_id: MED, name: 'مخزن الأدوية', qty: '500.000' }] });
      const rpcLog = fresh(OWNER, { vaccine_reminders: () => clone(C.vaccine_reminders), flock_issue_options: () => clone(stock), give_to_flocks: () => clone(C.give_to_flocks) });
      await reminders();
      await click(byAction('reminder-done')[1]);
      await settle();
      t.same(named(rpcLog, 'flock_issue_options'), [{ p_flock: IB.flock_id }], 'R «تمّ» للقاح مربوط: مخازن المادّة و«عندك» من «ما يُصرف» لقاعة من المجموعة');
      t.same([byAction('mark-check').map((n) => n.checked), byAction('mark-store').find((n) => n.getAttribute('aria-pressed') === 'true')?.getAttribute('data-store')], [[true, true], MED], 'R قاعات المجموعة كلّها مؤشَّرة، والمخزن افتراضاً أكثرها');
      t.eq(disabled(byAction('mark-go')[0]), true, 'R بلا كمية لكلّ قاعة: معطّل');
      type(byAction('mark-qty')[0], '300');
      type(byAction('mark-qty')[1], '200');
      await settle();
      t.same([textOf('mark-go'), disabled(byAction('mark-go')[0])], ['أشّر «IB» لقاعتين', false], 'R الزرّ يسمّي ما سيحدث');
      await click(byAction('mark-go')[0]);
      await settle(30);
      const [args] = named(rpcLog, 'give_to_flocks');
      t.same(args?.p_lines.map((line) => Object.keys(line)), [0, 1].map(() => ['kind', 'flock_id', 'id', 'vaccine_id', 'age_day', 'item_id', 'issue_id', 'line_id', 'warehouse_id', 'qty']), 'R سطر vaccination ومعه جزء الصرف للقاح المربوط (والمادّة التي عُرضت)');
      t.same(
        [args?.p_on, args?.p_lines.map((line) => [line.kind, line.flock_id, line.vaccine_id, line.age_day, line.item_id, line.warehouse_id, line.qty])],
        ['2026-11-11', [['vaccination', IB.flock_id, IB.vaccine_id, 7, IB.item.id, MED, '300.000'], ['vaccination', C.vaccine_reminders.items[2].flock_id, IB.vaccine_id, 7, IB.item.id, MED, '200.000']]],
        'R اليوم يوم الخادم، ولكلّ قاعة كميتها من المخزن المختار ومادّة اللقاح كما عُرضت',
      );
      t.ok(args && new Set(args.p_lines.flatMap((line) => [line.id, line.issue_id, line.line_id])).size === 6, 'R معرّفات لكلّ قاعة');
      t.same([named(rpcLog, 'vaccine_reminders').length, globalThis.__hg.toasts.at(-1)?.title], [2, 'أُشّر «IB» لـقاعة 2، قاعة 3.'], 'R ثمّ يُقرأ التذكير من جديد، والتنبيه يسمّي اللقاح وقاعاته');
    });
    await step('R vaccine_relinked', async () => {
      // رُبط اللقاح بمادّة غير التي عرضها التذكير بعد قراءته: الخادم لا يصرف شيئاً، والتذكير يُقرأ من جديد بجملة الخادم كـvaccine_linked (العقد 0026).
      const MED = '00000000-0000-4000-8000-0000000000a1';
      const relinked = 'اللقاح «IB» صار مربوطاً بـ«لقاح IB جديد» في المخزن بعد قراءة الشاشة، فلم يُصرف شيء. حدّث الشاشة واكتب الكمية من جديد.';
      const stock = clone(OPTIONS);
      stock.flock_id = IB.flock_id;
      stock.items.push({ item_id: IB.item.id, name: 'لقاح IB', kind: 'vaccine', cost_kind: 'vaccine', base_unit: 'pc', density_kg_per_l: null, on_hand_qty: '500.000', made_in_mill: false, stores: [{ warehouse_id: MED, name: 'مخزن الأدوية', qty: '500.000' }] });
      const rpcLog = fresh(OWNER, {
        vaccine_reminders: () => clone(C.vaccine_reminders),
        flock_issue_options: () => clone(stock),
        give_to_flocks: () => {
          throw new m.RejectedError('vaccine_relinked', relinked);
        },
      });
      await reminders();
      await click(byAction('reminder-done')[1]);
      await settle();
      type(byAction('mark-qty')[0], '3');
      type(byAction('mark-qty')[1], '2');
      await settle();
      await click(byAction('mark-go')[0]);
      await settle(30);
      t.same(
        [named(rpcLog, 'give_to_flocks').length, named(rpcLog, 'vaccine_reminders').length, byAction('mark-go').length, text().includes(relinked)],
        [1, 2, 0, true],
        'R vaccine_relinked: النافذة تُغلق والتذكير يُقرأ من جديد، وجملة الخادم فوقه',
      );
    });
    await step('R تمّ غير مربوط', async () => {
      const rpcLog = fresh(OWNER, { vaccine_reminders: () => clone(C.vaccine_reminders), give_to_flocks: () => clone(C.give_to_flocks) });
      await reminders();
      await click(byAction('reminder-done')[0]);
      t.same([byAction('mark-qty').length, named(rpcLog, 'flock_issue_options').length], [0, 0], 'R غير المربوط: تأشير بلا كمية ولا مخازن');
      await click(byAction('mark-go')[0]);
      await settle(30);
      const [args] = named(rpcLog, 'give_to_flocks');
      const nd = C.vaccine_reminders.items[0];
      t.same(args?.p_lines.map((line) => [Object.keys(line), line.flock_id, line.vaccine_id, line.age_day]), [[['kind', 'flock_id', 'id', 'vaccine_id', 'age_day'], nd.flock_id, nd.vaccine_id, 7]], 'R سطر vaccination بلا جزء الصرف');
    });
    await step('R نتيجة مجهولة', async () => {
      const rpcLog = fresh(OWNER, {
        vaccine_reminders: () => clone(C.vaccine_reminders),
        give_to_flocks: (_args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          return clone(C.give_to_flocks);
        },
      });
      await reminders();
      await click(byAction('reminder-done')[0]);
      await click(byAction('mark-go')[0]);
      await settle(30);
      t.same([byAction('mark-frozen').length, byAction('mark-retry').length, byAction('reminder-done').every((n) => disabled(n)), m.isWindowDirty()], [1, 1, true, true], 'R نتيجة مجهولة: التأشير مجمَّد بـ«أعد المحاولة»، و«تمّ» مقفول، والنافذة «فيها ما لم يُحفظ»');
      await unmount();
      await reminders();
      t.eq(byAction('mark-retry').length, 1, 'R الرجوع والعودة: مجمَّد بطلبه');
      await click(byAction('mark-retry')[0]);
      await settle(30);
      const sent = named(rpcLog, 'give_to_flocks');
      t.same([sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0]), byAction('mark-frozen').length], [2, true, 0], 'R والإعادة بالنداء نفسه حرفاً، ثمّ ينفكّ');
    });
    await step('R بلا اتصال', async () => {
      fresh(OWNER, { vaccine_reminders: () => Promise.reject(new m.NetworkError()) });
      await reminders();
      t.same([byAction('reminders').length, text()], [0, ''], 'R فشل النداء (بلا نت): لا شيء');
    });
    await step('R المختصر', async () => {
      const counts = [];
      fresh(OWNER, { vaccine_reminders: () => clone(C.vaccine_reminders) });
      await reminders({ compact: true, onCount: (n) => counts.push(n) });
      t.same(byAction('today-vaccines').map((n) => [n.textContent, n.getAttribute('href')]), [['لقاحات اليوم: 3 · غداً: 1', '/broiler/round']], 'R المختصر: لقاحات اليوم (والفائت) والغد بسطر يفتح الجولة');
      t.eq(counts.at(-1), 1, 'R وعدد صفوفه للرئيسية (لا «أنجزت شغل اليوم» ولقاح ينتظر)');
      await unmount();
      const soon = clone(C.vaccine_reminders);
      soon.items = soon.items.map((item) => ({ ...item, when: 'soon' }));
      const later = [];
      fresh(OWNER, { vaccine_reminders: () => soon });
      await reminders({ compact: true, onCount: (n) => later.push(n) });
      t.same([byAction('today-vaccines').length, later.at(-1)], [0, 0], 'R ولا شيء حين لا لقاح اليوم ولا غداً');
    });

    // ── W: الجولة ─────────────────────────────────────────────────────────────────────────────────────────────────────
    await step('W', async () => {
      m.onlineStore.set(false);
      const today = m.localDay();
      const rpcLog = fresh(WORKER, { flocks_overview: () => overview(today), vaccine_reminders: () => clone(C.vaccine_reminders) });
      await mount('/broiler/round');
      const cards = all().filter((n) => n.getAttribute('data-flock'));
      t.same([cards.length, all().filter((n) => n.id.endsWith('-waterL')).length, text().includes('الماء')], [3, 0, false], 'W الجولة بكلّ القاعات القائمة، بلا خانة ماء ولا كلمة «الماء»');
      t.same(byAction('round-give').map((n) => n.getAttribute('href')), [FLOCK, F2, F3].map((id) => `/halls/give/${id}?back=%2Fbroiler%2Fround`), 'W «أضف للقاعة» لكلّ قاعة، والرجوع إلى الجولة');
      t.same([byAction('reminders').length, byAction('reminder').length], [1, 3], 'W شريط لقاحات النوع فوق الجولة');
      type(all().find((n) => n.id.endsWith('-dead')), '3');
      await settle();
      await click(byAction('round-save')[0]);
      await settle(60);
      const db = await m.openOutbox();
      const ops = await m.pendingOps(db, { userId: WORKER.workspace.userId, orgId: 'org-1', displayName: 'علي' });
      t.same(ops.map((op) => [op.flockId, Object.keys(op.payload)]), [[FLOCK, ['dead', 'culled', 'feed_kg', 'eggs_total', 'eggs_broken']]], 'W حمولة الجولة بلا water_l');
      t.eq(named(rpcLog, 'save_flock_day').length, 0, 'W ضابط: بلا نت تبقى بالجهاز');
      m.onlineStore.set(true);
    });
    await step('W بلا نت', async () => {
      const today = m.localDay();
      const rpcLog = fresh(WORKER, { flocks_overview: () => overview(today), vaccine_reminders: () => clone(C.vaccine_reminders) });
      globalThis.__hg.chunkDown = true;
      // فتح التطبيق من جديد بلا نت (نسخة جديدة من الحزمة: لا تذكير حُمّل قبل).
      current = await bundle();
      await mount('/broiler/round');
      t.same([all().filter((n) => n.getAttribute('data-flock')).length, byAction('round-save').length, byAction('reminders').length, named(rpcLog, 'vaccine_reminders').length], [3, 1, 0, 0], 'W حزمة القاعات لا تُحمَّل (بلا نت): الجولة كما هي بلا تذكير');
      await unmount();
      globalThis.__hg.chunkDown = false;
      await mount('/broiler/round');
      t.same([byAction('reminders').length, byAction('reminder').length], [1, 3], 'W وفي الفتح التالي مع الاتصال يُعاد تحميلها (الفشل لا يبقى محفوظاً)');
    });
    {
      // عملية قديمة بالطابور تحمل الماء تُرسل كما هي (العمود باقٍ في القاعدة)، والجديدة بلا ماء.
      const rpcLog = fresh(WORKER, { save_flock_day: () => ({ status: 'saved', version: 2 }) });
      const op = (payload) => ({ id: 'op-1', fn: 'save_flock_day', userId: WORKER.workspace.userId, orgId: 'org-1', displayName: 'علي', flockId: FLOCK, day: '2026-11-07', payload, baseVersion: 1, state: 'pending', attempts: 0, claimToken: null, claimedAt: null, createdAt: 1, updatedAt: 1, lastError: null });
      await m.sendFlockDay(op({ dead: 1, water_l: '50.000' }));
      await m.sendFlockDay(op({ dead: 1 }));
      t.same(named(rpcLog, 'save_flock_day').map((args) => args.p_water_l), ['50.000', null], 'W العملية القديمة ترسل مائها كما هو، والجديدة بلا ماء');
    }

    // ── GR-1 (مراجعة 0026): واي فاي بلا نت، navigator.onLine صحيح والخادم لا يصل. حزمة القاعات لا تُحمَّل، والفشل كغلاف Vite في البناء: vite:preloadError
    // ثمّ رمي، والتعافي الحقيقي (initRecovery) يسمعه. الاستيراد مرّة لكلّ فتح للجولة (لا بكلّ رسم ولا دفعاتٍ وهي ساكنة)، وفشله لا يبدأ التعافي من
    // القشرة القديمة: لا «حُمّلت نسخة جديدة» والعامل يكتب، ولا مسح للتثبيت المسبق ولا إلغاء للخدمة العاملة ولا إعادة تحميل حين يحفظ بعد عودة الاتصال.
    await step('GR-1', async () => {
      const saved = Object.fromEntries(['navigator', 'fetch', 'caches'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      const location = globalThis.window.location;
      const env = { reachable: false, reloads: 0, deleted: [], unregistered: 0 };
      const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
      define('navigator', { onLine: true, serviceWorker: { getRegistrations: async () => [{ unregister: async () => (env.unregistered += 1) > 0 }] } });
      define('fetch', async () => {
        if (!env.reachable) throw new TypeError('Failed to fetch');
        return new Response('self.addEventListener("install",()=>{})', { headers: { 'content-type': 'application/javascript' } });
      });
      define('caches', { keys: async () => ['workbox-precache-v2-http://localhost/'], delete: async (name) => env.deleted.push(name) > 0 });
      globalThis.window.location = { ...location, reload: () => (env.reloads += 1) };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const pause = async () => {
        await wait(40);
        await settle();
      };
      try {
        // نسخة جديدة من الحزمة: تعافيها ومخازنها لهذه الخطوة وحدها، والجولة تحفظ على الجهاز (onlineStore بلا اتصال، والتعافي يقرأ navigator).
        current = await bundle();
        current.initRecovery();
        current.onlineStore.set(false);
        const today = current.localDay();
        fresh(WORKER, { flocks_overview: () => overview(today), vaccine_reminders: () => clone(C.vaccine_reminders) });
        const hg = globalThis.__hg;
        hg.chunkDown = 'vite';
        await mount('/broiler/round');
        await pause();
        t.same([hg.loads, hg.preloadErrors, current.recoveryStore.get(), byAction('reminders').length, byAction('round-save').length], [1, 1, 'idle', 0, 1], 'GR-1 فتح الجولة: تحميل واحد فشل كغلاف Vite (والحدث أُطلق)، والتعافي لم يبدأ، والجولة بلا تذكير');
        type(all().find((n) => n.id.endsWith('-dead')), '7');
        await settle();
        await pause();
        t.same([hg.loads, current.isWindowDirty(), current.recoveryStore.get()], [1, true, 'idle'], 'GR-1 العامل يكتب: لا تحميل جديد بكلّ رسم، ولا «حُمّلت نسخة جديدة — احفظ عملك»');
        env.reachable = true;
        await click(byAction('round-save')[0]);
        await settle(60);
        await pause();
        t.same([current.isWindowDirty(), env.reloads, env.deleted, env.unregistered, current.recoveryStore.get()], [false, 0, [], 0, 'idle'], 'GR-1 حفظ الجولة بعد عودة الاتصال: لا مسح للتثبيت المسبق ولا إلغاء للخدمة العاملة ولا إعادة تحميل');
        await unmount();
        // فشل فوريّ (ملفّ فشل جلبه من قبل) والجولة ساكنة: تحميل واحد للفتح لا دفعات.
        hg.loads = 0;
        hg.chunkDown = 'vite-now';
        await mount('/broiler/round');
        const samples = [];
        for (let i = 0; i < 4; i += 1) {
          await wait(25);
          await settle();
          samples.push(hg.loads);
        }
        t.same([samples, hg.prevented ?? 0, current.recoveryStore.get()], [[1, 1, 1, 1], 0, 'idle'], 'GR-1 فشل فوريّ: تحميل واحد للفتح لا دفعات، والحدث لا يُلغى (الاستيراد يرفض إلى صاحبه)');
        await unmount();
        hg.chunkDown = false;
        await mount('/broiler/round');
        t.same([hg.loads, byAction('reminders').length], [2, 1], 'GR-1 والفتح التالي مع الاتصال يحمّلها مرّة ويعرض التذكير');
        // ضابط: الحدث نفسه من استيراد غير اختياريّ ما زال يبدأ التعافي (والخادم لا يصل، فلا يمسح شيئاً).
        env.reachable = false;
        globalThis.window.dispatchEvent({ type: 'vite:preloadError', cancelable: true, defaultPrevented: false, preventDefault() {}, stopPropagation() {} });
        t.eq(current.recoveryStore.get(), 'checking', 'GR-1 ضابط: vite:preloadError من استيراد آخر يبدأ التعافي كما كان');
        await pause();
      } finally {
        for (const [key, descriptor] of Object.entries(saved)) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else delete globalThis[key];
        }
        globalThis.window.location = location;
      }
    });

    // ── GR-2 (مراجعة 0026): جواب يصل بعد مغادرة الصفحة (التأكيد يقفلها، وزرّ الرجوع في أندرويد يغادرها) في الموجّه نفسه ──
    const roundRpcs = (over = {}) => giveRpcs({ flocks_overview: () => overview(m.localDay()), vaccine_reminders: () => clone(C.vaccine_reminders), ...over });
    /** يكتب كمية العلف البادئ ويؤكّد الإضافة لقاعة 1 (والجواب معلَّق)، ثمّ يغادر إلى الجولة ويكتب النافق 7. */
    const giveThenLeave = async () => {
      await mount(`/halls/give/${FLOCK}`);
      await click(card(STARTER));
      type(qtyOf(STARTER), '100');
      await settle();
      await click(byAction('give-go')[0]);
      await click(byAction('give-confirm')[0]);
      globalThis.__hg.navigate('/broiler/round');
      await settle(60);
      type(all().find((n) => n.id.endsWith('-dead')), '7');
      await settle();
    };
    const deadTyped = () => all().find((n) => n.id.endsWith('-dead'))?.value ?? null;
    await step('GR-2 نجاح بعد المغادرة', async () => {
      const held = deferred();
      m.onlineStore.set(false);
      fresh(OWNER, roundRpcs({ give_to_flocks: () => held.promise }));
      await giveThenLeave();
      const before = [globalThis.__hg.location, deadTyped()];
      held.resolve(clone(C.give_to_flocks));
      await settle(60);
      const last = globalThis.__hg.toasts.at(-1);
      t.same(
        [before, [globalThis.__hg.location, deadTyped()], last?.tone, last?.title],
        [['/broiler/round', '7'], ['/broiler/round', '7'], 'success', 'أُضيف إلى قاعة 1 يوم 11/11/2026.'],
        'GR-2 إضافة نجحت بعد مغادرة الصفحة: تنبيه النجاح وحده، ولا تنقّل يأخذ الجولة ونافقها المكتوب إلى صفحة الفوج',
      );
      m.onlineStore.set(true);
    });
    await step('GR-2 رفض بعد المغادرة', async () => {
      const held = deferred();
      const shortage = 'مجموع ما طلبته من «علف بادئ» لقاعة واحدة 100 كغم، وعندك 50 كغم.';
      m.onlineStore.set(false);
      fresh(OWNER, roundRpcs({ give_to_flocks: () => held.promise.then(() => Promise.reject(new m.RejectedError('insufficient_stock', shortage))) }));
      await giveThenLeave();
      held.resolve();
      await settle(60);
      const last = globalThis.__hg.toasts.at(-1);
      t.same(
        [globalThis.__hg.location, deadTyped(), last?.tone, last?.title, last?.detail, storage.size],
        ['/broiler/round', '7', 'danger', 'لم يُضف شيء إلى قاعة 1 يوم 07/11/2026.', shortage, 0],
        'GR-2 رفض أكيد بعد مغادرة الصفحة: تنبيه خطر يسمّي ما لم يُضف وتلميح الخادم، ولا طلب معلَّق، والجولة كما هي',
      );
      m.onlineStore.set(true);
    });
    await step('GR-2 نتيجة مجهولة بعد المغادرة', async () => {
      const held = deferred();
      m.onlineStore.set(false);
      fresh(OWNER, roundRpcs({ give_to_flocks: () => held.promise.then(() => Promise.reject(new m.UnknownOutcomeError())) }));
      await giveThenLeave();
      held.resolve();
      await settle(60);
      const last = globalThis.__hg.toasts.at(-1);
      t.same(
        [globalThis.__hg.location, last?.tone, last?.title, storage.size],
        ['/broiler/round', 'warning', 'لا نعرف إن سُجّلت الإضافة إلى قاعة 1: افتح «أضف للقاعة» لـ«قاعة 1» وأعد المحاولة؛ لن تُسجَّل مرّتين.', 1],
        'GR-2 نتيجة مجهولة بعد المغادرة: تنبيه يقول أين تُعاد، والطلب محفوظ لصفحة الإضافة',
      );
      globalThis.__hg.navigate(`/halls/give/${FLOCK}`);
      await settle(60);
      t.eq(byAction('give-retry').length, 1, 'GR-2 والعودة إلى صفحة الإضافة: مجمَّدة بطلبها');
      m.onlineStore.set(true);
    });
    await step('GR-2 «تمّ» رُفض بعد المغادرة', async () => {
      for (const [code, hint, label] of [
        ['already_vaccinated', 'أُشّر «ND» يوم العمر 7 لـ«قاعة 1» من جهاز آخر.', 'رفض يُعيد القراءة'],
        ['period_locked', 'الفترة مقفلة حتّى 31/10/2026.', 'رفض أكيد'],
      ]) {
        const held = deferred();
        fresh(OWNER, { vaccine_reminders: () => clone(C.vaccine_reminders), give_to_flocks: () => held.promise.then(() => Promise.reject(new m.RejectedError(code, hint))) });
        await reminders();
        await click(byAction('reminder-done')[0]);
        await click(byAction('mark-go')[0]);
        // غادر الجولة والتأشير في الطريق.
        await unmount();
        held.resolve();
        await settle(30);
        const last = globalThis.__hg.toasts.at(-1);
        t.same([last?.tone, last?.title, last?.detail, storage.size], ['danger', 'لم يُؤشَّر «ND» لـقاعة 1.', hint, 0], `GR-2 «تمّ» بعد مغادرة الجولة (${label}): تنبيه خطر يسمّي اللقاح وقاعته وتلميح الخادم`);
      }
    });
    await step('GR-2 «تمّ» مجهول بعد المغادرة', async () => {
      const held = deferred();
      fresh(OWNER, { vaccine_reminders: () => clone(C.vaccine_reminders), give_to_flocks: () => held.promise.then(() => Promise.reject(new m.UnknownOutcomeError())) });
      await reminders();
      await click(byAction('reminder-done')[0]);
      await click(byAction('mark-go')[0]);
      await unmount();
      held.resolve();
      await settle(30);
      const last = globalThis.__hg.toasts.at(-1);
      t.same([last?.tone, last?.title], ['warning', 'لا نعرف إن سُجّل تأشير «ND» لـقاعة 1: افتح الجولة وأعد المحاولة؛ لن يُسجَّل مرّتين.'], 'GR-2 «تمّ» بنتيجة مجهولة بعد المغادرة: تنبيه يقول أين يُعاد');
      await reminders();
      t.eq(byAction('mark-retry').length, 1, 'GR-2 والعودة إلى الجولة: التأشير مجمَّد بطلبه');
    });

    // ── X: تذكير اللقاحات بجواب القاعدة الحقيقي (fixtures/halls-0026.json من supabase/tests/halls.test بـHALLS_SAMPLES_OUT=1) ──
    const REAL_PATH = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-0026.json');
    const REAL = existsSync(REAL_PATH) ? JSON.parse(readFileSync(REAL_PATH, 'utf8')) : null;
    t.ok(REAL !== null, 'X عيّنات القاعدة الحقيقية موجودة (halls-0026.json)');
    if (REAL) {
      await step('X التذكير بجواب القاعدة', async () => {
        fresh(OWNER, { vaccine_reminders: () => clone(REAL.vaccine_reminders) });
        await reminders();
        // المجموعات من الجواب نفسه: (اللقاح، يوم العمر، يوم الاستحقاق) بترتيب الخادم، وكلّ مجموعة بقاعاتها مفصولة بفاصلة عربية.
        const groups = [];
        for (const item of REAL.vaccine_reminders.items) {
          const key = `${item.vaccine_id}|${item.age_day}|${item.due_on}`;
          const found = groups.find((group) => group.key === key);
          if (found) found.halls.push(item.hall_name);
          else groups.push({ key, name: item.name, age: item.age_day, halls: [item.hall_name] });
        }
        const texts = byAction('reminder-text').map((n) => n.textContent);
        t.same([texts.length, texts.map((text, i) => text.startsWith(`${groups[i]?.name} · يوم العمر ${groups[i]?.age}`) && text.endsWith(groups[i]?.halls.join('، ')))],
          [groups.length, groups.map(() => true)], 'X التذكير بجواب القاعدة: كلّ مجموعة باسم لقاحها ويوم عمرها وقاعاتها');
      });
    }
  } finally {
    if (root) current.flushSync(() => root.unmount());
    delete globalThis.__hg;
    if (savedStorage) Object.defineProperty(globalThis, 'sessionStorage', savedStorage);
    else delete globalThis.sessionStorage;
    restore();
  }
}
