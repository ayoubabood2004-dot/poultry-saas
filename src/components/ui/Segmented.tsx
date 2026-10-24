import type { LucideIcon } from 'lucide-react';
import { sound } from '../../lib/sound';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line bg-surface-2 p-1">
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => {
        const selected = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              sound.click();
              onChange(optionValue);
            }}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors ${
              selected ? 'bg-surface-1 text-ink shadow-card' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}
