import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Num } from '../../../components/ui/DataTable';
import type { Day } from '../../../domain/dates';
import { FILS_PER_DINAR, type Fils } from '../../../domain/money';
import { fmtMoney } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { MoneyClass, MoneyMove } from '../../../lib/repo/money';

// قطع شاشات «المال بين يديك» (عقد 0024 §5 و§6 A): أسماء أصناف الحركة النقدية بترتيبها، وروابط السند والمستند لكلّ حركة، والبيان المبنيّ من الحركة،
// والمبلغ بمراتبه (المال دينار صحيح إلا المصاريف والمبيعات قد تحمل فلساً)، والشهر واليوم من الرابط، والطباعة بعنوان التقرير (نمط printAs)
// وسطرا التوقيع. حزمة الحسابات الكسولة وحدها تستوردها (خارج التثبيت المسبق).

// ─── الأصناف (العقد §5) ─────────────────────────────────────────────────────────────────────────────────────────

/** اسم صنف الحركة النقدية. «الرصيد عند البداية» بقاموس المالك (DECISIONS: «رصيد افتتاحي» ← «الرصيد عند البداية»). */
export function classLabel(cls: MoneyClass): string {
  switch (cls) {
    case 'customer_receipt':
      return t('mclass.customer_receipt', 'قبض من زبائن');
    case 'cash_sale':
      return t('mclass.cash_sale', 'بيع نقدي');
    case 'supplier_payment':
      return t('mclass.supplier_payment', 'دفع لمورّدين');
    case 'cash_purchase':
      return t('mclass.cash_purchase', 'شراء نقدي');
    case 'purchase_charge':
      return t('mclass.purchase_charge', 'أجور الشراء');
    case 'expense':
      return t('mclass.expense', 'مصاريف');
    case 'transfer':
      return t('mclass.transfer', 'تحويل بين الصناديق');
    case 'opening':
      return t('mclass.opening', 'الرصيد عند البداية');
    case 'other':
      return t('mclass.other', 'أخرى');
  }
}

// ─── الروابط (العقد §5) ─────────────────────────────────────────────────────────────────────────────────────────

/** صفحة المستند من نوعه ومعرّفه: الشراء ودفعه وأجوره، والبيع ودفعه، ومرتجع المورّد، والتحويل. المصروف بلا صفحة. */
export function docHref(docKind: string | null, docId: string | null): string | null {
  if (!docKind || !docId) return null;
  switch (docKind) {
    case 'receipt':
      return `/inventory/receipts/${docId}`;
    case 'sale':
      return `/sales/${docId}`;
    case 'supplier_return':
      return `/inventory/supplier-returns/${docId}`;
    case 'cash_transfer':
      return `/accounts/transfer/${docId}`;
    default:
      return null;
  }
}

/** سند الحركة أوّلاً (القبض والصرف وعكسهما: سندهما الأصلي؛ والتحويل بوجهيه)، ثمّ مستندها. */
export function moveHref(row: Pick<MoneyMove, 'voucher' | 'voucherId' | 'docKind' | 'docId'>): string | null {
  if (row.voucher === 'entry' && row.voucherId) return `/accounts/voucher/${row.voucherId}`;
  if (row.voucher === 'transfer' && row.voucherId) return `/accounts/transfer/${row.voucherId}`;
  return docHref(row.docKind, row.docId);
}

/** قائمة الذمم بطرفها، وبقسم أو بما فات 90 يوماً إن طُلب. */
export function debtsHref(side: 'receivable' | 'payable', options: { division?: string; over90?: boolean } = {}): string {
  const params = new URLSearchParams({ side });
  if (options.division) params.set('division', options.division);
  if (options.over90) params.set('over90', '1');
  return `/accounts/debts?${params.toString()}`;
}

export const LINK = 'text-brand-700 dark:text-brand-200';
export const PILL = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2';

/** رقم السند أو المستند: رابطاً حين يُعرف طريقه، والتحويل (بلا رقم بعد) باسم سنده. */
export function DocCell({ row }: { row: Pick<MoneyMove, 'voucher' | 'voucherId' | 'docKind' | 'docId' | 'docNo'> }) {
  const href = moveHref(row);
  const label: ReactNode = row.docNo ? <Num>{row.docNo}</Num> : href ? t('moves.doc.transfer', 'سند التحويل') : null;
  if (!label) return null;
  return href ? (
    <Link to={href} className={LINK} data-action="move-doc">
      {label}
    </Link>
  ) : (
    <>{label}</>
  );
}

// ─── البيان ──────────────────────────────────────────────────────────────────────────────────────────────────

/** ما تقوله الحركة بلا نوعها (النوع بعموده): السند أو الفاتورة، وفئة المصروف، والصندوق الآخر في التحويل. */
function memoWhat(row: MoneyMove): string {
  switch (row.cls) {
    case 'customer_receipt':
      return t('moves.memo.rc', 'سند قبض');
    case 'supplier_payment':
      return t('moves.memo.py', 'سند صرف');
    case 'cash_sale':
      return t('moves.memo.sale', 'بيع نقداً');
    case 'cash_purchase':
      return t('moves.memo.purchase', 'دفع عند الشراء');
    case 'purchase_charge':
      // الملاحظة اسم الأجرة («أجور تحميل»).
      return row.note ?? t('mclass.purchase_charge', 'أجور الشراء');
    case 'expense':
      return row.category ?? t('moves.memo.expense', 'مصروف');
    case 'transfer': {
      const counter = row.counterAccount?.name;
      if (!counter) return t('mclass.transfer', 'تحويل بين الصناديق');
      // وجه التحويل بمعناه الأصلي: عكس الوجه الخارج يدخل، فـ«إلغاء: إلى …» تُقرأ صحيحة.
      const incoming = row.reverses ? row.outflow > 0n : row.inflow > 0n;
      return incoming ? t('moves.memo.from', 'من «{box}»', { box: counter }) : t('moves.memo.to', 'إلى «{box}»', { box: counter });
    }
    case 'opening':
      return t('mclass.opening', 'الرصيد عند البداية');
    case 'other':
      return t('mclass.other', 'أخرى');
  }
}

/** أصناف لا يقول بيانها نوعها (فئة مصروف، صندوق آخر، اسم أجرة): بلا عمود «النوع» (يومية الصندوق) يسبقها اسم صنفها. */
const NEEDS_CLASS: ReadonlySet<MoneyClass> = new Set<MoneyClass>(['expense', 'transfer', 'purchase_charge']);

/**
 * البيان: ما تقوله الحركة وملاحظتها، والإلغاء بعلامته («إلغاء: …» للعكس، و«أُلغيت لاحقاً» للملغاة). withClass: الجدول بلا عمود «النوع»،
 * فالمصروف والتحويل والأجرة يسبقها اسم صنفها («مصاريف: كهرباء»).
 */
export function moveMemo(row: MoneyMove, withClass = false): string {
  const bare = memoWhat(row);
  const what = withClass && NEEDS_CLASS.has(row.cls) ? t('moves.memo.class', '{cls}: {what}', { cls: classLabel(row.cls), what: bare }) : bare;
  const note = row.cls === 'purchase_charge' ? null : row.note;
  let text = note ? t('moves.memo.note', '{what} — {note}', { what, note }) : what;
  if (row.reverses) text = t('moves.memo.reversal', 'إلغاء: {what}', { what: text });
  if (row.reversed) text = t('moves.memo.reversed', '{what} (أُلغيت لاحقاً)', { what: text });
  return text;
}

// ─── المبالغ ─────────────────────────────────────────────────────────────────────────────────────────────────

/** مراتب عمود مال: صفر إذا كلّ القيم دنانير صحيحة، وإلّا مرتبتان (فالآحاد تصطفّ ولا يختفي فلس). */
export function moneyDecimals(values: readonly Fils[]): 0 | 2 {
  return values.some((value) => value % FILS_PER_DINAR !== 0n) ? 2 : 0;
}

/** مبلغ وحده بمراتبه. */
export function fmtDinar(amount: Fils): string {
  return fmtMoney(amount, moneyDecimals([amount]));
}

/** مبلغ بالكلمة «دينار». */
export function dinarText(amount: Fils): string {
  return t('money.dinar', '{amount} دينار', { amount: fmtDinar(amount) });
}

// ─── الأيام والأشهر من الرابط ────────────────────────────────────────────────────────────────────────────────

/** شهر بشكل YYYY-MM. */
export type Month = string;

const MONTH_SHAPE = /^20\d\d-(?:0[1-9]|1[0-2])$/u;
const DAY_SHAPE = /^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;

const yearNum = (value: string): number => Number(value.slice(0, 4));
const monthNum = (value: string): number => Number(value.slice(5, 7));
const pad2 = (n: number): string => `${n < 10 ? '0' : ''}${n}`;

/** عدد أيام الشهر (اليوم صفر من الشهر التالي آخر يوم فيه). */
function daysInMonth(month: Month): number {
  return new Date(Date.UTC(yearNum(month), monthNum(month), 0)).getUTCDate();
}

/** شهر من الرابط، وإلّا null. */
export const monthParam = (value: string | null): Month | null => (value !== null && MONTH_SHAPE.test(value) ? value : null);
/** يوم موجود في التقويم من الرابط (لا 30 شباط)، وإلّا null. */
export const dayParam = (value: string | null): Day | null =>
  value !== null && DAY_SHAPE.test(value) && Number(value.slice(8, 10)) <= daysInMonth(value.slice(0, 7)) ? value : null;

/** أوّل الشهر. */
export const monthStart = (day: Day): Day => `${day.slice(0, 7)}-01`;

/** الشهر بعد by شهراً (سالب للخلف). */
export function shiftMonth(month: Month, by: number): Month {
  const index = yearNum(month) * 12 + monthNum(month) - 1 + by;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/** الشهر وسنته («تشرين الثاني 2026») بأسماء الأشهر كما تُكتب في العراق (مفاتيح تقرير العليقة نفسها). */
export function monthLabel(month: Month): string {
  const names = [
    t('millrep.month.01', 'كانون الثاني'),
    t('millrep.month.02', 'شباط'),
    t('millrep.month.03', 'آذار'),
    t('millrep.month.04', 'نيسان'),
    t('millrep.month.05', 'أيار'),
    t('millrep.month.06', 'حزيران'),
    t('millrep.month.07', 'تموز'),
    t('millrep.month.08', 'آب'),
    t('millrep.month.09', 'أيلول'),
    t('millrep.month.10', 'تشرين الأول'),
    t('millrep.month.11', 'تشرين الثاني'),
    t('millrep.month.12', 'كانون الأول'),
  ];
  return t('millrep.month.label', '{name} {year}', { name: names[monthNum(month) - 1] ?? month, year: month.slice(0, 4) });
}

// ─── الطباعة ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * اطبع بعنوان الصفحة عنوانَ التقرير (Chrome يسمّي ملفّ «احفظ PDF» به، كما في الرصيد اليومي وتقرير العليقة)، ثمّ يعود العنوان بعد الطباعة.
 */
export function printAs(title: string): void {
  const before = document.title;
  const restore = () => {
    document.title = before;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  document.title = title;
  window.print();
}

/** ورقة A4 طولية ما دامت الصفحة مفتوحة (print.css يطبع منطقة data-print-area وحدها). */
export const A4_PORTRAIT = '@page { size: A4 portrait; margin: 12mm; }';

/** سطور التوقيع تحت التقرير المطبوع. */
export function Signatures({ names }: { names: readonly string[] }) {
  return (
    <div className="grid gap-6 pt-4 sm:grid-cols-2" data-action="signatures">
      {names.map((name) => (
        <p key={name} className="text-sm">
          {t('print.signature', '{name}: ____________________', { name })}
        </p>
      ))}
    </div>
  );
}
