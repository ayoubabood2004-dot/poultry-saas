import { ArrowRight, ChevronDown, ScanLine, Search, ShoppingBasket, Store } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { postingDay } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toast';
import { localDay, type Day } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { normalizeCode, searchable, toWesternDigits } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { convertUnitPrice, invoiceMath, unitPriceOf } from '../../domain/saleInvoice';
import { ITEM_KINDS, type ItemKind, type WarehouseKind } from '../../domain/stores';
import { parseQty } from '../../domain/units';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtMilli, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { useDirtyForm } from '../../lib/pwa/dirty';
import * as inventory from '../../lib/repo/inventory';
import type { StoreCard, StoresOverview } from '../../lib/repo/inventory';
import * as purchasing from '../../lib/repo/purchasing';
import {
  loadSaleCatalog,
  readSalePending,
  recordSaleV2,
  salePendingKey,
  storeSalePending,
  type CatalogItem,
  type CatalogUnit,
  type PendingSale,
  type RecordedInvoice,
  type SaleCatalog,
  type SaleRequest,
} from '../../lib/repo/sales';
import { useSession } from '../../lib/session';
import { sound } from '../../lib/sound';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { baseQty } from '../inventory/simple-shared';
import { clearSaleDraft } from './saleDraft';
import { checkoutBack, checkoutBackLabel, dinars, inputMoney, linesText, moneyText, unitQtyText } from './saleParts';
import sellStyle from './sell.css?raw';
import { KindMark, kindChipLabel, shortUnit, SNACK_MS, Snackbar, type Snack } from './sellKit';
import { canStore, readSaleDraftRaw, readSellMemory, rememberSell, sellMemoryKey, writeSaleDraft } from './sellMemory';
import {
  blankDraft,
  codesOf,
  defaultUnitOf,
  draftBody,
  draftOf,
  exactCodeItem,
  isBlank,
  isWeighed,
  itemCount,
  MAX_LEGS,
  MAX_LINES,
  newLine,
  NOTE_MAX,
  parseLines,
  payKindOf,
  restoreBody,
  steppedQty,
  unitChipsOf,
  unitsOf,
  type CartLine,
  type Draft,
  type Ids,
  type Leg,
  type ParsedLine,
  type PayKind,
} from './sellModel';
import { CartSheet, LineSheet, PaySheet, ScanSheet, StoreSheet, type LineTab, type PadTarget, type PreviewRow, type Problem, type Where } from './SellSheets';

export { parseLines, unitsOf } from './sellModel';

// «بيع» (/sales/new، عقد 0033 «ب»، وتصميم المبيعات من جديد 2026-11-18 §١–٥: «شاشة كاونتر لا استمارة»). ما يراه البائع أوّلاً الموادّ بطاقاتٍ بعمودين (الأكثر
// بيعاً هنا أوّلاً)، ولمس البطاقة يضيف واحداً بوحدتها الافتراضية فتصير عدّاداً؛ والبحث الواحد بالاسم والرمز (والرمز الكامل يضيف، والكاميرا حيث يدعمها
// المتصفّح)؛ والشريط الثابت يحمل المجموع و«التالي: الدفع». ثمّ ثلاث أوراق سفلية تُغلق بالرجوع: السلّة، والسطر (الوحدة والكمية والسعر والخصم بلوحة أرقام
// التطبيق)، والدفع («لمن؟» ثمّ نقداً كلّه أو ديناً كلّه أو جزءاً الآن بصناديقه، والنتيجة جملةً، والحفظ بزرّ يسمّيها). الافتراض بقول المالك: الزبون النقديّ
// يدفع كلّه من آخر صندوق، والزبون باسمه بالدين كلّه؛ والمخزن والصندوق والوحدة والزبائن الأخيرة تُتذكَّر لكلّ مستخدم ومنشأة.
// السلوك المحفوظ كما هو (مراجعة 0033 C1–C11): المعاينة مرآة الخادم (domain/saleInvoice) والخادم يقرّر (record_sale_v2)؛ وقبل الحفظ تُقرأ الأسعار والمتاح من
// جديد، وما تغيّر من سعر اقترحه النظام يُقرّ؛ والطلب يُحفظ خارج المكوّن قبل أن يخرج (sessionStorage)، فالنتيجة المجهولة تجمّد الشاشة و«أعد المحاولة» ترسله
// حرفاً، والرفض الأكيد يعيده إلى الخانات بمرجع جديد. والجديد: الفاتورة المفتوحة تُحفظ في الجهاز بعد كلّ تغيير وتعود (saleDraft)، والحذف بـ«تراجع» لا
// بتأكيد، وبعد الحفظ الفاتورة مكان الشاشة بـ?done=1 (حالة النجاح في صفحتها). في حزمة المخزون الكسولة (خارج التثبيت المسبق)، والأنماط في sell.css
// (?raw: نصّاً في الحزمة نفسها، فلا يكبر الإقلاع ولا التثبيت المسبق)، بلا صنف Tailwind جديد ولا كلمة في الشفرة يقرؤها Tailwind صنفاً.

/** أنماط الشاشة نصّاً (sell.css?raw). حزم الفحوص تحمّل CSS فارغاً (loader '.css': 'empty' يعطي كائناً لا نصّاً)، فلا يُرسم إلا النصّ. */
const SELL_STYLE: string = typeof (sellStyle as unknown) === 'string' ? sellStyle : '';

/** مخازن يُباع منها في هذه المرحلة: الأوّلية والعلف والأدوية والعامّة (البيض والأفراخ لاحقاً، not_sellable). */
const SELLING_KINDS: readonly WarehouseKind[] = ['raw', 'feed', 'medicine', 'general'];

/**
 * رفوض تعني أنّ ما قرأته الشاشة تغيّر (المتاح أو الوحدات أو المادّة أو مخزنها): تُقرأ الموادّ من جديد ويبقى ما كُتب. الرموز كما يرفعها record_sale_v2
 * (supabase/migrations/0033_sales_invoice.sql، مراجعة 0033 C11).
 */
const REREAD = new Set(['insufficient_stock', 'not_sellable', 'unit_mismatch', 'unit_changed', 'item_archived', 'item_not_found', 'item_kind_mismatch', 'out_of_scope']);
/** صندوق أُرشف أو حُذف بعد قراءته: تُقرأ الصناديق من جديد (مع الموادّ للأمين، أو من جدولها). */
const REREAD_BOXES = new Set(['cash_account_archived', 'cash_account_not_found']);

/** لم يُحفظ شيء أكيداً: رفض الخادم، أو لم يخرج الطلب أو لم يصل، أو تزاحم فرجع، أو لا قاعدة ولا جلسة. وغيرها نتيجة مجهولة: ربّما حُفظت الفاتورة. */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

/** «المرسَل: …» لطلب لم يُعرف جوابه: المخزن والزبون والسطور والصافي والمدفوع والدين كما رآها البائع. */
export function sentText(pending: PendingSale): string {
  const { summary } = pending;
  const items = summary.lines.map((line) => t('invoice.sent.line', '{name} {qty}', { name: line.name, qty: line.qty })).join(t('list.separator', '، '));
  const vars = { store: summary.warehouseName, party: summary.partyName ?? '', items, total: dinars(summary.total), paid: dinars(summary.paid), debt: dinars(summary.total - summary.paid) };
  if (summary.partyName === null) return t('invoice.sent.walk_in', 'فاتورة من «{store}» لزبون نقديّ: {items} — الصافي {total} مدفوع كلّه.', vars);
  if (summary.paid === 0n) return t('invoice.sent.credit', 'فاتورة من «{store}» لـ«{party}»: {items} — الصافي {total} بالدين كلّه.', vars);
  return t('invoice.sent.partial', 'فاتورة من «{store}» لـ«{party}»: {items} — الصافي {total}، المدفوع الآن {paid}، والباقي دين {debt}.', vars);
}

/** جملة «حُفظت الفاتورة» من جواب الخادم نفسه (التنبيه حين حُفظت بعد مغادرة الشاشة). */
export function doneText(saved: RecordedInvoice): string {
  const vars = { doc: saved.docNo, total: dinars(saved.total), paid: dinars(saved.paid), debt: dinars(saved.debt) };
  if (saved.debt === 0n) return t('invoice.done.paid', 'حُفظت الفاتورة {doc}: {total} مدفوعة كلّها.', vars);
  if (saved.paid === 0n) return t('invoice.done.credit', 'حُفظت الفاتورة {doc}: {total} بالدين كلّه.', vars);
  return t('invoice.done.partial', 'حُفظت الفاتورة {doc}: {total}، المدفوع {paid}، والباقي دين {debt}.', vars);
}

/**
 * الزرّ الواحد يسمّي النتيجة: «احفظ — 125,000 دينار، منها 50,000 دين» (مراجعة 0033 C2، وقصيراً بتصميم المبيعات §٤: سطر واحد في 390). ولا يقول ما ليس صحيحاً والفاتورة لا تُحفظ (C8): سطر
 * ناقص ← عدد الموادّ وحده؛ ومال لا يستقيم (خصم أكبر، أو مدفوع أكثر من الصافي، أو نقديّ لم يدفع) ← الصافي بلا «مدفوعة» ولا «دين»؛ و«مدفوعة كلّها» حين
 * المدفوع = الصافي > 0 وحده.
 */
export function saveLabel(lines: number, total: Fils, paid: Fils, state: 'ok' | 'lines' | 'money' = 'ok'): string {
  if (lines === 0) return t('invoice.save.empty', 'احفظ الفاتورة');
  const vars = { lines: linesText(lines), total: moneyText(total), debt: moneyText(total - paid) };
  if (state === 'lines' || total < 0n) return t('sell.save.lines', 'احفظ — {lines}', vars);
  if (state === 'money' || paid > total) return t('sell.save.unsettled', 'احفظ — {total} دينار', vars);
  if (total === 0n) return t('sell.save.free', 'احفظ — {lines} بلا مقابل', vars);
  if (paid === total) return t('sell.save.paid', 'احفظ — {total} دينار مدفوعة كلّها', vars);
  if (paid === 0n) return t('sell.save.credit', 'احفظ — {total} دينار بالدين كلّه', vars);
  return t('sell.save.partial', 'احفظ — {total} دينار، منها {debt} دين', vars);
}

/** موادّ المخزن القابلة للبيع (لا شيء قبل اختيار المخزن). */
function useCatalog(warehouseId: string) {
  const load = useCallback(() => (warehouseId ? loadSaleCatalog(warehouseId) : Promise.resolve(null)), [warehouseId]);
  return useLoad(load, warehouseId);
}

/** الصناديق من جدولها حين لا يرسلها الخادم مع الموادّ. */
function useBoxes(wanted: boolean) {
  const load = useCallback(() => (wanted ? purchasing.listBoxes() : Promise.resolve(null)), [wanted]);
  return useLoad(load, `${wanted}`);
}

/** المخازن التي يُباع منها في النطاق. */
const sellingStores = (overview: StoresOverview | null): StoreCard[] => (overview?.rows ?? []).filter((row) => SELLING_KINDS.includes(row.kind));

/** المخزن قبل أن يختار البائع: من الرابط إن كان منها، ثمّ آخر مخزن بيع منه هنا، ثمّ الوحيد، وإلّا لا شيء (يُختار من القائمة). */
function defaultStore(rows: readonly StoreCard[], fromLink: string | null, remembered: string | null): string {
  if (fromLink !== null && rows.some((row) => row.id === fromLink)) return fromLink;
  if (remembered !== null && rows.some((row) => row.id === remembered)) return remembered;
  return rows.length === 1 && rows[0] ? rows[0].id : '';
}

/** تغيّر سعر بيع اقترحه النظام بين فتح الفاتورة والحفظ. */
interface PriceChange {
  lineId: string;
  name: string;
  unit: string;
  factor: bigint;
  before: Fils;
  after: Fils | null;
}

// ─── الأوراق في التاريخ: الرجوع يغلق الورقة العليا ───────────────────────────────────────────────────────────────────

type SheetName = 'cart' | 'pay' | 'line' | 'store' | 'scan';

interface SellNav {
  stack: SheetName[];
  line: string | null;
  tab: LineTab;
  /** ورقة السطر فُتحت لخطأ: يُمرَّر إليه وتُركَّز خانته. */
  focus: boolean;
  /** «المزيد» مفتوح في السلّة. */
  more: boolean;
}

const SHEETS: readonly SheetName[] = ['cart', 'pay', 'line', 'store', 'scan'];
const TABS: readonly LineTab[] = ['qty', 'price', 'discount'];

function navOf(state: unknown): SellNav {
  const sell = (state as { sell?: Partial<SellNav> } | null)?.sell;
  const stack = Array.isArray(sell?.stack) ? sell.stack.filter((name): name is SheetName => SHEETS.includes(name)) : [];
  return {
    stack,
    line: typeof sell?.line === 'string' ? sell.line : null,
    tab: TABS.includes(sell?.tab as LineTab) ? (sell?.tab as LineTab) : 'qty',
    focus: sell?.focus === true,
    more: sell?.more === true,
  };
}

/** نصّ «عندك» بوحدة: «30 كيس» أو «8 كيس + 24.5 كغم» للوحدة المعبّأة، وبالأساس لغيرها. */
export function stockText(item: Pick<CatalogItem, 'available' | 'baseUnit'>, unit: Pick<CatalogUnit, 'unitId' | 'label' | 'factor'>): string {
  if (unit.unitId === null || unit.factor % 1000n !== 0n) return baseQty(item.available, item.baseUnit);
  return fmtQty(item.available, item.baseUnit, { pack: { label: shortUnit(unit.label), factor: unit.factor / 1000n } }).main;
}

// ─── البطاقة ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface CardProps {
  item: CatalogItem;
  /** السطر الذي يعدّه العدّاد (آخر سطر للمادّة)، أو null. */
  line: CartLine | null;
  unit: CatalogUnit;
  /** سطور أخرى للمادّة نفسها. */
  others: number;
  full: boolean;
  onAdd: () => void;
  onStep: (delta: 1 | -1) => void;
  onOpen: () => void;
}

function ItemCard({ item, line, unit, others, full, onAdd, onStep, onOpen }: CardProps) {
  const out = item.available <= 0n;
  const expiredOnly = out && item.expired > 0n;
  const price = item.sellPrice === null ? null : unitPriceOf(item.sellPrice, unit.factor);
  const short = shortUnit(unit.label);
  const qty = line ? line.qty : '';
  const qtyShown = line && qty.trim() ? unitQtyText(parseQtyOr(qty), short) : '';
  return (
    <li className="sl-cell">
      <div className="sl-card" data-kind={item.kind} data-in={line ? 'yes' : undefined} data-out={out ? 'yes' : undefined}>
        <button type="button" className="sl-card-main" disabled={out || (full && !line)} onClick={onAdd} data-action="sale-item-card" data-item={item.id}>
          <span className="sl-card-top">
            <span className="sl-mark">
              <KindMark kind={item.kind} />
              {line ? (
                <span key={qty} className="sl-badge" data-action="card-badge">
                  {qtyShown === '' ? fmtInt(0) : fmtMilli(parseQtyOr(qty))}
                </span>
              ) : null}
            </span>
            <span className="sl-card-name">{item.name}</span>
          </span>
          <span className="sl-card-price">
            {price === null ? t('sell.card.no_price', 'بلا سعر بيع') : t('sell.card.price', '{price} / {unit}', { price: moneyText(price), unit: unit.label })}
          </span>
          {line ? null : (
            <span className="sl-card-stock" data-state={out ? (expiredOnly ? 'expired' : 'out') : undefined}>
              {expiredOnly
                ? t('invoice.item.expired', 'منتهية الصلاحية: {qty}', { qty: baseQty(item.expired, item.baseUnit) })
                : out
                  ? t('invoice.item.out', 'نفد من هذا المخزن')
                  : t('sell.card.stock', 'عندك {qty}', { qty: stockText(item, unit) })}
            </span>
          )}
        </button>
        {line ? (
          <div className="sl-stepper" data-action="card-stepper">
            <button type="button" className="sl-step" aria-label={t('sell.step.minus', 'أنقص واحداً من «{name}»', { name: item.name })} onClick={() => onStep(-1)} data-action="card-minus">
              <span aria-hidden="true">−</span>
            </button>
            <button type="button" className="sl-step-qty" onClick={onOpen} data-action="card-qty" aria-label={t('sell.step.open', '{qty} — غيّر الكمية أو السعر', { qty: qtyShown })}>
              {qtyShown}
              {others > 0 ? <span className="sl-step-more">{t('sell.card.more_lines', '+ سطر آخر')}</span> : null}
            </button>
            <button type="button" className="sl-step" aria-label={t('sell.step.plus', 'زِد واحداً من «{name}»', { name: item.name })} onClick={() => onStep(1)} data-action="card-plus">
              <span aria-hidden="true">+</span>
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** الكمية من نصّها (السطر يحفظ نصّاً)، أو صفر. */
const parseQtyOr = (text: string): bigint => (text.trim() ? (parseQty(text) ?? 0n) : 0n);

// ─── الصفحة ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface CheckoutProps {
  pendingKey: string;
  userId: string;
  orgId: string;
  canCreateParty: boolean;
  back: string;
  itemParam: string | null;
  storeParam: string | null;
}

function Checkout({ pendingKey, userId, orgId, canCreateParty, back, itemParam, storeParam }: CheckoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = navOf(location.state);
  const online = useStore(onlineStore);
  const stores = useLoad(inventory.loadStoresOverview, 'stores');
  const memoryKey = sellMemoryKey(userId, orgId);
  const [memory, setMemory] = useState(() => readSellMemory(memoryKey));
  const remember = (patch: Parameters<typeof rememberSell>[1]) => {
    rememberSell(memoryKey, patch);
    setMemory(readSellMemory(memoryKey));
  };
  // الفاتورة المفتوحة على الجهاز (تعود كما تُركت، بمعرّفيها).
  const [initial] = useState(() => {
    const raw = readSaleDraftRaw(userId, orgId) as { v?: unknown; body?: unknown } | null;
    return raw && raw.v === 1 ? restoreBody(raw.body) : null;
  });
  const [storageWorks] = useState(canStore);
  const [draft, setDraft] = useState<Draft>(() => initial?.draft ?? blankDraft());
  const [ids, setIds] = useState<Ids>(() => initial?.ids ?? { ref: crypto.randomUUID(), saleId: crypto.randomUUID() });
  const [restored, setRestored] = useState(() => (initial?.draft.lines.length ?? 0) > 0);
  const [frozen, setFrozen] = useState<PendingSale | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unreached, setUnreached] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [priceCheck, setPriceCheck] = useState<PriceChange[] | null>(null);
  const [askFree, setAskFree] = useState<PendingSale | null>(null);
  const [switchTo, setSwitchTo] = useState<{ store: string; fromLink: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ItemKind | 'all'>('all');
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [padTarget, setPadTarget] = useState<PadTarget | null>(null);
  const [padFresh, setPadFresh] = useState(true);
  const [focusRequest, setFocusRequest] = useState<{ round: number; where: Where } | null>(null);
  const [stop, setStop] = useState<string | null>(null);
  const deferred = useDeferredValue(search);
  const sending = useRef(false);
  const live = useRef(true);
  const leaving = useRef<string | null>(null);
  // آخر نسخة من الفاتورة المعروضة، لمن ينتظر جواباً (الحفظ بعد قراءة الأسعار).
  const latest = useRef<Draft>(draft);
  const navNow = useRef({ stack: nav.stack, key: location.key });
  useEffect(() => {
    latest.current = draft;
    navNow.current = { stack: nav.stack, key: location.key };
  });
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // مادّة من الرابط (?item=، «بِع» في ملفّ المادّة) تُضاف مرّة حين تُقرأ موادّ المخزن؛ لا بعد طلب مستعاد (سطوره تعود بالرفض الأكيد، مراجعة 0033 C7).
  const [seeded, setSeeded] = useState(itemParam === null);
  const [linkChecked, setLinkChecked] = useState(storeParam === null);
  // طلب معلَّق من فتح سابق (أو قبل إعادة التحميل): تعود الشاشة مجمَّدة به. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (مرّة لكلّ مفتاح).
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (restoredFor !== pendingKey) {
    setRestoredFor(pendingKey);
    const pending = readSalePending(pendingKey);
    setFrozen(pending);
    if (pending) setSeeded(true);
  }

  // المخازن التي يُباع منها في النطاق، والمختار.
  const storeRows = sellingStores(stores.data);
  // رابط بمخزن والفاتورة المفتوحة من غيره: يُسأل قبل تفريغها؛ وبلا سطور يُتبع الرابط.
  if (!linkChecked && stores.data && !frozen) {
    setLinkChecked(true);
    if (storeParam !== null && storeRows.some((row) => row.id === storeParam) && draft.warehouseId !== '' && draft.warehouseId !== storeParam) {
      if (draft.lines.length > 0) setSwitchTo({ store: storeParam, fromLink: true });
      else setDraft((current) => ({ ...current, warehouseId: storeParam }));
    }
  }
  const warehouseId = draft.warehouseId || defaultStore(storeRows, storeParam, memory.store);
  const store = storeRows.find((row) => row.id === warehouseId) ?? null;
  const storeName = store?.name ?? '';
  const today: Day = stores.data?.today ?? localDay();

  // موادّ المخزن؛ وما قُرئ قبل الحفظ يحلّ محلّها حتى قراءة أحدث.
  const catalogState = useCatalog(warehouseId);
  const [override, setOverride] = useState<{ warehouseId: string; catalog: SaleCatalog } | null>(null);
  const catalog = override && override.warehouseId === warehouseId ? override.catalog : catalogState.data;
  const rereadCatalog = () => {
    setOverride(null);
    catalogState.retry();
  };
  const wantsBoxes = catalog !== null && catalog.boxes === null;
  const boxState = useBoxes(wantsBoxes);
  const boxes = catalog?.boxes ?? boxState.data;

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const setLine = (lineId: string, patch: Partial<CartLine>) => setDraft((current) => ({ ...current, lines: current.lines.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)) }));
  const byItem = new Map((catalog?.items ?? []).map((item) => [item.id, item]));
  const unitOf = (item: CatalogItem) => defaultUnitOf(item, memory.units);

  if (!seeded && catalogState.data && warehouseId && !frozen && switchTo === null && (storeParam === null || warehouseId === storeParam || !storeRows.some((row) => row.id === storeParam))) {
    setSeeded(true);
    const item = catalogState.data.items.find((row) => row.id === itemParam);
    if (draft.lines.some((line) => line.itemId === itemParam)) {
      // في الفاتورة من قبل: لا سطر ثانٍ.
    } else if (item && item.available > 0n) setDraft((current) => ({ ...current, warehouseId: current.warehouseId || warehouseId, lines: [...current.lines, newLine(item, defaultUnitOf(item, memory.units))] }));
    else setNotice(t('invoice.item_param.missing', 'المادّة المطلوبة لا يوجد منها شيء يُباع في «{store}»؛ اختر مخزناً آخر أو مادّة أخرى.', { store: storeName }));
  }

  // وحدة سطر غابت من وحدات مادّته بعد قراءة جديدة: السعر كان لها فيُمحى، وورقة السطر تقول «اختر الوحدة» (مراجعة 0033 C11).
  const [unitsCheckedFor, setUnitsCheckedFor] = useState<SaleCatalog | null>(null);
  if (catalog !== null && catalog !== unitsCheckedFor) {
    setUnitsCheckedFor(catalog);
    const gone = new Set(
      draft.lines.flatMap((line) => {
        const item = catalog.items.find((row) => row.id === line.itemId);
        return item && line.unitId !== null && !item.units.some((unit) => unit.unitId === line.unitId) ? [line.lineId] : [];
      }),
    );
    if (gone.size > 0) setDraft((current) => ({ ...current, lines: current.lines.map((line) => (gone.has(line.lineId) ? { ...line, price: '' } : line)) }));
  }

  // ─── الحساب ──────────────────────────────────────────────────────────────────────────────────────────────────
  const read = parseLines(draft.lines, catalog, storeName);
  const invoiceDiscount = draft.invoiceDiscount.trim() ? parseMoneyText(draft.invoiceDiscount, true) : 0n;
  const math = invoiceMath(
    read.map((row) => ({ unitQty: row.qty ?? 0n, unitPrice: row.price ?? 0n, discount: row.discount ?? 0n })),
    invoiceDiscount !== null && invoiceDiscount > 0n ? invoiceDiscount : 0n,
  );
  // خصم سطر أكبر من إجماليّه (bad_discount بالخادم) خطأ على خانته؛ وسعر فوق الصفر يُقرَّب إجماليّه إلى صفر دينار (total_zero بالخادم) خطأ على السعر (C9).
  const parsed: ParsedLine[] = read.map((row, index) => {
    const errors = { ...row.errors };
    if (math.overLines.includes(index) && !errors.discount) errors.discount = t('invoice.line.discount_over', 'الخصم أكبر من إجماليّ السطر ({gross}).', { gross: dinars(math.gross[index] ?? 0n) });
    if (row.qty !== null && row.price !== null && row.price > 0n && (math.gross[index] ?? 0n) === 0n && !errors.price) {
      errors.price = t('invoice.line.total_zero', 'مبلغ هذا السطر يُقرَّب إلى صفر دينار: راجع الكمية والسعر، أو اكتب السعر صفراً للتسليم بلا مقابل.');
    }
    return { ...row, errors };
  });
  const walkIn = draft.mode === 'walk_in';
  const payKind: PayKind = payKindOf(draft);
  const boxList = boxes ?? [];
  const defaultBox = memory.box !== null && boxList.some((box) => box.id === memory.box) ? memory.box : (boxList[0]?.id ?? '');
  const cashBox = draft.cashBox !== '' && (boxes === null || boxList.some((box) => box.id === draft.cashBox)) ? draft.cashBox : defaultBox;
  const settled = math.nets !== null && math.total > 0n;
  const legs: { leg: Leg; amount: Fils | null; auto: boolean }[] =
    payKind === 'cash'
      ? settled
        ? [{ leg: { legId: draft.cashLegId, boxId: cashBox, amount: inputMoney(math.total) }, amount: math.total, auto: true }]
        : []
      : payKind === 'debt'
        ? []
        : draft.legs.map((leg) => ({ leg, amount: leg.amount.trim() ? parseMoneyText(leg.amount, true) : null, auto: false }));
  const paid = legs.reduce((sum, row) => sum + (row.amount !== null && row.amount > 0n ? row.amount : 0n), 0n);
  const debt = math.total - paid;

  const errors: Partial<Record<'store' | 'lines' | 'discount' | 'party' | 'legs' | 'walk_in' | 'note' | 'day', string>> = {};
  if (!warehouseId) errors.store = t('purchase.store.required', 'اختر المخزن.');
  if (draft.lines.length === 0) errors.lines = t('invoice.lines.required', 'أضف مادّة واحدة على الأقلّ إلى الفاتورة.');
  if (invoiceDiscount === null || invoiceDiscount < 0n) errors.discount = t('invoice.discount.invalid', 'خصم الفاتورة بالدينار الصحيح من صفر فأكثر.');
  else if (math.invoiceOver) errors.discount = t('invoice.discount.over', 'خصم الفاتورة أكبر من مجموع السطور بعد خصومها ({base}).', { base: dinars(math.grossTotal - math.lineDiscounts) });
  if (!walkIn && !draft.party) errors.party = t('invoice.party.required', 'اختر الزبون، أو أضفه باسمه، أو اختر «زبون نقديّ» إن دفع المبلغ كلّه.');
  const legErrors = legs.map(({ leg, amount }, index) => {
    if (!leg.boxId) return t('purchase.box.required', 'اختر الصندوق الذي دُفع منه.');
    if (legs.findIndex((other) => other.leg.boxId === leg.boxId) !== index) return t('invoice.leg.duplicate', 'هذا الصندوق مكتوب في دفعة أخرى؛ اجمعهما في دفعة واحدة.');
    if (amount === null || amount <= 0n) return t('invoice.leg.amount', 'اكتب المبلغ بالدينار الصحيح أكبر من صفر.');
    return null;
  });
  if (legErrors.some((problem) => problem !== null)) errors.legs = legErrors.find((problem) => problem !== null) ?? undefined;
  else if (paid > math.total) errors.legs = t('invoice.paid.over', 'المدفوع ({paid}) أكبر من صافي الفاتورة ({total}).', { paid: dinars(paid), total: dinars(math.total) });
  if (walkIn && paid !== math.total && !errors.legs) {
    errors.walk_in = t('invoice.walk_in.unpaid_sell', 'الزبون النقديّ يدفع المبلغ كلّه الآن ({total}): اختر «نقداً كلّه»، أو اختر زبوناً باسمه ليبقى الباقي ديناً عليه.', { total: dinars(math.total) });
  }
  if (draft.note.trim().length > NOTE_MAX) errors.note = t('invoice.note.long', 'الملاحظة حتى 500 حرف.');
  const day = postingDay(draft.day ?? fmtDay(today), today);
  if (day.error) errors.day = day.error;
  const lineProblems = parsed.some((row) => Object.keys(row.errors).length > 0);
  const blocked = Object.keys(errors).length > 0 || lineProblems;
  const shown = tried ? errors : {};
  // المال لا يستقيم بعد: الزرّ والمجموع لا يقولان «مدفوعة» ولا ديناً سالباً (مراجعة 0033 C8).
  const moneyState: 'ok' | 'lines' | 'money' = lineProblems ? 'lines' : errors.discount || errors.legs || errors.walk_in || math.nets === null || debt < 0n ? 'money' : 'ok';
  // ما يمنع الحفظ بترتيب الشاشة، وأين يُصحَّح.
  const lineWhere = (row: ParsedLine): Problem[] =>
    (['item', 'unit', 'qty', 'price', 'discount'] as const).flatMap((field) => {
      const text = row.errors[field];
      if (!text) return [];
      const where: Where = field === 'item' ? { kind: 'cart' } : { kind: 'line', lineId: row.line.lineId, tab: field === 'unit' ? 'qty' : field };
      return [{ text, where }];
    });
  const problemsOf = (rows: readonly ParsedLine[]): Problem[] =>
    [
      errors.store ? [{ text: errors.store, where: { kind: 'store' } as Where }] : [],
      errors.lines ? [{ text: errors.lines, where: { kind: 'cart' } as Where }] : [],
      ...rows.map(lineWhere),
      errors.discount ? [{ text: errors.discount, where: { kind: 'discount' } as Where }] : [],
      errors.day ? [{ text: errors.day, where: { kind: 'more' } as Where }] : [],
      errors.party ? [{ text: errors.party, where: { kind: 'party' } as Where }] : [],
      errors.legs || errors.walk_in ? [{ text: errors.legs ?? errors.walk_in ?? '', where: { kind: 'legs' } as Where }] : [],
      errors.note ? [{ text: errors.note, where: { kind: 'more' } as Where }] : [],
    ].flat();
  const problems = problemsOf(parsed);

  const items = itemCount(draft.lines);
  const summaryTotal = math.nets !== null && math.total > 0n ? math.total : 0n;
  const dirty = !isBlank(draft);
  useDirtyForm(busy || frozen !== null || (dirty && !storageWorks));

  // الفاتورة المفتوحة تُحفظ في الجهاز بعد كلّ تغيير (وتُمحى فارغةً)؛ والطلب المعلّق في sessionStorage كما هو.
  useEffect(() => {
    if (frozen) return;
    if (isBlank(draft)) clearSaleDraft(userId, orgId);
    else writeSaleDraft(userId, orgId, { lines: itemCount(draft.lines), total: summaryTotal, storeId: draft.warehouseId || warehouseId }, draftBody(draft, ids));
  }, [draft, ids, frozen, summaryTotal, warehouseId, userId, orgId]);

  // «تراجع» يختفي بعد ستّ ثوانٍ.
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack((current) => (current === snack ? null : current)), SNACK_MS);
    return () => clearTimeout(timer);
  }, [snack]);

  // ─── الأوراق ─────────────────────────────────────────────────────────────────────────────────────────────────
  const here = { pathname: location.pathname, search: location.search };
  const openSheet = (sheet: SheetName, extra: Partial<SellNav> = {}, replaceTop = false) => {
    const stack = replaceTop ? [...nav.stack.slice(0, -1), sheet] : [...nav.stack, sheet];
    navigate(here, { replace: replaceTop, state: { sell: { ...nav, focus: false, ...extra, stack } } });
  };
  const closeSheet = () => {
    if (nav.stack.length === 0) return;
    if (location.key === 'default') navigate(here, { replace: true, state: { sell: { ...nav, focus: false, stack: nav.stack.slice(0, -1) } } });
    else navigate(-1);
  };
  /**
   * بعد الحفظ: الأوراق تُطوى من التاريخ ثمّ الفاتورة مكان الشاشة (لا رجوع إلى فاتورة حُفظت). بالكومة كما هي بعد الجواب لا كما كانت عند «احفظ» (زرّ
   * الرجوع أثناء الطلب يطوي ورقةً).
   */
  const leaveTo = (target: string) => {
    const depth = navNow.current.stack.length;
    if (depth > 0 && navNow.current.key !== 'default') {
      leaving.current = target;
      navigate(-depth);
      return;
    }
    navigate(target, { replace: true });
  };
  useEffect(() => {
    if (leaving.current === null || nav.stack.length > 0) return;
    const target = leaving.current;
    leaving.current = null;
    navigate(target, { replace: true });
  }, [location.key, nav.stack.length, navigate]);

  const openLine = (lineId: string, tab: LineTab = 'qty', focus = false) => openSheet('line', { line: lineId, tab, focus });

  // ─── الإرسال ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** نداء record_sale_v2 بطلب محفوظ: الأوّل من الحفظ، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const send = async (pending: PendingSale, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setUnreached(false);
    // الطلب محفوظ خارج المكوّن قبل أن يخرج: رجوع أو إعادة تحميل قبل الجواب تعيد الشاشة مجمَّدة به.
    storeSalePending(pendingKey, pending);
    try {
      const saved = await recordSaleV2(pending.request);
      storeSalePending(pendingKey, null);
      clearSaleDraft(userId, orgId);
      const { request } = pending;
      remember({
        store: request.warehouseId,
        box: request.payments[0]?.cashAccountId,
        units: Object.fromEntries(request.lines.map((line) => [line.itemId, line.unitId])),
        party: request.partyId !== null && pending.summary.partyName ? { id: request.partyId, name: pending.summary.partyName } : undefined,
      });
      if (!live.current) {
        toast({ tone: 'success', title: doneText(saved) });
        return;
      }
      sound.success();
      setFrozen(null);
      setDraft(blankDraft(request.warehouseId));
      setIds({ ref: crypto.randomUUID(), saleId: crypto.randomUUID() });
      // الفاتورة مكان الشاشة بحالة النجاح (?done=1)، ورجوعها إلى ما فُتحت منه الفاتورة الجديدة (مراجعة 0033 D9).
      const query = new URLSearchParams(back === '/sales' ? { done: '1' } : { done: '1', back }).toString();
      leaveTo(`/sales/${saved.saleId}?${query}`);
    } catch (problem) {
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن حُفظت: الشاشة تتجمّد بطلبها، والإعادة وحدها ممكنة.
        setFrozen(pending);
        setUnreached(retrying && surelyUnsaved(problem));
        if (!live.current) toast({ tone: 'warning', title: t('invoice.unknown_away', 'لا نعرف إن حُفظت الفاتورة: افتح «فاتورة بيع جديدة» وأعد المحاولة؛ لن تُسجَّل مرّتين.') });
        return;
      }
      // جواب أكيد بلا فاتورة: ما أُرسل يعود إلى الخانات، والإرسال التالي بمرجع جديد (ومعرّفات جديدة بعد id_conflict).
      storeSalePending(pendingKey, null);
      setFrozen(null);
      if (!live.current) {
        toast({ tone: 'danger', title: t('invoice.refused_away', 'لم تُحفظ الفاتورة.'), detail: failureText(problem) });
        return;
      }
      sound.warn();
      const conflict = problem instanceof RejectedError && problem.code === 'id_conflict';
      setDraft((current) => {
        const base = current.lines.length > 0 ? current : draftOf(pending, fmtDay(pending.request.soldOn));
        return conflict
          ? { ...base, cashLegId: crypto.randomUUID(), lines: base.lines.map((line) => ({ ...line, lineId: crypto.randomUUID() })), legs: base.legs.map((leg) => ({ ...leg, legId: crypto.randomUUID() })) }
          : base;
      });
      setIds({ ref: crypto.randomUUID(), saleId: conflict ? crypto.randomUUID() : pending.request.saleId });
      setFailure(problem);
      if (problem instanceof RejectedError && REREAD.has(problem.code)) rereadCatalog();
      if (problem instanceof RejectedError && REREAD_BOXES.has(problem.code)) {
        rereadCatalog();
        boxState.retry();
      }
    } finally {
      sending.current = false;
      if (live.current) setBusy(false);
    }
  };

  /** الطلب من النموذج كما هو الآن (بعد الحرّاس كلّها). */
  const requestNow = (): PendingSale | null => {
    if (blocked || !warehouseId || !day.day || invoiceDiscount === null) return null;
    const lines = parsed.flatMap((row) =>
      row.item && row.unit && row.qty !== null && row.price !== null && row.discount !== null
        ? [{ lineId: row.line.lineId, itemId: row.item.id, unitId: row.unit.unitId, factor: row.unit.factor, qty: row.qty, unitPrice: row.price, discount: row.discount }]
        : [],
    );
    if (lines.length !== parsed.length) return null;
    const request: SaleRequest = {
      clientRef: ids.ref,
      saleId: ids.saleId,
      warehouseId,
      partyId: walkIn ? null : (draft.party?.id ?? null),
      soldOn: day.day,
      lines,
      invoiceDiscount,
      payments: legs.flatMap(({ leg, amount }) => (amount !== null ? [{ legId: leg.legId, cashAccountId: leg.boxId, amount }] : [])),
      note: draft.note.trim() || null,
    };
    return {
      request,
      summary: {
        warehouseName: storeName,
        partyName: walkIn ? null : (draft.party?.name ?? ''),
        lines: parsed.map((row) => ({ name: row.item?.name ?? row.line.name, qty: unitQtyText(row.qty ?? 0n, row.unit?.label ?? '') })),
        total: math.total,
        paid,
      },
    };
  };

  /** بعد إقرار الأسعار: التسليم بلا مقابل يُسأل عنه صراحةً، وغيره يُرسل. */
  const proceed = (pending: PendingSale) => {
    if (pending.summary.total === 0n) {
      setAskFree(pending);
      return;
    }
    void send(pending, false);
  };

  /** ينقل إلى ما يمنع الحفظ أوّلاً: سطر ← ورقته على خانته، والدفع ← خانته في ورقة الدفع، والتاريخ والملاحظة ← «المزيد» في السلّة. */
  const goFix = (first: Problem | undefined) => {
    if (!first) return;
    const { where } = first;
    if (where.kind === 'line') openLine(where.lineId, where.tab, true);
    else if (where.kind === 'cart' || where.kind === 'more') openSheet('cart', { more: where.kind === 'more' }, nav.stack.at(-1) === 'cart');
    else if (where.kind === 'store') openSheet('store');
    else {
      if (where.kind === 'discount') {
        setPadTarget({ kind: 'discount' });
        setPadFresh(true);
      }
      setFocusRequest((current) => ({ round: (current?.round ?? 0) + 1, where }));
    }
  };

  /** «احفظ الفاتورة»: الحرّاس، ثمّ قراءة الأسعار والمتاح من جديد (المهارة 11)، وإقرار ما تغيّر، ثمّ النداء. */
  const save = async () => {
    setTried(true);
    setNotice(null);
    setStop(null);
    setPadTarget(null);
    if (frozen || busy || !online) return;
    if (blocked || !warehouseId) {
      sound.warn();
      goFix(problems[0]);
      return;
    }
    const pending = requestNow();
    if (!pending) return;
    const started = draft;
    setBusy(true);
    setFailure(null);
    let fresh: SaleCatalog;
    try {
      fresh = await loadSaleCatalog(warehouseId);
    } catch (problem) {
      if (!live.current) return;
      setBusy(false);
      setFailure(problem);
      setStop(t('invoice.recheck.failed', 'تعذّرت قراءة الأسعار والمتاح قبل الحفظ، فلم يُرسل شيء. أعد المحاولة.'));
      return;
    }
    if (!live.current) return;
    setBusy(false);
    setOverride({ warehouseId, catalog: fresh });
    // تغيّرت الفاتورة أثناء القراءة: لا يُرسل طلبٌ غير المعروض (المهارة: «تغيّرت السلّة أثناءها ⇒ قف»).
    if (latest.current !== started) {
      setNotice(t('invoice.changed_meanwhile', 'تغيّرت الفاتورة أثناء التحقّق من الأسعار؛ راجعها ثمّ احفظ.'));
      setStop(t('invoice.changed_meanwhile', 'تغيّرت الفاتورة أثناء التحقّق من الأسعار؛ راجعها ثمّ احفظ.'));
      return;
    }
    const freshById = new Map(fresh.items.map((item) => [item.id, item]));
    // المتاح الجديد أو مادّة غابت: يُقال بجانب الزرّ ويُفتح السطر على خطئه (C4)، ولا يُرسل شيء.
    const freshRows = parseLines(draft.lines, fresh, storeName);
    const freshProblem = freshRows.flatMap(lineWhere)[0];
    if (freshProblem) {
      sound.warn();
      goFix(freshProblem);
      return;
    }
    const changes: PriceChange[] = parsed.flatMap((row) => {
      const before = row.line.suggestedFrom;
      if (before === null || !row.unit) return [];
      const after = freshById.get(row.line.itemId)?.sellPrice ?? null;
      return after === before ? [] : [{ lineId: row.line.lineId, name: row.item?.name ?? row.line.name, unit: row.unit.label, factor: row.unit.factor, before, after }];
    });
    if (changes.length > 0) {
      setPriceCheck(changes);
      return;
    }
    proceed(pending);
  };

  // ─── أفعال السلّة ────────────────────────────────────────────────────────────────────────────────────────────
  const lastLineOf = (itemId: string): CartLine | null => draft.lines.filter((line) => line.itemId === itemId).at(-1) ?? null;
  const toast6 = (text: string, undo: () => void) => setSnack((current) => ({ id: (current?.id ?? 0) + 1, text, undo }));
  const removeLine = (lineId: string) => {
    const index = draft.lines.findIndex((line) => line.lineId === lineId);
    const line = draft.lines[index];
    if (!line) return;
    setDraft((current) => ({ ...current, lines: current.lines.filter((other) => other.lineId !== lineId) }));
    toast6(t('sell.removed', 'حُذفت «{name}» من الفاتورة', { name: byItem.get(line.itemId)?.name ?? line.name }), () =>
      setDraft((current) => (current.lines.some((other) => other.lineId === lineId) ? current : { ...current, lines: [...current.lines.slice(0, index), line, ...current.lines.slice(index)] })),
    );
  };
  const stepLine = (lineId: string, delta: 1 | -1) => {
    const line = draft.lines.find((other) => other.lineId === lineId);
    if (!line) return;
    const next = steppedQty(line.qty, delta);
    if (next === null) {
      removeLine(lineId);
      return;
    }
    setLine(lineId, { qty: next });
  };
  /** لمس البطاقة أو المسح: سطر جديد بواحد من الوحدة الافتراضية، أو واحد زيادة على آخر سطر للمادّة. والموزون يفتح ورقته لكتابة الكمية. */
  const addItem = (item: CatalogItem, via: 'tap' | 'scan') => {
    setScanNote(null);
    const existing = lastLineOf(item.id);
    if (existing) {
      stepLine(existing.lineId, 1);
      return;
    }
    if (draft.lines.length >= MAX_LINES) return;
    const unit = unitOf(item);
    const line = newLine(item, unit, '1');
    // المخزن يُثبَّت في الفاتورة مع أوّل سطر: لو تغيّر «آخر مخزن» من نافذة أخرى تبقى الفاتورة المفتوحة على مخزنها.
    setDraft((current) => ({ ...current, warehouseId: current.warehouseId || warehouseId, lines: [...current.lines, line] }));
    if (via === 'tap' && isWeighed(item, unit)) openLine(line.lineId, 'qty');
  };
  const addAnother = (lineId: string) => {
    const line = draft.lines.find((other) => other.lineId === lineId);
    const item = line ? byItem.get(line.itemId) : undefined;
    if (!line || !item || draft.lines.length >= MAX_LINES) return;
    const base = unitsOf(item)[0] as CatalogUnit;
    const unit = line.unitId === null ? unitOf(item) : base;
    const added = newLine(item, unit, '1');
    setDraft((current) => {
      const at = current.lines.findIndex((other) => other.lineId === lineId);
      return { ...current, lines: [...current.lines.slice(0, at + 1), added, ...current.lines.slice(at + 1)] };
    });
    openSheet('line', { line: added.lineId, tab: 'qty', focus: false }, true);
  };
  /** رمز كامل (ماسح أو كتابة أو كاميرا): المادّة تُضاف أو تزيد واحداً، وإلّا يُقال لماذا. */
  const scanCode = (raw: string): boolean => {
    const wanted = normalizeCode(raw);
    if (!wanted || !catalog) return false;
    const matches = catalog.items.filter((item) => codesOf(item).includes(wanted));
    if (matches.length !== 1 || !matches[0]) {
      sound.warn();
      setScanNote(
        matches.length === 0
          ? t('invoice.scan.none', 'لا مادّة بالباركود «{code}» تُباع من «{store}».', { code: wanted, store: storeName })
          : t('invoice.scan.many', 'الباركود «{code}» لأكثر من مادّة؛ اخترها من البطاقات.', { code: wanted }),
      );
      return true;
    }
    const item = matches[0];
    if (item.available <= 0n) {
      sound.warn();
      setScanNote(t('sell.scan.out', '«{name}» نفدت من «{store}».', { name: item.name, store: storeName }));
      return true;
    }
    sound.click();
    addItem(item, 'scan');
    return true;
  };
  const typeSearch = (text: string) => {
    const exact = catalog ? exactCodeItem(catalog.items, text) : null;
    if (exact && exact.available > 0n) {
      setSearch('');
      scanCode(text);
      return;
    }
    setSearch(text);
  };
  const enterSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const text = search;
    if (!text.trim() || !catalog) return;
    const code = normalizeCode(text);
    if (catalog.items.some((item) => codesOf(item).includes(code)) || /^\d+$/u.test(code)) {
      setSearch('');
      scanCode(text);
      return;
    }
    const [only, ...more] = visible;
    if (only && more.length === 0 && only.available > 0n) {
      setSearch('');
      addItem(only, 'tap');
    }
  };
  const changeUnit = (line: CartLine, unitId: string | null) => {
    const item = byItem.get(line.itemId);
    const units = item ? unitsOf(item) : [];
    const unit = units.find((option) => option.unitId === unitId);
    const before = units.find((option) => option.unitId === line.unitId);
    const typed = line.price.trim() ? parseMoneyText(line.price, false) : null;
    // السعر المقترح يتبع الوحدة؛ وما كتبه البائع يتحوّل بالسعر نفسه للأساس (700 للكيلو = 35,000 للكيس) فلا يبقى رقم الكيلو على الكيس.
    const price =
      line.suggestedFrom !== null && unit
        ? inputMoney(unitPriceOf(line.suggestedFrom, unit.factor))
        : typed !== null && typed >= 0n && unit && before
          ? inputMoney(convertUnitPrice(typed, before.factor, unit.factor))
          : line.price;
    setLine(line.lineId, { unitId, price });
    remember({ units: { [line.itemId]: unitId } });
  };
  const usualPrice = (line: CartLine): Fils | null => {
    const item = byItem.get(line.itemId);
    const unit = item ? unitsOf(item).find((option) => option.unitId === line.unitId) : undefined;
    return item && unit && item.sellPrice !== null ? unitPriceOf(item.sellPrice, unit.factor) : null;
  };
  const choosePay = (kind: PayKind) => {
    setPadTarget(null);
    if (kind === 'debt' && walkIn) {
      // الدين يحتاج اسم الزبون: «لمن؟» يُفتح والبحث مركَّز.
      set({ mode: 'party', party: null, pay: 'debt' });
      setFocusRequest((current) => ({ round: (current?.round ?? 0) + 1, where: { kind: 'party' } }));
      return;
    }
    if (kind === 'part') {
      const first = draft.legs[0] ?? { legId: crypto.randomUUID(), boxId: cashBox, amount: '' };
      set({ pay: 'part', legs: draft.legs.length > 0 ? draft.legs : [first] });
      setPadTarget({ kind: 'leg', legId: first.legId });
      setPadFresh(true);
      return;
    }
    set({ pay: kind });
  };
  const addLeg = () => {
    if (draft.legs.length >= MAX_LEGS) return;
    const taken = new Set(draft.legs.map((leg) => leg.boxId));
    const free = boxList.filter((box) => !taken.has(box.id));
    const typed = draft.legs.reduce((sum, leg) => sum + (parseMoneyText(leg.amount, true) ?? 0n), 0n);
    const rest = math.total - typed;
    const leg: Leg = { legId: crypto.randomUUID(), boxId: free[0]?.id ?? '', amount: rest > 0n ? inputMoney(rest) : '' };
    set({ pay: 'part', legs: [...draft.legs, leg] });
    setPadTarget({ kind: 'leg', legId: leg.legId });
    setPadFresh(true);
  };
  const removeLeg = (legId: string) => {
    const rest = draft.legs.filter((leg) => leg.legId !== legId);
    set(rest.length === 0 ? { pay: walkIn ? 'cash' : 'debt', legs: [] } : { legs: rest });
    if (padTarget?.kind === 'leg' && padTarget.legId === legId) setPadTarget(null);
  };
  const pickStore = (next: string) => {
    if (next === warehouseId) {
      closeSheet();
      return;
    }
    if (draft.lines.length > 0) {
      setSwitchTo({ store: next, fromLink: false });
      return;
    }
    setOverride(null);
    set({ warehouseId: next });
    remember({ store: next });
    if (nav.stack.at(-1) === 'store') closeSheet();
  };
  const startOver = () => {
    const before = draft;
    const beforeIds = ids;
    setDraft(blankDraft(warehouseId));
    setIds({ ref: crypto.randomUUID(), saleId: crypto.randomUUID() });
    setRestored(false);
    setTried(false);
    setFailure(null);
    toast6(t('sell.restart.done', 'بدأت فاتورة جديدة'), () => {
      setDraft(before);
      setIds(beforeIds);
    });
  };

  if (frozen) {
    return (
      <div className="sl-screen" data-action="sale-frozen">
        <style>{SELL_STYLE}</style>
        <div className="sl-head">
          <div className="sl-head-row">
            <Link to={back} className="sl-round" data-action="back" aria-label={checkoutBackLabel(back)}>
              <ArrowRight aria-hidden="true" className="sl-icon" />
              <span className="sr-only">{checkoutBackLabel(back)}</span>
            </Link>
            <h1 className="sl-title">{t('sell.title', 'بيع')}</h1>
          </div>
        </div>
        <div className="sl-frozen">
          <Notice
            tone="warning"
            title={
              unreached
                ? t('invoice.unreached', 'لم يصل الطلب هذه المرّة أيضاً: أعد المحاولة حين يعود الاتصال؛ لن تُسجَّل الفاتورة مرّتين.')
                : t('invoice.unknown', 'لا نعرف إن حُفظت الفاتورة: أعد المحاولة بالطلب نفسه؛ لن تُسجَّل مرّتين ولن تخرج الموادّ مرّتين.')
            }
          >
            <span data-action="sale-sent">{t('birds.sent', 'المرسَل: {what}', { what: sentText(frozen) })}</span>
          </Notice>
          {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
          <button type="button" className="sl-primary sl-wide" disabled={busy || !online} aria-busy={busy || undefined} onClick={() => void send(frozen, true)} data-action="sale-retry">
            {busy ? t('sell.sending', 'يُرسل…') : t('purchase.retry', 'أعد المحاولة')}
          </button>
          {!online ? <p className="sl-muted">{t('sell.offline.retry', 'بلا اتصال الآن: أعد المحاولة حين يعود.')}</p> : null}
        </div>
      </div>
    );
  }

  // البحث بالاسم أو بالباركود والرموز الأخرى (مراجعة 0033 C5)، وشرائح النوع، والأكثر بيعاً هنا أوّلاً ثمّ الاسم.
  const needle = searchable(deferred);
  const codeNeedle = normalizeCode(deferred);
  const kinds = ITEM_KINDS.filter((option) => (catalog?.items ?? []).some((item) => item.kind === option));
  const shownKind = kinds.includes(kind as ItemKind) ? kind : 'all';
  const visible = (catalog?.items ?? [])
    .filter((item) => shownKind === 'all' || item.kind === shownKind)
    .filter((item) => !needle || searchable(item.name).includes(needle) || (codeNeedle !== '' && codesOf(item).some((code) => code.startsWith(codeNeedle))))
    .map((item) => ({ item, key: searchable(item.name) }))
    .sort((a, b) => b.item.sold30d - a.item.sold30d || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ item }) => item);
  const previewRows: PreviewRow[] = parsed.map((row, index) => ({
    key: row.line.lineId,
    name: row.item?.name ?? row.line.name,
    qty: row.qty ?? 0n,
    unit: row.unit?.label ?? '',
    price: row.price ?? 0n,
    gross: math.gross[index] ?? 0n,
    lineDiscount: row.discount ?? 0n,
    share: math.shares?.[index] ?? 0n,
    net: math.nets?.[index] ?? 0n,
  }));
  const label = saveLabel(draft.lines.length, math.total, paid, moneyState);
  const blockedText =
    tried && blocked && problems[0] !== undefined
      ? problems.length === 1
        ? t('invoice.blocked.one', 'لم تُحفظ الفاتورة: {problem}', { problem: problems[0].text })
        : t('invoice.blocked.many_sell', 'لم تُحفظ الفاتورة: {problem} ({more} غيرها).', { problem: problems[0].text, more: problems.length - 1 })
      : stop;
  const missingPrice = parsed.some((row) => row.price === null);
  const top = nav.stack.at(-1);
  const lineRow = nav.line !== null ? parsed.find((row) => row.line.lineId === nav.line) : undefined;
  const supportsCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  return (
    <div className="sl-screen" data-action="sale-checkout">
      <style>{SELL_STYLE}</style>
      <header className="sl-head">
        <div className="sl-head-row">
          <Link to={back} className="sl-round" data-action="back" aria-label={checkoutBackLabel(back)}>
            <ArrowRight aria-hidden="true" className="sl-icon" />
            <span className="sr-only">{checkoutBackLabel(back)}</span>
          </Link>
          <h1 className="sl-title">{t('sell.title', 'بيع')}</h1>
          {store && storeRows.length > 1 ? (
            <button type="button" className="sl-chip sl-store" onClick={() => openSheet('store')} data-action="sale-store" aria-label={t('sell.store.change', 'من «{store}» — غيّر المخزن', { store: store.name })}>
              <Store aria-hidden="true" className="sl-icon-sm" />
              <span className="sl-ellipsis">{store.name}</span>
              <ChevronDown aria-hidden="true" className="sl-icon-sm" />
            </button>
          ) : null}
        </div>
        {!online ? (
          <p className="sl-offline" role="status" data-action="sale-offline">
            <span aria-hidden="true" className="sl-dot" />
            {t('sell.offline', 'بلا اتصال — جهّز الفاتورة وتُحفظ حين يعود')}
          </p>
        ) : null}
      </header>
      {warehouseId && catalog ? (
        <div className="sl-tools">
            <div className="sl-search">
              <Search aria-hidden="true" className="sl-icon sl-search-icon" />
              <input
                type="search"
                className="sl-search-input"
                enterKeyHint="search"
                autoComplete="off"
                placeholder={t('sell.search', 'ابحث بالاسم أو امسح الرمز')}
                aria-label={t('sell.search', 'ابحث بالاسم أو امسح الرمز')}
                value={search}
                onChange={(event) => typeSearch(toWesternDigits(event.target.value))}
                onKeyDown={enterSearch}
                data-action="sale-search"
              />
              {supportsCamera ? (
                <button type="button" className="sl-round" aria-label={t('sell.camera', 'امسح الرمز بالكاميرا')} onClick={() => openSheet('scan')} data-action="sale-camera">
                  <ScanLine aria-hidden="true" className="sl-icon" />
                </button>
              ) : null}
            </div>
            {kinds.length > 1 ? (
              <div className="sl-chips" role="radiogroup" aria-label={t('sell.kinds', 'النوع')}>
                {(['all', ...kinds] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={shownKind === option}
                    className="sl-chip"
                    data-kind={option === 'all' ? undefined : option}
                    onClick={() => {
                      sound.click();
                      setKind(option);
                    }}
                    data-action="sale-kind"
                  >
                    {option === 'all' ? t('sell.kind.all', 'الكلّ') : kindChipLabel(option)}
                  </button>
                ))}
              </div>
            ) : null}
        </div>
      ) : null}

      {restored && draft.lines.length > 0 ? (
        <div className="sl-restored" role="status" data-action="sale-restored">
          <span>{t('sell.restored', 'فاتورة محفوظة على الجهاز، كما تركتها.')}</span>
          <button type="button" className="sl-link" onClick={startOver} data-action="sale-start-over">
            {t('sell.restart', 'ابدأ من جديد')}
          </button>
        </div>
      ) : null}
      {notice ? (
        <div data-action="sale-notice">
          <Notice tone="info" title={notice} />
        </div>
      ) : null}
      {failure && top !== 'pay' ? (
        <div data-action="sale-failure">
          <Notice tone="danger" title={failureText(failure)} />
        </div>
      ) : null}
      {scanNote ? (
        <p role="alert" className="sl-alert" data-action="sale-scan-note">
          {scanNote}
        </p>
      ) : null}

      {stores.error ? (
        <LoadFailed what={t('invoice.stores.what', 'مخازن البيع')} error={stores.error} onRetry={stores.retry} />
      ) : !stores.data ? (
        <p role="status" className="sl-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : storeRows.length === 0 ? (
        <Notice tone="info" title={t('invoice.stores.none', 'لا مخزن في نطاقك يُباع منه.')} />
      ) : !warehouseId ? (
        <section className="sl-pick-store" data-action="sale-store-section">
          <h2 className="sl-h2">{t('invoice.store', 'من أيّ مخزن تبيع؟')}</h2>
          <div className="sl-store-list">
            {storeRows.map((row) => (
              <button key={row.id} type="button" className="sl-option" onClick={() => pickStore(row.id)} data-action="sale-store-option" data-store={row.id}>
                <Store aria-hidden="true" className="sl-icon" />
                <span>{row.name}</span>
              </button>
            ))}
          </div>
          <p className="sl-muted">{t('invoice.store.hint', 'فاتورة واحدة لكلّ مخزن؛ ما في مخزن آخر يُباع بفاتورة ثانية.')}</p>
        </section>
      ) : catalogState.error && !catalog ? (
        <LoadFailed what={t('invoice.catalog.what', 'موادّ المخزن')} error={catalogState.error} onRetry={rereadCatalog} />
      ) : !catalog ? (
        <ul className="sl-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <li key={n} className="sl-cell">
              <div className="sl-card sl-ghost" />
            </li>
          ))}
        </ul>
      ) : visible.length ? (
        <ul className="sl-grid" data-action="sale-items">
          {visible.map((item) => {
            const line = lastLineOf(item.id);
            const unit = line ? (unitsOf(item).find((option) => option.unitId === line.unitId) ?? unitOf(item)) : unitOf(item);
            return (
              <ItemCard
                key={item.id}
                item={item}
                line={line}
                unit={unit}
                others={draft.lines.filter((other) => other.itemId === item.id).length - 1}
                full={draft.lines.length >= MAX_LINES}
                onAdd={() => {
                  sound.click();
                  addItem(item, 'tap');
                }}
                onStep={(delta) => {
                  sound.click();
                  if (line) stepLine(line.lineId, delta);
                }}
                onOpen={() => {
                  sound.click();
                  if (line) openLine(line.lineId);
                }}
              />
            );
          })}
        </ul>
      ) : (
        <p className="sl-empty" data-action="sale-items-none">
          {needle
            ? t('invoice.items.none_here', 'لا مادّة باسم «{name}» تُباع من «{store}».', { name: search.trim(), store: storeName })
            : t('invoice.items.empty', 'لا مادّة تُباع من هذا المخزن الآن؛ اشترِ أوّلاً أو أنتج.')}
        </p>
      )}

      <div className="sl-bar-space" aria-hidden="true" />
      <div className="sl-bar" data-action="sale-totals-bar">
        {draft.lines.length === 0 ? (
          <p className="sl-bar-empty" data-action="sale-bar-empty">
            {warehouseId ? t('sell.bar.empty', 'اختر موادّ الفاتورة') : t('sell.bar.no_store', 'اختر المخزن ثمّ موادّ الفاتورة')}
          </p>
        ) : (
          <>
            <button type="button" className="sl-bar-cart" onClick={() => openSheet('cart')} data-action="open-cart" aria-label={t('sell.bar.open', 'افتح الفاتورة: {items}', { items: linesText(items) })}>
              <span className="sl-cart-icon" aria-hidden="true">
                <ShoppingBasket className="sl-icon" />
                <span key={items} className="sl-count">
                  {fmtInt(items)}
                </span>
              </span>
              <span className="sl-bar-text">
                <span className="sl-bar-items">{linesText(items)}</span>
                <span className="sl-bar-total" data-action="sale-bar-total">
                  {math.nets === null ? t('file.none', '—') : dinars(math.total)}
                  {missingPrice ? <span className="sl-bar-warn">{t('sell.bar.missing_price', ' · سعر ناقص')}</span> : null}
                </span>
              </span>
            </button>
            <button type="button" className="sl-primary sl-next" onClick={() => openSheet('pay')} data-action="sale-next">
              {t('sell.next', 'التالي: الدفع')}
            </button>
          </>
        )}
      </div>

      {nav.stack.includes('store') && storeRows.length > 0 ? (
        <StoreSheet level={nav.stack.lastIndexOf('store')} rows={storeRows} current={warehouseId} onPick={pickStore} onClose={closeSheet} />
      ) : null}
      {nav.stack.includes('scan') && supportsCamera ? (
        <ScanSheet
          level={nav.stack.lastIndexOf('scan')}
          onClose={closeSheet}
          onCode={(code) => {
            closeSheet();
            scanCode(code);
          }}
        />
      ) : null}
      {nav.stack.includes('cart') ? (
        <CartSheet
          level={nav.stack.lastIndexOf('cart')}
          rows={parsed}
          math={math}
          storeName={storeName}
          draft={draft}
          today={today}
          tried={tried}
          shown={shown}
          moreOpen={nav.more}
          previewRows={previewRows}
          onClose={closeSheet}
          onOpenLine={(lineId) => openLine(lineId)}
          onStep={stepLine}
          onRemove={removeLine}
          onSet={set}
          onNext={() => openSheet('pay', {}, true)}
        />
      ) : null}
      {nav.stack.includes('pay') ? (
        <PaySheet
          level={nav.stack.lastIndexOf('pay')}
          math={math}
          draft={draft}
          walkIn={walkIn}
          payKind={payKind}
          legs={legs}
          legErrors={legErrors}
          boxes={boxes}
          boxesFailed={wantsBoxes && boxState.error ? boxState.error : null}
          onBoxesRetry={boxState.retry}
          cashBox={cashBox}
          paid={paid}
          debt={debt}
          shown={shown}
          tried={tried}
          recent={memory.recent}
          canCreateParty={canCreateParty}
          padTarget={padTarget}
          padFresh={padFresh}
          focusRequest={focusRequest}
          busy={busy}
          online={online}
          saveText={label}
          blockedText={blockedText}
          failure={failure ? failureText(failure) : null}
          lines={draft.lines.length}
          onClose={closeSheet}
          onSet={set}
          onPay={choosePay}
          onAddLeg={addLeg}
          onRemoveLeg={removeLeg}
          onPad={(target, fresh) => {
            setPadTarget(target);
            setPadFresh(fresh);
          }}
          onFix={() => goFix(problems[0])}
          onSave={() => void save()}
        />
      ) : null}
      {nav.stack.includes('line') && lineRow ? (
        <LineSheet
          key={lineRow.line.lineId}
          level={nav.stack.lastIndexOf('line')}
          row={lineRow}
          index={parsed.indexOf(lineRow)}
          gross={math.gross[parsed.indexOf(lineRow)] ?? 0n}
          units={lineRow.item ? unitChipsOf(lineRow.item) : []}
          stock={lineRow.item && lineRow.unit ? stockText(lineRow.item, lineRow.unit) : null}
          usual={usualPrice(lineRow.line)}
          tried={tried}
          tab={nav.tab}
          focusError={nav.focus}
          canAddAnother={draft.lines.length < MAX_LINES && lineRow.item !== null}
          onClose={closeSheet}
          onUnit={(unitId) => changeUnit(lineRow.line, unitId)}
          onField={(field, text) => setLine(lineRow.line.lineId, field === 'price' ? { price: text, suggestedFrom: null } : { [field]: text })}
          onUsual={() => {
            const usual = usualPrice(lineRow.line);
            const item = byItem.get(lineRow.line.itemId);
            if (usual !== null && item) setLine(lineRow.line.lineId, { price: inputMoney(usual), suggestedFrom: item.sellPrice });
          }}
          onRemove={() => {
            closeSheet();
            removeLine(lineRow.line.lineId);
          }}
          onAddAnother={() => addAnother(lineRow.line.lineId)}
        />
      ) : null}

      {snack ? (
        <Snackbar
          snack={snack}
          onUndo={() => {
            snack.undo();
            setSnack(null);
          }}
        />
      ) : null}

      {/* إقرار الأسعار المتغيّرة (المهارة 11) */}
      {priceCheck ? (
        <Dialog
          open
          onClose={() => setPriceCheck(null)}
          title={t('invoice.prices.title', 'تغيّرت أسعار البيع منذ فتحت الفاتورة')}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  const changes = priceCheck;
                  setPriceCheck(null);
                  // أبقِ أسعار الفاتورة كما هي: يُقرّ البائع ما كتبه النظام سابقاً، فلا يُسأل عنه ثانيةً، ثمّ يُحفظ.
                  setDraft((current) => ({ ...current, lines: current.lines.map((line) => { const change = changes.find((c) => c.lineId === line.lineId); return change ? { ...line, suggestedFrom: change.after } : line; }) }));
                  const pending = requestNow();
                  if (pending) proceed(pending);
                }}
                data-action="prices-keep"
              >
                {t('invoice.prices.keep', 'أبقِ أسعار الفاتورة واحفظ')}
              </Button>
              <Button
                onClick={() => {
                  const changes = priceCheck;
                  setPriceCheck(null);
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((line) => {
                      const change = changes.find((c) => c.lineId === line.lineId);
                      if (!change) return line;
                      return change.after === null ? { ...line, suggestedFrom: null } : { ...line, price: inputMoney(unitPriceOf(change.after, change.factor)), suggestedFrom: change.after };
                    }),
                  }));
                  setNotice(t('invoice.prices.updated', 'حُدّثت الأسعار في الفاتورة؛ راجع المجموع ثمّ احفظ.'));
                  setStop(t('invoice.prices.updated', 'حُدّثت الأسعار في الفاتورة؛ راجع المجموع ثمّ احفظ.'));
                }}
                data-action="prices-update"
              >
                {t('invoice.prices.update', 'اعتمد الأسعار الجديدة')}
              </Button>
            </div>
          }
        >
          <ul className="flex flex-col gap-2 text-sm" data-action="prices-changes">
            {priceCheck.map((change) => (
              <li key={change.lineId}>
                {change.after === null
                  ? t('invoice.prices.removed', '«{name}»: كان {before} لكل {unit}، ولم يعد له سعر بيع.', { name: change.name, unit: change.unit, before: dinars(unitPriceOf(change.before, change.factor)) })
                  : t('invoice.prices.changed', '«{name}»: كان {before} لكل {unit}، وصار {after}.', {
                      name: change.name,
                      unit: change.unit,
                      before: dinars(unitPriceOf(change.before, change.factor)),
                      after: dinars(unitPriceOf(change.after, change.factor)),
                    })}
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}

      {/* التسليم بلا مقابل يُسأل عنه صراحةً */}
      {askFree ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('sale.free.title', 'تسليم بلا مقابل؟')}
          consequence={t('invoice.free.consequence', 'صافي الفاتورة صفر: تخرج {lines} من «{store}» بلا قبض ولا دين، وتخرج كلفتها من المخزن.', { lines: linesText(askFree.request.lines.length), store: askFree.summary.warehouseName })}
          confirmLabel={t('sale.free.confirm', 'سلّم بلا مقابل')}
          action="confirm-free-invoice"
          onCancel={() => setAskFree(null)}
          onConfirm={() => {
            const pending = askFree;
            setAskFree(null);
            void send(pending, false);
          }}
        />
      ) : null}

      {/* تغيير المخزن والسلّة فيها موادّ */}
      {switchTo !== null ? (
        <ConfirmDialog
          open
          title={t('invoice.store.switch.title', 'تغيير المخزن؟')}
          consequence={t('invoice.store.switch.body', 'الفاتورة من مخزن واحد: تُفرَّغ سطورها ({lines}) وتُختار الموادّ من المخزن الجديد.', { lines: linesText(draft.lines.length) })}
          confirmLabel={t('invoice.store.switch.confirm', 'غيّر المخزن وفرّغ السطور')}
          action="confirm-store-switch"
          onCancel={() => {
            if (switchTo.fromLink) setSeeded(true);
            setSwitchTo(null);
          }}
          onConfirm={() => {
            const next = switchTo.store;
            setSwitchTo(null);
            setOverride(null);
            set({ warehouseId: next, lines: [] });
            remember({ store: next });
            if (nav.stack.at(-1) === 'store') closeSheet();
          }}
        />
      ) : null}
    </div>
  );
}

export default function SaleCheckoutPage() {
  const [params] = useSearchParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const back = checkoutBack(params.get('back'));
  if (!workspace) {
    return (
      <p role="status" className="py-6 text-center text-sm text-ink-muted">
        {t('page.loading', 'جارٍ الفتح…')}
      </p>
    );
  }
  if (!can(workspace.role, 'sale.record')) {
    return (
      <div className="flex flex-col gap-4">
        <Link to={back} className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="back">
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          {checkoutBackLabel(back)}
        </Link>
        <Notice tone="info" title={t('invoice.forbidden', 'دورك لا يبيع: الفاتورة يحفظها المالك والمدير والمحاسب وأمين المخزن.')} />
      </div>
    );
  }
  const pendingKey = salePendingKey(workspace.userId, workspace.orgId);
  return (
    <Checkout
      key={pendingKey}
      pendingKey={pendingKey}
      userId={workspace.userId}
      orgId={workspace.orgId}
      canCreateParty={can(workspace.role, 'party.create')}
      back={back}
      itemParam={params.get('item')}
      storeParam={params.get('store')}
    />
  );
}
