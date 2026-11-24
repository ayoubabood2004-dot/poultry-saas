import { Component, useId, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Notice';
import type { Day } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import { fmtDay, fmtMilli } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { Stamp } from '../../lib/outbox';
import { useDirtyForm } from '../../lib/pwa/dirty';
import type { FeedItem, FeedUnit } from '../../lib/repo/flocks';
import { toBaseQty, type FeedSent } from '../../lib/repo/hallSheet';
import { feedAmount, feedPendingKey, onHandText, unitName, useFeedSend } from './feedSend';

// إرسال العلف من بطاقة القاعة في الجولة (عقد 0036 الجزء R2، كلمة المالك 2026-11-24: «بطاقات أنواع العلف من المخزن بكمياتها، تضغط النوع وتكتب الكمية في
// القائمة نفسها بلا قوائم أخرى»): بطاقة لكلّ علف في «رصيد العلف» باسمه و«عندك» (آخر علف للقاعة مختار مسبقاً)، ورقائق وحداته (الكيس أوّلاً ثمّ وحدة
// الأساس) كما في الورقة، وخانة الكمية، و«أرسل {الكمية}» وتحته «من «العلف»» أو «أكثر ممّا عندك» وهو مقفول. يُرسل فوراً (send_flock_feed ليوم الجولة)
// ويحتاج اتصالاً، فهو في حزمة القاعات خارج التثبيت المسبق: الجولة تحمّله كسولةً (pages/farm/shared: RoundFeedLazy)، و«أُرسل اليوم» فوقه منها (من قراءة
// الجولة، يعمل بلا نت). والطلب المجهول النتيجة يُجمَّد بـ«أعد المحاولة» (feedSend).

interface Choice {
  value: string;
  label: string;
  unit: FeedUnit | null;
}

/** وحدات الإرسال للمادّة: وحداتها (الكيس أوّلاً كما رتّبها الخادم) ثمّ وحدة الأساس. */
const unitChoices = (item: FeedItem | null): Choice[] =>
  item ? [...item.units.map((unit) => ({ value: unit.id, label: unit.name, unit })), { value: 'base', label: unitName(item.baseUnit), unit: null }] : [];

/** زرّ بسطرين: الفعل بخطّه، وتحته ما يُرسل بخطّ صغير (عرض 360). */
function TwoLines({ main, sub }: { main: string; sub: string }) {
  return (
    <span className="flex min-w-0 max-w-full flex-col items-center">
      <span className="max-w-full truncate">{main}</span>
      <span className="max-w-full truncate text-xs font-normal">{sub}</span>
    </span>
  );
}

export interface RoundFeedProps {
  flockId: string;
  /** اسم القاعة للقارئ الصوتي. */
  hall: string;
  items: readonly FeedItem[];
  lastItemId: string | null;
  /** يوم الجولة: يوم الإرسال. */
  today: Day;
  online: boolean;
  stamp: Stamp | null;
  /** بعد كلّ إرسال حُفظ بجوابه: الجولة تعرضه فوق قراءتها (حتى تصل قراءة بعده) وتُقرأ من جديد. */
  onSent: (sent: FeedSent) => void;
}

/** علامة المختار (بطاقة العلف ورقيقة الوحدة) مع إطاره في round.css: اللون وحده كان 1.18:1 (مراجعة 0036). SVG هنا: الأيقونة المشتركة تفصل حزمة. */
function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="round-check" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** حدّ صامت: خطأ رسم في إرسال العلف يقول ذلك ولا يُسقط الجولة. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p className="text-sm text-ink-muted">{t('round.feed.broken', 'تعذّر عرض إرسال العلف؛ أعد فتح الجولة.')}</p> : this.props.children;
  }
}

export default function RoundFeed(props: RoundFeedProps) {
  return (
    <Quiet>
      <RoundFeedView {...props} />
    </Quiet>
  );
}

function RoundFeedView({ flockId, hall, items, lastItemId, today, online, stamp, onSent }: RoundFeedProps) {
  const id = useId();
  const feed = useFeedSend(feedPendingKey(stamp, flockId), onSent);
  // العلف المختار باسمه: بلمسة بطاقته، أو المختار مسبقاً حين تُكتب الكمية عليه.
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const found = chosen ? (items.find((entry) => entry.itemId === chosen.id) ?? null) : null;
  // المختار خرج من «رصيد العلف» (أُرسل كلّه أو أُرشف) والكمية مكتوبة: لا يُستبدل به علف آخر بصمت (مراجعة 0036 R1) — «أرسل» مقفول والكمية باقية
  // حتى يُختار علف. وبلا كمية: آخر علف للقاعة، وإلّا الأوّل، كما عند الفتح.
  const gone = chosen !== null && found === null && value.trim() !== '' ? chosen : null;
  const item = gone ? null : (found ?? items.find((entry) => entry.itemId === lastItemId) ?? items[0] ?? null);
  const choices = unitChoices(item);
  const choice = choices.find((entry) => entry.value === unitId) ?? choices[0] ?? null;
  const typed = value.trim() === '' ? null : parseDecimal(value, 3);
  const bad = value.trim() !== '' && (typed === null || typed.units <= 0n);
  const qty = typed && choice && typed.units > 0n ? toBaseQty(toScale(typed, 3), choice.unit) : null;
  // أكثر ممّا يأخذه إرسال واحد (أكبر مخزن علف واحد فيه المادّة): يُقال وهو يُكتب، و«أرسل» مقفول وسببه في سطره الثاني.
  const over = item !== null && qty !== null && qty > item.onHand;
  const ready = online && !feed.busy && item !== null && qty !== null && !over;
  useDirtyForm(value.trim() !== '' || feed.frozen !== null || feed.busy);

  const go = async () => {
    if (!ready || !item || qty === null) return;
    const sent = value;
    const done = await feed.send({ clientRef: crypto.randomUUID(), issueId: crypto.randomUUID(), lineId: crypto.randomUUID(), flockId, itemId: item.itemId, qty, forDay: today, itemName: item.name, baseUnit: item.baseUnit });
    // يُفرغ ما أُرسل وحده: ما كُتب والإرسال في الطريق (الخانة مفتوحة) يبقى للإرسال التالي (مراجعة 0036 R11).
    if (done) setValue((now) => (now === sent ? '' : now));
  };

  const frozen = feed.frozen;
  const error = feed.error ? (
    <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="round-feed-error">
      {feed.error}
    </p>
  ) : null;
  if (frozen) {
    return (
      <div className="flex flex-col gap-3" data-action="round-feed-pending">
        <Notice tone="warning" title={t('sheet.feed.pending', 'علف يوم {day} لم يُعرف مصيره: أعد المحاولة.', { day: fmtDay(frozen.forDay) })}>
          {t('sheet.feed.pending_body', '{amount} من «{item}». لن يُصرف مرّتين، ولا يُرسل علف غيره حتى يُعرف مصيره.', { amount: feedAmount(frozen.qty, frozen.baseUnit), item: frozen.itemName })}
        </Notice>
        {/* الطلب المجمَّد يُعاد ولو كان ليوم آخر (من ورقة القاعة): جوابه وحده يحسمه، وهو مسمّى بيومه. */}
        <Button size="lg" className="w-full" busy={feed.busy} disabled={!online} onClick={() => void feed.send(frozen)} data-action="round-feed-retry">
          <TwoLines
            main={t('sheet.feed.retry', 'أعد المحاولة')}
            sub={t('sheet.feed.retry_what', 'علف يوم {day}: {amount} من «{item}»', { day: fmtDay(frozen.forDay), amount: feedAmount(frozen.qty, frozen.baseUnit), item: frozen.itemName })}
          />
        </Button>
        {error}
      </div>
    );
  }
  if (items.length === 0) return <Notice tone="info" title={t('sheet.feed.no_items', 'لا علف في «رصيد العلف» الآن.')} />;
  return (
    <>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('round.feed.items', 'علف «{hall}»', { hall })}>
        {items.map((entry) => {
          const selected = entry.itemId === item?.itemId;
          return (
            <button
              key={entry.itemId}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setChosen({ id: entry.itemId, name: entry.name });
                setUnitId(null);
              }}
              className={`round-pick flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-start ${selected ? 'border-line-strong bg-surface-3 shadow-card' : 'border-line bg-surface-1 hover:bg-surface-2'}`}
              data-action="round-feed-item"
              data-item={entry.itemId}
            >
              {selected ? <CheckMark /> : null}
              <span className="font-semibold">{entry.name}</span>
              <span className="text-xs text-ink-muted">{onHandText(entry.onHand, entry.baseUnit)}</span>
            </button>
          );
        })}
      </div>
      {choices.length > 1 ? (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('sheet.feed.unit', 'الوحدة')}>
          {choices.map((entry) => {
            const selected = entry.value === choice?.value;
            return (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setUnitId(entry.value)}
                className={`round-pick flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-center font-semibold ${selected ? 'border-line-strong bg-surface-3 shadow-card' : 'border-line bg-surface-1 hover:bg-surface-2'}`}
                data-action="round-feed-unit"
              >
                {selected ? <CheckMark /> : null}
                {entry.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${id}-feedQty`} className="text-sm font-medium">
          {choice ? t('round.feed.qty', 'الكمية ({unit})', { unit: choice.label }) : t('round.feed.qty_bare', 'الكمية')}
        </label>
        <input
          id={`${id}-feedQty`}
          className="input tabular-nums"
          dir="ltr"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={bad || over || undefined}
          value={value}
          onChange={(event) => {
            // الكمية تُكتب على العلف المختار الظاهر، فيُثبَّت اختياره (لا يتبدّل بعدها بقراءة جديدة).
            if (!found && item) setChosen({ id: item.itemId, name: item.name });
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter يرسل كنافذة الورقة (لوحة الحاسوب)، وما دام المكتوب لا يُرسل فلا شيء.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void go();
          }}
          data-action="round-feed-qty"
        />
        {qty !== null && choice?.unit && item ? (
          <p className="text-sm text-ink-muted" data-action="round-feed-base">
            {t('sheet.feed.base', '= {qty} {unit}', { qty: fmtMilli(qty), unit: unitName(item.baseUnit) })}
          </p>
        ) : null}
        {bad ? (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="round-feed-bad">
            {t('round.error.bad_amount', 'اكتب كمية صحيحة بثلاث مراتب عشرية على الأكثر، مثل 1250.5.')}
          </p>
        ) : null}
        {over && item ? (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="round-feed-over">
            {t('sheet.feed.short', 'أكثر ما يُرسل من «{item}» مرّة واحدة {have}.', { item: item.name, have: feedAmount(item.onHand, item.baseUnit) })}
          </p>
        ) : null}
        {gone ? (
          <p role="alert" className="text-sm text-warn-800 dark:text-warn-200" data-action="round-feed-gone">
            {t('round.feed.gone', '«{item}» لم يعد في «رصيد العلف»: اختر علفاً لترسل الكمية المكتوبة.', { item: gone.name })}
          </p>
        ) : null}
      </div>
      {online ? null : (
        <p className="text-sm text-ink-muted" data-action="round-feed-offline">
          {t('sheet.feed.offline', 'إرسال العلف يحتاج اتصالاً بالإنترنت: يخرج من «رصيد العلف» لحظة الإرسال. أرسله حين يعود الاتصال.')}
        </p>
      )}
      <Button size="lg" className="w-full" busy={feed.busy} disabled={!ready} onClick={() => void go()} data-action="round-feed-send">
        {qty !== null && item ? (
          <TwoLines
            main={t('sheet.feed.send_amount', 'أرسل {amount}', { amount: feedAmount(qty, item.baseUnit) })}
            sub={over ? t('sheet.feed.send_over', 'أكثر ممّا عندك: {have}', { have: feedAmount(item.onHand, item.baseUnit) }) : t('sheet.feed.send_item', 'من «{item}»', { item: item.name })}
          />
        ) : (
          t('sheet.feed.send', 'أرسل')
        )}
      </Button>
      {error}
    </>
  );
}
