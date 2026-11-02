import type { ReactNode } from 'react';

// شريط أرقام: بطاقة صغيرة لكلّ رقم فوق الشاشة (كلمة المالك 2026-11-02: «واريد الاشكال تشابه شكل دكتور فيت»). الرقم نفسه
// من منسّقات format.ts (numbers-guard يرفض الرقم الخام)، وهذا المكوّن تخطيط فقط: لا يحسب ولا ينسّق.

export interface Stat {
  key: string;
  label: string;
  value: ReactNode;
}

export function StatStrip({ stats }: { stats: readonly Stat[] }) {
  if (!stats.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.key} className="card p-3">
          <dt className="text-xs text-ink-muted">{stat.label}</dt>
          <dd className="text-lg font-semibold">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
