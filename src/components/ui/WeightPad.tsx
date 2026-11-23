import { useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { t } from '../../lib/i18n';
import { isTopModal } from '../../lib/focus';
import { group } from '../../lib/numerals';
import { sound } from '../../lib/sound';

// لوحة الوزن للواقف بالمخزن بإيد وحدة: مفاتيح ≥ 56px بلا <input> (ما تطلع لوحة مفاتيح النظام)،
// والوزن بالكيلو بمفتاح فاصلة صريح: 1-3-4 تنقرا 134 كغم، مو 0.134 (ماكو إدخال بالغرامات).
// «امسح الكل» مفتاح ظاهر: الضغطة الطويلة (contextmenu) ما تنطلق بسفاري الآيفون، فهناك كان المسح ١١ ضغطة.
// ولوحة مفاتيح الحاسوب تكتب فيها فور فتح النافذة (كلمة المالك 2026-11-23: «الكيبورد ابد ما يدوس اي ارقام»): الأرقام الغربية والعربية والفاصلة
// والمسح، وEnter يحفظ؛ والرقم المحدَّد (لمسة عليه، أو قيمة سابقة عند الفتح) تستبدله أوّل ضغطة كلّه، كخانة محدَّدة.

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'back'] as const;
type Key = (typeof KEYS)[number];
type Digit = Exclude<Key, '.' | 'back'>;

const MAX_WHOLE_DIGITS = 7;

/**
 * الوزن وهو يُكتب: فواصل الآلاف على الجزء الصحيح والكسر كما كُتب («12.» تبقى «12.»)، كـfmtTypedNumber في format.ts حرفاً بأساس التجميع نفسه (numerals).
 * هنا لا استيراداً منه: اللوحة في حزم كسولة خارج التثبيت المسبق (تذكرة الوزن، 0028)، واستيراده يُدخل دالّةً محذوفة من حزمة المنسّقات المحفوظة فيكبّرها
 * (108 بايتات من هامش التثبيت المسبق). وweight-pad.test يقارن العرض بقيم fmtTypedNumber نفسها.
 */
function typedText(value: string): string {
  if (value === '') return '0';
  const [whole = '', fraction] = value.split('.');
  return fraction === undefined ? group(whole) : `${group(whole)}.${fraction}`;
}

/** يطبّق ضغطة على نصّ الوزن. دالّة صافية حتى تنفحص بلا متصفّح. */
export function applyWeightKey(current: string, key: Key | 'clear', maxDecimals = 3): string {
  if (key === 'clear') return '';
  if (key === 'back') return current.slice(0, -1);
  if (key === '.') {
    if (maxDecimals === 0 || current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  const [whole = '', fraction] = current.split('.');
  if (fraction !== undefined) return fraction.length >= maxDecimals ? current : `${current}${key}`;
  if (whole === '0') return key;
  if (whole.length >= MAX_WHOLE_DIGITS) return current;
  return `${current}${key}`;
}

/**
 * ضغطة على الرقم المحدَّد: الرقم والفاصلة يبدآن القيمة من جديد (تُستبدل كلّها)، والمسح يفرغها، و«احذف الكل» كما هو. دالّة صافية.
 */
export function applySelectedKey(current: string, key: Key | 'clear', maxDecimals = 3): string {
  if (key === 'back' || key === 'clear') return '';
  return applyWeightKey('', key, maxDecimals);
}

/**
 * مفتاح لوحة الحاسوب إلى مفتاح اللوحة: الأرقام الغربية والعربية (٠–٩) والفارسية (۰–۹)، والنقطة والفاصلة العشرية العربية «٫» (لا الفاصلة «,»: هي فاصل
 * الآلاف في التطبيق، و«0,5» كانت تُقرأ 5)، وBackspace رقماً وDelete الكلّ وEnter الحفظ. غيرها null (يمرّ للمتصفّح). دالّة صافية.
 */
export function keyFromKeyboard(key: string): Key | 'clear' | 'enter' | null {
  if (key.length === 1) {
    const code = key.codePointAt(0) ?? 0;
    if (code >= 0x30 && code <= 0x39) return key as Digit;
    // ٠–٩ (U+0660–U+0669) و۰–۹ (U+06F0–U+06F9).
    if (code >= 0x660 && code <= 0x669) return String(code - 0x660) as Digit;
    if (code >= 0x6f0 && code <= 0x6f9) return String(code - 0x6f0) as Digit;
    if (key === '.' || code === 0x66b) return '.';
    return null;
  }
  if (key === 'Backspace') return 'back';
  if (key === 'Delete') return 'clear';
  if (key === 'Enter') return 'enter';
  return null;
}

/** عنصر يكتب فيه المستخدم بنفسه (خانة الأقفاص بجانب اللوحة، أو الملاحظة): مفاتيحه له لا للّوحة. */
const editable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

/** النافذة التي فيها اللوحة (أقرب أب role="dialog")، أو null. */
function dialogOf(node: HTMLElement): HTMLElement | null {
  for (let n: Node | null = node.parentNode; n; n = n.parentNode) {
    if (n instanceof HTMLElement && n.getAttribute('role') === 'dialog') return n;
  }
  return null;
}

export interface WeightPadProps {
  value: string;
  onChange: (next: string) => void;
  unitLabel?: string;
  maxDecimals?: number;
  /** Enter من لوحة المفاتيح: الفعل الأساسيّ للنافذة («تم» أو «أرسل» أو «اعتمد») إن كان متاحاً؛ بلاه Enter يمرّ للمتصفّح. */
  onEnter?: () => void;
}

export function WeightPad({ value, onChange, unitLabel, maxDecimals = 3, onEnter }: WeightPadProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // قيمة سابقة عند الفتح (تعديل وزن مسجَّل) محدَّدة: أوّل رقم يستبدلها كخانة تُحدَّد عند التركيز.
  const [selected, setSelected] = useState(() => value !== '');
  const marked = selected && value !== '';

  const press = (key: Key | 'clear') => {
    sound.click();
    setSelected(false);
    onChange(marked ? applySelectedKey(value, key, maxDecimals) : applyWeightKey(value, key, maxDecimals));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const root = rootRef.current;
      if (!root || editable(event.target)) return;
      // اللوحة في النافذة العليا وحدها: نافذة تأكيد فوقها تأخذ مفاتيحها، ولا تُكتب أرقام تحتها.
      const modal = dialogOf(root);
      if (modal && !isTopModal(modal)) return;
      const key = keyFromKeyboard(event.key);
      if (key === null) return;
      if (key === 'enter') {
        // Enter على زرّ آخر في النافذة (إغلاق، «ألغِ» صرف، اختيار علف) له فعل ذلك الزرّ؛ والحفظ من اللوحة نفسها أو من النافذة بلا تركيز على شيء.
        const target = event.target;
        const neutral = target === document.body || target === modal || (target instanceof HTMLElement && root.contains(target));
        if (!onEnter || !neutral) return;
        event.preventDefault();
        onEnter();
        return;
      }
      event.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div ref={rootRef} className="flex flex-col gap-3" data-action="weight-pad">
      <button
        type="button"
        data-autofocus
        data-action="weight-display"
        data-selected={marked ? 'true' : undefined}
        aria-label={t('weight_pad.display', 'الرقم المكتوب: المس لتحديده واستبداله، أو اكتب بلوحة المفاتيح')}
        onClick={() => {
          if (value !== '') setSelected(true);
          window.getSelection?.()?.removeAllRanges();
        }}
        className="flex min-h-[4rem] select-none items-baseline justify-center gap-2 rounded-3xl border border-brand-200 bg-surface-2 px-4 py-3 dark:border-brand-500/30"
      >
        <output aria-live="polite" className="flex items-baseline gap-2">
          <span dir="ltr" className={`text-4xl font-semibold tabular-nums ${marked ? 'rounded-lg bg-brand-50 px-1 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : ''}`}>
            {typedText(value)}
          </span>
          <span className="text-lg text-ink-muted">{unitLabel ?? t('unit.kg', 'كغم')}</span>
        </output>
      </button>
      <div dir="ltr" className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={key === '.' && maxDecimals === 0}
            aria-label={key === 'back' ? t('weight_pad.back', 'احذف رقماً') : key === '.' ? t('weight_pad.point', 'فاصلة عشرية') : key}
            className="flex h-14 min-h-[56px] items-center justify-center rounded-2xl border border-line bg-surface-1 text-2xl font-semibold tabular-nums shadow-card active:bg-surface-3 disabled:opacity-50"
          >
            {key === 'back' ? <Delete aria-hidden="true" className="size-6" /> : key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => press('clear')}
          disabled={value === ''}
          data-action="weight-clear"
          className="col-span-3 flex h-14 min-h-[56px] items-center justify-center rounded-2xl border border-line bg-surface-2 text-lg font-semibold text-ink-muted active:bg-surface-3 disabled:opacity-50"
        >
          {t('weight_pad.clear', 'احذف الكل')}
        </button>
      </div>
    </div>
  );
}
