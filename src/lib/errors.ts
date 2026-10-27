import { t } from './i18n';

// «ما وصلنا للخادم» غير «مرفوض» غير «ما نعرف شنو صار»، وكل رسالة تكول للمستخدم شنو الآمن.

/** القاعدة بعدها ما انربطت (مؤجّلة بكلمة المالك). */
export class NotConnectedError extends Error {
  constructor() {
    super('not_connected');
    this.name = 'NotConnectedError';
  }
}

/** الطلب ما طلع من الجهاز أو ما وصل: أكيد ما انحفظ شي. */
export class NetworkError extends Error {
  constructor(message = 'network') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** الطلب طلع وجوابه ما رجع: ممكن انحفظ. الإعادة بنفس المرجع (client_ref) ما تضاعف. */
export class UnknownOutcomeError extends Error {
  constructor(message = 'unknown_outcome') {
    super(message);
    this.name = 'UnknownOutcomeError';
  }
}

/**
 * المعاملة رجعت لأنها تزاحمت ويّا عملية ثانية على نفس البيانات (قفل متبادل 40P01 أو انتهت مهلة القفل 55P03): أكيد
 * ما انحفظ شي، والإعادة بنفس المرجع آمنة (الخطّة §2.3).
 */
export class RetryableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RetryableError';
  }
}

/**
 * رفض مقصود من الخادم: raise exception '<code>' using hint = '<جملة عربية>'. ورفض قيد check (23514) يحمل اسم القيد
 * (constraint)، وجملته من القاموس الكسول بـlib/repo (explained بـcore.ts)، فالقاموس برّا مسار الجلسة الحرج.
 */
export class RejectedError extends Error {
  constructor(
    readonly code: string,
    readonly hint: string | null,
    readonly constraint: string | null = null,
  ) {
    super(code);
    this.name = 'RejectedError';
  }
}

/**
 * الخادم ما يعرف هالدخول (401، 42501 على دالّة، PGRST301، أو not_signed_in لحساب انحذف أو انوقف). مو فشل شبكة:
 * الجلسة تنتهي والشاشة ترجع للدخول، وعمليات الطابور تنتظر الدخول الجديد بلا ما تنحسب محاولة.
 */
export class IdentityError extends Error {
  constructor(
    readonly code: string,
    readonly hint: string | null = null,
  ) {
    super(code);
    this.name = 'IdentityError';
  }
}

/** كتابة رجعت بلا خطأ وبصفر صفوف: سياسة ردّتها بصمت. ما انحفظ شي. */
export class ZeroRowsError extends Error {
  constructor() {
    super('zero_rows');
    this.name = 'ZeroRowsError';
  }
}

export type ErrorKind = 'not_connected' | 'network' | 'retryable' | 'unknown_outcome' | 'rejected' | 'identity' | 'zero_rows' | 'unexpected';

export interface ErrorDescription {
  kind: ErrorKind;
  title: string;
  detail: string;
}

/**
 * شنو كان الطلب، لأن «ما نعرف شنو صار» يختلف: write كتابة بمرجع client_ref (الإعادة ما تضاعف)؛ once كتابة بلا مرجع
 * (دوالّ الموظفين والدعوة: الإعادة ترجع «صارت» مثل already_in_org، فالرسالة تكول «تحقّق قبل الإعادة»)؛ read قراءة
 * (ما تغيّر شي، فـ«نتيجة العملية» ما إلها معنى).
 */
export type ErrorContext = 'write' | 'once' | 'read';

export function describeError(error: unknown, context: ErrorContext = 'write'): ErrorDescription {
  if (error instanceof NotConnectedError) {
    return {
      kind: 'not_connected',
      title: t('error.not_connected.title', 'النظام غير مربوط بقاعدة البيانات بعد'),
      detail: t('error.not_connected.detail', 'ستظهر البيانات بعد ربط قاعدة البيانات.'),
    };
  }
  if (error instanceof NetworkError) {
    return {
      kind: 'network',
      title: t('error.network.title', 'تعذّر الوصول إلى الخادم'),
      detail:
        context === 'read'
          ? t('error.network.read', 'حاول مرّة أخرى عند عودة الاتصال.')
          : t('error.network.detail', 'لم يُحفظ شيء. حاول مرّة أخرى عند عودة الاتصال.'),
    };
  }
  if (error instanceof RetryableError) {
    if (context === 'read') {
      return {
        kind: 'retryable',
        title: t('error.retryable.read.title', 'تعذّر التحميل، أعد المحاولة'),
        detail: t('error.retryable.read', 'تزامن الطلب مع عملية أخرى على البيانات نفسها. أعد المحاولة.'),
      };
    }
    return {
      kind: 'retryable',
      title: t('error.retryable.title', 'لم يُرحَّل، أعد المحاولة'),
      detail: t('error.retryable.detail', 'تزامنت العملية مع عملية أخرى على البيانات نفسها، فلم يُحفظ شيء. أعد المحاولة.'),
    };
  }
  if (error instanceof UnknownOutcomeError) {
    if (context === 'read') {
      return {
        kind: 'unknown_outcome',
        title: t('error.unknown_outcome.read.title', 'لم يصل ردّ الخادم'),
        detail: t('error.unknown_outcome.read', 'لم يتغيّر شيء. أعد المحاولة.'),
      };
    }
    if (context === 'once') {
      return {
        kind: 'unknown_outcome',
        title: t('error.unknown_outcome.title', 'نتيجة العملية غير معروفة'),
        detail: t('error.unknown_outcome.once', 'أُرسل الطلب ولم يصل ردّه، وقد تكون العملية تمّت. تحقّق قبل أن تعيدها.'),
      };
    }
    return {
      kind: 'unknown_outcome',
      title: t('error.unknown_outcome.title', 'نتيجة العملية غير معروفة'),
      detail: t('error.unknown_outcome.detail', 'أُرسل الطلب ولم يصل ردّه. أعد المحاولة: لن تتكرّر العملية مرّتين.'),
    };
  }
  if (error instanceof RejectedError) {
    // قراءة رجعت رفضاً بلا تلميح (خطأ خادم برمزه): ماكو «عملية» ولا شي ينحفظ.
    if (context === 'read' && !error.hint) {
      return {
        kind: 'rejected',
        title: t('error.rejected.read.title', 'تعذّر التحميل'),
        detail: t('error.rejected.read', 'أعد المحاولة بعد قليل (الرمز: {code}).', { code: error.code }),
      };
    }
    return {
      kind: 'rejected',
      title: t('error.rejected.title', 'الخادم رفض العملية'),
      detail: error.hint || t('error.rejected.detail', 'لم يُحفظ شيء (الرمز: {code}).', { code: error.code }),
    };
  }
  if (error instanceof IdentityError) {
    return {
      kind: 'identity',
      title: t('error.identity.title', 'انتهت جلسة الدخول'),
      detail: error.hint || t('error.identity.detail', 'ادخل من جديد. لم يُحفظ شيء.'),
    };
  }
  if (error instanceof ZeroRowsError) {
    return {
      kind: 'zero_rows',
      title: t('error.zero_rows.title', 'لم يُحفظ'),
      detail: t('error.zero_rows.detail', 'لم يغيّر الخادم أيّ صفّ. حدّث الشاشة وتأكّد من صلاحيتك.'),
    };
  }
  return {
    kind: 'unexpected',
    title: t('error.unexpected.title', 'حدث خطأ غير متوقّع'),
    detail:
      context === 'read'
        ? t('error.unexpected.read', 'أعد المحاولة، وإن تكرّر فأعد فتح الصفحة.')
        : t('error.unexpected.detail', 'لا نعرف إن كان قد حُفظ شيء. حدّث الشاشة وتحقّق قبل الإعادة.'),
  };
}
