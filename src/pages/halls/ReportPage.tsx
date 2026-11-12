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
import { loadCycleReport, type CycleDay, type CycleDetail, type CycleKpis, type CycleReport, type CycleWeek } from '../../lib/repo/halls';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { FeedChart, MortalityChart, WeightChart } from './charts';
import { BackLink, backLabel, backTarget, daysText, flockPath, kindLabel, leftNegativeText, linesText, outsideKgText, printAs, STATE_INK, stateLabel, unitWord, VaccineName } from './parts';

// تقرير الدورة (0026، كلمة المالك 2026-11-11: «بنهاية الدورة تقرير كامل بشنو انطوا علف»): /halls/report/:flockId بقراءة flock_cycle_report واحدة.
// أقسامه جداول كلاسيكية (DataTable): الطيور (المسكَّن والنافق والمستبعد والحيّ ونسبة النفوق)، والعلف بكلّ نزول بتاريخه ومستنده وكيلوه وتراكمه (والقيمة
// لأدوار الكلفة وحدها)، ومجموعه لكلّ مادّة، والمصروف للقاعة والمستهلك المسجّل والباقي (وعدد سطور العلف بلا وزن)، والأدوية من المخزن وبلا مخزن،
// واللقاحات المخطّطة والمنفَّذة بحالتها، وخلاصة المال لأدوار الكلفة. المال يغيب مفتاحه كلّه لغيرهم (repo/halls يقرأ الغياب null)، فلا عمود ولا قسم.
// و«اطبع التقرير» على A4 طولاً بعنوان التقرير، وبقيّة الصفحة لا تُطبع.
// و(0027، كلمة المالك 2026-11-12 «تقرير كامل بنهاية الدورة»، docs/HALLS_REPORTS_PLAN.md التسليم ١) أوّله مؤشّرات الدورة بجدول: كلّ مؤشّر ناقص المدخلات
// «—» وبجانبه سببه بجملة قصيرة (معامل التحويل يحتاج علف كلّ يوم ووزن عيّنة)، ثمّ ثلاثة رسوم صغيرة (charts.tsx) لا تحلّ محلّ الجداول، وجدول الأسابيع
// بعمر الطيور، وجدول الأيّام كلّها (يوم بلا جولة مكتوب «لم تُسجَّل الجولة» ولا يُعدّ صفراً)، وجدول الأوزان؛ وجدول الأيّام يُطبع على A4 عرضاً (صفحة
// باسمها). مجاميع الأيّام والأسابيع من مؤشّرات الخادم (kpis) لا من جمع الصفوف. وخادم قبل 0027 لا يرسل هذه المفاتيح: الأقسام القديمة وحدها بجملة.

type Birds = CycleReport['birds'];
type FeedLine = CycleReport['feed']['lines'][number];
type ByItem = CycleReport['feed']['byItem'][number];
type Medicine = CycleReport['medicines'][number];
type Vaccine = CycleReport['vaccines'][number];
type WeightRow = CycleDetail['weights'][number];
type Balance = { delivered: bigint; consumed: bigint; remaining: bigint };
type MoneyRow = { key: string; label: string; amount: Fils };
/** صفّ مؤشّر: القيمة نصّ منسّق، أو null فتُعرض «—» وnote سببها. */
type Kpi = { key: string; label: string; value: string | null; note: string | null };

const PRINT_STYLE = [
  '@page { size: A4 portrait; margin: 12mm; }',
  '@page days { size: A4 landscape; margin: 10mm; }',
  '@media print {',
  '[data-action="cycle-report"] table { font-size: 11px; }',
  '[data-action="cycle-report"] th, [data-action="cycle-report"] td { padding: 3px 5px; white-space: normal; min-width: 0; }',
  '[data-action="cycle-report"] td bdi { white-space: nowrap; }',
  '[data-action="cycle-report"] tfoot { display: table-row-group; }',
  '[data-action="cycle-report"] tr { break-inside: avoid; }',
  '[data-action="cycle-report"] h2 { break-after: avoid; }',
  '[data-action="vac-swatch"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '[data-action="rep-days"] { page: days; }',
  '[data-action="rep-days"] table { font-size: 10px; }',
  '[data-action="rep-charts"] svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
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
const WARN_INK = 'font-semibold text-warn-800 dark:text-warn-200';

/** عدد أيّام مجروراً بعد «من»: «يوم واحد»، «يومين»، «3 أيام»، «11 يوماً»، «100 يوم». */
function ofDaysText(n: number): string {
  if (n === 1) return t('halls.rep.of_days.one', 'يوم واحد');
  if (n === 2) return t('halls.rep.of_days.two', 'يومين');
  const form = countForm(n);
  if (form === 'few') return t('halls.rep.of_days.few', '{n} أيام', { n });
  if (form === 'many') return t('halls.rep.of_days.many', '{n} يوماً', { n });
  return t('halls.rep.of_days.hundreds', '{n} يوم', { n });
}

/** «سُجّل العلف 9 من 11 يوماً.»: أيّام الجولة بعلفها من الأيّام التي يحتاجها معامل التحويل (من التسكين حتى أمس «حتى»، ومعها «حتى» إن سُجّل). */
function feedDaysText(n: number | null, m: number | null): string | null {
  if (n === null || m === null || m === 0) return null;
  return t('halls.rep.kpi.feed_days', 'سُجّل العلف {n} من {days}.', { n, days: ofDaysText(m) });
}

/** لماذا لا معامل تحويل: شروط flock_summary (0012) نفسها بترتيبها، والناقص منها كلّه في جملة واحدة. */
function fcrReason(k: CycleKpis): string {
  if (k.days === 0 || k.feedDays === null || k.feedSpan === null) return t('halls.rep.kpi.no_days', 'لا أيّام في التقرير بعد.');
  const needWeight = k.lastWeight === null;
  if (k.feedSpan === 0) return needWeight ? t('halls.rep.kpi.fcr.first_both', 'يحتاج أوّل جولة بعلفها ووزن عيّنة.') : t('halls.rep.kpi.fcr.first', 'يحتاج أوّل جولة بعلفها.');
  const recorded = { n: k.feedDays, days: ofDaysText(k.feedSpan) };
  const needFeed = k.feedDays < k.feedSpan;
  if (needFeed && needWeight) return t('halls.rep.kpi.fcr.need_both', 'يحتاج علف كلّ يوم ووزن عيّنة (سُجّل العلف {n} من {days}).', recorded);
  if (needFeed) return t('halls.rep.kpi.fcr.need_feed', 'يحتاج علف كلّ يوم من التسكين (سُجّل العلف {n} من {days}).', recorded);
  if (needWeight) return t('halls.rep.kpi.fcr.need_weight', 'يحتاج وزن عيّنة.');
  if (k.live !== null && k.live <= 0) return t('halls.rep.kpi.no_live', 'لا طيور حيّة.');
  if (k.feedEatenKg !== null && k.feedEatenKg <= 0n) return t('halls.rep.kpi.fcr.zero_feed', 'العلف المسجّل صفر.');
  return t('halls.rep.kpi.incomplete', 'مدخلاته غير مكتملة.');
}

/**
 * لماذا لا مؤشّر إنتاج: يحتاج معامل التحويل والحيوية والعمر والوزن كلّها فوق الصفر. و«لا طيور حيّة.» حين لا حيّ وحده (كسبب معامل التحويل): حيّ
 * فوق الصفر بحيوية قُرّبت إلى 0.00% (نفوق 99.995% فأكثر) سببه التقريب (مراجعة 0027 S4).
 */
function epefReason(k: CycleKpis): string {
  if (k.days === 0) return t('halls.rep.kpi.no_days', 'لا أيّام في التقرير بعد.');
  if (k.fcr === null) return t('halls.rep.kpi.epef.need_fcr', 'يحتاج معامل التحويل.');
  if (k.livabilityPct === null || k.livabilityPct <= 0n) {
    if (k.live === null || k.live <= 0) return t('halls.rep.kpi.no_live', 'لا طيور حيّة.');
    if (k.livabilityPct !== null) return t('halls.rep.kpi.epef.livability_zero', 'نسبة الحيوية قُرّبت إلى صفر.');
  }
  if (k.ageEnd === null || k.ageEnd <= 0) return t('halls.rep.kpi.epef.need_age', 'يحتاج عمراً أكبر من صفر.');
  if (k.lastWeight === null) return t('halls.rep.kpi.fcr.need_weight', 'يحتاج وزن عيّنة.');
  return t('halls.rep.kpi.incomplete', 'مدخلاته غير مكتملة.');
}

/**
 * أيّام الدورة بجولة مسجّلة من كلّ أيّامها: عدّ واحد لجملة قسم الأيّام («{days} بلا جولة مسجّلة.») ولملاحظة «الحيّ» في المؤشّرات (مراجعة 0027 S2)،
 * فلا تختلفان أبداً.
 */
const roundsOf = (days: readonly CycleDay[]) => ({ recorded: days.filter((day) => day.round).length, all: days.length });

/** صفوف المؤشّرات بترتيبها؛ والوزن ومعامل التحويل ومؤشّر الإنتاج للّاحم (والوزن للبيّاض إن وُزن). */
function kpiRows(report: CycleReport, cycle: CycleDetail): Kpi[] {
  const k = cycle.kpis;
  const { flock } = report;
  const noDays = t('halls.rep.kpi.no_days', 'لا أيّام في التقرير بعد.');
  const kg = (value: bigint | null) => (value === null ? null : fmtQtyCell(value, decimalsOf([value])));
  const rows: Kpi[] = [];
  const add = (key: string, label: string, value: string | null, note: string | null, reason: string = noDays) => {
    rows.push({ key, label, value, note: value === null ? reason : note });
  };
  // اكتمال الجولات تحت «الحيّ»: الحيّ والنفوق والحيوية من الجولات المسجّلة وحدها، فيقال كم يوماً منها سُجّل؛ وبلا جولة أصلاً لا نافق ولا مستبعد يُذكر.
  const rounds = roundsOf(cycle.days);
  const counted = k.dead !== null && k.culled !== null ? t('halls.rep.kpi.live_note', 'النافق {dead} والمستبعد {culled}.', { dead: k.dead, culled: k.culled }) : null;
  const liveNote =
    rounds.recorded === 0
      ? t('halls.rep.kpi.no_rounds', 'لم تُسجَّل جولة بعد.')
      : rounds.recorded < rounds.all
        ? [counted, t('halls.rep.kpi.rounds', 'سُجّلت الجولة في {n} من {days}.', { n: rounds.recorded, days: ofDaysText(rounds.all) })].filter((text) => text !== null).join(' ')
        : counted;
  add('days', t('halls.rep.kpi.days', 'أيّام الدورة'), fmtInt(k.days), k.days > 0 ? t('halls.rep.kpi.days_note', 'من {from} حتى {to}.', { from: fmtDay(flock.placedOn), to: fmtDay(report.through) }) : null);
  add('age', t('halls.rep.kpi.age', 'العمر (يوم)'), k.ageEnd === null ? null : fmtInt(k.ageEnd), t('halls.rep.kpi.age_note', 'العمر عند التسكين: {n}.', { n: flock.age0 }));
  add('placed', t('halls.rep.col.placed', 'المسكَّن'), fmtInt(k.placed), null);
  add('live', t('halls.rep.col.live', 'الحيّ'), k.live === null ? null : fmtInt(k.live), liveNote);
  add('mortality', t('halls.rep.col.mortality', 'نسبة النفوق'), k.mortalityPct === null ? null : pct(k.mortalityPct), null);
  add('livability', t('halls.rep.kpi.livability', 'نسبة الحيوية'), k.livabilityPct === null ? null : pct(k.livabilityPct), t('halls.rep.kpi.livability_note', 'نسبة ما بقي حيّاً من المسكَّن.'));
  add(
    'given',
    t('halls.rep.kpi.given', 'العلف النازل للقاعة (كغم)'),
    kg(k.feedGivenKg),
    report.feed.unweighed > 0 ? outsideKgText(report.feed.unweighed) : null,
  );
  add('eaten', t('halls.rep.kpi.eaten', 'العلف المأكول المسجّل (كغم)'), kg(k.feedEatenKg), feedDaysText(k.feedDays, k.feedSpan));
  add('left', t('halls.rep.kpi.left', 'العلف الباقي في القاعة (كغم)'), kg(k.feedLeftKg), k.feedLeftKg !== null && k.feedLeftKg < 0n ? leftNegativeText(report.feed.unweighed) : null);
  add(
    'per_bird',
    t('halls.rep.kpi.per_bird', 'العلف لكلّ طير مسكَّن (كغم)'),
    kg(k.feedPerBirdKg),
    null,
    k.days === 0 ? noDays : t('halls.rep.kpi.per_bird_none', 'لم يُسجَّل علف مأكول بعد.'),
  );
  if (flock.kind === 'broiler' || k.lastWeight !== null) {
    add(
      'weight',
      t('halls.rep.kpi.weight', 'آخر وزن عيّنة (غم)'),
      k.lastWeight === null ? null : fmtScaledCell(k.lastWeight.avgG, 1, 1),
      k.lastWeight === null ? null : t('halls.rep.kpi.weight_note', 'يوم {day}، والعمر {age}.', { day: fmtDay(k.lastWeight.on), age: k.lastWeight.age }),
      t('halls.rep.kpi.weight_none', 'لم تُوزن عيّنة بعد.'),
    );
  }
  if (flock.kind === 'broiler') {
    add('fcr', t('halls.rep.kpi.fcr', 'معامل التحويل الغذائي'), k.fcr === null ? null : fmtScaledCell(k.fcr, 3, 3), t('halls.rep.kpi.fcr_note', 'كغم علف لكلّ كغم من الوزن الحيّ.'), fcrReason(k));
    add(
      'epef',
      t('halls.rep.kpi.epef', 'مؤشّر الإنتاج (EPEF)'),
      k.epef === null ? null : fmtScaledCell(k.epef, 0, 0),
      t('halls.rep.kpi.epef_note', 'الحيوية × الوزن بالكيلو ÷ (العمر × معامل التحويل) × 100.'),
      epefReason(k),
    );
  }
  return rows;
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

/**
 * مؤشّرات الدورة أوّل التقرير (0027): عمودان يتّسعان للهاتف، المؤشّر وتحته ملاحظته، والقيمة؛ والقيمة الناقصة «—» وتحت مؤشّرها سببها بحبر النصّ
 * (والملاحظة العاديّة باهتة).
 */
function KpiSection({ report, cycle }: { report: CycleReport; cycle: CycleDetail }) {
  const kpiColumns: Column<Kpi>[] = [
    {
      key: 'label',
      header: t('halls.rep.col.kpi', 'المؤشّر'),
      wrap: true,
      cell: (row) => (
        <>
          <span className="block" data-action="kpi-label" data-key={row.key}>
            {row.label}
          </span>
          {row.note === null ? null : (
            <span className={row.value === null ? 'block text-xs' : 'block text-xs text-ink-muted'} data-action={row.value === null ? 'kpi-reason' : 'kpi-note'} data-key={row.key}>
              {row.note}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'value',
      header: t('halls.rep.col.value_kpi', 'القيمة'),
      kind: 'number',
      cell: (row) => (
        <span className="font-semibold" data-action="kpi-value" data-key={row.key}>
          {row.value === null ? dash() : <Num>{row.value}</Num>}
        </span>
      ),
    },
  ];
  return (
    <Section title={t('halls.rep.sec.kpis', 'مؤشّرات الدورة')} action="rep-kpis">
      <DataTable caption={t('halls.rep.sec.kpis', 'مؤشّرات الدورة')} columns={kpiColumns} rows={kpiRows(report, cycle)} rowKey={(row) => row.key} empty={dash()} />
    </Section>
  );
}

/** الرسوم وجداول الأسابيع والأيّام والأوزان (0027)؛ مجاميعها من مؤشّرات الخادم. */
function CycleSections({ report, cycle }: { report: CycleReport; cycle: CycleDetail }) {
  const { days, weeks, weights, kpis } = cycle;
  const broiler = report.flock.kind === 'broiler';
  const layer = report.flock.kind === 'layer';
  const showWeight = broiler || weights.length > 0;
  const intCell = (value: number | null) => (value === null ? dash() : <Num>{fmtInt(value)}</Num>);
  const pctCell = (value: bigint | null) => (value === null ? dash() : <Num>{pct(value)}</Num>);
  const kgCell = (value: bigint | null, decimals: 0 | 1 | 2 | 3) => (value === null ? dash() : <Num>{fmtQtyCell(value, decimals)}</Num>);
  const grams = (tenths: bigint) => <Num>{fmtScaledCell(tenths, 1, 1)}</Num>;
  const rounds = roundsOf(days);
  const missing = rounds.all - rounds.recorded;
  // المجموع من المؤشّرات (kpis) كما هو، إلّا حين لا يُجمع شيء: دورة بلا جولة مسجّلة نافقها ومستبعدها «—» لا صفر، وبلا علف مأكول مسجّل مأكولها «—»
  // (كصفوفها وكالأسبوع بلا جولة؛ مراجعة 0027 S1).
  const deadTotal = (value: number | null) => (rounds.recorded > 0 ? intCell(value) : dash());
  const eatenAny = days.some((day) => day.feedEatenKg !== null);

  const weekKg = decimalsOf([...weeks.map((week) => week.feedEatenKg), kpis.feedEatenKg]);
  const weekColumns: Column<CycleWeek>[] = [
    { key: 'week', header: t('halls.rep.col.week', 'الأسبوع'), cell: (week) => <Num>{fmtInt(week.week)}</Num> },
    {
      key: 'ages',
      header: t('halls.rep.col.ages', 'العمر (يوم)'),
      cell: (week) => <Num>{week.fromAge === week.toAge ? fmtInt(week.fromAge) : t('halls.rep.week.ages', '{from}–{to}', { from: week.fromAge, to: week.toAge })}</Num>,
    },
    { key: 'from', header: t('halls.rep.col.from', 'من'), cell: (week) => <Num>{fmtDay(week.fromOn)}</Num> },
    { key: 'to', header: t('halls.rep.col.to', 'إلى'), cell: (week) => <Num>{fmtDay(week.toOn)}</Num> },
    {
      key: 'rounds',
      header: t('halls.rep.col.rounds', 'الجولات'),
      cell: (week) => (
        <span className={week.roundDays < week.days ? WARN_INK : undefined} data-action="week-rounds">
          {t('halls.rep.week.rounds', '{n} من {m}', { n: week.roundDays, m: week.days })}
        </span>
      ),
    },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (week) => intCell(week.dead), total: deadTotal(kpis.dead) },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (week) => intCell(week.culled), total: deadTotal(kpis.culled) },
    { key: 'mortality', header: t('halls.rep.col.week_mortality', 'نفوق الأسبوع'), kind: 'number', cell: (week) => pctCell(week.mortalityPct) },
    { key: 'cum', header: t('halls.rep.col.mortality_cum', 'النفوق التراكميّ'), kind: 'number', cell: (week) => pctCell(week.mortalityCumPct) },
    { key: 'live', header: t('halls.rep.col.live_week_end', 'الحيّ آخر الأسبوع'), kind: 'number', cell: (week) => <Num>{fmtInt(week.liveEnd)}</Num> },
    { key: 'eaten', header: t('halls.rep.col.eaten', 'المأكول (كغم)'), kind: 'number', cell: (week) => kgCell(week.feedEatenKg, weekKg), total: eatenAny ? kgCell(kpis.feedEatenKg, weekKg) : dash() },
    {
      key: 'per_bird',
      header: t('halls.rep.col.g_per_bird', 'غم لكلّ طير في اليوم'),
      kind: 'number',
      cell: (week) => (week.feedGPerBirdDay === null ? dash() : <Num>{fmtScaledCell(week.feedGPerBirdDay, 1, 1)}</Num>),
    },
    ...(showWeight
      ? [{ key: 'weight', header: t('halls.rep.col.weight', 'الوزن (غم)'), kind: 'number' as const, cell: (week: CycleWeek) => (week.weight === null ? dash() : grams(week.weight.avgG)) }]
      : []),
    ...(broiler
      ? [{ key: 'fcr', header: t('halls.rep.col.fcr', 'معامل التحويل'), kind: 'number' as const, cell: (week: CycleWeek) => (week.fcr === null ? dash() : <Num>{fmtScaledCell(week.fcr, 3, 3)}</Num>) }]
      : []),
  ];

  const eatenKg = decimalsOf([...days.map((day) => day.feedEatenKg), kpis.feedEatenKg]);
  const eatenCumKg = decimalsOf(days.map((day) => day.feedEatenCumKg));
  const givenKg = decimalsOf([...days.map((day) => day.feedGivenKg), kpis.feedGivenKg]);
  const givenCumKg = decimalsOf(days.map((day) => day.feedGivenCumKg));
  const leftKg = decimalsOf(days.map((day) => day.feedLeftKg));
  const dayColumns: Column<CycleDay>[] = [
    { key: 'on', header: t('halls.rep.col.date', 'التاريخ'), sticky: true, cell: (day) => <Num>{fmtDay(day.on)}</Num> },
    { key: 'age', header: t('halls.rep.col.age_short', 'العمر'), kind: 'number', cell: (day) => <Num>{fmtInt(day.age)}</Num> },
    { key: 'start', header: t('halls.rep.col.live_start', 'الحيّ أوّل اليوم'), kind: 'number', cell: (day) => <Num>{fmtInt(day.liveStart)}</Num> },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (day) => intCell(day.dead), total: deadTotal(kpis.dead) },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (day) => intCell(day.culled), total: deadTotal(kpis.culled) },
    { key: 'end', header: t('halls.rep.col.live_end', 'الحيّ آخر اليوم'), kind: 'number', cell: (day) => <Num>{fmtInt(day.liveEnd)}</Num> },
    { key: 'cum', header: t('halls.rep.col.mortality_cum', 'النفوق التراكميّ'), kind: 'number', cell: (day) => pctCell(day.mortalityCumPct) },
    { key: 'eaten', header: t('halls.rep.col.eaten', 'المأكول (كغم)'), kind: 'number', cell: (day) => kgCell(day.feedEatenKg, eatenKg), total: eatenAny ? kgCell(kpis.feedEatenKg, eatenKg) : dash() },
    { key: 'eaten_cum', header: t('halls.rep.col.eaten_cum', 'المأكول التراكميّ (كغم)'), kind: 'number', cell: (day) => kgCell(day.feedEatenCumKg, eatenCumKg) },
    {
      key: 'given',
      header: t('halls.rep.col.given', 'النازل (كغم)'),
      kind: 'number',
      // سطور اليوم بلا وزن تحت كيلوه (كجدول المادّة)، فلا يبدو يوم نزلت فيه أكياس بلا وزن «0» لم ينزل فيه شيء (مراجعة 0027 S3).
      cell: (day) =>
        day.feedGivenUnweighed > 0 ? (
          <>
            {kgCell(day.feedGivenKg, givenKg)}
            <span className="block text-xs text-ink-muted" data-action="rep-day-unweighed">
              {t('halls.rep.item_unweighed', 'و{lines} بلا وزن', { lines: linesText(day.feedGivenUnweighed) })}
            </span>
          </>
        ) : (
          kgCell(day.feedGivenKg, givenKg)
        ),
      // والمجموع كصفوفه: سطور الدورة بلا وزن من الخادم (feed.unweighed، لا جمع هنا) تحت كيلوه، فلا «0» وحده لدورة نزل علفها بلا وزن (مراجعة 0027 RR27-S3b).
      total:
        report.feed.unweighed > 0 ? (
          <>
            {kgCell(kpis.feedGivenKg, givenKg)}
            <span className="block text-xs font-normal text-ink-muted" data-action="rep-total-unweighed">
              {t('halls.rep.item_unweighed', 'و{lines} بلا وزن', { lines: linesText(report.feed.unweighed) })}
            </span>
          </>
        ) : (
          kgCell(kpis.feedGivenKg, givenKg)
        ),
    },
    { key: 'given_cum', header: t('halls.rep.col.given_cum', 'النازل التراكميّ (كغم)'), kind: 'number', cell: (day) => kgCell(day.feedGivenCumKg, givenCumKg) },
    { key: 'left', header: t('halls.rep.col.left', 'الباقي في القاعة (كغم)'), kind: 'number', cell: (day) => kgCell(day.feedLeftKg, leftKg) },
    ...(showWeight
      ? [{ key: 'weight', header: t('halls.rep.col.weight', 'الوزن (غم)'), kind: 'number' as const, cell: (day: CycleDay) => (day.weight === null ? null : grams(day.weight.avgG)) }]
      : []),
    ...(layer
      ? [
          { key: 'eggs', header: t('round.eggs_total', 'البيض (المجموع)'), kind: 'number' as const, cell: (day: CycleDay) => intCell(day.eggsTotal) },
          { key: 'hdep', header: t('flock.col.hdep', 'نسبة الإنتاج'), kind: 'number' as const, cell: (day: CycleDay) => pctCell(day.hdep) },
        ]
      : []),
    {
      key: 'note',
      header: t('halls.rep.col.note', 'الملاحظة'),
      wrap: true,
      cell: (day) => (
        <>
          {!day.round ? (
            <span className={`block ${WARN_INK}`} data-action="rep-no-round">
              {t('halls.rep.no_round', 'لم تُسجَّل الجولة')}
            </span>
          ) : day.feedEatenKg === null ? (
            <span className="block text-ink-muted" data-action="rep-no-feed">
              {t('halls.rep.no_feed', 'لم يُسجَّل العلف')}
            </span>
          ) : null}
          {day.note !== null ? <span className="block">{day.note}</span> : null}
        </>
      ),
    },
  ];

  const weightColumns: Column<WeightRow>[] = [
    { key: 'on', header: t('halls.rep.col.date', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.on)}</Num> },
    { key: 'age', header: t('halls.rep.col.age_short', 'العمر'), kind: 'number', cell: (row) => <Num>{fmtInt(row.age)}</Num> },
    { key: 'samples', header: t('flock.weight.samples', 'عدد طيور العيّنة'), kind: 'number', cell: (row) => <Num>{fmtInt(row.sampleCount)}</Num> },
    { key: 'avg', header: t('flock.weight.avg', 'معدّل وزن الطير (غرام)'), kind: 'number', cell: (row) => grams(row.avgG) },
  ];

  return (
    <>
      <Section title={t('halls.rep.sec.charts', 'رسوم الدورة')} action="rep-charts">
        <div className="flex flex-wrap gap-4">
          <MortalityChart days={days} />
          <FeedChart weeks={weeks} />
          {showWeight ? <WeightChart days={days} weights={weights} /> : null}
        </div>
      </Section>
      <Section
        title={t('halls.rep.sec.weeks', 'الأسابيع')}
        action="rep-weeks"
        note={
          <p className="text-sm text-ink-muted" data-action="rep-weeks-note">
            {t('halls.rep.weeks_note', 'الأسبوع بعمر الطيور: الأوّل للأعمار حتى 7، والثاني من 8 إلى 14، وهكذا.')}
          </p>
        }
      >
        <DataTable caption={t('halls.rep.sec.weeks', 'الأسابيع')} columns={weekColumns} rows={weeks} rowKey={(week) => String(week.week)} empty={t('halls.rep.kpi.no_days', 'لا أيّام في التقرير بعد.')} totalLabel={t('halls.rep.total', 'المجموع')} />
      </Section>
      <Section
        title={t('halls.rep.sec.days', 'أيّام الدورة')}
        action="rep-days"
        note={
          missing > 0 || report.feed.unweighed > 0 ? (
            <>
              {missing > 0 ? (
                <p className={`text-sm ${WARN_INK}`} data-action="rep-days-missing">
                  {t('halls.rep.days_missing', '{days} بلا جولة مسجّلة.', { days: daysText(missing) })}
                </p>
              ) : null}
              {report.feed.unweighed > 0 ? (
                <p className="text-sm text-ink-muted" data-action="rep-days-unweighed">
                  {t('halls.rep.days_unweighed_cum', 'النازل التراكميّ والباقي في القاعة لا يشملان {lines} بلا وزن.', { lines: linesText(report.feed.unweighed) })}
                </p>
              ) : null}
            </>
          ) : undefined
        }
      >
        <DataTable caption={t('halls.rep.sec.days', 'أيّام الدورة')} columns={dayColumns} rows={days} rowKey={(day) => day.on} empty={t('halls.rep.kpi.no_days', 'لا أيّام في التقرير بعد.')} totalLabel={t('halls.rep.total', 'المجموع')} />
      </Section>
      {showWeight ? (
        <Section title={t('halls.rep.sec.weights', 'أوزان العيّنات')} action="rep-weights">
          <DataTable caption={t('halls.rep.sec.weights', 'أوزان العيّنات')} columns={weightColumns} rows={weights} rowKey={(row) => row.on} empty={t('halls.rep.kpi.weight_none', 'لم تُوزن عيّنة بعد.')} />
        </Section>
      ) : null}
    </>
  );
}

function ReportBody({ report }: { report: CycleReport }) {
  const { birds, feed, medicines, vaccines, money, cycle } = report;
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

  // كيلو المادّة مجموع سطورها الموزونة، فالعمود يُجمع إلى «المصروف للقاعة»؛ ومادّة بعض سطورها بلا وزن تقول ذلك تحت رقمها، فلا يبدو كيلوها كاملاً
  // (مراجعة 0026 C: كان «—» للمادّة كلّها، والمجموع أكبر من الصفوف).
  const itemColumns: Column<ByItem>[] = [
    { key: 'item', header: t('halls.rep.col.item', 'المادّة'), wrap: true, cell: (row) => row.name },
    { key: 'qty', header: t('halls.rep.col.qty', 'الكمية'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.qty, itemQty)}</Num> },
    { key: 'unit', header: t('halls.rep.col.unit', 'الوحدة'), cell: (row) => unitWord(row.baseUnit) },
    {
      key: 'kg',
      header: t('halls.rep.col.kg', 'الكيلو (كغم)'),
      kind: 'number',
      cell: (row) =>
        row.kg !== null && row.unweighed > 0 ? (
          <>
            <Num>{fmtQtyCell(row.kg, kgDecimals)}</Num>
            <span className="block text-xs text-ink-muted" data-action="rep-item-unweighed">
              {t('halls.rep.item_unweighed', 'و{lines} بلا وزن', { lines: linesText(row.unweighed) })}
            </span>
          </>
        ) : (
          kgCell(row.kg, kgDecimals)
        ),
      total: <Num>{fmtQtyCell(feed.deliveredKg, kgDecimals)}</Num>,
    },
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
      {cycle ? (
        <KpiSection report={report} cycle={cycle} />
      ) : (
        <p className="text-sm text-ink-muted" data-action="rep-no-cycle">
          {t('halls.rep.no_cycle', 'المؤشّرات وجداول الأسابيع والأيّام تظهر بعد تحديث الخادم.')}
        </p>
      )}
      <Section title={t('halls.rep.sec.birds', 'الطيور')} action="rep-birds">
        <DataTable caption={t('halls.rep.sec.birds', 'الطيور')} columns={birdColumns} rows={[birds]} rowKey={() => 'birds'} empty={dash()} />
      </Section>
      {cycle ? <CycleSections report={report} cycle={cycle} /> : null}
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
      <BackLink to={back} label={backLabel(back)} />
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
