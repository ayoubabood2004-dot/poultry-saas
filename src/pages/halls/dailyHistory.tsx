import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { SectionBar, SubBar } from '../../components/ui/OfficialReport';
import type { Day } from '../../domain/dates';
import type { Milli } from '../../domain/money';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { countForm, fmtCounted, fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { setHallsNote, type HallsHistory, type HallsNote, type HallsNoteResult, type HistoryDay, type HistoryEvent, type HistoryKind, type HistoryMonth } from '../../lib/repo/hallReports';
import { naturalCompare } from '../../domain/naturalOrder';
import { monthLabel, monthOf } from './months';
import { dash, daysText, decimalsOf, grams, kgText, pct, unweighedText } from './parts';
import { birdsText, signedCount } from './ticketParts';

// «منذ أن بدأنا» تحت أقسام اليوم في تقرير القاعات اليوميّ (عقد 0031، كلمة المالك 2026-11-17: «كل يوم اشوف شنو الي صار بتقرير كامل بالارقام والجداول…
// ويكون اكو المجموع اليومي والشهري من اول ما بدينا وكتابة ملاحظة تحته»)، لكلّ نوع في halls_history (اللاحم ثمّ البيّاض): سطر البداية، وجدول أيّام شهر
// يوم التقرير يوماً بيوم (يوم التقرير مميَّز بخلفيته وبكلمته)، وصفّ مجموعه سطرُ الشهر من months كما قاله الخادم (لا جمع بالشاشة)؛ وجدول الأشهر من البداية
// بصفّ «منذ البداية» من total؛ و«ما جرى»: جملةٌ من total ثمّ أحداث الشهر مجمَّعة باليوم. ثمّ «ملاحظة يوم …» يكتبها المالك والمدير (halls_note.write)
// بشرط النسخة التي رأتها النافذة حين فُتحت. والأعمدة كلّها بلا مال؛ وأعمدة البيض للبيّاض وحده.
// وبالشكل الرسميّ (عقد 0036 S1): عنوان كلّ نوع شريطٌ ملوّن (h2)، والجدولان رسميّان بشريط اسميهما («أيّام الشهر» و«الأشهر من البداية») عنوانين من المستوى
// الثالث تحته كما كانا h3 (مراجعة 0036 R3)، و«ما جرى» عنوانٌ فرعيّ.

/** حدّ ملاحظة اليوم بعد القصّ، بالحروف كما يعدّها الخادم (private.note_text بحدّ 500، العقد). */
export const HALLS_NOTE_MAX = 500;

/**
 * حروف قصّ طرفَي الملاحظة كما في private.note_text بالخادم رقماً برقم: نسخة NOTE_SPACES في الرصيد اليومي (pages/inventory/DayBalanceView، مراجعة 0022
 * R5) لا استيرادها، فاستيرادها يُدخل حزمة المخزن حزمة القاعات؛ وفحص الشاشات يثبت أنّ القائمتين واحدة.
 */
export const HALLS_NOTE_SPACES: readonly number[] = [
  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207, 8232, 8233,
  8234, 8235, 8236, 8237, 8238, 8239, 8287, 8288, 12288, 65279,
];
const NOTE_SPACE = new Set(HALLS_NOTE_SPACES);
const isNoteSpace = (char: string | undefined): boolean => char !== undefined && NOTE_SPACE.has(char.codePointAt(0) ?? -1);

/** الملاحظة مقصوصة الطرفين كما يقصّها الخادم (بالحروف لا بوحدات UTF-16). */
export function hallsNoteText(value: string): string {
  const chars = [...value];
  let start = 0;
  let end = chars.length;
  while (start < end && isNoteSpace(chars[start])) start += 1;
  while (end > start && isNoteSpace(chars[end - 1])) end -= 1;
  return chars.slice(start, end).join('');
}

// ─── صيغ العدد ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** عدد الأفواج مرفوعاً: «فوج واحد»، «فوجان»، «3 أفواج»، «11 فوجاً»، «100 فوج». */
export function flocksText(n: number): string {
  if (n === 1) return t('halls.hist.flocks.one', 'فوج واحد');
  if (n === 2) return t('halls.hist.flocks.two', 'فوجان');
  const form = countForm(n);
  if (form === 'few') return t('halls.hist.flocks.few', '{n} أفواج', { n });
  if (form === 'many') return t('halls.hist.flocks.many', '{n} فوجاً', { n });
  return t('halls.hist.flocks.hundreds', '{n} فوج', { n });
}

/** عدد الأفواج مجروراً بعد «في»: «فوج واحد»، «فوجين»، «3 أفواج»، «11 فوجاً»، «100 فوج». */
export function ofFlocksText(n: number): string {
  if (n === 1) return t('halls.hist.of_flocks.one', 'فوج واحد');
  if (n === 2) return t('halls.hist.of_flocks.two', 'فوجين');
  const form = countForm(n);
  if (form === 'few') return t('halls.hist.of_flocks.few', '{n} أفواج', { n });
  if (form === 'many') return t('halls.hist.of_flocks.many', '{n} فوجاً', { n });
  return t('halls.hist.of_flocks.hundreds', '{n} فوج', { n });
}

/** عدد القاعات مرفوعاً: «قاعة واحدة»، «قاعتان»، «3 قاعات»، «11 قاعةً»، «100 قاعة». */
export function hallsText(n: number): string {
  if (n === 1) return t('halls.hist.halls.one', 'قاعة واحدة');
  if (n === 2) return t('halls.hist.halls.two', 'قاعتان');
  const form = countForm(n);
  if (form === 'few') return t('halls.hist.halls.few', '{n} قاعات', { n });
  if (form === 'many') return t('halls.hist.halls.many', '{n} قاعةً', { n });
  return t('halls.hist.halls.hundreds', '{n} قاعة', { n });
}

/** عدد البيض بصيغ «رصيد البيض» في الرئيسية (home/plannedCards): «بيضة واحدة»، «بيضتان»، «5 بيضات»، «15 بيضة»، «4,100 بيضة». */
export const eggsText = (n: number): string =>
  fmtCounted(BigInt(n) * 1000n, t('unit.egg', 'بيضة'), { one: t('unit.egg.one', 'بيضة واحدة'), two: t('unit.egg.two', 'بيضتان'), few: t('unit.egg.few', 'بيضات'), many: t('unit.egg.many', 'بيضة') });

export const kindTitle = (kind: HistoryKind['kind']): string =>
  kind === 'broiler' ? t('halls.hist.title.broiler', 'حقول اللحم منذ أن بدأنا') : t('halls.hist.title.layer', 'حقول البيض منذ أن بدأنا');

/** أوّل يوم في شهر اليوم (YYYY-MM-01): الشهر الذي يُطلب من halls_history. */
export const monthStartOf = (on: Day): Day => `${monthOf(on)}-01`;

// ─── «ما جرى» ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * جملة «ما جرى» من total وحده: «منذ 01/11/2026: سُكّن 13,000 طير في 3 أفواج، ونفق طيران، … والحيّ الآن 22,997 طير.» بالفعل المبنيّ للمجهول قبل
 * المعدود بصيغته (birdsText وأخواتها)، وما كان صفراً لا يُذكر إلّا التسكين والحيّ الآن.
 */
export function historySentence(entry: HistoryKind): string {
  const { total } = entry;
  const parts = [t('halls.hist.s.placed', 'سُكّن {birds} في {flocks}', { birds: birdsText(total.placed), flocks: ofFlocksText(total.opened) })];
  if (total.dead > 0) parts.push(t('halls.hist.s.dead', 'ونفق {birds}', { birds: birdsText(total.dead) }));
  if (total.culled > 0) parts.push(t('halls.hist.s.culled', 'واستُبعد {birds}', { birds: birdsText(total.culled) }));
  if (total.sold > 0) parts.push(t('halls.hist.s.sold', 'وبيع {birds}', { birds: birdsText(total.sold) }));
  if (total.countDiff !== 0) parts.push(t('halls.hist.s.count_diff', 'وفرق العدّ {n}', { n: signedCount(total.countDiff) }));
  if (total.feedKg > 0n) parts.push(t('halls.hist.s.feed', 'وأُكل من العلف {kg}', { kg: kgText(total.feedKg) }));
  if (total.givenKg > 0n || total.givenUnweighed > 0) {
    const given = t('halls.hist.s.given', 'ونزل إلى القاعات من العلف {kg}', { kg: kgText(total.givenKg) });
    parts.push(total.givenUnweighed > 0 ? t('halls.hist.s.given_unweighed', '{given} {rest}', { given, rest: unweighedText(total.givenUnweighed) }) : given);
  }
  if (entry.kind === 'layer' && total.eggsTotal) {
    parts.push(
      total.hdep !== null
        ? t('halls.hist.s.eggs_hdep', 'وجُمع {eggs} بنسبة إنتاج {pct}', { eggs: eggsText(total.eggsTotal), pct: pct(total.hdep) })
        : t('halls.hist.s.eggs', 'وجُمع {eggs}', { eggs: eggsText(total.eggsTotal) }),
    );
  }
  if (total.closed > 0) parts.push(t('halls.hist.s.closed', 'وأُغلق {flocks}', { flocks: flocksText(total.closed) }));
  if (total.halls > 0) parts.push(t('halls.hist.s.halls', 'واستُعملت {halls}', { halls: hallsText(total.halls) }));
  parts.push(t('halls.hist.s.live', 'والحيّ الآن {birds}', { birds: birdsText(total.liveNow) }));
  return t('halls.hist.sentence', 'منذ {day}: {parts}.', { day: fmtDay(entry.start), parts: parts.join(t('list.separator', '، ')) });
}

/** حدثٌ بجملته: القاعة وحقلها ثمّ ما جرى. */
export function eventText(event: HistoryEvent): string {
  const where = t('halls.hist.ev.where', '{hall} ({site})', { hall: event.hall, site: event.site });
  switch (event.type) {
    case 'placed':
      return t('halls.hist.ev.placed', '{where}: سُكّن {birds}.', { where, birds: birdsText(event.birds) });
    case 'sold':
      return t('halls.hist.ev.sold', '{where}: بيع {birds} وزنها {kg}.', { where, birds: birdsText(event.birds), kg: kgText(event.kg) });
    case 'count_diff':
      return t('halls.hist.ev.count_diff', '{where}: فرق العدّ {n}.', { where, n: signedCount(event.birds) });
    case 'vaccine':
      return t('halls.hist.ev.vaccine', '{where}: أُعطي لقاح «{name}».', { where, name: event.name });
    case 'weight':
      return t('halls.hist.ev.weight', '{where}: وزن العيّنة {g} غرام.', { where, g: grams(event.avgG) });
    case 'closed':
      return t('halls.hist.ev.closed', '{where}: أُغلقت الدورة.', { where });
  }
}

/** ترتيب أنواع الأحداث في اليوم كما يرسلها الخادم (تسكين، بيع، فرق عدّ، لقاح، وزن، إغلاق). */
const EVENT_ORDER: Record<HistoryEvent['type'], number> = { placed: 1, sold: 2, count_diff: 3, vaccine: 4, weight: 5, closed: 6 };

/**
 * أحداث الشهر مجمَّعة باليوم بترتيب الخادم للأيّام، وداخل اليوم بالنوع ثمّ الحقل ثمّ القاعة بأرقامها («قاعة 5» قبل «قاعة 44» كجدول الحقل؛ الخادم يرتّب
 * الأسماء حرفاً حرفاً، مراجعة 0031 L1).
 */
export function eventsByDay(events: readonly HistoryEvent[]): { on: Day; events: HistoryEvent[] }[] {
  const out: { on: Day; events: HistoryEvent[] }[] = [];
  for (const event of events) {
    const last = out.at(-1);
    if (last && last.on === event.on) last.events.push(event);
    else out.push({ on: event.on, events: [event] });
  }
  for (const group of out) {
    group.events.sort((a, b) => EVENT_ORDER[a.type] - EVENT_ORDER[b.type] || naturalCompare(a.site, b.site) || naturalCompare(a.hall, b.hall));
  }
  return out;
}

// ─── الجدولان ──────────────────────────────────────────────────────────────────────────────────────────────────────

const NOTE = 'block text-xs text-ink-muted';
const count = (value: number | null): ReactNode => (value === null ? dash() : <Num>{fmtInt(value)}</Num>);
const kgCell = (decimals: 0 | 1 | 2 | 3) => (value: Milli | null): ReactNode => (value === null ? dash() : <Num>{fmtQtyCell(value, decimals)}</Num>);
const givenCell = (kg: Milli, unweighed: number, decimals: 0 | 1 | 2 | 3): ReactNode => (
  <>
    <Num>{fmtQtyCell(kg, decimals)}</Num>
    {unweighed > 0 ? (
      <span className={NOTE} data-action="hist-unweighed">
        {unweighedText(unweighed)}
      </span>
    ) : null}
  </>
);
const hdepCell = (value: bigint | null): ReactNode => (value === null ? dash() : <Num>{pct(value)}</Num>);
/**
 * عمود النازل في السجلّ: ما نزل من المخزن وحده، والعلف المنقول من دورة سابقة في القاعة نفسها لا يُعدّ مرّة ثانية يوم تسكين الفوج الجديد (halls_history،
 * مراجعة 0031 M1)؛ فيختلف عن «النازل» في جدول اليوم يوم النقل وحده، واسمه يقول ذلك.
 */
const GIVEN_HEADER = (): string => t('halls.hist.col.given', 'النازل من المخزن (كغم)');

/** أعمدة أيّام الشهر، وخلايا مجموعها من سطر الشهر (monthRow) لا من جمع الصفوف؛ وبلا سطر شهر بلا مجموع. */
function dayColumns(entry: HistoryKind, monthRow: HistoryMonth | null, on: Day): Column<HistoryDay>[] {
  const feedDecimals = decimalsOf([...entry.days.map((row) => row.feedKg), monthRow?.feedKg ?? null]);
  const givenDecimals = decimalsOf([...entry.days.map((row) => row.givenKg), monthRow?.givenKg ?? null]);
  const total = (show: (row: HistoryMonth) => ReactNode): ReactNode => (monthRow ? show(monthRow) : undefined);
  const columns: Column<HistoryDay>[] = [
    {
      key: 'on',
      header: t('halls.hist.col.date', 'التاريخ'),
      sticky: true,
      cell: (row) => (
        <span className="flex flex-col gap-0.5">
          <Num>{fmtDay(row.on)}</Num>
          {row.on === on ? (
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-200" data-action="hist-selected">
              {t('halls.hist.selected', 'يوم التقرير')}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'flocks',
      header: t('halls.day.col.flocks', 'الأفواج'),
      kind: 'number',
      cell: (row) => (
        <>
          <Num>{fmtInt(row.flocks)}</Num>
          {row.rounds < row.roundsExpected ? (
            <span className={NOTE} data-action="hist-rounds">
              {t('halls.hist.rounds_of', 'الجولات {rounds} من {expected}', { rounds: row.rounds, expected: row.roundsExpected })}
            </span>
          ) : null}
        </>
      ),
    },
    { key: 'placed', header: t('halls.hist.col.placed', 'المسكَّن'), kind: 'number', cell: (row) => count(row.placed), total: total((m) => count(m.placed)) },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (row) => count(row.dead), total: total((m) => count(m.dead)) },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (row) => count(row.culled), total: total((m) => count(m.culled)) },
    { key: 'sold', header: t('halls.hist.col.sold', 'المبيع'), kind: 'number', cell: (row) => count(row.sold), total: total((m) => count(m.sold)) },
    {
      key: 'count_diff',
      header: t('halls.hist.col.count_diff', 'فرق العدّ'),
      kind: 'number',
      cell: (row) => <Num>{signedCount(row.countDiff)}</Num>,
      total: total((m) => <Num>{signedCount(m.countDiff)}</Num>),
    },
    {
      key: 'feed',
      header: t('halls.day.col.eaten', 'المأكول (كغم)'),
      kind: 'number',
      cell: (row) => kgCell(feedDecimals)(row.feedKg),
      total: total((m) => kgCell(feedDecimals)(m.feedKg)),
    },
    {
      key: 'given',
      header: GIVEN_HEADER(),
      kind: 'number',
      cell: (row) => givenCell(row.givenKg, row.givenUnweighed, givenDecimals),
      total: total((m) => givenCell(m.givenKg, m.givenUnweighed, givenDecimals)),
    },
    { key: 'live_end', header: t('halls.day.col.live_end', 'الحيّ آخر اليوم'), kind: 'number', cell: (row) => count(row.liveEnd), total: total((m) => count(m.liveEnd)) },
  ];
  if (entry.kind === 'layer') {
    columns.push(
      { key: 'eggs', header: t('halls.day.eggs', 'البيض'), kind: 'number', cell: (row) => count(row.eggsTotal), total: total((m) => count(m.eggsTotal)) },
      { key: 'broken', header: t('halls.hist.col.broken', 'المكسور'), kind: 'number', cell: (row) => count(row.eggsBroken), total: total((m) => count(m.eggsBroken)) },
      { key: 'hdep', header: t('halls.day.hdep', 'نسبة الإنتاج'), kind: 'number', cell: (row) => hdepCell(row.hdep), total: total((m) => hdepCell(m.hdep)) },
    );
  }
  return columns;
}

/** أعمدة الأشهر من البداية، وصفّ «منذ البداية» من total (الحيّ فيه حيّ يوم الخادم). */
function monthColumns(entry: HistoryKind): Column<HistoryMonth>[] {
  const { total } = entry;
  const feedDecimals = decimalsOf([...entry.months.map((row) => row.feedKg), total.feedKg]);
  const givenDecimals = decimalsOf([...entry.months.map((row) => row.givenKg), total.givenKg]);
  const columns: Column<HistoryMonth>[] = [
    { key: 'month', header: t('halls.hist.col.month', 'الشهر'), sticky: true, cell: (row) => monthLabel(monthOf(row.month)) },
    { key: 'days', header: t('halls.hist.col.days', 'الأيّام'), kind: 'number', cell: (row) => count(row.days), total: count(total.days) },
    { key: 'placed', header: t('halls.hist.col.placed', 'المسكَّن'), kind: 'number', cell: (row) => count(row.placed), total: count(total.placed) },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (row) => count(row.dead), total: count(total.dead) },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (row) => count(row.culled), total: count(total.culled) },
    { key: 'sold', header: t('halls.hist.col.sold', 'المبيع'), kind: 'number', cell: (row) => count(row.sold), total: count(total.sold) },
    // فرق العدّ (ومنه شطب الباقي عند الإغلاق) يُكمل حساب الحيّ في سطر الشهر كما في جدول الأيّام (مراجعة 0031 L2).
    {
      key: 'count_diff',
      header: t('halls.hist.col.count_diff', 'فرق العدّ'),
      kind: 'number',
      cell: (row) => <Num>{signedCount(row.countDiff)}</Num>,
      total: <Num>{signedCount(total.countDiff)}</Num>,
    },
    { key: 'feed', header: t('halls.day.col.eaten', 'المأكول (كغم)'), kind: 'number', cell: (row) => kgCell(feedDecimals)(row.feedKg), total: kgCell(feedDecimals)(total.feedKg) },
    {
      key: 'given',
      header: GIVEN_HEADER(),
      kind: 'number',
      cell: (row) => givenCell(row.givenKg, row.givenUnweighed, givenDecimals),
      total: givenCell(total.givenKg, total.givenUnweighed, givenDecimals),
    },
    { key: 'live_end', header: t('halls.hist.col.live_month', 'الحيّ آخر الشهر'), kind: 'number', cell: (row) => count(row.liveEnd), total: count(total.liveNow) },
  ];
  if (entry.kind === 'layer') {
    columns.push(
      { key: 'eggs', header: t('halls.day.eggs', 'البيض'), kind: 'number', cell: (row) => count(row.eggsTotal), total: count(total.eggsTotal) },
      { key: 'hdep', header: t('halls.day.hdep', 'نسبة الإنتاج'), kind: 'number', cell: (row) => hdepCell(row.hdep), total: hdepCell(total.hdep) },
    );
  }
  return columns;
}

/** غلاف جدول يُطبع ويُصوَّر كلّه بلا حدّ ارتفاع ولا تمرير. */
function TableBox({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible" data-action="hist-table" data-table={name}>
      {children}
    </div>
  );
}

// ─── قسم النوع ─────────────────────────────────────────────────────────────────────────────────────────────────────

function KindSection({ entry, on, month }: { entry: HistoryKind; on: Day; month: Day }) {
  const title = kindTitle(entry.kind);
  const monthName = monthLabel(monthOf(month));
  const monthRow = entry.months.find((row) => row.month === month) ?? null;
  const groups = eventsByDay(entry.events);
  return (
    <section className="flex flex-col gap-4" aria-label={title} data-action="hist-kind" data-kind={entry.kind}>
      <div className="flex flex-col gap-2">
        <SectionBar>{title}</SectionBar>
        <p className="text-sm" data-action="hist-start">
          {t('halls.hist.start', 'بدأنا يوم {day} — منذ البداية {days}.', { day: fmtDay(entry.start), days: daysText(entry.total.days) })}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <TableBox name="days">
          <DataTable
            variant="official"
            title={t('halls.hist.days_title', 'أيّام {month}', { month: monthName })}
            titleLevel={3}
            caption={t('halls.hist.days_caption', '{kind} — أيّام {month}', { kind: title, month: monthName })}
            columns={dayColumns(entry, monthRow, on)}
            rows={entry.days}
            rowKey={(row) => row.on}
            empty={t('halls.hist.days_empty', 'لا أيّام من {month} في المدّة: بدأنا يوم {day}.', { month: monthName, day: fmtDay(entry.start) })}
            totalLabel={monthRow ? t('halls.hist.month_total', 'مجموع الشهر') : undefined}
            rowTone={(row) => (row.on === on ? 'mark' : null)}
          />
        </TableBox>
      </div>
      <div className="flex flex-col gap-2">
        <TableBox name="months">
          <DataTable
            variant="official"
            title={t('halls.hist.months_title', 'الأشهر من البداية')}
            titleLevel={3}
            caption={t('halls.hist.months_caption', '{kind} — الأشهر من البداية', { kind: title })}
            columns={monthColumns(entry)}
            rows={entry.months}
            rowKey={(row) => row.month}
            empty={dash()}
            totalLabel={t('halls.hist.since_start', 'منذ البداية')}
            rowTone={(row) => (row.month === month ? 'mark' : null)}
          />
        </TableBox>
      </div>
      <div className="flex flex-col gap-2" data-action="hist-what">
        <SubBar>{t('halls.hist.what', 'ما جرى')}</SubBar>
        <p className="text-sm" data-action="hist-sentence">
          {historySentence(entry)}
        </p>
        <p className="text-sm font-semibold">{t('halls.hist.events', 'أحداث {month}', { month: monthName })}</p>
        {groups.length ? (
          <ol className="flex flex-col gap-2" aria-label={t('halls.hist.events', 'أحداث {month}', { month: monthName })} data-action="hist-events">
            {groups.map((group) => (
              <li
                key={group.on}
                className={`flex flex-col gap-1 rounded-lg p-3 ${group.on === on ? 'bg-surface-3' : 'border border-line'}`}
                data-action="hist-event-day"
                data-day={group.on}
                aria-current={group.on === on ? 'date' : undefined}
              >
                <p className="text-sm font-semibold">
                  <Num>{fmtDay(group.on)}</Num>
                  {group.on === on ? (
                    <span className="ms-2 text-xs text-brand-700 dark:text-brand-200" data-action="hist-selected">
                      {t('halls.hist.selected', 'يوم التقرير')}
                    </span>
                  ) : null}
                </p>
                <ul className="list-disc ps-5 text-sm">
                  {group.events.map((event, index) => (
                    <li key={`${event.type}|${event.hall}|${event.site}|${index}`} data-action="hist-event" data-type={event.type}>
                      {eventText(event)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted" data-action="hist-no-events">
            {t('halls.hist.no_events', 'لا أحداث مسجّلة في {month}.', { month: monthName })}
          </p>
        )}
      </div>
    </section>
  );
}

/** أقسام «منذ أن بدأنا» لكلّ نوع، بشهر يوم التقرير on. */
export function HistorySections({ history, on }: { history: HallsHistory; on: Day }) {
  return (
    <>
      {history.kinds.map((entry) => (
        <KindSection key={entry.kind} entry={entry} on={on} month={history.month} />
      ))}
    </>
  );
}

// ─── ملاحظة اليوم ──────────────────────────────────────────────────────────────────────────────────────────────────

/** «ملاحظة يوم …»: نصّها أو «لا ملاحظة»، وزرّ الكتابة لمن له halls_note.write (لا يُطبع ولا يُصوَّر). */
export function NoteBlock({ on, note, canWrite, disabled, onWrite }: { on: Day; note: HallsNote | null; canWrite: boolean; disabled: boolean; onWrite: () => void }) {
  const title = t('halls.note.title', 'ملاحظة يوم {day}', { day: fmtDay(on) });
  return (
    <section className="flex flex-col gap-2" aria-label={title} data-action="hist-note">
      <SectionBar>{title}</SectionBar>
      {note ? (
        <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }} data-action="hist-note-text">
          {note.text}
        </p>
      ) : (
        <p className="text-sm text-ink-muted" data-action="hist-note-none">
          {t('halls.note.none', 'لا ملاحظة لهذا اليوم.')}
        </p>
      )}
      {canWrite ? (
        <div className="print:hidden">
          <Button size="sm" variant="secondary" disabled={disabled} onClick={onWrite} data-action="hist-note-write">
            {note ? t('halls.note.edit', 'عدّل الملاحظة') : t('halls.note.write', 'اكتب ملاحظة')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** رسالة رفض الخادم بتلميحه، وإلّا وصفها العامّ. */
function failureText(failure: unknown): string {
  if (failure instanceof RejectedError && failure.hint) return failure.hint;
  const described = describeError(failure, 'write');
  return `${described.title}. ${described.detail}`;
}

/**
 * نافذة ملاحظة يوم (نمط ملاحظة الرصيد اليومي، درس 2026-11-09): النصّ والنسخة من لقطة واحدة حين فُتحت (shown)، والحفظ بشرط تلك النسخة. وnote_changed يقول
 * إنّ غيره غيّرها ويقرأ التقرير من جديد، وأوّل قراءة ناجحة بعده (عدّاد reads لا loading) تصير الأساس وتُعرض («الملاحظة الآن»)، ويبقى ما كتبه ليحفظه
 * فوقها إن شاء؛ وإن فشلت القراءة يُقال ذلك بـ«أعد القراءة» ولا حفظ بنسخة لم تُقرأ.
 */
export function HallsNoteDialog({
  day,
  shown,
  latest,
  reads,
  failed,
  onClose,
  onSaved,
  onReread,
}: {
  day: Day;
  /** الملاحظة كما عُرضت حين فُتحت النافذة. */
  shown: HallsNote | null;
  /** ملاحظة اليوم في آخر قراءة ناجحة، وعدد القراءات الناجحة حتى الآن. */
  latest: HallsNote | null;
  reads: number;
  /** فشلت آخر قراءة. */
  failed: boolean;
  /** uncertain: نتيجة الحفظ مجهولة (لعلّها حُفظت)، فالتقرير يُقرأ من جديد. */
  onClose: (uncertain: boolean) => void;
  onSaved: (result: HallsNoteResult) => void;
  onReread: () => void;
}) {
  const id = useId();
  const [basis, setBasis] = useState<HallsNote | null>(shown);
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
    const trimmed = hallsNoteText(value);
    // لا ملاحظة ولا نصّ: لا شيء يُحفظ ولا يُمسح.
    if (trimmed === '' && basis === null && !changed) {
      onClose(false);
      return;
    }
    const length = [...trimmed].length;
    if (length > HALLS_NOTE_MAX) {
      setError(t('halls.note.too_long', 'الملاحظة أطول من {max} حرف ({n}). اختصرها.', { max: HALLS_NOTE_MAX, n: length }));
      return;
    }
    setError(null);
    setFailure(null);
    setBusy(true);
    try {
      onSaved(await setHallsNote(day, trimmed, basis?.version ?? null));
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
      title={t('halls.note.dialog', 'ملاحظة يوم {day}', { day: fmtDay(day) })}
      dirty={text !== (shown?.text ?? '')}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          {basis ? (
            <Button variant="ghost" onClick={() => void send('')} disabled={busy || waiting} data-action="erase-halls-note">
              {t('halls.note.erase', 'امسح الملاحظة')}
            </Button>
          ) : null}
          <Button type="submit" form={formId} busy={busy} disabled={waiting} data-action="save-halls-note">
            {t('halls.note.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-3" onSubmit={submit} noValidate>
        {changed ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-warn-700 dark:text-warn-300" data-action="halls-note-changed">
              {waiting
                ? failed
                  ? t('halls.note.changed.failed', 'غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت، وتعذّرت قراءة الملاحظة الحاليّة. أعد القراءة لتراها، ثمّ احفظ ما كتبت إن شئت.')
                  : t('halls.note.changed.reading', 'غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت. جارٍ قراءة الملاحظة الحاليّة…')
                : basis
                  ? t('halls.note.changed', 'غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت. الملاحظة الآن: «{text}». ما كتبته باقٍ هنا: احفظه ليحلّ محلّها، أو أغلق النافذة.', { text: basis.text })
                  : t('halls.note.changed.cleared', 'مُسحت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت. ما كتبته باقٍ هنا: احفظه إن شئت، أو أغلق النافذة.')}
            </p>
            {waiting && failed ? (
              <Button variant="secondary" size="sm" onClick={onReread} data-action="halls-note-reread">
                {t('dayb.reread', 'أعد القراءة')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <Field id={`${id}-text`} label={t('halls.note.label', 'الملاحظة')} hint={t('halls.note.hint', 'حتى {max} حرف. احفظها فارغة لتمسحها.', { max: HALLS_NOTE_MAX })} error={error}>
          <textarea id={`${id}-text`} className="input" rows={4} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} data-action="halls-note-input" data-autofocus />
        </Field>
        {failure ? (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="halls-note-failed">
            {failureText(failure)}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
