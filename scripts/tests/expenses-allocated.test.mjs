// المصروف المحمَّل على العلف (عقد «المعمل، النسخة الثانية» ش-أ ٦، كلمة المالك D2 «حصّة العلف فقط»): react-dom/client الحقيقي على DOM
// صغير (dom.mjs) يشغّل شاشة المصاريف الحقيقية، وrepo الصناديق والجهات والجلسة بدائل. كل حالة تفشل على الشفرة قبلها:
// X1 صفّ المصروف الذي حُمِّل منه على دفعات الإنتاج يقول «محمَّل على العلف: س» (من allocated بالخادم)، والصفّ بلا تحميل لا يقول؛
// X2 نافذة إلغائه تنبّه قبل الإلغاء، والإلغاء المرفوض (expense_allocated) يعرض تلميح الخادم الذي يسمّي الدفعة، والنافذة باقية؛
// X3 القارئ: allocated بالفلس، والفارغ صفر، والغائب خطأ شكل.
// ومن مراجعة المعمل v2 (ع١، الملاحظة #16: «سجّل مصروفاً» في دفعة الإنتاج يفتح نافذة فارغة بلا رجوع):
// X4 ‎?new=1&division&category&amount&back تعبّئ النافذة (الوحدة والفئة والمبلغ بالدينار الصحيح) وتقول تحت الوحدة إنّ تكاليف
//    الدفعة من مصاريف وحدة مخزن موادّها، وبعد الحفظ الناجح ترجع إلى الدفعة مكان الصفحة في السجلّ؛ X5 القيم غير الصالحة أو خارج
//    النطاق تُتجاهل بلا رمي، وback غير /mill/batch/ لا يُتبع (الصفحة تبقى كما كانت وتُحدَّث)؛ X6 مبلغ بفلوس لا يُقرَّب عنه بل
//    يُذكر تحت الحقل، وتغيير الوحدة عن وحدة الدفعة ينبّه؛ X7 الوحدة خارج نطاق المستخدم لا تُعبّأ؛ X8 الإغلاق يشيل وسائط
//    التعبئة فـ«مصروف جديد» بعده فارغة؛ X9 الدوالّ الصافية safeBack وexpensePrefill.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, OptionElement, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__exp.call('${n}', a);`).join(' ')}`;
const STUBS = {
  cash: routed('cash', ['loadExpenses', 'voidExpense', 'listExpenseCategories', 'loadCashBalances', 'recordExpense']),
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
        "export { MemoryRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';",
        "export { default as ExpensesPage, allocatedText, allocatedVoidWarning } from './src/pages/accounts/ExpensesPage.tsx';",
        // الدوالّ الجديدة (ع١) من مساحة الاسم: غيابها في الشفرة القديمة يُفشل فحوصها ولا يوقف الحزم.
        "export * as page from './src/pages/accounts/ExpensesPage.tsx';",
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
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const text = () => body().textContent;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};
/** قيمة قائمة اختيار كما رسمها React (الخيار المختار؛ DOM الفحص بلا value للقائمة). */
const picked = (select) => (select ? (select.value ?? select.options.find((option) => option.selected)?.getAttribute('value')) : undefined);

/**
 * خيار واحد مختار في القائمة كما في المتصفّح: React يختار الخيار الجديد حين تصل الفئات بعد الرسم الأوّل، وDOM الفحص يُبقي الخيار
 * الأوّل مختاراً معه فيُقرأ الفارغ. يُرجَّع كما كان بعد الملف (الفحوص بعملية واحدة).
 */
function exclusiveOptions() {
  const saved = Object.getOwnPropertyDescriptor(OptionElement.prototype, 'selected');
  Object.defineProperty(OptionElement.prototype, 'selected', {
    configurable: true,
    get() {
      return this.__picked === true;
    },
    set(value) {
      if (value) {
        let select = this.parentNode;
        while (select && select.localName !== 'select') select = select.parentNode;
        if (select) for (const option of select.options) if (option !== this) option.__picked = false;
      }
      this.__picked = Boolean(value);
    },
  });
  return () => {
    if (saved) Object.defineProperty(OptionElement.prototype, 'selected', saved);
    else delete OptionElement.prototype.selected;
  };
}

export default async function (t) {
  const restore = installDom();
  const restoreOptions = exclusiveOptions();
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
    let where = null;
    let how = null;
    function Probe() {
      where = m.useLocation();
      how = m.useNavigationType();
      return null;
    }
    const mount = async (url = '/accounts/expenses') => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() =>
        root.render(
          m.h(
            m.MemoryRouter,
            { initialEntries: [url] },
            m.h(Probe),
            m.h(m.Routes, null, m.h(m.Route, { path: '/accounts/expenses', element: m.h(m.ExpensesPage) }), m.h(m.Route, { path: '/mill/batch/:id', element: m.h('p', null, 'صفحة الدفعة') })),
          ),
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

    // ── X4–X8: «سجّل مصروفاً» من دفعة الإنتاج (ع١) ──────────────────────────────────────────────────────────────
    const books2 = [...books, { id: 'b-gen', divisionId: 'd-gen', divisionKind: 'general', code: 'general', name: 'العامّة', goLiveOn: '2026-10-01' }];
    const categories = [
      { id: 'c-labor', name: 'أيدي عاملة', systemCode: null, archived: false },
      { id: 'c-power', name: 'كهرباء', systemCode: null, archived: false },
      { id: 'c-sys', name: 'فرق جرد', systemCode: 'count_diff', archived: false },
      { id: 'c-old', name: 'قديمة', systemCode: null, archived: true },
    ];
    const boxes = { asOf: '2026-11-04', accounts: [{ accountId: 'a-1', name: 'الصندوق الرئيسي', kind: 'cash', archived: false, version: 1, hasOpening: true, opening: 0n, inflow: 0n, outflow: 0n, closing: 500_000_00n }] };
    const entry = (over = {}) => handlers({ listBooks: () => books2, listExpenseCategories: () => categories, loadCashBalances: () => boxes, recordExpense: () => ({ id: 'e-new' }), ...over });
    const field = (suffix) => byIdSuffix(suffix).find((n) => n.nodeName === 'SELECT' || n.nodeName === 'INPUT');
    const dialogForm = () => all().find((n) => n.nodeName === 'FORM' && n.id.endsWith('-form'));
    const BATCH = '/accounts/expenses?new=1&division=d-mill&category=c-labor&amount=30000.00&back=/mill/batch/b-1';
    const HINT = 'تكاليف الدفعة تُحمَّل من مصاريف وحدة مخزن موادّها.';
    const submitAndConfirm = async () => {
      fire(dialogForm(), 'submit');
      await settle();
      fire(byAction('confirm-expense')[0], 'click');
      await settle();
      await settle();
    };

    await step('X4', async () => {
      const calls = fresh(entry());
      await mount(BATCH);
      t.same([picked(field('-division')), picked(field('-category')), field('-amount')?.value], ['d-mill', 'c-labor', '30,000'], `X4: النافذة معبّأة بالوحدة والفئة والمبلغ (${text().slice(-500)})`);
      t.ok(text().includes(HINT), 'X4: وتحت الوحدة: تكاليف الدفعة من مصاريف وحدة مخزن موادّها');
      choose(field('-box'), 'a-1');
      await settle();
      await submitAndConfirm();
      const sent = calls.filter(([name]) => name === 'recordExpense').map(([, args]) => args[1]);
      t.same(sent.map((input) => [input.divisionId, input.categoryId, input.amount, input.source, input.accountId]), [['d-mill', 'c-labor', 3_000_000n, 'cash', 'a-1']], 'X4: الحفظ بالوحدة والفئة والمبلغ المعبّأة');
      t.same([where?.pathname, where?.search], ['/mill/batch/b-1', ''], `X4: وبعد الحفظ الناجح يرجع إلى الدفعة (${where?.pathname}${where?.search})`);
      t.ok(text().includes('صفحة الدفعة'), 'X4: وصفحة الدفعة هي المعروضة');
      // مكان صفحة المصاريف في السجلّ (REPLACE لا PUSH): زرّ الرجوع لا يفتح النافذة المعبّأة ثانيةً فيُسجَّل المصروف مرّتين.
      t.eq(how, 'REPLACE', 'X4: والرجوع يحلّ محلّ الصفحة المعبّأة في السجلّ');
      t.ok(globalThis.__exp.toasts.some((spec) => spec.title === 'سُجّل المصروف، وعُدتَ إلى دفعة الإنتاج.'), 'X4: برسالة تقول إنّ المصروف سُجّل');
      await unmount();
    });
    await step('X5', async () => {
      const calls = fresh(entry());
      await mount('/accounts/expenses?new=1&division=d-other&category=c-sys&amount=abc&back=https://evil.example/mill/batch/b-1');
      t.same([picked(field('-division')), picked(field('-category')), field('-amount')?.value], ['', '', ''], 'X5: وحدة ليست في النطاق وفئة نظامية ومبلغ غير صالح: كلّها تُتجاهل بلا رمي');
      t.ok(!text().includes(HINT), 'X5: وبلا رجوع إلى دفعة ولا وحدة معمل: لا تلميح الدفعة');
      choose(field('-division'), 'd-gen');
      choose(field('-category'), 'c-power');
      type(field('-amount'), '5000');
      choose(field('-box'), 'a-1');
      await settle();
      const reads = calls.filter(([name]) => name === 'loadExpenses').length;
      await submitAndConfirm();
      t.eq(calls.filter(([name]) => name === 'recordExpense').length, 1, 'X5: الحفظ كتب المصروف');
      t.same([where?.pathname, where?.search], ['/accounts/expenses', ''], `X5: ورابط رجوع إلى خارج التطبيق لا يُتبع: الصفحة نفسها بلا وسائط التعبئة (${where?.pathname}${where?.search})`);
      t.ok(calls.filter(([name]) => name === 'loadExpenses').length > reads && byAction('review-expense').length === 0, 'X5: والنافذة أُغلقت والقائمة تُقرأ من جديد كما كانت');
      await unmount();
      for (const back of ['/accounts', '/mill/batch/b-1/../../accounts', '//evil.example/mill/batch/b-1']) {
        fresh(entry());
        await mount(`/accounts/expenses?new=1&division=d-mill&category=c-labor&amount=100&back=${encodeURIComponent(back)}`);
        choose(field('-box'), 'a-1');
        await settle();
        await submitAndConfirm();
        t.eq(where?.pathname, '/accounts/expenses', `X5: back=${back} لا يُتبع`);
        await unmount();
      }
    });
    await step('X5-category', async () => {
      // الفئة غير القابلة للاختيار (مؤرشفة أو نظامية) لا تُعرض فحسب بل لا تُرسل: الحفظ بلا اختيار يطلب التصنيف.
      for (const category of ['c-old', 'c-sys']) {
        const calls = fresh(entry());
        await mount(`/accounts/expenses?new=1&division=d-mill&category=${category}&amount=100`);
        t.same([picked(field('-division')), picked(field('-category')), field('-amount')?.value], ['d-mill', '', '100'], `X5: فئة ${category} لا تُختار، والباقي يُعبّأ`);
        choose(field('-box'), 'a-1');
        await settle();
        fire(dialogForm(), 'submit');
        await settle();
        t.ok(text().includes('اختر التصنيف.') && byAction('confirm-expense').length === 0, `X5: والحفظ يطلب التصنيف ولا يرسل ${category}`);
        t.eq(calls.filter(([name]) => name === 'recordExpense').length, 0, `X5: ولا مصروف بالفئة ${category}`);
        await unmount();
      }
    });
    await step('X6', async () => {
      fresh(entry());
      await mount('/accounts/expenses?new=1&division=d-mill&category=c-labor&amount=2448.75&back=/mill/batch/b-1');
      t.eq(field('-amount')?.value, '', 'X6: مبلغ بفلوس لا يُكتب في حقل الدينار الصحيح ولا يُقرَّب عنه');
      t.ok(text().includes('المطلوب 2,448.75 دينار، والمصروف يُسجَّل بالدينار الصحيح؛ اكتب مبلغه.'), `X6: بل يُذكر تحت الحقل (${text().slice(-600)})`);
      t.ok(!text().includes('مصروف على وحدة أخرى لا يغطّيها'), 'X6: ضابط: على وحدة الدفعة بلا تنبيه');
      choose(field('-division'), 'd-gen');
      await settle();
      t.ok(text().includes('تكاليف الدفعة تُحمَّل من مصاريف «معمل العلف» وحدها؛ مصروف على وحدة أخرى لا يغطّيها.'), `X6: وتغيير الوحدة عن وحدة الدفعة ينبّه (${text().slice(-600)})`);
      await unmount();
    });
    await step('X7', async () => {
      const scoped = { ...ws, role: 'accountant', scopes: [{ divisionId: 'd-gen' }] };
      fresh(entry());
      globalThis.__exp.session = { status: 'ready', workspace: scoped };
      await mount(BATCH);
      t.same([picked(field('-division')), picked(field('-category'))], ['', 'c-labor'], 'X7: وحدة خارج نطاق المستخدم لا تُعبّأ (والفئة تُعبّأ)');
      t.ok(!(field('-division')?.options ?? []).some((option) => option.getAttribute('value') === 'd-mill'), 'X7: ولا تظهر في الاختيار أصلاً');
      choose(field('-box'), 'a-1');
      await settle();
      fire(dialogForm(), 'submit');
      await settle();
      t.ok(text().includes('اختر الوحدة.') && byAction('confirm-expense').length === 0, 'X7: والحفظ يطلب الوحدة: لا تُرسل وحدة خارج النطاق');
      await unmount();
    });
    await step('X8', async () => {
      fresh(entry());
      await mount(BATCH);
      fire(all().find((n) => n.nodeName === 'BUTTON' && n.textContent === 'لا، تراجع'), 'click');
      await settle();
      t.same([where?.pathname, where?.search], ['/accounts/expenses', ''], `X8: الإغلاق يشيل وسائط التعبئة من الرابط (${where?.search})`);
      fire(byAction('new-expense')[0], 'click');
      await settle();
      t.same([picked(field('-division')), picked(field('-category')), field('-amount')?.value], ['', '', ''], 'X8: و«مصروف جديد» بعده فارغة');
      t.ok(!text().includes(HINT), 'X8: وبلا تلميح الدفعة');
      await unmount();
    });

    // ── X9: الدوالّ الصافية ─────────────────────────────────────────────────────────────────────────────────────
    t.same(
      ['/mill/batch/b-1', '/mill/batch/0b8e2c1a-1f2e-4d3c-9a8b-7c6d5e4f3a2b', '/mill/batch/', '/mill/batch/b-1/x', '/mill/batch/b-1?x=1', '//evil.example/mill/batch/b', 'https://evil.example/mill/batch/b', '/accounts', '/mill/batch/../../accounts', null].map((value) => (m.page.safeBack ?? (() => 'غائبة'))(value)),
      ['/mill/batch/b-1', '/mill/batch/0b8e2c1a-1f2e-4d3c-9a8b-7c6d5e4f3a2b', null, null, null, null, null, null, null, null],
      'X9: safeBack يقبل صفحة دفعة في المعمل وحدها',
    );
    const prefillOf = (query) => (m.page.expensePrefill ?? (() => ({})))(new URLSearchParams(query));
    t.same(prefillOf('new=1&division=d-mill&category=c-labor&amount=30000.00&back=/mill/batch/b-1'), { divisionId: 'd-mill', categoryId: 'c-labor', amount: 3_000_000n, back: '/mill/batch/b-1' }, 'X9: expensePrefill يقرأ الأربعة');
    t.same(['2,448.75', '٣٠٠٠٠', '0', '-5', 'abc', '1.234', ''].map((amount) => prefillOf(`amount=${encodeURIComponent(amount)}`).amount), [244_875n, 3_000_000n, null, null, null, null, null], 'X9: المبلغ موجب بمرتبتين على الأكثر، والشرقي يُقرأ، وغيره null');
    t.same([prefillOf('division=a b').divisionId, prefillOf(`division=${'x'.repeat(65)}`).divisionId, prefillOf('category=<x>').categoryId, prefillOf('').back], [null, null, null, null], 'X9: والمعرّف بشكل غير صالح null');

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
    restoreOptions();
    restore();
  }
}
