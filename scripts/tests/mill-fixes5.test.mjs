// الجولة الخامسة من إصلاحات شاشات المعمل (القسم «ب» من fixes5.md، ب٤١–ب٤٩): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// MillRoutes الحقيقية، وrepo المعمل والمخزون والجلسة والرسائل بدائل، والمحلّلات الحقيقية تقرأ أجوبة بشكل القسم «أ» (density_missing على سطر
// الخلطة، وskipped في جواب «نسخة جديدة»)، ومنها جوابا القاعدة الحقيقيان من مسبار المراجعة الخامسة (مسوّدة «كاز المولّد» خارج الكتلة،
// ومسوّدة «شراب بلا كثافة»). و«الخادمان» البديلان للدفعة والخلطة يكتبان بشرط القيمة التي شافتها الشاشة كما يفعل repo الحقيقي والخادم
// (صفر صفوف ← qty_changed/amount_changed، والسعر السابق ← price_changed، والنسخة ← stale_draft، والبصمة ← stale_preview).
// V41 «فعّل النسخة» و«المجموع مطابق» مع سطر يرفض الخادم التفعيل به (ب٤١)؛ V42 القراءة من جديد بعد رفض «تغيّر من جهاز آخر» والحفظ التالي
// و«أرجع» (ب٤٢)؛ V43 الصفحة مرسومة أثناء القراءة من جديد والأفعال معطَّلة أثناء الحفظ (ب٤٣)؛ V44 قفل خانات المال وحقول التكلفة الجديدة في
// بطاقة الخلطة والمسح بما أُرسل (ب٤٤)؛ V45 جملة «بلا أيّ سعر» بالدور (ب٤٥)؛ V46 فحوص الطفرات الثلاث الناجية (ب٤٦)؛ V47 «عدّل» لسطر
// unit_mismatch (ب٤٧)؛ V48 skipped (ب٤٨)؛ V49 density_missing (ب٤٩). كلّ حالة جديدة تفشل على نسخة ff22f80 من الشاشات، أو على طفرتها (V46).
// «الخلطة موادّ بلا كميات» (0025): بطاقة الخلطة بلا مجموع ولا أساس ولا أسعار ولا كلفة طنّ متوقّعة ولا «عدّل» لسطر، فخادم الخلطة البديل يرسل مسوّدة موادّ
// بلا كميات، والتفعيل بنسخة المسوّدة وحده (لا أساس يُكتب قبله)؛ وفحوص سعر الكلفة (V42 وV44 وV46) و«بلا أيّ سعر» (V45) والأساس خرجت معها، وV47 صار
// «احذف» وحده لكلّ سطر، والمسوّدتان من القاعدة (بكميات قبل 0025) تقولان «لا تُفعَّل حتّى تُصحَّح السطور» بجملتهما الجديدة.
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
const PURCHASES = ['loadItemsOverview'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__mill.call('${n}', a);`).join(' ')}`;
const STUBS = {
  mill: routed('mill', MILL),
  inventory: routed('inventory', INVENTORY),
  purchases: routed('purchases', PURCHASES),
  session: 'export const useSession = () => globalThis.__mill.session; export const sessionStore = { get: () => globalThis.__mill?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__mill.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'mill-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(mill|inventory|purchases)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'mill-stub' }));
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
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  if (!select) return;
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
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
const cardOf = (id) => byAction('material-card').find((node) => node.getAttribute('data-item') === id);
const qtyOf = (name) => all().find((node) => node.getAttribute('aria-label') === `كمية «${name}»`);
const valueOf = (name) => byAction(name)[0]?.value ?? null;
const deferred = () => {
  let resolve = null;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};
/** عناوين التنبيهات (Notice يرسم العنوان في div بصنف font-semibold). */
const noticeTitles = () => all().filter((n) => n.localName === 'div' && (n.getAttribute('class') ?? '').split(' ').includes('font-semibold')).map((n) => n.textContent);
/** حقل بعنوانه: Field يرسم label بـhtmlFor (for) والحقل بالمعرّف نفسه؛ وفي النافذة (المحمولة على body) كذلك. */
const fieldByLabel = (label) => {
  const tag = all().find((n) => n.localName === 'label' && n.textContent === label);
  const id = tag?.getAttribute('for') ?? null;
  return id === null ? null : (all().find((n) => n.getAttribute('id') === id && n !== tag) ?? null);
};

const ws = (over = {}) => ({
  userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
  divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws() };
const ACCOUNTANT = { status: 'ready', workspace: ws({ role: 'accountant' }) };

// ─── «خادم» الدفعة: القراءة من الحالة المحفوظة، والكتابة مشروطة بما شافته الشاشة كما في repo الحقيقي والخادم ─────────────────────────
const milli = (value) => (value === null ? null : `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`);
const cents = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
const whole = (textValue) => (textValue === null ? null : BigInt(textValue.replace('.', '')));
const CATEGORIES = [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }];
const serverBatch = (over = {}) => ({
  version: 7, planRev: 0, weight: null, reason: null, expiry: null, day: '2026-11-04', actual: null, tracksExpiry: false, costsConfirmed: false,
  costs: [{ id: 'pc-1', category_id: 'c-labor', category_name: 'أيدي عاملة', planned: '15000.00', amount: '15000.00', source: 'recipe' }],
  ...over,
});
/** بصمة المعاينة: تتغيّر بنسخة الدفعة، وبتغيّر المخزون بلا نسخة (planRev) كما يفعل private.plan_token. */
const planOf = (state) => (state.planRev ? `tok-${state.version}-${state.planRev}` : `tok-${state.version}`);
const batchLine = (over = {}) => ({
  id: 'in-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: null, used_qty: null, in_basis: true,
  is_substitute: false, reason: null, replaced_item_name: null, draws: null, money: { value: null }, ...over,
});
const batchJson = (state, { expensesVisible = true } = {}) => ({
  id: 'b-1', doc_no: null, status: 'draft', version: state.version, produced_on: state.day, planned_kg: '1000.000',
  output_qty_kg: state.weight, output_expiry_on: state.expiry, input_mass_kg: null, shrink_kg: null, shrink_pct: null, shrink_reason: state.reason, note: null, void_reason: null,
  costs_confirmed: state.costsConfirmed,
  saved_to_recipe: false,
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
  plan_token: planOf(state),
  expenses_visible: expensesVisible,
  money: {
    input_value: '450000.00', extra_value: '15000.00', total_value: '465000.00', cost_per_kg: '465.00',
    costs: state.costs.map((cost, index) => ({ cost_id: cost.id, line_no: index + 1, category_id: cost.category_id, category_name: cost.category_name, planned_amount: cost.planned, amount: cost.amount, source: cost.source, available: cost.amount })),
  },
});

// ─── أجوبة الخلطة بشكل القسم «أ» ─────────────────────────────────────────────────────────────────────────────────────────
const recipeLine = (over = {}) => ({
  id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '1000.000', unit: 'kg',
  mass_kg: '1000.000', share_pct: '100.00', in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false,
  money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' }, ...over,
});
const CORN_PICK = { id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' };
const recipeJson = ({ status = 'draft', versionId = 'v-1', versionNo = 1, version = 5, versions = null, lines = [recipeLine()], massKg = '1000.000', basis = '1000.000', rates = [], pickItems = [CORN_PICK], unpriced = 0, unconverted = 0, materialsOnly = false } = {}) => ({
  id: 'r-1', name: 'علف بادئ', note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: versions ?? [{ id: versionId, version_no: versionNo, status, basis_kg: materialsOnly ? null : basis, materials_only: materialsOnly, activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version }],
  selected: { id: versionId, version_no: versionNo, status, basis_kg: materialsOnly ? null : basis, materials_only: materialsOnly, note: null, activated_at: null, version },
  // نسخ لكلّ جواب: فحص الشكل يحذف مفاتيح منه، فلا يمسّ السطور المشتركة بين الخطوات.
  lines: lines.map((line) => ({ ...line })),
  mass_kg: massKg,
  pick_items: pickItems,
  expense_categories: CATEGORIES,
  money: { rates, expected: { materials_per_ton: '450000.00', rates_per_ton: '0.00', cost_per_ton: '450000.00', unpriced, unconverted } },
});

// جواب recipe_detail الحقيقي لمسوّدة «كاز المولّد» خارج الكتلة (مسبار المراجعة الخامسة P1 على بوستغريس الحزمة بالهجرات الستّ عشرة،
// rev5/kaz-draft.json): ذرة 1,000 كغم و«كاز المولّد» (fuel) 17 لتراً ثمّ صُحّح الكاز كيلوغراماً. ومعه density_missing لكلّ سطر بتعريف ق٥١
// (الكاز صار بالكيلو، والذرة بالكيلو: false).
const KAZ_DRAFT = () => ({
  id: 'e5050000-0000-4000-8000-000000000101', name: 'بادئ بمولّد', note: null,
  lines: [
    {
      id: '1e818c52-c65f-4f2a-aac1-a4c0dbadf651', qty: '1000.000', kind: 'raw', unit: 'kg', money: { unit_cost: null, cost_price: null, last_price: null },
      item_id: '362d2d13-738e-46c0-a427-a3205ffd234c', line_no: 1, mass_kg: '1000.000', in_basis: true, base_unit: 'kg', item_name: 'ذرة صفراء', share_pct: '100.00',
      category_id: null, unit_changed: false, category_name: null, unit_mismatch: false, density_missing: false,
    },
    {
      id: 'f4c2340f-15fb-48ac-bdb1-e4fdf866cd8b', qty: '17.000', kind: 'fuel', unit: 'L', money: { unit_cost: null, cost_price: null, last_price: null },
      item_id: '3b7f8c80-040d-4e8f-bee7-a9a51c09a8e6', line_no: 2, mass_kg: null, in_basis: false, base_unit: 'kg', item_name: 'كاز المولّد', share_pct: null,
      category_id: null, unit_changed: false, category_name: null, unit_mismatch: true, density_missing: false,
    },
  ],
  money: { rates: [], expected: { unpriced: 2, unconverted: 0, cost_per_ton: '0.00', rates_per_ton: '0.00', materials_per_ton: '0.00' } },
  mass_kg: '1000.000', version: 1, archived: false,
  selected: { id: 'e5050000-0000-4000-8000-000000000102', note: null, status: 'draft', version: 3, basis_kg: '1000', materials_only: false, version_no: 1, activated_at: null },
  versions: [{ id: 'e5050000-0000-4000-8000-000000000102', status: 'draft', version: 3, basis_kg: '1000', materials_only: false, version_no: 1, activated_at: null }],
  pick_items: [
    { id: '362d2d13-738e-46c0-a427-a3205ffd234c', name: 'ذرة صفراء', base_unit: 'kg', category_name: null },
    { id: '3b7f8c80-040d-4e8f-bee7-a9a51c09a8e6', name: 'كاز المولّد', base_unit: 'kg', category_name: null },
  ],
  output_item: { id: 'fe38aa4f-a74f-48bf-8fd2-5d847be74dcd', kind: 'feed', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: false },
  expense_categories: [],
});

// جواب recipe_detail الحقيقي لمسوّدة الشراب (مسبار المراجعة الخامسة #0، rev5/db/p5-recipe.json): ذرة 980 + «شراب بلا كثافة 83» 16 لتراً،
// والشراب ما زال باللتر وفُرّغت كثافته: كتلته والمجموع null. ومعه density_missing بتعريف ق٥١ (الشراب لتر بلا كثافة: true). منتقي المواد مختصر.
const SYRUP_ID = '658d48f4-5921-4357-93ea-14b964cc26f3';
const SYRUP_DRAFT = () => ({
  id: 'c2950000-0000-4000-8000-000000020147', name: 'مسوّدة شراب بلا كثافة 84', note: null,
  lines: [
    {
      id: '5a0d5e52-9da9-4a26-83bb-16f562dfea57', qty: '980.000', kind: 'raw', unit: 'kg', money: { unit_cost: null, cost_price: null, last_price: null },
      item_id: '0c057b21-0fe9-4092-99f6-9fb66f0c95b7', line_no: 1, mass_kg: '980.000', in_basis: true, base_unit: 'kg', item_name: 'ذرة المسبار 1', share_pct: '98.00',
      category_id: null, unit_changed: false, category_name: null, unit_mismatch: false, density_missing: false,
    },
    {
      id: 'dc796cdd-5536-4f1d-9a95-a5e01a1aa892', qty: '16.000', kind: 'raw', unit: 'L', money: { unit_cost: null, cost_price: null, last_price: null },
      item_id: SYRUP_ID, line_no: 2, mass_kg: null, in_basis: true, base_unit: 'L', item_name: 'شراب بلا كثافة 83', share_pct: null,
      category_id: null, unit_changed: false, category_name: null, unit_mismatch: false, density_missing: true,
    },
  ],
  money: { rates: [], expected: { unpriced: 2, unconverted: 0, cost_per_ton: '0.00', rates_per_ton: '0.00', materials_per_ton: '0.00' } },
  mass_kg: null, version: 1, archived: false,
  selected: { id: 'c2950000-0000-4000-8000-000000020148', note: null, status: 'draft', version: 3, basis_kg: '1000', materials_only: false, version_no: 1, activated_at: null },
  versions: [{ id: 'c2950000-0000-4000-8000-000000020148', status: 'draft', version: 3, basis_kg: '1000', materials_only: false, version_no: 1, activated_at: null }],
  pick_items: [
    { id: '0c057b21-0fe9-4092-99f6-9fb66f0c95b7', name: 'ذرة المسبار 1', base_unit: 'kg', category_name: null },
    { id: SYRUP_ID, name: 'شراب بلا كثافة 83', base_unit: 'L', category_name: null },
  ],
  output_item: { id: 'fe38aa4f-a74f-48bf-8fd2-5d847be74dcd', kind: 'feed', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: false },
  expense_categories: [],
});

// الخلطة موادّ بلا كميات (0025): المسوّدة تقول «جاهزة» بعدد موادّها، أو «لا تُفعَّل حتّى تُصحَّح السطور» (لا مجموع).
const BALANCED_BLOCKED = 'لا تُفعَّل الخلطة حتّى تُصحَّح السطور أعلاه.';
const READY = 'الخلطة جاهزة للتفعيل: 1 من المواد.';
/** سطر مسوّدة موادّ بلا كميات (0025). */
const bare = (over = {}) => recipeLine({ qty: null, mass_kg: null, share_pct: null, ...over });
/** بطاقات «أضف مواد»: جواب items_overview بعد محلّله، والبطاقة بمعرّفها، وخانة كميتها باسمها. */
const OVERVIEW = {
  today: '2026-11-04', canRecord: true, canAddItem: true,
  items: [
    { id: 'i-corn', name: 'ذرة صفراء', kind: 'raw', baseUnit: 'kg', onHand: 20_000_000n, purchased: 0n, lastPurchaseOn: null, money: null },
    { id: 'i-soy', name: 'كسبة صويا', kind: 'raw', baseUnit: 'kg', onHand: 0n, purchased: 0n, lastPurchaseOn: null, money: null },
  ],
};
// الجولة السادسة (ب٦١): الكثافة تُكتب من «المواد» (نافذة «عدّل»)، لا في بطاقة المادّة.
const DENSITY_MANAGER = '«شراب بلا كثافة 83» سائل بلا كثافة: اكتب كثافته من «المواد» ثمّ فعّل.';
const DENSITY_OTHERS = '«شراب بلا كثافة 83» سائل بلا كثافة: يكتبها المالك أو المدير من «المواد».';

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
        "export { parseRecipe, parseBatch, parsePreview, parseNewRecipeVersion } from './src/lib/repo/mill.ts';",
        "export { RejectedError, UnknownOutcomeError, ZeroRowsError } from './src/lib/errors.ts';",
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
    const safe = (fn) => {
      try {
        return fn();
      } catch (error) {
        return error instanceof Error && error.name === 'MillShapeError' ? error.message : `threw:${error}`;
      }
    };

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
     * «خادم» دفعة مسوّدة: القراءة والمعاينة من الحالة، والكتابة تحدّثها وتزيد النسخة، وكلّ كتابة تنتظر hold باسمها إن أُعطي، والقراءة الثانية
     * فما بعدها تنتظر holds.reread إن أُعطي. setInputActual وsetBatchCost مشروطتان بالقيمة التي شافتها الشاشة كما في repo الحقيقي، والختم
     * والترحيل بنسخة الدفعة وبصمة المعاينة كما في الخادم: «جهاز آخر» يكتب في state مباشرةً.
     */
    const batchServer = ({ state = serverBatch(), holds = {}, problemsOf = () => [], expensesVisible = true } = {}) => {
      const later = (name, fn) => (holds[name] ? holds[name].promise.then(fn) : fn());
      const counts = { loadBatch: 0 };
      return {
        state,
        counts,
        handlers: {
          loadBatch: () => {
            counts.loadBatch += 1;
            const read = () => m.parseBatch(batchJson(state, { expensesVisible }));
            return holds.reread && counts.loadBatch > 1 ? holds.reread.promise.then(read) : read();
          },
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
          // سطر يدوي بمعرّف من الجهاز كما في repo الحقيقي: الإعادة بالمحتوى نفسه = انكتب، وبمحتوى آخر amount_changed؛ وloseAnswer يكتب ثمّ
          // يضيّع الجواب (UnknownOutcomeError) فيبقى المعرّف للإعادة.
          addBatchCost: (batchId, id, categoryId, value) =>
            later('addBatchCost', () => {
              const existing = state.costs.find((entry) => entry.id === id);
              if (existing) {
                if (existing.category_id === categoryId && whole(existing.amount) === value) return;
                throw new m.RejectedError('amount_changed', 'تغيّر هذا المبلغ من نافذة أو جهاز آخر بعد أن بدأت تعديله؛ قُرئ من جديد، فراجعه واحفظ مرّة أخرى.');
              }
              const category = CATEGORIES.find((entry) => entry.id === categoryId);
              state.costs.push({ id, category_id: categoryId, category_name: category?.name ?? categoryId, planned: null, amount: cents(value), source: 'manual' });
              state.costsConfirmed = false;
              state.version += 1;
              if (state.loseAnswer) {
                state.loseAnswer = false;
                throw new m.UnknownOutcomeError();
              }
            }),
          confirmCosts: (batchId, version) =>
            later('confirmCosts', () => {
              if (version !== state.version) throw new m.RejectedError('stale_draft', 'تغيّرت الدفعة بعد فتحها. حدّث الشاشة وأعد المحاولة.');
              state.costsConfirmed = true;
              state.version += 1;
              return { ok: true };
            }),
          discardBatch: (batchId, version) =>
            later('discardBatch', () => {
              if (version !== state.version) throw new m.RejectedError('stale_draft', 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.');
              return { ok: true };
            }),
          postProduction: (batchId, version, plan) =>
            later('postProduction', () => {
              if (state.rejectPost) throw new m.RejectedError(state.rejectPost, null);
              if (version !== state.version) throw new m.RejectedError('stale_draft', 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.');
              if (plan !== planOf(state)) {
                throw new m.RejectedError('stale_preview', 'تغيّر المخزون بعد المعاينة فتغيّرت الدفعات المسحوبة أو كمياتها. عاين الدفعة من جديد ووافق عليها قبل الترحيل.');
              }
              return { doc_no: 'PD-2026-0003' };
            }),
          createExpenseCategory: () => {
            throw new m.RejectedError('category_name_taken', 'الفئة «نقل» مؤرشفة في منشأتك: أعِدها من الأرشيف بدل فئة جديدة بالاسم نفسه.');
          },
        },
      };
    };

    /**
     * «خادم» خلطة مسوّدة: سعر كلفة الذرة (set_item_cost_price: المحفوظ = المطلوب ← انكتب، والمحفوظ ≠ السابق ← price_changed)، ومعدّلات
     * الطنّ (مشروطة بالمبلغ الذي شافته الشاشة ← amount_changed)، والأساس والتفعيل بنسخة المسوّدة (stale_draft). «جهاز آخر» يكتب في state.
     */
    const recipeServer = ({ holds = {} } = {}) => {
      const state = { costPrice: '450.00', version: 5, basis: '1000.000', status: 'draft', rates: [{ id: 'rr-1', category_id: 'c-labor', category_name: 'أيدي عاملة', amount: '5000.00' }] };
      const later = (name, fn) => (holds[name] ? holds[name].promise.then(fn) : fn());
      let reads = 0;
      const answer = () =>
        m.parseRecipe(
          recipeJson({
            status: state.status,
            version: state.version,
            materialsOnly: true,
            massKg: null,
            lines: [bare({ money: { unit_cost: '430.50', cost_price: state.costPrice, last_price: '440.25' } })],
            rates: state.rates.map((rate, index) => ({ id: rate.id, line_no: index + 1, category_id: rate.category_id, category_name: rate.category_name, amount_per_ton: rate.amount })),
          }),
        );
      return {
        state,
        reads: () => reads,
        handlers: {
          loadItemsOverview: () => OVERVIEW,
          addRecipeLine: (versionId, itemId) => later('addRecipeLine', () => itemId),
          loadRecipe: () => {
            reads += 1;
            return holds.reread && reads > 1 ? holds.reread.promise.then(answer) : answer();
          },
          setItemCostPrice: (itemId, price, expected) =>
            later('setItemCostPrice', () => {
              const now = whole(state.costPrice);
              if (now === price) return price;
              if (now !== expected) throw new m.RejectedError('price_changed', 'تغيّر سعر الكلفة من نافذة أو جهاز آخر بعد أن بدأت تعديله. حدّث الشاشة ثمّ أعِد الكتابة.');
              state.costPrice = price === null ? null : cents(price);
              return price;
            }),
          setRecipeRate: (rateId, before, perTon) =>
            later('setRecipeRate', () => {
              const rate = state.rates.find((entry) => entry.id === rateId);
              const now = whole(rate.amount);
              if (now !== before && now !== perTon) {
                throw new m.RejectedError('amount_changed', 'تغيّر هذا المبلغ من نافذة أو جهاز آخر بعد أن بدأت تعديله؛ قُرئ من جديد، فراجعه واحفظ مرّة أخرى.');
              }
              rate.amount = cents(perTon);
            }),
          addRecipeRate: (versionId, id, categoryId, perTon) =>
            later('addRecipeRate', () => {
              const category = CATEGORIES.find((entry) => entry.id === categoryId);
              state.rates.push({ id, category_id: categoryId, category_name: category?.name ?? categoryId, amount: cents(perTon) });
            }),
          activateVersion: (versionId, version) =>
            later('activateVersion', () => {
              if (state.rejectActivate) throw new m.RejectedError(state.rejectActivate, null);
              if (version !== state.version) throw new m.RejectedError('stale_draft', 'تغيّرت الخلطة بعد فتحها. حدّث الشاشة وراجع سطورها قبل التفعيل.');
              state.status = 'active';
              return { ok: true };
            }),
        },
      };
    };

    // ── V41 (ب٤١): «فعّل النسخة» و«المجموع مطابق» مع سطر يرفض الخادم التفعيل به ───────────────────────────────────────────────────
    await step('V41 مسوّدة الكاز خارج الكتلة (جواب القاعدة)', async () => {
      const calls = fresh(MANAGER, { loadRecipe: () => m.parseRecipe(KAZ_DRAFT()) });
      await mount('/mill/recipe/r-1');
      t.eq(byAction('unit-mismatch')[0]?.textContent ?? null, 'تغيّرت وحدة «كاز المولّد» بعد إضافتها: احذف سطرها وأضفها من جديد.', 'V41 ضابط: جملة الكاز فوق');
      t.same(
        [noticeTitles().includes(BALANCED_BLOCKED), text().includes('جاهزة للتفعيل'), disabled(byAction('activate-version')[0])],
        [true, false, true],
        'V41 المجموع مطابق وسطر unit_mismatch خارج الكتلة: «لا تُفعَّل حتّى تُصحَّح السطور أعلاه» لا «جاهزة»، و«فعّل النسخة» معطَّل',
      );
      await press(byAction('activate-version')[0]);
      t.eq(named(calls, 'activateVersion').length, 0, 'V41 ولا تفعيل يرفضه الخادم bad_recipe_unit');
    });
    await step('V41 المحاسب ومسوّدة الكاز', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(KAZ_DRAFT()) });
      await mount('/mill/recipe/r-1');
      t.same([noticeTitles().includes(BALANCED_BLOCKED), text().includes('جاهزة للتفعيل')], [true, false], 'V41 المحاسب كذلك: لا «جاهزة للتفعيل»');
    });
    await step('V41 مادّة صارت بالقطعة مكتوبة بالكيلو', async () => {
      // «خميرة الدمج» 10 كغم صارت قطعة (مسبار المراجعة P1b): unit_mismatch = false والمجموع 1,000، والتفعيل يُرفض bad_recipe_unit.
      const yeast = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-yeast', item_name: 'خميرة الدمج', base_unit: 'pc', qty: '10.000', mass_kg: '10.000', share_pct: '1.00' });
      const calls = fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: [recipeLine({ qty: '990.000', mass_kg: '990.000', share_pct: '99.00' }), yeast] })) });
      await mount('/mill/recipe/r-1');
      t.eq(byAction('unit-mismatch')[0]?.textContent ?? null, 'صارت «خميرة الدمج» تُقاس بالقطعة، فلا تدخل الخلطة: يُحذف سطرها.', 'V41 جملة القطعة تشمل سطر الكيلو لمادّة صارت قطعة');
      t.same([noticeTitles().includes(BALANCED_BLOCKED), text().includes('جاهزة للتفعيل'), disabled(byAction('activate-version')[0])], [true, false, true], 'V41 ولا «جاهزة»، و«فعّل النسخة» معطَّل');
      await press(byAction('activate-version')[0]);
      t.eq(named(calls, 'activateVersion').length, 0, 'V41 ولا تفعيل');
    });
    await step('V41 سائل بلا كثافة خارج الكتلة', async () => {
      // وقود سائل بلا كثافة (density_missing) خارج الكتلة: المجموع 1,000 معروف، والتفعيل يُرفض density_required.
      const fuel = recipeLine({ id: 'l-2', line_no: 2, item_id: 'i-gas', item_name: 'كاز سائل', kind: 'fuel', base_unit: 'L', category_name: null, qty: '20.000', unit: 'L', mass_kg: null, share_pct: null, in_basis: false, density_missing: true });
      const calls = fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: [recipeLine(), fuel] })) });
      await mount('/mill/recipe/r-1');
      t.same(
        [noticeTitles().includes('«كاز سائل» سائل بلا كثافة: اكتب كثافته من «المواد» ثمّ فعّل.'), noticeTitles().includes(BALANCED_BLOCKED), disabled(byAction('activate-version')[0])],
        [true, true, true],
        'V41 سطر بلا كثافة خارج الكتلة: جملته فوق، و«لا تُفعَّل»، والزرّ معطَّل',
      );
      await press(byAction('activate-version')[0]);
      t.eq(named(calls, 'activateVersion').length, 0, 'V41 ولا تفعيل يرفضه الخادم density_required');
    });
    await step('V41 ضابط مسوّدة سليمة', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ materialsOnly: true, massKg: null, lines: [bare()] })) });
      await mount('/mill/recipe/r-1');
      t.same([noticeTitles().includes(READY), noticeTitles().includes(BALANCED_BLOCKED), disabled(byAction('activate-version')[0])], [true, false, false], 'V41 ضابط: مسوّدة سليمة «جاهزة للتفعيل» والزرّ مفعَّل');
    });

    // ── V42 (ب٤٢): رفض «تغيّر من جهاز آخر» يقرأ الصفحة من جديد، والحفظ التالي المقصود ينجح ─────────────────────────────────────────
    await step('V42 الفعلي', async () => {
      const server = batchServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      // جهاز آخر يحفظ الفعلي 1,005 بعد فتح الصفحة.
      server.state.actual = '1005.000';
      server.state.version = 8;
      type(byAction('input-actual')[0], '1010');
      await settle();
      await click(byAction('input-actual-save')[0]);
      t.ok(text().includes('تغيّرت الكمية الفعلية لهذه المادّة من نافذة أو جهاز آخر'), 'V42 ضابط: الحفظ الأوّل يُرفض qty_changed');
      t.eq(server.counts.loadBatch, 2, 'V42 بعد الرفض تُقرأ الدفعة من جديد');
      t.same(
        [valueOf('input-actual'), text().includes('المحفوظ الآن للكمية الفعلية من «ذرة صفراء»: 1.005 طن، وما كتبته باقٍ في خانته: احفظه ليحلّ محلّه.')],
        ['1010', true],
        'V42 المستخدم يرى المحفوظ الجديد وما كتبه معاً',
      );
      await press(byAction('input-actual-save')[0]);
      t.same(
        named(calls, 'setInputActual').map(([inputId, before, actual]) => [inputId, before, actual]),
        [['in-1', null, 1_010_000n], ['in-1', 1_005_000n, 1_010_000n]],
        'V42 الحفظ التالي مشروط بالمقروء الجديد',
      );
      t.same([server.state.actual, text().includes('من نافذة أو جهاز آخر'), valueOf('input-actual')], ['1010.000', false, '1010.000'], 'V42 فينجح بلا حلقة رفض، والمحفوظ ما كتبه');
    });
    await step('V42 «أرجع» بعد الرفض', async () => {
      const server = batchServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      server.state.actual = '1005.000';
      server.state.version = 8;
      type(byAction('input-actual')[0], '1010');
      await settle();
      await click(byAction('input-actual-save')[0]);
      await press(byAction('revert-unsaved')[0]);
      t.same([valueOf('input-actual'), byAction('post-unsaved').length], ['1005.000', 0], 'V42 «أرجع ما لم يُحفظ» يرجع إلى آخر ما قُرئ (المحفوظ الآن في الخادم) لا إلى لقطة قديمة');
      t.ok(!text().includes('تغيّرت الكمية الفعلية') && !text().includes('ما كتبته باقٍ'), 'V42 وجملة الرفض («ما كتبته باقٍ») تذهب معه');
    });
    await step('V42 المحفوظ فارغ الآن', async () => {
      const server = batchServer({ state: serverBatch({ actual: '1000.500' }) });
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      // جهاز آخر أفرغ الفعلي (كما خُطّط) بعد فتح الصفحة.
      server.state.actual = null;
      server.state.version = 8;
      type(byAction('input-actual')[0], '1010');
      await settle();
      await click(byAction('input-actual-save')[0]);
      t.ok(text().includes('المحفوظ الآن للكمية الفعلية من «ذرة صفراء»: فارغة (كما خُطّط)، وما كتبته باقٍ في خانته: احفظه ليحلّ محلّه.'), 'V42 المحفوظ الفارغ يُقال «فارغة (كما خُطّط)»');
    });
    await step('V42 القراءة تطابق ما كتبه', async () => {
      const holds = { reread: deferred() };
      const server = batchServer({ holds });
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      server.state.actual = '1005.000';
      server.state.version = 8;
      type(byAction('input-actual')[0], '1010.000');
      await settle();
      await click(byAction('input-actual-save')[0]);
      // قبل وصول القراءة حفظ جهاز ثالث ما كتبه المستخدم نفسه.
      server.state.actual = '1010.000';
      server.state.version = 9;
      holds.reread.resolve();
      await settle();
      t.same([valueOf('input-actual'), byAction('input-actual-save').length, byAction('post-unsaved').length], ['1010.000', 0, 0], 'V42 المقروء الجديد = ما كتبه: لا مسوَّد');
      // ثمّ يتغيّر المحفوظ من جهاز آخر وتُقرأ الدفعة بعد حفظ آخر: الخانة تتبع المحفوظ (لا مسوَّد قديم يغطّيه).
      server.state.actual = '1020.000';
      server.state.version = 10;
      type(byAction('output-weight')[0], '985');
      await settle();
      await click(byAction('save-weight')[0]);
      t.eq(valueOf('input-actual'), '1020.000', 'V42 ولا مسوَّد قديم يغطّي المحفوظ بعدها');
    });
    await step('V42 سطر تكلفة أُضيف بمحاولة ضاع جوابها', async () => {
      const server = batchServer({ state: serverBatch({ loseAnswer: true }) });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      choose(byAction('new-cost-category')[0], 'c-power');
      type(byAction('new-cost-amount')[0], '500');
      await settle();
      await click(byAction('add-cost')[0]);
      type(byAction('new-cost-amount')[0], '700');
      await settle();
      await click(byAction('add-cost')[0]);
      t.same([server.counts.loadBatch, text().includes('تغيّر هذا المبلغ من نافذة أو جهاز آخر')], [2, true], 'V42 ضابط: الإعادة بمبلغ آخر تُرفض amount_changed فتُقرأ الدفعة');
      t.same([disabled(byAction('add-cost')[0]), valueOf('new-cost-amount')], [true, '700'], 'V42 فئة صار لها سطر: «أضف سطر تكلفة» معطَّل وما كتبه باقٍ');
      await press(byAction('add-cost')[0]);
      t.eq(named(calls, 'addBatchCost').length, 2, 'V42 ولا إعادة ثالثة تُرفض بالجملة نفسها (لا حلقة رفض)');
    });
    await step('V42 رفض لاحق بلا جملة رفض قديمة', async () => {
      const server = batchServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      server.state.actual = '1005.000';
      server.state.version = 8;
      type(byAction('input-actual')[0], '1010');
      await settle();
      await click(byAction('input-actual-save')[0]);
      await press(byAction('input-actual-save')[0]);
      server.state.rejectPost = 'insufficient_stock';
      await press(byAction('post-production')[0]);
      t.same(
        [text().includes('الخادم رفض العملية'), text().includes('قُرئت الدفعة من جديد'), text().includes('المحفوظ الآن')],
        [true, false, false],
        'V42 رفض آخر بعد حلّ الرفض الأوّل: جملته وحدها بلا جملة «قُرئت من جديد» قديمة',
      );
    });
    await step('V42 حذف المسوّدة بعد stale_draft', async () => {
      const server = batchServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      server.state.version = 8;
      await click(byAction('discard-batch')[0]);
      await press(byAction('confirm-discard')[0]);
      t.same([text().includes('تغيّرت المسوّدة بعد فتحها'), server.counts.loadBatch], [true, 2], 'V42 رفض الحذف stale_draft يقرأ الدفعة من جديد');
      await click(byAction('discard-batch')[0]);
      await press(byAction('confirm-discard')[0]);
      t.same(named(calls, 'discardBatch'), [['b-1', 7], ['b-1', 8]], 'V42 والحذف التالي بنسخة الدفعة الآن فينجح');
    });
    await step('V42 المبلغ', async () => {
      const server = batchServer();
      const calls = fresh(ACCOUNTANT, server.handlers);
      await mount('/mill/batch/b-1');
      server.state.costs[0].amount = '15500.00';
      server.state.version = 8;
      type(byAction('cost-amount')[0], '16000');
      await settle();
      await click(byAction('cost-amount-save')[0]);
      t.same(
        [text().includes('تغيّر هذا المبلغ من نافذة أو جهاز آخر'), server.counts.loadBatch, valueOf('cost-amount')],
        [true, 2, '16000'],
        'V42 المبلغ: رُفض amount_changed فقُرئت الدفعة، وما كتبه باقٍ',
      );
      t.ok(text().includes('المحفوظ الآن لمبلغ «أيدي عاملة»: 15,500.00، وما كتبته باقٍ في خانته: احفظه ليحلّ محلّه.'), 'V42 والمحفوظ الجديد يُقال معه');
      await press(byAction('cost-amount-save')[0]);
      t.same(
        named(calls, 'setBatchCost').map(([costId, before, value]) => [costId, before, value]),
        [['pc-1', 1_500_000n, 1_600_000n], ['pc-1', 1_550_000n, 1_600_000n]],
        'V42 الحفظ التالي للمبلغ مشروط بالمقروء الجديد فينجح',
      );
      t.eq(server.state.costs[0].amount, '16000.00', 'V42 والمحفوظ ما كتبه');
    });
    await step('V42 المبلغ ثمّ «أرجع» والختم', async () => {
      const server = batchServer();
      const calls = fresh(ACCOUNTANT, server.handlers);
      await mount('/mill/batch/b-1');
      server.state.costs[0].amount = '15500.00';
      server.state.version = 8;
      type(byAction('cost-amount')[0], '16000');
      await settle();
      await click(byAction('cost-amount-save')[0]);
      await press(byAction('revert-unsaved')[0]);
      t.eq(valueOf('cost-amount'), '15500.00', 'V42 «أرجع» يعرض المحفوظ الآن 15,500');
      await press(byAction('seal-costs')[0]);
      t.same([named(calls, 'confirmCosts'), server.state.costsConfirmed], [[['b-1', 8]], true], 'V42 والختم بنسخة الدفعة الآن فينجح');
    });
    await step('V42 «أنتج الآن» بعد stale_draft', async () => {
      const server = batchServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      // جهاز آخر يحفظ يوم الإنتاج بعد فتح الصفحة: النسخة 8.
      server.state.day = '2026-11-02';
      server.state.version = 8;
      await press(byAction('post-production')[0]);
      t.ok(text().includes('تغيّرت المسوّدة بعد المعاينة'), 'V42 ضابط: الترحيل الأوّل يُرفض stale_draft');
      t.same([server.counts.loadBatch, valueOf('produced-on')], [2, '02/11/2026'], 'V42 فتُقرأ الدفعة من جديد ويظهر يومها الآن');
      t.ok(text().includes('قُرئت الدفعة من جديد بما حُفظ الآن: راجعها ثمّ أعد المحاولة.'), 'V42 والجملة تقول إنّها قُرئت من جديد');
      await press(byAction('post-production')[0]);
      t.same(
        named(calls, 'postProduction').map(([batchId, version, plan]) => [batchId, version, plan]),
        [['b-1', 7, 'tok-7'], ['b-1', 8, 'tok-8']],
        'V42 والترحيل التالي بالنسخة الجديدة وبصمتها',
      );
      t.ok(!text().includes('تغيّرت المسوّدة بعد المعاينة'), 'V42 بلا رفض ثانٍ');
    });
    await step('V42 «أنتج الآن» بعد stale_preview', async () => {
      const server = batchServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      // تغيّر المخزون بعد المعاينة: البصمة تتغيّر بلا نسخة.
      server.state.planRev = 1;
      await press(byAction('post-production')[0]);
      t.eq(server.counts.loadBatch, 2, 'V42 رفض stale_preview يقرأ الدفعة من جديد');
      await press(byAction('post-production')[0]);
      t.same(
        named(calls, 'postProduction').map(([batchId, version, plan]) => [batchId, version, plan]),
        [['b-1', 7, 'tok-7'], ['b-1', 7, 'tok-7-1']],
        'V42 والترحيل التالي ببصمة المعاينة الجديدة',
      );
    });
    await step('V42 رفض لاحق', async () => {
      const server = recipeServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      server.state.rates[0].amount = '5200.00';
      type(byAction('rate-amount')[0], '5500');
      await settle();
      await click(byAction('rate-amount-save')[0]);
      t.ok(text().includes('تغيّر هذا المبلغ من نافذة أو جهاز آخر'), 'V42 ضابط: مبلغ الطنّ يُرفض amount_changed');
      await press(byAction('rate-amount-save')[0]);
      t.eq(server.state.rates[0].amount, '5500.00', 'V42 ثمّ يُحفظ بالمقروء الجديد');
      // رفض آخر بعد حلّ الأوّل (التفعيل يُرفض برمز آخر): جملته وحدها بلا جملة «قُرئت من جديد» قديمة.
      server.state.rejectActivate = 'doc_empty';
      await press(byAction('activate-version')[0]);
      t.same([text().includes('الخادم رفض العملية'), text().includes('قُرئت الخلطة من جديد'), text().includes('المحفوظ الآن')], [true, false, false], 'V42 رفض لاحق في بطاقة الخلطة بلا جملة رفض قديمة');
    });
    await step('V42 مبلغ الطنّ', async () => {
      const server = recipeServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      server.state.rates[0].amount = '5200.00';
      type(byAction('rate-amount')[0], '5500');
      await settle();
      await click(byAction('rate-amount-save')[0]);
      t.same([server.reads(), valueOf('rate-amount')], [2, '5500'], 'V42 رفض مبلغ الطنّ يقرأ الخلطة من جديد وما كتبه باقٍ');
      t.ok(text().includes('المحفوظ الآن لمبلغ «أيدي عاملة» لكلّ طنّ: 5,200.00'), 'V42 والمحفوظ الجديد يُقال');
      await press(byAction('rate-amount-save')[0]);
      t.same(
        named(calls, 'setRecipeRate').map(([rateId, before, perTon]) => [rateId, before, perTon]),
        [['rr-1', 500_000n, 550_000n], ['rr-1', 520_000n, 550_000n]],
        'V42 الحفظ التالي لمبلغ الطنّ مشروط بالمقروء الجديد فينجح',
      );
      t.eq(server.state.rates[0].amount, '5500.00', 'V42 والمحفوظ ما كتبه');
    });
    await step('V42 التفعيل بعد stale_draft', async () => {
      const server = recipeServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      // جهاز آخر عدّل المسوّدة بعد فتحها: نسختها 6.
      server.state.version = 6;
      await press(byAction('activate-version')[0]);
      t.same([text().includes('تغيّرت الخلطة بعد فتحها'), server.reads()], [true, 2], 'V42 رفض التفعيل stale_draft يقرأ الخلطة من جديد');
      t.ok(text().includes('قُرئت الخلطة من جديد بما حُفظ الآن: راجعها ثمّ أعد المحاولة.'), 'V42 والجملة تقول إنّها قُرئت من جديد');
      await press(byAction('activate-version')[0]);
      t.same(named(calls, 'activateVersion'), [['v-1', 5], ['v-1', 6]], 'V42 والتفعيل التالي بنسخة المسوّدة الآن فينجح');
      t.eq(server.state.status, 'active', 'V42 وفُعّلت');
    });
    await step('V42 التفعيل بلا أساس', async () => {
      // 0025: الخلطة موادّ بلا كميات، فلا مجموع ولا أساس يُكتب قبل التفعيل: «فعّل النسخة» بنسخة المسوّدة وحدها.
      const server = recipeServer();
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      t.same([fieldByLabel('أساس الخلطة (كغم)'), byAction('save-basis').length, byAction('recipe-total').length], [undefined, 0, 0], 'V42 لا حقل أساس ولا مجموع');
      await press(byAction('activate-version')[0]);
      t.same([named(calls, 'setVersionBasis').length, named(calls, 'activateVersion')], [0, [['v-1', 5]]], 'V42 التفعيل بنسخة المسوّدة بلا كتابة أساس قبله');
      t.eq(server.state.status, 'active', 'V42 وفُعّلت');
    });

    // ── V43 (ب٤٣): الصفحة مرسومة أثناء القراءة من جديد، والأفعال معطَّلة أثناء الحفظ ─────────────────────────────────────────────────
    await step('V43 الدفعة أثناء الحفظ والقراءة', async () => {
      const holds = { setBatchFields: deferred(), reread: deferred() };
      const server = batchServer({ holds });
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      await click(byAction('save-weight')[0]);
      t.same(
        ['add-input', 'replace-input', 'remove-input', 'remove-cost'].map((name) => disabled(byAction(name)[0])),
        [true, true, true, true],
        'V43 أثناء الحفظ: «أضف مادّة» و«بدّل» و«احذف» (المادّة والتكلفة) معطَّلة',
      );
      holds.setBatchFields.resolve();
      await settle();
      t.same(
        [text().includes('جارٍ التحميل'), byAction('output-weight').length, disabled(byAction('add-input')[0]), disabled(byAction('post-production')[0])],
        [false, 1, true, true],
        'V43 أثناء القراءة من جديد: الصفحة مرسومة بآخر ما قُرئ والأفعال معطَّلة',
      );
      holds.reread.resolve();
      await settle();
      t.same([disabled(byAction('add-input')[0]), valueOf('output-weight')], [false, '985.000'], 'V43 بعد وصول القراءة: الأفعال مفعَّلة والمحفوظ معروض');
    });
    await step('V43 نافذة الدفعة تبقى', async () => {
      const holds = { setBatchFields: deferred() };
      const server = batchServer({ holds });
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      await click(byAction('add-input')[0]);
      type(byAction('input-qty')[0], '50');
      await settle();
      // حفظ يبدأ والنافذة مفتوحة (الفحص ينقر خلفها)، ثمّ تُقرأ الدفعة من جديد بعده.
      await click(byAction('save-weight')[0]);
      holds.setBatchFields.resolve();
      await settle();
      t.same([byAction('input-qty').length, valueOf('input-qty')], [1, '50'], 'V43 حفظ معلَّق ثمّ نافذة مفتوحة: ما كُتب فيها يبقى بعد الحفظ والقراءة');
    });
    await step('V43 الخلطة أثناء الحفظ', async () => {
      // التفعيل معلَّق، ثمّ يُرفض stale_draft (جهاز آخر غيّر المسوّدة) فتبقى مسوّدة وتُقرأ من جديد.
      const holds = { activateVersion: deferred() };
      const server = recipeServer({ holds });
      fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      await click(byAction('activate-version')[0]);
      t.same(
        ['add-line', 'remove-line', 'remove-rate', 'line-up'].map((name) => disabled(byAction(name)[0])),
        [true, true, true, true],
        'V43 أثناء التفعيل: «أضف مواد» و«احذف» (السطر والتكلفة) والترتيب معطَّلة',
      );
      server.state.version = 6;
      holds.activateVersion.resolve();
      await settle();
      t.same([server.reads(), ...['add-line', 'remove-line', 'remove-rate'].map((name) => disabled(byAction(name)[0]))], [2, false, false, false], 'V43 ضابط: بعده (رفض وقراءة من جديد) مفعَّلة');
    });
    await step('V43 نافذة الخلطة تبقى', async () => {
      // «أضف مواد» مفتوحة وفيها مادّة مختارة، وكتابة خلفها تقرأ الخلطة من جديد: المختار يعيش في الصفحة (درس WP5) فيبقى.
      const holds = { activateVersion: deferred() };
      const server = recipeServer({ holds });
      fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      await click(byAction('add-line')[0]);
      await press(cardOf('i-soy'));
      await settle();
      await click(byAction('activate-version')[0]);
      server.state.version = 6;
      holds.activateVersion.resolve();
      await settle();
      t.same([server.reads(), byAction('add-lines-save').length, cardOf('i-soy')?.getAttribute('aria-pressed') ?? null], [2, 1, 'true'], 'V43 نافذة «أضف مواد» المفتوحة أثناء الحفظ: المختار يبقى بعد القراءة من جديد');
    });
    await step('V43 نسخة أخرى لا تُرسم بالسابقة', async () => {
      // البقاء مرسومة للمعرّف نفسه وحده: اختيار نسخة أخرى يقرؤها من أوّلها، فلا تُعرض موادّ النسخة السابقة باسم اللاحقة.
      const hold = deferred();
      const versions = [
        { id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', materials_only: false, activated_at: null, version: 5 },
        { id: 'v-1', version_no: 1, status: 'active', basis_kg: '1000.000', materials_only: false, activated_at: '2026-11-01T08:00:00Z', version: 5 },
      ];
      fresh(MANAGER, {
        loadRecipe: (recipeId, versionId) =>
          versionId === 'v-1'
            ? hold.promise.then(() => m.parseRecipe(recipeJson({ status: 'active', versionId: 'v-1', versions })))
            : m.parseRecipe(recipeJson({ status: 'draft', versionId: 'v-2', versionNo: 2, versions })),
      });
      await mount('/mill/recipe/r-1');
      const active = byAction('pick-version').find((button) => button.textContent.includes('المفعَّلة'));
      await press(active);
      t.same([text().includes('جارٍ التحميل'), byAction('add-line').length], [true, 0], 'V43 أثناء قراءة نسخة أخرى: «جارٍ التحميل» لا موادّ المسوّدة');
      hold.resolve();
      await settle();
      t.same([text().includes('جارٍ التحميل'), byAction('add-line').length], [false, 0], 'V43 ضابط: ثمّ تُرسم النسخة المفعَّلة (بلا «أضف مادّة»)');
    });
    await step('V43 فشل القراءة من جديد', async () => {
      // القراءة بعد الحفظ فشلت: يُعرض الفشل بزرّ «أعد المحاولة» كما في useLoad، لا آخر ما قُرئ كأنّه المحفوظ الآن.
      let reads = 0;
      fresh(MANAGER, {
        loadRecipe: () => {
          reads += 1;
          if (reads > 1) throw new m.RejectedError('read_failed', null);
          return m.parseRecipe(recipeJson({ materialsOnly: true, massKg: null, lines: [bare()] }));
        },
        activateVersion: () => ({ ok: true }),
      });
      await mount('/mill/recipe/r-1');
      await click(byAction('activate-version')[0]);
      t.same([reads, byAction('add-line').length, text().includes('أعد المحاولة')], [2, 0, true], 'V43 فشل القراءة من جديد يُعرض فشلاً لا بيانات قديمة');
    });

    // ── V44 (ب٤٤): خانات المال وحقول التكلفة الجديدة في بطاقة الخلطة مقفولة أثناء الحفظ، والمسح بما أُرسل ─────────────────────────
    await step('V44 مبلغ الطنّ', async () => {
      const holds = { setRecipeRate: deferred() };
      const server = recipeServer({ holds });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      type(byAction('rate-amount')[0], '5500');
      await settle();
      await click(byAction('rate-amount-save')[0]);
      t.eq(disabled(byAction('rate-amount')[0]), true, 'V44 خانة مبلغ الطنّ مقفولة أثناء حفظها');
      type(byAction('rate-amount')[0], '6000');
      await settle();
      holds.setRecipeRate.resolve();
      await settle();
      t.eq(valueOf('rate-amount'), '6000', 'V44 ما كُتب في مبلغ الطنّ أثناء حفظه يبقى');
      await press(byAction('rate-amount-save')[0]);
      t.same(
        named(calls, 'setRecipeRate').map(([rateId, before, perTon]) => [rateId, before, perTon]),
        [['rr-1', 500_000n, 550_000n], ['rr-1', 550_000n, 600_000n]],
        'V44 والحفظ التالي مشروط بما حُفظ الآن',
      );
      t.eq(server.state.rates[0].amount, '6000.00', 'V44 والمحفوظ ما كُتب أخيراً');
    });
    await step('V44 تكلفة جديدة', async () => {
      const holds = { addRecipeRate: deferred() };
      const server = recipeServer({ holds });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      choose(byAction('new-rate-category')[0], 'c-power');
      type(byAction('new-rate-amount')[0], '700');
      await settle();
      await click(byAction('add-rate')[0]);
      t.same(
        [disabled(byAction('new-rate-category')[0]), disabled(byAction('new-rate-amount')[0]), disabled(byAction('new-category-name')[0])],
        [true, true, true],
        'V44 حقلا «تكلفة جديدة» و«فئة مصروف جديدة» مقفولة أثناء إضافتها',
      );
      type(byAction('new-rate-amount')[0], '800');
      await settle();
      holds.addRecipeRate.resolve();
      await settle();
      t.same(named(calls, 'addRecipeRate').map(([, , categoryId, perTon]) => [categoryId, perTon]), [['c-power', 70_000n]], 'V44 أُضيفت التكلفة بما كان لحظة النقر');
      t.eq(valueOf('new-rate-amount'), '800', 'V44 ما كُتب في مبلغ التكلفة الجديدة أثناء إضافتها يبقى');
      // فئته صار لها سطر: لا تُضاف ثانيةً بالمعرّف نفسه فتُرفض في حلقة (ب٤٢)، والمبلغ يُعدَّل في سطرها.
      t.eq(disabled(byAction('add-rate')[0]), true, 'V44 و«أضف تكلفة» معطَّل لفئة صار لها سطر');
    });
    await step('V44 تكلفة جديدة كما أُرسلت', async () => {
      const server = recipeServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      choose(byAction('new-rate-category')[0], 'c-power');
      type(byAction('new-rate-amount')[0], '700');
      await settle();
      await click(byAction('add-rate')[0]);
      t.same([valueOf('new-rate-amount'), server.state.rates.length], ['', 2], 'V44 ضابط: التكلفة الجديدة كما أُرسلت تُفرَّغ بعد إضافتها');
    });
    await step('V44 «أضف مواد»', async () => {
      // البطاقات وخانات كمياتها مقفولة أثناء الإضافة، ثمّ تُغلق النافذة بعد إضافة كلّ المختار.
      const holds = { addRecipeLine: deferred() };
      const server = recipeServer({ holds });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      await click(byAction('add-line')[0]);
      t.same(byAction('material-card').map((node) => node.getAttribute('data-item')), ['i-soy'], 'V44 المادّة المكتوبة في الخلطة لا بطاقة لها');
      await press(cardOf('i-soy'));
      await settle();
      await click(byAction('add-lines-save')[0]);
      t.same([disabled(cardOf('i-soy')), disabled(byAction('add-lines-save')[0])], [true, true], 'V44 البطاقة والإضافة مقفولتان أثناءها');
      holds.addRecipeLine.resolve();
      await settle();
      t.same([named(calls, 'addRecipeLine'), byAction('add-lines-save').length], [[['v-1', 'i-soy']], 0], 'V44 ثمّ أُضيفت بمعرّفها وحده (بلا كمية) وأُغلقت النافذة');
    });

    // ── V45 (ب٤٥) وV46 الأولى: جملة «بلا أيّ سعر» وخانة سعر الكلفة خرجتا مع أسعار بطاقة الخلطة (0025). ────────────────────────────────
    // ── V46 (ب٤٦): فحوص الطفرات الناجية من مصفوفة المراجعة الخامسة ─────────────────────────────────────────────────────────────
    await step('V46 «أرجع» أثناء الحفظ', async () => {
      // 35j: «أرجع ما لم يُحفظ» معطَّل أثناء الحفظ، فلا يبدو نافذاً والمكتوب يُحفظ رغمه.
      const holds = { setBatchFields: deferred() };
      const server = batchServer({ holds, state: serverBatch({ weight: '985.000' }) });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '960');
      await settle();
      await click(byAction('save-weight')[0]);
      t.eq(disabled(byAction('revert-unsaved')[0]), true, 'V46 «أرجع ما لم يُحفظ» معطَّل أثناء الحفظ');
      await press(byAction('revert-unsaved')[0]);
      t.eq(valueOf('output-weight'), '960', 'V46 والنقر عليه لا يعيد الحقل إلى المحفوظ والحفظ جارٍ');
      holds.setBatchFields.resolve();
      await settle();
      t.same(
        [named(calls, 'setBatchFields').map(([, fields]) => fields), server.state.weight, valueOf('output-weight')],
        [[{ outputQtyKg: 960_000n }], '960.000', '960.000'],
        'V46 ولا يُرسل غير ما كان قبل النقر',
      );
    });
    await step('V46 لا جملة رفض الفئة بعد «أرجع»', async () => {
      // 35i2: بعد رفض category_name_taken ثمّ «أرجع» لا تبقى جملة الرفض تحت حقل فارغ.
      const server = batchServer();
      fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      await click(byAction('create-category')[0]);
      t.eq(byAction('category-problem')[0]?.textContent ?? null, 'الفئة «نقل» مؤرشفة في منشأتك: أعِدها من الأرشيف بدل فئة جديدة بالاسم نفسه.', 'V46 ضابط: رفض الاسم يُعرض بتلميحه');
      await press(byAction('revert-unsaved')[0]);
      t.same([byAction('category-problem').length, valueOf('new-category-name')], [0, ''], 'V46 بعد «أرجع» لا جملة رفض تحت حقل فارغ');
    });

    // ── V47 (ب٤٧): «عدّل» لا يظهر لسطر unit_mismatch ─────────────────────────────────────────────────────────────────────────
    await step('V47 «احذف» وحده لكلّ سطر', async () => {
      // 0025: لا كميات في الخلطة، فلا «عدّل» لأيّ سطر؛ سطر unit_mismatch «احذف» وجملته تقول احذف ثمّ أضف من جديد.
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(KAZ_DRAFT()) });
      await mount('/mill/recipe/r-1');
      t.same([byAction('edit-line').length, byAction('remove-line').length], [0, 2], 'V47 كلّ سطر «احذف» وحده بلا «عدّل»');
      t.ok(byAction('unit-mismatch')[0]?.textContent.includes('احذف سطرها وأضفها من جديد'), 'V47 والجملة تقول احذف ثمّ أضف من جديد');
    });

    // ── V48 (ب٤٨): skipped في جواب «نسخة جديدة» ─────────────────────────────────────────────────────────────────────────────
    const made = (over = {}) => ({ recipe_id: 'r-1', version_id: 'v-3', version_no: 3, status: 'draft', lines: 1, rates: 0, existing: false, skipped: [], ...over });
    await step('V48 المحلّل', async () => {
      t.same(safe(() => m.parseNewRecipeVersion(made({ skipped: ['خميرة الدمج'] })).skipped), ['خميرة الدمج'], 'V48 skipped يُقرأ أسماءً');
      t.same(safe(() => m.parseNewRecipeVersion(made()).skipped), [], 'V48 وskipped الفارغ يُقرأ فارغاً');
      const absent = made();
      delete absent.skipped;
      t.eq(safe(() => m.parseNewRecipeVersion(absent) && 'ok'), 'mill_shape:skipped', 'V48 skipped الغائب خطأ شكل (المفتاح إلزامي)');
      t.eq(safe(() => m.parseNewRecipeVersion(made({ skipped: 'خميرة الدمج' })) && 'ok'), 'mill_shape:skipped', 'V48 skipped غير مصفوفة خطأ شكل');
      t.eq(safe(() => m.parseNewRecipeVersion(made({ skipped: [''] })) && 'ok'), 'mill_shape:skipped', 'V48 اسم فارغ في skipped خطأ شكل');
      t.eq(safe(() => m.parseNewRecipeVersion(made({ skipped: [7] })) && 'ok'), 'mill_shape:skipped', 'V48 اسم غير نصّي في skipped خطأ شكل');
    });
    for (const [label, skipped, expected] of [
      ['V48 الصفحة تسمّي ما لم يُنسخ', ['خميرة الدمج'], 'نُسخت النسخة بلا «خميرة الدمج»: صارت تُقاس بالقطعة فلا تدخل الخلطة.'],
      ['V48 مادّتان لم تُنسخا', ['خميرة الدمج', 'كيس'], 'نُسخت النسخة بلا «خميرة الدمج»، «كيس»: صارت تُقاس بالقطعة فلا تدخل الخلطة.'],
      ['V48 ضابط: لا شيء تُرك', [], null],
    ]) {
      await step(label, async () => {
        fresh(MANAGER, {
          loadRecipe: (recipeId, versionId) =>
            m.parseRecipe(
              versionId === 'v-3'
                ? recipeJson({
                    status: 'draft', versionId: 'v-3', versionNo: 3,
                    versions: [{ id: 'v-1', version_no: 1, status: 'active', basis_kg: '1000.000', materials_only: false, activated_at: null, version: 5 }, { id: 'v-3', version_no: 3, status: 'draft', basis_kg: '1000.000', materials_only: false, activated_at: null, version: 1 }],
                  })
                : recipeJson({ status: 'active' }),
            ),
          newRecipeVersion: () => m.parseNewRecipeVersion(made({ skipped })),
        });
        await mount('/mill/recipe/r-1');
        await click(byAction('new-version')[0]);
        const notice = noticeTitles().find((title) => title.startsWith('نُسخت النسخة بلا')) ?? null;
        t.eq(notice, expected, `${label}: الجملة فوق النسخة الجديدة`);
        if (expected !== null) {
          // الجملة عن النسخة التي نُسخت: تحت النسخة المفعَّلة لا تُقال.
          const active = byAction('pick-version').find((button) => button.textContent.includes('المفعَّلة'));
          await press(active);
          t.eq(noticeTitles().some((title) => title.startsWith('نُسخت النسخة بلا')), false, `${label}: ولا تُقال تحت نسخة أخرى`);
        }
      });
    }

    // ── V49 (ب٤٩): density_missing ──────────────────────────────────────────────────────────────────────────────────────────
    await step('V49 المحلّل', async () => {
      const read = safe(() => m.parseRecipe(SYRUP_DRAFT()).lines.map((line) => [line.itemName, line.densityMissing]));
      t.same(read, [['ذرة المسبار 1', false], ['شراب بلا كثافة 83', true]], 'V49 density_missing لكلّ سطر يُقرأ');
      const absent = SYRUP_DRAFT();
      delete absent.lines[1].density_missing;
      t.eq(safe(() => m.parseRecipe(absent) && 'ok'), 'mill_shape:density_missing', 'V49 density_missing الغائب خطأ شكل (المفتاح إلزامي)');
      const text = SYRUP_DRAFT();
      text.lines[1].density_missing = 'true';
      t.eq(safe(() => m.parseRecipe(text) && 'ok'), 'mill_shape:density_missing', 'V49 density_missing غير منطقي خطأ شكل');
    });
    await step('V49 المدير', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(SYRUP_DRAFT()) });
      await mount('/mill/recipe/r-1');
      const block = byAction('density-missing')[0];
      t.ok(block ? noticeTitles().filter((title) => block.textContent.includes(title)).join(' | ') === DENSITY_MANAGER : false, `V49 جملة السائل بلا كثافة لمن يعدّل المواد (${block?.textContent ?? 'لا جملة'})`);
      const link = byAction('write-density')[0];
      const target = link ? new URL(link.getAttribute('href') ?? '', 'http://localhost') : null;
      t.same(
        [link?.textContent ?? null, target?.pathname ?? null, target?.searchParams.get('edit') ?? null, target?.searchParams.get('back') ?? null],
        ['اكتب الكثافة', '/inventory/items', SYRUP_ID, '/mill/recipe/r-1?version=c2950000-0000-4000-8000-000000020148'],
        'V49 ومعها رابط «اكتب الكثافة» إلى نافذة «عدّل» للمادّة، ويرجع إلى المسوّدة بنسختها (ب٦١)',
      );
      t.same([noticeTitles().includes(BALANCED_BLOCKED), disabled(byAction('activate-version')[0])], [true, true], 'V49 ضابط: «لا تُفعَّل» والزرّ معطَّل');
      // ما كُتب ولم يُحفظ في الصفحة: الرابط يغادرها فيضيّعه، فلا يظهر حتّى يُحفظ أو يُمسح.
      type(byAction('new-category-name')[0], 'نقل');
      await settle();
      t.eq(byAction('write-density').length, 0, 'V49 مع مكتوب لم يُحفظ لا رابط يغادر الصفحة');
      type(byAction('new-category-name')[0], '');
      await settle();
      t.eq(byAction('write-density').length, 1, 'V49 ضابط: المكتوب رجع إلى المحفوظ فيعود الرابط');
    });
    await step('V49 كلّ مكتوب في الصفحة يخفي الرابط', async () => {
      // مسوّدة الشراب ومعها تكلفة لكلّ طنّ وفئتان: مبلغ الطنّ، والتكلفة الجديدة (فئتها أو مبلغها)، واسم فئة جديدة (ولا أساس يُكتب بعد 2026-11-07).
      const withRate = () => {
        const answer = SYRUP_DRAFT();
        answer.money.rates = [{ id: 'rr-1', line_no: 1, category_id: 'c-labor', category_name: 'أيدي عاملة', amount_per_ton: '5000.00' }];
        answer.expense_categories = CATEGORIES;
        return answer;
      };
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(withRate()) });
      await mount('/mill/recipe/r-1');
      const kinds = [
        ['مبلغ الطنّ', () => type(byAction('rate-amount')[0], '5500'), () => type(byAction('rate-amount')[0], '5000.00')],
        ['فئة التكلفة الجديدة', () => choose(byAction('new-rate-category')[0], 'c-power'), () => choose(byAction('new-rate-category')[0], '')],
        ['مبلغ التكلفة الجديدة', () => type(byAction('new-rate-amount')[0], '700'), () => type(byAction('new-rate-amount')[0], '')],
        ['اسم فئة جديدة', () => type(byAction('new-category-name')[0], 'نقل'), () => type(byAction('new-category-name')[0], '')],
      ];
      for (const [kind, write, undo] of kinds) {
        write();
        await settle();
        const hidden = byAction('write-density').length;
        undo();
        await settle();
        t.same([hidden, byAction('write-density').length], [0, 1], `V49 ${kind} لم يُحفظ: لا رابط، ويعود حين يرجع إلى المحفوظ`);
      }
    });
    await step('V49 المحاسب', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(SYRUP_DRAFT()) });
      await mount('/mill/recipe/r-1');
      const block = byAction('density-missing')[0];
      t.ok(block ? noticeTitles().filter((title) => block.textContent.includes(title)).join(' | ') === DENSITY_OTHERS : false, `V49 لغير من يعدّل المواد: «يكتبها المالك أو المدير» (${block?.textContent ?? 'لا جملة'})`);
      t.ok(!text().includes('اكتب كثافته'), 'V49 ولا يُدلّ على فعل ليس له');
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
