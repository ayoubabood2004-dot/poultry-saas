import { PageHeader } from '../../components/PageHeader';
import { t } from '../../lib/i18n';

export default function ReportPage() {
  return <PageHeader title={t('halls.report.title', 'تقرير الدورة')} />;
}
