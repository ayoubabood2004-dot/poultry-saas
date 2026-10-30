// شاشات المرحلة 1 WP2 مرسومة نصّاً من المصدر الحقيقي: جدول المواد (الرموز LTR، الحدّ الأدنى بمراتب العمود الثابتة،
// الإجراءات أوّل عمود)، ونموذج المادّة (حقول وحدة الأساس، والقراءة لنصوص عشرية بقيود القاعدة نفسها، والحقول المتغيّرة
// بس، والتوائم)، وفلتر البحث بالاسم والرمز، و«إعدادات المنشأة» (يوم التشغيل والثابت، والمواقع ثم مخازنها، والنظامية
// للقراءة)، ومنتقي النطاق بالوحدة والموقع والمخزن بشاشة الموظفين.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function bundle(contents, plugins = []) {
  const result = await build({
    stdin: { contents: `${contents} export { renderToStaticMarkup } from 'react-dom/server.browser'; export { createElement as h } from 'react';`, resolveDir: ROOT, loader: 'tsx' },
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
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

// شاشات المخزون بقراءات بديلة (مثل accounts-screens): useLoad يرجّع globalThis.__inv.loads[«دالّة repo|المفتاح»] (الدالّة تنعرف
// بنداء القراءة مرّة: سهم useCallback بلا اسم، فالاسم من نداء repo/inventory المسجّل، ويّا المفتاح نفسه)، وuseSession
// وuseStore (الاتّصال) من globalThis.__inv، وقراءات repo/inventory مسجّلة بمعطياتها (وعد ما يرجع)، والأزرار ونوافذ التأكيد تسجّل
// خصائصها، فالضغط ينادى من onClick المسجّل بلا متصفّح. بلمستوردي src/pages/inventory بس، والكائن العامّ ينشال بـfinally.
const INV_REPO = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'inventory.ts'));
const INV_READS = ['loadOrgSetup', 'loadStockOnHand', 'loadStockValues', 'loadStockValueTotals', 'loadItemLots', 'loadItemLotValues', 'loadItemMoves', 'listItemUnits', 'listStockDocs', 'loadStockDoc', 'discardDraft', 'deleteDraftLine', 'previewOpening', 'previewTransfer', 'listItems', 'createTransferDraft', 'addTransferLine', 'updateStockDraft'];
const INV_STUBS = {
  load: "export function useLoad(load, key = '') { const g = globalThis.__inv; const before = g.calls.length; try { Promise.resolve(load()).catch(() => {}); } catch {} const name = g.calls.slice(before).map(([fn]) => fn).join('+') || 'none'; g.calls.length = before; g.loaded.push(name); const state = g.loads[`${name}|${key}`]; return { data: state?.data ?? null, error: state?.error ?? null, loading: !state, retry() { g.calls.push(['retry', name]); } }; }",
  session: 'export const useSession = () => globalThis.__inv.session; export const sessionStore = { get: () => globalThis.__inv?.session ?? { status: "loading" } };',
  store: 'export const useStore = () => globalThis.__inv.online;',
  inventory: `export * from ${INV_REPO}; ${INV_READS.map((name) => `export const ${name} = (...args) => { globalThis.__inv.calls.push(['${name}', args]); return new Promise(() => {}); };`).join(' ')}`,
  Button: "import { createElement } from 'react'; const keep = (props) => globalThis.__inv.buttons.push(props); export function Button(props) { keep(props); return createElement('button', { 'data-action': props['data-action'], disabled: props.disabled || undefined }, props.children); } export function IconButton(props) { keep(props); return createElement('button', { 'data-action': props['data-action'], 'aria-label': props.label }, props.children); }",
  ConfirmDialog: "import { createElement } from 'react'; export function ConfirmDialog(props) { globalThis.__inv.confirms.push(props); return props.open ? createElement('div', { role: 'dialog' }, props.title, props.consequence) : null; }",
};
const invStubs = {
  name: 'inventory-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/useLoad$|\/lib\/session$|\/lib\/store$|\/lib\/repo\/inventory$|\/components\/ui\/Button$|\/components\/ui\/ConfirmDialog$/ }, (args) => {
      if (!args.importer.replace(/\\/g, '/').includes('src/pages/inventory/')) return undefined;
      const name = args.path.split('/').at(-1);
      return { path: name === 'useLoad' ? 'load' : name, namespace: 'inventory-stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'inventory-stub' }, (args) => ({ contents: INV_STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

/** يشغّل fn بـglobalThis.__inv ويشيله بعدها (درس 2026-10-26: الكائن العامّ يرجع كما كان). */
async function withInventory(state, fn) {
  // loaded: أسماء قراءات useLoad بترتيبها (none = ما نادت repo)، حتى الفحص يثبت قراءة ما صارت (قيم لدور بلا كلفة).
  globalThis.__inv = { loads: {}, session: { status: 'loading' }, online: true, calls: [], buttons: [], confirms: [], loaded: [], ...state };
  try {
    return await fn(globalThis.__inv);
  } finally {
    delete globalThis.__inv;
  }
}

const item = (over) => ({
  id: 'i-1',
  version: 1,
  archived: false,
  name: 'ذرة صفراء',
  nameNorm: 'ذره صفراء',
  categoryId: 'c-1',
  kind: 'raw',
  baseUnit: 'kg',
  density: null,
  pieceMassKg: null,
  tracksExpiry: false,
  scaleStep: 100n,
  minQty: 1_500_000n,
  barcode: '6221234',
  altCodes: ['C-1'],
  ...over,
});

export default async function (t) {
  const m = await bundle(
    [
      "export { ItemsTable, ItemForm, formOf, fieldsOf, changedFields, twinVerdict, unitFactor, unitsDirty } from './src/pages/inventory/ItemsPage.tsx';",
      "export { SetupTables, placeRows, goLiveText, GoLiveField, parseDayText, packFactor } from './src/pages/settings/OrgSettingsPage.tsx';",
      "export { ScopeChecks, divisionsText } from './src/pages/staff/StaffPage.tsx';",
      "export { itemSearchFilter, parseItemRow } from './src/lib/repo/inventory.ts';",
      "export { columnDecimals, fmtScaledCell } from './src/lib/format.ts';",
      "export { searchable } from './src/domain/normalize.ts';",
    ].join('\n'),
  );
  const render = (element) => m.renderToStaticMarkup(element);
  const categories = [{ id: 'c-1', version: 1, archived: false, name: 'أعلاف' }];

  // ── جدول المواد ─────────────────────────────────────────────────────────────────────────────────────────
  const rows = [
    item({}),
    item({ id: 'i-2', name: 'زيت', baseUnit: 'L', minQty: 250n, barcode: null, altCodes: [], categoryId: null }),
    item({ id: 'i-4', name: 'غاز', kind: 'fuel', baseUnit: 'pc', scaleStep: 1000n, minQty: 10_000n, barcode: null, altCodes: [], categoryId: null }),
    item({ id: 'i-3', name: 'قديمة', archived: true, minQty: null }),
  ];
  const table = render(m.h(m.ItemsTable, { rows, categories, onOpen: () => {} }));
  t.ok(table.includes('<bdi dir="ltr">6221234، C-1</bdi>'), 'الرموز LTR بفاصل عربي');
  // قانون الجداول (CLAUDE.md، E23): الكمية بعمودها بـfmtQtyCell والوحدة برأس العمود؛ عمود لكل وحدة أساس، فالقطع ما تطلع بكسر.
  const minHeaders = [...table.matchAll(/<th[^>]*>(الحدّ الأدنى[^<]*)<\/th>/gu)].map((match) => match[1]);
  t.same(minHeaders, ['الحدّ الأدنى (كغم)', 'الحدّ الأدنى (لتر)', 'الحدّ الأدنى (قطعة)'], 'الحدّ الأدنى عمود لكل وحدة أساس، والوحدة برأسه');
  t.ok(table.includes('<bdi dir="ltr">1,500.000</bdi>') && table.includes('<bdi dir="ltr">0.250</bdi>') && table.includes('<bdi dir="ltr">10</bdi>'), 'الكيلو واللتر بثلاث مراتب ثابتة، والقطع عدد صحيح');
  t.ok(!table.includes('10.0'), 'ولا كسر بعدد القطع');
  const kgOnly = render(m.h(m.ItemsTable, { rows: [item({})], categories }));
  t.ok(kgOnly.includes('الحدّ الأدنى (كغم)') && !kgOnly.includes('الحدّ الأدنى (لتر)') && !kgOnly.includes('الحدّ الأدنى (قطعة)'), 'عمود الوحدة يبين بس إذا بيه مادّة بهالوحدة');
  t.ok(table.includes('قديمة (مؤرشفة)') && table.includes('data-action="restore-item"'), 'المؤرشفة بعلامتها وزرّ إعادتها');
  t.ok(table.indexOf('إجراءات</th>') < table.indexOf('المادّة</th>'), 'الإجراءات أوّل عمود');
  t.ok(table.includes('أعلاف') && table.includes('لتر') && table.includes('مادّة أوّلية'), 'التصنيف والوحدة والنوع بأسمائها');
  const readOnly = render(m.h(m.ItemsTable, { rows, categories }));
  t.ok(!readOnly.includes('data-action="edit-item"') && !readOnly.includes('إجراءات</th>'), 'بلا صلاحية: ماكو عمود إجراءات');

  // ── نموذج المادّة ───────────────────────────────────────────────────────────────────────────────────────
  const form = (over) => ({ ...m.formOf(null), name: 'زيت نباتي', ...over });
  const oilForm = render(m.h(m.ItemForm, { id: 'f', form: form({ baseUnit: 'L', density: '0.92' }), categories, errors: {}, setForm: () => {} }));
  t.ok(oilForm.includes('الكثافة (كغم لكل لتر)') && !oilForm.includes('كتلة القطعة'), 'باللتر: حقل الكثافة بس');
  const gasForm = render(m.h(m.ItemForm, { id: 'f', form: form({ baseUnit: 'pc', altCodes: ['GAS-1'] }), categories, errors: { step: 'خطأ' }, setForm: () => {} }));
  t.ok(gasForm.includes('كتلة القطعة (كغم)') && !gasForm.includes('الكثافة'), 'بالقطعة: حقل كتلة القطعة بس');
  t.ok(gasForm.includes('<bdi dir="ltr">GAS-1</bdi>') && gasForm.includes('aria-label="احذف الرمز GAS-1"'), 'الرمز الإضافي يُحذف من النموذج نفسه');
  t.ok(gasForm.includes('role="alert"'), 'خطأ الحقل يعلن نفسه');
  const parsed = m.fieldsOf(form({ baseUnit: 'L', density: '٠٫٩٢', step: '0.5', minQty: '1,250.5', barcode: ' ab 12 ', altCodes: ['x1', 'X1', ' y 2 '] }));
  t.same(parsed.errors, {}, 'نموذج سليم بلا أخطاء (الأرقام الشرقية تنقرا)');
  t.same(
    [parsed.fields.density_kg_per_l, parsed.fields.scale_step, parsed.fields.min_qty, parsed.fields.barcode, parsed.fields.alt_codes],
    ['0.9200', '0.500', '1250.500', 'AB12', ['X1', 'Y2']],
    'الأرقام نصوص عشرية بمراتب أعمدتها، والرموز مطبَّعة بلا تكرار',
  );
  t.same(Object.keys(m.fieldsOf(form({ density: '0.92' })).errors), ['density'], 'كثافة لمادّة بالكيلو: خطأ بحقلها');
  t.same(Object.keys(m.fieldsOf(form({ baseUnit: 'pc', step: '0.1' })).errors), ['step'], 'معدودة بخطوة 0.1: خطأ بالخطوة');
  t.same(Object.keys(m.fieldsOf(form({ kind: 'chick' })).errors), ['kind'], 'أفراخ بالكيلو: خطأ بالنوع');
  t.same(Object.keys(m.fieldsOf(form({ name: ' ', minQty: '1.2345' })).errors).sort(), ['minQty', 'name'], 'اسم فارغ وحدّ بأربع مراتب');
  const zeroMass = m.fieldsOf(form({ baseUnit: 'pc', step: '1', pieceMass: '0' })).errors;
  t.same([Object.keys(zeroMass), zeroMass.pieceMass], [['pieceMass'], 'كتلة القطعة أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.'], 'كتلة قطعة صفر لمادّة معدودة: جملة items_piece_mass_check، مو «للمعدودة فقط»');
  t.same(Object.keys(m.fieldsOf(form({ baseUnit: 'pc', step: '1', pieceMass: '-2' })).errors), ['pieceMass'], 'وكتلة سالبة كذلك');
  const tatweel = m.fieldsOf(form({ name: '\u{640}\u{64E}\u{640}' })).errors;
  t.same([Object.keys(tatweel), tatweel.name], [['name'], 'اكتب اسماً بحروف؛ التطويل والتشكيل وحدهما لا يكفيان للبحث.'], 'اسم من تطويل وتشكيل فقط: خطأ بالاسم قبل الإرسال (items_name_norm_check)');
  const before = m.fieldsOf(m.formOf(item({}))).fields;
  t.same(m.changedFields(before, { ...before, name: 'ذرة' }), { name: 'ذرة' }, 'التعديل يبعث الحقل المتغيّر بس');
  t.same(m.changedFields(before, { ...before, alt_codes: ['C-1'] }), {}, 'نفس الرموز: ولا حقل');
  t.same(m.fieldsOf(m.formOf(item({}))).fields.min_qty, '1500.000', 'formOf ← fieldsOf يرجّع نفس القيمة (ما يضيّع مرتبة)');
  const twins = [
    { id: 'i-1', name: 'نفسها', archived: false, sameName: true, codes: ['X'] },
    { id: 'i-2', name: 'قديمة', archived: true, sameName: false, codes: ['X'] },
    { id: 'i-3', name: 'شبيهة', archived: false, sameName: true, codes: [] },
    { id: 'i-4', name: 'برمز', archived: false, sameName: false, codes: ['Y'] },
  ];
  const verdict = m.twinVerdict(twins, 'i-1');
  t.same([verdict.codes.map((x) => x.id), verdict.names.map((x) => x.id)], [['i-4'], ['i-3']], 'التوائم: المادّة نفسها برّا، ورمز المؤرشفة حرّ، والاسم تنبيه');

  // ── فلتر البحث ─────────────────────────────────────────────────────────────────────────────────────────
  t.eq(m.itemSearchFilter('أعلاف'), `name_norm.like."*${m.searchable('أعلاف')}*"`, 'البحث بالاسم بـsearchable (الهمزة)');
  t.eq(m.itemSearchFilter('ab 12'), 'name_norm.like."*ab 12*",barcode.eq."AB12",alt_codes.cs.{AB12}', 'البحث بالرمز بـnormalizeCode: الباركود أو أحد الرموز');
  // PostgREST: القيمة بين «"» تفكّ «\\» و«\"»، و«*» تصير «%»، وبعدها LIKE بمهرب «\\» (افتراض بوستغريس).
  const BACKSLASH = String.fromCharCode(92);
  const likeOf = (filter) => {
    const match = /^name_norm\.like\."((?:[^"\\]|\\.)*)"/u.exec(filter ?? '');
    if (!match) return null;
    const unquoted = match[1].replace(/\\(.)/gu, '$1').replaceAll('*', '%');
    let source = '';
    for (let i = 0; i < unquoted.length; i += 1) {
      const ch = unquoted[i];
      if (ch === BACKSLASH && i + 1 < unquoted.length) source += unquoted[++i].replace(/[.*+?^${}()|[\]\\]/gu, (x) => BACKSLASH + x);
      else if (ch === '%') source += '.*';
      else if (ch === '_') source += '.';
      else source += ch.replace(/[.*+?^${}()|[\]\\]/gu, (x) => BACKSLASH + x);
    }
    return new RegExp(`^${source}$`, 'su');
  };
  const finds = (typed, stored) => likeOf(m.itemSearchFilter(typed))?.test(m.searchable(stored)) ?? false;
  const special = ['علف 21% بروتين', 'فيتامين (AD3E)', 'B_12 فيتامين', 'مضاد "X"', 'علف, ناعم', 'خلطة*خاصة', `مسار${BACKSLASH}قديم`];
  t.same(special.filter((name) => !finds(name, name)), [], 'كل اسم بحروف LIKE أو الفلتر (% _ ( ) , " * \\) يلكى نفسه بالبحث باسمه كاملاً');
  t.same([finds('علف 21%', 'علف 21 بروتين'), finds('b_12', 'bx12 فيتامين'), finds('علف 21%', 'علف 21% بروتين')], [false, false, true], '«%» و«_» حرفيان بالبحث (مو أيّ شي)، وجزء الاسم يلكاه');
  t.eq(m.itemSearchFilter('a,b(c)*%_').split(',barcode')[0].startsWith('name_norm.like."*a,b(c)*'), true, 'الفاصلة والأقواس داخل القيمة المنصّصة تبقى، والرمز بحروف غريبة ما ينبحث');
  t.ok(!m.itemSearchFilter('a,b(c)*%_').includes('barcode'), 'رمز بحروف مو من الرموز ما ينبحث بالرمز');
  t.eq(m.itemSearchFilter('   '), null, 'بحث فارغ: بلا فلتر');
  t.eq(m.itemSearchFilter('٦٢٢'), 'name_norm.like."*622*",barcode.eq."622",alt_codes.cs.{622}', 'الأرقام الشرقية بالطرفين');

  // ── أرقام الأعمدة ──────────────────────────────────────────────────────────────────────────────────────
  t.eq(m.columnDecimals([25_000_000n, 40_000_000n], 6), 0, 'أحجام صحيحة: بلا مراتب');
  t.eq(m.columnDecimals([25_000_000n, 500_000n, 1_250n], 6), 5, 'العمود بأكثر مراتب يحتاجها (0.00125 خمس مراتب)');
  t.same([m.fmtScaledCell(25_000_000n, 6, 1), m.fmtScaledCell(1_234_500_000n, 6, 1), m.fmtScaledCell(-500_000n, 6, 1)], ['25.0', '1,234.5', '-0.5'], 'الخلية بمراتب العمود الثابتة وفواصل الآلاف');
  t.throws(() => m.fmtScaledCell(1_250n, 6, 2), 'كسر أكثر من مراتب العمود يرمي (ما ينخفي)', /hidden_fraction/);
  t.same([m.columnDecimals([25n, 40n], 0), m.columnDecimals([7n], 0), m.fmtScaledCell(25n, 0, m.columnDecimals([25n], 0))], [0, 0, '25'], 'قيم صحيحة (مراتبها صفر): العمود بلا مراتب، ولا «25.0»');

  // ── معامل الوحدة وحجم التعبئة بستّ مراتب (الخطّة §2.7: pack factors 6؛ قيود 0005 round(x, 6)) ──────────────────────
  t.same([m.unitFactor(null, '0.0025'), m.unitFactor(null, '50'), m.unitFactor(null, '٠٫٥'), m.unitFactor(null, '0.000001')], [2_500n, 50_000_000n, 500_000n, 1n], 'الوحدة المخصّصة بستّ مراتب (أمبولة 2.5 مل = 0.0025 لتر)');
  t.same([m.unitFactor(null, '0'), m.unitFactor(null, '-1'), m.unitFactor(null, '0.0000001'), m.unitFactor(null, '')], [null, null, null, null], 'صفر وسالب وسبع مراتب وفارغ: مرفوضة');
  t.same([m.unitFactor({ factor: 500n }, ''), m.unitFactor({ factor: 25_000_000n }, 'x')], [500n, 25_000_000n], 'من حجم تعبئة: معامله كما هو (حتى تحت 0.001)، بلا قسمة');
  t.same([m.packFactor('0.0025'), m.packFactor('12.5'), m.packFactor('0'), m.packFactor('1.1234567')], [2_500n, 12_500_000n, null, null], 'حجم التعبئة بالإعدادات بستّ مراتب كذلك');

  // ── نافذة وحدات التعبئة: الكتابة فيها «وسخة» (الإغلاق يسأل) ──────────────────────────────────────────────────
  const blank = { packId: '', label: '', factor: '', isDefault: false };
  t.same(
    [m.unitsDirty(blank), m.unitsDirty({ ...blank, label: 'برميل' }), m.unitsDirty({ ...blank, factor: '200' }), m.unitsDirty({ ...blank, packId: 'p-1' }), m.unitsDirty({ ...blank, isDefault: true })],
    [false, true, true, true, true],
    'نافذة الوحدات وسخة بأيّ حقل مكتوب (Esc وبرّا وX يسألون قبل ما تضيع الكتابة)',
  );

  // ── صفّ المادّة من القاعدة: اسم مطبَّع فارغ (صفّ قديم) ما يطيح القائمة كلّها ─────────────────────────────────────
  const raw = { id: 'i-9', version: 1, archived_at: null, name: '\u{640}', name_norm: '', category_id: null, kind: 'raw', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null, tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] };
  t.eq(m.parseItemRow(raw).nameNorm, '', 'صفّ باسم مطبَّع فارغ ينقرا (ما يرمي RowShapeError فتطيح كل صفحة المواد)');
  t.throws(() => m.parseItemRow({ ...raw, name: '' }), 'ضابط: الاسم نفسه فارغ يرمي', /row_shape:name/);

  // ── إعدادات المنشأة ────────────────────────────────────────────────────────────────────────────────────
  const setup = {
    divisions: [
      { id: 'd-gen', kind: 'general', goLiveOn: '2026-09-30', frozen: true },
      { id: 'd-mill', kind: 'feed_mill', goLiveOn: null, frozen: false },
    ],
    sites: [
      { id: 's-gen', version: 1, archived: false, divisionId: 'd-gen', name: 'المخازن العامة', kind: 'store' },
      { id: 's-mill', version: 1, archived: false, divisionId: 'd-mill', name: 'المعمل', kind: 'mill' },
    ],
    warehouses: [
      { id: 'w-raw', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', kind: 'raw' },
      { id: 'w-gen', version: 2, archived: true, divisionId: 'd-gen', siteId: 's-gen', name: 'المخزن العام', kind: 'general' },
    ],
    packTypes: [
      { id: 'p-25', version: 1, archived: false, label: 'كيس 25 كغم', dimension: 'mass', factor: 25_000_000n },
      { id: 'p-h', version: 1, archived: false, label: 'كيس نصف', dimension: 'mass', factor: 12_500_000n },
      { id: 'p-c', version: 1, archived: false, label: 'كارتون 12 طبقة', dimension: 'count', factor: 360_000_000n },
      { id: 'p-b', version: 1, archived: false, label: 'قنينة نصف لتر', dimension: 'volume', factor: 500_000n },
    ],
    itemCategories: categories,
    expenseCategories: [
      { id: 'e-1', version: 1, archived: false, name: 'فرق جرد', systemCode: 'count_diff' },
      { id: 'e-2', version: 1, archived: false, name: 'كهرباء', systemCode: null },
    ],
  };
  t.same(m.placeRows(setup).map((row) => row.store?.id ?? row.site.id), ['s-mill', 'w-raw', 's-gen', 'w-gen'], 'المواقع بترتيب الوحدات، وكل موقع ومخازنه بعده');
  t.eq(m.goLiveText(setup.divisions[0]), '30/09/2026 — ثابت: بدأ الترحيل في الوحدة', 'يوم التشغيل DD/MM/YYYY، وثابت بعد أوّل ترحيل');
  t.eq(m.goLiveText(setup.divisions[1]), 'لم يُحدَّد', 'بلا يوم: «لم يُحدَّد»');
  const all = { stores: true, expenses: true, goLive: true };
  const page = render(m.h(m.SetupTables, { setup, permissions: all, onOpen: () => {} }));
  t.ok(page.indexOf('معمل العلف') < page.indexOf('المخازن العامة</td>'), 'الوحدات بترتيبها الثابت');
  t.eq((page.match(/data-action="set-go-live"/g) ?? []).length, 1, 'زرّ يوم التشغيل للوحدة غير الثابتة بس');
  const packHeaders = [...page.matchAll(/<th[^>]*>(الحجم \([^<]*\))<\/th>/gu)].map((match) => match[1]);
  t.same(packHeaders, ['الحجم (كغم)', 'الحجم (لتر)', 'الحجم (قطعة)'], 'حجم التعبئة عمود لكل بُعد، والوحدة برأسه');
  t.ok(page.includes('<bdi dir="ltr">25.0</bdi>') && page.includes('<bdi dir="ltr">12.5</bdi>') && page.includes('<bdi dir="ltr">0.5</bdi>') && page.includes('<bdi dir="ltr">360</bdi>'), 'كل عمود بمراتبه الثابتة: الكارتون عدد صحيح (360 مو 360.0)');
  t.ok(!page.includes('360.0'), 'ولا كسر بعدد القطع');
  // المدير المحصور بوحدة (FOUNDATION ٥٤٤): أزرار يوم التشغيل والمواقع والمخازن بوحدات نطاقه بس، مثل سياسات القاعدة.
  const inMill = (target) => target.divisionId === 'd-mill';
  const scoped = render(m.h(m.SetupTables, { setup, permissions: all, allowed: inMill, onOpen: () => {} }));
  t.ok(scoped.includes('aria-label="أرشف مخزن المواد الأوّلية"') && !scoped.includes('aria-label="أعِد المخزن العام"'), 'المحصور: أزرار مخازن وحدته بس');
  t.eq((scoped.match(/data-action="set-go-live"/g) ?? []).length, 1, 'المحصور: يوم تشغيل وحدته (غير الثابتة) بس');
  const elsewhere = render(m.h(m.SetupTables, { setup, permissions: all, allowed: (target) => target.divisionId === 'd-gen', onOpen: () => {} }));
  t.eq((elsewhere.match(/data-action="set-go-live"/g) ?? []).length, 0, 'ضابط: محصور بوحدة ثابتة: ولا زرّ يوم تشغيل');
  const goLiveField = render(m.h(m.GoLiveField, { id: 'g', value: '30/09/2026', error: null, onChange: () => {} }));
  t.ok(!goLiveField.includes('type="date"') && goLiveField.includes('inputMode="numeric"') && goLiveField.includes('dir="ltr"') && goLiveField.includes('value="30/09/2026"'), 'يوم التشغيل حقل نصّ بأرقام غربية (مو منتقي الجهاز بلغته وأرقامه)');
  t.same(
    [m.parseDayText('30/09/2026'), m.parseDayText(' ٣٠/٠٩/٢٠٢٦ '), m.parseDayText('1/2/2026'), m.parseDayText('31/02/2026'), m.parseDayText('2026-09-30'), m.parseDayText('30/9/26'), m.parseDayText(''), m.parseDayText('29/02/2028'), m.parseDayText('29/02/2026'), m.parseDayText('00/01/2026'), m.parseDayText('01/13/2026'), m.parseDayText('30092026'), m.parseDayText('30-09-2026'), m.parseDayText('30.9.2026'), m.parseDayText('30 09 2026'), m.parseDayText('3092026')],
    ['2026-09-30', '2026-09-30', '2026-02-01', null, null, null, null, '2028-02-29', null, null, null, '2026-09-30', '2026-09-30', '2026-09-30', '2026-09-30', null],
    'يوم/شهر/سنة (DD/MM/YYYY كما يعرضه fmtDay، أو بفاصل «-» «.» فراغ، أو ثمانية أرقام للوحة الأرقام) ← YYYY-MM-DD، والشرقي ينقلب، والتاريخ غير الموجود يرفض',
  );
  t.ok(page.includes('نظامية') && page.includes('للقراءة فقط'), 'الفئة النظامية للقراءة بس');
  t.ok(page.includes('data-action="restore"') && page.includes('مؤرشف'), 'المخزن المؤرشف بحالته وزرّ إعادته');
  t.ok(page.includes('aria-label="أرشف مخزن المواد الأوّلية"'), 'زرّ الأرشفة يسمّي السجلّ');
  const viewer = render(m.h(m.SetupTables, { setup, permissions: { stores: false, expenses: false, goLive: false }, onOpen: () => {} }));
  t.ok(!viewer.includes('data-action=') && !viewer.includes('إجراءات</th>'), 'بلا صلاحية: جداول للقراءة بلا أزرار');
  const accountant = render(m.h(m.SetupTables, { setup, permissions: { stores: false, expenses: true, goLive: false }, onOpen: () => {} }));
  t.ok(accountant.includes('data-action="new-expense"') && !accountant.includes('data-action="new-site"'), 'المحاسب: فئات المصاريف بس');

  // ── منتقي النطاق بالموظفين ─────────────────────────────────────────────────────────────────────────────
  const options = {
    divisions: [{ id: 'd-gen', kind: 'general' }, { id: 'd-mill', kind: 'feed_mill' }],
    sites: [
      { id: 's-mill', divisionId: 'd-mill', siteId: null, name: 'المعمل', archived: false },
      { id: 's-old', divisionId: 'd-mill', siteId: null, name: 'معمل قديم', archived: true },
    ],
    warehouses: [
      { id: 'w-raw', divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', archived: false },
      { id: 'w-gone', divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن مؤرشف', archived: true },
    ],
  };
  const picker = render(m.h(m.ScopeChecks, { options, selected: { divisionIds: [], siteIds: [], warehouseIds: ['w-raw'] }, onChange: () => {} }));
  t.ok(picker.indexOf('معمل العلف') < picker.indexOf('موقع المعمل') && picker.indexOf('موقع المعمل') < picker.indexOf('مخزن المواد الأوّلية'), 'الوحدة ثم موقعها ثم مخازنه');
  t.ok(!picker.includes('معمل قديم') && !picker.includes('مخزن مؤرشف'), 'المؤرشف ما يبين إلا إذا مختار');
  t.eq((picker.match(/checked=""/g) ?? []).length, 1, 'المخزن المختار مؤشَّر وحده');
  const pickedOld = render(m.h(m.ScopeChecks, { options, selected: { divisionIds: [], siteIds: ['s-old'], warehouseIds: [] }, onChange: () => {} }));
  t.ok(pickedOld.includes('موقع معمل قديم'), 'النطاق القديم بموقع مؤرشف يبين باسمه');
  const member = { role: 'storekeeper', divisionIds: [], siteIds: ['s-mill'], warehouseIds: ['w-raw'] };
  t.eq(m.divisionsText(member, options.divisions, options), 'موقع المعمل، مخزن المواد الأوّلية', 'عمود الوحدات يسمّي المواقع والمخازن');
  t.eq(m.divisionsText({ ...member, siteIds: [], warehouseIds: [] }, options.divisions, options), 'لا وحدة', 'الأمين بلا نطاق: لا وحدة');

  // ── المرحلة 1 WP4: لوحة المخزون وبطاقة المادّة والافتتاح والتحويل ─────────────────────────────────────────────────────
  const s = await bundle(
    [
      "export { BoardBody, BoardTables } from './src/pages/inventory/StockBoardPage.tsx';",
      "export { LotsTable, MovesTable } from './src/pages/inventory/ItemCardPage.tsx';",
      "export { transferVoidSentence, previewLines, wholeLines } from './src/pages/inventory/TransfersPage.tsx';",
      "export { createdLots, openingSentence } from './src/pages/inventory/OpeningsPage.tsx';",
      "export { LotsPreview, creationReady } from './src/components/ui/LotsPreview.tsx';",
      "export { NetworkError } from './src/lib/errors.ts';",
      "export { MemoryRouter } from 'react-router-dom';",
    ].join('\n'),
  );
  const routed = (element) => s.renderToStaticMarkup(s.h(s.MemoryRouter, null, element));
  const stockRow = (over) => ({ itemId: 'i-1', name: 'كاز أويل', kind: 'fuel', baseUnit: 'L', tracksExpiry: false, minQty: null, archived: false, available: 1_000_000n, expired: 0n, nearExpiry: 0n, belowMin: false, chickAgeHours: null, oldChicks: 0n, ...over });
  const board = {
    warehouse: { id: 'w-1', name: 'المخزن العام', kind: 'general', divisionId: 'd-1', divisionKind: 'general', archived: false, hasBalance: true },
    asOf: '2026-10-30T11:05:00Z',
    rows: [
      stockRow({}),
      stockRow({ itemId: 'i-2', name: 'كاز أبيض', belowMin: true, available: 500_000n }),
      stockRow({ itemId: 'i-3', name: 'أفراخ لحم', kind: 'chick', baseUnit: 'pc', available: 150_000n, chickAgeHours: 50n, oldChicks: 100_000n }),
      stockRow({ itemId: 'i-4', name: 'علف', kind: 'feed', baseUnit: 'kg', available: 4_950_000n }),
    ],
    next: null,
    total: 4,
  };
  const keeper = routed(s.h(s.BoardTables, { board, values: null, warehouseId: 'w-1' }));
  t.ok(!keeper.includes('قيمة المتاح') && !/800,000|375,000/u.test(keeper), 'لوحة الأمين: عمود القيمة ما يتبنى أصلاً ولا رقم مال بالصفحة');
  const headers = [...keeper.matchAll(/<th[^>]*>(المتاح[^<]*)<\/th>/gu)].map((match) => match[1]);
  t.same(headers, ['المتاح (كغم)', 'المتاح (لتر)', 'المتاح (قطعة)'], 'جدول لكل وحدة أساس والوحدة برأس العمود (E23)');
  t.ok(keeper.includes('<bdi dir="ltr">1,000.000</bdi>') && keeper.includes('<bdi dir="ltr">150</bdi>'), 'اللتر بثلاث مراتب ثابتة والقطع عدد صحيح (fmtQtyCell)');
  t.ok(keeper.includes('تحت الحدّ الأدنى') && keeper.includes('أفراخ فاتها 48 ساعة'), 'تنبيه الحدّ الأدنى وتنبيه الفرخ بعد 48 ساعة');
  t.ok(keeper.includes('href="/inventory/items/i-1?wh=w-1"'), 'اسم المادّة يفتح بطاقتها بمخزنها');
  const values = new Map([['i-1', { available: 80_000_000n, expired: 0n }], ['i-2', { available: 37_500_000n, expired: 0n }]]);
  const manager = routed(s.h(s.BoardTables, { board, values, warehouseId: 'w-1' }));
  t.ok(manager.includes('قيمة المتاح') && manager.includes('<bdi dir="ltr">800,000.00</bdi>'), 'لوحة المدير: القيمة من stock_values بعمودها');
  const loaded = (data, error = null) => ({ data, error, retry: () => {} });
  const failed = routed(s.h(s.BoardBody, { first: loaded(null, new s.NetworkError()), rows: [], values: loaded(null), totals: loaded(null), costs: false, warehouseId: 'w-1' }));
  t.ok(failed.includes('role="alert"') && failed.includes('تعذّر تحميل رصيد المخزن') && !failed.includes('<table'), 'فشل القراءة: LoadFailed مو جدول فارغ');
  const totals = { units: [], available: 117_500_000n, expired: 0n, total: 117_500_000n };
  const body = routed(s.h(s.BoardBody, { first: loaded(board), rows: board.rows, values: loaded(values), totals: loaded(totals), costs: true, warehouseId: 'w-1' }));
  t.ok(body.includes('1,175,000.00') && body.includes('4 من المجموع 4'), 'المجموع من stock_value_totals و«N من المجموع» من الخادم');
  const archived = routed(s.h(s.BoardBody, { first: loaded({ ...board, warehouse: { ...board.warehouse, archived: true } }), rows: board.rows, values: loaded(null), totals: loaded(null), costs: false, warehouseId: 'w-1' }));
  t.ok(archived.includes('مؤرشف وعليه رصيد'), 'المخزن المؤرشف وعليه رصيد بعلامته (E43)');

  // ── بطاقة المادّة ──
  const lot = (over) => ({ lotId: 'l-1', qtyLeft: 5_000_000n, receivedOn: '2026-10-15', rootReceivedOn: '2026-10-15', ageDays: 15, bornAt: null, ageHours: null, expiryOn: null, expired: false, nearExpiry: false, sourceKind: 'receipt', sourceId: 'r-1', source: 'PU-2026-0005', supplierLotNo: null, ...over });
  const lots = [lot({}), lot({ lotId: 'l-2', ageDays: 5, source: 'TR-2026-0001' })];
  const costed = s.renderToStaticMarkup(s.h(s.LotsTable, { lots, values: new Map([['l-1', { qtyLeft: 5_000_000n, valueLeft: 240_416_667n }], ['l-2', { qtyLeft: 5_000_000n, valueLeft: 0n }]]), baseUnit: 'kg' }));
  t.ok(costed.includes('<bdi dir="ltr">480.8333</bdi>') && costed.includes('2,404,166.67'), 'C2: كلفة الوحدة 480.8333 بأربع مراتب (fmtUnitCost) والقيمة المتبقّية');
  t.ok(costed.includes('15 يوماً') && costed.includes('5 أيام') && costed.includes('<bdi dir="ltr">TR-2026-0001</bdi>'), 'العمر بصيغة العدد بالفصحى، ورقم المصدر LTR');
  const plain = s.renderToStaticMarkup(s.h(s.LotsTable, { lots, values: null, baseUnit: 'kg' }));
  t.ok(!plain.includes('كلفة الوحدة') && !plain.includes('480.8333') && !plain.includes('2,404,166'), 'بلا كلفة: عمودا القيمة وكلفة الوحدة ما ينبنون');
  const chicks = s.renderToStaticMarkup(s.h(s.LotsTable, { lots: [lot({ ageHours: 50n, bornAt: '2026-10-28T09:00:00Z', qtyLeft: 100_000n })], values: null, baseUnit: 'pc' }));
  t.ok(chicks.includes('50 ساعة') && chicks.includes('font-semibold'), 'عمر الفرخ بالساعات ومبرز بعد 48 ساعة (E24)');
  const moves = routed(s.h(s.MovesTable, { moves: [
    { moveId: 'm-1', seq: 1n, movedOn: '2026-10-28', docKind: 'transfer', docId: 't-1', doc: 'TR-2026-0003', qty: 5_000_000n, running: 5_000_000n, lotId: 'l-1', reversesMoveId: null, reversed: true },
    { moveId: 'm-2', seq: 2n, movedOn: '2026-10-30', docKind: 'transfer', docId: 't-1', doc: 'TR-2026-0003', qty: -5_000_000n, running: 0n, lotId: 'l-1', reversesMoveId: 'm-1', reversed: false },
  ], baseUnit: 'kg' }));
  t.ok(moves.includes('عكس') && moves.includes('أُلغي') && moves.includes('<bdi dir="ltr">-5,000.000</bdi>'), 'الحركات برصيد جارٍ، والعكسية والمعكوسة بعلامتيهما');

  // ── التحويل والافتتاح ──
  t.eq(
    s.transferVoidSentence('TR-2026-0003', [{ qty: 1_000_000n, baseUnit: 'L', itemName: 'كاز أويل' }], 'المخزن العام'),
    'ألغِ التحويل TR-2026-0003 — ستعود 1,000 لتر من «كاز أويل» إلى «المخزن العام».',
    'تأكيد إلغاء التحويل يسمّي الرقم والكمية الراجعة والمخزن',
  );
  const preview = {
    version: 3, internalExport: true, toDivisionKind: 'feed_mill', problems: [], ready: true,
    lines: [{ lineId: 'x', lineNo: 1, itemId: 'i-1', itemName: 'كاز أويل', baseUnit: 'L', qty: 1_000_000n, qtyInUnit: 1_000_000n, unitLabel: 'L', available: 1_000_000n, expired: 0n, later: 0n, shortage: 0n, wholeBalance: true, problem: null, value: null, draws: [{ lotId: 'l', qty: 1_000_000n, receivedOn: '2026-09-30', expiryOn: null, source: 'رصيد افتتاح بتاريخ 30/09/2026', value: null }] }],
  };
  t.same([s.previewLines(preview)[0].draws[0].value, s.wholeLines(preview)], [null, [{ itemName: 'كاز أويل', qty: 1_000_000n, unit: 'L' }]], 'معاينة الأمين بلا قيمة، والسطر اللي يسحب الرصيد كلّه يطلب تأكيداً (E31)');
  const created = s.createdLots({ version: 2, problems: [], ready: false, total: null, lines: [{ lineId: 'a', lineNo: 1, itemId: 'i', itemName: 'أفراخ', baseUnit: 'pc', qty: 100_000n, expiryOn: null, bornAt: null, problem: { code: 'born_at_required', hint: 'اكتب وقت فقس «أفراخ».' }, value: 6_500_000n }] });
  t.same([created[0].problem, s.creationReady(created, new Set(['a']))], ['اكتب وقت فقس «أفراخ».', false], 'سطر افتتاح بمشكلة من الخادم ما يكتمل ولو انوافق عليه');
  const lotsView = s.renderToStaticMarkup(s.h(s.LotsPreview, { lots: created, approved: new Set(), onToggle: () => {} }));
  t.ok(lotsView.includes('role="alert"') && lotsView.includes('65,000.00') && !lotsView.includes('data-action="approve-lot"'), 'معاينة الدفعات: المشكلة تعلن نفسها والقيمة لدورها، وبلا موافقة على سطر مرفوض');
  t.eq(s.openingSentence('المخزن العام', 80_000_000n, '2026-09-30'), 'رصيد افتتاحي لـ«المخزن العام» بتاريخ 30/09/2026، بقيمة 800,000.00 دينار.', 'تأكيد الافتتاح يسمّي المخزن والتاريخ والقيمة');

  await reviewFixes(t, m, setup);
  await mutationGaps(t);
}

// بلوك الرصيد كلّه (E31) بصوت ورسالة وتأكيد بديلة تسجّل نداءاتها بـglobalThis.__whole (لـWholeBalance بس).
const WHOLE_STUBS = {
  sound: "export const sound = { warn: () => globalThis.__whole.push(['sound']) };",
  Toast: "export const toast = (spec) => globalThis.__whole.push(['toast', spec]);",
  ConfirmDialog: "export function ConfirmDialog(props) { globalThis.__whole.push(['confirm', props]); return null; }",
};
const wholeStubs = {
  name: 'whole-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/sound$|\/Toast$|\/ConfirmDialog$/ }, (args) =>
      args.importer.replace(/\\/g, '/').includes('components/ui/WholeBalance') ? { path: args.path.split('/').at(-1), namespace: 'whole-stub' } : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: 'whole-stub' }, (args) => ({ contents: WHOLE_STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

/** فجوات اختبار الطفرات لـWP4 بالشاشات: كل حالة تمسك طفرة كانت تعيش (القيم لدورها بس، والعدد الكلّي من الخادم، والمحاولة بمرجع ثابت…). */
async function mutationGaps(t) {
  const inv = await bundle(
    [
      "export * as stockRoutes from './src/pages/inventory/StockRoutes.tsx';",
      "export * as board from './src/pages/inventory/StockBoardPage.tsx';",
      "export * as card from './src/pages/inventory/ItemCardPage.tsx';",
      "export * as transfers from './src/pages/inventory/TransfersPage.tsx';",
      "export * as openings from './src/pages/inventory/OpeningsPage.tsx';",
      "export * as shared from './src/pages/inventory/stock-shared.tsx';",
      "export { LotsPreview, creationReady } from './src/components/ui/LotsPreview.tsx';",
      "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
      "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    ].join('\n'),
    [invStubs],
  );
  const at = (url) => inv.renderToStaticMarkup(inv.h(inv.MemoryRouter, { initialEntries: [url] }, inv.h(inv.Routes, null, inv.h(inv.Route, { path: '/inventory/*', element: inv.h(inv.stockRoutes.default) }))));
  const workspace = (over = {}) => ({
    userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
    divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true,
    invites: [], subscription: 'active', confirmedAt: 0, ...over,
  });
  const keeper = workspace({ role: 'storekeeper', scopes: [{ warehouseId: 'w-gen' }], canSeeCost: false, canSeeAccounts: false, canSeeSales: false });
  const store = (id, divisionId, kind, name, over = {}) => ({ id, version: 1, archived: false, divisionId, siteId: `s-${divisionId}`, name, kind, ...over });
  const org = {
    divisions: [
      { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
      { id: 'd-med', kind: 'medicine', goLiveOn: '2026-10-01', frozen: true },
    ],
    sites: [], packTypes: [], itemCategories: [], expenseCategories: [],
    warehouses: [store('w-gen', 'd-gen', 'general', 'المخزن العام'), store('w-med', 'd-med', 'medicine', 'مخزن الأدوية')],
  };

  // ── لوحة الأمين: ما تنادي قيماً ممنوعة عليه، ومنتقيها بنطاقه؛ ولوحة المدير تقرأ القيم ومجموعها (ضابط) ─────────────────────
  await withInventory({ session: { status: 'ready', workspace: keeper }, loads: { 'loadOrgSetup|': { data: org } } }, async (g) => {
    const html = at('/inventory');
    t.ok(g.loaded.includes('loadStockOnHand') && !g.loaded.includes('loadStockValues') && !g.loaded.includes('loadStockValueTotals'), `لوحة الأمين: الكميات بس، بلا نداء قيم يرفضه الخادم (${g.loaded.join('، ')})`);
    t.ok(html.includes('المخزن العام') && !html.includes('مخزن الأدوية'), 'لوحة الأمين: منتقي المخزن بمخازن نطاقه بس');
  });
  await withInventory({ session: { status: 'ready', workspace: workspace() }, loads: { 'loadOrgSetup|': { data: org } } }, async (g) => {
    at('/inventory');
    t.ok(['loadStockOnHand', 'loadStockValues', 'loadStockValueTotals'].every((name) => g.loaded.includes(name)), `ضابط: لوحة المدير تقرأ القيم ومجموعها (${g.loaded.join('، ')})`);
  });
  t.same(inv.shared.scopedStores(inv.shared.storesOf(org), keeper).map((s) => s.id), ['w-gen'], 'scopedStores: الأمين بنطاق المخزن العامّ بس');

  // ── «N من المجموع» بالعدد الكلّي من الخادم، مو بعدد الصفوف المحمّلة ─────────────────────────────────────────────
  const loaded = (data) => ({ data, error: null, retry: () => {} });
  const row = { itemId: 'i-1', name: 'كاز أويل', kind: 'fuel', baseUnit: 'L', tracksExpiry: false, minQty: null, archived: false, available: 1_000_000n, expired: 0n, nearExpiry: 0n, belowMin: false, chickAgeHours: null, oldChicks: 0n };
  const page = { warehouse: { id: 'w-gen', name: 'المخزن العام', kind: 'general', divisionId: 'd-gen', divisionKind: 'general', archived: false, hasBalance: false }, asOf: '2026-10-30T11:05:00Z', rows: [row], next: 'i-1', total: 250 };
  const body = inv.renderToStaticMarkup(inv.h(inv.MemoryRouter, null, inv.h(inv.board.BoardBody, { first: loaded(page), rows: page.rows, values: loaded(null), totals: loaded(null), costs: false, warehouseId: 'w-gen' })));
  t.ok(body.includes('1 من المجموع 250'), 'اللوحة: «1 من المجموع 250» من total الخادم');

  // ── عمر الفرخ مبرز بعد 48 ساعة بس ───────────────────────────────────────────────────────────────────────────
  const chickLot = (over) => ({ lotId: 'l-1', qtyLeft: 100_000n, receivedOn: '2026-10-28', rootReceivedOn: '2026-10-28', ageDays: 2, bornAt: '2026-10-28T09:00:00Z', ageHours: 50n, expiryOn: null, expired: false, nearExpiry: false, sourceKind: 'opening', sourceId: 'o-1', source: 'x', supplierLotNo: null, ...over });
  const chickHtml = inv.renderToStaticMarkup(inv.h(inv.card.LotsTable, { lots: [chickLot({}), chickLot({ lotId: 'l-2', ageHours: 10n })], values: null, baseUnit: 'pc' }));
  const ages = [...chickHtml.matchAll(/<span class="([^"]*)">(\d+ ساعة|\d+ ساعات)<\/span>/gu)].map((match) => [match[2], match[1].includes('font-semibold')]);
  t.same(ages, [['50 ساعة', true], ['10 ساعات', false]], 'عمر الفرخ: 50 ساعة مبرز و10 ساعات لا (E24)');

  // ── زرّ ترحيل التحويل: بلا نت معطّل، والنقص ومشاكل المستند تمنعه ───────────────────────────────────────────────
  const line = (over) => ({ lineId: 'x', lineNo: 1, itemId: 'i-1', itemName: 'كاز أويل', baseUnit: 'L', qty: 1_000_000n, qtyInUnit: 1_000_000n, unitLabel: 'L', available: 1_000_000n, expired: 0n, later: 0n, shortage: 0n, wholeBalance: false, problem: null, value: null, draws: [], ...over });
  const preview = (over) => ({ version: 3, internalExport: false, toDivisionKind: 'general', problems: [], ready: true, lines: [line({})], ...over });
  const x = new Set(['x']);
  t.same(
    [
      inv.transfers.transferPostReady(preview({}), x, true),
      inv.transfers.transferPostReady(preview({}), x, false),
      inv.transfers.transferPostReady(preview({ lines: [line({ shortage: 200_000n })] }), x, true),
      inv.transfers.previewLines(preview({ lines: [line({ shortage: 200_000n })] }))[0].shortage,
    ],
    [true, false, false, 200_000n],
    'ترحيل التحويل: جاهز بالشبكة بس، والنقص يبين بالمعاينة ويمنع الترحيل',
  );
  const openingPreview = (over) => ({ version: 3, problems: [], ready: true, total: 0n, lines: [{ lineId: 'a', lineNo: 1, itemId: 'i', itemName: 'لقاح', baseUnit: 'pc', qty: 1_000n, expiryOn: null, bornAt: null, problem: null, value: 100n }], ...over });
  t.same(
    [inv.openings.openingPostReady(openingPreview({}), new Set(['a']), true), inv.openings.openingPostReady(openingPreview({ problems: [{ code: 'date_too_old', hint: 'x' }] }), new Set(['a']), true), inv.creationReady([], new Set())],
    [true, false, false],
    'ترحيل الافتتاح: مشكلة بالمستند تمنعه، ومعاينة بلا سطور ما تكتمل',
  );
  const noValue = inv.renderToStaticMarkup(inv.h(inv.LotsPreview, { lots: [{ lineId: 'a', itemName: 'كاز', unit: 'L', qty: 1_000n, expiryOn: null, value: null, problem: null }], approved: new Set(), onToggle: () => {} }));
  const withValue = inv.renderToStaticMarkup(inv.h(inv.LotsPreview, { lots: [{ lineId: 'a', itemName: 'كاز', unit: 'L', qty: 1_000n, expiryOn: null, value: 100n, problem: null }], approved: new Set(), onToggle: () => {} }));
  t.ok(!noValue.includes('0.00') && withValue.includes('1.00'), 'معاينة الدفعات: بلا قيمة لدور بلا كلفة (مو 0.00)، وبقيمتها لدورها');

  // ── المحاولة بمرجع ثابت (FOUNDATION ٥١٩): «ما نعرف» تحتفظ بالمرجع، والرفض الأكيد والنجاح مرجع جديد، وref_reused «سُجّلت» ───────
  const refs = [];
  const attempt = (result) =>
    inv.shared.runWithRef('gap-slot', async (ref) => {
      refs.push(ref.clientRef);
      if (result instanceof Error) throw result;
      return result;
    });
  const kinds = [];
  for (const result of [new inv.UnknownOutcomeError(), 'ok', new inv.RejectedError('ref_reused', null), new inv.RejectedError('stale_draft', 'x'), 'ok']) kinds.push((await attempt(result)).kind);
  t.same(kinds, ['failed', 'done', 'recorded', 'failed', 'done'], 'runWithRef: ما نعرف فشل، والإعادة تنجح، وref_reused «سُجّلت من محاولة سابقة»');
  t.same([refs[1] === refs[0], refs[2] !== refs[1], refs[3] !== refs[2], refs[4] !== refs[3]], [true, true, true, true], 'المرجع يبقى بعد «ما نعرف» بس، ويتجدّد بعد النجاح والرفض');

  // ── المخازن: المؤرشف أخيراً، والمادّة المؤرشفة ما تنحفظ لمنتقي بلا نت، والطن لمادّة بالكيلو بس ─────────────────────────────
  const sorted = inv.shared.storesOf({ divisions: [{ id: 'd-gen', kind: 'general' }], warehouses: [store('w-a', 'd-gen', 'general', 'أقدم مخزن', { archived: true }), store('w-b', 'd-gen', 'general', 'مخزن جديد')] });
  t.same(sorted.map((s) => s.id), ['w-b', 'w-a'], 'منتقي المخزن: الفعّال أوّلاً والمؤرشف بعده (ولو اسمه أسبق)');
  const seen = (id, archived) => ({ id, version: 1, archived, name: `قديم ${id}`, nameNorm: `قديم ${id}`, categoryId: null, kind: 'fuel', baseUnit: 'L', density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 1000n, minQty: null, barcode: null, altCodes: [] });
  inv.shared.rememberItems([seen('gap-1', true), seen('gap-2', false)]);
  t.same(inv.shared.seenItemsMatching('قديم gap').map((r) => r.id), ['gap-2'], 'منتقي بلا نت: المادّة المؤرشفة ما تنعرض');
  const unitIds = (baseUnit) => inv.shared.unitOptions({ ...seen('gap-3', false), baseUnit }, []).map((u) => u.id);
  t.same([unitIds('kg'), unitIds('L')], [['base', 'code:t'], ['base']], 'وحدات الإدخال: الطن للكيلو بس');

  // ── الرصيد كلّه (E31): تأكيد يسمّي المادّة والكمية والمخزن، والصفر بصوت ورسالة، وبلا سطر ولا شي ───────────────────────
  const w = await bundle("export { WholeBalanceConfirm, announceZeroBalance } from './src/components/ui/WholeBalance.tsx';", [wholeStubs]);
  globalThis.__whole = [];
  try {
    w.announceZeroBalance([], 'المخزن العام');
    t.same(globalThis.__whole, [], 'بلا سطر يسحب الرصيد كلّه: لا صوت ولا رسالة');
    w.announceZeroBalance([{ itemName: 'كاز أويل', qty: 1_000_000n, unit: 'L' }], 'المخزن العام');
    t.same(
      globalThis.__whole.map(([kind, spec]) => (kind === 'toast' ? [kind, spec.title.includes('المخزن العام'), spec.detail] : [kind])),
      [['sound'], ['toast', true, 'كاز أويل']],
      'الرصيد الصفر ينعلن بصوت وبرسالة تسمّي المخزن والمادّة',
    );
    globalThis.__whole.length = 0;
    w.renderToStaticMarkup(w.h(w.WholeBalanceConfirm, { open: true, lines: [{ itemName: 'كاز أويل', qty: 1_000_000n, unit: 'L' }], warehouse: 'المخزن العام', busy: false, onConfirm: () => {}, onCancel: () => {} }));
    const confirm = globalThis.__whole.find(([kind]) => kind === 'confirm')?.[1];
    const text = confirm ? w.renderToStaticMarkup(confirm.consequence) : '';
    t.ok(text.includes('«كاز أويل»: 1,000 لتر') && text.includes('المخزن العام') && confirm?.action === 'confirm-whole-balance', `تأكيد سحب الرصيد كلّه يسمّي المادّة والكمية والمخزن (${text})`);
  } finally {
    delete globalThis.__whole;
  }
}

/** إصلاحات المراجعة العدائية لـWP4 بالشاشات (كل حالة ترمي لحالها حتى ما تخبّي اللي بعدها). */
async function reviewFixes(t, m, setup) {
  const inv = await bundle(
    [
      "export * as stockRoutes from './src/pages/inventory/StockRoutes.tsx';",
      "export * as board from './src/pages/inventory/StockBoardPage.tsx';",
      "export * as card from './src/pages/inventory/ItemCardPage.tsx';",
      "export * as transfers from './src/pages/inventory/TransfersPage.tsx';",
      "export * as openings from './src/pages/inventory/OpeningsPage.tsx';",
      "export * as shared from './src/pages/inventory/stock-shared.tsx';",
      "export { default as MillPage } from './src/pages/mill/MillPage.tsx';",
      "export { default as HatcheryPage } from './src/pages/hatchery/HatcheryPage.tsx';",
      "export { NetworkError, RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
      "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    ].join('\n'),
    [invStubs],
  );
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
    }
  };
  const at = (url) => inv.renderToStaticMarkup(inv.h(inv.MemoryRouter, { initialEntries: [url] }, inv.h(inv.Routes, null, inv.h(inv.Route, { path: '/inventory/*', element: inv.h(inv.stockRoutes.default) }))));
  const workspace = (over = {}) => ({
    userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [],
    divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true,
    invites: [], subscription: 'active', confirmedAt: 0, ...over,
  });
  const ready = (over) => ({ status: 'ready', workspace: workspace(over) });
  const store = (id, divisionId, kind, name, over = {}) => ({ id, version: 1, archived: false, divisionId, siteId: `s-${divisionId}`, name, kind, ...over });
  const org = {
    divisions: [
      { id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true },
      { id: 'd-br', kind: 'broiler', goLiveOn: '2026-10-01', frozen: true },
      { id: 'd-hat', kind: 'hatchery', goLiveOn: '2026-10-01', frozen: true },
      { id: 'd-med', kind: 'medicine', goLiveOn: '2026-10-01', frozen: true },
      { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
    ],
    sites: [], packTypes: [], itemCategories: [], expenseCategories: [],
    warehouses: [
      store('w-raw', 'd-mill', 'raw', 'مخزن المواد الأوّلية'),
      store('w-feed', 'd-mill', 'feed', 'مخزن العلف'),
      store('w-chick', 'd-hat', 'chick', 'مخزن الأفراخ'),
      store('w-med', 'd-med', 'medicine', 'مخزن الأدوية'),
      store('w-gen', 'd-gen', 'general', 'المخزن العام'),
      store('w-farm', 'd-br', 'farm', 'مخزن الحقل'),
      store('w-old', 'd-gen', 'general', 'مخزن قديم', { archived: true, hasBalance: true }),
    ],
  };
  const row = (itemId, name, available) => ({ itemId, name, kind: 'medicine', baseUnit: 'pc', tracksExpiry: false, minQty: null, archived: false, available, expired: 0n, nearExpiry: 0n, belowMin: false, chickAgeHours: null, oldChicks: 0n });
  const boardOf = (rows, next, total) => ({ warehouse: { id: 'w-med', name: 'مخزن الأدوية', kind: 'medicine', divisionId: 'd-med', divisionKind: 'medicine', archived: false, hasBalance: false }, asOf: '2026-10-30T11:05:00Z', rows, next, total });

  // ── لوحة المخزون: «المزيد» يجيب قيم الصفحة الجاية بمؤشّرها، والقيمة الناقصة لمادّة بيها رصيد «—» مو 0.00 ─────────────────────
  await step('قيم صفحة اللوحة الجاية', () =>
    withInventory(
      {
        session: ready(),
        loads: {
          'loadOrgSetup|': { data: org },
          'loadStockOnHand|w-med': { data: boardOf([row('i-1', 'لقاح أ', 5_000n), row('i-2', 'لقاح ب', 7_000n)], 'i-2', 150) },
          'loadStockValues|w-med:true': { data: new Map([['i-1', { available: 500_000n, expired: 0n }]]) },
          'loadStockValueTotals|w-med:true': { data: { units: [], available: 500_000n, expired: 0n, total: 500_000n } },
        },
      },
      async (g) => {
        const html = at('/inventory/medicine');
        const cells = [...html.matchAll(/<tr[^>]*>.*?<\/tr>/gu)].map((match) => match[0]).filter((tr) => tr.includes('لقاح ب'));
        t.ok(cells.length === 1 && cells[0].includes('—') && !cells[0].includes('0.00'), 'لوحة المدير: مادّة بيها رصيد وقيمتها ما انقرت بعد «—» مو 0.00');
        const more = g.buttons.find((props) => props['data-action'] === 'more-stock');
        t.ok(Boolean(more), 'زرّ «المزيد» باللوحة');
        more?.onClick?.();
        t.same(g.calls.filter(([name]) => name === 'loadStockOnHand' || name === 'loadStockValues'), [['loadStockOnHand', ['w-med', 'i-2']], ['loadStockValues', ['w-med', 'i-2']]], '«المزيد» يقرأ كميات الصفحة الجاية وقيمها بنفس المؤشّر (قيم كل صفحة، مو أوّلها بس)');
      },
    ),
  );
  await step('قيم اللوحة بلا رصيد', () => {
    const values = new Map([['i-1', { available: 500_000n, expired: 0n }]]);
    const html = inv.renderToStaticMarkup(inv.h(inv.MemoryRouter, null, inv.h(inv.board.BoardTables, { board: boardOf([row('i-1', 'لقاح أ', 5_000n), row('i-3', 'لقاح بلا رصيد', 0n)], null, 2), values, warehouseId: 'w-med' })));
    const zero = [...html.matchAll(/<tr[^>]*>.*?<\/tr>/gu)].map((match) => match[0]).find((tr) => tr.includes('لقاح بلا رصيد')) ?? '';
    t.ok(zero.includes('<bdi dir="ltr">0.00</bdi>'), 'مادّة بلا رصيد (تحت الحدّ الأدنى بس) قيمتها 0.00 فعلاً');
  });

  // ── بطاقة المادّة: الدفعات والحركات بصفحات («المزيد» بمؤشّر كل قائمة) و«N من المجموع»، والمستند رابط لمستنده ──────────────
  const lotRow = { lotId: 'l-1', qtyLeft: 5_000n, receivedOn: '2026-10-15', rootReceivedOn: '2026-10-15', ageDays: 15, bornAt: null, ageHours: null, expiryOn: null, expired: false, nearExpiry: false, sourceKind: 'transfer', sourceId: 't-1', source: 'TR-2026-0001', supplierLotNo: null };
  const moveRow = (over) => ({ moveId: 'mv-1', seq: 7n, movedOn: '2026-10-28', docKind: 'transfer', docId: 't-1', doc: 'TR-2026-0001', qty: 5_000n, running: 5_000n, lotId: 'l-1', reversesMoveId: null, reversed: false, ...over });
  await step('صفحات بطاقة المادّة', () =>
    withInventory(
      {
        session: ready(),
        loads: {
          'loadOrgSetup|': { data: org },
          'loadItemLots|i-1:w-med': { data: { item: { id: 'i-1', name: 'لقاح أ', kind: 'vaccine', baseUnit: 'pc', tracksExpiry: false, minQty: null, density: null, pieceMassKg: null, archived: false }, rows: [lotRow], next: 'l-1', total: 150 } },
          'loadItemMoves|i-1:w-med': { data: { rows: [moveRow({})], next: 7n, total: 250 } },
          'loadItemLotValues|i-1:w-med:true': { data: new Map([['l-1', { qtyLeft: 5_000n, valueLeft: 100_00n }]]) },
          'listItemUnits|i-1': { data: [] },
        },
      },
      async (g) => {
        const html = at('/inventory/items/i-1?wh=w-med');
        t.ok(html.includes('1 من المجموع 150') && html.includes('1 من المجموع 250'), 'البطاقة تقول «N من المجموع» للدفعات وللحركات');
        const lots = g.buttons.find((props) => props['data-action'] === 'more-lots');
        const moves = g.buttons.find((props) => props['data-action'] === 'more-moves');
        t.ok(Boolean(lots && moves), 'زرّا «المزيد» للدفعات وللحركات');
        lots?.onClick?.();
        moves?.onClick?.();
        t.same(
          g.calls.filter(([name]) => ['loadItemLots', 'loadItemLotValues', 'loadItemMoves'].includes(name)),
          [['loadItemLots', ['i-1', 'w-med', 'l-1']], ['loadItemLotValues', ['i-1', 'w-med', 'l-1']], ['loadItemMoves', ['i-1', 'w-med', 7n]]],
          'الدفعات الجاية وقيمها بمؤشّر الدفعة نفسه، والحركات الجاية بعد آخر رقم (keyset)',
        );
      },
    ),
  );
  await step('رابط مستند الحركة', () => {
    const html = inv.renderToStaticMarkup(inv.h(inv.MemoryRouter, null, inv.h(inv.card.MovesTable, { moves: [moveRow({}), moveRow({ moveId: 'mv-2', seq: 8n, docKind: 'opening', docId: 'o-1', doc: 'رصيد افتتاح بتاريخ 20/10/2026', reversesMoveId: 'mv-1', qty: -5_000n, running: 0n })], baseUnit: 'pc' })));
    t.ok(html.includes('href="/inventory/transfers/t-1"') && html.includes('href="/inventory/openings/o-1"'), 'المستند بالحركة (والعكسية) رابط لمستنده: التحويل والافتتاح');
  });

  // ── مخازن المعمل والمفقس من صفحتي وحدتيهما (الخطّة WP4: «mill and hatchery stores from their division pages») ─────────
  await step('مخازن المعمل والمفقس', () =>
    withInventory({ session: ready({ role: 'mill_operator', scopes: [{ divisionId: 'd-mill' }], canSeeCost: false, canSeeAccounts: false, canSeeSales: false }), loads: { 'loadOrgSetup|': { data: org } } }, async () => {
      const mill = at('/inventory/mill');
      t.ok(mill.includes('مخازن معمل العلف') && mill.includes('مخزن المواد الأوّلية') && mill.includes('مخزن العلف') && !mill.includes('مخزن الأدوية'), 'مشغّل المعمل: /inventory/mill لوحة مخازن معمله بس');
      const hatchery = at('/inventory/hatchery');
      t.ok(hatchery.includes('مخازن المفقس'), '/inventory/hatchery لوحة مخازن المفقس');
      const pages = inv.renderToStaticMarkup(inv.h(inv.MemoryRouter, null, inv.h(inv.MillPage), inv.h(inv.HatcheryPage)));
      t.ok(pages.includes('href="/inventory/mill"') && pages.includes('href="/inventory/hatchery"'), 'صفحتا المعمل والمفقس تفتحان مخازنهما (والبطاقة بالرئيسية توصل)');
    }),
  );

  // ── الافتتاح بلا نت، وقائمة المخازن الفاشلة ───────────────────────────────────────────────────────────────────
  const openingDoc = { doc: { id: 'o-1', kind: 'opening', status: 'draft', version: 3, docNo: null, warehouseId: 'w-med', toWarehouseId: null, onDate: '2026-10-20', note: null, posted: false, voidReason: null }, openingLines: [], transferLines: [] };
  await step('الافتتاح بلا نت', () =>
    withInventory({ session: ready(), online: false, loads: { 'loadStockDoc|o-1#0': { data: openingDoc }, 'loadOrgSetup|': { data: org } } }, async (g) => {
      const html = at('/inventory/openings/o-1');
      const preview = g.buttons.find((props) => props['data-action'] === 'preview-opening');
      t.ok(preview?.disabled === true && html.includes('الترحيل يحتاج اتصالاً بالخادم'), 'بلا نت: معاينة الافتتاح معطّلة والسبب ظاهر');
      const readyPreview = { version: 3, problems: [], ready: true, total: 0n, lines: [{ lineId: 'a', lineNo: 1, itemId: 'i', itemName: 'لقاح', baseUnit: 'pc', qty: 1_000n, expiryOn: null, bornAt: null, problem: null, value: 100n }] };
      t.same([inv.openings.openingPostReady?.(readyPreview, new Set(['a']), true), inv.openings.openingPostReady?.(readyPreview, new Set(['a']), false)], [true, false], 'زرّ ترحيل الافتتاح معطّل بلا نت حتى بعد معاينة جاهزة');
    }),
  );
  await step('قائمة المخازن الفاشلة', () =>
    withInventory({ session: ready(), loads: { 'loadStockDoc|o-1#0': { data: openingDoc }, 'loadOrgSetup|': { error: new inv.NetworkError() }, 'listStockDocs|': { data: { rows: [], next: null, total: 0 } } } }, async () => {
      const failed = (html) => html.includes('تعذّر تحميل قائمة المخازن') && !html.includes('جارٍ الفتح');
      t.ok(failed(at('/inventory/openings/o-1')), 'محرّر الافتتاح: قائمة المخازن الفاشلة LoadFailed بزرّ إعادة، مو «جارٍ الفتح…» للأبد');
      t.ok(failed(at('/inventory/openings')), 'قائمة الافتتاح: قائمة المخازن الفاشلة LoadFailed، مو نموذج مختفٍ بصمت');
      t.ok(failed(at('/inventory/transfers')), 'قائمة التحويلات: قائمة المخازن الفاشلة LoadFailed');
    }),
  );

  // ── طيّ مسوّدة التحويل بتأكيد يسمّيها ونتيجتها، مو بضغطة وحدة ───────────────────────────────────────────────────
  const transferDoc = { doc: { id: 't-9', kind: 'transfer', status: 'draft', version: 4, docNo: null, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-30', note: null, posted: false, voidReason: null }, openingLines: [], transferLines: [] };
  await step('طيّ مسوّدة التحويل', () =>
    withInventory({ session: ready({ role: 'storekeeper', scopes: [{ warehouseId: 'w-gen' }], canSeeCost: false }), loads: { 'loadStockDoc|t-9#0': { data: transferDoc }, 'loadOrgSetup|': { data: org } } }, async (g) => {
      at('/inventory/transfers/t-9');
      g.buttons.find((props) => props['data-action'] === 'discard-transfer')?.onClick?.();
      t.same(g.calls.filter(([name]) => name === 'discardDraft'), [], 'زرّ «اطوِ المسوّدة» ما يطوي بضغطة وحدة');
      const dialog = g.confirms.find((props) => props.action === 'confirm-discard-transfer');
      t.ok(Boolean(dialog) && dialog.consequence.includes('المخزن العام') && dialog.consequence.includes('مخزن الحقل') && dialog.consequence.includes('30/10/2026') && dialog.consequence.includes('ولا ترجع'), `تأكيد الطيّ يسمّي التحويل (من وإلى والتاريخ) وإنه ما يرجع (${dialog?.consequence})`);
      dialog?.onConfirm?.();
      t.same(g.calls.filter(([name]) => name === 'discardDraft'), [['discardDraft', ['transfer', 't-9', 4]]], 'الطيّ بعد التأكيد بنسخة المسوّدة');
    }),
  );

  // ── وجهة التحويل بالأهلية: مخزن ما يقبل ولا مادّة من المرسِل ما ينعرض ─────────────────────────────────────────────
  await step('وجهة التحويل', () => {
    const refs = inv.shared.storesOf(org);
    const names = (from) => inv.transfers.transferTargets(refs, refs.find((s) => s.id === from)).map((s) => s.id).sort();
    t.same(names('w-med'), ['w-farm'], 'من مخزن الأدوية: الحقل بس (المواد الأوّلية والعامّ والأفراخ ما يقبلون دواءً ولا لقاحاً)');
    t.same(names('w-raw'), ['w-farm', 'w-gen'], 'من المواد الأوّلية: العامّ والحقل (وقود وتعبئة)، مو العلف ولا الأدوية، والمؤرشف ما ينعرض');
  });

  // ── رفّ مسوّدات الجهاز بالسطور (FOUNDATION ١٤٢، ١٩٩): الرأس ثم السطور بمعرّفات الجهاز، والفشل بنصّ الطريق يحفظ المرفوع ويكمل منه
  // بلا تكرار (جواب ضاع ← 23505 = انكتب)، ورأس صار غير مسوّدة ← الباقي لرأس جديد، وسطر مرفوض ينعلّم بتلميحه (مراجعة WP4 الثانية).
  await step('رفّ مسوّدات الجهاز', async () => {
    const line = (n) => ({ id: `l-${n}`, itemId: `i-${n}`, itemName: `مادّة ${n}`, baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'L', qtyInUnit: `${n}.000` });
    const draft = { id: 'dd-1', userId: 'u-1', orgId: 'org-1', kind: 'transfer', title: 'تحويل', savedAt: 1, payload: { from: 'w-gen', to: 'w-farm', day: '2026-10-30', note: 'كاز', headerId: 'h-1', docId: null, lines: [line(1), line(2), line(3)] } };
    const log = [];
    const server = { heads: new Set(), lines: new Set() };
    let failOn = { 'i-2': () => new inv.NetworkError() };
    let fresh = 0;
    const deps = {
      confirm: async () => ({ userId: 'u-1', orgId: 'org-1' }),
      createTransferDraft: async (from, to, day, note, id) => {
        log.push(['create', id, from, to, day, note]);
        if (server.heads.has(id)) throw new inv.RejectedError('23505', null);
        server.heads.add(id);
        return { id };
      },
      addTransferLine: async (docId, fields, id) => {
        const fail = failOn[fields.item_id];
        if (fail) throw fail();
        log.push(['line', docId, id, fields.item_id, fields.qty_in_unit]);
        if (server.lines.has(id)) throw new inv.RejectedError('23505', null);
        server.lines.add(id);
      },
      saveDeviceDraft: async (stamp, next) => (log.push(['save', next.payload.docId, next.payload.lines.map((l) => l.id)]), next),
      removeDeviceDraft: async (id) => log.push(['remove', id]),
      newId: () => `n-${(fresh += 1)}`,
      linesOn: async () => new Set(),
      // معرّف النقل لرأس جديد مشتقّ من بذرته (نفس البذرة نفس المعرّف بكل محاولة ونافذة).
      deriveId: async (seed) => `d:${seed}`,
    };
    const upload = (d, extra = {}) => inv.transfers.uploadShelfDraft(d, { ...deps, ...extra }).then((result) => `ok:${result.docId}`, (error) => error.message);
    const first = await upload(draft);
    t.same(
      [first, log],
      ['network', [['create', 'h-1', 'w-gen', 'w-farm', '2026-10-30', 'كاز'], ['save', 'h-1', ['l-1', 'l-2', 'l-3']], ['line', 'h-1', 'l-1', 'i-1', '1.000'], ['save', 'h-1', ['l-2', 'l-3']]]],
      'الرفع: الرأس بمعرّف الجهاز ثم السطور بمعرّفاتها، وفشل السطر الثاني يحفظ الرأس المرفوع والسطور الباقية',
    );
    // جواب السطر الأوّل ضاع وهو انكتب: الإعادة من البداية ترجع 23505 للرأس وللسطر، فما يتكرّر شي.
    log.length = 0;
    failOn = {};
    const again = await upload({ ...draft });
    t.same(
      [again, [...server.heads], [...server.lines].sort(), log.filter(([kind]) => kind === 'remove')],
      ['ok:h-1', ['h-1'], ['l-1', 'l-2', 'l-3'], [['remove', 'dd-1']]],
      'إعادة الرفع بعد جواب ضاع بنفس المعرّفات: رأس واحد وثلاثة سطور بلا تكرار، وتنشال من الجهاز',
    );
    // مسوّدة بلا معرّفات (قبل هالإصلاح): تاخذها وتنحفظ قبل أوّل طلب.
    log.length = 0;
    const bare = { ...draft, id: 'dd-2', payload: { ...draft.payload, headerId: undefined, lines: [{ ...line(4), id: undefined }] } };
    await upload(bare);
    t.same(log.slice(0, 2), [['save', null, ['n-2']], ['create', 'n-1', 'w-gen', 'w-farm', '2026-10-30', 'كاز']], 'مسوّدة بلا معرّفات: تاخذ معرّفاً للرأس والسطر وتنحفظ قبل أوّل طلب');
    // الرأس المرفوع صار مرحَّلاً أو مطوياً (not_draft): الباقي لرأس جديد بمعرّفات جديدة.
    log.length = 0;
    let gone = true;
    const posted = { ...draft, id: 'dd-3', payload: { ...draft.payload, headerId: 'h-9', docId: 'h-9', lines: [line(5), line(6)] } };
    const moved = await upload(posted, {
      addTransferLine: async (docId, fields, id) => {
        if (docId === 'h-9' && gone) throw new inv.RejectedError('not_draft', 'المستند مرحَّل أو ملغى؛ لا تُعدَّل سطوره.');
        log.push(['line', docId, id, fields.item_id]);
      },
    });
    gone = false;
    t.same(
      [moved, log.filter(([kind]) => kind !== 'save')],
      ['ok:d:rehome:h-9', [['create', 'd:rehome:h-9', 'w-gen', 'w-farm', '2026-10-30', 'كاز'], ['line', 'd:rehome:h-9', 'd:rehome:h-9:l-5', 'i-5'], ['line', 'd:rehome:h-9', 'd:rehome:h-9:l-6', 'i-6'], ['remove', 'dd-3']]],
      'رأس صار غير مسوّدة بنصّ الرفع: السطور الباقية لرأس جديد بمعرّفات مشتقّة من الرأس السابق والسطر، وتنشال من الجهاز',
    );
    // الرأس صار غير مسوّدة وقراءة سطوره فشلت (شبكة): الرفع يوكف بلا ما يتنقل شي، لأن «ما أعرف شنو وصل» مو «ماكو شي وصل».
    log.length = 0;
    const unread = { ...draft, id: 'dd-5', payload: { ...draft.payload, headerId: 'h-8', docId: 'h-8', lines: [line(9)] } };
    let saved = null;
    const stuck = await upload(unread, {
      addTransferLine: async () => {
        throw new inv.RejectedError('not_draft', 'المستند مرحَّل أو ملغى؛ لا تُعدَّل سطوره.');
      },
      linesOn: async () => {
        throw new inv.NetworkError();
      },
      saveDeviceDraft: async (stamp, next) => ((saved = next), next),
    });
    t.same([stuck, log.filter(([kind]) => kind === 'create'), saved], ['network', [], null], 'قراءة الرأس السابق فشلت: الرفع يرمي، وما ينخلق رأس ولا يتغيّر شي على الجهاز');
    // سطر رفضه الخادم رفضاً أكيداً: ينعلّم بتلميحه على الجهاز ويوقف الرفع عنده، والسطور بعده باقية.
    log.length = 0;
    const kept = [];
    const refused = await upload({ ...draft, id: 'dd-4', payload: { ...draft.payload, headerId: 'h-7', docId: 'h-7', lines: [line(7), line(8)] } }, {
      addTransferLine: async (docId, fields) => {
        if (fields.item_id === 'i-7') throw new inv.RejectedError('pieces_not_whole', '«مصابيح» تُعدّ بالقطعة، والكمية عدد صحيح.');
      },
      saveDeviceDraft: async (stamp, next) => (kept.push(next.payload.lines.map((l) => [l.id, l.rejected?.code ?? null])), next),
    });
    t.same([refused, kept.at(-1)], ['shelf_line_rejected', [['l-7', 'pieces_not_whole'], ['l-8', null]]], 'سطر مرفوض: ينعلّم برمزه على الجهاز، والسطر بعده باقٍ، والرفع يوكف عنده');
    const message = inv.transfers.shelfFailure(new inv.transfers.ShelfLineRejectedError(line(7), '«مصابيح» تُعدّ بالقطعة، والكمية عدد صحيح.'));
    t.ok(message.title.includes('مادّة 7') && message.detail.includes('عدد صحيح') && !message.detail.includes('لم يُحفظ شيء'), 'رسالة السطر المرفوض تسمّيه وتلميحه، وما تكول «لم يُحفظ شيء» بعد رفع جزئي');
    t.ok(!inv.transfers.shelfFailure(new inv.UnknownOutcomeError()).detail.includes('لم يُحفظ شيء'), 'انقطاع بنصّ الرفع: الرسالة تكول إن المرفوع باقٍ والإعادة بلا تكرار');
    log.length = 0;
    const foreign = await upload(draft, { confirm: async () => ({ userId: 'u-1', orgId: 'org-2' }) });
    t.same([foreign, log], ['draft_org_mismatch', []], 'الخادم أكّد منشأة ثانية: ولا رأس ولا سطر (GT-29)');
  });

  // ── سطر الجهاز بنفس قاعدة الحقل (مراجعة WP4 الثانية): 1.5 قطعة ينرفض قبل ما ينحفظ، مو بكل رفع ─────────────────────────
  await step('سطر الجهاز', () => {
    const pcs = { ...item({ id: 'i-pc', name: 'مصابيح', kind: 'equipment', baseUnit: 'pc' }) };
    const units = inv.shared.unitOptions(pcs, []);
    const half = inv.transfers.deviceLine(pcs, { text: '1.5', unitId: 'base' }, units, 'l-x');
    const whole = inv.transfers.deviceLine(pcs, { text: '2', unitId: 'base' }, units, 'l-y');
    t.same([half.problem?.includes('صحيح'), whole.id, whole.qtyInUnit], [true, 'l-y', '2.000'], 'سطر جهاز: 1.5 قطعة يرفض بجملة الحقل، و2 قطعة سطر بمعرّفه وكميته');
  });

  // ── الرصيد كلّه لمادّة بسطرين (E31): التأكيد بمجموع سطورها، مو بآخر سطر (مراجعة WP4 الثانية) ────────────────────────
  await step('الرصيد كلّه بسطرين', () => {
    const previewLine = (over) => ({ lineId: 'x', lineNo: 1, itemId: 'i-1', itemName: 'كاز أويل', baseUnit: 'L', qty: 0n, qtyInUnit: 0n, unitLabel: 'L', available: 0n, expired: 0n, later: 0n, shortage: 0n, wholeBalance: false, problem: null, draws: [], value: null, ...over });
    const preview = { version: 1, plan: 'p', internalExport: false, toDivisionKind: 'general', problems: [], ready: true, lines: [previewLine({ lineId: 'a', qty: 600_000n }), previewLine({ lineId: 'b', lineNo: 2, qty: 400_000n, wholeBalance: true })] };
    t.same(inv.transfers.wholeLines(preview), [{ itemName: 'كاز أويل', qty: 1_000_000n, unit: 'L' }], 'سطران 600 و400 لتر من 1,000: التأكيد يسمّي 1,000 لتر');
  });

  // ── جملة إلغاء الافتتاح تسمّي اللي يطلع من المخزن (FOUNDATION ٧٦٦، مراجعة WP4 الثانية) ─────────────────────────────────
  await step('جملة إلغاء الافتتاح', () => {
    const sentence = inv.openings.openingVoidSentence('المخزن العام', [{ qty: 1_000_000n, baseUnit: 'L', itemName: 'كاز أويل' }, { qty: 5_000n, baseUnit: 'pc', itemName: 'لقاح' }]);
    t.ok(sentence.includes('المخزن العام') && sentence.includes('«كاز أويل»') && sentence.includes('1,000') && sentence.includes('«لقاح»'), `إلغاء الافتتاح يسمّي المخزن وكل مادّة بكميتها (${sentence})`);
  });

  // ── «مؤرشف وعليه رصيد» بقائمة المخازن (§2.6): منتقي المخزن وجدول إعدادات المنشأة ─────────────────────────────────────
  await step('مؤرشف وعليه رصيد', () => {
    t.ok(inv.shared.storeLabel({ name: 'مخزن قديم', kind: 'general', divisionKind: 'general', archived: true, hasBalance: true }).includes('مؤرشف وعليه رصيد'), 'منتقي المخزن: المؤرشف وعليه رصيد بعلامته');
    t.ok(!inv.shared.storeLabel({ name: 'مخزن قديم', kind: 'general', divisionKind: 'general', archived: true, hasBalance: false }).includes('عليه رصيد'), 'ضابط: المؤرشف بلا رصيد «مؤرشف» بس');
    const flagged = { ...setup, warehouses: setup.warehouses.map((w) => (w.id === 'w-gen' ? { ...w, hasBalance: true } : w)) };
    const page = m.renderToStaticMarkup(m.h(m.SetupTables, { setup: flagged, permissions: { stores: true, expenses: true, goLive: true }, onOpen: () => {} }));
    t.ok(page.includes('مؤرشف وعليه رصيد') && page.includes('data-action="restore"'), 'إعدادات المنشأة: المخزن المؤرشف وعليه رصيد بعلامته جنب «أعِد»');
  });
}
