import { Component, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { addDays, localDay, type Day } from '../../domain/dates';
import { parseDayText } from '../../lib/dayText';
import { NotConnectedError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadFlockSales, recordCountAdjust, type FlockSales } from '../../lib/repo/flockClose';
import type { FlockDetail } from '../../lib/repo/flocks';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { failureText, pendingKey, readPending, storePending, surelyUnsaved } from './GivePage';
import { flockPath, kgText } from './parts';
import { newTicketPath, signedCount, statusLabel, ticketName, ticketPath } from './ticketParts';

// بطاقة الفوج للبيع والإغلاق (0028، العقد §5.7 و§10): في صفحة الفوج المحفوظة باستيراد كسول لحزمة القاعات (farm/shared، بلا نت لا شيء). المباع من
// الفواتير وصافيه، والطيور على تذاكر بلا فاتورة، و«فرق العدّ»، والحيّ، وأحدث التذاكر؛ والأفعال بما يجيزه الخادم (can): «تذكرة وزن» لعامل القاعة
// والمدير، و«سجّل فرق العدّ» و«أغلق الدورة» و«أعد فتح الدورة» للمدير. «فرق العدّ» نافذة: زيادة أو نقص، ويومه، وسببه، والحيّ قبله وبعده، بنداء
// واحد بمرجعه والحيّ الذي عرضته الشاشة شرطاً؛ والطلب الذي لا تُعرف نتيجته خارج المكوّن (sessionStorage بمفتاح المستخدم والمنشأة والفوج).

type Flock = FlockDetail['flock'];

interface CountRequest {
  clientRef: string;
  id: string;
  flockId: string;
  on: Day;
  birds: number;
  reason: string;
  expectedLive: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asCount = (value: unknown): CountRequest | null =>
  isRecord(value) && typeof value.clientRef === 'string' && typeof value.id === 'string' && typeof value.on === 'string' && typeof value.birds === 'number' && typeof value.expectedLive === 'number' ? (value as unknown as CountRequest) : null;

/** نافذة «فرق العدّ»: زيادة أو نقص بعدده، ويومه (حتى 7 أيام مضت)، وسببه؛ والحيّ قبله وبعده. */
function CountDialog({ sales, busy, failure, onClose, onSend }: { sales: FlockSales; busy: boolean; failure: unknown; onClose: () => void; onSend: (birds: number, on: Day, reason: string) => void }) {
  const id = useId();
  const today = localDay();
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [count, setCount] = useState('');
  const [day, setDay] = useState(fmtDay(today));
  const [reason, setReason] = useState('');
  const trimmed = count.trim();
  const n = /^[0-9]{1,8}$/u.test(trimmed) ? Number(trimmed) : null;
  const countError = trimmed !== '' && (n === null || n < 1 || n > 10_000_000) ? t('halls.card.count_bad', 'اكتب العدد من 1 إلى 10,000,000.') : null;
  const birds = n === null ? null : direction === 'up' ? n : -n;
  const after = birds === null ? null : sales.live + birds;
  const onDate = parseDayText(day);
  const dayError =
    onDate === null
      ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
      : onDate > today
        ? t('day.future', 'التاريخ بعد اليوم.')
        : onDate < addDays(today, -7)
          ? t('day.too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ {day}.', { day: fmtDay(addDays(today, -7)) })
          : null;
  const afterError = after !== null && after < 0 ? t('halls.card.count_negative', 'بهذا يصير الحيّ سالباً: النقص أكثر من الحيّ ({live}).', { live: sales.live }) : null;
  const reasonError = reason.trim().length > 500 ? t('halls.card.reason_long', 'السبب حتى 500 حرف.') : null;
  const ready = birds !== null && !countError && !dayError && !afterError && reason.trim() !== '' && !reasonError && onDate !== null && !busy;
  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={count !== '' || reason !== ''}
      title={t('halls.card.count_title', 'سجّل «فرق العدّ»')}
      footer={
        <Button size="lg" disabled={!ready} busy={busy} onClick={() => (ready && birds !== null && onDate !== null ? onSend(birds, onDate, reason) : undefined)} data-action="count-go">
          {birds === null ? t('halls.card.count_go', 'سجّل فرق العدّ') : t('halls.card.count_go_n', 'سجّل فرق العدّ {n}', { n: signedCount(birds) })}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{t('halls.card.count_hint', 'حين يختلف العدّ الفعليّ عن الحيّ بحسب النظام. يظهر في التقرير وحده لا مع النافق.')}</p>
        <Segmented
          label={t('halls.card.count_direction', 'الاتّجاه')}
          options={[
            { value: 'down', label: t('halls.card.count_down', 'نقص') },
            { value: 'up', label: t('halls.card.count_up', 'زيادة') },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-count`} label={t('halls.card.count_n', 'العدد')} error={countError ?? afterError}>
            <input id={`${id}-count`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={count} disabled={busy} onChange={(event) => setCount(event.target.value)} data-action="count-n" />
          </Field>
          <Field id={`${id}-day`} label={t('halls.card.count_day', 'اليوم')} error={dayError}>
            <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={day} disabled={busy} onChange={(event) => setDay(event.target.value)} data-action="count-day" />
          </Field>
        </div>
        <Field id={`${id}-reason`} label={t('halls.card.count_reason', 'السبب')} error={reasonError}>
          <input id={`${id}-reason`} className="input" autoComplete="off" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} data-action="count-reason" />
        </Field>
        <p className="text-sm" data-action="count-live">
          {after === null || after < 0 ? t('halls.card.count_live', 'الحيّ الآن {live}.', { live: sales.live }) : t('halls.card.count_live_after', 'الحيّ الآن {live}، وبعد فرق العدّ {after}.', { live: sales.live, after })}
        </p>
        {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
      </div>
    </Dialog>
  );
}

function CardView({ flock, onChanged }: { flock: Flock; onChanged?: () => void }) {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const pendingId = workspace ? pendingKey(`${workspace.userId}:${workspace.orgId}`, `count:${flock.id}`) : '';
  const load = useCallback(() => loadFlockSales(flock.id), [flock.id]);
  const state = useLoad(load);
  const [kept, setKept] = useState<FlockSales | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const sales = state.data ?? kept;
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [frozen, setFrozen] = useState<CountRequest | null>(null);
  const [ids, setIds] = useState(() => ({ ref: crypto.randomUUID(), id: crypto.randomUUID() }));
  const sending = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // «فرق عدّ» لم تُعرف نتيجته من فتح سابق: تعود البطاقة مجمَّدة به.
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (pendingId !== '' && restoredFor !== pendingId) {
    setRestoredFor(pendingId);
    setFrozen(asCount(readPending(pendingId)));
  }

  const send = async (request: CountRequest, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    storePending(pendingId, request);
    try {
      const done = await recordCountAdjust(request);
      storePending(pendingId, null);
      toast({ tone: 'success', title: t('halls.card.count_done', 'سُجّل فرق العدّ {n} يوم {day}، والحيّ الآن {live}.', { n: signedCount(done.birds), day: fmtDay(done.onDate), live: done.liveAfter }) });
      if (!live.current) return;
      setFrozen(null);
      setCounting(false);
      setIds({ ref: crypto.randomUUID(), id: crypto.randomUUID() });
      state.retry();
      onChanged?.();
    } catch (problem) {
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        setFrozen(request);
        setCounting(false);
        return;
      }
      storePending(pendingId, null);
      setFrozen(null);
      if (!live.current) return;
      setIds((current) => ({ ref: crypto.randomUUID(), id: problem instanceof RejectedError && problem.code === 'id_conflict' ? crypto.randomUUID() : current.id }));
      setFailure(problem);
      if (problem instanceof RejectedError && problem.code === 'live_changed') state.retry();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (state.error instanceof NotConnectedError) return null;
  const back = flockPath(flock.kind, flock.id);
  const tickets = sales?.tickets ?? [];
  const columns: Column<FlockSales['tickets'][number]>[] = [
    {
      key: 'no',
      header: t('halls.tickets.col.ticket', 'التذكرة'),
      cell: (row) => (
        <Link to={ticketPath(row.id, back)} className="font-semibold text-brand-700 dark:text-brand-200" data-action="card-ticket">
          <bdi dir="ltr">{ticketName(row.ticketNo)}</bdi>
        </Link>
      ),
    },
    { key: 'day', header: t('halls.tickets.col.day', 'اليوم'), cell: (row) => <Num>{fmtDay(row.onDate)}</Num> },
    { key: 'birds', header: t('halls.ticket.col.birds', 'الطيور'), kind: 'number', cell: (row) => (row.birds === null ? t('halls.card.dash', '—') : <Num>{fmtInt(row.birds)}</Num>) },
    { key: 'status', header: t('halls.tickets.col.status', 'الحالة'), cell: (row) => statusLabel(row.status, row.invoiced) },
  ];
  const linkClass = 'text-sm font-semibold text-brand-700 dark:text-brand-200';
  return (
    <section className="card flex flex-col gap-3 p-4" data-action="flock-card">
      <h2 className="font-semibold">{t('halls.card.title', 'البيع وإغلاق الدورة')}</h2>
      {state.error && !sales ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-action="card-failed">
          <span role="alert" className="text-danger-700 dark:text-danger-300">
            {t('halls.card.failed', 'تعذّرت قراءة البيع والإغلاق.')}
          </span>
          <Button size="sm" variant="ghost" onClick={state.retry} data-action="card-retry">
            {t('common.retry', 'أعد المحاولة')}
          </Button>
        </div>
      ) : null}
      {sales ? (
        <>
          <p data-action="card-sold">
            {sales.soldBirds > 0 ? t('halls.card.sold', 'المباع من الفواتير: {birds} طيراً، صافيها {kg}.', { birds: sales.soldBirds, kg: kgText(sales.soldNetKg) }) : t('halls.card.no_sold', 'لا مبيع بفاتورة بعد.')}
            {sales.ticketed > 0 ? t('halls.card.ticketed', ' وعلى تذاكر بلا فاتورة {n} طيراً.', { n: sales.ticketed }) : ''}
          </p>
          <p className="text-sm text-ink-muted" data-action="card-live">
            {t('halls.card.live', 'الحيّ بحسب النظام {live}.', { live: sales.live })}
            {sales.countDiff !== 0 ? t('halls.card.count_diff', ' فرق العدّ {n}.', { n: signedCount(sales.countDiff) }) : ''}
          </p>
          {sales.close && sales.close.status === 'closed' ? (
            <p className="text-sm font-semibold" data-action="card-closed">
              {t('halls.card.closed', 'أُغلقت الدورة يوم {day}.', { day: fmtDay(sales.close.closedOn) })}
            </p>
          ) : null}
          {tickets.length ? <DataTable caption={t('halls.card.tickets', 'تذاكر الوزن')} columns={columns} rows={tickets} rowKey={(row) => row.id} empty={t('halls.card.dash', '—')} /> : null}
          {frozen ? (
            <div data-action="card-frozen">
              <Notice
                tone="warning"
                title={t('halls.card.count_unknown', 'لا نعرف إن سُجّل فرق العدّ {n} يوم {day}: أعد المحاولة؛ لن يُسجَّل مرّتين.', { n: signedCount(frozen.birds), day: fmtDay(frozen.on) })}
                action={
                  <Button size="sm" busy={busy} onClick={() => void send(frozen, true)} data-action="card-count-retry">
                    {t('issue.retry', 'أعد المحاولة')}
                  </Button>
                }
              />
            </div>
          ) : null}
          {failure && !counting ? <Notice tone="danger" title={failureText(failure)} /> : null}
          <div className="flex flex-wrap items-center gap-3" data-action="card-actions">
            {sales.can.ticket ? (
              <Link to={newTicketPath(flock.siteId, flock.hallId, back)} className={linkClass} data-action="card-new-ticket">
                {t('halls.card.new_ticket', 'تذكرة وزن')}
              </Link>
            ) : null}
            {sales.can.adjust ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={frozen !== null || busy}
                onClick={() => {
                  setFailure(null);
                  setCounting(true);
                }}
                data-action="card-count"
              >
                {t('halls.card.count', 'سجّل فرق العدّ')}
              </Button>
            ) : null}
            {sales.can.close ? (
              <Link to={`/halls/close/${flock.id}?${new URLSearchParams({ back }).toString()}`} className={linkClass} data-action="card-close">
                {t('halls.close.go', 'أغلق الدورة')}
              </Link>
            ) : null}
            {sales.can.reopen ? (
              <Link to={`/halls/report/${flock.id}?${new URLSearchParams({ back, act: 'reopen' }).toString()}`} className={linkClass} data-action="card-reopen">
                {t('halls.reopen.go', 'أعد فتح الدورة')}
              </Link>
            ) : null}
          </div>
        </>
      ) : !state.error ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : null}
      {counting && sales ? (
        <CountDialog
          sales={sales}
          busy={busy}
          failure={failure}
          onClose={() => setCounting(false)}
          onSend={(birds, on, reason) => void send({ clientRef: ids.ref, id: ids.id, flockId: flock.id, on, birds, reason, expectedLive: sales.live }, false)}
        />
      ) : null}
    </section>
  );
}

/** حدّ صامت: خطأ رسم في البطاقة لا يرسم شيئاً، وصفحة الفوج تعمل كما هي. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function FlockCard({ flock, onChanged }: { flock: Flock; onChanged?: () => void }) {
  return (
    <Quiet>
      <CardView key={flock.id} flock={flock} onChanged={onChanged} />
    </Quiet>
  );
}
