import { Syringe } from 'lucide-react';
import { Component, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import type { Day } from '../../domain/dates';
import type { FlockKind } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import { parseQty } from '../../domain/units';
import { countForm, fmtCounted, fmtDay, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { loadIssueOptions, type IssueItem } from '../../lib/repo/flockIssues';
import { giveToFlocks, loadReminders, type GiveLine, type LinkedItem, type Reminder, type ReminderWhen } from '../../lib/repo/halls';
import { RejectedError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { amountText, asRequest, failureText, LinesTable, pendingKey, readPending, storePending, surelyUnsaved, unitWord, type GiveRequest } from './GivePage';
import { vaccineColor } from './palette';

// تذكير اللقاحات (0026، أجوبة المالك 2026-11-11: جدول واحد لكلّ نوع يسري على كلّ القاعات، والتذكير داخل التطبيق الآن). يُحمَّل كسولاً من حزمة
// القاعات في الجولة (شريط بنوعها) والرئيسية (صفّ في «شغل اليوم»): بلا نت أو بأيّ فشل لا يرسم شيئاً، والجولة تبقى تعمل.
// الشريط: لقاحات اليوم والغد والفائت غير المؤشَّر (حتى 7 أيام) وقريباً، مجمَّعة بـ(اللقاح، يوم العمر، يوم الاستحقاق): لون اللقاح نقطةً وحدها والنصّ
// بحبر النصّ دائماً («IB · يوم العمر 7 · اليوم: قاعة 2، قاعة 3»). و«تمّ» (لمن يحفظ يوم القاعة) نافذة بقاعات المجموعة كلّها مؤشَّرة؛ واللقاح المربوط
// بمادّة يُصرف من المخزن عند التأشير (جواب المالك): لكلّ قاعة كميتها بوحدة المادّة، ومخزن واحد (افتراضاً أكثرها). والتأشير نداء give_to_flocks واحد
// بسطور vaccination، بقواعد النتيجة المجهولة نفسها في صفحة الإضافة (الطلب خارج المكوّن، والإعادة به حرفاً، والرفض الأكيد يبقي ما كُتب بمرجع جديد).
// والصفّ المختصر في الرئيسية: «لقاحات اليوم: 3 · غداً: 2» لكلّ نوع فيه شيء، يفتح جولة نوعه؛ ولا شيء حين لا شيء.

export interface ReminderGroup {
  key: string;
  vaccineId: string;
  name: string;
  color: number;
  ageDay: number;
  dueOn: Day;
  when: ReminderWhen;
  linked: boolean;
  item: LinkedItem | null;
  halls: Reminder[];
}

/** مجموعات التذكير بـ(اللقاح، يوم العمر، يوم الاستحقاق) بترتيب الخادم (الاستحقاق ثمّ القاعة ثمّ اللقاح). */
export function groupReminders(items: readonly Reminder[]): ReminderGroup[] {
  const groups: ReminderGroup[] = [];
  for (const item of items) {
    const key = `${item.vaccineId}|${item.ageDay}|${item.dueOn}`;
    const found = groups.find((group) => group.key === key);
    if (found) found.halls.push(item);
    else groups.push({ key, vaccineId: item.vaccineId, name: item.name, color: item.color, ageDay: item.ageDay, dueOn: item.dueOn, when: item.when, linked: item.linked, item: item.item, halls: [item] });
  }
  return groups;
}

/**
 * الأيام بين يومين بصيغة YYYY-MM-DD بتقويم غرينتش (لا ساعة الجهاز). هنا لا diffDays من domain/dates: وحدة التواريخ حزمة محفوظة بالتثبيت المسبق،
 * ودالّة لا يستعملها غير هذه الحزمة الكسولة كانت تُكبّرها.
 */
const daysBetween = (later: Day, earlier: Day): number => Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);

/** متى: «اليوم»، «غداً»، «فات منذ يومين»، «بعد 3 أيام». */
function whenText(group: Pick<ReminderGroup, 'when' | 'dueOn'>, today: Day): string {
  if (group.when === 'today') return t('reminders.today', 'اليوم');
  if (group.when === 'tomorrow') return t('reminders.tomorrow', 'غداً');
  const days = fmtCounted(BigInt(Math.abs(daysBetween(group.dueOn, today))) * 1000n, t('reminders.day', 'يوم'), {
    one: t('reminders.day.one', 'يوم'),
    two: t('reminders.day.two', 'يومين'),
    few: t('reminders.day.few', 'أيام'),
    many: t('reminders.day.many', 'يوماً'),
  });
  return group.when === 'overdue' ? t('reminders.overdue', 'فات منذ {days}', { days }) : t('reminders.soon', 'بعد {days}', { days });
}

/** القاعات بعدّها: «لـ«قاعة 2»»، «لقاعتين»، «لـ3 قاعات»، «لـ11 قاعةً». */
function forHalls(count: number, first: string): string {
  if (count === 1) return t('reminders.for.one', 'لـ«{hall}»', { hall: first });
  if (count === 2) return t('reminders.for.two', 'لقاعتين');
  const n = fmtInt(count);
  const form = countForm(count);
  if (form === 'few') return t('reminders.for.few', 'لـ{n} قاعات', { n });
  if (form === 'many') return t('reminders.for.many', 'لـ{n} قاعةً', { n });
  return t('reminders.for.hundreds', 'لـ{n} قاعة', { n });
}

/**
 * رفوض تعني أنّ ما يعرضه التذكير تغيّر (رُبط اللقاح أو فُكّ أو رُبط بمادّة غير التي عُرضت، أو أُشّر من جهاز آخر، أو خرج من الجدول): يُقرأ من
 * جديد وتُقال جملة الخادم.
 */
const REREAD = new Set(['vaccine_linked', 'vaccine_not_linked', 'vaccine_relinked', 'already_vaccinated', 'not_in_program', 'vaccine_not_found', 'vaccine_archived']);

type Outcome = { kind: 'done' } | { kind: 'unknown' } | { kind: 'reread' } | { kind: 'refused'; problem: unknown };

interface MarkProps {
  group: ReminderGroup;
  today: Day;
  busy: boolean;
  onClose: () => void;
  onSend: (request: GiveRequest) => Promise<Outcome>;
}

/** «تمّ» لمجموعة: قاعاتها كلّها مؤشَّرة، وللقاح المربوط كمية لكلّ قاعة ومخزن واحد؛ المعرّفات والمرجع مرّة للنافذة. */
function MarkDialog({ group, today, busy, onClose, onSend }: MarkProps) {
  const id = useId();
  const linked = group.linked && group.item !== null;
  const first = group.halls[0]?.flockId ?? '';
  // «عندك» ومخازن المادّة المربوطة من «ما يُصرف» لقاعة من المجموعة (المخازن نفسها لكلّ قاعات النطاق).
  const loadStock = useCallback(() => (linked ? loadIssueOptions(first) : Promise.resolve(null)), [linked, first]);
  const stock = useLoad(loadStock);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(group.halls.map((hall) => [hall.flockId, true])));
  const [qty, setQty] = useState<Record<string, string>>({});
  const [store, setStore] = useState<string | null>(null);
  const [ids] = useState(() => Object.fromEntries(group.halls.map((hall) => [hall.flockId, { id: crypto.randomUUID(), issueId: crypto.randomUUID(), lineId: crypto.randomUUID() }])));
  const [ref, setRef] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<unknown>(null);

  const options = stock.data;
  const item: IssueItem | null = linked && options?.canIssue ? (options.items.find((entry) => entry.itemId === group.item?.id) ?? null) : null;
  const best = item?.stores.reduce<IssueItem['stores'][number] | null>((top, entry) => (top === null || entry.qty > top.qty ? entry : top), null) ?? null;
  const from = item?.stores.find((entry) => entry.warehouseId === store) ?? best;
  const unit = group.item?.baseUnit ?? 'pc';
  const halls = group.halls.filter((hall) => checked[hall.flockId]);
  const problems: string[] = [];
  let total: Milli = 0n;
  const amounts = new Map<string, Milli>();
  if (linked) {
    if (!options) problems.push(t('reminders.mark.stock_wait', 'تُقرأ مخازن «{item}»…', { item: group.item?.name ?? '' }));
    else if (!options.canIssue) problems.push(t('reminders.mark.no_issue', '«{name}» يُصرف من المخزن عند التأشير: التأشير لمن يصرف من المخزن.', { name: group.name }));
    else if (!item || !from) problems.push(t('reminders.mark.no_stock', 'لا رصيد من «{item}» في مخازن نطاقك.', { item: group.item?.name ?? '' }));
    for (const hall of halls) {
      const text = (qty[hall.flockId] ?? '').trim();
      const value = text === '' ? null : parseQty(text);
      if (value === null || value <= 0n) problems.push(t('reminders.mark.qty_need', 'اكتب كمية «{item}» لـ«{hall}» أكبر من صفر.', { item: group.item?.name ?? '', hall: hall.hallName }));
      else if (unit === 'pc' && value % 1000n !== 0n) problems.push(t('issue.qty.pieces', '«{name}» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً.', { name: group.item?.name ?? '' }));
      else {
        amounts.set(hall.flockId, value);
        total += value;
      }
    }
    if (from && total > from.qty) {
      problems.push(t('give.total.over', 'مجموع ما تطلبه من «{name}» {total}، وعندك في «{store}» {have}.', { name: group.item?.name ?? '', total: amountText(total, unit), store: from.name, have: amountText(from.qty, unit) }));
    }
  }
  if (!halls.length) problems.push(t('reminders.mark.halls_need', 'اختر قاعة واحدة على الأقلّ.'));
  const ready = problems.length === 0 && !busy;
  const label = t('reminders.mark.go', 'أشّر «{name}» {halls}', { name: group.name, halls: forHalls(halls.length || group.halls.length, (halls[0] ?? group.halls[0])?.hallName ?? '') });
  const dirty = Object.values(qty).some((text) => text.trim() !== '') || halls.length !== group.halls.length;

  const send = async () => {
    if (!ready) return;
    const lines: GiveLine[] = [];
    for (const hall of halls) {
      const own = ids[hall.flockId];
      if (!own) continue;
      const amount = amounts.get(hall.flockId);
      lines.push({
        kind: 'vaccination',
        flockId: hall.flockId,
        id: own.id,
        vaccineId: group.vaccineId,
        ageDay: group.ageDay,
        // المادّة التي عُرضت (مادّة اللقاح في التذكير): الخادم يرفض vaccine_relinked إن رُبط اللقاح بغيرها بعد القراءة (مراجعة 0026 DB-1).
        issue: linked && from && amount !== undefined && group.item ? { itemId: group.item.id, issueId: own.issueId, lineId: own.lineId, warehouseId: from.warehouseId, qty: amount } : null,
      });
    }
    const names: Record<string, string> = { [group.vaccineId]: group.name };
    for (const hall of halls) names[hall.flockId] = hall.hallName;
    if (from) names[from.warehouseId] = from.name;
    setFailure(null);
    const outcome = await onSend({ clientRef: ref, on: today, lines, names, units: group.item ? { [group.vaccineId]: group.item.baseUnit } : {} });
    if (outcome.kind === 'refused') {
      // رفض أكيد لم يكتب شيئاً: ما كُتب باقٍ بمعرّفاته، والإرسال التالي بمرجع جديد.
      setFailure(outcome.problem);
      setRef(crypto.randomUUID());
    }
  };

  return (
    <Dialog
      open
      size="wide"
      onClose={onClose}
      locked={busy}
      dirty={dirty}
      title={t('reminders.mark.title', 'تمّ «{name}» يوم العمر {age}', { name: group.name, age: fmtInt(group.ageDay) })}
      footer={
        <Button size="lg" busy={busy} disabled={!ready} onClick={() => void send()} data-action="mark-go">
          {label}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          {linked
            ? t('reminders.mark.linked', 'يُؤشَّر يوم {day}، ويُصرف «{item}» من المخزن لكلّ قاعة بكميتها.', { day: fmtDay(today), item: group.item?.name ?? '' })
            : t('reminders.mark.plain', 'يُؤشَّر يوم {day} للقاعات المختارة.', { day: fmtDay(today) })}
        </p>
        {linked && stock.error ? <LoadFailed what={t('reminders.mark.stock_what', 'مخازن اللقاح')} error={stock.error} onRetry={stock.retry} /> : null}
        {item && item.stores.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('issue.store', 'من أيّ مخزن تصرف؟')} data-action="mark-stores">
            {item.stores.map((entry) => (
              <Button
                key={entry.warehouseId}
                size="sm"
                variant={from?.warehouseId === entry.warehouseId ? 'primary' : 'secondary'}
                aria-pressed={from?.warehouseId === entry.warehouseId}
                disabled={busy}
                onClick={() => setStore(entry.warehouseId)}
                data-action="mark-store"
                data-store={entry.warehouseId}
              >
                {t('issue.store_option', '{name} ({qty})', { name: entry.name, qty: amountText(entry.qty, unit) })}
              </Button>
            ))}
          </div>
        ) : from ? (
          <p className="text-sm">{t('reminders.mark.from', 'من «{store}»، عندك {qty}.', { store: from.name, qty: amountText(from.qty, unit) })}</p>
        ) : null}
        {group.halls.map((hall) => (
          <div key={hall.flockId} className="flex flex-wrap items-center gap-3" data-action="mark-hall" data-flock={hall.flockId}>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input
                type="checkbox"
                className="size-5 accent-brand-600"
                checked={checked[hall.flockId] === true}
                disabled={busy}
                onChange={(event) => setChecked({ ...checked, [hall.flockId]: event.target.checked })}
                data-action="mark-check"
              />
              <span>
                {hall.hallName} <span className="text-sm text-ink-muted">— {hall.siteName}</span>
              </span>
            </label>
            {linked && checked[hall.flockId] ? (
              <Field id={`${id}-${hall.flockId}`} label={t('reminders.mark.qty', 'الكمية ({unit})', { unit: unitWord(unit) })}>
                <input
                  id={`${id}-${hall.flockId}`}
                  className="input w-32 tabular-nums"
                  dir="ltr"
                  inputMode="decimal"
                  autoComplete="off"
                  value={qty[hall.flockId] ?? ''}
                  disabled={busy}
                  onChange={(event) => setQty({ ...qty, [hall.flockId]: event.target.value })}
                  data-action="mark-qty"
                />
              </Field>
            ) : null}
          </div>
        ))}
        {problems.length && (dirty || linked) ? (
          <ul className="list-disc ps-5 text-sm text-ink-muted" data-action="mark-missing">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
      </div>
    </Dialog>
  );
}

/** الصفّ المختصر في «شغل اليوم»: لكلّ نوع فيه لقاح اليوم (والفائت) أو الغد سطر يفتح جولته. */
function compactRows(items: readonly Reminder[]) {
  const counts = new Map<FlockKind, { now: number; tomorrow: number }>();
  for (const item of items) {
    const count = counts.get(item.kind) ?? { now: 0, tomorrow: 0 };
    if (item.when === 'overdue' || item.when === 'today') count.now += 1;
    else if (item.when === 'tomorrow') count.tomorrow += 1;
    counts.set(item.kind, count);
  }
  return [...counts].filter(([, count]) => count.now + count.tomorrow > 0).map(([kind, count]) => ({ kind, ...count }));
}

interface RemindersProps {
  kind?: FlockKind;
  compact?: boolean;
  onCount?: (rows: number) => void;
}

/** حدّ صامت: خطأ رسم في التذكير لا يرسم شيئاً (والجولة والرئيسية تعملان)؛ وفشل تحميل الحزمة نفسها يمسكه استيرادها الكسول (HallReminders). */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Reminders(props: RemindersProps) {
  return (
    <Quiet>
      <RemindersView {...props} />
    </Quiet>
  );
}

function RemindersView({ kind, compact = false, onCount }: RemindersProps) {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const state = useLoad(loadReminders);
  const data = state.data;
  const items = (data?.items ?? []).filter((item) => kind === undefined || item.kind === kind);
  const rows = compact ? compactRows(items) : [];
  useEffect(() => {
    onCount?.(rows.length);
  }, [onCount, rows.length]);

  // تأشير لم تُعرف نتيجته: خارج المكوّن بمفتاح المستخدم والمنشأة ونوع الجولة، فالعودة إليها تعيده بـ«أعد المحاولة» وحدها.
  const pendingId = workspace && !compact ? pendingKey(`${workspace.userId}:${workspace.orgId}`, `mark:${kind ?? 'all'}`) : '';
  const [frozen, setFrozen] = useState<GiveRequest | null>(null);
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (pendingId !== '' && restoredFor !== pendingId) {
    setRestoredFor(pendingId);
    setFrozen(asRequest(readPending(pendingId)));
  }
  const [marking, setMarking] = useState<ReminderGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [unreached, setUnreached] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const sending = useRef(false);
  /** الشريط مركّب: «تمّ» يُجاب بعد مغادرة الجولة فرفضه أو نتيجته المجهولة تُقال بتنبيه، لا تضيع في شريط فُكّ (مراجعة 0026 GR-2). */
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useDirtyForm(busy || frozen !== null);

  /** نداء give_to_flocks بسطور التأشير: الأوّل من النافذة، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const send = async (request: GiveRequest, retrying: boolean): Promise<Outcome> => {
    if (sending.current) return { kind: 'unknown' };
    sending.current = true;
    setBusy(true);
    setUnreached(false);
    setNote(null);
    storePending(pendingId, request);
    const separator = t('list.separator', '، ');
    const halls = [...new Set(request.lines.map((line) => line.flockId))].map((flock) => request.names[flock] ?? '').join(separator);
    const vaccine = request.lines[0]?.kind === 'vaccination' ? (request.names[request.lines[0].vaccineId] ?? '') : '';
    try {
      const done = await giveToFlocks(request.clientRef, request.on, request.lines);
      storePending(pendingId, null);
      setFrozen(null);
      setMarking(null);
      const docs = done.vaccinations.flatMap((mark) => (mark.docNo ? [mark.docNo] : []));
      toast({
        tone: 'success',
        title: t('reminders.done.title', 'أُشّر «{name}» لـ{halls}.', { name: vaccine, halls }),
        ...(docs.length ? { detail: t('give.done.docs', 'مستندات الصرف: {docs}.', { docs: docs.join(separator) }) } : {}),
      });
      state.retry();
      return { kind: 'done' };
    } catch (problem) {
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن سُجّل التأشير: يتجمّد بطلبه، والإعادة وحدها ممكنة (لن يُسجَّل مرّتين).
        setFrozen(request);
        setMarking(null);
        setUnreached(retrying && surelyUnsaved(problem));
        // غادر الجولة قبل الجواب: الطلب محفوظ (شريط الجولة يعود مجمَّداً به)، والتنبيه يقول ذلك.
        if (!live.current) toast({ tone: 'warning', title: t('reminders.unknown_away', 'لا نعرف إن سُجّل تأشير «{name}» لـ{halls}: افتح الجولة وأعد المحاولة؛ لن يُسجَّل مرّتين.', { name: vaccine, halls }) });
        return { kind: 'unknown' };
      }
      storePending(pendingId, null);
      setFrozen(null);
      if (!live.current) {
        // غادر الجولة قبل الجواب: الشريط ونافذته ذهبا، فالرفض بتنبيه يسمّي ما لم يُؤشَّر وسببه.
        toast({ tone: 'danger', title: t('reminders.refused_away', 'لم يُؤشَّر «{name}» لـ{halls}.', { name: vaccine, halls }), detail: failureText(problem) });
        return { kind: 'reread' };
      }
      if (retrying || (problem instanceof RejectedError && REREAD.has(problem.code))) {
        // ما يعرضه التذكير تغيّر (أو رُفضت الإعادة): يُقرأ من جديد وتُقال جملة الخادم فوقه.
        setMarking(null);
        setNote(failureText(problem));
        state.retry();
        return { kind: 'reread' };
      }
      return { kind: 'refused', problem };
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (compact) {
    if (!rows.length) return null;
    return (
      <>
        {rows.map((row) => {
          const parts: string[] = [];
          if (row.now) parts.push(t('reminders.compact.today', 'لقاحات اليوم: {n}', { n: fmtInt(row.now) }));
          if (row.tomorrow) parts.push(row.now ? t('reminders.compact.tomorrow', 'غداً: {n}', { n: fmtInt(row.tomorrow) }) : t('reminders.compact.tomorrow_only', 'لقاحات الغد: {n}', { n: fmtInt(row.tomorrow) }));
          const text = parts.join(t('reminders.compact.separator', ' · '));
          return (
            <Link
              key={row.kind}
              to={row.kind === 'layer' ? '/layers/round' : '/broiler/round'}
              data-action="today-vaccines"
              data-kind={row.kind}
              className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2 font-medium transition-colors active:bg-surface-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                <Syringe aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                {rows.length > 1 ? t('reminders.compact.kind', '{farm} — {text}', { farm: row.kind === 'layer' ? t('nav.layers', 'حقول البيض') : t('nav.broiler', 'حقول اللحم'), text }) : text}
              </span>
            </Link>
          );
        })}
      </>
    );
  }

  if (!data) return null;
  const groups = groupReminders(items);
  if (!groups.length && !frozen && !note) return null;
  // القاعة باسم حقلها حين يجمع التذكير أكثر من حقل (قاعتان باسم واحد في حقلين).
  const sites = new Set(items.map((item) => item.siteName));
  const separator = t('list.separator', '، ');
  const hallsOf = (group: ReminderGroup) =>
    group.halls.map((hall) => (sites.size > 1 ? t('reminders.hall_site', '{hall} ({site})', { hall: hall.hallName, site: hall.siteName }) : hall.hallName)).join(separator);

  return (
    <section className="card flex flex-col gap-3 p-4" data-action="reminders">
      <h2 className="font-semibold">{t('reminders.title', 'لقاحات مستحقّة')}</h2>
      {frozen ? (
        <div className="flex flex-col gap-3" data-action="mark-frozen">
          <Notice
            tone="warning"
            title={t('reminders.unknown', 'لا نعرف إن سُجّل التأشير: أعد المحاولة؛ لن يُسجَّل مرّتين.')}
            action={
              <Button size="sm" busy={busy} onClick={() => void send(frozen, true)} data-action="mark-retry">
                {t('issue.retry', 'أعد المحاولة')}
              </Button>
            }
          >
            {unreached ? t('give.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.') : null}
          </Notice>
          <LinesTable request={frozen} caption={t('reminders.frozen.table', 'التأشير كما أُرسل')} />
        </div>
      ) : null}
      {note ? <Notice tone="warning" title={note} /> : null}
      {groups.length ? (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.key} className="flex items-center gap-3" data-action="reminder" data-key={group.key} data-when={group.when}>
              <span aria-hidden="true" className="block size-4 shrink-0 rounded-full" style={{ backgroundColor: vaccineColor(group.color) }} data-action="reminder-swatch" data-color={group.color} />
              <span className="min-w-0 flex-1 text-sm" data-action="reminder-text">
                {t('reminders.line', '{name} · يوم العمر {age} · {when}: {halls}', { name: group.name, age: fmtInt(group.ageDay), when: whenText(group, data.today), halls: hallsOf(group) })}
              </span>
              {data.canMark ? (
                <Button size="sm" variant="secondary" disabled={frozen !== null || busy} onClick={() => setMarking(group)} data-action="reminder-done">
                  {t('reminders.done', 'تمّ')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {marking ? <MarkDialog key={marking.key} group={marking} today={data.today} busy={busy} onClose={() => setMarking(null)} onSend={(request) => send(request, false)} /> : null}
    </section>
  );
}
