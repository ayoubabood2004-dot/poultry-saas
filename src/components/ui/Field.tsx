import type { ReactNode } from 'react';

export interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

/** حقل بعنوانه وتلميحه وخطئه. الخطأ يحلّ محلّ التلميح ويعلن نفسه للقارئ الصوتي. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
