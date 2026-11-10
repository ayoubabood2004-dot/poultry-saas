// الكشف الاحترافي والسندات وصفحة البيع (عقد 0024 F4 وF5 وF8، §4.4–§4.6 و§5 و§7؛ الخطّة §8.1 «1-د» و«1-هـ» و§9.1–§9.2): react-dom الحقيقي يرسم
// PartyStatementPage وVoucherPage وTransferVoucherPage وSaleDocPage الحقيقية وrepo/statement الحقيقي (المحلّلات وبناء النداءات) على core بديل يجيب
// بعيّنات القاعدة الحقيقية من fixtures/money-b.json. كلّ قيمة منتظرة تُحسب هنا من العيّنة (البيان ونوع المستند والروابط وما سدّده كلّ تسديد
// والمجاميع والكلمات)، فتبقى الحالات صحيحة إذا أُعيد توليدها؛ والفروع التي تخلو منها العيّنة (سطر شراء بلا سعر، ومصروف بالدين، ومفتوح بأعمار
// كثيرة، وسند بباقٍ بلا تخصيص أو بمصرف، وتحويل ملغى، وبيع ملغى أو نقديّ رُدّ مقبوضه) تُبنى من نسخة منها. والتفقيط نفسه مفحوص بجدوله
// (amount-words.test)، وهنا يُفحص أنّ الورقة تقول كلمات المبلغ الصحيح بجهته.
// الحالات: P المحلّلات وصرامتها وثوابت العيّنة (السلسلة والمواد = مبلغ القيد والتوزيع + الباقي = المبلغ)؛ S الكشف المختصر (الرأس والأعمدة
// والسطور والبيان وما سدّده والروابط والمجموع = مجموع الأعمدة والختام بالكلمات والأعمار والمفتوح والمطابقة والتوقيع وقياس A4 وترقيم الصفحات)؛
// D التفصيلي (موادّ كلّ مستند تحت سطره ومجموعها = مبلغ القيد)؛ O المفتوح فقط؛ X الإكسل؛ H المشاركة والإرسال؛ W الطباعة بعنوانها؛ B الرجوع
// والحساب والصيغة بالرابط؛ L قائمة الإلغاء للمدير؛ V السندات؛ R سند التحويل؛ Q صفحة البيع.
import {
  BUCKETS,
  bucketOf,
  bundle,
  byAction,
  bookName,
  choose,
  click,
  clone,
  createEnv,
  daysWord,
  Element,
  FIXTURE,
  fils,
  fire,
  first,
  fmtDay,
  installDom,
  milli,
  money,
  qtyText,
  SESSION,
  setupTables,
  side,
  tableOf,
  tablesIn,
  text,
} from './money-b-dom.mjs';

const ST = FIXTURE.party_statement_v2;
const KIND = { invoice: 'فاتورة بيع', purchase: 'استلام', bill: 'مصروف بالدين', payment: 'قبض', payout: 'دفع', return: 'مرتجع بيع', supplier_return: 'مرتجع للمورّد', forgiveness: 'إعفاء', opening: 'الرصيد عند البداية', adjustment: 'تسوية', offset: 'مقاصّة' };
const TYPE = { purchase: 'فاتورة شراء', purchase_payment: 'دفع عند الشراء', purchase_charge: 'أجور شراء', sale: 'فاتورة بيع', sale_payment: 'قبض عند البيع', supplier_return: 'مرتجع للمورّد', expense: 'مصروف بالدين' };
const UNIT = { kg: 'كغم', L: 'لتر', pc: 'قطعة', t: 'طن', g: 'غرام', mL: 'ملل' };
const CASH_KIND = { cash: 'نقد', bank: 'مصرف', wallet: 'محفظة' };
const SETTLERS = new Set(['payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'offset']);
const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);
const abs = (x) => (x < 0n ? -x : x);
const unitOf = (label) => UNIT[label] ?? label;
const itemsCount = (n) => (n === 2 ? 'مادّتين' : n % 100 >= 3 && n % 100 <= 10 ? `${n} موادّ` : `${n} مادّة`);
const balanceText = (amount) => `${money(abs(amount))}${side(amount)}`;
const plain = (amount) => (amount % 100n === 0n ? (amount / 100n).toString() : `${amount < 0n ? '-' : ''}${(abs(amount) / 100n).toString()}.${(abs(amount) % 100n).toString().padStart(2, '0')}`);
const localDayOf = (iso) => {
  const at = new Date(iso);
  return `${String(at.getFullYear()).padStart(4, '0')}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

// ── البيان ونوع المستند وما سدّده والروابط: القواعد مكتوبة هنا من العقد، مستقلّة عن الشاشة ─────────────────────────────
function typeOf(line) {
  const d = line.detail;
  const base = d
    ? d.type === 'revaluation'
      ? d.pricing
        ? 'تسعير شراء'
        : 'تصحيح سعر'
      : TYPE[d.type]
    : line.kind === 'payment'
      ? 'سند قبض'
      : line.kind === 'payout'
        ? 'سند صرف'
        : line.kind === 'opening'
          ? 'رصيد افتتاحي'
          : KIND[line.kind];
  return line.reverses ? `إلغاء ${base}` : base;
}

function memoOf(line) {
  const d = line.detail;
  let base;
  if (d) {
    const one = d.lines?.length === 1 ? d.lines[0] : null;
    switch (d.type) {
      case 'purchase': {
        const head = one
          ? one.unit_price === null
            ? `شراء ${qtyText(one.qty)} ${unitOf(one.unit_label)} ${one.item_name} بلا سعر — ${d.warehouse.name}`
            : `شراء ${qtyText(one.qty)} ${unitOf(one.unit_label)} ${one.item_name} بسعر ${money(fils(one.unit_price))} — ${d.warehouse.name}`
          : `شراء ${itemsCount(d.lines.length)} — ${d.warehouse.name}`;
        base = fils(d.discount) > 0n ? `${head}، بعد خصم ${money(fils(d.discount))}` : head;
        break;
      }
      case 'purchase_payment':
        base = `دُفع عند الشراء من «${(d.account ?? line.account).name}»`;
        break;
      case 'purchase_charge':
        base = `أجور ${d.label} عن ${d.doc_no} — ${d.warehouse.name}`;
        break;
      case 'sale': {
        const head = one ? `بيع ${qtyText(one.qty)} ${unitOf(one.base_unit)} ${one.item_name} بسعر ${money(fils(one.unit_price))} — ${d.warehouse.name}` : `بيع ${itemsCount(d.lines.length)} — ${d.warehouse.name}`;
        base = d.payment === 'cash' ? `${head}، نقداً` : head;
        break;
      }
      case 'sale_payment':
        base = `قُبض ثمن البيع في «${(d.account ?? line.account).name}»`;
        break;
      case 'supplier_return':
        base = one
          ? `إرجاع ${qtyText(one.qty)} ${unitOf(one.base_unit)} ${one.item_name} إلى المورّد من ${d.receipt_doc_no} — ${d.warehouse.name}`
          : `إرجاع ${itemsCount(d.lines.length)} إلى المورّد من ${d.receipt_doc_no} — ${d.warehouse.name}`;
        break;
      case 'expense': {
        const month = `${d.for_month.slice(5, 7)}/${d.for_month.slice(0, 4)}`;
        base = d.note ? `مصروف ${d.category} لشهر ${month}: ${d.note}` : `مصروف ${d.category} لشهر ${month}`;
        break;
      }
      case 'revaluation': {
        const qty = `${qtyText(d.qty)} ${unitOf(d.unit_label)}`;
        base = d.pricing
          ? d.unit_price === null
            ? `تسعير شراء ${qty} ${d.item_name} في ${d.receipt_doc_no} بمبلغ ${money(fils(d.new_total))}`
            : `تسعير شراء ${qty} ${d.item_name} في ${d.receipt_doc_no} بسعر ${money(fils(d.unit_price))}`
          : `تصحيح سعر ${d.item_name} في ${d.receipt_doc_no}: من ${money(fils(d.old_total))} إلى ${money(fils(d.new_total))}`;
        break;
      }
    }
  } else if (line.kind === 'payment') base = line.account ? `قبض في «${line.account.name}»` : 'قبض';
  else if (line.kind === 'payout') base = line.account ? `دفع من «${line.account.name}»` : 'دفع';
  else if (line.kind === 'opening') base = 'الرصيد عند بداية التعامل';
  else base = !line.reverses && line.reason ? `${KIND[line.kind]}: ${line.reason}` : KIND[line.kind];
  if (line.reverses) return line.reason ? `إلغاء: ${base} — السبب: ${line.reason}` : `إلغاء: ${base}`;
  return line.reversed ? `${base} (أُلغي)` : base;
}

const allocDoc = (a) => a.doc_no ?? `${KIND[a.kind]} ${fmtDay(a.on_date)}`;
function settledOf(line) {
  if (line.reverses) return null;
  const items = line.allocations.map((a) => `${allocDoc(a)} (${money(fils(a.amount))})`).join('، ');
  const settler = SETTLERS.has(line.kind);
  const rest = fils(line.unallocated);
  if (!items) return settler && rest > 0n ? `لم يُخصَّص لفاتورة: ${money(rest)}` : null;
  const head = settler ? `سدّد: ${items}` : `سُدّد منه: ${items}`;
  if (rest === 0n) return head;
  return settler ? `${head}، وبقي ${money(rest)} غير مخصّص لفاتورة` : `${head}، والمتبقّي ${money(rest)}`;
}

function linkOf(line, here) {
  const back = `?back=${encodeURIComponent(here)}`;
  if (line.voucher_id) return `/accounts/voucher/${line.voucher_id}${back}`;
  const d = line.detail;
  if (d) {
    if (['purchase', 'purchase_payment', 'purchase_charge'].includes(d.type)) return `/inventory/receipts/${d.doc_id}`;
    if (d.type === 'supplier_return') return `/inventory/supplier-returns/${d.doc_id}`;
    if (d.type === 'revaluation') return `/inventory/receipts/${d.receipt_id}`;
    if (d.type === 'sale' || d.type === 'sale_payment') return `/sales/${d.doc_id}${back}`;
    if (d.type === 'expense') return null;
  }
  return kindLink(line.doc_kind, line.doc_id, here);
}
function kindLink(docKind, docId, here) {
  if (!docId) return null;
  if (docKind === 'receipt') return `/inventory/receipts/${docId}`;
  if (docKind === 'supplier_return') return `/inventory/supplier-returns/${docId}`;
  if (docKind === 'sale') return `/sales/${docId}?back=${encodeURIComponent(here)}`;
  return null;
}
function allocLink(a, here) {
  if (a.doc_kind === null && (a.kind === 'payment' || a.kind === 'payout') && a.doc_no) return `/accounts/voucher/${a.entry_id}?back=${encodeURIComponent(here)}`;
  return kindLink(a.doc_kind, a.doc_id, here);
}
function openType(item) {
  if (item.doc_kind === 'receipt_revalue') return 'تسعير أو تصحيح سعر';
  if (item.doc_kind === 'receipt' && item.kind === 'purchase') return 'فاتورة شراء';
  if (item.doc_kind === 'sale' && item.kind === 'invoice') return 'فاتورة بيع';
  if (item.doc_kind === null && item.kind === 'payment') return 'سند قبض';
  if (item.doc_kind === null && item.kind === 'payout') return 'سند صرف';
  if (item.kind === 'opening') return 'رصيد افتتاحي';
  return KIND[item.kind];
}
const voidableOf = (line) => (line.reverses || line.reversed ? null : line.kind === 'payment' || line.kind === 'payout' ? 'payment' : line.doc_kind !== null ? null : ['opening', 'adjustment', 'forgiveness'].includes(line.kind) ? 'entry' : null);
/** مراتب عمود الكمية: أقلّ مراتب تبيّن كلّ القيم (columnDecimals)، ثمّ الكمية بها (fmtQtyCell). */
const qtyCells = (values) => {
  const decimals = Math.max(0, ...values.map((value) => (milli(value) % 1000n).toString().padStart(3, '0').replace(/0+$/, '').length));
  return values.map((value) => {
    const units = milli(value);
    const whole = (units / 1000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimals === 0 ? whole : `${whole}.${(units % 1000n).toString().padStart(3, '0').slice(0, decimals)}`;
  });
};
/** يقرأ ملف CSV بسيطاً (خلايا بين علامتي تنصيص). */
const parseCsv = (body) =>
  body
    .split(CRLF)
    .filter((row) => row !== '')
    .map((row) => [...row.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"')));

export default async function (t) {
  const restoreDom = installDom();
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const savedCreate = URL.createObjectURL;
  const savedRevoke = URL.revokeObjectURL;
  const proto = Element.prototype;
  const savedClick = Object.getOwnPropertyDescriptor(proto, 'click');
  let shared = [];
  let copied = [];
  let blobs = [];
  let clicked = [];
  const setNavigator = ({ share = true, clipboard = true } = {}) => {
    shared = [];
    copied = [];
    const fake = { onLine: true, userAgent: 'node' };
    if (share) fake.share = async (data) => void shared.push(data);
    if (clipboard) fake.clipboard = { writeText: async (value) => void copied.push(value) };
    Object.defineProperty(globalThis, 'navigator', { value: fake, configurable: true, writable: true });
  };
  try {
    const m = await bundle([
      "export { default as PartyStatementPage, voidable } from './src/pages/accounts/PartyStatementPage.tsx';",
      "export { default as VoucherPage } from './src/pages/accounts/vouchers/VoucherPage.tsx';",
      "export { default as TransferVoucherPage } from './src/pages/accounts/vouchers/TransferVoucherPage.tsx';",
      "export { default as SaleDocPage } from './src/pages/sales/SaleDocPage.tsx';",
      "export { parsePartyStatement, parseVoucher, parseTransfer, parseSaleDoc } from './src/lib/repo/statement.ts';",
      "export { amountInWords } from './src/domain/amountWords.ts';",
    ]);
    const env = createEnv(m);
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error?.stack ?? error}`);
      }
      await env.unmount();
    };
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return `blob:test/${blobs.length}`;
    };
    URL.revokeObjectURL = () => {};
    proto.click = function () {
      clicked.push({ href: this.href, download: this.download });
    };
    const allBooks = [...ST.supplier.books, ...ST.customer.books].map((book) => ({ book_id: book.book_id, division_id: book.division_id, division_kind: book.division_kind, code: book.code, name: book.name }));
    const tables = setupTables([...new Map([...FIXTURE.debts_overview.receivable.books, ...allBooks].map((book) => [book.book_id, book])).values()]);
    const statementRoute = [['/accounts/parties/:id', m.PartyStatementPage]];
    const words = (amount) => (amount === 0n ? m.amountInWords(0n) : `${m.amountInWords(amount)} — ${side(amount)}`);

    // ── P: المحلّلات وثوابت العيّنة ──────────────────────────────────────────────────────────────────────────
    for (const [who, sample] of Object.entries(ST)) {
      const parsed = m.parsePartyStatement(clone(sample));
      t.same([parsed.orgName, parsed.party.id, parsed.party.phone, parsed.from, parsed.to, parsed.today, parsed.books.length], [sample.org.name, sample.party.id, sample.party.phone, sample.from, sample.to, sample.today, sample.books.length], `P ${who}: المنشأة والجهة والفترة واليوم والحسابات`);
      sample.books.forEach((book, b) => {
        const pb = parsed.books[b];
        t.same(
          pb.lines.map((line) => [line.entryId, line.debit, line.credit, line.balance, line.voucherId, line.reverses, line.detail?.type ?? null, line.allocations.length, line.unallocated, line.account?.name ?? null]),
          book.lines.map((line) => [line.entry_id, fils(line.debit), fils(line.credit), fils(line.balance), line.voucher_id, line.reverses, line.detail?.type ?? null, line.allocations.length, fils(line.unallocated), line.account?.name ?? null]),
          `P ${who} ${book.name}: السطور بمبالغها وروابطها وتفاصيلها`,
        );
        t.same([pb.aging.side, ...BUCKETS.map((bucket) => pb.aging[bucket]), pb.openItems.map((item) => [item.remaining, item.ageDays, item.side])], [book.aging.side, ...BUCKETS.map((bucket) => fils(book.aging[bucket])), book.open_items.map((item) => [fils(item.remaining), item.age_days, item.side])], `P ${who} ${book.name}: الأعمار والمفتوح`);
        // ثوابت العقد على العيّنة: السلسلة، والمواد = مبلغ القيد، والتوزيع + الباقي = المبلغ.
        let running = fils(book.brought_forward);
        const chain = book.lines.map((line) => {
          running += fils(line.debit) - fils(line.credit);
          return running === fils(line.balance);
        });
        t.same([chain.every(Boolean), running, book.lines.reduce((s, l) => s + fils(l.debit), 0n), book.lines.reduce((s, l) => s + fils(l.credit), 0n)], [true, fils(book.closing), fils(book.total_debit), fils(book.total_credit)], `ثابت ${who} ${book.name}: الرصيد = المدوَّر + الجاري، والختام والمجموعان`);
        for (const line of book.lines) {
          const amount = fils(line.debit) + fils(line.credit);
          const d = line.detail;
          if (d?.type === 'purchase') {
            const priced = d.lines.reduce((s, l) => s + (l.amount === null ? 0n : fils(l.amount)), 0n);
            t.same([priced, fils(d.lines_total) - fils(d.discount), fils(d.net)], [fils(d.lines_total), fils(d.net), fils(line.credit)], `ثابت ${d.doc_no}: مجموع الموادّ − الخصم = الصافي = «له» القيد`);
          }
          if (d?.type === 'sale' || d?.type === 'supplier_return') t.same([d.lines.reduce((s, l) => s + fils(l.amount), 0n), fils(d.total)], [fils(d.total), fils(line.debit) + fils(line.credit)], `ثابت ${d.doc_no}: مجموع الموادّ = مبلغ القيد`);
          if (d?.type === 'revaluation') t.eq(fils(d.new_total) - fils(d.old_total), fils(d.diff), `ثابت ${d.receipt_doc_no}: الجديد − القديم = الفرق`);
          if (!line.reverses && !line.reversed) t.eq(line.allocations.reduce((s, a) => s + fils(a.amount), 0n) + fils(line.unallocated), amount, `ثابت ${line.doc_no ?? line.kind}: ما سدّده (أو سُدّد منه) + الباقي = مبلغه`);
        }
      });
    }
    t.ok(
      ['purchase', 'purchase_payment', 'sale', 'sale_payment', 'supplier_return', 'revaluation'].every((type) => [...ST.supplier.books, ...ST.customer.books].some((book) => book.lines.some((line) => line.detail?.type === type))) &&
        [...ST.supplier.books, ...ST.customer.books].some((book) => book.lines.some((line) => line.reverses)) &&
        ST.supplier.books.length >= 2,
      'شرط العيّنة: شراء ودفعه وبيع وقبضه ومرتجع وتسعير، وإلغاء بسطر عكسه، والمورّد بحسابين',
    );
    const strict = (name, value) => t.throws(() => m.parsePartyStatement(value), `P صارم: ${name}`);
    const supplier = () => clone(ST.supplier);
    strict('مبلغ رقماً لا نصّاً', (() => { const x = supplier(); x.books[0].lines[0].debit = 0; return x; })());
    strict('نوع تفصيل مجهول', (() => { const x = supplier(); x.books[0].lines[0].detail = { type: 'gift' }; return x; })());
    strict('سطر بلا توزيع', (() => { const x = supplier(); delete x.books[0].lines[0].allocations; return x; })());
    strict('جهة أعمار مجهولة', (() => { const x = supplier(); x.books[0].aging.side = 'both'; return x; })());
    const nullable = supplier();
    const purchase = nullable.books.flatMap((book) => book.lines).find((line) => line.detail?.type === 'purchase');
    purchase.detail.lines[0].amount = null;
    purchase.detail.lines[0].unit_price = null;
    purchase.detail.account = null;
    t.same(m.parsePartyStatement(nullable).books.flatMap((book) => book.lines).find((line) => line.entryId === purchase.entry_id).detail.lines[0].amount, null, 'P سطر شراء بلا سعر: المبلغ null');
    for (const [name, sample] of Object.entries(FIXTURE.voucher_detail)) {
      const v = m.parseVoucher(clone(sample));
      t.same([v.type, v.docNo, v.amount, v.allocations.length, v.unallocated, v.account.kind, v.void?.reason ?? null], [sample.type, sample.doc_no, fils(sample.amount), sample.allocations.length, fils(sample.unallocated), sample.account.kind, sample.void?.reason ?? null], `P سند ${name}`);
    }
    t.throws(() => m.parseVoucher({ ...clone(FIXTURE.voucher_detail.receipt), type: 'gift' }), 'P صارم: نوع سند مجهول');
    const tr = m.parseTransfer(clone(FIXTURE.transfer_detail.live));
    t.same([tr.from.kind, tr.to.kind, tr.amount, tr.note, tr.void], [FIXTURE.transfer_detail.live.from.kind, FIXTURE.transfer_detail.live.to.kind, fils(FIXTURE.transfer_detail.live.amount), FIXTURE.transfer_detail.live.note, null], 'P سند التحويل');
    const sd = m.parseSaleDoc(clone(FIXTURE.sale_detail));
    t.same([sd.docNo, sd.qty, sd.money?.lineTotal, sd.cost?.profit ?? null, sd.draws.length], [FIXTURE.sale_detail.doc_no, milli(FIXTURE.sale_detail.qty), fils(FIXTURE.sale_detail.money.line_total), FIXTURE.sale_detail.cost?.money ? fils(FIXTURE.sale_detail.cost.money.profit) : null, FIXTURE.sale_detail.draws.length], 'P صفحة البيع');
    t.eq(m.parseSaleDoc({ ...clone(FIXTURE.sale_detail), cost: {} }).cost, null, 'P البيع بلا كلفة لغير أدوار الكلفة (cost بلا money)');

    // ── S: الكشف المختصر لكلّ جهة ───────────────────────────────────────────────────────────────────────────
    for (const [who, sample] of Object.entries(ST)) {
      await step(`S ${who}`, async () => {
        env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
        const here = `/accounts/parties/${sample.party.id}`;
        await env.mount(here, statementRoute);
        const [args] = env.calls('party_statement_v2');
        const today = localDayOf(new Date().toISOString());
        t.same(args, { p_party: sample.party.id, p_book: null, p_from: `${today.slice(0, 4)}-01-01`, p_to: today }, `S ${who}: النداء بالجهة وكلّ الحسابات والسنة الجارية`);
        t.same(
          [text(first('org-name')), text(first('party-name')), text(first('head-book')), text(first('head-period')), text(first('head-printed'))],
          [sample.org.name, sample.party.phone ? `${sample.party.name} — ${sample.party.phone}` : sample.party.name, 'كلّ حسابات الجهة', `من ${fmtDay(sample.from)} إلى ${fmtDay(sample.to)}`, fmtDay(sample.today)],
          `S ${who}: الرأس — المنشأة والجهة وهاتفها والحساب والفترة وتاريخ الطباعة`,
        );
        t.ok(text(first('statement-head')).includes('كشف حساب') && text(first('statement-head')).includes('العملة: دينار عراقي') && text(first('statement-head')).includes('مختصر'), `S ${who}: «كشف حساب» والعملة والصيغة`);
        const style = descendantsOf('style').find((n) => n.getAttribute('data-page-style') === 'A4');
        t.ok(Boolean(style) && ['size: A4 portrait', '"صفحة "', 'counter(page)', '" من "', 'counter(pages)', '@bottom-center'].every((part) => style.textContent.includes(part)), `S ${who}: A4 عمودياً و«صفحة س من ص» بهامش الصفحة من t()`);
        for (const book of sample.books) {
          const section = descendantsOf('section').find((n) => n.getAttribute('data-book') === book.book_id);
          t.eq(descendantsOf('h3', section)[0]?.textContent, `الحساب: ${bookName(book)}`, `S ${who}: عنوان الحساب ${book.name}`);
          const table = tableOf(tablesIn(section)[0]);
          t.same(table.headers, ['التاريخ', 'رقم المستند', 'نوع المستند', 'البيان', 'عليه (مدين)', 'له (دائن)', 'الرصيد'], `S ${who} ${book.name}: سبعة أعمدة`);
          t.same(table.body[0], [fmtDay(sample.from), '', '', 'رصيد سابق', '', '', fils(book.brought_forward) === 0n ? '0' : balanceText(fils(book.brought_forward))], `S ${who} ${book.name}: أوّل سطر «رصيد سابق»`);
          t.same(
            table.body.slice(1),
            book.lines.map((line) => [
              fmtDay(line.on_date),
              line.doc_no ?? '',
              typeOf(line),
              `${memoOf(line)}${settledOf(line) ?? ''}`,
              fils(line.debit) === 0n ? '' : money(fils(line.debit)),
              fils(line.credit) === 0n ? '' : money(fils(line.credit)),
              fils(line.balance) === 0n ? '0' : balanceText(fils(line.balance)),
            ]),
            `S ${who} ${book.name}: كلّ سطر بتاريخه ورقمه ونوعه وبيانه من مستنده وما سدّده ومبلغه ورصيده بجهته`,
          );
          const sum = (col) => table.body.slice(1).reduce((s, row) => s + (row[col] ? BigInt(row[col].replace(/,/g, '')) * 100n : 0n), 0n);
          t.same(table.foot[0], ['مجموع الفترة', money(sum(4)), money(sum(5)), fils(book.closing) === 0n ? '0' : balanceText(fils(book.closing))], `S ${who} ${book.name}: «مجموع الفترة» = مجموع العمودين، والرصيد الأخير = الختام`);
          t.same([sum(4), sum(5)], [fils(book.total_debit), fils(book.total_credit)], `S ${who} ${book.name}: ومجموعا العمودين = مجموعي الخادم`);
          const links = byAction('doc-link', section).map((n) => [n.textContent, n.getAttribute('href')]);
          t.same(links, book.lines.filter((line) => line.doc_no && linkOf(line, here)).map((line) => [line.doc_no, linkOf(line, here)]), `S ${who} ${book.name}: رقم المستند يفتح سنده أو مستنده (§5)`);
          const closing = fils(book.closing);
          t.eq(text(first('closing', section)), `${closing === 0n ? 'الرصيد الختامي: لا شيء عليه ولا له' : `الرصيد الختامي: ${money(abs(closing))} دينار ${side(closing)}`}${words(closing)}`, `S ${who} ${book.name}: الرصيد الختامي بالأرقام والكلمات وجهته`);
          const aging = tableOf(tablesIn(first('aging', section))[0]);
          const agingTotal = BUCKETS.reduce((s, bucket) => s + fils(book.aging[bucket]), 0n);
          t.same(aging.body[0], [book.aging.side === 'debit' ? 'عليه' : book.aging.side === 'credit' ? 'له' : 'لا مفتوح', ...BUCKETS.map((bucket) => money(fils(book.aging[bucket]))), money(agingTotal)], `S ${who} ${book.name}: أعمار الرصيد اليوم بجهتها`);
          t.eq(byAction('aging-today', section).length, sample.to < sample.today ? 1 : 0, `S ${who} ${book.name}: تنبيه «محسوبة لليوم» حين تنتهي الفترة قبله فقط`);
          const open = book.open_items.map((item) => `${item.doc_no ?? openType(item)} (متبقٍّ ${money(fils(item.remaining))}، عمره ${daysWord(item.age_days)})`).join('، ');
          t.eq(text(first('open-summary', section)), open ? `المفتوح اليوم: ${open}` : '', `S ${who} ${book.name}: المفتوح اليوم بمتبقّيه وعمره`);
        }
        t.eq(text(first('confirm-sentence')), 'نرجو مطابقة الرصيد، وإعلامنا بأيّ اختلاف خلال 15 يوماً من تاريخه.', `S ${who}: عبارة المطابقة`);
        t.same(byAction('signatures').map((n) => n.children.map((c) => c.textContent)), [['المحاسب', 'المدير']], `S ${who}: سطرا التوقيع`);
        t.eq(first('back')?.getAttribute('href'), '/accounts/debts', `S ${who}: الرجوع بلا ?back إلى قائمة الذمم`);
        t.eq(byAction('void-entry').length, 0, `S ${who}: المحاسب بلا قائمة إلغاء`);
      });
    }

    // ── D: التفصيلي — موادّ كلّ مستند تحت سطره ───────────────────────────────────────────────────────────────
    const detailed = clone(ST.supplier);
    const unpricedLine = detailed.books.flatMap((book) => book.lines).find((line) => line.detail?.type === 'purchase');
    // فرع تخلو منه العيّنة: سطر شراء ثالث بلا سعر (المبلغ والسعر null)، والمجاميع كما هي (السطر بلا سعر خارج المجموع).
    unpricedLine.detail.lines.push({ ...clone(unpricedLine.detail.lines[0]), line_no: unpricedLine.detail.lines.length + 1, item_name: 'نخالة', qty: '250.500', amount: null, unit_price: null });
    for (const [who, sample] of [['supplier', detailed], ['customer', ST.customer]]) {
      await step(`D ${who}`, async () => {
        env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
        await env.mount(`/accounts/parties/${sample.party.id}?mode=detailed`, statementRoute);
        t.ok(text(first('statement-head')).includes('تفصيلي'), `D ${who}: الصيغة «تفصيلي» من الرابط`);
        for (const book of sample.books) {
          const section = descendantsOf('section').find((n) => n.getAttribute('data-book') === book.book_id);
          const outer = tablesIn(section)[0];
          const subRows = tableOf(outer).rows.filter((tr) => tr.getAttribute('data-sub-row') !== null);
          const withItems = book.lines.filter((line) => !line.reverses && ['purchase', 'sale', 'supplier_return', 'revaluation'].includes(line.detail?.type));
          t.eq(subRows.length, withItems.length, `D ${who} ${book.name}: جدول موادّ تحت كلّ شراء وبيع ومرتجع وتسعير (لا تحت سطر الإلغاء)`);
          for (const line of withItems) {
            const block = byAction('doc-items', section).find((n) => n.getAttribute('data-entry') === line.entry_id);
            const items = tableOf(tablesIn(block)[0]);
            const d = line.detail;
            const amount = fils(line.debit) + fils(line.credit);
            if (d.type === 'purchase') {
              t.same(items.headers, ['المادّة', 'الكمية', 'الوحدة', 'السعر', 'المبلغ'], `D ${d.doc_no}: أعمدة الموادّ`);
              const qty = qtyCells(d.lines.map((l) => l.qty));
              t.same(items.body, d.lines.map((l, i) => [l.item_name, qty[i], unitOf(l.unit_label), l.unit_price === null ? 'بلا سعر' : money(fils(l.unit_price)), l.amount === null ? 'بلا سعر' : money(fils(l.amount))]), `D ${d.doc_no}: كلّ مادّة بكميتها ووحدتها (لا «kg» خاماً) وسعرها ومبلغها، وبلا سعر «بلا سعر»`);
              const charges = d.charges.map((c) => [c.paid === 'cash' ? `أجور ${c.label} ${money(fils(c.amount))}: نقداً، خارج هذا القيد` : `أجور ${c.label} ${money(fils(c.amount))}: على حساب جهة الأجرة، خارج هذا القيد`, '']);
              t.same(items.foot, [['مجموع الموادّ', money(fils(d.lines_total))], ...(fils(d.discount) > 0n ? [['الخصم', money(-fils(d.discount))]] : []), ...charges, ['الصافي (مبلغ القيد)', money(amount)]], `D ${d.doc_no}: المجموع ثمّ الخصم ثمّ الأجور (خارج القيد، بلا مبلغ في عموده) ثمّ الصافي = مبلغ القيد`);
              t.eq(fils(d.lines_total) - fils(d.discount), amount, `D ${d.doc_no}: المجموع − الخصم = مبلغ القيد بالضبط`);
              const paid = fils(d.paid_now) > 0n ? (d.account ? `دُفع منه عند الشراء ${money(fils(d.paid_now))} من «${d.account.name}».` : `دُفع منه عند الشراء ${money(fils(d.paid_now))}.`) : '';
              t.eq(text(first('doc-note', block)), paid, `D ${d.doc_no}: المدفوع عند الشراء وصندوقه`);
            } else if (d.type === 'sale') {
              t.same(items.body, d.lines.map((l, i) => [l.item_name, qtyCells(d.lines.map((x) => x.qty))[i], unitOf(l.base_unit), money(fils(l.unit_price)), money(fils(l.amount))]), `D ${d.doc_no}: موادّ البيع`);
              t.same(items.foot, [['مجموع الفاتورة (مبلغ القيد)', money(amount)]], `D ${d.doc_no}: مجموع الفاتورة = مبلغ القيد`);
            } else if (d.type === 'supplier_return') {
              t.same(items.headers, ['المادّة', 'الكمية', 'الوحدة', 'المبلغ'], `D ${d.doc_no}: المرتجع بلا عمود سعر`);
              t.same(items.foot, [['مجموع المرتجع (مبلغ القيد)', money(amount)]], `D ${d.doc_no}: مجموع المرتجع = مبلغ القيد`);
            } else {
              t.same(items.body, [[d.item_name, qtyCells([d.qty])[0], unitOf(d.unit_label), d.unit_price === null ? 'بلا سعر' : money(fils(d.unit_price)), money(fils(d.new_total))]], `D ${d.receipt_doc_no}: التسعير بكميته ووحدته (لا «L» خاماً) وسعره`);
              t.same(items.foot, [['المبلغ قبله', money(fils(d.old_total))], ['الفرق (مبلغ القيد)', money(amount)]], `D ${d.receipt_doc_no}: القديم ثمّ الفرق = مبلغ القيد`);
            }
          }
        }
      });
    }

    // ── O: المفتوح فقط، ومفتوح بأعمار كثيرة (فرع تخلو منه العيّنة) ────────────────────────────────────────────────
    const aged = clone(ST.supplier);
    const [template] = aged.books[0].open_items;
    aged.books[0].open_items = [10, 45, 75, 120].map((age, i) => ({ ...clone(template), entry_id: `${template.entry_id.slice(0, -2)}${i}0`, age_days: age, doc_no: i === 3 ? null : template.doc_no, doc_kind: i === 3 ? null : template.doc_kind, doc_id: i === 3 ? null : template.doc_id, kind: i === 3 ? 'opening' : template.kind }));
    await step('O open', async () => {
      env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(aged) }, tables });
      const here = `/accounts/parties/${aged.party.id}`;
      await env.mount(`${here}?mode=open`, statementRoute);
      for (const book of aged.books) {
        const section = descendantsOf('section').find((n) => n.getAttribute('data-book') === book.book_id);
        const table = tableOf(tablesIn(section)[0]);
        t.same(table.headers, ['التاريخ', 'رقم المستند', 'نوع المستند', 'المبلغ', 'المسدَّد', 'المتبقّي', 'العمر'], `O ${book.name}: أعمدة المفتوح`);
        t.same(table.body, book.open_items.map((item) => [fmtDay(item.on_date), item.doc_no ?? '', openType(item), money(fils(item.amount)), money(fils(item.settled)), money(fils(item.remaining)), daysWord(item.age_days)]), `O ${book.name}: كلّ مفتوح بمبلغه ومسدَّده ومتبقّيه وعمره`);
        const total = (key) => money(book.open_items.reduce((s, item) => s + fils(item[key]), 0n));
        t.same(table.foot[0], ['المجموع', total('amount'), total('settled'), total('remaining'), ''], `O ${book.name}: المجاميع = مجموع الأعمدة`);
        t.same(
          descendantsOf('span', section).filter((n) => n.getAttribute('data-age') !== null).map((n) => n.getAttribute('data-bucket')),
          book.open_items.map((item) => bucketOf(item.age_days)),
          `O ${book.name}: العمر بلون فئته`,
        );
        t.same(byAction('doc-link', section).map((n) => n.getAttribute('href')), book.open_items.filter((item) => item.doc_no && kindLink(item.doc_kind, item.doc_id, here)).map((item) => kindLink(item.doc_kind, item.doc_id, here)), `O ${book.name}: روابط المفتوح`);
        t.eq(byAction('open-summary', section).length, 0, `O ${book.name}: بلا سطر «المفتوح اليوم» (الجدول هو المفتوح)`);
      }
    });

    // ── X: الإكسل، وH: المشاركة، وW: الطباعة ─────────────────────────────────────────────────────────────────
    await step('X csv', async () => {
      blobs = [];
      clicked = [];
      const sample = ST.supplier;
      env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
      await env.mount(`/accounts/parties/${sample.party.id}`, statementRoute);
      await click(first('export-csv'));
      const title = `كشف حساب — ${sample.party.name} — ${fmtDay(sample.from)} إلى ${fmtDay(sample.to)}`;
      t.same([clicked.length, clicked[0]?.download, blobs[0]?.type], [1, `${title}.csv`, 'text/csv;charset=utf-8'], 'X ملفّ واحد باسم الكشف ونوع CSV بالعربية');
      // text() يشيل علامة البداية عند فكّ UTF-8، فالعلامة تُفحص بالبايتات (EF BB BF) وبفكّ يبقيها.
      const bytes = new Uint8Array(await blobs[0].arrayBuffer());
      const body = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
      t.ok([...bytes.slice(0, 3)].join() === '239,187,191' && body.startsWith(BOM) && body.endsWith(CRLF) && !body.replace(new RegExp(CRLF, 'g'), '').includes(LF), 'X يبدأ بعلامة UTF-8 (BOM) وأسطره CRLF');
      const rows = parseCsv(body.slice(1));
      t.same(rows.slice(0, 2), [['كشف حساب', sample.party.name], ['المنشأة', sample.org.name]], 'X الرأس: الجهة والمنشأة');
      t.same(rows[2], ['الفترة', sample.from, sample.to], 'X الفترة بتاريخ يقرأه إكسل');
      const expected = [];
      for (const book of sample.books) {
        expected.push([], ['الحساب', bookName(book)], ['التاريخ', 'رقم المستند', 'نوع المستند', 'البيان', 'عليه (مدين)', 'له (دائن)', 'الرصيد', 'الجهة'], [sample.from, '', '', 'رصيد سابق', '', '', plain(abs(fils(book.brought_forward))), side(fils(book.brought_forward))]);
        for (const line of book.lines) {
          const settled = settledOf(line);
          expected.push([line.on_date, line.doc_no ?? '', typeOf(line), settled ? `${memoOf(line)} — ${settled}` : memoOf(line), fils(line.debit) === 0n ? '' : plain(fils(line.debit)), fils(line.credit) === 0n ? '' : plain(fils(line.credit)), plain(abs(fils(line.balance))), side(fils(line.balance))]);
        }
        expected.push(['', '', '', 'مجموع الفترة', plain(fils(book.total_debit)), plain(fils(book.total_credit)), plain(abs(fils(book.closing))), side(fils(book.closing))]);
      }
      t.same(rows.slice(5).filter((row) => row.length), expected.filter((row) => row.length), 'X لكلّ حساب: رأسه ورصيد سابق وكلّ سطر بقيمه ومجموع الفترة');
      const numbers = rows.slice(5).filter((row) => row.length === 8 && row[0] !== 'التاريخ').flatMap((row) => row.slice(4, 7)).filter(Boolean);
      t.ok(numbers.length > 0 && numbers.every((value) => /^-?[0-9]+(\.[0-9]{2})?$/.test(value)), `X الأرقام بلا فواصل آلاف فيقرأها إكسل أرقاماً (${numbers.slice(0, 4).join(' ')})`);
      await click(descendantsOf('button').find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'المفتوح فقط'));
      await click(first('export-csv'));
      const openRows = parseCsv(new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(await blobs[1].arrayBuffer())).slice(1));
      t.same(openRows.find((row) => row[0] === 'التاريخ'), ['التاريخ', 'رقم المستند', 'نوع المستند', 'المبلغ', 'المسدَّد', 'المتبقّي', 'العمر بالأيام', 'الجهة'], 'X بصيغة «المفتوح فقط» يُصدَّر المفتوح');
      t.eq(openRows.filter((row) => row.length === 8 && row[0] !== 'التاريخ').length, sample.books.reduce((s, book) => s + book.open_items.length, 0), 'X صفّ لكلّ مفتوح');
    });

    const shareTextOf = (sample) =>
      [
        `كشف حساب «${sample.party.name}» من ${sample.org.name}`,
        `الفترة: ${fmtDay(sample.from)} — ${fmtDay(sample.to)}`,
        ...sample.books.map((book) => (fils(book.closing) === 0n ? `${bookName(book)}: لا رصيد` : `${bookName(book)}: ${money(abs(fils(book.closing)))} دينار ${side(fils(book.closing))}`)),
        ...(sample.books.length === 1 && fils(sample.books[0].closing) !== 0n ? [words(fils(sample.books[0].closing))] : []),
      ].join(LF);
    await step('H share', async () => {
      setNavigator();
      for (const sample of Object.values(ST)) {
        env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
        await env.mount(`/accounts/parties/${sample.party.id}`, statementRoute);
        await click(first('share-statement'));
        t.same(shared.at(-1), { title: `كشف حساب — ${sample.party.name} — ${fmtDay(sample.from)} إلى ${fmtDay(sample.to)}`, text: shareTextOf(sample), url: `http://localhost/accounts/parties/${sample.party.id}` }, `H «شارك» بنصّ الخلاصة ورابط الكشف (${sample.party.name})`);
        await env.unmount();
      }
      setNavigator({ share: false });
      const sample = ST.customer;
      env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
      await env.mount(`/accounts/parties/${sample.party.id}`, statementRoute);
      await click(first('share-statement'));
      t.same(copied, [`${shareTextOf(sample)}${LF}http://localhost/accounts/parties/${sample.party.id}`], 'H بلا مشاركة بالجهاز: يُنسخ النصّ والرابط');
      await env.unmount();
      setNavigator({ share: false, clipboard: false });
      env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
      await env.mount(`/accounts/parties/${sample.party.id}`, statementRoute);
      await click(first('share-statement'));
      t.eq(first('share-text')?.value ?? first('share-text')?.textContent, `${shareTextOf(sample)}${LF}http://localhost/accounts/parties/${sample.party.id}`, 'H بلا مشاركة ولا نسخ: نافذة بالنصّ لنسخه يدوياً');
      await env.unmount();
      setNavigator();
      env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
      await env.mount(`/accounts/parties/${sample.party.id}?send=1&back=${encodeURIComponent('/accounts/debts?side=receivable')}`, statementRoute);
      t.ok(Boolean(first('share-text')) && text().includes(`أرسل كشف «${sample.party.name}»`), 'H «أرسل الكشف» (?send=1) يفتح نافذة المشاركة');
      await click(first('share-now'));
      t.same([shared.length, first('share-text'), env.search().send], [1, null, undefined], 'H «شارك» من النافذة يشارك ويغلقها ويشيل send من الرابط');
      t.eq(first('back')?.getAttribute('href'), '/accounts/debts?side=receivable', 'B الرجوع إلى ?back (قائمة الذمم بتبويبها)');
    });

    await step('W print', async () => {
      const sample = ST.supplier;
      let printedTitle = null;
      globalThis.window.print = () => {
        printedTitle = globalThis.document.title;
      };
      globalThis.document.title = 'نظام الدواجن';
      env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
      await env.mount(`/accounts/parties/${sample.party.id}?back=https://example.com`, statementRoute);
      t.eq(first('back')?.getAttribute('href'), '/accounts/debts', 'B ?back خارج الحسابات والمبيعات لا يُتّبع');
      await click(first('print-statement'));
      t.eq(printedTitle, `كشف حساب — ${sample.party.name} — ${fmtDay(sample.from)} إلى ${fmtDay(sample.to)}`, 'W الطباعة بعنوان «كشف حساب — الاسم — الفترة»');
      fire(globalThis.window, 'afterprint');
      t.eq(globalThis.document.title, 'نظام الدواجن', 'W ويعود العنوان بعد الطباعة');
      const area = descendantsOf('div').find((n) => n.getAttribute('data-print-area') !== null);
      const hidden = descendantsOf('*', area).filter((n) => n.getAttribute('data-print') === 'hide');
      const inside = (action) => hidden.some((h) => byAction(action, h).length > 0 || h.getAttribute('data-action') === action);
      t.ok(['print-statement', 'export-csv', 'share-statement', 'statement-book', 'back', 'apply-period'].every(inside), 'W الأزرار والفلاتر والرجوع خارج الورقة المطبوعة');
      t.ok(!hidden.some((h) => byAction('statement-sheet', h).length > 0), 'W والورقة نفسها تُطبع');
    });

    // ── B: الحساب والصيغة بالرابط ───────────────────────────────────────────────────────────────────────────────
    await step('B book and mode', async () => {
      const sample = ST.supplier;
      const [book] = sample.books;
      env.fresh({ session: SESSION('accountant'), rpc: { party_statement_v2: async (args) => (args.p_book ? { ...clone(sample), books: clone(sample.books.filter((b) => b.book_id === args.p_book)) } : clone(sample)) }, tables });
      await env.mount(`/accounts/parties/${sample.party.id}`, statementRoute);
      await choose(first('statement-book'), book.book_id);
      t.same([env.search().book, env.calls('party_statement_v2').at(-1).p_book], [book.book_id, book.book_id], 'B الحساب بالرابط وفي النداء');
      t.same([descendantsOf('section').filter((n) => n.getAttribute('data-book') !== null).length, text(first('head-book'))], [1, bookName(book)], 'B كشف حساب واحد باسمه في الرأس');
      await click(descendantsOf('button').find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'تفصيلي'));
      t.same([env.search().mode, env.search().book], ['detailed', book.book_id], 'B الصيغة بالرابط مع الحساب');
      await click(descendantsOf('button').find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'مختصر'));
      t.eq(env.search().mode, undefined, 'B المختصر بلا ?mode');
    });

    // ── L: قائمة الإلغاء للمدير ──────────────────────────────────────────────────────────────────────────────────
    await step('L voids', async () => {
      const sample = ST.customer;
      env.fresh({ session: SESSION('manager'), rpc: { party_statement_v2: async () => clone(sample) }, tables });
      await env.mount(`/accounts/parties/${sample.party.id}`, statementRoute);
      const expected = sample.books.flatMap((book) => book.lines.filter((line) => voidableOf(line) !== null));
      t.eq(byAction('void-entry').length, expected.length, 'L قيود القبض والدفع الحيّة وحدها تُلغى من الكشف (لا الملغى ولا سطر إلغائه ولا الفاتورة)');
      t.ok(expected.length > 0 && sample.books.flatMap((book) => book.lines).every((line) => m.voidable({ kind: line.kind, docKind: line.doc_kind, reverses: line.reverses, reversed: line.reversed }) === voidableOf(line)), 'L قاعدة الإلغاء لكلّ سطر من العيّنة');
      await click(byAction('void-entry')[0]);
      t.ok(text().includes('ويخرج') || text().includes('ويعود'), 'L تأكيد الإلغاء يسمّي حركة الصندوق العكسية');
    });

    // ── V: السندات ─────────────────────────────────────────────────────────────────────────────────────────────
    const voucherRoute = [['/accounts/voucher/:id', m.VoucherPage]];
    const voucherCases = Object.entries(FIXTURE.voucher_detail);
    const noAlloc = clone(FIXTURE.voucher_detail.receipt);
    const [firstAlloc] = noAlloc.allocations;
    noAlloc.allocations = [];
    noAlloc.unallocated = firstAlloc ? firstAlloc.amount : noAlloc.amount;
    noAlloc.account = { ...noAlloc.account, kind: 'bank' };
    const payRest = clone(FIXTURE.voucher_detail.payment);
    payRest.unallocated = payRest.amount;
    payRest.allocations = [];
    payRest.account = { ...payRest.account, kind: 'wallet' };
    for (const [name, sample] of [...voucherCases, ['receipt-unallocated-bank', noAlloc], ['payment-unallocated-wallet', payRest]]) {
      await step(`V ${name}`, async () => {
        env.fresh({ session: SESSION('accountant'), rpc: { voucher_detail: async () => clone(sample) }, tables });
        const here = `/accounts/voucher/${sample.entry_id}`;
        await env.mount(here, voucherRoute);
        t.same(env.calls('voucher_detail'), [{ p_entry: sample.entry_id }], `V ${name}: النداء بقيد السند`);
        const receipt = sample.type === 'receipt';
        t.same(
          [text(first('voucher-title')), text(first('voucher-no')), text(first('voucher-date')), text(first('org-name'))],
          [receipt ? 'سند قبض' : 'سند صرف', `رقم: ${sample.doc_no}`, `التاريخ: ${fmtDay(sample.on_date)}`, sample.org.name],
          `V ${name}: اسم السند ورقمه وتاريخه والمنشأة`,
        );
        t.eq(text(first('voucher-party')), `${receipt ? 'استلمنا من السيّد:' : 'دفعنا إلى السيّد:'}${sample.party.name}${sample.party.phone ? ` — ${sample.party.phone}` : ''}`, `V ${name}: الجهة`);
        t.eq(text(first('voucher-amount')), `مبلغاً قدره:${money(fils(sample.amount))} دينار`, `V ${name}: المبلغ بالأرقام`);
        t.eq(text(first('voucher-words')), m.amountInWords(fils(sample.amount)), `V ${name}: المبلغ بالكلمات`);
        const allocations = byAction('voucher-allocation');
        t.same(allocations.map((n) => n.textContent), sample.allocations.map((a) => `تسديد ${allocDoc(a)} بتاريخ ${fmtDay(a.on_date)} (${money(fils(a.amount))})`), `V ${name}: «وذلك عن» ما سدّده بمبالغه`);
        t.same(allocations.map((n) => byAction('voucher-allocation', n).length === 0 && n.childNodes.find((c) => c.localName === 'a')?.getAttribute('href')), sample.allocations.map((a) => allocLink(a, here) ?? undefined), `V ${name}: كلّ مستند مسدَّد رابط (§5)`);
        const rest = fils(sample.unallocated);
        t.eq(text(first('voucher-rest')), rest > 0n ? (receipt ? `ومبلغ ${money(rest)} دفعة مقدّمة تبقى رصيداً للجهة.` : `ومبلغ ${money(rest)} دفعة مقدّمة للجهة لم تُخصَّص لفاتورة.`) : '', `V ${name}: الباقي بلا تخصيص`);
        if (!sample.allocations.length && rest === 0n) t.eq(text(first('voucher-for')), sample.void ? 'وذلك عن:لا شيء: فكّ الإلغاء ما سدّده.' : 'وذلك عن:دفعة بلا تخصيص.', `V ${name}: بلا توزيع`);
        const box = sample.account;
        const method = receipt
          ? box.kind === 'bank' ? `إيداعاً في «${box.name}» (${CASH_KIND.bank})` : box.kind === 'wallet' ? `في المحفظة «${box.name}»` : `نقداً في صندوق «${box.name}»`
          : box.kind === 'bank' ? `تحويلاً من «${box.name}» (${CASH_KIND.bank})` : box.kind === 'wallet' ? `من المحفظة «${box.name}»` : `نقداً من صندوق «${box.name}»`;
        t.eq(text(first('voucher-method')), `طريقة الدفع:${method}`, `V ${name}: طريقة الدفع بصندوقها`);
        t.eq(text(first('voucher-book')), `الحساب:${bookName({ code: sample.book.code, division_kind: sample.book.division_kind })}`, `V ${name}: الحساب`);
        t.eq(text(first('voucher-posted')), sample.posted_by ? `سجّله ${sample.posted_by} يوم ${fmtDay(localDayOf(sample.posted_at))}.` : `سُجّل يوم ${fmtDay(localDayOf(sample.posted_at))}.`, `V ${name}: من سجّله ومتى`);
        t.same(byAction('signatures').map((n) => n.children.map((c) => c.textContent)), [['المستلم', 'أمين الصندوق', 'المحاسب']], `V ${name}: التواقيع الثلاثة`);
        t.eq(text(first('void-stamp')), sample.void ? `ملغى${sample.void.by ? `أُلغي بتاريخ ${fmtDay(sample.void.on_date)} بيد ${sample.void.by}. السبب: ${sample.void.reason}` : `أُلغي بتاريخ ${fmtDay(sample.void.on_date)}. السبب: ${sample.void.reason}`}` : '', `V ${name}: ختم «ملغى» بتاريخه وسببه ومن ألغاه`);
        const style = descendantsOf('style').find((n) => n.getAttribute('data-page-style') === 'A5');
        t.ok(Boolean(style) && style.textContent.includes('size: A5 portrait'), `V ${name}: يُطبع A5`);
        t.eq(first('back')?.getAttribute('href'), `/accounts/parties/${sample.party.id}`, `V ${name}: الرجوع إلى كشف الجهة`);
      });
    }
    t.ok(FIXTURE.voucher_detail.void.void !== null && FIXTURE.voucher_detail.void.allocations.length === 0 && FIXTURE.voucher_detail.receipt.allocations.length > 0, 'شرط العيّنة: سند ملغى بلا توزيع، وسند قبض بتوزيع');

    // ── R: سند التحويل ─────────────────────────────────────────────────────────────────────────────────────────
    const voidTransfer = { ...clone(FIXTURE.transfer_detail.live), note: null, void: { on_date: FIXTURE.transfer_detail.live.on_date, reason: 'نقل مكرّر', by: null } };
    for (const [name, sample] of [['live', FIXTURE.transfer_detail.live], ['void', voidTransfer]]) {
      await step(`R ${name}`, async () => {
        env.fresh({ session: SESSION('accountant'), rpc: { transfer_detail: async () => clone(sample) }, tables });
        await env.mount(`/accounts/transfer/${sample.id}`, [['/accounts/transfer/:id', m.TransferVoucherPage]]);
        t.same(env.calls('transfer_detail'), [{ p_id: sample.id }], `R ${name}: النداء بمعرّف التحويل`);
        t.same([text(first('voucher-title')), byAction('voucher-no').length, text(first('voucher-date'))], ['سند تحويل بين صندوقين', 0, `التاريخ: ${fmtDay(sample.on_date)}`], `R ${name}: سند التحويل بلا رقم (الترقيم مؤجّل)`);
        t.same([text(first('transfer-from')), text(first('transfer-to'))], [`حوّلنا من:«${sample.from.name}» (${CASH_KIND[sample.from.kind]})`, `إلى:«${sample.to.name}» (${CASH_KIND[sample.to.kind]})`], `R ${name}: الصندوقان بنوعيهما`);
        t.same([text(first('voucher-amount')), text(first('voucher-words'))], [`مبلغاً قدره:${money(fils(sample.amount))} دينار`, m.amountInWords(fils(sample.amount))], `R ${name}: المبلغ بالأرقام والكلمات`);
        t.eq(text(first('transfer-note')), `البيان:${sample.note ?? 'نقل بين الصناديق'}`, `R ${name}: البيان`);
        t.eq(text(first('void-stamp')), sample.void ? `ملغىأُلغي بتاريخ ${fmtDay(sample.void.on_date)}. السبب: ${sample.void.reason}` : '', `R ${name}: ختم «ملغى»`);
        t.same(byAction('open-box').map((n) => n.getAttribute('href')), [`/accounts/cash/${sample.from.id}`, `/accounts/cash/${sample.to.id}`], `R ${name}: كشفا الصندوقين`);
        t.eq(first('back')?.getAttribute('href'), `/accounts/cash/${sample.from.id}`, `R ${name}: الرجوع إلى كشف الصندوق المحوِّل`);
      });
    }

    // ── Q: صفحة البيع ─────────────────────────────────────────────────────────────────────────────────────────
    const S = FIXTURE.sale_detail;
    const cashRefunded = { ...clone(S), payment: 'credit', payment_refunded: true };
    const voided = { ...clone(S), status: 'void', voided_at: '2026-11-10T10:00:00Z', void_reason: 'بيع مكرّر', can_void: false };
    const noCost = { ...clone(S), cost: {} };
    const saleRoute = [['/sales/:id', m.SaleDocPage]];
    for (const [name, sample, role, url] of [
      ['posted', S, 'manager', `/sales/${S.id}?back=${encodeURIComponent(`/accounts/parties/${S.party_id}`)}`],
      ['refunded', cashRefunded, 'manager', `/sales/${S.id}`],
      ['void', voided, 'manager', `/sales/${S.id}?back=https://example.com`],
      ['storekeeper', noCost, 'storekeeper', `/sales/${S.id}`],
    ]) {
      await step(`Q ${name}`, async () => {
        env.fresh({ session: SESSION(role, { canSeeCost: role !== 'storekeeper' }), rpc: { sale_detail: async () => clone(sample) }, tables });
        await env.mount(url, saleRoute);
        t.same(env.calls('sale_detail'), [{ p_sale: S.id }], `Q ${name}: النداء بالفاتورة`);
        t.ok(text().includes(`فاتورة بيع ${sample.doc_no}`) && text().includes(sample.status === 'void' ? 'فاتورة ملغاة' : 'فاتورة محفوظة'), `Q ${name}: العنوان والحالة`);
        const party = first('sale-party');
        const link = party?.childNodes.find((c) => c.localName === 'a');
        t.same([text(party), link?.getAttribute('href') ?? null], [sample.party_name, role === 'storekeeper' ? null : `/accounts/parties/${sample.party_id}`], `Q ${name}: الجهة (رابط كشفها لأدوار الحسابات وحدها)`);
        t.eq(text(first('sale-payment')), sample.free ? 'بلا مقابل' : sample.payment_refunded ? 'نقداً، ثمّ رُدّ المبلغ' : sample.payment === 'cash' ? 'نقداً' : 'بالدين', `Q ${name}: الدفع بكلماته`);
        t.eq(text(first('sale-status')), sample.status === 'void' ? 'ملغى' : 'محفوظ', `Q ${name}: الحالة`);
        const lines = tableOf(tablesIn(globalThis.document.body)[0]);
        const price = fils(sample.money.unit_price);
        t.same(lines.body, [[sample.item_name, qtyCells([sample.qty])[0], UNIT[sample.base_unit], `${money(price).split('.')[0]}.${(abs(price) % 100n).toString().padStart(2, '0')}`, money(fils(sample.money.line_total))]], `Q ${name}: سطر الفاتورة بالكمية والوحدة والسعر والمبلغ`);
        t.same(lines.foot, [['المجموع', money(fils(sample.money.line_total))]], `Q ${name}: المجموع`);
        const stats = descendantsOf('dt').map((n) => n.textContent);
        t.ok(['مبلغ الفاتورة', 'المقبوض نقداً', 'بالدين'].every((label) => stats.includes(label)) && stats.includes('الربح') === Boolean(sample.cost?.money), `Q ${name}: المبلغ والمقبوض والدين، والكلفة والربح لأدوار الكلفة وحدها`);
        t.eq(first('back')?.getAttribute('href'), name === 'posted' ? `/accounts/parties/${S.party_id}` : '/sales', `Q ${name}: الرجوع إلى ?back (الحسابات أو المبيعات) وإلّا المبيعات`);
        if (sample.status === 'void') t.ok(text().includes('أُلغيت هذه الفاتورة') && text().includes(`السبب: ${sample.void_reason}`), 'Q الملغاة بسببها');
      });
    }
  } finally {
    restoreDom();
    delete globalThis.__mb;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    URL.createObjectURL = savedCreate;
    URL.revokeObjectURL = savedRevoke;
    if (savedClick) Object.defineProperty(proto, 'click', savedClick);
    else delete proto.click;
  }

  function descendantsOf(tag, scope = globalThis.document.body) {
    const out = [];
    const walk = (node) => {
      for (const child of node?.childNodes ?? []) {
        if (child.nodeType === 1) {
          if (tag === '*' || child.localName === tag) out.push(child);
          walk(child);
        }
      }
    };
    walk(scope);
    return out;
  }
}
