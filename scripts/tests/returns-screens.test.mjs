// شاشات مرتجع المورّد وتصحيح السعر (الخطّة WP7، FOUNDATION ٥٥٢–٥٥٣، E31، E47) مرسومة نصّاً من المصدر الحقيقي: معاينة الأمين بلا أي
// خانة مال (شكل الخادم بلا money)، ومعاينة الكلفة بقيمة المُرجَع والمقبول و«فرق مرتجع»؛ والسطر اللي ياخذ متبقّي دفعته كلّه للتأكيد؛
// وجملة الإلغاء تسمّي RT والاستلام وعدد المواد بصيغته؛ ومعاينة التصحيح بحصص الدفعة ومرآتها؛ والمبالغ المقبولة: المحفوظ ينشال، والمعدَّل
// من غيرك يتسمّى، والحفظ مشروط بالأساس.
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
      "export { ReturnPreviewPanel, ReturnLinesTable, returnVoidSentence, returnWholeLines, settleCredits, creditPlan } from './src/pages/inventory/SupplierReturnPage.tsx';",
      "export { RevaluePreviewPanel, currentLineTotal } from './src/pages/inventory/ReceiptPostedPanels.tsx';",
      "export { parseSupplierReturnPreview, parseRevaluePreview } from './src/lib/repo/purchasing.ts';",
    ].join('\n'),
  );

  // ── المعاينة: الأمين بلا money (والخادم قد يرسل money: null)، وأدوار الكلفة بالقيمة والمقبول والفرق ──────────────────────────
  const wire = {
    id: 'r', kind: 'supplier_return', status: 'draft', version: 3, receipt_id: 'pu', receipt_no: 'PU-2026-0042', party_id: 'p', warehouse_id: 'w', book_id: 'b', returned_on: '2026-10-30', ready: false, problems: [],
    lines: [
      { line_id: 'a', line_no: 1, receipt_line_id: 'ra', item_id: 'i', item_name: 'ذرة صفراء', base_unit: 'kg', qty: '1000.000', lot_id: 'lot-a', lot_qty_left: '5000.000', whole_balance: false, problem: null, warning: null },
      { line_id: 'b', line_no: 2, receipt_line_id: 'rb', item_id: 'j', item_name: 'كسبة صويا', base_unit: 'kg', qty: '200.000', lot_id: 'lot-b', lot_qty_left: '200.000', whole_balance: true, problem: null, warning: { code: 'expired_lot', hint: 'الدفعة منتهية.' } },
    ],
  };
  const keeper = m.parseSupplierReturnPreview({ ...wire, money: null });
  const keeperHtml = m.renderToStaticMarkup(m.h(m.ReturnPreviewPanel, { preview: keeper, approved: new Set(), onToggle() {} }));
  t.ok(keeper.money === null && m.parseSupplierReturnPreview(wire).money === null, 'money: null أو غايب ← null للأمين');
  t.ok(!keeperHtml.includes('المقبول') && !keeperHtml.includes('فرق مرتجع') && !keeperHtml.includes('قيمة المُرجَع'), 'معاينة الأمين بلا أي خانة مال');
  t.ok(textOf(keeperHtml).includes('1,000') && textOf(keeperHtml).includes('5,000') && keeperHtml.includes('data-action="approve-return-line"'), 'الكمية ومتبقّي الدفعة بفواصل الآلاف، والموافقة لكل سطر');
  const money = {
    lines: [{ line_id: 'a', value: '480833.33', credit: '470000', diff: '10833.33' }, { line_id: 'b', value: '18000.00', credit: null, diff: null }],
    value_total: '498833.33', credit_total: '470000', diff_total: '10833.33',
  };
  const costHtml = textOf(m.renderToStaticMarkup(m.h(m.ReturnPreviewPanel, { preview: m.parseSupplierReturnPreview({ ...wire, money }), approved: new Set(['a']), onToggle() {} })));
  t.ok(costHtml.includes('480,833.33') && costHtml.includes('470,000') && costHtml.includes('10,833.33') && costHtml.includes('498,833.33'), 'معاينة الكلفة: قيمة المُرجَع 480,833.33 والمقبول 470,000 و«فرق مرتجع» 10,833.33 والمجموع');
  t.same(m.returnWholeLines(keeper), [{ itemName: 'كسبة صويا', qty: 200_000n, unit: 'kg' }], 'السطر اللي ياخذ متبقّي دفعته كلّه للتأكيد والإعلان (E31)');

  // ── جملة الإلغاء: RT والاستلام وعدد المواد بصيغته ─────────────────────────────────────────────────────────────────
  t.eq(m.returnVoidSentence('RT-2026-0003', 'PU-2026-0042', 2), 'ألغِ المرتجع RT-2026-0003 — ترجع مادّتان إلى دفعات الاستلام PU-2026-0042، ويُعكس قيد المورّد ومصروف «فرق مرتجع».', 'جملة إلغاء المرتجع');

  // ── معاينة التصحيح: الدفعة ومرآتها بحصصهما، وحصّة المتبقّي و«فرق سعر شراء» وقيد المورّد ─────────────────────────────────────
  const revalue = m.parseRevaluePreview({
    line_id: 'l', receipt_id: 'pu', receipt_no: 'PU-2026-0042', item_name: 'ذرة صفراء', base_unit: 'kg', qty_in: '5000.000', current_total: '2350000', new_total: '2400000', diff: '50000',
    family: [
      { lot_id: 'root', warehouse_id: 'w1', warehouse_name: 'مخزن المواد الأوّلية', qty_left: '1880.000', value_left: '903966.67', share: '18800.00' },
      { lot_id: 'mirror', warehouse_id: 'w2', warehouse_name: 'مخزن المعمل', qty_left: '1000.000', value_left: '480833.33', share: '10000.00' },
    ],
    lot_share: '28800.00', expense_amount: '21200.00', supplier_adjustment: '-50000', problems: [], ready: true, plan: 'p',
  });
  const revalueHtml = textOf(m.renderToStaticMarkup(m.h(m.RevaluePreviewPanel, { preview: revalue })));
  t.ok(['مخزن المعمل', '18,800.00', '10,000.00', '28,800.00', '21,200.00', '50,000', '1,880'].every((x) => revalueHtml.includes(x)), 'معاينة التصحيح: حصص الجذر والمرآة وحصّة المتبقّي و«فرق سعر شراء» وقيد المورّد');
  t.same(
    [m.currentLineTotal('l', 235_000_000n, []), m.currentLineTotal('l', 235_000_000n, [{ receiptLineId: 'l', status: 'posted', newTotal: 240_000_000n }, { receiptLineId: 'l', status: 'void', newTotal: 250_000_000n }])],
    [235_000_000n, 240_000_000n],
    'المبلغ الحالي: آخر تصحيح غير ملغى، وإلا مبلغ الفاتورة',
  );

  // ── المبالغ المقبولة: الخطّة مشروطة بالأساس، والقراءة الجديدة تشيل المحفوظ وتسمّي اللي غيّره غيرك ──────────────────────────
  const bundleOf = (credits) => ({ doc: { id: 'r' }, receipt: {}, lines: [{ id: 'a', itemName: 'ذرة صفراء' }, { id: 'b', itemName: 'كسبة صويا' }], credits });
  const before = bundleOf([{ id: 'c1', lineId: 'a', credit: 47_000_000n }]);
  const edits = { a: { text: '480000', base: 47_000_000n }, b: { text: '18000', base: null } };
  t.same(
    m.creditPlan(edits, before).writes,
    [{ lineId: 'a', before: { id: '', lineId: 'a', credit: 47_000_000n }, credit: 48_000_000n }, { lineId: 'b', before: null, credit: 1_800_000n }],
    'الخطّة: تعديل «ذرة» مشروط بـ470,000، وإدخال «صويا» أوّل مرّة',
  );
  t.same([m.creditPlan({ a: { text: '-5', base: 47_000_000n } }, before).problem !== null, m.creditPlan({ a: { text: '', base: 47_000_000n } }, before).problem !== null], [true, true], 'السالب والمحفوظ الممسوح يوقفان الحفظ');
  const after = bundleOf([{ id: 'c1', lineId: 'a', credit: 48_000_000n }, { id: 'c2', lineId: 'b', credit: 2_000_000n }]);
  const settled = m.settleCredits(edits, after);
  t.same([Object.keys(settled.edits), settled.conflicts], [[], ['كسبة صويا']], 'بعد القراءة: «ذرة» انحفظت فتنشال، و«صويا» غيّرها غيرك (20,000) فتنشال وتتسمّى');

  // ── مراجعة WP7: بعد حفظ ناجح (الأساس الجديد ويّا السابق)، قراءة بدت قبل الكتابة ما تمسح المكتوب ولا تحسبه تعارضاً ─────────────────
  const rebased = { a: { text: '480000', base: 48_000_000n, prior: 47_000_000n } };
  const stale = m.settleCredits(rebased, before);
  t.same([Object.keys(stale.edits), stale.conflicts, Object.keys(m.settleCredits(rebased, after).edits)], [['a'], [], []], 'بعد الحفظ: القراءة القديمة (470,000) تبقي «480,000»، والجديدة تشيله');

  // ── مراجعة WP7: سطر بلا قيمة (كميته فوق متبقّي دفعته) ما يكسر المعاينة كلها، وخليته «—» ─────────────────────────────────────
  let short;
  try {
    short = m.parseSupplierReturnPreview({
      ...wire,
      money: {
        lines: [{ line_id: 'a', value: null, credit: '470000', diff: null }, { line_id: 'b', value: '18000.00', credit: '18000', diff: '0.00' }],
        value_total: '18000.00', credit_total: '488000', diff_total: '-470000.00',
      },
    });
  } catch {
    short = null;
  }
  const shortHtml = short ? textOf(m.renderToStaticMarkup(m.h(m.ReturnPreviewPanel, { preview: short, approved: new Set(), onToggle() {} }))) : '';
  t.same([short?.money?.lines[0]?.value, shortHtml.split('—').length - 1, shortHtml.includes('18,000.00')], [null, 2, true], 'قيمة null تنقرا null، وخليتا القيمة والفرق «—»');
}
