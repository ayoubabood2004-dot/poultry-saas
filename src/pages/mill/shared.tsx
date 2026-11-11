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

// ─── ألوان الموادّ (0025، كلمة المالك 2026-11-10: لا أحمر في شريط التركيبة، ونقطة لون بجانب اسم كلّ مادّة) ───────────────────────────────
// لوحة فئوية ثابتة تُسند بالموضع (لا تُولَّد من معرّف ولا تدور): الأولى للمادّة الأولى، وما بعد اللوحة كلّه قطعة رمادية واحدة «أخرى». ألوانها
// زاهية من الأزرق إلى الأرجواني وحدها: الأحمر والبرتقالي والكهرماني والأصفر والأخضر محجوزة للحالة (خطر، تنبيه، نجاح) فلا تلبسها مادّة.
// اختيرت بمدقّق اللوحات (dataviz/scripts/validate_palette.js) لا بالعين: بالوضعين الفاتح والغامق على سطوح التطبيق الحقيقية (البطاقة #ffffff
// و#101827، والسطح الثاني #eef5fc و#172133) نجحت كلّ الفحوص للأزواج المتجاورة (الشريط مكدَّس): أسوأ فرق لعمى الألوان 12.1، وللبصر العادي 19.7،
// والتباين ≥ 3:1. والمجموعة نفسها للوضعين (L بين 0.54 و0.66 في نطاق الوضعين معاً)، فاللون في style مباشرة بلا متغيّر CSS ولا صنف Tailwind
// جديد. والأزواج غير المتجاورة أقرب (حدّ اللوحات المعروف بعد ثلاثة ألوان)، فالترميز الثاني: الترتيب نفسه في الشريط والقائمة، واسم المادّة بجانب
// نقطتها، وفاصل 2 بكسل بين القطع.
// الأزرق، الأرجواني الوردي، البنفسجي، الأزرق السماوي الغامق، الفوشيا (درجات OKLCH من 240° إلى 340°).
export const PALETTE: readonly string[] = ['#6180fe', '#c6099f', '#8832fd', '#0d76ad', '#d63ff5'];
/** «أخرى»: رمادي محايد بتباين ≥ 3:1 على السطوح الأربعة. */
export const OTHER_COLOR = '#7c8798';

/** لون المادّة في موضعها (slot من صفر): من اللوحة، وما بعدها «أخرى». */
export function pieceColor(slot: number): string {
  return slot >= 0 && slot < PALETTE.length ? (PALETTE[slot] ?? OTHER_COLOR) : OTHER_COLOR;
}

export interface BarPiece {
  key: string;
  label: string;
  /** null: كتلة لا تُعرف (ق٤٢، سطر باللتر بلا كثافة)، فلا قطعة لها في الشريط. */
  weight: bigint | null;
  /** موضع المادّة في قائمتها (لونها ونقطتها): ما بعد اللوحة يُطوى في «أخرى». */
  slot: number;
}

/** قطعة بكتلة معروفة موجبة: وحدها تُرسم (الجولة الرابعة، ب٣١: القارئ يرسل null لكتلة لا تُعرف بدل أن يرمي). */
const drawable = (piece: BarPiece): piece is BarPiece & { weight: bigint } => piece.weight !== null && piece.weight > 0n;

/** فاصل السطح بين القطع (2 بكسل). */
const GAP = '2px';

/**
 * شريط التركيبة: قطعة لكلّ مادّة بحصّتها، فالخلطة تُقرأ بلمحة قبل الأرقام. الحصّة في العنوان بالمئة من fmtPercent (قانون الأرقام)، وعرض القطعة
 * وزن تخطيط لا رقم معروض. لون القطعة من موضعها (pieceColor)، وما بعد اللوحة قطعة رمادية واحدة «أخرى» في آخره. القطعة بلا كتلة تُتخطّى (ب٣١).
 */
export function CompositionBar({ pieces, total }: { pieces: readonly BarPiece[]; total: bigint }) {
  const shown = pieces.filter(drawable);
  if (!shown.length || total <= 0n) return null;
  const named = shown.filter((piece) => piece.slot < PALETTE.length);
  const rest = shown.filter((piece) => piece.slot >= PALETTE.length);
  const restWeight = rest.reduce((sum, piece) => sum + piece.weight, 0n);
  return (
    <div className="flex h-2 overflow-hidden rounded-full" style={{ gap: GAP }} role="presentation" data-action="composition-bar">
      {named.map((piece) => (
        <span
          key={piece.key}
          className="block"
          // number-ok: وزن تخطيط للقطعة، لا رقم معروض (الحصّة بالمئة في العنوان)
          style={{ flexGrow: Number(piece.weight), flexBasis: 0, background: pieceColor(piece.slot) }}
          title={t('mill.bar.piece', '{name}: {pct}٪', { name: piece.label, pct: fmtPercent(piece.weight, total) })}
          data-action="bar-piece"
          data-slot={piece.slot}
        />
      ))}
      {rest.length ? (
        <span
          key="other"
          className="block"
          // number-ok: وزن تخطيط للقطعة، لا رقم معروض
          style={{ flexGrow: Number(restWeight), flexBasis: 0, background: OTHER_COLOR }}
          title={t('mill.bar.other', 'أخرى ({names}): {pct}٪', { names: rest.map((piece) => piece.label).join(t('list.separator', '، ')), pct: fmtPercent(restWeight, total) })}
          data-action="bar-piece"
          data-slot="other"
        />
      ) : null}
    </div>
  );
}

/** نقطة لون المادّة بجانب اسمها (دليل الشريط): بلون موضعها، ورمادي «أخرى» لما بعد اللوحة. */
export function Dot({ slot }: { slot: number }) {
  return <span className="block shrink-0 rounded-full p-1" style={{ background: pieceColor(slot) }} aria-hidden="true" data-action="dot" data-slot={slot} />;
}

/** رقاقة صغيرة: اسم ورقمه (الرقم يجيء منسَّقاً من المستدعي)، ونقطة بلون موضع مادّتها في الشريط إن أُعطي. */
export function Chip({ tone, slot, children }: { tone?: string; slot?: number; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${tone ?? 'bg-surface-2 text-ink-muted'}`}>
      {slot === undefined ? null : <Dot slot={slot} />}
      {children}
    </span>
  );
}

/** المادّة باسمها ونقطة لونها (صفّ جدول، أو سطر إنتاج): بلا نقطة لما هو خارج الكتلة (لا قطعة له في الشريط). */
export function MaterialName({ name, slot }: { name: string; slot: number | null }) {
  return (
    <span className="flex items-center gap-2">
      {slot === null ? null : <Dot slot={slot} />}
      <span className="font-medium">{name}</span>
    </span>
  );
}

/**
 * مواضع ألوان الموادّ بترتيبها: ما داخل الكتلة يأخذ موضعاً متتابعاً، وما خارجها (الوقود والتعبئة) بلا موضع (null). المفتاح معرّف المادّة.
 */
export function slotsOf(entries: readonly { key: string; inBasis: boolean }[]): ReadonlyMap<string, number | null> {
  const slots = new Map<string, number | null>();
  let next = 0;
  for (const entry of entries) {
    if (slots.has(entry.key)) continue;
    if (entry.inBasis) {
      slots.set(entry.key, next);
      next += 1;
    } else slots.set(entry.key, null);
  }
  return slots;
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

// ─── الترتيب (0023، كلمة المالك 2026-11-10: «ويرتبها مثل ما هو يريد») ──────────────────────────────────────────────────

/**
 * ترتيب المستخدم مع قائمة جديدة قُرئت: ما بقي منها بترتيبه، وما أُضيف بعد القراءة في آخرها بترتيب الخادم (ولا يعود ما حُذف). مشترك بين ترتيب
 * العلائق في المعمل وترتيب موادّ مسوّدة الخلطة.
 */
export function reconcileOrder(mine: readonly string[], live: readonly string[]): string[] {
  const alive = new Set(live);
  const kept = mine.filter((id) => alive.has(id));
  const seen = new Set(kept);
  return [...kept, ...live.filter((id) => !seen.has(id))];
}

/** الترتيبان واحد عنصراً بعنصر. */
export const sameOrder = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, index) => id === b[index]);

/** يقدّم العنصر الذي في index (by = -1) أو يؤخّره (by = 1) مرتبةً واحدة؛ وخارج الحدّين كما هو. */
export function moveId(list: readonly string[], index: number, by: -1 | 1): string[] {
  const target = index + by;
  if (index < 0 || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [entry] = next.splice(index, 1);
  if (entry !== undefined) next.splice(target, 0, entry);
  return next;
}

export interface KeptLoad<T> extends LoadState<T> {
  /** قراءة جديدة جارية والصفحة مرسومة بآخر ما قُرئ للمفتاح نفسه: الأفعال معطَّلة حتّى تصل (ب٤٣). */
  refreshing: boolean;
  /**
   * عدد القراءات الناجحة للمفتاح نفسه (0023، درس «أدرج مواد» في الرصيد اليومي): كتابةٌ رُفضت لأنّ ما عرضته الشاشة تغيّر تحفظ العدد لحظة الرفض،
   * فأوّل قراءة ناجحة بعده تصير شرطها الجديد (لا قراءة قديمة جارية).
   */
  reads: number;
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
  const [kept, setKept] = useState<{ key: string; data: T; reads: number } | null>(null);
  if (state.data !== null && (kept === null || kept.key !== key || kept.data !== state.data)) {
    setKept({ key, data: state.data, reads: kept !== null && kept.key === key ? kept.reads + 1 : 1 });
  }
  const held = kept !== null && kept.key === key ? kept : null;
  const data = state.data ?? held?.data ?? null;
  return { data, error: state.error, loading: data === null && !state.error, refreshing: state.loading && data !== null, retry: state.retry, reads: held?.reads ?? 0 };
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
