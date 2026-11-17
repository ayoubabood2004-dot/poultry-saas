import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { addDays, diffDays, localDay, type Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { EMPTY_ROUND, emptyVisit, readVisit, typedRound, type FlockKind, type RoundText } from '../../domain/flocks';
import { naturalCompare } from '../../domain/naturalOrder';
import { can } from '../../domain/permissions';
import { parseDayText } from '../../lib/dayText';
import { describeError, NotConnectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQty, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { openOutbox, pendingOps, saveRound, type OutboxOp } from '../../lib/outbox';
import { loadFlockDetail, loadFlockFeed, recordFlockWeight, type DayLine, type FlockDetail, type HallView, type SiteView } from '../../lib/repo/flocks';
import { refreshRoundQueue, roundQueueStore, uploadRounds } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { CARD_CLASS, FeedLine, givePath, issuePath, LINK_CLASS } from './feed';
import { FlockEditDialogLazy as FlockEditDialog } from './flockEditLazy';
import { HallDialog, OpenFlockDialog } from './hallDialogs';
import HallVisits, { visitResultText } from '../halls/HallVisits';
import { daysText } from '../halls/parts';
import { errorText, loadTransport, soFar, soFarText } from './roundText';
import { farmPath, farmTitle, fmtPct, HallFlockCard, hallLabel, hallPath, loadOverviewKept, Metric, useStamp } from './shared';

// صفحة القاعة (FOUNDATION ٧٨٢؛ كلمة المالك 2026-11-16 مع صورة صفحة «فوج 1»: «طريقة الدخول الها واضحة ومو مبهمة… وتراجع تصميم هاي
// الواجهة»، والمرحلة ١ بجوابه). المكان ثابت والفوج يتغيّر كلّ دورة: الرابط بالقاعة (/hall/:id) ويفتح فوجها القائم أو يقول إنّها فارغة،
// و/flock/:id باقٍ للدورة المغلقة والروابط القديمة. الترتيب بما يحتاجه من يدخل القاعة: اسمها وحالها، ثمّ «اليوم» (جولة اليوم سُجّلت أم
// لا، والناقص من الأيام السبعة التي ما زالت تُقبل)، ثمّ ما يحتاج انتباهاً بجمل، ثمّ أفعال القاعة كبيرة بترتيب الاستعمال، ثمّ الأرقام،
// ثمّ كلّ أيام الدورة منذ التسكين (والناقص منها يُسجَّل من هنا بالطابور نفسه، save_flock_day بيومه)، ثمّ الأوزان، ثمّ البيع والإغلاق.

const qtyDecimals = (values: readonly (bigint | null)[]) => columnDecimals(values.filter((value): value is bigint => value !== null), 3) as 0 | 1 | 2 | 3;

/** أقدم يوم تقبله الجولة (save_flock_day: لا أقدم من 7 أيام)، وأيام الجدول الظاهرة قبل أن تُختصر بسطر. */
const ROUND_WINDOW = 7;
const SHOWN_DAYS = 30;

/** يوم الخادم من قراءة الفوج (days_since_placement = اليوم − التسكين + 1): لا يُخمَّن من ساعة الجهاز (درس 2026-11-13). */
function serverToday(flock: FlockDetail['flock']): Day | null {
  return flock.placedOn !== null && flock.daysSincePlacement !== null ? addDays(flock.placedOn, flock.daysSincePlacement - 1) : null;
}

/**
 * سبب نزول الحيّ غير النافق والمستبعد يوم البيع أو الإغلاق (0028، مراجعة O5): المباع بفاتورة يومه وفرق العدّ يومه من flock_detail، بجانب «الحيّ آخر
 * اليوم» («34 (بيع 900)»، «0 (فرق العدّ −30)»)؛ والفرق بإشارته معزولاً LTR. الصفحة محفوظة: أقلّ ما يكفي.
 */
function liveEndNote(day: DayLine): string | null {
  const parts: string[] = [];
  if (day.sold) parts.push(t('flock.end.sold', 'بيع {n}', { n: day.sold }));
  if (day.countDiff) parts.push(t('flock.end.diff', 'فرق العدّ {n}', { n: `\u{2066}${day.countDiff > 0 ? '+' : ''}${fmtInt(day.countDiff)}\u{2069}` }));
  return parts.length ? parts.join(t('list.separator', '، ')) : null;
}

/** صفّ في جدول الأيام: يوم مسجَّل بسطره، أو يوم بلا جولة (line = null). */
interface DayView {
  onDate: Day;
  line: DayLine | null;
}

/**
 * أيام الدورة القائمة منذ التسكين حتى يوم الخادم، الأحدث أوّلاً: آخر SHOWN_DAYS يوماً كلّها (المسجّل والناقص)، وما قبلها المسجّل وحده
 * وعدد الناقص فيه بسطر. والدورة المغلقة أو بلا يوم خادم: المسجّل كما جاء.
 */
export function dayViews(detail: FlockDetail): { rows: DayView[]; olderMissing: number } {
  const today = serverToday(detail.flock);
  const placed = detail.flock.placedOn;
  if (detail.flock.status !== 'active' || today === null || placed === null) return { rows: detail.days.map((line) => ({ onDate: line.onDate, line })), olderMissing: 0 };
  const byDay = new Map(detail.days.map((line) => [line.onDate, line]));
  const from = diffDays(today, placed) >= SHOWN_DAYS ? addDays(today, -(SHOWN_DAYS - 1)) : placed;
  const rows: DayView[] = [];
  for (let day = today; day >= from; day = addDays(day, -1)) rows.push({ onDate: day, line: byDay.get(day) ?? null });
  const older = detail.days.filter((line) => line.onDate < from && line.onDate >= placed);
  for (const line of older) rows.push({ onDate: line.onDate, line });
  return { rows, olderMissing: Math.max(0, diffDays(from, placed) - older.length) };
}

/** يوم ما زالت الجولة تقبله: الدورة قائمة، واليوم ما بين التسكين ويوم الخادم وضمن الأيام السبعة (لمن يكتب أو لا: الناقص فيه «لم تُسجَّل» لا «فاتت»). */
function inWindow(detail: FlockDetail, day: Day): boolean {
  const today = serverToday(detail.flock);
  return detail.flock.status === 'active' && today !== null && detail.flock.placedOn !== null && day <= today && day >= detail.flock.placedOn && day >= addDays(today, -ROUND_WINDOW);
}

/** هل يُكتب هذا اليوم من هنا: ضمن الأيام التي تقبلها الجولة، ولمن يحفظ يوم الفوج. */
function writable(detail: FlockDetail, day: Day): boolean {
  return detail.canSave && inWindow(detail, day);
}

/**
 * حدّ النافق والمستبعد قبل الإرسال (مراجعة صفحة القاعة R4): لليوم «الحيّ بداية اليوم» من الخادم (live_start_today، كالجولة اليومية)؛ ولما
 * فات حدّ save_flock_day نفسه: الحيّ الآن مع ما سُجّل لذلك اليوم (البيع وفرق العدّ في يوم بلا جولة لا تراهما أيام الفوج، فلا يُحسب «حيّ
 * بداية ذلك اليوم» بالشاشة).
 */
function liveBound(detail: FlockDetail, day: Day): { live: number; past: boolean } {
  if (day === serverToday(detail.flock)) return { live: detail.flock.liveStartToday, past: false };
  const own = detail.days.find((line) => line.onDate === day);
  return { live: detail.flock.live + (own?.dead ?? 0) + (own?.culled ?? 0), past: true };
}

/**
 * آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (useLoad يرجّع null أثناءها): الصفحة ونوافذها المفتوحة لا تُطوى ولا تقفز إلى أعلاها،
 * وفشل القراءة من جديد يُقال ولا يمحو ما عُرض (مراجعة صفحة القاعة R1 وR2).
 */
function useKept<T>(data: T | null): T | null {
  const [kept, setKept] = useState<T | null>(data);
  if (data !== null && data !== kept) setKept(data);
  return data ?? kept;
}

/** أيام هذا الفوج المحفوظة على الجهاز ولم تُرسل بعد (بلا نت): تُقال في جدول الأيام كي لا تبدو ناقصة (R2). */
function useDeviceDays(flockId: string | null, refresh: number): ReadonlySet<Day> {
  const stamp = useStamp();
  const uploads = useStore(roundQueueStore).seq;
  const [days, setDays] = useState<{ key: string; days: ReadonlySet<Day> } | null>(null);
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  const key = `${userId}:${orgId}:${flockId}`;
  useEffect(() => {
    if (!userId || !orgId || !flockId) return;
    let cancelled = false;
    openOutbox()
      .then((db) => pendingOps(db, { userId, orgId, displayName }))
      .then(
        (ops) => {
          if (!cancelled) setDays({ key: `${userId}:${orgId}:${flockId}`, days: new Set(ops.filter((op) => op.flockId === flockId).map((op) => op.day)) });
        },
        () => {
          /* swallow-ok: الطابور ما انقرا (IndexedDB ممنوع)؛ الجدول يعرض أيام الخادم وحدها */
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, displayName, flockId, uploads, refresh]);
  return days?.key === key ? days.days : NO_DAYS;
}
const NO_DAYS: ReadonlySet<Day> = new Set();

/**
 * عمليات هذا الجهاز لفوج ويوم لم تُرفع بعد (الطابور نفسه): «اليوم حتى الآن» في نافذة الزيارة يجمعها فوق المحفوظ. تُقرأ عند الفتح وبعد كلّ رفع.
 */
function useDayOps(flockId: string, day: Day): readonly OutboxOp[] {
  const stamp = useStamp();
  const uploads = useStore(roundQueueStore).seq;
  const [ops, setOps] = useState<{ key: string; ops: OutboxOp[] } | null>(null);
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  const key = `${userId}:${orgId}:${flockId}:${day}`;
  useEffect(() => {
    if (!userId || !orgId) return;
    let cancelled = false;
    openOutbox()
      .then((db) => pendingOps(db, { userId, orgId, displayName }))
      .then(
        (all) => {
          if (!cancelled) setOps({ key: `${userId}:${orgId}:${flockId}:${day}`, ops: all.filter((op) => op.flockId === flockId && op.day === day) });
        },
        () => {
          /* swallow-ok: الطابور ما انقرا (IndexedDB ممنوع)؛ «اليوم حتى الآن» من المحفوظ وحده */
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, displayName, flockId, day, uploads]);
  return ops?.key === key ? ops.ops : NO_OPS;
}
const NO_OPS: readonly OutboxOp[] = [];

/**
 * «سجّل زيارة» لهذه القاعة ليوم (اليوم أو يوم فات ضمن السبعة، 0032): زيارة جديدة بخانات فارغة تُضاف إلى مجموع ذلك اليوم، وتحت كلّ خانة «اليوم حتى
 * الآن» (المحفوظ وعمليات هذا الجهاز)، وتحتها «زيارات هذا اليوم» بالتعديل والإلغاء. بالطابور نفسه (save_flock_visit)، فبلا نت تُحفظ على الجهاز؛ والفحص
 * قبل الحفظ على المجموع بعد الزيارة. الصفحة تمرّر آخر قراءة للفوج (لا لقطة الفتح)، فتعديل زيارة من القائمة يظهر في «اليوم حتى الآن».
 */
function VisitDialog({ detail, kind, day, onClose, onDone, onChanged }: { detail: FlockDetail; kind: FlockKind; day: Day; onClose: () => void; onDone: () => void; onChanged: () => void }) {
  const id = useId();
  const stamp = useStamp();
  const online = useStore(onlineStore);
  const ops = useDayOps(detail.flock.id, day);
  const line = detail.days.find((entry) => entry.onDate === day) ?? null;
  const total = soFar(line, ops);
  const bound = liveBound(detail, day);
  const [text, setText] = useState<RoundText>(EMPTY_ROUND);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: keyof RoundText | null; message: string } | null>(null);
  const dirty = typedRound(text);

  const save = async () => {
    if (!stamp) return;
    const read = readVisit(text, { kind, liveStart: bound.live, totals: total });
    if ('error' in read) {
      setError({
        field: read.field,
        message:
          read.error === 'live_negative' && bound.past
            ? t('hall.day.live_negative_past', 'بهذه الأرقام يصير الحيّ سالباً؛ الحيّ الآن {live}.', { live: fmtInt(detail.flock.live) })
            : errorText(read.error, bound.live),
      });
      return;
    }
    if (emptyVisit(read.values)) {
      if (dirty) setError({ field: null, message: t('hall.visit.empty', 'اكتب رقماً واحداً على الأقلّ (الصفر رقم).') });
      else onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const db = await openOutbox();
      const op = await saveRound(db, stamp, {
        fn: 'save_flock_visit',
        flockId: detail.flock.id,
        day,
        payload: { visitId: crypto.randomUUID(), recordedAt: new Date().toISOString(), ...read.values, eggs_cracked: null, note: null, void: false },
        baseVersion: null,
      });
      const results = online ? await uploadRounds(stamp, loadTransport).catch(() => []) : []; /* swallow-ok: الرفع فشل (IndexedDB)؛ العملية باقية بالجهاز وترتفع بالمحاولة الجاية */
      if (!online) {
        void refreshRoundQueue(stamp).catch(() => {
          /* swallow-ok: عدّ الطابور تعذّر؛ الرأس يتحدّث بالرفع الجاي */
        });
      }
      // نتيجة هذه الزيارة بعينها (بمعرّف عمليتها)؛ ونتائج القاعات الأخرى في الرفع نفسه تبقى لتنبيه «رُدّت» في القشرة والجولة (لا ackRuns هنا، R3).
      const result = op ? (results.find((entry) => entry.opId === op.id)?.result ?? null) : null;
      toast(visitResultText(online ? result : null, 'new'));
      onDone();
    } catch (failure) {
      const { title, detail: more } = describeError(failure);
      setError({ field: null, message: `${title} ${more}` });
      setBusy(false);
    }
  };

  const fields: [keyof RoundText, string, boolean][] = [
    ['dead', t('round.dead', 'النافق'), false],
    ['culled', t('round.culled', 'المستبعد'), false],
    ['feedKg', t('round.feed', 'العلف (كغم)'), true],
    ...(kind === 'layer'
      ? ([
          ['eggsTotal', t('round.eggs_total', 'البيض (المجموع)'), false],
          ['eggsBroken', t('round.eggs_broken', 'المكسور'), false],
        ] as [keyof RoundText, string, boolean][])
      : []),
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={dirty}
      size="wide"
      title={t('hall.visit.title', 'زيارة {hall} ليوم {day}', { hall: hallLabel(detail.flock.hallName), day: fmtDay(day) })}
      footer={
        <Button onClick={() => void save()} busy={busy} data-action="day-save">
          {t('hall.visit.save', 'احفظ الزيارة')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {bound.past
            ? t('hall.visit.hint_past', 'ما تكتبه يُضاف إلى مجموع ذلك اليوم، والفارغة لا شيء.')
            : t('hall.visit.hint', 'ما تكتبه يُضاف إلى مجموع اليوم، والفارغة لا شيء. الحيّ بداية اليوم {live}.', { live: fmtInt(bound.live) })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([field, label, decimal]) => (
            <Field key={field} id={`${id}-${field}`} label={label} error={error?.field === field ? error.message : null} hint={t('round.so_far', 'اليوم حتى الآن: {n}', { n: soFarText(total, field) })}>
              <input
                id={`${id}-${field}`}
                className="input tabular-nums"
                dir="ltr"
                inputMode={decimal ? 'decimal' : 'numeric'}
                autoComplete="off"
                data-action={`day-${field}`}
                value={text[field]}
                onChange={(event) => setText({ ...text, [field]: event.target.value })}
              />
            </Field>
          ))}
        </div>
        {error && error.field === null ? <Notice tone="danger" title={error.message} /> : null}
        <section className="flex flex-col gap-2" data-action="day-visits">
          <h3 className="font-semibold">{t('hall.visit.list', 'زيارات هذا اليوم')}</h3>
          <HallVisits kind={kind} flockId={detail.flock.id} day={day} canSave={writable(detail, day)} liveStart={bound.live} onChanged={onChanged} />
        </section>
      </div>
    </Dialog>
  );
}

function WeightDialog({ detail, onClose, onSaved }: { detail: FlockDetail; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const today = serverToday(detail.flock) ?? localDay();
  const [day, setDay] = useState(fmtDay(today));
  const [samples, setSamples] = useState('');
  const [avg, setAvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(crypto.randomUUID());
  const onDate = parseDayText(day);
  const placedOn = detail.flock.placedOn;
  const dayError =
    onDate === null
      ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
      : onDate > today
        ? t('day.future', 'التاريخ بعد اليوم.')
        : onDate < addDays(today, -ROUND_WINDOW)
          ? t('day.too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ {day}.', { day: fmtDay(addDays(today, -ROUND_WINDOW)) })
          : placedOn !== null && onDate < placedOn
            ? t('flock.weight.before', 'التاريخ قبل تسكين الفوج.')
            : null;
  const sampleCount = /^[0-9]+$/.test(samples.trim()) ? Number(samples.trim()) : null; // number-ok: عدد طيور العيّنة من نصّ أرقام بس
  const sampleError = samples.trim() !== '' && (sampleCount === null || sampleCount < 1 || sampleCount > 100_000) ? t('flock.weight.samples.bad', 'اكتب عدد طيور العيّنة من 1 إلى 100,000.') : null;
  const avgValue = parseDecimal(avg, 1);
  const avgTenths = avgValue === null ? null : toScale(avgValue, 1);
  // الحدّ الفيزيائي الأدنى 20 غراماً مثل الخادم (القاعدة 28): 1.8 بخانة الغرامات كيلوغرام انكتب غلطاً.
  const avgError = avg.trim() !== '' && (avgTenths === null || avgTenths < 200n || avgTenths > 200_000n) ? t('flock.weight.avg.bad', 'اكتب معدّل وزن الطير بالغرام من 20 إلى 20,000، بمرتبة عشرية واحدة على الأكثر (1.8 كغم = 1,800 غم).') : null;
  const ready = onDate !== null && !dayError && sampleCount !== null && !sampleError && avgTenths !== null && !avgError;

  const save = async () => {
    if (!ready || onDate === null || sampleCount === null || avgTenths === null) return;
    setBusy(true);
    setError(null);
    try {
      await recordFlockWeight(detail.flock.id, onDate, sampleCount, decimalText(avgTenths, 1), ref.current);
      toast({ tone: 'success', title: t('flock.weight.saved', 'حُفظ وزن العيّنة ليوم {day}.', { day: fmtDay(onDate) }) });
      onSaved();
    } catch (failure) {
      const { title, detail: more } = describeError(failure);
      setError(`${title} ${more}`);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={samples !== '' || avg !== '' || day !== fmtDay(today)}
      title={t('hall.weight.title', 'وزن عيّنة {hall}', { hall: hallLabel(detail.flock.hallName) })}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={!ready} data-action="weight-save">
          {t('flock.weight.save', 'احفظ الوزن')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id={`${id}-day`} label={t('flock.weight.day', 'التاريخ')} error={dayError}>
          <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field id={`${id}-samples`} label={t('flock.weight.samples', 'عدد طيور العيّنة')} error={sampleError}>
          <input id={`${id}-samples`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={samples} onChange={(event) => setSamples(event.target.value)} />
        </Field>
        <Field id={`${id}-avg`} label={t('flock.weight.avg', 'معدّل وزن الطير (غرام)')} error={avgError}>
          <input id={`${id}-avg`} className="input tabular-nums" dir="ltr" inputMode="decimal" autoComplete="off" value={avg} onChange={(event) => setAvg(event.target.value)} />
        </Field>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
    </Dialog>
  );
}

/** «اليوم» أوّل الصفحة: جولة اليوم سُجّلت أم لا (من قراءة الخادم)، وزرّ يكتبها لهذه القاعة، والناقص من الأيام التي ما زالت تُقبل. */
function TodayCard({ detail, missing, roundPath, onDevice, onRecord }: { detail: FlockDetail; missing: number; roundPath: string; onDevice: boolean; onRecord: (day: Day) => void }) {
  const today = serverToday(detail.flock);
  if (today === null) return null;
  const line = detail.flock.today;
  const done = line !== null || onDevice;
  const tone = done ? '' : 'border-warn-200 bg-warn-50 dark:border-warn-500/30 dark:bg-warn-500/15';
  return (
    <section className={`card flex flex-col gap-3 border p-4 ${tone}`} data-action="hall-today-card" data-state={done ? 'done' : 'missing'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {line !== null
            ? t('hall.today.done', 'سُجّلت جولة اليوم {day}', { day: fmtDay(today) })
            : onDevice
              ? t('hall.today.device', 'جولة اليوم {day} محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال', { day: fmtDay(today) })
              : t('hall.today.missing', 'جولة اليوم {day} لم تُسجَّل', { day: fmtDay(today) })}
        </h2>
      </div>
      {line !== null ? (
        <p className="text-ink-muted" data-action="hall-today-values">
          {t('hall.today.values', 'النافق {dead} · المستبعد {culled} · العلف {feed}', {
            dead: fmtInt(line.dead ?? 0),
            culled: fmtInt(line.culled ?? 0),
            feed: line.feedKg === null ? '—' : fmtQty(line.feedKg, 'kg').main,
          })}
        </p>
      ) : null}
      {detail.canSave ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={done ? 'secondary' : 'primary'} onClick={() => onRecord(today)} data-action="hall-today-record">
            {t('hall.today.record', 'سجّل زيارة')}
          </Button>
        </div>
      ) : done ? null : (
        <p className="text-sm text-ink-muted">{t('hall.today.worker', 'يسجّلها عامل القاعة أو المدير.')}</p>
      )}
      {missing > 0 ? (
        <p className="text-sm font-semibold text-warn-800 dark:text-warn-200" data-action="hall-missing">
          {t('hall.today.missing_days', 'ولم تُسجَّل جولة {n} من الأيام السبعة الماضية: سجّلها من «أيام الدورة» قبل أن تفوت.', { n: fmtInt(missing) })}
        </p>
      ) : null}
      {/* الجولة لكلّ القاعات معاً، وفيها «جولات تحتاج مراجعة» لما رُدّ (التنبيه يدلّ عليها). */}
      <Link to={roundPath} className={LINK_CLASS} data-action="hall-round-all">
        {t('hall.round_all', 'الجولة اليومية لكلّ القاعات')}
      </Link>
    </section>
  );
}

const ACTION_CLASS = 'flex h-14 items-center justify-center rounded-xl border border-line bg-surface-1 px-3 py-2 text-center text-sm font-semibold text-brand-700 hover:bg-surface-2 dark:text-brand-200';

/**
 * أفعال القاعة كبيرة بترتيب الاستعمال (لا روابط صغيرة بالزوايا): الإضافة للقاعة، ووزن العيّنة، والتقويم واللقاحات، وتقرير الدورة، وسجلّ
 * الصرف، وتعديل الفوج للمدير. والبيع وفرق العدّ والإغلاق في بطاقتها أسفل الصفحة، بعيداً عن الاستعمال اليوميّ.
 */
function HallActions({ detail, back, onWeight, onEdit }: { detail: FlockDetail; back: string; onWeight: () => void; onEdit: () => void }) {
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const active = detail.flock.status === 'active';
  const canGive = active && role !== null && (can(role, 'issue.post') || can(role, 'flock_day.save'));
  const flockId = detail.flock.id;
  return (
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t('hall.actions', 'أفعال القاعة')}>
      {canGive ? (
        <Link to={givePath(flockId, back)} data-action="flock-give" className={ACTION_CLASS}>
          {t('give.open', 'أضف للقاعة')}
        </Link>
      ) : null}
      {active && detail.canSave && detail.flock.kind === 'broiler' ? (
        <button type="button" onClick={onWeight} data-action="weight-open" className={ACTION_CLASS}>
          {t('hall.weight.open', 'وزن عيّنة')}
        </button>
      ) : null}
      <Link to={`/halls/calendar/${flockId}`} className={ACTION_CLASS} data-action="flock-calendar">
        {t('hall.calendar', 'التقويم واللقاحات')}
      </Link>
      <Link to={`/halls/report/${flockId}`} className={ACTION_CLASS} data-action="flock-report">
        {t('flock.report', 'تقرير الدورة')}
      </Link>
      <Link to={issuePath(flockId, back)} className={ACTION_CLASS} data-action="flock-issues">
        {t('feed.history', 'سجلّ الصرف لهذه القاعة')}
      </Link>
      {detail.canManage && active ? (
        <button type="button" onClick={onEdit} data-action="flock-edit" className={ACTION_CLASS}>
          {t('farm.flock.edit', 'عدّل الفوج')}
        </button>
      ) : null}
    </nav>
  );
}

/**
 * علف القاعة (0019): المصروف والمستهلك والباقي بسطر، والباقي السالب جملة تقول معناها (FeedLine). بلا قاعدة لا شيء، والفشل يُقال بإعادته.
 */
function FeedSection({ flockId, back, canGive }: { flockId: string; back: string; canGive: boolean }) {
  const load = useCallback(() => loadFlockFeed(flockId), [flockId]);
  const { data, error, retry } = useLoad(load);
  if (error instanceof NotConnectedError) return null;
  return (
    <section className={CARD_CLASS} data-action="flock-feed">
      {data ? <FeedLine feed={data} giveTo={canGive ? givePath(flockId, back) : undefined} /> : null}
      {error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-action="feed-failed">
          <span role="alert" className="text-danger-700 dark:text-danger-300">
            {t('feed.failed', 'تعذّرت قراءة علف القاعة.')}
          </span>
          <Button size="sm" variant="ghost" onClick={retry} data-action="feed-retry">
            {t('common.retry', 'أعد المحاولة')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function FlockView({ detail, kind, device, onRecord }: { detail: FlockDetail; kind: FlockKind; device: ReadonlySet<Day>; onRecord: (day: Day) => void }) {
  const { flock, weights } = detail;
  const { rows, olderMissing } = dayViews(detail);
  const lines = rows.flatMap((row) => (row.line ? [row.line] : []));
  const feedDecimals = qtyDecimals(lines.map((day) => day.feedKg));
  const canWrite = detail.canSave && flock.status === 'active';
  const fcrHint =
    flock.fcr !== null
      ? null
      : flock.lastWeight === null
        ? t('flock.fcr.no_weight', 'يُحسب بعد أوّل وزن عيّنة.')
        : t('flock.fcr.days', 'يُحسب حين يُسجَّل علف كل يوم من التسكين حتى أمس (ويُحسب اليوم معها إن سُجّل علفه): مسجّل {n} من {m}.', { n: fmtInt(flock.feedDays), m: fmtInt(flock.feedSpanDays) });
  const dash = (row: DayView, value: (line: DayLine) => ReactNode) => (row.line ? value(row.line) : '—');
  const columns: Column<DayView>[] = [
    {
      key: 'day',
      header: t('flock.col.day', 'التاريخ'),
      // ثابت بالتمرير، و«سجّل» لليوم الناقص فيه نفسه: آخر عمود لا يُرى بالهاتف بلا سحب (صور الهاتف 2026-11-16).
      sticky: true,
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          <Num>{fmtDay(row.onDate)}</Num>
          {row.line ? null : device.has(row.onDate) ? (
            <span className="inline-flex items-center gap-2">
              <span className="rounded-full bg-surface-2 px-2 text-xs font-semibold text-ink-muted" data-action="day-device">
                {t('hall.day.device', 'على الجهاز')}
              </span>
              {writable(detail, row.onDate) ? (
                <Button size="sm" variant="ghost" onClick={() => onRecord(row.onDate)} data-action="day-record">
                  {t('hall.day.visits', 'الزيارات')}
                </Button>
              ) : null}
            </span>
          ) : inWindow(detail, row.onDate) ? (
            <span data-action="day-missing">
              {writable(detail, row.onDate) ? (
                <Button variant="secondary" onClick={() => onRecord(row.onDate)} data-action="day-record">
                  {t('hall.day.record', 'سجّل')}
                </Button>
              ) : (
                <span className="rounded-full bg-warn-50 px-2 text-xs font-semibold text-warn-800 dark:bg-warn-500/15 dark:text-warn-200">{t('hall.day.missing', 'لم تُسجَّل')}</span>
              )}
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 text-xs font-semibold text-ink-muted" data-action="day-lost">
              {t('hall.day.lost', 'فاتت')}
            </span>
          )}
        </span>
      ),
    },
    { key: 'start', header: t('flock.col.live_start', 'الحيّ بداية اليوم'), kind: 'number', cell: (row) => dash(row, (line) => <Num>{fmtInt(line.liveStart)}</Num>) },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (row) => dash(row, (line) => <Num>{fmtInt(line.dead ?? 0)}</Num>), total: <Num>{fmtInt(flock.deadTotal)}</Num> },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (row) => dash(row, (line) => <Num>{fmtInt(line.culled ?? 0)}</Num>), total: <Num>{fmtInt(flock.culledTotal)}</Num> },
    {
      key: 'feed',
      header: t('round.feed', 'العلف (كغم)'),
      kind: 'number',
      cell: (row) => dash(row, (line) => (line.feedKg === null ? '—' : <Num>{fmtQtyCell(line.feedKg, feedDecimals)}</Num>)),
      total: <Num>{fmtQtyCell(flock.feedKgTotal, qtyDecimals([flock.feedKgTotal, ...lines.map((day) => day.feedKg)]))}</Num>,
    },
    ...(kind === 'layer'
      ? [
          { key: 'eggs', header: t('round.eggs_total', 'البيض (المجموع)'), kind: 'number' as const, cell: (row: DayView) => dash(row, (line) => (line.eggsTotal === null ? '—' : <Num>{fmtInt(line.eggsTotal)}</Num>)) },
          { key: 'broken', header: t('round.eggs_broken', 'المكسور'), kind: 'number' as const, cell: (row: DayView) => dash(row, (line) => (line.eggsBroken === null ? '—' : <Num>{fmtInt(line.eggsBroken)}</Num>)) },
          { key: 'hdep', header: t('flock.col.hdep', 'نسبة الإنتاج'), kind: 'number' as const, cell: (row: DayView) => dash(row, (line) => (line.hdep === null ? '—' : <Num>{fmtPct(line.hdep)}</Num>)) },
        ]
      : []),
    {
      key: 'end',
      header: t('flock.col.live_end', 'الحيّ آخر اليوم'),
      kind: 'number',
      cell: (row) =>
        dash(row, (line) => {
          const note = liveEndNote(line);
          return (
            <>
              <Num>{fmtInt(line.liveEnd)}</Num>
              {note ? <span className="text-xs text-ink-muted"> ({note})</span> : null}
            </>
          );
        }),
    },
    ...(canWrite
      ? [
          {
            key: 'write',
            header: t('hall.col.round', 'الجولة'),
            cell: (row: DayView) =>
              row.line && writable(detail, row.onDate) ? (
                <Button size="sm" variant="ghost" onClick={() => onRecord(row.onDate)} data-action="day-edit">
                  {t('hall.day.visits', 'الزيارات')}
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label={t('flock.live', 'الطيور الحيّة')} value={fmtInt(flock.live)} hint={flock.placedCount !== null ? t('flock.placed', 'المسكّن {n}', { n: fmtInt(flock.placedCount) }) : undefined} />
        <Metric label={t('flock.age', 'العمر بالأيام')} value={flock.ageDays !== null ? fmtInt(flock.ageDays) : null} />
        {flock.status === 'active' ? <Metric label={t('hall.dead_today', 'نافق اليوم')} value={flock.today?.dead !== null && flock.today?.dead !== undefined ? fmtInt(flock.today.dead) : null} /> : null}
        <Metric label={t('flock.losses', 'النافق والمستبعد')} value={fmtInt(flock.deadTotal + flock.culledTotal)} />
        <Metric label={t('flock.mortality', 'نسبة النفوق')} value={flock.mortalityPct !== null ? fmtPct(flock.mortalityPct) : null} />
        <Metric label={t('flock.feed', 'العلف المستهلك')} text value={fmtQty(flock.feedKgTotal, 'kg').main} />
        {kind === 'broiler' ? (
          <>
            <Metric
              label={t('flock.last_weight', 'آخر وزن (غرام)')}
              value={flock.lastWeight ? fmtScaledCell(flock.lastWeight.avgG, 1, 1) : null}
              hint={flock.lastWeight ? t('flock.last_weight.on', 'يوم {day}', { day: fmtDay(flock.lastWeight.onDate) }) : undefined}
            />
            <Metric label={t('flock.fcr', 'معامل التحويل الغذائي')} value={flock.fcr !== null ? fmtScaledCell(flock.fcr, 3, 3) : null} hint={fcrHint ?? undefined} />
          </>
        ) : (
          <>
            <Metric label={t('flock.eggs_today', 'بيض اليوم')} value={flock.eggsToday !== null ? fmtInt(flock.eggsToday) : null} />
            <Metric label={t('flock.hdep_today', 'نسبة الإنتاج اليوم')} value={flock.hdepToday !== null ? fmtPct(flock.hdepToday) : null} />
          </>
        )}
      </dl>
      <section className="flex flex-col gap-3" id="hall-days">
        <h2 className="text-lg font-semibold">{t('hall.days', 'أيام الدورة')}</h2>
        <DataTable
          caption={t('hall.days', 'أيام الدورة')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.onDate}
          rowTone={(row) => (row.line === null && !device.has(row.onDate) && inWindow(detail, row.onDate) ? 'warn' : null)}
          empty={t('flock.days.empty', 'لم تُسجَّل أيّ جولة بعد.')}
          totalLabel={t('flock.total', 'المجموع')}
        />
        {olderMissing > 0 ? (
          <p className="text-sm text-ink-muted" data-action="days-older-missing">
            {t('hall.days.older_missing', 'وقبل هذه الأيام {n} بلا جولة.', { n: daysText(olderMissing) })}
          </p>
        ) : null}
      </section>
      {kind === 'broiler' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('flock.weights', 'أوزان العيّنات')}</h2>
          <DataTable
            caption={t('flock.weights', 'أوزان العيّنات')}
            columns={[
              { key: 'day', header: t('flock.col.day', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.onDate)}</Num> },
              { key: 'samples', header: t('flock.weight.samples', 'عدد طيور العيّنة'), kind: 'number', cell: (row) => <Num>{fmtInt(row.sampleCount)}</Num> },
              { key: 'avg', header: t('flock.weight.avg', 'معدّل وزن الطير (غرام)'), kind: 'number', cell: (row) => <Num>{fmtScaledCell(row.avgG, 1, 1)}</Num> },
            ]}
            rows={weights}
            rowKey={(row) => row.onDate}
            empty={t('flock.weights.empty', 'لا أوزان بعد.')}
          />
        </section>
      ) : null}
    </>
  );
}

/** ما يحتاج انتباهاً بجملة تقول المشكلة: جولات رُدّت إلى المدير، والوزن المتأخّر للّاحم. (والعلف السالب في سطر العلف نفسه.) */
function HallAlerts({ detail, onWeight }: { detail: FlockDetail; onWeight: () => void }) {
  const { flock } = detail;
  const today = serverToday(flock);
  const weightLate =
    flock.status === 'active' && flock.kind === 'broiler' && today !== null && flock.ageDays !== null && flock.ageDays >= ROUND_WINDOW && (flock.lastWeight === null || flock.lastWeight.onDate < addDays(today, -ROUND_WINDOW));
  return (
    <>
      {flock.rejectsPending > 0 ? <Notice tone="warning" title={t('flock.rejects', 'جولات أُرسلت من الأجهزة ورُدّت إلى المدير: {n}.', { n: fmtInt(flock.rejectsPending) })} /> : null}
      {weightLate ? (
        <Notice tone="info" title={flock.lastWeight === null ? t('hall.weight.never', 'لم يُسجَّل وزن عيّنة لهذا الفوج بعد.') : t('hall.weight.late', 'آخر وزن عيّنة يوم {day}، قبل أكثر من أسبوع.', { day: fmtDay(flock.lastWeight.onDate) })}>
          {detail.canSave ? (
            <Button size="sm" variant="secondary" onClick={onWeight} data-action="weight-alert">
              {t('hall.weight.open', 'وزن عيّنة')}
            </Button>
          ) : null}
        </Notice>
      ) : null}
    </>
  );
}

type Nav = { prev: HallView | null; next: HallView | null };

/** شاشة الفوج داخل صفحة قاعته (أو وحدها لدورة مغلقة): الرأس باسم القاعة، ثمّ اليوم والتنبيهات والأفعال والأرقام والأيام. */
function FlockScreen({ kind, flockId, nav, onGone }: { kind: FlockKind; flockId: string; nav?: Nav; onGone?: () => void }) {
  const navigate = useNavigate();
  const session = useSession();
  const online = useStore(onlineStore);
  const load = useCallback(() => loadFlockDetail(flockId), [flockId]);
  const state = useLoad(load);
  const detail = useKept(state.data);
  const [deviceTick, setDeviceTick] = useState(0);
  const device = useDeviceDays(detail?.flock.id ?? null, deviceTick);
  const role = session.status === 'ready' ? session.workspace.role : null;
  const canGive = detail?.flock.status === 'active' && role !== null && (can(role, 'issue.post') || can(role, 'flock_day.save'));
  const base = farmPath(kind);
  // النوافذ من حالة الصفحة لا من القراءة: القراءة من جديد (data = null أثناءها) لا تطويها.
  const [editing, setEditing] = useState<FlockDetail['flock'] | null>(null);
  const [weighing, setWeighing] = useState<FlockDetail | null>(null);
  const [recording, setRecording] = useState<Day | null>(null);
  const here = detail ? hallPath(kind, detail.flock.hallId) : base;
  const today = detail ? serverToday(detail.flock) : null;
  const missing = detail && today !== null ? dayViews(detail).rows.filter((row) => row.line === null && row.onDate !== today && !device.has(row.onDate) && inWindow(detail, row.onDate)).length : 0;
  const subtitle = detail
    ? [
        detail.flock.siteName,
        detail.flock.status === 'closed' && detail.flock.closedOn
          ? t('hall.closed_on', 'دورة أُغلقت يوم {day}', { day: fmtDay(detail.flock.closedOn) })
          : detail.flock.ageDays !== null
            ? t('hall.current', 'الدورة الحالية: العمر {age}', { age: daysText(detail.flock.ageDays) })
            : null,
        detail.flock.placedOn ? t('hall.placed', 'سُكّن يوم {day}', { day: fmtDay(detail.flock.placedOn) }) : null,
        detail.flock.breed ? t('hall.breed', 'سلالة {breed}', { breed: detail.flock.breed }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  return (
    <div className="flex flex-col gap-4">
      <HallTop kind={kind} nav={nav} />
      <PageHeader title={detail ? hallLabel(detail.flock.hallName) : farmTitle(kind)} subtitle={subtitle} />
      {state.error instanceof NotConnectedError ? (
        <Notice tone="info" title={describeError(state.error).title} />
      ) : state.error && !detail ? (
        <LoadFailed what={t('flock.what', 'الفوج')} error={state.error} onRetry={state.retry} />
      ) : state.error ? (
        <Notice tone="warning" title={t('hall.reread_failed', 'تعذّرت قراءة القاعة من جديد؛ المعروض آخر ما قُرئ.')}>
          <Button size="sm" variant="secondary" onClick={state.retry} data-action="hall-reread">
            {t('common.retry', 'أعد المحاولة')}
          </Button>
        </Notice>
      ) : null}
      {detail && detail.flock.status === 'active' ? (
        <TodayCard detail={detail} missing={missing} roundPath={`${base}/round`} onDevice={today !== null && device.has(today)} onRecord={setRecording} />
      ) : null}
      {detail ? <HallAlerts detail={detail} onWeight={() => setWeighing(detail)} /> : null}
      {detail ? <HallActions detail={detail} back={here} onWeight={() => setWeighing(detail)} onEdit={() => setEditing(detail.flock)} /> : null}
      {detail ? <FeedSection flockId={detail.flock.id} back={here} canGive={canGive} /> : null}
      {detail ? <FlockView detail={detail} kind={kind} device={device} onRecord={setRecording} /> : null}
      {detail ? <HallFlockCard flock={detail.flock} onChanged={state.retry} /> : null}
      {recording && detail ? (
        <VisitDialog
          detail={detail}
          kind={kind}
          day={recording}
          onClose={() => setRecording(null)}
          onDone={() => {
            setRecording(null);
            setDeviceTick((n) => n + 1);
            // بلا نت لا قراءة من جديد (تفشل وتمحو الصفحة، R2): اليوم يظهر «على الجهاز» من الطابور.
            if (online) state.retry();
          }}
          // تعديل زيارة أو إلغاؤها من القائمة: النافذة تبقى، والفوج يُقرأ من جديد (آخر قراءة تبقى معروضة أثناءها).
          onChanged={() => {
            setDeviceTick((n) => n + 1);
            if (online) state.retry();
          }}
        />
      ) : null}
      {weighing ? (
        <WeightDialog
          detail={weighing}
          onClose={() => setWeighing(null)}
          onSaved={() => {
            setWeighing(null);
            state.retry();
          }}
        />
      ) : null}
      {editing ? (
        <FlockEditDialog
          hallName={hallLabel(editing.hallName)}
          flock={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            state.retry();
          }}
          // الفوج لم يعد موجوداً (R5): النافذة تُغلق، وصفحة القاعة تقرأ الحقل من جديد فتظهر فارغة؛ وشاشة الفوج بعينه ترجع إلى الحقل.
          onDeleted={() => {
            setEditing(null);
            if (onGone) onGone();
            else navigate(base, { replace: true });
          }}
          onStale={state.retry}
        />
      ) : null}
    </div>
  );
}

/** أعلى الصفحة: الرجوع إلى الحقل، والقاعة السابقة والتالية في الحقل نفسه (العامل يمرّ على القاعات واحدة بعد واحدة). */
function HallTop({ kind, nav }: { kind: FlockKind; nav?: Nav }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link to={farmPath(kind)} className={`${LINK_CLASS} inline-flex h-11 items-center gap-1`} data-action="hall-back">
        <ChevronRight aria-hidden="true" className="size-4" />
        {farmTitle(kind)}
      </Link>
      {nav ? (
        <div className="flex items-center gap-3">
          {nav.prev ? (
            <Link to={hallPath(kind, nav.prev.id)} className={`${LINK_CLASS} inline-flex h-11 items-center gap-1`} data-action="hall-prev">
              <ChevronRight aria-hidden="true" className="size-4" />
              {hallLabel(nav.prev.name)}
            </Link>
          ) : null}
          {nav.next ? (
            <Link to={hallPath(kind, nav.next.id)} className={`${LINK_CLASS} inline-flex h-11 items-center gap-1`} data-action="hall-next">
              {hallLabel(nav.next.name)}
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** القاعة بلا فوج قائم: تقول ذلك، وللمدير «افتح فوجاً» و«عدّل القاعة»، ولكلّ من يراها دوراتها السابقة. */
function EmptyHall({ kind, site, hall, nav, onChanged }: { kind: FlockKind; site: SiteView; hall: HallView; nav: Nav; onChanged: () => void }) {
  const [dialog, setDialog] = useState<'open' | 'edit' | null>(null);
  const here = hallPath(kind, hall.id);
  return (
    <div className="flex flex-col gap-4">
      <HallTop kind={kind} nav={nav} />
      <PageHeader title={hallLabel(hall.name)} subtitle={site.name} />
      <section className={CARD_CLASS} data-action="hall-empty">
        <h2 className="text-lg font-semibold">{t('hall.empty.title', 'القاعة فارغة: لا فوج قائم فيها.')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {site.canManage ? (
            <Button onClick={() => setDialog('open')} data-action="flock-open">
              {t('farm.flock.open', 'افتح فوجاً')}
            </Button>
          ) : null}
          {site.canManage ? (
            <Button variant="secondary" onClick={() => setDialog('edit')} data-action="hall-edit">
              {t('farm.hall.edit', 'عدّل القاعة')}
            </Button>
          ) : null}
          <Link to={`/halls/cycles?${new URLSearchParams({ back: here }).toString()}`} className={LINK_CLASS} data-action="hall-cycles">
            {t('hall.cycles', 'الدورات السابقة')}
          </Link>
        </div>
      </section>
      {dialog === 'open' ? (
        <OpenFlockDialog
          hall={hall}
          onClose={() => setDialog(null)}
          onOpened={() => {
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
      {dialog === 'edit' ? (
        <HallDialog
          site={site}
          hall={hall}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * صفحة القاعة (/hall/:id): القاعة من قراءة الحقول (محفوظة بالجهاز للفتح بلا نت)، بترتيب الحقل نفسه للسابقة والتالية، ثمّ فوجها القائم
 * أو حالها فارغة.
 */
export function HallPage({ kind }: { kind: FlockKind }) {
  const { id = '' } = useParams();
  const stamp = useStamp();
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  // قراءة الحقول لهذه الصفحة وحدها، لا مع كلّ رفع جولات (useOverview): رفع قاعة أخرى في الخلفية كان يطوي الصفحة ونوافذها (R1)؛
  // وآخر قراءة تبقى أثناء القراءة من جديد.
  const load = useCallback(() => loadOverviewKept(userId && orgId ? { userId, orgId, displayName } : null), [userId, orgId, displayName]);
  const state = useLoad(load);
  const kept = useKept(state.data);
  const sites = (kept?.overview.sites ?? []).filter((site) => site.kind === kind);
  // بترتيب الحقل نفسه: بالاسم كما يُقرأ («5» يُقرأ «قاعة 5» فيأتي بعد «قاعة 3»).
  const ordered = sites.flatMap((site) => [...site.halls].sort((a, b) => naturalCompare(hallLabel(a.name), hallLabel(b.name))).map((hall) => ({ site, hall })));
  const index = ordered.findIndex((entry) => entry.hall.id === id);
  const found = index >= 0 ? ordered[index] : undefined;
  if (state.error && !kept) {
    return state.error instanceof NotConnectedError ? <Notice tone="info" title={describeError(state.error).title} /> : <LoadFailed what={t('hall.what', 'القاعة')} error={state.error} onRetry={state.retry} />;
  }
  if (!kept) return null;
  if (!found) {
    return (
      <div className="flex flex-col gap-4">
        <HallTop kind={kind} />
        <Notice tone="info" title={t('hall.not_found', 'هذه القاعة غير موجودة أو خارج نطاقك.')} />
      </div>
    );
  }
  const { site, hall } = found;
  // السابقة والتالية في الحقل نفسه (R7): آخر قاعة في حقل لا تقفز إلى «قاعة 1» في حقل آخر.
  const inSite = ordered.filter((entry) => entry.site.id === site.id);
  const at = inSite.findIndex((entry) => entry.hall.id === hall.id);
  const nav: Nav = { prev: inSite[at - 1]?.hall ?? null, next: inSite[at + 1]?.hall ?? null };
  // المفتاح بالقاعة والفوج: الانتقال لقاعة أخرى يبدأ صفحتها من أوّلها (نوافذها وقراءتها).
  return hall.flock ? <FlockScreen key={`${hall.id}:${hall.flock.id}`} kind={kind} flockId={hall.flock.id} nav={nav} onGone={state.retry} /> : <EmptyHall key={hall.id} kind={kind} site={site} hall={hall} nav={nav} onChanged={state.retry} />;
}

/** /flock/:id: الدورة بعينها (المغلقة من تقريرها والروابط القديمة)، بنفس الشاشة بلا السابقة والتالية. */
export default function FlockPage({ kind }: { kind: FlockKind }) {
  const { id = '' } = useParams();
  return <FlockScreen key={id} kind={kind} flockId={id} />;
}
