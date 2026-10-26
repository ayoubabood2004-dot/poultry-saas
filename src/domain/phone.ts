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

/**
 * مفتاح توائم الجهات بالهاتف (خطّة المرحلة 1 E34): الموبايل العراقي بشكله الموحّد، وغيره (أرضي، أجنبي) أرقامه الغربية
 * بس بلا أي فاصل، وبلا رقم ← null. مرآته private.phone_key (0004) من نفس الدالّتين، والحزمة تقارنهم على كل حروف BMP.
 */
export function phoneKey(input: string): string | null {
  const mobile = normalizePhone(input);
  if (mobile) return mobile;
  const digits = toWesternDigits(input).replace(/[^0-9]/g, '');
  return digits === '' ? null : digits;
}

// الدخول بلا SMS: الحساب بريد «الرقم@phone.login» (DECISIONS 2026-10-25). الخادم يعدّ الرقم من الشكل الموحّد بس
// (private.account_phone بالهجرة 0002)، فشاشة التسجيل والدخول تبني البريد من هنا وحده، وحزمة بوستغريس تطابقهم.
export const PHONE_LOGIN_DOMAIN = 'phone.login';

/** «0770 123 4567» ← «9647701234567@phone.login»، والرقم الغلط ← null (ما ينبني بريد منه). */
export function loginEmail(input: string): string | null {
  const phone = normalizePhone(input);
  return phone ? `${phone}@${PHONE_LOGIN_DOMAIN}` : null;
}
