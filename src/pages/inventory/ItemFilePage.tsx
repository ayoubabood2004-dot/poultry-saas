import { ArrowLeftRight, Banknote, Eye, EyeOff, NotebookText, PackagePlus, Pencil, Repeat, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton, backTarget } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { StatStrip, type Stat } from '../../components/ui/StatStrip';
import type { Fils } from '../../domain/money';
import { RECEIVING_KINDS } from '../../domain/stock';
import { toast } from '../../components/ui/Toast';
import { describeError, RejectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import * as purchases from '../../lib/repo/purchases';
import type { ConversionInput, FilePurchase, ItemFile, RecordedPurchase, SaleInput, TransferInput } from '../../lib/repo/purchases';
import { useSession } from '../../lib/session';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad, type LoadState } from '../../lib/useLoad';
import { ConvertDialog } from './ConvertDialog';
import { PendingBanner, sessionFor, type OpItem, type OpSession } from './ItemOps';
import { PriceDialog } from './PriceDialog';
import { PurchaseDialog } from './PurchaseDialog';
import { SaleDialog, saleDoneText } from './SaleDialog';
import { baseQty, itemFilePath } from './simple-shared';
import { TransferDialog } from './TransferDialog';

// ملفّ المادّة (كلمة المالك 2026-11-06، «المخزن ببساطة»: «راح ينفتحلي ملف الذرة بشكل بطاقة… هذا الملف يسجلي بالضبط كل شراء ذرة»):
// اسم المادّة عنواناً، وأربعة أرقام (الموجود الآن، ومجموع ما اشتريته، ومتوسّط سعر الشراء، وسعر البيع)، وزرّ «سجّل شراء» كبير لمن
// يسجّل الشراء (can_record من الخادم)، وجدول واحد: التاريخ | المورّد | الكمية | سعر الشراء | المجموع | سعر البيع | الدفع. بلا اختيار
// مخزن ولا تبويبات. كلّها من item_file بقراءة واحدة، والمال لمن يراه وحده (المفتاح يغيب لغيره). وبطاقة المادّة القديمة (الوجبات ودفتر
// الحركات بالمخازن) انتقلت إلى /details، ورابطها صغير أسفل الملفّ لأدوار الكلفة.
// وكلمة المالك 2026-11-08 («ماكو زر رجوع واضح»، «ماكو خيار حذف»): زرّ «رجوع إلى المخزن» أعلى الملفّ إلى حيث جاء (?back=، والبطاقات افتراضاً)،
// وصفّ أفعال واحد تحت الأرقام: «اشترِ» ثمّ «بِع» و«حوّل» و«انقل» بحكم الخادم (can_sell وcan_convert وcan_transfer)، ولمن يدير المخازن
// «احذف» لمادّة لم تُستعمل قطّ (can_delete) وإلّا «أخفِ» (الأرشفة القائمة، والسجلّ باقٍ) بتأكيد يسمّي أثره، و«أظهِرها» للمؤرشفة.
// والشراء الذي دخل بلا سعر «بلا سعر» في جدوله ومعه «أكمل السعر».

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

/** إخفاء المادّة أو إظهارها: الأرشفة القائمة بشرط نسخة المادّة كما تُقرأ الآن. */
async function setItemHidden(itemId: string, hidden: boolean): Promise<void> {
  const item = await inventory.loadItem(itemId);
  if (!item || item.archived === hidden) return;
  await inventory.setArchived('items', item.id, item.version, hidden);
}

/**
 * «احذف» (0020): لمادّة لم تُستعمل قطّ، بشرط نسختها كما في الملفّ. وإن صارت مستعملة بعد الفتح يرفض الخادم item_in_use بتلميح يسمّي أين،
 * والتأكيد يعرض «أخفِها بدلاً من ذلك».
 */
function DeleteDialog({ file, onCancel, onDeleted, onHide }: { file: ItemFile; onCancel: () => void; onDeleted: () => void; onHide: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const name = file.item.name;
  const inUse = failure instanceof RejectedError && failure.code === 'item_in_use';
  const failed = failure ? describeError(failure, 'once') : null;
  const hint = failure instanceof RejectedError ? failure.hint : null;
  return (
    <ConfirmDialog
      open
      title={t('file.delete.title', 'حذف «{name}» نهائياً؟', { name })}
      consequence={
        <span className="flex flex-col gap-2">
          {t('file.delete.consequence', 'تُحذف «{name}» من منشأتك نهائياً مع وحداتها وسعرها؛ لم تُشترَ ولم تتحرّك ولم تدخل خلطة ولا مستنداً، فلا يضيع سجلّ.', { name })}
          {failed ? (
            <span role="alert" className="text-danger-700 dark:text-danger-300" data-action="delete-failed">
              {hint ?? `${failed.title}. ${failed.detail}`}
            </span>
          ) : null}
          {inUse ? (
            <Button variant="secondary" size="sm" className="self-start" onClick={onHide} data-action="hide-instead">
              <EyeOff aria-hidden="true" className="size-4" />
              {t('file.hide.instead', 'أخفِها بدلاً من ذلك')}
            </Button>
          ) : null}
        </span>
      }
      confirmLabel={t('file.delete.confirm', 'احذفها')}
      busy={busy}
      action="confirm-delete-item"
      onCancel={onCancel}
      onConfirm={() => {
        setBusy(true);
        setFailure(null);
        (file.item.version === null ? inventory.loadItem(file.item.id).then((item) => item?.version ?? 0) : Promise.resolve(file.item.version))
          .then((version) => purchases.deleteItem(file.item.id, version))
          .then(onDeleted, (caught: unknown) => {
            setBusy(false);
            setFailure(caught);
          });
      }}
    />
  );
}

type Op = null | 'sell' | 'convert' | 'move' | 'hide' | 'delete' | { price: FilePurchase };

/** تأكيد «أخفِ» أو «أظهِرها» يسمّي الأثر؛ والفشل يُقال داخله (لا toast يضيع). */
function HideDialog({ file, onCancel, onDone }: { file: ItemFile; onCancel: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const hidden = file.item.archived;
  const name = file.item.name;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <ConfirmDialog
      open
      tone={hidden ? 'primary' : 'danger'}
      title={hidden ? t('file.show.title', 'إظهار «{name}»؟', { name }) : t('file.hide.title', 'إخفاء «{name}»؟', { name })}
      consequence={
        <span className="flex flex-col gap-2">
          {hidden
            ? t('file.show.consequence', 'تعود «{name}» إلى بطاقات المخزن وقوائم الشراء والصرف.', { name })
            : t('file.hide.consequence', 'تختفي «{name}» من بطاقات المخزن ومن قوائم الشراء والصرف، ويبقى سجلّها ومشترياتها كما هي، وتُظهرها من هنا متى شئت.', { name })}
          {failed ? (
            <span role="alert" className="text-danger-700 dark:text-danger-300" data-action="hide-failed">
              {failed.title}. {failed.detail}
            </span>
          ) : null}
        </span>
      }
      confirmLabel={hidden ? t('file.show', 'أظهِرها') : t('file.hide.confirm', 'أخفِها')}
      busy={busy}
      action="confirm-hide-item"
      onCancel={onCancel}
      onConfirm={() => {
        setBusy(true);
        setFailure(null);
        setItemHidden(file.item.id, !hidden).then(onDone, (caught: unknown) => {
          setBusy(false);
          setFailure(caught);
        });
      }}
    />
  );
}

/** المبلغ بالدينار الصحيح إن كانت كلّ مبالغ العمود صحيحة، وإلّا بمرتبتين للعمود كلّه (الآحاد تصطفّ). */
const totalDecimals = (rows: readonly FilePurchase[]): 0 | 2 => (rows.every((row) => !row.money || row.money.lineTotal % 100n === 0n) ? 0 : 2);

/**
 * جدول المشتريات: الأحدث أوّلاً، وأعمدة المال لمن يراه. صفّ المجموع من أرقام الخادم حين تكون كلّ المشتريات معروضة. والشراء الذي دخل بلا سعر
 * (0020) «بلا سعر» مكان سعره، ومعه «أكمل السعر» لمن يكتبه (onPrice).
 */
export function PurchasesList({ file, onPrice }: { file: ItemFile; onPrice?: (row: FilePurchase) => void }) {
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
      {
        key: 'price',
        header: t('file.col.price', 'سعر الشراء'),
        kind: 'number',
        cell: (row) =>
          !row.priced ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-2">
              <span className="text-sm font-medium text-warn-700 dark:text-warn-300" data-action="purchase-unpriced-row">
                {t('file.unpriced', 'بلا سعر')}
              </span>
              {row.canPrice && onPrice ? (
                <Button size="sm" variant="secondary" onClick={() => onPrice(row)} data-action="price-purchase">
                  {t('file.price', 'أكمل السعر')}
                </Button>
              ) : null}
            </span>
          ) : row.money && row.money.unitPrice !== null ? (
            <Num>{fmtMoney(row.money.unitPrice)}</Num>
          ) : null,
      },
      {
        key: 'total',
        header: t('file.col.total', 'المجموع'),
        kind: 'number',
        // سطر عليه تصحيح سعر مرحَّل (م٢): المجموع وسعر الشراء من آخر تصحيح، وكلمة «مصحَّح» بجانبه كما في سجلّ المشتريات القديم.
        cell: (row) =>
          !row.priced ? (
            <Num>{t('file.none', '—')}</Num>
          ) : row.money ? (
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
  // من لا يرى المال يرى «بلا سعر» في عمود الدفع (لا عمود سعر له).
  columns.push({
    key: 'payment',
    header: t('file.col.payment', 'الدفع'),
    cell: (row) => (row.payment === 'cash' ? t('file.payment.cash', 'نقداً') : !row.priced && !money ? t('file.payment.credit_unpriced', 'بالدين، بلا سعر') : t('file.payment.credit', 'بالدين')),
  });
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
  if (!result.priced) return t('file.saved.unpriced', 'حُفظ الشراء {no}: {qty} {item} من {party} بلا سعر، إلى «{store}». أكمل السعر من الجدول حين تعرفه.', vars);
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
  const navigate = useNavigate();
  const [buying, setBuying] = useState(false);
  const [op, setOp] = useState<Op>(null);
  // معرّفات «بِع» و«حوّل» و«انقل» ونداؤها المعلَّق في الصفحة (مراجعة 0020 H1): إغلاق النافذة بعد نتيجة مجهولة يبقيها، وفتحها يعيد النداء نفسه.
  const [sale, setSale] = useState<OpSession<SaleInput> | null>(null);
  const [conversion, setConversion] = useState<OpSession<ConversionInput> | null>(null);
  const [transfer, setTransfer] = useState<OpSession<TransferInput> | null>(null);
  const [saved, setSaved] = useState<{ itemId: string; text: string } | null>(null);
  const back = backTarget(search.get('back'), '/inventory');
  const costs = Boolean(workspace?.canSeeCost);
  const purchasable = file !== null && !file.item.archived && RECEIVING_KINDS[file.item.kind].length > 0;
  const canBuy = file !== null && file.canRecord && purchasable;
  // رابط شراء من مكان آخر (buyPath: ?buy=1) يفتح النافذة مباشرةً لمن يسجّل الشراء؛ والإغلاق يشيل العلامة من الرابط.
  const dialogOpen = canBuy && (buying || search.get('buy') === '1');
  const closeDialog = () => {
    setBuying(false);
    if (search.has('buy')) {
      const next = new URLSearchParams(search);
      next.delete('buy');
      setSearch(next, { replace: true });
    }
  };
  const backButton = <BackButton to={back} label={back.startsWith('/mill') ? t('back.mill', 'رجوع إلى المعمل') : t('back.store', 'رجوع إلى المخزن')} action="back-to-board" />;

  if (state.error && !file) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <LoadFailed what={t('file.what', 'ملفّ المادّة')} error={state.error} onRetry={state.retry} />
      </div>
    );
  }
  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      </div>
    );
  }
  const manage = file.canEdit;
  const opItem: OpItem = { id: file.item.id, name: file.item.name, kind: file.item.kind, baseUnit: file.item.baseUnit };
  // بعد الحفظ: جملة من جواب الخادم، والملفّ يُقرأ من جديد؛ وبعد نتيجة مجهولة ثمّ الإغلاق يُقرأ أيضاً (ربّما حُفظ).
  const done = (text: string) => {
    setOp(null);
    setSaved({ itemId, text });
    state.retry();
  };
  const abandon = () => {
    setOp(null);
    state.retry();
  };
  const saleNow = sessionFor(sale, itemId);
  const conversionNow = sessionFor(conversion, itemId);
  const transferNow = sessionFor(transfer, itemId);
  // الفتح يثبّت الجلسة (معرّفاتها)؛ والإغلاق بلا نداء معلَّق ينهيها، ومعه يبقيها والشريط يقول «أعد المحاولة».
  const openOp = (kind: 'sell' | 'convert' | 'move') => {
    if (kind === 'sell') setSale(saleNow);
    if (kind === 'convert') setConversion(conversionNow);
    if (kind === 'move') setTransfer(transferNow);
    setOp(kind);
  };
  const closeOp = (kind: 'sell' | 'convert' | 'move') => {
    if (kind === 'sell' && !saleNow.pending) setSale(null);
    if (kind === 'convert' && !conversionNow.pending) setConversion(null);
    if (kind === 'move' && !transferNow.pending) setTransfer(null);
    setOp(null);
  };
  const banners: { kind: 'sell' | 'convert' | 'move'; what: string; summary: string }[] = [];
  if (saleNow.pending && op !== 'sell') banners.push({ kind: 'sell', what: t('op.what.sale', 'البيع'), summary: saleNow.pending.summary });
  if (conversionNow.pending && op !== 'convert') banners.push({ kind: 'convert', what: t('op.what.conversion', 'التحويل'), summary: conversionNow.pending.summary });
  if (transferNow.pending && op !== 'move') banners.push({ kind: 'move', what: t('op.what.transfer', 'النقل'), summary: transferNow.pending.summary });
  const live = !file.item.archived;
  const anyAction = canBuy || (live && (file.canSell || file.canConvert || file.canTransfer)) || manage;
  return (
    <div className="flex flex-col gap-4">
      {backButton}
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
          </div>
        }
      />
      {state.error ? <LoadFailed what={t('file.what', 'ملفّ المادّة')} error={state.error} onRetry={state.retry} /> : null}
      {saved && saved.itemId === itemId ? (
        <Notice tone="info" title={saved.text} />
      ) : null}
      {file.item.archived ? <Notice tone="info" title={t('file.archived', 'هذه المادّة مؤرشفة، فلا يُسجَّل لها شراء.')} /> : null}
      <StatStrip stats={fileStats(file)} />
      {banners.map((banner) => (
        <PendingBanner key={banner.kind} what={banner.what} summary={banner.summary} onRetry={() => openOp(banner.kind)} action={`retry-pending-${banner.kind}`} />
      ))}
      {anyAction ? (
        // صفّ الأفعال (كلمة المالك 2026-11-08): «اشترِ» أوّلاً كبيراً، ثمّ ما يملكه الدور وما تسمح به المادّة؛ يلتفّ على الهاتف.
        <div className="flex flex-wrap items-center gap-2" data-action="file-actions">
          {canBuy ? (
            <Button size="lg" onClick={() => setBuying(true)} disabled={state.loading} data-action="record-purchase">
              <PackagePlus aria-hidden="true" className="size-5" />
              {t('file.buy', 'اشترِ')}
            </Button>
          ) : null}
          {live && file.canSell ? (
            <Button size="lg" variant="secondary" onClick={() => openOp('sell')} disabled={state.loading} data-action="sell-item">
              <Banknote aria-hidden="true" className="size-5" />
              {t('file.sell_action', 'بِع')}
            </Button>
          ) : null}
          {live && file.canConvert ? (
            <Button size="lg" variant="secondary" onClick={() => openOp('convert')} disabled={state.loading} data-action="convert-item">
              <Repeat aria-hidden="true" className="size-5" />
              {t('file.convert', 'حوّل')}
            </Button>
          ) : null}
          {live && file.canTransfer ? (
            <Button size="lg" variant="secondary" onClick={() => openOp('move')} disabled={state.loading} data-action="move-item">
              <ArrowLeftRight aria-hidden="true" className="size-5" />
              {t('file.move', 'انقل')}
            </Button>
          ) : null}
          {manage && file.canDelete ? (
            <Button variant="ghost" onClick={() => setOp('delete')} disabled={state.loading} data-action="delete-item">
              <Trash2 aria-hidden="true" className="size-5" />
              {t('file.delete', 'احذف')}
            </Button>
          ) : null}
          {manage && (!file.canDelete || file.item.archived) ? (
            <Button variant="ghost" onClick={() => setOp('hide')} disabled={state.loading} data-action={file.item.archived ? 'show-item' : 'hide-item'}>
              {file.item.archived ? <Eye aria-hidden="true" className="size-5" /> : <EyeOff aria-hidden="true" className="size-5" />}
              {file.item.archived ? t('file.show', 'أظهِرها') : t('file.hide', 'أخفِ')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {manage && !file.canDelete && !file.item.archived && file.uses.length > 0 ? (
        <p className="text-sm text-ink-muted" data-action="file-uses">
          {t('file.uses', 'لا تُحذف لأنّها {uses}؛ «أخفِ» يخفيها من القوائم ويبقى سجلّها.', { uses: file.uses.join(t('list.separator', '، ')) })}
        </p>
      ) : null}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('file.purchases', 'المشتريات')}</h2>
        <PurchasesList file={file} onPrice={(row) => setOp({ price: row })} />
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
      {op === 'hide' ? (
        <HideDialog
          file={file}
          onCancel={() => setOp(null)}
          onDone={() => {
            setOp(null);
            state.retry();
          }}
        />
      ) : null}
      {op === 'delete' ? (
        <DeleteDialog
          file={file}
          onCancel={() => setOp(null)}
          onHide={() => setOp('hide')}
          onDeleted={() => {
            toast({ tone: 'success', title: t('file.deleted', 'حُذفت «{name}».', { name: file.item.name }) });
            navigate(back, { replace: true });
          }}
        />
      ) : null}
      {op === 'sell' ? (
        <SaleDialog
          item={opItem}
          today={file.today}
          sellPrice={file.money?.sellPrice ?? null}
          stores={file.stores}
          cashAccounts={file.cashAccounts}
          session={saleNow}
          onPending={(pending) => setSale({ ...saleNow, pending })}
          onStoresStale={state.retry}
          onClose={() => closeOp('sell')}
          onAbandon={abandon}
          onSaved={(result) => {
            setSale(null);
            done(saleDoneText(result));
          }}
        />
      ) : null}
      {op === 'convert' ? (
        <ConvertDialog
          item={opItem}
          today={file.today}
          stores={file.stores}
          session={conversionNow}
          onPending={(pending) => setConversion({ ...conversionNow, pending })}
          onStoresStale={state.retry}
          onClose={() => closeOp('convert')}
          onAbandon={abandon}
          onSaved={(result) => {
            setConversion(null);
            done(
              t('convert.done', 'حُوِّل {from} من «{item}» في «{fromStore}» إلى {to} من «{target}» في «{toStore}» ({no}).', {
                from: baseQty(result.from.qty, file.item.baseUnit),
                item: result.from.itemName,
                fromStore: result.from.warehouseName,
                to: baseQty(result.to.qty, result.to.baseUnit),
                target: result.to.itemName,
                toStore: result.to.warehouseName,
                no: result.docNo,
              }),
            );
          }}
        />
      ) : null}
      {op === 'move' ? (
        <TransferDialog
          item={opItem}
          today={file.today}
          stores={file.stores}
          targets={file.transferTargets}
          session={transferNow}
          onPending={(pending) => setTransfer({ ...transferNow, pending })}
          onClose={() => closeOp('move')}
          onAbandon={abandon}
          onSaved={(result) => {
            setTransfer(null);
            done(t('move.done', 'نُقل {qty} «{item}» من «{from}» إلى «{to}» ({no}).', { qty: baseQty(result.qty, file.item.baseUnit), item: file.item.name, from: result.fromName, to: result.toName, no: result.docNo }));
          }}
        />
      ) : null}
      {op !== null && typeof op === 'object' ? (
        <PriceDialog
          item={opItem}
          line={{ lineId: op.price.lineId, qty: op.price.qty, partyName: op.price.partyName, receivedOn: op.price.receivedOn }}
          sellPrice={file.money?.sellPrice ?? null}
          onClose={() => setOp(null)}
          onAbandon={abandon}
          onSaved={(result) =>
            done(
              result.money
                ? t('price.done', 'كُتب سعر الشراء {no}: {total} دينار بالدين على {party}.', { no: result.docNo, total: fmtMoney(result.money.lineTotal, 0), party: op.price.partyName })
                : t('price.done.plain', 'كُتب سعر الشراء {no}.', { no: result.docNo }),
            )
          }
        />
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
