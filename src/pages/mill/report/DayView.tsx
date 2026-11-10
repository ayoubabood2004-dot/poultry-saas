import { ArrowRight } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';
import type { Day } from '../../../domain/dates';
import { t } from '../../../lib/i18n';
import type { ReportDay } from '../../../lib/repo/millReport';
import { batchesText, dayLabel, monthLabel, monthOf, qtyText } from './calendar';
import { boxOf, fadeIn, scrollToTop, zoomFrom, type Motion } from './flip';

// اليوم (كلمة المالك 2026-11-10: «بهذا اليوم شنو انتجنا… وشنو جانت المواد»): بطاقة اليوم باسمه وتاريخه وناتجه، وتحتها تقريره (ReportBody).
// البطاقة تكبر من خليّة اليوم في الشهر، والرجوع إلى الشهر يصغّرها إلى خليّتها (flip.ts).

export function DayView({
  day,
  produced,
  report,
  motionRef,
  onMonth,
}: {
  day: Day;
  /** إنتاج اليوم من قراءته (أو من قراءة شهره قبلها)، null بلا إنتاج، وundefined قبل أيّ قراءة. */
  produced: ReportDay | null | undefined;
  report: ReactNode;
  motionRef: Motion;
  onMonth: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const rest = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const from = motionRef.current;
    motionRef.current = null;
    if (from !== null) {
      scrollToTop();
      const cell = from.kind === 'month' ? from.cells.get(day) : undefined;
      if (cell && zoomFrom(card.current, cell)) fadeIn([bar.current, rest.current]);
      // التركيز على عنوان اليوم (مراجعة شاشات 0023، S6): كان يسقط إلى الصفحة.
      if (heading.current && typeof heading.current.focus === 'function') heading.current.focus({ preventScroll: true });
    }
    const cardNode = card.current;
    return () => {
      motionRef.current = { kind: 'day', key: day, card: boxOf(cardNode), cells: new Map() };
    };
  }, [motionRef, day]);

  return (
    <section className="flex flex-col gap-4" aria-label={dayLabel(day)} data-action="day-view">
      <div ref={bar} className="flex flex-wrap items-center gap-2 print:hidden" data-action="day-bar">
        <Button size="sm" variant="secondary" onClick={onMonth} data-action="back-month">
          <ArrowRight aria-hidden="true" className="size-4" />
          {t('millrep.back.month', 'رجوع إلى {month}', { month: monthLabel(monthOf(day)) })}
        </Button>
      </div>
      <div ref={card} className="card flex w-full max-w-xl flex-col gap-1 p-4 print:hidden" data-action="day-card">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold" data-action="day-title">
          {dayLabel(day)}
        </h2>
        <p className="text-sm text-ink-muted" data-action="day-total">
          {produced === undefined
            ? t('millrep.tile.loading', '…')
            : produced === null
              ? t('millrep.tile.empty', 'لا إنتاج')
              : t('millrep.month.total', '{qty} — {batches}', { qty: qtyText(produced.outputKg), batches: batchesText(produced.batches) })}
        </p>
      </div>
      <div ref={rest} className="flex flex-col gap-4" data-action="day-rest">
        {report}
      </div>
    </section>
  );
}
