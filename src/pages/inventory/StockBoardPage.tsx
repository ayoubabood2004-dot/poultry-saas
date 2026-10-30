import { ArrowLeftRight, Boxes, Building2, ClipboardCheck, ClipboardList, PackageMinus, PackagePlus } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import type { DivisionKind } from '../../domain/divisions';
import { can } from '../../domain/permissions';
import { CHICK_WARNING_HOURS } from '../../domain/stock';
import type { BaseUnit } from '../../domain/units';
import { fmtInt, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as counts from '../../lib/repo/counts';
import * as inventory from '../../lib/repo/inventory';
import type { StockBoard, StockRow, StockTotals, StockValue } from '../../lib/repo/inventory';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { qtyCell, qtyDecimals, readTime, scopedStores, StoreSelect, storesOf } from './stock-shared';

// لوحة المخزون (الخطّة WP4، FOUNDATION ٧٧٩–٧٨٥): لكل مخزن بنطاق المستخدم جدول لكل وحدة أساس (E23، الوحدة برأس العمود): المتاح
// والمنتهي (عمود منفصل) وقريب الانتهاء، وتنبيه الحدّ الأدنى (E22) وتنبيه الفرخ بعد 48 ساعة (E24)، ووقت القراءة. عمود القيمة
// ومجموعها لأدوار الكلفة بس: القيم من stock_values والمجموع من stock_value_totals (SQL)، وما ينبنون أصلاً بالصفحة لغيرهم. الفشل
// LoadFailed مو جدول فارغ، والصفحات بالمعرّف ويّا «N من المجموع».

const UNIT_ORDER: readonly BaseUnit[] = ['kg', 'L', 'pc'];

function alerts(row: StockRow): string {
  const out: string[] = [];
  if (row.belowMin) out.push(t('stock.alert.below_min', 'تحت الحدّ الأدنى'));
  if (row.nearExpiry > 0n) out.push(t('stock.alert.near_expiry', 'قريب الانتهاء'));
  if (row.expired > 0n) out.push(t('stock.alert.expired', 'فيه منتهٍ'));
  if (row.chickAgeHours !== null && row.chickAgeHours >= BigInt(CHICK_WARNING_HOURS)) out.push(t('stock.alert.chicks', 'أفراخ فاتها {hours} ساعة', { hours: fmtInt(CHICK_WARNING_HOURS) }));
  return out.join(t('list.separator', '، '));
}

/** جداول اللوحة بوحدة الأساس. values = null لدور بلا كلفة: عمود القيمة ما يتبنى أصلاً. */
export function BoardTables({ board, values, warehouseId }: { board: StockBoard; values: ReadonlyMap<string, StockValue> | null; warehouseId: string }) {
  const units = UNIT_ORDER.filter((unit) => board.rows.some((row) => row.baseUnit === unit));
  if (units.length === 0) return <Notice tone="info" title={t('stock.board.empty', 'لا رصيد في هذا المخزن.')} />;
  return (
    <div className="flex flex-col gap-4">
      {units.map((unit) => {
        const rows = board.rows.filter((row) => row.baseUnit === unit);
        const decimals = qtyDecimals(rows.flatMap((row) => [row.available, row.expired, row.nearExpiry]), unit);
        const unitName = baseUnitLabel(unit);
        const columns: Column<StockRow>[] = [
          {
            key: 'item',
            header: t('stock.col.item', 'المادّة'),
            sticky: true,
            cell: (row) => (
              <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/items/${row.itemId}?wh=${warehouseId}`} data-action="open-item-card">
                {row.name}
              </Link>
            ),
          },
          { key: 'available', header: t('stock.col.available', 'المتاح ({unit})', { unit: unitName }), kind: 'number', cell: (row) => <Num>{qtyCell(row.available, decimals)}</Num> },
          { key: 'expired', header: t('stock.col.expired', 'منتهي ({unit})', { unit: unitName }), kind: 'number', cell: (row) => <Num>{qtyCell(row.expired, decimals)}</Num> },
          { key: 'near', header: t('stock.col.near', 'قريب الانتهاء ({unit})', { unit: unitName }), kind: 'number', cell: (row) => <Num>{qtyCell(row.nearExpiry, decimals)}</Num> },
          { key: 'alerts', header: t('stock.col.alerts', 'تنبيه'), wrap: true, cell: (row) => <span className="text-warn-800 dark:text-warn-200">{alerts(row)}</span> },
        ];
        if (values) {
          // قيمة ما انقرت بعد (صفحة قيمها ما وصلت) «—» مو 0.00؛ والمادّة بلا رصيد (تحت حدّها بس) قيمتها صفر فعلاً.
          columns.push({
            key: 'value',
            header: t('stock.col.value', 'قيمة المتاح'),
            kind: 'number',
            cell: (row) => {
              const value = values.get(row.itemId);
              if (value) return <Num>{fmtMoney(value.available)}</Num>;
              return row.available === 0n && row.expired === 0n ? <Num>{fmtMoney(0n)}</Num> : '—';
            },
          });
        }
        return (
          <section key={unit} className="flex flex-col gap-2" aria-label={unitName}>
            <h3 className="font-semibold">{t('stock.board.unit', 'بوحدة {unit}', { unit: unitName })}</h3>
            <DataTable caption={t('stock.board.caption', 'رصيد المخزن بوحدة {unit}', { unit: unitName })} columns={columns} rows={rows} rowKey={(row) => row.itemId} empty={t('stock.board.none', 'لا مواد.')} />
          </section>
        );
      })}
    </div>
  );
}

/** مجموع القيمة من الخادم (stock_value_totals)، مو جمع الصفوف المحمّلة (§2.8). */
export function ValueTotals({ totals }: { totals: StockTotals }) {
  return (
    <dl className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
      <div>
        <dt className="text-sm text-ink-muted">{t('stock.total.available', 'قيمة المتاح')}</dt>
        <dd className="text-lg font-semibold">
          <MoneyText amount={totals.available} />
        </dd>
      </div>
      <div>
        <dt className="text-sm text-ink-muted">{t('stock.total.expired', 'قيمة المنتهي')}</dt>
        <dd className="text-lg font-semibold">
          <MoneyText amount={totals.expired} />
        </dd>
      </div>
      <div>
        <dt className="text-sm text-ink-muted">{t('stock.total.all', 'المجموع')}</dt>
        <dd className="text-lg font-semibold">
          <MoneyText amount={totals.total} />
        </dd>
      </div>
    </dl>
  );
}

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  retry: () => void;
}

/**
 * جسم لوحة المخزن من حالات قراءتها (دالّة صافية للعرض، تنفحص بلا متصفّح): الفشل LoadFailed مو جدول فارغ (FOUNDATION ٧٩٨)، والقيم
 * ومجموعها لدور الكلفة بس، والمجموع من الخادم.
 */
export function BoardBody({ first, rows, values, totals, costs, warehouseId }: { first: Loaded<StockBoard>; rows: readonly StockRow[]; values: Loaded<ReadonlyMap<string, StockValue> | null>; totals: Loaded<StockTotals | null>; costs: boolean; warehouseId: string }) {
  if (first.error) return <LoadFailed what={t('stock.board.what', 'رصيد المخزن')} error={first.error} onRetry={first.retry} />;
  if (!first.data) return <p role="status" className="text-sm text-ink-muted">{t('page.loading', 'جارٍ الفتح…')}</p>;
  const board: StockBoard = { ...first.data, rows };
  return (
    <>
      {board.warehouse.archived && board.warehouse.hasBalance ? (
        <Notice tone="warning" title={t('stock.archived_balance', 'المخزن «{name}» مؤرشف وعليه رصيد', { name: board.warehouse.name })}>
          {t('stock.archived_balance.detail', 'رجع إليه رصيد بإلغاء مستند بعد أرشفته. أعِده من الأرشيف أو انقل رصيده.')}
        </Notice>
      ) : null}
      <p className="text-sm text-ink-muted">
        {t('stock.board.read_at', 'آخر قراءة {time}، {shown} من المجموع {total}.', { time: readTime(board.asOf), shown: fmtInt(rows.length), total: fmtInt(first.data.total ?? rows.length) })}
      </p>
      {costs ? (
        values.error || totals.error ? (
          <LoadFailed what={t('stock.values.what', 'قيم المخزون')} error={values.error ?? totals.error} onRetry={() => (values.error ? values.retry() : totals.retry())} />
        ) : totals.data ? (
          <ValueTotals totals={totals.data} />
        ) : null
      ) : null}
      <BoardTables board={board} values={costs ? (values.data ?? null) : null} warehouseId={warehouseId} />
    </>
  );
}

/** مادّة انسمّت بين صفحتين تطلع بصفحتها الثانية هم (المؤشّر بالاسم كما وصل): تنعرض مرّة، بأوّل ظهور. */
function distinctRows(rows: readonly StockRow[]): StockRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.itemId) ? false : (seen.add(row.itemId), true)));
}

/** صفحة اللوحة الجاية: كمياتها، ولدور الكلفة قيمها بنفس المؤشّر (stock_values بترتيب stock_on_hand، فصفحة القيم تغطّي صفحتها). */
function nextBoardPage(warehouseId: string, after: inventory.StockCursor, costs: boolean): Promise<{ board: StockBoard; values: ReadonlyMap<string, StockValue> | null }> {
  return Promise.all([inventory.loadStockOnHand(warehouseId, after), costs ? inventory.loadStockValues(warehouseId, after) : Promise.resolve(null)]).then(([board, values]) => ({ board, values }));
}

function WarehouseBoard({ warehouseId, costs }: { warehouseId: string; costs: boolean }) {
  const [pages, setPages] = useState<{ board: StockBoard; values: ReadonlyMap<string, StockValue> | null }[]>([]);
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const loadFirst = useCallback(() => inventory.loadStockOnHand(warehouseId), [warehouseId]);
  const loadValues = useCallback(() => (costs ? inventory.loadStockValues(warehouseId) : Promise.resolve(null)), [warehouseId, costs]);
  const loadTotals = useCallback(() => (costs ? inventory.loadStockValueTotals(warehouseId) : Promise.resolve(null)), [warehouseId, costs]);
  const first = useLoad(loadFirst, warehouseId);
  const values = useLoad(loadValues, `${warehouseId}:${costs}`);
  const totals = useLoad(loadTotals, `${warehouseId}:${costs}`);
  const all = first.data ? [first.data, ...pages.map((page) => page.board)] : [];
  const last = all.at(-1);
  // قيم كل الصفحات المحمّلة سوا (أوّل صفحة من values، والباقي ويّا صفحتها)، فما تطلع مادّة بالصفحة الثانية بقيمة 0.00.
  const allValues: Loaded<ReadonlyMap<string, StockValue> | null> = {
    ...values,
    data: values.data ? new Map([...values.data, ...pages.flatMap((page) => (page.values ? [...page.values] : []))]) : null,
  };
  const loadMore = () => {
    if (!last?.next) return;
    setMore({ busy: true, error: null });
    nextBoardPage(warehouseId, last.next, costs).then(
      (page) => {
        setPages((current) => [...current, page]);
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <BoardBody first={first} rows={distinctRows(all.flatMap((page) => page.rows))} values={allValues} totals={totals} costs={costs} warehouseId={warehouseId} />
      {last?.next ? (
        <Button variant="secondary" busy={more.busy} onClick={loadMore} data-action="more-stock">
          {t('stock.board.more', 'المزيد')}
        </Button>
      ) : null}
      {more.error ? <LoadFailed what={t('stock.board.what', 'رصيد المخزن')} error={more.error} onRetry={loadMore} /> : null}
    </div>
  );
}

function boardTitle(division: DivisionKind | undefined): string {
  if (division === 'medicine') return t('nav.medicine', 'مخزن الأدوية');
  if (division === 'general') return t('nav.general', 'المخازن العامة');
  if (division === 'feed_mill') return t('stock.board.mill', 'مخازن معمل العلف');
  if (division === 'hatchery') return t('stock.board.hatchery', 'مخازن المفقس');
  return t('nav.inventory', 'كل المخازن');
}

export default function StockBoardPage({ division }: { division?: DivisionKind }) {
  const id = useId();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const setup = useLoad(inventory.loadOrgSetup);
  const [picked, setPicked] = useState('');
  const stores = setup.data ? scopedStores(storesOf(setup.data), workspace, division) : [];
  const warehouseId = stores.some((store) => store.id === picked) ? picked : (stores[0]?.id ?? '');
  const role = workspace?.role;
  // «بانتظار موافقة المدير» (Q5، E53) لمن يقدر يوافق (الخادم يرجّعها له بس)؛ فشلها يبين بـ«أعد المحاولة» وما يوقف اللوحة.
  const approvals = useLoad(counts.loadApprovals, role ?? '');
  const pending = approvals.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={boardTitle(division)}
        subtitle={t('stock.board.subtitle', 'الرصيد بالوحدة التي تُعدّ بها كل مادّة، والمنتهي في عمود منفصل لا يُسحب.')}
        actions={
          <nav className="flex flex-wrap gap-2" aria-label={t('stock.board.links', 'روابط المخزون')}>
            {role && (can(role, 'receipt.draft') || can(role, 'receipt.amounts')) ? (
              <Link to="/inventory/receipts" className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action="open-receipts">
                <PackagePlus aria-hidden="true" className="size-4" />
                {t('stock.receipts', 'الاستلام من المورّدين')}
              </Link>
            ) : null}
            {role && can(role, 'transfer.post') ? (
              <Link to="/inventory/transfers" className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action="open-transfers">
                <ArrowLeftRight aria-hidden="true" className="size-4" />
                {t('stock.transfers', 'التحويلات')}
              </Link>
            ) : null}
            {role && can(role, 'stock_use.post') ? (
              <Link to="/inventory/uses" className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action="open-uses">
                <PackageMinus aria-hidden="true" className="size-4" />
                {t('stock.uses', 'الصرف والإتلاف')}
              </Link>
            ) : null}
            {role && can(role, 'count.enter') ? (
              <Link to="/inventory/counts" className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action="open-counts">
                <ClipboardCheck aria-hidden="true" className="size-4" />
                {t('stock.counts', 'الجرد')}
              </Link>
            ) : null}
            {role && can(role, 'opening.post') ? (
              <Link to="/inventory/openings" className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action="open-openings">
                <ClipboardList aria-hidden="true" className="size-4" />
                {t('stock.openings', 'الرصيد عند البداية')}
              </Link>
            ) : null}
            <Link to="/inventory/items" className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action="open-items">
              <Boxes aria-hidden="true" className="size-4" />
              {t('items.title', 'المواد')}
            </Link>
            <Link to="/settings/org" className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action="open-org-settings">
              <Building2 aria-hidden="true" className="size-4" />
              {t('org.title', 'إعدادات المنشأة')}
            </Link>
          </nav>
        }
      />
      {pending && (pending.counts > 0 || pending.uses > 0) ? (
        <Notice tone="warning" title={t('stock.approvals', 'بانتظار موافقة المدير')}>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {pending.counts > 0 ? (
              <Link to="/inventory/counts" className="font-medium text-brand-700 dark:text-brand-200" data-action="open-pending-counts">
                {t('stock.approvals.counts', 'جرود للمراجعة: {n}', { n: fmtInt(pending.counts) })}
              </Link>
            ) : null}
            {pending.uses > 0 ? (
              <Link to="/inventory/uses?awaiting=1" className="font-medium text-brand-700 dark:text-brand-200" data-action="open-pending-uses">
                {t('stock.approvals.uses', 'صرف وإتلاف بانتظارك: {n}', { n: fmtInt(pending.uses) })}
              </Link>
            ) : null}
          </span>
        </Notice>
      ) : null}
      {approvals.error ? <LoadFailed what={t('stock.approvals.what', 'الموافقات المنتظرة')} error={approvals.error} onRetry={approvals.retry} /> : null}
      {setup.error ? (
        <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={setup.error} onRetry={setup.retry} />
      ) : !setup.data ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : stores.length === 0 ? (
        <Notice tone="info" title={t('stock.stores.none', 'لا مخزن في نطاقك.')}>
          {t('stock.stores.none.detail', 'يحدّد مالك المنشأة نطاقك من شاشة الموظفين.')}
        </Notice>
      ) : (
        <>
          <StoreSelect id={`${id}-store`} label={t('stock.store', 'المخزن')} stores={stores} value={warehouseId} onChange={setPicked} />
          {warehouseId ? <WarehouseBoard key={warehouseId} warehouseId={warehouseId} costs={Boolean(workspace?.canSeeCost)} /> : null}
        </>
      )}
    </div>
  );
}
