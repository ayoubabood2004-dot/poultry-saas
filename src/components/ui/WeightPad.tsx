import { Delete } from 'lucide-react';
import { fmtTypedNumber } from '../../lib/format';
import { t } from '../../lib/i18n';
import { sound } from '../../lib/sound';

// لوحة الوزن للواقف بالمخزن بإيد وحدة: مفاتيح ≥ 56px بلا <input> (ما تطلع لوحة مفاتيح النظام)،
// والوزن بالكيلو بمفتاح فاصلة صريح: 1-3-4 تنقرا 134 كغم، مو 0.134 (ماكو إدخال بالغرامات).
// «امسح الكل» مفتاح ظاهر: الضغطة الطويلة (contextmenu) ما تنطلق بسفاري الآيفون، فهناك كان المسح ١١ ضغطة.

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'back'] as const;
type Key = (typeof KEYS)[number];

const MAX_WHOLE_DIGITS = 7;

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

export interface WeightPadProps {
  value: string;
  onChange: (next: string) => void;
  unitLabel?: string;
  maxDecimals?: number;
}

export function WeightPad({ value, onChange, unitLabel, maxDecimals = 3 }: WeightPadProps) {
  const press = (key: Key | 'clear') => {
    sound.click();
    onChange(applyWeightKey(value, key, maxDecimals));
  };
  return (
    <div className="flex flex-col gap-3">
      <output
        aria-live="polite"
        className="flex min-h-[4rem] items-baseline justify-center gap-2 rounded-3xl border border-line bg-surface-2 px-4 py-3"
      >
        <span dir="ltr" className="text-4xl font-semibold tabular-nums">
          {fmtTypedNumber(value)}
        </span>
        <span className="text-lg text-ink-muted">{unitLabel ?? t('unit.kg', 'كغم')}</span>
      </output>
      <div dir="ltr" className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === 'back' ? t('weight_pad.back', 'احذف رقماً') : key === '.' ? t('weight_pad.point', 'فاصلة عشرية') : key}
            className="flex h-14 min-h-[56px] items-center justify-center rounded-2xl border border-line bg-surface-1 text-2xl font-semibold tabular-nums shadow-card active:bg-surface-3"
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
