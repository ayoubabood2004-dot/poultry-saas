import { ArrowLeftRight, Boxes, Building2, ClipboardCheck, ClipboardList, PackageMinus, PackagePlus, Plus, type LucideIcon } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DayField, postingDay } from '../../components/ui/DayField';
import { Field } from '../../components/ui/Field';
import type { QtyUnitOption } from '../../components/ui/QtyInput';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Num, type Column } from '../../components/ui/DataTable';
import type { Day } from '../../domain/dates';
import type { DivisionKind } from '../../domain/divisions';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { can, type Action, type Role } from '../../domain/permissions';
import { inScope } from '../../domain/scope';
import type { Workspace } from '../../domain/workspace';
import { normalizeCode, searchable } from '../../domain/normalize';
import { itemAdmissible } from '../../domain/stock';
import type { WarehouseKind } from '../../domain/stores';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtQtyCell, columnDecimals } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as counts from '../../lib/repo/counts';
import * as inventory from '../../lib/repo/inventory';
import { sessionStore } from '../../lib/session';
import type { DocStatus, ItemRow, OrgSetup, StockRef, WarehouseRow } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { baseUnitLabel, itemKindLabel, warehouseKindLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';

// أدوات شاشات المخزون (المرحلة 1 WP4): المخازن بنطاق المستخدم (مرآة in_scope_wh)، ومنتقي المادّة بالبحث والرمز (E54: ماسح
// لوحة المفاتيح ينتهي بـEnter)، وخلية الكمية بمراتب العمود الثابتة، ومحاولة الترحيل بمرجع ثابت لحد ما تنعرف النتيجة
// (FOUNDATION ٥١٩)، ونافذة الإلغاء بسببه. كلها بحزمة StockRoutes الكسولة (برّا التثبيت المسبق، DECISIONS «السقوف المقيسة»).

export interface StoreRef {
  id: string;
  name: string;
  kind: WarehouseRow['kind'];
  siteId: string;
  divisionId: string;
  divisionKind: DivisionKind;
  archived: boolean;
  /** «مؤرشف وعليه رصيد» (§2.6). */
  hasBalance: boolean;
}

/** المخازن مع نوع وحدتها، والفعّالة أوّلاً. */
export function storesOf(setup: OrgSetup): StoreRef[] {
  const kinds = new Map(setup.divisions.map((division) => [division.id, division.kind]));
  return setup.warehouses
    .flatMap((w) => {
      const divisionKind = kinds.get(w.divisionId);
      return divisionKind ? [{ id: w.id, name: w.name, kind: w.kind, siteId: w.siteId, divisionId: w.divisionId, divisionKind, archived: w.archived, hasBalance: Boolean(w.archived && w.hasBalance) }] : [];
    })
    .sort((a, b) => (a.archived === b.archived ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.archived ? 1 : -1));
}

/** المخازن بنطاق المستخدم (مرآة in_scope_wh، والحكم بالخادم)، ووحدتها اختيارياً. */
export function scopedStores(stores: readonly StoreRef[], workspace: Workspace | null, division?: DivisionKind): StoreRef[] {
  if (!workspace) return [];
  return stores.filter(
    (store) =>
      (!division || store.divisionKind === division) &&
      inScope(workspace.role, workspace.scopes, { warehouseId: store.id, siteId: store.siteId, divisionId: store.divisionId }),
  );
}

export function storeLabel(store: Pick<StoreRef, 'name' | 'kind' | 'divisionKind' | 'archived'> & { hasBalance?: boolean }): string {
  const label = t('stock.store.label', '{name} ({kind}، {division})', { name: store.name, kind: warehouseKindLabel(store.kind), division: divisionLabel(store.divisionKind) });
  if (store.archived && store.hasBalance) return t('stock.store.archived_balance', '{label} — مؤرشف وعليه رصيد', { label });
  return store.archived ? t('stock.store.archived', '{label} — مؤرشف', { label }) : label;
}

export function StoreSelect({ id, label, stores, value, onChange, error }: { id: string; label: string; stores: readonly StoreRef[]; value: string; onChange: (id: string) => void; error?: string | null }) {
  return (
    <Field id={id} label={label} error={error}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} data-action="pick-store">
        <option value="">{t('stock.store.pick', 'اختر المخزن')}</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {storeLabel(store)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** مراتب عمود الكمية: الكيلو واللتر ثلاث ثابتة (مثل جدول المواد)، والمعدود أقلّ مراتب تبيّن قيمه (صحيح عادةً). */
export function qtyDecimals(values: readonly Milli[], unit: BaseUnit): 0 | 1 | 2 | 3 {
  return unit === 'pc' ? (columnDecimals(values, 3) as 0 | 1 | 2 | 3) : 3;
}

export function qtyCell(qty: Milli, decimals: 0 | 1 | 2 | 3): string {
  return fmtQtyCell(qty, decimals);
}

const UNITS: readonly BaseUnit[] = ['kg', 'L', 'pc'];

/**
 * أعمدة الكمية لسطور مستند بمواد بوحدات مختلفة (قانون الجداول): عمود لكل وحدة أساس موجودة والوحدة برأسه، والسطر رقمه بعمود وحدته
 * بس (مثل عمود الحدّ الأدنى بجدول المواد).
 */
export function qtyColumns<Row extends { baseUnit: BaseUnit }>(rows: readonly Row[], qtyOf: (row: Row) => Milli, header: (unit: string) => string): Column<Row>[] {
  return UNITS.filter((unit) => rows.some((row) => row.baseUnit === unit)).map((unit) => {
    const decimals = qtyDecimals(rows.filter((row) => row.baseUnit === unit).map(qtyOf), unit);
    return { key: `qty_${unit}`, header: header(baseUnitLabel(unit)), kind: 'number' as const, cell: (row: Row) => (row.baseUnit === unit ? <Num>{fmtQtyCell(qtyOf(row), decimals)}</Num> : '') };
  });
}

/** وقت القراءة من الخادم بالساعة والدقيقة (توقيت الجهاز): «14:05». */
export function readTime(iso: string): string {
  const at = new Date(iso);
  const minutes = at.getMinutes();
  return `${fmtInt(at.getHours())}:${minutes < 10 ? '0' : ''}${fmtInt(minutes)}`;
}

export function docStatusLabel(status: DocStatus): string {
  switch (status) {
    case 'draft':
      return t('stock.doc.draft', 'غير محفوظ بعد');
    case 'posted':
      return t('stock.doc.posted', 'محفوظ نهائياً');
    case 'void':
      return t('stock.doc.void', 'ملغى');
  }
}

// ─── مواد ووحدات شافتها الجلسة (رفّ مسوّدات الجهاز، FOUNDATION ١٤٢) ─────────────────────────────────────────────────
// بلا نت المنتقي يبحث بالمواد اللي انقرت وهو متّصل (البحث، وأوّل صفحة يقراها نموذج التحويل الجديد)، ووحدات التعبئة اللي انقرت.
// بالذاكرة لعمر الجلسة بس: حزمة المخزون برّا التثبيت المسبق، فالرفّ يشتغل بجلسة فتحت المخزون وهي متّصلة (DECISIONS). ولصاحب
// الجلسة ومنشأته بس: الخروج ما يعيد تحميل الصفحة، فمستخدم ثانٍ بنفس التبويب كان يلكى مواد منشأة اللي قبله بالمنتقي بلا نت
// (مراجعة WP4 الثانية). أيّ قراءة أو كتابة بهويّة غير هويّة المحفوظ تمسحه أوّلاً.
const seenItems = new Map<string, ItemRow>();
const seenUnits = new Map<string, readonly inventory.ItemUnitRow[]>();
let currentOwner = '';

/** صاحب الجلسة الحالي («مستخدم:منشأة»، أو فارغ). الطلب يلتقطه وهو يطلع، والجواب ينحفظ بس إذا بعده نفسه. */
export function seenOwner(): string {
  const state = sessionStore.get();
  return state.status === 'ready' ? `${state.workspace.userId}:${state.workspace.orgId}` : '';
}

function seenFor(): void {
  const owner = seenOwner();
  if (owner === currentOwner) return;
  seenItems.clear();
  seenUnits.clear();
  currentOwner = owner;
}

/** يحفظ مواد ظهرت؛ owner صاحب الطلب لمّا طلع: جواب وصل بعد ما تبدّل المستخدم أو المنشأة ما ينحفظ للجديد (مراجعة WP4 الثانية). */
export function rememberItems(rows: readonly ItemRow[], owner?: string): void {
  seenFor();
  if (owner !== undefined && owner !== currentOwner) return;
  for (const row of rows) if (!row.archived) seenItems.set(row.id, row);
}

/** المواد المحفوظة اللي اسمها المطبَّع بيه النصّ (أو رمزها بالضبط)، بالاسم. */
export function seenItemsMatching(text: string): ItemRow[] {
  seenFor();
  const name = searchable(text);
  const code = normalizeCode(text);
  if (!name && !code) return [];
  return [...seenItems.values()]
    .filter((row) => (name !== '' && row.nameNorm.includes(name)) || (code !== '' && (row.barcode === code || row.altCodes.includes(code))))
    .sort((a, b) => (a.nameNorm < b.nameNorm ? -1 : a.nameNorm > b.nameNorm ? 1 : 0));
}

/** وحدات تعبئة المادّة من الخادم، وتنحفظ للجلسة (بلا نت: المحفوظة، أو وحدة الأساس بس). */
export async function loadItemUnits(itemId: string, online: boolean): Promise<readonly inventory.ItemUnitRow[]> {
  seenFor();
  if (!online) return seenUnits.get(itemId) ?? [];
  const owner = currentOwner;
  const rows = await inventory.listItemUnits(itemId);
  seenFor();
  if (owner === currentOwner) seenUnits.set(itemId, rows);
  return rows;
}

/**
 * جملة «موجودة لكنّها لا تصلح هنا» للحركات داخل المخازن (التحويل والصرف والجرد والافتتاح): المخزن لا يحفظ نوع هذه
 * المادّة أصلاً (ADMISSIBLE، مرآة private.item_admissible). بطرفين (التحويل) تسمّي الطرف الرافض لا أيّ طرف.
 */
export function notAdmittedHere(items: readonly ItemRow[], stores: readonly { name: string; kind: WarehouseKind }[]): string {
  const first = items[0];
  if (!first) return '';
  const blocking = stores.find((store) => !itemAdmissible(store.kind, first.kind)) ?? stores[0];
  if (!blocking) return '';
  return t('stock.item.not_admitted', '«{item}» نوعها «{kind}»، و«{store}» لا يحفظ هذا النوع. افتح الورقة على مخزنها.', {
    item: first.name,
    kind: itemKindLabel(first.kind),
    store: blocking.name,
  });
}

/**
 * منتقي المادّة: البحث بالاسم المطبَّع والرمز، وEnter بعد رمز ماسح يختار المطابقة الوحيدة (E54). بلا نت (offline) بالمحفوظ.
 * وبحثٌ بلا نتيجة **لا يسكت** (كلمة المالك 2026-11-03: «لما اجي اكتب ما يصير اي شيء ولا اكدر اكملها»): ثلاث حالات —
 * مطابقات تُعرض، أو «لا مادّة بهذا الاسم» ومعها «أضفها الآن» حيث يصحّ، أو «موجودة لكنّها لا تصلح هنا» وتقول أين مكانها.
 * ولهذا يُحفظ ما وجده البحث **قبل** التصفية (all) لا بعدها: الفرق بين الحالتين هو كلّ الفرق في الرسالة.
 */
export function ItemPicker({ id, label, value, onChange, filter, offline = false, onCreate, excluded }: {
  id: string;
  label: string;
  value: ItemRow | null;
  onChange: (item: ItemRow | null) => void;
  filter?: (item: ItemRow) => boolean;
  offline?: boolean;
  /** «أضف «س» الآن» لمّا البحث لا يجد شيئاً: يأخذ ما كُتب فلا يُكتب الاسم مرّتين. */
  onCreate?: (name: string) => void;
  /** جملة تقول لماذا لا تصلح المواد الموجودة هنا وأين مكانها (الشاشة تعرف سياقها: مخزن الورقة ونوعها). */
  excluded?: (items: readonly ItemRow[]) => string;
}) {
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text.trim());
  const [found, setFound] = useState<{ query: string; all: ItemRow[]; error: unknown } | null>(null);
  useEffect(() => {
    if (!deferred || offline) return;
    let cancelled = false;
    const owner = seenOwner();
    inventory.listItems({ search: deferred }).then(
      (page) => {
        rememberItems(page.rows, owner);
        if (!cancelled) setFound({ query: deferred, all: page.rows.filter((row) => !row.archived), error: null });
      },
      (error: unknown) => {
        if (!cancelled) setFound({ query: deferred, all: [], error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [deferred, offline]);
  // جاهز = الجواب لهذا البحث بالضبط وصل (أو بلا نت فالمحفوظ جاهز دائماً): «لا مادّة» ما تنعرض والطلب طائر.
  const ready = offline || (found !== null && found.query === deferred);
  const all = offline ? seenItemsMatching(deferred) : ready && found ? found.all : [];
  const rows = filter ? all.filter((row) => filter(row)) : all;
  const failed = !offline && found && found.query === deferred && found.error ? describeError(found.error, 'read') : null;
  if (value) {
    return (
      <Field id={id} label={label}>
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2">
          <span className="font-medium">{value.name}</span>
          <Button variant="ghost" onClick={() => onChange(null)} data-action="change-item">
            {t('stock.item.change', 'غيّر')}
          </Button>
        </div>
      </Field>
    );
  }
  return (
    <Field id={id} label={label} error={failed ? failed.title : null} hint={offline ? t('stock.item.hint_offline', 'بلا اتصال: من المواد التي ظهرت في هذه الجلسة.') : t('stock.item.hint', 'اكتب الاسم أو امسح الرمز.')}>
      <input
        id={id}
        className="input"
        value={text}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && rows.length === 1 && rows[0]) {
            event.preventDefault();
            onChange(rows[0]);
            setText('');
          }
        }}
        data-action="search-item"
      />
      {rows.length > 0 ? (
        <ul className="mt-1 flex max-h-56 flex-col overflow-auto rounded-2xl border border-line bg-surface-1">
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" className="w-full px-3 py-3 text-start hover:bg-surface-2" onClick={() => onChange(row)} data-action="pick-item">
                {row.name}
              </button>
            </li>
          ))}
        </ul>
      ) : deferred && ready && !failed ? (
        <div className="mt-2 flex flex-col gap-2">
          {all.length > 0 ? (
            <Notice tone="warning" title={t('stock.item.not_here', 'موجودة، لكنّها لا تصلح في هذه الورقة')}>
              {excluded ? excluded(all) : t('stock.item.not_here.detail', 'نوع هذه المادّة لا يُقبل في هذا المخزن.')}
            </Notice>
          ) : (
            <Notice tone="info" title={t('stock.item.none', 'لا مادّة باسم «{name}»', { name: deferred })}>
              {onCreate ? t('stock.item.none.add', 'راجع الاسم، أو أضفها الآن بالزرّ أدناه.') : t('stock.item.none.detail', 'راجع الاسم، أو أضفها من «المخزن» ثم «المواد».')}
            </Notice>
          )}
          {onCreate && all.length === 0 ? (
            <Button variant="secondary" onClick={() => onCreate(deferred)} data-action="new-item">
              <Plus aria-hidden="true" className="size-4" />
              {t('stock.item.create', 'أضف «{name}» الآن', { name: deferred })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Field>
  );
}

/** «{shown} من المجموع {total}» تحت قائمة بصفحات (العدد من الخادم بأوّل صفحة)، و«المزيد» لمّا بعد صفحة. */
export function PageFooter({ shown, total, next, busy, error, what, onMore, action }: { shown: number; total: number | null; next: boolean; busy: boolean; error: unknown; what: string; onMore: () => void; action: string }) {
  return (
    <>
      <p className="text-sm text-ink-muted">{t('stock.card.shown', '{shown} من المجموع {total}', { shown: fmtInt(shown), total: fmtInt(total ?? shown) })}</p>
      {next ? (
        <Button variant="secondary" busy={busy} onClick={onMore} data-action={action}>
          {t('stock.board.more', 'المزيد')}
        </Button>
      ) : null}
      {error ? <LoadFailed what={what} error={error} onRetry={onMore} /> : null}
    </>
  );
}

/**
 * قائمة مستندات بصفحات (FOUNDATION ١٩٨): الأولى بعددها الكلّي، و«المزيد» بمؤشّر آخر صفّ؛ مستند تكرّر بين صفحتين (انكتب بينهما)
 * ينعرض مرّة. كانت تقف عند 100 بلا «المزيد» (مراجعة WP4 الثانية).
 */
export function useDocPages(kind: inventory.StockDocKind) {
  const load = useCallback(() => inventory.listStockDocs(kind), [kind]);
  const first = useLoad(load);
  const [pages, setPages] = useState<inventory.DocPage[]>([]);
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  // جيل القائمة: صفحة «المزيد» بمؤشّر من قبل reload تنرمى (كانت تنلصق بعد الصفحة الأولى الجديدة فتنقفز صفوف).
  const generation = useRef(0);
  const all = first.data ? [first.data, ...pages] : [];
  const seen = new Set<string>();
  const rows = all.flatMap((page) => page.rows).filter((doc) => (seen.has(doc.id) ? false : (seen.add(doc.id), true)));
  const next = all.at(-1)?.next ?? null;
  // من جديد بأوّل صفحة (بعد رفع أو تغيير): الصفحات المحمّلة تنشال.
  const reload = () => {
    generation.current += 1;
    setPages([]);
    setMore({ busy: false, error: null });
    first.retry();
  };
  const loadMore = () => {
    if (!next) return;
    const asked = generation.current;
    setMore({ busy: true, error: null });
    inventory.listStockDocs(kind, next).then(
      (page) => {
        if (asked !== generation.current) return;
        setPages((current) => [...current, page]);
        setMore({ busy: false, error: null });
      },
      (error: unknown) => {
        if (asked === generation.current) setMore({ busy: false, error });
      },
    );
  };
  return { first, rows, next, total: first.data?.total ?? null, more, loadMore, reload };
}

// ─── المحاولة بمرجع ثابت (FOUNDATION ٥١٩، §2.2) ─────────────────────────────────────────────────────────────────
// «ما نعرف شنو صار» تحتفظ بالمرجع، والإعادة تسأل الخادم بيه؛ الرفض الأكيد مرجع جديد؛ ref_reused = سُجّلت من محاولة سابقة.
const refs = new Map<string, StockRef>();

export function stockRef(slot: string): StockRef {
  const kept = refs.get(slot);
  if (kept) return kept;
  const fresh = inventory.newStockRef();
  refs.set(slot, fresh);
  return fresh;
}

/**
 * معرّف مسوّدة جديدة يولد بالجهاز لقيم نموذجها: نفس القيم ترجّع نفس المعرّف (الإعادة بعد جواب ضاع 23505 = انكتبت فتنفتح)، وقيم ثانية
 * معرّف ثاني (مسوّدة ضاع جوابها ما تنفتح بقيم غير قيمها). والمراجعة الثالثة لـWP5: المعرّف كان يتجدّد بكل تغيير، فتبديل حقل ورجوعه
 * بعد جواب ضاع يولّد مسوّدة ثانية بنفس القيم. forget للرفض الأكيد (المحاولة الجاية بمعرّف جديد).
 */
export function useDraftIds(): { idFor: (values: string) => string; forget: (values: string) => void } {
  const ids = useRef(new Map<string, string>());
  return useMemo(
    () => ({
      idFor: (values) => {
        const known = ids.current.get(values);
        if (known) return known;
        const fresh = crypto.randomUUID();
        ids.current.set(values, fresh);
        return fresh;
      },
      forget: (values) => {
        ids.current.delete(values);
      },
    }),
    [],
  );
}

export type RunOutcome<R> = { kind: 'done'; result: R } | { kind: 'recorded' } | { kind: 'failed'; error: unknown };

export async function runWithRef<R>(slot: string, post: (ref: StockRef) => Promise<R>): Promise<RunOutcome<R>> {
  const ref = stockRef(slot);
  try {
    const result = await post(ref);
    refs.delete(slot);
    return { kind: 'done', result };
  } catch (error) {
    if (error instanceof RejectedError) {
      refs.delete(slot);
      if (error.code === 'ref_reused') return { kind: 'recorded' };
    } else if (!(error instanceof UnknownOutcomeError)) refs.delete(slot);
    return { kind: 'failed', error };
  }
}

// ─── الإلغاء باختيار ونسخة للتصحيح (قرار المالك 2026-10-31، 0011) ─────────────────────────────────────────────────
// إلغاء مستند محفوظ نهائياً من الأنواع الستّة يعرض خيارين: «ألغِ وافتح نسخة للتصحيح» (الإلغاء، ثم copy_doc_to_draft بمعرّف يولد بالجهاز،
// ثم الورقة الجديدة) أو «ألغِ كلّه». لا حذف: الأصل يبقى ظاهراً «ملغى». فشل النسخ بعد إلغاء ناجح يبقى على صفحة الأصل ويّا «افتح نسخة
// للتصحيح»، وهو نفسه زرّ كل مستند ملغى لمن ينشئ ورقة نوعه.

export type VoidChoice = 'copy' | 'all';

const DOC_PATHS: Readonly<Record<inventory.DraftKind, string>> = {
  receipt: '/inventory/receipts',
  supplier_return: '/inventory/supplier-returns',
  transfer: '/inventory/transfers',
  stock_use: '/inventory/uses',
  count: '/inventory/counts',
  opening: '/inventory/openings',
};

/** فعل إنشاء ورقة النوع (مرآة require بالخادم، والحكم إله): النسخة بنفس صلاحيته. */
const DRAFT_ACTIONS: Readonly<Record<inventory.DraftKind, Action>> = {
  receipt: 'receipt.draft',
  supplier_return: 'receipt.draft',
  transfer: 'transfer.post',
  stock_use: 'stock_use.post',
  count: 'count.enter',
  opening: 'opening.post',
};

/** صفحة مستند من الأنواع الستّة. */
export function docPath(kind: inventory.DraftKind, id: string): string {
  return `${DOC_PATHS[kind]}/${id}`;
}

/** يقدر يفتح نسخة للتصحيح: صلاحية إنشاء ورقة النوع، وبنطاقه مخزن الورقة إن عُرف (مرآة in_scope_wh، والحكم بالخادم). */
export function canCopyDraft(workspace: Workspace | null, kind: inventory.DraftKind, store?: Pick<StoreRef, 'id' | 'siteId' | 'divisionId'> | null): boolean {
  if (!workspace || !can(workspace.role, DRAFT_ACTIONS[kind])) return false;
  return !store || inScope(workspace.role, workspace.scopes, { warehouseId: store.id, siteId: store.siteId, divisionId: store.divisionId });
}

/** ما لم يُنسخ وسببه (عقد 0011، سلامة المال بـDECISIONS 2026-10-31): رمز ما ينعرف ينذكر برمزه، ما يسكت. */
export function skippedLines(kind: inventory.DraftKind, codes: readonly string[]): string[] {
  return codes.map((code) => {
    if (code === 'amounts') {
      return kind === 'supplier_return'
        ? t('copy.skipped.credits', 'المبلغ الذي يقبله المورّد: لا يظهر لدورك فلم يُنسخ، ويكتبه المحاسب أو المدير.')
        : t('copy.skipped.amounts', 'المبالغ (مبالغ السطور والخصم والتحميلات): لا تظهر لدورك فلم تُنسخ، ويكتبها المحاسب أو المدير.');
    }
    if (code === 'paid_now') return t('copy.skipped.paid_now', 'المدفوع للمورّد عند الاستلام: بقي مبلغاً على المورّد بعد إلغاء الأصل، فلا يُدفع مرّة ثانية.');
    if (code === 'box_charge') return t('copy.skipped.box_charge', 'التحميلات المدفوعة من صندوق: بقيت مصروفاً بعد إلغاء الأصل، فلا تُدفع مرّة ثانية.');
    if (code === 'approval') {
      return kind === 'count'
        ? t('copy.skipped.review', 'مراجعة المدير (أسباب الفروق وكلف الزيادة): كانت للجرد الملغى، فيراجعه المدير من جديد بعد التسليم.')
        : t('copy.skipped.approval', 'موافقة المدير على المنتهي: كانت للورقة الملغاة، فتُطلب من جديد عند الحفظ.');
    }
    if (code === 'unit_changed') return t('copy.skipped.unit_changed', 'وحدة تعبئة تغيّرت منذ الأصل: نُسخ سطرها بالكمية نفسها بالكيلوغرام أو اللتر أو القطعة، فراجعه.');
    return t('copy.skipped.other', 'بند لم يُنسخ (الرمز: {code}).', { code });
  });
}

// النسخ بمرجع ومعرّف ثابتين لحد ما تنعرف النتيجة (FOUNDATION ٥١٩): «ما نعرف شنو صار» تحتفظ بالاثنين والإعادة ترجّع نفس الورقة؛ النجاح
// والرفض الأكيد ينسونهم (النسخة الجاية ورقة جديدة، مو ورقة انحذفت). والنسخة اللي انفتحت تنحفظ للجلسة: صفحة الأصل تدلّ عليها بدل ما
// تنفتح ثانية بالغلط (ورقتان من أصل واحد تنحفظان نهائياً مرّتين). كلاهما لصاحب الجلسة ومنشأته (seenOwner).
const copies = new Map<string, { ref: StockRef; newId: string }>();
const opened = new Map<string, string>();
const copySlot = (kind: inventory.DraftKind, sourceId: string): string => `${seenOwner()}|${kind}:${sourceId}`;

export async function runCopy(kind: inventory.DraftKind, sourceId: string): Promise<RunOutcome<inventory.CopiedDraft>> {
  const slot = copySlot(kind, sourceId);
  const kept = copies.get(slot) ?? { ref: inventory.newStockRef(), newId: crypto.randomUUID() };
  copies.set(slot, kept);
  try {
    const result = await inventory.copyDocToDraft(kept.ref, kind, sourceId, kept.newId);
    copies.delete(slot);
    opened.set(slot, result.id);
    return { kind: 'done', result };
  } catch (error) {
    if (!(error instanceof UnknownOutcomeError)) copies.delete(slot);
    return { kind: 'failed', error };
  }
}

/** ما تحمله الورقة الجديدة بالانتقال إليها: الأصل (نوعه ومعرّفه واسمه) وما لم يُنسخ. */
interface CopiedState {
  copied: { kind: inventory.DraftKind; id: string; from: string; skipped: string[] };
}

function copiedOf(state: unknown): CopiedState['copied'] | null {
  if (typeof state !== 'object' || state === null || !('copied' in state)) return null;
  const copied = (state as CopiedState).copied;
  return typeof copied?.id === 'string' && Array.isArray(copied.skipped) ? copied : null;
}

export interface CopyDraft {
  busy: boolean;
  failure: unknown;
  /** صفحة نسخة انفتحت من هذا الأصل بهذه الجلسة، أو null. */
  openedPath: string | null;
  /** from: اسم الأصل للتنبيه بالورقة الجديدة («الاستلام PU-2026-0042»). true = انفتحت الورقة. */
  copy: (from: string) => Promise<boolean>;
}

/** نسخة للتصحيح من مستند ملغى: النداء ثم الانتقال للورقة الجديدة بما لم يُنسخ؛ الفشل يبقى بالحالة (والصفحة تعرضه). */
export function useCopyDraft(kind: inventory.DraftKind, sourceId: string): CopyDraft {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // تنقرا لحظة فتح الصفحة: النسخة تنفتح بالانتقال لصفحتها، والرجوع للأصل يفتحه من جديد.
  const [openedId] = useState(() => opened.get(copySlot(kind, sourceId)) ?? null);
  const copy = async (from: string): Promise<boolean> => {
    setBusy(true);
    setFailure(null);
    const outcome = await runCopy(kind, sourceId);
    setBusy(false);
    if (outcome.kind !== 'done') {
      setFailure(outcome.kind === 'failed' ? outcome.error : null);
      return false;
    }
    const state: CopiedState = { copied: { kind, id: sourceId, from, skipped: outcome.result.skipped } };
    navigate(docPath(outcome.result.kind, outcome.result.id), { state });
    return true;
  };
  return { busy, failure, openedPath: openedId ? docPath(kind, openedId) : null, copy };
}

/**
 * ما بعد النسخة لدور الداخل (المراجعة FE-3): من يحفظ الورقة نهائياً بهذا النوع (مرآة require بدوالّ الحفظ، والحكم بالخادم)، فالجملة ما
 * تأمر بشي ما يقدره: الاستلام والمرتجع للمحاسب أو المدير (receipt.amounts)، والإتلاف للمدير (expired.destroy)، والجرد يُسلَّم للمراجعة
 * ويحفظه المدير (count.approve)؛ والتحويل والصرف والرصيد عند البداية يحفظها من ينسخها (فعل النسخة هو فعل الحفظ).
 */
export function copyNext(workspace: Workspace | null, kind: inventory.DraftKind, destroy = false): string {
  const may = (action: Action) => (workspace ? can(workspace.role, action) : false);
  if (kind === 'count') {
    return may('count.approve') ? t('copy.next.count_approve', 'صحّحها ثم سلّمها وراجعها واحفظها نهائياً برقم جديد.') : t('copy.next.count', 'صحّحها ثم سلّمها للمراجعة؛ يحفظها المدير نهائياً برقم جديد.');
  }
  if ((kind === 'receipt' || kind === 'supplier_return') && !may('receipt.amounts')) return t('copy.next.pricer', 'صحّحها؛ يحفظها المحاسب أو المدير نهائياً برقم جديد.');
  if (kind === 'stock_use' && destroy && !may('expired.destroy')) return t('copy.next.manager', 'صحّحها؛ يحفظها المدير نهائياً برقم جديد.');
  return t('copy.next.save', 'صحّحها ثم احفظها نهائياً برقم جديد.');
}

/** «افتح نسخة للتصحيح» على مستند ملغى، وفشل النسخ (بعد الإلغاء أو من الزرّ) بسببه. next: ما بعد النسخة لدور الداخل (copyNext). */
export function CopyDraftAction({ copier, from, next }: { copier: CopyDraft; from: string; next: string }) {
  const failed = copier.failure ? describeError(copier.failure) : null;
  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <Notice tone="danger" title={t('copy.failed', 'لم تُفتح نسخة للتصحيح: {reason}', { reason: failed.title })}>
          {failed.detail}
        </Notice>
      ) : null}
      {copier.openedPath ? (
        <Notice
          tone="info"
          title={t('copy.opened', 'فُتحت من هذه الورقة نسخة للتصحيح في هذه الجلسة؛ افتحها بدل نسخة ثانية.')}
          action={
            <Link to={copier.openedPath} className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="open-copy">
              {t('copy.opened.open', 'افتح النسخة')}
            </Link>
          }
        />
      ) : null}
      <div>
        <Button variant="secondary" busy={copier.busy} onClick={() => void copier.copy(from)} data-action="copy-to-draft">
          {copier.openedPath ? t('copy.open.another', 'افتح نسخة أخرى للتصحيح') : t('copy.open', 'افتح نسخة للتصحيح')}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">{t('copy.open.hint', 'تنفتح ورقة جديدة غير محفوظة بنفس السطور وتبقى هذه ملغاة. {next}', { next })}</p>
    </div>
  );
}

/**
 * أصل ورقة منسوخة محفوظ بالخادم (الاستلام: copied_from، المراجعة FE-2): من يفتح الورقة بعدين (من القائمة أو برابطها أو بعد إعادة
 * التحميل، بلا حالة الانتقال) يعرف إنها نسخة ومن أيّ أصل، وskipped ما يخصّ دوره (رمزا المال لأدوار الكلفة بس).
 */
export interface CopyOrigin {
  kind: inventory.DraftKind;
  id: string;
  from: string;
  skipped: readonly string[];
}

/**
 * تنبيه الورقة الجديدة المنسوخة: من أيّ أصل، وما لم يُنسخ وسببه، ورابط الأصل الملغى، وما بعدها لدور الداخل (next). بالورقة غير المحفوظة
 * بس. المصدر حالة الانتقال (اللي نسخ للتوّ: كل ما لم يُنسخ) أو الأصل المحفوظ (origin)، وما لم يُنسخ اتّحادهما بترتيب العقد. «ملغى» قبل
 * اسم الأصل (المراجعة FE-4: «الرصيد عند البداية لـ«المخزن العام» الملغى» كان يُقرأ صفة للمخزن).
 */
export function CopiedNotice({ draft, next, origin = null }: { draft: boolean; next: string; origin?: CopyOrigin | null }) {
  const location = useLocation();
  const copied = copiedOf(location.state);
  const source = copied ?? origin;
  if (!source || !draft) return null;
  const skipped = skippedLines(source.kind, inventory.orderSkipped([...(copied?.skipped ?? []), ...(origin?.skipped ?? [])]));
  return (
    <Notice
      tone={skipped.length > 0 ? 'warning' : 'info'}
      title={t('copy.notice', 'نسخة للتصحيح من مستند ملغى: {from}. {next}', { from: source.from, next })}
      action={
        <Link to={docPath(source.kind, source.id)} className="text-sm font-medium text-brand-700 dark:text-brand-200" data-action="open-original">
          {t('copy.original', 'الأصل الملغى')}
        </Link>
      }
    >
      {skipped.length > 0 ? (
        <>
          <p>{t('copy.skipped.title', 'لم يُنسخ إلى هذه الورقة:')}</p>
          <ul className="list-disc ps-6">
            {skipped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Notice>
  );
}

/**
 * تاريخ الورقة غير المحفوظة يتصحّح بمكانه (المراجعة FE-1): نسخة من مستند قديم تحمل تاريخه، وتاريخ أقدم من 7 أيام (أو بفترة مقفلة) ما
 * ينحفظ نهائياً، وصفحات الأوراق كانت بلا حقل تاريخ. القيمة بـpostingDay (اليوم أو قبله حتى 7 أيام، القرار 9)، والحفظ بدالّة النوع
 * (update*Draft بشرط النسخة)، والحكم بالخادم. المكتوب يتبع التاريخ المحفوظ يوم بدأ تعديله: قراءة جديدة بتاريخ ثاني ترجّع الحقل له.
 */
export function DraftDayField({ day, save, onSaved }: { day: string; save: (day: Day) => Promise<unknown>; onSaved: () => void }) {
  const id = useId();
  const [edit, setEdit] = useState<{ base: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const text = edit && edit.base === day ? edit.text : fmtDay(day);
  const parsed = postingDay(text);
  const outside = postingDay(fmtDay(day)).error !== null;
  const changed = parsed.day !== null && parsed.day !== day;
  const failed = failure ? describeError(failure) : null;
  const submit = () => {
    if (!parsed.day || busy) return;
    setBusy(true);
    setFailure(null);
    save(parsed.day)
      .then(() => {
        setEdit(null);
        onSaved();
      }, setFailure)
      .finally(() => setBusy(false));
  };
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label={t('draft.day.section', 'تاريخ الورقة')}>
      {outside ? (
        <Notice tone="warning" title={t('draft.day.outside', 'تاريخ هذه الورقة {day} خارج المسموح للحفظ النهائي (اليوم أو قبله حتى 7 أيام)؛ صحّحه هنا.', { day: fmtDay(day) })} />
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={text} onChange={(value) => setEdit({ base: day, text: value })} error={text.trim() !== '' ? parsed.error : null} hint={t('payment.day.hint', 'اليوم أو قبله حتى 7 أيام.')} />
        </div>
        <Button variant="secondary" busy={busy} disabled={!changed} onClick={submit} data-action="save-draft-day">
          {t('draft.day.save', 'احفظ التاريخ')}
        </Button>
      </div>
      {failed ? (
        <Notice tone="danger" title={failed.title}>
          {failed.detail}
        </Notice>
      ) : null}
    </section>
  );
}

const VOID_CHOICES: readonly VoidChoice[] = ['copy', 'all'];

/**
 * نافذة الإلغاء: الجملة تسمّي المستند ونتيجته، والسبب إلزامي (void_reason). choose (الأنواع الستّة، كلمة المالك 2026-10-31): خياران
 * والزرّ يسمّي المختار، ولا اختيار مسبق حتى يُقرأ الاثنان؛ بلاه (تصحيح السعر) الزرّ يسمّي المستند.
 */
export function VoidDocDialog({ title, consequence, busy, failure, onConfirm, onClose, choose = false }: { title: string; consequence: string; busy: boolean; failure: unknown; onConfirm: (reason: string, choice: VoidChoice) => void; onClose: () => void; choose?: boolean }) {
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState<VoidChoice | null>(choose ? null : 'all');
  const id = useId();
  const failed = failure ? describeError(failure) : null;
  const label = (value: VoidChoice) => (value === 'copy' ? t('void.choice.copy', 'ألغِ وافتح نسخة للتصحيح') : t('void.choice.all', 'ألغِ كلّه'));
  const detail = (value: VoidChoice) =>
    value === 'copy'
      ? t('void.choice.copy.detail', 'تنعكس حركات الورقة كلّها، وتنفتح ورقة جديدة غير محفوظة بنفس السطور تصحّحها ثم تحفظها نهائياً برقم جديد.')
      : t('void.choice.all.detail', 'تنعكس حركات الورقة كلّها، ولا تنفتح ورقة جديدة.');
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      dirty={reason.trim() !== '' || (choose && choice !== null)}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button variant="danger" busy={busy} disabled={reason.trim() === '' || choice === null} onClick={() => choice && onConfirm(reason.trim(), choice)} data-action="confirm-void">
            {choose && choice ? label(choice) : title}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink-muted">{consequence}</p>
        {choose ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 font-medium">{t('void.choice.legend', 'ماذا تريد؟')}</legend>
            {VOID_CHOICES.map((value) => (
              <label key={value} className={`flex items-start gap-3 rounded-2xl border p-3 ${choice === value ? 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/15' : 'border-line'}`}>
                <input type="radio" name={`${id}-choice`} className="mt-1 size-5 shrink-0 accent-brand-600" checked={choice === value} disabled={busy} onChange={() => setChoice(value)} data-action={`void-choice-${value}`} />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{label(value)}</span>
                  <span className="text-sm text-ink-muted">{detail(value)}</span>
                </span>
              </label>
            ))}
            <p className="text-sm text-ink-muted">{t('void.choice.keep', 'في الحالتين تبقى هذه الورقة ظاهرة «ملغى» ولا يُحذف شيء.')}</p>
          </fieldset>
        ) : null}
        <Field id="stock-void-reason" label={t('stock.void.reason', 'سبب الإلغاء')}>
          <input id="stock-void-reason" className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} data-autofocus />
        </Field>
        {failed ? (
          <Notice tone="danger" title={failed.title}>
            {failed.detail}
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}

/** معامل الواحد بستّ مراتب: وحدة بهذا المعامل لمادّة معدودة هي اسم وحدة عدّها («قنينة»). */
const ONE = 1_000_000n;

/**
 * اسم وحدة العدّ للمادّة المعدودة (كلمة المالك 2026-10-31): وحدة فعّالة معاملها واحد («قنينة»، «ظرف») تحلّ محلّ «قطعة» بالإدخال
 * والعرض («12 قنينة»)، أو null. البيانات نفسها بلا تغيير: الأساس قطعة، والاسم صفّ item_units بمعامل 1.
 */
export function countName(item: Pick<ItemRow, 'baseUnit'>, packs: readonly inventory.ItemUnitRow[] | null | undefined): string | null {
  if (item.baseUnit !== 'pc' || !packs) return null;
  return packs.find((pack) => !pack.archived && pack.factor === ONE)?.label ?? null;
}

/** اسم الوحدة لرأس عمود أو بجانب رقم: اسم وحدة العدّ إن وُجد، وإلا كغم أو لتر أو قطعة. */
export function unitName(baseUnit: BaseUnit, name: string | null): string {
  return name ?? baseUnitLabel(baseUnit);
}

/** طريقة عدّ المادّة بكلمات المالك. */
export function countingLabel(unit: BaseUnit): string {
  if (unit === 'kg') return t('items.count.kg', 'بالوزن (كيلوغرام)');
  if (unit === 'L') return t('items.count.L', 'بالحجم (لتر)');
  return t('items.count.pc', 'بالعدد');
}

/** اسم وحدة عامّة على السطر (unit_code): الطن والغرام والملل. */
export function codeUnitLabel(code: string | null): string | null {
  if (code === 't') return t('unit.t', 'طن');
  if (code === 'g') return t('unit.g', 'غرام');
  if (code === 'mL') return t('unit.mL', 'ملل');
  return null;
}

/**
 * وحدات الإدخال: وحدة الأساس (أو اسم وحدة العدّ)، والطن والغرام للكيلو، والملل للتر (وحدات عامّة بجدول units)، ووحدات تعبئة
 * المادّة (المعامل لقطة على السطر، E7).
 */
export function unitOptions(item: Pick<ItemRow, 'baseUnit'>, packs: readonly inventory.ItemUnitRow[]): QtyUnitOption[] {
  const name = countName(item, packs);
  const out: QtyUnitOption[] = [{ id: 'base', label: unitName(item.baseUnit, name), factor: { units: 1n, scale: 0 }, ...(name ? { piece: true } : {}) }];
  if (item.baseUnit === 'kg') {
    out.push({ id: 'code:t', label: t('unit.t', 'طن'), factor: { units: 1000n, scale: 0 } });
    out.push({ id: 'code:g', label: t('unit.g', 'غرام'), factor: { units: 1n, scale: 3 } });
  }
  if (item.baseUnit === 'L') out.push({ id: 'code:mL', label: t('unit.mL', 'ملل'), factor: { units: 1n, scale: 3 } });
  for (const pack of packs.filter((p) => !p.archived && !(name !== null && p.factor === ONE))) out.push({ id: pack.id, label: pack.label, factor: { units: pack.factor, scale: 6 } });
  return out;
}

// ─── «اشترِ كمية» (كلمة المالك 2026-11-04) ─────────────────────────────────────────────────────────────────────────
// «اني اشتريت ذرة اليوم وبعد اسبوع اشتريت ذرة بغير حساب ما اكدر اكول اني اشتريت ذرة بهاي الطريقة»: المادّة تُضاف مرّة
// واحدة، وكلّ شراء جديد ورقة استلام. الرابط يفتح صفحة الاستلام بنموذج «استلام جديد» معبّأ بالمخزن، وبعد إنشاء المسوّدة (بمعرّف
// الجهاز، الطريق نفسه) تنفتح الورقة وسطرها بالمادّة.

/** ‎/inventory/receipts?new=1&wh=<المخزن>&item=<المادّة>؛ بلا مخزن يُختار المخزن بالنموذج. */
export function buyPath(itemId: string, warehouseId: string | null): string {
  const params = new URLSearchParams({ new: '1' });
  if (warehouseId) params.set('wh', warehouseId);
  params.set('item', itemId);
  return `/inventory/receipts?${params.toString()}`;
}

/** زرّ «اشترِ كمية» رابطاً (فيُفتح بتبويب آخر أيضاً)؛ primary للفعل الأوّل بالنافذة، والصغير لصفوف القوائم. */
export function BuyLink({ itemId, warehouseId, label, primary = false }: { itemId: string; warehouseId: string | null; label?: string; primary?: boolean }) {
  return (
    <Link
      to={buyPath(itemId, warehouseId)}
      className={
        primary
          ? 'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 font-semibold text-white shadow-soft hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400'
          : 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2'
      }
      data-action="buy-item"
    >
      <PackagePlus aria-hidden="true" className="size-4" />
      {label ?? t('buy.action', 'اشترِ كمية')}
    </Link>
  );
}

// ─── رأس قسم المخزون: روابطه وموافقاته (تجربة الاستخدام 2026-11-02) ───────────────────────────────────────────────
// بطاقات المخازن صارت صفحة /inventory، واللوحة بالوحدة بقيت بمسارها، فالروابط والموافقات المنتظرة بمكان واحد لهما.

/** روابط قسم المخزون بأولوية الدور (نفس شروط صلاحياتها بالخادم، والحكم إله). */
export function InventoryLinks({ role }: { role: Role | undefined }) {
  const links: { to: string; icon: LucideIcon; label: string; action: string }[] = [];
  if (role && (can(role, 'receipt.draft') || can(role, 'receipt.amounts'))) links.push({ to: '/inventory/receipts', icon: PackagePlus, label: t('stock.receipts', 'الاستلام من المورّدين'), action: 'open-receipts' });
  if (role && can(role, 'transfer.post')) links.push({ to: '/inventory/transfers', icon: ArrowLeftRight, label: t('stock.transfers', 'التحويلات'), action: 'open-transfers' });
  if (role && can(role, 'stock_use.post')) links.push({ to: '/inventory/uses', icon: PackageMinus, label: t('stock.uses', 'الصرف والإتلاف'), action: 'open-uses' });
  if (role && can(role, 'count.enter')) links.push({ to: '/inventory/counts', icon: ClipboardCheck, label: t('stock.counts', 'الجرد'), action: 'open-counts' });
  if (role && can(role, 'opening.post')) links.push({ to: '/inventory/openings', icon: ClipboardList, label: t('stock.openings', 'الرصيد عند البداية'), action: 'open-openings' });
  links.push({ to: '/inventory/items', icon: Boxes, label: t('items.title', 'المواد'), action: 'open-items' });
  // كلمة المالك 2026-11-04: المخازن والمواقع وأحجام التعبئة والتصنيفات يتحكّم بها من داخل تبويب المخزن، مو من داخل
  // الإعدادات؛ فالرابط هنا لـ/inventory/setup (ومن يملك stores.manage وحده، مثل شرط الخادم)، ومحلّ «إعدادات المنشأة»
  // (يوم التشغيل وفئات المصاريف) بقي بشاشة الإعدادات.
  // بلا شرط دور، مثل رابط إعدادات المنشأة قبله: الصفحة نفسها تحكم (أزرار الكتابة بـstores.manage،
  // و«للقراءة فقط» لغيره)؛ والأمين والمحاسب يقرأان أحجام التعبئة والتصنيفات التي يختاران منها (مراجعة 2026-11-04).
  links.push({ to: '/inventory/setup', icon: Building2, label: t('stores.setup.title', 'إعداد المخزن'), action: 'open-store-setup' });
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t('stock.board.links', 'روابط المخزون')}>
      {links.map(({ to, icon: Icon, label, action }) => (
        <Link key={action} to={to} className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-surface-2" data-action={action}>
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** «بانتظار موافقة المدير» (Q5، E53) لمن يقدر يوافق: الخادم يرجّعها له بس، وفشلها ما يوقف الصفحة. */
export function PendingApprovals({ role }: { role: Role | undefined }) {
  const approvals = useLoad(counts.loadApprovals, role ?? '');
  const pending = approvals.data;
  return (
    <>
      {pending && (pending.counts > 0 || pending.uses > 0) ? (
        <Notice tone="warning" title={t('stock.approvals', 'بانتظار موافقة المدير')}>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {pending.counts > 0 ? (
              <Link to="/inventory/counts" className="font-medium text-brand-700 dark:text-brand-200" data-action="open-pending-counts">
                {t('stock.approvals.counts', 'جرود للمراجعة: {n}', { n: fmtInt(pending.counts) })}
              </Link>
            ) : null}
            {pending.uses > 0 ? (
              <Link to="/inventory/uses?awaiting=1" className="font-medium text-brand-700 dark:text-brand-200" data-action="open-pending-uses">
                {t('stock.approvals.uses', 'صرف وإتلاف بانتظارك: {n}', { n: fmtInt(pending.uses) })}
              </Link>
            ) : null}
          </span>
        </Notice>
      ) : null}
      {approvals.error ? <LoadFailed what={t('stock.approvals.what', 'الموافقات المنتظرة')} error={approvals.error} onRetry={approvals.retry} /> : null}
    </>
  );
}
