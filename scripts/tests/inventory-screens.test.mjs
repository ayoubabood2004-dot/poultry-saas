// شاشات المرحلة 1 WP2 مرسومة نصّاً من المصدر الحقيقي: جدول المواد (الرموز LTR، الحدّ الأدنى بمراتب العمود الثابتة،
// الإجراءات أوّل عمود)، ونموذج المادّة (حقول وحدة الأساس، والقراءة لنصوص عشرية بقيود القاعدة نفسها، والحقول المتغيّرة
// بس، والتوائم)، وفلتر البحث بالاسم والرمز، و«إعدادات المنشأة» (يوم التشغيل والثابت، والمواقع ثم مخازنها، والنظامية
// للقراءة)، ومنتقي النطاق بالوحدة والموقع والمخزن بشاشة الموظفين.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function bundle(contents) {
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
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
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
}
