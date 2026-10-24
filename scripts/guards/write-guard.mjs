// write-guard: لا Supabase برّا src/lib/repo، ولا كتابة مباشرة (.insert/.update/.upsert/.delete) بلا updatedRows،
// ولا كتابة مباشرة أبداً بجدول ما يكتبه إلا دالّة (الدفاتر والأرصدة والمحسوبات): كل ما يمسّ مالاً أو مخزوناً نداء RPC واحد.
// برّا repo ممنوع كذلك: استيراد @supabase/ بأي شكل (import() وexport … from)، أي .rpc( أو .from('جدول')،
// واستيراد ملف داخلي من lib/repo غير index (يجيب العميل بلا المهلة وسياسة الأخطاء). الأنواع بس (import type) مسموحة.
import path from 'node:path';
import { calleeName, constValue, lineOf, literalText, parse, readSources, resolvedText, ts, walk, where } from './lib.mjs';

export const name = 'write-guard';

const WRITES = new Set(['insert', 'update', 'upsert', 'delete']);

/** «جداول ما يكتبها إلا دالّة» من نموذج البيانات بـdocs/FOUNDATION.md. */
export const FUNCTION_ONLY_TABLES = new Set([
  'stock_moves', 'flock_costs', 'flock_counts', 'hatch_candlings', 'hatch_costs', 'party_entries',
  'party_allocations', 'cash_moves', 'expenses', 'stock_lots', 'stock_balances', 'flock_daily',
  'sales_line_sources', 'sales_return_line_sources', 'party_offsets', 'flock_close_values',
  'production_values', 'production_input_values', 'sales_line_costs', 'hatch_batch_values',
  'rpc_refs', 'audit_log', 'doc_counters', 'period_locks', 'orgs', 'divisions', 'ledger_books',
  'members', 'member_scopes', 'client_versions', 'flock_day_rejects',
]);

/** يرجّع نداء .from(…) إذا السلسلة طالعة منه (منشئ استعلام Supabase)، وإلا null (Map.delete وأمثاله). */
function fromCallOf(expression) {
  let current = expression;
  const seen = new Set();
  while (current) {
    if (ts.isCallExpression(current)) {
      if (calleeName(current) === 'from' && ts.isPropertyAccessExpression(current.expression)) return current;
      current = current.expression;
    } else if (ts.isPropertyAccessExpression(current)) current = current.expression;
    else if (ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current)) {
      current = current.expression;
    } else if (ts.isIdentifier(current) && constValue(current) && !seen.has(constValue(current))) {
      // const tbl = db.from('stock_moves'); tbl.insert(…) — بأقرب نطاق، مو أي const بنفس الاسم بالملف
      const value = constValue(current);
      seen.add(value);
      current = value;
    } else return null;
  }
  return null;
}

function wrappedByUpdatedRows(node) {
  let current = node.parent;
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current)) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === 'updatedRows') return true;
    current = current.parent;
  }
  return false;
}

/** مسار الاستيراد النسبي بالنسبة لجذر المستودع: '../../lib/repo/core' من src/pages/x.tsx ← src/lib/repo/core. */
function resolveSpecifier(file, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file.path), specifier));
}

/** ملف داخلي بـsrc/lib/<dir> غير index: برّاه ياخذون من الواجهة (index) بس. */
function isInternal(file, specifier, dir) {
  const resolved = resolveSpecifier(file, specifier).replace(/\.(ts|tsx|js)$/, '');
  const prefix = `src/lib/${dir}/`;
  return resolved.startsWith(prefix) && resolved.slice(prefix.length) !== 'index';
}

function typeOnly(node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return !clause.name && Boolean(bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly));
}

/** وحدة يجيبها الملف: import وexport … from وimport(). يرجّع [نصّ المسار، أنواع بس؟] أو null. */
function moduleReference(node) {
  if (ts.isImportDeclaration(node)) return [literalText(node.moduleSpecifier), typeOnly(node)];
  if (ts.isExportDeclaration(node) && node.moduleSpecifier) return [literalText(node.moduleSpecifier), node.isTypeOnly];
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return [literalText(node.arguments[0]), false];
  return null;
}

export function check(files) {
  const problems = [];
  let writes = 0;
  for (const file of files) {
    const sourceFile = parse(file);
    const inRepo = file.path.startsWith('src/lib/repo/');
    const inOutbox = file.path.startsWith('src/lib/outbox/');
    walk(sourceFile, (node) => {
      const reference = moduleReference(node);
      if (reference && reference[0]) {
        const [specifier, onlyTypes] = reference;
        const place = where(file, lineOf(sourceFile, node));
        if (!inRepo && specifier.startsWith('@supabase/')) problems.push(`${place}: Supabase برّا src/lib/repo — الشاشات تمرّ من repo بس`);
        else if (!inRepo && !onlyTypes && isInternal(file, specifier, 'repo')) problems.push(`${place}: استيراد ${specifier} — من lib/repo (index) بس`);
        // enqueue مباشرةً يتخطّى persisted() اللي يسألها saveRound بكل حفظ جولة.
        else if (!inOutbox && !onlyTypes && isInternal(file, specifier, 'outbox')) {
          problems.push(`${place}: استيراد ${specifier} — الجولة تنحفظ بـsaveRound من lib/outbox (index) بس`);
        }
      }
      if (!ts.isCallExpression(node)) return;
      if (ts.isIdentifier(node.expression) && node.expression.text === 'createClient' && !inRepo) {
        problems.push(`${where(file, lineOf(sourceFile, node))}: createClient برّا src/lib/repo`);
      }
      if (!ts.isPropertyAccessExpression(node.expression)) return;
      const method = node.expression.name.text;
      const line = lineOf(sourceFile, node.expression.name);
      if (!inRepo && method === 'rpc') problems.push(`${where(file, line)}: .rpc برّا src/lib/repo — الدالّة تننادى من repo بس`);
      // .from('جدول') برّا repo؛ Array.from('…') وأخواته (مُنشئ باسم كبير) مو استعلام.
      const receiver = node.expression.expression;
      const constructorLike = ts.isIdentifier(receiver) && /^[A-Z]/.test(receiver.text);
      if (!inRepo && method === 'from' && !constructorLike && resolvedText(node.arguments[0]) !== null) {
        problems.push(`${where(file, line)}: .from('${resolvedText(node.arguments[0])}') برّا src/lib/repo — القراءة من repo بس`);
      }
      if (!WRITES.has(method)) return;
      const from = fromCallOf(receiver);
      if (!from) return;
      writes += 1;
      const table = resolvedText(from.arguments[0]);
      if (!inRepo) problems.push(`${where(file, line)}: كتابة برّا src/lib/repo`);
      if (table && FUNCTION_ONLY_TABLES.has(table)) {
        problems.push(`${where(file, line)}: كتابة مباشرة بـ${table} — هذا الجدول ما يكتبه إلا دالّة بالقاعدة`);
      }
      if (!wrappedByUpdatedRows(node)) problems.push(`${where(file, line)}: كتابة بلا updatedRows — ترجع صفر صفوف بصمت`);
    });
  }
  return { problems, writes };
}

export function selfTest() {
  // [المسار، عدد المخالفات، النصّ]: كل شكل لحاله حتى شكل ضايع ما يتخبّى ورا شكل ثاني.
  const bad = [
    ['src/pages/self.tsx', 1, "import { createClient } from '@supabase/supabase-js';"],
    ['src/lib/repo/self.ts', 1, "export async function a(db) { return db.from('items').update({ name: 'x' }).eq('id', 1); }"],
    ['src/lib/repo/self2.ts', 1, "export async function b(db) { return updatedRows(await db.from('stock_moves').insert({}).select()); }"],
    // بديل: العميل بمتغيّر قبل الكتابة (بلا updatedRows وبجدول دالّة).
    ['src/lib/repo/self3.ts', 2, "export async function c(db) { const tbl = db.from('stock_moves'); return tbl.insert({}); }"],
    // اسم الجدول بثابت.
    ['src/lib/repo/self4.ts', 1, "const T = 'stock_moves'; export async function d(db) { return updatedRows(await db.from(T).insert({}).select()); }"],
    // شاشة تاخذ العميل من ملف داخلي بـrepo: الاستيراد والقراءة والـrpc.
    ['src/pages/home/self5.tsx', 3, "import { db } from '../../lib/repo/core'; export const e = () => db.from('flocks').select(); export const f = () => db.rpc('post_sale', {});"],
    ['src/pages/self6.ts', 1, "export const g = () => import('@supabase/supabase-js');"],
    ['src/lib/self7.ts', 1, "export { createClient as make } from '@supabase/supabase-js';"],
    // الشاشة تحفظ الجولة بـenqueue مباشرةً بدل saveRound.
    ['src/pages/broiler/self8.tsx', 1, "import { enqueue } from '../../lib/outbox/queue'; export const s = enqueue;"],
    // نفس الاسم بدالّة ثانية ما يغطّي الأوّل: الكتابة بـstock_moves تنمسك (بلا updatedRows وبجدول دالّة).
    ['src/lib/repo/self9.ts', 2, "export async function c(db) { const q = db.from('stock_moves'); return q.insert({}); } export function m() { const q = new URLSearchParams(); q.set('a', '1'); }"],
  ];
  for (const [file, expected, text] of bad) {
    const got = check([{ path: file, text }]).problems;
    if (got.length !== expected) return `${file}: توقّعت ${expected} وطلع ${got.length}: ${got.join(' | ') || text}`;
  }
  const good = check([
    { path: 'src/lib/repo/ok.ts', text: "import { updatedRows } from './core'; export async function c(db) { await db.rpc('post_sale', {}); return updatedRows(await db.from('items').update({ name: 'x' }).eq('id', 1).select()); }" },
    { path: 'src/lib/ok.ts', text: "const seen = new Set(); seen.delete(1); const map = new Map(); map.delete(2); const digits = Array.from('123');" },
    { path: 'src/pages/home/ok.tsx', text: "import { home } from '../../lib/repo'; import type { HomeSummary } from '../../lib/repo/home'; export const h = (): Promise<HomeSummary> => home.loadHomeSummary();" },
    { path: 'src/pages/broiler/ok.tsx', text: "import { saveRound } from '../../lib/outbox'; import type { OutboxOp } from '../../lib/outbox/types'; export const s = saveRound;" },
    { path: 'src/lib/outbox/round.ts', text: "import { enqueue } from './queue'; export const r = enqueue;" },
    // اسم بنطاق ثاني: Map.delete بدالّة، وconst بنفس الاسم من .from بدالّة ثانية.
    { path: 'src/lib/repo/ok2.ts', text: "export function a(db) { const tbl = db.from('stock_moves'); return tbl; } export function b() { const tbl = new Map(); tbl.delete(1); }" },
  ]);
  if (good.problems.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${good.problems.join(' | ')}`;
  return null;
}

export function run() {
  const files = readSources('src', ['.ts', '.tsx']);
  const result = check(files);
  return {
    scanned: files.length,
    problems: result.problems,
    summary: `فحصت ${files.length} ملفاً و${result.writes} كتابة مباشرة لـSupabase`,
  };
}
