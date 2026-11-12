import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../lib/i18n';
import { useSession } from '../../lib/session';

// «التقارير» صفحة مداخل (تقارير القاعات، 0027، كلمة المالك 2026-11-12، docs/HALLS_REPORTS_PLAN.md): تقرير القاعات اليومي وتقارير الدورات
// لمن في نطاقه حقول لحم أو بيض، وتحتها ما خُطّط بعدُ. كلّها تحتاج الخادم، فالصفحة خارج التثبيت المسبق بالاسم (vite.config.ts وpwa-guard،
// وسطرها في DECISIONS «السقوف المقيسة»)، وبلا PlannedPage: حزمتها المشتركة مع المفقس كانت تُكتب اسماً في خريطة حزمة الإقلاع.

const CARD = 'card flex flex-col gap-1 p-4 transition-shadow hover:shadow-soft';

export default function ReportsPage() {
  const session = useSession();
  const divisions = session.status === 'ready' ? session.workspace.divisions : null;
  // بلا منشأة مؤكّدة الهيكل كلّه، مثل الشريط.
  const farms = divisions === null || divisions.includes('broiler') || divisions.includes('layer');
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
          </div>
        </section>
      ) : null}
      <section className="card p-5" data-action="reports-planned">
        <h2 className="font-semibold">{t('reports.planned.title', 'تقارير تُبنى لاحقاً')}</h2>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 ps-6 text-ink-muted">
          <li>{t('reports.planned.stock', 'قيمة المخزون بتاريخ لكل وحدة، والصادر والوارد الداخلي بالكمية والقيمة.')}</li>
          <li>{t('reports.planned.profit', 'كلفة العلائق، ربح الأفواج والحقول، كلفة الفرخ ونسب الفقس لكل وجبة.')}</li>
          <li>{t('reports.planned.debts', 'المبيعات والربح لكل وحدة، والديون وأعمارها لكل حساب. كل تقرير بمدّة إلزامية وبجدول كلاسيكي بصفّ مجاميع.')}</li>
        </ul>
      </section>
    </div>
  );
}
