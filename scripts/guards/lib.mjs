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

/** استثناء ظاهر بسببه على نفس السطر: /* swallow-ok: السبب *\/ أو // i18n-ok: السبب. */
export function hasMarker(file, line, marker) {
  return new RegExp(`${marker}\\s*\\S`).test(lineText(file, line));
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
