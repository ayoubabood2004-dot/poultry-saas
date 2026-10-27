import { loginEmail } from '../../domain/phone';
import { NetworkError, RejectedError, UnknownOutcomeError } from '../errors';
import { t } from '../i18n';
import { getClient } from './client';
import { isOnline, isRetryableAuth, withTimeout } from './core';

// الدخول برقم الهاتف وكلمة سرّ بلا SMS (DECISIONS 2026-10-25): الحساب بريد «الرقم الموحّد@phone.login» يبنيه
// loginEmail وحده، والخادم يعدّ هذا الشكل بس. أخطاء GoTrue تتحوّل لأصناف errors.ts بتلميح فصيح، لأن نصّها
// الإنكليزي («Invalid login credentials») يطلع «خطأ غير متوقّع» لو مرّ كما هو.
//
// ملف كسول (المرحلة 1 WP3): الدخول والتسجيل وجملهما ما يحتاجها غير اللي يدخل، وبـauth.ts كانت بمسار الجلسة الحرج لكل
// مستخدم قبل أوّل شاشة (DECISIONS «السقوف المقيسة»). session.tsx يحمّله بـimport() لحظة الدخول، وindex ما يصدّره.

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
