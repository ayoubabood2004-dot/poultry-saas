import type { Milli } from '../../domain/money';
import { fmtInt, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { FlockFeed } from '../../lib/repo/flocks';

// علف القاعة بسطر واحد (0019، كلمة المالك 2026-11-07: «ويكلي شكد عندك واكدر اصرف منها للقاعة»): المصروف للقاعة من المخزن، والمستهلك
// المسجّل في الجولات، و«الباقي في القاعة» بتعريفه الواحد في كلّ الشاشات (مراجعة 0028 O2/M5: left_in_hall_kg، يعدّ المنقول إليها ويُنقص ما خرج
// عند الإغلاق؛ وقد يكون سالباً حين سُجّل استهلاك أكثر ممّا نزل)، وسطوره بلا وزن. في شاشة الفوج (محفوظة للفتح بلا نت) وصفحة الصرف معاً، فهي صغيرة
// بلا أفعال. ومعه روابط القاعة المشتركة بين حزم الحقول والمخزن.

/** بالكيلوغرام دائماً («مجموع كيلوات»)، لا «1.2 طن». */
const kg = (qty: Milli): string => {
  const shown = fmtQty(qty, 'kg');
  return shown.sub ?? shown.main;
};

export function FeedLine({ feed }: { feed: FlockFeed }) {
  return (
    <div className="flex flex-col gap-1" data-action="feed-line">
      <p className="font-semibold">
        {t('feed.line', 'المصروف للقاعة: {issued} — المستهلك المسجّل: {consumed} — الباقي في القاعة: {left}', {
          issued: kg(feed.issuedFeedKg),
          consumed: kg(feed.consumedFeedKg),
          left: kg(feed.leftInHallKg),
        })}
      </p>
      {feed.leftInHallUnweighed > 0 ? (
        <p className="text-sm text-ink-muted" data-action="feed-unweighed">
          {t('feed.unweighed', 'سطور علف لا يُعرف وزنها (سائل بلا كثافة أو كيس بلا وزن) فلم تُحسب بالكيلو: {n}.', { n: fmtInt(feed.leftInHallUnweighed) })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * أصناف روابط شاشات الحقول والصرف مرّة واحدة: الرابط النصّيّ بلون العلامة، والرابط بشكل الزرّ الكبير. نصّ الصنف الطويل كان يتكرّر في كلّ
 * رابط من حزم التثبيت المسبق (حدّه المقيس، DECISIONS «السقوف المقيسة»).
 */
export const LINK_CLASS = 'text-sm font-semibold text-brand-700 dark:text-brand-200';
export const BUTTON_LINK_CLASS = 'inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 font-semibold text-white shadow-soft hover:bg-brand-700';
/** بطاقة قسم (الجولة والفوج والصرف). */
export const CARD_CLASS = 'card flex flex-col gap-3 p-4';

const hallPage =
  (prefix: string) =>
  (flockId: string, back: string): string =>
    `${prefix}${flockId}?${new URLSearchParams({ back }).toString()}`;

/** سجلّ الصرف للفوج (ومنه «ألغِ»)، ومعه طريق الرجوع (صفحة الفوج أو الحقل). */
export const issuePath = hallPage('/inventory/issue/');

/**
 * «أضف للقاعة» (0026، كلمة المالك 2026-11-11): صفحة الإضافة لعدّة قاعات (علف أو دواء من المخزن، أو دواء بلا مخزن)، ومعها طريق الرجوع.
 * الطريق الواحد للصرف للقاعة: الحقل والفوج والجولة وسجلّ الصرف تدلّ عليها.
 */
export const givePath = hallPage('/halls/give/');
