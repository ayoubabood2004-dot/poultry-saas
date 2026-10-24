import { useId } from 'react';

const EGG = 'M50 20C64 20 75 40 75 56C75 71 64 82 50 82C36 82 25 71 25 56C25 40 36 20 50 20Z';

/** الشعار نفسه اللي بشاشة الإقلاع وبالأيقونات: بيضة تنفقس على مربّع بلون العلامة. */
export function Logo({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b7bee" />
          <stop offset="1" stopColor="#0f5cc6" />
        </linearGradient>
        <clipPath id={`${id}-egg`}>
          <path d={EGG} />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${id}-bg)`} />
      <path d={EGG} fill="#ffffff" />
      <path
        d="M22 51L33 44L41 52L50 43L59 52L67 44L78 51"
        fill="none"
        stroke="#1266d8"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
        clipPath={`url(#${id}-egg)`}
      />
    </svg>
  );
}
