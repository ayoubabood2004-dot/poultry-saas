import type { ReactNode, Ref } from 'react';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { amountInWords } from '../../domain/amountWords';
import { decimalText } from '../../domain/decimal';
import { FILS_PER_DINAR, type Fils, type Milli } from '../../domain/money';
import { columnDecimals, countForm, fmtCounted, fmtDay, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { InvoiceLine, SaleInvoice } from '../../lib/repo/sales';
import { baseUnitLabel } from '../../lib/storeLabels';

// قطع الفاتورة الاحترافيّة (عقد 0033 «ب»): المبالغ والعدد بالفصحى من منسّقات format.ts، والطرق والرجوع، وورقة الفاتورة نفسها (تُعرض في صفحتها، وتُطبع A5،
// وتُصوَّر بعرض ثابت لـ«أرسل صورة»: ما يُطبع هو ما يُرسل). في حزمة المخزون الكسولة (المبيعات) خارج التثبيت المسبق، وبلا أصناف Tailwind جديدة: التخطيط
// الخاصّ بالطباعة والصورة بقواعد <style> على data-action وdata-capture.

/** مبلغ بالدينار الصحيح، أو بمرتبتين إذا فيه فلوس (سعر الوحدة قد يحمل فلساً). */
export const moneyText = (amount: Fils): string => fmtMoney(amount, amount % FILS_PER_DINAR === 0n ? 0 : 2);
export const dinars = (amount: Fils): string => t('sales.dinar', '{amount} دينار', { amount: moneyText(amount) });

/** نصّ الخانة لمبلغ: الدينار الصحيح بلا كسر، وإلّا بمرتبتين (قيمة الخانة، لا عرض). */
export const inputMoney = (amount: Fils): string => (amount % FILS_PER_DINAR === 0n ? decimalText(amount / FILS_PER_DINAR, 0) : decimalText(amount, 2));

/** «مادّة واحدة»، «مادّتان»، «3 موادّ»، «11 مادّةً»، «100 مادّة». */
export function linesText(n: number): string {
  if (n === 1) return t('invoice.lines.one', 'مادّة واحدة');
  if (n === 2) return t('invoice.lines.two', 'مادّتان');
  const form = countForm(n);
  if (form === 'few') return t('invoice.lines.few', '{n} موادّ', { n });
  if (form === 'many') return t('invoice.lines.many', '{n} مادّةً', { n });
  return t('invoice.lines.hundreds', '{n} مادّة', { n });
}

/** الكمية بوحدة السطر: «2 كيس»، «150 كغم». */
export const unitQtyText = (qty: Milli, label: string): string => fmtCounted(qty, label);

/** اسم وحدة السطر: اسمها، أو اسم وحدة الأساس. */
export const lineUnitLabel = (line: Pick<InvoiceLine, 'unitLabel' | 'baseUnit'>): string => line.unitLabel ?? baseUnitLabel(line.baseUnit);

// ─── الطرق ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** الفاتورة الجديدة (/sales/new)، ومعها مادّة تُضاف أوّلاً ومخزنها، وطريق الرجوع. */
export function newSalePath(options: { item?: string; store?: string; back?: string } = {}): string {
  const params = new URLSearchParams();
  if (options.item) params.set('item', options.item);
  if (options.store) params.set('store', options.store);
  if (options.back) params.set('back', options.back);
  const query = params.toString();
  return query ? `/sales/new?${query}` : '/sales/new';
}

/** طريق الرجوع من الفاتورة الجديدة: المبيعات أو المخزن أو الرئيسية (مسار داخليّ وحده)، وإلّا المبيعات. */
export function checkoutBack(value: string | null): string {
  return value !== null && /^\/(?:$|(?:sales|inventory)(?:[/?][\w\-/=&%.?+*]*)?$)/u.test(value) ? value : '/sales';
}

/** اسم زرّ الرجوع بوجهته. */
export function checkoutBackLabel(path: string): string {
  if (path === '/') return t('back.home', 'رجوع إلى الرئيسية');
  if (path.startsWith('/inventory')) return t('back.store', 'رجوع إلى المخزن');
  return t('halls.ticket.back_sales', 'رجوع إلى المبيعات');
}

// ─── ورقة الفاتورة ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * الطباعة A5 وصورة «أرسل صورة» (reportImage ينسخ الورقة بـdata-capture خارج الشاشة بعرض ثابت): بلا إطار البطاقة في الطباعة، والجدول بلا حدّ ارتفاع ولا
 * تمرير في الصورة، وخطّ الجدول أصغر قليلاً.
 */
export const PAPER_STYLE = [
  '@page { size: A5 portrait; margin: 9mm; }',
  '@media print {',
  '[data-action="sale-paper"] { box-shadow: none; border: 0; max-width: none; }',
  '[data-action="sale-paper"] table { font-size: 11px; }',
  '[data-action="sale-paper"] th, [data-action="sale-paper"] td { padding: 2px 4px; white-space: normal; min-width: 0; }',
  '[data-action="sale-paper"] > div { max-height: none; overflow: visible; }',
  '}',
  '[data-capture] { padding: 20px; max-width: none; margin: 0; }',
  '[data-capture] > div { max-height: none; overflow: visible; }',
  '[data-capture] table { font-size: 12px; }',
  '[data-capture] th, [data-capture] td { padding: 3px 6px; white-space: normal; min-width: 0; position: static; }',
  '[data-capture] td bdi { white-space: nowrap; }',
].join(' ');

/** عرض صورة الفاتورة بنقاط CSS: ورقة هاتف تُقرأ في واتساب بلا تكبير (وبالمقياس 2 تخرج 1,120 نقطة). */
export const INVOICE_IMAGE_WIDTH = 560;

/** اسم ملفّ الصورة برقم الفاتورة (لاتينيّ: يُحفظ في كلّ جهاز). */
export const invoiceImageName = (docNo: string): string => `invoice-${docNo.replace(/[^\w-]+/gu, '-')}.png`;

/** عنوان الورقة واسم ملفّ الطباعة. */
export const invoiceTitle = (docNo: string): string => t('invoice.paper.title_no', 'فاتورة بيع {no}', { no: docNo });

const LOGO_STYLE = { width: '40px', height: '40px' } as const;
const SIGN_STYLE = { minWidth: '9rem', paddingTop: '2.25rem', paddingBottom: '0.25rem', borderBottom: '1px dotted currentColor' } as const;
const STAMP_STYLE = { border: '3px double rgb(220 38 38)', color: 'rgb(185 28 28)', borderRadius: '0.75rem', padding: '0.75rem 1rem' } as const;

function PaperLine({ label, action, children }: { label: string; action: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line py-2" data-action={action}>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{children}</span>
    </div>
  );
}

/**
 * سطور الفاتورة: المادّة | الكمية | الوحدة | السعر | الإجماليّ | الخصم | المبلغ (والخصم مجموع خصم السطر ونصيبه من خصم الفاتورة)، بمجاميعها. والملغاة
 * (money = false) بلا سعر ولا مبلغ ولا مجموع: لا تُقرأ ديناً قائماً (مراجعة 0024 L6).
 */
export function InvoiceLinesTable({ invoice, caption, money = true }: { invoice: Pick<SaleInvoice, 'lines' | 'grossTotal' | 'discountTotal' | 'total'>; caption: string; money?: boolean }) {
  const lines = invoice.lines;
  const qtyDecimals = columnDecimals(lines.map((line) => line.unitQty), 3) as 0 | 1 | 2 | 3;
  const priceDecimals = lines.some((line) => line.unitPrice % FILS_PER_DINAR !== 0n) ? 2 : 0;
  const discounts = lines.some((line) => line.lineDiscount + line.invoiceShare > 0n);
  const columns: Column<InvoiceLine>[] = [
    { key: 'item', header: t('sales.col.item', 'المادّة'), wrap: true, cell: (line) => line.itemName },
    { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.unitQty, qtyDecimals)}</Num> },
    { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (line) => lineUnitLabel(line) },
  ];
  if (!money) return <DataTable caption={caption} columns={columns} rows={lines} rowKey={(line) => line.lineId} empty="" />;
  columns.push({ key: 'price', header: t('sales.col.price', 'السعر'), kind: 'number', cell: (line) => <Num>{fmtMoney(line.unitPrice, priceDecimals)}</Num> });
  if (discounts) {
    columns.push(
      { key: 'gross', header: t('invoice.col.gross', 'الإجمالي'), kind: 'number', cell: (line) => <Num>{fmtMoney(line.gross, 0)}</Num>, total: <Num>{fmtMoney(invoice.grossTotal, 0)}</Num> },
      {
        key: 'discount',
        header: t('invoice.col.discount', 'الخصم'),
        kind: 'number',
        cell: (line) => <Num>{fmtMoney(line.lineDiscount + line.invoiceShare, 0)}</Num>,
        total: <Num>{fmtMoney(invoice.discountTotal, 0)}</Num>,
      },
    );
  }
  columns.push({ key: 'net', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (line) => <Num>{fmtMoney(line.net, 0)}</Num>, total: <Num>{fmtMoney(invoice.total, 0)}</Num> });
  return <DataTable caption={caption} columns={columns} rows={lines} rowKey={(line) => line.lineId} empty="" totalLabel={t('sales.report.total', 'المجموع')} />;
}

/** الدفع على الورقة: المدفوع الآن بصناديقه، أو «بالدين كلّه». */
function paidText(invoice: SaleInvoice): string {
  if (invoice.paymentRefunded) return t('invoice.paper.refunded', 'قُبض ثمّ رُدّ للزبون، فالمبلغ كلّه بالدين');
  if (invoice.paid === 0n) return t('invoice.paper.paid_none', 'لا شيء (المبلغ كلّه بالدين)');
  if (invoice.payments.length === 0) return dinars(invoice.paid);
  return invoice.payments
    .map((leg) => t('invoice.paper.leg', '{amount} في «{box}»', { amount: dinars(leg.amount), box: leg.cashAccountName }))
    .join(t('list.separator', '، '));
}

/**
 * ورقة الفاتورة: رأس المنشأة واسم الفاتورة ورقمها ويومها، والزبون (أو «زبون نقديّ») والمخزن، والسطور بجدولها، والإجماليّ والخصم والصافي بالأرقام والكلمات،
 * والمدفوع الآن بصناديقه والباقي ديناً، والملاحظة والبائع، و«شكراً لتعاملكم»، وختم «ملغى» للملغاة. الأرقام من الخادم كما هي.
 */
export function InvoicePaper({ invoice, orgName, paperRef }: { invoice: SaleInvoice; orgName: string; paperRef?: Ref<HTMLElement> }) {
  const voided = invoice.status === 'void';
  return (
    <article ref={paperRef} className="card mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6" data-action="sale-paper">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          {/* الشعار (أيقونة التطبيق من الأصل نفسه، فتدخل الصورة والطباعة): بنمط مضمَّن لا بصنف جديد. */}
          <img src="/favicon.svg" alt="" aria-hidden="true" width={40} height={40} style={LOGO_STYLE} data-action="sale-paper-logo" />
          <p className="text-lg font-semibold" data-action="org-name">
            {orgName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <h2 className="text-2xl font-semibold" data-action="sale-paper-title">
            {t('invoice.paper.title', 'فاتورة بيع')}
          </h2>
          <p className="text-sm" data-action="sale-paper-no">
            {t('voucher.no', 'رقم:')} <Num>{invoice.docNo}</Num>
          </p>
          <p className="text-sm" data-action="sale-paper-date">
            {t('voucher.date', 'التاريخ:')} <Num>{fmtDay(invoice.soldOn)}</Num>
          </p>
        </div>
      </header>
      {voided ? (
        <div className="flex flex-col items-center gap-1 text-center" style={STAMP_STYLE} role="status" data-action="void-stamp">
          <strong className="text-2xl">{t('paper.void', 'ملغى')}</strong>
          {invoice.voidReason ? <span className="text-sm">{t('invoice.paper.void_reason', 'السبب: {reason}', { reason: invoice.voidReason })}</span> : null}
        </div>
      ) : null}
      <PaperLine label={t('invoice.paper.customer', 'الزبون:')} action="sale-paper-customer">
        {invoice.walkIn ? t('invoice.walk_in', 'زبون نقديّ') : invoice.partyName}
      </PaperLine>
      <PaperLine label={t('invoice.paper.store', 'من مخزن:')} action="sale-paper-store">
        {invoice.warehouseName}
      </PaperLine>
      <InvoiceLinesTable invoice={invoice} caption={t('sale.doc.lines', 'سطور الفاتورة {doc}', { doc: invoice.docNo })} money={!voided} />
      {voided ? null : (
        <>
          {invoice.discountTotal > 0n ? (
            <>
              <PaperLine label={t('invoice.paper.gross', 'الإجمالي:')} action="sale-paper-gross">
                {dinars(invoice.grossTotal)}
              </PaperLine>
              <PaperLine label={t('invoice.paper.discount', 'الخصم:')} action="sale-paper-discount">
                {dinars(invoice.discountTotal)}
              </PaperLine>
            </>
          ) : null}
          <PaperLine label={t('invoice.paper.total', 'الصافي:')} action="sale-paper-total">
            {dinars(invoice.total)}
          </PaperLine>
          <p className="rounded-2xl border border-line px-3 py-2 font-semibold" data-action="sale-paper-words">
            {amountInWords(invoice.total)}
          </p>
          <PaperLine label={t('invoice.paper.paid', 'المدفوع الآن:')} action="sale-paper-paid">
            {paidText(invoice)}
          </PaperLine>
          {invoice.walkIn ? null : (
            <PaperLine label={t('invoice.paper.debt', 'الباقي ديناً:')} action="sale-paper-debt">
              {dinars(invoice.debt)}
            </PaperLine>
          )}
        </>
      )}
      {invoice.note !== null ? (
        <p className="text-sm" data-action="sale-paper-note">
          {t('invoice.paper.note', 'ملاحظة: {note}', { note: invoice.note })}
        </p>
      ) : null}
      {invoice.postedByName !== null ? (
        <p className="text-sm text-ink-muted" data-action="sale-paper-seller">
          {t('invoice.paper.seller', 'البائع: {name}', { name: invoice.postedByName })}
        </p>
      ) : null}
      <p className="pt-4 text-center font-semibold" data-action="sale-paper-thanks">
        {t('invoice.paper.thanks', 'شكراً لتعاملكم')}
      </p>
      <div className="flex flex-wrap justify-between gap-6 pt-4" data-action="signatures">
        {[t('invoice.sign.seller', 'البائع'), t('birds.sign.receiver', 'المستلم')].map((role) => (
          <div key={role} className="text-sm" style={SIGN_STYLE}>
            {role}
          </div>
        ))}
      </div>
    </article>
  );
}
