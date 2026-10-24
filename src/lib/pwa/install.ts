import { createStore } from '../store';
import { ensurePersisted } from './persist';

// زرّ «نزّل التطبيق»: عامل القاعة ما يفتح رابطاً كل صبح، والأيقونة بالشاشة هي اللي ترجّعه.
// أندرويد: كروم يطلّع beforeinstallprompt بس بعد ضغطة و٣٠ ثانية مشاهدة، وفايرفوكس ما يطلّعه أبداً،
// فالزرّ يبقى ويفتح شرحاً مصوّراً إذا الحدث ما وصل. الآيفون ماكو حدث تثبيت أصلاً.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'android'
  | 'desktop'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'in-app';

export interface InstallState {
  standalone: boolean;
  canPrompt: boolean;
  /** انقبل التثبيت من هذا التبويب (appinstalled): الأيقونة بالشاشة، بس التبويب نفسه بعده بالمتصفّح. */
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;

const standaloneQuery = typeof window === 'undefined' ? null : window.matchMedia('(display-mode: standalone)');

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (standaloneQuery?.matches ?? false) || iosStandalone;
}

export const installStore = createStore<InstallState>({
  standalone: typeof window === 'undefined' ? false : isStandalone(),
  canPrompt: false,
  installed: false,
});

export function detectPlatform(userAgent: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints): Platform {
  // متصفّح داخل تطبيق ثاني (فيسبوك، إنستغرام، لاين، WebView أندرويد): ماكو تثبيت ولا «إضافة للشاشة».
  if (/FBAN|FBAV|Instagram|Line\/|; wv\)/.test(userAgent)) return 'in-app';
  // آيباد الحديث يعلن نفسه «Macintosh»؛ اللمس يكشفه.
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
  if (ios) {
    if (/CriOS/.test(userAgent)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS/.test(userAgent)) return 'ios-other';
    return 'ios-safari';
  }
  if (/Android/.test(userAgent)) return 'android';
  if (/Firefox\//.test(userAgent)) return 'desktop-firefox';
  // سفاري الماك وحده يكتب «Version/»؛ كروم وإيدج الماك يكتبون Safari هم بس بلاها.
  if (/Macintosh/.test(userAgent) && /Version\/[\d.]+.*Safari\//.test(userAgent)) return 'desktop-safari';
  return 'desktop';
}

export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    installStore.set((state) => ({ ...state, canPrompt: true }));
  });
  // التبويب اللي قبل التثبيت يبقى بالمتصفّح (standalone خطأ)، فالتثبيت ينحفظ بعلمه. والتثبيت أهم معيار
  // لـpersist()، فينسأل هسّه مو بالإقلاع الجاي.
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installStore.set((state) => ({ ...state, standalone: isStandalone(), canPrompt: false, installed: true }));
    void ensurePersisted();
  });
  standaloneQuery?.addEventListener('change', () => {
    const standalone = isStandalone();
    installStore.set((state) => ({ ...state, standalone }));
    if (standalone) void ensurePersisted();
  });
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  installStore.set((state) => ({ ...state, canPrompt: false }));
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch { // swallow-ok: حدث قديم أو انستعمل (NotAllowedError)؛ «ما متاح» يفتح الشرح المصوّر بداله
    return 'unavailable';
  }
}
