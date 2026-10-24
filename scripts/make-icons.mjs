// يولّد أيقونات التطبيق من شعار SVG واحد (نفسه بشاشة الإقلاع وsrc/components/Logo.tsx):
// PNG 192 و512 (any)، و512 maskable بخلفية كاملة والشعار داخل دائرة قطرها ٨٠٪ من العرض،
// وapple-touch-icon 180 (الآيفون ياخذ أيقونة الشاشة منه ويدوّر زواياه بنفسه)، وfavicon.svg.
// بلا maskable أندرويد يحطّ الأيقونة مصغّرة بدائرة بيضاء. شغّله بـnpm run icons واحفظ الناتج بالمستودع.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// البيضة كلها داخل دائرة نصف قطرها 40 حول (50، 50): أبعد نقطة منها على بعد 32.
const EGG = 'M50 20C64 20 75 40 75 56C75 71 64 82 50 82C36 82 25 71 25 56C25 40 36 20 50 20Z';
const CRACK = 'M22 51L33 44L41 52L50 43L59 52L67 44L78 51';

function logo({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b7bee"/>
      <stop offset="1" stop-color="#0f5cc6"/>
    </linearGradient>
    <clipPath id="egg"><path d="${EGG}"/></clipPath>
  </defs>
  <rect width="100" height="100"${rounded ? ' rx="22"' : ''} fill="url(#bg)"/>
  <path d="${EGG}" fill="#ffffff"/>
  <path d="${CRACK}" fill="none" stroke="#1266d8" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#egg)"/>
</svg>
`;
}

function png(svg, size, file) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(path.join(PUBLIC, file), image);
  console.log(`✓ ${file} (${size}x${size}، ${image.length} بايت)`);
}

const rounded = logo({ rounded: true });
const fullBleed = logo({ rounded: false });

writeFileSync(path.join(PUBLIC, 'favicon.svg'), rounded);
console.log('✓ favicon.svg');
png(rounded, 192, 'pwa-192x192.png');
png(rounded, 512, 'pwa-512x512.png');
png(fullBleed, 512, 'maskable-512x512.png');
png(fullBleed, 180, 'apple-touch-icon-180x180.png');
