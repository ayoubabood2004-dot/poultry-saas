import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Field } from '../../components/ui/Field';
import type { QtyUnitOption } from '../../components/ui/QtyInput';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Num, type Column } from '../../components/ui/DataTable';
import type { DivisionKind } from '../../domain/divisions';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { inScope } from '../../domain/scope';
import type { Workspace } from '../../domain/workspace';
import { normalizeCode, searchable } from '../../domain/normalize';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtInt, fmtQtyCell, columnDecimals } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as inventory from '../../lib/repo/inventory';
import { sessionStore } from '../../lib/session';
import type { DocStatus, ItemRow, OrgSetup, StockRef, WarehouseRow } from '../../lib/repo/inventory';
import { divisionLabel } from '../../lib/roles';
import { baseUnitLabel, warehouseKindLabel } from '../../lib/storeLabels';
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
      return t('stock.doc.draft', 'مسوّدة');
    case 'posted':
      return t('stock.doc.posted', 'مرحَّل');
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

/** منتقي المادّة: البحث بالاسم المطبَّع والرمز، وEnter بعد رمز ماسح يختار المطابقة الوحيدة (E54). بلا نت (offline) بالمحفوظ. */
export function ItemPicker({ id, label, value, onChange, filter, offline = false }: { id: string; label: string; value: ItemRow | null; onChange: (item: ItemRow | null) => void; filter?: (item: ItemRow) => boolean; offline?: boolean }) {
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text.trim());
  const [found, setFound] = useState<{ query: string; rows: ItemRow[]; error: unknown } | null>(null);
  useEffect(() => {
    if (!deferred || offline) return;
    let cancelled = false;
    const owner = seenOwner();
    inventory.listItems({ search: deferred }).then(
      (page) => {
        rememberItems(page.rows, owner);
        if (!cancelled) setFound({ query: deferred, rows: page.rows.filter((row) => !row.archived && (!filter || filter(row))), error: null });
      },
      (error: unknown) => {
        if (!cancelled) setFound({ query: deferred, rows: [], error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [deferred, filter, offline]);
  const rows = offline ? seenItemsMatching(deferred).filter((row) => !filter || filter(row)) : found && found.query === deferred ? found.rows : [];
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

/** نافذة الإلغاء: الجملة تسمّي المستند ونتيجته، والسبب إلزامي (void_reason). */
export function VoidDocDialog({ title, consequence, busy, failure, onConfirm, onClose }: { title: string; consequence: string; busy: boolean; failure: unknown; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const failed = failure ? describeError(failure) : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      dirty={reason.trim() !== ''}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button variant="danger" busy={busy} disabled={reason.trim() === ''} onClick={() => onConfirm(reason.trim())} data-action="confirm-void">
            {title}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink-muted">{consequence}</p>
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

/** وحدات الإدخال: وحدة الأساس، والطن للكيلو، ووحدات تعبئة المادّة (المعامل لقطة على السطر، E7). */
export function unitOptions(item: Pick<ItemRow, 'baseUnit'>, packs: readonly inventory.ItemUnitRow[]): QtyUnitOption[] {
  const out: QtyUnitOption[] = [{ id: 'base', label: baseUnitLabel(item.baseUnit), factor: { units: 1n, scale: 0 } }];
  if (item.baseUnit === 'kg') out.push({ id: 'code:t', label: t('unit.t', 'طن'), factor: { units: 1000n, scale: 0 } });
  for (const pack of packs.filter((p) => !p.archived)) out.push({ id: pack.id, label: pack.label, factor: { units: pack.factor, scale: 6 } });
  return out;
}
