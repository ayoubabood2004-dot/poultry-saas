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
 * الطباعة A5 وصورة «أرسل على واتساب» (reportImage ينسخ الورقة بـdata-capture خارج الشاشة بعرض ثابت): بلا إطار البطاقة في الطباعة، والجدول بلا حدّ ارتفاع
 * ولا تمرير في الصورة، وخطّ الجدول أصغر قليلاً. وشكل الورقة نفسها (الرأس والمجاميع والختم) في doc.css الكسول.
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

/** خيارات صورة الفاتورة: فاتحة ولو كان الجهاز داكناً (الصورة للزبون، مراجعة 0033 D2)، وعلى ورق أبيض. */
export const INVOICE_IMAGE_OPTIONS = { light: true, background: 'rgb(255, 255, 255)' } as const;

/** اسم ملفّ الصورة برقم الفاتورة (لاتينيّ: يُحفظ في كلّ جهاز). */
export const invoiceImageName = (docNo: string): string => `invoice-${docNo.replace(/[^\w-]+/gu, '-')}.png`;

/** عنوان الورقة واسم ملفّ الطباعة. */
export const invoiceTitle = (docNo: string): string => t('invoice.paper.title_no', 'فاتورة بيع {no}', { no: docNo });

/**
 * كمية السطر بمراتبها هي: «3» لا «3.0» ولو كان في سطر آخر «25.5» (وحدات السطور مختلفة: كيس وكغم وعلبة، فلا يصطفّ عمودها بمراتب واحدة، وكيس
 * «3.0» يُقرأ كسراً، تدقيق 2026-11-18).
 */
export const lineQtyText = (qty: Milli): string => fmtQtyCell(qty, columnDecimals([qty], 3) as 0 | 1 | 2 | 3);

/** سعر السطر: الدينار الصحيح بلا كسر، وبمرتبتين إن حمل فلساً. */
export const priceText = (price: Fils): string => fmtMoney(price, price % FILS_PER_DINAR === 0n ? 0 : 2);

/** الخصم سالباً في تذييل الجدول («-6,000»). */
const minus = (amount: Fils): string => fmtMoney(-amount, 0);

const LOGO_STYLE = { width: '40px', height: '40px' } as const;

function PaperLine({ label, action, children }: { label: string; action: string; children: ReactNode }) {
  return (
    <div className="inv-line" data-action={action}>
      <span className="inv-line-label">{label}</span>
      <span className="inv-line-value">{children}</span>
    </div>
  );
}

/**
 * سطور الفاتورة على الورقة: المادّة | الكمية | الوحدة | السعر | المبلغ، والمبلغ إجماليّ السطر (الكمية × السعر) قبل أيّ خصم، فمجموع العمود «المجموع» ثمّ
 * «الخصم» مرّة واحدة في التذييل (خصم السطور وخصم الفاتورة معاً): خصم الفاتورة موزَّعاً على السطور كان يكتب مبالغ غريبة (3,128 و754 و1,118) لا يفهمها
 * الزبون (تدقيق 2026-11-18). والملغاة (money = false) بلا سعر ولا مبلغ ولا مجموع: لا تُقرأ ديناً قائماً (مراجعة 0024 L6).
 */
export function InvoiceLinesTable({ invoice, caption, money = true }: { invoice: Pick<SaleInvoice, 'lines' | 'grossTotal' | 'discountTotal' | 'total'>; caption: string; money?: boolean }) {
  const lines = invoice.lines;
  const columns: Column<InvoiceLine>[] = [
    { key: 'item', header: t('sales.col.item', 'المادّة'), wrap: true, cell: (line) => line.itemName },
    { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (line) => <Num>{lineQtyText(line.unitQty)}</Num> },
    { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (line) => lineUnitLabel(line) },
  ];
  if (!money) return <DataTable caption={caption} columns={columns} rows={lines} rowKey={(line) => line.lineId} empty="" />;
  const priceDecimals = lines.some((line) => line.unitPrice % FILS_PER_DINAR !== 0n) ? 2 : 0;
  columns.push(
    { key: 'price', header: t('sales.col.price', 'السعر'), kind: 'number', cell: (line) => <Num>{fmtMoney(line.unitPrice, priceDecimals)}</Num> },
    { key: 'amount', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (line) => <Num>{fmtMoney(line.gross, 0)}</Num>, total: <Num>{fmtMoney(invoice.grossTotal, 0)}</Num> },
  );
  const footers = invoice.discountTotal > 0n ? [{ key: 'discount', label: t('invoice.col.discount', 'الخصم'), cells: { amount: <Num>{minus(invoice.discountTotal)}</Num> } }] : [];
  return <DataTable caption={caption} columns={columns} rows={lines} rowKey={(line) => line.lineId} empty="" totalLabel={t('sales.report.total', 'المجموع')} footers={footers} />;
}

/**
 * الدفع عند البيع على الورقة: المدفوع بصناديقه، وما رُدّ من السيقان بصناديقه («ورُدّ 2,000 دينار من «المصرف»»)، أو «لا شيء». payment_refunded يعني أنّ
 * ساقاً واحدة على الأقلّ رُدّت، لا كلّها: «قُبض ثمّ رُدّ» حين لا يبقى شيء مدفوعاً وحده (مراجعة 0033 D3).
 */
function paidText(invoice: SaleInvoice): string {
  const refunded = invoice.payments.filter((leg) => leg.refunded);
  if (invoice.paid === 0n) {
    return invoice.paymentRefunded || refunded.length > 0 ? t('invoice.paper.refunded', 'قُبض ثمّ رُدّ للزبون، فالمبلغ كلّه بالدين') : t('invoice.paper.paid_none', 'لا شيء (المبلغ كلّه بالدين)');
  }
  const live = invoice.payments.filter((leg) => !leg.refunded);
  const parts = [
    ...(live.length === 0 ? [dinars(invoice.paid)] : live.map((leg) => t('invoice.paper.leg', '{amount} في «{box}»', { amount: dinars(leg.amount), box: leg.cashAccountName }))),
    ...refunded.map((leg) => t('invoice.paper.leg_refunded', 'ورُدّ {amount} من «{box}»', { amount: dinars(leg.amount), box: leg.cashAccountName })),
  ];
  return parts.join(t('list.separator', '، '));
}

/** شعار الورقة مضمَّناً (أيقونة التطبيق نفسها، public/favicon.svg): لا يُطلب من الشبكة، فتُصوَّر الفاتورة بلا اتصال (مراجعة 0033 D5). */
export const INVOICE_LOGO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b7bee"/>' +
      '<stop offset="1" stop-color="#0f5cc6"/></linearGradient><clipPath id="egg"><path d="M50 20C64 20 75 40 75 56C75 71 64 82 50 82C36 82 25 71 25 56C25 40 36 20 50 20Z"/>' +
      '</clipPath></defs><rect width="100" height="100" rx="22" fill="url(#bg)"/><path d="M50 20C64 20 75 40 75 56C75 71 64 82 50 82C36 82 25 71 25 56C25 40 36 20 50 20Z" fill="#ffffff"/>' +
      '<path d="M22 51L33 44L41 52L50 43L59 52L67 44L78 51" fill="none" stroke="#1266d8" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#egg)"/></svg>',
  );

/**
 * ورقة الفاتورة (تُطبع وتُصوَّر لواتساب، وتُعرض في صفحة الفاتورة تحت «الورقة كما تصل الزبون»): رأس المنشأة واسم الفاتورة ورقمها (لا ينكسر) ويومها، والزبون
 * (أو «زبون نقديّ») والمخزن، والسطور بإجماليّها ثمّ الخصم مرّة واحدة، و«الصافي» بارزاً بالأرقام والكلمات، والمدفوع عند البيع بصناديقه، و«الباقي» (المتبقّي
 * الآن من قيدها) و«دين عند البيع» إن اختلفا، والملاحظة والبائع، و«شكراً لتعاملكم»، وختم «ملغى» للملغاة. الأرقام من الخادم كما هي. ألوانها من الرموز وحدها
 * (لا .dark): الصورة والمعاينة بالسمة الفاتحة دائماً (doc.css و reportImage).
 */
export function InvoicePaper({ invoice, orgName, paperRef }: { invoice: SaleInvoice; orgName: string; paperRef?: Ref<HTMLElement> }) {
  const voided = invoice.status === 'void';
  const named = !invoice.walkIn && invoice.total > 0n;
  return (
    <article ref={paperRef} className="card inv-sheet" data-action="sale-paper">
      <header className="inv-head">
        <div className="inv-org">
          {/* الشعار (أيقونة التطبيق مضمَّنةً، فتدخل الصورة والطباعة ولو بلا اتصال): بنمط مضمَّن لا بصنف جديد. */}
          <img src={INVOICE_LOGO} alt="" aria-hidden="true" width={40} height={40} style={LOGO_STYLE} data-action="sale-paper-logo" />
          <p className="inv-org-name" data-action="org-name">
            {orgName}
          </p>
        </div>
        <div className="inv-title">
          <h2 className="inv-title-text" data-action="sale-paper-title">
            {t('invoice.paper.title', 'فاتورة بيع')}
          </h2>
          <p className="inv-meta" data-action="sale-paper-no">
            {t('voucher.no', 'رقم:')} <Num>{invoice.docNo}</Num>
          </p>
          <p className="inv-meta" data-action="sale-paper-date">
            {t('voucher.date', 'التاريخ:')} <Num>{fmtDay(invoice.soldOn)}</Num>
          </p>
        </div>
      </header>
      {voided ? (
        <div className="inv-stamp" role="status" data-action="void-stamp">
          <strong className="text-2xl">{t('paper.void', 'ملغى')}</strong>
          {invoice.voidReason ? <span className="text-sm">{t('invoice.paper.void_reason', 'السبب: {reason}', { reason: invoice.voidReason })}</span> : null}
        </div>
      ) : null}
      <div className="inv-parties">
        <PaperLine label={t('invoice.paper.customer', 'الزبون:')} action="sale-paper-customer">
          {invoice.walkIn ? t('invoice.walk_in', 'زبون نقديّ') : invoice.partyName}
        </PaperLine>
        <PaperLine label={t('invoice.paper.store', 'من مخزن:')} action="sale-paper-store">
          {invoice.warehouseName}
        </PaperLine>
      </div>
      <InvoiceLinesTable invoice={invoice} caption={t('sale.doc.lines', 'سطور الفاتورة {doc}', { doc: invoice.docNo })} money={!voided} />
      {voided ? null : (
        <div className="inv-sums">
          <div className="inv-due">
            <p className="inv-due-row" data-action="sale-paper-total">
              <span>{t('invoice.paper.total', 'الصافي:')}</span>
              <strong>{dinars(invoice.total)}</strong>
            </p>
            <p className="inv-words" data-action="sale-paper-words">
              {amountInWords(invoice.total)}
            </p>
          </div>
          {invoice.total === 0n ? (
            // بلا مقابل (مراجعة 0033 D6): لا «مدفوع» ولا «دين».
            <PaperLine label={t('invoice.paper.payment', 'الدفع:')} action="sale-paper-paid">
              {t('invoice.paper.free', 'تسليم بلا مقابل')}
            </PaperLine>
          ) : (
            <PaperLine label={t('saledoc.paper.paid', 'المدفوع عند البيع:')} action="sale-paper-paid">
              {paidText(invoice)}
            </PaperLine>
          )}
          {/* «دين عند البيع» حين قُبض منه شيء بعد البيع (open من قيدها، مراجعة 0033 D1): دين البيع لا يتغيّر بالقبض، و«الباقي» هو ما بقي الآن. */}
          {named && invoice.open !== invoice.debt ? (
            <PaperLine label={t('saledoc.paper.debt', 'دين عند البيع:')} action="sale-paper-debt">
              {dinars(invoice.debt)}
            </PaperLine>
          ) : null}
          {named ? (
            <div className="inv-line inv-open" data-action="sale-paper-open">
              <span className="inv-line-label">{t('saledoc.paper.open', 'الباقي:')}</span>
              <strong className="inv-line-value">{dinars(invoice.open)}</strong>
            </div>
          ) : null}
        </div>
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
      <p className="inv-thanks" data-action="sale-paper-thanks">
        {t('invoice.paper.thanks', 'شكراً لتعاملكم')}
      </p>
      <div className="inv-signs" data-action="signatures">
        {[t('invoice.sign.seller', 'البائع'), t('birds.sign.receiver', 'المستلم')].map((role) => (
          <div key={role} className="inv-sign">
            {role}
          </div>
        ))}
      </div>
    </article>
  );
}
