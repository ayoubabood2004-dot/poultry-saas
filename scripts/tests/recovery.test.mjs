// recovery-test: القشرة القديمة والتحديث. التعافي ما يمسح القشرة إلا بعد ما الخادم يجاوب بسكربت الخدمة
// العاملة (شبكة بلا نت، مهلة، بوابة واي فاي = «بلا نت» وما ينمسّ شي)، ويعيد فحص النظافة بعد الفحص، وما
// يلغي vite:preloadError، و«بلا نت» تنفكّ لما يرجع النت؛ والصفحة الفاشلة بيها زرّ إعادة. والتحديث: نافذة
// بدت بلا مسيطر تعيد التحميل لما نسخة جديدة تمسك، نسخة تنتظر تنطبّق بالرجوع للواجهة وبالفحص الدوري بعد ما
// النافذة الوسخة انسدّت، pagehide يعلن «نظيفة»، والتسجيل الفاشل ينعاد. والرأس يعرض «بلا نت» و«مو جاهز» سوا.
// المتصفّح مصنوع (navigator وwindow وcaches وfetch وBroadcastChannel)، والمصدر حقيقي محزوم بـesbuild.
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
    stdin: { contents: `${lines.join('\n')}\nexport const bundleId = ${bundles};`, resolveDir: ROOT, loader: 'tsx', sourcefile: `recovery-entry-${bundles}.tsx` },
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

const settle = () => new Promise((resolve) => realSetTimeout(resolve, 30));
/** مهل الشفرة (فحص الخادم ٥ ثواني، سؤال النوافذ ٤٠٠ مللي) تصير مللي وحدة. */
const fastTimeout = (fn, ms, ...args) => realSetTimeout(fn, Math.min(ms ?? 0, 1), ...args);

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// ── التعافي ──────────────────────────────────────────────────────────────

const RECOVERY_ENTRY = ["export * from './src/lib/pwa/recovery.ts';", "export { dirtyStore } from './src/lib/pwa/dirty.ts';"];
const SHELL = 'workbox-precache-v2-https://app.test/';

function recordingFetch(respond) {
  const fetch = async (url, init) => {
    fetch.calls.push({ url, init });
    return respond(init);
  };
  fetch.calls = [];
  return fetch;
}

const scriptResponse = () => new Response('self.addEventListener("install",()=>{})', { headers: { 'content-type': 'application/javascript; charset=utf-8' } });

function recoveryEnv({ onLine = true, fetch, sessionStorage = memoryStorage() }) {
  const win = new EventTarget();
  win.reloads = 0;
  win.location = { reload: () => (win.reloads += 1) };
  const deleted = [];
  const unregistered = [];
  const navigator = {
    onLine,
    serviceWorker: { getRegistrations: async () => [{ unregister: async () => unregistered.push(1) > 0 }] },
  };
  const caches = { keys: async () => [SHELL, 'images-v1'], delete: async (name) => deleted.push(name) > 0 };
  const globals = { window: win, navigator, caches, fetch, sessionStorage, localStorage: memoryStorage(), setTimeout: fastTimeout };
  return { win, navigator, deleted, unregistered, globals, sessionStorage };
}

async function recoveryCase(options, body) {
  const env = recoveryEnv(options);
  await withGlobals(env.globals, async () => body(await loadEntry(RECOVERY_ENTRY), env));
  return env;
}

function untouched(t, env, label) {
  t.eq(env.deleted.length, 0, `${label}: خبيئة القشرة ما انمسحت`);
  t.eq(env.unregistered.length, 0, `${label}: الخدمة العاملة ما انلغت`);
  t.eq(env.win.reloads, 0, `${label}: ماكو إعادة تحميل`);
}

async function recoveryProbe(t) {
  const failing = recordingFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  await recoveryCase({ fetch: failing }, async ({ recoverFromStaleShell, recoveryStore }, env) => {
    t.eq(recoverFromStaleShell(), 'checking', 'متّصل بلا نت: يفحص الخادم أوّل');
    await settle();
    t.eq(recoveryStore.get(), 'offline', 'متّصل بلا نت: الخادم ما جاوب ← «بلا نت»');
    untouched(t, env, 'متّصل بلا نت');
    t.eq(failing.calls[0]?.url, '/sw.js', 'الفحص على /sw.js');
    t.eq(failing.calls[0]?.init?.cache, 'no-store', 'الفحص بلا خبيئة');
    t.ok(failing.calls[0]?.init?.signal instanceof AbortSignal, 'الفحص بمهلة (AbortSignal)');
  });

  const hanging = recordingFetch((init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  await recoveryCase({ fetch: hanging }, async ({ recoverFromStaleShell, recoveryStore }, env) => {
    recoverFromStaleShell();
    await settle();
    t.eq(recoveryStore.get(), 'offline', 'إشارة وحدة: المهلة خلصت ← «بلا نت»');
    untouched(t, env, 'المهلة');
  });

  const portal = recordingFetch(() => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }));
  await recoveryCase({ fetch: portal }, async ({ recoverFromStaleShell, recoveryStore }, env) => {
    recoverFromStaleShell();
    await settle();
    t.eq(recoveryStore.get(), 'offline', 'بوابة واي فاي جاوبت HTML ← «بلا نت»');
    untouched(t, env, 'بوابة الواي فاي');
  });

  const reachable = recordingFetch(scriptResponse);
  const first = await recoveryCase({ fetch: reachable }, async ({ recoverFromStaleShell, recoveryStore }, env) => {
    recoverFromStaleShell();
    await settle();
    t.eq(recoveryStore.get(), 'recovering', 'الخادم جاوب: يتعافى');
    t.same(env.deleted, [SHELL], 'يمسح خبيئة القشرة بس');
    t.eq(env.unregistered.length, 1, 'يلغي تسجيل الخدمة العاملة');
    t.eq(env.win.reloads, 1, 'ويعيد التحميل مرّة');
  });
  await recoveryCase({ fetch: recordingFetch(scriptResponse), sessionStorage: first.sessionStorage }, async ({ recoverFromStaleShell }, env) => {
    t.eq(recoverFromStaleShell(), 'looped', 'فشل ثاني خلال ٣٠ ثانية: «ما كدرنا» بلا دوّامة');
    await settle();
    untouched(t, env, 'الدوّامة');
  });

  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const slow = recordingFetch(async () => {
    await gate;
    return scriptResponse();
  });
  await recoveryCase({ fetch: slow }, async ({ recoverFromStaleShell, recoveryStore, initRecovery, dirtyStore }, env) => {
    initRecovery();
    t.eq(recoverFromStaleShell(), 'checking', 'نموذج انفتح أثناء الفحص: يبدأ يفحص');
    dirtyStore.set(true);
    release();
    await settle();
    t.eq(recoveryStore.get(), 'pending_save', 'النظافة تنفحص بعد الفحص: «احفظ وبعدين نكمّل»');
    untouched(t, env, 'نموذج أثناء الفحص');
    dirtyStore.set(false);
    await settle();
    t.eq(slow.calls.length, 2, 'بعد الحفظ يعيد يفحص الخادم');
    t.eq(recoveryStore.get(), 'recovering', 'وبعدها يتعافى');
    t.eq(env.win.reloads, 1, 'إعادة تحميل وحدة بعد الحفظ');
  });

  await recoveryCase({ fetch: recordingFetch(scriptResponse) }, async ({ initRecovery, recoveryStore }, env) => {
    initRecovery();
    const event = new Event('vite:preloadError', { cancelable: true });
    env.win.dispatchEvent(event);
    t.eq(event.defaultPrevented, false, 'vite:preloadError ما ينلغي: الحدّ يعرض الحالة');
    t.eq(recoveryStore.get(), 'checking', 'vite:preloadError يبدأ التعافي');
    await settle();
  });

  const unused = recordingFetch(scriptResponse);
  await recoveryCase({ fetch: unused, onLine: false }, async ({ initRecovery, recoverFromStaleShell, recoveryStore }, env) => {
    initRecovery();
    t.eq(recoverFromStaleShell(), 'offline', 'بلا نت صريح: «بلا نت» فوراً');
    t.eq(unused.calls.length, 0, 'بلا نت صريح: ماكو فحص');
    env.navigator.onLine = true;
    env.win.dispatchEvent(new Event('online'));
    t.eq(recoveryStore.get(), 'idle', 'النت رجع: «بلا نت» تنفكّ');
    untouched(t, env, 'بلا نت صريح');
  });
}

async function pageFailed(t) {
  const { PageFailed, recoveryStore, renderToStaticMarkup, createElement } = await loadEntry([
    "export { PageFailed } from './src/components/shell/RouteErrorBoundary.tsx';",
    "export { recoveryStore } from './src/lib/pwa/recovery.ts';",
    ...RENDER,
  ]);
  const html = () => renderToStaticMarkup(createElement(PageFailed, { error: new TypeError('Failed to fetch dynamically imported module') }));
  recoveryStore.set('offline');
  let markup = html();
  t.ok(markup.includes('تعذّر فتح الصفحة دون إنترنت'), 'الصفحة الفاشلة بلا نت: تكول السبب');
  t.ok(markup.includes('data-action="reload"'), 'الصفحة الفاشلة بلا نت: بيها زرّ «افتح الصفحة من جديد»');
  recoveryStore.set('checking');
  markup = html();
  t.ok(markup.includes('data-action="reload"'), 'أثناء فحص الخادم: بيها زرّ إعادة');
  recoveryStore.set('idle');
  t.ok(html().includes('data-action="retry"'), 'بعد ما يرجع النت: «أعد المحاولة» يعيد التحميل');
}

// ── التحديث ──────────────────────────────────────────────────────────────

const UPDATE_ENTRY = ["export * from './src/lib/pwa/update.ts';", "export { dirtyStore } from './src/lib/pwa/dirty.ts';"];
const CHANNEL = 'poultry-app-windows';
const SKIP = [{ type: 'SKIP_WAITING' }];

function worker(state = 'activated') {
  const w = new EventTarget();
  w.scriptURL = 'https://app.test/sw.js';
  w.state = state;
  w.messages = [];
  w.postMessage = (message) => w.messages.push(message);
  return w;
}

/** BroadcastChannel مصنوع: الرسالة توصل لباقي القنوات بنفس الاسم (مو للمرسل). */
function makeBus() {
  const open = [];
  class Channel {
    constructor(name) {
      this.name = name;
      this.listeners = new Set();
      open.push(this);
    }
    addEventListener(type, listener) {
      if (type === 'message') this.listeners.add(listener);
    }
    removeEventListener(_type, listener) {
      this.listeners.delete(listener);
    }
    postMessage(data) {
      for (const other of open) {
        if (other === this || other.name !== this.name) continue;
        queueMicrotask(() => [...other.listeners].forEach((listener) => listener({ data })));
      }
    }
    close() {}
  }
  return Channel;
}

function updateEnv({ controller = null, active = null, waiting = null, installing = null, registerFailures = 0 } = {}) {
  const existing = Boolean(active || waiting);
  const reg = new EventTarget();
  Object.assign(reg, { scope: 'https://app.test/', active, waiting, installing, updates: 0 });
  reg.update = async () => {
    reg.updates += 1;
    return reg;
  };
  const sw = new EventTarget();
  sw.controller = controller;
  sw.registerCalls = [];
  sw.register = async (url, options) => {
    sw.registerCalls.push({ url: String(url), scope: options?.scope });
    if (sw.registerCalls.length <= registerFailures) throw new TypeError('Failed to fetch /sw.js');
    // مثل المتصفّح: تسجيل ناجح بلا أي عاملة يبدأ تثبيتاً.
    if (!reg.installing && !reg.waiting && !reg.active) reg.installing = worker('installing');
    return reg;
  };
  sw.getRegistration = async () => (existing ? reg : undefined);
  const win = new EventTarget();
  win.reloads = 0;
  win.location = { href: 'https://app.test/', reload: () => (win.reloads += 1) };
  win.intervals = [];
  win.setInterval = (fn) => win.intervals.push(fn);
  const doc = new EventTarget();
  Object.assign(doc, { visibilityState: 'visible', readyState: 'complete', baseURI: 'https://app.test/' });
  const Channel = makeBus();
  const globals = {
    window: win,
    document: doc,
    location: win.location,
    self: globalThis,
    navigator: { serviceWorker: sw, onLine: true, userAgent: 'test' },
    BroadcastChannel: Channel,
    setTimeout: fastTimeout,
  };
  const takeOver = (next) => {
    reg.waiting = null;
    reg.active = next;
    sw.controller = next;
    sw.dispatchEvent(new Event('controllerchange'));
  };
  return { reg, sw, win, doc, Channel, globals, takeOver };
}

async function updateCase(env, body) {
  await withGlobals(env.globals, async () => {
    const mod = await loadEntry(UPDATE_ENTRY);
    mod.registerServiceWorker();
    await settle();
    await body(mod);
    await settle();
  });
}

async function updates(t) {
  // أوّل زيارة: النافذة بدت بلا مسيطر، فـisUpdate مال workbox يبقى خطأ لآخر عمرها.
  const v1 = worker('installing');
  const first = updateEnv({ installing: v1 });
  await updateCase(first, async ({ updateStore }) => {
    t.eq(updateStore.get().offlineReady, false, 'أوّل زيارة: مو جاهز قبل ما يكمل التثبيت');
    first.reg.installing = null;
    v1.state = 'activated';
    first.takeOver(v1);
    t.eq(first.win.reloads, 0, 'أوّل زيارة: clientsClaim يمسكها بلا إعادة تحميل');
    t.eq(updateStore.get().offlineReady, true, 'أوّل زيارة: جاهز بلا نت بعد ما مسكها');
    const v2 = worker('installed');
    first.reg.waiting = v2;
    first.doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    t.ok(first.reg.updates >= 1, 'الرجوع للواجهة يسأل عن نسخة جديدة');
    t.same(v2.messages, SKIP, 'الرجوع للواجهة يطبّق النسخة المنتظرة (SKIP_WAITING للمنتظرة نفسها)');
    first.takeOver(v2);
    t.eq(first.win.reloads, 1, 'نافذة بدت بلا مسيطر: النسخة الجديدة تمسك ← تعيد التحميل');
  });

  // تحديث قسري: بلا مسيطر بس الخدمة العاملة فعّالة، فأوّل مسيطر نسخة أحدث من الشفرة.
  const hard = updateEnv({ active: worker() });
  await updateCase(hard, async ({ updateStore }) => {
    t.eq(updateStore.get().offlineReady, true, 'تحديث قسري: الخدمة الفعّالة تكفي للفتح بلا نت');
    hard.takeOver(worker());
    t.eq(hard.win.reloads, 1, 'تحديث قسري: أوّل مسيطر نسخة جديدة ← تعيد التحميل');
  });

  // نافذة بيها نموذج: النسخة الجديدة مسكت من نافذة ثانية.
  const v1b = worker();
  const dirty = updateEnv({ controller: v1b, active: v1b });
  await updateCase(dirty, async ({ updateStore, dirtyStore }) => {
    dirtyStore.set(true);
    dirty.takeOver(worker());
    t.eq(dirty.win.reloads, 0, 'نموذج معدّل: ما تعيد التحميل');
    t.eq(updateStore.get().reloadAfterSave, true, 'نموذج معدّل: «احفظ وبعدين نكمّل»');
    dirtyStore.set(false);
    t.eq(dirty.win.reloads, 1, 'بعد الحفظ: تعيد التحميل');
  });

  // أوّل تثبيت والنموذج معدّل: waiting بلا active مو تحديث.
  const v1c = worker('installing');
  const firstDirty = updateEnv({ installing: v1c });
  await updateCase(firstDirty, async ({ updateStore, dirtyStore }) => {
    dirtyStore.set(true);
    v1c.state = 'installed';
    firstDirty.reg.waiting = v1c;
    v1c.dispatchEvent(new Event('statechange'));
    await settle();
    t.eq(updateStore.get().waitingBlocked, false, 'أوّل تثبيت مو «نسخة جديدة — تتطبّق بعد الحفظ»');
    t.eq(v1c.messages.length, 0, 'أوّل تثبيت: ماكو SKIP_WAITING');
  });

  // نسخة جديدة توصل بـupdatefound والنافذة نظيفة: تنطبّق بلا انتظار الفحص الدوري.
  const v1d = worker();
  const found = updateEnv({ controller: v1d, active: v1d });
  await updateCase(found, async () => {
    const v2 = worker('installing');
    found.reg.installing = v2;
    found.reg.dispatchEvent(new Event('updatefound'));
    v2.state = 'installed';
    found.reg.installing = null;
    found.reg.waiting = v2;
    v2.dispatchEvent(new Event('statechange'));
    await settle();
    t.same(v2.messages, SKIP, 'updatefound ← installed: تنطبّق والنوافذ نظيفة');
  });

  // نافذة ثانية بيها نموذج تحبس التحديث، وبعدين تنسدّ بلا ما تكول (النظام قتلها).
  const v1e = worker();
  const v2e = worker('installed');
  const blocked = updateEnv({ controller: v1e, active: v1e, waiting: v2e });
  const peer = new blocked.Channel(CHANNEL);
  let peerAlive = true;
  const heard = [];
  peer.addEventListener('message', ({ data }) => {
    heard.push(data);
    if (data.type === 'query' && peerAlive) peer.postMessage({ type: 'state', nonce: data.nonce, dirty: true });
  });
  await updateCase(blocked, async ({ updateStore }) => {
    t.eq(v2e.messages.length, 0, 'نافذة ثانية وسخة: ما ينرسل SKIP_WAITING');
    t.eq(updateStore.get().waitingBlocked, true, 'نافذة ثانية وسخة: «تتطبّق بعد الحفظ»');
    peerAlive = false;
    t.eq(blocked.win.intervals.length, 1, 'فحص كل ٢٠ دقيقة مسجّل');
    blocked.win.intervals[0]();
    await settle();
    t.same(v2e.messages, SKIP, 'الفحص الدوري يعيد يسأل النوافذ: الوسخة انسدّت ← تنطبّق');
    t.eq(updateStore.get().waitingBlocked, false, 'والشريط ينشال');
    heard.length = 0;
    blocked.win.dispatchEvent(new Event('pagehide'));
    await settle();
    t.ok(
      heard.some((m) => m.type === 'state' && m.nonce === null && m.dirty === false),
      'pagehide: النافذة اللي تنسدّ تعلن «نظيفة» حتى ما تحبس غيرها',
    );
  });

  // التسجيل فشل بأوّل زيارة (نت ضعيف): ينعاد.
  const retry = updateEnv({ registerFailures: 1 });
  await updateCase(retry, async () => {
    t.eq(retry.sw.registerCalls.length, 1, 'التسجيل انحاول مرّة');
    retry.win.dispatchEvent(new Event('online'));
    await settle();
    t.eq(retry.sw.registerCalls.length, 2, 'التسجيل الفاشل ينعاد لما يرجع النت');
    t.same(retry.sw.registerCalls[1], { url: '/sw.js', scope: '/' }, 'الإعادة لنفس السكربت والنطاق');
    retry.doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    t.eq(retry.reg.updates, 1, 'بعد ما تسجّل: الرجوع للواجهة يسأل عن نسخة');
    t.eq(retry.sw.registerCalls.length, 2, 'وما يعيد التسجيل');
  });

  // التسجيل نجح بس أوّل تثبيت فشل بنصّه (طلب تثبيت مسبق انقطع): التسجيل مات، والفحص الجاي يسجّل من جديد.
  const v1f = worker('installing');
  const brokenInstall = updateEnv({ installing: v1f });
  await updateCase(brokenInstall, async ({ updateStore }) => {
    t.eq(brokenInstall.sw.registerCalls.length, 1, 'التسجيل الأوّل نجح');
    brokenInstall.reg.update = async () => {
      throw new Error('InvalidStateError: registration removed');
    };
    brokenInstall.reg.installing = null;
    v1f.state = 'redundant';
    v1f.dispatchEvent(new Event('statechange'));
    brokenInstall.win.dispatchEvent(new Event('online'));
    await settle();
    t.eq(brokenInstall.sw.registerCalls.length, 2, 'التثبيت الفاشل: النت رجع ← تسجيل جديد، مو update() على تسجيل ميّت');
    t.eq(updateStore.get().offlineReady, false, 'ولحد ما يكمل: «مو جاهز بلا نت»');
  });
}

// ── الرأس ────────────────────────────────────────────────────────────────

async function statusChips(t) {
  const { StatusChips, onlineStore, updateStore, renderToStaticMarkup, createElement } = await loadEntry([
    "export { StatusChips } from './src/components/shell/StatusChips.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { updateStore } from './src/lib/pwa/update.ts';",
    ...RENDER,
  ]);
  const chips = (online, offlineReady) => {
    onlineStore.set(online);
    updateStore.set((state) => ({ ...state, offlineReady }));
    const html = renderToStaticMarkup(createElement(StatusChips));
    return { offline: html.includes('>غير متّصل<'), notReady: html.includes('>غير جاهز دون اتصال<'), html };
  };
  const both = chips(false, false);
  t.ok(both.offline && both.notReady, 'بلا نت ومو جاهز: الشارتين سوا');
  t.ok(both.html.includes('لا تغلقه حتى يعود الاتصال'), 'بلا نت ومو جاهز: التفصيل يكول لا تسدّه');
  const online = chips(true, false);
  t.ok(!online.offline && online.notReady, 'بالنت ومو جاهز: «مو جاهز» بس');
  const ready = chips(false, true);
  t.ok(ready.offline && !ready.notReady, 'بلا نت وجاهز: «بلا نت» بس');
}

export default async function (t) {
  await recoveryProbe(t);
  await pageFailed(t);
  await updates(t);
  await statusChips(t);
}
