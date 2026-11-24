import { useRef, useState } from 'react';
import { toast } from '../../components/ui/Toast';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { fmtDay, fmtMilli } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { Stamp } from '../../lib/outbox';
import { sendFlockFeed, type FeedSend, type FeedSent } from '../../lib/repo/hallSheet';
import { failureText, pendingKey, readPending, storePending, surelyUnsaved } from '../halls/GivePage';
import { feedAmount } from './roundText';

// إرسال العلف من «رصيد العلف» ليوم بعينه، مشتركاً بين بطاقة القاعة في الجولة (عقد 0036 الجزء R) ونافذة العلف في ورقة القاعة، وبمعناها نفسه: الطلب يُحفظ
// خارج المكوّن قبل أن يخرج (sessionStorage بمفتاح المستخدم والمنشأة والفوج، والذاكرة إن تعذّر؛ درس 2026-11-10)؛ والجواب الأكيد بلا صرف (surelyUnsaved)
// يمحوه ويبقي المكتوب للتعديل والإرسال التالي بمرجع جديد؛ والنتيجة المجهولة تجمّده بيومه وكميته ومادّته فلا يُرسل غيره، و«أعد المحاولة» ترسله حرفاً (لن
// يُصرف مرّتين)؛ والنجاح تنبيه بمستنده. والمفتاح مفتاح نافذة الورقة نفسه: ما جُمِّد في إحداهما يُرى ويُعاد في الأخرى.
// في حزمة القاعات (خارج التثبيت المسبق) مع ما يستورده: الإرسال يحتاج الخادم، والجولة المحفوظة تحمّل بطاقة العلف كسولةً (RoundFeed من HallsRoutes).

/** طلب الإرسال المحفوظ خارج المكوّن: ما أُرسل حرفاً، وأسماؤه للعرض. */
export interface FeedRequest extends FeedSend {
  itemName: string;
  baseUnit: BaseUnit;
}

/** طلب كما كتبه storePending، أو null. */
export const asFeedRequest = (value: unknown): FeedRequest | null => {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!(typeof row.clientRef === 'string' && typeof row.issueId === 'string' && typeof row.lineId === 'string' && typeof row.itemId === 'string' && typeof row.qty === 'bigint' && typeof row.forDay === 'string' && typeof row.itemName === 'string')) return null;
  return { ...(row as unknown as FeedRequest), baseUnit: row.baseUnit === 'L' || row.baseUnit === 'pc' ? row.baseUnit : 'kg' };
};

/** مفتاح الطلب المجمَّد لعلف فوج (مفتاح نافذة العلف في ورقة القاعة نفسه)، أو '' بلا هويّة. */
export const feedPendingKey = (stamp: Pick<Stamp, 'userId' | 'orgId'> | null, flockId: string): string => (stamp ? pendingKey(`${stamp.userId}:${stamp.orgId}`, `sheet-feed:${flockId}`) : '');

export const unitName = (unit: BaseUnit): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

export { feedAmount };

/** «عندك 1,860 كغم» على بطاقة العلف. */
export const onHandText = (qty: Milli, unit: BaseUnit): string => t('sheet.feed.on_hand', 'عندك {qty} {unit}', { qty: fmtMilli(qty), unit: unitName(unit) });

export interface FeedSendState {
  /** الطلب المجمَّد (نتيجته مجهولة)، أو null. */
  frozen: FeedRequest | null;
  busy: boolean;
  /** جملة الرفض الأكيد، أو null. */
  error: string | null;
  /** يرسل الطلب؛ الجواب المُرسَل أو null (رُفض أكيداً أو جُمِّد أو في الطريق غيره). */
  send: (request: FeedRequest) => Promise<FeedSent | null>;
}

/** إرسال العلف لفوج بمفتاحه (feedPendingKey)؛ onSent بعد كلّ إرسال حُفظ (لتُقرأ الشاشة من جديد). */
export function useFeedSend(key: string, onSent: (sent: FeedSent) => void): FeedSendState {
  // الطلب المجمَّد يُقرأ من مفتاحه عند الفتح وكلّما تغيّر المفتاح (هويّة تصل بعد الفتح أو فوج آخر).
  const [held, setHeld] = useState(() => ({ key, frozen: asFeedRequest(readPending(key)) }));
  if (held.key !== key) setHeld({ key, frozen: asFeedRequest(readPending(key)) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // نقرتان قبل أن يُرسم «يُرسل» لا تخرجان طلبين بمرجعين.
  const sending = useRef(false);

  const send = async (request: FeedRequest): Promise<FeedSent | null> => {
    if (sending.current || key === '') return null;
    sending.current = true;
    setBusy(true);
    setError(null);
    storePending(key, request);
    try {
      const sent = await sendFlockFeed(request);
      storePending(key, null);
      setHeld({ key, frozen: null });
      toast({ tone: 'success', title: t('sheet.feed.sent', 'أُرسل {amount} من «{item}» ليوم {day} ({doc}).', { amount: feedAmount(sent.issue.qty, sent.issue.unit), item: sent.issue.itemName, day: fmtDay(sent.issue.forDay), doc: sent.issue.docNo }) });
      onSent(sent);
      return sent;
    } catch (failure) { // swallow-ok: الرفض الأكيد جملة تحت الزرّ (error)، والنتيجة المجهولة طلب مجمَّد بـ«أعد المحاولة» (frozen)؛ وnull للطالب: لم يُحفظ بعد
      if (surelyUnsaved(failure)) {
        // جواب أكيد بلا صرف: المكتوب باقٍ، والإرسال التالي بمرجع جديد.
        storePending(key, null);
        setHeld({ key, frozen: null });
        setError(failureText(failure));
      } else {
        // لا نعرف إن صُرف: الطلب محفوظ بيومه، والإعادة وحدها ممكنة (لن يُصرف مرّتين).
        setHeld({ key, frozen: request });
        setError(null);
      }
      return null;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return { frozen: held.key === key ? held.frozen : null, busy, error, send };
}
