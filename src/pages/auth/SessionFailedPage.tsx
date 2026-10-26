import { BareFrame } from '../../components/shell/BareFrame';
import { PageFailed } from '../../components/shell/RouteErrorBoundary';
import { SignOutButton } from '../../components/shell/SignOutButton';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { describeError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { recoveryStore } from '../../lib/pwa/recovery';
import { session, useSession } from '../../lib/session';
import { useStore } from '../../lib/store';

// الحساب داخل والخادم ما أكّد هويّته: رفض غير متوقّع، أو بلا نت وبلا هويّة محفوظة (أوّل فتح على هذا الجهاز).
// ماكو خروج تلقائي (فشل الشبكة ما يطلّع أحد، FOUNDATION ٢٠٣): «أعد المحاولة»، والخروج بإيده.
// حزمة ما انحمّلت (نشر جديد أو شبكة): «أعد المحاولة» يرجع نفس الفشل، فالصفحة تعرض حالة التعافي بزرّ إعادة الفتح.

export default function SessionFailedPage() {
  const state = useSession();
  const recovery = useStore(recoveryStore);
  const error = state.status === 'failed' ? state.error : null;
  const stale = recovery !== 'idle' || describeError(error).kind === 'unexpected';
  return (
    <BareFrame actions={<SignOutButton stamp={null} />}>
      {stale ? <PageFailed error={error} /> : <LoadFailed what={t('session.what', 'بيانات حسابك')} error={error} onRetry={() => void session.boot()} />}
    </BareFrame>
  );
}
