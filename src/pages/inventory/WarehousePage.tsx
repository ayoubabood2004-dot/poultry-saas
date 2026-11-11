import { ChevronLeft, Plus } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { StatStrip } from '../../components/ui/StatStrip';
import type { Fils } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { RECEIVING_KINDS } from '../../domain/stock';
import type { WarehouseKind } from '../../domain/stores';
import { fmtInt, fmtMoney, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { CategoryRow, StockBoardMoney, StockRow, StoreCard } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { useSession } from '../../lib/session';
import { warehouseKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { AddItemDialog, notListedHere } from './ItemCreate';
import { alerts } from './StockBoardPage';
import { StoreBadges } from './StoresCardsPage';
import { BuyLink, PageFooter, qtyColumns } from './stock-shared';

// داخل المخزن (كلمة المالك 2026-11-02: «اني شنو افتح سكشن جديد مثلا مواد الاكل، ضمن الاكل راح يندرج هواية مواد»، و«اريد
// تسويلي سعر البيع والربح المتوقع»، و«سوي طريقة اضافة المواد داخل المخزن مثل طريقة دكتور فيت»):
// مواد المخزن مجموعة في أقسام بعنوان التصنيف قابلة للطيّ، وقسم أخير «دون تصنيف»، وكل قسم بعدد مواده ومجموع قيمة المعروض
// لأدوار الكلفة. الصفوف والتصنيف والمال كلّها من stock_on_hand (0014): كلّ مادّة فعّالة يستلم المخزن نوعها تظهر ولو برصيد
// صفر — فالمادّة التي تُضاف اليوم تظهر في قسمها اليوم — ومعها قيمة المتاح وسعر البيع وقيمة البيع والربح المتوقّع لأدوار
// الكلفة، ومجاميع المخزن كلّه من الخادم (مو من جمع الصفوف، §2.8). البحث بالاسم المطبَّع، والسطر رابط لبطاقة المادّة. وبالهاتف
// بطاقة لا جدول. و«أضف مادّة» لمن يملك item.create (حكم الخادم بـcan_create_item، 0013) بنموذج بعمودين فيه الاسم والنوع
// والتصنيف وكيف تُعدّ والتعبئة والباركود والحدّ الأدنى وسعر البيع، ويّا تنبيه التوائم بـfind_item_twins قبل الحفظ.
// «رصيد العلف» (0025، كلمة المالك 2026-11-10: «كلهن لا اراديا يروحن للمخزن الى موقع خاص اسمه رصيد العلف، هناك تتجمع كل الخلطات الي عندي بكمياتها
// بنفس الترتيب الي رتبنا بيه»): مخزن العلف قائمة واحدة لا أقسام — منتجات العلائق الظاهرة بترتيب العلائق في المعمل، ثمّ بقيّة العلف بالاسم، والرصيد
// الصفري ظاهر — من كلّ صفحات stock_on_hand، والتنبيه يقول إنّ كلّ إنتاج المعمل يدخل هنا تلقائياً.

/** قسم تصنيف واحد: معرّفه (فارغ = دون تصنيف) واسمه ومواده. */
export interface Section {
  id: string;
  name: string;
  rows: readonly StockRow[];
}

/**
 * الأقسام بترتيب التصنيفات كما وصلت من الخادم (بالاسم)، و«دون تصنيف» أخيراً، والقسم الفارغ ما ينعرض. البحث بالاسم المطبَّع
 * (نفس searchable المستعمل بالخادم) على اسم المادّة أو باركودها. وتصنيف الصفّ من القراءة نفسها (0014).
 */
/** صفوف البحث: الاسم المطبَّع (نفس searchable المستعمل بالخادم) أو الباركود. */
function matching(rows: readonly StockRow[], search: string): readonly StockRow[] {
  const needle = searchable(search);
  const code = search.trim().toUpperCase();
  return needle ? rows.filter((row) => searchable(row.name).includes(needle) || (row.barcode !== null && row.barcode.toUpperCase().includes(code))) : rows;
}

export function sectionsOf(rows: readonly StockRow[], categories: readonly Pick<CategoryRow, 'id' | 'name'>[], search = ''): Section[] {
  const shown = matching(rows, search);
  const byCategory = new Map<string, StockRow[]>();
  for (const row of shown) {
    const key = row.categoryId ?? '';
    const list = byCategory.get(key);
    if (list) list.push(row);
    else byCategory.set(key, [row]);
  }
  const out: Section[] = [];
  for (const category of categories) {
    const found = byCategory.get(category.id);
    if (found) out.push({ id: category.id, name: category.name, rows: found });
  }
  // تصنيف ما وصل بقائمة التصنيفات (مؤرشف أو جديد بعد القراءة) ينضمّ لقسم باسمه كما وصل مع الصفّ، وإلّا «دون تصنيف».
  const known = new Set(categories.map((category) => category.id));
  const rest = [...byCategory].filter(([key]) => !known.has(key));
  for (const [key, list] of rest) {
    const name = key === '' ? t('items.category.none', 'دون تصنيف') : (list[0]?.categoryName ?? t('items.category.none', 'دون تصنيف'));
    const last = out.at(-1);
    if (key === '' || !list[0]?.categoryName) {
      if (last && last.id === '') last.rows = [...last.rows, ...list];
      else out.push({ id: '', name: t('items.category.none', 'دون تصنيف'), rows: list });
    } else out.push({ id: key, name, rows: list });
  }
  // «دون تصنيف» أخيراً دائماً.
  const none = out.findIndex((section) => section.id === '');
  if (none >= 0 && none !== out.length - 1) out.push(...out.splice(none, 1));
  return out;
}

/**
 * «رصيد العلف» قائمةً واحدة (0025): منتجات العلائق الظاهرة بترتيب العلائق (order من recipes_overview، والمنتج المشترك مرّة)، ثمّ بقيّة الموادّ بترتيب
 * الخادم (بالاسم المطبَّع)، والرصيد الصفري ظاهر (stock_on_hand يعرض كلّ علف فعّال ولو بلا رصيد). البحث يصفّي كما في الأقسام؛ وبلا صفّ لا قسم.
 */
export function feedSections(rows: readonly StockRow[], order: readonly string[], search = ''): Section[] {
  const shown = matching(rows, search);
  if (!shown.length) return [];
  // المنتج المكرّر في الترتيب (مشترك بين عليقتين) بأوّل ظهور: Map من order مباشرةً تأخذ آخر ظهور.
  const rank = new Map<string, number>();
  order.forEach((itemId, index) => {
    if (!rank.has(itemId)) rank.set(itemId, index);
  });
  const ranked = shown.filter((row) => rank.has(row.itemId)).sort((a, b) => (rank.get(a.itemId) ?? 0) - (rank.get(b.itemId) ?? 0));
  const rest = shown.filter((row) => !rank.has(row.itemId));
  return [{ id: 'feed', name: t('stores.feed.section', 'العلف بترتيب العلائق'), rows: [...ranked, ...rest] }];
}

/** مجموع قيمة المتاح لمواد القسم المحمّلة؛ null إذا المال ما وصل (دور بلا كلفة). */
export function sectionValue(rows: readonly StockRow[]): Fils | null {
  let sum = 0n;
  for (const row of rows) {
    if (!row.money) return null;
    sum += row.money.stockValue;
  }
  return rows.length ? sum : null;
}

/**
 * «سجّل شراء» لصفّ مادّة (كلمة المالك 2026-11-04، و«المخزن ببساطة» 2026-11-06): لمن يسجّل الشراء (purchase.record)، والمخزن غير مؤرشف ويستلم نوع
 * المادّة من المورّد (RECEIVING_KINDS، مرآة receiving_kinds) — فلا زرّ في مخزن حقل ولا لبيض المائدة. الحكم بالخادم.
 */
export function buyableIn(storeKind: WarehouseKind | undefined, archived: boolean, canBuy: boolean): (row: Pick<StockRow, 'kind' | 'archived'>) => boolean {
  return (row) => canBuy && !archived && storeKind !== undefined && !row.archived && RECEIVING_KINDS[row.kind].includes(storeKind);
}

/** سطر مادّة بالهاتف: بطاقة لا جدول، و«اشترِ كمية» تحتها (رابطان متجاوران لا متداخلان). */
function ItemCardRow({ row, warehouseId, costs, buy }: { row: StockRow; warehouseId: string; costs: boolean; buy: boolean }) {
  const alert = alerts(row);
  const sell = row.money?.sellPrice ?? null;
  return (
    <div className="card flex flex-col gap-2 p-3">
      <Link to={`/inventory/items/${row.itemId}/details?${new URLSearchParams({ wh: warehouseId, back: `/inventory/store/${warehouseId}` }).toString()}`} className="flex items-center gap-3" data-action="open-item-card">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{row.name}</span>
          <span className="text-sm text-ink-muted">{fmtQty(row.available, row.baseUnit).main}</span>
          {row.expired > 0n ? <span className="text-sm text-danger-800 dark:text-danger-100">{t('stores.row.expired', 'منتهٍ: {qty}', { qty: fmtQty(row.expired, row.baseUnit).main })}</span> : null}
          {costs && row.money ? (
            <span className="text-sm text-ink-muted">
              {t('stock.col.value', 'قيمة المتاح')}: <MoneyText amount={row.money.stockValue} />
            </span>
          ) : null}
          {costs && sell !== null ? (
            <span className="text-sm text-ink-muted">
              {t('items.sell_price', 'سعر البيع')}: <MoneyText amount={sell} />
            </span>
          ) : null}
          {alert ? <span className="text-sm text-warn-800 dark:text-warn-200">{alert}</span> : null}
        </span>
        <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-ink-muted ltr:rotate-180" />
      </Link>
      {buy ? (
        <div>
          <BuyLink itemId={row.itemId} back={`/inventory/store/${warehouseId}`} />
        </div>
      ) : null}
    </div>
  );
}

/** جدول القسم بالحاسوب: المادّة والمتاح والمنتهي وسعر البيع وقيمة المتاح وقيمة البيع والتنبيه، و«اشترِ كمية» لمن يشتري. */
export function SectionTable({ section, warehouseId, costs, buy }: { section: Section; warehouseId: string; costs: boolean; buy?: (row: StockRow) => boolean }) {
  const rows = section.rows;
  const columns: Column<StockRow>[] = [
    {
      key: 'item',
      header: t('stock.col.item', 'المادّة'),
      sticky: true,
      cell: (row) => (
        <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/inventory/items/${row.itemId}/details?wh=${warehouseId}`} data-action="open-item-card">
          {row.name}
        </Link>
      ),
    },
    ...qtyColumns(rows, (row) => row.available, (unit) => t('stock.col.available', 'المتاح ({unit})', { unit })),
  ];
  if (rows.some((row) => row.expired > 0n)) columns.push(...qtyColumns(rows, (row) => row.expired, (unit) => t('stock.col.expired', 'منتهي ({unit})', { unit })));
  if (costs) {
    columns.push(
      {
        key: 'value',
        header: t('stock.col.value', 'قيمة المتاح'),
        kind: 'number',
        // المال كلّه من الخادم: صفّ بلا money (دور بلا كلفة) «—»، والمادّة بلا رصيد قيمتها صفر فعلاً.
        cell: (row) => (row.money ? <Num>{fmtMoney(row.money.stockValue)}</Num> : '—'),
      },
      {
        key: 'sell_price',
        header: t('items.sell_price', 'سعر البيع'),
        kind: 'number',
        cell: (row) => {
          const sell = row.money?.sellPrice ?? null;
          return sell === null ? <span className="text-xs text-ink-muted">{t('items.sell_price.none', 'بلا سعر')}</span> : <Num>{fmtMoney(sell)}</Num>;
        },
      },
      {
        key: 'sale_value',
        header: t('stock.col.sale_value', 'قيمة البيع'),
        kind: 'number',
        cell: (row) => {
          const sale = row.money?.saleValue ?? null;
          return sale === null ? '—' : <Num>{fmtMoney(sale)}</Num>;
        },
      },
    );
  }
  columns.push({ key: 'alerts', header: t('stock.col.alerts', 'تنبيه'), wrap: true, cell: (row) => <span className="text-warn-800 dark:text-warn-200">{alerts(row)}</span> });
  if (buy && rows.some(buy)) columns.push({ key: 'buy', header: t('org.col.actions', 'إجراءات'), cell: (row) => (buy(row) ? <BuyLink itemId={row.itemId} back={`/inventory/store/${warehouseId}`} /> : null) });
  return <DataTable caption={t('stores.section.caption', 'مواد قسم {name}', { name: section.name })} columns={columns} rows={rows} rowKey={(row) => row.itemId} empty={t('stock.board.none', 'لا مواد.')} />;
}

/** قسم تصنيف قابل للطيّ: العنوان بعدد مواده ومجموع قيمتها لأدوار الكلفة. */
export function SectionBlock({ section, warehouseId, costs, buy }: { section: Section; warehouseId: string; costs: boolean; buy?: (row: StockRow) => boolean }) {
  const total = costs ? sectionValue(section.rows) : null;
  return (
    <details open className="card p-4">
      <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold" data-action="toggle-section">
        <span className="text-base">{section.name}</span>
        <span className="text-sm font-normal text-ink-muted">{t('stores.section.count', '{n} مادّة', { n: fmtInt(section.rows.length) })}</span>
        {total !== null ? (
          <span className="text-sm font-normal text-ink-muted">
            <MoneyText amount={total} />
          </span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-2 pt-4 sm:hidden">
        {section.rows.map((row) => (
          <ItemCardRow key={row.itemId} row={row} warehouseId={warehouseId} costs={costs} buy={buy ? buy(row) : false} />
        ))}
      </div>
      <div className="hidden pt-4 sm:block">
        <SectionTable section={section} warehouseId={warehouseId} costs={costs} buy={buy} />
      </div>
    </details>
  );
}

/** شريط أرقام المخزن من مجاميع الخادم (0014): المواد، ورأس المال، وقيمة البيع، والربح المتوقّع. */
export function WarehouseStats({ items, money }: { items: number | null; money: StockBoardMoney | null }) {
  const stats = [
    ...(items === null ? [] : [{ key: 'items', label: t('stores.items_count', 'المواد'), value: fmtInt(items) }]),
    ...(money
      ? [
          { key: 'capital', label: t('stores.capital', 'رأس المال'), value: <MoneyText amount={money.stockValue} /> },
          { key: 'sale', label: t('stock.col.sale_value', 'قيمة البيع'), value: <MoneyText amount={money.saleValue} /> },
          { key: 'profit', label: t('stores.profit', 'الربح المتوقّع'), value: <MoneyText amount={money.expectedProfit} /> },
        ]
      : []),
  ];
  if (!stats.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <StatStrip stats={stats} />
      {money && money.itemsUnpriced > 0 ? (
        <p className="text-xs text-ink-muted">{t('stores.unpriced', 'قيمة البيع والربح المتوقّع لا تشملان {n} لم يُكتب لها سعر بيع.', { n: t('stores.unpriced.items', '{n} مادّة', { n: fmtInt(money.itemsUnpriced) }) })}</p>
      ) : null}
    </div>
  );
}

/**
 * مخزن العلف الجاهز (كلمة المالك 2026-11-04): المالك أنشأ «ذرة» و«صويا» و«زيت» بنوع «علف» فظهرت في هذا المخزن. التنبيه يقول
 * ما مكان هذا المخزن وأين المواد الأوّلية، برابط أوّل مخزن موادّ أوّلية بنطاقه (ووحدته أوّلاً). بلا مخزن منها يقول ذلك.
 * و«رصيد العلف» (0025): كلّ إنتاج المعمل يدخل هنا تلقائياً، بلا اختيار مخزن.
 */
export function FeedStoreNotice({ store, stores }: { store: { kind: WarehouseKind; divisionId: string }; stores: readonly Pick<StoreCard, 'id' | 'name' | 'kind' | 'divisionId'>[] }) {
  if (store.kind !== 'feed') return null;
  const raw = stores.find((row) => row.kind === 'raw' && row.divisionId === store.divisionId) ?? stores.find((row) => row.kind === 'raw');
  return (
    <Notice
      tone="info"
      title={t('stores.feed.notice_v4', 'كلّ إنتاج المعمل يدخل هنا تلقائياً')}
      action={
        raw ? (
          <Link to={`/inventory/store/${raw.id}`} className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="open-raw-store">
            {t('stores.feed.open_raw', 'افتح «{name}»', { name: raw.name })}
          </Link>
        ) : undefined
      }
    >
      {raw
        ? t('stores.feed.raw_place', 'العلف هنا بترتيب العلائق في المعمل؛ والذرة والصويا وبقيّة المواد الأوّلية مكانها «{name}».', { name: raw.name })
        : t('stores.feed.no_raw', 'لا مخزن موادّ أوّلية في نطاقك بعد؛ يضيفه المدير من «المخزن» ثم «أضف مخزناً».')}
    </Notice>
  );
}

/** جسم الصفحة من صفوفه (دالّة عرض صافية، تنفحص بلا متصفّح). */
export function WarehouseBody({ sections, warehouseId, costs, searching, buy }: { sections: readonly Section[]; warehouseId: string; costs: boolean; searching: boolean; buy?: (row: StockRow) => boolean }) {
  if (sections.length === 0) {
    return <Notice tone="info" title={searching ? t('items.empty', 'لا موادّ بهذا البحث.') : t('stores.items.empty', 'لا مواد في هذا المخزن بعد.')} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <SectionBlock key={section.id || 'none'} section={section} warehouseId={warehouseId} costs={costs} buy={buy} />
      ))}
    </div>
  );
}

export default function WarehousePage() {
  const id = useId();
  const { id: warehouseId = '' } = useParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const costs = Boolean(workspace?.canSeeCost);
  const overview = useLoad(inventory.loadStoresOverview);
  const setup = useLoad(inventory.loadOrgSetup);
  const loadFirst = useCallback(() => inventory.loadStockOnHand(warehouseId), [warehouseId]);
  const first = useLoad(loadFirst, warehouseId);
  const [pages, setPages] = useState<{ rows: readonly StockRow[]; next: inventory.StockCursor | null }[]>([]);
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<inventory.ItemRow | null>(null);

  const card: StoreCard | undefined = overview.data?.rows.find((row) => row.id === warehouseId);
  const allRows = [...(first.data?.rows ?? []), ...pages.flatMap((page) => page.rows)];
  // مادّة انسمّت بين صفحتين تطلع بالثانية هم: تنعرض مرّة، بأوّل ظهور (نفس قاعدة اللوحة).
  const seen = new Set<string>();
  const rows = allRows.filter((row) => (seen.has(row.itemId) ? false : (seen.add(row.itemId), true)));
  const last = pages.at(-1) ?? (first.data ? { next: first.data.next } : null);
  const next = last?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    inventory.loadStockOnHand(warehouseId, next).then(
      (board) => {
        setPages((current) => [...current, { rows: board.rows, next: board.next }]);
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };

  // «رصيد العلف» (0025): كلّ الصفحات وترتيب العلائق بقراءة واحدة، والقائمة واحدة لا أقسام.
  const feedKind = (card?.kind ?? first.data?.warehouse.kind) === 'feed';
  const loadFeed = useCallback(
    () => (feedKind ? Promise.all([inventory.loadAllStockOnHand(warehouseId), inventory.loadFeedOrder()]).then(([board, order]) => ({ board, order })) : Promise.resolve(null)),
    [feedKind, warehouseId],
  );
  const feed = useLoad(loadFeed, `${warehouseId}#${feedKind}`);
  const sections = feedKind ? feedSections(feed.data?.board.rows ?? [], feed.data?.order ?? [], search) : sectionsOf(rows, setup.data?.itemCategories ?? [], search);
  const title = card?.name ?? first.data?.warehouse.name ?? t('stock.store', 'المخزن');
  // نوع المخزن ووحدته من بطاقته، أو من رأس القائمة إن سبقت (الاثنان من الخادم).
  const store = card ?? first.data?.warehouse;
  const canBuy = workspace ? can(workspace.role, 'purchase.record') : false;
  const buy = buyableIn(store?.kind, Boolean(first.data?.warehouse.archived), canBuy);
  const addedElsewhere = added ? notListedHere(added.kind, store ? { name: title, kind: store.kind } : undefined) : null;
  return (
    <div className="flex flex-col gap-4">
      <BackButton to="/inventory/stores" label={t('back.stores', 'رجوع إلى المخازن')} action="back-to-stores" />
      <PageHeader
        title={title}
        subtitle={card ? t('stores.where', '{site} — {division} — {kind}', { site: card.siteName, division: divisionLabel(card.divisionKind), kind: warehouseKindLabel(card.kind) }) : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {overview.data?.canCreateItem ? (
              <Button onClick={() => setAdding(true)} data-action="add-item">
                <Plus aria-hidden="true" className="size-4" />
                {t('stores.item.add', 'أضف مادّة')}
              </Button>
            ) : null}
          </div>
        }
      />
      {added ? (
        <Notice tone={addedElsewhere ? 'warning' : 'info'} title={t('stores.item.added', 'أُضيفت المادّة «{name}»', { name: added.name })}>
          {addedElsewhere ? <p>{addedElsewhere}</p> : null}
          <Link to={`/inventory/items/${added.id}`} className="font-medium text-brand-700 dark:text-brand-200" data-action="open-added-item">
            {addedElsewhere ? t('stores.item.added.card', 'افتح بطاقتها.') : t('stores.item.added.detail', 'تظهر في قسمها الآن برصيد صفر. افتح بطاقتها.')}
          </Link>
        </Notice>
      ) : null}
      {store ? <FeedStoreNotice store={store} stores={overview.data?.rows ?? []} /> : null}
      {first.data ? <WarehouseStats items={first.data.total} money={costs ? first.data.money : null} /> : null}
      <Field id={`${id}-search`} label={t('stores.search', 'ابحث عن مادّة')}>
        <input id={`${id}-search`} type="search" autoComplete="off" className="input" value={search} onChange={(event) => setSearch(event.target.value)} />
      </Field>
      {card ? <StoreBadges card={card} /> : null}
      {first.error ? (
        <LoadFailed what={t('stock.board.what', 'رصيد المخزن')} error={first.error} onRetry={first.retry} />
      ) : feedKind && feed.error ? (
        <LoadFailed what={t('stores.feed.what', 'رصيد العلف')} error={feed.error} onRetry={feed.retry} />
      ) : feedKind && feed.data ? (
        <>
          <WarehouseBody sections={sections} warehouseId={warehouseId} costs={costs} searching={search.trim() !== ''} buy={buy} />
          <PageFooter
            shown={feed.data.board.rows.length}
            total={feed.data.board.total}
            next={false}
            busy={false}
            error={null}
            what={t('stores.feed.what', 'رصيد العلف')}
            onMore={feed.retry}
            action="more-stock"
          />
        </>
      ) : !first.data || feedKind ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <WarehouseBody sections={sections} warehouseId={warehouseId} costs={costs} searching={search.trim() !== ''} buy={buy} />
          <PageFooter
            shown={rows.length}
            total={first.data.total}
            next={Boolean(next)}
            busy={more.busy}
            error={more.error}
            what={t('stock.board.what', 'رصيد المخزن')}
            onMore={loadMore}
            action="more-stock"
          />
        </>
      )}
      {adding ? (
        <AddItemDialog
          categories={setup.data?.itemCategories ?? []}
          storeKind={store?.kind}
          costs={costs}
          purchase={{ warehouseId: first.data?.warehouse.archived ? null : warehouseId, canBuy }}
          listStore={store ? { name: title, kind: store.kind } : undefined}
          onClose={() => setAdding(false)}
          onSaved={(item) => {
            setAdding(false);
            setAdded(item);
            first.retry();
            if (feedKind) feed.retry();
          }}
        />
      ) : null}
    </div>
  );
}
