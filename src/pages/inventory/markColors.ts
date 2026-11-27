import { t } from '../../lib/i18n';
import type { MarkColor, StockState } from '../../lib/repo/storeMarks';

// ألوان الرصيد (0040، كلمة الزبون 2026-11-26: «أدوس عليها تتأشر أصفر، أي لون أريد، حتى من أدزلهم الرصيد اليومي تكون مضللة»): الثمانية
// بأسمائها كما في private.mark_colors، ولكلّ واحد لون مصمَت للدائرة، وتظليل شفّاف للصفّ يُقرأ فوقه النصّ بالسمتين ويُطبع بلونه، وعلامة ملوّنة
// لنصّ المشاركة (واتساب لا يلوّن السطور). والألوان قيم ثابتة لا رموز السمة: هي ما اختاره المستخدم لا لون واجهة.

interface Look {
  /** الدائرة المصمتة في المنتقي وعلى البطاقة. */
  solid: string;
  /** تظليل الصفّ: شفّاف فيُقرأ النصّ فوقه بالسمة الفاتحة والداكنة. */
  tint: string;
  /** العلامة أوّل سطر المادّة في نصّ المشاركة. */
  emoji: string;
}

export const MARK_LOOK: Readonly<Record<MarkColor, Look>> = {
  yellow: { solid: '#facc15', tint: 'rgba(250, 204, 21, 0.38)', emoji: '\u{1F7E1}' },
  orange: { solid: '#fb923c', tint: 'rgba(251, 146, 60, 0.34)', emoji: '\u{1F7E0}' },
  red: { solid: '#ef4444', tint: 'rgba(239, 68, 68, 0.28)', emoji: '\u{1F534}' },
  pink: { solid: '#ec4899', tint: 'rgba(236, 72, 153, 0.26)', emoji: '\u{1FA77}' },
  purple: { solid: '#8b5cf6', tint: 'rgba(139, 92, 246, 0.26)', emoji: '\u{1F7E3}' },
  blue: { solid: '#3b82f6', tint: 'rgba(59, 130, 246, 0.26)', emoji: '\u{1F535}' },
  green: { solid: '#22c55e', tint: 'rgba(34, 197, 94, 0.28)', emoji: '\u{1F7E2}' },
  gray: { solid: '#9ca3af', tint: 'rgba(156, 163, 175, 0.34)', emoji: '\u{26AA}' },
};

/** اسم اللون. */
export function colorName(color: MarkColor): string {
  if (color === 'yellow') return t('mark.color.yellow', 'أصفر');
  if (color === 'orange') return t('mark.color.orange', 'برتقاليّ');
  if (color === 'red') return t('mark.color.red', 'أحمر');
  if (color === 'pink') return t('mark.color.pink', 'ورديّ');
  if (color === 'purple') return t('mark.color.purple', 'بنفسجيّ');
  if (color === 'blue') return t('mark.color.blue', 'أزرق');
  if (color === 'green') return t('mark.color.green', 'أخضر');
  return t('mark.color.gray', 'رماديّ');
}

/** كلمة الحالة (بجانب اللون التلقائيّ: لا يُفهم اللون وحده، ولا يظهر بالطباعة بالأبيض والأسود). */
export function stateWord(state: StockState): string {
  return state === 'out' ? t('mark.state.out', 'نفدت') : t('mark.state.low', 'قليلة');
}

/**
 * تظليل خليّة بلونها: صورة خلفية فوق لون الخليّة لا لون بدله، فالعمود الثابت (sticky) يبقى معتماً لا يظهر ما تحته عند التمرير. ويُطبع بلونه
 * (المتصفّح يحذف الخلفيات بالطباعة افتراضاً).
 */
export function tintStyle(color: MarkColor): { backgroundImage: string; printColorAdjust: 'exact'; WebkitPrintColorAdjust: 'exact' } {
  const { tint } = MARK_LOOK[color];
  return { backgroundImage: `linear-gradient(${tint}, ${tint})`, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' };
}
