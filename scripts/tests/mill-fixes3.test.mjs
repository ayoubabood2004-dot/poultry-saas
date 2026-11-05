// الجولة الثالثة من إصلاحات شاشات المعمل (القسم «ب» من fixes3.md، ب٢١–ب٢٨): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// MillRoutes الحقيقية، وrepo المعمل والمخزون والجلسة والرسائل بدائل، والمحلّلات الحقيقية تقرأ أجوبة بشكل القسم «أ» (unit_changed على
// سطر الخلطة، وdraws = null لطرف الناتج، ورفض item_changed بتلميحه). كلّ حالة جديدة تفشل على نسخة ff8423c من الشاشات:
// Z21 «أنتج الآن» معطَّل ما دام في الصفحة مكتوب لم يُحفظ وتحته جملة تسمّيه، وبعد الحفظ يُرحَّل (ب٢١)؛ Z22 أثناء الحفظ يُقفل قسم الوزن ورابط
// «سجّل مصروفاً»، وما كُتب أثناءه لا يُمسح، ونافذة «لم يُحفظ» تُغلق حين يُحفظ ما فيها (ب٢٢)؛ Z23 «مسوّدة قائمة» تحت المفعَّلة والمقاعدة
// (ب٢٣)؛ Z24 كلّ نوع من أنواع «ما لم يُحفظ» الثمانية وحده للبوّابتين (ب٢٤)؛ Z26 يوم الإنتاج يُصحَّح من الصفحة فتُرحَّل المسوّدة القديمة
// (ب٢٦)؛ Z27 جملة «تغيّرت وحدة» تحت المفعَّلة، ونافذة «أنتج» بتلميح item_changed كما هو (ب٢٧)؛ Z28 وجبات مخزن المواد خارج النطاق
// (ب٢٨)؛ Q المحلّلات الصارمة للمفتاحين. وب٢٥ في mill-fixes2 (Y12 وY14).
// والتكامل (القسم «د»): خانة سعر الكلفة لسطر تغيّرت وحدته لا تسمّي وحدة اللقطة (base_unit لقطة يوم التفعيل، والسعر لوحدة المادّة الآن)، وجملة
// التتبّع لطرف الناتج لا تعِد بمصدر كلّ مادّة (draws = null)؛ والشكلان كما يرسلهما الخادم في mill2.test (الجواب الحقيقي بالمحلّل).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const MILL = [
  'loadMill', 'loadBuilder', 'loadRecipe', 'loadBatch', 'previewProduction', 'loadExpenseCategories', 'createRecipe', 'createProduction', 'addProductionInput',
  'deleteProductionInput', 'setInputActual', 'addBatchCost', 'setBatchCost', 'deleteBatchCost', 'addRecipeRate', 'setRecipeRate', 'deleteRecipeRate', 'activateVersion',
  'postProduction', 'confirmCosts', 'discardBatch', 'voidProduction', 'setBatchFields', 'addRecipeLine', 'setRecipeLine', 'deleteRecipeLine', 'createVersion', 'setVersionBasis',
  'newRecipeVersion', 'loadMillStores',
];
const INVENTORY = ['listItems', 'createItem', 'loadItemPurchases', 'setItemCostPrice', 'findItemTwins', 'loadItem', 'updateItem', 'createExpenseCategory'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__mill.call('${n}', a);`).join(' ')}`;
const STUBS = {
  mill: routed('mill', MILL),
  inventory: routed('inventory', INVENTORY),
  session: 'export const useSession = () => globalThis.__mill.session; export const sessionStore = { get: () => globalThis.__mill?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__mill.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'mill-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(mill|inventory)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'mill-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'mill-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

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
const load = async (contents, plugins) => {
  const result = await build({ ...OPTIONS, stdin: { contents, resolveDir: ROOT, loader: 'tsx' }, plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

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
/** نقرة يسار كما في المتصفّح (button = 0): Link من react-router لا ينتقل بغيرها. */
const clickLink = async (node) => {
  fire(node, 'click', { button: 0 });
  await settle();
};
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
const valueOf = (name) => byAction(name)[0]?.value ?? null;
const deferred = () => {
  let resolve = null;
  let reject = null;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};
/** عناوين التنبيهات (Notice يرسم العنوان في div بصنف font-semibold). */
const noticeTitles = () => all().filter((n) => n.localName === 'div' && (n.getAttribute('class') ?? '').split(' ').includes('font-semibold')).map((n) => n.textContent);

const ws = (over = {}) => ({
  userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
  divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});

// ─── أجوبة بشكل القسم «أ» ─────────────────────────────────────────────────────────────────────────────────────────
const batchLine = (over = {}) => ({
  id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, used_qty: null, in_basis: true,
  is_substitute: false, reason: null, replaced_item_name: null, draws: null, money: { value: null }, ...over,
});
/** حالة الدفعة المحفوظة في «الخادم»: ما يكتبه setBatchFields وsetInputActual تقرؤه القراءة التالية. */
const serverBatch = (over = {}) => ({ weight: null, reason: null, expiry: null, day: '2026-11-04', actual: null, tracksExpiry: false, ...over });
const batchJson = ({ status = 'draft', state = serverBatch(), lines = null, costs = [], expensesVisible = true, scope = { input: true, output: true }, costsConfirmed = null } = {}) => {
  const posted = status !== 'draft';
  return {
    id: 'b-1', doc_no: posted ? 'PD-2026-0003' : null, status, version: 7, produced_on: state.day, planned_kg: '1000.000',
    output_qty_kg: posted ? '990.000' : state.weight, output_expiry_on: state.expiry, input_mass_kg: posted ? '1000.000' : null,
    shrink_kg: posted ? '10.000' : null, shrink_pct: null, shrink_reason: state.reason, note: null, void_reason: status === 'void' ? 'إلغاء دفعة إنتاج' : null,
    costs_confirmed: costsConfirmed ?? posted,
    recipe: { id: 'r-1', name: 'علف بادئ', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
    output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: state.tracksExpiry },
    input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
    output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
    lines: lines ?? [batchLine(posted ? { used_qty: '1000.000', draws: [] } : { actual_qty: state.actual })],
    expenses_visible: expensesVisible,
    scope,
    money: {
      input_value: posted ? '450000.00' : null, extra_value: posted ? '15000.00' : null,
      total_value: posted ? '465000.00' : null, cost_per_kg: posted ? '469.70' : null, costs,
    },
  };
};
const detailCost = (over = {}) => ({ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', allocations: [], ...over });
const previewJson = ({ state = serverBatch(), problems = [], costs = [], canPost = null, expensesVisible = true, costsConfirmed = false } = {}) => ({
  id: 'b-1', kind: 'production', status: 'draft', version: 7, produced_on: state.day, planned_kg: '1000.000', input_mass_kg: '1000.000',
  output_qty_kg: state.weight ?? '1000.000', output_expiry_on: state.expiry, shrink_kg: '0.000', shrink_pct: '0.00', shrink_reason: state.reason, shrink_ok: true,
  costs_confirmed: costsConfirmed,
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', division_id: 'd-mill', division_name: 'معمل العلف' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: [{ input_id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: state.actual, draw_qty: state.actual ?? '1000.000', in_basis: true, tracks_expiry: false, money: { value: '450000.00' } }],
  problems,
  can_post: canPost ?? problems.length === 0,
  plan_token: 'tok-7',
  expenses_visible: expensesVisible,
  money: { input_value: '450000.00', extra_value: '15000.00', total_value: '465000.00', cost_per_kg: '465.00', costs },
});
const previewCost = (over = {}) => ({ cost_id: 'pc-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', planned_amount: '15000.00', amount: '15000.00', source: 'recipe', available: '15000.00', ...over });
const unfundedProblem = { code: 'costs_unfunded', category_id: 'c-labor', category_name: 'أيدي عاملة', need: '15000.00', have: '4000.00' };
const recipeLine = (over = {}) => ({
  id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '1000.000', unit: 'kg',
  mass_kg: '1000.000', share_pct: '100.00', in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false, money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' }, ...over,
});
const recipeJson = ({ status = 'draft', versionId = 'v-1', versionNo = 1, versions = null, lines = [recipeLine()], massKg = '1000.000', rates = [] } = {}) => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: versions ?? [{ id: versionId, version_no: versionNo, status, basis_kg: '1000.000', activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version: 5 }],
  selected: { id: versionId, version_no: versionNo, status, basis_kg: '1000.000', note: null, activated_at: null, version: 5 },
  lines,
  mass_kg: massKg,
  pick_items: [{ id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' }],
  expense_categories: [{ id: 'c-labor', name: 'أيدي عاملة' }],
  money: { rates, expected: { materials_per_ton: '450000.00', rates_per_ton: '0.00', cost_per_ton: '450000.00', unpriced: 0 } },
});

export default async function (t) {
  const restore = installDom();
  try {
    const m = await load(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
        "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
        "export { parseRecipe, parseBatch, parsePreview } from './src/lib/repo/mill.ts';",
        "export { RejectedError } from './src/lib/errors.ts';",
      ].join('\n'),
      [stubs],
    );
    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__mill = {
        session,
        toasts: [],
        calls,
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

    let root = null;
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        globalThis.__mill.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }), m.h(m.Route, { path: '*', element: null }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
      await settle();
    };
    const unmount = async () => {
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      if (root) {
        await unmount().catch(() => {});
        root = null;
      }
    };

    /**
     * «خادم» دفعة مسوّدة واحدة: القراءة والمعاينة من الحالة المحفوظة، وsetBatchFields وsetInputActual يكتبانها (والأوّل ينتظر hold إن
     * أُعطي)، والمعاينة تُبنى بـproblemsOf من الحالة. فالحفظ ثمّ القراءة يريان ما حُفظ فعلاً.
     */
    const batchServer = ({ state = serverBatch(), problemsOf = () => [], costs = [previewCost()], detailCosts = [detailCost()], hold = null, costsConfirmed = null, expensesVisible = true } = {}) => {
      const write = (fields) => {
        if (fields.outputQtyKg !== undefined) state.weight = fields.outputQtyKg === null ? null : `${fields.outputQtyKg / 1000n}.${String(fields.outputQtyKg % 1000n).padStart(3, '0')}`;
        if (fields.shrinkReason !== undefined) state.reason = fields.shrinkReason;
        if (fields.outputExpiryOn !== undefined) state.expiry = fields.outputExpiryOn;
        if (fields.producedOn !== undefined) state.day = fields.producedOn;
        return 'b-1';
      };
      return {
        state,
        handlers: {
          loadBatch: () => m.parseBatch(batchJson({ state, costs: detailCosts, costsConfirmed, expensesVisible })),
          previewProduction: () => m.parsePreview(previewJson({ state, problems: problemsOf(state), costs, expensesVisible, costsConfirmed: costsConfirmed ?? false })),
          loadExpenseCategories: () => [{ id: 'c-labor', name: 'أيدي عاملة' }],
          setBatchFields: (batchId, fields) => (hold ? hold.promise.then(() => write(fields)) : write(fields)),
          setInputActual: (inputId, before, actual) => {
            state.actual = actual === null ? null : `${actual / 1000n}.${String(actual % 1000n).padStart(3, '0')}`;
          },
          postProduction: () => ({ doc_no: 'PD-2026-0003' }),
          confirmCosts: () => ({ ok: true }),
        },
      };
    };

    // ── Z21 (ب٢١): «أنتج الآن» معطَّل ما دام في الصفحة مكتوب لم يُحفظ، والجملة تسمّيه؛ وبعد الحفظ يُرحَّل ──────────────────────────
    const gateCases = [
      { key: 'الوزن', field: 'output-weight', value: '985', label: 'وزن الناتج', save: 'save-weight' },
      { key: 'الفعلي', field: 'input-actual', value: '1010', label: 'الكمية الفعلية من «ذرة صفراء»', save: 'input-actual-save' },
      { key: 'تاريخ الانتهاء', field: 'output-expiry', value: '31/12/2026', label: 'تاريخ انتهاء الناتج', save: 'save-weight' },
    ];
    for (const gate of gateCases) {
      await step(`Z21 ${gate.key}`, async () => {
        const server = batchServer({ state: serverBatch({ tracksExpiry: true, expiry: '2026-12-15' }) });
        const calls = fresh({ status: 'ready', workspace: ws() }, server.handlers);
        await mount('/mill/batch/b-1');
        t.eq(disabled(byAction('post-production')[0]), false, `Z21 ${gate.key}: ضابط: بلا مكتوب «أنتج الآن» مفعَّل`);
        type(byAction(gate.field)[0], gate.value);
        await settle();
        t.eq(disabled(byAction('post-production')[0]), true, `Z21 ${gate.key} مكتوب لم يُحفظ: «أنتج الآن» معطَّل`);
        t.eq(byAction('post-unsaved')[0]?.textContent ?? null, `احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الإنتاج: ${gate.label}.`, `Z21 ${gate.key}: وتحته جملة تسمّي ما لم يُحفظ`);
        await click(byAction('post-production')[0]);
        t.eq(named(calls, 'postProduction').length, 0, `Z21 ${gate.key}: النقرة لا ترحّل`);
        await click(byAction(gate.save)[0]);
        t.same([disabled(byAction('post-production')[0]), byAction('post-unsaved').length], [false, 0], `Z21 ${gate.key}: بعد الحفظ «أنتج الآن» مفعَّل بلا جملة`);
        await click(byAction('post-production')[0]);
        t.same(named(calls, 'postProduction').map(([batchId, version, plan]) => [batchId, version, plan]), [['b-1', 7, 'tok-7']], `Z21 ${gate.key}: ويُرحَّل بعد الحفظ`);
      });
    }

    await step('Z21 مشغّل المعمل', async () => {
      // القائمة من شرط editInputs، فتشمل مشغّل المعمل: بعد ختم الكلف يرى «أنتج الآن» (ب١)، والبوّابة نفسها تمنعه من ترحيل وزن لم يُحفظ.
      const server = batchServer({ costsConfirmed: true, expensesVisible: false });
      const calls = fresh({ status: 'ready', workspace: ws({ role: 'mill_operator', canSeeCost: false, canSeeAccounts: false, canSeeSales: false }) }, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      await click(byAction('post-production')[0]);
      t.same(
        [disabled(byAction('post-production')[0]), byAction('post-unsaved')[0]?.textContent ?? null, named(calls, 'postProduction').length],
        [true, 'احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الإنتاج: وزن الناتج.', 0],
        'Z21 مشغّل المعمل بعد الختم: وزن لم يُحفظ يعطّل «أنتج الآن» ويُسمّى ولا يُرحَّل',
      );
    });
    await step('Z21 من لا يرحّل', async () => {
      // مشغّل المعمل قبل ختم الكلف لا يرى «أنتج الآن» (ب١)، فلا جملة عن زرّ غير موجود.
      const server = batchServer({ problemsOf: () => [{ code: 'costs_pending' }] });
      fresh({ status: 'ready', workspace: ws({ role: 'mill_operator', canSeeCost: false, canSeeAccounts: false, canSeeSales: false }) }, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      t.same([byAction('post-production').length, byAction('post-unsaved').length], [0, 0], 'Z21 ضابط: بلا زرّ «أنتج الآن» لا جملة تحته');
    });

    // ── Z22 (ب٢٢): أثناء الحفظ يُقفل قسم الوزن ورابط «سجّل مصروفاً» و«أنتج الآن»، ولا يضيع ما كُتب، والنافذة تُغلق ───────────────────────────
    await step('Z22 القفل وما كُتب أثناء الحفظ', async () => {
      const hold = deferred();
      const server = batchServer({ state: serverBatch({ tracksExpiry: true }), hold, problemsOf: () => [unfundedProblem] });
      const calls = fresh({ status: 'ready', workspace: ws() }, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '960');
      await settle();
      await click(byAction('save-weight')[0]);
      const fields = ['output-weight', 'waste-reason', 'output-expiry', 'produced-on'];
      t.same(fields.map((name) => disabled(byAction(name)[0])), fields.map(() => true), `Z22 أثناء الحفظ: الوزن والسبب والتاريخ ويوم الإنتاج مقفولة (${fields.filter((name) => disabled(byAction(name)[0]) !== true).join('، ')})`);
      const link = byAction('record-expense')[0];
      t.same([link?.localName ?? null, link?.getAttribute('href') ?? null], ['span', null], 'Z22 و«سجّل مصروفاً» نصّ مقفول بلا رابط أثناء الحفظ');
      if (link) await clickLink(link);
      t.same([globalThis.__mill.location, byAction('confirm-leave').length], ['/mill/batch/b-1', 0], 'Z22 والنقرة عليه لا تغادر ولا تفتح نافذة');
      // كتابة رغم القفل (DOM الفحص لا يمنعها): ما لم يُرسل لا يُمسّ، وما تغيّر بعد الإرسال يبقى.
      type(byAction('waste-reason')[0], 'رطوبة عالية في الذرة');
      type(byAction('output-expiry')[0], '15/12/2026');
      type(byAction('output-weight')[0], '965');
      await settle();
      hold.resolve();
      await settle();
      const sent = named(calls, 'setBatchFields');
      t.same(sent.map(([batchId, value]) => [batchId, Object.keys(value), value.outputQtyKg]), [['b-1', ['outputQtyKg'], 960_000n]], 'Z22 أُرسل الوزن وحده كما كان لحظة النقر');
      t.same([valueOf('waste-reason'), valueOf('output-expiry')], ['رطوبة عالية في الذرة', '15/12/2026'], 'Z22 السبب والتاريخ المكتوبان أثناء الحفظ باقيان بعده');
      t.eq(valueOf('output-weight'), '965', 'Z22 والوزن الذي تغيّر بعد الإرسال يبقى ولا يُفرَّغ إلى المحفوظ');
      t.same([disabled(byAction('output-weight')[0]), byAction('record-expense')[0]?.localName ?? null], [false, 'a'], 'Z22 بعد الحفظ تعود الحقول والرابط');
    });
    await step('Z22 المعروض كما أُرسل', async () => {
      const server = batchServer();
      fresh({ status: 'ready', workspace: ws() }, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '960');
      await settle();
      await click(byAction('save-weight')[0]);
      t.same([valueOf('output-weight'), byAction('post-unsaved').length, disabled(byAction('post-production')[0])], ['960.000', 0, false], 'Z22 ضابط: المعروض كما أُرسل فيُفرَّغ العلم ويُعرض المحفوظ، و«أنتج الآن» مفعَّل');
    });
    await step('Z22 «أنتج الآن» أثناء فعل آخر', async () => {
      const seal = deferred();
      const server = batchServer();
      fresh({ status: 'ready', workspace: ws() }, { ...server.handlers, confirmCosts: () => seal.promise });
      await mount('/mill/batch/b-1');
      t.eq(disabled(byAction('post-production')[0]), false, 'Z22 ضابط: «أنتج الآن» مفعَّل قبل الختم');
      await click(byAction('seal-costs')[0]);
      t.same([disabled(byAction('post-production')[0]), disabled(byAction('output-weight')[0])], [true, true], 'Z22 أثناء ختم الكلف: «أنتج الآن» وحقل الوزن مقفولان');
      seal.resolve({ ok: true });
      await settle();
      t.eq(disabled(byAction('post-production')[0]), false, 'Z22 وبعده يعودان');
    });
    await step('Z22 النافذة تُغلق', async () => {
      const server = batchServer({ problemsOf: () => [unfundedProblem] });
      fresh({ status: 'ready', workspace: ws() }, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      await clickLink(byAction('record-expense')[0]);
      t.ok(byAction('confirm-leave').length === 1 && text().includes('لم يُحفظ بعد: وزن الناتج.'), 'Z22 النافذة مفتوحة تسمّي الوزن');
      // الحفظ ينتهي والنافذة مفتوحة (حُفظ ما فيها): تُغلق بدل أن تبقى بجملة فارغة.
      await click(byAction('save-weight')[0]);
      t.same([byAction('confirm-leave').length, text().includes('لم يُحفظ بعد: .'), globalThis.__mill.location], [0, false, '/mill/batch/b-1'], 'Z22 حُفظ ما فيها: تُغلق النافذة ولا تغادر الصفحة');
      type(byAction('output-weight')[0], '970');
      await settle();
      t.eq(byAction('confirm-leave').length, 0, 'Z22 ولا تعود وحدها بكتابة لاحقة');
    });
    await step('Z22 النافذة بقائمة أقصر', async () => {
      const server = batchServer({ problemsOf: () => [unfundedProblem] });
      fresh({ status: 'ready', workspace: ws() }, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      type(byAction('input-actual')[0], '1010');
      await settle();
      await clickLink(byAction('record-expense')[0]);
      await click(byAction('save-weight')[0]);
      t.ok(
        byAction('confirm-leave').length === 1 && text().includes('لم يُحفظ بعد: الكمية الفعلية من «ذرة صفراء». الانتقال'),
        'Z22 ضابط: حُفظ بعض ما فيها: تبقى النافذة بما بقي',
      );
    });

    // ── Z23 (ب٢٣): مسوّدة قائمة: «افتحها لإضافة تكلفة» برقمها تحت المفعَّلة والمقاعدة ─────────────────────────────────────────────
    const threeVersions = [
      { id: 'v-3', version_no: 3, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 5 },
      { id: 'v-2', version_no: 2, status: 'active', basis_kg: '1000.000', activated_at: '2026-11-01T08:00:00Z', version: 5 },
      { id: 'v-1', version_no: 1, status: 'retired', basis_kg: '1000.000', activated_at: '2026-10-01T08:00:00Z', version: 5 },
    ];
    for (const [label, versionId, versionNo, status] of [['المفعَّلة', 'v-2', 2, 'active'], ['المقاعدة', 'v-1', 1, 'retired']]) {
      await step(`Z23 ${label}`, async () => {
        fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ status, versionId, versionNo, versions: threeVersions })) });
        await mount('/mill/recipe/r-1');
        t.ok(text().includes('لهذه الخلطة مسوّدة قائمة (نسخة 3): افتحها لإضافة تكلفة.'), `Z23 تحت ${label}: الجملة تدلّ على المسوّدة القائمة برقمها`);
        t.ok(!text().includes('أنشئ نسخة جديدة'), `Z23 تحت ${label}: لا «أنشئ نسخة جديدة» والنسخة الجديدة لا تُنشأ`);
        t.same([byAction('rates-open-draft').length, byAction('rates-new-version').length], [1, 0], `Z23 تحت ${label}: والفعل «افتح المسوّدة»`);
      });
    }

    // ── Z24 (ب٢٤): كلّ نوع من «ما لم يُحفظ» وحده يوقف البوّابتين ويُسمّى ──────────────────────────────────────────────────────────
    const kinds = [
      { key: 'الوزن', field: 'output-weight', value: '985', label: 'وزن الناتج' },
      { key: 'السبب', field: 'waste-reason', value: 'رطوبة عالية', label: 'سبب الهدر' },
      { key: 'التاريخ', field: 'output-expiry', value: '31/12/2026', label: 'تاريخ انتهاء الناتج' },
      { key: 'الفعلي', field: 'input-actual', value: '1010', label: 'الكمية الفعلية من «ذرة صفراء»' },
      { key: 'مبلغ السطر', field: 'cost-amount', value: '16000', label: 'مبلغ «أيدي عاملة»' },
      { key: 'السطر الجديد', field: 'new-cost-amount', value: '500', label: 'سطر التكلفة الجديد' },
      { key: 'الفئة الجديدة', field: 'new-category-name', value: 'نقل', label: 'اسم الفئة الجديدة «نقل»' },
      { key: 'يوم الإنتاج', field: 'produced-on', value: '05/11/2026', label: 'يوم الإنتاج' },
    ];
    for (const kind of kinds) {
      await step(`Z24 ${kind.key} «سجّل مصروفاً»`, async () => {
        const server = batchServer({ state: serverBatch({ tracksExpiry: true, expiry: '2026-12-15' }), costs: [previewCost({ available: '4000.00' })], problemsOf: () => [unfundedProblem] });
        fresh({ status: 'ready', workspace: ws() }, server.handlers);
        await mount('/mill/batch/b-1');
        type(byAction(kind.field)[0], kind.value);
        await settle();
        await clickLink(byAction('record-expense')[0]);
        t.same(
          [globalThis.__mill.location, byAction('confirm-leave').length, text().includes(`لم يُحفظ بعد: ${kind.label}. الانتقال`)],
          ['/mill/batch/b-1', 1, true],
          `Z24 ${kind.key} وحده: «سجّل مصروفاً» لا يغادر، والنافذة تسمّيه`,
        );
      });
      await step(`Z24 ${kind.key} «أنتج الآن»`, async () => {
        const server = batchServer({ state: serverBatch({ tracksExpiry: true, expiry: '2026-12-15' }) });
        const calls = fresh({ status: 'ready', workspace: ws() }, server.handlers);
        await mount('/mill/batch/b-1');
        type(byAction(kind.field)[0], kind.value);
        await settle();
        await click(byAction('post-production')[0]);
        t.same(
          [disabled(byAction('post-production')[0]), byAction('post-unsaved')[0]?.textContent ?? null, named(calls, 'postProduction').length],
          [true, `احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الإنتاج: ${kind.label}.`, 0],
          `Z24 ${kind.key} وحده: «أنتج الآن» معطَّل ويسمّيه ولا يرحّل`,
        );
      });
    }

    // ── Z26 (ب٢٦): يوم الإنتاج يُصحَّح من الصفحة فتُرحَّل مسوّدة كبرت على يومها ───────────────────────────────────────────────────
    const oldHint = 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 29/10/2026.';
    await step('Z26', async () => {
      const server = batchServer({ state: serverBatch({ day: '2026-10-20' }), problemsOf: (state) => (state.day < '2026-10-29' ? [{ code: 'date_too_old', hint: oldHint }] : []) });
      const calls = fresh({ status: 'ready', workspace: ws() }, server.handlers);
      await mount('/mill/batch/b-1');
      t.same([text().includes(oldHint), disabled(byAction('post-production')[0]), valueOf('produced-on')], [true, true, '20/10/2026'], 'Z26 مشكلة التاريخ بجملة الخادم، و«أنتج الآن» معطَّل، وحقل يوم الإنتاج يبدأ من المحفوظ');
      type(byAction('produced-on')[0], '31/02/2026');
      await settle();
      t.same([text().includes('اكتب يوم الإنتاج يوم/شهر/سنة، مثل 04/11/2026.'), disabled(byAction('save-weight')[0])], [true, true], 'Z26 يوم غير موجود بالتقويم: يُقال ولا يُحفظ');
      type(byAction('produced-on')[0], '05/11/2026');
      await settle();
      t.eq(byAction('post-unsaved')[0]?.textContent ?? null, 'احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الإنتاج: يوم الإنتاج.', 'Z26 اليوم المكتوب يدخل قائمة ما لم يُحفظ');
      await click(byAction('save-weight')[0]);
      t.same(named(calls, 'setBatchFields').map(([batchId, fields]) => [batchId, fields]), [['b-1', { producedOn: '2026-11-05' }]], 'Z26 يُحفظ يوم تقويم وحده بـsetBatchFields({ producedOn })');
      t.same([text().includes(oldHint), valueOf('produced-on'), disabled(byAction('post-production')[0])], [false, '05/11/2026', false], 'Z26 بعد القراءة: لا مشكلة، والحقل من المحفوظ، و«أنتج الآن» مفعَّل');
      await click(byAction('post-production')[0]);
      t.eq(named(calls, 'postProduction').length, 1, 'Z26 وتُرحَّل المسوّدة بدل أن تُحذف');
    });
    await step('Z26 مشغّل المعمل', async () => {
      const server = batchServer({ problemsOf: () => [{ code: 'costs_pending' }] });
      fresh({ status: 'ready', workspace: ws({ role: 'mill_operator', canSeeCost: false, canSeeAccounts: false, canSeeSales: false }) }, server.handlers);
      await mount('/mill/batch/b-1');
      t.eq(byAction('produced-on').length, 1, 'Z26 مشغّل المعمل يسوّد فيعدّل يوم الإنتاج (editInputs)');
    });

    // ── Z27 (ب٢٧): «تغيّرت وحدة» تحت المفعَّلة، ونافذة «أنتج» بتلميح item_changed كما هو ───────────────────────────────────────────
    const kaz = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-kaz', item_name: 'كاز', kind: 'fuel', base_unit: 'kg', category_name: null, qty: '20.000', unit: 'kg', mass_kg: '20.000', share_pct: '0.00', in_basis: false, unit_changed: true });
    const changedSentence = 'تغيّرت وحدة «كاز» بعد التفعيل: لا يُنتَج بهذه النسخة حتّى تُنشأ نسخة جديدة وتُفعَّل.';
    await step('Z27 المفعَّلة', async () => {
      fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', lines: [recipeLine(), kaz] })) });
      await mount('/mill/recipe/r-1');
      const block = byAction('unit-changed')[0];
      t.eq(block?.textContent ?? null, changedSentence, 'Z27 تحت المفعَّلة جملة للسطر الذي تغيّرت وحدته وحده');
      // التكامل (الجولة الثالثة): base_unit في سطر النسخة المجمَّدة لقطة يوم التفعيل (recipe_detail في 0016: coalesce(l.base_unit, i.base_unit)،
      // وmill2.test يمرّر الجواب الحقيقي بالمحلّل)، والأسعار في السطر لوحدة المادّة الآن؛ فخانة سعر الكلفة لا تسمّي وحدة اللقطة لسطر تغيّرت وحدته.
      t.same(
        byAction('cost-price').map((input) => input.getAttribute('aria-label')),
        ['سعر كلفة «ذرة صفراء» لكلّ كغم', 'سعر كلفة «كاز» بوحدتها الحالية'],
        'Z27 خانة سعر الكلفة: «لكلّ كغم» لسطر بوحدته، وبلا وحدة اللقطة لسطر تغيّرت وحدته (سعره لوحدة المادّة الآن)',
      );
    });
    await step('Z27 المقاعدة', async () => {
      fresh({ status: 'ready', workspace: ws() }, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'retired', lines: [recipeLine(), kaz] })) });
      await mount('/mill/recipe/r-1');
      t.eq(byAction('unit-changed').length, 0, 'Z27 ضابط: لا جملة تحت نسخة غير مفعَّلة');
    });
    await step('Z27 نافذة «أنتج»', async () => {
      const hint = 'تغيّرت وحدة «كاز» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.';
      const calls = fresh(
        { status: 'ready', workspace: ws() },
        {
          loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', lines: [recipeLine(), kaz] })),
          loadMillStores: () => ({ today: '2026-11-04', stores: [{ id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw' }, { id: 'w-feed', name: 'مخزن العلف', kind: 'feed' }] }),
          createProduction: () => {
            throw new m.RejectedError('item_changed', hint);
          },
        },
      );
      await mount('/mill/recipe/r-1');
      await click(byAction('produce')[0]);
      type(byAction('produce-qty')[0], '1000');
      await settle();
      await click(byAction('produce-start')[0]);
      t.eq(named(calls, 'createProduction').length, 1, 'Z27 أُرسل create_production');
      t.ok(noticeTitles().includes(hint), `Z27 النافذة تعرض تلميح item_changed كما هو (${noticeTitles().join(' | ')})`);
      t.ok(!text().includes('الخادم رفض العملية'), 'Z27 بلا عنوان الرفض العامّ قبله');
      t.eq(globalThis.__mill.location, '/mill/recipe/r-1', 'Z27 ولا تُفتح دفعة');
    });

    // ── Z28 (ب٢٨): وجبات مخزن المواد خارج النطاق: جملة باهتة بلا رابط ───────────────────────────────────────────────────────────
    await step('Z28 طرف الناتج', async () => {
      fresh(
        { status: 'ready', workspace: ws() },
        { loadBatch: () => m.parseBatch(batchJson({ status: 'posted', lines: [batchLine({ used_qty: '1000.000', draws: null })], costs: [detailCost({ allocations: null })], expensesVisible: false, scope: { input: false, output: true } })) },
      );
      await mount('/mill/batch/b-1');
      const cell = byAction('draws-hidden')[0];
      t.same([cell?.textContent ?? null, (cell?.getAttribute('class') ?? '').includes('text-ink-muted')], ['وجبات مخزن المواد خارج نطاقك', true], 'Z28 draws = null: «وجبات مخزن المواد خارج نطاقك» باهتة');
      t.same([byAction('open-item-ledger').length, byAction('item-ledger-text').length], [0, 0], 'Z28 بلا رابط دفتر ولا «دفتر المادّة»');
      // التكامل (الجولة الثالثة): الخادم لا يرسل وجبات مخزن المواد لطرف الناتج (production_detail: draws = null حين not v_in، وmill2.test يمرّره
      // بالمحلّل)، فجملة التتبّع فوق الجدول لا تعِد بأنّ العمود يدلّ على مصدر كلّ مادّة، وتقول إنّ وجبات ذلك المخزن خارج نطاقه.
      t.same(
        [text().includes('يدلّ على مصدر كلّ مادّة'), text().includes('سُحبت المواد من «مخزن المواد الأوّلية»، ووجبات ذلك المخزن خارج نطاقك.')],
        [false, true],
        'Z28 جملة التتبّع لطرف الناتج لا تعِد بمصدر كلّ مادّة، وتقول إنّ وجبات مخزن المواد خارج نطاقه',
      );
    });
    await step('Z28 طرف المواد', async () => {
      fresh(
        { status: 'ready', workspace: ws() },
        {
          loadBatch: () =>
            m.parseBatch(
              batchJson({
                status: 'posted',
                lines: [batchLine({ used_qty: '1000.000', draws: [{ lot_id: 'lot-1', qty: '1000.000', received_on: '2026-10-20', source: 'PU-2026-0001' }] })],
                costs: [detailCost()],
                scope: { input: true, output: true },
              }),
            ),
        },
      );
      await mount('/mill/batch/b-1');
      t.same([byAction('draws-hidden').length, text().includes('«PU-2026-0001» (20/10/2026)')], [0, true], 'Z28 ضابط: من مخزن المواد بنطاقه يرى الوجبات بمصدرها');
      t.same(
        [text().includes('سُحبت المواد من «مخزن المواد الأوّلية»، وعمود «من أيّ وجبات» في الجدول يدلّ على مصدر كلّ مادّة.'), text().includes('ووجبات ذلك المخزن خارج نطاقك')],
        [true, false],
        'Z28 ضابط: جملة التتبّع لمن مخزن المواد بنطاقه تدلّ على عمود «من أيّ وجبات» كما كانت',
      );
    });
    await step('Z28 null بنطاق المواد', async () => {
      // لا يرسله الخادم لمن مخزن المواد بنطاقه؛ إن جاء فالجملة لا تقول «خارج نطاقك» لمن هو في نطاقه، ويبقى رابط الدفتر.
      fresh({ status: 'ready', workspace: ws() }, { loadBatch: () => m.parseBatch(batchJson({ status: 'posted', lines: [batchLine({ used_qty: '1000.000', draws: null })], costs: [detailCost()], scope: { input: true, output: true } })) });
      await mount('/mill/batch/b-1');
      t.same([byAction('draws-hidden').length, byAction('open-item-ledger').length], [0, 1], 'Z28 ضابط: draws = null ومخزن المواد بنطاقه: رابط الدفتر لا «خارج نطاقك»');
    });

    // ── Q: المحلّلات الصارمة ───────────────────────────────────────────────────────────────────────────────────────────
    await step('Q', async () => {
      const safe = (fn) => {
        try {
          return fn();
        } catch (error) {
          return error instanceof Error && error.name === 'MillShapeError' ? error.message : `threw:${error}`;
        }
      };
      const missing = recipeJson();
      delete missing.lines[0].unit_changed;
      t.eq(safe(() => m.parseRecipe(missing) && 'ok'), 'mill_shape:unit_changed', 'Q سطر خلطة بلا unit_changed: خطأ شكل (المفتاح إلزامي)');
      t.eq(safe(() => m.parseRecipe(recipeJson({ lines: [recipeLine({ unit_changed: 'true' })] })) && 'ok'), 'mill_shape:unit_changed', 'Q unit_changed غير منطقي: خطأ شكل');
      t.same(safe(() => m.parseRecipe(recipeJson({ status: 'active', lines: [recipeLine(), kaz] })).lines.map((line) => [line.itemId, line.unitChanged])), [['i-corn', false], ['i-kaz', true]], 'Q unit_changed لكلّ سطر يُقرأ');
      t.same(
        safe(() => m.parseBatch(batchJson({ status: 'posted', lines: [batchLine({ used_qty: '1000.000', draws: null })], scope: { input: false, output: true } })).lines.map((line) => line.draws)),
        [null],
        'Q draws = null لدفعة مرحَّلة (طرف الناتج) يُقرأ null',
      );
      const noDraws = batchJson({ status: 'posted' });
      delete noDraws.lines[0].draws;
      t.eq(safe(() => m.parseBatch(noDraws) && 'ok'), 'mill_shape:draws', 'Q ضابط: draws غائب خطأ شكل');
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
