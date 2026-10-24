// fetch-guard: القراءة اللي ينبني عليها قرار ترمي، ما تبلع خطأها وترجّع قائمة فارغة.
// بـdoctorVet قائمة بلعت خطأها، فضغطة «استلمنا الفلوس» سجّلت تحصيلاً ما صار.
// المعالج يبلع إذا رجّع فارغ (بأي return بجسمه) أو حطّ فارغ بدل الخطأ (setRows([]))، بـ.catch(h) و.then(ok, h) وcatch {}.
// الاستثناء ظاهر بسببه على نفس السطر: /* swallow-ok: السبب */
import { calleeName, hasMarker, lineOf, parse, readSources, ts, walk, where } from './lib.mjs';

export const name = 'fetch-guard';

/** يفكّ الأقواس وتحويلات النوع: `[] as Item[]` و`<Item[]>[]` و`[] satisfies T` و`x!` نفس `[]`. */
function unwrap(expression) {
  let current = expression;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

/** [] و{} وnew Array() وArray() بلا معاملات. */
function isEmptyCollection(expression) {
  const value = unwrap(expression);
  if (!value) return false;
  if (ts.isArrayLiteralExpression(value)) return value.elements.length === 0;
  if (ts.isObjectLiteralExpression(value)) return value.properties.length === 0;
  if ((ts.isNewExpression(value) || ts.isCallExpression(value)) && ts.isIdentifier(value.expression) && value.expression.text === 'Array') {
    return (value.arguments?.length ?? 0) === 0;
  }
  return false;
}

function isEmptyValue(expression) {
  const value = unwrap(expression);
  if (!value) return false;
  if (isEmptyCollection(value) || value.kind === ts.SyntaxKind.NullKeyword) return true;
  return ts.isIdentifier(value) && value.text === 'undefined';
}

/** يمشي جسم المعالج بلا الدوالّ المتداخلة: رجوعها مو رجوعه. */
function eachOwnNode(body, visit) {
  const step = (node) => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    visit(node);
    ts.forEachChild(node, step);
  };
  step(body);
}

/** شلون يبلع المعالج الخطأ: 'returns' يرجّع فارغ، 'passes' يمرّر فارغ لدالّة، null ما يبلع. */
function swallowKind(body) {
  if (!body) return null;
  if (!ts.isBlock(body) && isEmptyValue(body)) return 'returns';
  let returns = false;
  let passes = false;
  let rethrows = false;
  eachOwnNode(body, (node) => {
    if (ts.isReturnStatement(node) && isEmptyValue(node.expression)) returns = true;
    else if (ts.isThrowStatement(node)) rethrows = true;
    else if (ts.isCallExpression(node) && node.arguments.some(isEmptyCollection)) passes = true;
  });
  if (returns) return 'returns';
  // setRows([]) بمعالج يرمي بعدها مو بلع: الخطأ يوصل للشاشة. report(e, {}) ثم throw كان ينمسك غلط.
  return passes && !rethrows ? 'passes' : null;
}

function handlerBody(handler) {
  return handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) ? handler.body : null;
}

const SAYS = {
  returns: 'يرجّع فارغ',
  passes: 'يحطّ فارغ بدل الخطأ (setX([]))',
};

export function check(files) {
  const problems = [];
  let catches = 0;
  for (const file of files) {
    const sourceFile = parse(file);
    const marked = (...nodes) => nodes.some((node) => node && hasMarker(file, lineOf(sourceFile, node), 'swallow-ok:'));
    walk(sourceFile, (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = calleeName(node);
        // .catch(h) و.then(ok, h): المعالج الثاني بـthen هو نفسه catch.
        const handler = method === 'catch' ? node.arguments[0] : method === 'then' ? node.arguments[1] : null;
        if (!handler) return;
        catches += 1;
        const kind = swallowKind(handlerBody(handler));
        const line = lineOf(sourceFile, node.expression.name);
        if (kind && !marked(node.expression.name, handler)) {
          problems.push(`${where(file, line)}: .${method === 'then' ? 'then(…, معالج)' : 'catch'} ${SAYS[kind]} — ارمِ الخطأ والشاشة تعرض «أعد المحاولة»`);
        }
      }
      if (ts.isCatchClause(node)) {
        catches += 1;
        const line = lineOf(sourceFile, node);
        const kind = swallowKind(node.block);
        if (kind && !marked(node)) {
          problems.push(`${where(file, line)}: catch ${SAYS[kind]} — ارمِ الخطأ أو اكتب السبب بـswallow-ok`);
        }
      }
    });
  }
  return { problems, catches };
}

export function selfTest() {
  // كل شكل لحاله لازم ينمسك: عدد إجمالي يخبّي شكل ضايع ورا شكل ثاني ينمسك مرّتين.
  const bad = [
    'export const a = () => load().catch(() => []);',
    'export async function b() { try { return await load(); } catch { return null; } }',
    'export const a = () => load().catch(() => [] as Item[]);',
    'export const a = () => load().catch(() => <Item[]>[]);',
    'export const a = () => load().catch(() => ([] satisfies Item[]));',
    'export const a = () => load().catch(() => ([])!);',
    'export const a = () => load().catch(() => new Array());',
    'export const a = () => load().catch(() => Array());',
    'export const a = () => load().then(ok, () => []);',
    'export const a = () => load().then(ok, function () { return {}; });',
    'export async function b() { try { setRows(await load()); } catch { setRows([]); } }',
    'export async function b() { try { return await load(); } catch (e) { if (e) { return []; } throw e; } }',
    'export const a = () => load().then(setRows).catch(() => setRows([] as Item[]));',
  ];
  for (const text of bad) {
    if (check([{ path: 'self/bad.ts', text }]).problems.length !== 1) return `ما انمسك (أو انمسك أكثر من مرّة): ${text}`;
  }
  const good = check([
    { path: 'self/c.ts', text: 'export const c = () => load().catch((e) => { throw e; });' },
    { path: 'self/d.ts', text: 'export async function d() { try { return await load(); } catch { // swallow-ok: إعداد راحة\n return null; } }' },
    { path: 'self/e.ts', text: 'load().then((data) => set({ data, error: null }), (error) => set({ data: null, error }));' },
    { path: 'self/f.ts', text: 'export async function f() { try { return await load(); } catch (e) { const empty = () => []; log(empty); throw e; } }' },
    { path: 'self/g.ts', text: 'export const g = () => load().then((rows) => rows.filter(Boolean));' },
    // يرمي بعد ما يسجّل: {} و[] كمعاملات مو بلع.
    { path: 'self/h.ts', text: "export async function h() { try { return await load(); } catch (e) { throw new Error(t('err.x', 'x', {})); } }" },
    { path: 'self/i.ts', text: 'export async function i() { try { return await load(); } catch (e) { const info = Object.assign({}, e); log(info); throw e; } }' },
    { path: 'self/j.ts', text: "export const j = () => load().catch((e) => { log('x', []); throw e; });" },
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
    summary: `فحصت ${files.length} ملفاً و${result.catches} موضع catch (ويّا معالج then الثاني)`,
  };
}
