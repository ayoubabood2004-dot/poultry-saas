import type { SupabaseClient } from '@supabase/supabase-js';
import { decimalText } from '../../domain/decimal';
import type { Fils, Milli } from '../../domain/money';
import { searchable } from '../../domain/normalize';
import { BASE_UNITS } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { RejectedError, ZeroRowsError } from '../errors';
import { t } from '../i18n';
import './constraints-receipts';
import { call, classifyPostgrest, send, updatedRows } from './core';
import {
  arr,
  bool,
  count,
  deleteDraftLine,
  discardDraft,
  isDuplicate,
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
  'id, line_no, item_id, item_unit_id, unit_code, unit_label, qty_in_unit::text, qty_base::text, base_unit, expiry_on, born_at, supplier_lot_no, density_kg_per_l::text, piece_mass_kg::text, item:items(name, kind, tracks_expiry)';

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
    // لقطة السطر (E46): كميته بوحدة أساس المادّة يوم انكتب، ومعاينة الخادم تقول لو تغيّرت بعده.
    baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
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

/** المبلغ تغيّر من غير هذه الشاشة بين ما انقرا وما انكتب: ما ينكتب فوقه (FOUNDATION ٨١٧)، والشاشة تقرا من جديد. */
function amountChanged(): RejectedError {
  return new RejectedError('amount_changed', t('receipt.amounts.changed', 'تغيّر مبلغ في هذا الاستلام بعد فتحه؛ قُرئ من جديد، فراجع ما كتبته واحفظ مرّة أخرى.'));
}

async function lineAmountOf(lineId: string): Promise<ReceiptLineAmount | null> {
  const list = await readAll((db) => Promise.all([db.from('receipt_line_amounts').select('id, line_id, line_total::text, zero_reason').eq('line_id', lineId) /* unbounded: صفّ واحد للسطر */]));
  const [row] = list(0);
  return row ? { id: str(row, 'id'), lineId, lineTotal: fils(row, 'line_total'), zeroReason: optStr(row, 'zero_reason') } : null;
}

async function amountsOf(docId: string): Promise<ReceiptAmounts | null> {
  const list = await readAll((db) => Promise.all([db.from('receipt_amounts').select('id, discount::text, paid_now::text, cash_account_id').eq('doc_id', docId) /* unbounded: صفّ واحد للمستند */]));
  const [row] = list(0);
  return row ? { id: str(row, 'id'), discount: fils(row, 'discount'), paidNow: fils(row, 'paid_now'), cashAccountId: optStr(row, 'cash_account_id') } : null;
}

/**
 * مبلغ السطر (Q7: دينار صحيح، والصفر بسببه Q9، والسبب للصفر بس): إدخال أوّل مرّة، وتعديل مشروط بالمبلغ والسبب اللي شافتهم الشاشة.
 * صفر صفوف أو 23505 (محاولة ضاع جوابها، أو كاتب ثاني): الصفّ ينقرا، وإذا بيه المطلوب فانكتب، وإلا amount_changed.
 */
export async function setLineTotal(lineId: string, before: ReceiptLineAmount | null, total: Fils, zeroReason: string | null): Promise<void> {
  const reason = total === 0n ? zeroReason?.trim() || null : null;
  const fields = { line_total: dinar(total), zero_reason: reason };
  try {
    await written(async (db) => {
      if (!before) return updatedRows(withStatus(await db.from('receipt_line_amounts').insert({ line_id: lineId, ...fields }).select('id')));
      return updatedRows(
        withStatus(
          await db
            .from('receipt_line_amounts')
            .update(fields)
            .eq('line_id', lineId)
            .eq('line_total', dinar(before.lineTotal))
            .filter('zero_reason', before.zeroReason === null ? 'is' : 'eq', before.zeroReason)
            .select('id'),
        ),
      );
    });
  } catch (error) {
    if (!(error instanceof ZeroRowsError) && !isDuplicate(error)) throw error;
    const now = await lineAmountOf(lineId);
    if (now?.lineTotal === total && now.zeroReason === reason) return;
    throw amountChanged();
  }
}

export interface AmountValues {
  discount: Fils;
  paidNow: Fils;
  cashAccountId: string | null;
}

/**
 * الخصم والمدفوع وصندوقه (صفّ واحد للمستند): إدخال أوّل مرّة، وبعدها الحقول المتغيّرة بس، مشروطة بالصفّ كما شافته الشاشة (كاتب ثاني
 * غيّر حقلاً بعدها: ما ينداس). صفر صفوف أو 23505: الصفّ ينقرا، والحقول المطلوبة بيه = انكتب، وإلا amount_changed.
 */
export async function setReceiptAmounts(docId: string, before: ReceiptAmounts | null, values: AmountValues): Promise<void> {
  const target = { discount: dinar(values.discount), paid_now: dinar(values.paidNow), cash_account_id: values.cashAccountId };
  const changed = before
    ? (['discount', 'paid_now', 'cash_account_id'] as const).filter((field) =>
        field === 'discount' ? before.discount !== values.discount : field === 'paid_now' ? before.paidNow !== values.paidNow : before.cashAccountId !== values.cashAccountId,
      )
    : (['discount', 'paid_now', 'cash_account_id'] as const).slice();
  if (changed.length === 0) return;
  try {
    await written(async (db) => {
      if (!before) return updatedRows(withStatus(await db.from('receipt_amounts').insert({ doc_id: docId, ...target }).select('id')));
      const patch: Partial<{ discount: string; paid_now: string; cash_account_id: string | null }> = {};
      if (changed.includes('discount')) patch.discount = target.discount;
      if (changed.includes('paid_now')) patch.paid_now = target.paid_now;
      if (changed.includes('cash_account_id')) patch.cash_account_id = target.cash_account_id;
      return updatedRows(
        withStatus(
          await db
            .from('receipt_amounts')
            .update(patch)
            .eq('doc_id', docId)
            .eq('discount', dinar(before.discount))
            .eq('paid_now', dinar(before.paidNow))
            .filter('cash_account_id', before.cashAccountId === null ? 'is' : 'eq', before.cashAccountId)
            .select('id'),
        ),
      );
    });
  } catch (error) {
    if (!(error instanceof ZeroRowsError) && !isDuplicate(error)) throw error;
    const now = await amountsOf(docId);
    const landed = now !== null && changed.every((field) => (field === 'discount' ? now.discount === values.discount : field === 'paid_now' ? now.paidNow === values.paidNow : now.cashAccountId === values.cashAccountId));
    if (landed) return;
    throw amountChanged();
  }
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

/** إعادة إضافة تحميل ضاع جوابها (23505 بمعرّف الجهاز): آخر قيم النموذج تنكتب فوقه. */
export function updateCharge(id: string, fields: ChargeFields): Promise<void> {
  return written(async (db) =>
    updatedRows(
      withStatus(
        await db
          .from('receipt_charges')
          .update({ label: fields.label.trim(), amount: dinar(fields.amount), allocate_by: fields.allocateBy, payee_party_id: fields.payeePartyId, cash_account_id: fields.cashAccountId })
          .eq('id', id)
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

// ─── مرتجع المورّد (0010، FOUNDATION ٣٣٥–٣٣٧، ٥٥٣؛ E15، E31، E47) ─────────────────────────────────────────────────────
// الأمين يكتب المسوّدة بالكميات من سطور استلام مرحَّل (دفعة السطر نفسها بمخزن الاستلام، E15)، وأدوار الكلفة يكتبون المبلغ اللي يقبله
// المورّد لكل سطر (دينار صحيح) ويرحّلون. الرأس والسطور كتابة مباشرة بسياسة receipt.draft، والمبالغ بسياسة receipt.amounts؛ والمورّد
// والمخزن والدفتر ينسخها الخادم من الاستلام. الأسماء من قراءة الاستلام والمواد (بلا تضمين جداول المرتجع).

export interface SupplierReturnDoc {
  id: string;
  status: DocStatus;
  version: number;
  docNo: string | null;
  receiptId: string;
  partyId: string;
  warehouseId: string;
  bookId: string;
  onDate: string;
  note: string | null;
  posted: boolean;
  voidReason: string | null;
  createdAt: string;
}

const RETURN_COLUMNS = 'id, doc_no, receipt_id, party_id, warehouse_id, book_id, returned_on, status, version, note, posted_at, void_reason, created_at';

function supplierReturnDoc(row: Row): SupplierReturnDoc {
  const version = row.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new RowShapeError('version');
  return {
    id: str(row, 'id'),
    status: oneOf(row, 'status', DOC_STATUSES),
    version,
    docNo: optStr(row, 'doc_no'),
    receiptId: str(row, 'receipt_id'),
    partyId: str(row, 'party_id'),
    warehouseId: str(row, 'warehouse_id'),
    bookId: str(row, 'book_id'),
    onDate: str(row, 'returned_on'),
    note: optStr(row, 'note'),
    posted: row.posted_at !== null && row.posted_at !== undefined,
    voidReason: optStr(row, 'void_reason'),
    createdAt: str(row, 'created_at'),
  };
}

export interface SupplierReturnLine {
  id: string;
  lineNo: number;
  receiptLineId: string;
  itemId: string;
  /** دفعة سطر الاستلام نفسها (يكتبها الخادم، E15). */
  lotId: string | null;
  /** بوحدة أساس المادّة، بالألف. */
  qty: Milli;
}

const RETURN_LINE_COLUMNS = 'id, line_no, receipt_line_id, item_id, lot_id, qty_base::text';

function returnLine(row: Row): SupplierReturnLine {
  const lineNo = count(row, 'line_no');
  if (lineNo === null) throw new RowShapeError('line_no');
  return { id: str(row, 'id'), lineNo, receiptLineId: str(row, 'receipt_line_id'), itemId: str(row, 'item_id'), lotId: optStr(row, 'lot_id'), qty: qtyOf(row, 'qty_base') };
}

/** المبلغ اللي يقبله المورّد للسطر (أدوار الكلفة؛ للأمين ما يرجع صفّ). */
export interface ReturnCredit {
  id: string;
  lineId: string;
  credit: Fils;
}

const creditRow = (row: Row): ReturnCredit => ({ id: str(row, 'id'), lineId: str(row, 'line_id'), credit: fils(row, 'credit_amount') });

/** الاستلام صاحب المرتجع للعرض (رقمه ويومه ومورّده). */
export interface ReturnReceipt {
  id: string;
  docNo: string | null;
  onDate: string;
  partyName: string;
}

export interface SupplierReturnBundle {
  doc: SupplierReturnDoc;
  receipt: ReturnReceipt;
  lines: (SupplierReturnLine & { itemName: string; baseUnit: BaseUnit })[];
  /** فارغة للأمين (سياسة الكلفة). */
  credits: ReturnCredit[];
}

export async function loadSupplierReturn(id: string, withMoney: boolean): Promise<SupplierReturnBundle> {
  const list = await readAll((db) =>
    Promise.all([
      db.from('supplier_returns').select(RETURN_COLUMNS).eq('id', id),
      db.from('supplier_return_lines').select(RETURN_LINE_COLUMNS).eq('doc_id', id).order('line_no') /* unbounded: سطور مستند واحد */,
      ...(withMoney ? [db.from('supplier_return_line_amounts').select('id, line_id, credit_amount::text').eq('doc_id', id) /* unbounded: مبالغ سطور مستند واحد */] : []),
    ]),
  );
  const [head] = list(0);
  if (!head) throw new ZeroRowsError();
  const doc = supplierReturnDoc(head);
  const lines = list(1).map(returnLine);
  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  const more = await readAll((db) =>
    Promise.all([
      db.from('receipts').select('id, doc_no, received_on, party:parties(name)').eq('id', doc.receiptId),
      ...(itemIds.length > 0 ? [db.from('items').select('id, name, base_unit').in('id', itemIds) /* unbounded: مواد سطور مستند واحد */] : []),
    ]),
  );
  const [receipt] = more(0);
  if (!receipt) throw new ZeroRowsError();
  const party = receipt.party === null || receipt.party === undefined ? null : obj(receipt.party, 'party');
  const items = new Map((itemIds.length > 0 ? more(1) : []).map((row) => [str(row, 'id'), { name: str(row, 'name'), baseUnit: oneOf(row, 'base_unit', BASE_UNITS) }]));
  return {
    doc,
    receipt: { id: str(receipt, 'id'), docNo: optStr(receipt, 'doc_no'), onDate: str(receipt, 'received_on'), partyName: party ? str(party, 'name') : '—' },
    lines: lines.map((line) => {
      const item = items.get(line.itemId);
      if (!item) throw new RowShapeError('item');
      return { ...line, itemName: item.name, baseUnit: item.baseUnit };
    }),
    credits: withMoney ? list(2).map(creditRow) : [],
  };
}

/** مرتجعات استلام واحد (للصفحة المرحَّلة)، الأقدم أوّلاً. */
export async function listReceiptReturns(receiptId: string): Promise<SupplierReturnDoc[]> {
  const list = await readAll((db) => Promise.all([db.from('supplier_returns').select(RETURN_COLUMNS).eq('receipt_id', receiptId).order('created_at').order('id') /* unbounded: مرتجعات استلام واحد */]));
  return list(0).map(supplierReturnDoc);
}

export interface ReturnOptionLine {
  receiptLineId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  qtyReceived: Milli;
  lotId: string | null;
  /** متبقّي دفعة السطر الآن (كمية بس). */
  qtyLeft: Milli;
}

export interface ReturnOptions {
  receiptId: string;
  receiptNo: string | null;
  partyId: string;
  partyName: string;
  warehouseId: string;
  receivedOn: string;
  status: DocStatus;
  lines: ReturnOptionLine[];
}

/** سطور الاستلام ومتبقّي دفعاتها لكتابة مرتجع (كميات بس، receipt.draft أو receipt.amounts). */
export async function supplierReturnOptions(receiptId: string): Promise<ReturnOptions> {
  const json = obj(await call<unknown>('supplier_return_options', { p_receipt: receiptId }), 'supplier_return_options');
  return {
    receiptId: str(json, 'receipt_id'),
    receiptNo: optStr(json, 'receipt_no'),
    partyId: str(json, 'party_id'),
    partyName: optStr(json, 'party_name') ?? '—',
    warehouseId: str(json, 'warehouse_id'),
    receivedOn: str(json, 'received_on'),
    status: oneOf(json, 'status', DOC_STATUSES),
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      return {
        receiptLineId: str(row, 'receipt_line_id'),
        lineNo: count(row, 'line_no') ?? 0,
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        qtyReceived: qtyOf(row, 'qty_received'),
        lotId: optStr(row, 'lot_id'),
        qtyLeft: qtyOf(row, 'qty_left'),
      };
    }),
  };
}

/** مسوّدة مرتجع بمعرّف يولد بالجهاز (الإعادة بعد جواب ضاع 23505 = انكتبت). المورّد والمخزن والدفتر ينسخها الخادم من الاستلام. */
export function createSupplierReturnDraft(id: string, receiptId: string, returnedOn: string): Promise<SupplierReturnDoc> {
  return written(async (db) => updatedRows(withStatus(await db.from('supplier_returns').insert({ id, receipt_id: receiptId, returned_on: returnedOn }).select(RETURN_COLUMNS)))).then(supplierReturnDoc);
}

export interface SupplierReturnPatch {
  day?: string;
  note?: string | null;
}

/** تاريخ المسوّدة أو ملاحظتها بشرط النسخة. */
export function updateSupplierReturnDraft(doc: Pick<SupplierReturnDoc, 'id' | 'version'>, patch: SupplierReturnPatch): Promise<SupplierReturnDoc> {
  const fields = {
    ...(patch.day ? { returned_on: patch.day } : {}),
    ...(patch.note === undefined ? {} : { note: patch.note?.trim() || null }),
  };
  return written(async (db) => updatedRows(withStatus(await db.from('supplier_returns').update(fields).eq('id', doc.id).eq('version', doc.version).select(RETURN_COLUMNS)))).then(supplierReturnDoc);
}

/** سطر بمعرّف يولد بالجهاز: سطر استلام وكمية بوحدة الأساس (المادّة والدفعة ينسخها الخادم). */
export function addReturnLine(docId: string, id: string, receiptLineId: string, qty: Milli): Promise<SupplierReturnLine> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('supplier_return_lines').insert({ id, doc_id: docId, receipt_line_id: receiptLineId, qty_base: decimalText(qty, 3) }).select(RETURN_LINE_COLUMNS))),
  ).then(returnLine);
}

/** كمية السطر بمعرّفه (إعادة إضافة ضاع جوابها 23505 تكتب آخر كمية فوقه). */
export function updateReturnLine(lineId: string, qty: Milli): Promise<SupplierReturnLine> {
  return written(async (db) => updatedRows(withStatus(await db.from('supplier_return_lines').update({ qty_base: decimalText(qty, 3) }).eq('id', lineId).select(RETURN_LINE_COLUMNS)))).then(returnLine);
}

export function deleteReturnLine(lineId: string, expectedVersion: number): Promise<{ deleted: boolean; version: number | null }> {
  return deleteDraftLine('supplier_return', lineId, expectedVersion);
}

export function discardSupplierReturn(id: string, expectedVersion: number): Promise<void> {
  return discardDraft('supplier_return', id, expectedVersion);
}

async function returnCreditOf(lineId: string): Promise<ReturnCredit | null> {
  const list = await readAll((db) => Promise.all([db.from('supplier_return_line_amounts').select('id, line_id, credit_amount::text').eq('line_id', lineId) /* unbounded: صفّ واحد للسطر */]));
  const [row] = list(0);
  return row ? creditRow(row) : null;
}

/**
 * المبلغ المقبول للسطر (دينار صحيح): إدخال أوّل مرّة، وتعديل مشروط بالمبلغ اللي شافته الشاشة. صفر صفوف أو 23505 (محاولة ضاع جوابها،
 * أو كاتب ثاني): الصفّ ينقرا، وإذا بيه المطلوب فانكتب، وإلا amount_changed.
 */
export async function setReturnCredit(lineId: string, before: ReturnCredit | null, credit: Fils): Promise<void> {
  try {
    await written(async (db) => {
      if (!before) return updatedRows(withStatus(await db.from('supplier_return_line_amounts').insert({ line_id: lineId, credit_amount: dinar(credit) }).select('id')));
      return updatedRows(
        withStatus(await db.from('supplier_return_line_amounts').update({ credit_amount: dinar(credit) }).eq('line_id', lineId).eq('credit_amount', dinar(before.credit)).select('id')),
      );
    });
  } catch (error) {
    if (!(error instanceof ZeroRowsError) && !isDuplicate(error)) throw error;
    const now = await returnCreditOf(lineId);
    if (now?.credit === credit) return;
    throw new RejectedError('amount_changed', t('return.credit.changed', 'تغيّر مبلغ في هذا المرتجع بعد فتحه؛ قُرئ من جديد، فراجع ما كتبته واحفظ مرّة أخرى.'));
  }
}

export interface SupplierReturnPreviewLine {
  lineId: string;
  lineNo: number;
  receiptLineId: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  qty: Milli;
  lotId: string | null;
  lotQtyLeft: Milli;
  /** السطر ياخذ متبقّي دفعته كلّه (E31). */
  wholeBalance: boolean;
  problem: Problem | null;
  warning: Problem | null;
}

/** حساب الخادم (أدوار الكلفة بس): قيمة السحب لكل سطر (قاعدة 13) والمبلغ المقبول و«فرق مرتجع» = القيمة − المقبول. */
export interface SupplierReturnPreviewMoney {
  /** value فارغة لسطر ما يكفيه متبقّي دفعته (مشكلته insufficient_stock تسمّي اللي سحب منها). */
  lines: readonly { lineId: string; value: Fils | null; credit: Fils | null; diff: Fils | null }[];
  valueTotal: Fils;
  creditTotal: Fils | null;
  diffTotal: Fils | null;
}

export interface SupplierReturnPreview {
  version: number;
  receiptId: string;
  receiptNo: string | null;
  problems: readonly Problem[];
  lines: readonly SupplierReturnPreviewLine[];
  ready: boolean;
  /** بصمة المعاينة: الترحيل يرسلها، والخادم يرفض stale_preview لو تغيّر متبقّي دفعة بعدها. */
  plan: string | null;
  /** null للأمين. */
  money: SupplierReturnPreviewMoney | null;
}

/** money غايب أو null للأمين (الخادم يشيله). */
const maybeMoney = (json: Row): Row | null => (json.money === null || json.money === undefined ? null : obj(json.money, 'money'));

export function parseSupplierReturnPreview(value: unknown): SupplierReturnPreview {
  const json = obj(value, 'preview_supplier_return');
  const version = count(json, 'version');
  if (version === null) throw new RowShapeError('version');
  const money = maybeMoney(json);
  return {
    version,
    receiptId: str(json, 'receipt_id'),
    receiptNo: optStr(json, 'receipt_no'),
    problems: arr(json.problems, 'problems').map((item) => problem(item)).filter((item): item is Problem => item !== null),
    lines: arr(json.lines, 'lines').map((item) => {
      const row = obj(item, 'lines');
      return {
        lineId: str(row, 'line_id'),
        lineNo: count(row, 'line_no') ?? 0,
        receiptLineId: str(row, 'receipt_line_id'),
        itemId: str(row, 'item_id'),
        itemName: str(row, 'item_name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        qty: qtyOf(row, 'qty'),
        lotId: optStr(row, 'lot_id'),
        lotQtyLeft: qtyOf(row, 'lot_qty_left'),
        wholeBalance: bool(row, 'whole_balance'),
        problem: problem(row.problem),
        warning: problem(row.warning),
      };
    }),
    ready: bool(json, 'ready'),
    plan: optStr(json, 'plan'),
    money: money
      ? {
          lines: arr(money.lines, 'lines').map((item) => {
            const row = obj(item, 'lines');
            return { lineId: str(row, 'line_id'), value: scaled(row, 'value', 2), credit: scaled(row, 'credit', 2), diff: scaled(row, 'diff', 2) };
          }),
          valueTotal: fils(money, 'value_total'),
          creditTotal: scaled(money, 'credit_total', 2),
          diffTotal: scaled(money, 'diff_total', 2),
        }
      : null,
  };
}

export async function previewSupplierReturn(id: string): Promise<SupplierReturnPreview> {
  return parseSupplierReturnPreview(await call<unknown>('preview_supplier_return', { p_id: id }));
}

export interface PostedReturn {
  id: string;
  status: DocStatus;
  docNo: string | null;
}

function postedReturn(value: unknown): PostedReturn {
  const json = obj(value, 'supplier_return');
  return { id: str(json, 'id'), status: oneOf(json, 'status', DOC_STATUSES), docNo: optStr(json, 'doc_no') };
}

/** الترحيل بنسخة المسوّدة وبصمة المعاينة اللي انعاينت (stale_draft أو stale_preview لمّا تتغيّر بعدها)، بمرجع ثابت. */
export async function postSupplierReturn(ref: StockRef, id: string, expectedVersion: number, plan: string): Promise<PostedReturn> {
  return postedReturn(await call<unknown>('post_supplier_return', { p_id: id, p_expected_version: expectedVersion, p_expected_plan: plan, p_client_ref: ref.clientRef }));
}

export async function voidSupplierReturn(ref: StockRef, id: string, reason: string): Promise<PostedReturn> {
  return postedReturn(await call<unknown>('void_supplier_return', { p_id: id, p_reason: reason, p_client_ref: ref.clientRef }));
}

// ─── تصحيح سعر الاستلام بعد السحب (0010، FOUNDATION ١٤١، ٥٥٢؛ E5، E16، E51، E55): للمدير والمالك بس (receipt.revalue) ───────

export interface ReceiptRevaluation {
  id: string;
  receiptLineId: string;
  newTotal: Fils;
  oldTotal: Fils;
  diff: Fils;
  lotShare: Fils;
  expenseAmount: Fils;
  reason: string;
  status: 'posted' | 'void';
  postedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

const REVALUATION_STATUSES = ['posted', 'void'] as const;

/** تصحيحات أسعار سطور استلام واحد (أدوار الكلفة؛ لغيرها صفر صفوف)، الأقدم أوّلاً. */
export async function listLineRevaluations(receiptId: string): Promise<ReceiptRevaluation[]> {
  const list = await readAll((db) =>
    Promise.all([
      db
        .from('receipt_revaluations') /* unbounded: تصحيحات استلام واحد */
        .select('id, receipt_line_id, new_total::text, old_total::text, diff::text, lot_share::text, expense_amount::text, reason, status, posted_at, void_reason, created_at')
        .eq('receipt_id', receiptId)
        .order('created_at')
        .order('id'),
    ]),
  );
  return list(0).map((row) => ({
    id: str(row, 'id'),
    receiptLineId: str(row, 'receipt_line_id'),
    newTotal: fils(row, 'new_total'),
    oldTotal: fils(row, 'old_total'),
    diff: fils(row, 'diff'),
    lotShare: fils(row, 'lot_share'),
    expenseAmount: fils(row, 'expense_amount'),
    reason: str(row, 'reason'),
    status: oneOf(row, 'status', REVALUATION_STATUSES),
    postedAt: optStr(row, 'posted_at'),
    voidReason: optStr(row, 'void_reason'),
    createdAt: str(row, 'created_at'),
  }));
}

export interface RevalueFamilyLot {
  lotId: string;
  warehouseId: string;
  warehouseName: string;
  qtyLeft: Milli;
  valueLeft: Fils;
  share: Fils;
}

export interface RevaluePreview {
  lineId: string;
  receiptId: string;
  receiptNo: string | null;
  itemName: string;
  baseUnit: BaseUnit;
  qtyIn: Milli;
  currentTotal: Fils | null;
  newTotal: Fils | null;
  diff: Fils | null;
  /** دفعة السطر ومراياها بترتيب الخادم (الجذر ثم المرايا). */
  family: readonly RevalueFamilyLot[];
  lotShare: Fils | null;
  expenseAmount: Fils | null;
  /** قيد المورّد = −الفرق. */
  supplierAdjustment: Fils | null;
  problems: readonly Problem[];
  ready: boolean;
  /** بصمة القسمة اللي انشافت: الترحيل يرفض stale_preview لو تغيّرت (FOUNDATION ٥٢٠). */
  plan: string | null;
}

export function parseRevaluePreview(value: unknown): RevaluePreview {
  const json = obj(value, 'preview_receipt_revalue');
  return {
    lineId: str(json, 'line_id'),
    receiptId: str(json, 'receipt_id'),
    receiptNo: optStr(json, 'receipt_no'),
    itemName: str(json, 'item_name'),
    baseUnit: oneOf(json, 'base_unit', BASE_UNITS),
    qtyIn: qtyOf(json, 'qty_in'),
    currentTotal: scaled(json, 'current_total', 2),
    newTotal: scaled(json, 'new_total', 2),
    diff: scaled(json, 'diff', 2),
    family: (json.family === null || json.family === undefined ? [] : arr(json.family, 'family')).map((item) => {
      const row = obj(item, 'family');
      return {
        lotId: str(row, 'lot_id'),
        warehouseId: str(row, 'warehouse_id'),
        warehouseName: str(row, 'warehouse_name'),
        qtyLeft: qtyOf(row, 'qty_left'),
        valueLeft: fils(row, 'value_left'),
        share: fils(row, 'share'),
      };
    }),
    lotShare: scaled(json, 'lot_share', 2),
    expenseAmount: scaled(json, 'expense_amount', 2),
    supplierAdjustment: scaled(json, 'supplier_adjustment', 2),
    problems: arr(json.problems, 'problems').map((item) => problem(item)).filter((item): item is Problem => item !== null),
    ready: bool(json, 'ready'),
    plan: optStr(json, 'plan'),
  };
}

/** المعاينة بلا كتابة: العائلة وحصصها و«فرق سعر شراء» وقيد المورّد (الجديد دينار صحيح). */
export async function previewReceiptRevalue(lineId: string, newTotal: Fils): Promise<RevaluePreview> {
  return parseRevaluePreview(await call<unknown>('preview_receipt_revalue', { p_line: lineId, p_new_total: dinar(newTotal) }));
}

export interface PostedRevaluation {
  id: string;
  status: 'posted' | 'void';
}

function postedRevaluation(value: unknown): PostedRevaluation {
  const json = obj(value, 'receipt_revalue');
  // الترحيل يرجّع التصحيح بلا حالته (مرحَّل)، والإلغاء بحالته.
  return { id: str(json, 'id'), status: json.status === undefined ? 'posted' : oneOf(json, 'status', REVALUATION_STATUSES) };
}

/** التصحيح بسببه، بمرجع ثابت (الإعادة بنفس المرجع = تصحيح واحد). */
export async function postReceiptRevalue(ref: StockRef, lineId: string, newTotal: Fils, plan: string, reason: string): Promise<PostedRevaluation> {
  return postedRevaluation(
    await call<unknown>('post_receipt_revalue', { p_line: lineId, p_new_total: dinar(newTotal), p_expected_plan: plan, p_reason: reason, p_client_ref: ref.clientRef }),
  );
}

export async function voidReceiptRevalue(ref: StockRef, id: string, reason: string): Promise<PostedRevaluation> {
  return postedRevaluation(await call<unknown>('void_receipt_revalue', { p_id: id, p_reason: reason, p_client_ref: ref.clientRef }));
}
