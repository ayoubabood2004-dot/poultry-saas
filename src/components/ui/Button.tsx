import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { sound } from '../../lib/sound';

// الأزرار بيضاوية بثلاث ارتفاعات: صغير h-9، عادي h-11، كبير h-13 (3.25rem، مضاف للسلّم بالإعداد).
// كل زرّ حاسم ياخذ data-action حتى تسوقه فحوص Playwright.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-soft hover:bg-brand-700 active:bg-brand-800 dark:bg-brand-500 dark:hover:bg-brand-400',
  secondary: 'border border-line-strong bg-surface-1 text-ink hover:bg-surface-2 active:bg-surface-3',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  danger: 'bg-danger-600 text-white shadow-soft hover:bg-danger-700 active:bg-danger-800',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-4 text-sm',
  md: 'h-11 gap-2 px-5 text-base',
  lg: 'h-13 gap-2.5 px-6 text-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, busy = false, className = '', children, onClick, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={(event) => {
        sound.click();
        onClick?.(event);
      }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {busy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** وصف الزرّ للقارئ الصوتي، من t(). */
  label: string;
  children: ReactNode;
}

/** زرّ أيقونة 2.75rem (44px). */
export function IconButton({ label, children, className = '', onClick, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      onClick={(event) => {
        sound.click();
        onClick?.(event);
      }}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-3 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
