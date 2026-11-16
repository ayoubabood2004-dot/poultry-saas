import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../lib/i18n';
import { visibleNav } from '../../lib/nav';
import { useSession } from '../../lib/session';

// «التقارير» صفحة مداخل (تقارير القاعات، 0027، كلمة المالك 2026-11-12، docs/HALLS_REPORTS_PLAN.md): تقرير القاعات اليومي وتقارير الدورات
// لمن في نطاقه حقول لحم أو بيض، وتحتها ما خُطّط بعدُ. كلّها تحتاج الخادم، فالصفحة خارج التثبيت المسبق بالاسم (vite.config.ts وpwa-guard،
// وسطرها في DECISIONS «السقوف المقيسة»)، وبلا PlannedPage: حزمتها المشتركة مع المفقس كانت تُكتب اسماً في خريطة حزمة الإقلاع.
// و«تذاكر الوزن» (0028، /halls/tickets) مع تقارير القاعات: قائمة التذاكر بحالاتها لمن في نطاقه حقول.
// والتقارير القائمة خارج القاعات (مراجعة 0027 R3): الذمم بأعمارها (0024، /accounts/debts) وتقرير المبيعات (0021، /sales) ببطاقتين لمن يفتحهما
// الشريط نفسه («الحسابات» و«المبيعات» في visibleNav، بلا شرط صلاحية جديد)، فلا تُعلن «تُبنى لاحقاً» وهي قائمة؛ وما خُطّط بعدُ ما لم يُبنَ وحده.

const CARD = 'card flex flex-col gap-1 p-4 transition-shadow hover:shadow-soft';

export default function ReportsPage() {
  const session = useSession();
  const divisions = session.status === 'ready' ? session.workspace.divisions : null;
  // بلا منشأة مؤكّدة الهيكل كلّه، مثل الشريط.
  const farms = divisions === null || divisions.includes('broiler') || divisions.includes('layer');
  const opens = new Set(visibleNav(session).map((item) => item.to));
  const debts = opens.has('/accounts');
  const sales = opens.has('/sales');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('nav.reports', 'التقارير')} subtitle={t('reports.subtitle', 'اختر التقرير. كلّ تقرير يُطبع أو يُحفظ PDF.')} />
      {farms ? (
        <section className="flex flex-col gap-3" aria-label={t('reports.halls', 'القاعات')} data-action="reports-halls">
          <h2 className="font-semibold">{t('reports.halls', 'القاعات')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/halls/day" className={CARD} data-action="reports-day">
              <span className="font-semibold">{t('reports.day', 'تقرير القاعات اليومي')}</span>
              <span className="text-sm text-ink-muted">{t('reports.day.hint', 'كلّ القاعات ليوم تختاره: الحيّ والنافق والعلف والوزن والأدوية واللقاحات، وأين لم تُسجَّل الجولة. يُطبع ويُشارك.')}</span>
            </Link>
            <Link to="/halls/cycles" className={CARD} data-action="reports-cycles">
              <span className="font-semibold">{t('reports.cycles', 'تقارير الدورات')}</span>
              <span className="text-sm text-ink-muted">{t('reports.cycles.hint', 'كلّ دورات القاعات، القائمة والمغلقة، ومن كلّ دورة تقريرها الكامل.')}</span>
            </Link>
            <Link to="/halls/tickets?back=/reports" className={CARD} data-action="reports-tickets">
              <span className="font-semibold">{t('reports.tickets', 'تذاكر الوزن')}</span>
              <span className="text-sm text-ink-muted">{t('reports.tickets.hint', 'كلّ تذاكر القبّان: المسوّدات والمكتملة وبانتظار الفاتورة والملغاة، بقاعاتها وطيورها وصافيها.')}</span>
            </Link>
          </div>
        </section>
      ) : null}
      {debts || sales ? (
        <section className="flex flex-col gap-3" aria-label={t('reports.money', 'المال والمبيعات')} data-action="reports-money">
          <h2 className="font-semibold">{t('reports.money', 'المال والمبيعات')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {debts ? (
              <Link to="/accounts/debts" className={CARD} data-action="reports-debts">
                <span className="font-semibold">{t('reports.debts', 'الذمم بأعمارها')}</span>
                <span className="text-sm text-ink-muted">{t('reports.debts.hint', 'لمن لنا وعلى من، وكم، ومنذ متى: كلّ حساب برصيده وأعمار ديونه.')}</span>
              </Link>
            ) : null}
            {sales ? (
              <Link to="/sales" className={CARD} data-action="reports-sales">
                <span className="font-semibold">{t('reports.sales', 'تقرير المبيعات')}</span>
                <span className="text-sm text-ink-muted">{t('reports.sales.hint', 'كلّ بيع لمن ومتى وبكم، ومجاميع المدّة حسب الجهة أو المادّة أو اليوم.')}</span>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="card p-5" data-action="reports-planned">
        <h2 className="font-semibold">{t('reports.planned.title', 'تقارير تُبنى لاحقاً')}</h2>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 ps-6 text-ink-muted">
          <li>{t('reports.planned.stock', 'قيمة المخزون بتاريخ لكل وحدة، والصادر والوارد الداخلي بالكمية والقيمة.')}</li>
          <li>{t('reports.planned.profit', 'ربح الأفواج والحقول، والربح لكل وحدة.')}</li>
          <li>{t('reports.planned.hatch', 'كلفة الفرخ ونسب الفقس لكل وجبة.')}</li>
        </ul>
      </section>
    </div>
  );
}
