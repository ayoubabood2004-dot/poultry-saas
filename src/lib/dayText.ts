import { toWesternDigits } from '../domain/normalize';

// اليوم المكتوب نصّاً بالشكل اللي يعرضه fmtDay، مو <input type="date"> (الجهاز يرسم قيمته ومنتقيه بلغته وأرقامه، شرقية بجهاز
// عربي وشهر/يوم بجهاز أمريكي، برّا format.ts وdigits.ts؛ numbers-guard يرفضه). ملف كسول لحاله: شاشات المكتب (إعدادات المنشأة
// والحسابات) تستورده، فما يكبّر وحدة التواريخ بحزمة الإقلاع (السقف المقيس، DECISIONS «السقوف»).

// يوم/شهر/سنة بفاصل («/» أو «-» أو «.» أو فراغ)، أو ثمانية أرقام متّصلة (30092026): لوحة الأرقام بالهاتف (inputMode
// numeric) ما بيها «/» بكل الأجهزة.
const DAY_TEXT = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$|^(\d{2})(\d{2})(\d{4})$/;

/**
 * يوم بالشكل اللي يعرضه fmtDay (يوم/شهر/سنة بأرقام غربية، DECISIONS «التاريخ بالعرض») ← YYYY-MM-DD، أو null. الشرقي ينقلب
 * (digits.ts يقلبه لحظة الكتابة، وهنا مرّة ثانية قبل القراءة)، واليوم اللي ما موجود (31/02) يرفض.
 */
export function parseDayText(text: string): string | null {
  const match = DAY_TEXT.exec(toWesternDigits(text).trim());
  if (!match) return null;
  const [day = '', month = '', year = ''] = match[1] ? [match[1], match[2], match[3]] : [match[4], match[5], match[6]];
  // اليوم موجود بالتقويم: نفس فحص isDay بـdates.ts (الرجوع من Date.UTC)، هنا بحزمة الشاشة حتى وحدة التواريخ المحفوظة بالتثبيت
  // المسبق ما تكبر (السقف المقيس، DECISIONS «السقوف»). أجزاء نصّ تقويم، مو فلوس.
  const [y, m, d] = [year, month, day].map(Number);
  const at = new Date(Date.UTC(y ?? 0, (m ?? 0) - 1, d ?? 0));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== (m ?? 0) - 1 || at.getUTCDate() !== d) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
