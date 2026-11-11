import { PageHeader } from '../../components/PageHeader';
import { t } from '../../lib/i18n';

export default function GivePage() {
  return <PageHeader title={t('halls.give.title', 'أضف للقاعة')} />;
}
