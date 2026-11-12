import { useId, type ReactNode } from 'react';
import { columnDecimals, fmtDay, fmtInt, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { CycleDay, CycleWeek, SampleWeight } from '../../lib/repo/halls';

// رسوم تقرير الدورة (0027، P1 في docs/HALLS_REPORTS_PLAN.md): ثلاثة رسوم صغيرة بـSVG داخل الصفحة بلا مكتبة، والجداول تحتها دائماً تحمل كلّ رقم:
// النفوق التراكميّ ٪ بالعمر، وغرام العلف لكلّ طير في اليوم لكلّ أسبوع، ومنحنى الوزن بالعمر. لكلّ رسم محور صادات واحد بوحدته، وتسمية مباشرة لآخر
// نقطة (ولقمّة كلّ عمود حين الأعمدة قليلة)، و<title>/<desc> لقارئ الشاشة. الألوان من رموز CSS (--ring للبيانات، --line للشبكة، --ink للنصّ،
// --surface-1 لحلقة النقطة) بأنماط مكتوبة في العنصر نفسه، بلا صنف Tailwind جديد، فتتبع الوضعين الفاتح والداكن، والطباعة فاتحة دائماً (display.ts).
// والزمن من اليسار إلى اليمين (direction: ltr داخل الرسم) كالأرقام والتواريخ في الجداول. الرسم لا يكبر عن مقاسه (22rem) فلا يكبر خطّه، ويصغر
// بعرض الهاتف؛ والقيم بالأعداد الصحيحة بمراتبها (bigint) حتى الهندسة، فلا NaN في مسار.

const W = 352;
const H = 200;
const LEFT = 46;
const RIGHT = 14;
const TOP = 24;
const BOTTOM = 34;
const X0 = LEFT;
const X1 = W - RIGHT;
const Y_BASE = H - BOTTOM;
const PLOT_H = Y_BASE - TOP;
const BAR_MAX = 24;
const TICK_GAP = 24;
/** أدنى مسافة بين مركزي رقمي أسبوعين (رقمان بخطّ 11 قرابة 13 بكسلاً) وبين تسميتي قيمتين («119.9» قرابة 33 بكسلاً). */
const WEEK_GAP = 16;
const VALUE_GAP = 34;

const DATA = 'rgb(var(--ring))';
const GRID = 'rgb(var(--line))';
const AXIS = 'rgb(var(--line-strong))';
const MUTED = 'rgb(var(--ink-muted))';
const INK = 'rgb(var(--ink))';
const RING = 'rgb(var(--surface-1))';

const TEXT_STYLE = { fill: MUTED, fontVariantNumeric: 'tabular-nums' } as const;
const LABEL_STYLE = { fill: INK, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } as const;
const FIGURE_STYLE = { flex: '1 1 18rem', maxWidth: '22rem', breakInside: 'avoid' } as const;
const SVG_STYLE = { width: '100%', height: 'auto', direction: 'ltr', overflow: 'visible' } as const;

/** إحداثيّ بمرتبة واحدة؛ وغير المنتهي لا يدخل مساراً أبداً (النقطة تُترك). */
const coord = (value: number): number | null => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);

/** أصغر خطوة «لطيفة» (1 أو 2 أو 5 × 10^k) لا تقلّ عن raw. */
function niceStep(raw: bigint): bigint {
  let base = 1n;
  while (base * 10n <= raw) base *= 10n;
  for (const factor of [1n, 2n, 5n, 10n]) if (factor * base >= raw) return factor * base;
  return 10n * base;
}

/**
 * علامات محور الصادات من الصفر بأربع فترات على الأكثر، بوحدة القيم نفسها (bigint بمراتب scale). والقيم كلّها صفر: المدى empty (مقياس معقول
 * بلا بيانات تُضخَّم).
 */
export function yTicks(values: readonly bigint[], empty: bigint): bigint[] {
  const max = values.reduce((top, value) => (value > top ? value : top), 0n);
  const reach = max > 0n ? max : empty;
  const step = niceStep((reach + 3n) / 4n > 0n ? (reach + 3n) / 4n : 1n);
  const top = ((reach + step - 1n) / step) * step;
  const ticks: bigint[] = [];
  for (let tick = 0n; tick <= top; tick += step) ticks.push(tick);
  return ticks;
}

/** علامات الأعمار: مضاعفات الأسبوع (بخطوة تبقيها ستّاً على الأكثر) وطرفا المدى، بلا علامتين متلاصقتين. */
function ageTicks(from: number, to: number, xOf: (age: number) => number): number[] {
  const span = Math.max(1, to - from);
  const step = 7 * Math.max(1, Math.ceil(span / 42));
  const candidates = [from];
  for (let age = Math.ceil(from / step) * step; age <= to; age += step) candidates.push(age);
  candidates.push(to);
  const kept: number[] = [];
  for (const age of [...new Set(candidates)].sort((a, b) => a - b)) {
    const last = kept[kept.length - 1];
    if (last === undefined || xOf(age) - xOf(last) >= TICK_GAP) kept.push(age);
    else if (age === to && kept.length > 1) kept[kept.length - 1] = age;
  }
  return kept;
}

interface Scale {
  ticks: bigint[];
  scale: number;
  decimals: number;
  top: bigint;
}

const scaleOf = (values: readonly bigint[], scale: number, empty: bigint): Scale => {
  const ticks = yTicks(values, empty);
  return { ticks, scale, decimals: columnDecimals(ticks, scale), top: ticks[ticks.length - 1] ?? 1n };
};
const yOf = (value: bigint, s: Scale): number => Y_BASE - (Number(value) / Number(s.top > 0n ? s.top : 1n)) * PLOT_H;

/** الشبكة ومحور الصادات بعلاماته ووحدته فوقه. */
function YAxis({ s, unit }: { s: Scale; unit: string }) {
  return (
    <g data-part="y-axis">
      <text x={X0 - 6} y={TOP - 9} textAnchor="end" fontSize={11} style={TEXT_STYLE} data-part="unit">
        {unit}
      </text>
      {s.ticks.map((tick) => {
        const y = coord(yOf(tick, s)) ?? Y_BASE;
        return (
          <g key={tick.toString()}>
            <line x1={X0} x2={X1} y1={y} y2={y} strokeWidth={1} style={{ stroke: tick === 0n ? AXIS : GRID }} />
            <text x={X0 - 6} y={y + 4} textAnchor="end" fontSize={11} style={TEXT_STYLE} data-part="y-tick">
              {fmtScaledCell(tick, s.scale, s.decimals)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** عنوان محور السينات تحت علاماته عند طرفه. */
function XTitle({ text }: { text: string }) {
  return (
    <text x={X1} y={H - 4} textAnchor="end" fontSize={11} style={TEXT_STYLE} data-part="x-title">
      {text}
    </text>
  );
}

/** إطار الرسم: عنوانه فوقه، والـSVG بعنوانه ووصفه لقارئ الشاشة؛ وبلا بيانات جملة بدل الرسم. */
function Figure({ action, title, desc, empty, children }: { action: string; title: string; desc: string; empty: string | null; children: ReactNode }) {
  const id = useId();
  return (
    <figure className="flex flex-col gap-2 rounded-lg border border-line bg-surface-1 p-3" style={FIGURE_STYLE} data-action={action}>
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      {empty !== null ? (
        <p className="text-sm text-ink-muted" data-part="chart-empty">
          {empty}
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}t ${id}d`} style={SVG_STYLE} data-part="chart">
          <title id={`${id}t`}>{title}</title>
          <desc id={`${id}d`}>{desc}</desc>
          {children}
        </svg>
      )}
    </figure>
  );
}

interface Point {
  x: number;
  y: number;
}

const pathOf = (points: readonly Point[]): string => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

/** محور الأعمار المشترك بين رسمي النفوق والوزن: من أوّل يوم في التقرير إلى آخره. */
function ageAxis(days: readonly CycleDay[]) {
  const from = days[0]?.age ?? 0;
  const to = days[days.length - 1]?.age ?? from;
  const span = Math.max(1, to - from);
  const xOf = (age: number) => X0 + ((age - from) / span) * (X1 - X0);
  return { from, to, xOf, ticks: ageTicks(from, to, xOf) };
}

function AgeTicks({ ticks, xOf }: { ticks: readonly number[]; xOf: (age: number) => number }) {
  return (
    <g data-part="x-axis">
      {ticks.map((age) => (
        <text key={age} x={coord(xOf(age)) ?? X0} y={Y_BASE + 14} textAnchor="middle" fontSize={11} style={TEXT_STYLE} data-part="x-tick">
          {fmtInt(age)}
        </text>
      ))}
    </g>
  );
}

/** تسمية آخر نقطة: فوقها إلى يسارها، وإلى يمينها حين لا يتّسع يسارها (نقطة قرب المحور)، ولا تخرج من أعلى الرسم. */
function EndLabel({ point, text }: { point: Point; text: string }) {
  const left = point.x - X0 > text.length * 7 + 8;
  return (
    <text x={left ? point.x - 6 : point.x + 8} y={Math.max(TOP - 4, point.y - 9)} textAnchor={left ? 'end' : 'start'} fontSize={11} style={LABEL_STYLE} data-part="last-label">
      {text}
    </text>
  );
}

const pctText = (hundredths: bigint, decimals: number): string => `${fmtScaledCell(hundredths, 2, decimals)}%`;

/** النفوق التراكميّ ٪ في كلّ يوم بالعمر. */
export function MortalityChart({ days }: { days: readonly CycleDay[] }) {
  const series = days.filter((day): day is CycleDay & { mortalityCumPct: bigint } => day.mortalityCumPct !== null);
  const s = scaleOf(
    series.map((day) => day.mortalityCumPct),
    2,
    100n,
  );
  const axis = ageAxis(days);
  const points = series.flatMap((day) => {
    const x = coord(axis.xOf(day.age));
    const y = coord(yOf(day.mortalityCumPct, s));
    return x === null || y === null ? [] : [{ x, y }];
  });
  const first = series[0];
  const last = series[series.length - 1];
  const end = points[points.length - 1];
  const title = t('halls.rep.chart.mortality', 'النفوق التراكميّ (٪) بالعمر');
  const desc =
    first && last
      ? t('halls.rep.chart.mortality_desc', 'النفوق التراكميّ من {from} في العمر {a0} إلى {to} في العمر {a1}.', {
          from: pctText(first.mortalityCumPct, 2),
          a0: first.age,
          to: pctText(last.mortalityCumPct, 2),
          a1: last.age,
        })
      : title;
  return (
    <Figure action="chart-mortality" title={title} desc={desc} empty={points.length === 0 || !last ? t('halls.rep.chart.no_days', 'لا أيّام في التقرير بعد.') : null}>
      <YAxis s={s} unit="%" />
      <AgeTicks ticks={axis.ticks} xOf={axis.xOf} />
      <XTitle text={t('halls.rep.chart.age_axis', 'العمر (يوم)')} />
      <path d={pathOf(points)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: DATA }} data-part="line" />
      {end && last ? (
        <>
          <circle cx={end.x} cy={end.y} r={4} strokeWidth={2} style={{ fill: DATA, stroke: RING }} data-part="last-dot" />
          <EndLabel point={end} text={pctText(last.mortalityCumPct, 2)} />
        </>
      ) : null}
    </Figure>
  );
}

/** غرام العلف لكلّ طير في اليوم لكلّ أسبوع: عمود لكلّ أسبوع، والأسبوع بلا علف مسجّل «—» عند القاعدة (لا صفر). */
export function FeedChart({ weeks }: { weeks: readonly CycleWeek[] }) {
  const values = weeks.flatMap((week) => (week.feedGPerBirdDay === null ? [] : [week.feedGPerBirdDay]));
  const s = scaleOf(values, 1, 100n);
  const decimals = columnDecimals(values, 1);
  const n = Math.max(1, weeks.length);
  const band = (X1 - X0) / n;
  const width = Math.min(BAR_MAX, band * 0.6);
  const labelAll = weeks.length <= 8;
  // القمّة (أوّل أعلى أسبوع) وآخر أسبوع بعلف تُسمّيان حين لا تُسمّى الأعمدة كلّها، إلّا أن تتقاربا أقلّ من عرض تسمية: آخر أسبوع وحده (مراجعة 0027 S6).
  let peakIndex = -1;
  let lastFedIndex = -1;
  for (const [index, week] of weeks.entries()) {
    const value = week.feedGPerBirdDay;
    if (value === null) continue;
    const best = weeks[peakIndex]?.feedGPerBirdDay ?? null;
    if (best === null || value > best) peakIndex = index;
    lastFedIndex = index;
  }
  const peakLabelled = peakIndex >= 0 && (lastFedIndex - peakIndex) * band >= VALUE_GAP;
  // أرقام الأسابيع بخطوة every، وآخر أسبوع دائماً: يحلّ محلّ آخر رقم قبله إن قاربه أقلّ من WEEK_GAP (كعلامات الأعمار)، فلا يتراكب رقمان.
  const every = Math.max(1, Math.ceil(weeks.length / 10));
  const weekTicks = new Set<number>();
  for (let index = 0; index < weeks.length; index += every) weekTicks.add(index);
  const final = weeks.length - 1;
  if (final > 0 && !weekTicks.has(final)) {
    const before = final - (final % every);
    if (before > 0 && (final - before) * band < WEEK_GAP) weekTicks.delete(before);
    weekTicks.add(final);
  }
  const title = t('halls.rep.chart.feed', 'العلف لكلّ طير في اليوم (غم) بالأسبوع');
  const desc = t('halls.rep.chart.feed_desc', 'غرام العلف المأكول لكلّ طير في اليوم: {weeks}.', {
    weeks: weeks
      .map((week) =>
        t('halls.rep.chart.feed_week', 'الأسبوع {week}: {value}', {
          week: week.week,
          value: week.feedGPerBirdDay === null ? t('halls.rep.chart.no_feed_week', 'بلا علف مسجّل') : fmtScaledCell(week.feedGPerBirdDay, 1, decimals),
        }),
      )
      .join(t('halls.rep.chart.sep', '، ')),
  });
  return (
    <Figure action="chart-feed" title={title} desc={desc} empty={values.length === 0 ? t('halls.rep.chart.no_feed', 'لم يُسجَّل علف مأكول بعد.') : null}>
      <YAxis s={s} unit={t('halls.rep.chart.g', 'غم')} />
      <XTitle text={t('halls.rep.chart.week_axis', 'الأسبوع')} />
      {weeks.map((week, index) => {
        const cx = X0 + band * (index + 0.5);
        const value = week.feedGPerBirdDay;
        const weekLabel = weekTicks.has(index) ? (
          <text x={coord(cx) ?? X0} y={Y_BASE + 14} textAnchor="middle" fontSize={11} style={TEXT_STYLE} data-part="x-tick">
            {fmtInt(week.week)}
          </text>
        ) : null;
        if (value === null) {
          return (
            <g key={week.week} data-part="bar-missing">
              <text x={coord(cx) ?? X0} y={Y_BASE - 4} textAnchor="middle" fontSize={11} style={TEXT_STYLE}>
                {t('halls.rep.dash', '—')}
              </text>
              {weekLabel}
            </g>
          );
        }
        const height = (Number(value) / Number(s.top > 0n ? s.top : 1n)) * PLOT_H;
        const r = Math.min(4, width / 2, height);
        // العمود بزاويتين مدوّرتين عند قيمته ومربّع عند القاعدة؛ وأيّ إحداثيّ غير منتهٍ يترك العمود (التسمية والجدول باقيان).
        const [left, right, top, topR, leftR, rightR] = [cx - width / 2, cx + width / 2, Y_BASE - height, Y_BASE - height + r, cx - width / 2 + r, cx + width / 2 - r].map(coord);
        const bar =
          height > 0 && left !== null && right !== null && top !== null && topR !== null && leftR !== null && rightR !== null
            ? `M${left} ${Y_BASE} V${topR} Q${left} ${top} ${leftR} ${top} H${rightR} Q${right} ${top} ${right} ${topR} V${Y_BASE} Z`
            : null;
        const labelled = labelAll || index === lastFedIndex || (peakLabelled && index === peakIndex);
        const text = fmtScaledCell(value, 1, decimals);
        return (
          <g key={week.week} data-part="bar-group">
            {bar !== null ? (
              <path d={bar} style={{ fill: DATA }} data-part="bar">
                <title>{t('halls.rep.chart.feed_week', 'الأسبوع {week}: {value}', { week: week.week, value: text })}</title>
              </path>
            ) : null}
            {labelled ? (
              <text x={coord(cx) ?? X0} y={(top ?? Y_BASE) - 5} textAnchor="middle" fontSize={11} style={LABEL_STYLE} data-part="bar-label">
                {text}
              </text>
            ) : null}
            {weekLabel}
          </g>
        );
      })}
    </Figure>
  );
}

/** منحنى الوزن: كلّ عيّنة نقطة بعمرها على محور أعمار التقرير، والخطّ بينها، وآخرها مسمّاة. */
export function WeightChart({ days, weights }: { days: readonly CycleDay[]; weights: readonly (SampleWeight & { sampleCount: number })[] }) {
  const s = scaleOf(
    weights.map((weight) => weight.avgG),
    1,
    1000n,
  );
  const axis = ageAxis(days);
  const points = weights.flatMap((weight) => {
    const x = coord(axis.xOf(weight.age));
    const y = coord(yOf(weight.avgG, s));
    return x === null || y === null ? [] : [{ x, y, weight }];
  });
  const first = weights[0];
  const last = weights[weights.length - 1];
  const end = points[points.length - 1];
  const grams = (tenths: bigint) => fmtScaledCell(tenths, 1, 1);
  const title = t('halls.rep.chart.weight', 'منحنى الوزن (غم) بالعمر');
  const desc =
    first && last
      ? t('halls.rep.chart.weight_desc', 'معدّل وزن الطير من {from} غم في العمر {a0} إلى {to} غم في العمر {a1}.', {
          from: grams(first.avgG),
          a0: first.age,
          to: grams(last.avgG),
          a1: last.age,
        })
      : title;
  return (
    <Figure action="chart-weight" title={title} desc={desc} empty={points.length === 0 ? t('halls.rep.chart.no_weight', 'لم تُوزن عيّنة بعد.') : null}>
      <YAxis s={s} unit={t('halls.rep.chart.g', 'غم')} />
      <AgeTicks ticks={axis.ticks} xOf={axis.xOf} />
      <XTitle text={t('halls.rep.chart.age_axis', 'العمر (يوم)')} />
      {points.length > 1 ? (
        <path d={pathOf(points)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: DATA }} data-part="line" />
      ) : null}
      {points.map((point) => (
        <circle key={point.weight.on} cx={point.x} cy={point.y} r={4} strokeWidth={2} style={{ fill: DATA, stroke: RING }} data-part="dot">
          <title>
            {t('halls.rep.chart.weight_point', '{day}، العمر {age}: {grams} غم', { day: fmtDay(point.weight.on), age: point.weight.age, grams: grams(point.weight.avgG) })}
          </title>
        </circle>
      ))}
      {end && last ? <EndLabel point={end} text={grams(last.avgG)} /> : null}
    </Figure>
  );
}
