// الوحدات الست بالمشروع (divisions.kind بالقاعدة). الست موجودة بكل منشأة (قرار المالك 2026-10-24، DECISIONS.md):
// ماكو تفعيل وحدات لكل منشأة، والإخفاء بنطاق المستخدم بس.
// اسمها بالشفرة division حتى ما تتلخبط ويّا وحدات القياس (units).

export type DivisionKind = 'feed_mill' | 'broiler' | 'layer' | 'hatchery' | 'medicine' | 'general';

export const DIVISION_KINDS: readonly DivisionKind[] = ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'];
