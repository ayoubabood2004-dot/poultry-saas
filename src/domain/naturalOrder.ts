// ترتيب الأسماء بأرقامها (شاشة الزبون 2026-11-15: «قاعة 44» ظهرت قبل «قاعة 5»، لأنّ القاعدة ترتّب الاسم حرفاً حرفاً بـcollate "C"):
// الاسم قطع من أرقام وغيرها، والقطعة الرقمية تُقارن بقيمتها (بطولها بلا أصفار البداية ثمّ حرفاً حرفاً، فلا حدّ لعدد الخانات)، وغيرها حرفاً حرفاً
// كما ترتّب القاعدة (نقطة الشفرة، لا لغة الجهاز). منطق صافٍ بلا Intl.

const DIGITS = /[0-9]+/gu;

/** قطع الاسم: نصّ ورقم بالتناوب، أوّلها نصّ (قد يكون فارغاً). */
function chunks(name: string): string[] {
  const parts: string[] = [];
  let at = 0;
  for (const match of name.matchAll(DIGITS)) {
    parts.push(name.slice(at, match.index), match[0]);
    at = match.index + match[0].length;
  }
  parts.push(name.slice(at));
  return parts;
}

const codeOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** مقارنة رقمين مكتوبين بلا حدّ لطولهما: الأقصر بلا أصفار البداية أصغر، وبالطول نفسه حرفاً حرفاً، ثمّ الأقلّ أصفاراً أوّلاً («5» قبل «05»). */
function numberOrder(a: string, b: string): number {
  const plainA = a.replace(/^0+/u, '');
  const plainB = b.replace(/^0+/u, '');
  if (plainA.length !== plainB.length) return plainA.length - plainB.length;
  return codeOrder(plainA, plainB) || a.length - b.length;
}

/** «قاعة 5» قبل «قاعة 44»، و«قاعة 2» قبل «قاعة 10»، والأسماء بلا أرقام كترتيب القاعدة. */
export function naturalCompare(a: string, b: string): number {
  const left = chunks(a);
  const right = chunks(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const order = i % 2 === 1 ? numberOrder(left[i] ?? '', right[i] ?? '') : codeOrder(left[i] ?? '', right[i] ?? '');
    if (order !== 0) return order;
  }
  return left.length - right.length;
}
