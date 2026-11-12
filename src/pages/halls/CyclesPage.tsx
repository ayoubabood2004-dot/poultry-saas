import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadFlockCycles, type CycleRow } from '../../lib/repo/hallReports';
import { useLoad } from '../../lib/useLoad';
import { BackLink, backLabel, kindLabel, reportsBack } from './parts';

// تقارير الدورات (0027، docs/HALLS_REPORTS_PLAN.md التسليم ١): /halls/cycles بقراءة flock_cycles واحدة، كلّ دورات النطاق القائمة والمغلقة (القائمة أوّلاً ثمّ
// الأحدث إغلاقاً) في جدول كلاسيكي، ومن كلّ دورة تقريرها الكامل (/halls/report/:flockId) برجوع إلى هنا، فيصل تقرير دورة مغلقة بعد أن تشغل القاعةَ دورةٌ
// جديدة. والقيمة الغائبة «—». بلا مال.

const dash = () => t('halls.cycles.dash', '—');

export default function CyclesPage() {
  const [search] = useSearchParams();
  const backParam = search.get('back');
  const back = reportsBack(backParam, '/reports');
  const state = useLoad(loadFlockCycles);
  const data = state.data;
  // رجوع تقرير الدورة إلى هذه الصفحة برجوعها هي (إن جاءت بـ?back=).
  const here = backParam !== null && back === backParam ? `/halls/cycles?${new URLSearchParams({ back: backParam }).toString()}` : '/halls/cycles';
  const reportUrl = (row: CycleRow) => `/halls/report/${row.id}?${new URLSearchParams({ back: here }).toString()}`;

  const columns: Column<CycleRow>[] = [
    {
      key: 'hall',
      header: t('halls.cycles.col.hall', 'القاعة'),
      sticky: true,
      cell: (row) => (
        <Link to={reportUrl(row)} className="font-semibold text-brand-700 dark:text-brand-200" data-action="cycle-report-link" data-id={row.id}>
          {row.hallName}
        </Link>
      ),
    },
    { key: 'site', header: t('halls.cycles.col.site', 'الحقل'), cell: (row) => row.siteName },
    { key: 'kind', header: t('halls.cycles.col.kind', 'النوع'), cell: (row) => kindLabel(row.kind) },
    { key: 'placed', header: t('halls.cycles.col.placed', 'التسكين'), cell: (row) => <Num>{fmtDay(row.placedOn)}</Num> },
    {
      key: 'closed',
      header: t('halls.cycles.col.closed', 'الإغلاق'),
      cell: (row) => (row.closedOn !== null ? <Num>{fmtDay(row.closedOn)}</Num> : <span data-action="cycle-active">{t('halls.cycles.active', 'قائمة')}</span>),
    },
    { key: 'age', header: t('halls.cycles.col.age', 'العمر (يوم)'), kind: 'number', cell: (row) => <Num>{fmtInt(row.age)}</Num> },
    { key: 'live', header: t('halls.cycles.col.live', 'الحيّ'), kind: 'number', cell: (row) => <Num>{fmtInt(row.live)}</Num> },
    {
      key: 'mortality',
      header: t('halls.cycles.col.mortality', 'النفوق'),
      kind: 'number',
      cell: (row) => (row.mortalityPct === null ? dash() : <Num>{`${fmtScaledCell(row.mortalityPct, 2, 2)}%`}</Num>),
    },
  ];

  return (
    <div className="flex flex-col gap-5" data-action="cycles-page">
      <BackLink to={back} label={backLabel(back)} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-action="cycles-title">
          {t('halls.cycles.title', 'تقارير الدورات')}
        </h1>
        <p className="text-ink-muted">{t('halls.cycles.subtitle', 'كلّ دورات القاعات في نطاقك، القائمة أوّلاً ثمّ المغلقة. افتح دورةً لتقريرها الكامل.')}</p>
      </header>
      {state.error ? (
        state.error instanceof RejectedError && state.error.hint ? (
          <Notice tone="warning" title={state.error.hint} />
        ) : (
          <LoadFailed what={t('halls.cycles.what', 'تقارير الدورات')} error={state.error} onRetry={state.retry} />
        )
      ) : data ? (
        <>
          {data.more ? <Notice tone="info" title={t('halls.cycles.more', 'تُعرض أحدث 500 دورة.')} /> : null}
          <DataTable caption={t('halls.cycles.title', 'تقارير الدورات')} columns={columns} rows={data.cycles} rowKey={(row) => row.id} empty={t('halls.cycles.empty', 'لا دورات في نطاقك بعد.')} />
        </>
      ) : (
        <p role="status" className="text-sm text-ink-muted" data-action="cycles-loading">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      )}
    </div>
  );
}
