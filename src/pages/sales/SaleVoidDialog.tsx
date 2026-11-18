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

// «ألغِ الفاتورة» (تصميم المبيعات ٦، كلمة المالك 2026-11-18): في صفحة الفاتورة تحت «⋯» — الإلغاء فعل نادر خطِر لا يجاور كلّ صفّ.
// السبب إلزاميّ: البضاعة ترجع لوجباتها ويُعكس قيد الفاتورة. والمال كما يفعله الخادم (void_sale ← private.void_entry، مراجعة A3): كلّ ما سُدِّد من الفاتورة
// (ما دُفع عند البيع، وما سُدِّد بعده: قبضٌ أو إعفاءٌ أو تسوية أو رصيد سابق للزبون) يُحرَّر من قيدها ويُوزَّع على أقدم ما على الزبون من فواتير مفتوحة في
// الدفتر نفسه أوّلاً، وما يبقى رصيد له؛ وما قُبض من الزبون النقديّ يُردّ من صناديقه. فالتأكيد يسمّي المبلغين ولا يقول «قُبض» لما قد لا يكون قبضاً (Q5).
// و«ملغاة من قبل» (already_void: ألغاها جهاز آخر) ليست خطأً: الفاتورة ملغاة، فتُغلق النافذة وتُقرأ (Q2).
// والنتيجة المجهولة تجمّد السبب والمرجع (الإعادة بهما لا تُلغي مرّتين، ref_reused لسبب آخر بالمرجع نفسه)، ومحفوظة خارج النافذة (sessionStorage بمفتاح
// المستخدم والمنشأة والفاتورة، والذاكرة إن تعذّر، مراجعة A11): إغلاق النافذة أو إعادة التحميل لا يضيّعها.

/** ما يقوله التأكيد عن الفاتورة: من ماذا وإلى من، وما دُفع لها. */
export interface VoidTarget {
  id: string;
  docNo: string;
  partyName: string;
  walkIn: boolean;
  /** تسليم بلا مقابل: لا قيد على الجهة. */
  free: boolean;
  /** رُدّ المقبوض كلّه من قبل (كلّ السيقان، A3): لا يبقى منه رصيد. */
  refundedAll: boolean;
  /** ما بقي مدفوعاً عند البيع (السيقان التي لم تُردّ)، أو null بلا مقبوض. */
  paid: Fils | null;
  /** ما سُدِّد من الفاتورة بعد البيع = الصافي − الباقي الآن − المدفوع عند البيع (قبضٌ أو إعفاءٌ أو تسوية أو رصيد سابق؛ صفر بلا شيء منها). */
  collectedLater: Fils;
  /** البضاعة التي ترجع: «100 كغم من «علف بادئ»»، «كمّيات «علف بادئ» في الفاتورة»، «موادّ الفاتورة (3 موادّ)». */
  goods: string;
}

/** هدف الإلغاء من الفاتورة كما قرأتها صفحتها (sale_detail): الموادّ المختلفة لا السطور (مراجعة 0033 D8)، والمدفوع ما لم يُردّ، والمقبوض بعد البيع. */
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
  const later = sale.total - sale.open - sale.paid;
  return {
    id: sale.id,
    docNo: sale.docNo,
    partyName: sale.partyName,
    walkIn: sale.walkIn,
    free,
    refundedAll: sale.paymentRefunded && sale.paid === 0n,
    paid: sale.paid > 0n && !free ? sale.paid : null,
    collectedLater: !sale.walkIn && !free && sale.status === 'posted' && later > 0n ? later : 0n,
    goods,
  };
}

// ─── الإلغاء المعلَّق ─────────────────────────────────────────────────────────────────────────────────────────────

export interface VoidPending {
  ref: string;
  reason: string;
}

const pendingMemory = new Map<string, string>();

/** مفتاح الإلغاء الذي لم يُعرف جوابه: المستخدم والمنشأة والفاتورة. */
export const voidPendingKey = (userId: string, orgId: string, saleId: string): string => `sales.void.pending:${userId}:${orgId}:${saleId}`;

export function readVoidPending(key: string): VoidPending | null {
  if (key === '') return null;
  let stored: string | null;
  try {
    stored = sessionStorage.getItem(key);
  } catch { // swallow-ok: sessionStorage ممنوع؛ الذاكرة بعده
    stored = null;
  }
  const text = stored ?? pendingMemory.get(key) ?? null;
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<VoidPending> | null;
    return value && typeof value.ref === 'string' && value.ref !== '' && typeof value.reason === 'string' && value.reason !== '' ? { ref: value.ref, reason: value.reason } : null;
  } catch { // swallow-ok: نصّ تالف لم تكتبه هذه الوحدة؛ لا إلغاء معلَّق
    return null;
  }
}

export function storeVoidPending(key: string, value: VoidPending | null): void {
  if (key === '') return;
  if (value === null) pendingMemory.delete(key);
  else pendingMemory.set(key, JSON.stringify(value));
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* swallow-ok: بلا sessionStorage، الذاكرة وحدها تحمي الإعادة في هذه النافذة */
  }
}

/** جملة المال في التأكيد: كلّ ما سُدِّد من الفاتورة يُحسب للزبون فيُسدَّد به أقدم ما عليه في الدفتر نفسه، وما يبقى رصيد له (A3 وQ5). */
function creditText(target: VoidTarget): string | null {
  const atSale = target.paid ?? 0n;
  const later = target.collectedLater;
  const party = target.partyName;
  if (atSale > 0n && later > 0n) {
    return t('saledoc.void.credit_both', 'وما سُدِّد منها ({total}: {atSale} دُفع عند البيع و{later} بعده) يُحسب لـ«{party}»: يُسدَّد به أقدم ما عليه من فواتير مفتوحة في الدفتر نفسه أوّلاً، وما يبقى منه رصيد له.', {
      total: dinars(atSale + later),
      atSale: dinars(atSale),
      later: dinars(later),
      party,
    });
  }
  if (later > 0n) return t('saledoc.void.credit_later', 'وما سُدِّد منها بعد البيع ({later}) يُحسب لـ«{party}»: يُسدَّد به أقدم ما عليه من فواتير مفتوحة في الدفتر نفسه أوّلاً، وما يبقى منه رصيد له.', { later: dinars(later), party });
  if (atSale > 0n) return t('saledoc.void.credit_at_sale', 'وما دُفع لها عند البيع ({atSale}) يُحسب لـ«{party}»: يُسدَّد به أقدم ما عليه من فواتير مفتوحة في الدفتر نفسه أوّلاً، وما يبقى منه رصيد له.', { atSale: dinars(atSale), party });
  return null;
}

/**
 * «ألغِ البيع» بسبب إلزاميّ؛ onDone بجملة النتيجة من جواب الخادم (أو «أُلغيت من قبل»). pendingKey: مفتاح حفظ الطلب المجهول ('' بلا منشأة). onCancel(asked):
 * أُرسل طلب قبل الإغلاق (جوابه مجهول أو رُفض)، فالصفحة تقرأ الفاتورة من جديد.
 */
export function SaleVoidDialog({ target, pendingKey, onCancel, onDone }: { target: VoidTarget; pendingKey: string; onCancel: (asked: boolean) => void; onDone: (text: string) => void }) {
  const id = useId();
  // طلب سابق لم يُعرف جوابه (أُغلقت النافذة أو أُعيد التحميل): يعود مجمَّداً بمرجعه وسببه.
  const [restored] = useState(() => readVoidPending(pendingKey));
  const [clientRef, setClientRef] = useState(() => restored?.ref ?? crypto.randomUUID());
  const [reason, setReason] = useState('');
  // السبب المرسَل بعد نتيجة مجهولة: الإعادة به وبالمرجع نفسه (سبب آخر بالمرجع نفسه ref_reused)، والحقل مقفول حتى يُعرف.
  const [sent, setSent] = useState<string | null>(restored?.reason ?? null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(restored !== null);
  const [failure, setFailure] = useState<unknown>(null);
  const missing = (sent ?? reason).trim() === '' ? t('sales.void.reason_required', 'اكتب سبب الإلغاء.') : null;
  const failed = failure ? (failure instanceof RejectedError && failure.hint ? failure.hint : `${describeError(failure).title}. ${describeError(failure).detail}`) : null;
  const { paid, goods } = target;
  const credit = target.walkIn ? null : creditText(target);
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
          ) : credit !== null ? (
            <p data-action="void-cash-kept">{credit}</p>
          ) : null}
          <Field id={`${id}-reason`} label={t('sales.void.reason', 'سبب الإلغاء')} error={tried ? (missing ?? failed) : failed}>
            <input id={`${id}-reason`} className="input" maxLength={500} value={sent ?? reason} disabled={busy || sent !== null} onChange={(event) => setReason(event.target.value)} data-action="void-sale-reason" />
          </Field>
        </div>
      }
      confirmLabel={t('sales.void.confirm', 'ألغِ البيع')}
      busy={busy}
      action="confirm-void-sale"
      onCancel={() => onCancel(asked)}
      onConfirm={() => {
        setTried(true);
        if (missing) return;
        const text = (sent ?? reason).trim();
        setBusy(true);
        setAsked(true);
        setFailure(null);
        purchases.voidSale(clientRef, target.id, text).then(
          (voided) => {
            storeVoidPending(pendingKey, null);
            const kept = voided.paymentKept ?? 0n;
            const credited = target.walkIn ? 0n : kept + target.collectedLater;
            const tail =
              target.walkIn && kept > 0n
                ? t('sales.void.done_kept_walk_in', ' والمقبوض {total} دينار باقٍ رصيداً في حساب الزبون النقديّ.', { total: fmtMoney(kept, 0) })
                : credited > 0n
                  ? t('saledoc.void.done_credit', ' وما سُدِّد منها ({total}) حُسب لـ«{party}»: يُسدَّد به أقدم فواتيره المفتوحة في الدفتر نفسه، وما يبقى رصيد له.', { total: dinars(credited), party: target.partyName })
                  : '';
            onDone(`${t('sales.void.done', 'أُلغي البيع {no}.', { no: voided.docNo })}${tail}`);
          },
          (caught: unknown) => {
            // ملغاة من قبل (جهاز آخر، أو إعادة بعد نتيجة مجهولة لقيت إلغاءً آخر): الفاتورة ملغاة، لا خطأ (Q2).
            if (caught instanceof RejectedError && caught.code === 'already_void') {
              storeVoidPending(pendingKey, null);
              onDone(t('saledoc.void.already', 'أُلغيت الفاتورة {no} من قبل.', { no: target.docNo }));
              return;
            }
            setBusy(false);
            setFailure(caught);
            // نتيجة مجهولة (أو إعادة لها لم تُرفض رفضاً أكيداً): السبب والمرجع يتجمّدان ويُحفظان؛ والرفض الأكيد يفكّهما بمرجع جديد للمحاولة التالية.
            if (caught instanceof UnknownOutcomeError || (sent !== null && !(caught instanceof RejectedError))) {
              setSent(text);
              storeVoidPending(pendingKey, { ref: clientRef, reason: text });
            } else {
              setSent(null);
              setClientRef(crypto.randomUUID());
              storeVoidPending(pendingKey, null);
            }
          },
        );
      }}
    />
  );
}
