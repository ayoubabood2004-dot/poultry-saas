import { sound } from '../../lib/sound';

export interface SwitchProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ id, label, description, checked, onChange }: SwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description ? <span className="block text-sm text-ink-muted">{description}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          sound.click();
          onChange(!checked);
        }}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors ${
          checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-surface-3'
        }`}
      >
        <span
          aria-hidden="true"
          className={`size-6 rounded-full bg-white shadow-card transition-transform ${checked ? 'ltr:translate-x-6 rtl:-translate-x-6' : ''}`}
        />
      </button>
    </div>
  );
}
