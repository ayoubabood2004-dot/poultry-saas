import { ArrowRight, ChevronDown, ScanLine, Search, Store } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from 'react';
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
import { MILLI_PER_UNIT, type Fils, type Milli } from '../../domain/money';
import { normalizeCode, searchable, toWesternDigits } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { baseQtyOf, convertUnitPrice, invoiceMath, unitPriceOf } from '../../domain/saleInvoice';
import { ITEM_KINDS, type ItemKind, type WarehouseKind } from '../../domain/stores';
import { parseQty } from '../../domain/units';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtMilli } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { useDirtyForm } from '../../lib/pwa/dirty';
import * as inventory from '../../lib/repo/inventory';
import type { StoreCard, StoresOverview } from '../../lib/repo/inventory';
import * as purchasing from '../../lib/repo/purchasing';
import {
  decodePending,
  encodePending,
  loadSaleCatalog,
  loadSaleInvoice,
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
import { clearSaleDraft, saleDraftKey } from './saleDraft';
import { checkoutBack, checkoutBackLabel, dinars, inputMoney, linesText, moneyText, unitQtyText } from './saleParts';
import sellStyle from './sell.css?raw';
import { CartIcon, composing, focusesValue, keepFocus, KindMark, kindChipLabel, markScanEnter, RUN_GAP_MS, secondEnter, SNACK_MS, Snackbar, type Snack } from './sellKit';
import { canStore, postedKey, postedSnapshot, readPosted, readSaleDraftRaw, readSellMemory, rememberPosted, rememberSell, sellMemoryKey, writeSaleDraft } from './sellMemory';
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
  qtyInUnit,
  qtyText,
  restoreBody,
  shortUnit,
  steppedQty,
  stockText,
  unitChipsOf,
  unitsOf,
  usedBase,
  type CartLine,
  type Draft,
  type Ids,
  type Leg,
  type ParsedLine,
  type PayKind,
} from './sellModel';
import { CartSheet, LineSheet, PaySheet, ScanSheet, StoreSheet, type LineTab, type PadTarget, type PreviewRow, type Problem, type Where } from './SellSheets';

export { parseLines, stockText, unitsOf } from './sellModel';

// «بيع» (/sales/new، عقد 0033 «ب»، وتصميم المبيعات من جديد 2026-11-18 §١–٥: «شاشة كاونتر لا استمارة»). ما يراه البائع أوّلاً الموادّ بطاقاتٍ بعمودين (الأكثر
// بيعاً هنا أوّلاً)، ولمس البطاقة يضيف واحداً بوحدتها الافتراضية فتصير عدّاداً؛ والبحث الواحد بالاسم والرمز (والرمز الكامل يضيف، والكاميرا حيث يدعمها
// المتصفّح)؛ والشريط الثابت يحمل المجموع و«التالي: الدفع». ثمّ ثلاث أوراق سفلية تُغلق بالرجوع: السلّة، والسطر (الوحدة والكمية والسعر والخصم بلوحة أرقام
// التطبيق)، والدفع («لمن؟» ثمّ نقداً كلّه أو ديناً كلّه أو جزءاً الآن بصناديقه، والنتيجة جملةً، والحفظ بزرّ يسمّيها). الافتراض بقول المالك: الزبون النقديّ
// يدفع كلّه من آخر صندوق، والزبون باسمه بالدين كلّه؛ والمخزن والصندوق والوحدة والزبائن الأخيرة تُتذكَّر لكلّ مستخدم ومنشأة.
// السلوك المحفوظ كما هو (مراجعة 0033 C1–C11): المعاينة مرآة الخادم (domain/saleInvoice) والخادم يقرّر (record_sale_v2)؛ وقبل الحفظ تُقرأ الأسعار والمتاح من
// جديد، وما تغيّر من سعر اقترحه النظام أو حجم وحدة يُقرّ؛ والطلب يُحفظ خارج المكوّن قبل أن يخرج (sessionStorage، ومع الفاتورة المفتوحة في localStorage
// فإغلاق التبويب لا يضيّعه)، فالنتيجة المجهولة تجمّد الشاشة و«أعد المحاولة» ترسله حرفاً، و«المرجع أو المعرّف مستعمل» يقرأ الفاتورة بمعرّفها قبل أن
// يُعدّ رفضاً، والرفض الأكيد يعيده إلى الخانات بمرجع جديد. والجديد: الفاتورة المفتوحة تُحفظ في الجهاز بعد كلّ تغيير وتعود (saleDraft)، والحذف بـ«تراجع» لا
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

/**
 * رفوض تقول إنّ المرجع أو معرّف الفاتورة استُعمل: ربّما حُفظت هذه الفاتورة نفسها بإرسال سابق ضاع جوابه (مراجعة البيع S1)، فتُقرأ الفاتورة بمعرّفها قبل
 * أن يُعدّ الرفض أكيداً؛ وجودها يعني أنّها حُفظت.
 */
const MAYBE_SAVED = new Set(['ref_reused', 'id_conflict']);

/** مهلة الكتابة قبل أن يُعدّ رمز كامل مسحاً (مراجعة البيع S5): الماسح يكتب حرفاً كلّ بضع أجزاء من الثانية، فرمز طويل يمرّ برمز أقصر قبل أن يكتمل. */
const CODE_PAUSE_MS = 150;
/** موجّه الشاشة: سكون بعد آخر حرف بلا Enter، فما تجمّع رمزٌ من موادّ المخزن (ماسح بلا Enter) أو كتابة إنسان تذهب إلى البحث. */
const ROUTER_SILENCE_MS = 300;

/** خانة تكتب بنفسها (حقل، أو قيمة لوحة الأرقام المركَّزة): موجّه الشاشة لا يأخذ مفاتيحها. */
function typesItself(target: EventTarget | null): boolean {
  const node = target as { localName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null;
  if (!node) return false;
  return node.localName === 'input' || node.localName === 'textarea' || node.localName === 'select' || node.isContentEditable === true || node.getAttribute?.('data-pad-display') === 'yes';
}

/** داخل نافذة ليست ورقة من أوراق البيع (إقرار الأسعار، تأكيد): مفاتيحها لها. */
function inOtherDialog(target: EventTarget | null): boolean {
  for (let node = target as { getAttribute?: (name: string) => string | null; parentNode?: unknown } | null; node; node = node.parentNode as typeof node) {
    if (node.getAttribute?.('role') === 'dialog') return !(node.getAttribute('class') ?? '').split(' ').includes('sl-sheet');
  }
  return false;
}

/** اشتراك في تغيّر التخزين من نافذة أخرى (useSyncExternalStore). */
function onStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

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
export function saveLabel(lines: number, total: Fils, paid: Fils, state: 'ok' | 'lines' | 'money' | 'party' = 'ok'): string {
  if (lines === 0) return t('invoice.save.empty', 'احفظ الفاتورة');
  const vars = { lines: linesText(lines), total: moneyText(total), debt: moneyText(total - paid) };
  // الدين بلا زبون، أو اسم كُتب ولم يُختر (مراجعة التصميم D1 وD17): الزرّ يقول ما يلزم قبل الحفظ، ولمسه يفتح «لمن؟».
  if (state === 'party') return t('sell.save.party', 'اختر الزبون أوّلاً');
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

/**
 * ما تغيّر بين فتح الفاتورة والحفظ ويُقرّه البائع: سعر بيع اقترحه النظام (before/after لوحدة الأساس)، أو حجم الوحدة نفسها (مراجعة البيع S12: كيس صار 25
 * كغم بعد أن كان 50، فسعر الكيس المكتوب صار ضعف سعر الكيلو).
 */
type PriceChange =
  | { kind: 'price'; lineId: string; name: string; unit: string; factor: bigint; before: Fils; after: Fils | null }
  | { kind: 'size'; lineId: string; name: string; unit: string; baseUnit: CatalogItem['baseUnit']; from: bigint; to: bigint; price: Fils; next: Fils; sellPrice: Fils | null };

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
  /** فُتحت الورقة العليا من لوحة المفاتيح (Enter أو Space): قيمة لوحة أرقامها مركَّزة فيُكتب فيها فوراً. */
  kbd: boolean;
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
    kbd: sell?.kbd === true,
  };
}

// ─── البطاقة ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface CardProps {
  item: CatalogItem;
  /** السطر الذي يعدّه العدّاد (آخر سطر للمادّة)، أو null. */
  line: CartLine | null;
  /** وحدة السعر على البطاقة (الافتراضية). */
  unit: CatalogUnit;
  /** وحدة السطر، أو null حين غابت من وحدات المادّة بعد قراءة جديدة (مراجعة البيع S10: لا يُعدّ السطر بالكيس وهو بوحدة غابت). */
  lineUnit: CatalogUnit | null;
  /** ما أخذته سطور المادّة كلّها من المتاح (بوحدة الأساس). */
  used: Milli;
  /** سطور أخرى للمادّة نفسها. */
  others: number;
  full: boolean;
  /** الحفظ جارٍ: لا تتغيّر الفاتورة تحت الطلب (مراجعة البيع S8). */
  locked: boolean;
  onAdd: () => void;
  onStep: (delta: 1 | -1) => void;
  /** byKeyboard: Enter أو Space على العدّاد. */
  onOpen: (byKeyboard: boolean) => void;
}

/**
 * سطر المتاح على البطاقة: قبل الإضافة «عندك …»، وبعدها «يبقى …» بوحدة السطر، و«عندك … فقط» حين لا تتّسع وحدة أخرى أو زاد ما كُتب على المتاح
 * (مراجعة التصميم D3: كان «عندك» يختفي حين تدخل المادّة الفاتورة، والزيادة تمرّ على المتاح بلا إشارة حتى «احفظ»).
 */
function cardStock(item: CatalogItem, line: CartLine | null, unit: CatalogUnit, lineUnit: CatalogUnit | null, used: Milli): { text: string; state?: 'out' | 'expired' | 'limit' | 'over' } {
  const out = item.available <= 0n;
  if (!line) {
    if (out && item.expired > 0n) return { text: t('invoice.item.expired', 'منتهية الصلاحية: {qty}', { qty: baseQty(item.expired, item.baseUnit) }), state: 'expired' };
    if (out) return { text: t('invoice.item.out', 'نفد من هذا المخزن'), state: 'out' };
    return { text: t('sell.card.stock', 'عندك {qty}', { qty: stockText(item, unit) }) };
  }
  const shown = lineUnit ?? unit;
  const left = item.available - used;
  if (left < 0n) return { text: t('sell.card.only', 'عندك {qty} فقط', { qty: stockText(item, shown) }), state: 'over' };
  if (left < baseQtyOf(MILLI_PER_UNIT, shown.factor)) return { text: t('sell.card.only', 'عندك {qty} فقط', { qty: stockText(item, shown) }), state: 'limit' };
  return { text: t('sell.card.left', 'يبقى {qty}', { qty: qtyInUnit(left, item, shown) }) };
}

/** لمسة إصبع لا تنقل التركيز إلى الزرّ (الفأرة ولوحة المفاتيح كما هما). */
const touchKeepsFocus = (event: { pointerType: string; preventDefault: () => void }) => {
  if (event.pointerType === 'touch') keepFocus(event);
};

function ItemCard({ item, line, unit, lineUnit, used, others, full, locked, onAdd, onStep, onOpen }: CardProps) {
  const mainRef = useRef<HTMLButtonElement>(null);
  const out = item.available <= 0n;
  const price = item.sellPrice === null ? null : unitPriceOf(item.sellPrice, unit.factor);
  const qty = line ? line.qty : '';
  const amount = parseQtyOr(qty);
  // وحدة غابت: الكمية بلا اسم وحدة و«اختر الوحدة» (لا يُقال «2 كيس» عن طنّين).
  const qtyShown = !line || !qty.trim() ? '' : lineUnit ? unitQtyText(amount, shortUnit(lineUnit.label)) : t('sell.card.unit_gone', '{qty} — اختر الوحدة', { qty: fmtMilli(amount) });
  const stock = cardStock(item, line, unit, lineUnit, used);
  return (
    <li className="sl-cell">
      <div className="sl-card" data-kind={item.kind} data-in={line ? 'yes' : undefined} data-out={out ? 'yes' : undefined}>
        {/* اللمس لا يترك البطاقة مركَّزة: Enter ثانٍ من ماسح (CR LF) لا يضغطها فيزيد واحداً (X3). */}
        <button
          ref={mainRef}
          type="button"
          className="sl-card-main"
          disabled={locked || (out && !line) || (full && !line)}
          onPointerDown={touchKeepsFocus}
          onClick={onAdd}
          data-action="sale-item-card"
          data-item={item.id}
        >
          <span className="sl-card-top">
            <span className="sl-mark">
              <KindMark kind={item.kind} />
              {line ? (
                <span key={qty} className="sl-badge" data-action="card-badge">
                  {qtyShown === '' ? fmtInt(0) : fmtMilli(amount)}
                </span>
              ) : null}
            </span>
            <span className="sl-card-kind">{kindChipLabel(item.kind)}</span>
          </span>
          <span className="sl-card-name">{item.name}</span>
          <span className="sl-card-price">
            {price === null ? t('sell.card.no_price', 'بلا سعر بيع') : t('sell.card.price', '{price} / {unit}', { price: moneyText(price), unit: unit.label })}
          </span>
          <span className="sl-card-stock" data-state={stock.state} data-action="card-stock">
            {stock.text}
          </span>
          {/* مكان العدّاد محجوز في كلّ بطاقة: أوّل لمسة لا تطيل البطاقة ولا تدفع الصفّ التالي (مراجعة التصميم D20). */}
          {line ? null : (
            <span className="sl-card-add" aria-hidden="true">
              {out ? '' : t('sell.card.add', '+ أضف')}
            </span>
          )}
        </button>
        {line ? (
          <div className="sl-stepper" data-action="card-stepper">
            <button
              type="button"
              className="sl-step"
              disabled={locked}
              aria-label={t('sell.step.minus', 'أنقص واحداً من «{name}»', { name: item.name })}
              onPointerDown={touchKeepsFocus}
              onClick={() => {
                // النقص إلى صفر يحذف السطر فيزول الزرّ المركَّز: التركيز إلى البطاقة نفسها لا إلى الصفحة (إتاحة).
                if (steppedQty(qty, -1) === null) mainRef.current?.focus();
                onStep(-1);
              }}
              data-action="card-minus"
            >
              <span aria-hidden="true">−</span>
            </button>
            <button type="button" className="sl-step-qty" disabled={locked} onClick={(event) => onOpen(focusesValue(event))} data-action="card-qty" aria-label={t('sell.step.open', '{qty} — غيّر الكمية أو السعر', { qty: qtyShown })}>
              {qtyShown}
              {others > 0 ? <span className="sl-step-more">{t('sell.card.more_lines', '+ سطر آخر')}</span> : null}
            </button>
            <button
              type="button"
              className="sl-step"
              disabled={locked}
              aria-label={t('sell.step.plus', 'زِد واحداً من «{name}»', { name: item.name })}
              onPointerDown={touchKeepsFocus}
              onClick={() => onStep(1)}
              data-action="card-plus"
            >
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

/** معرّفا فاتورة جديدة: مرجع الطلب ومعرّف الفاتورة. */
const newIds = (): Ids => ({ ref: crypto.randomUUID(), saleId: crypto.randomUUID() });

/** المكتوب من لصق (لا من ماسح يكتب حرفاً حرفاً): الرمز الكامل يُضاف فوراً. */
const pastedInto = (event: ChangeEvent<HTMLInputElement>): boolean => (event.nativeEvent as { inputType?: string } | undefined)?.inputType === 'insertFromPaste';

/** اسم زرّ «صحّح» بما سيفتحه (مراجعة التصميم D16: «صحّح الكمية» يفتح سطرها). */
function fixLabelOf(where: Where): string {
  switch (where.kind) {
    case 'line':
      return where.tab === 'qty' ? t('sell.fix.qty', 'صحّح الكمية') : where.tab === 'price' ? t('sell.fix.price', 'صحّح السعر') : t('sell.fix.discount', 'صحّح الخصم');
    case 'cart':
      return t('sell.fix.cart', 'افتح الفاتورة');
    case 'more':
      return t('sell.fix.more', 'افتح «المزيد»');
    case 'store':
      return t('sell.fix.store', 'اختر المخزن');
    case 'discount':
      return t('sell.fix.discount', 'صحّح الخصم');
    case 'party':
      return t('sell.fix.party', 'اختر الزبون');
    case 'legs':
      return t('sell.fix.legs', 'صحّح الدفع');
  }
}

function Checkout({ pendingKey, userId, orgId, canCreateParty, back, itemParam, storeParam }: CheckoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const online = useStore(onlineStore);
  const stores = useLoad(inventory.loadStoresOverview, 'stores');
  const memoryKey = sellMemoryKey(userId, orgId);
  const postedName = postedKey(userId, orgId);
  const [memory, setMemory] = useState(() => readSellMemory(memoryKey));
  const remember = (patch: Parameters<typeof rememberSell>[1]) => {
    rememberSell(memoryKey, patch);
    setMemory(readSellMemory(memoryKey));
  };
  // الفاتورة المفتوحة على الجهاز (تعود كما تُركت، بمعرّفيها، ومعها طلبها إن خرج ولم يُعرف جوابه). ومرجعها حُفظ من نافذة أخرى: لا تعود (S2).
  const [initial] = useState(() => {
    const raw = readSaleDraftRaw(userId, orgId) as { v?: unknown; body?: unknown; pending?: unknown } | null;
    const body = raw && raw.v === 1 ? restoreBody(raw.body) : null;
    if (!raw || !body) return null;
    if (readPosted(postedName).includes(body.ids.ref)) return { ...body, sold: true, pending: null };
    const pending = typeof raw.pending === 'string' ? decodePending(raw.pending) : null;
    return { ...body, sold: false, pending: pending !== null && pending.request.clientRef === body.ids.ref ? pending : null };
  });
  const kept = initial !== null && !initial.sold ? initial : null;
  const [storageWorks] = useState(canStore);
  const [draft, setDraft] = useState<Draft>(() => kept?.draft ?? blankDraft());
  const [ids, setIds] = useState<Ids>(() => kept?.ids ?? newIds());
  const [restored, setRestored] = useState(() => (kept?.draft.lines.length ?? 0) > 0 && kept?.pending === null);
  // ورقة محفوظة في التاريخ وفاتورة فارغة (التقدّم «إلى الأمام» إلى الشاشة بعد حفظ فاتورة، S9): لا تعود ورقة الدفع على فاتورة لا شيء فيها.
  const [staleKey] = useState(() => ((kept?.draft.lines.length ?? 0) === 0 && navOf(location.state).stack.some((name) => name !== 'store' && name !== 'scan') ? location.key : null));
  const rawNav = navOf(location.state);
  const nav: SellNav = staleKey !== null && location.key === staleKey ? { ...rawNav, stack: [] } : rawNav;
  const [frozen, setFrozen] = useState<PendingSale | null>(null);
  // مجمَّدة على طلب أرسلته نافذة أخرى (لا هذه): تتبع ما يصير إليه هناك (R5).
  const [frozenOther, setFrozenOther] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unreached, setUnreached] = useState(false);
  const [notice, setNotice] = useState<string | null>(() => (initial?.sold ? t('sell.sold_elsewhere', 'حُفظت الفاتورة التي كانت مفتوحة هنا من نافذة أخرى؛ هذه فاتورة جديدة.') : null));
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
  // خانات السطور التي كتب فيها البائع: خطؤها يظهر تحتها فوراً لا بعد «احفظ» وحده (مراجعة التصميم D4).
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  // ما كُتب في بحث «لمن؟» (هنا لا في الورقة: اسم كُتب ولم يُختر يمنع الحفظ ولو أُغلقت الورقة وفُتحت، D1).
  const [partyText, setPartyText] = useState('');
  // ما يُقال لقارئ الشاشة بعد لمس البطاقة (± وكميتها).
  const [said, setSaid] = useState('');
  // البحث وحده يلتصق بعد التمرير إلى أسفل (شرائح النوع تُطوى)، فالثابت أعلى الشاشة سطر واحد (D12).
  const [compact, setCompact] = useState(false);
  const deferred = useDeferredValue(search);
  const sending = useRef(false);
  const live = useRef(true);
  const leaving = useRef<string | null>(null);
  const codeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  // كيف فُتحت أوّل ورقة في الكومة (يقرّر أين يعود التركيز حين تُطوى كلّها).
  const openedBy = useRef<'keyboard' | 'touch' | 'scan'>('touch');
  // كتابة حُوّلت إلى البحث والأوراق تُطوى: يُركَّز البحث حين تُطوى.
  const searchNext = useRef(false);
  // آخر نسخة من الفاتورة المعروضة، لمن ينتظر جواباً (الحفظ بعد قراءة الأسعار).
  const latest = useRef<Draft>(draft);
  const idsNow = useRef<Ids>(ids);
  const navNow = useRef({ stack: nav.stack, key: location.key });
  useEffect(() => {
    latest.current = draft;
    idsNow.current = ids;
    navNow.current = { stack: nav.stack, key: location.key };
  });
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (codeTimer.current !== null) clearTimeout(codeTimer.current);
    };
  }, []);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCompact((current) => (current ? y > 40 : y > 140));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // مادّة من الرابط (?item=، «بِع» في ملفّ المادّة) تُضاف مرّة حين تُقرأ موادّ المخزن؛ لا بعد طلب مستعاد (سطوره تعود بالرفض الأكيد، مراجعة 0033 C7).
  const [seeded, setSeeded] = useState(itemParam === null);
  const [linkChecked, setLinkChecked] = useState(storeParam === null);
  // طلب معلَّق من فتح سابق (أو قبل إعادة التحميل، أو من الفاتورة المحفوظة بعد إغلاق التبويب، S1): تعود الشاشة مجمَّدة به. ضبط حالة من حالة أثناء الرسم
  // بشرط يتوقّف (مرّة لكلّ مفتاح).
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (restoredFor !== pendingKey) {
    setRestoredFor(pendingKey);
    const pending = readSalePending(pendingKey) ?? kept?.pending ?? null;
    setFrozen(pending);
    if (pending) setSeeded(true);
  }

  // فاتورة هذه النافذة حُفظت من نافذة أخرى (مرجعها في قائمة المحفوظ على الجهاز): لا تُكتب «فاتورة مفتوحة» ثانيةً بمرجع مستعمل، وتبدأ فاتورة جديدة (S2).
  const postedText = useSyncExternalStore(onStorage, () => postedSnapshot(postedName), () => '');
  if (!frozen && !busy && postedText.includes(`"${ids.ref}"`)) {
    setDraft(() => blankDraft(''));
    setIds(newIds);
    setRestored(false);
    setTried(false);
    setNotice(t('sell.sold_elsewhere', 'حُفظت الفاتورة التي كانت مفتوحة هنا من نافذة أخرى؛ هذه فاتورة جديدة.'));
  }
  // نافذة أخرى أرسلت هذه الفاتورة نفسها ولم يُعرف جوابها بعد: تتجمّد هنا بطلبها (إعادته آمنة)، فلا تُعدَّل وتُرسل بمرجعها. ثمّ تتبع ما يصير إليه هناك
  // (R5): حُفظ (مرجعه في قائمة المحفوظ) ← الفاتورة مكان الشاشة؛ ورُفض أو بُدئ غيره (الفاتورة المحفوظة بلا طلب أو بمرجع آخر) ← تعود إلى الخانات بما حُفظ.
  const otherTab = useRef<(event: StorageEvent) => void>(() => undefined);
  useEffect(() => {
    const listen = (event: StorageEvent) => otherTab.current(event);
    window.addEventListener('storage', listen);
    return () => window.removeEventListener('storage', listen);
  }, []);

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
  // فاتورة محفوظة من مخزن لم يعد في النطاق (S3): لا تبقى عالقة عليه بلا شريحة ولا قائمة ولا موادّ؛ يُختار مخزن، وتُقرأ سطورها على موادّه.
  if (stores.data && !frozen && draft.warehouseId !== '' && !storeRows.some((row) => row.id === draft.warehouseId)) {
    setDraft((current) => ({ ...current, warehouseId: '' }));
    if (draft.lines.length > 0) setNotice(t('sell.store.lost', 'المخزن الذي بدأت منه هذه الفاتورة لم يعد متاحاً؛ اختر مخزناً وراجع السطور عليه.'));
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

  // أثناء الحفظ لا تتغيّر الفاتورة تحت الطلب (S8): ما يُضاف بعد «احفظ» كان يضيع حين يمحو النجاح الفاتورة.
  const set = (patch: Partial<Draft>) => {
    if (!busy) setDraft((current) => ({ ...current, ...patch }));
  };
  const setLine = (lineId: string, patch: Partial<CartLine>) => {
    if (!busy) setDraft((current) => ({ ...current, lines: current.lines.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)) }));
  };
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
  // ما يُرى من أخطاء السطر قبل أوّل «احفظ»: ما كتبه البائع خطأً فوراً تحت خانته، والخصم الأكبر من السطر، والمتاح؛ والفارغ الذي لم يُلمس بعد «احفظ».
  const shownErrors = parsed.map((row, index): ParsedLine['errors'] => {
    if (tried) return row.errors;
    const on = (field: LineTab) => touched.has(`${row.line.lineId}:${field}`);
    return {
      item: row.errors.item,
      unit: row.errors.unit,
      qty: row.base !== null || on('qty') ? row.errors.qty : undefined,
      price: on('price') || row.price !== null ? row.errors.price : undefined,
      discount: on('discount') || math.overLines.includes(index) ? row.errors.discount : undefined,
    };
  });
  // سطر بلغ المتاح: «+» لا يزيده، والسلّة تقول ذلك على السطر نفسه (R7).
  const limits = parsed.map((row) => {
    if (!row.item || !row.unit || row.base === null) return null;
    return usedBase(parsed, row.item.id) + baseQtyOf(MILLI_PER_UNIT, row.unit.factor) > row.item.available ? t('sell.card.only', 'عندك {qty} فقط', { qty: stockText(row.item, row.unit) }) : null;
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
  // اسم كُتب في «لمن؟» ولم يُختر ولم يُضف (D1): كانت الفاتورة تُحفظ لزبون نقديّ والاسم يضيع بصمت.
  // ولو اختير زبون ثمّ كُتب غيره ولم يُختر (R3): كان الدين يُكتب على الأوّل والاسم الثاني يضيع.
  if (partyText.trim() !== '' && partyText.trim() !== (draft.party?.name ?? '')) {
    errors.party = t('sell.party.typed', 'لم تختر «{name}»: اختره من القائمة، أو أضفه زبوناً جديداً، أو امسح الاسم.', { name: partyText.trim() });
  } else if (!walkIn && !draft.party) errors.party = t('invoice.party.required', 'اختر الزبون، أو أضفه باسمه، أو اختر «زبون نقديّ» إن دفع المبلغ كلّه.');
  const legErrors = legs.map(({ leg, amount }, index) => {
    if (!leg.boxId) return boxes === null ? t('sell.boxes.unread', 'لم تُقرأ الصناديق بعد؛ انتظر لحظة أو أعد المحاولة.') : t('purchase.box.required', 'اختر الصندوق الذي دُفع منه.');
    // صندوق غاب من القائمة بعد قراءتها (أُرشف، أو فاتورة محفوظة من قبل): يُقال هنا ولا يُرسل (S11).
    if (boxes !== null && !boxList.some((box) => box.id === leg.boxId)) return t('sell.leg.box_gone', 'هذا الصندوق لم يعد فعّالاً؛ اختر صندوقاً آخر.');
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
  // المال لا يستقيم بعد: الزرّ والمجموع لا يقولان «مدفوعة» ولا ديناً سالباً (مراجعة 0033 C8)؛ والزبون أوّلاً حين يلزم (D17).
  const moneyState: 'ok' | 'lines' | 'money' | 'party' = lineProblems
    ? 'lines'
    : errors.party
      ? 'party'
      : errors.discount || errors.legs || errors.walk_in || math.nets === null || debt < 0n
        ? 'money'
        : 'ok';
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

  // الفاتورة المفتوحة تُحفظ في الجهاز بعد كلّ تغيير (وتُمحى فارغةً)؛ لا أثناء الإرسال ولا مجمَّدةً (الطلب معها هناك حتى يُعرف جوابه)، ولا بمرجع حُفظ.
  useEffect(() => {
    if (frozen || busy) return;
    if (isBlank(draft)) clearSaleDraft(userId, orgId);
    else if (!readPosted(postedName).includes(ids.ref)) writeSaleDraft(userId, orgId, { lines: itemCount(draft.lines), total: summaryTotal, storeId: draft.warehouseId || warehouseId }, draftBody(draft, ids));
  }, [draft, ids, frozen, busy, summaryTotal, warehouseId, userId, orgId, postedName]);

  // «تراجع» يختفي بعد ستّ ثوانٍ.
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack((current) => (current === snack ? null : current)), SNACK_MS);
    return () => clearTimeout(timer);
  }, [snack]);

  // ─── الأوراق ─────────────────────────────────────────────────────────────────────────────────────────────────
  const here = { pathname: location.pathname, search: location.search };
  const openSheet = (sheet: SheetName, extra: Partial<SellNav> = {}, replaceTop = false) => {
    // «تراجع» لا يبقى فوق لوحة أرقام ورقة جديدة (D6).
    setSnack(null);
    const stack = replaceTop ? [...nav.stack.slice(0, -1), sheet] : [...nav.stack, sheet];
    if (stack.length === 1) openedBy.current = extra.kbd === true ? 'keyboard' : 'touch';
    navigate(here, { replace: replaceTop, state: { sell: { ...nav, focus: false, kbd: false, ...extra, stack } } });
  };
  const closeSheet = () => {
    if (nav.stack.length === 0) return;
    if (location.key === 'default' || location.key === staleKey) navigate(here, { replace: true, state: { sell: { ...nav, focus: false, stack: nav.stack.slice(0, -1) } } });
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
  // الرجوع (زرّ الهاتف) أثناء الحفظ يطوي ورقة الدفع: تعود فوق الشاشة حتى يأتي الجواب، والشاشة تحتها مقفلة (S8).
  const payGone = busy && !frozen && !nav.stack.includes('pay');
  const navState = useRef(nav);
  useEffect(() => {
    navState.current = nav;
  });
  useEffect(() => {
    if (!payGone || leaving.current !== null) return;
    const current = navState.current;
    navigate({ pathname: location.pathname, search: location.search }, { state: { sell: { ...current, focus: false, stack: [...current.stack, 'pay'] } } });
  }, [payGone, navigate, location.pathname, location.search, location.key]);

  const openLine = (lineId: string, tab: LineTab = 'qty', focus = false, kbd = false) => openSheet('line', { line: lineId, tab, focus, kbd });
  /**
   * بعد أن تُطوى الأوراق كلّها: التركيز إلى البحث (أو إلى الشاشة في الأجهزة اللمسية، فلا تقوم لوحة النظام) حين فُتحت باللمس أو طواها مسح؛ وإلى ما
   * فتحها حين فُتحت من لوحة المفاتيح (الورقة تعيده). فلا يبقى زرّ العدّاد مركَّزاً يفتح Enter المسحِ التالي سطرَه (T5).
   */
  const focusHome = () => {
    const fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    (fine ? searchRef.current : screenRef.current)?.focus({ preventScroll: true });
  };
  const depth = nav.stack.length;
  const depthBefore = useRef(depth);
  useEffect(() => {
    const was = depthBefore.current;
    depthBefore.current = depth;
    if (was === 0 || depth > 0) return;
    if (searchNext.current) {
      searchNext.current = false;
      searchRef.current?.focus({ preventScroll: true });
    } else if (openedBy.current !== 'keyboard') focusHome();
  });
  /** كلّ الأوراق تُطوى (مسح الماسح والورقة مفتوحة: المادّة تُضاف والبائع على البطاقات). */
  const closeAll = () => {
    openedBy.current = 'scan';
    if (nav.stack.length === 0) return;
    if (location.key === 'default' || location.key === staleKey) navigate(here, { replace: true, state: { sell: { ...nav, focus: false, stack: [] } } });
    else navigate(-nav.stack.length);
  };
  /** الطلب المحفوظ مع الفاتورة المفتوحة على الجهاز (أرسلته هذه النافذة أو غيرها)، أو null. */
  const storedPending = (): PendingSale | null => {
    const raw = readSaleDraftRaw(userId, orgId) as { v?: unknown; pending?: unknown } | null;
    return raw && raw.v === 1 && typeof raw.pending === 'string' ? decodePending(raw.pending) : null;
  };
  useEffect(() => {
    otherTab.current = (event: StorageEvent) => {
      if ((event.key !== saleDraftKey(userId, orgId) && event.key !== postedName) || sending.current) return;
      if (frozen !== null && frozenOther) {
        const { request } = frozen;
        if (readPosted(postedName).includes(request.clientRef)) {
          // حُفظت هناك: لا «لا نعرف» هنا.
          setFrozen(null);
          setFrozenOther(false);
          setDraft(blankDraft(request.warehouseId));
          setIds(newIds());
          const query = new URLSearchParams({ done: '1' });
          if (back !== '/sales') query.set('back', back);
          leaveTo(`/sales/${request.saleId}?${query.toString()}`);
          return;
        }
        const still = storedPending();
        if (still !== null && still.request.clientRef === request.clientRef) return;
        // انتهى هناك بلا حفظ (رُفض فعادت خاناته بمرجع جديد، أو بُدئت فاتورة أخرى): هنا ما حُفظ على الجهاز كما هو.
        const raw = readSaleDraftRaw(userId, orgId) as { v?: unknown; body?: unknown } | null;
        const body = raw && raw.v === 1 ? restoreBody(raw.body) : null;
        setFrozen(null);
        setFrozenOther(false);
        setDraft(body?.draft ?? blankDraft(''));
        setIds(body?.ids ?? newIds());
        setNotice(t('sell.other_tab_unsaved', 'لم تُحفظ الفاتورة التي أُرسلت من نافذة أخرى؛ هي هنا كما تُركت لتراجعها.'));
        return;
      }
      if (frozen !== null || event.key !== saleDraftKey(userId, orgId)) return;
      const pending = storedPending();
      if (pending !== null && pending.request.clientRef === ids.ref) {
        setFrozen(pending);
        setFrozenOther(true);
      }
    };
  });

  // ─── الإرسال ─────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * الطلب الخارج يُحفظ مع الفاتورة المفتوحة في localStorage قبل أن يخرج (لا في sessionStorage وحدها): إغلاق التبويب أو التطبيق قبل الجواب يعيد الشاشة
   * مجمَّدةً بالطلب نفسه حرفاً (ويومه)، فلا تعود سلّةً تُعدَّل وتُرسل بمرجعها (S1).
   */
  const keepPending = (pending: PendingSale) => {
    const { request } = pending;
    const base = latest.current.lines.length > 0 ? latest.current : draftOf(pending, fmtDay(request.soldOn));
    writeSaleDraft(userId, orgId, { lines: itemCount(request.lines), total: pending.summary.total, storeId: request.warehouseId }, draftBody(base, { ref: request.clientRef, saleId: request.saleId }), encodePending(pending));
  };

  /** بعد رفض «المرجع أو المعرّف مستعمل»: الفاتورة بمعرّفها محفوظة؟ (doc_not_found وحده يقول لا؛ وغيره لا نعرف.) */
  const findSaved = async (saleId: string): Promise<{ kind: 'saved'; posted: boolean } | { kind: 'absent' } | { kind: 'unknown'; problem: unknown }> => {
    try {
      const invoice = await loadSaleInvoice(saleId);
      return { kind: 'saved', posted: invoice.status !== 'void' };
    } catch (problem) {
      return problem instanceof RejectedError && problem.code === 'doc_not_found' ? { kind: 'absent' } : { kind: 'unknown', problem };
    }
  };

  /** حُفظت (بجوابها، أو وُجدت بمعرّفها): تُمحى من الجهاز، ويُتذكَّر مرجعها (فلا تعود من نافذة أخرى)، والفاتورة مكان الشاشة. */
  const finish = (pending: PendingSale, saleId: string, savedText: string, posted: boolean, found: boolean) => {
    const { request } = pending;
    storeSalePending(pendingKey, null);
    rememberPosted(postedName, request.clientRef);
    clearSaleDraft(userId, orgId);
    remember({
      store: request.warehouseId,
      box: request.payments[0]?.cashAccountId,
      units: Object.fromEntries(request.lines.map((line) => [line.itemId, line.unitId])),
      party: request.partyId !== null && pending.summary.partyName ? { id: request.partyId, name: pending.summary.partyName } : undefined,
    });
    // حُفظت بإرسال سابق ضاع جوابه: ما سُجّل هو المرسَل أوّل مرّة، لا ما تغيّر بعده.
    if (found) toast({ tone: 'warning', title: t('sell.found_saved', 'هذه الفاتورة حُفظت من قبل كما أُرسلت أوّل مرّة؛ ما تغيّر فيها بعد ذلك لم يُحفظ.') });
    if (!live.current) {
      if (!found) toast({ tone: 'success', title: savedText });
      return;
    }
    sound.success();
    setFrozen(null);
    setDraft(blankDraft(request.warehouseId));
    setIds(newIds());
    setPartyText('');
    setTouched(new Set());
    // الفاتورة مكان الشاشة بحالة النجاح (?done=1)، ورجوعها إلى ما فُتحت منه الفاتورة الجديدة (مراجعة 0033 D9).
    const query = new URLSearchParams(posted ? { done: '1' } : {});
    if (back !== '/sales') query.set('back', back);
    const text = query.toString();
    leaveTo(`/sales/${saleId}${text ? `?${text}` : ''}`);
  };

  /** نداء record_sale_v2 بطلب محفوظ: الأوّل من الحفظ، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const send = async (pending: PendingSale, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFrozenOther(false);
    setSnack(null);
    setFailure(null);
    setUnreached(false);
    // الطلب محفوظ خارج المكوّن قبل أن يخرج: رجوع أو إعادة تحميل أو إغلاق قبل الجواب تعيد الشاشة مجمَّدة به.
    storeSalePending(pendingKey, pending);
    keepPending(pending);
    try {
      const saved = await recordSaleV2(pending.request);
      finish(pending, saved.saleId, doneText(saved), true, false);
    } catch (thrown) {
      let problem: unknown = thrown;
      let unknown = !surelyUnsaved(thrown) || (retrying && !(thrown instanceof RejectedError));
      let voided = false;
      // المرجع أو المعرّف مستعمل: ربّما هي هذه الفاتورة نفسها بإرسال ضاع جوابه (S1). تُقرأ بمعرّفها، ووجودها حفظ لا رفض.
      if (thrown instanceof RejectedError && MAYBE_SAVED.has(thrown.code)) {
        const found = await findSaved(pending.request.saleId);
        if (found.kind === 'saved' && found.posted) {
          finish(pending, pending.request.saleId, t('sell.found_saved_short', 'حُفظت الفاتورة.'), true, true);
          return;
        }
        // وُجدت ملغاة (R9): ليست «حُفظت»؛ رسالة الخادم كما هي («…ثمّ أُلغيت. سجّل فاتورة جديدة») والسلّة باقية بمعرّفات جديدة.
        if (found.kind === 'saved') {
          voided = true;
          // ref_reused لا يحمل سبب الإلغاء: يُقال بكلمات الخادم نفسها.
          if (thrown.code !== 'id_conflict') problem = new RejectedError('id_conflict', t('sell.found_void', 'سُجّلت هذه الفاتورة من قبل ثمّ أُلغيت. سجّل فاتورة جديدة.'));
        }
        if (found.kind === 'unknown') {
          unknown = true;
          problem = found.problem;
        }
      }
      if (unknown) {
        // لا نعرف إن حُفظت: الشاشة تتجمّد بطلبها، والإعادة وحدها ممكنة.
        setFrozen(pending);
        setUnreached(retrying && surelyUnsaved(problem));
        if (!live.current) toast({ tone: 'warning', title: t('invoice.unknown_away', 'لا نعرف إن حُفظت الفاتورة: افتح «فاتورة بيع جديدة» وأعد المحاولة؛ لن تُسجَّل مرّتين.') });
        return;
      }
      // جواب أكيد بلا فاتورة: ما أُرسل يعود إلى الخانات، والإرسال التالي بمرجع جديد (ومعرّفات جديدة بعد id_conflict).
      storeSalePending(pendingKey, null);
      const conflict = voided || (problem instanceof RejectedError && problem.code === 'id_conflict');
      const rotate = (base: Draft): Draft =>
        conflict ? { ...base, cashLegId: crypto.randomUUID(), lines: base.lines.map((line) => ({ ...line, lineId: crypto.randomUUID() })), legs: base.legs.map((leg) => ({ ...leg, legId: crypto.randomUUID() })) } : base;
      const nextIds: Ids = { ref: crypto.randomUUID(), saleId: conflict ? crypto.randomUUID() : pending.request.saleId };
      if (!live.current) {
        // الشاشة غادرت: الفاتورة المحفوظة على الجهاز بلا طلبها وبمرجعها الجديد، فتعود سلّةً تُصحَّح لا طلباً مجمَّداً.
        const base = rotate(latest.current.lines.length > 0 ? latest.current : draftOf(pending, fmtDay(pending.request.soldOn)));
        writeSaleDraft(userId, orgId, { lines: itemCount(base.lines), total: pending.summary.total, storeId: pending.request.warehouseId }, draftBody(base, nextIds));
        toast({ tone: 'danger', title: t('invoice.refused_away', 'لم تُحفظ الفاتورة.'), detail: failureText(problem) });
        return;
      }
      setFrozen(null);
      sound.warn();
      setDraft((current) => rotate(current.lines.length > 0 ? current : draftOf(pending, fmtDay(pending.request.soldOn))));
      setIds(nextIds);
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
  const goFix = (first: Problem | undefined, focusValue = false) => {
    if (!first) return;
    const { where } = first;
    // السطر يُفتح على خطئه؛ وقيمته تُركَّز حين ضُغط «احفظ» أو «صحّح» من لوحة المفاتيح أو بالفأرة، لا باللمس (V1).
    if (where.kind === 'line') openLine(where.lineId, where.tab, true, focusValue);
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
  const save = async (focusValue = false) => {
    setTried(true);
    setNotice(null);
    setStop(null);
    // «تراجع» لا يبقى ليعيد سطراً تحت طلب خارج (R4).
    setSnack(null);
    setPadTarget(null);
    if (frozen || busy || !online) return;
    if (blocked || !warehouseId) {
      sound.warn();
      goFix(problems[0], focusValue);
      return;
    }
    // لا يُسكت عن «احفظ» بلا سبب (S3): موادّ لم تُقرأ، أو طلب لم يكتمل.
    if (!catalog) {
      setStop(t('sell.catalog.unread', 'لم تُقرأ موادّ المخزن بعد، فلم يُرسل شيء؛ انتظر لحظة أو أعد المحاولة.'));
      return;
    }
    const pending = requestNow();
    if (!pending) {
      setStop(t('sell.request.incomplete', 'لم تُرسل الفاتورة: في سطورها أو دفعها ما لم يكتمل؛ راجعها ثمّ احفظ.'));
      return;
    }
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
      goFix(freshProblem, focusValue);
      return;
    }
    // ما تغيّر ويُقرّ: حجم وحدة السطر عمّا كُتب سعره له (S12)، ثمّ سعر البيع الذي اقتُرح منه السعر.
    const changes: PriceChange[] = parsed.flatMap((row): PriceChange[] => {
      if (!row.unit) return [];
      const freshItem = freshById.get(row.line.itemId);
      const freshUnit = freshItem ? unitsOf(freshItem).find((option) => option.unitId === row.line.unitId) : undefined;
      const wroteFor = row.line.factor === null ? null : BigInt(row.line.factor);
      const name = row.item?.name ?? row.line.name;
      if (freshItem && freshUnit && wroteFor !== null && freshUnit.factor !== wroteFor && row.price !== null) {
        const next = row.line.suggestedFrom !== null && freshItem.sellPrice !== null ? unitPriceOf(freshItem.sellPrice, freshUnit.factor) : convertUnitPrice(row.price, wroteFor, freshUnit.factor);
        return [{ kind: 'size', lineId: row.line.lineId, name, unit: freshUnit.label, baseUnit: freshItem.baseUnit, from: wroteFor, to: freshUnit.factor, price: row.price, next, sellPrice: freshItem.sellPrice }];
      }
      const before = row.line.suggestedFrom;
      if (before === null) return [];
      const after = freshItem?.sellPrice ?? null;
      return after === before ? [] : [{ kind: 'price', lineId: row.line.lineId, name, unit: row.unit.label, factor: row.unit.factor, before, after }];
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
    if (busy) return;
    const index = draft.lines.findIndex((line) => line.lineId === lineId);
    const line = draft.lines[index];
    if (!line) return;
    setDraft((current) => ({ ...current, lines: current.lines.filter((other) => other.lineId !== lineId) }));
    toast6(t('sell.removed', 'حُذفت «{name}» من الفاتورة', { name: byItem.get(line.itemId)?.name ?? line.name }), () =>
      setDraft((current) => (current.lines.some((other) => other.lineId === lineId) ? current : { ...current, lines: [...current.lines.slice(0, index), line, ...current.lines.slice(index)] })),
    );
  };
  /** ± على سطر. الزيادة لا تعبر المتاح (D3): تتوقّف عنده ويُقال «عندك … فقط» بوحدة السطر؛ تحذير لا قاعدة (الكمية تُكتب في ورقة السطر). */
  const stepLine = (lineId: string, delta: 1 | -1, via: 'card' | 'cart' | 'scan' = 'cart') => {
    if (busy) return;
    const line = draft.lines.find((other) => other.lineId === lineId);
    if (!line) return;
    const next = steppedQty(line.qty, delta);
    if (next === null) {
      removeLine(lineId);
      return;
    }
    const row = parsed.find((other) => other.line.lineId === lineId);
    const item = byItem.get(line.itemId);
    if (delta > 0 && item && row?.unit) {
      const after = usedBase(parsed, item.id) - (row.base ?? 0n) + baseQtyOf(parseQtyOr(next), row.unit.factor);
      if (after > item.available) {
        sound.warn();
        const text = t('sell.card.only_named', '«{name}»: عندك {qty} فقط.', { name: item.name, qty: stockText(item, row.unit) });
        setSaid(text);
        if (via === 'scan') setScanNote(text);
        return;
      }
    }
    setLine(lineId, { qty: next });
    if (item && via !== 'cart') setSaid(t('sell.live.qty', '«{name}»: {qty} في الفاتورة', { name: item.name, qty: unitQtyText(parseQtyOr(next), shortUnit(row?.unit?.label ?? '')) }));
  };
  /** لمس البطاقة أو المسح: سطر جديد بواحد من الوحدة الافتراضية، أو واحد زيادة على آخر سطر للمادّة. والموزون يفتح ورقته لكتابة الكمية. */
  const addItem = (item: CatalogItem, via: 'tap' | 'scan') => {
    if (busy) return;
    setScanNote(null);
    const existing = lastLineOf(item.id);
    if (existing) {
      stepLine(existing.lineId, 1, via === 'scan' ? 'scan' : 'card');
      return;
    }
    if (draft.lines.length >= MAX_LINES) return;
    const unit = unitOf(item);
    // لا تُضاف وحدة كاملة أكثر من المتاح (R7: كيس 50 كغم والمتاح 24.5 كغم)، ولا كيلو والمتاح أقلّ منه (T7): المسح يقول «عندك … فقط»؛ ولمس الموزون
    // يضيفه بالمتاح كلّه ويفتح ورقته لكتابة الكمية.
    const short = baseQtyOf(MILLI_PER_UNIT, unit.factor) > item.available;
    const text = t('sell.card.only_named', '«{name}»: عندك {qty} فقط.', { name: item.name, qty: stockText(item, unit) });
    if (short && (via === 'scan' || !isWeighed(item, unit))) {
      sound.warn();
      setSaid(text);
      if (via === 'scan') setScanNote(text);
      else setSnack((current) => ({ id: (current?.id ?? 0) + 1, text }));
      return;
    }
    const line = newLine(item, unit, short ? qtyText(item.available) : '1');
    if (short) setSnack((current) => ({ id: (current?.id ?? 0) + 1, text }));
    // المخزن يُثبَّت في الفاتورة مع أوّل سطر: لو تغيّر «آخر مخزن» من نافذة أخرى تبقى الفاتورة المفتوحة على مخزنها.
    setDraft((current) => ({ ...current, warehouseId: current.warehouseId || warehouseId, lines: [...current.lines, line] }));
    setSaid(t('sell.live.qty', '«{name}»: {qty} في الفاتورة', { name: item.name, qty: unitQtyText(MILLI_PER_UNIT, shortUnit(unit.label)) }));
    if (via === 'tap' && isWeighed(item, unit)) openLine(line.lineId, 'qty');
  };
  const addAnother = (lineId: string, kbd: boolean) => {
    const line = draft.lines.find((other) => other.lineId === lineId);
    const item = line ? byItem.get(line.itemId) : undefined;
    if (busy || !line || !item || draft.lines.length >= MAX_LINES) return;
    const base = unitsOf(item)[0] as CatalogUnit;
    const unit = line.unitId === null ? unitOf(item) : base;
    // سطر آخر لا يعبر المتاح (T7: كيس واحد متاح وفي الفاتورة، فسطر بكيلو آخر يجعل السطرين أحمرين).
    if (usedBase(parsed, item.id) + baseQtyOf(MILLI_PER_UNIT, unit.factor) > item.available) {
      sound.warn();
      const lineUnit = unitsOf(item).find((option) => option.unitId === line.unitId) ?? unit;
      const text = t('sell.card.only_named', '«{name}»: عندك {qty} فقط.', { name: item.name, qty: stockText(item, lineUnit) });
      setSaid(text);
      setSnack((current) => ({ id: (current?.id ?? 0) + 1, text }));
      return;
    }
    const added = newLine(item, unit, '1');
    setDraft((current) => {
      const at = current.lines.findIndex((other) => other.lineId === lineId);
      return { ...current, lines: [...current.lines.slice(0, at + 1), added, ...current.lines.slice(at + 1)] };
    });
    // من لوحة المفاتيح أو بالفأرة تُركَّز قيمة السطر الجديد، فالرقم التالي يُكتب فيها لا يطوي الأوراق إلى البحث (W4).
    openSheet('line', { line: added.lineId, tab: 'qty', focus: false, kbd }, true);
  };
  /** رمز كامل (ماسح أو كتابة أو كاميرا): المادّة تُضاف أو تزيد واحداً، وإلّا يُقال لماذا. */
  const scanCode = (raw: string): boolean => {
    const wanted = normalizeCode(raw);
    if (!wanted || !catalog || busy) return false;
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
  const scanLater = useRef(scanCode);
  useEffect(() => {
    scanLater.current = scanCode;
  });
  // كم حرفاً من آخر ما في البحث وصل دفعةً (الماسح يكتب الحرف بعد الحرف بأجزاء من الثانية، واللصق دفعة واحدة).
  const typing = useRef({ text: '', at: 0, burst: 0 });
  /** ما يكتبه التطبيق في البحث بنفسه (يمحوه بعد مسح، أو يضع فيه كتابة الموجّه) يبدأ دفعة جديدة، فالمسح التالي يُحسب من أوّله (T2). */
  const setBox = (text: string) => {
    typing.current = { text, at: 0, burst: 0 };
    setSearch(text);
  };
  /**
   * موجّه الشاشة (أساس المراجعة الثالثة): التركيز في غير حقل ولا قيمة لوحة أرقام، فما يُكتب يُجمع؛ Enter بعده مسحٌ (تُطوى الأوراق ثمّ scanCode)، وبلا
   * Enter بعد سكون: رمز من موادّ هذا المخزن بأربعة أحرف فأكثر مسحٌ، وغيره كتابة إنسان تذهب إلى البحث المركَّز. لا يُكتب في لوحة أبداً (T1)، ولا يُعدّ
   * التكرار (مسك المفتاح، T6)، ويعمل أينما كان التركيز (T5). الفجوة بين الحروف لا تعنيه (ماسح بطيء وإنسان سواء). لمسة المؤشّر لا تنهي دفعته (نقرة فتحت
   * ورقة في وسط مسح لا تشقّه، W6)؛ لكن حرفاً أو حرفين شاردين قبل نقرة نقلت التركيز لا يُرسلان إلى البحث (X5).
   */
  const routed = (text: string, entered: boolean) => {
    if (busy || frozen || !catalog) return;
    const code = normalizeCode(toWesternDigits(text));
    if (!code) return;
    if (entered || (code.length >= 4 && catalog.items.some((item) => codesOf(item).includes(code)))) {
      closeAll();
      scanCode(text);
      return;
    }
    // كتابة إنسان: إلى البحث مركَّزاً ليكمل (بعد أن تُطوى الأوراق إن كانت مفتوحة).
    closeAll();
    setBox(toWesternDigits(text));
    if (nav.stack.length === 0) searchRef.current?.focus({ preventScroll: true });
    else searchNext.current = true;
  };
  /** رمز لمادّة في هذا المخزن (باركود أو رمز آخر، مطبَّعاً كما يقرؤه الماسح) بأيّ طول: القيمة المركَّزة تطابق الدفعة كلّها، ثلاثة أحرف فأكثر (W3). */
  const isStoreCode = (text: string): boolean => {
    const code = normalizeCode(toWesternDigits(text));
    return code !== '' && catalog !== null && catalog.items.some((item) => codesOf(item).includes(code));
  };
  /**
   * رمز كُتب في قيمة لوحة مركَّزة: القيمة أُعيدت إلى ما قبله، والمسح بعد أن تُرسم (المادّة الممسوحة قد تكون سطر القيمة نفسه، فزيادتها على المُعادة لا
   * على ما كُتب).
   */
  const scanQueue = useRef<string | null>(null);
  const [scanRound, setScanRound] = useState(0);
  const scanFromValue = (code: string) => {
    scanQueue.current = code;
    setScanRound((round) => round + 1);
  };
  const router = useRef({ routed, active: false });
  useEffect(() => {
    router.current = { routed, active: !busy && !frozen && catalog !== null && priceCheck === null && askFree === null && switchTo === null };
  });
  useEffect(() => {
    const code = scanQueue.current;
    if (code === null) return;
    scanQueue.current = null;
    router.current.routed(code, true);
  }, [scanRound]);
  useEffect(() => {
    let run = '';
    // وقت آخر حرف أخذه الموجّه: دفعة بدأت عنده (حروفها بينها أقلّ من RUN_GAP_MS) له كلّها، ولو انتقل التركيز في وسطها إلى قيمة لوحة (W6).
    let last = Number.NEGATIVE_INFINITY;
    // ما كان مركَّزاً عند أوّل حرف من الدفعة: نقرة بعده نقلت التركيز (فتحت ورقة)، فحرف شارد قبلها لا يطوي ما فُتح (X5).
    let startedAt: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const clear = () => {
      stop();
      run = '';
      last = Number.NEGATIVE_INFINITY;
      startedAt = null;
    };
    /** Enter أنهى الدفعة (at وقته) أو السكون (null). */
    const flush = (at: number | null) => {
      const text = run;
      const moved = startedAt !== document.activeElement;
      clear();
      if (!text) return;
      if (at !== null) {
        markScanEnter(at);
        router.current.routed(text, true);
        return;
      }
      // التركيز انتقل منذ أوّل حرف (نقرة فتحت ورقة): حرف أو حرفان شاردان لا يُرسلان إلى البحث ولا يطويان الورقة (X5).
      if (moved && [...text].length < 3) return;
      router.current.routed(text, false);
    };
    /** حرف يأخذه الموجّه؛ والتكرار (مسك المفتاح) لا يُجمع ويقطع الدفعة (T6). */
    const take = (event: globalThis.KeyboardEvent) => {
      event.preventDefault();
      if (event.repeat) {
        last = Number.NEGATIVE_INFINITY;
        return;
      }
      if (run === '') startedAt = document.activeElement;
      run += event.key;
      last = event.timeStamp;
      stop();
      timer = setTimeout(() => flush(null), ROUTER_SILENCE_MS);
    };
    const live = (event: globalThis.KeyboardEvent): boolean => {
      const gap = event.timeStamp - last;
      return run !== '' && !event.repeat && gap >= 0 && gap < RUN_GAP_MS;
    };
    /**
     * قبل أن يصل المفتاح إلى خانته: دفعة بدأت عند الموجّه (بعد نقرة فتحت ورقة، أو «احفظ» فتح سطراً) ثمّ ركّزت الشاشةُ قيمةَ لوحة في وسطها، فبقيّتها
     * وEnter بعدها للموجّه لا للقيمة: لا رأس في البحث وذيل في الكمية (W6).
     */
    const onClaim = (event: globalThis.KeyboardEvent) => {
      // Enter ثانٍ من لاحقة الماسح (CR LF) بعد مسح: يُبتلع قبل أن يضغط زرّاً مركَّزاً أو يغلق ورقة (X3).
      if (event.key === 'Enter' && run === '' && secondEnter(event.timeStamp)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!typesItself(event.target) || event.ctrlKey || event.metaKey || event.altKey || composing(event) || inOtherDialog(event.target) || !router.current.active || !live(event)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        flush(event.timeStamp);
        return;
      }
      if (event.key.length !== 1 || event.key === ' ') return;
      event.stopPropagation();
      take(event);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || composing(event) || typesItself(event.target) || inOtherDialog(event.target)) return;
      if (!router.current.active) {
        clear();
        return;
      }
      if (event.key === 'Enter') {
        if (run === '') return;
        event.preventDefault();
        event.stopPropagation();
        flush(event.timeStamp);
        return;
      }
      if (event.key === 'Escape') {
        clear();
        return;
      }
      if (event.key.length !== 1 || (event.key === ' ' && run === '')) return;
      take(event);
    };
    window.addEventListener('keydown', onClaim, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      stop();
      window.removeEventListener('keydown', onClaim, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  /**
   * الكتابة في البحث. الرمز الكامل يُضاف بلا Enter حين وصل كلّه دفعةً (ماسح أو لصق)، بعد وقفة قصيرة (أو فوراً حين يُلصق): الماسح يكتب الرمز حرفاً
   * حرفاً، فرمز أطول لمادّة لا تُباع هنا يمرّ في طريقه برمز مادّة أخرى (S5: «62600017001» يمرّ بـ«6260001» فيضيف «علف بادئ»). ومن يكتبه بيده يضغط
   * Enter: الوقفة بين حرفين لإنسان ليست نهاية رمز (R6).
   */
  const typeSearch = (text: string, pasted: boolean, at: number) => {
    if (codeTimer.current !== null) {
      clearTimeout(codeTimer.current);
      codeTimer.current = null;
    }
    // نصّ لا يمدّ ما قبله (مُسح أو عُدّل) بدايةُ دفعة جديدة.
    const before = text.startsWith(typing.current.text) ? typing.current : { text: '', at: typing.current.at, burst: 0 };
    const added = text.length - before.text.length;
    // حروف بينها أقلّ من فجوة الدفعة وصلت دفعةً (ماسح، والبلوتوث منه 45–50 مللي ثانية، X4)، وأبطأ منها كتابة إنسان.
    const burst = added <= 0 ? 0 : at - before.at < RUN_GAP_MS || added > 1 ? before.burst + added : added;
    typing.current = { text, at, burst };
    const whole = pasted || (burst >= text.length && text.length > 0);
    const exact = catalog && whole ? exactCodeItem(catalog.items, text) : null;
    if (exact && exact.available > 0n && pasted) {
      setBox('');
      scanCode(text);
      return;
    }
    setSearch(text);
    if (!exact || exact.available <= 0n) return;
    codeTimer.current = setTimeout(() => {
      codeTimer.current = null;
      setBox('');
      scanLater.current(text);
    }, CODE_PAUSE_MS);
  };
  const enterSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (codeTimer.current !== null) {
      clearTimeout(codeTimer.current);
      codeTimer.current = null;
    }
    const text = search;
    if (!text.trim() || !catalog) return;
    const code = normalizeCode(text);
    if (catalog.items.some((item) => codesOf(item).includes(code)) || /^\d+$/u.test(code)) {
      setBox('');
      scanCode(text);
      return;
    }
    const [only, ...more] = visible;
    if (only && more.length === 0 && only.available > 0n) {
      setBox('');
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
    setLine(line.lineId, { unitId, price, factor: unit ? String(unit.factor) : line.factor });
    remember({ units: { [line.itemId]: unitId } });
  };
  const usualPrice = (line: CartLine): Fils | null => {
    const item = byItem.get(line.itemId);
    const unit = item ? unitsOf(item).find((option) => option.unitId === line.unitId) : undefined;
    return item && unit && item.sellPrice !== null ? unitPriceOf(item.sellPrice, unit.factor) : null;
  };
  const choosePay = (kind: PayKind) => {
    if (busy) return;
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
    if (busy || draft.legs.length >= MAX_LEGS) return;
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
    if (busy) return;
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
    if (busy) return;
    const before = draft;
    const beforeIds = ids;
    // من جديد بلا مخزن الفاتورة القديمة: مخزن لم يعد في النطاق لا يبقى (S3)، والافتراضيّ (الأخير أو الوحيد) يُختار من جديد.
    setDraft(blankDraft(''));
    setIds(newIds());
    setRestored(false);
    setTried(false);
    setFailure(null);
    setPartyText('');
    setTouched(new Set());
    toast6(t('sell.restart.done', 'بدأت فاتورة جديدة'), () => {
      setDraft(before);
      setIds(beforeIds);
    });
  };

  // «رجوع» بيضاويّ بكلمته كصفحة الفاتورة (D21)، بارتفاع لمس 44 لا 40، واسمه لقارئ الشاشة يقول إلى أين.
  const backButton = (
    <Link to={back} className="sl-back" data-action="back" aria-label={checkoutBackLabel(back)}>
      <ArrowRight aria-hidden="true" className="sl-icon-sm" />
      {t('sale.doc.back', 'رجوع')}
    </Link>
  );

  if (frozen) {
    return (
      <div className="sl-screen" data-action="sale-frozen">
        <style>{SELL_STYLE}</style>
        <div className="sl-head">
          <div className="sl-head-row">
            {backButton}
            <h1 className="sl-title">{t('sell.title', 'بيع')}</h1>
          </div>
        </div>
        <div className="sl-frozen">
          <Notice
            tone="warning"
            title={
              unreached
                ? t('sell.unreached', 'لم تصل الفاتورة هذه المرّة أيضاً: أعد المحاولة حين يعود الاتصال؛ لن تُسجَّل مرّتين.')
                : t('sell.unknown', 'لا نعرف إن حُفظت الفاتورة: «أعد المحاولة» يرسلها كما هي؛ لن تُسجَّل مرّتين ولن تخرج الموادّ مرّتين.')
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
  // ملخّص المنع بجانب الزرّ و«صحّح» حين يوجد ما يُصحَّح وحده (S13)؛ والزبون يقوله الزرّ نفسه وخطؤه تحت «لمن؟» فلا يُكرَّر (D17).
  const firstProblem = tried && blocked ? problems[0] : undefined;
  const canFix = firstProblem !== undefined && firstProblem.where.kind !== 'party';
  const blockedText = canFix
    ? problems.length === 1
      ? t('invoice.blocked.one', 'لم تُحفظ الفاتورة: {problem}', { problem: firstProblem.text })
      : t('invoice.blocked.many_sell', 'لم تُحفظ الفاتورة: {problem} ({more} غيرها).', { problem: firstProblem.text, more: problems.length - 1 })
    : firstProblem !== undefined
      ? null
      : stop;
  // رفض الخادم لمتاح أو وحدة تغيّرت: بعد قراءة الموادّ يقوله السطر نفسه بوحدته مع «صحّح الكمية»، لا نصّ الخادم بالكيلو (D16).
  const failureCode = failure instanceof RejectedError ? failure.code : null;
  const failureShown = failure !== null && !(failureCode !== null && (REREAD.has(failureCode) || REREAD_BOXES.has(failureCode)) && canFix) ? failureText(failure) : null;
  const missingPrice = parsed.some((row) => row.price === null);
  const top = nav.stack.at(-1);
  const lineIndex = nav.line !== null ? parsed.findIndex((row) => row.line.lineId === nav.line) : -1;
  const lineRow = lineIndex >= 0 ? parsed[lineIndex] : undefined;
  const supportsCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  return (
    <div ref={screenRef} tabIndex={-1} className="sl-screen" data-action="sale-checkout">
      <style>{SELL_STYLE}</style>
      <header className="sl-head">
        <div className="sl-head-row">
          {backButton}
          <h1 className="sl-title">{t('sell.title', 'بيع')}</h1>
          {store && storeRows.length > 1 ? (
            <button type="button" className="sl-chip sl-store" disabled={busy} onClick={() => openSheet('store')} data-action="sale-store" aria-label={t('sell.store.change', 'من «{store}» — غيّر المخزن', { store: store.name })}>
              <Store aria-hidden="true" className="sl-icon-sm" />
              <span className="sl-ellipsis">{store.name}</span>
              <ChevronDown aria-hidden="true" className="sl-icon-sm" />
            </button>
          ) : null}
        </div>
        {!online ? (
          <p className="sl-offline" role="status" data-action="sale-offline">
            <span aria-hidden="true" className="sl-dot" />
            {t('sell.offline.now', 'بلا اتصال: جهّز الفاتورة واحفظها حين يعود الاتصال.')}
          </p>
        ) : null}
      </header>
      {warehouseId && catalog ? (
        <div className="sl-tools" data-compact={compact ? 'yes' : undefined}>
          <div className="sl-search">
            <Search aria-hidden="true" className="sl-icon sl-search-icon" />
            <input
              ref={searchRef}
              type="search"
              className="sl-search-input"
              enterKeyHint="search"
              autoComplete="off"
              readOnly={busy}
              placeholder={t('sell.search', 'ابحث بالاسم أو امسح الرمز')}
              aria-label={t('sell.search', 'ابحث بالاسم أو امسح الرمز')}
              value={search}
              onChange={(event) => typeSearch(toWesternDigits(event.target.value), pastedInto(event), event.timeStamp)}
              onKeyDown={enterSearch}
              data-action="sale-search"
            />
            {supportsCamera ? (
              <button type="button" className="sl-round" disabled={busy} aria-label={t('sell.camera', 'امسح الرمز بالكاميرا')} onClick={() => openSheet('scan')} data-action="sale-camera">
                <ScanLine aria-hidden="true" className="sl-icon" />
              </button>
            ) : null}
          </div>
          {kinds.length > 1 ? (
            <div className="sl-chips sl-kinds" role="radiogroup" aria-label={t('sell.kinds', 'النوع')}>
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
          <button type="button" className="sl-link" disabled={busy} onClick={startOver} data-action="sale-start-over">
            {t('sell.restart', 'ابدأ من جديد')}
          </button>
        </div>
      ) : null}
      {notice ? (
        <div data-action="sale-notice">
          <Notice tone="info" title={notice} />
        </div>
      ) : null}
      {failureShown && top !== 'pay' ? (
        <div data-action="sale-failure">
          <Notice tone="danger" title={failureShown} />
        </div>
      ) : null}
      {scanNote ? (
        <p role="alert" className="sl-alert" data-action="sale-scan-note">
          {scanNote}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite" data-action="sale-live">
        {said}
      </p>

      {stores.error ? (
        <LoadFailed what={t('invoice.stores.what', 'مخازن البيع')} error={stores.error} onRetry={stores.retry} />
      ) : !stores.data ? (
        <p role="status" className="sl-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : storeRows.length === 0 ? (
        <Notice tone="info" title={t('invoice.stores.none', 'لا مخزن يُباع منه.')} />
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
          <p className="sl-muted">{t('sell.store.hint', 'كلّ مخزن بفاتورته؛ لبيع من مخزن آخر افتح فاتورة جديدة.')}</p>
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
            const lineUnit = line ? (unitsOf(item).find((option) => option.unitId === line.unitId) ?? null) : null;
            return (
              <ItemCard
                key={item.id}
                item={item}
                line={line}
                unit={lineUnit ?? unitOf(item)}
                lineUnit={lineUnit}
                used={usedBase(parsed, item.id)}
                others={draft.lines.filter((other) => other.itemId === item.id).length - 1}
                full={draft.lines.length >= MAX_LINES}
                locked={busy}
                onAdd={() => {
                  sound.click();
                  addItem(item, 'tap');
                }}
                onStep={(delta) => {
                  sound.click();
                  if (line) stepLine(line.lineId, delta, 'card');
                }}
                onOpen={(byKeyboard) => {
                  sound.click();
                  if (line) openLine(line.lineId, 'qty', false, byKeyboard);
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
            <button type="button" className="sl-bar-cart" disabled={busy} onClick={() => openSheet('cart')} data-action="open-cart" aria-label={t('sell.bar.open', 'افتح الفاتورة: {items}', { items: linesText(items) })}>
              <span className="sl-cart-icon" aria-hidden="true">
                <CartIcon className="sl-icon" />
                <span key={items} className="sl-count">
                  {fmtInt(items)}
                </span>
              </span>
              {/* المبلغ وحده في السطر الكبير و«دينار» في الصغير: لا يُقصّ المبلغ تحت الزرّ في 125٪ (D2). */}
              <span className="sl-bar-text">
                <span className="sl-bar-items" data-warn={missingPrice ? 'yes' : undefined}>
                  {missingPrice ? t('sell.bar.items_missing', '{items} · سعر ناقص', { items: linesText(items) }) : t('sell.bar.items', '{items} · بالدينار', { items: linesText(items) })}
                </span>
                <span className="sl-bar-total" data-action="sale-bar-total">
                  {math.nets === null ? t('file.none', '—') : moneyText(math.total)}
                </span>
              </span>
            </button>
            <button type="button" className="sl-primary sl-next" disabled={busy} onClick={() => openSheet('pay')} aria-label={t('sell.next', 'التالي: الدفع')} data-action="sale-next">
              <span className="sl-next-pre">{t('sell.next.pre', 'التالي:')}</span> {t('sell.next.pay', 'الدفع')}
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
          errors={shownErrors}
          limits={limits}
          math={math}
          storeName={storeName}
          draft={draft}
          today={today}
          shown={shown}
          moreOpen={nav.more}
          previewRows={previewRows}
          onClose={closeSheet}
          onOpenLine={(lineId, byKeyboard) => openLine(lineId, 'qty', false, byKeyboard)}
          onStep={(lineId, delta) => stepLine(lineId, delta, 'cart')}
          onRemove={removeLine}
          onSet={set}
          // السلّة فوق ورقة الدفع («صحّح» فتحها): «التالي» يرجع خطوة إلى الدفع، لا ورقة دفع ثانية تحتاج إغلاقين (S4).
          onNext={() => (nav.stack.at(-2) === 'pay' ? closeSheet() : openSheet('pay', {}, true))}
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
          partyText={partyText}
          onPartyText={setPartyText}
          padTarget={padTarget}
          padFresh={padFresh}
          focusRequest={focusRequest}
          busy={busy}
          online={online}
          saveText={label}
          blockedText={blockedText}
          fixLabel={canFix && firstProblem ? fixLabelOf(firstProblem.where) : null}
          failure={failureShown}
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
          onFix={(focusValue) => goFix(problems[0], focusValue)}
          onSave={(focusValue) => void save(focusValue)}
          isCode={isStoreCode}
          onScan={scanFromValue}
        />
      ) : null}
      {nav.stack.includes('line') && lineRow ? (
        <LineSheet
          key={lineRow.line.lineId}
          level={nav.stack.lastIndexOf('line')}
          row={lineRow}
          errors={shownErrors[lineIndex] ?? {}}
          gross={math.gross[lineIndex] ?? 0n}
          units={lineRow.item ? unitChipsOf(lineRow.item) : []}
          stock={lineRow.item && lineRow.unit ? stockText(lineRow.item, lineRow.unit) : null}
          usual={usualPrice(lineRow.line)}
          tab={nav.tab}
          focusError={nav.focus}
          focusPad={nav.kbd}
          canAddAnother={draft.lines.length < MAX_LINES && lineRow.item !== null}
          onClose={closeSheet}
          onUnit={(unitId) => changeUnit(lineRow.line, unitId)}
          onField={(field, text) => {
            const lineId = lineRow.line.lineId;
            if (busy) return;
            setTouched((current) => new Set(current).add(`${lineId}:${field}`));
            setLine(lineId, field === 'price' ? { price: text, suggestedFrom: null, factor: lineRow.unit ? String(lineRow.unit.factor) : lineRow.line.factor } : { [field]: text });
          }}
          onUsual={() => {
            const usual = usualPrice(lineRow.line);
            const item = byItem.get(lineRow.line.itemId);
            if (usual !== null && item) setLine(lineRow.line.lineId, { price: inputMoney(usual), suggestedFrom: item.sellPrice, factor: lineRow.unit ? String(lineRow.unit.factor) : lineRow.line.factor });
          }}
          onRemove={() => {
            closeSheet();
            removeLine(lineRow.line.lineId);
          }}
          onAddAnother={(focusValue) => addAnother(lineRow.line.lineId, focusValue)}
          isCode={isStoreCode}
          onScan={scanFromValue}
        />
      ) : null}

      {snack ? (
        <Snackbar
          snack={snack}
          over={nav.stack.length > 0}
          onUndo={() => {
            if (busy) return;
            snack.undo?.();
            setSnack(null);
          }}
        />
      ) : null}

      {/* إقرار الأسعار والأحجام المتغيّرة (المهارة 11، وS12) */}
      {priceCheck ? (
        <Dialog
          open
          onClose={() => setPriceCheck(null)}
          title={priceCheck.some((change) => change.kind === 'size') ? t('sell.prices.title_size', 'تغيّر في الفاتورة ما يُقرّ قبل الحفظ') : t('invoice.prices.title', 'تغيّرت أسعار البيع منذ فتحت الفاتورة')}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  const changes = priceCheck;
                  setPriceCheck(null);
                  // أبقِ أسعار الفاتورة كما هي: يُقرّ البائع ما كتبه النظام سابقاً والحجم الجديد، فلا يُسأل عنه ثانيةً، ثمّ يُحفظ.
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((line) => {
                      const change = changes.find((c) => c.lineId === line.lineId);
                      if (!change) return line;
                      return change.kind === 'size'
                        ? { ...line, factor: String(change.to), suggestedFrom: line.suggestedFrom !== null ? change.sellPrice : null }
                        : { ...line, suggestedFrom: change.after };
                    }),
                  }));
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
                      if (change.kind === 'size') return { ...line, price: inputMoney(change.next), factor: String(change.to), suggestedFrom: line.suggestedFrom !== null ? change.sellPrice : null };
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
              <li key={change.lineId} data-kind={change.kind}>
                {change.kind === 'size'
                  ? t('sell.prices.size', '«{name}»: صار «{unit}» {to} بعد أن كان {from}. سعره في الفاتورة {price}، و«اعتمد الأسعار الجديدة» تجعله {next}.', {
                      name: change.name,
                      unit: change.unit,
                      to: baseQty(change.to / 1000n, change.baseUnit),
                      from: baseQty(change.from / 1000n, change.baseUnit),
                      price: dinars(change.price),
                      next: dinars(change.next),
                    })
                  : change.after === null
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
        <Notice tone="info" title={t('invoice.forbidden', 'لا يبيع حسابك الآن: البيع يحتاج عضويةً فعّالة في المنشأة.')} />
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
