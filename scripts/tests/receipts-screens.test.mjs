// شاشات الاستلام (الخطّة WP6، FOUNDATION ٧٦٨، DECISIONS ١٥–١٦) مرسومة نصّاً من المصدر الحقيقي: سطور الأمين بلا أي رقم مال (مبلغ السطر
// وقيمة الدفعة لأدوار الكلفة بس)، والدفتر من نوع المخزن للعرض، وجملة الإلغاء تسمّي رقم PU وعدد المواد بصيغة العدد، والتحويل الحيّ بحقل
// الكمية بصيغ الكيس الفصيحة («47 كيساً = 2,350 كغم»، «كيس واحد»، «كيسان»، «3 أكياس»)، والمعاينة المخفية مالها للأمين تنقرا بلا money.
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

const textOf = (html) => html.replace(/<[^>]+>/g, '');

export default async function (t) {
  const m = await bundle(
    [
      "export { ReceiptLinesTable, ReceiptPreviewPanel, receiptBook, receiptVoidSentence, purchaseUnitOptions, receivableKinds, liveValuation, settleAmountEdits, rebaseEdits } from './src/pages/inventory/ReceiptsPage.tsx';",
      "export { QtyInput } from './src/components/ui/QtyInput.tsx';",
      "export { parseReceiptPreview } from './src/lib/repo/purchasing.ts';",
    ].join('\n'),
  );
  const line = (id, name, qty, extra = {}) => ({
    id, lineNo: 1, itemId: `i-${id}`, itemName: name, itemKind: 'raw', baseUnit: 'kg', tracksExpiry: false, itemUnitId: null, unitCode: null, unitLabel: 'kg',
    qtyInUnit: qty, qty, expiryOn: null, bornAt: null, supplierLotNo: null, density: null, pieceMass: null, ...extra,
  });
  const lines = [line('a', 'ذرة صفراء', 5_000_000n), line('b', 'كسبة صويا', 1_000_000n, { supplierLotNo: 'LOT-7' })];

  // ── الأمين: بلا عمود مال ولا رقم مال بالجدول؛ وأدوار الكلفة: مبلغ السطر وقيمة الدفعة ─────────────────────────────────────
  const keeper = m.renderToStaticMarkup(m.h(m.ReceiptLinesTable, { lines, values: null, totals: null, onDelete: null }));
  t.ok(!keeper.includes('مبلغ السطر') && !keeper.includes('قيمة الدفعة') && !/2,350,000|2,404,166/u.test(keeper), 'جدول الأمين بلا أي خانة مال');
  t.ok(textOf(keeper).includes('5,000') && keeper.includes('<bdi dir="ltr">LOT-7</bdi>'), 'الكميات بفواصل الآلاف، ورقم دفعة المورّد معزول LTR');
  const bundleOf = { doc: { id: 'd' }, lines, lineAmounts: [{ id: 'x', lineId: 'a', lineTotal: 235_000_000n, zeroReason: null }, { id: 'y', lineId: 'b', lineTotal: 90_000_000n, zeroReason: null }], amounts: null, charges: [{ id: 'c', chargeNo: 1, label: 'نقل', amount: 6_500_000n, allocateBy: 'mass', payeePartyId: 'p', cashAccountId: null, allLines: true, lineIds: [] }] };
  const live = m.liveValuation(bundleOf);
  const priced = m.renderToStaticMarkup(m.h(m.ReceiptLinesTable, { lines, values: live.values, totals: new Map([['a', 235_000_000n], ['b', 90_000_000n]]), onDelete: null }));
  t.ok(textOf(priced).includes('2,350,000') && textOf(priced).includes('2,404,166.67') && textOf(priced).includes('910,833.33'), 'أدوار الكلفة: مبلغ السطر وقيمة الدفعة (C2 2,404,166.67 وS2 910,833.33) من التقسيم الحيّ');

  // ── الدفتر للعرض من نوع المخزن (القاعدة 36)، والمخازن اللي تستلم ──────────────────────────────────────────────────────
  t.same(
    [m.receiptBook({ kind: 'raw', divisionKind: 'feed_mill' }) !== m.receiptBook({ kind: 'chick', divisionKind: 'hatchery' }), m.receiptBook({ kind: 'chick', divisionKind: 'hatchery' }), m.receiptBook({ kind: 'hatching_egg', divisionKind: 'hatchery' })],
    [true, 'المفقس: الأفراخ', 'المفقس: بيض التفقيس'],
    'الدفتر من نوع المخزن: المفقس بدفتريه',
  );
  t.same([m.receivableKinds('farm'), m.receivableKinds('table_egg'), m.receivableKinds('general').includes('fuel'), m.receivableKinds('raw').includes('fuel')], [[], [], true, false], 'الحقل وبيض المائدة ما يستلمان، والوقود للعامّ بس');

  // ── جملة الإلغاء: رقم PU وعدد المواد بصيغته ────────────────────────────────────────────────────────────────────
  t.eq(m.receiptVoidSentence('PU-2026-0042', 7), 'ألغِ الاستلام PU-2026-0042 — ستُعاد 7 مواد من المخزن، ويبقى المدفوع للمورّد دفعةً عليه.', 'جملة الإلغاء بالرقم و«7 مواد»');
  t.same([m.receiptVoidSentence('PU-2026-0001', 1).includes('مادّة واحدة'), m.receiptVoidSentence('PU-2026-0001', 2).includes('مادّتان'), m.receiptVoidSentence('PU-2026-0001', 12).includes('12 مادّة')], [true, true, true], 'والواحدة والاثنتان والكثير بصيغها');

  // ── التحويل الحيّ بحقل الكمية (FOUNDATION ٧٦٨ بالفصحى) ──────────────────────────────────────────────────────────────
  const packs = [
    { id: 'bag', itemId: 'i', packTypeId: null, label: 'كيس 50 كغم', factor: 50_000_000n, isDefault: true, forPurchase: true, forSale: true, forRecipe: true, archived: false, version: 1 },
    { id: 'sale-only', itemId: 'i', packTypeId: null, label: 'طبقة', factor: 30_000_000n, isDefault: false, forPurchase: false, forSale: true, forRecipe: false, archived: false, version: 1 },
  ];
  const units = m.purchaseUnitOptions({ baseUnit: 'kg' }, packs);
  t.same(units.map((u) => u.id), ['base', 'code:t', 'bag'], 'وحدات الشراء: الأساس والطن والكيس، بلا وحدة البيع وحدها');
  const conversion = (text) => textOf(m.renderToStaticMarkup(m.h(m.QtyInput, { id: 'q', label: 'الكمية', base: 'kg', units, value: { text, unitId: 'bag' }, onChange() {} })));
  t.same(
    ['47', '1', '2', '3'].map((text) => ['47 كيساً = 2,350 كغم', 'كيس واحد = 50 كغم', 'كيسان = 100 كغم', '3 أكياس = 150 كغم'].find((phrase) => conversion(text).includes(phrase)) ?? conversion(text)),
    ['47 كيساً = 2,350 كغم', 'كيس واحد = 50 كغم', 'كيسان = 100 كغم', '3 أكياس = 150 كغم'],
    'التحويل الحيّ: «47 كيساً = 2,350 كغم» و«كيس واحد» و«كيسان» و«3 أكياس»',
  );

  // ── المعاينة: شكل الخادم المخفي للأمين بلا money، ولأدوار الكلفة بصافي المورّد والتحميلات ─────────────────────────────────
  const wire = {
    id: 'd', kind: 'receipt', status: 'draft', version: 4, party_id: 'p', warehouse_id: 'w', book_id: 'b', received_on: '2026-10-15', ready: true, problems: [],
    lines: [{ line_id: 'a', line_no: 1, item_id: 'i', item_name: 'ذرة صفراء', base_unit: 'kg', unit_label: 'kg', qty_in_unit: '5000.000', qty: '5000.000', expiry_on: null, born_at: null, supplier_lot_no: null, problem: null, warning: null }],
  };
  const keeperPreview = m.parseReceiptPreview(wire);
  const keeperHtml = m.renderToStaticMarkup(m.h(m.ReceiptPreviewPanel, { preview: keeperPreview, approved: new Set(), onToggle() {} }));
  t.ok(keeperPreview.money === null && !keeperHtml.includes('قيمة الدفعة') && !keeperHtml.includes('قيد المورّد'), 'معاينة الأمين: بلا money وبلا خانة قيمة ولا قيود');
  t.ok(keeperHtml.includes('data-action="approve-line"'), 'الموافقة لكل سطر بمعرّفه');
  const money = {
    lines: [{ line_id: 'a', line_total: '2350000', discount_share: '0.00', charge_share: '54166.67', value: '2404166.67', mass_kg: '5000.000' }],
    charges: [{ charge_id: 'c', charge_no: 1, label: 'نقل', amount: '65000', allocate_by: 'mass', all_lines: true, payee_party_id: 'p2', cash_account_id: null, shares: [{ line_id: 'a', share: '54166.67' }] }],
    lines_total: '2350000', discount: '0', net: '2350000', paid_now: '0', cash_account_id: null, charges_total: '65000',
  };
  const costHtml = textOf(m.renderToStaticMarkup(m.h(m.ReceiptPreviewPanel, { preview: m.parseReceiptPreview({ ...wire, money }), approved: new Set(['a']), onToggle() {} })));
  t.ok(costHtml.includes('2,404,166.67') && costHtml.includes('2,350,000') && costHtml.includes('65,000') && costHtml.includes('نقل'), 'معاينة الكلفة: قيمة الدفعة وصافي المورّد وقيد الناقل');

  // ── مراجعة WP7: بعد حفظ ناجح، قراءة بدت قبل الكتابة (بالقيم القديمة) ما تمسح المكتوب ولا تحسبه تعارضاً؛ والجديدة تشيله ──────────────
  const saved = (lineTotal) => ({ id: 'la', lineId: 'a', lineTotal, zeroReason: null });
  const amounts = (discount) => ({ id: 'am', discount, paidNow: 0n, cashAccountId: null, version: 1 });
  const bundleAt = (lineTotal, discount) => ({ doc: { id: 'd' }, lines, lineAmounts: [saved(lineTotal)], amounts: amounts(discount), charges: [] });
  const typed = { lines: { a: { text: '2400000', reason: '', base: saved(235_000_000n) } }, discount: { text: '1000', base: 0n }, paid: null, box: null };
  const rebased = m.rebaseEdits(typed, [{ lineId: 'a', before: saved(235_000_000n), total: 240_000_000n, reason: null }], { discount: 100_000n, paidNow: 0n, cashAccountId: null });
  const stale = m.settleAmountEdits(rebased, bundleAt(235_000_000n, 0n));
  const fresh = m.settleAmountEdits(rebased, bundleAt(240_000_000n, 100_000n));
  t.same(
    [Object.keys(stale.edits.lines), stale.edits.discount?.text, stale.conflicts, Object.keys(fresh.edits.lines), fresh.edits.discount, fresh.conflicts],
    [['a'], '1000', [], [], null, []],
    'بعد الحفظ: القراءة القديمة تبقي «2,400,000» والخصم بلا تعارض، والجديدة تشيلهما',
  );
}
