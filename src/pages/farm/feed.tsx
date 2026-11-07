import type { Milli } from '../../domain/money';
import { fmtInt, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { FlockFeed } from '../../lib/repo/flocks';

// علف القاعة بسطر واحد (0019، كلمة المالك 2026-11-07: «ويكلي شكد عندك واكدر اصرف منها للقاعة»): المصروف للقاعة من المخزن، والمستهلك
// المسجّل في الجولات، والباقي بينهما كما هو (قد يكون سالباً حين سُجّل استهلاك أكثر ممّا صُرف). في شاشة الفوج (محفوظة للفتح بلا نت) وصفحة
// الصرف معاً، فهي صغيرة بلا أفعال.

/** بالكيلوغرام دائماً («مجموع كيلوات»)، لا «1.2 طن». */
const kg = (qty: Milli): string => {
  const shown = fmtQty(qty, 'kg');
  return shown.sub ?? shown.main;
};

export function FeedLine({ feed }: { feed: FlockFeed }) {
  return (
    <div className="flex flex-col gap-1" data-action="feed-line">
      <p className="font-semibold">
        {t('feed.line', 'المصروف للقاعة: {issued} — المستهلك المسجّل: {consumed} — الباقي بالقاعة: {left}', {
          issued: kg(feed.issuedFeedKg),
          consumed: kg(feed.consumedFeedKg),
          left: kg(feed.remainingFeedKg),
        })}
      </p>
      {feed.unweighedFeedLines > 0 ? (
        <p className="text-sm text-ink-muted" data-action="feed-unweighed">
          {t('feed.unweighed', 'سطور علف سائل بلا كثافة لم يُحسب وزنها في المصروف: {n}.', { n: fmtInt(feed.unweighedFeedLines) })}
        </p>
      ) : null}
    </div>
  );
}

/** رابط صفحة الصرف للفوج، ومعه طريق الرجوع (صفحة الفوج أو الحقل) وفتح نافذة الصرف مباشرةً إن طُلب. */
export function issuePath(flockId: string, back: string, open: boolean): string {
  const query = new URLSearchParams({ back });
  if (open) query.set('open', '1');
  return `/inventory/issue/${flockId}?${query.toString()}`;
}
