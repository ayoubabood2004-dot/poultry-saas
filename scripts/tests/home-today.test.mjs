// «الاستخدام اليومي» (كلمة المالك 2026-11-02): بطاقة «شغل اليوم» بالرئيسية، وأزرار «ماذا تريد أن تفعل؟» بأولوية الدور،
// والشريط السفلي بالهاتف. react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل HomePage وBottomBar وTopBar الحقيقية، والطابور
// الحقيقي (saveRound وpendingOps) ونسخة الجهاز على fake-indexeddb، وقراءتا الحقول والاستلام بدائل بس (الشاشة ما تنادي الخادم).
// الحالات: D1 صفوف شغل اليوم تنبني من بيانات مصنوعة بروابطها وبصيغ الفصحى؛ D2 «أنجزت شغل اليوم» لمّا ماكو شي؛ D3 فشل قراءة
// الاستلام يخفي صفّها ولا يكسر البطاقة؛ D4 فشل قراءة الحقول سطر بـ«أعد المحاولة» ولا يكسر الصفحة، والإعادة تقرا من جديد؛
// D5 بلا نت: صفّ الجهاز يبقى وصفوف الخادم تُخفى بهدوء؛ D6 أثناء القراءة هيكل هادئ بلا أرقام؛ D7 عامل القاعة: جولته بس وبلا
// قراءة استلام؛ D8 ترتيب الأزرار لكل دور و«أعمال أخرى» مطوية والزرّ الأوّل عريض؛ D9 بنود الشريط السفلي لكل دور وmd:hidden،
// وزرّ «القائمة» يفتح الدرج، وما بقى زرّ قائمة بالشريط العلوي.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const STUBS = {
  // الحقول: الملف الحقيقي (parseOverview وغيره) ويّا قراءة واحدة بديلة، حتى loadOverviewKept ونسخة الجهاز يشتغلون كما هم.
  flocks: `export * from ${REAL_FLOCKS}; export const loadOverviewJson = () => globalThis.__home.call('loadOverviewJson', []);`,
  session: 'export const useSession = () => globalThis.__home.session;',
  Toast: 'export const toast = (spec) => { globalThis.__home.toasts.push(spec); }; export function Toaster() { return null; }',
  home: `export const loadHomeSummary = () => globalThis.__home.call('loadHomeSummary', []);
    export const countDraftReceipts = () => globalThis.__home.call('countDraftReceipts', []);`,
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter } from 'react-router-dom';",
    "export { default as HomePage, HomeActions, homeActions, HOME_ACTIONS_SHOWN } from './src/pages/home/HomePage.tsx';",
    "export { default as BottomBar, bottomItems } from './src/components/shell/BottomBar.tsx';",
    "export { TopBar } from './src/components/shell/TopBar.tsx';",
    "export { Shell } from './src/components/shell/Shell.tsx';",
    "export { localDay, addDays } from './src/domain/dates.ts';",
    "export { openOutbox, saveRound } from './src/lib/outbox/index.ts';",
    "export { NetworkError, NotConnectedError } from './src/lib/errors.ts';",
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
        name: 'home-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/Toast$|\/lib\/repo\/home$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'home-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'home-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__homeServer.fetch(...a) });
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

/** repo/home الحقيقي (countDraftReceipts) على postgrest-js حقيقي وخادم مزيّف: الطلب نفسه ينفحص. */
async function repoHome() {
  const result = await build({
    stdin: { contents: "export { countDraftReceipts } from './src/lib/repo/home.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [
      {
        name: 'home-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'home-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'home-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((node) => node.getAttribute('data-action') === name);
const text = () => body().textContent;
/** روابط صفوف «شغل اليوم» بترتيب ظهورها: [المفتاح، الرابط]. */
const taskRows = () =>
  all()
    .filter((node) => (node.getAttribute('data-action') ?? '').startsWith('today-') && node.localName === 'a')
    .map((node) => [node.getAttribute('data-action').slice('today-'.length), node.getAttribute('href')]);

export default async function (t) {
  const restore = installDom();
  try {
    const m = await screens();
    const TODAY = m.localDay();
    const ws = (over = {}) => ({
      userId: 'u-today', orgId: 'org-today', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
      divisions: ['broiler', 'layer'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
    });
    const dayRow = (over = {}) => ({ on_date: TODAY, version: 1, dead: 0, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, ...over });
    const flock = (id, kind, over = {}) => ({
      id, kind, breed: null, status: 'active', version: 1, placed_on: m.addDays(TODAY, -11), placed_count: 5000, age_days: 11,
      days_since_placement: 12, dead_total: 50, culled_total: 12, live: 4938, live_start_today: 4938, mortality_pct: '1.24', feed_kg_total: '1234.500',
      feed_days: 12, feed_span_days: 12, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
    });
    const site = (id, kind, halls) => ({ id, name: kind === 'broiler' ? 'حقل الشمال' : 'حقل البيض', division_id: `d-${kind}`, kind, can_manage: true, halls });
    const hall = (id, name, flockJson) => ({ id, name, capacity: 6000, version: 2, flock: flockJson });

    let root = null;
    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__home = {
        session,
        toasts: [],
        call(name, args) {
          calls.push(name);
          const handler = handlers[name];
          if (!handler) return new Promise(() => {});
          try {
            return Promise.resolve(handler(...args));
          } catch (error) {
            return Promise.reject(error);
          }
        },
      };
      return calls;
    };
    const mount = async (element) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: ['/'] }, element)));
      await settle(60);
      return container;
    };
    const unmount = async () => {
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
    };

    // قاعتان بلا جولة اليوم باللحم، وقاعة بالبيض وعليها ثلاث جولات مردودة؛ وقاعة جولتها محفوظة، وقاعة بلا فوج، وفوج يُسكَّن
    // غداً، وفوج بالتحضير: الثلاثة الأخيرة ما تنعدّ.
    const overview = () => ({
      today: TODAY,
      sites: [
        site('s-1', 'broiler', [
          hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: dayRow({ dead: 2 }) })),
          hall('h-2', 'قاعة 2', flock('f-b', 'broiler')),
          hall('h-3', 'قاعة 3', flock('f-c', 'broiler')),
          hall('h-4', 'قاعة 4', null),
          hall('h-5', 'قاعة 5', flock('f-d', 'broiler', { placed_on: m.addDays(TODAY, 1) })),
          hall('h-6', 'قاعة 6', flock('f-e', 'broiler', { status: 'preparing', placed_on: null })),
          hall('h-8', 'قاعة 8', flock('f-z', 'broiler', { status: 'closed' })),
        ]),
        site('s-2', 'layer', [hall('h-7', 'قاعة البيض', flock('f-l', 'layer', { rejects_pending: 3 }))]),
      ],
    });
    const done = () => ({
      today: TODAY,
      sites: [site('s-1', 'broiler', [hall('h-1', 'قاعة 1', flock('f-a', 'broiler', { today: dayRow({ dead: 1 }) }))])],
    });

    // ── D1: الصفوف تنبني من البيانات بروابطها وبصيغ الفصحى، وبطاقة شغل اليوم أوّل شي قبل الأزرار وقبل الأرقام ──
    {
      const db = await m.openOutbox();
      await m.saveRound(db, { userId: 'u-today', orgId: 'org-today', displayName: 'علي' }, { fn: 'save_flock_day', flockId: 'f-l', day: TODAY, payload: { eggs_total: 100 }, baseVersion: null });
      fresh({ status: 'ready', workspace: ws(), offline: false }, { loadOverviewJson: () => overview(), loadHomeSummary: () => ({}), countDraftReceipts: () => 2 });
      await mount(m.h(m.HomePage));
      t.same(
        taskRows(),
        [
          ['round_broiler', '/broiler/round'],
          ['round_layer', '/layers/round'],
          ['pending', '/layers/round'],
          ['rejects', '/layers'],
          ['receipt_drafts', '/inventory/receipts'],
        ],
        'D1: الصفوف الخمسة بترتيبها وروابطها (وصفّ الجهاز يفتح جولة نوع أوّل عملية)',
      );
      t.ok(text().includes('جولة حقول اللحم: قاعتان باقيتان'), `D1: «قاعتان باقيتان» بالفصحى (${text().slice(0, 120)})`);
      t.ok(text().includes('جولة حقول البيض: قاعة واحدة باقية'), 'D1: «قاعة واحدة باقية» (القاعة بلا فوج والمسكّن غداً والتحضير ما ينعدّون)');
      t.ok(text().includes('تنتظر الإرسال: جولة واحدة'), 'D1: جولة الجهاز بعدّادها');
      t.ok(text().includes('رُدّت إليك: 3 جولات'), 'D1: المردودة بصيغة 3–10');
      t.ok(text().includes('أوراق استلام تنتظر الحفظ النهائي: ورقتان'), 'D1: مسوّدات الاستلام بصيغة المثنّى');
      t.ok(!text().includes('أنجزت شغل اليوم'), 'D1: ماكو «أنجزت» وبيدك شغل');
      const page = text();
      t.ok(page.indexOf('شغل اليوم') < page.indexOf('ماذا تريد أن تفعل؟') && page.indexOf('ماذا تريد أن تفعل؟') < page.indexOf('أرقام اليوم'), 'D1: الترتيب: شغل اليوم ← ماذا تريد أن تفعل؟ ← أرقام اليوم');
      await unmount();
    }

    // ── D2: ماكو شي ← «أنجزت شغل اليوم» بسطر واحد، والبطاقة باقية ──
    {
      fresh({ status: 'ready', workspace: ws({ userId: 'u-done', divisions: ['broiler'] }), offline: false }, { loadOverviewJson: () => done(), loadHomeSummary: () => ({}), countDraftReceipts: () => 0 });
      await mount(m.h(m.HomePage));
      t.same(taskRows(), [], 'D2: ماكو صفّ (العدّاد صفر ما يصير صفّاً)');
      t.ok(text().includes('شغل اليوم') && text().includes('أنجزت شغل اليوم'), 'D2: البطاقة باقية وتقول «أنجزت شغل اليوم»');
      await unmount();
    }

    // ── D3: فشل قراءة الاستلام ← صفّها بس يُخفى، والبطاقة وباقي الصفوف كما هي ──
    {
      fresh({ status: 'ready', workspace: ws(), offline: false }, {
        loadOverviewJson: () => overview(),
        loadHomeSummary: () => ({}),
        countDraftReceipts: () => Promise.reject(new m.NetworkError()),
      });
      await mount(m.h(m.HomePage));
      t.same(taskRows().map(([key]) => key), ['round_broiler', 'round_layer', 'pending', 'rejects'], 'D3: صفّ الاستلام اختفى والباقي كما هو');
      t.ok(!text().includes('أوراق استلام') && !text().includes('تعذّر تحميل شغل اليوم'), 'D3: بلا سطر فشل ولا أثر لصفّ الاستلام');
      await unmount();
    }

    // ── D4: فشل قراءة الحقول ← «تعذّر تحميل شغل اليوم» بزرّ «أعد المحاولة»، وباقي الصفحة شغّالة، والإعادة تقرا من جديد ──
    {
      let answer = () => Promise.reject(new Error('boom'));
      const calls = fresh({ status: 'ready', workspace: ws({ userId: 'u-fail' }), offline: false }, {
        loadOverviewJson: () => answer(),
        loadHomeSummary: () => ({}),
        countDraftReceipts: () => 0,
      });
      await mount(m.h(m.HomePage));
      t.ok(text().includes('تعذّر تحميل شغل اليوم') && byAction('today-retry').length === 1, 'D4: سطر الفشل بزرّ «أعد المحاولة»');
      t.ok(text().includes('ماذا تريد أن تفعل؟') && text().includes('أرقام اليوم'), 'D4: باقي الصفحة ما انكسرت');
      t.ok(!text().includes('أنجزت شغل اليوم'), 'D4: الفشل مو «أنجزت»');
      answer = () => overview();
      fire(byAction('today-retry')[0], 'click');
      await settle(60);
      t.ok(calls.filter((name) => name === 'loadOverviewJson').length >= 2, 'D4: «أعد المحاولة» تقرا من جديد');
      t.same(taskRows().map(([key]) => key), ['round_broiler', 'round_layer', 'rejects'], 'D4: بعد الإعادة الصفوف ظهرت');
      await unmount();
    }

    // ── D5: بلا نت ويّا نسخة الجهاز ← صفّ «تنتظر الإرسال» يبقى، وصفوف الخادم تُخفى بهدوء (بلا سطر فشل) ──
    {
      fresh({ status: 'ready', workspace: ws(), offline: true }, {
        loadOverviewJson: () => Promise.reject(new m.NetworkError()),
        loadHomeSummary: () => Promise.reject(new m.NetworkError()),
        countDraftReceipts: () => Promise.reject(new m.NetworkError()),
      });
      await mount(m.h(m.HomePage));
      t.same(taskRows(), [['pending', '/layers/round']], 'D5: صفّ الجهاز بس، ونوعه من نسخة الجهاز (الفوج بيّاض)');
      t.ok(!text().includes('تعذّر تحميل شغل اليوم') && !text().includes('قاعة') && !text().includes('رُدّت إليك'), 'D5: صفوف الخادم تُخفى بهدوء من نسخة الجهاز');
      await unmount();
      // وبلا نسخة جهاز ولا قراءة: النوع من وحدات نطاقه (اللحم أوّلاً)، والصفّ يبقى
      const nocopy = { userId: 'u-nocopy', orgId: 'org-today', displayName: 'علي' };
      await m.saveRound(await m.openOutbox(), nocopy, { fn: 'save_flock_day', flockId: 'f-ghost', day: TODAY, payload: { dead: 1 }, baseVersion: null });
      fresh({ status: 'ready', workspace: ws({ userId: 'u-nocopy' }), offline: true }, {
        loadOverviewJson: () => Promise.reject(new m.NetworkError()),
        loadHomeSummary: () => Promise.reject(new m.NetworkError()),
        countDraftReceipts: () => Promise.reject(new m.NetworkError()),
      });
      await mount(m.h(m.HomePage));
      t.same(taskRows(), [['pending', '/broiler/round']], 'D5: بلا نسخة جهاز: صفّ الجهاز يبقى ونوعه من وحدات نطاقه');
      await unmount();
    }

    // ── D6: أثناء القراءة هيكل هادئ: بلا أرقام وبلا «أنجزت»، ويّا سطر للقارئ الصوتي ──
    {
      fresh({ status: 'ready', workspace: ws({ userId: 'u-slow' }), offline: false }, { loadHomeSummary: () => ({}) });
      await mount(m.h(m.HomePage));
      t.same(taskRows(), [], 'D6: ماكو صفّ قبل القراءة');
      t.ok(text().includes('جارٍ قراءة شغل اليوم') && !text().includes('أنجزت شغل اليوم'), 'D6: هيكل هادئ، ولا يكول «أنجزت» قبل القراءة');
      await unmount();
    }

    // ── D7: عامل القاعة ← جولته بس: بلا «رُدّت إليك» (ماكو flock.manage) وبلا قراءة استلام أصلاً ──
    {
      const calls = fresh({ status: 'ready', workspace: ws({ userId: 'u-worker', role: 'hall_worker', divisions: ['layer'], canSeeAccounts: false, canSeeCost: false }), offline: false }, {
        loadOverviewJson: () => overview(),
        loadHomeSummary: () => ({}),
        countDraftReceipts: () => 7,
      });
      await mount(m.h(m.HomePage));
      t.same(taskRows(), [['round_layer', '/layers/round']], 'D7: جولة حقول البيض بس (بنطاقه بيض، وبلا مردودة ولا استلام)');
      t.ok(!calls.includes('countDraftReceipts'), 'D7: ماكو قراءة استلام لمن ما يسوّي استلاماً');
      await unmount();
    }

    // ── D8: ترتيب الأزرار بأولوية الدور، وأربعة بس، والباقي خلف «أعمال أخرى» مطوية، والأوّل عريض ──
    {
      const keys = (role, over = {}) => m.homeActions({ role, canSeeAccounts: true, ...over }).map((action) => action.key);
      t.same(keys('owner').slice(0, m.HOME_ACTIONS_SHOWN), ['round_broiler', 'round_layer', 'receipt', 'payout'], 'D8: المالك: الجولة ثم الاستلام ثم الدفع');
      t.same(keys('storekeeper').slice(0, m.HOME_ACTIONS_SHOWN), ['receipt', 'use', 'transfer', 'count'], 'D8: أمين المخزن: الاستلام والصرف والنقل والجرد');
      t.same(keys('accountant').slice(0, m.HOME_ACTIONS_SHOWN), ['payout', 'payment', 'expense'], 'D8: المحاسب: الدفع والقبض والمصروف');
      t.same(keys('hall_worker', { divisions: ['broiler'] }), ['round_broiler'], 'D8: عامل القاعة: جولته بس');
      fresh({ status: 'ready', workspace: ws({ role: 'owner' }), offline: false }, {});
      await mount(m.h(m.HomeActions, { actions: m.homeActions({ role: 'owner', canSeeAccounts: true }) }));
      const links = all().filter((node) => node.localName === 'a');
      const details = all().find((node) => node.localName === 'details');
      const inDetails = (node) => {
        for (let n = node; n; n = n.parentNode) if (n === details) return true;
        return false;
      };
      t.eq(links.filter((node) => !inDetails(node)).length, m.HOME_ACTIONS_SHOWN, 'D8: أربعة أزرار ظاهرة');
      t.eq(links.filter(inDetails).length, 5, 'D8: الخمسة الباقية جوّا «أعمال أخرى»');
      t.ok(details && !details.hasAttribute('open') && text().includes('أعمال أخرى'), 'D8: «أعمال أخرى» مطوية افتراضياً');
      t.ok((links[0]?.getAttribute('class') ?? '').includes('col-span-2'), 'D8: الزرّ الأوّل عريض بالهاتف (عمودان)');
      t.ok(!(links[1]?.getAttribute('class') ?? '').includes('col-span-2'), 'D8: ضابط: الثاني بعمود واحد');
      await unmount();
    }

    // ── D9: الشريط السفلي: الرئيسية ثم الموجود من نطاقه (بحدّ أقصى ثلاثة) ثم «القائمة»، وmd:hidden، والشريط العلوي بلا قائمة ──
    {
      const items = (workspace) => m.bottomItems(workspace ? { status: 'ready', workspace, offline: false } : { status: 'loading' }).map((item) => [item.label, item.to]);
      t.same(items(ws({ role: 'owner' })), [['الرئيسية', '/'], ['الجولة', '/broiler/round'], ['المخازن', '/inventory'], ['الحسابات', '/accounts']], 'D9: المالك: الرئيسية والجولة والمخازن والحسابات');
      t.same(items(ws({ role: 'hall_worker', divisions: ['layer'], canSeeAccounts: false })), [['الرئيسية', '/'], ['الجولة', '/layers/round']], 'D9: عامل قاعة البيض: جولته بس (وجولته تفتح البيض)');
      t.same(items(ws({ role: 'storekeeper', divisions: ['feed_mill', 'general'], canSeeAccounts: false })), [['الرئيسية', '/'], ['المخازن', '/inventory']], 'D9: أمين المخزن: المخازن بلا جولة');
      t.same(items(ws({ role: 'accountant', divisions: ['general'] })), [['الرئيسية', '/'], ['المخازن', '/inventory'], ['الحسابات', '/accounts']], 'D9: المحاسب: المخازن والحسابات بلا جولة');
      t.same(items(ws({ role: 'mill_operator', divisions: ['feed_mill'], canSeeAccounts: false })), [['الرئيسية', '/'], ['المخازن', '/inventory/mill']], 'D9: مشغّل المعمل: مخزن معمله');
      t.same(items(ws({ role: 'accountant', divisions: ['broiler', 'general'] })), [['الرئيسية', '/'], ['المخازن', '/inventory'], ['الحسابات', '/accounts']], 'D9: محاسب بنطاقه حقول: بلا «الجولة» (ما يحفظ يوم الفوج)');
      t.ok([ws({ role: 'owner' }), ws({ role: 'hall_worker', divisions: ['broiler'] }), ws({ role: 'viewer' }), ws({ role: 'accountant' })].every((w) => items(w).length <= 4), 'D9: الرئيسية ويّا ثلاثة بالأكثر لكل دور (و«القائمة» بعدهم)');
      t.eq(items(null).length, 4, 'D9: بلا منشأة مؤكّدة الهيكل كلّه بحدّ أقصى أربعة');
      let menu = 0;
      fresh({ status: 'ready', workspace: ws({ role: 'owner' }), offline: false }, {});
      await mount(m.h(m.BottomBar, { onMenu: () => (menu += 1) }));
      const nav = all().find((node) => node.localName === 'nav');
      t.ok((nav?.getAttribute('class') ?? '').includes('md:hidden') && (nav?.getAttribute('class') ?? '').includes('bottom-0'), 'D9: الشريط سفلي ومخبّى من md:');
      t.same(all().filter((node) => node.localName === 'a').map((node) => node.getAttribute('href')), ['/', '/broiler/round', '/inventory', '/accounts'], 'D9: أربعة روابط بترتيبها');
      t.ok(text().includes('القائمة') && byAction('tab-menu').length === 1, 'D9: آخر بند «القائمة» زرّ مو رابط');
      fire(byAction('tab-menu')[0], 'click');
      await settle();
      t.eq(menu, 1, 'D9: «القائمة» تفتح الدرج');
      await unmount();
      fresh({ status: 'ready', workspace: ws(), offline: false }, {});
      await mount(m.h(m.TopBar));
      t.ok(!text().includes('القائمة') && all().every((node) => node.getAttribute('aria-label') !== 'القائمة'), 'D9: الشريط العلوي بلا زرّ قائمة (ماكو قائمتان)');
      await unmount();
    }

    // ── D12: بلا قاعدة مربوطة: البطاقة تقول السبب ولا تدّعي أن الشغل أنجز ──
    {
      fresh({ status: 'not_configured' }, {
        loadHomeSummary: () => Promise.reject(new m.NotConnectedError()),
        countDraftReceipts: () => Promise.reject(new m.NotConnectedError()),
      });
      await mount(m.h(m.HomePage));
      t.ok(text().includes('لا تظهر مهامّ اليوم حتى تُربط قاعدة البيانات'), 'D12: بلا قاعدة: البطاقة تقول السبب');
      t.ok(!text().includes('أنجزت شغل اليوم') && !text().includes('تعذّر تحميل شغل اليوم'), 'D12: ولا تكول «أنجزت» ولا تعرض فشلاً');
      await unmount();
    }

    // ── D11: القشرة تجيب الشريط السفلي (حزمة كسولة) وتترك مكاناً تحته بالهاتف ──
    {
      fresh({ status: 'ready', workspace: ws({ role: 'owner' }), offline: false }, {});
      await mount(m.h(m.Shell, null, m.h('p', null, 'محتوى')));
      await settle(60);
      const bar = all().find((node) => node.localName === 'nav' && (node.getAttribute('class') ?? '').includes('bottom-0'));
      t.ok(bar && (bar.getAttribute('class') ?? '').includes('md:hidden'), 'د11: القشرة رسمت الشريط السفلي بالهاتف');
      t.ok(bar && descendants(bar).some((node) => node.getAttribute('data-action') === 'tab-menu'), 'د11: وبيه زرّ القائمة');
      const main = all().find((node) => node.localName === 'main');
      t.ok(main && main.children.some((node) => node.localName === 'div' && (node.getAttribute('class') ?? '') === 'h-16 md:hidden'), 'د11: فاصل سفلي بالهاتف حتى المحتوى ما ينخبّى تحت الشريط');
      t.ok(descendants(all().find((node) => node.localName === 'header') ?? body()).every((node) => node.getAttribute('aria-label') !== 'القائمة'), 'د11: وماكو زرّ قائمة بالشريط العلوي');
      await unmount();
    }
  } finally {
    delete globalThis.__home;
    restore();
  }

  // ── D10: عدّ مسوّدات الاستلام من repo الحقيقي: رأس بلا صفوف ومفلتر بالمسوّدات بس ──
  {
    const savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
    try {
      const repo = await repoHome();
      const server = (globalThis.__homeServer = {
        calls: [],
        async fetch(url, init) {
          server.calls.push({ url: String(url), method: init?.method ?? 'GET', prefer: init?.headers?.Prefer ?? init?.headers?.prefer ?? '' });
          return new Response(null, { status: 200, headers: { 'content-range': '*/7', 'content-type': 'application/json' } });
        },
      });
      t.eq(await repo.countDraftReceipts(), 7, 'D10: العدد من رأس content-range (بلا سحب صفوف)');
      const call = server.calls[0] ?? {};
      t.ok(call.url.includes('/receipts?') && call.url.includes('status=eq.draft'), `D10: الطلب على receipts بفلتر المسوّدات (${call.url})`);
      t.ok(call.method === 'HEAD' && String(call.prefer).includes('count=exact'), `D10: رأس بس بعدّ دقيق (${call.method}، ${call.prefer})`);
    } finally {
      delete globalThis.__homeServer;
      if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav);
      else delete globalThis.navigator;
    }
  }
}
