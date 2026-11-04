// المصروف المحمَّل على العلف (عقد «المعمل، النسخة الثانية» ش-أ ٦، كلمة المالك D2 «حصّة العلف فقط»): react-dom/client الحقيقي على DOM
// صغير (dom.mjs) يشغّل شاشة المصاريف الحقيقية، وrepo الصناديق والجهات والجلسة بدائل. كل حالة تفشل على الشفرة قبلها:
// X1 صفّ المصروف الذي حُمِّل منه على دفعات الإنتاج يقول «محمَّل على العلف: س» (من allocated بالخادم)، والصفّ بلا تحميل لا يقول؛
// X2 نافذة إلغائه تنبّه قبل الإلغاء، والإلغاء المرفوض (expense_allocated) يعرض تلميح الخادم الذي يسمّي الدفعة، والنافذة باقية؛
// X3 القارئ: allocated بالفلس، والفارغ صفر، والغائب خطأ شكل.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__exp.call('${n}', a);`).join(' ')}`;
const STUBS = {
  cash: routed('cash', ['loadExpenses', 'voidExpense', 'listExpenseCategories', 'loadCashBalances']),
  parties: routed('parties', ['listBooks']),
  session: 'export const useSession = () => globalThis.__exp.session; export const sessionStore = { get: () => globalThis.__exp?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__exp.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'expense-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(cash|parties)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'expense-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'expense-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const result = await build({
    stdin: {
      contents: [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter } from 'react-router-dom';",
        "export { default as ExpensesPage, allocatedText, allocatedVoidWarning } from './src/pages/accounts/ExpensesPage.tsx';",
        "export { parseExpenseReport } from './src/lib/repo/cash.ts';",
        "export { RejectedError } from './src/lib/errors.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'tsx',
    },
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

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const text = () => body().textContent;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const ws = { userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [], divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1 };
    const row = (over) => ({
      id: 'e-1', onDate: '2026-11-01', forMonth: '2026-11-01', categoryId: 'c-labor', categoryName: 'أيدي عاملة', systemCode: null, divisionId: 'd-mill', source: 'cash',
      accountName: 'الصندوق الرئيسي', partyName: null, bookCode: null, siteName: null, docKind: null, docId: null, docNo: null, note: 'أجور تشرين الثاني', reason: null,
      reverses: null, reversed: false, amount: 300_000_00n, allocated: 120_000_00n, ...over,
    });
    const report = {
      from: '2026-11-01', to: '2026-11-04', divisions: { visible: 1, total: 1 }, next: null,
      rows: [row({}), row({ id: 'e-2', categoryId: 'c-power', categoryName: 'كهرباء', note: 'فاتورة', amount: 50_000_00n, allocated: 0n })],
      totals: { total: 350_000_00n, count: 2, byCategory: [], bySource: [], byMonth: [] },
    };
    const fresh = (handlers) => {
      const calls = [];
      globalThis.__exp = {
        session: { status: 'ready', workspace: ws },
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
    let root = null;
    const mount = async () => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: ['/accounts/expenses'] }, m.h(m.ExpensesPage))));
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
        await unmount();
      }
    };
    const books = [{ id: 'b-mill', divisionId: 'd-mill', divisionKind: 'feed_mill', code: 'feed_mill', name: 'المعمل', goLiveOn: '2026-10-01' }];
    const handlers = (over = {}) => ({ loadExpenses: () => report, listBooks: () => books, ...over });

    // ── X1: «محمَّل على العلف: س» بصفّ المصروف ─────────────────────────────────────────────────────────────────
    await step('X1', async () => {
      fresh(handlers());
      await mount();
      const cells = all().filter((n) => n.nodeName === 'TR');
      const labor = cells.find((tr) => tr.textContent.includes('أجور تشرين الثاني'));
      const power = cells.find((tr) => tr.textContent.includes('فاتورة'));
      t.ok(labor?.textContent.includes('محمَّل على العلف: 120,000.00'), `X1: المصروف المحمَّل يقول كم أخذ العلف منه (${labor?.textContent})`);
      t.ok(power && !power.textContent.includes('محمَّل على العلف'), 'X1: والمصروف بلا تحميل لا يقول');
      await unmount();
    });

    // ── X2: نافذة الإلغاء تنبّه، والرفض يعرض تلميح الخادم ────────────────────────────────────────────────────────
    await step('X2', async () => {
      const hint = 'من هذا المصروف 120,000 محمَّلة على دفعة الإنتاج PD-2026-0003؛ ألغِ الدفعة أوّلاً';
      const calls = fresh(handlers({ voidExpense: () => { throw new m.RejectedError('expense_allocated', hint); } }));
      await mount();
      const labor = all().filter((n) => n.nodeName === 'TR').find((tr) => tr.textContent.includes('أجور تشرين الثاني'));
      const button = descendants(labor).find((n) => n.getAttribute('data-action') === 'void-expense');
      fire(button, 'click');
      await settle();
      t.ok(text().includes('من هذا المصروف 120,000.00 محمَّلة على دفعات إنتاج العلف؛ يُرفض إلغاؤه حتى تُلغى تلك الدفعات.'), `X2: النافذة تنبّه قبل الإلغاء (${text().slice(-400)})`);
      const reason = all().find((n) => n.nodeName === 'INPUT' && n.id.endsWith('-reason'));
      type(reason, 'سُجّل خطأً');
      await settle();
      fire(byAction('confirm-void')[0], 'click');
      await settle();
      await settle();
      t.eq(calls.filter(([name]) => name === 'voidExpense').length, 1, 'X2: الإلغاء أُرسل');
      t.ok(text().includes(hint), `X2: والرفض يعرض تلميح الخادم الذي يسمّي الدفعة (${text().slice(-300)})`);
      t.eq(byAction('confirm-void').length, 1, 'X2: والنافذة باقية (لم يُلغَ شيء)');
      await unmount();
    });
    await step('X2-plain', async () => {
      fresh(handlers());
      await mount();
      const power = all().filter((n) => n.nodeName === 'TR').find((tr) => tr.textContent.includes('فاتورة'));
      fire(descendants(power).find((n) => n.getAttribute('data-action') === 'void-expense'), 'click');
      await settle();
      t.ok(text().includes('يُلغى مصروف «كهرباء»') && !text().includes('محمَّلة على دفعات إنتاج العلف'), 'X2: ضابط: مصروف بلا تحميل بلا تنبيهه');
      await unmount();
    });

    // ── X3: القارئ ────────────────────────────────────────────────────────────────────────────────────────────
    const json = (over) => ({
      from: '2026-11-01', to: '2026-11-04', divisions: { visible: 1, total: 1 }, next: null,
      rows: [{ id: 'e-1', on_date: '2026-11-01', for_month: '2026-11-01', category_id: 'c', category_name: 'أيدي عاملة', system_code: null, division_id: 'd', source: 'cash', account_name: 'ص', party_name: null, book_code: null, site_name: null, doc_kind: null, doc_id: null, doc_no: null, note: null, reason: null, reverses: null, reversed: false, amount: '300000.00', ...over }],
      totals: { total: '300000.00', count: 1, by_category: [], by_source: [], by_month: [] },
    });
    const shape = (fn) => {
      try {
        fn();
        return 'ok';
      } catch (error) {
        return String(error?.message ?? error);
      }
    };
    t.same(
      [m.parseExpenseReport(json({ allocated: '120000.50' })).rows[0].allocated, m.parseExpenseReport(json({ allocated: '0' })).rows[0].allocated, m.parseExpenseReport(json({ allocated: null })).rows[0].allocated],
      [12_000_050n, 0n, 0n],
      'X3: allocated بالفلس، والصفر والفارغ صفر',
    );
    t.ok(shape(() => m.parseExpenseReport(json({}))) !== 'ok', 'X3: وغيابه خطأ شكل لا صفر صامت');
    t.same([m.allocatedText({ allocated: 0n }), m.allocatedVoidWarning({ allocated: 0n }), m.allocatedText({ allocated: 120_000_00n })], [null, null, 'محمَّل على العلف: 120,000.00'], 'X3: النصّ للمحمَّل وحده');
  } finally {
    delete globalThis.__exp;
    restore();
  }
}
