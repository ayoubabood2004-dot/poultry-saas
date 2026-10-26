import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { countForm } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { openOutbox, summarize, type Stamp } from '../../lib/outbox';
import { session } from '../../lib/session';
import { useStore } from '../../lib/store';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

// الخروج بجهاز مشترك (FOUNDATION ٢٢٨): يسأل أوّلاً ويكول شنو يبقى. الجولات اللي ما انرفعت ما تنمسح: تبقى
// مختومة باسم صاحبها وترتفع لمّا يدخل. وبلا نت ينبّه إن الدخول من جديد يحتاج اتصالاً.

function PendingRounds({ count }: { count: number }) {
  if (count === 1) return <>{t('signout.pending.one', 'لديك جولة واحدة لم تُرسل بعد؛ تبقى محفوظة باسمك على هذا الجهاز وتُرسل حين تدخل من جديد.')}</>;
  if (count === 2) return <>{t('signout.pending.two', 'لديك جولتان لم تُرسلا بعد؛ تبقيان محفوظتين باسمك على هذا الجهاز وتُرسلان حين تدخل من جديد.')}</>;
  const form = countForm(count);
  if (form === 'few') return <Trans k="signout.pending.few" text="لديك {n} جولات لم تُرسل بعد؛ تبقى محفوظة باسمك على هذا الجهاز وتُرسل حين تدخل من جديد." vars={{ n: count }} />;
  if (form === 'many') return <Trans k="signout.pending.many" text="لديك {n} جولةً لم تُرسل بعد؛ تبقى محفوظة باسمك على هذا الجهاز وتُرسل حين تدخل من جديد." vars={{ n: count }} />;
  return <Trans k="signout.pending.hundreds" text="لديك {n} جولة لم تُرسل بعد؛ تبقى محفوظة باسمك على هذا الجهاز وتُرسل حين تدخل من جديد." vars={{ n: count }} />;
}

export function SignOutButton({ stamp }: { stamp: Stamp | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ key: string; count: number } | null>(null);
  const online = useStore(onlineStore);
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  const key = `${userId}:${orgId}`;

  useEffect(() => {
    if (!open || !userId || !orgId) return;
    let cancelled = false;
    openOutbox()
      .then((db) => summarize(db, { userId, orgId, displayName }))
      .then(
        (summary) => {
          if (!cancelled) setPending({ key, count: summary.mine });
        },
        () => {
          /* swallow-ok: عدّ الجولات تعذّر؛ التأكيد يبين بلا عدد، والجولات نفسها ما تنمسح بالخروج */
        },
      );
    return () => {
      cancelled = true;
    };
  }, [open, userId, orgId, displayName, key]);

  const count = pending?.key === key ? pending.count : 0;

  return (
    <>
      <Button variant="secondary" size="sm" icon={<LogOut aria-hidden="true" className="size-4" />} onClick={() => setOpen(true)} data-action="sign-out">
        {t('signout.button', 'خروج')}
      </Button>
      <ConfirmDialog
        open={open}
        title={t('signout.title', 'الخروج من الحساب على هذا الجهاز')}
        consequence={
          <div className="flex flex-col gap-2">
            <p>{t('signout.consequence', 'تُغلق الجلسة على هذا الجهاز، وتبقى بياناتك محفوظة في الخادم.')}</p>
            {count > 0 ? (
              <p className="font-medium text-warn-800 dark:text-warn-200">
                <PendingRounds count={count} />
              </p>
            ) : null}
            {!online ? (
              <p className="font-medium text-warn-800 dark:text-warn-200">
                {t('signout.offline', 'الجهاز غير متّصل الآن: الدخول من جديد يحتاج اتصالاً، فلن يستطيع أحد الدخول على هذا الجهاز حتى يعود الاتصال.')}
              </p>
            ) : null}
          </div>
        }
        confirmLabel={t('signout.confirm', 'اخرج من الحساب')}
        busy={busy}
        action="confirm-sign-out"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setBusy(true);
          void session.signOut().finally(() => {
            setBusy(false);
            setOpen(false);
          });
        }}
      />
    </>
  );
}
