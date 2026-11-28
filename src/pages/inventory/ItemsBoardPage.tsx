import { ArrowUpDown, Building2, CalendarDays, ChevronLeft, LayoutGrid, Plus, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { searchable } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import type { ItemKind } from '../../domain/stores';
import { fmtDay, fmtInt, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { ItemsOverview, OverviewItem } from '../../lib/repo/purchases';
import { DEFAULT_COLORS, shownColor, type StoreColors } from '../../lib/repo/storeMarks';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { ArrangeDialog } from './ArrangeDialog';
import { DayBalanceView } from './DayBalanceView';
import { SimpleItemDialog } from './ItemCreate';
import { colorName, MARK_LOOK, stateWord, tintStyle } from './markColors';
import { baseQty, itemFilePath } from './simple-shared';
import { InventoryLinks, PendingApprovals } from './stock-shared';
import { itemsCountText, SECTION_ADD_KIND, sectionName, sectionOfKind, STORE_SECTIONS, type StoreSection } from './storeSections';

// المخزن = بطاقات المواد (كلمة المالك 2026-11-06، «المخزن ببساطة»: «لما اتراجع خطوة لصنف الذرة راح يكون عندي مجموع كيلوات»):
// بطاقة لكلّ مادّة فعّالة من items_overview — اسمها كبيراً، و«الموجود» و«مجموع ما اشتريته» بوحدتها، وسعر البيع لمن يرى المال —
// والبطاقة كلّها رابط ملفّ المادّة (فيه «سجّل شراء»). والبحث بالاسم المطبَّع بالجهاز (القائمة كلّها من قراءة واحدة)، و«أضف مادّة»
// بحكم الخادم (can_add_item). والمخازن وأوراقها (التحويل والصرف والجرد والرصيد عند البداية) خلف «أعمال أخرى» مطويّة، و«إعداد
// المخزن» رابط صغير لمن يدير المخازن. ورقة الاستلام القديمة ليست هنا (لا رابط ولا «بانتظار المبالغ»).
// و«الرصيد اليومي» (كلمة المالك 2026-11-09، 0022: «بجانب ترتيب البطاقات… خيار ثاني الي هو رصيد مواد العلف اليومي»): مفتاح بخيارين تحت
// العنوان، والعرض بالرابط (?view=day ويومه، DayBalanceView) فينسخ ويرجع بزرّ الرجوع؛ بلا view تبقى البطاقات كما كانت.
// وبالطباعة يُطبع التقرير وحده: العنوان والمفتاح والروابط print:hidden.
// و«المخزن بقسمين» (كلمة المالك 2026-11-21، عقد 0034/0035 S1): البطاقات في أقسام بعناوينها وعددها — «مواد العلف» (raw وadditive) و«العلف»
// (feed) دائماً، و«أخرى» إن لم يكن فارغاً — و«أضف مادّة» داخل القسم تبدأ بنوعه؛ والبحث يصفّي كلّ الأقسام معاً (وقسم بلا مطابقة يغيب أثناءه).
// و«ترتيب الموادّ وألوانها» (0040، رسالتا الزبون 2026-11-26): البطاقات بترتيب القسم الذي اختاره بالسحب (items_overview يرتّبها)، و«رتّب» لكلّ قسم
// (stores.manage، بلا بحث)، والبطاقة بلونها الظاهر (باليد، أو تلقائيّاً للقليلة والنافدة) ونقطته وكلمة الحالة بجانب اللون التلقائيّ.

export type BoardView = 'cards' | 'day';

/** العرض من الرابط: ?view=day للرصيد اليومي، وغيره البطاقات. */
export function boardView(value: string | null): BoardView {
  return value === 'day' ? 'day' : 'cards';
}

/** بطاقة مادّة واحدة: كبيرة وبسيطة، وكلّها رابط ملفّها، بعرض خانتها كلّه (كانت بعرض نصّها فتتفاوت البطاقات في العمود الواحد). */
export function ItemTile({ item, colors = DEFAULT_COLORS }: { item: OverviewItem; colors?: StoreColors }) {
  const sell = item.money?.sellPrice ?? null;
  const color = shownColor(item.mark, item.state, colors);
  const state = colors.auto ? item.state : null;
  return (
    <Link
      to={itemFilePath(item.id)}
      data-action="open-item-file"
      data-color={color ?? undefined}
      className="card flex w-full flex-col gap-3 p-4 transition-colors hover:bg-surface-2"
      style={color ? tintStyle(color) : undefined}
      aria-label={t('board.open', 'افتح ملفّ {name}', { name: item.name })}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {color ? (
            <span
              role="img"
              aria-label={colorName(color)}
              className="size-4 shrink-0 rounded-full border border-line"
              style={{ backgroundColor: MARK_LOOK[color].solid }}
              data-action="tile-color"
            />
          ) : null}
          <span className="text-lg font-semibold">{item.name}</span>
          {state ? (
            <span className="text-sm font-semibold" data-action="tile-state" data-state={state}>
              {stateWord(state)}
            </span>
          ) : null}
        </span>
        <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-ink-muted ltr:rotate-180" />
      </div>
      <dl className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-sm text-ink-muted">{t('board.on_hand', 'الموجود:')}</dt>
          <dd className="text-base font-semibold" data-action="tile-on-hand">
            {baseQty(item.onHand, item.baseUnit)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-sm text-ink-muted">{t('board.purchased', 'مجموع ما اشتريته:')}</dt>
          <dd className="text-base font-semibold" data-action="tile-purchased">
            {baseQty(item.purchased, item.baseUnit)}
          </dd>
        </div>
        {sell !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-sm text-ink-muted">{t('board.sell', 'سعر البيع:')}</dt>
            <dd className="text-base font-semibold" data-action="tile-sell">
              {t('board.per_unit', '{price} دينار لكل {unit}', { price: fmtMoney(sell), unit: baseUnitLabel(item.baseUnit) })}
            </dd>
          </div>
        ) : null}
      </dl>
      {/* مشتريات دخلت بلا سعر (0020): تُكمَّل من الملفّ («أكمل السعر»). */}
      {item.unpricedCount > 0 ? (
        <span className="text-sm font-medium text-warn-700 dark:text-warn-300" data-action="tile-unpriced">
          {t('board.unpriced', 'مشتريات بلا سعر: {n}', { n: fmtInt(item.unpricedCount) })}
        </span>
      ) : null}
      <span className="text-xs text-ink-muted">
        {item.lastPurchaseOn ? t('board.last', 'آخر شراء: {day}', { day: fmtDay(item.lastPurchaseOn) }) : t('board.never', 'لم تُشترَ بعد')}
      </span>
    </Link>
  );
}

/** المواد التي يطابق اسمها المطبَّع ما كُتب (الكلّ لبحث فارغ). */
export function matchingItems(items: readonly OverviewItem[], query: string): OverviewItem[] {
  const key = searchable(query);
  return key ? items.filter((item) => searchable(item.name).includes(key)) : [...items];
}

/** موادّ القسم بترتيب القراءة (items_overview: ترتيب القسم المختار، ثمّ التصنيف ثمّ الاسم). */
export function sectionItems(items: readonly OverviewItem[], section: StoreSection): OverviewItem[] {
  return items.filter((item) => sectionOfKind(item.kind) === section);
}

/** «أضف مادّة» بالاسم (بحث بلا نتيجة) أو بنوع القسم. */
export type AddItem = (name: string, kind?: ItemKind) => void;

/** قسم واحد: عنوانه وعدده و«رتّب» و«أضف مادّة» بنوعه، ثمّ بطاقاته أو سطر فراغه. */
function BoardSection({
  section,
  items,
  onAdd,
  onArrange,
  colors,
}: {
  section: StoreSection;
  items: readonly OverviewItem[];
  onAdd: AddItem | null;
  onArrange: ((section: StoreSection) => void) | null;
  colors: StoreColors;
}) {
  const kind = SECTION_ADD_KIND[section];
  const name = sectionName(section);
  return (
    <section className="flex flex-col gap-3" aria-label={name} data-action="board-section" data-key={section}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-lg font-semibold" data-action="board-section-title">
            {name}
          </h2>
          <span className="text-sm text-ink-muted" data-action="board-section-count">
            {itemsCountText(items.length)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onArrange && items.length > 1 ? (
            <Button variant="secondary" onClick={() => onArrange(section)} aria-label={t('board.section.arrange', 'رتّب «{section}»', { section: name })} data-action="arrange-section" data-key={section}>
              <ArrowUpDown aria-hidden="true" className="size-4" />
              {t('board.arrange', 'رتّب')}
            </Button>
          ) : null}
          {onAdd && kind ? (
            <Button variant="secondary" onClick={() => onAdd('', kind)} aria-label={t('board.section.add', 'أضف مادّة إلى «{section}»', { section: name })} data-action="add-section-item" data-kind={kind}>
              <Plus aria-hidden="true" className="size-4" />
              {t('board.add', 'أضف مادّة')}
            </Button>
          ) : null}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted" data-action="board-section-empty">
          {section === 'feed' ? t('board.section.feed.empty', 'لا علف بعد: يظهر هنا ما ينتجه المعمل وما تشتريه علفاً جاهزاً.') : t('board.section.feed_materials.empty', 'لا موادّ علف بعد: الذرة والصويا والإضافات هنا.')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="flex">
              <ItemTile item={item} colors={colors} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * جسم الصفحة من قراءة ناجحة (دالّة عرض صافية): الأقسام بعناوينها وعددها، والفراغ يقول ما العمل، والبحث يصفّي الأقسام كلّها (وقسم بلا مطابقة يغيب
 * أثناءه)، والبحث بلا نتيجة يقترح الإضافة.
 */
export function BoardBody({
  overview,
  query,
  onAdd,
  onArrange = null,
}: {
  overview: ItemsOverview;
  query: string;
  onAdd: AddItem | null;
  /** «رتّب» (can_arrange)، ويغيب أثناء البحث: الترتيب للقسم كلّه لا لما طابق. */
  onArrange?: ((section: StoreSection) => void) | null;
}) {
  const searching = searchable(query) !== '';
  const rows = matchingItems(overview.items, query);
  if (searching && rows.length === 0) {
    const name = query.trim();
    return (
      <div className="flex flex-col gap-2">
        <Notice tone="info" title={t('board.none', 'لا مادّة باسم «{name}»', { name })}>
          {onAdd ? t('board.none.add', 'راجع الاسم، أو أضفها الآن.') : t('board.none.detail', 'راجع الاسم.')}
        </Notice>
        {onAdd ? (
          <div>
            <Button variant="secondary" onClick={() => onAdd(name)} data-action="add-searched-item">
              <Plus aria-hidden="true" className="size-4" />
              {t('board.none.create', 'أضف «{name}»', { name })}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  // «مواد العلف» و«العلف» دائماً (بلا بحث)، و«أخرى» إن كانت فيه موادّ؛ وأثناء البحث ما فيه مطابقة وحده.
  const sections = STORE_SECTIONS.map((section) => ({ section, items: sectionItems(rows, section) })).filter(({ section, items }) => items.length > 0 || (!searching && section !== 'other'));
  return (
    <div className="flex flex-col gap-6">
      {overview.items.length === 0 ? (
        <Notice tone="info" title={t('board.empty', 'لا مواد بعد. أضف أوّل مادّة: اكتب اسمها واختر طريقة حسابها.')}>
          {onAdd ? null : t('board.empty.ask', 'تحتاج إضافة الموادّ عضويةً فعّالة في المنشأة.')}
        </Notice>
      ) : null}
      {sections.map(({ section, items }) => (
        <BoardSection key={section} section={section} items={items} onAdd={onAdd} onArrange={searching ? null : onArrange} colors={overview.colors} />
      ))}
    </div>
  );
}

export default function ItemsBoardPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const view = boardView(search.get('view'));
  // بطاقات المواد تُقرأ للبطاقات وحدها: الرصيد اليومي يقرأ day_balance_sections، فلا قراءة لا تُعرض.
  const loadOverview = useCallback(() => (view === 'cards' ? purchases.loadItemsOverview() : Promise.resolve(null)), [view]);
  const overview = useLoad(loadOverview, view);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<{ name: string; kind?: ItemKind } | null>(null);
  const [arranging, setArranging] = useState<StoreSection | null>(null);
  const role = workspace?.role;
  const canAdd = overview.data?.canAddItem === true;
  const canSetup = workspace ? can(workspace.role, 'stores.manage') : false;
  const add: AddItem | null = canAdd ? (name, kind) => setAdding({ name, kind }) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 print:hidden">
        <PageHeader
          title={t('nav.store', 'المخزن')}
          subtitle={
            view === 'day'
              ? t('board.day.subtitle.sections', 'رصيد موادّ العلف والعلف وغيرهما في نهاية اليوم المختار، بملاحظاتك، للطباعة والمشاركة.')
              : t('board.subtitle', 'افتح المادّة لترى ما عندك منها وكلّ شراء لها، وسجّل شراءً جديداً من ملفّها.')
          }
          actions={
            canAdd ? (
              <Button onClick={() => setAdding({ name: '' })} data-action="add-item">
                <Plus aria-hidden="true" className="size-4" />
                {t('board.add', 'أضف مادّة')}
              </Button>
            ) : null
          }
        />
        <Segmented<BoardView>
          label={t('board.view', 'طريقة عرض المخزن')}
          options={[
            { value: 'cards', label: t('board.view.cards', 'البطاقات'), icon: LayoutGrid },
            { value: 'day', label: t('board.view.day', 'الرصيد اليومي'), icon: CalendarDays },
          ]}
          value={view}
          onChange={(next) => {
            // الخيار المختار نفسه لا يمسح ما اختير داخل العرض (اليوم).
            if (next !== view) setSearch(next === 'day' ? { view: 'day' } : {});
          }}
        />
        <PendingApprovals role={role} />
      </div>
      {view === 'day' ? <DayBalanceView orgName={workspace?.orgName ?? ''} by={workspace?.displayName ?? ''} /> : null}
      {view === 'cards' && overview.data && overview.data.items.length > 0 ? (
        <div className="flex items-center gap-2">
          <Search aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
          <input
            type="search"
            className="input"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('board.search', 'ابحث عن مادّة بالاسم')}
            aria-label={t('board.search', 'ابحث عن مادّة بالاسم')}
            data-action="search-board"
          />
        </div>
      ) : null}
      {view === 'day' ? null : overview.error ? (
        <LoadFailed what={t('board.what', 'قائمة المواد')} error={overview.error} onRetry={overview.retry} />
      ) : !overview.data ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <BoardBody overview={overview.data} query={query} onAdd={add} onArrange={overview.data.canArrange ? setArranging : null} />
      )}
      <div className="flex flex-col gap-3 border-t border-line pt-4 print:hidden">
        {canSetup ? (
          <Link to="/inventory/setup" className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 dark:text-brand-200" data-action="open-store-setup">
            <Building2 aria-hidden="true" className="size-4" />
            {t('stores.setup.title', 'إعداد المخزن')}
          </Link>
        ) : null}
        <details>
          <summary data-action="more-store-tools" className="inline-flex select-none items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2">
            {t('board.more', 'أعمال أخرى في المخزن')}
          </summary>
          <div className="mt-3">
            <InventoryLinks role={role} board />
          </div>
        </details>
      </div>
      {arranging && view === 'cards' ? (
        <ArrangeDialog
          section={arranging}
          title={sectionName(arranging)}
          onClose={() => setArranging(null)}
          onSaved={() => {
            setArranging(null);
            toast({ tone: 'success', title: t('dayb.arrange.saved', 'حُفظ ترتيب «{section}»: بهذا الترتيب تظهر في البطاقات والرصيد اليوميّ.', { section: sectionName(arranging) }) });
            overview.retry();
          }}
        />
      ) : null}
      {adding ? (
        <SimpleItemDialog
          initialName={adding.name}
          initialKind={adding.kind}
          onClose={() => setAdding(null)}
          onSaved={(item) => {
            setAdding(null);
            navigate(itemFilePath(item.id));
          }}
        />
      ) : null}
    </div>
  );
}
