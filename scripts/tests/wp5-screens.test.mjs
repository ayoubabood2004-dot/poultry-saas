// شاشات WP5 من المصدر الحقيقي (الخطّة WP5 «Unit tests»): معاينة الصرف بلا قيمة المصروف للأمين (والمدير يشوفها) و«بانتظار موافقة
// المدير»، وتأكيد السحب الكامل يسمّي المادّة والكمية، ودفتر المفقس بلا اختيار مسبق (ومشاكل نموذج المصروف)، وشاشة العدّ بلا كمية
// الدفتر (وأعمدة سطور العادّ نفسها ما تطلبها)، وحقول سطر العدّ، والمحفوظ بالجهاز للجرد (اللي وصل ينشال، و23505 = انكتب فيتعدّل
// بآخر قيمة، والرفض الأكيد ينشال ويرجع بسببه، والشبكة توقف وتبقي الباقي). ومراجعة WP5: السحب الكامل بسطور الترتيب بس، و«بانتظار
// موافقة المدير» بالقائمة، وأشهر النسبة سنة، والعدّ الثاني لنفس المادّة ينجمع، و23505 على مفتاح ثاني رفض أكيد، وخطوط موافقة ترحيل
// الجرد (النقص بدفعاته والزيادة دفعة جديدة) وزرّه.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// نافذة التأكيد نصّاً (عنوانها ونتيجتها) بلا Dialog الحقيقي (بوّابة ومؤثّرات).
const confirmStub = {
  name: 'confirm-stub',
  setup(b) {
    b.onResolve({ filter: /(^|\/)ConfirmDialog$/ }, () => ({ path: 'ConfirmDialog', namespace: 'wp5-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'wp5-stub' }, () => ({
      contents: "import { createElement } from 'react'; export function ConfirmDialog(props) { return props.open ? createElement('div', { role: 'dialog' }, props.title, props.consequence) : null; }",
      resolveDir: ROOT,
      loader: 'js',
    }));
  },
};

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
    plugins: [confirmStub],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** معاينة صرف كما يرجّعها الخادم؛ money تنشال للأمين (mask). */
function usePreviewJson({ money, wholeBalance = false, needsManager = false, canPost = true, destroy = false }) {
  const draw = { lot_id: 'lot-1', qty: '10.000', received_on: '2026-10-20', expiry_on: null, source_kind: 'opening', source: 'رصيد افتتاح بتاريخ 20/10/2026', supplier_lot_no: null };
  const line = {
    line_id: 'line-1',
    line_no: 1,
    item_id: 'item-1',
    item_name: 'كاز أبيض',
    base_unit: 'L',
    tracks_expiry: false,
    qty: '10.000',
    qty_in_unit: '10.000',
    unit_label: 'L',
    item_unit_id: null,
    unit_code: null,
    lot_id: null,
    lot_expiry_on: null,
    lot_received_on: null,
    lot_left: null,
    available: '500.000',
    expired: '0',
    later: '0',
    shortage: '0.000',
    whole_balance: wholeBalance,
    needs_release: false,
    problem: null,
    draws: [money ? { ...draw, money: { value: '7500.00' } } : draw],
  };
  return {
    id: 'doc-1',
    kind: 'stock_use',
    status: 'draft',
    version: 3,
    doc_no: null,
    warehouse_id: 'wh-1',
    used_on: '2026-10-30',
    category_id: 'cat-1',
    category_name: 'صيانة',
    destroy,
    division_kind: 'general',
    needs_manager: needsManager,
    can_post: canPost,
    problems: [],
    lines: [money ? { ...line, money: { value: '7500.00' } } : line],
    plan: 'p',
    ready: true,
    ...(money ? { money: { total: '7500.00' } } : {}),
  };
}

export default async function (t) {
  const m = await bundle(`
    export { UsePreviewPanel, awaitsManager, stockUseWholeLines, stockUsePostReady, expiredLots } from './src/pages/inventory/UsesPage.tsx';
    export { HatcheryBookSelect, booksInScope, expenseProblems, expenseSpanLabel, monthChoices, monthLabel } from './src/pages/accounts/ExpensesPage.tsx';
    export { parseExpenseReport } from './src/lib/repo/cash.ts';
    export { CountedLines, countLineFields, countPostReady, countPreviewLines, fieldsOfLine, mergeCountFields, mergeSentence, refreshDocText, signedQtyCell } from './src/pages/inventory/CountsPage.tsx';
    export { clearPending, countLinePatch, isOwnRetry, pendingDraftId, sendPending, withPending, writeOrKeep } from './src/pages/inventory/countDevice.ts';
    export { usesPageQuery } from './src/lib/repo/uses.ts';
    export { PostgrestClient } from '@supabase/postgrest-js';
    export { parseCountPreview } from './src/lib/repo/counts.ts';
    export { WholeBalanceConfirm } from './src/components/ui/WholeBalance.tsx';
    export { parseUsePreview } from './src/lib/repo/uses.ts';
    export { RejectedError, NetworkError, ZeroRowsError } from './src/lib/errors.ts';
  `);
  const html = (element) => m.renderToStaticMarkup(element);
  const none = () => {};

  // ── معاينة الصرف: الأمين بلا قيمة المصروف، والمدير بيها ───────────────────────────────────────────────────────────
  const keeper = m.parseUsePreview(usePreviewJson({ money: false }));
  const manager = m.parseUsePreview(usePreviewJson({ money: true }));
  const keeperHtml = html(m.h(m.UsePreviewPanel, { preview: keeper, approved: new Set(), onToggle: none }));
  const managerHtml = html(m.h(m.UsePreviewPanel, { preview: manager, approved: new Set(), onToggle: none }));
  t.same(
    [keeper.total, keeper.lines[0].value, keeperHtml.includes('قيمة المصروف'), keeperHtml.includes('7,500'), keeperHtml.includes('10 لترات')],
    [null, null, false, false, true],
    'معاينة الأمين: الكمية «10 لترات» بلا «قيمة المصروف» ولا أيّ رقم مال (الخادم شال money)',
  );
  t.same([managerHtml.includes('قيمة المصروف'), managerHtml.includes('7,500.00')], [true, true], 'ضابط: معاينة المدير بقيمة المصروف 7,500.00');
  const awaiting = m.parseUsePreview(usePreviewJson({ money: false, needsManager: true, canPost: false }));
  t.ok(html(m.h(m.UsePreviewPanel, { preview: awaiting, approved: new Set(), onToggle: none })).includes('بانتظار موافقة المدير'), 'سطر يسمّي دفعة منتهية للأمين: «بانتظار موافقة المدير»');
  t.same(
    [m.stockUsePostReady(awaiting, new Set(['line-1']), true), m.stockUsePostReady(keeper, new Set(['line-1']), true), m.stockUsePostReady(keeper, new Set(), true), m.stockUsePostReady(keeper, new Set(['line-1']), false)],
    [false, true, false, false],
    'زرّ الترحيل: ما يقدر يرحّله (إذن المدير) ممنوع حتى لو انوافق، والموافقة على كل سطر والاتّصال لازمان',
  );

  // ── السحب الكامل: التأكيد يسمّي المادّة والكمية والمخزن ─────────────────────────────────────────────────────────
  const whole = m.parseUsePreview(usePreviewJson({ money: false, wholeBalance: true }));
  const lines = m.stockUseWholeLines(whole);
  const confirmHtml = html(m.h(m.WholeBalanceConfirm, { open: true, lines, warehouse: 'المخزن العام', busy: false, onConfirm: none, onCancel: none }));
  t.same(
    [lines, ['كاز أبيض', '10 لترات', 'المخزن العام'].every((text) => confirmHtml.includes(text))],
    [[{ itemName: 'كاز أبيض', qty: 10000n, unit: 'L' }], true],
    'تأكيد السحب الكامل يسمّي «كاز أبيض» و«10 لترات» و«المخزن العام»',
  );
  t.same(m.stockUseWholeLines(keeper), [], 'سطر ما يسحب الرصيد كلّه: بلا تأكيد');
  // سطر يسمّي دفعة منتهية ويفرّغها ما يصفّر المادّة: ما ينجمع ويّا سطر الترتيب، ولحاله ما يطلب تأكيد السحب الكامل.
  const named = { ...whole.lines[0], lineId: 'line-2', lotId: 'lot-x', qty: 3000n, wholeBalance: true };
  t.same(
    [m.stockUseWholeLines({ ...whole, lines: [...whole.lines, named] }), m.stockUseWholeLines({ ...whole, lines: [named] })],
    [[{ itemName: 'كاز أبيض', qty: 10000n, unit: 'L' }], []],
    'السحب الكامل بسطور الترتيب بس: الدفعة المسمّاة اللي تفرغ ما تنجمع ولا تطلب التأكيد لحالها',
  );
  const destroyIds = new Set(['cat-destroy']);
  t.same(
    [
      m.awaitsManager({ status: 'draft', namesLot: true, categoryId: 'cat-1' }, destroyIds),
      m.awaitsManager({ status: 'draft', namesLot: false, categoryId: 'cat-destroy' }, destroyIds),
      m.awaitsManager({ status: 'draft', namesLot: false, categoryId: 'cat-1' }, destroyIds),
      m.awaitsManager({ status: 'posted', namesLot: true, categoryId: 'cat-destroy' }, destroyIds),
    ],
    [true, true, false, false],
    '«بانتظار موافقة المدير» بالقائمة: مسوّدة تسمّي دفعة أو إتلاف، والمرحَّل لا',
  );
  t.same(
    m.expiredLots([{ lotId: 'a', expiryOn: '2026-10-25', qtyLeft: 6000n }, { lotId: 'b', expiryOn: '2026-10-30', qtyLeft: 1000n }, { lotId: 'c', expiryOn: '2026-10-01', qtyLeft: 0n }, { lotId: 'd', expiryOn: null, qtyLeft: 5n }], '2026-10-30').map((lot) => lot.lotId),
    ['a'],
    'الدفعات المنتهية بتاريخ المستند وبيها متبقٍّ (يوم انتهائها صالحة بعد)',
  );

  // ── دفتر المفقس بلا اختيار مسبق، ومشاكل نموذج المصروف ──────────────────────────────────────────────────────────
  const books = [
    { id: 'b-chicks', divisionId: 'd-hatch', divisionKind: 'hatchery', code: 'chicks', name: 'دفتر الأفراخ', goLiveOn: null },
    { id: 'b-eggs', divisionId: 'd-hatch', divisionKind: 'hatchery', code: 'hatching_eggs', name: 'دفتر بيض التفقيس', goLiveOn: null },
  ];
  const bookHtml = html(m.h(m.HatcheryBookSelect, { id: 'book', books, value: '', onChange: none }));
  const selected = [...bookHtml.matchAll(/<option value="([^"]*)" selected=""/gu)].map((match) => match[1]);
  t.same([selected, bookHtml.includes('b-chicks'), bookHtml.includes('b-eggs')], [[''], true, true], 'دفتر المفقس: الدفتران معروضان والمختار «اختر الدفتر» (بلا اختيار مسبق)');
  const form = { divisionId: 'd-hatch', categoryId: 'cat', amount: '25,000', day: '30/10/2026', month: '', source: 'credit', accountId: '', party: { id: 'p-1', name: 'مورّد' }, bookId: '', note: '' };
  const hatch = new Set(['d-hatch']);
  const missingBook = m.expenseProblems(form, hatch, '2026-10-30');
  const withBook = m.expenseProblems({ ...form, bookId: 'b-eggs' }, hatch, '2026-10-30');
  const general = m.expenseProblems({ ...form, divisionId: 'd-gen' }, hatch, '2026-10-30');
  t.same(
    [missingBook.input, Object.keys(missingBook.errors), withBook.input?.bookId, withBook.input?.amount, general.input?.bookId, general.errors],
    [null, ['bookId'], 'b-eggs', 2500000n, null, {}],
    'مصروف المفقس بالدين بلا دفتر: خطأ الدفتر؛ وبه يُرسل؛ وغير المفقس بلا دفتر (الرئيسي بالخادم)',
  );
  t.same(
    [Object.keys(m.expenseProblems({ ...form, divisionId: 'd-gen', amount: '25,000.50' }, hatch, '2026-10-30').errors), Object.keys(m.expenseProblems({ ...form, divisionId: 'd-gen', day: '20/10/2026' }, hatch, '2026-10-30').errors)],
    [['amount'], ['day']],
    'المبلغ بالدينار الصحيح، والتاريخ ضمن 7 أيام',
  );
  // وحدات الاختيار بنطاق القارئ (E40)، والمجموع بأشهر النسبة، وعدد وحدات النطاق من التقرير (مراجعة WP5).
  const orgBooks = [{ id: 'b-gen', divisionId: 'd-gen', divisionKind: 'general', code: 'main', name: 'العامّة', goLiveOn: null }, { id: 'b-br', divisionId: 'd-br', divisionKind: 'broiler', code: 'main', name: 'اللحم', goLiveOn: null }];
  t.same(
    [
      m.booksInScope(orgBooks, { role: 'accountant', scopes: [{ divisionId: 'd-br' }] }).map((b) => b.id),
      m.booksInScope(orgBooks, { role: 'accountant', scopes: [] }).map((b) => b.id),
      m.booksInScope(orgBooks, { role: 'manager', scopes: [{ warehouseId: 'w-1' }] }).map((b) => b.id),
    ],
    [['b-br'], ['b-gen', 'b-br'], []],
    'وحدات المصروف بنطاق القارئ: المحصور باللحم يختار اللحم بس، وبلا نطاق الكل، والمحصور بمخزن ولا وحدة (E40)',
  );
  const report = m.parseExpenseReport({ from: '2026-09-01', to: '2026-11-10', divisions: { visible: 1, total: 6 }, rows: [], next: null, totals: { total: '0', count: 0, by_category: [], by_source: [], by_month: [] } });
  t.same(
    [report.divisions, m.expenseSpanLabel(report.from, report.to), (() => { try { m.parseExpenseReport({ from: '2026-09-01', to: '2026-11-10', rows: [], next: null, totals: { total: '0', count: 0, by_category: [], by_source: [], by_month: [] } }); return 'ok'; } catch { return 'رمى'; } })()],
    [{ visible: 1, total: 6 }, 'المجموع بشهر النسبة من 09/2026 إلى 11/2026', 'رمى'],
    'التقرير: وحدات النطاق من المجموع (1 من 6)، والمجموع بأشهر النسبة، وجواب بلاها خطأ شكل',
  );
  const months = m.monthChoices('2026-11-10');
  t.same(
    [months.length, months[0], months[1], months.at(-1), m.monthLabel('2026-10-01')],
    [13, '2026-11-01', '2026-10-01', '2025-11-01', '10/2026'],
    'أشهر النسبة (Q14): شهر التاريخ واثنا عشر قبله (فاتورة سنوية متأخّرة)، و«10/2026»',
  );

  // ── العدّ الأعمى: سطور العادّ بلا كمية الدفتر، وأعمدتها ما تطلبها ─────────────────────────────────────────────────
  const counted = html(
    m.h(m.CountedLines, {
      lines: [
        { id: 'l1', lineNo: 1, itemId: 'v', itemName: 'لقاح نيوكاسل', itemKind: 'vaccine', baseUnit: 'pc', tracksExpiry: true, counted: 10000n, countedExpired: 6000n, gainExpiryOn: null, gainExpiredExpiryOn: null, gainBornAt: null, reason: null },
        { id: 'l2', lineNo: 2, itemId: 'k', itemName: 'كاز أويل', itemKind: 'fuel', baseUnit: 'L', tracksExpiry: false, counted: 98000n, countedExpired: null, gainExpiryOn: null, gainExpiredExpiryOn: null, gainBornAt: null, reason: null },
      ],
      onEdit: none,
      onDelete: none,
    }),
  );
  t.same(
    [counted.includes('لقاح نيوكاسل'), counted.includes('صالح 10'), counted.includes('منتهٍ 6'), counted.includes('98 لتراً'), counted.includes('الدفتر'), counted.includes('الفرق')],
    [true, true, true, true, false, false],
    'سطور العادّ: المعدود (والصالح والمنتهي) بلا «الدفتر» ولا «الفرق»',
  );
  const source = readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'counts.ts'), 'utf8');
  const entryColumns = /const COUNT_LINE_COLUMNS =\s*'([^']*)'/u.exec(source)?.[1] ?? '';
  t.ok(entryColumns.includes('counted_qty') && !/system_|diff/u.test(entryColumns), `أعمدة سطور العادّ ما تطلب الدفتر ولا الفرق (E25): ${entryColumns}`);
  t.same([m.signedQtyCell(10000n, 3), m.signedQtyCell(-100000n, 3), m.signedQtyCell(0n, 0)], ['+10.000', '\u{2212}100.000', '0'], 'الفرق بإشارته: زيادة + ونقص −');

  // ── حقول سطر العدّ ────────────────────────────────────────────────────────────────────────────────────────────
  const vaccine = { id: 'v', name: 'لقاح', kind: 'vaccine', baseUnit: 'pc', tracksExpiry: true };
  const chicks = { id: 'c', name: 'أفراخ', kind: 'chick', baseUnit: 'pc', tracksExpiry: false };
  const fieldsOf = (item, over) => m.countLineFields(item, { counted: 10000n, expired: '', gainExpiry: '', gainExpiredExpiry: '', born: '', ...over });
  t.same(
    [fieldsOf(vaccine, {}).fields, fieldsOf(chicks, { born: '29/10/2026 07:30', expired: '5' }).fields.counted_expired_qty, typeof fieldsOf(chicks, { born: '29/10/2026 07:30' }).fields.gain_born_at, 'problem' in fieldsOf(vaccine, { gainExpiry: '31/02/2026' }), 'problem' in fieldsOf(vaccine, { counted: null })],
    [{ item_id: 'v', counted_qty: '10.000', counted_expired_qty: '0.000', gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, null, 'string', true, true],
    'حقول السطر: المنتهي الفارغ صفر لمادّة تتابعه وفارغ لغيرها، ووقت الفقس للأفراخ بس، والتاريخ الغلط والعدد الناقص مشكلة',
  );

  // ── المحفوظ بالجهاز للجرد ──────────────────────────────────────────────────────────────────────────────────────
  const fields = (qty) => ({ item_id: 'i', counted_qty: qty, counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null });
  const line = (id, qty, existing = false) => ({ id, existing, itemName: id, baseUnit: 'kg', fields: fields(qty) });
  const store = (lines) => {
    const box = { lines, writes: [] };
    return { box, read: async () => (box.lines.length ? { payload: { docId: 'd', lines: box.lines } } : null), write: async (next) => box.writes.push((box.lines = [...next]).map((l) => l.id)) };
  };
  const calls = [];
  const send = (fail) => ({
    add: async (doc, id, f) => {
      calls.push(['add', id, f.counted_qty]);
      if (fail[id]) throw fail[id]();
    },
    update: async (id, patch) => {
      calls.push(['update', id, patch.counted_qty]);
      if (fail[`u:${id}`]) throw fail[`u:${id}`]();
    },
  });
  const ok = store([line('a', '1.000'), line('b', '2.000', true), line('c', '3.000')]);
  const sent = await m.sendPending('d', ok, send({ c: () => new m.RejectedError('23505', null) }));
  t.same([sent.sent, sent.rejected.length, ok.box.lines, calls], [3, 0, [], [['add', 'a', '1.000'], ['update', 'b', '2.000'], ['add', 'c', '3.000'], ['update', 'c', '3.000']]], 'الإرسال: الجديد إدراج، والموجود تعديل، و23505 = انكتب فيتعدّل بآخر قيمة، والمحفوظ فرغ');
  calls.length = 0;
  const flaky = store([line('a', '1.000'), line('b', '2.000'), line('c', '3.000')]);
  const flakyResult = await m.sendPending('d', flaky, send({ b: () => new m.NetworkError() }));
  t.same([flakyResult.failure?.name, flakyResult.sent, flaky.box.lines.map((l) => l.id)], ['NetworkError', 1, ['b', 'c']], 'الشبكة بالسطر الثاني: الأوّل انشال، والثاني وبعده باقيان والخطأ يرجع');
  // المراجعة الثانية: مرفوض قبل فشل الشبكة يرجع ويّاه (كان يضيع ويّا الرمي)، وصفر صفوف (السطر انحذف) رفض أكيد ينشال.
  const mixed = store([line('a', '1.000', true), line('b', '2.000'), line('c', '3.000')]);
  const mixedResult = await m.sendPending('d', mixed, send({ 'u:a': () => new m.ZeroRowsError(), b: () => new m.NetworkError() }));
  t.same(
    [mixedResult.rejected.map((r) => [r.line.id, r.error.name]), mixedResult.failure?.name, mixed.box.lines.map((l) => l.id)],
    [[['a', 'ZeroRowsError']], 'NetworkError', ['b', 'c']],
    'مرفوض (صفر صفوف) ثم شبكة: المرفوض يرجع والخطأ ويّاه، والباقي (هو وبعده) بالجهاز',
  );
  const refused = store([line('a', '1.000'), line('b', '2.000')]);
  const result = await m.sendPending('d', refused, send({ a: () => new m.RejectedError('not_draft', 'الجرد مسلَّم') }));
  t.same([result.sent, result.rejected.map((r) => [r.line.id, r.error.code]), refused.box.lines], [1, [['a', 'not_draft']], []], 'الرفض الأكيد (الجرد سُلّم): السطر ينشال ويرجع بسببه، والباقي ينرسل');
  t.same(m.withPending([line('a', '1.000'), line('b', '2.000')], line('a', '5.000')).map((l) => [l.id, l.fields.counted_qty]), [['b', '2.000'], ['a', '5.000']], 'نفس السطر بالمحفوظ يتبدّل بآخر قيمة');
  // 23505 على مفتاح ثاني (المادّة معدودة بسطر ثاني) رفض أكيد: كان ينقرا «انكتب» فيتعدّل سطر ما موجود ويعلق بالمحفوظ.
  calls.length = 0;
  const other = store([line('a', '1.000')]);
  const otherKey = await m.sendPending('d', other, send({ a: () => new m.RejectedError('23505', null, 'stock_count_lines_org_id_doc_id_item_id_key') }));
  t.same(
    [
      [m.isOwnRetry(new m.RejectedError('23505', null, 'stock_count_lines_pkey')), m.isOwnRetry(new m.RejectedError('23505', null)), m.isOwnRetry(new m.RejectedError('23505', null, 'stock_count_lines_org_id_doc_id_item_id_key'))],
      otherKey.rejected.map((r) => r.line.id),
      calls,
      other.box.lines,
    ],
    [[true, true, false], ['a'], [['add', 'a', '1.000']], []],
    '23505 بمفتاح الصفّ = انكتب، وبمفتاح المادّة رفض أكيد ينشال ويرجع بسببه (بلا تعديل)',
  );
  t.same(Object.keys(m.countLinePatch(fields('1.000'))).includes('item_id'), false, 'تعديل السطر بلا المادّة (المنح بلاها، فإرسالها يرجع 42501)');
  t.ok(m.pendingDraftId('u-1', 'd') !== m.pendingDraftId('u-2', 'd'), 'محفوظ الجرد لكل مستخدم بالجهاز (مستخدمان بجهاز واحد ما يمسحان محفوظ بعض)');
  // الكتابة تحت القفل: عدّ محفوظ ما وصل لنفس السطر أو المادّة يوقفها، والشبكة تحفظ، والجمع يرسل القيمة اللي انحسب منها.
  const keptStore = (lines) => store(lines.map((l) => ({ ...l, fields: { ...l.fields, item_id: l.item ?? l.fields.item_id } })));
  calls.length = 0;
  const blocked = keptStore([{ ...line('k', '5.000'), item: 'x' }]);
  const outcomes = [];
  for (const [, target, plan] of [
    ['same-id', { ...line('k', '6.000', true), fields: { ...fields('6.000'), item_id: 'x' } }, {}],
    ['same-item', { ...line('n', '1.000'), fields: { ...fields('1.000'), item_id: 'x' } }, {}],
  ]) {
    outcomes.push(await m.writeOrKeep('d', blocked, target, send(plan)).then((r) => r, (e) => e.code));
  }
  const blockedCalls = calls.length;
  const offline = store([]);
  const offlineResult = await m.writeOrKeep('d', offline, line('z', '2.000'), send({ z: () => new m.NetworkError() }));
  const merged = store([]);
  const sentMerge = [];
  await m.writeOrKeep('d', merged, { ...line('m', '9.000', true), expected: { counted_qty: '4.000', counted_expired_qty: null } }, { add: async () => {}, update: async (id, patch, expected) => sentMerge.push([id, patch.counted_qty, expected?.counted_qty]) });
  t.same(
    [outcomes, blockedCalls, offlineResult, offline.box.lines.map((l) => l.id), sentMerge],
    [['kept_first', 'kept_first'], 0, 'kept', ['z'], [['m', '9.000', '4.000']]],
    'عدّ محفوظ لنفس السطر أو المادّة يوقف الكتابة (kept_first) بلا إرسال؛ والشبكة تحفظه بالجهاز؛ والجمع يرسل العدّ اللي انحسب منه',
  );
  const twoTabs = store([line('a', '1.000'), line('b', '2.000')]);
  await m.clearPending(twoTabs, 'd', ['a']);
  t.same(twoTabs.box.lines.map((l) => l.id), ['b'], '«امسح المحفوظ» يمسح اللي انعرض بس (b انحفظ بنافذة ثانية بعد العرض)');
  t.same(
    [m.refreshDocText({ label: 'TR-1', qty: -5000n }, 'L'), m.refreshDocText({ label: 'TR-2', qty: 3000n }, 'L')],
    ['TR-1 (صادر 5 لترات)', 'TR-2 (وارد 3 لترات)'],
    'مستندات «أعد الحساب» باتّجاهها: صادر ينقص الرصيد ووارد يزيده',
  );
  const vaccineItem = { id: 'v', name: 'لقاح', kind: 'vaccine', baseUnit: 'pc', tracksExpiry: true };
  const shelfLine = { id: 'l', itemId: 'v', counted: 10000n, countedExpired: 4000n, gainExpiryOn: null, gainExpiredExpiryOn: null, gainBornAt: null };
  const added = { item_id: 'v', counted_qty: '5.000', counted_expired_qty: '1.000', gain_expiry_on: '2027-01-01', gain_expired_expiry_on: null, gain_born_at: null };
  const sentence = m.mergeSentence({ draft: { item: vaccineItem, lineId: null }, before: shelfLine, added, total: m.mergeCountFields(m.fieldsOfLine(shelfLine), added) });
  t.ok(['فيصير 15', 'والمنتهي 4', 'فيصير 5', 'تحلّ محلّ السابقة'].every((part) => sentence.includes(part)), `جملة الجمع لمادّة تتابع الانتهاء تسمّي الصالح والمنتهي وتبديل التواريخ: ${sentence}`);
  // طلب قائمة الصرف نفسه (supabase-js الحقيقي بلا شبكة): علامة «بانتظار المدير» من سطر واحد بدفعة مسمّاة.
  let listed = '';
  const client = new m.PostgrestClient('http://dummy.local/rest/v1', { fetch: async (url) => ((listed = decodeURIComponent(String(url))), new Response('[]', { status: 200, headers: { 'content-range': '0-0/0' } })) });
  await m.usesPageQuery(client, null);
  t.ok(listed.includes('named.lot_id=not.is.null') && listed.includes('named.limit=1') && listed.includes('named:stock_use_lines(lot_id)'), `قائمة الصرف تطلب سطراً واحداً بدفعة مسمّاة لكل مستند: ${listed}`);

  // ── العدّ الثاني لنفس المادّة ينجمع (رفّان)، والتواريخ الجديدة تغلب ───────────────────────────────────────────────
  const shelfOne = m.fieldsOfLine({ itemId: 'v', counted: 10000n, countedExpired: 2000n, gainExpiryOn: '2027-01-01', gainExpiredExpiryOn: null, gainBornAt: null });
  t.same(
    m.mergeCountFields(shelfOne, { item_id: 'v', counted_qty: '5.000', counted_expired_qty: '1.000', gain_expiry_on: null, gain_expired_expiry_on: '2026-09-01', gain_born_at: null }),
    { item_id: 'v', counted_qty: '15.000', counted_expired_qty: '3.000', gain_expiry_on: '2027-01-01', gain_expired_expiry_on: '2026-09-01', gain_born_at: null },
    'عدّ ثاني لنفس المادّة: الصالح والمنتهي ينجمعان، والتاريخ الفارغ ما يمسح السابق',
  );

  // ── خطوط موافقة ترحيل الجرد وزرّه ─────────────────────────────────────────────────────────────────────────────
  const countLine = (over) => ({
    line_id: 'c1', line_no: 1, item_id: 'v', item_name: 'لقاح', base_unit: 'pc', tracks_expiry: true, kind: 'vaccine',
    counted_qty: '8.000', counted_expired_qty: '0.000', system_qty: '10.000', system_expired_qty: '2.000', diff: '-2.000', expired_diff: '-2.000',
    now_qty: '10.000', now_expired_qty: '2.000', stale: false, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null, reason: 'كسر',
    reason_stale: false, gain_source: null, reference_lot_id: null, problem: null,
    draws: [{ lot_id: 'l-ok', qty: '2.000', expiry_on: '2027-06-30', received_on: '2026-10-20' }],
    expired_draws: [{ lot_id: 'l-old', qty: '2.000', expiry_on: '2026-10-25', received_on: '2026-10-20' }],
    ...over,
  });
  const countPreview = (lines, ready = true) => m.parseCountPreview({ version: 4, plan: 'p', status: 'submitted', submitted_at: null, snapshot_at: null, stale: false, problems: [], lines, ready });
  const shortLines = m.countPreviewLines(countPreview([countLine({})]));
  const gainLines = m.countPreviewLines(countPreview([countLine({ line_id: 'c2', counted_qty: '13.000', diff: '3.000', expired_diff: '0.000', counted_expired_qty: '2.000', draws: [], expired_draws: [] })]));
  t.same(
    [shortLines.map((l) => [l.lineId, l.requested, l.draws.map((d) => d.lotId), l.shortage]), gainLines.map((l) => [l.lineId, l.requested, l.draws.length, l.shortage])],
    [[['c1:S', 2000n, ['l-ok'], 0n], ['c1:X', 2000n, ['l-old'], 0n]], [['c2:G', 3000n, 1, 0n]]],
    'خطوط الترحيل: النقص بدفعاته (S) ونقص المنتهي من المنتهي (X)، والزيادة دفعة جديدة (G)',
  );
  const flat = countPreview([countLine({ diff: '0.000', expired_diff: '0.000', counted_qty: '10.000', counted_expired_qty: '2.000', draws: [], expired_draws: [] })]);
  t.same(
    [
      m.countPostReady(countPreview([countLine({})]), new Set(['c1:S']), true),
      m.countPostReady(countPreview([countLine({})]), new Set(['c1:S', 'c1:X']), true),
      m.countPostReady(countPreview([countLine({})]), new Set(['c1:S', 'c1:X']), false),
      m.countPostReady(countPreview([countLine({})], false), new Set(['c1:S', 'c1:X']), true),
      m.countPostReady(flat, new Set(), true),
      m.countPreviewLines(countPreview([countLine({ draws: [] })]))[0].shortage,
    ],
    [false, true, false, false, true, 2000n],
    'زرّ ترحيل الجرد: كل خطّ انوافق عليه والمعاينة جاهزة والاتّصال موجود؛ وجرد بلا فروق بلا خطوط؛ ونقص بلا دفعات كافية ناقص',
  );
  t.same(countPreview([countLine({ reason_stale: true })]).lines[0].reasonStale, true, 'المعاينة تقول إن السبب على فرق قديم (reason_stale)');
}
