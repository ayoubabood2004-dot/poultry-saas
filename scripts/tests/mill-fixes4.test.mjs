// الجولة الرابعة من إصلاحات شاشات المعمل (القسم «ب» من fixes4.md، ب٣١–ب٣٧): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// MillRoutes الحقيقية، وrepo المعمل والمخزون والجلسة والرسائل بدائل، والمحلّلات الحقيقية تقرأ أجوبة بشكل القسم «أ» (unit_mismatch على سطر
// الخلطة، وكتلة السطر وحصّته ومجموع الكتلة وكتلة قطعة الشريط قد تكون null). و«الخادم» البديل للدفعة يكتب بشرط القيمة التي شافتها الشاشة
// كما يفعل repo الحقيقي (صفر صفوف ← قراءة الصفّ ← qty_changed/amount_changed)، فالحفظ الثاني يُفحص بشرطه لا بعدده وحده.
// W31 المحلّلات الصارمة والكتل null، وجملة سطر unit_mismatch في المسوّدة و«—» للكتلة، والشريط يتخطّى القطعة بلا كتلة (ب٣١)؛ W32 القفل أثناء
// الحفظ وEnter والمسح المشروط للفعلي والمبلغ والسطر الجديد (ب٣٢)؛ W33 البطاقة والمعاينة من نسخة واحدة (ب٣٣)؛ W34 «اختم الكلف» بوّابة
// مبلغ لم يُحفظ (ب٣٤)؛ W35 «أرجع ما لم يُحفظ» ويوم الإنتاج الفارغ (ب٣٥)؛ W36 المكتوب غير الصالح في البوّابة ويوم «5/11/2026» (ب٣٦)؛
// W37 جملة «لا تكاليف» بالدور (ب٣٧). كلّ حالة جديدة تفشل على نسخة 93a85f0 من الشاشات، أو على طفرتها (W36، طفرات findings4 #7).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const MILL = [
  'loadMill', 'loadBuilder', 'loadRecipe', 'loadBatch', 'previewProduction', 'loadExpenseCategories', 'createRecipe', 'createProduction', 'addProductionInput',
  'deleteProductionInput', 'setInputActual', 'addBatchCost', 'setBatchCost', 'deleteBatchCost', 'addRecipeRate', 'setRecipeRate', 'deleteRecipeRate', 'activateVersion',
  'postProduction', 'confirmCosts', 'discardBatch', 'voidProduction', 'setBatchFields', 'addRecipeLine', 'setRecipeLine', 'deleteRecipeLine', 'setVersionBasis',
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
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};
const click = async (node) => {
  fire(node, 'click');
  await settle();
};
/** نقرة على عقدة قد تغيب في الشاشة القديمة: الغياب يظهر في الفحص التالي فاشلاً باسمه لا رميةً تُسقط الخطوة. */
const press = async (node) => {
  if (node) await click(node);
};
const enter = async (node) => {
  if (node) fire(node, 'keydown', { key: 'Enter' });
  await settle();
};
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
const valueOf = (name) => byAction(name)[0]?.value ?? null;
/** القيمة المختارة في <select> مُدار: React يعلّم الخيار المختار (selected) ولا يكتب value على العنصر نفسه. */
const picked = (select) => (select ? (select.options.find((option) => option.selected === true)?.value ?? null) : null);
const sentence = (name) => byAction(name)[0]?.textContent ?? null;
const deferred = () => {
  let resolve = null;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};
/** عناوين التنبيهات (Notice يرسم العنوان في div بصنف font-semibold). */
const noticeTitles = () => all().filter((n) => n.localName === 'div' && (n.getAttribute('class') ?? '').split(' ').includes('font-semibold')).map((n) => n.textContent);
const tableOf = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
  if (!table) return null;
  const inside = descendants(table);
  const section = (tag) => inside.find((n) => n.localName === tag) ?? null;
  const rowsOf = (node) => (node ? descendants(node).filter((n) => n.localName === 'tr') : []);
  const headers = rowsOf(section('thead'))[0]?.children.map((n) => n.textContent) ?? [];
  const rows = rowsOf(section('tbody')).map((tr) => tr.children.map((n) => n.textContent));
  const foot = rowsOf(section('tfoot'))[0]?.children ?? [];
  const footCells = foot.filter((n) => n.localName === 'td').map((n) => n.textContent);
  const footAt = (index) => footCells[index - (headers.length - footCells.length)] ?? null;
  return { headers, rows, footAt };
};
/** عناوين قطع شريط التركيبة (title لكلّ قطعة) داخل عقدة. */
const barTitles = (node) => (node ? descendants(node).filter((n) => n.localName === 'span' && n.getAttribute('title') !== null).map((n) => n.getAttribute('title')) : []);

const ws = (over = {}) => ({
  userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
  divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws() };
const ACCOUNTANT = { status: 'ready', workspace: ws({ role: 'accountant' }) };
const OPERATOR = { status: 'ready', workspace: ws({ role: 'mill_operator', canSeeCost: false, canSeeAccounts: false, canSeeSales: false }) };
const gate = (list) => `احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الإنتاج: ${list}.`;
const sealGate = (list) => `احفظ ما كتبته أو أرجعه إلى المحفوظ قبل الختم: ${list}.`;

// ─── «خادم» الدفعة: القراءة من الحالة المحفوظة، والكتابة مشروطة بما شافته الشاشة كما في repo الحقيقي ───────────────────────────────
const milli = (value) => (value === null ? null : `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`);
const cents = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
const whole = (textValue) => (textValue === null ? null : BigInt(textValue.replace('.', '')));
const CATEGORIES = [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }];
const serverBatch = (over = {}) => ({
  version: 7, weight: null, reason: null, expiry: null, day: '2026-11-04', actual: null, tracksExpiry: false, costsConfirmed: false,
  costs: [{ id: 'pc-1', category_id: 'c-labor', category_name: 'أيدي عاملة', planned: '15000.00', amount: '15000.00', source: 'recipe' }],
  ...over,
});
const batchLine = (over = {}) => ({
  id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, used_qty: null, in_basis: true,
  is_substitute: false, reason: null, replaced_item_name: null, draws: null, money: { value: null }, ...over,
});
const batchJson = (state, { expensesVisible = true } = {}) => ({
  id: 'b-1', doc_no: null, status: 'draft', version: state.version, produced_on: state.day, planned_kg: '1000.000',
  output_qty_kg: state.weight, output_expiry_on: state.expiry, input_mass_kg: null, shrink_kg: null, shrink_pct: null, shrink_reason: state.reason, note: null, void_reason: null,
  costs_confirmed: state.costsConfirmed,
  recipe: { id: 'r-1', name: 'علف بادئ', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: state.tracksExpiry },
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: [batchLine({ actual_qty: state.actual })],
  expenses_visible: expensesVisible,
  scope: { input: true, output: true },
  money: {
    input_value: null, extra_value: null, total_value: null, cost_per_kg: null,
    costs: state.costs.map((cost, index) => ({ cost_id: cost.id, line_no: index + 1, category_id: cost.category_id, category_name: cost.category_name, planned_amount: cost.planned, amount: cost.amount, source: cost.source, allocations: [] })),
  },
});
const previewJson = (state, { problems = [], expensesVisible = true } = {}) => ({
  id: 'b-1', kind: 'production', status: 'draft', version: state.version, produced_on: state.day, planned_kg: '1000.000', input_mass_kg: '1000.000',
  output_qty_kg: state.weight ?? '1000.000', output_expiry_on: state.expiry, shrink_kg: '0.000', shrink_pct: '0.00', shrink_reason: state.reason, shrink_ok: true,
  costs_confirmed: state.costsConfirmed,
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', division_id: 'd-mill', division_name: 'معمل العلف' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: [{ input_id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: state.actual, draw_qty: state.actual ?? '1000.000', in_basis: true, tracks_expiry: false, money: { value: '450000.00' } }],
  problems,
  can_post: problems.length === 0,
  plan_token: `tok-${state.version}`,
  expenses_visible: expensesVisible,
  money: {
    input_value: '450000.00', extra_value: '15000.00', total_value: '465000.00', cost_per_kg: '465.00',
    costs: state.costs.map((cost, index) => ({ cost_id: cost.id, line_no: index + 1, category_id: cost.category_id, category_name: cost.category_name, planned_amount: cost.planned, amount: cost.amount, source: cost.source, available: cost.amount })),
  },
});

// ─── أجوبة الخلطة بشكل القسم «أ» ─────────────────────────────────────────────────────────────────────────────────────────
const recipeLine = (over = {}) => ({
  id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '1000.000', unit: 'kg',
  mass_kg: '1000.000', share_pct: '100.00', in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false, money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' }, ...over,
});
const CORN_PICK = { id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' };
const recipeJson = ({ status = 'draft', versionId = 'v-1', versionNo = 1, versions = null, lines = [recipeLine()], massKg = '1000.000', rates = [], pickItems = [CORN_PICK] } = {}) => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: versions ?? [{ id: versionId, version_no: versionNo, status, basis_kg: '1000.000', activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version: 5 }],
  selected: { id: versionId, version_no: versionNo, status, basis_kg: '1000.000', note: null, activated_at: null, version: 5 },
  // نسخ لكلّ جواب: فحص الشكل يحذف مفاتيح منه، فلا يمسّ السطور المشتركة بين الخطوات.
  lines: lines.map((line) => ({ ...line })),
  mass_kg: massKg,
  pick_items: pickItems,
  expense_categories: [{ id: 'c-labor', name: 'أيدي عاملة' }],
  money: { rates, expected: { materials_per_ton: '450000.00', rates_per_ton: '0.00', cost_per_ton: '450000.00', unpriced: 0, unconverted: 0 } },
});
// مسوّدة فيها «دبس» داخل الكتلة و«كاز» خارجها، كلاهما مكتوب باللتر ومادّته صُحّحت كيلوغراماً (ق٤٢): الكتلة لا تُعرف، والمجموع null.
const cornLine = recipeLine({ qty: '972.000', mass_kg: '972.000', share_pct: '97.20' });
const dbsLine = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-dbs', item_name: 'دبس', qty: '20.000', unit: 'L', mass_kg: null, share_pct: null, unit_mismatch: true });
const kazLine = recipeLine({ id: 'l-3', line_no: 3, item_id: 'i-kaz', item_name: 'كاز', kind: 'fuel', category_name: null, qty: '17.000', unit: 'L', mass_kg: null, share_pct: null, in_basis: false, unit_mismatch: true });
const piece = (id, name, mass, inBasis = true) => ({ item_id: id, item_name: name, mass_kg: mass, in_basis: inBasis });
const overview = (pieces) => ({
  today: '2026-11-04',
  recipes: [
    {
      id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 1,
      output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed' },
      active: { id: 'v-1', version_no: 1, basis_kg: '1000.000', lines: pieces.length, pieces },
      draft: null, batches: 0, last_batch: null, money: { expected_cost_per_kg: '450.00' },
    },
  ],
  stores: [{ id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw' }, { id: 'w-feed', name: 'مخزن العلف', kind: 'feed' }],
  feed_items: [],
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
        "export { CellEdit } from './src/pages/mill/pickers.tsx';",
        "export { parseRecipe, parseRecipes, parseBatch, parsePreview } from './src/lib/repo/mill.ts';",
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
     * «خادم» دفعة مسوّدة: القراءة والمعاينة من الحالة، والكتابة تحدّثها وتزيد النسخة، وكلّ كتابة تنتظر hold باسمها إن أُعطي. setInputActual
     * وsetBatchCost مشروطتان بالقيمة التي شافتها الشاشة كما في repo الحقيقي: إن خالفت المحفوظ والمطلوب معاً فالرفض نفسه (qty_changed أو
     * amount_changed بجملته)، فحفظ ثانٍ مشروط بما قبل الأوّل يُرفض «من جهاز آخر» كما في الإنتاج.
     */
    const batchServer = ({ state = serverBatch(), holds = {}, problemsOf = () => [], expensesVisible = true } = {}) => {
      const later = (name, fn) => (holds[name] ? holds[name].promise.then(fn) : fn());
      return {
        state,
        handlers: {
          loadBatch: () => m.parseBatch(batchJson(state, { expensesVisible })),
          previewProduction: () => m.parsePreview(previewJson(state, { problems: problemsOf(state), expensesVisible })),
          loadExpenseCategories: () => CATEGORIES,
          setBatchFields: (batchId, fields) =>
            later('setBatchFields', () => {
              if (fields.outputQtyKg !== undefined) state.weight = milli(fields.outputQtyKg);
              if (fields.shrinkReason !== undefined) state.reason = fields.shrinkReason;
              if (fields.outputExpiryOn !== undefined) state.expiry = fields.outputExpiryOn;
              if (fields.producedOn !== undefined) state.day = fields.producedOn;
              state.version += 1;
              return batchId;
            }),
          setInputActual: (inputId, before, actual) =>
            later('setInputActual', () => {
              const now = whole(state.actual);
              if (now !== before && now !== actual) {
                throw new m.RejectedError('qty_changed', 'تغيّرت الكمية الفعلية لهذه المادّة من نافذة أو جهاز آخر بعد أن بدأت تعديلها؛ قُرئت من جديد، فراجعها واحفظ مرّة أخرى.');
              }
              state.actual = milli(actual);
              state.version += 1;
            }),
          setBatchCost: (costId, before, value) =>
            later('setBatchCost', () => {
              const cost = state.costs.find((entry) => entry.id === costId);
              const now = whole(cost.amount);
              if (now !== before && now !== value) {
                throw new m.RejectedError('amount_changed', 'تغيّر هذا المبلغ من نافذة أو جهاز آخر بعد أن بدأت تعديله؛ قُرئ من جديد، فراجعه واحفظ مرّة أخرى.');
              }
              cost.amount = cents(value);
              state.costsConfirmed = false;
              state.version += 1;
            }),
          addBatchCost: (batchId, id, categoryId, value) =>
            later('addBatchCost', () => {
              const category = CATEGORIES.find((entry) => entry.id === categoryId);
              state.costs.push({ id, category_id: categoryId, category_name: category?.name ?? categoryId, planned: null, amount: cents(value), source: 'manual' });
              state.costsConfirmed = false;
              state.version += 1;
            }),
          confirmCosts: () =>
            later('confirmCosts', () => {
              state.costsConfirmed = true;
              state.version += 1;
              return { ok: true };
            }),
          postProduction: () => ({ doc_no: 'PD-2026-0003' }),
        },
      };
    };

    // ── W31 (ب٣١، ق٤١/ق٤٢): المحلّلات الصارمة والكتل null ─────────────────────────────────────────────────────────────────────
    await step('W31 المحلّل', async () => {
      const safe = (fn) => {
        try {
          return fn();
        } catch (error) {
          return error instanceof Error && error.name === 'MillShapeError' ? error.message : `threw:${error}`;
        }
      };
      const noMismatch = recipeJson();
      delete noMismatch.lines[0].unit_mismatch;
      t.eq(safe(() => m.parseRecipe(noMismatch) && 'ok'), 'mill_shape:unit_mismatch', 'W31 سطر خلطة بلا unit_mismatch: خطأ شكل (المفتاح إلزامي)');
      t.eq(safe(() => m.parseRecipe(recipeJson({ lines: [recipeLine({ unit_mismatch: 'true' })] })) && 'ok'), 'mill_shape:unit_mismatch', 'W31 unit_mismatch غير منطقي: خطأ شكل');
      const draft = safe(() => m.parseRecipe(recipeJson({ lines: [cornLine, dbsLine, kazLine], massKg: null })));
      t.same(
        typeof draft === 'string' ? draft : draft.lines.map((line) => [line.itemId, line.unitMismatch, line.massKg, line.sharePct]),
        [['i-corn', false, 972_000n, 9_720n], ['i-dbs', true, null, null], ['i-kaz', true, null, null]],
        'W31 unit_mismatch لكلّ سطر، والكتلة والحصّة null تُقرآن null لا صفراً',
      );
      t.eq(typeof draft === 'string' ? draft : draft.massKg, null, 'W31 مجموع الكتلة null يُقرأ null لا صفراً');
      const noMass = recipeJson({ lines: [cornLine, dbsLine] });
      delete noMass.lines[1].mass_kg;
      t.eq(safe(() => m.parseRecipe(noMass) && 'ok'), 'mill_shape:mass_kg', 'W31 كتلة السطر غائبة: خطأ شكل (null مقصود والغياب لا)');
      const noShare = recipeJson({ lines: [cornLine] });
      delete noShare.lines[0].share_pct;
      t.eq(safe(() => m.parseRecipe(noShare) && 'ok'), 'mill_shape:share_pct', 'W31 حصّة السطر غائبة: خطأ شكل');
      const noRoot = recipeJson();
      delete noRoot.mass_kg;
      t.eq(safe(() => m.parseRecipe(noRoot) && 'ok'), 'mill_shape:mass_kg', 'W31 مجموع الكتلة غائب: خطأ شكل');
      const cards = safe(() => m.parseRecipes(overview([piece('i-corn', 'ذرة صفراء', '972.000'), piece('i-dbs', 'دبس', null), piece('i-kaz', 'كاز', '17.000', false)])));
      t.same(typeof cards === 'string' ? cards : cards[0].pieces.map((entry) => [entry.key, entry.weight]), [['i-corn', 972_000n], ['i-dbs', null], ['i-kaz', 17_000n]], 'W31 كتلة قطعة الشريط null تُقرأ null');
      const noPieceMass = overview([piece('i-corn', 'ذرة صفراء', '972.000')]);
      delete noPieceMass.recipes[0].active.pieces[0].mass_kg;
      t.eq(safe(() => m.parseRecipes(noPieceMass) && 'ok'), 'mill_shape:mass_kg', 'W31 كتلة القطعة غائبة: خطأ شكل');
    });

    await step('W31 بطاقة الخلطة', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: [cornLine, dbsLine, kazLine], massKg: null })) });
      await mount('/mill/recipe/r-1');
      const block = byAction('unit-mismatch')[0];
      t.same(
        block ? noticeTitles().filter((title) => block.textContent.includes(title)) : [],
        ['صارت «دبس» تُقاس بالكيلوغرام: احذف سطرها وأضفه بالكيلوغرام.', 'صارت «كاز» تُقاس بالكيلوغرام: احذف سطرها وأضفه بالكيلوغرام.'],
        'W31 لكلّ سطر unit_mismatch في المسوّدة جملة تقول ما العمل',
      );
      const table = tableOf('مواد الخلطة وحصّة كلّ مادّة من الأساس');
      const mass = table?.headers.indexOf('بالكيلوغرام') ?? -1;
      const share = table?.headers.indexOf('الحصّة') ?? -1;
      t.same((table?.rows ?? []).map((row) => [row[0], row[mass], row[share]]), [['ذرة صفراء', '972', '97.20٪'], ['دبس', '—', '—'], ['كاز', '—', 'خارج الكتلة']], 'W31 كتلة السطر وحصّته «—» حين لا تُعرف');
      t.eq(table?.footAt(mass) ?? null, '—', 'W31 والمجموع «—» (سطر داخل الكتلة بلا كتلة)');
      const titles = barTitles(all().find((n) => n.getAttribute('role') === 'presentation'));
      t.ok(titles.length === 1 && titles[0].startsWith('ذرة صفراء') && !titles.some((title) => title.includes('دبس')), `W31 شريط التركيبة يتخطّى القطعة بلا كتلة (${titles.join(' | ')})`);
      t.ok(noticeTitles().includes('لا يُحسب المجموع: كتلة سطر أو أكثر لا تُعرف.') && !text().includes('المجموع مطابق للأساس'), 'W31 لا «مطابق» ولا مجموع صفري، وجملة تقول إنّه لا يُحسب');
      t.eq(disabled(byAction('activate-version')[0]), true, 'W31 «فعّل النسخة» معطَّل (الخادم يرفضها bad_recipe_unit)');
      const chip = all().find((n) => n.localName === 'span' && (n.getAttribute('class') ?? '').includes('rounded-full') && n.textContent.startsWith('الغذاء'));
      t.eq(chip?.textContent ?? null, 'الغذاء—', 'W31 رقاقة القسم الذي فيه كتلة لا تُعرف «—» لا مجموع ناقص');
    });
    await step('W31 بطاقة الخلطة لغير المدير', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: [cornLine, dbsLine], massKg: null })) });
      await mount('/mill/recipe/r-1');
      const block = byAction('unit-mismatch')[0];
      t.eq(block?.textContent ?? null, 'صارت «دبس» تُقاس بالكيلوغرام: يحذف المالك أو المدير سطرها ويضيفه بالكيلوغرام.', 'W31 لمن لا يعدّل الخلطة: الجملة لا تدلّه على فعل ليس له (درس ب٣٧)');
    });
    await step('W31 بالقطعة', async () => {
      const bag = recipeLine({ id: 'l-4', line_no: 4, item_id: 'i-bag', item_name: 'كيس', kind: 'raw', base_unit: 'pc', qty: '5.000', unit: 'L', mass_kg: null, share_pct: null, unit_mismatch: true });
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: [cornLine, bag], massKg: null })) });
      await mount('/mill/recipe/r-1');
      t.eq(byAction('unit-mismatch')[0]?.textContent ?? null, 'صارت «كيس» تُقاس بالقطعة، فلا تدخل الخلطة: يُحذف سطرها.', 'W31 مادّة صارت بالقطعة: لا «أضفه بالكيلوغرام»');
      // سطر المسوّدة بلا لقطة: base_unit وحدة المادّة الآن، فخانة سعر الكلفة تسمّيها ولو لم تكن المادّة في pick_items (القطعة لا تُرشَّح لسطر).
      t.eq(byAction('cost-price').map((input) => input.getAttribute('aria-label'))[1] ?? null, 'سعر كلفة «كيس» لكلّ قطعة', 'W31 سعر كلفة سطر المسوّدة بوحدة المادّة الآن');
    });
    await step('W31 المفعَّلة', async () => {
      // ق٤١: سطر لتر في نسخة مجمَّدة ومادّته صارت بالكيلو يُخطَّط من لقطة الكثافة، فكتلته معروفة ولا جملة «احذف سطرها».
      const frozen = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-dbs', item_name: 'دبس', qty: '20.000', unit: 'L', mass_kg: '28.000', share_pct: '2.80', unit_mismatch: true });
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', lines: [cornLine, frozen] })) });
      await mount('/mill/recipe/r-1');
      const table = tableOf('مواد الخلطة وحصّة كلّ مادّة من الأساس');
      const mass = table?.headers.indexOf('بالكيلوغرام') ?? -1;
      t.same([byAction('unit-mismatch').length, table?.rows[1]?.[mass] ?? null], [0, '28'], 'W31 ضابط: في المفعَّلة لا جملة، والكتلة من لقطة الكثافة');
    });
    await step('W31 وحدة سعر الكلفة', async () => {
      // ق٤١: unit_changed لاتّجاه رفض الإنتاج وحده، فلقطة لتر لمادّة صارت بالكيلو لا يقولها؛ وسعر الكلفة لوحدة المادّة الآن (pick_items بوحدتها
      // الحيّة). «دبس» مكتوب باللتر (unit_mismatch)، و«زيت» سائل كان مكتوباً بالكيلو (لا unit_mismatch)، وكلاهما صار بالكيلو؛ و«كاز» رُفض.
      const dbs = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-dbs', item_name: 'دبس', base_unit: 'L', qty: '20.000', unit: 'L', mass_kg: '28.000', share_pct: '2.80', unit_mismatch: true });
      const oil = recipeLine({ id: 'l-3', line_no: 3, item_id: 'i-oil', item_name: 'زيت', base_unit: 'L', qty: '92.000', unit: 'kg', mass_kg: '92.000', share_pct: '9.20' });
      const kaz = recipeLine({ id: 'l-4', line_no: 4, item_id: 'i-kaz', item_name: 'كاز', kind: 'fuel', category_name: null, qty: '17.000', mass_kg: '17.000', share_pct: null, in_basis: false, unit_changed: true });
      const pickItems = [CORN_PICK, { id: 'i-dbs', name: 'دبس', base_unit: 'kg', category_name: 'الغذاء' }, { id: 'i-oil', name: 'زيت', base_unit: 'kg', category_name: 'الغذاء' }];
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', lines: [cornLine, dbs, oil, kaz], massKg: '1092.000', pickItems })) });
      await mount('/mill/recipe/r-1');
      t.same(
        byAction('cost-price').map((input) => input.getAttribute('aria-label')),
        ['سعر كلفة «ذرة صفراء» لكلّ كغم', 'سعر كلفة «دبس» لكلّ كغم', 'سعر كلفة «زيت» لكلّ كغم', 'سعر كلفة «كاز» بوحدتها الحالية'],
        'W31 خانة سعر الكلفة تسمّي وحدة المادّة الآن لا لقطة اللتر، وبلا وحدة حين لا تُعرف حيّةً',
      );
    });
    await step('W31 بطاقة المعمل', async () => {
      const pieces = [piece('i-corn', 'ذرة صفراء', '972.000'), piece('i-dbs', 'دبس', null), piece('i-kaz', 'كاز', '17.000', false)];
      fresh(MANAGER, {
        loadMill: () => ({ today: '2026-11-04', recipes: m.parseRecipes(overview(pieces)), stores: overview(pieces).stores, feedItems: [], productions: { drafts: [], rows: [], total: 0 } }),
      });
      await mount('/mill');
      const card = all().find((n) => n.localName === 'article');
      const titles = barTitles(card);
      t.ok(titles.length === 1 && !titles.some((title) => title.includes('دبس')), `W31 شريط بطاقة المعمل يتخطّى القطعة بلا كتلة (${titles.join(' | ')})`);
      const chip = card ? descendants(card).find((n) => n.localName === 'span' && (n.getAttribute('class') ?? '').includes('rounded-full') && n.textContent.startsWith('دبس')) : null;
      t.eq(chip?.textContent ?? null, 'دبس—', 'W31 رقاقة المادّة بلا كتلة «—» لا صفر');
    });

    // ── W32 (ب٣٢): القفل أثناء الحفظ، وEnter، ولا يُمسح مسوَّد إلّا إن بقي كما أُرسل ─────────────────────────────────────────────────
    await step('W32 الفعلي', async () => {
      const holds = { setInputActual: deferred() };
      const server = batchServer({ holds });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('input-actual')[0], '1010');
      await settle();
      await click(byAction('input-actual-save')[0]);
      t.same(
        [disabled(byAction('input-actual')[0]), disabled(byAction('cost-amount')[0]), disabled(byAction('new-cost-category')[0]), disabled(byAction('new-cost-amount')[0]), disabled(byAction('new-category-name')[0])],
        [true, true, true, true, true],
        'W32 أثناء الحفظ: خانة الفعلي وخانة المبلغ وحقلا السطر الجديد و«فئة جديدة» مقفولة',
      );
      // كتابة رغم القفل (DOM الفحص لا يمنعها): ما تغيّر بعد الإرسال يبقى.
      type(byAction('input-actual')[0], '1020');
      await settle();
      holds.setInputActual.resolve();
      await settle();
      t.eq(valueOf('input-actual'), '1020', 'W32 ما كُتب في خانة الفعلي أثناء حفظها يبقى بعده');
      t.same([disabled(byAction('post-production')[0]), sentence('post-unsaved')], [true, gate('الكمية الفعلية من «ذرة صفراء»')], 'W32 و«أنتج الآن» معطَّل يسمّيه (لا تنفتح البوّابة على القيمة الأقدم)');
      await press(byAction('post-production')[0]);
      t.eq(named(calls, 'postProduction').length, 0, 'W32 ولا ترحيل بالقيمة الأقدم');
      await press(byAction('input-actual-save')[0]);
      t.same(
        named(calls, 'setInputActual').map(([inputId, before, actual]) => [inputId, before, actual]),
        [['in-1', null, 1_010_000n], ['in-1', 1_010_000n, 1_020_000n]],
        'W32 الحفظ التالي مشروط بما حُفظ الآن لا بما قبل الأوّل',
      );
      t.same([text().includes('من نافذة أو جهاز آخر'), valueOf('input-actual'), server.state.actual], [false, '1020.000', '1020.000'], 'W32 ولا «من جهاز آخر» لكتابة الصفحة نفسها، والمحفوظ ما كُتب أخيراً');
    });
    await step('W32 الفعلي كما أُرسل', async () => {
      const server = batchServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('input-actual')[0], '1010');
      await settle();
      await click(byAction('input-actual-save')[0]);
      t.same([valueOf('input-actual'), byAction('post-unsaved').length, disabled(byAction('post-production')[0])], ['1010.000', 0, false], 'W32 ضابط: المعروض كما أُرسل فيُمسح المسوَّد ويُعرض المحفوظ');
    });
    await step('W32 Enter', async () => {
      const holds = { setInputActual: deferred() };
      const server = batchServer({ holds });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('input-actual')[0], '1010');
      await settle();
      await enter(byAction('input-actual')[0]);
      type(byAction('input-actual')[0], '1020');
      await settle();
      await enter(byAction('input-actual')[0]);
      t.eq(named(calls, 'setInputActual').length, 1, 'W32 Enter أثناء الحفظ لا يرسل حفظاً ثانياً');
      holds.setInputActual.resolve();
      await settle();
      t.ok(!text().includes('من نافذة أو جهاز آخر'), 'W32 ولا رفض «من جهاز آخر» لكتابة المستخدم نفسه');
    });
    await step('W32 محرّر الخلية', async () => {
      // Enter في المحرّر نفسه لا يحفظ أثناء busy، ولو لم يُقفل (بطاقة الخلطة تمرّر busy وحده).
      const saves = [];
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      const cellRoot = m.createRoot(container);
      const draw = (busy) =>
        m.flushSync(() => cellRoot.render(m.h(m.CellEdit, { id: 'c', label: 'خانة', value: '5', dirty: true, invalid: false, busy, action: 'probe-cell', onChange: () => {}, onSave: () => saves.push(busy) })));
      draw(true);
      await enter(byAction('probe-cell')[0]);
      t.eq(saves.length, 0, 'W32 محرّر الخلية: Enter أثناء busy لا يحفظ');
      draw(false);
      await enter(byAction('probe-cell')[0]);
      t.same(saves, [false], 'W32 ضابط: Enter بلا busy يحفظ');
      m.flushSync(() => cellRoot.unmount());
      body().textContent = '';
    });
    await step('W32 المبلغ', async () => {
      const holds = { setBatchCost: deferred() };
      const server = batchServer({ holds });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('cost-amount')[0], '16000');
      await settle();
      await click(byAction('cost-amount-save')[0]);
      t.eq(disabled(byAction('cost-amount')[0]), true, 'W32 خانة المبلغ مقفولة أثناء حفظها');
      type(byAction('cost-amount')[0], '17000');
      await settle();
      holds.setBatchCost.resolve();
      await settle();
      t.eq(valueOf('cost-amount'), '17000', 'W32 ما كُتب في خانة المبلغ أثناء حفظها يبقى بعده');
      t.same([disabled(byAction('post-production')[0]), sentence('post-unsaved')], [true, gate('مبلغ «أيدي عاملة»')], 'W32 و«أنتج الآن» معطَّل يسمّيه');
      await press(byAction('cost-amount-save')[0]);
      t.same(
        named(calls, 'setBatchCost').map(([costId, before, value]) => [costId, before, value]),
        [['pc-1', 1_500_000n, 1_600_000n], ['pc-1', 1_600_000n, 1_700_000n]],
        'W32 الحفظ التالي للمبلغ مشروط بما حُفظ الآن',
      );
      t.same([text().includes('من نافذة أو جهاز آخر'), server.state.costs[0].amount], [false, '17000.00'], 'W32 ولا رفض «من جهاز آخر»، والمحفوظ ما كُتب أخيراً');
    });
    await step('W32 السطر الجديد', async () => {
      const holds = { addBatchCost: deferred() };
      const server = batchServer({ holds });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      choose(byAction('new-cost-category')[0], 'c-power');
      type(byAction('new-cost-amount')[0], '500');
      await settle();
      await click(byAction('add-cost')[0]);
      t.same([disabled(byAction('new-cost-category')[0]), disabled(byAction('new-cost-amount')[0])], [true, true], 'W32 حقلا السطر الجديد مقفولان أثناء إضافته');
      type(byAction('new-cost-amount')[0], '700');
      await settle();
      holds.addBatchCost.resolve();
      await settle();
      t.same(named(calls, 'addBatchCost').map(([, , categoryId, value]) => [categoryId, value]), [['c-power', 50_000n]], 'W32 أُضيف السطر بما كان لحظة النقر');
      t.eq(valueOf('new-cost-amount'), '700', 'W32 ما كُتب في مبلغ السطر الجديد أثناء إضافته يبقى بعده');
      t.same([disabled(byAction('post-production')[0]), sentence('post-unsaved')], [true, gate('سطر التكلفة الجديد')], 'W32 و«أنتج الآن» معطَّل يسمّيه');
    });
    await step('W32 السطر الجديد كما أُرسل', async () => {
      const server = batchServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      choose(byAction('new-cost-category')[0], 'c-power');
      type(byAction('new-cost-amount')[0], '500');
      await settle();
      await click(byAction('add-cost')[0]);
      t.same([valueOf('new-cost-amount'), picked(byAction('new-cost-category')[0]), byAction('post-unsaved').length], ['', '', 0], 'W32 ضابط: السطر الجديد كما أُرسل يُفرَّغ');
    });

    // ── W33 (ب٣٣): البطاقة والمعاينة من نسخة واحدة ────────────────────────────────────────────────────────────────────────────
    const readAs = (version, day) => serverBatch({ version, day });
    await step('W33 تُعاد القراءتان', async () => {
      // حفظ جهاز آخر يوم الإنتاج بين قراءة البطاقة (النسخة 7، يوم 04/11) والمعاينة (النسخة 8، يوم 02/11): تُعادان فتتطابقان.
      let reads = 0;
      const calls = fresh(MANAGER, {
        loadBatch: () => {
          reads += 1;
          return m.parseBatch(batchJson(reads === 1 ? readAs(7, '2026-11-04') : readAs(8, '2026-11-02')));
        },
        previewProduction: () => m.parsePreview(previewJson(readAs(8, '2026-11-02'))),
        loadExpenseCategories: () => CATEGORIES,
        postProduction: () => ({ doc_no: 'PD-2026-0003' }),
      });
      await mount('/mill/batch/b-1');
      t.same([valueOf('produced-on'), text().includes('04/11/2026'), byAction('reload-batch').length], ['02/11/2026', false, 0], 'W33 الصفحة تعرض القراءة التي تطابق المعاينة (02/11) لا الأقدم');
      t.eq(named(calls, 'loadBatch').length, 2, 'W33 أُعيدت قراءة البطاقة مرّة');
      await press(byAction('post-production')[0]);
      t.same(named(calls, 'postProduction').map(([batchId, version, plan]) => [batchId, version, plan]), [['b-1', 8, 'tok-8']], 'W33 والترحيل بالنسخة المعروضة');
    });
    await step('W33 لا تتطابقان', async () => {
      let previewVersion = 8;
      const calls = fresh(MANAGER, {
        loadBatch: () => m.parseBatch(batchJson(readAs(7, '2026-11-04'))),
        previewProduction: () => m.parsePreview(previewJson(readAs(previewVersion, '2026-11-04'))),
        loadExpenseCategories: () => CATEGORIES,
        postProduction: () => ({ doc_no: 'PD-2026-0003' }),
      });
      await mount('/mill/batch/b-1');
      t.same(
        [noticeTitles().includes('تغيّرت الدفعة الآن من جهاز آخر؛ حدّث الصفحة.'), disabled(byAction('post-production')[0])],
        [true, true],
        'W33 بعد ثلاث محاولات بنسختين: جملة «تغيّرت الدفعة الآن» و«أنتج الآن» معطَّل',
      );
      t.same([named(calls, 'loadBatch').length, named(calls, 'previewProduction').length], [3, 3], 'W33 ثلاث محاولات لا أكثر');
      await press(byAction('post-production')[0]);
      t.eq(named(calls, 'postProduction').length, 0, 'W33 ولا ترحيل بنسخة لم تُعرض');
      previewVersion = 7;
      await press(byAction('reload-batch')[0]);
      t.same([noticeTitles().includes('تغيّرت الدفعة الآن من جهاز آخر؛ حدّث الصفحة.'), disabled(byAction('post-production')[0])], [false, false], 'W33 «حدّث الصفحة» يعيد القراءة فتتطابقان');
      await press(byAction('post-production')[0]);
      t.same(named(calls, 'postProduction').map(([batchId, version, plan]) => [batchId, version, plan]), [['b-1', 7, 'tok-7']], 'W33 والترحيل بعدها بالنسخة المعروضة');
    });

    // ── W34 (ب٣٤): «اختم الكلف» معطَّل ما دام في التكاليف ما لم يُحفظ ─────────────────────────────────────────────────────────────
    await step('W34 المحاسب والمبلغ', async () => {
      const server = batchServer();
      const calls = fresh(ACCOUNTANT, server.handlers);
      await mount('/mill/batch/b-1');
      t.eq(disabled(byAction('seal-costs')[0]), false, 'W34 ضابط: بلا مكتوب «اختم الكلف» مفعَّل');
      type(byAction('cost-amount')[0], '16000');
      await settle();
      t.same([disabled(byAction('seal-costs')[0]), sentence('seal-unsaved')], [true, sealGate('مبلغ «أيدي عاملة»')], 'W34 مبلغ لم يُحفظ: «اختم الكلف» معطَّل وتحته جملة تسمّيه');
      await press(byAction('seal-costs')[0]);
      t.eq(named(calls, 'confirmCosts').length, 0, 'W34 ولا يُختم المحفوظ وفي الخانة مبلغ آخر');
      await click(byAction('cost-amount-save')[0]);
      t.same([disabled(byAction('seal-costs')[0]), byAction('seal-unsaved').length], [false, 0], 'W34 بعد حفظ المبلغ «اختم الكلف» مفعَّل بلا جملة');
      await press(byAction('seal-costs')[0]);
      t.same(named(calls, 'confirmCosts'), [['b-1', 8]], 'W34 ويُختم بعد الحفظ بنسخة الدفعة');
    });
    for (const kind of [
      { key: 'السطر الجديد', label: 'سطر التكلفة الجديد', fill: () => choose(byAction('new-cost-category')[0], 'c-power') },
      { key: 'الفئة الجديدة', label: 'اسم الفئة الجديدة «نقل»', fill: () => type(byAction('new-category-name')[0], 'نقل') },
    ]) {
      await step(`W34 ${kind.key}`, async () => {
        const server = batchServer();
        const calls = fresh(ACCOUNTANT, server.handlers);
        await mount('/mill/batch/b-1');
        kind.fill();
        await settle();
        t.same([disabled(byAction('seal-costs')[0]), sentence('seal-unsaved')], [true, sealGate(kind.label)], `W34 ${kind.key} وحده: «اختم الكلف» معطَّل ويسمّيه`);
        await press(byAction('seal-costs')[0]);
        t.eq(named(calls, 'confirmCosts').length, 0, `W34 ${kind.key}: لا ختم`);
      });
    }
    await step('W34 الوزن لا يمسّ الختم', async () => {
      const server = batchServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      t.same(
        [disabled(byAction('seal-costs')[0]), byAction('seal-unsaved').length, disabled(byAction('post-production')[0]), sentence('post-unsaved')],
        [false, 0, true, gate('وزن الناتج')],
        'W34 ضابط: الوزن غير المحفوظ بوّابة «أنتج الآن» لا «اختم الكلف» (الختم للمبالغ وحدها)',
      );
    });

    // ── W35 (ب٣٥): «أرجع ما لم يُحفظ»، ويوم الإنتاج الفارغ غير مكتوب ─────────────────────────────────────────────────────────────
    await step('W35 الإرجاع', async () => {
      const server = batchServer({ state: serverBatch({ weight: '985.000', tracksExpiry: true, expiry: '2026-12-15' }) });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '960');
      type(byAction('waste-reason')[0], 'رطوبة عالية');
      type(byAction('output-expiry')[0], '31/12/2026');
      type(byAction('produced-on')[0], '05/11/2026');
      type(byAction('input-actual')[0], '1010');
      type(byAction('cost-amount')[0], '16000');
      choose(byAction('new-cost-category')[0], 'c-power');
      type(byAction('new-cost-amount')[0], '500');
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      t.eq(
        sentence('post-unsaved'),
        gate('وزن الناتج، سبب الهدر، تاريخ انتهاء الناتج، يوم الإنتاج، الكمية الفعلية من «ذرة صفراء»، مبلغ «أيدي عاملة»، سطر التكلفة الجديد، اسم الفئة الجديدة «نقل»'),
        'W35 الجملة «أرجعه إلى المحفوظ» (لا «امسحه») وتسمّي الثمانية',
      );
      t.eq(byAction('revert-unsaved').length, 1, 'W35 بجانبها زرّ واحد «أرجع ما لم يُحفظ»');
      await press(byAction('revert-unsaved')[0]);
      t.same([byAction('post-unsaved').length, byAction('seal-unsaved').length, disabled(byAction('post-production')[0])], [0, 0, false], 'W35 بعد الإرجاع: القائمة فارغة و«أنتج الآن» مفعَّل');
      t.same(
        ['output-weight', 'waste-reason', 'output-expiry', 'produced-on', 'input-actual', 'cost-amount', 'new-cost-amount', 'new-category-name'].map(valueOf),
        ['985.000', '', '15/12/2026', '04/11/2026', '', '15000.00', '', ''],
        'W35 كلّ الحقول على المحفوظ',
      );
      t.eq(picked(byAction('new-cost-category')[0]), '', 'W35 وفئة السطر الجديد فارغة');
      t.eq(disabled(byAction('save-weight')[0]), true, 'W35 و«احفظ ما كتبته هنا» معطَّل');
      await press(byAction('save-weight')[0]);
      t.same(
        ['setBatchFields', 'setInputActual', 'setBatchCost', 'addBatchCost'].map((name) => named(calls, name).length),
        [0, 0, 0, 0],
        'W35 والحفظ بعده لا يرسل شيئاً (لا وزن ممسوح ولا قيمة قديمة)',
      );
    });
    await step('W35 مسح الوزن عن قصد', async () => {
      const server = batchServer({ state: serverBatch({ weight: '985.000' }) });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '');
      await settle();
      t.eq(sentence('post-unsaved'), gate('وزن الناتج'), 'W35 الوزن الممسوح غير محفوظ يُسمّى');
      await click(byAction('save-weight')[0]);
      t.same(named(calls, 'setBatchFields').map(([batchId, fields]) => [batchId, fields]), [['b-1', { outputQtyKg: null }]], 'W35 ضابط: حفظ الفراغ («لم يُوزن») يبقى ممكناً عن قصد');
    });
    await step('W35 يوم الإنتاج الفارغ', async () => {
      const server = batchServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('produced-on')[0], '');
      await settle();
      t.same(
        [byAction('post-unsaved').length, text().includes('اكتب يوم الإنتاج'), disabled(byAction('save-weight')[0]), disabled(byAction('post-production')[0])],
        [0, false, true, false],
        'W35 اليوم الممسوح غير مكتوب: لا يدخل القائمة ولا خطأ ولا يقفل «أنتج الآن»',
      );
      fire(byAction('produced-on')[0], 'focusout');
      await settle();
      t.eq(valueOf('produced-on'), '04/11/2026', 'W35 ويعود إلى المحفوظ حين يُغادَر الحقل');
      type(byAction('produced-on')[0], '');
      type(byAction('output-weight')[0], '960');
      await settle();
      t.same([sentence('post-unsaved'), disabled(byAction('save-weight')[0])], [gate('وزن الناتج'), false], 'W35 والوزن معه يُحفظ ولا يقفله اليوم الممسوح');
      await click(byAction('save-weight')[0]);
      t.same(named(calls, 'setBatchFields').map(([batchId, fields]) => [batchId, fields]), [['b-1', { outputQtyKg: 960_000n }]], 'W35 ولا يُرسل اليوم الممسوح');
    });
    await step('W35 بلا بوّابة', async () => {
      // مشغّل المعمل قبل ختم الكلف لا يرى «أنتج الآن» ولا «اختم الكلف»: لا جملة بوّابة، فلا زرّ إرجاع معلَّق بلا جملته.
      const server = batchServer({ problemsOf: () => [{ code: 'costs_pending' }], expensesVisible: false });
      fresh(OPERATOR, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      t.same([byAction('post-unsaved').length, byAction('revert-unsaved').length], [0, 0], 'W35 ضابط: بلا بوّابة لا جملة ولا زرّ إرجاع');
    });

    // ── W36 (ب٣٦): المكتوب غير الصالح في البوّابة، ويوم «5/11/2026» بعد الحفظ ─────────────────────────────────────────────────────
    const invalid = [
      { key: 'وزن «0»', label: 'وزن الناتج', fill: () => type(byAction('output-weight')[0], '0') },
      { key: 'تاريخ انتهاء «31/02/2026»', label: 'تاريخ انتهاء الناتج', fill: () => type(byAction('output-expiry')[0], '31/02/2026') },
      { key: 'يوم «31/02/2026»', label: 'يوم الإنتاج', fill: () => type(byAction('produced-on')[0], '31/02/2026') },
      { key: 'فئة سطر جديد بلا مبلغ', label: 'سطر التكلفة الجديد', fill: () => choose(byAction('new-cost-category')[0], 'c-power') },
    ];
    for (const kind of invalid) {
      await step(`W36 ${kind.key}`, async () => {
        const server = batchServer({ state: serverBatch({ tracksExpiry: true, expiry: '2026-12-15' }) });
        const calls = fresh(MANAGER, server.handlers);
        await mount('/mill/batch/b-1');
        kind.fill();
        await settle();
        await press(byAction('post-production')[0]);
        t.same(
          [disabled(byAction('post-production')[0]), sentence('post-unsaved'), named(calls, 'postProduction').length],
          [true, gate(kind.label), 0],
          `W36 ${kind.key}: في القائمة و«أنتج الآن» معطَّل ولا ترحيل`,
        );
      });
    }
    await step('W36 يوم «5/11/2026»', async () => {
      const server = batchServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('produced-on')[0], '5/11/2026');
      await settle();
      await click(byAction('save-weight')[0]);
      t.same(named(calls, 'setBatchFields').map(([, fields]) => fields), [{ producedOn: '2026-11-05' }], 'W36 يُحفظ يوم تقويم');
      t.same([valueOf('produced-on'), disabled(byAction('save-weight')[0]), byAction('post-unsaved').length], ['05/11/2026', true, 0], 'W36 وبعد الحفظ «05/11/2026» من المحفوظ و«احفظ» معطَّل');
    });

    // ── W37 (ب٣٧): «لا تكاليف» بالدور ─────────────────────────────────────────────────────────────────────────────────────
    const threeVersions = [
      { id: 'v-3', version_no: 3, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 5 },
      { id: 'v-2', version_no: 2, status: 'active', basis_kg: '1000.000', activated_at: '2026-11-01T08:00:00Z', version: 5 },
      { id: 'v-1', version_no: 1, status: 'retired', basis_kg: '1000.000', activated_at: '2026-10-01T08:00:00Z', version: 5 },
    ];
    const others = 'لا تكاليف على هذه النسخة؛ يضيفها المالك أو المدير في مسوّدة الخلطة.';
    await step('W37 المحاسب ومسوّدة قائمة', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', versionId: 'v-2', versionNo: 2, versions: threeVersions })) });
      await mount('/mill/recipe/r-1');
      t.same([text().includes(others), text().includes('افتحها لإضافة تكلفة'), byAction('rates-open-draft').length], [true, false, 0], 'W37 المحاسب: «يضيفها المالك أو المدير» لا «افتحها لإضافة تكلفة»');
    });
    await step('W37 المدير ومسوّدة قائمة', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', versionId: 'v-2', versionNo: 2, versions: threeVersions })) });
      await mount('/mill/recipe/r-1');
      t.same(
        [text().includes('لهذه الخلطة مسوّدة قائمة (نسخة 3): افتحها لإضافة تكلفة.'), text().includes(others), byAction('rates-open-draft').length],
        [true, false, 1],
        'W37 ضابط: المدير يرى «افتحها لإضافة تكلفة» وزرّ فتح المسوّدة',
      );
    });
    await step('W37 المحاسب بلا مسوّدة', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'active', versionId: 'v-2', versionNo: 2, versions: threeVersions.slice(1) })) });
      await mount('/mill/recipe/r-1');
      t.same([text().includes(others), text().includes('أنشئ نسخة جديدة'), byAction('rates-new-version').length], [true, false, 0], 'W37 المحاسب بلا مسوّدة: لا «أنشئ نسخة جديدة» وهو لا ينشئها');
    });
    await step('W37 المحاسب في المسوّدة', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(recipeJson({ status: 'draft', versionId: 'v-3', versionNo: 3, versions: threeVersions })) });
      await mount('/mill/recipe/r-1');
      t.same([text().includes(others), text().includes('أضفها إن كان للعلف'), byAction('add-rate').length], [true, false, 0], 'W37 المحاسب في المسوّدة: لا «أضفها» وهو لا يضيف');
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
