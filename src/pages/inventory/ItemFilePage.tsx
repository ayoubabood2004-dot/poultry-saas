import { NotebookText, PackagePlus, Pencil } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { StatStrip, type Stat } from '../../components/ui/StatStrip';
import type { Fils } from '../../domain/money';
import { RECEIVING_KINDS } from '../../domain/stock';
import { columnDecimals, fmtDay, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { FilePurchase, ItemFile, RecordedPurchase } from '../../lib/repo/purchases';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad, type LoadState } from '../../lib/useLoad';
import { PurchaseDialog } from './PurchaseDialog';
import { baseQty, itemFilePath } from './simple-shared';

// ملفّ المادّة (كلمة المالك 2026-11-06، «المخزن ببساطة»: «راح ينفتحلي ملف الذرة بشكل بطاقة… هذا الملف يسجلي بالضبط كل شراء ذرة»):
// اسم المادّة عنواناً، وأربعة أرقام (الموجود الآن، ومجموع ما اشتريته، ومتوسّط سعر الشراء، وسعر البيع)، وزرّ «سجّل شراء» كبير لمن
// يسجّل الشراء (can_record من الخادم)، وجدول واحد: التاريخ | المورّد | الكمية | سعر الشراء | المجموع | سعر البيع | الدفع. بلا اختيار
// مخزن ولا تبويبات. كلّها من item_file بقراءة واحدة، والمال لمن يراه وحده (المفتاح يغيب لغيره). وبطاقة المادّة القديمة (الوجبات ودفتر
// الحركات بالمخازن) انتقلت إلى /details، ورابطها صغير أسفل الملفّ لأدوار الكلفة.

/** نصّ سعر لوحدة الأساس: «450.00 دينار لكل كغم». */
function perUnit(price: Fils, file: Pick<ItemFile, 'item'>): string {
  return t('file.per_unit', '{price} دينار لكل {unit}', { price: fmtMoney(price), unit: baseUnitLabel(file.item.baseUnit) });
}

/** الأرقام الأربعة؛ رقما المال لمن يرى المال وحدهما. */
export function fileStats(file: ItemFile): Stat[] {
  const stats: Stat[] = [
    { key: 'on_hand', label: t('file.on_hand', 'الموجود الآن'), value: baseQty(file.onHand, file.item.baseUnit) },
    { key: 'purchased', label: t('file.purchased', 'مجموع ما اشتريته'), value: baseQty(file.purchased, file.item.baseUnit) },
  ];
  if (file.money) {
    stats.push(
      { key: 'avg', label: t('file.avg', 'متوسّط سعر الشراء'), value: file.money.avgUnitPrice === null ? t('file.none', '—') : perUnit(file.money.avgUnitPrice, file) },
      { key: 'sell', label: t('file.sell', 'سعر البيع'), value: file.money.sellPrice === null ? t('file.none', '—') : perUnit(file.money.sellPrice, file) },
    );
  }
  return stats;
}

/** المبلغ بالدينار الصحيح إن كانت كلّ مبالغ العمود صحيحة، وإلّا بمرتبتين للعمود كلّه (الآحاد تصطفّ). */
const totalDecimals = (rows: readonly FilePurchase[]): 0 | 2 => (rows.every((row) => !row.money || row.money.lineTotal % 100n === 0n) ? 0 : 2);

/** جدول المشتريات: الأحدث أوّلاً، وأعمدة المال لمن يراه. صفّ المجموع من أرقام الخادم حين تكون كلّ المشتريات معروضة. */
export function PurchasesList({ file }: { file: ItemFile }) {
  const rows = file.purchases;
  const unit = baseUnitLabel(file.item.baseUnit);
  const decimals = columnDecimals([...rows.map((row) => row.qty), ...(file.more ? [] : [file.purchased])], 3) as 0 | 1 | 2 | 3;
  const money = file.money !== null && rows.every((row) => row.money !== null);
  const whole = totalDecimals(rows);
  const totals = !file.more && rows.length > 0;
  const columns: Column<FilePurchase>[] = [
    { key: 'day', header: t('ledger.date', 'التاريخ'), sticky: true, cell: (row) => fmtDay(row.receivedOn) },
    { key: 'party', header: t('receipt.party', 'المورّد'), wrap: true, cell: (row) => row.partyName },
    {
      key: 'qty',
      header: t('file.col.qty', 'الكمية ({unit})', { unit }),
      kind: 'number',
      cell: (row) => <Num>{fmtQtyCell(row.qty, decimals)}</Num>,
      ...(totals ? { total: <Num>{fmtQtyCell(file.purchased, decimals)}</Num> } : {}),
    },
  ];
  if (money) {
    columns.push(
      { key: 'price', header: t('file.col.price', 'سعر الشراء'), kind: 'number', cell: (row) => (row.money ? <Num>{fmtMoney(row.money.unitPrice)}</Num> : null) },
      {
        key: 'total',
        header: t('file.col.total', 'المجموع'),
        kind: 'number',
        // سطر عليه تصحيح سعر مرحَّل (م٢): المجموع وسعر الشراء من آخر تصحيح، وكلمة «مصحَّح» بجانبه كما في سجلّ المشتريات القديم.
        cell: (row) =>
          row.money ? (
            <span className="inline-flex items-center gap-1">
              <Num>{fmtMoney(row.money.lineTotal, whole)}</Num>
              {row.money.corrected ? (
                <span className="text-xs text-ink-muted" data-action="purchase-corrected">
                  {t('purchases.corrected.short', 'مصحَّح')}
                </span>
              ) : null}
            </span>
          ) : null,
        ...(totals && file.money && (whole === 2 || file.money.purchasedValue % 100n === 0n) ? { total: <Num>{fmtMoney(file.money.purchasedValue, whole)}</Num> } : {}),
      },
      { key: 'sell', header: t('file.col.sell', 'سعر البيع'), kind: 'number', cell: (row) => <Num>{row.money && row.money.sellPrice !== null ? fmtMoney(row.money.sellPrice) : t('file.none', '—')}</Num> },
    );
  }
  columns.push({ key: 'payment', header: t('file.col.payment', 'الدفع'), cell: (row) => (row.payment === 'cash' ? t('file.payment.cash', 'نقداً') : t('file.payment.credit', 'بالدين')) });
  return (
    <DataTable
      caption={t('file.caption', 'مشتريات {name}، الأحدث أوّلاً', { name: file.item.name })}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.lineId}
      empty={file.canRecord ? t('file.empty.record', 'لا شراء لهذه المادّة بعد. سجّل أوّل شراء من «سجّل شراء».') : t('file.empty', 'لا شراء لهذه المادّة بعد.')}
      {...(totals ? { totalLabel: t('file.total', 'المجموع') } : {})}
    />
  );
}

/**
 * آخر قراءة ناجحة تبقى مرسومة أثناء إعادة القراءة (بعد الحفظ): useLoad يجعل data = null أثناء كلّ قراءة جديدة، فكانت الصفحة تُطوى
 * إلى «جارٍ الفتح…» لحظة. والمفتاح الآخر (مادّة أخرى) يبدأ فارغاً. نمط React «معلومة من رسم سابق» بشرط يتوقّف، لا متغيّراً عامّاً.
 */
function useKept<T>(state: LoadState<T>, key: string): T | null {
  const [kept, setKept] = useState<{ key: string; data: T } | null>(null);
  if (state.data !== null && (kept === null || kept.key !== key || kept.data !== state.data)) setKept({ key, data: state.data });
  return state.data ?? (kept !== null && kept.key === key ? kept.data : null);
}

/** جملة «حُفظ الشراء» بعد الحفظ، من جواب الخادم نفسه. */
export function savedText(result: RecordedPurchase, file: Pick<ItemFile, 'item'>): string {
  const vars = { no: result.docNo, qty: baseQty(result.qty, file.item.baseUnit), item: file.item.name, party: result.partyName, store: result.warehouseName };
  if (!result.money) return t('file.saved.plain', 'حُفظ الشراء {no}: {qty} {item} من {party} إلى «{store}».', vars);
  const total = fmtMoney(result.money.lineTotal, result.money.lineTotal % 100n === 0n ? 0 : 2);
  return result.payment === 'cash'
    ? t('file.saved.cash', 'حُفظ الشراء {no}: {qty} {item} من {party} بـ{total} دينار نقداً، إلى «{store}».', { ...vars, total })
    : t('file.saved.credit', 'حُفظ الشراء {no}: {qty} {item} من {party} بـ{total} دينار بالدين عليه، إلى «{store}».', { ...vars, total });
}

export default function ItemFilePage() {
  const { id: itemId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const load = useCallback(() => purchases.loadItemFile(itemId), [itemId]);
  const state = useLoad(load, itemId);
  const file = useKept(state, itemId);
  const [buying, setBuying] = useState(false);
  const [saved, setSaved] = useState<{ itemId: string; text: string } | null>(null);
  const costs = Boolean(workspace?.canSeeCost);
  const purchasable = file !== null && !file.item.archived && RECEIVING_KINDS[file.item.kind].length > 0;
  const canBuy = file !== null && file.canRecord && purchasable;
  // رابط شراء من مكان آخر (buyPath: ?buy=1) يفتح النافذة مباشرةً لمن يسجّل الشراء؛ والإغلاق يشيل العلامة من الرابط.
  const dialogOpen = canBuy && (buying || search.get('buy') === '1');
  const closeDialog = () => {
    setBuying(false);
    if (search.has('buy')) setSearch({}, { replace: true });
  };

  if (state.error && !file) {
    return <LoadFailed what={t('file.what', 'ملفّ المادّة')} error={state.error} onRetry={state.retry} />;
  }
  if (!file) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t('page.loading', 'جارٍ الفتح…')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={file.item.name}
        subtitle={t('file.subtitle', 'وحدتها: {unit}. كلّ شراء لها في الجدول أدناه، الأحدث أوّلاً.', { unit: baseUnitLabel(file.item.baseUnit) })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {file.canEdit && !file.item.archived ? (
              <Link
                to={`/inventory/items?${new URLSearchParams({ edit: file.item.id, back: itemFilePath(file.item.id) }).toString()}`}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2"
                data-action="edit-item-file"
              >
                <Pencil aria-hidden="true" className="size-4" />
                {t('item_card.edit', 'عدّل المادّة')}
              </Link>
            ) : null}
            <Link to="/inventory" className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="back-to-board">
              {t('stores.back', 'المخزن')}
            </Link>
          </div>
        }
      />
      {state.error ? <LoadFailed what={t('file.what', 'ملفّ المادّة')} error={state.error} onRetry={state.retry} /> : null}
      {saved && saved.itemId === itemId ? (
        <Notice tone="info" title={saved.text} />
      ) : null}
      {file.item.archived ? <Notice tone="info" title={t('file.archived', 'هذه المادّة مؤرشفة، فلا يُسجَّل لها شراء.')} /> : null}
      <StatStrip stats={fileStats(file)} />
      {canBuy ? (
        <Button size="lg" className="w-full sm:w-auto sm:self-start" onClick={() => setBuying(true)} disabled={state.loading} data-action="record-purchase">
          <PackagePlus aria-hidden="true" className="size-5" />
          {t('file.record', 'سجّل شراء')}
        </Button>
      ) : null}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('file.purchases', 'المشتريات')}</h2>
        <PurchasesList file={file} />
        {file.more ? (
          <p className="text-sm text-ink-muted">
            {costs ? t('file.more.costs', 'تُعرض آخر 200 عملية شراء؛ الأقدم في «دفتر المادّة والوجبات».') : t('file.more', 'تُعرض آخر 200 عملية شراء.')}
          </p>
        ) : null}
      </section>
      {costs ? (
        <Link to={`/inventory/items/${file.item.id}/details`} className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 dark:text-brand-200" data-action="open-item-details">
          <NotebookText aria-hidden="true" className="size-4" />
          {t('file.details', 'دفتر المادّة والوجبات')}
        </Link>
      ) : null}
      {dialogOpen ? (
        <PurchaseDialog
          file={file}
          onClose={closeDialog}
          onAbandon={() => {
            closeDialog();
            state.retry();
          }}
          onSaved={(result) => {
            closeDialog();
            setSaved({ itemId, text: savedText(result, file) });
            state.retry();
          }}
        />
      ) : null}
    </div>
  );
}
