import type { ReactNode } from 'react';

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
}

const NUMBER_CELL = 'text-right tabular-nums whitespace-nowrap'; // ui-ok: الآحاد طرف الرقم الأيمن بكل اتجاه
const BORDER = 'border-b border-e border-line last:border-e-0';
const TOTAL_TOP = 'border-t-[3px] border-double border-t-line-strong';

/** رقم داخل خلية: LTR معزول، والإشارة السالبة ويّا رقمها. */
export function Num({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** مجموع يرسم شي: null وfalse و'' بنوع ReactNode تعني «بلا مجموع» مثل غيابه. */
function hasTotal(column: Pick<Column<unknown>, 'total'>): boolean {
  const { total } = column;
  return total !== undefined && total !== null && total !== false && total !== '';
}

function cellClass(column: Pick<Column<unknown>, 'kind' | 'wrap'>): string {
  if (column.kind === 'number') return NUMBER_CELL;
  return column.wrap ? 'min-w-48 text-start' : 'whitespace-nowrap text-start';
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  totalLabel,
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
}) {
  const firstTotal = columns.findIndex(hasTotal);
  // «المجموع» ياخذ مكان الأعمدة النصّية قبل أوّل مجموع؛ مجموع بأوّل عمود كان يختفي بصمت.
  if (totalLabel !== undefined && firstTotal === 0) throw new Error('datatable_total_label_needs_leading_text_column');
  const labelSpan = firstTotal > 0 ? firstTotal : 1;
  const showTotals = totalLabel !== undefined && rows.length > 0;
  // آخر صفّ قبل المجاميع بلا خطّ أسفل (فوكه الخطّ المزدوج)، وآخر صفّ بالجدول بلا خطّ (الإطار من الغلاف).
  const edges = showTotals ? '[&>tbody>tr:last-child>*]:border-b-0 [&>tfoot>tr:last-child>*]:border-b-0' : '[&>tbody>tr:last-child>*]:border-b-0';
  return (
    <div className="max-h-[70dvh] overflow-auto rounded-lg border border-line bg-surface-1">
      <table className={`w-full border-separate border-spacing-0 text-sm ${edges}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`sticky top-0 z-[1] ${BORDER} bg-surface-2 px-3 py-2 font-semibold ${cellClass(column)}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${BORDER} px-3 py-6 text-center text-ink-muted`}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={rowKey(row, index)} className="hover:bg-surface-2">
                {columns.map((column) => (
                  <td key={column.key} className={`${BORDER} px-3 py-1.5 ${cellClass(column)}`}>
                    {column.cell(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {showTotals ? (
          <tfoot>
            <tr className="bg-surface-2 font-semibold">
              <th scope="row" colSpan={labelSpan} className={`${BORDER} ${TOTAL_TOP} px-3 py-2 text-start`}>
                {totalLabel}
              </th>
              {columns.slice(labelSpan).map((column) => (
                <td key={column.key} className={`${BORDER} ${TOTAL_TOP} px-3 py-2 ${cellClass(column)}`}>
                  {column.total}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
