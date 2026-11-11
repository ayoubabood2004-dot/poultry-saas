import { useCallback, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import type { Day } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { RejectedError } from '../../lib/errors';
import { columnDecimals, countForm, fmtDay, fmtInt, fmtMoney, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadCycleReport, type CycleReport } from '../../lib/repo/halls';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { BackLink, backTarget, daysText, flockPath, kindLabel, printAs, STATE_INK, stateLabel, unitWord, VaccineName } from './parts';

// تقرير الدورة (0026، كلمة المالك 2026-11-11: «بنهاية الدورة تقرير كامل بشنو انطوا علف»): /halls/report/:flockId بقراءة flock_cycle_report واحدة.
// أقسامه جداول كلاسيكية (DataTable): الطيور (المسكَّن والنافق والمستبعد والحيّ ونسبة النفوق)، والعلف بكلّ نزول بتاريخه ومستنده وكيلوه وتراكمه (والقيمة
// لأدوار الكلفة وحدها)، ومجموعه لكلّ مادّة، والمصروف للقاعة والمستهلك المسجّل والباقي (وعدد سطور العلف بلا وزن)، والأدوية من المخزن وبلا مخزن،
// واللقاحات المخطّطة والمنفَّذة بحالتها، وخلاصة المال لأدوار الكلفة. المال يغيب مفتاحه كلّه لغيرهم (repo/halls يقرأ الغياب null)، فلا عمود ولا قسم.
// و«اطبع التقرير» على A4 طولاً بعنوان التقرير، وبقيّة الصفحة لا تُطبع.

type Birds = CycleReport['birds'];
type FeedLine = CycleReport['feed']['lines'][number];
type ByItem = CycleReport['feed']['byItem'][number];
type Medicine = CycleReport['medicines'][number];
type Vaccine = CycleReport['vaccines'][number];
type Balance = { delivered: bigint; consumed: bigint; remaining: bigint };
type MoneyRow = { key: string; label: string; amount: Fils };

const PRINT_STYLE = [
  '@page { size: A4 portrait; margin: 12mm; }',
  '@media print {',
  '[data-action="cycle-report"] table { font-size: 11px; }',
  '[data-action="cycle-report"] th, [data-action="cycle-report"] td { padding: 3px 5px; white-space: normal; min-width: 0; }',
  '[data-action="cycle-report"] td bdi { white-space: nowrap; }',
  '[data-action="cycle-report"] tfoot { display: table-row-group; }',
  '[data-action="cycle-report"] tr { break-inside: avoid; }',
  '[data-action="cycle-report"] h2 { break-after: avoid; }',
  '[data-action="vac-swatch"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '}',
].join(' ');

/** مراتب عمود كميات بالآلاف: أقلّ ما يبيّن كلّ قيمه (الفارغ لا يُحسب). */
const decimalsOf = (values: readonly (bigint | null)[]): 0 | 1 | 2 | 3 => columnDecimals(values.filter((value): value is bigint => value !== null), 3) as 0 | 1 | 2 | 3;
const pct = (hundredths: bigint): string => `${fmtScaledCell(hundredths, 2, 2)}%`;
/**
 * رقم اليوم منذ 1970 (أجزاء YYYY-MM-DD بالتقويم، بلا منطقة). لا diffDays من domain/dates: استيراده من هنا يُخرج دالّةً كانت محذوفة من حزمة التواريخ
 * المحفوظة فيكبّرها (47 بايتاً من هامش التثبيت المسبق).
 */
const dayIndex = (day: Day): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000;
const dash = () => t('halls.rep.dash', '—');

/** عدد السطور بصيغة العدد: «سطر واحد»، «سطران»، «3 سطور»، «11 سطراً»، «100 سطر». */
function linesText(n: number): string {
  if (n === 1) return t('halls.rep.lines.one', 'سطر واحد');
  if (n === 2) return t('halls.rep.lines.two', 'سطران');
  const form = countForm(n);
  if (form === 'few') return t('halls.rep.lines.few', '{n} سطور', { n });
  if (form === 'many') return t('halls.rep.lines.many', '{n} سطراً', { n });
  return t('halls.rep.lines.hundreds', '{n} سطر', { n });
}

/** قسم بعنوانه وجدوله: حدّ ارتفاع الجدول وتمريره للشاشة وحدها (بالطباعة كلّ الصفوف). */
function Section({ title, action, note, children }: { title: string; action: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" data-action={action}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {note}
      <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible">{children}</div>
    </section>
  );
}

function ReportBody({ report }: { report: CycleReport }) {
  const { birds, feed, medicines, vaccines, money } = report;
  const lineQty = decimalsOf(feed.lines.map((line) => line.qty));
  const kgDecimals = decimalsOf([...feed.lines.map((line) => line.kg), ...feed.lines.map((line) => line.cumKg), feed.deliveredKg, ...feed.byItem.map((row) => row.kg)]);
  const itemQty = decimalsOf(feed.byItem.map((row) => row.qty));
  const balanceDecimals = decimalsOf([feed.deliveredKg, feed.consumedKg, feed.remainingKg]);
  const medQty = decimalsOf(medicines.map((row) => row.qty));
  const kgCell = (kg: bigint | null, decimals: 0 | 1 | 2 | 3) => (kg === null ? dash() : <Num>{fmtQtyCell(kg, decimals)}</Num>);

  const birdColumns: Column<Birds>[] = [
    { key: 'placed', header: t('halls.rep.col.placed', 'المسكَّن'), kind: 'number', cell: (row) => <Num>{fmtInt(row.placed)}</Num> },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (row) => <Num>{fmtInt(row.dead)}</Num> },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (row) => <Num>{fmtInt(row.culled)}</Num> },
    { key: 'live', header: t('halls.rep.col.live', 'الحيّ'), kind: 'number', cell: (row) => <Num>{fmtInt(row.live)}</Num> },
    { key: 'mortality', header: t('halls.rep.col.mortality', 'نسبة النفوق'), kind: 'number', cell: (row) => <Num>{pct(row.mortalityPct)}</Num> },
  ];

  const lineColumns: Column<FeedLine>[] = [
    { key: 'on', header: t('halls.rep.col.date', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.on)}</Num> },
    { key: 'doc', header: t('halls.rep.col.doc', 'المستند'), cell: (row) => <Num>{row.docNo}</Num> },
    { key: 'item', header: t('halls.rep.col.item', 'المادّة'), wrap: true, cell: (row) => row.itemName },
    { key: 'qty', header: t('halls.rep.col.qty', 'الكمية'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.qty, lineQty)}</Num> },
    { key: 'unit', header: t('halls.rep.col.unit', 'الوحدة'), cell: (row) => unitWord(row.baseUnit) },
    { key: 'kg', header: t('halls.rep.col.kg', 'الكيلو (كغم)'), kind: 'number', cell: (row) => kgCell(row.kg, kgDecimals), total: <Num>{fmtQtyCell(feed.deliveredKg, kgDecimals)}</Num> },
    { key: 'cum', header: t('halls.rep.col.cum', 'التراكمي (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.cumKg, kgDecimals)}</Num> },
    ...(money
      ? [
          {
            key: 'value',
            header: t('halls.rep.col.value', 'القيمة'),
            kind: 'number' as const,
            cell: (row: FeedLine) => (row.value === null ? dash() : <Num>{fmtMoney(row.value)}</Num>),
            total: <Num>{fmtMoney(money.feed)}</Num>,
          },
        ]
      : []),
  ];

  const itemColumns: Column<ByItem>[] = [
    { key: 'item', header: t('halls.rep.col.item', 'المادّة'), wrap: true, cell: (row) => row.name },
    { key: 'qty', header: t('halls.rep.col.qty', 'الكمية'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.qty, itemQty)}</Num> },
    { key: 'unit', header: t('halls.rep.col.unit', 'الوحدة'), cell: (row) => unitWord(row.baseUnit) },
    { key: 'kg', header: t('halls.rep.col.kg', 'الكيلو (كغم)'), kind: 'number', cell: (row) => kgCell(row.kg, kgDecimals), total: <Num>{fmtQtyCell(feed.deliveredKg, kgDecimals)}</Num> },
  ];

  const balanceColumns: Column<Balance>[] = [
    { key: 'delivered', header: t('halls.rep.col.delivered', 'المصروف للقاعة (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.delivered, balanceDecimals)}</Num> },
    { key: 'consumed', header: t('halls.rep.col.consumed', 'المستهلك المسجّل (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.consumed, balanceDecimals)}</Num> },
    { key: 'remaining', header: t('halls.rep.col.remaining', 'الباقي بالقاعة (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.remaining, balanceDecimals)}</Num> },
  ];

  const medicineColumns: Column<Medicine>[] = [
    { key: 'on', header: t('halls.rep.col.date', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.on)}</Num> },
    { key: 'name', header: t('halls.rep.col.medicine', 'الدواء'), wrap: true, cell: (row) => row.name },
    {
      key: 'source',
      header: t('halls.rep.col.source', 'المصدر'),
      cell: (row) => (row.source === 'store' ? t('halls.rep.source.store', 'من المخزن') : t('halls.rep.source.log', 'بلا مخزن')),
    },
    { key: 'qty', header: t('halls.rep.col.qty', 'الكمية'), kind: 'number', cell: (row) => (row.qty === null ? dash() : <Num>{fmtQtyCell(row.qty, medQty)}</Num>) },
    { key: 'unit', header: t('halls.rep.col.unit', 'الوحدة'), cell: (row) => (row.baseUnit === null ? dash() : unitWord(row.baseUnit)) },
    { key: 'dose', header: t('halls.rep.col.dose', 'الجرعة'), wrap: true, cell: (row) => row.dose ?? dash() },
    { key: 'doc', header: t('halls.rep.col.doc', 'المستند'), cell: (row) => (row.docNo === null ? dash() : <Num>{row.docNo}</Num>) },
  ];

  const vaccineColumns: Column<Vaccine>[] = [
    { key: 'age', header: t('halls.rep.col.age', 'يوم العمر'), kind: 'number', cell: (row) => <Num>{fmtInt(row.ageDay)}</Num> },
    { key: 'name', header: t('halls.rep.col.vaccine', 'اللقاح'), cell: (row) => <VaccineName name={row.name} color={row.color} /> },
    { key: 'due', header: t('halls.rep.col.due', 'الموعد'), cell: (row) => <Num>{fmtDay(row.dueOn)}</Num> },
    { key: 'state', header: t('halls.rep.col.state', 'الحالة'), cell: (row) => <span className={`font-semibold ${STATE_INK[row.state]}`}>{stateLabel(row.state)}</span> },
    { key: 'done', header: t('halls.rep.col.done', 'يوم التأشير'), cell: (row) => (row.doneOn === null ? dash() : <Num>{fmtDay(row.doneOn)}</Num>) },
    { key: 'doc', header: t('halls.rep.col.doc', 'المستند'), cell: (row) => (row.docNo === null ? dash() : <Num>{row.docNo}</Num>) },
  ];

  const moneyRows: readonly MoneyRow[] = money
    ? [
        { key: 'feed', label: t('halls.rep.money.feed', 'العلف'), amount: money.feed },
        { key: 'medicine', label: t('halls.rep.money.medicine', 'الأدوية'), amount: money.medicine },
        { key: 'vaccine', label: t('halls.rep.money.vaccine', 'اللقاحات'), amount: money.vaccine },
        { key: 'other', label: t('halls.rep.money.other', 'أخرى'), amount: money.other },
      ]
    : [];
  const moneyColumns: Column<MoneyRow>[] = [
    { key: 'label', header: t('halls.rep.col.cost', 'البند'), cell: (row) => row.label },
    { key: 'amount', header: t('halls.rep.col.amount', 'المبلغ'), kind: 'number', cell: (row) => <Num>{fmtMoney(row.amount)}</Num>, total: money ? <Num>{fmtMoney(money.total)}</Num> : undefined },
  ];

  const done = vaccines.filter((row) => row.state === 'done').length;
  const missed = vaccines.filter((row) => row.state === 'missed').length;

  return (
    <div className="flex flex-col gap-6" data-action="cycle-report">
      <Section title={t('halls.rep.sec.birds', 'الطيور')} action="rep-birds">
        <DataTable caption={t('halls.rep.sec.birds', 'الطيور')} columns={birdColumns} rows={[birds]} rowKey={() => 'birds'} empty={dash()} />
      </Section>
      <Section title={t('halls.rep.sec.feed', 'العلف النازل للقاعة')} action="rep-feed">
        <DataTable caption={t('halls.rep.sec.feed', 'العلف النازل للقاعة')} columns={lineColumns} rows={feed.lines} rowKey={(row, index) => `${row.docNo}|${index}`} empty={t('halls.rep.feed_empty', 'لم ينزل علف لهذه القاعة بعد.')} totalLabel={t('halls.rep.total', 'المجموع')} />
      </Section>
      <Section title={t('halls.rep.sec.by_item', 'العلف حسب المادّة')} action="rep-by-item">
        <DataTable caption={t('halls.rep.sec.by_item', 'العلف حسب المادّة')} columns={itemColumns} rows={feed.byItem} rowKey={(row) => row.itemId} empty={t('halls.rep.feed_empty', 'لم ينزل علف لهذه القاعة بعد.')} totalLabel={t('halls.rep.total', 'المجموع')} />
      </Section>
      <Section
        title={t('halls.rep.sec.balance', 'المصروف والمستهلك والباقي')}
        action="rep-balance"
        note={
          feed.unweighed > 0 ? (
            <p className="text-sm text-ink-muted" data-action="rep-unweighed">
              {t('halls.rep.unweighed', '{lines} بلا وزن (لتر بلا كثافة أو قطعة بلا وزن)، فلم تُحسب في الكيلو.', { lines: linesText(feed.unweighed) })}
            </p>
          ) : undefined
        }
      >
        <DataTable
          caption={t('halls.rep.sec.balance', 'المصروف والمستهلك والباقي')}
          columns={balanceColumns}
          rows={[{ delivered: feed.deliveredKg, consumed: feed.consumedKg, remaining: feed.remainingKg }]}
          rowKey={() => 'balance'}
          empty={dash()}
        />
      </Section>
      <Section title={t('halls.rep.sec.medicines', 'الأدوية')} action="rep-medicines">
        <DataTable caption={t('halls.rep.sec.medicines', 'الأدوية')} columns={medicineColumns} rows={medicines} rowKey={(row, index) => `${row.on}|${row.name}|${index}`} empty={t('halls.rep.medicines_empty', 'لم يُعطَ دواء لهذه القاعة بعد.')} />
      </Section>
      <Section
        title={t('halls.rep.sec.vaccines', 'اللقاحات')}
        action="rep-vaccines"
        note={
          vaccines.length ? (
            <p className="text-sm text-ink-muted" data-action="rep-vaccines-summary">
              {t('halls.rep.vaccines_summary', 'المواعيد: {all}، المنفَّذ منها: {done}، والفائت: {missed}.', { all: vaccines.length, done, missed })}
            </p>
          ) : undefined
        }
      >
        <DataTable caption={t('halls.rep.sec.vaccines', 'اللقاحات')} columns={vaccineColumns} rows={vaccines} rowKey={(row) => `${row.vaccineId}|${row.ageDay}`} empty={t('halls.rep.vaccines_empty', 'لا مواعيد لقاحات لهذه القاعة.')} />
      </Section>
      {money ? (
        <Section title={t('halls.rep.sec.money', 'كلفة الدورة')} action="rep-money">
          <DataTable caption={t('halls.rep.sec.money', 'كلفة الدورة')} columns={moneyColumns} rows={moneyRows} rowKey={(row) => row.key} empty={dash()} totalLabel={t('halls.rep.total', 'المجموع')} />
        </Section>
      ) : null}
    </div>
  );
}

function ReportView({ flockId }: { flockId: string }) {
  const [search] = useSearchParams();
  const session = useSession();
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  const load = useCallback(() => loadCycleReport(flockId), [flockId]);
  const state = useLoad(load, flockId);
  const report = state.data;
  const flock = report?.flock ?? null;
  const back = backTarget(search.get('back'), flock ? flockPath(flock.kind, flock.id) : '/');
  const title = flock ? t('halls.rep.heading', 'تقرير دورة {hall} — {site}', { hall: flock.hallName, site: flock.siteName }) : t('halls.report.title', 'تقرير الدورة');
  const age = report && report.through >= report.flock.placedOn ? report.flock.age0 + dayIndex(report.through) - dayIndex(report.flock.placedOn) : null;

  return (
    <div className="flex flex-col gap-5" data-action="report-page">
      <style>{PRINT_STYLE}</style>
      <BackLink to={back} label={t('halls.kit.back_hall', 'رجوع إلى القاعة')} />
      <header className="flex flex-col gap-1">
        {orgName ? (
          <p className="hidden text-sm text-ink-muted print:block" data-action="rep-org">
            {orgName}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold" data-action="rep-title">
          {title}
        </h1>
        {report && flock ? (
          <>
            <p className="text-ink-muted" data-action="rep-flock">
              {t('halls.rep.flock_line', 'فوج {kind} سُكّن يوم {day}، بعدد {count}.', { kind: kindLabel(flock.kind), day: fmtDay(flock.placedOn), count: flock.placedCount })}
              {flock.closedOn !== null ? t('halls.rep.closed', ' أُغلق يوم {day}.', { day: fmtDay(flock.closedOn) }) : ''}
            </p>
            <p className="text-ink-muted" data-action="rep-through">
              {age !== null
                ? t('halls.rep.through', 'التقرير حتى {day} (العمر: {age}).', { day: fmtDay(report.through), age: daysText(age) })
                : t('halls.rep.through_only', 'التقرير حتى {day}.', { day: fmtDay(report.through) })}
              {flock.endOn !== null && flock.endAge !== null ? t('halls.rep.end', ' نهاية الدورة المخطّطة: {day} (العمر: {age}).', { day: fmtDay(flock.endOn), age: daysText(flock.endAge) }) : ''}
            </p>
          </>
        ) : null}
      </header>
      {report && flock ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button size="sm" variant="secondary" onClick={() => printAs(t('halls.rep.print_title', 'تقرير دورة {hall} — {site} {day}', { hall: flock.hallName, site: flock.siteName, day: fmtDay(report.through) }))} data-action="print-report">
            {t('halls.rep.print', 'اطبع التقرير')}
          </Button>
        </div>
      ) : null}
      {state.error ? (
        state.error instanceof RejectedError && state.error.hint ? (
          <Notice tone="warning" title={state.error.hint} />
        ) : (
          <LoadFailed what={t('halls.rep.what', 'تقرير الدورة')} error={state.error} onRetry={state.retry} />
        )
      ) : report ? (
        <ReportBody report={report} />
      ) : (
        <p role="status" className="text-sm text-ink-muted" data-action="rep-loading">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      )}
    </div>
  );
}

export default function ReportPage() {
  const { flockId = '' } = useParams();
  return <ReportView key={flockId} flockId={flockId} />;
}
