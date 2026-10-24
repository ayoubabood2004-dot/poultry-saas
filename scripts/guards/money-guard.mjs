// money-guard: لا parseFloat ولا toFixed ولا Math.round وأخواته بـsrc/domain (الفلوس والكميات bigint)،
// والكمية ما تمرّ من منسّق الأعداد الصحيحة fmtInt (بـdoctorVet «3» انعرضت عن 3.25).
import { lineOf, parse, readSources, ts, walk, where } from './lib.mjs';

export const name = 'money-guard';

const BANNED_NAMES = new Set(['parseFloat', 'toFixed', 'toPrecision']);
const BANNED_MATH = new Set(['round', 'floor', 'ceil', 'trunc']);
const QUANTITY_NAME = /qty|quantity|kg|weight|mass|liter|litre|volume|gram/i;

export function check(files) {
  const problems = [];
  let domainFiles = 0;
  let fmtIntCalls = 0;
  for (const file of files) {
    const sourceFile = parse(file);
    const inDomain = file.path.startsWith('src/domain/');
    if (inDomain) domainFiles += 1;
    walk(sourceFile, (node) => {
      if (inDomain && ts.isIdentifier(node) && BANNED_NAMES.has(node.text)) {
        problems.push(`${where(file, lineOf(sourceFile, node))}: ${node.text} بمنطق الفلوس — استعمل bigint ودوالّ money.ts`);
      }
      if (
        inDomain &&
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Math' &&
        BANNED_MATH.has(node.name.text)
      ) {
        problems.push(`${where(file, lineOf(sourceFile, node))}: Math.${node.name.text} — التقريب الوحيد roundHalfAway`);
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
  return { problems, domainFiles, fmtIntCalls };
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
  return null;
}

export function run() {
  const files = readSources('src', ['.ts', '.tsx']);
  const result = check(files);
  return {
    scanned: result.domainFiles,
    problems: result.problems,
    summary: `فحصت ${result.domainFiles} ملف منطق بـsrc/domain و${files.length} ملفاً لـfmtInt (${result.fmtIntCalls} نداء)`,
  };
}
