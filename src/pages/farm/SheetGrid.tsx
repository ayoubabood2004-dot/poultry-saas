import './sheetGrid.css';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column, type DataGrid } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import type { Day } from '../../domain/dates';
import { roundHalfAway } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { fmtDay, fmtInt, fmtMilli } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import type { SheetDay } from '../../lib/repo/hallSheet';
import {
  at,
  cellsOf,
  digitKey,
  editKey,
  enterMove,
  fillDown,
  gridKey,
  isRange,
  parseCount,
  parseLiters,
  parseTsv,
  pasteTargets,
  rangeOf,
  samePos,
  selectionTsv,
  within,
  type EditMode,
  type Pos,
  type Range,
  type Selection,
  type Shape,
} from './gridLogic';

// ورقة القاعة مقفولة وفوقها قلم، وبعده جدول كإكسل (عقد 0036 الجزء S2؛ كلمة المالك 2026-11-24: «يكون مقفول… بس اكو شعار قلم مال تعديل فوك الجدول… بعد ما
// اضغط زر التعديل… اريد الجدول يكون التحكم بي مثل جداول الاكسل يعني لمن ادوس ازرار الاسهم اكدر اتحرك بين الجداول وبين الخلايا… حتى الي يستخدم انظمة اكسل
// ما يحس بالفرق… حاول توفر كل وسائل الراحة وسهولة الاستخدام الي تعرفها حتى لو ما اذكرها الك»). الجدول نفسه (DataTable بأعمدة الورقة) في الوضعين، وهذا
// المكوّن يلفّه: مقفولاً لا خانة تُلمس ولا زرّ فيها، وفي وضع التعديل شبكة (role="grid") بخانة نشطة ونطاق، والأسهم بموضعها على الشاشة، وEnter وTab والكتابة
// فوق القيمة وF2 والنقرتان وEsc وDelete وHome/End وCtrl+Home/End وPageUp/PageDown وCtrl مع سهم، والنسخ واللصق بنصّ إكسل بعد تأكيد يسمّي كلّ يوم وقيمته،
// والملء (Ctrl+D وCtrl+Enter) بالتأكيد نفسه، والتراجع والإعادة، ومجموع النطاق كشريط حال إكسل. واللمس (أو شاشة اللمس): لمسة الخانة تفتح ورقتها السفلية القائمة،
// وما تحفظه يدخل التراجع كالمكتوب. وخانة العلف تفتح نافذة العلف ولا يُصرف شيء بضغطة (جواب المالك). والكتابة كلّها من الورقة نفسها (commit: save_flock_day
// بنسخة صفّ اليوم وset_flock_gas بالطابور والرافع الواحد)، والقيمة تظهر فور الحفظ («بانتظار الرفع» حتى يُعرف مصيرها)، وما رُدّ يُقال في خانته. والتحديد
// والمحرّر بيوم الخانة وعمودها لا برقم صفّها (المراجعة العدائية R3)، والمحرّر المفتوح تعديلٌ لم يُحفظ (R2) لا يفقد تركيزه بنقرة (R1، R6).

export type GridField = 'age' | 'date' | 'dead' | 'gas' | 'kerosene' | 'feed' | 'eggs' | 'note';
export type WriteField = 'dead' | 'gas' | 'kerosene' | 'eggs' | 'note';
/** قيمة خانة: عدد (الهلاكات والغاز والبيض)، أو نصّ (الملاحظة)، أو null: فارغة (الغاز بلا قنانٍ، والملاحظة بلا نصّ). */
export type CellValue = number | string | null;

/** خانة كما تراها الشبكة الآن (قراءة الخادم وما على الجهاز معاً). */
export interface GridCell {
  value: CellValue;
  /** نصّ الخانة للنسخ ولبدء التعديل: أرقام بلا فواصل (يقرؤها إكسل بأيّ لغة)، والتاريخ يوم/شهر/سنة. */
  copy: string;
  /** القيمة بالآلاف لمجموع النطاق (العدد × 1,000، والعلف كيلو بالآلاف)، أو null. */
  milli: bigint | null;
  /** ما يُقال عنها: القيمة بفواصلها، أو «فارغة». */
  spoken: string;
  /** write: تُكتب في مكانها؛ feed: تفتح نافذة العلف؛ read: للقراءة وحدها. */
  access: 'write' | 'feed' | 'read';
  /** لماذا لا تُكتب: رسالة الشريط حين يُكتب فيها. */
  why: string | null;
}

export interface CellChange {
  on: Day;
  field: WriteField;
  value: CellValue;
}

/**
 * فحص تغيير قبل الكتابة بقواعد ورقة الخانة نفسها: ok بنصّ ما سيصير، أو error بجملته. وهل هو تغييرٌ أصلاً يقرّره الجدول بما تعرضه الخانة الآن (ما حُفظ للتوّ
 * ورفعه في الطريق، أو قراءتها؛ المراجعة R11)، والكتابة (commit) بما في الطابور لحظتها.
 */
export type ChangeCheck = { kind: 'ok'; shown: string } | { kind: 'error'; error: string };
/**
 * مصير تغيير: saved في الخادم، أو device على هذا الجهاز ينتظر الرفع، أو same، أو error (لم يُكتب: سببه)، أو failed (لم يُحفظ: سببه؛ وrefused حين ردّه الخادم
 * وقيل بتنبيه).
 */
export type ChangeResult = { kind: 'saved' } | { kind: 'device' } | { kind: 'same' } | { kind: 'error'; error: string } | { kind: 'failed'; message: string; refused?: boolean };

/** كتابة خانة من ورقتها السفلية بالجدول نفسه: القيمة (عدد، أو نصّ الملاحظة، أو null: امسح الغاز) ومصيرها. */
export type SheetSubmit = (value: CellValue) => Promise<ChangeResult>;

/** محتوى خانة يرسمه الجدول نفسه: بقيمة أخرى تُعرض مكان قيمته (ما حُفظ للتوّ ولم تصلها القراءة) و«بانتظار الرفع»، أو بلا شيء (قيمته كما هي). */
export type CellRender = (override?: { value: CellValue; pending: boolean }) => ReactNode;

export interface SheetGridView {
  /** سمات الشبكة لـDataTable في وضع التعديل، وundefined والجدول مقفول. */
  table: DataGrid<SheetDay> | undefined;
  /** محتوى خانة: المحرّر إن كانت تُكتب الآن، أو ما حُفظ للتوّ، أو قيمتها؛ وما رُدّ تحتها. */
  content(day: SheetDay, row: number, field: GridField, render: CellRender): ReactNode;
}

export interface SheetGridProps {
  /** عنوان الجدول («هلاكات قاعة (7)»): اسم الشبكة لقارئ الشاشة. */
  title: string;
  days: readonly SheetDay[];
  /** أعمدة الجدول بترتيبها (مفاتيح أعمدة SheetTable). */
  fields: readonly GridField[];
  today: Day;
  /** يظهر القلم: الوجبة قائمة ولصاحب الشاشة الكتابة. */
  canEdit: boolean;
  online: boolean;
  cell(day: SheetDay, field: GridField): GridCell;
  label(field: GridField): string;
  check(changes: readonly CellChange[]): ChangeCheck[];
  commit(changes: readonly CellChange[]): Promise<ChangeResult[]>;
  /** اللمس: ورقة الخانة السفلية (CellSheet)، تكتب بـsubmit من الجدول نفسه فيدخل ما تحفظه التراجع والإعادة كالمكتوب بلوحة المفاتيح (المراجعة R13). */
  openSheet(day: SheetDay, field: WriteField, submit: SheetSubmit): void;
  /** نافذة العلف لذلك اليوم (FeedSheet). */
  openFeed(day: SheetDay): void;
  children(view: SheetGridView): ReactNode;
}

const WRITE_FIELDS: readonly GridField[] = ['dead', 'gas', 'kerosene', 'eggs', 'note'];
const STOP_FIELDS: readonly GridField[] = ['dead', 'gas', 'kerosene', 'feed', 'eggs', 'note'];
const isWrite = (field: GridField): field is WriteField => WRITE_FIELDS.includes(field);

/**
 * خانة بيومها وعمودها: التحديد والمحرّر والمنسوخ تُحفظ بها لا برقم صفّها، فقراءةٌ تزيح الصفوف (التسكين أُزيح يوماً من جهاز آخر) لا تنقلها إلى يوم آخر
 * (المراجعة R3)؛ وصفّها يُحسب منها عند كلّ رسم وكلّ مفتاح.
 */
interface CellAt {
  on: Day;
  field: GridField;
}

/** التحديد بخاناته (gridLogic يعمل بالمواضع: يُحوَّل إليها ومنها). */
interface Sel {
  cursor: CellAt;
  anchor: CellAt;
  end: CellAt;
  tabStart: number | null;
}

interface Editing {
  at: CellAt;
  text: string;
  mode: EditMode;
  error: string | null;
}

/** قيمة حُفظت للتوّ تُعرض حتى تصلها القراءة: sending ما دام مصيرها لم يُعرف؛ وبعده تبقى ما دامت القراءة هي نفسها (model). */
interface Overlay {
  token: number;
  value: CellValue;
  sending: boolean;
  model: SheetGridProps['cell'] | null;
}

/** تغيير حُفظ: قبله وبعده (للتراجع والإعادة). */
interface StepEntry {
  on: Day;
  field: WriteField;
  before: CellValue;
  after: CellValue;
}

interface History {
  undo: StepEntry[][];
  redo: StepEntry[][];
}

interface BatchEntry {
  key: string;
  day: SheetDay;
  field: GridField;
  before: string;
  after: string;
  /** ok: يُكتب؛ same: بلا تغيير؛ skip: لا يُكتب (reason). */
  status: 'ok' | 'same' | 'skip';
  reason: string | null;
  change: CellChange | null;
}

interface Batch {
  kind: 'paste' | 'clear' | 'fill';
  entries: BatchEntry[];
  outside: number;
}

const cellKey = (on: Day, field: GridField): string => `${on}:${field}`;
const sameCell = (a: CellAt, b: CellAt): boolean => a.on === b.on && a.field === b.field;

/** صفّ يومٍ في الورقة؛ ويومٌ لم يعد فيها: أوّل يوم بعده (أو آخر يوم). */
function rowIn(days: readonly SheetDay[], on: Day): number {
  const exact = days.findIndex((day) => day.on === on);
  if (exact >= 0) return exact;
  const after = days.findIndex((day) => day.on > on);
  return after >= 0 ? after : Math.max(days.length - 1, 0);
}

const posIn = (days: readonly SheetDay[], fields: readonly GridField[], cell: CellAt): Pos => ({ row: rowIn(days, cell.on), col: Math.max(fields.indexOf(cell.field), 0) });

function cellIn(days: readonly SheetDay[], fields: readonly GridField[], pos: Pos): CellAt | null {
  const day = days[pos.row];
  const field = fields[pos.col];
  return day && field ? { on: day.on, field } : null;
}

const selIn = (days: readonly SheetDay[], fields: readonly GridField[], sel: Sel): Selection => ({
  cursor: posIn(days, fields, sel.cursor),
  anchor: posIn(days, fields, sel.anchor),
  end: posIn(days, fields, sel.end),
  tabStart: sel.tabStart,
});

/** أطراف النطاق التي تقع عليها الخانة (أعلاه وأسفله وأوّل أعمدته وآخرها): خطّها بلون العلامة (sheetGrid.css، المراجعة R10). */
function edgesOf(range: Range, pos: Pos): string | undefined {
  const sides = [pos.row === range.top ? 'top' : '', pos.row === range.bottom ? 'bottom' : '', pos.col === range.first ? 'first' : '', pos.col === range.last ? 'last' : ''].filter((side) => side !== '');
  return sides.length > 0 ? sides.join(' ') : undefined;
}

/** خانة الجدول بموضعها (data-cell)، في المتصفّح وفي DOM الفحوص. */
function findCell(root: HTMLElement | null, pos: Pos): HTMLElement | null {
  if (!root) return null;
  const name = `${pos.row}:${pos.col}`;
  const quick = typeof root.querySelector === 'function' ? root.querySelector<HTMLElement>(`[data-cell="${name}"]`) : null;
  if (quick) return quick;
  const walk = (node: Element): HTMLElement | null => {
    for (const child of Array.from(node.children)) {
      if (child.getAttribute('data-cell') === name) return child as HTMLElement;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(root);
}

type Hit = { getAttribute?: (name: string) => string | null; parentNode?: Hit | null };

/** موضع الخانة التي وقع عليها حدث (يصعد من العنصر حتى الغلاف، بلا closest: يعمل في كلّ DOM). */
function cellFrom(target: EventTarget | null, root: HTMLElement | null): Pos | null {
  for (let node = target as Hit | null; node && node !== (root as unknown as Hit); node = node.parentNode ?? null) {
    const name = node.getAttribute?.('data-cell');
    if (name) {
      const [row, col] = name.split(':').map((part) => Number(part));
      return row !== undefined && col !== undefined && Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
    }
  }
  return null;
}

/** الجدول من اليمين إلى اليسار؟ من اتجاهه المحسوب، وإلّا من أقرب dir، وإلّا عربيّ. */
function rtlAt(element: HTMLElement | null): boolean {
  const computed = element && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element).direction : undefined;
  if (computed === 'rtl' || computed === 'ltr') return computed === 'rtl';
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const dir = node.getAttribute('dir');
    if (dir === 'rtl' || dir === 'ltr') return dir === 'rtl';
  }
  return document.documentElement.getAttribute('dir') !== 'ltr';
}

/** صفوف شاشة واحدة من إطار الجدول القابل للتمرير وارتفاع الصفّ؛ عشرة إن لم تُقس. */
function pageRows(cell: HTMLElement | null): number {
  if (!cell) return 10;
  let box = cell.parentElement;
  while (box && !(box.getAttribute('class') ?? '').includes('overflow-auto')) box = box.parentElement;
  const height = typeof cell.getBoundingClientRect === 'function' ? cell.getBoundingClientRect().height : 0;
  if (!box || !(height > 0) || !(box.clientHeight > 0)) return 10;
  return Math.max(1, Math.floor(box.clientHeight / height) - 2);
}

/** شاشة لمس (إصبع لا فأرة): لمسة الخانة تفتح ورقتها. */
const coarse = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

const sameValue = (a: CellValue, b: CellValue): boolean => (typeof a === 'string' ? a.trim() : a) === (typeof b === 'string' ? b.trim() : b);

/**
 * القيمة نفسها التي تعرضها الخانة الآن (ما حُفظ للتوّ ورفعه في الطريق، أو قراءتها): لا شيء يُكتب. ويُقارَن بما تعرضه لا بلقطة الرسم، فتصحيحٌ إلى القيمة
 * المحفوظة والرفع قبله في الطريق يُكتب (المراجعة R11). والفارغة ليست صفراً (الصفر يُسجَّل)، والملاحظة الفارغة بلا نصّ.
 */
const sameShownValue = (field: WriteField, value: CellValue, shown: CellValue): boolean =>
  field === 'note' ? (typeof value === 'string' ? value.trim() : '') === (typeof shown === 'string' ? shown.trim() : '') : value === shown;

/** قيمة «امسح» لكلّ خانة: الغاز بلا قنانٍ، والملاحظة بلا نصّ، والهلاكات والبيض صفر. */
const clearValue = (field: WriteField): CellValue => (field === 'gas' || field === 'kerosene' ? null : field === 'note' ? '' : 0);
/** عدد الخانة من نصّه: الكاز باللتر أو بالبرميل («2ب» = 400 لتر، 0037)، والباقي عدد صحيح. */
const countOf = (field: WriteField, text: string): number | null => (field === 'kerosene' ? parseLiters(text) : parseCount(text));

/** ما يعيده التراجع: القيمة السابقة؛ والهلاكات والبيض الفارغة تعود صفراً (لا يُمحى صفّ يوم)، والغاز الفارغ بلا قنانٍ، والملاحظة الفارغة بلا نصّ. */
const restoreValue = (field: WriteField, value: CellValue): CellValue => (value === null || value === '' ? clearValue(field) : value);

/** زرّ في شريط وضع التعديل لا يأخذ التركيز بالفأرة: المحرّر والخانة النشطة يبقيان كما كانا (المراجعة R1). */
const keepFocus = (event: ReactMouseEvent) => event.preventDefault();

/** قلم التعديل (رسم lucide «pencil»، رخصة ISC) مرسوماً هنا: أيقونة lucide مشتركة بين حزم كسولة تفصل حزمة مشتركة (درس 2026-11-10). */
function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

/** دليل المفاتيح في شريط وضع التعديل. */
function KeyGuide() {
  const items: { keys: string[]; text: string }[] = [
    { keys: ['\u{2190}', '\u{2192}', '\u{2191}', '\u{2193}'], text: t('sheet.grid.k.move', 'للتنقّل') },
    { keys: ['0–9'], text: t('sheet.grid.k.type', 'اكتب الرقم مكان القيمة') },
    { keys: ['Enter'], text: t('sheet.grid.k.enter', 'للحفظ والنزول') },
    { keys: ['Tab'], text: t('sheet.grid.k.tab', 'للخانة التالية') },
    { keys: ['F2'], text: t('sheet.grid.k.f2', 'لتعديل القيمة كما هي') },
    { keys: ['Delete'], text: t('sheet.grid.k.delete', 'للمسح') },
    { keys: ['Esc'], text: t('sheet.grid.k.esc', 'للإلغاء') },
    { keys: ['Ctrl+C', 'Ctrl+V'], text: t('sheet.grid.k.copy', 'للنسخ واللصق من إكسل وإليه') },
    { keys: ['Ctrl+D'], text: t('sheet.grid.k.fill_down', 'لملء المحدّد من صفّه الأوّل') },
    { keys: ['Ctrl+Enter'], text: t('sheet.grid.k.fill_typed', 'لملء المحدّد بما كُتب') },
    { keys: ['Ctrl+Z', 'Ctrl+Y'], text: t('sheet.grid.k.undo', 'للتراجع والإعادة') },
    { keys: ['Shift'], text: t('sheet.grid.k.shift', 'مع الأسهم لتحديد عدّة خانات') },
  ];
  return (
    <p className="sg-guide sg-keys" data-action="grid-guide">
      {items.map((item, index) => (
        <span key={item.text}>
          {index > 0 ? t('list.separator', '، ') : null}
          {item.keys.map((key) => (
            <Key key={key}>{key}</Key>
          ))}{' '}
          {item.text}
        </span>
      ))}
    </p>
  );
}

export function SheetGrid(props: SheetGridProps) {
  const { days, fields, canEdit, online } = props;
  const [on, setOn] = useState(false);
  const active = on && canEdit;
  const [sel, setSel] = useState<Sel>(() => {
    const first: CellAt = { on: props.days[0]?.on ?? props.today, field: props.fields[0] ?? 'age' };
    return { cursor: first, anchor: first, end: first, tabStart: null };
  });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [overlay, setOverlay] = useState<Record<string, Overlay>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ anchor: CellAt; end: CellAt } | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [clearing, setClearing] = useState<{ change: CellChange; before: string } | null>(null);
  const [history, setHistory] = useState<History>({ undo: [], redo: [] });
  const [focusTick, setFocusTick] = useState(0);
  const errorId = useId();

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const propsRef = useRef(props);
  const selRef = useRef(sel);
  const editingRef = useRef<Editing | null>(editing);
  const overlayRef = useRef(overlay);
  const historyRef = useRef(history);
  const revealRef = useRef<CellAt | null>(null);
  const tokenRef = useRef(0);
  const lastPointer = useRef<string | null>(null);
  const dragRef = useRef(false);
  const copyArmed = useRef(false);
  const pasteArmed = useRef(false);
  const wasActive = useRef(false);
  /** التركيز للجدول بعد كلّ تحديد أو حفظ ما دام العمل فيه؛ والخروج منه (نقرة على زرّ أو حقل آخر يحفظ المحرّر) لا يسحبه إليه. */
  const claimFocus = useRef(true);
  const handlers = useRef<{ copy: (event: ClipboardEvent) => void; paste: (event: ClipboardEvent) => void } | null>(null);
  /** يحفظ المحرّر المفتوح حين تُترك الصفحة أو تُخفى (المراجعة R2): بأحدث رسم. */
  const leaveRef = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    propsRef.current = props;
  });

  // ─── الخانات بيومها وعمودها: ما يُحفظ وما يُحسب منه (المعالجات تقرأ أحدث ورقة: propsRef) ───────────────────────────────

  const daysNow = () => propsRef.current.days;
  const fieldsNow = () => propsRef.current.fields;
  const posOf = (cell: CellAt): Pos => posIn(daysNow(), fieldsNow(), cell);
  const cellOf = (pos: Pos): CellAt | null => cellIn(daysNow(), fieldsNow(), pos);
  const selNow = (): Selection => selIn(daysNow(), fieldsNow(), selRef.current);
  const dayOf = (on: Day): SheetDay | null => daysNow().find((day) => day.on === on) ?? null;

  const writeSel = (next: Selection, reveal?: Pos | null) => {
    const prev = selRef.current;
    const to = (pos: Pos, fallback: CellAt): CellAt => cellOf(pos) ?? fallback;
    const value: Sel = { cursor: to(next.cursor, prev.cursor), anchor: to(next.anchor, prev.anchor), end: to(next.end, prev.end), tabStart: next.tabStart };
    selRef.current = value;
    revealRef.current = reveal ? to(reveal, value.cursor) : value.cursor;
    setSel(value);
  };
  const writeEdit = (next: Editing | null) => {
    editingRef.current = next;
    setEditing(next);
  };
  const writeOverlay = (change: (current: Record<string, Overlay>) => Record<string, Overlay>) => {
    overlayRef.current = change(overlayRef.current);
    setOverlay(overlayRef.current);
  };
  const writeHistory = (next: History) => {
    historyRef.current = next;
    setHistory(next);
  };

  const infoOf = (cell: CellAt): GridCell | null => {
    const day = dayOf(cell.on);
    return day ? propsRef.current.cell(day, cell.field) : null;
  };
  /** ما حُفظ للتوّ في خانة وما زال معروضاً مكان قراءتها (لم تصلها القراءة بعده)، أو null. */
  const freshOf = (cell: CellAt): Overlay | null => {
    const entry = overlayRef.current[cellKey(cell.on, cell.field)];
    return entry && (entry.sending || entry.model === propsRef.current.cell) ? entry : null;
  };
  /** القيمة كما تُرى الآن: ما حُفظ للتوّ (إن بقي معروضاً) وإلّا قراءة الورقة. */
  const valueOf = (cell: CellAt): CellValue => {
    const fresh = freshOf(cell);
    if (fresh) return fresh.value;
    return infoOf(cell)?.value ?? null;
  };
  /** نصّ الخانة كما تُرى (للنسخ وF2 وCtrl مع سهم): ما حُفظ للتوّ أو قراءتها. */
  const copyOf = (cell: CellAt): string => {
    const fresh = freshOf(cell);
    if (!fresh) return infoOf(cell)?.copy ?? '';
    return fresh.value === null ? '' : typeof fresh.value === 'number' ? String(fresh.value) : fresh.value; // number-ok: نصّ الحافظة والمحرّر، لا عرض
  };
  const copyAtPos = (pos: Pos): string => {
    const cell = cellOf(pos);
    return cell ? copyOf(cell) : '';
  };
  /** ما تقوله الخانة كما تُرى (للتأكيد): العدد بفواصله أو «فارغة». */
  const spokenAt = (cell: CellAt): string => {
    const fresh = freshOf(cell);
    if (!fresh) return infoOf(cell)?.spoken ?? '';
    return fresh.value === null || fresh.value === '' ? t('sheet.grid.empty', 'فارغة') : typeof fresh.value === 'number' ? fmtInt(fresh.value) : fresh.value;
  };

  const shape = (): Shape => {
    const days = daysNow();
    const fields = fieldsNow();
    const cursorCell = findCell(wrapRef.current, posOf(selRef.current.cursor));
    const opener = fields.indexOf('feed');
    return {
      rows: days.length,
      cols: fields.length,
      stops: fields.flatMap((field, index) => (STOP_FIELDS.includes(field) ? [index] : [])),
      opener: opener >= 0 ? opener : null,
      rtl: rtlAt(wrapRef.current),
      page: pageRows(cursorCell),
      empty: (pos) => copyAtPos(pos) === '',
    };
  };

  const say = (text: string | null) => setMessage(text);
  const feedHint = () => t('sheet.grid.feed_hint', 'العلف يُرسل من نافذته: اضغط Enter أو F2 لفتحها، ولا يُكتب في الخانة.');
  const readHint = (info: GridCell | null) => info?.why ?? t('sheet.grid.read_only', 'هذه الخانة للقراءة فقط.');
  const goneText = (edit: Editing) => t('sheet.grid.edit_gone', 'لم يعد يوم {day} في الورقة (قُرئت من جديد)، فأُلغي ما كُتب فيه ولم يُحفظ.', { day: fmtDay(edit.at.on) });

  /** المحرّر المفتوح ما دام يومه في الورقة؛ ويومه إن اختفى بقراءة جديدة يُلغى ما كُتب فيه ويُقال لماذا (المراجعة R3). */
  const editNow = (): Editing | null => {
    const edit = editingRef.current;
    if (!edit || dayOf(edit.at.on)) return edit;
    writeEdit(null);
    say(goneText(edit));
    return null;
  };

  // ─── الكتابة: كلّ تعديل إلى الطابور فوراً (لا ينتظر رفع ما قبله: إغلاق التطبيق لا يضيّعه)، والرافع الواحد يرفعها بالترتيب، والطابور يبني نسخة
  // العملية التالية لليوم نفسه على نسخة ما حُفظ قبلها (removeSaved) ─────────────────────────────────────────────────────────

  /**
   * record: fresh تعديل جديد (يدخل التراجع ويُفرغ الإعادة)، أو undo/redo بخطوته الأصلية (تنتقل بين المكدّسين كما هي: قبلها وبعدها كما كُتبت أوّل مرّة).
   */
  const submit = (changes: readonly CellChange[], record: { kind: 'fresh' } | { kind: 'undo' | 'redo'; step: StepEntry[] }, summary: 'quiet' | 'batch' | 'history'): Promise<ChangeResult[]> => {
    if (changes.length === 0) return Promise.resolve([]);
    const before = changes.map((change) => valueOf(change));
    const tokens = changes.map(() => {
      tokenRef.current += 1;
      return tokenRef.current;
    });
    writeOverlay((current) => {
      const next = { ...current };
      changes.forEach((change, index) => {
        const value = typeof change.value === 'string' ? change.value.trim() : change.value;
        next[cellKey(change.on, change.field)] = { token: tokens[index] ?? 0, value, sending: true, model: null };
      });
      return next;
    });
    setIssues((current) => {
      const next = { ...current };
      for (const change of changes) delete next[cellKey(change.on, change.field)];
      return next;
    });
    return (async () => {
      let results: ChangeResult[];
      try {
        results = await propsRef.current.commit(changes);
      } catch {
        results = changes.map(() => ({ kind: 'failed', message: t('sheet.rejected', 'لم يُحفظ.') }));
      }
      const model = propsRef.current.cell;
      writeOverlay((current) => {
        const next = { ...current };
        changes.forEach((change, index) => {
          const key = cellKey(change.on, change.field);
          const entry = next[key];
          if (!entry || entry.token !== tokens[index]) return;
          const result = results[index];
          if (result?.kind === 'saved' || result?.kind === 'device') next[key] = { ...entry, sending: false, model };
          else delete next[key];
        });
        return next;
      });
      const failed = changes.flatMap((change, index) => {
        const result = results[index];
        return result?.kind === 'failed' ? [{ change, text: result.message }] : result?.kind === 'error' ? [{ change, text: result.error }] : [];
      });
      if (failed.length) {
        setIssues((current) => {
          const next = { ...current };
          for (const { change, text } of failed) next[cellKey(change.on, change.field)] = text;
          return next;
        });
      }
      const done: StepEntry[] = changes.flatMap((change, index) => {
        const result = results[index];
        if (result?.kind !== 'saved' && result?.kind !== 'device') return [];
        return [{ on: change.on, field: change.field, before: before[index] ?? null, after: typeof change.value === 'string' ? change.value.trim() : change.value }];
      });
      if (done.length) {
        const current = historyRef.current;
        if (record.kind === 'fresh') writeHistory({ undo: [...current.undo, done].slice(-50), redo: [] });
        else if (record.kind === 'undo') writeHistory({ undo: current.undo, redo: [...current.redo, record.step].slice(-50) });
        else writeHistory({ undo: [...current.undo, record.step].slice(-50), redo: current.redo });
      }
      const deviceOnly = results.filter((result) => result?.kind === 'device').length;
      const saved = results.filter((result) => result?.kind === 'saved').length;
      if (failed.length) {
        say(
          failed.length === 1 && changes.length === 1 && failed[0]
            ? failed[0].text
            : t('sheet.grid.failed_some', 'لم يُحفظ {n} من {total}: سببه في خانته.', { n: fmtInt(failed.length), total: fmtInt(changes.length) }),
        );
      } else if (summary === 'batch') {
        say(
          deviceOnly > 0
            ? t('sheet.grid.batch_device', 'حُفظ على هذا الجهاز: {n}، ويُرسل حين يعود الاتصال.', { n: fmtInt(deviceOnly + saved) })
            : t('sheet.grid.batch_saved', 'حُفظ: {n}.', { n: fmtInt(saved) }),
        );
      }
      return results;
    })();
  };

  /** ورقة الخانة السفلية (اللمس) تكتب من هنا: ما تحفظه يُعرض في خانته ويدخل التراجع والإعادة كالمكتوب بلوحة المفاتيح (المراجعة R13). */
  const sheetSubmit =
    (target: { on: Day; field: WriteField }): SheetSubmit =>
    async (value) => {
      if (sameShownValue(target.field, value, valueOf(target))) return { kind: 'same' };
      const change: CellChange = { on: target.on, field: target.field, value };
      const [check] = propsRef.current.check([change]);
      if (check?.kind === 'error') return { kind: 'error', error: check.error };
      const [result] = await submit([change], { kind: 'fresh' }, 'quiet');
      return result ?? { kind: 'same' };
    };

  // ─── التعديل داخل الخانة ─────────────────────────────────────────────────────────────────────────────────────────

  const startEdit = (cell: CellAt, text: string, mode: EditMode) => {
    writeEdit({ at: cell, text, mode, error: null });
    setCopied(null);
    say(null);
  };

  /** نصّ المحرّر إلى قيمة: الملاحظة كما هي، والعدد صحيحاً بأرقامه، والفراغ «امسح» (والخانة الفارغة تبقى فارغة بلا كتابة). */
  const editorValue = (field: WriteField, text: string, shown: CellValue): { value: CellValue } | { same: true } | { error: string } => {
    if (field === 'note') return { value: text };
    if (text.trim() === '') return shown === null ? { same: true } : { value: clearValue(field) };
    const n = countOf(field, text);
    if (n === null && field === 'kerosene') return { error: t('sheet.grid.not_liters', 'اكتب اللترات بالأرقام، أو البراميل بعدها «ب» (2ب = 400 لتر).') };
    return n === null ? { error: t('sheet.grid.not_count', 'اكتب عدداً صحيحاً بالأرقام.') } : { value: n };
  };

  /** يحفظ ما في المحرّر ثمّ ينتقل (then)؛ false إن لم يُقبل (الخطأ في الخانة والمحرّر باقٍ). */
  const commitEditor = (then: Selection | null, reveal: Pos | null): boolean => {
    const current = editingRef.current;
    if (!current) return true;
    const day = dayOf(current.at.on);
    if (!day) {
      writeEdit(null);
      say(goneText(current));
      return true;
    }
    const field = current.at.field;
    const info = propsRef.current.cell(day, field);
    if (!isWrite(field) || info.access !== 'write') {
      writeEdit(null);
      return true;
    }
    const shown = valueOf(current.at);
    const parsed = editorValue(field, current.text, shown);
    if ('error' in parsed) {
      writeEdit({ ...current, error: parsed.error });
      return false;
    }
    const finish = () => {
      writeEdit(null);
      if (then) writeSel(then, reveal);
      else setFocusTick((n) => n + 1);
    };
    if ('same' in parsed || sameShownValue(field, parsed.value, shown)) {
      finish();
      return true;
    }
    const change: CellChange = { on: day.on, field, value: parsed.value };
    const [check] = propsRef.current.check([change]);
    if (check?.kind === 'error') {
      writeEdit({ ...current, error: check.error });
      return false;
    }
    // إفراغ الهلاكات أو البيض صفرٌ بعد تأكيد يسمّي اليوم (العقد)؛ والصفر المكتوب صفرٌ بلا سؤال.
    if ((field === 'dead' || field === 'eggs') && current.text.trim() === '') {
      finish();
      setClearing({ change, before: spokenAt(current.at) });
      return true;
    }
    finish();
    void submit([change], { kind: 'fresh' }, 'quiet');
    return true;
  };

  // ─── المسح والنسخ واللصق والملء والتراجع ────────────────────────────────────────────────────────────────────────

  /** دفعة (لصق أو ملء أو مسح نطاق) قبل تأكيدها: كلّ خانة بما سيصير أو لماذا لا يُكتب. */
  const plan = (kind: Batch['kind'], targets: readonly { pos: Pos; raw: string | null }[], outside: number) => {
    const entries: BatchEntry[] = [];
    for (const { pos, raw } of targets) {
      const cell = cellOf(pos);
      const day = cell ? dayOf(cell.on) : null;
      if (!cell || !day) continue;
      const field = cell.field;
      const info = propsRef.current.cell(day, field);
      const shown = valueOf(cell);
      const base = { key: cellKey(day.on, field), day, field, before: spokenAt(cell), after: raw ?? '', change: null };
      const skip = (reason: string): BatchEntry => ({ ...base, status: 'skip', reason });
      if (field === 'age' || field === 'date') {
        entries.push(skip(t('sheet.grid.fixed', 'العمر والتاريخ لا يُكتبان.')));
        continue;
      }
      if (field === 'feed') {
        entries.push(skip(t('sheet.grid.feed_paste', 'العلف يُرسل من نافذته، لا يُلصق.')));
        continue;
      }
      if (info.access !== 'write' || !isWrite(field)) {
        entries.push(skip(readHint(info)));
        continue;
      }
      let value: CellValue;
      if (raw === null) value = clearValue(field);
      else if (field === 'note') value = raw;
      else if (raw.trim() === '') value = clearValue(field);
      else {
        const n = countOf(field, raw);
        if (n === null) {
          entries.push(skip(t('sheet.grid.not_count_of', '«{text}» ليس عدداً صحيحاً.', { text: raw.trim() })));
          continue;
        }
        value = n;
      }
      if (value === 0 && shown === null && (field === 'dead' || field === 'eggs') && (raw === null || raw.trim() === '')) {
        entries.push({ ...base, status: 'same', reason: null });
        continue;
      }
      // «بلا تغيير» بما تعرضه الخانة الآن (ورفعٌ في الطريق معها)، لا بلقطة الرسم (المراجعة R11).
      if (sameShownValue(field, value, shown)) {
        entries.push({ ...base, status: 'same', reason: null });
        continue;
      }
      entries.push({ ...base, status: 'ok', reason: null, change: { on: day.on, field, value } });
    }
    const pending = entries.filter((entry) => entry.change !== null);
    const checks = propsRef.current.check(pending.map((entry) => entry.change as CellChange));
    pending.forEach((entry, index) => {
      const check = checks[index];
      if (check?.kind === 'error') {
        entry.status = 'skip';
        entry.reason = check.error;
        entry.change = null;
      } else if (check) entry.after = check.shown;
    });
    setBatch({ kind, entries, outside });
  };

  const clearSelection = () => {
    const current = selNow();
    if (isRange(current)) {
      const targets = cellsOf(rangeOf(current))
        .filter((pos) => {
          const cell = cellOf(pos);
          const info = cell ? infoOf(cell) : null;
          return cell !== null && info !== null && info.access === 'write' && isWrite(cell.field) && copyOf(cell) !== '';
        })
        .map((pos) => ({ pos, raw: null }));
      if (targets.length === 0) {
        say(t('sheet.grid.nothing_clear', 'لا شيء يُمسح في المحدّد.'));
        return;
      }
      plan('clear', targets, 0);
      return;
    }
    const cell = cellOf(current.cursor);
    const info = cell ? infoOf(cell) : null;
    if (!cell || !info) return;
    const field = cell.field;
    if (info.access === 'feed') {
      say(t('sheet.grid.feed_clear', 'العلف يُصحَّح بـ«ألغِ» من نافذته (Enter لفتحها).'));
      return;
    }
    if (info.access !== 'write' || !isWrite(field)) {
      say(readHint(info));
      return;
    }
    if (copyOf(cell) === '' || ((field === 'dead' || field === 'eggs') && valueOf(cell) === 0)) {
      say(t('sheet.grid.empty_cell', 'الخانة فارغة.'));
      return;
    }
    const change: CellChange = { on: cell.on, field, value: clearValue(field) };
    if (field === 'dead' || field === 'eggs') {
      setClearing({ change, before: spokenAt(cell) });
      return;
    }
    void submit([change], { kind: 'fresh' }, 'quiet');
  };

  /** Ctrl+D كإكسل (المراجعة R9): المحدّد يُملأ من صفّه الأوّل (أو من الصفّ فوقه) بتأكيد اللصق نفسه، ولا شيء يُكتب قبله. */
  const fillSelection = () => {
    const pairs = fillDown(selNow());
    if (pairs.length === 0) {
      say(t('sheet.grid.fill_none', 'لا صفّ فوق المحدّد يُملأ منه.'));
      return;
    }
    plan('fill', pairs.map(({ pos, from }) => ({ pos, raw: copyAtPos(from) })), 0);
  };

  /** Ctrl+Enter والمحدّد نطاق: ما كُتب في الخانة يملأ النطاق كلّه بتأكيد اللصق، ولا شيء يُكتب قبله (كإكسل، المراجعة R9). */
  const fillTyped = () => {
    const edit = editingRef.current;
    if (!edit) return;
    writeEdit(null);
    plan('fill', cellsOf(rangeOf(selNow())).map((pos) => ({ pos, raw: edit.text })), 0);
  };

  const copyText = (): string => selectionTsv(selNow(), copyAtPos);
  const markCopied = (cut: boolean) => {
    const range = rangeOf(selNow());
    setCopied({ anchor: selRef.current.anchor, end: selRef.current.end });
    const count = (range.bottom - range.top + 1) * (range.last - range.first + 1);
    say(cut ? t('sheet.grid.cut', 'نُسخ {n} (القصّ هنا نسخٌ؛ المسح بـDelete).', { n: fmtInt(count) }) : t('sheet.grid.copied', 'نُسخت خانات: {n}.', { n: fmtInt(count) }));
  };
  const pastePlan = (text: string) => {
    const block = parseTsv(text);
    if (block.length === 0 || text === '') {
      say(t('sheet.grid.clipboard_empty', 'لا شيء في الحافظة للّصق.'));
      return;
    }
    const { targets, outside } = pasteTargets(block, selNow(), { rows: daysNow().length, cols: fieldsNow().length });
    plan('paste', targets, outside);
  };

  const onCopyEvent = (event: ClipboardEvent | ReactClipboardEvent, cut: boolean) => {
    copyArmed.current = false;
    if (editingRef.current) return;
    event.clipboardData?.setData('text/plain', copyText());
    event.preventDefault();
    markCopied(cut);
  };
  const onPasteEvent = (event: ClipboardEvent | ReactClipboardEvent) => {
    pasteArmed.current = false;
    if (editingRef.current) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    pastePlan(text);
  };

  /** Ctrl+C: المتصفّح يطلق حدث النسخ؛ وإن لم يطلقه (خانة بلا نصّ محدَّد في بعضها) فالحافظة بواجهتها. */
  const armCopy = () => {
    copyArmed.current = true;
    setTimeout(() => {
      if (!copyArmed.current) return;
      copyArmed.current = false;
      const text = copyText();
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clipboard?.writeText) {
        say(t('sheet.grid.copy_failed', 'تعذّر النسخ من هذا المتصفّح.'));
        return;
      }
      clipboard.writeText(text).then(
        () => markCopied(false),
        () => say(t('sheet.grid.copy_failed', 'تعذّر النسخ من هذا المتصفّح.')),
      );
    }, 0);
  };
  const armPaste = () => {
    pasteArmed.current = true;
    setTimeout(() => {
      if (!pasteArmed.current) return;
      pasteArmed.current = false;
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clipboard?.readText) {
        say(t('sheet.grid.paste_failed', 'تعذّرت قراءة الحافظة: الصق بـCtrl+V والخانة محدّدة.'));
        return;
      }
      clipboard.readText().then(pastePlan, () => say(t('sheet.grid.paste_failed', 'تعذّرت قراءة الحافظة: الصق بـCtrl+V والخانة محدّدة.')));
    }, 0);
  };

  /** التراجع عن آخر تعديل حُفظ في هذه الجلسة (والإعادة): بالقيمة السابقة، وما تغيّر من جهاز آخر بعده لا يُمسّ. */
  const replay = (direction: 'undo' | 'redo') => {
    // أثناء الكتابة في خانة: «تراجع» يلغي ما كُتب فيها (كإكسل)، و«أعِد» لا يفعل شيئاً؛ ولا يُمسّ تعديلٌ قبلها (المراجعة R1).
    if (editNow()) {
      if (direction === 'undo') {
        writeEdit(null);
        claimFocus.current = true;
        setFocusTick((n) => n + 1);
        say(t('sheet.grid.typing_undone', 'أُلغي ما كُتب في الخانة.'));
      }
      return;
    }
    const stack = direction === 'undo' ? historyRef.current.undo : historyRef.current.redo;
    const step = stack[stack.length - 1];
    if (!step) {
      say(direction === 'undo' ? t('sheet.grid.no_undo', 'لا تعديل للتراجع عنه.') : t('sheet.grid.no_redo', 'لا تعديل لإعادته.'));
      return;
    }
    const rest = stack.slice(0, -1);
    writeHistory(direction === 'undo' ? { undo: rest, redo: historyRef.current.redo } : { undo: historyRef.current.undo, redo: rest });
    const changes: CellChange[] = [];
    let moved = 0;
    for (const entry of step) {
      if (!dayOf(entry.on) || !fieldsNow().includes(entry.field)) continue;
      const expected = direction === 'undo' ? entry.after : entry.before;
      const target = direction === 'undo' ? entry.before : entry.after;
      const now = valueOf(entry);
      if (!sameValue(now, expected) && !sameValue(now, restoreValue(entry.field, expected))) {
        moved += 1;
        continue;
      }
      changes.push({ on: entry.on, field: entry.field, value: restoreValue(entry.field, target) });
    }
    const first = changes[0];
    if (!first) {
      say(t('sheet.grid.undo_moved', 'تغيّرت الخانة بعد تعديلك (من جهاز آخر)، فلم يُمسّ شيء.'));
      return;
    }
    writeSel(at(posOf(first)));
    const what =
      changes.length === 1
        ? t('sheet.grid.undo_one', '{field} يوم {day}', { field: props.label(first.field), day: fmtDay(first.on) })
        : t('sheet.grid.undo_many', 'خانات: {n}', { n: fmtInt(changes.length) });
    say(
      (direction === 'undo' ? t('sheet.grid.undone', 'أُعيدت القيمة السابقة: {what}.', { what }) : t('sheet.grid.redone', 'أُعيد التعديل: {what}.', { what })) +
        (moved > 0 ? ` ${t('sheet.grid.undo_skipped', 'وتُركت {n} تغيّرت من جهاز آخر.', { n: fmtInt(moved) })}` : ''),
    );
    void submit(changes, { kind: direction, step }, 'history');
  };

  // ─── الدخول والخروج ──────────────────────────────────────────────────────────────────────────────────────────────

  const enter = () => {
    claimFocus.current = true;
    const now = propsRef.current;
    const todayRow = now.days.findIndex((day) => day.on === now.today);
    const lastPast = now.days.reduce((found, day, index) => (day.on <= now.today ? index : found), 0);
    const first = now.fields.findIndex((field) => STOP_FIELDS.includes(field));
    const pos = { row: todayRow >= 0 ? todayRow : lastPast, col: first >= 0 ? first : 0 };
    writeEdit(null);
    writeSel(at(pos));
    setCopied(null);
    setIssues({});
    setMessage(null);
    writeHistory({ undo: [], redo: [] });
    setOn(true);
  };

  const leave = () => {
    if (editNow() && !commitEditor(null, null)) return;
    writeEdit(null);
    setCopied(null);
    setMessage(null);
    setBatch(null);
    setClearing(null);
    setIssues({});
    setOn(false);
  };

  // ─── المفاتيح ───────────────────────────────────────────────────────────────────────────────────────────────────

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const wrap = wrapRef.current;
    if (!wrap || !wrap.contains(event.target as Node)) return;
    claimFocus.current = true;
    const key = { key: event.key, code: event.code, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey };
    const edit = editNow();
    if (edit) {
      // التركيز خرج من المحرّر إلى خانة أو إطار في الجدول وهو مفتوح: يعود إليه قبل أن يكتب المتصفّح المفتاح، فلا يضيع رقم (المراجعة R6).
      const field = inputRef.current;
      if (field && event.target !== field) field.focus();
      const intent = editKey(selNow(), key, edit.mode, shape());
      if (intent.kind === 'commit') {
        event.preventDefault();
        commitEditor(intent.then, intent.reveal);
      } else if (intent.kind === 'fill') {
        event.preventDefault();
        fillTyped();
      } else if (intent.kind === 'cancel') {
        event.preventDefault();
        writeEdit(null);
        setFocusTick((n) => n + 1);
        say(null);
      } else if (intent.kind === 'toggle') {
        event.preventDefault();
        writeEdit({ ...edit, mode: edit.mode === 'enter' ? 'edit' : 'enter' });
      }
      return;
    }
    const mod = (event.ctrlKey || event.metaKey) && !event.altKey;
    const letter = (char: string) => event.key.toLowerCase() === char || event.code === `Key${char.toUpperCase()}`;
    if (mod && (letter('c') || letter('x'))) {
      armCopy();
      return;
    }
    if (mod && letter('v')) {
      armPaste();
      return;
    }
    const current = selNow();
    const intent = gridKey(current, key, shape());
    const cell = cellOf(current.cursor);
    const info = cell ? infoOf(cell) : null;
    switch (intent.kind) {
      case 'move':
        event.preventDefault();
        writeSel(intent.selection, intent.reveal);
        say(null);
        return;
      case 'type':
        event.preventDefault();
        if (!cell) return;
        if (info?.access === 'feed') say(feedHint());
        else if (info?.access !== 'write' || !isWrite(cell.field)) say(readHint(info));
        else if (cell.field === 'note') startEdit(cell, intent.text, 'enter');
        else if (!digitKey(intent.text)) say(t('sheet.grid.digits', 'اكتب أرقاماً في هذه الخانة.'));
        else startEdit(cell, toWesternDigits(intent.text), 'enter');
        return;
      case 'edit':
        event.preventDefault();
        if (!cell) return;
        if (info?.access === 'feed') openFeedAt(cell);
        else if (info?.access !== 'write' || !isWrite(cell.field)) say(readHint(info));
        else startEdit(cell, copyOf(cell), 'edit');
        return;
      case 'open': {
        event.preventDefault();
        if (cell && info?.access === 'feed') {
          openFeedAt(cell);
          return;
        }
        // خانة علف لا تُفتح (يوم لم يأتِ بلا علف): Enter ينزل كغيرها.
        writeSel(enterMove(current, false, shape()));
        return;
      }
      case 'clear':
        event.preventDefault();
        clearSelection();
        return;
      case 'backspace':
        event.preventDefault();
        if (!cell) return;
        if (info?.access === 'feed') say(feedHint());
        else if (info?.access !== 'write' || !isWrite(cell.field)) say(readHint(info));
        else startEdit(cell, '', 'enter');
        return;
      case 'undo':
      case 'redo':
        event.preventDefault();
        replay(intent.kind);
        return;
      case 'fill':
        // Ctrl+D لا يصل المتصفّح (إشارته المرجعية) في وضع التعديل.
        event.preventDefault();
        fillSelection();
        return;
      case 'escape':
        event.preventDefault();
        setCopied(null);
        if (isRange(current)) writeSel(at(current.cursor));
        say(null);
        return;
      default:
        return;
    }
  };

  const openFeedAt = (cell: CellAt) => {
    const day = dayOf(cell.on);
    if (day) props.openFeed(day);
  };

  // ─── الفأرة واللمس ──────────────────────────────────────────────────────────────────────────────────────────────

  const focusCell = (pos: Pos) => findCell(wrapRef.current, pos)?.focus({ preventScroll: true });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    claimFocus.current = true;
    const kind = event.pointerType || 'mouse';
    lastPointer.current = kind;
    const pos = cellFrom(event.target, wrapRef.current);
    if (!pos || kind !== 'mouse' || event.button !== 0) return;
    const cell = cellOf(pos);
    if (!cell) return;
    const edit = editNow();
    if (edit && sameCell(edit.at, cell)) return;
    if (edit && !commitEditor(null, null)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    dragRef.current = true;
    const current = selNow();
    if (event.shiftKey) writeSel({ ...current, end: pos, tabStart: null }, pos);
    else writeSel(at(pos));
    focusCell(event.shiftKey ? current.cursor : pos);
    say(null);
  };

  /**
   * أثناء الكتابة لا يأخذ التركيزَ من المحرّر نقرٌ على حاشية خانته ولا الزرّ الأيمن أو الأوسط على خانة: كان المحرّر يبقى مفتوحاً بلا تركيز فتضيع الأرقام
   * بعده (المراجعة R6). ونقرةٌ بالزرّ الأيسر على خانة أخرى تحفظه وتنتقل (onPointerDown).
   */
  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!editingRef.current || event.target === inputRef.current) return;
    if (cellFrom(event.target, wrapRef.current)) event.preventDefault();
  };

  const onPointerOver = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || (event.pointerType || 'mouse') !== 'mouse' || (event.buttons & 1) === 0) return;
    const pos = cellFrom(event.target, wrapRef.current);
    const current = selNow();
    if (pos && !samePos(pos, current.end)) writeSel({ ...current, end: pos, tabStart: null }, pos);
  };

  const onClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    claimFocus.current = true;
    const pos = cellFrom(event.target, wrapRef.current);
    const pointer = lastPointer.current;
    lastPointer.current = null;
    if (!pos) return;
    const cell = cellOf(pos);
    if (!cell) return;
    const touch = pointer === 'touch' || pointer === 'pen' || (pointer === null && coarse());
    if (!touch) {
      // نقرة بلا مؤشّر (قارئ الشاشة أو لوحة المفاتيح): تحدّد الخانة.
      if (pointer === null && !samePos(selNow().cursor, pos)) writeSel(at(pos));
      return;
    }
    const edit = editNow();
    // لمسة أو قلم داخل الخانة التي تُكتب الآن تضع المؤشّر في نصّها: لا تحفظ نصف ما كُتب ولا تفتح ورقتها (المراجعة R5).
    if (edit && sameCell(edit.at, cell)) return;
    if (edit && !commitEditor(null, null)) return;
    writeSel(at(pos));
    const day = dayOf(cell.on);
    const info = infoOf(cell);
    const field = cell.field;
    if (!day || !info) return;
    if (info.access === 'feed') props.openFeed(day);
    else if (info.access === 'write' && isWrite(field)) props.openSheet(day, field, sheetSubmit({ on: day.on, field }));
    else say(readHint(info));
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const pos = cellFrom(event.target, wrapRef.current);
    // اللمس يفتح الورقة السفلية بلمسة واحدة؛ النقرتان للفأرة وحدها.
    if (!pos || lastPointer.current === 'touch' || coarse()) return;
    const cell = cellOf(pos);
    if (!cell) return;
    const edit = editNow();
    // نقرتان داخل الخانة التي تُكتب الآن تحدّدان كلمة في نصّها (كإكسل): لا تعيدانها إلى قيمتها (المراجعة R4).
    if (edit && sameCell(edit.at, cell)) return;
    const info = infoOf(cell);
    if (!info) return;
    if (info.access === 'feed') openFeedAt(cell);
    else if (info.access === 'write' && isWrite(cell.field)) {
      if (!samePos(selNow().cursor, pos)) writeSel(at(pos));
      startEdit(cell, copyOf(cell), 'edit');
    } else say(readHint(info));
  };

  const onEditorBlur = (event: ReactFocusEvent<HTMLInputElement>) => {
    if (!editingRef.current) return;
    // تبديل النافذة لا يحفظ (المحرّر باقٍ كما كان)؛ والخروج إلى زرّ أو مكان آخر في الصفحة يحفظ كإكسل حين يُنقر خارج الخانة، ولا يُسحب التركيز إلى الجدول.
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
    const next = event.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) {
      // التركيز إلى خانة أو إطار في الجدول والمحرّر مفتوح (لا نقرة تحفظه): يعود إلى المحرّر، فلا يبقى مفتوحاً بلا تركيز تضيع فيه الأرقام (المراجعة R6).
      setTimeout(() => {
        const field = inputRef.current;
        if (editingRef.current && field && document.activeElement !== field) field.focus();
      }, 0);
      return;
    }
    claimFocus.current = false;
    commitEditor(null, null);
  };

  // ─── الرسم: المواضع من الخانات بأيام هذه القراءة ───────────────────────────────────────────────────────────────────

  const view = selIn(days, fields, sel);
  const range = rangeOf(view);
  const multi = isRange(view);
  const copiedRange = copied ? rangeOf({ cursor: posIn(days, fields, copied.anchor), anchor: posIn(days, fields, copied.anchor), end: posIn(days, fields, copied.end), tabStart: null }) : null;
  /** المحرّر ما دام يومه في الورقة؛ ومحرّر يومٍ اختفى بقراءة جديدة لا يُرسم، وشريط الحال يقول لماذا (يُلغى مع أوّل مفتاح أو نقرة: editNow). */
  const editingLive = editing && days.some((day) => day.on === editing.at.on) ? editing : null;
  const lost = editing && !editingLive ? editing : null;
  const cursorDay = days[view.cursor.row] ?? null;
  const cursorField = fields[view.cursor.col] ?? 'age';

  // ─── التركيز والتمرير ───────────────────────────────────────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    if (!active || editingLive || batch || clearing) return;
    const now = propsRef.current;
    const wrap = wrapRef.current;
    const cell = findCell(wrap, posIn(now.days, now.fields, sel.cursor));
    if (claimFocus.current && cell && document.activeElement !== cell) cell.focus({ preventScroll: true });
    const reveal = revealRef.current ?? sel.cursor;
    revealRef.current = null;
    const target = findCell(wrap, posIn(now.days, now.fields, reveal));
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' }); // وأفقيّاً «nearest» افتراضاً
  }, [active, sel, editingLive, batch, clearing, focusTick]);

  const editingAt = editingLive ? cellKey(editingLive.at.on, editingLive.at.field) : '';
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!editingAt || !input || document.activeElement === input) return;
    input.focus();
    const end = input.value.length;
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
  }, [editingAt]);

  useLayoutEffect(() => {
    if (wasActive.current && !active) pencilRef.current?.focus();
    wasActive.current = active;
  }, [active]);

  // المحرّر المفتوح تعديلٌ لم يُحفظ (المراجعة R2): تحديث التطبيق وتعافيه ينتظران، وإغلاق التبويب يسأل أوّلاً؛ وترك الصفحة (الرجوع، Alt+←، رابط) أو إخفاؤها
  // (pagehide) يحفظ ما كُتب كما يحفظه الخروج من الخانة، مرّة واحدة: الخروج إلى زرّ أو رابط حفظه قبلها فلا محرّر بعده.
  useDirtyForm(Boolean(active && editingLive));
  useLayoutEffect(() => {
    leaveRef.current = () => {
      if (editingRef.current) commitEditor(null, null);
    };
  });
  useEffect(() => {
    const leaving = leaveRef;
    const onHide = () => leaving.current();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      leaving.current();
    };
  }, []);

  // النسخ واللصق خارج الغلاف (المتصفّح يطلقهما على body والتركيز على خانة لا نصّ فيها)، وإفلات الفأرة في أيّ مكان.
  useLayoutEffect(() => {
    handlers.current = { copy: (event) => onCopyEvent(event, event.type === 'cut'), paste: onPasteEvent };
  });
  useEffect(() => {
    if (!active) return;
    const inside = (event: Event) => {
      const wrap = wrapRef.current;
      return Boolean(wrap && !wrap.contains(event.target as Node) && wrap.contains(document.activeElement));
    };
    const copy = (event: ClipboardEvent) => {
      if (!event.defaultPrevented && inside(event)) handlers.current?.copy(event);
    };
    const paste = (event: ClipboardEvent) => {
      if (!event.defaultPrevented && inside(event)) handlers.current?.paste(event);
    };
    const up = () => {
      dragRef.current = false;
    };
    document.addEventListener('copy', copy);
    document.addEventListener('cut', copy);
    document.addEventListener('paste', paste);
    window.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('copy', copy);
      document.removeEventListener('cut', copy);
      document.removeEventListener('paste', paste);
      window.removeEventListener('pointerup', up);
    };
  }, [active]);

  const nameBox = (): string => {
    if (!cursorDay) return '';
    const count = (range.bottom - range.top + 1) * (range.last - range.first + 1);
    if (count > 1) {
      const numbers = cellsOf(range).flatMap((pos) => {
        const day = days[pos.row];
        const value = day ? props.cell(day, fields[pos.col] ?? 'age').milli : null;
        return value === null || fields[pos.col] === 'age' ? [] : [value];
      });
      const total = numbers.reduce((sum, value) => sum + value, 0n);
      const base = t('sheet.grid.range', 'الخانات المحدّدة: {n}', { n: fmtInt(count) });
      return numbers.length > 0
        ? `${base} · ${t('sheet.grid.sum', 'المجموع {sum} · المتوسّط {avg} · الأعداد {count}', { sum: fmtMilli(total), avg: fmtMilli(roundHalfAway(total, BigInt(numbers.length))), count: fmtInt(numbers.length) })}`
        : base;
    }
    return t('sheet.grid.name', '{field} · يوم {day} (العمر {age})', { field: props.label(cursorField), day: fmtDay(cursorDay.on), age: fmtInt(cursorDay.age) });
  };

  /**
   * المحرّر فوق نسخة خفيّة من قيمة الخانة (sg-ghost): الخانة تبقى بعرضها وارتفاعها كما كانت فلا يتحرّك الجدول، والمحرّر يملؤها (كخانة إكسل وهي تُكتب).
   */
  const editorNode = (day: SheetDay, field: GridField, ghost: ReactNode): ReactNode => {
    if (!editingLive) return null;
    const number = field !== 'note';
    return (
      <span className="block">
        <span className="sg-editor">
          <span className="sg-ghost" aria-hidden="true">
            {ghost}
          </span>
          <input
            ref={inputRef}
            className="sg-input"
            data-kind={number ? 'number' : 'text'}
            data-action="grid-input"
            dir={number ? 'ltr' : undefined}
            inputMode={number ? 'numeric' : undefined}
            autoComplete="off"
            size={1}
            spellCheck={number ? false : undefined}
            aria-label={t('sheet.grid.input', '{field} يوم {day}', { field: props.label(field), day: fmtDay(day.on) })}
            aria-invalid={editingLive.error ? true : undefined}
            aria-describedby={editingLive.error ? errorId : undefined}
            value={editingLive.text}
            onChange={(event) => {
              const current = editingRef.current;
              if (current) writeEdit({ ...current, text: event.target.value, error: null });
            }}
            onBlur={onEditorBlur}
          />
        </span>
        {editingLive.error ? (
          <span id={errorId} role="alert" className="sg-error text-danger-700 dark:text-danger-300" data-action="grid-error">
            {editingLive.error}
          </span>
        ) : null}
      </span>
    );
  };

  const content = (day: SheetDay, _row: number, field: GridField, render: CellRender): ReactNode => {
    if (active && editingLive && editingLive.at.on === day.on && editingLive.at.field === field) return editorNode(day, field, render());
    const key = cellKey(day.on, field);
    const entry = overlay[key];
    const live = entry && (entry.sending || entry.model === props.cell);
    const shown = live ? render({ value: entry.value, pending: entry.sending }) : render();
    const issue = active ? issues[key] : undefined;
    return issue ? (
      <>
        {shown}
        <span className="sg-issue text-danger-700 dark:text-danger-300" data-action="cell-issue">
          {issue}
        </span>
      </>
    ) : (
      shown
    );
  };

  const spokenOf = (day: SheetDay, field: GridField, info: GridCell): string => {
    const key = cellKey(day.on, field);
    const entry = overlay[key];
    if (field === 'date') return t('sheet.grid.row', 'يوم {day} (العمر {age}){today}', { day: fmtDay(day.on), age: fmtInt(day.age), today: day.on === props.today ? ` ${t('sheet.today', 'اليوم')}` : '' });
    const value = entry && (entry.sending || entry.model === props.cell) ? (entry.value === null || entry.value === '' ? t('sheet.grid.empty', 'فارغة') : typeof entry.value === 'number' ? fmtInt(entry.value) : entry.value) : info.spoken;
    const pending = entry?.sending ? ` ${t('sheet.pending', 'بانتظار الرفع')}` : '';
    const issue = issues[key] ? ` ${issues[key]}` : '';
    return `${t('sheet.grid.cell', '{field}، يوم {day}: {value}', { field: props.label(field), day: fmtDay(day.on), value })}${pending}${issue}`;
  };

  const table: DataGrid<SheetDay> | undefined = active
    ? {
        table: { role: 'grid', 'aria-label': t('sheet.grid.label', '{title} — وضع التعديل', { title: props.title }), 'aria-multiselectable': true },
        head: (column: Column<SheetDay>) => {
          const col = fields.indexOf(column.key as GridField);
          return col >= range.first && col <= range.last ? { 'data-sel': 'true' } : {};
        },
        cell: (day: SheetDay, row: number, column: Column<SheetDay>) => {
          const field = column.key as GridField;
          const col = fields.indexOf(field);
          if (col < 0) return {};
          const pos = { row, col };
          const info = props.cell(day, field);
          const isCursor = samePos(view.cursor, pos);
          const inRange = within(range, pos);
          return {
            role: field === 'date' ? 'rowheader' : 'gridcell',
            'aria-selected': inRange,
            'aria-readonly': info.access === 'read' ? true : undefined,
            'aria-label': spokenOf(day, field, info),
            tabIndex: isCursor ? 0 : -1,
            'data-cell': `${row}:${col}`,
            'data-cursor': isCursor ? 'true' : undefined,
            'data-edge': multi && inRange ? edgesOf(range, pos) : undefined,
            'data-rowsel': (field === 'age' || field === 'date') && row >= range.top && row <= range.bottom ? 'true' : undefined,
            'data-copied': copiedRange && within(copiedRange, pos) ? 'true' : undefined,
            'data-locked': info.access === 'read' && STOP_FIELDS.includes(field) ? 'true' : undefined,
          };
        },
      }
    : undefined;

  const gridView: SheetGridView = { table, content };
  const clearField = clearing ? props.label(clearing.change.field) : '';

  return (
    <>
      {canEdit ? (
        active ? (
          <section className="sg-bar" aria-label={t('sheet.grid.mode', 'وضع التعديل')} data-action="sheet-edit-bar">
            <div className="sg-bar-top">
              <p className="sg-bar-title" data-action="sheet-edit-title">
                {t('sheet.grid.mode', 'وضع التعديل')}
              </p>
              <div className="sg-bar-actions">
                <Button variant="secondary" onMouseDown={keepFocus} onClick={() => replay('undo')} disabled={history.undo.length === 0 && !editingLive} data-action="grid-undo">
                  {t('sheet.grid.undo', 'تراجع')}
                </Button>
                <Button variant="secondary" onMouseDown={keepFocus} onClick={() => replay('redo')} disabled={history.redo.length === 0} data-action="grid-redo">
                  {t('sheet.grid.redo', 'أعِد')}
                </Button>
                <Button onClick={leave} data-action="sheet-edit-done">
                  {t('sheet.grid.done', 'انتهيت')}
                </Button>
              </div>
            </div>
            <KeyGuide />
            <p className="sg-guide sg-touch" data-action="grid-touch-guide">
              {t('sheet.grid.touch', 'المس خانة لتعديلها بلوحة الأرقام، وخانة العلف تفتح نافذته.')}
            </p>
            {online ? null : (
              <p className="sg-guide" data-action="grid-offline">
                {t('sheet.grid.offline', 'بلا اتصال: التعديلات تُحفظ على هذا الجهاز وتُرسل حين يعود الاتصال، والعلف ينتظر الاتصال.')}
              </p>
            )}
            <div className="sg-status">
              <span className="sg-name" data-action="grid-name">
                {nameBox()}
              </span>
              <span role="status" className="sg-message" data-action="grid-message">
                {lost ? goneText(lost) : (message ?? '')}
              </span>
            </div>
          </section>
        ) : (
          <div className="sg-tools" data-action="sheet-tools">
            <Button ref={pencilRef} variant="secondary" icon={<PencilIcon />} onClick={enter} data-action="sheet-pencil">
              {t('sheet.grid.pencil', 'تعديل الجدول')}
            </Button>
          </div>
        )
      ) : null}
      <div
        ref={wrapRef}
        className={active ? 'sg-grid sg-on' : 'sg-grid'}
        data-action="sheet-grid"
        data-mode={active ? 'edit' : 'locked'}
        onKeyDown={active ? onKeyDown : undefined}
        onPointerDown={active ? onPointerDown : undefined}
        onMouseDown={active ? onMouseDown : undefined}
        onPointerOver={active ? onPointerOver : undefined}
        onClick={active ? onClick : undefined}
        onDoubleClick={active ? onDoubleClick : undefined}
        onCopy={active ? (event) => onCopyEvent(event, false) : undefined}
        onCut={active ? (event) => onCopyEvent(event, true) : undefined}
        onPaste={active ? onPasteEvent : undefined}
      >
        {props.children(gridView)}
      </div>
      {batch ? (
        <BatchDialog
          batch={batch}
          label={props.label}
          onCancel={() => {
            setBatch(null);
            claimFocus.current = true;
            setFocusTick((n) => n + 1);
          }}
          onConfirm={() => {
            const changes = batch.entries.flatMap((entry) => (entry.change ? [entry.change] : []));
            setBatch(null);
            claimFocus.current = true;
            setFocusTick((n) => n + 1);
            void submit(changes, { kind: 'fresh' }, 'batch');
          }}
        />
      ) : null}
      {clearing ? (
        <ConfirmDialog
          open
          title={t('sheet.grid.clear_one.title', 'امسح {field} يوم {day}؟', { field: clearField, day: fmtDay(clearing.change.on) })}
          consequence={
            <span data-action="grid-clear-text">
              {t('sheet.grid.clear_one.body', 'تصير {field} يوم {day} صفراً بدل {before}.', { field: clearField, day: fmtDay(clearing.change.on), before: clearing.before })}
            </span>
          }
          confirmLabel={t('sheet.grid.clear_one.go', 'امسح {field}', { field: clearField })}
          action="grid-clear-go"
          onConfirm={() => {
            const change = clearing.change;
            setClearing(null);
            claimFocus.current = true;
            setFocusTick((n) => n + 1);
            void submit([change], { kind: 'fresh' }, 'quiet');
          }}
          onCancel={() => {
            setClearing(null);
            claimFocus.current = true;
            setFocusTick((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}

/** تأكيد اللصق أو الملء أو مسح النطاق: جدول بكلّ يوم وخانته وما فيها الآن وما سيصير أو لماذا لا يُكتب، ولا شيء يُكتب قبل الزرّ. */
function BatchDialog({ batch, label, onCancel, onConfirm }: { batch: Batch; label: (field: GridField) => string; onCancel: () => void; onConfirm: () => void }) {
  const ok = batch.entries.filter((entry) => entry.status === 'ok').length;
  const same = batch.entries.filter((entry) => entry.status === 'same').length;
  const skipped = batch.entries.filter((entry) => entry.status === 'skip').length;
  const title =
    batch.kind === 'paste' ? t('sheet.grid.paste.title', 'الصق في الجدول') : batch.kind === 'fill' ? t('sheet.grid.fill.title', 'املأ الخانات المحدّدة') : t('sheet.grid.clear.title', 'امسح الخانات المحدّدة');
  const go =
    batch.kind === 'paste'
      ? t('sheet.grid.paste.go', 'الصق: {n}', { n: fmtInt(ok) })
      : batch.kind === 'fill'
        ? t('sheet.grid.fill.go', 'املأ: {n}', { n: fmtInt(ok) })
        : t('sheet.grid.clear.go', 'امسح: {n}', { n: fmtInt(ok) });
  const columns: Column<BatchEntry>[] = [
    { key: 'day', header: t('sheet.grid.col.day', 'اليوم'), cell: (entry) => <Num>{fmtDay(entry.day.on)}</Num> },
    { key: 'field', header: t('sheet.grid.col.field', 'الخانة'), cell: (entry) => label(entry.field) },
    { key: 'before', header: t('sheet.grid.col.before', 'الآن'), wrap: true, cell: (entry) => entry.before },
    { key: 'after', header: t('sheet.grid.col.after', 'يصير'), wrap: true, cell: (entry) => (entry.status === 'same' ? entry.before : entry.after === '' ? t('sheet.grid.empty', 'فارغة') : entry.after) },
    {
      key: 'status',
      header: t('sheet.grid.col.status', 'الحال'),
      wrap: true,
      cell: (entry) => (
        <span data-action="grid-batch-status" data-status={entry.status}>
          {entry.status === 'ok' ? t('sheet.grid.status.ok', 'يُكتب') : entry.status === 'same' ? t('sheet.grid.status.same', 'بلا تغيير') : t('sheet.grid.status.skip', 'لا يُكتب: {why}', { why: entry.reason ?? '' })}
        </span>
      ),
    },
  ];
  return (
    <Dialog
      open
      onClose={onCancel}
      size="wide"
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} data-autofocus data-action="grid-batch-cancel">
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button variant={batch.kind === 'clear' ? 'danger' : 'primary'} disabled={ok === 0} onClick={onConfirm} data-action="grid-batch-go">
            {go}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3" data-action="grid-batch" data-kind={batch.kind}>
        <p className="text-sm" data-action="grid-batch-summary">
          {t('sheet.grid.batch.summary', 'يُكتب {ok}، وبلا تغيير {same}، ولا يُكتب {skip}. لا شيء يُكتب قبل الضغط على الزرّ.', { ok: fmtInt(ok), same: fmtInt(same), skip: fmtInt(skipped) })}
        </p>
        {batch.outside > 0 ? (
          <p className="text-sm text-ink-muted" data-action="grid-batch-outside">
            {t('sheet.grid.batch.outside', 'وقيم خارج الورقة (بعد آخر يوم أو آخر عمود) لا تُلصق: {n}.', { n: fmtInt(batch.outside) })}
          </p>
        ) : null}
        <DataTable caption={title} columns={columns} rows={batch.entries} rowKey={(entry) => entry.key} size="sm" empty={t('sheet.grid.batch.empty', 'لا خانات.')} />
      </div>
    </Dialog>
  );
}
