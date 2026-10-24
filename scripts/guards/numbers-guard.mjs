// numbers-guard: قانون المالك للأرقام والجداول (docs/DECISIONS.md، 2026-10-24):
// «طريقة كتابة الارقام وطريقة ترتيب الحسابات كلها بطريقة الجداول وطريقة اكسل … ووجود الفوارز دائما».
// 1) رقم بالواجهة ما ينعرض خام: رقم (number أو bigint) أو قائمة أرقام، أو رقم صار نصّاً بلا منسّق
//    (n.toString()، String(n)، نصّ قالب، n + '%'، ns.join()). المواضع: ابن JSX، خانة نوعها ReactNode
//    (hint={n}، value: n)، رجوع دالّة لخانة عرض (Column.cell)، قيمة حقل نصّ، متغيّرات t() وTrans، ومكوّن
//    يرجّع رقماً. والقيمة الجاهزة (متغيّر، نداء) تنقارن بنوعها كلّه: أعمدة مبنية برّا الـJSX وفيها خلية ترجّع رقماً.
//    ReactNode نفسه (children يمرّ من مكوّن لمكوّن) مو رقم: الرقم ينمسك وين يدخل.
//    النوع من مدقّق TypeScript نفسه بإعداد tsconfig.app.json.
// 2) لا toLocaleString/toLocaleDateString/toLocaleTimeString/toFixed/toPrecision ولا Intl: أرقام الجهاز
//    ممكن تطلع شرقية أو بلا فواصل، وtoFixed يقرّب بالفاصلة العائمة.
// 3) لا <table> برّا src/components/ui/DataTable.tsx: كل كشف وفاتورة وتقرير بالجدول الكلاسيكي الواحد.
// الاستثناء ظاهر بسببه على نفس السطر: // number-ok: السبب
import path from 'node:path';
import { hasMarker, lineOf, readSources, ROOT, ts, where } from './lib.mjs';

export const name = 'numbers-guard';

export const TABLE_HOME = 'src/components/ui/DataTable.tsx';
const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toFixed', 'toPrecision']);
const NUMERIC = ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike;
const RAW = 'رقم خام';

function isNumeric(type) {
  if (type.isUnion()) return type.types.some(isNumeric);
  return (type.flags & NUMERIC) !== 0;
}

function hasBigint(type) {
  if (type.isUnion()) return type.types.some(hasBigint);
  return (type.flags & ts.TypeFlags.BigIntLike) !== 0;
}

// أعضاء ReactNode بعد ما ينفرط الاسم (cond ? <X /> : icon): عنصر React أو JSX.Element أو Iterable<ReactNode>.
// Iterable بس إذا عناصره نفسها ReactNode: «number | Iterable<number>» خاصّية بيانات مو خانة عرض.
function isNodeMember(checker, member, depth) {
  const symbol = member.symbol ?? member.aliasSymbol;
  if (!symbol) return false;
  if (symbol.name === 'ReactElement' || symbol.name === 'ReactPortal') return true;
  if (symbol.name === 'Element' && symbol.parent?.name === 'JSX') return true;
  if (symbol.name === 'Iterable' && depth < 3) {
    const [item] = checker.getTypeArguments(member) ?? [];
    return Boolean(item && isNodeSlot(checker, item, depth + 1));
  }
  return false;
}

/** خانة عرض React (ReactNode أو اتّحاد بيه عنصر): الرقم بداخلها احتمال بالنوع مو قيمة. */
function isNodeSlot(checker, type, depth = 0) {
  if (type.aliasSymbol?.name === 'ReactNode') return true;
  const members = type.isUnion() ? type.types : [type];
  return members.some((member) => isNodeMember(checker, member, depth));
}

/** رقم فعلي (مو ReactNode عامّ). */
function isRawNumber(checker, type) {
  return isNumeric(type) && !isNodeSlot(checker, type);
}

/** عنصر Array/ReadonlyArray، أو null. */
function arrayElement(checker, type) {
  const name = type.symbol?.name;
  if (name !== 'Array' && name !== 'ReadonlyArray') return null;
  return checker.getTypeArguments(type)?.[0] ?? null;
}

/** رقم أو قائمة أرقام (<b>{xs.map((x) => x.qty)}</b> ينعرض «12501300»). */
function isRawValue(checker, type) {
  if (isRawNumber(checker, type)) return true;
  const element = arrayElement(checker, type);
  return Boolean(element && isRawNumber(checker, element));
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

const BRANCHING = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken]);

/** أوراق التعبير المعروض: الشرط بفرعيه، و?? و|| و&& بطرفيهم. «busy ? <i /> : count» نوعه اتّحاد بيه عنصر ويخبّي الرقم. */
function leaves(expression) {
  const node = unwrap(expression);
  if (ts.isConditionalExpression(node)) return [...leaves(node.whenTrue), ...leaves(node.whenFalse)];
  if (ts.isBinaryExpression(node) && BRANCHING.has(node.operatorToken.kind)) return [...leaves(node.left), ...leaves(node.right)];
  return [node];
}

/**
 * ورقة تعرض رقماً بلا فواصل: رقم أو قائمة أرقام، أو رقم صار نصّاً بلا منسّق — n.toString() وString(n)
 * ونصّ قالب بيه رقم و«n + '%'» وns.join(). هذا بمواضع العرض بس، فالمفاتيح والتخزين ما تنلمس.
 */
function rawLeafReason(checker, leaf) {
  const type = checker.getTypeAtLocation(leaf);
  if (isRawNumber(checker, type)) return RAW;
  if (isRawValue(checker, type)) return 'قائمة أرقام خام';
  if (ts.isCallExpression(leaf)) {
    const callee = leaf.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const receiver = checker.getTypeAtLocation(callee.expression);
      if (callee.name.text === 'toString' && isNumeric(receiver)) return 'n.toString()';
      if (callee.name.text === 'join' && isRawValue(checker, receiver)) return 'ns.join()';
    }
    if (ts.isIdentifier(callee) && callee.text === 'String' && leaf.arguments[0] && isNumeric(checker.getTypeAtLocation(leaf.arguments[0]))) return 'String(n)';
  }
  if (ts.isTemplateExpression(leaf) && leaf.templateSpans.some((span) => rawLeafReason(checker, unwrap(span.expression)))) return 'نصّ قالب بيه رقم';
  if (
    ts.isBinaryExpression(leaf) &&
    leaf.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    (type.flags & ts.TypeFlags.StringLike) !== 0 &&
    [leaf.left, leaf.right].some((side) => rawLeafReason(checker, unwrap(side)))
  ) {
    return 'رقم بنصّ مركّب بـ+';
  }
  return null;
}

function rawReason(checker, expression) {
  for (const leaf of leaves(expression)) {
    const reason = rawLeafReason(checker, leaf);
    if (reason) return reason;
  }
  return null;
}

/**
 * متغيّرات t() وTrans: الرقم العادي ينعرض بفواصل من t() وTrans نفسهم (fmtInt)، فيعبر؛
 * bigint (فلس أو آلاف) والرقم اللي صار نصّاً بلا منسّق ما يعبرون.
 */
function formattedVarReason(checker, expression) {
  for (const leaf of leaves(expression)) {
    const type = checker.getTypeAtLocation(leaf);
    if (isRawNumber(checker, type) && !hasBigint(type)) continue;
    const reason = rawLeafReason(checker, leaf);
    if (reason) return reason;
  }
  return null;
}

/** قيمة خاصّية JSX أو حقل كائن تنعرض: {n} بـhint={n} أو value: n، والخانة نوعها ReactNode. */
function shownSlotValue(node) {
  if (ts.isJsxExpression(node) && node.expression && ts.isJsxAttribute(node.parent)) return node.expression;
  if (ts.isPropertyAssignment(node)) return node.initializer;
  if (ts.isShorthandPropertyAssignment(node)) return node.name;
  return null;
}

/** قيمة ترجعها دالّة: جسم سهم بلا أقواس، أو return. الخانة نوع الرجوع المتوقّع (Column.cell يرجّع ReactNode). */
function returnedValue(node) {
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return node.body;
  if (ts.isReturnStatement(node) && node.expression) return node.expression;
  return null;
}

function jsxElementOf(attribute) {
  const element = attribute?.parent?.parent;
  return element && (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)) ? element : null;
}

/** حقل بمتغيّرات <Trans vars={{ … }}>. */
function isTransVar(valueNode) {
  const property = valueNode.parent;
  if (!property || !(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))) return false;
  const object = property.parent;
  const container = object?.parent;
  const attribute = container?.parent;
  if (!object || !ts.isObjectLiteralExpression(object) || !container || !ts.isJsxExpression(container)) return false;
  if (!attribute || !ts.isJsxAttribute(attribute) || attribute.name.getText() !== 'vars') return false;
  return jsxElementOf(attribute)?.tagName.getText() === 'Trans';
}

/** الوسم الأصلي (div، input) يبدأ بحرف صغير؛ المكوّن بكبير أو بنقطة. */
function isIntrinsic(element) {
  return ts.isIdentifier(element.tagName) && /^[a-z]/.test(element.tagName.text);
}

const TEXT_FIELDS = new Set(['input', 'textarea']);
// أنواع input اللي تعرض قيمتها. radio وcheckbox وrange وhidden ما تعرضها، فالرقم بقيمتها مو عرض.
const SHOWN_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'number', 'password', 'submit', 'button', 'reset']);

/** نوع الحقل: نصّ ثابت أو تعبير نوعه اتّحاد نصوص ثابتة؛ الديناميكي العامّ (string) غير معروف. */
function inputTypeShows(checker, element) {
  const attribute = element.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'type');
  if (!attribute?.initializer) return true;
  let initializer = attribute.initializer;
  if (ts.isJsxExpression(initializer) && initializer.expression) initializer = unwrap(initializer.expression);
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) return SHOWN_INPUT_TYPES.has(initializer.text);
  const type = checker.getTypeAtLocation(initializer);
  const members = type.isUnion() ? type.types : [type];
  if (!members.every((member) => member.isStringLiteral())) return false;
  return members.some((member) => SHOWN_INPUT_TYPES.has(member.value));
}

/** خانة value لحقل HTML (InputHTMLAttributes): اتّحاد بيه رقم وقائمة نصوص. مكوّن يغلّف <input> ياخذها. */
function isInputValueSlot(checker, slot) {
  if (!slot?.isUnion()) return false;
  return slot.types.some((member) => (member.flags & ts.TypeFlags.NumberLike) !== 0) && slot.types.some((member) => arrayElement(checker, member));
}

/** قيمة value/defaultValue بحقل نصّ يعرضها، رقماً أو رقماً صار نصّاً بلا منسّق. */
function fieldValueReason(checker, node) {
  if (!ts.isJsxAttribute(node) || !['value', 'defaultValue'].includes(node.name.getText())) return null;
  const element = jsxElementOf(node);
  const expression = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : null;
  if (!element || !expression) return null;
  const textField = isIntrinsic(element) ? TEXT_FIELDS.has(element.tagName.getText()) : isInputValueSlot(checker, checker.getContextualType(expression));
  if (!textField) return null;
  if (element.tagName.getText() !== 'textarea' && !inputTypeShows(checker, element)) return null;
  const reason = rawReason(checker, expression);
  return reason ? { expression, reason } : null;
}

/**
 * القيمة الجاهزة (متغيّر أو نداء) تنقارن بنوع الخانة كلّه، لعمق 3: دالّة ترجّع رقماً لخانة ترجّع ReactNode
 * (cell: countOf)، وقائمة أعمدة مبنية برّا الـJSX (columns={columns}) فيها خلية ترجّع رقماً.
 */
function rawInSlot(checker, actual, slot, node, depth = 0) {
  if (!slot || depth > 3) return false;
  if (isNodeSlot(checker, slot)) return isRawValue(checker, actual);
  if (slot.isUnion()) return slot.types.some((member) => rawInSlot(checker, actual, member, node, depth + 1));
  const slotSignatures = slot.getCallSignatures();
  if (slotSignatures.length > 0) {
    if (!slotSignatures.some((signature) => isNodeSlot(checker, signature.getReturnType()))) return false;
    return actual.getCallSignatures().some((signature) => isRawValue(checker, signature.getReturnType()));
  }
  const slotElement = arrayElement(checker, slot);
  if (slotElement) {
    const actualElement = arrayElement(checker, actual);
    return Boolean(actualElement && rawInSlot(checker, actualElement, slotElement, node, depth + 1));
  }
  if ((slot.flags & ts.TypeFlags.Object) === 0) return false;
  return checker.getPropertiesOfType(slot).some((property) => {
    const actualProperty = checker.getPropertyOfType(actual, property.name);
    if (!actualProperty) return false;
    return rawInSlot(checker, checker.getTypeOfSymbolAtLocation(actualProperty, node), checker.getTypeOfSymbolAtLocation(property, node), node, depth + 1);
  });
}

/** القيمة الجاهزة: مو حرفية (دالّة، كائن، قائمة) — الحرفية تنفحص من داخلها. */
function isReadyValue(expression) {
  const node = unwrap(expression);
  return ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node);
}

/** ابن JSX معروض (مو قيمة خاصّية): <b>{n}</b> و<>{n}</>. */
function isRenderedChild(node) {
  return ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent));
}

/**
 * ابن بيانات لمكوّن (children: Fils ينسّقه المكوّن نفسه): الخانة مو ReactNode، فمو عرض هنا.
 * الوسم الأصلي والـFragment ابنهم عرض دائماً.
 */
function isDataChild(checker, node) {
  const parent = node.parent;
  if (!ts.isJsxElement(parent) || isIntrinsic(parent.openingElement)) return false;
  const slot = checker.getContextualType(node.expression);
  return Boolean(slot && !isNodeSlot(checker, slot) && (slot.flags & ts.TypeFlags.Any) === 0);
}

/** مكوّن يرجّع رقماً بدل عنصر: <Count n={5} /> ينعرض «1250000». */
function componentReturnsRaw(checker, element) {
  if (isIntrinsic(element)) return false;
  const signature = checker.getResolvedSignature(element);
  return Boolean(signature && isRawValue(checker, signature.getReturnType()));
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

const FORMATTERS = 'fmtInt/fmtMoney/fmtQty';

export function checkProgram(program, files) {
  const checker = program.getTypeChecker();
  const problems = [];
  let rendered = 0;
  for (const file of files) {
    const sourceFile = program.getSourceFile(path.resolve(ROOT, file.path));
    if (!sourceFile) {
      problems.push(`${file.path}: ما انقرا بالمدقّق`);
      continue;
    }
    const reported = new Set();
    const report = (node, message) => {
      const line = lineOf(sourceFile, node);
      // موضع وحدة تنكال مرّة وحدة حتى لو مسكتها قاعدتان.
      const key = node.getStart(sourceFile);
      if (reported.has(key) || hasMarker(file, line, 'number-ok:')) return;
      reported.add(key);
      problems.push(`${where(file, line)}: ${message}`);
    };
    const text = (expression) => expression.getText(sourceFile).slice(0, 40);
    walk(sourceFile, (node) => {
      if (isRenderedChild(node)) {
        rendered += 1;
        if (isDataChild(checker, node)) return;
        const reason = rawReason(checker, node.expression);
        if (reason) report(node, `${reason} بالواجهة («${text(node.expression)}») — اعرضه بـ${FORMATTERS} حتى تطلع الفواصل`);
        return;
      }
      const slotValue = shownSlotValue(node);
      if (slotValue) {
        const slot = checker.getContextualType(slotValue);
        if (slot && isNodeSlot(checker, slot)) {
          const reason = isTransVar(slotValue) ? formattedVarReason(checker, slotValue) : rawReason(checker, slotValue);
          if (reason) report(slotValue, `${reason} بخانة عرض («${text(slotValue)}» لخانة ReactNode) — مرّره منسّقاً بـ${FORMATTERS}`);
        } else if (slot && isReadyValue(slotValue) && rawInSlot(checker, checker.getTypeAtLocation(slotValue), slot, slotValue)) {
          report(slotValue, `«${text(slotValue)}» بيه رقم خام يوصل لخانة عرض (دالّة أو عمود يرجّع رقماً) — رجّعه منسّقاً بـ${FORMATTERS}/fmtQtyCell`);
        }
      }
      const returned = returnedValue(node);
      if (returned) {
        const slot = checker.getContextualType(returned);
        const reason = slot && isNodeSlot(checker, slot) ? rawReason(checker, returned) : null;
        if (reason) report(returned, `${reason} يرجع لخانة عرض («${text(returned)}»، مثل Column.cell) — رجّعه منسّقاً بـ${FORMATTERS}/fmtQtyCell`);
      }
      const field = fieldValueReason(checker, node);
      if (field) report(field.expression, `${field.reason} بقيمة حقل نصّ («${text(field.expression)}») ينعرض بلا فواصل — مرّره نصّاً منسّقاً`);
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && node.arguments[2] && ts.isObjectLiteralExpression(node.arguments[2])) {
        for (const property of node.arguments[2].properties) {
          const value = ts.isPropertyAssignment(property) ? property.initializer : ts.isShorthandPropertyAssignment(property) ? property.name : null;
          const reason = value ? formattedVarReason(checker, value) : null;
          if (value && reason) report(value, `${reason} بمتغيّر t() («${text(value)}») — t() تنسّق الرقم العادي، فمرّره رقماً أو منسّقاً`);
        }
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && componentReturnsRaw(checker, node)) {
        report(node, `<${node.tagName.getText(sourceFile)}> يرجّع رقماً خاماً بدل عنصر — رجّعه منسّقاً بـ${FORMATTERS}`);
      }
      if (ts.isPropertyAccessExpression(node) && LOCALE_METHODS.has(node.name.text) && ts.isCallExpression(node.parent) && node.parent.expression === node) {
        report(node.name, `.${node.name.text}() — الأرقام والتواريخ من منسّقات format.ts بس (أرقام غربية وفواصل)`);
        return;
      }
      if (ts.isIdentifier(node) && node.text === 'Intl' && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        report(node, 'Intl — الأرقام والتواريخ من منسّقات format.ts بس (أرقام غربية وفواصل)');
        return;
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sourceFile) === 'table' && file.path !== TABLE_HOME) {
        report(node, '<table> برّا DataTable — الحسابات بالجدول الكلاسيكي الواحد (DataTable أو LedgerTable)');
      }
    });
  }
  return { problems, rendered };
}

// JSX وReactNode مصغّرين بملف d.ts عامّ لحاله (بداخل الملف تزحزح أرقام الأسطر عن وسم number-ok)،
// ويّا مكتبة ES الحقيقية حتى القوائم وString وjoin تنعرف مثل البرنامج الحقيقي.
const SELF_PRELUDE = [
  'declare namespace JSX { interface IntrinsicElements { [name: string]: any } interface Element {} interface ElementChildrenAttribute { children: {} } }',
  'interface ReactElement { props: unknown } type ReactNode = string | number | ReactElement | Iterable<ReactNode> | null | undefined;',
  'declare function Box(props: { hint?: ReactNode; children?: ReactNode }): any;',
  'declare function DT(props: { cell: (row: number) => ReactNode }): any;',
  'declare function Grid(props: { columns: { key: string; cell: (row: number) => ReactNode }[] }): any;',
  'declare function Trans(props: { k: string; text: string; vars?: { [name: string]: ReactNode } }): any;',
  'declare function t(key: string, text: string, vars?: { [name: string]: string | number }): string;',
  'declare function fmtInt(n: number): string;',
  'declare function fmtMoney(n: bigint): string;',
  'declare function TextInput(props: { type?: string; readOnly?: boolean; value?: string | number | readonly string[] }): any;',
  'declare function Chart(props: { ticks: number | Iterable<number> }): any;',
  '',
].join('\n');

function selfProgram(files) {
  const options = { jsx: ts.JsxEmit.Preserve, strict: true, target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts'], types: [], noEmit: true };
  const virtual = new Map([[path.resolve(ROOT, 'self/prelude.d.ts'), SELF_PRELUDE], ...files.map((file) => [path.resolve(ROOT, file.path), file.text])]);
  const host = ts.createCompilerHost(options);
  const real = { getSourceFile: host.getSourceFile.bind(host), fileExists: host.fileExists.bind(host), readFile: host.readFile.bind(host) };
  host.getSourceFile = (fileName, language, ...rest) => {
    const text = virtual.get(path.resolve(fileName));
    if (text === undefined) return real.getSourceFile(fileName, language, ...rest);
    return ts.createSourceFile(fileName, text, language, true, fileName.endsWith('.d.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  };
  host.fileExists = (fileName) => virtual.has(path.resolve(fileName)) || real.fileExists(fileName);
  host.readFile = (fileName) => virtual.get(path.resolve(fileName)) ?? real.readFile(fileName);
  return ts.createProgram([...virtual.keys()], options, host);
}

export function selfTest() {
  // كل شكل لحاله بملف، وكلها ببرنامج واحد: كل ملف سيّئ لازم ينمسك مرّة وحدة بالضبط، والسليم صفر.
  const bad = [
    'const n: number = 5; export const A = () => <b>{n}</b>;',
    'const b = 5n; export const A = () => <b>{b}</b>;',
    "declare const c: number | null; export const A = () => <i>{c ?? '—'}</i>;",
    'declare const len: number; declare const label: string; export const A = () => <>{len && label}</>;',
    'declare const v: number; export const s = v.toFixed(1);',
    'declare const v: number; export const s = v.toLocaleString();',
    "export const f = new Intl.NumberFormat('ar');",
    'export const T = () => <table />;',
    'declare const n: number; export const A = () => <Box hint={n} />;',
    'declare const n: number; export const spec: { value: ReactNode } = { value: n };',
    'declare const value: number; export const spec: { value: ReactNode } = { value };',
    // الرقم مخبّى بفرع ويّا عنصر: النوع اتّحاد بيه عنصر.
    'declare const busy: boolean; declare const count: number; export const A = () => <b>{busy ? <i /> : count}</b>;',
    'declare const c: number | null; export const A = () => <b>{c ?? <i />}</b>;',
    // الرقم يرجع من دالّة لخانة عرض (خلية DataTable): سهم، بأقواس، دالّة بالاسم، وأعمدة مبنية برّا.
    'export const A = () => <DT cell={(r) => r} />;',
    'export const A = () => <DT cell={(r) => { return r; }} />;',
    'function countOf(r: number) { return r; } export const A = () => <DT cell={countOf} />;',
    'const columns = [{ key: "q", cell: (r: number) => r }]; export const A = () => <Grid columns={columns} />;',
    // قائمة أرقام، ومكوّن يرجّع رقماً.
    'declare const xs: number[]; export const A = () => <b>{xs.map((x) => x)}</b>;',
    'declare const xs: number[]; export const A = () => <b>{xs.join(" / ")}</b>;',
    'const Count = ({ n }: { n: number }) => n; export const A = () => <Count n={5} />;',
    // الرقم صار نصّاً بلا منسّق.
    'declare const n: number; export const A = () => <b>{n.toString()}</b>;',
    'declare const n: number; export const A = () => <b>{String(n)}</b>;',
    'declare const done: number; declare const total: number; export const A = () => <b>{`${done}/${total}`}</b>;',
    "declare const n: number; export const A = () => <b>{n + '%'}</b>;",
    "declare const done: number; declare const total: number; export const A = () => <b>{done + '/' + total}</b>;",
    // حقل نصّ، ومكوّن يغلّف حقلاً.
    'declare const n: number; export const A = () => <input readOnly value={n} />;',
    'declare const n: number; export const A = () => <input readOnly value={String(n)} />;',
    'declare const n: number; export const A = () => <textarea defaultValue={n.toString()} />;',
    'declare const n: number; export const A = () => <TextInput readOnly value={n} />;',
    // متغيّرات Trans وt(): الرقم العادي يتنسّق، بس bigint والرقم اللي صار نصّاً لا.
    'declare const n: bigint; export const A = () => <Trans k="k" text="{n}" vars={{ n }} />;',
    'declare const n: number; export const A = () => <Trans k="k" text="{n}" vars={{ n: String(n) }} />;',
    'declare const f: bigint; export const A = () => <Trans k="k" text="{n}" vars={{ n: f.toString() }} />;',
    "declare const total: number; export const s = t('k', '{n}', { n: total.toString() });",
    "declare const done: number; declare const total: number; export const s = t('k', '{n}', { n: `${done}/${total}` });",
  ];
  const good = [
    'const n: number = 5; export const A = () => <b aria-valuenow={n} data-n={n}>{fmtInt(n)}</b>;',
    'declare const label: string; export const B = () => <b>{label}</b>;',
    'declare const icon: ReactNode; declare const busy: boolean; export const E = () => <b>{busy ? <i /> : icon}</b>;',
    'declare const n: number; export const F = () => <Trans k="k" text="{n}" vars={{ n }} />;',
    "declare const n: number; export const F = () => t('k', '{n}', { n });",
    'declare const n: number; export const G = () => <input type="range" value={n} />;',
    'declare const n: number; export const G = () => <><input type="radio" value={n} /><input type="checkbox" value={n} /><input type={"hidden"} value={n} /></>;',
    'declare const i: number; export const H = () => <b key={`${i}`}>x</b>;',
    'export const I = () => <DT cell={(r) => fmtInt(r)} />; export const sorted = [3, 1].map((x) => x * 2);',
    'declare const node: ReactNode; declare const n: number; export const D = () => <Box hint={fmtInt(n)}>{node}</Box>; export const spec: { value: ReactNode; count: number } = { value: node, count: n };',
    'declare const n: number; export const C = () => <Chart ticks={n} />;',
    'function Money({ children }: { children: bigint }) { return <>{fmtMoney(children)}</>; } declare const amount: bigint; export const M = () => <Money>{amount}</Money>;',
    'const columns = [{ key: "q", cell: (r: number) => fmtInt(r) }]; export const A = () => <Grid columns={columns} />;',
    'declare const year: number; export const C = () => <b>{year}</b>; // number-ok: سنة النسخة بلا فواصل',
  ];
  const badFiles = bad.map((text, index) => ({ path: `self/bad${index}.tsx`, text }));
  const goodFiles = [...good.map((text, index) => ({ path: `self/good${index}.tsx`, text })), { path: TABLE_HOME, text: 'export const T = () => <table />;' }];
  const result = checkProgram(selfProgram([...badFiles, ...goodFiles]), [...badFiles, ...goodFiles]);
  for (const file of badFiles) {
    const found = result.problems.filter((problem) => problem.startsWith(`${file.path}:`)).length;
    if (found !== 1) return `ما انمسك (أو انمسك ${found} مرّة): ${file.text}`;
  }
  const falsePositives = result.problems.filter((problem) => goodFiles.some((file) => problem.startsWith(`${file.path}:`)));
  if (falsePositives.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${falsePositives.join(' | ')}`;
  return null;
}

export function run() {
  const files = readSources('src', ['.ts', '.tsx']);
  const configPath = path.join(ROOT, 'tsconfig.app.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const result = checkProgram(program, files);
  if (result.rendered === 0) result.problems.push('صفر تعبير JSX معروض — المدقّق ما قرا الملفات');
  return {
    scanned: files.length,
    problems: result.problems,
    summary: `فحصت ${files.length} ملفاً بمدقّق TypeScript: ${result.rendered} تعبير معروض بلا رقم خام (ولا بخانة عرض أو حقل أو t()/Trans)، ولا toLocale/toFixed/Intl، ولا <table> برّا DataTable`,
  };
}
