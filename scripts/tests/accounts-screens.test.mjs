// شاشات الحسابات (خطّة المرحلة 1 WP3، FOUNDATION ٧٨٨ و٨٠٧) مرسومة نصّاً من المصدر الحقيقي، بقراءات من شكل الخادم نفسه
// (parsePartyBalances وparseAccountsSummary وparseStatement وparseCashBalances): كلمة «عليه» أو «له» بكل خانة دفتر دائماً
// والصفر «—»؛ صفّا التذييل وعدد «N من المجموع» من الملخّص والخادم، مو من الصفوف المحمّلة (صفحة ناقصة جهتين تبين مجاميع الكل)؛
// نافذة «قبضنا» تسأل الدفتر أوّلاً بلا اختيار مسبق؛ الإرسال معطّل والقائمة فاشلة؛ والطباعة ترسم كل الصفوف. القراءات والجلسة
// بدائل (useLoad وuseSession)، والنافذة ترسم بمكانها (createPortal بديل)؛ كل كائن عامّ يرجع كما كان بـfinally (درس 2026-10-26).
// والمراجعة العدائية لـWP3: التسوية والإعفاء والافتتاح والنقل بمعاينة وتأكيد؛ فلتر الدفتر بالكشف؛ منتقي الصندوق ما يكول «لا صندوق»
// قبل التحميل؛ منتقي الجهة يكول «N من المجموع» بسقفه؛ تأكيد إلغاء القبض يسمّي الصندوق؛ «ما نعرف» تجمّد المعطيات المرسلة؛ والأرقام
// لحد يوم الخادم (to = null بطلبات الشاشات، مسجّلة من بدائل ملفّي repo تصدّر الحقيقي وتبدّل القراءات بس).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleAccounts as bundle } from './accounts-bundle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const D = 100n; // فلس بالدينار

// ── قراءات بشكل الخادم (أرقام نصوص عشرية، كما ترجّعها دوالّ report_*). جدول FOUNDATION ٦٩٥: المعمل والأفراخ.
const BOOKS_WIRE = [
  { book_id: 'b-mill', division_id: 'd-mill', division_kind: 'feed_mill', code: 'main', name: 'المعمل' },
  { book_id: 'b-chicks', division_id: 'd-hatch', division_kind: 'hatchery', code: 'chicks', name: 'الأفراخ' },
];
const cell = (bookId, closing, opening = null) => ({
  book_id: bookId,
  opening: '0',
  debit: closing > 0 ? String(closing) : '0',
  credit: closing < 0 ? String(-closing) : '0',
  closing: String(closing),
  oldest: closing === 0 ? null : '2026-09-30',
  opening_entry_id: opening ? 'e-open' : null,
  opening_amount: opening ? String(opening) : null,
});
const party = (id, name, cells, over = {}) => ({
  party_id: id,
  name,
  name_norm: name,
  phone: null,
  is_customer: true,
  is_supplier: false,
  archived: false,
  version: 1,
  total: String(cells.reduce((sum, c) => sum + Number(c.closing), 0)),
  oldest: '2026-09-30',
  cells,
  ...over,
});
// الصفحة المحمّلة: أبو علي والناقل بس. مورّد الحبوب (له 3,250,000) والفقّاسة الخارجية (له 6,500,000) ومزرعة الصفحة الثانية (عليها
// 200,000 بالمعمل) بصفحة ثانية: «لنا» و«علينا» بالملخّص كلاهما غير جمع الصفوف المحمّلة (تذييل من الصفوف ينمسك بالاثنين).
const BALANCES_WIRE = {
  books: BOOKS_WIRE,
  rows: [
    party('p-abu', 'أبو علي', [cell('b-mill', 1460000, 500000), cell('b-chicks', 8750000)], { phone: '07701234567' }),
    party('p-truck', 'الناقل', [cell('b-mill', -65000), cell('b-chicks', 0)], { is_customer: false, is_supplier: true }),
    party('p-old', 'تاجر قديم', [cell('b-mill', 0), cell('b-chicks', 0)], { archived: true }),
  ],
  next: { balance: '65000', party_id: 'p-truck' },
  total: 6,
};
const SUMMARY_WIRE = {
  to: '2026-10-30',
  divisions: [
    { division_id: 'd-mill', kind: 'feed_mill', receivable: '1660000', payable: '3315000', parties_nonzero: 4 },
    { division_id: 'd-hatch', kind: 'hatchery', receivable: '8750000', payable: '6500000', parties_nonzero: 2 },
  ],
  project: { receivable: '10410000', payable: '9815000', parties_nonzero: 5, parties_all: 6 },
  books: { visible: 2, total: 2 },
  book_totals: [
    { book_id: 'b-mill', receivable: '1660000', payable: '3315000' },
    { book_id: 'b-chicks', receivable: '8750000', payable: '6500000' },
  ],
};
const BOOK_REFS = [
  { id: 'b-mill', divisionId: 'd-mill', divisionKind: 'feed_mill', code: 'main', name: 'المعمل', goLiveOn: '2026-09-30' },
  { id: 'b-chicks', divisionId: 'd-hatch', divisionKind: 'hatchery', code: 'chicks', name: 'الأفراخ', goLiveOn: '2026-09-30' },
];
const CASH_WIRE = {
  to: '2026-10-30',
  accounts: [
    { account_id: 'c-1', name: 'القاصة', kind: 'cash', archived: false, version: 1, has_opening: true, opening: '1000000', inflow: '3000000', outflow: '1500000', closing: '2500000' },
    { account_id: 'c-2', name: 'مصرف الرافدين', kind: 'bank', archived: false, version: 1, has_opening: false, opening: '0', inflow: '0', outflow: '40000', closing: '-40000' },
    { account_id: 'c-3', name: 'صندوق قديم', kind: 'cash', archived: true, version: 2, has_opening: false, opening: '0', inflow: '100000', outflow: '0', closing: '100000' },
  ],
  total: { opening: '1000000', inflow: '3100000', outflow: '1540000', closing: '2560000' },
};

/** محتوى tbody/tfoot ووسوم الخلايا. */
const section = (html, tag) => html.split(`<${tag}>`)[1]?.split(`</${tag}>`)[0] ?? '';
const rowsOf = (html) => html.split('<tr').slice(1);
const textOf = (html) => html.replace(/<[^>]+>/g, '');

export default async function (t) {
  const m = await bundle(
    [
      "export { PartiesTable, SummaryCards, summaryFooters, partyName, default as AccountsPage } from './src/pages/accounts/AccountsPage.tsx';",
      "export { PaymentDialog, paymentProblems, SideAmount, negativeAfter, bookLabel, defaultPeriod } from './src/pages/accounts/shared.tsx';",
      "export { StatementBooks, ledgerEntries, voidable, default as PartyStatementPage } from './src/pages/accounts/PartyStatementPage.tsx';",
      "export { CashTable, boxName } from './src/pages/accounts/CashPage.tsx';",
      "export { CashLedger } from './src/pages/accounts/CashStatementPage.tsx';",
      "export { signedOpening, OpeningCell, default as OpeningBalancesPage } from './src/pages/accounts/OpeningBalancesPage.tsx';",
      // المراجعة العدائية لـWP3: بمساحات أسماء حتى كل فحص جديد يفشل لحاله على الشفرة القديمة (مو الحزمة كلها).
      "export * as shared from './src/pages/accounts/shared.tsx';",
      "export * as accountsPage from './src/pages/accounts/AccountsPage.tsx';",
      "export * as statementPage from './src/pages/accounts/PartyStatementPage.tsx';",
      "export * as cashPage from './src/pages/accounts/CashPage.tsx';",
      "export * as errors from './src/lib/errors.ts';",
      "export { parsePartyBalances, parseAccountsSummary, parseStatement, dinarText, newRef } from './src/lib/repo/parties.ts';",
      "export { parseCashBalances, parseCashStatement } from './src/lib/repo/cash.ts';",
    ].join('\n'),
  );
  const before = { accounts: globalThis.__accounts, document: globalThis.document };
  try {
    globalThis.__accounts = { loads: {}, calls: [], capture: false, session: { status: 'ready', workspace: { orgId: 'o-1', role: 'manager', userId: 'u-1' } } };
    // النافذة ترسم بـcreatePortal(…, document.body): البديل يرسمها بمكانها، وdocument.body يكفي يكون موجوداً.
    globalThis.document = { body: null };
    const render = (element) => m.renderToStaticMarkup(m.h(m.MemoryRouter, null, element));

    const page = m.parsePartyBalances(BALANCES_WIRE);
    const summary = m.parseAccountsSummary(SUMMARY_WIRE);
    t.same([page.rows.length, page.total, page.next], [3, 6, { balance: '65000', party_id: 'p-truck' }], 'صفحة الجهات من شكل الخادم: الصفوف والعدد والمؤشّر');
    t.eq(page.rows[0].cells.get('b-mill').closing, 1_460_000n * D, 'رصيد الخانة بالفلس من نصّ عشري');
    t.same(page.rows[0].cells.get('b-mill').openingEntry, { id: 'e-open', amount: 500_000n * D }, 'الافتتاح الفعّال بقيده ومبلغه');
    t.throws(() => m.parsePartyBalances({ ...BALANCES_WIRE, rows: [party('p-x', 'س', [{ ...cell('b-mill', 5), closing: 5 }])] }), 'مبلغ رقماً مو نصّاً يرمي (الفلوس نصوص عشرية بالسلك)');
    t.eq(m.dinarText(1_500_000n * D), '1500000', 'المبلغ للإرسال دينار صحيح نصّاً');
    t.throws(() => m.dinarText(150n * D + 50n), 'كسر الدينار ما ينرسل', /not_whole_dinar/);

    // ── جدول الجهات: الكلمة دائماً، والصفر «—».
    const table = render(m.h(m.PartiesTable, { page, rows: page.rows, summary, divisionId: null }));
    const body = rowsOf(section(table, 'tbody'));
    const abu = body.find((row) => row.includes('أبو علي'));
    const truck = body.find((row) => row.includes('الناقل'));
    t.ok(textOf(abu).includes('عليه1,460,000') && textOf(abu).includes('عليه8,750,000') && textOf(abu).includes('عليه10,210,000'), 'أبو علي «عليه» بكل دفتر وبالمجموع');
    t.ok(textOf(truck).includes('له65,000') && !textOf(truck).includes('-65,000'), 'الناقل «له 65,000» بالكلمة، مو بإشارة سالبة');
    const amountCells = section(table, 'tbody')
      .split('<td class="')
      .slice(1)
      .filter((chunk) => chunk.startsWith('text-right') || chunk.includes('tabular-nums'))
      .map((chunk) => textOf(`<td class="${chunk}`.split('</td>')[0]).trim());
    t.ok(amountCells.length === 9 && amountCells.every((text) => /^(عليه|له)[\d,]+$/u.test(text) || text === '—'), `كل خانة دفتر ومجموع: كلمة ورقم أو «—» (${amountCells.join(' | ')})`);
    t.ok(amountCells.filter((text) => text === '—').length === 4, 'الصفر «—» مو «0» ولا «عليه 0»');
    t.ok(body.find((row) => row.includes('تاجر قديم')).includes('تاجر قديم (مؤرشفة)'), 'المؤرشفة بعلامتها');
    const owingArchived = m.partyName({ ...page.rows[1], archived: true });
    t.eq(owingArchived, 'الناقل (مؤرشفة وعليها رصيد)', 'المؤرشفة ويّا رصيد (إلغاء بعد الأرشفة، E43) تنعلَّم');
    t.ok(/<td class="[^"]*sticky[^"]*start-0/.test(abu), 'اسم الجهة ثابت بالتمرير الأفقي');
    t.ok(abu.includes('<bdi dir="ltr">'), 'الهاتف والأرقام معزولة LTR');

    // ── التذييل من الملخّص، مو من الصفوف: الصفحة ناقصة ثلاث جهات، و«لنا» بالمعمل 1,660,000 (مو 1,460,000 من الصفوف) و«علينا»
    //    3,315,000 (مو 65,000).
    const foot = rowsOf(section(table, 'tfoot'));
    t.same(foot.map((row) => textOf(row.split('</th>')[0]).replace(/^[^>]*>/u, '').trim()), ['لنا عند الناس', 'علينا للناس'], 'صفّا التذييل باسميهما');
    t.same(foot.map((row) => [...row.matchAll(/<bdi dir="ltr">([^<]*)<\/bdi>/g)].map((match) => match[1])), [['1,660,000', '8,750,000', '10,410,000'], ['3,315,000', '6,500,000', '9,815,000']], 'أرقام التذييل لكل دفتر وللمشروع من الملخّص');
    t.ok(!section(table, 'tfoot').includes('>65,000<') && !section(table, 'tfoot').includes('>1,460,000<') && !section(table, 'tfoot').includes('>10,210,000<'), 'ولا رقم من جمع الصفوف المحمّلة («لنا» ولا «علينا»)');
    const scoped = m.summaryFooters(summary, ['b-mill', 'b-chicks'], 'd-mill');
    t.same(scoped.map((row) => textOf(m.renderToStaticMarkup(row.cells.total))), ['1,660,000', '3,315,000'], 'بفلتر الوحدة: «المجموع» بأرقام الوحدة');
    const empty = render(m.h(m.PartiesTable, { page, rows: [], summary, divisionId: null }));
    t.ok(section(empty, 'tfoot').includes('9,815,000') && empty.includes('لا جهة بهذا البحث.'), 'بحث بلا صفوف: التذييل يبقى بأرقام الملخّص');
    t.eq(section(render(m.h(m.PartiesTable, { page, rows: page.rows, summary: null, divisionId: null })), 'tfoot'), '', 'بلا ملخّص (فشل أو لحد ما يجي) ما ينرسم تذييل من الصفوف');

    // ── الصفحة كلها: العدد «N من المجموع» من الخادم، والبطاقات من الملخّص.
    globalThis.__accounts.loads = { 'o-1': { data: summary }, 'o-1|all|null||balance|false': { data: page } };
    const full = render(m.h(m.AccountsPage));
    t.ok(full.includes('3 من المجموع 6'), 'العدد من الخادم (6)، مو من الصفوف المحمّلة (3)');
    t.ok(full.includes('data-action="more-parties"'), 'صفحة جاية بالمؤشّر: «حمّل المزيد»');
    t.ok(textOf(full).includes('المشروع') && full.includes('<bdi dir="ltr">9,815,000</bdi>'), 'بطاقة المشروع بأرقام الملخّص');
    const hook = full.indexOf('data-action="open-statement"');
    t.ok(hook >= 0 && hook < full.indexOf('أبو علي</a>'), 'الإجراءات أوّل عمود (وزرّ الكشف موجود)');
    const scopedSummary = m.parseAccountsSummary({ ...SUMMARY_WIRE, books: { visible: 1, total: 7 } });
    t.ok(render(m.h(m.SummaryCards, { summary: scopedSummary })).includes('الأرقام من 1 من المجموع 7 دفاتر'), 'المحاسب المحصور (E49) يعرف إن المجموع جزئي');
    globalThis.__accounts.loads = { 'o-1': { error: new Error('boom') }, 'o-1|all|null||balance|false': { data: page } };
    const noSummary = render(m.h(m.AccountsPage));
    t.ok(noSummary.includes('تعذّر تحميل ملخّص الحسابات') && !section(noSummary, 'tfoot').includes('bdi'), 'الملخّص فشل: فشله ظاهر، وما يرسم تذييلاً من الصفوف');

    // ── «قبضنا»: الجهة ثم الدفتر أوّلاً بلا اختيار مسبق، ثم المبلغ والصندوق والتاريخ.
    const cashBalances = m.parseCashBalances(CASH_WIRE);
    const abuRow = { id: 'p-abu', version: 1, archived: false, name: 'أبو علي', phone: null, isCustomer: true, isSupplier: false };
    const dialog = (loads) => {
      globalThis.__accounts.loads = loads;
      return render(m.h(m.PaymentDialog, { kind: 'payment', party: abuRow, onClose() {}, onPosted() {} }));
    };
    const ready = { books: { data: BOOK_REFS }, boxes: { data: cashBalances }, '': { data: { parties: [], total: 0 } } };
    const html = dialog(ready);
    const bookSelect = html.indexOf('اختر الدفتر');
    t.ok(bookSelect > 0 && bookSelect < html.indexOf('inputMode="decimal"') && html.indexOf('inputMode="decimal"') < html.indexOf('اختر الصندوق'), 'الدفتر قبل المبلغ، والمبلغ قبل الصندوق');
    const options = [...html.matchAll(/<option value="([^"]*)"( selected="")?>/g)].map((match) => [match[1], Boolean(match[2])]);
    t.same(options.filter(([, selected]) => selected).map(([value]) => value), ['', ''], 'لا دفتر ولا صندوق مختار مسبقاً (الخيار الفارغ مختار)');
    const single = dialog({ ...ready, books: { data: [BOOK_REFS[0]] } });
    t.ok(/<option value=""[^>]*selected=""[^>]*>اختر الدفتر/.test(single) && !/<option value="b-mill" selected=""/.test(single), 'حتى بدفتر واحد ما ينختار لحاله');
    t.ok(html.includes('المفقس: الأفراخ') && html.includes('القاصة (الرصيد 2,500,000)') && !html.includes('صندوق قديم'), 'الدفاتر بأسمائها، والصناديق الفعّالة برصيدها');
    const review = (markup) => markup.match(/<button[^>]*data-action="review-payment"[^>]*>/)?.[0] ?? '';
    t.ok(review(html) !== '' && !review(html).includes('disabled=""'), 'القوائم جاهزة: «عاين التوزيع» متاح');
    for (const [label, loads] of [
      ['قائمة الدفاتر فشلت', { ...ready, books: { error: new Error('boom') } }],
      ['قائمة الصناديق فشلت', { ...ready, boxes: { error: new Error('boom') } }],
      ['القوائم لسّه تتحمّل', { '': { data: { parties: [], total: 0 } } }],
    ]) {
      const markup = dialog(loads);
      t.ok(review(markup).includes('disabled=""'), `${label}: الإرسال معطّل`);
    }
    const failedBooks = dialog({ ...ready, books: { error: new Error('boom') } });
    t.ok(failedBooks.includes('تعذّر تحميل قائمة الدفاتر') && failedBooks.includes('لا يُرسل شيء قبل تحميل الدفاتر والصناديق') && !failedBooks.includes('اختر الدفتر'), 'القائمة الفاشلة تبين فشلها بمكانها، مو قائمة فارغة');
    const payout = (globalThis.__accounts.loads = ready, render(m.h(m.PaymentDialog, { kind: 'payout', party: abuRow, onClose() {}, onPosted() {} })));
    t.ok(payout.includes('data-action="review-payout"') && payout.includes('دفعنا'), '«دفعنا» بنفس النافذة');

    // قواعد النموذج قبل المعاينة: الدفتر مطلوب، المبلغ دينار صحيح، والتاريخ لحد 7 أيام.
    const form = { party: abuRow, bookId: '', amount: '1,000,000', accountId: 'c-1', day: '30/10/2026' };
    t.eq(m.paymentProblems(form, '2026-10-30').errors.book, 'اختر الدفتر أوّلاً.', 'بلا دفتر: «اختر الدفتر أوّلاً»');
    t.ok(m.paymentProblems({ ...form, bookId: 'b-mill', amount: '1,000.5' }, '2026-10-30').errors.amount !== undefined, 'كسر الدينار مرفوض قبل الإرسال');
    t.ok(m.paymentProblems({ ...form, bookId: 'b-mill', day: '22/10/2026' }, '2026-10-30').errors.day !== undefined, 'أقدم من 7 أيام مرفوض');
    t.same(m.paymentProblems({ ...form, bookId: 'b-mill', day: '23/10/2026' }, '2026-10-30').input, { partyId: 'p-abu', bookId: 'b-mill', amount: 1_000_000n * D, accountId: 'c-1', onDate: '2026-10-23' }, 'نموذج سليم بيومه السابع');
    t.eq(m.negativeAfter('payout', cashBalances.accounts[1], 10_000n * D), -50_000n * D, 'دفع يخلّي الصندوق سالباً: تنبيه برصيده بعدها');
    t.eq(m.negativeAfter('payment', cashBalances.accounts[1], 10_000n * D), null, 'القبض ما يخلّي صندوقاً سالباً');

    // ── الكشف والطباعة: 150 سطراً كلها بالجدول (الطباعة ما تقصّ)، والمنطقة المطبوعة معلَّمة.
    const lines = Array.from({ length: 150 }, (_, i) => ({ entry_id: `e-${i}`, on_date: '2026-10-01', kind: i % 2 ? 'payment' : 'invoice', doc_no: i % 2 ? `RC-2026-${String(i).padStart(4, '0')}` : null, reason: null, reverses: null, reversed: false, debit: i % 2 ? '0' : '20000', credit: i % 2 ? '10000' : '0', balance: '0' }));
    const statementWire = {
      party: { id: 'p-abu', name: 'أبو علي', phone: '07701234567', archived: false, version: 3, is_customer: true, is_supplier: false },
      from: '2026-01-01',
      to: '2026-10-30',
      books: [
        { book_id: 'b-mill', code: 'main', name: 'المعمل', division_kind: 'feed_mill', brought_forward: '500000', total_debit: '1500000', total_credit: '750000', closing: '1250000', lines },
        { book_id: 'b-chicks', code: 'chicks', name: 'الأفراخ', division_kind: 'hatchery', brought_forward: '0', total_debit: '0', total_credit: '0', closing: '0', lines: [] },
      ],
    };
    const statement = m.parseStatement(statementWire);
    const books = render(m.h(m.StatementBooks, { statement }));
    const millTable = books.split('data-book="b-mill"')[1].split('data-book="b-chicks"')[0];
    t.eq(rowsOf(section(millTable, 'tbody')).length, 151, 'كل السطور الـ150 ويّا «رصيد سابق»: ماكو تقطيع ولا صفحات بالكشف');
    t.ok(textOf(millTable).includes('رصيد سابق') && millTable.includes('1,250,000'), 'المدوَّر من الخادم، والرصيد الأخير = رصيد الدفتر');
    t.same([...books.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((match) => match[1]), ['دفتر معمل العلف', 'دفتر المفقس: الأفراخ'], 'جدول لكل دفتر بعنوان دفتره (E50)، والدفتر بلا قيود يبقى');
    const headers = [...millTable.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    t.same(headers, ['التاريخ', 'المستند', 'البيان', 'عليه', 'له', 'الرصيد'], 'الكشف بستّة أعمدة بالضبط');
    t.ok(/class="max-h-\[70dvh\] overflow-auto/.test(millTable), 'الجدول بغلاف overflow-auto (print.css يشيل حدّه بالطباعة)');
    t.eq(m.voidable(statement.books[0].lines[1]), 'payment', 'القبض ينلغى من الكشف');
    // الصفحة كلها: المنطقة المطبوعة بيها الكشف كلّه، والأزرار والفلتر والقيود الملغاة برّا الطباعة.
    const period = m.defaultPeriod();
    globalThis.__accounts.loads = { [`||${period.from}|${period.to}`]: { data: statement }, books: { data: BOOK_REFS } };
    const statementPage = render(m.h(m.PartyStatementPage));
    const printArea = statementPage.split('data-print-area=')[1] ?? '';
    t.ok(printArea !== '' && rowsOf(section(printArea.split('data-book="b-mill"')[1], 'tbody')).length === 151, 'المنطقة المطبوعة بيها كل سطور الكشف');
    const hidden = statementPage.split('data-print="hide"').length - 1;
    t.ok(hidden >= 4 && /data-print="hide"[^>]*>[\s\S]*data-action="print-statement"/.test(statementPage), `الأزرار والفلتر والرجوع وقائمة الإلغاء برّا الطباعة (${hidden})`);
    const printCss = readFileSync(path.join(ROOT, 'src/pages/accounts/print.css'), 'utf8');
    t.ok(/@media print[\s\S]*\[data-print-area\] \.overflow-auto \{\s*max-height: none;\s*overflow: visible;/u.test(printCss), 'الطباعة تشيل حدّ الارتفاع والتمرير عن كل جدول بالمنطقة المطبوعة');
    t.ok(/\[data-print='hide'\] \{\s*display: none !important;/u.test(printCss) && /body:has\(\[data-print-area\]\) \*/u.test(printCss), 'وتخفي الأزرار والفلاتر وكل شي برّا المنطقة');
    t.ok(readFileSync(path.join(ROOT, 'src/pages/accounts/AccountsRoutes.tsx'), 'utf8').includes("import './print.css';"), 'ملف الطباعة ينحمّل ويّا قسم الحسابات');

    // ── الصناديق: «وارد | صادر»، والسالب بإشارته وبعلامة، والمؤرشف ويّا رصيد بعلامته، والمجموع من الخادم.
    const cashTable = render(m.h(m.CashTable, { balances: cashBalances }));
    t.ok(textOf(cashTable).includes('سالب-40,000'), 'الصندوق السالب بإشارته وبكلمة «سالب» (Q10)');
    t.ok(cashTable.includes('صندوق قديم (مؤرشف وعليه رصيد)'), 'المؤرشف ويّا رصيد بعلامته (E43)');
    t.ok(section(cashTable, 'tfoot').includes('2,560,000') && section(cashTable, 'tfoot').includes('3,100,000'), 'مجموع الصناديق من الخادم');
    const cashStatement = m.parseCashStatement({
      account: { id: 'c-2', name: 'مصرف الرافدين', kind: 'bank', archived: false, version: 1 },
      from: '2026-01-01',
      to: '2026-10-30',
      brought_forward: '10000',
      total_in: '0',
      total_out: '50000',
      closing: '-40000',
      lines: [{ move_id: 'm-1', on_date: '2026-10-20', kind: 'party_payout', doc_no: 'PY-2026-0001', party: 'الناقل', note: null, reverses: null, reversed: false, inflow: '0', outflow: '50000', balance: '-40000' }],
    });
    const cashLedger = render(m.h(m.CashLedger, { statement: cashStatement }));
    t.same([...cashLedger.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]), ['التاريخ', 'المستند', 'البيان', 'وارد', 'صادر', 'الرصيد'], 'كشف الصندوق «وارد | صادر» (Q12)');
    t.ok(cashLedger.includes('<bdi dir="ltr">-40,000</bdi>') && !textOf(cashLedger).includes('عليه'), 'رصيد الصندوق بإشارته بلا «عليه/له»');
    t.ok(textOf(cashLedger).includes('دفع لجهة: الناقل'), 'البيان نوع الحركة والجهة');

    // ── أرصدة الافتتاح: «عليه / له» بزرّ بدل الإشارة، والخانة بافتتاح فعّال تعرضه ويّا «ألغِ».
    t.same([m.signedOpening('500,000', 'debit'), m.signedOpening('500,000', 'credit'), m.signedOpening('0', 'debit'), m.signedOpening('12.5', 'debit')], [500_000n * D, -500_000n * D, null, null], 'الجهة تعطي الإشارة، والصفر والكسر مرفوضان');
    const opened = render(m.h(m.OpeningCell, { row: page.rows[0], book: BOOK_REFS[0], draft: undefined, busy: false, onDraft() {}, onSave() {}, onVoid() {} }));
    t.ok(textOf(opened).includes('عليه500,000') && opened.includes('data-action="void-opening"'), 'افتتاح فعّال: مبلغه بكلمته وزرّ الإلغاء');
    const blank = render(m.h(m.OpeningCell, { row: page.rows[1], book: BOOK_REFS[0], draft: undefined, busy: false, onDraft() {}, onSave() {}, onVoid() {} }));
    t.ok(blank.includes('عليه') && blank.includes('له') && /<button[^>]*disabled=""[^>]*data-action="save-opening"/.test(blank), 'خانة فارغة: زرّ الجهة، و«سجّل» معطّل بلا مبلغ');
    const noGoLive = render(m.h(m.OpeningCell, { row: page.rows[1], book: { ...BOOK_REFS[0], goLiveOn: null }, draft: undefined, busy: false, onDraft() {}, onSave() {}, onVoid() {} }));
    t.ok(noGoLive.includes('حدّد يوم التشغيل أوّلاً') && !noGoLive.includes('<input'), 'بلا يوم تشغيل ماكو افتتاح');

    // ── المراجعة العدائية لـWP3. كل فحص لحاله: رمي الشفرة (دالّة ما موجودة) فشل باسمه، مو انهيار الملف.
    const check = (label, fn) => {
      try {
        const verdict = fn();
        t.ok(verdict === true, verdict === true ? label : `${label} (${JSON.stringify(verdict)})`);
      } catch (error) {
        t.ok(false, `${label}: رمى ${error.message}`);
      }
    };
    const S = m.shared;
    const button = (markup, action) => markup.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`))?.[0] ?? '';

    // التسوية والإعفاء: معاينة بنفس المحرّك (FOUNDATION ٧٧٠) ثم تأكيد يسمّي الجهة والدفتر والمبلغ، مو ترحيل من النموذج.
    check('معاينة التسوية بمبلغها موقّعاً («له» سالب)، والإعفاء موجباً والخادم يعكس الرصيد', () => {
      const credit = S.adjustPreviewArgs('adjust', { direction: 'credit', amount: 5_000n * D });
      const debit = S.adjustPreviewArgs('adjust', { direction: 'debit', amount: 5_000n * D });
      const forgive = S.adjustPreviewArgs('forgive', { direction: 'debit', amount: 5_000n * D });
      return JSON.stringify([credit, debit, forgive], (_, v) => (typeof v === 'bigint' ? `${v}` : v)) === JSON.stringify([{ kind: 'adjustment', amount: '-500000' }, { kind: 'adjustment', amount: '500000' }, { kind: 'forgiveness', amount: '500000' }]) || [credit, debit, forgive];
    });
    for (const mode of ['adjust', 'forgive']) {
      check(`${mode}: النموذج يعاين قبل أي ترحيل (زرّه «عاين التوزيع»، مو «سجّل»)`, () => {
        const markup = render(m.h(S.AdjustDialog, { mode, party: { id: 'p-abu', name: 'أبو علي' }, book: BOOK_REFS[0], onClose() {}, onPosted() {} }));
        return (button(markup, `review-${mode}`) !== '' && button(markup, `confirm-${mode}`) === '' && markup.includes('عاين التوزيع')) || markup.slice(-400);
      });
    }
    const preview = { amount: -500_000n * D, balanceBefore: 1_460_000n * D, balanceAfter: 960_000n * D, allocations: [{ entryId: 'e-open', kind: 'opening', docNo: null, onDate: '2026-09-30', amount: 500_000n * D }], surplus: 0n };
    check('تأكيد التسوية يسمّي الجهة والدفتر والمبلغ والقيد المسدود ورصيد الجهة بعدها', () => {
      const sentence = S.adjustSentence('adjust', 'أبو علي', 'معمل العلف', { direction: 'credit', amount: 500_000n * D });
      const text = textOf(render(m.h(S.AllocationSummary, { sentence, preview })));
      return (text.includes('«له» 500,000') && text.includes('«أبو علي»') && text.includes('«معمل العلف»') && text.includes('رصيد افتتاحي') && text.includes('عليه960,000')) || text;
    });
    check('جملة الإعفاء تسمّي الجهة والمبلغ والدفتر', () => {
      const sentence = S.adjustSentence('forgive', 'أبو علي', 'معمل العلف', { direction: 'debit', amount: 1_000n * D });
      return (sentence.includes('«أبو علي»') && sentence.includes('1,000') && sentence.includes('«معمل العلف»')) || sentence;
    });
    // الافتتاح والنقل بالصناديق: تأكيد يسمّي الصندوق (والصندوقين) والمبلغ قبل الترحيل.
    const box = cashBalances.accounts[0];
    check('افتتاح الصندوق: النموذج يراجع ثم يؤكّد (مو «سجّل» يرحّل مباشرة)', () => {
      const markup = render(m.h(m.cashPage.OpeningDialog, { box, onClose() {}, onSaved() {} }));
      return (button(markup, 'review-cash-opening') !== '' && button(markup, 'save-cash-opening') === '') || markup.slice(-300);
    });
    check('النقل: النموذج يراجع ثم يؤكّد', () => {
      const markup = render(m.h(m.cashPage.TransferDialog, { accounts: cashBalances.accounts, onClose() {}, onSaved() {} }));
      return (button(markup, 'review-transfer') !== '' && button(markup, 'save-transfer') === '') || markup.slice(-300);
    });
    check('جملتا تأكيد الافتتاح والنقل تسمّيان الصندوق والمبلغ واليوم', () => {
      const opening = m.cashPage.cashOpeningSentence('القاصة', -40_000n * D, '2026-09-30');
      const transfer = m.cashPage.transferSentence('القاصة', 'مصرف الرافدين', 300_000n * D, '2026-10-30');
      return (opening.includes('سالب') && opening.includes('40,000') && opening.includes('«القاصة»') && opening.includes('30/09/2026') && transfer.includes('«القاصة»') && transfer.includes('«مصرف الرافدين»') && transfer.includes('300,000')) || [opening, transfer];
    });

    // فلتر الدفتر بالكشف (FOUNDATION ١١٤ و٧٨٨): «الكل» ودفتر دفتر، والدفتر بالرابط، والكشف المفلتر جدول واحد، والفلتر برّا الطباعة.
    const periodNow = m.defaultPeriod();
    const millOnly = { ...statement, books: [statement.books[0]] };
    check('كشف مفلتر بدفتر المعمل (?book=b-mill): جدول دفتر واحد، والقائمة مختار بيها المعمل، وبرّا الطباعة', () => {
      globalThis.__accounts.loads = { [`|b-mill|${periodNow.from}|${periodNow.to}`]: { data: millOnly }, books: { data: BOOK_REFS } };
      const markup = m.renderToStaticMarkup(m.h(m.MemoryRouter, { initialEntries: ['/accounts/parties/x?book=b-mill'] }, m.h(m.PartyStatementPage)));
      const tables = (markup.match(/data-book="/g) ?? []).length;
      const filter = markup.split('data-action="statement-book"')[1]?.split('</select>')[0] ?? '';
      const at = markup.indexOf('data-action="statement-book"');
      const hidden = at > 0 && at - markup.lastIndexOf('data-print="hide"', at) < 600;
      return (tables === 1 && /<option value="b-mill" selected="">/.test(filter) && filter.includes('>الكل<') && hidden) || { tables, hidden, filter: filter.slice(0, 200) };
    });
    check('بلا ?book: «الكل» مختار، والكشف كل الدفاتر', () => {
      globalThis.__accounts.loads = { [`||${periodNow.from}|${periodNow.to}`]: { data: statement }, books: { data: BOOK_REFS } };
      const markup = render(m.h(m.PartyStatementPage));
      return ((markup.match(/data-book="/g) ?? []).length === 2 && /<option value="" selected="">الكل<\/option>/.test(markup)) || markup.slice(0, 200);
    });

    // تأكيد إلغاء القبض أو الدفع يسمّي الصندوق واتّجاه الحركة العكسية (FOUNDATION ٧٦٦).
    const payLine = { ...statement.books[0].lines[1], account: 'القاصة' };
    check('إلغاء قبض: «ويخرج 10,000 من «القاصة» بتاريخ اليوم»', () => {
      const text = m.statementPage.voidConsequence(payLine, 'معمل العلف');
      return (text.includes('«معمل العلف»') && text.includes('ويخرج 10,000 من «القاصة»') && text.includes('بتاريخ اليوم')) || text;
    });
    check('إلغاء دفع: «ويعود … إلى الصندوق»، وإلغاء قيد غير القبض والدفع بلا صندوق', () => {
      const payout = m.statementPage.voidConsequence({ ...payLine, kind: 'payout' }, 'معمل العلف');
      const entry = m.statementPage.voidConsequence({ ...statement.books[0].lines[0], kind: 'opening', account: null }, 'معمل العلف');
      return (payout.includes('ويعود 10,000 إلى «القاصة»') && !entry.includes('صندوق')) || [payout, entry];
    });

    // منتقي الصندوق: «لا صندوق فعّالاً» بعد قراءة ناجحة فارغة بس، مو والقائمة تتحمّل (FOUNDATION ٧٦٧).
    const noBoxHint = 'لا صندوق فعّالاً بعد';
    check('«قبضنا» والصناديق تتحمّل: ما يكول «لا صندوق فعّالاً بعد»', () => {
      const markup = dialog({ books: { data: BOOK_REFS }, '': { data: { parties: [], total: 0 } } });
      return !markup.includes(noBoxHint) || 'قال لا صندوق';
    });
    check('ضابط: الصناديق انقرت وكلها مؤرشفة: يكولها', () => dialog({ ...ready, boxes: { data: { ...cashBalances, accounts: [cashBalances.accounts[2]] } } }).includes(noBoxHint));

    // منتقي الجهة: سقف 20 يتقال «20 من المجموع 35» (FOUNDATION ٧٧٥)، وبلا سقف ما يتقال.
    const twenty = Array.from({ length: 20 }, (_, i) => ({ ...abuRow, id: `p-${i}`, name: `أبو ${i}` }));
    check('منتقي الجهة بسقفه: «20 من المجموع 35» ويّا «اكتب أكثر»', () => {
      globalThis.__accounts.loads = { ...ready, '': { data: { parties: twenty, total: 35 } } };
      const text = textOf(render(m.h(m.PaymentDialog, { kind: 'payment', party: null, onClose() {}, onPosted() {} })));
      return (text.includes('20 من المجموع 35') && text.includes('اكتب أكثر') && text.includes('أبو 19')) || text.slice(0, 300);
    });
    check('ضابط: كل النتائج ظاهرة: بلا «من المجموع»', () => {
      globalThis.__accounts.loads = { ...ready, '': { data: { parties: twenty, total: 20 } } };
      return !textOf(render(m.h(m.PaymentDialog, { kind: 'payment', party: null, onClose() {}, onPosted() {} }))).includes('من المجموع');
    });

    // فلتر الوحدة من قائمة الدفاتر، مو من الملخّص: الملخّص الفاشل أو اللي لسّه ما وصل ما يقلب «المعمل» لكل الدفاتر.
    check('وحدة الفلتر: الكل null، والقائمة تتحمّل undefined (ما ينطلب الجدول)، وبعدها معرّف الوحدة', () => {
      const P = m.accountsPage;
      const got = [P.filterDivision('all', null), P.filterDivision('feed_mill', null), P.filterDivision('feed_mill', BOOK_REFS), P.filterDivision('hatchery', BOOK_REFS)];
      return JSON.stringify(got) === JSON.stringify([null, undefined, 'd-mill', 'd-hatch']) || got;
    });
    // القارئ المحصور (E49): وحدات نطاقه بس بالبطاقات والفلتر، والمشروع «دفاتر نطاقك»، ووحدة برّا الملخّص بلا تذييل.
    const scopedOnly = m.parseAccountsSummary({ ...SUMMARY_WIRE, divisions: [SUMMARY_WIRE.divisions[0]], books: { visible: 1, total: 7 } });
    check('المحصور: بطاقة المشروع «دفاتر نطاقك فقط» وبطاقة المعمل بس، مو «المفقس 0 / 0»', () => {
      const text = textOf(render(m.h(m.SummaryCards, { summary: scopedOnly })));
      return (text.includes('المشروع: دفاتر نطاقك فقط') && text.includes('المعمل') && !text.includes('المفقس')) || text;
    });
    check('المحصور: خيارات الفلتر «الكل» ووحدات نطاقه، وقبل الملخّص كل الوحدات', () => {
      const scopedOptions = m.accountsPage.filterOptions(scopedOnly);
      return (JSON.stringify(scopedOptions) === JSON.stringify(['all', 'feed_mill']) && m.accountsPage.filterOptions(null).length === 7) || scopedOptions;
    });
    check('وحدة مو بالملخّص (برّا النطاق): بلا صفّي تذييل، مو «0»', () => m.summaryFooters(scopedOnly, ['b-chicks'], 'd-hatch').length === 0);

    // الأرقام لحد يوم الخادم: الشاشات تطلب to = null (الخادم يحسب app_today)، فالصفحة المفتوحة من أمس تشوف قبض اليوم.
    check('صفحة الحسابات والصناديق وأرصدة الافتتاح ونافذة القبض: to = null بكل طلب أرصدة', () => {
      globalThis.__accounts.calls = [];
      globalThis.__accounts.capture = true;
      globalThis.__accounts.loads = { books: { data: BOOK_REFS }, boxes: { data: cashBalances } };
      try {
        render(m.h(m.AccountsPage));
        render(m.h(m.cashPage.default));
        render(m.h(m.OpeningBalancesPage));
        render(m.h(m.PaymentDialog, { kind: 'payment', party: abuRow, onClose() {}, onPosted() {} }));
      } finally {
        globalThis.__accounts.capture = false;
      }
      const tos = globalThis.__accounts.calls.map(([name, args]) => [name, name === 'loadPartyBalances' ? args[0].to : args[1]]);
      const names = new Set(tos.map(([name]) => name));
      return (['loadAccountsSummary', 'loadPartyBalances', 'loadCashBalances'].every((name) => names.has(name)) && tos.every(([, to]) => to === null)) || tos;
    });

    // «ما نعرف» (FOUNDATION ٥١٩): المعطيات المرسلة تتجمّد ويّا مرجعها، والإعادة بيها بالضبط؛ ref_reused = سُجّلت؛ الرفض مرجع جديد.
    const E = m.errors;
    const sent = { input: { amount: 1_000_000n }, summary: 'قبض 1,000,000 دينار من «أبو علي» بدفتر «معمل العلف».' };
    check('بعد «ما نعرف»: نفس المرجع والمعطيات تتجمّد؛ ref_reused: سُجّلت؛ رفض آخر: مرجع جديد؛ ما وصل: كما هي', () => {
      const attempt = S.freshAttempt();
      const unknown = S.afterFailure(attempt, sent, new E.UnknownOutcomeError('timeout'));
      const reused = S.afterFailure(unknown, sent, new E.RejectedError('ref_reused', 'مرجع هذه العملية استُعمل'));
      const rejected = S.afterFailure(unknown, sent, new E.RejectedError('period_locked', 'مقفلة'));
      const offline = S.afterFailure(unknown, sent, new E.NetworkError());
      return (unknown.ref === attempt.ref && unknown.frozen === sent && reused === 'recorded' && rejected.ref.clientRef !== attempt.ref.clientRef && rejected.frozen === null && offline === unknown) || { unknown, reused, rejected };
    });
    // الإعادة بنفس المرجع والمعطيات حتى لو المستخدم عدّل النموذج: ثلاث محاولات متتالية بالمنطق نفسه اللي تمشي بيه النوافذ.
    const posts = [];
    const replies = [new E.UnknownOutcomeError('timeout'), new E.RejectedError('ref_reused', null)];
    const post = async (ref, input) => {
      posts.push([ref.clientRef, ref.id, input.amount]);
      const reply = replies.shift();
      if (reply) throw reply;
      return { ok: true };
    };
    let firstTry = null;
    let secondTry = null;
    let flowError = null;
    try {
      const flow = S.freshAttempt();
      firstTry = await S.runAttempt(flow, sent, post);
      const edited = { input: { amount: 100_000n }, summary: 'تعديل' };
      secondTry = await S.runAttempt(firstTry.next, firstTry.next.frozen ?? edited, post);
    } catch (error) {
      flowError = error;
    }
    check('«ما نعرف» ثم إعادة: بنفس المرجع والمعرّف والمبلغ المرسل أوّلاً (مو المعدّل)، وref_reused بعدها = سُجّلت، بلا مرجع جديد يضاعف', () => {
      if (flowError) throw flowError;
      const [a, b] = posts;
      return (firstTry.outcome.kind === 'failed' && a[0] === b[0] && a[1] === b[1] && b[2] === 1_000_000n && secondTry.outcome.kind === 'recorded' && posts.length === 2) || { posts: posts.map((p) => p.map(String)), first: firstTry.outcome.kind, second: secondTry.outcome.kind };
    });
    // المحاولة المجمّدة باقية بعد إغلاق النافذة: «قبضنا» ينفتح بيها، بلا نموذج قابل للتعديل، وزرّه «أعد المحاولة».
    check('«قبضنا» بمحاولة مجمّدة: جملتها وزرّ «أعد المحاولة»، بلا حقل مبلغ ولا منتقي', () => {
      S.rememberAttempt('u-1|pay:payment', { ref: m.newRef(), frozen: sent });
      try {
        globalThis.__accounts.loads = ready;
        const markup = render(m.h(m.PaymentDialog, { kind: 'payment', party: abuRow, onClose() {}, onPosted() {} }));
        return (button(markup, 'retry-payment') !== '' && !markup.includes('inputMode="decimal"') && !markup.includes('اختر الدفتر') && textOf(markup).includes(sent.summary)) || textOf(markup).slice(0, 300);
      } finally {
        S.rememberAttempt('u-1|pay:payment', S.freshAttempt());
      }
    });
    check('ضابط: بلا محاولة مجمّدة النموذج نفسه', () => {
      globalThis.__accounts.loads = ready;
      const markup = render(m.h(m.PaymentDialog, { kind: 'payment', party: abuRow, onClose() {}, onPosted() {} }));
      return (button(markup, 'retry-payment') === '' && markup.includes('inputMode="decimal"')) || 'نموذج مفقود';
    });
    check('التسوية والإلغاء بمحاولة مجمّدة: «أعد المحاولة» بلا حقول', () => {
      S.rememberAttempt('u-1|adjust:p-abu:b-mill', { ref: m.newRef(), frozen: { input: {}, summary: 'تسوية مجمّدة.' } });
      S.rememberAttempt('u-1|void:e-1', { ref: m.newRef(), frozen: { input: 'خطأ', summary: 'إلغاء مجمّد.' } });
      try {
        const adjust = render(m.h(S.AdjustDialog, { mode: 'adjust', party: { id: 'p-abu', name: 'أبو علي' }, book: BOOK_REFS[0], onClose() {}, onPosted() {} }));
        const voiding = render(m.h(S.VoidDialog, { slot: 'e-1', title: 'إلغاء قبض', consequence: 'نتيجة', run: async () => {}, onClose() {}, onDone() {} }));
        return (button(adjust, 'retry-adjust') !== '' && !adjust.includes('inputMode="decimal"') && button(voiding, 'retry-void') !== '' && textOf(voiding).includes('إلغاء مجمّد.') && !voiding.includes('maxLength="500"')) || [textOf(adjust).slice(0, 200), textOf(voiding).slice(0, 200)];
      } finally {
        S.rememberAttempt('u-1|adjust:p-abu:b-mill', S.freshAttempt());
        S.rememberAttempt('u-1|void:e-1', S.freshAttempt());
      }
    });

    // ── اختبار الطفرات لـWP3: قواعد ما كان يمسكها فحص (كل واحد يفشل على الشفرة المكسورة لحاله) ─────────────────────────
    // سطر العكس (reverses من الخادم) وأصله الملغى (reversed) ما ينلغيان مرّة ثانية، وبيان العكس «إلغاء …».
    check('الكشف: سطر العكس وأصله الملغى بلا زرّ إلغاء، وبيان العكس «إلغاء …»', () => {
      const pair = [
        { ...lines[1], entry_id: 'e-pay', reversed: true },
        { ...lines[1], entry_id: 'e-back', reverses: 'e-pay', debit: '10000', credit: '0' },
      ];
      const parsed = m.parseStatement({ ...statementWire, books: [{ ...statementWire.books[0], lines: pair }] }).books[0].lines;
      const got = [parsed.map((line) => m.voidable(line)), parsed.map((line) => line.reverses), m.statementPage.lineMemo(parsed[1]).startsWith('إلغاء')];
      return JSON.stringify(got) === JSON.stringify([[null, null], [false, true], true]) || got;
    });
    check('الكشف: الافتتاح والتسوية والإعفاء تنلغى بـ«ألغِ القيد»، والقبض والدفع بإلغاء القبض، وغيرها من مستندها', () => {
      const kinds = ['opening', 'adjustment', 'forgiveness', 'payment', 'payout', 'invoice', 'purchase'];
      const got = kinds.map((kind) => m.voidable({ ...statement.books[0].lines[0], kind, reverses: false, reversed: false }));
      return JSON.stringify(got) === JSON.stringify(['entry', 'entry', 'entry', 'payment', 'payment', null, null]) || got;
    });
    // مراجعة WP7: تسوية تتبع مستنداً (تصحيح سعر) تُلغى من مستندها (الخادم يرفضها من الكشف)، ودفع الاستلام يبقى يُلغى من الكشف (E44).
    check('الكشف: تسوية تصحيح السعر بلا زرّ إلغاء، ودفع الاستلام بإلغاء القبض، ونوع المستند من الخادم', () => {
      const owned = [{ ...lines[1], entry_id: 'e-rev', kind: 'adjustment', doc_kind: 'receipt_revalue' }, { ...lines[1], entry_id: 'e-paid', kind: 'payout', doc_kind: 'receipt' }, { ...lines[1], entry_id: 'e-adj', kind: 'adjustment' }];
      const parsed = m.parseStatement({ ...statementWire, books: [{ ...statementWire.books[0], lines: owned }] }).books[0].lines;
      const got = [parsed.map((line) => m.voidable(line)), parsed.map((line) => line.docKind)];
      return JSON.stringify(got) === JSON.stringify([[null, 'payment', 'entry'], ['receipt_revalue', 'receipt', null]]) || got;
    });
    // الدفع اللي يخلّي الصندوق صفراً بالضبط مو سالباً (Q10: التنبيه للسالب بس).
    check('دفع يخلّي الصندوق صفراً بالضبط: ماكو تنبيه سالب', () => {
      const box = { ...cashBalances.accounts[0], closing: 10_000n * D };
      return m.negativeAfter('payout', box, 10_000n * D) === null && m.negativeAfter('payout', box, 10_001n * D) === -1n * D;
    });
    check('نموذج القبض: تاريخ بعد اليوم مرفوض، والمبلغ صفر مرفوض', () => {
      const base = { party: abuRow, bookId: 'b-mill', amount: '1,000', accountId: 'c-1', day: '30/10/2026' };
      const tomorrow = m.paymentProblems({ ...base, day: '31/10/2026' }, '2026-10-30');
      const zero = m.paymentProblems({ ...base, amount: '0' }, '2026-10-30');
      const good = m.paymentProblems(base, '2026-10-30');
      return (tomorrow.errors.day !== undefined && tomorrow.input === null && zero.errors.amount !== undefined && zero.input === null && good.input !== null) || { tomorrow: tomorrow.errors, zero: zero.errors };
    });
    // تعديل الجهة يرسل الحقول المتغيّرة بس (FOUNDATION ٨١٧)، والجهة نفسها مو توأم نفسها.
    check('تعديل الجهة: الحقول المتغيّرة بس، والجهة المعدَّلة مو توأماً لنفسها', () => {
      const before = { name: 'أبو علي', phone: '07701234567', is_customer: true, is_supplier: false };
      const patch = S.changedPartyFields(before, { ...before, name: 'أبو علي الحدّاد' });
      const twins = [{ id: 'p-abu', name: 'أبو علي', archived: false, sameName: true, samePhone: true }, { id: 'p-x', name: 'أبو علي', archived: false, sameName: true, samePhone: false }];
      const others = S.partyTwinsOf(twins, 'p-abu').map((twin) => twin.id);
      return (JSON.stringify(patch) === JSON.stringify({ name: 'أبو علي الحدّاد' }) && JSON.stringify(S.changedPartyFields(before, { ...before })) === '{}' && JSON.stringify(others) === '["p-x"]') || { patch, others };
    });
    check('صندوق محفظة (wallet) ينقرا من شكل الخادم', () => {
      const wallet = m.parseCashBalances({ ...CASH_WIRE, accounts: [{ ...CASH_WIRE.accounts[0], account_id: 'c-w', name: 'زين كاش', kind: 'wallet' }] });
      return wallet.accounts[0].kind === 'wallet' || wallet.accounts;
    });
  } finally {
    globalThis.__accounts = before.accounts;
    if (before.document === undefined) delete globalThis.document;
    else globalThis.document = before.document;
  }
}
