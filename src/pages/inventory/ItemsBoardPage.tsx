import { Building2, ChevronLeft, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { searchable } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { ItemsOverview, OverviewItem } from '../../lib/repo/purchases';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { SimpleItemDialog } from './ItemCreate';
import { baseQty, itemFilePath } from './simple-shared';
import { InventoryLinks, PendingApprovals } from './stock-shared';

// المخزن = بطاقات المواد (كلمة المالك 2026-11-06، «المخزن ببساطة»: «لما اتراجع خطوة لصنف الذرة راح يكون عندي مجموع كيلوات»):
// بطاقة لكلّ مادّة فعّالة من items_overview — اسمها كبيراً، و«الموجود» و«مجموع ما اشتريته» بوحدتها، وسعر البيع لمن يرى المال —
// والبطاقة كلّها رابط ملفّ المادّة (فيه «سجّل شراء»). والبحث بالاسم المطبَّع بالجهاز (القائمة كلّها من قراءة واحدة)، و«أضف مادّة»
// بحكم الخادم (can_add_item). والمخازن وأوراقها (التحويل والصرف والجرد والرصيد عند البداية) خلف «أعمال أخرى» مطويّة، و«إعداد
// المخزن» رابط صغير لمن يدير المخازن. ورقة الاستلام القديمة ليست هنا (لا رابط ولا «بانتظار المبالغ»).

/** بطاقة مادّة واحدة: كبيرة وبسيطة، وكلّها رابط ملفّها. */
export function ItemTile({ item }: { item: OverviewItem }) {
  const sell = item.money?.sellPrice ?? null;
  return (
    <Link
      to={itemFilePath(item.id)}
      data-action="open-item-file"
      className="card flex flex-col gap-3 p-4 transition-colors hover:bg-surface-2"
      aria-label={t('board.open', 'افتح ملفّ {name}', { name: item.name })}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-semibold">{item.name}</span>
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

/** جسم الصفحة من قراءة ناجحة (دالّة عرض صافية): الفراغ يقول ما العمل، والبحث بلا نتيجة يقترح الإضافة. */
export function BoardBody({ overview, query, onAdd }: { overview: ItemsOverview; query: string; onAdd: ((name: string) => void) | null }) {
  if (overview.items.length === 0) {
    return (
      <Notice tone="info" title={t('board.empty', 'لا مواد بعد. أضف أوّل مادّة: اكتب اسمها واختر طريقة حسابها.')}>
        {onAdd ? null : t('board.empty.ask', 'يضيف المواد أمين المخزن أو المدير.')}
      </Notice>
    );
  }
  const rows = matchingItems(overview.items, query);
  if (rows.length === 0) {
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
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((item) => (
        <li key={item.id} className="flex">
          <ItemTile item={item} />
        </li>
      ))}
    </ul>
  );
}

export default function ItemsBoardPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const navigate = useNavigate();
  const overview = useLoad(purchases.loadItemsOverview);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<{ name: string } | null>(null);
  const role = workspace?.role;
  const canAdd = overview.data?.canAddItem === true;
  const canSetup = workspace ? can(workspace.role, 'stores.manage') : false;
  const add = canAdd ? (name: string) => setAdding({ name }) : null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.store', 'المخزن')}
        subtitle={t('board.subtitle', 'افتح المادّة لترى ما عندك منها وكلّ شراء لها، وسجّل شراءً جديداً من ملفّها.')}
        actions={
          canAdd ? (
            <Button onClick={() => setAdding({ name: '' })} data-action="add-item">
              <Plus aria-hidden="true" className="size-4" />
              {t('board.add', 'أضف مادّة')}
            </Button>
          ) : null
        }
      />
      <PendingApprovals role={role} />
      {overview.data && overview.data.items.length > 0 ? (
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
      {overview.error ? (
        <LoadFailed what={t('board.what', 'قائمة المواد')} error={overview.error} onRetry={overview.retry} />
      ) : !overview.data ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <BoardBody overview={overview.data} query={query} onAdd={add} />
      )}
      <div className="flex flex-col gap-3 border-t border-line pt-4">
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
      {adding ? (
        <SimpleItemDialog
          initialName={adding.name}
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
