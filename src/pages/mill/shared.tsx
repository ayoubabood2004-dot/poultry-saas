import { useState, type ReactNode } from 'react';
import { fmtPercent } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useLoad, type LoadState } from '../../lib/useLoad';

// مشترك شاشات المعمل (0015، كلمة المالك 2026-11-03: «خلّيها كأنّها لعبة هاي داي، فيها ألوان ومفعمة بالحياة»؛ و2026-11-04:
// «تكون اكو الوان حلوة وزاهية شوية مو بس الوان محددة»): لون لكلّ خلطة من معرّفها بـhsl() في style — بلا حدّ لعدد الألوان،
// وبلا صنف Tailwind جديد (ملف CSS الوحيد داخل حزمة الإقلاع بسقف مقيس) — وشريط التركيبة الذي يُري الخلطة بلمحة، وبطاقة رقم.
// الحياة من اللون والشكل لا من الرموز التعبيرية: الأيقونات SVG (lucide) كما في بقيّة الشاشات.

/** درجة لون ثابتة لمعرّف (0–359) بتجزئة FNV-1a: نفس الخلطة بنفس اللون في كلّ شاشة وكلّ فتحة (لا عشوائية). */
export function hueOf(id: string): number {
  let hash = 0x811c9dc5;
  for (const ch of id) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

export interface RecipeColor {
  hue: number;
  /** لون الشريط والشارة: تشبّع عالٍ وإضاءة وسطى تقرأ على الفاتح والغامق، والأيقونة فوقه بيضاء. */
  solid: string;
  /** خلفية خفيفة من اللون نفسه (شفافية)، فتصلح فوق سطح الفاتح والغامق معاً. */
  soft: string;
}

export function recipeColor(id: string): RecipeColor {
  const hue = hueOf(id);
  return { hue, solid: `hsl(${hue} 85% 45%)`, soft: `hsl(${hue} 85% 45% / 0.14)` };
}

/**
 * لون قطعة مادّة في شريط التركيبة: يبدأ من لون الخلطة ويدور بالزاوية الذهبية (137°)، فالقطع المتجاورة متباعدة اللون مهما
 * كثرت المواد، والمادّة نفسها في الخلطة نفسها بلونها في كلّ رسم.
 */
export function pieceColor(hue: number, index: number): string {
  return `hsl(${(hue + index * 137) % 360} 78% 50%)`;
}

export interface BarPiece {
  key: string;
  label: string;
  /** null: كتلة لا تُعرف (ق٤٢، سطر باللتر بلا كثافة)، فلا قطعة لها في الشريط. */
  weight: bigint | null;
}

/** قطعة بكتلة معروفة موجبة: وحدها تُرسم (الجولة الرابعة، ب٣١: القارئ يرسل null لكتلة لا تُعرف بدل أن يرمي). */
const drawable = (piece: BarPiece): piece is BarPiece & { weight: bigint } => piece.weight !== null && piece.weight > 0n;

/**
 * شريط التركيبة: قطعة لكلّ مادّة بحصّتها من الأساس، فالخلطة تُقرأ بلمحة قبل الأرقام. الحصّة في العنوان بالمئة من
 * fmtPercent (قانون الأرقام)، وعرض القطعة وزن تخطيط لا رقم معروض. اللون من درجة الخلطة (hue). القطعة بلا كتلة تُتخطّى (ب٣١).
 */
export function CompositionBar({ pieces, total, hue = 210 }: { pieces: readonly BarPiece[]; total: bigint; hue?: number }) {
  const shown = pieces.filter(drawable);
  if (!shown.length || total <= 0n) return null;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
      {shown.map((piece, index) => (
        <span
          key={piece.key}
          className="block"
          // number-ok: وزن تخطيط للقطعة، لا رقم معروض (الحصّة بالمئة في العنوان)
          style={{ flexGrow: Number(piece.weight), flexBasis: 0, background: pieceColor(hue, index) }}
          title={t('mill.bar.piece', '{name}: {pct}٪', { name: piece.label, pct: fmtPercent(piece.weight, total) })}
        />
      ))}
    </div>
  );
}

/** رقاقة صغيرة: اسم ورقمه (الرقم يجيء منسَّقاً من المستدعي)، ونقطة بلون قطعتها في الشريط إن أُعطيت. */
export function Chip({ tone, dot, children }: { tone?: string; dot?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${tone ?? 'bg-surface-2 text-ink-muted'}`}>
      {dot ? <span className="block shrink-0 rounded-full p-1" style={{ background: dot }} aria-hidden="true" /> : null}
      {children}
    </span>
  );
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

/** «—» لقيمة غائبة في خلية أو رقم (مال لدور بلا كلفة، أو مادّة بلا سعر). */
export const dash = (): string => t('mill.col.no_doc', '—');

export interface KeptLoad<T> extends LoadState<T> {
  /** قراءة جديدة جارية والصفحة مرسومة بآخر ما قُرئ للمفتاح نفسه: الأفعال معطَّلة حتّى تصل (ب٤٣). */
  refreshing: boolean;
}

/**
 * قراءة تبقى مرسومة أثناء إعادتها (الجولة الخامسة، ب٤٣): useLoad يجعل data = null أثناء كلّ قراءة جديدة، فكانت صفحتا الدفعة والخلطة
 * تُطويان إلى «جارٍ التحميل…» بعد كلّ حفظ، وتُطوى معهما نافذة مفتوحة ويُمحى ما كُتب فيها. هنا آخر بيانات ناجحة للمفتاح نفسه تبقى
 * معروضة وrefreshing يقول إنّ قراءة جديدة جارية؛ ومفتاح آخر (خلطة أو نسخة أو دفعة أخرى) يبدأ فارغاً. والفشل في error كما في useLoad،
 * والصفحتان تعرضانه قبل البيانات (LoadFailed بزرّ «أعد المحاولة»)، فلا تُعرض قراءة قديمة كأنّها المحفوظ الآن.
 * حفظ آخر بيانات للمفتاح حالةً من حالة أثناء الرسم بشرط يتوقّف (نمط React «معلومة من رسم سابق»)، لا متغيّراً عامّاً ولا مرجعاً.
 */
export function useKeptLoad<T>(load: () => Promise<T>, key: string): KeptLoad<T> {
  const state = useLoad(load, key);
  const [kept, setKept] = useState<{ key: string; data: T } | null>(null);
  if (state.data !== null && (kept === null || kept.key !== key || kept.data !== state.data)) setKept({ key, data: state.data });
  const held = kept !== null && kept.key === key ? kept.data : null;
  const data = state.data ?? held;
  return { data, error: state.error, loading: data === null && !state.error, refreshing: state.loading && data !== null, retry: state.retry };
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
