import { useCallback, useId, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import type { Fils, Milli } from '../../domain/money';
import { unitCost4 } from '../../domain/money';
import { CHICK_WARNING_HOURS } from '../../domain/stock';
import type { BaseUnit } from '../../domain/units';
import { fmtCounted, fmtDay, fmtMoney, fmtQty, fmtScaledCell, fmtUnitCost } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { ItemLots, ItemMoves, LotRow, MoveRow } from '../../lib/repo/inventory';
import { useSession } from '../../lib/session';
import { baseUnitLabel, itemKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { countingLabel, countName, PageFooter, qtyCell, qtyDecimals, scopedStores, StoreSelect, storesOf, unitName } from './stock-shared';

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

function Card({ itemId, warehouseId, costs }: { itemId: string; warehouseId: string; costs: boolean }) {
  const loadLots = useCallback(() => inventory.loadItemLots(itemId, warehouseId), [itemId, warehouseId]);
  const loadMoves = useCallback(() => inventory.loadItemMoves(itemId, warehouseId), [itemId, warehouseId]);
  const loadValues = useCallback(() => (costs ? inventory.loadItemLotValues(itemId, warehouseId) : Promise.resolve(null)), [itemId, warehouseId, costs]);
  const loadUnits = useCallback(() => inventory.listItemUnits(itemId), [itemId]);
  const lots = useLoad(loadLots, `${itemId}:${warehouseId}`);
  const moves = useLoad(loadMoves, `${itemId}:${warehouseId}`);
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
  const stores = setup.data ? scopedStores(storesOf(setup.data), workspace) : [];
  const warehouseId = stores.some((store) => store.id === picked) ? picked : '';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('stock.card.title', 'بطاقة المادّة')}
        actions={
          <Link to="/inventory" className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="back-to-board">
            {t('stock.card.back', 'لوحة المخزون')}
          </Link>
        }
      />
      {setup.error ? (
        <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />
      ) : !setup.data ? null : (
        <StoreSelect
          id={`${id}-store`}
          label={t('stock.store', 'المخزن')}
          stores={stores}
          value={warehouseId}
          onChange={(next) => {
            setPicked(next);
            setSearch(next ? { wh: next } : {});
          }}
        />
      )}
      {warehouseId ? <Card key={warehouseId} itemId={itemId} warehouseId={warehouseId} costs={Boolean(workspace?.canSeeCost)} /> : setup.data ? <Notice tone="info" title={t('stock.card.pick', 'اختر المخزن لعرض وجبات المادّة وحركاتها.')} /> : null}
    </div>
  );
}
