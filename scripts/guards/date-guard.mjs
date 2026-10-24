// date-guard: اليوم من تحويل ISO ممنوع (يعطي يوم غرينتش: بين 12 و3 الفجر ببغداد يطلّع البارحة).
// اليوم المحلّي من localDay() بـsrc/domain/dates.ts، ويوم بغداد بالخادم من app_today().
// toJSON() هو toISOString() نفسه، والمتغيّر المحفوظ منهم (const iso = d.toISOString()) ينقصّ مثلهم.
import { calleeName, lineOf, literalText, parse, readSources, ts, walk, where } from './lib.mjs';

export const name = 'date-guard';

const ISO_METHODS = new Set(['toISOString', 'toJSON']);
const MESSAGE = 'يوم من تحويل ISO — استعمل localDay()';

function unwrap(expression) {
  let current = expression;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current))) {
    current = current.expression;
  }
  return current;
}

function isIsoCall(expression) {
  const value = unwrap(expression);
  return Boolean(value && ts.isCallExpression(value) && ISO_METHODS.has(calleeName(value)));
}

/** أسماء بالملف قيمتها الأولى نصّ ISO: const iso = new Date().toISOString(). */
function isoNames(sourceFile) {
  const names = new Set();
  walk(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isIsoCall(node.initializer)) names.add(node.name.text);
  });
  return names;
}

function numberValue(node) {
  return node && ts.isNumericLiteral(node) ? Number(node.text) : null;
}

/** split('T') على نصّ ISO: يرجّع نداء split أو null. */
function isoSplit(expression, isIso) {
  const split = unwrap(expression);
  if (!split || !ts.isCallExpression(split) || calleeName(split) !== 'split' || literalText(split.arguments[0]) !== 'T') return null;
  return ts.isPropertyAccessExpression(split.expression) && isIso(split.expression.expression) ? split : null;
}

export function check(files) {
  const problems = [];
  let isoCalls = 0;
  for (const file of files) {
    const sourceFile = parse(file);
    const names = isoNames(sourceFile);
    const isIso = (expression) => {
      const value = unwrap(expression);
      return isIsoCall(value) || Boolean(value && ts.isIdentifier(value) && names.has(value.text));
    };
    const report = (node) => problems.push(`${where(file, lineOf(sourceFile, node))}: ${MESSAGE}`);
    walk(sourceFile, (node) => {
      if (ts.isCallExpression(node) && ISO_METHODS.has(calleeName(node))) isoCalls += 1;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const cutsDay =
          ['slice', 'substring', 'substr'].includes(method) &&
          numberValue(node.arguments[0]) === 0 &&
          numberValue(node.arguments[1]) === 10;
        if (cutsDay && isIso(node.expression.expression)) report(node);
        // iso.split('T').at(0)
        if (method === 'at' && numberValue(node.arguments[0]) === 0 && isoSplit(node.expression.expression, isIso)) report(node);
      }
      // iso.split('T')[0]
      if (ts.isElementAccessExpression(node) && numberValue(node.argumentExpression) === 0 && isoSplit(node.expression, isIso)) report(node);
      // const [day] = iso.split('T')
      if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && isoSplit(node.initializer, isIso)) report(node);
    });
  }
  return { problems, isoCalls };
}

export function selfTest() {
  // كل شكل لحاله لازم ينمسك مرّة وحدة.
  const bad = [
    'export const a = new Date().toISOString().slice(0, 10);',
    "export const b = new Date().toISOString().split('T')[0];",
    'export const c = new Date().toJSON().slice(0, 10);',
    'const iso = new Date().toISOString(); export const d = iso.slice(0, 10);',
    'const iso = new Date().toISOString(); export const e = iso.substring(0, 10);',
    "export const f = new Date().toISOString().split('T').at(0);",
    "const stamp = new Date().toJSON(); export const g = stamp.split('T')[0];",
    "const iso = new Date().toISOString(); const [h] = iso.split('T'); export { h };",
  ];
  for (const text of bad) {
    if (check([{ path: 'self/bad.ts', text }]).problems.length !== 1) return `ما انمسك (أو انمسك أكثر من مرّة): ${text}`;
  }
  const good = check([
    { path: 'self/c.ts', text: 'export const c = new Date().toISOString(); export const d = text.slice(0, 10);' },
    { path: 'self/e.ts', text: "const at = new Date().toISOString(); send({ at }); const s = 'aTb'; export const x = s.split('T')[0];" },
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
    summary: `فحصت ${files.length} ملفاً و${result.isoCalls} نداء toISOString/toJSON`,
  };
}
