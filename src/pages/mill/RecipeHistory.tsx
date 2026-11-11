import { Receipt } from 'lucide-react';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { addDays, localDay, type Day } from '../../domain/dates';
import type { BaseUnit } from '../../domain/units';
import { parseDayText } from '../../lib/dayText';
import { RejectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadRecipeHistory, type HistoryItem, type HistoryProduction, type HistoryVersion, type RecipeHistory } from '../../lib/repo/mill';
import { useLoad } from '../../lib/useLoad';
import { kgText } from './cards';
import { dash } from './shared';

// «السجلّ» في صفحة الخلطة (0025، كلمة المالك 2026-11-10: «وبالتالي كلنا نشوف تاريخ كل تعديل شنو سويت وشنو انتجت وشكد بهاي الفترات وهاي
// المنتجات»): مدّة (الافتراض آخر 90 يوماً، وحتى 366 يوماً) تُقرأ بها recipe_history، وجدول زمني واحد الأحدث أوّلاً: «إنتاج» بموادّه وكمياته وما أُضيف
// لهذه المرّة أو لم يُستعمل و«حُفظ في الخلطة»، والملغى بعلامته؛ و«تعديل الخلطة» بنسختها وما أُضيف وحُذف والدفعة التي حُفظت منها. وسطر المجاميع للمرحَّل
// وحده. والطباعة كتقرير العليقة: «اطبع أو احفظ PDF» من المتصفّح بعنوان السجلّ ومدّته، وبقيّة الصفحة لا تُطبع (print:hidden في الصفحة).

/** آخر 90 يوماً: اليوم وما قبله بتسعة وثمانين. */
const DEFAULT_DAYS = 89;
/** حدّ المدّة (مرآة القارئ: آخرها − أوّلها ≤ 365، أي 366 يوماً). */
const MAX_SPAN = 365;

const PRINT_STYLE = [
  '@page { size: A4; margin: 12mm; }',
  '@media print {',
  '[data-action="recipe-history"] table { font-size: 11px; }',
  '[data-action="recipe-history"] th, [data-action="recipe-history"] td { padding: 4px 6px; white-space: normal; min-width: 0; }',
  '[data-action="recipe-history"] td bdi { white-space: nowrap; }',
  '[data-action="recipe-history"] tfoot { display: table-row-group; }',
  '[data-action="recipe-history"] tr { break-inside: avoid; }',
  '}',
].join(' ');

/** اطبع بعنوان الصفحة عنوانَ السجلّ ومدّته (Chrome يسمّي ملفّ PDF به)، ثمّ يعود العنوان بعد الطباعة. */
function printAs(title: string): void {
  const before = document.title;
  const restore = () => {
    document.title = before;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  document.title = title;
  window.print();
}

const amountText = (qty: bigint, unit: BaseUnit): string => {
  const shown = fmtQty(qty, unit);
  return shown.sub ?? shown.main;
};
const names = (items: readonly HistoryItem[]): string => items.map((item) => item.name).join(t('list.separator', '، '));

/** حدث في السجلّ: إنتاج (بيومه) أو تعديل للخلطة (بيوم تفعيله على الجهاز). */
type HistoryEvent = { kind: 'production'; day: Day; production: HistoryProduction } | { kind: 'version'; day: Day; version: HistoryVersion; first: boolean };

/**
 * الأحداث الأحدث أوّلاً: الإنتاج بيومه، والنسخة بيوم تفعيلها (localDay: يوم الجهاز لا يوم غرينتش)؛ وفي اليوم نفسه التعديل فوق الإنتاج. النسخ كلّها من
 * القارئ (بلا تقييد بالمدّة)، والإنتاج في المدّة.
 */
export function historyEvents(history: RecipeHistory): HistoryEvent[] {
  const oldest = history.versions.reduce<number | null>((min, version) => (min === null || version.versionNo < min ? version.versionNo : min), null);
  const events: HistoryEvent[] = [
    ...history.versions.map((version): HistoryEvent => ({ kind: 'version', day: localDay(new Date(version.activatedAt)), version, first: version.versionNo === oldest })),
    ...history.productions.map((production): HistoryEvent => ({ kind: 'production', day: production.producedOn, production })),
  ];
  const rank = (event: HistoryEvent): number => (event.kind === 'version' ? 0 : 1);
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.day === b.event.day ? rank(a.event) - rank(b.event) || a.index - b.index : a.event.day < b.event.day ? 1 : -1))
    .map(({ event }) => event);
}

function ProductionDetails({ production }: { production: HistoryProduction }) {
  const used = production.lines.map((line) => t('mill.history.line', '{name} {qty}', { name: line.name, qty: amountText(line.qty, line.baseUnit) })).join(t('list.separator', '، '));
  const extra = production.lines.filter((line) => line.extra);
  return (
    <span className="flex flex-col gap-0.5">
      <span>{used || dash()}</span>
      {!production.savedToRecipe && (extra.length || production.omitted.length) ? (
        <span className="text-xs text-ink-muted" data-action="history-once">
          {[
            extra.length ? t('mill.history.once_added', 'لهذه المرّة: أُضيف {names}', { names: names(extra) }) : null,
            production.omitted.length ? t('mill.history.once_omitted', 'لهذه المرّة: لم يُستعمل {names}', { names: names(production.omitted) }) : null,
          ]
            .filter(Boolean)
            .join(t('mill.history.sep', ' · '))}
        </span>
      ) : null}
      {production.savedToRecipe ? (
        <span className="text-xs font-medium text-brand-700 dark:text-brand-200" data-action="history-saved">
          {t('mill.history.saved', 'حُفظ في الخلطة (نسخة {no}).', { no: fmtInt(production.versionNo) })}
        </span>
      ) : null}
      {production.note ? <span className="text-xs text-ink-muted">{t('mill.history.note', 'ملاحظة: {note}', { note: production.note })}</span> : null}
      {production.by ? <span className="text-xs text-ink-muted">{t('mill.history.by', 'بيد {name}', { name: production.by })}</span> : null}
    </span>
  );
}

function VersionDetails({ version, first }: { version: HistoryVersion; first: boolean }) {
  const parts: ReactNode[] = [];
  if (first) parts.push(<span key="made">{t('mill.history.created', 'الموادّ: {names}', { names: names(version.items) || dash() })}</span>);
  else {
    if (version.added.length) parts.push(<span key="added">{t('mill.history.added', 'أُضيف: {names}', { names: names(version.added) })}</span>);
    if (version.removed.length) parts.push(<span key="removed">{t('mill.history.removed', 'حُذف: {names}', { names: names(version.removed) })}</span>);
    if (!version.added.length && !version.removed.length) parts.push(<span key="order">{t('mill.history.reordered', 'الموادّ نفسها: {names}', { names: names(version.items) || dash() })}</span>);
  }
  return (
    <span className="flex flex-col gap-0.5">
      {parts}
      {version.fromBatch ? (
        <span className="text-xs text-ink-muted" data-action="history-from-batch">
          {t('mill.history.from_batch', 'من الإنتاج {doc}', { doc: version.fromBatch.docNo })}
        </span>
      ) : null}
      {version.activatedBy ? <span className="text-xs text-ink-muted">{t('mill.history.by', 'بيد {name}', { name: version.activatedBy })}</span> : null}
    </span>
  );
}

/** «السجلّ» بمدّته وجدوله ومجاميعه وطباعته. */
export function RecipeHistorySection({ recipeId, recipeName }: { recipeId: string; recipeName: string }) {
  const id = useId();
  const [today] = useState(() => localDay());
  const [fromText, setFromText] = useState(() => fmtDay(addDays(today, -DEFAULT_DAYS)));
  const [toText, setToText] = useState(() => fmtDay(today));
  const from = parseDayText(fromText);
  const to = parseDayText(toText);
  const problem =
    from === null || to === null
      ? t('mill.history.period_bad', 'اكتب أوّل المدّة وآخرها يوم/شهر/سنة، مثل 01/11/2026.')
      : from > to
        ? t('mill.history.period_order', 'أوّل المدّة بعد آخرها.')
        : // آخرها بعد أوّلها بأكثر من 365 يوماً (addDays لا diffDays: الوحدة المشتركة المحفوظة بالتثبيت المسبق لا تكبر لأجل هذه الشاشة).
          to > addDays(from, MAX_SPAN)
          ? t('mill.history.period_long', 'المدّة أطول من سنة (366 يوماً): اختر مدّة أقصر.')
          : null;
  const ready = problem === null && from !== null && to !== null;
  const load = useCallback(() => (ready ? loadRecipeHistory(recipeId, from, to) : Promise.resolve(null)), [ready, recipeId, from, to]);
  const state = useLoad<RecipeHistory | null>(load, `${recipeId}|${from ?? ''}|${to ?? ''}|${ready}`);
  const history = state.data;
  const events = history ? historyEvents(history) : [];
  const period = from && to ? t('mill.history.period', 'من {from} إلى {to}', { from: fmtDay(from), to: fmtDay(to) }) : '';
  const title = t('mill.history.print_title', 'سجلّ «{name}»', { name: recipeName });
  const outputDecimals = columnDecimals(events.flatMap((event) => (event.kind === 'production' ? [event.production.outputKg] : [])), 3) as 0 | 1 | 2 | 3;

  const columns: Column<HistoryEvent>[] = [
    { key: 'day', header: t('mill.history.col.day', 'التاريخ'), cell: (event) => fmtDay(event.day) },
    {
      key: 'event',
      header: t('mill.history.col.event', 'الحدث'),
      cell: (event) =>
        event.kind === 'production' ? (
          <span className="flex flex-col gap-0.5" data-action="history-production" data-id={event.production.id}>
            <span className="font-medium">{t('mill.history.production', 'إنتاج')}</span>
            <Link to={`/mill/batch/${event.production.id}`} className="text-brand-700 hover:underline dark:text-brand-200" data-action="history-batch">
              <Num>{event.production.docNo}</Num>
            </Link>
            {event.production.status === 'void' ? (
              <span className="text-xs font-medium text-danger-700 dark:text-danger-300" data-action="history-void">
                {t('mill.history.void', 'ملغى')}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="flex flex-col gap-0.5" data-action="history-version" data-id={event.version.id}>
            <span className="font-medium">{event.first ? t('mill.history.made', 'إنشاء الخلطة') : t('mill.history.edit', 'تعديل الخلطة')}</span>
            <span className="text-xs text-ink-muted">{t('mill.history.version', 'نسخة {no}', { no: fmtInt(event.version.versionNo) })}</span>
          </span>
        ),
    },
    {
      key: 'details',
      header: t('mill.history.col.details', 'التفاصيل'),
      wrap: true,
      cell: (event) => (event.kind === 'production' ? <ProductionDetails production={event.production} /> : <VersionDetails version={event.version} first={event.first} />),
    },
    {
      key: 'output',
      header: t('mill.history.col.output', 'الناتج (كغم)'),
      kind: 'number',
      cell: (event) =>
        event.kind === 'production' ? (
          // الملغى برقمه باهتاً وعلامته «ملغى» في عمود الحدث، ولا يدخل المجموع (المرحَّل وحده).
          <span className={event.production.status === 'void' ? 'text-ink-muted' : undefined}>
            <Num>{fmtQtyCell(event.production.outputKg, outputDecimals)}</Num>
          </span>
        ) : (
          dash()
        ),
    },
  ];

  const failure = (() => {
    if (!state.error) return null;
    if (state.error instanceof RejectedError && state.error.hint) return <Notice tone="warning" title={state.error.hint} />;
    return <LoadFailed what={t('mill.history.what', 'سجلّ الخلطة')} error={state.error} onRetry={state.retry} />;
  })();

  return (
    <section className="card flex flex-col gap-3 p-4" data-action="recipe-history">
      <style>{PRINT_STYLE}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('mill.history.title', 'السجلّ')}</h2>
        <div className="print:hidden">
          <Button
            size="sm"
            variant="secondary"
            icon={<Receipt aria-hidden="true" className="size-4" />}
            disabled={!history || events.length === 0}
            onClick={() => printAs(t('millrep.print.title', '{title} — {period}', { title, period }))}
            data-action="print-history"
          >
            {t('millrep.print', 'اطبع أو احفظ PDF')}
          </Button>
        </div>
      </div>
      <p className="text-sm text-ink-muted print:hidden">{t('mill.history.hint', 'كلّ تعديل على موادّ الخلطة، وكلّ إنتاج بموادّه وكمياته في المدّة المختارة.')}</p>
      <div className="grid gap-3 sm:grid-cols-2 print:hidden">
        <Field id={`${id}-from`} label={t('mill.history.from', 'من')}>
          <input
            id={`${id}-from`}
            className="input tabular-nums"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            placeholder={t('mill.weigh.expiry_placeholder', 'يوم/شهر/سنة')}
            value={fromText}
            onChange={(event) => setFromText(event.target.value)}
            data-action="history-from"
          />
        </Field>
        <Field id={`${id}-to`} label={t('mill.history.to', 'إلى')}>
          <input
            id={`${id}-to`}
            className="input tabular-nums"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            placeholder={t('mill.weigh.expiry_placeholder', 'يوم/شهر/سنة')}
            value={toText}
            onChange={(event) => setToText(event.target.value)}
            data-action="history-to"
          />
        </Field>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="history-period-problem">
          {problem}
        </p>
      ) : null}
      <p className="text-sm font-medium" data-action="history-period">
        {period}
      </p>
      {failure ??
        (history ? (
          <>
            <p className="text-sm" data-action="history-totals">
              {t('mill.history.totals', 'الدفعات المرحَّلة: {batches} · الناتج: {kg}', { batches: fmtInt(history.totals.batches), kg: kgText(history.totals.outputKg) })}
            </p>
            <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible">
              <DataTable
                caption={t('mill.history.caption', 'سجلّ «{name}»: التعديلات والإنتاج، الأحدث أوّلاً — {period}', { name: recipeName, period })}
                columns={columns}
                rows={events}
                rowKey={(event) => (event.kind === 'production' ? `p-${event.production.id}` : `v-${event.version.id}`)}
                empty={t('mill.history.empty', 'لا إنتاج ولا تعديل في هذه المدّة.')}
              />
            </div>
          </>
        ) : problem ? null : (
          <p role="status" className="text-sm text-ink-muted" data-action="history-loading">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        ))}
    </section>
  );
}
