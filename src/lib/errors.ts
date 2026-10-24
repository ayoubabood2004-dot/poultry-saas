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

/** رفض مقصود من الخادم: raise exception '<code>' using hint = '<جملة عربية>'. */
export class RejectedError extends Error {
  constructor(
    readonly code: string,
    readonly hint: string | null,
  ) {
    super(code);
    this.name = 'RejectedError';
  }
}

/** كتابة رجعت بلا خطأ وبصفر صفوف: سياسة ردّتها بصمت. ما انحفظ شي. */
export class ZeroRowsError extends Error {
  constructor() {
    super('zero_rows');
    this.name = 'ZeroRowsError';
  }
}

export type ErrorKind = 'not_connected' | 'network' | 'unknown_outcome' | 'rejected' | 'zero_rows' | 'unexpected';

export interface ErrorDescription {
  kind: ErrorKind;
  title: string;
  detail: string;
}

export function describeError(error: unknown): ErrorDescription {
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
      detail: t('error.network.detail', 'لم يُحفظ شيء. حاول مرّة أخرى عند عودة الاتصال.'),
    };
  }
  if (error instanceof UnknownOutcomeError) {
    return {
      kind: 'unknown_outcome',
      title: t('error.unknown_outcome.title', 'نتيجة العملية غير معروفة'),
      detail: t('error.unknown_outcome.detail', 'أُرسل الطلب ولم يصل ردّه. أعد المحاولة: لن تتكرّر العملية مرّتين.'),
    };
  }
  if (error instanceof RejectedError) {
    return {
      kind: 'rejected',
      title: t('error.rejected.title', 'الخادم رفض العملية'),
      detail: error.hint ?? t('error.rejected.detail', 'لم يُحفظ شيء (الرمز: {code}).', { code: error.code }),
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
    detail: t('error.unexpected.detail', 'لا نعرف إن كان قد حُفظ شيء. حدّث الشاشة وتحقّق قبل الإعادة.'),
  };
}
