import type { Day } from '../domain/dates';
import { FILS_PER_DINAR, MILLI_PER_UNIT, type Fils, type Milli } from '../domain/money';
import { splitPacks, type BaseUnit } from '../domain/units';
import { t } from './i18n';
import { group, groupSigned } from './numerals';

// المنسّقات الوحيدة للأرقام: أرقام غربية وفواصل en-US مثل doctorVet، بلا فاصلة عائمة.
// قانون المالك (2026-10-24): الفواصل دائماً، وnumbers-guard يرفض رقماً بالواجهة ما مرّ من هنا.
// الكمية أبداً ما تمرّ من fmtInt: بـdoctorVet نافذة الطيّ عرضت «3» عن حوض مقداره 3.25.

export { fmtInt } from './numerals';

function magnitude(value: bigint): [sign: string, abs: bigint] {
  return value < 0n ? ['-', -value] : ['', value];
}

const DAY_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

/** تاريخ يوم بالعرض: يوم/شهر/سنة بأرقام غربية («24/10/2026»). */
export function fmtDay(day: Day): string {
  const match = DAY_PARTS.exec(day);
  if (!match) throw new RangeError('fmtDay_bad_day');
  const [, year, month, date] = match;
  return `${date}/${month}/${year}`;
}

/**
 * رقم موبايل عراقي بشكله الموحّد (9647701234567) بالشكل اللي يكتبه الناس: «0770 123 4567». مو رقماً حسابياً،
 * فما يمرّ من fmtInt (ما تنحطّ بيه فواصل). غير الموحّد يرجع كما هو.
 */
export function fmtPhone(phone: string): string {
  if (!/^9647[0-9]{9}$/.test(phone)) return phone;
  return `0${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;
}

/** رمز الدعوة (6 أرقام نصّاً) بثلاثتين حتى ينقرا بالهاتف: «482 913». */
export function fmtInviteCode(code: string): string {
  return /^[0-9]{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** مبلغ بالفلس: بمرتبتين («694,579.56»)، أو 0 لدينار صحيح ويرمي إذا بيه كسر مخفي. */
export function fmtMoney(amount: Fils, decimals: 0 | 2 = 2): string {
  const [sign, abs] = magnitude(amount);
  const whole = group((abs / FILS_PER_DINAR).toString());
  const fraction = abs % FILS_PER_DINAR;
  if (decimals === 0) {
    if (fraction !== 0n) throw new RangeError('fmtMoney_not_whole');
    return sign + whole;
  }
  return `${sign}${whole}.${fraction.toString().padStart(2, '0')}`;
}

/**
 * كمية بعمود جدول (قانون الجداول: الآحاد تصطفّ بمراتب ثابتة للعمود): «3.250» و«750.000» بمراتب العمود،
 * والوحدة برأس العمود مو بالخلية. يرمي إذا بيها مراتب أكثر من العمود حتى ما تنخفي كمية.
 */
export function fmtQtyCell(qty: Milli, decimals: 0 | 1 | 2 | 3 = 3): string {
  const [sign, abs] = magnitude(qty);
  if (abs % 10n ** BigInt(3 - decimals) !== 0n) throw new RangeError('fmtQtyCell_hidden_fraction');
  const whole = group((abs / MILLI_PER_UNIT).toString());
  if (decimals === 0) return sign + whole;
  return `${sign}${whole}.${(abs % MILLI_PER_UNIT).toString().padStart(3, '0').slice(0, decimals)}`;
}

/**
 * رقم بيكتبه المستخدم الآن (لوحة الوزن): فواصل الآلاف على الجزء الصحيح، والكسر كما انكتب حتى «12.» تبقى
 * «12.» بنصّ الكتابة. القيمة المخزونة ما تتغيّر: هذا للعرض بس.
 */
export function fmtTypedNumber(value: string): string {
  if (value === '') return '0';
  const [whole = '', fraction] = value.split('.');
  return fraction === undefined ? group(whole) : `${group(whole)}.${fraction}`;
}

/** كمية بالآلاف بكل مراتبها المعنوية لحد ثلاث: 3.25 تبقى «3.25» و750 تبقى «750». */
export function fmtMilli(qty: Milli): string {
  const [sign, abs] = magnitude(qty);
  const whole = group((abs / MILLI_PER_UNIT).toString());
  const fraction = (abs % MILLI_PER_UNIT).toString().padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : sign + whole;
}

const TON: Milli = 1_000_000n;

/** أطنان من كمية بالغرام: ثلاث مراتب على الأقل («6.120»)، وأكثر إذا بيها غرامات حتى ما ينخفي شي. */
function fmtTons(qty: Milli): string {
  const [sign, abs] = magnitude(qty);
  const whole = group((abs / TON).toString());
  let fraction = (abs % TON).toString().padStart(6, '0');
  while (fraction.length > 3 && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${sign}${whole}.${fraction}`;
}

// عزل LTR (LRI … PDI) للرقم السالب: بسطر عربي «-50 كغم» تنعرض «كغم 50-» والنقص ينقرا بغير معنى.
const LRI = '\u{2066}';
const PDI = '\u{2069}';

function isolate(number: string): string {
  return `${LRI}${number}${PDI}`;
}

/**
 * صيغة المعدود بالفصحى حسب آخر رقمين: 3–10 جمع («أيام»، «طبقات»)، 11–99 مفرد منصوب («يوماً»)،
 * والباقي (0–2 بعد المئات، والمئات نفسها) مفرد («100 يوم»). 103 أيام و111 يوماً حسب الباقي.
 */
export type CountForm = 'few' | 'many' | 'hundreds';

export function countForm(n: number | bigint): CountForm {
  const rest = typeof n === 'bigint' ? Number((n < 0n ? -n : n) % 100n) : Math.abs(n) % 100;
  if (rest >= 3 && rest <= 10) return 'few';
  if (rest >= 11) return 'many';
  return 'hundreds';
}

/**
 * صيغ المعدود بعد رقم بالفصحى. بلاها الاسم ثابت بكل رقم (اختصار مثل «كغم»).
 * الواحد والاثنان ما ينكتب قبلهم رقم: الاسم يحمل العدد («لتر واحد»، «لتران»)، مرفوعاً لأن الكمية تنعرض لحالها.
 */
export interface CountedForms {
  /** «كيس واحد»، «طبقة واحدة». */
  one?: string;
  /** «كيسان»، «طبقتان». */
  two?: string;
  /** 3–10: «أكياس»، «طبقات»، «بيضات». */
  few?: string;
  /** 11–99: «كيساً»، «طبقة»، «بيضة». */
  many?: string;
}

export interface PackUnit extends CountedForms {
  /** اسم وحدة التعبئة من بيانات المادّة: «كيس»، «طبقة». */
  label: string;
  /** معاملها بوحدة الأساس بالآلاف: كيس 50 كغم = 50,000. */
  factor: Milli;
}

export interface QtyOptions {
  /** اسم القطعة للمعدود: «بيضة»، «فرخ»، «قنينة». */
  pieceLabel?: string;
  /** صيغ اسم القطعة بعد رقم. */
  pieceForms?: CountedForms;
  /** وحدة التعبئة الافتراضية للمادّة. */
  pack?: PackUnit;
}

/** الاسم بعد عدد صحيح بصيغته، والكسر («3.25 لتر») يبقى مفرداً. */
function counted(label: string, forms: CountedForms | undefined, whole: bigint | null): string {
  if (whole === null || !forms) return label;
  const form = countForm(whole);
  if (form === 'few') return forms.few ?? label;
  if (form === 'many') return forms.many ?? label;
  return label;
}

/**
 * الرقم ويّا اسمه: «5 طبقات»، «طبقة واحدة»، «طبقتان». الواحد والاثنان الموجبان بس يصيرون كلمة؛
 * السالب يبقى رقماً معزولاً حتى إشارة النقص تنقرا.
 */
function phrase(numText: string, label: string, forms: CountedForms | undefined, whole: bigint | null): string {
  if (forms?.one && whole === 1n) return forms.one;
  if (forms?.two && whole === 2n) return forms.two;
  return `${numText} ${counted(label, forms, whole)}`;
}

/** عدد الوحدات الصحيح من كمية بالآلاف، أو null إذا بيها كسر. */
function wholeUnits(qty: Milli): bigint | null {
  return qty % MILLI_PER_UNIT === 0n ? qty / MILLI_PER_UNIT : null;
}

/** كمية بوحدة مسمّاة («47 كيس»، «طبقتان») لنصّ التحويل بحقل الكمية: نفس صيغ fmtQty. */
export function fmtCounted(qty: Milli, label: string, forms?: CountedForms): string {
  const text = fmtMilli(qty);
  return phrase(qty < 0n ? isolate(text) : text, label, forms, wholeUnits(qty));
}

export interface QtyDisplay {
  main: string;
  sub?: string;
}

interface Noun {
  label: string;
  forms?: CountedForms;
}

/** اسم وحدة الأساس وصيغه: «كغم» اختصار ثابت، و«لتر» و«قطعة» (أو اسم القطعة من المادّة) بصيغ العدد. */
function baseNoun(unit: BaseUnit, options: QtyOptions): Noun {
  if (unit === 'kg') return { label: t('unit.kg', 'كغم') };
  if (unit === 'L') {
    return {
      label: t('unit.L', 'لتر'),
      forms: { one: t('unit.L.one', 'لتر واحد'), two: t('unit.L.two', 'لتران'), few: t('unit.L.few', 'لترات'), many: t('unit.L.many', 'لتراً') },
    };
  }
  if (options.pieceLabel !== undefined) return { label: options.pieceLabel, forms: options.pieceForms };
  return {
    label: t('unit.pc', 'قطعة'),
    forms: { one: t('unit.pc.one', 'قطعة واحدة'), two: t('unit.pc.two', 'قطعتان'), few: t('unit.pc.few', 'قطع'), many: t('unit.pc.many', 'قطعة') },
  };
}

/**
 * العرض الموحّد للكمية:
 * كغم تحت الطن «750 كغم»؛ من الطن «6.120 طن» وتحتها «6,120 كغم»؛ ومع وحدة التعبئة «47 كيس + 20 كغم».
 * اللتر يبقى لتراً، والبيض «46 طبقة + 12 بيضة». أقل من وحدة تعبئة بالباقي بس: «20 كغم» مو «0 كيس + 20 كغم».
 * كل اسم بعد رقمه بصيغة العدد بالفصحى إذا انطت صيغه: «5 طبقات + 5 بيضات»، «طبقة واحدة + بيضتان»،
 * «250 لتراً»، و«كغم» ثابت.
 * السالب كل رقم بيه معزول LTR، والمركّب يطرح الباقي: «-47 كيس - 20 كغم» = −2,370 كغم
 * (إشارة على الأكياس بس كانت تنقرا −2,330).
 */
export function fmtQty(qty: Milli, unit: BaseUnit, options: QtyOptions = {}): QtyDisplay {
  const negative = qty < 0n;
  const num = (text: string): string => (negative ? isolate(text) : text);
  const base = baseNoun(unit, options);
  const plain = phrase(num(fmtMilli(qty)), base.label, base.forms, wholeUnits(qty));

  if (options.pack) {
    const { pack } = options;
    const { packs, rest } = splitPacks(qty, pack.factor);
    if (packs === 0n) return { main: plain };
    const head = phrase(num(groupSigned(packs)), pack.label, pack, packs);
    if (rest === 0n) return { main: head, sub: plain };
    const tail = negative
      ? `- ${num(fmtMilli(-rest))} ${counted(base.label, base.forms, wholeUnits(rest))}`
      : `+ ${phrase(fmtMilli(rest), base.label, base.forms, wholeUnits(rest))}`;
    return { main: `${head} ${tail}`, sub: plain };
  }
  if (unit === 'kg' && (qty >= TON || qty <= -TON)) return { main: `${num(fmtTons(qty))} ${t('unit.t', 'طن')}`, sub: plain };
  return { main: plain };
}
