import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { WeightPad } from '../../components/ui/WeightPad';
import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import { naturalCompare } from '../../domain/naturalOrder';
import { parseDayText } from '../../lib/dayText';
import { describeError, NotConnectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtMilli, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import { openOutbox, pendingOps, reviewEntries, saveRound, type EnqueueInput, type OutboxOp, type SendResult } from '../../lib/outbox';
import type { FlockSummary, HallView, SiteView } from '../../lib/repo/flocks';
import { recordFlockWeight } from '../../lib/repo/flocks';
import { decideFlockReject, loadHallSheet, sendFlockFeed, toBaseQty, voidSheetFeed, type FeedSend, type HallSheet, type RejectDecision, type SheetDay, type SheetFeedItem, type SheetFeedLine, type SheetReject, type SheetUnit } from '../../lib/repo/hallSheet';
import { refreshRoundQueue, roundQueueStore, uploadRounds } from '../../lib/roundUploads';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import FlockCard from '../halls/FlockCard';
import { failureText, pendingKey, readPending, storePending, surelyUnsaved } from '../halls/GivePage';
import { newTicketPath } from '../halls/ticketParts';
import { CARD_CLASS, givePath, LINK_CLASS } from './feed';
import { FlockEditDialog } from './FlockEditDialog';
import { HallDialog, OpenFlockDialog } from './hallDialogs';
import { loadTransport, parkText, soFar } from './roundText';
import { farmPath, farmTitle, hallLabel, hallPath, loadOverviewKept, useStamp } from './shared';

// صفحة القاعة = ورقة القاعة (طلب المالك 2026-11-21 بصورة ورقته «هلاكات قاعة (7)»، «وجبة 2026-11-13»؛ عقد 0034/0035 الجزء C/S2،
// docs/HALLS_SHEET_PLAN.md المرحلة ٢): العنوان «هلاكات قاعة (N)» وتحته «وجبة يوم/شهر/سنة»، ثمّ صفّ واحد من الأفعال الكبيرة بلا قوائم داخل قوائم
// («أرسل علفاً» و«بيع» و«التقرير» و«عدّل الوجبة» و«أغلق الوجبة» أو «أعِد فتحها»)، ثمّ جدول الورقة نفسه من hall_sheet: العمر | التاريخ | الهلاكات |
// الغاز | العلف | الملاحظات (وللبيّاض البيض)، صفّ لكلّ يوم من التسكين حتى نهاية الوجبة، واليوم معلَّم وظاهر عند الفتح، وصفّ مجموع من الخادم.
// لمسة على خانة الهلاكات أو الغاز أو البيض أو الملاحظة تفتح ورقة سفلية بلوحة أرقام التطبيق و«تم» (هلاكات يوم = 3 لمسات)، بالطابور نفسه بلا نت:
// الهلاكات والبيض والملاحظة save_flock_day بنسخة صفّ اليوم (والمستبعد القديم يُصفَّر فيبقى داخل الهلاكات)، والغاز set_flock_gas بنسخة صفّه؛ والخانة
// «بانتظار الرفع» حتى تُحفظ. ولمسة على خانة العلف (أو «أرسل علفاً» لليوم) تفتح ورقة العلف: ما أُرسل لذلك اليوم بـ«ألغِ»، واختيار العلف (آخره جاهز)
// والكمية بالكيس أو الكيلو، و«أرسل» من «رصيد العلف» بنت (send_flock_feed) بمرجع محفوظ خارج المكوّن. وكلّ أيام الوجبة القائمة تُكتب مهما فاتت (لا حدّ
// أيام سبعة)، والمغلقة قراءة فقط. وما رُدّ من الأجهزة (flock_day_rejects) جمل بـ«أُدخلت» و«تجاهل»، وما بقي على هذا الجهاز ولم يُحفظ يُدلّ عليه.

type Nav = { prev: HallView | null; next: HallView | null };
type CellField = 'dead' | 'gas' | 'eggs' | 'note';

/** آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (useLoad يرجّع null أثناءها): الورقة ونوافذها لا تُطوى ولا تقفز. */
function useKept<T>(data: T | null): T | null {
  const [kept, setKept] = useState<T | null>(data);
  if (data !== null && data !== kept) setKept(data);
  return data ?? kept;
}

/** «هلاكات قاعة (7)»: الرقم وحده رقم القاعة، و«قاعة 5» تُقرأ «5»، وغيرها باسمها. */
function sheetTitle(name: string): string {
  const trimmed = name.trim().replace(/^قاعة\s+/u, ''); // i18n-ok: بادئة اسم القاعة كما يكتبه المدير تُشال من العنوان
  return t('sheet.title', 'هلاكات قاعة ({hall})', { hall: trimmed });
}

/** عمليات هذا الجهاز لهذا الفوج ولم تُرفع بعد، ومرفوضاته في رفّ المراجعة: تُقرأ عند الفتح وبعد كلّ رفع وكلّ حفظ. */
function useDeviceOps(flockId: string, tick: number): { ops: readonly OutboxOp[]; review: number } {
  const stamp = useStamp();
  const uploads = useStore(roundQueueStore).seq;
  const [state, setState] = useState<{ key: string; ops: OutboxOp[]; review: number } | null>(null);
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  const key = `${userId}:${orgId}:${flockId}`;
  useEffect(() => {
    if (!userId || !orgId) return;
    let cancelled = false;
    const owner = { userId, orgId, displayName };
    openOutbox()
      .then(async (db) => ({ ops: await pendingOps(db, owner), review: await reviewEntries(db, owner) }))
      .then(
        ({ ops, review }) => {
          if (!cancelled) setState({ key: `${userId}:${orgId}:${flockId}`, ops: ops.filter((op) => op.flockId === flockId), review: review.filter((entry) => entry.op.flockId === flockId).length });
        },
        () => {
          /* swallow-ok: الطابور ما انقرا (IndexedDB ممنوع)؛ الورقة تعرض قيم الخادم وحدها */
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, displayName, flockId, uploads, tick]);
  return state?.key === key ? state : NO_DEVICE;
}
const NO_DEVICE = { ops: [] as readonly OutboxOp[], review: 0 };

/** قيم الخانة بعد عمليات هذا الجهاز ليومها: الهلاكات والبيض من مجموع اليوم والزيارات (soFar)، والملاحظة والغاز من أحدث عملية لهما. */
interface Shown {
  dead: number;
  eggs: number | null;
  note: string | null;
  gas: number | null;
  /** في الخانة عملية لم تُرفع بعد. */
  pending: ReadonlySet<CellField>;
}

function shownOf(day: SheetDay, ops: readonly OutboxOp[]): Shown {
  const own = ops.filter((op) => op.day === day.on).sort((a, b) => a.createdAt - b.createdAt);
  const pending = new Set<CellField>();
  let note = day.note;
  let gas = day.gas;
  const totals = own.filter((op) => op.fn !== 'set_flock_gas');
  for (const op of own) {
    if (op.fn === 'set_flock_gas') {
      gas = op.payload.cylinders;
      pending.add('gas');
    } else if (op.fn === 'save_flock_day') {
      if (op.payload.dead !== null && op.payload.dead !== undefined) pending.add('dead');
      if (op.payload.eggs_total !== null && op.payload.eggs_total !== undefined) pending.add('eggs');
      if (op.payload.note !== null && op.payload.note !== undefined) {
        note = op.payload.note === '' ? null : op.payload.note;
        pending.add('note');
      }
    } else {
      pending.add('dead');
      if (op.payload.eggs_total !== null) pending.add('eggs');
    }
  }
  const total = soFar({ dead: day.dead, culled: 0, feedKg: null, eggsTotal: day.eggsTotal, eggsBroken: day.eggsBroken }, totals);
  return { dead: total.dead + total.culled, eggs: total.eggsTotal, note, gas, pending };
}

/** نتيجة رفع خانة بجملة (أو «على الجهاز» حين لم تُرفع). */
function resultToast(result: SendResult | null, online: boolean) {
  if (result === null) {
    toast({ tone: 'info', title: online ? t('sheet.saved.later', 'حُفظ على هذا الجهاز ويُرسل بعد قليل.') : t('sheet.saved.device', 'حُفظ على هذا الجهاز ويُرسل حين يعود الاتصال.') });
    return;
  }
  switch (result.kind) {
    case 'saved':
      toast({ tone: 'success', title: t('sheet.saved', 'حُفظ.') });
      return;
    case 'parked':
      toast({ tone: 'warning', title: t('sheet.parked', 'لم يُحفظ: {why}.', { why: parkText(result.reason ?? null) }), detail: t('sheet.on_shelf', 'بقي على هذا الجهاز في «جولات تحتاج مراجعة».') });
      return;
    case 'stale_day':
    case 'stale_gas':
    case 'stale_visit':
      toast({ tone: 'warning', title: t('sheet.stale', 'تغيّر هذا اليوم من جهاز آخر قبل أن يصل تعديلك، فلم يُكتب فوقه.'), detail: t('sheet.on_shelf', 'بقي على هذا الجهاز في «جولات تحتاج مراجعة».') });
      return;
    case 'rejected':
      toast({ tone: 'danger', title: t('sheet.rejected', 'لم يُحفظ.'), detail: result.hint ?? describeError(new Error(result.code)).detail });
      return;
    default:
      toast({ tone: 'warning', title: t('sheet.held', 'محفوظ على هذا الجهاز: ادخل من جديد ليُرسل.') });
  }
}

// ─── ورقة الخانة: لوحة الأرقام و«تم» ────────────────────────────────────────────────────────────────────────────────

const MAX_BIRDS = 10_000_000;
const MAX_CYLINDERS = 1000;

function fieldLabel(field: CellField): string {
  switch (field) {
    case 'dead':
      return t('sheet.col.dead', 'الهلاكات');
    case 'gas':
      return t('sheet.col.gas', 'الغاز');
    case 'eggs':
      return t('sheet.col.eggs', 'البيض');
    case 'note':
      return t('sheet.col.note', 'الملاحظات');
  }
}

/**
 * ورقة سفلية لخانة يوم: لوحة أرقام التطبيق تبدأ فارغة (فأوّل رقم هو القيمة، والمسجّل مكتوب فوقها)، و«تم» يحفظ بالطابور؛ والملاحظة نصّ. الحدود
 * قبل الحفظ كما يفحصها الخادم (الهلاكات لا تتجاوز الحيّ، والقناني حتى 1,000).
 */
function CellSheet({ sheet, day, field, shown, onClose, onSaved }: { sheet: HallSheet; day: SheetDay; field: CellField; shown: Shown; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const stamp = useStamp();
  const online = useStore(onlineStore);
  const current = field === 'dead' ? (day.dayVersion === null && !shown.pending.has('dead') ? null : shown.dead) : field === 'gas' ? shown.gas : field === 'eggs' ? shown.eggs : null;
  const [value, setValue] = useState('');
  const [note, setNote] = useState(shown.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNote = field === 'note';
  const typed = isNote ? note !== (shown.note ?? '') : value !== '';
  // الحيّ الذي يقبله الخادم لهلاكات هذا اليوم: الحيّ الآن مع هلاكات اليوم نفسه.
  const liveBound = sheet.summary.live + day.dead;

  const save = async () => {
    if (!stamp || busy) return;
    let input: EnqueueInput;
    if (isNote) {
      const text = note.trim();
      if (text.length > 500) {
        setError(t('sheet.note.long', 'الملاحظة حتى 500 حرف.'));
        return;
      }
      if (text === (shown.note ?? '')) {
        onClose();
        return;
      }
      input = { fn: 'save_flock_day', flockId: sheet.flock.id, day: day.on, payload: { note: text }, baseVersion: day.dayVersion };
    } else {
      const n = /^[0-9]{1,8}$/u.test(value) ? Number(value) : null; // number-ok: عدد طيور أو قناني أو بيض من أرقام اللوحة وحدها
      if (n === null) return;
      if (field === 'gas') {
        if (n > MAX_CYLINDERS) {
          setError(t('sheet.gas.max', 'عدد القناني من 0 إلى 1,000.'));
          return;
        }
        input = { fn: 'set_flock_gas', flockId: sheet.flock.id, day: day.on, payload: { cylinders: n }, baseVersion: day.gasVersion };
      } else if (field === 'dead') {
        if (n > MAX_BIRDS || n > liveBound) {
          setError(t('sheet.dead.max', 'الهلاكات أكثر من الطيور الحيّة ({live}).', { live: fmtInt(Math.max(liveBound, 0)) }));
          return;
        }
        input = { fn: 'save_flock_day', flockId: sheet.flock.id, day: day.on, payload: { dead: n, culled: day.culled > 0 ? 0 : null }, baseVersion: day.dayVersion };
      } else {
        if (n > MAX_BIRDS) {
          setError(t('sheet.eggs.max', 'عدد البيض حتى 10,000,000.'));
          return;
        }
        input = { fn: 'save_flock_day', flockId: sheet.flock.id, day: day.on, payload: { eggs_total: n }, baseVersion: day.dayVersion };
      }
    }
    setBusy(true);
    setError(null);
    try {
      const op = await saveRound(await openOutbox(), stamp, input);
      const results = online ? await uploadRounds(stamp, loadTransport).catch(() => []) : []; /* swallow-ok: الرفع فشل (IndexedDB)؛ العملية باقية بالجهاز وترتفع بالمحاولة الجاية */
      if (!online) {
        void refreshRoundQueue(stamp).catch(() => {
          /* swallow-ok: عدّ الطابور تعذّر؛ الرأس يتحدّث بالرفع الجاي */
        });
      }
      resultToast(op ? (results.find((entry) => entry.opId === op.id)?.result ?? null) : null, online);
      onSaved();
    } catch (failure) {
      setError(`${describeError(failure).title} ${describeError(failure).detail}`);
      setBusy(false);
    }
  };

  const unit = field === 'gas' ? t('sheet.unit.gas', 'قنينة') : field === 'eggs' ? t('sheet.unit.eggs', 'بيضة') : t('sheet.unit.dead', 'طير');
  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={typed}
      title={t('sheet.cell.title', '{field} — يوم {day} (العمر {age})', { field: fieldLabel(field), day: fmtDay(day.on), age: fmtInt(day.age) })}
      footer={
        <Button size="lg" className="w-full" onClick={() => void save()} busy={busy} disabled={!isNote && value === ''} data-action="cell-done">
          {t('sheet.done', 'تم')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3" data-action="cell-sheet" data-field={field}>
        {isNote ? (
          <Field id={`${id}-note`} label={t('sheet.note.label', 'ملاحظة اليوم')} error={error} hint={t('sheet.note.hint', 'امسح النصّ كلّه لحذف الملاحظة.')}>
            <textarea id={`${id}-note`} className="input min-h-20" value={note} onChange={(event) => setNote(event.target.value)} data-action="cell-note" />
          </Field>
        ) : (
          <>
            <p className="text-sm text-ink-muted" data-action="cell-current">
              {current === null ? t('sheet.cell.empty', 'لم يُسجَّل شيء لهذا اليوم بعد.') : t('sheet.cell.current', 'المسجّل الآن: {n}', { n: fmtInt(current) })}
              {field === 'dead' && day.culled > 0 ? ` ${t('sheet.cell.culled', '(منها {n} مستبعد قديم يُحسب معها)', { n: fmtInt(day.culled) })}` : ''}
            </p>
            <WeightPad value={value} onChange={setValue} unitLabel={unit} maxDecimals={0} />
            {error ? (
              <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                {error}
              </p>
            ) : null}
          </>
        )}
        {online ? null : (
          <p className="text-sm text-ink-muted" data-action="cell-offline">
            {t('sheet.cell.offline', 'بلا اتصال: يُحفظ على هذا الجهاز ويُرسل حين يعود الاتصال.')}
          </p>
        )}
      </div>
    </Dialog>
  );
}

// ─── ورقة العلف: ما أُرسل لليوم و«أرسل» من «رصيد العلف» ─────────────────────────────────────────────────────────────

const kgOf = (qty: Milli): string => fmtMilli(qty);
const unitName = (unit: SheetFeedLine['unit']): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

/** طلب الإرسال المحفوظ خارج المكوّن (درس 2026-11-10): ما أُرسل حرفاً، وأسماؤه للعرض. */
interface FeedRequest extends FeedSend {
  itemName: string;
  unitLabel: string;
  typed: string;
}

const asFeedRequest = (value: unknown): FeedRequest | null => {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  return typeof row.clientRef === 'string' && typeof row.issueId === 'string' && typeof row.lineId === 'string' && typeof row.itemId === 'string' && typeof row.qty === 'bigint' && typeof row.forDay === 'string'
    ? (row as unknown as FeedRequest)
    : null;
};

/** وحدات الإرسال للمادّة: وحداتها (الكيس أوّلاً كما رتّبها الخادم) ثمّ وحدة الأساس. */
const unitChoices = (item: SheetFeedItem | null): { value: string; label: string; unit: SheetUnit | null }[] =>
  item ? [...item.units.map((unit) => ({ value: unit.id, label: unit.name, unit })), { value: 'base', label: unitName(item.baseUnit), unit: null }] : [];

function FeedSheet({ sheet, day, onClose, onChanged }: { sheet: HallSheet; day: SheetDay; onClose: () => void; onChanged: () => void }) {
  const stamp = useStamp();
  const online = useStore(onlineStore);
  const scope = stamp ? `${stamp.userId}:${stamp.orgId}` : '';
  const storeKey = scope ? pendingKey(scope, `sheet-feed:${sheet.flock.id}`) : '';
  const [frozen, setFrozen] = useState<FeedRequest | null>(() => asFeedRequest(readPending(storeKey)));
  const first = sheet.feedItems.find((item) => item.last) ?? sheet.feedItems[0] ?? null;
  const [itemId, setItemId] = useState<string | null>(first?.itemId ?? null);
  const item = sheet.feedItems.find((entry) => entry.itemId === itemId) ?? null;
  const choices = unitChoices(item);
  const [unitId, setUnitId] = useState<string>(choices[0]?.value ?? 'base');
  const choice = choices.find((entry) => entry.value === unitId) ?? choices[0] ?? null;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ line: SheetFeedLine; ref: string; busy: boolean } | null>(null);
  const writable = sheet.canWrite && day.on <= sheet.today;
  const typed = value === '' ? null : parseDecimal(value, 3);
  const qty = typed && choice && typed.units > 0n ? toBaseQty(toScale(typed, 3), choice.unit) : null;

  const send = async (request: FeedRequest) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    storePending(storeKey, request);
    try {
      const sent = await sendFlockFeed(request);
      storePending(storeKey, null);
      setFrozen(null);
      setValue('');
      toast({ tone: 'success', title: t('sheet.feed.sent', 'أُرسل {qty} {unit} من «{item}» ليوم {day} ({doc}).', { qty: kgOf(sent.issue.qty), unit: unitName(sent.issue.unit), item: sent.issue.itemName, day: fmtDay(sent.issue.forDay), doc: sent.issue.docNo }) });
      onChanged();
      onClose();
    } catch (failure) {
      if (surelyUnsaved(failure)) {
        // جواب أكيد بلا صرف: المكتوب باقٍ، والإرسال التالي بمرجع جديد.
        storePending(storeKey, null);
        setFrozen(null);
        setError(failureText(failure));
      } else {
        // لا نعرف إن صُرف: الطلب محفوظ، والإعادة وحدها ممكنة (لن يُصرف مرّتين).
        setFrozen(request);
        setError(t('sheet.feed.unknown', 'لا نعرف إن أُرسل العلف: أعد المحاولة، ولن يُصرف مرّتين.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const go = () => {
    if (!item || !choice || qty === null) return;
    if (qty > item.onHand) {
      setError(t('sheet.feed.short', 'في «رصيد العلف» من «{item}» {have} {unit} فقط.', { item: item.name, have: kgOf(item.onHand), unit: unitName(item.baseUnit) }));
      return;
    }
    void send({ clientRef: crypto.randomUUID(), issueId: crypto.randomUUID(), lineId: crypto.randomUUID(), flockId: sheet.flock.id, itemId: item.itemId, qty, forDay: day.on, itemName: item.name, unitLabel: choice.label, typed: value });
  };

  const confirmVoid = async () => {
    if (!voiding || voiding.busy) return;
    setVoiding({ ...voiding, busy: true });
    try {
      await voidSheetFeed(voiding.line.issueId, t('sheet.feed.void_reason', 'تصحيح من ورقة القاعة'), voiding.ref);
      toast({ tone: 'success', title: t('sheet.feed.voided', 'أُلغي صرف «{item}» ({doc}).', { item: voiding.line.itemName, doc: voiding.line.docNo }) });
      setVoiding(null);
      onChanged();
    } catch (failure) {
      toast({ tone: 'danger', title: t('sheet.feed.void_failed', 'لم يُلغَ الصرف.'), detail: failureText(failure) });
      setVoiding(surelyUnsaved(failure) ? null : { ...voiding, busy: false });
    }
  };

  const decimals = columnDecimals(day.feed.map((line) => line.qty), 3) as 0 | 1 | 2 | 3;
  const columns: Column<SheetFeedLine>[] = [
    { key: 'item', header: t('sheet.feed.col.item', 'العلف'), wrap: true, cell: (line) => line.itemName },
    { key: 'qty', header: t('sheet.feed.col.qty', 'الكمية'), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.qty, decimals)}</Num> },
    { key: 'unit', header: t('sheet.feed.col.unit', 'الوحدة'), cell: (line) => unitName(line.unit) },
    {
      key: 'out',
      header: t('sheet.feed.col.out', 'خرج من المخزن'),
      cell: (line) => (
        <span data-action="feed-out">
          <Num>{fmtDay(line.issuedOn)}</Num>
        </span>
      ),
    },
    {
      key: 'void',
      header: t('sheet.feed.col.void', 'تصحيح'),
      cell: (line) =>
        line.canVoid && sheet.canWrite ? (
          <Button size="sm" variant="ghost" disabled={!online} onClick={() => setVoiding({ line, ref: crypto.randomUUID(), busy: false })} data-action="feed-void">
            {t('sheet.feed.void', 'ألغِ')}
          </Button>
        ) : null,
    },
  ];

  const shownRequest = frozen;
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        locked={busy}
        dirty={value !== '' || frozen !== null}
        size="wide"
        title={t('sheet.feed.title', 'علف يوم {day} (العمر {age})', { day: fmtDay(day.on), age: fmtInt(day.age) })}
        footer={
          writable ? (
            shownRequest ? (
              <Button size="lg" className="w-full" busy={busy} disabled={!online} onClick={() => void send(shownRequest)} data-action="feed-retry">
                {t('sheet.feed.retry', 'أعد المحاولة: {qty} {unit} من «{item}»', { qty: shownRequest.typed, unit: shownRequest.unitLabel, item: shownRequest.itemName })}
              </Button>
            ) : (
              <Button size="lg" className="w-full" busy={busy} disabled={!online || qty === null || item === null} onClick={go} data-action="feed-send">
                {qty !== null && item && choice ? t('sheet.feed.send_n', 'أرسل {qty} {unit} من «{item}»', { qty: value, unit: choice.label, item: item.name }) : t('sheet.feed.send', 'أرسل')}
              </Button>
            )
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4" data-action="feed-sheet">
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t('sheet.feed.sent_title', 'ما أُرسل لهذا اليوم')}</h3>
            <DataTable caption={t('sheet.feed.sent_title', 'ما أُرسل لهذا اليوم')} columns={columns} rows={day.feed} rowKey={(line) => line.issueId} empty={t('sheet.feed.none', 'لم يُرسل علف لهذا اليوم.')} />
            {day.feed.some((line) => line.issuedOn !== day.on) ? <p className="text-xs text-ink-muted">{t('sheet.feed.late_note', 'علف يوم فات يخرج من المخزن يوم تسجيله، ويُعرض في يومه هنا.')}</p> : null}
          </section>
          {!writable ? (
            <p className="text-sm text-ink-muted" data-action="feed-closed">
              {sheet.canWrite ? t('sheet.feed.future', 'لا يُرسل علف ليوم لم يأتِ بعد.') : t('sheet.feed.read_only', 'الوجبة مغلقة: لا يُرسل لها علف.')}
            </p>
          ) : !online ? (
            <Notice tone="warning" title={t('sheet.feed.offline', 'إرسال العلف يحتاج اتصالاً بالإنترنت: يخرج من «رصيد العلف» لحظة الإرسال. أرسله حين يعود الاتصال.')} />
          ) : null}
          {writable && shownRequest === null ? (
            sheet.feedItems.length === 0 ? (
              <Notice tone="info" title={t('sheet.feed.no_items', 'لا علف في «رصيد العلف» الآن.')} />
            ) : (
              <section className="flex flex-col gap-3">
                <h3 className="font-semibold">{t('sheet.feed.form', 'أرسل علفاً من «رصيد العلف»')}</h3>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('sheet.feed.items', 'العلف')}>
                  {sheet.feedItems.map((entry) => {
                    const selected = entry.itemId === itemId;
                    return (
                      <button
                        key={entry.itemId}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setItemId(entry.itemId);
                          setUnitId(unitChoices(entry)[0]?.value ?? 'base');
                        }}
                        className={`flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-start ${selected ? 'border-line-strong bg-surface-3 shadow-card' : 'border-line bg-surface-1 hover:bg-surface-2'}`}
                        data-action="feed-item"
                        data-item={entry.itemId}
                      >
                        <span className="font-semibold">{entry.name}</span>
                        <span className="text-xs text-ink-muted">{t('sheet.feed.on_hand', 'عندك {qty} {unit}', { qty: kgOf(entry.onHand), unit: unitName(entry.baseUnit) })}</span>
                      </button>
                    );
                  })}
                </div>
                {choices.length > 1 ? <Segmented label={t('sheet.feed.unit', 'الوحدة')} options={choices.map(({ value: v, label }) => ({ value: v, label }))} value={choice?.value ?? 'base'} onChange={setUnitId} /> : null}
                <WeightPad value={value} onChange={setValue} unitLabel={choice?.label ?? ''} maxDecimals={3} />
                {qty !== null && choice?.unit && item ? (
                  <p className="text-sm text-ink-muted" data-action="feed-base">
                    {t('sheet.feed.base', '= {qty} {unit}', { qty: kgOf(qty), unit: unitName(item.baseUnit) })}
                  </p>
                ) : null}
              </section>
            )
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="feed-error">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
      {voiding ? (
        <ConfirmDialog
          open
          title={t('sheet.feed.void_title', 'ألغِ صرف «{item}» ليوم {day}؟', { item: voiding.line.itemName, day: fmtDay(day.on) })}
          consequence={
            <span data-action="feed-void-text">
              {t('sheet.feed.void_body', 'يُلغى صرف {qty} {unit} من «{item}» ليوم {day} (المستند {doc})، ويعود العلف إلى «رصيد العلف» بحركة عكسية بتاريخ اليوم.', {
                qty: kgOf(voiding.line.qty),
                unit: unitName(voiding.line.unit),
                item: voiding.line.itemName,
                day: fmtDay(day.on),
                doc: voiding.line.docNo,
              })}
            </span>
          }
          confirmLabel={t('sheet.feed.void_go', 'ألغِ الصرف')}
          busy={voiding.busy}
          action="feed-void-go"
          onConfirm={() => void confirmVoid()}
          onCancel={() => setVoiding(null)}
        />
      ) : null}
    </>
  );
}

// ─── ما رُدّ من الأجهزة ─────────────────────────────────────────────────────────────────────────────────────────────

/** ما حمله المركون بجملة: «الهلاكات 7»، «الغاز 2»، «العلف 120 كغم»، «البيض 2,100»، «ملاحظة». */
function rejectWhat(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  const num = (key: string) => (typeof payload[key] === 'number' && Number.isInteger(payload[key]) ? (payload[key] as number) : null);
  const dead = num('dead');
  const culled = num('culled');
  if (dead !== null || culled !== null) parts.push(t('sheet.reject.dead', 'الهلاكات {n}', { n: fmtInt((dead ?? 0) + (culled ?? 0)) }));
  const gas = num('gas');
  if (gas !== null) parts.push(t('sheet.reject.gas', 'الغاز {n}', { n: fmtInt(gas) }));
  const feed = typeof payload.feed_kg === 'string' ? parseDecimal(payload.feed_kg, 3) : null;
  if (feed) parts.push(t('sheet.reject.feed', 'العلف {kg} كغم', { kg: kgOf(toScale(feed, 3)) }));
  const eggs = num('eggs_total');
  if (eggs !== null) parts.push(t('sheet.reject.eggs', 'البيض {n}', { n: fmtInt(eggs) }));
  if (typeof payload.note === 'string' && payload.note !== '') parts.push(t('sheet.reject.note', 'ملاحظة'));
  return parts.length ? parts.join(t('list.separator', '، ')) : t('sheet.reject.nothing', 'تعديل');
}

function RejectsBanner({ rejects, onChanged }: { rejects: readonly SheetReject[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (rejects.length === 0) return null;
  const decide = async (reject: SheetReject, decision: RejectDecision) => {
    setBusy(reject.id);
    try {
      await decideFlockReject(reject.id, decision);
      onChanged();
    } catch (failure) {
      toast({ tone: 'danger', title: t('sheet.reject.failed', 'لم يُحفظ القرار.'), detail: failureText(failure) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Notice tone="warning" title={t('sheet.rejects.title', 'أُرسلت من الأجهزة ولم تُحفظ: {n}', { n: fmtInt(rejects.length) })}>
      <p>{t('sheet.rejects.hint', 'أدخلها في يومها من الجدول ثمّ اضغط «أُدخلت»، أو «تجاهل».')}</p>
      <ul className="mt-2 flex flex-col gap-2" data-action="sheet-rejects">
        {rejects.map((reject) => (
          <li key={reject.id} className="flex flex-wrap items-center gap-2" data-action="sheet-reject">
            <span>{t('sheet.reject.line', 'يوم {day}: {what} — {why}.', { day: fmtDay(reject.on), what: rejectWhat(reject.payload), why: parkText(reject.reason) })}</span>
            <Button size="sm" variant="secondary" busy={busy === reject.id} disabled={busy !== null} onClick={() => void decide(reject, 'handled')} data-action="reject-handled">
              {t('sheet.reject.handled', 'أُدخلت')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void decide(reject, 'refused')} data-action="reject-refused">
              {t('sheet.reject.refused', 'تجاهل')}
            </Button>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

// ─── وزن العيّنة (زرّ اختياريّ؛ التقرير لا يحتاجه) ─────────────────────────────────────────────────────────────────

function WeightDialog({ sheet, onClose, onSaved }: { sheet: HallSheet; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const today = sheet.today;
  const [day, setDay] = useState(fmtDay(today));
  const [samples, setSamples] = useState('');
  const [avg, setAvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(crypto.randomUUID());
  const onDate = parseDayText(day);
  // كلّ أيام الوجبة القائمة (0035: لا حدّ أيام سبعة)، لا بعد اليوم ولا قبل التسكين.
  const dayError =
    onDate === null
      ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
      : onDate > today
        ? t('day.future', 'التاريخ بعد اليوم.')
        : onDate < sheet.flock.placedOn
          ? t('flock.weight.before', 'التاريخ قبل تسكين الفوج.')
          : null;
  const sampleCount = /^[0-9]+$/.test(samples.trim()) ? Number(samples.trim()) : null; // number-ok: عدد طيور العيّنة من نصّ أرقام بس
  const sampleError = samples.trim() !== '' && (sampleCount === null || sampleCount < 1 || sampleCount > 100_000) ? t('flock.weight.samples.bad', 'اكتب عدد طيور العيّنة من 1 إلى 100,000.') : null;
  const avgValue = parseDecimal(avg, 1);
  const avgTenths = avgValue === null ? null : toScale(avgValue, 1);
  const avgError = avg.trim() !== '' && (avgTenths === null || avgTenths < 200n || avgTenths > 200_000n) ? t('flock.weight.avg.bad', 'اكتب معدّل وزن الطير بالغرام من 20 إلى 20,000، بمرتبة عشرية واحدة على الأكثر (1.8 كغم = 1,800 غم).') : null;
  const ready = onDate !== null && !dayError && sampleCount !== null && !sampleError && avgTenths !== null && !avgError;

  const save = async () => {
    if (!ready || onDate === null || sampleCount === null || avgTenths === null) return;
    setBusy(true);
    setError(null);
    try {
      await recordFlockWeight(sheet.flock.id, onDate, sampleCount, decimalText(avgTenths, 1), ref.current);
      toast({ tone: 'success', title: t('flock.weight.saved', 'حُفظ وزن العيّنة ليوم {day}.', { day: fmtDay(onDate) }) });
      onSaved();
    } catch (failure) {
      setError(failureText(failure));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={samples !== '' || avg !== '' || day !== fmtDay(today)}
      title={t('hall.weight.title', 'وزن عيّنة {hall}', { hall: hallLabel(sheet.flock.hallName) })}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={!ready} data-action="weight-save">
          {t('flock.weight.save', 'احفظ الوزن')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id={`${id}-day`} label={t('flock.weight.day', 'التاريخ')} error={dayError}>
          <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={day} onChange={(event) => setDay(event.target.value)} data-action="weight-day" />
        </Field>
        <Field id={`${id}-samples`} label={t('flock.weight.samples', 'عدد طيور العيّنة')} error={sampleError}>
          <input id={`${id}-samples`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={samples} onChange={(event) => setSamples(event.target.value)} />
        </Field>
        <Field id={`${id}-avg`} label={t('flock.weight.avg', 'معدّل وزن الطير (غرام)')} error={avgError}>
          <input id={`${id}-avg`} className="input tabular-nums" dir="ltr" inputMode="decimal" autoComplete="off" value={avg} onChange={(event) => setAvg(event.target.value)} />
        </Field>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
    </Dialog>
  );
}

// ─── الورقة ───────────────────────────────────────────────────────────────────────────────────────────────────────

const ACTION_CLASS = 'flex h-14 items-center justify-center rounded-xl border border-line bg-surface-1 px-3 py-2 text-center text-sm font-semibold text-brand-700 hover:bg-surface-2 dark:text-brand-200';
const CELL_CLASS = 'flex min-h-11 w-full flex-col items-end justify-center gap-0.5 rounded-xl px-1 hover:bg-surface-2';
const PENDING_CLASS = 'text-xs font-semibold text-warn-800 dark:text-warn-200';

/** خانة تُلمس فتُفتح ورقتها (أو قيمة فقط إن لم تُكتب)، و«بانتظار الرفع» تحتها ما دامت على الجهاز. */
function Cell({ children, pending, onOpen, label, action }: { children: ReactNode; pending: boolean; onOpen: (() => void) | null; label: string; action: string }) {
  const body = (
    <>
      <span>{children}</span>
      {pending ? (
        <span className={PENDING_CLASS} data-action="cell-pending">
          {t('sheet.pending', 'بانتظار الرفع')}
        </span>
      ) : null}
    </>
  );
  return onOpen ? (
    <button type="button" className={CELL_CLASS} onClick={onOpen} aria-label={label} data-action={action}>
      {body}
    </button>
  ) : (
    <span className="flex flex-col items-end gap-0.5" data-action={action}>
      {body}
    </span>
  );
}

function SheetTable({ sheet, ops, onCell, onFeed }: { sheet: HallSheet; ops: readonly OutboxOp[]; onCell: (day: SheetDay, field: CellField) => void; onFeed: (day: SheetDay) => void }) {
  const layer = sheet.flock.kind === 'layer';
  const todayRef = useRef<HTMLSpanElement>(null);
  const scrolled = useRef(false);
  // اليوم ظاهر عند الفتح: يُمرَّر جدول الورقة وحده (لا الصفحة) حتى يتوسّطه صفّ اليوم، مرّة لكلّ فتح.
  useEffect(() => {
    const mark = todayRef.current;
    if (scrolled.current || !mark) return;
    scrolled.current = true;
    let box: HTMLElement | null = mark.parentElement;
    while (box && !(box.className ?? '').toString().includes('overflow-auto')) box = box.parentElement;
    let row: HTMLElement | null = mark.parentElement;
    while (row && row.localName !== 'tr') row = row.parentElement;
    if (!box || !row || typeof row.getBoundingClientRect !== 'function' || typeof box.getBoundingClientRect !== 'function') return;
    const at = row.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    box.scrollTop += at.top - frame.top - (box.clientHeight - at.height) / 2;
  });
  const writableDay = (day: SheetDay) => sheet.canWrite && day.on <= sheet.today;
  const feedDecimals = columnDecimals([sheet.totals.feedKg, ...sheet.days.flatMap((day) => (day.feedKg === null ? [] : [day.feedKg]))], 3) as 0 | 1 | 2 | 3;
  const recorded = (day: SheetDay, shown: Shown) => day.dayVersion !== null || shown.pending.has('dead');
  const columns: Column<SheetDay>[] = [
    { key: 'age', header: t('sheet.col.age', 'العمر'), kind: 'number', cell: (day) => <Num>{fmtInt(day.age)}</Num> },
    {
      key: 'date',
      header: t('sheet.col.date', 'التاريخ'),
      cell: (day) =>
        day.on === sheet.today ? (
          <span ref={todayRef} className="flex flex-col gap-0.5" data-action="sheet-today">
            <Num>{fmtDay(day.on)}</Num>
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-200">{t('sheet.today', 'اليوم')}</span>
          </span>
        ) : (
          <Num>{fmtDay(day.on)}</Num>
        ),
    },
    {
      key: 'dead',
      header: t('sheet.col.dead', 'الهلاكات'),
      kind: 'number',
      cell: (day) => {
        const shown = shownOf(day, ops);
        return (
          <Cell pending={shown.pending.has('dead')} onOpen={writableDay(day) ? () => onCell(day, 'dead') : null} label={t('sheet.cell.dead', 'هلاكات يوم {day}', { day: fmtDay(day.on) })} action="cell-dead">
            {recorded(day, shown) ? <Num>{fmtInt(shown.dead)}</Num> : ''}
          </Cell>
        );
      },
      total: <Num>{fmtInt(sheet.totals.dead)}</Num>,
    },
    {
      key: 'gas',
      header: t('sheet.col.gas', 'الغاز'),
      kind: 'number',
      cell: (day) => {
        const shown = shownOf(day, ops);
        return (
          <Cell pending={shown.pending.has('gas')} onOpen={writableDay(day) ? () => onCell(day, 'gas') : null} label={t('sheet.cell.gas', 'غاز يوم {day}', { day: fmtDay(day.on) })} action="cell-gas">
            {shown.gas === null ? '' : <Num>{fmtInt(shown.gas)}</Num>}
          </Cell>
        );
      },
      total: <Num>{fmtInt(sheet.totals.gas)}</Num>,
    },
    {
      key: 'feed',
      header: t('sheet.col.feed', 'العلف (كغم)'),
      kind: 'number',
      cell: (day) => (
        <Cell pending={false} onOpen={day.feed.length > 0 || writableDay(day) ? () => onFeed(day) : null} label={t('sheet.cell.feed', 'علف يوم {day}', { day: fmtDay(day.on) })} action="cell-feed">
          {day.feedKg === null ? '' : <Num>{fmtQtyCell(day.feedKg, feedDecimals)}</Num>}
        </Cell>
      ),
      total: <Num>{fmtQtyCell(sheet.totals.feedKg, feedDecimals)}</Num>,
    },
    ...(layer
      ? [
          {
            key: 'eggs',
            header: t('sheet.col.eggs', 'البيض'),
            kind: 'number' as const,
            cell: (day: SheetDay) => {
              const shown = shownOf(day, ops);
              return (
                <Cell pending={shown.pending.has('eggs')} onOpen={writableDay(day) ? () => onCell(day, 'eggs') : null} label={t('sheet.cell.eggs', 'بيض يوم {day}', { day: fmtDay(day.on) })} action="cell-eggs">
                  {shown.eggs === null ? '' : <Num>{fmtInt(shown.eggs)}</Num>}
                </Cell>
              );
            },
            total: sheet.totals.eggsTotal === null ? '' : <Num>{fmtInt(sheet.totals.eggsTotal)}</Num>,
          },
        ]
      : []),
    {
      key: 'note',
      header: t('sheet.col.note', 'الملاحظات'),
      wrap: true,
      cell: (day) => {
        const shown = shownOf(day, ops);
        const text = (
          <>
            {shown.note ?? ''}
            {day.soldBirds > 0 ? <span className="block text-xs text-ink-muted">{t('sheet.sold', 'بيع {n}', { n: fmtInt(day.soldBirds) })}</span> : null}
          </>
        );
        return writableDay(day) ? (
          <button type="button" className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-xl px-1 text-start hover:bg-surface-2" onClick={() => onCell(day, 'note')} aria-label={t('sheet.cell.note', 'ملاحظة يوم {day}', { day: fmtDay(day.on) })} data-action="cell-note">
            <span>{text}</span>
            {shown.pending.has('note') ? (
              <span className={PENDING_CLASS} data-action="cell-pending">
                {t('sheet.pending', 'بانتظار الرفع')}
              </span>
            ) : null}
          </button>
        ) : (
          <span data-action="cell-note">{text}</span>
        );
      },
    },
  ];
  return (
    <DataTable
      caption={sheetTitle(sheet.flock.hallName)}
      columns={columns}
      rows={sheet.days}
      rowKey={(day) => day.on}
      rowTone={(day) => (day.on === sheet.today ? 'mark' : null)}
      empty={t('sheet.empty', 'لا أيام بعد.')}
      totalLabel={t('sheet.total', 'المجموع')}
    />
  );
}

/** الورقة لفوج: القاعة من قراءة الحقول (للسابقة والتالية والبيع والتعديل) حين تُفتح من صفحة القاعة. */
function SheetScreen({ kind, flockId, nav, site, summary, onGone }: { kind: FlockKind; flockId: string; nav?: Nav; site?: SiteView; summary?: FlockSummary; onGone?: () => void }) {
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const load = useCallback(() => loadHallSheet(flockId), [flockId]);
  const state = useLoad(load);
  const sheet = useKept(state.data);
  const [tick, setTick] = useState(0);
  const device = useDeviceOps(flockId, tick);
  const [editing, setEditing] = useState<{ on: Day; field: CellField } | null>(null);
  const [feeding, setFeeding] = useState<Day | null>(null);
  const [weighing, setWeighing] = useState(false);
  // نافذة «عدّل الوجبة» بلقطة الفوج لحظة فتحها (نسخته التي رآها المستخدم)، لا بقراءة الحقل التي تأتي بعدها.
  const [editingFlock, setEditingFlock] = useState<FlockSummary | null>(null);
  const base = farmPath(kind);
  const here = sheet ? hallPath(kind, sheet.flock.hallId) : base;
  const changed = () => {
    setTick((n) => n + 1);
    if (online) state.retry();
  };
  const editDay = editing && sheet ? (sheet.days.find((day) => day.on === editing.on) ?? null) : null;
  const feedDay = feeding && sheet ? (sheet.days.find((day) => day.on === feeding) ?? null) : null;
  const todayRow = sheet ? (sheet.days.find((day) => day.on === sheet.today) ?? null) : null;
  const active = sheet?.flock.status === 'active';
  const ageToday = sheet && sheet.today >= sheet.flock.placedOn ? (todayRow?.age ?? null) : null;

  return (
    <div className="flex flex-col gap-4" data-action="hall-sheet">
      <HallTop kind={kind} nav={nav} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-action="sheet-title">
          {sheet ? sheetTitle(sheet.flock.hallName) : farmTitle(kind)}
        </h1>
        {sheet ? (
          <p className="text-ink-muted" data-action="sheet-batch">
            {t('sheet.batch', 'وجبة {day}', { day: fmtDay(sheet.flock.placedOn) })}
            {' · '}
            {sheet.flock.siteName}
            {sheet.flock.status === 'closed' && sheet.flock.closedOn ? ` · ${t('sheet.closed_on', 'أُغلقت يوم {day}', { day: fmtDay(sheet.flock.closedOn) })}` : ageToday !== null ? ` · ${t('sheet.age_today', 'العمر اليوم {n}', { n: fmtInt(ageToday) })}` : ''}
          </p>
        ) : null}
      </header>
      {state.error instanceof NotConnectedError ? (
        <Notice tone="info" title={describeError(state.error).title} />
      ) : state.error && !sheet ? (
        <LoadFailed what={t('sheet.what', 'ورقة القاعة')} error={state.error} onRetry={state.retry} />
      ) : state.error ? (
        <Notice tone="warning" title={t('hall.reread_failed', 'تعذّرت قراءة القاعة من جديد؛ المعروض آخر ما قُرئ.')}>
          <Button size="sm" variant="secondary" onClick={state.retry} data-action="hall-reread">
            {t('common.retry', 'أعد المحاولة')}
          </Button>
        </Notice>
      ) : null}
      {sheet ? (
        <>
          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t('hall.actions', 'أفعال القاعة')} data-action="sheet-actions">
            {active && todayRow ? (
              <button type="button" onClick={() => setFeeding(todayRow.on)} className={ACTION_CLASS} data-action="sheet-feed">
                {t('sheet.act.feed', 'أرسل علفاً')}
              </button>
            ) : null}
            {active ? (
              <Link to={newTicketPath(site?.id ?? null, sheet.flock.hallId, here)} className={ACTION_CLASS} data-action="sheet-sell">
                {t('sheet.act.sell', 'بيع')}
              </Link>
            ) : null}
            <Link to={`/halls/report/${sheet.flock.id}?${new URLSearchParams({ back: here }).toString()}`} className={ACTION_CLASS} data-action="sheet-report">
              {t('sheet.act.report', 'التقرير')}
            </Link>
            {active && summary && site?.canManage ? (
              <button type="button" onClick={() => setEditingFlock(summary)} className={ACTION_CLASS} data-action="sheet-edit">
                {t('sheet.act.edit', 'عدّل الوجبة')}
              </button>
            ) : null}
            {active ? (
              <Link to={`/halls/close/${sheet.flock.id}?${new URLSearchParams({ back: here }).toString()}`} className={ACTION_CLASS} data-action="sheet-close">
                {t('sheet.act.close', 'أغلق الوجبة')}
              </Link>
            ) : sheet.flock.status === 'closed' ? (
              <Link to={`/halls/cycle/${sheet.flock.id}?${new URLSearchParams({ back: here, act: 'reopen' }).toString()}`} className={ACTION_CLASS} data-action="sheet-reopen">
                {t('sheet.act.reopen', 'أعِد فتحها')}
              </Link>
            ) : null}
          </nav>
          <RejectsBanner rejects={sheet.rejects} onChanged={changed} />
          {device.review > 0 ? (
            <Notice tone="warning" title={t('sheet.review', 'على هذا الجهاز تعديلات لهذه القاعة لم تُحفظ: {n}.', { n: fmtInt(device.review) })}>
              <Link to={`${base}/round`} className={LINK_CLASS} data-action="sheet-review">
                {t('sheet.review.go', 'راجعها في «جولات تحتاج مراجعة»')}
              </Link>
            </Notice>
          ) : null}
          {active ? null : (
            <p className="text-sm text-ink-muted" data-action="sheet-read-only">
              {t('sheet.read_only', 'الوجبة مغلقة: الورقة للقراءة فقط. «أعِد فتحها» لتعديلها.')}
            </p>
          )}
          <p className="text-sm text-ink-muted" data-action="sheet-line">
            {t('sheet.line', 'الداخل {placed} · الهلاكات {dead} · الباقي {live}', { placed: fmtInt(sheet.summary.placed), dead: fmtInt(sheet.summary.dead), live: fmtInt(sheet.summary.live) })}
          </p>
          <SheetTable sheet={sheet} ops={device.ops} onCell={(day, field) => setEditing({ on: day.on, field })} onFeed={(day) => setFeeding(day.on)} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-action="sheet-more">
            {active && kind === 'broiler' ? (
              <button type="button" onClick={() => setWeighing(true)} className={`${LINK_CLASS} inline-flex h-11 items-center`} data-action="weight-open">
                {t('hall.weight.open', 'وزن عيّنة')}
              </button>
            ) : null}
            <Link to={`/halls/calendar/${sheet.flock.id}`} className={`${LINK_CLASS} inline-flex h-11 items-center`} data-action="flock-calendar">
              {t('hall.calendar', 'التقويم واللقاحات')}
            </Link>
            {active ? (
              <Link to={givePath(sheet.flock.id, here)} className={`${LINK_CLASS} inline-flex h-11 items-center`} data-action="flock-give">
                {t('sheet.give', 'أضف دواءً أو لقاحاً')}
              </Link>
            ) : null}
          </div>
          {/* تذاكر الوزن وفرق العدّ وحال الإغلاق (0028) أسفل الورقة، بعيداً عن الاستعمال اليوميّ. */}
          <FlockCard flock={{ id: sheet.flock.id, hallId: sheet.flock.hallId, kind: sheet.flock.kind, siteId: site?.id ?? '' }} onChanged={changed} />
        </>
      ) : state.loading ? (
        <p role="status" className="text-sm text-ink-muted" data-action="sheet-loading">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : null}
      {editing && sheet && editDay ? (
        <CellSheet
          key={`${editing.on}:${editing.field}`}
          sheet={sheet}
          day={editDay}
          field={editing.field}
          shown={shownOf(editDay, device.ops)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      ) : null}
      {feeding && sheet && feedDay ? <FeedSheet key={feeding} sheet={sheet} day={feedDay} onClose={() => setFeeding(null)} onChanged={changed} /> : null}
      {weighing && sheet ? (
        <WeightDialog
          sheet={sheet}
          onClose={() => setWeighing(false)}
          onSaved={() => {
            setWeighing(false);
            changed();
          }}
        />
      ) : null}
      {editingFlock && sheet ? (
        <FlockEditDialog
          hallName={hallLabel(sheet.flock.hallName)}
          flock={editingFlock}
          onClose={() => setEditingFlock(null)}
          onSaved={() => {
            setEditingFlock(null);
            if (onGone) onGone();
            state.retry();
          }}
          // الفوج لم يعد موجوداً: صفحة القاعة تقرأ الحقل من جديد فتظهر فارغة؛ وشاشة الفوج بعينه ترجع إلى الحقل.
          onDeleted={() => {
            setEditingFlock(null);
            if (onGone) onGone();
            else navigate(base, { replace: true });
          }}
          onStale={() => {
            if (onGone) onGone();
            state.retry();
          }}
        />
      ) : null}
    </div>
  );
}

/** أعلى الصفحة: الرجوع إلى الحقل، والقاعة السابقة والتالية في الحقل نفسه (العامل يمرّ على القاعات واحدة بعد واحدة). */
function HallTop({ kind, nav }: { kind: FlockKind; nav?: Nav }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link to={farmPath(kind)} className={`${LINK_CLASS} inline-flex h-11 items-center gap-1`} data-action="hall-back">
        <ChevronRight aria-hidden="true" className="size-4" />
        {farmTitle(kind)}
      </Link>
      {nav ? (
        <div className="flex items-center gap-3">
          {nav.prev ? (
            <Link to={hallPath(kind, nav.prev.id)} className={`${LINK_CLASS} inline-flex h-11 items-center gap-1`} data-action="hall-prev">
              <ChevronRight aria-hidden="true" className="size-4" />
              {hallLabel(nav.prev.name)}
            </Link>
          ) : null}
          {nav.next ? (
            <Link to={hallPath(kind, nav.next.id)} className={`${LINK_CLASS} inline-flex h-11 items-center gap-1`} data-action="hall-next">
              {hallLabel(nav.next.name)}
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** القاعة بلا فوج قائم: تقول ذلك، وللمدير «افتح فوجاً» و«عدّل القاعة»، ولكلّ من يراها دوراتها السابقة. */
function EmptyHall({ kind, site, hall, nav, onChanged }: { kind: FlockKind; site: SiteView; hall: HallView; nav: Nav; onChanged: () => void }) {
  const [dialog, setDialog] = useState<'open' | 'edit' | null>(null);
  const here = hallPath(kind, hall.id);
  return (
    <div className="flex flex-col gap-4">
      <HallTop kind={kind} nav={nav} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-action="sheet-title">
          {hallLabel(hall.name)}
        </h1>
        <p className="text-ink-muted">{site.name}</p>
      </header>
      <section className={CARD_CLASS} data-action="hall-empty">
        <h2 className="text-lg font-semibold">{t('hall.empty.title', 'القاعة فارغة: لا فوج قائم فيها.')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {site.canManage ? (
            <Button onClick={() => setDialog('open')} data-action="flock-open">
              {t('farm.flock.open', 'افتح فوجاً')}
            </Button>
          ) : null}
          {site.canManage ? (
            <Button variant="secondary" onClick={() => setDialog('edit')} data-action="hall-edit">
              {t('farm.hall.edit', 'عدّل القاعة')}
            </Button>
          ) : null}
          <Link to={`/halls/cycles?${new URLSearchParams({ back: here }).toString()}`} className={LINK_CLASS} data-action="hall-cycles">
            {t('hall.cycles', 'الدورات السابقة')}
          </Link>
        </div>
      </section>
      {dialog === 'open' ? (
        <OpenFlockDialog
          hall={hall}
          onClose={() => setDialog(null)}
          onOpened={() => {
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
      {dialog === 'edit' ? (
        <HallDialog
          site={site}
          hall={hall}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * صفحة القاعة (/hall/:id): القاعة من قراءة الحقول (محفوظة بالجهاز للفتح بلا نت)، بترتيب الحقل نفسه للسابقة والتالية، ثمّ ورقة فوجها القائم أو
 * حالها فارغة.
 */
export function HallPage({ kind }: { kind: FlockKind }) {
  const { id = '' } = useParams();
  const stamp = useStamp();
  const userId = stamp?.userId ?? null;
  const orgId = stamp?.orgId ?? null;
  const displayName = stamp?.displayName ?? '';
  // قراءة الحقول لهذه الصفحة وحدها، لا مع كلّ رفع جولات: رفع قاعة أخرى في الخلفية كان يطوي الصفحة ونوافذها؛ وآخر قراءة تبقى أثناء القراءة من جديد.
  const load = useCallback(() => loadOverviewKept(userId && orgId ? { userId, orgId, displayName } : null), [userId, orgId, displayName]);
  const state = useLoad(load);
  const kept = useKept(state.data);
  const sites = (kept?.overview.sites ?? []).filter((site) => site.kind === kind);
  // بترتيب الحقل نفسه: بالاسم كما يُقرأ («5» يُقرأ «قاعة 5» فيأتي بعد «قاعة 3»).
  const ordered = sites.flatMap((site) => [...site.halls].sort((a, b) => naturalCompare(hallLabel(a.name), hallLabel(b.name))).map((hall) => ({ site, hall })));
  const found = ordered.find((entry) => entry.hall.id === id);
  if (state.error && !kept) {
    return state.error instanceof NotConnectedError ? <Notice tone="info" title={describeError(state.error).title} /> : <LoadFailed what={t('hall.what', 'القاعة')} error={state.error} onRetry={state.retry} />;
  }
  if (!kept) return null;
  if (!found) {
    return (
      <div className="flex flex-col gap-4">
        <HallTop kind={kind} />
        <Notice tone="info" title={t('hall.not_found', 'هذه القاعة غير موجودة أو خارج نطاقك.')} />
      </div>
    );
  }
  const { site, hall } = found;
  // السابقة والتالية في الحقل نفسه: آخر قاعة في حقل لا تقفز إلى «قاعة 1» في حقل آخر.
  const inSite = ordered.filter((entry) => entry.site.id === site.id);
  const at = inSite.findIndex((entry) => entry.hall.id === hall.id);
  const nav: Nav = { prev: inSite[at - 1]?.hall ?? null, next: inSite[at + 1]?.hall ?? null };
  // المفتاح بالقاعة والفوج: الانتقال لقاعة أخرى يبدأ صفحتها من أوّلها (نوافذها وقراءتها).
  return hall.flock ? (
    <SheetScreen key={`${hall.id}:${hall.flock.id}`} kind={kind} flockId={hall.flock.id} nav={nav} site={site} summary={hall.flock} onGone={state.retry} />
  ) : (
    <EmptyHall key={hall.id} kind={kind} site={site} hall={hall} nav={nav} onChanged={state.retry} />
  );
}

/** /flock/:id: الوجبة بعينها (المغلقة من تقاريرها والروابط القديمة)، بالورقة نفسها بلا السابقة والتالية. */
export default function FlockPage({ kind }: { kind: FlockKind }) {
  const { id = '' } = useParams();
  return <SheetScreen key={id} kind={kind} flockId={id} />;
}
