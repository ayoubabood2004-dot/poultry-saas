import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import type { Fils } from '../../domain/money';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { SaleInvoice } from '../../lib/repo/sales';
import { baseQty } from '../inventory/simple-shared';
import { dinars, linesText } from './saleParts';

// «ألغِ الفاتورة» (تصميم المبيعات ٦، كلمة المالك 2026-11-18): انتقل من صفّ القائمة إلى صفحة الفاتورة تحت «⋯» — الإلغاء فعل نادر خطِر لا يجاور كلّ صفّ.
// السبب إلزاميّ: البضاعة ترجع لوجباتها ويُعكس قيد الفاتورة، والمقبوض باسم الزبون يبقى رصيداً له (FOUNDATION ٥٨٣) وما قُبض من الزبون النقديّ يُردّ من صناديقه.
// والنتيجة المجهولة تجمّد السبب والمرجع (الإعادة بهما لا تُلغي مرّتين، ref_reused لسبب آخر بالمرجع نفسه).

/** ما يقوله التأكيد عن الفاتورة: من ماذا وإلى من، وما بقي مدفوعاً منها. */
export interface VoidTarget {
  id: string;
  docNo: string;
  partyName: string;
  walkIn: boolean;
  /** تسليم بلا مقابل: لا قيد على الجهة. */
  free: boolean;
  /** رُدّ المقبوض كلّه من قبل (كلّ السيقان، A3): لا يبقى منه رصيد. */
  refundedAll: boolean;
  /** ما بقي مدفوعاً (السيقان التي لم تُردّ)، أو null بلا مقبوض. */
  paid: Fils | null;
  /** البضاعة التي ترجع: «100 كغم من «علف بادئ»»، «كمّيات «علف بادئ» في الفاتورة»، «موادّ الفاتورة (3 موادّ)». */
  goods: string;
}

/** هدف الإلغاء من الفاتورة كما قرأتها صفحتها (sale_detail): الموادّ المختلفة لا السطور (مراجعة 0033 D8)، والمدفوع ما لم يُردّ. */
export function voidTargetOf(sale: SaleInvoice): VoidTarget {
  const items = new Set(sale.lines.map((line) => line.itemId));
  const [only] = sale.lines;
  const goods =
    sale.lines.length === 1 && only
      ? t('sales.void.goods_one', '{qty} من «{item}»', { qty: baseQty(only.qty, only.baseUnit), item: only.itemName })
      : items.size <= 1 && only
        ? t('sales.void.goods_item', 'كمّيات «{item}» في الفاتورة', { item: only.itemName })
        : t('sales.void.goods_many', 'موادّ الفاتورة ({lines})', { lines: linesText(items.size) });
  const free = sale.total === 0n;
  return {
    id: sale.id,
    docNo: sale.docNo,
    partyName: sale.partyName,
    walkIn: sale.walkIn,
    free,
    refundedAll: sale.paymentRefunded && sale.paid === 0n,
    paid: sale.paid > 0n && !free ? sale.paid : null,
    goods,
  };
}

/** «ألغِ البيع» بسبب إلزاميّ؛ onDone بجملة النتيجة من جواب الخادم. */
export function SaleVoidDialog({ target, onCancel, onDone }: { target: VoidTarget; onCancel: () => void; onDone: (text: string) => void }) {
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
  const { paid, goods } = target;
  return (
    <ConfirmDialog
      open
      title={t('sales.void.title', 'إلغاء البيع {no}؟', { no: target.docNo })}
      consequence={
        <div className="flex flex-col gap-3">
          <p>
            {target.free
              ? t('sales.void.body_free_goods', 'ترجع {goods} إلى مخزنها (تسليم بلا مقابل لـ«{party}»: لا قيد عليه).', { goods, party: target.partyName })
              : target.walkIn
                ? t('sales.void.body_walk_in', 'ترجع {goods} إلى مخزنها، ويُعكس قيد الفاتورة على الزبون النقديّ.', { goods })
                : t('sales.void.body_goods', 'ترجع {goods} إلى مخزنها، ويُعكس قيد الفاتورة على «{party}».', { goods, party: target.partyName })}
          </p>
          {sent !== null ? (
            <p className="text-sm" data-action="void-sale-unknown">
              {t('sales.void.unknown', 'لم يُعرف إن أُلغي؛ «ألغِ البيع» يعيده بالسبب نفسه، ولن يُلغى مرّتين.')}
            </p>
          ) : null}
          {target.refundedAll ? (
            <p data-action="void-refunded">
              {t('sales.void.refunded', 'ومبلغها المقبوض رُدّ لـ«{party}» من قبل، فلا يبقى منه رصيد.', { party: target.partyName })}
            </p>
          ) : null}
          {paid !== null && target.walkIn ? (
            <p data-action="void-walk-in">
              {t('sales.void.walk_in_cash', 'وما قُبض من الزبون النقديّ ({total}) يُردّ من صناديقه، فلا يبقى له رصيد.', { total: dinars(paid) })}
            </p>
          ) : paid !== null ? (
            <p data-action="void-cash-kept">
              {t('sales.void.cash_kept', 'والمبلغ المقبوض ({total} دينار) يبقى رصيداً لـ«{party}»: يُرجَع له من كشفه بـ«ألغِ القبض»، أو يُخصم من فاتورة لاحقة.', { total: fmtMoney(paid, 0), party: target.partyName })}
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
        purchases.voidSale(clientRef, target.id, text).then(
          (voided) => {
            const kept =
              voided.paymentKept !== null && voided.paymentKept > 0n
                ? target.walkIn
                  ? t('sales.void.done_kept_walk_in', ' والمقبوض {total} دينار باقٍ رصيداً في حساب الزبون النقديّ.', { total: fmtMoney(voided.paymentKept, 0) })
                  : t('sales.void.done_kept', ' والمقبوض {total} دينار باقٍ رصيداً لـ«{party}».', { total: fmtMoney(voided.paymentKept, 0), party: target.partyName })
                : '';
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
