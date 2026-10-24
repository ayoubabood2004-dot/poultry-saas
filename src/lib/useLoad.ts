import { useCallback, useEffect, useState } from 'react';

// قراءة ينبني عليها قرار: الفاشل مو فارغ. data تبقى null لحد قراءة ناجحة كاملة،
// والشاشة تعرض «ماكو» بس بعدها، وعلى الفشل LoadFailed بزرّ «أعد المحاولة».

export interface LoadState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  retry: () => void;
}

/** load لازم تكون ثابتة (دالّة من lib/repo مو سهم جديد بكل رسم)، وkey يبدّل القراءة لما يتغيّر. */
export function useLoad<T>(load: () => Promise<T>, key = ''): LoadState<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ token: string; data: T | null; error: unknown } | null>(null);
  const token = `${key}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setResult({ token, data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ token, data: null, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, token]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result?.token === token ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: current === null, retry };
}
