// قانون المالك للأرقام والجداول (docs/DECISIONS.md، 2026-10-24): الفواصل دائماً حتى داخل الجمل، الأرقام غربية
// بالعرض والإدخال (الشرقي ينقلب لحظة الكتابة)، وكشف الحساب الكلاسيكي التاريخ | المستند | البيان | عليه | له | الرصيد.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from './load-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** المكوّنات ويّا react-dom/server بحزمة وحدة: نسختين من React تكسر الخطّافات. */
async function bundle(contents) {
  const result = await build({
    stdin: {
      contents: `${contents} export { renderToStaticMarkup } from 'react-dom/server.browser'; export { createElement as h } from 'react';`,
      resolveDir: ROOT,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const DINAR = 100n; // فلس بالدينار

export default async function (t) {
  // ── الرقم داخل الجملة: t() وTrans يعرضونه بفواصل، والكسر وbigint يرمون.
  const m = await bundle(
    "export { t, Trans } from './src/lib/i18n.tsx'; export { fmtDay } from './src/lib/format.ts'; export { runLedger, balanceSide } from './src/domain/ledger.ts'; export { LedgerTable } from './src/components/ui/LedgerTable.tsx'; export { DataTable } from './src/components/ui/DataTable.tsx';",
  );
  t.eq(m.t('k.n', 'عدد الطيور {n}', { n: 1_250_000 }), 'عدد الطيور 1,250,000', 't(): رقم بفواصل');
  t.eq(m.t('k.n', 'الرمز {code}', { code: '12345' }), 'الرمز 12345', 't(): النصّ يمرّ كما هو (المنسّق قرّر)');
  t.throws(() => m.t('k.n', 'نسبة {n}', { n: 2.5 }), 't(): الكسر يرمي — النسبة من منسّقها');
  t.throws(() => m.t('k.n', 'الكمية {q}', { q: 1_380_000n }), 't(): bigint يفلت من النوع يرمي (مو «1380000»)', /t_bigint_var/);
  const trans = (vars) => m.renderToStaticMarkup(m.h(m.Trans, { k: 'k.t', text: 'المجموع <b>{n}</b>', vars, tags: { b: (c) => m.h('b', null, c) } }));
  t.eq(trans({ n: 396_000 }), 'المجموع <b>396,000</b>', 'Trans: رقم بفواصل داخل الوسم');
  t.throws(() => trans({ n: 396_000n }), 'Trans: bigint يرمي — Fils وMilli من منسّقهم');

  // ── التاريخ بالعرض يوم/شهر/سنة بأرقام غربية.
  t.eq(m.fmtDay('2026-10-24'), '24/10/2026', 'fmtDay');
  t.throws(() => m.fmtDay('24/10/2026'), 'fmtDay يرفض غير YYYY-MM-DD');

  // ── الكشف: الرصيد الجاري = السابق + عليه − له.
  const entries = [
    { date: '2026-10-01', doc: 'FD-2026-0001', memo: 'علف بادئ', debit: 2_500_000n * DINAR, credit: 0n },
    { date: '2026-10-05', doc: 'RC-2026-0003', memo: 'قبضنا نقداً', debit: 0n, credit: 1_000_000n * DINAR },
    { date: '2026-10-09', doc: 'RC-2026-0007', memo: 'قبضنا نقداً', debit: 0n, credit: 1_750_000n * DINAR },
  ];
  const ledger = m.runLedger(entries, 150_000n * DINAR);
  t.same(
    ledger.lines.map((line) => line.balance),
    [2_650_000n * DINAR, 1_650_000n * DINAR, -100_000n * DINAR],
    'الرصيد الجاري سطراً سطراً',
  );
  t.same([ledger.totalDebit, ledger.totalCredit, ledger.closing], [2_500_000n * DINAR, 2_750_000n * DINAR, -100_000n * DINAR], 'المجاميع والرصيد الأخير');
  t.same([m.balanceSide(5n), m.balanceSide(-5n), m.balanceSide(0n)], ['debit', 'credit', null], 'جهة الرصيد');
  t.throws(() => m.runLedger([{ ...entries[0], credit: 1n }]), 'سطر بجهتين يرمي');
  t.throws(() => m.runLedger([{ ...entries[0], debit: -1n }]), 'مبلغ سالب يرمي');

  // ── الجدول الكلاسيكي.
  const html = m.renderToStaticMarkup(m.h(m.LedgerTable, { caption: 'كشف', entries, opening: 150_000n * DINAR }));
  const headers = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
  t.same(headers, ['التاريخ', 'المستند', 'البيان', 'عليه', 'له', 'الرصيد'], 'الأعمدة بترتيب المالك');
  t.ok(html.includes('<bdi dir="ltr">01/10/2026</bdi>'), 'التاريخ يوم/شهر/سنة معزول LTR');
  t.ok(html.includes('<bdi dir="ltr">2,500,000</bdi>') && html.includes('<bdi dir="ltr">1,750,000</bdi>'), 'المبالغ بفواصل');
  const numberCells = [...html.matchAll(/<td class="([^"]*)"/g)].map((match) => match[1]).filter((cls) => cls.includes('tabular-nums'));
  t.ok(numberCells.length >= 12 && numberCells.every((cls) => /\btext-right\b/.test(cls)), `خلايا الأرقام على خانة الآحاد (${numberCells.length})`);
  // مثل إكسل: الخلية بسطر واحد (رقم المستند ما ينكسر عند الشرطة)، والبيان وحده يلتفّ بعرض أدنى.
  const cellOf = (content) => html.split('<td class="').find((chunk) => chunk.includes('">' + content + '</'))?.split('"')[0] ?? '';
  t.ok(cellOf('<bdi dir="ltr">FD-2026-0001').includes('whitespace-nowrap'), 'رقم المستند بسطر واحد');
  t.ok(cellOf('<bdi dir="ltr">01/10/2026').includes('whitespace-nowrap'), 'التاريخ بسطر واحد');
  t.ok(cellOf('علف بادئ').includes('min-w-48') && !cellOf('علف بادئ').includes('whitespace-nowrap'), 'البيان يلتفّ بعرض أدنى');
  const bodyRows = html.split('<tbody>')[1].split('</tbody>')[0].split('<tr').slice(1);
  t.ok(bodyRows[0].includes('رصيد سابق') && bodyRows[0].includes('150,000'), 'سطر الرصيد السابق أوّلاً');
  const cells = (row) => [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((match) => match[1]);
  t.eq(cells(bodyRows[1])[4], '', 'خانة «له» فارغة بسطر «عليه» (مو 0)');
  t.ok(cells(bodyRows[1])[5].includes('2,650,000') && cells(bodyRows[1])[5].includes('عليه'), 'الرصيد الجاري بجهته «عليه»');
  t.ok(cells(bodyRows[3])[5].includes('100,000') && cells(bodyRows[3])[5].includes('>له<'), 'الرصيد السالب رقمه موجب وجهته «له»');
  t.ok(!/-100,000/.test(html), 'ماكو إشارة سالبة بالكشف: الجهة تكولها');
  const foot = html.split('<tfoot>')[1] ?? '';
  t.ok(foot.includes('المجموع') && foot.includes('2,500,000') && foot.includes('2,750,000') && foot.includes('100,000'), 'صفّ المجاميع');
  t.ok(/border-double/.test(foot), 'خطّ مزدوج فوك المجاميع');
  // الرأس الثابت يحمل خطوطه بالتمرير: border-separate، كل خلية خطّها (ويّا collapse الخطوط للجدول كلّه).
  t.ok(html.includes('border-separate') && !html.includes('border-collapse'), 'خطوط الخلايا بنموذج separate');

  const zero = m.renderToStaticMarkup(m.h(m.LedgerTable, { caption: 'كشف', entries: [{ ...entries[0], debit: 0n, credit: 0n }] }));
  t.ok(!/>عليه<\/span>|>له<\/span>/.test(zero.split('<tbody>')[1] ?? ''), 'رصيد صفر بلا جهة');
  const empty = m.renderToStaticMarkup(m.h(m.LedgerTable, { caption: 'كشف', entries: [] }));
  t.ok(empty.includes('لا توجد قيود بعد.') && !empty.includes('<tfoot>'), 'الكشف الفارغ: سطر واحد بلا مجاميع');

  // مجموع بأوّل عمود كان يختفي بصمت تحت «المجموع»: هسه يرمي.
  const firstTotal = () =>
    m.renderToStaticMarkup(
      m.h(m.DataTable, {
        caption: 'x',
        columns: [
          { key: 'qty', header: 'الكمية', kind: 'number', cell: () => '1', total: '1,250' },
          { key: 'name', header: 'الاسم', cell: () => 'أ' },
        ],
        rows: [1],
        rowKey: () => 'r',
        empty: '—',
        totalLabel: 'المجموع',
      }),
    );
  t.throws(firstTotal, 'مجموع بأوّل عمود ويّا «المجموع» يرمي', /datatable_total_label_needs_leading_text_column/);
  // صفّ التذييل (WP3، «لنا عند الناس»): رقم بأوّل عمود كان يختفي تحت اسم الصفّ، فيرمي مثل المجموع؛ وبأوّل عمود نصّ يرتسم.
  const footerAt = (key) =>
    m.renderToStaticMarkup(
      m.h(m.DataTable, {
        caption: 'x',
        columns: [
          { key: 'name', header: 'الجهة', cell: () => 'أ' },
          { key: 'mill', header: 'المعمل', kind: 'number', cell: () => '1' },
        ],
        rows: [1],
        rowKey: () => 'r',
        empty: '—',
        footers: [{ key: 'receivable', label: 'لنا عند الناس', cells: { [key]: '1,660,000' } }],
      }),
    );
  t.throws(() => footerAt('name'), 'رقم تذييل بأوّل عمود يرمي (ما يختفي تحت اسم الصفّ)', /datatable_footer_needs_leading_text_column/);
  t.ok(/<th scope="row" colSpan="1"[^>]*>لنا عند الناس<\/th>/.test(footerAt('mill')) && footerAt('mill').includes('1,660,000'), 'ضابط: تذييل يبدي بالعمود الثاني يرتسم باسمه ورقمه');
  // total: null (أو '' أو false) بنوع ReactNode يعني «بلا مجموع»: ما يرمي، و«المجموع» يمتدّ لحد أوّل مجموع حقيقي.
  const nullTotal = m.renderToStaticMarkup(
    m.h(m.DataTable, {
      caption: 'x',
      columns: [
        { key: 'name', header: 'الاسم', cell: () => 'أ', total: null },
        { key: 'memo', header: 'البيان', cell: () => 'ب', total: '' },
        { key: 'qty', header: 'الكمية', kind: 'number', cell: () => '1', total: '1,250' },
      ],
      rows: [1],
      rowKey: () => 'r',
      empty: '—',
      totalLabel: 'المجموع',
    }),
  );
  t.ok(/<th scope="row" colSpan="2"[^>]*>المجموع<\/th>/.test(nullTotal) && nullTotal.includes('1,250'), 'مجموع فارغ بأوّل عمود ما يكسر الصفحة');

  // ── الإدخال: الرقم الشرقي ينقلب غربياً لحظة الكتابة، من ورا متتبّع React.
  const d = await loadSrc('src/lib/digits.ts');
  t.eq(d.westernize('١٢٣'), '123', 'الأرقام العربية الشرقية');
  t.eq(d.westernize('۱۲۳'), '123', 'الأرقام الفارسية');
  t.eq(d.westernize('١٬٢٥٠٫٥'), '1,250.5', '«٬» فاصلة و«٫» نقطة');
  t.eq(d.westernize('1,250 كغم'), null, 'ماكو شرقي: ماكو كتابة');
  t.eq(d.westernize('محل، ٣'), 'محل، 3', 'الفاصلة العربية بالنصّ تبقى');

  // نسخ مصغّرة من HTMLInputElement وHTMLTextAreaElement: كل وحدة مُعيِّن قيمتها على نموذجها، ومُعيِّن الحقل
  // ما ينفع على textarea (بالمتصفّح يرمي Illegal invocation)، حتى يفشل الفحص إذا الكتابة غلطت النموذج.
  class FakeInput {
    constructor(value, selection = [value.length, value.length]) {
      this.stored = value;
      [this.selectionStart, this.selectionEnd] = selection;
      this.selectionDirection = 'none';
      this.range = null;
      this.dispatched = [];
    }
    setSelectionRange(start, end, direction) {
      this.range = [start, end, direction];
    }
    dispatchEvent(event) {
      this.dispatched.push({ type: event.type, bubbles: event.bubbles });
      return true;
    }
  }
  class FakeArea extends FakeInput {}
  Object.defineProperty(FakeInput.prototype, 'value', {
    get() {
      return this.stored;
    },
    set(value) {
      if (this instanceof FakeArea) throw new TypeError('Illegal invocation');
      this.stored = value;
    },
    configurable: true,
  });
  Object.defineProperty(FakeArea.prototype, 'value', {
    get() {
      return this.stored;
    },
    set(value) {
      this.stored = value;
    },
    configurable: true,
  });

  /** متتبّع React على العقدة نفسها: إذا انكتبت القيمة من خلاله، React يحسب ماكو تغيير ويبلع الحرف. */
  function track(field, initial) {
    const state = { tracked: initial };
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value');
    Object.defineProperty(field, 'value', {
      get() {
        return proto.get.call(this);
      },
      set(value) {
        state.tracked = value;
        proto.set.call(this, value);
      },
      configurable: true,
    });
    return state;
  }

  globalThis.HTMLInputElement = FakeInput;
  globalThis.HTMLTextAreaElement = FakeArea;
  try {
    const field = new FakeInput('12٣', [3, 3]);
    const fieldTracker = track(field, '12');
    d.westernizeInput({ target: field });
    t.eq(field.value, '123', 'الحقل صار غربياً');
    t.eq(fieldTracker.tracked, '12', 'المتتبّع ما تحدّث: React يشوف الفرق ويطلق onChange');
    t.same(field.range, [3, 3, 'none'], 'المؤشّر بمكانه');

    const numberField = new FakeInput('٥', [null, null]);
    numberField.setSelectionRange = () => {
      throw new Error('InvalidStateError');
    };
    d.westernizeInput({ target: numberField });
    t.eq(numberField.value, '5', 'حقل بلا تحديد (type=number) ينقلب بلا رمي');

    const area = new FakeArea('ملاحظة ٧');
    const areaTracker = track(area, 'ملاحظة ');
    d.westernizeInput({ target: area });
    t.eq(area.value, 'ملاحظة 7', 'textarea أيضاً');
    t.eq(areaTracker.tracked, 'ملاحظة ', 'textarea من ورا المتتبّع بمُعيِّن نموذجها');

    const other = { value: '٣' };
    d.westernizeInput({ target: other });
    t.eq(other.value, '٣', 'غير الحقول ما تنلمس');

    // التركيب (لوحات التنبؤ بأندرويد): آخر input وisComposing بعده true، وبعد compositionend ماكو input.
    const composing = new FakeInput('محل ٣');
    const composingTracker = track(composing, 'محل ٣');
    d.westernizeInput({ target: composing, isComposing: true });
    t.eq(composing.value, 'محل ٣', 'أثناء التركيب ما ينلمس');
    d.westernizeComposed({ target: composing });
    t.eq(composing.value, 'محل 3', 'نهاية التركيب تقلبه');
    t.eq(composingTracker.tracked, 'محل ٣', 'ومن ورا المتتبّع');
    t.same(composing.dispatched, [{ type: 'input', bubbles: true }], 'وinput واحد حتى React يطلق onChange');
    const plain = new FakeInput('محل 3');
    d.westernizeComposed({ target: plain });
    t.same(plain.dispatched, [], 'تركيب بلا شرقي: ماكو حدث زايد');

    const calls = [];
    const target = { addEventListener: (...args) => calls.push(args) };
    d.initWesternDigits(target);
    d.initWesternDigits(target);
    t.same(
      calls.map((call) => [call[0], call[2]]),
      [
        ['input', true],
        ['compositionend', true],
      ],
      'input وcompositionend بمرحلة الالتقاط (قبل React)، ومرّة وحدة',
    );
  } finally {
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLTextAreaElement;
  }
}
