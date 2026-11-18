import { useSyncExternalStore } from 'react';
import type { Fils } from '../../domain/money';
import { t } from '../../lib/i18n';
import type { SaleRow } from '../../lib/repo/purchases';
import './doc.css';

// قطع شاشات ما بعد البيع (تصميم المبيعات ٥–٧، docs/SALES_UX_PLAN.md): حالة الفاتورة شريحةً بنصّ، و«الشاشة عريضة؟» لأعمدة الجداول. وأنماطها في doc.css
// يستوردها هذا الملف وحده، فتدخل CSS حزمة المخزون الكسولة (StockRoutes-*.css: خارج الإقلاع والتثبيت المسبق) ولا صنف Tailwind جديداً (CSS الإقلاع بسقفه).
//
// الكلمات (تدقيق 2026-11-18: ستّ كلمات للدين في شاشات البيع): «الباقي» = ما بقي على الفاتورة الآن (open: القبض اللاحق يُنقصه)، و«دين» = ما بقي عند البيع
// (debt: لا يتغيّر بالقبض)، و«المدفوع» ما دُفع. والحالة من «الباقي» وحده: مدفوعة (لا باقٍ)، بالدين (الباقي = الصافي)، جزء مدفوع (بينهما).

export type SaleTone = 'paid' | 'partial' | 'credit' | 'void' | 'free';

/** حالة الفاتورة من الصافي والباقي الآن (والملغاة والتي بلا مقابل أوّلاً). */
export function saleTone(sale: { status: 'posted' | 'void'; total: Fils; open: Fils }): SaleTone {
  if (sale.status === 'void') return 'void';
  if (sale.total === 0n) return 'free';
  if (sale.open <= 0n) return 'paid';
  if (sale.open >= sale.total) return 'credit';
  return 'partial';
}

/** حالة صفّ القائمة: من ماله إن وصل، وإلّا من الدفع كما يقوله الخادم (دور بلا مبالغ). */
export function rowTone(row: Pick<SaleRow, 'status' | 'free' | 'payment' | 'paymentRefunded' | 'money'>): SaleTone {
  if (row.status === 'void') return 'void';
  if (row.free) return 'free';
  if (row.money) return saleTone({ status: row.status, total: row.money.lineTotal, open: row.money.open });
  if (row.payment === 'cash' && !row.paymentRefunded) return 'paid';
  return row.payment === 'credit' || row.paymentRefunded ? 'credit' : 'partial';
}

export function toneText(tone: SaleTone): string {
  switch (tone) {
    case 'paid':
      return t('saledoc.tone.paid', 'مدفوعة');
    case 'partial':
      return t('saledoc.tone.partial', 'جزء مدفوع');
    case 'credit':
      return t('saledoc.tone.credit', 'بالدين');
    case 'void':
      return t('saledoc.tone.void', 'ملغاة');
    default:
      return t('saledoc.tone.free', 'بلا مقابل');
  }
}

/** شريحة الحالة: النصّ يقولها دائماً، واللون مساعد (أخضر مدفوعة، كهرمانيّ باقٍ، رماديّ ملغاة). */
export function StatusChip({ tone, action = 'sale-status', className = '' }: { tone: SaleTone; action?: string; className?: string }) {
  return (
    <span className={`sale-chip ${className}`} data-tone={tone} data-action={action}>
      {toneText(tone)}
    </span>
  );
}

/** علم يتذكّره الجهاز (localStorage): التخزين قد يرمي أو يعود فارغاً (نافذة خاصّة)، فالقراءة false والكتابة بلا أثر حينها. */
export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch { // swallow-ok: تخزين ممنوع؛ الافتراض مطويّ
    return false;
  }
}

export function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* swallow-ok: راحة لا حقيقة؛ بلا تخزين يعود الافتراض */
  }
}

const WIDE = '(min-width: 640px)';
const media = (): MediaQueryList | null => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null);
function subscribe(changed: () => void): () => void {
  const query = media();
  query?.addEventListener?.('change', changed);
  return () => query?.removeEventListener?.('change', changed);
}

/** الشاشة عريضة (sm فما فوق): أعمدة التفصيل في الجداول؛ والهاتف (وبيئة بلا matchMedia) بأعمدته القليلة. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}
