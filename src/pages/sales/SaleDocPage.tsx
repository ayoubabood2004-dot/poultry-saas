import { useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { StatStrip, type Stat } from '../../components/ui/StatStrip';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { SaleDoc } from '../../lib/repo/statement';
import * as statements from '../../lib/repo/statement';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';

// صفحة البيع للقراءة (عقد 0024 F8، /sales/:id): رأس الفاتورة (رقمها وتاريخها وحالتها والجهة والمخزن والدفع)، وسطورها بجدول، ومجاميعها
// (المبلغ والمقبوض نقداً والباقي بالدين، والكلفة والربح لأدوار الكلفة وحدها: cost.money يغيب لغيرها)، والملغاة بتاريخ إلغائها وسببه.
// يفتحها كشف الجهة وحركة الأموال (§5)، وفي حزمة المخزون مع صفحة المبيعات؛ والرجوع إلى ?back= (الحسابات أو المبيعات) وإلّا المبيعات.
// والملغاة (مراجعة 0024 L6): «ملغاة» في عنوانها، وبلا مبالغ ولا كلفة ولا ربح (كما تخفيها قائمة المبيعات لصفّ الملغى)، فلا تُقرأ ديناً قائماً.

/** طريق الرجوع من الرابط: مسار في الحسابات أو المبيعات وحده (بترميز URLSearchParams: المسافة «+»)، وإلّا صفحة المبيعات. */
export function saleBack(value: string | null): string {
  return value !== null && /^\/(?:accounts|sales)(?:[/?][\w\-/=&%.?+*]*)?$/u.test(value) ? value : '/sales';
}

/** الدفع بكلماته: بلا مقابل، أو نقداً ثمّ رُدّ المبلغ، أو نقداً، أو بالدين. */
export function salePaymentText(sale: Pick<SaleDoc, 'free' | 'paymentRefunded' | 'payment'>): string {
  if (sale.free) return t('sales.free', 'بلا مقابل');
  if (sale.paymentRefunded) return t('sales.refunded', 'نقداً، ثمّ رُدّ المبلغ');
  return sale.payment === 'cash' ? t('file.payment.cash', 'نقداً') : t('file.payment.credit', 'بالدين');
}

/** مبلغ بالدينار الصحيح، أو بمرتبتين إذا فيه فلوس (الكلفة من قيم الوجبات قد تحمل فلوساً). */
const dinars = (amount: bigint): string => t('sales.dinar', '{amount} دينار', { amount: fmtMoney(amount, amount % 100n === 0n ? 0 : 2) });

/** مال الفاتورة كما يُعرض: لا شيء للملغاة (لا مبلغ قائماً ولا دين ولا ربح)، وإلّا ما أرسله الخادم. */
const shownMoney = (sale: SaleDoc): SaleDoc['money'] => (sale.status === 'void' ? null : sale.money);

function saleStats(sale: SaleDoc): Stat[] {
  const money = shownMoney(sale);
  if (!money) return [];
  const stats: Stat[] = [
    { key: 'total', label: t('sale.doc.total', 'مبلغ الفاتورة'), value: dinars(money.lineTotal) },
    { key: 'paid', label: t('sale.doc.paid', 'المقبوض نقداً'), value: dinars(money.paidNow) },
    { key: 'credit', label: t('sale.doc.credit', 'بالدين'), value: dinars(money.lineTotal - money.paidNow) },
  ];
  if (sale.cost) {
    stats.push(
      { key: 'cost', label: t('sales.stat.cost', 'كلفة المبيع'), value: dinars(sale.cost.cost) },
      { key: 'profit', label: t('sales.stat.profit', 'الربح'), value: dinars(sale.cost.profit) },
    );
  }
  return stats;
}

function SaleLines({ sale }: { sale: SaleDoc }) {
  const decimals = columnDecimals([sale.qty], 3) as 0 | 1 | 2 | 3;
  const columns: Column<SaleDoc>[] = [
    { key: 'item', header: t('sales.col.item', 'المادّة'), wrap: true, cell: (row) => row.itemName },
    { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.qty, decimals)}</Num> },
    { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (row) => baseUnitLabel(row.baseUnit) },
  ];
  const money = shownMoney(sale);
  if (money) {
    columns.push(
      { key: 'price', header: t('sales.col.price', 'السعر'), kind: 'number', cell: () => <Num>{fmtMoney(money.unitPrice)}</Num> },
      { key: 'amount', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: () => <Num>{fmtMoney(money.lineTotal, 0)}</Num>, total: <Num>{fmtMoney(money.lineTotal, 0)}</Num> },
    );
  }
  return (
    <DataTable
      caption={t('sale.doc.lines', 'سطور الفاتورة {doc}', { doc: sale.docNo })}
      columns={columns}
      rows={[sale]}
      rowKey={(row) => row.lineId}
      empty=""
      {...(money ? { totalLabel: t('sales.report.total', 'المجموع') } : {})}
    />
  );
}

export default function SaleDocPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const accounts = workspace ? can(workspace.role, 'accounts.view') : false;
  const load = useCallback(() => statements.loadSaleDoc(id), [id]);
  const sale = useLoad(load, id);
  const data = sale.data;
  const back = saleBack(new URLSearchParams(location.search).get('back'));
  const backLabel = t('sale.doc.back', 'رجوع');
  if (sale.error instanceof NotConnectedError) {
    const { title, detail } = describeError(sale.error);
    return (
      <div className="flex flex-col gap-4">
        <BackButton to={back} label={backLabel} />
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <BackButton to={back} label={backLabel} />
      {sale.error ? (
        <LoadFailed what={t('sale.doc.what', 'فاتورة البيع')} error={sale.error} onRetry={sale.retry} />
      ) : !data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <PageHeader
            title={data.status === 'void' ? t('sale.doc.title.void', 'فاتورة بيع {doc} — ملغاة', { doc: data.docNo }) : t('sale.doc.title', 'فاتورة بيع {doc}', { doc: data.docNo })}
            subtitle={data.status === 'void' ? t('sale.doc.void', 'فاتورة ملغاة') : t('sale.doc.posted', 'فاتورة محفوظة')}
          />
          {data.status === 'void' ? (
            <Notice tone="warning" title={t('sale.doc.void.title', 'أُلغيت هذه الفاتورة')}>
              <span className="flex flex-col gap-1" data-action="sale-void">
                {data.voidReason ? <span>{t('sale.doc.void.reason', 'السبب: {reason}', { reason: data.voidReason })}</span> : null}
                <span>{t('sale.doc.void.money', 'لا يُحتسب مبلغها ولا ربحها، ولا دين بها على الجهة.')}</span>
              </span>
            </Notice>
          ) : null}
          <dl className="card grid gap-3 p-4 sm:grid-cols-2" data-action="sale-head">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-ink-muted">{t('sale.doc.no', 'رقم الفاتورة')}</dt>
              <dd className="font-semibold">
                <bdi dir="ltr">{data.docNo}</bdi>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-ink-muted">{t('ledger.date', 'التاريخ')}</dt>
              <dd className="font-semibold">
                <Num>{fmtDay(data.soldOn)}</Num>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-ink-muted">{t('sales.col.party', 'الجهة')}</dt>
              <dd className="font-semibold" data-action="sale-party">
                {accounts ? (
                  <Link to={`/accounts/parties/${data.partyId}`} className="text-brand-700 hover:underline dark:text-brand-200">
                    {data.partyName}
                  </Link>
                ) : (
                  data.partyName
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-ink-muted">{t('sale.doc.store', 'المخزن')}</dt>
              <dd className="font-semibold">{data.warehouseName}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-ink-muted">{t('sales.col.payment', 'الدفع')}</dt>
              <dd className="font-semibold" data-action="sale-payment">
                {salePaymentText(data)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-ink-muted">{t('sales.col.status', 'الحالة')}</dt>
              <dd className="font-semibold" data-action="sale-status">
                {data.status === 'void' ? t('sales.voided', 'ملغى') : t('sales.posted', 'محفوظ')}
              </dd>
            </div>
          </dl>
          <SaleLines sale={data} />
          <StatStrip stats={saleStats(data)} />
        </>
      )}
    </div>
  );
}
