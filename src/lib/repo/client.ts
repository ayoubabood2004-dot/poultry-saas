import type { SupabaseClient } from '@supabase/supabase-js';
import { backendSettings } from '../env';
import { notConnected } from './core';

// عميل Supabase واحد، ينبني أوّل استعمال ويتحمّل بـimport() حتى حزمته (عشرات الكيلوبايتات) برّا حزمة الإقلاع
// وتنحفظ بالتثبيت المسبق للفتح بلا نت. if (!settings) notConnected() مو تعبير شرطي: Rollup يشيل الاستيراد كلّه
// من بناء بلا مفاتيح لو انكتب `settings ? create() : null`، فيختلف البناء المحلّي عن Vercel بحجمه وحرّاسه.
// الجلسة بـlocalStorage بمفتاح Supabase الافتراضي sb-<ref>-auth-token (الخروج يمسح sb-* بيده، FOUNDATION ٢٢٨).
//
// كل عميل بتخزين يتسحب منه لمّا ينسقط بالخروج: auth-js بلا أقفال، وطلب /logout متأخّر من العميل القديم كان يمسح
// جلسة اللي دخل بعده بنفس المفتاح ويطلّعه (المراجعة العدائية). وأحداث الجلسة لمستمعين على مستوى الملف، فكل
// عميل جديد يبلّغهم، والقديم المسحوب ساكت.

export type AuthListener = (event: string, userId: string | null) => void;

/** مفتاح جلسة Supabase بالتخزين (sb-<ref>-auth-token)، مو -code-verifier ولا -user. */
export const STORED_SESSION = /^sb-.+-auth-token$/;

const listeners = new Set<AuthListener>();

function emit(event: string, userId: string | null): void {
  setTimeout(() => {
    for (const listener of listeners) listener(event, userId);
  }, 0);
}

// تبويب ثاني مسح الجلسة بيده (خروج /logout بيه تأخّر أكثر من ٥ ثواني، أو بلا نت): auth-js ما يسمع حدث storage،
// والعميل اللي انسقط سكّر قناة التبويبات، فهذا التبويب ما يدري ويبقى بمنشأة الخارج. حدث storage يوصل التبويبات
// الثانية بس، وبالمتصفّحات اللي بلا BroadcastChannel هم.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
    if (event.key === null || (STORED_SESSION.test(event.key) && event.newValue === null)) emit('SIGNED_OUT', null);
  });
}

/** تخزين الجلسة لعميل واحد. revoked: ما يقرا ولا يكتب ولا يمسح بعد إسقاط العميل. */
export interface RevocableStorage {
  revoked: boolean;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Backing = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * localStorage إذا يشتغل، وإلا خريطة بالذاكرة: بتخزين مخصّص auth-js ما يرجع للذاكرة بنفسه (supportsLocalStorage بس
 * بلا تخزين مخصّص)، فبيانات موقع ممنوعة كانت تخلّي كل دخول ناجح «انتهت جلسة الدخول» فوراً. بالذاكرة الجلسة تبقى
 * لحد ما تنسدّ النافذة.
 */
function backing(): Backing {
  try {
    const probe = '__poultry_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch { // swallow-ok: تخزين ممنوع (بيانات الموقع مقفولة أو نافذة خاصّة) = الجلسة بالذاكرة
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

export function revocableStorage(target: Backing = backing()): RevocableStorage {
  const storage: RevocableStorage = {
    revoked: false,
    getItem(key) {
      if (storage.revoked) return null;
      try {
        return target.getItem(key);
      } catch { // swallow-ok: تخزين انقفل بنصّ الشغل = بلا جلسة محفوظة، والدخول يطلب من جديد
        return null;
      }
    },
    setItem(key, value) {
      if (storage.revoked) return;
      try {
        target.setItem(key, value);
      } catch {
        /* swallow-ok: تخزين ممتلئ أو انقفل بنصّ الشغل؛ الجلسة الحالية تكمل والإقلاع الجاي يطلب الدخول */
      }
    },
    removeItem(key) {
      if (storage.revoked) return;
      try {
        target.removeItem(key);
      } catch {
        /* swallow-ok: تخزين انقفل = ماكو شي ينمسح */
      }
    },
  };
  return storage;
}

let pending: Promise<{ client: SupabaseClient; storage: RevocableStorage }> | null = null;

/** async: بلا مفاتيح يرجع رفضاً (NotConnectedError) مثل أي فشل، مو رمية متزامنة قبل الوعد. */
export async function getClient(): Promise<SupabaseClient> {
  const settings = backendSettings();
  if (!settings) notConnected();
  pending ??= import('@supabase/supabase-js').then(
    ({ createClient }) => {
      const storage = revocableStorage();
      const client = createClient(settings.url, settings.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage },
      });
      // داخل onAuthStateChange متزامن بس، والشغل بعده بـsetTimeout (FOUNDATION ٢٠٣: auth-js ماسك قفله هنا).
      client.auth.onAuthStateChange((event, session) => {
        if (storage.revoked) return;
        const userId = session?.user.id ?? null;
        setTimeout(() => {
          // انسقط بين الحدث وتسليمه: حدث عميل الخارج ما يوصل لجلسة اللي بعده.
          if (storage.revoked) return;
          for (const listener of listeners) listener(event, userId);
        }, 0);
      });
      return { client, storage };
    },
    (error: unknown) => {
      // حزمة ما انحمّلت (نشر جديد أو شبكة): المحاولة الجاية تعيد التحميل، مو ترجع نفس الفشل.
      pending = null;
      throw error;
    },
  );
  return (await pending).client;
}

/** يسمع تغيّر الجلسة من كل عميل ينبني (حالي وجاي). يرجّع إلغاء الاشتراك. */
export function addAuthListener(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * بعد الخروج: العميل القديم يتسحب منه التخزين أوّلاً (طلب بالطريق ما يكتب ولا يمسح بعدها)، وdispose يوكف تجديده
 * وقناة التبويبات ومشتركيه. الجاي ينبني من تخزين ممسوح.
 */
export async function dropClient(): Promise<void> {
  const current = pending;
  pending = null;
  if (!current) return;
  try {
    const { client, storage } = await current;
    storage.revoked = true;
    await client.auth.dispose();
    // انسقط وinitialize() بعده يعيد التجديد (إقلاع بلا نت بتوكن منتهٍ): نهايته ترجّع مؤقّت التجديد ومستمع الظهور،
    // فالتفكيك يتكرّر بعدها مرّة. ومستمعي realtime بالنافذة (phoenix، بلا مرجع يشيلهم) يبقون: تسرّب ذاكرة صغير معلوم.
    void client.auth
      .initialize()
      .catch(() => {
        /* swallow-ok: فشل initialize ما يهمّ هنا؛ المطلوب التفكيك بعد ما يخلص بأي نتيجة */
      })
      .then(() => client.auth.dispose());
  } catch {
    /* swallow-ok: عميل ما انبنى أصلاً؛ ماكو تخزين ولا تجديد يوكف */
  }
}
