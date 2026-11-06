import { decimalText } from '../../domain/decimal';
import type { Fils, Milli } from '../../domain/money';
import { BASE_UNITS, ITEM_KINDS, type ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import { arr, bool, count, filsOf, moneyOf, obj, oneOf, optStr, qtyOf, RowShapeError, scaled, str } from './inventory';

// «المخزن ببساطة» (0017، كلمة المالك 2026-11-06: «لما اجي اكتب اسم مادة… راح ينفتحلي ملف الذرة بشكل بطاقة… هذا الملف يسجلي بالضبط
// كل شراء»): بطاقات المواد (items_overview)، وملفّ المادّة (item_file)، والشراء بدالّة واحدة تُحفظ فوراً (record_purchase) بدل ورقة
// الاستلام المقسومة بين الأمين والمحاسب. ملف كسول بحزمة شاشات المخزون (والمعمل يقرأ منه «عندك»)، وindex ما يصدّره (write-guard).
// الأرقام نصوص عشرية بالسلك (E3): الكمية بالآلاف (Milli) والمال بالفلس (Fils). والمال يظهر لأدوار الكلفة ولمن يسجّل الشراء
// (purchase.record، ومنهم الأمين: كلمة المالك «والأمين يرى أسعار الشراء والبيع»)، ويغيب مفتاحه كلّه لغيرهم فالشاشة تقرؤه ولا تفترضه.

type Row = Record<string, unknown>;

/** عدد صحيح غير سالب إجباري من الخادم. */
const nat = (row: Row, field: string): number => {
  const value = count(row, field);
  if (value === null) throw new RowShapeError(field);
  return value;
};

export type Payment = 'credit' | 'cash';
const PAYMENTS: readonly Payment[] = ['credit', 'cash'];

// ─── بطاقات المواد ─────────────────────────────────────────────────────────────────────────────────────────────

export interface OverviewMoney {
  /** سعر البيع الحالي لوحدة الأساس (سعر آخر شراء كُتب له سعر)، أو null. */
  sellPrice: Fils | null;
  /** متوسّط سعر الشراء لوحدة الأساس (من الخادم بمرتبتين)، أو null بلا شراء. */
  avgUnitPrice: Fils | null;
}

export interface OverviewItem {
  id: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  /** الموجود الآن بمخازن النطاق، بوحدة الأساس. */
  onHand: Milli;
  /** مجموع ما اشتُري (وجبات الشراء الجذر المرحَّلة بمخازن النطاق). */
  purchased: Milli;
  lastPurchaseOn: string | null;
  /** null: المال مخفيّ عن هذا الدور. */
  money: OverviewMoney | null;
}

export interface ItemsOverview {
  today: string;
  /** can('purchase.record') من الخادم: «سجّل شراء». */
  canRecord: boolean;
  /** can('item.create') من الخادم: «أضف مادّة». */
  canAddItem: boolean;
  items: readonly OverviewItem[];
}

export function parseItemsOverview(value: unknown): ItemsOverview {
  const json = obj(value, 'items_overview');
  return {
    today: str(json, 'today'),
    canRecord: bool(json, 'can_record'),
    canAddItem: bool(json, 'can_add_item'),
    items: arr(json.items, 'items').map((entry) => {
      const row = obj(entry, 'items');
      const money = moneyOf(row);
      return {
        id: str(row, 'id'),
        name: str(row, 'name'),
        kind: oneOf(row, 'kind', ITEM_KINDS),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        onHand: qtyOf(row, 'on_hand_qty'),
        purchased: qtyOf(row, 'purchased_qty'),
        lastPurchaseOn: optStr(row, 'last_purchase_on'),
        money: money ? { sellPrice: scaled(money, 'sell_price', 2), avgUnitPrice: scaled(money, 'avg_unit_price', 2) } : null,
      };
    }),
  };
}

/** كلّ المواد الفعّالة بأرقامها، بقراءة واحدة (بطاقات المخزن، و«عندك» في منتقيات المعمل). */
export async function loadItemsOverview(): Promise<ItemsOverview> {
  return parseItemsOverview(await call<unknown>('items_overview', {}));
}

// ─── ملفّ المادّة ───────────────────────────────────────────────────────────────────────────────────────────────

export interface FileItem {
  id: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  /** كغم/لتر بوحدة ١/١٠٠٠٠، للسائل بس. */
  density: bigint | null;
  archived: boolean;
}

export interface FileMoney {
  /** مجموع مبالغ الشراء (بالدينار الصحيح من الخادم). */
  purchasedValue: Fils;
  avgUnitPrice: Fils | null;
  sellPrice: Fils | null;
  lastUnitPrice: Fils | null;
}

export interface FilePurchaseMoney {
  /** سعر الشراء لوحدة الأساس. */
  unitPrice: Fils;
  /** مبلغ السطر بالدينار الصحيح. */
  lineTotal: Fils;
  /** سعر البيع المكتوب مع هذا الشراء، أو null (والشراء القديم من ورقة الاستلام بلا سعر بيع). */
  sellPrice: Fils | null;
}

export interface FilePurchase {
  lineId: string;
  docId: string;
  docNo: string;
  receivedOn: string;
  partyId: string;
  partyName: string;
  warehouseName: string;
  /** بوحدة أساس المادّة. */
  qty: Milli;
  payment: Payment;
  money: FilePurchaseMoney | null;
}

export interface ItemFile {
  today: string;
  canRecord: boolean;
  /** can('stores.manage'): «عدّل المادّة». */
  canEdit: boolean;
  item: FileItem;
  onHand: Milli;
  purchased: Milli;
  purchasesCount: number;
  money: FileMoney | null;
  /** المرحَّل وحده، الأحدث أوّلاً، 200 صفّاً كحدّ أقصى. */
  purchases: readonly FilePurchase[];
  /** بعد الـ200 مشتريات أقدم لم تُرسل. */
  more: boolean;
  /**
   * الصناديق الفعّالة لنافذة «سجّل شراء» من الخادم (لمن يسجّل الشراء؛ وفارغة لغيره): الأمين لا يقرأ جدول الصناديق (سياسة
   * can_see_accounts المقيِّدة)، فالخادم يرسلها مع الملفّ. null: الجواب بلا المفتاح، فتُقرأ الصناديق من جدولها.
   */
  cashAccounts: readonly { id: string; name: string }[] | null;
}

export function parseItemFile(value: unknown): ItemFile {
  const json = obj(value, 'item_file');
  const item = obj(json.item, 'item');
  const money = moneyOf(json);
  return {
    today: str(json, 'today'),
    canRecord: bool(json, 'can_record'),
    canEdit: bool(json, 'can_edit'),
    item: {
      id: str(item, 'id'),
      name: str(item, 'name'),
      kind: oneOf(item, 'kind', ITEM_KINDS),
      baseUnit: oneOf(item, 'base_unit', BASE_UNITS),
      density: scaled(item, 'density_kg_per_l', 4),
      archived: bool(item, 'archived'),
    },
    onHand: qtyOf(json, 'on_hand_qty'),
    purchased: qtyOf(json, 'purchased_qty'),
    purchasesCount: nat(json, 'purchases_count'),
    money: money
      ? {
          purchasedValue: filsOf(money, 'purchased_value'),
          avgUnitPrice: scaled(money, 'avg_unit_price', 2),
          sellPrice: scaled(money, 'sell_price', 2),
          lastUnitPrice: scaled(money, 'last_unit_price', 2),
        }
      : null,
    purchases: arr(json.purchases, 'purchases').map((entry) => {
      const row = obj(entry, 'purchases');
      const rowMoney = moneyOf(row);
      return {
        lineId: str(row, 'line_id'),
        docId: str(row, 'doc_id'),
        docNo: str(row, 'doc_no'),
        receivedOn: str(row, 'received_on'),
        partyId: str(row, 'party_id'),
        partyName: str(row, 'party_name'),
        warehouseName: str(row, 'warehouse_name'),
        qty: qtyOf(row, 'qty'),
        payment: oneOf(row, 'payment', PAYMENTS),
        money: rowMoney ? { unitPrice: filsOf(rowMoney, 'unit_price'), lineTotal: filsOf(rowMoney, 'line_total'), sellPrice: scaled(rowMoney, 'sell_price', 2) } : null,
      };
    }),
    more: bool(json, 'more'),
    cashAccounts:
      json.cash_accounts === undefined
        ? null
        : arr(json.cash_accounts, 'cash_accounts').map((entry) => {
            const row = obj(entry, 'cash_accounts');
            return { id: str(row, 'id'), name: str(row, 'name') };
          }),
  };
}

export async function loadItemFile(itemId: string): Promise<ItemFile> {
  return parseItemFile(await call<unknown>('item_file', { p_item: itemId }));
}

// ─── سجّل شراء ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * معرّفات الشراء ومرجعه: تولد بالجهاز مرّة لكلّ نافذة شراء، وتبقى نفسها لكلّ إعادة حتى تُعرف النتيجة (FOUNDATION ٥١٩): الخادم يرجّع
 * النتيجة المحفوظة للمرجع نفسه، ويعرف ورقة الاستلام بمعرّفها (المحتوى نفسه = النتيجة نفسها، وغيره id_conflict)، فلا شراء مرّتين.
 */
export interface PurchaseIds {
  clientRef: string;
  receiptId: string;
  lineId: string;
}

export function newPurchaseIds(): PurchaseIds {
  return { clientRef: crypto.randomUUID(), receiptId: crypto.randomUUID(), lineId: crypto.randomUUID() };
}

export interface PurchaseInput {
  itemId: string;
  partyId: string;
  /** YYYY-MM-DD. */
  receivedOn: string;
  /** بوحدة أساس المادّة. */
  qty: Milli;
  /** سعر الشراء لوحدة الأساس. */
  unitPrice: Fils;
  sellPrice: Fils | null;
  payment: Payment;
  /** للنقد بس. */
  cashAccountId: string | null;
  /** null: الخادم يختار مخزن المادّة الوحيد (وstore_required إن كانت لها أكثر من مخزن). */
  warehouseId: string | null;
}

export interface RecordedPurchase {
  id: string;
  docNo: string;
  lineId: string;
  lotId: string;
  itemId: string;
  warehouseId: string;
  warehouseName: string;
  receivedOn: string;
  qty: Milli;
  payment: Payment;
  partyId: string;
  partyName: string;
  /** null لو رجعت النتيجة المحفوظة مقنَّعة (إعادة بالمرجع نفسه). */
  money: { unitPrice: Fils; lineTotal: Fils; sellPrice: Fils | null; paidNow: Fils } | null;
}

export function parseRecordPurchase(value: unknown): RecordedPurchase {
  const json = obj(value, 'record_purchase');
  const money = moneyOf(json);
  return {
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    lineId: str(json, 'line_id'),
    lotId: str(json, 'lot_id'),
    itemId: str(json, 'item_id'),
    warehouseId: str(json, 'warehouse_id'),
    warehouseName: str(json, 'warehouse_name'),
    receivedOn: str(json, 'received_on'),
    qty: qtyOf(json, 'qty'),
    payment: oneOf(json, 'payment', PAYMENTS),
    partyId: str(json, 'party_id'),
    partyName: str(json, 'party_name'),
    money: money ? { unitPrice: filsOf(money, 'unit_price'), lineTotal: filsOf(money, 'line_total'), sellPrice: scaled(money, 'sell_price', 2), paidNow: filsOf(money, 'paid_now') } : null,
  };
}

/** الشراء كلّه بمعاملة واحدة: ورقة الاستلام وسطرها ومبلغها وترحيلها (الدفعة والحركة وقيد المورّد، وحركة الصندوق للنقد). */
export async function recordPurchase(ids: PurchaseIds, input: PurchaseInput): Promise<RecordedPurchase> {
  return parseRecordPurchase(
    await call<unknown>('record_purchase', {
      p_client_ref: ids.clientRef,
      p_receipt_id: ids.receiptId,
      p_line_id: ids.lineId,
      p_item: input.itemId,
      p_party: input.partyId,
      p_received_on: input.receivedOn,
      p_qty: decimalText(input.qty, 3),
      p_unit_price: decimalText(input.unitPrice, 2),
      p_sell_price: input.sellPrice === null ? null : decimalText(input.sellPrice, 2),
      p_payment: input.payment,
      p_cash_account: input.payment === 'cash' ? input.cashAccountId : null,
      p_warehouse: input.warehouseId,
    }),
  );
}
