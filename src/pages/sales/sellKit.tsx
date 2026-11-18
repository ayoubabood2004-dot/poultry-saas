import { Bean, Box, EggFried, Feather, FlaskConical, Fuel, Package, Pill, Shapes, TestTubeDiagonal, Wrench, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ItemKind } from '../../domain/stores';
import { toWesternDigits } from '../../domain/normalize';
import { isTopModal, trapFocus } from '../../lib/focus';
import { t } from '../../lib/i18n';
import { group } from '../../lib/numerals';
import { lockScroll } from '../../lib/scrollLock';
import { sound } from '../../lib/sound';

// قطع شاشة البيع الجديدة (تصميم المبيعات §١–٤، docs/SALES_UX_PLAN.md): الورقة السفلية (تُغلق بالسحب وبالرجوع وبـEsc، والتركيز محبوس فيها ويعود حين
// تُغلق)، ولوحة أرقام التطبيق (مفاتيح 56 بكسل بلا لوحة النظام؛ منطق لوحة الوزن نفسه مع «000» للمبالغ والكتابة فوق القيمة أوّل ضغطة)، وشريط «تراجع»،
// وأيقونة النوع ولونه (هويّة لا حالة). كلّ الأنماط في sell.css (أصناف sl-، لا صنف Tailwind جديد)، والأيقونات من lucide لا تشاركها حزمة محفوظة.

// ─── لوحة الأرقام ──────────────────────────────────────────────────────────────────────────────────────────────────

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '000' | 'back' | 'clear';

/**
 * ضغطة على نصّ الرقم وهو يُكتب: fresh = القيمة المعروضة لم تُلمس بعد فتح الخانة، فأوّل رقم يحلّ محلّها (اللمس ثمّ «4» = 4 لا 14)، والحذف يحذف آخرها.
 * الكسر بمراتبه (maxDecimals، صفر = بلا فاصلة)، و«000» للمبالغ (الدينار بالآلاف)، والجزء الصحيح بحدّه. دالّة صافية تُفحص بلا متصفّح.
 */
export function applyPadKey(current: string, key: PadKey, maxDecimals: number, fresh = false, maxWhole = 9): string {
  if (key === 'clear') return '';
  if (key === 'back') return current.slice(0, -1);
  const base = fresh ? '' : current;
  const [whole = '', fraction] = base.split('.');
  if (key === '.') {
    if (maxDecimals === 0 || fraction !== undefined) return base;
    return whole === '' ? '0.' : `${whole}.`;
  }
  if (fraction !== undefined) {
    if (key === '000') return base;
    return fraction.length >= maxDecimals ? base : `${base}${key}`;
  }
  if (key === '000') {
    if (whole === '' || whole === '0' || whole.length + 3 > maxWhole) return base;
    return `${whole}000`;
  }
  if (whole === '0') return key;
  if (whole.length >= maxWhole) return base;
  return `${base}${key}`;
}

/** الرقم وهو يُكتب بفواصل الآلاف على جزئه الصحيح والكسر كما كُتب («12.» تبقى «12.»)؛ للعرض وحده. */
export function typedText(value: string): string {
  if (value === '') return '0';
  const [whole = '', fraction] = value.split('.');
  return fraction === undefined ? group(whole) : `${group(whole)}.${fraction}`;
}

/** أيقونة «احذف رقماً» (مسار lucide «delete» مضمَّناً: أيقونتها في حزمة القاعات، والمشتركة بين الحزمتين تدخل التثبيت المسبق). */
function BackspaceIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="sl-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      <path d="m12 9 6 6" />
      <path d="m18 9-6 6" />
    </svg>
  );
}

/**
 * عربة التسوّق (مسار lucide «shopping-cart» مضمَّناً، أيقونة «بِع» في الرئيسية، D21): استيرادها من lucide يجعلها مشتركة مع حزمة الرئيسية فتنتقل إلى
 * حزمة مشتركة في التثبيت المسبق.
 */
export function CartIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18" />
      <path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25" />
      <circle cx="18" cy="20" r="2" />
      <circle cx="8" cy="20" r="2" />
    </svg>
  );
}

const DIGITS: readonly PadKey[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

/**
 * مفتاح لوحة المفاتيح الحقيقية بمفتاح اللوحة، والقيمة مركَّزة (padKeyDown): الأرقام (والهندية منها)، والنقطة العشرية «.» و«٫»، والحذف، وDelete للمسح.
 * وغيرها null، والفاصلة «,» و«٬» منها: الفاصلة تفصل الآلاف وحدها في هذا المشروع (قانون الأرقام، R1).
 */
export function padKeyOf(key: string, decimals: number): PadKey | null {
  if (key === 'Backspace') return 'back';
  if (key === 'Delete') return 'clear';
  if ((key === '.' || key === '\u{066B}') && decimals > 0) return '.'; // i18n-ok: النقطة العشرية العربية
  const digit = toWesternDigits(key);
  return /^[0-9]$/u.test(digit) ? (digit as PadKey) : null;
}

/** مفتاح من محرّر نصوص اللغات (IME، أندرويد): لا حرف فيه يُقرأ؛ لا تكتبه اللوحة ولا يجمعه الموجّه. */
export const composing = (event: { key: string; isComposing?: boolean; keyCode?: number; nativeEvent?: { isComposing?: boolean; keyCode?: number } }): boolean =>
  event.key === 'Unidentified' || event.key === 'Process' || event.isComposing === true || event.keyCode === 229 || event.nativeEvent?.isComposing === true || event.nativeEvent?.keyCode === 229;

/**
 * «دفعة» المفاتيح (المراجعة الخامسة، قاعدة واحدة للموجّه وللقيمة المركَّزة): حروف متتالية بين كلّ حرفين أقلّ من هذا. الماسح (USB 5 مللي ثانية والبلوتوث
 * 45–50) يكتب أسرع منه، والإنسان أبطأ (مفتاح كلّ 90 مللي ثانية فأكثر حتى للسريع). التكرار (مسك المفتاح) يقطع الدفعة ولا يدخلها، وEnter أو Tab بعد
 * آخر حرف بأقلّ منه ينهيها، وفجوة أطول تنهيها.
 */
export const RUN_GAP_MS = 60;
/** سكون بعد آخر حرف بلا Enter (ماسح لا يرسله): دفعة كاملة هي رمز في هذا المخزن مسحٌ. */
const SILENCE_MS = 300;
/** أقصر دفعة تُعرف مسحاً في القيمة المركَّزة (رمز بحرف أو حرفين فيها حدّ موثّق: الموجّه يعرفه خارجها). */
const RUN_MIN = 3;
/** دفعة بهذا الطول تنتهي بـEnter ولا يعرفها المخزن: ماسح قرأ رمزاً لا يُباع هنا (تُعاد القيمة ويُقال ذلك). */
const RUN_UNKNOWN = 6;

interface Run {
  /** الخانة التي بدأت فيها (السطر وتبويبه، أو مبلغ الصندوق): دفعة لا تعبر من خانة إلى أخرى. */
  target: string;
  chars: string[];
  /** القيمة قبل أوّل حرف منها: إليها تعود حين تكون الدفعة مسحاً. */
  before: string;
  last: number;
}

export interface PadKeysOptions {
  decimals: number;
  /** الخانة التي تكتبها اللوحة الآن (تبديلها يبدأ دفعة جديدة). */
  target: string;
  /** نصّ القيمة الآن (ومعه ما كُتب ولم يُرسم بعد). */
  current: () => string;
  press: (keys: PadKey[]) => void;
  /** يعيد القيمة إلى نصّ (ما قبل دفعة كانت مسحاً). */
  restore: (text: string) => void;
  done: () => void;
  /** Escape في القيمة: لوحة الدفع تُطوى وحدها (W7)؛ وبلا هذا تُغلق الورقة. */
  escape?: () => void;
  /** رمز (باركود أو رمز آخر) لمادّة في هذا المخزن؟ */
  isCode: (text: string) => boolean;
  /** المسح نفسه: تُطوى الأوراق وscanCode (يضيف، أو يقول لماذا لا). */
  onScan: (code: string) => void;
}

/**
 * مفاتيح الجهاز في القيمة المركَّزة (المراجعة الخامسة): كلّ مفتاح يُطبَّق فوراً، وتُحفظ القيمة عند أوّل حرف من كلّ دفعة (RUN_GAP_MS). دفعة من ثلاثة
 * أحرف فأكثر تنتهي بـEnter (أو Tab) بعد آخر حرف بأقلّ من RUN_GAP_MS: إن كانت كلّها رمزاً في هذا المخزن، أو ستّة أحرف فأكثر، تعود القيمة إلى ما قبلها
 * ويُمسح ما فيها؛ ودفعة كاملة هي رمز في المخزن تنتهي بسكون بلا Enter مسحٌ كذلك. وغير ذلك كتابة: Enter «تم». كتابة إنسان (بين حرفين RUN_GAP_MS
 * فأكثر) لا تُعاد أبداً، ولا يُطابَق ذيل ما كُتب (W1). وتبدأ الدفعة من جديد مع كلّ خانة وتبويب ووحدة، و«تم» و«مسح»، والتركيز داخلاً وخارجاً، وكلّ
 * لمسة مؤشّر. مفاتيح داخل القيمة (زرّ فيها) تُترك لها.
 */
export function usePadKeys(options: PadKeysOptions) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const run = useRef<Run | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const reset = () => {
    stop();
    run.current = null;
  };
  // كلّ لمسة مؤشّر (مفتاح في اللوحة، مبلغ صندوق آخر، «+ صندوق آخر») تنهي الدفعة: الماسح لا يلمس، فدفعة لا تعبر خانتين.
  useEffect(() => {
    const onPointer = () => {
      stop();
      run.current = null;
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      stop();
    };
  }, []);
  /** الدفعة الجارية على هذه الخانة بنصّها، إن كانت مسحاً (قد تحتاج رمزاً في المخزن)؛ وإلّا null. */
  const scanOf = (entry: Run | null, needCode: boolean): string | null => {
    if (!entry || entry.target !== latest.current.target || entry.chars.length < RUN_MIN) return null;
    const text = entry.chars.join('');
    if (latest.current.isCode(text)) return text;
    return !needCode && entry.chars.length >= RUN_UNKNOWN ? text : null;
  };
  const scan = (entry: Run, text: string) => {
    reset();
    latest.current.restore(entry.before);
    latest.current.onScan(text);
  };
  /** Enter أو Tab: ينهي الدفعة إن وصل بعد آخر حرف منها بأقلّ من RUN_GAP_MS؛ يرجع true إن كانت مسحاً. */
  const ended = (at: number, repeat: boolean): boolean => {
    const entry = run.current;
    const gap = entry ? at - entry.last : -1;
    const text = entry && !repeat && gap >= 0 && gap < RUN_GAP_MS ? scanOf(entry, false) : null;
    if (entry && text !== null) {
      scan(entry, text);
      return true;
    }
    reset();
    return false;
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // زرّ داخل القيمة يأخذ مفاتيحه لنفسه (V3)؛ ومحرّر اللغات لا يُقرأ.
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey || composing(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (!ended(event.timeStamp, event.repeat)) latest.current.done();
      return;
    }
    if (event.key === 'Tab') {
      // ماسح ينهي الرمز بـTab: مسحٌ كـEnter، والتركيز يبقى؛ وغيره Tab عاديّ.
      if (ended(event.timeStamp, event.repeat)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.key === 'Escape') {
      const escape = latest.current.escape;
      reset();
      if (!escape) return;
      event.preventDefault();
      event.stopPropagation();
      escape();
      return;
    }
    const { decimals, press, current, target } = latest.current;
    const key = padKeyOf(event.key, decimals);
    if (key === 'back' || key === 'clear') {
      event.preventDefault();
      event.stopPropagation();
      reset();
      press([key]);
      return;
    }
    if (event.key.length !== 1 || event.key === ' ') return;
    // حرف: يُطبَّق فوراً إن كان رقماً، ويدخل الدفعة (ولو حرفاً لا يُكتب في رقم: الرموز قد تحمل حروفاً).
    event.preventDefault();
    event.stopPropagation();
    stop();
    if (event.repeat) {
      run.current = null;
      if (key !== null) press([key]);
      return;
    }
    const entry = run.current;
    const gap = entry ? event.timeStamp - entry.last : -1;
    if (entry && entry.target === target && gap >= 0 && gap < RUN_GAP_MS) {
      entry.chars.push(event.key);
      entry.last = event.timeStamp;
    } else run.current = { target, chars: [event.key], before: current(), last: event.timeStamp };
    if (key !== null) press([key]);
    timer.current = setTimeout(() => {
      timer.current = null;
      const finished = run.current;
      const text = scanOf(finished, true);
      if (finished && text !== null) scan(finished, text);
      else run.current = null;
    }, SILENCE_MS);
  };
  return { onKeyDown, reset };
}

/** لمسة لا تنقل التركيز (اللمس على الشاشة لا يترك زرّاً مركَّزاً يعيد Enter ضغطه، ولا قيمة مركَّزة يكتب فيها الماسح، T1/T3). */
export const keepFocus = (event: { preventDefault: () => void; pointerType?: string }): void => {
  event.preventDefault();
};

/** النقرة من لوحة المفاتيح (Enter أو Space على زرّ): detail = 0؛ ومن اللمس أو الفأرة: عدد النقرات. */
export const fromKeyboard = (event: { detail?: number }): boolean => event.detail === 0;

/**
 * فتحٌ يركّز القيمة لتأخذ مفاتيح الجهاز: من لوحة المفاتيح، أو بالفأرة (مؤشّر دقيق، V2)؛ لا باللمس ولا بالقلم (فلا يكتب فيها ماسح الهاتف). النقرة في
 * كروم PointerEvent بنوع مؤشّرها، وفي غيره يُسأل الجهاز عن مؤشّره الأوّل.
 */
export function focusesValue(event: { detail?: number; nativeEvent?: unknown }): boolean {
  if (fromKeyboard(event)) return true;
  const kind = (event.nativeEvent as { pointerType?: unknown } | undefined)?.pointerType;
  if (kind === 'mouse') return true;
  if (kind === 'touch' || kind === 'pen') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

/** لوحة أرقام التطبيق: 3×4 مفاتيح 56 بكسل، والصفّ الأخير «.» أو «000» ثمّ 0 ثمّ الحذف. مفاتيحها لا تأخذ التركيز. */
export function Keypad({
  decimals,
  money = false,
  onKeys,
  onUse,
  label,
}: {
  decimals: number;
  money?: boolean;
  onKeys: (keys: PadKey[]) => void;
  /** النقرة نفسها (فأرة: القيمة تُركَّز فيكون Enter بعدها «تم»، V2). */
  onUse?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  label: string;
}) {
  const keys: PadKey[] = [...DIGITS, money ? '000' : '.', '0', 'back'];
  return (
    <div className="sl-pad" dir="ltr" role="group" aria-label={label} data-action="sale-pad">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="sl-key"
          data-action="key"
          data-key={key}
          disabled={key === '.' && decimals === 0}
          aria-label={key === 'back' ? t('weight_pad.back', 'احذف رقماً') : key === '.' ? t('weight_pad.point', 'فاصلة عشرية') : key === '000' ? t('sell.pad.thousands', 'ثلاثة أصفار') : key}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={(event) => {
            sound.click();
            onKeys([key]);
            onUse?.(event);
          }}
        >
          {key === 'back' ? <BackspaceIcon /> : key}
        </button>
      ))}
    </div>
  );
}

// ─── الورقة السفلية ────────────────────────────────────────────────────────────────────────────────────────────────

export interface SheetProps {
  title: string;
  /** طلب الإغلاق (السحب، والزرّ، وEsc، والنقر خارجها): الأب يرجع خطوة في التاريخ. */
  onClose: () => void;
  /** ترتيبها في الكومة (0 الأولى): الأعلى فوق التي تحتها. */
  level: number;
  /** أثناء الحفظ: لا إغلاق. */
  locked?: boolean;
  /** tall: ارتفاع ثابت ~70٪ (السلّة)، وغيرها بقدر محتواها حتى 92٪. */
  size?: 'fit' | 'tall';
  action: string;
  subtitle?: ReactNode;
  /** فعل في رأس الورقة قبل زرّ الإغلاق («احذف السطر»). */
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** ورقة سفلية بعنوانها: مقبض سحب، وزرّ إغلاق 48 بكسل، ومحتوى يتمرّر، وذيل ثابت (زرّ الخطوة التالية). */
export function Sheet({ title, onClose, level, locked = false, size = 'fit', action, subtitle, aside, footer, children }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; dy: number; at: number } | null>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  useEffect(() => {
    closeRef.current = onClose;
    lockedRef.current = locked;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const unlock = lockScroll();
    const release = trapFocus(panel);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopModal(panel) || lockedRef.current) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      release();
      unlock();
    };
  }, []);

  const request = () => {
    if (!locked) onClose();
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag.current = { start: event.clientY, dy: 0, at: event.timeStamp };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const panel = panelRef.current;
    if (panel) panel.dataset.dragging = 'yes';
  };
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    const panel = panelRef.current;
    if (!state || !panel) return;
    state.dy = Math.max(0, event.clientY - state.start);
    panel.style.setProperty('--sl-drag', `${state.dy}px`);
  };
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!state || !panel) return;
    const flick = state.dy > 48 && event.timeStamp - state.at < 260;
    delete panel.dataset.dragging;
    if (state.dy > Math.min(160, panel.offsetHeight * 0.3) || flick) {
      onClose();
      return;
    }
    panel.style.setProperty('--sl-drag', '0px');
  };

  return createPortal(
    <div className="sl-sheet-root" data-level={level} style={{ zIndex: 34 + level }}>
      <div aria-hidden="true" className="sl-backdrop" onClick={request} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={locked || undefined}
        tabIndex={-1}
        className="sl-sheet"
        data-size={size}
        data-action={action}
      >
        <div className="sl-sheet-drag" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <span aria-hidden="true" className="sl-grip" />
          <div className="sl-sheet-head">
            <div className="sl-sheet-titles">
              <h2 id={titleId} className="sl-sheet-title">
                {title}
              </h2>
              {subtitle ? <div className="sl-sheet-sub">{subtitle}</div> : null}
            </div>
            {aside ? (
              <div className="sl-sheet-aside" onPointerDown={(event) => event.stopPropagation()}>
                {aside}
              </div>
            ) : null}
            <button
              type="button"
              className="sl-round"
              aria-label={t('sell.sheet.close', 'أغلق')}
              title={t('sell.sheet.close', 'أغلق')}
              disabled={locked}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                sound.click();
                request();
              }}
              data-action="sheet-close"
            >
              <X aria-hidden="true" className="sl-icon" />
            </button>
          </div>
        </div>
        <div className="sl-sheet-body" data-sheet-body>
          {children}
        </div>
        {footer ? <div className="sl-sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

// ─── شريط «تراجع» ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface Snack {
  id: number;
  text: string;
  /** بلا «تراجع»: تنبيه قصير لا يُتراجع عنه (مادّة لا يكفي متاحها لوحدة كاملة). */
  undo?: () => void;
}

/** ستّ ثوانٍ فوق الشريط الثابت: ما حُذف وزرّ «تراجع» (لا تأكيد قبل الحذف). */
export const SNACK_MS = 6000;

/** over: ورقة مفتوحة، فالشريط أعلى الشاشة فوق خلفيتها لا فوق لوحة أرقامها وزرّها (مراجعة التصميم D6). */
export function Snackbar({ snack, onUndo, over = false }: { snack: Snack; onUndo: () => void; over?: boolean }) {
  return createPortal(
    <div className="sl-snack" role="status" data-place={over ? 'top' : undefined} data-action="sell-snack">
      <span className="sl-snack-text">{snack.text}</span>
      {snack.undo ? (
        <button
          type="button"
          className="sl-snack-undo"
          onClick={() => {
            sound.click();
            onUndo();
          }}
          data-action="sell-undo"
        >
          {t('sell.undo', 'تراجع')}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

// ─── النوع: لونه وأيقونته واسمه في الشرائح ───────────────────────────────────────────────────────────────────────────

const KIND_ICONS: Readonly<Record<ItemKind, LucideIcon>> = {
  raw: Bean,
  additive: FlaskConical,
  feed: Package,
  medicine: Pill,
  vaccine: TestTubeDiagonal,
  fuel: Fuel,
  packaging: Box,
  hatching_egg: EggFried,
  chick: Feather,
  table_egg: EggFried,
  equipment: Wrench,
  other: Shapes,
};

/** أيقونة النوع في مربّع بلونه (data-kind في sell.css). */
export function KindMark({ kind }: { kind: ItemKind }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span className="sl-kind" data-kind={kind} aria-hidden="true">
      <Icon className="sl-icon" />
    </span>
  );
}

/** اسم النوع جمعاً لشرائح التصفية («أدوية»، «لقاحات»). */
export function kindChipLabel(kind: ItemKind): string {
  switch (kind) {
    case 'raw':
      return t('sell.kind.raw', 'موادّ أوّلية');
    case 'additive':
      return t('sell.kind.additive', 'إضافات');
    case 'feed':
      return t('sell.kind.feed', 'علف');
    case 'medicine':
      return t('sell.kind.medicine', 'أدوية');
    case 'vaccine':
      return t('sell.kind.vaccine', 'لقاحات');
    case 'fuel':
      return t('sell.kind.fuel', 'وقود');
    case 'packaging':
      return t('sell.kind.packaging', 'تعبئة');
    case 'hatching_egg':
      return t('sell.kind.hatching_egg', 'بيض تفقيس');
    case 'chick':
      return t('sell.kind.chick', 'أفراخ');
    case 'table_egg':
      return t('sell.kind.table_egg', 'بيض مائدة');
    case 'equipment':
      return t('sell.kind.equipment', 'معدّات');
    case 'other':
      return t('sell.kind.other', 'أخرى');
  }
}

export { shortUnit } from './sellModel';
