import { ArrowUpDown, ChevronLeft, ChevronRight, FileDown, NotebookPen, Palette, Printer } from 'lucide-react';
import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { DayField } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { PrintedAt, ReportFooter, ReportHeader, usePrintedAt, type InfoItem } from '../../components/ui/officialParts';
import { toast } from '../../components/ui/Toast';
import { addDays, type Day } from '../../domain/dates';
import { parseDayText } from '../../lib/dayText';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as dayBalance from '../../lib/repo/dayBalance';
import type { DayBalanceSections, DayNote, DayNoteResult, DayRow, DaySection, DaySectionKey, Named } from '../../lib/repo/dayBalance';
import { shownColor, type StoreColors } from '../../lib/repo/storeMarks';
import { baseUnitLabel } from '../../lib/storeLabels';
import { useLoad } from '../../lib/useLoad';
import { downloadFile, IMAGE_WIDTH, reportPdf, sendFile } from '../halls/reportImage';
import { ArrangeDialog } from './ArrangeDialog';
import { ColorsDialog } from './ColorsDialog';
import { MarkDialog, markSavedText } from './MarkDialog';
import { colorName, MARK_LOOK, stateWord, tintStyle } from './markColors';
import { itemFilePath } from './simple-shared';
import { itemsCountText } from './storeSections';
import './dayReport.css';

// «الرصيد اليومي» (كلمة المالك 2026-11-09، 0022، بصورة ورقته «رصيد مواد العلف — 4/11/2026»): جداول ليوم واحد مثل ورقته
// (ت | المادّة | الرصيد (كغم) | الملاحظات)، والرصيد = الرصيد الجاري بدفتر المادّة في نهاية ذلك اليوم، والصفر «-» كما في الورقة.
// و«المخزن بقسمين» (كلمة المالك 2026-11-21، عقد 0034/0035 S1): صفحة واحدة بجدول لكلّ قسم من day_balance_sections — «رصيد مواد العلف»
// و«رصيد العلف» دائماً، و«أخرى» إن لم يكن فارغاً — بلا اختيار تصنيف ولا مخزن («ازرار واضحة وبلا قوائم داخل قوائم»): التصنيفات ترتّب الصفوف
// بالخادم وتُدار من «إعداد المخزن». اليوم وحده في الرابط (?view=day&day=)، فالرجوع والنسخ يعيدان العرض نفسه، ورابط المادّة يحمل ?back= إليه.
// الأيام بسهمين («يحرك بالايام عن طريق سهمين يمين ويسار»): بالعربية السهم الأيمن إلى الخلف («اليوم السابق») والأيسر إلى الأمام، ولا يوم
// بعد اليوم. والتقرير رسميّ كتقارير القاعات (رسالة الزبون 2026-11-26: «ترتيب رسمي مرتب… وبالاعلى الاسماء الدالة»؛ كانت الطباعة ترسم صفّ أسماء
// الأعمدة الثابت بالتمرير في وسط الجدول فوق الصفّ الرابع): رأسٌ باسم المنشأة والعنوان وشبكة بيانات (التاريخ وعدد موادّ كلّ قسم ووقت الطباعة)، ثمّ
// لكلّ قسم جدول رسميّ بشريط اسمه وصفّ أسماء أعمدته (يتكرّر في كلّ صفحة مطبوعة)، ثمّ «أعدّه» والتوقيعات. يُطبع أو يُحفظ PDF من المتصفّح، و«أرسل
// PDF» يرسل ملفّ PDF بحجم A4 لا رسالة نصّية (رسالة الزبون نفسها: «لازم يروح على شكل بي دي اف»): الورقة نفسها صورةً ملفوفةً صفحاتٍ (reportPdf، لا
// مكتبة PDF: تشكيل العربية فيها غير مضمون). والطباعة والملفّ يُخفيان كلّ ما سوى الورقة (print:hidden). والملاحظة لكلّ مادّة لكلّ يوم لمن يعمل في
// المخازن (stock_note.write) بشرط ما رآه، فلا يمحو أحدٌ ملاحظة كتبها غيره دون أن يراها.

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

export interface DayParams {
  /** null: اليوم. */
  day: Day | null;
}

/** يوم بالتقويم بالرابط (YYYY-MM-DD): بقراءة parseDayText القائمة لا بـisDay، فلا يكبر بها وحدة التواريخ المحفوظة بالتثبيت المسبق. */
const dayOf = (value: string | null): Day | null => (value !== null && parseDayText(value.split('-').reverse().join('/')) === value ? value : null);

/** ما في الرابط بعد الفحص: يوم لا يصلح (غير موجود) كأنّه غائب، وما بقي من روابط قديمة (cat وstore) يُهمل. */
export function dayParams(search: URLSearchParams): DayParams {
  return { day: dayOf(search.get('day')) };
}

function dayQuery(params: DayParams): URLSearchParams {
  const query = new URLSearchParams({ view: 'day' });
  if (params.day !== null) query.set('day', params.day);
  return query;
}

/** رابط العرض نفسه (طريق الرجوع من ملفّ المادّة، backTarget يقبله). */
export function dayUrl(params: DayParams): string {
  return `/inventory?${dayQuery(params).toString()}`;
}

/** عنوان التقرير. */
export function reportTitle(): string {
  return t('dayb.title.sections', 'الرصيد اليومي');
}

/** سطر التاريخ. */
export function reportDate(on: Day): string {
  return t('dayb.on', 'بتاريخ {day}', { day: fmtDay(on) });
}

/** عنوان جدول القسم. */
export function sectionTitle(key: DaySectionKey): string {
  if (key === 'feed_materials') return t('dayb.section.feed_materials', 'رصيد مواد العلف');
  if (key === 'feed') return t('dayb.section.feed', 'رصيد العلف');
  return t('dayb.section.other', 'أخرى');
}

/** نصّ الجدول الفارغ لكلّ قسم («أخرى» لا يُعرض فارغاً). */
function sectionEmpty(key: DaySectionKey): string {
  if (key === 'feed_materials') return t('dayb.section.feed_materials.empty', 'لا موادّ علف بعد.');
  if (key === 'feed') return t('dayb.section.feed.empty', 'لا علف بعد.');
  return t('dayb.section.other.empty', 'لا موادّ أخرى.');
}

/** الأقسام المعروضة: «رصيد مواد العلف» و«رصيد العلف» دائماً، و«أخرى» إن كانت فيه صفوف. */
export function shownSections(data: Pick<DayBalanceSections, 'sections'>): DaySection[] {
  return data.sections.filter((section) => section.key !== 'other' || section.rows.length > 0);
}

/** اسم ملفّ PDF باليوم (لاتينيّ كاسم صورة تقرير القاعات: يُحفظ ويُرسل بلا مشكلة في كلّ جهاز). */
export const pdfName = (on: Day): string => `daily-balance-${on}.pdf`;

// الورقة A4 بالطول وحاشية 10 مم، وجداولها بخطّ 11 نقطة على الورق و12 في ملفّ PDF (والحشوة وتكرار صفّ الأسماء والجدول بلا تمرير في official.css)؛ واسم
// المادّة بلون النصّ لا بلون الرابط، وما يُخفى عند الطباعة يُخفى في الملفّ.
const PRINT_STYLE = [
  '@page { size: A4 portrait; margin: 10mm; }',
  '@media print {',
  '[data-action="day-report"] table { font-size: 11px; }',
  '[data-action="day-report"] a { color: inherit; }',
  '}',
  '[data-capture] { padding: 16px; }',
  '[data-capture] .print\\:hidden { display: none !important; }',
  '[data-capture] table { font-size: 12px; }',
  '[data-capture] a { color: inherit; }',
].join(' ');

/** رابط ملفّ المادّة ومعه طريق الرجوع إلى العرض نفسه. */
function itemLink(row: DayRow, here: string): string {
  return `${itemFilePath(row.itemId)}?${new URLSearchParams({ back: here }).toString()}`;
}

/**
 * أعمدة جدول القسم كورقة المالك: الوحدة في رأس «الرصيد» إن اتّحدت وحدات موادّ القسم، وإلّا عمود «الوحدة». «المادّة» بسطر واحد وزرّ الملاحظة
 * أوّل خليّتها (أقرب إلى الرصيد): بعرض الهاتف كان العمودان الملفوفان (عرض أدنى 48 لكلّ منهما) يدفعان زرّ الملاحظة خارج الشاشة (مراجعة 0022 P1).
 * وزرّ الملاحظة بحجم الإصبع (44). وbusy (الجداول تُقرأ من جديد): أزرار الملاحظات معطّلة، فلا تُفتح نافذة على ملاحظة من قراءة قديمة.
 */
export interface DayLook {
  colors: StoreColors;
  /** زرّ لون المادّة (stock_note.write)، أو null. */
  onMark: ((row: DayRow) => void) | null;
}

export function dayColumns(rows: readonly DayRow[], on: Day, here: string, onNote: ((row: DayRow) => void) | null, busy = false, look: DayLook | null = null): Column<DayRow>[] {
  const units = [...new Set(rows.map((row) => row.baseUnit))];
  const [single] = units.length === 1 ? units : [];
  const decimals = columnDecimals(rows.map((row) => row.qty), 3) as 0 | 1 | 2 | 3;
  const columns: Column<DayRow>[] = [
    { key: 'no', header: t('dayb.col.no', 'ت'), kind: 'number', cell: (_row, index) => <Num>{fmtInt(index + 1)}</Num> },
    {
      key: 'item',
      header: t('dayb.col.item', 'المادّة'),
      cell: (row) => (
        <>
          <Link to={itemLink(row, here)} className="font-medium text-brand-700 dark:text-brand-200" data-action="day-item">
            {row.name}
          </Link>
          {/* كلمة الحالة بجانب اللون التلقائيّ: اللون وحده لا يُفهم ولا يظهر بالطباعة بالأبيض والأسود (0040). وبسطر تحت الاسم: بجانبه كانت تعرّض
              عمود «المادّة» فيدفع زرّ اللون خارج الشاشة بعرض الهاتف. */}
          {look?.colors.auto && row.state ? (
            <span className="block text-xs font-semibold" data-action="day-state" data-state={row.state}>
              {stateWord(row.state)}
            </span>
          ) : null}
        </>
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
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50 print:hidden"
            aria-label={t('dayb.note.title', 'ملاحظة «{item}» ليوم {day}', { item: row.name, day: fmtDay(on) })}
            title={t('dayb.note.title', 'ملاحظة «{item}» ليوم {day}', { item: row.name, day: fmtDay(on) })}
            onClick={() => onNote(row)}
            disabled={busy}
            data-action="edit-note"
            data-id={row.itemId}
          >
            <NotebookPen aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        {/* زرّ اللون بعد زرّ الملاحظة: الملاحظة أوّل الخليّة أقرب إلى الرصيد (مراجعة 0022 P1). */}
        {look?.onMark ? <MarkButton row={row} colors={look.colors} busy={busy} onMark={look.onMark} /> : null}
        <span className="min-w-0" data-action="day-note">
          {row.note?.text ?? ''}
        </span>
      </span>
    ),
  });
  return columns;
}

/** زرّ لون المادّة في صفّها: دائرة بلونها الظاهر، أو أيقونة اللوحة بلا لون. بحجم الإصبع (44)، ولا يُطبع. */
function MarkButton({ row, colors, busy, onMark }: { row: DayRow; colors: StoreColors; busy: boolean; onMark: (row: DayRow) => void }) {
  const color = shownColor(row.mark, row.state, colors);
  const label = color
    ? t('dayb.mark.colored', 'لون «{item}»: {color}', { item: row.name, color: colorName(color) })
    : t('dayb.mark.none', 'لوّن «{item}»', { item: row.name });
  return (
    <button
      type="button"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50 print:hidden"
      aria-label={label}
      title={label}
      onClick={() => onMark(row)}
      disabled={busy}
      data-action="mark-item"
      data-id={row.itemId}
      data-color={color ?? undefined}
    >
      {color ? (
        <span aria-hidden="true" className="size-6 rounded-full border border-line" style={{ backgroundColor: MARK_LOOK[color].solid }} />
      ) : (
        <Palette aria-hidden="true" className="size-5" />
      )}
    </button>
  );
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
  | { kind: 'day' }
  | { kind: 'mark'; key: string; row: DayRow }
  | { kind: 'arrange'; section: DaySectionKey }
  | { kind: 'colors' };

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

/** رفض قراءة يعرف المستخدم طريقه منه: التلميح العربي من الخادم، وزرّ «اليوم» ليوم بعده أو يوم لا يُقرأ. */
function Refusal({ failure, day, onToday, onRetry }: { failure: unknown; day: Day | null; onToday: () => void; onRetry: () => void }) {
  if (!(failure instanceof RejectedError) || !failure.hint) return <LoadFailed what={t('dayb.what', 'الرصيد اليومي')} error={failure} onRetry={onRetry} />;
  const toToday = (failure.code === 'day_in_future' || failure.code === 'date_required') && day !== null;
  return (
    <Notice
      tone="warning"
      title={failure.hint}
      action={
        toToday ? (
          <Button variant="secondary" onClick={onToday} data-action="day-refusal-way">
            {t('dayb.today', 'اليوم')}
          </Button>
        ) : null
      }
    />
  );
}

/** شبكة بيانات الرصيد: التاريخ، وعدد موادّ كلّ قسم معروض، ووقت الطباعة. */
export function dayInfo(on: Day, sections: readonly DaySection[], printedAt: Date): InfoItem[] {
  return [
    { key: 'day', label: t('dayb.info.day', 'التاريخ'), value: <Num>{fmtDay(on)}</Num> },
    ...sections.map((section) => ({ key: `count-${section.key}`, label: sectionTitle(section.key), value: itemsCountText(section.rows.length) })),
    { key: 'printed', label: t('report.info.printed', 'طُبع في'), value: <PrintedAt at={printedAt} /> },
  ];
}

export function DayBalanceView({ orgName, by }: { orgName: string; by: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const day = dayOf(search.get('day'));
  const load = useCallback(() => dayBalance.loadDayBalanceSections(day), [day]);
  const here = dayUrl({ day });
  const state = useLoad(load, here);
  // آخر قراءة ناجحة: لليوم نفسه تبقى مرسومة أثناء القراءة من جديد (بعد حفظ ملاحظة)، ويوم الخادم منها للأسهم حين يتغيّر اليوم المعروض فلا
  // تختفي أثناء القراءة. وreads عدد القراءات الناجحة: نافذة الملاحظة تعرف به أنّ ما تعرضه قُرئ بعد رفضٍ طلب القراءة.
  const [kept, setKept] = useState<{ key: string; data: DayBalanceSections; reads: number } | null>(null);
  if (state.data !== null && (kept === null || kept.key !== here || kept.data !== state.data)) setKept({ key: here, data: state.data, reads: (kept?.reads ?? 0) + 1 });
  const data = state.data ?? (kept !== null && kept.key === here ? kept.data : null);
  const meta = state.data ?? kept?.data ?? null;
  const reads = kept?.reads ?? 0;
  // القراءة من جديد بعد رفض فشلت: النافذة تقول ذلك بـ«أعد القراءة».
  const failed = !state.loading && state.error !== null;
  const [open, setOpen] = useState<Open>(null);
  // نافذة ملاحظة لعرض آخر (رجع المستخدم بزرّ المتصفّح) لا تبقى: ملاحظتها ليوم غير المعروض.
  if ((open?.kind === 'note' || open?.kind === 'mark') && open.key !== here) setOpen(null);
  const go = (next: Day | null) => setSearch(dayQuery({ day: next }));
  const printed = usePrintedAt();
  // جذر العرض (كجذر تقرير الوجبة): نسخته تُصوَّر، فقواعد [data-capture] لما تحته (الورقة بلا إطار، وما يُخفى عند الطباعة) تنطبق على الورقة.
  const rootRef = useRef<HTMLElement>(null);
  // ملفّ PDF: يُجهَّز ثمّ يُرسل؛ وإن رفض المتصفّح فتح المشاركة بعد التجهيز (الضغطة «قديمة») يبقى جاهزاً لضغطة «أرسله» (كصورة تقرير القاعات).
  const [making, setMaking] = useState(false);
  const [ready, setReady] = useState<{ key: string; data: DayBalanceSections; file: File; title: string } | null>(null);
  // الملفّ الجاهز لما يُعرض وحده: لا يبقى لعرضٍ آخر (رجع المستخدم أو انتقل بالأسهم)، ولا بعد قراءة جديدة لما يُعرض (ملاحظة حُفظت، أو تجاوز يوم الخادم
  // منتصف الليل في عرض «اليوم»): يُرسل ما على الشاشة لا ما كان قبلها (مراجعة 2026-11-27).
  if (ready !== null && (ready.key !== here || ready.data !== data)) setReady(null);

  const today = meta?.today ?? null;
  const on = data?.on ?? day ?? today;
  const canNote = meta?.canNote === true;
  const canArrange = meta?.canArrange === true;
  const toDay = (target: Day) => go(today !== null && target >= today ? null : target);
  const sections = data ? shownSections(data) : [];
  const printable = data !== null && data.sections.some((section) => section.rows.length > 0);
  const title = data ? `${reportTitle()} ${reportDate(data.on)}` : reportTitle();
  const deliver = async (file: File, fileTitle: string, from: DayBalanceSections) => {
    const outcome = await sendFile(file, fileTitle);
    setReady(outcome === 'blocked' ? { key: here, data: from, file, title: fileTitle } : null);
    if (outcome === 'downloaded') toast({ tone: 'success', title: t('dayb.pdf.downloaded', 'حُفظ الملفّ «{name}» في التنزيلات على هذا الجهاز: أرسله من هناك إلى من تريد.', { name: file.name }) });
  };
  const sendPdf = async () => {
    const root = rootRef.current;
    if (!data || !root || making) return;
    setMaking(true);
    setReady(null);
    // «طُبع في» لحظة الملفّ، مكتوبةً في الورقة قبل أن تُنسخ.
    printed.stamp();
    let file: File;
    try {
      // فاتحٌ دائماً على ورقة بيضاء كالمطبوع: يُرسل لغير صاحب الجهاز، ولو كانت الصفحة بالسمة الداكنة.
      file = await reportPdf(root, pdfName(data.on), title, IMAGE_WIDTH, { light: true, background: 'rgb(255, 255, 255)' });
    } catch {
      setMaking(false);
      toast({ tone: 'danger', title: t('dayb.pdf.failed', 'تعذّر تجهيز ملفّ PDF على هذا الجهاز. اطبع التقرير واختر «حفظ بصيغة PDF» بدلاً من ذلك.') });
      return;
    }
    setMaking(false);
    await deliver(file, title, data);
  };
  const noteRow = open?.kind === 'note' ? (data?.sections.flatMap((section) => section.rows).find((row) => row.itemId === open.item.id) ?? null) : null;
  const closeAfter = (uncertain: boolean) => {
    setOpen(null);
    if (uncertain) state.retry();
  };
  const onNote = canNote && data ? (row: DayRow) => setOpen({ kind: 'note', key: here, item: { id: row.itemId, name: row.name }, day: data.on, shown: row.note }) : null;
  // لون المادّة لمن يكتب الملاحظات (stock_note.write)، وتظليل الصفّ بلونه الظاهر (0040).
  const look: DayLook | null = data ? { colors: data.colors, onMark: canNote ? (row: DayRow) => setOpen({ kind: 'mark', key: here, row }) : null } : null;
  const tinted = data
    ? {
        table: {},
        cell: (row: DayRow) => {
          const color = shownColor(row.mark, row.state, data.colors);
          return color ? { style: tintStyle(color), 'data-color': color } : {};
        },
      }
    : undefined;
  const afterSave = (title: string) => {
    setOpen(null);
    toast({ tone: 'success', title });
    state.retry();
  };

  return (
    <section ref={rootRef} className="flex flex-col gap-4" aria-label={t('board.view.day', 'الرصيد اليومي')} data-action="day-view">
      <style>{PRINT_STYLE}</style>
      {meta && on !== null && today !== null ? (
        <div className="flex flex-col gap-3 print:hidden" data-action="day-controls">
          <div className="flex flex-wrap items-center gap-2" data-action="day-bar">
            {/* بالهاتف السهمان وحدهما حول التاريخ (الاسم للقارئ الصوتي)، ومن sm الاسم ظاهر بجانب سهمه. وكلّ زرّ بارتفاع الإصبع (44). */}
            <Button variant="secondary" onClick={() => toDay(addDays(on, -1))} data-action="day-prev">
              <ChevronRight aria-hidden="true" className="size-5" />
              <span className="sr-only sm:not-sr-only">{t('dayb.prev', 'اليوم السابق')}</span>
            </Button>
            <Button variant="ghost" onClick={() => setOpen({ kind: 'day' })} aria-label={t('dayb.pick', 'اختر يوماً آخر (المعروض {day})', { day: fmtDay(on) })} data-action="day-pick">
              {fmtDay(on)}
            </Button>
            <Button variant="secondary" onClick={() => toDay(addDays(on, 1))} disabled={on >= today} data-action="day-next">
              <span className="sr-only sm:not-sr-only">{t('dayb.next', 'اليوم التالي')}</span>
              <ChevronLeft aria-hidden="true" className="size-5" />
            </Button>
            {on !== today ? (
              <Button variant="ghost" onClick={() => go(null)} data-action="day-today">
                {t('dayb.today', 'اليوم')}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => (data ? printAs(title) : undefined)} disabled={!printable} data-action="print-day">
              <Printer aria-hidden="true" className="size-5" />
              {t('dayb.print', 'اطبع أو احفظ PDF')}
            </Button>
            <Button variant="secondary" busy={making} onClick={() => void sendPdf()} disabled={!printable} data-action="share-day">
              <FileDown aria-hidden="true" className="size-5" />
              {t('dayb.pdf.send', 'أرسل PDF')}
            </Button>
            {canArrange && data ? (
              <Button variant="secondary" onClick={() => setOpen({ kind: 'colors' })} disabled={state.loading} data-action="day-colors">
                <Palette aria-hidden="true" className="size-5" />
                {t('dayb.colors', 'ألوان الرصيد')}
              </Button>
            ) : null}
          </div>
          {ready ? (
            <Notice
              tone="info"
              title={t('dayb.pdf.ready', 'الملفّ جاهز: اضغط «أرسله» لتختار التطبيق ومن ترسله إليه.')}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void deliver(ready.file, ready.title, ready.data)} data-action="day-pdf-send-ready">
                    {t('dayb.pdf.send_ready', 'أرسله')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      downloadFile(ready.file);
                      setReady(null);
                    }}
                    data-action="day-pdf-download-ready"
                  >
                    {t('dayb.pdf.download', 'نزّله')}
                  </Button>
                </div>
              }
            />
          ) : null}
        </div>
      ) : null}
      {state.error ? (
        // رسالة الشاشة لا تُطبع ولا تدخل ملفّ PDF (النسخة المصوَّرة تُخفي print:hidden): الورقة وحدها (مراجعة 2026-11-27).
        <div className="print:hidden" data-action="day-error">
          <Refusal failure={state.error} day={day} onToday={() => go(null)} onRetry={state.retry} />
        </div>
      ) : null}
      {data ? (
        // الورقة الرسمية (ما يُطبع ويُرسل PDF): الرأس بشبكة البيانات، ثمّ جدول لكلّ قسم بشريط اسمه، ثمّ التذييل بالتوقيعات.
        <article className="ofc-paper" data-action="day-report">
          <ReportHeader org={orgName} orgAction="day-org" title={reportTitle()} titleAction="day-title" level={2} info={dayInfo(data.on, sections, printed.at)} />
          {sections.map((section) => (
            <section key={section.key} aria-label={sectionTitle(section.key)} data-action="day-section" data-key={section.key}>
              {/* «رتّب» فوق جدول القسم (0040)، لا يُطبع ولا يدخل ملفّ PDF. */}
              {canArrange && section.rows.length > 1 ? (
                <div className="flex justify-end py-2 print:hidden">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ArrowUpDown aria-hidden="true" className="size-4" />}
                    onClick={() => setOpen({ kind: 'arrange', section: section.key })}
                    disabled={state.loading}
                    aria-label={t('dayb.arrange.section', 'رتّب «{section}»', { section: sectionTitle(section.key) })}
                    data-action="arrange-section"
                    data-key={section.key}
                  >
                    {t('dayb.arrange', 'رتّب')}
                  </Button>
                </div>
              ) : null}
              {/* sm: بالهاتف الملاحظات بلا عرض أدنى فيأخذ اسم المادّة ما بقي (كورقة القاعة)، ومن 640 كالباقي. */}
              <DataTable
                variant="official"
                size="sm"
                title={sectionTitle(section.key)}
                titleLevel={3}
                caption={`${sectionTitle(section.key)} ${reportDate(data.on)}`}
                columns={dayColumns(section.rows, data.on, here, onNote, state.loading, look)}
                rows={section.rows}
                rowKey={(row) => row.itemId}
                grid={tinted}
                onRowClick={(row) => navigate(itemLink(row, here))}
                empty={sectionEmpty(section.key)}
              />
            </section>
          ))}
          <ReportFooter by={by} at={printed.at} />
        </article>
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
      {open?.kind === 'mark' && data ? (
        <MarkDialog
          item={{ id: open.row.itemId, name: open.row.name, baseUnit: open.row.baseUnit }}
          shown={open.row.mark}
          colors={data.colors}
          onClose={closeAfter}
          onSaved={(mark, request) => afterSave(markSavedText({ id: open.row.itemId, name: open.row.name, baseUnit: open.row.baseUnit }, mark, request))}
        />
      ) : null}
      {open?.kind === 'arrange' ? (
        <ArrangeDialog
          section={open.section}
          title={sectionTitle(open.section)}
          onClose={() => setOpen(null)}
          onSaved={() => afterSave(t('dayb.arrange.saved', 'حُفظ ترتيب «{section}»: بهذا الترتيب تظهر في البطاقات والرصيد اليوميّ.', { section: sectionTitle(open.section) }))}
        />
      ) : null}
      {open?.kind === 'colors' && meta ? (
        <ColorsDialog
          colors={meta.colors}
          failed={failed}
          onClose={closeAfter}
          onReread={state.retry}
          onSaved={(saved) =>
            afterSave(saved.auto ? t('dayb.colors.saved_auto', 'حُفظت ألوان الرصيد: التلوين التلقائيّ مشغَّل.') : t('dayb.colors.saved_off', 'حُفظت ألوان الرصيد: التلوين التلقائيّ مطفأ.'))
          }
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
