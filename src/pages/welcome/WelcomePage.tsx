import { Building2, RefreshCw } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { BareFrame } from '../../components/shell/BareFrame';
import { SignOutButton } from '../../components/shell/SignOutButton';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { localDay } from '../../domain/dates';
import type { Invite } from '../../domain/workspace';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtDay, fmtPhone } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import { roleLabel } from '../../lib/roles';
import { session, sessionStore, useSession } from '../../lib/session';

// أوّل دخول بلا منشأة (DECISIONS 2026-10-25): صاحب مزرعة ينشئ منشأته ويصير مالكها، والموظف ينتظر دعوة صاحب
// المنشأة: يعطيه رقمه، ويقبل الدعوة بالرمز اللي يسلّمه بيده. الرفض يخلّي المنشأة تعيد الدعوة؛ «رفض وحظر» ما يخلّيها.

const NAME_MAX = 80;
const ORG_MAX = 120;

type Pending = { kind: 'decline' | 'block'; invite: Invite } | null;

/**
 * القبول أو الإنشاء ممكن صار والشاشة ما تدري: نتيجة مجهولة، أو الإعادة بعدها رجعت invite_not_found (الدعوة انقبلت)
 * أو already_member (المنشأة انخلقت). الخادم يحسم بتأكيد الهويّة، فتنفتح المنشأة اللي دخلها فعلاً.
 */
export function mayHaveJoined(error: unknown): boolean {
  return error instanceof UnknownOutcomeError || (error instanceof RejectedError && (error.code === 'invite_not_found' || error.code === 'already_member'));
}

/** رفض دعوة ممكن صار والشاشة ما تدري: نتيجة مجهولة، أو invite_not_found (رفضة سابقة انحفظت، أو المنشأة سحبتها). */
export function mayHaveDeclined(error: unknown): boolean {
  return error instanceof UnknownOutcomeError || (error instanceof RejectedError && error.code === 'invite_not_found');
}

/** دعوات جديدة فعلاً: معرّف ما كان قبل، مو العدد (دعوة سُحبت وجت غيرها = نفس العدد). */
export function newInvites(before: readonly Invite[], after: readonly Invite[]): Invite[] {
  const known = new Set(before.map((invite) => invite.memberId));
  return after.filter((invite) => !known.has(invite.memberId));
}

function recheck(after?: () => void): void {
  session.refresh().then(after, () => {
    /* swallow-ok: تأكيد بالخلفية بعد نتيجة مجهولة؛ الشاشة تعرض فشل العملية نفسها، و«تحقّق من الدعوات» يعيده */
  });
}

export function InviteCard({ invite, onAsk }: { invite: Invite; onAsk: (kind: 'decline' | 'block') => void }) {
  const id = useId();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const accept = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const clean = code.replace(/\s/g, '');
    if (!/^[0-9]{6}$/.test(clean)) {
      setCodeError(t('invite.code.invalid', 'الرمز 6 أرقام، كما أعطاك إياه صاحب المنشأة.'));
      return;
    }
    setCodeError(null);
    setBusy(true);
    try {
      const result = await session.acceptInvite(invite.memberId, clean);
      if (!result.ok) setCodeError(result.hint);
    } catch (error) {
      setFailure(error);
      if (mayHaveJoined(error)) {
        // الدعوة اختفت والحساب بعده بلا منشأة: سُحبت (البطاقة وتلميحها ينطوون ويّا التحديث، فالسبب بإشعار).
        recheck(() => {
          const next = sessionStore.get();
          if (next.status === 'no_org' && !next.account.invites.some((item) => item.memberId === invite.memberId)) {
            toast({ tone: 'warning', title: t('invite.gone', 'سُحبت هذه الدعوة أو انتهت'), detail: t('invite.gone.detail', 'اطلب من صاحب المنشأة دعوة جديدة إن كنت تنتظرها.') });
          }
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <article className="card flex flex-col gap-4 p-5" data-invite={invite.memberId}>
      <div>
        <h3 className="text-lg font-semibold">
          <Trans k="invite.from" text="دعوة من {org}" vars={{ org: invite.orgName }} />
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          <Trans
            k="invite.details"
            text="بدور {role} وباسم {name}، أُرسلت في {day}."
            vars={{ role: roleLabel(invite.role), name: invite.displayName, day: <span dir="ltr" className="tabular-nums">{fmtDay(localDay(new Date(invite.invitedAt)))}</span> }}
          />
        </p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={(event) => void accept(event)} noValidate>
        <Field id={`${id}-code`} label={t('invite.code', 'رمز الدعوة')} hint={t('invite.code.hint', 'اطلبه من صاحب المنشأة: يعطيك إياه بيده أو بالواتساب.')} error={codeError}>
          <input
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={7}
            className="input text-center text-lg tabular-nums tracking-widest"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={codeError ? true : undefined}
          />
        </Field>
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" busy={busy} data-action="accept-invite">
            {t('invite.accept', 'اقبل الدعوة')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onAsk('decline')} data-action="decline-invite">
            {t('invite.decline', 'ارفض')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => onAsk('block')} data-action="block-invite">
            {t('invite.block', 'ارفض واحظر المنشأة')}
          </Button>
        </div>
      </form>
    </article>
  );
}

/** تأكيد الرفض أو الرفض ويّا الحظر: يسمّي المنشأة وشنو يصير. */
export function DeclineDialog({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const invite = pending?.invite;
  const block = pending?.kind === 'block';
  return (
    <ConfirmDialog
      open={pending !== null}
      title={
        block
          ? t('invite.block.title', 'رفض دعوة {org} وحظرها', { org: invite?.orgName ?? '' })
          : t('invite.decline.title', 'رفض دعوة {org}', { org: invite?.orgName ?? '' })
      }
      consequence={
        block
          ? t('invite.block.consequence', 'تُرفض الدعوة، ولن تستطيع هذه المنشأة دعوتك مرّة أخرى. لا يمكن فكّ الحظر حالياً.')
          : t('invite.decline.consequence', 'تُرفض الدعوة ويبطل رمزها. يستطيع صاحب المنشأة دعوتك من جديد إن كان الرفض خطأً.')
      }
      confirmLabel={block ? t('invite.block.confirm', 'ارفض واحظر') : t('invite.decline.confirm', 'ارفض الدعوة')}
      busy={busy}
      action={block ? 'confirm-block-invite' : 'confirm-decline-invite'}
      onCancel={onDone}
      onConfirm={() => {
        if (!invite) return;
        setBusy(true);
        (block ? session.declineAndBlock(invite.memberId) : session.declineInvite(invite.memberId))
          .then(
            () => toast({ tone: 'success', title: block ? t('invite.blocked', 'رُفضت الدعوة وحُظرت المنشأة') : t('invite.declined', 'رُفضت الدعوة') }),
            (error: unknown) => {
              const { title, detail } = describeError(error, 'once');
              toast({ tone: 'danger', title, detail });
              // الدعوة ممكن انرفضت أو انسحبت: التحديث يشيلها، بدل ما كل محاولة ترجع نفس الرفض.
              if (mayHaveDeclined(error)) recheck();
            },
          )
          .finally(() => {
            setBusy(false);
            onDone();
          });
      }}
    />
  );
}

function CreateOrgForm() {
  const id = useId();
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ org?: string; name?: string }>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: { org?: string; name?: string } = {};
    if (!orgName.trim()) found.org = t('welcome.org.required', 'اكتب اسم المنشأة.');
    if (!name.trim()) found.name = t('welcome.name.required', 'اكتب اسمك.');
    setErrors(found);
    setFailure(null);
    if (found.org || found.name) return;
    setBusy(true);
    try {
      await session.createOrg(orgName.trim(), name.trim());
    } catch (error) {
      setFailure(error);
      if (mayHaveJoined(error)) recheck();
    } finally {
      setBusy(false);
    }
  };

  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">{t('welcome.create.title', 'أنشئ منشأتك')}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t('welcome.create.subtitle', 'إن كنت صاحب المزرعة: تُنشأ منشأتك بوحداتها الست وحساباتها، وتصير مالكها وتدعو موظفيك.')}
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <Field id={`${id}-org`} label={t('welcome.org', 'اسم المنشأة')} hint={t('welcome.org.hint', 'كما يظهر على الفواتير، مثل «مزرعة الأمل».')} error={errors.org}>
          <input
            id={`${id}-org`}
            className="input"
            maxLength={ORG_MAX}
            autoComplete="organization"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            aria-invalid={errors.org ? true : undefined}
          />
        </Field>
        <Field id={`${id}-name`} label={t('welcome.name', 'اسمك')} error={errors.name}>
          <input
            id={`${id}-name`}
            className="input"
            maxLength={NAME_MAX}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        <Button type="submit" busy={busy} icon={<Building2 aria-hidden="true" className="size-4" />} data-action="create-org">
          {t('welcome.create.submit', 'أنشئ المنشأة')}
        </Button>
      </form>
    </section>
  );
}

export default function WelcomePage() {
  const state = useSession();
  const [pending, setPending] = useState<Pending>(null);
  const [checking, setChecking] = useState(false);
  if (state.status !== 'no_org') return null;
  const { account } = state;

  // فشل الشبكة يبقي الشاشة (المكتوب بالنموذج ما يضيع) ويكول السبب؛ وبلا دعوة جديدة يكول ذلك، مو يسكت.
  const check = () => {
    const before = account.invites;
    setChecking(true);
    session
      .refresh()
      .then(
        () => {
          const next = sessionStore.get();
          if (next.status === 'no_org' && newInvites(before, next.account.invites).length === 0) {
            toast({ tone: 'info', title: t('welcome.check.none', 'لا دعوات جديدة بعد'), detail: t('welcome.check.none.detail', 'تأكّد أن صاحب المنشأة دعاك بالرقم الظاهر هنا.') });
          }
        },
        (error: unknown) => {
          const { title, detail } = describeError(error, 'read');
          toast({ tone: 'warning', title, detail });
        },
      )
      .finally(() => setChecking(false));
  };

  return (
    <BareFrame actions={<SignOutButton stamp={null} />}>
      <header>
        <h1 className="text-2xl font-semibold">{t('welcome.title', 'مرحباً بك')}</h1>
        <p className="mt-1 text-ink-muted">
          {t('welcome.subtitle', 'حسابك جاهز. إن كنت موظفاً فاقبل دعوة صاحب المنشأة، وإن كنت صاحب المزرعة فأنشئ منشأتك.')}
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t('welcome.phone.title', 'رقمك في النظام')}</h2>
        {account.phone ? (
          <p dir="ltr" className="text-end text-2xl font-semibold tabular-nums" data-phone>
            {fmtPhone(account.phone)}
          </p>
        ) : (
          <p className="text-ink-muted">{t('welcome.phone.none', 'هذا الحساب بلا رقم هاتف معروف، فلا يستطيع أحد دعوتك به. أنشئ حساباً جديداً برقمك.')}</p>
        )}
        <p className="text-sm text-ink-muted">{t('welcome.phone.hint', 'أعطِ هذا الرقم لصاحب المنشأة ليدعوك، ثم اضغط «تحقّق من الدعوات».')}</p>
        <div>
          <Button variant="secondary" size="sm" busy={checking} icon={<RefreshCw aria-hidden="true" className="size-4" />} onClick={check} data-action="check-invites">
            {t('welcome.check', 'تحقّق من الدعوات')}
          </Button>
        </div>
      </section>

      {account.invites.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label={t('welcome.invites', 'الدعوات')}>
          <h2 className="text-lg font-semibold">{t('welcome.invites', 'الدعوات')}</h2>
          {account.invites.map((invite) => (
            <InviteCard key={invite.memberId} invite={invite} onAsk={(kind) => setPending({ kind, invite })} />
          ))}
        </section>
      ) : null}

      <CreateOrgForm />
      <DeclineDialog pending={pending} onDone={() => setPending(null)} />
    </BareFrame>
  );
}
