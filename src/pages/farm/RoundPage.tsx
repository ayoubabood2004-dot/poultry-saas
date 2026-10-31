import { CloudOff, Send } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { localDay } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { EMPTY_ROUND, emptyPayload, readRound, type FlockKind, type RoundError, type RoundText } from '../../domain/flocks';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtMilli } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { openOutbox, pendingOps, reviewEntries, saveRound, type FlockDayPayload, type OutboxOp, type ReviewEntry, type SendResult, type Stamp } from '../../lib/outbox';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { flockDayTransport, type FlockSummary, type FlocksOverview } from '../../lib/repo/flocks';
import { ackRuns, refreshRoundQueue, roundQueueStore, stampKey, uploadRounds, type RoundRun } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { farmPath, farmTitle, useOverview, useStamp } from './shared';

// الجولة اليومية (FOUNDATION ٧٨٢–٧٨٣ و٨١٦): شاشة وحدة لكل أفواج النطاق النشطة بخانات اليوم (نافق، مستبعد، علف، ماء، وللبيّاض
// البيض والمكسور)، وزرّ حفظ واحد يكتب عملية لكل (فوج، يوم) بالطابور (saveRound) ثم يرفعها إذا بنت (الرافع الواحد بـroundUploads).
// بلا نت تنحفظ بالجهاز وترتفع لمّا يرجع الاتصال (من أيّ شاشة: القشرة ترفعها). الخانات مجموع اليوم: الفارغة «بلا تغيير»، والصفر صفر.
// التعديل يحفظ لقطة الصفّ ونسخته لحظة أوّل كتابة: الخانة اللي ما تغيّرت عن اللقطة «بلا تغيير»، والجولة ترتفع بنسخة اللقطة، فحفظ
// أحدث من جهاز آخر يرجع stale_day لرفّ المراجعة بالنسختين ولا يُكتب فوقه (FOUNDATION ٢١٩). ونتيجة كل رفع (من هنا أو من الخلفية)
// تظهر على صفّها. والجولة لمن يحفظ يوم الفوج بس (flock_day.save)؛ غيره يشوف أرقام اليوم بلا خانات.

type RowStatus = 'saved' | 'device' | 'parked' | 'review' | 'held';

interface RoundRow {
  flock: FlockSummary;
  hallName: string;
  siteName: string;
  /** الحيّ بداية اليوم. */
  liveStart: number;
  baseVersion: number | null;
  saved: { dead: number | null; culled: number | null; eggsTotal: number | null; eggsBroken: number | null };
  text: RoundText;
}

/** تعديل صفّ لم يُحفظ بعد: لقطة المعروض ونسخة صفّ اليوم لحظة أوّل كتابة فيه. */
interface RowEdit {
  text: RoundText;
  /** المعروض لحظة أوّل كتابة: الخانة اللي ما تغيّرت عنه «بلا تغيير» (null بالحمولة). */
  from: RoundText;
  /** نسخة صفّ اليوم لحظة أوّل كتابة: الجولة ترتفع بها (p_base_version = النسخة اللي شافها المستخدم). */
  base: number | null;
  /** آخر رفع قبل أوّل كتابة (roundQueueStore.seq): جولة سابقة لهذا اليوم رجعت بعده تعيد بناء التعديل. */
  seq: number;
}

const FIELDS = Object.keys(EMPTY_ROUND) as (keyof RoundText)[];
const loadTransport = async () => flockDayTransport;

const amountText = (value: bigint | string | null | undefined): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'bigint') return decimalText(value, 3).replace(/\.?0+$/, '');
  return value.replace(/\.?0+$/, '');
};
const countText = (value: number | null | undefined): string => (value === null || value === undefined ? '' : String(value));

/** صفوف الجولة: كل فوج نشط بالنوع مسكّن باليوم أو قبله، بقيم اليوم المحفوظة وفوكها المنتظرة بالجهاز. */
function roundRows(overview: FlocksOverview, kind: FlockKind, today: string, pending: readonly OutboxOp[]): RoundRow[] {
  const rows: RoundRow[] = [];
  for (const site of overview.sites) {
    if (site.kind !== kind) continue;
    for (const hall of site.halls) {
      const flock = hall.flock;
      if (!flock || flock.status !== 'active' || flock.placedOn === null || flock.placedOn > today) continue;
      const fresh = overview.today === today;
      const row = fresh ? flock.today : null;
      // نسخة أقدم من اليوم (بلا نت من البارحة): الحيّ آخر ذاك اليوم ناقص فرق جولاته المنتظرة على المحفوظ.
      let liveStart = fresh ? flock.liveStartToday : flock.live;
      if (!fresh) {
        for (const op of pending) {
          if (op.flockId !== flock.id || op.day !== overview.today) continue;
          const was = (flock.today?.dead ?? 0) + (flock.today?.culled ?? 0);
          liveStart -= (op.payload.dead ?? flock.today?.dead ?? 0) + (op.payload.culled ?? flock.today?.culled ?? 0) - was;
        }
      }
      const mine = pending.filter((op) => op.flockId === flock.id && op.day === today);
      const merged: FlockDayPayload = {};
      for (const op of mine) for (const [field, value] of Object.entries(op.payload)) if (value !== null && value !== undefined) Object.assign(merged, { [field]: value });
      const saved = {
        dead: merged.dead ?? row?.dead ?? null,
        culled: merged.culled ?? row?.culled ?? null,
        eggsTotal: merged.eggs_total ?? row?.eggsTotal ?? null,
        eggsBroken: merged.eggs_broken ?? row?.eggsBroken ?? null,
      };
      rows.push({
        flock,
        hallName: hall.name,
        siteName: site.name,
        liveStart,
        baseVersion: row?.version ?? null,
        saved,
        text: {
          dead: countText(saved.dead),
          culled: countText(saved.culled),
          feedKg: amountText(merged.feed_kg ?? row?.feedKg),
          waterL: amountText(merged.water_l ?? row?.waterL),
          eggsTotal: countText(saved.eggsTotal),
          eggsBroken: countText(saved.eggsBroken),
        },
      });
    }
  }
  return rows;
}

/** أحدث نتيجة رفع ليوم الفوج بهذه الجلسة (كل الرفوع: من هنا أو من القشرة). */
function latestResult(runs: readonly RoundRun[], key: string, flockId: string, day: string): SendResult | null {
  let found: SendResult | null = null;
  for (const run of runs) {
    if (run.key !== key) continue;
    for (const entry of run.results) if (entry.flockId === flockId && entry.day === day) found = entry.result;
  }
  return found;
}

/** جولة سابقة لهذا اليوم رجعت stale_day أو parked بعد أوّل كتابة بالصفّ (بعد الرفع after). */
function returnedSince(runs: readonly RoundRun[], key: string, flockId: string, day: string, after: number): 'stale_day' | 'parked' | null {
  let kind: 'stale_day' | 'parked' | null = null;
  for (const run of runs) {
    if (run.key !== key || run.seq <= after) continue;
    for (const entry of run.results) {
      if (entry.flockId === flockId && entry.day === day && (entry.result.kind === 'stale_day' || entry.result.kind === 'parked')) kind = entry.result.kind;
    }
  }
  return kind;
}

/**
 * التعديل كما يُعرض ويُحفظ. إذا رجعت جولة سابقة لهذا اليوم بعد أوّل كتابة (حُفظ اليوم من جهاز آخر، أو رُدّت للمدير)، ينبني من جديد
 * فوق آخر أرقام الصفّ ونسخته: الخانات اللي غيّرها المستخدم بس، لا قيم الجولة المردودة (والصفّ يقول ذلك).
 */
function liveEdit(edit: RowEdit, row: RoundRow, returned: 'stale_day' | 'parked' | null): RowEdit {
  if (!returned) return edit;
  const text = { ...row.text };
  for (const field of FIELDS) if (edit.text[field] !== edit.from[field]) text[field] = edit.text[field];
  return { text, from: row.text, base: row.baseVersion, seq: edit.seq };
}

function errorText(error: RoundError, liveStart: number): string {
  switch (error) {
    case 'bad_count':
      return t('round.error.bad_count', 'اكتب عدداً صحيحاً: صفر أو أكثر.');
    case 'bad_amount':
      return t('round.error.bad_amount', 'اكتب كمية صحيحة بثلاث مراتب عشرية على الأكثر، مثل 1250.5.');
    case 'live_negative':
      return t('round.error.live_negative', 'النافق والمستبعد أكثر من الطيور الحيّة بداية اليوم ({live}).', { live: fmtInt(liveStart) });
    case 'eggs_need_total':
      return t('round.error.eggs_need_total', 'اكتب مجموع البيض قبل المكسور.');
    case 'eggs_over_total':
      return t('round.error.eggs_over_total', 'المكسور أكثر من مجموع البيض.');
    case 'eggs_over_live':
      return t('round.error.eggs_over_live', 'البيض أكثر من الدجاج الحيّ بداية اليوم ({live})، والنسبة فوق 100% غلط إدخال.', { live: fmtInt(liveStart) });
    case 'eggs_on_broiler':
      return t('round.error.eggs_on_broiler', 'لا بيض لفوج لحم.');
  }
}

function statusText(status: RowStatus): string {
  switch (status) {
    case 'saved':
      return t('round.status.saved', 'حُفظت');
    case 'device':
      return t('round.status.device', 'محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال');
    case 'parked':
      return t('round.status.parked', 'رُدّت إلى المدير: أُغلق الفوج، أو خرج من نطاقك، أو صار التاريخ قديماً أو داخل فترة مقفلة');
    case 'review':
      return t('round.status.review', 'لم تُحفظ: راجعها في «جولات تحتاج مراجعة» أدناه');
    case 'held':
      return t('round.status.held', 'تنتظر: ادخل من جديد لتُرسل');
  }
}

const statusOf = (result: SendResult | undefined | null): RowStatus => {
  if (!result) return 'device';
  if (result.kind === 'saved') return 'saved';
  if (result.kind === 'parked') return 'parked';
  if (result.kind === 'stale_day' || result.kind === 'rejected') return 'review';
  return 'held';
};

/** حالة الصفّ: عملية منتظرة بالجهاز أوّلاً، وإلا آخر نتيجة رفع ليومه بالجلسة. */
function rowStatus(row: RoundRow, pending: readonly OutboxOp[], runs: readonly RoundRun[], key: string, today: string): RowStatus | null {
  const op = pending.find((entry) => entry.flockId === row.flock.id && entry.day === today);
  if (op) return op.state === 'held_identity' || op.state === 'held_subscription' ? 'held' : 'device';
  const result = latestResult(runs, key, row.flock.id, today);
  return result ? statusOf(result) : null;
}

/** عمليات الجهاز ورفّ المراجعة للداخل، ومن جديد بعد كل رفع (uploads). */
function useQueue(stamp: Stamp | null, uploads: number) {
  const [state, setState] = useState<{ key: string; pending: OutboxOp[]; review: ReviewEntry[] } | null>(null);
  const [version, setVersion] = useState(0);
  const key = stamp ? `${stamp.userId}:${stamp.orgId}` : '';
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  useEffect(() => {
    if (!userId || !orgId) return;
    let cancelled = false;
    const owner = { userId, orgId, displayName };
    openOutbox()
      .then(async (db) => ({ pending: await pendingOps(db, owner), review: await reviewEntries(db, owner) }))
      .then(
        ({ pending, review }) => {
          if (!cancelled) setState({ key: `${userId}:${orgId}`, pending, review });
        },
        () => {
          /* swallow-ok: الطابور ما انقرا (IndexedDB ممنوع)؛ الجولة تعرض قيم الخادم والحفظ نفسه يبلّغ بفشله */
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, displayName, version, uploads]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  const current = state?.key === key ? state : null;
  return { pending: current?.pending ?? [], review: current?.review ?? [], loaded: current !== null, reload };
}

function ReviewShelf({ entries, names }: { entries: readonly ReviewEntry[]; names: ReadonlyMap<string, string> }) {
  if (entries.length === 0) return null;
  const fields: { key: keyof FlockDayPayload; label: string; amount?: boolean }[] = [
    { key: 'dead', label: t('round.dead', 'النافق') },
    { key: 'culled', label: t('round.culled', 'المستبعد') },
    { key: 'feed_kg', label: t('round.feed', 'العلف (كغم)'), amount: true },
    { key: 'water_l', label: t('round.water', 'الماء (لتر)'), amount: true },
    { key: 'eggs_total', label: t('round.eggs_total', 'البيض (المجموع)') },
    { key: 'eggs_broken', label: t('round.eggs_broken', 'المكسور') },
  ];
  const shown = (value: unknown, amount?: boolean): string => {
    if (value === null || value === undefined) return '—';
    if (amount && typeof value === 'string') {
      const parsed = parseDecimal(value, 3);
      return parsed ? fmtMilli(toScale(parsed, 3)) : '—';
    }
    return typeof value === 'number' && Number.isInteger(value) ? fmtInt(value) : '—';
  };
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('round.review.title', 'جولات تحتاج مراجعة')}</h2>
      <p className="text-sm text-ink-muted">{t('round.review.hint', 'لم يقبلها الخادم كما هي. تبقى هنا على هذا الجهاز ولا تُحذف؛ أعد إدخال ما تراه صحيحاً في الجولة.')}</p>
      {entries.map((entry) => {
        const server = entry.server && typeof entry.server === 'object' ? (entry.server as Record<string, unknown>) : null;
        const rows = fields.filter((field) => entry.op.payload[field.key] !== null && entry.op.payload[field.key] !== undefined);
        return (
          <div key={entry.id} className="card flex flex-col gap-3 p-4" data-review={entry.id}>
            <p className="font-semibold">
              {names.get(entry.op.flockId) ?? t('round.review.flock', 'فوج')} — <bdi dir="ltr">{fmtDay(entry.op.day)}</bdi>
            </p>
            {/* الرفض بلا تلميح (رمز خادم مثل PGRST202) بجملة فصيحة، مو الرمز وحده. */}
            <p className="text-sm">{entry.reason === 'stale_day' ? t('round.review.stale', 'حُفظ هذا اليوم من جهاز آخر قبل أن تصل جولتك، فلم تُكتب فوقه.') : describeError(new RejectedError(entry.reason, entry.hint)).detail}</p>
            <DataTable
              caption={t('round.review.table', 'جولتك والمحفوظ في الخادم')}
              columns={[
                { key: 'field', header: t('round.review.field', 'الخانة'), cell: (field) => field.label },
                { key: 'mine', header: t('round.review.mine', 'جولتك'), kind: 'number', cell: (field) => <Num>{shown(entry.op.payload[field.key], field.amount)}</Num> },
                { key: 'server', header: t('round.review.server', 'المحفوظ في الخادم'), kind: 'number', cell: (field) => <Num>{shown(server?.[field.key], field.amount)}</Num> },
              ]}
              rows={rows}
              rowKey={(field) => field.key}
              empty={t('round.review.empty', 'بلا خانات.')}
            />
          </div>
        );
      })}
    </section>
  );
}

interface CardProps {
  row: RoundRow;
  kind: FlockKind;
  /** null = قراءة بس (بلا flock_day.save). */
  text: RoundText | null;
  onChange: (text: RoundText) => void;
  error: { field: keyof RoundText; message: string } | null;
  status: RowStatus | null;
  returned: 'stale_day' | 'parked' | null;
}

function RoundCard({ row, kind, text, onChange, error, status, returned }: CardProps) {
  const id = useId();
  const input = (field: keyof RoundText, label: string, decimal: boolean) =>
    text ? (
      <div key={field} className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${id}-${field}`} className="text-sm font-medium">
          {label}
        </label>
        <input
          id={`${id}-${field}`}
          className="input tabular-nums"
          dir="ltr"
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          aria-invalid={error?.field === field || undefined}
          value={text[field]}
          onChange={(event) => onChange({ ...text, [field]: event.target.value })}
        />
      </div>
    ) : null;
  const today = row.flock.today;
  const value = (field: keyof RoundText): string => {
    const shown = { dead: row.saved.dead, culled: row.saved.culled, eggsTotal: row.saved.eggsTotal, eggsBroken: row.saved.eggsBroken };
    if (field === 'feedKg') return today?.feedKg !== null && today?.feedKg !== undefined ? fmtMilli(today.feedKg) : '—';
    if (field === 'waterL') return today?.waterL !== null && today?.waterL !== undefined ? fmtMilli(today.waterL) : '—';
    const count = shown[field];
    return count === null ? '—' : fmtInt(count);
  };
  const fields: [keyof RoundText, string, boolean][] = [
    ['dead', t('round.dead', 'النافق'), false],
    ['culled', t('round.culled', 'المستبعد'), false],
    ['feedKg', t('round.feed', 'العلف (كغم)'), true],
    ['waterL', t('round.water', 'الماء (لتر)'), true],
    ...(kind === 'layer'
      ? ([
          ['eggsTotal', t('round.eggs_total', 'البيض (المجموع)'), false],
          ['eggsBroken', t('round.eggs_broken', 'المكسور'), false],
        ] as [keyof RoundText, string, boolean][])
      : []),
  ];
  return (
    <div className="card flex flex-col gap-3 p-4" data-flock={row.flock.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {row.hallName} <span className="text-sm font-normal text-ink-muted">— {row.siteName}</span>
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
      </div>
      {text ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{fields.map(([field, label, decimal]) => input(field, label, decimal))}</div>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fields.map(([field, label]) => (
            <div key={field} className="min-w-0">
              <dt className="truncate text-sm text-ink-muted">{label}</dt>
              <dd dir="ltr" className="text-end font-semibold tabular-nums">
                {value(field)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {returned ? (
        <p role="status" className="text-sm text-warn-800 dark:text-warn-200" data-returned={returned}>
          {returned === 'stale_day'
            ? t('round.rebased.stale', 'حُفظ هذا اليوم من جهاز آخر بعد أن بدأت التعديل، فلم تُكتب جولتك السابقة فوقه. تعديلاتك غير المحفوظة باقية فوق الأرقام الجديدة؛ راجعها ثم احفظ.')
            : t('round.rebased.parked', 'رُدّت جولتك السابقة لهذا اليوم إلى المدير. تعديلاتك غير المحفوظة باقية فوق الأرقام الحالية؛ راجعها قبل الحفظ.')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
          {error.message}
        </p>
      ) : status ? (
        <p className={status === 'saved' ? 'text-sm text-brand-700 dark:text-brand-200' : 'text-sm text-warn-800 dark:text-warn-200'} data-status={status}>
          {statusText(status)}
        </p>
      ) : null}
    </div>
  );
}

export default function RoundPage({ kind }: { kind: FlockKind }) {
  const session = useSession();
  const stamp = useStamp();
  const uploads = useStore(roundQueueStore);
  const state = useOverview(stamp);
  const queue = useQueue(stamp, uploads.seq);
  const online = useStore(onlineStore);
  const today = localDay();
  // الجولة لمن يحفظ يوم الفوج (عامل القاعة والمدير والمالك)؛ المشاهد والمحاسب وغيرهما يشوفون أرقام اليوم بلا خانات ولا حفظ.
  const canSave = session.status === 'ready' && can(session.workspace.role, 'flock_day.save');
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [errors, setErrors] = useState<Record<string, { field: keyof RoundText; message: string }>>({});
  const [result, setResult] = useState<{ total: number; saved: number; others: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const overview = state.data?.overview ?? null;
  const rows = overview ? roundRows(overview, kind, today, queue.pending) : [];
  const key = stamp ? stampKey(stamp) : '';
  const names = new Map<string, string>();
  for (const site of overview?.sites ?? []) for (const hall of site.halls) if (hall.flock) names.set(hall.flock.id, hall.name);
  const mine = queue.pending.length;
  const reloadQueue = queue.reload;
  // كل كتابة لم تُحفظ تعلّم النافذة «وسخة»: التحديث والتعافي ما يعيدان تحميلها، وإغلاق التبويب يسأل أوّلاً.
  useDirtyForm(Object.keys(edits).length > 0);

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

  const save = async () => {
    if (!stamp || !canSave) return;
    setBusy(true);
    setFailure(null);
    const nextErrors: typeof errors = {};
    const sent: RoundRow[] = [];
    const done: string[] = [];
    try {
      const db = await openOutbox();
      for (const row of rows) {
        const stored = edits[row.flock.id];
        if (!stored) continue;
        const edit = liveEdit(stored, row, returnedSince(uploads.runs, key, row.flock.id, today, stored.seq));
        // الخانة اللي ما تغيّرت عن لقطة أوّل كتابة «بلا تغيير» (null)، حتى ما تدوس حفظاً أحدث بقيمتها القديمة.
        const changed: RoundText = { ...EMPTY_ROUND };
        for (const field of FIELDS) if (edit.text[field] !== edit.from[field]) changed[field] = edit.text[field];
        const read = readRound(changed, { kind, liveStart: row.liveStart, saved: row.saved });
        if ('error' in read) {
          nextErrors[row.flock.id] = { field: read.field, message: errorText(read.error, row.liveStart) };
          continue;
        }
        done.push(row.flock.id);
        if (emptyPayload(read.payload)) continue;
        // نسخة اللقطة مو نسخة آخر قراءة: حفظ أحدث من جهاز آخر بعد أوّل كتابة يرجع stale_day.
        await saveRound(db, stamp, { fn: 'save_flock_day', flockId: row.flock.id, day: today, payload: read.payload, baseVersion: edit.base });
        sent.push(row);
      }
      const results = online && sent.length > 0 ? await uploadRounds(stamp, loadTransport).catch(() => []) : []; /* swallow-ok: الرفع فشل (IndexedDB)؛ العمليات باقية بالجهاز وصفوفها «محفوظة على هذا الجهاز» */
      // بلا نت: عدّاد الرأس («جولاتك المنتظرة») يتحدّث هسه، مو بالرفع الجاي.
      if (!online && sent.length > 0) {
        void refreshRoundQueue(stamp).catch(() => {
          /* swallow-ok: عدّ الطابور تعذّر؛ الرأس يتحدّث بالرفع الجاي */
        });
      }
      const outcome = new Map<string, SendResult>();
      for (const entry of results) if (entry.day === today) outcome.set(entry.flockId, entry.result);
      const statuses = new Map(sent.map((row) => [row.flock.id, statusOf(outcome.get(row.flock.id))]));
      setErrors(nextErrors);
      setEdits((current) => {
        const next = { ...current };
        for (const flockId of done) delete next[flockId];
        // تعديل فوج ما عاد بالجولة (أُغلق أو خرج من النطاق) ما يبقى يعلّم النافذة.
        for (const flockId of Object.keys(next)) if (!rows.some((row) => row.flock.id === flockId)) delete next[flockId];
        return next;
      });
      const others = [...sent.filter((row) => statuses.get(row.flock.id) !== 'saved' && statuses.get(row.flock.id) !== 'device').map((row) => row.hallName), ...Object.keys(nextErrors).map((flockId) => names.get(flockId) ?? '')];
      const total = sent.length + Object.keys(nextErrors).length;
      setResult(total > 0 ? { total, saved: sent.filter((row) => statuses.get(row.flock.id) === 'saved' || statuses.get(row.flock.id) === 'device').length, others } : null);
      // نتائج هذا الحفظ قيلت بملخّصه، فتنبيه «رُدّت» ما يكرّرها.
      ackRuns(stampKey(stamp), roundQueueStore.get().seq);
      reloadQueue();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  // نتائج رفع ما قيلت بعد (رفع الخلفية لمّا رجع الاتصال، أو من شاشة ثانية): رُدّت للمدير أو تحتاج مراجعة، بأيّ يوم. المقول (بملخّص
  // الحفظ أو بـ«حسناً») بالمخزن، فما يرجع بكل فتح للشاشة.
  const seen = uploads.acked[key] ?? 0;
  const returnedRuns = uploads.runs.filter((run) => run.key === key && run.seq > seen);
  const parkedNames: string[] = [];
  const reviewNames: string[] = [];
  for (const run of returnedRuns) {
    for (const entry of run.results) {
      const label = t('round.uploads.item', '{hall} ({day})', { hall: names.get(entry.flockId) ?? t('round.review.flock', 'فوج'), day: fmtDay(entry.day) });
      if (entry.result.kind === 'parked' && !parkedNames.includes(label)) parkedNames.push(label);
      if ((entry.result.kind === 'stale_day' || entry.result.kind === 'rejected') && !reviewNames.includes(label)) reviewNames.push(label);
    }
  }

  const base = farmPath(kind);
  const dirty = Object.keys(edits).length > 0;
  const separator = t('list.separator', '، ');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('round.title', 'الجولة اليومية — {farm}', { farm: farmTitle(kind) })} subtitle={t('round.subtitle', 'أرقام اليوم {day}: مجموع اليوم لكل خانة، والفارغة بلا تغيير.', { day: fmtDay(today) })} actions={<Link to={base} className="text-sm font-semibold text-brand-700 dark:text-brand-200">{t('round.back', 'إلى الحقول')}</Link>} />
      {!canSave && session.status === 'ready' ? (
        <Notice tone="info" title={t('round.read_only', 'تعرض هذه الصفحة أرقام اليوم فقط.')}>
          {t('round.read_only.detail', 'تسجيل الجولة لعامل القاعة والمدير؛ دورك يقرأ الأرقام دون تعديلها.')}
        </Notice>
      ) : null}
      {canSave && !online ? <Notice tone="warning" title={t('round.offline', 'بلا اتصال: الجولة تُحفظ على هذا الجهاز وتُرسل حين يعود الاتصال.')} /> : null}
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
          {parkedNames.length > 0 ? <p>{t('round.uploads.parked', 'رُدّت إلى المدير: {halls}.', { halls: parkedNames.join(separator) })}</p> : null}
          {reviewNames.length > 0 ? <p>{t('round.uploads.review', 'تحتاج مراجعة في «جولات تحتاج مراجعة»: {halls}.', { halls: reviewNames.join(separator) })}</p> : null}
        </Notice>
      ) : null}
      {state.error instanceof NotConnectedError ? (
        <Notice tone="info" title={describeError(state.error).title} />
      ) : state.error ? (
        <LoadFailed what={t('round.what', 'أفواج الجولة')} error={state.error} onRetry={state.retry} />
      ) : null}
      {state.data?.savedAt ? <Notice tone="warning" title={t('farm.offline', 'بلا اتصال: هذه آخر نسخة محفوظة على الجهاز.')} /> : null}
      {overview && rows.length === 0 ? <Notice tone="info" title={t('round.empty', 'لا أفواج نشطة في نطاقك اليوم.')} /> : null}
      {result ? (
        <Notice tone={result.others.length === 0 ? 'info' : 'warning'} title={t('round.result', 'حُفظ {saved} من {total}', { saved: fmtInt(result.saved), total: fmtInt(result.total) })}>
          {result.others.length > 0 ? t('round.result.check', 'راجع: {halls}', { halls: result.others.filter(Boolean).join(separator) }) : null}
        </Notice>
      ) : null}
      {failure ? <Notice tone="danger" title={describeError(failure).title}>{describeError(failure).detail}</Notice> : null}
      {rows.map((row) => {
        const stored = canSave ? (edits[row.flock.id] ?? null) : null;
        const returned = stored ? returnedSince(uploads.runs, key, row.flock.id, today, stored.seq) : null;
        const edit = stored ? liveEdit(stored, row, returned) : null;
        return (
          <RoundCard
            key={row.flock.id}
            row={row}
            kind={kind}
            text={canSave ? (edit?.text ?? row.text) : null}
            onChange={(text) =>
              setEdits((current) => {
                const seq = roundQueueStore.get().seq;
                const previous = current[row.flock.id];
                // أوّل كتابة بالصفّ (أو أوّل كتابة بعد ما رجعت جولته السابقة): لقطة المعروض ونسخة صفّ اليوم الآن.
                const next: RowEdit = previous && !returned ? { ...previous, text } : { text, from: row.text, base: row.baseVersion, seq };
                return { ...current, [row.flock.id]: next };
              })
            }
            error={errors[row.flock.id] ?? null}
            status={edit ? null : rowStatus(row, queue.pending, uploads.runs, key, today)}
            returned={returned}
          />
        );
      })}
      {rows.length > 0 && canSave ? (
        <div className="sticky bottom-4 flex justify-end">
          <Button size="lg" onClick={() => void save()} busy={busy} disabled={!dirty || !stamp} data-action="round-save">
            {t('round.save', 'احفظ الجولة')}
          </Button>
        </div>
      ) : null}
      <ReviewShelf entries={queue.review} names={names} />
    </div>
  );
}
