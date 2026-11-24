import { parseDecimal } from '../../domain/decimal';

// منطق جدول ورقة القاعة في وضع التعديل كإكسل (عقد 0036 الجزء S2، كلمة المالك 2026-11-24: «اريد الجدول يكون التحكم بي مثل جداول الاكسل… حتى الي يستخدم
// انظمة اكسل ما يحس بالفرق»): التحديد ونطاقه، والتنقّل بالمفاتيح (والأسهم بموضعها على الشاشة في الاتجاه من اليمين)، وما يفعله كلّ مفتاح، والنصّ المنسوخ
// والملصوق بين الخانات بعلامة الجدولة كما ينسخه إكسل. دوالّ صافية بلا React ولا متصفّح، فتُفحص وحدها (sheet-grid.test)؛ والشاشة (SheetGrid.tsx) تنفّذ ما تقوله.

/** موضع خانة: رقم الصفّ (اليوم) ورقم العمود بترتيب أعمدة الجدول (لا بموضعه على الشاشة). */
export interface Pos {
  row: number;
  col: number;
}

/**
 * التحديد كإكسل: الخانة النشطة (فيها يُكتب وعليها التركيز) داخل نطاق من anchor إلى end؛ Shift مع سهم يحرّك end وحده والنشطة في مكانها. وtabStart عمود بدء
 * سلسلة Tab: Enter بعدها ينزل إلى الصفّ التالي في ذلك العمود (كإكسل حين يُملأ صفّ بـTab ثمّ Enter).
 */
export interface Selection {
  cursor: Pos;
  anchor: Pos;
  end: Pos;
  tabStart: number | null;
}

/** النطاق بحدوده: أوّل صفّ وآخره، وأوّل عمود وآخره (بترتيب الأعمدة). */
export interface Range {
  top: number;
  bottom: number;
  first: number;
  last: number;
}

/** شكل الجدول كما يحتاجه التنقّل. */
export interface Shape {
  rows: number;
  cols: number;
  /** الأعمدة التي تُكتب أو تُفتح (بترتيبها): Tab يمرّ عليها وحدها. */
  stops: readonly number[];
  /** عمود يُفتح ولا يُكتب فيه (العلف: نافذته)؛ Enter عليه يفتحه. */
  opener: number | null;
  /** الجدول من اليمين إلى اليسار: السهم الأيسر إلى العمود التالي على الشاشة. */
  rtl: boolean;
  /** صفوف شاشة واحدة (PageUp وPageDown). */
  page: number;
  /** خانة فارغة: Ctrl مع سهم يقفز إلى حدّ البيانات كإكسل. */
  empty(pos: Pos): boolean;
}

export const at = (pos: Pos): Selection => ({ cursor: pos, anchor: pos, end: pos, tabStart: null });

export const rangeOf = (sel: Selection): Range => ({
  top: Math.min(sel.anchor.row, sel.end.row),
  bottom: Math.max(sel.anchor.row, sel.end.row),
  first: Math.min(sel.anchor.col, sel.end.col),
  last: Math.max(sel.anchor.col, sel.end.col),
});

export const within = (range: Range, pos: Pos): boolean => pos.row >= range.top && pos.row <= range.bottom && pos.col >= range.first && pos.col <= range.last;

/** أكثر من خانة محدّدة. */
export const isRange = (sel: Selection): boolean => sel.anchor.row !== sel.end.row || sel.anchor.col !== sel.end.col;

export const samePos = (a: Pos, b: Pos): boolean => a.row === b.row && a.col === b.col;

/** كلّ مواضع النطاق صفّاً صفّاً. */
export function cellsOf(range: Range): Pos[] {
  const out: Pos[] = [];
  for (let row = range.top; row <= range.bottom; row += 1) for (let col = range.first; col <= range.last; col += 1) out.push({ row, col });
  return out;
}

const clampRow = (row: number, shape: Pick<Shape, 'rows'>): number => Math.min(Math.max(row, 0), Math.max(shape.rows - 1, 0));
const clampCol = (col: number, shape: Pick<Shape, 'cols'>): number => Math.min(Math.max(col, 0), Math.max(shape.cols - 1, 0));
const clamp = (pos: Pos, shape: Pick<Shape, 'rows' | 'cols'>): Pos => ({ row: clampRow(pos.row, shape), col: clampCol(pos.col, shape) });

/**
 * Ctrl مع سهم كإكسل: من خانة فيها شيء وجارتها فيها شيء إلى آخر خانة متّصلة فيها شيء؛ وإلّا إلى أوّل خانة فيها شيء في ذلك الاتجاه، أو طرف الجدول.
 */
export function jump(pos: Pos, dRow: number, dCol: number, shape: Shape): Pos {
  const inside = (p: Pos) => p.row >= 0 && p.row < shape.rows && p.col >= 0 && p.col < shape.cols;
  const step = (p: Pos): Pos => ({ row: p.row + dRow, col: p.col + dCol });
  const filled = (p: Pos) => !shape.empty(p);
  let next = step(pos);
  if (!inside(next)) return pos;
  if (filled(pos) && filled(next)) {
    while (inside(step(next)) && filled(step(next))) next = step(next);
    return next;
  }
  while (!filled(next)) {
    const after = step(next);
    if (!inside(after)) return next;
    next = after;
  }
  return next;
}

/** نقل الخانة النشطة (بلا Shift: يُطوى النطاق إليها) أو مدّ النطاق (بـShift: end وحده). */
function moveTo(sel: Selection, target: Pos, extend: boolean, shape: Shape): Selection {
  const pos = clamp(target, shape);
  return extend ? { ...sel, end: pos, tabStart: null } : at(pos);
}

/**
 * Enter وShift+Enter بلا تعديل أو بعد حفظه: في نطاق تنتقل النشطة داخله عموداً عموداً (من الأعلى إلى الأسفل ثمّ العمود التالي، ثمّ تعود لأوّله) والنطاق
 * باقٍ كإكسل؛ وبلا نطاق إلى الصفّ التالي (أو السابق)، وبعد سلسلة Tab إلى عمود بدئها.
 */
export function enterMove(sel: Selection, back: boolean, shape: Shape): Selection {
  if (isRange(sel)) {
    const range = rangeOf(sel);
    const order = [];
    for (let col = range.first; col <= range.last; col += 1) for (let row = range.top; row <= range.bottom; row += 1) order.push({ row, col });
    const index = order.findIndex((pos) => samePos(pos, sel.cursor));
    const next = order[(index + (back ? order.length - 1 : 1)) % order.length] ?? sel.cursor;
    return { ...sel, cursor: next };
  }
  const row = clampRow(sel.cursor.row + (back ? -1 : 1), shape);
  const col = !back && sel.tabStart !== null ? sel.tabStart : sel.cursor.col;
  return at({ row, col });
}

/**
 * Tab وShift+Tab: في نطاق تنتقل النشطة داخله صفّاً صفّاً؛ وبلا نطاق إلى العمود التالي الذي يُكتب (أو السابق)، ومن آخره إلى أوّل عمود يُكتب في الصفّ التالي
 * (كورقة محميّة في إكسل). ويُحفظ عمود بدء السلسلة لـEnter.
 */
export function tabMove(sel: Selection, back: boolean, shape: Shape): Selection {
  if (isRange(sel)) {
    const range = rangeOf(sel);
    const order = [];
    for (let row = range.top; row <= range.bottom; row += 1) for (let col = range.first; col <= range.last; col += 1) order.push({ row, col });
    const index = order.findIndex((pos) => samePos(pos, sel.cursor));
    const next = order[(index + (back ? order.length - 1 : 1)) % order.length] ?? sel.cursor;
    return { ...sel, cursor: next };
  }
  const stops = shape.stops;
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  if (firstStop === undefined || lastStop === undefined) return sel;
  const { row, col } = sel.cursor;
  const start = sel.tabStart ?? col;
  if (!back) {
    const next = stops.find((stop) => stop > col);
    if (next !== undefined) return { ...at({ row, col: next }), tabStart: start };
    if (row + 1 < shape.rows) return { ...at({ row: row + 1, col: firstStop }), tabStart: null };
    return sel;
  }
  const previous = [...stops].reverse().find((stop) => stop < col);
  if (previous !== undefined) return { ...at({ row, col: previous }), tabStart: start };
  if (row > 0) return { ...at({ row: row - 1, col: lastStop }), tabStart: null };
  return sel;
}

export interface KeyLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** ما يفعله مفتاح والخانة محدّدة بلا تعديل. */
export type GridIntent =
  /** تحديد جديد؛ reveal الخانة التي تُمرَّر إليها (طرف النطاق حين يُمدّ). */
  | { kind: 'move'; selection: Selection; reveal: Pos }
  /** كتابة حرف تبدأ التعديل وتستبدل القيمة به. */
  | { kind: 'type'; text: string }
  /** F2: التعديل بالقيمة كما هي. */
  | { kind: 'edit' }
  /** Enter على خانة تُفتح (العلف: نافذته). */
  | { kind: 'open' }
  /** Delete: امسح المحدّد. */
  | { kind: 'clear' }
  /** Backspace: التعديل بخانة فارغة (كإكسل). */
  | { kind: 'backspace' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'escape' }
  /** ليس للجدول (النسخ واللصق أحداثهما من المتصفّح، وغيرها يمرّ). */
  | { kind: 'pass' };

const mod = (key: KeyLike): boolean => Boolean(key.ctrlKey || key.metaKey);
/** حرف الاختصار بموضع مفتاحه (لوحة عربية: Ctrl+Z يأتي key = «ئ» وcode = KeyZ). */
const letter = (key: KeyLike, char: string): boolean => key.key.toLowerCase() === char || key.code === `Key${char.toUpperCase()}`;
/** حرف واحد يُكتب (لا مفتاح بالاسم مثل Enter ولا اختصار). */
export const printable = (key: KeyLike): boolean => [...key.key].length === 1 && !mod(key) && !key.altKey;

/** عمود الشاشة التالي للسهم: في rtl السهم الأيسر إلى العمود التالي (+1) والأيمن إلى السابق. */
export const arrowCols = (key: string, rtl: boolean): number => ((key === 'ArrowLeft') === rtl ? 1 : -1);

/**
 * ما يفعله مفتاح والجدول في وضع التعديل بلا خانة تُكتب الآن. وكلّ مفتاح مع Alt للمتصفّح والنظام كما هو (Alt+← وAlt+→ رجوعٌ وتقدّم في الصفحات، لا تنقّل
 * في الخانات؛ المراجعة R12).
 */
export function gridKey(sel: Selection, key: KeyLike, shape: Shape): GridIntent {
  if (key.altKey) return { kind: 'pass' };
  const extend = Boolean(key.shiftKey);
  const from = extend ? sel.end : sel.cursor;
  const move = (target: Pos, keepTab = false): GridIntent => {
    const selection = moveTo(sel, target, extend, shape);
    const next = keepTab ? { ...selection, tabStart: sel.tabStart } : selection;
    return { kind: 'move', selection: next, reveal: extend ? next.end : next.cursor };
  };
  switch (key.key) {
    case 'ArrowUp':
    case 'ArrowDown': {
      const d = key.key === 'ArrowUp' ? -1 : 1;
      return move(mod(key) ? jump(from, d, 0, shape) : { row: from.row + d, col: from.col });
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      const d = arrowCols(key.key, shape.rtl);
      return move(mod(key) ? jump(from, 0, d, shape) : { row: from.row, col: from.col + d });
    }
    case 'Home':
      return move(mod(key) ? { row: 0, col: 0 } : { row: from.row, col: 0 });
    case 'End':
      return move(mod(key) ? { row: shape.rows - 1, col: shape.cols - 1 } : { row: from.row, col: shape.cols - 1 });
    case 'PageUp':
    case 'PageDown':
      return move({ row: from.row + (key.key === 'PageUp' ? -shape.page : shape.page), col: from.col });
    case 'Tab': {
      if (mod(key)) return { kind: 'pass' };
      const selection = tabMove(sel, extend, shape);
      // من آخر خانة تُكتب (أو أوّلها بـShift) يخرج التركيز من الجدول إلى ما بعده في الصفحة (أو قبله: «انتهيت»)، فلوحة المفاتيح لا تُحبس فيه.
      if (samePos(selection.cursor, sel.cursor) && !isRange(sel)) return { kind: 'pass' };
      return { kind: 'move', selection, reveal: selection.cursor };
    }
    case 'Enter': {
      if (mod(key)) return { kind: 'pass' };
      if (!isRange(sel) && sel.cursor.col === shape.opener) return { kind: 'open' };
      const selection = enterMove(sel, extend, shape);
      return { kind: 'move', selection, reveal: selection.cursor };
    }
    case 'F2':
      return { kind: 'edit' };
    case 'Delete':
      return { kind: 'clear' };
    case 'Backspace':
      return { kind: 'backspace' };
    case 'Escape':
      return { kind: 'escape' };
    default:
      break;
  }
  if (mod(key)) {
    if (letter(key, 'z')) return key.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (letter(key, 'y')) return { kind: 'redo' };
    if (letter(key, 'a')) {
      const selection = { cursor: sel.cursor, anchor: { row: 0, col: 0 }, end: { row: shape.rows - 1, col: shape.cols - 1 }, tabStart: null };
      return { kind: 'move', selection, reveal: sel.cursor };
    }
    if (key.key === ' ') {
      const selection = { cursor: sel.cursor, anchor: { row: 0, col: sel.cursor.col }, end: { row: shape.rows - 1, col: sel.cursor.col }, tabStart: null };
      return { kind: 'move', selection, reveal: sel.cursor };
    }
    return { kind: 'pass' };
  }
  if (key.key === ' ' && key.shiftKey) {
    const selection = { cursor: sel.cursor, anchor: { row: sel.cursor.row, col: 0 }, end: { row: sel.cursor.row, col: shape.cols - 1 }, tabStart: null };
    return { kind: 'move', selection, reveal: sel.cursor };
  }
  if (printable(key)) return { kind: 'type', text: key.key };
  return { kind: 'pass' };
}

/** ما يفعله مفتاح وخانة تُكتب: «enter» بدأت بحرف (الأسهم تحفظ وتنتقل كإكسل)، و«edit» بـF2 أو نقرتين (الأسهم داخل النصّ). */
export type EditMode = 'enter' | 'edit';
export type EditIntent =
  /** احفظ ثمّ انتقل إلى then (أو ابقَ: then = null). */
  | { kind: 'commit'; then: Selection | null; reveal: Pos | null }
  | { kind: 'cancel' }
  /** F2 يبدّل بين الوضعين. */
  | { kind: 'toggle' }
  | { kind: 'pass' };

export function editKey(sel: Selection, key: KeyLike, mode: EditMode, shape: Shape): EditIntent {
  // Alt مع أيّ مفتاح للمتصفّح (Alt+← رجوع) لا للمحرّر (المراجعة R12).
  if (key.altKey) return { kind: 'pass' };
  const commit = (then: Selection | null): EditIntent => ({ kind: 'commit', then, reveal: then ? then.cursor : null });
  switch (key.key) {
    case 'Enter':
      return commit(mod(key) ? null : enterMove(sel, Boolean(key.shiftKey), shape));
    case 'Tab':
      if (mod(key)) return { kind: 'pass' };
      return commit(tabMove(sel, Boolean(key.shiftKey), shape));
    case 'Escape':
      return { kind: 'cancel' };
    case 'F2':
      return { kind: 'toggle' };
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (mode === 'edit' || mod(key) || key.shiftKey) return { kind: 'pass' };
      const dRow = key.key === 'ArrowUp' ? -1 : key.key === 'ArrowDown' ? 1 : 0;
      const dCol = dRow === 0 ? arrowCols(key.key, shape.rtl) : 0;
      return commit(at(clamp({ row: sel.cursor.row + dRow, col: sel.cursor.col + dCol }, shape)));
    }
    default:
      return { kind: 'pass' };
  }
}

/**
 * عدد صحيح غير سالب كما يكتبه الإنسان أو ينسخه من إكسل: أرقام غربية أو عربية، وفاصلة الآلاف في مكانها وحده («1,234»؛ و«0,5» ليست عدداً، درس
 * 2026-10-24)، و«12.0» = 12؛ وغيره null.
 */
export function parseCount(text: string): number | null {
  const value = parseDecimal(text, 0);
  if (value === null || value.units < 0n) return null;
  return value.units > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value.units);
}

/** رقم أو حرف من لوحة الحاسوب يبدأ تعديل خانة رقمية: الأرقام الغربية والعربية والفارسية وحدها. */
export const digitKey = (text: string): boolean => /^[0-9\u{660}-\u{669}\u{6F0}-\u{6F9}]$/u.test(text);

/** خانة بنصّ إكسل: بين علامتي تنصيص إن كان فيها جدولة أو سطر جديد أو علامة تنصيص (والعلامة تُضاعف). */
const tsvCell = (text: string): string => (/[\t\n\r"]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text);

/** نصّ الخانات بعلامة الجدولة بين الخانات وسطر لكلّ صفّ، كما ينسخه إكسل ويلصقه. */
export function toTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(tsvCell).join('\t')).join('\r\n');
}

/**
 * نصّ ملصوق من إكسل (أو من هذا الجدول) إلى خانات: صفّ لكلّ سطر وخانة لكلّ جدولة، والخانة بين علامتي تنصيص تحمل الجدولة والسطر الجديد، والسطر الأخير
 * الفارغ (يضيفه إكسل) لا يُعدّ صفّاً.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let fresh = true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && fresh) {
      quoted = true;
      fresh = false;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      fresh = true;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      fresh = true;
      continue;
    }
    cell += ch;
    fresh = false;
  }
  if (!fresh || cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** نصّ النطاق المحدّد للنسخ: text(pos) نصّ كلّ خانة. */
export function selectionTsv(sel: Selection, text: (pos: Pos) => string): string {
  const range = rangeOf(sel);
  const rows: string[][] = [];
  for (let row = range.top; row <= range.bottom; row += 1) {
    const cells: string[] = [];
    for (let col = range.first; col <= range.last; col += 1) cells.push(text({ row, col }));
    rows.push(cells);
  }
  return toTsv(rows);
}

/** خانة يُلصق فيها: موضعها في الجدول والنصّ الملصوق كما هو. */
export interface PasteTarget {
  pos: Pos;
  raw: string;
}

/**
 * أين يقع كلّ ما يُلصق: من أوّل خانة في التحديد (أعلى النطاق وأوّل أعمدته) صفّاً بصفّ وعموداً بعمود؛ وقيمة واحدة على نطاق تملؤه كلّه (كإكسل). وما وقع
 * بعد آخر صفّ أو آخر عمود يُعدّ ولا يُلصق.
 */
export function pasteTargets(block: readonly (readonly string[])[], sel: Selection, shape: Pick<Shape, 'rows' | 'cols'>): { targets: PasteTarget[]; outside: number } {
  const range = rangeOf(sel);
  const single = block.length === 1 && block[0]?.length === 1 ? block[0][0] : undefined;
  if (single !== undefined && isRange(sel)) return { targets: cellsOf(range).map((pos) => ({ pos, raw: single })), outside: 0 };
  const targets: PasteTarget[] = [];
  let outside = 0;
  block.forEach((cells, i) =>
    cells.forEach((raw, j) => {
      const pos = { row: range.top + i, col: range.first + j };
      if (pos.row >= shape.rows || pos.col >= shape.cols) outside += 1;
      else targets.push({ pos, raw });
    }),
  );
  return { targets, outside };
}
