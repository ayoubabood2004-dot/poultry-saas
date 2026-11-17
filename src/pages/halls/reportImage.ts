import { toBlob } from 'html-to-image';
import type { Day } from '../../domain/dates';

// «أرسل صورة» في تقرير القاعات اليومي (عقد 0031، كلمة المالك 2026-11-17: «اكدر ارسلهه»): التقرير المعروض صورة PNG بضغطة، ثمّ نافذة المشاركة في
// الجهاز إن قبلت الملفّات، وإلّا تنزيله. html-to-image مستوردة هنا داخل حزمة القاعات (خارج التثبيت المسبق بالاسم)، لا استيراداً كسولاً: ذاك يفصلها
// حزمةً جديدة يحفظها التثبيت المسبق.
// الصورة نسخةٌ من الصفحة خارج الشاشة بعرض ثابت وبتخطيط الطباعة نفسه (الجداول لا البطاقات، وبلا ما يُخفى عند الطباعة)، بقواعد [data-capture] في
// أسلوب الصفحة: فلا تتحرّك الصفحة المعروضة، والصورة واحدة من الهاتف والحاسوب، وما يُطبع هو ما يُرسل. وخلفيتها لون سطح الصفحة بالسمة الحاليّة.

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
 * صورة الصفحة page (جذر التقرير): نسخة منها خارج الشاشة بـdata-capture وعرض IMAGE_WIDTH، تُرسم ثمّ تُزال. يرمي إن تعذّر الرسم (لا صورة فارغة صامتة).
 */
export async function reportImage(page: HTMLElement, name: string): Promise<File> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '-10000px';
  host.style.pointerEvents = 'none';
  const copy = page.cloneNode(true) as HTMLElement;
  copy.setAttribute('data-capture', '');
  copy.style.width = `${IMAGE_WIDTH}px`;
  host.appendChild(copy);
  document.body.appendChild(host);
  try {
    const height = copy.clientHeight || copy.scrollHeight || 0;
    const ratio = height > 0 ? Math.min(PIXEL_RATIO, Math.sqrt(MAX_PIXELS / (IMAGE_WIDTH * height))) : PIXEL_RATIO;
    const blob = await toBlob(copy, { width: IMAGE_WIDTH, pixelRatio: ratio, backgroundColor: surfaceColor(), preferredFontFormat: 'woff2', style: { margin: '0' } });
    if (!blob) throw new Error('report_image_empty');
    return new File([blob], name, { type: 'image/png' });
  } finally {
    host.parentNode?.removeChild(host);
  }
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
      if (name === 'NotAllowedError') return 'blocked';
    }
  }
  downloadFile(file);
  return 'downloaded';
}
