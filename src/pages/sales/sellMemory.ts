import type { PartyPick } from '../../lib/repo/purchasing';
import { saleDraftKey, type SaleDraftSummary } from './saleDraft';

// ما تتذكّره شاشة البيع لكلّ مستخدم ومنشأة على الجهاز (تصميم المبيعات، المبدأ 4 «افتراضات ذكية تُتذكَّر»): آخر مخزن بيع منه، وآخر صندوق قُبض فيه،
// وآخر وحدة بيعت بها كلّ مادّة (حين لا وحدة افتراضية لها من الخادم)، وآخر الزبائن شرائحَ في «لمن؟». راحة لا حقيقة: الخادم يحكم، وكلّ قيمة تُفحص على
// ما قُرئ قبل أن تُستعمل (مخزن أو صندوق أُرشف يُتجاهل).

export interface SellMemory {
  store: string | null;
  box: string | null;
  /** مادّة ← آخر وحدة (null = وحدة الأساس). */
  units: Record<string, string | null>;
  /** آخر الزبائن، الأحدث أوّلاً. */
  recent: PartyPick[];
}

const RECENT_MAX = 6;
const UNITS_MAX = 300;

export const sellMemoryKey = (userId: string, orgId: string): string => `sales.sell.memory:${userId}:${orgId}`;

// التخزين قد يرمي أو يعود فارغاً (نافذة خاصّة، تخزين ممسوح): كلّ قراءة وكتابة بـtry، والشاشة تعمل بلاه. هنا لا من lib/storage: استيرادها من حزمة كسولة
// يزيد أسماء تصدير حزمة الإقلاع.
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch { // swallow-ok: راحة لا حقيقة؛ بلاها الافتراض
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { // swallow-ok: بلا تخزين تبقى في الذاكرة
    return false;
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function readSellMemory(key: string): SellMemory {
  const value = readJson(key) as Partial<Record<keyof SellMemory, unknown>> | null;
  const units: Record<string, string | null> = {};
  if (value && typeof value.units === 'object' && value.units !== null && !Array.isArray(value.units)) {
    for (const [item, unit] of Object.entries(value.units as Record<string, unknown>)) if (unit === null || typeof unit === 'string') units[item] = unit as string | null;
  }
  const recent = Array.isArray(value?.recent)
    ? (value.recent as unknown[]).flatMap((entry) => {
        const party = entry as { id?: unknown; name?: unknown } | null;
        const id = text(party?.id);
        const name = text(party?.name);
        return id && name ? [{ id, name }] : [];
      })
    : [];
  return { store: text(value?.store), box: text(value?.box), units, recent: recent.slice(0, RECENT_MAX) };
}

/** الفاتورة المفتوحة كما حُفظت (JSON)، أو null: الكتابة والقراءة الكاملة هنا في حزمة البيع، والرئيسية تقرأ ملخّصها وحده (saleDraft). */
export function readSaleDraftRaw(userId: string, orgId: string): unknown {
  return readJson(saleDraftKey(userId, orgId));
}

/**
 * يحفظ الفاتورة المفتوحة بملخّصها؛ false حين تعذّر التخزين. pending: الطلب المرسَل نصّاً (encodePending) ما دام جوابه لم يُعرف: يُحفظ مع الفاتورة لا في
 * sessionStorage وحدها، فإغلاق التبويب أو التطبيق أثناء الطلب يعيد الشاشة مجمَّدةً به بعده، ولا تعود سلّةً تُعدَّل وتُرسل بالمرجع نفسه (مراجعة البيع S1).
 */
export function writeSaleDraft(userId: string, orgId: string, summary: SaleDraftSummary, body: unknown, pending: string | null = null): boolean {
  return writeJson(saleDraftKey(userId, orgId), {
    v: 1,
    summary: { lines: summary.lines, total: String(summary.total), store: summary.storeId },
    body,
    ...(pending === null ? {} : { pending }),
  });
}

// ─── الفواتير المحفوظة على هذا الجهاز ─────────────────────────────────────────────────────────────────────────────

const POSTED_MAX = 30;

export const postedKey = (userId: string, orgId: string): string => `sales.sell.posted:${userId}:${orgId}`;

/**
 * مراجع آخر الفواتير التي حُفظت من هذا الجهاز (الأحدث أوّلاً): فاتورة مفتوحة مرجعها منها حُفظت من نافذة أخرى، فلا تُكتب على الجهاز ثانيةً ولا تُستعاد
 * (مراجعة البيع S2: تبويب بقي مفتوحاً كان يعيد فاتورة بيعت إلى «فاتورة مفتوحة» بمرجعها المستعمل).
 */
export function readPosted(key: string): string[] {
  const value = readJson(key);
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '').slice(0, POSTED_MAX) : [];
}

/** نصّ القائمة كما هي في التخزين (لقطة useSyncExternalStore: تتغيّر حين تتغيّر وحدها). */
export function postedSnapshot(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch { // swallow-ok: بلا تخزين لا قائمة
    return '';
  }
}

export function rememberPosted(key: string, ref: string): void {
  writeJson(key, [ref, ...readPosted(key).filter((entry) => entry !== ref)].slice(0, POSTED_MAX));
}

/** يعمل التخزين في هذا المتصفّح؟ (نافذة خاصّة أو تخزين ممنوع: الفاتورة المفتوحة في الذاكرة وحدها، فالشاشة تحرس الخروج.) */
export function canStore(): boolean {
  try {
    localStorage.setItem('sales.sell.probe', '1');
    localStorage.removeItem('sales.sell.probe');
    return true;
  } catch { // swallow-ok: بلا تخزين؛ النتيجة نفسها هي الجواب
    return false;
  }
}

/** يضيف إلى الذاكرة (يُقرأ ما فيها أوّلاً: نافذة أخرى ربّما كتبت). */
export function rememberSell(key: string, patch: { store?: string; box?: string; units?: Record<string, string | null>; party?: PartyPick }): void {
  const memory = readSellMemory(key);
  const units = { ...memory.units, ...(patch.units ?? {}) };
  const names = Object.keys(units);
  for (const name of names.slice(0, Math.max(0, names.length - UNITS_MAX))) delete units[name];
  const recent = patch.party ? [patch.party, ...memory.recent.filter((party) => party.id !== patch.party?.id)].slice(0, RECENT_MAX) : memory.recent;
  writeJson(key, { store: patch.store ?? memory.store, box: patch.box ?? memory.box, units, recent });
}
