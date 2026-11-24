import { Fragment, type ReactNode, type TableHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';

// الجدول الوحيد بالنظام (قانون المالك للجداول، docs/DECISIONS.md 2026-10-24): شبكة كلاسيكية مثل إكسل،
// خطوط لكل خلية، رأس ثابت بالتمرير، صفّ مجاميع بخطّ مزدوج فوكه، والأرقام محاذية على خانة الآحاد.
// numbers-guard يرفض <table> برّا هذا الملف، فكل كشف وفاتورة وتقرير يمرّ من هنا.
//
// محاذاة الآحاد: الرقم LTR دائماً، فخانة آحاده طرفه الأيمن الفيزيائي بأي اتجاه للواجهة. الخلية الرقمية
// text-right عمداً (مو text-end، اللي ينقلب ويّا الاتجاه)، والعمود الرقمي بعدد مراتب ثابت، فالآحاد تصطفّ:
// المبالغ بـfmtMoney(المراتب)، والكميات بـfmtQtyCell والوحدة برأس العمود.
//
// الخطوط: border-separate، كل خلية خطّها الأسفل وخطّ نهايتها. ويّا border-collapse الخطوط ترسمها الجدول
// كلّه، فالرأس الثابت يفقد خطوطه بالتمرير والصفوف تبين من تحته. الإطار الخارجي من الغلاف، فخلية آخر
// العمود وآخر صفّ بلا خطّ حتى ما يتضاعف.

export type ColumnKind = 'text' | 'number';

export interface Column<Row> {
  key: string;
  header: string;
  kind?: ColumnKind;
  cell: (row: Row, index: number) => ReactNode;
  /** خلية صفّ المجاميع. الأعمدة النصّية قبل أوّل مجموع تنضمّ لخلية «المجموع». */
  total?: ReactNode;
  /** الخلية بسطر واحد مثل إكسل إلا البيان: wrap يلفّه بعرض أدنى حتى ما ينعصر. */
  wrap?: boolean;
  /** العمود ثابت بأوّل الجدول بالتمرير الأفقي (اسم الجهة بجدول الحسابات، FOUNDATION ١١٣). */
  sticky?: boolean;
}

/**
 * صفّ تذييل إضافي بعد صفّ المجاميع (المرحلة 1 WP3: «لنا عند الناس» و«علينا للناس» بجدول الجهات). الأرقام من الخادم (دالّة
 * الملخّص) مو من الصفوف المحمّلة (§2.8)، فالصفّ بخلاياه جاهزة بمفتاح العمود.
 */
export interface FooterRow {
  key: string;
  label: string;
  cells: Readonly<Record<string, ReactNode>>;
}

const NUMBER_CELL = 'text-right tabular-nums whitespace-nowrap'; // ui-ok: الآحاد طرف الرقم الأيمن بكل اتجاه
/** رأس عمود رقميّ في الجدول المضغوط: يلتفّ عند المسافة («العلف» فوق «(كغم)») فلا يعرّض عموده أكثر من أرقامه. */
const NUMBER_HEAD_WRAP = 'text-right tabular-nums'; // ui-ok: الآحاد طرف الرقم الأيمن بكل اتجاه
const STICKY = 'sticky start-0 z-[1] bg-surface-1';
/** الخلية الثابتة في صفّ تحذير: معتمة (تغطّي ما يمرّ تحتها بالتمرير) بلون الصفّ نفسه (warn-500/15 فوق surface-1 بالوضع الداكن). */
const STICKY_WARN = 'sticky start-0 z-[1] bg-warn-50 dark:bg-[rgb(50,44,35)]';
/** الصفّ المختار (يوم التقرير في جدول الأيّام، 0031): خلفية سطح أعمق معتمة بالسمتين، فتغطّي الخلية الثابتة ما يمرّ تحتها كغيرها. */
const MARK = 'bg-surface-3';
const STICKY_MARK = 'sticky start-0 z-[1] bg-surface-3';
const BORDER = 'border-b border-e border-line last:border-e-0';
const TOTAL_TOP = 'border-t-[3px] border-double border-t-line-strong';

/** سمات data-* على خلية الشبكة (موضعها وتحديدها). */
type DataAttrs = Partial<Record<`data-${string}`, string>>;

/**
 * جدول يُعمل فيه كإكسل (ورقة القاعة في وضع التعديل، عقد 0036 S2): سمات الجدول (role="grid") وكلّ خلية (gridcell وaria-selected وaria-readonly وموضعها)
 * ورأس كلّ عمود. الصنف لا يُمرَّر (شكل الجدول من هنا وحده)، والأحداث تلتقطها الشاشة على غلاف الجدول. وبلا grid الجدول كما هو حرفاً.
 */
export interface DataGrid<Row> {
  table: Omit<TableHTMLAttributes<HTMLTableElement>, 'className' | 'children'>;
  cell: (row: Row, index: number, column: Column<Row>) => Omit<TdHTMLAttributes<HTMLTableCellElement>, 'className' | 'children'> & DataAttrs;
  head?: (column: Column<Row>) => Omit<ThHTMLAttributes<HTMLTableCellElement>, 'className' | 'children' | 'scope'> & DataAttrs;
}

/** رقم داخل خلية: LTR معزول، والإشارة السالبة ويّا رقمها. */
export function Num({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** مجموع يرسم شي: null وfalse و'' بنوع ReactNode تعني «بلا مجموع» مثل غيابه. */
function hasTotal(column: Pick<Column<unknown>, 'total'>): boolean {
  const { total } = column;
  return total !== undefined && total !== null && total !== false && total !== '';
}

function cellClass(column: Pick<Column<unknown>, 'kind' | 'wrap'>, size: TableSize = 'md'): string {
  if (column.kind === 'number') return NUMBER_CELL;
  // المضغوط (ورقة القاعة بالهاتف) يلفّ البيان بلا عرض أدنى: يأخذ ما بقي من عرض الشاشة.
  if (column.wrap) return size === 'sm' ? 'text-start' : 'min-w-48 text-start';
  return 'whitespace-nowrap text-start';
}

const headClass = (column: Pick<Column<unknown>, 'kind' | 'wrap'>, size: TableSize): string => (size === 'sm' && column.kind === 'number' ? NUMBER_HEAD_WRAP : cellClass(column, size));

/** خلية تذييل ترسم شي (مثل hasTotal). */
const filled = (value: ReactNode | undefined): boolean => value !== undefined && value !== null && value !== false && value !== '';

/**
 * حجم الجدول: md للكشوف والتقارير الكثيفة، وlg لجدول يُفتح منه شيء (القاعات في الحقل، كلمة المالك 2026-11-16: «نسوي الجدول اكبر واوضح…
 * بخط اكبر شوية بحيث يكون متناسق ما بين شكل البطاقة وبين شكل الجدول»): خطّ أكبر وصفوف أعلى بارتفاع زرّ الإصبع. وsm لورقة بأعمدة كثيرة على الهاتف
 * (ورقة القاعة، مراجعة 0035: ستّة أعمدة بعرض 360): الخطّ نفسه بحشوة أضيق، ورأس العمود الرقميّ يلتفّ، والبيان بلا عرض أدنى.
 */
export type TableSize = 'sm' | 'md' | 'lg';
const SIZES: Record<TableSize, { table: string; head: string; cell: string; foot: string }> = {
  sm: { table: 'text-sm', head: 'px-2 py-2 text-xs', cell: 'px-2 py-1.5', foot: 'px-2 py-2' },
  md: { table: 'text-sm', head: 'px-3 py-2', cell: 'px-3 py-1.5', foot: 'px-3 py-2' },
  lg: { table: 'text-base', head: 'px-4 py-2.5 text-sm', cell: 'px-4 py-3', foot: 'px-4 py-3' },
};

/**
 * الجدول الرسميّ (عقد 0036 S1، كلمة المالك 2026-11-24: «مرتّبة بشكل رسمي… لدون ما تنحذف او تختفي منها كلمات… واسماء الجداول يكون بيها لون بالخلفية
 * مالتها مثل ترتيب المستشفيات»): شريط عنوان ملوّن فوق الجدول، ورأس بخلفية العلامة وخطوط أقوى، ونصّ بالحجم الأساسيّ يلتفّ ولا يُقصّ، وصفّ مجاميع غامق،
 * ويُطبع بألوانه. أنماطه كلّها في components/ui/official.css الكسول (تستورده حزم الصفحات التي تستعمله، لا حزمة الإقلاع)، فهنا أصناف بنيوية موجودة (الثابت
 * والمحاذاة) وأسماء ofc- لا يولّد لها Tailwind شيئاً. والعاديّ (plain) بعلاماته كما كانت حرفاً حرفاً (فحص official-tables P).
 */
export type TableVariant = 'plain' | 'official';
const OFC_GRID: Record<TableSize, string> = { sm: 'ofc-grid ofc-sm', md: 'ofc-grid', lg: 'ofc-grid ofc-lg' };
/** خلية الجدول الرسميّ: الرقم كالعاديّ (سطر واحد على خانة الآحاد)، والنصّ يلتفّ بعرض أدنى، والبيان بعرض أدنى أوسع. */
const ofcCell = (column: Pick<Column<unknown>, 'kind' | 'wrap'>): string => (column.kind === 'number' ? NUMBER_CELL : column.wrap ? 'text-start ofc-wrap' : 'text-start ofc-text');
/** رأس الجدول الرسميّ يلتفّ دائماً: رأسٌ طويل لا يعرّض عموده أكثر من قيمه. */
const ofcHead = (column: Pick<Column<unknown>, 'kind'>): string => (column.kind === 'number' ? NUMBER_HEAD_WRAP : 'text-start');

/** نقرة على عنصر تفاعلي داخل الصفّ (رابط أو زرّ أو خانة) له فعله، فلا تفتح الصفّ معه. */
const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'label']);
interface Hit {
  tagName?: string;
  parentNode?: Hit | null;
  getAttribute?: (name: string) => string | null;
}
/** يصعد من العنصر المنقور إلى الصفّ: أوّل عنصر تفاعلي في الطريق يأخذ النقرة (بلا closest: يعمل في كلّ DOM). */
function hitsControl(target: unknown, row: unknown): boolean {
  for (let node = target as Hit | null; node && node !== row; node = node.parentNode ?? null) {
    if (INTERACTIVE.has((node.tagName ?? '').toLowerCase()) || node.getAttribute?.('role') === 'button') return true;
  }
  return false;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  totalLabel,
  footers = [],
  subRow,
  size = 'md',
  onRowClick,
  rowTone,
  variant,
  title,
  grid,
}: {
  /** وصف الجدول لقارئ الشاشة. */
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  /** نصّ الجدول الفارغ، بخلية تغطّي كل الأعمدة. */
  empty: string;
  /** يظهر صفّ المجاميع إذا انطى. */
  totalLabel?: string;
  /** صفوف تذييل بعد المجاميع، بأرقام من الخادم (تبين حتى لو الصفحة المحمّلة فارغة). */
  footers?: readonly FooterRow[];
  /**
   * تفصيل تحت الصفّ بعرض الجدول كلّه، أو null (عقد 0024: موادّ المستند تحت سطره في الكشف التفصيلي). جدول داخل خلية عمود واحد
   * ينعصر بعرض البيان ويُقصّ بالطباعة، وبعرض الجدول يأخذ الورقة كلّها.
   */
  subRow?: (row: Row, index: number) => ReactNode;
  size?: TableSize;
  /**
   * الصفّ كلّه يُضغط (يد الإصبع لا تصيب رابطاً صغيراً): النقر على عنصر تفاعلي داخله يبقى له. ولوحة المفاتيح تصل بالرابط الذي في الصفّ
   * نفسه (اسم القاعة)، فالصفّ لا يأخذ تركيزاً ثانياً.
   */
  onRowClick?: (row: Row) => void;
  /**
   * صفّ يحتاج انتباهاً (جولة اليوم ناقصة): خلفية تحذير خفيفة مع الكلمة المكتوبة في خليته؛ أو الصفّ المختار (mark: يوم التقرير بين أيّام الشهر) بخلفية
   * أعمق ومع كلمة في خليته أيضاً (الخلفية لا تُطبع).
   */
  rowTone?: (row: Row) => 'warn' | 'mark' | null;
  /** 'official' للجداول الرسمية (التقارير وورقة القاعة)؛ وبلاه أو بـ'plain' الجدول العاديّ كما كان. */
  variant?: TableVariant;
  /** نصّ شريط العنوان في الجدول الرسميّ إن خالف caption (عنوان القسم أقصر من وصف الجدول لقارئ الشاشة). */
  title?: string;
  /** شبكة كإكسل: سمات الجدول والخلايا والرؤوس (DataGrid)؛ بلاها لا يتغيّر شيء. */
  grid?: DataGrid<Row>;
}) {
  const official = variant === 'official';
  const sized = SIZES[size];
  const firstTotal = columns.findIndex(hasTotal);
  // «المجموع» ياخذ مكان الأعمدة النصّية قبل أوّل مجموع؛ مجموع بأوّل عمود كان يختفي بصمت.
  if (totalLabel !== undefined && firstTotal === 0) throw new Error('datatable_total_label_needs_leading_text_column');
  // والتذييل نفسه: اسمه بخلية الأعمدة قبل أوّل خلية بيها رقم، فرقم بأوّل عمود كان يختفي تحت الاسم.
  const footerStarts = footers.map((footer) => columns.findIndex((column) => filled(footer.cells[column.key]))).filter((index) => index >= 0);
  const firstFooter = footerStarts.length ? Math.min(...footerStarts) : -1;
  if (firstFooter === 0) throw new Error('datatable_footer_needs_leading_text_column');
  const labelSpan = firstTotal > 0 ? firstTotal : 1;
  const footerSpan = firstFooter > 0 ? firstFooter : 1;
  const showTotals = totalLabel !== undefined && rows.length > 0;
  const showFoot = showTotals || footers.length > 0;
  // آخر صفّ قبل المجاميع بلا خطّ أسفل (فوكه الخطّ المزدوج)، وآخر صفّ بالجدول بلا خطّ (الإطار من الغلاف).
  const edges = showFoot ? '[&>tbody>tr:last-child>*]:border-b-0 [&>tfoot>tr:last-child>*]:border-b-0' : '[&>tbody>tr:last-child>*]:border-b-0';
  const stickyOf = (column: Column<Row>, tone: 'warn' | 'mark' | null) => (column.sticky ? (tone === 'warn' ? STICKY_WARN : tone === 'mark' ? STICKY_MARK : STICKY) : '');
  const table = (
      <table className={official ? `w-full border-separate border-spacing-0 ${OFC_GRID[size]}` : `w-full border-separate border-spacing-0 ${sized.table} ${edges}`} {...grid?.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={
                  official
                    ? `sticky top-0 ${column.sticky ? 'start-0 z-[2]' : 'z-[1]'} ${ofcHead(column)}`
                    : `sticky top-0 ${column.sticky ? 'start-0 z-[2]' : 'z-[1]'} ${BORDER} bg-surface-2 ${sized.head} font-semibold ${headClass(column, size)}`
                }
                {...grid?.head?.(column)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={official ? 'ofc-empty text-center text-ink-muted' : `${BORDER} px-3 py-6 text-center text-ink-muted`}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const detail = subRow?.(row, index);
              const tone = rowTone?.(row) ?? null;
              return (
                <Fragment key={rowKey(row, index)}>
                  <tr
                    className={`${tone === 'warn' ? 'bg-warn-50 dark:bg-warn-500/15' : tone === 'mark' ? MARK : ''} hover:bg-surface-2`}
                    data-tone={tone ?? undefined}
                    onClick={
                      onRowClick
                        ? (event) => {
                            if (event.defaultPrevented || hitsControl(event.target, event.currentTarget)) return;
                            onRowClick(row);
                          }
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={official ? `${stickyOf(column, tone)} ${ofcCell(column)}` : `${BORDER} ${sized.cell} ${stickyOf(column, tone)} ${cellClass(column, size)}`}
                        {...grid?.cell(row, index, column)}
                      >
                        {column.cell(row, index)}
                      </td>
                    ))}
                  </tr>
                  {detail ? (
                    <tr data-sub-row>
                      <td colSpan={columns.length} className={official ? undefined : `${BORDER} px-3 py-1.5`}>
                        {detail}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
        {showFoot ? (
          <tfoot>
            {showTotals ? (
              <tr className={official ? undefined : 'bg-surface-2 font-semibold'}>
                <th scope="row" colSpan={labelSpan} className={official ? 'text-start' : `${BORDER} ${TOTAL_TOP} ${sized.foot} text-start`}>
                  {totalLabel}
                </th>
                {columns.slice(labelSpan).map((column) => (
                  <td key={column.key} className={official ? ofcCell(column) : `${BORDER} ${TOTAL_TOP} ${sized.foot} ${cellClass(column, size)}`}>
                    {column.total}
                  </td>
                ))}
              </tr>
            ) : null}
            {footers.map((footer, index) => {
              const top = !showTotals && index === 0 ? TOTAL_TOP : '';
              return (
                <tr key={footer.key} className={official ? undefined : 'bg-surface-2 font-semibold'}>
                  <th scope="row" colSpan={footerSpan} className={official ? 'text-start' : `${BORDER} ${top} ${sized.foot} text-start`}>
                    {footer.label}
                  </th>
                  {columns.slice(footerSpan).map((column) => (
                    <td key={column.key} className={official ? ofcCell(column) : `${BORDER} ${top} ${sized.foot} ${cellClass(column, size)}`}>
                      {footer.cells[column.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tfoot>
        ) : null}
      </table>
  );
  // الرسميّ: شريط العنوان خارج إطار التمرير (يبقى ظاهراً حين يُمرَّر الجدول أفقيّاً في الهاتف)، والإطار overflow-auto كالعاديّ (ورقة القاعة تمرّره إلى
  // صفّ اليوم). والشريط نصّ مرئيّ فقط: قارئ الشاشة يسمع caption الجدول، فلا يُقرأ العنوان مرّتين.
  return official ? (
    <div className="ofc">
      <div className="ofc-band" aria-hidden="true">
        {title ?? caption}
      </div>
      <div className="ofc-frame max-h-[70dvh] overflow-auto">{table}</div>
    </div>
  ) : (
    // بالطباعة كل الصفوف بلا تمرير (FOUNDATION ٧٨٨): print.css بشاشات الحسابات يشيل حدّ الارتفاع من overflow-auto.
    <div className="max-h-[70dvh] overflow-auto rounded-lg border border-line bg-surface-1">{table}</div>
  );
}
