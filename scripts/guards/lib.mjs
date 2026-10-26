// أدوات مشتركة للحرّاس: قراءة الملفات الحقيقية من المستودع وتحليلها بمحلّل TypeScript نفسه (مو تعابير نصّية).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export { ts };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** أي حرف عربي (الأساسي والممتدّ وأشكال العرض). بصيغة \u{…} لأن الحرف الصريح بالشفرة يضيع بالنسخ. */
export const ARABIC = /[\u{600}-\u{6FF}\u{750}-\u{77F}\u{8A0}-\u{8FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFF}]/u;

export function listFiles(dirAbs, extensions) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
    }
  };
  visit(dirAbs);
  return out.sort();
}

/** ملفات المصدر بمسار نسبي بشرطات أمامية: [{ path, text }]. */
export function readSources(dirRel, extensions) {
  return listFiles(path.join(ROOT, dirRel), extensions).map((full) => ({
    path: path.relative(ROOT, full).split(path.sep).join('/'),
    text: readFileSync(full, 'utf8'),
  }));
}

export function parse(file) {
  const kind = file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, kind);
}

/**
 * برنامج مدقّق TypeScript بإعداد tsconfig.app.json (src كلها)، مرّة وحدة للتشغيل: numbers-guard وwrite-guard ياخذون
 * نفس البرنامج، والمدقّق ينبني قبل أي مشي (يربط العقد بآبائها).
 */
let appProgramCache = null;
export function appProgram() {
  if (appProgramCache) return appProgramCache;
  const configPath = path.join(ROOT, 'tsconfig.app.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  appProgramCache = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  appProgramCache.getTypeChecker();
  return appProgramCache;
}

/**
 * برنامج بملفات مصنوعة بالذاكرة للفحوص الذاتية ([{ path, text }] بمسار نسبي للجذر)، ويّا مكتبة ES الحقيقية حتى Map وSet
 * والقوائم تنعرف مثل البرنامج الحقيقي. prelude: ملف d.ts عامّ لحاله (بداخل الملف تزحزح أرقام الأسطر عن الوسوم).
 * noResolve: الاستيراد ما ينلحق (المستورد any)، فالحالة ما تجرّ ملفات المستودع الحقيقية.
 */
export function virtualProgram(files, { prelude = '', options = {} } = {}) {
  const compilerOptions = { jsx: ts.JsxEmit.Preserve, strict: true, target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts'], types: [], noEmit: true, ...options };
  const virtual = new Map([...(prelude ? [[path.resolve(ROOT, 'self/prelude.d.ts'), prelude]] : []), ...files.map((file) => [path.resolve(ROOT, file.path), file.text])]);
  const host = ts.createCompilerHost(compilerOptions);
  const real = { getSourceFile: host.getSourceFile.bind(host), fileExists: host.fileExists.bind(host), readFile: host.readFile.bind(host) };
  host.getSourceFile = (fileName, language, ...rest) => {
    const text = virtual.get(path.resolve(fileName));
    if (text === undefined) return real.getSourceFile(fileName, language, ...rest);
    return ts.createSourceFile(fileName, text, language, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  };
  host.fileExists = (fileName) => virtual.has(path.resolve(fileName)) || real.fileExists(fileName);
  host.readFile = (fileName) => virtual.get(path.resolve(fileName)) ?? real.readFile(fileName);
  const program = ts.createProgram([...virtual.keys()], compilerOptions, host);
  program.getTypeChecker();
  return program;
}

export function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function lineText(file, line) {
  return file.text.split(/\r?\n/)[line - 1] ?? '';
}

/**
 * مدى كل تعليق بالملف ([بداية، نهاية])، من شجرة TypeScript نفسها: التعليق بالفراغ اللي قبل كل رمز (والنصّ داخل JSX
 * وJSDoc مو رمز يبدي تعليقاً). نصّ يشبه التعليق داخل '…' أو `…` مو تعليق.
 */
const commentCache = new Map();
function commentRanges(file) {
  const cached = commentCache.get(file.text);
  if (cached) return cached;
  const sourceFile = parse(file);
  const found = [];
  const jsxText = [];
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push([node.pos, node.end]);
      return;
    }
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      // التعليق بنفس سطر الرمز اللي قبله «لاحق» له، واللي بعد سطر جديد «سابق» للي بعده: الاثنين.
      for (const range of [...(ts.getLeadingCommentRanges(file.text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(file.text, node.end) ?? [])]) {
        found.push([range.pos, range.end]);
      }
    }
    for (const child of children) visit(child);
  };
  visit(sourceFile);
  // نصّ JSX مو تعليق حتى لو بدا بـ//: اللاحق لـ> ينقرا منه.
  const ranges = found.filter(([from]) => !jsxText.some(([start, end]) => from >= start && from < end));
  commentCache.set(file.text, ranges);
  return ranges;
}

/**
 * استثناء ظاهر بسببه على نفس السطر، داخل تعليق: /* swallow-ok: السبب *\/ أو // i18n-ok: السبب. الوسم بنصّ ('number-ok: x')
 * مو وسم (المراجعة العدائية: [Number(x), 'number-ok: x'] كان يعبر).
 */
export function hasMarker(file, line, marker) {
  const text = lineText(file, line);
  const pattern = new RegExp(`${marker}\\s*\\S`, 'g');
  let start = 0;
  for (let index = 1; index < line; index += 1) start = file.text.indexOf('\n', start) + 1;
  const ranges = commentRanges(file);
  for (const match of text.matchAll(pattern)) {
    const at = start + match.index;
    if (ranges.some(([from, to]) => at >= from && at < to)) return true;
  }
  return false;
}

/** اسم الدالّة المنادية: t(…) ← 't'، x.catch(…) ← 'catch'. */
export function calleeName(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

/** نصّ عقدة نصّية ثابتة أو null. */
export function literalText(node) {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return node.text;
  return null;
}

function bindsName(name, target) {
  if (!name) return false;
  if (ts.isIdentifier(name)) return name.text === target;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.some((element) => !ts.isOmittedExpression(element) && bindsName(element.name, target));
  }
  return false;
}

function declarationIn(statements, target) {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      const list = statement.declarationList;
      for (const declaration of list.declarations) {
        if (!bindsName(declaration.name, target)) continue;
        const isConst = (list.flags & ts.NodeFlags.Const) !== 0 && ts.isIdentifier(declaration.name);
        return { initializer: isConst ? (declaration.initializer ?? null) : null };
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name?.text === target
    ) {
      return { initializer: null };
    } else if (ts.isImportDeclaration(statement) && statement.importClause) {
      const clause = statement.importClause;
      const bindings = clause.namedBindings;
      if (
        clause.name?.text === target ||
        (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === target) ||
        (bindings && ts.isNamedImports(bindings) && bindings.elements.some((element) => element.name.text === target))
      ) {
        return { initializer: null };
      }
    }
  }
  return null;
}

/**
 * أقرب تصريح للاسم من مكان استعماله للخارج، مثل JavaScript نفسها: { initializer } (قيمة const، وإلا null)،
 * أو null إذا الاسم ما انعرّف بالملف (عامّ). خريطة وحدة للملف كله كانت تخلّي const باسم مكرّر بدالّة ثانية
 * يغطّي الأوّل، فكتابة مباشرة بـstock_moves تعبر.
 */
export function resolveBinding(identifier) {
  const target = identifier.text;
  for (let node = identifier.parent; node; node = node.parent) {
    if (ts.isFunctionLike(node)) {
      if (node.parameters?.some((parameter) => bindsName(parameter.name, target))) return { initializer: null };
      if (ts.isFunctionExpression(node) && node.name?.text === target) return { initializer: null };
    }
    if (ts.isCatchClause(node) && node.variableDeclaration && bindsName(node.variableDeclaration.name, target)) return { initializer: null };
    if (
      (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      node.initializer && ts.isVariableDeclarationList(node.initializer) &&
      node.initializer.declarations.some((declaration) => bindsName(declaration.name, target))
    ) {
      return { initializer: null };
    }
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)) {
      const found = declarationIn(node.statements, target);
      if (found) return found;
    }
  }
  return null;
}

/** قيمة const بأقرب نطاق للمعرّف، أو null (معامل، let، اسم بنطاق ثاني، أو عامّ). */
export function constValue(identifier) {
  return resolveBinding(identifier)?.initializer ?? null;
}

/** نصّ ثابت مباشر، أو اسم const بنطاقه قيمته نصّ ثابت. */
export function resolvedText(node) {
  const direct = literalText(node);
  if (direct !== null) return direct;
  return node && ts.isIdentifier(node) ? literalText(constValue(node)) : null;
}

export function where(file, line) {
  return `${file.path}:${line}`;
}
