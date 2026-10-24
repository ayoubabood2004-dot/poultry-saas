import { PlannedPage } from '../../components/PlannedPage';
import { LedgerTable } from '../../components/ui/LedgerTable';
import { t } from '../../lib/i18n';

export default function AccountsPage() {
  return (
    <PlannedPage
      title={t('nav.accounts', 'الحسابات')}
      phase={1}
      items={[
        t('accounts.planned.totals', '«لنا عند الناس» و«علينا للناس» لكل وحدة وللمشروع كلّه، دون مقاصّة بين دفترين.'),
        t('accounts.planned.table', 'جدول الجهات: عمود لكل دفتر بكلمة «عليه» أو «له»، وبحث بالاسم والهاتف، وأعمار الديون.'),
        t('accounts.planned.statement', 'كشف الجهة بكل الدفاتر بجدول كلاسيكي (التاريخ، المستند، البيان، عليه، له، الرصيد) ورصيد جارٍ لكل دفتر، ويسأل «قبضنا» و«دفعنا» عن الدفتر أولاً. المقاصّة بين دفترين للمالك فقط.'),
      ]}
    >
      {/* شكل الكشف فارغاً: الأعمدة بترتيبها بلا أرقام مخترعة، حتى ينشاف القانون قبل ما تجي القيود. */}
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-semibold">{t('accounts.statement_shape', 'شكل كشف الحساب')}</h2>
        <LedgerTable caption={t('accounts.statement_shape', 'شكل كشف الحساب')} entries={[]} />
      </section>
    </PlannedPage>
  );
}
