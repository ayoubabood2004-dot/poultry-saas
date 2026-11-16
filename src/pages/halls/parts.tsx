import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FlockKind } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { countForm, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { VaccineState } from '../../lib/repo/halls';
import { vaccineColor } from './palette';

// قطع مشتركة لتقويم القاعة وتقرير الدورة وجدول اللقاحات (0026، docs/HALLS_PLAN.md). كلّها في حزمة HallsRoutes الكسولة، وما يُستورد هنا
// من خارجها من حزمة الإقلاع أو من حزمة مشتركة بوحدة واحدة: زرّ الرجوع (BackButton) حزمته مشتركة بين المخزون والمعمل، واستيراده هنا يفصله حزمةً
// محفوظة جديدة (هامش التثبيت المسبق مئتا بايت)، فرابط الرجوع هنا بشكله (نمط papers.tsx في الحسابات)، ولا أيقونة إلا من حزمة الإقلاع.
// واللون في هذه الشاشات للّقاح وحده (palette.ts) شريطاً أو نقطة، والاسم بجانبه دائماً بحبر النصّ؛ وحالة اللقاح كلمة مكتوبة (تمّ، اليوم، فات، قادم).

export const farmPath = (kind: FlockKind): string => (kind === 'broiler' ? '/broiler' : '/layers');
export const flockPath = (kind: FlockKind, flockId: string): string => `${farmPath(kind)}/flock/${flockId}`;
/** الجولة اليومية لنوع القاعة: فيها يُؤشَّر اللقاح المستحقّ. */
export const roundPath = (kind: FlockKind): string => `${farmPath(kind)}/round`;

/** طريق رجوع من الرابط (?back=): الرئيسية أو مسار داخليّ في الحقول أو القاعات وحده، وإلّا البديل. */
export function backTarget(value: string | null, fallback: string): string {
  return value !== null && /^\/(?:$|(?:broiler|layers|halls)(?:[/?][\w\-/=&%.?+]*)?$)/u.test(value) ? value : fallback;
}

/** طريق رجوع صفحتي التقارير (0027: التقرير اليوميّ وتقارير الدورات): صفحة «التقارير» أو ما يقبله backTarget، وإلّا البديل. */
export function reportsBack(value: string | null, fallback: string): string {
  return value === '/reports' ? value : backTarget(value, fallback);
}

/**
 * اسم زرّ الرجوع بوجهته: الرئيسية، أو «التقارير»، أو التقرير اليوميّ، أو تقارير الدورات، أو التقويم، أو الحقول، وإلّا القاعة. لكلّ صفحة تقرأ ?back=
 * ممّا يرسله التقرير اليوميّ وتقارير الدورات والتقويم (0027)، فلا يقول الزرّ «رجوع إلى القاعة» وهو يعود إلى التقرير أو التقويم (كلمة صفحة الإضافة).
 */
export function backLabel(path: string): string {
  if (path === '/') return t('back.home', 'رجوع إلى الرئيسية');
  if (path === '/reports') return t('halls.kit.back_reports', 'رجوع إلى التقارير');
  if (path.startsWith('/halls/day')) return t('halls.kit.back_day', 'رجوع إلى تقرير القاعات اليومي');
  if (path.startsWith('/halls/cycles')) return t('halls.kit.back_cycles', 'رجوع إلى تقارير الدورات');
  if (path.startsWith('/halls/calendar/')) return t('back.calendar', 'رجوع إلى التقويم');
  if (/^\/(?:broiler|layers)(?:\?|$)/u.test(path)) return t('back.farms', 'رجوع إلى الحقول');
  return t('halls.kit.back_hall', 'رجوع إلى القاعة');
}

/** عدد السطور بصيغة العدد: «سطر واحد»، «سطران»، «3 سطور»، «11 سطراً»، «100 سطر» (تقرير الدورة والتقرير اليوميّ). */
export function linesText(n: number): string {
  if (n === 1) return t('halls.rep.lines.one', 'سطر واحد');
  if (n === 2) return t('halls.rep.lines.two', 'سطران');
  const form = countForm(n);
  if (form === 'few') return t('halls.rep.lines.few', '{n} سطور', { n });
  if (form === 'many') return t('halls.rep.lines.many', '{n} سطراً', { n });
  return t('halls.rep.lines.hundreds', '{n} سطر', { n });
}

/** سطور علف بلا وزن لم تدخل الكيلو ولا الباقي (DECISIONS 0019: تُعدّ ولا تختفي): جملة تقرير الدورة نفسها في التقرير اليوميّ. */
export const outsideKgText = (n: number): string => t('halls.rep.kpi.given_note', 'خارج الكيلو: {lines} بلا وزن.', { lines: linesText(n) });

/**
 * الباقي السالب بسببه (والرقم كما هو، DECISIONS 0019): جملة تقرير الدورة نفسها في التقرير اليوميّ. وحين نزلت سطور علف بلا وزن لا تعرف الشاشة كلّ ما
 * نزل، فالسالب على الموزون وحده لا «أكثر من النازل للقاعة» (مراجعة 0027 RR27-F2a). unweighed: سطور العلف بلا وزن حتى يوم الباقي من الخادم.
 */
export const leftNegativeText = (unweighed: number): string =>
  unweighed > 0 ? t('halls.rep.kpi.left_negative_weighed', 'سالب: المأكول المسجّل أكثر من النازل الموزون.') : t('halls.rep.kpi.left_negative', 'سالب: المأكول المسجّل أكثر من النازل للقاعة.');

/** «رجوع إلى…» بشكل زرّ الرجوع، بلا استيراد BackButton (حزمته مشتركة بين المخزون والمعمل). لا يُطبع. */
export function BackLink({ to, label, action = 'back' }: { to: string; label: string; action?: string }) {
  return (
    <Link to={to} className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2 print:hidden" data-action={action}>
      {label}
    </Link>
  );
}

/** بالكيلوغرام دائماً («1,000 كغم» لا «1.000 طن»)، كسطر علف القاعة. */
export const kgText = (kg: Milli): string => {
  const shown = fmtQty(kg, 'kg');
  return shown.sub ?? shown.main;
};

/** الكمية بوحدتها كما يعرضها fmtQty، وتحتها بالكيلو أو اللتر بين قوسين إن وُجدت («1.000 طن (1,000 كغم)»). */
export function qtyText(qty: Milli, unit: BaseUnit): string {
  const shown = fmtQty(qty, unit);
  return shown.sub ? t('halls.kit.qty_sub', '{main} ({sub})', { main: shown.main, sub: shown.sub }) : shown.main;
}

export const unitWord = (unit: BaseUnit): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

/** عدد أيام بصيغة العدد في الفصحى بعد نقطتين: «يوم واحد»، «يومان»، «3 أيام»، «11 يوماً»، «100 يوم». */
export function daysText(n: number): string {
  if (n === 1) return t('halls.kit.days.one', 'يوم واحد');
  if (n === 2) return t('halls.kit.days.two', 'يومان');
  const form = countForm(n);
  if (form === 'few') return t('halls.kit.days.few', '{n} أيام', { n });
  if (form === 'many') return t('halls.kit.days.many', '{n} يوماً', { n });
  return t('halls.kit.days.hundreds', '{n} يوم', { n });
}

/** عدد أيّام مجروراً بعد «من»: «يوم واحد»، «يومين»، «3 أيام»، «11 يوماً»، «100 يوم» (تقرير الدورة، وتقدير العلف في «أغلق الدورة»). */
export function ofDaysText(n: number): string {
  if (n === 1) return t('halls.rep.of_days.one', 'يوم واحد');
  if (n === 2) return t('halls.rep.of_days.two', 'يومين');
  const form = countForm(n);
  if (form === 'few') return t('halls.rep.of_days.few', '{n} أيام', { n });
  if (form === 'many') return t('halls.rep.of_days.many', '{n} يوماً', { n });
  return t('halls.rep.of_days.hundreds', '{n} يوم', { n });
}

export const kindLabel = (kind: FlockKind): string => (kind === 'broiler' ? t('halls.kit.kind.broiler', 'لاحم') : t('halls.kit.kind.layer', 'بيّاض'));

/** حالة موعد اللقاح كلمةً: اللون مساعد لا بديل. */
export function stateLabel(state: VaccineState): string {
  switch (state) {
    case 'done':
      return t('halls.kit.state.done', 'تمّ');
    case 'today':
      return t('halls.kit.state.today', 'اليوم');
    case 'missed':
      return t('halls.kit.state.missed', 'فات');
    case 'planned':
      return t('halls.kit.state.planned', 'قادم');
  }
}

/** لون كلمة الحالة (ألوان الحالة لا تُستعمل للّقاحات أصلاً، palette.ts). */
export const STATE_INK: Readonly<Record<VaccineState, string>> = {
  done: 'text-success-700 dark:text-success-300',
  today: 'text-warn-800 dark:text-warn-200',
  missed: 'text-danger-700 dark:text-danger-300',
  planned: 'text-ink-muted',
};

/** نقطة لون اللقاح (تُطبع بلونها). */
export function Swatch({ color }: { color: number }) {
  return <span aria-hidden="true" className="block size-4 shrink-0 rounded-full" style={{ backgroundColor: vaccineColor(color) }} data-action="vac-swatch" data-slot={color} />;
}

/** اسم اللقاح بحبر النصّ وبجانبه نقطة لونه. */
export function VaccineName({ name, color, children }: { name: string; color: number; children?: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Swatch color={color} />
      <span className="min-w-0 truncate">{name}</span>
      {children}
    </span>
  );
}

/** شريط اللقاح: خطّ بلونه على جانب البداية واسمه بحبر النصّ (الخطّ يُطبع ولو لم تُطبع الخلفيات). */
export const bandStyle = (color: number) => ({ borderInlineStart: `4px solid ${vaccineColor(color)}` }) as const;

/**
 * اطبع بعنوان الصفحة عنوانَ الورقة (Chrome يسمّي ملفّ «احفظ PDF» به)، ثمّ يعود العنوان بعد الطباعة (نمط تقرير العليقة والرصيد اليومي).
 * والطباعة فاتحة دائماً (display.ts يشيل الداكن قبلها ويعيده بعدها).
 */
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
