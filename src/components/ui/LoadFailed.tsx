import { RefreshCw, TriangleAlert } from 'lucide-react';
import { describeError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { Button } from './Button';

// الفاشل مو فارغ: القائمة rows: T[] | null ويّا الخطأ، و«ماكو» ينكال بس بعد قراءة ناجحة كاملة.
// بـdoctorVet عيادة شافت «ماكو منتج» عن مادّة برفّها فرجعت دخّلتها.

export interface LoadFailedProps {
  /** شنو اللي ما انعرف: «قائمة المخازن». */
  what: string;
  error: unknown;
  onRetry: () => void;
}

export function LoadFailed({ what, error, onRetry }: LoadFailedProps) {
  // قراءة: «ما تغيّر شي»، مو «نتيجة العملية غير معروفة».
  const description = describeError(error, 'read');
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 p-5">
      <div className="flex items-center gap-2 font-semibold text-danger-700 dark:text-danger-200">
        <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
        {t('load_failed.title', 'تعذّر تحميل {what}', { what })}
      </div>
      <p className="text-sm text-ink-muted">
        {description.title}. {description.detail}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw aria-hidden="true" className="size-4" />} data-action="retry">
        {t('load_failed.retry', 'أعد المحاولة')}
      </Button>
    </div>
  );
}
