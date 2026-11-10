import { ArrowRight } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';
import type { Day } from '../../../domain/dates';
import { fmtInt } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { ReportDay } from '../../../lib/repo/millReport';
import {
  batchesText,
  dayLabel,
  dayNumber,
  levelOf,
  monthDays,
  monthLabel,
  NOW_RING,
  qtyText,
  shiftMonth,
  tintOf,
  tonsShort,
  weekdayOf,
  weekdays,
  yearOf,
  type Month,
} from './calendar';
import { boxesOf, boxOf, fadeIn, scrollToTop, zoomFrom, type Motion } from './flip';
import { Legend } from './Legend';

// الشهر (كلمة المالك 2026-11-10: «بحركة سينمائية يكبر المربع… واكو الوان»): بطاقة تقويم بأيام الشهر والأسبوع يبدأ بالسبت، وكلّ يوم فيه إنتاج
// ملوّن بدرجة حجمه من أكبر يوم في الشهر وعليه ناتجه بالطنّ، واليوم الحاليّ بإطار؛ والضغط على يوم فيه إنتاج يفتح تقريره (DayView). تحت البطاقة
// تقرير الشهر (ReportBody). البطاقة تكبر من بلاطة الشهر حين يُفتح من السنة، وخليّة اليوم تصغر من بطاقته حين يُرجع إليه (flip.ts). البطاقة
// تُرسم من أوّل لحظة (التقويم لا يحتاج القراءة، والألوان من قراءة السنة إن وُجدت)، فالحركة لا تنتظر الشبكة.

const SEVEN = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' } as const;
const MIRROR = { scale: '-1 1' } as const;

export function MonthView({
  month,
  days,
  today,
  nowMonth,
  report,
  motionRef,
  onYear,
  onMonth,
  onDay,
}: {
  month: Month;
  /** أيام الإنتاج في الشهر (من قراءة الشهر، أو من قراءة السنة قبلها)، أو null قبل أيّ قراءة. */
  days: readonly ReportDay[] | null;
  /** يوم الخادم (أو الجهاز قبل أوّل قراءة). */
  today: Day;
  nowMonth: Month;
  /** تقرير الشهر أو حالته (جارٍ، فشل، رفض). */
  report: ReactNode;
  motionRef: Motion;
  onYear: () => void;
  onMonth: (month: Month) => void;
  onDay: (day: Day) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const rest = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<Day, HTMLElement>());

  useLayoutEffect(() => {
    const from = motionRef.current;
    motionRef.current = null;
    if (from !== null) {
      scrollToTop();
      const tile = from.kind === 'year' ? from.cells.get(month) : undefined;
      // الرجوع من يوم: خليّته تصغر من مكان بطاقته إلى مكانها في الشبكة.
      const cell = from.kind === 'day' && from.card ? cells.current.get(from.key) : undefined;
      if (tile && zoomFrom(card.current, tile)) fadeIn([bar.current, rest.current]);
      else if (cell && from.card && zoomFrom(cell, from.card, { lift: true })) fadeIn([bar.current, rest.current]);
    }
    const cardNode = card.current;
    const nodes = cells.current;
    return () => {
      motionRef.current = { kind: 'month', key: month, card: boxOf(cardNode), cells: boxesOf(nodes) };
    };
  }, [motionRef, month]);

  const produced = new Map<Day, ReportDay>();
  let max = 0n;
  let batches = 0;
  let outputKg = 0n;
  for (const entry of days ?? []) {
    if (!entry.day.startsWith(`${month}-`)) continue;
    produced.set(entry.day, entry);
    batches += entry.batches;
    outputKg += entry.outputKg;
    if (entry.outputKg > max) max = entry.outputKg;
  }
  const all = monthDays(month);
  // خانات فارغة قبل أوّل يوم حتّى يقع تحت اسم يومه (السبت أوّل الأسبوع).
  const offset = weekdayOf(`${month}-01`);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <section className="flex flex-col gap-4" aria-label={monthLabel(month)} data-action="month-view">
      <div ref={bar} className="flex flex-wrap items-center gap-2 print:hidden" data-action="month-bar">
        <Button size="sm" variant="secondary" onClick={onYear} data-action="back-year">
          <ArrowRight aria-hidden="true" className="size-4" />
          {t('millrep.back.year', 'سنة {year}', { year: yearOf(month) })}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onMonth(prev)} disabled={prev < '2000-01'} data-action="month-prev">
          <ArrowRight aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('millrep.month.prev', 'الشهر السابق')}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onMonth(next)} disabled={next > nowMonth} data-action="month-next">
          <span className="sr-only sm:not-sr-only">{t('millrep.month.next', 'الشهر التالي')}</span>
          <ArrowRight aria-hidden="true" className="size-4" style={MIRROR} />
        </Button>
      </div>
      <div ref={card} className="card flex w-full max-w-xl flex-col gap-3 p-4 print:hidden" data-action="month-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold" data-action="month-title">
            {monthLabel(month)}
          </h2>
          <span className="text-sm text-ink-muted" data-action="month-total">
            {days === null
              ? t('millrep.tile.loading', '…')
              : batches === 0
                ? t('millrep.tile.empty', 'لا إنتاج')
                : t('millrep.month.total', '{qty} — {batches}', { qty: qtyText(outputKg), batches: batchesText(batches) })}
          </span>
        </div>
        <div className="grid gap-1" style={SEVEN} aria-busy={days === null || undefined} data-action="month-grid">
          {weekdays().map((weekday) => (
            <div key={weekday.long} className="text-center text-2xs font-semibold text-ink-muted" data-action="weekday">
              <span aria-hidden="true" className="sm:hidden">
                {weekday.short}
              </span>
              <span className="sr-only sm:not-sr-only">{weekday.long}</span>
            </div>
          ))}
          {Array.from({ length: offset }, (_, index) => (
            <div key={`blank-${index}`} aria-hidden="true" data-action="day-blank" />
          ))}
          {all.map((day) => {
            const entry = produced.get(day);
            const level = entry ? levelOf(entry.outputKg, max) : 0;
            const future = day > today;
            const current = day === today;
            const keep = (node: HTMLElement | null) => {
              if (node) cells.current.set(day, node);
              else cells.current.delete(day);
            };
            const style = { aspectRatio: '1 / 1', backgroundColor: tintOf(level), boxShadow: current ? NOW_RING : undefined };
            // يوم الإنتاج: رقمه صغير وناتجه بالطنّ عريض تحته («2» فوق «1» كانا يلتبسان في خليّة الهاتف)؛ وغيره رقمه وحده.
            const body = entry ? (
              <>
                <span className="text-2xs">{fmtInt(dayNumber(day))}</span>
                <span className="text-sm font-semibold tabular-nums" data-action="day-tons">
                  {tonsShort(entry.outputKg)}
                </span>
              </>
            ) : (
              <span className={`text-sm ${current ? 'font-semibold' : ''}`}>{fmtInt(dayNumber(day))}</span>
            );
            const look = `flex flex-col items-center justify-center rounded-xl text-center ${future ? 'text-ink-subtle' : entry ? '' : 'text-ink-muted'}`;
            return entry && !future ? (
              <button
                key={day}
                type="button"
                ref={keep}
                className={`${look} transition-shadow hover:shadow-soft`}
                style={style}
                aria-current={current ? 'date' : undefined}
                aria-label={t('millrep.day.aria', '{day}: {qty}، {batches}', { day: dayLabel(day), qty: qtyText(entry.outputKg), batches: batchesText(entry.batches) })}
                onClick={() => onDay(day)}
                data-action="day-cell"
                data-day={day}
                data-level={level}
              >
                {body}
              </button>
            ) : (
              <div key={day} ref={keep} className={look} style={style} aria-current={current ? 'date' : undefined} data-action="day-cell" data-day={day} data-level={level}>
                {body}
              </div>
            );
          })}
        </div>
        <Legend note={t('millrep.legend.tons', 'الرقم العريض في يوم الإنتاج ناتجه بالطنّ.')} />
      </div>
      <div ref={rest} className="flex flex-col gap-4" data-action="month-rest">
        {report}
      </div>
    </section>
  );
}
