import { UnknownOutcomeError } from '../errors';
import { addAuthListener, dropClient, getClient, STORED_SESSION, type AuthListener } from './client';
import { isOnline, isTransientSession, readSession, REQUEST_TIMEOUT_MS, withTimeout } from './core';

// الجلسة بمسار الجلسة الحرج: فحصها بالإقلاع والخروج المحلّي والسمع لتغيّرها. الدخول والتسجيل وجمل أخطائهما بـsignin.ts
// الكسول (المرحلة 1 WP3)، لأن اللي داخل أصلاً ما يحتاجهن قبل أوّل شاشة (DECISIONS «السقوف المقيسة»).

/**
 * حالة الجلسة لحظة الإقلاع (FOUNDATION ٢١٧): بلا جلسة وبلا خطأ = خرج فعلاً؛ وتوكن محفوظ وخطأ شبكة = بلا نت.
 * previousUserId: كان بالجهاز توكن لهذا الحساب والخادم أنهى جلسته (تغيّرت كلمة السرّ، أو خرج من كل الأجهزة)، فهويّته
 * المحفوظة تنمسح والدخول يكول «انتهت جلسة الدخول».
 */
export type SessionProbe =
  | { kind: 'signed_in'; userId: string }
  | { kind: 'signed_out'; previousUserId: string | null }
  | { kind: 'offline'; userId: string };

/** صاحب التوكن المحفوظ بالجهاز (sb-*-auth-token)، حتى الإقلاع بلا نت يفتح بهويّته المحفوظة هو بس. */
function storedUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i);
      if (!name || !STORED_SESSION.test(name)) continue;
      const parsed = JSON.parse(localStorage.getItem(name) ?? 'null') as { user?: { id?: unknown } } | null;
      if (typeof parsed?.user?.id === 'string') return parsed.user.id;
    }
  } catch {
    /* swallow-ok: تخزين ممنوع أو تالف = ماكو توكن محفوظ، والجواب تحت null */
  }
  return null;
}

/** الخروج المحلّي: signOut() بلا نت يرجع خطأ ويخلّي الجلسة، فمفاتيح sb-* تنمسح باليد (FOUNDATION ٢٢٨). */
function removeStoredSession(): void {
  try {
    const names: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i);
      if (name && name.startsWith('sb-')) names.push(name);
    }
    for (const name of names) localStorage.removeItem(name);
  } catch {
    /* swallow-ok: تخزين ممنوع = ماكو جلسة محفوظة تنمسح */
  }
}

/** ميزانية الإقلاع البارد بتوكن محفوظ: auth-js يعيد التجديد بلا نت لحد ٣٠ ثانية قبل ما ترجع getSession. */
export const QUICK_PROBE_MS = 2_500;

/**
 * quick: بتوكن محفوظ ما ننتظر التجديد: بلا نت يرجع offline فوراً، وبالنت بعد QUICK_PROBE_MS؛ والتجديد يكمل بالخلفية
 * ويبلّغ بـTOKEN_REFRESHED (أو SIGNED_OUT لو الخادم رفضه). بلا توكن محفوظ getSession محلّية وسريعة.
 * صاحب التوكن ينقرا قبل ما يبدي العميل: initialize() يمسحه لمّا الخادم يرفض التجديد، وبعدها ما نعرف منو كان.
 */
export async function probeSession(quick = false): Promise<SessionProbe> {
  const stored = storedUserId();
  const db = await getClient();
  if (quick && stored && !isOnline()) return { kind: 'offline', userId: stored };
  let result: Awaited<ReturnType<typeof db.auth.getSession>>;
  try {
    result = await readSession(db, quick && stored ? QUICK_PROBE_MS : REQUEST_TIMEOUT_MS);
  } catch (error) {
    if (!(error instanceof UnknownOutcomeError)) throw error;
    return stored ? { kind: 'offline', userId: stored } : { kind: 'signed_out', previousUserId: null };
  }
  const { data, error } = result;
  if (data.session) return { kind: 'signed_in', userId: data.session.user.id };
  if (stored && isTransientSession(error)) return { kind: 'offline', userId: stored };
  return { kind: 'signed_out', previousUserId: stored };
}

/** العميل يتسحب منه التخزين أوّلاً ثم ينمسح sb-*: طلب /logout متأخّر من العميل القديم ما يمسح جلسة اللي يدخل بعده. */
export async function signOutLocal(): Promise<void> {
  try {
    const db = await getClient();
    await withTimeout(db.auth.signOut({ scope: 'local' }), 5_000);
  } catch {
    /* swallow-ok: بلا نت أو بلا عميل؛ الجلسة تنمسح من الجهاز تحت بكل حال */
  }
  await dropClient();
  removeStoredSession();
}

/** تغيّر الجلسة (دخول، خروج بتبويب ثاني، تجديد) من كل عميل ينبني، مؤجّلاً بـsetTimeout (FOUNDATION ٢٠٣، client.ts). */
export function onAuthChange(listener: AuthListener): () => void {
  return addAuthListener(listener);
}
