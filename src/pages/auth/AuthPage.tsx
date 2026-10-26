import { LogIn, UserPlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { BareFrame } from '../../components/shell/BareFrame';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { normalizePhone } from '../../domain/phone';
import { describeError } from '../../lib/errors';
import { t, Trans } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { session, useSession } from '../../lib/session';
import { useStore } from '../../lib/store';

// الدخول وحساب جديد برقم الهاتف وكلمة سرّ (DECISIONS 2026-10-25). الرقم اسم دخول بس: ماكو SMS يأكّده.
// الأرقام الشرقية تنقلب لحظة الكتابة (digits.ts)، والتحقّق هنا قبل الإرسال بنفس normalizePhone مال الخادم.

export type AuthMode = 'sign_in' | 'sign_up';

/** أقل طول لكلمة السرّ بالواجهة؛ المالك يضبط نفسه بإعدادات الدخول بالمشروع (DECISIONS). */
export const MIN_PASSWORD = 8;

export interface AuthErrors {
  phone?: string;
  password?: string;
  repeat?: string;
}

/** أخطاء الحقول قبل الإرسال. دالّة صافية حتى تنفحص بلا متصفّح. */
export function validateAuth(mode: AuthMode, phone: string, password: string, repeat: string): AuthErrors {
  const errors: AuthErrors = {};
  if (!normalizePhone(phone)) errors.phone = t('auth.phone.invalid', 'اكتب رقم موبايل عراقياً صحيحاً، مثل 07701234567.');
  if (password.length < MIN_PASSWORD) errors.password = t('auth.password.short', 'كلمة السرّ 8 أحرف على الأقل.');
  if (mode === 'sign_up' && repeat !== password) errors.repeat = t('auth.repeat.mismatch', 'كلمتا السرّ غير متطابقتين.');
  return errors;
}

export default function AuthPage() {
  const state = useSession();
  const online = useStore(onlineStore);
  const id = useId();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<AuthErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const expired = state.status === 'signed_out' && state.expired;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateAuth(mode, phone, password, repeat);
    setErrors(found);
    setFailure(null);
    setCreated(false);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      if (mode === 'sign_in') {
        await session.signIn(phone, password);
      } else {
        const { signedIn } = await session.signUp(phone, password);
        if (!signedIn) setCreated(true);
      }
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const failed = failure ? describeError(failure) : null;
  return (
    <BareFrame>
      <section className="card flex flex-col gap-5 p-5">
        <div>
          <h1 className="text-2xl font-semibold">{mode === 'sign_in' ? t('auth.title.sign_in', 'الدخول') : t('auth.title.sign_up', 'حساب جديد')}</h1>
          <p className="mt-1 text-ink-muted">
            {mode === 'sign_in'
              ? t('auth.subtitle.sign_in', 'ادخل برقم هاتفك وكلمة السرّ.')
              : t('auth.subtitle.sign_up', 'رقم هاتفك هو اسم الدخول، ولا تصله أيّ رسالة. بعد إنشاء الحساب تُنشئ منشأتك أو تقبل دعوة صاحبها.')}
          </p>
        </div>
        <Segmented<AuthMode>
          label={t('auth.mode', 'نوع الدخول')}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setErrors({});
            setFailure(null);
            setCreated(false);
          }}
          options={[
            { value: 'sign_in', label: t('auth.title.sign_in', 'الدخول'), icon: LogIn },
            { value: 'sign_up', label: t('auth.title.sign_up', 'حساب جديد'), icon: UserPlus },
          ]}
        />
        {expired ? <Notice tone="warning" title={t('error.identity.title', 'انتهت جلسة الدخول')}>{t('auth.expired', 'ادخل من جديد لتكمل.')}</Notice> : null}
        {!online ? <Notice tone="warning" title={t('auth.offline.title', 'الجهاز غير متّصل')}>{t('auth.offline', 'الدخول يحتاج اتصالاً بالإنترنت.')}</Notice> : null}
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
          <Field id={`${id}-phone`} label={t('auth.phone', 'رقم الهاتف')} hint={<Trans k="auth.phone.hint" text="مثل {sample}" vars={{ sample: <bdi dir="ltr">0770 123 4567</bdi> }} />} error={errors.phone}>
            <input
              id={`${id}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="username"
              dir="ltr"
              className="input tabular-nums"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={errors.phone ? true : undefined}
              data-autofocus
            />
          </Field>
          <Field id={`${id}-password`} label={t('auth.password', 'كلمة السرّ')} error={errors.password}>
            <input
              id={`${id}-password`}
              type="password"
              autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              dir="ltr"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errors.password ? true : undefined}
            />
          </Field>
          {mode === 'sign_up' ? (
            <Field id={`${id}-repeat`} label={t('auth.repeat', 'أعد كتابة كلمة السرّ')} error={errors.repeat}>
              <input
                id={`${id}-repeat`}
                type="password"
                autoComplete="new-password"
                dir="ltr"
                className="input"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                aria-invalid={errors.repeat ? true : undefined}
              />
            </Field>
          ) : null}
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
          {created ? (
            <Notice tone="info" title={t('auth.created.title', 'أُنشئ الحساب')}>
              {t('auth.created', 'الدخول به غير مفعّل بعد في النظام. حاول الدخول لاحقاً، أو تواصل مع الدعم.')}
            </Notice>
          ) : null}
          <Button type="submit" size="lg" busy={busy} data-action={mode === 'sign_in' ? 'sign-in' : 'sign-up'}>
            {mode === 'sign_in' ? t('auth.submit.sign_in', 'ادخل') : t('auth.submit.sign_up', 'أنشئ الحساب')}
          </Button>
        </form>
      </section>
    </BareFrame>
  );
}
