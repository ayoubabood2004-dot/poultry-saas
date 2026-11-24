// الجداول والتقارير الرسمية (عقد 0036 الجزء S1، كلمة المالك 2026-11-24: «مرتّبة بشكل رسمي وتاخذ حجم اكبر من الشاشة لدون ما تنحذف او تختفي منها كلمات
// ويكون الكلام الي بيها واضح ايضا واسماء الجداول يكون بيها لون بالخلفية مالتها مثل ترتيب المستشفيات»، و«تطلع بشكل رسمي مثل تقارير المستشفيات»).
// P الجدول العاديّ (بلا variant أو 'plain') بالعلامات نفسها حرفاً حرفاً كما قبل 0036: لقطاتها في fixtures/datatable-plain.json أُخذت من المصدر قبل التغيير
//   (DATATABLE_PLAIN_OUT=1 يعيد كتابتها، ولا يُستعمل إلّا على مصدر لم يتغيّر فيه الجدول العاديّ).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAIN_FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'datatable-plain.json');

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
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
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
}
