import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
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
import { countForm, fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadHallsDay, loadHallsHistory, type DayCountDiff, type DayFlock, type DayHall, type DaySite, type DayTotals, type HallsDay, type HallsHistory, type HallsNote } from '../../lib/repo/hallReports';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { BackLink, backLabel, dash, daysText, decimalsOf, grams, kgText, kindLabel, linesText, pct, printAs, qtyText, reportsBack, stateLabel, unweighedText } from './parts';
import { HallsNoteDialog, HistorySections, monthStartOf, NoteBlock } from './dailyHistory';
import { downloadFile, imageName, reportImage, sendFile } from './reportImage';
import { signedCount } from './ticketParts';

// تقرير القاعات اليومي (0027، كلمة المالك 2026-11-12: «تقارير القاعات الي تطلعلي بشكل يومي»، docs/HALLS_REPORTS_PLAN.md): /halls/day?on=YYYY-MM-DD
// بقراءة halls_day واحدة لكلّ القاعات في نطاق القارئ مجمَّعة بالحقل. اليوم في الرابط، وبلاه تتبع الصفحة «اليوم» بيوم الخادم (halls_day(null)، لا ساعة
// الجهاز)؛ والسهمان («اليوم السابق» و«اليوم التالي» المقفول عند يوم الخادم) والمنتقي يطلب كلٌّ منها يومه صريحاً، و«اليوم» وحده يعيدها تتبع اليوم، بنمط
// الرصيد اليومي، والأزرار نصّاً كأزرار التقويم: أيقونة من خارج حزمة القاعات تفصل حزمة محفوظة جديدة.
// بالهاتف بطاقة لكلّ قاعة بأرقامها المهمّة و«لم تُسجَّل الجولة» أو «فارغة»؛ وبالشاشة العريضة وفي الطباعة (A4 بالعرض) جدول لكلّ حقل بصفّ مجاميع
// الخادم («من N قاعة» حين تنقص الجولات)، والتبديل بـ<style> الصفحة بلا أصناف جديدة. والقيمة الغائبة «—» لا صفر. والقراءة الأخيرة الناجحة تبقى
// معروضة بتاريخها حين تُقرأ التالية أو تفشل (و«أعد المحاولة»)، والطباعة والمشاركة لليوم المطلوب وحده. ومن كلّ قاعة رابطا تقويمها (شهر اليوم)
// وتقرير دورتها، برجوع إلى هذا اليوم. بلا مال.
// و«منذ أن بدأنا» (عقد 0031، كلمة المالك 2026-11-17): بعد أقسام اليوم قسمٌ لكلّ نوع من halls_history بشهر يوم التقرير المعروض (يومٌ قاله الخادم، لا ساعة
// الجهاز)، يُقرأ بعد كلّ تقرير يومٍ يصل فيطابق اليومَ المعروض؛ ثمّ «ملاحظة يوم …» للمالك والمدير. و«أرسل صورة» يصوّر الصفحة بتخطيط الطباعة بعرض ثابت
// (reportImage)، و«اطبع» كما كان، و«شارك نصّاً» ثانويّ.

const PAGE_STYLE = [
  '@page { size: A4 landscape; margin: 10mm; }',
  '@media print {',
  '[data-action="daily-page"] table { font-size: 10px; }',
  '[data-action="daily-page"] th, [data-action="daily-page"] td { padding: 2px 4px; white-space: normal; min-width: 0; }',
  '[data-action="daily-page"] td bdi { white-space: nowrap; }',
  '[data-action="daily-page"] tfoot { display: table-row-group; }',
  '[data-action="daily-page"] tr { break-inside: avoid; }',
  '[data-action="vac-swatch"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '[data-action="hist-kind"] h2, [data-action="hist-kind"] h3, [data-action="hist-note"] h2 { break-after: avoid; }',
  '[data-action="hist-event-day"] { break-inside: avoid; }',
  '}',
  // الصورة (reportImage): نسخة الصفحة بـdata-capture خارج الشاشة بتخطيط الطباعة، بخطّ جداول أكبر قليلاً (تُقرأ على الهاتف بتكبيرها).
  '[data-capture] { padding: 16px; }',
  '[data-capture] [class~="print:hidden"] { display: none !important; }',
  '[data-capture] [data-action="day-org"] { display: block !important; }',
  '[data-capture] [data-action="day-report"] > div, [data-capture] [data-action="hist-table"] > div { max-height: none; overflow: visible; }',
  '[data-capture] table { font-size: 11px; }',
  '[data-capture] th, [data-capture] td { padding: 2px 4px; white-space: normal; min-width: 0; position: static; }',
  '[data-capture] td bdi { white-space: nowrap; }',
].join(' ');

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

/**
 * الباقي في القاعة كما هو بتعريفه الواحد (مراجعة 0028 O2/M5: left_in_hall_kg)، وبعده بين قوسين وباختصار ما لم يدخله (سطوره بلا كتلة حتى اليوم) وسبب
 * سالبه (مراجعة 0027 R5).
 */
function leftShare(flock: DayFlock): string {
  const kg = kgText(flock.leftInHallKg);
  const notes: string[] = [];
  if (flock.leftInHallUnweighed > 0) notes.push(t('halls.day.share.left_unweighed', 'خارج الكيلو: {lines} بلا وزن', { lines: linesText(flock.leftInHallUnweighed) }));
  // وسبب السالب على الموزون وحده حين نزل علف بلا وزن (كجملة البطاقة، مراجعة 0027 RR27-F2a).
  if (flock.leftInHallKg < 0n) {
    notes.push(
      flock.leftInHallUnweighed > 0
        ? t('halls.day.share.left_negative_weighed', 'المأكول المسجّل أكثر من النازل الموزون')
        : t('halls.day.share.left_negative', 'المأكول المسجّل أكثر من النازل'),
    );
  }
  if (!notes.length) return t('halls.day.share.left', 'الباقي في القاعة {kg}', { kg });
  return t('halls.day.share.left_noted', 'الباقي في القاعة {kg} ({notes})', { kg, notes: notes.join(t('halls.day.share.notes_sep', '؛ ')) });
}

/** سبب فرق عدّ: كما كُتب، و«عند الإغلاق: …» لما كُتب مع الإغلاق (= −الحيّ). */
const diffReason = (diff: DayCountDiff): string => (diff.source === 'close' ? t('halls.day.count_at_close', 'عند الإغلاق: {reason}', { reason: diff.reason }) : diff.reason);

/**
 * فرق العدّ يومها بأسبابه (مراجعة 0028 O3: count_diffs، وحده لا مع النافق): «فرق العدّ −10 (طيور مسروقة)»، وبأكثر من فرقٍ كلٌّ بعدده وسببه؛ وخادم قبله
 * بالمجموع وحده. null حين لا فرق.
 */
function countText(flock: DayFlock): string | null {
  const diffs = flock.countDiffs;
  if (!flock.countDiff && !diffs.length) return null;
  const n = signedCount(flock.countDiff ?? 0);
  if (!diffs.length) return t('halls.day.count_diff', 'فرق العدّ {n}', { n });
  const reasons =
    diffs.length === 1 && diffs[0]
      ? diffReason(diffs[0])
      : diffs.map((diff) => t('halls.day.count_each', '{n} {reason}', { n: signedCount(diff.birds), reason: diffReason(diff) })).join(t('halls.day.share.notes_sep', '؛ '));
  return t('halls.day.count_diff_why', 'فرق العدّ {n} ({reasons})', { n, reasons });
}

/** البيع يومها (0028): المباع من الفواتير، وطيور تذاكر بلا فاتورة، وفرق العدّ بأسبابه؛ لا شيء حين لا شيء أو من خادم قبل 0028. */
function saleTexts(flock: DayFlock): string[] {
  const out: string[] = [];
  if (flock.sold) out.push(t('halls.day.sold', 'المباع {n}', { n: flock.sold }));
  if (flock.ticketed) out.push(t('halls.day.ticketed', 'على تذاكر بلا فاتورة {n}', { n: flock.ticketed }));
  const count = countText(flock);
  if (count !== null) out.push(count);
  return out;
}

/** يومٌ بدأ بطيور حيّة ولا جولة له (مراجعة 0028 O7: الفوج الذي بيع كلّه قبله لا ينتظر جولة). */
const roundMissing = (flock: DayFlock): boolean => !flock.round && flock.expectsRound;

/** العلف المنقول المعلَّق على قاعة فارغة (0028): «200 كغم «علف نامي» من دورة أُغلقت يوم …». */
const carryTexts = (hall: DayHall): string[] => hall.carry.map((line) => t('halls.day.carry_line', '{qty} «{item}» من دورة أُغلقت يوم {day}', { qty: qtyText(line.qty, line.baseUnit), item: line.name, day: fmtDay(line.closedOn) }));

function hallLine(hall: DayHall): string {
  const flock = hall.flock;
  if (!flock) {
    const carry = carryTexts(hall);
    return carry.length
      ? t('halls.day.share.empty_carry', '{hall}: فارغة، وفيها علف منقول للدورة التالية: {list}.', { hall: hall.hallName, list: carry.join(t('list.separator', '، ')) })
      : t('halls.day.share.empty', '{hall}: فارغة.', { hall: hall.hallName });
  }
  const parts: string[] = [];
  if (roundMissing(flock)) parts.push(t('halls.day.no_round', 'لم تُسجَّل الجولة'));
  parts.push(t('halls.day.share.live', 'الحيّ {n}', { n: flock.liveEnd }));
  if (flock.round) {
    parts.push(t('halls.day.share.dead', 'النافق {n}', { n: flock.dead === null ? dash() : fmtInt(flock.dead) }));
    parts.push(t('halls.day.share.culled', 'المستبعد {n}', { n: flock.culled === null ? dash() : fmtInt(flock.culled) }));
  }
  if (flock.gas !== null) parts.push(t('halls.day.share.gas', 'الغاز {n}', { n: fmtInt(flock.gas) }));
  if (flock.mortalityCumPct !== null) parts.push(t('halls.day.share.mortality', 'النفوق التراكمي {pct}', { pct: pct(flock.mortalityCumPct) }));
  if (flock.feedEatenKg !== null) parts.push(t('halls.day.share.eaten', 'العلف المأكول {kg}', { kg: kgText(flock.feedEatenKg) }));
  parts.push(givenShare(flock.feedGivenKg, flock.feedGivenUnweighed), leftShare(flock));
  if (flock.weight) parts.push(t('halls.day.share.weight', 'الوزن {g} غرام', { g: grams(flock.weight.avgG) }));
  if (flock.eggsTotal !== null) parts.push(t('halls.day.share.eggs', 'البيض {n}', { n: flock.eggsTotal }));
  if (flock.hdep !== null) parts.push(t('halls.day.share.hdep', 'نسبة الإنتاج {pct}', { pct: pct(flock.hdep) }));
  parts.push(...saleTexts(flock));
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
  // الناقص من الأفواج التي تنتظر جولةً وعلفاً يومها (بدأ يومها بطيور حيّة، مراجعة 0028 O7)، لا من كلّ الأفواج.
  const missing = totals.rounds > 0 && totals.rounds < totals.roundsExpected ? t('halls.day.share.from', ' ({from})', { from: fromHalls(totals.rounds) }) : '';
  const eaten = totals.feedEatenKg === null ? dash() : kgText(totals.feedEatenKg);
  const eatenFrom = totals.feedEatenFlocks > 0 && totals.feedEatenFlocks < totals.roundsExpected ? t('halls.day.share.from', ' ({from})', { from: fromHalls(totals.feedEatenFlocks) }) : '';
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
  const lines = [title, t('halls.day.rounds', 'الجولات المسجَّلة: {rounds} من {flocks}.', { rounds: data.totals.rounds, flocks: data.totals.roundsExpected })];
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

// ─── الجدول الواحد (طلب المالك 2026-11-21: «تقارير مبسّطة بجداول أرقام مثل ورقته») ────────────────────────────────────────

/** اسم القاعة طريق إلى ورقتها حين فيها فوج (كلمة المالك 2026-11-16: «طريقة الدخول الها واضحة»). */
function HallName({ hall }: { hall: DayHall }) {
  if (!hall.flock) return <>{hall.hallName}</>;
  return (
    <Link to={`${hall.flock.kind === 'broiler' ? '/broiler' : '/layers'}/hall/${hall.hallId}`} className="text-brand-700 underline-offset-4 hover:underline dark:text-brand-200" data-action="day-hall-link">
      {hall.hallName}
    </Link>
  );
}

/** صفّ الجدول: قاعة بحقلها. */
type DayRow = { hall: DayHall; site: DaySite };

/** هلاكات اليوم: النافق والمستبعد القديم معاً، أو null بلا تسجيل. */
const deadOf = (dead: number | null, culled: number | null): number | null => (dead === null && culled === null ? null : (dead ?? 0) + (culled ?? 0));

/**
 * التقرير اليوميّ جدولاً واحداً لكلّ القاعات (عقد 0034/0035 S2): القاعة | العمر | الهلاكات | الغاز | العلف | الملاحظات، وصفّ مجموع الخادم. العلف المرسل
 * لذلك اليوم (يوم الصرف الذي يخصّه، B6) بالكيلو؛ والفارغ فارغ لا صفر. وبأكثر من حقل اسم الحقل تحت اسم القاعة.
 */
function DayReport({ data }: { data: HallsDay }) {
  if (!data.sites.length) {
    return <Notice tone="info" title={t('halls.day.no_halls', 'لا قاعات في نطاقك.')} />;
  }
  const rows: DayRow[] = data.sites.flatMap((site) => site.halls.map((hall) => ({ hall, site })));
  const many = data.sites.length > 1;
  const totals = data.totals;
  const feedDecimals = decimalsOf([totals.feedGivenKg, ...rows.map((row) => row.hall.flock?.feedGivenKg ?? null)]);
  const totalDead = deadOf(totals.dead, totals.culled);
  const columns: Column<DayRow>[] = [
    {
      key: 'hall',
      header: t('halls.day.col.hall', 'القاعة'),
      sticky: true,
      cell: ({ hall, site }) => (
        <span className="flex flex-col gap-0.5" data-action="day-hall" data-hall={hall.hallId}>
          <HallName hall={hall} />
          {many ? <span className="text-xs text-ink-muted">{site.name}</span> : null}
        </span>
      ),
    },
    { key: 'age', header: t('sheet.col.age', 'العمر'), kind: 'number', cell: ({ hall }) => (hall.flock ? <Num>{fmtInt(hall.flock.age)}</Num> : '') },
    {
      key: 'dead',
      header: t('sheet.col.dead', 'الهلاكات'),
      kind: 'number',
      cell: ({ hall }) => {
        const dead = hall.flock ? deadOf(hall.flock.dead, hall.flock.culled) : null;
        return dead === null ? '' : <Num>{fmtInt(dead)}</Num>;
      },
      total: totalDead === null ? dash() : <Num>{fmtInt(totalDead)}</Num>,
    },
    {
      key: 'gas',
      header: t('sheet.col.gas', 'الغاز'),
      kind: 'number',
      cell: ({ hall }) => (hall.flock?.gas === null || hall.flock?.gas === undefined ? '' : <Num>{fmtInt(hall.flock.gas)}</Num>),
      total: totals.gas === null ? dash() : <Num>{fmtInt(totals.gas)}</Num>,
    },
    {
      key: 'feed',
      header: t('sheet.col.feed', 'العلف (كغم)'),
      kind: 'number',
      cell: ({ hall }) =>
        hall.flock && (hall.flock.feedGivenKg !== 0n || hall.flock.feedGivenUnweighed > 0) ? (
          <>
            <Num>{fmtQtyCell(hall.flock.feedGivenKg, feedDecimals)}</Num>
            {hall.flock.feedGivenUnweighed > 0 ? (
              <span className="block text-xs text-ink-muted" data-action="day-unweighed">
                {unweighedText(hall.flock.feedGivenUnweighed)}
              </span>
            ) : null}
          </>
        ) : (
          ''
        ),
      total: <Num>{fmtQtyCell(totals.feedGivenKg, feedDecimals)}</Num>,
    },
    {
      key: 'note',
      header: t('sheet.col.note', 'الملاحظات'),
      wrap: true,
      cell: ({ hall }) => {
        const flock = hall.flock;
        if (!flock) {
          return (
            <span className="flex flex-col gap-0.5">
              <span className="text-ink-muted" data-action="day-empty">
                {t('halls.day.empty', 'فارغة')}
              </span>
              {hall.carry.length ? (
                <span className="text-xs" data-action="day-carry">
                  {t('halls.day.carry', 'علف منقول للدورة التالية: {list}.', { list: carryTexts(hall).join(t('list.separator', '، ')) })}
                </span>
              ) : null}
            </span>
          );
        }
        const sales = saleTexts(flock);
        return (
          <span className="flex flex-col gap-0.5">
            {flock.note ? <span data-action="day-note">{flock.note}</span> : null}
            {sales.length ? (
              <span className="text-xs" data-action="day-sales">
                {sales.join(t('list.separator', '، '))}
              </span>
            ) : null}
            {flock.closedOn !== null ? (
              <span className="text-xs text-ink-muted" data-action="day-closed">
                {t('halls.day.closed', 'أُغلقت الدورة يوم {day}.', { day: fmtDay(flock.closedOn) })}
              </span>
            ) : null}
          </span>
        );
      },
    },
  ];
  return (
    <div className="flex flex-col gap-3 print:[&>div]:max-h-none print:[&>div]:overflow-visible" data-action="day-report">
      <DataTable
        caption={t('halls.day.table_all', 'القاعات — {day}', { day: fmtDay(data.on) })}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.hall.hallId}
        empty={t('halls.day.no_halls', 'لا قاعات في نطاقك.')}
        totalLabel={t('halls.day.total', 'المجموع')}
      />
    </div>
  );
}

// ─── اختيار اليوم ───────────────────────────────────────────────────────────────────────────────────────────────

/** النقر على التاريخ: يوم بالكتابة (يوم/شهر/سنة) لا بعد حدّه today، ويُطلب صريحاً بـ?on= ولو كان حدَّه نفسه (نمط الرصيد اليومي). */
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

/** ملاحظة المالك ليوم من «منذ أن بدأنا» (ملاحظات شهره)، أو null. */
const noteOf = (data: HallsHistory | null, on: Day): HallsNote | null => data?.notes.find((note) => note.on === on) ?? null;

/**
 * مرحلة العودة إلى الصفحة: 'away' بعد إخفائها، وإلّا نوع الحدث الذي بدأ العودة الأخيرة ('both' حين وصل قرينه). والحدث من النوع الآخر قرينُ العودة الجارية ما
 * اجتمعت أربعة شروط: لم يفصلهما إخفاء، ويومُ الجهاز يومُ بدئها، ووصل خلال PARTNER_MS من بدئها بـperformance.now (رتيبة لا تتبع ساعة الجهاز)، وخلالها كذلك
 * بساعة الجهاز التي يقرأ منها localDay: فـperformance.now قد تقف ما دام الجهاز معلَّقاً والصفحة ظاهرة، فلا يصير حدثٌ بعد دقائق قريناً (مراجعة 0027 T6)؛
 * وإلّا بدأ عودةً جديدة، وكذا تكرارُ النوع نفسه (ظهورٌ بلا تركيز مساءً ثمّ نقرةٌ في النافذة صباحاً عودتان، مراجعة 0027 V4-N2). فحدثا العودة الواحدة (الظهور
 * والتركيز، بأيّ ترتيب، رُسمت الصفحة بينهما أو لا، والقراءة في الطريق أو انتهت) قراءةٌ واحدة. لا مؤقّت ولا حلقة. وترك التركيز لا يُسمع: اسم حدثه نصّاً
 * يقرؤه Tailwind صنفَ مرشّح فيولّد له CSS في حزمة الإقلاع (درس WP3 في CLAUDE.md)، والقراءة في الطريق تجمع حدثي العودة على كلّ حال.
 */
type ReturnPhase = 'away' | 'visible' | 'focus' | 'both';
/** أقصى ما بين بدء العودة وقرينها، بالملّي ثانية وبكلتا الساعتين. */
const PARTNER_MS = 2000;

/** لحظة حدثٍ من أحداث العودة: يومُ الجهاز ووقتُه من قراءة واحدة لساعته (مصدر localDay نفسه)، وperformance.now. */
function returnMoment() {
  const now = new Date();
  return { day: localDay(now), wall: now.getTime(), at: performance.now() };
}

/**
 * قاعدة العودة: تقرأ حين لا تعرض الصفحة تقريراً حاليّاً، أو تتبع اليوم ويومُ الجهاز غير يوم المعروض، أو صريحةً ويومُ الجهاز بعد يوم الخادم في المعروض.
 * day يومُ الجهاز لحظةَ العودة.
 */
function returnReads(page: { following: boolean; shown: HallsDay | null; current: boolean }, day: Day): boolean {
  return page.shown === null || !page.current || (page.following ? day !== page.shown.on : day > page.shown.today);
}

export default function DailyPage() {
  const [search, setSearch] = useSearchParams();
  const session = useSession();
  const orgName = session.status === 'ready' ? session.workspace.orgName : '';
  // ?on= صريح يبقى على يومه، ورفضُ يومٍ لم يأتِ بعدُ بجملته وطريقه (D7). وبلاه (أو بيوم غير موجود) تتبع الصفحة «اليوم»: halls_day(null) فيجيب الخادم
  // بيومه الحاليّ (0027)، فلا تختار ساعة الجهاز اليوم ولا يصل الصفحةَ التي تتبع اليوم رفضُ يومٍ لم يأتِ (مراجعة 0027 H4، ساعة الجهاز أمام بغداد). ولا يدخل
  // تتبّعَ اليوم إلّا «اليوم» وطريقه في رفض D7 (go(null)).
  const asked = dayOf(search.get('on'));
  const following = asked === null;
  const backParam = search.get('back');
  const back = reportsBack(backParam, '/reports');
  // قراءات الصفحة نفسها (مراجعة 0027 V5-N4): useLoad يحفظ نتيجةً واحدة برمزها (اليوم ورقم المحاولة)، فالعودة إلى يومٍ قبل أن يأتي جوابُ يومٍ طُلب بعده
  // (أ ← ب ← أ، بالأزرار أو بسجلّ المتصفّح) تعيد نتيجة «أ» القديمة حاليّةً وloading=false و«أ» تُقرأ من جديد؛ فلو كانت رفضاً أو فشلاً لقرأت العودةُ فوق
  // القراءة الجارية. فلا يكفي loading دليلاً على أنّه لا قراءة في الطريق: لكلّ نداءٍ من load رقمٌ يزيد، والقراءة في الطريق حتى يستقرّ آخرُ نداءٍ صدر، ولا
  // يُنهيها استقرارُ نداءٍ أقدم أُلغي. ولا يُغيَّر useLoad نفسه، فهو مستعمل في 111 موضعاً. والمرجع لا يُمسّ إلّا هنا وفي معالج العودة، لا أثناء الرسم.
  // ويومُ الجهاز الذي صدرت به آخر قراءة (day): عودةٌ والقراءة في الطريق بيومٍ غيره (منتصف ليلٍ بينهما) قد يجيبها الخادم قبل منتصف ليله، فتُؤجَّل لا تُترك
  // (deferred أدناه، مراجعة 0027 V6-G2).
  const reads = useRef<{ last: number; inFlight: boolean; day: Day | null }>({ last: 0, inFlight: false, day: null });
  const load = useCallback(() => {
    const id = reads.current.last + 1;
    reads.current = { last: id, inFlight: true, day: localDay() };
    return loadHallsDay(asked).finally(() => {
      if (reads.current.last === id) reads.current = { ...reads.current, inFlight: false };
    });
  }, [asked]);
  const state = useLoad(load, asked ?? 'today');
  // آخر قراءة ناجحة (لأيّ يوم): تبقى معروضة بتاريخها أثناء قراءة يوم آخر وحين تفشل؛ وreads عدد الأجوبة الناجحة، فكلّ جواب يومٍ يصل يقرأ «منذ أن بدأنا»
  // من جديد (أدناه) فلا يتأخّر عن اليوم المعروض.
  const [kept, setKept] = useState<{ data: HallsDay; reads: number } | null>(null);
  if (state.data !== null && kept?.data !== state.data) setKept({ data: state.data, reads: (kept?.reads ?? 0) + 1 });
  const shown = state.data ?? kept?.data ?? null;
  // يوم الخادم في آخر جواب (null قبل أيّ جواب)، واليوم الذي تقف عليه الصفحة: الصريح، أو يوم الخادم وهي تتبع اليوم.
  const today = shown?.today ?? null;
  const viewDay = asked ?? today;
  // حدّ المنتقي: يوم الخادم في آخر جواب، ويوم الجهاز قبل أيّ جواب وحده.
  const bound = today ?? localDay();
  // المعروض جوابُ المطلوب: اليوم الصريح، أو تقريرُ يوم الخادم كما قاله والصفحة تتبع اليوم؛ وفشلُ القراءة الأخيرة يُبقيه معروضاً بتاريخه لا حاليّاً (D6).
  const current = shown !== null && !state.error && (following ? shown.on === shown.today : shown.on === asked);

  // «منذ أن بدأنا» (0031): شهر يوم التقرير المعروض (null قبل أيّ تقرير، فلا قراءة)، ويُقرأ من جديد مع كلّ تقرير يومٍ يصل (رقمه في المفتاح).
  const historyMonth = shown ? monthStartOf(shown.on) : null;
  const loadHistory = useCallback(() => (historyMonth === null ? Promise.resolve(null) : loadHallsHistory(historyMonth)), [historyMonth]);
  const history = useLoad<HallsHistory | null>(loadHistory, `${historyMonth ?? ''}|${kept?.reads ?? 0}`);
  // آخر قراءة ناجحة وعدد القراءات الناجحة (نافذة الملاحظة تعرف به أنّ ما تعرضه قُرئ بعد رفضٍ طلب القراءة)؛ وتُعرض أثناء قراءة الشهر نفسه من جديد أو
  // فشلها، لا لشهر غيره.
  const [keptHistory, setKeptHistory] = useState<{ data: HallsHistory; reads: number } | null>(null);
  if (history.data !== null && keptHistory?.data !== history.data) setKeptHistory({ data: history.data, reads: (keptHistory?.reads ?? 0) + 1 });
  const historyShown = history.data ?? (keptHistory !== null && keptHistory.data.month === historyMonth ? keptHistory.data : null);
  const historyReads = keptHistory?.reads ?? 0;
  const historyFailed = !history.loading && history.error !== null;
  const historyRefusal = history.error instanceof RejectedError && history.error.hint ? history.error : null;
  const role = session.status === 'ready' ? session.workspace.role : null;
  // الملاحظة للمنشأة كلّها: لكلّ عضو فعّال (0034، كلمة المالك 2026-11-21: «الكل مثل المالك بكل شيء»)، والخادم يحكم.
  const canNote = role !== null && session.status === 'ready';
  // ما حفظته هذه الصفحة للتوّ (جواب set_halls_note): يُعرض بدل ملاحظة اليوم في آخر قراءة حتى تصل قراءة بعده (عدّاد القراءات الناجحة)، فالصورة والطباعة
  // ونافذة التعديل بعد الحفظ بالنصّ والنسخة المحفوظين لا بما قبلهما، ولو فشلت القراءة التي بعده (مراجعة 0031 M2).
  const [saved, setSaved] = useState<{ on: Day; note: HallsNote | null; reads: number } | null>(null);
  const noteFor = (data: HallsHistory | null, on: Day): HallsNote | null =>
    saved !== null && saved.on === on && saved.reads === historyReads ? saved.note : noteOf(data, on);
  // نافذة الملاحظة بلقطة ما عُرض حين فُتحت؛ وتُغلق إن صار المعروض يوماً غيره (رجوع المتصفّح).
  const [noting, setNoting] = useState<{ day: Day; shown: HallsNote | null } | null>(null);
  if (noting !== null && shown !== null && shown.on !== noting.day) setNoting(null);

  // «أرسل صورة»: الصفحة كلّها نسخةً بتخطيط الطباعة (reportImage)، والصورة الجاهزة تبقى بزرّ إن رفض المتصفّح فتح المشاركة بعد تجهيزها.
  const pageRef = useRef<HTMLDivElement>(null);
  const [imaging, setImaging] = useState(false);
  const [ready, setReady] = useState<{ on: Day; file: File; title: string } | null>(null);

  // العودة إلى الصفحة (لا قرينها) تقرأ مطلوبها من جديد مرّةً واحدة حين لا تعرض تقريراً حاليّاً: لا معروض، أو رفضٌ أو فشلٌ (صريحةً كانت أو تتبع اليوم،
  // مراجعة 0027 V4-N3)، أو تتبع اليوم ويومُ الجهاز غير يوم المعروض (منتصف ليل الجهاز أو الخادم بينهما)، أو صريحةً ويومُ الجهاز بعد يوم الخادم في المعروض
  // (فيحمل جوابٌ بعد منتصف ليل الخادم «اليوم» الجديد إلى «اليوم التالي» والمنتقي). ولا قراءة فوق قراءة في الطريق (loading، أو قراءات الصفحة نفسها في
  // reads أعلاه)، ولا شيء بعد مغادرة الصفحة (المستمعون يُزالون). وما تقرؤه العودة خارج الرسم:
  const latest = useRef({ following, shown, current, loading: state.loading, retry: state.retry });
  useEffect(() => {
    latest.current = { following, shown, current, loading: state.loading, retry: state.retry };
  });
  // عودةٌ تُركت لأنّ قراءةً في الطريق صدرت بيومٍ غير يومها (V6-G2): حين لا قراءة في الطريق تُطبَّق قاعدتها مرّةً بلحظتها هي ثمّ تُنسى (لا مؤقّت، وقراءة
  // واحدة على الأكثر لكلّ عودة). فقراءةٌ أجابها الخادم قبل منتصف ليله ووصلت بعد عودةٍ بعده لا تبقى حاليّةً.
  const deferred = useRef<ReturnType<typeof returnMoment> | null>(null);
  useEffect(() => {
    const moment = deferred.current;
    if (moment === null || state.loading || reads.current.inFlight) return;
    deferred.current = null;
    if (returnReads(latest.current, moment.day)) latest.current.retry();
  });
  useEffect(() => {
    let phase: ReturnPhase = document.visibilityState === 'hidden' ? 'away' : 'both';
    // لحظةُ بدء العودة الجارية.
    let began = returnMoment();
    const arrive = (kind: 'visible' | 'focus') => {
      const moment = returnMoment();
      const partner =
        phase === (kind === 'visible' ? 'focus' : 'visible') &&
        moment.day === began.day &&
        moment.at - began.at <= PARTNER_MS &&
        Math.abs(moment.wall - began.wall) <= PARTNER_MS;
      if (partner) {
        phase = 'both';
        return;
      }
      phase = kind;
      began = moment;
      const page = latest.current;
      if (page.loading || reads.current.inFlight) {
        if (moment.day !== reads.current.day) deferred.current = moment;
        return;
      }
      deferred.current = null;
      if (returnReads(page, moment.day)) page.retry();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') phase = 'away';
      else arrive('visible');
    };
    const onFocus = () => arrive('focus');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // «اليوم السابق» مقفول حين قال الخادم لهذا اليوم إنّ لا فوج قبله (prev)، وقبل أيّ جواب والصفحة تتبع اليوم (لا يوم يُرجع منه بعد).
  const prevOff = viewDay === null || (shown !== null && shown.on === viewDay && !shown.prev);
  // «اليوم التالي» ما دام المطلوب قبل يوم الخادم في آخر جواب، ويطلب يومه صريحاً ولو كان ذلك اليوم: قد يكون الخادم جاوز منتصف ليله بعد الجواب، فلو
  // تبعت الصفحة اليوم عنده لقفزت يوماً (مراجعة 0027 V4-N1).
  const nextOff = viewDay === null || today === null || viewDay >= today;
  const [picking, setPicking] = useState(false);

  /**
   * يومٌ صريح بـ?on= (السهمان والمنتقي وطريق «اليوم السابق»)، فلا تعرض الصفحة غير اليوم المطلوب؛ وnull وحده بلا ?on= فتتبع الصفحة اليوم («اليوم» وطريقه).
   * والرجوع (?back=) يبقى.
   */
  const go = (day: Day | null) => {
    setPicking(false);
    if (day === null && following) return;
    const params = new URLSearchParams(search);
    if (day === null) params.delete('on');
    else params.set('on', day);
    setSearch(params);
  };
  /** «اليوم السابق» و«اليوم التالي»: يوماً من اليوم الذي تقف عليه الصفحة. */
  const step = (days: number) => {
    if (viewDay !== null) go(addDays(viewDay, days));
  };
  // العنوان بيوم المعروض، وقبل أيّ جواب باليوم الصريح؛ والصفحة تتبع اليوم بلا جواب بعدُ بلا تاريخ (لا تعرف يوم الخادم).
  const title = shown ? dayTitle(shown.on) : viewDay !== null ? dayTitle(viewDay) : t('halls.day.title_today', 'تقرير القاعات اليومي');
  const dayLabel = viewDay !== null ? fmtDay(viewDay) : t('halls.day.today', 'اليوم');

  const share = async () => {
    if (!shown || !current) return;
    const { title: shareTitle, text } = dayShareText(shown);
    try {
      if ((await shareReport(shareTitle, text)) === 'copied') toast({ tone: 'success', title: t('halls.day.share.copied', 'نُسخ التقرير: الصقه في واتساب أو في أيّ رسالة.') });
    } catch {
      toast({ tone: 'danger', title: t('halls.day.share.failed', 'تعذّرت المشاركة والنسخ على هذا الجهاز. اطبع التقرير أو احفظه PDF بدلاً من ذلك.') });
    }
  };

  const deliver = async (file: File, on: Day, imageTitle: string) => {
    const outcome = await sendFile(file, imageTitle);
    setReady(outcome === 'blocked' ? { on, file, title: imageTitle } : null);
    if (outcome === 'downloaded') {
      toast({ tone: 'success', title: t('halls.day.image.downloaded', 'حُفظت الصورة «{name}» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى من تريد.', { name: file.name }) });
    }
  };
  const sendImage = async () => {
    const page = pageRef.current;
    if (!shown || !current || !page || imaging) return;
    const on = shown.on;
    setImaging(true);
    setReady(null);
    let file: File;
    try {
      file = await reportImage(page, imageName(on));
    } catch {
      setImaging(false);
      toast({ tone: 'danger', title: t('halls.day.image.failed', 'تعذّر تجهيز الصورة على هذا الجهاز. اطبع التقرير أو احفظه PDF بدلاً من ذلك.') });
      return;
    }
    setImaging(false);
    await deliver(file, on, dayTitle(on));
  };
  // الصورة الجاهزة ليوم المعروض وحده، والصورة لا تُطلب قبل أن يصل «منذ أن بدأنا» لشهره (الصورة التقرير كلّه).
  const readyNow = ready !== null && shown !== null && ready.on === shown.on ? ready : null;
  const historyReady = historyShown !== null && historyShown.month === historyMonth;

  const failure = state.error;
  const refusal = failure instanceof RejectedError && failure.hint ? failure : null;
  // رفض اليوم القادم بـ?on= صريح (D7): يوم بعد يوم الجهاز طريقه «اليوم» (تتبع الصفحة يوم الخادم)، ويوم الجهاز أو ما قبله (ساعة الجهاز أمام الخادم) يعود
  // يوماً صريحاً. والصفحة التي تتبع اليوم لا يصلها هذا الرفض.
  const way = refusal?.code === 'future_day' && asked !== null ? (asked > localDay() ? { label: t('halls.day.today', 'اليوم'), day: null } : { label: t('halls.day.prev', 'اليوم السابق'), day: addDays(asked, -1) }) : null;

  return (
    <div ref={pageRef} className="flex flex-col gap-5" data-action="daily-page">
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
            {t('halls.day.rounds', 'الجولات المسجَّلة: {rounds} من {flocks}.', { rounds: shown.totals.rounds, flocks: shown.totals.roundsExpected })}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 print:hidden" data-action="day-controls">
        <div className="flex flex-wrap items-center gap-2" data-action="day-bar">
          <Button size="sm" variant="secondary" disabled={prevOff} onClick={() => step(-1)} data-action="day-prev">
            {t('halls.day.prev', 'اليوم السابق')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)} aria-label={t('halls.day.pick', 'اختر يوماً آخر (المطلوب {day})', { day: dayLabel })} data-action="day-pick">
            {dayLabel}
          </Button>
          <Button size="sm" variant="secondary" disabled={nextOff} onClick={() => step(1)} data-action="day-next">
            {t('halls.day.next', 'اليوم التالي')}
          </Button>
          {following ? null : (
            <Button size="sm" variant="ghost" onClick={() => go(null)} data-action="day-today">
              {t('halls.day.today', 'اليوم')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!current || !historyReady || history.loading} busy={imaging} onClick={() => void sendImage()} data-action="send-image">
            {imaging ? t('halls.day.image.making', 'جارٍ تجهيز الصورة…') : t('halls.day.image', 'أرسل صورة')}
          </Button>
          <Button size="sm" variant="secondary" disabled={!current} onClick={() => printAs(title)} data-action="print-day">
            {t('halls.day.print', 'اطبع أو احفظ PDF')}
          </Button>
          <Button size="sm" variant="ghost" disabled={!current} onClick={() => void share()} data-action="share-day">
            {t('halls.day.share_text', 'شارك نصّاً')}
          </Button>
        </div>
        {readyNow ? (
          <Notice
            tone="info"
            title={t('halls.day.image.ready', 'الصورة جاهزة: اضغط «أرسلها» لتختار التطبيق ومن ترسلها إليه.')}
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void deliver(readyNow.file, readyNow.on, readyNow.title)} data-action="send-ready">
                  {t('halls.day.image.send', 'أرسلها')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    downloadFile(readyNow.file);
                    setReady(null);
                    toast({ tone: 'success', title: t('halls.day.image.downloaded', 'حُفظت الصورة «{name}» في التنزيلات على هذا الجهاز: أرسلها من هناك إلى من تريد.', { name: readyNow.file.name }) });
                  }}
                  data-action="download-ready"
                >
                  {t('halls.day.image.download', 'نزّلها')}
                </Button>
              </div>
            }
          />
        ) : null}
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
        <LoadFailed what={asked !== null ? t('halls.day.what', 'تقرير يوم {day}', { day: fmtDay(asked) }) : t('halls.day.what_today', 'تقرير اليوم')} error={failure} onRetry={state.retry} />
      ) : null}
      {shown && !current ? (
        <p role="status" className="text-sm text-ink-muted print:hidden" data-action="day-stale">
          {!state.loading
            ? t('halls.day.kept', 'المعروض تقرير يوم {shown}، آخر ما قُرئ بنجاح.', { shown: fmtDay(shown.on) })
            : asked !== null
              ? t('halls.day.reading', 'جارٍ قراءة تقرير يوم {day}… المعروض تقرير يوم {shown}.', { day: fmtDay(asked), shown: fmtDay(shown.on) })
              : t('halls.day.reading_today', 'جارٍ قراءة تقرير اليوم… المعروض تقرير يوم {shown}.', { shown: fmtDay(shown.on) })}
        </p>
      ) : null}
      {shown ? (
        <DayReport data={shown} />
      ) : !failure ? (
        <p role="status" className="text-sm text-ink-muted" data-action="day-loading">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : null}
      {shown && history.error ? (
        <div className="print:hidden" data-action="hist-failed">
          {historyRefusal ? (
            <Notice tone="warning" title={historyRefusal.hint ?? ''} />
          ) : (
            <LoadFailed what={t('halls.hist.what_load', 'ما جرى منذ أن بدأنا لشهر يوم {day}', { day: fmtDay(shown.on) })} error={history.error} onRetry={history.retry} />
          )}
        </div>
      ) : null}
      {shown && historyShown ? (
        <>
          <HistorySections history={historyShown} on={shown.on} />
          <NoteBlock
            on={shown.on}
            note={noteFor(historyShown, shown.on)}
            canWrite={canNote}
            disabled={history.loading}
            onWrite={() => setNoting({ day: shown.on, shown: noteFor(historyShown, shown.on) })}
          />
        </>
      ) : shown && !history.error ? (
        <p role="status" className="text-sm text-ink-muted print:hidden" data-action="hist-loading">
          {t('halls.hist.loading', 'جارٍ قراءة ما جرى منذ أن بدأنا…')}
        </p>
      ) : null}
      {picking ? <PickDayDialog today={bound} current={viewDay ?? bound} onClose={() => setPicking(false)} onPick={go} /> : null}
      {noting ? (
        <HallsNoteDialog
          day={noting.day}
          shown={noting.shown}
          latest={keptHistory !== null && keptHistory.data.month === monthStartOf(noting.day) ? noteFor(keptHistory.data, noting.day) : null}
          reads={historyReads}
          failed={historyFailed}
          onClose={(uncertain) => {
            setNoting(null);
            if (uncertain) history.retry();
          }}
          onReread={history.retry}
          onSaved={(result) => {
            setNoting(null);
            setSaved({ on: result.on, note: result.note, reads: historyReads });
            toast({
              tone: 'success',
              title: result.note
                ? t('halls.note.saved', 'حُفظت ملاحظة يوم {day}.', { day: fmtDay(result.on) })
                : t('halls.note.erased', 'مُسحت ملاحظة يوم {day}.', { day: fmtDay(result.on) }),
            });
            history.retry();
          }}
        />
      ) : null}
    </div>
  );
}
