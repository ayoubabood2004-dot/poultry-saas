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
    rollupOptions: {
      output: {
        // الحزمة المشتركة لشاشتي البيانات الأساسية (المرحلة 1 WP2، بيها repo/inventory.ts) والحزم المشتركة لشاشات الحسابات (WP3:
        // repo/parties.ts وrepo/cash.ts وقطع pages/accounts ومكوّنات الكشف والمبلغ) باسم ثابت، حتى استثناؤها من التثبيت المسبق يبقى
        // بالاسم. الاسم بس يتغيّر؛ تقسيم الحزم كما يقرّره Rollup (manualChunks كان يسحب وحدات الإقلاع ويّاها).
        chunkFileNames: (chunk) => {
          const ids = chunk.moduleIds.map((id) => id.replace(/\\/g, '/'));
          if (chunk.isDynamicEntry) return 'assets/[name]-[hash].js';
          if (ids.some((id) => /\/src\/lib\/repo\/inventory\.ts$/.test(id))) return 'assets/stores-admin-[hash].js';
          if (ids.some((id) => /\/src\/(lib\/repo\/(parties|cash)\.ts|pages\/accounts\/[^/]+\.tsx|components\/ui\/(LedgerTable|MoneyInput|SideToggle|DayField)\.tsx)$/.test(id))) return 'assets/accounts-office-[hash].js';
          return 'assets/[name]-[hash].js';
        },
      },
    },
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
        // المكتبات الثقيلة تنستثنى هنا بالاسم، وما يكون منها شي تحتاجه الجولة. ونفس القائمة بـpwa-guard (NOT_PRECACHED).
        // المرحلة 1 WP2: شاشتا البيانات الأساسية (المواد، وإعدادات المنشأة) وحزمتهما: ما تشتغل بلا نت أصلاً (تقرا وتكتب
        // بالخادم بس)، وبالتثبيت المسبق كانت تعبر سقفه المقيس (817,500) بحدود 50 كيلوبايت. الاستثناء سؤال مفتوح للمالك (A4)،
        // مكتوب بـDECISIONS «السقوف المقيسة» 2026-10-27 (مو موافقة)؛ وpwa-guard يطلب سطره هناك، ويمنع حزمة محفوظة تستورد وحدة
        // منها، وحزمة مستثناة يحفظها sw.js (القائمتان افترقتا).
        // WP3: قسم الحسابات والصناديق بمسار واحد (AccountsRoutes، JS وملف الطباعة CSS) وحزمته المشتركة لو انقسمت
        // (accounts-office)، بنفس القاعدة (DECISIONS «السقوف المقيسة»). وWP4: المخزون بمسار واحد (StockRoutes).
        globIgnores: [
          '**/ItemsPage-*.js',
          '**/OrgSettingsPage-*.js',
          '**/stores-admin-*.js',
          '**/AccountsRoutes-*.{js,css}',
          '**/accounts-office-*.{js,css}',
          // WP4: المخزون بمسار واحد (اللوحات وبطاقة المادّة والافتتاح والتحويل، StockRoutes)، بنفس القاعدة.
          '**/StockRoutes-*.{js,css}',
        ],
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
