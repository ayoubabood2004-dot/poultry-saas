import type { ItemKind } from '../../domain/stores';
import { countForm } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { DaySectionKey } from '../../lib/repo/dayBalance';

// «المخزن بقسمين» (كلمة المالك 2026-11-21، عقد 0034/0035 S1): المخزن قسمان تختارهما المزرعة لكلّ مادّة بنوعها — «مواد العلف» (المادّة
// الأوّلية والإضافات: raw وadditive) و«العلف» (ما يُصنع منها: feed، وناتج المعمل فيه دائماً) — وما سواهما «أخرى». القسمة نفسها في بطاقات
// المخزن (من نوع المادّة في items_overview) وفي «الرصيد اليومي» (أقسام day_balance_sections من الخادم بالمفاتيح نفسها).

export type StoreSection = DaySectionKey;

/** الأقسام بترتيب عرضها. */
export const STORE_SECTIONS: readonly StoreSection[] = ['feed_materials', 'feed', 'other'];

/** قسم المادّة بنوعها: مرآة قسمة day_balance_sections بالخادم. */
export function sectionOfKind(kind: ItemKind): StoreSection {
  if (kind === 'raw' || kind === 'additive') return 'feed_materials';
  if (kind === 'feed') return 'feed';
  return 'other';
}

/** نوع المادّة الذي تبدأ به «أضف مادّة» داخل القسم؛ null: «أخرى» بلا زرّ إضافة (زرّ رأس الصفحة لكلّ نوع). */
export const SECTION_ADD_KIND: Readonly<Record<StoreSection, ItemKind | null>> = { feed_materials: 'raw', feed: 'feed', other: null };

/** اسم القسم في بطاقات المخزن. */
export function sectionName(section: StoreSection): string {
  if (section === 'feed_materials') return t('store.section.feed_materials', 'مواد العلف');
  if (section === 'feed') return t('store.section.feed', 'العلف');
  return t('store.section.other', 'أخرى');
}

/** عدد موادّ القسم بالفصحى: «لا موادّ»، «مادّة واحدة»، «مادّتان»، «3 موادّ»، «11 مادّةً»، «100 مادّة». */
export function itemsCountText(n: number): string {
  if (n === 0) return t('store.section.count.none', 'لا موادّ');
  if (n === 1) return t('store.section.count.one', 'مادّة واحدة');
  if (n === 2) return t('store.section.count.two', 'مادّتان');
  const form = countForm(n);
  if (form === 'few') return t('store.section.count.few', '{n} موادّ', { n });
  if (form === 'many') return t('store.section.count.many', '{n} مادّةً', { n });
  return t('store.section.count.hundreds', '{n} مادّة', { n });
}
