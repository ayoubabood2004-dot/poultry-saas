import { decimalText } from '../../domain/decimal';
import type { Fils, Milli } from '../../domain/money';
import { BASE_UNITS, ITEM_KINDS, WAREHOUSE_KINDS, type ItemKind, type WarehouseKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import { arr, bool, count, filsOf, moneyOf, obj, oneOf, optStr, qtyOf, RowShapeError, scaled, str } from './inventory';

// «المخزن ببساطة» (0017، كلمة المالك 2026-11-06: «لما اجي اكتب اسم مادة… راح ينفتحلي ملف الذرة بشكل بطاقة… هذا الملف يسجلي بالضبط
// كل شراء»): بطاقات المواد (items_overview)، وملفّ المادّة (item_file)، والشراء بدالّة واحدة تُحفظ فوراً (record_purchase) بدل ورقة
// الاستلام المقسومة بين الأمين والمحاسب. ملف كسول بحزمة شاشات المخزون (والمعمل يقرأ منه «عندك»)، وindex ما يصدّره (write-guard).
// الأرقام نصوص عشرية بالسلك (E3): الكمية بالآلاف (Milli) والمال بالفلس (Fils). والمال يظهر لأدوار الكلفة ولمن يسجّل الشراء
// (purchase.record، ومنهم الأمين: كلمة المالك «والأمين يرى أسعار الشراء والبيع»)، ويغيب مفتاحه كلّه لغيرهم فالشاشة تقرؤه ولا تفترضه.

type Row = Record<string, unknown>;

/** علامة منطقية جديدة (0020): غيابها (جواب خادم قبلها) = false، وحضورها منطقيّ إجباراً. */
const flagOr = (row: Row, field: string, absent: boolean): boolean => (row[field] === undefined ? absent : bool(row, field));

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
  /** مشتريات دخلت بلا سعر ولم يُكمَّل سعرها (0020)؛ 0 من جواب قبلها. */
  unpricedCount: number;
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
        unpricedCount: row.unpriced_count === undefined ? 0 : nat(row, 'unpriced_count'),
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
  /** تتبّع تاريخ الانتهاء: الشراء يطلب «تاريخ الانتهاء» (مراجعة الجولة الأولى، م٣). */
  tracksExpiry: boolean;
  /** نسخة المادّة (0020): الحذف والإخفاء بشرطها؛ null من جواب قبلها. */
  version: number | null;
}

/** أين المادّة الآن بمخازن النطاق (0020): الرصيد، والمتاح غير المنتهي (البيع والتحويل والنقل منه)، والمنتهي. */
export interface FileStore {
  warehouseId: string;
  name: string;
  kind: WarehouseKind;
  qty: Milli;
  available: Milli;
  expired: Milli;
}

/** مخزن فعّال يقبل نوع المادّة (0020): وجهات «انقل». */
export interface FileTarget {
  warehouseId: string;
  name: string;
  kind: WarehouseKind;
}

export interface FileMoney {
  /** مجموع مبالغ الشراء (بالدينار الصحيح من الخادم). */
  purchasedValue: Fils;
  avgUnitPrice: Fils | null;
  sellPrice: Fils | null;
  lastUnitPrice: Fils | null;
}

export interface FilePurchaseMoney {
  /** سعر الشراء لوحدة الأساس؛ null لشراء دخل بلا سعر (0020). */
  unitPrice: Fils | null;
  /** مبلغ السطر بالدينار الصحيح. */
  lineTotal: Fils;
  /** سعر البيع المكتوب مع هذا الشراء، أو null (والشراء القديم من ورقة الاستلام بلا سعر بيع). */
  sellPrice: Fils | null;
  /** على السطر تصحيح سعر مرحَّل: المجموع وسعر الشراء من آخر تصحيح (م٢)، والشاشة تقول «مصحَّح». */
  corrected: boolean;
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
  /** false: دخل بلا سعر ولم يُكمَّل بعد (0020)، فالسطر «بلا سعر». */
  priced: boolean;
  /** «أكمل السعر» لهذا السطر (لمن يسجّل الشراء وبنطاق دفتره). */
  canPrice: boolean;
  money: FilePurchaseMoney | null;
}

export interface ItemFile {
  today: string;
  canRecord: boolean;
  /** can('stores.manage'): «عدّل المادّة». */
  canEdit: boolean;
  /** «احذف» (0020): لمن يدير المخازن ولمادّة لم تُستعمل قطّ؛ وإلّا «أخفِ». */
  canDelete: boolean;
  /** أين استُعملت المادّة («لها مشتريات»…)، لسبب «أخفِ» بدل «احذف». */
  uses: readonly string[];
  /** «حوّل» و«انقل» و«بِع» بحكم الخادم (الدور، والمادّة فعّالة بموجود، ونوعها). */
  canConvert: boolean;
  canTransfer: boolean;
  canSell: boolean;
  /** «أكمل السعر» لسطر واحد على الأقلّ، وعدد المشتريات بلا سعر. */
  canPrice: boolean;
  unpricedCount: number;
  item: FileItem;
  stores: readonly FileStore[];
  transferTargets: readonly FileTarget[];
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
      tracksExpiry: bool(item, 'tracks_expiry'),
      version: item.version === undefined ? null : nat(item, 'version'),
    },
    canDelete: flagOr(json, 'can_delete', false),
    uses: json.uses === undefined ? [] : arr(json.uses, 'uses').map((use) => {
      if (typeof use !== 'string' || use === '') throw new RowShapeError('uses');
      return use;
    }),
    canConvert: flagOr(json, 'can_convert', false),
    canTransfer: flagOr(json, 'can_transfer', false),
    canSell: flagOr(json, 'can_sell', false),
    canPrice: flagOr(json, 'can_price', false),
    unpricedCount: json.unpriced_count === undefined ? 0 : nat(json, 'unpriced_count'),
    stores:
      json.stores === undefined
        ? []
        : arr(json.stores, 'stores').map((entry) => {
            const row = obj(entry, 'stores');
            return { warehouseId: str(row, 'warehouse_id'), name: str(row, 'name'), kind: oneOf(row, 'kind', WAREHOUSE_KINDS), qty: qtyOf(row, 'qty'), available: qtyOf(row, 'available'), expired: qtyOf(row, 'expired') };
          }),
    transferTargets:
      json.transfer_targets === undefined
        ? []
        : arr(json.transfer_targets, 'transfer_targets').map((entry) => {
            const row = obj(entry, 'transfer_targets');
            return { warehouseId: str(row, 'warehouse_id'), name: str(row, 'name'), kind: oneOf(row, 'kind', WAREHOUSE_KINDS) };
          }),
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
        priced: flagOr(row, 'priced', true),
        canPrice: flagOr(row, 'can_price', false),
        // سعر الوحدة null لسطر بلا سعر وحده (0020)؛ والمسعَّر يُلزمه كما كان.
        money: rowMoney
          ? {
              unitPrice: flagOr(row, 'priced', true) ? filsOf(rowMoney, 'unit_price') : scaled(rowMoney, 'unit_price', 2),
              lineTotal: filsOf(rowMoney, 'line_total'),
              sellPrice: scaled(rowMoney, 'sell_price', 2),
              corrected: bool(rowMoney, 'corrected'),
            }
          : null,
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
  /** سعر الشراء لوحدة الأساس، أو null: «يدخل وأكمّل السعر بعدين» (0020، كلمة المالك 2026-11-08) — والشراء بلا سعر بالدين وحده. */
  unitPrice: Fils | null;
  sellPrice: Fils | null;
  payment: Payment;
  /** للنقد بس. */
  cashAccountId: string | null;
  /** null: الخادم يختار مخزن المادّة الوحيد (وstore_required إن كانت لها أكثر من مخزن). */
  warehouseId: string | null;
  /** YYYY-MM-DD لمادّة تتبّع الانتهاء، وnull لغيرها (م٣). */
  expiryOn: string | null;
  /** لحظة الفقس (ISO) للأفراخ وحدها، وnull لغيرها (م٣). */
  bornAt: string | null;
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
  /** false: دخل بلا سعر (0020)؛ يُكمَّل من الملفّ. */
  priced: boolean;
  /** null لو رجعت النتيجة المحفوظة مقنَّعة (إعادة بالمرجع نفسه). سعر الوحدة null للشراء بلا سعر. */
  money: { unitPrice: Fils | null; lineTotal: Fils; sellPrice: Fils | null; paidNow: Fils } | null;
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
    priced: flagOr(json, 'priced', true),
    money: money
      ? {
          unitPrice: flagOr(json, 'priced', true) ? filsOf(money, 'unit_price') : scaled(money, 'unit_price', 2),
          lineTotal: filsOf(money, 'line_total'),
          sellPrice: scaled(money, 'sell_price', 2),
          paidNow: filsOf(money, 'paid_now'),
        }
      : null,
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
      p_unit_price: input.unitPrice === null ? null : decimalText(input.unitPrice, 2),
      p_sell_price: input.sellPrice === null ? null : decimalText(input.sellPrice, 2),
      p_payment: input.payment,
      p_cash_account: input.payment === 'cash' ? input.cashAccountId : null,
      p_warehouse: input.warehouseId,
      // المفتاحان دائماً (null لغير المعنيّ): توقيع الدالّة باثني عشر معاملاً وزيادتين في آخره (0017، م٣).
      // المفتاحان حاضران دائماً (فارغان لغير المادّة التي تتابع الانتهاء وغير الأفراخ): مفتاح ناقص يغيّر بصمة الإعادة.
      p_expiry_on: input.expiryOn ?? null,
      p_born_at: input.bornAt ?? null,
    }),
  );
}

// ─── عمليات المخزن البسيطة (0020، كلمة المالك 2026-11-08) ──────────────────────────────────────────────────────────
// الحذف لمادّة لم يُشترَ منها ولم تتحرّك (وإلّا item_in_use و«أخفِها»)، و«أكمل السعر» لشراء دخل بلا سعر، والتحويل من مادّة إلى مادّة بالكلفة
// نفسها، والنقل من مخزن إلى مخزن بخطوة واحدة؛ ثمّ البيع (0021). كلّ واحدة نداء واحد يُحفظ فوراً بمعرّفات من الجهاز ومرجع، فالإعادة بعد
// نتيجة مجهولة بالنداء نفسه لا تُسجَّل مرّتين.

export interface OpIds {
  clientRef: string;
  docId: string;
  lineId: string;
}

export function newOpIds(): OpIds {
  return { clientRef: crypto.randomUUID(), docId: crypto.randomUUID(), lineId: crypto.randomUUID() };
}

/** حذف مادّة لم تُستعمل قطّ (stores.manage) بشرط نسختها؛ وإن كانت مستعملة يرفض الخادم item_in_use بتلميح يسمّي أين. */
export async function deleteItem(itemId: string, expectedVersion: number): Promise<void> {
  await call<unknown>('delete_item', { p_item: itemId, p_expected_version: expectedVersion });
}

export interface PriceInput {
  lineId: string;
  /** سعر الشراء لوحدة الأساس. */
  unitPrice: Fils;
  sellPrice: Fils | null;
}

export interface PricedPurchase {
  docNo: string;
  qty: Milli;
  /** صُرف منه شيء قبل السعر: كلفته «فرق سعر شراء». */
  usedBeforePricing: boolean;
  /** null لمن لا يرى المال (القناع). */
  money: { unitPrice: Fils; lineTotal: Fils } | null;
}

export function parsePricedPurchase(value: unknown): PricedPurchase {
  const json = obj(value, 'price_purchase');
  const money = moneyOf(json);
  return {
    docNo: str(json, 'doc_no'),
    qty: qtyOf(json, 'qty'),
    usedBeforePricing: bool(json, 'used_before_pricing'),
    money: money ? { unitPrice: filsOf(money, 'unit_price'), lineTotal: filsOf(money, 'line_total') } : null,
  };
}

/** «أكمل السعر» لشراء دخل بلا سعر: دين المورّد وقيمة الوجبة، وما صُرف قبله «فرق سعر شراء» (0020). */
export async function pricePurchase(clientRef: string, input: PriceInput): Promise<PricedPurchase> {
  return parsePricedPurchase(await call<unknown>('price_purchase', {
    p_client_ref: clientRef,
    p_line_id: input.lineId,
    p_unit_price: decimalText(input.unitPrice, 2),
    p_sell_price: input.sellPrice === null ? null : decimalText(input.sellPrice, 2),
  }));
}

export interface ConversionInput {
  fromItemId: string;
  /** بوحدة أساس المادّة الأولى. */
  fromQty: Milli;
  toItemId: string;
  /** بوحدة أساس المادّة الثانية. */
  toQty: Milli;
  /** YYYY-MM-DD. */
  on: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
}

export interface ConversionSide {
  itemName: string;
  warehouseName: string;
  qty: Milli;
  baseUnit: BaseUnit;
}

export interface RecordedConversion {
  docNo: string;
  from: ConversionSide;
  to: ConversionSide;
  /** قيمة ما انتقل (= قيمة المسحوب)، أو null لمن لا يرى الكلفة. */
  value: Fils | null;
}

export function parseRecordedConversion(value: unknown): RecordedConversion {
  const json = obj(value, 'record_conversion');
  const side = (field: 'from' | 'to'): ConversionSide => {
    const row = obj(json[field], field);
    return { itemName: str(row, 'item_name'), warehouseName: str(row, 'warehouse_name'), qty: qtyOf(row, 'qty'), baseUnit: oneOf(row, 'base_unit', BASE_UNITS) };
  };
  const money = moneyOf(json);
  return { docNo: str(json, 'doc_no'), from: side('from'), to: side('to'), value: money ? filsOf(money, 'value') : null };
}

/** «حوّل» مادّة إلى مادّة بالكلفة نفسها (ذرة ← خلطة، أكياس ← فلّ): سحب الأولى ووجبة من الثانية بقيمة المسحوب. */
export async function recordConversion(ids: OpIds, input: ConversionInput): Promise<RecordedConversion> {
  return parseRecordedConversion(await call<unknown>('record_conversion', {
    p_client_ref: ids.clientRef,
    p_doc_id: ids.docId,
    p_from_item: input.fromItemId,
    p_from_qty: decimalText(input.fromQty, 3),
    p_to_item: input.toItemId,
    p_to_qty: decimalText(input.toQty, 3),
    p_on: input.on,
    p_from_warehouse: input.fromWarehouseId,
    p_to_warehouse: input.toWarehouseId,
  }));
}

export interface TransferInput {
  itemId: string;
  qty: Milli;
  /** null: المخزن الوحيد الذي فيه المادّة. */
  fromWarehouseId: string | null;
  toWarehouseId: string;
  on: string;
}

export interface RecordedTransfer {
  docNo: string;
  qty: Milli;
  fromName: string;
  toName: string;
}

export function parseRecordedTransfer(value: unknown): RecordedTransfer {
  const json = obj(value, 'record_transfer');
  return { docNo: str(json, 'doc_no'), qty: qtyOf(json, 'qty'), fromName: str(json, 'from_warehouse_name'), toName: str(json, 'to_warehouse_name') };
}

/** «انقل» من مخزن إلى مخزن بخطوة واحدة (نواة التحويل نفسها، ويُلغى بإلغاء التحويل). */
export async function recordTransfer(ids: OpIds, input: TransferInput): Promise<RecordedTransfer> {
  return parseRecordedTransfer(await call<unknown>('record_transfer', {
    p_client_ref: ids.clientRef,
    p_doc_id: ids.docId,
    p_line_id: ids.lineId,
    p_item: input.itemId,
    p_qty: decimalText(input.qty, 3),
    p_from_warehouse: input.fromWarehouseId,
    p_to_warehouse: input.toWarehouseId,
    p_on: input.on,
  }));
}

// ─── البيع (0021) ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SaleInput {
  partyId: string;
  itemId: string;
  qty: Milli;
  /** سعر البيع لوحدة الأساس؛ صفر «تسليم بلا مقابل» بعد تأكيد. */
  unitPrice: Fils;
  soldOn: string;
  payment: Payment;
  cashAccountId: string | null;
  warehouseId: string | null;
}

/** فاتورة بيع بنداء واحد تُحفظ فوراً: السحب من الوجبات بالترتيب، وقيد الجهة (والصندوق للنقد). */
export async function recordSale(ids: OpIds, input: SaleInput): Promise<RecordedSale> {
  return parseRecordedSale(await call<unknown>('record_sale', {
    p_client_ref: ids.clientRef,
    p_sale_id: ids.docId,
    p_line_id: ids.lineId,
    p_party: input.partyId,
    p_item: input.itemId,
    p_qty: decimalText(input.qty, 3),
    p_unit_price: decimalText(input.unitPrice, 2),
    p_sold_on: input.soldOn,
    p_payment: input.payment,
    p_cash_account: input.payment === 'cash' ? input.cashAccountId : null,
    p_warehouse: input.warehouseId,
  }));
}

export interface SaleMoney {
  unitPrice: Fils;
  lineTotal: Fils;
}

/** الكلفة والربح: لأدوار الكلفة وحدها (cost.money يغيب لغيرها). */
export interface SaleCost {
  cost: Fils;
  profit: Fils;
}

/** قراءة cost.money إن حضرت. */
const costOf = (row: Row): SaleCost | null => {
  if (row.cost === undefined || row.cost === null) return null;
  const money = moneyOf(obj(row.cost, 'cost'));
  return money ? { cost: filsOf(money, 'cost'), profit: filsOf(money, 'profit') } : null;
};

const SALE_STATUSES = ['posted', 'void'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export interface RecordedSale {
  id: string;
  docNo: string;
  status: SaleStatus;
  soldOn: string;
  payment: Payment;
  partyName: string;
  warehouseName: string;
  itemName: string;
  qty: Milli;
  baseUnit: BaseUnit;
  /** تسليم بلا مقابل (المبلغ صفر). */
  free: boolean;
  /** null لمن لا يرى المبلغ (القناع). */
  money: SaleMoney | null;
  cost: SaleCost | null;
}

export function parseRecordedSale(value: unknown): RecordedSale {
  const json = obj(value, 'record_sale');
  const money = moneyOf(json);
  return {
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    status: oneOf(json, 'status', SALE_STATUSES),
    soldOn: str(json, 'sold_on'),
    payment: oneOf(json, 'payment', PAYMENTS),
    partyName: str(json, 'party_name'),
    warehouseName: str(json, 'warehouse_name'),
    itemName: str(json, 'item_name'),
    qty: qtyOf(json, 'qty'),
    baseUnit: oneOf(json, 'base_unit', BASE_UNITS),
    free: bool(json, 'free'),
    money: money ? { unitPrice: filsOf(money, 'unit_price'), lineTotal: filsOf(money, 'line_total') } : null,
    cost: costOf(json),
  };
}

export interface VoidedSale {
  docNo: string;
  /** المقبوض نقداً يبقى رصيداً للجهة (FOUNDATION ٥٨٣)، أو null لمن لا يرى المال. */
  paymentKept: Fils | null;
}

export function parseVoidedSale(value: unknown): VoidedSale {
  const json = obj(value, 'void_sale');
  const money = moneyOf(json);
  return { docNo: str(json, 'doc_no'), paymentKept: money ? filsOf(money, 'payment_kept') : null };
}

/** إلغاء البيع (void): البضاعة ترجع لوجباتها وقيد الفاتورة يُعكس، والمقبوض نقداً يبقى رصيداً للجهة. */
export async function voidSale(clientRef: string, saleId: string, reason: string): Promise<VoidedSale> {
  return parseVoidedSale(await call<unknown>('void_sale', { p_sale_id: saleId, p_reason: reason, p_client_ref: clientRef }));
}

export interface SaleRow {
  id: string;
  docNo: string;
  soldOn: string;
  status: SaleStatus;
  payment: Payment;
  partyName: string;
  itemName: string;
  qty: Milli;
  baseUnit: BaseUnit;
  free: boolean;
  money: SaleMoney | null;
  cost: SaleCost | null;
}

export interface SalesOverview {
  from: string;
  to: string;
  today: string;
  canRecord: boolean;
  canVoid: boolean;
  rows: readonly SaleRow[];
  /** بعد الـ1,000 فواتير أقدم لم تُرسل (المجاميع على الفترة كلّها). */
  more: boolean;
  totals: { count: number; voided: number; money: { revenue: Fils; cash: Fils; credit: Fils } | null; cost: SaleCost | null };
}

export function parseSalesOverview(value: unknown): SalesOverview {
  const json = obj(value, 'sales_overview');
  const totals = obj(json.totals, 'totals');
  const totalMoney = moneyOf(totals);
  return {
    from: str(json, 'from'),
    to: str(json, 'to'),
    today: str(json, 'today'),
    canRecord: bool(json, 'can_record'),
    canVoid: bool(json, 'can_void'),
    rows: arr(json.rows, 'rows').map((entry) => {
      const row = obj(entry, 'rows');
      const money = moneyOf(row);
      return {
        id: str(row, 'id'),
        docNo: str(row, 'doc_no'),
        soldOn: str(row, 'sold_on'),
        status: oneOf(row, 'status', SALE_STATUSES),
        payment: oneOf(row, 'payment', PAYMENTS),
        partyName: str(row, 'party_name'),
        itemName: str(row, 'item_name'),
        qty: qtyOf(row, 'qty'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        free: bool(row, 'free'),
        money: money ? { unitPrice: filsOf(money, 'unit_price'), lineTotal: filsOf(money, 'line_total') } : null,
        cost: costOf(row),
      };
    }),
    more: bool(json, 'more'),
    totals: {
      count: nat(totals, 'count'),
      voided: nat(totals, 'voided'),
      money: totalMoney ? { revenue: filsOf(totalMoney, 'revenue'), cash: filsOf(totalMoney, 'cash'), credit: filsOf(totalMoney, 'credit') } : null,
      cost: costOf(totals),
    },
  };
}

/** فواتير البيع بفترة (من ← إلى)، الأحدث أوّلاً، ومجاميعها. */
export async function loadSalesOverview(from: string, to: string): Promise<SalesOverview> {
  return parseSalesOverview(await call<unknown>('sales_overview', { p_from: from, p_to: to }));
}

export type SalesGroup = 'party' | 'item' | 'day';
const SALES_GROUPS: readonly SalesGroup[] = ['party', 'item', 'day'];

export interface SalesReportRow {
  key: string;
  label: string;
  count: number;
  /** للتجميع بالمادّة وحده (وحدة واحدة). */
  qty: Milli | null;
  baseUnit: BaseUnit | null;
  revenue: Fils | null;
  cost: SaleCost | null;
}

export interface SalesReport {
  group: SalesGroup;
  rows: readonly SalesReportRow[];
  totals: { count: number; revenue: Fils | null; cost: SaleCost | null };
}

export function parseSalesReport(value: unknown): SalesReport {
  const json = obj(value, 'sales_report');
  const totals = obj(json.totals, 'totals');
  const totalMoney = moneyOf(totals);
  return {
    group: oneOf(json, 'group', SALES_GROUPS),
    rows: arr(json.rows, 'rows').map((entry) => {
      const row = obj(entry, 'rows');
      const money = moneyOf(row);
      return {
        key: str(row, 'key'),
        label: str(row, 'label'),
        count: nat(row, 'count'),
        qty: scaled(row, 'qty', 3),
        baseUnit: optStr(row, 'base_unit') === null ? null : oneOf(row, 'base_unit', BASE_UNITS),
        revenue: money ? filsOf(money, 'revenue') : null,
        cost: costOf(row),
      };
    }),
    totals: { count: nat(totals, 'count'), revenue: totalMoney ? filsOf(totalMoney, 'revenue') : null, cost: costOf(totals) },
  };
}

/** تقرير المبيعات بفترة مجمَّعاً بالجهة أو المادّة أو اليوم (المرحَّل وحده). */
export async function loadSalesReport(from: string, to: string, group: SalesGroup): Promise<SalesReport> {
  return parseSalesReport(await call<unknown>('sales_report', { p_from: from, p_to: to, p_group: group }));
}
