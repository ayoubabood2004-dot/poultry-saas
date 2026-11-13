import type { Day } from '../../../domain/dates';
import { decimalText } from '../../../domain/decimal';
import type { Fils, Milli } from '../../../domain/money';
import { amountInWords } from '../../../domain/amountWords';
import { countForm, fmtCounted, fmtDay, fmtMilli, fmtScaledCell } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { EntryKind } from '../../../lib/repo/parties';
import type { Allocation, EntryDetail, OpenItem, PartyStatement, StatementBook, StatementLine } from '../../../lib/repo/statement';
import { monthLabel, withBack } from '../money/shared';
import { daysText, moneyText, unitText } from '../papers';
import { bookLabel, entryKindLabel } from '../shared';

// نصوص الكشف الاحترافي (عقد 0024 §4.4 و§5، الخطّة §9.1): نوع المستند، والبيان مبنيّاً من المستند نفسه («شراء 2,000 كغم ذرة صفراء بسعر
// 450 — مخزن المواد»)، وما سدّده كلّ تسديد من التوزيع القائم، ورابط المستند أو السند (وكلّ رابط يحمل ?back= إلى الكشف بفترته)، وموادّ
// المستند للتفصيلي، وملف إكسل (CSV بترميز UTF-8 وعلامة البداية، والأرقام بلا فواصل حتى يقرأها إكسل أرقاماً، والنصّ الذي يبدأ بما يجعله
// إكسل صيغة يُسبق بفاصلة عليا)، ونصّ المشاركة. كلّ عربية من t() وكلّ رقم معروض من format.ts، وبقاموس المالك (DECISIONS 2026-10-31 §1:
// «حركة» لا «قيد»، و«الرصيد عند البداية»). وفاتورة الطيور BR ومقبوضها (0028، العقد §6 و§10): «فاتورة بيع طيور» ببيانها («بيع 4,000 طير (9,054.5 كغم بعد
// تنزيل 0.50٪) بسعر 2,750 — حقل الطيور»)، و«قبض عند البيع»، ورابطها /sales/birds/:id، وتحتها في التفصيلي «دجاج لحم حيّ» بالوزن المحسوب وسعر الكيلو.

export type StatementMode = 'summary' | 'detailed' | 'open';
export const STATEMENT_MODES: readonly StatementMode[] = ['summary', 'detailed', 'open'];

/** الكلمة بجانب الرصيد: «عليه» (لنا عنده) أو «له» (علينا له)، والصفر بلا كلمة. */
export function sideWord(amount: Fils): string {
  if (amount > 0n) return t('ledger.side.debit', 'عليه');
  if (amount < 0n) return t('ledger.side.credit', 'له');
  return '';
}

const abs = (amount: Fils): Fils => (amount < 0n ? -amount : amount);

/** المبلغ كتابةً وجهته: «فقط … لا غير — له». */
export function closingWords(amount: Fils): string {
  const words = amountInWords(amount);
  return amount === 0n ? words : t('stmt.words.side', '{words} — {side}', { words, side: sideWord(amount) });
}

const SEPARATOR = (): string => t('list.separator', '، ');

/** «مادّتين»، «3 موادّ»، «11 مادّة» (المعدود بالفصحى). */
function itemsCount(n: number): string {
  if (n === 2) return t('stmt.items.two', 'مادّتين');
  return countForm(n) === 'few' ? t('stmt.items.few', '{n} موادّ', { n }) : t('stmt.items.many', '{n} مادّة', { n });
}

const qtyUnit = (qty: Milli, unit: string): string => t('stmt.qty_unit', '{qty} {unit}', { qty: fmtMilli(qty), unit });

/** عدد الطيور بصيغة المعدود: «طير واحد»، «طيران»، «5 طيور»، «60 طيراً»، «4,000 طير». */
const birdsCount = (n: number): string =>
  fmtCounted(BigInt(n) * 1000n, t('birds.unit', 'طير'), { one: t('birds.one', 'طير واحد'), two: t('birds.two', 'طيران'), few: t('birds.few', 'طيور'), many: t('birds.many', 'طيراً') });

/** نسبة التنزيل (بالمئات من الواحد بالمئة) بمرتبتين: «0.50٪». */
const pctText = (deduction: bigint): string => t('birds.pct', '{value}٪', { value: fmtScaledCell(deduction, 2, 2) });

type TypedLine = Pick<StatementLine, 'entryId' | 'kind' | 'docKind' | 'detail' | 'reverses'>;

/**
 * نوع المستند (العمود الثالث). سطر الإلغاء «إلغاء {نوع الأصل}»: الخادم يرسله بنوع الأصل ومستنده بلا تفصيل، فنوعه من الأصل إن كان في
 * سطور الكشف (lines: سطور حسابه، فأجور الشراء تبقى «أجور شراء»)، وإلّا من نوع الحركة ونوع مستندها.
 */
export function docType(line: TypedLine, lines: readonly TypedLine[] = []): string {
  if (!line.reverses) return baseDocType(line);
  const original = lines.find((entry) => entry.entryId === line.reverses && !entry.reverses);
  return t('stmt.type.reversal', 'إلغاء {type}', { type: baseDocType(original ?? line) });
}

function baseDocType({ kind, docKind, detail }: Pick<StatementLine, 'kind' | 'docKind' | 'detail'>): string {
  switch (detail?.type) {
    case 'purchase':
      return t('stmt.type.purchase', 'فاتورة شراء');
    case 'purchase_payment':
      return t('stmt.type.purchase_payment', 'دفع عند الشراء');
    case 'purchase_charge':
      return t('stmt.type.purchase_charge', 'أجور شراء');
    case 'sale':
      return t('stmt.type.sale', 'فاتورة بيع');
    case 'sale_payment':
    case 'bird_sale_payment':
      return t('stmt.type.sale_payment', 'قبض عند البيع');
    case 'bird_sale':
      return t('stmt.type.bird_sale', 'فاتورة بيع طيور');
    case 'supplier_return':
      return t('stmt.type.supplier_return', 'مرتجع إلى المورّد');
    case 'expense':
      return t('stmt.type.expense', 'مصروف بالدين');
    case 'revaluation':
      return detail.pricing ? t('stmt.type.pricing', 'تسعير شراء') : t('stmt.type.revaluation', 'تصحيح سعر');
    case undefined:
      break;
  }
  return kindDocType(kind, docKind);
}

/**
 * نوع المستند من نوع الحركة ونوع مستندها، بلا تفصيل (سطر الإلغاء، والمفتوح): الشراء ودفعه، والبيع وقبضه، والمرتجع، والمصروف بالدين،
 * والتسعير (حركة شراء على تصحيح الاستلام) وتصحيح السعر (تسوية عليه)؛ وسند القبض أو الصرف لحركة بلا مستند وحدها.
 */
export function kindDocType(kind: EntryKind, docKind: string | null): string {
  switch (docKind) {
    case 'receipt':
      if (kind === 'purchase') return t('stmt.type.purchase', 'فاتورة شراء');
      if (kind === 'payout') return t('stmt.type.purchase_payment', 'دفع عند الشراء');
      break;
    case 'sale':
      if (kind === 'invoice') return t('stmt.type.sale', 'فاتورة بيع');
      if (kind === 'payment') return t('stmt.type.sale_payment', 'قبض عند البيع');
      break;
    case 'bird_sale':
      if (kind === 'invoice') return t('stmt.type.bird_sale', 'فاتورة بيع طيور');
      if (kind === 'payment') return t('stmt.type.sale_payment', 'قبض عند البيع');
      break;
    case 'supplier_return':
      return t('stmt.type.supplier_return', 'مرتجع إلى المورّد');
    case 'expense':
      if (kind === 'bill') return t('stmt.type.expense', 'مصروف بالدين');
      break;
    case 'receipt_revalue':
      if (kind === 'purchase') return t('stmt.type.pricing', 'تسعير شراء');
      if (kind === 'adjustment') return t('stmt.type.revaluation', 'تصحيح سعر');
      return t('stmt.type.revalue_doc', 'تسعير أو تصحيح سعر');
    case null:
      if (kind === 'payment') return t('stmt.type.receipt_voucher', 'سند قبض');
      if (kind === 'payout') return t('stmt.type.payment_voucher', 'سند صرف');
      break;
  }
  return kind === 'opening' ? t('stmt.type.opening', 'الرصيد عند البداية') : entryKindLabel(kind);
}

/** البيان من المستند نفسه، بلا ملاحظات الإلغاء. */
function detailMemo(detail: EntryDetail, line: Pick<StatementLine, 'kind' | 'account' | 'reason'>): string {
  switch (detail.type) {
    case 'purchase': {
      const [only] = detail.lines;
      const store = detail.warehouse.name;
      const head =
        detail.lines.length === 1 && only
          ? only.unitPrice === null
            ? t('stmt.memo.purchase_one_unpriced', 'شراء {qty} {item} بلا سعر — {store}', { qty: qtyUnit(only.qty, unitText(only.unitLabel)), item: only.itemName, store })
            : t('stmt.memo.purchase_one', 'شراء {qty} {item} بسعر {price} — {store}', { qty: qtyUnit(only.qty, unitText(only.unitLabel)), item: only.itemName, price: moneyText(only.unitPrice), store })
          : t('stmt.memo.purchase_many', 'شراء {items} — {store}', { items: itemsCount(detail.lines.length), store });
      return detail.discount > 0n ? t('stmt.memo.after_discount', '{memo}، بعد خصم {amount}', { memo: head, amount: moneyText(detail.discount) }) : head;
    }
    case 'purchase_payment': {
      const box = detail.account?.name ?? line.account?.name;
      return box ? t('stmt.memo.purchase_payment', 'دُفع عند الشراء من «{box}»', { box }) : t('stmt.type.purchase_payment', 'دفع عند الشراء');
    }
    case 'purchase_charge':
      return t('stmt.memo.purchase_charge', 'أجور {label} عن {doc} — {store}', { label: detail.label, doc: detail.docNo, store: detail.warehouse.name });
    case 'sale': {
      const [only] = detail.lines;
      const store = detail.warehouse.name;
      const head =
        detail.lines.length === 1 && only
          ? t('stmt.memo.sale_one', 'بيع {qty} {item} بسعر {price} — {store}', { qty: qtyUnit(only.qty, unitText(only.baseUnit)), item: only.itemName, price: moneyText(only.unitPrice), store })
          : t('stmt.memo.sale_many', 'بيع {items} — {store}', { items: itemsCount(detail.lines.length), store });
      return detail.payment === 'cash' ? t('stmt.memo.cash', '{memo}، نقداً', { memo: head }) : head;
    }
    case 'sale_payment':
    case 'bird_sale_payment': {
      const box = detail.account?.name ?? line.account?.name;
      return box ? t('stmt.memo.sale_payment', 'قُبض ثمن البيع في «{box}»', { box }) : t('stmt.type.sale_payment', 'قبض عند البيع');
    }
    case 'bird_sale': {
      // الوزن في البيان هو المحسوب (بعد التنزيل إن وُجد): الوزن × السعر = مبلغ الحركة.
      const vars = { birds: birdsCount(detail.birds), price: moneyText(detail.unitPrice), site: detail.site.name };
      const head =
        detail.deduction > 0n
          ? t('stmt.memo.bird_sale_deducted', 'بيع {birds} ({kg} كغم بعد تنزيل {pct}) بسعر {price} — {site}', { ...vars, kg: fmtMilli(detail.billedKg), pct: pctText(detail.deduction) })
          : t('stmt.memo.bird_sale', 'بيع {birds} ({kg} كغم) بسعر {price} — {site}', { ...vars, kg: fmtMilli(detail.netKg) });
      if (detail.paidNow <= 0n) return head;
      return detail.paidNow >= detail.total
        ? t('stmt.memo.cash', '{memo}، نقداً', { memo: head })
        : t('stmt.memo.bird_sale_part', '{memo}، وقُبض منه {paid}', { memo: head, paid: moneyText(detail.paidNow) });
    }
    case 'supplier_return': {
      const [only] = detail.lines;
      const vars = { receipt: detail.receiptDocNo, store: detail.warehouse.name };
      return detail.lines.length === 1 && only
        ? t('stmt.memo.return_one', 'إرجاع {qty} {item} إلى المورّد من {receipt} — {store}', { ...vars, qty: qtyUnit(only.qty, unitText(only.baseUnit)), item: only.itemName })
        : t('stmt.memo.return_many', 'إرجاع {items} إلى المورّد من {receipt} — {store}', { ...vars, items: itemsCount(detail.lines.length) });
    }
    case 'expense': {
      // الشهر باسمه («تشرين الثاني 2026»، منسّق خلاصة الشهر)، لا «11/2026» خاماً.
      const month = monthLabel(detail.forMonth.slice(0, 7));
      return detail.note
        ? t('stmt.memo.expense_note', 'مصروف {category} لشهر {month}: {note}', { category: detail.category, month, note: detail.note })
        : t('stmt.memo.expense', 'مصروف {category} لشهر {month}', { category: detail.category, month });
    }
    case 'revaluation': {
      const vars = { item: detail.itemName, receipt: detail.receiptDocNo, qty: qtyUnit(detail.qty, unitText(detail.unitLabel)) };
      if (detail.pricing) {
        return detail.unitPrice === null
          ? t('stmt.memo.pricing_total', 'تسعير شراء {qty} {item} في {receipt} بمبلغ {total}', { ...vars, total: moneyText(detail.newTotal) })
          : t('stmt.memo.pricing', 'تسعير شراء {qty} {item} في {receipt} بسعر {price}', { ...vars, price: moneyText(detail.unitPrice) });
      }
      return t('stmt.memo.revaluation', 'تصحيح سعر {item} في {receipt}: من {old} إلى {new}', { ...vars, old: moneyText(detail.oldTotal), new: moneyText(detail.newTotal) });
    }
  }
}

/** البيان لقيد بلا مستند: القبض والدفع بصندوقه، والافتتاح، والتسوية والإعفاء بسببهما. */
function bareMemo(line: Pick<StatementLine, 'kind' | 'account' | 'reason'>): string {
  const box = line.account?.name;
  switch (line.kind) {
    case 'payment':
      return box ? t('stmt.memo.receipt_box', 'قبض في «{box}»', { box }) : entryKindLabel(line.kind);
    case 'payout':
      return box ? t('stmt.memo.payout_box', 'دفع من «{box}»', { box }) : entryKindLabel(line.kind);
    case 'opening':
      return t('stmt.memo.opening', 'الرصيد عند بداية التعامل');
    default:
      return line.reason ? t('statement.memo.reason', '{base}: {reason}', { base: entryKindLabel(line.kind), reason: line.reason }) : entryKindLabel(line.kind);
  }
}

/** البيان (العمود الرابع): من المستند، والإلغاء «إلغاء: …» بسببه، والملغى لاحقاً «(أُلغي)». */
export function lineMemo(line: Pick<StatementLine, 'kind' | 'account' | 'reason' | 'detail' | 'reverses' | 'reversed'>): string {
  // سبب سطر الإلغاء سبب الإلغاء، فالبيان الأصلي يُبنى بلاه.
  const base = line.detail ? detailMemo(line.detail, line) : bareMemo(line.reverses ? { ...line, reason: null } : line);
  if (line.reverses) {
    return line.reason ? t('stmt.memo.reversal_reason', 'إلغاء: {memo} — السبب: {reason}', { memo: base, reason: line.reason }) : t('stmt.memo.reversal', 'إلغاء: {memo}', { memo: base });
  }
  return line.reversed ? t('stmt.memo.voided', '{memo} (أُلغي)', { memo: base }) : base;
}

/** رقم المستند الآخر في التوزيع، أو نوعه وتاريخه لحركة بلا رقم (الرصيد عند البداية). */
export function allocationDoc(allocation: Pick<Allocation, 'docNo' | 'kind' | 'onDate'>): string {
  return allocation.docNo ?? t('stmt.alloc.bare', '{kind} {day}', { kind: entryKindLabel(allocation.kind), day: fmtDay(allocation.onDate) });
}

/**
 * المستند الآخر في توزيع السطر: الدفع عند الشراء والقبض عند البيع يحملان رقم الفاتورة نفسها، فسطر الفاتورة يقولهما بكلمتهما
 * («دُفع عند الشراء») بدل أن يسمّي رقمه هو (مراجعة 0024 L2)؛ وما سواهما برقمه (allocationDoc).
 */
function settledDoc(allocation: Pick<Allocation, 'docNo' | 'docKind' | 'kind' | 'onDate'>, ownDocNo: string | null): string {
  if (allocation.docNo !== null && allocation.docNo === ownDocNo) {
    if (allocation.kind === 'payout' && allocation.docKind === 'receipt') return t('stmt.alloc.paid_at_purchase', 'دُفع عند الشراء');
    if (allocation.kind === 'payment' && (allocation.docKind === 'sale' || allocation.docKind === 'bird_sale')) return t('stmt.alloc.received_at_sale', 'قُبض عند البيع');
  }
  return allocationDoc(allocation);
}

/** الحركات التي تسدّد غيرها (قبض ودفع ومرتجع وإعفاء ومقاصّة): «سدّد: …»؛ وما سواها ديون: «سُدّد منه: …». */
const SETTLERS: ReadonlySet<StatementLine['kind']> = new Set(['payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'offset']);

/** آخر الفترة إن انتهت قبل اليوم (التوزيع القائم اليوم يُقرأ حتى آخرها وحده)، وإلّا null. */
export const pastPeriodEnd = (statement: Pick<PartyStatement, 'to' | 'today'>): Day | null => (statement.to < statement.today ? statement.to : null);

/**
 * ما سدّده التسديد أو ما سُدّد من الدين، من التوزيع القائم: «سدّد: PU-2026-0012 (450,000)، PU-2026-0015 (50,000)، وبقي 50,000 غير
 * مخصّص لفاتورة». null بلا توزيع ولا باقٍ يُذكر. periodEnd (كشف فترة مضت، مراجعة 0024 H1): التسديدات المؤرّخة حتى آخر الفترة وحدها،
 * وبلا الباقي (باقي اليوم يناقض رصيد آخر الفترة)؛ وتحت الجدول جملة تقول ذلك (SETTLED_NOTE).
 */
export function settlementText(line: Pick<StatementLine, 'kind' | 'docNo' | 'allocations' | 'unallocated' | 'reverses' | 'reversed'>, periodEnd: Day | null = null): string | null {
  if (line.reverses) return null;
  const shown = periodEnd === null ? line.allocations : line.allocations.filter((allocation) => allocation.onDate <= periodEnd);
  const items = shown.map((allocation) => t('stmt.alloc.item', '{doc} ({amount})', { doc: settledDoc(allocation, line.docNo), amount: moneyText(allocation.amount) })).join(SEPARATOR());
  const settler = SETTLERS.has(line.kind);
  const head = items ? (settler ? t('stmt.alloc.settled', 'سدّد: {items}', { items }) : t('stmt.alloc.paid_by', 'سُدّد منه: {items}', { items })) : null;
  if (periodEnd !== null) return head;
  if (!head) return settler && line.unallocated > 0n ? t('stmt.alloc.unallocated_all', 'لم يُخصَّص لفاتورة: {amount}', { amount: moneyText(line.unallocated) }) : null;
  if (line.unallocated === 0n) return head;
  return settler
    ? t('stmt.alloc.with_unallocated', '{head}، وبقي {amount} غير مخصّص لفاتورة', { head, amount: moneyText(line.unallocated) })
    : t('stmt.alloc.with_remaining', '{head}، والمتبقّي {amount}', { head, amount: moneyText(line.unallocated) });
}

/** جملة كشف الفترة الماضية تحت جدوله: التسديدات المذكورة حتى آخر الفترة، والتوزيع توزيع اليوم. */
export const settledNote = (): string => t('stmt.settled.past', 'التسديدات المذكورة حتى نهاية الفترة، بحسب التوزيع القائم اليوم.');

/** رابط المستند أو السند (العقد §5)، أو null (المصروف والرصيد عند البداية والتسوية). back: طريق الرجوع إلى الكشف بفترته. */
export function docLink(line: Pick<StatementLine, 'voucherId' | 'detail' | 'docKind' | 'docId'>, back: string | null = null): string | null {
  if (line.voucherId) return withBack(`/accounts/voucher/${line.voucherId}`, back);
  const { detail } = line;
  switch (detail?.type) {
    case 'purchase':
    case 'purchase_payment':
    case 'purchase_charge':
      return withBack(`/inventory/receipts/${detail.docId}`, back);
    case 'supplier_return':
      return withBack(`/inventory/supplier-returns/${detail.docId}`, back);
    case 'revaluation':
      return withBack(`/inventory/receipts/${detail.receiptId}`, back);
    case 'sale':
    case 'sale_payment':
      return withBack(`/sales/${detail.docId}`, back);
    case 'bird_sale':
    case 'bird_sale_payment':
      return withBack(`/sales/birds/${detail.docId}`, back);
    case 'expense':
      return null;
    case undefined:
      break;
  }
  return docKindLink(line.docKind, line.docId, back);
}

/** رابط مستند بنوعه ومعرّفه (التوزيع والمفتوح، §7): الاستلام والمرتجع والبيع؛ وتصحيح السعر مستنده غير الاستلام فلا رابط هنا. */
export function docKindLink(docKind: string | null, docId: string | null, back: string | null = null): string | null {
  if (!docId) return null;
  if (docKind === 'receipt') return withBack(`/inventory/receipts/${docId}`, back);
  if (docKind === 'supplier_return') return withBack(`/inventory/supplier-returns/${docId}`, back);
  if (docKind === 'sale') return withBack(`/sales/${docId}`, back);
  if (docKind === 'bird_sale') return withBack(`/sales/birds/${docId}`, back);
  return null;
}

/** رابط مستند التوزيع: سند القبض أو الدفع بحركته (RC/PY بلا مستند)، وإلّا مستنده. */
export function allocationLink(allocation: Pick<Allocation, 'entryId' | 'kind' | 'docKind' | 'docId' | 'docNo'>, back: string | null = null): string | null {
  if (allocation.docKind === null && (allocation.kind === 'payment' || allocation.kind === 'payout') && allocation.docNo) {
    return withBack(`/accounts/voucher/${allocation.entryId}`, back);
  }
  return docKindLink(allocation.docKind, allocation.docId, back);
}

/**
 * رقم الشراء ← معرّف استلامه، من سطور الكشف ومفتوحه: تصحيح السعر والتسعير مستندهما غير الاستلام (receipt_revalue) ورقمهما رقم الشراء،
 * فالمفتوح منهما يفتح استلامه بهذا الفهرس (مراجعة 0024 L9).
 */
export function receiptIds(statement: Pick<PartyStatement, 'books'>): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  for (const book of statement.books) {
    for (const line of book.lines) {
      const { detail } = line;
      if (detail?.type === 'purchase' || detail?.type === 'purchase_payment' || detail?.type === 'purchase_charge') ids.set(detail.docNo, detail.docId);
      else if (detail?.type === 'revaluation' || detail?.type === 'supplier_return') ids.set(detail.receiptDocNo, detail.receiptId);
      else if (line.docKind === 'receipt' && line.docNo && line.docId) ids.set(line.docNo, line.docId);
    }
    for (const item of book.openItems) if (item.docKind === 'receipt' && item.docNo && item.docId) ids.set(item.docNo, item.docId);
  }
  return ids;
}

/**
 * رابط المفتوح (الصيغة «المفتوح فقط»): الدفعة المقدّمة بسند قبض أو صرف تفتح سندها، والتسعير وتصحيح السعر يفتحان الاستلام (بالفهرس)،
 * وما سواهما مستنده (مراجعة 0024 L9).
 */
export function openItemLink(item: Pick<OpenItem, 'entryId' | 'kind' | 'docKind' | 'docId' | 'docNo'>, back: string | null, receipts: ReadonlyMap<string, string>): string | null {
  if (item.docKind === null && (item.kind === 'payment' || item.kind === 'payout') && item.docNo) return withBack(`/accounts/voucher/${item.entryId}`, back);
  if (item.docKind === 'receipt_revalue') {
    const receipt = item.docNo === null ? undefined : receipts.get(item.docNo);
    return receipt ? withBack(`/inventory/receipts/${receipt}`, back) : null;
  }
  return docKindLink(item.docKind, item.docId, back);
}

/** عنوان الكشف بصيغته (رأس الورقة). */
export function modeLabel(mode: StatementMode): string {
  if (mode === 'detailed') return t('stmt.mode.detailed', 'تفصيلي');
  if (mode === 'open') return t('stmt.mode.open', 'المفتوح فقط');
  return t('stmt.mode.summary', 'مختصر');
}

/** اسم الدفتر أو «كلّ الحسابات» (الرأس والطباعة والمشاركة). */
export function booksLabel(statement: Pick<PartyStatement, 'books'>, bookId: string): string {
  const book = bookId ? statement.books.find((entry) => entry.bookId === bookId) : undefined;
  return book ? bookLabel(book) : t('stmt.books.all', 'كلّ حسابات الجهة');
}

/** عنوان ملفّ الطباعة والإكسل: «كشف حساب — الاسم — الفترة». */
export function statementTitle(statement: Pick<PartyStatement, 'party' | 'from' | 'to'>): string {
  return t('stmt.print.title', 'كشف حساب — {name} — {from} إلى {to}', { name: statement.party.name, from: fmtDay(statement.from), to: fmtDay(statement.to) });
}

// ─── موادّ المستند (التفصيلي على الورقة وفي إكسل) ─────────────────────────────────────────────────────────────

/** مادّة من موادّ المستند: الكمية بوحدتها، والسعر والمبلغ (null: شراء بلا سعر، أو مرتجع بلا عمود سعر). */
export interface DocItem {
  key: string;
  name: string;
  qty: Milli;
  unit: string;
  price: Fils | null;
  amount: Fils | null;
}

/** سطر تحت الموادّ: المجموع والخصم وأجور الشراء (بلا مبلغ في عموده: المبلغ في اسمها) والصافي = مبلغ الحركة. */
export interface DocItemsFooter {
  key: string;
  label: string;
  amount: Fils | null;
}

export interface DocItems {
  /** للمرتجع لا عمود سعر. */
  priced: boolean;
  items: DocItem[];
  footers: DocItemsFooter[];
  /** ما دُفع عند الشراء ومن أيّ صندوق، أو null. */
  note: string | null;
}

/** سطر أجرة الشراء: اسمها ومبلغها وأين سُجّلت (نقداً، أو على حساب جهة الأجرة)، خارج حركة الشراء. */
function chargeLabel(charge: { label: string; amount: Fils; paid: 'cash' | 'party' }): string {
  return charge.paid === 'cash'
    ? t('stmt.charge.cash', 'أجور {label} {amount}: نقداً، خارج هذه الحركة', { label: charge.label, amount: moneyText(charge.amount) })
    : t('stmt.charge.party', 'أجور {label} {amount}: على حساب جهة الأجرة، خارج هذه الحركة', { label: charge.label, amount: moneyText(charge.amount) });
}

/** ما دُفع عند الشراء ومن أيّ صندوق (حركة الدفع سطر مستقلّ في الكشف). */
function paidNote(paidNow: Fils, box: string | null): string | null {
  if (paidNow <= 0n) return null;
  return box ? t('stmt.paid_now.box', 'دُفع منه عند الشراء {amount} من «{box}».', { amount: moneyText(paidNow), box }) : t('stmt.paid_now', 'دُفع منه عند الشراء {amount}.', { amount: moneyText(paidNow) });
}

/**
 * موادّ المستند تحت سطره (التفصيلي): الشراء والبيع والمرتجع والتسعير، لا سطر الإلغاء. الأجور سطور بلا مبلغ في عمود المبلغ: حركتها
 * مستقلّة أو نقداً، فالصافي = المجموع − الخصم بالضبط (ثابت العقد §4.4). null لما سواها.
 */
export function docItemsOf(line: Pick<StatementLine, 'detail' | 'reverses'>): DocItems | null {
  const { detail } = line;
  if (!detail || line.reverses) return null;
  switch (detail.type) {
    case 'purchase':
      return {
        priced: true,
        items: detail.lines.map((entry) => ({ key: `${entry.lineNo}`, name: entry.itemName, qty: entry.qty, unit: unitText(entry.unitLabel), price: entry.unitPrice, amount: entry.amount })),
        footers: [
          { key: 'sum', label: t('stmt.items.sum', 'مجموع الموادّ'), amount: detail.linesTotal },
          ...(detail.discount > 0n ? [{ key: 'discount', label: t('stmt.items.discount', 'الخصم'), amount: -detail.discount }] : []),
          ...detail.charges.map((charge, index) => ({ key: `charge-${index}`, label: chargeLabel(charge), amount: null })),
          { key: 'net', label: t('stmt.items.net', 'الصافي (مبلغ الحركة)'), amount: detail.net },
        ],
        note: paidNote(detail.paidNow, detail.account?.name ?? null),
      };
    case 'sale':
      return {
        priced: true,
        items: detail.lines.map((entry) => ({ key: `${entry.lineNo}`, name: entry.itemName, qty: entry.qty, unit: unitText(entry.baseUnit), price: entry.unitPrice, amount: entry.amount })),
        footers: [{ key: 'net', label: t('stmt.items.total', 'مجموع الفاتورة (مبلغ الحركة)'), amount: detail.total }],
        note: null,
      };
    case 'bird_sale':
      return {
        priced: true,
        items: [
          {
            key: 'birds',
            name: t('stmt.items.birds', 'دجاج لحم حيّ ({birds}، الصافي {net} كغم)', { birds: birdsCount(detail.birds), net: fmtMilli(detail.netKg) }),
            qty: detail.billedKg,
            unit: t('unit.kg', 'كغم'),
            price: detail.unitPrice,
            amount: detail.total,
          },
        ],
        footers: [
          ...(detail.deduction > 0n ? [{ key: 'deduction', label: t('stmt.items.deduction', 'الكمية هي الوزن المحسوب بعد تنزيل {pct} من الصافي', { pct: pctText(detail.deduction) }), amount: null }] : []),
          { key: 'net', label: t('stmt.items.total', 'مجموع الفاتورة (مبلغ الحركة)'), amount: detail.total },
        ],
        note:
          detail.paidNow > 0n
            ? detail.account
              ? t('stmt.received_now.box', 'قُبض منه عند البيع {amount} في «{box}».', { amount: moneyText(detail.paidNow), box: detail.account.name })
              : t('stmt.received_now', 'قُبض منه عند البيع {amount}.', { amount: moneyText(detail.paidNow) })
            : null,
      };
    case 'supplier_return':
      return {
        priced: false,
        items: detail.lines.map((entry) => ({ key: `${entry.lineNo}`, name: entry.itemName, qty: entry.qty, unit: unitText(entry.baseUnit), price: null, amount: entry.amount })),
        footers: [{ key: 'net', label: t('stmt.items.return_total', 'مجموع المرتجع (مبلغ الحركة)'), amount: detail.total }],
        note: null,
      };
    case 'revaluation':
      return {
        priced: true,
        items: [{ key: 'item', name: detail.itemName, qty: detail.qty, unit: unitText(detail.unitLabel), price: detail.unitPrice, amount: detail.newTotal }],
        footers: [
          { key: 'old', label: t('stmt.items.old_total', 'المبلغ قبله'), amount: detail.oldTotal },
          { key: 'net', label: t('stmt.items.diff', 'الفرق (مبلغ الحركة)'), amount: detail.diff },
        ],
        note: null,
      };
    default:
      return null;
  }
}

// ─── إكسل (CSV) ──────────────────────────────────────────────────────────────────────────────────────────────

/** علامة بداية UTF-8 (BOM): إكسل يقرأ العربية بها. */
export const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

/** رقم لإكسل: بلا فواصل آلاف (وإلّا قرأه نصّاً)، وبمرتبتين إذا فيه فلوس. ليس عرضاً على الشاشة. */
export function plainAmount(amount: Fils): string {
  return amount % 100n === 0n ? decimalText(amount / 100n, 0) : decimalText(amount, 2);
}

/** كمية لإكسل: بلا فواصل آلاف، وبمراتبها المعنوية وحدها (2000، 250.5). */
function plainQty(qty: Milli): string {
  return decimalText(qty, 3).replace(/\.?0+$/u, '');
}

/** خليّة إكسل: نصّ، أو رقم أنتجته الشاشة نفسها (المبلغ والكمية والعمر) يُكتب كما هو ولو كان سالباً. */
type CsvCell = string | { readonly num: string };
const num = (amount: Fils): CsvCell => ({ num: plainAmount(amount) });

/** بدايات تجعل إكسل يقرأ الخليّة صيغة (=، +، -، @، جدولة، رجوع سطر). */
const FORMULA_START: ReadonlySet<string> = new Set(['=', '+', '-', '@', String.fromCharCode(9), String.fromCharCode(13)]);

/** نصّ يبدأ بما يجعله إكسل صيغة (اسم جهة «=HYPERLINK(…)») يُسبق بفاصلة عليا فيُقرأ نصّاً (حقن الصيغ، مراجعة 0024 M6). */
const csvText = (value: string): string => (FORMULA_START.has(value.charAt(0)) ? `'${value}` : value);

const cell = (value: CsvCell): string => `"${(typeof value === 'string' ? csvText(value) : value.num).replace(/"/g, '""')}"`;
const csvLine = (values: readonly CsvCell[]): string => values.map(cell).join(',');

/** أعمدة الكشف الثمانية: التاريخ | رقم المستند | نوع المستند | البيان | عليه | له | الرصيد | عليه أو له. */
const ledgerHeader = (): string[] => [
  t('ledger.date', 'التاريخ'),
  t('stmt.col.doc', 'رقم المستند'),
  t('stmt.col.type', 'نوع المستند'),
  t('ledger.memo', 'البيان'),
  t('stmt.col.debit', 'عليه (مدين)'),
  t('stmt.col.credit', 'له (دائن)'),
  t('ledger.balance', 'الرصيد'),
  t('stmt.col.side', 'عليه أو له'),
];

/**
 * موادّ المستند في إكسل (التفصيلي، مراجعة 0024 L7): صفّ لكلّ مادّة ثمّ المجموع والخصم والأجور والصافي، برقم المستند؛ أرقامها في أعمدة
 * بعد أعمدة الكشف الثمانية (الكمية | الوحدة | السعر | المبلغ)، فعليه وله والرصيد تبقى أرقام الكشف وحده.
 */
const LEDGER_BLANKS = ['', '', '', ''] as const;
function itemRows(line: StatementLine): CsvCell[][] {
  const spec = docItemsOf(line);
  if (!spec) return [];
  const doc = line.docNo ?? '';
  const none = t('stmt.items.unpriced', 'بلا سعر');
  const money = (value: Fils | null): CsvCell => (value === null ? none : num(value));
  return [
    ...spec.items.map((item): CsvCell[] => ['', doc, t('stmt.csv.item', 'مادّة'), item.name, ...LEDGER_BLANKS, { num: plainQty(item.qty) }, item.unit, spec.priced ? money(item.price) : '', money(item.amount)]),
    ...spec.footers.map((footer): CsvCell[] => ['', doc, '', footer.label, ...LEDGER_BLANKS, '', '', '', footer.amount === null ? '' : num(footer.amount)]),
    ...(spec.note ? [['', doc, '', spec.note]] : []),
  ];
}

function bookRows(book: StatementBook, statement: Pick<PartyStatement, 'from' | 'to' | 'today'>, detailed: boolean): CsvCell[][] {
  const periodEnd = pastPeriodEnd(statement);
  const rows: CsvCell[][] = [
    [t('stmt.csv.book', 'الحساب'), bookLabel(book)],
    [...ledgerHeader(), ...(detailed ? [t('stmt.items.qty', 'الكمية'), t('stmt.items.unit', 'الوحدة'), t('stmt.items.price', 'السعر'), t('stmt.items.amount', 'المبلغ')] : [])],
    [statement.from, '', '', t('ledger.opening', 'رصيد سابق'), '', '', num(abs(book.broughtForward)), sideWord(book.broughtForward)],
  ];
  for (const line of book.lines) {
    const settled = settlementText(line, periodEnd);
    rows.push([
      line.onDate,
      line.docNo ?? '',
      docType(line, book.lines),
      settled ? t('stmt.csv.memo', '{memo} — {settled}', { memo: lineMemo(line), settled }) : lineMemo(line),
      line.debit === 0n ? '' : num(line.debit),
      line.credit === 0n ? '' : num(line.credit),
      num(abs(line.balance)),
      sideWord(line.balance),
    ]);
    if (detailed) rows.push(...itemRows(line));
  }
  rows.push(['', '', '', t('stmt.total', 'مجموع الفترة'), num(book.totalDebit), num(book.totalCredit), num(abs(book.closing)), sideWord(book.closing)]);
  if (periodEnd !== null && book.lines.length) rows.push(['', '', '', settledNote()]);
  return rows;
}

function openRows(book: StatementBook): CsvCell[][] {
  return [
    [t('stmt.csv.book', 'الحساب'), bookLabel(book)],
    [t('ledger.date', 'التاريخ'), t('stmt.col.doc', 'رقم المستند'), t('stmt.col.type', 'نوع المستند'), t('stmt.open.amount', 'المبلغ'), t('stmt.open.settled', 'المسدَّد'), t('stmt.open.remaining', 'المتبقّي'), t('stmt.open.age_days', 'العمر بالأيام'), t('stmt.col.side', 'عليه أو له')],
    ...book.openItems.map((item: OpenItem): CsvCell[] => [
      item.onDate,
      item.docNo ?? '',
      openItemType(item),
      num(item.amount),
      num(item.settled),
      num(item.remaining),
      { num: `${item.ageDays}` },
      item.side === 'debit' ? t('ledger.side.debit', 'عليه') : t('ledger.side.credit', 'له'),
    ]),
  ];
}

/** نوع المفتوح بلا تفصيل مستنده: من نوع الحركة ونوع مستندها (kindDocType). */
export function openItemType(item: Pick<OpenItem, 'kind' | 'docKind'>): string {
  return kindDocType(item.kind, item.docKind);
}

/**
 * ملف الكشف لإكسل: علامة البداية، ورأس الكشف، ثمّ لكلّ حساب سطوره (وفي التفصيلي موادّ كلّ مستند تحت سطره، أو المفتوح بصيغة «المفتوح
 * فقط»)، بنهايات أسطر CRLF.
 */
export function statementCsv(statement: PartyStatement, mode: StatementMode): string {
  const rows: CsvCell[][] = [
    [t('stmt.title', 'كشف حساب'), statement.party.name],
    [t('stmt.csv.org', 'المنشأة'), statement.orgName],
    [t('stmt.csv.period', 'الفترة'), statement.from, statement.to],
    [t('stmt.csv.currency', 'العملة'), t('stmt.currency.iqd', 'دينار عراقي')],
    [t('stmt.csv.mode', 'الصيغة'), modeLabel(mode)],
  ];
  for (const book of statement.books) rows.push([], ...(mode === 'open' ? openRows(book) : bookRows(book, statement, mode === 'detailed')));
  return BOM + rows.map(csvLine).join(CRLF) + CRLF;
}

// ─── المشاركة ─────────────────────────────────────────────────────────────────────────────────────────────────

/** نصّ قصير للمشاركة من الهاتف: الجهة والفترة ورصيد كلّ حساب بجهته، ومبلغ الحساب الواحد كتابةً. */
export function shareText(statement: PartyStatement): string {
  const lines = [
    t('stmt.share.head', 'كشف حساب «{party}» من {org}', { party: statement.party.name, org: statement.orgName }),
    t('stmt.share.period', 'الفترة: {from} — {to}', { from: fmtDay(statement.from), to: fmtDay(statement.to) }),
    ...statement.books.map((book) =>
      book.closing === 0n
        ? t('stmt.share.book_zero', '{book}: لا رصيد', { book: bookLabel(book) })
        : t('stmt.share.book', '{book}: {amount} دينار {side}', { book: bookLabel(book), amount: moneyText(abs(book.closing)), side: sideWord(book.closing) }),
    ),
  ];
  const [only] = statement.books;
  if (statement.books.length === 1 && only && only.closing !== 0n) lines.push(closingWords(only.closing));
  return lines.join(String.fromCharCode(10));
}

/** «المفتوح اليوم: PU-2026-0001 (متبقٍّ 635,000، عمره 40 يوماً)، …» لذيل الكشف المختصر والتفصيلي. */
export function openSummary(book: Pick<StatementBook, 'openItems'>): string | null {
  if (!book.openItems.length) return null;
  const items = book.openItems
    .map((item) => t('stmt.open.item', '{doc} (متبقٍّ {amount}، عمره {age})', { doc: item.docNo ?? openItemType(item), amount: moneyText(item.remaining), age: daysText(item.ageDays) }))
    .join(SEPARATOR());
  return t('stmt.open.summary', 'المفتوح اليوم: {items}', { items });
}
