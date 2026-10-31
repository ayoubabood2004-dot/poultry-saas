// i18n-guard: كل عربية معروضة من t(key, "النص") أو <Trans k text>، ومفتاح واحد ما يحمل نصّين،
// ومفتاح مكرّر بملف ترجمة ينمسك بمسح النصّ الخام (JSON.parse ياخذ الأخير بصمت).
// العربي المرمّز (\u{…} أو &#…; بالـJSX) ينعرض مثل الصريح، فاستثناؤه بـ// i18n-ok: السبب على سطره بس.
// برّا مسحه بالاسم: index.html وvite.config.ts (شاشة الإقلاع والـmanifest ثابتة قبل ما يقلع JS).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ARABIC, calleeName, hasMarker, lineOf, literalText, parse, readSources, ROOT, ts, walk, where } from './lib.mjs';

export const name = 'i18n-guard';

function transTextAttribute(node) {
  // <Trans k="…" text="…" />: النصّ المسموح هو قيمة text بس.
  const attribute = node.parent;
  if (!attribute || !ts.isJsxAttribute(attribute) || attribute.name.getText() !== 'text') return false;
  const element = attribute.parent?.parent;
  return Boolean(element && (ts.isJsxSelfClosingElement(element) || ts.isJsxOpeningElement(element)) && element.tagName.getText() === 'Trans');
}

/** &#x645; و&#1605; بالـJSX: React يعرضها حروفاً، فتنفحص مفكوكة. */
function decodeEntities(text) {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code) => {
    const point = code[0] === 'x' || code[0] === 'X' ? parseInt(code.slice(1), 16) : Number(code);
    return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

// الواجهة بالفصحى (قرار المالك 18، 2026-10-24): كلمات اللهجة بنصّ معروض تنرفض.
// كلمات ما إلها معنى فصيح بالواجهة، تنقارن بعد مسح التشكيل والتطويل. واو العطف وفاؤه تنشال بس عن
// كلمات PREFIXABLE: «وكّلت» و«فيمَ» و«فراح» فصيحة رغم «كلت» و«يم» و«راح». والباء واللام جزء من الكلمة.
// الاستثناء النادر (مصطلح فصيح يشبه اللهجة) بـ// i18n-ok: السبب على سطر النصّ.
const DIALECT = new Set([
  'ماكو', 'اكو', 'أكو', 'شنو', 'شلون', 'اشلون', 'شكد', 'اشكد', 'ليش', 'منو', 'وين', 'هسه', 'هسة', 'هسا',
  'هاي', 'هذي', 'هذول', 'هواية', 'كلش', 'حيل', 'شوية', 'شويه', 'شي', 'ويا', 'لحاله', 'لحالها', 'لحالهم',
  'لكيت', 'لگيت', 'فوك', 'يم', 'بس', 'مو', 'خلي', 'خليه', 'خليها', 'كدرنا', 'نكدر', 'تكدر', 'يكدر',
  'لحد', 'إله', 'إلها', 'إلهم', 'إلهن', 'إلنا', 'إلك', 'إلكم', 'بيه', 'بيها', 'بيهم', 'بيكم', 'بعدين', 'هيچ', 'هيج', 'راح',
  'يكول', 'تكول', 'نكول', 'كلت', 'جاري', 'خوش', 'اللي',
  'وياه', 'وياها', 'وياهم', 'وياهن', 'وياك', 'وياكم', 'ويانا', 'وياي', 'لحالي', 'لحالك', 'لحالنا', 'لحالكم', 'لحالهن',
  // «شغّال» بمعنى «يعمل/نشط» (الفوج الشغّال): الفصيح «نشط» أو «قائم».
  'شغال', 'شغالة', 'شغالين', 'شغالات', 'الشغال', 'الشغالة', 'الشغالين', 'الشغالات',
]);
// «زين» (زين كاش) و«تمام» (في تمام الساعة) و«بيك» (بيك أب) لها قراءة فصيحة أو اسم علم، فما بالقائمة.
const PREFIXABLE = new Set([
  'ماكو', 'اكو', 'أكو', 'شنو', 'شلون', 'هسه', 'هسة', 'هسا', 'هاي', 'هذي', 'هذول', 'ويا', 'لحد', 'خلي', 'خليه', 'خليها',
  'مو', 'بس', 'بعدين', 'لحاله', 'لحالها', 'لحالهم', 'بيه', 'بيها', 'بيهم', 'إله', 'إلها', 'إلهم', 'إلنا', 'إلك', 'إلكم', 'اللي',
]);
// «سدّ» و«شيك» فصيحتان (سدّ الدين، الدفع بشيك، انتهاء وشيك)، فما بالقائمة. «سدّ» بمعنى «أغلق» تنمسك بمفعولها
// (بلا «الباب»: «سدّ الباب أمام التلاعب» فصيح)، وبلا فاء: «فسد التطبيق» فعل فصيح.
const CLOSE_PHRASE = /(?<!\p{L})و?سد (?:النافذة|الشباك|التطبيق|القائمة|التنبيه|الشريط)/gu;
const PERSIAN_LETTERS = /[\u{686}\u{6AF}\u{67E}\u{6A4}]/u; // چ گ پ ڤ
// الأرقام العربية الشرقية (٠–٩) والفارسية (۰–۹).
const EASTERN_DIGITS = /[\u{660}-\u{669}\u{6F0}-\u{6F9}]/gu;
const INTERNAL_REFERENCE = /\b(?:FOUNDATION|DECISIONS)\b/u;
const MARKS = /[\u{64B}-\u{65F}\u{670}\u{640}]/gu;

/** كلمات اللهجة بنصّ معروض، بترتيب ظهورها (والعبارات بعدها). */
export function dialectWords(text) {
  const found = [];
  for (const raw of text.split(/[^\p{L}\p{M}]+/u)) {
    const word = raw.replace(MARKS, '');
    if (!word) continue;
    const bare = word.replace(/^[وف](?=..)/u, '');
    if (DIALECT.has(word) || (bare !== word && PREFIXABLE.has(bare)) || PERSIAN_LETTERS.test(word)) found.push(raw);
  }
  for (const match of text.replace(MARKS, '').matchAll(CLOSE_PHRASE)) found.push(match[0]);
  return found;
}

function isTextArgumentOfT(node) {
  const call = node.parent;
  return Boolean(call && ts.isCallExpression(call) && calleeName(call) === 't' && ts.isIdentifier(call.expression) && call.arguments[1] === node);
}

export function check(files) {
  const problems = [];
  const keys = new Map();
  let calls = 0;
  const remember = (key, text, file, line) => {
    const place = where(file, line);
    const seen = keys.get(key);
    if (!seen) keys.set(key, { text, place });
    else if (seen.text !== text) problems.push(`${place}: المفتاح «${key}» بنصّ ثاني غير اللي بـ${seen.place}`);
    const dialect = hasMarker(file, line, 'i18n-ok:') ? [] : dialectWords(text);
    if (dialect.length) problems.push(`${place}: لهجة بنصّ الواجهة «${dialect.join('، ')}» بالمفتاح «${key}» — الواجهة بالفصحى`);
    // قانون المالك للأرقام: كل رقم معروض غربي، حتى داخل نصّ t() (الشرقي ينقلب بالإدخال بس). وإحالات الوثائق الداخلية (FOUNDATION
    // وDECISIONS) مكانها التعليقات، مو نصّ يقراه المستخدم.
    const eastern = text.match(EASTERN_DIGITS);
    if (eastern) problems.push(`${place}: أرقام شرقية «${eastern.join('')}» بنصّ الواجهة بالمفتاح «${key}» — كل رقم معروض غربي`);
    const reference = text.match(INTERNAL_REFERENCE);
    if (reference) problems.push(`${place}: إحالة داخلية «${reference[0]}» بنصّ الواجهة بالمفتاح «${key}» — مكانها التعليق`);
  };

  for (const file of files) {
    const sourceFile = parse(file);
    walk(sourceFile, (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
        calls += 1;
        const line = lineOf(sourceFile, node);
        const key = literalText(node.arguments[0]);
        const text = literalText(node.arguments[1]);
        if (key === null || text === null) problems.push(`${where(file, line)}: t() لازم مفتاح ونصّ ثابتين`);
        else remember(key, text, file, line);
        return;
      }
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === 'Trans') {
        calls += 1;
        const line = lineOf(sourceFile, node);
        const attr = (attrName) => node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === attrName);
        const key = literalText(attr('k')?.initializer);
        const text = literalText(attr('text')?.initializer);
        if (key === null || text === null) problems.push(`${where(file, line)}: <Trans> لازم k وtext ثابتين`);
        // نصّ الخاصية بالـJSX ينعرض بكياناته مفكوكة (&#x663; = ٣)، فينفحص مفكوكاً.
        else remember(key, decodeEntities(text), file, line);
        return;
      }

      let text = null;
      if (ts.isJsxText(node)) text = decodeEntities(node.text);
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = ts.isJsxAttribute(node.parent) ? decodeEntities(node.text) : node.text;
      else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
      // النصّ المفكوك مو المصدر الخام: «\u{645}\u{631}» ينعرض «مر» مثل الحرف الصريح.
      if (text === null || !ARABIC.test(text)) return;

      const line = lineOf(sourceFile, node);
      if (ts.isJsxText(node)) {
        problems.push(`${where(file, line)}: نصّ عربي مباشر بالواجهة — مرّره من t()`);
        return;
      }
      if (isTextArgumentOfT(node) || transTextAttribute(node) || hasMarker(file, line, 'i18n-ok:')) return;
      // المرمّز ما ينقرا بالمراجعة، فاستثناؤه (حروف التطبيع) لازم سبب ظاهر على سطره.
      const escaped = !ARABIC.test(node.getText(sourceFile));
      problems.push(
        escaped
          ? `${where(file, line)}: عربي مرمّز (\\u{…}) برّا t() — «${text.trim().slice(0, 40)}»: مرّره من t()، أو اكتب السبب بـ// i18n-ok:`
          : `${where(file, line)}: نصّ عربي برّا t() — «${text.trim().slice(0, 40)}»`,
      );
    });
  }
  return { problems, calls, keys: keys.size };
}

/** مفاتيح مكرّرة بملف ترجمة، بمسح النصّ الخام بكل مستوى. */
export function duplicateJsonKeys(raw) {
  const duplicates = [];
  const stack = [new Set()];
  const pattern = /"((?:[^"\\]|\\.)*)"\s*:|[{}]/g;
  for (const match of raw.matchAll(pattern)) {
    if (match[0] === '{') stack.push(new Set());
    else if (match[0] === '}') stack.pop();
    else {
      const seen = stack[stack.length - 1];
      if (seen?.has(match[1])) duplicates.push(match[1]);
      seen?.add(match[1]);
    }
  }
  return duplicates;
}

export function selfTest() {
  const bad = check([
    { path: 'self/a.tsx', text: 'export const A = () => <div>مرحبا</div>;' },
    { path: 'self/b.ts', text: "export const x = 'نصّ ضايع';" },
    { path: 'self/c.ts', text: "t('k.same', 'أوّل'); t('k.same', 'ثاني');" },
    { path: 'self/d.ts', text: "t(key, 'نصّ');" },
  ]);
  if (bad.problems.length !== 4) return `توقّعت 4 مخالفات بالمدخلات المصنوعة وطلع ${bad.problems.length}`;
  // العربي المرمّز ينعرض مثل الصريح: بلا وسم i18n-ok لازم ينمسك (title والنصّ بالـJSX، والكيان &#x…;).
  const escaped = check([
    { path: 'self/g.tsx', text: "export const G = () => <b title={'\\u{645}\\u{631}\\u{62D}\\u{628}\\u{627}'}>{'\\u{645}\\u{631}'}</b>;" },
    { path: 'self/h.tsx', text: 'export const H = () => <b title="&#x645;&#x631;">&#1605;&#1585;</b>;' },
  ]);
  if (escaped.problems.length !== 4) return `توقّعت 4 مخالفات للعربي المرمّز وطلع ${escaped.problems.length}: ${escaped.problems.join(' | ')}`;
  const good = check([
    { path: 'self/e.tsx', text: "t('k.one', 'نصّ'); export const B = () => <Trans k=\"k.two\" text=\"جملة <b>{n}</b>\" />;" },
    { path: 'self/f.ts', text: "const r = /[أإ]/g; const s = 'ا'; // i18n-ok: حرف للتطبيع مو نصّ معروض" },
    { path: 'self/i.ts', text: "const a = '\\u{627}'; // i18n-ok: حرف للتطبيع مو نصّ معروض\nt('k.three', '\\u{645}\\u{631}');" },
  ]);
  if (good.problems.length !== 0) return `المدخلات السليمة طلعت مخالفات: ${good.problems.join(' | ')}`;
  if (duplicateJsonKeys('{"a": 1, "b": {"a": 2}, "a": 3}').join() !== 'a') return 'كاشف المفاتيح المكرّرة ما مسك المكرّر';
  // كل كلمة لهجة لحالها تنمسك، ويّا واو العطف والتشكيل؛ والفصيح اللي يشبهها يعبر.
  const dialectBad = [
    'ماكو بيانات', 'شنو صار', 'هسّه', 'فمو مضمون', 'وبس', 'خلّي التطبيق مفتوح', 'چاي', 'جاري الفتح', 'سدّ النافذة', 'لحد ما يرجع',
    'إلنا عند الناس', 'خلّيته وياه', 'خوش علف', 'وسدّ التطبيق', 'الصندوق وياي', 'خلّيته وياهن', 'بيكم خير',
    'لا أفواج شغّالة في نطاقك', 'الأفواج الشغّالة',
  ];
  for (const text of dialectBad) if (dialectWords(text).length !== 1) return `اللهجة ما انمسكت (أو انمسكت أكثر من مرّة): «${text}»`;
  const dialectGood = [
    'لا توجد بيانات', 'تحت الحدّ الأدنى للحدّ', 'بسبب', 'موجود', 'جارٍ الفتح', 'وسّع الشريط', 'أغلق النافذة', 'حتى يعود الاتصال', 'شيء',
    'سدّ الدين', 'تمّ سدّ العجز', 'انتهاء وشيك', 'الدفع بشيك', 'عُدنا إلى الرئيسية', 'أرسل إليّ', 'الانسداد',
    'الدفع عبر زين كاش', 'في تمام الساعة العاشرة', 'سيارة بيك أب', 'وكّلت المحاسب', 'فيمَ تُستخدم', 'فراح', 'فسد التطبيق',
    'إذا فسد الشريط', 'سدّ الباب أمام التلاعب',
  ];
  for (const text of dialectGood) if (dialectWords(text).length !== 0) return `الفصيح انمسك لهجة: «${text}» (${dialectWords(text).join('، ')})`;
  const inT = check([{ path: 'self/j.ts', text: "t('k.dialect', 'ماكو شي');" }]);
  if (inT.problems.length !== 1) return `لهجة بنصّ t() ما انمسكت: ${inT.problems.length}`;
  // أرقام شرقية بنصّ t() أو <Trans>، وإحالة FOUNDATION أو DECISIONS: كل شكل ينمسك مرّة بالضبط، والرقم الغربي يعبر.
  const numbersBad = [
    "t('k.e1', 'ينتقل بالكلفة (البند \\u{669}\\u{662}).');",
    "t('k.e5', 'ينتقل بالكلفة (FOUNDATION 92).');",
    "t('k.e2', 'بعد \\u{6F3} أيام');",
    'export const E = () => <Trans k="k.e3" text="بعد {n} من &#x663;" />;',
    "t('k.e4', 'مستند بيوم التشغيل (DECISIONS القرار 15).');",
  ];
  for (const text of numbersBad) {
    const got = check([{ path: 'self/n.tsx', text }]).problems;
    if (got.length !== 1) return `رقم شرقي أو إحالة داخلية بنصّ الواجهة: توقّعت مخالفة وحدة وطلع ${got.length}: ${got.join(' | ') || text}`;
  }
  const numbersGood = check([{ path: 'self/o.tsx', text: "t('k.w1', 'بعد 3 أيام، والحدّ 1,500 كغم'); t('k.w2', 'الأساس (أسس التصميم)');" }]);
  if (numbersGood.problems.length !== 0) return `الرقم الغربي انمسك: ${numbersGood.problems.join(' | ')}`;
  // المصطلح الفصيح اللي يشبه اللهجة يعبر بسبب ظاهر على سطره، وبلا السبب ينمسك.
  const marked = check([{ path: 'self/k.ts', text: "t('k.term', 'رصيد جاري الشركاء'); // i18n-ok: جاري الشركاء مصطلح محاسبي" }]);
  if (marked.problems.length !== 0) return `وسم i18n-ok ما عبّر المصطلح: ${marked.problems.join(' | ')}`;
  return null;
}

/** النصّ المعروض بالملفات اللي برّا المسح بالاسم، بلا تعليقاتها. */
function visibleShellText(file) {
  return readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/.*$/gm, ' ');
}

export function run() {
  const files = readSources('src', ['.ts', '.tsx']);
  const result = check(files);
  const localesDir = path.join(ROOT, 'src', 'locales');
  let localeFiles = 0;
  if (existsSync(localesDir)) {
    for (const entry of readdirSync(localesDir).filter((f) => f.endsWith('.json'))) {
      localeFiles += 1;
      for (const key of duplicateJsonKeys(readFileSync(path.join(localesDir, entry), 'utf8'))) {
        result.problems.push(`src/locales/${entry}: مفتاح مكرّر «${key}»`);
      }
    }
  }
  // شاشة الإقلاع والـmanifest برّا t()، بس فصحى مثل باقي الواجهة.
  for (const shell of ['index.html', 'vite.config.ts']) {
    const dialect = dialectWords(visibleShellText(shell));
    if (dialect.length) result.problems.push(`${shell}: لهجة بنصّ معروض «${dialect.join('، ')}» — الواجهة بالفصحى`);
  }
  return {
    scanned: files.length,
    problems: result.problems,
    summary: `فحصت ${files.length} ملفاً، ${result.calls} نداء t()/Trans، ${result.keys} مفتاحاً، ${localeFiles} ملف ترجمة، وفصحى كل نصّ؛ index.html وvite.config.ts برّا مسح t() بالاسم وتنفحص لهجتها`,
  };
}
