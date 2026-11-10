// الحركة «السينمائية» في تقويم العليقة (كلمة المالك 2026-11-10: «بحركة سينمائية يكبر المربع»): FLIP. العرض الراحل يسجّل أماكن عناصره قبل أن
// يزول (Leaving)، والعرض الجديد يُرسم في مكانه النهائي ثمّ يُقلب عنصره ليبدأ من مكان الراحل وحجمه (بلاطة الشهر، أو خليّة اليوم، أو بطاقة الشهر
// في الرجوع) ويعود إلى مكانه في 450 ملّي ثانية بتباطؤ في آخرها، وما حوله يظهر تدريجياً. بـWeb Animations لا بصنف CSS ولا ملف (CSS الإقلاع بسقف
// مقيس)، وبالخاصّيتين المنفردتين translate وscale: اسم الخاصّية المركّبة في المصدر يولّد له Tailwind صنفاً في CSS الإقلاع. ولمن طلب تقليل
// الحركة (prefers-reduced-motion) لا حركة أبداً: الصفحات في التطبيق تنفتح فوراً، وهذه الحركة استثناء بكلمة المالك. وحيث لا Web Animations
// (متصفّح قديم) لا حركة ولا خطأ.

/** مستطيل العنصر على الشاشة لحظة قياسه. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** ما سجّله العرض الراحل لحظة فكّه: نوعه ومفتاحه (السنة أو الشهر أو اليوم)، وبطاقته، وخلاياه (بلاطات الأشهر أو خلايا الأيام) بمفاتيحها. */
export interface Leaving {
  kind: 'year' | 'month' | 'day';
  key: string;
  card: Box | null;
  cells: ReadonlyMap<string, Box>;
}

/** مرجع الصفحة الذي يتبادل فيه العرضان ما سبق: يكتبه الراحل عند فكّه، ويقرؤه الجديد عند تركيبه ثمّ يمحوه. */
export interface Motion {
  current: Leaving | null;
}

export const ZOOM_MS = 450;
export const FADE_MS = 300;
/** منحنى الحركة: سريع في أوّلها ويتباطأ كثيراً في آخرها. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** طلب المستخدم تقليل الحركة من إعداد جهازه. */
export function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function boxOf(node: Element | null | undefined): Box | null {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** أماكن عناصر بمفاتيحها (ما لا يُقاس يُتخطّى). */
export function boxesOf(nodes: ReadonlyMap<string, Element>): Map<string, Box> {
  const boxes = new Map<string, Box>();
  for (const [key, node] of nodes) {
    const box = boxOf(node);
    if (box) boxes.set(key, box);
  }
  return boxes;
}

const animatable = (node: HTMLElement | null | undefined): node is HTMLElement => Boolean(node) && typeof node?.animate === 'function';

/**
 * FLIP: العنصر في مكانه النهائي يُقاس، ويبدأ من from (مكان الراحل وحجمه) ويعود إلى مكانه. lift: فوق جيرانه أثناء الحركة (بلاطة أو خليّة تكبر
 * فوق أخواتها في الرجوع). يرجّع true إن بدأت الحركة.
 */
export function zoomFrom(node: HTMLElement | null, from: Box, { lift = false }: { lift?: boolean } = {}): boolean {
  if (!animatable(node) || reducedMotion()) return false;
  const to = boxOf(node);
  if (!to || to.width <= 0 || to.height <= 0 || from.width <= 0 || from.height <= 0) return false;
  const first: Keyframe = {
    transformOrigin: 'top left',
    translate: `${from.left - to.left}px ${from.top - to.top}px`,
    scale: `${from.width / to.width} ${from.height / to.height}`,
    opacity: 0.6,
  };
  const last: Keyframe = { transformOrigin: 'top left', translate: '0px 0px', scale: '1 1', opacity: 1 };
  if (lift) {
    first.zIndex = '2';
    last.zIndex = '2';
  }
  node.animate([first, last], { duration: ZOOM_MS, easing: EASE_OUT });
  return true;
}

/** ما حول العنصر المتحرّك يظهر تدريجياً بعد بدء حركته بقليل (يبقى مخفياً أثناء التأخير). */
export function fadeIn(nodes: readonly (HTMLElement | null | undefined)[]): void {
  if (reducedMotion()) return;
  for (const node of nodes) {
    if (animatable(node)) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay: 120, easing: EASE_OUT, fill: 'backwards' });
  }
}

/** أعلى الصفحة عند تبدّل العرض: العرض الجديد يبدأ من أوّله (البلاطة قد تكون في آخر الشبكة بالهاتف). */
export function scrollToTop(): void {
  if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}
