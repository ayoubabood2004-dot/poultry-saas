import { lazy, type ComponentType } from 'react';
import { createStore } from '../store';
import { dirtyStore, isWindowDirty } from './dirty';

// القشرة القديمة بعد النشر: بصمات الملفات تتغيّر، فنافذة بقت على شفرة قديمة تطلب حزمة انشالت.
// فشل تحميل حزمة: بلا نموذج معدّل ← نتأكّد إن الخادم يجاوب، وبعدها نمسح خبيئة القشرة بس، نلغي تسجيل
// الخدمة العاملة، ونعيد التحميل مرّة وحدة (حارس ٣٠ ثانية)؛ وبنموذج ← «انحمّلت نسخة جديدة — احفظ وبعدين نكمّل»،
// والتعافي بعد الحفظ. الجهاز بلا نت ما ينمسّ، وبيانات المستخدم (IndexedDB والطابور) ما تنمسّ أبداً.
// «متّصل» ما يكفي: navigator.onLine صحيح بإشارة وحدة أو واي فاي بلا نت، ومسح القشرة هناك يخلّي التطبيق
// ما ينفتح بالقاعة لحد ما يرجع النت.

export type RecoveryState = 'idle' | 'checking' | 'recovering' | 'pending_save' | 'offline' | 'looped';

export const recoveryStore = createStore<RecoveryState>('idle');

const GUARD_KEY = 'poultry.shell-recovery-at';
const COUNT_KEY = 'poultry.shell-recoveries';
const GUARD_MS = 30_000;
const SHELL_CACHE_PREFIX = 'workbox-precache';
const PROBE_URL = '/sw.js';
const PROBE_TIMEOUT_MS = 5_000;

function recoveredRecently(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(GUARD_KEY) ?? 0) < GUARD_MS;
  } catch {
    return false;
  }
}

function stampRecovery(): void {
  try {
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    localStorage.setItem(COUNT_KEY, String(Number(localStorage.getItem(COUNT_KEY) ?? 0) + 1));
  } catch {
    /* swallow-ok: الحارس والعدّاد للتشخيص؛ التعافي يكمل بلاهم */
  }
}

/** الخادم يجاوب بسكربت الخدمة العاملة نفسه، مو بس «متّصل». بوابة الواي فاي تجاوب بصفحتها HTML. */
async function serverReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(PROBE_URL, { cache: 'no-store', signal: controller.signal });
    return response.ok && /javascript/i.test(response.headers.get('content-type') ?? '');
  } catch { // swallow-ok: فشل الشبكة أو المهلة يعني بلا نت، وما ينمسّ شي
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resetShellAndReload(): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(SHELL_CACHE_PREFIX)).map((name) => caches.delete(name)));
  } catch {
    /* swallow-ok: بلا Cache API ماكو قشرة نمسحها */
  }
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    /* swallow-ok: بلا خدمة عاملة، إعادة التحميل وحدها تجيب القشرة الجديدة */
  }
  window.location.reload();
}

async function probeThenRecover(): Promise<void> {
  const reachable = await serverReachable();
  // الفحص ياخذ لحد ٥ ثواني، ونموذج ممكن يتعدّل بيها: النظافة تنفحص من جديد قبل أي مسح.
  let next: RecoveryState;
  if (!reachable) next = 'offline';
  else if (isWindowDirty()) next = 'pending_save';
  else next = 'recovering';
  recoveryStore.set(next);
  if (next !== 'recovering') return;
  stampRecovery();
  await resetShellAndReload();
}

export function recoverFromStaleShell(): RecoveryState {
  const current = recoveryStore.get();
  if (current === 'recovering' || current === 'checking') return current;
  let next: RecoveryState;
  if (!navigator.onLine) next = 'offline';
  else if (isWindowDirty()) next = 'pending_save';
  else if (recoveredRecently()) next = 'looped';
  else next = 'checking';
  recoveryStore.set(next);
  if (next === 'checking') void probeThenRecover();
  return next;
}

/** كل صفحة كسولة تمرّ من هنا حتى فشل تحميل حزمتها يمرّ من التعافي. */
export function page(load: () => Promise<{ default: ComponentType }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      recoverFromStaleShell();
      throw error;
    }
  });
}

export function initRecovery(): void {
  // ما نلغي الحدث: الاستيراد يرمي، وحدّ الصفحة يعرض الحالة (نفحص، بلا نت، نحمّل) ويّا زرّ إعادة.
  window.addEventListener('vite:preloadError', () => {
    recoverFromStaleShell();
  });
  dirtyStore.subscribe(() => {
    if (!isWindowDirty() && recoveryStore.get() === 'pending_save') recoverFromStaleShell();
  });
  // النت رجع: «بلا نت» ما تبقى، وفشل الصفحة الجاي ينفحص من جديد.
  window.addEventListener('online', () => {
    if (recoveryStore.get() === 'offline') recoveryStore.set('idle');
  });
}
