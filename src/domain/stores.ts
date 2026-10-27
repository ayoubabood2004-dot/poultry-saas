import type { DivisionKind } from './divisions';
import { searchable } from './normalize';
import type { BaseUnit, Dimension } from './units';

// المواقع والمخازن والمواد (0005، FOUNDATION «نموذج البيانات» ٢٦٣–٢٧٧). مرآة مشغّلات القاعدة: private.site_kind_for
// وprivate.warehouse_kind_allowed وقيود items (stores.test يقارنها خانةً خانة). الشاشة تقترح وتمنع قبل الإرسال، والحكم
// بالقاعدة.

export type SiteKind = 'farm' | 'mill' | 'hatchery' | 'store';
export type WarehouseKind = 'raw' | 'feed' | 'medicine' | 'general' | 'hatching_egg' | 'chick' | 'table_egg' | 'farm';
export type ItemKind =
  | 'raw'
  | 'additive'
  | 'feed'
  | 'medicine'
  | 'vaccine'
  | 'fuel'
  | 'packaging'
  | 'hatching_egg'
  | 'chick'
  | 'table_egg'
  | 'equipment'
  | 'other';

export const SITE_KINDS: readonly SiteKind[] = ['farm', 'mill', 'hatchery', 'store'];
export const WAREHOUSE_KINDS: readonly WarehouseKind[] = ['raw', 'feed', 'medicine', 'general', 'hatching_egg', 'chick', 'table_egg', 'farm'];
export const ITEM_KINDS: readonly ItemKind[] = [
  'raw',
  'additive',
  'feed',
  'medicine',
  'vaccine',
  'fuel',
  'packaging',
  'hatching_egg',
  'chick',
  'table_egg',
  'equipment',
  'other',
];
export const BASE_UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];

/** نوع الموقع بنوع وحدته: المعمل لمعمل العلف، والمفقس للمفقس، والحقل للحم والبيض، والمخزن للأدوية والعامة. */
export const SITE_KIND_FOR: Readonly<Record<DivisionKind, SiteKind>> = {
  feed_mill: 'mill',
  broiler: 'farm',
  layer: 'farm',
  hatchery: 'hatchery',
  medicine: 'store',
  general: 'store',
};

/** أنواع المخازن المسموحة بكل وحدة (FOUNDATION ٢٧٥–٢٧٧): بيض المائدة بحقول البيض بس، ومخزن واحد فعّال لكل حقل. */
export const WAREHOUSE_KINDS_FOR: Readonly<Record<DivisionKind, readonly WarehouseKind[]>> = {
  feed_mill: ['raw', 'feed'],
  broiler: ['farm'],
  layer: ['farm', 'table_egg'],
  hatchery: ['hatching_egg', 'chick'],
  medicine: ['medicine'],
  general: ['general'],
};

/** الوحدات الست بترتيبها (مثل DIVISION_KINDS): من هنا للشاشات الكسولة، فما تنقسم divisions.ts بحزمة مسار الجلسة. */
export const DIVISION_ORDER = Object.keys(SITE_KIND_FOR) as DivisionKind[];

export function warehouseKindAllowed(division: DivisionKind, kind: WarehouseKind): boolean {
  return WAREHOUSE_KINDS_FOR[division].includes(kind);
}

/** البيض والأفراخ معدودة دائماً (items_count_kinds_check). */
export const COUNTED_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['hatching_egg', 'chick', 'table_egg']);

/** بُعد وحدة الأساس: حجم التعبئة لازم بنفس البُعد (الكيس بالكيلو لمادّة بالكيلو). */
export function dimensionOf(base: BaseUnit): Dimension {
  return base === 'kg' ? 'mass' : base === 'L' ? 'volume' : 'count';
}

/** حقول المادّة كما تنكتب (الأرقام bigint بمراتب أعمدتها: الكثافة 4، والكتلة والخطوة والحدّ 3). */
export interface ItemDraft {
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  /** كغم/لتر بوحدة ١/١٠٠٠٠ (0.92 ← 9200)، للسائل بس. */
  density: bigint | null;
  /** كتلة القطعة بالآلاف من الكيلو، للمعدود بس. */
  pieceMassKg: bigint | null;
  /** خطوة العدّاد بالآلاف (0.1 ← 100). */
  scaleStep: bigint;
  minQty: bigint | null;
}

export type ItemProblem = 'name' | 'name_norm' | 'count_kind' | 'density' | 'density_unit' | 'piece_mass' | 'piece_mass_unit' | 'step' | 'min_qty' | 'pieces_whole';

/** نفس قيود items بالقاعدة، قيداً بقيد (كل مشكلة قيد واحد باسمه)، بالترتيب اللي تنعرض بيه بالنموذج. */
export function itemProblems(item: ItemDraft): ItemProblem[] {
  const out: ItemProblem[] = [];
  const name = item.name.trim();
  if (name.length < 1 || name.length > 120) out.push('name');
  // items_name_norm_check: اسم من تطويل أو تشكيل بس يفرغ بالتطبيع، فما ينبحث.
  else if (searchable(name) === '') out.push('name_norm');
  if (COUNTED_KINDS.has(item.kind) && item.baseUnit !== 'pc') out.push('count_kind');
  // items_density_check (أكبر من صفر) وitems_density_unit_check (للسائل بس) قيدان، فمشكلتان (مثل كتلة القطعة): كثافة صفر
  // لمادّة باللتر كانت تطلع «للسائل فقط» والمادّة سائلة.
  if (item.density !== null && item.density <= 0n) out.push('density');
  if (item.density !== null && item.baseUnit !== 'L') out.push('density_unit');
  // items_piece_mass_check (أكبر من صفر) وitems_piece_mass_unit_check (للمعدود بس) قيدان، فمشكلتان.
  if (item.pieceMassKg !== null && item.pieceMassKg <= 0n) out.push('piece_mass');
  if (item.pieceMassKg !== null && item.baseUnit !== 'pc') out.push('piece_mass_unit');
  if (item.scaleStep <= 0n) out.push('step');
  if (item.minQty !== null && item.minQty < 0n) out.push('min_qty');
  if (item.baseUnit === 'pc' && (item.scaleStep % 1000n !== 0n || (item.minQty !== null && item.minQty % 1000n !== 0n))) out.push('pieces_whole');
  return out;
}
