import { Bean, Box, EggFried, Feather, FlaskConical, Fuel, Package, Pill, Shapes, TestTubeDiagonal, Wrench, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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

/**
 * لوحة المفاتيح الحقيقية في القيمة المركَّزة (أساس المراجعة الثالثة): اللوحة تأخذ مفاتيح الجهاز ما دامت قيمتها مركَّزة وحدها، وكلّ مفتاح يُطبَّق فوراً
 * (لا إمساك ولا حساب لسرعة الكتابة: مسك الصفر يكتب أصفاراً، وEsc بعد رقم لا يُسقطه)، وEnter «تم» هنا وحده. وما سوى ذلك (التركيز في غيرها) يذهب إلى موجّه
 * الشاشة في SaleCheckout: الماسح لا يكتب في لوحة أبداً.
 */
export function padKeyDown(event: ReactKeyboardEvent<HTMLElement>, decimals: number, press: (keys: PadKey[]) => void, done: () => void): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    done();
    return;
  }
  const key = padKeyOf(event.key, decimals);
  if (key === null) {
    // حرف لا يُكتب في رقم (حرف أو فاصلة): يُبلع هنا فلا يصير مسحاً ولا بحثاً.
    if (event.key.length === 1 && event.key !== ' ') {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  press([key]);
}

/** لمسة لا تنقل التركيز (اللمس على الشاشة لا يترك زرّاً مركَّزاً يعيد Enter ضغطه، ولا قيمة مركَّزة يكتب فيها الماسح، T1/T3). */
export const keepFocus = (event: { preventDefault: () => void; pointerType?: string }): void => {
  event.preventDefault();
};

/** النقرة من لوحة المفاتيح (Enter أو Space على زرّ): detail = 0؛ ومن اللمس أو الفأرة: عدد النقرات. */
export const fromKeyboard = (event: { detail?: number }): boolean => event.detail === 0;

/** لوحة أرقام التطبيق: 3×4 مفاتيح 56 بكسل، والصفّ الأخير «.» أو «000» ثمّ 0 ثمّ الحذف. مفاتيحها لا تأخذ التركيز. */
export function Keypad({ decimals, money = false, onKeys, label }: { decimals: number; money?: boolean; onKeys: (keys: PadKey[]) => void; label: string }) {
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
          onClick={() => {
            sound.click();
            onKeys([key]);
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
      if (event.key !== 'Escape' || !isTopModal(panel) || lockedRef.current) return;
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
