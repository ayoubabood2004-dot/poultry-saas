import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Num } from '../../components/ui/DataTable';
import { localDay, type Day } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { fmtCounted, fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { AGING_BUCKETS, type Aging, type AgingBucket } from '../../lib/repo/statement';

// أوراق الحسابات المطبوعة وقطعها المشتركة (عقد 0024: قائمة الذمم والكشف الاحترافي والسندات): الطباعة بعنوان الورقة، وقياس الصفحة
// بـ@page للصفحة المفتوحة وحدها (الكشف A4 بترقيم «صفحة س من ص»، والسند A5)، وطريق الرجوع من الرابط، وألوان أعمار الديون. الأصناف
// الجديدة (الألوان والتواقيع والختم) في papers.css الكسول يستورده AccountsRoutes مع print.css، لا أصناف Tailwind جديدة: CSS الإقلاع محفوظ بسقفه.

/** اطبع بعنوان الورقة (اسم ملفّ PDF المقترح)، ثمّ يعود عنوان الصفحة بعد الطباعة (نمط تقرير العليقة). */
export function printAs(title: string): void {
  const before = document.title;
  const restore = () => {
    document.title = before;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  document.title = title;
  window.print();
}

/** نصّ CSS آمن داخل content: "…" (بلا علامات تنصيص ولا شرطة مائلة عكسية تكسر القاعدة). */
const cssText = (text: string): string => `"${text.replace(/["\\\n]/g, ' ')}"`;

/**
 * «صفحة {page} من {pages}» من t() إلى content لمربّع هامش الصفحة: النصّ بين علامتي تنصيص والعدّادان counter(page) وcounter(pages).
 * المربّعات (@bottom-center) لا ترث متغيّرات الصفحة، فالنصّ يُكتب في القاعدة نفسها من المكوّن.
 */
export function pageCounterContent(template: string): string {
  const parts: string[] = [];
  let last = 0;
  for (const match of template.matchAll(/\{(page|pages)\}/g)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(cssText(template.slice(last, index)));
    parts.push(`counter(${match[1]})`);
    last = index + match[0].length;
  }
  if (last < template.length) parts.push(cssText(template.slice(last)));
  return parts.join(' ');
}

/**
 * قياس الورقة للصفحة المفتوحة وحدها (القاعدة تُرسم مع الصفحة وتزول معها، فطباعة صفحة أخرى بعدها بقياسها): الكشف A4 عمودياً بترقيم
 * الصفحات أسفلها، والسند A5.
 */
export function PageStyle({ size }: { size: 'A4' | 'A5' }) {
  const numbers = pageCounterContent(t('paper.page_of', 'صفحة {page} من {pages}'));
  const css =
    size === 'A4'
      ? `@page { size: A4 portrait; margin: 12mm 10mm 14mm; @bottom-center { content: ${numbers}; direction: rtl; font-size: 9pt; color: #56667e; } }`
      : '@page { size: A5 portrait; margin: 9mm; }';
  return <style data-page-style={size}>{css}</style>;
}

/** طريق الرجوع من الرابط (?back=): مسار داخليّ في الحسابات أو المبيعات وحده، وإلّا البديل. */
export function backTarget(value: string | null, fallback: string): string {
  return value !== null && /^\/(?:accounts|sales)(?:[/?][\w\-/=&%.?]*)?$/u.test(value) ? value : fallback;
}

/** رابط «رجوع إلى…» بشكل زرّ الرجوع (بلا استيراد BackButton: حزمته مشتركة بين المخزون والمعمل، واستيراده هنا يقسمها حزمة محفوظة). */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="back" data-print="hide">
      {label}
    </Link>
  );
}

/** رقم مستند كما يكتبه الخادم (PU-2026-0012، RC-…، FD-…): الشكل المقيَّد في القاعدة (party_entries_doc_no_check). */
const DOC_NO = /([A-Z]{2}-[0-9]{4}-[0-9]{4,})/;

/**
 * جملة عربية فيها أرقام مستندات: كلّ رقم معزول LTR ولا ينكسر عند شرطته (بلا عزل كان «PU-2026-0001» ينقلب وينقسم بين سطرين داخل
 * البيان، فحص Chromium الحقيقي). النصّ نفسه لا يتغيّر (إكسل والمشاركة بالنصّ الصافي).
 */
export function DocText({ text }: { text: string }) {
  const parts = text.split(DOC_NO);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <bdi key={index} dir="ltr" className="whitespace-nowrap">
            {part}
          </bdi>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** مبلغ بالدينار الصحيح، أو بمرتبتين إذا فيه فلوس (سعر وحدة مقسوم، مصروف بكسر). */
export function moneyText(amount: Fils): string {
  return fmtMoney(amount, amount % 100n === 0n ? 0 : 2);
}

export const money = (amount: Fils) => <Num>{moneyText(amount)}</Num>;

/**
 * اسم وحدة الشراء أو التصحيح كما يرجعها الخادم (§7): رمز وحدة أساس أو عامّة يُعرض باسمه (المفاتيح نفسها التي في baseUnitLabel
 * وcodeUnitLabel، بلا استيرادهما: حزمتهما حزمة المخزون المشتركة)، واسم وحدة التعبئة كما هو. لا يظهر «kg» خاماً أبداً.
 */
export function unitText(label: string): string {
  switch (label) {
    case 'kg':
      return t('unit.kg', 'كغم');
    case 'L':
      return t('unit.L', 'لتر');
    case 'pc':
      return t('unit.pc', 'قطعة');
    case 't':
      return t('unit.t', 'طن');
    case 'g':
      return t('unit.g', 'غرام');
    case 'mL':
      return t('unit.mL', 'ملل');
    default:
      return label;
  }
}

/** عدد الأيام بصيغة المعدود: «يوم واحد»، «يومان»، «5 أيام»، «40 يوماً» (صيغ بطاقة المادّة نفسها). */
export function daysText(days: number): string {
  return fmtCounted(BigInt(days) * 1000n, t('stock.age.day', 'يوم'), { one: t('stock.age.day.one', 'يوم واحد'), two: t('stock.age.day.two', 'يومان'), few: t('stock.age.day.few', 'أيام'), many: t('stock.age.day.many', 'يوماً') });
}

/** تاريخ ووقت التسجيل (ISO) بيوم الجهاز. */
export const postedDay = (at: string): Day => localDay(new Date(at));

// ─── أعمار الديون ─────────────────────────────────────────────────────────────────────────────────────────────

export function bucketLabel(bucket: AgingBucket): string {
  switch (bucket) {
    case 'd0_30':
      return t('aging.d0_30', '0–30 يوماً');
    case 'd31_60':
      return t('aging.d31_60', '31–60 يوماً');
    case 'd61_90':
      return t('aging.d61_90', '61–90 يوماً');
    case 'd91_plus':
      return t('aging.d91_plus', 'أكثر من 90 يوماً');
  }
}

/** عمر بلون فئته (اللون مساعد، والعدد مكتوب دائماً). */
export function AgeText({ days, bucket, children }: { days: number; bucket: AgingBucket; children?: ReactNode }) {
  return (
    <span className="aging-ink" data-bucket={bucket} data-age={days}>
      {daysText(days)}
      {children}
    </span>
  );
}

/** شريط توزيع المبلغ على فئات الأعمار ودليله بالمبالغ (فوق قائمة الذمم، وفي ذيل الكشف). */
export function AgingSplit({ aging, total }: { aging: Aging; total: Fils }) {
  return (
    <div className="flex flex-col gap-2" data-action="aging-split">
      {total > 0n ? (
        <div className="aging-bar" aria-hidden="true">
          {AGING_BUCKETS.filter((bucket) => aging[bucket] > 0n).map((bucket) => (
            <span key={bucket} className="aging-fill" data-bucket={bucket} style={{ flexGrow: Number((aging[bucket] * 10_000n) / total) }} />
          ))}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AGING_BUCKETS.map((bucket) => (
          <div key={bucket} className="flex items-center gap-2" data-bucket={bucket} data-action="aging-legend">
            <span className="aging-dot aging-fill" aria-hidden="true" />
            <dt className="text-sm text-ink-muted">{bucketLabel(bucket)}</dt>
            <dd className="font-semibold">{money(aging[bucket])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** سطور التوقيع أسفل الورقة. */
export function Signatures({ roles }: { roles: readonly string[] }) {
  return (
    <div className="flex flex-wrap justify-between gap-6 pt-6" data-action="signatures">
      {roles.map((role) => (
        <div key={role} className="paper-sign text-sm">
          {role}
        </div>
      ))}
    </div>
  );
}

/** «ملغى» بتاريخه وسببه ومن ألغاه، ختماً ظاهراً على الورقة. */
export function VoidStamp({ onDate, reason, by }: { onDate: Day; reason: string; by: string | null }) {
  return (
    <div className="paper-stamp" role="status" data-action="void-stamp">
      <strong className="text-2xl">{t('paper.void', 'ملغى')}</strong>
      <span className="text-sm">
        {by
          ? t('paper.void.detail_by', 'أُلغي بتاريخ {day} بيد {by}. السبب: {reason}', { day: fmtDay(onDate), by, reason })
          : t('paper.void.detail', 'أُلغي بتاريخ {day}. السبب: {reason}', { day: fmtDay(onDate), reason })}
      </span>
    </div>
  );
}
