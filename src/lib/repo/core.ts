import type { SupabaseClient } from '@supabase/supabase-js';
import { IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError, UnknownOutcomeError, ZeroRowsError } from '../errors';
import { t } from '../i18n';
import { getClient } from './client';

// lib/repo هو الوصول الوحيد للقاعدة، ملف لكل وحدة: سياسة الأخطاء والمهلة وبوابة الاشتراك والطابور بمكان واحد.
// بـdoctorVet خلل واحد بهاي النقطة وصل ٢١ موضعاً، والإصلاح بيها صلّحهم كلهم.
// بلا مفاتيح القاعدة (بناء محلّي أو فحص) كل طلب يرمي NotConnectedError والشاشة تكول ذلك بصوت.

export const REQUEST_TIMEOUT_MS = 15_000;

/** القاعدة بعدها ما انربطت. */
export function notConnected(): never {
  throw new NotConnectedError();
}

/** كل كتابة مباشرة تمرّ من هنا: ترمي على الخطأ وعلى صفر صفوف (والمصفوفة الفارغة صفر صفوف). */
export function updatedRows<T>(result: { data: T | T[] | null; error: unknown }): T[] {
  if (result.error) throw result.error;
  const rows = result.data === null ? [] : Array.isArray(result.data) ? result.data : [result.data];
  if (rows.length === 0) throw new ZeroRowsError();
  return rows;
}

/** كل طلب بمهلة. انتهاء المهلة = «ما نعرف شنو صار»، مو «ما انحفظ». */
export function withTimeout<T>(promise: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new UnknownOutcomeError('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** خطأ PostgREST كما يرجّعه supabase-js (ما يرمي: يرجّع { error, status }). */
export interface PostgrestFailure {
  code?: string;
  message?: string;
  hint?: string | null;
}

/** اسم القيد من رسالة بوستغريس: «new row for relation "x" violates check constraint "x_check"». */
export function violatedConstraint(message: string | undefined): string | null {
  return /check constraint "([^"]+)"/.exec(message ?? '')?.[1] ?? null;
}

/** اسم القيد الفريد المكسور (23505): مفتاح الصفّ (إعادة بمعرّف الجهاز = انكتب) غير مفتاح ثاني (مادّة مكرّرة بالجرد). */
export function violatedUnique(message: string | undefined): string | null {
  return /unique constraint "([^"]+)"/.exec(message ?? '')?.[1] ?? null;
}

/** جملة القيد المجهول (أو حين يتعذّر تحميل القاموس): تسمّيه، والشاشة ما تسكت بيها. */
export function unknownConstraint(name: string | null): string {
  return t('constraint.unknown', 'رفضت قاعدة البيانات قيمةً لا تحقّق الشرط «{name}»، فلم يُحفظ شيء.', { name: name ?? '?' });
}

/**
 * رفض قيد check بلا جملته يرجع بجملته من القاموس (constraints.ts). القاموس كسول (import()): جمله لكل الوحدات تكبر بكل
 * حزمة، وبمسار الجلسة الحرج كانت تتحمّل لكل مستخدم قبل أوّل شاشة (DECISIONS «السقوف المقيسة»)، والقيد ما ينخرق إلا من
 * كتابة. تعذّر تحميله (بلا نت ولا تثبيت مسبق) جملة عامة تسمّي القيد. أي خطأ ثاني يرجع كما هو.
 */
export async function explained(error: unknown): Promise<unknown> {
  if (!(error instanceof RejectedError) || error.code !== 'check_violation' || error.hint !== null) return error;
  let hint: string;
  try {
    hint = (await import('./constraints')).constraintHint(error.constraint);
  } catch { // swallow-ok: القاموس ما انحمّل، فالجملة العامة باسم القيد مكانه
    hint = unknownConstraint(error.constraint);
  }
  return new RejectedError('check_violation', hint, error.constraint);
}

/** الجهاز كان متّصلاً لحظة الإرسال: فشل الطلب بعدها «ما نعرف شنو صار»، وبلا اتصال «ما وصل». */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/**
 * يصنّف خطأ PostgREST لأصناف errors.ts. kind يفرّق 42501: على دالّة = الدور ما إله EXECUTE (توكن anon أو منتهٍ) =
 * هويّة؛ على جدول = سياسة RLS ردّت = رفض. والرفض المقصود P0001 برمزه (message) وتلميحه العربي (hint).
 * البوّابة أو PostgREST اللي ما وصل القاعدة مو «رفض» (المراجعة الثانية): PGRST000-003 و503 بلا رمز = الجملة ما
 * تنفّذت؛ 502 و504 و520-527 = ممكن تنفّذت والجواب ضاع. و500 برمز بوستغريس رفض حقيقي (المعاملة رجعت).
 */
export function classifyPostgrest(error: PostgrestFailure, status: number, kind: 'rpc' | 'table', wasOnline: boolean): Error {
  const code = error.code ?? '';
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || (kind === 'rpc' && code === '42501')) {
    return new IdentityError(code || 'unauthorized');
  }
  if (code === 'P0001') {
    const reason = error.message || 'rejected';
    if (reason === 'not_signed_in') return new IdentityError(reason, error.hint || null);
    return new RejectedError(reason, error.hint || null);
  }
  // تزاحم على قفل (قفل متبادل أو مهلة القفل): المعاملة رجعت كلها، والإعادة بنفس المرجع آمنة (الخطّة §2.3).
  if (code === '40P01' || code === '55P03') return new RetryableError(code);
  // قيد check: باسمه، وجملته الفصيحة من القاموس الكسول (explained)، مو «الخادم رفض (23514)» (FOUNDATION ٨٠٨).
  if (code === '23514') return new RejectedError('check_violation', null, violatedConstraint(error.message));
  if (code === '23505') return new RejectedError(code, null, violatedUnique(error.message));
  if (/^PGRST00[0-3]$/.test(code) || (status === 503 && !code)) return new NetworkError('db_unavailable');
  if (status === 502 || status === 504 || (status >= 520 && status <= 527)) return wasOnline ? new UnknownOutcomeError('gateway') : new NetworkError();
  // fetch ما كمل (supabase-js يرجّع status 0 بلا رمز): بلا اتصال ما طلع، وبالاتصال ممكن وصل.
  if (status === 0) return wasOnline ? new UnknownOutcomeError('fetch_failed') : new NetworkError();
  return new RejectedError(code || 'http_error', null);
}

/** خطأ GoTrue عابر: الطلب ما وصل (بلا نت أو انقطع بنصّه)، مو رفض للجلسة. */
export function isRetryableAuth(error: { name?: string; status?: number } | null | undefined): boolean {
  return !!error && (error.name === 'AuthRetryableFetchError' || error.status === 0);
}

/**
 * قراءة الجلسة فشلت عابراً: الطلب ما وصل، أو تبويب ثاني سبق بالتجديد بنفس اللحظة (auth-js بلا أقفال يرجّع
 * AuthRefreshDiscardedError، وجلسة الرابح صارت بالتخزين). المراجعة الثانية: رجوع الاتصال بتبويبين طلّع الاثنين.
 */
export function isTransientSession(error: { name?: string; status?: number } | null | undefined): boolean {
  return isRetryableAuth(error) || error?.name === 'AuthRefreshDiscardedError';
}

/** بلا نت، انتظار getSession ما يفيد (auth-js يعيد التجديد لحد ٣٠ ثانية): الطلب ما يطلع بكل حال. */
export const OFFLINE_SESSION_MS = 1_000;

type SessionRead = Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;

/**
 * getSession، ومرّة ثانية إذا رجعت null ويّا خطأ مو شبكة: الخسران بسباق التجديد يلقى جلسة الرابح بالقراءة الثانية،
 * والجلسة الميّتة فعلاً (auth-js مسحها) ترجع null بلا خطأ.
 */
export async function readSession(db: SupabaseClient, ms: number = REQUEST_TIMEOUT_MS): Promise<SessionRead> {
  const first = await withTimeout(db.auth.getSession(), ms);
  if (first.data.session || !first.error || isRetryableAuth(first.error)) return first;
  return withTimeout(db.auth.getSession(), ms);
}

export interface Authed {
  db: SupabaseClient;
  userId: string;
}

/**
 * العميل بعد التأكّد إن الطلب يطلع بتوكن المستخدم (FOUNDATION ٢١٩). supabase-js بلا جلسة يبعث بمفتاح anon، ورفضه
 * يبين «انتهت الجلسة» فيطلّع المستخدم على فشل تجديد عابر: auth-js يخبّي فشل التجديد دقيقة، وكل getSession بيها
 * ترجع null ويّا خطأ شبكة. فبلا جلسة ويّا خطأ عابر = الطلب ما طلع (NetworkError)، وبلا جلسة بلا خطأ عابر = هويّة.
 * ومهلة getSession نفسها «ما وصل» مو «ما نعرف»: الطلب ما طلع من الجهاز بعد.
 */
export async function authed(): Promise<Authed> {
  const db = await getClient();
  let found: SessionRead;
  try {
    found = await readSession(db, isOnline() ? REQUEST_TIMEOUT_MS : OFFLINE_SESSION_MS);
  } catch (error) {
    if (error instanceof UnknownOutcomeError) throw new NetworkError('session_timeout');
    throw error;
  }
  const { data, error } = found;
  if (data.session) return { db, userId: data.session.user.id };
  if (isTransientSession(error)) throw new NetworkError();
  throw new IdentityError('no_session');
}

/** جواب PostgREST كما يرجّعه supabase-js. */
export interface Answer {
  error: PostgrestFailure | null;
  status: number;
}

/**
 * JWT مرفوض والجهاز يحسبه صالحاً: ساعة الجهاز متأخّرة عن الخادم، أو توكن محفوظ بآخر ثوانيه بعد تجديد فشل عابراً
 * (auth-js يرجّعه بلا خطأ). مو دليل إن الجلسة ماتت.
 */
function jwtRejected(answer: Answer): boolean {
  const code = answer.error?.code ?? '';
  return answer.error !== null && (answer.status === 401 || code === 'PGRST301' || code === 'PGRST303');
}

/** تجديد واحد بعد JWT مرفوض. فشل عابر = ما وصل؛ رفض = هويّة (refresh token ميّت). */
async function renew(db: SupabaseClient): Promise<void> {
  let result: Awaited<ReturnType<SupabaseClient['auth']['refreshSession']>>;
  try {
    result = await withTimeout(db.auth.refreshSession());
  } catch (error) {
    if (error instanceof UnknownOutcomeError) throw new NetworkError('refresh_timeout');
    throw error;
  }
  if (result.data.session) return;
  if (isTransientSession(result.error)) throw new NetworkError();
  throw new IdentityError('refresh_rejected');
}

/**
 * يبعث بتوكن المستخدم وبمهلة. JWT مرفوض بأوّل مرّة: تجديد واحد وإعادة واحدة، وهذا آمن حتى للكتابة لأن PostgREST
 * يرفض التوكن قبل ما ينفّذ شي. wasOnline ينقاس لحظة الإرسال، مو قبل انتظار الجلسة (كتابة انحفظت وضاع جوابها كانت
 * تنعرض «لم يُحفظ شيء» لأن الجهاز كان بلا نت قبل ثواني).
 */
export async function send<R>(make: (db: SupabaseClient) => PromiseLike<R>, answers: (result: R) => readonly Answer[]): Promise<{ result: R; wasOnline: boolean }> {
  const { db } = await authed();
  let wasOnline = isOnline();
  let result = await withTimeout(make(db));
  if (answers(result).some(jwtRejected)) {
    await renew(db);
    wasOnline = isOnline();
    result = await withTimeout(make(db));
  }
  return { result, wasOnline };
}

/** نداء دالّة بالقاعدة (POST): بتوكن المستخدم وبمهلة، والخطأ مصنّف. الشاشات تنادي دوالّ الملفات، مو هذا مباشرة. */
export async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { result, wasOnline } = await send(
    (db) => db.rpc(fn, args),
    (answer) => [answer],
  );
  if (result.error) throw await explained(classifyPostgrest(result.error, result.status, 'rpc', wasOnline));
  return result.data as T;
}
