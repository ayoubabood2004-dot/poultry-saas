import { useCallback, useId, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { loadBirdSaleDetail, voidBirdSale, type BirdSaleDetail } from '../../lib/repo/birdSales';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { birdBack, birdBackLabel, BirdSalePaper, dinarsText, hallsBirdsText, paperTitle, printAs, PRINT_STYLE, ticketPagePath } from './birdParts';

// فاتورة الطيور للقراءة والطباعة (0028، العقد §5.5 و§10 الوكيل ب): /sales/birds/:id بقراءة bird_sale_detail (لأدوار المبيعات). ورقة A5 «فاتورة بيع دجاج لحم
// حيّ» (birdParts) تُطبع بعنوانها، و«ألغِ الفاتورة» للمدير بسبب إلزاميّ وتأكيد يسمّي النتيجة (تعود الطيور إلى قاعاتها حيّةً، والمقبوض يبقى رصيداً للتاجر
// يُخصم من فاتورة لاحقة أو يُردّ من كشفه، FOUNDATION ٥٨٣)؛ ويُرفض على فوج مغلق (O1): الخادم لا يجيزه (can_void)، فالصفحة تقول لماذا، وتلميح الخادم يظهر
// إن أُغلق الفوج بعد القراءة. والنتيجة المجهولة للإلغاء: السبب والمرجع يتجمّدان والإعادة بهما (إلغاء ثانٍ مرفوض already_void، فلا ضرر من الإعادة).
// يفتحها نموذج الفاتورة وقائمة المبيعات وكشف التاجر وحركة الأموال وتذكرتها؛ والرجوع إلى ?back= (المبيعات أو الحسابات أو التذاكر) وإلّا المبيعات.
// ومراجعة 0028: المقبوض الذي رُدّ للتاجر يُقال على الصفحة والورقة (M3، والمبالغ مصحَّحة من الخادم)، وختم الإلغاء بيوم الخادم (S9)، ويوما الفاتورة والتذكرة
// على الورقة حين يختلفان (O4، أجوبة المالك 2026-11-13).

function VoidDialog({ sale, onCancel, onDone }: { sale: BirdSaleDetail; onCancel: () => void; onDone: () => void }) {
  const id = useId();
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  // السبب المرسَل بعد نتيجة مجهولة: الإعادة به وبالمرجع نفسه (سبب آخر بالمرجع نفسه ref_reused)، والحقل مقفول حتى يُعرف.
  const [sent, setSent] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const text = (sent ?? reason).trim();
  const missing = text === '' ? t('birds.void.reason_required', 'اكتب سبب الإلغاء.') : text.length > 500 ? t('birds.void.reason_long', 'السبب حتى 500 حرف.') : null;
  const failed = failure ? (failure instanceof RejectedError && failure.hint ? failure.hint : `${describeError(failure).title}. ${describeError(failure).detail}`) : null;
  const paid = sale.money?.paidNow ?? 0n;
  const halls = sale.sources.map((source) => ({ name: source.hallName, birds: source.birds }));
  return (
    <ConfirmDialog
      open
      title={t('birds.void.title', 'ألغِ الفاتورة {doc}؟', { doc: sale.docNo })}
      consequence={
        <div className="flex flex-col gap-3">
          <p data-action="bird-void-text">
            {paid > 0n
              ? t('birds.void.body_paid', 'تُلغى الفاتورة {doc} وتعود {halls} حيّةً؛ والمقبوض ({paid}) يبقى رصيداً للتاجر «{party}» يُخصم من فاتورة لاحقة أو يُردّ من كشفه.', {
                  doc: sale.docNo,
                  halls: hallsBirdsText(halls, false),
                  paid: dinarsText(paid),
                  party: sale.partyName,
                })
              : t('birds.void.body', 'تُلغى الفاتورة {doc} وتعود {halls} حيّةً، ويُعكس قيدها على التاجر «{party}».', { doc: sale.docNo, halls: hallsBirdsText(halls, false), party: sale.partyName })}
          </p>
          {sent !== null ? (
            <p className="text-sm" data-action="bird-void-unknown">
              {t('birds.void.unknown', 'لم يُعرف إن أُلغيت؛ «ألغِ الفاتورة» يعيده بالسبب نفسه، ولن تُلغى مرّتين.')}
            </p>
          ) : null}
          <Field id={`${id}-reason`} label={t('birds.void.reason', 'سبب الإلغاء')} error={tried ? (missing ?? failed) : failed}>
            <input id={`${id}-reason`} className="input" maxLength={500} value={sent ?? reason} disabled={busy || sent !== null} onChange={(event) => setReason(event.target.value)} data-action="bird-void-reason" />
          </Field>
        </div>
      }
      confirmLabel={t('birds.void.confirm', 'ألغِ الفاتورة')}
      busy={busy}
      action="bird-void-confirm"
      onCancel={onCancel}
      onConfirm={() => {
        setTried(true);
        if (missing || busy) return;
        setBusy(true);
        setFailure(null);
        voidBirdSale(clientRef, sale.id, text).then(
          (voided) => {
            const kept = voided.paymentKept !== null && voided.paymentKept > 0n ? t('birds.void.done_kept', ' والمقبوض {paid} باقٍ رصيداً للتاجر «{party}».', { paid: dinarsText(voided.paymentKept), party: sale.partyName }) : '';
            toast({ tone: 'success', title: `${t('birds.void.done', 'أُلغيت الفاتورة {doc} وعادت الطيور إلى قاعاتها.', { doc: voided.docNo })}${kept}` });
            onDone();
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

function BirdSaleView({ id, back }: { id: string; back: string }) {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const orgName = workspace?.orgName ?? '';
  const mayVoid = workspace ? can(workspace.role, 'void') : false;
  const load = useCallback(() => loadBirdSaleDetail(id), [id]);
  const state = useLoad(load, id);
  const [kept, setKept] = useState<BirdSaleDetail | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const sale = state.data ?? kept;
  const [voiding, setVoiding] = useState(false);
  const backButton = <BackButton to={back} label={birdBackLabel(back)} />;

  if (!sale) {
    if (state.error instanceof NotConnectedError) {
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
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        {state.error ? (
          <LoadFailed what={t('birds.doc.what', 'فاتورة الطيور')} error={state.error} onRetry={state.retry} />
        ) : (
          <p role="status" className="py-6 text-center text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )}
      </div>
    );
  }

  const title = paperTitle(sale.docNo);
  const posted = sale.status === 'posted';
  return (
    <div className="flex flex-col gap-4" data-action="bird-sale-page">
      <style>{PRINT_STYLE}</style>
      <div className="print:hidden">{backButton}</div>
      <header className="flex flex-col gap-1 print:hidden">
        <h1 className="text-2xl font-semibold" data-action="bird-sale-title">
          {posted ? title : t('birds.doc.title_void', '{title} — ملغاة', { title })}
        </h1>
        <p className="text-sm text-ink-muted" data-action="bird-sale-status">
          {posted ? t('birds.doc.posted', 'فاتورة مرحَّلة على حساب التاجر') : t('birds.doc.void', 'فاتورة ملغاة: لا يُحتسب مبلغها ولا دين بها على التاجر، وعادت طيورها إلى قاعاتها.')}
        </p>
      </header>
      {state.error ? <LoadFailed what={t('birds.doc.what', 'فاتورة الطيور')} error={state.error} onRetry={state.retry} /> : null}
      <div className="flex flex-wrap items-center gap-2 print:hidden" data-action="bird-sale-actions">
        <Button size="sm" variant="secondary" onClick={() => printAs(title)} data-action="bird-sale-print">
          {t('birds.print', 'اطبع الفاتورة')}
        </Button>
        <Link to={ticketPagePath(sale.ticketId)} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="bird-sale-ticket">
          {t('birds.open_ticket_no', 'التذكرة {no}', { no: sale.ticketNo })}
        </Link>
        {sale.canVoid && mayVoid ? (
          <Button size="sm" variant="ghost" onClick={() => setVoiding(true)} data-action="bird-sale-void">
            {t('birds.void.confirm', 'ألغِ الفاتورة')}
          </Button>
        ) : null}
      </div>
      {posted && mayVoid && !sale.canVoid ? (
        <div className="print:hidden" data-action="bird-void-closed">
          <Notice tone="info" title={t('birds.void.closed', 'لا تُلغى هذه الفاتورة الآن: دورة قاعة من قاعاتها مغلقة. أعد فتح الدورة أوّلاً إن كان الإغلاق خطأ.')} />
        </div>
      ) : null}
      {posted && sale.paymentRefunded ? (
        <div className="print:hidden" data-action="bird-payment-refunded">
          <Notice tone="info" title={t('birds.doc.refunded', 'رُدّ المقبوض عند البيع للتاجر «{party}»، فمبلغ الفاتورة كلّه بالدين على حسابه.', { party: sale.partyName })} />
        </div>
      ) : null}
      {!posted && sale.paymentKept !== null && sale.paymentKept > 0n ? (
        <div className="print:hidden" data-action="bird-payment-kept">
          <Notice tone="info" title={t('birds.doc.kept', 'المقبوض ({paid}) باقٍ رصيداً للتاجر «{party}»: يُخصم من فاتورة لاحقة أو يُردّ من كشفه.', { paid: dinarsText(sale.paymentKept), party: sale.partyName })} />
        </div>
      ) : null}
      <BirdSalePaper sale={sale} orgName={orgName} />
      {posted && sale.remaining !== null && sale.money && sale.remaining !== sale.money.total - sale.money.paidNow ? (
        <p className="text-sm text-ink-muted print:hidden" data-action="bird-sale-remaining">
          {t('birds.doc.remaining', 'المتبقّي اليوم من هذه الفاتورة على التاجر: {amount}.', { amount: dinarsText(sale.remaining) })}
        </p>
      ) : null}
      {voiding ? (
        <VoidDialog
          sale={sale}
          onCancel={() => setVoiding(false)}
          onDone={() => {
            setVoiding(false);
            state.retry();
          }}
        />
      ) : null}
    </div>
  );
}

export default function BirdSalePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const back = birdBack(params.get('back'), '/sales');
  return <BirdSaleView key={id} id={id} back={back} />;
}
