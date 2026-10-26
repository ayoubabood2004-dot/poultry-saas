// money-guard: لا parseFloat ولا toFixed ولا Math.round وأخواته بـsrc/domain (الفلوس والكميات bigint)،
// والكمية ما تمرّ من منسّق الأعداد الصحيحة fmtInt (بـdoctorVet «3» انعرضت عن 3.25).
// المرحلة 1 (الخطّة §2.2 E3، GT-23): الفلوس والكميات تجي من الشبكة نصوصاً عشرية، وتنقرا بـparseDecimal/toScale بس.
// فبـsrc/domain وsrc/lib/repo ممنوع Number( وparseInt( وparseFloat( (رقم JS مزدوج يضيّع الفلس بعد 15 مرتبة)، وضرب
// رقم بـ100 أو 1000 (تحويل دينار لفلس أو وحدة لآلاف بفاصلة عائمة). الاستعمال المشروع لغير الفلوس (أجزاء التاريخ)
// بوسم سبب على سطره: // number-ok: السبب. وparseFloat ما إله وسم: ماكو استعمال مشروع إله بهالمجلّدين.
// المراجعة العدائية: نفس التحويل بأشكال ثانية ممنوع هم: Number بقيمة (.map(Number)، اسم بديل، new Number، Number.call)،
// والجمع الأحادي +x (مثل Number(x) بالضبط)، وMath.round/floor/ceil/trunc بـrepo (بـsrc/domain بلا وسم أصلاً)، والضرب بـ
// 10 ** n أو Math.pow(10, n) مثل 100 و1000. والوسم بتعليق بس، مو بنصّ.
import { hasMarker, lineOf, parse, readSources, ts, walk, where } from './lib.mjs';

export const name = 'money-guard';

const BANNED_NAMES = new Set(['parseFloat', 'toFixed', 'toPrecision']);
const BANNED_MATH = new Set(['round', 'floor', 'ceil', 'trunc']);
const QUANTITY_NAME = /qty|quantity|kg|weight|mass|liter|litre|volume|gram/i;
const SCALES = new Set([100, 1000]);

/** مقياس ضرب للفلس أو الآلاف برقم مزدوج: 100 أو 1000 حرفياً، أو 10 ** n، أو Math.pow(10, n)؛ نصّه أو null. */
function scaleOf(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  const ten = (n) => Boolean(n && ts.isNumericLiteral(n) && Number(n.text.replace(/_/g, '')) === 10);
  if (ts.isNumericLiteral(current) && SCALES.has(Number(current.text.replace(/_/g, '')))) return current.text;
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken && ten(current.left)) return current.getText();
  if (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    ts.isIdentifier(current.expression.expression) &&
    current.expression.expression.text === 'Math' &&
    current.expression.name.text === 'pow' &&
    ten(current.arguments[0])
  ) {
    return current.getText();
  }
  return null;
}

/** Number بقيمة مو نداء: معامل (.map(Number))، اسم بديل، new، Number.call/apply/bind. الأعضاء الثابتة (isNaN، isInteger) لا. */
function numberAsValue(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isCallExpression(parent) && parent.expression === node) return false; // Number( له قاعدته
  if (ts.isPropertyAccessExpression(parent)) {
    if (parent.name === node) return false;
    return ['call', 'apply', 'bind'].includes(parent.name.text);
  }
  if (ts.isQualifiedName(parent) || ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent) || ts.isExpressionWithTypeArguments(parent)) return false;
  if ((ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent))) return false;
  const named = [ts.isPropertyAssignment, ts.isPropertyDeclaration, ts.isPropertySignature, ts.isMethodDeclaration, ts.isMethodSignature, ts.isVariableDeclaration, ts.isParameter, ts.isBindingElement];
  if (named.some((is) => is(parent)) && (parent.name === node || parent.propertyName === node)) return false;
  return true;
}

export function check(files) {
  const problems = [];
  let domainFiles = 0;
  let wireFiles = 0;
  let fmtIntCalls = 0;
  let marked = 0;
  for (const file of files) {
    const sourceFile = parse(file);
    const inDomain = file.path.startsWith('src/domain/');
    const inWire = inDomain || file.path.startsWith('src/lib/repo/');
    if (inDomain) domainFiles += 1;
    if (inWire) wireFiles += 1;
    // الوسم يعفي القواعد الجديدة بس (Number وparseInt والضرب)، ويتعدّ حتى يبين بالملخّص.
    const unmarked = (node, text) => {
      const line = lineOf(sourceFile, node);
      if (hasMarker(file, line, 'number-ok:')) {
        marked += 1;
        return;
      }
      problems.push(`${where(file, line)}: ${text}`);
    };
    walk(sourceFile, (node) => {
      if (inDomain && ts.isIdentifier(node) && BANNED_NAMES.has(node.text)) {
        problems.push(`${where(file, lineOf(sourceFile, node))}: ${node.text} بمنطق الفلوس — استعمل bigint ودوالّ money.ts`);
      }
      if (inWire && !inDomain && ts.isIdentifier(node) && node.text === 'parseFloat') {
        problems.push(`${where(file, lineOf(sourceFile, node))}: parseFloat بـrepo — المبلغ والكمية من الشبكة نصّ يقرأه parseDecimal/toScale`);
      }
      if (inWire && ts.isIdentifier(node) && node.text === 'parseInt') {
        unmarked(node, 'parseInt — المبلغ والكمية بـparseDecimal/toScale، وغير الفلوس بوسم // number-ok: السبب');
      }
      if (inWire && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Number') {
        unmarked(node, 'Number( — رقم JS مزدوج يضيّع الفلس؛ المبلغ والكمية بـparseDecimal/toScale، وغير الفلوس بوسم // number-ok: السبب');
      }
      if (inWire && ts.isIdentifier(node) && node.text === 'Number' && numberAsValue(node)) {
        unmarked(node, 'Number بقيمة (.map(Number)، اسم بديل، new، call) — نفس Number(: رقم JS مزدوج يضيّع الفلس؛ بـparseDecimal/toScale');
      }
      if (inWire && ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.PlusToken && !ts.isNumericLiteral(node.operand) && !ts.isBigIntLiteral(node.operand)) {
        unmarked(node, '+x — نفس Number(x): رقم JS مزدوج يضيّع الفلس؛ المبلغ والكمية بـparseDecimal/toScale، وغير الفلوس بوسم // number-ok: السبب');
      }
      if (inWire && ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskToken || node.operatorToken.kind === ts.SyntaxKind.AsteriskEqualsToken)) {
        const scale = scaleOf(node.right) ?? scaleOf(node.left);
        if (scale) unmarked(node, `ضرب بـ${scale} — التحويل للفلس أو للآلاف بـtoScale على bigint، مو بفاصلة عائمة`);
      }
      if (inWire && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Math' && BANNED_MATH.has(node.name.text)) {
        // بـsrc/domain بلا وسم (التقريب الوحيد roundHalfAway)؛ بـrepo بوسم سبب لغير الفلوس.
        if (inDomain) problems.push(`${where(file, lineOf(sourceFile, node))}: Math.${node.name.text} — التقريب الوحيد roundHalfAway`);
        else unmarked(node, `Math.${node.name.text} بـrepo — المبلغ والكمية bigint بـparseDecimal/toScale، وغير الفلوس بوسم // number-ok: السبب`);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fmtInt') {
        fmtIntCalls += 1;
        const argument = node.arguments[0];
        if (argument && QUANTITY_NAME.test(argument.getText(sourceFile))) {
          problems.push(`${where(file, lineOf(sourceFile, node))}: كمية بـfmtInt — الكمية تنعرض بـfmtQty`);
        }
      }
    });
  }
  return { problems, domainFiles, wireFiles, fmtIntCalls, marked };
}

export function selfTest() {
  const bad = check([
    { path: 'src/domain/self.ts', text: "export const f = (x: number) => x.toFixed(2) + parseFloat('1') + Math.round(x);" },
    { path: 'src/ui/self.tsx', text: 'fmtInt(line.qty);' },
  ]);
  if (bad.problems.length !== 4) return `توقّعت 4 مخالفات بالمدخلات المصنوعة وطلع ${bad.problems.length}`;
  const good = check([
    { path: 'src/domain/ok.ts', text: 'export const g = (a: bigint, b: bigint) => (2n * a + b) / (2n * b);' },
    { path: 'src/ui/ok.tsx', text: 'fmtInt(flock.birds); Math.round(scale);' },
  ]);
  if (good.problems.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${good.problems.join(' | ')}`;
  // المرحلة 1: كل شكل لحاله مرّة وحدة بالضبط، والموسوم يعبر، وبرّا المجلّدين ما ينفحص.
  const cases = [
    ['src/domain/n1.ts', 1, "export const a = (s: string) => Number(s);"],
    ['src/domain/n2.ts', 0, "export const a = (s: string) => Number(s); // number-ok: سنة من نصّ YYYY-MM-DD"],
    ['src/lib/repo/n3.ts', 1, "export const b = (s: string) => Number(s);"],
    ['src/lib/repo/n4.ts', 1, "export const c = (s: string) => parseInt(s, 10);"],
    ['src/lib/repo/n5.ts', 1, "export const d = (s: string) => Number.parseInt(s, 10);"],
    ['src/lib/repo/n6.ts', 1, "export const e = (s: string) => parseFloat(s);"],
    ['src/lib/repo/n7.ts', 1, "export const f = (s: string) => parseFloat(s); // number-ok: الوسم ما يعبّر parseFloat"],
    ['src/lib/repo/n8.ts', 1, "export const g = (x: number) => x * 100;"],
    ['src/domain/n9.ts', 1, "export const h = (x: number) => 1_000 * x;"],
    ['src/lib/repo/n10.ts', 0, "export const i = (x: bigint) => x * 100n;"],
    ['src/lib/repo/n11.ts', 0, "export const j = (ms: number) => ms * 60;"],
    ['src/ui/n12.tsx', 0, "export const k = (s: string) => Number(s) * 100;"],
    ['src/domain/n13.ts', 1, "export let total = 0; export const l = (x: number) => { total *= 1000; return x; };"],
    // المراجعة العدائية: نفس التحويل بأشكال ثانية، كل شكل مرّة وحدة بالضبط.
    ['src/lib/repo/n14.ts', 1, 'export const a = (row: { qty: string }) => +row.qty;'],
    ['src/domain/n15.ts', 1, 'export const a = (row: { qty: string }) => +row.qty;'],
    ['src/lib/repo/n16.ts', 1, 'export const a = (x: number) => Math.round(x);'],
    ['src/lib/repo/n17.ts', 0, 'export const a = (x: number) => Math.round(x); // number-ok: ثواني المهلة'],
    ['src/lib/repo/n18.ts', 1, 'export const a = (x: number) => x * 10 ** 2;'],
    ['src/domain/n19.ts', 1, 'export const a = (x: number, n: number) => x * 10 ** n;'],
    ['src/lib/repo/n20.ts', 1, 'export const a = (x: number, n: number) => x * Math.pow(10, n);'],
    ['src/lib/repo/n21.ts', 3, 'export const fils = (row: { amount: string }) => BigInt(Math.round(+row.amount * 10 ** 2));'],
    ['src/domain/n22.ts', 0, 'export const a = (n: number) => -n + +1;'],
    ['src/lib/repo/n23.ts', 1, 'export const a = (rows: { qty: string }[]) => rows.map((r) => r.qty).map(Number);'],
    ['src/lib/repo/n24.ts', 1, 'const N = Number; export const a = (s: string) => N(s);'],
    ['src/lib/repo/n25.ts', 1, 'export const a = (s: string) => Number.call(null, s);'],
    ['src/lib/repo/n26.ts', 1, 'export const a = (s: string) => new Number(s);'],
    ['src/lib/repo/n27.ts', 0, 'export const a = (x: unknown) => Number.isInteger(x) && !Number.isNaN(x as number);'],
    // الوسم بتعليق بس: بنصّ ما يعفي.
    ['src/lib/repo/n28.ts', 1, "export const a = (r: { qty: string }) => [Number(r.qty), 'number-ok: x'];"],
    ['src/lib/repo/n29.ts', 1, "export const a = (s: string) => Number(s) + ' // number-ok: x'.length;"],
    ['src/lib/repo/n30.ts', 0, 'export const a = (s: string) => Number(s); /* number-ok: عدد المحاولات */'],
  ];
  for (const [file, expected, text] of cases) {
    const got = check([{ path: file, text }]).problems.length;
    if (got !== expected) return `${file}: توقّعت ${expected} مخالفة وطلع ${got} («${text}»)`;
  }
  return null;
}

export function run() {
  const files = readSources('src', ['.ts', '.tsx']);
  const result = check(files);
  return {
    scanned: result.domainFiles,
    problems: result.problems,
    summary: `فحصت ${result.domainFiles} ملف منطق بـsrc/domain، و${result.wireFiles} ملفاً بـsrc/domain وsrc/lib/repo بلا Number (نداءً أو قيمة)/+x/parseInt(/parseFloat( ولا ضرب بـ100/1000/10**n (ولا Math.round وأخواته بـrepo) (${result.marked} موسوم بسببه)، و${files.length} ملفاً لـfmtInt (${result.fmtIntCalls} نداء)`,
  };
}
