// تطبيع النصوص والأرقام. الطرفان (الواجهة والقاعدة) لازم يستعملون نفس الدالّة:
// بـdoctorVet طرف واحد استعمل toLowerCase() فطلعت ١٠٢ من ١٤٣ شركة توائم.
// مرآتها SQL تنكتب ويّا القاعدة، وفحص تطابق يقارنها بهاي الدالّة نفسها مو نسخة منها.
// الحروف هنا بصيغة \u{…} عمداً: علامات التشكيل حروف ما تنشاف، والحرف المكتوب صريحاً بالشفرة يضيع بالنسخ.

const EASTERN_DIGITS = /[\u{660}-\u{669}\u{6F0}-\u{6F9}]/gu;
const ARABIC_DECIMAL_SEPARATOR = /\u{66B}/gu;
const ARABIC_THOUSANDS_SEPARATOR = /\u{66C}/gu;

/** الأرقام الشرقية (٠-٩ و۰-۹) لغربية، و«٫» لنقطة، و«٬» لفاصلة. */
export function toWesternDigits(input: string): string {
  return input
    .replace(EASTERN_DIGITS, (ch) => {
      const code = ch.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(ARABIC_DECIMAL_SEPARATOR, '.')
    .replace(ARABIC_THOUSANDS_SEPARATOR, ',');
}

// التشكيل (U+064B–U+065F وU+0670) والتطويل (U+0640). مدى U+064B–U+0670 كاملاً يضمّ الأرقام الشرقية
// (U+0660–U+0669)، فالأرقام تترجم قبل مسح التشكيل، وإلا «٧٧٠٩٩» ينمسح ويطابق البحث كل شي.
const TASHKEEL = /[\u{64B}-\u{65F}\u{670}\u{640}]/gu;

/** نصّ البحث بالاسم: أرقام غربية، بلا تشكيل، همزات وة وى موحّدة، حروف لاتينية صغيرة. */
export function searchable(input: string): string {
  return toWesternDigits(input)
    .replace(TASHKEEL, '')
    .replace(/[\u{623}\u{625}\u{622}\u{671}]/gu, '\u{627}') // i18n-ok: حرف تطبيع، أ إ آ ٱ ← ا
    .replace(/\u{629}/gu, '\u{647}') // i18n-ok: حرف تطبيع، ة ← ه
    .replace(/\u{649}/gu, '\u{64A}') // i18n-ok: حرف تطبيع، ى ← ي
    .replace(/\u{624}/gu, '\u{648}') // i18n-ok: حرف تطبيع، ؤ ← و
    .replace(/\u{626}/gu, '\u{64A}') // i18n-ok: حرف تطبيع، ئ ← ي
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** الباركود والرموز: أرقام غربية، بلا فراغات، لاتيني كبير. */
export function normalizeCode(input: string): string {
  return toWesternDigits(input).replace(/\s+/g, '').toUpperCase();
}
