import { Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { DataTable, Num, type Column, type FooterRow } from '../../../components/ui/DataTable';
import { Notice } from '../../../components/ui/Notice';
import type { Fils, Milli } from '../../../domain/money';
import type { BaseUnit } from '../../../domain/units';
import { columnDecimals, fmtDay, fmtInt, fmtMoney, fmtPercent, fmtQtyCell } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { MillReport, ReportBatch, ReportMaterial } from '../../../lib/repo/millReport';
import { qtyText } from './calendar';

// تقرير الشهر أو اليوم المطبوع (كلمة المالك 2026-11-10: «شنو انتجنا… وشنو جانت المواد… بشكل جداول مرتبه وتنطبع بشكل احترافي»): سطر المدّة،
// وستّ بطاقات (الدفعات والناتج وكتلة المواد والهدر والكلفة الكلّية وكلفة الكيلو)، وجدول الدفعات وجدول المواد المستعملة بمجاميعهما. والمال مفتوح
// لكلّ من يرى المعمل في هذا التقرير وحده (كلمة المالك «كلشي مفتوح»). «اطبع أو احفظ PDF» من المتصفّح (لا مكتبة PDF: تشكيل العربية فيها غير
// مضمون، كما في الرصيد اليومي)، وعنوان الصفحة أثناء الطباعة عنوان التقرير ومدّته (Chrome يسمّي ملفّ PDF به)، والطباعة فاتحة دائماً (display.ts)
// بلا قشرة التطبيق ولا أزرار (print:hidden)، والجدول بكلّ صفوفه ورأسه يتكرّر في كلّ صفحة ومجاميعه مرّة واحدة في آخره (قواعد الطباعة على A4 في
// ReportPage: PRINT_STYLE).

type Decimals = 0 | 1 | 2 | 3;
const decimalsOf = (values: readonly Milli[]): Decimals => columnDecimals(values, 3) as Decimals;

const dash = (): string => t('millrep.dash', '—');
const money = (amount: Fils): string => t('millrep.money', '{amount} دينار', { amount: fmtMoney(amount) });
const pct = (part: bigint, whole: bigint): string => t('millrep.pct', '{value}٪', { value: fmtPercent(part, whole) });
const unitWord = (unit: BaseUnit): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

/**
 * اطبع بعنوان الصفحة عنوانَ التقرير ومدّته (كما في الرصيد اليومي: كان كلّ تقرير «نظام الدواجن.pdf»)، ثمّ يعود العنوان بعد الطباعة.
 */
function printAs(title: string): void {
  const before = document.title;
  const restore = () => {
    document.title = before;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  document.title = title;
  window.print();
}

/** بطاقة رقم في ملخّص التقرير (حدّ بلا ظلّ: تُطبع نظيفة). */
function Stat({ label, value, action }: { label: string; value: string; action: string }) {
  return (
    <div className="rounded-2xl border border-line p-3" data-action={action}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

export function ReportBody({ data, title, period, emptyText }: { data: MillReport; title: string; period: string; emptyText: string }) {
  const { totals, batches, materials } = data;
  const empty = batches.length === 0;
  // الهدر مجموع خلايا جدوله (الكتلة − الناتج لكلّ دفعة)، فالبطاقة = صفّ المجموع = الخلايا.
  const waste = batches.reduce((sum, batch) => sum + batch.shrinkKg, 0n);
  const outputDecimals = decimalsOf([...batches.map((batch) => batch.outputKg), totals.outputKg]);
  const massDecimals = decimalsOf([...batches.map((batch) => batch.massKg), totals.massKg]);
  const wasteDecimals = decimalsOf([...batches.map((batch) => batch.shrinkKg), waste]);
  const qtyDecimals = decimalsOf(materials.map((material) => material.qty));
  // الحصّة من الكتلة لما داخلها وحده (الوقود والتعبئة خارجها بكتلتهما الفعلية)، والمقام كتلة الدفعات (totals.mass_kg).
  const basisMass = materials.reduce((sum, material) => sum + (material.inBasis ? (material.massKg ?? 0n) : 0n), 0n);

  const batchColumns: Column<ReportBatch>[] = [
    { key: 'day', header: t('millrep.col.day', 'التاريخ'), cell: (batch) => fmtDay(batch.producedOn) },
    {
      key: 'doc',
      header: t('millrep.col.doc', 'رقم الدفعة'),
      cell: (batch) => (
        <Link to={`/mill/batch/${batch.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-batch">
          <Num>{batch.docNo}</Num>
        </Link>
      ),
    },
    {
      key: 'output',
      header: t('millrep.col.output', 'الناتج (كغم)'),
      kind: 'number',
      cell: (batch) => <Num>{fmtQtyCell(batch.outputKg, outputDecimals)}</Num>,
      total: <Num>{fmtQtyCell(totals.outputKg, outputDecimals)}</Num>,
    },
    {
      key: 'mass',
      header: t('millrep.col.mass', 'كتلة المواد (كغم)'),
      kind: 'number',
      cell: (batch) => <Num>{fmtQtyCell(batch.massKg, massDecimals)}</Num>,
      total: <Num>{fmtQtyCell(totals.massKg, massDecimals)}</Num>,
    },
    {
      key: 'waste',
      header: t('millrep.col.waste', 'الهدر (كغم)'),
      kind: 'number',
      cell: (batch) => <Num>{fmtQtyCell(batch.shrinkKg, wasteDecimals)}</Num>,
      total: <Num>{fmtQtyCell(waste, wasteDecimals)}</Num>,
    },
    {
      key: 'cost',
      header: t('millrep.col.cost', 'الكلفة (دينار)'),
      kind: 'number',
      cell: (batch) => <Num>{fmtMoney(batch.money.totalValue)}</Num>,
      total: <Num>{fmtMoney(totals.totalValue)}</Num>,
    },
    {
      key: 'per_kg',
      header: t('millrep.col.per_kg', 'كلفة الكيلو (دينار)'),
      kind: 'number',
      cell: (batch) => <Num>{batch.money.costPerKg === null ? dash() : fmtMoney(batch.money.costPerKg)}</Num>,
      total: <Num>{totals.costPerKg === null ? dash() : fmtMoney(totals.costPerKg)}</Num>,
    },
    { key: 'note', header: t('millrep.col.note', 'ملاحظة'), wrap: true, cell: (batch) => batch.note ?? dash() },
  ];

  const materialColumns: Column<ReportMaterial>[] = [
    { key: 'name', header: t('millrep.col.material', 'المادّة'), wrap: true, cell: (material) => material.name },
    { key: 'qty', header: t('millrep.col.qty', 'الكمية'), kind: 'number', cell: (material) => <Num>{fmtQtyCell(material.qty, qtyDecimals)}</Num> },
    { key: 'unit', header: t('millrep.col.unit', 'الوحدة'), cell: (material) => unitWord(material.baseUnit) },
    {
      key: 'value',
      header: t('millrep.col.value', 'القيمة (دينار)'),
      kind: 'number',
      cell: (material) => <Num>{fmtMoney(material.value)}</Num>,
      total: <Num>{fmtMoney(totals.materialsValue)}</Num>,
    },
    {
      key: 'share',
      header: t('millrep.col.share', 'الحصّة من الكتلة'),
      kind: 'number',
      // الوقود والتعبئة «خارج الكتلة»، والمجموع حصّة ما داخلها.
      cell: (material) =>
        !material.inBasis ? (
          t('millrep.share.outside', 'خارج الكتلة')
        ) : (
          <Num>{material.massKg === null || totals.massKg <= 0n ? dash() : pct(material.massKg, totals.massKg)}</Num>
        ),
      total: totals.massKg > 0n ? <Num>{pct(basisMass, totals.massKg)}</Num> : undefined,
    },
  ];
  // تكاليف التشغيل (المحمَّلة على الدفعات من المصاريف المسجّلة: أيدٍ عاملة ونقل لكلّ طنّ…) تحت قيمة المواد، ثمّ الكلفة الكلّية = بطاقة الكلفة.
  const footers: FooterRow[] =
    totals.extraValue !== 0n
      ? [
          { key: 'extra', label: t('millrep.foot.extra', 'تكاليف التشغيل'), cells: { value: <Num>{fmtMoney(totals.extraValue)}</Num> } },
          { key: 'total', label: t('millrep.foot.total', 'الكلفة الكلّية'), cells: { value: <Num>{fmtMoney(totals.totalValue)}</Num> } },
        ]
      : [];

  return (
    <section className="flex flex-col gap-4" aria-label={period} data-action="report">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button
          size="sm"
          variant="secondary"
          icon={<Receipt aria-hidden="true" className="size-4" />}
          onClick={() => printAs(t('millrep.print.title', '{title} — {period}', { title, period }))}
          disabled={empty}
          data-action="print-report"
        >
          {t('millrep.print', 'اطبع أو احفظ PDF')}
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold" data-action="report-period">
          {period}
        </p>
        <p className="hidden text-sm text-ink-muted print:block" data-action="report-prepared">
          {t('millrep.prepared', 'أُعدّ بتاريخ {day}', { day: fmtDay(data.today) })}
        </p>
      </div>
      {empty ? (
        <Notice tone="info" title={emptyText} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-action="report-summary">
            <Stat action="stat-batches" label={t('millrep.stat.batches', 'الدفعات')} value={fmtInt(totals.batches)} />
            <Stat action="stat-output" label={t('millrep.stat.output', 'الناتج')} value={qtyText(totals.outputKg)} />
            <Stat action="stat-mass" label={t('millrep.stat.mass', 'كتلة المواد')} value={qtyText(totals.massKg)} />
            <Stat
              action="stat-waste"
              label={t('millrep.stat.waste', 'الهدر')}
              value={totals.massKg > 0n ? t('millrep.stat.waste_value', '{qty} ({pct})', { qty: qtyText(waste), pct: pct(waste, totals.massKg) }) : qtyText(waste)}
            />
            <Stat action="stat-cost" label={t('millrep.stat.cost', 'الكلفة الكلّية')} value={money(totals.totalValue)} />
            <Stat action="stat-per-kg" label={t('millrep.stat.per_kg', 'كلفة الكيلو')} value={totals.costPerKg === null ? dash() : money(totals.costPerKg)} />
          </dl>
          <h3 className="text-lg font-semibold">{t('millrep.batches.title', 'الدفعات')}</h3>
          {/* بالطباعة الجدول بكلّ صفوفه: حدّ ارتفاع DataTable وتمريره للشاشة وحدها. */}
          <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible" data-action="report-batches">
            <DataTable
              caption={t('millrep.batches.caption', 'دفعات {title} — {period}', { title, period })}
              columns={batchColumns}
              rows={batches}
              rowKey={(batch) => batch.id}
              empty={t('millrep.batches.none', 'لا دفعات')}
              totalLabel={t('millrep.total', 'المجموع')}
            />
          </div>
          <h3 className="text-lg font-semibold">{t('millrep.materials.title', 'المواد المستعملة')}</h3>
          <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible" data-action="report-materials">
            <DataTable
              caption={t('millrep.materials.caption', 'المواد المستعملة في {title} — {period}', { title, period })}
              columns={materialColumns}
              rows={materials}
              rowKey={(material) => material.itemId}
              empty={t('millrep.materials.none', 'لا مواد')}
              totalLabel={t('millrep.total', 'المجموع')}
              footers={footers}
            />
          </div>
        </>
      )}
    </section>
  );
}
