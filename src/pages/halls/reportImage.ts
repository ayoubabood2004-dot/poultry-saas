import { toBlob, toJpeg } from 'html-to-image';
import type { Day } from '../../domain/dates';
import { imagePdf, jpegSize, pageCapacity, paginate } from '../../lib/pdf';

// «أرسل صورة» في تقرير القاعات اليومي (عقد 0031، كلمة المالك 2026-11-17: «اكدر ارسلهه»): التقرير المعروض صورة PNG بضغطة، ثمّ نافذة المشاركة في
// الجهاز إن قبلت الملفّات، وإلّا تنزيله. html-to-image مستوردة هنا داخل حزمة القاعات (خارج التثبيت المسبق بالاسم)، لا استيراداً كسولاً: ذاك يفصلها
// حزمةً جديدة يحفظها التثبيت المسبق.
// الصورة نسخةٌ من الصفحة خارج الشاشة بعرض ثابت وبتخطيط الطباعة نفسه (الجداول لا البطاقات، وبلا ما يُخفى عند الطباعة)، بقواعد [data-capture] في
// أسلوب الصفحة: فلا تتحرّك الصفحة المعروضة، والصورة واحدة من الهاتف والحاسوب، وما يُطبع هو ما يُرسل. وتقارير القاعات فاتحةٌ دائماً كورقة الطباعة (light،
// مراجعة 0036 R7)، ولو كانت الصفحة بالسمة الداكنة.

/**
 * عرض الصورة بنقاط CSS: أعرض جداول التقرير (أيّام شهر البيّاض بثلاثة عشر عموداً) تتّسع له بخطّ 11 نقطة دون أن تُقصّ، وبالمقياس 2 تخرج 1,440 نقطة صورة
 * تُقرأ على الهاتف بتكبيرها كورقة مصوَّرة. وأضيق منه يقصّ أعمدة الجداول.
 */
export const IMAGE_WIDTH = 720;
/** المقياس المطلوب، وحدّ نقاط اللوحة (16.7 مليون في سفاري الآيفون): تقرير طويل جدّاً يُصغَّر مقياسه بدل صورة فارغة. */
const PIXEL_RATIO = 2;
const MAX_PIXELS = 16_000_000;

/** اسم ملفّ الصورة باليوم (لاتينيّ: يُحفظ بلا مشكلة في كلّ جهاز). */
export const imageName = (on: Day): string => `halls-report-${on}.png`;

/** لون سطح الصفحة (رمز --surface) بالسمة الحاليّة، وإلّا قيمتاه في tokens.css. */
export function surfaceColor(): string {
  const style = window.getComputedStyle(document.documentElement) as Partial<CSSStyleDeclaration>;
  const token = typeof style.getPropertyValue === 'function' ? style.getPropertyValue('--surface').trim() : '';
  const parts = token.split(/\s+/u).filter(Boolean);
  if (parts.length === 3) return `rgb(${parts.join(', ')})`;
  return (document.documentElement.getAttribute('class') ?? '').split(/\s+/u).includes('dark') ? 'rgb(8, 13, 23)' : 'rgb(243, 248, 253)';
}

/**
 * رموز السمة الفاتحة كما في :root من tokens.css (فحص sales-review يقارنها بالملفّ): ورقة تُرسل لغير صاحب الجهاز فاتحةٌ دائماً. الأسماء بشرطتيها: اسم
 * رمز وحده («الظلّ» مثلاً) يقرؤه Tailwind صنفاً فيولّد له CSS في حزمة الإقلاع.
 */
const LIGHT_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--surface', '243 248 253'],
  ['--surface-1', '255 255 255'],
  ['--surface-2', '238 245 252'],
  ['--surface-3', '226 238 250'],
  ['--ink', '15 30 53'],
  ['--ink-muted', '86 102 126'],
  ['--ink-subtle', '138 152 172'],
  ['--line', '224 233 244'],
  ['--line-strong', '202 216 232'],
  ['--ring', '18 102 216'],
  ['--shadow', '18 64 128'],
];
/** سطح السمة الفاتحة لونَ خلفية الصورة. */
const LIGHT_SURFACE = 'rgb(243, 248, 253)';

/** صنفٌ بمتغيّر Tailwind الداكن (بادئة dark قبل اسمه، وحدها أو بعد غيرها كـhover): يتبع .dark على <html> ولو كانت النسخة فاتحة. */
const darkVariant = (token: string): boolean => token.split(':').slice(0, -1).includes('dark');

/**
 * النسخة الفاتحة بلا أصناف المتغيّر الداكن، فيها وفي كلّ ما تحتها (مراجعة 0036 R7: اسم القاعة ويوم التقرير كانا نصّاً فاتحاً brand-200 على ورقة فاتحة).
 * النسخة وحدها تتغيّر، لا الصفحة المعروضة؛ وبالأبناء لا بمحدِّد: صنفٌ فيه «dark» بين أقواس محدِّد يقرؤه Tailwind صنفاً.
 */
function dropDarkVariants(node: Element): void {
  const tokens = (node.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean);
  const kept = tokens.filter((token) => !darkVariant(token));
  if (kept.length !== tokens.length) node.setAttribute('class', kept.join(' '));
  for (const child of Array.from(node.children)) dropDarkVariants(child);
}

/** صورة شفّافة بنقطة واحدة مكان صورة تعذّر جلبها: html-to-image يرفض الرسم كلّه بصورة فاشلة (بلا اتصال مثلاً). */
const IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface ImageOptions {
  /**
   * فاتحة ولو كانت الصفحة داكنة (ورقة فاتورة البيع تُرسل للزبون، مراجعة 0033 D2؛ وتقارير القاعات كورقة الطباعة، مراجعة 0036 R7): رموز السمة الفاتحة ولون
   * النصّ وcolor-scheme مضمَّنة على الحاوية فتغلب .dark و.clarity على <html>، وأصناف المتغيّر الداكن تُشال من النسخة (dropDarkVariants)، والخلفية سطح
   * السمة الفاتحة. ورموز --ofc- للتقارير الرسمية فاتحةٌ على كلّ نسخة في official.css.
   */
  light?: boolean;
  /** خلفية الصورة مع light (ورقة الفاتورة بيضاء كالورق، تصميم المبيعات ٦)؛ وإلّا سطح السمة الفاتحة. */
  background?: string;
}

/**
 * نسخة الصفحة page خارج الشاشة بـdata-capture وعرض width، فاتحةً إن طُلب (ImageOptions)، تُعطى لـdraw ثمّ تُزال ولو رمى. المقياس ratio: 2 إلّا لتقرير
 * طويل جدّاً (حدّ نقاط اللوحة).
 */
async function withCopy<T>(page: HTMLElement, width: number, options: ImageOptions, draw: (copy: HTMLElement, ratio: number) => Promise<T>): Promise<T> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '-10000px';
  host.style.pointerEvents = 'none';
  if (options.light) {
    for (const [token, value] of LIGHT_TOKENS) host.style.setProperty(token, value);
    host.style.setProperty('color-scheme', 'light');
    // اللون الموروث من <body> محسوب بالسمة الداكنة: يُعاد حسابه من الرموز الفاتحة.
    host.style.setProperty('color', 'rgb(var(--ink))');
  }
  const copy = page.cloneNode(true) as HTMLElement;
  if (options.light) dropDarkVariants(copy);
  copy.setAttribute('data-capture', '');
  copy.style.width = `${width}px`;
  host.appendChild(copy);
  document.body.appendChild(host);
  try {
    const height = copy.clientHeight || copy.scrollHeight || 0;
    const ratio = height > 0 ? Math.min(PIXEL_RATIO, Math.sqrt(MAX_PIXELS / (width * height))) : PIXEL_RATIO;
    return await draw(copy, ratio);
  } finally {
    host.parentNode?.removeChild(host);
  }
}

/** خيارات html-to-image للنسخة: العرض والمقياس والخلفية والخطّ، وصورة شفّافة مكان صورة فاشلة في الفاتحة. */
const captureOptions = (width: number, ratio: number, options: ImageOptions) =>
  options.light
    ? { width, pixelRatio: ratio, backgroundColor: options.background ?? LIGHT_SURFACE, preferredFontFormat: 'woff2', style: { margin: '0' }, imagePlaceholder: IMAGE_PLACEHOLDER }
    : { width, pixelRatio: ratio, backgroundColor: surfaceColor(), preferredFontFormat: 'woff2', style: { margin: '0' } };

/**
 * صورة الصفحة page (جذر التقرير): نسخة منها خارج الشاشة بـdata-capture وعرض width (IMAGE_WIDTH للتقرير؛ وورقة فاتورة البيع أضيق، عقد 0033)، تُرسم ثمّ
 * تُزال. يرمي إن تعذّر الرسم (لا صورة فارغة صامتة).
 */
export async function reportImage(page: HTMLElement, name: string, width: number = IMAGE_WIDTH, options: ImageOptions = {}): Promise<File> {
  return withCopy(page, width, options, async (copy, ratio) => {
    const blob = await toBlob(copy, captureOptions(width, ratio, options));
    if (!blob) throw new Error('report_image_empty');
    return new File([blob], name, { type: 'image/png' });
  });
}

/**
 * حدود الصفحات المسموحة في ملفّ PDF: أسفل كلّ صفّ بيانات وكلّ صفّ مجموع، وأسفل رأس التقرير وكلّ قسم وتذييله (لا أسفل صفّ أسماء الأعمدة ولا شريط
 * العنوان: لا ينفصلان عن جدولهما).
 */
const PDF_BREAKS = 'tbody > tr, tfoot > tr, header, section, footer';

/** بايتات صورة من عنوان data: بترميز base64. */
function dataUrlBytes(url: string): Uint8Array {
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * ملفّ PDF بحجم A4 من الصفحة page (رسالة الزبون 2026-11-26: الرصيد اليومي يُرسل PDF لا رسالة): النسخة نفسها التي تُصوَّر، صورةً JPEG (ورقة بيضاء إن لم
 * تُعطَ خلفية)، ثمّ تُقسم صفحاتٍ عند حدود الصفوف والأقسام (paginate) وتُلفّ بـimagePdf. يرمي إن تعذّر الرسم.
 */
export async function reportPdf(page: HTMLElement, name: string, title: string, width: number = IMAGE_WIDTH, options: ImageOptions = {}): Promise<File> {
  return withCopy(page, width, options, async (copy, ratio) => {
    const top = copy.getBoundingClientRect().top;
    const breaks = Array.from(copy.querySelectorAll(PDF_BREAKS)).map((node) => node.getBoundingClientRect().bottom - top);
    const url = await toJpeg(copy, { ...captureOptions(width, ratio, { ...options, background: options.background ?? 'rgb(255, 255, 255)' }), quality: 0.92 });
    const bytes = dataUrlBytes(url);
    const size = jpegSize(bytes);
    if (!size) throw new Error('report_pdf_image');
    // الارتفاع بنقاط CSS من الصورة نفسها (ما رُسم فعلاً)، لا من قياس النسخة قبل الرسم.
    const height = (width * size.height) / size.width;
    const pdf = imagePdf({ bytes, pixelWidth: size.width, pixelHeight: size.height }, { cssWidth: width, cssHeight: height, pages: paginate(breaks, height, pageCapacity(width)), title });
    return new File([pdf], name, { type: 'application/pdf' });
  });
}

/** تنزيل الملفّ برابط مؤقّت (حين لا تقبل نافذة المشاركة الملفّات، أو باختيار «نزّلها»). */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  // سفاري يقرأ الرابط بعد النقر لا عنده: يُلغى بعد دقيقة.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * shared: أُرسلت بنافذة المشاركة؛ cancelled: أغلقها المستخدم (ليس فشلاً)؛ blocked: رفض المتصفّح فتحها لأنّ الضغطة «قديمة» (تجهيز الصورة أطال ما
 * بين الضغطة والمشاركة)، فتُعرض الصورة جاهزةً بضغطة جديدة؛ downloaded: لا مشاركة بالملفّات هنا (أو فشلت لغير ذلك)، فنُزّلت.
 */
export type SendOutcome = 'shared' | 'cancelled' | 'blocked' | 'downloaded';

type Sharing = Navigator & { canShare?: (data?: ShareData) => boolean };

/** نافذة المشاركة تقبل هذا الملفّ (canShare بالملفّات؛ ورميه كعدمه). */
function sharesFiles(nav: Sharing, file: File): boolean {
  try {
    return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function sendFile(file: File, title: string): Promise<SendOutcome> {
  const nav: Sharing = navigator;
  if (sharesFiles(nav, file)) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      const name = (error as { name?: unknown } | null)?.name;
      if (name === 'AbortError') return 'cancelled';
      // InvalidStateError: المتصفّح لا يفتح المشاركة الآن (الصفحة تمنع لمستين بنفسها، مراجعة المبيعات A8 ثمّ Q10): كالرفض، الصورة جاهزة بضغطة جديدة.
      if (name === 'NotAllowedError' || name === 'InvalidStateError') return 'blocked';
    }
  }
  downloadFile(file);
  return 'downloaded';
}
