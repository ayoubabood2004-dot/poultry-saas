// «بلا يوم التشغيل» (كلمة المالك 2026-11-06: «ما النا علاقة بيوم التشغيل خليها من دون يوم التشغيل»؛ والقاعدة بلاه منذ 0018):
// G1 لا نصّ معروض في الواجهة يطلب يوم التشغيل أو يشرح شيئاً به (مسح كلّ نصوص t() وTrans في src)؛ G2 «الأرصدة عند البداية» تُكتب
// لدفتر وحدة بلا يوم تشغيل، بتاريخ الصفحة (اليوم افتراضياً، أو ما كُتب)، والمستقبل يُرفض قبل الإرسال — react-dom/client الحقيقي على
// DOM صغير (dom.mjs) يشغّل الصفحة الحقيقية، وrepo الجهات والجلسة بدائل؛ G3 نافذة الرصيد الافتتاحي للصندوق ونموذج الرصيد عند
// البداية للمخزن يقولان القاعدة الجديدة «اليوم أو قبله، وليس في فترة مقفلة».
import { build } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__ngl.call('${n}', a);`).join(' ')}`;
const STUBS = {
  parties: routed('parties', ['listBooks', 'loadPartyBalances', 'recordOpeningBalance', 'voidPartyEntry']),
  inventory: routed('inventory', ['loadOrgSetup', 'listStockDocs']),
  counts: `export * from ${real('counts')}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  session: 'export const useSession = () => globalThis.__ngl.session; export const sessionStore = { get: () => globalThis.__ngl?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__ngl.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'ngl-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(parties|inventory|counts)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'ngl-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'ngl-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as OpeningBalancesPage } from './src/pages/accounts/OpeningBalancesPage.tsx';",
    "export { OpeningDialog } from './src/pages/accounts/CashPage.tsx';",
    "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { parsePartyBalances } from './src/lib/repo/parties.ts';",
    "export { localDay } from './src/domain/dates.ts';",
    "export { fmtDay } from './src/lib/format.ts';",
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
    plugins: [stubs],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** كلّ ملفات src بالشفرة (ts وtsx). */
function sources(dir = path.join(ROOT, 'src')) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/u.test(name) ? [full] : [];
  });
}

const GO_LIVE = /يوم (ال)?تشغيل|حدّد يوم التشغيل/u;

export default async function (t) {
  // ── G1: لا نصّ معروض يذكر يوم التشغيل ─────────────────────────────────────────────────────────────────────────
  {
    const texts = [];
    for (const file of sources()) {
      const code = readFileSync(file, 'utf8');
      for (const match of code.matchAll(/\bt\(\s*'([^']+)'\s*,\s*'([^']*)'/gu)) texts.push([path.relative(ROOT, file), match[1], match[2]]);
      for (const match of code.matchAll(/<Trans\s+k="([^"]+)"\s+text="([^"]*)"/gu)) texts.push([path.relative(ROOT, file), match[1], match[2]]);
    }
    const offending = texts.filter(([, , text]) => GO_LIVE.test(text));
    t.ok(texts.length > 2000, `G1: المسح قرأ نصوص الواجهة كلّها (${texts.length})`);
    t.same(offending.map(([file, key]) => `${file}: ${key}`), [], 'G1: لا نصّ معروض يذكر «يوم التشغيل» (لا طلب تحديده ولا شرح به)');
  }

  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    const body = () => globalThis.document.body;
    const all = () => descendants(body());
    const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
    const text = () => body().textContent;
    const type = (input, value) => {
      input.value = value;
      fire(input, 'input');
    };
    const click = async (node) => {
      fire(node, 'click');
      await settle();
    };
    const ws = (role) => ({
      userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
      divisions: ['feed_mill', 'general'], canSeeCost: true, canSeeAccounts: true, canSeeSales: false, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__ngl = {
        session,
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
      };
      return calls;
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (element, url = '/') => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, element)));
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
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };

    // ── G2: الأرصدة عند البداية لدفتر وحدة بلا يوم تشغيل، بتاريخ الصفحة ─────────────────────────────────────────────
    const books = [{ id: 'b-mill', divisionId: 'd-mill', divisionKind: 'feed_mill', code: 'main', name: 'المعمل', goLiveOn: null }];
    const balances = () =>
      m.parsePartyBalances({
        books: [{ book_id: 'b-mill', division_id: 'd-mill', division_kind: 'feed_mill', code: 'main', name: 'المعمل' }],
        rows: [{ party_id: 'p-1', name: 'مورّد الحبوب', name_norm: 'مورد الحبوب', phone: null, is_customer: false, is_supplier: true, archived: false, version: 1, total: '0', oldest: null, cells: [{ book_id: 'b-mill', opening: '0', debit: '0', credit: '0', closing: '0', oldest: null, opening_entry_id: null, opening_amount: null }] }],
        next: null,
        total: 1,
      });
    await step('G2', async () => {
      const calls = fresh({ status: 'ready', workspace: ws('manager') }, { listBooks: () => books, loadPartyBalances: () => balances(), recordOpeningBalance: (ref) => ({ id: ref.id }) });
      await mount(m.h(m.OpeningBalancesPage));
      t.ok(!GO_LIVE.test(text()), `G2: لا «حدّد يوم التشغيل أوّلاً» ولا ذكر له (${text().slice(0, 300)})`);
      const today = m.fmtDay(m.localDay());
      const day = all().find((n) => n.localName === 'input' && n.value === today);
      t.ok(Boolean(day) && byAction('openings-day').length === 1, 'G2: حقل «تاريخ الأرصدة» بتاريخ اليوم');
      // الخانة تُقرأ من جديد بعد كلّ حفظ: الجدول يُقرأ من جديد فيُرسم من جديد.
      const amountInput = () => all().find((n) => n.localName === 'input' && (n.getAttribute('aria-label') ?? '').startsWith('الرصيد عند البداية لـ'));
      t.ok(Boolean(amountInput()), 'G2: خانة الدفتر تُكتب ولو بلا يوم تشغيل');
      type(amountInput(), '500,000');
      await settle();
      await click(byAction('save-opening')[0]);
      await settle();
      const first = named(calls, 'recordOpeningBalance')[0]?.[1];
      t.same(first && { bookId: first.bookId, amount: first.amount, onDate: first.onDate }, { bookId: 'b-mill', amount: 50_000_000n, onDate: m.localDay() }, 'G2: الحفظ بتاريخ الصفحة (اليوم) لا بيوم التشغيل');
      type(all().find((n) => n.localName === 'input' && n.value === today), '01/10/2026');
      await settle();
      type(amountInput(), '250,000');
      await settle();
      await click(byAction('save-opening')[0]);
      await settle();
      t.eq(named(calls, 'recordOpeningBalance')[1]?.[1]?.onDate, '2026-10-01', 'G2: وبالتاريخ المكتوب');
      const tomorrow = new Date(Date.now() + 2 * 86_400_000);
      type(all().find((n) => n.localName === 'input' && n.value === '01/10/2026'), `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`); // date-ok: يوم بعد غد للفحص
      type(amountInput(), '100');
      await settle();
      t.ok(text().includes('التاريخ بعد اليوم.') && byAction('save-opening')[0]?.hasAttribute('disabled') === true, 'G2: التاريخ بعد اليوم يُرفض و«سجّل» معطّل');
    });

    // ── G3: الرصيد الافتتاحي للصندوق والمخزن بالقاعدة الجديدة ────────────────────────────────────────────────────────
    await step('G3-cash', async () => {
      fresh({ status: 'ready', workspace: ws('manager') }, {});
      await mount(m.h(m.OpeningDialog, { box: { accountId: 'c-1', name: 'الصندوق الرئيسي', kind: 'cash', archived: false, version: 1, hasOpening: false, opening: 0n, inflow: 0n, outflow: 0n, closing: 0n }, onClose() {}, onSaved() {} }));
      t.ok(text().includes('اليوم أو قبله، وليس في فترة مقفلة.') && !GO_LIVE.test(text()), `G3: نافذة رصيد الصندوق: «اليوم أو قبله، وليس في فترة مقفلة» (${text().slice(0, 300)})`);
    });
    await step('G3-stock', async () => {
      const org = { divisions: [{ id: 'd-gen', kind: 'general', goLiveOn: null, frozen: false }], sites: [], packTypes: [], itemCategories: [], expenseCategories: [], warehouses: [{ id: 'w-gen', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-gen', name: 'المخزن العامّ', kind: 'general', hasBalance: false }] };
      fresh({ status: 'ready', workspace: ws('manager') }, { loadOrgSetup: () => org, listStockDocs: () => ({ rows: [], next: null, total: 0 }) });
      await mount(m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) })), '/inventory/openings');
      t.ok(text().includes('اليوم أو قبله، وليس في فترة مقفلة') && !GO_LIVE.test(text()), `G3: الرصيد عند البداية للمخزن بالقاعدة الجديدة (${text().slice(0, 300)})`);
    });
  } finally {
    if (root) {
      try {
        root.unmount();
      } catch {
        /* swallow-ok: تنظيف بعد رمية */
      }
    }
    delete globalThis.__ngl;
    restore();
  }
}
