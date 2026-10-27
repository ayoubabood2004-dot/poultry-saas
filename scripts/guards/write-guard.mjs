// write-guard: لا Supabase برّا src/lib/repo، ولا كتابة مباشرة (.insert/.update/.upsert) بلا updatedRows،
// ولا كتابة مباشرة أبداً بجدول ما يكتبه إلا دالّة (الدفاتر والأرصدة والمحسوبات): كل ما يمسّ مالاً أو مخزوناً نداء RPC واحد.
// برّا repo ممنوع كذلك: استيراد @supabase/ بأي شكل (import() وexport … from)، أي .rpc( أو .from('جدول')،
// واستيراد ملف داخلي من lib/repo غير index (يجيب العميل بلا المهلة وسياسة الأخطاء). الأنواع بس (import type) مسموحة.
// المرحلة 1 (الخطّة §2.2 و§2.5، GT-21): «ما يكتبه إلا دالّة» من classes.json؛ ماكو .delete( بـrepo أبداً (E52: السطر
// ينشال بـdelete_draft_line)؛ دوالّ الترحيل والإلغاء والتسديد تاخذ p_client_ref، ودوالّ المسوّدة p_expected_version؛ وحمولة
// الكتابة المباشرة ما بيها عمود يكتبه الخادم بس (الحالة والرقم والنسخة والمحسوبات والمنشأة): المفاتيح الثابتة بالكائن تنقرا
// حتى ويّا ...نشر، والحمولة المتغيّرة (Partial<…> بالحقول المتغيّرة، §2.5) تنقرا بنوعها من مدقّق TypeScript؛ نوع مفتوح
// (any، Record<string, …>) ما يعبر، وماكو وسم يعفي. وبـrepo: .delete( على أي شي غير Map/Set وأخواتها ممنوع، وكتابة على
// منشئ ما ينعرف جدوله (من دالّة أو معامل أو let) ممنوعة، واسم دالّة ما ينقرا ممنوع إلا داخل call نفسها بـcore.ts.
import path from 'node:path';
import { functionOnlyTables, loadClasses } from './classes.mjs';
import { appProgram, calleeName, constValue, lineOf, literalText, parse, readSources, resolvedText, ROOT, ts, virtualProgram, walk, where } from './lib.mjs';

export const name = 'write-guard';

const WRITES = new Set(['insert', 'update', 'upsert', 'delete']);

/** «جداول ما يكتبها إلا دالّة»: من supabase/tests/classes.json (الموجود والمحجوز). */
export const FUNCTION_ONLY_TABLES = functionOnlyTables();

const REF_NAMED = new Set(['pay_party', 'forgive_debt', 'refresh_count', 'return_count', 'transfer_cash']);
const VERSION_NAMED = new Set(['refresh_count', 'return_count', 'discard_draft', 'delete_draft_line', 'delete_receipt_charge', 'set_charge_lines']);
/** الدالّة تحرّك مالاً أو مخزوناً: المرجع نفسه لحد ما تنعرف النتيجة (FOUNDATION ٥١٩). */
export const needsClientRef = (fn) => /^(?:post|void|record|submit)_/.test(fn) || REF_NAMED.has(fn);
/** الدالّة تقرأ مسوّدة: تنرسل بشرط إنها كما انفتحت (FOUNDATION ٥٢٠، ٨١٧). */
export const needsExpectedVersion = (fn) => /^(?:post|submit)_/.test(fn) || VERSION_NAMED.has(fn);

/** أعمدة يكتبها الخادم بس: الحالة والرقم والنسخة وختم الترحيل والإلغاء والدفتر والمحسوبات والمنشأة (§2.5). */
const SERVER_COLUMNS = new Set([
  'status', 'doc_no', 'version', 'book_id', 'discount_share', 'charge_share', 'gain_value', 'shortage_value', 'system_qty',
  'system_expired_qty', 'diff', 'org_id',
]);
const serverColumn = (key) => SERVER_COLUMNS.has(key) || /^(?:posted|voided)_/.test(key);

/**
 * مفاتيح كائن ثابت (أو const قيمته كائن، أو مصفوفة كائنات): { keys, complete }. complete = false إذا بيه ...نشر أو اسم
 * محسوب ما ينقرا أو مو كائن أصلاً (متغيّر، نداء)، والمفاتيح الثابتة اللي بجنبه تنقرا بكل حال: { ...p, org_id } يبين org_id.
 */
function literalKeys(node, seen = new Set()) {
  if (!node) return { keys: [], complete: false };
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) return literalKeys(node.expression, seen);
  if (ts.isIdentifier(node)) {
    const value = constValue(node);
    if (!value || seen.has(value)) return { keys: [], complete: false };
    seen.add(value);
    return literalKeys(value, seen);
  }
  if (ts.isArrayLiteralExpression(node)) {
    const keys = [];
    let complete = true;
    for (const element of node.elements) {
      const inner = literalKeys(element, seen);
      keys.push(...inner.keys);
      complete &&= inner.complete;
    }
    return { keys, complete };
  }
  if (!ts.isObjectLiteralExpression(node)) return { keys: [], complete: false };
  const keys = [];
  let complete = true;
  for (const property of node.properties) {
    const name = property.name;
    const assigned = ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property);
    if (ts.isShorthandPropertyAssignment(property)) keys.push(name.text);
    else if (assigned && name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))) keys.push(name.text);
    else if (assigned && name && ts.isComputedPropertyName(name) && resolvedText(name.expression) !== null) keys.push(resolvedText(name.expression));
    else complete = false;
  }
  return { keys, complete };
}

/**
 * أسماء خصائص النوع (للمصفوفة نوع عنصرها، وللاتّحاد كل أعضائه)، أو null إذا النوع ما يحدّد مفاتيحه: any وunknown
 * ومعامل نوع بلا قيد وتوقيع فهرس نصّي (Record<string, …>) وغير الكائن.
 */
function typeKeys(checker, type, depth = 0) {
  if (!type || depth > 4) return null;
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return null;
  if (type.isUnion()) {
    const keys = [];
    for (const member of type.types) {
      if (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
      const inner = typeKeys(checker, member, depth + 1);
      if (inner === null) return null;
      keys.push(...inner);
    }
    return keys;
  }
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint && constraint !== type ? typeKeys(checker, constraint, depth + 1) : null;
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const keys = [];
    for (const element of checker.getTypeArguments(type)) {
      const inner = typeKeys(checker, element, depth + 1);
      if (inner === null) return null;
      keys.push(...inner);
    }
    return keys;
  }
  if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) return null;
  if (checker.getIndexInfosOfType(type).some((info) => info.keyType.flags & (ts.TypeFlags.String | ts.TypeFlags.Any))) return null;
  return checker.getPropertiesOfType(type).map((symbol) => symbol.getName());
}

/** أنواع بيها .delete( مو حذف بالقاعدة: مجموعات الذاكرة وأخواتها. */
const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'URLSearchParams', 'Headers', 'FormData']);

function typeName(type) {
  return (type?.aliasSymbol ?? type?.getSymbol?.())?.getName() ?? null;
}

/** المستقبِل منشئ Supabase أو ما ينعرف نوعه (any، unknown، خطأ): الكتابة عليه بلا .from(…) بالسلسلة ما تنفحص. */
function maybeBuilder(type) {
  if (!type || type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
  if (type.isUnion()) return type.types.some(maybeBuilder);
  return /^Postgrest/.test(typeName(type) ?? '');
}

/** اسم دالّة النداء: نصّ ثابت أو const، أو بادئة قالب (`post_${kind}`) أو بادئة جمع ('post_' + k)؛ وإلا null. */
function rpcName(node) {
  const direct = resolvedText(node);
  if (direct !== null) return direct;
  if (!node) return null;
  if (ts.isTemplateExpression(node)) return node.head.text || null;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return rpcName(node.left);
  if (ts.isParenthesizedExpression(node)) return rpcName(node.expression);
  return null;
}

/** أقرب دالّة مسمّاة (function call(…) {…}) حوالين العقدة، عبر الأسهم. */
function enclosingFunctionName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isMethodDeclaration(current)) return current.name?.getText() ?? null;
  }
  return null;
}

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

/**
 * ملفات repo الكسولة لكل وحدة (الخطّة E39، وسقف مسار الجلسة الحرج بـDECISIONS «السقوف»): الشاشة تستوردها مباشرةً فتدخل
 * حزمتها، وindex ما يصدّرها (وإلا تدخل مسار الجلسة لكل مستخدم). بيها call/send من core نفسها، فالمهلة وسياسة الأخطاء ويّاها؛
 * وcore وclient وباقي الملفات الداخلية تبقى ممنوعة برّا repo. المرحلة 1 WP3: الموظفون والرئيسية (members وhome) طلعوا من
 * index لحزم شاشاتهم (مسار الجلسة كان على بعد 212 بايت من سقفه)، والجهات والصناديق (parties وcash) ملفّان جديدان، والدخول
 * والتسجيل (signin) يحمّله session.tsx بـimport() لحظة الدخول بس.
 */
export const PAGE_MODULES = new Set(['inventory', 'scopes', 'members', 'home', 'parties', 'cash', 'signin']);

/** المسار ملف وحدة كسول بـrepo (src/lib/repo/inventory.ts …). */
const isPageModule = (resolved) => {
  const match = /^src\/lib\/repo\/([^/]+?)(?:\.(?:ts|tsx|js))?$/.exec(resolved);
  return Boolean(match && PAGE_MODULES.has(match[1]));
};

/**
 * جذور مسار الجلسة الحرج (bundle-guard SESSION_ENTRIES وحزمة الإقلاع): الإقلاع، ووحدة الجلسة، وكل ملف بـrepo غير ملفات
 * الوحدات الكسولة (index يصدّرهم أو يستوردهم بعضهم).
 */
const isSessionRoot = (filePath) => filePath === 'src/main.tsx' || filePath === 'src/lib/sessionFlow.ts' || (filePath.startsWith('src/lib/repo/') && !isPageModule(filePath));

/** استيراد ثابت مو أنواع بس (import … from وexport … from): هذا يدخل حزمة المستورِد؛ import() يطلع حزمة لحالها. */
function staticReference(node) {
  if (ts.isImportDeclaration(node) && !typeOnly(node)) return literalText(node.moduleSpecifier);
  if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) return literalText(node.moduleSpecifier);
  return null;
}

/**
 * الملفات اللي توصلها جذور مسار الجلسة بالاستيراد الثابت (بين الملفات المعطاة). ملف وحدة كسول بهالسلسلة يدخل حزمة كل مستخدم
 * قبل أوّل شاشة؛ ما ينطاف للسلسلة (الحارس يسمّي الاستيراد اللي جابه).
 */
function sessionReachable(files) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const resolveFile = (from, specifier) => {
    const base = resolveSpecifier(from, specifier);
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => byPath.has(candidate)) ?? null;
  };
  const reached = new Set();
  const queue = files.filter((file) => isSessionRoot(file.path)).map((file) => file.path);
  while (queue.length) {
    const current = queue.pop();
    if (reached.has(current)) continue;
    reached.add(current);
    const file = byPath.get(current);
    walk(parse(file), (node) => {
      const specifier = staticReference(node);
      if (!specifier || !specifier.startsWith('.')) return;
      const target = resolveFile(file, specifier);
      if (target && !isPageModule(target) && !reached.has(target)) queue.push(target);
    });
  }
  return reached;
}

/** ملف داخلي بـsrc/lib/<dir> غير index: برّاه ياخذون من الواجهة (index) بس، أو من ملف وحدة كسول بـrepo. */
function isInternal(file, specifier, dir) {
  const resolved = resolveSpecifier(file, specifier).replace(/\.(ts|tsx|js)$/, '');
  const prefix = `src/lib/${dir}/`;
  if (!resolved.startsWith(prefix)) return false;
  const name = resolved.slice(prefix.length);
  return name !== 'index' && !(dir === 'repo' && PAGE_MODULES.has(name));
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

/** program: برنامج مدقّق TypeScript بيه الملفات (بلاه ينبني برنامج بالذاكرة منها). */
export function check(files, program = virtualProgram(files, { options: { noResolve: true } })) {
  const problems = [];
  let writes = 0;
  let rpcCalls = 0;
  const checker = program.getTypeChecker();
  const onSessionPath = sessionReachable(files);
  for (const file of files) {
    const fromProgram = program.getSourceFile(path.resolve(ROOT, file.path));
    const sourceFile = fromProgram ?? parse(file);
    // ملف برّا البرنامج: النوع ما ينعرف، فكل حمولة متغيّرة وكل مستقبِل «ما ينعرف».
    const typeOf = (node) => (fromProgram ? checker.getTypeAtLocation(node) : null);
    const inRepo = file.path.startsWith('src/lib/repo/');
    const inOutbox = file.path.startsWith('src/lib/outbox/');
    walk(sourceFile, (node) => {
      const reference = moduleReference(node);
      if (reference && reference[0]) {
        const [specifier, onlyTypes] = reference;
        const place = where(file, lineOf(sourceFile, node));
        if (onSessionPath.has(file.path) && staticReference(node) && specifier.startsWith('.') && isPageModule(resolveSpecifier(file, specifier))) {
          problems.push(`${place}: ${specifier} بمسار الجلسة الحرج (${file.path} من الإقلاع أو وحدة الجلسة أو repo) — ملف الوحدة الكسول يتحمّل لكل مستخدم قبل أوّل شاشة؛ الشاشة تستورده مباشرةً`);
        }
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
      // نداء دالّة بالقاعدة من repo: call('post_x', {…}) أو db.rpc('post_x', {…}). اسم بقالب (`post_${kind}`) أو جمع
      // ('post_' + k) يتحكم ببادئته: الترحيل العامّ لكل نوع مستند ما يعبر بلا مرجع. واسم ما ينقرا (معامل، let، غلاف عامّ
      // postDoc(fn, args)) ممنوع: النداء يعبر بلا ما ينعرف إنه ترحيل؛ الاستثناء الوحيد call نفسها بـcore.ts.
      const isCall = ts.isIdentifier(node.expression) && node.expression.text === 'call';
      const isRpc = ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'rpc';
      if (inRepo && (isCall || isRpc)) {
        const fn = rpcName(node.arguments[0]);
        const place = where(file, lineOf(sourceFile, node));
        if (fn === null) {
          if (!(file.path === 'src/lib/repo/core.ts' && enclosingFunctionName(node) === 'call')) {
            problems.push(`${place}: اسم الدالّة ما ينقرا — اكتبه نصّاً ثابتاً بالنداء حتى يبين إنه ترحيل ويتفحص p_client_ref وp_expected_version`);
          }
        } else if (needsClientRef(fn) || needsExpectedVersion(fn)) {
          rpcCalls += 1;
          const { keys, complete } = literalKeys(node.arguments[1]);
          const missingRef = needsClientRef(fn) && !keys.includes('p_client_ref');
          const missingVersion = needsExpectedVersion(fn) && !keys.includes('p_expected_version');
          if (!complete && (missingRef || missingVersion)) problems.push(`${place}: ${fn} بمعاملات ما تنقرا — اكتبها كائناً ثابتاً حتى يبين p_client_ref وp_expected_version`);
          else {
            if (missingRef) problems.push(`${place}: ${fn} بلا p_client_ref — الإعادة بعد نتيجة مجهولة تضاعف`);
            if (missingVersion) problems.push(`${place}: ${fn} بلا p_expected_version — مسوّدة تغيّرت بعد المعاينة تنرحّل`);
          }
        }
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
      if (!from) {
        // بـrepo: .delete( على أي شي غير مجموعة بالذاكرة (Map، Set…) حذف (E52)؛ وكتابة على منشئ ما يبين جدوله (من دالّة
        // مساعدة أو معامل أو let) ما تنفحص (جدول دالّة، updatedRows)، فتنكتب db.from('الجدول') بنفس السلسلة.
        if (!inRepo) return;
        const type = typeOf(receiver);
        if (method === 'delete') {
          if (!COLLECTIONS.has(typeName(type) ?? '')) {
            problems.push(`${where(file, line)}: .delete( بـrepo على «${receiver.getText(sourceFile).slice(0, 30)}» — ماكو حذف أبداً (E52)، والحذف بالذاكرة على Map/Set بس`);
          }
        } else if (maybeBuilder(type)) {
          problems.push(`${where(file, line)}: ${method} على منشئ ما يبين جدوله — اكتبها db.from('الجدول').${method}(…) بنفس السلسلة حتى ينفحص الجدول وupdatedRows`);
        }
        return;
      }
      writes += 1;
      const table = resolvedText(from.arguments[0]);
      if (!inRepo) problems.push(`${where(file, line)}: كتابة برّا src/lib/repo`);
      if (table && FUNCTION_ONLY_TABLES.has(table)) {
        problems.push(`${where(file, line)}: كتابة مباشرة بـ${table} — هذا الجدول ما يكتبه إلا دالّة بالقاعدة`);
      }
      if (!wrappedByUpdatedRows(node)) problems.push(`${where(file, line)}: كتابة بلا updatedRows — ترجع صفر صفوف بصمت`);
      if (inRepo && method === 'delete') {
        problems.push(`${where(file, line)}: .delete( بـrepo — ماكو حذف أبداً (E52): السطر ينشال بـdelete_draft_line والسجلّ ينؤرشف`);
        return;
      }
      if (!inRepo) return;
      // الحمولة: المفاتيح الثابتة (حتى ويّا ...نشر) ونوعها من المدقّق. عمود يكتبه الخادم بأيّهما مخالفة؛ وحمولة ناقصة
      // القراءة (نشر أو متغيّر) لازم نوعها يحدّد مفاتيحه. ماكو وسم يعفي (CLAUDE.md: ما تسكّت حارساً).
      const payload = node.arguments[0];
      const literal = literalKeys(payload);
      const typed = payload ? typeKeys(checker, typeOf(payload)) : null;
      const banned = [...new Set([...literal.keys, ...(typed ?? [])].filter(serverColumn))];
      if (banned.length) problems.push(`${where(file, line)}: ${method} يكتب ${banned.join('، ')} — هذي يكتبها الخادم بس (§2.5)`);
      else if (!literal.complete && typed === null) {
        problems.push(`${where(file, line)}: حمولة ${method} ما تنقرا — كائن ثابت، أو متغيّر نوعه يحدّد حقوله (Partial<Pick<…>>) بلا عمود يكتبه الخادم`);
      }
    });
  }
  return { problems, writes, rpcCalls };
}

// القوائم كما تكتبها الخطّة (WP0 «write-guard» و§2.5)، مستقلّة عن ثوابت الحارس: حذف اسم من الحارس ينمسك هنا.
const PLAN_REF_CALLS = ['post_receipt', 'void_receipt', 'record_party_payment', 'record_expense', 'submit_count', 'pay_party', 'forgive_debt', 'refresh_count', 'return_count', 'transfer_cash'];
const PLAN_VERSION_CALLS = ['post_receipt', 'submit_count', 'refresh_count', 'return_count', 'discard_draft', 'delete_draft_line', 'delete_receipt_charge', 'set_charge_lines'];
const PLAN_SERVER_COLUMNS = [
  'status', 'doc_no', 'version', 'posted_at', 'posted_by', 'voided_at', 'voided_by', 'book_id', 'discount_share', 'charge_share',
  'gain_value', 'shortage_value', 'system_qty', 'system_expired_qty', 'diff', 'org_id',
];

export function selfTest() {
  // [المسار، عدد المخالفات، النصّ، وما تسمّيه المخالفة]: كل شكل لحاله حتى شكل ضايع ما يتخبّى ورا شكل ثاني.
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
    // المرحلة 1: المرجع والنسخة بنداءات الترحيل والمسوّدة، كل نقص لحاله مرّة وحدة.
    ['src/lib/repo/ref1.ts', 1, "export const a = (id, v) => call('post_receipt', { p_id: id, p_expected_version: v });"],
    ['src/lib/repo/ref2.ts', 1, "export const b = (k, id) => call('discard_draft', { p_doc_kind: k, p_id: id });"],
    ['src/lib/repo/ref3.ts', 1, "export const c = (db, args) => db.rpc('void_transfer', args);"],
    ['src/lib/repo/ref4.ts', 2, "export const d = (id) => call('submit_count', { p_id: id });"],
    ['src/lib/repo/ref5.ts', 1, "export const e = (id) => call('pay_party', { p_id: id, ...rest });"],
    ['src/lib/repo/ref6.ts', 2, 'export const k = (kind, id) => call(`post_${kind}`, { p_id: id });'],
    // ماكو حذف (E52)، وحمولة بعمود يكتبه الخادم، وحمولة ما تنقرا.
    ['src/lib/repo/del.ts', 1, "export const f = async (db) => updatedRows(await db.from('items').delete().eq('id', 1).select());"],
    ['src/lib/repo/pay1.ts', 1, "export const g = async (db, n) => updatedRows(await db.from('sites').update({ name: n, status: 'posted' }).eq('id', 1).select());"],
    ['src/lib/repo/pay2.ts', 1, "export const h = async (db, n, o) => updatedRows(await db.from('sites').insert([{ name: n, org_id: o }]).select());"],
    ['src/lib/repo/pay3.ts', 1, "export const i = async (db, x) => updatedRows(await db.from('sites').update({ posted_at: x }).eq('id', 1).select());"],
    ['src/lib/repo/pay4.ts', 1, "export const j = async (db, patch) => updatedRows(await db.from('sites').update(patch).eq('id', 1).select());"],
    // المراجعة العدائية: الوسم ما يعفي بعد، والمفتاح الثابت جنب ...نشر ينقرا، والحمولة المتغيّرة بنوعها.
    ['src/lib/repo/pay5.ts', 1, "export const a = async (db, p) => updatedRows(await db.from('sites').update({ ...p, org_id: 'x' }).eq('id', 1).select()); // payload-ok: x"],
    ['src/lib/repo/pay6.ts', 1, "export const a = async (db, p) => updatedRows(await db.from('sites').update({ ...p, status: 'posted', version: 3 }).eq('id', 1).select()); // payload-ok: x"],
    ['src/lib/repo/pay7.ts', 1, "export const a = async (db) => updatedRows(await db.from('sites').update({ ['org_id']: 'x' }).eq('id', 1).select()); // payload-ok: x"],
    ['src/lib/repo/pay8.ts', 1, "export const a = async (db, patch) => updatedRows(await db.from('sites').update(patch).eq('id', 1).select()); // payload-ok: x"],
    ['src/lib/repo/pay9.ts', 1, "export const a = async (db: any, patch: Partial<{ name: string; version: number }>) => updatedRows(await db.from('sites').update(patch).eq('id', 1).select());"],
    ['src/lib/repo/pay10.ts', 1, "export const a = async (db: any, patch: Record<string, unknown>) => updatedRows(await db.from('sites').update(patch).eq('id', 1).select());"],
    ['src/lib/repo/pay11.ts', 1, "export const a = async (db: any, rows: { name: string; org_id: string }[]) => updatedRows(await db.from('sites').insert(rows).select());"],
    // الاسم المحسوب جنب ...نشر بنوع مفتوح: النوع ما يقرّر (any)، فالمفتاح ينقرا من النصّ نفسه ويتسمّى.
    ['src/lib/repo/pay12.ts', 1, "export const a = async (db, p) => updatedRows(await db.from('sites').update({ ...p, ['org_id']: 'x' }).eq('id', 1).select());", 'org_id'],
    // منشئ ما يبين جدوله (دالّة مساعدة، معامل، let)، واسم دالّة ما ينقرا (معامل، جمع، غلاف عامّ، قالب بلا بادئة).
    ['src/lib/repo/del2.ts', 1, "const items = (db) => db.from('items'); export const f = async (db) => updatedRows(await items(db).delete().eq('id', 1).select());"],
    ['src/lib/repo/del3.ts', 1, "export const f = async (q) => updatedRows(await q.delete().eq('id', 1).select());"],
    ['src/lib/repo/del4.ts', 1, "export const f = async (db) => { let q = db.from('items'); return updatedRows(await q.delete().eq('id', 1).select()); };"],
    ['src/lib/repo/ins1.ts', 1, "const moves = (db) => db.from('stock_moves'); export const f = async (db) => updatedRows(await moves(db).insert({ qty: 1 }).select());"],
    ['src/lib/repo/rpc1.ts', 1, 'export const f = (fn, id) => call(fn, { p_id: id });'],
    ['src/lib/repo/rpc2.ts', 1, 'export const f = (db, fn) => db.rpc(fn, {});'],
    ['src/lib/repo/rpc3.ts', 1, "export const f = (k, id, v) => call('post_' + k, { p_id: id, p_expected_version: v });"],
    ['src/lib/repo/rpc4.ts', 1, "const postDoc = (fn, args) => call(fn, args); export const f = (id) => postDoc('post_receipt', { p_id: id });"],
    ['src/lib/repo/rpc5.ts', 1, 'export const f = (k, id) => call(`${k}_receipt`, { p_id: id });'],
    // طفرات الاختبار: كل دالّة تسمّيها الخطّة (WP0) وكل عمود يكتبه الخادم (§2.5) لحاله، والمخالفة تسمّي الناقص أو العمود.
    ...PLAN_REF_CALLS.map((fn, i) => [`src/lib/repo/needref${i}.ts`, 1, `export const a = (id, v) => call('${fn}', { p_id: id, p_expected_version: v });`, 'p_client_ref']),
    ...PLAN_VERSION_CALLS.map((fn, i) => [`src/lib/repo/needver${i}.ts`, 1, `export const a = (id, r) => call('${fn}', { p_id: id, p_client_ref: r });`, 'p_expected_version']),
    ...PLAN_SERVER_COLUMNS.map((column, i) => [`src/lib/repo/col${i}.ts`, 1, `export const a = async (db, n) => updatedRows(await db.from('sites').update({ name: n, ${column}: 1 }).eq('id', 1).select());`, column]),
    // ملفات الوحدات الكسولة (WP2): index ما يصدّرها، والشاشة ما تاخذ ملفاً داخلياً غيرها (قاموس القيود، core).
    ['src/lib/repo/index.ts', 1, "export * as inventory from './inventory';", 'مسار الجلسة'],
    // مسار الجلسة كلّه، مو index بس: ملف repo يصدّره index، ووحدة الجلسة، والإقلاع، يستوردون ملف وحدة كسول (استيراداً ثابتاً).
    ['src/lib/repo/auth.ts', 1, "import { setMemberScopesV2 } from './scopes'; export const s = setMemberScopesV2;", 'مسار الجلسة'],
    // WP3: الموظفون والرئيسية والجهات ملفات كسولة: index يصدّرها = مسار الجلسة.
    ['src/lib/repo/index.ts', 1, "export * as members from './members';", 'مسار الجلسة'],
    ['src/lib/repo/workspace.ts', 1, "import { recordPayment } from './parties'; export const r = recordPayment;", 'مسار الجلسة'],
    ['src/lib/repo/workspace.ts', 1, "export * from './inventory';", 'مسار الجلسة'],
    ['src/lib/sessionFlow.ts', 1, "import { listItems } from './repo/inventory'; export const l = listItems;", 'مسار الجلسة'],
    ['src/main.tsx', 1, "import { loadScopeTargets } from './lib/repo/scopes'; export const x = loadScopeTargets;", 'مسار الجلسة'],
    ['src/pages/inventory/bad1.tsx', 1, "import { STORES_CONSTRAINT_HINTS } from '../../lib/repo/constraints-stores'; export const h = STORES_CONSTRAINT_HINTS;"],
    ['src/pages/inventory/bad2.tsx', 1, "import { call } from '../../lib/repo/core'; import * as inventory from '../../lib/repo/inventory'; export const c = [call, inventory];"],
    // إعفاء ملفات الوحدات الكسولة لـrepo بس: ملف داخلي بـoutbox بنفس الاسم يبقى داخلياً (اختبار الطفرات WP2).
    ['src/pages/inventory/bad3.tsx', 1, "import { q } from '../../lib/outbox/scopes'; export const x = q;"],
  ];
  // المخالفة نفسها مو أي مخالفة: الحذف باسمه (E52)، والعمود الثابت جنب ...نشر أو باسم محسوب باسمه (مو «ما تنقرا»).
  const mentions = { 'src/lib/repo/del.ts': 'E52', 'src/lib/repo/pay5.ts': 'org_id', 'src/lib/repo/pay6.ts': 'status', 'src/lib/repo/pay7.ts': 'org_id' };
  const derived = ['stock_moves', 'audit_log', 'units', 'receipt_revaluations', 'members'].filter((table) => !FUNCTION_ONLY_TABLES.has(table));
  if (derived.length) return `جداول ناقصة من «ما يكتبه إلا دالّة» المشتقّة من classes.json: ${derived.join('، ')}`;
  const fake = functionOnlyTables(loadClasses('{"functionOnly": ["a"], "reserved": {"functionOnly": ["b"]}}'));
  if ([...fake].join() !== 'a,b') return `الاشتقاق من classes.json ما جمع الموجود والمحجوز: ${[...fake].join()}`;
  // كل الحالات ببرنامج واحد (كل وحدة بملفها)، وكل ملف ينفحص لحاله.
  const goodFiles = [
    { path: 'src/lib/repo/ok.ts', text: "import { updatedRows } from './core'; export async function c(db, r) { await db.rpc('post_sale', { p_id: 1, p_expected_version: 2, p_client_ref: r }); return updatedRows(await db.from('items').update({ name: 'x' }).eq('id', 1).select()); }" },
    {
      path: 'src/lib/repo/ok3.ts',
      text: [
        "export const a = (id, v, ref) => call('post_receipt', { p_id: id, p_expected_version: v, p_client_ref: ref });",
        "export const b = (id, ref) => call('void_receipt', { p_id: id, p_client_ref: ref });",
        "export const c = (id) => call('preview_receipt', { p_id: id });",
        "export const d = (k, id, v) => call('discard_draft', { p_doc_kind: k, p_id: id, p_expected_version: v });",
        "export const e = (id, ref) => { const args = { p_id: id, p_client_ref: ref }; return call('pay_party', args); };",
        "export const f = async (db, n, v) => updatedRows(await db.from('sites').update({ name: n }).eq('version', v).select());",
        "export const g = async (db: any, patch: Partial<{ name: string; note: string }>) => updatedRows(await db.from('sites').update(patch).eq('id', 1).select());",
        "export const h = async (db: any, p: { name: string }) => updatedRows(await db.from('sites').update({ ...p, note: 'x' }).eq('id', 1).select());",
      ].join('\n'),
    },
    // call نفسها بـcore.ts (الغلاف الوحيد باسم متغيّر)، والحذف من Map وSet بالذاكرة.
    { path: 'src/lib/repo/core.ts', text: 'export async function call(fn: string, args?: Record<string, unknown>) { return send((db: any) => db.rpc(fn, args)); }' },
    { path: 'src/lib/repo/ok4.ts', text: 'const memory = new Map<string, string>(); export const r = (k: string) => void memory.delete(k); const listeners = new Set<() => void>(); export const u = (l: () => void) => listeners.delete(l);' },
    { path: 'src/lib/ok.ts', text: "const seen = new Set(); seen.delete(1); const map = new Map(); map.delete(2); const digits = Array.from('123');" },
    { path: 'src/pages/home/ok.tsx', text: "import * as home from '../../lib/repo/home'; import type { HomeSummary } from '../../lib/repo/home'; export const h = (): Promise<HomeSummary> => home.loadHomeSummary();" },
    { path: 'src/pages/accounts/ok.tsx', text: "import * as parties from '../../lib/repo/parties'; import * as cash from '../../lib/repo/cash'; export const p = [parties, cash];" },
    { path: 'src/pages/broiler/ok.tsx', text: "import { saveRound } from '../../lib/outbox'; import type { OutboxOp } from '../../lib/outbox/types'; export const s = saveRound;" },
    { path: 'src/pages/inventory/ok.tsx', text: "import * as inventory from '../../lib/repo/inventory'; import type { ItemRow } from '../../lib/repo/inventory'; export const l = inventory.listItems;" },
    { path: 'src/lib/outbox/round.ts', text: "import { enqueue } from './queue'; export const r = enqueue;" },
    // اسم بنطاق ثاني: Map.delete بدالّة، وconst بنفس الاسم من .from بدالّة ثانية.
    { path: 'src/lib/repo/ok2.ts', text: "export function a(db) { const tbl = db.from('stock_moves'); return tbl; } export function b() { const tbl = new Map(); tbl.delete(1); }" },
    // كل دالّة الخطّة بمرجعها ونسختها تعبر، وبادئة تنقرا (بالجمع أو بالقالب) لدالّة مو ترحيل تعبر بلاهم.
    {
      path: 'src/lib/repo/ok5.ts',
      text: [
        ...[...new Set([...PLAN_REF_CALLS, ...PLAN_VERSION_CALLS])].map((fn, i) => `export const f${i} = (id, v, r) => call('${fn}', { p_id: id, p_expected_version: v, p_client_ref: r });`),
        "export const g = (k, id) => call('preview_' + k, { p_id: id });",
        'export const h = (k, id) => call(`preview_${k}`, { p_id: id });',
      ].join('\n'),
    },
  ];
  const badFiles = bad.map(([file, , text]) => ({ path: file, text }));
  const program = virtualProgram([...badFiles, ...goodFiles], { options: { noResolve: true } });
  for (const [file, expected, text, mention = mentions[file]] of bad) {
    const got = check([{ path: file, text }], program).problems;
    if (got.length !== expected) return `${file}: توقّعت ${expected} وطلع ${got.length}: ${got.join(' | ') || text}`;
    if (mention && !got.every((problem) => problem.includes(mention))) return `${file}: المخالفة ما تسمّي ${mention}: ${got.join(' | ')}`;
  }
  const good = check(goodFiles, program);
  if (good.problems.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${good.problems.join(' | ')}`;
  // index السليم (ببرنامجه، نفس مسار الحالة السيّئة): يصدّر الوحدات القديمة وcore، مو ملف وحدة كسول.
  const index = check([{ path: 'src/lib/repo/index.ts', text: "export * as auth from './auth'; export { updatedRows } from './core';" }]);
  if (index.problems.length !== 0) return `index السليم طلع مخالفات: ${index.problems.join(' | ')}`;
  // مسار الجلسة السليم: نوع بس من ملف كسول، واستيراد كسول (import()) يطلع حزمة لحالها، وملف كسول يستورد ملفاً كسولاً.
  const sessionGood = check([
    { path: 'src/lib/repo/auth.ts', text: "import type { ScopeTarget } from './scopes'; export type { ItemRow } from './inventory'; export type T = ScopeTarget;" },
    { path: 'src/lib/sessionFlow.ts', text: "export const later = () => import('./repo/scopes');" },
    { path: 'src/lib/repo/inventory.ts', text: "import { setMemberScopesV2 } from './scopes'; export const s = setMemberScopesV2;" },
  ]);
  if (sessionGood.problems.length !== 0) return `مسار الجلسة السليم طلع مخالفات: ${sessionGood.problems.join(' | ')}`;
  // بالسلسلة: الإقلاع ← وحدة عاديّة ← ملف كسول، يتسمّى بمكان الاستيراد مرّة وحدة.
  const chain = check([
    { path: 'src/main.tsx', text: "import { Shell } from './components/Shell'; export const s = Shell;" },
    { path: 'src/components/Shell.tsx', text: "import { listItems } from '../lib/repo/inventory'; export const Shell = listItems;" },
  ]);
  if (chain.problems.length !== 1 || !chain.problems[0].startsWith('src/components/Shell.tsx')) return `ملف كسول بسلسلة الإقلاع: توقّعت مخالفة وحدة بـShell، وطلع ${chain.problems.join(' | ') || 'صفر'}`;
  // السلسلة عبر مجلّد (components/Shell/index.tsx) تنقرا هي هم، وملف كسول يجيبه مسار الجلسة ويستورد ملفاً كسولاً ثانياً
  // يتسمّى مرّة وحدة بمكان الاستيراد اللي جابه، مو مرّتين (اختبار الطفرات WP2).
  const viaIndex = check([
    { path: 'src/main.tsx', text: "import { Shell } from './components/Shell'; export const s = Shell;" },
    { path: 'src/components/Shell/index.tsx', text: "import { listItems } from '../../lib/repo/inventory'; export const Shell = listItems;" },
  ]);
  if (viaIndex.problems.length !== 1 || !viaIndex.problems[0].startsWith('src/components/Shell/index.tsx')) return `ملف كسول بسلسلة عبر مجلّد: توقّعت مخالفة وحدة بـShell/index.tsx، وطلع ${viaIndex.problems.join(' | ') || 'صفر'}`;
  const pageChain = check([
    { path: 'src/lib/sessionFlow.ts', text: "import { listItems } from './repo/inventory'; export const l = listItems;" },
    { path: 'src/lib/repo/inventory.ts', text: "import { setMemberScopesV2 } from './scopes'; export const s = setMemberScopesV2;" },
  ]);
  if (pageChain.problems.length !== 1 || !pageChain.problems[0].startsWith('src/lib/sessionFlow.ts')) return `ملف كسول بمسار الجلسة يستورد ملفاً كسولاً: توقّعت مخالفة وحدة بـsessionFlow، وطلع ${pageChain.problems.join(' | ') || 'صفر'}`;
  return null;
}

export function run() {
  const files = readSources('src', ['.ts', '.tsx']);
  const result = check(files, appProgram());
  return {
    scanned: files.length,
    problems: result.problems,
    summary: `فحصت ${files.length} ملفاً و${result.writes} كتابة مباشرة لـSupabase (${FUNCTION_ONLY_TABLES.size} جدولاً ما يكتبه إلا دالّة من classes.json)، و${result.rpcCalls} نداء ترحيل أو مسوّدة بمرجعه ونسخته`,
  };
}
