import { ArrowRight } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';
import { t } from '../../../lib/i18n';
import type { ReportDay } from '../../../lib/repo/millReport';
import { batchesText, byMonth, levelOf, monthName, monthsOf, NOW_RING, qtyText, tintOf, type Month, type Produced } from './calendar';
import { boxesOf, fadeIn, scrollToTop, zoomFrom, type Motion } from './flip';
import { Legend } from './Legend';

// تقويم السنة (كلمة المالك 2026-11-10: «جدول كالندر… مربعات الاشهر… ويكون اكو الوان على كل مربع سوينا فيه انتاج»): اثنتا عشرة بلاطة كبيرة
// (عمودان ×6 بالهاتف، و3 ×4 من sm)، على كلّ واحدة اسم الشهر وناتجه بالطنّ وعدد دفعاته، ولونها بدرجة حجمه من أكبر شهر في السنة، والشهر بلا
// إنتاج بلون السطح المحايد. والسهمان للسنة السابقة والتالية، ولا سنة بعد السنة الحالية (ولا شهر بعد الشهر الحالي يُفتح). والضغط على بلاطة يفتح
// شهرها (MonthView) والبلاطة «تكبر» إليه؛ والرجوع إلى السنة يصغّر بطاقة الشهر إلى بلاطتها (flip.ts).

/** أوّل سنة تُعرض (لا تقرير قبل النظام). */
const FIRST_YEAR = '2000';

/** السهم الأيسر: السهم الأيمن معكوساً (أيقونة في حزمة محمَّلة أصلاً، لا حزمة أيقونة جديدة في التثبيت المسبق). */
const MIRROR = { scale: '-1 1' } as const;

export function YearView({
  year,
  days,
  totals,
  nowMonth,
  failure,
  motionRef,
  onYear,
  onMonth,
}: {
  year: string;
  /** أيام إنتاج السنة، أو null قبل أوّل قراءة. */
  days: readonly ReportDay[] | null;
  totals: Produced | null;
  /** الشهر الحالي (يوم الخادم، أو الجهاز قبل أوّل قراءة): ما بعده لا يُفتح. */
  nowMonth: Month;
  /** فشل القراءة أو رفضها: يُعرض بدل البلاطات (الفاشل ليس فارغاً). */
  failure: ReactNode;
  motionRef: Motion;
  onYear: (year: string) => void;
  onMonth: (month: Month) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<Month, HTMLElement>());
  const nowYear = nowMonth.slice(0, 4);
  const prevYear = `${Number(year) - 1}`;
  const nextYear = `${Number(year) + 1}`;

  useLayoutEffect(() => {
    const from = motionRef.current;
    motionRef.current = null;
    if (from !== null) {
      scrollToTop();
      // الرجوع من شهر: بلاطته تصغر من مكان بطاقته إلى مكانها، وما حولها يظهر تدريجياً.
      const tile = from.kind === 'month' && from.card ? tiles.current.get(from.key) : undefined;
      if (tile && from.card) {
        if (typeof tile.scrollIntoView === 'function') tile.scrollIntoView({ block: 'nearest' });
        if (zoomFrom(tile, from.card, { lift: true })) fadeIn([bar.current, ...[...tiles.current].filter(([month]) => month !== from.key).map(([, node]) => node)]);
      }
    }
    const nodes = tiles.current;
    return () => {
      motionRef.current = { kind: 'year', key: year, card: null, cells: boxesOf(nodes) };
    };
  }, [motionRef, year]);

  const months = byMonth(days ?? []);
  let max = 0n;
  for (const total of months.values()) if (total.outputKg > max) max = total.outputKg;
  const loading = days === null;

  return (
    <section className="flex flex-col gap-4 print:hidden" aria-label={t('millrep.year.aria', 'تقويم سنة {year}', { year })} data-action="year-view">
      <div ref={bar} className="flex flex-col gap-3" data-action="year-head">
        <div className="flex flex-wrap items-center gap-3" data-action="year-bar">
          <Button size="sm" variant="secondary" onClick={() => onYear(prevYear)} disabled={year <= FIRST_YEAR} data-action="year-prev">
            <ArrowRight aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only">{t('millrep.year.prev', 'السنة السابقة')}</span>
          </Button>
          <h2 className="text-2xl font-semibold" data-action="year-label">
            {t('millrep.year.label', 'سنة {year}', { year })}
          </h2>
          <Button size="sm" variant="secondary" onClick={() => onYear(nextYear)} disabled={year >= nowYear} data-action="year-next">
            <span className="sr-only sm:not-sr-only">{t('millrep.year.next', 'السنة التالية')}</span>
            <ArrowRight aria-hidden="true" className="size-4" style={MIRROR} />
          </Button>
        </div>
        {failure ? null : (
          <p className="text-sm text-ink-muted" data-action="year-total">
            {loading
              ? t('page.loading', 'جارٍ الفتح…')
              : totals === null || totals.batches === 0
                ? t('millrep.year.empty', 'لا إنتاج في هذه السنة.')
                : t('millrep.year.total', 'مجموع السنة: {qty} — {batches}', { qty: qtyText(totals.outputKg), batches: batchesText(totals.batches) })}
          </p>
        )}
        {failure ? null : <Legend />}
      </div>
      {failure ?? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy={loading || undefined} data-action="year-grid">
          {monthsOf(year).map((month) => {
            const total = months.get(month) ?? null;
            const level = total ? levelOf(total.outputKg, max) : 0;
            const future = month > nowMonth;
            const current = month === nowMonth;
            return (
              <li key={month} className="flex">
                <button
                  type="button"
                  ref={(node) => {
                    if (node) tiles.current.set(month, node);
                    else tiles.current.delete(month);
                  }}
                  className={`card relative flex min-h-28 w-full flex-col items-start justify-between gap-2 p-4 text-start transition-shadow hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50 ${total ? '' : 'bg-surface-2'}`}
                  style={{ backgroundColor: tintOf(level), boxShadow: current ? NOW_RING : undefined }}
                  disabled={future}
                  aria-current={current ? 'date' : undefined}
                  onClick={() => onMonth(month)}
                  data-action="month-tile"
                  data-month={month}
                  data-level={level}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-base font-semibold" data-action="tile-name">
                      {monthName(month)}
                    </span>
                    {current ? <span className="text-2xs font-semibold text-brand-800 dark:text-brand-100">{t('millrep.month.current', 'هذا الشهر')}</span> : null}
                  </span>
                  {loading ? (
                    <span className="text-sm text-ink-muted">{t('millrep.tile.loading', '…')}</span>
                  ) : total ? (
                    <span className="flex flex-col gap-0.5">
                      {/* text-lg: بعرض الهاتف (390) يبقى «1,234.567 طن» بسطر واحد في بلاطة عرضها نحو 141 بكسل. */}
                      <span className="text-lg font-semibold tabular-nums" data-action="tile-qty">
                        {qtyText(total.outputKg)}
                      </span>
                      <span className="text-sm" data-action="tile-batches">
                        {batchesText(total.batches)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-ink-muted" data-action="tile-empty">
                      {t('millrep.tile.empty', 'لا إنتاج')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
