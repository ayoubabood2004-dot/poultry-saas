import { CloudOff, Send } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { localDay } from '../../domain/dates';
import { parseDecimal, toScale } from '../../domain/decimal';
import { EMPTY_ROUND, emptyVisit, readVisit, typedRound, type FlockKind, type RoundText } from '../../domain/flocks';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError, RejectedError } from '../../lib/errors';
import { countForm, fmtDay, fmtInt, fmtMilli } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { openOutbox, pendingOps, removeReview, reviewEntries, saveRound, type OutboxOp, type ReviewEntry, type SendResult, type Stamp } from '../../lib/outbox';
import { useDirtyForm } from '../../lib/pwa/dirty';
import type { FlockSummary, FlocksOverview } from '../../lib/repo/flocks';
import { ackRuns, refreshRoundQueue, roundQueueStore, stampKey, uploadRounds, type RoundRun } from '../../lib/roundUploads';
import { useSession } from '../../lib/session';
import { useStore } from '../../lib/store';
import { CARD_CLASS, givePath, LINK_CLASS } from './feed';
import { errorText, loadTransport, parkText, soFar, soFarText, staleVisitText, type SoFar } from './roundText';
import { farmPath, farmTitle, HallReminders, HallVisitsLazy, hallLabel, hallPath, NeedsConnection, useOverview, useStamp } from './shared';

// الجولة اليومية (FOUNDATION ٧٨٢–٧٨٣ و٨١٦) بزيارات في اليوم (0032، كلمة المالك 2026-11-17: «نروح للحقل أكثر من مرّة باليوم»): شاشة وحدة لكل
// أفواج النطاق النشطة، كلّ قاعة مختارة افتراضاً بمربّعها (تُشال المستثناة، و«كلّ القاعات» يعلّمها أو يزيلها)، وخانات زيارة فارغة (نافق، مستبعد،
// علف، وللبيّاض البيض والمكسور؛ والماء خارجها بكلمة المالك 2026-11-11) تحت كلّ منها «اليوم حتى الآن» (المحفوظ ونسخة الجهاز وزيارات هذا
// الجهاز المنتظرة)، و«نفس الرقم لكلّ القاعات» لكلّ خانة. زرّ حفظ واحد يسمّي عدد القاعات: زيارة جديدة (معرّفها ووقتها من الجهاز) لكلّ قاعة مختارة
// فيها رقم، بالطابور (saveRound) ثمّ رفعها إذا بنت (الرافع الواحد بـroundUploads)؛ الزيارات تُجمع بالخادم فلا تعارض بين جهازين. والفحص قبل الحفظ
// على مجموع اليوم بعد الزيارة. ولكلّ قاعة «زيارات اليوم» (حزمة القاعات، كسولة: بلا نت «تحتاج اتصالاً») بالتعديل والإلغاء، و«اصرف من المخزن
// للقاعات المختارة» إلى صفحة الإضافة. وفوقها تذكير لقاحات النوع. والجولة لمن يحفظ يوم الفوج بس (flock_day.save)؛ غيره يشوف أرقام اليوم بلا خانات.

type RowStatus = 'saved' | 'device' | 'parked' | 'review' | 'held';

interface RoundRow {
  flock: FlockSummary;
  hallId: string;
  hallName: string;
  siteName: string;
  /** الحيّ بداية اليوم. */
  liveStart: number;
  /** مجموع اليوم حتى الآن: المحفوظ (أو نسخة الجهاز) وعمليات هذا الجهاز لليوم. */
  total: SoFar;
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
      rows.push({ flock, hallId: hall.id, hallName: hall.name, siteName: site.name, liveStart, total: soFar(fresh ? flock.today : null, opsOf(today)) });
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

function statusText(status: RowStatus): string {
  switch (status) {
    case 'saved':
      return t('round.status.saved', 'حُفظت');
    case 'device':
      return t('round.status.device', 'محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال');
    case 'parked':
      return t('round.status.parked', 'رُدّت (الفوج مغلق، أو خارج نطاقك، أو الفترة مقفلة)، وبقيت على هذا الجهاز في «جولات تحتاج مراجعة» أدناه');
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
  if (result.kind === 'stale_day' || result.kind === 'stale_visit' || result.kind === 'stale_gas' || result.kind === 'rejected') return 'review';
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

type ShelfField = 'dead' | 'culled' | 'feed_kg' | 'eggs_total' | 'eggs_broken' | 'cylinders' | 'note';

/**
 * رفّ المراجعة: ما لم يقبله الخادم كما هو، ومنه المركون بسببه (0035: كان يُحذف من الجهاز بصمت)، بالنسختين جنب بعض؛ ولا يُحذف إلا بـ«احذفه» بتأكيد
 * يسمّي ما يضيع.
 */
function ReviewShelf({ entries, names, onRemove }: { entries: readonly ReviewEntry[]; names: ReadonlyMap<string, string>; onRemove: (entry: ReviewEntry) => Promise<void> }) {
  const [removing, setRemoving] = useState<{ entry: ReviewEntry; busy: boolean } | null>(null);
  if (entries.length === 0) return null;
  const fields: { key: ShelfField; label: string; amount?: boolean }[] = [
    { key: 'dead', label: t('round.dead', 'النافق') },
    { key: 'culled', label: t('round.culled', 'المستبعد') },
    { key: 'feed_kg', label: t('round.feed', 'العلف (كغم)'), amount: true },
    { key: 'eggs_total', label: t('round.eggs_total', 'البيض (المجموع)') },
    { key: 'eggs_broken', label: t('round.eggs_broken', 'المكسور') },
    { key: 'cylinders', label: t('round.review.gas', 'الغاز (قناني)') },
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
      <p className="text-sm text-ink-muted">{t('round.review.hint', 'لم يقبلها الخادم كما هي. تبقى هنا على هذا الجهاز ولا تُحذف؛ أعد إدخال ما تراه صحيحاً في الجولة.')}</p>
      {entries.map((entry) => {
        const server = entry.server && typeof entry.server === 'object' ? (entry.server as Record<string, unknown>) : null;
        const op = entry.op;
        // الزيارة (0032) «زيارتك والمحفوظة» بخاناتها كلّها (المحتوى كامل)، ومجموع اليوم القديم بخاناته المكتوبة وحدها.
        const visit = op.fn === 'save_flock_visit' ? op.payload : null;
        const mine = op.payload as Readonly<Partial<Record<ShelfField, unknown>>>;
        const rows = fields.filter((field) =>
          visit ? field.amount || field.key === 'dead' || field.key === 'culled' || present(mine[field.key]) || present(server?.[field.key]) : field.key === 'cylinders' ? op.fn === 'set_flock_gas' : present(mine[field.key]),
        );
        const reason =
          entry.reason === 'stale_day'
            ? t('round.review.stale', 'حُفظ هذا اليوم من جهاز آخر قبل أن تصل جولتك، فلم تُكتب فوقه.')
            : entry.reason === 'stale_gas'
              ? t('round.review.stale_gas', 'تغيّر غاز هذا اليوم من جهاز آخر قبل أن يصل تعديلك، فلم يُكتب فوقه.')
              : entry.reason === 'stale_visit'
                ? staleVisitText(entry.server)
                : entry.reason === 'parked'
                  ? t('round.review.parked', 'لم يُحفظ: {why}. ووصل إلى صفحة القاعة أيضاً.', { why: parkText(entry.hint) })
                  : describeError(new RejectedError(entry.reason, entry.hint)).detail;
        return (
          <div key={entry.id} className={CARD_CLASS} data-review={entry.id}>
            <p className="font-semibold">
              {names.get(op.flockId) ?? t('round.review.flock', 'فوج')} — <bdi dir="ltr">{fmtDay(op.day)}</bdi>
              {visit ? ` — ${visit.void ? t('round.review.visit_void', 'إلغاء زيارة') : op.baseVersion === null ? t('round.review.visit_new', 'زيارة جديدة') : t('round.review.visit_edit', 'تعديل زيارة')}` : null}
            </p>
            {/* الرفض بلا تلميح (رمز خادم مثل PGRST202) بجملة فصيحة، مو الرمز وحده. */}
            <p className="text-sm">{reason}</p>
            <DataTable
              caption={visit ? t('round.review.visit_table', 'زيارتك والمحفوظة') : t('round.review.table', 'جولتك والمحفوظ في الخادم')}
              columns={[
                { key: 'field', header: t('round.review.field', 'الخانة'), cell: (field) => field.label },
                { key: 'mine', header: visit ? t('round.review.visit_mine', 'زيارتك') : t('round.review.mine', 'جولتك'), kind: 'number', cell: (field) => <Num>{shown(mine[field.key], field.amount)}</Num> },
                { key: 'server', header: visit ? t('round.review.visit_server', 'المحفوظة') : t('round.review.server', 'المحفوظ في الخادم'), kind: 'number', cell: (field) => <Num>{shown(server?.[field.key], field.amount)}</Num> },
              ]}
              rows={rows}
              rowKey={(field) => field.key}
              empty={t('round.review.empty', 'بلا خانات.')}
            />
            <div>
              <Button size="sm" variant="ghost" onClick={() => setRemoving({ entry, busy: false })} data-action="review-remove">
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

// المستبعد خرج من الإدخال، والعلف يُرسل من ورقة القاعة من «رصيد العلف» (طلب المالك 2026-11-21): الجولة نافق اليوم (وللبيّاض البيض).
const fieldsOf = (kind: FlockKind): [keyof RoundText, string, boolean][] => [
  ['dead', t('round.dead', 'النافق'), false],
  ...(kind === 'layer'
    ? ([
        ['eggsTotal', t('round.eggs_total', 'البيض (المجموع)'), false],
        ['eggsBroken', t('round.eggs_broken', 'المكسور'), false],
      ] as [keyof RoundText, string, boolean][])
    : []),
];

interface CardProps {
  row: RoundRow;
  kind: FlockKind;
  today: string;
  /** null = قراءة بس (بلا flock_day.save). */
  text: RoundText | null;
  onChange: (text: RoundText) => void;
  /** null = بلا اختيار (لا حفظ ولا صرف لهذا الدور). */
  picked: boolean | null;
  onPick: (on: boolean) => void;
  error: { field: keyof RoundText; message: string } | null;
  status: RowStatus | null;
  canSave: boolean;
  online: boolean;
  /** يتغيّر بعد كلّ حفظ: «زيارات اليوم» المفتوحة تُقرأ من جديد. */
  saves: number;
}

function RoundCard({ row, kind, today, text, onChange, picked, onPick, error, status, canSave, online, saves }: CardProps) {
  const id = useId();
  const [visits, setVisits] = useState<{ open: boolean; count: number | null; saves: number }>(() => ({ open: false, count: null, saves }));
  // بعد كلّ حفظ العدد مجهول حتى تقرأ «زيارات اليوم» من جديد: المطويّة لا تقرأ، فكان يبقى عددها القديم («(1)» وفيها زيارتان)؛ والمفتوحة تعيده بعد قراءتها.
  if (visits.saves !== saves) setVisits({ ...visits, saves, count: null });
  const onCount = useCallback((count: number) => setVisits((current) => (current.count === count ? current : { ...current, count })), []);
  const fields = fieldsOf(kind);
  const label = hallLabel(row.hallName);
  return (
    <div className={CARD_CLASS} data-flock={row.flock.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          {picked !== null ? (
            <input type="checkbox" className="size-5 accent-brand-600" checked={picked} onChange={(event) => onPick(event.target.checked)} aria-label={t('round.pick', 'اختر {hall}', { hall: label })} data-action="round-pick" />
          ) : null}
          <span>
            {/* اسم القاعة طريق إلى صفحتها (كلمة المالك 2026-11-16). */}
            <Link to={hallPath(kind, row.hallId)} className="text-brand-700 underline-offset-4 hover:underline dark:text-brand-200" data-action="round-hall">
              {label}
            </Link>{' '}
            <span className="text-sm font-normal text-ink-muted">— {row.siteName}</span>
          </span>
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
        {/* علف أو دواء لهذه القاعة (ولغيرها معها) في صفحة الإضافة، والرجوع إلى الجولة. */}
        {text ? (
          <Link to={givePath(row.flock.id, `${farmPath(kind)}/round`)} className={LINK_CLASS} data-action="round-give">
            {t('round.give', 'أضف للقاعة')}
          </Link>
        ) : null}
      </div>
      {text ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fields.map(([field, title, decimal]) => (
            <div key={field} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-${field}`} className="text-sm font-medium">
                {title}
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
              <p className="text-xs text-ink-muted" data-action="round-so-far" data-field={field}>
                {t('round.so_far', 'اليوم حتى الآن: {n}', { n: soFarText(row.total, field) })}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fields.map(([field, title]) => (
            <div key={field} className="min-w-0">
              <dt className="truncate text-sm text-ink-muted">{title}</dt>
              <dd dir="ltr" className="text-end font-semibold tabular-nums">
                {soFarText(row.total, field)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
          {error.message}
        </p>
      ) : status ? (
        <p className={status === 'saved' ? 'text-sm text-brand-700 dark:text-brand-200' : 'text-sm text-warn-800 dark:text-warn-200'} data-status={status}>
          {statusText(status)}
        </p>
      ) : null}
      <div>
        <Button size="sm" variant="ghost" aria-expanded={visits.open} onClick={() => setVisits((current) => ({ ...current, open: !current.open }))} data-action="round-visits">
          {visits.count === null ? t('round.visits', 'زيارات اليوم') : t('round.visits.n', 'زيارات اليوم ({n})', { n: fmtInt(visits.count) })}
        </Button>
      </div>
      {visits.open ? (
        online ? (
          <HallVisitsLazy kind={kind} flockId={row.flock.id} day={today} canSave={canSave} liveStart={row.liveStart} refresh={saves} onCount={onCount} />
        ) : (
          <NeedsConnection />
        )
      ) : null}
    </div>
  );
}

const FIELDS: (keyof RoundText)[] = ['dead', 'culled', 'feedKg', 'eggsTotal', 'eggsBroken'];
/**
 * خانات قاعة حُفظت زيارتها: ما بقي كما حُفظ يُفرغ (حُفظ، وحفظه ثانيةً يضيفه مرّتين)، وما كُتب فيها أثناء الرفع (والخانات مفتوحة) يبقى؛ وnull حين
 * لا يبقى شيء.
 */
function afterSave(now: RoundText | undefined, saved: RoundText | undefined): RoundText | null {
  if (!now) return null;
  const left = { ...now };
  for (const field of FIELDS) if (now[field] === (saved?.[field] ?? '')) left[field] = '';
  return typedRound(left) ? left : null;
}

/** الزرّ يسمّي النتيجة: «احفظ الزيارة لـ«قاعة 1»»، «لقاعتين»، «لـ3 قاعات»، «لـ11 قاعةً»، «لـ100 قاعة». */
function saveLabel(count: number, first: string): string {
  if (count === 0) return t('round.save', 'احفظ الزيارة');
  if (count === 1) return t('round.save.one', 'احفظ الزيارة لـ«{hall}»', { hall: first });
  if (count === 2) return t('round.save.two', 'احفظ الزيارة لقاعتين');
  const n = fmtInt(count);
  const form = countForm(count);
  if (form === 'few') return t('round.save.few', 'احفظ الزيارة لـ{n} قاعات', { n });
  if (form === 'many') return t('round.save.many', 'احفظ الزيارة لـ{n} قاعةً', { n });
  return t('round.save.hundreds', 'احفظ الزيارة لـ{n} قاعة', { n });
}

export default function RoundPage({ kind }: { kind: FlockKind }) {
  const id = useId();
  const navigate = useNavigate();
  const session = useSession();
  const stamp = useStamp();
  const uploads = useStore(roundQueueStore);
  const state = useOverview(stamp);
  const queue = useQueue(stamp, uploads.seq);
  const online = useStore(onlineStore);
  const today = localDay();
  const role = session.status === 'ready' ? session.workspace.role : null;
  // الجولة لمن يحفظ يوم الفوج (عامل القاعة والمدير والمالك)؛ المشاهد والمحاسب وغيرهما يشوفون أرقام اليوم بلا خانات ولا حفظ.
  const canSave = role !== null && can(role, 'flock_day.save');
  // الصرف من المخزن للقاعات المختارة بصلاحيته القائمة (كـ«أضف للقاعة» في صفحة القاعة).
  const canGive = role !== null && (can(role, 'issue.post') || can(role, 'flock_day.save'));
  const [texts, setTexts] = useState<Record<string, RoundText>>({});
  /** القاعات المستثناة: كلّ قاعة مختارة افتراضاً (والقاعة الجديدة في القراءة مختارة). */
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [same, setSame] = useState<RoundText>(EMPTY_ROUND);
  const [errors, setErrors] = useState<Record<string, { field: keyof RoundText; message: string }>>({});
  const [result, setResult] = useState<{ total: number; saved: number; others: string[]; empty: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [saves, setSaves] = useState(0);
  // آخر قراءة تبقى معروضة أثناء القراءة من جديد (كلّ رفع جولات من أيّ شاشة يعيد القراءة): البطاقات و«زيارات اليوم» المفتوحة ونوافذها لا تُطوى.
  // والمحفوظة لهويّة القراءة وحدها: دخول حساب أو منشأة أخرى لا يعرض قاعات الأولى ولا يحفظ زيارات لأفواجها.
  const owner = stamp ? stampKey(stamp) : '';
  const [kept, setKept] = useState<{ owner: string; data: NonNullable<typeof state.data> } | null>(null);
  if (state.data !== null && (kept?.data !== state.data || kept.owner !== owner)) setKept({ owner, data: state.data });
  const shown = state.data ?? (kept?.owner === owner ? kept.data : null);
  const overview = shown?.overview ?? null;
  const rows = overview ? roundRows(overview, kind, today, queue.pending) : [];
  const key = stamp ? stampKey(stamp) : '';
  const names = new Map<string, string>();
  for (const site of overview?.sites ?? []) for (const hall of site.halls) if (hall.flock) names.set(hall.flock.id, hall.name);
  const mine = queue.pending.length;
  const reloadQueue = queue.reload;
  const picks = canSave || canGive;
  const picked = rows.filter((row) => !excluded.has(row.flock.id));
  const textOf = (row: RoundRow) => texts[row.flock.id] ?? EMPTY_ROUND;
  const ready = picked.filter((row) => typedRound(textOf(row)));
  // كل كتابة لم تُحفظ تعلّم النافذة «وسخة»: التحديث والتعافي ما يعيدان تحميلها، وإغلاق التبويب يسأل أوّلاً.
  useDirtyForm(Object.values(texts).some(typedRound) || typedRound(same));

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

  const pick = (flockId: string, on: boolean) =>
    setExcluded((current) => {
      if (current.has(flockId) !== on) return current;
      const next = new Set(current);
      if (on) next.delete(flockId);
      else next.add(flockId);
      return next;
    });
  const pickAll = (on: boolean) => setExcluded(on ? new Set() : new Set(rows.map((row) => row.flock.id)));
  /** «طبّق على المختارة»: الرقم في خانة كلّ قاعة مختارة، وتبقى كلّ خانة تُعدَّل وحدها بعده. */
  const applySame = (field: keyof RoundText) =>
    setTexts((current) => {
      const next = { ...current };
      for (const row of picked) next[row.flock.id] = { ...(current[row.flock.id] ?? EMPTY_ROUND), [field]: same[field] };
      return next;
    });

  const save = async () => {
    if (!stamp || !canSave) return;
    setBusy(true);
    setFailure(null);
    const nextErrors: typeof errors = {};
    // الخانات كما حُفظت: بعد الرفع تُفرغ خانات القاعة المحفوظة التي بقيت كما كانت، وما كُتب أثناء الرفع (والخانات مفتوحة) يبقى.
    const typed = texts;
    const sent: { row: RoundRow; opId: string }[] = [];
    const done: string[] = [];
    const empty: string[] = [];
    try {
      const db = await openOutbox();
      const recordedAt = new Date().toISOString();
      for (const row of picked) {
        const read = readVisit(textOf(row), { kind, liveStart: row.liveStart, totals: row.total });
        if ('error' in read) {
          nextErrors[row.flock.id] = { field: read.field, message: errorText(read.error, row.liveStart) };
          continue;
        }
        done.push(row.flock.id);
        if (emptyVisit(read.values)) {
          empty.push(hallLabel(row.hallName));
          continue;
        }
        // زيارة جديدة بمعرّف من الجهاز: لا نسخة تُشرط، فجهازان يسجّلان زيارتين للقاعة نفسها تُجمعان.
        const op = await saveRound(db, stamp, {
          fn: 'save_flock_visit',
          flockId: row.flock.id,
          day: today,
          payload: { visitId: crypto.randomUUID(), recordedAt, ...read.values, eggs_cracked: null, note: null, void: false },
          baseVersion: null,
        });
        if (op) sent.push({ row, opId: op.id });
      }
      const results = online && sent.length > 0 ? await uploadRounds(stamp, loadTransport).catch(() => []) : []; /* swallow-ok: الرفع فشل (IndexedDB)؛ العمليات باقية بالجهاز وصفوفها «محفوظة على هذا الجهاز» */
      // بلا نت: عدّاد الرأس («جولاتك المنتظرة») يتحدّث هسه، مو بالرفع الجاي.
      if (!online && sent.length > 0) {
        void refreshRoundQueue(stamp).catch(() => {
          /* swallow-ok: عدّ الطابور تعذّر؛ الرأس يتحدّث بالرفع الجاي */
        });
      }
      const outcome = new Map<string, SendResult>();
      for (const entry of results) outcome.set(entry.opId, entry.result);
      const statuses = sent.map(({ row, opId }) => ({ row, status: statusOf(outcome.get(opId)) }));
      const fine = (status: RowStatus) => status === 'saved' || status === 'device';
      setErrors(nextErrors);
      setTexts((current) => {
        const next = { ...current };
        for (const flockId of done) {
          const left = afterSave(current[flockId], typed[flockId]);
          if (left) next[flockId] = left;
          else delete next[flockId];
        }
        // خانات فوج ما عاد بالجولة (أُغلق أو خرج من النطاق) ما تبقى تعلّم النافذة.
        for (const flockId of Object.keys(next)) if (!rows.some((row) => row.flock.id === flockId)) delete next[flockId];
        return next;
      });
      const others = [...statuses.filter(({ status }) => !fine(status)).map(({ row }) => row.hallName), ...Object.keys(nextErrors).map((flockId) => names.get(flockId) ?? '')];
      setResult({ total: sent.length + Object.keys(nextErrors).length, saved: statuses.filter(({ status }) => fine(status)).length, others, empty });
      // نتائج هذا الحفظ قيلت بملخّصه، فتنبيه «رُدّت» ما يكرّرها.
      ackRuns(stampKey(stamp), roundQueueStore.get().seq);
      reloadQueue();
      setSaves((n) => n + 1);
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
      if ((entry.result.kind === 'stale_day' || entry.result.kind === 'stale_visit' || entry.result.kind === 'stale_gas' || entry.result.kind === 'rejected') && !reviewNames.includes(label)) reviewNames.push(label);
    }
  }

  const base = farmPath(kind);
  const separator = t('list.separator', '، ');
  const fields = fieldsOf(kind);
  /** صفحة الإضافة لأوّل قاعة مختارة والباقية مختارة معها مسبقاً (?also=)، والرجوع إلى الجولة. */
  const giveTo = () => {
    const [first, ...rest] = picked.map((row) => row.flock.id);
    const query = new URLSearchParams(rest.length ? { also: rest.join(','), back: `${base}/round` } : { back: `${base}/round` });
    return `/halls/give/${first}?${query.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('round.title', 'الجولة اليومية — {farm}', { farm: farmTitle(kind) })} subtitle={t('round.subtitle', 'زيارة اليوم {day}: ما تكتبه يُضاف إلى مجموع اليوم، والفارغة لا شيء.', { day: fmtDay(today) })} actions={<Link to={base} className={LINK_CLASS}>{t('round.back', 'إلى الحقول')}</Link>} />
      <HallReminders kind={kind} />
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
      {overview && rows.length === 0 ? <Notice tone="info" title={t('round.empty', 'لا أفواج نشطة في نطاقك اليوم.')} /> : null}
      {result ? (
        <Notice
          tone={result.others.length === 0 && result.empty.length === 0 ? 'info' : 'warning'}
          title={result.total > 0 ? t('round.result', 'حُفظ {saved} من {total}', { saved: fmtInt(result.saved), total: fmtInt(result.total) }) : t('round.result.none', 'لم تُحفظ زيارة.')}
        >
          {result.others.length > 0 ? <p>{t('round.result.check', 'راجع: {halls}', { halls: result.others.filter(Boolean).join(separator) })}</p> : null}
          {result.empty.length > 0 ? <p data-action="round-empty">{t('round.result.empty', 'بلا أرقام: {halls}', { halls: result.empty.join(separator) })}</p> : null}
        </Notice>
      ) : null}
      {failure ? <Notice tone="danger" title={describeError(failure).title}>{describeError(failure).detail}</Notice> : null}
      {rows.length > 0 && picks ? (
        <section className={CARD_CLASS} data-action="round-picks">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-5 accent-brand-600" checked={picked.length === rows.length} onChange={(event) => pickAll(event.target.checked)} data-action="round-pick-all" />
              <span className="font-semibold">{t('round.pick_all', 'كلّ القاعات')}</span>
            </label>
            <span className="text-sm text-ink-muted" data-action="round-picked">
              {t('round.picked', 'المختارة: {n} من {m}', { n: fmtInt(picked.length), m: fmtInt(rows.length) })}
            </span>
          </div>
          {canGive ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" disabled={picked.length === 0 || !online} onClick={() => navigate(giveTo())} data-action="round-give-picked">
                {t('round.give_picked', 'اصرف من المخزن للقاعات المختارة')}
              </Button>
              {online ? null : (
                <span className="text-sm text-ink-muted" data-action="round-give-offline">
                  {t('round.give_offline', 'يحتاج اتصالاً.')}
                </span>
              )}
            </div>
          ) : null}
          {canSave && rows.length > 1 ? (
            <div className="flex flex-col gap-3" data-action="round-same">
              <p className="text-sm text-ink-muted">{t('round.same.hint', 'نفس الرقم لكلّ القاعات: اكتبه ثمّ «طبّق على المختارة» فيُكتب في خانة كلّ قاعة مختارة، وتبقى خانة كلّ قاعة تُعدَّل وحدها.')}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {fields.map(([field, title, decimal]) => (
                  <div key={field} className="flex min-w-0 flex-col gap-1">
                    <label htmlFor={`${id}-${field}-same`} className="text-sm font-medium">
                      {title}
                    </label>
                    <input
                      id={`${id}-${field}-same`}
                      className="input tabular-nums"
                      dir="ltr"
                      inputMode={decimal ? 'decimal' : 'numeric'}
                      autoComplete="off"
                      value={same[field]}
                      onChange={(event) => setSame({ ...same, [field]: event.target.value })}
                      data-action="round-same-value"
                      data-field={field}
                    />
                    <Button size="sm" variant="secondary" disabled={same[field].trim() === '' || picked.length === 0} onClick={() => applySame(field)} data-action="round-same-apply" data-field={field}>
                      {t('round.same.apply', 'طبّق على المختارة')}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {rows.map((row) => {
        const text = canSave ? textOf(row) : null;
        return (
          <RoundCard
            key={row.flock.id}
            row={row}
            kind={kind}
            today={today}
            text={text}
            onChange={(next) => {
              setTexts((current) => ({ ...current, [row.flock.id]: next }));
              // الكتابة في قاعة مستثناة تختارها: ما يُكتب يُحفظ.
              pick(row.flock.id, true);
            }}
            picked={picks ? !excluded.has(row.flock.id) : null}
            onPick={(on) => pick(row.flock.id, on)}
            error={errors[row.flock.id] ?? null}
            status={text && typedRound(text) ? null : rowStatus(row, queue.pending, uploads.runs, key, today)}
            canSave={canSave}
            online={online}
            saves={saves}
          />
        );
      })}
      {rows.length > 0 && canSave ? (
        <div className="sticky bottom-4 flex justify-end">
          <Button size="lg" onClick={() => void save()} busy={busy} disabled={ready.length === 0 || !stamp} data-action="round-save">
            {saveLabel(ready.length, ready[0] ? hallLabel(ready[0].hallName) : '')}
          </Button>
        </div>
      ) : null}
      <ReviewShelf
        entries={queue.review}
        names={names}
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
