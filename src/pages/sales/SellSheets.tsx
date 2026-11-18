import { Banknote, ChevronDown, Coins, NotebookPen, Store, UserRound } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { parseMoneyText } from '../../components/ui/MoneyInput';
import { addDays, type Day } from '../../domain/dates';
import { FILS_PER_DINAR, type Fils, type Milli } from '../../domain/money';
import type { InvoiceMath } from '../../domain/saleInvoice';
import { describeError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as purchasing from '../../lib/repo/purchasing';
import type { BoxPick, PartyPick } from '../../lib/repo/purchasing';
import type { CatalogUnit, CatalogBox } from '../../lib/repo/sales';
import { sound } from '../../lib/sound';
import { useLoad } from '../../lib/useLoad';
import { baseQty } from '../inventory/simple-shared';
import { dinars, inputMoney, linesText, moneyText, unitQtyText } from './saleParts';
import { applyPadKey, Keypad, Sheet, shortUnit, typedText, type PadKey } from './sellKit';
import { itemCount, MAX_LEGS, NOTE_MAX, type Draft, type Leg, type ParsedLine, type PayKind } from './sellModel';

// أوراق شاشة البيع (تصميم المبيعات §٢–٤): السلّة بسطورها المضغوطة و«المزيد» (خصم الفاتورة والتاريخ والملاحظة وتفصيل الحساب)، والسطر (الوحدة شرائح،
// والكمية والسعر والخصم بلوحة أرقام التطبيق وقراءة راجعة تحت القيمة، والخطأ تحت الحقل نفسه)، والدفع («لمن؟» ثمّ ثلاث بطاقات، والسيقان بصناديقها،
// والنتيجة جملةً، وحاسبة الباقي للنقد لا تُسجَّل، والحفظ بزرّ يسمّي النتيجة وملخّص المنع فوقه)، والمخازن، والكاميرا. كلّها تأخذ حالتها من الشاشة.

export type LineTab = 'qty' | 'price' | 'discount';
export type PadTarget = { kind: 'discount' } | { kind: 'leg'; legId: string } | { kind: 'received' };
export type Where =
  | { kind: 'store' }
  | { kind: 'cart' }
  | { kind: 'more' }
  | { kind: 'line'; lineId: string; tab: LineTab }
  | { kind: 'discount' }
  | { kind: 'party' }
  | { kind: 'legs' };
export interface Problem {
  text: string;
  where: Where;
}

type Shown = Partial<Record<'store' | 'lines' | 'discount' | 'party' | 'legs' | 'walk_in' | 'note' | 'day', string>>;

/** المبلغ بالدينار من نصّ الخانة (صفر حين فارغ أو غير مقروء). */
const amountOf = (text: string): Fils => (text.trim() ? (parseMoneyText(text, true) ?? 0n) : 0n);

/** يمرّر عنصراً إلى وسط ورقته إن أمكن (المتصفّح؛ وفي الفحوص قد لا يوجد). */
function reveal(node: Element | null): void {
  if (node && typeof (node as HTMLElement).scrollIntoView === 'function') (node as HTMLElement).scrollIntoView({ block: 'center' });
}

// ─── تفصيل الحساب ──────────────────────────────────────────────────────────────────────────────────────────────────

/** سطر في ملخّص الفاتورة (جدول المعاينة). */
export interface PreviewRow {
  key: string;
  name: string;
  qty: Milli;
  unit: string;
  price: Fils;
  gross: Fils;
  lineDiscount: Fils;
  share: Fils;
  net: Fils;
}

function PreviewTable({ rows, totals }: { rows: readonly PreviewRow[]; totals: { gross: Fils; lineDiscounts: Fils; shares: Fils; total: Fils } }) {
  const qtyDecimals = columnDecimals(rows.map((row) => row.qty), 3) as 0 | 1 | 2 | 3;
  const priceDecimals = rows.some((row) => row.price % FILS_PER_DINAR !== 0n) ? 2 : 0;
  const money0 = (amount: Fils) => <Num>{fmtMoney(amount, 0)}</Num>;
  const columns: Column<PreviewRow>[] = [
    { key: 'item', header: t('sales.col.item', 'المادّة'), wrap: true, cell: (row) => row.name },
    { key: 'qty', header: t('sales.col.qty', 'الكمية'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.qty, qtyDecimals)}</Num> },
    { key: 'unit', header: t('sales.col.unit', 'الوحدة'), cell: (row) => row.unit },
    { key: 'price', header: t('sales.col.price', 'السعر'), kind: 'number', cell: (row) => <Num>{fmtMoney(row.price, priceDecimals)}</Num> },
    { key: 'gross', header: t('invoice.col.gross', 'الإجمالي'), kind: 'number', cell: (row) => money0(row.gross), total: money0(totals.gross) },
    { key: 'line_discount', header: t('invoice.col.line_discount', 'خصم السطر'), kind: 'number', cell: (row) => money0(row.lineDiscount), total: money0(totals.lineDiscounts) },
    { key: 'share', header: t('invoice.col.share', 'من خصم الفاتورة'), kind: 'number', cell: (row) => money0(row.share), total: money0(totals.shares) },
    { key: 'net', header: t('invoice.col.net', 'الصافي'), kind: 'number', cell: (row) => money0(row.net), total: money0(totals.total) },
  ];
  return <DataTable caption={t('invoice.preview.caption', 'ملخّص الفاتورة قبل الحفظ')} columns={columns} rows={rows} rowKey={(row) => row.key} empty="" totalLabel={t('sales.report.total', 'المجموع')} />;
}

// ─── عدّاد السطر ───────────────────────────────────────────────────────────────────────────────────────────────────

function Stepper({ name, qty, onStep, onOpen, small = false }: { name: string; qty: string; onStep: (delta: 1 | -1) => void; onOpen?: () => void; small?: boolean }) {
  return (
    <div className="sl-stepper" data-size={small ? 'sm' : undefined} data-action="line-stepper">
      <button type="button" className="sl-step" aria-label={t('sell.step.minus', 'أنقص واحداً من «{name}»', { name })} onClick={() => onStep(-1)} data-action="cart-minus">
        <span aria-hidden="true">−</span>
      </button>
      {onOpen ? (
        <button type="button" className="sl-step-qty" onClick={onOpen} data-action="cart-qty">
          {qty}
        </button>
      ) : (
        <span className="sl-step-qty" data-action="cart-qty">
          {qty}
        </span>
      )}
      <button type="button" className="sl-step" aria-label={t('sell.step.plus', 'زِد واحداً من «{name}»', { name })} onClick={() => onStep(1)} data-action="cart-plus">
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

// ─── السلّة ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CartSheetProps {
  level: number;
  rows: readonly ParsedLine[];
  /** أخطاء كلّ سطر كما تُرى الآن (ما كُتب خطأً فوراً، والفارغ بعد «احفظ»). */
  errors: readonly ParsedLine['errors'][];
  /** «عندك … فقط» لسطر بلغ المتاح («+» لا يزيده، المراجعة الثانية R7)، أو null. */
  limits: readonly (string | null)[];
  math: InvoiceMath;
  storeName: string;
  draft: Draft;
  today: Day;
  shown: Shown;
  moreOpen: boolean;
  previewRows: readonly PreviewRow[];
  onClose: () => void;
  onOpenLine: (lineId: string) => void;
  onStep: (lineId: string, delta: 1 | -1) => void;
  onRemove: (lineId: string) => void;
  onSet: (patch: Partial<Draft>) => void;
  onNext: () => void;
}

/** الأيّام التي يُقبل فيها البيع: اليوم وسبعة قبله (القرار 9). */
const postingDays = (today: Day): Day[] => [0, 1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, -n));

export function CartSheet({ level, rows, errors: rowErrors, limits, math, storeName, draft, today, shown, moreOpen, previewRows, onClose, onOpenLine, onStep, onRemove, onSet, onNext }: CartSheetProps) {
  const id = useId();
  const items = itemCount(draft.lines);
  const discount = draft.invoiceDiscount.trim() ? parseMoneyText(draft.invoiceDiscount, true) : null;
  const dayText = draft.day ?? fmtDay(today);
  return (
    <Sheet
      title={t('sell.cart.title', 'الفاتورة')}
      subtitle={t('sell.cart.sub', '{items} من «{store}»', { items: linesText(items), store: storeName })}
      level={level}
      onClose={onClose}
      size="tall"
      action="sale-cart"
      footer={
        <div className="sl-foot-row">
          <div className="sl-foot-total">
            <span className="sl-muted">{t('sell.due', 'المطلوب')}</span>
            <strong className="sl-num" data-action="cart-total">
              {math.nets === null ? t('file.none', '—') : dinars(math.total)}
            </strong>
          </div>
          <button type="button" className="sl-primary" disabled={rows.length === 0} onClick={onNext} data-action="sale-next">
            {t('sell.next', 'التالي: الدفع')}
          </button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="sl-empty" data-action="sale-cart-empty">
          {t('invoice.cart.empty', 'الفاتورة فارغة: اضغط مادّة أو امسح باركودها.')}
        </p>
      ) : (
        <ul className="sl-lines" data-action="sale-cart">
          {rows.map((row, index) => {
            const { line, item, unit } = row;
            const name = item?.name ?? line.name;
            const gross = math.gross[index] ?? 0n;
            const errors = rowErrors[index] ?? {};
            const problem = errors.item ?? errors.unit ?? errors.qty ?? errors.price ?? errors.discount;
            const net = gross - (row.discount ?? 0n);
            return (
              <li key={line.lineId} className="sl-line" data-action="cart-line" data-item={line.itemId} data-wrong={problem ? 'yes' : undefined}>
                <button type="button" className="sl-line-main" onClick={() => onOpenLine(line.lineId)} data-action="cart-line-open">
                  <span className="sl-line-name">{name}</span>
                  {/* الوحدة كاملةً هنا (لا شريحة مقصوصة بجانب العدّاد، D11). */}
                  <span className="sl-line-sub sl-num" data-action="cart-unit">
                    {!unit
                      ? t('invoice.line.unit_pick', 'اختر الوحدة')
                      : row.price !== null
                        ? t('sell.line.each', '{price} لكل {unit}', { price: moneyText(row.price), unit: unit.label })
                        : t('sell.line.unit_only', 'بالـ{unit}، بلا سعر بعد', { unit: unit.label })}
                  </span>
                </button>
                {/* مبلغ السطر لا يكون سالباً: خصم أكبر من السطر «—» وخطؤه تحته (S6). */}
                <span className="sl-line-amount sl-num" data-action="cart-line-total">
                  {row.qty !== null && row.price !== null && net >= 0n ? moneyText(net) : t('file.none', '—')}
                </span>
                <div className="sl-line-actions">
                  {item ? <Stepper small name={name} qty={row.qty !== null ? unitQtyText(row.qty, shortUnit(unit?.label ?? '')) : line.qty} onStep={(delta) => onStep(line.lineId, delta)} onOpen={() => onOpenLine(line.lineId)} /> : null}
                  <button type="button" className="sl-text-btn sl-push" data-tone="danger" onClick={() => onRemove(line.lineId)} data-action="cart-remove">
                    {t('sell.remove', 'احذف')}
                  </button>
                </div>
                {problem ? (
                  <p role="alert" className="sl-line-error" data-action="cart-line-error">
                    {problem}
                  </p>
                ) : limits[index] ? (
                  <p className="sl-line-note" data-action="cart-line-limit">
                    {limits[index]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <details className="sl-more" open={moreOpen || Boolean(shown.day || shown.note || shown.discount) || undefined} data-action="sale-more">
        <summary className="sl-more-head">{t('sell.more', 'المزيد: خصم على الفاتورة، والتاريخ، والملاحظة')}</summary>
        <div className="sl-more-body">
          <div className="sl-field">
            <label htmlFor={`${id}-discount`} className="sl-label">
              {t('invoice.discount', 'خصم الفاتورة (دينار)')}
            </label>
            <input
              id={`${id}-discount`}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              className="sl-input sl-num"
              value={draft.invoiceDiscount}
              onChange={(event) => onSet({ invoiceDiscount: event.target.value })}
              aria-invalid={Boolean(shown.discount) || undefined}
              data-action="sale-invoice-discount"
            />
            {shown.discount ? (
              <p role="alert" className="sl-field-error">
                {shown.discount}
              </p>
            ) : discount !== null && discount > 0n ? (
              <p className="sl-hint">{t('money.input.read_back', '= {amount} دينار', { amount: fmtMoney(discount, 0) })}</p>
            ) : (
              <p className="sl-hint">{t('sell.discount.hint', 'خصم يُطرح من مجموع الفاتورة كلّها.')}</p>
            )}
          </div>
          <div className="sl-field">
            <span className="sl-label" id={`${id}-day`}>
              {t('purchase.day', 'التاريخ')}
            </span>
            <div className="sl-chips" role="radiogroup" aria-labelledby={`${id}-day`}>
              {postingDays(today).map((day, n) => (
                <button
                  key={day}
                  type="button"
                  role="radio"
                  aria-checked={dayText === fmtDay(day)}
                  className="sl-chip"
                  onClick={() => {
                    sound.click();
                    onSet({ day: n === 0 ? null : fmtDay(day) });
                  }}
                  data-action="sale-day"
                  data-day={day}
                >
                  {n === 0 ? t('sell.day.today', 'اليوم') : n === 1 ? t('sell.day.yesterday', 'أمس') : fmtDay(day)}
                </button>
              ))}
            </div>
            {shown.day ? (
              <p role="alert" className="sl-field-error">
                {shown.day}
              </p>
            ) : null}
          </div>
          <div className="sl-field">
            <label htmlFor={`${id}-note`} className="sl-label">
              {t('sell.note.printed', 'ملاحظة تظهر على الفاتورة (اختياريّة)')}
            </label>
            <input id={`${id}-note`} className="sl-input" maxLength={NOTE_MAX} value={draft.note} onChange={(event) => onSet({ note: event.target.value })} data-action="sale-note" />
            {shown.note ? (
              <p role="alert" className="sl-field-error">
                {shown.note}
              </p>
            ) : null}
          </div>
        </div>
      </details>
      {rows.length > 0 ? (
        <details className="sl-more" data-action="sale-breakdown">
          <summary className="sl-more-head">{t('sell.breakdown', 'تفصيل الحساب لكلّ سطر')}</summary>
          <div className="sl-more-body">
            <PreviewTable rows={previewRows} totals={{ gross: math.grossTotal, lineDiscounts: math.lineDiscounts, shares: math.shares ? math.shares.reduce((sum, share) => sum + share, 0n) : 0n, total: math.total }} />
          </div>
        </details>
      ) : null}
    </Sheet>
  );
}

// ─── السطر ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LineSheetProps {
  level: number;
  row: ParsedLine;
  gross: Fils;
  units: readonly CatalogUnit[];
  /** «عندك» بوحدة السطر. */
  stock: string | null;
  /** سعر البيع لوحدة السطر من الخادم، أو null. */
  usual: Fils | null;
  /** أخطاء السطر كما تُرى الآن (ما كُتب خطأً يُقال فوراً تحت خانته، D4). */
  errors: ParsedLine['errors'];
  tab: LineTab;
  focusError: boolean;
  canAddAnother: boolean;
  onClose: () => void;
  onUnit: (unitId: string | null) => void;
  onField: (field: LineTab, text: string) => void;
  onUsual: () => void;
  onRemove: () => void;
  onAddAnother: () => void;
  /** رمز كتبه ماسح والورقة مفتوحة: يُمسح لا يُكتب في الخانة (R2). */
  onScan: (code: string) => void;
}

const PAD_DECIMALS: Readonly<Record<LineTab, number>> = { qty: 3, price: 2, discount: 0 };

export function LineSheet({ level, row, gross, units, stock, usual, errors, tab: initialTab, focusError, canAddAnother, onClose, onUnit, onField, onUsual, onRemove, onAddAnother, onScan }: LineSheetProps) {
  const [tab, setTab] = useState<LineTab>(initialTab);
  const [fresh, setFresh] = useState(true);
  const displayRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const { line, item, unit } = row;
  const name = item?.name ?? line.name;
  const unitLabel = unit?.label ?? '';
  const value = tab === 'qty' ? line.qty : tab === 'price' ? line.price : line.discount;
  const error = tab === 'qty' ? errors.qty : tab === 'price' ? errors.price : errors.discount;
  // فُتحت لخطأ (بعد «احفظ»): يُمرَّر إليه ويُركَّز الحقل نفسه (مراجعة 0033 C4).
  useEffect(() => {
    if (!focusError) return;
    reveal(errorRef.current);
    displayRef.current?.focus({ preventScroll: true });
  }, [focusError]);
  const press = (keys: readonly PadKey[]) => {
    const text = keys.reduce((typed, key, index) => applyPadKey(typed, key, PAD_DECIMALS[tab], fresh && index === 0, tab === 'qty' ? 7 : 9), value);
    onField(tab, text);
    setFresh(false);
  };
  const tabs: { key: LineTab; label: string; wrong: boolean }[] = [
    { key: 'qty', label: t('sell.tab.qty', 'الكمية'), wrong: Boolean(errors.qty) },
    { key: 'price', label: t('sell.tab.price', 'السعر'), wrong: Boolean(errors.price) },
    { key: 'discount', label: t('sell.tab.discount', 'الخصم'), wrong: Boolean(errors.discount) },
  ];
  const unitGone = item !== null && unit === null;
  // تحت القيمة اسم قصير لا يلتفّ ثلاثة أسطر في 125٪ (D5): «/ كيس» للسعر، والقراءة الراجعة تقول الباقي.
  const shownUnit = tab === 'qty' ? shortUnit(unitLabel) : tab === 'price' ? t('sell.price.per_short', '/ {unit}', { unit: shortUnit(unitLabel) }) : t('sales.dinar_word', 'دينار');
  const readBack =
    tab === 'qty'
      ? row.base !== null && unit && unit.unitId !== null && item
        ? t('purchase.qty.read_back', '= {qty}', { qty: baseQty(row.base, item.baseUnit) })
        : null
      : tab === 'price'
        ? row.price !== null
          ? t('sell.price.read_back', '= {price} لكل {unit}', { price: dinars(row.price), unit: unitLabel })
          : null
        : t('sell.discount.of', 'من إجماليّ السطر {gross}', { gross: dinars(gross) });
  const net = gross - (row.discount ?? 0n);
  // لا مبلغ سالب (S6): خصم أكبر من السطر يُقال تحت خانته، والمبلغ «—».
  const amount =
    row.qty !== null && row.price !== null
      ? (row.discount ?? 0n) > 0n
        ? t('invoice.line.total_discount', 'الإجمالي {gross} − الخصم {discount} = {net}', { gross: dinars(gross), discount: dinars(row.discount ?? 0n), net: net >= 0n ? dinars(net) : t('file.none', '—') })
        : t('sell.line.amount', 'المبلغ {gross}', { gross: dinars(gross) })
      : t('invoice.line.total_empty', 'الإجمالي: اكتب الكمية والسعر');
  return (
    <Sheet
      title={name}
      subtitle={
        <>
          {stock ? <span>{t('sell.card.stock', 'عندك {qty}', { qty: stock })}</span> : null}
          <span className="sl-line-total sl-num" data-action="line-total">
            {amount}
          </span>
        </>
      }
      aside={
        <button type="button" className="sl-text-btn" data-tone="danger" onClick={onRemove} data-action="line-remove">
          {t('sell.line.remove_short', 'احذف')}
        </button>
      }
      level={level}
      onClose={onClose}
      action="sale-line"
      footer={
        <>
          <Keypad decimals={PAD_DECIMALS[tab]} money={tab === 'discount'} onKeys={press} onEnter={onClose} onScan={onScan} label={tabs.find((entry) => entry.key === tab)?.label ?? ''} />
          <div className="sl-foot-row">
            {canAddAnother ? (
              <button type="button" className="sl-secondary" onClick={onAddAnother} data-action="line-add-another">
                {t('sell.line.another', 'أضف سطراً آخر لها')}
              </button>
            ) : null}
            <button type="button" className="sl-primary" onClick={onClose} data-action="line-done">
              {t('sell.done', 'تم')}
            </button>
          </div>
        </>
      }
    >
      {errors.item ? (
        <p role="alert" className="sl-field-error" data-action="line-item-error">
          {errors.item}
        </p>
      ) : null}
      {units.length > 1 || unitGone ? (
        <div className="sl-chips sl-wrap" role="radiogroup" aria-label={t('invoice.line.unit_label', 'الوحدة')}>
          {units.map((option) => (
            <button
              key={option.unitId ?? ''}
              type="button"
              role="radio"
              aria-checked={line.unitId === option.unitId && !unitGone}
              className="sl-chip"
              onClick={() => {
                sound.click();
                onUnit(option.unitId);
                setFresh(true);
              }}
              data-action="line-unit"
              data-unit={option.unitId ?? ''}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {errors.unit ? (
        <p role="alert" className="sl-field-error" data-action="line-unit-error">
          {errors.unit}
        </p>
      ) : null}
      <div className="sl-tabs" role="tablist" aria-label={t('sell.line.fields', 'ما تكتبه')}>
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            className="sl-tab"
            onClick={() => {
              sound.click();
              setTab(entry.key);
              setFresh(true);
            }}
            data-action="line-tab"
            data-tab={entry.key}
          >
            {entry.label}
            {entry.wrong && tab !== entry.key ? <span className="sl-dot" role="img" aria-label={t('sell.tab.wrong', 'فيه خطأ')} /> : null}
          </button>
        ))}
      </div>
      {/* «أعِده» فوق القيمة لا تحت القراءة الراجعة: هناك تغطّيه لوحة الأرقام في 125٪ (D5). */}
      {tab === 'price' && usual !== null && row.price !== usual ? (
        <button type="button" className="sl-text-btn sl-usual" onClick={onUsual} data-action="line-usual">
          {t('sell.price.usual_short', 'المعتاد {price} — أعِده', { price: moneyText(usual) })}
        </button>
      ) : null}
      <div ref={displayRef} tabIndex={-1} className="sl-display" data-fresh={fresh ? 'yes' : undefined} data-wrong={error ? 'yes' : undefined} aria-live="polite" data-action="line-display">
        <span className="sl-display-value" dir="ltr" data-action="line-value">
          {value === '' ? t('file.none', '—') : typedText(value)}
        </span>
        <span className="sl-display-unit">{shownUnit}</span>
        {value !== '' ? (
          <button
            type="button"
            className="sl-clear"
            aria-label={t('sell.pad.clear', 'امسح القيمة')}
            onClick={() => {
              sound.click();
              onField(tab, '');
              setFresh(false);
            }}
            data-action="pad-clear"
          >
            {t('sell.pad.clear_short', 'مسح')}
          </button>
        ) : null}
      </div>
      {error ? (
        <p ref={errorRef} role="alert" className="sl-field-error" data-action="line-error">
          {error}
        </p>
      ) : readBack ? (
        <p className="sl-hint" data-action="line-read-back">
          {readBack}
        </p>
      ) : null}
    </Sheet>
  );
}

// ─── الدفع ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PaySheetProps {
  level: number;
  math: InvoiceMath;
  draft: Draft;
  walkIn: boolean;
  payKind: PayKind;
  legs: readonly { leg: Leg; amount: Fils | null; auto: boolean }[];
  legErrors: readonly (string | null)[];
  boxes: readonly (BoxPick | CatalogBox)[] | null;
  boxesFailed: unknown;
  onBoxesRetry: () => void;
  cashBox: string;
  paid: Fils;
  debt: Fils;
  shown: Shown;
  tried: boolean;
  recent: readonly PartyPick[];
  canCreateParty: boolean;
  /** ما كُتب في بحث «لمن؟» (في الشاشة: اسم كُتب ولم يُختر يمنع الحفظ، D1). */
  partyText: string;
  onPartyText: (text: string) => void;
  padTarget: PadTarget | null;
  padFresh: boolean;
  focusRequest: { round: number; where: Where } | null;
  busy: boolean;
  online: boolean;
  saveText: string;
  blockedText: string | null;
  /** اسم «صحّح» بما سيفتحه، أو null حين لا شيء يُصحَّح (ملاحظة لا منع، S13). */
  fixLabel: string | null;
  failure: string | null;
  lines: number;
  onClose: () => void;
  onSet: (patch: Partial<Draft>) => void;
  onPay: (kind: PayKind) => void;
  onAddLeg: () => void;
  onRemoveLeg: (legId: string) => void;
  onPad: (target: PadTarget | null, fresh: boolean) => void;
  onFix: () => void;
  onSave: () => void;
  /** رمز كتبه ماسح ولوحة الدفع مفتوحة (R2). */
  onScan: (code: string) => void;
}

/** مبالغ سريعة لساق «جزء الآن» باسمها (D13): الباقي كلّه (أو المطلوب كلّه في أوّل صندوق)، ونصفه، ومبلغ مدوّر تحته. */
function partQuick(rest: Fils, total: Fils): { amount: Fils; label: string }[] {
  if (rest <= 0n) return [];
  const dinar = FILS_PER_DINAR;
  const half = ((rest / 2n) / (1000n * dinar)) * 1000n * dinar;
  const round = [1_000_000n, 500_000n, 250_000n, 100_000n, 50_000n, 25_000n, 10_000n, 5_000n].map((n) => n * dinar).find((n) => n < rest && n !== half);
  return [
    { amount: rest, label: rest === total ? t('sell.quick.all', 'المطلوب كلّه {amount}', { amount: moneyText(rest) }) : t('sell.quick.rest', 'الباقي كلّه {amount}', { amount: moneyText(rest) }) },
    ...(half > 0n && half !== rest ? [{ amount: half, label: t('sell.quick.half', 'النصف {amount}', { amount: moneyText(half) }) }] : []),
    ...(round !== undefined ? [{ amount: round, label: moneyText(round) }] : []),
  ];
}

/** أوراق نقد سريعة لحاسبة ما يُرجَع: المطلوب نفسه، ثمّ تقريبه لأعلى بمبالغ مدوّرة. */
function cashQuick(total: Fils): { amount: Fils; label: string }[] {
  if (total <= 0n) return [];
  const steps = [5_000n, 10_000n, 25_000n, 50_000n].map((n) => n * FILS_PER_DINAR);
  const ups = steps.map((step) => ((total + step - 1n) / step) * step).filter((amount) => amount > total);
  return [...new Set([total, ...ups])].slice(0, 4).map((amount) => ({ amount, label: moneyText(amount) }));
}

function CustomerSection({
  draft,
  walkIn,
  recent,
  canCreateParty,
  shown,
  searchRef,
  search,
  setSearch,
  busy,
  onSet,
  onTyping,
}: {
  busy: boolean;
  draft: Draft;
  walkIn: boolean;
  recent: readonly PartyPick[];
  canCreateParty: boolean;
  shown: Shown;
  searchRef: RefObject<HTMLInputElement>;
  search: string;
  setSearch: (text: string) => void;
  onSet: (patch: Partial<Draft>) => void;
  /** الكتابة بلوحة النظام هنا أو اختيار زبون: لوحة التطبيق تُطوى فلا تقوم لوحتان ولا تبقى فوق ما لا تكتبه. */
  onTyping: () => void;
}) {
  const id = useId();
  const deferred = useDeferredValue(search.trim());
  const load = useCallback(() => (deferred ? purchasing.searchSuppliers(deferred) : Promise.resolve(null)), [deferred]);
  const found = useLoad(load, deferred);
  const [twins, setTwins] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const party = draft.party;
  const pick = (chosen: PartyPick) => {
    if (busy) return;
    sound.click();
    onTyping();
    onSet({ mode: 'party', party: chosen });
    setSearch('');
    setTwins(null);
  };
  const create = () => {
    const name = search.trim();
    if (!name || busy) return;
    setCreating(true);
    setFailure(null);
    (twins === null ? purchasing.supplierTwins(name) : Promise.resolve([]))
      .then((seen) => {
        if (seen.length > 0) {
          setTwins(seen);
          return undefined;
        }
        return purchasing.createCustomer(name).then(pick);
      })
      .catch(setFailure)
      .finally(() => setCreating(false));
  };
  const chips = party && !recent.some((entry) => entry.id === party.id) ? [party, ...recent] : recent;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <section className="sl-section" data-action="sale-customer" data-field="party">
      <h3 className="sl-h3" id={`${id}-who`}>
        {t('sell.who', 'لمن؟')}
      </h3>
      <div className="sl-chips sl-wrap" role="radiogroup" aria-labelledby={`${id}-who`}>
        <button
          type="button"
          role="radio"
          aria-checked={walkIn}
          className="sl-chip"
          disabled={busy}
          onClick={() => {
            sound.click();
            onTyping();
            // «زبون نقديّ» بلا اسم: ما كُتب في البحث يُمحى معه.
            setSearch('');
            onSet({ mode: 'walk_in', party: null, pay: draft.pay === 'debt' ? 'auto' : draft.pay });
          }}
          data-action="party-walk-in"
        >
          {t('invoice.walk_in', 'زبون نقديّ')}
        </button>
        {chips.map((entry) => (
          <button key={entry.id} type="button" role="radio" aria-checked={!walkIn && party?.id === entry.id} className="sl-chip" disabled={busy} onClick={() => pick(entry)} data-action="party-recent" data-party={entry.id}>
            <UserRound aria-hidden="true" className="sl-icon-sm" />
            {entry.name}
          </button>
        ))}
      </div>
      <div className="sl-search sl-search-sm">
        <input
          ref={searchRef}
          id={`${id}-party`}
          type="search"
          className="sl-search-input"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={t('sell.who.search', 'ابحث عن زبون بالاسم')}
          aria-label={t('sell.who.search', 'ابحث عن زبون بالاسم')}
          value={search}
          readOnly={busy}
          onFocus={onTyping}
          onChange={(event) => {
            if (busy) return;
            setSearch(event.target.value);
            setTwins(null);
          }}
          data-action="sale-party-search"
        />
      </div>
      {search.trim() ? (
        <div className="sl-results">
          {found.error ? (
            <LoadFailed what={t('sell.party.list', 'قائمة الزبائن')} error={found.error} onRetry={found.retry} />
          ) : (
            <ul className="sl-result-list">
              {(found.data?.parties ?? []).map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="sl-option" disabled={busy} onClick={() => pick(entry)} data-action="pick-party">
                    <UserRound aria-hidden="true" className="sl-icon-sm" />
                    {entry.name}
                  </button>
                </li>
              ))}
              {found.data && found.data.parties.length === 0 ? <li className="sl-muted sl-pad-x">{t('sell.party.none', 'لا زبون بهذا الاسم.')}</li> : null}
            </ul>
          )}
          {twins && twins.length > 0 ? (
            <p className="sl-note" role="alert">
              {t('sell.party.twins', 'يشبه اسماً موجوداً: {names}. اختره من القائمة، أو اضغط «زبون جديد» مرّة أخرى إن كان زبوناً آخر.', { names: twins.join(t('list.separator', '، ')) })}
            </p>
          ) : null}
          {failed ? (
            <p className="sl-field-error" role="alert">
              {failed.title} {failed.detail}
            </p>
          ) : null}
          {canCreateParty ? (
            <button type="button" className="sl-secondary sl-wide" disabled={creating || busy} aria-busy={creating || undefined} onClick={create} data-action="create-party">
              {t('sell.party.create', 'زبون جديد: أضف «{name}»', { name: search.trim() })}
            </button>
          ) : (
            <p className="sl-muted" data-action="party-create-hint">
              {t('sell.party.create_hint', 'الزبون الجديد يضيفه أمين المخزن أو المحاسب أو المدير؛ اختر زبوناً من القائمة.')}
            </p>
          )}
        </div>
      ) : null}
      {!walkIn && !party && !search.trim() ? (
        <div className={shown.party ? 'sl-note-row' : 'sl-note sl-note-row'}>
          {shown.party ? null : <span data-action="sale-party-needed">{t('sell.party.needed', 'الدين يحتاج اسم الزبون: اختره أو ابحث عنه أو أضفه.')}</span>}
          {/* «زبون جديد» ظاهر لا بعد الكتابة وحدها (D17): يركّز البحث ليُكتب الاسم ثمّ يُضاف. */}
          {canCreateParty ? (
            <button
              type="button"
              className="sl-text-btn"
              disabled={busy}
              onClick={() => {
                sound.click();
                searchRef.current?.focus();
              }}
              data-action="party-new"
            >
              {t('sell.party.new', '+ زبون جديد')}
            </button>
          ) : null}
        </div>
      ) : null}
      {shown.party ? (
        <p role="alert" className="sl-field-error" data-action="sale-party-error">
          {shown.party}
        </p>
      ) : null}
    </section>
  );
}

/** شريحة الصندوق بمختاره، وتفتح شرائح الصناديق تحتها. */
function BoxChoice({ boxes, value, open, onToggle, onPick, action }: { boxes: readonly (BoxPick | CatalogBox)[]; value: string; open: boolean; onToggle: () => void; onPick: (id: string) => void; action: string }) {
  const name = boxes.find((box) => box.id === value)?.name ?? null;
  if (boxes.length <= 1) {
    return <span className="sl-box-name">{name ? t('sell.box.in', 'في «{box}»', { box: name }) : t('cash.pick.empty', 'لا صندوق فعّالاً بعد؛ أضفه من صفحة الصناديق.')}</span>;
  }
  return (
    <>
      <button type="button" className="sl-chip" aria-expanded={open} onClick={onToggle} data-action={action}>
        {name ? t('sell.box.in', 'في «{box}»', { box: name }) : t('cash.pick.none', 'اختر الصندوق')}
        <ChevronDown aria-hidden="true" className="sl-icon-sm" />
      </button>
      {open ? (
        <div className="sl-chips sl-wrap sl-box-list" role="radiogroup" aria-label={t('invoice.pay.box', 'الصندوق')}>
          {boxes.map((box) => (
            <button
              key={box.id}
              type="button"
              role="radio"
              aria-checked={box.id === value}
              className="sl-chip"
              onClick={() => {
                sound.click();
                onPick(box.id);
              }}
              data-action="pay-box-option"
              data-box={box.id}
            >
              {box.name}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function PaySheet(props: PaySheetProps) {
  const { level, math, draft, walkIn, payKind, legErrors, boxes, boxesFailed, onBoxesRetry, cashBox, paid, debt, shown, recent, canCreateParty, partyText, onPartyText, padTarget, padFresh, focusRequest } = props;
  const { busy, online, saveText, blockedText, fixLabel, failure, lines, onClose, onSet, onPay, onAddLeg, onRemoveLeg, onPad, onFix, onSave, onScan } = props;
  const searchRef = useRef<HTMLInputElement>(null);
  const legsRef = useRef<HTMLDivElement>(null);
  const dueRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef<HTMLDivElement>(null);
  const [received, setReceived] = useState('');
  const [boxOpen, setBoxOpen] = useState<string | null>(null);
  const boxList = boxes ?? [];
  const total = math.total;
  const settled = math.nets !== null && total >= 0n;
  const partyName = draft.party?.name ?? null;

  // «احفظ» توقّف على خانة هنا: يُمرَّر إليها وتُركَّز (مراجعة 0033 C4).
  const round = focusRequest?.round ?? 0;
  const where = focusRequest?.where.kind ?? null;
  useEffect(() => {
    if (round === 0) return;
    if (where === 'party') {
      reveal(searchRef.current);
      searchRef.current?.focus({ preventScroll: true });
    } else if (where === 'legs') reveal(legsRef.current);
    else if (where === 'discount') reveal(dueRef.current);
  }, [round, where]);

  // الخانة التي تكتبها لوحة الأرقام تبقى ظاهرة فوقها (اللوحة في ذيل الورقة تأخذ نصف الشاشة).
  const targetKey = padTarget ? (padTarget.kind === 'leg' ? padTarget.legId : padTarget.kind) : null;
  useEffect(() => {
    if (targetKey === null) return;
    const node = targetKey === 'discount' ? dueRef.current : targetKey === 'received' ? changeRef.current : legsRef.current;
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  }, [targetKey]);

  const target = padTarget;
  const targetText = (): string => {
    if (!target) return '';
    if (target.kind === 'discount') return draft.invoiceDiscount;
    if (target.kind === 'received') return received;
    return draft.legs.find((leg) => leg.legId === target.legId)?.amount ?? '';
  };
  const write = (text: string) => {
    if (!target) return;
    if (target.kind === 'discount') onSet({ invoiceDiscount: text });
    else if (target.kind === 'received') setReceived(text);
    else onSet({ legs: draft.legs.map((leg) => (leg.legId === target.legId ? { ...leg, amount: text } : leg)) });
  };
  const press = (keys: readonly PadKey[]) => {
    if (busy) return;
    write(keys.reduce((typed, key, index) => applyPadKey(typed, key, 0, padFresh && index === 0, 9), targetText()));
    if (target) onPad(target, false);
  };
  const quick = (amount: Fils) => {
    if (busy) return;
    sound.click();
    write(inputMoney(amount));
    if (target) onPad(target, true);
  };
  const typedLegs = draft.legs.reduce((sum, leg) => sum + amountOf(leg.amount), 0n);
  const targetLeg = target?.kind === 'leg' ? draft.legs.find((leg) => leg.legId === target.legId) : undefined;
  const restForTarget = targetLeg ? total - (typedLegs - amountOf(targetLeg.amount)) : 0n;
  const quickAmounts = target?.kind === 'leg' ? partQuick(restForTarget, total) : target?.kind === 'received' ? cashQuick(total) : [];
  const padTitle =
    target?.kind === 'discount'
      ? t('sell.pad.discount', 'خصم على الفاتورة')
      : target?.kind === 'received'
        ? t('sell.pad.received', 'ما استلمته من الزبون')
        : targetLeg
          ? t('sell.pad.leg', 'المدفوع في «{box}»', { box: boxList.find((box) => box.id === targetLeg.boxId)?.name ?? t('cash.pick.none', 'اختر الصندوق') })
          : '';
  const receivedAmount = amountOf(received);
  const canAddLeg = target?.kind === 'leg' && draft.legs.length < MAX_LEGS && draft.legs.length < boxList.length;
  const cashBoxName = boxList.find((box) => box.id === cashBox)?.name ?? '';

  // جملة النتيجة بكلمات. «الباقي» للدين المفتوح وحده (D8).
  const result = !settled
    ? t('sell.result.pending', 'الدين يُحسب بعد تصحيح الخصم.')
    : debt < 0n
      ? t('invoice.debt.over', 'المدفوع أكثر من الصافي بـ{over}؛ أنقص المبلغ.', { over: dinars(-debt) })
      : total === 0n
        ? t('sell.result.free', 'تسليم بلا مقابل: لا قبض ولا دين.')
        : debt === 0n
          ? payKind === 'cash' && cashBoxName
            ? t('sell.result.cash', 'مدفوعة كلّها: {total} في «{box}».', { total: dinars(total), box: cashBoxName })
            : t('sell.result.paid', 'مدفوعة كلّها: {total}.', { total: dinars(total) })
          : walkIn
            ? t('sell.result.walk_in_unpaid', 'الزبون النقديّ يدفع المبلغ كلّه؛ {debt} غير مدفوعة لا تُكتب ديناً بلا اسم.', { debt: dinars(debt) })
            : paid === 0n
              ? partyName
                ? t('sell.result.credit', 'يبقى ديناً على «{party}»: {debt}.', { party: partyName, debt: dinars(debt) })
                : t('sell.result.credit_anon', 'يبقى ديناً على الزبون: {debt}.', { debt: dinars(debt) })
              : partyName
                ? t('sell.result.partial', 'المدفوع الآن {paid}، ويبقى ديناً على «{party}»: {debt}.', { paid: dinars(paid), party: partyName, debt: dinars(debt) })
                : t('sell.result.partial_anon', 'المدفوع الآن {paid}، ويبقى ديناً على الزبون: {debt}.', { paid: dinars(paid), debt: dinars(debt) });

  const kinds: { kind: PayKind; title: string; sub: string; icon: ReactNode }[] = [
    { kind: 'cash', title: t('sell.pay.cash', 'نقداً كلّه'), sub: t('sell.pay.cash_sub', 'يُقبض الآن'), icon: <Banknote aria-hidden="true" className="sl-icon" /> },
    {
      kind: 'debt',
      title: t('sell.pay.debt', 'دين كلّه'),
      sub: walkIn ? t('sell.pay.debt_needs', 'يحتاج اسم الزبون') : partyName ? t('sell.pay.debt_on', 'على «{party}»', { party: partyName }) : t('sell.pay.debt_sub', 'على الزبون'),
      icon: <NotebookPen aria-hidden="true" className="sl-icon" />,
    },
    { kind: 'part', title: t('sell.pay.part_now', 'جزء الآن'), sub: t('sell.pay.part_sub', 'والباقي دين'), icon: <Coins aria-hidden="true" className="sl-icon" /> },
  ];

  return (
    <Sheet
      title={t('sell.pay.title', 'الدفع')}
      level={level}
      onClose={onClose}
      locked={busy}
      action="sale-pay"
      footer={
        <div className="sl-pay-foot">
          {target ? (
            <div className="sl-pad-wrap" data-action="pay-pad">
              <div className="sl-pad-head">
                <span className="sl-pad-title">{padTitle}</span>
                <span className="sl-pad-value sl-num" dir="ltr">
                  {typedText(targetText())}
                </span>
                <button type="button" className="sl-text-btn sl-pad-done" onClick={() => onPad(null, true)} data-action="pad-done">
                  {t('sell.done', 'تم')}
                </button>
              </div>
              {/* ما يبقى ديناً يُرى واللوحة تغطّي الورقة (D13). */}
              {target?.kind === 'leg' && settled ? (
                <p className="sl-pad-debt sl-num" data-state={debt > 0n ? 'debt' : undefined} data-action="pad-debt">
                  {debt > 0n
                    ? t('sell.pad.debt', 'يبقى دين {debt}', { debt: dinars(debt) })
                    : debt === 0n
                      ? t('sell.pad.paid', 'مدفوعة كلّها')
                      : t('sell.pad.over', 'أكثر من المطلوب بـ{over}', { over: dinars(-debt) })}
                </p>
              ) : null}
              {quickAmounts.length > 0 || canAddLeg ? (
                <div className="sl-chips sl-wrap">
                  {canAddLeg ? (
                    // «+ صندوق آخر» عند اللوحة وأوّلاً: بعد مبلغ الصندوق الأوّل تكون الخطوة التالية تحت الإبهام لا خلف اللوحة.
                    <button type="button" className="sl-chip sl-chip-strong" onClick={onAddLeg} data-action="pay-add-pad">
                      {t('sell.leg.add', '+ صندوق آخر')}
                    </button>
                  ) : null}
                  {quickAmounts.map((entry) => (
                    <button key={String(entry.amount)} type="button" className="sl-chip sl-num" onClick={() => quick(entry.amount)} data-action="pay-quick" data-amount={String(entry.amount)}>
                      {entry.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <Keypad decimals={0} money onKeys={press} onEnter={() => onPad(null, true)} onScan={onScan} label={padTitle} />
            </div>
          ) : null}
          {failure ? (
            <p role="alert" className="sl-field-error" data-action="sale-failure">
              {failure}
            </p>
          ) : null}
          {blockedText !== null ? (
            <div className="sl-blocked">
              <p role="alert" data-action="sale-blocked">
                {blockedText}
              </p>
              {fixLabel !== null ? (
                <button type="button" className="sl-text-btn" onClick={onFix} data-action="sale-fix">
                  {fixLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          {!online ? <p className="sl-note">{t('sell.offline.now', 'بلا اتصال: جهّز الفاتورة واحفظها حين يعود الاتصال.')}</p> : null}
          {/* أثناء الحفظ «يُحفظ…» بتباين كامل لا الاسم نفسه باهتاً (D23). */}
          <button type="button" className="sl-primary sl-save" disabled={busy || !online || lines === 0} aria-busy={busy || undefined} onClick={onSave} data-action="save-invoice">
            {busy ? t('sell.saving', 'يُحفظ…') : saveText}
          </button>
        </div>
      }
    >
      <div ref={dueRef} className="sl-due" data-field="discount">
        <div className="sl-due-row">
          <span className="sl-due-label">{t('sell.due', 'المطلوب')}</span>
          <strong className="sl-due-amount sl-num" data-action="sale-total-net">
            {settled ? dinars(total) : t('file.none', '—')}
          </strong>
        </div>
        <div className="sl-due-sub">
          {math.discountTotal > 0n ? (
            <span className="sl-num">
              <span data-action="sale-total-gross">{t('sell.due.gross', 'الإجمالي {gross}', { gross: moneyText(math.grossTotal) })}</span>
              {' · '}
              <span data-action="sale-total-discount">{t('sell.due.discount', 'الخصم {discount}', { discount: moneyText(math.discountTotal) })}</span>
            </span>
          ) : null}
          <button
            type="button"
            className="sl-text-btn"
            aria-pressed={target?.kind === 'discount'}
            onClick={() => {
              sound.click();
              onPad({ kind: 'discount' }, true);
            }}
            data-action="pay-discount"
          >
            {amountOf(draft.invoiceDiscount) > 0n ? t('sell.due.discount_edit', 'خصم الفاتورة: {amount} — غيّره', { amount: moneyText(amountOf(draft.invoiceDiscount)) }) : t('sell.due.discount_add', '+ خصم على الفاتورة')}
          </button>
        </div>
        {shown.discount ? (
          <p role="alert" className="sl-field-error">
            {shown.discount}
          </p>
        ) : null}
      </div>

      <CustomerSection
        draft={draft}
        walkIn={walkIn}
        recent={recent}
        canCreateParty={canCreateParty}
        shown={shown}
        searchRef={searchRef}
        search={partyText}
        setSearch={onPartyText}
        busy={busy}
        onSet={onSet}
        onTyping={() => (padTarget ? onPad(null, true) : undefined)}
      />

      <section className="sl-section" data-action="sale-payments" data-field="legs">
        <h3 className="sl-h3">{t('sell.how', 'كيف يدفع؟')}</h3>
        <div className="sl-pay-kinds" role="radiogroup" aria-label={t('sell.how', 'كيف يدفع؟')}>
          {kinds.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              role="radio"
              aria-checked={payKind === entry.kind}
              className="sl-pay-card"
              onClick={() => {
                sound.click();
                onPay(entry.kind);
              }}
              data-action="pay-kind"
              data-kind={entry.kind}
            >
              {entry.icon}
              <span className="sl-pay-title">{entry.title}</span>
              <span className="sl-pay-sub">{entry.sub}</span>
            </button>
          ))}
        </div>
        {boxesFailed ? <LoadFailed what={t('cash.list', 'قائمة الصناديق')} error={boxesFailed} onRetry={onBoxesRetry} /> : null}
        {payKind === 'cash' && boxes !== null ? (
          <div className="sl-row-wrap">
            <BoxChoice
              boxes={boxList}
              value={cashBox}
              open={boxOpen === 'cash'}
              onToggle={() => setBoxOpen(boxOpen === 'cash' ? null : 'cash')}
              onPick={(id) => {
                onSet({ cashBox: id, pay: 'cash' });
                setBoxOpen(null);
              }}
              action="cash-box"
            />
          </div>
        ) : null}
        {/* النتيجة بكلمات تحت الاختيار مباشرةً، قبل تفصيل السيقان: تُرى بلا تمرير. */}
        <p className="sl-result" data-action="sale-debt-live">
          {result}
        </p>
        {payKind === 'part' ? (
          <div ref={legsRef} className="sl-legs">
            {draft.legs.map((leg, index) => {
              const targeted = target?.kind === 'leg' && target.legId === leg.legId;
              const problem = props.tried ? legErrors[index] : null;
              return (
                <div key={leg.legId} className="sl-leg" data-action="pay-leg">
                  <div className="sl-leg-row">
                    <button type="button" className="sl-amount sl-num" aria-pressed={targeted} onClick={() => onPad({ kind: 'leg', legId: leg.legId }, true)} data-action="pay-amount">
                      {leg.amount.trim() ? dinars(amountOf(leg.amount)) : t('sell.leg.amount', 'اكتب المبلغ')}
                    </button>
                    <BoxChoice
                      boxes={boxList}
                      value={leg.boxId}
                      open={boxOpen === leg.legId}
                      onToggle={() => setBoxOpen(boxOpen === leg.legId ? null : leg.legId)}
                      onPick={(id) => {
                        onSet({ legs: draft.legs.map((other) => (other.legId === leg.legId ? { ...other, boxId: id } : other)) });
                        setBoxOpen(null);
                      }}
                      action="leg-box"
                    />
                    <button type="button" className="sl-round" aria-label={t('sell.leg.remove', 'احذف هذه الدفعة')} onClick={() => onRemoveLeg(leg.legId)} data-action="pay-remove">
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  {problem ? (
                    <p role="alert" className="sl-field-error">
                      {problem}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <button type="button" className="sl-secondary" disabled={draft.legs.length >= MAX_LEGS || draft.legs.length >= Math.max(1, boxList.length)} onClick={onAddLeg} data-action="pay-add">
              {t('sell.leg.add', '+ صندوق آخر')}
            </button>
          </div>
        ) : null}
        {shown.legs || shown.walk_in ? (
          <p role="alert" className="sl-field-error" data-action="sale-pay-error">
            {shown.legs ?? shown.walk_in}
          </p>
        ) : null}
        {payKind === 'cash' && settled && total > 0n ? (
          <div ref={changeRef} className="sl-change">
            <span className="sl-change-label">{t('sell.change.label', 'استلمتُ')}</span>
            <button type="button" className="sl-amount sl-num" aria-pressed={target?.kind === 'received'} onClick={() => onPad({ kind: 'received' }, true)} data-action="pay-received">
              {received.trim() ? dinars(receivedAmount) : t('sell.change.ask', 'كم استلمتَ من الزبون؟')}
            </button>
            <span className="sl-change-out sl-num" data-action="pay-change">
              {!received.trim()
                ? t('sell.change.calc', 'احسب ما تُرجعه للزبون (لا يُسجَّل)')
                : receivedAmount >= total
                  ? t('sell.change.back', 'أرجِع للزبون {amount}', { amount: dinars(receivedAmount - total) })
                  : t('sell.change.short', 'ناقص {amount}', { amount: dinars(total - receivedAmount) })}
            </span>
          </div>
        ) : null}
      </section>
    </Sheet>
  );
}

// ─── المخازن والكاميرا ─────────────────────────────────────────────────────────────────────────────────────────────

export function StoreSheet({ level, rows, current, onPick, onClose }: { level: number; rows: readonly { id: string; name: string }[]; current: string; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Sheet title={t('invoice.store', 'من أيّ مخزن تبيع؟')} subtitle={t('sell.store.hint', 'كلّ مخزن بفاتورته؛ لبيع من مخزن آخر افتح فاتورة جديدة.')} level={level} onClose={onClose} action="sale-stores">
      <div className="sl-store-list" role="radiogroup" aria-label={t('invoice.store', 'من أيّ مخزن تبيع؟')}>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            role="radio"
            aria-checked={row.id === current}
            className="sl-option"
            onClick={() => {
              sound.click();
              onPick(row.id);
            }}
            data-action="sale-store-option"
            data-store={row.id}
          >
            <Store aria-hidden="true" className="sl-icon" />
            <span>{row.name}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/** المسح بالكاميرا حيث يدعم المتصفّح BarcodeDetector (أندرويد): أوّل رمز يُقرأ يُضاف كالماسح، والكاميرا تُطفأ حين تُغلق الورقة. */
export function ScanSheet({ level, onClose, onCode }: { level: number; onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | null = null;
    const Ctor = (window as unknown as { BarcodeDetector?: new () => Detector }).BarcodeDetector;
    const media = navigator.mediaDevices;
    const fail = () => {
      if (!stopped) setProblem(t('sell.camera.failed', 'تعذّر فتح الكاميرا: اسمح للتطبيق بها، أو اكتب الرمز في البحث.'));
    };
    if (!Ctor || !media?.getUserMedia) {
      void Promise.resolve().then(fail);
      return () => {
        stopped = true;
      };
    }
    const detector = new Ctor();
    media
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (opened) => {
        if (stopped) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stream = opened;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = opened;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(video);
            const code = found[0]?.rawValue;
            if (code) {
              onCodeRef.current(code);
              return;
            }
          } catch {
            /* swallow-ok: إطار لم يُقرأ؛ المحاولة التالية بعد لحظة */
          }
          timer = setTimeout(() => void tick(), 180);
        };
        void tick();
      })
      .catch(fail);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
  }, []);
  return (
    <Sheet title={t('sell.camera', 'امسح الرمز بالكاميرا')} level={level} onClose={onClose} action="sale-scan">
      {problem ? (
        <p role="alert" className="sl-field-error">
          {problem}
        </p>
      ) : (
        <div className="sl-camera">
          <video ref={videoRef} className="sl-video" muted playsInline />
          <span className="sl-camera-frame" aria-hidden="true" />
        </div>
      )}
      <p className="sl-hint">{t('sell.camera.hint', 'وجّه الكاميرا إلى الرمز؛ تُضاف المادّة حين يُقرأ.')}</p>
    </Sheet>
  );
}


