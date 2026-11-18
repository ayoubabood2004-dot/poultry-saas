import { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { StatStrip, type Stat } from '../../components/ui/StatStrip';
import { toast } from '../../components/ui/Toast';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import type { PartyRow } from '../../lib/repo/parties';
import { loadSaleInvoice, type SaleInvoice } from '../../lib/repo/sales';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { PaymentDialog } from '../accounts/shared';
import { downloadFile, reportImage, sendFile } from '../halls/reportImage';
import { printAs } from './birdParts';
import { dinars, INVOICE_IMAGE_WIDTH, inputMoney, invoiceImageName, invoiceTitle, InvoicePaper, PAPER_STYLE } from './saleParts';

// صفحة الفاتورة (/sales/:id، عقد 0024 F8 ثمّ عقد 0033 «ب»): ورقة الفاتورة كاملةً (السطور بوحداتها وخصوماتها، والسيقان، والدين، والبائع، والملاحظة) تُعرض
// وتُطبع A5 («اطبع أو احفظ PDF»)، و«أرسل صورة» يصوّر الورقة نفسها بعرض ثابت (reportImage) فتُفتح نافذة المشاركة (واتساب) أو تُنزَّل؛ وإن رفض المتصفّح
// فتح المشاركة بعد تجهيز الصورة (الضغطة «قديمة»، المهارة 15) تبقى الصورة جاهزةً بزرّ «أرسلها». و«استلم من الزبون» لدين الفاتورة لمن يسجّل القبض: نافذة
// «قبضنا» القائمة (record_party_payment) بدفتر الفاتورة ومبلغ دينها، والقبض يُوزَّع على أقدم ديون الزبون أوّلاً كما الآن ومعاينته تسمّي ما يُسدَّد. والكلفة
// والربح لأدوار الكلفة وحدها (cost.money يغيب لغيرها)، والملغاة بختمها وسببها بلا مبالغ. يفتحها كشف الجهة وحركة الأموال وقائمة المبيعات والفاتورة الجديدة
// بعد حفظها؛ والرجوع إلى ?back= (الحسابات أو المبيعات) وإلّا المبيعات.

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

/** الكلفة والربح لأدوار الكلفة (والملغاة بلا مبالغ). */
function costStats(sale: SaleInvoice): Stat[] {
  if (sale.status === 'void' || !sale.cost) return [];
  return [
    { key: 'cost', label: t('sales.stat.cost', 'كلفة المبيع'), value: dinars(sale.cost.cost) },
    { key: 'profit', label: t('sales.stat.profit', 'الربح'), value: dinars(sale.cost.profit) },
  ];
}

/** طرف الفاتورة لنافذة «قبضنا» (تقرأ المعرّف والاسم وحدهما). */
const partyOf = (sale: SaleInvoice): PartyRow => ({ id: sale.partyId, name: sale.partyName, version: 0, archived: false, phone: null, isCustomer: true, isSupplier: false });

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
  // آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (بعد «استلم»).
  const [kept, setKept] = useState<SaleInvoice | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const data = state.data ?? (kept && kept.id === id ? kept : null);
  const back = saleBack(new URLSearchParams(location.search).get('back'));
  const backButton = <BackButton to={back} label={t('sale.doc.back', 'رجوع')} />;
  const paperRef = useRef<HTMLElement>(null);
  const [imaging, setImaging] = useState(false);
  const [ready, setReady] = useState<{ docNo: string; file: File; title: string } | null>(null);
  const [collecting, setCollecting] = useState(false);

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

  const voided = data.status === 'void';
  const title = invoiceTitle(data.docNo);
  // «استلم من الزبون» بقول الخادم (can_collect: محفوظة، باسم، متبقٍّ من قيدها، ودور يقبض في نطاق دفترها) والمبلغ المتبقّي الآن (open) لا دين البيع: القبض
  // اللاحق لا يغيّر دين البيع (مراجعة 0033 D1).
  const canCollect = mayCollect && data.canCollect && !voided && !data.walkIn;

  const deliver = async (file: File, imageTitle: string, docNo: string) => {
    const outcome = await sendFile(file, imageTitle);
    setReady(outcome === 'blocked' ? { docNo, file, title: imageTitle } : null);
    if (outcome === 'downloaded') {
      toast({ tone: 'success', title: t('invoice.image.downloaded', 'حُفظت صورة الفاتورة «{name}» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى الزبون.', { name: file.name }) });
    }
  };
  const sendImage = async () => {
    const paper = paperRef.current;
    if (!paper || imaging) return;
    const docNo = data.docNo;
    setImaging(true);
    setReady(null);
    let file: File;
    try {
      // فاتحةً ولو كان الجهاز بالسمة الداكنة: الصورة للزبون (مراجعة 0033 D2).
      file = await reportImage(paper, invoiceImageName(docNo), INVOICE_IMAGE_WIDTH, { light: true });
    } catch {
      setImaging(false);
      toast({ tone: 'danger', title: t('invoice.image.failed', 'تعذّر تجهيز صورة الفاتورة على هذا الجهاز. اطبعها أو احفظها PDF بدلاً من ذلك.') });
      return;
    }
    setImaging(false);
    await deliver(file, title, docNo);
  };
  const readyNow = ready !== null && ready.docNo === data.docNo ? ready : null;

  return (
    <div className="flex flex-col gap-4" data-action="sale-page">
      <style>{PAPER_STYLE}</style>
      <div className="print:hidden">{backButton}</div>
      <div className="print:hidden">
        <PageHeader
          title={voided ? t('sale.doc.title.void', 'فاتورة بيع {doc} — ملغاة', { doc: data.docNo }) : t('sale.doc.title', 'فاتورة بيع {doc}', { doc: data.docNo })}
          subtitle={voided ? t('sale.doc.void', 'فاتورة ملغاة') : t('sale.doc.posted', 'فاتورة محفوظة')}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden" data-action="sale-actions">
        <Button size="sm" busy={imaging} onClick={() => void sendImage()} data-action="send-image">
          {imaging ? t('invoice.image.making', 'جارٍ تجهيز الصورة…') : t('invoice.image', 'أرسل صورة')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => printAs(title)} data-action="print-sale">
          {t('invoice.print', 'اطبع أو احفظ PDF')}
        </Button>
        {canCollect ? (
          <Button size="sm" variant="secondary" onClick={() => setCollecting(true)} data-action="collect-sale">
            {t('invoice.collect', 'استلم من الزبون')}
          </Button>
        ) : null}
      </div>
      {readyNow ? (
        <div className="print:hidden" data-action="image-ready">
          <Notice
            tone="info"
            title={t('invoice.image.ready', 'الصورة جاهزة: اضغط «أرسلها» لتختار التطبيق والزبون.')}
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void deliver(readyNow.file, readyNow.title, readyNow.docNo)} data-action="send-ready">
                  {t('halls.day.image.send', 'أرسلها')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
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
      {voided ? (
        <div className="print:hidden">
          <Notice tone="warning" title={t('sale.doc.void.title', 'أُلغيت هذه الفاتورة')}>
            <span className="flex flex-col gap-1" data-action="sale-void">
              {data.voidReason ? <span>{t('sale.doc.void.reason', 'السبب: {reason}', { reason: data.voidReason })}</span> : null}
              <span>{t('sale.doc.void.money', 'لا يُحتسب مبلغها ولا ربحها، ولا دين بها على الجهة.')}</span>
            </span>
          </Notice>
        </div>
      ) : null}
      <dl className="card grid gap-3 p-4 sm:grid-cols-3 print:hidden" data-action="sale-head">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-ink-muted">{t('sales.col.party', 'الجهة')}</dt>
          <dd className="font-semibold" data-action="sale-party">
            {data.walkIn ? (
              t('invoice.walk_in', 'زبون نقديّ')
            ) : accounts ? (
              <Link to={`/accounts/parties/${data.partyId}`} className="text-brand-700 hover:underline dark:text-brand-200">
                {data.partyName}
              </Link>
            ) : (
              data.partyName
            )}
          </dd>
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
            {voided ? t('sales.voided', 'ملغى') : t('sales.posted', 'محفوظ')}
          </dd>
        </div>
      </dl>
      <InvoicePaper invoice={data} orgName={orgName} paperRef={paperRef} />
      <div className="print:hidden">
        <StatStrip stats={costStats(data)} />
      </div>
      {canCollect ? (
        <p className="text-sm text-ink-muted print:hidden" data-action="collect-note">
          {data.open === data.debt
            ? t('invoice.collect.note', 'دين هذه الفاتورة عند البيع {debt}. «استلم من الزبون» يسجّل قبضاً على حساب «{party}» يُسدِّد أقدم ديونه أوّلاً، والمعاينة قبل الحفظ تسمّي ما يُسدَّد.', {
                debt: dinars(data.debt),
                party: data.partyName,
              })
            : t('invoice.collect.note_open', 'دين هذه الفاتورة عند البيع {debt}، والمتبقّي منه الآن {open}. «استلم من الزبون» يسجّل قبضاً على حساب «{party}» يُسدِّد أقدم ديونه أوّلاً، والمعاينة قبل الحفظ تسمّي ما يُسدَّد.', {
                debt: dinars(data.debt),
                open: dinars(data.open),
                party: data.partyName,
              })}
        </p>
      ) : null}
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
    </div>
  );
}
