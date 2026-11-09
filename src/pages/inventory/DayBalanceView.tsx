import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListPlus, NotebookPen, Plus, Printer, Share2, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { DayField } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { addDays, type Day } from '../../domain/dates';
import { searchable } from '../../domain/normalize';
import { parseDayText } from '../../lib/dayText';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as dayBalance from '../../lib/repo/dayBalance';
import type { CategoryItemsResult, DayBalance, DayCategory, DayNote, DayNoteResult, DayRow, Named } from '../../lib/repo/dayBalance';
import * as inventory from '../../lib/repo/inventory';
import type { ItemPage, ItemRow } from '../../lib/repo/inventory';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { baseQty, itemFilePath } from './simple-shared';

// «الرصيد اليومي» (كلمة المالك 2026-11-09، 0022، بصورة ورقته «رصيد مواد العلف — 4/11/2026»): جدول واحد ليوم واحد وتصنيف واحد مثل ورقته
// (ت | المادّة | الرصيد (كغم) | الملاحظات)، والرصيد = الرصيد الجاري بدفتر المادّة في نهاية ذلك اليوم (day_balance)، والصفر «-» كما في الورقة.
// كلّ ما يختاره المستخدم في الرابط (?view=day&cat=&day=&store=)، فالرجوع والنسخ يعيدان العرض نفسه، ورابط المادّة يحمل ?back= إليه.
// الأيام بسهمين («يحرك بالايام عن طريق سهمين يمين ويسار»): بالعربية السهم الأيمن إلى الخلف («اليوم السابق») والأيسر إلى الأمام، ولا يوم
// بعد اليوم. والتقرير يُطبع أو يُحفظ PDF من المتصفّح (لا مكتبة PDF: تشكيل العربية فيها غير مضمون) ويُشارك نصّاً (واتساب)؛ والطباعة تُخفي
// كلّ ما سوى العنوان والجدول (print:hidden)، ويظهر فيها اسم المنشأة. والتصنيفات وموادّها بترتيبها للمدير (stores.manage)، والملاحظة لكلّ
// مادّة لكلّ يوم لمن يعمل في المخازن (stock_note.write) بشرط ما رآه، فلا يمحو أحدٌ ملاحظة كتبها غيره دون أن يراها.

/** معرّف بالرابط: ما سواه يُهمَل (لا يصل الخادم نصّاً يرفضه بخطأ شكل). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** حدّ الملاحظة بعد القصّ، بالحروف (لا بوحدات UTF-16) كما يعدّها الخادم. */
export const NOTE_MAX = 200;

/**
 * حروف قصّ طرفَي الملاحظة كما في private.note_text بالخادم رقماً برقم (مراجعة 0022 R5): trim() لا يقصّ U+0085 ولا U+200B–U+200F ولا
 * U+202A–U+202E ولا U+2060، فكانت 200 حرف وعلامة اتّجاه بآخرها (لصق من واتساب) تُرفض هنا والخادم يقبلها، وعلامة خفيّة وحدها تُرسل فيقول
 * «مُسحت» ولم يُمسح شيء.
 */
export const NOTE_SPACES: readonly number[] = [
  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207, 8232, 8233,
  8234, 8235, 8236, 8237, 8238, 8239, 8287, 8288, 12288, 65279,
];
const NOTE_SPACE = new Set(NOTE_SPACES);
const isNoteSpace = (char: string | undefined): boolean => char !== undefined && NOTE_SPACE.has(char.codePointAt(0) ?? -1);

/** الملاحظة مقصوصة الطرفين كما يقصّها الخادم (بالحروف لا بوحدات UTF-16). */
export function noteText(value: string): string {
  const chars = [...value];
  let start = 0;
  let end = chars.length;
  while (start < end && isNoteSpace(chars[start])) start += 1;
  while (end > start && isNoteSpace(chars[end - 1])) end -= 1;
  return chars.slice(start, end).join('');
}
/** حدّ موادّ التصنيف الواحد (too_many_items بالخادم). */
export const CATEGORY_MAX = 500;

export interface DayParams {
  /** null: لم يُختر (أوّل تصنيف، وإلّا كلّ المواد)؛ 'all': كلّ المواد؛ وإلّا معرّف التصنيف. */
  cat: string | null;
  /** null: اليوم. */
  day: Day | null;
  /** null: كلّ المخازن. */
  store: string | null;
}

const catOf = (value: string | null): string | null => (value === 'all' || (value !== null && UUID.test(value)) ? value : null);
/** يوم بالتقويم بالرابط (YYYY-MM-DD): بقراءة parseDayText القائمة لا بـisDay، فلا يكبر بها وحدة التواريخ المحفوظة بالتثبيت المسبق. */
const dayOf = (value: string | null): Day | null => (value !== null && parseDayText(value.split('-').reverse().join('/')) === value ? value : null);
const storeOf = (value: string | null): string | null => (value !== null && UUID.test(value) ? value : null);

/** ما في الرابط بعد الفحص: ما لا يصلح (معرّف مكسور، يوم غير موجود) كأنّه غائب. */
export function dayParams(search: URLSearchParams): DayParams {
  return { cat: catOf(search.get('cat')), day: dayOf(search.get('day')), store: storeOf(search.get('store')) };
}

function dayQuery(params: DayParams): URLSearchParams {
  const query = new URLSearchParams({ view: 'day' });
  if (params.cat !== null) query.set('cat', params.cat);
  if (params.day !== null) query.set('day', params.day);
  if (params.store !== null) query.set('store', params.store);
  return query;
}

/** رابط العرض نفسه (طريق الرجوع من ملفّ المادّة، backTarget يقبله). */
export function dayUrl(params: DayParams): string {
  return `/inventory?${dayQuery(params).toString()}`;
}

/** عنوان التقرير: «رصيد مواد العلف» أو «رصيد كلّ المواد». */
export function reportTitle(data: Pick<DayBalance, 'category'>): string {
  return data.category ? t('dayb.title', 'رصيد {name}', { name: data.category.name }) : t('dayb.title.all', 'رصيد كلّ المواد');
}

/** سطر التاريخ (والمخزن إن اختير). */
export function reportDate(data: Pick<DayBalance, 'on' | 'warehouse'>): string {
  return data.warehouse
    ? t('dayb.on.store', 'بتاريخ {day}، في «{store}»', { day: fmtDay(data.on), store: data.warehouse.name })
    : t('dayb.on', 'بتاريخ {day}', { day: fmtDay(data.on) });
}

/** الرصيد نصّاً بوحدته، والصفر «-» كما في ورقة المالك. */
const qtyText = (row: DayRow): string => (row.qty === 0n ? '-' : baseQty(row.qty, row.baseUnit));

/** نصّ المشاركة (واتساب): سطر العنوان، ثمّ «1. ذرة: 69,448 كغم — ملاحظة» لكلّ مادّة. */
export function shareText(data: DayBalance): { title: string; text: string } {
  const title = `${reportTitle(data)} ${reportDate(data)}`;
  const lines = data.rows.map((row, index) => {
    const line = t('dayb.share.row', '{n}. {name}: {qty}', { n: fmtInt(index + 1), name: row.name, qty: qtyText(row) });
    // سطر واحد لكلّ مادّة: سطر جديد داخل الملاحظة يصير فراغاً.
    return row.note ? t('dayb.share.note', '{line} — {note}', { line, note: row.note.text.replace(/\s+/gu, ' ') }) : line;
  });
  return { title, text: [title, ...lines].join('\n') };
}

/** المشاركة بنافذة الجهاز إن وُجدت، وإلّا النسخ. إلغاء المستخدم نافذة المشاركة ليس فشلاً؛ وغيره يجرّب النسخ. */
export async function shareReport(title: string, text: string): Promise<'shared' | 'cancelled' | 'copied'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

/**
 * أعمدة الجدول كورقة المالك: الوحدة في رأس «الرصيد» إن اتّحدت وحدات الموادّ، وإلّا عمود «الوحدة». «المادّة» بسطر واحد وزرّ الملاحظة أوّل
 * خليّتها (أقرب إلى الرصيد): بعرض الهاتف كان العمودان الملفوفان (عرض أدنى 48 لكلّ منهما) يدفعان زرّ الملاحظة خارج الشاشة (مراجعة 0022 P1).
 * وbusy (الجدول يُقرأ من جديد): أزرار الملاحظات معطّلة، فلا تُفتح نافذة على ملاحظة من قراءة قديمة.
 */
export function dayColumns(data: DayBalance, here: string, onNote: ((row: DayRow) => void) | null, busy = false): Column<DayRow>[] {
  const units = [...new Set(data.rows.map((row) => row.baseUnit))];
  const [single] = units.length === 1 ? units : [];
  const decimals = columnDecimals(data.rows.map((row) => row.qty), 3) as 0 | 1 | 2 | 3;
  const back = new URLSearchParams({ back: here }).toString();
  const columns: Column<DayRow>[] = [
    { key: 'no', header: t('dayb.col.no', 'ت'), kind: 'number', cell: (_row, index) => <Num>{fmtInt(index + 1)}</Num> },
    {
      key: 'item',
      header: t('dayb.col.item', 'المادّة'),
      cell: (row) => (
        <Link to={`${itemFilePath(row.itemId)}?${back}`} className="font-medium text-brand-700 dark:text-brand-200" data-action="day-item">
          {row.name}
        </Link>
      ),
    },
    {
      key: 'qty',
      header: single ? t('dayb.col.qty_unit', 'الرصيد ({unit})', { unit: baseUnitLabel(single) }) : t('dayb.col.qty', 'الرصيد'),
      kind: 'number',
      cell: (row) => (row.qty === 0n ? '-' : <Num>{fmtQtyCell(row.qty, decimals)}</Num>),
    },
  ];
  if (units.length > 1) columns.push({ key: 'unit', header: t('dayb.col.unit', 'الوحدة'), cell: (row) => baseUnitLabel(row.baseUnit) });
  columns.push({
    key: 'note',
    header: t('dayb.col.notes', 'الملاحظات'),
    wrap: true,
    cell: (row) => (
      <span className="flex items-center gap-2">
        {onNote ? (
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50 print:hidden"
            aria-label={t('dayb.note.title', 'ملاحظة «{item}» ليوم {day}', { item: row.name, day: fmtDay(data.on) })}
            title={t('dayb.note.title', 'ملاحظة «{item}» ليوم {day}', { item: row.name, day: fmtDay(data.on) })}
            onClick={() => onNote(row)}
            disabled={busy}
            data-action="edit-note"
            data-id={row.itemId}
          >
            <NotebookPen aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        <span className="min-w-0" data-action="day-note">
          {row.note?.text ?? ''}
        </span>
      </span>
    ),
  });
  return columns;
}

/** رسالة رفض الخادم بتلميحه، وإلّا وصفها العامّ. */
function failureText(failure: unknown, context: 'write' | 'once'): string {
  if (failure instanceof RejectedError && failure.hint) return failure.hint;
  const described = describeError(failure, context);
  return `${described.title}. ${described.detail}`;
}

// ─── ملاحظة اليوم ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ملاحظة مادّة ليوم واحد. الكتابة بشرط النسخة التي عرضتها النافذة (basis: الملاحظة كما رآها حين فتحها، لا نسخة قراءة لاحقة لم يرها —
 * مراجعة 0022 M1). وnote_changed يقول إنّ غيره غيّرها ويقرأ الجدول من جديد، وأوّل قراءة ناجحة بعده تصير الأساس وتُعرض («الملاحظة الآن»)،
 * ويبقى ما كتبه ليحفظه فوقها إن شاء؛ وإن فشلت القراءة يُقال ذلك بـ«أعد القراءة» ولا حفظ بنسخة لم تُقرأ (R6).
 */
function NoteDialog({
  item,
  day,
  shown,
  latest,
  reads,
  failed,
  onClose,
  onSaved,
  onReread,
}: {
  item: Named;
  day: Day;
  /** الملاحظة كما عرضها الجدول حين فُتحت النافذة. */
  shown: DayNote | null;
  /** ملاحظة المادّة في آخر قراءة ناجحة للجدول، وعدد القراءات الناجحة حتى الآن. */
  latest: DayNote | null;
  reads: number;
  /** فشلت آخر قراءة للجدول. */
  failed: boolean;
  /** uncertain: نتيجة الحفظ مجهولة (لعلّها حُفظت)، فالجدول يُقرأ من جديد. */
  onClose: (uncertain: boolean) => void;
  onSaved: (result: DayNoteResult) => void;
  onReread: () => void;
}) {
  const id = useId();
  const [basis, setBasis] = useState<DayNote | null>(shown);
  const [text, setText] = useState(shown?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [changed, setChanged] = useState(false);
  // عدد القراءات حين رُفض الحفظ بـnote_changed: القراءة الناجحة التالية تصير الأساس.
  const [changedAt, setChangedAt] = useState<number | null>(null);
  if (changedAt !== null && reads > changedAt) {
    setBasis(latest);
    setChangedAt(null);
  }
  const waiting = changedAt !== null;
  const close = () => onClose(failure instanceof UnknownOutcomeError);
  const send = async (value: string) => {
    const trimmed = noteText(value);
    // لا ملاحظة ولا نصّ: لا شيء يُحفظ ولا يُمسح.
    if (trimmed === '' && basis === null && !changed) {
      onClose(false);
      return;
    }
    const length = [...trimmed].length;
    if (length > NOTE_MAX) {
      setError(t('dayb.note.too_long', 'الملاحظة أطول من {max} حرف ({n}). اختصرها.', { max: fmtInt(NOTE_MAX), n: fmtInt(length) }));
      return;
    }
    setError(null);
    setFailure(null);
    setBusy(true);
    try {
      onSaved(await dayBalance.setDayNote(item.id, day, trimmed, basis?.version ?? null));
    } catch (caught) {
      setBusy(false);
      if (caught instanceof RejectedError && caught.code === 'note_changed') {
        setChanged(true);
        setChangedAt(reads);
        onReread();
      } else {
        setFailure(caught);
      }
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(text);
  };
  const formId = `${id}-form`;
  return (
    <Dialog
      open
      onClose={close}
      title={t('dayb.note.title', 'ملاحظة «{item}» ليوم {day}', { item: item.name, day: fmtDay(day) })}
      dirty={text !== (shown?.text ?? '')}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          {basis ? (
            <Button variant="ghost" onClick={() => void send('')} disabled={busy || waiting} data-action="erase-note">
              {t('dayb.note.erase', 'امسح الملاحظة')}
            </Button>
          ) : null}
          <Button type="submit" form={formId} busy={busy} disabled={waiting} data-action="save-note">
            {t('dayb.note.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-3" onSubmit={submit} noValidate>
        {changed ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-warn-700 dark:text-warn-300" data-action="note-changed">
              {waiting
                ? failed
                  ? t('dayb.note.changed.failed', 'غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت، وتعذّرت قراءة الملاحظة الحاليّة. أعد القراءة لتراها، ثمّ احفظ ما كتبت إن شئت.')
                  : t('dayb.note.changed.reading', 'غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت. جارٍ قراءة الملاحظة الحاليّة…')
                : basis
                  ? t('dayb.note.changed', 'غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت. الملاحظة الآن: «{text}». ما كتبته باقٍ هنا: احفظه ليحلّ محلّها، أو أغلق النافذة.', { text: basis.text })
                  : t('dayb.note.changed.cleared', 'مُسحت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت. ما كتبته باقٍ هنا: احفظه إن شئت، أو أغلق النافذة.')}
            </p>
            {waiting && failed ? (
              <Button variant="secondary" size="sm" onClick={onReread} data-action="note-reread">
                {t('dayb.reread', 'أعد القراءة')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <Field id={`${id}-text`} label={t('dayb.note.label', 'الملاحظة')} hint={t('dayb.note.hint', 'حتى {max} حرف. احفظها فارغة لتمسحها.', { max: fmtInt(NOTE_MAX) })} error={error}>
          <textarea id={`${id}-text`} className="input" rows={3} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} data-action="note-text" data-autofocus />
        </Field>
        {failure ? (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="note-failed">
            {failureText(failure, 'write')}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

// ─── موادّ التصنيف بترتيبها ────────────────────────────────────────────────────────────────────────────────────

interface Pages {
  key: string;
  pages: readonly ItemPage[];
  busy: boolean;
  error: unknown;
}

/**
 * «أدرج مواد» (المدير): الموادّ المختارة بترتيبها (أعلى وأسفل)، وكلّ الموادّ الفعّالة بحثاً بمربّع اختيار، والمادّة في تصنيف آخر تقول «في «س»»
 * (الحفظ ينقلها إلى هذا التصنيف). تبدأ بموادّ التصنيف كلّها (members، ولو لم يُظهرها الجدول لأنّ مخازن النطاق لا تقبلها) بأسمائها من قراءة واحدة،
 * و«احفظ» يرسل القائمة كلّها بترتيبها ومعها ما عرضته النافذة (basis، p_expected_items: لا قائمة قراءة لاحقة لم تُعرض — مراجعة 0022 M2).
 * وcategory_changed (غيّر غيره التصنيف بعد الفتح) يُقال بتلميحه ويُقرأ التصنيف من جديد، وأوّل قراءة ناجحة بعده تصير الأساس، ويبقى الاختيار
 * ليُحفظ ثانيةً على ما صار فيه؛ وإن فشلت القراءة يُقال ذلك بـ«أعد القراءة» ولا حفظ بقائمة لم تُقرأ (R12).
 */
function IncludeDialog({
  category,
  initial,
  members,
  reads,
  failed,
  rowNames,
  categories,
  onClose,
  onSaved,
  onReread,
}: {
  category: Named;
  /** موادّ التصنيف بترتيبها كما فُتحت النافذة (members). */
  initial: readonly string[];
  /** members من آخر قراءة ناجحة للتصنيف نفسه، أو null إن كان العرض لغيره. */
  members: readonly string[] | null;
  /** عدد القراءات الناجحة للجدول حتى الآن. */
  reads: number;
  /** فشلت آخر قراءة للجدول. */
  failed: boolean;
  rowNames: ReadonlyMap<string, string>;
  categories: readonly DayCategory[];
  /** uncertain: نتيجة الحفظ مجهولة (لعلّه حُفظ)، فالجدول يُقرأ من جديد. */
  onClose: (uncertain: boolean) => void;
  onSaved: (result: CategoryItemsResult) => void;
  onReread: () => void;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<readonly string[]>(initial);
  // أسماء ما يُختار من القائمة (قد تخرج من الصفحات المقروءة إن تغيّر البحث).
  const [pickedNames, setPickedNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  // أسماء موادّ التصنيف كلّها، وتُقرأ من جديد بعد category_changed؛ وآخر قراءة ناجحة تبقى أثناء ذلك.
  const [generation, setGeneration] = useState(0);
  const loadNames = useCallback(() => dayBalance.loadCategoryItemNames(category.id), [category.id]);
  const names = useLoad(loadNames, `${category.id}#${generation}`);
  const [known, setKnown] = useState<ReadonlyMap<string, string> | null>(null);
  if (names.data !== null && names.data !== known) setKnown(names.data);
  const [changed, setChanged] = useState<string | null>(null);
  // ما عرضته النافذة من موادّ التصنيف: شرط الحفظ. وبعد category_changed أوّل قراءة ناجحة تصير هو (changedAt عدد القراءات حين رُفض).
  const [basis, setBasis] = useState<readonly string[]>(initial);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  if (changedAt !== null && reads > changedAt) {
    if (members !== null) setBasis(members);
    setChangedAt(null);
  }
  const waiting = changedAt !== null;
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim());
  const load = useCallback(() => inventory.listItems({ search }), [search]);
  const first = useLoad(load, search);
  const [more, setMore] = useState<Pages>({ key: '', pages: [], busy: false, error: null });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => onClose(failure instanceof UnknownOutcomeError);
  const extra = more.key === search ? more : { key: search, pages: [], busy: false, error: null };
  const pages = first.data ? [first.data, ...extra.pages] : [];
  const seen = new Set<string>();
  const items = pages.flatMap((page) => page.rows).filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
  const next = pages.at(-1)?.next ?? null;
  const categoryNames = new Map(categories.map((entry) => [entry.id, entry.name]));
  const pageNames = new Map(items.map((row) => [row.id, row.name]));
  const nameOf = (itemId: string): string => known?.get(itemId) ?? pickedNames.get(itemId) ?? rowNames.get(itemId) ?? pageNames.get(itemId) ?? t('dayb.include.unnamed', 'مادّة');
  const picked = new Set(chosen);
  const dirty = chosen.length !== initial.length || chosen.some((itemId, index) => itemId !== initial[index]);
  const toggle = (item: ItemRow, on: boolean) => {
    if (on) setPickedNames((map) => new Map(map).set(item.id, item.name));
    setChosen((list) => (on ? (list.includes(item.id) ? list : [...list, item.id]) : list.filter((itemId) => itemId !== item.id)));
  };
  const move = (index: number, by: -1 | 1) =>
    setChosen((list) => {
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      const [entry] = copy.splice(index, 1);
      if (entry) copy.splice(target, 0, entry);
      return copy;
    });
  const loadMore = () => {
    if (!next) return;
    const asked = search;
    setMore({ ...extra, busy: true, error: null });
    inventory.listItems({ search: asked, after: next }).then(
      (page) => setMore((current) => (current.key === asked ? { key: asked, pages: [...current.pages, page], busy: false, error: null } : current)),
      (caught: unknown) => setMore((current) => (current.key === asked ? { ...current, busy: false, error: caught } : current)),
    );
  };
  const save = async () => {
    if (chosen.length > CATEGORY_MAX) {
      setError(t('dayb.include.too_many', 'لا يزيد التصنيف الواحد على {max} مادّة.', { max: fmtInt(CATEGORY_MAX) }));
      return;
    }
    setError(null);
    setFailure(null);
    setBusy(true);
    try {
      onSaved(await dayBalance.setCategoryItems(category.id, chosen, basis));
    } catch (caught) {
      setBusy(false);
      if (caught instanceof RejectedError && caught.code === 'category_changed') {
        // الاختيار باقٍ، والتصنيف (members وأسماؤه) يُقرأ من جديد فيصير الحفظ التالي على ما صار فيه.
        setChanged(caught.hint ?? t('dayb.include.changed', 'تغيّرت موادّ هذا التصنيف بعد أن فتحت النافذة.'));
        setChangedAt(reads);
        setGeneration((n) => n + 1);
        onReread();
      } else {
        setFailure(caught);
      }
    }
  };
  const otherName = (row: ItemRow): string | null => {
    if (row.categoryId === null || row.categoryId === category.id) return null;
    const name = categoryNames.get(row.categoryId);
    return name ? t('dayb.include.in_other', 'في «{name}»', { name }) : t('dayb.include.in_other_unknown', 'في تصنيف آخر');
  };
  return (
    <Dialog
      open
      onClose={close}
      title={t('dayb.include.title', 'موادّ «{name}»', { name: category.name })}
      size="wide"
      dirty={dirty}
      locked={busy}
      footer={
        <div className="flex flex-col gap-2">
          {error || failure ? (
            <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="include-failed">
              {error ?? failureText(failure, 'write')}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={busy}>
              {t('confirm.cancel', 'لا، تراجع')}
            </Button>
            {/* لا حفظ قبل أن تُعرف موادّ التصنيف بأسمائها، ولا قبل أن يُقرأ من جديد بعد category_changed: الحفظ بشرط ما عُرض. */}
            <Button onClick={() => void save()} busy={busy} disabled={waiting || known === null} data-action="save-include">
              {t('dayb.include.save', 'احفظ الموادّ بترتيبها')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {changed ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-warn-700 dark:text-warn-300" data-action="include-changed">
              {changed}{' '}
              {waiting
                ? failed
                  ? t('dayb.include.changed.failed', 'وتعذّرت قراءة التصنيف من جديد. أعد القراءة، ثمّ احفظ اختيارك إن شئت.')
                  : t('dayb.include.changed.reading', 'جارٍ قراءة التصنيف من جديد…')
                : t('dayb.include.changed.kept', 'قُرئ التصنيف من جديد، واختيارك باقٍ: احفظه ليحلّ محلّ ما فيه الآن، أو أغلق النافذة.')}
            </p>
            {waiting && failed ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onReread();
                  if (names.error) names.retry();
                }}
                data-action="include-reread"
              >
                {t('dayb.reread', 'أعد القراءة')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">{t('dayb.include.chosen', 'الموادّ المختارة بترتيبها: {n}', { n: fmtInt(chosen.length) })}</h3>
          {known === null ? (
            names.error ? (
              <LoadFailed what={t('dayb.include.what', 'موادّ التصنيف')} error={names.error} onRetry={names.retry} />
            ) : (
              <p role="status" className="text-sm text-ink-muted">
                {t('page.loading', 'جارٍ الفتح…')}
              </p>
            )
          ) : chosen.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('dayb.include.none_chosen', 'لم تختر مادّة بعد. اختر من القائمة أدناه.')}</p>
          ) : (
            <ol className="flex flex-col gap-1" data-action="include-chosen">
              {chosen.map((itemId, index) => {
                const name = nameOf(itemId);
                return (
                  <li key={itemId} className="flex items-center gap-2 rounded-2xl border border-line px-3" data-action="include-chosen-row" data-id={itemId}>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <IconButton label={t('dayb.include.up', 'قدّم «{name}»', { name })} onClick={() => move(index, -1)} disabled={index === 0 || busy} className="disabled:opacity-50" data-action="include-up" data-id={itemId}>
                      <ArrowUp aria-hidden="true" className="size-5" />
                    </IconButton>
                    <IconButton label={t('dayb.include.down', 'أخّر «{name}»', { name })} onClick={() => move(index, 1)} disabled={index === chosen.length - 1 || busy} className="disabled:opacity-50" data-action="include-down" data-id={itemId}>
                      <ArrowDown aria-hidden="true" className="size-5" />
                    </IconButton>
                    <IconButton label={t('dayb.include.remove', 'أخرج «{name}» من التصنيف', { name })} onClick={() => setChosen((list) => list.filter((other) => other !== itemId))} disabled={busy} data-action="include-remove" data-id={itemId}>
                      <X aria-hidden="true" className="size-5" />
                    </IconButton>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <Field id={`${id}-search`} label={t('dayb.include.search', 'ابحث عن مادّة')}>
            <input id={`${id}-search`} type="search" className="input" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} data-action="include-search" />
          </Field>
          {first.error ? (
            <LoadFailed what={t('items.what', 'قائمة المواد')} error={first.error} onRetry={first.retry} />
          ) : !first.data ? (
            <p role="status" className="text-sm text-ink-muted">
              {t('page.loading', 'جارٍ الفتح…')}
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-muted">{search ? t('dayb.include.no_match', 'لا مادّة بهذا الاسم.') : t('dayb.include.no_items', 'لا موادّ بعد.')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((row) => {
                const other = otherName(row);
                return (
                  <li key={row.id}>
                    <label className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-2">
                      <input type="checkbox" className="size-5 accent-brand-600" checked={picked.has(row.id)} disabled={busy} onChange={(event) => toggle(row, event.target.checked)} data-action="include-pick" data-id={row.id} />
                      <span className="min-w-0 flex-1">{row.name}</span>
                      {other ? (
                        <span className="text-xs text-ink-muted" data-action="include-in-other">
                          {other}
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {next ? (
            <Button variant="secondary" size="sm" className="self-start" busy={extra.busy} onClick={loadMore} data-action="include-more">
              {t('stock.board.more', 'المزيد')}
            </Button>
          ) : null}
          {extra.error ? <LoadFailed what={t('items.what', 'قائمة المواد')} error={extra.error} onRetry={loadMore} /> : null}
        </section>
      </div>
    </Dialog>
  );
}

// ─── تصنيف جديد واختيار اليوم ──────────────────────────────────────────────────────────────────────────────────

/**
 * «تصنيف جديد» (المدير): الإدراج القائم في item_categories، والاسم المكرّر يُقال قبل الإرسال (لا قيد فريد على الاسم). ونتيجة مجهولة (لعلّه
 * أُنشئ) تقرأ التصنيفات من جديد قبل أيّ «احفظ» ثانٍ (مراجعة 0022 R4: كان يُدرج ثانيةً فيصير تصنيفان بالاسم نفسه): إن وُجد يُقال ويُفتح، وإلّا
 * يُحفظ من جديد.
 */
function CategoryDialog({
  categories,
  reads,
  failed,
  onClose,
  onCreated,
  onReread,
}: {
  categories: readonly DayCategory[];
  /** عدد القراءات الناجحة للجدول حتى الآن (التصنيفات منها). */
  reads: number;
  /** فشلت آخر قراءة للجدول. */
  failed: boolean;
  onClose: () => void;
  onCreated: (category: Named) => void;
  onReread: () => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // نتيجة مجهولة: عدد القراءات حينها، والقراءة الناجحة التالية تقول هل أُنشئ.
  const [checkAt, setCheckAt] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  if (checkAt !== null && reads > checkAt) {
    setCheckAt(null);
    setChecked(true);
  }
  const checking = checkAt !== null;
  const twinOf = (text: string) => categories.find((entry) => searchable(entry.name) === searchable(text));
  const landed = checked && name.trim() !== '' ? twinOf(name.trim()) : undefined;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (checking || landed) return;
    const text = name.trim();
    if (!text) {
      setError(t('dayb.cat.required', 'اكتب اسم التصنيف.'));
      return;
    }
    const twin = twinOf(text);
    if (twin) {
      setError(t('dayb.cat.twin', 'يوجد تصنيف باسم «{name}»: اختره من التصنيفات.', { name: twin.name }));
      return;
    }
    setError(null);
    setFailure(null);
    setChecked(false);
    setBusy(true);
    try {
      const row = await inventory.createItemCategory(text);
      onCreated({ id: row.id, name: row.name });
    } catch (caught) {
      setBusy(false);
      setFailure(caught);
      if (caught instanceof UnknownOutcomeError) {
        setCheckAt(reads);
        onReread();
      }
    }
  };
  const formId = `${id}-form`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('dayb.cat.title', 'تصنيف جديد')}
      dirty={name !== '' && !landed}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          {landed ? (
            <Button onClick={() => onCreated({ id: landed.id, name: landed.name })} data-action="category-landed-open">
              {t('dayb.cat.landed.open', 'اختر موادّه')}
            </Button>
          ) : (
            <Button type="submit" form={formId} busy={busy} disabled={checking} data-action="save-category">
              {t('dayb.cat.save', 'أنشئه واختر موادّه')}
            </Button>
          )}
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-3" onSubmit={(event) => void save(event)} noValidate>
        <Field id={`${id}-name`} label={t('dayb.cat.name', 'اسم التصنيف')} hint={t('dayb.cat.hint', 'مثل «مواد العلف» أو «الأدوية».')} error={error}>
          <input id={`${id}-name`} className="input" maxLength={80} value={name} disabled={busy || checking} onChange={(event) => setName(event.target.value)} data-action="category-name" data-autofocus />
        </Field>
        {landed ? (
          <p role="status" className="text-sm text-success-700 dark:text-success-300" data-action="category-landed">
            {t('dayb.cat.landed', 'أُنشئ التصنيف «{name}» قبل أن ينقطع الجواب. اختر موادّه الآن.', { name: landed.name })}
          </p>
        ) : checking ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-warn-700 dark:text-warn-300" data-action="category-checking">
              {failed
                ? t('dayb.cat.check_failed', 'لا نعرف هل أُنشئ التصنيف، وتعذّرت قراءة التصنيفات. أعد القراءة قبل أن تحفظه ثانيةً.')
                : t('dayb.cat.checking', 'لا نعرف هل أُنشئ التصنيف. جارٍ قراءة التصنيفات…')}
            </p>
            {failed ? (
              <Button variant="secondary" size="sm" onClick={onReread} data-action="category-reread">
                {t('dayb.reread', 'أعد القراءة')}
              </Button>
            ) : null}
          </div>
        ) : checked ? (
          <p role="status" className="text-sm text-ink-muted" data-action="category-absent">
            {t('dayb.cat.absent', 'لم يُنشأ التصنيف. احفظه مرّة أخرى.')}
          </p>
        ) : failure ? (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="category-failed">
            {failureText(failure, 'once')}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** النقر على التاريخ: يوم بالكتابة (يوم/شهر/سنة، حقل DayField القائم)، لا بعد اليوم. */
function PickDayDialog({ today, current, onClose, onPick }: { today: Day; current: Day; onClose: () => void; onPick: (day: Day) => void }) {
  const id = useId();
  const [text, setText] = useState(fmtDay(current));
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const day = parseDayText(text);
    if (!day) {
      setError(t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.'));
      return;
    }
    if (day > today) {
      setError(t('day.future', 'التاريخ بعد اليوم.'));
      return;
    }
    onPick(day);
  };
  const formId = `${id}-form`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('dayb.pick.title', 'اعرض رصيد يوم آخر')}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} data-action="day-pick-show">
            {t('dayb.pick.show', 'اعرض')}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <DayField id={`${id}-day`} label={t('dayb.pick.label', 'اليوم')} value={text} onChange={setText} error={error} />
      </form>
    </Dialog>
  );
}

// ─── العرض ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Open =
  | null
  | { kind: 'note'; key: string; item: Named; day: Day; shown: DayNote | null }
  | { kind: 'include'; category: Named; initial: readonly string[] }
  | { kind: 'category' }
  | { kind: 'day' };

/**
 * اطبع بعنوان الصفحة عنوانَ التقرير وتاريخه (Chrome يسمّي ملفّ «احفظ PDF» بعنوان الصفحة، فكان كلّ تقرير «نظام الدواجن.pdf»)، ثمّ يعود
 * العنوان بعد الطباعة.
 */
function printAs(title: string): void {
  const before = document.title;
  const restore = () => {
    document.title = before;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  document.title = title;
  window.print();
}

/** رفض قراءة يعرف المستخدم طريقه منه: التلميح العربي من الخادم وزرّ الطريق. */
function Refusal({ failure, params, go, onRetry }: { failure: unknown; params: DayParams; go: (patch: Partial<DayParams>) => void; onRetry: () => void }) {
  if (!(failure instanceof RejectedError) || !failure.hint) return <LoadFailed what={t('dayb.what', 'الرصيد اليومي')} error={failure} onRetry={onRetry} />;
  const way =
    failure.code === 'day_in_future' && params.day !== null
      ? { label: t('dayb.today', 'اليوم'), patch: { day: null } }
      : (failure.code === 'category_not_found' || failure.code === 'category_archived') && params.cat !== 'all'
        ? { label: t('dayb.show_all', 'اعرض كلّ المواد'), patch: { cat: 'all' } }
        : failure.code === 'out_of_scope' && params.store !== null
          ? { label: t('dayb.store.all', 'كل المخازن'), patch: { store: null } }
          : null;
  return (
    <Notice
      tone="warning"
      title={failure.hint}
      action={
        way ? (
          <Button variant="secondary" size="sm" onClick={() => go(way.patch)} data-action="day-refusal-way">
            {way.label}
          </Button>
        ) : null
      }
    />
  );
}

export function DayBalanceView({ orgName }: { orgName: string }) {
  const id = useId();
  const [search, setSearch] = useSearchParams();
  const cat = catOf(search.get('cat'));
  const day = dayOf(search.get('day'));
  const store = storeOf(search.get('store'));
  const category = cat === null || cat === 'all' ? null : cat;
  const load = useCallback(() => dayBalance.loadDayBalance({ category, day, warehouse: store }), [category, day, store]);
  const params: DayParams = { cat, day, store };
  const here = dayUrl(params);
  const state = useLoad(load, here);
  // آخر قراءة ناجحة: للعرض نفسه تبقى مرسومة أثناء القراءة من جديد (بعد حفظ ملاحظة)، والتصنيفات والمخازن ويوم الخادم منها للأزرار حين يتغيّر
  // العرض (يوم آخر) فلا تختفي الأسهم أثناء القراءة. وreads عدد القراءات الناجحة: النوافذ تعرف به أنّ ما تعرضه قُرئ بعد رفضٍ طلب القراءة.
  const [kept, setKept] = useState<{ key: string; data: DayBalance; reads: number } | null>(null);
  if (state.data !== null && (kept === null || kept.key !== here || kept.data !== state.data)) setKept({ key: here, data: state.data, reads: (kept?.reads ?? 0) + 1 });
  const data = state.data ?? (kept !== null && kept.key === here ? kept.data : null);
  const meta = state.data ?? kept?.data ?? null;
  const reads = kept?.reads ?? 0;
  // القراءة من جديد بعد رفض فشلت: النوافذ تقول ذلك بـ«أعد القراءة».
  const failed = !state.loading && state.error !== null;
  const [open, setOpen] = useState<Open>(null);
  // نافذة ملاحظة لعرض آخر (رجع المستخدم بزرّ المتصفّح) لا تبقى: ملاحظتها ليوم غير المعروض.
  if (open?.kind === 'note' && open.key !== here) setOpen(null);
  const go = (patch: Partial<DayParams>) => setSearch(dayQuery({ ...params, ...patch }));

  // «cat» غائب: أوّل تصنيف إن وُجد (الرابط يصير صريحاً، بلا خطوة في سجلّ الرجوع)، وإلّا كلّ المواد. بالانتقال لا بـ<Navigate>: ذاك
  // يُدخل مكوّناً من react-router حزمة الإقلاع لصفحة كسولة.
  const firstId = cat === null && data ? (data.categories[0]?.id ?? null) : null;
  useEffect(() => {
    if (firstId !== null) setSearch(dayQuery({ cat: firstId, day, store }), { replace: true });
  }, [firstId, day, store, setSearch]);
  if (firstId !== null) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t('page.loading', 'جارٍ الفتح…')}
      </p>
    );
  }

  const today = meta?.today ?? null;
  const on = data?.on ?? day ?? today;
  const canNote = meta?.canNote === true;
  const canManage = meta?.canManage === true;
  const categories = meta?.categories ?? [];
  const stores = meta?.stores ?? [];
  const toDay = (target: Day) => go({ day: today !== null && target >= today ? null : target });
  // التصنيف المعروض نفسه لا يُضاف خطوةً ثانية في سجلّ الرجوع.
  const pickCategory = (next: string) => {
    if (next !== (category ?? 'all')) go({ cat: next });
  };
  // لا مخزن في النطاق: لا جدول أصفار ولا طباعة ولا مشاركة، بل يُقال السبب. وتصنيف بلا موادّ (members فارغة) غير تصنيف موادّه لا تُخزَّن هنا
  // (members بلا صفوف: لا يقبلها شيء من مخازن النطاق أو المخزن المختار).
  const noStores = data !== null && data.stores.length === 0;
  const emptyCategory = data !== null && data.category !== null && data.category.members.length === 0;
  const unstored = data !== null && !noStores && data.category !== null && data.category.members.length > 0 && data.rows.length === 0;
  const printable = data !== null && !noStores && data.rows.length > 0;
  const openInclude = () => {
    if (!data?.category || state.loading) return;
    setOpen({ kind: 'include', category: { id: data.category.id, name: data.category.name }, initial: data.category.members });
  };
  // أثناء القراءة من جديد (بعد حفظ) لا تُفتح «أدرج مواد» ولا ملاحظة: كانت تعرض ما قبل الحفظ وتشترط ما بعده (مراجعة 0022 M1 وM2).
  const includeButton = (
    <Button variant="secondary" size="sm" onClick={openInclude} disabled={!data?.category || state.loading} data-action="include-items">
      <ListPlus aria-hidden="true" className="size-4" />
      {t('dayb.include', 'أدرج مواد')}
    </Button>
  );
  const newCategoryButton = (
    <Button variant="secondary" size="sm" onClick={() => setOpen({ kind: 'category' })} data-action="new-category">
      <Plus aria-hidden="true" className="size-4" />
      {t('dayb.new_category', 'تصنيف جديد')}
    </Button>
  );
  const share = async () => {
    if (!data) return;
    const { title, text } = shareText(data);
    try {
      if ((await shareReport(title, text)) === 'copied') toast({ tone: 'success', title: t('dayb.share.copied', 'نُسخ التقرير: الصقه في واتساب أو في أيّ رسالة.') });
    } catch {
      toast({ tone: 'danger', title: t('dayb.share.failed', 'تعذّرت المشاركة والنسخ على هذا الجهاز. اطبع التقرير أو احفظه PDF بدلاً من ذلك.') });
    }
  };
  const noteRow = open?.kind === 'note' ? (data?.rows.find((row) => row.itemId === open.item.id) ?? null) : null;
  const closeAfter = (uncertain: boolean) => {
    setOpen(null);
    if (uncertain) state.retry();
  };

  return (
    <section className="flex flex-col gap-4" aria-label={t('board.view.day', 'الرصيد اليومي')} data-action="day-view">
      {meta && on !== null && today !== null ? (
        <div className="flex flex-col gap-3 print:hidden" data-action="day-controls">
          <div role="group" aria-label={t('dayb.categories', 'التصنيفات')} className="flex flex-wrap items-center gap-2">
            {categories.map((entry) => (
              <Button key={entry.id} size="sm" variant={category === entry.id ? 'primary' : 'secondary'} aria-pressed={category === entry.id} onClick={() => pickCategory(entry.id)} data-action="day-category" data-id={entry.id}>
                {entry.name}
              </Button>
            ))}
            {/* «كل المواد» مختار لـcat=all، وبلا cat حين لا تصنيف (لا انتقال إلى أوّل تصنيف). */}
            <Button size="sm" variant={category === null ? 'primary' : 'secondary'} aria-pressed={category === null} onClick={() => pickCategory('all')} data-action="day-category" data-id="all">
              {t('dayb.all', 'كل المواد')}
            </Button>
            {canManage && categories.length > 0 ? newCategoryButton : null}
          </div>
          {stores.length > 1 ? (
            <Field id={`${id}-store`} label={t('dayb.store', 'المخزن')}>
              <select id={`${id}-store`} className="input" value={store ?? ''} onChange={(event) => go({ store: event.target.value || null })} data-action="day-store">
                <option value="">{t('dayb.store.all', 'كل المخازن')}</option>
                {stores.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="flex flex-wrap items-center gap-2" data-action="day-bar">
            {/* بالهاتف السهمان وحدهما حول التاريخ (الاسم للقارئ الصوتي)، ومن sm الاسم ظاهر بجانب سهمه. */}
            <Button size="sm" variant="secondary" onClick={() => toDay(addDays(on, -1))} data-action="day-prev">
              <ChevronRight aria-hidden="true" className="size-4" />
              <span className="sr-only sm:not-sr-only">{t('dayb.prev', 'اليوم السابق')}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen({ kind: 'day' })} aria-label={t('dayb.pick', 'اختر يوماً آخر (المعروض {day})', { day: fmtDay(on) })} data-action="day-pick">
              {fmtDay(on)}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => toDay(addDays(on, 1))} disabled={on >= today} data-action="day-next">
              <span className="sr-only sm:not-sr-only">{t('dayb.next', 'اليوم التالي')}</span>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Button>
            {on !== today ? (
              <Button size="sm" variant="ghost" onClick={() => go({ day: null })} data-action="day-today">
                {t('dayb.today', 'اليوم')}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {noStores ? null : (
              <>
                <Button size="sm" variant="secondary" onClick={() => (data ? printAs(`${reportTitle(data)} ${reportDate(data)}`) : undefined)} disabled={!printable} data-action="print-day">
                  <Printer aria-hidden="true" className="size-4" />
                  {t('dayb.print', 'اطبع أو احفظ PDF')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void share()} disabled={!printable} data-action="share-day">
                  <Share2 aria-hidden="true" className="size-4" />
                  {t('dayb.share', 'شارك')}
                </Button>
              </>
            )}
            {canManage && category !== null && !emptyCategory ? includeButton : null}
          </div>
        </div>
      ) : null}
      {state.error ? <Refusal failure={state.error} params={params} go={go} onRetry={state.retry} /> : null}
      {data && data.categories.length === 0 ? (
        <div className="print:hidden">
          <Notice tone="info" title={t('dayb.no_categories', 'لا تصنيف بعد.')} action={data.canManage ? newCategoryButton : null}>
            <span data-action="day-no-categories">
              {data.canManage
                ? t('dayb.no_categories.manage', 'أنشئ تصنيفاً مثل «مواد العلف» واختر موادّه، فيظهر رصيدها كلّ يوم في جدول واحد. وهذا رصيد كلّ المواد.')
                : t('dayb.no_categories.ask', 'يُنشئ التصنيفات المدير. وهذا رصيد كلّ المواد.')}
            </span>
          </Notice>
        </div>
      ) : null}
      {data && noStores ? (
        <Notice tone="info" title={t('dayb.no_stores', 'لا مخزن في نطاقك، فلا رصيد يُعرض هنا.')}>
          <span data-action="day-no-stores">
            {data.canManage
              ? t('dayb.no_stores.manage', 'أضف مخزناً من «إعداد المخزن»، أو اطلب من صاحب المنشأة أن يضيف مخزناً إلى نطاقك.')
              : t('dayb.no_stores.ask', 'اطلب من صاحب المنشأة أن يضيف مخزناً إلى نطاقك.')}
          </span>
        </Notice>
      ) : data ? (
        <div className="flex flex-col gap-2" data-action="day-report">
          {orgName ? (
            <p className="hidden text-sm text-ink-muted print:block" data-action="day-org">
              {orgName}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold" data-action="day-title">
            {reportTitle(data)}
          </h2>
          <p className="text-sm text-ink-muted" data-action="day-date">
            {reportDate(data)}
          </p>
          {emptyCategory ? (
            <Notice tone="info" title={t('dayb.empty_category', 'لا موادّ في هذا التصنيف')} action={data.canManage ? <span className="print:hidden">{includeButton}</span> : null}>
              <span data-action="day-empty-category">
                {data.canManage ? t('dayb.empty_category.manage', 'اختر موادّه بترتيبها من «أدرج مواد».') : t('dayb.empty_category.ask', 'يختار موادّ التصنيفات المدير.')}
              </span>
            </Notice>
          ) : unstored && data.category ? (
            <Notice
              tone="info"
              title={
                data.warehouse
                  ? t('dayb.unstored.store', 'لا يُخزَّن شيء من موادّ «{category}» في «{store}».', { category: data.category.name, store: data.warehouse.name })
                  : t('dayb.unstored', 'لا يُخزَّن شيء من موادّ «{category}» في مخازن نطاقك.', { category: data.category.name })
              }
            >
              <span data-action="day-unstored">
                {data.warehouse ? t('dayb.unstored.store.hint', 'اختر «كل المخازن» أو مخزناً آخر.') : t('dayb.unstored.hint', 'موادّه تُخزَّن في مخازن خارج نطاقك.')}
              </span>
            </Notice>
          ) : (
            // بالطباعة الجدول بكلّ صفوفه: حدّ ارتفاع DataTable وتمريره للشاشة وحدها.
            <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible">
              <DataTable
                caption={`${reportTitle(data)} ${reportDate(data)}`}
                columns={dayColumns(
                  data,
                  here,
                  canNote ? (row) => setOpen({ kind: 'note', key: here, item: { id: row.itemId, name: row.name }, day: data.on, shown: row.note }) : null,
                  state.loading,
                )}
                rows={data.rows}
                rowKey={(row) => row.itemId}
                empty={t('dayb.empty_all', 'لا موادّ بعد.')}
              />
            </div>
          )}
        </div>
      ) : !state.error ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : null}
      {open?.kind === 'note' ? (
        <NoteDialog
          item={open.item}
          day={open.day}
          shown={open.shown}
          latest={noteRow?.note ?? null}
          reads={reads}
          failed={failed}
          onClose={closeAfter}
          onReread={state.retry}
          onSaved={(result) => {
            setOpen(null);
            toast({
              tone: 'success',
              title: result.note
                ? t('dayb.note.saved', 'حُفظت ملاحظة «{item}» ليوم {day}.', { item: open.item.name, day: fmtDay(result.on) })
                : t('dayb.note.erased', 'مُسحت ملاحظة «{item}» ليوم {day}.', { item: open.item.name, day: fmtDay(result.on) }),
            });
            state.retry();
          }}
        />
      ) : null}
      {open?.kind === 'include' ? (
        <IncludeDialog
          category={open.category}
          initial={open.initial}
          members={data?.category?.id === open.category.id ? data.category.members : null}
          reads={reads}
          failed={failed}
          rowNames={new Map(data?.rows.map((row) => [row.itemId, row.name]) ?? [])}
          categories={categories}
          onClose={closeAfter}
          onReread={state.retry}
          onSaved={(result) => {
            setOpen(null);
            toast({
              tone: 'success',
              title:
                result.moved > 0
                  ? t('dayb.include.saved_moved', 'حُفظت موادّ «{name}»: {n}، منها {moved} نُقلت من تصنيف آخر.', { name: open.category.name, n: fmtInt(result.count), moved: fmtInt(result.moved) })
                  : t('dayb.include.saved', 'حُفظت موادّ «{name}»: {n}.', { name: open.category.name, n: fmtInt(result.count) }),
            });
            state.retry();
          }}
        />
      ) : null}
      {open?.kind === 'category' ? (
        <CategoryDialog
          categories={categories}
          reads={reads}
          failed={failed}
          onReread={state.retry}
          onClose={() => setOpen(null)}
          onCreated={(created) => {
            // التصنيف الجديد يُعرض، ونافذة موادّه تُفتح فوقه فارغة (لا موادّ فيه بعد).
            go({ cat: created.id });
            setOpen({ kind: 'include', category: created, initial: [] });
          }}
        />
      ) : null}
      {open?.kind === 'day' && on !== null && today !== null ? (
        <PickDayDialog
          today={today}
          current={on}
          onClose={() => setOpen(null)}
          onPick={(picked) => {
            setOpen(null);
            toDay(picked);
          }}
        />
      ) : null}
    </section>
  );
}
