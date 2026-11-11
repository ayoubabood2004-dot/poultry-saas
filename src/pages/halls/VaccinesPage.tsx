import { PageHeader } from '../../components/PageHeader';
import { t } from '../../lib/i18n';

export default function VaccinesPage() {
  return <PageHeader title={t('halls.vaccines.title', 'جدول اللقاحات')} />;
}
