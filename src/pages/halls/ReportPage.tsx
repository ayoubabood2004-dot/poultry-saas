import { useCallback, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { PrintedAt, ReportFooter, ReportHeader, usePrintedAt, useWidePage, type InfoItem } from '../../components/ui/OfficialReport';
import { toast } from '../../components/ui/Toast';
import type { Milli } from '../../domain/money';
import { RejectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import { loadHallSheet, type HallSheet, type SheetDay } from '../../lib/repo/hallSheet';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { sheetHallName } from '../farm/FlockPage';
import { BackLink, backLabel, backTarget, flockPath, pct, printAs } from './parts';
import { downloadFile, IMAGE_WIDTH, reportImage, sendFile } from './reportImage';

// «تقرير الوجبة» (طلب المالك 2026-11-21: «تقارير مبسّطة بجداول أرقام مثل ورقته»؛ عقد 0034/0035 S2، docs/HALLS_SHEET_PLAN.md المرحلة ٣):
// /halls/report/:flockId بقراءة hall_sheet واحدة. خلاصة الوجبة جدولاً (الداخل، والهلاكات ونسبتها، والباقي، والعلف المرسل بالكيلو والأكياس، والغاز،
// والمباع وصافي وزنه ومعدّل الوزن، ومعامل التحويل = العلف المرسل ÷ صافي المباع) من خلاصة الخادم، ثمّ جدول الورقة نفسه حتى اليوم وصفّ مجموع الخادم في
// آخره (رسالة الزبون 2026-11-26: «ماكو داعي مجموع الهلاكات… بالأخير ينكتب المجموع»، والعلف كذلك: لا عمودَي مجموع تراكميّ). بلا رسوم وزن يوميّ ولا علف مأكول. و«أرسل صورة» (reportImage) و«اطبع / PDF»
// (printAs)؛ والتقرير المفصّل (العلف بمستنداته والأدوية واللقاحات والكلفة، والإغلاق و«أعد فتح الدورة») رابطٌ إلى /halls/cycle/:flockId.
// وبالشكل الرسميّ (عقد 0036 S1، «مثل تقارير المستشفيات»): رأسٌ باسم المنشأة والعنوان وشبكة بيانات الوجبة، والجدولان رسميّان بشريط اسميهما، وتذييلٌ بـ«أعدّه»
// و«طُبع في» والتوقيعات؛ والصفحة عريضة في الشاشات الكبيرة.

// الورقة A4 بالطول وخطّ جداولها 11 نقطة (والحشوة وتكرار الرأس والجدول بلا تمرير في official.css)، والصورة بتخطيطها بخطّ 12 بحاشية.
const PRINT_STYLE = [
  '@page { size: A4 portrait; margin: 10mm; }',
  '@media print {',
  '[data-action="batch-report"] table { font-size: 11px; }',
  '[data-action="batch-report"] th, [data-action="batch-report"] td { white-space: normal; min-width: 0; }',
  '[data-action="batch-report"] td bdi { white-space: nowrap; }',
  '[data-action="batch-report"] tfoot { display: table-row-group; }',
  '[data-action="batch-report"] tr { break-inside: avoid; }',
  '}',
  '[data-capture] { padding: 16px; }',
  '[data-capture] .print\\:hidden { display: none !important; }',
  '[data-capture] table { font-size: 12px; }',
  '[data-capture] th, [data-capture] td { white-space: normal; min-width: 0; }',
  '[data-capture] td bdi { white-space: nowrap; }',
].join(' ');

type SummaryRow = { key: string; label: string; value: string };
/** صفّ الورقة في التقرير: اليوم كما في الورقة (بلا مجموع تراكميّ: المجموع في آخر الجدول وحده، رسالة الزبون 2026-11-26). */
type ReportDay = { day: SheetDay };

const dash = () => t('halls.rep.dash', '—');
const kg = (value: Milli | null): string => (value === null ? dash() : fmtQtyCell(value, columnDecimals([value], 3) as 0 | 1 | 2 | 3));
const kgCell = (value: Milli | null, decimals: 0 | 1 | 2 | 3) => (value === null ? '' : <Num>{fmtQtyCell(value, decimals)}</Num>);

/** خلاصة الوجبة بصفوف «البند | القيمة» من summary الخادم، والغائب «—». */
export function summaryRows(sheet: HallSheet): SummaryRow[] {
  const s = sheet.summary;
  return [
    { key: 'placed', label: t('batch.sum.placed', 'الداخل'), value: fmtInt(s.placed) },
    { key: 'dead', label: t('batch.sum.dead', 'الهلاكات'), value: fmtInt(s.dead) },
    { key: 'mortality', label: t('batch.sum.mortality', 'نسبة الهلاكات'), value: pct(s.mortalityPct) },
    { key: 'live', label: t('batch.sum.live', 'الباقي'), value: fmtInt(s.live) },
    { key: 'feed_kg', label: t('batch.sum.feed_kg', 'العلف المرسل (كغم)'), value: kg(s.feedKg) },
    { key: 'feed_bags', label: t('batch.sum.feed_bags', 'العلف المرسل (أكياس)'), value: kg(s.feedBags) },
    // المرتجع إلى المخزن والمنقول للوجبة التالية يوم الإغلاق (إن وُجد)، وصافي العلف = المرسل − المرتجع والمنقول، وعليه معامل التحويل (عقد مراجعة 0035).
    ...(s.feedBackKg !== null && s.feedBackKg > 0n ? [{ key: 'feed_back', label: t('batch.sum.feed_back', 'المرتجع والمنقول (كغم)'), value: kg(s.feedBackKg) }] : []),
    { key: 'feed_net', label: t('batch.sum.feed_net', 'صافي العلف (كغم)'), value: kg(s.feedNetKg) },
    { key: 'gas', label: t('batch.sum.gas', 'الغاز (قناني)'), value: fmtInt(s.gas) },
    // الكاز (0037، رسالة الزبون 2026-11-26) حين سُجّل.
    ...(s.kerosene > 0 ? [{ key: 'kerosene', label: t('batch.sum.kerosene', 'الكاز (لتر)'), value: fmtInt(s.kerosene) }] : []),
    { key: 'sold', label: t('batch.sum.sold', 'المباع (طير)'), value: fmtInt(s.soldBirds) },
    { key: 'sold_kg', label: t('batch.sum.sold_kg', 'صافي وزن المباع (كغم)'), value: kg(s.soldNetKg) },
    { key: 'avg', label: t('batch.sum.avg', 'معدّل وزن الطير (كغم)'), value: s.avgWeightKg === null ? dash() : fmtScaledCell(s.avgWeightKg, 3, 3) },
    { key: 'fcr', label: t('batch.sum.fcr', 'معامل التحويل (صافي العلف ÷ صافي المباع)'), value: s.fcr === null ? dash() : fmtScaledCell(s.fcr, 3, 3) },
  ];
}

/** أيام التقرير: من التسكين حتى اليوم (أو نهاية الوجبة المغلقة). */
export function reportDays(sheet: HallSheet): ReportDay[] {
  const rows: ReportDay[] = [];
  for (const day of sheet.days) {
    if (day.on > sheet.today) break;
    rows.push({ day });
  }
  return rows;
}

function BatchBody({ sheet }: { sheet: HallSheet }) {
  const rows = reportDays(sheet);
  const layer = sheet.flock.kind === 'layer';
  const feedDecimals = columnDecimals([sheet.totals.feedKg, ...rows.flatMap((row) => (row.day.feedKg === null ? [] : [row.day.feedKg]))], 3) as 0 | 1 | 2 | 3;
  const soldDecimals = columnDecimals(rows.flatMap((row) => (row.day.soldNetKg === null ? [] : [row.day.soldNetKg])), 3) as 0 | 1 | 2 | 3;
  const sold = sheet.totals.soldBirds > 0;
  // عمود الكاز حين سُجّل في الوجبة (يوماً ما، ولو مُسح بعدها إلى صفر): الوجبة بلا كاز بلا عموده.
  const kerosene = sheet.totals.kerosene > 0 || rows.some((row) => row.day.kerosene !== null);
  const columns: Column<ReportDay>[] = [
    { key: 'age', header: t('sheet.col.age', 'العمر'), kind: 'number', cell: (row) => <Num>{fmtInt(row.day.age)}</Num> },
    { key: 'date', header: t('sheet.col.date', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.day.on)}</Num> },
    {
      key: 'dead',
      header: t('sheet.col.dead', 'الهلاكات'),
      kind: 'number',
      cell: (row) => (row.day.dayVersion === null && row.day.dead === 0 ? '' : <Num>{fmtInt(row.day.dead)}</Num>),
      total: <Num>{fmtInt(sheet.totals.dead)}</Num>,
    },
    { key: 'gas', header: t('sheet.col.gas', 'الغاز'), kind: 'number', cell: (row) => (row.day.gas === null ? '' : <Num>{fmtInt(row.day.gas)}</Num>), total: <Num>{fmtInt(sheet.totals.gas)}</Num> },
    ...(kerosene
      ? [
          {
            key: 'kerosene',
            header: t('sheet.col.kerosene', 'الكاز (لتر)'),
            kind: 'number' as const,
            cell: (row: ReportDay) => (row.day.kerosene === null ? '' : <Num>{fmtInt(row.day.kerosene)}</Num>),
            total: <Num>{fmtInt(sheet.totals.kerosene)}</Num>,
          },
        ]
      : []),
    { key: 'feed', header: t('sheet.col.feed', 'العلف (كغم)'), kind: 'number', cell: (row) => kgCell(row.day.feedKg, feedDecimals), total: <Num>{fmtQtyCell(sheet.totals.feedKg, feedDecimals)}</Num> },
    ...(layer
      ? [
          {
            key: 'eggs',
            header: t('sheet.col.eggs', 'البيض'),
            kind: 'number' as const,
            cell: (row: ReportDay) => (row.day.eggsTotal === null ? '' : <Num>{fmtInt(row.day.eggsTotal)}</Num>),
            total: sheet.totals.eggsTotal === null ? '' : <Num>{fmtInt(sheet.totals.eggsTotal)}</Num>,
          },
        ]
      : []),
    ...(sold
      ? [
          { key: 'sold', header: t('batch.col.sold', 'المباع (طير)'), kind: 'number' as const, cell: (row: ReportDay) => (row.day.soldBirds ? <Num>{fmtInt(row.day.soldBirds)}</Num> : ''), total: <Num>{fmtInt(sheet.totals.soldBirds)}</Num> },
          {
            key: 'sold_kg',
            header: t('batch.col.sold_kg', 'صافي المباع (كغم)'),
            kind: 'number' as const,
            cell: (row: ReportDay) => kgCell(row.day.soldNetKg, soldDecimals),
            total: sheet.totals.soldNetKg === null ? '' : <Num>{fmtQtyCell(sheet.totals.soldNetKg, columnDecimals([sheet.totals.soldNetKg], 3) as 0 | 1 | 2 | 3)}</Num>,
          },
        ]
      : []),
    { key: 'note', header: t('sheet.col.note', 'الملاحظات'), wrap: true, cell: (row) => row.day.note ?? '' },
  ];
  // كلّ جدول قسمٌ عنوانه شريطه الملوّن (الجدول الرسميّ): «خلاصة الوجبة» ثمّ «أيام الوجبة».
  return (
    <>
      <section aria-label={t('batch.summary', 'خلاصة الوجبة')} data-action="batch-summary">
        <DataTable
          variant="official"
          caption={t('batch.summary', 'خلاصة الوجبة')}
          columns={[
            { key: 'label', header: t('batch.col.item', 'البند'), cell: (row: SummaryRow) => row.label },
            { key: 'value', header: t('batch.col.value', 'القيمة'), kind: 'number', cell: (row: SummaryRow) => <Num>{row.value}</Num> },
          ]}
          rows={summaryRows(sheet)}
          rowKey={(row) => row.key}
          empty={dash()}
        />
      </section>
      <section aria-label={t('batch.days', 'أيام الوجبة')} data-action="batch-days">
        <DataTable
          variant="official"
          caption={t('batch.days', 'أيام الوجبة')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.day.on}
          empty={t('sheet.empty', 'لا أيام بعد.')}
          totalLabel={t('sheet.total', 'المجموع')}
        />
      </section>
    </>
  );
}

/**
 * شبكة بيانات الوجبة في رأس التقرير: القاعة والحقل وتاريخ الوجبة والداخل والعمر في آخر يوم من الجدول والحال (قائمة، أو أُغلقت يوم كذا)، ثمّ تاريخ التقرير
 * (يوم الخادم في القراءة) ووقت الطباعة.
 */
export function batchInfo(sheet: HallSheet, printedAt: Date): InfoItem[] {
  const flock = sheet.flock;
  const last = reportDays(sheet).at(-1) ?? null;
  return [
    { key: 'hall', label: t('batch.info.hall', 'القاعة'), value: sheetHallName(flock.hallName) },
    { key: 'site', label: t('batch.info.site', 'الحقل'), value: flock.siteName },
    { key: 'placed_on', label: t('batch.info.placed_on', 'تاريخ الوجبة'), value: <Num>{fmtDay(flock.placedOn)}</Num> },
    { key: 'placed', label: t('batch.info.placed', 'الداخل'), value: <Num>{fmtInt(flock.placedCount)}</Num> },
    { key: 'age', label: t('batch.info.age', 'العمر (يوم)'), value: last ? <Num>{fmtInt(last.day.age)}</Num> : dash() },
    {
      key: 'state',
      label: t('batch.info.state', 'الحالة'),
      value:
        flock.status === 'closed' && flock.closedOn ? <Trans k="batch.info.closed" text="أُغلقت يوم {day}" vars={{ day: <Num>{fmtDay(flock.closedOn)}</Num> }} /> : t('batch.info.open', 'قائمة'),
    },
    { key: 'report_day', label: t('report.info.day', 'تاريخ التقرير'), value: <Num>{fmtDay(sheet.today)}</Num> },
    { key: 'printed', label: t('report.info.printed', 'طُبع في'), value: <PrintedAt at={printedAt} /> },
  ];
}

function BatchView({ flockId }: { flockId: string }) {
  useWidePage();
  const [search] = useSearchParams();
  const session = useSession();
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  const by = session.status === 'ready' ? session.workspace.displayName : '';
  const printed = usePrintedAt();
  const load = useCallback(() => loadHallSheet(flockId), [flockId]);
  const state = useLoad(load, flockId);
  const sheet = state.data;
  const flock = sheet?.flock ?? null;
  const back = backTarget(search.get('back'), flock ? flockPath(flock.kind, flock.id) : '/');
  // اسم القاعة بلا بادئة «قاعة» كعنوان الورقة («قاعة 7» لا «قاعة قاعة 7»)، والعنوان نفسه للصورة والطباعة.
  const title = flock ? t('batch.title', 'تقرير وجبة قاعة {hall} — {site}', { hall: sheetHallName(flock.hallName), site: flock.siteName }) : t('batch.title_only', 'تقرير الوجبة');
  const pageRef = useRef<HTMLDivElement>(null);
  const [imaging, setImaging] = useState(false);
  const [ready, setReady] = useState<{ file: File; title: string } | null>(null);
  const here = `/halls/report/${flockId}`;

  const deliver = async (file: File, imageTitle: string) => {
    const outcome = await sendFile(file, imageTitle);
    setReady(outcome === 'blocked' ? { file, title: imageTitle } : null);
    if (outcome === 'downloaded') toast({ tone: 'success', title: t('halls.day.image.downloaded', 'حُفظت الصورة «{name}» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى من تريد.', { name: file.name }) });
  };
  const sendImage = async () => {
    const page = pageRef.current;
    if (!sheet || !page || imaging) return;
    setImaging(true);
    setReady(null);
    // «طُبع في» لحظة الصورة، مكتوبةً في الصفحة قبل أن تُنسخ.
    printed.stamp();
    let file: File;
    try {
      // فاتحةٌ دائماً كالورقة المطبوعة (مراجعة 0036 R7): تُرسل لغير صاحب الجهاز، ولو كانت الصفحة بالسمة الداكنة.
      file = await reportImage(page, `batch-report-${sheet.flock.placedOn}-${sheet.today}.png`, IMAGE_WIDTH, { light: true });
    } catch {
      setImaging(false);
      toast({ tone: 'danger', title: t('halls.day.image.failed', 'تعذّر تجهيز الصورة على هذا الجهاز. اطبع التقرير أو احفظه PDF بدلاً من ذلك.') });
      return;
    }
    setImaging(false);
    await deliver(file, title);
  };

  return (
    <div ref={pageRef} className="flex flex-col gap-5" data-action="batch-report">
      <style>{PRINT_STYLE}</style>
      <div className="print:hidden">
        <BackLink to={back} label={backLabel(back)} />
      </div>
      {sheet ? (
        <div className="flex flex-col gap-2 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <Button busy={imaging} onClick={() => void sendImage()} data-action="batch-image">
              {t('batch.image', 'أرسل صورة')}
            </Button>
            <Button variant="secondary" onClick={() => printAs(title)} data-action="batch-print">
              {t('batch.print', 'اطبع / PDF')}
            </Button>
          </div>
          {ready ? (
            <Notice
              tone="info"
              title={t('halls.day.image.ready', 'الصورة جاهزة: اضغط «أرسلها» لتختار التطبيق ومن ترسلها إليه.')}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void deliver(ready.file, ready.title)} data-action="batch-send-ready">
                    {t('halls.day.image.send', 'أرسلها')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      downloadFile(ready.file);
                      setReady(null);
                    }}
                    data-action="batch-download-ready"
                  >
                    {t('halls.day.image.download', 'نزّلها')}
                  </Button>
                </div>
              }
            />
          ) : null}
        </div>
      ) : null}
      {/* الورقة الرسمية: الرأس بشبكة البيانات، ثمّ الجدولان، ثمّ التذييل بالتوقيعات (ما يُطبع ويُصوَّر). */}
      <article className="ofc-paper" data-action="batch-paper">
        <ReportHeader org={orgName} orgAction="rep-org" title={title} titleAction="batch-title" info={sheet ? batchInfo(sheet, printed.at) : []} />
        {state.error ? (
          state.error instanceof RejectedError && state.error.hint ? (
            <Notice tone="warning" title={state.error.hint} />
          ) : (
            <LoadFailed what={t('batch.what', 'تقرير الوجبة')} error={state.error} onRetry={state.retry} />
          )
        ) : sheet ? (
          <BatchBody sheet={sheet} />
        ) : (
          <p role="status" className="text-sm text-ink-muted" data-action="batch-loading">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )}
        {sheet && !state.error ? <ReportFooter by={by} at={printed.at} /> : null}
      </article>
      {sheet && !state.error ? (
        <p className="text-sm print:hidden">
          <Link to={`/halls/cycle/${flockId}?${new URLSearchParams({ back: here }).toString()}`} className="font-semibold text-brand-700 dark:text-brand-200" data-action="batch-detailed">
            {t('batch.detailed', 'التقرير المفصّل: العلف بمستنداته والأدوية واللقاحات والكلفة والإغلاق')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export default function ReportPage() {
  const { flockId = '' } = useParams();
  return <BatchView key={flockId} flockId={flockId} />;
}
