import { CircleDashed } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../lib/i18n';
import { PageHeader } from './PageHeader';

/** صفحة وحدة ما انبنت بعد: تكول بأي مرحلة تنبني وشنو بيها، بلا أرقام مخترعة. children: شكل فارغ بلا بيانات. */
export function PlannedPage({ title, phase, items, children }: { title: string; phase: number; items: readonly string[]; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} subtitle={t('planned.subtitle', 'تُبنى في المرحلة {phase} من خطّة البناء.', { phase })} />
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CircleDashed aria-hidden="true" className="size-5 text-ink-subtle" />
          {t('planned.what', 'ما الذي سيكون هنا')}
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 ps-6 text-ink-muted">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {children}
    </div>
  );
}
