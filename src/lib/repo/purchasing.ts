import type { SupabaseClient } from '@supabase/supabase-js';
import { decimalText } from '../../domain/decimal';
import type { Fils, Milli } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { BASE_UNITS } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { ZeroRowsError } from '../errors';
import './constraints-receipts';
import { call, classifyPostgrest, send, updatedRows } from './core';
import {
  arr,
  bool,
  count,
  deleteDraftLine,
  discardDraft,
  moneyOf,
  obj,
  oneOf,
  optStr,
  problem,
  qtyOf,
  readAll,
  RowShapeError,
  scaled,
  str,
  withStatus,
  written,
  type DocCursor,
  type DocStatus,
  type Problem,
  type StockRef,
} from './inventory';

// الاستلام من المورّد (0009، FOUNDATION ٣٢٨–٣٣٤، ٥٥٠–٥٥١، E39). ملف كسول بحزمة شاشات المخزون (index ما يصدّره): الرأس والسطور كتابة
// مباشرة بسياسة receipt.draft ونطاق المخزن، والمبالغ والتحميلات بسياسة receipt.amounts (أدوار الكلفة)، وكلها بـupdatedRows؛ واختيار سطور
// التحميل وحذفه والمعاينة والترحيل والإلغاء دوالّ. المال نصوص عشرية بالسلك (E3) وbigint بالفلس هنا، والخادم يشيل كل money للأمين.

type Row = Record<string, unknown>;

export interface ReceiptDoc {
  id: string;
  status: DocStatus;
  version: number;
  docNo: string | null;
  partyId: string;
  partyName: string;
  warehouseId: string;
  bookId: string;
  onDate: string;
  note: string | null;
  posted: boolean;
  voidReason: string | null;
  createdAt: string;
}

const RECEIPT_COLUMNS = 'id, doc_no, party_id, warehouse_id, book_id, received_on, status, version, note, posted_at, void_reason, created_at, party:parties(name)';
const DOC_STATUSES: readonly DocStatus[] = ['draft', 'posted', 'void'];

function receiptDoc(row: Row): ReceiptDoc {
  const version = row.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new RowShapeError('version');
  const party = row.party === null || row.party === undefined ? null : obj(row.party, 'party');
  return {
    id: str(row, 'id'),
    status: oneOf(row, 'status', DOC_STATUSES),
    version,
    docNo: optStr(row, 'doc_no'),
    partyId: str(row, 'party_id'),
    // الجهات بسياسة can_see_sales: عامل القاعة ما يقراها، فالاسم «—» بدل رفض الشاشة.
    partyName: party ? str(party, 'name') : '—',
    warehouseId: str(row, 'warehouse_id'),
    bookId: str(row, 'book_id'),
    onDate: str(row, 'received_on'),
    note: optStr(row, 'note'),
    posted: row.posted_at !== null && row.posted_at !== undefined,
    voidReason: optStr(row, 'void_reason'),
    createdAt: str(row, 'created_at'),
  };
}

export interface ReceiptLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  itemKind: string;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  itemUnitId: string | null;
  unitCode: string | null;
  unitLabel: string;
  qtyInUnit: Milli;
  qty: Milli;
  expiryOn: string | null;
  bornAt: string | null;
  supplierLotNo: string | null;
  /** لقطة الكثافة (×10,000) ووزن القطعة (بالألف) على السطر (E46). */
  density: bigint | null;
  pieceMass: Milli | null;
}

const LINE_COLUMNS =
  'id, line_no, item_id, item_unit_id, unit_code, unit_label, qty_in_unit::text, qty_base::text, expiry_on, born_at, supplier_lot_no, density_kg_per_l::text, piece_mass_kg::text, item:items(name, kind, base_unit, tracks_expiry)';

function receiptLine(row: Row): ReceiptLine {
  const item = obj(row.item, 'item');
  const lineNo = count(row, 'line_no');
  if (lineNo === null) throw new RowShapeError('line_no');
  return {
    id: str(row, 'id'),
    lineNo,
    itemId: str(row, 'item_id'),
    itemName: str(item, 'name'),
    itemKind: str(item, 'kind'),
    baseUnit: oneOf(item, 'base_unit', BASE_UNITS),
    tracksExpiry: bool(item, 'tracks_expiry'),
    itemUnitId: optStr(row, 'item_unit_id'),
    unitCode: optStr(row, 'unit_code'),
    unitLabel: str(row, 'unit_label'),
    qtyInUnit: qtyOf(row, 'qty_in_unit'),
    qty: qtyOf(row, 'qty_base'),
    expiryOn: optStr(row, 'expiry_on'),
    bornAt: optStr(row, 'born_at'),
    supplierLotNo: optStr(row, 'supplier_lot_no'),
    density: scaled(row, 'density_kg_per_l', 4),
    pieceMass: scaled(row, 'piece_mass_kg', 3),
  };
}

/** مبلغ سطر كما بالفاتورة (أدوار الكلفة؛ للأمين ما يرجع صفّ). */
export interface ReceiptLineAmount {
  id: string;
  lineId: string;
  lineTotal: Fils;
  zeroReason: string | null;
}

export interface ReceiptAmounts {
  id: string;
  discount: Fils;
  paidNow: Fils;
  cashAccountId: string | null;
}

export interface ReceiptCharge {
  id: string;
  chargeNo: number;
  label: string;
  amount: Fils;
  allocateBy: 'mass' | 'value';
  payeePartyId: string | null;
  cashAccountId: string | null;
  allLines: boolean;
  /** السطور المختارة إذا allLines = false. */
  lineIds: readonly string[];
}

const fils = (row: Row, field: string): Fils => {
  const value = scaled(row, field, 2);
  if (value === null) throw new RowShapeError(field);
  return value;
};

export interface ReceiptBundle {
  doc: ReceiptDoc;
  lines: ReceiptLine[];
  /** فارغة للأمين (سياسة الكلفة). */
  lineAmounts: ReceiptLineAmount[];
  amounts: ReceiptAmounts | null;
  charges: ReceiptCharge[];
}

export async function loadReceipt(id: string, withMoney: boolean): Promise<ReceiptBundle> {
  const list = await readAll((db) =>
    Promise.all([
      db.from('receipts').select(RECEIPT_COLUMNS).eq('id', id),
      db.from('receipt_lines').select(LINE_COLUMNS).eq('doc_id', id).order('line_no') /* unbounded: سطور مستند واحد */,
      ...(withMoney
        ? [
            db.from('receipt_line_amounts').select('id, line_id, line_total::text, zero_reason').eq('doc_id', id) /* unbounded: مبالغ سطور مستند واحد */,
            db.from('receipt_amounts').select('id, discount::text, paid_now::text, cash_account_id').eq('doc_id', id) /* unbounded: صفّ واحد للمستند */,
            db.from('receipt_charges').select('id, charge_no, label, amount::text, allocate_by, payee_party_id, cash_account_id, all_lines').eq('doc_id', id).order('charge_no') /* unbounded: تحميلات مستند واحد */,
            db.from('receipt_charge_lines').select('charge_id, line_id').eq('doc_id', id) /* unbounded: اختيار تحميلات مستند واحد */,
          ]
        : []),
    ]),
  );
  const [head] = list(0);
  if (!head) throw new ZeroRowsError();
  const picks = withMoney ? list(5) : [];
  return {
    doc: receiptDoc(head),
    lines: list(1).map(receiptLine),
    lineAmounts: withMoney ? list(2).map((row) => ({ id: str(row, 'id'), lineId: str(row, 'line_id'), lineTotal: fils(row, 'line_total'), zeroReason: optStr(row, 'zero_reason') })) : [],
    amounts: withMoney ? (list(3).map((row) => ({ id: str(row, 'id'), discount: fils(row, 'discount'), paidNow: fils(row, 'paid_now'), cashAccountId: optStr(row, 'cash_account_id') }))[0] ?? null) : null,
    charges: withMoney
      ? list(4).map((row) => {
          const id = str(row, 'id');
          return {
            id,
            chargeNo: count(row, 'charge_no') ?? 0,
            label: str(row, 'label'),
            amount: fils(row, 'amount'),
            allocateBy: oneOf(row, 'allocate_by', ['mass', 'value'] as const),
            payeePartyId: optStr(row, 'payee_party_id'),
            cashAccountId: optStr(row, 'cash_account_id'),
            allLines: bool(row, 'all_lines'),
            lineIds: picks.filter((pick) => pick.charge_id === id).map((pick) => str(pick, 'line_id')),
          };
        })
      : [],
  };
}

export const RECEIPTS_PAGE = 100;

/** صفحة القائمة كما تنطلب: المسوّدات ثم المرحَّلة ثم الملغاة، والأحدث أوّلاً (keyset بالحالة والوقت والمعرّف)، وdrafts المسوّدات بس. */
export function receiptsPageQuery(db: Pick<SupabaseClient, 'from'>, after: DocCursor | null, draftsOnly: boolean) {
  let page = db.from('receipts').select(RECEIPT_COLUMNS);
  if (draftsOnly) page = page.eq('status', 'draft');
  if (after) {
    const at = `"${after.createdAt}"`;
    page = page.or(`status.gt.${after.status},and(status.eq.${after.status},created_at.lt.${at}),and(status.eq.${after.status},created_at.eq.${at},id.lt.${after.id})`);
  }
  return page.order('status').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(RECEIPTS_PAGE);
}

export async function listReceipts(after: DocCursor | null = null, draftsOnly = false): Promise<{ rows: ReceiptDoc[]; next: DocCursor | null; total: number | null }> {
  const { result, wasOnline } = await send(
    (db) => {
      const head = db.from('receipts').select('id', { count: 'exact', head: true });
      return Promise.all([receiptsPageQuery(db, after, draftsOnly), after ? null : draftsOnly ? head.eq('status', 'draft') : head]);
    },
    ([rows, total]) => (total ? [rows, total] : [rows]),
  );
  const [rows, total] = result;
  for (const answer of total ? [rows, total] : [rows]) if (answer.error) throw classifyPostgrest(answer.error, answer.status, 'table', wasOnline);
  const docs = ((rows.data ?? []) as unknown as Row[]).map(receiptDoc);
  const last = docs.at(-1);
  return {
    rows: docs,
    total: total ? (total.count ?? 0) : null,
    next: docs.length === RECEIPTS_PAGE && last ? { status: last.status, createdAt: last.createdAt, id: last.id } : null,
  };
}

/** مسوّدة استلام بمعرّف يولد بالجهاز (الإعادة بعد جواب ضاع 23505، مو مسوّدة ثانية). الدفتر يكتبه الخادم من نوع المخزن. */
export function createReceiptDraft(id: string, warehouseId: string, partyId: string, receivedOn: string): Promise<ReceiptDoc> {
  return written(async (db) => updatedRows(withStatus(await db.from('receipts').insert({ id, warehouse_id: warehouseId, party_id: partyId, received_on: receivedOn }).select(RECEIPT_COLUMNS)))).then(
    receiptDoc,
  );
}

export interface ReceiptHeaderPatch {
  day?: string;
  partyId?: string;
  note?: string | null;
}

/** مورّد المسوّدة أو تاريخها أو ملاحظتها بشرط النسخة (الحقول المتغيّرة بس). */
export function updateReceiptDraft(doc: Pick<ReceiptDoc, 'id' | 'version'>, patch: ReceiptHeaderPatch): Promise<ReceiptDoc> {
  const fields = {
    ...(patch.day ? { received_on: patch.day } : {}),
    ...(patch.partyId ? { party_id: patch.partyId } : {}),
    ...(patch.note === undefined ? {} : { note: patch.note?.trim() || null }),
  };
  return written(async (db) => updatedRows(withStatus(await db.from('receipts').update(fields).eq('id', doc.id).eq('version', doc.version).select(RECEIPT_COLUMNS)))).then(receiptDoc);
}

/** سطر الاستلام بلا مال (لقطة الوحدة والكثافة يكتبها الخادم، E7، E46). */
export interface ReceiptLineFields {
  item_id: string;
  item_unit_id: string | null;
  unit_code: string | null;
  qty_in_unit: string;
  expiry_on: string | null;
  born_at: string | null;
  supplier_lot_no: string | null;
}

export function addReceiptLine(docId: string, id: string, fields: ReceiptLineFields): Promise<ReceiptLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('receipt_lines').insert({ id, ...fields, doc_id: docId }).select(LINE_COLUMNS)))).then(receiptLine);
}

/** تعديل السطر بمعرّفه (إعادة إضافة ضاع جوابها 23505 تكتب آخر قيمة فوقه)؛ كل كتابة تحدّث لقطة الكثافة (E46). */
export function updateReceiptLine(lineId: string, fields: ReceiptLineFields): Promise<ReceiptLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('receipt_lines').update(fields).eq('id', lineId).select(LINE_COLUMNS)))).then(receiptLine);
}

export function deleteReceiptLine(lineId: string, expectedVersion: number): Promise<{ deleted: boolean; version: number | null }> {
  return deleteDraftLine('receipt', lineId, expectedVersion);
}

export function discardReceipt(id: string, expectedVersion: number): Promise<void> {
  return discardDraft('receipt', id, expectedVersion);
}

const dinar = (amount: Fils): string => decimalText(amount, 2);

/** مبلغ السطر (Q7: دينار صحيح، والصفر بسببه Q9): إدخال أوّل مرّة، وتعديل بعدها بمعرّف صفّه. */
export function setLineTotal(current: ReceiptLineAmount | null, lineId: string, total: Fils, zeroReason: string | null): Promise<void> {
  const fields = { line_total: dinar(total), zero_reason: zeroReason?.trim() || null };
  return written(async (db) =>
    updatedRows(withStatus(current ? await db.from('receipt_line_amounts').update(fields).eq('id', current.id).select('id') : await db.from('receipt_line_amounts').insert({ line_id: lineId, ...fields }).select('id'))),
  ).then(() => undefined);
}

/** الخصم والمدفوع عند الاستلام وصندوقه (صفّ واحد للمستند). */
export function setReceiptAmounts(current: ReceiptAmounts | null, docId: string, values: { discount: Fils; paidNow: Fils; cashAccountId: string | null }): Promise<void> {
  const fields = { discount: dinar(values.discount), paid_now: dinar(values.paidNow), cash_account_id: values.cashAccountId };
  return written(async (db) =>
    updatedRows(withStatus(current ? await db.from('receipt_amounts').update(fields).eq('id', current.id).select('id') : await db.from('receipt_amounts').insert({ doc_id: docId, ...fields }).select('id'))),
  ).then(() => undefined);
}

export interface ChargeFields {
  label: string;
  amount: Fils;
  allocateBy: 'mass' | 'value';
  payeePartyId: string | null;
  cashAccountId: string | null;
}

/** تحميل بمعرّف يولد بالجهاز (E17: لجهة أو من صندوق). */
export function addCharge(docId: string, id: string, fields: ChargeFields): Promise<void> {
  return written(async (db) =>
    updatedRows(
      withStatus(
        await db
          .from('receipt_charges')
          .insert({ id, doc_id: docId, label: fields.label.trim(), amount: dinar(fields.amount), allocate_by: fields.allocateBy, payee_party_id: fields.payeePartyId, cash_account_id: fields.cashAccountId })
          .select('id'),
      ),
    ),
  ).then(() => undefined);
}

export async function deleteCharge(chargeId: string, expectedVersion: number): Promise<boolean> {
  return bool(obj(await call<unknown>('delete_receipt_charge', { p_charge_id: chargeId, p_expected_version: expectedVersion }), 'delete_receipt_charge'), 'deleted');
}

/** يستبدل اختيار سطور التحميل؛ الفارغ = كل السطور. */
export async function setChargeLines(chargeId: string, lineIds: readonly string[], expectedVersion: number): Promise<void> {
  await call<unknown>('set_charge_lines', { p_charge_id: chargeId, p_line_ids: [...lineIds], p_expected_version: expectedVersion });
}

// ─── المورّدون والصناديق للشاشة (بلا حزمة الحسابات: شاشات المخزون ما تستوردها) ───────────────────────────────────────

export interface PartyPick {
  id: string;
  name: string;
}

/** بحث الجهات الفعّالة بالاسم المطبَّع، أوّل 20 ويّا العدد الكلّي (FOUNDATION ٧٧٥). */
export async function searchSuppliers(search: string): Promise<{ parties: PartyPick[]; total: number }> {
  const name = searchable(search).replace(/[\\%_]/gu, (ch) => `\\${ch}`);
  const { result, wasOnline } = await send(
    (db) => {
      let query = db.from('parties').select('id, name', { count: 'exact' }).is('archived_at', null);
      if (name) query = query.like('name_norm', `%${name}%`);
      return query.order('name_norm').order('id').limit(20);
    },
    (answer) => [answer],
  );
  if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  if (typeof result.count !== 'number') throw new RowShapeError('count');
  return { parties: ((result.data ?? []) as Row[]).map((row) => ({ id: str(row, 'id'), name: str(row, 'name') })), total: result.count };
}

/** توائم الاسم قبل إضافة مورّد (FOUNDATION ٨١٣، Q2: التنبيه ثم السماح). */
export async function supplierTwins(name: string): Promise<string[]> {
  return arr(await call<unknown>('find_party_twins', { p_name: name, p_phone: null }), 'twins').map((item) => str(obj(item, 'twins'), 'name'));
}

/** مورّد جديد من مسوّدة الاستلام (Q1: الأمين يضيف ولا يعدّل)، بعد فحص التوائم. */
export function createSupplier(name: string): Promise<PartyPick> {
  return written(async (db) => updatedRows(withStatus(await db.from('parties').insert({ name: name.trim(), is_supplier: true }).select('id, name')))).then((row) => ({ id: str(row, 'id'), name: str(row, 'name') }));
}

export interface BoxPick {
  id: string;
  name: string;
}

/** الصناديق الفعّالة (أدوار الحسابات؛ للأمين صفر صفوف). */
export async function listBoxes(): Promise<BoxPick[]> {
  const list = await readAll((db) => Promise.all([db.from('cash_accounts').select('id, name').is('archived_at', null).order('name') /* unbounded: صناديق المنشأة قليلة */]));
  return list(0).map((row) => ({ id: str(row, 'id'), name: str(row, 'name') }));
}

// ─── المعاينة والترحيل والإلغاء ──────────────────────────────────────────────────────────────────────────────────

export interface ReceiptPreviewLine {
  lineId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  unitLabel: string;
  qtyInUnit: Milli;
  qty: Milli;
  expiryOn: string | null;
  problem: Problem | null;
  warning: Problem | null;
}

/** حساب الخادم (أدوار الكلفة بس): لكل سطر حصّتاه وقيمة دفعته، ولكل تحميل حصصه. */
export interface ReceiptPreviewMoney {
  lines: readonly { lineId: string; lineTotal: Fils; discountShare: Fils; chargeShare: Fils; value: Fils }[];
  charges: readonly { chargeId: string; label: string; amount: Fils; payeePartyId: string | null; cashAccountId: string | null; shares: readonly { lineId: string; share: Fils }[] }[];
  linesTotal: Fils;
  discount: Fils;
  net: Fils;
  paidNow: Fils;
  cashAccountId: string | null;
}

export interface ReceiptPreview {
  version: number;
  bookId: string;
  problems: readonly Problem[];
  lines: readonly ReceiptPreviewLine[];
  ready: boolean;
  /** null للأمين (الخادم يشيل money). */
  money: ReceiptPreviewMoney | null;
}

export function parseReceiptPreview(value: unknown): ReceiptPreview {
  const json = obj(value, 'preview_receipt');
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  const money = moneyOf(json);
  return {
    version,
    bookId: str(json, 'book_id'),
    problems: arr(json.problems, 'problems').map((item) => problem(item)).filter((item): item is Problem => item !== null),
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      return {
        lineId: str(row, 'line_id'),
        lineNo: count(row, 'line_no') ?? 0,
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        unitLabel: str(row, 'unit_label'),
        qtyInUnit: qtyOf(row, 'qty_in_unit'),
        qty: qtyOf(row, 'qty'),
        expiryOn: optStr(row, 'expiry_on'),
        problem: problem(row.problem),
        warning: problem(row.warning),
      };
    }),
    ready: bool(json, 'ready'),
    money: money
      ? {
          lines: arr(money.lines, 'lines').map((item) => {
            const row = obj(item, 'lines');
            return { lineId: str(row, 'line_id'), lineTotal: fils(row, 'line_total'), discountShare: fils(row, 'discount_share'), chargeShare: fils(row, 'charge_share'), value: fils(row, 'value') };
          }),
          charges: arr(money.charges, 'charges').map((item) => {
            const row = obj(item, 'charges');
            return {
              chargeId: str(row, 'charge_id'),
              label: str(row, 'label'),
              amount: fils(row, 'amount'),
              payeePartyId: optStr(row, 'payee_party_id'),
              cashAccountId: optStr(row, 'cash_account_id'),
              shares: arr(row.shares, 'shares').map((entry) => {
                const share = obj(entry, 'shares');
                return { lineId: str(share, 'line_id'), share: fils(share, 'share') };
              }),
            };
          }),
          linesTotal: fils(money, 'lines_total'),
          discount: fils(money, 'discount'),
          net: fils(money, 'net'),
          paidNow: fils(money, 'paid_now'),
          cashAccountId: optStr(money, 'cash_account_id'),
        }
      : null,
  };
}

export async function previewReceipt(id: string): Promise<ReceiptPreview> {
  return parseReceiptPreview(await call<unknown>('preview_receipt', { p_id: id }));
}

export interface PostedReceipt {
  id: string;
  status: DocStatus;
  docNo: string | null;
}

function postedReceipt(value: unknown): PostedReceipt {
  const json = obj(value, 'receipt');
  return { id: str(json, 'id'), status: oneOf(json, 'status', DOC_STATUSES), docNo: optStr(json, 'doc_no') };
}

/** الترحيل بنسخة المسوّدة اللي انعاينت (stale_draft لمّا تتغيّر بعدها). */
export async function postReceipt(ref: StockRef, id: string, expectedVersion: number): Promise<PostedReceipt> {
  return postedReceipt(await call<unknown>('post_receipt', { p_id: id, p_expected_version: expectedVersion, p_client_ref: ref.clientRef }));
}

export async function voidReceipt(ref: StockRef, id: string, reason: string): Promise<PostedReceipt> {
  return postedReceipt(await call<unknown>('void_receipt', { p_id: id, p_reason: reason, p_client_ref: ref.clientRef }));
}
