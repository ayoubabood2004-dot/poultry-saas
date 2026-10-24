import { Workbox } from 'workbox-window';
import { createStore } from '../store';
import { dirtyStore, isWindowDirty } from './dirty';

// التحديث يوصل للمثبّت وما يمسح شغلاً (registerType: "prompt"):
// - كل نافذة تعلن حالتها بـBroadcastChannel، وskipWaiting ما ينرسل إلا لما كلها نظيفة،
//   وإلا شريط «نسخة جديدة — تتطبّق بعد الحفظ» بكلها. النافذة اللي تنسدّ تعلن «نظيفة» بـpagehide،
//   حتى نموذج بنافذة انسدّت ما يحبس التحديث للأبد.
// - عند تبدّل المسيطر (controllerchange) النافذة تعيد التحميل بس إذا هي نظيفة. ما نعتمد isUpdate مال
//   workbox: ينحسب مرّة وحدة بالتسجيل، فنافذة بدت بلا مسيطر ما كانت تعيد التحميل أبداً وتبقى على شفرة قديمة.
// - يسأل عن نسخة جديدة كل ما يرجع للواجهة وكل ٢٠ دقيقة، وأي نسخة تنتظر يعيد يسأل النوافذ عنها:
//   workbox يبطّل يسمع updatefound بعد أوّل تحديث من برّا، والآيفون يرجّع التطبيق المثبّت بلا إعادة تحميل.
// - تسجيل فشل (نت ضعيف بأوّل زيارة) ينعاد عند online والرجوع للواجهة وكل ٢٠ دقيقة، وإلا ما ينفتح بلا نت.

export interface UpdateState {
  /** الخدمة العاملة فعّالة أو ماسكة الصفحة: القشرة تنفتح بلا نت. */
  offlineReady: boolean;
  /** نسخة جديدة تنتظر، وبنافذة نموذج معدّل. */
  waitingBlocked: boolean;
  /** النسخة الجديدة مسكت وهاي النافذة بيها نموذج: تتحمّل بعد الحفظ. */
  reloadAfterSave: boolean;
}

export const updateStore = createStore<UpdateState>({
  offlineReady: false,
  waitingBlocked: false,
  reloadAfterSave: false,
});

const SW_URL = '/sw.js';
const SW_SCOPE = '/';
const CHANNEL_NAME = 'poultry-app-windows';
const CHECK_EVERY_MS = 20 * 60 * 1000;
const QUERY_WAIT_MS = 400;

type WindowMessage =
  | { type: 'query'; nonce: string }
  | { type: 'state'; nonce: string | null; dirty: boolean }
  | { type: 'blocked'; blocked: boolean };

let registration: ServiceWorkerRegistration | null = null;
let registering = false;
let updateWaiting = false;
let channel: BroadcastChannel | null = null;
/** النافذة كان بيها مسيطر، أو مسكها مسيطر بعد ما انفتحت. */
let hadController = false;
/** انفتحت بلا مسيطر وأكو خدمة عاملة فعّالة (تحديث قسري): أوّل مسيطر يجيها هو نسخة أحدث، مو أوّل تثبيت. */
let activeAtLoad = false;

function post(message: WindowMessage): void {
  channel?.postMessage(message);
}

function setBlocked(blocked: boolean): void {
  updateStore.set((state) => ({ ...state, waitingBlocked: blocked }));
  post({ type: 'blocked', blocked });
}

/** يسأل باقي النوافذ عن نماذجها. نافذة ما تجاوب (مجمّدة أو انسدّت) تنحسب نظيفة، وهي تحمي نفسها عند controllerchange. */
function otherWindowsClean(): Promise<boolean> {
  const bus = channel;
  if (!bus) return Promise.resolve(true);
  const nonce = crypto.randomUUID();
  return new Promise((resolve) => {
    let clean = true;
    const onMessage = (event: MessageEvent<WindowMessage>) => {
      const message = event.data;
      if (message.type === 'state' && message.nonce === nonce && message.dirty) clean = false;
    };
    bus.addEventListener('message', onMessage);
    post({ type: 'query', nonce });
    setTimeout(() => {
      bus.removeEventListener('message', onMessage);
      resolve(clean);
    }, QUERY_WAIT_MS);
  });
}

async function tryApplyUpdate(): Promise<void> {
  if (!updateWaiting) return;
  if (isWindowDirty() || !(await otherWindowsClean())) {
    setBlocked(true);
    return;
  }
  setBlocked(false);
  const waiting = registration?.waiting;
  // ماكو منتظرة: نافذة ثانية طبّقتها، وcontrollerchange يكمّل.
  if (!waiting) {
    updateWaiting = false;
    return;
  }
  // للمنتظرة نفسها مو عن طريق workbox: بعد تسجيل مباشر (الإعادة) ماكو workbox مسجّل.
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** نسخة تنتظر = تحديث، بشرط أكو فعّالة: waiting بلا active أوّل تثبيت يكمل لحاله. */
function checkWaiting(): void {
  if (!registration?.waiting || !registration.active) return;
  updateWaiting = true;
  void tryApplyUpdate();
}

function markOfflineReady(): void {
  updateStore.set((state) => (state.offlineReady ? state : { ...state, offlineReady: true }));
}

/**
 * أوّل تثبيت فشل بنصّه (طلب من التثبيت المسبق انقطع بنت ضعيف): المتصفّح يشيل التسجيل، وupdate() عليه
 * يفشل للأبد. تسجيل بلا عاملة تثبّت ولا منتظرة ولا فعّالة ميّت، فالفحص الجاي يسجّل من جديد.
 */
function isDead(reg: ServiceWorkerRegistration): boolean {
  return !reg.installing && !reg.waiting && !reg.active;
}

function watchInstalling(reg: ServiceWorkerRegistration): void {
  const worker = reg.installing;
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') checkWaiting();
    if (worker.state === 'redundant' && registration === reg && isDead(reg)) registration = null;
  });
}

function onRegistered(reg: ServiceWorkerRegistration): void {
  registration = reg;
  if (reg.active) markOfflineReady();
  reg.addEventListener('updatefound', () => watchInstalling(reg));
  watchInstalling(reg);
  checkWaiting();
}

async function register(wb: Workbox | null): Promise<void> {
  if (registration || registering) return;
  registering = true;
  try {
    // Workbox ما يتسجّل مرّتين، فالإعادة بالتسجيل المباشر لنفس السكربت والنطاق.
    const reg = wb ? await wb.register() : await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    if (reg) onRegistered(reg);
  } catch {
    /* swallow-ok: نت ضعيف بأوّل زيارة؛ ينعاد عند online والرجوع للواجهة وكل ٢٠ دقيقة */
  } finally {
    registering = false;
  }
}

async function checkForUpdate(): Promise<void> {
  if (registration && isDead(registration)) registration = null;
  if (!registration) {
    await register(null);
    return;
  }
  try {
    await registration.update();
  } catch {
    /* swallow-ok: بلا نت أو الخادم ما جاوب؛ النسخة المنتظرة (إن وجدت) تنفحص تحت، والفحص الجاي يعيد */
  }
  checkWaiting();
}

async function noteActiveAtLoad(): Promise<void> {
  try {
    activeAtLoad = Boolean((await navigator.serviceWorker.getRegistration())?.active);
    if (activeAtLoad) markOfflineReady();
  } catch {
    /* swallow-ok: بلا قراءة تنحسب أوّل زيارة، وأوّل مسك ما يعيد التحميل */
  }
}

function onControllerChange(): void {
  markOfflineReady();
  // أوّل مسك لنافذة انفتحت بلا خدمة عاملة أصلاً (أوّل زيارة، بعد التعافي): clientsClaim يمسكها بنفس
  // نشر شفرتها، فما نعيد التحميل. أي تبدّل بعده نسخة جديدة.
  const firstInstall = !hadController && !activeAtLoad;
  hadController = true;
  if (firstInstall) return;
  updateWaiting = false;
  if (isWindowDirty()) updateStore.set((state) => ({ ...state, reloadAfterSave: true }));
  else window.location.reload();
}

function onWindowClean(): void {
  if (updateStore.get().reloadAfterSave) {
    window.location.reload();
    return;
  }
  post({ type: 'state', nonce: null, dirty: false });
  void tryApplyUpdate();
}

export function registerServiceWorker(): void {
  // خادم التطوير بلا خدمة عاملة: كل هذا يُفحص على بناء إنتاج (npm run build && npm run preview).
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
  channel?.addEventListener('message', (event: MessageEvent<WindowMessage>) => {
    const message = event.data;
    if (message.type === 'query') post({ type: 'state', nonce: message.nonce, dirty: isWindowDirty() });
    else if (message.type === 'state' && message.nonce === null && !message.dirty) void tryApplyUpdate();
    else if (message.type === 'blocked') updateStore.set((state) => ({ ...state, waitingBlocked: message.blocked }));
  });

  dirtyStore.subscribe(() => {
    if (!isWindowDirty()) onWindowClean();
  });
  // نافذة تنسدّ أو ينطفي تبويبها ما تبقى تحبس التحديث: آخر كلمة منها «نظيفة».
  window.addEventListener('pagehide', () => post({ type: 'state', nonce: null, dirty: false }));

  hadController = Boolean(navigator.serviceWorker.controller);
  if (hadController) markOfflineReady();
  else void noteActiveAtLoad();
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  void register(new Workbox(SW_URL, { scope: SW_SCOPE }));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('online', () => void checkForUpdate());
  window.setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
}
