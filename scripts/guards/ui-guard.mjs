// ui-guard: لا window.confirm (ولا alert/prompt)، لا اتجاه فيزيائي (ml-/mr-/pl-/pr-/left-/right-/origin-left…)،
// لا ألوان Tailwind خام (amber، emerald، slate…)، ولا صنف زاوية أو ظلّ أو مقاس أو درجة لون ما ينولّد.
// «ما ينولّد» يقرّره Tailwind نفسه بإعداد المستودع: بـdoctorVet h-13 و٩٨ موضع text-warn-800 ما إلهم CSS.
// الصنف المركّب (`text-${tone}-800`) ما يشوفه Tailwind أبداً، فممنوع: خريطة نصوص ثابتة بداله.
// يمسح .ts و.tsx: خريطة ألوان أو confirm بملف .ts تطلع بالواجهة مثل اللي بالـ.tsx.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config.js';
import { hasMarker, lineOf, literalText, parse, readSources, resolveBinding, ROOT, ts, walk, where } from './lib.mjs';

export const name = 'ui-guard';

const UTILITY_PREFIX =
  /^(rounded|shadow|h|w|min-h|min-w|max-h|max-w|size|p|px|py|ps|pe|pt|pb|pl|pr|m|mx|my|ms|me|mt|mb|ml|mr|left|right|float|clear|scroll-ml|scroll-mr|scroll-pl|scroll-pr|gap|gap-x|gap-y|text|bg|border|ring|ring-offset|outline|fill|stroke|z|inset|inset-x|inset-y|start|end|top|bottom|leading|tracking|font|opacity|animate|translate-x|translate-y|rotate|scale|origin|grid-cols|grid-rows|grid-flow|auto-cols|auto-rows|col-span|row-span|basis|order|accent|divide|space-x|space-y|backdrop-blur|blur|duration|ease|delay|line-clamp|aspect|decoration|underline-offset|placeholder|caret|from|via|to|flex|items|justify|self|place|content|overflow|whitespace|break|list|cursor|select|pointer-events|transition|object|shrink|grow|appearance)-/;
const EXACT_UTILITIES = new Set([
  'flex', 'grid', 'hidden', 'block', 'inline', 'inline-block', 'inline-flex', 'contents', 'truncate', 'sr-only',
  'relative', 'absolute', 'fixed', 'sticky', 'static', 'tabular-nums', 'antialiased', 'uppercase', 'lowercase',
  'italic', 'underline', 'shrink', 'grow', 'border', 'rounded', 'shadow', 'outline-none', 'transition',
]);
// الموضع بالاسم (origin-top-right، bg-left، object-right-top) ينقلب تحت dir=rtl مثل ml-.
const PHYSICAL =
  /^-?(ml|mr|pl|pr|left|right)-|^(border|rounded)-[lr](-|$)|^rounded-(tl|tr|bl|br)(-|$)|^(text|float|clear)-(left|right)$|^scroll-(ml|mr|pl|pr)-|^(space|divide)-x(-|$)|^(origin|bg|object)-(.*-)?(left|right)(-(top|bottom))?$/;
const RAW_PALETTE =
  /(^|-)(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(\/\d+)?$/;
const BROWSER_DIALOGS = new Set(['confirm', 'alert', 'prompt']);
const GLOBALS = new Set(['window', 'globalThis', 'self']);
const TOKEN_SHAPE = /^[!a-z-][\w:/[\]().%,#!-]*$/i;
// أوّل معامل لواجهة مفاتيح نصّية اسم مو صنف: headers.get('content-type') وlocalStorage.getItem(…). classList.add يبقى ينفحص.
const KEY_METHODS = new Set(['get', 'has', 'set', 'append', 'delete', 'getItem', 'setItem', 'removeItem', 'getAttribute', 'setAttribute', 'hasAttribute', 'removeAttribute']);

function baseOf(token) {
  return token.split(':').pop().replace(/^!/, '');
}

function isKeyArgument(node) {
  const call = node.parent;
  return Boolean(
    call && ts.isCallExpression(call) && call.arguments[0] === node &&
    ts.isPropertyAccessExpression(call.expression) && KEY_METHODS.has(call.expression.name.text),
  );
}

function isCandidate(token) {
  if (!TOKEN_SHAPE.test(token) || token.endsWith('-') || token.endsWith(':')) return false;
  const base = baseOf(token).replace(/^-/, '');
  return EXACT_UTILITIES.has(base) || UTILITY_PREFIX.test(base);
}

function unescapeCss(selector) {
  return selector.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch));
}

/** الأصناف اللي يولّدها Tailwind فعلاً بإعداد المستودع (ومعها .card و.input من index.css). */
export async function generatedClasses(candidates) {
  const css = readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8').replace(/^@import .*$/gm, '');
  const result = await postcss([
    tailwindcss({ ...tailwindConfig, content: [{ raw: candidates.join(' '), extension: 'html' }] }),
  ]).process(css, { from: undefined });
  const classes = new Set();
  for (const match of result.css.matchAll(/\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-])+)/g)) classes.add(unescapeCss(match[1]));
  return classes;
}

/**
 * صنف ينركّب حول ${…}: قبله شظيّة أداة تنتهي بـ- (text-${tone}، bg-warn-${n})،
 * أو الكلمة تبدي بالتعويض وبعده -رقم (${side}-0). يرجّع الشكل للرسالة أو null.
 */
function dynamicClass(template) {
  const parts = [template.head.text, ...template.templateSpans.map((span) => span.literal.text)];
  for (let i = 0; i < template.templateSpans.length; i += 1) {
    const before = parts[i];
    const after = parts[i + 1];
    const tail = /\s$/.test(before) ? '' : before.split(/\s+/).pop();
    const head = /^\s/.test(after) ? '' : after.split(/\s+/)[0];
    const fragment = tail.endsWith('-') && TOKEN_SHAPE.test(tail) && UTILITY_PREFIX.test(baseOf(tail).replace(/^-/, ''));
    // -رقم بس إذا الكلمة تبدي بالتعويض: «${y}-${m}-01» تاريخ مو صنف.
    const shade = tail === '' && /^-\d+(\.\d+)?(\/\d+)?$/.test(head);
    if (fragment || shade) return `${tail}\${…}${head}`;
  }
  return null;
}

const CLASS_HELPERS = new Set(['cx', 'clsx', 'classNames', 'cn', 'twMerge']);

/**
 * القالب يبني صنفاً: داخل className، أو بمساعد أصناف (cx…)، أو باسم فيه class، أو بيه أداة كاملة غير المركّبة
 * («absolute ${side}-0»). غير هيچ هو معرّف أو تاريخ أو مفتاح («${month}-01»، `select-${id}`) مو صنف.
 */
function inClassContext(template) {
  for (let node = template.parent; node && !ts.isBlock(node) && !ts.isSourceFile(node); node = node.parent) {
    if (ts.isJsxAttribute(node)) return /^(className|class)$/.test(node.name.getText());
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_HELPERS.has(node.expression.text)) return true;
    if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) && /class/i.test(node.name.getText())) {
      return true;
    }
    if (ts.isFunctionLike(node)) {
      // const badgeClass = (n) => `bg-warn-${n}`: الدالّة نفسها مسمّاة صنف.
      const holder = node.parent;
      if ((ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) && /class/i.test(holder.name.getText())) return true;
      break;
    }
  }
  const statics = [template.head.text, ...template.templateSpans.map((span) => span.literal.text)];
  return statics.some((part) => part.split(/\s+/).some((token, index, all) => {
    // الكلمة اللي تلصق بالتعويض جزء منه مو أداة كاملة.
    const touchesStart = index === 0 && part !== statics[0] && !/^\s/.test(part);
    const touchesEnd = index === all.length - 1 && !/\s$/.test(part) && part !== statics[statics.length - 1];
    return token !== '' && !touchesStart && !touchesEnd && isCandidate(token);
  }));
}

/** المعرّف مستعمل كقيمة (نداء، تمرير، إسناد)، مو اسم خاصّية أو تصريح أو نوع. */
function isValueUse(node) {
  const parent = node.parent;
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) return parent.expression === node || Boolean(parent.arguments?.includes(node));
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isParameter(parent) || ts.isPropertyDeclaration(parent) || ts.isBindingElement(parent)) {
    return parent.initializer === node;
  }
  if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) return parent.expression === node;
  if (ts.isArrowFunction(parent)) return parent.body === node;
  return (
    ts.isShorthandPropertyAssignment(parent) || ts.isBinaryExpression(parent) || ts.isConditionalExpression(parent) ||
    ts.isReturnStatement(parent) || ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) ||
    ts.isArrayLiteralExpression(parent) || ts.isSpreadElement(parent) || ts.isJsxExpression(parent) ||
    ts.isExpressionStatement(parent) || ts.isAwaitExpression(parent) || ts.isPrefixUnaryExpression(parent) ||
    ts.isTypeOfExpression(parent) || ts.isExportAssignment(parent)
  );
}

/** اسم نافذة المتصفّح إذا العقدة تشير لها: window.confirm وglobalThis['alert'] وself.prompt وconfirm المجرّد
 * (المجرّد بس إذا ما انعرّف بنطاقه: confirm من useDialog() بمكوّن ثاني ما يغطّي confirm العامّ هنا). */
function browserDialogAt(node) {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && GLOBALS.has(node.expression.text) && BROWSER_DIALOGS.has(node.name.text)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && GLOBALS.has(node.expression.text)) {
    const key = literalText(node.argumentExpression);
    if (key && BROWSER_DIALOGS.has(key)) return key;
  }
  if (ts.isIdentifier(node) && BROWSER_DIALOGS.has(node.text) && isValueUse(node) && resolveBinding(node) === null) return node.text;
  // const { confirm: ask } = window
  if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer) && GLOBALS.has(node.initializer.text)) {
    for (const element of node.name.elements) {
      const key = element.propertyName ?? element.name;
      if ((ts.isIdentifier(key) || ts.isStringLiteral(key)) && BROWSER_DIALOGS.has(key.text)) return key.text;
    }
  }
  return null;
}

function tokensOf(file) {
  const sourceFile = parse(file);
  const tokens = [];
  const problems = [];
  walk(sourceFile, (node) => {
    const dialog = browserDialogAt(node);
    if (dialog) problems.push(`${where(file, lineOf(sourceFile, node))}: نافذة المتصفّح (${dialog}) — التأكيد داخل التطبيق بـConfirmDialog`);
    if (ts.isTemplateExpression(node) && inClassContext(node)) {
      const shape = dynamicClass(node);
      const line = lineOf(sourceFile, node);
      if (shape && !hasMarker(file, line, 'ui-ok:')) {
        problems.push(`${where(file, line)}: «${shape}» صنف مركّب: استعمل خريطة نصوص ثابتة (أو ui-ok: بسببه)`);
      }
    }
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    if (text === null || isKeyArgument(node)) return;
    const line = lineOf(sourceFile, node);
    for (const token of text.split(/\s+/)) if (isCandidate(token)) tokens.push({ token, line });
  });
  return { tokens, problems };
}

export async function check(files) {
  const problems = [];
  const found = [];
  for (const file of files) {
    const { tokens, problems: fileProblems } = tokensOf(file);
    problems.push(...fileProblems);
    for (const { token, line } of tokens) {
      const base = baseOf(token);
      // الفيزيائي المقصود (خانة الآحاد بالجدول طرف الرقم الأيمن بكل اتجاه) بسبب ظاهر على سطره بس.
      if (PHYSICAL.test(base)) {
        if (!hasMarker(file, line, 'ui-ok:')) problems.push(`${where(file, line)}: «${token}» اتجاه فيزيائي — استعمل ms-/me-/ps-/pe-/start-/end- (أو ui-ok: بسببه)`);
      }
      else if (RAW_PALETTE.test(base)) problems.push(`${where(file, line)}: «${token}» لون Tailwind خام — استعمل brand/success/warn/danger/accent`);
      else found.push({ file, token, line });
    }
  }
  const unique = [...new Set(found.map((entry) => entry.token))];
  // «hidden» دائماً حتى Tailwind ما يحذّر من محتوى بلا أصناف بالمدخلات المصنوعة.
  const generated = await generatedClasses(['hidden', ...unique]);
  for (const { file, token, line } of found) {
    if (!generated.has(token)) problems.push(`${where(file, line)}: «${token}» ما ينولّد من إعداد Tailwind`);
  }
  return { problems, tokens: found.length, unique: unique.length };
}

export async function selfTest() {
  // كل ملف بعدد مخالفاته: عدد إجمالي يخبّي شكل ضايع ورا شكل ثاني ينمسك مرّتين.
  const bad = [
    ['self/a.tsx', 6, "export const A = () => <div className=\"ml-2 bg-amber-500 h-15 text-warn-975 rounded-5xl\" onClick={() => window.confirm('x')} />;"],
    ['self/dyn.tsx', 3, 'export const D = ({ tone, n, side }) => <><b className={`text-${tone}-800`} /><i className={`text-warn-${n}`} /><u className={`absolute ${side}-0`} /></>;'],
    ['self/lib.ts', 4, "export const tones = { warn: 'ml-2 text-warn-975' }; export function out() { if (confirm(t('logout.ask', 'x'))) signOut(); document.body.classList.add('mr-2'); }"],
    ['self/dialogs.ts', 6, "globalThis.confirm('x'); self.alert('x'); window['prompt']('x'); const ask = window.confirm; const { alert: warn } = window; run(prompt, ask, warn);"],
    ['self/origin.tsx', 5, 'export const O = () => <b className="origin-left origin-top-right bg-left object-right bg-right-top" />;'],
    // confirm معرّف بدالّة ثانية ما يغطّي confirm العامّ هنا.
    ['self/scope.ts', 1, "function a(confirm) { return confirm; } export function b() { return confirm('x'); }"],
    // مركّب بمساعد أصناف وبمتغيّر اسمه class.
    ['self/helpers.tsx', 2, 'export const X = ({ tone }) => cx(`text-${tone}-800`); const badgeClass = (n) => `bg-warn-${n}`;'],
  ];
  const result = await check(bad.map(([file, , text]) => ({ path: file, text })));
  for (const [file, expected] of bad) {
    const got = result.problems.filter((problem) => problem.startsWith(`${file}:`));
    if (got.length !== expected) return `${file}: توقّعت ${expected} مخالفات وطلع ${got.length}: ${got.join(' | ')}`;
  }
  const good = await check([
    {
      path: 'self/b.tsx',
      text: "export const B = () => <div className=\"card ms-2 h-13 rounded-t-4xl text-warn-800 border-line shadow-card dark:bg-brand-500/15 md:ps-19 pt-[env(safe-area-inset-top)] origin-center bg-center object-cover\" />;",
    },
    {
      path: 'self/ok.ts',
      text: [
        "const { confirm } = useDialog(); export const go = () => confirm({ title: 'x' });",
        'export async function install(event) { await event.prompt(); }',
        'interface E { prompt(): Promise<void>; alert: string }',
        "export const role = 'alert'; export const cls = (on) => `card ${on ? 'ms-2' : 'me-2'}`;",
        'export const day = (y, m) => `${y}-${m}-01`; export const id = (x) => `${x}-bg`;',
        "export const isScript = (r) => /javascript/.test(r.headers.get('content-type') ?? ''); localStorage.getItem('select-unit');",
        // معرّفات وتواريخ ومفاتيح: مو أصناف.
        'export const firstOfMonth = (month) => `${month}-01`; export const keys = (id, i, hash, a) => [`order-${id}`, `list-${i}`, `content-${hash}`, `from-${a}`, `start-${id}`, `${id}-1`];',
        'export function c({ id }) { const confirm = useDialog(); return confirm(id); }',
      ].join('\n'),
    },
    { path: 'self/label.tsx', text: 'export const L = ({ id }) => <label htmlFor={`select-${id}`} className="ms-2" />;' },
    { path: 'self/marked.tsx', text: 'export const M = ({ n }) => <b className={`text-${n}`} />; // ui-ok: n من خريطة ثابتة كلها أصناف كاملة' },
    { path: 'self/physical.tsx', text: "export const P = () => <td className=\"text-right\" />; // ui-ok: الآحاد طرف الرقم الأيمن" },
  ]);
  if (good.problems.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${good.problems.join(' | ')}`;
  return null;
}

export async function run() {
  const files = readSources('src', ['.ts', '.tsx']);
  const result = await check(files);
  const modules = files.filter((file) => !file.path.endsWith('.tsx')).length;
  // مسح بلا ملفات .ts يعني رجع للـ.tsx بس: خرائط الألوان وconfirm بالـ.ts تعبر بصمت.
  if (modules === 0) result.problems.push('ماكو ولا ملف .ts بالمسح — ui-guard لازم يمسح .ts و.tsx');
  return {
    scanned: files.length,
    problems: result.problems,
    summary: `فحصت ${files.length} ملفاً (${files.length - modules} .tsx و${modules} .ts) و${result.tokens} صنفاً (${result.unique} مختلف) على إعداد Tailwind الحقيقي`,
  };
}
