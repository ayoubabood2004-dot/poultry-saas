// قائمة الذمم (عقد 0024 F3 و§4.3، الخطّة §8.1 «1-ج» و§9.4): react-dom الحقيقي يرسم DebtsPage الحقيقية وrepo/debts الحقيقي (المحلّل وبناء النداء)
// على core بديل يجيب بعيّنات القاعدة الحقيقية من fixtures/money-b.json (debts_overview.receivable وpayable). كلّ قيمة منتظرة تُحسب هنا من العيّنة لا
// من نصّ بخطّ اليد، فتبقى الحالات صحيحة إذا أُعيد توليد العيّنة؛ والفروع التي تخلو منها العيّنة (صفحة ثانية بمؤشّر وجهة مكرّرة بين الصفحتين،
// والقارئ بلا «قبضنا») تُبنى من نسخة منها. الحالات: P المحلّل وصرامته؛ T التبويبان والمجموع وتوزيعه على الأعمار ودليل الألوان؛ R الصفوف (الاسم
// يفتح الكشف برجوع القائمة، والرصيد وتحته رصيد كلّ حساب إن تعدّدت، والأعمار وعمر أقدم دين بلون فئته، وآخر حركة وآخر تسديد، والتذييل من الخادم)؛
// A الأفعال السريعة (الكشف، و«قبضت منه» أو «دفعت له» بنافذة القبض والدفع، و«اتّصل» للهاتف وحده، و«أرسل الكشف»)؛ F الفلاتر والترتيب في النداء؛
// G الصفحات بلا تكرار جهة.
import {
  BUCKETS,
  bucketOf,
  bundle,
  byAction,
  choose,
  click,
  clone,
  createEnv,
  daysWord,
  FIXTURE,
  fils,
  fire,
  first,
  fmtDay,
  installDom,
  money,
  SESSION,
  setupTables,
  side,
  tableOf,
  tablesIn,
  text,
  typeIn,
} from './money-b-dom.mjs';

const D = FIXTURE.debts_overview;
const BACK = (sideName, over90 = false) => `/accounts/debts?side=${sideName}${over90 ? '&over90=1' : ''}`;
const statementHref = (partyId, back, send = false) => `/accounts/parties/${partyId}?${send ? 'send=1&' : ''}back=${encodeURIComponent(back)}`;
const LABEL = { d0_30: '0–30 يوماً', d31_60: '31–60 يوماً', d61_90: '61–90 يوماً', d91_plus: 'أكثر من 90 يوماً' };
const KIND = { invoice: 'فاتورة بيع', purchase: 'استلام', bill: 'مصروف بالدين', payment: 'قبض', payout: 'دفع', return: 'مرتجع بيع', supplier_return: 'مرتجع إلى المورّد', forgiveness: 'إعفاء', opening: 'الرصيد عند البداية', adjustment: 'تسوية', offset: 'مقاصّة' };
const partiesText = (n) => (n === 1 ? 'جهة واحدة' : n === 2 ? 'جهتان' : n % 100 >= 3 && n % 100 <= 10 ? `${n} جهات` : `${n} جهة`);
const telOf = (phone) => (/^9647[0-9]{9}$/.test(phone) ? `tel:+${phone}` : `tel:${phone.replace(/[^0-9+]/g, '')}`);

export default async function (t) {
  const restoreDom = installDom();
  try {
    const m = await bundle([
      "export { default as DebtsPage } from './src/pages/accounts/debts/DebtsPage.tsx';",
      "export { parseDebtsOverview } from './src/lib/repo/debts.ts';",
    ]);
    const env = createEnv(m);
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error?.stack ?? error}`);
      }
      await env.unmount();
    };
    const tables = setupTables(D.receivable.books);
    const answer = (overrides = {}) => async (args) => clone(overrides[args.p_side] ?? D[args.p_side]);

    // ── شروط العيّنة ─────────────────────────────────────────────────────────────────────────────────────────
    for (const sideName of ['receivable', 'payable']) {
      const sample = D[sideName];
      const amounts = sample.rows.reduce((sum, row) => sum + fils(row.amount), 0n);
      const buckets = BUCKETS.reduce((sum, bucket) => sum + fils(sample.totals.aging[bucket]), 0n);
      t.same(
        [sample.side, sample.rows.length >= 2, sample.totals.parties, amounts, buckets, sample.rows.every((row) => BUCKETS.reduce((sum, bucket) => sum + fils(row.aging[bucket]), 0n) === fils(row.amount))],
        [sideName, true, sample.rows.length, fils(sample.totals.amount), fils(sample.totals.amount), true],
        `شرط ${sideName}: جهتان فأكثر، والمجموع = الصفوف = فئات الأعمار، وأعمار كلّ جهة = رصيدها`,
      );
    }
    const multi = D.receivable.rows.find((row) => row.cells.length > 1) ?? D.payable.rows.find((row) => row.cells.length > 1);
    t.ok(Boolean(multi) && [...D.receivable.rows, ...D.payable.rows].some((row) => row.phone) && [...D.receivable.rows, ...D.payable.rows].some((row) => !row.phone), 'شرط: جهة بحسابين فأكثر، وجهة بهاتف وأخرى بلا هاتف');

    // ── P: المحلّل ───────────────────────────────────────────────────────────────────────────────────────────
    for (const sideName of ['receivable', 'payable']) {
      const sample = D[sideName];
      const parsed = m.parseDebtsOverview(clone(sample));
      t.same(
        [parsed.side, parsed.today, parsed.books.length, parsed.totals.amount, parsed.totals.parties, BUCKETS.map((bucket) => parsed.totals.aging[bucket]), parsed.next],
        [sideName, sample.today, sample.books.length, fils(sample.totals.amount), sample.totals.parties, BUCKETS.map((bucket) => fils(sample.totals.aging[bucket])), sample.next],
        `P ${sideName}: الجانب واليوم والدفاتر والمجموع بالفلس والأعمار والمؤشّر`,
      );
      t.same(
        parsed.rows.map((row) => [row.partyId, row.amount, row.cells.map((cell) => [cell.bookId, cell.closing]), row.oldest, row.ageDays, row.phone, row.lastMove?.kind ?? null, row.lastSettlement?.amount ?? null]),
        sample.rows.map((row) => [row.party_id, fils(row.amount), row.cells.map((cell) => [cell.book_id, fils(cell.closing)]), row.oldest, row.age_days, row.phone, row.last_move?.kind ?? null, row.last_settlement ? fils(row.last_settlement.amount) : null]),
        `P ${sideName}: كلّ صفّ بمبلغه وخلاياه الموقّعة وعمره وآخر حركة وآخر تسديد (والفارغ null)`,
      );
    }
    const strict = (name, mutate) => {
      const broken = clone(D.receivable);
      mutate(broken);
      t.throws(() => m.parseDebtsOverview(broken), `P صارم: ${name}`);
    };
    strict('مبلغ رقماً لا نصّاً', (x) => {
      x.rows[0].amount = 5;
    });
    strict('جانب مجهول', (x) => {
      x.side = 'both';
    });
    strict('نوع حركة مجهول', (x) => {
      x.rows[0].last_move = { kind: 'gift', doc_no: null, on_date: '2026-11-01' };
    });
    strict('أعمار ناقصة', (x) => {
      delete x.totals.aging.d91_plus;
    });
    strict('عمر سالب', (x) => {
      x.rows[0].age_days = -1;
    });

    // ── T وR وA: التبويب الأوّل كما يرسم ───────────────────────────────────────────────────────────────────────
    await step('T-R-A receivable', async () => {
      env.fresh({ session: SESSION('accountant'), rpc: { debts_overview: answer() }, tables });
      await env.mount('/accounts/debts', [['/accounts/debts', m.DebtsPage]]);
      const sample = D.receivable;
      const [args] = env.calls('debts_overview');
      t.same(args, { p_side: 'receivable', p_division: null, p_book: null, p_search: null, p_sort: 'amount', p_min: null, p_over90: false, p_after: null, p_limit: 50 }, 'T النداء الأوّل: «لنا» بلا فلتر، الأكبر رصيداً، 50 جهة');
      const checked = [...descendantsOf('button')].filter((n) => n.getAttribute('role') === 'radio').map((n) => [n.textContent, n.getAttribute('aria-checked')]);
      t.same(checked, [['لنا عند الناس', 'true'], ['علينا للناس', 'false']], 'T تبويبان: «لنا عند الناس» مختار بلا ?side');
      t.eq(text(first('debts-amount')), `${money(fils(sample.totals.amount))} دينار`, 'T المجموع من الخادم بالدينار');
      t.eq(text(first('debts-parties')), partiesText(sample.totals.parties), 'T عدد الجهات بصيغة المعدود');
      const legend = byAction('aging-legend').map((n) => [n.getAttribute('data-bucket'), n.textContent]);
      t.same(legend, BUCKETS.map((bucket) => [bucket, `${LABEL[bucket]}${money(fils(sample.totals.aging[bucket]))}`]), 'T دليل الأعمار: الفئات الأربع بلونها (data-bucket) ومبالغها');
      const segments = descendantsOf('span').filter((n) => n.getAttribute('class') === 'aging-fill' && n.parentNode?.getAttribute('class') === 'aging-bar').map((n) => n.getAttribute('data-bucket'));
      t.same(segments, BUCKETS.filter((bucket) => fils(sample.totals.aging[bucket]) > 0n), 'T شريط الأعمار: قطعة لكلّ فئة فيها مبلغ، بلونها');

      const table = tableOf(tablesIn(globalThis.document.body)[0]);
      t.same(
        table.headers,
        ['الجهة', 'الرصيد', ...BUCKETS.map((bucket) => LABEL[bucket]), 'عمر أقدم دين', 'آخر حركة', 'آخر تسديد', 'الهاتف', 'إجراءات'],
        'R وM2 أعمدة القائمة: الاسم ثمّ الرصيد (يظهران معاً على الهاتف)، والأفعال آخراً',
      );
      t.eq(table.rows.length, sample.rows.length, 'R صفّ لكلّ جهة');
      const back = BACK('receivable');
      const links = byAction('party-link');
      t.same(links.map((n) => [n.textContent, n.getAttribute('href')]), sample.rows.map((row) => [row.name, statementHref(row.party_id, back)]), 'R الاسم يفتح كشف الجهة برجوع إلى القائمة نفسها');
      sample.rows.forEach((row, index) => {
        const cells = table.body[index];
        const amountCell = byAction('amount')[index];
        const bookCells = byAction('book-cell', amountCell);
        t.eq(amountCell.childNodes[0]?.textContent, money(fils(row.amount)), `R ${row.name}: الرصيد`);
        t.same(
          bookCells.map((n) => n.getAttribute('data-book')),
          row.cells.length > 1 ? row.cells.map((cell) => cell.book_id) : [],
          `R ${row.name}: تحت الرصيد رصيد كلّ حساب إن تعدّدت الحسابات`,
        );
        if (row.cells.length > 1) {
          t.same(
            bookCells.map((n) => n.textContent),
            row.cells.map((cell) => `${bookOf(cell.book_id)}${fils(cell.closing) === 0n ? '—' : `${side(fils(cell.closing))}${money(fils(cell.closing) < 0n ? -fils(cell.closing) : fils(cell.closing))}`}`),
            `R ${row.name}: كلّ حساب باسمه ورصيده الموقّع بكلمته (الحسابات لا تُقاصّ)`,
          );
        }
        t.same(cells.slice(2, 6), BUCKETS.map((bucket) => (fils(row.aging[bucket]) > 0n ? money(fils(row.aging[bucket])) : '')), `R ${row.name}: أعمار المفتوح بفئاتها`);
        t.eq(cells[6], row.age_days === null ? '—' : `${daysWord(row.age_days)}${fmtDay(row.oldest)}`, `R ${row.name}: عمر أقدم دين وتاريخه`);
        t.eq(cells[7], row.last_move ? `${fmtDay(row.last_move.on_date)} ${KIND[row.last_move.kind]} ${row.last_move.doc_no ?? ''}` : '—', `R ${row.name}: آخر حركة بتاريخها ونوعها ورقمها`);
        t.eq(cells[8], row.last_settlement ? `${fmtDay(row.last_settlement.on_date)} ${money(fils(row.last_settlement.amount))} دينار ${row.last_settlement.doc_no ?? ''}` : 'لا تسديد', `R ${row.name}: آخر تسديد`);
        t.eq(cells[1].startsWith(money(fils(row.amount))), true, `M2 ${row.name}: الرصيد في العمود الثاني بجانب الاسم`);
      });
      const ages = descendantsOf('span').filter((n) => n.getAttribute('data-age') !== null);
      t.same(
        ages.map((n) => [n.getAttribute('data-bucket'), n.getAttribute('class')]),
        sample.rows.filter((row) => row.age_days !== null).map((row) => [bucketOf(row.age_days), 'aging-ink']),
        'R عمر أقدم دين بلون فئته (0–30 و31–60 و61–90 وأكثر من 90)',
      );
      t.same(table.foot[0]?.slice(0, 1), [`المجموع (${partiesText(sample.totals.parties)})`], 'R التذييل باسمه وعدد الجهات');
      t.same(table.foot[0]?.slice(1), [money(fils(sample.totals.amount)), ...BUCKETS.map((bucket) => money(fils(sample.totals.aging[bucket]))), '', '', '', '', ''], 'R التذييل من الخادم: المجموع والأعمار للمجموعة المفلترة كلّها');
      t.eq(text(first('debts-count')), `${sample.rows.length} من المجموع ${sample.totals.parties}`, 'R العدد من الخادم');
      t.eq(byAction('more-debts').length, sample.next ? 1 : 0, 'R «حمّل المزيد» بمؤشّر الخادم وحده');

      // A: الأفعال السريعة.
      t.same(byAction('open-statement').map((n) => n.getAttribute('href')), sample.rows.map((row) => statementHref(row.party_id, back)), 'A «كشف» يفتح الكشف');
      t.same(byAction('send-statement').map((n) => n.getAttribute('href')), sample.rows.map((row) => statementHref(row.party_id, back, true)), 'A «أرسل الكشف» يفتح الكشف بنافذة المشاركة (send=1)');
      t.same(byAction('call').map((n) => n.getAttribute('href')), sample.rows.filter((row) => row.phone).map((row) => telOf(row.phone)), 'A «اتّصل» للجهة ذات الهاتف وحدها، برابط tel:');
      t.same(byAction('row-payment').map((n) => n.textContent), sample.rows.map(() => 'قبضت منه'), 'A «قبضت منه» لكلّ جهة في «لنا»');
      t.eq(byAction('row-payout').length, 0, 'A ولا «دفعت له» في «لنا»');
      await click(byAction('row-payment')[0]);
      t.ok(text().includes('قبضنا') && text().includes(sample.rows[0].name) && byAction('change-party').length === 1, 'A «قبضت منه» يفتح نافذة القبض نفسها والجهة مختارة');
    });

    // ── التبويب الثاني و«أكثر من 90 يوماً» بالرابط ────────────────────────────────────────────────────────────────
    await step('T payable', async () => {
      env.fresh({ session: SESSION('accountant'), rpc: { debts_overview: answer() }, tables });
      await env.mount('/accounts/debts?side=receivable', [['/accounts/debts', m.DebtsPage]]);
      const payableTab = descendantsOf('button').find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'علينا للناس');
      await click(payableTab);
      t.eq(env.search().side, 'payable', 'T التبويب بالرابط (?side=payable)');
      t.eq(env.calls('debts_overview').at(-1)?.p_side, 'payable', 'T النداء بجانب «علينا»');
      const sample = D.payable;
      t.same(byAction('party-link').map((n) => n.textContent), sample.rows.map((row) => row.name), 'T صفوف «علينا» من الخادم');
      t.same(byAction('row-payout').map((n) => n.textContent), sample.rows.map(() => 'دفعت له'), 'T «دفعت له» في «علينا»');
      t.same(byAction('party-link').map((n) => n.getAttribute('href')), sample.rows.map((row) => statementHref(row.party_id, BACK('payable'))), 'T الرجوع من الكشف إلى «علينا»');
      await click(descendantsOf('button').find((n) => n.getAttribute('role') === 'switch'));
      t.same([env.search().side, env.search().over90], ['payable', '1'], 'F «أكثر من 90 يوماً» بالرابط (?over90=1)');
      t.eq(env.calls('debts_overview').at(-1)?.p_over90, true, 'F والنداء بـp_over90');
      t.ok(text(first('debts-parties')).endsWith('أقدم ديونها فوق 90 يوماً'), 'F العدد يقول إنّ القائمة ما فوق 90 يوماً');
    });

    // ── F: الفلاتر والترتيب في النداء ───────────────────────────────────────────────────────────────────────────
    // F0: القسم من رابط «خلاصة المال» (?division=، تكامل 0024): أوّل نداء بقسمه.
    await step('F0 division link', async () => {
      env.fresh({ session: SESSION('manager'), rpc: { debts_overview: answer() }, tables });
      const division = D.receivable.books[0].division_id;
      await env.mount(`/accounts/debts?side=receivable&division=${division}`, [['/accounts/debts', m.DebtsPage]]);
      t.same([env.calls('debts_overview')[0]?.p_division, env.calls('debts_overview')[0]?.p_book], [division, null], 'F0 رابط القسم من الخلاصة: أوّل نداء بقسمه');
      await env.unmount();
    });
    await step('F filters', async () => {
      env.fresh({ session: SESSION('manager'), rpc: { debts_overview: answer() }, tables });
      await env.mount('/accounts/debts?side=payable&over90=1', [['/accounts/debts', m.DebtsPage]]);
      t.same([env.calls('debts_overview')[0]?.p_side, env.calls('debts_overview')[0]?.p_over90], ['payable', true], 'F الجانب والأعمار من الرابط بأوّل نداء');
      const select = first('debts-filter');
      const options = select.options.map((option) => [option.getAttribute('value'), option.textContent]);
      const hatch = D.receivable.books.filter((book) => book.division_kind === 'hatchery');
      t.ok(options[0][0] === '' && options.some(([value]) => value === `division:${D.receivable.books[0].division_id}`), 'F الفلتر: الكلّ ثمّ الأقسام');
      t.eq(options.filter(([value]) => value.startsWith('book:')).length, hatch.length > 1 ? hatch.length : 0, 'F وحسابات القسم ذي الحسابين (المفقس) تحته');
      const book = hatch[0] ?? D.receivable.books[0];
      await choose(select, hatch.length > 1 ? `book:${book.book_id}` : `division:${book.division_id}`);
      const afterBook = env.calls('debts_overview').at(-1);
      t.same([afterBook.p_book, afterBook.p_division], hatch.length > 1 ? [book.book_id, null] : [null, book.division_id], 'F فلتر الحساب أو القسم في النداء');
      await choose(select, `division:${D.receivable.books[0].division_id}`);
      t.same([env.calls('debts_overview').at(-1).p_division, env.calls('debts_overview').at(-1).p_book], [D.receivable.books[0].division_id, null], 'F فلتر القسم في النداء');
      await choose(first('debts-sort'), 'age');
      t.eq(env.calls('debts_overview').at(-1).p_sort, 'age', 'F الترتيب بالعمر');
      await choose(first('debts-sort'), 'name');
      t.eq(env.calls('debts_overview').at(-1).p_sort, 'name', 'F الترتيب بالاسم');
      await typeIn(first('debts-search'), 'أبو عليّ');
      t.eq(env.calls('debts_overview').at(-1).p_search, 'ابو علي', 'F البحث مطبَّعاً (بلا تشكيل ولا همزة)');
      const min = descendantsOf('input').find((n) => (n.getAttribute('class') ?? '').includes('tabular-nums'));
      t.ok(Boolean(min), 'F حقل الحدّ الأدنى موجود');
      await typeIn(min, '100,000');
      t.eq(env.calls('debts_overview').at(-1).p_min, '100000.00', 'F الحدّ الأدنى بالدينار في النداء');
      await typeIn(min, '1,2,3');
      t.eq(env.calls('debts_overview').at(-1).p_min, null, 'F الحدّ الأدنى غير المقروء لا يُرسل');
    });

    // ── G: الصفحات بالمؤشّر بلا تكرار ──────────────────────────────────────────────────────────────────────────
    await step('G paging', async () => {
      const sample = D.receivable;
      const split = Math.max(1, sample.rows.length - 1);
      const cursor = { amount: sample.rows[split - 1].amount, party_id: sample.rows[split - 1].party_id };
      const page1 = { ...clone(sample), rows: clone(sample.rows.slice(0, split)), next: cursor };
      const page2 = { ...clone(sample), rows: clone(sample.rows.slice(split - 1)), next: null };
      env.fresh({ session: SESSION('viewer'), rpc: { debts_overview: async (args) => (args.p_after ? page2 : page1) }, tables });
      await env.mount('/accounts/debts', [['/accounts/debts', m.DebtsPage]]);
      t.same(byAction('party-link').map((n) => n.textContent), page1.rows.map((row) => row.name), 'G الصفحة الأولى');
      t.eq(byAction('row-payment').length, 0, 'G بلا «قبضت منه» لمن لا يسجّل القبض');
      t.same(tableOf(tablesIn(globalThis.document.body)[0]).foot[0]?.slice(1, 6), [money(fils(sample.totals.amount)), ...BUCKETS.map((bucket) => money(fils(sample.totals.aging[bucket])))], 'G بصفحة ناقصة: التذييل من الخادم للمجموعة كلّها، لا جمع الصفوف المحمّلة');
      t.eq(text(first('debts-amount')), `${money(fils(sample.totals.amount))} دينار`, 'G والمجموع فوق الجدول من الخادم');
      await click(first('more-debts'));
      t.same(env.calls('debts_overview').at(-1).p_after, cursor, 'G الصفحة التالية بمؤشّر الخادم كما هو');
      t.same(byAction('party-link').map((n) => n.textContent), sample.rows.map((row) => row.name), 'G الصفحتان ملحقتان بلا تكرار الجهة المشتركة بينهما');
      t.eq(text(first('debts-count')), `${sample.rows.length} من المجموع ${sample.totals.parties}`, 'G العدد بعد الإلحاق');
      t.eq(byAction('more-debts').length, 0, 'G لا مزيد بعد مؤشّر فارغ');
    });

    // ── مراجعة 0024 (الشاشات): كلّ إصلاح بفحص يفشل على الشفرة قبله ─────────────────────────────────────────────────────
    // M4: كلّ فلتر بالرابط (القسم أو الحساب، والبحث، والحدّ الأدنى، والترتيب، وفوق 90 يوماً)، فرجوع الكشف يعيد القائمة كما كانت (REV-2).
    await step('M4 filters in the URL', async () => {
      env.fresh({ session: SESSION('manager'), rpc: { debts_overview: answer() }, tables });
      const division = D.receivable.books[0].division_id;
      await env.mount(`/accounts/debts?side=receivable&division=${division}`, [['/accounts/debts', m.DebtsPage]]);
      const backOf = (node) => new URLSearchParams(node?.getAttribute('href')?.split('?')[1] ?? '').get('back');
      // الخيار مختار كما يضعه React (selected على الخيار؛ value القائمة لا يُكتب في DOM الفحص، ولا يُطفأ خيار سبقه).
      const isSelected = (select, value) => select?.options.find((option) => option.getAttribute('value') === value)?.selected === true;
      t.eq(backOf(first('party-link')), `/accounts/debts?side=receivable&division=${division}`, 'M4 رجوع الكشف بقسم القائمة المفتوحة من الخلاصة (REV-2)');
      const hatch = D.receivable.books.filter((book) => book.division_kind === 'hatchery');
      const filter = hatch.length > 1 ? `book:${hatch[0].book_id}` : `division:${D.receivable.books.at(-1).division_id}`;
      await choose(first('debts-filter'), filter);
      await choose(first('debts-sort'), 'age');
      await typeIn(first('debts-search'), 'أبو علي');
      await typeIn(descendantsOf('input').find((n) => (n.getAttribute('class') ?? '').includes('tabular-nums')), '100,000');
      await click(descendantsOf('button').find((n) => n.getAttribute('role') === 'switch'));
      const [kind, id] = filter.split(':');
      const wanted = new URLSearchParams({ side: 'receivable', [kind]: id, q: 'أبو علي', min: '100,000', sort: 'age', over90: '1' });
      t.same(env.search(), Object.fromEntries(wanted), 'M4 الفلاتر كلّها في الرابط');
      const back = `/accounts/debts?${wanted.toString()}`;
      t.ok(byAction('party-link').length > 0 && [...byAction('party-link'), ...byAction('open-statement'), ...byAction('send-statement')].every((n) => backOf(n) === back), `M4 الكشف يرجع إلى القائمة بفلاترها كلّها (${back})`);
      await env.unmount();
      env.fresh({ session: SESSION('manager'), rpc: { debts_overview: answer() }, tables });
      await env.mount(back, [['/accounts/debts', m.DebtsPage]]);
      const [args] = env.calls('debts_overview');
      t.same(
        [args.p_division, args.p_book, args.p_search, args.p_min, args.p_sort, args.p_over90],
        [kind === 'division' ? id : null, kind === 'book' ? id : null, 'ابو علي', '100000.00', 'age', true],
        'M4 الرجوع إلى ذلك الرابط يفتح القائمة بفلاترها في أوّل نداء',
      );
      const min = descendantsOf('input').find((n) => (n.getAttribute('class') ?? '').includes('tabular-nums'));
      t.same(
        [isSelected(first('debts-filter'), filter), isSelected(first('debts-sort'), 'age'), first('debts-search').value, min?.value, descendantsOf('button').find((n) => n.getAttribute('role') === 'switch')?.getAttribute('aria-checked')],
        [true, true, 'أبو علي', '100,000', 'true'],
        'M4 والحقول بقيمها كما تُركت',
      );
    });

    // MUT-3: تغيير فلتر و«حمّل المزيد» في الطريق: صفحة الفلتر القديم لا تُلحق بقائمة الفلتر الجديد.
    const pagedSample = () => {
      const sample = D.receivable;
      const split = Math.max(1, sample.rows.length - 1);
      const cursor = { amount: sample.rows[split - 1].amount, party_id: sample.rows[split - 1].party_id };
      return { page1: { ...clone(sample), rows: clone(sample.rows.slice(0, split)), next: cursor }, stale: (name) => ({ ...clone(sample), rows: [{ ...clone(sample.rows.at(-1)), party_id: '00000000-0000-4000-8000-0000000000ff', name }], next: null }) };
    };
    await step('MUT-3 filter change while loading more', async () => {
      const { page1, stale } = pagedSample();
      let release = () => {};
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      env.fresh({ session: SESSION('viewer'), rpc: { debts_overview: async (args) => (args.p_after ? pending.then(() => stale('جهة من صفحة الفلتر القديم')) : clone(page1)) }, tables });
      await env.mount('/accounts/debts', [['/accounts/debts', m.DebtsPage]]);
      await click(first('more-debts'));
      await choose(first('debts-sort'), 'name');
      release();
      await click(null);
      await click(null);
      t.same(byAction('party-link').map((n) => n.textContent), page1.rows.map((row) => row.name), 'MUT-3 صفحة طُلبت بالفلتر القديم لا تُلحق بعد تغييره');
    });

    // قبض من القائمة و«حمّل المزيد» في الطريق (شبهة المراجعة): القراءة من جديد بعد القبض لا تُلحق بها صفحةٌ طُلبت قبله (بأرصدة ما قبله).
    await step('refresh after a payment while loading more', async () => {
      const { page1, stale } = pagedSample();
      let release = () => {};
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      const box = { account_id: '00000000-0000-4000-8000-0000000000b1', name: 'الصندوق', kind: 'cash', archived: false, version: 1, has_opening: true, opening: '0', inflow: '0', outflow: '0', closing: '1000000' };
      const today = page1.today;
      env.fresh({
        session: SESSION('accountant'),
        rpc: {
          debts_overview: async (args) => (args.p_after ? pending.then(() => stale('صفحة ما قبل القبض')) : clone(page1)),
          report_cash_balances: async () => ({ to: today, accounts: [box], total: { opening: '0', inflow: '0', outflow: '0', closing: '1000000' } }),
          preview_party_allocation: async (args) => ({ money: { amount: args.p_amount, balance_before: '0', balance_after: '0', allocations: [], surplus: args.p_amount } }),
          record_party_payment: async (args) => ({ id: args.p_id, kind: 'payment', doc_no: 'RC-2026-0099', on_date: args.p_on_date }),
        },
        tables,
      });
      await env.mount('/accounts/debts', [['/accounts/debts', m.DebtsPage]]);
      await click(first('more-debts'));
      await click(byAction('row-payment')[0]);
      const form = descendantsOf('form').at(-1);
      const bookSelect = descendantsOf('select', form).find((n) => n.hasAttribute('data-autofocus'));
      await choose(bookSelect, bookSelect.options.find((option) => option.getAttribute('value'))?.getAttribute('value'));
      await typeIn(descendantsOf('input', form).find((n) => (n.getAttribute('class') ?? '').includes('tabular-nums')), '10,000');
      await choose(descendantsOf('select', form).find((n) => n.options.some((option) => option.getAttribute('value') === box.account_id)), box.account_id);
      fire(form, 'submit');
      await click(null);
      await click(first('confirm-payment'));
      await click(null);
      t.eq(env.calls('record_party_payment').length, 1, 'شرط: القبض سُجّل والقائمة قُرئت من جديد');
      release();
      await click(null);
      await click(null);
      t.same(byAction('party-link').map((n) => n.textContent), page1.rows.map((row) => row.name), 'الصفحة التي طُلبت قبل القبض لا تُلحق بالقائمة المقروءة بعده');
      t.ok(Boolean(first('more-debts')), 'و«حمّل المزيد» باقٍ بمؤشّر القراءة الجديدة');
    });

    // ── قراءة فاشلة: الفاشل ليس فارغاً ─────────────────────────────────────────────────────────────────────────
    await step('failure', async () => {
      env.fresh({ session: SESSION('accountant'), rpc: { debts_overview: async () => { throw new Error('boom'); } }, tables });
      await env.mount('/accounts/debts', [['/accounts/debts', m.DebtsPage]]);
      t.ok(text().includes('تعذّر تحميل قائمة الذمم') && tablesIn(globalThis.document.body).length === 0 && byAction('debts-total').length === 0, 'فشل القراءة يُقال بـ«أعد المحاولة»، بلا جدول ولا مجموع');
    });
  } finally {
    restoreDom();
    delete globalThis.__mb;
  }

  function descendantsOf(tag, scope = globalThis.document.body) {
    const out = [];
    const walk = (node) => {
      for (const child of node?.childNodes ?? []) {
        if (child.nodeType === 1) {
          if (child.localName === tag) out.push(child);
          walk(child);
        }
      }
    };
    walk(scope);
    return out;
  }
  function bookOf(bookId) {
    const book = D.receivable.books.find((entry) => entry.book_id === bookId) ?? D.payable.books.find((entry) => entry.book_id === bookId);
    return book ? bookNameOf(book) : 'حساب';
  }
}

function bookNameOf(book) {
  if (book.code === 'chicks') return 'المفقس: الأفراخ';
  if (book.code === 'hatching_eggs') return 'المفقس: بيض التفقيس';
  return { feed_mill: 'معمل العلف', broiler: 'حقول اللحم', layer: 'حقول البيض', medicine: 'مخزن الأدوية', general: 'المخازن العامة' }[book.division_kind];
}
