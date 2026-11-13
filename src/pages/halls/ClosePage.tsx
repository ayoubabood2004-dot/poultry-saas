import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import type { Milli } from '../../domain/money';
import { parseQty, type BaseUnit } from '../../domain/units';
import { parseDayText } from '../../lib/dayText';
import { RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { closeFlock, loadCloseForm, type CloseAction, type CloseForm, type CloseItem, type CloseRequest } from '../../lib/repo/flockClose';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { amountText, failureText, pendingKey, readPending, storePending, surelyUnsaved } from './GivePage';
import { BackLink, flockPath, kgText, ofDaysText } from './parts';
import { birdsText, kgDecimals, signedCount, ticketBack, ticketBackLabel, ticketName, ticketPath } from './ticketParts';

// «أغلق الدورة» (0028، كلمة المالك 2026-11-12 وأجوبته O2–O5، العقد §4.7 و§5.6 و§10): /halls/close/:flockId بقراءة flock_close_form. خلاصة الطيور (الحيّ
// والنافق والمستبعد والمباع من الفواتير المرحّلة، لا يُكتب مرّتين)، وتذاكر بلا فاتورة تمنع الإغلاق بروابطها، و«فرق العدّ» = −الحيّ بسبب إلزاميّ يُكتب
// مع الإغلاق (يظهر وحده لا مع النافق)، ويوم الإغلاق (المقترح من الخادم، بين أقدم يوم يُقبل واليوم)، وتقدير العلف الباقي، ولكلّ مادّة نزلت للقاعة مصير
// واحد لباقيها: يرجع إلى مخزن جاء منه، أو يُحسب مستهلَكاً، أو ينتقل للدورة التالية في القاعة. ويُرسل ما عرضته الشاشة شرطاً (الحيّ والمباع وما نزل لكلّ
// مادّة، D8). وتأكيد يسمّي النتيجة كلّها. والطلب الذي لا تُعرف نتيجته خارج المكوّن (sessionStorage بمفتاح المستخدم والمنشأة والفوج، والذاكرة إن تعذّر):
// الصفحة تعود مجمَّدة به و«أعد المحاولة» ترسله حرفاً (درس 2026-11-10). للمدير وحده (flock.manage).

const dash = () => t('halls.close.dash', '—');
const ACTIONS: readonly CloseAction[] = ['return', 'consumed', 'carry'];

function actionLabel(action: CloseAction): string {
  if (action === 'return') return t('halls.close.action.return', 'يرجع إلى مخزن');
  if (action === 'consumed') return t('halls.close.action.consumed', 'مستهلَك');
  return t('halls.close.action.carry', 'للدورة التالية');
}

/** لماذا لا إغلاق من نموذج الخادم (why_not)، بجملة؛ ورمز لا تعرفه الشاشة بجملة عامّة. */
function whyNotText(code: string | null): string {
  switch (code) {
    case 'closed':
    case 'flock_closed':
      return t('halls.close.why.closed', 'الدورة مغلقة من قبل.');
    case 'layer':
    case 'close_layer_later':
      return t('halls.close.why.layer', 'إغلاق دورة البيّاض يأتي مع بيع الدجاج المستبعد.');
    case 'forbidden':
    case 'role':
      return t('halls.close.why.role', 'إغلاق الدورة للمدير وحده.');
    case 'not_active':
    case 'preparing':
      return t('halls.close.why.not_active', 'الفوج ليس قائماً، فلا تُغلق دورته.');
    case 'tickets_pending':
      return t('halls.close.why.tickets', 'تذاكر وزن بلا فاتورة لهذه القاعة: تُصدر فواتيرها أو تُلغى قبل الإغلاق.');
    default:
      return t('halls.close.why.other', 'لا تُغلق هذه الدورة الآن.');
  }
}

/** ما كُتب لكلّ مادّة: الباقي نصّاً، والمصير، والمخزن. */
interface ItemDraft {
  qty: string;
  action: CloseAction | null;
  warehouseId: string | null;
}

/** الطلب كما أُرسل، ومعه الأسماء والوحدات للعرض وحده (لا تُرسل). */
interface ClosePending {
  request: CloseRequest;
  hall: string;
  names: Record<string, string>;
  units: Record<string, BaseUnit>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function asClosePending(value: unknown): ClosePending | null {
  if (!isRecord(value) || !isRecord(value.request) || typeof value.hall !== 'string' || !isRecord(value.names) || !isRecord(value.units)) return null;
  const request = value.request;
  if (typeof request.clientRef !== 'string' || typeof request.closeId !== 'string' || typeof request.flockId !== 'string' || typeof request.on !== 'string' || !Array.isArray(request.lines)) return null;
  return value as unknown as ClosePending;
}

/** سطور الطلب بجدول: المادّة والباقي بوحدتها والمصير والمخزن. */
function SentLines({ pending, caption }: { pending: ClosePending; caption: string }) {
  type Line = CloseRequest['lines'][number];
  const columns: Column<Line>[] = [
    { key: 'item', header: t('halls.close.col.item', 'المادّة'), cell: (line) => pending.names[line.itemId] ?? dash() },
    { key: 'qty', header: t('halls.close.col.left', 'الباقي'), cell: (line) => amountText(line.qty, pending.units[line.itemId] ?? 'kg') },
    { key: 'action', header: t('halls.close.col.action', 'المصير'), cell: (line) => actionLabel(line.action) },
    { key: 'store', header: t('halls.close.col.store', 'المخزن'), cell: (line) => (line.warehouseId ? (pending.names[line.warehouseId] ?? dash()) : dash()) },
  ];
  return <DataTable caption={caption} columns={columns} rows={pending.request.lines} rowKey={(line) => line.itemId} empty={t('halls.close.no_lines', 'لا باقٍ: كلّ ما نزل للقاعة يُحسب مستهلَكاً.')} />;
}

/**
 * جملة التأكيد من الطلب نفسه (مراجعة 0028 S5: كانت تأخذ الحيّ من آخر قراءة، فتسمّي فرقاً غير الذي يُرسل): الإغلاق بيومه، وفرق العدّ = −الحيّ الذي
 * يُرسل شرطاً، ومصير كلّ باقٍ، ثمّ أنّ لا شيء يُسجَّل بعده.
 */
function confirmText(pending: ClosePending): string {
  const { request, names, units, hall } = pending;
  const separator = t('list.separator', '، ');
  const parts = [t('halls.close.confirm.head', 'تُغلق دورة «{hall}» يوم {day}', { hall, day: fmtDay(request.on) })];
  if (request.expectedLive > 0) parts.push(t('halls.close.confirm.count', 'ويُكتب فرق العدّ {n}', { n: signedCount(-request.expectedLive) }));
  for (const line of request.lines) {
    const qty = amountText(line.qty, units[line.itemId] ?? 'kg');
    const item = names[line.itemId] ?? '';
    if (line.action === 'return') parts.push(t('halls.close.confirm.return', 'ويرجع {qty} «{item}» إلى «{store}»', { qty, item, store: line.warehouseId ? (names[line.warehouseId] ?? '') : '' }));
    else if (line.action === 'carry') parts.push(t('halls.close.confirm.carry', 'ويُنقل {qty} «{item}» للدورة التالية في القاعة', { qty, item }));
    else parts.push(t('halls.close.confirm.consumed', 'ويُحسب {qty} «{item}» مستهلَكاً', { qty, item }));
  }
  return t('halls.close.confirm.body', '{parts}. لا يُسجَّل على الفوج شيء بعد الإغلاق.', { parts: parts.join(separator) });
}

/** رفوض تعني أنّ ما عرضته الشاشة تغيّر: يُقرأ النموذج من جديد ويبقى ما كُتب. */
const REREAD = new Set(['live_changed', 'sales_changed', 'pool_changed', 'tickets_pending', 'activity_after_close', 'flock_closed', 'not_in_pool', 'pool_unit_mixed', 'not_from_store']);

function CloseView({ flockId }: { flockId: string }) {
  const id = useId();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const pendingId = workspace ? pendingKey(`${workspace.userId}:${workspace.orgId}`, `close:${flockId}`) : '';
  const load = useCallback(() => loadCloseForm(flockId), [flockId]);
  const state = useLoad(load, flockId);
  const [kept, setKept] = useState<CloseForm | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const form = state.data ?? kept;
  const back = ticketBack(params.get('back'), form ? flockPath(form.flock.kind, form.flock.id) : '/broiler');

  const [items, setItems] = useState<Record<string, ItemDraft>>({});
  const [dayText, setDayText] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [ids, setIds] = useState(() => ({ ref: crypto.randomUUID(), closeId: crypto.randomUUID() }));
  const [confirm, setConfirm] = useState<ClosePending | null>(null);
  const [frozen, setFrozen] = useState<ClosePending | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unreached, setUnreached] = useState(false);
  const sending = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // طلب معلَّق من فتح سابق: تعود الصفحة مجمَّدة به. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (مرّة لكلّ مفتاح).
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (pendingId !== '' && restoredFor !== pendingId) {
    setRestoredFor(pendingId);
    setFrozen(asClosePending(readPending(pendingId)));
  }
  const dirty = Object.values(items).some((item) => item.qty.trim() !== '' || item.action !== null) || reason.trim() !== '' || note.trim() !== '' || dayText !== null;
  useDirtyForm(dirty || busy || frozen !== null);

  /** نداء close_flock بطلب محفوظ: الأوّل من التأكيد، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const submit = async (pending: ClosePending, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setUnreached(false);
    // الطلب محفوظ خارج المكوّن قبل أن يخرج: رجوع أو إعادة تحميل قبل الجواب تعيد الصفحة مجمَّدة به.
    storePending(pendingId, pending);
    try {
      const result = await closeFlock(pending.request);
      storePending(pendingId, null);
      toast({ tone: 'success', title: t('halls.close.done', 'أُغلقت دورة «{hall}» يوم {day}.', { hall: result.hallName, day: fmtDay(result.closedOn) }) });
      if (!live.current) return;
      setFrozen(null);
      setConfirm(null);
      navigate(`/halls/report/${flockId}?${new URLSearchParams({ back }).toString()}`);
    } catch (problem) {
      setConfirm(null);
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن أُغلقت: الصفحة تتجمّد بطلبها، والإعادة وحدها ممكنة.
        setFrozen(pending);
        setUnreached(retrying && surelyUnsaved(problem));
        if (!live.current) toast({ tone: 'warning', title: t('halls.close.unknown_away', 'لا نعرف إن أُغلقت دورة «{hall}»: افتح «أغلق الدورة» لها وأعد المحاولة؛ لن تُغلق مرّتين.', { hall: pending.hall }) });
        return;
      }
      // جواب أكيد بلا إغلاق: ما كُتب باقٍ، والإرسال التالي بمرجع جديد (ومعرّف إغلاق جديد بعد id_conflict).
      storePending(pendingId, null);
      setFrozen(null);
      if (!live.current) {
        toast({ tone: 'danger', title: t('halls.close.refused_away', 'لم تُغلق دورة «{hall}».', { hall: pending.hall }), detail: failureText(problem) });
        return;
      }
      setIds((current) => ({ ref: crypto.randomUUID(), closeId: problem instanceof RejectedError && problem.code === 'id_conflict' ? crypto.randomUUID() : current.closeId }));
      setFailure(problem);
      if (problem instanceof RejectedError && REREAD.has(problem.code)) state.retry();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (frozen) {
    const send = () => void submit(frozen, true);
    return (
      <div className="flex flex-col gap-4" data-action="close-page">
        <BackLink to={back} label={ticketBackLabel(back)} />
        <h1 className="text-2xl font-semibold">{t('halls.close.title', 'أغلق دورة «{hall}»', { hall: frozen.hall })}</h1>
        <section className="card flex flex-col gap-3 p-4" data-action="close-frozen">
          <Notice tone="warning" title={t('halls.close.unknown', 'لا نعرف إن أُغلقت الدورة: أعد المحاولة؛ لن تُغلق مرّتين.')}>
            {t('halls.close.unknown.sent', 'أُرسل الإغلاق يوم {day} بما في الجدول، والإعادة بالطلب نفسه.', { day: fmtDay(frozen.request.on) })}
          </Notice>
          <SentLines pending={frozen} caption={t('halls.close.sent', 'ما أُرسل')} />
          {unreached ? <Notice tone="danger" title={t('give.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.')} /> : null}
          <div>
            <Button size="lg" busy={busy} onClick={send} data-action="close-retry">
              {t('issue.retry', 'أعد المحاولة')}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-col gap-4" data-action="close-page">
        <BackLink to={back} label={ticketBackLabel(back)} />
        {state.error ? (
          state.error instanceof RejectedError && state.error.hint ? (
            <Notice tone="warning" title={state.error.hint} />
          ) : (
            <LoadFailed what={t('halls.close.what', 'نموذج إغلاق الدورة')} error={state.error} onRetry={state.retry} />
          )
        ) : (
          <p role="status" className="text-sm text-ink-muted" data-action="close-loading">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )}
      </div>
    );
  }

  const { flock, sales, feed } = form;
  const here = `/halls/close/${flockId}?${new URLSearchParams({ back }).toString()}`;
  const text = dayText ?? fmtDay(form.defaultOn);
  const day = parseDayText(text);
  const dayError =
    day === null
      ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
      : day > form.today
        ? t('day.future', 'التاريخ بعد اليوم.')
        : day < form.earliestOn
          ? t('halls.close.day_old', 'أقدم يوم يُقبل للإغلاق {day} (آخر ما سُجّل على الفوج، وحدّ الأيّام السبعة).', { day: fmtDay(form.earliestOn) })
          : null;
  const needReason = flock.live > 0;
  const reasonError = needReason && reason.trim() === '' ? t('halls.close.reason_need', 'اكتب سبب «فرق العدّ».') : reason.trim().length > 500 ? t('halls.close.reason_long', 'السبب حتى 500 حرف.') : null;
  const noteError = note.trim().length > 500 ? t('halls.close.note_long', 'الملاحظة حتى 500 حرف.') : null;

  const draftOf = (item: CloseItem): ItemDraft => items[item.itemId] ?? { qty: '', action: null, warehouseId: item.defaultStore };
  const edit = (item: CloseItem, patch: Partial<ItemDraft>) => {
    setFailure(null);
    setItems((current) => ({ ...current, [item.itemId]: { ...(current[item.itemId] ?? { qty: '', action: null, warehouseId: item.defaultStore }), ...patch } }));
  };
  /** باقي المادّة مقروءاً: null بلا باقٍ، أو خطؤه. */
  const lineOf = (item: CloseItem): { qty: Milli | null; error: string | null } => {
    const draft = draftOf(item);
    if (draft.qty.trim() === '') return { qty: null, error: null };
    const qty = parseQty(draft.qty);
    if (qty === null || qty < 0n) return { qty: null, error: t('halls.close.qty_bad', 'اكتب الباقي رقماً من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.') };
    if (qty === 0n) return { qty: null, error: null };
    if (item.baseUnit === 'pc' && qty % 1000n !== 0n) return { qty: null, error: t('issue.qty.pieces', '«{name}» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً.', { name: item.name }) };
    if (qty > item.poolQty) return { qty: null, error: t('halls.close.over_pool', 'الباقي المكتوب من «{item}» أكثر ممّا نزل للقاعة ({pool}).', { item: item.name, pool: amountText(item.poolQty, item.baseUnit) }) };
    if (draft.action === null) return { qty, error: t('halls.close.action_need', 'اختر مصير باقي «{item}».', { item: item.name }) };
    if (draft.action === 'return') {
      const store = item.stores.find((entry) => entry.warehouseId === draft.warehouseId);
      if (!store || !store.usable) return { qty, error: t('halls.close.store_need', 'اختر المخزن الذي يرجع إليه «{item}».', { item: item.name }) };
    }
    return { qty, error: null };
  };
  const lines = form.items.map((item) => ({ item, ...lineOf(item) }));
  const lineErrors = lines.flatMap((line) => (line.error ? [line.error] : []));
  const pendingTickets = form.pendingTickets.length > 0;
  const problems = [dayError, reasonError, noteError, ...lineErrors].filter((problem): problem is string => problem !== null);
  // والنموذج يُقرأ من جديد (بعد رفضٍ أكيد) أو فشلت قراءته: المعروض قراءةٌ قديمة والطلب يُبنى ممّا يُعرض، فلا إغلاق حتى تصل القراءة (مراجعة 0028 S5،
  // درس 2026-11-09).
  const ready = form.canClose && !pendingTickets && problems.length === 0 && day !== null && !busy && state.data !== null;

  const openConfirm = () => {
    if (!ready || day === null) return;
    const names: Record<string, string> = {};
    const units: Record<string, BaseUnit> = {};
    for (const item of form.items) {
      names[item.itemId] = item.name;
      units[item.itemId] = item.baseUnit;
      for (const store of item.stores) names[store.warehouseId] = store.name;
    }
    const request: CloseRequest = {
      clientRef: ids.ref,
      closeId: ids.closeId,
      flockId,
      on: day,
      expectedLive: flock.live,
      expectedSold: sales.birds,
      expectedPools: form.items.map((item) => ({ itemId: item.itemId, qty: item.poolQty })),
      countReason: needReason ? reason : null,
      lines: lines.flatMap((line) => {
        const draft = draftOf(line.item);
        if (line.qty === null || draft.action === null) return [];
        return [{ itemId: line.item.itemId, qty: line.qty, action: draft.action, warehouseId: draft.action === 'return' ? draft.warehouseId : null }];
      }),
      note: note.trim() === '' ? null : note,
    };
    setConfirm({ request, hall: flock.hallName, names, units });
  };

  const itemColumns: Column<CloseItem>[] = [
    {
      key: 'item',
      header: t('halls.close.col.item', 'المادّة'),
      wrap: true,
      cell: (item) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{item.name}</span>
          {item.carryInQty > 0n ? <span className="text-xs text-ink-muted">{t('halls.close.carry_in', 'منه من الدورة السابقة {qty}', { qty: amountText(item.carryInQty, item.baseUnit) })}</span> : null}
        </span>
      ),
    },
    { key: 'pool', header: t('halls.close.col.pool', 'نزل للقاعة'), cell: (item) => <span data-action="close-pool">{amountText(item.poolQty, item.baseUnit)}</span> },
    {
      key: 'left',
      header: t('halls.close.col.left', 'الباقي'),
      cell: (item) => (
        <input
          className="input w-32 tabular-nums"
          dir="ltr"
          inputMode="decimal"
          autoComplete="off"
          aria-label={t('halls.close.left_label', 'باقي «{item}»', { item: item.name })}
          value={draftOf(item).qty}
          disabled={busy}
          onChange={(event) => edit(item, { qty: event.target.value })}
          data-action="close-qty"
          data-item={item.itemId}
        />
      ),
    },
    {
      key: 'action',
      header: t('halls.close.col.action', 'المصير'),
      cell: (item) =>
        lineOf(item).qty === null ? (
          dash()
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('halls.close.action_label', 'مصير باقي «{item}»', { item: item.name })} data-action="close-actions" data-item={item.itemId}>
            {ACTIONS.map((action) => (
              <Button
                key={action}
                size="sm"
                variant={draftOf(item).action === action ? 'primary' : 'secondary'}
                aria-pressed={draftOf(item).action === action}
                disabled={busy}
                onClick={() => edit(item, { action })}
                data-action="close-action"
                data-value={action}
              >
                {actionLabel(action)}
              </Button>
            ))}
          </div>
        ),
    },
    {
      key: 'store',
      header: t('halls.close.col.store', 'المخزن'),
      cell: (item) =>
        draftOf(item).action === 'return' && lineOf(item).qty !== null ? (
          <select
            className="input"
            aria-label={t('halls.close.store_label', 'مخزن «{item}»', { item: item.name })}
            value={draftOf(item).warehouseId ?? ''}
            disabled={busy}
            onChange={(event) => edit(item, { warehouseId: event.target.value || null })}
            data-action="close-store"
            data-item={item.itemId}
          >
            <option value="">{t('halls.close.store_pick', 'اختر المخزن')}</option>
            {item.stores.map((store) => (
              <option key={store.warehouseId} value={store.warehouseId} disabled={!store.usable}>
                {store.usable ? store.name : t('halls.close.store_unusable', '{store} ({why})', { store: store.name, why: store.why === 'archived' ? t('halls.close.store_archived', 'مؤرشف') : t('halls.close.store_scope', 'خارج نطاقك') })}
              </option>
            ))}
          </select>
        ) : (
          dash()
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-action="close-page">
      <BackLink to={back} label={ticketBackLabel(back)} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-action="close-title">
          {t('halls.close.title', 'أغلق دورة «{hall}»', { hall: flock.hallName })}
        </h1>
        <p className="text-ink-muted">{t('halls.close.subtitle', '{site} — سُكّن يوم {day} بعدد {count}.', { site: flock.siteName, day: fmtDay(flock.placedOn), count: flock.placedCount })}</p>
      </header>
      {state.error ? <LoadFailed what={t('halls.close.what', 'نموذج إغلاق الدورة')} error={state.error} onRetry={state.retry} /> : null}
      {!form.canClose ? <Notice tone="info" title={whyNotText(form.whyNot)} /> : null}
      {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}

      <section className="card flex flex-col gap-3 p-4" data-action="close-birds">
        <h2 className="font-semibold">{t('halls.close.birds', 'الطيور')}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="min-w-0" data-action="close-placed">
            <dt className="text-xs text-ink-muted">{t('halls.rep.col.placed', 'المسكَّن')}</dt>
            <dd className="font-semibold">
              <Num>{fmtInt(flock.placedCount)}</Num>
            </dd>
          </div>
          <div className="min-w-0" data-action="close-dead">
            <dt className="text-xs text-ink-muted">{t('halls.close.dead_culled', 'النافق والمستبعد')}</dt>
            <dd className="font-semibold">
              <Num>{fmtInt(flock.dead + flock.culled)}</Num>
            </dd>
          </div>
          <div className="min-w-0" data-action="close-sold">
            <dt className="text-xs text-ink-muted">{t('halls.close.sold', 'المباع (من الفواتير)')}</dt>
            <dd className="font-semibold">
              <Num>{fmtInt(sales.birds)}</Num>
            </dd>
            <dd className="text-xs text-ink-muted">{t('halls.close.sold_kg', 'صافيه {kg}، ومعدّل الطير {avg} كغم', { kg: kgText(sales.netKg), avg: sales.avgKg === null ? dash() : fmtQtyCell(sales.avgKg, 3) })}</dd>
          </div>
          <div className="min-w-0" data-action="close-live">
            <dt className="text-xs text-ink-muted">{t('halls.close.live', 'الحيّ بحسب النظام')}</dt>
            <dd className="font-semibold">
              <Num>{fmtInt(flock.live)}</Num>
            </dd>
            {flock.countDiff !== 0 ? <dd className="text-xs text-ink-muted">{t('halls.close.count_so_far', 'بعد فرق عدّ سابق {n}', { n: signedCount(flock.countDiff) })}</dd> : null}
          </div>
        </dl>
        {sales.invoices.length ? (
          <DataTable
            caption={t('halls.close.invoices', 'فواتير الطيور المرحّلة')}
            columns={[
              { key: 'day', header: t('halls.tickets.col.day', 'اليوم'), cell: (row) => <Num>{fmtDay(row.soldOn)}</Num> },
              { key: 'ticket', header: t('halls.tickets.col.ticket', 'التذكرة'), cell: (row) => <bdi dir="ltr">{ticketName(row.ticketNo)}</bdi> },
              { key: 'doc', header: t('halls.tickets.col.sale', 'الفاتورة'), cell: (row) => (row.docNo === null ? dash() : <bdi dir="ltr">{row.docNo}</bdi>) },
              { key: 'birds', header: t('halls.ticket.col.birds', 'الطيور'), kind: 'number', cell: (row) => <Num>{fmtInt(row.birds)}</Num>, total: <Num>{fmtInt(sales.birds)}</Num> },
              {
                key: 'net',
                header: t('halls.ticket.net', 'الصافي (كغم)'),
                kind: 'number',
                cell: (row) => <Num>{fmtQtyCell(row.netKg, kgDecimals([...sales.invoices.map((x) => x.netKg), sales.netKg]))}</Num>,
                total: <Num>{fmtQtyCell(sales.netKg, kgDecimals([...sales.invoices.map((x) => x.netKg), sales.netKg]))}</Num>,
              },
            ]}
            rows={sales.invoices}
            rowKey={(row, index) => `${row.soldOn}|${index}`}
            empty={dash()}
            totalLabel={t('halls.ticket.total', 'المجموع')}
          />
        ) : null}
      </section>

      {pendingTickets ? (
        <div data-action="close-pending">
          <Notice tone="danger" title={t('halls.close.pending', 'تذاكر وزن بلا فاتورة لهذه القاعة: تُصدر فواتيرها أو تُلغى قبل إغلاق الدورة.')}>
            <span className="flex flex-wrap gap-3">
              {form.pendingTickets.map((ticket) => (
                <Link key={ticket.ticketId} to={ticketPath(ticket.ticketId, here)} className="font-semibold text-brand-700 dark:text-brand-200" data-action="close-pending-ticket">
                  {t('halls.close.pending_ticket', '{no} ({day})', { no: ticketName(ticket.ticketNo), day: fmtDay(ticket.onDate) })}
                </Link>
              ))}
            </span>
          </Notice>
        </div>
      ) : null}

      <section className="card flex flex-col gap-3 p-4" data-action="close-count">
        <h2 className="font-semibold">{t('halls.close.count', 'فرق العدّ')}</h2>
        {needReason ? (
          <>
            <p data-action="close-count-diff">
              {t('halls.close.count_text', 'الحيّ في القاعة بحسب النظام {live}، بلا بيع ولا نفوق مسجَّل: يُكتب مع الإغلاق «فرق العدّ» {n} بسبب، ويظهر وحده لا مع النافق.', { live: birdsText(flock.live), n: signedCount(-flock.live) })}
            </p>
            <Field id={`${id}-reason`} label={t('halls.close.reason', 'سبب «فرق العدّ»')} error={reason !== '' || failure ? reasonError : null}>
              <input id={`${id}-reason`} className="input" autoComplete="off" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} data-action="close-reason" />
            </Field>
          </>
        ) : (
          <p className="text-sm text-ink-muted" data-action="close-no-diff">
            {t('halls.close.no_diff', 'لا فرق عدّ: كلّ الطيور بيعت أو سُجّلت نافقة أو مستبعدة.')}
          </p>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-4" data-action="close-day">
        <Field id={`${id}-day`} label={t('halls.close.day', 'يوم الإغلاق')} error={dayError} hint={t('halls.close.day_hint', 'من {from} إلى {to}.', { from: fmtDay(form.earliestOn), to: fmtDay(form.today) })}>
          <input id={`${id}-day`} className="input w-32 tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={text} disabled={busy} onChange={(event) => setDayText(event.target.value)} data-action="close-day-input" />
        </Field>
      </section>

      <section className="card flex flex-col gap-3 p-4" data-action="close-feed">
        <h2 className="font-semibold">{t('halls.close.feed', 'الباقي في القاعة')}</h2>
        <p className="text-sm" data-action="close-estimate">
          {t('halls.close.estimate', 'النازل للقاعة {given}، والمأكول المسجّل {eaten}، فالمتوقّع في القاعة {left}.', { given: kgText(feed.givenKg), eaten: kgText(feed.eatenKg), left: kgText(feed.estimateLeftKg) })}
          {feed.feedDays < feed.feedSpan ? t('halls.close.estimate_days', ' سُجّل العلف {n} من {days}، فالتقدير ناقص.', { n: feed.feedDays, days: ofDaysText(feed.feedSpan) }) : ''}
          {feed.unweighed > 0 ? t('halls.close.estimate_unweighed', ' وسطور بلا وزن خارج الكيلو: {n}.', { n: feed.unweighed }) : ''}
        </p>
        <p className="text-sm text-ink-muted">{t('halls.close.items_hint', 'اكتب الباقي الفعليّ لكلّ مادّة بوحدتها، واختر مصيره. المادّة بلا باقٍ تُحسب مستهلَكة كلّها.')}</p>
        <DataTable caption={t('halls.close.items', 'ما نزل للقاعة وباقيه')} columns={itemColumns} rows={form.items} rowKey={(item) => item.itemId} empty={t('halls.close.no_items', 'لم ينزل للقاعة شيء من المخازن في هذه الدورة.')} />
        {lineErrors.map((error) => (
          <p key={error} role="alert" className="text-sm text-danger-700 dark:text-danger-300">
            {error}
          </p>
        ))}
        <Field id={`${id}-note`} label={t('halls.close.note', 'ملاحظة الإغلاق (اختياريّة)')} error={noteError}>
          <input id={`${id}-note`} className="input" autoComplete="off" value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} data-action="close-note" />
        </Field>
      </section>

      <div className="flex flex-col gap-2">
        {form.canClose && (pendingTickets || problems.length) ? (
          <p className="text-sm text-ink-muted" data-action="close-missing">
            {t('halls.close.missing', 'لتُغلق الدورة: {what}', { what: pendingTickets ? t('halls.close.missing_tickets', 'تُصدر فواتير التذاكر أو تُلغى أوّلاً.') : (problems[0] ?? '') })}
          </p>
        ) : null}
        {state.loading ? (
          <p role="status" className="text-sm text-ink-muted" data-action="close-reading">
            {t('halls.close.reading', 'يُقرأ النموذج من جديد…')}
          </p>
        ) : null}
        <div>
          <Button size="lg" disabled={!ready} busy={busy} onClick={openConfirm} data-action="close-go">
            {t('halls.close.go', 'أغلق الدورة')}
          </Button>
        </div>
      </div>

      {confirm ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('halls.close.confirm.title', 'أغلق دورة «{hall}» يوم {day}؟', { hall: confirm.hall, day: fmtDay(confirm.request.on) })}
          consequence={
            <div className="flex flex-col gap-3">
              <p data-action="close-confirm-text">{confirmText(confirm)}</p>
              <SentLines pending={confirm} caption={t('halls.close.confirm.table', 'مصير الباقي')} />
            </div>
          }
          confirmLabel={t('halls.close.go', 'أغلق الدورة')}
          busy={busy}
          action="close-confirm"
          onConfirm={() => void submit(confirm, false)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

export default function ClosePage() {
  const { flockId = '' } = useParams();
  return <CloseView key={flockId} flockId={flockId} />;
}
