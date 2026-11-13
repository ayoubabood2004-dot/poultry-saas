import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { FILS_PER_DINAR, type Fils, type Milli } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { billedKg, MAX_DEDUCTION, revenueSplit, saleTotal } from '../../domain/weighTicket';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { fmtDay } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { useDirtyForm } from '../../lib/pwa/dirty';
import {
  birdSalePendingKey,
  loadBirdSaleForm,
  readBirdSalePending,
  recordBirdSale,
  storeBirdSalePending,
  type BirdSaleForm,
  type FormWhy,
  type PendingBirdSale,
} from '../../lib/repo/birdSales';
import * as purchasing from '../../lib/repo/purchasing';
import type { PartyPick } from '../../lib/repo/purchasing';
import type { WeighTicket } from '../../lib/repo/weighTickets';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { BoxPicker, SupplierPicker } from '../inventory/purchase-shared';
import { birdBack, birdBackLabel, birdSalePath, birdsText, dinarsText, hallsBirdsText, HallsTable, kgText, pctText, ticketPagePath, type HallRow } from './birdParts';

// «أصدر الفاتورة» لتذكرة وزن مكتملة (0028، كلمة المالك 2026-11-12 وأجوبته O1 وO6–O10، العقد §4.4 و§5.4 و§10 الوكيل ب): /sales/birds/new?ticket=. تاجر واحد
// وتذكرة واحدة؛ يوم الفاتورة يوم التذكرة (D3). جدول القاعات (الطيور والصافي والمعدّل والحيّ الآن)، والتاجر (أو «جهة جديدة» لمن يضيف الجهات)، و«سعر الكيلو»
// (من آخر فاتورة طيور، ويُعدَّل)، و«التنزيل ٪» اختياريّاً (0–10، D2)، ومعاينة حيّة من مرآة الخادم (domain/weighTicket: الوزن المحسوب بالقاعدة 26 والمبلغ
// بالدينار الصحيح وحصّة كلّ قاعة بأكبر الباقي بصافيها) = ما يحسبه record_bird_sale، و«المقبوض الآن» (صفر افتراضاً: بالدين كلّه، O7) بصندوقه حين يزيد على
// صفر، و«الباقي على الحساب». والقاعة التي طيورها في التذكرة أكثر من حيّها تمنع الإصدار بجملة تدلّ على «فرق العدّ» (الخادم يرفض birds_over_live).
// وتأكيد يسمّي النتيجة (المبلغ والتاجر والطيور الخارجة من كلّ قاعة والمقبوض)، فنداء واحد بمرجعه ومعرّف الفاتورة من الجهاز ونسخة التذكرة شرطاً.
// ودرس 2026-11-10: الطلب يُحفظ خارج المكوّن قبل أن يخرج (sessionStorage بمفتاح المستخدم والمنشأة والتذكرة، والذاكرة إن تعذّر)، فالنتيجة المجهولة (أو
// الرجوع والعودة وإعادة التحميل والطلب في الطريق) تعيد الصفحة مجمَّدة به و«أعد المحاولة» ترسله حرفاً (لا فاتورة ثانية ولا طيور تخرج مرّتين)؛ والرفض
// الأكيد يقول تلميح الخادم ويعيد الطلب إلى الخانات، والإرسال التالي بمرجع جديد (ومعرّف فاتورة جديد بعد id_conflict). والنتيجة → صفحة الفاتورة.

/** سعر الكيلو الأعلى (bad_price): مليار دينار. */
const MAX_PRICE: Fils = 1_000_000_000n * FILS_PER_DINAR;

/** نسبة التنزيل من نصّ المستخدم بالمئات من الواحد بالمئة (0.5 ← 50)، من 0 إلى 10٪ بمرتبتين، وإلّا null. */
export function parseDeduction(text: string): bigint | null {
  const value = parseDecimal(text, 2);
  if (value === null || value.units < 0n) return null;
  const pct = toScale(value, 2);
  return pct <= MAX_DEDUCTION ? pct : null;
}

/** نصّ خانة المبلغ من قيمته: الدينار الصحيح بلا كسر، وإلّا بمرتبتين (قيمة الخانة، لا عرض). */
const inputText = (amount: Fils): string => (amount % FILS_PER_DINAR === 0n ? decimalText(amount / FILS_PER_DINAR, 0) : decimalText(amount, 2));

export interface BirdPreview {
  /** الوزن المحسوب بعد التنزيل (القاعدة 26). */
  billedKg: Milli;
  /** المبلغ بالدينار الصحيح. */
  total: Fils;
  /** حصّة كلّ قاعة بترتيب التذكرة، أو null بلا صافٍ لقاعة. */
  shares: Fils[] | null;
}

/** معاينة الفاتورة من مرآة الخادم على صافي التذكرة وصوافي قاعاتها (لقطاتها من الخادم): ما يحسبه record_bird_sale بالضبط. */
export function birdPreview(ticket: Pick<WeighTicket, 'netKg' | 'stops'>, deduction: bigint, price: Fils): BirdPreview | null {
  if (ticket.netKg === null || ticket.netKg <= 0n) return null;
  const billed = billedKg(ticket.netKg, deduction);
  const total = saleTotal(billed, price);
  const nets = ticket.stops.map((stop) => stop.netKg);
  const shares = total > 0n && nets.length > 0 && nets.every((net) => net !== null && net > 0n) ? revenueSplit(total, nets as Milli[]) : null;
  return { billedKg: billed, total, shares };
}

/** ما كُتب في النموذج: النصوص كما هي، والسعر null ما دام من آخر فاتورة (لم يُلمس). */
interface Draft {
  party: PartyPick | null;
  price: string | null;
  pct: string;
  paid: string;
  box: string;
  note: string;
}

const EMPTY: Draft = { party: null, price: null, pct: '', paid: '', box: '', note: '' };

type DraftField = 'party' | 'price' | 'pct' | 'paid' | 'box' | 'note' | 'total';

/** الطلب المعلَّق إلى خانات النموذج (بعد رفض أكيد: ما أُرسل يعود كما كُتب، لا المقترح). */
function draftOf(pending: PendingBirdSale): Draft {
  const { request } = pending;
  return {
    party: { id: request.partyId, name: pending.partyName },
    price: inputText(request.unitPrice),
    pct: request.deduction > 0n ? decimalText(request.deduction, 2) : '',
    paid: request.paidNow > 0n ? inputText(request.paidNow) : '',
    box: request.cashAccountId ?? '',
    note: request.note ?? '',
  };
}

/** لم يُحفظ شيء أكيداً: رفض الخادم، أو لم يخرج الطلب أو لم يصل، أو تزاحم فرجع، أو لا قاعدة ولا جلسة. وغيرها نتيجة مجهولة: ربّما صدرت الفاتورة. */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

/** رفوض تعني أنّ ما قرأته الشاشة تغيّر (التذكرة أو فاتورتها أو حيّ القاعات أو أفواجها أو الدفتر): يُقرأ النموذج من جديد ويبقى ما كُتب. */
const REREAD = new Set(['stale_ticket', 'ticket_invoiced', 'ticket_not_done', 'ticket_not_found', 'birds_over_live', 'flock_closed', 'no_active_flock', 'before_placement', 'no_sales_book']);

/** جملة التأكيد (ونصّ «المرسَل» للطلب المجمَّد): المبلغ والتاجر والطيور الخارجة من كلّ قاعة، والمقبوض الآن أو الدين كلّه. */
export function consequenceText(pending: Pick<PendingBirdSale, 'request' | 'partyName' | 'boxName' | 'total' | 'halls'>): string {
  const head = t('birds.confirm.head', 'تُسجَّل فاتورة BR بمبلغ {total} على حساب «{party}»، وتخرج {halls}.', {
    total: dinarsText(pending.total),
    party: pending.partyName,
    halls: hallsBirdsText(pending.halls),
  });
  const paid = pending.request.paidNow;
  const tail =
    paid > 0n
      ? t('birds.confirm.paid', ' ويُقبض الآن {paid} في «{box}»، ويبقى {rest} على حسابه.', { paid: dinarsText(paid), box: pending.boxName ?? '', rest: dinarsText(pending.total - paid) })
      : t('birds.confirm.credit', ' والمبلغ كلّه بالدين على حسابه.');
  return `${head}${tail}`;
}

/** لماذا لا تصدر فاتورة للتذكرة، بجملة. */
function whyText(why: FormWhy, form: BirdSaleForm): string {
  switch (why) {
    case 'draft':
      return t('birds.why.draft', 'التذكرة لم تكتمل بعد: أكملها ثمّ أصدر فاتورتها.');
    case 'void':
      return t('birds.why.void', 'التذكرة ملغاة، فلا تُصدر لها فاتورة.');
    case 'invoiced':
      return form.sale ? t('birds.why.invoiced_no', 'صدرت لهذه التذكرة الفاتورة {doc}.', { doc: form.sale.docNo }) : t('birds.why.invoiced', 'صدرت لهذه التذكرة فاتورتها من قبل.');
    case 'flock_closed':
      return t('birds.why.closed', 'فوج قاعة من قاعات هذه التذكرة مغلق، فلا تُصدر فاتورتها. أعد فتح الدورة أوّلاً إن كان الإغلاق خطأ.');
    case 'no_book':
      return t('birds.why.no_book', 'لا دفتر لوحدة هذا الحقل، فلا تُصدر فيه فاتورة طيور.');
  }
}

function NewBirdSale({ ticketId, back }: { ticketId: string; back: string }) {
  const id = useId();
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const pendingKey = workspace ? birdSalePendingKey(workspace.userId, workspace.orgId, ticketId) : '';
  const load = useCallback(() => loadBirdSaleForm(ticketId), [ticketId]);
  const state = useLoad(load, ticketId);
  // آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (بعد رفض: النموذج لا ينطوي وما كُتب باقٍ).
  const [kept, setKept] = useState<BirdSaleForm | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const form = state.data ?? kept;

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [ids, setIds] = useState<{ ref: string; saleId: string }>(() => ({ ref: crypto.randomUUID(), saleId: crypto.randomUUID() }));
  const [confirm, setConfirm] = useState<PendingBirdSale | null>(null);
  const [frozen, setFrozen] = useState<PendingBirdSale | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unreached, setUnreached] = useState(false);
  const sending = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // طلب معلَّق من فتح سابق (أو قبل إعادة التحميل): تعود الصفحة مجمَّدة به. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (مرّة لكلّ مفتاح).
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (pendingKey !== '' && restoredFor !== pendingKey) {
    setRestoredFor(pendingKey);
    setFrozen(readBirdSalePending(pendingKey));
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const priceShown = draft.price ?? (form?.suggestedPrice != null ? inputText(form.suggestedPrice) : '');
  const price = priceShown.trim() ? parseMoneyText(priceShown, false) : null;
  const deduction = draft.pct.trim() ? parseDeduction(draft.pct) : 0n;
  const paid = draft.paid.trim() ? parseMoneyText(draft.paid, true) : 0n;
  const wantsBoxes = paid !== null && paid > 0n;
  const loadBoxes = useCallback(() => (wantsBoxes ? purchasing.listBoxes() : Promise.resolve(null)), [wantsBoxes]);
  const boxes = useLoad(loadBoxes, `${wantsBoxes}`);
  const box = draft.box || (boxes.data && boxes.data.length === 1 && boxes.data[0] ? boxes.data[0].id : '');
  const boxName = boxes.data?.find((row) => row.id === box)?.name ?? null;

  const ticket = form?.ticket ?? null;
  const preview = ticket && price !== null && price > 0n && price <= MAX_PRICE && deduction !== null ? birdPreview(ticket, deduction, price) : null;
  const errors: Partial<Record<DraftField, string>> = {};
  if (!draft.party) errors.party = t('birds.party.required', 'اختر التاجر، أو أضفه باسمه.');
  if (price === null || price <= 0n || price > MAX_PRICE) errors.price = t('birds.price.required', 'اكتب سعر الكيلو بالدينار رقماً أكبر من صفر، بمرتبتين عشريتين على الأكثر.');
  if (deduction === null) errors.pct = t('birds.pct.invalid', 'نسبة التنزيل من 0 إلى 10٪، بمرتبتين عشريتين على الأكثر.');
  if (preview && preview.total <= 0n) errors.total = t('birds.total.zero', 'مبلغ الفاتورة يُقرَّب إلى صفر دينار. راجع سعر الكيلو.');
  if (paid === null || (preview && paid > preview.total)) {
    errors.paid = preview
      ? t('birds.paid.over', 'المقبوض الآن مبلغ بالدينار الصحيح من صفر حتى مبلغ الفاتورة ({total}).', { total: dinarsText(preview.total) })
      : t('birds.paid.invalid', 'المقبوض الآن مبلغ بالدينار الصحيح من صفر فأكثر.');
  }
  if (wantsBoxes && !box) errors.box = t('birds.box.required', 'اختر الصندوق الذي قبضت فيه.');
  if (draft.note.trim().length > 500) errors.note = t('birds.note.long', 'الملاحظة حتى 500 حرف.');
  const shown = tried ? errors : {};
  const overLive = form ? form.flocks.filter((flock) => flock.overLive) : [];
  const blocked = !form || !form.invoiceable || !form.canPost || overLive.length > 0;

  const dirty = draft.party !== null || draft.price !== null || draft.pct.trim() !== '' || draft.paid.trim() !== '' || draft.note.trim() !== '';
  useDirtyForm(dirty || busy || frozen !== null);

  /** نداء record_bird_sale بطلب محفوظ: الأوّل من التأكيد، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const submit = async (pending: PendingBirdSale, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setUnreached(false);
    // الطلب محفوظ خارج المكوّن قبل أن يخرج: رجوع أو إعادة تحميل قبل الجواب تعيد الصفحة مجمَّدة به.
    storeBirdSalePending(pendingKey, pending);
    try {
      const sale = await recordBirdSale(pending.request);
      storeBirdSalePending(pendingKey, null);
      toast({
        tone: 'success',
        title: t('birds.done', 'صدرت الفاتورة {doc} بمبلغ {total} على «{party}».', { doc: sale.docNo, total: sale.money ? dinarsText(sale.money.total) : dinarsText(pending.total), party: sale.partyName }),
      });
      if (!live.current) return;
      setFrozen(null);
      setConfirm(null);
      navigate(birdSalePath(sale.id, back));
    } catch (problem) {
      setConfirm(null);
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن صدرت: الصفحة تتجمّد بطلبها، والإعادة وحدها ممكنة.
        setFrozen(pending);
        setUnreached(retrying && surelyUnsaved(problem));
        if (!live.current) toast({ tone: 'warning', title: t('birds.unknown_away', 'لا نعرف إن صدرت فاتورة التذكرة {no}: افتح «أصدر الفاتورة» لها وأعد المحاولة؛ لن تصدر مرّتين.', { no: pending.ticketNo }) });
        return;
      }
      // جواب أكيد بلا فاتورة: ما أُرسل يعود إلى الخانات، والإرسال التالي بمرجع جديد (ومعرّف فاتورة جديد بعد id_conflict).
      storeBirdSalePending(pendingKey, null);
      setFrozen(null);
      if (!live.current) {
        toast({ tone: 'danger', title: t('birds.refused_away', 'لم تصدر فاتورة التذكرة {no}.', { no: pending.ticketNo }), detail: failureText(problem) });
        return;
      }
      // معرّف الفاتورة من الطلب المرفوض نفسه (ولو أُعيد من التخزين بعد إعادة التحميل)، وجديد بعد id_conflict وحده.
      setDraft(draftOf(pending));
      setIds({ ref: crypto.randomUUID(), saleId: problem instanceof RejectedError && problem.code === 'id_conflict' ? crypto.randomUUID() : pending.request.saleId });
      setFailure(problem);
      if (problem instanceof RejectedError && REREAD.has(problem.code)) state.retry();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const title = (no: string) => t('birds.new.title', 'فاتورة طيور للتذكرة {no}', { no });
  const backButton = <BackButton to={back} label={birdBackLabel(back)} />;

  if (frozen) {
    return (
      <div className="flex flex-col gap-4" data-action="bird-sale-frozen">
        {backButton}
        <PageHeader title={title(frozen.ticketNo)} />
        <Notice
          tone="warning"
          title={
            unreached
              ? t('birds.unreached', 'لم يصل الطلب هذه المرّة أيضاً: أعد المحاولة حين يعود الاتصال؛ لن تصدر الفاتورة مرّتين.')
              : t('birds.unknown', 'لا نعرف إن صدرت الفاتورة: أعد المحاولة بالطلب نفسه؛ لن تصدر مرّتين ولن تخرج الطيور مرّتين.')
          }
          action={
            <Button busy={busy} disabled={!online} onClick={() => void submit(frozen, true)} data-action="bird-sale-retry">
              {t('purchase.retry', 'أعد المحاولة')}
            </Button>
          }
        >
          <span data-action="bird-sale-sent">{t('birds.sent', 'المرسَل: {what}', { what: consequenceText(frozen) })}</span>
        </Notice>
        {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        {state.error ? (
          <LoadFailed what={t('birds.form.what', 'نموذج فاتورة الطيور')} error={state.error} onRetry={state.retry} />
        ) : (
          <p role="status" className="py-6 text-center text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )}
      </div>
    );
  }

  const { ticket: shownTicket } = form;
  const ticketNo = shownTicket.ticketNo ?? t('halls.ticket.status.draft', 'مسوّدة');
  const liveOf = new Map(form.flocks.map((flock) => [flock.stopId, flock.live]));
  const rows: HallRow[] = shownTicket.stops.map((stop, index) => ({
    key: stop.id,
    hallName: stop.hallName,
    birds: stop.birds ?? 0,
    netKg: stop.netKg ?? 0n,
    avgKg: stop.avgKg,
    live: liveOf.get(stop.id) ?? stop.live,
    share: preview?.shares?.[index] ?? null,
  }));
  const halls = shownTicket.stops.map((stop) => ({ name: stop.hallName, birds: stop.birds ?? 0 }));

  const askConfirm = () => {
    setTried(true);
    if (blocked || busy || Object.keys(errors).length || !draft.party || price === null || deduction === null || paid === null || !preview || shownTicket.ticketNo === null) return;
    setFailure(null);
    setConfirm({
      request: {
        clientRef: ids.ref,
        saleId: ids.saleId,
        ticketId: shownTicket.id,
        ticketVersion: shownTicket.version,
        partyId: draft.party.id,
        unitPrice: price,
        deduction,
        paidNow: paid,
        cashAccountId: paid > 0n ? box : null,
        note: draft.note.trim() || null,
      },
      ticketNo: shownTicket.ticketNo,
      partyName: draft.party.name,
      boxName: paid > 0n ? boxName : null,
      total: preview.total,
      halls,
    });
  };

  const facts = [
    t('birds.fact.site', 'الحقل: {site}', { site: shownTicket.siteName }),
    t('birds.fact.day', 'يوم الفاتورة: {day} (يوم التذكرة)', { day: fmtDay(shownTicket.onDate) }),
    ...(form.book ? [t('birds.fact.book', 'الحساب: {book}', { book: form.book.name })] : []),
  ].join(t('list.separator', '، '));

  return (
    <div className="flex flex-col gap-4" data-action="bird-sale-new">
      {backButton}
      <PageHeader title={title(ticketNo)} subtitle={facts} />
      {!online ? (
        <Notice tone="warning" title={t('purchase.offline', 'يحتاج اتصالاً')}>
          {t('birds.offline', 'الفاتورة تُحفظ في الخادم فوراً؛ أعد المحاولة حين يعود الاتصال.')}
        </Notice>
      ) : null}
      {form.why ? (
        <Notice
          tone="info"
          title={whyText(form.why, form)}
          action={
            form.why === 'invoiced' && form.sale ? (
              <Link to={birdSalePath(form.sale.id, back)} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="bird-sale-open">
                {t('birds.open_sale', 'افتح الفاتورة {doc}', { doc: form.sale.docNo })}
              </Link>
            ) : form.why === 'draft' ? (
              <Link to={ticketPagePath(shownTicket.id)} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="bird-ticket-open">
                {t('birds.open_ticket', 'افتح التذكرة')}
              </Link>
            ) : undefined
          }
        />
      ) : !form.canPost ? (
        <Notice tone="info" title={t('birds.role', 'إصدار فاتورة الطيور للمحاسب والمدير.')} />
      ) : null}
      <HallsTable
        caption={t('birds.form.halls', 'قاعات التذكرة {no}', { no: ticketNo })}
        rows={rows}
        totals={{ birds: shownTicket.birds ?? 0, netKg: shownTicket.netKg ?? 0n, avgKg: shownTicket.avgKg, share: preview?.shares ? preview.total : null }}
        live
        shares={preview?.shares !== null && preview !== null}
      />
      {overLive.length ? (
        <Notice
          tone="warning"
          title={t('birds.over_live.title', 'طيور التذكرة أكثر من الحيّ بحسب النظام، فلا تصدر الفاتورة:')}
          action={
            <Button size="sm" variant="secondary" busy={state.loading} onClick={state.retry} data-action="bird-form-reread">
              {t('birds.reread', 'أعد القراءة')}
            </Button>
          }
        >
          <span className="flex flex-col gap-1" data-action="bird-over-live">
            {overLive.map((flock) => (
              <span key={flock.stopId}>
                {t('birds.over_live', 'في «{hall}» بحسب النظام {live} حيّاً، وفي التذكرة {birds}. إن كان العدد الفعليّ أكبر فليسجّل المدير «فرق العدّ» بتاريخ {day} أو قبله، ثمّ أعد القراءة.', {
                  hall: flock.hallName,
                  live: birdsText(flock.live),
                  birds: birdsText(flock.birds),
                  day: fmtDay(shownTicket.onDate),
                })}
              </span>
            ))}
          </span>
        </Notice>
      ) : null}
      {form.invoiceable && form.canPost ? (
        <form
          className="card grid gap-4 p-4 sm:grid-cols-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            askConfirm();
          }}
          data-action="bird-sale-form"
        >
          <div className="flex flex-col gap-1.5 sm:col-span-2" data-action="bird-party">
            <SupplierPicker id={`${id}-party`} label={t('birds.party', 'التاجر (لمن بعت)')} value={draft.party} onChange={(party) => set({ party })} customer />
            {shown.party ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                {shown.party}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <MoneyInput id={`${id}-price`} label={t('birds.price', 'سعر الكيلو (دينار)')} whole={false} value={priceShown} onChange={(text) => set({ price: text })} error={shown.price} />
            {form.suggestedPrice !== null && draft.price === null ? (
              <p className="text-sm text-ink-muted" data-action="bird-price-suggested">
                {t('birds.price.hint', 'من آخر فاتورة طيور؛ عدّله إن بعت بغيره.')}
              </p>
            ) : null}
          </div>
          <Field id={`${id}-pct`} label={t('birds.pct.label', 'التنزيل ٪ (اختياري)')} hint={t('birds.pct.hint', 'من 0 إلى 10٪ يُنزل من الصافي قبل الحساب.')} error={shown.pct}>
            <input id={`${id}-pct`} inputMode="decimal" dir="ltr" autoComplete="off" className="input text-end tabular-nums" value={draft.pct} onChange={(event) => set({ pct: toWesternDigits(event.target.value) })} data-action="bird-pct" />
          </Field>
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-lg font-semibold sm:col-span-2" data-action="bird-preview">
            {preview && shownTicket.netKg !== null
              ? t('birds.preview', 'الصافي {net}{deduction}، الوزن المحسوب {billed} × {price} = {total}', {
                  net: kgText(shownTicket.netKg),
                  deduction: deduction !== null && deduction > 0n ? t('birds.preview.deduction', ' بعد تنزيل {pct}', { pct: pctText(deduction) }) : '',
                  billed: kgText(preview.billedKg),
                  price: dinarsText(price ?? 0n),
                  total: dinarsText(preview.total),
                })
              : t('birds.preview.empty', 'المبلغ: اكتب سعر الكيلو')}
          </p>
          {shown.total ? (
            <p role="alert" className="text-sm text-danger-700 dark:text-danger-300 sm:col-span-2">
              {shown.total}
            </p>
          ) : null}
          <MoneyInput
            id={`${id}-paid`}
            label={t('birds.paid', 'المقبوض الآن (دينار)')}
            value={draft.paid}
            onChange={(text) => set({ paid: text })}
            hint={t('birds.paid.hint', 'اتركه فارغاً: المبلغ كلّه بالدين على التاجر.')}
            error={shown.paid}
          />
          {wantsBoxes ? (
            <div className="flex flex-col gap-1.5">
              <BoxPicker id={`${id}-box`} label={t('birds.box', 'الصندوق الذي قبضت فيه')} boxes={boxes.data} value={box} onChange={(value) => set({ box: value })} />
              {shown.box ? (
                <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                  {shown.box}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="text-sm sm:col-span-2" data-action="bird-credit">
            {preview && paid !== null && paid <= preview.total
              ? t('birds.credit', 'الباقي على الحساب: {amount}', { amount: dinarsText(preview.total - paid) })
              : t('birds.credit.empty', 'الباقي على الحساب: يُحسب بعد السعر')}
          </p>
          <Field id={`${id}-note`} label={t('birds.note', 'ملاحظة (اختيارية)')} error={shown.note}>
            <input id={`${id}-note`} className="input" maxLength={500} autoComplete="off" value={draft.note} onChange={(event) => set({ note: event.target.value })} data-action="bird-note" />
          </Field>
          <div className="flex flex-col gap-2 sm:col-span-2">
            {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
            <Button type="submit" size="lg" busy={busy} disabled={!online || blocked} data-action="bird-sale-submit">
              {preview && preview.total > 0n ? t('birds.submit.total', 'أصدر الفاتورة بـ{total}', { total: dinarsText(preview.total) }) : t('birds.submit', 'أصدر الفاتورة')}
            </Button>
          </div>
        </form>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('birds.confirm.title', 'أصدر فاتورة التذكرة {no}؟', { no: confirm.ticketNo })}
          consequence={<span data-action="bird-confirm-text">{consequenceText(confirm)}</span>}
          confirmLabel={t('birds.submit', 'أصدر الفاتورة')}
          busy={busy}
          action="bird-sale-confirm"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void submit(confirm, false)}
        />
      ) : null}
    </div>
  );
}

export default function BirdSaleNewPage() {
  const [params] = useSearchParams();
  const ticketId = params.get('ticket') ?? '';
  const back = birdBack(params.get('back'), ticketId ? ticketPagePath(ticketId) : '/sales');
  if (!ticketId) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton to={back} label={birdBackLabel(back)} />
        <Notice tone="info" title={t('birds.no_ticket', 'افتح «أصدر الفاتورة» من تذكرة وزن مكتملة، أو من «تذاكر بانتظار الفاتورة» في المبيعات.')} />
      </div>
    );
  }
  return <NewBirdSale key={ticketId} ticketId={ticketId} back={back} />;
}
