import { ChevronDown, Ellipsis, FileDown, HandCoins, Plus, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column, type FooterRow } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import type { Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError } from '../../lib/errors';
import { fmtCounted, fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { PartyRow } from '../../lib/repo/parties';
import { loadSaleInvoice, type InvoiceLine, type InvoicePayment, type SaleInvoice } from '../../lib/repo/sales';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { PaymentDialog } from '../accounts/shared';
import { downloadFile, reportImage, sendFile } from '../halls/reportImage';
import { printAs } from './birdParts';
import { saleTone, StatusChip, useWide } from './docKit';
import { checkoutBack, dinars, INVOICE_IMAGE_OPTIONS, INVOICE_IMAGE_WIDTH, inputMoney, invoiceImageName, invoiceTitle, InvoicePaper, lineQtyText, lineUnitLabel, newSalePath, PAPER_STYLE, priceText } from './saleParts';
import { SaleVoidDialog, voidTargetOf } from './SaleVoidDialog';

// صفحة الفاتورة (/sales/:id، عقد 0024 F8 ثمّ عقد 0033 «ب»، ثمّ تصميم المبيعات ٥ و٦ — كلمة المالك 2026-11-18: «شكل متطور سهل الاستخدام يسهل حياة المستخدم»):
// بطاقة إيصال أوّلاً (الحالة شريحةً بنصّ، والصافي كبيراً، وشريط المدفوع والباقي الآن، والزبون واليوم والمخزن)، ثمّ أفعال بارتفاع الإصبع: «أرسل على واتساب»
// الأساسيّ، و«PDF»، و«استلم» (بعلم can_collect)، و«⋯» فيها «ألغِ الفاتورة» (انتقل من صفّ القائمة: فعل نادر خطِر). والسطور في DataTable بأعمدة الهاتف
// («المادّة والكمية» في خلية و«المبلغ»، والتفصيل في الشاشة العريضة) بإجماليّها ثمّ الخصم مرّة واحدة، وسيقان الدفع جدولاً. وورقة الفاتورة (تُطبع وتُصوَّر)
// مطويّة تحت «الورقة كما تصل الزبون»، فاتحةً دائماً كما تصله.
// وبعد الحفظ (?done=1، الشاشة تحلّ محلّ «بيع جديد» في التاريخ) حالة نجاح: ✓ و«حُفظت <الرقم>» والصافي والمدفوع والباقي، وأزرار كبيرة: «أرسل على واتساب»
// و«PDF» و«بيع جديد» بالمخزن نفسه و«استلم» حين يبقى شيء.
// والصورة تُجهَّز فور تحميل الفاتورة (في وقت فراغ المتصفّح)، فاللمسة الأولى على «أرسل على واتساب» تنادي navigator.share بملفّ جاهز داخل النقرة نفسها (لا
// تُعدّ «قديمة» فلا يرفضها المتصفّح)؛ وإن لم تجهز بعدُ فالطريق القديم احتياطاً: تُجهَّز ثمّ تُشارك، وإن رُفضت المشاركة فالصورة جاهزة بـ«أرسلها».
// والكلفة والربح لأدوار الكلفة وحدها (cost.money يغيب لغيرها)، والملغاة بختمها وسببها بلا مبالغ. والرجوع إلى ?back= (الحسابات أو المبيعات أو المخزن أو
// الرئيسية) وإلّا المبيعات.

/**
 * طريق الرجوع من الرابط: الرئيسية، أو مسار في الحسابات أو المبيعات أو المخزن (الفاتورة بعد حفظها من «بِع» في ملفّ المادّة، مراجعة 0033 D9) وحده (بترميز
 * URLSearchParams: المسافة «+»)، وإلّا صفحة المبيعات.
 */
export function saleBack(value: string | null): string {
  return value !== null && /^\/(?:$|(?:accounts|sales|inventory)(?:[/?][\w\-/=&%.?+*]*)?$)/u.test(value) ? value : '/sales';
}

/**
 * الدفع بكلماته: بلا مقابل، أو رُدّ المقبوض كلّه، أو زبون نقديّ، أو مدفوعة كلّها، أو بالدين، أو جزء مدفوع والباقي دين؛ وللملغاة ما حدث لمقبوضها (مراجعة
 * 0033 D7). paymentRefunded = رُدّت ساق واحدة على الأقلّ، فـ«رُدّ» حين لا يبقى شيء مدفوعاً وحده (D3)، والمدفوع paid من السيقان التي لم تُردّ.
 */
export function salePaymentText(sale: Pick<SaleInvoice, 'status' | 'total' | 'paid' | 'debt' | 'walkIn' | 'paymentRefunded'>): string {
  if (sale.status === 'void') {
    // سيقان الزبون باسمه تبقى رصيداً له، وسيقان الزبون النقديّ تُردّ مع الإلغاء (رأس 0033).
    if (sale.paid > 0n) return t('invoice.pay.void_kept', 'ملغاة، والمقبوض باقٍ رصيداً للجهة');
    if (sale.paymentRefunded) return t('invoice.pay.void_refunded', 'ملغاة، ورُدّ المقبوض');
    return t('invoice.pay.void', 'ملغاة');
  }
  if (sale.total === 0n) return t('sales.free', 'بلا مقابل');
  if (sale.paymentRefunded && sale.paid === 0n) return t('sales.refunded', 'نقداً، ثمّ رُدّ المبلغ');
  if (sale.walkIn) return t('invoice.pay.walk_in', 'زبون نقديّ، مدفوعة كلّها');
  if (sale.debt === 0n) return t('invoice.pay.paid', 'مدفوعة كلّها');
  if (sale.paid === 0n) return t('file.payment.credit', 'بالدين');
  return t('invoice.pay.partial', 'جزء مدفوع، والباقي دين');
}

/**
 * جملة الدفع حين تزيد على الشريحة: الملغاة (ما حدث لمقبوضها)، ونقداً ثمّ رُدّ، ودين قُبض منه بعد البيع («دين عند البيع … والباقي الآن …»)؛ وإلّا null
 * (الشريحة والشريط يقولان كلّ شيء).
 */
function paymentNote(sale: SaleInvoice): string | null {
  if (sale.status === 'void') return sale.paid > 0n || sale.paymentRefunded ? salePaymentText(sale) : null;
  if (sale.total > 0n && sale.paymentRefunded && sale.paid === 0n) return salePaymentText(sale);
  if (!sale.walkIn && sale.total > 0n && sale.open !== sale.debt) {
    return t('saledoc.debt_then', 'دين عند البيع {debt}، والباقي الآن {open}.', { debt: dinars(sale.debt), open: dinars(sale.open) });
  }
  return null;
}

/** طرف الفاتورة لنافذة «قبضنا» (تقرأ المعرّف والاسم وحدهما). */
const partyOf = (sale: SaleInvoice): PartyRow => ({ id: sale.partyId, name: sale.partyName, version: 0, archived: false, phone: null, isCustomer: true, isSupplier: false });

/** المدفوع حتى الآن (عند البيع وبعده) = الصافي − الباقي الآن. */
const paidSoFar = (sale: SaleInvoice): Fils => (sale.total > sale.open ? sale.total - sale.open : 0n);

/** نسبة المدفوع من الصافي بالألف لعرض الشريط (لا تُعرض رقماً). */
const paidShare = (sale: SaleInvoice): number => (sale.total > 0n ? Number((paidSoFar(sale) * 1000n) / sale.total) / 10 : 0);

const money0 = (amount: Fils) => <Num>{fmtMoney(amount, 0)}</Num>;

/** ما يُعرض تحت اسم المادّة في خلية الهاتف: «2 كيس 50 كغم × 35,000» (والملغاة بكميتها وحدها). */
function lineSub(line: InvoiceLine, money: boolean) {
  const qty = fmtCounted(line.unitQty, lineUnitLabel(line));
  return (
    <span className="sale-line-sub">
      <span>{qty}</span>
      {money ? (
        <>
          <span aria-hidden="true"> × </span>
          <Num>{priceText(line.unitPrice)}</Num>
        </>
      ) : null}
      {money && line.lineDiscount > 0n ? (
        <span className="sale-line-off">{t('saledoc.line.off', 'خصم السطر {amount}', { amount: fmtMoney(line.lineDiscount, 0) })}</span>
      ) : null}
    </span>
  );
}

/**
 * موادّ الفاتورة في الصفحة: بالهاتف «المادّة والكمية» (الاسم وتحته الكمية × السعر) و«المبلغ»، وفي الشاشة العريضة المادّة والكمية والوحدة والسعر والمبلغ.
 * المبلغ إجماليّ السطر، فالمجموع ثمّ «الخصم» و«الصافي» في التذييل حين يوجد خصم (كالورقة). والملغاة بلا مبالغ.
 */
function PageLines({ invoice, wide }: { invoice: SaleInvoice; wide: boolean }) {
  const money = invoice.status !== 'void';
  const caption = t('saledoc.lines.caption', 'موادّ الفاتورة {doc}', { doc: invoice.docNo });
  const columns: Column<InvoiceLine>[] = wide
    ? [
        { key: 'item', header: t('sales.col.item', 'المادّة'), wrap: true, cell: (line) => line.itemName },
        { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (line) => <Num>{lineQtyText(line.unitQty)}</Num> },
        { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (line) => lineUnitLabel(line) },
      ]
    : [
        {
          key: 'item',
          header: t('saledoc.col.item_qty', 'المادّة والكمية'),
          wrap: true,
          cell: (line) => (
            <span className="sale-line">
              <span className="sale-line-name">{line.itemName}</span>
              {lineSub(line, money)}
            </span>
          ),
        },
      ];
  if (!money) {
    return (
      <div className="sale-table">
        <DataTable caption={caption} columns={columns} rows={invoice.lines} rowKey={(line) => line.lineId} empty="" />
      </div>
    );
  }
  if (wide) {
    columns.push(
      { key: 'price', header: t('sales.col.price', 'السعر'), kind: 'number', cell: (line) => <Num>{priceText(line.unitPrice)}</Num> },
      { key: 'off', header: t('saledoc.col.line_off', 'خصم السطر'), kind: 'number', cell: (line) => (line.lineDiscount > 0n ? money0(line.lineDiscount) : null) },
    );
    if (!invoice.lines.some((line) => line.lineDiscount > 0n)) columns.pop();
  }
  columns.push({ key: 'amount', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (line) => money0(line.gross), total: money0(invoice.grossTotal) });
  const footers: FooterRow[] =
    invoice.discountTotal > 0n
      ? [
          { key: 'discount', label: t('invoice.col.discount', 'الخصم'), cells: { amount: money0(-invoice.discountTotal) } },
          { key: 'net', label: t('invoice.col.net', 'الصافي'), cells: { amount: money0(invoice.total) } },
        ]
      : [];
  return (
    <div className="sale-table">
      <DataTable
        caption={caption}
        columns={columns}
        rows={invoice.lines}
        rowKey={(line) => line.lineId}
        empty=""
        totalLabel={invoice.discountTotal > 0n ? t('saledoc.gross', 'المجموع قبل الخصم') : t('sales.report.total', 'المجموع')}
        footers={footers}
      />
    </div>
  );
}

/** سيقان الدفع عند البيع: الصندوق والمبلغ، والمردودة بعلامتها (ليست من المدفوع الآن). */
function PageLegs({ invoice }: { invoice: SaleInvoice }) {
  if (invoice.payments.length === 0 || invoice.status === 'void') return null;
  const columns: Column<InvoicePayment>[] = [
    {
      key: 'box',
      header: t('saledoc.col.box', 'الصندوق'),
      wrap: true,
      cell: (leg) =>
        leg.refunded ? (
          <span data-action="leg-refunded">{t('saledoc.leg.refunded', '{box} — رُدّ للزبون', { box: leg.cashAccountName })}</span>
        ) : (
          leg.cashAccountName
        ),
    },
    { key: 'amount', header: t('sales.col.amount', 'المبلغ'), kind: 'number', cell: (leg) => money0(leg.amount) },
  ];
  return (
    <section className="sale-section" data-action="sale-legs">
      <h2 className="sale-section-title">{t('saledoc.legs.title', 'المدفوع عند البيع')}</h2>
      <div className="sale-table">
        <DataTable caption={t('saledoc.legs.caption', 'المدفوع عند البيع للفاتورة {doc}', { doc: invoice.docNo })} columns={columns} rows={invoice.payments} rowKey={(leg) => String(leg.legNo)} empty="" />
      </div>
    </section>
  );
}

/** الصافي والمدفوع حتى الآن والباقي الآن، والشريط بينهما (لغير الملغاة والتي بلا مقابل). */
function PaidBar({ invoice }: { invoice: SaleInvoice }) {
  if (invoice.status === 'void' || invoice.total === 0n) return null;
  return (
    <div className="sale-paybox" data-action="sale-paybox">
      <div className="sale-bar" role="presentation">
        <span style={{ width: `${paidShare(invoice)}%` }} />
      </div>
      <dl className="sale-split">
        <div data-part="paid">
          <dt>{t('saledoc.paid', 'المدفوع')}</dt>
          <dd data-action="sale-paid-sofar">
            <Num>{fmtMoney(paidSoFar(invoice), 0)}</Num>
          </dd>
        </div>
        <div data-part="open" data-zero={invoice.open === 0n ? '' : undefined}>
          <dt>{t('saledoc.open', 'الباقي')}</dt>
          <dd data-action="sale-open">
            <Num>{fmtMoney(invoice.open, 0)}</Num>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** «⋯»: قائمة صغيرة فيها «ألغِ الفاتورة» (تُغلق بالنقر خارجها وEsc). */
function MoreMenu({ onVoid }: { onVoid: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // التركيز على أوّل بند حين تُفتح (لوحة المفاتيح وقارئ الشاشة).
    item.current?.focus?.();
    const away = (event: Event) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="sale-more" ref={box}>
      <Button
        variant="secondary"
        className="sale-btn sale-btn-icon"
        aria-label={t('saledoc.more', 'أفعال أخرى')}
        title={t('saledoc.more', 'أفعال أخرى')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen(!open)}
        data-action="sale-more"
      >
        <Ellipsis aria-hidden="true" className="size-5" />
      </Button>
      {open ? (
        <div id={`${id}-menu`} role="menu" className="sale-menu">
          <button
            ref={item}
            type="button"
            role="menuitem"
            className="sale-menu-danger"
            onClick={() => {
              setOpen(false);
              onVoid();
            }}
            data-action="void-sale"
          >
            <Trash2 aria-hidden="true" className="size-5" />
            {t('saledoc.void', 'ألغِ الفاتورة')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function SaleDocPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const accounts = workspace ? can(workspace.role, 'accounts.view') : false;
  const mayCollect = workspace ? can(workspace.role, 'payment.post') : false;
  const orgName = workspace?.orgName ?? '';
  const load = useCallback(() => loadSaleInvoice(id), [id]);
  const state = useLoad(load, id);
  // آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (بعد «استلم» أو الإلغاء).
  const [kept, setKept] = useState<SaleInvoice | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const data = state.data ?? (kept && kept.id === id ? kept : null);
  const search = new URLSearchParams(location.search);
  const backParam = search.get('back');
  const back = saleBack(backParam);
  const backButton = <BackButton to={back} label={t('sale.doc.back', 'رجوع')} />;
  const wide = useWide();
  const paperRef = useRef<HTMLElement>(null);
  const [imaging, setImaging] = useState(false);
  // الصورة المجهَّزة مسبقاً لهذه القراءة نفسها (قراءة جديدة بعد «استلم» تغيّر الورقة فتُجهَّز من جديد).
  const [prepared, setPrepared] = useState<{ of: SaleInvoice; file: File } | null>(null);
  // لأيّ قراءة جُهّزت الصورة (أو تُجهَّز الآن بلمسة): لا يُعاد تجهيزها في وقت الفراغ.
  const preparedFor = useRef<SaleInvoice | null>(null);
  const [ready, setReady] = useState<{ docNo: string; file: File; title: string } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voided, setVoided] = useState<string | null>(null);
  const [paperOpen, setPaperOpen] = useState(false);

  // تجهيز الصورة فور التحميل في وقت فراغ المتصفّح (لا يثقل أوّل رسم): الخطوط أوّلاً، ثمّ نسخة الورقة بعرض ثابت وبالسمة الفاتحة.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const run = () => {
      const paper = paperRef.current;
      if (cancelled || !paper || preparedFor.current === data) return;
      preparedFor.current = data;
      const fonts = typeof document !== 'undefined' && 'fonts' in document ? document.fonts.ready : Promise.resolve();
      fonts
        .then(() => (cancelled ? null : reportImage(paper, invoiceImageName(data.docNo), INVOICE_IMAGE_WIDTH, INVOICE_IMAGE_OPTIONS)))
        .then(
          (file) => {
            if (file && !cancelled) setPrepared({ of: data, file });
            else if (preparedFor.current === data) preparedFor.current = null;
          },
          () => {
            preparedFor.current = null;
            // swallow-ok: التجهيز المسبق تحسين؛ تعذّره يُبقي الطريق القديم (تُجهَّز عند اللمس ويُقال إن تعذّرت).
          },
        );
    };
    // سفاري بلا requestIdleCallback: مهلة قصيرة بعد الرسم.
    const idle = typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function';
    const handle = idle ? window.requestIdleCallback(run, { timeout: 1200 }) : setTimeout(run, 250);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, [data]);

  if (state.error instanceof NotConnectedError && !data) {
    const { title, detail } = describeError(state.error);
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        {state.error ? (
          <LoadFailed what={t('sale.doc.what', 'فاتورة البيع')} error={state.error} onRetry={state.retry} />
        ) : (
          <p role="status" className="py-6 text-center text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )}
      </div>
    );
  }

  const isVoid = data.status === 'void';
  const done = search.get('done') === '1' && !isVoid;
  const title = invoiceTitle(data.docNo);
  const tone = saleTone(data);
  // «استلم» بقول الخادم (can_collect: محفوظة، باسم، متبقٍّ من قيدها، ودور يقبض في نطاق دفترها) والمبلغ المتبقّي الآن (open) لا دين البيع: القبض
  // اللاحق لا يغيّر دين البيع (مراجعة 0033 D1).
  const canCollect = mayCollect && data.canCollect && !isVoid && !data.walkIn;
  const canVoid = data.canVoid && !isVoid;
  const note = paymentNote(data);
  // «بيع جديد» بالمخزن نفسه، ورجوعه حيث بدأ البيع إن كان طريقاً تقبله الفاتورة الجديدة.
  const nextSale = newSalePath({ store: data.warehouseId, ...(backParam !== null && checkoutBack(backParam) === backParam ? { back: backParam } : {}) });

  const deliver = async (file: File, imageTitle: string, docNo: string) => {
    const outcome = await sendFile(file, imageTitle);
    setReady(outcome === 'blocked' ? { docNo, file, title: imageTitle } : null);
    if (outcome === 'downloaded') {
      toast({ tone: 'success', title: t('invoice.image.downloaded', 'حُفظت صورة الفاتورة «{name}» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى الزبون.', { name: file.name }) });
    }
  };
  const renderAndSend = async () => {
    const paper = paperRef.current;
    if (!paper || imaging) return;
    const docNo = data.docNo;
    preparedFor.current = data;
    setImaging(true);
    setReady(null);
    let file: File;
    try {
      // فاتحةً ولو كان الجهاز بالسمة الداكنة: الصورة للزبون (مراجعة 0033 D2).
      file = await reportImage(paper, invoiceImageName(docNo), INVOICE_IMAGE_WIDTH, INVOICE_IMAGE_OPTIONS);
    } catch {
      preparedFor.current = null;
      setImaging(false);
      toast({ tone: 'danger', title: t('invoice.image.failed', 'تعذّر تجهيز صورة الفاتورة على هذا الجهاز. اطبعها أو احفظها PDF بدلاً من ذلك.') });
      return;
    }
    setImaging(false);
    setPrepared({ of: data, file });
    await deliver(file, title, docNo);
  };
  // الصورة الجاهزة تُشارك داخل النقرة نفسها (sendFile ينادي share قبل أيّ انتظار)؛ وإلّا تُجهَّز الآن.
  const send = () => {
    if (prepared && prepared.of === data) {
      setReady(null);
      void deliver(prepared.file, title, data.docNo);
      return;
    }
    void renderAndSend();
  };
  const readyNow = ready !== null && ready.docNo === data.docNo ? ready : null;

  const sendButton = (
    <Button variant={isVoid ? 'secondary' : 'primary'} className={`sale-btn sale-send ${done ? 'sale-btn-xl' : ''}`} size="lg" busy={imaging} onClick={send} icon={<Send aria-hidden="true" className="size-5" />} data-action="send-image">
      {imaging ? t('invoice.image.making', 'جارٍ تجهيز الصورة…') : t('saledoc.send', 'أرسل على واتساب')}
    </Button>
  );
  const printButton = (
    <Button variant="secondary" className="sale-btn" onClick={() => printAs(title)} icon={<FileDown aria-hidden="true" className="size-5" />} data-action="print-sale" title={t('invoice.print', 'اطبع أو احفظ PDF')}>
      {t('saledoc.pdf', 'PDF')}
    </Button>
  );
  const collectButton = canCollect ? (
    <Button variant="secondary" className="sale-btn" onClick={() => setCollecting(true)} icon={<HandCoins aria-hidden="true" className="size-5" />} data-action="collect-sale">
      {t('saledoc.collect', 'استلم')}
    </Button>
  ) : null;
  const moreMenu = canVoid ? <MoreMenu onVoid={() => setVoiding(true)} /> : null;

  return (
    <div className="sale-ui flex flex-col gap-4" data-action="sale-page">
      <style>{PAPER_STYLE}</style>
      <div className="print:hidden">{backButton}</div>
      {voided ? (
        <div className="print:hidden" data-action="sale-voided-note">
          <Notice tone="info" title={voided} />
        </div>
      ) : null}
      {done ? (
        <section className="card sale-done print:hidden" aria-labelledby={`${data.id}-done`} data-action="sale-done">
          {moreMenu}
          <span className="sale-done-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h1 id={`${data.id}-done`} className="sale-done-title" data-action="sale-done-title">
            {t('saledoc.done.saved', 'حُفظت')} <bdi dir="ltr">{data.docNo}</bdi>
          </h1>
          <p className="sale-done-who">
            {data.walkIn ? t('invoice.walk_in', 'زبون نقديّ') : data.partyName}
            {' · '}
            <Num>{fmtDay(data.soldOn)}</Num>
          </p>
          <dl className="sale-done-sums">
            <div>
              <dt>{t('saledoc.net', 'الصافي')}</dt>
              <dd data-action="done-net">
                <Num>{fmtMoney(data.total, 0)}</Num>
              </dd>
            </div>
            <div>
              <dt>{t('saledoc.paid', 'المدفوع')}</dt>
              <dd data-action="done-paid">
                <Num>{fmtMoney(paidSoFar(data), 0)}</Num>
              </dd>
            </div>
            <div data-part="open" data-zero={data.open === 0n ? '' : undefined}>
              <dt>{t('saledoc.open', 'الباقي')}</dt>
              <dd data-action="done-open">
                <Num>{fmtMoney(data.open, 0)}</Num>
              </dd>
            </div>
          </dl>
          <div className="sale-done-actions">
            {sendButton}
            <div className="sale-done-row">
              {printButton}
              {collectButton}
            </div>
            <Link to={nextSale} className="sale-linkbtn" data-action="sale-next">
              <Plus aria-hidden="true" className="size-5" />
              {t('sales.new', 'بيع جديد')}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <h1 className="sale-doc-title print:hidden" data-action="sale-title">
            {t('invoice.paper.title', 'فاتورة بيع')} <bdi dir="ltr">{data.docNo}</bdi>
          </h1>
          <section className="card sale-receipt print:hidden" data-action="sale-head">
            <div className="sale-receipt-top">
              <div className="min-w-0">
                <p className="sale-who" data-action="sale-party">
                  {data.walkIn ? (
                    t('invoice.walk_in', 'زبون نقديّ')
                  ) : accounts ? (
                    <Link to={`/accounts/parties/${data.partyId}`} className="sale-who-link">
                      {data.partyName}
                    </Link>
                  ) : (
                    data.partyName
                  )}
                </p>
                <p className="sale-meta">
                  <Num>{fmtDay(data.soldOn)}</Num>
                  <span aria-hidden="true">·</span>
                  <span data-action="sale-store">{data.warehouseName}</span>
                </p>
              </div>
              <StatusChip tone={tone} />
            </div>
            <p className={`sale-net ${isVoid ? 'sale-net-void' : ''}`} data-action="sale-net">
              <Num>{fmtMoney(data.total, 0)}</Num>
              <span className="sale-net-unit">{t('saledoc.dinar', 'دينار')}</span>
            </p>
            <PaidBar invoice={data} />
            {note ? (
              <p className="sale-note" data-action="sale-payment">
                {note}
              </p>
            ) : null}
            {data.cost && !isVoid ? (
              <dl className="sale-cost" data-action="sale-cost">
                <div>
                  <dt>{t('sales.stat.cost', 'كلفة المبيع')}</dt>
                  <dd>{dinars(data.cost.cost)}</dd>
                </div>
                <div>
                  <dt>{t('sales.stat.profit', 'الربح')}</dt>
                  <dd>{dinars(data.cost.profit)}</dd>
                </div>
              </dl>
            ) : null}
          </section>
          {isVoid ? (
            <div className="print:hidden">
              <Notice tone="warning" title={t('sale.doc.void.title', 'أُلغيت هذه الفاتورة')}>
                <span className="flex flex-col gap-1" data-action="sale-void">
                  {data.voidReason ? <span>{t('sale.doc.void.reason', 'السبب: {reason}', { reason: data.voidReason })}</span> : null}
                  <span>{t('sale.doc.void.money', 'لا يُحتسب مبلغها ولا ربحها، ولا دين بها على الجهة.')}</span>
                </span>
              </Notice>
            </div>
          ) : null}
          <div className="sale-actions print:hidden" data-action="sale-actions">
            {sendButton}
            {printButton}
            {collectButton}
            {moreMenu}
          </div>
        </>
      )}
      {readyNow ? (
        <div className="print:hidden" data-action="image-ready">
          <Notice
            tone="info"
            title={t('invoice.image.ready', 'الصورة جاهزة: اضغط «أرسلها» لتختار التطبيق والزبون.')}
            action={
              <div className="flex flex-wrap gap-2">
                <Button className="sale-btn" onClick={() => void deliver(readyNow.file, readyNow.title, readyNow.docNo)} data-action="send-ready">
                  {t('halls.day.image.send', 'أرسلها')}
                </Button>
                <Button
                  variant="secondary"
                  className="sale-btn"
                  onClick={() => {
                    downloadFile(readyNow.file);
                    setReady(null);
                    toast({ tone: 'success', title: t('invoice.image.downloaded', 'حُفظت صورة الفاتورة «{name}» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى الزبون.', { name: readyNow.file.name }) });
                  }}
                  data-action="download-ready"
                >
                  {t('invoice.image.download', 'نزّلها')}
                </Button>
              </div>
            }
          />
        </div>
      ) : null}
      {canCollect && !done ? (
        <p className="sale-hint print:hidden" data-action="collect-note">
          {/* المبلغ في البطاقة فوقها («الباقي»)، وهنا ما يفعله «استلم» وحده. */}
          {t('saledoc.collect.note', '«استلم» يسجّل قبضاً على حساب «{party}» يُسدِّد أقدم ديونه أوّلاً، والمعاينة قبل الحفظ تسمّي ما يُسدَّد.', { party: data.partyName })}
        </p>
      ) : null}
      <section className="sale-section print:hidden" data-action="sale-lines">
        <h2 className="sale-section-title">{t('saledoc.lines.title', 'الموادّ')}</h2>
        <PageLines invoice={data} wide={wide} />
      </section>
      <div className="print:hidden">
        <PageLegs invoice={data} />
      </div>
      {data.note !== null || data.postedByName !== null ? (
        <p className="sale-hint print:hidden" data-action="sale-by">
          {[data.note !== null ? t('invoice.paper.note', 'ملاحظة: {note}', { note: data.note }) : null, data.postedByName !== null ? t('invoice.paper.seller', 'البائع: {name}', { name: data.postedByName }) : null]
            .filter((part): part is string => part !== null)
            .join(t('saledoc.sep', ' · '))}
        </p>
      ) : null}
      <button type="button" className="sale-disclosure print:hidden" aria-expanded={paperOpen} onClick={() => setPaperOpen(!paperOpen)} data-action="toggle-paper">
        <span>{paperOpen ? t('saledoc.paper.hide', 'أخفِ الورقة') : t('saledoc.paper.show', 'الورقة كما تصل الزبون')}</span>
        <ChevronDown aria-hidden="true" className="size-5 sale-disclosure-icon" />
      </button>
      <div className="sale-paper-slot" data-open={paperOpen ? '' : undefined}>
        <InvoicePaper invoice={data} orgName={orgName} paperRef={paperRef} />
      </div>
      {collecting ? (
        <PaymentDialog
          kind="payment"
          party={partyOf(data)}
          bookId={data.bookId}
          amount={inputMoney(data.open)}
          onClose={() => setCollecting(false)}
          onPosted={() => {
            setCollecting(false);
            state.retry();
          }}
        />
      ) : null}
      {voiding ? (
        <SaleVoidDialog
          target={voidTargetOf(data)}
          onCancel={() => setVoiding(false)}
          onDone={(text) => {
            setVoiding(false);
            setVoided(text);
            state.retry();
          }}
        />
      ) : null}
    </div>
  );
}
