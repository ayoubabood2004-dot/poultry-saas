import { ChevronDown, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { DayField } from '../../components/ui/DayField';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { StatStrip, type Stat } from '../../components/ui/StatStrip';
import { addDays, isDay, localDay, type Day } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { searchable, toWesternDigits } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { parseDayText } from '../../lib/dayText';
import { columnDecimals, countForm, fmtDay, fmtInt, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { SaleIcon } from '../../lib/nav';
import * as birdSales from '../../lib/repo/birdSales';
import type { AwaitingTicket, BirdGroupRow, BirdSaleRow, BirdSalesGroups, BirdSalesSection, SalesReportWithBirds, SalesWithBirds } from '../../lib/repo/birdSales';
import type { SaleCost, SaleRow, SalesGroup, SalesOverview, SalesReport, SalesReportRow } from '../../lib/repo/purchases';
import { readSalePending, salePendingKey } from '../../lib/repo/sales';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad, type LoadState } from '../../lib/useLoad';
import { baseQty } from '../inventory/simple-shared';
import { birdSalePath, dinarsText, kgDecimals, kgText, newBirdSalePath, paidLabel, ticketPagePath } from './birdParts';
import { rowTone, StatusChip, useWide } from './docKit';
import { sentText } from './SaleCheckout';
import { readSaleDraftSummary, type SaleDraftSummary } from './saleDraft';
import { linesText, newSalePath } from './saleParts';

// صفحة المبيعات (0021، كلمة المالك 2026-11-08: «ماكو زر يوديني للمبيعات حتى ابيع… واكدر اسجل مبيعاتي لمنو وتطلعلي هاي السوالف بالتقارير»)، ثمّ تصميم
// المبيعات ٧ (كلمة المالك 2026-11-18: «شكل متطور سهل الاستخدام»؛ التدقيق: الجدول 1,107 بكسل في 358 فالمال خارج الشاشة، وأوّل شاشة كلّها حقول وأرقام):
// شرائح المدّة (اليوم · الأسبوع · الشهر · مدّة…) فوق شريط أرقامها من الخادم (البيع، والمدفوع عند البيع، والباقي الآن)، ثمّ بحث بالزبون أو الرقم وشرائح
// (الكلّ · عليها باقٍ · ملغاة)، والجدول بأعمدة الهاتف: الزبون (وتحته الرقم واليوم) | الصافي | الباقي الآن | الحالة شريحةً بنصّ؛ والصفّ كلّه يفتح الفاتورة،
// ولا «ألغِ» في الصفّ (في الفاتورة تحت «⋯»). و«بيع جديد» زرّ ثابت، و«حسب الزبون» يفتح فواتير الزبون، و«حسب اليوم» فواتير يومه. والمدّة والبحث والتصفية
// في الرابط: «رجوع» من الفاتورة يعود إلى القائمة كما تُركت.
// في حزمة المخزون (StockRoutes) خارج التثبيت المسبق: البيع يسحب من الوجبات ويُحفظ بالخادم فوراً.
// وفواتير الطيور BR (0028، العقد §6 و§10 الوكيل ب): مفتاح birds من النداءين نفسيهما (sales_overview وsales_report، repo/birdSales) — «تذاكر وزن بانتظار
// الفاتورة» بـ«أصدر الفاتورة» لمن يصدرها، وجدول فواتير الطيور بمجاميع المرحَّل من الخادم، وفي التقرير مجموعات الطيور بالتجميع نفسه (بالمادّة: «دجاج لحم
// حيّ»). بلا كلفة ولا ربح للطيور (الربح للفوج في تقرير الدورة)، وخادم قبل 0028 بلا المفتاح فلا قسم.

type View = 'list' | SalesGroup;
type Period = 'today' | 'week' | 'month' | 'range';
type Show = 'all' | 'open' | 'void';
const VIEWS: readonly View[] = ['list', 'party', 'item', 'day'];
const PERIODS: readonly Period[] = ['today', 'week', 'month', 'range'];
const SHOWS: readonly Show[] = ['all', 'open', 'void'];
const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => (value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);

/** أوّل الشهر: المدّة الافتراضية من أوّل الشهر إلى اليوم. */
const monthStart = (day: string): string => `${day.slice(0, 8)}01`;

/** المدّة بشريحتها من يوم الخادم: اليوم، وآخر سبعة أيّام، ومن أوّل الشهر؛ و«مدّة…» من الرابط. */
function periodDays(period: Exclude<Period, 'range'>, today: Day): { from: Day; to: Day } {
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') return { from: addDays(today, -6), to: today };
  return { from: monthStart(today), to: today };
}

/** آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (مدّة أخرى أو بعد بيع). */
function useKept<T>(state: LoadState<T | null>): T | null {
  const [kept, setKept] = useState<T | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  return state.data ?? kept;
}

const money0 = (amount: Fils) => <Num>{fmtMoney(amount, 0)}</Num>;

/** «فاتورة واحدة»، «فاتورتان»، «3 فواتير»، «11 فاتورةً»، «100 فاتورة». */
export function invoicesText(n: number): string {
  if (n === 1) return t('saleslist.count.one', 'فاتورة واحدة');
  if (n === 2) return t('saleslist.count.two', 'فاتورتان');
  const form = countForm(n);
  if (form === 'few') return t('saleslist.count.few', '{n} فواتير', { n: fmtInt(n) });
  if (form === 'many') return t('saleslist.count.many', '{n} فاتورةً', { n: fmtInt(n) });
  return t('saleslist.count.hundreds', '{n} فاتورة', { n: fmtInt(n) });
}

function costColumns<R>(costs: boolean, of: (row: R) => SaleCost | null, total: SaleCost | null): Column<R>[] {
  if (!costs) return [];
  return [
    { key: 'cost', header: t('sales.col.cost', 'الكلفة'), kind: 'number', cell: (row) => { const c = of(row); return c ? money0(c.cost) : null; }, ...(total ? { total: money0(total.cost) } : {}) },
    { key: 'profit', header: t('sales.col.profit', 'الربح'), kind: 'number', cell: (row) => { const c = of(row); return c ? money0(c.profit) : null; }, ...(total ? { total: money0(total.profit) } : {}) },
  ];
}

/** عمودا الكمية والوحدة (نمط 0019): الكمية بمراتب العمود كلّه، والوحدة بعمودها لأنّ المواد بوحدات مختلفة. */
function qtyColumns<R>(rows: readonly R[], of: (row: R) => { qty: bigint; unit: NonNullable<SaleRow['baseUnit']> } | null): Column<R>[] {
  const decimals = columnDecimals(rows.flatMap((row) => { const q = of(row); return q ? [q.qty] : []; }), 3) as 0 | 1 | 2 | 3;
  return [
    { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (row) => { const q = of(row); return q ? <Num>{fmtQtyCell(q.qty, decimals)}</Num> : null; } },
    { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (row) => { const q = of(row); return q ? baseUnitLabel(q.unit) : null; } },
  ];
}

/**
 * موادّ الفاتورة في خانة: المادّة وكميتها لسطر واحد، واسمها وحده لمادّة واحدة بعدّة سطور (كيس وفرط)، و«علف بادئ ومادّتان أخريان» لعدّة موادّ: العدد
 * بالموادّ المختلفة (items_count) لا بالسطور (مراجعة 0033 D8).
 */
export function itemsText(row: Pick<SaleRow, 'itemName' | 'lineCount' | 'itemCount' | 'qty' | 'baseUnit'>): string {
  if (row.lineCount <= 1) return row.qty !== null && row.baseUnit !== null ? t('invoice.items.one', '{item} {qty}', { item: row.itemName, qty: baseQty(row.qty, row.baseUnit) }) : row.itemName;
  if (row.itemCount <= 1) return row.itemName;
  const rest = row.itemCount - 1;
  if (rest === 1) return t('invoice.items.more_one', '{item} ومادّة أخرى', { item: row.itemName });
  if (rest === 2) return t('invoice.items.more_two', '{item} ومادّتان أخريان', { item: row.itemName });
  return t('invoice.items.more', '{item} و{rest} أخرى', { item: row.itemName, rest: linesText(rest) });
}

/** طريق الفاتورة من القائمة، ورجوعها إلى القائمة كما هي (المدّة والبحث والتصفية في الرابط). */
function salePath(id: string, listSearch: string): string {
  if (listSearch === '') return `/sales/${id}`;
  return `/sales/${id}?${new URLSearchParams({ back: `/sales${listSearch}` }).toString()}`;
}

/**
 * فواتير المدّة: بالهاتف الزبون (وتحته الرقم واليوم صغيرين) | الصافي | الباقي الآن | الحالة، فالمال في الشاشة بلا تمرير جانبي؛ وفي الشاشة العريضة الموادّ
 * والمدفوع أيضاً. الصفّ كلّه يفتح الفاتورة (والاسم رابطها للوحة المفاتيح). والمجاميع من الخادم ما دامت القائمة كاملة (بلا بحث ولا تصفية)، وإلّا عدد ما يظهر.
 */
function SalesList({ data, rows, filtered, wide, listSearch, empty, stale }: { data: SalesOverview; rows: readonly SaleRow[]; filtered: boolean; wide: boolean; listSearch: string; empty: string; stale: boolean }) {
  const navigate = useNavigate();
  const money = data.rows.every((row) => row.money !== null) && data.totals.money !== null;
  const totals = money && !filtered ? data.totals.money : null;
  // الملغى خارج المجموع (مجموع المحفوظ من الخادم)، فخانات مبالغه «—» وحالته تقول إنّه ملغى (مراجعة 0021 M1).
  const shownMoney = (row: SaleRow) => (row.status === 'void' ? null : row.money);
  const dash = <Num>{t('file.none', '—')}</Num>;
  const columns: Column<SaleRow>[] = [
    {
      key: 'party',
      header: t('saleslist.col.customer', 'الزبون'),
      wrap: true,
      cell: (row) => (
        <span className="sale-row">
          <Link to={salePath(row.id, listSearch)} className="sale-row-name" data-action="open-sale">
            {row.walkIn ? <span data-action="sale-walk-in">{t('invoice.walk_in', 'زبون نقديّ')}</span> : row.partyName}
          </Link>
          <span className="sale-row-sub">
            {/* الحالة هنا حين يضيق الجدول فيختفي عمودها (doc.css). */}
            <StatusChip tone={rowTone(row)} action="sale-status-inline" className="sale-row-chip" />
            <bdi dir="ltr">{row.docNo}</bdi>
            <Num>{fmtDay(row.soldOn)}</Num>
          </span>
        </span>
      ),
    },
  ];
  if (wide) columns.push({ key: 'item', header: t('invoice.col.items', 'الموادّ'), wrap: true, cell: (row) => itemsText(row) });
  if (money) {
    columns.push({
      key: 'amount',
      header: t('invoice.col.net', 'الصافي'),
      kind: 'number',
      cell: (row) => { const m = shownMoney(row); return m ? money0(m.lineTotal) : dash; },
      ...(totals ? { total: money0(totals.revenue) } : {}),
    });
    if (wide) {
      columns.push({
        key: 'paid',
        header: t('saleslist.col.paid', 'المدفوع عند البيع'),
        kind: 'number',
        cell: (row) => { const m = shownMoney(row); return m ? money0(m.paid) : dash; },
        ...(totals ? { total: money0(totals.cash) } : {}),
      });
    }
    columns.push({
      // الباقي على الفاتورة الآن (open): ما قُبض بعد البيع يُنقصه، لا الدين عند البيع (مراجعة 0033 A1).
      key: 'open',
      header: t('sales.col.open', 'الباقي الآن'),
      kind: 'number',
      cell: (row) => { const m = shownMoney(row); return m ? money0(m.open) : dash; },
      ...(totals ? { total: money0(totals.open ?? totals.credit) } : {}),
    });
  }
  columns.push({ key: 'status', header: t('sales.col.status', 'الحالة'), cell: (row) => <StatusChip tone={rowTone(row)} /> });
  return (
    <div className="sale-table sale-list" data-action="sales-table" data-stale={stale ? '' : undefined} aria-busy={stale || undefined}>
      <DataTable
        caption={t('sales.caption', 'فواتير البيع من {from} إلى {to}، الأحدث أوّلاً', { from: fmtDay(data.from), to: fmtDay(data.to) })}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={empty}
        onRowClick={(row) => navigate(salePath(row.id, listSearch))}
        {...(totals && rows.length ? { totalLabel: t('sales.total', 'مجموع المحفوظ') } : {})}
      />
    </div>
  );
}

/** تقرير المبيعات بالتجميع؛ «حسب الزبون» و«حسب اليوم» صفّهما يفتح فواتيره (onOpen). */
function ReportTable({ data, costs, onOpen }: { data: SalesReport; costs: boolean; onOpen: ((row: SalesReportRow) => void) | null }) {
  const label = data.group === 'party' ? t('saleslist.col.customer', 'الزبون') : data.group === 'item' ? t('sales.col.item', 'المادّة') : t('ledger.date', 'التاريخ');
  const money = data.totals.revenue !== null;
  const columns: Column<SalesReportRow>[] = [
    {
      key: 'label',
      header: label,
      sticky: true,
      wrap: true,
      cell: (row) =>
        onOpen ? (
          <button type="button" className="sale-report-open" onClick={() => onOpen(row)} data-action="report-open">
            {row.label}
          </button>
        ) : (
          row.label
        ),
    },
    { key: 'count', header: t('sales.col.count', 'عدد الفواتير'), kind: 'number', cell: (row) => <Num>{fmtInt(row.count)}</Num>, total: <Num>{fmtInt(data.totals.count)}</Num> },
  ];
  if (data.group === 'item') columns.push(...qtyColumns(data.rows, (row) => (row.qty !== null && row.baseUnit !== null ? { qty: row.qty, unit: row.baseUnit } : null)));
  if (money) {
    columns.push({ key: 'revenue', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (row) => (row.revenue !== null ? money0(row.revenue) : null), ...(data.totals.revenue !== null ? { total: money0(data.totals.revenue) } : {}) });
  }
  columns.push(...costColumns<SalesReportRow>(costs && data.totals.cost !== null, (row) => row.cost, data.totals.cost));
  return (
    <div className="sale-table" data-action="sales-report">
      <DataTable
        caption={t('sales.report.caption', 'تقرير المبيعات حسب {group}', { group: label })}
        columns={columns}
        rows={data.rows}
        rowKey={(row) => row.key}
        empty={t('sales.empty', 'لا بيع في هذه المدّة.')}
        {...(onOpen ? { onRowClick: onOpen } : {})}
        {...(data.rows.length ? { totalLabel: t('sales.report.total', 'المجموع') } : {})}
      />
    </div>
  );
}

// ─── فواتير الطيور (مفتاح birds) ─────────────────────────────────────────────────────────────────────────────────

/** لماذا لا تُصدر فاتورة تذكرة بانتظارها الآن (مراجعة 0028 O4)، بجملة قصيرة تقول من يفعل ماذا. */
function awaitingWhy(why: AwaitingTicket['why']): string {
  switch (why) {
    case 'period_locked':
      return t('birds.awaiting.why.period_locked', 'يومها في فترة مقفلة: يفتحها مالك المنشأة');
    case 'out_of_scope':
      return t('birds.awaiting.why.out_of_scope', 'دفتر وحدتها خارج نطاقك: يصدرها مالك المنشأة');
    case 'no_book':
      return t('birds.awaiting.why.no_book', 'لا دفتر لوحدتها: راجع مالك المنشأة');
    default:
      return t('birds.awaiting.why.other', 'لا تُصدر فاتورتها الآن');
  }
}

/**
 * التذاكر المكتملة بلا فاتورة مرحّلة (أحدث 100، بلا مدّة)، و«أصدر الفاتورة» لكلّ واحدة تُصدر فاتورتها الآن لمن يصدرها (invoiceable)، وإلّا لماذا لا؛
 * والأقدم من سبعة أيّام تُؤرَّخ فاتورتها اليوم (late، أجوبة المالك 2026-11-13) فيُقال ذلك تحت يومها.
 */
function AwaitingTable({ rows, canRecord }: { rows: readonly AwaitingTicket[]; canRecord: boolean }) {
  const kg = kgDecimals(rows.map((row) => row.netKg));
  const columns: Column<AwaitingTicket>[] = [
    {
      key: 'day',
      header: t('ledger.date', 'التاريخ'),
      sticky: true,
      cell: (row) =>
        row.late && row.invoiceable ? (
          <>
            {fmtDay(row.onDate)}
            <span className="block text-xs text-ink-muted" data-action="awaiting-late">
              {t('birds.awaiting.late', 'تُؤرَّخ فاتورتها اليوم')}
            </span>
          </>
        ) : (
          fmtDay(row.onDate)
        ),
    },
    {
      key: 'ticket',
      header: t('birds.col.ticket', 'التذكرة'),
      cell: (row) => (
        <Link to={ticketPagePath(row.ticketId, '/sales')} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-ticket">
          <bdi dir="ltr">{row.ticketNo}</bdi>
        </Link>
      ),
    },
    { key: 'site', header: t('birds.col.site', 'الحقل'), wrap: true, cell: (row) => row.siteName },
    { key: 'birds', header: t('birds.col.birds', 'الطيور'), kind: 'number', cell: (row) => <Num>{fmtInt(row.birds)}</Num> },
    { key: 'net', header: t('birds.col.net', 'الصافي (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.netKg, kg)}</Num> },
  ];
  if (canRecord) {
    columns.push({
      key: 'invoice',
      header: t('birds.col.invoice', 'الفاتورة'),
      cell: (row) =>
        row.invoiceable ? (
          <Link to={newBirdSalePath(row.ticketId, '/sales')} className="font-semibold text-brand-700 hover:underline dark:text-brand-200" data-action="invoice-ticket">
            {t('birds.submit', 'أصدر الفاتورة')}
          </Link>
        ) : (
          <span className="text-sm text-ink-muted" data-action="awaiting-why">
            {awaitingWhy(row.why)}
          </span>
        ),
    });
  }
  return <DataTable caption={t('birds.awaiting.caption', 'تذاكر وزن بانتظار الفاتورة')} columns={columns} rows={rows} rowKey={(row) => row.ticketId} empty={t('birds.awaiting.empty', 'لا تذاكر بانتظار الفاتورة.')} />;
}

function birdStats(data: BirdSalesSection): Stat[] {
  const stats: Stat[] = [
    { key: 'count', label: t('birds.stat.count', 'فواتير طيور مرحَّلة'), value: fmtInt(data.totals.count) },
    { key: 'birds', label: t('birds.stat.birds', 'الطيور المباعة'), value: fmtInt(data.totals.birds) },
    { key: 'net', label: t('birds.stat.net', 'صافيها'), value: kgText(data.totals.netKg) },
  ];
  const money = data.totals.money;
  if (money) {
    stats.push(
      { key: 'revenue', label: t('birds.stat.revenue', 'مجموعها'), value: dinarsText(money.revenue) },
      { key: 'paid', label: t('birds.stat.paid', 'منه مقبوض عند البيع'), value: dinarsText(money.paidNow) },
      { key: 'credit', label: t('birds.stat.credit', 'منه بالدين'), value: dinarsText(money.credit) },
    );
  }
  return stats;
}

/** فواتير الطيور في المدّة (الملغاة بعلامتها وبلا مبلغ، والمجموع للمرحَّل من الخادم)، والرقم يفتح الفاتورة. */
function BirdsList({ data, from, to }: { data: BirdSalesSection; from: string; to: string }) {
  const totalMoney = data.rows.every((row) => row.money !== null) ? data.totals.money : null;
  const shown = (row: BirdSaleRow) => (row.status === 'void' ? null : row.money);
  const kg = kgDecimals([...data.rows.map((row) => row.netKg), data.totals.netKg]);
  const columns: Column<BirdSaleRow>[] = [
    { key: 'day', header: t('ledger.date', 'التاريخ'), sticky: true, cell: (row) => fmtDay(row.soldOn) },
    {
      key: 'no',
      header: t('sales.col.no', 'الرقم'),
      cell: (row) => (
        <Link to={birdSalePath(row.id, '/sales')} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-bird-sale">
          <bdi dir="ltr">{row.docNo}</bdi>
        </Link>
      ),
    },
    { key: 'party', header: t('saleslist.col.customer', 'الزبون'), wrap: true, cell: (row) => row.partyName },
    { key: 'ticket', header: t('birds.col.ticket', 'التذكرة'), cell: (row) => <bdi dir="ltr">{row.ticketNo}</bdi> },
    { key: 'birds', header: t('birds.col.birds', 'الطيور'), kind: 'number', cell: (row) => <Num>{fmtInt(row.birds)}</Num>, total: <Num>{fmtInt(data.totals.birds)}</Num> },
    { key: 'net', header: t('birds.col.net', 'الصافي (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.netKg, kg)}</Num>, total: <Num>{fmtQtyCell(data.totals.netKg, kg)}</Num> },
  ];
  if (totalMoney) {
    columns.push(
      { key: 'price', header: t('birds.col.price', 'سعر الكيلو'), kind: 'number', cell: (row) => { const m = shown(row); return <Num>{m ? fmtMoney(m.unitPrice) : t('file.none', '—')}</Num>; } },
      { key: 'amount', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (row) => { const m = shown(row); return m ? money0(m.total) : <Num>{t('file.none', '—')}</Num>; }, total: money0(totalMoney.revenue) },
    );
  }
  columns.push(
    // المقبوض الذي رُدّ للتاجر (مراجعة 0028 M3): الخادم يقرؤه بالدين، والخانة تقول ما حدث.
    { key: 'paid', header: t('sales.col.payment', 'الدفع'), cell: (row) => paidLabel(row.paid, row.paymentRefunded) },
    {
      key: 'status',
      header: t('sales.col.status', 'الحالة'),
      cell: (row) =>
        row.status === 'void' ? (
          <span className="text-ink-muted" data-action="bird-sale-voided">
            {t('birds.voided', 'ملغاة')}
          </span>
        ) : (
          t('birds.posted', 'مرحَّلة')
        ),
    },
  );
  return (
    <DataTable
      caption={t('birds.list.caption', 'فواتير الطيور من {from} إلى {to}، الأحدث أوّلاً', { from: fmtDay(from), to: fmtDay(to) })}
      columns={columns}
      rows={data.rows}
      rowKey={(row) => row.id}
      empty={t('birds.list.empty', 'لا فاتورة طيور في هذه المدّة.')}
      {...(data.rows.length ? { totalLabel: t('birds.list.total', 'مجموع المرحَّل') } : {})}
    />
  );
}

/** قسم الطيور في قائمة المبيعات: التذاكر بانتظار الفاتورة أوّلاً (عمل المحاسب)، ثمّ أرقام المدّة وفواتيرها. لا قسم بلا فاتورة ولا تذكرة. */
function BirdsSection({ data, from, to }: { data: BirdSalesSection; from: string; to: string }) {
  if (!data.rows.length && !data.awaiting.length) return null;
  return (
    <section className="flex flex-col gap-3" data-action="bird-sales">
      <h2 className="text-lg font-semibold">{t('birds.section', 'بيع الطيور')}</h2>
      {data.awaiting.length ? <AwaitingTable rows={data.awaiting} canRecord={data.canRecord} /> : null}
      <StatStrip stats={birdStats(data)} />
      <BirdsList data={data} from={from} to={to} />
      {data.more ? <p className="text-sm text-ink-muted">{t('birds.more', 'تُعرض آخر 1,000 فاتورة طيور؛ والمجاميع للمدّة كلّها.')}</p> : null}
      <p className="text-sm text-ink-muted" data-action="bird-profit-note">
        {/* مراجعة 0028 O10 (كخلاصة المال وخلاصة الشهر): لا «ربح الطيور» قبل كلفة الفراخ. */}
        {t('birds.profit_note', 'إيراد الطيور وكلفة الفوج في تقرير الدورة؛ الربح بعد كلفة الفراخ.')}
      </p>
    </section>
  );
}

/** فواتير الطيور المرحَّلة مجمَّعة بالتجميع نفسه (بالمادّة: صفّ واحد «دجاج لحم حيّ»). */
function BirdGroupsTable({ data, group }: { data: BirdSalesGroups; group: SalesGroup }) {
  if (!data.rows.length) return null;
  const label = group === 'party' ? t('saleslist.col.customer', 'الزبون') : group === 'item' ? t('sales.col.item', 'المادّة') : t('ledger.date', 'التاريخ');
  const kg = kgDecimals([...data.rows.map((row) => row.netKg), data.totals.netKg]);
  const columns: Column<BirdGroupRow>[] = [
    { key: 'label', header: label, sticky: true, wrap: true, cell: (row) => row.label },
    { key: 'count', header: t('sales.col.count', 'عدد الفواتير'), kind: 'number', cell: (row) => <Num>{fmtInt(row.count)}</Num>, total: <Num>{fmtInt(data.totals.count)}</Num> },
    { key: 'birds', header: t('birds.col.birds', 'الطيور'), kind: 'number', cell: (row) => <Num>{fmtInt(row.birds)}</Num>, total: <Num>{fmtInt(data.totals.birds)}</Num> },
    { key: 'net', header: t('birds.col.net', 'الصافي (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.netKg, kg)}</Num>, total: <Num>{fmtQtyCell(data.totals.netKg, kg)}</Num> },
  ];
  const revenue = data.totals.revenue;
  if (revenue !== null) {
    columns.push({ key: 'revenue', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (row) => (row.revenue !== null ? money0(row.revenue) : null), total: money0(revenue) });
  }
  return (
    <DataTable
      caption={t('birds.report.caption', 'فواتير الطيور حسب {group}', { group: label })}
      columns={columns}
      rows={data.rows}
      rowKey={(row) => row.key}
      empty=""
      totalLabel={t('sales.report.total', 'المجموع')}
    />
  );
}

/**
 * اسم المدّة من المدّة التي أنتجت الأرقام نفسها (from وto وtoday في الجواب، مراجعة A4): «اليوم» لا يُكتب فوق أرقام الشهر وقراءةُ اليوم في الطريق أو بلا
 * اتصال.
 */
export function stripName(data: Pick<SalesOverview, 'from' | 'to' | 'today'>): string {
  const { from, to, today } = data;
  if (to === today && from === today) return t('saleslist.period.today_name', 'اليوم');
  if (to === today && from === addDays(today, -6)) return t('saleslist.period.week_name', 'آخر سبعة أيّام');
  if (to === today && from === monthStart(today)) return t('saleslist.period.month_name', 'هذا الشهر');
  return from === to ? fmtDay(from) : t('saleslist.period.range_name', 'من {from} إلى {to}', { from: fmtDay(from), to: fmtDay(to) });
}

/**
 * عدد فواتير المدّة كلّها (المحفوظة والملغاة: الجدول والبحث يعدّان الشيء نفسه، مراجعة A10)، و«الملغاة منها» إن وُجدت؛ والمبالغ للمحفوظة وحدها.
 */
export function stripCount(totals: SalesOverview['totals']) {
  const all = invoicesText(totals.count + totals.voided);
  if (totals.voided === 0) return all;
  // «الملغاة منها: 2» لا تنكسر بعد النقطتين (مراجعة Q12).
  return (
    <>
      {all}
      {t('list.separator', '، ')}
      <span className="sale-nowrap">{t('saleslist.count_voided_part', 'الملغاة منها: {voided}', { voided: fmtInt(totals.voided) })}</span>
    </>
  );
}

/**
 * شريط أرقام المدّة من مجاميع الخادم (لا من الصفوف المحمّلة)، بسطر واحد على الهاتف (مراجعة D14): البيع والباقي الآن؛ و«التفاصيل» تفتح المدفوع عند البيع
 * والكلفة والربح (لأدوار الكلفة)، وتظهر وحدها في الشاشة العريضة. يتبع المدّة المعروضة لا البحث، وأثناء قراءة مدّة أخرى يخفت (stale).
 */
function SalesStrip({ data, stale, wide }: { data: SalesOverview; stale: boolean; wide: boolean }) {
  const [more, setMore] = useState(false);
  const money = data.totals.money;
  const cost = data.totals.cost;
  const detail = wide || more;
  return (
    <section className="card sale-strip" data-action="sales-strip" data-stale={stale ? '' : undefined} aria-busy={stale || undefined}>
      <div className="sale-strip-line">
        <p className="sale-strip-head">
          <span className="sale-strip-name">{stripName(data)}</span>
          <span data-action="strip-count">{stripCount(data.totals)}</span>
          {stale ? (
            <span className="sale-stale-badge" data-action="strip-stale">
              {t('saleslist.stale', 'تُقرأ المدّة المختارة…')}
            </span>
          ) : null}
        </p>
        {money ? (
          <dl className="sale-strip-main">
            <div>
              <dt>{t('saleslist.stat.sold', 'البيع')}</dt>
              <dd data-action="strip-sold">{money0(money.revenue)}</dd>
            </div>
            <div data-part="open" data-zero={(money.open ?? money.credit) === 0n ? '' : undefined}>
              <dt>{t('sales.col.open', 'الباقي الآن')}</dt>
              <dd data-action="strip-open">{money0(money.open ?? money.credit)}</dd>
            </div>
          </dl>
        ) : null}
        {money && !wide ? (
          <button type="button" className="sale-strip-more" aria-expanded={more} aria-label={t('saleslist.strip.more', 'تفاصيل المدّة')} onClick={() => setMore(!more)} data-action="strip-more">
            <ChevronDown aria-hidden="true" className="size-5 sale-disclosure-icon" />
          </button>
        ) : null}
      </div>
      {money && detail ? (
        <dl className="sale-strip-detail" data-action="strip-detail">
          <div>
            <dt>{t('saleslist.stat.paid', 'المدفوع عند البيع')}</dt>
            <dd data-action="strip-paid">{money0(money.cash)}</dd>
          </div>
          {cost ? (
            <>
              <div>
                <dt>{t('sales.stat.cost', 'كلفة المبيع')}</dt>
                <dd>{money0(cost.cost)}</dd>
              </div>
              <div>
                <dt>{t('sales.stat.profit', 'الربح')}</dt>
                <dd>{money0(cost.profit)}</dd>
              </div>
            </>
          ) : null}
          <p className="sale-strip-unit">{t('saleslist.unit', 'المبالغ بالدينار')}</p>
        </dl>
      ) : null}
    </section>
  );
}

/** شرائح اختيار واحد (المدّة أو التصفية): أزرار بـaria-pressed وارتفاع الإصبع. */
function Pills<T extends string>({ label, options, value, onChange, action }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; action: string }) {
  return (
    <div role="group" aria-label={label} className="sale-pills" data-action={action}>
      {options.map((option) => (
        <button key={option.value} type="button" className="sale-pill" aria-pressed={option.value === value} onClick={() => onChange(option.value)} data-action={`${action}-${option.value}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** «فاتورة مفتوحة: 3 موادّ · 218,750»: سلّة بيع محفوظة على هذا الجهاز تعود بلمسة (تصميم المبيعات ٨، كشريحة الرئيسية؛ saleDraft). */
function OpenSaleChip({ sale }: { sale: SaleDraftSummary }) {
  const items = linesText(sale.lines);
  return (
    <Link to={newSalePath()} className="sale-open-chip" data-action="sales-open-sale">
      <SaleIcon aria-hidden="true" className="size-5 shrink-0" />
      {sale.total > 0n ? t('home.open_sale', 'فاتورة مفتوحة: {items} · {total}', { items, total: fmtMoney(sale.total, 0) }) : t('home.open_sale.no_total', 'فاتورة مفتوحة: {items}', { items })}
    </Link>
  );
}

export default function SalesPage() {
  const id = useId();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useWide();
  // المدّة الافتراضية من يوم الخادم حين يُعرف (لا ساعة الجهاز): من القائمة والتقرير كليهما (A7).
  const [serverToday, setServerToday] = useState<string | null>(null);
  const today = serverToday ?? localDay();
  // الأمين يبيع ويسأل «كم اليوم؟»، وأدوار الكلفة تقرأ الشهر (مراجعة D14).
  const defaultPeriod: Period = workspace && !workspace.canSeeCost ? 'today' : 'month';
  const view = pick<View>(search.get('view'), VIEWS, 'list');
  const period = pick<Period>(search.get('p'), PERIODS, defaultPeriod);
  const show = pick<Show>(search.get('f'), SHOWS, 'all');
  // البحث يُكتب في حالة الصفحة (فورياً، فلا يتأخّر الحرف خلف انتقال الموجّه) ويُنسخ إلى الرابط لـ«رجوع» من الفاتورة.
  const [query, setQuery] = useState(() => search.get('q') ?? '');
  // والرابط يغلب حين يتغيّر بغير البحث (الرجوع والتقدّم، وفواتير زبون من التقرير ثمّ الرجوع، مراجعة Q11): الخانة والتصفية كما في الرابط. والكتابة لا
  // تغيّر إلّا q فلا تُعاد إليها حروفها.
  const urlRest = (() => {
    const rest = new URLSearchParams(search);
    rest.delete('q');
    return rest.toString();
  })();
  const [seenRest, setSeenRest] = useState(urlRest);
  if (urlRest !== seenRest) {
    setSeenRest(urlRest);
    const urlQuery = search.get('q') ?? '';
    if (urlQuery !== query) setQuery(urlQuery);
  }
  const party = search.get('party');
  const partyName = search.get('pn');
  const urlFrom = search.get('from');
  const urlTo = search.get('to');
  const fixed = period === 'range' ? null : periodDays(period, today);
  // «مدّة…»: ما يكتبه المستخدم يبقى كما كتبه، والرابط يحمل آخر مدّة صحيحة.
  const [fromEdit, setFromEdit] = useState<string | null>(null);
  const [toEdit, setToEdit] = useState<string | null>(null);
  const rangeFrom = urlFrom !== null && isDay(urlFrom) ? urlFrom : monthStart(today);
  const rangeTo = urlTo !== null && isDay(urlTo) ? urlTo : today;
  const fromText = fromEdit ?? fmtDay(rangeFrom);
  const toText = toEdit ?? fmtDay(rangeTo);
  const typedFrom = parseDayText(fromText);
  const typedTo = parseDayText(toText);
  const periodError =
    period !== 'range' ? null : !typedFrom || !typedTo ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') : typedFrom > typedTo ? t('sales.period.order', '«إلى» قبل «من»؛ صحّح المدّة.') : null;
  const from = fixed ? fixed.from : periodError ? null : typedFrom;
  const to = fixed ? fixed.to : periodError ? null : typedTo;
  const ready = from !== null && to !== null;
  const loadList = useCallback((): Promise<SalesWithBirds | null> => (ready && view === 'list' ? birdSales.loadSales(from, to) : Promise.resolve(null)), [ready, view, from, to]);
  const list = useLoad(loadList, `${from}|${to}|${view}`);
  const loadReport = useCallback((): Promise<SalesReportWithBirds | null> => (ready && view !== 'list' ? birdSales.loadSalesReport(from, to, view) : Promise.resolve(null)), [ready, view, from, to]);
  const report = useLoad(loadReport, `${from}|${to}|${view}`);
  const shownList = useKept(list);
  const shownReport = useKept(report);
  // يوم الخادم يتقدّم ولا يرجع (مراجعة Q1): صفحة مفتوحة عبر منتصف ليل الخادم تحفظ قائمةً بيوم أمس وتقريراً بيوم اليوم، فأخذ كلّ منهما حين يختلف
  // يقلب اليوم بينهما بلا نهاية (React #301). الأحدث من الجوابين وممّا عُرف قبلهما.
  const newestDay = [shownList?.today ?? null, shownReport?.today ?? null].reduce<string | null>((known, day) => (day !== null && (known === null || day > known) ? day : known), serverToday);
  if (newestDay !== serverToday) setServerToday(newestDay);
  const costs = Boolean(workspace?.canSeeCost);
  const canSell = workspace ? can(workspace.role, 'sale.record') : false;
  const failure = view === 'list' ? list.error : report.error;
  const retry = view === 'list' ? list.retry : report.retry;
  // «بِع» من رابط قديم (?new=1، الرئيسية قبل 0033) يفتح الفاتورة الجديدة. بالانتقال لا بـ<Navigate>: ذاك يُدخل مكوّناً من react-router حزمة الإقلاع
  // لصفحة كسولة (+330 بايتاً مقيسة، درس DayBalanceView).
  const legacyNew = canSell && search.get('new') === '1';
  // فاتورة أُرسلت ولم يُعرف جوابها (محفوظة خارج المكوّن، عقد 0033): الشريط يدلّ عليها، و«أعد المحاولة» يفتح الفاتورة الجديدة مجمَّدةً بها.
  const pendingSale = canSell && workspace ? readSalePending(salePendingKey(workspace.userId, workspace.orgId)) : null;
  // سلّة بيع مفتوحة على هذا الجهاز (شاشة البيع تحفظها): شريحة تعيدها بلمسة (تصميم المبيعات ٨، مراجعة S14).
  const openSale = canSell && workspace && !pendingSale ? readSaleDraftSummary(workspace.userId, workspace.orgId) : null;
  useEffect(() => {
    if (legacyNew) navigate(newSalePath(), { replace: true });
  }, [legacyNew, navigate]);

  /**
   * يغيّر مفاتيح الرابط (null يحذف). المدّة والبحث والتصفية حالة القائمة فتستبدل الخطوة الحاليّة؛ والانتقال إلى فواتير زبون أو يوم من التقرير خطوة جديدة
   * يعود منها زرّ الرجوع إلى التقرير (مراجعة A5).
   */
  const patch = (changes: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearch(next, { replace: !push });
  };
  const choosePeriod = (next: Period) => {
    if (next === 'range') {
      // «مدّة…» تبدأ بالمدّة المعروضة الآن، فتُعدَّل ولا تُكتب من الصفر.
      const start = fixed ?? { from: rangeFrom, to: rangeTo };
      setFromEdit(null);
      setToEdit(null);
      patch({ p: 'range', from: start.from, to: start.to });
      return;
    }
    patch({ p: next === defaultPeriod ? null : next, from: null, to: null });
  };
  const typeRange = (side: 'from' | 'to', text: string) => {
    const clean = toWesternDigits(text);
    if (side === 'from') setFromEdit(clean);
    else setToEdit(clean);
    const nextFrom = side === 'from' ? parseDayText(clean) : typedFrom;
    const nextTo = side === 'to' ? parseDayText(clean) : typedTo;
    if (nextFrom && nextTo && nextFrom <= nextTo) patch({ from: nextFrom, to: nextTo });
  };
  const openReportRow = (row: SalesReportRow) => {
    if (view === 'party') {
      setQuery('');
      patch({ view: null, party: row.key, pn: row.label, q: null, f: null }, true);
    } else if (view === 'day' && isDay(row.key)) {
      setFromEdit(null);
      setToEdit(null);
      patch({ view: null, p: 'range', from: row.key, to: row.key }, true);
    }
  };

  const needle = searchable(query);
  const walkInName = searchable(t('invoice.walk_in', 'زبون نقديّ'));
  const filtered = needle !== '' || show !== 'all' || party !== null;
  const rows = (shownList?.rows ?? []).filter((row) => {
    const tone = rowTone(row);
    if (show === 'open' && tone !== 'partial' && tone !== 'credit') return false;
    if (show === 'void' && tone !== 'void') return false;
    if (party !== null && row.partyId !== party) return false;
    if (needle === '') return true;
    return searchable(row.walkIn ? walkInName : row.partyName).includes(needle) || searchable(row.docNo).includes(needle);
  });
  const empty =
    needle !== ''
      ? t('saleslist.empty.search', 'لا فاتورة لزبون أو برقم «{q}» في هذه المدّة.', { q: query.trim() })
      : show === 'open'
        ? t('saleslist.empty.open', 'لا فاتورة عليها باقٍ في هذه المدّة.')
        : show === 'void'
          ? t('saleslist.empty.void', 'لا فاتورة ملغاة في هذه المدّة.')
          : t('sales.empty', 'لا بيع في هذه المدّة.');
  const shownParty = party === null ? null : (partyName ?? shownList?.rows.find((row) => row.partyId === party)?.partyName ?? '');
  // المعروض لمدّة غير المطلوبة (قراءة الجديدة في الطريق أو فشلت): يخفت ويُقال.
  const listStale = Boolean(shownList && ready && (shownList.from !== from || shownList.to !== to));

  return (
    <div className="sale-ui sale-list-page flex flex-col gap-4">
      {/* العنوان و«بيع جديد» صفّ ثابت أعلى الصفحة (مراجعة D14): الزرّ في المتناول دائماً ولا يطفو فوق خلايا المال. */}
      <div className="sale-list-head">
        <h1 className="sale-list-title">{t('nav.sales', 'المبيعات')}</h1>
        {canSell ? (
          <Link to={newSalePath()} className="sale-newbtn" data-action="new-sale">
            <Plus aria-hidden="true" className="size-5" />
            {t('sales.new', 'بيع جديد')}
          </Link>
        ) : null}
      </div>
      {openSale ? <OpenSaleChip sale={openSale} /> : null}
      {pendingSale ? (
        <div data-action="sale-pending-banner">
          <Notice
            tone="warning"
            title={t('invoice.pending.banner', 'لم يُعرف إن حُفظت فاتورة — أعد المحاولة؛ لن تُسجَّل مرّتين.')}
            action={
              <Button size="sm" variant="secondary" className="sale-btn" onClick={() => navigate(newSalePath())} data-action="retry-pending-sale">
                {t('purchase.retry', 'أعد المحاولة')}
              </Button>
            }
          >
            {t('birds.sent', 'المرسَل: {what}', { what: sentText(pendingSale) })}
          </Notice>
        </div>
      ) : null}
      <div className="sale-view">
        <Segmented<View>
          label={t('sales.view', 'العرض')}
          options={[
            { value: 'list', label: t('sales.view.list', 'الفواتير') },
            { value: 'party', label: t('saleslist.view.party', 'حسب الزبون') },
            { value: 'item', label: t('sales.view.item', 'حسب المادّة') },
            { value: 'day', label: t('sales.view.day', 'حسب اليوم') },
          ]}
          value={view}
          onChange={(next) => patch({ view: next === 'list' ? null : next })}
        />
      </div>
      {/* المدّة والتصفية شرائح تلتفّ ولا تُخفى (مراجعة D14 ثمّ Q12): صفّ واحد حين يتّسع، وصفّان قصيران في الهاتف. */}
      <div className="sale-chips" data-action="sales-chips">
        <Pills<Period>
          label={t('saleslist.period', 'المدّة')}
          action="sales-period"
          options={[
            { value: 'today', label: t('saleslist.period.today', 'اليوم') },
            { value: 'week', label: t('saleslist.period.week', 'الأسبوع') },
            { value: 'month', label: t('saleslist.period.month', 'الشهر') },
            { value: 'range', label: t('saleslist.period.range', 'مدّة…') },
          ]}
          value={period}
          onChange={choosePeriod}
        />
        {view === 'list' ? (
          <Pills<Show>
            label={t('saleslist.show', 'الفواتير')}
            action="sales-show"
            options={[
              { value: 'all', label: t('saleslist.show.all', 'الكلّ') },
              { value: 'open', label: t('saleslist.show.open', 'عليها باقٍ') },
              { value: 'void', label: t('saleslist.show.void', 'ملغاة') },
            ]}
            value={show}
            onChange={(next) => patch({ f: next === 'all' ? null : next })}
          />
        ) : null}
      </div>
      {period === 'range' ? (
        <div className="grid gap-3 sm:grid-cols-2" data-action="sales-range">
          <DayField id={`${id}-from`} label={t('sales.from', 'من')} value={fromText} onChange={(text) => typeRange('from', text)} error={typedFrom ? null : periodError} />
          <DayField id={`${id}-to`} label={t('sales.to', 'إلى')} value={toText} onChange={(text) => typeRange('to', text)} error={typedFrom && periodError ? periodError : null} />
        </div>
      ) : null}
      {failure ? <LoadFailed what={view === 'list' ? t('sales.what', 'المبيعات') : t('sales.report.what', 'تقرير المبيعات')} error={failure} onRetry={retry} /> : null}
      {!ready ? null : view === 'list' ? (
        shownList ? (
          <>
            <SalesStrip data={shownList} stale={listStale} wide={wide} />
            <div className="sale-find">
              <label className="sale-search">
                <Search aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                <span className="sr-only">{t('saleslist.search', 'ابحث بالزبون أو رقم الفاتورة')}</span>
                <input
                  type="search"
                  enterKeyHint="search"
                  className="sale-search-input"
                  placeholder={t('saleslist.search', 'ابحث بالزبون أو رقم الفاتورة')}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    patch({ q: event.target.value });
                  }}
                  data-action="sales-search"
                />
                {query !== '' ? (
                  <button
                    type="button"
                    className="sale-search-off"
                    aria-label={t('saleslist.search.off', 'امسح البحث')}
                    onClick={() => {
                      setQuery('');
                      patch({ q: null });
                    }}
                    data-action="sales-search-off"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </button>
                ) : null}
              </label>
              {shownParty !== null ? (
                <button type="button" className="sale-party-on" onClick={() => patch({ party: null, pn: null })} data-action="party-off">
                  <span>{t('saleslist.party_on', 'فواتير «{party}»', { party: shownParty })}</span>
                  <X aria-hidden="true" className="size-4" />
                  <span className="sr-only">{t('saleslist.party_off', 'اعرض كلّ الزبائن')}</span>
                </button>
              ) : null}
            </div>
            {filtered ? (
              <p className="sale-hint" role="status" data-action="sales-found">
                {shownList.more
                  ? t('saleslist.found_more', '{shown} من آخر {all} معروضة', { shown: invoicesText(rows.length), all: invoicesText(shownList.rows.length) })
                  : t('saleslist.found', '{shown} من {all}', { shown: invoicesText(rows.length), all: invoicesText(shownList.rows.length) })}
              </p>
            ) : null}
            <SalesList data={shownList} rows={rows} filtered={filtered} wide={wide} listSearch={location.search} empty={empty} stale={listStale} />
            {shownList.more ? <p className="text-sm text-ink-muted">{t('sales.more', 'تُعرض آخر 1,000 فاتورة؛ والمجاميع للمدّة كلّها.')}</p> : null}
            {shownList.birds && !filtered ? <BirdsSection data={shownList.birds} from={shownList.from} to={shownList.to} /> : null}
          </>
        ) : failure ? null : (
          <p role="status" className="text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )
      ) : shownReport && shownReport.group === view ? (
        <>
          {view === 'party' || view === 'day' ? (
            <p className="sale-hint" data-action="report-hint">
              {view === 'party' ? t('saleslist.report.party_hint', 'اضغط الزبون لترى فواتيره.') : t('saleslist.report.day_hint', 'اضغط اليوم لترى فواتيره.')}
            </p>
          ) : null}
          <ReportTable data={shownReport} costs={costs} onOpen={view === 'party' || view === 'day' ? openReportRow : null} />
          {shownReport.birds ? <BirdGroupsTable data={shownReport.birds} group={view} /> : null}
        </>
      ) : failure ? null : (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      )}
    </div>
  );
}
