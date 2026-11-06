import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { decimalText, toScale } from '../../domain/decimal';
import type { Fils } from '../../domain/money';
import { RECEIVING_KINDS } from '../../domain/stock';
import { BASE_UNITS, COUNTED_KINDS, ITEM_KINDS, itemProblems, type ItemKind, type WarehouseKind } from '../../domain/stores';
import { parseDensity, parseFactor, parseQty, type BaseUnit } from '../../domain/units';
import { describeError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import type { CategoryRow, ItemTwin } from '../../lib/repo/inventory';
import { activeTwins, categoryNamedLikeItem, itemKindLabel, itemKindOption, warehouseKindLabel } from '../../lib/storeLabels';
import { BuyLink, countingLabel, unitName } from './stock-shared';

// التوأم والتصنيف باسم المادّة صارا في storeLabels (صفحة «المواد» تستعملهما بالتدفّق نفسه، #21)؛ الاسمان باقيان من هنا كما كانا.
export { activeTwins, categoryNamedLikeItem };

// إضافة مادّة بأسلوب دكتور فيت (كلمة المالك 2026-11-02): وحدة مشتركة لأنّ المادّة تُضاف من مكانين: قائمة المخزن
// («أضف مادّة») وورقة الاستلام نفسها (البحث ما لكى المادّة، 2026-11-03). بلا نسختين من النموذج ولا من قواعد حقوله.
// وكلمة المالك 2026-11-04 («لمن اضيف ذرة ما اكدر اضيف مادة ثانية بنفس التصنيف بنفس الاسم… اني اشتريت ذرة اليوم وبعد اسبوع
// اشتريت ذرة بغير حساب»): المادّة تُضاف مرّة واحدة وكلّ شراء ورقة استلام — فالتوأم بالاسم نفسه يقترح «سجّل شراءً جديداً»
// أوّلاً و«احفظ مادّة أخرى» ثانياً؛ والنوع بأمثلة (الذرة مادّة أوّلية لا «علف»)؛ والتصنيف قسم لا اسم مادّة.

/** نوع المادّة المقترح من نوع المخزن: المستخدم يقدر يغيّره، والحكم بالقاعدة. */
export function suggestedKind(kind: WarehouseKind | undefined): ItemKind {
  if (kind === 'raw') return 'raw';
  if (kind === 'feed') return 'feed';
  if (kind === 'medicine') return 'medicine';
  if (kind === 'hatching_egg') return 'hatching_egg';
  if (kind === 'chick') return 'chick';
  if (kind === 'table_egg') return 'table_egg';
  return 'other';
}

interface AddItemForm {
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
  categoryId: string;
  packLabel: string;
  packFactor: string;
  minQty: string;
  barcode: string;
  sellPrice: string;
}

/** حقول المادّة من النموذج، أو أخطاء حقولها (نفس قيود القاعدة itemProblems). */
export function addItemFields(form: AddItemForm): { fields: inventory.ItemFields; sellPrice: Fils | null; errors: Partial<Record<'name' | 'minQty' | 'packFactor' | 'barcode' | 'sellPrice', string>> } {
  const minQty = form.minQty.trim() ? parseQty(form.minQty) : null;
  const factor = form.packFactor.trim() ? parseFactor(form.packFactor) : null;
  const sellPrice = form.sellPrice.trim() ? parseMoneyText(form.sellPrice, false) : null;
  const errors: ReturnType<typeof addItemFields>['errors'] = {};
  const numberError = t('items.number.invalid', 'اكتب رقماً صحيحاً بمراتبه المسموحة.');
  if (form.minQty.trim() && minQty === null) errors.minQty = numberError;
  if (form.packLabel.trim() && factor === null) errors.packFactor = t('stores.pack.factor', 'اكتب كم وحدة أساس في التعبئة، رقماً أكبر من صفر.');
  if (form.barcode.trim().length > 64) errors.barcode = t('constraint.items_barcode_check', 'الباركود لا يزيد على 64 حرفاً.');
  if (form.sellPrice.trim() && (sellPrice === null || sellPrice <= 0n)) errors.sellPrice = t('items.sell_price.invalid', 'اكتب سعر البيع بالدينار، رقماً أكبر من صفر.');
  const step = form.baseUnit === 'pc' ? 1000n : 100n;
  for (const problem of itemProblems({ name: form.name, kind: form.kind, baseUnit: form.baseUnit, density: null, pieceMassKg: null, scaleStep: step, minQty })) {
    if (problem === 'min_qty' || problem === 'pieces_whole') errors.minQty ??= t('constraint.items_min_qty_check', 'الحدّ الأدنى صفر أو أكثر، بثلاث مراتب عشرية كحدّ أقصى.');
    else errors.name ??= t('constraint.items_name_check', 'اسم المادّة مطلوب، ولا يزيد على 120 حرفاً.');
  }
  return {
    fields: {
      name: form.name.trim(),
      category_id: form.categoryId || null,
      kind: form.kind,
      base_unit: form.baseUnit,
      density_kg_per_l: null,
      piece_mass_kg: null,
      tracks_expiry: false,
      scale_step: decimalText(step, 3),
      min_qty: minQty === null ? null : decimalText(minQty, 3),
      barcode: form.barcode.trim() || null,
      alt_codes: [],
    },
    sellPrice: errors.sellPrice ? null : sellPrice,
    errors,
  };
}

/**
 * نوع مادّة لا يستلمه مخزن القائمة: المادّة الجديدة بلا رصيد تظهر في قوائم المخازن التي تستلم نوعها وحدها (stock_on_hand، 0014)،
 * فالنافذة تقول ذلك قبل الحفظ، وتسمّي نوع المخزن الذي تُستلم فيه (RECEIVING_KINDS، مرآة receiving_kinds). null = تظهر هنا.
 */
export function notListedHere(kind: ItemKind, store: { name: string; kind: WarehouseKind } | undefined): string | null {
  if (!store || RECEIVING_KINDS[kind].includes(store.kind)) return null;
  const home = RECEIVING_KINDS[kind][0];
  return home
    ? t('item_form.listed.elsewhere', 'لن تظهر في «{store}» قبل أن يدخلها رصيد: «{kind}» مكانها مخزن «{home}».', { store: store.name, kind: itemKindLabel(kind), home: warehouseKindLabel(home) })
    : t('item_form.listed.never', 'لن تظهر في «{store}» قبل أن يدخلها رصيد: «{kind}» لا تُشترى من مورّد.', { store: store.name, kind: itemKindLabel(kind) });
}

/**
 * نافذة «أضف مادّة» بأسلوب دكتور فيت: حقول مرتّبة بعمودين — الاسم، والنوع والتصنيف، وكيف تُعدّ، والتعبئة ومعاملها،
 * والباركود والحدّ الأدنى، وسعر البيع لأدوار الكلفة. سعر البيع يُكتب بعد المادّة بدالّته (set_item_sell_price): فشله لا
 * يُلغي المادّة، ويُكتب بعدها من بطاقتها.
 */
export function AddItemDialog({
  categories,
  storeKind,
  kinds,
  initialName = '',
  costs,
  purchase,
  onUseTwin,
  listStore,
  onClose,
  onSaved,
}: {
  categories: readonly CategoryRow[];
  storeKind: WarehouseKind | undefined;
  /** الأنواع المعروضة: ورقة الاستلام تحصرها بما يستلمه مخزنها، والقائمة تعرضها كلّها. */
  kinds?: readonly ItemKind[];
  /** الاسم مكتوباً مسبقاً: بحثٌ لم يجد المادّة يفتح النافذة بما كتبه المستخدم بدل أن يكتبه مرّتين. */
  initialName?: string;
  costs: boolean;
  /**
   * «سجّل شراءً جديداً» لتوأم بالاسم نفسه (ملفّ التوأم ونافذة الشراء، buyPath)، وcanBuy صلاحية purchase.record. warehouseId باقٍ
   * للتوافق مع من يمرّره، والمخزن يختاره الخادم من نوع المادّة.
   * بلا هذا ولا onUseTwin يبقى التنبيه كما كان («احفظ رغم التشابه»).
   */
  purchase?: { warehouseId: string | null; canBuy: boolean };
  /** داخل ورقة استلام: التوأم يُستعمل في سطر الورقة نفسها بدل ورقة جديدة. */
  onUseTwin?: (twin: ItemTwin) => void;
  /** مخزن القائمة التي فُتحت منها النافذة: تنبيه قبل الحفظ إن كان النوع المختار لا يظهر فيه. */
  listStore?: { name: string; kind: WarehouseKind };
  onClose: () => void;
  onSaved: (item: inventory.ItemRow) => void;
}) {
  const id = useId();
  const offered = kinds && kinds.length ? kinds : ITEM_KINDS;
  const [form, setForm] = useState<AddItemForm>(() => {
    const suggested = suggestedKind(storeKind);
    const kind = offered.includes(suggested) ? suggested : (offered[0] ?? suggested);
    return { name: initialName, kind, baseUnit: COUNTED_KINDS.has(kind) ? 'pc' : 'kg', categoryId: '', packLabel: '', packFactor: '', minQty: '', barcode: '', sellPrice: '' };
  });
  const [errors, setErrors] = useState<ReturnType<typeof addItemFields>['errors']>({});
  const [twins, setTwins] = useState<readonly ItemTwin[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AddItemForm>) => {
    setForm({ ...form, ...patch });
    setTwins(null);
  };
  const { fields, sellPrice, errors: found } = addItemFields(form);
  // التنبيه بالاسم يمرّ بالتأكيد مرّة لنفس الاسم (مثل نافذة المواد): تغيير أيّ حقل يرجّع الفحص.
  const confirmed = twins !== null && twins.length > 0;
  // التوأم الفعّال بسياق شراء أو ورقة: الفعل الأوّل له (شراء جديد أو استعماله)، و«احفظ مادّة أخرى بالاسم نفسه» ثانياً.
  const active = activeTwins(twins);
  const explain = confirmed && active.length > 0 && (purchase !== undefined || onUseTwin !== undefined);
  const twinActions = explain && (onUseTwin !== undefined || purchase?.canBuy === true) ? active.slice(0, 3) : [];

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (!confirmed) {
        const same = (await inventory.findItemTwins(fields.name, fields.barcode ? [fields.barcode] : [])).filter((twin) => twin.sameName || twin.codes.length > 0);
        if (same.length) {
          setTwins(same);
          return;
        }
      }
      const created = await inventory.createItem(fields);
      const factor = form.packLabel.trim() ? parseFactor(form.packFactor) : null;
      if (factor) {
        // التعبئة صفّ بـitem_units: فشلها لا يلغي المادّة، وتُضاف بعدها من «التعبئة» بصفحة المواد.
        await inventory
          .createItemUnit(created.id, null, { label: form.packLabel.trim().slice(0, 40), factor_to_base: decimalText(toScale(factor, 6), 6), is_default: true, for_purchase: true, for_sale: true, for_recipe: true })
          .catch((caught: unknown) => setFailure(caught));
      }
      if (sellPrice !== null) await inventory.setItemSellPrice(created.id, sellPrice, null).catch((caught: unknown) => setFailure(caught));
      onSaved(created);
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const formId = `${id}-form`;
  const failed = failure ? describeError(failure, 'once') : null;
  const counted = COUNTED_KINDS.has(form.kind);
  const sameNamed = categoryNamedLikeItem(form.name, categories.find((category) => category.id === form.categoryId));
  const elsewhere = notListedHere(form.kind, listStore);
  const twinNames = (twins ?? []).map((twin) => (twin.archived ? t('items.archived.name', '{name} (مؤرشفة)', { name: twin.name }) : twin.name)).join(t('list.separator', '، '));
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('stores.item.new', 'مادّة جديدة')}
      dirty={form.name.trim() !== '' || form.packLabel.trim() !== '' || form.minQty.trim() !== '' || form.barcode.trim() !== '' || form.sellPrice.trim() !== ''}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} variant={twinActions.length ? 'secondary' : 'primary'} data-action={confirmed ? 'save-new-item-twin' : 'save-new-item'}>
            {explain ? t('twin.save_other', 'احفظ مادّة أخرى بالاسم نفسه') : confirmed ? t('items.save.twin', 'احفظ رغم التشابه') : t('org.save', 'احفظ')}
          </Button>
          {twinActions.map((twin) =>
            onUseTwin ? (
              <Button key={twin.id} onClick={() => onUseTwin(twin)} disabled={busy} data-action="use-twin">
                {t('twin.use', 'استعمل «{name}» في هذه الورقة', { name: twin.name })}
              </Button>
            ) : (
              <BuyLink key={twin.id} primary itemId={twin.id} label={t('twin.buy', 'سجّل شراءً جديداً لـ«{name}»', { name: twin.name })} />
            ),
          )}
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        <Field id={`${id}-name`} label={t('items.name', 'اسم المادّة')} error={errors.name}>
          <input id={`${id}-name`} className="input" maxLength={120} value={form.name} onChange={(event) => set({ name: event.target.value })} data-autofocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-kind`} label={t('items.kind', 'النوع')} hint={t('item_form.kind.hint', 'النوع يحدّد المخزن الذي تُستلم فيه المادّة.')}>
            <select
              id={`${id}-kind`}
              className="input"
              value={form.kind}
              onChange={(event) => {
                const kind = event.target.value as ItemKind;
                set(COUNTED_KINDS.has(kind) ? { kind, baseUnit: 'pc' } : { kind });
              }}
              data-action="pick-kind"
            >
              {offered.map((kind) => (
                <option key={kind} value={kind}>
                  {itemKindOption(kind)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${id}-category`} label={t('items.category', 'التصنيف')} hint={t('item_form.category.hint', 'التصنيف قسم يجمع موادّ متشابهة، مثل «الغذاء» أو «الإضافات».')}>
            <select id={`${id}-category`} className="input" value={form.categoryId} onChange={(event) => set({ categoryId: event.target.value })} data-action="pick-category">
              <option value="">{t('items.category.none', 'دون تصنيف')}</option>
              {categories.filter((category) => !category.archived).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {elsewhere ? <Notice tone="warning" title={elsewhere} /> : null}
        {sameNamed ? (
          <Notice tone="warning" title={t('item_form.category.same_name', 'اسم التصنيف مثل اسم المادّة')}>
            {t('item_form.category.same_name.detail', 'التصنيف قسم يجمع موادّ كثيرة؛ اختر قسماً أعمّ مثل «الغذاء»، أو اترك المادّة دون تصنيف.')}
          </Notice>
        ) : null}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('items.base_unit', 'كيف تُعدّ هذه المادّة؟')}</span>
          <Segmented<BaseUnit>
            label={t('items.base_unit', 'كيف تُعدّ هذه المادّة؟')}
            options={(counted ? (['pc'] as const) : BASE_UNITS).map((unit) => ({ value: unit, label: countingLabel(unit) }))}
            value={form.baseUnit}
            onChange={(baseUnit) => set({ baseUnit })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-pack`} label={t('stores.pack.label', 'التعبئة (اختيارية)')} hint={t('stores.pack.hint', 'مثل «كيس» أو «طبقة»، فتظهر الكمية بها.')}>
            <input id={`${id}-pack`} className="input" maxLength={40} value={form.packLabel} onChange={(event) => set({ packLabel: event.target.value })} />
          </Field>
          <Field id={`${id}-factor`} label={t('stores.pack.factor.label', 'كم {unit} في التعبئة؟', { unit: unitName(form.baseUnit, null) })} error={errors.packFactor}>
            <input id={`${id}-factor`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.packFactor} onChange={(event) => set({ packFactor: event.target.value })} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-min`} label={t('items.min', 'الحدّ الأدنى للتنبيه')} hint={t('items.min.hint', 'بالوحدة التي تُعدّ بها المادّة، للتنبيه فقط.')} error={errors.minQty}>
            <input id={`${id}-min`} inputMode="decimal" dir="ltr" className="input tabular-nums" value={form.minQty} onChange={(event) => set({ minQty: event.target.value })} />
          </Field>
          <Field id={`${id}-barcode`} label={t('items.barcode.optional', 'الباركود (اختياري)')} hint={t('items.barcode.hint', 'كما على العبوة، فتُبحث المادّة به.')} error={errors.barcode}>
            <input id={`${id}-barcode`} dir="ltr" className="input" maxLength={64} value={form.barcode} onChange={(event) => set({ barcode: event.target.value })} />
          </Field>
        </div>
        {costs ? (
          <MoneyInput
            id={`${id}-sell`}
            label={t('items.sell_price.for', 'سعر البيع لكل {unit} (اختياري)', { unit: unitName(form.baseUnit, null) })}
            hint={t('items.sell_price.hint', 'منه تُحسب قيمة البيع والربح المتوقّع. يُغيَّر وقت ما تريد من بطاقة المادّة.')}
            error={errors.sellPrice}
            whole={false}
            value={form.sellPrice}
            onChange={(value) => set({ sellPrice: value })}
          />
        ) : null}
        {twins?.length ? (
          <Notice tone="warning" title={t('items.twin.names', 'مادّة بالاسم نفسه موجودة')}>
            {explain
              ? t('twin.buy.detail', 'تشبهها: {names}. المادّة تُضاف مرّة واحدة، وكلّ شراء جديد (بكميته وسعره) يُسجَّل في ملفّها.', { names: twinNames })
              : t('items.twin.names.detail', 'تشبهها: {names}. احفظ إن كانت مادّة أخرى فعلاً.', { names: twinNames })}
          </Notice>
        ) : null}
        {failed ? (
          <Notice tone="danger" title={failed.title}>
            {failed.detail}
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}

// ─── «أضف مادّة» ببساطة (كلمة المالك 2026-11-06، «المخزن ببساطة») ──────────────────────────────────────────────────
// «لما اجي اكتب اسم مادة معينة لمرة وحدة اختار طريقة حساب هاي المادة مثلا ذرة بالكيلو، راح ينفتحلي ملف الذرة»: الاسم وطريقة
// الحساب (كيلوغرام أو لتر أو قطعة) والنوع بكلمات بسيطة، ووزن اللتر إن كانت باللتر — ولا شيء غيرها. التصنيف والتعبئة والباركود
// والحدّ الأدنى تبقى في نافذة «المواد» الكاملة. والإنشاء بطريق createItem القائم (item.create)، والتوأم بالاسم نفسه يُعرض قبل الحفظ
// برابط ملفّه («موجودة: افتح ملفّها»)، فالمادّة تُضاف مرّة واحدة وكلّ شراء يُسجَّل في ملفّها.

/** الأنواع المعروضة في «أضف مادّة» البسيطة، بالترتيب، والأوّل الافتراضي (الذرة والصويا والزيت موادّ للمعمل). */
export const SIMPLE_KINDS: readonly ItemKind[] = ['raw', 'feed', 'medicine', 'other'];

/** اسم النوع بكلمات المالك. */
export function simpleKindLabel(kind: ItemKind): string {
  if (kind === 'raw') return t('simple_item.kind.raw', 'مادّة للمعمل');
  if (kind === 'feed') return t('simple_item.kind.feed', 'علف جاهز');
  if (kind === 'medicine') return t('simple_item.kind.medicine', 'دواء');
  return t('simple_item.kind.other', 'أخرى');
}

/** «طريقة الحساب» بكلمة واحدة لكلّ وحدة. */
export function countingWord(unit: BaseUnit): string {
  if (unit === 'kg') return t('simple_item.unit.kg', 'كيلوغرام');
  if (unit === 'L') return t('simple_item.unit.L', 'لتر');
  return t('simple_item.unit.pc', 'قطعة');
}

export interface SimpleItemForm {
  name: string;
  baseUnit: BaseUnit;
  kind: ItemKind;
  density: string;
}

/** حقول المادّة من النموذج البسيط أو أخطاء حقوله (قيود القاعدة نفسها: itemProblems، والكثافة للسائل وحده). */
export function simpleItemFields(form: SimpleItemForm): { fields: inventory.ItemFields; errors: Partial<Record<'name' | 'density', string>> } {
  const liquid = form.baseUnit === 'L';
  const density = liquid && form.density.trim() ? parseDensity(form.density) : null;
  const errors: Partial<Record<'name' | 'density', string>> = {};
  if (liquid && density === null) {
    errors.density = form.density.trim()
      ? t('simple_item.density.invalid', 'اكتب وزن اللتر بالكيلوغرام رقماً أكبر من صفر، بأربع مراتب عشرية كحدّ أقصى (مثل 0.92).')
      : t('simple_item.density.required', 'اكتب كم يزن اللتر بالكيلوغرام، فمنه تُحسب كميتها في خلطات المعمل.');
  }
  const step = form.baseUnit === 'pc' ? 1000n : 100n;
  if (itemProblems({ name: form.name, kind: form.kind, baseUnit: form.baseUnit, density, pieceMassKg: null, scaleStep: step, minQty: null }).some((problem) => problem === 'name' || problem === 'name_norm')) {
    errors.name = t('simple_item.name.required', 'اكتب اسم المادّة بحروف، ولا يزيد على 120 حرفاً.');
  }
  return {
    fields: {
      name: form.name.trim(),
      category_id: null,
      kind: form.kind,
      base_unit: form.baseUnit,
      density_kg_per_l: density === null ? null : decimalText(density, 4),
      piece_mass_kg: null,
      tracks_expiry: false,
      scale_step: decimalText(step, 3),
      min_qty: null,
      barcode: null,
      alt_codes: [],
    },
    errors,
  };
}

/**
 * نافذة «أضف مادّة» البسيطة: الاسم، وطريقة الحساب، والنوع، ووزن اللتر للسائل. الحفظ يسأل عن التوائم بالاسم أوّلاً (find_item_twins):
 * التوأم الفعّال رابط «افتح ملفّها»، والحفظ رغمه فعل صريح ثانٍ. onSaved بالمادّة الجديدة، والشاشة تفتح ملفّها.
 */
export function SimpleItemDialog({ initialName = '', onClose, onSaved }: { initialName?: string; onClose: () => void; onSaved: (item: inventory.ItemRow) => void }) {
  const id = useId();
  const [form, setForm] = useState<SimpleItemForm>({ name: initialName, baseUnit: 'kg', kind: 'raw', density: '' });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'density', string>>>({});
  const [twins, setTwins] = useState<readonly ItemTwin[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SimpleItemForm>) => {
    setForm({ ...form, ...patch });
    setTwins(null);
  };
  const { fields, errors: found } = simpleItemFields(form);
  const confirmed = twins !== null && twins.length > 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (!confirmed) {
        const same = (await inventory.findItemTwins(fields.name, [])).filter((twin) => twin.sameName);
        if (same.length) {
          setTwins(same);
          return;
        }
      }
      onSaved(await inventory.createItem(fields));
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const formId = `${id}-form`;
  const failed = failure ? describeError(failure, 'once') : null;
  const open = activeTwins(twins);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('simple_item.title', 'أضف مادّة')}
      size="wide"
      dirty={form.name.trim() !== '' || form.density.trim() !== ''}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} variant={open.length ? 'secondary' : 'primary'} data-action={confirmed ? 'save-simple-item-twin' : 'save-simple-item'}>
            {confirmed ? t('twin.save_other', 'احفظ مادّة أخرى بالاسم نفسه') : t('simple_item.save', 'احفظ وافتح ملفّها')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        {/* عريضة على الآيباد (كلمة المالك 2026-11-06): الاسم | النوع، وطريقة الحساب | وزن اللتر. */}
        <div className="grid gap-4 sm:grid-cols-2" data-action="simple-item-grid">
          <Field id={`${id}-name`} label={t('items.name', 'اسم المادّة')} error={errors.name}>
            <input id={`${id}-name`} className="input" maxLength={120} value={form.name} onChange={(event) => set({ name: event.target.value })} data-autofocus data-action="simple-item-name" />
          </Field>
          <Field id={`${id}-kind`} label={t('simple_item.kind', 'نوع المادّة')} hint={t('simple_item.kind.hint', 'النوع يحدّد المخزن الذي تدخله عند الشراء.')}>
            <select id={`${id}-kind`} className="input" value={form.kind} onChange={(event) => set({ kind: event.target.value as ItemKind })} data-action="simple-item-kind">
              {SIMPLE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {simpleKindLabel(kind)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('simple_item.unit', 'طريقة الحساب')}</span>
            <Segmented<BaseUnit> label={t('simple_item.unit', 'طريقة الحساب')} options={BASE_UNITS.map((unit) => ({ value: unit, label: countingWord(unit) }))} value={form.baseUnit} onChange={(baseUnit) => set({ baseUnit })} />
          </div>
          {form.baseUnit === 'L' ? (
            <Field id={`${id}-density`} label={t('simple_item.density', 'كم يزن اللتر بالكيلوغرام؟')} hint={t('simple_item.density.hint', 'مثل 0.92 لزيت الصويا.')} error={errors.density}>
              <input id={`${id}-density`} inputMode="decimal" dir="ltr" autoComplete="off" className="input tabular-nums" value={form.density} onChange={(event) => set({ density: event.target.value })} data-action="simple-item-density" />
            </Field>
          ) : null}
        </div>
        {twins?.length ? (
          <Notice tone="warning" title={t('simple_item.twin', 'مادّة بالاسم نفسه موجودة')}>
            <span className="flex flex-col gap-2">
              {t('simple_item.twin.detail', 'المادّة تُضاف مرّة واحدة، وكلّ شراء جديد يُسجَّل في ملفّها.')}
              {open.map((twin) => (
                <Link key={twin.id} to={`/inventory/items/${twin.id}`} className="font-medium text-brand-700 dark:text-brand-200" data-action="open-twin-file">
                  {t('simple_item.twin.open', 'موجودة: افتح ملفّ «{name}»', { name: twin.name })}
                </Link>
              ))}
              {twins.filter((twin) => twin.archived).map((twin) => (
                <span key={twin.id}>{t('items.archived.name', '{name} (مؤرشفة)', { name: twin.name })}</span>
              ))}
            </span>
          </Notice>
        ) : null}
        {failed ? (
          <Notice tone="danger" title={failed.title}>
            {failed.detail}
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}
