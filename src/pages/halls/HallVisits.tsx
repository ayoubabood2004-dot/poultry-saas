import { Component, useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast, type ToastInput } from '../../components/ui/Toast';
import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import { emptyVisit, readVisit, type FlockKind, type RoundText, type VisitValues } from '../../domain/flocks';
import { describeError, NotConnectedError, RejectedError } from '../../lib/errors';
import { columnDecimals, fmtInt, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { openOutbox, pendingOps, saveRound, type OutboxOp, type SendResult, type VisitOp } from '../../lib/outbox';
import type { FlockVisit, VisitSource } from '../../lib/repo/flocks';
import { loadRoundVisits, type RoundVisits } from '../../lib/repo/halls';
import { refreshRoundQueue, roundQueueStore, uploadRounds } from '../../lib/roundUploads';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { amountText, countText, errorText, loadTransport } from '../farm/roundText';
import { useStamp } from '../farm/shared';

// «زيارات اليوم» (0032، كلمة المالك 2026-11-17: «نسوي زيارات باليوم وكلّ زيارة تنضاف»): زيارات قاعة ليوم من الخادم (round_visits) بوقتها
// وأرقامها وكاتبها ومصدرها، وفوقها زيارات هذا الجهاز التي لم تُرفع («على هذا الجهاز»)؛ و«عدّل» نافذة بالمحتوى كاملاً بلقطة الزيارة ونسختها لحظة
// الفتح، و«ألغِ» تأكيد يسمّي ما يُطرح من مجموع اليوم. الحفظ عملية بالطابور (save_flock_visit بنسختها، أو p_void)، فالطلب الذي لا تُعرف نتيجته
// محفوظ خارج المكوّن (IndexedDB) ويُرفع بمرجعه نفسه. حزمة القاعات (خارج التثبيت المسبق): الجولة تحمّلها كسولة، وصفحة القاعة منها.

type DeviceKind = 'add' | 'edit' | 'void';

interface Values {
  dead: number;
  culled: number;
  feedKg: bigint | null;
  eggsTotal: number | null;
  eggsCracked: number | null;
  eggsBroken: number | null;
  note: string | null;
}

interface VisitRow {
  /** معرّف الزيارة. */
  id: string;
  recordedAt: string;
  values: Values;
  by: string | null;
  source: VisitSource;
  /** نسخة الزيارة كما رآها المستخدم (الخادم)، وnull لزيارة على هذا الجهاز لم تُرفع. */
  version: number | null;
  /** عملية هذا الجهاز للزيارة (آخرها)، وهل ما زالت تنتظر (تُعدَّل وتُلغى قبل رفعها). */
  device: { kind: DeviceKind; pending: boolean } | null;
}

const fromVisit = (visit: FlockVisit): Values => ({
  dead: visit.dead,
  culled: visit.culled,
  feedKg: visit.feedKg,
  eggsTotal: visit.eggsTotal,
  eggsCracked: visit.eggsCracked,
  eggsBroken: visit.eggsBroken,
  note: visit.note,
});

const fromOp = (op: VisitOp): Values => {
  const payload = op.payload;
  const feed = payload.feed_kg === null ? null : parseDecimal(payload.feed_kg, 3);
  return { dead: payload.dead ?? 0, culled: payload.culled ?? 0, feedKg: feed ? toScale(feed, 3) : null, eggsTotal: payload.eggs_total, eggsCracked: payload.eggs_cracked, eggsBroken: payload.eggs_broken, note: payload.note };
};

/** محتوى الزيارة كما يرسله الطابور (العلف نصّ بثلاث مراتب). */
const contentOf = (values: Values): VisitValues => ({ dead: values.dead, culled: values.culled, feed_kg: values.feedKg === null ? null : decimalText(values.feedKg, 3), eggs_total: values.eggsTotal, eggs_broken: values.eggsBroken });

const at = (iso: string): number => Date.parse(iso);
const NONE: readonly FlockVisit[] = [];

/** زيارات اليوم الحيّة من الخادم، وفوقها عمليات هذا الجهاز لها (آخر عملية لكلّ زيارة)، بترتيب وقتها. */
export function visitRows(server: readonly FlockVisit[], ops: readonly OutboxOp[], me: string | null): VisitRow[] {
  const latest = new Map<string, VisitOp>();
  for (const op of [...ops].sort((a, b) => a.createdAt - b.createdAt)) if (op.fn === 'save_flock_visit') latest.set(op.payload.visitId, op);
  const rows: VisitRow[] = [];
  for (const visit of server) {
    if (visit.voided) continue;
    const op = latest.get(visit.id);
    latest.delete(visit.id);
    rows.push({
      id: visit.id,
      recordedAt: visit.recordedAt,
      values: op && !op.payload.void ? fromOp(op) : fromVisit(visit),
      by: visit.by,
      source: visit.source,
      version: visit.version,
      device: op ? { kind: op.payload.void ? 'void' : 'edit', pending: op.state === 'pending' } : null,
    });
  }
  // زيارة على هذا الجهاز لم تصل الخادم بعد (أو تعديل لزيارة لم تعد في قراءته): بمحتوى عمليتها. والإلغاء بلا زيارة يُرى لا شيء يُعرض.
  for (const op of latest.values()) {
    if (op.payload.void) continue;
    rows.push({ id: op.payload.visitId, recordedAt: op.payload.recordedAt, values: fromOp(op), by: me, source: 'visit', version: op.baseVersion, device: { kind: op.baseVersion === null ? 'add' : 'edit', pending: op.state === 'pending' } });
  }
  return rows.sort((a, b) => at(a.recordedAt) - at(b.recordedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const pad = (n: number): string => `${n < 10 ? '0' : ''}${fmtInt(n)}`;

/** وقت الزيارة بساعة الجهاز: «09:40». */
export function visitClock(iso: string): string {
  const when = new Date(iso);
  return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/** الكيلو دائماً («50 كغم»، «1,250 كغم»)، لا طنّ. */
const kg = (feed: bigint): string => {
  const shown = fmtQty(feed, 'kg');
  return shown.sub ?? shown.main;
};

/** ما في الزيارة بكلمات: «النافق 3، والعلف 50 كغم». */
function valuesText(values: Values): string {
  const parts: string[] = [];
  if (values.dead) parts.push(t('visits.part.dead', 'النافق {n}', { n: fmtInt(values.dead) }));
  if (values.culled) parts.push(t('visits.part.culled', 'المستبعد {n}', { n: fmtInt(values.culled) }));
  if (values.feedKg !== null) parts.push(t('visits.part.feed', 'العلف {kg}', { kg: kg(values.feedKg) }));
  if (values.eggsTotal !== null) parts.push(t('visits.part.eggs', 'البيض {n}', { n: fmtInt(values.eggsTotal) }));
  if (values.eggsBroken !== null) parts.push(t('visits.part.broken', 'المكسور {n}', { n: fmtInt(values.eggsBroken) }));
  // «النافق 3، والعلف 50 كغم»: الواو قبل كلّ ما بعد الأوّل.
  return parts.length ? parts.map((part, index) => (index ? t('visits.part.and', 'و{part}', { part }) : part)).join(t('list.separator', '، ')) : t('visits.part.none', 'لا نافق ولا مستبعد');
}

/**
 * نتيجة حفظ زيارة بجملة (الجديدة من الجولة أو صفحة القاعة، والتعديل، والإلغاء): null = لم تُرفع بعد (بلا نت أو لم تصل)، فهي على هذا الجهاز.
 */
export function visitResultText(result: SendResult | null, action: 'new' | 'edit' | 'void'): ToastInput {
  if (result === null) return { tone: 'success', title: t('round.status.device', 'محفوظة على هذا الجهاز وتُرسل حين يعود الاتصال') };
  if (result.kind === 'saved') {
    const title = action === 'void' ? t('visits.voided', 'أُلغيت الزيارة وطُرح ما فيها من مجموع اليوم.') : action === 'edit' ? t('visits.edited', 'حُفظ تعديل الزيارة.') : t('visits.saved', 'حُفظت الزيارة.');
    return { tone: 'success', title };
  }
  if (result.kind === 'parked') return { tone: 'warning', title: t('round.status.parked', 'رُدّت إلى المدير: أُغلق الفوج، أو خرج من نطاقك، أو صار التاريخ قديماً أو داخل فترة مقفلة') };
  if (result.kind === 'stale_visit') {
    return { tone: 'danger', title: t('visits.stale', 'تغيّرت هذه الزيارة من جهاز آخر قبل أن يصل طلبك، فلم يُكتب فوقها.'), detail: t('visits.to_shelf', 'تجدها في «جولات تحتاج مراجعة» بصفحة الجولة اليومية.') };
  }
  if (result.kind === 'stale_day' || result.kind === 'rejected') {
    return { tone: 'danger', title: t('hall.day.review', 'لم تُحفظ: راجعها في «جولات تحتاج مراجعة» بصفحة الجولة اليومية.'), ...(result.kind === 'rejected' ? { detail: describeError(new RejectedError(result.code, result.hint)).detail } : {}) };
  }
  return { tone: 'warning', title: t('round.status.held', 'تنتظر: ادخل من جديد لتُرسل') };
}

export interface HallVisitsProps {
  kind: FlockKind;
  flockId: string;
  day: Day;
  /** يسجّل ويعدّل ويلغي: flock_day.save، ويوم ما زالت الجولة تقبله. */
  canSave: boolean;
  /** الحيّ بداية ذلك اليوم لفحص التعديل قبل الحفظ؛ null = بلا فحص بالجهاز (الخادم يفحص). */
  liveStart: number | null;
  /** يتغيّر بعد كلّ زيارة جديدة من الأب، فتُقرأ من جديد. */
  refresh?: number;
  onCount?: (visits: number) => void;
  onChanged?: () => void;
}

const FIELDS: (keyof RoundText)[] = ['dead', 'culled', 'feedKg', 'eggsTotal', 'eggsBroken'];

function textOf(values: Values): RoundText {
  // الصفر يُعرض صفراً: زيارة «لا نافق» وحدها تبقى زيارة بعد التعديل (خانات فارغة كلّها empty_visit).
  return { dead: countText(values.dead), culled: countText(values.culled), feedKg: amountText(values.feedKg), eggsTotal: countText(values.eggsTotal), eggsBroken: countText(values.eggsBroken) };
}

/** نافذة «عدّل الزيارة»: الخانات من لقطة الزيارة لحظة الفتح، والفحص على مجموع اليوم بلا هذه الزيارة. */
function EditVisit({ row, kind, liveStart, others, busy, onClose, onSave }: { row: VisitRow; kind: FlockKind; liveStart: number | null; others: { dead: number; culled: number; eggsTotal: number | null }; busy: boolean; onClose: () => void; onSave: (values: VisitValues) => void }) {
  const id = useId();
  const [start] = useState(() => textOf(row.values));
  const [text, setText] = useState(start);
  const [error, setError] = useState<{ field: keyof RoundText | null; message: string } | null>(null);
  const live = liveStart ?? Number.MAX_SAFE_INTEGER;
  const dirty = FIELDS.some((field) => text[field] !== start[field]);
  const save = () => {
    const read = readVisit(text, { kind, liveStart: live, totals: others });
    if ('error' in read) {
      setError({ field: read.field, message: errorText(read.error, live) });
      return;
    }
    // الخادم يرفض زيارة لا شيء فيها: «ألغِ» لإزالتها.
    if (emptyVisit(read.values) && row.values.eggsCracked === null && row.values.note === null) {
      setError({ field: null, message: t('visits.empty', 'الزيارة بلا أرقام: اكتب رقماً، أو ألغِ الزيارة.') });
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    onSave(read.values);
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
      title={t('visits.edit.title', 'عدّل زيارة {time}', { time: visitClock(row.recordedAt) })}
      footer={
        <Button onClick={save} busy={busy} data-action="visit-edit-save">
          {t('visits.edit.save', 'احفظ التعديل')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{t('visits.edit.hint', 'ما تكتبه هنا يحلّ محلّ هذه الزيارة كلّها، والفارغ لا شيء.')}</p>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([field, label, decimal]) => (
            <Field key={field} id={`${id}-${field}`} label={label} error={error?.field === field ? error.message : null}>
              <input
                id={`${id}-${field}`}
                className="input tabular-nums"
                dir="ltr"
                inputMode={decimal ? 'decimal' : 'numeric'}
                autoComplete="off"
                data-action={`visit-${field}`}
                value={text[field]}
                onChange={(event) => setText({ ...text, [field]: event.target.value })}
              />
            </Field>
          ))}
        </div>
        {error && error.field === null ? <Notice tone="danger" title={error.message} /> : null}
      </div>
    </Dialog>
  );
}

function sourceLabel(row: VisitRow): string | null {
  if (row.device) return row.device.kind === 'void' ? t('visits.device.void', 'تُلغى على هذا الجهاز') : t('visits.device', 'على هذا الجهاز');
  if (row.source === 'legacy') return t('visits.source.legacy', 'قديمة');
  if (row.source === 'day_total') return t('visits.source.day_total', 'مجموع اليوم');
  return null;
}

function HallVisitsView({ kind, flockId, day, canSave, liveStart, refresh = 0, onCount, onChanged }: HallVisitsProps) {
  const stamp = useStamp();
  const online = useStore(onlineStore);
  const uploads = useStore(roundQueueStore).seq;
  const [tick, setTick] = useState(0);
  const load = useCallback(() => loadRoundVisits(day, kind, flockId), [day, kind, flockId]);
  const state = useLoad(load, `${uploads}:${refresh}:${tick}`);
  // آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (لا تقفز القائمة ولا تُطوى نوافذها).
  const readKey = `${flockId}:${day}`;
  const [kept, setKept] = useState<{ key: string; data: RoundVisits } | null>(null);
  if (state.data !== null && (kept?.data !== state.data || kept.key !== readKey)) setKept({ key: readKey, data: state.data });
  const data = state.data ?? (kept?.key === readKey ? kept.data : null);
  const server = data ? (data.flocks.find((entry) => entry.flockId === flockId)?.visits ?? NONE) : null;

  // عمليات هذا الجهاز لهذه القاعة وهذا اليوم (الطابور نفسه).
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  const [device, setDevice] = useState<{ key: string; ops: OutboxOp[] } | null>(null);
  const deviceKey = `${userId}:${orgId}:${flockId}:${day}`;
  useEffect(() => {
    if (!userId || !orgId) return;
    let cancelled = false;
    openOutbox()
      .then((db) => pendingOps(db, { userId, orgId, displayName }))
      .then(
        (ops) => {
          if (!cancelled) setDevice({ key: `${userId}:${orgId}:${flockId}:${day}`, ops: ops.filter((op) => op.flockId === flockId && op.day === day) });
        },
        () => {
          /* swallow-ok: الطابور ما انقرا (IndexedDB ممنوع)؛ القائمة تعرض زيارات الخادم وحدها */
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, displayName, flockId, day, uploads, refresh, tick]);
  const ops = device?.key === deviceKey ? device.ops : [];
  const rows = visitRows(server ?? [], ops, stamp?.displayName ?? null);
  const counted = rows.filter((row) => row.device?.kind !== 'void');
  const count = server === null ? null : counted.length;
  useEffect(() => {
    if (count !== null) onCount?.(count);
  }, [count, onCount]);

  const [editing, setEditing] = useState<VisitRow | null>(null);
  const [voiding, setVoiding] = useState<VisitRow | null>(null);
  const [busy, setBusy] = useState(false);

  /** مجموع خانة لزيارات اليوم الحيّة، بلا الزيارة المعدَّلة (بمعرّفها: القائمة تُقرأ من جديد والنافذة على لقطتها). */
  const sum = (pick: (values: Values) => number | null, except: VisitRow | null = null): number | null =>
    counted.reduce<number | null>((total, row) => {
      if (row.id === except?.id) return total;
      const value = pick(row.values);
      return value === null ? total : (total ?? 0) + value;
    }, null);

  /** تعديل الزيارة أو إلغاؤها (values = null) بعملية في الطابور، ثمّ رفعها إن كان اتصال، والنتيجة بتنبيه. */
  const write = async (row: VisitRow, values: VisitValues | null) => {
    if (!stamp || busy) return;
    setBusy(true);
    const action = values === null ? 'void' : 'edit';
    try {
      const db = await openOutbox();
      // المحتوى كاملاً (لا دمج): المكتوب، أو الزيارة كما هي للإلغاء؛ والمشعور والملاحظة (لا خانة لهما هنا) كما في اللقطة.
      const content = values ?? contentOf(row.values);
      const op = await saveRound(db, stamp, {
        fn: 'save_flock_visit',
        flockId,
        day,
        payload: { visitId: row.id, recordedAt: row.recordedAt, ...content, eggs_cracked: row.values.eggsCracked, note: row.values.note, void: values === null },
        baseVersion: row.version,
      });
      setEditing(null);
      setVoiding(null);
      setTick((n) => n + 1);
      if (op === null) {
        toast({ tone: 'success', title: t('visits.dropped', 'أُلغيت الزيارة من هذا الجهاز قبل أن تُرسل.') });
      } else if (online) {
        const results = await uploadRounds(stamp, loadTransport).catch(() => []); /* swallow-ok: الرفع فشل (IndexedDB)؛ العملية باقية بالجهاز وترتفع بالمحاولة الجاية */
        toast(visitResultText(results.find((entry) => entry.opId === op.id)?.result ?? null, action));
      } else {
        void refreshRoundQueue(stamp).catch(() => {
          /* swallow-ok: عدّ الطابور تعذّر؛ الرأس يتحدّث بالرفع الجاي */
        });
        toast(visitResultText(null, action));
      }
      onChanged?.();
    } catch (failure) {
      toast({ tone: 'danger', title: describeError(failure).title, detail: describeError(failure).detail });
    } finally {
      setBusy(false);
    }
  };

  const feeds = counted.flatMap((row) => (row.values.feedKg === null ? [] : [row.values.feedKg]));
  const feedDecimals = columnDecimals(feeds, 3) as 0 | 1 | 2 | 3;
  const feedTotal = feeds.reduce((total, value) => total + value, 0n);
  const eggs = (pick: (values: Values) => number | null) => (row: VisitRow) => {
    const value = pick(row.values);
    return value === null ? '—' : <Num>{fmtInt(value)}</Num>;
  };
  const totalOf = (pick: (values: Values) => number | null) => {
    const value = sum(pick);
    return value === null ? '—' : <Num>{fmtInt(value)}</Num>;
  };
  const columns: Column<VisitRow>[] = [
    { key: 'time', header: t('visits.col.time', 'الوقت'), cell: (row) => <Num>{visitClock(row.recordedAt)}</Num> },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (row) => <Num>{fmtInt(row.values.dead)}</Num>, total: totalOf((values) => values.dead) },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (row) => <Num>{fmtInt(row.values.culled)}</Num>, total: totalOf((values) => values.culled) },
    {
      key: 'feed',
      header: t('round.feed', 'العلف (كغم)'),
      kind: 'number',
      cell: (row) => (row.values.feedKg === null ? '—' : <Num>{fmtQtyCell(row.values.feedKg, feedDecimals)}</Num>),
      total: feeds.length ? <Num>{fmtQtyCell(feedTotal, feedDecimals)}</Num> : '—',
    },
    ...(kind === 'layer'
      ? [
          { key: 'eggs', header: t('round.eggs_total', 'البيض (المجموع)'), kind: 'number' as const, cell: eggs((values) => values.eggsTotal), total: totalOf((values) => values.eggsTotal) },
          { key: 'broken', header: t('round.eggs_broken', 'المكسور'), kind: 'number' as const, cell: eggs((values) => values.eggsBroken), total: totalOf((values) => values.eggsBroken) },
        ]
      : []),
    {
      key: 'by',
      header: t('visits.col.by', 'سجّلها'),
      wrap: true,
      cell: (row) => {
        const tag = sourceLabel(row);
        return (
          <span data-visit-device={row.device?.kind ?? undefined}>
            {row.by ?? '—'}
            {tag ? <span className="text-xs text-ink-muted"> · {tag}</span> : null}
          </span>
        );
      },
    },
    ...(canSave
      ? [
          {
            key: 'actions',
            header: t('visits.col.actions', 'تعديل'),
            cell: (row: VisitRow) =>
              !row.device || (row.device.pending && row.device.kind !== 'void') ? (
                <span className="inline-flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(row)} disabled={busy} data-action="visit-edit">
                    {t('visits.edit', 'عدّل')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setVoiding(row)} disabled={busy} data-action="visit-void">
                    {t('visits.void', 'ألغِ')}
                  </Button>
                </span>
              ) : null,
          },
        ]
      : []),
  ];

  const failed = state.error !== null && server === null;
  return (
    <div className="flex flex-col gap-2" data-action="hall-visits">
      {failed ? (
        state.error instanceof NotConnectedError || !online ? (
          <p className="text-sm text-ink-muted" data-action="visits-offline">
            {t('visits.offline', 'زيارات اليوم تحتاج اتصالاً بالإنترنت.')}
          </p>
        ) : (
          <LoadFailed what={t('visits.what', 'زيارات اليوم')} error={state.error} onRetry={state.retry} />
        )
      ) : null}
      {server !== null || rows.length > 0 ? (
        <DataTable
          caption={t('visits.caption', 'زيارات اليوم')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={t('visits.empty_list', 'لا زيارات لهذا اليوم بعد.')}
          totalLabel={t('visits.total', 'مجموع اليوم')}
        />
      ) : null}
      {editing ? (
        <EditVisit
          row={editing}
          kind={kind}
          liveStart={liveStart}
          others={{ dead: sum((values) => values.dead, editing) ?? 0, culled: sum((values) => values.culled, editing) ?? 0, eggsTotal: sum((values) => values.eggsTotal, editing) }}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(values) => void write(editing, values)}
        />
      ) : null}
      {voiding ? (
        <ConfirmDialog
          open
          title={t('visits.void.title', 'ألغِ زيارة {time}؟', { time: visitClock(voiding.recordedAt) })}
          consequence={t('visits.void.body', 'تُلغى زيارة {time}، ويُطرح من مجموع اليوم: {what}.', { time: visitClock(voiding.recordedAt), what: valuesText(voiding.values) })}
          confirmLabel={t('visits.void.go', 'ألغِ الزيارة')}
          busy={busy}
          action="visit-void-confirm"
          onConfirm={() => void write(voiding, null)}
          onCancel={() => setVoiding(null)}
        />
      ) : null}
    </div>
  );
}

/** حدّ صامت: خطأ رسم في القائمة يقول ذلك ولا يُسقط الجولة أو صفحة القاعة. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p className="text-sm text-ink-muted">{t('visits.broken', 'تعذّر عرض زيارات اليوم.')}</p> : this.props.children;
  }
}

export default function HallVisits(props: HallVisitsProps) {
  return (
    <Quiet>
      <HallVisitsView {...props} />
    </Quiet>
  );
}
