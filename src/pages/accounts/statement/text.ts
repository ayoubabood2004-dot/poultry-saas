import { decimalText } from '../../../domain/decimal';
import type { Fils, Milli } from '../../../domain/money';
import { amountInWords } from '../../../domain/amountWords';
import { countForm, fmtDay, fmtMilli } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { Allocation, EntryDetail, OpenItem, PartyStatement, StatementBook, StatementLine } from '../../../lib/repo/statement';
import { daysText, moneyText, unitText } from '../papers';
import { bookLabel, entryKindLabel } from '../shared';

// نصوص الكشف الاحترافي (عقد 0024 §4.4 و§5، الخطّة §9.1): نوع المستند، والبيان مبنيّاً من المستند نفسه («شراء 2,000 كغم ذرة صفراء بسعر
// 450 — مخزن المواد»)، وما سدّده كلّ تسديد من التوزيع القائم، ورابط المستند أو السند، وملف إكسل (CSV بترميز UTF-8 وعلامة البداية،
// والأرقام بلا فواصل حتى يقرأها إكسل أرقاماً)، ونصّ المشاركة. كلّ عربية من t() وكلّ رقم معروض من format.ts.

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

/** نوع المستند (العمود الثالث). */
export function docType(line: Pick<StatementLine, 'kind' | 'detail' | 'reverses'>): string {
  const base = baseDocType(line);
  return line.reverses ? t('stmt.type.reversal', 'إلغاء {type}', { type: base }) : base;
}

function baseDocType({ kind, detail }: Pick<StatementLine, 'kind' | 'detail'>): string {
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
      return t('stmt.type.sale_payment', 'قبض عند البيع');
    case 'supplier_return':
      return t('stmt.type.supplier_return', 'مرتجع للمورّد');
    case 'expense':
      return t('stmt.type.expense', 'مصروف بالدين');
    case 'revaluation':
      return detail.pricing ? t('stmt.type.pricing', 'تسعير شراء') : t('stmt.type.revaluation', 'تصحيح سعر');
    case undefined:
      break;
  }
  switch (kind) {
    case 'payment':
      return t('stmt.type.receipt_voucher', 'سند قبض');
    case 'payout':
      return t('stmt.type.payment_voucher', 'سند صرف');
    case 'opening':
      return t('stmt.type.opening', 'رصيد افتتاحي');
    default:
      return entryKindLabel(kind);
  }
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
    case 'sale_payment': {
      const box = detail.account?.name ?? line.account?.name;
      return box ? t('stmt.memo.sale_payment', 'قُبض ثمن البيع في «{box}»', { box }) : t('stmt.type.sale_payment', 'قبض عند البيع');
    }
    case 'supplier_return': {
      const [only] = detail.lines;
      const vars = { receipt: detail.receiptDocNo, store: detail.warehouse.name };
      return detail.lines.length === 1 && only
        ? t('stmt.memo.return_one', 'إرجاع {qty} {item} إلى المورّد من {receipt} — {store}', { ...vars, qty: qtyUnit(only.qty, unitText(only.baseUnit)), item: only.itemName })
        : t('stmt.memo.return_many', 'إرجاع {items} إلى المورّد من {receipt} — {store}', { ...vars, items: itemsCount(detail.lines.length) });
    }
    case 'expense': {
      const month = `${detail.forMonth.slice(5, 7)}/${detail.forMonth.slice(0, 4)}`;
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

/** رقم المستند الآخر في التوزيع، أو نوعه وتاريخه لقيد بلا رقم (الافتتاح). */
export function allocationDoc(allocation: Pick<Allocation, 'docNo' | 'kind' | 'onDate'>): string {
  return allocation.docNo ?? t('stmt.alloc.bare', '{kind} {day}', { kind: entryKindLabel(allocation.kind), day: fmtDay(allocation.onDate) });
}

/** القيود التي تسدّد غيرها (قبض ودفع ومرتجع وإعفاء ومقاصّة): «سدّد: …»؛ وما سواها ديون: «سُدّد منه: …». */
const SETTLERS: ReadonlySet<StatementLine['kind']> = new Set(['payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'offset']);

/**
 * ما سدّده التسديد أو ما سُدّد من الدين، من التوزيع القائم: «سدّد: PU-2026-0012 (450,000)، PU-2026-0015 (50,000)، وبقي 50,000 غير
 * مخصّص لفاتورة». null بلا توزيع ولا باقٍ يُذكر.
 */
export function settlementText(line: Pick<StatementLine, 'kind' | 'allocations' | 'unallocated' | 'reverses' | 'reversed'>): string | null {
  if (line.reverses) return null;
  const items = line.allocations.map((allocation) => t('stmt.alloc.item', '{doc} ({amount})', { doc: allocationDoc(allocation), amount: moneyText(allocation.amount) })).join(SEPARATOR());
  const settler = SETTLERS.has(line.kind);
  if (!items) return settler && line.unallocated > 0n ? t('stmt.alloc.unallocated_all', 'لم يُخصَّص لفاتورة: {amount}', { amount: moneyText(line.unallocated) }) : null;
  const head = settler ? t('stmt.alloc.settled', 'سدّد: {items}', { items }) : t('stmt.alloc.paid_by', 'سُدّد منه: {items}', { items });
  if (line.unallocated === 0n) return head;
  return settler
    ? t('stmt.alloc.with_unallocated', '{head}، وبقي {amount} غير مخصّص لفاتورة', { head, amount: moneyText(line.unallocated) })
    : t('stmt.alloc.with_remaining', '{head}، والمتبقّي {amount}', { head, amount: moneyText(line.unallocated) });
}

/** رابط المستند أو السند (العقد §5)، أو null (المصروف والافتتاح والتسوية). back: طريق الرجوع إلى الكشف للسند. */
export function docLink(line: Pick<StatementLine, 'voucherId' | 'detail' | 'docKind' | 'docId'>, back: string | null = null): string | null {
  if (line.voucherId) return `/accounts/voucher/${line.voucherId}${back ? `?back=${encodeURIComponent(back)}` : ''}`;
  const { detail } = line;
  switch (detail?.type) {
    case 'purchase':
    case 'purchase_payment':
    case 'purchase_charge':
      return `/inventory/receipts/${detail.docId}`;
    case 'supplier_return':
      return `/inventory/supplier-returns/${detail.docId}`;
    case 'revaluation':
      return `/inventory/receipts/${detail.receiptId}`;
    case 'sale':
    case 'sale_payment':
      return `/sales/${detail.docId}${back ? `?back=${encodeURIComponent(back)}` : ''}`;
    case 'expense':
      return null;
    case undefined:
      break;
  }
  return docKindLink(line.docKind, line.docId, back);
}

/** رابط مستند بنوعه ومعرّفه (التوزيع والمفتوح، §7): الاستلام والمرتجع والبيع؛ وتصحيح السعر بلا معرّف استلامه فلا رابط. */
export function docKindLink(docKind: string | null, docId: string | null, back: string | null = null): string | null {
  if (!docId) return null;
  if (docKind === 'receipt') return `/inventory/receipts/${docId}`;
  if (docKind === 'supplier_return') return `/inventory/supplier-returns/${docId}`;
  if (docKind === 'sale') return `/sales/${docId}${back ? `?back=${encodeURIComponent(back)}` : ''}`;
  return null;
}

/** رابط مستند التوزيع: سند القبض أو الدفع بقيده (RC/PY بلا مستند)، وإلّا مستنده. */
export function allocationLink(allocation: Pick<Allocation, 'entryId' | 'kind' | 'docKind' | 'docId' | 'docNo'>, back: string | null = null): string | null {
  if (allocation.docKind === null && (allocation.kind === 'payment' || allocation.kind === 'payout') && allocation.docNo) {
    return `/accounts/voucher/${allocation.entryId}${back ? `?back=${encodeURIComponent(back)}` : ''}`;
  }
  return docKindLink(allocation.docKind, allocation.docId, back);
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

// ─── إكسل (CSV) ──────────────────────────────────────────────────────────────────────────────────────────────

/** علامة بداية UTF-8 (BOM): إكسل يقرأ العربية بها. */
export const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

/** رقم لإكسل: بلا فواصل آلاف (وإلّا قرأه نصّاً)، وبمرتبتين إذا فيه فلوس. ليس عرضاً على الشاشة. */
export function plainAmount(amount: Fils): string {
  return amount % 100n === 0n ? decimalText(amount / 100n, 0) : decimalText(amount, 2);
}

const cell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const csvLine = (values: readonly string[]): string => values.map(cell).join(',');

function bookRows(book: StatementBook, from: string): string[][] {
  const rows: string[][] = [
    [t('stmt.csv.book', 'الحساب'), bookLabel(book)],
    [t('ledger.date', 'التاريخ'), t('stmt.col.doc', 'رقم المستند'), t('stmt.col.type', 'نوع المستند'), t('ledger.memo', 'البيان'), t('stmt.col.debit', 'عليه (مدين)'), t('stmt.col.credit', 'له (دائن)'), t('ledger.balance', 'الرصيد'), t('stmt.col.side', 'الجهة')],
    [from, '', '', t('ledger.opening', 'رصيد سابق'), '', '', plainAmount(abs(book.broughtForward)), sideWord(book.broughtForward)],
  ];
  for (const line of book.lines) {
    const settled = settlementText(line);
    rows.push([
      line.onDate,
      line.docNo ?? '',
      docType(line),
      settled ? t('stmt.csv.memo', '{memo} — {settled}', { memo: lineMemo(line), settled }) : lineMemo(line),
      line.debit === 0n ? '' : plainAmount(line.debit),
      line.credit === 0n ? '' : plainAmount(line.credit),
      plainAmount(abs(line.balance)),
      sideWord(line.balance),
    ]);
  }
  rows.push(['', '', '', t('stmt.total', 'مجموع الفترة'), plainAmount(book.totalDebit), plainAmount(book.totalCredit), plainAmount(abs(book.closing)), sideWord(book.closing)]);
  return rows;
}

function openRows(book: StatementBook): string[][] {
  return [
    [t('stmt.csv.book', 'الحساب'), bookLabel(book)],
    [t('ledger.date', 'التاريخ'), t('stmt.col.doc', 'رقم المستند'), t('stmt.col.type', 'نوع المستند'), t('stmt.open.amount', 'المبلغ'), t('stmt.open.settled', 'المسدَّد'), t('stmt.open.remaining', 'المتبقّي'), t('stmt.open.age_days', 'العمر بالأيام'), t('stmt.col.side', 'الجهة')],
    ...book.openItems.map((item: OpenItem) => [
      item.onDate,
      item.docNo ?? '',
      openItemType(item),
      plainAmount(item.amount),
      plainAmount(item.settled),
      plainAmount(item.remaining),
      `${item.ageDays}`,
      item.side === 'debit' ? t('ledger.side.debit', 'عليه') : t('ledger.side.credit', 'له'),
    ]),
  ];
}

/** نوع القيد المفتوح بلا تفصيل مستنده: نوعه، أو «تصحيح سعر» لقيد تصحيح الاستلام. */
export function openItemType(item: Pick<OpenItem, 'kind' | 'docKind'>): string {
  if (item.docKind === 'receipt_revalue') return t('stmt.type.revalue_doc', 'تسعير أو تصحيح سعر');
  if (item.docKind === 'receipt' && item.kind === 'purchase') return t('stmt.type.purchase', 'فاتورة شراء');
  if (item.docKind === 'sale' && item.kind === 'invoice') return t('stmt.type.sale', 'فاتورة بيع');
  if (item.docKind === null && item.kind === 'payment') return t('stmt.type.receipt_voucher', 'سند قبض');
  if (item.docKind === null && item.kind === 'payout') return t('stmt.type.payment_voucher', 'سند صرف');
  if (item.kind === 'opening') return t('stmt.type.opening', 'رصيد افتتاحي');
  return entryKindLabel(item.kind);
}

/** ملف الكشف لإكسل: علامة البداية، ورأس الكشف، ثمّ لكلّ دفتر سطوره (أو مفتوحه بصيغة «المفتوح فقط»)، بنهايات أسطر CRLF. */
export function statementCsv(statement: PartyStatement, mode: StatementMode): string {
  const rows: string[][] = [
    [t('stmt.title', 'كشف حساب'), statement.party.name],
    [t('stmt.csv.org', 'المنشأة'), statement.orgName],
    [t('stmt.csv.period', 'الفترة'), statement.from, statement.to],
    [t('stmt.csv.currency', 'العملة'), t('stmt.currency.iqd', 'دينار عراقي')],
    [t('stmt.csv.mode', 'الصيغة'), modeLabel(mode)],
  ];
  for (const book of statement.books) rows.push([], ...(mode === 'open' ? openRows(book) : bookRows(book, statement.from)));
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
