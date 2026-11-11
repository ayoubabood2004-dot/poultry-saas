import { PageHeader } from '../../components/PageHeader';
import { t } from '../../lib/i18n';

export default function CalendarPage() {
  return <PageHeader title={t('halls.calendar.title', 'تقويم القاعة')} />;
}
