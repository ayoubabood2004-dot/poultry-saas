import { ChevronDown, Ellipsis, FileDown, HandCoins, Plus, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { readFlag, saleTone, StatusChip, useWide, writeFlag } from './docKit';
import { checkoutBack, dinars, INVOICE_IMAGE_OPTIONS, INVOICE_IMAGE_WIDTH, inputMoney, invoiceImageName, invoiceTitle, InvoicePaper, lineQtyText, lineUnitLabel, newSalePath, PAPER_STYLE, priceText } from './saleParts';
import { readVoidPending, SaleVoidDialog, storeVoidPending, voidPendingKey, voidTargetOf } from './SaleVoidDialog';

// صفحة الفاتورة (/sales/:id، عقد 0024 F8 ثمّ عقد 0033 «ب»، ثمّ تصميم المبيعات ٥ و٦ — كلمة المالك 2026-11-18: «شكل متطور سهل الاستخدام يسهل حياة المستخدم»):
// بطاقة إيصال أوّلاً (الحالة شريحةً بنصّ، والصافي كبيراً، وشريط المدفوع والباقي الآن، والزبون واليوم والمخزن، والربح مطويّاً: الهاتف كثيراً ما يواجه الزبون)،
// ثمّ أفعال بارتفاع الإصبع: «أرسل على واتساب» الأساسيّ، و«ملفّ PDF»، و«استلم دفعة» (بعلم can_collect)، و«⋯» فيها «ألغِ الفاتورة». والسطور في DataTable
// بأعمدة الهاتف بإجماليّها ثمّ الخصم مرّة واحدة، وسيقان الدفع جدولاً. وورقة الفاتورة (تُطبع وتُصوَّر) مطويّة تحت «الورقة كما تصل الزبون»، فاتحةً دائماً.
// وبعد الحفظ (?done=1) حالة نجاح تُعلَن لقارئ الشاشة (التركيز على «حُفظت» ومنطقة حيّة)، والرابط يُنظَّف منها بعد أوّل رسم فلا تعود بإعادة التحميل ولا
// بالرجوع ولا برابط منسوخ (مراجعة A9).
// والصورة تُجهَّز فور التحميل في وقت الفراغ، فاللمسة الأولى تنادي navigator.share داخل النقرة بملفّ جاهز؛ ولمسة ثانية والمشاركة مفتوحة لا تفعل شيئاً (A8).
// والصورة الجاهزة و«أرسلها» مربوطتان بالقراءة التي صُنعتا منها: بعد إلغاء أو قبض لا تُرسل صورة قديمة، والأفعال معطّلة حتى تصل قراءة جديدة، وفشلها يُقال
// بـ«أعد القراءة» (مراجعة A2). و«قديمة» بأرقام القراءات لا بهويّة الكائن: قراءة بدأت قبل أن تتمّ الكتابة قديمةٌ ولو وصلت بعدها (مراجعة Q3).

/**
 * طريق الرجوع من الرابط: الرئيسية، أو مسار في الحسابات أو المبيعات أو المخزن (الفاتورة بعد حفظها من «بِع» في ملفّ المادّة، مراجعة 0033 D9) وحده (بترميز
 * URLSearchParams: المسافة «+»)، وإلّا صفحة المبيعات.
 */
export function saleBack(value: string | null): string {
  return value !== null && /^\/(?:$|(?:accounts|sales|inventory)(?:[/?][\w\-/=&%.?+*]*)?$)/u.test(value) ? value : '/sales';
}

/**
 * الدفع بكلماته: بلا مقابل، أو رُدّ المقبوض كلّه، أو زبون نقديّ، أو مدفوعة كلّها، أو بالدين، أو جزء مدفوع والباقي دين؛ وللملغاة ما حدث لمقبوضها (مراجعة
 * 0033 D7 وA3: ما دُفع لملغاة يُحسب للزبون فيُسدَّد به أقدم ما عليه). paymentRefunded = رُدّت ساق واحدة على الأقلّ، فـ«رُدّ» حين لا يبقى شيء مدفوعاً وحده.
 */
export function salePaymentText(sale: Pick<SaleInvoice, 'status' | 'total' | 'paid' | 'debt' | 'walkIn' | 'paymentRefunded'>): string {
  if (sale.status === 'void') {
    if (sale.paid > 0n) return t('saledoc.pay.void_credited', 'ملغاة، وما دُفع لها حُسب للزبون');
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

/** لماذا لا تُلغى (void_block) لمن يُلغي عادةً ولا يرى «⋯» (مراجعة A11)؛ الدور والملغاة بلا جملة. */
function voidBlockText(block: string | null): string | null {
  if (block === 'out_of_scope') return t('saledoc.void_block.scope', 'لا تُلغى هذه الفاتورة من حسابك: مخزنها أو دفترها خارج نطاقك.');
  if (block === 'period_locked') return t('saledoc.void_block.locked', 'لا تُلغى هذه الفاتورة الآن: الفترة مقفلة، ويفتحها مالك المنشأة.');
  return null;
}

/** طرف الفاتورة لنافذة «قبضنا» (تقرأ المعرّف والاسم وحدهما). */
const partyOf = (sale: SaleInvoice): PartyRow => ({ id: sale.partyId, name: sale.partyName, version: 0, archived: false, phone: null, isCustomer: true, isSupplier: false });

/** المدفوع حتى الآن (عند البيع وبعده) = الصافي − الباقي الآن. */
const paidSoFar = (sale: SaleInvoice): Fils => (sale.total > sale.open ? sale.total - sale.open : 0n);

/** نسبة المدفوع من الصافي بالألف لعرض الشريط (لا تُعرض رقماً). */
const paidShare = (sale: SaleInvoice): number => (sale.total > 0n ? Number((paidSoFar(sale) * 1000n) / sale.total) / 10 : 0);

const money0 = (amount: Fils) => <Num>{fmtMoney(amount, 0)}</Num>;

/** فاصل «·» ملتصق بما بعده (مسافة لا تنكسر)، فلا يبقى وحده آخر السطر (مراجعة Q12). */
const SEP = ' \u{B7}\u{A0}';

/** مفاتيح ما يتذكّره الجهاز لكلّ مستخدم: «الربح» مفتوحاً، وشرح «استلم دفعة» قُرئ مرّة. */
const profitKey = (userId: string): string => `sales.profit.open:${userId}`;
const collectNoteKey = (userId: string): string => `sales.collect.note.seen:${userId}`;

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
function PageLines({ invoice, wide, voided }: { invoice: SaleInvoice; wide: boolean; voided: boolean }) {
  const money = !voided;
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

/** سيقان الدفع عند البيع في التطبيق (بأسماء الصناديق؛ والورقة للزبون بالمبلغ وحده، مراجعة D24): الصندوق والمبلغ، والمردودة بعلامتها. */
function PageLegs({ invoice }: { invoice: SaleInvoice }) {
  if (invoice.payments.length === 0) return null;
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

/** الصافي والمدفوع حتى الآن والباقي الآن، والشريط بينهما؛ و«مدفوعة كلّها» مكان «الباقي 0» («الباقي» للدين القائم وحده، D8). */
function PaidBar({ invoice }: { invoice: SaleInvoice }) {
  if (invoice.total === 0n) return null;
  const settled = invoice.open === 0n;
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
        {settled ? (
          <div data-part="settled">
            <dt>{t('saledoc.state', 'الحالة')}</dt>
            <dd data-action="sale-paid-all">{t('invoice.pay.paid', 'مدفوعة كلّها')}</dd>
          </div>
        ) : (
          <div data-part="open">
            <dt>{t('saledoc.open', 'الباقي')}</dt>
            <dd data-action="sale-open">
              <Num>{fmtMoney(invoice.open, 0)}</Num>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** «⋯»: قائمة صغيرة فيها «ألغِ الفاتورة» (تُغلق بالنقر خارجها وEsc، وEsc يعيد التركيز إلى «⋯»؛ ومرجع «⋯» من الصفحة لتعيد إليه التركيز بعد النافذة). */
function MoreMenu({ onVoid, trigger }: { onVoid: () => void; trigger: RefObject<HTMLButtonElement> }) {
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
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus?.();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, trigger]);
  return (
    <div className="sale-more" ref={box}>
      <Button
        ref={trigger}
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

/** كتابة تمّت: آخر قراءة بدأت قبل تمامها (after)، ونوعها. كلّ قراءة رقمها حتى after قديمة بعدها. */
interface Written {
  after: number;
  kind: 'void' | 'collect';
}

/** الفاتورة ورقم القراءة التي جاءت بها (برقم بدئها). */
interface Read {
  sale: SaleInvoice;
  n: number;
}

export default function SaleDocPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const accounts = workspace ? can(workspace.role, 'accounts.view') : false;
  const mayCollect = workspace ? can(workspace.role, 'payment.post') : false;
  const maySell = workspace ? can(workspace.role, 'sale.record') : false;
  const mayVoid = workspace ? can(workspace.role, 'void') : false;
  const userId = workspace?.userId ?? '';
  const orgName = workspace?.orgName ?? '';
  // كلّ قراءة برقم بدئها (مراجعة Q3): بعد كتابة لا تُعرض فاتورة قراءةٍ بدأت قبل تمامها كأنّها جديدة.
  const reads = useRef(0);
  const load = useCallback((): Promise<Read> => {
    reads.current += 1;
    const n = reads.current;
    return loadSaleInvoice(id).then((sale) => ({ sale, n }));
  }, [id]);
  const state = useLoad(load, id);
  // آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (بعد «استلم دفعة» أو الإلغاء).
  const [kept, setKept] = useState<Read | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const shown = state.data ?? (kept && kept.sale.id === id ? kept : null);
  const data = shown?.sale ?? null;
  const search = new URLSearchParams(location.search);
  const backParam = search.get('back');
  const back = saleBack(backParam);
  const backButton = <BackButton to={back} label={t('sale.doc.back', 'رجوع')} />;
  const wide = useWide();
  const paperRef = useRef<HTMLElement>(null);
  const doneTitle = useRef<HTMLHeadingElement>(null);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  // بعد إغلاق نافذة (الإلغاء أو «استلم دفعة») يعود التركيز إلى «⋯» أو العنوان: ما فتحها قد يكون زال (مراجعة Q7).
  const [refocus, setRefocus] = useState(0);
  const [imaging, setImaging] = useState(false);
  // مشاركة مفتوحة الآن: لمسة ثانية لا تفتح أخرى ولا تنزّل الصورة (InvalidStateError، مراجعة A8). المرجع للّمستين في الحدث نفسه، والحالة للزرّ.
  const sharingNow = useRef(false);
  const [sharing, setSharing] = useState(false);
  // الصورة المجهَّزة مسبقاً و«أرسلها» لهذه القراءة نفسها (of): قراءة جديدة بعد «استلم دفعة» أو الإلغاء تغيّر الورقة فلا تُرسل القديمة.
  const [prepared, setPrepared] = useState<{ of: SaleInvoice; file: File } | null>(null);
  const preparedFor = useRef<SaleInvoice | null>(null);
  const [ready, setReady] = useState<{ of: SaleInvoice; file: File; title: string } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voided, setVoided] = useState<string | null>(null);
  const [written, setWritten] = useState<Written | null>(null);
  const [paperOpen, setPaperOpen] = useState(false);
  const [profitOpen, setProfitOpen] = useState(() => userId !== '' && readFlag(profitKey(userId)));
  // شرح «استلم دفعة» يُعرض أوّل مرّة وحده (مراجعة D22).
  const [noteSeen] = useState(() => userId !== '' && readFlag(collectNoteKey(userId)));
  const pendingKey = workspace ? voidPendingKey(workspace.userId, workspace.orgId, id) : '';
  const pendingVoid = readVoidPending(pendingKey);

  // لم تصل قراءة بدأت بعد الكتابة: الفاتورة المعروضة قديمة.
  const stale = shown !== null && written !== null && shown.n <= written.after;
  const isVoid = data !== null && (data.status === 'void' || (stale && written?.kind === 'void'));
  const done = data !== null && search.get('done') === '1' && !isVoid;
  const canCollect = data !== null && mayCollect && data.canCollect && !isVoid && !data.walkIn && !stale;
  const showCollectNote = canCollect && !done && !noteSeen;

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

  // حالة النجاح لهذه الزيارة وحدها: «حُفظت» تُعلَن (التركيز عليها، A6)، و?done=1 يُمحى من سجلّ المتصفّح نفسه بلا انتقال (الموجّه يبقى بحالته فتبقى
  // البطاقة على الشاشة)، فلا تعود بإعادة التحميل ولا بالرجوع والتقدّم ولا برابط منسوخ (A9).
  useEffect(() => {
    if (!done) return;
    doneTitle.current?.focus?.({ preventScroll: true });
    const history = typeof window !== 'undefined' ? window.history : undefined;
    const here = typeof window !== 'undefined' ? window.location : undefined;
    if (!history || typeof history.replaceState !== 'function' || !here || typeof here.search !== 'string') return;
    const params = new URLSearchParams(here.search);
    if (params.get('done') !== '1') return;
    params.delete('done');
    const query = params.toString();
    history.replaceState(history.state, '', `${here.pathname}${query ? `?${query}` : ''}${here.hash ?? ''}`);
  }, [done]);

  // بطاقة النجاح زالت (أُلغيت الفاتورة منها، أو فُتحت ملغاةً): ?done=1 يُمحى من الموجّه أيضاً، فالرابط وحالة الصفحة سواء ويعود الشريط السفليّ الذي يغيب
  // في حالة النجاح (مراجعة D7 ثمّ Q4). بالموجّه هنا لا في الشريط: حزمته في التثبيت المسبق، وهذه الصفحة خارجه.
  const doneGone = data !== null && search.get('done') === '1' && isVoid;
  useEffect(() => {
    if (!doneGone) return;
    const params = new URLSearchParams(location.search);
    params.delete('done');
    const query = params.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : '', hash: location.hash }, { replace: true });
  }, [doneGone, location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    if (refocus === 0) return;
    // ما فتح النافذة باقٍ والتركيز عاد إليه: لا شيء؛ وإلّا فـ«⋯» أو العنوان، لا جسم الصفحة.
    const active = document.activeElement;
    if (active && active !== document.body && document.body.contains(active)) return;
    (moreTrigger.current ?? doneTitle.current ?? pageTitle.current)?.focus?.({ preventScroll: true });
  }, [refocus]);

  // شرح «استلم دفعة» عُرض: لا يُعرض ثانيةً على هذا الجهاز.
  useEffect(() => {
    if (showCollectNote && userId !== '') writeFlag(collectNoteKey(userId), true);
  }, [showCollectNote, userId]);

  // إلغاء معلَّق والفاتورة صارت ملغاة: أُلغيت فعلاً، فلا شيء يُعاد.
  useEffect(() => {
    if (data?.status === 'void' && pendingVoid) storeVoidPending(pendingKey, null);
  }, [data, pendingVoid, pendingKey]);

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

  const title = invoiceTitle(data.docNo);
  const tone = saleTone({ status: isVoid ? 'void' : data.status, total: data.total, open: data.open });
  const canVoid = data.canVoid && !isVoid && !stale;
  const blockText = !data.canVoid && !isVoid && mayVoid ? voidBlockText(data.voidBlock) : null;
  const note = isVoid && data.status !== 'void' ? null : paymentNote(data);
  // «بيع جديد» بالمخزن نفسه لمن يبيع، ورجوعه حيث بدأ البيع إن كان طريقاً تقبله الفاتورة الجديدة.
  const nextSale = maySell ? newSalePath({ store: data.warehouseId, ...(backParam !== null && checkoutBack(backParam) === backParam ? { back: backParam } : {}) }) : null;
  // الزبون النقديّ بلا جهة اتصال يُرسل إليها: الخطوة التالية «بيع جديد» (D7).
  const nextFirst = done && data.walkIn && nextSale !== null;

  const deliver = async (file: File, imageTitle: string, of: SaleInvoice) => {
    sharingNow.current = true;
    setSharing(true);
    try {
      const outcome = await sendFile(file, imageTitle);
      setReady(outcome === 'blocked' ? { of, file, title: imageTitle } : null);
      if (outcome === 'downloaded') {
        toast({ tone: 'success', title: t('invoice.image.downloaded', 'حُفظت صورة الفاتورة «{name}» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى الزبون.', { name: file.name }) });
      }
    } finally {
      sharingNow.current = false;
      setSharing(false);
    }
  };
  const renderAndSend = async () => {
    const paper = paperRef.current;
    if (!paper || imaging) return;
    const of = data;
    preparedFor.current = of;
    setImaging(true);
    setReady(null);
    let file: File;
    try {
      // فاتحةً ولو كان الجهاز بالسمة الداكنة: الصورة للزبون (مراجعة 0033 D2).
      file = await reportImage(paper, invoiceImageName(of.docNo), INVOICE_IMAGE_WIDTH, INVOICE_IMAGE_OPTIONS);
    } catch {
      preparedFor.current = null;
      setImaging(false);
      toast({ tone: 'danger', title: t('invoice.image.failed', 'تعذّر تجهيز صورة الفاتورة على هذا الجهاز. اطبعها أو احفظها PDF بدلاً من ذلك.') });
      return;
    }
    setImaging(false);
    setPrepared({ of, file });
    await deliver(file, title, of);
  };
  // الصورة الجاهزة تُشارك داخل النقرة نفسها (sendFile ينادي share قبل أيّ انتظار)؛ وإلّا تُجهَّز الآن. ومشاركة مفتوحة أو فاتورة قديمة: لا شيء.
  const send = () => {
    if (sharingNow.current || stale) return;
    if (prepared && prepared.of === data) {
      setReady(null);
      void deliver(prepared.file, title, data);
      return;
    }
    void renderAndSend();
  };
  const readyNow = ready !== null && ready.of === data && !stale ? ready : null;
  // بعد كتابة (إلغاء أو قبض): الصورة القديمة لا تُرسل، والقراءة الجديدة تُنتظر (A2). «قديمة» = كلّ قراءة بدأت حتى الآن، لا الفاتورة المعروضة
  // حين فُتحت النافذة (قراءة وصلت أثناء الطلب ليست بعده، Q3).
  const afterWrite = (kind: Written['kind']) => {
    setWritten({ after: reads.current, kind });
    setReady(null);
    setPrepared(null);
    preparedFor.current = null;
    state.retry();
  };

  const sendButton = (
    <Button
      variant={isVoid || nextFirst ? 'secondary' : 'primary'}
      className={`sale-btn sale-send ${done && !nextFirst ? 'sale-btn-xl' : ''}`}
      size="lg"
      busy={imaging || sharing}
      disabled={stale}
      onClick={send}
      icon={<Send aria-hidden="true" className="size-5" />}
      data-action="send-image"
    >
      {imaging ? t('invoice.image.making', 'جارٍ تجهيز الصورة…') : t('saledoc.send', 'أرسل على واتساب')}
    </Button>
  );
  const printButton = (
    <Button variant="secondary" className="sale-btn" disabled={stale} onClick={() => printAs(title)} icon={<FileDown aria-hidden="true" className="size-5" />} data-action="print-sale" title={t('invoice.print', 'اطبع أو احفظ PDF')}>
      {t('saledoc.pdf', 'ملفّ PDF')}
    </Button>
  );
  const collectButton = canCollect ? (
    <Button variant="secondary" className="sale-btn" onClick={() => setCollecting(true)} icon={<HandCoins aria-hidden="true" className="size-5" />} data-action="collect-sale">
      {t('saledoc.collect', 'استلم دفعة')}
    </Button>
  ) : null;
  const moreMenu = canVoid || (pendingVoid && !isVoid) ? <MoreMenu onVoid={() => setVoiding(true)} trigger={moreTrigger} /> : null;
  // قراءة قديمة بشارة بنصّ كامل التباين لا بالخفوت (مراجعة Q8).
  const staleBadge = stale ? (
    <span className="sale-stale-badge" data-action="stale-badge">
      {t('saledoc.stale.badge', 'قبل التعديل')}
    </span>
  ) : null;
  const nextLink = nextSale ? (
    <Link to={nextSale} className="sale-linkbtn" data-primary={nextFirst ? '' : undefined} data-action="sale-next">
      <Plus aria-hidden="true" className="size-5" />
      {t('sales.new', 'بيع جديد')}
    </Link>
  ) : null;

  return (
    <div className="sale-ui flex flex-col gap-4" data-action="sale-page">
      <style>{PAPER_STYLE}</style>
      <div className="print:hidden">{backButton}</div>
      {voided ? (
        <div className="print:hidden" data-action="sale-voided-note">
          <Notice tone="info" title={voided} />
        </div>
      ) : null}
      {stale ? (
        <div className="print:hidden" data-action="sale-stale">
          {state.error ? (
            <Notice
              tone="warning"
              title={t('saledoc.stale.failed', 'قد لا تكون الفاتورة محدّثة — أعد القراءة.')}
              action={
                <Button size="sm" variant="secondary" className="sale-btn" onClick={state.retry} data-action="sale-reread">
                  {t('saledoc.stale.retry', 'أعد القراءة')}
                </Button>
              }
            >
              {t('saledoc.stale.why', 'حُفظ التعديل، ولم تُقرأ الفاتورة بعده؛ الإرسال والطباعة بعد أن تُقرأ.')}
            </Notice>
          ) : (
            <p role="status" className="sale-hint">
              {t('saledoc.stale.loading', 'جارٍ قراءة الفاتورة بعد التعديل…')}
            </p>
          )}
        </div>
      ) : null}
      {pendingVoid && !isVoid && !voiding ? (
        <div className="print:hidden" data-action="void-pending-banner">
          <Notice
            tone="warning"
            title={t('saledoc.void_pending', 'لم يُعرف إن أُلغيت هذه الفاتورة — أعد المحاولة؛ لن تُلغى مرّتين.')}
            action={
              <Button size="sm" variant="secondary" className="sale-btn" onClick={() => setVoiding(true)} data-action="void-pending-retry">
                {t('purchase.retry', 'أعد المحاولة')}
              </Button>
            }
          />
        </div>
      ) : null}
      {done ? (
        <section className="card sale-done print:hidden" aria-labelledby={`${data.id}-done`} data-action="sale-done" data-stale={stale ? '' : undefined}>
          {moreMenu}
          <div className="sale-done-head" role="status">
            <span className="sale-done-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 ref={doneTitle} tabIndex={-1} id={`${data.id}-done`} className="sale-done-title" data-action="sale-done-title">
              {t('saledoc.done.saved', 'حُفظت')} <bdi dir="ltr">{data.docNo}</bdi>
            </h1>
          </div>
          <p className="sale-done-who">
            {data.walkIn ? t('invoice.walk_in', 'زبون نقديّ') : data.partyName}
            {/* الفاصل مع ما بعده لا آخر السطر (مراجعة Q12). */}
            {SEP}
            <Num>{fmtDay(data.soldOn)}</Num>
          </p>
          {staleBadge}
          <dl className="sale-done-sums" data-cells={data.open === 0n ? '2' : '3'}>
            <div>
              <dt>{t('saledoc.net', 'الصافي')}</dt>
              <dd data-action="done-net">
                <Num>{fmtMoney(data.total, 0)}</Num>
              </dd>
            </div>
            {data.total === 0n ? (
              <div>
                <dt>{t('saledoc.state', 'الحالة')}</dt>
                <dd data-action="done-free">{t('sales.free', 'بلا مقابل')}</dd>
              </div>
            ) : data.open === 0n ? (
              <div data-part="settled">
                <dt>{t('saledoc.state', 'الحالة')}</dt>
                <dd data-action="done-paid-all">{t('invoice.pay.paid', 'مدفوعة كلّها')}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>{t('saledoc.paid', 'المدفوع')}</dt>
                  <dd data-action="done-paid">
                    <Num>{fmtMoney(paidSoFar(data), 0)}</Num>
                  </dd>
                </div>
                <div data-part="open">
                  <dt>{t('saledoc.open', 'الباقي')}</dt>
                  <dd data-action="done-open">
                    <Num>{fmtMoney(data.open, 0)}</Num>
                  </dd>
                </div>
              </>
            )}
          </dl>
          <div className="sale-done-actions">
            {nextFirst ? nextLink : sendButton}
            <div className="sale-done-row">
              {nextFirst ? sendButton : null}
              {printButton}
              {collectButton}
            </div>
            {nextFirst ? null : nextLink}
          </div>
        </section>
      ) : (
        <>
          <h1 ref={pageTitle} tabIndex={-1} className="sale-doc-title print:hidden" data-action="sale-title">
            {t('invoice.paper.title', 'فاتورة بيع')} <bdi dir="ltr">{data.docNo}</bdi>
          </h1>
          <section className="card sale-receipt print:hidden" data-action="sale-head" data-stale={stale ? '' : undefined}>
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
                  {/* الفاصل مع المخزن لا آخر السطر (مراجعة Q12). */}
                  <span>
                    <span aria-hidden="true">{'\u{B7}\u{A0}'}</span>
                    <span data-action="sale-store">{data.warehouseName}</span>
                  </span>
                </p>
              </div>
              <StatusChip tone={tone} />
            </div>
            {staleBadge}
            <p className={`sale-net ${isVoid ? 'sale-net-void' : ''}`} data-action="sale-net">
              <Num>{fmtMoney(data.total, 0)}</Num>
              <span className="sale-net-unit">{t('saledoc.dinar', 'دينار')}</span>
            </p>
            {isVoid ? null : <PaidBar invoice={data} />}
            {note ? (
              <p className="sale-note" data-action="sale-payment">
                {note}
              </p>
            ) : null}
            {data.cost && !isVoid ? (
              <div className="sale-profit">
                <button
                  type="button"
                  className="sale-profit-toggle"
                  aria-expanded={profitOpen}
                  onClick={() => {
                    setProfitOpen(!profitOpen);
                    if (userId !== '') writeFlag(profitKey(userId), !profitOpen);
                  }}
                  data-action="profit-toggle"
                >
                  {t('sales.stat.profit', 'الربح')}
                  <ChevronDown aria-hidden="true" className="size-4 sale-disclosure-icon" />
                </button>
                {profitOpen ? (
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
              </div>
            ) : null}
          </section>
          {isVoid ? (
            <div className="print:hidden">
              <Notice tone="warning" title={t('sale.doc.void.title', 'أُلغيت هذه الفاتورة')}>
                <span className="flex flex-col gap-1" data-action="sale-void">
                  {data.voidReason ? <span>{t('sale.doc.void.reason', 'السبب: {reason}', { reason: data.voidReason })}</span> : null}
                  <span>{t('saledoc.void.money', 'لا يُحتسب مبلغها ولا ربحها، ولا دين بها على الزبون.')}</span>
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
          {blockText ? (
            <p className="sale-hint print:hidden" data-action="void-block">
              {blockText}
            </p>
          ) : null}
        </>
      )}
      {readyNow ? (
        <div className="print:hidden" data-action="image-ready">
          <Notice
            tone="info"
            title={t('invoice.image.ready', 'الصورة جاهزة: اضغط «أرسلها» لتختار التطبيق والزبون.')}
            action={
              <div className="flex flex-wrap gap-2">
                <Button className="sale-btn" busy={sharing} onClick={() => (sharingNow.current ? undefined : void deliver(readyNow.file, readyNow.title, readyNow.of))} data-action="send-ready">
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
      {showCollectNote ? (
        <p className="sale-hint print:hidden" data-action="collect-note">
          {t('saledoc.collect.note', '«استلم دفعة» يسجّل قبضاً على حساب «{party}» يُسدِّد أقدم ديونه أوّلاً، والمعاينة قبل الحفظ تسمّي ما يُسدَّد.', { party: data.partyName })}
        </p>
      ) : null}
      <section className="sale-section print:hidden" data-action="sale-lines">
        <h2 className="sale-section-title">{t('saledoc.lines.title', 'الموادّ')}</h2>
        <PageLines invoice={data} wide={wide} voided={isVoid} />
      </section>
      {isVoid ? null : (
        <div className="print:hidden">
          <PageLegs invoice={data} />
        </div>
      )}
      {data.note !== null || data.postedByName !== null ? (
        <p className="sale-hint print:hidden" data-action="sale-by">
          {[
            // الملاحظة تُطبع على ورقة الزبون، فتقول ذلك هنا (مراجعة Q6).
            data.note !== null ? t('saledoc.note_on_paper', 'ملاحظة (تظهر على الفاتورة): {note}', { note: data.note }) : null,
            data.postedByName !== null ? t('invoice.paper.seller', 'البائع: {name}', { name: data.postedByName }) : null,
          ]
            .filter((part): part is string => part !== null)
            .join(SEP)}
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
          onClose={() => {
            setCollecting(false);
            setRefocus((n) => n + 1);
          }}
          onPosted={() => {
            setCollecting(false);
            setRefocus((n) => n + 1);
            afterWrite('collect');
          }}
        />
      ) : null}
      {voiding ? (
        <SaleVoidDialog
          target={voidTargetOf(data)}
          pendingKey={pendingKey}
          onCancel={(asked) => {
            setVoiding(false);
            setRefocus((n) => n + 1);
            // طُلب الإلغاء فلم يُعرف جوابه أو رُفض: قراءة جديدة تقول حال الفاتورة الآن (A11 ثمّ Q2: قد يكون جهاز آخر ألغاها).
            if (asked || readVoidPending(pendingKey)) state.retry();
          }}
          onDone={(text) => {
            setVoiding(false);
            setVoided(text);
            setRefocus((n) => n + 1);
            afterWrite('void');
          }}
        />
      ) : null}
    </div>
  );
}
