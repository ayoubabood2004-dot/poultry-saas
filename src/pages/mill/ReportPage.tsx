import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { localDay, type Day } from '../../domain/dates';
import { RejectedError } from '../../lib/errors';
import { fmtDay } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadMillReport, type MillReport, type ReportDay } from '../../lib/repo/millReport';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { dayLabel, dayParam, monthLabel, monthOf, monthParam, monthRange, yearOf, yearParam, yearRange, type Month } from './report/calendar';
import { DayView } from './report/DayView';
import type { Leaving } from './report/flip';
import { MonthView } from './report/MonthView';
import { ReportBody } from './report/ReportBody';
import { YearView } from './report/YearView';

// تقرير العليقة (0023 «ترتيب معمل العلف»، كلمة المالك 2026-11-10: «وتقرير كامل داخل هذا العلف جدول كالندر… مربعات الاشهر… بحركة سينمائية
// يكبر المربع… ويكون اكو الوان على كل مربع سوينا فيه انتاج… وطباعة تقارير… بهذا الشهر وبهذا اليوم شنو انتجنا… وشنو جانت المواد… بشكل
// جداول مرتبه وتنطبع بشكل احترافي»؛ عقد scratchpad/mill3/contract-0023.md، B2): /mill/recipe/:id/report بثلاثة عروض في الرابط — السنة
// (?year=، والافتراض السنة الحالية)، والشهر (?month=YYYY-MM)، واليوم (?day=YYYY-MM-DD) — فالرجوع في المتصفّح يعيد العرض السابق والرابط يُنسخ.
// لكلّ عرض قراءة واحدة لـmill_report بمدّته (السنة من أوّلها إلى آخرها، والشهر، واليوم)، وآخر قراءة ناجحة لكلّ عرض تبقى (cache) فالرجوع إلى
// السنة يرسم بلاطاتها الملوّنة فوراً، وتقويم الشهر يتلوّن من قراءة السنة قبل أن تصل قراءته. والمال في هذا التقرير لكلّ من يرى المعمل.
// والحركة بين العروض FLIP (report/flip.ts): العرض الراحل يسجّل أماكن عناصره عند فكّه في motionRef، والجديد يبدأ منها.

type View = { kind: 'year'; year: string } | { kind: 'month'; month: Month } | { kind: 'day'; day: Day };

/** ما طُلب في الرابط: ?day= ثمّ ?month= ثمّ ?year=، وما لا يصلح كأنّه غائب (null: السنة الحالية). */
function askedView(search: URLSearchParams): View | null {
  const day = dayParam(search.get('day'));
  if (day) return { kind: 'day', day };
  const month = monthParam(search.get('month'));
  if (month) return { kind: 'month', month };
  const year = yearParam(search.get('year'));
  return year ? { kind: 'year', year } : null;
}

const viewKey = (view: View): string => (view.kind === 'year' ? `y:${view.year}` : view.kind === 'month' ? `m:${view.month}` : `d:${view.day}`);
/** أوّل يوم في مدّة العرض وآخره (السنة كلّها، أو الشهر، أو اليوم وحده). */
const fromOf = (view: View): Day => (view.kind === 'year' ? yearRange(view.year).from : view.kind === 'month' ? monthRange(view.month).from : view.day);
const toOf = (view: View): Day => (view.kind === 'year' ? yearRange(view.year).to : view.kind === 'month' ? monthRange(view.month).to : view.day);
const queryOf = (view: View): Record<string, string> => (view.kind === 'year' ? { year: view.year } : view.kind === 'month' ? { month: view.month } : { day: view.day });

/** العرض المطلوب في الرابط (أو السنة الحالية) ومفتاحه ومدّته: قيم من هوك ثابتة في الرسم، فقراءة load تُحفظ بها. */
function useView(currentYear: string): { view: View; key: string; from: Day; to: Day } {
  const [search] = useSearchParams();
  const view = askedView(search) ?? { kind: 'year', year: currentYear };
  return { view, key: viewKey(view), from: fromOf(view), to: toOf(view) };
}

/** آخر قراءة ناجحة للعليقة (لعنوانها ويوم الخادم)، أيّاً كان عرضها. */
function latestOf(cache: ReadonlyMap<string, MillReport>, id: string): MillReport | null {
  let found: MillReport | null = null;
  for (const [key, value] of cache) if (key.startsWith(`${id}|`)) found = value;
  return found;
}

/** الذاكرة بقراءة جديدة لعرض، في آخرها (الأحدث). */
function withEntry(cache: ReadonlyMap<string, MillReport>, key: string, value: MillReport): ReadonlyMap<string, MillReport> {
  const next = new Map(cache);
  next.delete(key);
  next.set(key, value);
  return next;
}

/** إنتاج يوم من قراءة: null بلا إنتاج فيه، وundefined بلا قراءة. */
const dayIn = (source: MillReport | null | undefined, day: Day): ReportDay | null | undefined => (source ? (source.days.find((entry) => entry.day === day) ?? null) : undefined);

/**
 * الطباعة على A4 (قاعدة تُضاف ما دامت الصفحة مفتوحة، لا في CSS الإقلاع ذي السقف المقيس): جدول الدفعات بأعمدته الثمانية كان أعرض من الورقة
 * فقُصّ طرفه (Chromium، «احفظ PDF»)، فالجداول بخطّ أصغر وحشو أقلّ وتلتفّ رؤوسها؛ وصفّ المجاميع (tfoot) كان يتكرّر أسفل كلّ صفحة فيظهر المجموع
 * قبل آخر الصفوف، فصار صفوفاً عادية في آخر الجدول (الرأس وحده يتكرّر)؛ ولا ينقسم صفّ ولا الملخّص، ولا يبقى عنوان قسم وحده أسفل صفحة.
 */
const PRINT_STYLE = [
  '@page { size: A4; margin: 12mm; }',
  '@media print {',
  '[data-action="report"] table { font-size: 11px; }',
  '[data-action="report"] th, [data-action="report"] td { padding: 4px 6px; white-space: normal; min-width: 0; }',
  // الرقم ورقم الدفعة (Num) بسطر واحد: «PD-2026-0031» كان ينكسر عند الشرطة؛ والنصّ وحده يلتفّ.
  '[data-action="report"] td bdi { white-space: nowrap; }',
  '[data-action="report"] tfoot { display: table-row-group; }',
  '[data-action="report"] tr, [data-action="report-summary"] { break-inside: avoid; }',
  '[data-action="report"] h3 { break-after: avoid; }',
  '}',
].join(' ');

/** فشل القراءة: رفض الخادم بتلميحه (وطريق إلى السنة الحالية إن كان العرض غيرها)، وإلّا «تعذّر التحميل» بـ«أعد المحاولة». */
function Failure({ error, onRetry, onReset }: { error: unknown; onRetry: () => void; onReset: (() => void) | null }) {
  if (error instanceof RejectedError && error.hint) {
    return (
      <Notice
        tone="warning"
        title={error.hint}
        action={
          onReset ? (
            <Button size="sm" variant="secondary" onClick={onReset} data-action="report-reset">
              {t('millrep.reset', 'اعرض السنة الحالية')}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <LoadFailed what={t('millrep.what', 'تقرير الإنتاج')} error={error} onRetry={onRetry} />;
}

export default function ReportPage() {
  const { id = '' } = useParams();
  const [, setSearch] = useSearchParams();
  const session = useSession();
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  // يوم الجهاز قبل أوّل قراءة، ثمّ يوم الخادم منها: لا سنة ولا شهر بعده.
  const [deviceDay] = useState(() => localDay());
  const motionRef = useRef<Leaving | null>(null);
  const [cache, setCache] = useState<ReadonlyMap<string, MillReport>>(() => new Map());

  const latest = latestOf(cache, id);
  const today = latest?.today ?? deviceDay;
  const nowMonth = monthOf(today);
  const currentYear = yearOf(today);
  const { view, key, from, to } = useView(currentYear);
  const cacheKey = `${id}|${key}`;
  const load = useCallback(() => loadMillReport(id, from, to), [id, from, to]);
  const state = useLoad(load, cacheKey);
  if (state.data !== null && cache.get(cacheKey) !== state.data) setCache(withEntry(cache, cacheKey, state.data));
  // الفشل قبل البيانات: لا تُعرض قراءة قديمة كأنّها الآن (الفاشل ليس فارغاً).
  const data = state.error ? null : (state.data ?? cache.get(cacheKey) ?? null);

  const go = (next: View) => setSearch(queryOf(next));
  const recipe = latest?.recipe ?? null;
  const title = recipe ? t('millrep.title', 'تقرير إنتاج «{name}»', { name: recipe.name }) : t('millrep.title.none', 'تقرير الإنتاج');
  const isDefault = view.kind === 'year' && view.year === currentYear;
  const failure = state.error ? <Failure error={state.error} onRetry={state.retry} onReset={isDefault ? null : () => setSearch({})} /> : null;
  const loading = (
    <p role="status" className="text-sm text-ink-muted" data-action="report-loading">
      {t('page.loading', 'جارٍ الفتح…')}
    </p>
  );
  const reportOf = (period: string, emptyText: string) => failure ?? (data ? <ReportBody data={data} title={title} period={period} emptyText={emptyText} /> : loading);

  let body: ReactNode;
  if (view.kind === 'year') {
    body = (
      <YearView
        key={key}
        year={view.year}
        days={data?.days ?? null}
        totals={data ? { batches: data.totals.batches, outputKg: data.totals.outputKg } : null}
        nowMonth={nowMonth}
        failure={failure}
        motionRef={motionRef}
        onYear={(year) => go({ kind: 'year', year })}
        onMonth={(month) => go({ kind: 'month', month })}
      />
    );
  } else if (view.kind === 'month') {
    const month = view.month;
    const range = monthRange(month);
    const period = t('millrep.period.month', '{month}: من {from} إلى {to}', { month: monthLabel(month), from: fmtDay(range.from), to: fmtDay(range.to) });
    body = (
      <MonthView
        key={key}
        month={month}
        days={data?.days ?? cache.get(`${id}|y:${yearOf(month)}`)?.days ?? null}
        today={today}
        nowMonth={nowMonth}
        report={reportOf(period, t('millrep.empty.month', 'لا إنتاج في هذا الشهر'))}
        motionRef={motionRef}
        onYear={() => go({ kind: 'year', year: yearOf(month) })}
        onMonth={(next) => go({ kind: 'month', month: next })}
        onDay={(day) => go({ kind: 'day', day })}
      />
    );
  } else {
    const day = view.day;
    const produced = data ? dayIn(data, day) : (dayIn(cache.get(`${id}|m:${monthOf(day)}`), day) ?? dayIn(cache.get(`${id}|y:${yearOf(day)}`), day));
    body = (
      <DayView
        key={key}
        day={day}
        produced={produced}
        report={reportOf(dayLabel(day), t('millrep.empty.day', 'لا إنتاج في هذا اليوم'))}
        motionRef={motionRef}
        onMonth={() => go({ kind: 'month', month: monthOf(day) })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5" data-action="report-page">
      <style>{PRINT_STYLE}</style>
      <div className="print:hidden">
        <BackButton
          to={`/mill/recipe/${id}`}
          label={recipe ? t('millrep.back', 'رجوع إلى «{name}»', { name: recipe.name }) : t('millrep.back.none', 'رجوع إلى العليقة')}
          action="back-recipe"
        />
      </div>
      <header className="flex flex-col gap-1">
        {orgName ? (
          <p className="hidden text-sm text-ink-muted print:block" data-action="report-org">
            {orgName}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold" data-action="report-title">
          {title}
        </h1>
        {recipe ? (
          <p className="text-ink-muted" data-action="report-output">
            {t('millrep.output', 'المادّة المنتَجة: {item}', { item: recipe.outputItemName })}
          </p>
        ) : null}
      </header>
      {body}
    </div>
  );
}
