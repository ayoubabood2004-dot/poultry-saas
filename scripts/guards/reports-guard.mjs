// reports-guard: لا قراءة لجداول المال بلا مدّة (gte ويّا lte/lt) إلا بوسم /* unbounded: السبب */،
// ودوالّ report_* تننادى بمدّة إلزامية (p_from وp_to). المجاميع من دوالّ SQL مو من سحب الصفوف:
// سقف PostgREST ألف صفّ، وقائمة مقصوصة بصمت تنصدّق.
import { calleeName, hasMarker, lineOf, parse, readSources, resolvedText, ts, walk, where } from './lib.mjs';

export const name = 'reports-guard';

/** جداول المال والكلف (السياسات المقيِّدة بنموذج البيانات). */
export const MONEY_TABLES = new Set([
  'stock_lots', 'stock_moves', 'stock_balances', 'opening_lines', 'receipt_amounts', 'receipt_line_amounts',
  'receipt_charges', 'receipt_revaluations', 'supplier_return_line_amounts', 'production_values',
  'production_input_values', 'production_costs', 'hatch_batch_values', 'hatch_costs', 'flock_costs',
  'sales_line_costs', 'expenses', 'audit_log', 'party_entries', 'party_allocations', 'party_offsets',
  'cash_moves', 'sales_invoices', 'sales_lines', 'sales_returns', 'sales_line_sources', 'flock_close_values',
  'sales_return_lines', 'sales_return_line_sources', 'stock_count_line_costs',
]);

function chainMethods(fromCall) {
  const methods = [];
  let current = fromCall;
  while (current.parent && ts.isPropertyAccessExpression(current.parent) && current.parent.parent && ts.isCallExpression(current.parent.parent)) {
    methods.push(current.parent.name.text);
    current = current.parent.parent;
  }
  return methods;
}

export function check(files) {
  const problems = [];
  let reads = 0;
  let reportCalls = 0;
  for (const file of files) {
    const sourceFile = parse(file);
    // const T = 'party_entries'; db.from(T): اسم الجدول بثابت ما يعبر الحارس.
    walk(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
      const method = calleeName(node);
      const line = lineOf(sourceFile, node.expression.name);
      if (method === 'from') {
        const table = resolvedText(node.arguments[0]);
        if (!table || !MONEY_TABLES.has(table)) return;
        const methods = chainMethods(node);
        if (methods.some((m) => ['insert', 'update', 'upsert', 'delete'].includes(m))) return;
        reads += 1;
        const bounded = methods.includes('gte') && (methods.includes('lte') || methods.includes('lt'));
        if (!bounded && !hasMarker(file, line, 'unbounded:')) {
          problems.push(`${where(file, line)}: قراءة ${table} بلا مدّة — زِد gte/lte أو وسم unbounded بسببه`);
        }
      }
      if (method === 'rpc') {
        const fn = resolvedText(node.arguments[0]);
        if (!fn?.startsWith('report_')) return;
        reportCalls += 1;
        const args = node.arguments[1];
        const keys = args && ts.isObjectLiteralExpression(args) ? args.properties.map((p) => p.name?.getText(sourceFile)) : [];
        if (!(keys.includes('p_from') && keys.includes('p_to')) && !hasMarker(file, line, 'unbounded:')) {
          problems.push(`${where(file, line)}: ${fn} بلا مدّة — p_from وp_to إلزاميات`);
        }
      }
    });
  }
  return { problems, reads, reportCalls };
}

export function selfTest() {
  const bad = check([
    {
      path: 'src/lib/repo/self.ts',
      text: "export const a = (db) => db.from('party_entries').select('*'); export const b = (db) => db.rpc('report_sales', { p_from: x });",
    },
  ]);
  if (bad.problems.length !== 2) return `توقّعت مخالفتين بالمدخلات المصنوعة وطلع ${bad.problems.length}`;
  // جداول المرتجعات وكلف الجرد: مجموع مرتجع مقصوص بألف صفّ يطلّع صافي المبيعات أعلى من الحقيقي.
  for (const table of ['sales_return_lines', 'sales_return_line_sources', 'stock_count_line_costs']) {
    const got = check([{ path: 'src/lib/repo/self.ts', text: `export const r = (db) => db.from('${table}').select('*');` }]);
    if (got.problems.length !== 1) return `قراءة ${table} بلا مدّة ما انمسكت`;
  }
  const named = check([{ path: 'src/lib/repo/self.ts', text: "const T = 'party_entries'; export const n = (db) => db.from(T).select('*');" }]);
  if (named.problems.length !== 1) return 'اسم جدول بثابت عبر بلا مدّة';
  // نفس الاسم بدالّة ثانية ما يغطّي الثابت: القيمة من أقرب نطاق.
  const scoped = check([
    {
      path: 'src/lib/repo/self.ts',
      text: "export function a(db) { const T = 'party_entries'; return db.from(T).select('*'); } export function b() { const T = 'x'; return T; }",
    },
  ]);
  if (scoped.problems.length !== 1) return 'ثابت باسم مكرّر بدالّة ثانية غطّى جدول المال';
  const good = check([
    {
      path: 'src/lib/repo/ok.ts',
      text: "export const c = (db) => db.from('party_entries').select('*').gte('on_date', a).lte('on_date', b); export const d = (db) => db.rpc('report_sales', { p_from: a, p_to: b }); export const e = (db) => db.from('items').select('*');",
    },
  ]);
  if (good.problems.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${good.problems.join(' | ')}`;
  return null;
}

export function run() {
  const files = readSources('src/lib/repo', ['.ts']);
  const result = check(files);
  return {
    scanned: files.length,
    problems: result.problems,
    summary: `فحصت ${files.length} ملفاً بـsrc/lib/repo: ${result.reads} قراءة لجداول المال و${result.reportCalls} نداء report_*`,
  };
}
