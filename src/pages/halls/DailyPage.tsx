import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { addDays, localDay, type Day } from '../../domain/dates';
import type { Milli } from '../../domain/money';
import { parseDayText } from '../../lib/dayText';
import { RejectedError } from '../../lib/errors';
import { columnDecimals, countForm, fmtDay, fmtInt, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadHallsDay, type DayFlock, type DayHall, type DaySite, type DayTotals, type HallsDay } from '../../lib/repo/hallReports';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { BackLink, backLabel, daysText, kgText, kindLabel, leftNegativeText, linesText, outsideKgText, printAs, qtyText, reportsBack, STATE_INK, stateLabel, VaccineName } from './parts';

// تقرير القاعات اليومي (0027، كلمة المالك 2026-11-12: «تقارير القاعات الي تطلعلي بشكل يومي»، docs/HALLS_REPORTS_PLAN.md): /halls/day?on=YYYY-MM-DD
// بقراءة halls_day واحدة لكلّ القاعات في نطاق القارئ مجمَّعة بالحقل. اليوم في الرابط (بلاه يوم الجهاز، أو اليوم قبله بهدوء حين يرفضه الخادم يوماً لم
// يأتِ بعد)، والأيام بسهمين («اليوم السابق» و«اليوم التالي» المقفول عند اليوم) ومنتقٍ و«اليوم» بنمط الرصيد اليومي، والأزرار نصّاً كأزرار التقويم: أيقونة
// من خارج حزمة القاعات تفصل حزمة محفوظة جديدة.
// بالهاتف بطاقة لكلّ قاعة بأرقامها المهمّة و«لم تُسجَّل الجولة» أو «فارغة»؛ وبالشاشة العريضة وفي الطباعة (A4 بالعرض) جدول لكلّ حقل بصفّ مجاميع
// الخادم («من N قاعة» حين تنقص الجولات)، والتبديل بـ<style> الصفحة بلا أصناف جديدة. والقيمة الغائبة «—» لا صفر. والقراءة الأخيرة الناجحة تبقى
// معروضة بتاريخها حين تُقرأ التالية أو تفشل (و«أعد المحاولة»)، والطباعة والمشاركة لليوم المطلوب وحده. ومن كلّ قاعة رابطا تقويمها (شهر اليوم)
// وتقرير دورتها، برجوع إلى هذا اليوم. بلا مال.

const PAGE_STYLE = [
  '@page { size: A4 landscape; margin: 10mm; }',
  '[data-action="day-table"] { display: none; }',
  '@media (min-width: 768px) { [data-action="day-cards"] { display: none; } [data-action="day-table"] { display: block; } }',
  '@media print {',
  '[data-action="day-cards"] { display: none !important; }',
  '[data-action="day-table"] { display: block !important; }',
  '[data-action="daily-page"] table { font-size: 10px; }',
  '[data-action="daily-page"] th, [data-action="daily-page"] td { padding: 2px 4px; white-space: normal; min-width: 0; }',
  '[data-action="daily-page"] td bdi { white-space: nowrap; }',
  '[data-action="daily-page"] tfoot { display: table-row-group; }',
  '[data-action="daily-page"] tr { break-inside: avoid; }',
  '[data-action="day-site"] h2 { break-after: avoid; }',
  '[data-action="vac-swatch"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '}',
].join(' ');

const dash = () => t('halls.day.dash', '—');
const pct = (hundredths: bigint): string => `${fmtScaledCell(hundredths, 2, 2)}%`;
const grams = (tenths: bigint): string => fmtScaledCell(tenths, 1, 1);
/** مراتب عمود كميات بالآلاف: أقلّ ما يبيّن كلّ قيمه (الغائب لا يُحسب). */
const decimalsOf = (values: readonly (Milli | null)[]): 0 | 1 | 2 | 3 => columnDecimals(values.filter((value): value is Milli => value !== null), 3) as 0 | 1 | 2 | 3;
/** يوم بالتقويم في الرابط (YYYY-MM-DD) بقراءة parseDayText القائمة (نمط الرصيد اليومي)، وإلّا null. */
const dayOf = (value: string | null): Day | null => (value !== null && parseDayText(value.split('-').reverse().join('/')) === value ? value : null);

/** «من قاعة واحدة»، «من قاعتين»، «من 3 قاعات»، «من 11 قاعةً»، «من 100 قاعة». */
export function fromHalls(n: number): string {
  if (n === 1) return t('halls.day.from.one', 'من قاعة واحدة');
  if (n === 2) return t('halls.day.from.two', 'من قاعتين');
  const form = countForm(n);
  if (form === 'few') return t('halls.day.from.few', 'من {n} قاعات', { n });
  if (form === 'many') return t('halls.day.from.many', 'من {n} قاعةً', { n });
  return t('halls.day.from.hundreds', 'من {n} قاعة', { n });
}

/** سطور العلف بلا وزن: «وسطر واحد بلا وزن»، «وسطران بلا وزن»، «و3 سطور بلا وزن»… */
function unweighedText(n: number): string {
  if (n === 1) return t('halls.day.unweighed.one', 'وسطر واحد بلا وزن');
  if (n === 2) return t('halls.day.unweighed.two', 'وسطران بلا وزن');
  const form = countForm(n);
  if (form === 'few') return t('halls.day.unweighed.few', 'و{n} سطور بلا وزن', { n });
  if (form === 'many') return t('halls.day.unweighed.many', 'و{n} سطراً بلا وزن', { n });
  return t('halls.day.unweighed.hundreds', 'و{n} سطر بلا وزن', { n });
}

export const dayTitle = (on: Day): string => t('halls.day.title', 'تقرير القاعات اليومي — {day}', { day: fmtDay(on) });

/** ما أُعطي غير العلف: صرف المخزن بكميته، والمسجَّل بلا مخزن بجرعته (اللقاح المؤشَّر بصرفه مع لقاحه لا هنا، كالتقويم). */
function givenTexts(flock: DayFlock): string[] {
  const out = flock.issues.filter((issue) => issue.costKind !== 'feed').map((issue) => t('halls.day.issue', '{name} {qty}', { name: issue.name, qty: qtyText(issue.qty, issue.baseUnit) }));
  for (const log of flock.logs) out.push(log.dose ? t('halls.day.log_dose', '{name} ({dose})', { name: log.name, dose: log.dose }) : log.name);
  return out;
}

const vaccineText = (flock: DayFlock): string[] => flock.vaccines.map((vaccine) => t('halls.day.vaccine', '{name} ({state})', { name: vaccine.name, state: stateLabel(vaccine.state) }));

// ─── المشاركة نصّاً (واتساب) ──────────────────────────────────────────────────────────────────────────────────────

/** النازل بكيلوه وسطوره بلا وزن، للقاعة وللمجموع سواءً: لا «النازل 0 كغم» وحده يوم نزلت أكياس بلا وزن (مراجعة 0027 R1). */
const givenShare = (kg: Milli, unweighed: number): string =>
  unweighed > 0
    ? t('halls.day.share.given_partial', 'النازل {kg} {rest}', { kg: kgText(kg), rest: unweighedText(unweighed) })
    : t('halls.day.share.given', 'النازل {kg}', { kg: kgText(kg) });

/** الباقي في القاعة كما هو، وبعده بين قوسين وباختصار ما لم يدخله (سطور العلف بلا وزن حتى اليوم) وسبب سالبه (مراجعة 0027 R5). */
function leftShare(flock: DayFlock): string {
  const kg = kgText(flock.feedLeftKg);
  const notes: string[] = [];
  if (flock.feedGivenCumUnweighed > 0) notes.push(t('halls.day.share.left_unweighed', 'خارج الكيلو: {lines} بلا وزن', { lines: linesText(flock.feedGivenCumUnweighed) }));
  // وسبب السالب على الموزون وحده حين نزل علف بلا وزن (كجملة البطاقة، مراجعة 0027 RR27-F2a).
  if (flock.feedLeftKg < 0n) {
    notes.push(
      flock.feedGivenCumUnweighed > 0
        ? t('halls.day.share.left_negative_weighed', 'المأكول المسجّل أكثر من النازل الموزون')
        : t('halls.day.share.left_negative', 'المأكول المسجّل أكثر من النازل'),
    );
  }
  if (!notes.length) return t('halls.day.share.left', 'الباقي في القاعة {kg}', { kg });
  return t('halls.day.share.left_noted', 'الباقي في القاعة {kg} ({notes})', { kg, notes: notes.join(t('halls.day.share.notes_sep', '؛ ')) });
}

function hallLine(hall: DayHall): string {
  const flock = hall.flock;
  if (!flock) return t('halls.day.share.empty', '{hall}: فارغة.', { hall: hall.hallName });
  const parts: string[] = [];
  if (!flock.round) parts.push(t('halls.day.no_round', 'لم تُسجَّل الجولة'));
  parts.push(t('halls.day.share.live', 'الحيّ {n}', { n: flock.liveEnd }));
  if (flock.round) {
    parts.push(t('halls.day.share.dead', 'النافق {n}', { n: flock.dead === null ? dash() : fmtInt(flock.dead) }));
    parts.push(t('halls.day.share.culled', 'المستبعد {n}', { n: flock.culled === null ? dash() : fmtInt(flock.culled) }));
  }
  if (flock.mortalityCumPct !== null) parts.push(t('halls.day.share.mortality', 'النفوق التراكمي {pct}', { pct: pct(flock.mortalityCumPct) }));
  if (flock.feedEatenKg !== null) parts.push(t('halls.day.share.eaten', 'العلف المأكول {kg}', { kg: kgText(flock.feedEatenKg) }));
  parts.push(givenShare(flock.feedGivenKg, flock.feedGivenUnweighed), leftShare(flock));
  if (flock.weight) parts.push(t('halls.day.share.weight', 'الوزن {g} غرام', { g: grams(flock.weight.avgG) }));
  if (flock.eggsTotal !== null) parts.push(t('halls.day.share.eggs', 'البيض {n}', { n: flock.eggsTotal }));
  if (flock.hdep !== null) parts.push(t('halls.day.share.hdep', 'نسبة الإنتاج {pct}', { pct: pct(flock.hdep) }));
  const given = [...givenTexts(flock), ...vaccineText(flock)];
  const separator = t('list.separator', '، ');
  if (given.length) parts.push(t('halls.day.share.given_list', 'الأدوية واللقاحات وغيرها: {list}', { list: given.join(separator) }));
  if (flock.note) parts.push(t('halls.day.share.note', 'ملاحظة: {note}', { note: flock.note.replace(/\s+/gu, ' ') }));
  return t('halls.day.share.hall', '{hall} ({kind}، العمر {age}): {parts}.', { hall: hall.hallName, kind: kindLabel(flock.kind), age: daysText(flock.age), parts: parts.join(separator) });
}

function totalsLine(label: string, totals: DayTotals): string {
  const separator = t('list.separator', '، ');
  const dead = totals.dead === null ? dash() : fmtInt(totals.dead);
  const culled = totals.culled === null ? dash() : fmtInt(totals.culled);
  const missing = totals.rounds > 0 && totals.rounds < totals.flocks ? t('halls.day.share.from', ' ({from})', { from: fromHalls(totals.rounds) }) : '';
  const eaten = totals.feedEatenKg === null ? dash() : kgText(totals.feedEatenKg);
  const eatenFrom = totals.feedEatenFlocks > 0 && totals.feedEatenFlocks < totals.flocks ? t('halls.day.share.from', ' ({from})', { from: fromHalls(totals.feedEatenFlocks) }) : '';
  const parts = [
    t('halls.day.share.live', 'الحيّ {n}', { n: totals.liveEnd }),
    t('halls.day.share.dead', 'النافق {n}', { n: dead }) + missing,
    t('halls.day.share.culled', 'المستبعد {n}', { n: culled }) + missing,
    t('halls.day.share.eaten', 'العلف المأكول {kg}', { kg: eaten }) + eatenFrom,
    givenShare(totals.feedGivenKg, totals.feedGivenUnweighed),
  ];
  return t('halls.day.share.totals', '{label}: {parts}.', { label, parts: parts.join(separator) });
}

/** نصّ المشاركة: العنوان والجولات، ثمّ لكلّ حقل اسمه وسطر لكلّ قاعة ومجموعه، ثمّ مجموع الحقول إن كانت أكثر من حقل. */
export function dayShareText(data: HallsDay): { title: string; text: string } {
  const title = dayTitle(data.on);
  const lines = [title, t('halls.day.rounds', 'الجولات المسجَّلة: {rounds} من {flocks}.', { rounds: data.totals.rounds, flocks: data.totals.flocks })];
  for (const site of data.sites) {
    lines.push('', site.name, ...site.halls.map(hallLine), totalsLine(t('halls.day.total', 'المجموع'), site.totals));
  }
  if (data.sites.length > 1) lines.push('', totalsLine(t('halls.day.total_all', 'مجموع كلّ الحقول'), data.totals));
  return { title, text: lines.join('\n') };
}

/** المشاركة بنافذة الجهاز إن وُجدت، وإلّا النسخ. إلغاء المستخدم نافذة المشاركة ليس فشلاً؛ وغيره يجرّب النسخ (نمط الرصيد اليومي). */
async function shareReport(title: string, text: string): Promise<'shared' | 'cancelled' | 'copied'> {
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

// ─── الروابط من كلّ قاعة ─────────────────────────────────────────────────────────────────────────────────────────

interface HallLinks {
  report: string;
  calendar: string;
}

/** تقرير الدورة وتقويم شهر اليوم، برجوع إلى هذا التقرير (backTarget في صفحتيهما يقبله). */
function hallLinks(flock: DayFlock, on: Day, here: string): HallLinks {
  const back = new URLSearchParams({ back: here }).toString();
  return { report: `/halls/report/${flock.id}?${back}`, calendar: `/halls/calendar/${flock.id}?${new URLSearchParams({ m: on.slice(0, 7), back: here }).toString()}` };
}

const LINK = 'text-sm font-semibold text-brand-700 dark:text-brand-200';

function LinksRow({ links }: { links: HallLinks }) {
  return (
    <span className="flex flex-wrap gap-3 print:hidden">
      <Link to={links.calendar} className={LINK} data-action="day-calendar-link">
        {t('halls.day.calendar', 'التقويم')}
      </Link>
      <Link to={links.report} className={LINK} data-action="day-report-link">
        {t('halls.day.report', 'تقرير الدورة')}
      </Link>
    </span>
  );
}

// ─── البطاقات (الهاتف) ────────────────────────────────────────────────────────────────────────────────────────────

function Stat({ label, action, children }: { label: string; action: string; children: ReactNode }) {
  return (
    <div className="min-w-0" data-action={action}>
      <dt className="truncate text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

const countValue = (value: number | null): ReactNode => (value === null ? dash() : <Num>{fmtInt(value)}</Num>);
/** كيلو بوحدته («350 كغم»): جملة بوحدة عربية ترث اتّجاه الصفحة (لا Num)، والسالب معزول من fmtQty. */
const kgValue = (value: Milli | null): string => (value === null ? dash() : kgText(value));
const NOTE = 'block text-xs font-normal text-ink-muted';

/** سطور العلف بلا وزن في مجموع اليوم تحت كيلوه، كما في صفّ القاعة: لا «0 كغم» وحده يوم نزلت أكياس بلا وزن (مراجعة 0027 R1). */
const totalUnweighed = (n: number): ReactNode =>
  n > 0 ? (
    <span className={NOTE} data-action="total-unweighed">
      {unweighedText(n)}
    </span>
  ) : null;

/**
 * ما لا يحمله «الباقي في القاعة» تحت رقمه (والرقم كما هو، DECISIONS 0019): سطور العلف بلا وزن حتى اليوم خارج الكيلو، وسبب الباقي السالب، بجملتي
 * تقرير الدورة نفسيهما (مراجعة 0027 R5 وN1: في الإنتاج يُسجَّل المأكول والعلف لم يُصرف للقاعات بعد، فالباقي سالب في أكثر القاعات).
 */
function LeftNotes({ flock, className }: { flock: DayFlock; className: string }) {
  return (
    <>
      {flock.feedGivenCumUnweighed > 0 ? (
        <span className={className} data-action="remain-unweighed">
          {outsideKgText(flock.feedGivenCumUnweighed)}
        </span>
      ) : null}
      {flock.feedLeftKg < 0n ? (
        <span className={className} data-action="remain-negative">
          {leftNegativeText(flock.feedGivenCumUnweighed)}
        </span>
      ) : null}
    </>
  );
}

function GivenList({ flock }: { flock: DayFlock }) {
  const given = givenTexts(flock);
  if (!given.length && !flock.vaccines.length) return <>{dash()}</>;
  return (
    <span className="flex flex-col gap-0.5" data-action="day-given">
      {given.map((text, index) => (
        <span key={`g${index}`} data-action="day-medicine">
          {text}
        </span>
      ))}
      {flock.vaccines.map((vaccine) => (
        <span key={`${vaccine.vaccineId}|${vaccine.ageDay}`} data-action="day-vaccine" data-state={vaccine.state}>
          <VaccineName name={vaccine.name} color={vaccine.color}>
            <span className={`font-semibold ${STATE_INK[vaccine.state]}`}>{stateLabel(vaccine.state)}</span>
          </VaccineName>
        </span>
      ))}
    </span>
  );
}

function HallCard({ hall, on, here }: { hall: DayHall; on: Day; here: string }) {
  const flock = hall.flock;
  return (
    <article className="card flex flex-col gap-3 p-4" data-action="day-hall" data-hall={hall.hallId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{hall.hallName}</h3>
        {flock ? (
          <span className="text-sm text-ink-muted" data-action="day-age">
            {t('halls.day.kind_age', '{kind}، العمر {age}', { kind: kindLabel(flock.kind), age: daysText(flock.age) })}
          </span>
        ) : null}
      </div>
      {flock === null ? (
        <p className="text-sm text-ink-muted" data-action="day-empty">
          {t('halls.day.empty', 'فارغة')}
        </p>
      ) : (
        <>
          {flock.round ? null : (
            <p className="text-sm font-semibold text-warn-800 dark:text-warn-200" data-action="day-no-round">
              {t('halls.day.no_round', 'لم تُسجَّل الجولة')}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3">
            <Stat label={t('halls.day.live_end', 'الحيّ آخر اليوم')} action="stat-live">
              <Num>{fmtInt(flock.liveEnd)}</Num>
            </Stat>
            <Stat label={t('halls.day.mortality', 'النفوق التراكمي')} action="stat-mortality">
              {flock.mortalityCumPct === null ? dash() : <Num>{pct(flock.mortalityCumPct)}</Num>}
            </Stat>
            <Stat label={t('round.dead', 'النافق')} action="stat-dead">
              {countValue(flock.dead)}
            </Stat>
            <Stat label={t('round.culled', 'المستبعد')} action="stat-culled">
              {countValue(flock.culled)}
            </Stat>
            <Stat label={t('halls.day.eaten', 'العلف المأكول')} action="stat-eaten">
              {kgValue(flock.feedEatenKg)}
            </Stat>
            <Stat label={t('halls.day.given', 'العلف النازل')} action="stat-given">
              {kgText(flock.feedGivenKg)}
              {flock.feedGivenUnweighed > 0 ? <span className={NOTE}>{unweighedText(flock.feedGivenUnweighed)}</span> : null}
            </Stat>
            <Stat label={t('halls.day.left', 'الباقي في القاعة')} action="stat-left">
              {kgText(flock.feedLeftKg)}
              <LeftNotes flock={flock} className={NOTE} />
            </Stat>
            <Stat label={t('halls.day.weight', 'الوزن (غرام)')} action="stat-weight">
              {flock.weight ? <Num>{grams(flock.weight.avgG)}</Num> : dash()}
              {!flock.weight && flock.lastWeight ? (
                <span className="block text-xs font-normal text-ink-muted">{t('halls.day.last_weight', 'آخر وزن {g} يوم {day}', { g: grams(flock.lastWeight.avgG), day: fmtDay(flock.lastWeight.onDate) })}</span>
              ) : null}
            </Stat>
            {flock.kind === 'layer' ? (
              <>
                <Stat label={t('halls.day.eggs', 'البيض')} action="stat-eggs">
                  {countValue(flock.eggsTotal)}
                </Stat>
                <Stat label={t('halls.day.hdep', 'نسبة الإنتاج')} action="stat-hdep">
                  {flock.hdep === null ? dash() : <Num>{pct(flock.hdep)}</Num>}
                </Stat>
              </>
            ) : null}
          </dl>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-muted">{t('halls.day.given_list', 'الأدوية واللقاحات وغيرها')}</span>
            <GivenList flock={flock} />
          </div>
          {flock.note ? (
            <p className="text-sm" data-action="day-note">
              {t('halls.day.note', 'ملاحظة: {note}', { note: flock.note })}
            </p>
          ) : null}
          {flock.closedOn !== null ? (
            <p className="text-sm text-ink-muted" data-action="day-closed">
              {t('halls.day.closed', 'أُغلقت الدورة يوم {day}.', { day: fmtDay(flock.closedOn) })}
            </p>
          ) : null}
          <LinksRow links={hallLinks(flock, on, here)} />
        </>
      )}
    </article>
  );
}

function TotalsCard({ title, totals, action }: { title: string; totals: DayTotals; action: string }) {
  const missing = totals.rounds > 0 && totals.rounds < totals.flocks;
  const eatenMissing = totals.feedEatenFlocks > 0 && totals.feedEatenFlocks < totals.flocks;
  const from = (n: number) => <span className="block text-xs font-normal text-ink-muted">{fromHalls(n)}</span>;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label={title} data-action={action}>
      <h3 className="font-semibold">{title}</h3>
      <dl className="grid grid-cols-2 gap-3">
        <Stat label={t('halls.day.live_end', 'الحيّ آخر اليوم')} action="total-live">
          <Num>{fmtInt(totals.liveEnd)}</Num>
        </Stat>
        <Stat label={t('halls.day.rounds_short', 'الجولات المسجَّلة')} action="total-rounds">
          {t('halls.day.rounds_of', '{rounds} من {flocks}', { rounds: totals.rounds, flocks: totals.flocks })}
        </Stat>
        <Stat label={t('round.dead', 'النافق')} action="total-dead">
          {totals.dead === null ? dash() : <Num>{fmtInt(totals.dead)}</Num>}
          {missing ? from(totals.rounds) : null}
        </Stat>
        <Stat label={t('round.culled', 'المستبعد')} action="total-culled">
          {totals.culled === null ? dash() : <Num>{fmtInt(totals.culled)}</Num>}
          {missing ? from(totals.rounds) : null}
        </Stat>
        <Stat label={t('halls.day.eaten', 'العلف المأكول')} action="total-eaten">
          {totals.feedEatenKg === null ? dash() : kgText(totals.feedEatenKg)}
          {eatenMissing ? from(totals.feedEatenFlocks) : null}
        </Stat>
        <Stat label={t('halls.day.given', 'العلف النازل')} action="total-given">
          {kgText(totals.feedGivenKg)}
          {totalUnweighed(totals.feedGivenUnweighed)}
        </Stat>
      </dl>
    </section>
  );
}

// ─── الجدول (الشاشة العريضة والطباعة) ─────────────────────────────────────────────────────────────────────────────

/** خلية مجموع بعدد قاعاته حين ينقص («من قاعتين»)، و«—» حين لا شيء يُجمع. */
function totalCell(value: ReactNode | null, from: number | null) {
  if (value === null) return dash();
  return (
    <>
      {value}
      {from !== null ? (
        <span className="block text-xs font-normal text-ink-muted" data-action="total-from">
          {fromHalls(from)}
        </span>
      ) : null}
    </>
  );
}

function siteColumns(site: DaySite, on: Day, here: string): Column<DayHall>[] {
  const flocks = site.halls.flatMap((hall) => (hall.flock ? [hall.flock] : []));
  const { totals } = site;
  const eatenDecimals = decimalsOf([...flocks.map((flock) => flock.feedEatenKg), totals.feedEatenKg]);
  const givenDecimals = decimalsOf([...flocks.map((flock) => flock.feedGivenKg), totals.feedGivenKg]);
  const leftDecimals = decimalsOf(flocks.map((flock) => flock.feedLeftKg));
  const missing = totals.rounds < totals.flocks ? totals.rounds : null;
  const eatenMissing = totals.feedEatenFlocks < totals.flocks ? totals.feedEatenFlocks : null;
  const layers = flocks.some((flock) => flock.kind === 'layer');
  const of = <T,>(read: (flock: DayFlock) => T, show: (value: T) => ReactNode) => (hall: DayHall) => (hall.flock ? show(read(hall.flock)) : dash());
  const count = (value: number | null) => (value === null ? dash() : <Num>{fmtInt(value)}</Num>);
  const kg = (decimals: 0 | 1 | 2 | 3) => (value: Milli | null) => (value === null ? dash() : <Num>{fmtQtyCell(value, decimals)}</Num>);

  const columns: Column<DayHall>[] = [
    {
      key: 'hall',
      header: t('halls.day.col.hall', 'القاعة'),
      sticky: true,
      cell: (hall) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{hall.hallName}</span>
          {hall.flock === null ? (
            <span className="text-xs text-ink-muted" data-action="day-empty">
              {t('halls.day.empty', 'فارغة')}
            </span>
          ) : hall.flock.round ? null : (
            <span className="text-xs font-semibold text-warn-800 dark:text-warn-200" data-action="day-no-round">
              {t('halls.day.no_round', 'لم تُسجَّل الجولة')}
            </span>
          )}
          {hall.flock ? <LinksRow links={hallLinks(hall.flock, on, here)} /> : null}
        </span>
      ),
    },
    { key: 'age', header: t('halls.day.col.age', 'العمر (يوم)'), kind: 'number', cell: of((flock) => flock.age, (age) => <Num>{fmtInt(age)}</Num>) },
    {
      key: 'live_start',
      header: t('halls.day.col.live_start', 'الحيّ أوّل اليوم'),
      kind: 'number',
      cell: of((flock) => flock.liveStart, (n) => <Num>{fmtInt(n)}</Num>),
      total: <Num>{fmtInt(totals.liveStart)}</Num>,
    },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: of((flock) => flock.dead, count), total: totalCell(totals.dead === null ? null : <Num>{fmtInt(totals.dead)}</Num>, missing) },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: of((flock) => flock.culled, count), total: totalCell(totals.culled === null ? null : <Num>{fmtInt(totals.culled)}</Num>, missing) },
    {
      key: 'live_end',
      header: t('halls.day.col.live_end', 'الحيّ آخر اليوم'),
      kind: 'number',
      cell: of((flock) => flock.liveEnd, (n) => <Num>{fmtInt(n)}</Num>),
      total: <Num>{fmtInt(totals.liveEnd)}</Num>,
    },
    { key: 'mortality', header: t('halls.day.col.mortality', 'النفوق التراكمي'), kind: 'number', cell: of((flock) => flock.mortalityCumPct, (value) => (value === null ? dash() : <Num>{pct(value)}</Num>)) },
    {
      key: 'eaten',
      header: t('halls.day.col.eaten', 'المأكول (كغم)'),
      kind: 'number',
      cell: of((flock) => flock.feedEatenKg, kg(eatenDecimals)),
      total: totalCell(totals.feedEatenKg === null ? null : <Num>{fmtQtyCell(totals.feedEatenKg, eatenDecimals)}</Num>, eatenMissing),
    },
    {
      key: 'given',
      header: t('halls.day.col.given', 'النازل (كغم)'),
      kind: 'number',
      cell: of(
        (flock) => flock,
        (flock) => (
          <>
            <Num>{fmtQtyCell(flock.feedGivenKg, givenDecimals)}</Num>
            {flock.feedGivenUnweighed > 0 ? <span className="block text-xs text-ink-muted">{unweighedText(flock.feedGivenUnweighed)}</span> : null}
          </>
        ),
      ),
      total: (
        <>
          <Num>{fmtQtyCell(totals.feedGivenKg, givenDecimals)}</Num>
          {totalUnweighed(totals.feedGivenUnweighed)}
        </>
      ),
    },
    {
      key: 'left',
      header: t('halls.day.col.left', 'الباقي في القاعة (كغم)'),
      kind: 'number',
      cell: of(
        (flock) => flock,
        (flock) => (
          <>
            <Num>{fmtQtyCell(flock.feedLeftKg, leftDecimals)}</Num>
            <LeftNotes flock={flock} className="block text-xs text-ink-muted" />
          </>
        ),
      ),
    },
    {
      key: 'weight',
      header: t('halls.day.weight', 'الوزن (غرام)'),
      kind: 'number',
      cell: of(
        (flock) => flock,
        (flock) =>
          flock.weight ? (
            <Num>{grams(flock.weight.avgG)}</Num>
          ) : flock.lastWeight ? (
            <span className="text-xs text-ink-muted">{t('halls.day.last_weight', 'آخر وزن {g} يوم {day}', { g: grams(flock.lastWeight.avgG), day: fmtDay(flock.lastWeight.onDate) })}</span>
          ) : (
            dash()
          ),
      ),
    },
  ];
  if (layers) {
    columns.push(
      { key: 'eggs', header: t('halls.day.eggs', 'البيض'), kind: 'number', cell: of((flock) => flock.eggsTotal, count) },
      { key: 'hdep', header: t('halls.day.hdep', 'نسبة الإنتاج'), kind: 'number', cell: of((flock) => flock.hdep, (value) => (value === null ? dash() : <Num>{pct(value)}</Num>)) },
    );
  }
  columns.push(
    { key: 'given_list', header: t('halls.day.given_list', 'الأدوية واللقاحات وغيرها'), wrap: true, cell: (hall) => (hall.flock ? <GivenList flock={hall.flock} /> : dash()) },
    { key: 'note', header: t('halls.day.col.note', 'الملاحظة'), wrap: true, cell: (hall) => hall.flock?.note ?? dash() },
  );
  return columns;
}

/** مجموع كلّ الحقول بصفّ واحد (حين أكثر من حقل). */
function allColumns(totals: DayTotals): Column<DayTotals>[] {
  const eatenDecimals = decimalsOf([totals.feedEatenKg]);
  const givenDecimals = decimalsOf([totals.feedGivenKg]);
  const missing = totals.rounds < totals.flocks ? totals.rounds : null;
  return [
    { key: 'halls', header: t('halls.day.col.halls', 'القاعات'), kind: 'number', cell: (row) => <Num>{fmtInt(row.halls)}</Num> },
    { key: 'flocks', header: t('halls.day.col.flocks', 'الأفواج'), kind: 'number', cell: (row) => <Num>{fmtInt(row.flocks)}</Num> },
    { key: 'rounds', header: t('halls.day.rounds_short', 'الجولات المسجَّلة'), kind: 'number', cell: (row) => <Num>{fmtInt(row.rounds)}</Num> },
    { key: 'live_start', header: t('halls.day.col.live_start', 'الحيّ أوّل اليوم'), kind: 'number', cell: (row) => <Num>{fmtInt(row.liveStart)}</Num> },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (row) => totalCell(row.dead === null ? null : <Num>{fmtInt(row.dead)}</Num>, missing) },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (row) => totalCell(row.culled === null ? null : <Num>{fmtInt(row.culled)}</Num>, missing) },
    { key: 'live_end', header: t('halls.day.col.live_end', 'الحيّ آخر اليوم'), kind: 'number', cell: (row) => <Num>{fmtInt(row.liveEnd)}</Num> },
    {
      key: 'eaten',
      header: t('halls.day.col.eaten', 'المأكول (كغم)'),
      kind: 'number',
      cell: (row) => totalCell(row.feedEatenKg === null ? null : <Num>{fmtQtyCell(row.feedEatenKg, eatenDecimals)}</Num>, row.feedEatenFlocks < row.flocks ? row.feedEatenFlocks : null),
    },
    {
      key: 'given',
      header: t('halls.day.col.given', 'النازل (كغم)'),
      kind: 'number',
      cell: (row) => (
        <>
          <Num>{fmtQtyCell(row.feedGivenKg, givenDecimals)}</Num>
          {totalUnweighed(row.feedGivenUnweighed)}
        </>
      ),
    },
  ];
}

function DayReport({ data, here }: { data: HallsDay; here: string }) {
  if (!data.sites.length) {
    return <Notice tone="info" title={t('halls.day.no_halls', 'لا قاعات في نطاقك.')} />;
  }
  const totalLabel = t('halls.day.total', 'المجموع');
  return (
    <div className="flex flex-col gap-6" data-action="day-report">
      {data.sites.map((site) => (
        <section key={site.id} className="flex flex-col gap-3" aria-label={site.name} data-action="day-site" data-site={site.id}>
          <h2 className="text-lg font-semibold">{site.name}</h2>
          <div className="flex flex-col gap-3" data-action="day-cards">
            {site.halls.map((hall) => (
              <HallCard key={hall.hallId} hall={hall} on={data.on} here={here} />
            ))}
            <TotalsCard title={t('halls.day.site_total', 'مجموع {site}', { site: site.name })} totals={site.totals} action="day-site-total" />
          </div>
          <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible" data-action="day-table">
            <DataTable
              caption={t('halls.day.table', '{site} — {day}', { site: site.name, day: fmtDay(data.on) })}
              columns={siteColumns(site, data.on, here)}
              rows={site.halls}
              rowKey={(hall) => hall.hallId}
              empty={t('halls.day.no_halls', 'لا قاعات في نطاقك.')}
              totalLabel={totalLabel}
            />
          </div>
        </section>
      ))}
      {data.sites.length > 1 ? (
        <section className="flex flex-col gap-3" aria-label={t('halls.day.total_all', 'مجموع كلّ الحقول')} data-action="day-all">
          <h2 className="text-lg font-semibold">{t('halls.day.total_all', 'مجموع كلّ الحقول')}</h2>
          <div data-action="day-cards">
            <TotalsCard title={t('halls.day.total_all', 'مجموع كلّ الحقول')} totals={data.totals} action="day-all-total" />
          </div>
          <div data-action="day-table">
            <DataTable caption={t('halls.day.total_all', 'مجموع كلّ الحقول')} columns={allColumns(data.totals)} rows={[data.totals]} rowKey={() => 'all'} empty={dash()} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ─── اختيار اليوم ───────────────────────────────────────────────────────────────────────────────────────────────

/** النقر على التاريخ: يوم بالكتابة (يوم/شهر/سنة)، لا بعد اليوم (نمط الرصيد اليومي). */
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
      title={t('halls.day.pick.title', 'اعرض تقرير يوم آخر')}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} data-action="day-pick-show">
            {t('halls.day.pick.show', 'اعرض')}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field id={`${id}-day`} label={t('halls.day.pick.label', 'اليوم')} error={error} hint={t('day.hint', 'يوم/شهر/سنة.')}>
          <input
            id={`${id}-day`}
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')}
            className="input tabular-nums"
            value={text}
            onChange={(event) => setText(event.target.value)}
            data-action="day-pick-input"
          />
        </Field>
      </form>
    </Dialog>
  );
}

// ─── الصفحة ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** ما قرأته الصفحة: التقرير، ويوم الجهاز الذي رفضه الخادم حين يكون التقرير الخطوة الهادئة إلى اليوم قبله (وإلّا null). */
interface DayRead {
  report: HallsDay;
  refused: Day | null;
}

const isFutureDay = (error: unknown): boolean => error instanceof RejectedError && error.code === 'future_day';

/** يوم صريح (?on=) كما هو: رفضه يُعرض بجملته وطريقه (D7). */
const readDay = async (day: Day): Promise<DayRead> => ({ report: await loadHallsDay(day), refused: null });

/**
 * الصفحة تتبع اليوم (بلا ?on=): يوم الجهاز؛ وحين يرفضه الخادم يوماً لم يأتِ بعد (ساعة الجهاز أمام بغداد، مراجعة 0027 RR27-F4a وV2-G1-STALE-CAP) خطوة
 * واحدة بهدوء إلى اليوم قبله، وهو التقرير المعروض بلا نداء إن كان ذلك اليوم. ورفض الخطوة نفسها (الجهاز أمام بيوم أو أكثر) يُرمى كما هو فيُعرض بطريقه:
 * لا خطوة بعدها. والقراءة التي سبقتها قراءة أحدث تقف قبل خطوتها.
 */
async function followDay(day: Day, onScreen: () => HallsDay | null, superseded: () => boolean): Promise<DayRead> {
  try {
    return await readDay(day);
  } catch (error) {
    if (!isFutureDay(error) || superseded()) throw error;
  }
  const before = addDays(day, -1);
  const shown = onScreen();
  return { report: shown !== null && shown.on === before ? shown : await loadHallsDay(before), refused: day };
}

export default function DailyPage() {
  const [search, setSearch] = useSearchParams();
  const session = useSession();
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  // بلا ?on= تتبع الصفحة اليوم: يوم الجهاز، وهو يُقرأ من جديد كلّما عادت ظاهرةً أو عاد التركيز إلى النافذة (مراجعة 0027 R2)، فصفحة بقيت مفتوحة بعد منتصف
  // الليل تطلب اليوم الجديد؛ وبـ?on= تبقى على يومها، ورفضه بجملته وطريقه (D7).
  const [deviceDay, setDeviceDay] = useState(localDay);
  const asked = dayOf(search.get('on'));
  const following = asked === null;
  // يوم الجهاز الذي رفضه الخادم والصفحة تتبع اليوم (فعرضت اليوم قبله): ما دام بعد يوم الخادم في آخر جواب فحدّ «اليوم التالي» و«اليوم» والمنتقي يومُ
  // الخادم ذاك، ويُنسى حين يحمل جوابٌ يوماً للخادم يبلغه.
  const [refusedDay, setRefusedDay] = useState<Day | null>(null);
  // سؤال الخادم من جديد عن يوم الجهاز والصفحة تتبع اليوم: n في مفتاح القراءة، وopen ما دامت لا قراءة في الطريق، فحدثا العودة الواحدة (الظهور
  // والتركيز) يشتركان في سؤال واحد أيّاً كان ما رُسم بينهما، ولا سؤال فوق قراءة جارية. لا حلقة ولا مؤقّت.
  const [asks, setAsks] = useState({ n: 0, open: false });
  // خارج الرسم: التقرير على الشاشة (للخطوة الهادئة بلا نداء، ولشرط السؤال عند العودة)، وعدد القراءات (القراءة التي سبقتها أحدث تقف قبل خطوتها).
  const onScreen = useRef<HallsDay | null>(null);
  const reads = useRef(0);
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      const now = localDay();
      setDeviceDay((before) => (now > before ? now : before));
      // تتبع اليوم ويوم الجهاز بعد يوم الخادم في التقرير المعروض (أو لا تقرير بعد): تسأل عن يوم الجهاز مرّة، بخطوتها الهادئة.
      const report = onScreen.current;
      if (following && (report === null || now > report.today)) setAsks((ask) => (ask.open ? { n: ask.n + 1, open: false } : ask));
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [following]);
  /** ما تسأل عنه الصفحة: اليوم الصريح، أو يوم الجهاز وهي تتبع اليوم. */
  const target = asked ?? deviceDay;
  const backParam = search.get('back');
  const back = reportsBack(backParam, '/reports');
  const load = useCallback(() => {
    reads.current += 1;
    const mine = reads.current;
    return following ? followDay(target, () => onScreen.current, () => reads.current !== mine) : readDay(target);
  }, [following, target]);
  const state = useLoad(load, following ? `${target}|${asks.n}` : target);
  if (asks.open === state.loading) setAsks({ n: asks.n, open: !state.loading });
  const read = state.data;
  // آخر قراءة ناجحة (لأيّ يوم): تبقى معروضة بتاريخها أثناء قراءة يوم آخر وحين تفشل.
  const [kept, setKept] = useState<HallsDay | null>(null);
  if (read !== null && kept !== read.report) setKept(read.report);
  useEffect(() => {
    onScreen.current = kept;
  }, [kept]);
  // والصفحة تتبع اليوم لا يصلها رفضُ يوم الجهاز (تأخذه خطوته الهادئة)، فرفضُها (future_day) رفضُ الخطوة نفسها: يُعرض بطريقه كما في D7، ويُحفظ يوم الجهاز.
  const stepRefused = following && isFutureDay(state.error);
  let refused = refusedDay;
  if (read !== null && read.refused !== null) refused = read.refused;
  else if (stepRefused) refused = deviceDay;
  if (refused !== null && read !== null && read.report.today >= refused) refused = null;
  if (refused !== refusedDay) setRefusedDay(refused);
  const step = addDays(deviceDay, -1);
  // اليوم الذي تقف عليه الصفحة: اليوم الصريح؛ وهي تتبع اليوم يومُ قراءتها (يوم الجهاز أو الخطوة قبله)، والخطوةُ حين رُفضت هي أيضاً وأثناء السؤال من جديد
  // عن يوم جهاز رفضه الخادم، ويومُ الجهاز غير ذلك (أثناء قراءته، وحين تفشل لغير future_day: «تعذّر» والمعروض آخر ما قُرئ كما كان).
  const viewDay = asked ?? (read !== null ? read.report.on : stepRefused || (state.loading && refused === deviceDay) ? step : deviceDay);
  const shown = read?.report ?? kept;
  const current = shown !== null && shown.on === viewDay;
  // حدّ «اليوم التالي» و«اليوم» والمنتقي: يوم الخادم في آخر جواب ما دام قبل يوم الجهاز الذي رفضه (وبلا جواب بعدُ اليومُ قبل المرفوض)، وإلّا الأبعد من يوم
  // الخادم في آخر جواب ويوم الجهاز، فلا يحبس جوابُ الأمس الصفحةَ فيه بعد منتصف الليل (مراجعة 0027 R2).
  const serverToday = shown?.today ?? null;
  const known = serverToday ?? deviceDay;
  const today = refused !== null && (serverToday === null || refused > serverToday) ? (serverToday ?? addDays(refused, -1)) : known > deviceDay ? known : deviceDay;
  // «اليوم السابق» مقفول حين قال الخادم لهذا اليوم إنّ لا فوج قبله (prev).
  const prevOff = shown !== null && shown.on === viewDay && !shown.prev;
  const [picking, setPicking] = useState(false);

  /**
   * يوم الجهاز بلا ?on= (الرابط يبقى «اليوم»)، وغيره صريحاً؛ والرجوع (?back=) يبقى. ويوم الجهاز والصفحة تتبع اليوم سؤالٌ للخادم من جديد، لا رابط لا
   * يتغيّر: بعد خطوة هادئة تجاوزها الخادم بين نداءيها يصل «اليوم التالي» و«اليوم» إلى يومه.
   */
  const go = (day: Day) => {
    setPicking(false);
    if (following && day === deviceDay) {
      setAsks((ask) => ({ n: ask.n + 1, open: false }));
      return;
    }
    const params = new URLSearchParams(search);
    if (day === deviceDay) params.delete('on');
    else params.set('on', day);
    setSearch(params);
  };
  const hereParams = new URLSearchParams({ on: shown?.on ?? viewDay });
  if (backParam !== null && back === backParam) hereParams.set('back', backParam);
  const here = `/halls/day?${hereParams.toString()}`;
  const title = dayTitle(shown?.on ?? viewDay);

  const share = async () => {
    if (!shown || !current) return;
    const { title: shareTitle, text } = dayShareText(shown);
    try {
      if ((await shareReport(shareTitle, text)) === 'copied') toast({ tone: 'success', title: t('halls.day.share.copied', 'نُسخ التقرير: الصقه في واتساب أو في أيّ رسالة.') });
    } catch {
      toast({ tone: 'danger', title: t('halls.day.share.failed', 'تعذّرت المشاركة والنسخ على هذا الجهاز. اطبع التقرير أو احفظه PDF بدلاً من ذلك.') });
    }
  };

  const failure = state.error;
  const refusal = failure instanceof RejectedError && failure.hint ? failure : null;
  // رفض اليوم القادم: يوم أبعد من يوم الجهاز يعود إليه، وغيره (يوم الجهاز بـ?on= صريح، أو الخطوة الهادئة نفسها والجهاز أمام بيوم أو أكثر) يعود يوماً.
  const way = refusal?.code === 'future_day' ? (viewDay > deviceDay ? { label: t('halls.day.today', 'اليوم'), day: deviceDay } : { label: t('halls.day.prev', 'اليوم السابق'), day: addDays(viewDay, -1) }) : null;

  return (
    <div className="flex flex-col gap-5" data-action="daily-page">
      <style>{PAGE_STYLE}</style>
      <BackLink to={back} label={backLabel(back)} />
      <header className="flex flex-col gap-1">
        {orgName ? (
          <p className="hidden text-sm text-ink-muted print:block" data-action="day-org">
            {orgName}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold" data-action="day-title">
          {title}
        </h1>
        {shown ? (
          <p className="text-ink-muted" data-action="day-rounds">
            {t('halls.day.rounds', 'الجولات المسجَّلة: {rounds} من {flocks}.', { rounds: shown.totals.rounds, flocks: shown.totals.flocks })}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 print:hidden" data-action="day-controls">
        <div className="flex flex-wrap items-center gap-2" data-action="day-bar">
          <Button size="sm" variant="secondary" disabled={prevOff} onClick={() => go(addDays(viewDay, -1))} data-action="day-prev">
            {t('halls.day.prev', 'اليوم السابق')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)} aria-label={t('halls.day.pick', 'اختر يوماً آخر (المطلوب {day})', { day: fmtDay(viewDay) })} data-action="day-pick">
            {fmtDay(viewDay)}
          </Button>
          <Button size="sm" variant="secondary" disabled={viewDay >= today} onClick={() => go(addDays(viewDay, 1))} data-action="day-next">
            {t('halls.day.next', 'اليوم التالي')}
          </Button>
          {viewDay !== today ? (
            <Button size="sm" variant="ghost" onClick={() => go(today)} data-action="day-today">
              {t('halls.day.today', 'اليوم')}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={!current} onClick={() => printAs(title)} data-action="print-day">
            {t('halls.day.print', 'اطبع أو احفظ PDF')}
          </Button>
          <Button size="sm" variant="secondary" disabled={!current} onClick={() => void share()} data-action="share-day">
            {t('halls.day.share', 'شارك')}
          </Button>
        </div>
      </div>

      {refusal ? (
        <Notice
          tone="warning"
          title={refusal.hint ?? ''}
          action={
            way ? (
              <Button size="sm" variant="secondary" onClick={() => go(way.day)} data-action="day-refusal-way">
                {way.label}
              </Button>
            ) : null
          }
        />
      ) : failure ? (
        <LoadFailed what={t('halls.day.what', 'تقرير يوم {day}', { day: fmtDay(target) })} error={failure} onRetry={state.retry} />
      ) : null}
      {shown && !current ? (
        <p role="status" className="text-sm text-ink-muted print:hidden" data-action="day-stale">
          {state.loading
            ? t('halls.day.reading', 'جارٍ قراءة تقرير يوم {day}… المعروض تقرير يوم {shown}.', { day: fmtDay(viewDay), shown: fmtDay(shown.on) })
            : t('halls.day.kept', 'المعروض تقرير يوم {shown}، آخر ما قُرئ بنجاح.', { shown: fmtDay(shown.on) })}
        </p>
      ) : null}
      {shown ? (
        <DayReport data={shown} here={here} />
      ) : !failure ? (
        <p role="status" className="text-sm text-ink-muted" data-action="day-loading">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : null}
      {picking ? <PickDayDialog today={today} current={viewDay} onClose={() => setPicking(false)} onPick={go} /> : null}
    </div>
  );
}
