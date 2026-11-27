import { CloudOff, Send } from 'lucide-react';
import { Suspense, useEffect, useId, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { localDay } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import type { Milli } from '../../domain/money';
import { readGasAdd, readVisit, type FlockKind, type GasAddError } from '../../domain/flocks';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError, RejectedError } from '../../lib/errors';
import { fedStore, nextTick, patchKept, withSaved } from '../../lib/farmCopy';
import { countForm, fmtDay, fmtInt, fmtMilli } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { openOutbox, removeReview, saveRounds, type EnqueueInput, type OutboxOp, type ReviewEntry, type SendResult, type Stamp } from '../../lib/outbox';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { parseOverview, type FlockSummary, type FlocksOverview } from '../../lib/repo/flocks';
import type { FeedSent } from '../../lib/repo/hallSheet';
import { ackRuns, refreshRoundQueue, roundQueueStore, stampKey, uploadRounds, type RoundRun } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { useQueue } from './deviceQueue';
import { CARD_CLASS, givePath, LINK_CLASS } from './feed';
import './round.css';
import { cylindersText, errorText, feedAmount, gasSoFar, loadTransport, parkText, soFar, soFarText, staleVisitText, type GasSoFar, type SoFar } from './roundText';
import { farmPath, farmTitle, hallLabel, hallPath, roundLazies, useOverview, useStamp, type RoundFeedProps } from './shared';

// الجولة اليومية (FOUNDATION ٧٨٢–٧٨٣ و٨١٦؛ وعقد 0036 الجزء R، كلمة المالك 2026-11-24 بصورة الجولة): بطاقة لكلّ قاعة فيها فوج قائم، أقسامها جنباً إلى
// جنب في الشاشة العريضة (ثلاثة أعمدة من 1024) وبعضها تحت بعض في الهاتف، بأصناف موجودة (لا صنف Tailwind جديد: CSS الإقلاع بسقفه):
// - الهلاكات مرّة في اليوم: قبل تسجيلها خانة، وبعده («سُجّلت هلاكات اليوم» من الخادم، أو عملية على هذا الجهاز لم تُرفع) صندوق مضلَّل مقفول برقمها وطريق
//   التصحيح (صفحة القاعة ← ✎ تعديل)؛ تُحفظ بالطابور (set_flock_dead) ولا تُضاف إلى ما سُجّل أبداً.
// - العلف: بطاقات أعلاف «رصيد العلف» بـ«عندك» وإرسال فوريّ لليوم (RoundFeed، يحتاج اتصالاً)، وفوقها «أُرسل اليوم».
// - الغاز (اختياريّ): «قناني أُرسلت الآن» تُضاف إلى مجموع اليوم (add_flock_gas، بالطابور بلا نت)، وتحتها مجموع اليوم.
// - وللبيّاض البيض كما كان: زيارة تُضاف (save_flock_visit بالبيض وحده).
// زرّ «احفظ الجولة» واحد ثابت أسفل الشاشة يسمّي عدد القاعات، يحفظ ما كُتب لكلّ قاعة بالطابور ثمّ يرفعه بالرافع الواحد (roundUploads)؛ والعلف ليس منه (زرّه
// في بطاقته). Enter في خانة ينقل إلى الخانة نفسها في القاعة التالية (لا حفظ). وفوقها تذكير لقاحات النوع، وتحتها رفّ «جولات تحتاج مراجعة». وخرجت من
// الجولة «كلّ القاعات» (الخانة الواحدة والاختيار والصرف للمختارة) و«زيارات اليوم» (التصحيح من ورقة القاعة)، والدواء من «أضف للقاعة» في كلّ بطاقة.

type RowStatus = 'saved' | 'device' | 'parked' | 'review' | 'held';

/** خانات القاعة كما كُتبت: '' = فارغة (لا شيء يُرسل). وفي قاعة مقسومة (0038) خانة هلاكات لكلّ قسم (dead1..dead4) بدل dead. */
interface RoundEntry {
  dead: string;
  dead1: string;
  dead2: string;
  dead3: string;
  dead4: string;
  gas: string;
  eggsTotal: string;
  eggsBroken: string;
}

type EntryField = keyof RoundEntry;
/** خانات هلاكات الأقسام بترتيبها (ق1 … ق4). */
const PART_FIELDS = ['dead1', 'dead2', 'dead3', 'dead4'] as const;
type PartField = (typeof PART_FIELDS)[number];
/** خانات هلاكات أقسام القاعة (بعدد أقسامها)، أو [] لقاعة غير مقسومة. */
const partFields = (flock: FlockSummary): PartField[] => PART_FIELDS.slice(0, flock.sectionCounts?.length ?? 0);
/** «ق1». */
const sectionName = (index: number): string => t('round.section', 'ق{n}', { n: fmtInt(index + 1) });

/** علف اليوم كما قرأته الجولة: مجموعه بالكيلو (أو null: لم يُرسل) وسطر لكلّ مادّة. */
interface SentToday {
  kg: Milli | null;
  lines: FlockSummary['feedToday'];
}

const EMPTY_ENTRY: RoundEntry = { dead: '', dead1: '', dead2: '', dead3: '', dead4: '', gas: '', eggsTotal: '', eggsBroken: '' };
const ENTRY_FIELDS: EntryField[] = ['dead', 'dead1', 'dead2', 'dead3', 'dead4', 'gas', 'eggsTotal', 'eggsBroken'];
const typed = (value: string): boolean => value.trim() !== '';
/** كُتبت هلاكات القاعة: خانتها، أو خانة قسم من أقسامها في قاعة مقسومة. */
const deadTyped = (flock: FlockSummary, entry: RoundEntry): boolean => {
  const parts = partFields(flock);
  return parts.length > 0 ? parts.some((field) => typed(entry[field])) : typed(entry.dead);
};
/** ما كُتب في هلاكات القاعة نصّاً: «ق1 3، ق2 2» لقاعة مقسومة، وإلّا الخانة. */
const deadTypedText = (flock: FlockSummary, entry: RoundEntry): string => {
  const parts = partFields(flock);
  if (parts.length === 0) return entry.dead.trim();
  return parts
    .map((field, index) => (typed(entry[field]) ? t('round.dead.part_text', '{section} {n}', { section: sectionName(index), n: entry[field].trim() }) : null))
    .filter((text): text is string => text !== null)
    .join(t('list.separator', '، '));
};

/**
 * هلاكات أقسام القاعة كما كُتبت (0038): الفارغ صفر ما دام قسمٌ كُتب، وكلّ قسم عدد صحيح لا يتجاوز الباقي فيه (عدده − هلاكاته قبل اليوم، كما يفحص الخادم)؛
 * أو null: لم يُكتب شيء؛ أو الخطأ بخانته.
 */
function readParts(flock: FlockSummary, entry: RoundEntry): { parts: number[] } | { field: PartField; message: string } | null {
  const fields = partFields(flock);
  if (fields.length === 0 || !fields.some((field) => typed(entry[field]))) return null;
  const parts: number[] = [];
  for (const [index, field] of fields.entries()) {
    const text = entry[field].trim();
    const n = text === '' ? 0 : wholeCount(text);
    if (n === null) return { field, message: t('round.error.bad_part', 'اكتب هلاكات {section} عدداً صحيحاً، أو اتركها فارغة (صفر).', { section: sectionName(index) }) };
    const left = (flock.sectionCounts?.[index] ?? 0) - (flock.sectionDead?.[index] ?? 0);
    if (n > left) return { field, message: t('round.error.part_over', 'هلاكات {section} أكثر من طيوره الباقية ({left}).', { section: sectionName(index), left: fmtInt(Math.max(left, 0)) }) };
    parts.push(n);
  }
  return { parts };
}
/** عدد صحيح من أرقام (غربية بعد التحويل) بحدّ الخادم، أو null. */
const wholeCount = (text: string): number | null => (/^[0-9]{1,8}$/u.test(text) ? Number(text) : null); // number-ok: هلاكات قسم من أرقام الخانة وحدها

interface RoundRow {
  flock: FlockSummary;
  hallId: string;
  hallName: string;
  siteName: string;
  /** الحيّ بداية اليوم. */
  liveStart: number;
  /** مجموع اليوم حتى الآن (الهلاكات و«سُجّلت؟» والبيض): المحفوظ (أو نسخة الجهاز) وعمليات هذا الجهاز لليوم. */
  total: SoFar;
  /** غاز اليوم حتى الآن: المحفوظ وعمليات هذا الجهاز. */
  gas: GasSoFar;
  /** علف اليوم كما قرأته الجولة، أو null: القراءة ليست ليوم الجولة. */
  sent: SentToday | null;
}

/** صفوف الجولة: كل فوج نشط بالنوع مسكّن باليوم أو قبله، بمجموع اليوم المحفوظ وفوقه عمليات الجهاز. */
function roundRows(overview: FlocksOverview, kind: FlockKind, today: string, pending: readonly OutboxOp[]): RoundRow[] {
  const rows: RoundRow[] = [];
  const fresh = overview.today === today;
  for (const site of overview.sites) {
    if (site.kind !== kind) continue;
    for (const hall of site.halls) {
      const flock = hall.flock;
      if (!flock || flock.status !== 'active' || flock.placedOn === null || flock.placedOn > today) continue;
      const opsOf = (day: string) => pending.filter((op) => op.flockId === flock.id && op.day === day);
      let liveStart = fresh ? flock.liveStartToday : flock.live;
      if (!fresh) {
        // نسخة أقدم من اليوم (بلا نت من البارحة): الحيّ آخر ذاك اليوم ناقص ما أضافته عمليات الجهاز المنتظرة لذلك اليوم على المحفوظ.
        const then = soFar(flock.today, opsOf(overview.today));
        liveStart -= then.dead + then.culled - (flock.today?.dead ?? 0) - (flock.today?.culled ?? 0);
      }
      const ops = opsOf(today);
      rows.push({
        flock,
        hallId: hall.id,
        hallName: hall.name,
        siteName: site.name,
        liveStart,
        total: soFar(fresh ? flock.today : null, ops),
        gas: gasSoFar(fresh ? flock.gasToday : null, ops),
        sent: fresh ? { kg: flock.feedTodayKg, lines: flock.feedToday } : null,
      });
    }
  }
  return rows;
}

const SEVERITY: Record<RowStatus, number> = { saved: 0, device: 1, held: 2, parked: 3, review: 4 };
const worst = (statuses: readonly RowStatus[]): RowStatus | null => statuses.reduce<RowStatus | null>((found, status) => (found === null || SEVERITY[status] > SEVERITY[found] ? status : found), null);

const statusOf = (result: SendResult | undefined | null): RowStatus => {
  if (!result) return 'device';
  if (result.kind === 'saved') return 'saved';
  if (result.kind === 'parked') return 'parked';
  if (result.kind === 'stale_day' || result.kind === 'stale_visit' || result.kind === 'stale_gas' || result.kind === 'stale_kerosene' || result.kind === 'dead_recorded' || result.kind === 'rejected')
    return 'review';
  return 'held';
};

/**
 * حالة القاعة: عملية منتظرة بالجهاز ليومها أوّلاً، وإلا أسوأ نتائج آخر رفع مسّ يومها بالجلسة (الهلاكات والغاز والبيض قد تُرفع معاً: الهلاكات المردودة لا
 * يخفيها غاز حُفظ بعدها).
 */
function rowStatus(row: RoundRow, pending: readonly OutboxOp[], runs: readonly RoundRun[], key: string, today: string): RowStatus | null {
  const own = pending.filter((entry) => entry.flockId === row.flock.id && entry.day === today);
  if (own.length > 0) return own.some((op) => op.state === 'held_identity' || op.state === 'held_subscription') ? 'held' : 'device';
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (!run || run.key !== key) continue;
    const mine = run.results.filter((entry) => entry.flockId === row.flock.id && entry.day === today);
    if (mine.length > 0) return worst(mine.map((entry) => statusOf(entry.result)));
  }
  return null;
}

function statusText(status: RowStatus): string {
  switch (status) {
    case 'saved':
      return t('round.status.saved', 'حُفظت');
    case 'device':
      return t('round.status.device', 'محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال');
    case 'parked':
      return t('round.status.parked', 'رُدّت (الفوج مغلق أو الفترة مقفلة)، وبقيت على هذا الجهاز في «جولات تحتاج مراجعة» أدناه');
    case 'review':
      return t('round.status.review', 'لم تُحفظ: راجعها في «جولات تحتاج مراجعة» أدناه');
    case 'held':
      return t('round.status.held', 'تنتظر: ادخل من جديد لتُرسل');
  }
}

type ShelfField = 'dead' | 'culled' | 'feed_kg' | 'eggs_total' | 'eggs_broken' | 'cylinders' | 'add' | 'liters' | 'note';

/** الهلاكات في صفّ اليوم كما يعرضها الخادم: النافق والمستبعد القديم معاً (الورقة)، أو null. */
function dayDeaths(server: unknown): number | null {
  if (typeof server !== 'object' || server === null) return null;
  const { dead, culled } = server as { dead?: unknown; culled?: unknown };
  const n = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : 0);
  return typeof dead === 'number' || typeof culled === 'number' ? n(dead) + n(culled) : null;
}

/**
 * رفّ المراجعة: ما لم يقبله الخادم كما هو، ومنه المركون بسببه (0035: كان يُحذف من الجهاز بصمت)، بالنسختين جنب بعض؛ ولا يُحذف إلا بـ«احذفه» بتأكيد
 * يسمّي ما يضيع. ولكلّ صفّ الخانة وقيمتاها: الهلاكات (0036) ما كتبته وما سُجّل، والغاز المضاف ما أضفته.
 */
function ReviewShelf({ entries, names, halls, kind, onRemove }: { entries: readonly ReviewEntry[]; names: ReadonlyMap<string, string>; halls: ReadonlyMap<string, string>; kind: FlockKind; onRemove: (entry: ReviewEntry) => Promise<void> }) {
  const [removing, setRemoving] = useState<{ entry: ReviewEntry; busy: boolean } | null>(null);
  if (entries.length === 0) return null;
  const fields: { key: ShelfField; label: string; amount?: boolean }[] = [
    { key: 'dead', label: t('round.dead', 'النافق') },
    { key: 'culled', label: t('round.culled', 'المستبعد') },
    { key: 'feed_kg', label: t('round.feed', 'العلف (كغم)'), amount: true },
    { key: 'eggs_total', label: t('round.eggs_total', 'البيض (المجموع)') },
    { key: 'eggs_broken', label: t('round.eggs_broken', 'المكسور') },
    { key: 'cylinders', label: t('round.review.gas', 'الغاز (قناني)') },
    { key: 'add', label: t('round.review.gas_add', 'الغاز المضاف (قناني)') },
    // 0037: كاز اليوم من ورقة القاعة (لا من الجولة) يصل الرفّ إن رُدّ أو رُكن.
    { key: 'liters', label: t('round.review.kerosene', 'الكاز (لتر)') },
    { key: 'note', label: t('round.review.note', 'الملاحظة') },
  ];
  const shown = (value: unknown, amount?: boolean): string => {
    if (value === null || value === undefined) return '—';
    if (amount && typeof value === 'string') {
      const parsed = parseDecimal(value, 3);
      return parsed ? fmtMilli(toScale(parsed, 3)) : '—';
    }
    if (typeof value === 'string') return value === '' ? '—' : value;
    return typeof value === 'number' && Number.isInteger(value) ? fmtInt(value) : '—';
  };
  const remove = async () => {
    if (!removing || removing.busy) return;
    setRemoving({ ...removing, busy: true });
    await onRemove(removing.entry).finally(() => setRemoving(null));
  };
  const present = (value: unknown) => value !== null && value !== undefined;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('round.review.title', 'جولات تحتاج مراجعة')}</h2>
      <p className="text-sm text-ink-muted">{t('round.review.hint', 'لم يقبلها الخادم كما هي. تبقى هنا على هذا الجهاز ولا تُحذف؛ أعد إدخال ما تراه صحيحاً في الجولة، وما يُكتب في ورقة القاعة (الهلاكات المسجّلة والغاز والكاز) من صفحة القاعة.')}</p>
      {entries.map((entry) => {
        const server = entry.server && typeof entry.server === 'object' ? (entry.server as Record<string, unknown>) : null;
        const op = entry.op;
        // الزيارة (0032) «زيارتك والمحفوظة» بخاناتها كلّها (المحتوى كامل)، ومجموع اليوم القديم بخاناته المكتوبة وحدها، وهلاكات اليوم (0036) الهلاكات وحدها
        // (المسجّلة: النافق والمستبعد القديم معاً)، والغاز المضاف خانته وحدها.
        const visit = op.fn === 'save_flock_visit' ? op.payload : null;
        const mine = op.payload as Readonly<Partial<Record<ShelfField, unknown>>>;
        const rows =
          op.fn === 'set_flock_dead'
            ? fields.filter((field) => field.key === 'dead')
            : op.fn === 'add_flock_gas'
              ? fields.filter((field) => field.key === 'add')
              : fields.filter((field) =>
                  visit
                    ? field.amount || field.key === 'dead' || field.key === 'culled' || present(mine[field.key]) || present(server?.[field.key])
                    : field.key === 'cylinders'
                      ? op.fn === 'set_flock_gas'
                      : field.key === 'liters'
                        ? op.fn === 'set_flock_kerosene'
                        : field.key !== 'add' && present(mine[field.key]),
                );
        const serverOf = (field: ShelfField): unknown => (op.fn === 'set_flock_dead' ? dayDeaths(entry.server) : op.fn === 'add_flock_gas' ? null : server?.[field]);
        const reason =
          entry.reason === 'stale_day'
            ? t('round.review.stale', 'حُفظ هذا اليوم من جهاز آخر قبل أن تصل جولتك، فلم تُكتب فوقه.')
            : entry.reason === 'stale_gas'
              ? t('round.review.stale_gas', 'تغيّر غاز هذا اليوم من جهاز آخر قبل أن يصل تعديلك، فلم يُكتب فوقه.')
              : entry.reason === 'stale_kerosene'
                ? t('round.review.stale_kerosene', 'تغيّر كاز هذا اليوم من جهاز آخر قبل أن يصل تعديلك، فلم يُكتب فوقه.')
                : entry.reason === 'stale_visit'
                  ? staleVisitText(entry.server)
                  : entry.reason === 'dead_recorded'
                    ? t('round.review.dead_recorded', 'سُجّلت هلاكات هذا اليوم من جهاز آخر: {n}', { n: fmtInt(dayDeaths(entry.server) ?? 0) })
                    : entry.reason === 'parked'
                      ? t('round.review.parked', 'لم يُحفظ: {why}. ووصل إلى صفحة القاعة أيضاً.', { why: parkText(entry.hint) })
                      : describeError(new RejectedError(entry.reason, entry.hint)).detail;
        const what =
          op.fn === 'save_flock_visit'
            ? visit?.void
              ? t('round.review.visit_void', 'إلغاء زيارة')
              : op.baseVersion === null
                ? t('round.review.visit_new', 'زيارة جديدة')
                : t('round.review.visit_edit', 'تعديل زيارة')
            : op.fn === 'set_flock_dead'
              ? t('round.review.dead_once', 'هلاكات اليوم')
              : op.fn === 'add_flock_gas'
                ? t('round.review.gas_added', 'غاز أُضيف')
                : op.fn === 'set_flock_kerosene'
                  ? t('round.review.kerosene_set', 'كاز اليوم')
                  : null;
        return (
          <div key={entry.id} className={CARD_CLASS} data-review={entry.id}>
            <p className="font-semibold">
              {names.get(op.flockId) ?? t('round.review.flock', 'فوج')} — <bdi dir="ltr">{fmtDay(op.day)}</bdi>
              {what ? ` — ${what}` : null}
            </p>
            {/* الرفض بلا تلميح (رمز خادم مثل PGRST202) بجملة فصيحة، مو الرمز وحده. */}
            <p className="text-sm">{reason}</p>
            {/* الهلاكات المسجّلة مقفولة في الجولة: تصحيحها من صفحة القاعة بالقلم (مراجعة 0036 R9). */}
            {entry.reason === 'dead_recorded' && halls.has(op.flockId) ? <DeadFix to={hallPath(kind, halls.get(op.flockId) ?? '')} action="review-dead-fix" /> : null}
            {/* غاز الورقة وكازها (0035 و0037) لا خانة لهما في الجولة: تصحيحهما من صفحة القاعة (مراجعة 2026-11-27). */}
            {(op.fn === 'set_flock_gas' || op.fn === 'set_flock_kerosene') && halls.has(op.flockId) ? (
              <DeadFix to={hallPath(kind, halls.get(op.flockId) ?? '')} action="review-sheet-fix" />
            ) : null}
            <DataTable
              caption={visit ? t('round.review.visit_table', 'زيارتك والمحفوظة') : t('round.review.table', 'جولتك والمحفوظ في الخادم')}
              columns={[
                { key: 'field', header: t('round.review.field', 'الخانة'), cell: (field) => (op.fn === 'set_flock_dead' ? t('round.dead.title', 'الهلاكات') : field.label) },
                { key: 'mine', header: visit ? t('round.review.visit_mine', 'زيارتك') : t('round.review.mine', 'جولتك'), kind: 'number', cell: (field) => <Num>{shown(mine[field.key], field.amount)}</Num> },
                { key: 'server', header: visit ? t('round.review.visit_server', 'المحفوظة') : t('round.review.server', 'المحفوظ في الخادم'), kind: 'number', cell: (field) => <Num>{shown(serverOf(field.key), field.amount)}</Num> },
              ]}
              rows={rows}
              rowKey={(field) => field.key}
              empty={t('round.review.empty', 'بلا خانات.')}
            />
            <div>
              <Button variant="ghost" onClick={() => setRemoving({ entry, busy: false })} data-action="review-remove">
                {t('round.review.remove', 'احذفه')}
              </Button>
            </div>
          </div>
        );
      })}
      {removing ? (
        <ConfirmDialog
          open
          title={t('round.review.remove_title', 'احذف هذا من هذا الجهاز؟')}
          consequence={t('round.review.remove_body', 'يُحذف ما كُتب في «{hall}» ليوم {day} من هذا الجهاز ولا يُرسل؛ وما في الخادم لا يتغيّر.', {
            hall: names.get(removing.entry.op.flockId) ?? t('round.review.flock', 'فوج'),
            day: fmtDay(removing.entry.op.day),
          })}
          confirmLabel={t('round.review.remove_go', 'احذفه من الجهاز')}
          busy={removing.busy}
          action="review-remove-go"
          onConfirm={() => void remove()}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </section>
  );
}

/** «للتصحيح: صفحة القاعة ← ✎ تعديل»: الهلاكات المسجّلة تُصحَّح من صفحة القاعة بالقلم (البطاقة المقفولة، وصفّ dead_recorded في الرفّ). */
function DeadFix({ to, action }: { to: string; action: string }) {
  return (
    <p className="text-sm">
      {t('round.dead.fix_lead', 'للتصحيح:')}{' '}
      <Link to={to} className={`${LINK_CLASS} inline-flex min-h-11 items-center`} data-action={action}>
        {t('round.dead.fix', 'صفحة القاعة ← ✎ تعديل')}
      </Link>
    </p>
  );
}

/** قسم في بطاقة القاعة (الهلاكات والبيض والعلف والغاز). */
const SECTION_CLASS = 'flex min-w-0 flex-col gap-2 rounded-2xl border border-line p-3';

/** علامة القفل على الهلاكات المسجّلة (SVG صغير هنا: أيقونة مشتركة مع حزمة القاعات كانت تفصل حزمة مشتركة في التثبيت المسبق). */
function LockMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function gasErrorText(error: GasAddError, today: number | null): string {
  return error === 'gas_over_day'
    ? t('round.error.gas_over_day', 'مجموع غاز اليوم لا يتجاوز 1,000 قنينة، والمسجّل الآن {n}.', { n: fmtInt(today ?? 0) })
    : t('round.error.bad_gas', 'اكتب عدد القناني: من 1 إلى 1,000، أو اترك الخانة فارغة.');
}

interface CardProps {
  row: RoundRow;
  kind: FlockKind;
  today: string;
  /** null = قراءة بس (بلا flock_day.save). */
  entry: RoundEntry | null;
  onChange: (entry: RoundEntry) => void;
  error: { field: EntryField; message: string } | null;
  status: RowStatus | null;
  online: boolean;
  stamp: Stamp | null;
  feedItems: FlocksOverview['feedItems'];
  onFeedSent: (sent: FeedSent) => void;
  /** بطاقات العلف و«أرسل» من حزمة القاعات (استيراد واحد للجولة كلّها). */
  Feed: ComponentType<RoundFeedProps>;
  /** مرجع كلّ خانة للتنقّل بـEnter. */
  register: (field: EntryField) => (element: HTMLInputElement | null) => void;
  onEnter: (field: EntryField) => void;
}

function RoundCard({ row, kind, today, entry, onChange, error, status, online, stamp, feedItems, onFeedSent, Feed, register, onEnter }: CardProps) {
  const id = useId();
  const label = hallLabel(row.hallName);
  const { total, gas } = row;
  const entered = total.deadEntered;
  const keyDown = (field: EntryField) => (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter ينقل إلى الخانة نفسها في القاعة التالية، ولا يحفظ (والتركيب بلوحات الهاتف لا يُقطع).
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onEnter(field);
  };
  const input = (field: EntryField, title: string) =>
    entry ? (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${id}-${field}`} className="text-sm font-medium">
          {title}
        </label>
        <input
          id={`${id}-${field}`}
          ref={register(field)}
          className="input tabular-nums"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          aria-invalid={error?.field === field || undefined}
          value={entry[field]}
          onChange={(event) => onChange({ ...entry, [field]: event.target.value })}
          onKeyDown={keyDown(field)}
          data-round-field={field}
        />
      </div>
    ) : null;
  const errorFor = (field: EntryField) =>
    error?.field === field ? (
      <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="round-error">
        {error.message}
      </p>
    ) : null;
  const late = entry !== null && entered && deadTyped(row.flock, entry);
  const parts = partFields(row.flock);
  const gasToday = gas.cylinders === null ? t('round.gas.today_none', 'اليوم: لم يُسجَّل غاز') : t('round.gas.today', 'اليوم: {n}', { n: cylindersText(gas.cylinders) });
  return (
    <div className={CARD_CLASS} data-flock={row.flock.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {/* اسم القاعة طريق إلى صفحتها (كلمة المالك 2026-11-16). */}
          <Link to={hallPath(kind, row.hallId)} className="text-brand-700 underline-offset-4 hover:underline dark:text-brand-200" data-action="round-hall">
            {label}
          </Link>{' '}
          <span className="text-sm font-normal text-ink-muted">— {row.siteName}</span>
        </p>
        <p className="text-sm text-ink-muted">
          {t('round.live_start', 'الحيّ بداية اليوم')}: <bdi dir="ltr">{fmtInt(row.liveStart)}</bdi>
          {row.flock.ageDays !== null ? (
            <>
              {' · '}
              {t('round.age', 'العمر بالأيام')}: <bdi dir="ltr">{fmtInt(row.flock.ageDays)}</bdi>
            </>
          ) : null}
        </p>
        {/* دواء أو علف لهذه القاعة في صفحة الإضافة، والرجوع إلى الجولة. */}
        {entry ? (
          <Link to={givePath(row.flock.id, `${farmPath(kind)}/round`)} className={`${LINK_CLASS} inline-flex min-h-11 items-center`} data-action="round-give">
            {t('round.give', 'أضف للقاعة')}
          </Link>
        ) : null}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-3" data-action="round-sections">
        <div className="flex min-w-0 flex-col gap-3">
          <section className={SECTION_CLASS} data-action="round-dead">
            <h3 className="font-semibold">{t('round.dead.title', 'الهلاكات')}</h3>
            {entered || !entry ? (
              // مرّة في اليوم: بعد تسجيلها صندوق مضلَّل مقفول برقمها، والتصحيح من صفحة القاعة بالقلم.
              <div className="flex flex-col gap-1 rounded-xl border border-line-strong bg-surface-3 p-3 text-ink-muted" data-action="round-dead-locked" data-pending={total.deadPending || undefined}>
                <div className="flex items-center gap-2">
                  <LockMark />
                  <span dir="ltr" className="text-2xl font-semibold tabular-nums text-ink" data-action="round-dead-value">
                    {entered ? fmtInt(total.dead + total.culled) : '—'}
                  </span>
                </div>
                {/* قاعة مقسومة (0038): هلاكات كلّ قسم تحت مجموعها. */}
                {entered && total.deadParts ? (
                  <p className="text-sm" data-action="round-dead-parts">
                    {total.deadParts.map((part, index) => t('round.dead.part_text', '{section} {n}', { section: sectionName(index), n: fmtInt(part) })).join(' · ')}
                  </p>
                ) : null}
                <p className="text-sm font-semibold">{entered ? t('round.dead.entered', 'سُجّلت هلاكات اليوم') : t('round.dead.missing', 'لم تُسجَّل هلاكات اليوم بعد')}</p>
                {total.deadPending ? (
                  <p className="text-sm" data-action="round-dead-pending">
                    {t('round.dead.pending', 'بانتظار الرفع من هذا الجهاز.')}
                  </p>
                ) : null}
                {entered ? <DeadFix to={hallPath(kind, row.hallId)} action="round-dead-fix" /> : null}
                {late ? (
                  <div className="flex flex-col gap-1" data-action="round-dead-late">
                    <p role="alert" className="text-sm text-warn-800 dark:text-warn-200">
                      {t('round.dead.late', 'كتبت «{typed}» ثمّ سُجّلت هلاكات اليوم قبل أن تحفظ، فلن يُرسل ما كتبته.', { typed: deadTypedText(row.flock, entry) })}
                    </p>
                    <div>
                      <Button variant="ghost" onClick={() => onChange({ ...entry, dead: '', dead1: '', dead2: '', dead3: '', dead4: '' })} data-action="round-dead-late-ok">
                        {t('round.dead.late_ok', 'حسناً')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {parts.length > 0 ? (
                  // قاعة مقسومة (0038، جواب المالك): خانة هلاكات لكلّ قسم، والفارغ صفر ما دام قسمٌ كُتب، والمجموع تحتها.
                  <div className="grid grid-cols-2 gap-3" data-action="round-dead-sections">
                    {parts.map((field, index) => (
                      <div key={field} className="flex min-w-0 flex-col gap-1">
                        {input(field, t('round.dead.part_label', 'هلاكات {section}', { section: sectionName(index) }))}
                        {errorFor(field)}
                      </div>
                    ))}
                  </div>
                ) : (
                  input('dead', t('round.dead.label', 'هلاكات اليوم'))
                )}
                {entry && parts.length > 0 && deadTyped(row.flock, entry) ? (
                  <p className="text-sm" data-action="round-dead-sum">
                    {t('round.dead.sum', 'مجموع هلاكات القاعة: {n}', {
                      n: fmtInt(parts.reduce((sum, field) => sum + (wholeCount(entry[field].trim() === '' ? '0' : entry[field].trim()) ?? 0), 0)),
                    })}
                  </p>
                ) : null}
                <p className="text-xs text-ink-muted">{t('round.dead.hint', 'تُدخل مرّة واحدة في اليوم، ثمّ تُقفل.')}</p>
              </>
            )}
            {errorFor('dead')}
          </section>
          {kind === 'layer' ? (
            <section className={SECTION_CLASS} data-action="round-eggs">
              <h3 className="font-semibold">{t('round.eggs.title', 'البيض')}</h3>
              {entry ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    {input('eggsTotal', t('round.eggs_total', 'البيض (المجموع)'))}
                    <p className="text-xs text-ink-muted" data-action="round-so-far" data-field="eggsTotal">
                      {t('round.so_far', 'اليوم حتى الآن: {n}', { n: soFarText(total, 'eggsTotal') })}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    {input('eggsBroken', t('round.eggs_broken', 'المكسور'))}
                    <p className="text-xs text-ink-muted" data-action="round-so-far" data-field="eggsBroken">
                      {t('round.so_far', 'اليوم حتى الآن: {n}', { n: soFarText(total, 'eggsBroken') })}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm" data-action="round-so-far" data-field="eggsTotal">
                  {t('round.so_far', 'اليوم حتى الآن: {n}', { n: soFarText(total, 'eggsTotal') })}
                </p>
              )}
              {errorFor('eggsTotal')}
              {errorFor('eggsBroken')}
            </section>
          ) : null}
        </div>
        <section className={SECTION_CLASS} data-action="round-feed">
          <h3 className="font-semibold">{t('round.feed.title', 'العلف')}</h3>
          {row.sent ? (
            // «أُرسل اليوم» من قراءة الجولة (يعمل بلا نت من نسخة الجهاز ليومها)، فوق بطاقات العلف.
            <div className="flex flex-col gap-1" data-action="round-feed-today">
              {/* «أُرسل اليوم» بسطوره (مراجعة 0036 R10): علف بالقطعة بلا وزن أو باللتر بلا كثافة سطرٌ بلا مجموع بالكيلو، لا «لم يُرسل». */}
              <p className="font-semibold">
                {row.sent.lines.length === 0
                  ? t('round.feed.none_today', 'لم يُرسل علف اليوم بعد.')
                  : row.sent.kg === null
                    ? t('round.feed.today_lines', 'أُرسل اليوم:')
                    : t('round.feed.today', 'أُرسل اليوم: {amount}', { amount: feedAmount(row.sent.kg, 'kg') })}
              </p>
              {row.sent.lines.length > 0 ? (
                <ul className="flex flex-col gap-0.5 text-sm text-ink-muted" data-action="round-feed-lines">
                  {/* المنقول من الوجبة السابقة يوم التسكين سطرٌ بعلامته (لا صرف من المخزن)، ومجموع اليوم فوقها من الخادم يعدّه مرّة. */}
                  {row.sent.lines.map((line) => (
                    <li key={`${line.carry ? 'carry' : 'sent'}|${line.itemId}`} data-carry={line.carry ? '1' : undefined}>
                      {line.carry
                        ? t('round.feed.line_carry', '«{item}»: {amount} (منقول من الوجبة السابقة)', { item: line.itemName, amount: feedAmount(line.qty, line.unit) })
                        : t('round.feed.line', '«{item}»: {amount}', { item: line.itemName, amount: feedAmount(line.qty, line.unit) })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {entry ? (
            <Suspense fallback={null}>
              <Feed flockId={row.flock.id} hall={label} items={feedItems} lastItemId={row.flock.lastFeedItemId} today={today} online={online} stamp={stamp} onSent={onFeedSent} />
            </Suspense>
          ) : null}
        </section>
        <section className={SECTION_CLASS} data-action="round-gas">
          <h3 className="font-semibold">{t('round.gas.title', 'الغاز (اختياري)')}</h3>
          {input('gas', t('round.gas.label', 'قناني أُرسلت الآن'))}
          <p className="text-sm" data-action="round-gas-today">
            {gas.unsure > 0
              ? // إضافة جوابها ضاع أو في الطريق لا تُعدّ (ربّما صارت في المحفوظ): جملة واحدة تقولها، لا «لم يُسجَّل غاز» و«منها ما ينتظر» معاً (مراجعة 0036 R8).
                t('round.gas.unsure', '{today}، ولم يُعرف بعد مصير إضافة من هذا الجهاز: {n}.', { today: gasToday, n: cylindersText(gas.unsure) })
              : gasToday}
          </p>
          {gas.pending && gas.unsure === 0 ? (
            <p className="text-xs text-ink-muted" data-action="round-gas-pending">
              {t('round.gas.pending', 'منها ما ينتظر الرفع من هذا الجهاز.')}
            </p>
          ) : null}
          {errorFor('gas')}
        </section>
      </div>
      {status ? (
        <p className={status === 'saved' ? 'text-sm text-brand-700 dark:text-brand-200' : 'text-sm text-warn-800 dark:text-warn-200'} data-status={status}>
          {statusText(status)}
        </p>
      ) : null}
    </div>
  );
}

/** ما يُرسل من خانات القاعة: الهلاكات قبل تسجيلها، والغاز، وبيض البيّاض. */
function sendable(row: RoundRow, entry: RoundEntry, kind: FlockKind): boolean {
  return (!row.total.deadEntered && deadTyped(row.flock, entry)) || typed(entry.gas) || (kind === 'layer' && (typed(entry.eggsTotal) || typed(entry.eggsBroken)));
}

/**
 * خانات قاعة حُفظت: ما بقي كما حُفظ يُفرغ (حُفظ، وحفظه ثانيةً يضيفه مرّتين)، وما كُتب فيها أثناء الرفع (والخانات مفتوحة) يبقى؛ وnull حين لا يبقى شيء.
 */
function afterSave(now: RoundEntry | undefined, saved: RoundEntry | undefined): RoundEntry | null {
  if (!now) return null;
  const left = { ...now };
  for (const field of ENTRY_FIELDS) if (now[field] === (saved?.[field] ?? '')) left[field] = '';
  return ENTRY_FIELDS.some((field) => typed(left[field])) ? left : null;
}

/** الزرّ يسمّي النتيجة: «احفظ الجولة لـ«قاعة 1»»، «لقاعتين»، «لـ3 قاعات»، «لـ11 قاعةً»، «لـ100 قاعة». */
function saveLabel(count: number, first: string): string {
  if (count === 0) return t('round.save', 'احفظ الجولة');
  if (count === 1) return t('round.save.one', 'احفظ الجولة لـ«{hall}»', { hall: first });
  if (count === 2) return t('round.save.two', 'احفظ الجولة لقاعتين');
  const n = fmtInt(count);
  const form = countForm(count);
  if (form === 'few') return t('round.save.few', 'احفظ الجولة لـ{n} قاعات', { n });
  if (form === 'many') return t('round.save.many', 'احفظ الجولة لـ{n} قاعةً', { n });
  return t('round.save.hundreds', 'احفظ الجولة لـ{n} قاعة', { n });
}

export default function RoundPage({ kind }: { kind: FlockKind }) {
  const session = useSession();
  const stamp = useStamp();
  const uploads = useStore(roundQueueStore);
  const state = useOverview(stamp);
  const queue = useQueue(stamp, uploads.seq);
  const online = useStore(onlineStore);
  const today = localDay();
  const role = session.status === 'ready' ? session.workspace.role : null;
  // الجولة لمن يحفظ يوم الفوج (منذ 0034 كلّ عضو فعّال)؛ وغيره يشوف أرقام اليوم بلا خانات ولا حفظ.
  const canSave = role !== null && can(role, 'flock_day.save');
  const [entries, setEntries] = useState<Record<string, RoundEntry>>({});
  const [errors, setErrors] = useState<Record<string, { field: EntryField; message: string }>>({});
  const [result, setResult] = useState<{ total: number; saved: number; others: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // التذكير وبطاقات العلف من حزمة القاعات باستيراد واحد لهذا الفتح؛ وفشله (بلا نت) تعيده بطاقات العلف مرّة حين يعود الاتصال (shared: FeedOffline).
  const [halls] = useState(roundLazies);
  const fields = useRef(new Map<string, HTMLInputElement>());
  // آخر قراءة تبقى معروضة أثناء القراءة من جديد (كلّ رفع جولات من أيّ شاشة وكلّ إرسال علف يعيد القراءة): البطاقات لا تُطوى.
  // والمحفوظة لهويّة القراءة وحدها: دخول حساب أو منشأة أخرى لا يعرض قاعات الأولى ولا يحفظ جولات لأفواجها.
  const key = stamp ? stampKey(stamp) : '';
  const [kept, setKept] = useState<{ owner: string; data: NonNullable<typeof state.data> } | null>(null);
  if (state.data !== null && (kept?.data !== state.data || kept.owner !== key)) setKept({ owner: key, data: state.data });
  const shown = state.data ?? (kept?.owner === key ? kept.data : null);
  // وفوقها ما حُفظ من هذا الجهاز في هذه الجلسة ولم تحمله (مراجعة 0036 R2): نتائج الرفع (الهلاكات والغاز) وأجوبة إرسال العلف، حتى تصل قراءة أحدث.
  const fed = useStore(fedStore);
  const runs = uploads.runs;
  const overview = useMemo(() => {
    if (!shown) return null;
    try {
      return parseOverview(withSaved(shown.json, key, shown.read, runs, fed));
    } catch { // swallow-ok: ما فوق القراءة لم يُقرأ (شكل غريب)؛ القراءة نفسها كما وصلت، والقراءة التالية تحمل المحفوظ
      return shown.overview;
    }
  }, [shown, key, runs, fed]);
  const rows = overview ? roundRows(overview, kind, today, queue.pending) : [];
  const names = new Map<string, string>();
  for (const site of overview?.sites ?? []) for (const hall of site.halls) if (hall.flock) names.set(hall.flock.id, hallLabel(hall.name));
  // قاعات هذه الجولة (نوعها) لروابط الرفّ إلى صفحة القاعة.
  const hallOf = new Map(rows.map((row) => [row.flock.id, row.hallId]));
  /** جواب إرسال علف حُفظ: يُعرض فوق القراءة وفي نسخة الجهاز حتى تصل قراءة بعده، والجولة تُقرأ من جديد. */
  const feedSent = (flockId: string) => (sent: FeedSent) => {
    if (stamp) {
      fedStore.set((list) => [...list, { ...sent.issue, key, flockId, day: sent.day.on, dayKg: sent.day.feedKg, mark: nextTick() }]);
      void patchKept(stamp).catch(() => {
        /* swallow-ok: نسخة الجهاز للفتح بلا نت؛ القراءة التالية تكتبها من الخادم */
      });
    }
    state.retry();
  };
  const mine = queue.pending.length;
  const reloadQueue = queue.reload;
  const entryOf = (row: RoundRow) => entries[row.flock.id] ?? EMPTY_ENTRY;
  const ready = rows.filter((row) => sendable(row, entryOf(row), kind));
  // كل كتابة لم تُحفظ تعلّم النافذة «وسخة»: التحديث والتعافي ما يعيدان تحميلها، وإغلاق التبويب يسأل أوّلاً.
  useDirtyForm(Object.values(entries).some((entry) => ENTRY_FIELDS.some((field) => typed(entry[field]))));

  // الاتصال رجع (أو الشاشة انفتحت بنت) وبالجهاز جولات تنتظر: ترتفع لحالها بالرافع الواحد، ونتائجها تجي من المخزن.
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  useEffect(() => {
    if (!online || !userId || !orgId || mine === 0) return;
    uploadRounds({ userId, orgId, displayName }, loadTransport).catch(() => {
      /* swallow-ok: الرفع التلقائي فشل (شبكة أو IndexedDB)؛ العمليات باقية بالجهاز وترتفع بالمحاولة الجاية أو بزرّ «أرسل الآن» */
    });
  }, [online, userId, orgId, displayName, mine]);

  /** Enter: الخانة نفسها في القاعة التالية التي فيها هذه الخانة (القاعة التي سُجّلت هلاكاتها بلا خانة هلاكات). */
  const moveNext = (field: EntryField, flockId: string) => {
    const at = rows.findIndex((row) => row.flock.id === flockId);
    for (const row of rows.slice(at + 1)) {
      const element = fields.current.get(`${field}:${row.flock.id}`);
      if (element) {
        element.focus();
        return;
      }
    }
  };
  const register = (flockId: string) => (field: EntryField) => (element: HTMLInputElement | null) => {
    if (element) fields.current.set(`${field}:${flockId}`, element);
    else fields.current.delete(`${field}:${flockId}`);
  };

  const save = async () => {
    if (!stamp || !canSave) return;
    setBusy(true);
    setFailure(null);
    const nextErrors: typeof errors = {};
    // الخانات كما حُفظت: بعد الرفع تُفرغ خانات القاعة المحفوظة التي بقيت كما كانت، وما كُتب أثناء الرفع (والخانات مفتوحة) يبقى.
    const typedNow = entries;
    // عمليات القاعات كلّها، ولكلّ قاعة مداها فيها: تُكتب بمعاملة واحدة بعد الفحص (مراجعة 0036 R3).
    const inputs: EnqueueInput[] = [];
    const sent: { row: RoundRow; from: number }[] = [];
    try {
      const recordedAt = new Date().toISOString();
      for (const row of ready) {
        const entry = entryOf(row);
        // قاعة مقسومة (0038): هلاكات الأقسام أوّلاً بخاناتها، ومجموعها هلاكات اليوم يُفحص كما يُفحص الرقم الواحد.
        const split = row.total.deadEntered ? null : readParts(row.flock, entry);
        if (split !== null && 'field' in split) {
          nextErrors[row.flock.id] = { field: split.field, message: split.message };
          continue;
        }
        const deadText = row.total.deadEntered ? '' : split ? String(split.parts.reduce((sum, part) => sum + part, 0)) : partFields(row.flock).length > 0 ? '' : entry.dead; // number-ok: مجموع هلاكات الأقسام نصّاً لفحص الجولة نفسه، لا عرض
        // الهلاكات قبل تسجيلها وحدها، والفحص على اليوم بعدها كما يفحصه الخادم (لا تتجاوز الحيّ بداية اليوم)، والبيض كما كان (0032).
        const read = readVisit(
          { dead: deadText, culled: '', feedKg: '', eggsTotal: kind === 'layer' ? entry.eggsTotal : '', eggsBroken: kind === 'layer' ? entry.eggsBroken : '' },
          { kind, liveStart: row.liveStart, totals: { dead: row.total.dead, culled: row.total.culled, eggsTotal: row.total.eggsTotal } },
        );
        if ('error' in read) {
          const field: EntryField = read.field === 'eggsTotal' || read.field === 'eggsBroken' ? read.field : 'dead';
          nextErrors[row.flock.id] = {
            field,
            message: read.error === 'live_negative' ? t('round.error.dead_over_live', 'الهلاكات أكثر من الطيور الحيّة بداية اليوم ({live}).', { live: fmtInt(row.liveStart) }) : errorText(read.error, row.liveStart),
          };
          continue;
        }
        const gasRead = readGasAdd(entry.gas, row.gas.cylinders);
        if ('error' in gasRead) {
          nextErrors[row.flock.id] = { field: 'gas', message: gasErrorText(gasRead.error, row.gas.cylinders) };
          continue;
        }
        sent.push({ row, from: inputs.length });
        const base = { flockId: row.flock.id, day: today, baseVersion: null } as const;
        if (read.values.dead !== null) inputs.push({ ...base, fn: 'set_flock_dead', payload: split ? { dead: read.values.dead, parts: split.parts } : { dead: read.values.dead } });
        if (gasRead.add !== null) inputs.push({ ...base, fn: 'add_flock_gas', payload: { add: gasRead.add } });
        if (read.values.eggs_total !== null || read.values.eggs_broken !== null) {
          // البيض زيارة تُضاف (بمعرّف من الجهاز، بلا نسخة)، بلا هلاكات: تلك في عمليتها.
          inputs.push({
            ...base,
            fn: 'save_flock_visit',
            payload: { visitId: crypto.randomUUID(), recordedAt, dead: null, culled: null, feed_kg: null, eggs_total: read.values.eggs_total, eggs_cracked: null, eggs_broken: read.values.eggs_broken, note: null, void: false },
          });
        }
      }
      setErrors(nextErrors);
      // كلّها أو لا شيء: فشل كتابة في منتصفها (التخزين ممتلئ) لا يُبقي قاعات في الطابور وخاناتها مكتوبة، فلا تُرسل ثانيةً بالضغطة التالية.
      const ops = inputs.length > 0 ? await saveRounds(await openOutbox(), stamp, inputs) : [];
      const results = online && ops.length > 0 ? await uploadRounds(stamp, loadTransport).catch(() => []) : []; /* swallow-ok: الرفع فشل (IndexedDB)؛ العمليات باقية بالجهاز وصفوفها «محفوظة على هذا الجهاز» */
      // بلا نت: عدّاد الرأس («جولاتك المنتظرة») يتحدّث هسه، مو بالرفع الجاي.
      if (!online && ops.length > 0) {
        void refreshRoundQueue(stamp).catch(() => {
          /* swallow-ok: عدّ الطابور تعذّر؛ الرأس يتحدّث بالرفع الجاي */
        });
      }
      const outcome = new Map<string, SendResult>();
      for (const entry of results) outcome.set(entry.opId, entry.result);
      // لكلّ قاعة أسوأ نتائج عملياتها: الهلاكات المردودة لا يخفيها غاز حُفظ معها.
      const statuses = sent.map(({ row, from }, index) => ({ row, status: worst(ops.slice(from, sent[index + 1]?.from ?? ops.length).map((op) => statusOf(op ? outcome.get(op.id) : null))) ?? 'device' }));
      const fine = (status: RowStatus) => status === 'saved' || status === 'device';
      setEntries((current) => {
        const next = { ...current };
        for (const { row } of sent) {
          const flockId = row.flock.id;
          const left = afterSave(current[flockId], typedNow[flockId]);
          if (left) next[flockId] = left;
          else delete next[flockId];
        }
        // خانات فوج ما عاد بالجولة (أُغلق أو خرج من النطاق) ما تبقى تعلّم النافذة.
        for (const flockId of Object.keys(next)) if (!rows.some((row) => row.flock.id === flockId)) delete next[flockId];
        return next;
      });
      const others = [...statuses.filter(({ status }) => !fine(status)).map(({ row }) => hallLabel(row.hallName)), ...Object.keys(nextErrors).map((flockId) => names.get(flockId) ?? '')];
      setResult({ total: sent.length + Object.keys(nextErrors).length, saved: statuses.filter(({ status }) => fine(status)).length, others });
      // نتائج هذا الحفظ قيلت بملخّصه، فتنبيه «رُدّت» ما يكرّرها.
      ackRuns(stampKey(stamp), roundQueueStore.get().seq);
      reloadQueue();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  // نتائج رفع ما قيلت بعد (رفع الخلفية لمّا رجع الاتصال، أو من شاشة ثانية): رُدّت أو تحتاج مراجعة، بأيّ يوم. المقول (بملخّص الحفظ أو بـ«حسناً») بالمخزن، فما
  // يرجع بكل فتح للشاشة.
  const seen = uploads.acked[key] ?? 0;
  const returnedRuns = uploads.runs.filter((run) => run.key === key && run.seq > seen);
  const parkedNames: string[] = [];
  const reviewNames: string[] = [];
  for (const run of returnedRuns) {
    for (const entry of run.results) {
      const label = t('round.uploads.item', '{hall} ({day})', { hall: names.get(entry.flockId) ?? t('round.review.flock', 'فوج'), day: fmtDay(entry.day) });
      if (entry.result.kind === 'parked' && !parkedNames.includes(label)) parkedNames.push(label);
      if (statusOf(entry.result) === 'review' && !reviewNames.includes(label)) reviewNames.push(label);
    }
  }

  const base = farmPath(kind);
  const separator = t('list.separator', '، ');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('round.title', 'الجولة اليومية — {farm}', { farm: farmTitle(kind) })}
        subtitle={t('round.subtitle.once', 'جولة يوم {day}: الهلاكات مرّة في اليوم، والعلف يُرسل من بطاقة القاعة، والغاز يُضاف إلى مجموع اليوم.', { day: fmtDay(today) })}
        actions={
          <Link to={base} className={LINK_CLASS}>
            {t('round.back', 'إلى الحقول')}
          </Link>
        }
      />
      <Suspense fallback={null}>
        <halls.Reminders kind={kind} />
      </Suspense>
      {!canSave && session.status === 'ready' ? (
        <Notice tone="info" title={t('round.read_only', 'تعرض هذه الصفحة أرقام اليوم فقط.')}>
          {t('round.read_only.detail', 'لا يعدّل حسابك أرقام الجولة الآن؛ حدّث الصفحة إن كان هذا غير متوقّع.')}
        </Notice>
      ) : null}
      {canSave && !online ? <Notice tone="warning" title={t('round.offline.once', 'بلا اتصال: الهلاكات والغاز والبيض تُحفظ على هذا الجهاز وتُرسل حين يعود الاتصال، والعلف ينتظر الاتصال.')} /> : null}
      {mine > 0 ? (
        <Notice
          tone="info"
          title={mine === 1 ? t('round.pending.one', 'جولة واحدة على هذا الجهاز تنتظر الإرسال.') : mine === 2 ? t('round.pending.two', 'جولتان على هذا الجهاز تنتظران الإرسال.') : t('round.pending.n', 'جولات على هذا الجهاز تنتظر الإرسال: {n}.', { n: fmtInt(mine) })}
          action={
            online && stamp ? (
              <Button size="sm" variant="secondary" icon={<Send aria-hidden="true" className="size-4" />} onClick={() => void uploadRounds(stamp, loadTransport).then(reloadQueue, setFailure)} data-action="round-send">
                {t('round.send', 'أرسل الآن')}
              </Button>
            ) : (
              <CloudOff aria-hidden="true" className="size-5" />
            )
          }
        />
      ) : null}
      {parkedNames.length + reviewNames.length > 0 ? (
        <Notice
          tone="warning"
          title={t('round.uploads.title', 'جولات أُرسلت من هذا الجهاز ولم تُحفظ كما هي')}
          action={
            <Button size="sm" variant="secondary" onClick={() => ackRuns(key, uploads.seq)} data-action="round-uploads-seen">
              {t('round.uploads.seen', 'حسناً')}
            </Button>
          }
        >
          {parkedNames.length > 0 ? <p>{t('round.uploads.parked', 'رُدّت وبقيت في «جولات تحتاج مراجعة»: {halls}.', { halls: parkedNames.join(separator) })}</p> : null}
          {reviewNames.length > 0 ? <p>{t('round.uploads.review', 'تحتاج مراجعة في «جولات تحتاج مراجعة»: {halls}.', { halls: reviewNames.join(separator) })}</p> : null}
        </Notice>
      ) : null}
      {state.error instanceof NotConnectedError ? (
        <Notice tone="info" title={describeError(state.error).title} />
      ) : state.error ? (
        <LoadFailed what={t('round.what', 'أفواج الجولة')} error={state.error} onRetry={state.retry} />
      ) : null}
      {shown?.savedAt ? <Notice tone="warning" title={t('farm.offline', 'بلا اتصال: هذه آخر نسخة محفوظة على الجهاز.')} /> : null}
      {overview && rows.length === 0 ? <Notice tone="info" title={t('round.empty', 'لا أفواج نشطة اليوم.')} /> : null}
      {result ? (
        <Notice tone={result.others.length === 0 ? 'info' : 'warning'} title={result.total > 0 ? t('round.result', 'حُفظ {saved} من {total}', { saved: fmtInt(result.saved), total: fmtInt(result.total) }) : t('round.result.none.once', 'لم يُحفظ شيء.')}>
          {result.others.length > 0 ? <p>{t('round.result.check', 'راجع: {halls}', { halls: result.others.filter(Boolean).join(separator) })}</p> : null}
        </Notice>
      ) : null}
      {failure ? (
        <Notice tone="danger" title={describeError(failure).title}>
          {describeError(failure).detail}
        </Notice>
      ) : null}
      {rows.map((row) => (
        <RoundCard
          key={row.flock.id}
          row={row}
          kind={kind}
          today={today}
          entry={canSave ? entryOf(row) : null}
          onChange={(next) => setEntries((current) => ({ ...current, [row.flock.id]: next }))}
          error={errors[row.flock.id] ?? null}
          status={canSave && ENTRY_FIELDS.some((field) => typed(entryOf(row)[field])) ? null : rowStatus(row, queue.pending, uploads.runs, key, today)}
          online={online}
          stamp={canSave ? stamp : null}
          feedItems={overview?.feedItems ?? []}
          onFeedSent={feedSent(row.flock.id)}
          Feed={halls.Feed}
          register={register(row.flock.id)}
          onEnter={(field) => moveNext(field, row.flock.id)}
        />
      ))}
      {rows.length > 0 && canSave ? (
        <div className="round-save sticky flex justify-end">
          <Button size="lg" onClick={() => void save()} busy={busy} disabled={ready.length === 0 || !stamp} data-action="round-save">
            {saveLabel(ready.length, ready[0] ? hallLabel(ready[0].hallName) : '')}
          </Button>
        </div>
      ) : null}
      <ReviewShelf
        entries={queue.review}
        names={names}
        halls={hallOf}
        kind={kind}
        onRemove={async (entry) => {
          if (!stamp) return;
          try {
            await removeReview(await openOutbox(), stamp, entry.id);
          } catch (error) {
            setFailure(error);
          }
          reloadQueue();
        }}
      />
    </div>
  );
}
