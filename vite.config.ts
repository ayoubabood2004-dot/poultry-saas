import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const appVersion = `${pkg.version}+${Date.now().toString(36)}`;

// اسم التطبيق بالـmanifest ثابت قبل JS، فهو برّا t() باستثناء مسمّى (i18n-guard يمسح src/ بس ويطبع ذلك).
const APP_NAME = 'نظام الدواجن';
const APP_SHORT_NAME = 'الدواجن';
const SURFACE_LIGHT = '#f3f8fd';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    // pwa-guard وbundle-guard يقرون dist/.vite/manifest.json حتى يعرفون حزمة الإقلاع وتوابعها.
    manifest: true,
  },
  plugins: [
    react(),
    VitePWA({
      // التحديث بإذن الشاشة: ماكو إعادة تحميل تمسح نموذجاً. التسجيل بـworkbox-window مباشرةً
      // (src/lib/pwa/update.ts)، لأن مستمع virtual:pwa-register يعيد التحميل بكل نافذة بلا شرط.
      registerType: 'prompt',
      injectRegister: false,
      strategies: 'generateSW',
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      // الأيقونات برّا التثبيت المسبق: الافتراض js,wasm,css,html بس، والخط woff2 مضاف بالاسم.
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: 'إدارة مشاريع الدواجن: المعمل والحقول والمفقس والمخازن والحسابات',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: SURFACE_LIGHT,
        theme_color: SURFACE_LIGHT,
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // الجولة لازم تنفتح بلا نت: كل حزم JS وCSS (الكسولة ويّاها) والخط. المجموع بسقف مقيس (pwa-guard).
        globPatterns: ['**/*.{js,wasm,css,html,woff2}'],
        // المكتبات الثقيلة تنستثنى هنا بالاسم، وما يكون منها شي تحتاجه الجولة.
        globIgnores: [],
        // صريحاً: vite-plugin-pwa يفعّله بس ويّا autoUpdate، وبلاه الصفحة اللي ثبّتت الخدمة العاملة ما تنمسك.
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // نقاط الخادم ما تنبلع: الطلب لازم يطلع من الجهاز (بـdoctorVet ويبهوك انبلع مرّتين).
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
