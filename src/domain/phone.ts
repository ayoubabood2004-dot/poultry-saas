import { toWesternDigits } from './normalize';

// رقم الهاتف اسم الدخول (قرار المالك 2026-10-25: «رقم الهاتف + كلمة سرّ»)، وبيه يضيف المالك الموظف.
// كل أشكال الرقم العراقي تنتهي بشكل واحد بلا «+» مثل عمود auth.users.phone بـSupabase: 9647XXXXXXXXX.
// مرآتها SQL private.normalize_phone بـsupabase/migrations/0001_core.sql، وحزمة بوستغريس تقارنهم حالةً حالة.

const SEPARATORS = /[\s\-().]/g;

/** «0770 123 4567» و«+964 770…» و«00964770…» و«٠٧٧٠…» ← «9647701234567»، وغير الموبايل العراقي ← null. */
export function normalizePhone(input: string): string | null {
  let digits = toWesternDigits(input).trim().replace(SEPARATORS, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('964')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  // الموبايل العراقي: 7 وبعده تسع مراتب (زين 078/079، آسياسيل 077، كورك 075).
  return /^7\d{9}$/.test(digits) ? `964${digits}` : null;
}
