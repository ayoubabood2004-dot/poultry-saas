import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { t } from '../lib/i18n';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('not_found.title', 'الصفحة غير موجودة')} subtitle={t('not_found.subtitle', 'الرابط خاطئ أو أُزيلت الصفحة.')} />
      <Link to="/" className="self-start rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white dark:bg-brand-500">
        {t('not_found.home', 'العودة إلى الرئيسية')}
      </Link>
    </div>
  );
}
