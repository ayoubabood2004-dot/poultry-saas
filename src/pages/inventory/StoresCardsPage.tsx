import { ChevronLeft, Plus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { WAREHOUSE_KINDS_FOR, type WarehouseKind } from '../../domain/stores';
import { describeError } from '../../lib/errors';
import { fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { StoreCard, StoreSite, StoresOverview } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { useSession } from '../../lib/session';
import { warehouseKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { InventoryLinks, PendingApprovals } from './stock-shared';

// بطاقات المخازن (كلمة المالك 2026-11-02: «تطلعلي على شكل بطاقات كبيرة تحتوي على المعلومات بشكل بسيط من الخارج»، spec ب-1):
// صفحة /inventory شبكة بطاقات لكل مخزن بنطاق المستخدم من stores_overview — الاسم كبيراً، وتحته موقعه ووحدته ونوعه، وعدد
// مواده وقيمة متاحه (لأدوار الكلفة من money، والخادم يشيلها لغيرهم)، وشارات التنبيه الملوّنة عند وجودها. و«أضف مخزناً» لمن
// يملك stores.manage (حكم الخادم بـcan_manage): نافذة بالاسم والموقع والنوع بنفس كتابة createWarehouse، وتحتاج موقعاً
// فعّالاً من sites. الجدول القديم صار داخل المخزن (WarehousePage)، لا هنا.

/** شارة تنبيه ملوّنة واحدة. */
function Badge({ tone, children }: { tone: 'warning' | 'danger'; children: string }) {
  const toneClass = tone === 'danger' ? 'bg-danger-50 text-danger-800 dark:bg-danger-500/15 dark:text-danger-100' : 'bg-warn-50 text-warn-800 dark:bg-warn-500/15 dark:text-warn-100';
  return <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ${toneClass}`}>{children}</span>;
}

/** شارات المخزن: ما له عدد فقط تظهر (spec ب-1: «تظهر عند وجودها»). */
export function StoreBadges({ card }: { card: Pick<StoreCard, 'belowMinimum' | 'nearExpiry' | 'expired'> }) {
  if (card.belowMinimum === 0 && card.nearExpiry === 0 && card.expired === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {card.belowMinimum > 0 ? <Badge tone="warning">{t('stores.badge.below_min', 'تحت الحدّ الأدنى: {n}', { n: fmtInt(card.belowMinimum) })}</Badge> : null}
      {card.nearExpiry > 0 ? <Badge tone="warning">{t('stores.badge.near_expiry', 'قريب الانتهاء: {n}', { n: fmtInt(card.nearExpiry) })}</Badge> : null}
      {card.expired > 0 ? <Badge tone="danger">{t('stores.badge.expired', 'منتهٍ: {n}', { n: fmtInt(card.expired) })}</Badge> : null}
    </div>
  );
}

/** بطاقة مخزن واحدة: كبيرة وبسيطة، وكلّها رابط يفتح المخزن. */
export function StoreTile({ card, costs }: { card: StoreCard; costs: boolean }) {
  return (
    <Link
      to={`/inventory/store/${card.id}`}
      data-action="open-store"
      className="card flex flex-col gap-3 p-4 transition-colors hover:bg-surface-2"
      aria-label={t('stores.open', 'افتح {name}', { name: card.name })}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-semibold">{card.name}</span>
        <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-ink-muted ltr:rotate-180" />
      </div>
      <span className="text-sm text-ink-muted">
        {t('stores.where', '{site} — {division} — {kind}', { site: card.siteName, division: divisionLabel(card.divisionKind), kind: warehouseKindLabel(card.kind) })}
      </span>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-ink-muted">{t('stores.items_count', 'المواد')}</dt>
          <dd className="text-base font-semibold">{fmtInt(card.itemsCount)}</dd>
        </div>
        {costs && card.stockValue !== null ? (
          <div>
            <dt className="text-xs text-ink-muted">{t('stores.capital', 'رأس المال')}</dt>
            <dd className="text-base font-semibold">
              <MoneyText amount={card.stockValue} />
            </dd>
          </div>
        ) : null}
        {costs && card.saleValue !== null ? (
          <div>
            <dt className="text-xs text-ink-muted">{t('stock.col.sale_value', 'قيمة البيع')}</dt>
            <dd className="text-base font-semibold">
              <MoneyText amount={card.saleValue} />
            </dd>
          </div>
        ) : null}
        {costs && card.expectedProfit !== null ? (
          <div>
            <dt className="text-xs text-ink-muted">{t('stores.profit', 'الربح المتوقّع')}</dt>
            <dd className="text-base font-semibold">
              <MoneyText amount={card.expectedProfit} />
            </dd>
          </div>
        ) : null}
      </dl>
      {costs && card.itemsUnpriced !== null && card.itemsUnpriced > 0 ? (
        <span className="text-xs text-ink-muted">{t('stores.unpriced.short', '{n} بلا سعر بيع', { n: t('stores.unpriced.items', '{n} مادّة', { n: fmtInt(card.itemsUnpriced) }) })}</span>
      ) : null}
      <StoreBadges card={card} />
    </Link>
  );
}

/** نافذة «أضف مخزناً»: الاسم والموقع والنوع (نفس كتابة createWarehouse)، والوحدة من موقعه. */
function WarehouseDialog({ sites, onClose, onSaved }: { sites: readonly StoreSite[]; onClose: () => void; onSaved: (name: string) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [picked, setPicked] = useState<WarehouseKind | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const site = sites.find((row) => row.id === siteId) ?? null;
  const kinds = WAREHOUSE_KINDS_FOR[site?.divisionKind ?? 'general'];
  const kind = picked && kinds.includes(picked) ? picked : (kinds[0] ?? 'general');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const text = name.trim();
    if (!text) {
      setError(t('org.name.required', 'اكتب الاسم.'));
      return;
    }
    if (!site) {
      setError(t('org.warehouse.site.required', 'أضف موقعاً فعّالاً أوّلاً، ثم أضف مخزنه.'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await inventory.createWarehouse(site.divisionId, site.id, text, kind);
      onSaved(text);
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const formId = `${id}-form`;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('org.warehouse.new', 'مخزن جديد')}
      dirty={name.trim() !== ''}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} disabled={sites.length === 0} data-action="save-warehouse">
            {t('org.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        {sites.length === 0 ? (
          <Notice tone="info" title={t('stores.site.first', 'أضف الموقع أوّلاً')}>
            <span className="flex flex-col gap-2">
              {t('stores.site.first.detail', 'المخزن يحتاج موقعاً فعّالاً في نطاقك (حقلاً أو معملاً أو مفقساً أو مخزناً).')}
              <Link to="/inventory/setup" className="font-medium text-brand-700 dark:text-brand-200" data-action="open-org-sites">
                {t('stores.site.first.link', 'افتح إعداد المخزن وأضف موقعاً')}
              </Link>
            </span>
          </Notice>
        ) : (
          <>
            <Field id={`${id}-name`} label={t('org.warehouse.name', 'اسم المخزن')} error={error}>
              <input id={`${id}-name`} className="input" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} data-autofocus />
            </Field>
            <Field id={`${id}-site`} label={t('org.warehouse.site', 'الموقع')}>
              <select id={`${id}-site`} className="input" value={siteId} onChange={(event) => setSiteId(event.target.value)} data-action="pick-site">
                {sites.map((row) => (
                  <option key={row.id} value={row.id}>
                    {t('stores.site.option', '{name} ({division})', { name: row.name, division: divisionLabel(row.divisionKind) })}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${id}-kind`} label={t('org.kind', 'النوع')}>
              <select id={`${id}-kind`} className="input" value={kind} onChange={(event) => setPicked(event.target.value as WarehouseKind)} data-action="pick-kind">
                {kinds.map((option) => (
                  <option key={option} value={option}>
                    {warehouseKindLabel(option)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {failed ? (
          <Notice tone="danger" title={failed.title}>
            {failed.detail}
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}

/** جسم الصفحة من حالة قراءتها (دالّة عرض صافية، تنفحص بلا متصفّح): الفشل LoadFailed مو شبكة فارغة. */
export function StoresBody({ overview, costs, onAdd }: { overview: StoresOverview; costs: boolean; onAdd: (() => void) | null }) {
  if (overview.rows.length === 0) {
    return (
      <Notice tone="info" title={t('stock.stores.none', 'لا مخزن في نطاقك.')}>
        {onAdd ? t('stores.none.manage', 'أضف مخزنك الأوّل من «أضف مخزناً» في الأعلى.') : t('stock.stores.none.detail', 'يحدّد مالك المنشأة نطاقك من شاشة الموظفين.')}
      </Notice>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {overview.rows.map((card) => (
        <li key={card.id} className="flex">
          <StoreTile card={card} costs={costs} />
        </li>
      ))}
    </ul>
  );
}

export default function StoresCardsPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const overview = useLoad(inventory.loadStoresOverview);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const role = workspace?.role;
  const canManage = overview.data?.canManage === true;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.store', 'المخزن')}
        subtitle={t('stores.subtitle', 'افتح المخزن لترى مواده في أقسام بالتصنيف، وأسعار بيعها وربحها المتوقّع.')}
        actions={
          <div className="flex flex-col gap-2">
            {canManage ? (
              <Button onClick={() => setAdding(true)} data-action="add-warehouse">
                <Plus aria-hidden="true" className="size-4" />
                {t('stores.add', 'أضف مخزناً')}
              </Button>
            ) : null}
            <InventoryLinks role={role} />
          </div>
        }
      />
      <PendingApprovals role={role} />
      {added ? (
        <Notice tone="info" title={t('stores.added', 'أُضيف المخزن «{name}»', { name: added })}>
          {t('stores.added.detail', 'يظهر في البطاقات. افتحه وأضف مواده من «أضف مادّة».')}
        </Notice>
      ) : null}
      {overview.error ? (
        <LoadFailed what={t('stock.stores.what', 'قائمة المخازن')} error={overview.error} onRetry={overview.retry} />
      ) : !overview.data ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <StoresBody overview={overview.data} costs={Boolean(workspace?.canSeeCost)} onAdd={canManage ? () => setAdding(true) : null} />
      )}
      {adding && overview.data ? (
        <WarehouseDialog
          sites={overview.data.sites}
          onClose={() => setAdding(false)}
          onSaved={(name) => {
            setAdding(false);
            setAdded(name);
            overview.retry();
          }}
        />
      ) : null}
    </div>
  );
}
