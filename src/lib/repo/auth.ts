import { loginEmail } from '../../domain/phone';
import { NetworkError, RejectedError, UnknownOutcomeError } from '../errors';
import { t } from '../i18n';
import { addAuthListener, dropClient, getClient, STORED_SESSION, type AuthListener } from './client';
import { isOnline, isRetryableAuth, isTransientSession, readSession, REQUEST_TIMEOUT_MS, withTimeout } from './core';

// الدخول برقم الهاتف وكلمة سرّ بلا SMS (DECISIONS 2026-10-25): الحساب بريد «الرقم الموحّد@phone.login» يبنيه
// loginEmail وحده، والخادم يعدّ هذا الشكل بس. أخطاء GoTrue تتحوّل لأصناف errors.ts بتلميح فصيح، لأن نصّها
// الإنكليزي («Invalid login credentials») يطلع «خطأ غير متوقّع» لو مرّ كما هو.

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

interface AuthFailure {
  name?: string;
  code?: string;
  status?: number;
}

/** خطأ GoTrue لصنفه، بتلميح فصيح. */
export function mapAuthError(error: AuthFailure, wasOnline: boolean): Error {
  if (isRetryableAuth(error)) {
    return wasOnline ? new UnknownOutcomeError('auth_fetch_failed') : new NetworkError();
  }
  switch (error.code) {
    case 'invalid_credentials':
      return new RejectedError('invalid_credentials', t('auth.error.invalid_credentials', 'رقم الهاتف أو كلمة السرّ غير صحيحة.'));
    case 'user_already_exists':
    case 'email_exists':
      return new RejectedError('user_already_exists', t('auth.error.exists', 'هذا الرقم مسجّل بالفعل. ادخل به من «الدخول».'));
    case 'weak_password':
      return new RejectedError('weak_password', t('auth.error.weak_password', 'كلمة السرّ ضعيفة. اكتب 8 أحرف أو أكثر، وتجنّب الأرقام المتتالية.'));
    case 'email_not_confirmed':
      return new RejectedError('not_confirmed', t('auth.error.not_confirmed', 'هذا الحساب لم يُفعَّل بعد، فلا يمكن الدخول به الآن. تواصل مع الدعم.'));
    case 'signup_disabled':
      return new RejectedError('signup_disabled', t('auth.error.signup_disabled', 'إنشاء الحسابات مغلق حالياً. تواصل مع الدعم.'));
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new RejectedError('rate_limited', t('auth.error.rate_limited', 'محاولات كثيرة متتالية. انتظر بضع دقائق ثم أعد المحاولة.'));
    default:
      return new RejectedError(error.code || 'auth_failed', t('auth.error.failed', 'تعذّر إتمام الطلب. أعد المحاولة، وإن تكرّر فتواصل مع الدعم.'));
  }
}

function emailFor(phone: string): string {
  const email = loginEmail(phone);
  if (!email) throw new RejectedError('invalid_phone', t('auth.error.invalid_phone', 'اكتب رقم موبايل عراقياً صحيحاً، مثل 07701234567.'));
  return email;
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

export async function signIn(phone: string, password: string): Promise<string> {
  const email = emailFor(phone);
  const db = await getClient();
  const wasOnline = isOnline();
  const { data, error } = await withTimeout(db.auth.signInWithPassword({ email, password }));
  if (error) throw mapAuthError(error, wasOnline);
  return data.user.id;
}

/** حساب جديد. signedIn خطأ لمّا «Confirm email» بعده مفعّل بالمشروع: الحساب انخلق وما يدخل لحد ما يتفعّل. */
export async function signUp(phone: string, password: string): Promise<{ userId: string | null; signedIn: boolean }> {
  const email = emailFor(phone);
  const db = await getClient();
  const wasOnline = isOnline();
  const { data, error } = await withTimeout(db.auth.signUp({ email, password }));
  if (error) throw mapAuthError(error, wasOnline);
  return { userId: data.user?.id ?? null, signedIn: data.session !== null };
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
