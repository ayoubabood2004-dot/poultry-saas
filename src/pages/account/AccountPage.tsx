import { DoorOpen } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { SignOutButton } from '../../components/shell/SignOutButton';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import type { Invite } from '../../domain/workspace';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtPhone } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import { roleLabel } from '../../lib/roles';
import { session, useSession } from '../../lib/session';
import { DeclineDialog } from '../welcome/WelcomePage';

// حساب الداخل: من هو وبأي منشأة وبأي دور كما أكّده الخادم، ودعوات منشآت ثانية (قبولها يحتاج الخروج من هذه
// أوّلاً: عضوية فعّالة وحدة)، والخروج من المنشأة (إلا آخر مالك)، والخروج من الحساب على الجهاز.

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined} className={ltr ? 'text-end tabular-nums' : 'text-end font-medium'}>
        {value}
      </dd>
    </div>
  );
}

export default function AccountPage() {
  const state = useSession();
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ kind: 'decline' | 'block'; invite: Invite } | null>(null);

  if (state.status !== 'ready') {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t('account.title', 'حسابي')} />
        <Notice tone="info" title={t('error.not_connected.title', 'النظام غير مربوط بقاعدة البيانات بعد')} />
      </div>
    );
  }
  const { workspace, offline } = state;
  const stamp = { userId: workspace.userId, orgId: workspace.orgId, displayName: workspace.displayName };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('account.title', 'حسابي')} actions={<SignOutButton stamp={stamp} />} />
      {offline ? (
        <Notice tone="warning" title={t('account.offline', 'تعمل الآن ببياناتك المحفوظة على هذا الجهاز')}>
          {t('account.offline.detail', 'تتأكّد من الخادم حين يعود الاتصال.')}
        </Notice>
      ) : null}

      <section className="card p-5">
        <dl className="divide-y divide-line">
          <Row label={t('account.name', 'الاسم')} value={workspace.displayName} />
          <Row label={t('account.phone', 'الهاتف')} value={workspace.phone ? fmtPhone(workspace.phone) : '—'} ltr />
          <Row label={t('account.org', 'المنشأة')} value={workspace.orgName} />
          <Row label={t('account.role', 'الدور')} value={roleLabel(workspace.role)} />
        </dl>
      </section>

      {workspace.invites.length > 0 ? (
        <section className="card flex flex-col gap-3 p-5" aria-label={t('welcome.invites', 'الدعوات')}>
          <h2 className="font-semibold">{t('welcome.invites', 'الدعوات')}</h2>
          <p className="text-sm text-ink-muted">
            {t('account.invites.note', 'لقبول دعوة منشأة أخرى اخرج من منشأتك أوّلاً، ثم اقبلها بالرمز.')}
          </p>
          {workspace.invites.map((invite) => (
            <div key={invite.memberId} className="flex flex-col gap-2 rounded-2xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium">
                  <Trans k="invite.from" text="دعوة من {org}" vars={{ org: invite.orgName }} />
                </div>
                <div className="text-sm text-ink-muted">{roleLabel(invite.role)}</div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t('invite.decline.for', 'ارفض دعوة {org}', { org: invite.orgName })}
                  onClick={() => setPending({ kind: 'decline', invite })}
                  data-action="decline-invite"
                >
                  {t('invite.decline', 'ارفض')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('invite.block.for', 'ارفض واحظر المنشأة: {org}', { org: invite.orgName })}
                  onClick={() => setPending({ kind: 'block', invite })}
                  data-action="block-invite"
                >
                  {t('invite.block', 'ارفض واحظر المنشأة')}
                </Button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="card flex flex-col items-start gap-3 p-5">
        <h2 className="font-semibold">{t('account.leave.heading', 'الخروج من المنشأة')}</h2>
        <p className="text-sm text-ink-muted">
          {t('account.leave.about', 'تفقد الوصول إلى بيانات المنشأة، ويبقى اسمك في سجلّها. لا ترجع إليها إلا بدعوة جديدة من صاحبها.')}
        </p>
        <Button variant="danger" size="sm" icon={<DoorOpen aria-hidden="true" className="size-4" />} disabled={offline} onClick={() => setLeaving(true)} data-action="leave-org">
          {t('account.leave', 'اخرج من المنشأة')}
        </Button>
      </section>

      <ConfirmDialog
        open={leaving}
        title={t('account.leave.title', 'الخروج من {org}', { org: workspace.orgName })}
        consequence={t('account.leave.consequence', 'تفقد الوصول إلى بيانات {org} فوراً. آخر مالك لا يستطيع الخروج قبل أن يضيف مالكاً آخر.', { org: workspace.orgName })}
        confirmLabel={t('account.leave.confirm', 'اخرج من المنشأة')}
        busy={busy}
        action="confirm-leave-org"
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setBusy(true);
          session
            .leaveOrg()
            .then(
              () => toast({ tone: 'success', title: t('account.left', 'خرجت من المنشأة') }),
              (error: unknown) => {
                const { title, detail } = describeError(error, 'once');
                toast({ tone: 'danger', title, detail });
                // ممكن خرج والجواب ضاع (أو الإعادة رجعت not_member): الخادم يحسم.
                if (error instanceof UnknownOutcomeError || (error instanceof RejectedError && error.code === 'not_member')) {
                  session.refresh().catch(() => {
                    /* swallow-ok: تأكيد بالخلفية؛ الرسالة فوك تكول إن النتيجة غير معروفة */
                  });
                }
              },
            )
            .finally(() => {
              setBusy(false);
              setLeaving(false);
            });
        }}
      />
      <DeclineDialog pending={pending} onDone={() => setPending(null)} />
    </div>
  );
}
