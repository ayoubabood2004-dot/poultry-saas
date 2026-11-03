import type { ReactNode } from 'react';
import { fmtPercent } from '../../lib/format';
import { t } from '../../lib/i18n';

// مشترك شاشات المعمل (0015، كلمة المالك 2026-11-03: «خلّيها كأنّها لعبة هاي داي، فيها ألوان ومفعمة بالحياة»):
// لون ثابت لكلّ خلطة من سلالم النظام (لا ألوان خام: ui-guard يقرأ الأصناف من إعداد Tailwind)، وشريط التركيبة الذي يُري
// الخلطة بلمحة، وبطاقة رقم. الحياة من اللون والشكل لا من الرموز التعبيرية: الأيقونات SVG (lucide) كما في بقيّة الشاشات.

export interface Tint {
  /** شريط رأس البطاقة وقطعة الشريط (نفس الصنف). */
  bar: string;
  /** دائرة الأيقونة: اللون صريحاً ونصّ أبيض، فتقرأ في الفاتح والغامق سواء بلا نسخة ثانية. */
  badge: string;
}

const FALLBACK: Tint = { bar: 'bg-brand-500', badge: 'bg-brand-500 text-white' };

/**
 * ثلاثة ألوان من سلالم النظام بدرجة واحدة لكلّ واحد، **وكلّها مستعملة في المشروع أصلاً**: كلّ صنف Tailwind جديد يزيد ملف
 * CSS الوحيد وهو داخل حزمة الإقلاع (سقف مقيس)، و`bg-accent-500` كان وحده الجديد فخرج. والرقاقات محايدة (bg-surface-2).
 */
export const TINTS: readonly Tint[] = [
  { bar: 'bg-brand-500', badge: 'bg-brand-500 text-white' },
  { bar: 'bg-success-500', badge: 'bg-success-500 text-white' },
  { bar: 'bg-warn-500', badge: 'bg-warn-500 text-white' },
];

/** لون ثابت لمعرّف: نفس الخلطة بنفس اللون في كلّ شاشة وفي كلّ فتحة (لا عشوائية). */
export function tintOf(id: string): Tint {
  let sum = 0;
  for (const ch of id) sum = (sum + ch.charCodeAt(0)) % 1024;
  return TINTS[sum % TINTS.length] ?? FALLBACK;
}

export interface BarPiece {
  key: string;
  label: string;
  weight: bigint;
}

/**
 * شريط التركيبة: قطعة لكلّ مادّة بحصّتها من الأساس، فالخلطة تُقرأ بلمحة قبل الأرقام. الحصّة في العنوان بالمئة من
 * fmtPercent (قانون الأرقام)، وعرض القطعة وزن تخطيط لا رقم معروض.
 */
export function CompositionBar({ pieces, total }: { pieces: readonly BarPiece[]; total: bigint }) {
  const shown = pieces.filter((piece) => piece.weight > 0n);
  if (!shown.length || total <= 0n) return null;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
      {shown.map((piece, index) => (
        <span
          key={piece.key}
          className={`${(TINTS[index % TINTS.length] ?? FALLBACK).bar} block`}
          // number-ok: وزن تخطيط للقطعة، لا رقم معروض (الحصّة بالمئة في العنوان)
          style={{ flexGrow: Number(piece.weight), flexBasis: 0 }}
          title={t('mill.bar.piece', '{name}: {pct}٪', { name: piece.label, pct: fmtPercent(piece.weight, total) })}
        />
      ))}
    </div>
  );
}

/** رقاقة صغيرة: اسم ورقمه (الرقم يجيء منسَّقاً من المستدعي). */
export function Chip({ tone, children }: { tone?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${tone ?? 'bg-surface-2 text-ink-muted'}`}>{children}</span>;
}

/** نسبة بالمئة بعلامتها داخل t() (i18n-guard يرفض «٪» خارج النداء). */
export const pct = (part: bigint, whole: bigint): string => t('mill.pct', '{value}٪', { value: fmtPercent(part, whole) });

/** شريط أرقام: بطاقة صغيرة لكلّ رقم (مثل StatStrip، مكتوب هنا فلا تُستورَد حزمته في مسار المعمل). */
export function Stats({ stats }: { stats: readonly { key: string; label: string; value: ReactNode }[] }) {
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

// ─── المحاولة بمرجع ثابت (FOUNDATION ٥١٩) ───────────────────────────────────────────────────────────────────────
// «ما نعرف شنو صار» تحتفظ بالمرجع، والإعادة تسأل الخادم به؛ والنتيجة المعروفة (نجاح أو رفض أكيد) تنسيه فالمحاولة
// التالية بمرجع جديد.
const refs = new Map<string, string>();

export function millRef(slot: string): string {
  const kept = refs.get(slot);
  if (kept) return kept;
  const fresh = crypto.randomUUID();
  refs.set(slot, fresh);
  return fresh;
}

export function forgetMillRef(slot: string): void {
  refs.delete(slot);
}

export const millPath = '/mill';
