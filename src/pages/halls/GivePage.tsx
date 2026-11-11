import { CheckCircle2, Factory, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import type { Day } from '../../domain/dates';
import type { Milli } from '../../domain/money';
import { can } from '../../domain/permissions';
import { parseQty, type BaseUnit } from '../../domain/units';
import { parseDayText } from '../../lib/dayText';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { columnDecimals, countForm, fmtDay, fmtInt, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { loadIssueOptions, type IssueItem } from '../../lib/repo/flockIssues';
import { loadOverview } from '../../lib/repo/flocks';
import { giveToFlocks, type GiveLine } from '../../lib/repo/halls';
import { useSession } from '../../lib/session';
import { itemKindLabel } from '../../lib/storeLabels';
import { useLoad, type LoadState } from '../../lib/useLoad';

// «أضف للقاعة» (0026، كلمة المالك 2026-11-11: «لمن يفتح القاعة يلكى المواد الي سواها بالمخزن، يختار الكميات ويضيفها للقاعة»، و«الحركة اللي
// تصير بقاعة تكدر تتكرر بالقاعات الثانية بدون ما يدخل لكل قاعة»). بطاقات ما يُصرف من مخازن النطاق (flock_issue_options لفوج القاعة: «عندك»، وعلف
// المعمل أوّلاً بشارته) تُلمس فتُضاف سطراً بكميته بوحدة المادّة، والمخزن يُختار حين تكون المادّة في أكثر من مخزن (افتراضاً أكثرها)؛ و«دواء ليس في
// المخزن» باسمه وجرعته (جواب المالك: الدواء من المخزن إن كان فيه، وإلّا يُسجَّل باسمه وجرعته «بلا مخزن»). والقاعة الحالية دائماً، و«كرّر في القاعات
// الأخرى» يعرض أفواج النطاق القائمة (flocks_overview) بحقولها؛ الكمية نفسها لكلّ قاعة، و«كمية مختلفة لكلّ قاعة» شبكة بقاعة لكلّ صفّ. واليوم من ?on أو
// اليوم، بين أقدم يوم يُقبل واليوم. زرّ واحد يسمّي النتيجة («أضف لـ3 قاعات»)، فتأكيد بما يُضاف لكلّ قاعة ومجموع كلّ مادّة أمام «عندك»، فنداء واحد
// give_to_flocks: أيّ رفض لا يحفظ شيئاً.
// ودروس النتيجة المجهولة (CLAUDE.md 2026-11-10): معرّفات السطور ومرجع الإرسال مرّة للنموذج؛ والطلب الذي لا تُعرف نتيجته خارج المكوّن
// (sessionStorage بمفتاح المستخدم والمنشأة والفوج، والذاكرة إن تعذّر) فالرجوع والعودة أو إعادة التحميل تعيد الصفحة مجمَّدة به و«أعد المحاولة»
// ترسله حرفاً؛ والنافذة «فيها ما لم يُحفظ» والطلب في الطريق أو مجمَّد. والرفض الأكيد يقول تلميح الخادم ويبقي كلّ ما كُتب ومعرّفاته، والإرسال التالي
// بمرجع جديد؛ وid_conflict يولّد المعرّفات من جديد.

// ─── مشترك الإضافة وتأشير اللقاح (Reminders يستورده من هنا) ───────────────────────────────────────────────────────────────

/** طريق الرجوع من الرابط (?back=): الحقل أو جولته أو صفحة الفوج، أو سجلّ صرف الفوج، أو تقويم القاعة؛ وإلّا null (لا رابط خارجي). */
export function giveBack(value: string | null): string | null {
  return value !== null && /^\/(?:(?:broiler|layers)(?:\/round|\/flock\/[\w-]+)?|inventory\/issue\/[\w-]+|halls\/calendar\/[\w-]+)(?:\?[\w=&%.-]*)?$/u.test(value) ? value : null;
}

function backLabel(path: string): string {
  if (path.startsWith('/inventory/')) return t('back.issues', 'رجوع إلى سجلّ الصرف');
  if (path.startsWith('/halls/')) return t('back.calendar', 'رجوع إلى التقويم');
  if (path.endsWith('/round')) return t('back.round', 'رجوع إلى الجولة');
  if (path.includes('/flock/')) return t('back.hall', 'رجوع إلى القاعة');
  return t('back.farms', 'رجوع إلى الحقول');
}

const pendingMemory = new Map<string, string>();

/** مفتاح الطلب المعلَّق: المستخدم والمنشأة والشيء (الفوج في الإضافة، وmark في تأشير اللقاح)، فلا يعود طلب مستخدم لآخر في التبويب نفسه. */
export function pendingKey(scope: string, thing: string): string {
  return `halls.pending:${scope}:${thing}`;
}

/** يحفظ الطلب المعلَّق (أو يمحوه بـnull) في sessionStorage، يبقى بعد إعادة التحميل في التبويب نفسه، وفي الذاكرة إن تعذّر. */
export function storePending(key: string, value: unknown): void {
  if (key === '') return;
  const text = value === null ? null : JSON.stringify(value, (_field, entry: unknown) => (typeof entry === 'bigint' ? { big: String(entry) } : entry));
  if (text === null) pendingMemory.delete(key);
  else pendingMemory.set(key, text);
  try {
    if (text === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, text);
  } catch {
    // بلا sessionStorage (تصفّح خاصّ أو ممنوع): الذاكرة وحدها تحمي من الرجوع والعودة.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function readPending(key: string): unknown {
  if (key === '') return null;
  const fromSession = (): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch { // swallow-ok: sessionStorage ممنوع (تصفّح خاصّ أو إعداد المتصفّح)؛ الطلب في الذاكرة بعده
      return null;
    }
  };
  const text = fromSession() ?? pendingMemory.get(key) ?? null;
  if (text === null) return null;
  try {
    return JSON.parse(text, (_field, entry: unknown) => (isRecord(entry) && Object.keys(entry).length === 1 && typeof entry.big === 'string' ? BigInt(entry.big) : entry));
  } catch { // swallow-ok: نصّ لم يكتبه storePending (تخزين تالف)؛ لا طلب معلَّق يُستعاد منه
    return null;
  }
}

/** نداء give_to_flocks كما أُرسل، ومعه أسماء القاعات والموادّ والمخازن ووحدات الموادّ للعرض وحده (لا تُرسل). */
export interface GiveRequest {
  clientRef: string;
  on: Day;
  lines: GiveLine[];
  names: Record<string, string>;
  units: Record<string, BaseUnit>;
}

/** طلب كما كتبه storePending، أو null. */
export function asRequest(value: unknown): GiveRequest | null {
  if (!isRecord(value) || typeof value.clientRef !== 'string' || typeof value.on !== 'string' || !isRecord(value.names) || !isRecord(value.units)) return null;
  const lines = value.lines;
  if (!Array.isArray(lines) || !lines.length) return null;
  const known = lines.every((line: unknown) => isRecord(line) && typeof line.flockId === 'string' && (line.kind === 'issue' || line.kind === 'log' || line.kind === 'vaccination'));
  return known ? (value as unknown as GiveRequest) : null;
}

/** لم يُحفظ شيء أكيداً: رفض الخادم، أو لم يخرج الطلب أو لم يصل، أو تزاحم فرجع، أو لا قاعدة ولا جلسة. وغيرها نتيجة مجهولة. */
export const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

/** جملة الرفض: تلميح الخادم كما هو، وإلّا وصف الخطأ. */
export function failureText(problem: unknown): string {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
}

export const unitWord = (unit: BaseUnit): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

/** الكمية بوحدة أساسها («14.6 كغم»، «لتران»، «3 قطع»)، بلا طنّ ولا غرام. */
export const amountText = (qty: Milli, unit: BaseUnit): string => {
  const shown = fmtQty(qty, unit);
  return shown.sub ?? shown.main;
};

/** آخر ما قُرئ يبقى معروضاً أثناء القراءة من جديد (بعد رفض: «عندك» الآن، والنموذج لا ينطوي). */
function useKept<T>(state: LoadState<T>): T | null {
  const [kept, setKept] = useState<T | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  return state.data ?? kept;
}

/** سطور الطلب بجدول: القاعة، وما يُضاف، والكمية بوحدتها، ومن أين (المخزن أو «بلا مخزن» للدواء المسجَّل). */
export function LinesTable({ request, caption }: { request: GiveRequest; caption: string }) {
  const { lines, names, units } = request;
  const qtys = lines.flatMap((line) => (line.kind === 'issue' ? [line.qty] : line.kind === 'vaccination' && line.issue ? [line.issue.qty] : []));
  const decimals = columnDecimals(qtys, 3) as 0 | 1 | 2 | 3;
  const issueOf = (line: GiveLine) => (line.kind === 'issue' ? line : line.kind === 'vaccination' ? line.issue : null);
  const columns: Column<GiveLine>[] = [
    { key: 'hall', header: t('give.col.hall', 'القاعة'), cell: (line) => names[line.flockId] ?? '—' },
    {
      key: 'what',
      header: t('give.col.what', 'ما يُضاف'),
      wrap: true,
      cell: (line) =>
        line.kind === 'issue'
          ? (names[line.itemId] ?? '—')
          : line.kind === 'log'
            ? line.dose
              ? t('give.log.with_dose', '{name} ({dose})', { name: line.name, dose: line.dose })
              : line.name
            : (names[line.vaccineId] ?? '—'),
    },
    {
      key: 'qty',
      header: t('give.col.qty', 'الكمية'),
      kind: 'number',
      cell: (line) => {
        const issue = issueOf(line);
        return issue ? <Num>{fmtQtyCell(issue.qty, decimals)}</Num> : '—';
      },
    },
    {
      key: 'unit',
      header: t('give.col.unit', 'الوحدة'),
      cell: (line) => {
        const unit = line.kind === 'issue' ? units[line.itemId] : line.kind === 'vaccination' && line.issue ? units[line.vaccineId] : undefined;
        return unit ? unitWord(unit) : '—';
      },
    },
    {
      key: 'from',
      header: t('give.col.from', 'من أين'),
      wrap: true,
      cell: (line) => {
        const issue = issueOf(line);
        return issue ? (names[issue.warehouseId] ?? '—') : line.kind === 'log' ? t('give.no_store', 'بلا مخزن') : t('give.mark_only', 'تأشير');
      },
    },
  ];
  return <DataTable caption={caption} columns={columns} rows={lines} rowKey={(line) => (line.kind === 'issue' ? line.lineId : line.id)} empty={t('give.lines.empty', 'لا سطور.')} />;
}

// ─── النموذج ───────────────────────────────────────────────────────────────────────────────────────────────────

/** حدّ الكمية: اثنتا عشرة خانة قبل الفاصلة (عقد give_to_flocks)، بالآلاف. */
const QTY_LIMIT: Milli = 1_000_000_000_000_000n;
const MAX_LINES = 100;
/** المادّة الأوّلية والإضافة تُحسبان على الفوج كلفةَ علف (flock_cost_kind)، فالبطاقة تقول ذلك تحت نوعها (كبطاقات سجلّ الصرف). */
const FEED_COST_KINDS: ReadonlySet<string> = new Set(['raw', 'additive']);

/** مادّة مختارة: كميتها المشتركة نصّاً كما كُتبت، ومخزنها (افتراضاً أكثر مخازنها). */
interface Pick {
  itemId: string;
  name: string;
  unit: BaseUnit;
  qty: string;
  warehouseId: string;
}

/** دواء ليس في المخزن: يُسجَّل باسمه وجرعته لكلّ قاعة مختارة. */
interface LogDraft {
  key: string;
  name: string;
  dose: string;
}

interface GiveForm {
  picks: Pick[];
  logs: LogDraft[];
  /** القاعات الأخرى المختارة بمعرّفات أفواجها؛ القاعة الحالية معها دائماً. */
  halls: string[];
  perHall: boolean;
  /** كمية كلّ (فوج، مادّة) حين تختلف القاعات، نصّاً بمفتاح «الفوج:المادّة». */
  hallQty: Record<string, string>;
  /** اليوم كما كُتب، أو null: اليوم الافتراضي (?on أو اليوم). */
  day: string | null;
  /** معرّفات السطور مرّة لكلّ (فوج، مادّة) و(فوج، دواء)، تبقى للنموذج كلّه (وبعد رفض أكيد). */
  ids: Record<string, string>;
  /** مرجع الإرسال التالي: جديد بعد كلّ رفض أكيد. */
  ref: string;
}

/** الطلب المعلَّق: النموذج كما أُرسل (لترجع إليه الخانات بعد رفض أكيد) والنداء نفسه. */
interface GivePending {
  form: GiveForm;
  request: GiveRequest;
}

function asPending(value: unknown): GivePending | null {
  if (!isRecord(value) || !isRecord(value.form)) return null;
  const request = asRequest(value.request);
  const form = value.form;
  if (!request || !Array.isArray(form.picks) || !Array.isArray(form.logs) || !Array.isArray(form.halls) || !isRecord(form.hallQty) || !isRecord(form.ids) || typeof form.ref !== 'string') return null;
  return { form: form as unknown as GiveForm, request };
}

const freshForm = (): GiveForm => ({ picks: [], logs: [], halls: [], perHall: false, hallQty: {}, day: null, ids: {}, ref: crypto.randomUUID() });

interface Target {
  flockId: string;
  hall: string;
}

type Draft = { kind: 'issue'; flockId: string; pick: Pick; qty: Milli } | { kind: 'log'; flockId: string; log: LogDraft };

interface Total {
  key: string;
  name: string;
  unit: BaseUnit;
  store: string;
  total: Milli;
  have: Milli;
}

/** كمية خانة: فارغة (null بلا خطأ)، أو كمية موجبة بوحدة المادّة، أو جملة خطئها. */
function readCell(text: string, pick: Pick): { qty: Milli | null; error: string | null } {
  const raw = text.trim();
  if (raw === '') return { qty: null, error: null };
  const qty = parseQty(raw);
  if (qty === null || qty <= 0n) return { qty: null, error: t('issue.qty.bad', 'اكتب كمية أكبر من صفر، بثلاث مراتب عشرية على الأكثر.') };
  if (qty >= QTY_LIMIT) return { qty: null, error: t('give.qty.big', 'الكمية أكبر من الحدّ: اكتب أقلّ من ألف مليار.') };
  if (pick.unit === 'pc' && qty % 1000n !== 0n) return { qty: null, error: t('issue.qty.pieces', '«{name}» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً.', { name: pick.name }) };
  return { qty, error: null };
}

const cellKey = (flockId: string, itemId: string) => `${flockId}:${itemId}`;

/**
 * ما سيُضاف من النموذج: سطر لكلّ (قاعة، مادّة) بكميته ولكلّ (قاعة، دواء)، القاعة بعد القاعة بترتيب الشاشة (الحالية أوّلاً)؛ وما يمنع الإضافة بجملة؛
 * وأخطاء الخانات؛ ومجموع كلّ مادّة من كلّ مخزن أمام «عندك» فيه (الخادم يفحص المجموع لكلّ مادّة ومخزن قبل كلّ شيء).
 */
function planGive(form: GiveForm, targets: readonly Target[], itemOf: (itemId: string) => IssueItem | undefined) {
  const problems: string[] = [];
  const cells: Record<string, string> = {};
  const quantities = new Map<string, Milli>();
  const totals = new Map<string, Total>();
  for (const pick of form.picks) {
    const item = itemOf(pick.itemId);
    const store = item?.stores.find((entry) => entry.warehouseId === pick.warehouseId) ?? null;
    if (!item || !store) {
      problems.push(t('give.item.gone', '«{name}» لم تعد متاحة للصرف من مخازن نطاقك: أزلها.', { name: pick.name }));
      continue;
    }
    let given = false;
    let wrong = false;
    for (const target of targets) {
      const key = cellKey(target.flockId, pick.itemId);
      const cell = readCell(form.perHall ? (form.hallQty[key] ?? '') : pick.qty, pick);
      if (cell.error) {
        cells[form.perHall ? key : pick.itemId] = cell.error;
        wrong = true;
      }
      if (cell.qty === null) continue;
      given = true;
      quantities.set(key, cell.qty);
      const sumKey = `${pick.itemId}|${pick.warehouseId}`;
      const sum = totals.get(sumKey) ?? { key: sumKey, name: pick.name, unit: pick.unit, store: store.name, total: 0n, have: store.qty };
      totals.set(sumKey, { ...sum, total: sum.total + cell.qty });
    }
    if (wrong) problems.push(t('give.qty.fix', 'صحّح كمية «{name}».', { name: pick.name }));
    else if (!given) problems.push(form.perHall ? t('give.qty.need_hall', 'اكتب كمية «{name}» لقاعة واحدة على الأقلّ.', { name: pick.name }) : t('give.qty.need', 'اكتب كمية «{name}».', { name: pick.name }));
  }
  for (const total of totals.values()) {
    if (total.total > total.have) {
      problems.push(t('give.total.over', 'مجموع ما تطلبه من «{name}» {total}، وعندك في «{store}» {have}.', { name: total.name, total: amountText(total.total, total.unit), store: total.store, have: amountText(total.have, total.unit) }));
    }
  }
  for (const log of form.logs) {
    const name = [...log.name.trim()].length;
    if (name === 0) problems.push(t('give.log.name_need', 'اكتب اسم الدواء الذي ليس في المخزن، أو أزله.'));
    else if (name > 80) problems.push(t('give.log.name_long', 'اسم الدواء أطول من 80 حرفاً.'));
    if ([...log.dose.trim()].length > 120) problems.push(t('give.log.dose_long', 'الجرعة أطول من 120 حرفاً.'));
  }
  const drafts: Draft[] = [];
  for (const target of targets) {
    for (const pick of form.picks) {
      const qty = quantities.get(cellKey(target.flockId, pick.itemId));
      if (qty !== undefined) drafts.push({ kind: 'issue', flockId: target.flockId, pick, qty });
    }
    for (const log of form.logs) drafts.push({ kind: 'log', flockId: target.flockId, log });
  }
  if (drafts.length > MAX_LINES) problems.push(t('give.too_many', 'أكثر من 100 سطر في إضافة واحدة: قسّمها على مرّتين.'));
  return { drafts, problems, cells, totals: [...totals.values()] };
}

/** الزرّ يسمّي النتيجة: «أضف لـ«قاعة 1»»، «أضف لقاعتين»، «أضف لـ3 قاعات»، «أضف لـ11 قاعةً». */
function goLabel(count: number, first: string): string {
  if (count === 1) return t('give.go.one', 'أضف لـ«{hall}»', { hall: first });
  if (count === 2) return t('give.go.two', 'أضف لقاعتين');
  const n = fmtInt(count);
  const form = countForm(count);
  if (form === 'few') return t('give.go.few', 'أضف لـ{n} قاعات', { n });
  if (form === 'many') return t('give.go.many', 'أضف لـ{n} قاعةً', { n });
  return t('give.go.hundreds', 'أضف لـ{n} قاعة', { n });
}

function TotalsTable({ totals }: { totals: readonly Total[] }) {
  const decimals = columnDecimals(totals.flatMap((total) => [total.total, total.have]), 3) as 0 | 1 | 2 | 3;
  return (
    <DataTable
      caption={t('give.totals', 'مجموع كلّ مادّة وما عندك منها')}
      columns={[
        { key: 'item', header: t('give.col.item', 'المادّة'), wrap: true, cell: (total: Total) => total.name },
        { key: 'store', header: t('give.col.store', 'المخزن'), wrap: true, cell: (total: Total) => total.store },
        { key: 'total', header: t('give.col.total', 'المجموع'), kind: 'number', cell: (total: Total) => <Num>{fmtQtyCell(total.total, decimals)}</Num> },
        { key: 'have', header: t('give.col.have', 'عندك'), kind: 'number', cell: (total: Total) => <Num>{fmtQtyCell(total.have, decimals)}</Num> },
        { key: 'unit', header: t('give.col.unit', 'الوحدة'), cell: (total: Total) => unitWord(total.unit) },
      ]}
      rows={totals}
      rowKey={(total) => total.key}
      empty={t('give.totals.empty', 'لا موادّ من المخزن.')}
    />
  );
}

function ItemCards({ items, picks, locked, onToggle }: { items: readonly IssueItem[]; picks: readonly Pick[]; locked: boolean; onToggle: (item: IssueItem) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-action="give-cards">
      {items.map((item) => {
        const picked = picks.some((pick) => pick.itemId === item.itemId);
        return (
          <li key={item.itemId} className={`flex rounded-2xl border p-3 ${picked ? 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/15' : 'border-line'}`}>
            <button type="button" className="flex w-full flex-col items-start gap-1 text-start" aria-pressed={picked} disabled={locked} onClick={() => onToggle(item)} data-action="give-card" data-item={item.itemId}>
              <span className="flex w-full items-start justify-between gap-2">
                <span className="min-w-0 font-semibold">{item.name}</span>
                {picked ? <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-brand-700 dark:text-brand-200" /> : <Plus aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />}
              </span>
              {item.madeInMill ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-200" data-action="made-in-mill">
                  <Factory aria-hidden="true" className="size-4" />
                  {t('issue.made_in_mill', 'من إنتاج المعمل')}
                </span>
              ) : (
                <span className="text-xs text-ink-muted" data-action="give-kind">
                  {itemKindLabel(item.kind)}
                </span>
              )}
              {FEED_COST_KINDS.has(item.kind) ? <span className="text-xs text-ink-muted">{t('issue.feed_cost', 'تُحسب كلفةَ علف')}</span> : null}
              <span className="text-xs text-ink-muted" data-action="give-on-hand">
                {t('mill.on_hand', 'عندك: {qty}', { qty: amountText(item.onHand, item.baseUnit) })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function GiveForm({ flockId }: { flockId: string }) {
  const id = useId();
  const [params] = useSearchParams();
  const back = giveBack(params.get('back'));
  const onParam = params.get('on');
  const navigate = useNavigate();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const canLog = workspace !== null && can(workspace.role, 'flock_day.save');
  // مفتاح الطلب المعلَّق: المستخدم والمنشأة والفوج.
  const pendingId = workspace ? pendingKey(`${workspace.userId}:${workspace.orgId}`, flockId) : '';
  const loadOptions = useCallback(() => loadIssueOptions(flockId), [flockId]);
  const optionsState = useLoad(loadOptions);
  const options = useKept(optionsState);
  const overviewState = useLoad(loadOverview);
  const overview = useKept(overviewState);

  const [form, setForm] = useState<GiveForm>(freshForm);
  /** طلب لم تُعرف نتيجته: الصفحة مجمَّدة به، و«أعد المحاولة» ترسله حرفاً. */
  const [frozen, setFrozen] = useState<GivePending | null>(null);
  /** التأكيد مفتوح بالطلب الذي سيُرسل (معرّفاته ومرجعه). */
  const [confirm, setConfirm] = useState<GivePending | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  /** إعادة لم تصل إلى الخادم والطلب مجمَّد. */
  const [unreached, setUnreached] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  /** طلب في الطريق: لا يُرسل ثانٍ قبل جوابه (نقرتان سريعتان). */
  const sending = useRef(false);
  /**
   * الصفحة مركّبة. التأكيد يقفلها والطلب في الطريق، لكنّ زرّ الرجوع في أندرويد أو المتصفّح يغادرها: الجواب بعد المغادرة لا ينقل التطبيق (كان يأخذ
   * الجولة وأرقامها المكتوبة إلى صفحة الفوج)، ورفضه أو نتيجته المجهولة تُقال بتنبيه لا تضيع في صفحة فُكّت (مراجعة 0026 GR-2).
   */
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // طلب معلَّق من فتح سابق: تعود الصفحة مجمَّدة به (والنموذج كما أُرسل). ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (مرّة لكلّ مفتاح).
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (pendingId !== '' && restoredFor !== pendingId) {
    setRestoredFor(pendingId);
    const kept = asPending(readPending(pendingId));
    if (kept) {
      setForm(kept.form);
      setFrozen(kept);
    }
  }

  const patch = (change: Partial<GiveForm>) => {
    setFailure(null);
    setForm((current) => ({ ...current, ...change }));
  };

  const items = options?.canIssue ? options.items : [];
  const itemOf = (itemId: string) => items.find((item) => item.itemId === itemId);
  // القاعات الأخرى: أفواج النطاق القائمة المسكَّنة بحقولها، بلا القاعة الحالية.
  const others = (overview?.sites ?? [])
    .map((site) => ({
      site,
      halls: site.halls.flatMap((hall) => (hall.flock && hall.flock.id !== flockId && hall.flock.status === 'active' && hall.flock.placedOn !== null ? [{ flockId: hall.flock.id, hall: hall.name }] : [])),
    }))
    .filter((group) => group.halls.length > 0);
  const chosen = new Set(form.halls);
  const targets: Target[] = options ? [{ flockId, hall: options.hallName }] : [];
  for (const group of others) for (const target of group.halls) if (chosen.has(target.flockId)) targets.push(target);
  // «كمية مختلفة لكلّ قاعة» لأكثر من قاعة وحدها: قاعة واحدة تعود إلى خانة الكمية المشتركة (لا خانات مخفيّة).
  const perHall = form.perHall && targets.length > 1;

  const today = options?.today ?? null;
  const earliest = options?.earliestOn ?? null;
  const defaultDay = today !== null && earliest !== null && onParam !== null && /^\d{4}-\d{2}-\d{2}$/u.test(onParam) && onParam >= earliest && onParam <= today ? onParam : today;
  const dayText = form.day ?? (defaultDay ? fmtDay(defaultDay) : '');
  const day = parseDayText(dayText);
  const dayError =
    today === null || earliest === null
      ? null
      : day === null
        ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
        : day > today
          ? t('day.future', 'التاريخ بعد اليوم.')
          : day < earliest
            ? t('give.day.old', 'أقدم تاريخ يُقبل {day}.', { day: fmtDay(earliest) })
            : null;

  const plan = planGive(perHall === form.perHall ? form : { ...form, perHall }, targets, itemOf);
  const problems = dayError ? [...plan.problems, dayError] : plan.problems;
  const hallCount = new Set(plan.drafts.map((draft) => draft.flockId)).size;
  const first = targets.find((target) => target.flockId === plan.drafts[0]?.flockId)?.hall ?? '';
  const active = options?.flockStatus === 'active';
  const ready = active && plan.drafts.length > 0 && problems.length === 0 && day !== null && !busy;
  const label = plan.drafts.length ? goLabel(hallCount, first) : t('give.go.pick', 'اختر ما تضيفه للقاعة');
  const dirty = form.picks.length > 0 || form.logs.length > 0 || form.halls.length > 0 || form.day !== null;
  // والطلب في الطريق أو مجمَّد: «فيها ما لم يُحفظ»، فلا يعيد التحديث تحميلها والجواب لم يصل فيضيع المعرّف.
  useDirtyForm(dirty || busy || frozen !== null);

  const kind = overview?.sites.find((site) => site.halls.some((hall) => hall.flock?.id === flockId))?.kind ?? null;
  const flockPage = kind ? `${kind === 'broiler' ? '/broiler' : '/layers'}/flock/${flockId}` : '/';
  const leaveTo = back ?? flockPage;

  const togglePick = (item: IssueItem) => {
    if (form.picks.some((pick) => pick.itemId === item.itemId)) {
      patch({ picks: form.picks.filter((pick) => pick.itemId !== item.itemId) });
      return;
    }
    // المخزن افتراضاً أكثر مخازن المادّة (ويُختار غيره حين تكون في أكثر من مخزن).
    const store = item.stores.reduce<IssueItem['stores'][number] | null>((best, entry) => (best === null || entry.qty > best.qty ? entry : best), null);
    patch({ picks: [...form.picks, { itemId: item.itemId, name: item.name, unit: item.baseUnit, qty: '', warehouseId: store?.warehouseId ?? '' }] });
  };
  const editPick = (itemId: string, change: Partial<Pick>) => patch({ picks: form.picks.map((pick) => (pick.itemId === itemId ? { ...pick, ...change } : pick)) });
  const editLog = (key: string, change: Partial<LogDraft>) => patch({ logs: form.logs.map((log) => (log.key === key ? { ...log, ...change } : log)) });
  const addLog = () => patch({ logs: [...form.logs, { key: crypto.randomUUID(), name: '', dose: '' }] });
  /** «كمية مختلفة لكلّ قاعة»: الخانات تبدأ بالكمية المشتركة لكلّ قاعة مختارة، وما كُتب فيها يبقى إن أُطفئت ثمّ شُغّلت. */
  const seeded = (perHall: boolean, halls: readonly Target[]) => {
    if (!perHall) return form.hallQty;
    const next = { ...form.hallQty };
    for (const target of halls) for (const pick of form.picks) next[cellKey(target.flockId, pick.itemId)] ??= pick.qty;
    return next;
  };
  const toggleHall = (target: Target, on: boolean) => {
    const halls = on ? [...form.halls, target.flockId] : form.halls.filter((flock) => flock !== target.flockId);
    patch({ halls, hallQty: on ? seeded(form.perHall, [target]) : form.hallQty });
  };

  const openConfirm = () => {
    if (!ready || day === null) return;
    // المعرّفات مرّة لكلّ (فوج، مادّة) و(فوج، دواء): الموجود يبقى، والناقص يولد الآن ويُحفظ مع النموذج.
    const ids = { ...form.ids };
    const take = (key: string) => (ids[key] ??= crypto.randomUUID());
    const lines: GiveLine[] = plan.drafts.map((draft) =>
      draft.kind === 'issue'
        ? {
            kind: 'issue',
            flockId: draft.flockId,
            itemId: draft.pick.itemId,
            issueId: take(`issue:${cellKey(draft.flockId, draft.pick.itemId)}`),
            lineId: take(`line:${cellKey(draft.flockId, draft.pick.itemId)}`),
            warehouseId: draft.pick.warehouseId,
            qty: draft.qty,
          }
        : { kind: 'log', flockId: draft.flockId, id: take(`log:${cellKey(draft.flockId, draft.log.key)}`), name: draft.log.name.trim(), dose: draft.log.dose.trim() === '' ? null : draft.log.dose.trim() },
    );
    const names: Record<string, string> = {};
    const units: Record<string, BaseUnit> = {};
    for (const target of targets) names[target.flockId] = target.hall;
    for (const pick of form.picks) {
      names[pick.itemId] = pick.name;
      units[pick.itemId] = pick.unit;
      const store = itemOf(pick.itemId)?.stores.find((entry) => entry.warehouseId === pick.warehouseId);
      if (store) names[store.warehouseId] = store.name;
    }
    const next = { ...form, ids };
    setForm(next);
    setConfirm({ form: next, request: { clientRef: form.ref, on: day, lines, names, units } });
  };

  /** نداء give_to_flocks بطلب محفوظ: الأوّل من التأكيد، والإعادة بعد نتيجة مجهولة بالطلب نفسه حرفاً. */
  const submit = async (pending: GivePending, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setUnreached(false);
    // الطلب محفوظ خارج المكوّن قبل أن يخرج: رجوع أو إعادة تحميل قبل الجواب تعيد الصفحة مجمَّدة به.
    storePending(pendingId, pending);
    const { request } = pending;
    const separator = t('list.separator', '، ');
    const halls = [...new Set(request.lines.map((line) => line.flockId))].map((flock) => request.names[flock] ?? '').join(separator);
    try {
      const done = await giveToFlocks(request.clientRef, request.on, request.lines);
      storePending(pendingId, null);
      const docs = [...done.issues.map((issue) => issue.docNo), ...done.vaccinations.flatMap((mark) => (mark.docNo ? [mark.docNo] : []))];
      toast({
        tone: 'success',
        title: t('give.done', 'أُضيف إلى {halls} يوم {day}.', { halls, day: fmtDay(done.on) }),
        ...(docs.length ? { detail: t('give.done.docs', 'مستندات الصرف: {docs}.', { docs: docs.join(separator) }) } : {}),
      });
      // غادر قبل الجواب: التنبيه وحده، والصفحة التي هو فيها كما هي.
      if (!live.current) return;
      setFrozen(null);
      setConfirm(null);
      navigate(leaveTo);
    } catch (problem) {
      setConfirm(null);
      if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن سُجّلت: الصفحة تتجمّد بطلبها، والإعادة وحدها ممكنة (لن تُسجَّل مرّتين). وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(pending);
        setUnreached(retrying && surelyUnsaved(problem));
        // غادر قبل الجواب: الطلب محفوظ (صفحة الإضافة لقاعته تعود مجمَّدة به)، والتنبيه يقول أين يُعاد.
        if (!live.current) {
          toast({ tone: 'warning', title: t('give.unknown_away', 'لا نعرف إن سُجّلت الإضافة إلى {halls}: افتح «أضف للقاعة» لـ«{hall}» وأعد المحاولة؛ لن تُسجَّل مرّتين.', { halls, hall: request.names[flockId] ?? '' }) });
        }
      } else {
        // جواب أكيد بلا تسجيل: ما كُتب باقٍ (ومن الطلب المستعاد كما أُرسل) بمعرّفاته، والإرسال التالي بمرجع جديد؛ وid_conflict بمعرّفات جديدة.
        storePending(pendingId, null);
        if (!live.current) {
          // غادر قبل الجواب: النموذج ذهب مع الصفحة، فالرفض بتنبيه يسمّي ما لم يُضف وسببه.
          toast({ tone: 'danger', title: t('give.refused_away', 'لم يُضف شيء إلى {halls} يوم {day}.', { halls, day: fmtDay(request.on) }), detail: failureText(problem) });
          return;
        }
        const conflict = problem instanceof RejectedError && problem.code === 'id_conflict';
        setForm({ ...pending.form, ids: conflict ? {} : pending.form.ids, ref: crypto.randomUUID() });
        setFrozen(null);
        setFailure(problem);
        if (problem instanceof RejectedError) {
          // «عندك» والقاعات كما هي الآن (نقص، أو مادّة أو مخزن تغيّر، أو فوج أُغلق).
          optionsState.retry();
          overviewState.retry();
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const title = options ? t('give.title.hall', 'أضف لـ«{hall}»', { hall: options.hallName }) : t('give.title', 'أضف للقاعة');
  const header = (
    <>
      <Link to={leaveTo} className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="give-back">
        {back ? backLabel(back) : kind ? t('back.hall', 'رجوع إلى القاعة') : t('back.home', 'رجوع إلى الرئيسية')}
      </Link>
      <PageHeader title={title} subtitle={options ? t('give.subtitle', '{site} — علف أو دواء من المخزن، أو دواء ليس في المخزن، لهذه القاعة ولقاعات أخرى معها.', { site: options.siteName }) : undefined} />
    </>
  );

  if (frozen) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <section className="card flex flex-col gap-3 p-4" data-action="give-frozen">
          <Notice tone="warning" title={t('give.unknown', 'لا نعرف إن سُجّلت الإضافة: أعد المحاولة؛ لن تُسجَّل مرّتين.')}>
            {t('give.unknown.sent', 'أُرسلت يوم {day} بما في الجدول، والإعادة بالطلب نفسه.', { day: fmtDay(frozen.request.on) })}
          </Notice>
          <LinesTable request={frozen.request} caption={t('give.frozen.table', 'ما أُرسل')} />
          {unreached ? <Notice tone="danger" title={t('give.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.')} /> : null}
          <div>
            <Button size="lg" busy={busy} onClick={() => void submit(frozen, true)} data-action="give-retry">
              {t('issue.retry', 'أعد المحاولة')}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const locked = busy;
  const showGrid = perHall && form.picks.length > 0;
  const gridColumns: Column<Target>[] = [
    { key: 'hall', header: t('give.col.hall', 'القاعة'), sticky: true, cell: (target) => target.hall },
    ...form.picks.map((pick) => ({
      key: pick.itemId,
      header: t('give.grid.col', '{name} ({unit})', { name: pick.name, unit: unitWord(pick.unit) }),
      cell: (target: Target) => {
        const key = cellKey(target.flockId, pick.itemId);
        return (
          <input
            className="input w-32 tabular-nums"
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            aria-label={t('give.grid.cell', 'كمية «{item}» لـ«{hall}»', { item: pick.name, hall: target.hall })}
            aria-invalid={plan.cells[key] ? true : undefined}
            value={form.hallQty[key] ?? ''}
            disabled={locked}
            onChange={(event) => patch({ hallQty: { ...form.hallQty, [key]: event.target.value } })}
            data-action="give-grid-qty"
          />
        );
      },
    })),
  ];
  const gridErrors = perHall ? Object.values(plan.cells) : [];

  return (
    <div className="flex flex-col gap-4">
      {header}
      {optionsState.error ? <LoadFailed what={t('give.options_what', 'ما يُضاف للقاعة')} error={optionsState.error} onRetry={optionsState.retry} /> : null}
      {options && !active ? <Notice tone="info" title={t('give.not_active', 'فوج هذه القاعة ليس قائماً، فلا يُضاف له شيء.')} /> : null}
      {options && active && !options.canIssue && !canLog ? <Notice tone="info" title={t('give.forbidden', 'الإضافة للقاعة لمن يصرف من المخزن أو يسجّل يوم القاعة؛ دورك يقرأ فقط.')} /> : null}
      {failure ? (
        <div data-action="give-failure">
          <Notice tone="danger" title={failureText(failure)}>
            {failure instanceof RejectedError && failure.code === 'id_conflict' ? t('give.id_conflict', 'المحاولة السابقة سُجّلت أو أُلغيت؛ ما تكتبه الآن إضافة جديدة.') : null}
          </Notice>
        </div>
      ) : null}

      {options && active && options.canIssue ? (
        <section className="card flex flex-col gap-3 p-4" data-action="give-store">
          <h2 className="font-semibold">{t('give.store.title', 'من المخزن')}</h2>
          {items.length ? (
            <ItemCards items={items} picks={form.picks} locked={locked} onToggle={togglePick} />
          ) : (
            <p className="text-sm text-ink-muted">{t('issue.none', 'لا مادّة متاحة للصرف في مخازن نطاقك.')}</p>
          )}
          {form.picks.map((pick) => {
            const item = itemOf(pick.itemId);
            return (
              <div key={pick.itemId} className="flex flex-col gap-2 rounded-2xl border border-line p-3" data-action="give-pick" data-item={pick.itemId}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 font-semibold">{pick.name}</span>
                  <Button size="sm" variant="ghost" icon={<X aria-hidden="true" className="size-4" />} disabled={locked} onClick={() => patch({ picks: form.picks.filter((entry) => entry.itemId !== pick.itemId) })} data-action="give-pick-remove">
                    {t('give.remove', 'أزل')}
                  </Button>
                </div>
                {perHall ? null : (
                  <Field id={`${id}-qty-${pick.itemId}`} label={t('give.qty', 'الكمية لكلّ قاعة ({unit})', { unit: unitWord(pick.unit) })} error={plan.cells[pick.itemId] ?? null}>
                    <input
                      id={`${id}-qty-${pick.itemId}`}
                      className="input tabular-nums"
                      dir="ltr"
                      inputMode="decimal"
                      autoComplete="off"
                      value={pick.qty}
                      disabled={locked}
                      onChange={(event) => editPick(pick.itemId, { qty: event.target.value })}
                      data-action="give-qty"
                    />
                  </Field>
                )}
                {item && item.stores.length > 1 ? (
                  <div className="flex flex-col gap-2" data-action="give-stores">
                    <p className="text-sm font-medium">{t('issue.store', 'من أيّ مخزن تصرف؟')}</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={t('issue.store', 'من أيّ مخزن تصرف؟')}>
                      {item.stores.map((store) => (
                        <Button
                          key={store.warehouseId}
                          size="sm"
                          variant={pick.warehouseId === store.warehouseId ? 'primary' : 'secondary'}
                          aria-pressed={pick.warehouseId === store.warehouseId}
                          disabled={locked}
                          onClick={() => editPick(pick.itemId, { warehouseId: store.warehouseId })}
                          data-action="give-store-pick"
                          data-store={store.warehouseId}
                        >
                          {t('issue.store_option', '{name} ({qty})', { name: store.name, qty: amountText(store.qty, pick.unit) })}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {options && active && canLog ? (
        <section className="card flex flex-col gap-3 p-4" data-action="give-logs">
          <h2 className="font-semibold">{t('give.logs.title', 'دواء ليس في المخزن')}</h2>
          <p className="text-sm text-ink-muted">{t('give.logs.hint', 'يُسجَّل باسمه وجرعته لكلّ قاعة مختارة «بلا مخزن»: لا يُصرف من مخزن ولا كلفة له.')}</p>
          {form.logs.map((log) => (
            <div key={log.key} className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2" data-action="give-log">
              <Field id={`${id}-log-${log.key}`} label={t('give.log.name', 'اسم الدواء')}>
                <input id={`${id}-log-${log.key}`} className="input" autoComplete="off" maxLength={80} value={log.name} disabled={locked} onChange={(event) => editLog(log.key, { name: event.target.value })} data-action="give-log-name" />
              </Field>
              <Field id={`${id}-dose-${log.key}`} label={t('give.log.dose', 'الجرعة (اختيارية)')}>
                <input id={`${id}-dose-${log.key}`} className="input" autoComplete="off" maxLength={120} value={log.dose} disabled={locked} onChange={(event) => editLog(log.key, { dose: event.target.value })} data-action="give-log-dose" />
              </Field>
              <div>
                <Button size="sm" variant="ghost" icon={<X aria-hidden="true" className="size-4" />} disabled={locked} onClick={() => patch({ logs: form.logs.filter((entry) => entry.key !== log.key) })} data-action="give-log-remove">
                  {t('give.remove', 'أزل')}
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" variant="secondary" icon={<Plus aria-hidden="true" className="size-4" />} disabled={locked} onClick={addLog} data-action="give-log-add">
              {t('give.logs.add', 'دواء ليس في المخزن')}
            </Button>
          </div>
        </section>
      ) : null}

      {options && active && (options.canIssue || canLog) ? (
        <section className="card flex flex-col gap-3 p-4" data-action="give-halls">
          <h2 className="font-semibold">{t('give.halls.title', 'القاعات')}</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-5 accent-brand-600" checked disabled data-action="give-hall-current" />
            <span>
              {options.hallName} <span className="text-sm text-ink-muted">— {options.siteName}</span>
            </span>
          </label>
          <div>
            <Button size="sm" variant="secondary" aria-expanded={othersOpen || form.halls.length > 0} disabled={locked} onClick={() => setOthersOpen(!othersOpen)} data-action="give-others">
              {t('give.others', 'كرّر في القاعات الأخرى')}
            </Button>
          </div>
          {othersOpen || form.halls.length > 0 ? (
            overviewState.error && !overview ? (
              <LoadFailed what={t('give.others_what', 'القاعات الأخرى')} error={overviewState.error} onRetry={overviewState.retry} />
            ) : overview && !others.length ? (
              <p className="text-sm text-ink-muted">{t('give.others.none', 'لا قاعات أخرى بأفواج قائمة في نطاقك.')}</p>
            ) : (
              others.map((group) => (
                <div key={group.site.id} className="flex flex-col gap-2" data-action="give-site">
                  <p className="text-sm font-medium text-ink-muted">{group.site.name}</p>
                  {group.halls.map((target) => (
                    <label key={target.flockId} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-brand-600"
                        checked={chosen.has(target.flockId)}
                        disabled={locked}
                        onChange={(event) => toggleHall(target, event.target.checked)}
                        data-action="give-hall"
                        data-flock={target.flockId}
                      />
                      <span>{target.hall}</span>
                    </label>
                  ))}
                </div>
              ))
            )
          ) : null}
          {form.picks.length > 0 && targets.length > 1 ? (
            <Switch
              id={`${id}-per-hall`}
              label={t('give.per_hall', 'كمية مختلفة لكلّ قاعة')}
              description={t('give.per_hall.hint', 'الخانة الفارغة: لا شيء من المادّة لتلك القاعة.')}
              checked={perHall}
              onChange={(on) => patch({ perHall: on, hallQty: seeded(on, targets) })}
            />
          ) : null}
          {showGrid && targets.length > 1 ? (
            <>
              <DataTable caption={t('give.grid', 'الكمية لكلّ قاعة')} columns={gridColumns} rows={targets} rowKey={(target) => target.flockId} empty={t('give.grid.empty', 'لا قاعات.')} />
              {gridErrors.length ? (
                <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
                  {gridErrors[0]}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {options && active && (options.canIssue || canLog) ? (
        <section className="card flex flex-col gap-3 p-4">
          <Field id={`${id}-day`} label={t('give.day', 'يوم الإضافة')} error={dayError} hint={t('day.hint', 'يوم/شهر/سنة.')}>
            <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={dayText} disabled={locked} onChange={(event) => patch({ day: event.target.value })} data-action="give-day" />
          </Field>
          {plan.drafts.length > 0 && problems.length > 0 ? (
            <ul className="list-disc ps-5 text-sm text-danger-700 dark:text-danger-300" data-action="give-missing">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-end">
            <Button size="lg" icon={<Plus aria-hidden="true" className="size-5" />} busy={busy} disabled={!ready} onClick={openConfirm} data-action="give-go">
              {label}
            </Button>
          </div>
        </section>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('give.confirm.title', '{action} يوم {day}؟', { action: label, day: fmtDay(confirm.request.on) })}
          consequence={
            <div className="flex flex-col gap-3">
              <p>{t('give.confirm.body', 'بنداء واحد: إن رُفض سطر منها لا يُحفظ شيء.')}</p>
              <LinesTable request={confirm.request} caption={t('give.confirm.table', 'ما يُضاف لكلّ قاعة')} />
              {plan.totals.length ? <TotalsTable totals={plan.totals} /> : null}
            </div>
          }
          confirmLabel={label}
          busy={busy}
          action="give-confirm"
          onConfirm={() => void submit(confirm, false)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

/** نموذج لكلّ فوج: الانتقال من قاعة إلى أخرى يبدأ نموذجاً جديداً بمعرّفاته (لا يرث ما كُتب لغيرها). */
export default function GivePage() {
  const { flockId = '' } = useParams();
  return <GiveForm key={flockId} flockId={flockId} />;
}
