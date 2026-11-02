import { useCallback, useId, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Segmented } from '../../components/ui/Segmented';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import type { Fils, Milli } from '../../domain/money';
import { unitCost4 } from '../../domain/money';
import { CHICK_WARNING_HOURS } from '../../domain/stock';
import type { BaseUnit } from '../../domain/units';
import { columnDecimals, fmtCounted, fmtDay, fmtMoney, fmtPercent, fmtQty, fmtQtyCell, fmtScaledCell, fmtUnitCost } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { ItemLots, ItemMoves, ItemPurchases, LotRow, MoveRow, PurchaseRow } from '../../lib/repo/inventory';
import { useSession } from '../../lib/session';
import { baseUnitLabel, itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { countingLabel, countName, PageFooter, qtyCell, qtyColumns, qtyDecimals, scopedStores, StoreSelect, storesOf, unitName } from './stock-shared';

// بطاقة المادّة (الخطّة WP4، FOUNDATION ٧٨٥): دفعاتها المتبقّية بترتيب السحب بعمرها (ساعات من الفقس للأفراخ وتنبيه 48 ساعة،
// وأيام من استلام الجذر لغيرها، E24) وانتهائها ومصدرها ورقم دفعة المورّد، وللكلفة القيمة المتبقّية وكلفة الوحدة بأربع مراتب
// (القاعدة 9، من item_lots_value)؛ وحركاتها برصيد جارٍ، والعكسية والمعكوسة بعلامتيهما والمستند رابط لمستنده؛ ووحدات التعبئة
// والكثافة والحدّ الأدنى. القائمتان بصفحات (keyset، «المزيد» بمؤشّر كل قائمة) ويّا «N من المجموع» من الخادم (§2.8).

export interface LotValue {
  qtyLeft: Milli;
  valueLeft: Fils;
}

/** العمر بصيغة العدد بالفصحى: «ساعتان»، «5 أيام»، «15 يوماً». */
function age(lot: LotRow): string {
  if (lot.ageHours !== null) {
    return fmtCounted(lot.ageHours * 1000n, t('stock.age.hour', 'ساعة'), { one: t('stock.age.hour.one', 'ساعة واحدة'), two: t('stock.age.hour.two', 'ساعتان'), few: t('stock.age.hour.few', 'ساعات'), many: t('stock.age.hour.many', 'ساعة') });
  }
  return fmtCounted(BigInt(lot.ageDays) * 1000n, t('stock.age.day', 'يوم'), { one: t('stock.age.day.one', 'يوم واحد'), two: t('stock.age.day.two', 'يومان'), few: t('stock.age.day.few', 'أيام'), many: t('stock.age.day.many', 'يوماً') });
}

/** دفعات المادّة. values = null لدور بلا كلفة: عمودا القيمة وكلفة الوحدة ما ينبنون أصلاً. */
export function LotsTable({ lots, values, baseUnit, unitLabel }: { lots: readonly LotRow[]; values: ReadonlyMap<string, LotValue> | null; baseUnit: BaseUnit; unitLabel?: string }) {
  const decimals = qtyDecimals(lots.map((lot) => lot.qtyLeft), baseUnit);
  const columns: Column<LotRow>[] = [
    { key: 'source', header: t('stock.lot.source', 'المصدر'), cell: (lot) => <bdi dir="ltr">{lot.source}</bdi> },
    { key: 'received', header: t('stock.lot.received', 'الاستلام'), cell: (lot) => fmtDay(lot.receivedOn) },
    {
      key: 'age',
      header: t('stock.lot.age', 'العمر'),
      cell: (lot) => (
        <span className={lot.ageHours !== null && lot.ageHours >= BigInt(CHICK_WARNING_HOURS) ? 'font-semibold text-warn-800 dark:text-warn-200' : ''}>{age(lot)}</span>
      ),
    },
    {
      key: 'expiry',
      header: t('stock.lot.expiry', 'الانتهاء'),
      cell: (lot) => (lot.expiryOn ? (lot.expired ? t('stock.lot.expired', '{day} (منتهٍ)', { day: fmtDay(lot.expiryOn) }) : fmtDay(lot.expiryOn)) : '—'),
    },
    { key: 'supplier', header: t('stock.lot.supplier_no', 'وجبة المورّد'), cell: (lot) => (lot.supplierLotNo ? <bdi dir="ltr">{lot.supplierLotNo}</bdi> : '—') },
    { key: 'qty', header: t('stock.lot.qty', 'المتبقّي ({unit})', { unit: unitLabel ?? baseUnitLabel(baseUnit) }), kind: 'number', cell: (lot) => <Num>{qtyCell(lot.qtyLeft, decimals)}</Num> },
  ];
  if (values) {
    columns.push(
      // قيمة ما انقرت بعد «—» مو 0.00 (الدفعة المتبقّية بيها كمية).
      {
        key: 'value',
        header: t('stock.lot.value', 'القيمة المتبقّية'),
        kind: 'number',
        cell: (lot) => {
          const value = values.get(lot.lotId);
          return value ? <Num>{fmtMoney(value.valueLeft)}</Num> : '—';
        },
      },
      {
        key: 'unit_cost',
        header: t('stock.lot.unit_cost', 'كلفة الوحدة'),
        kind: 'number',
        cell: (lot) => {
          const value = values.get(lot.lotId);
          return value && value.qtyLeft > 0n ? <Num>{fmtUnitCost(unitCost4(value.valueLeft, value.qtyLeft))}</Num> : '—';
        },
      },
    );
  }
  return <DataTable caption={t('stock.lots.caption', 'الوجبات المتبقّية بترتيب السحب')} columns={columns} rows={lots} rowKey={(lot) => lot.lotId} empty={t('stock.lots.empty', 'لا وجبات متبقّية.')} />;
}

/** مستند الحركة (والعكسية بمستند أصلها نفسه) رابط لشاشته: التحويل أو الافتتاح؛ غيرها (الحزم الجاية) نصّ لحد ما تنبني شاشته. */
function DocLabel({ move }: { move: MoveRow }) {
  const to = move.docKind === 'transfer' ? `/inventory/transfers/${move.docId}` : move.docKind === 'opening' ? `/inventory/openings/${move.docId}` : null;
  if (!to) return <bdi dir="ltr">{move.doc}</bdi>;
  return (
    <Link className="font-medium text-brand-700 dark:text-brand-200" to={to} data-action="open-move-doc">
      <bdi dir="ltr">{move.doc}</bdi>
    </Link>
  );
}

export function MovesTable({ moves, baseUnit, unitLabel }: { moves: readonly MoveRow[]; baseUnit: BaseUnit; unitLabel?: string }) {
  const decimals = qtyDecimals(moves.flatMap((move) => [move.qty, move.running]), baseUnit);
  const unit = unitLabel ?? baseUnitLabel(baseUnit);
  const columns: Column<MoveRow>[] = [
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (move) => fmtDay(move.movedOn) },
    {
      key: 'doc',
      header: t('ledger.doc', 'المستند'),
      cell: (move) => (
        <span className="inline-flex items-center gap-2">
          <DocLabel move={move} />
          {move.reversesMoveId ? <span className="text-xs text-ink-muted">{t('stock.move.reversal', 'عكس')}</span> : null}
          {move.reversed ? <span className="text-xs text-ink-muted">{t('stock.move.reversed', 'أُلغي')}</span> : null}
        </span>
      ),
    },
    { key: 'qty', header: t('stock.move.qty', 'الكمية ({unit})', { unit }), kind: 'number', cell: (move) => <Num>{qtyCell(move.qty, decimals)}</Num> },
    { key: 'running', header: t('stock.move.running', 'الرصيد ({unit})', { unit }), kind: 'number', cell: (move) => <Num>{qtyCell(move.running, decimals)}</Num> },
  ];
  return <DataTable caption={t('stock.moves.caption', 'حركات المادّة برصيد جارٍ')} columns={columns} rows={moves} rowKey={(move) => move.moveId} empty={t('stock.moves.empty', 'لا حركات.')} />;
}

interface More {
  busy: boolean;
  error: unknown;
}

// ─── تبويب «المشتريات» (كلمة المالك 2026-11-02، spec ب-3) ──────────────────────────────────────────────────────
// «من كل مادة اني اعرف منين اشتريتها في وقتها وشنو الوحدات الي اني اقيس بيها المادة، وبكل شراء مادة تنضاف الحركة لجدول
// هاي المادة بكل تفاصيلها منين اشتريناها وشوكت وبيش جان سعرها»: صفّ لكل وجبة جذر من استلام مرحَّل (item_purchases)،
// الأحدث أوّلاً وبصفحات، ومخزن فارغ = كل مخازن النطاق فـ«آخر شراء» على المنشأة كلها. money يختفي لغير أدوار الكلفة،
// فالأمين يرى من اشترى ومتى وبأي وحدة وكم بقي بلا أسعار (الشاشة تقرأ row.money ولا تفترضه).

export type ItemTab = 'purchases' | 'lots' | 'moves';

/** التبويب بالرابط حتى ينُشر ويرجع بزرّ الرجوع؛ غير المعروف = المشتريات. */
export function tabOf(value: string | null): ItemTab {
  return value === 'lots' || value === 'moves' ? value : 'purchases';
}

/** وسائط الرابط: المخزن إن اختير، والتبويب إن كان غير الافتراضي. */
export function cardParams(warehouseId: string, tab: ItemTab): Record<string, string> {
  const out: Record<string, string> = {};
  if (warehouseId) out.wh = warehouseId;
  if (tab !== 'purchases') out.tab = tab;
  return out;
}

/** مقارنة سعر آخر شراء بالذي قبله. null = بلا كلفة، أو ما قبله شراء. */
export type PriceCompare = { kind: 'up' | 'down'; diff: Fils; base: Fils } | { kind: 'same' } | null;

export function comparePrices(rows: readonly PurchaseRow[]): PriceCompare {
  const last = rows[0]?.money ?? null;
  const previous = rows[1]?.money ?? null;
  if (!last || !previous) return null;
  const diff = last.unitCost - previous.unitCost;
  if (diff === 0n) return { kind: 'same' };
  return { kind: diff > 0n ? 'up' : 'down', diff: diff > 0n ? diff : -diff, base: previous.unitCost };
}

function compareText(compare: NonNullable<PriceCompare>): string {
  if (compare.kind === 'same') return t('purchases.same', 'بالسعر نفسه الذي قبله.');
  // النسبة من سعر الشراء الذي قبله؛ وسعر صفر ما تنحسب منه نسبة (fmtPercent يرفض الكلّ صفراً).
  const diff = fmtMoney(compare.diff);
  if (compare.base === 0n) {
    return compare.kind === 'up' ? t('purchases.up', 'أعلى من الشراء الذي قبله بـ{diff}.', { diff }) : t('purchases.down', 'أقلّ من الشراء الذي قبله بـ{diff}.', { diff });
  }
  const pct = fmtPercent(compare.diff, compare.base);
  return compare.kind === 'up'
    ? t('purchases.up.pct', 'أعلى من الشراء الذي قبله بـ{diff} ({pct}%).', { diff, pct })
    : t('purchases.down.pct', 'أقلّ من الشراء الذي قبله بـ{diff} ({pct}%).', { diff, pct });
}

/** الكمية كما كُتبت بوحدة التعبئة: «10 كيس 50 كغم» (الوحدة تختلف من شراء لشراء، فهي بالخلية لا برأس العمود). */
export function packQty(row: Pick<PurchaseRow, 'qtyInUnit' | 'unitLabel'>): string {
  return t('purchases.qty_unit', '{qty} {unit}', { qty: fmtQtyCell(row.qtyInUnit, columnDecimals([row.qtyInUnit], 3) as 0 | 1 | 2 | 3), unit: row.unitLabel });
}

/** مبلغ الفاتورة بالدينار الصحيح (مثل شاشات الاستلام)، وبمرتبتين إن جاء بكسر فلا يرمي العرض. */
function InvoiceText({ amount }: { amount: Fils }) {
  return <Num>{amount % 100n === 0n ? fmtMoney(amount, 0) : fmtMoney(amount)}</Num>;
}

/** سطر «آخر شراء» في الأعلى: من مَن وبكم ومتى، ومقارنة بسعر الشراء الذي قبله. */
export function LastPurchase({ rows }: { rows: readonly PurchaseRow[] }) {
  const last = rows[0];
  if (!last) return null;
  const compare = comparePrices(rows);
  const unit = baseUnitLabel(last.baseUnit);
  return (
    <section className="card flex flex-col gap-1.5 p-4" aria-label={t('purchases.last', 'آخر شراء')}>
      <h3 className="font-semibold">{t('purchases.last', 'آخر شراء')}</h3>
      <p>{t('purchases.last.who', 'من {supplier}، بتاريخ {day}، {qty} إلى {store}.', { supplier: last.partyName, day: fmtDay(last.receivedOn), qty: packQty(last), store: last.warehouseName })}</p>
      {last.money ? (
        <p>
          {t('purchases.last.price', 'سعر الوحدة')}: <Num>{fmtMoney(last.money.unitCost)}</Num> {t('purchases.per_unit', 'لكل {unit}', { unit })}
        </p>
      ) : null}
      {compare ? <p className={compare.kind === 'up' ? 'font-medium text-warn-800 dark:text-warn-200' : 'font-medium'}>{compareText(compare)}</p> : null}
    </section>
  );
}

/** بطاقة شراء واحد بالهاتف (spec ب-3: «وبالهاتف بطاقة لكل شراء»). */
function PurchaseCard({ row }: { row: PurchaseRow }) {
  return (
    <li className="card flex flex-col gap-1 p-3 text-sm">
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {fmtDay(row.receivedOn)}
        <Link className="text-brand-700 dark:text-brand-200" to={`/inventory/receipts/${row.docId}`} data-action="open-purchase-doc">
          <bdi dir="ltr">{row.docNo}</bdi>
        </Link>
      </span>
      <span>{t('purchases.card.who', 'المورّد: {supplier}', { supplier: row.partyName })}</span>
      <span className="text-ink-muted">{t('purchases.card.store', 'المخزن: {store}', { store: row.warehouseName })}</span>
      <span>{t('purchases.card.qty', 'الكمية: {pack} = {base}', { pack: packQty(row), base: fmtQty(row.qtyIn, row.baseUnit).main })}</span>
      {row.money ? (
        <>
          <span>
            {t('purchases.last.price', 'سعر الوحدة')}: <Num>{fmtMoney(row.money.unitCost)}</Num>
          </span>
          <span>
            {t('purchases.col.invoice', 'مبلغ الفاتورة')}: <InvoiceText amount={row.money.invoiceTotal} />
          </span>
          <span>
            {t('purchases.col.landed', 'الكلفة بعد التحميلات')}: <Num>{fmtMoney(row.money.landedValue)}</Num>
            {row.money.corrected ? <span className="text-xs text-ink-muted"> {t('purchases.corrected', '(سعره مصحَّح)')}</span> : null}
          </span>
        </>
      ) : null}
      <span className="text-ink-muted">{t('purchases.card.left', 'المتبقّي من الوجبة: {qty}', { qty: fmtQty(row.qtyLeft, row.baseUnit).main })}</span>
    </li>
  );
}

/** جدول المشتريات: التاريخ ورقم الاستلام والمورّد والمخزن والكمية بوحدتيها والأسعار والمتبقّي. بلا كلفة: بلا أعمدة مال. */
export function PurchasesTable({ rows, costs }: { rows: readonly PurchaseRow[]; costs: boolean }) {
  const columns: Column<PurchaseRow>[] = [
    { key: 'day', header: t('ledger.date', 'التاريخ'), sticky: true, cell: (row) => fmtDay(row.receivedOn) },
    {
      key: 'doc',
      header: t('purchases.col.doc', 'رقم الاستلام'),
      cell: (row) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/receipts/${row.docId}`} data-action="open-purchase-doc">
          <bdi dir="ltr">{row.docNo}</bdi>
        </Link>
      ),
    },
    { key: 'party', header: t('purchases.col.party', 'المورّد'), wrap: true, cell: (row) => row.partyName },
    { key: 'store', header: t('stock.store', 'المخزن'), cell: (row) => row.warehouseName },
    { key: 'pack', header: t('purchases.col.pack', 'الكمية (بوحدة التعبئة)'), cell: (row) => <bdi dir="ltr">{packQty(row)}</bdi> },
    ...qtyColumns(rows, (row) => row.qtyIn, (unit) => t('purchases.col.base', 'الكمية ({unit})', { unit })),
  ];
  if (costs) {
    columns.push(
      { key: 'unit_cost', header: t('purchases.col.unit_cost', 'سعر الوحدة'), kind: 'number', cell: (row) => (row.money ? <Num>{fmtMoney(row.money.unitCost)}</Num> : '—') },
      { key: 'invoice', header: t('purchases.col.invoice', 'مبلغ الفاتورة'), kind: 'number', cell: (row) => (row.money ? <InvoiceText amount={row.money.invoiceTotal} /> : '—') },
      {
        key: 'landed',
        header: t('purchases.col.landed', 'الكلفة بعد التحميلات'),
        kind: 'number',
        cell: (row) =>
          row.money ? (
            <span className="inline-flex items-center gap-1">
              <Num>{fmtMoney(row.money.landedValue)}</Num>
              {row.money.corrected ? <span className="text-xs text-ink-muted">{t('purchases.corrected.short', 'مصحَّح')}</span> : null}
            </span>
          ) : (
            '—'
          ),
      },
    );
  }
  columns.push(...qtyColumns(rows, (row) => row.qtyLeft, (unit) => t('purchases.col.left', 'المتبقّي من الوجبة ({unit})', { unit })));
  return <DataTable caption={t('purchases.caption', 'مشتريات المادّة، الأحدث أوّلاً')} columns={columns} rows={rows} rowKey={(row) => row.lotId} empty={t('purchases.empty', 'لا شراء لهذه المادّة بعد.')} />;
}

/** تبويب المشتريات بصفحاته: المخزن فارغ = كل مخازن النطاق. */
function PurchasesTab({ itemId, warehouseId, costs }: { itemId: string; warehouseId: string; costs: boolean }) {
  const load = useCallback(() => inventory.loadItemPurchases(itemId, warehouseId || null), [itemId, warehouseId]);
  const first = useLoad(load, `${itemId}:${warehouseId}`);
  const [pages, setPages] = useState<ItemPurchases[]>([]);
  const [more, setMore] = useState<More>({ busy: false, error: null });
  if (first.error) return <LoadFailed what={t('purchases.what', 'مشتريات المادّة')} error={first.error} onRetry={first.retry} />;
  if (!first.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const all = [first.data, ...pages];
  const rows = all.flatMap((page) => page.rows);
  const next = all.at(-1)?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    inventory.loadItemPurchases(itemId, warehouseId || null, next).then(
      (page) => {
        setPages((current) => [...current, page]);
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <LastPurchase rows={rows} />
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <PurchaseCard key={row.lotId} row={row} />
        ))}
        {rows.length === 0 ? <li className="card p-4 text-center text-sm text-ink-muted">{t('purchases.empty', 'لا شراء لهذه المادّة بعد.')}</li> : null}
      </ul>
      <div className="hidden sm:block">
        <PurchasesTable rows={rows} costs={costs} />
      </div>
      <PageFooter shown={rows.length} total={first.data.total} next={Boolean(next)} busy={more.busy} error={more.error} what={t('purchases.what', 'مشتريات المادّة')} onMore={loadMore} action="more-purchases" />
    </div>
  );
}

/** تبويبا «الوجبات المتبقّية» و«الحركات» (الموجودان كما هما) ومعلومات المادّة: الحركات ما تنقرا إلا بتبويبها. */
function Card({ itemId, warehouseId, costs, only }: { itemId: string; warehouseId: string; costs: boolean; only: 'lots' | 'moves' }) {
  const loadLots = useCallback(() => inventory.loadItemLots(itemId, warehouseId), [itemId, warehouseId]);
  const loadMoves = useCallback(() => (only === 'moves' ? inventory.loadItemMoves(itemId, warehouseId) : Promise.resolve(null)), [itemId, warehouseId, only]);
  const loadValues = useCallback(() => (costs ? inventory.loadItemLotValues(itemId, warehouseId) : Promise.resolve(null)), [itemId, warehouseId, costs]);
  const loadUnits = useCallback(() => inventory.listItemUnits(itemId), [itemId]);
  const lots = useLoad(loadLots, `${itemId}:${warehouseId}`);
  const moves = useLoad(loadMoves, `${itemId}:${warehouseId}:${only}`);
  const values = useLoad(loadValues, `${itemId}:${warehouseId}:${costs}`);
  const units = useLoad(loadUnits, itemId);
  // الصفحات بعد الأولى: الدفعات وقيمها بنفس مؤشّر الدفعة (item_lots_value بترتيب item_lots_qty)، والحركات بعد آخر رقم.
  const [lotPages, setLotPages] = useState<{ lots: ItemLots; values: ReadonlyMap<string, LotValue> | null }[]>([]);
  const [movePages, setMovePages] = useState<ItemMoves[]>([]);
  const [moreLots, setMoreLots] = useState<More>({ busy: false, error: null });
  const [moreMoves, setMoreMoves] = useState<More>({ busy: false, error: null });
  if (lots.error) return <LoadFailed what={t('stock.lots.what', 'وجبات المادّة')} error={lots.error} onRetry={lots.retry} />;
  if (!lots.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const item = lots.data.item;
  const named = countName(item, units.data);
  const allLots = [lots.data, ...lotPages.map((page) => page.lots)];
  const lastLots = allLots.at(-1);
  const lotValues = costs && values.data ? new Map([...values.data, ...lotPages.flatMap((page) => (page.values ? [...page.values] : []))]) : null;
  const allMoves = moves.data ? [moves.data, ...movePages] : [];
  const lastMoves = allMoves.at(-1);
  const loadMoreLots = () => {
    const after = lastLots?.next;
    if (!after) return;
    setMoreLots({ busy: true, error: null });
    Promise.all([inventory.loadItemLots(itemId, warehouseId, after), costs ? inventory.loadItemLotValues(itemId, warehouseId, after) : Promise.resolve(null)]).then(
      ([page, pageValues]) => {
        setLotPages((current) => [...current, { lots: page, values: pageValues }]);
        setMoreLots({ busy: false, error: null });
      },
      (error: unknown) => setMoreLots({ busy: false, error }),
    );
  };
  const loadMoreMoves = () => {
    const after = lastMoves?.next;
    if (after === null || after === undefined) return;
    setMoreMoves({ busy: true, error: null });
    inventory.loadItemMoves(itemId, warehouseId, after).then(
      (page) => {
        setMovePages((current) => [...current, page]);
        setMoreMoves({ busy: false, error: null });
      },
      (error: unknown) => setMoreMoves({ busy: false, error }),
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <dl className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-ink-muted">{t('stock.item.kind', 'النوع')}</dt>
          <dd>{itemKindLabel(item.kind)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">{t('stock.item.base', 'تُعدّ')}</dt>
          <dd>{named ? t('stock.item.count_name', '{how}، والوحدة «{name}»', { how: countingLabel(item.baseUnit), name: named }) : countingLabel(item.baseUnit)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">{t('stock.item.min', 'الحدّ الأدنى')}</dt>
          <dd>{item.minQty !== null ? fmtQty(item.minQty, item.baseUnit, named ? { pieceLabel: named } : {}).main : '—'}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">{t('stock.item.density', 'الكثافة (كغم/لتر)')}</dt>
          <dd>{item.density !== null ? <bdi dir="ltr">{fmtScaledCell(item.density, 4, 4)}</bdi> : '—'}</dd>
        </div>
        <div className="sm:col-span-4">
          <dt className="text-sm text-ink-muted">{t('stock.item.packs', 'وحدات التعبئة')}</dt>
          <dd>{units.error ? t('stock.item.packs_failed', 'تعذّر تحميلها') : units.data ? units.data.filter((u) => !u.archived).map((u) => u.label).join(t('list.separator', '، ')) || '—' : '…'}</dd>
        </div>
      </dl>
      {only === 'lots' ? (
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('stock.lots.title', 'الوجبات')}</h2>
        {costs && values.error ? <LoadFailed what={t('stock.values.what', 'قيم المخزون')} error={values.error} onRetry={values.retry} /> : null}
        <LotsTable lots={allLots.flatMap((page) => page.rows)} values={lotValues} baseUnit={item.baseUnit} unitLabel={unitName(item.baseUnit, named)} />
        <PageFooter
          shown={allLots.reduce((sum, page) => sum + page.rows.length, 0)}
          total={lots.data.total}
          next={Boolean(lastLots?.next)}
          busy={moreLots.busy}
          error={moreLots.error}
          what={t('stock.lots.what', 'وجبات المادّة')}
          onMore={loadMoreLots}
          action="more-lots"
        />
      </section>
      ) : null}
      {only === 'moves' ? (
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('stock.moves.title', 'الحركات')}</h2>
        {moves.error ? (
          <LoadFailed what={t('stock.moves.what', 'حركات المادّة')} error={moves.error} onRetry={moves.retry} />
        ) : moves.data ? (
          <>
            <MovesTable moves={allMoves.flatMap((page) => page.rows)} baseUnit={item.baseUnit} unitLabel={unitName(item.baseUnit, named)} />
            <PageFooter
              shown={allMoves.reduce((sum, page) => sum + page.rows.length, 0)}
              total={moves.data.total}
              next={lastMoves?.next !== null && lastMoves?.next !== undefined}
              busy={moreMoves.busy}
              error={moreMoves.error}
              what={t('stock.moves.what', 'حركات المادّة')}
              onMore={loadMoreMoves}
              action="more-moves"
            />
          </>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

export default function ItemCardPage() {
  const id = useId();
  const { id: itemId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const setup = useLoad(inventory.loadOrgSetup);
  const [picked, setPicked] = useState(search.get('wh') ?? '');
  const tab = tabOf(search.get('tab'));
  const stores = setup.data ? scopedStores(storesOf(setup.data), workspace) : [];
  const warehouseId = stores.some((store) => store.id === picked) ? picked : '';
  const costs = Boolean(workspace?.canSeeCost);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('stock.card.title', 'بطاقة المادّة')}
        subtitle={t('stock.card.subtitle', 'سجلّ المادّة: من اشتريتها ومتى وبأي وحدة وبأي سعر، ثم وجباتها المتبقّية وحركاتها.')}
        actions={
          <Link to="/inventory" className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="back-to-board">
            {t('stores.back', 'كل المخازن')}
          </Link>
        }
      />
      {setup.error ? (
        <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />
      ) : !setup.data ? null : (
        <StoreSelect
          id={`${id}-store`}
          label={t('stock.card.store', 'المخزن (اتركه فارغاً لكل مخازنك)')}
          stores={stores}
          value={warehouseId}
          onChange={(next) => {
            setPicked(next);
            setSearch(cardParams(next, tab));
          }}
        />
      )}
      <Segmented<ItemTab>
        label={t('stock.card.tabs', 'أقسام بطاقة المادّة')}
        options={[
          { value: 'purchases', label: t('purchases.title', 'المشتريات') },
          { value: 'lots', label: t('stock.lots.title_left', 'الوجبات المتبقّية') },
          { value: 'moves', label: t('stock.moves.title', 'الحركات') },
        ]}
        value={tab}
        onChange={(next) => setSearch(cardParams(picked, next))}
      />
      {tab === 'purchases' ? (
        <PurchasesTab key={`${itemId}:${warehouseId}`} itemId={itemId} warehouseId={warehouseId} costs={costs} />
      ) : warehouseId ? (
        <Card key={warehouseId} itemId={itemId} warehouseId={warehouseId} costs={costs} only={tab} />
      ) : setup.data ? (
        <Notice tone="info" title={t('stock.card.pick', 'اختر المخزن لعرض وجبات المادّة وحركاتها.')} />
      ) : null}
    </div>
  );
}
