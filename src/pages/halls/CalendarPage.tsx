import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Num } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { addDays, localDay, type Day } from '../../domain/dates';
import type { Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadFlockMonth, removeFlockLog, undoVaccination, type DayIssue, type DayVaccine, type FlockMonth, type HallFlock, type MonthDay } from '../../lib/repo/halls';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { BackLink, backTarget, bandStyle, daysText, flockPath, kgText, kindLabel, printAs, qtyText, roundPath, STATE_INK, stateLabel, VaccineName } from './parts';

// تقويم القاعة الشهري (0026، كلمة المالك 2026-11-11: «جدول شهر بالضبط، مربّعات كبيرة، يشوف بالضبط أيّ يوم نزل العلف لهم — الطنّ يكفي ثلاثة
// أيام — وشنو صار كلّ يوم، ويطلع تقارير ويطبعها؛ وخانة للأدوية المعطاة كلّ يوم»): /halls/calendar/:flockId?m=YYYY-MM بقراءة flock_month واحدة
// للشهر. الأسبوع يبدأ بالسبت وأسماء الأشهر كما تُكتب في العراق (اصطلاح تقويم تقرير العليقة، بمفاتيحه ونصوصه نفسها)، واليوم بإطار، وما خارج عمر
// الفوج باهت بلا ضغط. في كلّ مربّع: رقم اليوم والعمر، والعلف النازل ذلك اليوم شريطاً عريضاً بالكيلو (يوم العلف يبين من بعيد)، والأدوية (من المخزن،
// وبلا مخزن بعلامتها)، واللقاحات بخطّ لونها واسمها وحالتها، والنافق والمستبعد، وعلامة الملاحظة. والضغط على يوم يفتح تفاصيله كاملة وأفعالها:
// حذف تسجيل الدواء بتأكيد، وإلغاء تأشير اللقاح (بسبب إلزاميّ حين يعكس صرفاً من المخزن)، والمستحقّ يُؤشَّر في الجولة، و«أضف لهذا اليوم».
// و«اطبع الشهر» على A4 عرضاً بالشبكة كلّها وسطر المجاميع. والنتيجة المجهولة لحذف التسجيل أو إلغاء التأشير تجمّد نافذتها بـ«أعد المحاولة» بالنداء
// نفسه حرفاً (المعرّف والسبب والمرجع)؛ وكلاهما يُعاد بلا ضرر (الحذف بالمعرّف، والإلغاء يرجّع جوابه نفسه لتأشير ملغى)، فلا شيء يُحفظ خارج المكوّن.

type Month = string;

const MONTH_SHAPE = /^20\d\d-(?:0[1-9]|1[0-2])$/u;
const monthParam = (value: string | null): Month | null => (value !== null && MONTH_SHAPE.test(value) ? value : null);
const monthOf = (day: Day): Month => day.slice(0, 7);
const pad2 = (n: number): string => `${n < 10 ? '0' : ''}${n}`;
const monthIndex = (month: Month): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
/** الشهر بعد by شهراً (سالب للخلف). */
const shiftMonth = (month: Month, by: number): Month => {
  const index = monthIndex(month) + by;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
};
/** ترتيب اليوم في الأسبوع والسبت أوّله (0) والجمعة آخره (6). */
const weekdayOf = (day: Day): number => (new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay() + 1) % 7;
const dayNumber = (day: Day): number => Number(day.slice(8, 10));

const MONTH_NAMES = (): readonly string[] => [
  t('millrep.month.01', 'كانون الثاني'),
  t('millrep.month.02', 'شباط'),
  t('millrep.month.03', 'آذار'),
  t('millrep.month.04', 'نيسان'),
  t('millrep.month.05', 'أيار'),
  t('millrep.month.06', 'حزيران'),
  t('millrep.month.07', 'تموز'),
  t('millrep.month.08', 'آب'),
  t('millrep.month.09', 'أيلول'),
  t('millrep.month.10', 'تشرين الأول'),
  t('millrep.month.11', 'تشرين الثاني'),
  t('millrep.month.12', 'كانون الأول'),
];
/** الشهر وسنته («تشرين الثاني 2026»): السنة نصّ لا رقم بفواصل. */
const monthLabel = (month: Month): string => t('millrep.month.label', '{name} {year}', { name: MONTH_NAMES()[Number(month.slice(5, 7)) - 1] ?? month, year: month.slice(0, 4) });
const WEEKDAYS = (): readonly string[] => [
  t('millrep.wd.sat', 'السبت'),
  t('millrep.wd.sun', 'الأحد'),
  t('millrep.wd.mon', 'الاثنين'),
  t('millrep.wd.tue', 'الثلاثاء'),
  t('millrep.wd.wed', 'الأربعاء'),
  t('millrep.wd.thu', 'الخميس'),
  t('millrep.wd.fri', 'الجمعة'),
];
/** اليوم باسمه وتاريخه («الأربعاء 11/11/2026»). */
const dayLabel = (day: Day): string => t('millrep.day.label', '{weekday} {date}', { weekday: WEEKDAYS()[weekdayOf(day)] ?? '', date: fmtDay(day) });

const SEVEN = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', minWidth: '42rem' } as const;
/** إطار «اليوم» بلون العلامة (ظلّ داخليّ، بلا صنف جديد في CSS الإقلاع). */
const NOW_RING = 'inset 0 0 0 2px rgb(var(--ring))';
const DIM = { opacity: 0.45 } as const;

/**
 * الطباعة على A4 عرضاً (قاعدة تُضاف ما دامت الصفحة مفتوحة، لا في CSS الإقلاع): الشبكة بعرض الورقة بلا تمرير ولا عرض أدنى، والمربّع لا ينقسم،
 * وشريط العلف وخطوط اللقاحات تُطبع بألوانها، والبطاقة بلا إطار.
 */
const PRINT_STYLE = [
  '@page { size: A4 landscape; margin: 8mm; }',
  '@media print {',
  '[data-action="cal-card"] { border: 0 !important; box-shadow: none !important; padding: 0 !important; }',
  '[data-action="cal-scroll"] { overflow: visible !important; }',
  '[data-action="cal-grid"] { min-width: 0 !important; gap: 2px !important; }',
  '[data-action="cal-day"] { min-height: 17mm !important; font-size: 9px; padding: 2px !important; break-inside: avoid; }',
  '[data-action="feed-band"], [data-action="vac-band"], [data-action="vac-swatch"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '}',
].join(' ');

/**
 * لم يُحفظ شيء أكيداً: رفض الخادم، أو لم يخرج الطلب أو لم يصل، أو تزاحم فرجع، أو لا قاعدة ولا جلسة. وغيرها نتيجة مجهولة: ربّما تمّ.
 */
const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

const failureText = (problem: unknown): string => {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
};

/** صرف لقاح مؤشَّر يظهر مع تأشيره لا مع الأدوية: سطور اليوم بلا صرف تابع للقاح. */
function plainIssues(day: MonthDay) {
  const marked = new Set(day.vaccines.map((vaccine) => vaccine.issueId).filter((id): id is string => id !== null));
  return day.issues.filter((issue) => !marked.has(issue.issueId));
}

/**
 * العلف النازل: كيلو الموزون منه، وما لا وزن له (لتر بلا كثافة أو قطعة بلا وزن) بكميته لكلّ وحدة نصّاً («10 قطع»)، أو '' حين كلّه موزون. الكيلو وحده
 * كان يبدو رقماً كاملاً واليوم فيه أكياس بلا وزن (مراجعة 0026 D).
 */
function feedOf(issues: readonly DayIssue[]): { kg: Milli; count: number; unweighed: string } {
  const feed = issues.filter((issue) => issue.costKind === 'feed');
  const rest = new Map<BaseUnit, Milli>();
  let kg = 0n;
  for (const issue of feed) {
    if (issue.kg === null) rest.set(issue.baseUnit, (rest.get(issue.baseUnit) ?? 0n) + issue.qty);
    else kg += issue.kg;
  }
  return { kg, count: feed.length, unweighed: [...rest].map(([unit, qty]) => fmtQty(qty, unit).main).join(t('list.separator', '، ')) };
}

/** نصّ العلف في شريط اليوم: «علف 1,000 كغم»، و«علف 1,000 كغم + 10 قطع بلا وزن»، و«علف 10 قطع بلا وزن». */
function feedBand(feed: ReturnType<typeof feedOf>): string {
  if (feed.unweighed === '') return t('halls.cal.feed_band', 'علف {kg}', { kg: kgText(feed.kg) });
  return feed.kg > 0n
    ? t('halls.cal.feed_band_partial', 'علف {kg} + {rest} بلا وزن', { kg: kgText(feed.kg), rest: feed.unweighed })
    : t('halls.cal.feed_band_none', 'علف {rest} بلا وزن', { rest: feed.unweighed });
}

/** مربّع يوم: رقمه وعمره، وشريط العلف النازل، والأدوية، واللقاحات، والنافق والمستبعد، والملاحظة. */
function DaySquare({ day, today, onOpen }: { day: MonthDay; today: Day; onOpen: (day: Day) => void }) {
  const life = day.age !== null;
  const feed = feedOf(plainIssues(day));
  const medicines = plainIssues(day).filter((issue) => issue.costKind !== 'feed');
  const style = { boxShadow: day.on === today ? NOW_RING : undefined, ...(life ? null : DIM) };
  const body = (
    <>
      <span className="sr-only">{dayLabel(day.on)}</span>
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-lg font-semibold tabular-nums" aria-hidden="true">
          {fmtInt(dayNumber(day.on))}
        </span>
        {day.age !== null ? <span className="text-2xs text-ink-muted">{t('halls.cal.age_short', 'عمر {n}', { n: day.age })}</span> : null}
      </span>
      {feed.count > 0 ? (
        // بلا قصّ: «علف 1,000 كغم» تلتفّ في المربّع الضيّق (القصّ بالعربية كان يقطع الرقم «علف 000,…»).
        <span className="rounded bg-brand-600 px-2 text-center text-xs font-semibold text-white dark:bg-brand-500" data-action="feed-band">
          {feedBand(feed)}
        </span>
      ) : null}
      {medicines.map((issue) => (
        <span key={issue.issueId} className="truncate text-2xs" data-action="day-medicine">
          {issue.name}
        </span>
      ))}
      {day.logs.map((log) => (
        <span key={log.id} className="truncate text-2xs" data-action="day-log">
          {t('halls.cal.log_short', '{name} (بلا مخزن)', { name: log.name })}
        </span>
      ))}
      {day.vaccines.map((vaccine) => (
        <span key={`${vaccine.vaccineId}|${vaccine.ageDay}`} className="truncate rounded bg-surface-2 px-2 text-2xs" style={bandStyle(vaccine.color)} data-action="vac-band" data-state={vaccine.state}>
          {vaccine.name} <span className={`font-semibold ${STATE_INK[vaccine.state]}`}>{stateLabel(vaccine.state)}</span>
        </span>
      ))}
      {(day.dead ?? 0) > 0 || (day.culled ?? 0) > 0 ? (
        <span className="truncate text-2xs text-ink-muted" data-action="day-dead">
          {[
            (day.dead ?? 0) > 0 ? t('halls.cal.dead_short', 'نافق {n}', { n: day.dead ?? 0 }) : '',
            (day.culled ?? 0) > 0 ? t('halls.cal.culled_short', 'مستبعد {n}', { n: day.culled ?? 0 }) : '',
          ]
            .filter(Boolean)
            .join(t('list.separator', '، '))}
        </span>
      ) : null}
      {day.note !== null ? (
        <span className="truncate text-2xs text-ink-muted" data-action="day-note-mark">
          {t('halls.cal.note_mark', 'ملاحظة')}
        </span>
      ) : null}
    </>
  );
  const look = 'flex min-h-28 min-w-0 flex-col items-stretch gap-0.5 rounded-xl border border-line bg-surface-1 p-1 text-start';
  return life ? (
    <button type="button" className={`${look} transition-shadow hover:shadow-soft`} style={style} aria-current={day.on === today ? 'date' : undefined} onClick={() => onOpen(day.on)} data-action="cal-day" data-day={day.on}>
      {body}
    </button>
  ) : (
    <div className={look} style={style} data-action="cal-day" data-day={day.on} data-outside="1">
      {body}
    </div>
  );
}

type Log = MonthDay['logs'][number];
type Removing = { log: Log; on: Day; busy: boolean; failure: string | null; frozen: boolean };
type Undoing = { mark: DayVaccine; on: Day; reason: string; ref: string; busy: boolean; failure: string | null; frozen: { reason: string | null } | null };

const RETRY_UNREACHED = () => t('halls.kit.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.');

/** تفاصيل يوم وأفعاله: الصرف بمستنده وكميته، والجولة، والأدوية بلا مخزن بـ«احذف»، واللقاحات بأفعالها، و«أضف لهذا اليوم». */
function DayPanel({ data, day, reading, calendarUrl, onClose, onChanged }: { data: FlockMonth; day: MonthDay; reading: boolean; calendarUrl: string; onClose: () => void; onChanged: () => void }) {
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [undoing, setUndoing] = useState<Undoing | null>(null);
  const { flock, can, today } = data;
  const issues = plainIssues(day);
  const giveOpen = can.give && day.age !== null && day.on >= flock.placedOn && day.on <= today && day.on >= addDays(today, -7);
  const roundPresent = day.dead !== null || day.culled !== null || day.feedKg !== null || day.note !== null;

  const remove = async () => {
    if (!removing || removing.busy) return;
    const retrying = removing.frozen;
    setRemoving({ ...removing, busy: true, failure: null });
    try {
      const done = await removeFlockLog(removing.log.id);
      // «كان محذوفاً» بعد إعادة لنتيجة مجهولة أرجح ما يعني أنّ المحاولة الأولى من هذا الجهاز حذفته: يُقال «حُذف» بلا «من جهاز آخر» (مراجعة 0026 G).
      toast({
        tone: 'success',
        title:
          done.removed || retrying
            ? t('halls.cal.log_removed', 'حُذف تسجيل «{name}».', { name: removing.log.name })
            : t('halls.cal.log_gone', 'كان تسجيل «{name}» محذوفاً من جهاز آخر.', { name: removing.log.name }),
      });
      setRemoving(null);
      onChanged();
    } catch (problem) {
      // لا نعرف إن حُذف: النافذة تتجمّد والإعادة بالمعرّف نفسه (الحذف مرّة ثانية يرجّع «كان محذوفاً»). وإعادة لم تصل لا تغيّر ذلك.
      const unknown = !surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError));
      setRemoving((current) =>
        current ? { ...current, busy: false, frozen: unknown, failure: unknown ? (retrying && surelyUnsaved(problem) ? RETRY_UNREACHED() : null) : failureText(problem) } : current,
      );
    }
  };

  const undo = async () => {
    if (!undoing || undoing.busy || undoing.mark.vaccinationId === null) return;
    const retrying = undoing.frozen !== null;
    const typed = undoing.reason.trim();
    const reason = undoing.frozen ? undoing.frozen.reason : typed === '' ? null : typed;
    if (!retrying && undoing.mark.issueId !== null && reason === null) {
      setUndoing({ ...undoing, failure: t('halls.cal.undo_reason_need', 'اكتب سبب الإلغاء: يُعكس صرف اللقاح من المخزن.') });
      return;
    }
    setUndoing({ ...undoing, busy: true, failure: null });
    try {
      const done = await undoVaccination(undoing.mark.vaccinationId, reason, undoing.ref);
      toast({
        tone: 'success',
        title: done.issueVoided
          ? t('halls.cal.undone_issue', 'أُلغي تأشير «{name}» ورجعت كمية اللقاح إلى مخزنها.', { name: undoing.mark.name })
          : t('halls.cal.undone', 'أُلغي تأشير «{name}».', { name: undoing.mark.name }),
      });
      setUndoing(null);
      onChanged();
    } catch (problem) {
      // نتيجة مجهولة: تتجمّد بالسبب والمرجع كما أُرسلا (الإلغاء مرّة ثانية يرجّع جوابه نفسه). ورفض أكيد: السبب باقٍ، والمحاولة التالية بمرجع جديد.
      const unknown = !surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError));
      setUndoing((current) =>
        current
          ? unknown
            ? { ...current, busy: false, frozen: { reason }, failure: retrying && surelyUnsaved(problem) ? RETRY_UNREACHED() : null }
            : { ...current, busy: false, frozen: null, ref: crypto.randomUUID(), failure: failureText(problem) }
          : current,
      );
    }
  };

  const closeRemoving = () => {
    const uncertain = removing?.frozen ?? false;
    setRemoving(null);
    if (uncertain) onChanged();
  };
  const closeUndoing = () => {
    const uncertain = undoing?.frozen !== null && undoing?.frozen !== undefined;
    setUndoing(null);
    if (uncertain) onChanged();
  };

  const section = (title: string, action: string, children: ReactNode) => (
    <section className="flex flex-col gap-2" data-action={action}>
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      locked={removing?.busy || undoing?.busy}
      title={day.age !== null ? t('halls.cal.day_title', '{day} — عمر {age}', { day: dayLabel(day.on), age: day.age }) : dayLabel(day.on)}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} data-action="day-close">
            {t('halls.cal.day_close', 'أغلق')}
          </Button>
          {giveOpen ? (
            <Link
              to={`/halls/give/${flock.id}?${new URLSearchParams({ on: day.on, back: calendarUrl }).toString()}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 font-semibold text-white shadow-soft hover:bg-brand-700"
              data-action="give-day"
            >
              {t('halls.cal.give_day', 'أضف لهذا اليوم')}
            </Link>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-5" data-action="day-panel" data-day={day.on}>
        {reading ? (
          <p role="status" className="text-sm text-ink-muted">
            {t('halls.cal.reading', 'يُقرأ الشهر من جديد…')}
          </p>
        ) : null}
        {section(
          t('halls.cal.sec.issues', 'ما نزل من المخزن'),
          'day-issues',
          issues.length ? (
            <ul className="flex flex-col gap-2">
              {issues.map((issue) => (
                <li key={issue.issueId} className="flex flex-wrap items-baseline gap-x-2" data-action="day-issue" data-id={issue.issueId}>
                  <Num>{issue.docNo}</Num>
                  <span className="font-semibold">{issue.name}</span>
                  <span>{qtyText(issue.qty, issue.baseUnit)}</span>
                  {issue.costKind === 'feed' ? <span className="rounded bg-brand-600 px-2 text-xs font-semibold text-white dark:bg-brand-500">{t('halls.cal.feed_tag', 'علف')}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t('halls.cal.no_issues', 'لم ينزل شيء من المخزن في هذا اليوم.')}</p>
          ),
        )}
        {section(
          t('halls.cal.sec.round', 'الجولة'),
          'day-round',
          roundPresent ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-ink-muted">{t('halls.cal.consumed', 'الاستهلاك المسجّل')}</dt>
                <dd data-action="day-consumed">{day.feedKg === null ? '—' : kgText(day.feedKg)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{t('round.dead', 'النافق')}</dt>
                <dd>{day.dead === null ? '—' : fmtInt(day.dead)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{t('round.culled', 'المستبعد')}</dt>
                <dd>{day.culled === null ? '—' : fmtInt(day.culled)}</dd>
              </div>
              {day.note !== null ? (
                <div className="col-span-2">
                  <dt className="text-ink-muted">{t('halls.cal.note', 'الملاحظة')}</dt>
                  <dd data-action="day-note">{day.note}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-ink-muted">{t('halls.cal.no_round', 'لم تُسجَّل جولة في هذا اليوم.')}</p>
          ),
        )}
        {section(
          t('halls.cal.sec.logs', 'أدوية بلا مخزن'),
          'day-logs',
          day.logs.length ? (
            <ul className="flex flex-col gap-2">
              {day.logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2" data-action="log-row" data-id={log.id}>
                  <span>
                    <span className="font-semibold">{log.name}</span>
                    {log.dose ? <span className="text-ink-muted">{t('halls.cal.dose', ' — الجرعة: {dose}', { dose: log.dose })}</span> : null}
                  </span>
                  {can.log ? (
                    <Button size="sm" variant="ghost" disabled={reading} onClick={() => setRemoving({ log, on: day.on, busy: false, failure: null, frozen: false })} data-action="log-remove" data-id={log.id}>
                      {t('halls.cal.log_remove', 'احذف')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t('halls.cal.no_logs', 'لا دواء مسجّلاً بلا مخزن في هذا اليوم.')}</p>
          ),
        )}
        {section(
          t('halls.cal.sec.vaccines', 'اللقاحات'),
          'day-vaccines',
          day.vaccines.length ? (
            <ul className="flex flex-col gap-2">
              {day.vaccines.map((vaccine) => {
                // رقم صرف اللقاح المربوط من التأشير نفسه: flock_month يخرج صرف التأشير الحيّ من سطور اليوم (مراجعة 0026 A).
                const doc = vaccine.issueId === null ? null : vaccine.docNo;
                const undoable = vaccine.state === 'done' && vaccine.vaccinationId !== null && can.vaccinate && (vaccine.issueId === null || can.undoIssue);
                // التأشير في الجولة من تذكيرها، والتذكير والخادم يقبلان الفائت حتى سبعة أيام بعد موعده؛ الأقدم «فات ولم يُؤشَّر» بلا رابط (مراجعة 0026 E).
                const markable = (vaccine.state === 'today' || vaccine.state === 'missed') && can.vaccinate;
                return (
                  <li key={`${vaccine.vaccineId}|${vaccine.ageDay}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2" style={bandStyle(vaccine.color)} data-action="vac-row" data-state={vaccine.state}>
                    <span className="flex min-w-0 flex-col">
                      <VaccineName name={vaccine.name} color={vaccine.color}>
                        <span className={`font-semibold ${STATE_INK[vaccine.state]}`}>{stateLabel(vaccine.state)}</span>
                      </VaccineName>
                      <span className="text-xs text-ink-muted">
                        {vaccine.state === 'done'
                          ? vaccine.issueId === null
                            ? t('halls.cal.vac_done_mark', 'موعد اليوم {age}، أُشِّر بلا صرف من المخزن.', { age: vaccine.ageDay })
                            : doc
                              ? t('halls.cal.vac_done_doc', 'موعد اليوم {age}، وصُرف من المخزن بالمستند {doc}.', { age: vaccine.ageDay, doc })
                              : t('halls.cal.vac_done_issue', 'موعد اليوم {age}، وصُرف من المخزن.', { age: vaccine.ageDay })
                          : t('halls.cal.vac_slot', 'موعد اليوم {age} من عمر الطيور.', { age: vaccine.ageDay })}
                      </span>
                    </span>
                    {undoable ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reading}
                        onClick={() => setUndoing({ mark: vaccine, on: day.on, reason: '', ref: crypto.randomUUID(), busy: false, failure: null, frozen: null })}
                        data-action="vac-undo"
                      >
                        {t('halls.cal.vac_undo', 'ألغِ التأشير')}
                      </Button>
                    ) : vaccine.state === 'done' && vaccine.issueId !== null && can.vaccinate && !can.undoIssue ? (
                      <span className="text-xs text-ink-muted">{t('halls.cal.vac_undo_void', 'إلغاء هذا التأشير يعكس صرفاً من المخزن، فهو لمن يلغي الصرف.')}</span>
                    ) : markable && day.on >= addDays(today, -7) ? (
                      <Link to={roundPath(flock.kind)} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="vac-round">
                        {t('halls.cal.vac_round', 'أشّره في الجولة')}
                      </Link>
                    ) : markable ? (
                      <span className="text-xs text-ink-muted" data-action="vac-too-old">
                        {t('halls.cal.vac_too_old', 'فات ولم يُؤشَّر')}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t('halls.cal.no_vaccines', 'لا لقاح في هذا اليوم.')}</p>
          ),
        )}
      </div>
      {removing ? (
        <ConfirmDialog
          open
          title={t('halls.cal.log_remove_title', 'احذف تسجيل «{name}»', { name: removing.log.name })}
          consequence={
            <div className="flex flex-col gap-3" data-action="log-remove-dialog">
              <p>
                {t('halls.cal.log_remove_detail', 'يُحذف تسجيل الدواء «{name}» من يوم {day} وحده؛ هو تسجيل بلا مخزن، فلا يمسّ المخزون ولا المال.', {
                  name: removing.log.name,
                  day: fmtDay(removing.on),
                })}
              </p>
              {removing.frozen ? <Notice tone="warning" title={t('halls.cal.log_frozen', 'لا نعرف إن حُذف التسجيل: أعد المحاولة؛ الحذف مرّة ثانية لا يضرّ.')} /> : null}
              {removing.failure ? <Notice tone="danger" title={removing.failure} /> : null}
            </div>
          }
          confirmLabel={removing.frozen ? t('halls.kit.retry', 'أعد المحاولة') : t('halls.cal.log_remove_go', 'احذف التسجيل')}
          busy={removing.busy}
          action={removing.frozen ? 'log-remove-retry' : 'log-remove-go'}
          onConfirm={() => void remove()}
          onCancel={closeRemoving}
        />
      ) : null}
      {undoing ? (
        <ConfirmDialog
          open
          title={t('halls.cal.undo_title', 'ألغِ تأشير «{name}» ليوم {day}', { name: undoing.mark.name, day: fmtDay(undoing.on) })}
          consequence={
            <div className="flex flex-col gap-3" data-action="undo-dialog">
              <p>
                {undoing.mark.issueId !== null
                  ? t('halls.cal.undo_issue_detail', 'يُلغى التأشير ويُعكس صرف اللقاح من المخزن بحركة عكسية فترجع كميته إلى مخزنها؛ ويعود الموعد مستحقّاً.')
                  : t('halls.cal.undo_detail', 'يُلغى التأشير ويعود الموعد مستحقّاً؛ لم يُصرف شيء من المخزن لهذا التأشير.')}
              </p>
              <Field
                id="halls-undo-reason"
                label={undoing.mark.issueId !== null ? t('halls.cal.undo_reason', 'سبب الإلغاء (إلزامي)') : t('halls.cal.undo_reason_opt', 'سبب الإلغاء (اختياري)')}
              >
                <textarea
                  id="halls-undo-reason"
                  className="input"
                  rows={2}
                  maxLength={500}
                  value={undoing.frozen ? (undoing.frozen.reason ?? '') : undoing.reason}
                  readOnly={undoing.frozen !== null || undoing.busy}
                  onChange={(event) => setUndoing({ ...undoing, reason: event.target.value, failure: null })}
                  data-action="undo-reason"
                />
              </Field>
              {undoing.frozen ? <Notice tone="warning" title={t('halls.cal.undo_frozen', 'لا نعرف إن أُلغي التأشير: أعد المحاولة؛ لن يُلغى مرّتين.')} /> : null}
              {undoing.failure ? <Notice tone="danger" title={undoing.failure} /> : null}
            </div>
          }
          confirmLabel={undoing.frozen ? t('halls.kit.retry', 'أعد المحاولة') : t('halls.cal.undo_go', 'ألغِ التأشير')}
          busy={undoing.busy}
          action={undoing.frozen ? 'undo-retry' : 'undo-go'}
          onConfirm={() => void undo()}
          onCancel={closeUndoing}
        />
      ) : null}
    </Dialog>
  );
}

/** الشهر الذي فيه أيام الفوج حين يقع الشهر المعروض كلّه خارجها: آخر شهر لفوج أُغلق قبله، أو أوّل شهر لفوج يُسكَّن بعده. */
function lifeMonth(flock: HallFlock, month: Month): Month | null {
  if (flock.closedOn !== null && monthOf(flock.closedOn) < month) return monthOf(flock.closedOn);
  if (monthOf(flock.placedOn) > month) return monthOf(flock.placedOn);
  return null;
}

function CalendarView({ flockId }: { flockId: string }) {
  const [search, setSearch] = useSearchParams();
  const session = useSession();
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  const asked = monthParam(search.get('m'));
  // بلا ?m=: شهر الجهاز، ثمّ شهر من عمر الفوج إن وقع شهر الجهاز كلّه خارجه (فوج أُغلق قبله).
  const [deviceMonth] = useState(() => monthOf(localDay()));
  const [adjusted, setAdjusted] = useState<Month | null>(null);
  const month = asked ?? adjusted ?? deviceMonth;
  const key = `${flockId}|${month}`;
  const load = useCallback(() => loadFlockMonth(flockId, `${month}-01`), [flockId, month]);
  const state = useLoad(load, key);
  // آخر قراءة ناجحة لكلّ شهر: تبقى مرسومة أثناء القراءة من جديد بعد فعل (والأفعال معطّلة أثناءها)، ولا تُعرض لشهر آخر.
  const [kept, setKept] = useState<{ key: string; data: FlockMonth } | null>(null);
  if (state.data !== null && kept?.data !== state.data) setKept({ key, data: state.data });
  const data = state.error ? null : (state.data ?? (kept !== null && kept.key === key ? kept.data : null));
  const flock = data?.flock ?? kept?.data.flock ?? null;
  if (asked === null && adjusted === null && data !== null && data.days.every((day) => day.age === null)) {
    const target = lifeMonth(data.flock, month);
    if (target !== null) setAdjusted(target);
  }
  const [open, setOpen] = useState<Day | null>(null);
  // بالهاتف الشبكة أعرض من الشاشة وتُمرَّر داخل بطاقتها: حين يصل الشهر يُمرَّر عمود اليوم الحاليّ إلى الوسط أفقياً وحده (بلا قفز في الصفحة).
  const scroller = useRef<HTMLDivElement>(null);
  const shownKey = data !== null ? key : null;
  useEffect(() => {
    const box = scroller.current;
    if (shownKey === null || !box || !(box.scrollWidth > box.clientWidth)) return;
    const now = box.querySelector<HTMLElement>('[aria-current="date"]');
    if (!now) return;
    const cellBox = now.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    box.scrollLeft += cellBox.left + cellBox.width / 2 - (boxRect.left + boxRect.width / 2);
  }, [shownKey]);

  const go = (next: Month) => {
    const params = new URLSearchParams(search);
    params.set('m', next);
    setOpen(null);
    setSearch(params);
  };
  const calendarUrl = `/halls/calendar/${flockId}?m=${month}`;
  const back = backTarget(search.get('back'), flock ? flockPath(flock.kind, flock.id) : '/');
  const title = flock ? t('halls.cal.heading', 'تقويم {hall} — {site}', { hall: flock.hallName, site: flock.siteName }) : t('halls.calendar.title', 'تقويم القاعة');
  const ages = (data?.days ?? []).map((day) => day.age).filter((age): age is number => age !== null);
  const openDay = open !== null && data !== null ? (data.days.find((day) => day.on === open) ?? null) : null;
  const offset = data && data.days.length ? weekdayOf(data.days[0]?.on ?? `${month}-01`) : 0;
  // كيلو الشهر من الخادم (totals)، وما بلا وزن من سطور أيّامه: سطر المجاميع يقوله كشريط اليوم (مراجعة 0026 D).
  const monthFeed = data ? feedOf(data.days.flatMap(plainIssues)) : null;

  return (
    <div className="flex flex-col gap-5" data-action="calendar-page">
      <style>{PRINT_STYLE}</style>
      <BackLink to={back} label={t('halls.kit.back_hall', 'رجوع إلى القاعة')} />
      <header className="flex flex-col gap-1">
        {orgName ? (
          <p className="hidden text-sm text-ink-muted print:block" data-action="cal-org">
            {orgName}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold" data-action="cal-title">
          {title}
        </h1>
        {flock ? (
          <p className="text-ink-muted" data-action="cal-flock">
            {t('halls.cal.flock_line', 'فوج {kind} سُكّن يوم {day}، بعدد {count}.', { kind: kindLabel(flock.kind), day: fmtDay(flock.placedOn), count: flock.placedCount })}
            {flock.closedOn !== null ? t('halls.cal.closed', ' أُغلق يوم {day}.', { day: fmtDay(flock.closedOn) }) : ''}
          </p>
        ) : null}
        {flock ? (
          <p className="text-ink-muted" data-action="cal-end">
            {flock.endOn !== null && flock.endAge !== null
              ? t('halls.cal.end', 'نهاية الدورة المخطّطة: {day} (العمر: {age}).', { day: fmtDay(flock.endOn), age: daysText(flock.endAge) })
              : t('halls.cal.no_end', 'لا جدول لقاحات لهذا النوع بعد، فلا نهاية دورة مخطّطة.')}
          </p>
        ) : null}
        {data ? (
          <p className="text-ink-muted" data-action="cal-ages">
            {ages.length
              ? t('halls.cal.ages', 'العمر في {month}: من {from} إلى {to}.', { month: monthLabel(month), from: ages[0] ?? 0, to: ages[ages.length - 1] ?? 0 })
              : t('halls.cal.ages_none', 'لا أيام من عمر الفوج في {month}.', { month: monthLabel(month) })}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2 print:hidden" data-action="cal-bar">
        <Button size="sm" variant="secondary" disabled={!data?.prev} onClick={() => go(shiftMonth(month, -1))} data-action="month-prev">
          {t('halls.cal.prev', 'الشهر السابق')}
        </Button>
        <Button size="sm" variant="secondary" disabled={!data?.next} onClick={() => go(shiftMonth(month, 1))} data-action="month-next">
          {t('halls.cal.next', 'الشهر التالي')}
        </Button>
        <Button size="sm" variant="secondary" disabled={data === null} onClick={() => (flock ? printAs(t('halls.cal.print_title', 'تقويم {hall} — {site} — {month}', { hall: flock.hallName, site: flock.siteName, month: monthLabel(month) })) : undefined)} data-action="print-month">
          {t('halls.cal.print', 'اطبع الشهر')}
        </Button>
        <Link to={`/halls/report/${flockId}?${new URLSearchParams({ back: calendarUrl }).toString()}`} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="cal-report">
          {t('halls.cal.report', 'تقرير الدورة')}
        </Link>
        {flock ? (
          <Link to={`/halls/vaccines?${new URLSearchParams({ kind: flock.kind, back: calendarUrl }).toString()}`} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="cal-vaccines">
            {t('halls.cal.vaccines', 'جدول اللقاحات')}
          </Link>
        ) : null}
      </div>

      {state.error ? (
        state.error instanceof RejectedError && state.error.hint ? (
          <Notice tone="warning" title={state.error.hint} />
        ) : (
          <LoadFailed what={t('halls.cal.what', 'تقويم القاعة')} error={state.error} onRetry={state.retry} />
        )
      ) : null}

      <section className="card flex flex-col gap-3 p-4" aria-label={monthLabel(month)} data-action="cal-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold" data-action="cal-month">
            {monthLabel(month)}
          </h2>
          {data ? (
            <p className="text-sm" data-action="cal-totals">
              {monthFeed !== null && monthFeed.unweighed !== ''
                ? t('halls.cal.totals_partial', 'العلف النازل في الشهر: {kg} + {rest} بلا وزن — النافق: {dead} — المستبعد: {culled}', {
                    kg: kgText(data.totals.feedKg),
                    rest: monthFeed.unweighed,
                    dead: data.totals.dead,
                    culled: data.totals.culled,
                  })
                : t('halls.cal.totals', 'العلف النازل في الشهر: {kg} — النافق: {dead} — المستبعد: {culled}', { kg: kgText(data.totals.feedKg), dead: data.totals.dead, culled: data.totals.culled })}
            </p>
          ) : null}
        </div>
        {data ? (
          // relative: الحاوية تحتوي عناصر sr-only المطلقة في المربّعات، وإلّا خرجت من قصّ التمرير فوسّعت الصفحة كلّها (Chromium بعرض 390: 617).
          <div ref={scroller} className="relative overflow-auto" data-action="cal-scroll">
            <div className="grid gap-1" style={SEVEN} data-action="cal-grid">
              {WEEKDAYS().map((weekday) => (
                <div key={weekday} className="text-center text-xs font-semibold text-ink-muted" data-action="weekday">
                  {weekday}
                </div>
              ))}
              {Array.from({ length: offset }, (_, index) => (
                <div key={`blank-${index}`} aria-hidden="true" data-action="day-blank" />
              ))}
              {data.days.map((day) => (
                <DaySquare key={day.on} day={day} today={data.today} onOpen={setOpen} />
              ))}
            </div>
          </div>
        ) : !state.error ? (
          <p role="status" className="text-sm text-ink-muted" data-action="cal-loading">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted" data-action="cal-legend">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-brand-600 px-2 font-semibold text-white dark:bg-brand-500">{t('halls.cal.feed_tag', 'علف')}</span>
            {t('halls.cal.legend.feed', 'يوم نزل فيه علف إلى القاعة، وكميته بالكيلو.')}
          </span>
          <span>{t('halls.cal.legend.vaccine', 'خطّ اللون لون اللقاح في جدول اللقاحات، والكلمة بجانبه حالته: تمّ، اليوم، فات، قادم.')}</span>
          <span>{t('halls.cal.legend.dim', 'الأيام الباهتة خارج عمر الفوج، واليوم الحاليّ بإطار.')}</span>
        </div>
      </section>

      {data && openDay ? (
        <DayPanel
          data={data}
          day={openDay}
          reading={state.loading}
          calendarUrl={calendarUrl}
          onClose={() => setOpen(null)}
          onChanged={state.retry}
        />
      ) : null}
    </div>
  );
}

export default function CalendarPage() {
  const { flockId = '' } = useParams();
  // بمفتاح الفوج: الانتقال من قاعة إلى أخرى يبدأ من أوّله (الشهر واليوم المفتوح وما قُرئ).
  return <CalendarView key={flockId} flockId={flockId} />;
}
