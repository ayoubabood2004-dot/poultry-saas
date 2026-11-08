import { Plus } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { DayField } from '../../components/ui/DayField';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { StatStrip, type Stat } from '../../components/ui/StatStrip';
import { localDay } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { parseDayText } from '../../lib/dayText';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { SaleCost, SaleRow, SalesGroup, SalesOverview, SalesReport, SalesReportRow } from '../../lib/repo/purchases';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad, type LoadState } from '../../lib/useLoad';
import { PendingBanner } from '../inventory/ItemOps';
import { saleDoneText } from '../inventory/SaleDialog';
import { baseQty } from '../inventory/simple-shared';
import { NewSale, newSaleFlow, type SaleFlow } from './NewSale';

// صفحة المبيعات (0021، كلمة المالك 2026-11-08: «ماكو زر يوديني للمبيعات حتى ابيع… واكدر اسجل مبيعاتي لمنو وتطلعلي هاي السوالف بالتقارير»):
// «بيع جديد» (المادّة ثمّ نافذة «بِع» نفسها)، وفواتير المدّة بجدول ومجاميعها من الخادم، والتقرير حسب الجهة أو المادّة أو اليوم (الكلفة والربح لأدوار
// الكلفة وحدها: cost.money يغيب لغيرها). و«ألغِ» لكلّ فاتورة لمن يلغي بسبب، والمقبوض نقداً يبقى رصيداً للجهة (FOUNDATION ٥٨٣).
// في حزمة المخزون (StockRoutes) خارج التثبيت المسبق: البيع يسحب من الوجبات ويُحفظ بالخادم فوراً.

type View = 'list' | SalesGroup;

/** أوّل الشهر: المدّة الافتراضية من أوّل الشهر إلى اليوم. */
const monthStart = (day: string): string => `${day.slice(0, 8)}01`;

/** آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (مدّة أخرى أو بعد بيع). */
function useKept<T>(state: LoadState<T | null>): T | null {
  const [kept, setKept] = useState<T | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  return state.data ?? kept;
}

const money0 = (amount: Fils) => <Num>{fmtMoney(amount, 0)}</Num>;

function costColumns<R>(costs: boolean, of: (row: R) => SaleCost | null, total: SaleCost | null): Column<R>[] {
  if (!costs) return [];
  return [
    { key: 'cost', header: t('sales.col.cost', 'الكلفة'), kind: 'number', cell: (row) => { const c = of(row); return c ? money0(c.cost) : null; }, ...(total ? { total: money0(total.cost) } : {}) },
    { key: 'profit', header: t('sales.col.profit', 'الربح'), kind: 'number', cell: (row) => { const c = of(row); return c ? money0(c.profit) : null; }, ...(total ? { total: money0(total.profit) } : {}) },
  ];
}

/** عمودا الكمية والوحدة (نمط 0019): الكمية بمراتب العمود كلّه، والوحدة بعمودها لأنّ المواد بوحدات مختلفة. */
function qtyColumns<R>(rows: readonly R[], of: (row: R) => { qty: bigint; unit: SaleRow['baseUnit'] } | null): Column<R>[] {
  const decimals = columnDecimals(rows.flatMap((row) => { const q = of(row); return q ? [q.qty] : []; }), 3) as 0 | 1 | 2 | 3;
  return [
    { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (row) => { const q = of(row); return q ? <Num>{fmtQtyCell(q.qty, decimals)}</Num> : null; } },
    { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (row) => { const q = of(row); return q ? baseUnitLabel(q.unit) : null; } },
  ];
}

function SalesList({ data, onVoid }: { data: SalesOverview; onVoid: (row: SaleRow) => void }) {
  const money = data.rows.every((row) => row.money !== null) && data.totals.money !== null;
  // الملغى خارج المجموع (مجموع المحفوظ من الخادم)، فخانتا سعره ومبلغه «—» وحالته تقول إنّه ملغى (مراجعة 0021 M1).
  const shownMoney = (row: SaleRow) => (row.status === 'void' ? null : row.money);
  const columns: Column<SaleRow>[] = [
    { key: 'day', header: t('ledger.date', 'التاريخ'), sticky: true, cell: (row) => fmtDay(row.soldOn) },
    { key: 'no', header: t('sales.col.no', 'الرقم'), cell: (row) => row.docNo },
    { key: 'party', header: t('sales.col.party', 'الجهة'), wrap: true, cell: (row) => row.partyName },
    { key: 'item', header: t('sales.col.item', 'المادّة'), wrap: true, cell: (row) => row.itemName },
    ...qtyColumns(data.rows, (row) => ({ qty: row.qty, unit: row.baseUnit })),
  ];
  if (money) {
    columns.push(
      { key: 'price', header: t('sales.col.price', 'السعر'), kind: 'number', cell: (row) => { const m = shownMoney(row); return <Num>{m ? fmtMoney(m.unitPrice) : t('file.none', '—')}</Num>; } },
      {
        key: 'amount',
        header: t('sales.col.amount', 'المبلغ'),
        kind: 'number',
        cell: (row) => { const m = shownMoney(row); return m ? money0(m.lineTotal) : <Num>{t('file.none', '—')}</Num>; },
        ...(data.totals.money ? { total: money0(data.totals.money.revenue) } : {}),
      },
    );
  }
  columns.push({
    key: 'payment',
    header: t('sales.col.payment', 'الدفع'),
    cell: (row) => (row.free ? t('sales.free', 'بلا مقابل') : row.payment === 'cash' ? t('file.payment.cash', 'نقداً') : t('file.payment.credit', 'بالدين')),
  });
  columns.push({
    key: 'status',
    header: t('sales.col.status', 'الحالة'),
    cell: (row) =>
      row.status === 'void' ? (
        <span className="text-ink-muted" data-action="sale-voided">
          {t('sales.voided', 'ملغى')}
        </span>
      ) : data.canVoid ? (
        <Button size="sm" variant="ghost" onClick={() => onVoid(row)} data-action="void-sale">
          {t('sales.void', 'ألغِ')}
        </Button>
      ) : (
        t('sales.posted', 'محفوظ')
      ),
  });
  return (
    <DataTable
      caption={t('sales.caption', 'فواتير البيع من {from} إلى {to}، الأحدث أوّلاً', { from: fmtDay(data.from), to: fmtDay(data.to) })}
      columns={columns}
      rows={data.rows}
      rowKey={(row) => row.id}
      empty={t('sales.empty', 'لا بيع في هذه المدّة.')}
      {...(money && data.rows.length ? { totalLabel: t('sales.total', 'مجموع المحفوظ') } : {})}
    />
  );
}

function ReportTable({ data, costs }: { data: SalesReport; costs: boolean }) {
  const label = data.group === 'party' ? t('sales.col.party', 'الجهة') : data.group === 'item' ? t('sales.col.item', 'المادّة') : t('ledger.date', 'التاريخ');
  const money = data.totals.revenue !== null;
  const columns: Column<SalesReportRow>[] = [
    { key: 'label', header: label, sticky: true, wrap: true, cell: (row) => row.label },
    { key: 'count', header: t('sales.col.count', 'عدد الفواتير'), kind: 'number', cell: (row) => <Num>{fmtInt(row.count)}</Num>, total: <Num>{fmtInt(data.totals.count)}</Num> },
  ];
  if (data.group === 'item') columns.push(...qtyColumns(data.rows, (row) => (row.qty !== null && row.baseUnit !== null ? { qty: row.qty, unit: row.baseUnit } : null)));
  if (money) {
    columns.push({ key: 'revenue', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (row) => (row.revenue !== null ? money0(row.revenue) : null), ...(data.totals.revenue !== null ? { total: money0(data.totals.revenue) } : {}) });
  }
  columns.push(...costColumns<SalesReportRow>(costs && data.totals.cost !== null, (row) => row.cost, data.totals.cost));
  return (
    <DataTable
      caption={t('sales.report.caption', 'تقرير المبيعات حسب {group}', { group: label })}
      columns={columns}
      rows={data.rows}
      rowKey={(row) => row.key}
      empty={t('sales.empty', 'لا بيع في هذه المدّة.')}
      {...(data.rows.length ? { totalLabel: t('sales.report.total', 'المجموع') } : {})}
    />
  );
}

function overviewStats(data: SalesOverview): Stat[] {
  const stats: Stat[] = [{ key: 'count', label: t('sales.stat.count', 'فواتير محفوظة'), value: fmtInt(data.totals.count) }];
  if (data.totals.money) {
    stats.push(
      { key: 'revenue', label: t('sales.stat.revenue', 'مجموع البيع'), value: t('sales.dinar', '{amount} دينار', { amount: fmtMoney(data.totals.money.revenue, 0) }) },
      { key: 'cash', label: t('sales.stat.cash', 'منه نقداً'), value: t('sales.dinar', '{amount} دينار', { amount: fmtMoney(data.totals.money.cash, 0) }) },
      { key: 'credit', label: t('sales.stat.credit', 'منه بالدين'), value: t('sales.dinar', '{amount} دينار', { amount: fmtMoney(data.totals.money.credit, 0) }) },
    );
  }
  if (data.totals.cost) {
    stats.push(
      { key: 'cost', label: t('sales.stat.cost', 'كلفة المبيع'), value: t('sales.dinar', '{amount} دينار', { amount: fmtMoney(data.totals.cost.cost, 0) }) },
      { key: 'profit', label: t('sales.stat.profit', 'الربح'), value: t('sales.dinar', '{amount} دينار', { amount: fmtMoney(data.totals.cost.profit, 0) }) },
    );
  }
  return stats;
}

/** «ألغِ» البيع بسبب إلزاميّ: البضاعة ترجع لوجباتها ويُعكس قيد الفاتورة، والمقبوض نقداً يبقى رصيداً للجهة. */
function VoidSaleDialog({ row, onCancel, onDone }: { row: SaleRow; onCancel: () => void; onDone: (text: string) => void }) {
  const id = useId();
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  // السبب المرسَل بعد نتيجة مجهولة: الإعادة به وبالمرجع نفسه (سبب آخر بالمرجع نفسه ref_reused)، والحقل مقفول حتى يُعرف.
  const [sent, setSent] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const missing = (sent ?? reason).trim() === '' ? t('sales.void.reason_required', 'اكتب سبب الإلغاء.') : null;
  const failed = failure ? (failure instanceof RejectedError && failure.hint ? failure.hint : `${describeError(failure).title}. ${describeError(failure).detail}`) : null;
  const total = row.money ? fmtMoney(row.money.lineTotal, 0) : null;
  return (
    <ConfirmDialog
      open
      title={t('sales.void.title', 'إلغاء البيع {no}؟', { no: row.docNo })}
      consequence={
        <div className="flex flex-col gap-3">
          <p>
            {row.free
              ? t('sales.void.body_free', 'ترجع {qty} من «{item}» إلى مخزنها (تسليم بلا مقابل لـ«{party}»: لا قيد عليه).', { qty: baseQty(row.qty, row.baseUnit), item: row.itemName, party: row.partyName })
              : t('sales.void.body', 'ترجع {qty} من «{item}» إلى مخزنها، ويُعكس قيد الفاتورة على «{party}».', { qty: baseQty(row.qty, row.baseUnit), item: row.itemName, party: row.partyName })}
          </p>
          {sent !== null ? (
            <p className="text-sm" data-action="void-sale-unknown">
              {t('sales.void.unknown', 'لم يُعرف إن أُلغي؛ «ألغِ البيع» يعيده بالسبب نفسه، ولن يُلغى مرّتين.')}
            </p>
          ) : null}
          {row.payment === 'cash' && !row.free && total ? (
            <p data-action="void-cash-kept">
              {t('sales.void.cash_kept', 'والمبلغ المقبوض نقداً ({total} دينار) يبقى رصيداً لـ«{party}»: يُرجَع له من كشفه بـ«ألغِ القبض»، أو يُخصم من فاتورة لاحقة.', { total, party: row.partyName })}
            </p>
          ) : null}
          <Field id={`${id}-reason`} label={t('sales.void.reason', 'سبب الإلغاء')} error={tried ? (missing ?? failed) : failed}>
            <input id={`${id}-reason`} className="input" maxLength={500} value={sent ?? reason} disabled={busy || sent !== null} onChange={(event) => setReason(event.target.value)} data-action="void-sale-reason" />
          </Field>
        </div>
      }
      confirmLabel={t('sales.void.confirm', 'ألغِ البيع')}
      busy={busy}
      action="confirm-void-sale"
      onCancel={onCancel}
      onConfirm={() => {
        setTried(true);
        if (missing) return;
        const text = (sent ?? reason).trim();
        setBusy(true);
        setFailure(null);
        purchases.voidSale(clientRef, row.id, text).then(
          (voided) => {
            const kept = voided.paymentKept !== null && voided.paymentKept > 0n ? t('sales.void.done_kept', ' والمقبوض {total} دينار باقٍ رصيداً لـ«{party}».', { total: fmtMoney(voided.paymentKept, 0), party: row.partyName }) : '';
            onDone(`${t('sales.void.done', 'أُلغي البيع {no}.', { no: voided.docNo })}${kept}`);
          },
          (caught: unknown) => {
            setBusy(false);
            setFailure(caught);
            // نتيجة مجهولة (أو إعادة لها لم تُرفض رفضاً أكيداً): السبب والمرجع يتجمّدان؛ والرفض الأكيد يفكّهما بمرجع جديد للمحاولة التالية.
            if (caught instanceof UnknownOutcomeError || (sent !== null && !(caught instanceof RejectedError))) setSent(text);
            else {
              setSent(null);
              setClientRef(crypto.randomUUID());
            }
          },
        );
      }}
    />
  );
}

export default function SalesPage() {
  const id = useId();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const [search, setSearch] = useSearchParams();
  const [selling, setSelling] = useState(false);
  // «بيع جديد»: المادّة والمعرّفات والنداء المعلَّق في الصفحة (مراجعة 0021 H1): الإغلاق بعد نتيجة مجهولة يبقيها، والشريط يعيد فتحها.
  const [flow, setFlow] = useState<SaleFlow | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<SaleRow | null>(null);
  // المدّة الافتراضية من يوم الخادم حين يُعرف (لا ساعة الجهاز)؛ وما يكتبه المستخدم يبقى كما كتبه.
  const [serverToday, setServerToday] = useState<string | null>(null);
  const today = serverToday ?? localDay();
  const [fromEdit, setFromEdit] = useState<string | null>(null);
  const [toEdit, setToEdit] = useState<string | null>(null);
  const fromText = fromEdit ?? fmtDay(monthStart(today));
  const toText = toEdit ?? fmtDay(today);
  const [view, setView] = useState<View>('list');
  const [round, setRound] = useState(0);
  const from = parseDayText(fromText);
  const to = parseDayText(toText);
  const periodError = !from || !to ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') : from > to ? t('sales.period.order', '«إلى» قبل «من»؛ صحّح المدّة.') : null;
  const ready = !periodError && from !== null && to !== null;
  const loadList = useCallback(() => (ready && view === 'list' ? purchases.loadSalesOverview(from, to) : Promise.resolve(null)), [ready, view, from, to]);
  const list = useLoad(loadList, `${from}|${to}|${view}|${round}`);
  const loadReport = useCallback(() => (ready && view !== 'list' ? purchases.loadSalesReport(from, to, view) : Promise.resolve(null)), [ready, view, from, to]);
  const report = useLoad(loadReport, `${from}|${to}|${view}|${round}`);
  const shownList = useKept(list);
  if (shownList && shownList.today !== serverToday) setServerToday(shownList.today);
  const shownReport = useKept(report);
  const costs = Boolean(workspace?.canSeeCost);
  const canSell = workspace ? can(workspace.role, 'sale.record') : false;
  // «بِع» من الرئيسية (?new=1) يفتح «بيع جديد» مباشرةً؛ والإغلاق يشيل العلامة.
  const open = canSell && (selling || search.get('new') === '1');
  const close = () => {
    setSelling(false);
    if (search.has('new')) setSearch({}, { replace: true });
    // بلا نداء معلَّق تنتهي الجلسة؛ ومعه تبقى بمعرّفاتها.
    if (!flow?.call.pending) setFlow(null);
  };
  const pendingSale = flow?.call.pending ?? null;
  const refresh = () => setRound((n) => n + 1);
  const failure = view === 'list' ? list.error : report.error;
  const retry = view === 'list' ? list.retry : report.retry;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.sales', 'المبيعات')}
        subtitle={t('sales.subtitle', 'كلّ بيع لمن ومتى وبكم، ومجاميع المدّة، والتقرير حسب الجهة أو المادّة أو اليوم.')}
        actions={
          canSell ? (
            <Button size="lg" onClick={() => setSelling(true)} data-action="new-sale">
              <Plus aria-hidden="true" className="size-5" />
              {t('sales.new', 'بيع جديد')}
            </Button>
          ) : undefined
        }
      />
      {saved ? <Notice tone="info" title={saved} /> : null}
      {pendingSale && !open ? <PendingBanner what={t('op.what.sale', 'البيع')} summary={pendingSale.summary} onRetry={() => setSelling(true)} action="retry-pending-sale" /> : null}
      <div className="grid gap-3 sm:grid-cols-2" data-action="sales-period">
        <DayField id={`${id}-from`} label={t('sales.from', 'من')} value={fromText} onChange={(text) => setFromEdit(toWesternDigits(text))} error={from ? null : periodError} />
        <DayField id={`${id}-to`} label={t('sales.to', 'إلى')} value={toText} onChange={(text) => setToEdit(toWesternDigits(text))} error={from && periodError ? periodError : null} />
      </div>
      <Segmented<View>
        label={t('sales.view', 'العرض')}
        options={[
          { value: 'list', label: t('sales.view.list', 'الفواتير') },
          { value: 'party', label: t('sales.view.party', 'حسب الجهة') },
          { value: 'item', label: t('sales.view.item', 'حسب المادّة') },
          { value: 'day', label: t('sales.view.day', 'حسب اليوم') },
        ]}
        value={view}
        onChange={setView}
      />
      {failure ? <LoadFailed what={view === 'list' ? t('sales.what', 'المبيعات') : t('sales.report.what', 'تقرير المبيعات')} error={failure} onRetry={retry} /> : null}
      {!ready ? null : view === 'list' ? (
        shownList ? (
          <>
            <StatStrip stats={overviewStats(shownList)} />
            <SalesList data={shownList} onVoid={setVoiding} />
            {shownList.more ? <p className="text-sm text-ink-muted">{t('sales.more', 'تُعرض آخر 1,000 فاتورة؛ والمجاميع للمدّة كلّها.')}</p> : null}
          </>
        ) : failure ? null : (
          <p role="status" className="text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )
      ) : shownReport && shownReport.group === view ? (
        <ReportTable data={shownReport} costs={costs} />
      ) : failure ? null : (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      )}
      {open ? (
        <NewSale
          flow={flow ?? newSaleFlow()}
          onFlow={setFlow}
          onClose={() => {
            close();
            refresh();
          }}
          onSaved={(result) => {
            setFlow(null);
            setSelling(false);
            if (search.has('new')) setSearch({}, { replace: true });
            setSaved(saleDoneText(result));
            refresh();
          }}
        />
      ) : null}
      {voiding ? (
        <VoidSaleDialog
          row={voiding}
          onCancel={() => setVoiding(null)}
          onDone={(text) => {
            setVoiding(null);
            setSaved(text);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
