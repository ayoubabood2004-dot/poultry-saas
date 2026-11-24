// الجداول والتقارير الرسمية (عقد 0036 الجزء S1، كلمة المالك 2026-11-24: «مرتّبة بشكل رسمي وتاخذ حجم اكبر من الشاشة لدون ما تنحذف او تختفي منها كلمات
// ويكون الكلام الي بيها واضح ايضا واسماء الجداول يكون بيها لون بالخلفية مالتها مثل ترتيب المستشفيات»، و«تطلع بشكل رسمي مثل تقارير المستشفيات»).
// P الجدول العاديّ (بلا variant أو 'plain') بالعلامات نفسها حرفاً حرفاً كما قبل 0036: لقطاتها في fixtures/datatable-plain.json أُخذت من المصدر قبل التغيير
//   (DATATABLE_PLAIN_OUT=1 يعيد كتابتها، ولا يُستعمل إلّا على مصدر لم يتغيّر فيه الجدول العاديّ).
// O الجدول الرسميّ: شريط العنوان (caption أو title) خارج إطار التمرير، والإطار overflow-auto، والجدول ofc-grid بحجمه، والرأس يلتفّ بلا أصناف العاديّ،
//   والنصّ ofc-text يلتفّ والبيان ofc-wrap والرقم سطر واحد، والمجاميع بلا أصناف العاديّ، ولا truncate، والثابت والنبرة كما هما.
// C official.css: الرموز بالسمتين وكلّ نصّ على خلفية ملوّنة ≥ 4.5:1، والطباعة بالألوان، والجدول كلّه على الورق برأس يتكرّر، والصفحة العريضة، وكلّ اسم ofc-
//   مستعمل له قاعدة ولا يولّد له Tailwind شيئاً، ولا @tailwind ولا @apply (CSS الإقلاع لا يكبر).
// W الصفحة العريضة: useWidePage يزيد عدّاد lib/wide ما دامت مركّبة، والقشرة الحقيقية تضع data-wide على <main> ثمّ تشيله.
// G من يستعمل variant="official" يستورد من components/ui/OfficialReport (حامل official.css)، وofficial.css لا يستورده غيره، ومستوردوه في حزمة القاعات وحدها.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedClasses } from '../guards/ui-guard.mjs';
import { descendants, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAIN_FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'datatable-plain.json');
const CSS_FILE = path.join(ROOT, 'src', 'components', 'ui', 'official.css');

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
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** جداول تغطّي كلّ فرع في DataTable العاديّ: الأحجام الثلاثة، والعمود الثابت والملتفّ، والمجموع والتذييل، والتفصيل تحت الصفّ، وصفّ التحذير والمختار، والفارغ. */
function plainCases(m) {
  const n = (value) => m.h(m.Num, null, value);
  const sheetColumns = [
    { key: 'age', header: 'العمر', kind: 'number', cell: (row) => n(String(row.age)) },
    { key: 'date', header: 'التاريخ', sticky: true, cell: (row) => n(row.on) },
    { key: 'dead', header: 'الهلاكات', kind: 'number', cell: (row) => (row.dead === null ? '' : n(String(row.dead))), total: n('32') },
    { key: 'feed', header: 'العلف (كغم)', kind: 'number', cell: (row) => n(row.feed), total: n('1,000') },
    { key: 'note', header: 'الملاحظات', wrap: true, cell: (row) => row.note },
  ];
  const sheetRows = [
    { on: '01/12', age: 18, dead: 3, feed: '250', note: 'تهوية جيّدة' },
    { on: '02/12', age: 19, dead: null, feed: '450', note: '' },
    { on: '03/12', age: 20, dead: 4, feed: '300', note: 'ملاحظة أطول من غيرها تلتفّ داخل خليّتها' },
  ];
  const partyColumns = [
    { key: 'name', header: 'الجهة', sticky: true, cell: (row) => row.name },
    { key: 'mill', header: 'المعمل', kind: 'number', cell: (row) => n(row.mill) },
    { key: 'farm', header: 'الحقل', kind: 'number', cell: (row) => n(row.farm) },
  ];
  const partyRows = [
    { id: 'p1', name: 'مورّد العلف', mill: '1,250,000', farm: '0' },
    { id: 'p2', name: 'زبون الطيور', mill: '0', farm: '410,500' },
  ];
  return {
    sheet_sm: { caption: 'هلاكات قاعة (7)', columns: sheetColumns, rows: sheetRows, rowKey: (row) => row.on, empty: 'لا أيام بعد.', totalLabel: 'المجموع', size: 'sm', rowTone: (row) => (row.on === '03/12' ? 'mark' : null) },
    sheet_md: { caption: 'أيام الوجبة', columns: sheetColumns, rows: sheetRows, rowKey: (row) => row.on, empty: 'لا أيام بعد.', totalLabel: 'المجموع' },
    halls_lg: {
      caption: 'القاعات',
      columns: [
        { key: 'hall', header: 'القاعة', sticky: true, cell: (row) => row.hall },
        { key: 'live', header: 'الحيّ', kind: 'number', cell: (row) => n(row.live) },
        { key: 'state', header: 'الجولة', cell: (row) => row.state },
      ],
      rows: [
        { hall: 'قاعة 1', live: '4,900', state: 'لم تُسجَّل الجولة' },
        { hall: 'قاعة 2', live: '5,010', state: 'سُجّلت' },
      ],
      rowKey: (row) => row.hall,
      empty: 'لا قاعات.',
      size: 'lg',
      onRowClick: () => {},
      rowTone: (row) => (row.state === 'سُجّلت' ? null : 'warn'),
    },
    parties_footers: {
      caption: 'الجهات',
      columns: partyColumns,
      rows: partyRows,
      rowKey: (row) => row.id,
      empty: '—',
      totalLabel: 'المجموع',
      footers: [
        { key: 'receivable', label: 'لنا عند الناس', cells: { farm: n('410,500') } },
        { key: 'payable', label: 'علينا للناس', cells: { mill: n('1,250,000') } },
      ],
    },
    footers_only: { caption: 'الجهات', columns: partyColumns, rows: [], rowKey: (row) => row.id, empty: 'لا جهات بعد.', footers: [{ key: 'receivable', label: 'لنا عند الناس', cells: { farm: n('0') } }] },
    empty_totals: { caption: 'أيام الوجبة', columns: sheetColumns, rows: [], rowKey: (row) => row.on, empty: 'لا أيام بعد.', totalLabel: 'المجموع' },
    sub_rows: {
      caption: 'الكشف التفصيلي',
      columns: partyColumns,
      rows: partyRows,
      rowKey: (row) => row.id,
      empty: '—',
      subRow: (row) => (row.id === 'p1' ? m.h('ul', null, m.h('li', null, 'علف بادئ 2 طنّ')) : null),
    },
  };
}

// ── أدوات العلامات ──────────────────────────────────────────────────────────────────────────────────────────────────
const classesOf = (html, tag) => [...html.matchAll(new RegExp(`<${tag}(?=[\\s>])[^>]*?class="([^"]*)"`, 'gu'))].map((match) => match[1]);
const between = (html, open, close) => html.split(open)[1]?.split(close)[0] ?? '';
const words = (cls) => cls.split(/\s+/u).filter(Boolean);

// ── التباين (WCAG 2.1) ────────────────────────────────────────────────────────────────────────────────────────────
const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** رموز كتلة CSS بمحدّدها الحرفيّ (‎:root أو .dark أو .clarity…): الاسم ← [r, g, b]. */
function tokenBlock(css, selector) {
  const out = {};
  const pattern = new RegExp(`(?:^|\\n)${selector.replace(/[.]/gu, '\\.')}\\s*\\{([^}]*)\\}`, 'gu');
  for (const match of css.matchAll(pattern)) {
    for (const decl of match[1].matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/gu)) out[decl[1]] = [Number(decl[2]), Number(decl[3]), Number(decl[4])];
  }
  return out;
}

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|css)$/u.test(name)) out.push(full);
  }
  return out;
}

export default async function (t) {
  const m = await bundle(
    "export { DataTable, Num } from './src/components/ui/DataTable.tsx'; export { LedgerTable } from './src/components/ui/LedgerTable.tsx';",
  );
  const cases = plainCases(m);
  const entries = [
    { date: '2026-10-01', doc: 'FD-2026-0001', memo: 'علف بادئ', debit: 250_000_000n, credit: 0n },
    { date: '2026-10-05', doc: 'RC-2026-0003', memo: 'قبضنا نقداً', debit: 0n, credit: 100_000_000n },
  ];
  const render = (props) => m.renderToStaticMarkup(m.h(m.DataTable, props));
  const now = Object.fromEntries(Object.entries(cases).map(([name, props]) => [name, render(props)]));
  now.ledger = m.renderToStaticMarkup(m.h(m.LedgerTable, { caption: 'كشف', entries, opening: 15_000_000n }));

  // ── P: الجدول العاديّ لم يتغيّر حرفاً ─────────────────────────────────────────────────────────────────────────────
  if (process.env.DATATABLE_PLAIN_OUT === '1') {
    writeFileSync(PLAIN_FIXTURE, `${JSON.stringify(now, null, 2)}\n`);
    t.ok(true, `P كُتبت لقطات الجدول العاديّ (${Object.keys(now).length})`);
    return;
  }
  const before = JSON.parse(readFileSync(PLAIN_FIXTURE, 'utf8'));
  t.same(Object.keys(now), Object.keys(before), 'P اللقطات نفسها');
  for (const [name, html] of Object.entries(before)) t.eq(now[name], html, `P الجدول العاديّ «${name}» بالعلامات نفسها حرفاً حرفاً كما قبل 0036`);
  for (const [name, props] of Object.entries(cases)) t.eq(render({ ...props, variant: 'plain' }), before[name], `P variant="plain" صراحةً = بلا variant («${name}»)`);

  // ── O: الجدول الرسميّ ────────────────────────────────────────────────────────────────────────────────────────────
  const official = (name, extra = {}) => render({ ...cases[name], variant: 'official', ...extra });
  {
    const html = official('sheet_md');
    const outer = html.match(/^<div class="([^"]*)">/u)?.[1];
    const band = html.match(/^<div class="ofc"><div class="ofc-band" aria-hidden="true">([^<]*)<\/div>/u)?.[1];
    const frame = html.match(/<\/div><div class="([^"]*)"><table/u)?.[1];
    t.same([outer, band, frame], ['ofc', 'أيام الوجبة', 'ofc-frame max-h-[70dvh] overflow-auto'], 'O1 شريط العنوان باسم الجدول (caption) فوق إطار التمرير، والإطار overflow-auto كالعاديّ');
    t.ok(html.includes('<caption class="sr-only">أيام الوجبة</caption>'), 'O1 وcaption الجدول لقارئ الشاشة باقٍ (والشريط aria-hidden فلا يُقرأ مرّتين)');
    t.same(words(classesOf(html, 'table')[0]), ['w-full', 'border-separate', 'border-spacing-0', 'ofc-grid'], 'O1 الجدول ofc-grid (الحجم المتوسّط أساسه)، بلا text-sm ولا حوافّ العاديّ');
    const heads = classesOf(between(html, '<thead>', '</thead>'), 'th');
    t.same(
      heads.map((cls) => [words(cls).includes('bg-surface-2'), words(cls).includes('whitespace-nowrap'), words(cls).includes('text-xs'), words(cls).includes('sticky'), words(cls).includes('text-right')]),
      [
        [false, false, false, true, true],
        [false, false, false, true, false],
        [false, false, false, true, true],
        [false, false, false, true, true],
        [false, false, false, true, false],
      ],
      'O2 الرأس بلا خلفية العاديّ ولا سطر واحد ولا خطّ صغير (ألوانه وخطّه في official.css)، ثابت بالتمرير، والرقميّ على اليمين',
    );
    t.ok(/<th scope="col" class="sticky top-0 start-0 z-\[2\] text-start">التاريخ<\/th>/u.test(html), 'O2 العمود الثابت ثابتٌ في الرأس الرسميّ');
    const cells = classesOf(between(html, '<tbody>', '</tbody>'), 'td').slice(0, 5).map(words);
    t.same(
      cells.map((cls) => [cls.includes('ofc-text'), cls.includes('ofc-wrap'), cls.includes('whitespace-nowrap'), cls.includes('tabular-nums'), cls.includes('px-3')]),
      [
        [false, false, true, true, false],
        [true, false, false, false, false],
        [false, false, true, true, false],
        [false, false, true, true, false],
        [false, true, false, false, false],
      ],
      'O3 الرقم سطر واحد على خانة الآحاد، والنصّ ofc-text يلتفّ، والبيان ofc-wrap، والحشوة من official.css',
    );
    t.ok(cells[1].includes('sticky') && cells[1].includes('bg-surface-1'), 'O3 الخلية الثابتة معتمة كالعاديّ');
    const foot = between(html, '<tfoot>', '</tfoot>');
    t.ok(/^<tr><th scope="row" colSpan="2" class="text-start">المجموع<\/th>/u.test(foot), `O4 صفّ المجاميع بلا أصناف العاديّ (غامق على خلفية العلامة في official.css): ${foot.slice(0, 80)}`);
    t.ok(!/truncate|line-clamp|text-ellipsis/u.test(html), 'O5 لا قصّ في أيّ خلية (لا truncate ولا line-clamp)');
  }
  {
    const html = official('sheet_sm', { title: 'عنوان آخر' });
    t.same(
      [html.match(/<div class="ofc-band" aria-hidden="true">([^<]*)<\/div>/u)?.[1], words(classesOf(html, 'table')[0]).slice(-2), /<caption class="sr-only">هلاكات قاعة \(7\)<\/caption>/u.test(html)],
      ['عنوان آخر', ['ofc-grid', 'ofc-sm'], true],
      'O6 title يغلب caption في الشريط وحده، والحجم الصغير ofc-sm',
    );
    const marked = html.match(/<tr class="([^"]*)" data-tone="mark">/u)?.[1];
    t.ok(marked !== undefined && words(marked).includes('bg-surface-3'), 'O6 صفّ اليوم المختار بخلفيته ونبرته كالعاديّ');
    const note = classesOf(between(html, '<tbody>', '</tbody>'), 'td').map(words).find((cls) => cls.includes('ofc-wrap'));
    t.ok(note && !note.includes('min-w-48') && !note.includes('whitespace-nowrap') && !note.includes('px-3'), 'O6 بيان الورقة بلا عرض أدنى ولا سطر واحد ولا px-3 (L1 0035: ستّة أعمدة بعرض 360؛ العرض الأدنى من 640 في official.css)');
  }
  {
    const html = official('halls_lg');
    t.same([words(classesOf(html, 'table')[0]).at(-1), (html.match(/data-tone="warn"/gu) ?? []).length], ['ofc-lg', 1], 'O7 الحجم الكبير ofc-lg، وصفّ التحذير بنبرته');
    const empty = official('empty_totals');
    t.ok(/<td colSpan="5" class="ofc-empty text-center text-ink-muted">لا أيام بعد.<\/td>/u.test(empty) && !empty.includes('<tfoot>'), 'O7 الجدول الفارغ بسطره وبلا مجاميع');
    const footers = official('parties_footers');
    t.same((between(footers, '<tfoot>', '</tfoot>').match(/<tr>/gu) ?? []).length, 3, 'O7 المجموع والتذييلان صفوف tfoot بلا أصناف العاديّ');
    const sub = official('sub_rows');
    t.ok(sub.includes('<tr data-sub-row="true"><td colSpan="3"><ul><li>علف بادئ 2 طنّ</li></ul></td></tr>'), 'O7 التفصيل تحت الصفّ بعرض الجدول بلا أصناف العاديّ');
  }

  // ── C: official.css ──────────────────────────────────────────────────────────────────────────────────────────────
  const css = readFileSync(CSS_FILE, 'utf8');
  const tokensCss = readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
  {
    const light = { ...tokenBlock(tokensCss, ':root'), ...tokenBlock(css, ':root') };
    const dark = { ...light, ...tokenBlock(tokensCss, '.dark'), ...tokenBlock(css, '.dark') };
    const clarity = { ...light, ...tokenBlock(tokensCss, '.clarity') };
    const darkClarity = { ...dark, ...tokenBlock(tokensCss, '.dark.clarity') };
    const pairs = [
      ['on-band', 'ofc-band', 'شريط الجدول'],
      ['on-band', 'ofc-bar', 'شريط القسم'],
      ['ofc-head-ink', 'ofc-head', 'رأس الجدول'],
      ['ink', 'ofc-total', 'صفّ المجاميع'],
      ['ofc-head-ink', 'ofc-label', 'عنوان مربّع البيانات'],
      ['ofc-head-ink', 'ofc-label', 'العنوان الفرعيّ'],
      ['ofc-brand-ink', 'surface', 'اسم المنشأة على سطح الصفحة (الهاتف)'],
      ['ofc-brand-ink', 'surface-1', 'اسم المنشأة على الورقة'],
      ['ink-muted', 'surface-1', 'سطر الحال تحت العنوان'],
      ['ink-muted', 'surface', 'سطر الحال (الهاتف)'],
      ['ink', 'surface-1', 'خلايا الجدول ومربّعات البيانات'],
    ];
    const name = (token) => (token === 'on-band' ? 'ofc-on-band' : token);
    const rows = [];
    for (const [themeName, theme] of [['الفاتح', light], ['الداكن', dark], ['وضوح', clarity], ['وضوح الداكن', darkClarity]]) {
      for (const [ink, ground, what] of pairs) {
        const a = theme[name(ink)];
        const b = theme[name(ground)];
        const ratio = a && b ? contrast(a, b) : 0;
        rows.push([themeName, what, Math.round(ratio * 100) / 100, ratio >= 4.5]);
      }
    }
    const failing = rows.filter((row) => !row[3]);
    t.same(failing, [], `C1 كلّ نصّ رسميّ ≥ 4.5:1 في السمات الأربع (${rows.length} زوجاً؛ أدناها ${Math.min(...rows.map((row) => row[2]))}:1)`);
    t.same(
      Object.keys(tokenBlock(css, ':root')).filter((token) => token.startsWith('ofc-')).sort(),
      ['ofc-band', 'ofc-bar', 'ofc-brand-ink', 'ofc-head', 'ofc-head-ink', 'ofc-label', 'ofc-on-band', 'ofc-rule', 'ofc-total'],
      'C1 الرموز كلّها على :root بقيم RGB (rgb(var(--x)) كـtokens.css)',
    );
    t.ok(!/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/iu.test(css.replace(/\/\*[\s\S]*?\*\//gu, '')), 'C1 لا لون مكتوب خارج كتل الرموز (كلّها rgb(var(--…)))');
  }
  {
    const printBlock = css.split('@media print {')[1] ?? '';
    const exact = (selector) => new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/gu, (c) => `\\${c}`)}[^{]*\\{[^}]*print-color-adjust: exact`, 'u').test(css);
    t.same(
      [
        ['.ofc-band', '.ofc-grid > thead > tr > th', '.ofc-grid > tfoot > tr > *', '.ofc-info dt', '.ofc-bar', '.ofc-subbar'].map(exact),
        /\.ofc-frame\s*\{\s*max-height: none;\s*overflow: visible;/u.test(printBlock),
        /\.ofc-grid > thead\s*\{\s*display: table-header-group;/u.test(printBlock),
        /\.ofc-grid > tfoot\s*\{\s*display: table-row-group;/u.test(printBlock),
        /\.ofc-grid > tbody > tr,[^{]*\{\s*break-inside: avoid;/u.test(printBlock),
        /\.ofc-band,[^{]*\{\s*break-after: avoid;/u.test(printBlock),
        /\[data-capture\] \.ofc-frame\s*\{\s*max-height: none;\s*overflow: visible;/u.test(css),
        !/@page/u.test(css.replace(/\/\*[\s\S]*?\*\//gu, '')),
      ],
      [[true, true, true, true, true, true], true, true, true, true, true, true, true],
      'C2 تُطبع بألوانها، والجدول كلّه على الورق (بلا حدّ ارتفاع ولا تمرير) برأسٍ يتكرّر في كلّ صفحة ومجاميع مرّة، والصفّ والشريط لا ينفصلان، والصورة كذلك؛ و@page في أسلوب الصفحة لا هنا',
    );
    t.same(
      [/main\[data-wide\]\s*\{\s*max-width: 100rem;/u.test(css), /header:has\(\+ main\[data-wide\]\) > div\s*\{\s*max-width: 100rem;/u.test(css), /main\[data-wide\],[^{]*\{\s*max-width: none;/u.test(printBlock)],
      [true, true, true],
      'C3 الصفحة العريضة: <main data-wide> حتى 100rem (أعرض من max-w-6xl = 72rem) والشريط العلويّ معها، وعلى الورق بلا حدّ',
    );
    t.ok(!/@tailwind|@apply|theme\(/u.test(css), 'C4 لا @tailwind ولا @apply ولا theme(): الملفّ لا يولّد أصناف Tailwind');
    // ما أمسكته صور Chromium (عرض 1280 و390): التاريخ انكسر «13/11/202» ثمّ «6» بـoverflow-wrap: anywhere، وجداول التقرير كانت صناديق تمرير بارتفاع 70٪،
    // وشبكة البيانات صفّاً ناقصاً؛ وورقة القاعة بعرض 360 خرجت 22 نقطة عن إطارها بخطّ الرأس 15.
    const plainCss = css.replace(/\/\*[\s\S]*?\*\//gu, '');
    t.same(
      [
        /\.ofc-grid bdi\s*\{\s*white-space: nowrap;/u.test(plainCss),
        /overflow-wrap: anywhere/u.test(plainCss),
        /\.ofc-paper \.ofc-frame\s*\{\s*max-height: none;/u.test(plainCss),
        /\.ofc-info\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u.test(plainCss),
        /@media \(min-width: 640px\)\s*\{\s*\.ofc-info\s*\{\s*grid-template-columns: repeat\(var\(--ofc-cols, 4\), minmax\(0, 1fr\)\);/u.test(plainCss),
        /\.ofc-sm > thead > tr > th\s*\{\s*min-width: 0;\s*font-size: 0\.8125rem;/u.test(plainCss),
        /\.ofc-grid td \.flex-col > bdi\s*\{\s*align-self: flex-start;/u.test(plainCss),
      ],
      [true, false, true, true, true, true, true],
      'C6 الرقم والتاريخ لا ينكسران، وجداول الورقة تجري معها بلا صندوق تمرير، وشبكة البيانات عمودان بالهاتف وصفوفٌ ممتلئة من 640، ورؤوس الورقة 13 نقطة بالهاتف، والرقم فوق كلمته على جانب البداية',
    );
    // كلّ اسم ofc- في الشاشات له قاعدة هنا، وكلّ قاعدة لاسمٍ مستعمل، ولا يولّد Tailwind لأيّ منها شيئاً (CSS الإقلاع كما هو).
    const used = new Set();
    for (const file of sourceFiles(path.join(ROOT, 'src')).filter((file) => /\.tsx?$/u.test(file))) {
      // أسماء الأصناف وحدها: --ofc-cols رمزٌ لا صنف.
      for (const match of readFileSync(file, 'utf8').matchAll(/(?<![\w-])ofc(?:-[a-z]+)*\b/gu)) used.add(match[0]);
    }
    const defined = new Set([...css.matchAll(/\.(ofc(?:-[a-z]+)*)\b/gu)].map((match) => match[1]));
    t.same([...used].filter((cls) => !defined.has(cls)).sort(), [], `C5 كلّ اسم ofc- مستعمل له قاعدة (${used.size})`);
    t.same([...defined].filter((cls) => !used.has(cls)).sort(), [], `C5 ولا قاعدة لاسم غير مستعمل (${defined.size})`);
    // ‎flex ضابطٌ يولّده Tailwind (فلا يشكو «لا أصناف»، ويثبت أنّ المولِّد يعمل).
    const generated = await generatedClasses(['flex', ...used]);
    t.same([generated.has('flex'), [...used].filter((cls) => generated.has(cls))], [true, []], 'C5 ولا يولّد Tailwind لأسماء ofc- شيئاً (والضابط flex يتولّد)');
  }

  // ── G: حامل الأنماط ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    const files = sourceFiles(path.join(ROOT, 'src')).map((file) => [path.relative(ROOT, file).split(path.sep).join('/'), readFileSync(file, 'utf8')]);
    // الشفرة بلا تعليقاتها: التعليق يذكر variant="official" ولا يستعمله.
    const code = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    const users = files.filter(([file, text]) => /\.tsx$/u.test(file) && /variant="official"/u.test(code(text))).map(([file]) => file);
    const carriers = files.filter(([, text]) => /from '(?:\.\.\/)+components\/ui\/OfficialReport'|from '\.\/OfficialReport'/u.test(text)).map(([file]) => file);
    t.same(users.filter((file) => !carriers.includes(file)), [], `G1 كلّ من يستعمل variant="official" يستورد OfficialReport فتصله official.css (${users.join('، ')})`);
    t.same(
      files.filter(([, text]) => /official\.css'/u.test(text)).map(([file]) => file),
      ['src/components/ui/OfficialReport.tsx'],
      'G2 official.css يستورده OfficialReport وحده (لا DataTable: حزمته محفوظة مسبقاً)',
    );
    t.same(
      carriers.filter((file) => !/^src\/pages\/halls\/|^src\/pages\/farm\/FlockPage\.tsx$/u.test(file)),
      [],
      'G3 مستوردو OfficialReport في حزمة القاعات وحدها (HallsRoutes-*.css خارج الإقلاع والتثبيت المسبق بالاسم)',
    );
    t.same(users.sort(), ['src/pages/farm/FlockPage.tsx', 'src/pages/halls/DailyPage.tsx', 'src/pages/halls/ReportPage.tsx', 'src/pages/halls/dailyHistory.tsx'], 'G4 الجداول الرسمية: ورقة القاعة وتقرير الوجبة والتقرير اليوميّ و«منذ أن بدأنا»');
  }

  // ── W: الصفحة العريضة بالقشرة الحقيقية ─────────────────────────────────────────────────────────────────────────────
  const restore = installDom();
  try {
    const STUBS = {
      session: 'export const useSession = () => globalThis.__of.session;',
      Toast: 'export const toast = () => {}; export function Toaster() { return null; }',
    };
    const w = await bundle(
      [
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter } from 'react-router-dom';",
        "export { Shell } from './src/components/shell/Shell.tsx';",
        "export { useWidePage, infoColumns } from './src/components/ui/OfficialReport.tsx';",
        "export { wideStore } from './src/lib/wide.ts';",
      ].join('\n'),
      [
        {
          name: 'official-stubs',
          setup(b) {
            b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'of-stub' }));
            b.onLoad({ filter: /.*/, namespace: 'of-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
          },
        },
      ],
    );
    t.same([1, 2, 5, 6, 7, 8, 9, 10].map(w.infoColumns), [1, 2, 5, 3, 4, 4, 5, 5], 'W0 أعمدة شبكة البيانات: خمسة مربّعات فأقلّ صفٌّ واحد، وأكثر صفّان ممتلئان');
    globalThis.__of = {
      session: {
        status: 'ready',
        offline: false,
        workspace: { userId: 'u-of', orgId: 'org-of', orgName: 'مزرعة', memberId: 'm-of', displayName: 'علي', phone: null, role: 'owner', scopes: [], divisions: ['broiler', 'layer'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1 },
      },
    };
    function Wide() {
      w.useWidePage();
      return w.h('p', null, 'تقرير عريض');
    }
    const container = globalThis.document.createElement('div');
    globalThis.document.body.appendChild(container);
    const root = w.createRoot(container);
    const show = (wide, twice = false) =>
      w.flushSync(() => root.render(w.h(w.MemoryRouter, null, w.h(w.Shell, null, wide ? w.h(Wide) : w.h('p', null, 'صفحة عادية'), twice ? w.h(Wide) : null))));
    const main = () => descendants(globalThis.document.body).find((node) => node.localName === 'main');
    const state = () => [w.wideStore.get(), main()?.getAttribute('data-wide') ?? null, (main()?.getAttribute('class') ?? '').includes('max-w-6xl')];
    show(false);
    await settle(20);
    const plain = state();
    show(true);
    await settle(20);
    const wide = state();
    show(true, true);
    await settle(20);
    const both = state();
    show(true);
    await settle(20);
    const one = state();
    show(false);
    await settle(20);
    const back = state();
    w.flushSync(() => root.unmount());
    t.same(
      [plain, wide, both, one, back],
      [[0, null, true], [1, '', true], [2, '', true], [1, '', true], [0, null, true]],
      'W1 الصفحة العريضة تزيد العدّاد ما دامت مركّبة، والقشرة تضع data-wide على <main> وتشيله بعد إزالتها (وصفحتان معاً عدّاد اثنان)؛ وmax-w-6xl باقٍ للباقي',
    );
  } finally {
    delete globalThis.__of;
    restore();
  }
}
