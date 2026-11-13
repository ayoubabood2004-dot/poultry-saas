import { Printer } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/ui/Button';
import { DataTable, Num, type Column } from '../../../components/ui/DataTable';
import { LoadFailed } from '../../../components/ui/LoadFailed';
import { Notice } from '../../../components/ui/Notice';
import { localDay } from '../../../domain/dates';
import type { Fils } from '../../../domain/money';
import { describeError, NotConnectedError } from '../../../lib/errors';
import { fmtDay, fmtInt, fmtMoney, fmtQty } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import * as money from '../../../lib/repo/money';
import { hasBirdSales, salesTotal, type CashFlow, type MonthBlock } from '../../../lib/repo/money';
import { divisionLabel } from '../../../lib/roles';
import { useSession } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { A4_PORTRAIT, LINK, moneyDecimals, monthLabel, monthParam, PILL, printAs, shiftMonth, type Month } from './shared';

// «خلاصة الشهر التشغيلية» (عقد 0024 §4.7 وF6، خطّة المحاسبة §8.1 1-و): قراءة واحدة (month_summary) لشهر من الرابط (?m=YYYY-MM، وافتراضاً الشهر
// الحالي): المشروع كلّه ثمّ كلّ قسم بنطاق القارئ — المبيعات (الإيراد، والكلفة والربح الإجمالي لمن يرى الكلفة)، والمشتريات نقداً وبالدين، والمصاريف
// بفئاتها، وإنتاج المعمل وكلفته، وصرف العلف للأفواج — ثمّ صافي التدفّق النقدي للمنشأة. رأسها يقول صراحةً إنّها خلاصة تشغيلية لا قائمة دخل محاسبية
// (قائمة الدخل في المرحلة 3)، وسهمان للشهر السابق والتالي (لا شهر بعد الحالي)، وتُطبع A4 بعنوانها. القسم بلا حركة سطر واحد بدل جدول أصفار.
// والقسم باسمه الكامل كما في الكشف والسندات («معمل العلف»، «حقول اللحم»)، وكلّ كتلة وبطاقة النقد لا تنقسم بين صفحتين بالطباعة (data-keep،
// مراجعة 0024 L1 وL8). والمبيعات = الموادّ + الطيور (0028): بفواتير طيور يظهر سطرا «منها موادّ» و«منها طيور»، والكلفة والربح الإجمالي للموادّ وحدها،
// وسطر «إيراد الطيور وكلفة الفوج في تقرير الفوج؛ الربح بعد كلفة الفراخ» (لا كلفة بند للطيور، ولا ربح قبل كلفة الفراخ: مراجعة 0028 O10).

interface Line {
  key: string;
  label: string;
  count: number | null;
  amount: Fils | null;
  /** سطر تحت بنده (نقداً، بالدين، فئة مصروف). */
  sub?: boolean;
  strong?: boolean;
}

/** سطور كتلة: البنود بترتيبها، والكلفة والربح حين تُرى وحدها، والإنتاج والصرف حين يوجدان. */
export function blockLines(block: MonthBlock): Line[] {
  const { sales, purchases, expenses, production, feedIssue } = block;
  const all = salesTotal(sales);
  const birds = hasBirdSales(sales) ? sales.birds : null;
  const lines: Line[] = [{ key: 'sales', label: t('monthsum.sales', 'المبيعات (الإيراد)'), count: all.count, amount: all.revenue, strong: true }];
  if (birds) {
    lines.push(
      { key: 'sales-items', label: t('monthsum.sales.items', 'منها موادّ'), count: sales.count, amount: sales.revenue, sub: true },
      { key: 'sales-birds', label: t('monthsum.sales.birds', 'منها طيور'), count: birds.count, amount: birds.revenue, sub: true },
    );
  }
  if (sales.cost !== null) lines.push({ key: 'cost', label: birds ? t('monthsum.items_cost', 'كلفة الموادّ المبيعة') : t('monthsum.cost', 'كلفة المبيعات'), count: null, amount: sales.cost, sub: true });
  if (sales.gross !== null) {
    lines.push({ key: 'gross', label: birds ? t('monthsum.items_gross', 'الربح الإجمالي للموادّ') : t('hub.sales.gross', 'الربح الإجمالي'), count: null, amount: sales.gross, sub: true, strong: true });
  }
  if (birds) lines.push({ key: 'birds-profit', label: t('monthsum.birds_profit', 'إيراد الطيور وكلفة الفوج في تقرير الفوج؛ الربح بعد كلفة الفراخ'), count: null, amount: null, sub: true });
  lines.push(
    { key: 'purchases', label: t('monthsum.purchases', 'المشتريات'), count: purchases.count, amount: purchases.total, strong: true },
    { key: 'purchases-cash', label: t('monthsum.purchases.cash', 'منها نقداً'), count: null, amount: purchases.cash, sub: true },
    { key: 'purchases-credit', label: t('monthsum.purchases.credit', 'منها بالدين'), count: null, amount: purchases.credit, sub: true },
    { key: 'expenses', label: t('expense.title', 'المصاريف'), count: null, amount: expenses.total, strong: true },
    ...expenses.categories.map((category): Line => ({ key: `expense-${category.categoryId}`, label: category.name, count: null, amount: category.amount, sub: true })),
  );
  if (production) {
    lines.push({ key: 'production', label: t('monthsum.production', 'إنتاج المعمل: {qty}', { qty: fmtQty(production.outputKg, 'kg').main }), count: production.batches, amount: production.cost, strong: true });
  }
  if (feedIssue) lines.push({ key: 'feed', label: t('monthsum.feed', 'صرف العلف للأفواج'), count: feedIssue.issues, amount: feedIssue.cost, strong: true });
  return lines;
}

/** قسم بلا أيّ حركة في الشهر: لا بيع ولا شراء ولا مصروف ولا إنتاج ولا صرف. */
export function emptyBlock(block: MonthBlock): boolean {
  const { sales, purchases, expenses, production, feedIssue } = block;
  const all = salesTotal(sales);
  return all.count === 0 && all.revenue === 0n && purchases.count === 0 && purchases.total === 0n && expenses.total === 0n && expenses.categories.length === 0 && production === null && feedIssue === null;
}

export function BlockTable({ caption, block }: { caption: string; block: MonthBlock }) {
  const lines = blockLines(block);
  const decimals = moneyDecimals(lines.flatMap((line) => (line.amount === null ? [] : [line.amount])));
  const columns: Column<Line>[] = [
    {
      key: 'item',
      header: t('monthsum.col.item', 'البند'),
      wrap: true,
      cell: (line) => <span className={line.strong ? 'font-semibold' : line.sub ? 'ps-3 text-ink-muted' : ''}>{line.label}</span>,
    },
    { key: 'count', header: t('monthsum.col.count', 'العدد'), kind: 'number', cell: (line) => (line.count === null ? null : <Num>{fmtInt(line.count)}</Num>) },
    {
      key: 'amount',
      header: t('monthsum.col.amount', 'المبلغ (دينار)'),
      kind: 'number',
      cell: (line) => (line.amount === null ? (line.count === null ? null : '—') : <span className={line.strong ? 'font-semibold' : ''}><Num>{fmtMoney(line.amount, decimals)}</Num></span>),
    },
  ];
  return <DataTable caption={caption} columns={columns} rows={lines} rowKey={(line) => line.key} empty="" />;
}

function CashBlock({ cash }: { cash: CashFlow }) {
  const decimals = moneyDecimals([cash.inflow, cash.outflow, cash.net]);
  const rows = [
    { key: 'in', label: t('hub.flow.in', 'دخل نقداً'), value: cash.inflow },
    { key: 'out', label: t('hub.flow.out', 'خرج نقداً'), value: cash.outflow },
    { key: 'net', label: t('hub.flow.net', 'صافي التدفّق النقدي'), value: cash.net },
  ];
  return (
    <section className="card flex flex-col gap-2 p-4" data-action="monthsum-cash" data-keep>
      <h2 className="font-semibold">{t('monthsum.cash', 'النقد في المنشأة كلّها')}</h2>
      <p className="text-xs text-ink-muted">{t('monthsum.cash.note', 'بلا النقل بين الصناديق ولا الرصيد عند البداية.')}</p>
      <dl className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-2 text-sm" data-action={`monthsum-cash-${row.key}`}>
            <dt className={row.key === 'net' ? 'font-semibold' : 'text-ink-muted'}>{row.label}</dt>
            <dd className={`font-semibold ${row.value < 0n ? 'text-danger-700 dark:text-danger-300' : ''}`}>
              <Num>{fmtMoney(row.value, decimals)}</Num>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function MonthSummaryPage() {
  const [params] = useSearchParams();
  const session = useSession();
  const orgId = session.status === 'ready' ? session.workspace.orgId : 'none';
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  const current: Month = localDay().slice(0, 7);
  const month: Month = monthParam(params.get('m')) ?? current;
  const load = useCallback(() => money.loadMonthSummary(`${month}-01`), [month]);
  const summary = useLoad(load, `${orgId}|${month}`);
  const title = t('monthsum.of', 'خلاصة {month}', { month: monthLabel(month) });
  const header = (
    <PageHeader
      title={title}
      subtitle={summary.data ? t('monthsum.period', 'من {from} إلى {to}', { from: fmtDay(summary.data.from), to: fmtDay(summary.data.to) }) : undefined}
      actions={
        summary.data ? (
          <Button size="sm" variant="secondary" icon={<Printer aria-hidden="true" className="size-4" />} onClick={() => printAs(title)} data-action="print-month" data-print="hide">
            {t('statement.print', 'اطبع')}
          </Button>
        ) : undefined
      }
    />
  );
  if (summary.error instanceof NotConnectedError) {
    const { title: errorTitle, detail } = describeError(summary.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={errorTitle}>
          {detail}
        </Notice>
      </div>
    );
  }
  const data = summary.data;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-print-area>
      <style>{A4_PORTRAIT}</style>
      {orgName ? <p className="hidden text-sm text-ink-muted print:block">{orgName}</p> : null}
      {header}
      <p className="rounded-2xl border border-line p-3 font-semibold" data-action="monthsum-disclaimer">
        {t('monthsum.disclaimer', 'خلاصة تشغيلية، لا قائمة دخل محاسبية.')}
      </p>
      <nav className="flex flex-wrap items-center gap-2" aria-label={t('monthsum.months', 'الأشهر')} data-print="hide">
        <Link to={`/accounts/month?m=${shiftMonth(month, -1)}`} className={PILL} data-action="month-previous">
          {t('monthsum.previous', 'الشهر السابق')}
        </Link>
        {month < current ? (
          <Link to={`/accounts/month?m=${shiftMonth(month, 1)}`} className={PILL} data-action="month-next">
            {t('monthsum.next', 'الشهر التالي')}
          </Link>
        ) : null}
        <Link to="/accounts" className={`${LINK} text-sm`}>
          {t('hub.back', 'عُد إلى خلاصة المال')}
        </Link>
      </nav>
      {summary.error ? (
        <LoadFailed what={t('monthsum.title', 'خلاصة الشهر')} error={summary.error} onRetry={summary.retry} />
      ) : !data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2" data-action="monthsum-project" data-keep>
            <h2 className="text-lg font-semibold">{t('monthsum.project', 'المشروع كلّه')}</h2>
            <BlockTable caption={t('monthsum.project', 'المشروع كلّه')} block={data.project} />
          </section>
          {data.divisions.map((division) => {
            const name = divisionLabel(division.kind);
            return (
              <section key={division.divisionId} className="flex flex-col gap-2" data-action="monthsum-division" data-division={division.divisionId} data-keep>
                <h2 className="text-lg font-semibold">{name}</h2>
                {emptyBlock(division) ? <p className="text-sm text-ink-muted">{t('monthsum.division.empty', 'لا بيع ولا شراء ولا مصروف هذا الشهر.')}</p> : <BlockTable caption={name} block={division} />}
              </section>
            );
          })}
          <CashBlock cash={data.cash} />
        </>
      )}
    </div>
  );
}
