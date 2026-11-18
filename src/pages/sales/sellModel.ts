import { parseMoneyText } from '../../components/ui/MoneyInput';
import { decimalText } from '../../domain/decimal';
import { MILLI_PER_UNIT, type Fils, type Milli } from '../../domain/money';
import { normalizeCode } from '../../domain/normalize';
import { BASE_FACTOR, baseQtyOf, unitPriceOf } from '../../domain/saleInvoice';
import { parseQty } from '../../domain/units';
import { t } from '../../lib/i18n';
import type { PartyPick } from '../../lib/repo/purchasing';
import type { CatalogItem, CatalogUnit, PendingSale, SaleCatalog } from '../../lib/repo/sales';
import { baseUnitLabel } from '../../lib/storeLabels';
import { baseQty } from '../inventory/simple-shared';
import { inputMoney } from './saleParts';

// نموذج شاشة البيع (عقد 0033 «ب» وتصميم المبيعات): سطور السلّة كما كُتبت (نصوص الخانات)، والزبون، والدفع (تلقائيّ بقول المالك: النقديّ يدفع كلّه من
// آخر صندوق والزبون باسمه بالدين كلّه، أو اختيار البائع)، وقراءة السطور على موادّ المخزن (المتاح بعد جمع سطور المادّة كالخادم)، والوحدة الافتراضية،
// وحفظ الفاتورة المفتوحة في الجهاز وإرجاعها. دوالّ صافية بلا React تُفحص وحدها.

export const MAX_LINES = 100;
export const MAX_LEGS = 5;
export const NOTE_MAX = 500;

export interface CartLine {
  lineId: string;
  itemId: string;
  /** اسم المادّة لحظة إضافتها (يُعرض إن غابت من الموادّ بعد قراءة جديدة). */
  name: string;
  /** null = وحدة الأساس. */
  unitId: string | null;
  qty: string;
  price: string;
  /** سعر البيع لوحدة الأساس الذي اقتُرح منه السعر، أو null حين كتبه البائع (أو لا سعر): ما يُقارن قبل الحفظ. */
  suggestedFrom: Fils | null;
  discount: string;
}

export interface Leg {
  legId: string;
  boxId: string;
  amount: string;
}

export type Mode = 'party' | 'walk_in';
/** auto: بقول المالك (النقديّ نقداً كلّه، والزبون باسمه دين كلّه) حتى يختار البائع. */
export type Pay = 'auto' | 'cash' | 'debt' | 'part';
export type PayKind = Exclude<Pay, 'auto'>;

export interface Draft {
  /** '' = الافتراضيّ (المخزن من الرابط أو الأخير أو الوحيد). */
  warehouseId: string;
  lines: CartLine[];
  invoiceDiscount: string;
  mode: Mode;
  party: PartyPick | null;
  pay: Pay;
  /** ساق «نقداً كلّه» (معرّفها ثابت حتى تُعاد بالمرجع نفسه) وصندوقها ('' = الأخير أو الأوّل). */
  cashLegId: string;
  cashBox: string;
  /** سيقان «جزء الآن». */
  legs: Leg[];
  note: string;
  /** null = يوم الخادم. */
  day: string | null;
}

export function blankDraft(warehouseId = ''): Draft {
  return { warehouseId, lines: [], invoiceDiscount: '', mode: 'walk_in', party: null, pay: 'auto', cashLegId: crypto.randomUUID(), cashBox: '', legs: [], note: '', day: null };
}

/** الفاتورة بلا شيء يُحفظ على الجهاز (المخزن وحده يُتذكَّر في الذاكرة لا هنا). */
export const isBlank = (draft: Draft): boolean => draft.lines.length === 0 && draft.party === null && draft.invoiceDiscount.trim() === '' && draft.note.trim() === '';

/** طريقة الدفع الآن. */
export const payKindOf = (draft: Pick<Draft, 'pay' | 'mode'>): PayKind => (draft.pay === 'auto' ? (draft.mode === 'walk_in' ? 'cash' : 'debt') : draft.pay);

/** وحدات المادّة للسطر: الأساس أوّلاً ثمّ وحدات البيع من الخادم. */
export function unitsOf(item: Pick<CatalogItem, 'baseUnit' | 'units'>): CatalogUnit[] {
  return [{ unitId: null, label: baseUnitLabel(item.baseUnit), factor: BASE_FACTOR }, ...item.units.filter((unit) => unit.unitId !== null)];
}

/** شرائح الوحدة في ورقة السطر: وحدات البيع أوّلاً (الكيس قبل الكيلو) ثمّ الأساس. */
export function unitChipsOf(item: Pick<CatalogItem, 'baseUnit' | 'units'>): CatalogUnit[] {
  const [base, ...rest] = unitsOf(item);
  return base ? [...rest, base] : rest;
}

/** وحدة لمس البطاقة: الافتراضية من الخادم، وإلّا آخر وحدة بيعت بها المادّة على هذا الجهاز، وإلّا الأساس. */
export function defaultUnitOf(item: Pick<CatalogItem, 'id' | 'baseUnit' | 'units'>, remembered: Readonly<Record<string, string | null>>): CatalogUnit {
  const units = unitsOf(item);
  const flagged = item.units.find((unit) => unit.isDefault && unit.unitId !== null);
  if (flagged) return flagged;
  const last = remembered[item.id];
  const known = last === undefined ? undefined : units.find((unit) => unit.unitId === last);
  return known ?? (units[0] as CatalogUnit);
}

/** المادّة تُوزن أو تُكال بوحدتها (كغم أو لتر): لمس البطاقة يضيفها ويفتح ورقة السطر لكتابة الكمية، فـ«1 كغم» نادراً ما يُقصد. */
export const isWeighed = (item: Pick<CatalogItem, 'baseUnit'>, unit: Pick<CatalogUnit, 'unitId'>): boolean => unit.unitId === null && item.baseUnit !== 'pc';

/** السعر المقترح لوحدة من سعر البيع لوحدة الأساس (السعر × المعامل مقرّباً للفلس، كمرآة الخادم). */
function suggested(item: Pick<CatalogItem, 'sellPrice'>, unit: Pick<CatalogUnit, 'factor'>): string {
  return item.sellPrice === null ? '' : inputMoney(unitPriceOf(item.sellPrice, unit.factor));
}

/** سطر جديد لمادّة بوحدة، والسعر من سعر البيع إن وُجد. */
export function newLine(item: CatalogItem, unit: CatalogUnit, qty = '1'): CartLine {
  return { lineId: crypto.randomUUID(), itemId: item.id, name: item.name, unitId: unit.unitId, qty, price: suggested(item, unit), suggestedFrom: item.sellPrice, discount: '' };
}

/** نصّ الكمية بلا أصفار زائدة («2.500» ← «2.5»). */
export const qtyText = (qty: Milli): string => decimalText(qty, 3).replace(/\.?0+$/u, '') || '0';

/** الكمية بعد زيادة أو نقص واحد بوحدة السطر، أو null حين تصير صفراً أو أقلّ. */
export function steppedQty(text: string, delta: 1 | -1): string | null {
  const current = text.trim() ? parseQty(text) : 0n;
  const next = (current ?? 0n) + BigInt(delta) * MILLI_PER_UNIT;
  return next <= 0n ? null : qtyText(next);
}

/** رموز المادّة التي يقرؤها الماسح والبحث: الباركود والرموز الأخرى (alt_codes)، مطبَّعة (مراجعة 0033 C5/C6). */
export const codesOf = (item: Pick<CatalogItem, 'barcode' | 'altCodes'>): string[] => [item.barcode, ...item.altCodes].flatMap((code) => (code ? [normalizeCode(code)] : []));

/**
 * المادّة التي يعنيها رمز كامل كُتب أو مُسح وحده، فتُضاف بلا Enter: رمز واحد لمادّة واحدة بستّة أحرف على الأقلّ، ولا رمز أطول يبدأ به (فلا تُضاف «123»
 * ومادّة أخرى رمزها «1234» يُكتب).
 */
export function exactCodeItem(items: readonly CatalogItem[], text: string): CatalogItem | null {
  const wanted = normalizeCode(text);
  if (wanted.length < 6) return null;
  const owners = items.filter((item) => codesOf(item).includes(wanted));
  if (owners.length !== 1) return null;
  const longer = items.some((item) => codesOf(item).some((code) => code !== wanted && code.startsWith(wanted)));
  return longer ? null : (owners[0] ?? null);
}

export type LineField = 'item' | 'unit' | 'qty' | 'price' | 'discount';

export interface ParsedLine {
  line: CartLine;
  item: CatalogItem | null;
  unit: CatalogUnit | null;
  qty: Milli | null;
  price: Fils | null;
  discount: Fils | null;
  /** بوحدة الأساس، أو null. */
  base: Milli | null;
  errors: Partial<Record<LineField, string>>;
}

/** يقرأ سطور السلّة على الموادّ المعروضة (المتاح لكلّ مادّة بعد جمع سطورها، الخادم يفعل مثله: insufficient_stock). */
export function parseLines(lines: readonly CartLine[], catalog: SaleCatalog | null, storeName: string): ParsedLine[] {
  const byId = new Map((catalog?.items ?? []).map((item) => [item.id, item]));
  const parsed: ParsedLine[] = lines.map((line) => {
    const item = byId.get(line.itemId) ?? null;
    const errors: ParsedLine['errors'] = {};
    const unit = item ? (unitsOf(item).find((option) => option.unitId === line.unitId) ?? null) : null;
    const label = unit?.label ?? '';
    if (catalog && !item) errors.item = t('invoice.line.gone', 'لم تعد «{name}» تُباع من «{store}»؛ احذفها من الفاتورة.', { name: line.name, store: storeName });
    else if (item && !unit) errors.unit = t('invoice.line.unit', 'اختر الوحدة.');
    const qty = line.qty.trim() ? parseQty(line.qty) : null;
    let base: Milli | null = null;
    if (qty === null || qty <= 0n) errors.qty = t('invoice.line.qty', 'اكتب الكمية رقماً أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.');
    else if (unit) {
      base = baseQtyOf(qty, unit.factor);
      if (item?.baseUnit === 'pc' && base % MILLI_PER_UNIT !== 0n) errors.qty = t('purchase.qty.whole', 'القطع تُعدّ عدداً صحيحاً.');
    }
    const price = line.price.trim() ? parseMoneyText(line.price, false) : null;
    if (price === null || price < 0n) errors.price = t('invoice.line.price', 'اكتب السعر لكل {unit} بالدينار (صفر للتسليم بلا مقابل).', { unit: label });
    const discount = line.discount.trim() ? parseMoneyText(line.discount, true) : 0n;
    if (discount === null || discount < 0n) errors.discount = t('invoice.line.discount', 'الخصم بالدينار الصحيح من صفر فأكثر.');
    return { line, item, unit, qty: errors.qty ? null : qty, price: errors.price ? null : price, discount: errors.discount ? null : discount, base: errors.qty ? null : base, errors };
  });
  // المتاح لكلّ مادّة بعد جمع سطورها.
  const used = new Map<string, Milli>();
  for (const row of parsed) if (row.base !== null) used.set(row.line.itemId, (used.get(row.line.itemId) ?? 0n) + row.base);
  for (const row of parsed) {
    if (!row.item || row.base === null || row.errors.qty) continue;
    if ((used.get(row.item.id) ?? 0n) > row.item.available) {
      row.errors.qty = t('invoice.line.over', 'المتاح في «{store}» {qty} فقط؛ لا يُحفظ أكثر منه.', { store: storeName, qty: baseQty(row.item.available, row.item.baseUnit) });
    }
  }
  return parsed;
}

/** الطلب المرسَل إلى خانات النموذج (بعد رفض أكيد لطلب استُعيد من التخزين): ما أُرسل يعود كما كُتب، والدفع بشكله. */
export function draftOf(pending: PendingSale, day: string): Draft {
  const { request, summary } = pending;
  const walkIn = request.partyId === null;
  const [only] = request.payments;
  const cash = walkIn && request.payments.length === 1 && only !== undefined && only.amount === summary.total;
  return {
    warehouseId: request.warehouseId,
    lines: request.lines.map((line, index) => ({
      lineId: line.lineId,
      itemId: line.itemId,
      name: summary.lines[index]?.name ?? '',
      unitId: line.unitId,
      qty: qtyText(line.qty),
      price: inputMoney(line.unitPrice),
      suggestedFrom: null,
      discount: line.discount > 0n ? inputMoney(line.discount) : '',
    })),
    invoiceDiscount: request.invoiceDiscount > 0n ? inputMoney(request.invoiceDiscount) : '',
    mode: walkIn ? 'walk_in' : 'party',
    party: walkIn ? null : { id: request.partyId ?? '', name: summary.partyName ?? '' },
    pay: request.payments.length === 0 ? 'debt' : cash ? 'cash' : 'part',
    cashLegId: cash && only ? only.legId : crypto.randomUUID(),
    cashBox: cash && only ? only.cashAccountId : '',
    legs: cash ? [] : request.payments.map((leg) => ({ legId: leg.legId, boxId: leg.cashAccountId, amount: inputMoney(leg.amount) })),
    note: request.note ?? '',
    day,
  };
}

// ─── الفاتورة المفتوحة على الجهاز ─────────────────────────────────────────────────────────────────────────────────

export interface Ids {
  ref: string;
  saleId: string;
}

/** ما يُحفظ: الفاتورة كما كُتبت ومعرّفاها (فإعادة فاتورة انقطع جوابها مع إغلاق الصفحة تُرسل بالمرجع نفسه فلا تُسجَّل مرّتين). */
export function draftBody(draft: Draft, ids: Ids): unknown {
  return { draft: { ...draft, lines: draft.lines.map((line) => ({ ...line, suggestedFrom: line.suggestedFrom === null ? null : String(line.suggestedFrom) })) }, ids };
}

const str = (value: unknown): value is string => typeof value === 'string';
const rec = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** الفاتورة المحفوظة بشكلها، أو null (تخزين تالف أو من نسخة أخرى: لا تُستعاد ولا ترمي). */
export function restoreBody(body: unknown): { draft: Draft; ids: Ids } | null {
  if (!rec(body) || !rec(body.draft) || !rec(body.ids) || !str(body.ids.ref) || !str(body.ids.saleId) || body.ids.ref === '' || body.ids.saleId === '') return null;
  const d = body.draft;
  const lines = Array.isArray(d.lines) ? d.lines : null;
  const legs = Array.isArray(d.legs) ? d.legs : null;
  if (!lines || !legs || lines.length > MAX_LINES || legs.length > MAX_LEGS) return null;
  const okLine = (line: unknown): line is Record<string, unknown> =>
    rec(line) &&
    ['lineId', 'itemId', 'name', 'qty', 'price', 'discount'].every((field) => str(line[field])) &&
    (line.unitId === null || str(line.unitId)) &&
    (line.suggestedFrom === null || (str(line.suggestedFrom) && /^-?\d{1,18}$/u.test(line.suggestedFrom)));
  const okLeg = (leg: unknown): leg is Record<string, unknown> => rec(leg) && str(leg.legId) && str(leg.boxId) && str(leg.amount);
  const party = d.party === null ? null : rec(d.party) && str(d.party.id) && str(d.party.name) ? { id: d.party.id, name: d.party.name } : undefined;
  if (
    !lines.every(okLine) ||
    !legs.every(okLeg) ||
    party === undefined ||
    !str(d.warehouseId) ||
    !str(d.invoiceDiscount) ||
    (d.mode !== 'party' && d.mode !== 'walk_in') ||
    !(d.pay === 'auto' || d.pay === 'cash' || d.pay === 'debt' || d.pay === 'part') ||
    !str(d.cashLegId) ||
    d.cashLegId === '' ||
    !str(d.cashBox) ||
    !str(d.note) ||
    !(d.day === null || str(d.day))
  ) {
    return null;
  }
  return {
    draft: {
      warehouseId: d.warehouseId,
      lines: lines.map((line) => ({
        lineId: line.lineId as string,
        itemId: line.itemId as string,
        name: line.name as string,
        unitId: line.unitId as string | null,
        qty: line.qty as string,
        price: line.price as string,
        suggestedFrom: line.suggestedFrom === null ? null : BigInt(line.suggestedFrom as string),
        discount: line.discount as string,
      })),
      invoiceDiscount: d.invoiceDiscount,
      mode: d.mode,
      party,
      pay: d.pay,
      cashLegId: d.cashLegId,
      cashBox: d.cashBox,
      legs: legs.map((leg) => ({ legId: leg.legId as string, boxId: leg.boxId as string, amount: leg.amount as string })),
      note: d.note,
      day: d.day as string | null,
    },
    ids: { ref: body.ids.ref, saleId: body.ids.saleId },
  };
}

/** عدد الموادّ في الفاتورة (المادّة بسطرين واحدة). */
export const itemCount = (lines: readonly Pick<CartLine, 'itemId'>[]): number => new Set(lines.map((line) => line.itemId)).size;
