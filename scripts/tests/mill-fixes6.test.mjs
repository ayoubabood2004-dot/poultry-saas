// الجولة السادسة (الختامية) من إصلاحات شاشات المعمل (القسم «ب» من fixes6.md، ب٦١–ب٦٥): react-dom/client الحقيقي على DOM صغير (dom.mjs)
// يشغّل MillRoutes وصفحة «المواد» (ItemsPage) وStockRoutes الحقيقية بمسارات App.tsx، وrepo المعمل والمخزون والجلسة والرسائل بدائل، والمحلّلات
// الحقيقية تقرأ أجوبة بشكل القسم «أ» (money.expected.unconverted، وجواب «نسخة جديدة» للإعادة بالمعرّف نفسه).
// W61 رابط الكثافة يصل إلى محرّر حقيقي: من بطاقة الخلطة إلى نافذة «عدّل» وخانة الكثافة ثمّ الحفظ ثمّ الرجوع إلى المسوّدة نفسها (‎?version=)، وزرّ
//     الرجوع في المتصفّح يفتح المسوّدة نفسها، و«عدّل المادّة» في بطاقة المادّة، وغير المدير بلا نافذة، و‎?back= لمسار خلطة وحده (ب٦١)؛
// W62 لوحة كلفة الطنّ للسطور المسعَّرة التي لا تتحوّل كميتها (unconverted) على جوابَي القاعدة الحقيقيين من مسبار المراجعة السادسة (ب٦٢)؛
// W63 «نسخة جديدة» ضاع جوابها ثمّ أُعيدت بالمعرّف نفسه: جملة «نُسخت النسخة بلا …» لا «مسوّدة قائمة» (ب٦٣)؛
// W64 useKeptLoad بقراءتين ناجحتين قبل الرفض: أثناء القراءة الجديدة آخر قراءة لا الأولى، والحفظ التالي مشروط بالجديدة فينجح (ب٦٤)؛
// W65 الانتقال بالرابط من دفعة إلى أخرى ومن خلطة إلى أخرى لا يُبقي مسوّدات السابقة ولا جملها (ب٦٥، key={id}).
// W66 (تكامل الجولة) سطر لتر تُقرَّب كتلته صفراً (ق٦٤: يرفض الخادم التفعيل به qty_not_positive) لا تُفعَّل النسخة به، بجملة تسمّيه.
// W61 وW62 وW65 تفشل على شاشات bffd349؛ وW63 وW64 تثبتان سلوكاً قائماً، فتُقاس بطفرات تكسره (مصفوفة الجولة)؛ وW66 تفشل على bffd349 وعلى شاشات الجولة قبل التكامل.
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
const INVENTORY = [
  'loadOrgSetup', 'listItems', 'loadItem', 'updateItem', 'createItem', 'createItemUnit', 'listItemUnits', 'findItemTwins', 'setArchived', 'loadItemPurchases', 'loadItemLots',
  'loadItemLotValues', 'loadItemMoves', 'setItemCostPrice', 'setItemSellPrice', 'loadStoresOverview', 'loadStockOnHand', 'createExpenseCategory',
];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__mill.call('${n}', a);`).join(' ')}`;
const STUBS = {
  mill: routed('mill', MILL),
  inventory: routed('inventory', INVENTORY),
  counts: `export * from ${real('counts')}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  session: 'export const useSession = () => globalThis.__mill.session; export const sessionStore = { get: () => globalThis.__mill?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__mill.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'mill-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(mill|inventory|counts)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'mill-stub' }));
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
const click = async (node, init = {}) => {
  fire(node, 'click', init);
  await settle();
};
/** نقرة على عقدة قد تغيب في الشاشة القديمة: الغياب يظهر في الفحص التالي فاشلاً باسمه لا رميةً تُسقط الخطوة. */
const press = async (node) => {
  if (node) await click(node);
};
/** نقرة رابط كما يعالجها react-router (الزرّ الأيسر). */
const follow = async (node) => {
  if (node) await click(node, { button: 0 });
};
const disabled = (node) => node?.hasAttribute('disabled') ?? null;
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
/** نموذج نافذة المادّة (ItemDialog: ‎<form id="…-form">). */
const dialogForm = () => all().find((n) => n.nodeName === 'FORM' && n.id.endsWith('-form')) ?? null;
const submit = async () => {
  const form = dialogForm();
  if (form) fire(form, 'submit');
  await settle();
  await settle();
};
/** هدف رابط مفكوكاً: المسار والمعاملات (لا يتعلّق الفحص بترتيب الترميز). */
const target = (link) => {
  const href = link?.getAttribute('href') ?? null;
  if (href === null) return null;
  const url = new URL(href, 'http://localhost');
  return { path: url.pathname, edit: url.searchParams.get('edit'), back: url.searchParams.get('back') };
};
const DENSITY_FIELD = 'الكثافة (كغم لكل لتر)';

const ws = (over = {}) => ({
  userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
  divisions: ['feed_mill'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws() };
const ACCOUNTANT = { status: 'ready', workspace: ws({ role: 'accountant' }) };
// الأمين: يكتب ورقة الاستلام (فتُقرأ المادّة في بطاقتها) ولا يعدّل المواد (بلا stores.manage).
const KEEPER = { status: 'ready', workspace: ws({ role: 'storekeeper', canSeeCost: false, canSeeAccounts: false, scopes: [{ warehouseId: 'w-raw' }] }) };

// ─── أجوبة الخلطة بشكل القسم «أ» ─────────────────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [{ id: 'c-labor', name: 'أيدي عاملة' }, { id: 'c-power', name: 'كهرباء' }];
const recipeLine = (over = {}) => ({
  id: 'l-1', line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', kind: 'raw', base_unit: 'kg', category_id: null, category_name: 'الغذاء', qty: '1000.000', unit: 'kg',
  mass_kg: '1000.000', share_pct: '100.00', in_basis: true, unit_changed: false, unit_mismatch: false, density_missing: false,
  money: { unit_cost: '430.50', cost_price: '450.00', last_price: '440.25' }, ...over,
});
const CORN_PICK = { id: 'i-corn', name: 'ذرة صفراء', base_unit: 'kg', category_name: 'الغذاء' };
const recipeJson = ({ id = 'r-1', name = 'علف بادئ', status = 'draft', versionId = 'v-1', versionNo = 1, version = 5, versions = null, lines = [recipeLine()], massKg = '1000.000', basis = '1000.000', pickItems = [CORN_PICK], unpriced = 0, unconverted = 0 } = {}) => ({
  id, name, note: null, archived: false, version: 2,
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', kind: 'feed', tracks_expiry: false },
  versions: versions ?? [{ id: versionId, version_no: versionNo, status, basis_kg: basis, activated_at: status === 'active' ? '2026-11-01T08:00:00Z' : null, version }],
  selected: { id: versionId, version_no: versionNo, status, basis_kg: basis, note: null, activated_at: null, version },
  lines: lines.map((line) => ({ ...line, money: line.money ? { ...line.money } : line.money })),
  mass_kg: massKg,
  pick_items: pickItems,
  expense_categories: CATEGORIES,
  money: { rates: [], expected: { materials_per_ton: '450000.00', rates_per_ton: '0.00', cost_per_ton: '450000.00', unpriced, unconverted } },
});

// جواب recipe_detail الحقيقي لمسوّدة «زيت مسبار» (مسبار المراجعة السادسة #0 على بوستغريس الحزمة، rev6/probe-out-pd-oil.json): ذرة 994 كغم بسعر
// كلفة 900، وزيت 6 كغم مكتوب بالكيلو لسائل سعر كلفته 2,000 لكلّ لتر فُرّغت كثافته (density_missing). وexpected بتعريف ق٦١: سطر الزيت له سعر ولا
// تتحوّل كميته إلى وحدة سعره، فهو unconverted = 1 لا unpriced (كان الجواب unpriced = 1 على 0016 قبل ق٦١)، والمواد 994 × 900 = 894,600.00.
const OIL_DRAFT = () => ({
  id: 'e6f60000-0000-4000-8000-000000020013', name: 'مسوّدة زيت بالكيلو', note: null,
  lines: [
    { id: '95de2477-a1ed-4258-b99b-93dfffca054d', qty: '994.000', kind: 'raw', unit: 'kg', money: { unit_cost: null, cost_price: '900', last_price: null }, item_id: '9c140b47-420f-49d3-9ce5-1cbf3ffb8f04', line_no: 1, mass_kg: '994.000', in_basis: true, base_unit: 'kg', item_name: 'ذرة مسبار', share_pct: '99.40', category_id: null, unit_changed: false, category_name: null, unit_mismatch: false, density_missing: false },
    { id: 'd7580068-1292-43b4-94c7-c7288587b869', qty: '6.000', kind: 'raw', unit: 'kg', money: { unit_cost: null, cost_price: '2000', last_price: null }, item_id: '34864c52-de5e-4cf6-b458-545d35d9ab98', line_no: 2, mass_kg: '6.000', in_basis: true, base_unit: 'L', item_name: 'زيت مسبار', share_pct: '0.60', category_id: null, unit_changed: false, category_name: null, unit_mismatch: false, density_missing: true },
  ],
  money: { rates: [], expected: { unpriced: 0, unconverted: 1, cost_per_ton: '894600.00', rates_per_ton: '0.00', materials_per_ton: '894600.00' } },
  mass_kg: '1000.000', version: 1, archived: false,
  selected: { id: 'e6f60000-0000-4000-8000-000000020014', note: null, status: 'draft', version: 3, basis_kg: '1000', version_no: 1, activated_at: null },
  versions: [{ id: 'e6f60000-0000-4000-8000-000000020014', status: 'draft', version: 3, basis_kg: '1000', version_no: 1, activated_at: null }],
  pick_items: [
    { id: '9c140b47-420f-49d3-9ce5-1cbf3ffb8f04', name: 'ذرة مسبار', base_unit: 'kg', category_name: null },
    { id: '34864c52-de5e-4cf6-b458-545d35d9ab98', name: 'زيت مسبار', base_unit: 'L', category_name: null },
  ],
  output_item: { id: '514ef7d4-8d13-4102-8298-90f7bb2f765f', kind: 'feed', name: 'علف مسبار', base_unit: 'kg', tracks_expiry: false },
  expense_categories: [],
});

// جواب recipe_detail الحقيقي لمسوّدة «دبس مسبار» (rev6/probe-out-pd-dibs.json): ذرة 972 كغم ودبس 20 لتراً صار بالكيلو وسعر كلفته 1,500 للكيلو
// (unit_mismatch، ولا لقطة كثافة لمسوّدة). وexpected بتعريف ق٦١: unconverted = 1 لا unpriced، والمواد 972 × 900 = 874,800.00.
const DIBS_DRAFT = () => ({
  id: 'e6f60000-0000-4000-8000-000000020015', name: 'مسوّدة دبس صار بالكيلو', note: null,
  lines: [
    { id: 'd158a960-a48b-40e2-80ee-0973e86a2197', qty: '972.000', kind: 'raw', unit: 'kg', money: { unit_cost: null, cost_price: '900', last_price: null }, item_id: '9c140b47-420f-49d3-9ce5-1cbf3ffb8f04', line_no: 1, mass_kg: '972.000', in_basis: true, base_unit: 'kg', item_name: 'ذرة مسبار', share_pct: '97.20', category_id: null, unit_changed: false, category_name: null, unit_mismatch: false, density_missing: false },
    { id: 'd32b55a6-1d61-4fb4-9a0c-aef39ce57605', qty: '20.000', kind: 'raw', unit: 'L', money: { unit_cost: null, cost_price: '1500', last_price: null }, item_id: '0aa1cc52-6935-4f1c-8363-b4d3926b9af8', line_no: 2, mass_kg: null, in_basis: true, base_unit: 'kg', item_name: 'دبس مسبار', share_pct: null, category_id: null, unit_changed: false, category_name: null, unit_mismatch: true, density_missing: false },
  ],
  money: { rates: [], expected: { unpriced: 0, unconverted: 1, cost_per_ton: '874800.00', rates_per_ton: '0.00', materials_per_ton: '874800.00' } },
  mass_kg: null, version: 1, archived: false,
  selected: { id: 'e6f60000-0000-4000-8000-000000020016', note: null, status: 'draft', version: 3, basis_kg: '1000', version_no: 1, activated_at: null },
  versions: [{ id: 'e6f60000-0000-4000-8000-000000020016', status: 'draft', version: 3, basis_kg: '1000', version_no: 1, activated_at: null }],
  pick_items: [
    { id: '0aa1cc52-6935-4f1c-8363-b4d3926b9af8', name: 'دبس مسبار', base_unit: 'kg', category_name: null },
    { id: '9c140b47-420f-49d3-9ce5-1cbf3ffb8f04', name: 'ذرة مسبار', base_unit: 'kg', category_name: null },
  ],
  output_item: { id: '514ef7d4-8d13-4102-8298-90f7bb2f765f', kind: 'feed', name: 'علف مسبار', base_unit: 'kg', tracks_expiry: false },
  expense_categories: [],
});

// ─── «المواد» ومنشأة المعمل ──────────────────────────────────────────────────────────────────────────────────────────────
const ORG = {
  divisions: [{ id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true }],
  sites: [], packTypes: [], expenseCategories: [], itemCategories: [],
  warehouses: [{ id: 'w-raw', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', kind: 'raw', hasBalance: false }],
};
const OIL = 'i-oil';
const OIL_PICK = { id: OIL, name: 'زيت', base_unit: 'L', category_name: null };
const VERSIONS = [
  { id: 'v-1', version_no: 1, status: 'active', basis_kg: '1000.000', activated_at: '2026-11-01T08:00:00Z', version: 5 },
  { id: 'v-2', version_no: 2, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 2 },
];
const DENSITY_TEXT = '«زيت» سائل بلا كثافة: اكتب كثافته من «المواد» ثمّ فعّل.';
const DENSITY_OTHERS = '«زيت» سائل بلا كثافة: يكتبها المالك أو المدير من «المواد».';
const READY = 'المجموع مطابق للأساس: الخلطة جاهزة للتفعيل.';
const BACK = '/mill/recipe/r-1?version=v-2';

/**
 * «خادم» الرحلة: الخلطة r-1 بنسخة مفعَّلة v-1 ومسوّدة v-2 فيها «زيت» 6 كغم مكتوب بالكيلو لسائل بلا كثافة (density_missing، حالة زيت المالك)،
 * والمادّة نفسها في «المواد» تُقرأ بمعرّفها وتُعدَّل بنسختها (updateItem مشروطة بالنسخة كما في repo الحقيقي)؛ وبعد الكثافة لا density_missing.
 */
const journeyServer = (m, { archived = false } = {}) => {
  const state = { density: null, itemVersion: 4, reads: [] };
  const oilItem = () => ({
    id: OIL, version: state.itemVersion, archived, name: 'زيت', nameNorm: 'زيت', categoryId: null, kind: 'raw', baseUnit: 'L', density: state.density, pieceMassKg: null,
    tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [],
  });
  const oilLine = () =>
    recipeLine({ id: 'l-oil', line_no: 2, item_id: OIL, item_name: 'زيت', base_unit: 'L', category_name: null, qty: '6.000', mass_kg: '6.000', share_pct: '0.60', density_missing: state.density === null, money: { unit_cost: null, cost_price: '2000.00', last_price: null } });
  const answer = (versionId) =>
    versionId === 'v-2'
      ? recipeJson({ versionId: 'v-2', versionNo: 2, version: 2, versions: VERSIONS, lines: [recipeLine({ qty: '994.000', mass_kg: '994.000', share_pct: '99.40' }), oilLine()], pickItems: [CORN_PICK, OIL_PICK], unconverted: state.density === null ? 1 : 0 })
      : recipeJson({ status: 'active', versionId: 'v-1', versionNo: 1, version: 5, versions: VERSIONS });
  return {
    state,
    handlers: {
      loadRecipe: (recipeId, versionId) => {
        state.reads.push(versionId);
        return m.parseRecipe(answer(versionId));
      },
      loadOrgSetup: () => ORG,
      listItems: () => ({ rows: [oilItem()], total: 1, next: null }),
      loadItem: (itemId) => (itemId === OIL ? oilItem() : null),
      findItemTwins: () => [],
      updateItem: (itemId, version, patch) => {
        if (itemId !== OIL || version !== state.itemVersion) throw new m.ZeroRowsError();
        if ('density_kg_per_l' in patch) state.density = patch.density_kg_per_l === null ? null : BigInt(patch.density_kg_per_l.replace('.', ''));
        state.itemVersion += 1;
        return oilItem();
      },
      loadItemPurchases: () => ({
        item: { id: OIL, name: 'زيت', kind: 'raw', baseUnit: 'L', tracksExpiry: false, minQty: null, archived, sellPrice: null, costPrice: 2000_00n },
        warehouse: null, today: '2026-11-05', next: null, total: 0, rows: [], lastProduction: null,
      }),
      listItemUnits: () => [],
    },
  };
};

// ─── «خادم» الدفعة (مثل mill-fixes5): القراءة من الحالة، والكتابة مشروطة بما شافته الشاشة كما في repo الحقيقي والخادم ─────────────────────────
const milli = (value) => (value === null ? null : `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`);
const whole = (textValue) => (textValue === null ? null : BigInt(textValue.replace('.', '')));
const serverBatch = (over = {}) => ({ version: 7, weight: null, reason: null, expiry: null, day: '2026-11-04', actual: null, costs: [], ...over });
const batchJson = (id, state) => ({
  id, doc_no: null, status: 'draft', version: state.version, produced_on: state.day, planned_kg: '1000.000',
  output_qty_kg: state.weight, output_expiry_on: state.expiry, input_mass_kg: null, shrink_kg: null, shrink_pct: null, shrink_reason: state.reason, note: null, void_reason: null,
  costs_confirmed: false,
  recipe: { id: 'r-1', name: 'علف بادئ', version_id: 'v-1', version_no: 1, basis_kg: '1000.000' },
  output_item: { id: 'f-1', name: 'علف بادئ', base_unit: 'kg', tracks_expiry: false },
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: [{ id: `in-${id}`, line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: state.actual, used_qty: null, in_basis: true, is_substitute: false, reason: null, replaced_item_name: null, draws: null, money: { value: null } }],
  expenses_visible: true,
  scope: { input: true, output: true },
  money: { input_value: null, extra_value: null, total_value: null, cost_per_kg: null, costs: [] },
});
const previewJson = (id, state) => ({
  id, kind: 'production', status: 'draft', version: state.version, produced_on: state.day, planned_kg: '1000.000', input_mass_kg: '1000.000',
  output_qty_kg: state.weight ?? '1000.000', output_expiry_on: state.expiry, shrink_kg: '0.000', shrink_pct: '0.00', shrink_reason: state.reason, shrink_ok: true,
  costs_confirmed: false,
  input_warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', division_id: 'd-mill', division_name: 'معمل العلف' },
  output_warehouse: { id: 'w-feed', name: 'مخزن العلف' },
  lines: [{ input_id: `in-${id}`, line_no: 1, item_id: 'i-corn', item_name: 'ذرة صفراء', base_unit: 'kg', planned_qty: '1000.000', actual_qty: state.actual, draw_qty: state.actual ?? '1000.000', in_basis: true, tracks_expiry: false, money: { value: '450000.00' } }],
  problems: [],
  can_post: true,
  plan_token: `tok-${id}-${state.version}`,
  expenses_visible: true,
  money: { input_value: '450000.00', extra_value: '0.00', total_value: '450000.00', cost_per_kg: '450.00', costs: [] },
});
/**
 * دفعات مسوّدة بمعرّفاتها: holds[n] يُمسك القراءة رقم n (لكلّ المعرّفات معاً) حتّى يُطلق. setBatchFields وsetInputActual مشروطتان كما في mill-fixes5:
 * الفعلي بالقيمة التي شافتها الشاشة (qty_changed)، و«جهاز آخر» يكتب في الحالة مباشرةً.
 */
const batchesServer = (m, states, holds = {}) => {
  const counts = { reads: 0, ids: [] };
  const later = (fn) => {
    counts.reads += 1;
    counts.ids.push('read');
    const hold = holds[counts.reads];
    return hold ? hold.promise.then(fn) : fn();
  };
  return {
    counts,
    handlers: {
      loadBatch: (id) => {
        counts.ids.push(id);
        return later(() => m.parseBatch(batchJson(id, states[id])));
      },
      previewProduction: (id) => m.parsePreview(previewJson(id, states[id])),
      loadExpenseCategories: () => CATEGORIES,
      setBatchFields: (id, fields) => {
        const state = states[id];
        if (fields.outputQtyKg !== undefined) state.weight = milli(fields.outputQtyKg);
        if (fields.shrinkReason !== undefined) state.reason = fields.shrinkReason;
        state.version += 1;
        return id;
      },
      setInputActual: (inputId, before, actual) => {
        const state = states[inputId.replace(/^in-/u, '')];
        const now = whole(state.actual);
        if (now !== before && now !== actual) {
          throw new m.RejectedError('qty_changed', 'تغيّرت الكمية الفعلية لهذه المادّة من نافذة أو جهاز آخر بعد أن بدأت تعديلها؛ قُرئت من جديد، فراجعها واحفظ مرّة أخرى.');
        }
        state.actual = milli(actual);
        state.version += 1;
      },
    },
  };
};

export default async function (t) {
  const restore = installDom();
  try {
    const m = await load(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';",
        "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
        "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
        // صفحة «المواد» من مساحة الاسم: دالّة جديدة (recipeBack) غائبة في الشفرة القديمة تُفشل فحصها ولا توقف الحزم.
        "export * as itemsPage from './src/pages/inventory/ItemsPage.tsx';",
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
    const where = () => globalThis.__mill.location;
    /** تنقّل من خارج الصفحة (شريط العنوان أو زرّ الرجوع في المتصفّح): navigate الحقيقي من داخل الموجّه. */
    const go = async (to) => {
      globalThis.__mill.navigate(to);
      await settle();
      await settle();
    };

    let root = null;
    /**
     * مسارات App.tsx: ‎/mill/* ← MillRoutes، و‎/inventory/items ← «المواد» (يغلب)، و‎/inventory/* ← StockRoutes. keyed: مفتاح المسار كما في القشرة
     * (RouteErrorBoundary بمفتاح pathname)؛ وبلاه (ب٦٥) لا يُعتمد عليه، فالصفحة تُركَّب من جديد بمفتاحها هي وحدها.
     */
    const mount = async (url, { keyed = true } = {}) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function App() {
        const location = m.useLocation();
        globalThis.__mill.location = `${location.pathname}${location.search}`;
        globalThis.__mill.navigate = m.useNavigate();
        return m.h(
          m.Routes,
          keyed ? { key: location.pathname } : null,
          m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }),
          m.h(m.Route, { path: '/inventory/items', element: m.h(m.itemsPage.default) }),
          m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }),
        );
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(App))));
      await settle();
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
    const pickVersion = (word) => byAction('pick-version').find((button) => button.textContent.includes(word)) ?? null;
    /** عناوين جمل الكثافة وحدها (بلا نصّ الرابط بجانبها)، أو null بلا جمل. */
    const densityBlock = () => {
      const block = byAction('density-missing')[0];
      if (!block) return null;
      return descendants(block)
        .filter((n) => n.localName === 'div' && (n.getAttribute('class') ?? '').split(' ').includes('font-semibold'))
        .map((n) => n.textContent)
        .join(' | ');
    };

    // ── W61 (ب٦١): رابط الكثافة يصل إلى محرّر حقيقي ويرجع إلى المسوّدة نفسها ─────────────────────────────────────────────────────
    await step('W61 الرحلة', async () => {
      const server = journeyServer(m);
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      t.same([server.state.reads, densityBlock()], [[null], null], 'W61 ضابط: البطاقة تفتح على النسخة المفعَّلة بلا جملة كثافة');
      await press(pickVersion('مسوّدة'));
      t.eq(where(), BACK, 'W61 اختيار المسوّدة يكتب نسختها في الرابط (‎?version=)');
      t.eq(densityBlock(), DENSITY_TEXT, 'W61 الجملة تسمّي المكان الفعلي: «اكتب كثافته من «المواد» ثمّ فعّل»');
      const link = byAction('write-density')[0] ?? null;
      t.same([link?.textContent ?? null, target(link)], ['اكتب الكثافة', { path: '/inventory/items', edit: OIL, back: BACK }], 'W61 رابط «اكتب الكثافة» إلى نافذة «عدّل» للمادّة، ويرجع إلى المسوّدة بنسختها');
      await follow(link);
      t.same([named(calls, 'loadItem'), dialogForm() !== null, text().includes('تعديل زيت')], [[[OIL]], true, true], 'W61 الرابط يفتح نافذة «عدّل» للمادّة بمعرّفها');
      const field = fieldByLabel(DENSITY_FIELD);
      t.eq(field?.value ?? null, '', 'W61 وفيها خانة الكثافة (فارغة: سائل بلا كثافة)');
      type(field, '0.92');
      await settle();
      await submit();
      t.same(named(calls, 'updateItem'), [[OIL, 4, { density_kg_per_l: '0.9200' }]], 'W61 الحفظ يرسل الكثافة وحدها بنسخة المادّة');
      t.same(
        [where(), server.state.reads.at(-1), densityBlock(), noticeTitles().includes(READY), disabled(byAction('activate-version')[0])],
        [BACK, 'v-2', null, true, false],
        'W61 وبعد الحفظ يرجع إلى المسوّدة نفسها: لا جملة كثافة، والخلطة جاهزة للتفعيل',
      );
      t.ok(globalThis.__mill.toasts.some((toast) => toast.title === 'حُفظت المادّة «زيت»'), 'W61 ورسالة الحفظ');
    });
    await step('W61 الرجوع في المتصفّح', async () => {
      // زرّ الرجوع من «المواد» (بلا حفظ) يفتح المسوّدة التي كان عليها لا المفعَّلة: النسخة في الرابط لا في حالة الصفحة.
      const server = journeyServer(m);
      fresh(MANAGER, server.handlers);
      await mount('/mill/recipe/r-1');
      await press(pickVersion('مسوّدة'));
      await go('/inventory/items');
      await go(-1);
      t.same(
        [server.state.reads, byAction('activate-version').length, (pickVersion('مسوّدة')?.getAttribute('class') ?? '').split(' ').includes('bg-brand-600')],
        [[null, 'v-2', 'v-2'], 1, true],
        'W61 الرجوع يقرأ المسوّدة نفسها ويعرضها',
      );
    });
    await step('W61 غير المدير', async () => {
      const server = journeyServer(m);
      const calls = fresh(ACCOUNTANT, server.handlers);
      await mount(`/mill/recipe/r-1?version=v-2`);
      t.same([server.state.reads, densityBlock()], [['v-2'], DENSITY_OTHERS], 'W61 المحاسب: الرابط بنسخته يفتح المسوّدة، والجملة «يكتبها المالك أو المدير من «المواد»»');
      t.same([byAction('write-density').length, byAction('open-item-card').length], [0, 0], 'W61 ولا رابط يدلّه على فعل ليس له');
      await go(`/inventory/items?edit=${OIL}&back=${encodeURIComponent(BACK)}`);
      t.same([where().startsWith('/inventory/items'), dialogForm(), named(calls, 'loadItem').length], [true, null, 0], 'W61 و«المواد» بالرابط تفتح له بلا نافذة ولا قراءة للمادّة');
      await unmount();
      root = null;
      const keeperCalls = fresh(KEEPER, journeyServer(m).handlers);
      await mount(`/inventory/items?edit=${OIL}`);
      t.same([dialogForm(), named(keeperCalls, 'loadItem').length, text().includes('المواد')], [null, 0, true], 'W61 والأمين كذلك: «المواد» بلا نافذة');
    });
    // «المخزن ببساطة» (2026-11-06): بطاقة المادّة القديمة صارت «دفتر المادّة والوجبات» على ‎/inventory/items/:id/details (والمسار بلا
    // /details ملفّ المادّة الجديد، وله «عدّل المادّة» برجوعه إليه: simple-purchase.test).
    await step('W61 «عدّل المادّة» في بطاقة المادّة', async () => {
      const server = journeyServer(m);
      const calls = fresh(MANAGER, server.handlers);
      await mount(`/inventory/items/${OIL}/details`);
      const link = byAction('edit-item-card')[0] ?? null;
      t.same([link?.textContent ?? null, target(link)], ['عدّل المادّة', { path: '/inventory/items', edit: OIL, back: null }], 'W61 زرّ «عدّل المادّة» لمن يعدّل المواد يفتح الطريق نفسه');
      await follow(link);
      const field = fieldByLabel(DENSITY_FIELD);
      t.same([where(), dialogForm() !== null, field?.value ?? null], [`/inventory/items?edit=${OIL}`, true, ''], 'W61 فتفتح نافذة «عدّل» بخانة الكثافة');
      type(field, '1.25');
      await settle();
      await submit();
      t.same(
        [named(calls, 'updateItem'), where(), dialogForm(), named(calls, 'listItems').length],
        [[[OIL, 4, { density_kg_per_l: '1.2500' }]], '/inventory/items', null, 2],
        'W61 وبعد الحفظ بلا مسار رجوع تبقى «المواد» بلا معاملَي الرابط والجدول يُقرأ من جديد',
      );
    });
    await step('W61 بطاقة المادّة لغير المدير وللمؤرشفة', async () => {
      fresh(ACCOUNTANT, journeyServer(m).handlers);
      await mount(`/inventory/items/${OIL}/details`);
      t.ok(text().includes('دفتر المادّة والوجبات'), 'W61 ضابط: المحاسب يرى البطاقة');
      t.eq(byAction('edit-item-card').length, 0, 'W61 والمحاسب (بلا stores.manage) بلا «عدّل المادّة»');
      await unmount();
      root = null;
      fresh(KEEPER, journeyServer(m).handlers);
      await mount(`/inventory/items/${OIL}/details`);
      t.same([byAction('buy-item').length, byAction('edit-item-card').length], [0, 0], 'W61 والأمين (لا يعدّل المواد) بلا «عدّل المادّة»، ولا «اشترِ» هنا: الشراء من ملفّ المادّة وحده');
      await unmount();
      root = null;
      fresh(MANAGER, journeyServer(m, { archived: true }).handlers);
      await mount(`/inventory/items/${OIL}/details`);
      t.eq(byAction('edit-item-card').length, 0, 'W61 ولا «عدّل المادّة» لمؤرشفة (لا تُعدَّل)');
    });
    await step('W61 مسار الرجوع', async () => {
      const back = m.itemsPage.recipeBack;
      const verdicts = [
        '/mill/recipe/r-1', BACK, '/mill/recipe/e6f60000-0000-4000-8000-000000020013?version=e6f60000-0000-4000-8000-000000020014',
        null, '', '/mill/batch/b-1', '/inventory/items', '/mill/recipe/', 'https://evil.example/mill/recipe/r-1', '//evil.example/mill/recipe/r-1',
        '/mill/recipe/../../inventory', '/mill/recipe/r-1?version=v-2&next=//evil.example', '/mill/recipe/r-1#x', 'javascript:alert(1)', '/mill/recipe/r-1/../../x',
        // ملفّ المادّة (0017) يُقبل وحده بمعرّفه، لا ما تحته ولا ما بعده.
        `/inventory/items/${OIL}`, `/inventory/items/${OIL}/details`, '/inventory/items/../x', `/inventory/items/${OIL}?buy=1`, '//evil.example/inventory/items/i-oil',
      ].map((value) => (typeof back === 'function' ? back(value) : 'absent'));
      t.same(
        verdicts,
        ['/mill/recipe/r-1', BACK, '/mill/recipe/e6f60000-0000-4000-8000-000000020013?version=e6f60000-0000-4000-8000-000000020014', null, null, null, null, null, null, null, null, null, null, null, null, `/inventory/items/${OIL}`, null, null, null, null],
        'W61 ‎?back= يُقبل لبطاقة خلطة بنسختها ولملفّ مادّة وحدهما، وغيرهما null (لا تنقّل خارجي ولا إلى مسار آخر)',
      );
      for (const [label, bad] of [['رابط خارجي', 'https://evil.example/'], ['مسار آخر في المعمل', '/mill/batch/b-1']]) {
        const server = journeyServer(m);
        const calls = fresh(MANAGER, server.handlers);
        await mount(`/inventory/items?edit=${OIL}&back=${encodeURIComponent(bad)}`);
        type(fieldByLabel(DENSITY_FIELD), '0.9');
        await settle();
        await submit();
        t.same([named(calls, 'updateItem').length, where()], [1, '/inventory/items'], `W61 ${label} في ‎?back= لا يُتبع بعد الحفظ: تبقى «المواد»`);
        await unmount();
        root = null;
      }
    });
    await step('W61 مادّة غائبة أو مؤرشفة بالرابط', async () => {
      for (const [label, id, archived] of [['غائبة', 'i-missing', false], ['مؤرشفة', OIL, true]]) {
        const calls = fresh(MANAGER, journeyServer(m, { archived }).handlers);
        await mount(`/inventory/items?edit=${id}`);
        t.same(
          [named(calls, 'loadItem'), dialogForm(), noticeTitles().includes('لا تُفتح هذه المادّة للتعديل: ليست في منشأتك، أو مؤرشفة.')],
          [[[id]], null, true],
          `W61 مادّة ${label} بالرابط: لا نافذة، والصفحة تقول ذلك بدل أن تسكت`,
        );
        await unmount();
        root = null;
      }
    });

    // ── W62 (ب٦٢): unconverted في لوحة كلفة الطنّ ──────────────────────────────────────────────────────────────────────────
    const panel = () => byAction('expected-cost')[0]?.textContent ?? null;
    const UNCONVERTED = '1 من المواد لا تُحسب حتّى تُصحَّح سطورها أعلاه.';
    await step('W62 المحلّل', async () => {
      t.same(
        safe(() => m.parseRecipe(OIL_DRAFT()).expected),
        { materialsPerTon: 894_600_00n, ratesPerTon: 0n, costPerTon: 894_600_00n, unpriced: 0, unconverted: 1 },
        'W62 unconverted يُقرأ عدداً منفصلاً عن unpriced',
      );
      const absent = OIL_DRAFT();
      delete absent.money.expected.unconverted;
      t.eq(safe(() => m.parseRecipe(absent) && 'ok'), 'mill_shape:unconverted', 'W62 unconverted الغائب خطأ شكل (المفتاح إلزامي، لا صفر صامت)');
      for (const [label, bad] of [['سالب', -1], ['نصّ', '1'], ['كسر', 1.5], ['null', null]]) {
        const broken = OIL_DRAFT();
        broken.money.expected.unconverted = bad;
        t.eq(safe(() => m.parseRecipe(broken) && 'ok'), 'mill_shape:unconverted', `W62 unconverted ${label} خطأ شكل`);
      }
    });
    await step('W62 الزيت للمدير', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(OIL_DRAFT()) });
      await mount('/mill/recipe/r-1');
      t.same(byAction('cost-price').map((input) => input.value), ['900.00', '2000.00'], 'W62 ضابط: سعر كلفة الزيت مكتوب في سطره');
      t.same(
        [panel()?.includes('كلفة الطنّ المتوقّعة: 894,600.00 على الأقلّ') ?? null, panel()?.includes(`المواد 894,600.00 والتكاليف 0.00 لكلّ طنّ. ${UNCONVERTED}`) ?? null],
        [true, true],
        `W62 اللوحة: «على الأقلّ» و«لا تُحسب حتّى تُصحَّح سطورها أعلاه» (${panel()})`,
      );
      t.same([panel()?.includes('بلا أيّ سعر') ?? null, panel()?.includes('اكتب سعر كلفتها') ?? null], [false, false], 'W62 ولا «بلا أيّ سعر… اكتب سعر كلفتها» تحت سطر سعره مكتوب');
    });
    await step('W62 الزيت للمحاسب', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(OIL_DRAFT()) });
      await mount('/mill/recipe/r-1');
      t.same([panel()?.includes(UNCONVERTED) ?? null, panel()?.includes('بلا أيّ سعر') ?? null, panel()?.includes('يكتبه المالك أو المدير') ?? null], [true, false, false], 'W62 المحاسب كذلك: الجملة نفسها، ولا «بلا أيّ سعر»');
    });
    await step('W62 الدبس (unit_mismatch)', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(DIBS_DRAFT()) });
      await mount('/mill/recipe/r-1');
      t.same(
        [panel()?.includes('كلفة الطنّ المتوقّعة: 874,800.00 على الأقلّ') ?? null, panel()?.includes(UNCONVERTED) ?? null, panel()?.includes('بلا أيّ سعر') ?? null],
        [true, true, false],
        'W62 سطر لتر لمادّة صارت بالكيلو وسعرها مكتوب: «لا تُحسب حتّى تُصحَّح» لا «بلا أيّ سعر»',
      );
    });
    await step('W62 مع مادّة بلا سعر', async () => {
      const answer = OIL_DRAFT();
      answer.lines[0].money.cost_price = null;
      answer.money.expected = { unpriced: 1, unconverted: 1, cost_per_ton: '0.00', rates_per_ton: '0.00', materials_per_ton: '0.00' };
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(answer) });
      await mount('/mill/recipe/r-1');
      t.ok(
        panel()?.includes(`لكلّ طنّ. 1 من المواد بلا أيّ سعر فلم تُحسب: اكتب سعر كلفتها. ${UNCONVERTED}`) ?? false,
        `W62 مادّة بلا سعر وأخرى لا تتحوّل: الجملتان كلّ واحدة لسطورها (${panel()})`,
      );
    });
    await step('W62 ضابط', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson()) });
      await mount('/mill/recipe/r-1');
      t.same(
        [panel()?.includes('كلفة الطنّ المتوقّعة: 450,000.00') ?? null, panel()?.includes('على الأقلّ') ?? null, panel()?.includes('لا تُحسب') ?? null],
        [true, false, false],
        'W62 ضابط: لا unpriced ولا unconverted ← الرقم كاملاً بلا جملة',
      );
    });

    // ── W63 (ب٦٣): «نسخة جديدة» بالمعرّف نفسه بعد جواب ضاع ─────────────────────────────────────────────────────────────────
    const made = (over = {}) => ({ recipe_id: 'r-1', version_id: 'v-2', version_no: 2, status: 'draft', lines: 1, rates: 0, existing: false, skipped: [], ...over });
    const yeastActive = () =>
      recipeJson({
        status: 'active',
        lines: [
          recipeLine({ qty: '990.000', mass_kg: '990.000', share_pct: '99.00' }),
          recipeLine({ id: 'l-y', line_no: 2, item_id: 'i-yeast', item_name: 'خميرة', base_unit: 'pc', category_name: null, qty: '10.000', mass_kg: '10.000', share_pct: '1.00', unit_changed: true }),
        ],
      });
    const copiedDraft = (versionId) =>
      recipeJson({
        versionId, versionNo: 2, version: 1, massKg: '990.000',
        versions: [{ id: 'v-1', version_no: 1, status: 'active', basis_kg: '1000.000', activated_at: null, version: 5 }, { id: versionId, version_no: 2, status: 'draft', basis_kg: '1000.000', activated_at: null, version: 1 }],
        lines: [recipeLine({ qty: '990.000', mass_kg: '990.000', share_pct: '99.00' })],
      });
    const SKIPPED = 'نُسخت النسخة بلا «خميرة»: صارت تُقاس بالقطعة فلا تدخل الخلطة.';
    const OPENED = 'لهذه الخلطة مسوّدة قائمة: فُتحت لتكملها.';
    const COPIED = 'أُنشئت نسخة مسوّدة بموادّ النسخة المفعَّلة وتكاليفها: عدّلها ثم فعّلها.';
    await step('W63 الإعادة بالمعرّف نفسه', async () => {
      // الخادم أنشأ المسوّدة بمعرّف الجهاز وضاع الجواب؛ الإعادة بالمعرّف نفسه ترجع ما رجع أوّل مرّة (ق٦٣): existing = false وskipped محسوبة.
      const state = { created: null, attempts: [] };
      fresh(MANAGER, {
        loadRecipe: (recipeId, versionId) => m.parseRecipe(versionId !== null && versionId === state.created ? copiedDraft(versionId) : yeastActive()),
        newRecipeVersion: (recipeId, versionId) => {
          state.attempts.push(versionId);
          if (state.created === null) {
            state.created = versionId;
            throw new m.UnknownOutcomeError();
          }
          return m.parseNewRecipeVersion(versionId === state.created ? made({ version_id: versionId, skipped: ['خميرة'] }) : made({ version_id: state.created, existing: true }));
        },
      });
      await mount('/mill/recipe/r-1');
      t.ok(noticeTitles().some((title) => title.startsWith('تغيّرت وحدة «خميرة» بعد التفعيل')), 'W63 ضابط: المفعَّلة تقول إنّ وحدة «خميرة» تغيّرت');
      await press(byAction('new-version')[0]);
      t.same([text().includes('نتيجة العملية غير معروفة'), byAction('new-version').length], [true, 1], 'W63 ضاع الجواب: «نتيجة العملية غير معروفة» والزرّ باقٍ للإعادة');
      await press(byAction('new-version')[0]);
      t.same([state.attempts.length, state.attempts[0] === state.attempts[1]], [2, true], 'W63 الإعادة بالمعرّف نفسه');
      t.same(
        [noticeTitles().includes(SKIPPED), globalThis.__mill.toasts.map((toast) => toast.title).filter((title) => title === OPENED || title === COPIED)],
        [true, [COPIED]],
        'W63 الإعادة تقول «نُسخت النسخة بلا «خميرة»» ولا تقول «مسوّدة قائمة»',
      );
    });
    await step('W63 ضابط: مسوّدة أخرى قائمة', async () => {
      fresh(MANAGER, {
        loadRecipe: (recipeId, versionId) => m.parseRecipe(versionId === 'v-other' ? copiedDraft('v-other') : yeastActive()),
        newRecipeVersion: () => m.parseNewRecipeVersion(made({ version_id: 'v-other', existing: true })),
      });
      await mount('/mill/recipe/r-1');
      await press(byAction('new-version')[0]);
      t.same(
        [noticeTitles().some((title) => title.startsWith('نُسخت النسخة بلا')), globalThis.__mill.toasts.map((toast) => toast.title)],
        [false, [OPENED]],
        'W63 ضابط: مسوّدة بمعرّف آخر قائمة ← «مسوّدة قائمة» بلا جملة ترك',
      );
    });

    // ── W64 (ب٦٤): useKeptLoad بقراءتين ناجحتين قبل الرفض ──────────────────────────────────────────────────────────────────
    await step('W64 آخر قراءة أثناء القراءة الجديدة', async () => {
      const read3 = deferred();
      const states = { 'b-1': serverBatch() };
      const server = batchesServer(m, states, { 3: read3 });
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1');
      type(byAction('output-weight')[0], '985');
      await settle();
      await click(byAction('save-weight')[0]);
      t.same([server.counts.reads, valueOf('output-weight')], [2, '985.000'], 'W64 ضابط: حُفظ الوزن وقُرئت الدفعة ثانيةً');
      // جهاز آخر يحفظ الفعلي 1,005 ثمّ يكتب المدير 1010 ويحفظ: يُرفض qty_changed وتُقرأ الدفعة ثالثةً (ممسوكة).
      states['b-1'].actual = '1005.000';
      states['b-1'].version += 1;
      type(byAction('input-actual')[0], '1010');
      await settle();
      await click(byAction('input-actual-save')[0]);
      t.same(
        [server.counts.reads, text().includes('تغيّرت الكمية الفعلية لهذه المادّة من نافذة أو جهاز آخر'), valueOf('output-weight'), valueOf('input-actual')],
        [3, true, '985.000', '1010'],
        'W64 أثناء القراءة الجديدة: آخر ما قُرئ (الوزن 985) لا القراءة الأولى، وما كتبه باقٍ',
      );
      read3.resolve();
      await settle();
      await press(byAction('input-actual-save')[0]);
      t.same(
        named(calls, 'setInputActual').map(([inputId, before, actual]) => [inputId, before, actual]),
        [['in-b-1', null, 1_010_000n], ['in-b-1', 1_005_000n, 1_010_000n]],
        'W64 الحفظ التالي مشروط بالقراءة الجديدة',
      );
      t.same([states['b-1'].actual, text().includes('من نافذة أو جهاز آخر')], ['1010.000', false], 'W64 فينجح بلا حلقة رفض');
    });

    // ── W65 (ب٦٥): الانتقال بالرابط بين دفعتين وبين خلطتين ──────────────────────────────────────────────────────────────
    await step('W65 من دفعة إلى أخرى', async () => {
      const states = { 'b-1': serverBatch(), 'b-2': serverBatch({ weight: '1000.000' }) };
      const server = batchesServer(m, states);
      const calls = fresh(MANAGER, server.handlers);
      await mount('/mill/batch/b-1', { keyed: false });
      type(byAction('output-weight')[0], '960');
      await settle();
      t.same([valueOf('output-weight'), byAction('post-unsaved').length], ['960', 1], 'W65 ضابط: وزن مكتوب لم يُحفظ في الدفعة الأولى');
      await go('/mill/batch/b-2');
      t.same(
        [where(), named(calls, 'loadBatch').map(([id]) => id).at(-1), valueOf('output-weight'), byAction('post-unsaved').length],
        ['/mill/batch/b-2', 'b-2', '1000.000', 0],
        'W65 الدفعة الثانية بوزنها المحفوظ: لا يبقى وزن الأولى ولا «احفظ ما كتبته»',
      );
      await press(byAction('save-weight')[0]);
      t.eq(named(calls, 'setBatchFields').length, 0, 'W65 ولا يُرسل وزن الأولى على الثانية');
    });
    await step('W65 من خلطة إلى أخرى', async () => {
      const prices = { 'r-1': '450.00', 'r-2': '460.00' };
      const calls = fresh(MANAGER, {
        loadRecipe: (recipeId) => m.parseRecipe(recipeJson({ id: recipeId, name: recipeId === 'r-1' ? 'علف بادئ' : 'علف نامٍ', lines: [recipeLine({ money: { unit_cost: '430.50', cost_price: prices[recipeId], last_price: '440.25' } })] })),
        activateVersion: () => {
          throw new m.RejectedError('probe_rejected', 'رفض الخادم تفعيل هذه الخلطة.');
        },
      });
      await mount('/mill/recipe/r-1', { keyed: false });
      await press(byAction('activate-version')[0]);
      type(byAction('cost-price')[0], '700');
      await settle();
      t.same([valueOf('cost-price'), text().includes('رفض الخادم تفعيل هذه الخلطة.')], ['700', true], 'W65 ضابط: في الخلطة الأولى سعر مكتوب لم يُحفظ ورفض معروض');
      await go('/mill/recipe/r-2');
      t.same(
        [named(calls, 'loadRecipe').at(-1), valueOf('cost-price'), text().includes('رفض الخادم تفعيل هذه الخلطة.'), text().includes('علف نامٍ')],
        [['r-2', null], '460.00', false, true],
        'W65 الخلطة الثانية بسعرها المحفوظ وبلا رفض الأولى',
      );
    });

    // ── W66 (تكامل الجولة السادسة، ق٦٤): سطر لتر تُقرَّب كتلته صفراً لا تُفعَّل النسخة به ─────────────────────────────────────────────────────
    // جواب recipe_detail بالشكل الذي يرسله الخادم (مثبَّت على القاعدة الحقيقية في supabase/tests/mill2.test.mjs، القسم ١٠): ذرة 1,000 كغم و«سائل خفيف» 0.001 لتر
    // صغرت كثافة مادّته، فكتلته 0.000 وحصّته 0.00 والمجموع 1,000 = الأساس، بلا unit_mismatch ولا density_missing ووحدته لتر — فلا شيء من شروط ب٤١ الثلاثة يمسكه.
    // الخادم يرفض التفعيل qty_not_positive، فلا «جاهزة للتفعيل» ولا «فعّل النسخة» مفعَّل، وجملة تسمّي السطر بعلاج الخادم (كمية أكبر)، ولمن لا يعدّل الخلطة من يكتبها.
    // والضابط: 0.002 لتر (كتلته 0.001) والذرة 999.999 ← «جاهزة».
    const lightLine = (qty, mass) =>
      recipeLine({ id: 'l-light', line_no: 2, item_id: 'i-light', item_name: 'سائل خفيف', base_unit: 'L', category_name: null, qty, unit: 'L', mass_kg: mass, share_pct: '0.00',
        money: { unit_cost: null, cost_price: null, last_price: null } });
    const ZERO_LINES = [recipeLine(), lightLine('0.001', '0.000')];
    const ZERO_TEXT = 'كمية «سائل خفيف» في الخلطة تُقرَّب صفراً بالكيلوغرام: اكتب كمية أكبر.';
    const ZERO_OTHERS = 'كمية «سائل خفيف» في الخلطة تُقرَّب صفراً بالكيلوغرام: يكتب المالك أو المدير كمية أكبر.';
    const BLOCKED = 'المجموع مطابق للأساس، ولا تُفعَّل حتّى تُصحَّح السطور أعلاه.';
    await step('W66 المدير', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: ZERO_LINES })) });
      await mount('/mill/recipe/r-1');
      t.same(
        [noticeTitles().includes(ZERO_TEXT), noticeTitles().includes(BLOCKED), noticeTitles().includes(READY), disabled(byAction('activate-version')[0])],
        [true, true, false, true],
        'W66 سطر كتلته صفر والمجموع مطابق: جملة تسمّيه بعلاج الخادم، و«لا تُفعَّل حتّى تُصحَّح السطور أعلاه» لا «جاهزة»، و«فعّل النسخة» معطَّل',
      );
    });
    await step('W66 المحاسب', async () => {
      fresh(ACCOUNTANT, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: ZERO_LINES })) });
      await mount('/mill/recipe/r-1');
      t.same([noticeTitles().includes(ZERO_OTHERS), noticeTitles().includes(ZERO_TEXT)], [true, false], 'W66 المحاسب (لا يعدّل الخلطة): الجملة تقول من يكتب الكمية لا «اكتب» (درس ب٣٧)');
    });
    await step('W66 ضابط', async () => {
      fresh(MANAGER, { loadRecipe: () => m.parseRecipe(recipeJson({ lines: [recipeLine({ qty: '999.999', mass_kg: '999.999' }), lightLine('0.002', '0.001')] })) });
      await mount('/mill/recipe/r-1');
      t.same(
        [noticeTitles().some((title) => title.includes('تُقرَّب صفراً')), noticeTitles().includes(READY), disabled(byAction('activate-version')[0])],
        [false, true, false],
        'W66 ضابط: 0.002 لتر (كتلته 0.001) والذرة 999.999 ← «جاهزة للتفعيل» بلا جملة الكتلة الصفرية',
      );
    });
  } finally {
    delete globalThis.__mill;
    restore();
  }
}
