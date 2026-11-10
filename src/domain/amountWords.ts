import { FILS_PER_DINAR, type Fils } from './money';

// التفقيط بالدينار العراقي (خطّة المحاسبة §8.1 «1-هـ»، عقد 0024 F4 وF5): المبلغ كتابةً بصيغة المحاسب «فقط … لا غير» على الكشف
// والسند. منطق صافٍ بلا t(): ألفاظ العدد قواعد نحو لا نصوص واجهة تُترجم بمفتاح (لغة أخرى تحتاج دالّة أخرى)، فهي بيانات هنا مثل
// حروف التطبيع، وكلّ سطر فيها موسوم بـi18n-ok. والإشارة لا تُقرأ: الشاشة تقول «عليه» أو «له» بجانبه.
//
// القواعد (الفصحى، والمعدود كلّه مذكّر: دينار وفلس وألف ومليون ومليار وتريليون، فالعدد 3–10 بالتاء، والرفع في كلّ الصيغة):
// - الواحد والاثنان بعد المعدود أو بلفظه: «دينار عراقي واحد»، «ديناران عراقيان»، «ألف»، «ألفان».
// - 3–10 تمييزها جمع مجرور: «ثلاثة دنانير عراقية»، «ثلاثة آلاف»، «عشرة ملايين».
// - 11–99 تمييزها مفرد منصوب: «أحد عشر ديناراً عراقياً»، «خمسون ألفاً وخمسمئة…»؛ ويُحذف التنوين إذا أضيف إلى ما بعده:
//   «خمسون ألف دينار».
// - المئة والألف والمليون والمليار تمييزها مفرد مجرور: «مئة دينار»، «ألف دينار»؛ ومثنّاها المضاف بلا نون: «مئتا دينار»،
//   «ألفا دينار»، «مليونا دينار»، «مئتا ألف».
// - المعدود يتبع آخر جزء من العدد: «مئة وثلاثة دنانير»، «مئة وأحد عشر ديناراً»، «ألف ومئة دينار».
// - إذا انتهى العدد بواحد أو اثنين بعد مئة فأكثر فبصيغة المحاسبين العراقيين (قرار المنسّق، مراجعة 0024): الواحد والاثنان لفظاً
//   معطوفين والمعدود بعدهما مفرد مجرور: «مئة وواحد دينار عراقي»، «ألف واثنان دينار عراقي»، «مئة وواحد ألف دينار»، «مليون
//   واثنان دينار عراقي» (لا «مئة دينار ودينار» التي تُقرأ عند المحاسب مبلغين).
// - النعت «عراقي» يطابق المعدود الأخير: عراقي، عراقيان، عراقية (جمع غير العاقل)، عراقياً.
// - الفلس (١/١٠٠ دينار في هذا النظام) بالقواعد نفسها بعد فاصلة و«و» فلا يُقرأ جزءاً من الدنانير: «دينار عراقي واحد، وعشرون
//   فلساً»، «، وفلس واحد»، «، وثلاثة فلوس»؛ وبلا دينار: «فقط خمسون فلساً لا غير». والصفر: «فقط صفر دينار عراقي لا غير».
// المراجعة النحوية عند المنسّق (العقد 0024 §6)، والفحص بجدول مكتوب باليد (scripts/tests/amount-words.test.mjs).

/** اسم معدود مذكّر بصيغه بعد العدد. */
interface Noun {
  /** المفرد وحده (العدد واحد)، والمفرد المجرور بعد المئة والألف (يُكتبان بالرسم نفسه). */
  one: string;
  /** المثنّى المرفوع. */
  two: string;
  /** المثنّى المضاف (بلا نون). */
  twoOf: string;
  /** جمع التمييز بعد 3–10. */
  few: string;
  /** المفرد المنصوب المنوّن بعد 11–99. */
  many: string;
  /** المنصوب المضاف (بلا تنوين). */
  manyOf: string;
}

const UNITS = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة']; // i18n-ok: ألفاظ العدد قواعد تفقيط لا نصّ واجهة
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']; // i18n-ok: ألفاظ العدد
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']; // i18n-ok: ألفاظ العقود
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة']; // i18n-ok: ألفاظ المئات
const TWO_HUNDRED_OF = 'مئتا'; // i18n-ok: المثنّى المضاف «مئتا دينار»
const AND = 'و'; // i18n-ok: واو العطف بين أجزاء العدد
const COMMA_AND = '، و'; // i18n-ok: فاصلة ثمّ واو قبل الفلوس، فلا تُقرأ جزءاً من الدنانير

const THOUSAND: Noun = { one: 'ألف', two: 'ألفان', twoOf: 'ألفا', few: 'آلاف', many: 'ألفاً', manyOf: 'ألف' }; // i18n-ok: صيغ الألف
const MILLION: Noun = { one: 'مليون', two: 'مليونان', twoOf: 'مليونا', few: 'ملايين', many: 'مليوناً', manyOf: 'مليون' }; // i18n-ok: صيغ المليون
const BILLION: Noun = { one: 'مليار', two: 'ملياران', twoOf: 'مليارا', few: 'مليارات', many: 'ملياراً', manyOf: 'مليار' }; // i18n-ok: صيغ المليار
const TRILLION: Noun = { one: 'تريليون', two: 'تريليونان', twoOf: 'تريليونا', few: 'تريليونات', many: 'تريليوناً', manyOf: 'تريليون' }; // i18n-ok: صيغ التريليون
/** المراتب من الأعلى: التريليون ثمّ المليار ثمّ المليون ثمّ الألف (وما فوق التريليون يُعدّ بالتريليون: «ألف تريليون»). */
const SCALES: readonly [bigint, Noun][] = [
  [1_000_000_000_000n, TRILLION],
  [1_000_000_000n, BILLION],
  [1_000_000n, MILLION],
  [1_000n, THOUSAND],
];

const DINAR = { one: 'دينار عراقي واحد', two: 'ديناران عراقيان', few: 'دنانير عراقية', many: 'ديناراً عراقياً', gen: 'دينار عراقي' }; // i18n-ok: صيغ الدينار ونعته
const FILS = { one: 'فلس واحد', two: 'فلسان', few: 'فلوس', many: 'فلساً' }; // i18n-ok: صيغ الفلس
const ZERO = 'صفر'; // i18n-ok: لفظ الصفر
const ONLY = 'فقط'; // i18n-ok: صيغة المحاسب «فقط … لا غير»
const NO_MORE = 'لا غير'; // i18n-ok: صيغة المحاسب «فقط … لا غير»

/** خانة صغيرة (0–999) رقماً لاختيار لفظها من الجداول. */
const small = (value: bigint): number => Number(value); // number-ok: خانة عدد 0–999 لاختيار لفظها، لا مبلغ

/** 1–99 لفظاً مرفوعاً لمعدود مذكّر: «واحد وعشرون»، «اثنا عشر». */
function belowHundred(n: number): string {
  if (n < 10) return UNITS[n] ?? '';
  if (n < 20) return TEENS[n - 10] ?? '';
  const unit = n % 10;
  const ten = TENS[(n - unit) / 10] ?? '';
  return unit === 0 ? ten : `${UNITS[unit] ?? ''} ${AND}${ten}`;
}

/** 1–999 لفظاً، والمعدود بعده مباشرةً: المئتان مضافة إذا لم يتبعها شيء («مئتا دينار»، «مئتا ألف»). */
function belowThousand(n: number): string {
  const rest = n % 100;
  const hundreds = (n - rest) / 100;
  if (hundreds === 0) return belowHundred(rest);
  const head = hundreds === 2 && rest === 0 ? TWO_HUNDRED_OF : (HUNDREDS[hundreds] ?? '');
  return rest === 0 ? head : `${head} ${AND}${belowHundred(rest)}`;
}

/** صيغة المعدود بعد عدد آخره rest (باقي المئة): 0 مجرور مفرد، 3–10 جمع، 11–99 منصوب. */
function formAfter(rest: bigint, noun: Noun, construct: boolean): string {
  if (rest === 0n) return noun.one;
  if (rest <= 10n) return noun.few;
  return construct ? noun.manyOf : noun.many;
}

/** عدد ينتهي بواحد أو اثنين بعد مئة فأكثر (101، 1002، 201…): صيغة المحاسبين «مئة وواحد دينار»، والمعدود بعده مفرد. */
const endsInOneOrTwo = (n: bigint): boolean => n > 100n && (n % 100n === 1n || n % 100n === 2n);

/**
 * count من الاسم noun (مرتبة: ألف أو مليون…): «ألف»، «ألفان»/«ألفا»، «ثلاثة آلاف»، «أحد عشر ألفاً»/«ألف»، «مئة وواحد ألف».
 * construct: يليه مضاف إليه مباشرةً (الدينار أو مرتبة تحته بلا «و»)، فالمثنّى بلا نون والمنصوب بلا تنوين.
 */
function countOf(count: bigint, noun: Noun, construct: boolean): string {
  if (count === 1n) return noun.one;
  if (count === 2n) return construct ? noun.twoOf : noun.two;
  if (endsInOneOrTwo(count)) return `${number(count)} ${noun.one}`;
  return `${number(count)} ${formAfter(count % 100n, noun, construct)}`;
}

/** العدد (≥ 1) لفظاً ومعدوده بعده مباشرةً: المراتب من الأعلى معطوفةً، وآخر مرتبة مضافة إلى ما بعدها إن لم يتبعها شيء. */
function number(n: bigint): string {
  for (const [size, noun] of SCALES) {
    if (n < size) continue;
    const count = n / size;
    const rest = n % size;
    const head = countOf(count, noun, rest === 0n);
    return rest === 0n ? head : `${head} ${AND}${number(rest)}`;
  }
  return belowThousand(small(n));
}

/** الدنانير بمعدودها ونعته: «دينار عراقي واحد»، «مئتا دينار عراقي»، «مئة وواحد دينار عراقي». */
function dinarsPhrase(dinars: bigint): string {
  if (dinars === 0n) return `${ZERO} ${DINAR.gen}`;
  if (dinars === 1n) return DINAR.one;
  if (dinars === 2n) return DINAR.two;
  const rest = dinars % 100n;
  if (rest === 0n || endsInOneOrTwo(dinars)) return `${number(dinars)} ${DINAR.gen}`;
  return `${number(dinars)} ${rest <= 10n ? DINAR.few : DINAR.many}`;
}

/** الفلوس (1–99) بمعدودها: «فلس واحد»، «فلسان»، «ثلاثة فلوس»، «خمسون فلساً». */
function filsPhrase(fils: bigint): string {
  if (fils === 1n) return FILS.one;
  if (fils === 2n) return FILS.two;
  return `${number(fils)} ${fils <= 10n ? FILS.few : FILS.many}`;
}

/**
 * المبلغ كتابةً بصيغة المحاسب: «فقط مليونان ومئتان وخمسون ألف دينار عراقي لا غير»، وبالفلوس «… دينار عراقي، وخمسون فلساً
 * لا غير». السالب بقيمته المطلقة (الجهة «عليه» أو «له» يقولها المستدعي).
 */
export function amountInWords(amount: Fils): string {
  const abs = amount < 0n ? -amount : amount;
  const dinars = abs / FILS_PER_DINAR;
  const fils = abs % FILS_PER_DINAR;
  const parts: string[] = [];
  if (dinars > 0n || fils === 0n) parts.push(dinarsPhrase(dinars));
  if (fils > 0n) parts.push(filsPhrase(fils));
  return `${ONLY} ${parts.join(COMMA_AND)} ${NO_MORE}`;
}
