// install-test: الشرح يطابق الجهاز (سفاري الماك «إضافة إلى Dock»، فايرفوكس الحاسبة والمتصفّح داخل
// التطبيقات «افتحه بكروم أو سفاري»)، ضغطة التثبيت ما تموت إذا prompt() رمى، التبويب اللي قبل التثبيت
// ينحفظ بعلمه ويعيد يسأل persist()، وكل تخزين مو «محفوظ» يدفع للتثبيت بلا ما يطلب من المنزّل ينزّل.
// المكوّنات تنرسم بـreact-dom/server بنفس حزمة المصدر الحقيقي (React واحد للخطّافات).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const realSetTimeout = setTimeout;
let bundles = 0;

/** يحزم سطور مدخل من المصدر الحقيقي؛ كل نداء نسخة جديدة بحالتها الأولى (رابط data: مختلف). */
async function loadEntry(lines) {
  bundles += 1;
  const result = await build({
    stdin: { contents: `${lines.join('\n')}\nexport const bundleId = ${bundles};`, resolveDir: ROOT, loader: 'tsx', sourcefile: `install-entry-${bundles}.tsx` },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const RENDER = ["export { renderToStaticMarkup } from 'react-dom/server.browser';", "export { createElement } from 'react';"];

/** يبدّل متغيّرات المتصفّح العامة طول الفحص ويرجّعها بعده، حتى باقي الفحوص ما تتأثّر. */
async function withGlobals(values, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true, enumerable: true });
  }
  try {
    return await fn();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const settle = () => new Promise((resolve) => realSetTimeout(resolve, 20));

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

function makeStorage({ persisted = false, persist = false, throws = false } = {}) {
  const calls = { persisted: 0, persist: 0 };
  return {
    calls,
    async persisted() {
      calls.persisted += 1;
      if (throws) throw new DOMException('no storage here', 'InvalidStateError');
      return typeof persisted === 'function' ? persisted() : persisted;
    },
    async persist() {
      calls.persist += 1;
      return typeof persist === 'function' ? persist() : persist;
    },
  };
}

function makeWindow() {
  const win = new EventTarget();
  const standaloneQuery = new EventTarget();
  standaloneQuery.matches = false;
  win.matchMedia = () => standaloneQuery;
  return { win, standaloneQuery };
}

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macEdge: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 352.0.0.21.86 (iPhone15,2; iOS 17_6; en_US; en; scale=3.00; 1179x2556)',
  iphoneFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/485.0.0.37.106;FBBV/652214321]',
  iphoneLine: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.15.0',
  androidFacebook:
    'Mozilla/5.0 (Linux; Android 14; SM-A155F Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.43.109;]',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36',
};

async function platforms(t) {
  const { detectPlatform } = await loadEntry(["export { detectPlatform } from './src/lib/pwa/install.ts';"]);
  const cases = [
    ['آيفون سفاري', UA.iphoneSafari, 5, 'ios-safari'],
    ['آيفون كروم', UA.iphoneChrome, 5, 'ios-chrome'],
    ['آيفون فايرفوكس', UA.iphoneFirefox, 5, 'ios-other'],
    ['آيباد يعلن نفسه ماك (لمس)', UA.macSafari, 5, 'ios-safari'],
    ['سفاري الماك', UA.macSafari, 0, 'desktop-safari'],
    ['كروم الماك مو سفاري', UA.macChrome, 0, 'desktop'],
    ['إيدج الماك مو سفاري', UA.macEdge, 0, 'desktop'],
    ['فايرفوكس الماك', UA.macFirefox, 0, 'desktop-firefox'],
    ['فايرفوكس ويندوز', UA.winFirefox, 0, 'desktop-firefox'],
    ['كروم ويندوز', UA.winChrome, 0, 'desktop'],
    ['أندرويد كروم', UA.androidChrome, 5, 'android'],
    ['أندرويد فايرفوكس يبقى أندرويد (تلميح كروم)', UA.androidFirefox, 5, 'android'],
    ['إنستغرام بالآيفون', UA.iphoneInstagram, 5, 'in-app'],
    ['فيسبوك بالآيفون', UA.iphoneFacebook, 5, 'in-app'],
    ['لاين بالآيفون', UA.iphoneLine, 5, 'in-app'],
    ['فيسبوك بأندرويد', UA.androidFacebook, 5, 'in-app'],
    ['WebView أندرويد', UA.androidWebView, 5, 'in-app'],
  ];
  for (const [label, userAgent, touch, expected] of cases) t.eq(detectPlatform(userAgent, touch), expected, `المنصّة: ${label}`);
}

async function guideBodies(t) {
  const { InstallGuideBody, renderToStaticMarkup, createElement } = await loadEntry([
    "export { InstallGuideBody } from './src/components/shell/InstallGuide.tsx';",
    ...RENDER,
  ]);
  const body = (platform, pendingRounds = 0) => renderToStaticMarkup(createElement(InstallGuideBody, { platform, pendingRounds }));
  const mac = body('desktop-safari');
  t.ok(mac.includes('إضافة إلى Dock') && mac.includes('<ol'), 'سفاري الماك: خطوات «إضافة إلى Dock»');
  t.ok(!mac.includes('أيقونة التثبيت'), 'سفاري الماك: مو خطوات أيقونة التثبيت اللي ما عنده');
  for (const platform of ['desktop-firefox', 'in-app']) {
    const html = body(platform);
    t.ok(html.includes('كروم أو سفاري'), `${platform}: يكول افتحه بكروم أو سفاري`);
    t.ok(!html.includes('<ol'), `${platform}: بلا خطوات ما تنفع`);
  }
  t.ok(body('desktop').includes('أيقونة التثبيت'), 'كروم الحاسبة: خطوات التثبيت باقية');
  t.ok(body('in-app', 2).includes('ارفع جولاتك أولاً'), 'المتصفّح داخل التطبيق: تخزينه منفصل، فالجولات ترتفع أوّل');
}

async function persistStates(t) {
  const cases = [
    ['persisted() رمى ← خطأ مو «ما يدعم»', { storage: makeStorage({ throws: true }) }, 'error'],
    ['بلا navigator.storage (سفاري قبل 15.2)', {}, 'unsupported'],
    ['مرفوض', { storage: makeStorage({ persisted: false, persist: false }) }, 'not_persisted'],
    ['انطلب وانقبل', { storage: makeStorage({ persisted: false, persist: true }) }, 'persisted'],
  ];
  for (const [label, nav, expected] of cases) {
    await withGlobals({ navigator: nav }, async () => {
      const { ensurePersisted, persistStore } = await loadEntry(["export * from './src/lib/pwa/persist.ts';"]);
      t.eq(await ensurePersisted(), expected, `الحفظ الدائم: ${label}`);
      t.eq(persistStore.get(), expected, `الحفظ الدائم بالمخزن: ${label}`);
    });
  }
}

function installEvent({ prompt, userChoice }) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = prompt;
  Object.defineProperty(event, 'userChoice', { get: userChoice });
  return event;
}

async function promptAndInstalled(t) {
  let persistedNow = false;
  const storage = makeStorage({ persisted: () => persistedNow, persist: () => persistedNow });
  const { win, standaloneQuery } = makeWindow();
  await withGlobals({ window: win, navigator: { userAgent: UA.androidChrome, maxTouchPoints: 5, storage } }, async () => {
    const mod = await loadEntry(["export * from './src/lib/pwa/install.ts';", "export { persistStore } from './src/lib/pwa/persist.ts';"]);
    mod.initInstall();
    const tryPrompt = () => mod.promptInstall().catch((error) => `rejected:${error?.name}`);

    win.dispatchEvent(installEvent({ prompt: () => Promise.reject(new DOMException('stale', 'NotAllowedError')), userChoice: () => new Promise(() => {}) }));
    t.eq(mod.installStore.get().canPrompt, true, 'beforeinstallprompt ينحفظ');
    t.eq(await tryPrompt(), 'unavailable', 'prompt() رمى ← «ما متاح» فالبطاقة تفتح الشرح، مو ضغطة ميّتة');
    t.eq(mod.installStore.get().canPrompt, false, 'الحدث المستعمل ينشال');

    win.dispatchEvent(installEvent({ prompt: () => Promise.resolve(), userChoice: () => Promise.reject(new Error('gone')) }));
    t.eq(await tryPrompt(), 'unavailable', 'userChoice رمى ← «ما متاح»');

    win.dispatchEvent(installEvent({ prompt: () => Promise.resolve(), userChoice: () => Promise.resolve({ outcome: 'accepted' }) }));
    t.eq(await tryPrompt(), 'accepted', 'القبول يرجع accepted');

    // التثبيت انقبل من هذا التبويب: المتصفّح صار يحفظ التخزين.
    persistedNow = true;
    win.dispatchEvent(new Event('appinstalled'));
    await settle();
    const state = mod.installStore.get();
    t.eq(state.installed, true, 'appinstalled ينحفظ بالمخزن');
    t.eq(state.standalone, false, 'التبويب نفسه بعده مو مستقل');
    t.ok(storage.calls.persisted >= 1, 'appinstalled يعيد يسأل persisted()');
    t.eq(mod.persistStore.get(), 'persisted', 'والحالة تتحدّث بلا إعادة تحميل');

    const before = storage.calls.persisted;
    standaloneQuery.matches = true;
    standaloneQuery.dispatchEvent(new Event('change'));
    await settle();
    t.eq(mod.installStore.get().standalone, true, 'display-mode صار standalone');
    t.ok(storage.calls.persisted > before, 'وصار مستقل ← يعيد يسأل persisted()');
  });
}

async function installCard(t) {
  await withGlobals({ navigator: { userAgent: UA.winChrome, maxTouchPoints: 0 } }, async () => {
    const { InstallCard, installStore, persistStore, renderToStaticMarkup, createElement } = await loadEntry([
      "export { InstallCard } from './src/components/shell/InstallCard.tsx';",
      "export { installStore } from './src/lib/pwa/install.ts';",
      "export { persistStore } from './src/lib/pwa/persist.ts';",
      ...RENDER,
    ]);
    const html = () => renderToStaticMarkup(createElement(InstallCard));
    const KEEP = 'ثبّت التطبيق حتى لا تضيع جولاتك';
    for (const state of ['not_persisted', 'unsupported', 'error']) {
      persistStore.set(state);
      t.ok(html().includes(KEEP), `البطاقة: «${state}» تخوّف من ضياع الجولات`);
    }
    for (const state of ['persisted', 'unknown']) {
      persistStore.set(state);
      const markup = html();
      t.ok(!markup.includes(KEEP) && markup.includes('ثبّت التطبيق على الهاتف'), `البطاقة: «${state}» بالعنوان العادي`);
    }

    persistStore.set('not_persisted');
    installStore.set({ standalone: false, canPrompt: false, installed: true });
    const installed = html();
    t.ok(installed.includes('افتحه من أيقونته'), 'بعد التثبيت بنفس التبويب: افتحه من الأيقونة');
    t.ok(!installed.includes('data-action="install-app"'), 'وبلا زرّ «نزّل التطبيق»');
    t.ok(!installed.includes(KEEP), 'وبلا «نزّل حتى ما تضيع جولاتك»');

    installStore.set({ standalone: true, canPrompt: false, installed: false });
    t.eq(html(), '', 'مفتوح مثبّت: البطاقة تختفي');
  });
}

async function settingsPage(t) {
  const { win } = makeWindow();
  await withGlobals({ window: win, navigator: { userAgent: UA.androidFirefox, maxTouchPoints: 5 }, localStorage: memoryStorage() }, async () => {
    const { SettingsPage, MemoryRouter, installStore, persistStore, renderToStaticMarkup, createElement } = await loadEntry([
      "export { default as SettingsPage } from './src/pages/settings/SettingsPage.tsx';",
      "export { MemoryRouter } from 'react-router-dom';",
      "export { installStore } from './src/lib/pwa/install.ts';",
      "export { persistStore } from './src/lib/pwa/persist.ts';",
      ...RENDER,
    ]);
    // الصفحة بداخل الموجّه مثل التطبيق (المرحلة 1: رابط «إعدادات المنشأة»).
    const html = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SettingsPage)));
    const INSTALL_ADVICE = 'ثبّت التطبيق ليُحفظ';
    const ASK = 'اطلب الحفظ الدائم';

    installStore.set({ standalone: true, canPrompt: false, installed: false });
    persistStore.set('not_persisted');
    let markup = html();
    t.ok(markup.includes('غير مضمون: قد يمسحه المتصفّح'), 'الإعدادات المنزّلة: الرفض ينكال');
    t.ok(!markup.includes(INSTALL_ADVICE), 'الإعدادات المنزّلة: ما تطلب «نزّل التطبيق» من المنزّل');
    t.ok(markup.includes(ASK), 'الإعدادات المنزّلة: زرّ إعادة الطلب باقي');

    persistStore.set('error');
    markup = html();
    t.ok(markup.includes(ASK), 'الإعدادات: السؤال اللي رمى ينعاد طلبه');
    t.ok(!markup.includes('ما يدعم'), 'الإعدادات: الخطأ مو «المتصفّح ما يدعم»');

    installStore.set({ standalone: false, canPrompt: false, installed: false });
    persistStore.set('not_persisted');
    markup = html();
    t.ok(markup.includes(INSTALL_ADVICE), 'الإعدادات بالمتصفّح: تنصح بالتثبيت');
    t.ok(markup.includes('كيف أثبّت التطبيق؟'), 'الإعدادات بالمتصفّح: زرّ الشرح');

    installStore.set({ standalone: false, canPrompt: false, installed: true });
    markup = html();
    t.ok(!markup.includes(INSTALL_ADVICE) && !markup.includes('كيف أثبّت التطبيق؟'), 'الإعدادات بتبويب انقبل منه التثبيت: ما تطلب ينزّل');
    t.ok(markup.includes('افتحه من الأيقونة'), 'الإعدادات بتبويب انقبل منه التثبيت: افتحه من الأيقونة');

    const range = markup.match(/<input[^>]*id="ui-scale"[^>]*>/)?.[0] ?? '';
    t.ok(range.includes('type="range"'), 'شريط حجم الواجهة موجود');
    t.ok(!/\sdir=/.test(range), 'شريط الحجم يتبع اتجاه الصفحة: الأكبر يمّ «كبّر»');
    const orgLink = markup.match(/<a [^>]*data-action="open-org-settings"[^>]*>/)?.[0] ?? '';
    t.ok(orgLink.includes('href="/settings/org"'), `رابط «إعدادات المنشأة» من إعدادات الجهاز (${orgLink})`);
  });
}

export default async function (t) {
  await platforms(t);
  await guideBodies(t);
  await persistStates(t);
  await promptAndInstalled(t);
  await installCard(t);
  await settingsPage(t);
}
