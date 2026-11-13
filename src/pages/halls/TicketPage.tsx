import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import { WeightPad } from '../../components/ui/WeightPad';
import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { Milli } from '../../domain/money';
import { averageInRange, ticketNets, type StopNet, type TicketNets, type WeighMethod } from '../../domain/weighTicket';
import { parseDayText } from '../../lib/dayText';
import { RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { finishWeighTicket, loadTicketOptions, loadWeighTicket, saveWeighTicket, voidWeighTicket, type OptionsHall, type TicketDraft, type TicketOptions, type WeighTicket } from '../../lib/repo/weighTickets';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { failureText, surelyUnsaved } from './GivePage';
import { BackLink, printAs } from './parts';
import { invoicePath, kgDecimals, newTicketPath, salePath, statusLabel, ticketBack, ticketBackLabel, ticketName, TicketPaper, ticketPath } from './ticketParts';

// تذكرة الوزن (0028، كلمة المالك 2026-11-12، العقد §10): /halls/ticket/new?site=&hall= و/halls/ticket/:id. «وزن الفارغ» أوّلاً (لوحة الوزن) و«وُزن مع
// الأقفاص» (مفتوح افتراضاً؛ وبلاه «وزن القفص» مقترحاً من آخر تذكرة)، ثمّ «أضف قاعة» ولكلّ قاعة عدد طيورها وأقفاصها و«وزن الخابط بعد هذه القاعة»، أو
// وزنات ميزان الأقفاص. صافي كلّ قاعة ومعدّل طيرها ومجاميع التذكرة من المرآة (domain/weighTicket) وهي تُكتب. والحفظ بعد كلّ وزنة تُعتمد، بشرط النسخة:
// «تغيّرت» تعرض النسختين ولا تكتب، وما كُتب ولم يُحفظ في الجهاز بمفتاح المستخدم والمنشأة والتذكرة حتى يُحفظ. ثمّ «أكمل التذكرة» بتأكيد يقول إنّها
// تأخذ رقماً ولا تُعدَّل، وإنّ الطيور لا تنقص حتى تصدر الفاتورة (O1). والمكتملة ورقة A5 بلا سعر ولا تاجر، ومنها «أصدر الفاتورة» لمن يصدرها، و«ألغِ
// التذكرة» للمدير ما لم تصدر فاتورتها. تحتاج الخادم لتُفتح (D9)، والحزمة خارج التثبيت المسبق.

const PRINT_STYLE = ['@page { size: A5 portrait; margin: 9mm; }', '@media print {', '[data-action="ticket-paper"] table { font-size: 11px; }', '[data-action="ticket-paper"] { box-shadow: none; border: 0; }', '}'].join(' ');
const MAX_STOPS = 20;
const dash = () => t('halls.ticket.dash', '—');

// ─── نسخة الجهاز ممّا كُتب ولم يُحفظ ──────────────────────────────────────────────────────────────────────────────

interface WeighingForm {
  id: string;
  crates: string;
  gross: string;
}

interface StopForm {
  id: string;
  hallId: string;
  birds: string;
  crates: string;
  gross: string;
  weighings: WeighingForm[];
}

/** التذكرة كما تُكتب: نصوص كما في خاناتها (اليوم فارغ = يوم الخادم). */
interface TicketForm {
  day: string;
  method: WeighMethod;
  empty: string;
  withCrates: boolean;
  crate: string;
  vehicle: string;
  driver: string;
  note: string;
  stops: StopForm[];
}

/** ما يُحفظ في الجهاز: التذكرة ومعرّفها وحقلها، والنسخة التي كُتب فوقها (null لتذكرة لم تُحفظ بعد). */
interface DeviceCopy {
  id: string;
  siteId: string;
  baseVersion: number | null;
  form: TicketForm;
}

const memory = new Map<string, string>();
const copyKey = (scope: string, id: string): string => `halls.ticket:${scope}:${id}`;
const newKey = (scope: string, siteId: string): string => `halls.ticket:${scope}:new:${siteId}`;

/** يكتب في الجهاز (localStorage يبقى بعد إغلاق التبويب) أو يمحو بـnull، والذاكرة إن تعذّر. */
function keep(key: string, value: unknown): void {
  const text = value === null ? null : JSON.stringify(value);
  if (text === null) memory.delete(key);
  else memory.set(key, text);
  try {
    if (text === null) localStorage.removeItem(key);
    else localStorage.setItem(key, text);
  } catch {
    // بلا localStorage (تصفّح خاصّ أو ممنوع): الذاكرة وحدها لعمر الصفحة.
  }
}

/** النصّ من localStorage حين يعمل (null = لا نسخة، ولو بقيت في ذاكرة الصفحة: محاها تبويب آخر بعد حفظه)، وإلّا undefined. */
function fromStorage(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch { // swallow-ok: localStorage ممنوع؛ الذاكرة بعده
    return undefined;
  }
}

function kept(key: string): unknown {
  const stored = fromStorage(key);
  const text = stored === undefined ? (memory.get(key) ?? null) : stored;
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch { // swallow-ok: نصّ تالف لم يكتبه keep؛ لا نسخة تُستعاد منه
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function asCopy(value: unknown, id: string): DeviceCopy | null {
  if (!isRecord(value) || value.id !== id || typeof value.siteId !== 'string' || !(value.baseVersion === null || typeof value.baseVersion === 'number')) return null;
  const form = value.form;
  if (!isRecord(form) || !Array.isArray(form.stops) || (form.method !== 'scale' && form.method !== 'crates')) return null;
  return value as unknown as DeviceCopy;
}

// ─── من التذكرة إلى النموذج وبالعكس ─────────────────────────────────────────────────────────────────────────────

/** نصّ لوحة الوزن من كيلو بالآلاف: «7000» و«515.5» (بلا فواصل ولا أصفار زائدة). */
const weightText = (value: Milli | null): string => (value === null ? '' : decimalText(value, 3).replace(/\.?0+$/u, ''));
const countText = (value: number | null): string => (value === null ? '' : String(value));

function formFromTicket(ticket: WeighTicket): TicketForm {
  return {
    day: fmtDay(ticket.onDate),
    method: ticket.method,
    empty: weightText(ticket.emptyKg),
    withCrates: ticket.emptyWithCrates ?? true,
    crate: weightText(ticket.crateKg),
    vehicle: ticket.vehicle ?? '',
    driver: ticket.driver ?? '',
    note: ticket.note ?? '',
    stops: ticket.stops.map((stop) => ({
      id: stop.id,
      hallId: stop.hallId,
      birds: countText(stop.birds),
      crates: ticket.method === 'scale' ? countText(stop.crates) : '',
      gross: ticket.method === 'scale' ? weightText(stop.grossKg) : '',
      weighings: stop.weighings.map((weighing) => ({ id: weighing.id, crates: String(weighing.crates), gross: weightText(weighing.grossKg) })),
    })),
  };
}

const freshStop = (hallId: string): StopForm => ({ id: crypto.randomUUID(), hallId, birds: '', crates: '', gross: '', weighings: [] });

function freshForm(hallId: string | null): TicketForm {
  return { day: '', method: 'scale', empty: '', withCrates: true, crate: '', vehicle: '', driver: '', note: '', stops: hallId ? [freshStop(hallId)] : [] };
}

/** وزن من نصّ: الكيلو بالآلاف أكبر من صفر حتى الحدّ، بثلاث مراتب على الأكثر. */
function weightOf(text: string, max: Milli): { value: Milli | null; bad: boolean } {
  if (text.trim() === '') return { value: null, bad: false };
  const parsed = parseDecimal(text, 3);
  if (parsed === null) return { value: null, bad: true };
  const value = toScale(parsed, 3);
  return value > 0n && value <= max ? { value, bad: false } : { value: null, bad: true };
}

/** عدد صحيح من نصّ أرقام بين حدّين. */
function countOf(text: string, min: number, max: number): { value: number | null; bad: boolean } {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, bad: false };
  if (!/^[0-9]{1,9}$/u.test(trimmed)) return { value: null, bad: true };
  const value = Number(trimmed);
  return value >= min && value <= max ? { value, bad: false } : { value: null, bad: true };
}

const KG_200T: Milli = 200_000_000n;
const KG_100T: Milli = 100_000_000n;
const KG_100: Milli = 100_000n;

interface Parsed {
  /** null ما دامت خانة لا تُقرأ: لا حفظ حتى تُصحَّح (ما يُكتب يبقى في الجهاز). */
  draft: TicketDraft | null;
  day: Day | null;
  errors: Record<string, string>;
  nets: TicketNets;
}

function parseForm(form: TicketForm, siteId: string, defaultDay: Day | null): Parsed {
  const errors: Record<string, string> = {};
  const day = form.day.trim() === '' ? defaultDay : parseDayText(form.day);
  if (day === null && form.day.trim() !== '') errors.day = t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.');
  const weight = (key: string, text: string, max: Milli, message: string): Milli | null => {
    const { value, bad } = weightOf(text, max);
    if (bad) errors[key] = message;
    return value;
  };
  const count = (key: string, text: string, min: number, max: number, message: string): number | null => {
    const { value, bad } = countOf(text, min, max);
    if (bad) errors[key] = message;
    return value;
  };
  const scale = form.method === 'scale';
  const weightMessage = t('halls.ticket.bad_weight', 'الوزن بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.');
  const emptyKg = scale ? weight('empty', form.empty, KG_200T, weightMessage) : null;
  const needCrate = !scale || !form.withCrates;
  const crateKg = needCrate ? weight('crate', form.crate, KG_100, t('constraint.weigh_tickets_crate_kg_check', 'وزن القفص الفارغ بالكيلوغرام أكبر من صفر حتى 100، بثلاث مراتب عشرية على الأكثر.')) : null;
  const birdsMessage = t('halls.ticket.bad_count', 'عدد الطيور عدد صحيح من 1 إلى 10,000,000.');
  const stops = form.stops.map((stop) => ({
    id: stop.id,
    hallId: stop.hallId,
    birds: count(`birds:${stop.id}`, stop.birds, 1, 10_000_000, birdsMessage),
    crates: scale ? count(`crates:${stop.id}`, stop.crates, 0, 100_000, t('constraint.weigh_ticket_stops_crates_check', 'عدد أقفاص القاعة من صفر إلى 100,000.')) : null,
    grossKg: scale ? weight(`gross:${stop.id}`, stop.gross, KG_200T, weightMessage) : null,
    weighings: scale
      ? []
      : stop.weighings.flatMap((weighing) => {
          const crates = count(`wc:${weighing.id}`, weighing.crates, 1, 1000, t('constraint.weigh_ticket_weighings_crates_check', 'عدد أقفاص الوزنة من 1 إلى 1,000.'));
          const grossKg = weight(`wg:${weighing.id}`, weighing.gross, KG_100T, t('constraint.weigh_ticket_weighings_gross_check', 'وزن الوزنة بالكيلوغرام أكبر من صفر حتى 100,000، بثلاث مراتب عشرية على الأكثر.'));
          return crates !== null && grossKg !== null ? [{ id: weighing.id, crates, grossKg }] : [];
        }),
  }));
  if (form.vehicle.trim().length > 40) errors.vehicle = t('halls.ticket.vehicle_long', 'رقم السيارة حتى 40 حرفاً.');
  if (form.driver.trim().length > 40) errors.driver = t('halls.ticket.driver_long', 'اسم السائق حتى 40 حرفاً.');
  if (form.note.trim().length > 500) errors.note = t('halls.ticket.note_long', 'الملاحظة حتى 500 حرف.');
  const nets = ticketNets({ method: form.method, emptyKg, emptyWithCrates: form.withCrates, crateKg, stops });
  const ok = Object.keys(errors).length === 0 && day !== null;
  return {
    draft: ok ? { siteId, onDate: day, method: form.method, emptyKg, emptyWithCrates: form.withCrates, crateKg, vehicle: form.vehicle, driver: form.driver, note: form.note, stops } : null,
    day,
    errors,
    nets,
  };
}

// ─── نصوص الصافي والنقص ──────────────────────────────────────────────────────────────────────────────────────────

/** رقم الكيلو وحده بمراتبه («10,000» و«515.5»)، والوحدة في الجملة أو رأس العمود. */
const kgNum = (value: Milli): string => fmtQtyCell(value, kgDecimals([value]));

/** رقمان معروفان لا يستقيمان (رفض الخادم نفسه بجملته)، أو null. */
function stopProblemText(net: StopNet, hall: string): string | null {
  if (net.problem === 'not_rising' && net.grossKg !== null && net.prevGrossKg !== null) {
    return t('halls.ticket.not_rising', 'وزن الخابط بعد «{hall}» ({gross}) لا يزيد على الذي قبله ({prev}). راجع الوزن.', { hall, gross: kgNum(net.grossKg), prev: kgNum(net.prevGrossKg) });
  }
  if (net.problem === 'not_positive' && net.netKg !== null) return t('halls.ticket.net_not_positive', 'صافي «{hall}» = {net} كغم، وهو ليس أكبر من صفر. راجع الأوزان وعدد الأقفاص.', { hall, net: kgNum(net.netKg) });
  return null;
}

/** أوّل ما ينقص التذكرة لتكتمل، بترتيب جملة الخادم (ticket_incomplete)، أو null. */
function firstMissing(form: TicketForm, parsed: Parsed, hallName: (hallId: string) => string): string | null {
  const scale = form.method === 'scale';
  if (!form.stops.length) return t('halls.ticket.need.stops', 'أضف قاعة واحدة على الأقلّ.');
  if (scale && form.empty.trim() === '') return t('halls.ticket.need.empty', 'وزن الفارغ');
  if ((!scale || !form.withCrates) && form.crate.trim() === '') return t('halls.ticket.need.crate', 'وزن القفص');
  for (const stop of form.stops) if (stop.birds.trim() === '') return t('halls.ticket.need.birds', 'عدد طيور قاعة «{hall}»', { hall: hallName(stop.hallId) });
  if (scale && !form.withCrates) for (const stop of form.stops) if (stop.crates.trim() === '') return t('halls.ticket.need.crates', 'عدد أقفاص قاعة «{hall}»', { hall: hallName(stop.hallId) });
  if (scale) for (const stop of form.stops) if (stop.gross.trim() === '') return t('halls.ticket.need.gross', 'وزن الخابط بعد قاعة «{hall}»', { hall: hallName(stop.hallId) });
  if (!scale) for (const stop of form.stops) if (!stop.weighings.length) return t('halls.ticket.need.weighings', 'وزنات قاعة «{hall}»', { hall: hallName(stop.hallId) });
  return parsed.nets.netKg === null ? t('halls.ticket.need.nets', 'صوافي القاعات') : null;
}

// ─── لوحة الوزن ──────────────────────────────────────────────────────────────────────────────────────────────────

type PadTarget = { kind: 'empty' } | { kind: 'gross'; stopId: string } | { kind: 'weighing'; stopId: string };

function PadDialog({ title, initial, weighing, onClose, onCommit }: { title: string; initial: string; weighing: boolean; onClose: () => void; onCommit: (weight: string, crates: string) => void }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [crates, setCrates] = useState('');
  const weight = weightOf(value, weighing ? KG_100T : KG_200T);
  const crateCount = countOf(crates, 1, 1000);
  const ready = weight.value !== null && (!weighing || crateCount.value !== null);
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      dirty={value !== initial || crates !== ''}
      footer={
        <Button size="lg" disabled={!ready} onClick={() => onCommit(value, crates)} data-action="pad-commit">
          {t('halls.ticket.pad.commit', 'اعتمد الوزن')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {weighing ? (
          <Field id={`${id}-crates`} label={t('halls.ticket.weighing.crates', 'عدد أقفاص الوزنة')} error={crateCount.bad ? t('constraint.weigh_ticket_weighings_crates_check', 'عدد أقفاص الوزنة من 1 إلى 1,000.') : null}>
            <input id={`${id}-crates`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={crates} onChange={(event) => setCrates(event.target.value)} data-action="pad-crates" />
          </Field>
        ) : null}
        <WeightPad value={value} onChange={setValue} />
        {weight.bad ? (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
            {weighing
              ? t('constraint.weigh_ticket_weighings_gross_check', 'وزن الوزنة بالكيلوغرام أكبر من صفر حتى 100,000، بثلاث مراتب عشرية على الأكثر.')
              : t('halls.ticket.bad_weight', 'الوزن بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.')}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

// ─── المحرّر (المسوّدة) ───────────────────────────────────────────────────────────────────────────────────────────

interface EditorProps {
  ticketId: string;
  siteId: string;
  /** null لتذكرة لم تُحفظ بعد. */
  initial: WeighTicket | null;
  hallId: string | null;
  back: string;
  /** أوّل حفظ لتذكرة جديدة: الرابط يصير رابطها. */
  onFirstSave: (ticket: WeighTicket) => void;
  /** اكتملت التذكرة أو حُذفت مسوّدتها. */
  onFinished: (ticket: WeighTicket) => void;
  onDeleted: () => void;
}

function TicketEditor({ ticketId, siteId, initial, hallId, back, onFirstSave, onFinished, onDeleted }: EditorProps) {
  const id = useId();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const scope = workspace ? `${workspace.userId}:${workspace.orgId}` : '';
  const loadOptions = useCallback(() => loadTicketOptions(siteId), [siteId]);
  const optionsState = useLoad(loadOptions);
  const [keptOptions, setKeptOptions] = useState<TicketOptions | null>(null);
  if (optionsState.data !== null && optionsState.data !== keptOptions) setKeptOptions(optionsState.data);
  const options = keptOptions?.kind === 'site' ? keptOptions : null;

  /**
   * نسخة الجهاز عند الفتح: تُستعاد ما دامت فوق نسخة الخادم نفسها؛ وفوق غيرها «تغيّرت» بالنسختين. وsaved ما في الخادم (أو النموذج الفارغ لتذكرة
   * جديدة): «فيها ما لم يُحفظ» حين يختلف عنه ما في الخانات.
   */
  const [start] = useState(() => {
    const copy = scope ? asCopy(kept(copyKey(scope, ticketId)), ticketId) : null;
    const saved = initial ? formFromTicket(initial) : freshForm(hallId);
    if (copy && copy.siteId === siteId) return { form: copy.form, saved: initial ? saved : freshForm(null), stale: copy.baseVersion === (initial?.version ?? null) ? null : initial };
    return { form: saved, saved, stale: null };
  });
  const [form, setForm] = useState<TicketForm>(start.form);
  const [savedForm, setSavedForm] = useState<TicketForm>(start.saved);
  const [base, setBase] = useState<WeighTicket | null>(initial);
  const [stale, setStale] = useState<WeighTicket | null>(start.stale);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [pad, setPad] = useState<PadTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** مرجع «أكمل التذكرة» و«احذف المسوّدة» مرّة لكلّ محاولة: الإعادة بعد نتيجة مجهولة به. */
  const [finishRef, setFinishRef] = useState<string | null>(null);
  const [deleteRef, setDeleteRef] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<'finish' | 'delete' | null>(null);
  const sending = useRef(false);

  const today = options?.today ?? null;
  const parsed = parseForm(form, siteId, today);
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);
  useDirtyForm(dirty || busy);

  // ما كُتب ولم يُحفظ في الجهاز (بمفتاح المستخدم والمنشأة والتذكرة) فوق النسخة التي كُتب فوقها، ويُمحى حين يُحفظ.
  useEffect(() => {
    if (!scope) return;
    if (dirty || stale) {
      keep(copyKey(scope, ticketId), { id: ticketId, siteId, baseVersion: base?.version ?? null, form } satisfies DeviceCopy);
      if (base === null) keep(newKey(scope, siteId), ticketId);
    } else {
      keep(copyKey(scope, ticketId), null);
    }
  }, [scope, ticketId, siteId, base, form, dirty, stale]);

  const hallsById = new Map<string, OptionsHall>((options?.halls ?? []).map((hall) => [hall.hallId, hall]));
  const savedStop = (stopId: string) => base?.stops.find((stop) => stop.id === stopId) ?? null;
  const hallName = (hallId: string): string => hallsById.get(hallId)?.name ?? base?.stops.find((stop) => stop.hallId === hallId)?.hallName ?? stale?.stops.find((stop) => stop.hallId === hallId)?.hallName ?? '';
  const missing = firstMissing(form, parsed, hallName);
  const problems = parsed.nets.stops.flatMap((net, index) => {
    const text = stopProblemText(net, hallName(form.stops[index]?.hallId ?? ''));
    return text ? [text] : [];
  });
  const outOfRange = form.stops.flatMap((stop, index) => {
    const net = parsed.nets.stops[index];
    const birds = countOf(stop.birds, 1, 10_000_000).value;
    if (!net || net.netKg === null || net.problem !== null || birds === null || averageInRange(net.netKg, birds)) return [];
    return [t('halls.ticket.avg_out', 'معدّل الطير في «{hall}» = {avg} كغم، وهو خارج المعقول (0.3 إلى 6 كغم). راجع العدد أو الوزن.', { hall: hallName(stop.hallId), avg: net.avgKg === null ? dash() : fmtQtyCell(net.avgKg, 3) })];
  });
  const future = parsed.day !== null && today !== null && parsed.day > today;
  const dayProblem = future ? t('day.future', 'التاريخ بعد اليوم.') : parsed.day !== null && options && parsed.day < options.earliestOn ? t('halls.ticket.day_old', 'أقدم يوم تكتمل به التذكرة {day}.', { day: fmtDay(options.earliestOn) }) : null;
  const allowed = base ? base.can.edit : options?.canCreate === true;
  const locked = busy || unknown !== null || !allowed;
  const canSave = allowed && dirty && parsed.draft !== null && problems.length === 0 && !future && !busy && unknown === null && stale === null;
  const finishBlock = missing ?? problems[0] ?? outOfRange[0] ?? dayProblem;
  const canFinish = base !== null && base.can.finish && !dirty && stale === null && finishBlock === null && !busy && unknown === null;

  /** حفظ بشرط النسخة (الحفظ بعد كلّ وزنة تُعتمد، و«احفظ التذكرة»، و«احفظ ما كتبته فوقها» بنسخة الخادم الجديدة). */
  const save = async (next: TicketForm, expected: number | null = base?.version ?? null) => {
    const check = parseForm(next, siteId, today);
    const draft = check.draft;
    // رقمان لا يستقيمان (خابط لا يزيد، أو صافٍ ليس أكبر من صفر) أو يوم قادم: يرفضه الخادم، فلا يُرسل؛ وما كُتب باقٍ في الجهاز بجملة مشكلته.
    const blocked = check.nets.stops.some((net) => net.problem === 'not_rising' || net.problem === 'not_positive') || (check.day !== null && today !== null && check.day > today);
    if (!draft || blocked || sending.current || !allowed) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = await saveWeighTicket(ticketId, expected, draft);
      if (result.status === 'stale') {
        setStale(result.server);
        return;
      }
      const ticket = result.ticket ?? (await loadWeighTicket(ticketId));
      setBase(ticket);
      setSavedForm(next);
      setStale(null);
      if (base === null) {
        if (scope) {
          keep(copyKey(scope, ticketId), null);
          keep(newKey(scope, siteId), null);
        }
        onFirstSave(ticket);
      }
    } catch (problem) {
      setFailure(problem);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const change = (patch: Partial<TicketForm>) => {
    setFailure(null);
    setForm((current) => ({ ...current, ...patch }));
  };
  const changeStop = (stopId: string, patch: Partial<StopForm>) => change({ stops: form.stops.map((stop) => (stop.id === stopId ? { ...stop, ...patch } : stop)) });

  /** وزنة تُعتمد من اللوحة: تُكتب ثمّ تُحفظ التذكرة (الحفظ بعد كلّ وزنة). */
  const commit = (target: PadTarget, weight: string, crates: string) => {
    const next: TicketForm =
      target.kind === 'empty'
        ? { ...form, empty: weight }
        : target.kind === 'gross'
          ? { ...form, stops: form.stops.map((stop) => (stop.id === target.stopId ? { ...stop, gross: weight } : stop)) }
          : { ...form, stops: form.stops.map((stop) => (stop.id === target.stopId ? { ...stop, weighings: [...stop.weighings, { id: crypto.randomUUID(), crates, gross: weight }] } : stop)) };
    setPad(null);
    setForm(next);
    setFailure(null);
    if (stale === null) void save(next);
  };

  const removeWeighing = (stopId: string, weighingId: string) => {
    const next = { ...form, stops: form.stops.map((stop) => (stop.id === stopId ? { ...stop, weighings: stop.weighings.filter((weighing) => weighing.id !== weighingId) } : stop)) };
    setForm(next);
    if (base && stale === null) void save(next);
  };

  const removeStop = (stopId: string) => {
    const next = { ...form, stops: form.stops.filter((stop) => stop.id !== stopId) };
    setForm(next);
    if (base && stale === null) void save(next);
  };

  // وزن القفص مقترحاً من آخر تذكرة حين يلزم (ميزان الأقفاص، أو الفارغ بلا أقفاص).
  const suggestCrate = (crate: string): string => (crate === '' && options?.lastCrateKg ? weightText(options.lastCrateKg) : crate);
  const setMethod = (method: WeighMethod) => change({ method, crate: method === 'crates' ? suggestCrate(form.crate) : form.crate });
  const setWithCrates = (withCrates: boolean) => change({ withCrates, crate: withCrates ? form.crate : suggestCrate(form.crate) });

  const keepMine = () => {
    if (stale) void save(form, stale.version);
  };
  const takeServer = () => {
    if (!stale) return;
    const server = formFromTicket(stale);
    setBase(stale);
    setForm(server);
    setSavedForm(server);
    setStale(null);
  };

  const finish = async () => {
    if (!base || sending.current) return;
    const ref = finishRef ?? crypto.randomUUID();
    setFinishRef(ref);
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const done = await finishWeighTicket(ref, ticketId, base.version);
      if (scope) keep(copyKey(scope, ticketId), null);
      setConfirmFinish(false);
      setUnknown(null);
      toast({ tone: 'success', title: t('halls.ticket.finished', 'اكتملت التذكرة {no}.', { no: ticketName(done.ticketNo) }) });
      onFinished(done);
    } catch (problem) {
      setConfirmFinish(false);
      if (!surelyUnsaved(problem)) {
        // لا نعرف إن اكتملت: الإعادة بالمرجع نفسه (لا تكتمل مرّتين، ولا تأخذ رقمين).
        setUnknown('finish');
      } else {
        setFinishRef(null);
        setUnknown(null);
        setFailure(problem);
        if (problem instanceof RejectedError && problem.code === 'stale_ticket') {
          // تغيّرت منذ فتحتها: تُقرأ، وتُعرض النسختان إن كان فيها ما لم يُحفظ.
          try {
            const server = await loadWeighTicket(ticketId);
            if (server.status !== 'draft') onFinished(server);
            else setStale(server);
          } catch {
            // القراءة فشلت: الرفض معروض، و«أكمل التذكرة» بعده يعيد المحاولة.
          }
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  /** «احذف المسوّدة»: المحفوظة تُلغى في الخادم (بلا سبب)، وغير المحفوظة تُمحى من الجهاز. */
  const remove = async () => {
    if (sending.current) return;
    if (!base) {
      if (scope) {
        keep(copyKey(scope, ticketId), null);
        keep(newKey(scope, siteId), null);
      }
      setConfirmDelete(false);
      onDeleted();
      return;
    }
    const ref = deleteRef ?? crypto.randomUUID();
    setDeleteRef(ref);
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await voidWeighTicket(ticketId, null, ref);
      if (scope) keep(copyKey(scope, ticketId), null);
      setConfirmDelete(false);
      setUnknown(null);
      toast({ tone: 'success', title: t('halls.ticket.deleted', 'حُذفت مسوّدة التذكرة.') });
      onDeleted();
    } catch (problem) {
      setConfirmDelete(false);
      if (!surelyUnsaved(problem)) setUnknown('delete');
      else {
        setDeleteRef(null);
        setUnknown(null);
        setFailure(problem);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const inTicket = new Set(form.stops.map((stop) => stop.hallId));
  const addable = (options?.halls ?? []).filter((hall) => hall.flock !== null && !inTicket.has(hall.hallId));
  const scale = form.method === 'scale';
  const totals = parsed.nets;
  const totalKg = kgDecimals([...totals.stops.map((stop) => stop.netKg), totals.netKg]);
  const shownKg = (text: string, max: Milli): string => {
    const value = weightOf(text, max).value;
    return value === null ? text : kgNum(value);
  };
  const padStop = pad && pad.kind !== 'empty' ? form.stops.find((stop) => stop.id === pad.stopId) : undefined;

  const stateLine = busy
    ? t('halls.ticket.saving', 'جارٍ الحفظ…')
    : stale
      ? t('halls.ticket.state.stale', 'تغيّرت التذكرة في الخادم: اختر النسخة.')
      : dirty
        ? t('halls.ticket.state.dirty', 'فيها ما لم يُحفظ بعد (محفوظ في هذا الجهاز).')
        : base
          ? t('halls.ticket.state.saved', 'محفوظة (النسخة {v}).', { v: base.version })
          : t('halls.ticket.state.new', 'تذكرة جديدة لم تُحفظ بعد.');

  return (
    <div className="flex flex-col gap-4" data-action="ticket-editor">
      <BackLink to={back} label={ticketBackLabel(back)} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-action="ticket-title">
          {t('halls.ticket.title_draft', 'تذكرة وزن (مسوّدة) — {site}', { site: options?.site.name ?? base?.siteName ?? '' })}
        </h1>
        <p role="status" className="text-sm text-ink-muted" data-action="ticket-state">
          {stateLine}
        </p>
      </header>
      {optionsState.error && !options ? <LoadFailed what={t('halls.ticket.options_what', 'قاعات الحقل')} error={optionsState.error} onRetry={optionsState.retry} /> : null}
      {options && !allowed ? <Notice tone="info" title={t('halls.ticket.forbidden', 'تذكرة الوزن يكتبها عامل القاعة في حقله والمدير؛ دورك يقرأ فقط.')} /> : null}
      {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
      {unknown ? (
        <Notice
          tone="warning"
          title={unknown === 'finish' ? t('halls.ticket.unknown_finish', 'لا نعرف إن اكتملت التذكرة: أعد المحاولة؛ لن تكتمل مرّتين.') : t('halls.ticket.unknown_delete', 'لا نعرف إن حُذفت المسوّدة: أعد المحاولة؛ لن يتكرّر شيء.')}
          action={
            <Button size="sm" busy={busy} onClick={() => void (unknown === 'finish' ? finish() : remove())} data-action="ticket-retry">
              {t('issue.retry', 'أعد المحاولة')}
            </Button>
          }
        />
      ) : null}
      {stale ? <StalePanel server={stale} mine={form} hallName={hallName} busy={busy} onKeepMine={keepMine} onTakeServer={takeServer} /> : null}

      <section className="card flex flex-col gap-3 p-4" data-action="ticket-head">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-day`} label={t('halls.ticket.day', 'اليوم')} error={parsed.errors.day ?? dayProblem} hint={today ? t('halls.ticket.day_hint', 'فارغاً: اليوم {day}.', { day: fmtDay(today) }) : undefined}>
            <input
              id={`${id}-day`}
              className="input tabular-nums"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              placeholder={today ? fmtDay(today) : undefined}
              value={form.day}
              disabled={locked}
              onChange={(event) => change({ day: event.target.value })}
              data-action="ticket-day"
            />
          </Field>
          <div className="flex flex-col gap-1.5" data-action="ticket-method">
            <span className="text-sm font-medium text-ink">{t('halls.ticket.method', 'طريقة الوزن')}</span>
            <Segmented
              label={t('halls.ticket.method', 'طريقة الوزن')}
              options={[
                { value: 'scale', label: t('halls.ticket.method.scale_short', 'قبّان') },
                { value: 'crates', label: t('halls.ticket.method.crates_short', 'ميزان أقفاص') },
              ]}
              value={form.method}
              onChange={(method) => {
                if (!locked) setMethod(method);
              }}
            />
          </div>
          <Field id={`${id}-vehicle`} label={t('halls.ticket.vehicle', 'رقم السيارة')} error={parsed.errors.vehicle}>
            <input id={`${id}-vehicle`} className="input" autoComplete="off" value={form.vehicle} disabled={locked} onChange={(event) => change({ vehicle: event.target.value })} data-action="ticket-vehicle" />
          </Field>
          <Field id={`${id}-driver`} label={t('halls.ticket.driver', 'اسم السائق')} error={parsed.errors.driver}>
            <input id={`${id}-driver`} className="input" autoComplete="off" value={form.driver} disabled={locked} onChange={(event) => change({ driver: event.target.value })} data-action="ticket-driver" />
          </Field>
        </div>
        {scale ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-line p-3" data-action="ticket-empty-box">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{t('halls.ticket.empty', 'وزن الفارغ')}</span>
              <span className="text-lg font-semibold" data-action="ticket-empty-kg">
                {form.empty.trim() === '' ? dash() : t('halls.ticket.kg', '{kg} كغم', { kg: shownKg(form.empty, KG_200T) })}
              </span>
              <Button size="sm" variant="secondary" disabled={locked} onClick={() => setPad({ kind: 'empty' })} data-action="ticket-weigh-empty">
                {form.empty.trim() === '' ? t('halls.ticket.weigh', 'سجّل الوزن') : t('halls.ticket.reweigh', 'غيّر الوزن')}
              </Button>
            </div>
            {parsed.errors.empty ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                {parsed.errors.empty}
              </p>
            ) : null}
            <Switch
              id={`${id}-with-crates`}
              label={t('halls.ticket.with_crates', 'وُزن مع الأقفاص')}
              description={form.withCrates ? t('halls.ticket.with_crates.on', 'لا يُطرح وزن الأقفاص من صافي القاعات.') : t('halls.ticket.with_crates.off', 'يُطرح من صافي كلّ قاعة عدد أقفاصها × وزن القفص.')}
              checked={form.withCrates}
              onChange={(checked) => {
                if (!locked) setWithCrates(checked);
              }}
            />
          </div>
        ) : null}
        {!scale || !form.withCrates ? (
          <Field
            id={`${id}-crate`}
            label={t('halls.ticket.crate', 'وزن القفص الفارغ (كغم)')}
            error={parsed.errors.crate}
            hint={options?.lastCrateKg ? t('halls.ticket.crate_hint', 'آخر وزن قفص: {kg} كغم.', { kg: kgNum(options.lastCrateKg) }) : undefined}
          >
            <input id={`${id}-crate`} className="input w-32 tabular-nums" dir="ltr" inputMode="decimal" autoComplete="off" value={form.crate} disabled={locked} onChange={(event) => change({ crate: event.target.value })} data-action="ticket-crate" />
          </Field>
        ) : null}
      </section>

      {form.stops.map((stop, index) => {
        const net = parsed.nets.stops[index];
        const hall = hallsById.get(stop.hallId) ?? null;
        const saved = savedStop(stop.id);
        // الحيّ وطيور التذاكر الأخرى بلا فاتورة: من التذكرة المحفوظة (بلا هذه التذكرة)، وللقاعة الجديدة من قاعات الحقل.
        const live = saved?.live ?? hall?.flock?.live ?? null;
        const others = saved ? saved.otherTicketed : (hall?.flock?.ticketed ?? 0);
        const birds = countOf(stop.birds, 1, 10_000_000).value;
        const over = birds !== null && live !== null && birds > live - others;
        const name = hallName(stop.hallId);
        const problem = net ? stopProblemText(net, name) : null;
        const clean = net !== undefined && net.problem === null;
        return (
          <section key={stop.id} className="card flex flex-col gap-3 p-4" data-action="ticket-stop" data-stop={stop.id} data-hall={stop.hallId}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{t('halls.ticket.stop_title', '{n}. {hall}', { n: index + 1, hall: name })}</h2>
              <span className="text-sm text-ink-muted" data-action="ticket-stop-live">
                {live !== null ? t('halls.ticket.live', 'الحيّ {live}', { live }) : null}
                {hall?.flock ? t('halls.ticket.age', '، العمر {age}', { age: hall.flock.age }) : null}
                {others > 0 ? t('halls.ticket.others', '، وعلى تذاكر أخرى بلا فاتورة {n}', { n: others }) : null}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`${id}-birds-${stop.id}`} label={t('halls.ticket.birds', 'عدد الطيور')} error={parsed.errors[`birds:${stop.id}`]}>
                <input
                  id={`${id}-birds-${stop.id}`}
                  className="input tabular-nums"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  value={stop.birds}
                  disabled={locked}
                  onChange={(event) => changeStop(stop.id, { birds: event.target.value })}
                  data-action="ticket-birds"
                />
              </Field>
              {scale ? (
                <Field id={`${id}-crates-${stop.id}`} label={form.withCrates ? t('halls.ticket.crates_optional', 'عدد الأقفاص (اختياريّ)') : t('halls.ticket.crates', 'عدد الأقفاص')} error={parsed.errors[`crates:${stop.id}`]}>
                  <input
                    id={`${id}-crates-${stop.id}`}
                    className="input tabular-nums"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    value={stop.crates}
                    disabled={locked}
                    onChange={(event) => changeStop(stop.id, { crates: event.target.value })}
                    data-action="ticket-crates"
                  />
                </Field>
              ) : null}
            </div>
            {over ? (
              <p className="text-sm font-semibold text-warn-800 dark:text-warn-200" data-action="ticket-over-live">
                {t('halls.ticket.over_live', 'في «{hall}» بحسب النظام {live} طيراً حيّاً، وعلى تذاكر أخرى بلا فاتورة {others}. لا تصدر الفاتورة بأكثر من الحيّ حتى يُصحَّح العدد أو يُسجَّل «فرق العدّ».', { hall: name, live: live ?? 0, others })}
              </p>
            ) : null}
            {scale ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">{t('halls.ticket.gross_after', 'وزن الخابط بعد هذه القاعة')}</span>
                <span className="font-semibold" data-action="ticket-gross">
                  {stop.gross.trim() === '' ? dash() : t('halls.ticket.kg', '{kg} كغم', { kg: shownKg(stop.gross, KG_200T) })}
                </span>
                <Button size="sm" variant="secondary" disabled={locked} onClick={() => setPad({ kind: 'gross', stopId: stop.id })} data-action="ticket-weigh-gross">
                  {stop.gross.trim() === '' ? t('halls.ticket.weigh', 'سجّل الوزن') : t('halls.ticket.reweigh', 'غيّر الوزن')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2" data-action="ticket-weighings">
                {stop.weighings.length ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {stop.weighings.map((weighing, at) => (
                      <li key={weighing.id} className="flex items-center justify-between gap-2" data-action="ticket-weighing">
                        <span>{t('halls.ticket.weighing_line', 'الوزنة {n}: الأقفاص {crates}، والوزن {kg} كغم', { n: at + 1, crates: countOf(weighing.crates, 1, 1000).value ?? 0, kg: shownKg(weighing.gross, KG_100T) })}</span>
                        <Button size="sm" variant="ghost" disabled={locked} onClick={() => removeWeighing(stop.id, weighing.id)} data-action="ticket-weighing-remove">
                          {t('halls.ticket.weighing_remove', 'احذف الوزنة')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-muted">{t('halls.ticket.no_weighings', 'لا وزنات بعد.')}</p>
                )}
                <div>
                  <Button size="sm" variant="secondary" disabled={locked} onClick={() => setPad({ kind: 'weighing', stopId: stop.id })} data-action="ticket-add-weighing">
                    {t('halls.ticket.add_weighing', 'أضف وزنة')}
                  </Button>
                </div>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3">
              <div className="min-w-0" data-action="ticket-stop-net">
                <dt className="text-xs text-ink-muted">{t('halls.ticket.net', 'الصافي (كغم)')}</dt>
                <dd className="font-semibold">{clean && net.netKg !== null ? <Num>{kgNum(net.netKg)}</Num> : dash()}</dd>
              </div>
              <div className="min-w-0" data-action="ticket-stop-avg">
                <dt className="text-xs text-ink-muted">{t('halls.ticket.avg', 'معدّل الطير (كغم)')}</dt>
                <dd className="font-semibold">{clean && net.avgKg !== null ? <Num>{fmtQtyCell(net.avgKg, 3)}</Num> : dash()}</dd>
              </div>
            </dl>
            {problem ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="ticket-stop-problem">
                {problem}
              </p>
            ) : null}
            <div>
              <Button size="sm" variant="ghost" disabled={locked} onClick={() => removeStop(stop.id)} data-action="ticket-remove-stop">
                {t('halls.ticket.remove_stop', 'احذف القاعة من التذكرة')}
              </Button>
            </div>
          </section>
        );
      })}

      <section className="card flex flex-col gap-3 p-4" data-action="ticket-add">
        {adding ? (
          addable.length ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('halls.ticket.add_stop', 'أضف قاعة')}>
              {addable.map((hall) => (
                <Button
                  key={hall.hallId}
                  size="sm"
                  variant="secondary"
                  disabled={locked || form.stops.length >= MAX_STOPS}
                  onClick={() => {
                    change({ stops: [...form.stops, freshStop(hall.hallId)] });
                    setAdding(false);
                  }}
                  data-action="ticket-add-hall"
                  data-hall={hall.hallId}
                >
                  {t('halls.ticket.add_hall', '{hall} (الحيّ {live})', { hall: hall.name, live: hall.flock?.live ?? 0 })}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted" data-action="ticket-no-halls">
              {t('halls.ticket.no_more_halls', 'لا قاعة أخرى فيها فوج قائم في هذا الحقل.')}
            </p>
          )
        ) : (
          <div>
            <Button variant="secondary" disabled={locked || form.stops.length >= MAX_STOPS || !options} onClick={() => setAdding(true)} data-action="ticket-add-stop">
              {t('halls.ticket.add_stop', 'أضف قاعة')}
            </Button>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-4" data-action="ticket-totals">
        <h2 className="font-semibold">{t('halls.ticket.totals', 'مجاميع التذكرة')}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="min-w-0" data-action="ticket-total-birds">
            <dt className="text-xs text-ink-muted">{t('halls.ticket.col.birds', 'الطيور')}</dt>
            <dd className="font-semibold">{totals.birds === null ? dash() : <Num>{fmtInt(totals.birds)}</Num>}</dd>
          </div>
          <div className="min-w-0" data-action="ticket-total-crates">
            <dt className="text-xs text-ink-muted">{t('halls.ticket.col.crates', 'الأقفاص')}</dt>
            <dd className="font-semibold">{totals.crates === null ? dash() : <Num>{fmtInt(totals.crates)}</Num>}</dd>
          </div>
          <div className="min-w-0" data-action="ticket-total-net">
            <dt className="text-xs text-ink-muted">{t('halls.ticket.net', 'الصافي (كغم)')}</dt>
            <dd className="font-semibold">{totals.netKg === null ? dash() : <Num>{fmtQtyCell(totals.netKg, totalKg)}</Num>}</dd>
          </div>
          <div className="min-w-0" data-action="ticket-total-avg">
            <dt className="text-xs text-ink-muted">{t('halls.ticket.avg', 'معدّل الطير (كغم)')}</dt>
            <dd className="font-semibold">{totals.avgKg === null ? dash() : <Num>{fmtQtyCell(totals.avgKg, 3)}</Num>}</dd>
          </div>
        </dl>
        <Field id={`${id}-note`} label={t('halls.ticket.note', 'ملاحظة')} error={parsed.errors.note}>
          <input id={`${id}-note`} className="input" autoComplete="off" value={form.note} disabled={locked} onChange={(event) => change({ note: event.target.value })} data-action="ticket-note-input" />
        </Field>
        {finishBlock ? (
          <p className="text-sm text-ink-muted" data-action="ticket-missing">
            {missing ? t('halls.ticket.missing', 'لتكتمل التذكرة: {what}.', { what: missing }) : finishBlock}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!canSave} busy={busy} onClick={() => void save(form)} data-action="ticket-save">
            {t('halls.ticket.save', 'احفظ التذكرة')}
          </Button>
          <Button variant="secondary" disabled={!canFinish} onClick={() => setConfirmFinish(true)} data-action="ticket-finish">
            {t('halls.ticket.finish', 'أكمل التذكرة')}
          </Button>
          {allowed ? (
            <Button variant="ghost" disabled={busy || unknown !== null} onClick={() => setConfirmDelete(true)} data-action="ticket-delete">
              {t('halls.ticket.delete', 'احذف المسوّدة')}
            </Button>
          ) : null}
        </div>
        {dirty && base !== null && !busy ? (
          <p className="text-sm text-ink-muted" data-action="ticket-save-first">
            {t('halls.ticket.save_first', 'احفظ التذكرة قبل إكمالها.')}
          </p>
        ) : null}
      </section>

      {pad ? (
        <PadDialog
          key={pad.kind === 'empty' ? 'empty' : `${pad.kind}:${pad.stopId}`}
          title={
            pad.kind === 'empty'
              ? t('halls.ticket.empty', 'وزن الفارغ')
              : pad.kind === 'gross'
                ? t('halls.ticket.pad.gross', 'وزن الخابط بعد «{hall}»', { hall: hallName(padStop?.hallId ?? '') })
                : t('halls.ticket.pad.weighing', 'وزنة جديدة لـ«{hall}»', { hall: hallName(padStop?.hallId ?? '') })
          }
          initial={pad.kind === 'empty' ? form.empty : pad.kind === 'gross' ? (padStop?.gross ?? '') : ''}
          weighing={pad.kind === 'weighing'}
          onClose={() => setPad(null)}
          onCommit={(weight, crates) => commit(pad, weight, crates)}
        />
      ) : null}
      {confirmFinish && base ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('halls.ticket.finish_title', 'أكمل التذكرة: {birds} طيراً، و{net} كغم صافياً؟', { birds: base.birds ?? 0, net: base.netKg === null ? dash() : kgNum(base.netKg) })}
          consequence={t('halls.ticket.finish_body', 'تأخذ التذكرة رقماً ولا تُعدَّل بعده. لا تنقص الطيور من القاعة حتى تُصدر الفاتورة.')}
          confirmLabel={t('halls.ticket.finish', 'أكمل التذكرة')}
          busy={busy}
          action="ticket-finish-confirm"
          onConfirm={() => void finish()}
          onCancel={() => setConfirmFinish(false)}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          open
          title={t('halls.ticket.delete_title', 'احذف مسوّدة التذكرة؟')}
          consequence={base ? t('halls.ticket.delete_body', 'تُلغى المسوّدة بأوزانها كلّها ولا تُعاد. الطيور في القاعات كما هي.') : t('halls.ticket.delete_local', 'تُمحى الأوزان المكتوبة في هذا الجهاز، ولم يُحفظ منها شيء في الخادم.')}
          confirmLabel={t('halls.ticket.delete', 'احذف المسوّدة')}
          busy={busy}
          action="ticket-delete-confirm"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}

/** «تغيّرت» (stale): نسخة الخادم ونسختك جنباً إلى جنب، ولا كتابة حتى تختار. */
function StalePanel({ server, mine, hallName, busy, onKeepMine, onTakeServer }: { server: WeighTicket; mine: TicketForm; hallName: (hallId: string) => string; busy: boolean; onKeepMine: () => void; onTakeServer: () => void }) {
  type Row = { key: string; hall: string; birds: string; crates: string; gross: string };
  const serverRows: Row[] = server.stops.map((stop) => ({
    key: stop.id,
    hall: stop.hallName,
    birds: stop.birds === null ? dash() : fmtInt(stop.birds),
    crates: stop.crates === null ? dash() : fmtInt(stop.crates),
    gross: stop.grossKg === null ? dash() : kgNum(stop.grossKg),
  }));
  const mineRows: Row[] = mine.stops.map((stop) => {
    const birds = countOf(stop.birds, 1, 10_000_000).value;
    const crates = countOf(stop.crates, 0, 100_000).value;
    const gross = weightOf(stop.gross, KG_200T).value;
    return { key: stop.id, hall: hallName(stop.hallId), birds: birds === null ? dash() : fmtInt(birds), crates: crates === null ? dash() : fmtInt(crates), gross: gross === null ? dash() : kgNum(gross) };
  });
  const columns: Column<Row>[] = [
    { key: 'hall', header: t('halls.ticket.col.hall', 'القاعة'), cell: (row) => row.hall },
    { key: 'birds', header: t('halls.ticket.col.birds', 'الطيور'), kind: 'number', cell: (row) => <Num>{row.birds}</Num> },
    { key: 'crates', header: t('halls.ticket.col.crates', 'الأقفاص'), kind: 'number', cell: (row) => <Num>{row.crates}</Num> },
    { key: 'gross', header: t('halls.ticket.col.gross', 'وزن الخابط (كغم)'), kind: 'number', cell: (row) => <Num>{row.gross}</Num> },
  ];
  const emptyOf = (kg: Milli | null) => (kg === null ? dash() : kgNum(kg));
  const mineEmpty = weightOf(mine.empty, KG_200T).value;
  return (
    <section className="card flex flex-col gap-3 p-4" data-action="ticket-stale">
      <Notice tone="warning" title={t('halls.ticket.stale', 'حُفظت هذه التذكرة من جهاز آخر بعد أن فتحتها (النسخة {v}). قارن واختر: ما كتبته باقٍ في هذا الجهاز.', { v: server.version })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">{t('halls.ticket.stale.server', 'في الخادم — وزن الفارغ {kg}', { kg: emptyOf(server.emptyKg) })}</h2>
          <DataTable caption={t('halls.ticket.stale.server_table', 'نسخة الخادم')} columns={columns} rows={serverRows} rowKey={(row) => row.key} empty={dash()} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">{t('halls.ticket.stale.mine', 'ما كتبته — وزن الفارغ {kg}', { kg: emptyOf(mineEmpty) })}</h2>
          <DataTable caption={t('halls.ticket.stale.mine_table', 'نسختك')} columns={columns} rows={mineRows} rowKey={(row) => row.key} empty={dash()} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={onKeepMine} data-action="ticket-keep-mine">
          {t('halls.ticket.keep_mine', 'احفظ ما كتبته فوقها')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onTakeServer} data-action="ticket-take-server">
          {t('halls.ticket.take_server', 'خذ نسخة الخادم')}
        </Button>
      </div>
    </section>
  );
}

// ─── المكتملة والملغاة ───────────────────────────────────────────────────────────────────────────────────────────

function TicketDone({ ticket, back, onVoided }: { ticket: WeighTicket; back: string; onVoided: () => void }) {
  const id = useId();
  const session = useSession();
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unknown, setUnknown] = useState(false);
  const title = t('halls.ticket.paper.title', 'تذكرة وزن {no}', { no: ticketName(ticket.ticketNo) });

  const voidTicket = async () => {
    if (busy || reason.trim() === '') return;
    setBusy(true);
    setFailure(null);
    try {
      await voidWeighTicket(ticket.id, reason, ref);
      setVoiding(false);
      setUnknown(false);
      toast({ tone: 'success', title: t('halls.ticket.voided', 'أُلغيت التذكرة {no}.', { no: ticketName(ticket.ticketNo) }) });
      onVoided();
    } catch (problem) {
      if (!surelyUnsaved(problem)) setUnknown(true);
      else {
        setRef(crypto.randomUUID());
        setFailure(problem);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-action="ticket-done">
      <style>{PRINT_STYLE}</style>
      <BackLink to={back} label={ticketBackLabel(back)} />
      <header className="flex flex-col gap-1 print:hidden">
        <h1 className="text-2xl font-semibold" data-action="ticket-title">
          {title}
        </h1>
        <p className="text-sm text-ink-muted" data-action="ticket-status">
          {statusLabel(ticket.status, ticket.invoiced)}
          {ticket.sale?.status === 'posted' ? t('halls.ticket.sale_doc', ' ({doc})', { doc: ticket.sale.docNo }) : ''}
        </p>
      </header>
      {ticket.warnings.length ? (
        <div className="print:hidden" data-action="ticket-warnings">
          <Notice tone="warning" title={t('halls.ticket.warnings', 'قاعات طيورها في التذكرة أكثر من حيّها بحسب النظام بعد التذاكر الأخرى بلا فاتورة:')}>
            {ticket.warnings
              .map((warning) => t('halls.ticket.warning', '«{hall}»: في التذكرة {birds}، والحيّ {live}، وعلى تذاكر أخرى {others}.', { hall: warning.hallName, birds: warning.birds, live: warning.live, others: warning.otherTicketed }))
              .join(' ')}
          </Notice>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 print:hidden" data-action="ticket-actions">
        <Button size="sm" variant="secondary" onClick={() => printAs(title)} data-action="ticket-print">
          {t('halls.ticket.print', 'اطبع التذكرة')}
        </Button>
        {ticket.can.invoice && ticket.status === 'done' && !ticket.invoiced ? (
          <Link to={invoicePath(ticket.id)} className="inline-flex h-9 items-center rounded-full bg-brand-600 px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-700" data-action="ticket-invoice">
            {t('halls.ticket.invoice', 'أصدر الفاتورة')}
          </Link>
        ) : null}
        {ticket.sale ? (
          <Link to={salePath(ticket.sale.id)} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="ticket-sale">
            {ticket.sale.status === 'void' ? t('halls.ticket.open_sale_void', 'الفاتورة الملغاة {doc}', { doc: ticket.sale.docNo }) : t('halls.ticket.open_sale', 'الفاتورة {doc}', { doc: ticket.sale.docNo })}
          </Link>
        ) : null}
        {ticket.can.void && ticket.status === 'done' ? (
          <Button size="sm" variant="ghost" onClick={() => setVoiding(true)} data-action="ticket-void">
            {t('halls.ticket.void', 'ألغِ التذكرة')}
          </Button>
        ) : null}
      </div>
      {unknown ? (
        <Notice
          tone="warning"
          title={t('halls.ticket.unknown_void', 'لا نعرف إن أُلغيت التذكرة: أعد المحاولة؛ لن يتكرّر شيء.')}
          action={
            <Button size="sm" busy={busy} onClick={() => void voidTicket()} data-action="ticket-void-retry">
              {t('issue.retry', 'أعد المحاولة')}
            </Button>
          }
        />
      ) : null}
      <TicketPaper ticket={ticket} orgName={orgName} />
      {voiding ? (
        <Dialog
          open
          onClose={() => setVoiding(false)}
          locked={busy}
          dirty={reason.trim() !== ''}
          title={t('halls.ticket.void_title', 'ألغِ التذكرة {no}؟', { no: ticketName(ticket.ticketNo) })}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => setVoiding(false)}>
                {t('confirm.cancel', 'لا، تراجع')}
              </Button>
              <Button variant="danger" busy={busy} disabled={reason.trim() === '' || reason.trim().length > 500 || unknown} onClick={() => void voidTicket()} data-action="ticket-void-confirm">
                {t('halls.ticket.void', 'ألغِ التذكرة')}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-ink-muted">{t('halls.ticket.void_body', 'تُلغى التذكرة ولا تصدر لها فاتورة. الطيور في القاعات كما هي (لم تنقص بالتذكرة).')}</p>
            <Field id={`${id}-reason`} label={t('halls.ticket.void_reason_label', 'سبب الإلغاء')} error={reason.trim().length > 500 ? t('halls.ticket.reason_long', 'السبب حتى 500 حرف.') : null}>
              <input id={`${id}-reason`} className="input" autoComplete="off" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} data-action="ticket-void-reason" />
            </Field>
            {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

// ─── الصفحة ─────────────────────────────────────────────────────────────────────────────────────────────────────

function SitePicker({ back }: { back: string }) {
  const load = useCallback(() => loadTicketOptions(null), []);
  const state = useLoad(load);
  const sites = state.data?.kind === 'sites' ? state.data.sites : null;
  return (
    <div className="flex flex-col gap-4" data-action="ticket-sites">
      <BackLink to={back} label={ticketBackLabel(back)} />
      <h1 className="text-2xl font-semibold">{t('halls.ticket.new', 'تذكرة وزن جديدة')}</h1>
      {state.error ? <LoadFailed what={t('halls.ticket.sites_what', 'الحقول')} error={state.error} onRetry={state.retry} /> : null}
      {sites ? (
        sites.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {sites.map((site) => (
              <Link key={site.siteId} to={newTicketPath(site.siteId, null, back)} className="card flex flex-col gap-1 p-4 transition-shadow hover:shadow-soft" data-action="ticket-site" data-site={site.siteId}>
                <span className="font-semibold">{site.name}</span>
                <span className="text-sm text-ink-muted">{t('halls.ticket.site_halls', 'قاعات فيها فوج قائم: {n}', { n: site.hallsWithFlock })}</span>
              </Link>
            ))}
          </div>
        ) : (
          <Notice tone="info" title={t('halls.ticket.no_sites', 'لا حقل لحم في نطاقك فيه فوج قائم.')} />
        )
      ) : !state.error ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : null}
    </div>
  );
}

function NewTicket({ siteId, hallId, back }: { siteId: string; hallId: string | null; back: string }) {
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const scope = workspace ? `${workspace.userId}:${workspace.orgId}` : '';
  // تذكرة جديدة لم تُحفظ بعد لهذا الحقل في هذا الجهاز: تُستعاد بمعرّفها؛ وإلّا معرّف جديد.
  const [ticketId] = useState(() => {
    const pointed = scope ? kept(newKey(scope, siteId)) : null;
    return typeof pointed === 'string' && asCopy(kept(copyKey(scope, pointed)), pointed) ? pointed : crypto.randomUUID();
  });
  return (
    <TicketEditor
      ticketId={ticketId}
      siteId={siteId}
      initial={null}
      hallId={hallId}
      back={back}
      onFirstSave={(ticket) => navigate(ticketPath(ticket.id, back), { replace: true })}
      onFinished={(ticket) => navigate(ticketPath(ticket.id, back), { replace: true })}
      onDeleted={() => navigate(back)}
    />
  );
}

function ExistingTicket({ id, back }: { id: string; back: string }) {
  const navigate = useNavigate();
  const load = useCallback(() => loadWeighTicket(id), [id]);
  const state = useLoad(load);
  const [latest, setLatest] = useState<WeighTicket | null>(null);
  const data = state.data;
  // أحدث ما عُرف: القراءة، أو جواب «أكمل» (نسخته أعلى) إلى أن تُقرأ بعده.
  const ticket = latest !== null && (data === null || latest.version > data.version) ? latest : (data ?? latest);
  if (!ticket) {
    if (state.error) {
      return (
        <div className="flex flex-col gap-4">
          <BackLink to={back} label={ticketBackLabel(back)} />
          {state.error instanceof RejectedError && state.error.hint ? <Notice tone="warning" title={state.error.hint} /> : <LoadFailed what={t('halls.ticket.what', 'تذكرة الوزن')} error={state.error} onRetry={state.retry} />}
        </div>
      );
    }
    return (
      <p role="status" className="text-sm text-ink-muted" data-action="ticket-loading">
        {t('page.loading', 'جارٍ الفتح…')}
      </p>
    );
  }
  if (ticket.status !== 'draft') return <TicketDone key={`${ticket.id}:${ticket.status}`} ticket={ticket} back={back} onVoided={state.retry} />;
  return <TicketEditor key={ticket.id} ticketId={ticket.id} siteId={ticket.siteId} initial={ticket} hallId={null} back={back} onFirstSave={() => undefined} onFinished={setLatest} onDeleted={() => navigate(back)} />;
}

export default function TicketPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const back = ticketBack(params.get('back'), '/halls/tickets');
  if (id) return <ExistingTicket key={id} id={id} back={back} />;
  const site = params.get('site');
  if (!site) return <SitePicker back={back} />;
  return <NewTicket key={site} siteId={site} hallId={params.get('hall')} back={back} />;
}
