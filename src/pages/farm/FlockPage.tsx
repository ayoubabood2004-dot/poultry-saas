import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { useWidePage } from '../../components/ui/OfficialReport';
import { toast } from '../../components/ui/Toast';
import { WeightPad } from '../../components/ui/WeightPad';
import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import type { Milli } from '../../domain/money';
import { naturalCompare } from '../../domain/naturalOrder';
import type { BaseUnit } from '../../domain/units';
import { parseDayText } from '../../lib/dayText';
import { describeError, NotConnectedError, RejectedError } from '../../lib/errors';
import { columnDecimals, fmtCounted, fmtDay, fmtInt, fmtMilli, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { onlineStore } from '../../lib/online';
import {
  MAX_KEROSENE_LITERS,
  openOutbox,
  pendingOps,
  removeReview,
  reviewEntries,
  saveRound,
  visitDayVersion,
  type EnqueueInput,
  type FlockDayPayload,
  type FlockGasPayload,
  type FlockKerosenePayload,
  type OutboxOp,
  type ReviewEntry,
  type SendResult,
} from '../../lib/outbox';
import type { FlockSummary, HallView, SiteView } from '../../lib/repo/flocks';
import { parseDayRow, parseGas, parseKerosene, recordFlockWeight } from '../../lib/repo/flocks';
import { listenOtherWindows } from '../../lib/roundWindows';
import { decideFlockReject, loadHallSheet, sendFlockFeed, toBaseQty, voidSheetFeed, type FeedSend, type HallSheet, type RejectDecision, type SheetDay, type SheetFeedItem, type SheetFeedLine, type SheetReject, type SheetUnit } from '../../lib/repo/hallSheet';
import { refreshRoundQueue, roundQueueStore, stampKey, uploadRounds, type RoundRun } from '../../lib/roundUploads';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import FlockCard from '../halls/FlockCard';
import { failureText, pendingKey, readPending, storePending, surelyUnsaved } from '../halls/GivePage';
import { newTicketPath } from '../halls/ticketParts';
import { CARD_CLASS, givePath, LINK_CLASS } from './feed';
import { FlockEditDialog } from './FlockEditDialog';
import { HallDialog, OpenFlockDialog } from './hallDialogs';
import { BARREL_LITERS } from './gridLogic';
import { SheetGrid, type CellChange, type CellValue, type ChangeCheck, type ChangeResult, type GridCell, type GridField, type SheetGridView, type SheetSubmit } from './SheetGrid';
import { gasSoFar, loadTransport, parkText, soFar } from './roundText';
import { farmPath, farmTitle, hallLabel, hallPath, loadOverviewKept, useStamp } from './shared';

// صفحة القاعة = ورقة القاعة (طلب المالك 2026-11-21 بصورة ورقته «هلاكات قاعة (7)»، «وجبة 2026-11-13»؛ عقد 0034/0035 الجزء C/S2،
// docs/HALLS_SHEET_PLAN.md المرحلة ٢): العنوان «هلاكات قاعة (N)» وتحته «وجبة يوم/شهر/سنة»، ثمّ صفّ واحد من الأفعال الكبيرة بلا قوائم داخل قوائم
// («أرسل علفاً» و«بيع» و«التقرير» و«عدّل الوجبة» و«أغلق الوجبة» أو «أعِد فتحها»)، ثمّ جدول الورقة نفسه من hall_sheet: العمر | التاريخ | الهلاكات |
// الغاز | الكاز (لتر) | العلف | الملاحظات (وللبيّاض البيض)، صفّ لكلّ يوم من التسكين حتى نهاية الوجبة، واليوم معلَّم وظاهر عند الفتح، وصفّ مجموع من الخادم.
// والكاز (0037، رسالة الزبون 2026-11-26) رقمٌ باللتر مثل الغاز من هذه الورقة وحدها (لا الجولة): set_flock_kerosene بنسخة صفّه، ويُكتب باللتر أو بالبرميل
// (البرميل 200 لتر، جواب المالك) ويُحفظ لتراً.
// والورقة مقفولة (عقد 0036 S2، كلمة المالك 2026-11-24): لا خانة تُلمس، وفوقها «✎ تعديل الجدول»، وبعده جدول كإكسل (SheetGrid: الأسهم وEnter وTab والكتابة
// فوق القيمة والنسخ واللصق والتراجع بالحاسوب، والكتابة بقواعد ورقة الخانة نفسها cellWrite)؛ وباللمس في وضع التعديل:
// لمسة على خانة الهلاكات أو الغاز أو البيض أو الملاحظة تفتح ورقة سفلية بلوحة أرقام التطبيق و«تم» (هلاكات يوم = 3 لمسات)، بالطابور نفسه بلا نت:
// الهلاكات والبيض والملاحظة save_flock_day بنسخة صفّ اليوم (والمستبعد القديم يُصفَّر فيبقى داخل الهلاكات)، والغاز set_flock_gas بنسخة صفّه؛ والخانة
// «بانتظار الرفع» حتى تُحفظ. ولمسة على خانة العلف (أو «أرسل علفاً» لليوم) تفتح ورقة العلف: ما أُرسل لذلك اليوم بـ«ألغِ»، واختيار العلف (آخره جاهز)
// والكمية بالكيس أو الكيلو، و«أرسل» من «رصيد العلف» بنت (send_flock_feed) بمرجع محفوظ خارج المكوّن. وكلّ أيام الوجبة القائمة تُكتب مهما فاتت (لا حدّ
// أيام سبعة)، والمغلقة قراءة فقط. وما رُدّ من الأجهزة (flock_day_rejects) جمل بـ«أُدخلت» و«تجاهل»، وما بقي على هذا الجهاز ولم يُحفظ يُدلّ عليه.

type Nav = { prev: HallView | null; next: HallView | null };
type CellField = 'dead' | 'gas' | 'kerosene' | 'eggs' | 'note';

/** آخر قراءة ناجحة تبقى معروضة أثناء القراءة من جديد (useLoad يرجّع null أثناءها): الورقة ونوافذها لا تُطوى ولا تقفز. */
function useKept<T>(data: T | null): T | null {
  const [kept, setKept] = useState<T | null>(data);
  if (data !== null && data !== kept) setKept(data);
  return data ?? kept;
}

/** اسم القاعة بعد كلمة «قاعة» في عنوان: الرقم وحده رقم القاعة، و«قاعة 5» تُقرأ «5» (لا «قاعة قاعة 5»)، وغيرها باسمه. */
export function sheetHallName(name: string): string {
  return name.trim().replace(/^قاعة\s+/u, ''); // i18n-ok: بادئة اسم القاعة كما يكتبه المدير تُشال من العنوان
}

/** «هلاكات قاعة (7)». */
function sheetTitle(name: string): string {
  return t('sheet.title', 'هلاكات قاعة ({hall})', { hall: sheetHallName(name) });
}

/** تاريخ صفّ الورقة يوم/شهر (السنة في سطر «وجبة» فوق الجدول): العمودان الأوّلان أضيق فيتّسع الهاتف للورقة. */
const rowDay = (on: Day): string => fmtDay(on).slice(0, 5);

/**
 * ما حُفظ من هذا الجهاز لهذا الفوج في رفعٍ بهذه الجلسة (رافع الخلفية والورقة معاً: roundQueueStore)، بنسخة صفّه بعده. الورقة تعرضه وتبني التعديل التالي
 * على نسخته حتى تصلها قراءة بعده (مراجعة 0035): رفعٌ في الخلفية لا يغيّر القراءة المعروضة، فكانت الخانة ترجع إلى القيمة القديمة بعد الرفع، والتعديل التالي
 * يُرسل بالنسخة القديمة فيُرَدّ stale_day أو stale_gas. day: حمولة مجموع اليوم («بلا تغيير» غائبة)، أو صفّ اليوم كلّه بعد زيارة.
 */
export type SavedEdit =
  | { kind: 'gas'; on: Day; version: number; cylinders: number | null }
  | { kind: 'kerosene'; on: Day; version: number; liters: number | null }
  | { kind: 'day'; on: Day; version: number; dead?: number; culled?: number; eggs?: number | null; note?: string | null };

const given = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export function savedEdits(runs: readonly RoundRun[], key: string, flockId: string): SavedEdit[] {
  const edits: SavedEdit[] = [];
  for (const run of runs) {
    if (run.key !== key) continue;
    for (const entry of run.results) {
      if (entry.flockId !== flockId || entry.result.kind !== 'saved') continue;
      const { version } = entry.result;
      if (entry.fn === 'set_flock_gas') {
        edits.push({ kind: 'gas', on: entry.day, version, cylinders: (entry.payload as FlockGasPayload).cylinders });
      } else if (entry.fn === 'set_flock_kerosene') {
        // كاز اليوم (0037): كما أرجعه الخادم إن قرأه المحلّل، وإلّا كما أُرسل (النسخة من الجواب نفسه).
        let liters = (entry.payload as FlockKerosenePayload).liters;
        try {
          if (entry.result.kerosene !== undefined) liters = parseKerosene(entry.result.kerosene).liters;
        } catch { // swallow-ok: جواب بشكل غريب: يُعرض ما أُرسل، والقراءة من جديد بعد الرفع تعرض الخادم
          /* كما أُرسل */
        }
        edits.push({ kind: 'kerosene', on: entry.day, version, liters });
      } else if (entry.fn === 'add_flock_gas') {
        // قناني أُرسلت من الجولة (0036): غاز اليوم بعد الإضافة كما أرجعه الخادم (فحصه المحلّل قبل أن تُعدّ محفوظة)، لا الإضافة وحدها.
        try {
          const gas = parseGas(entry.result.gas);
          edits.push({ kind: 'gas', on: entry.day, version: gas.version, cylinders: gas.cylinders });
        } catch { // swallow-ok: جواب بشكل غريب لا يُعرض؛ القراءة من جديد بعد الرفع تعرضه من الخادم
          continue;
        }
      } else if (entry.fn === 'save_flock_day') {
        const payload = entry.payload as FlockDayPayload;
        edits.push({
          kind: 'day',
          on: entry.day,
          version,
          ...(given(payload.dead) ? { dead: payload.dead } : {}),
          ...(given(payload.culled) ? { culled: payload.culled } : {}),
          ...(given(payload.eggs_total) ? { eggs: payload.eggs_total } : {}),
          ...(given(payload.note) ? { note: payload.note === '' ? null : payload.note } : {}),
        });
      } else {
        // زيارة، أو هلاكات اليوم مرّة (set_flock_dead، 0036): صفّ اليوم بعدها كما أرجعه الخادم (فحصه المحلّل قبل أن تُعدّ محفوظة).
        const after = visitDayVersion(entry.result.day);
        if (after === null) continue;
        try {
          const row = parseDayRow(entry.result.day);
          edits.push({ kind: 'day', on: entry.day, version: after, dead: row.dead ?? 0, culled: row.culled ?? 0, eggs: row.eggsTotal, note: row.note });
        } catch { // swallow-ok: صفّ يوم بشكل غريب لا يُعرض؛ القراءة من جديد بعد الرفع تعرضه من الخادم
          continue;
        }
      }
    }
  }
  return edits;
}

/** ما حُفظ من هذا الجهاز لهذا الفوج، ويتجدّد مع كلّ رفع. */
function useSavedEdits(flockId: string): readonly SavedEdit[] {
  const stamp = useStamp();
  const runs = useStore(roundQueueStore).runs;
  const key = stamp ? stampKey(stamp) : '';
  return useMemo(() => (key ? savedEdits(runs, key, flockId) : []), [runs, key, flockId]);
}

/**
 * رفعٌ من هذا الجهاز مسّ هذا الفوج (من الورقة أو من الخلفية): رقمه مفتاحٌ لقراءة الورقة، فتُقرأ من جديد بعده بلا نداء من الشاشة؛ وأوّل ما يُفتح الرقم
 * الحاليّ فلا قراءة زائدة.
 */
function useUploadMark(flockId: string): number {
  const stamp = useStamp();
  const runs = useStore(roundQueueStore).runs;
  const key = stamp ? stampKey(stamp) : '';
  return runs.reduce((mark, run) => (run.key === key && run.results.some((entry) => entry.flockId === flockId) ? Math.max(mark, run.seq) : mark), 0);
}

/** عمليات هذا الجهاز لهذا الفوج ولم تُرفع بعد، ومرفوضاته في رفّ المراجعة: تُقرأ عند الفتح وبعد كلّ رفع وكلّ حفظ. */
function useDeviceOps(flockId: string, tick: number): { ops: readonly OutboxOp[]; review: readonly ReviewEntry[] } {
  const stamp = useStamp();
  const uploads = useStore(roundQueueStore).seq;
  const [state, setState] = useState<{ key: string; ops: OutboxOp[]; review: ReviewEntry[] } | null>(null);
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
          if (!cancelled) setState({ key: `${userId}:${orgId}:${flockId}`, ops: ops.filter((op) => op.flockId === flockId), review: review.filter((entry) => entry.op.flockId === flockId) });
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
const NO_DEVICE = { ops: [] as readonly OutboxOp[], review: [] as readonly ReviewEntry[] };

/**
 * قيم الخانة كما يجب أن تُرى: قراءة الخادم، ثمّ ما حُفظ من هذا الجهاز بنسخة أحدث منها (لم تصل الورقةَ قراءةٌ بعده)، ثمّ عمليات الجهاز التي لم تُرفع
 * (الهلاكات والبيض من مجموع اليوم والزيارات: soFar، والملاحظة والغاز من أحدث عملية لهما). والنسختان أكبر ما رآه الجهاز لصفّ اليوم ولصفّ الغاز: عليهما
 * يُبنى التعديل التالي.
 */
interface Shown {
  dead: number;
  /** المستبعد القديم داخل dead: تعديل الهلاكات يصفّره. */
  culled: number;
  eggs: number | null;
  note: string | null;
  gas: number | null;
  /** لترات الكاز (0037)، أو null: لم يُسجَّل. */
  kerosene: number | null;
  dayVersion: number | null;
  gasVersion: number | null;
  keroseneVersion: number | null;
  /** لليوم جولة محفوظة أو منتظرة: الهلاكات تُعرض ولو صفراً. */
  recorded: boolean;
  /** في الخانة عملية لم تُرفع بعد. */
  pending: ReadonlySet<CellField>;
}

function shownOf(day: SheetDay, ops: readonly OutboxOp[], saved: readonly SavedEdit[]): Shown {
  let deadOnly = day.dead - day.culled;
  let culled = day.culled;
  let eggs = day.eggsTotal;
  let note = day.note;
  let gas = day.gas;
  let kerosene = day.kerosene;
  let dayVersion = day.dayVersion;
  let gasVersion = day.gasVersion;
  let keroseneVersion = day.keroseneVersion;
  for (const edit of saved.filter((entry) => entry.on === day.on).sort((a, b) => a.version - b.version)) {
    if (edit.kind === 'gas') {
      if (edit.version > (gasVersion ?? 0)) {
        gas = edit.cylinders;
        gasVersion = edit.version;
      }
      continue;
    }
    if (edit.kind === 'kerosene') {
      if (edit.version > (keroseneVersion ?? 0)) {
        kerosene = edit.liters;
        keroseneVersion = edit.version;
      }
      continue;
    }
    if (edit.version <= (dayVersion ?? 0)) continue;
    if (edit.dead !== undefined) deadOnly = edit.dead;
    if (edit.culled !== undefined) culled = edit.culled;
    if (edit.eggs !== undefined) eggs = edit.eggs;
    if (edit.note !== undefined) note = edit.note;
    dayVersion = edit.version;
  }
  const own = ops.filter((op) => op.day === day.on).sort((a, b) => a.createdAt - b.createdAt);
  const pending = new Set<CellField>();
  // الغاز بنوعيه كما تعدّه الجولة (gasSoFar): التصحيح يحلّ محلّ المجموع، والقناني المرسلة من الجولة (add_flock_gas، 0036) تُضاف إليه.
  const gasNow = gasSoFar(gas, own);
  gas = gasNow.cylinders;
  if (gasNow.pending) pending.add('gas');
  const totals = own.filter((op) => op.fn !== 'set_flock_gas' && op.fn !== 'add_flock_gas' && op.fn !== 'set_flock_kerosene');
  for (const op of own) {
    if (op.fn === 'set_flock_gas' || op.fn === 'add_flock_gas') {
      continue;
    } else if (op.fn === 'set_flock_kerosene') {
      // كاز اليوم (0037): التصحيح يحلّ محلّ المحفوظ، كتصحيح الغاز.
      kerosene = op.payload.liters;
      pending.add('kerosene');
    } else if (op.fn === 'set_flock_dead') {
      // هلاكات اليوم مرّة من الجولة (0036): خانة الهلاكات وحدها تنتظر، ومجموعها من soFar.
      pending.add('dead');
    } else if (op.fn === 'save_flock_day') {
      if (given(op.payload.dead)) pending.add('dead');
      if (given(op.payload.culled)) culled = op.payload.culled;
      if (given(op.payload.eggs_total)) pending.add('eggs');
      if (given(op.payload.note)) {
        note = op.payload.note === '' ? null : op.payload.note;
        pending.add('note');
      }
    } else {
      pending.add('dead');
      if (op.payload.eggs_total !== null) pending.add('eggs');
    }
  }
  const total = soFar({ dead: deadOnly + culled, culled: 0, feedKg: null, eggsTotal: eggs, eggsBroken: day.eggsBroken }, totals);
  return {
    dead: total.dead + total.culled,
    culled,
    eggs: total.eggsTotal,
    note,
    gas,
    kerosene,
    dayVersion,
    gasVersion,
    keroseneVersion,
    recorded: dayVersion !== null || pending.has('dead'),
    pending,
  };
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
    case 'stale_kerosene':
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

/** لترات الكاز بالفصحى: «400 لتر»، «لتران»، «5 لترات»، «20 لتراً». */
const litersText = (liters: number): string => fmtQty(BigInt(liters) * 1000n, 'L').main;
/** عدد البراميل بالفصحى: «برميل واحد»، «برميلان»، «3 براميل»، «11 برميلاً». */
const barrelsText = (n: number): string =>
  fmtCounted(BigInt(n) * 1000n, t('unit.barrel', 'برميل'), { one: t('unit.barrel.one', 'برميل واحد'), two: t('unit.barrel.two', 'برميلان'), few: t('unit.barrel.few', 'براميل'), many: t('unit.barrel.many', 'برميلاً') });

function fieldLabel(field: CellField): string {
  switch (field) {
    case 'dead':
      return t('sheet.col.dead', 'الهلاكات');
    case 'gas':
      return t('sheet.col.gas', 'الغاز');
    case 'kerosene':
      return t('sheet.col.kerosene', 'الكاز (لتر)');
    case 'eggs':
      return t('sheet.col.eggs', 'البيض');
    case 'note':
      return t('sheet.col.note', 'الملاحظات');
  }
}

/** ما تكتبه خانة يوم: عملية الطابور، أو لا شيء (الملاحظة كما هي، أو غاز فارغ يُمسح)، أو جملة الخطأ. */
type CellWrite = { kind: 'input'; input: EnqueueInput } | { kind: 'same' } | { kind: 'error'; error: string };

/**
 * خانة يوم إلى عملية الطابور، بقواعد واحدة لورقة الخانة (CellSheet) وللجدول كإكسل (عقد 0036 S2): الحدود قبل الحفظ كما يفحصها الخادم (الهلاكات لا تتجاوز
 * الحيّ الآن مع هلاكات اليوم نفسه، والقناني حتى 1,000، والبيض حتى 10,000,000، والملاحظة حتى 500 حرف)، والنسخة التي يُبنى عليها التعديل أكبر ما رآه هذا
 * الجهاز لصفّه (قراءة الورقة، أو ما حُفظ منه بعدها)؛ والمستبعد القديم يُصفَّر مع الهلاكات. value: عدد، أو نصّ الملاحظة، أو null (امسح الغاز).
 */
function cellWrite(sheet: HallSheet, day: SheetDay, field: CellField, shown: Shown, value: number | string | null): CellWrite {
  const base = { flockId: sheet.flock.id, day: day.on };
  if (field === 'note') {
    const text = (typeof value === 'string' ? value : '').trim();
    if (text.length > 500) return { kind: 'error', error: t('sheet.note.long', 'الملاحظة حتى 500 حرف.') };
    if (text === (shown.note ?? '')) return { kind: 'same' };
    return { kind: 'input', input: { fn: 'save_flock_day', ...base, payload: { note: text }, baseVersion: shown.dayVersion } };
  }
  if (field === 'gas' && value === null) {
    if (shown.gas === null) return { kind: 'same' };
    return { kind: 'input', input: { fn: 'set_flock_gas', ...base, payload: { cylinders: null }, baseVersion: shown.gasVersion } };
  }
  if (field === 'kerosene' && value === null) {
    if (shown.kerosene === null) return { kind: 'same' };
    return { kind: 'input', input: { fn: 'set_flock_kerosene', ...base, payload: { liters: null }, baseVersion: shown.keroseneVersion } };
  }
  const n = typeof value === 'number' ? value : 0;
  if (field === 'gas') {
    if (n > MAX_CYLINDERS) return { kind: 'error', error: t('sheet.gas.max', 'عدد القناني من 0 إلى 1,000.') };
    return { kind: 'input', input: { fn: 'set_flock_gas', ...base, payload: { cylinders: n }, baseVersion: shown.gasVersion } };
  }
  if (field === 'kerosene') {
    if (n > MAX_KEROSENE_LITERS) return { kind: 'error', error: t('sheet.kerosene.max', 'الكاز من 0 إلى 20,000 لتر في اليوم (100 برميل).') };
    return { kind: 'input', input: { fn: 'set_flock_kerosene', ...base, payload: { liters: n }, baseVersion: shown.keroseneVersion } };
  }
  if (field === 'dead') {
    // الحيّ الذي يقبله الخادم لهلاكات هذا اليوم: الحيّ الآن مع هلاكات اليوم نفسه.
    const liveBound = sheet.summary.live + day.dead;
    if (n > MAX_BIRDS || n > liveBound) return { kind: 'error', error: t('sheet.dead.max', 'الهلاكات أكثر من الطيور الحيّة ({live}).', { live: fmtInt(Math.max(liveBound, 0)) }) };
    return { kind: 'input', input: { fn: 'save_flock_day', ...base, payload: { dead: n, culled: shown.culled > 0 ? 0 : null }, baseVersion: shown.dayVersion } };
  }
  if (n > MAX_BIRDS) return { kind: 'error', error: t('sheet.eggs.max', 'عدد البيض حتى 10,000,000.') };
  return { kind: 'input', input: { fn: 'save_flock_day', ...base, payload: { eggs_total: n }, baseVersion: shown.dayVersion } };
}

/**
 * ورقة سفلية لخانة يوم: لوحة أرقام التطبيق تبدأ فارغة (فأوّل رقم هو القيمة، والمسجّل مكتوب فوقها)، و«تم» يحفظ؛ والملاحظة نصّ. والحفظ بالجدول نفسه
 * (submit من SheetGrid): القيمة تظهر في خانتها «بانتظار الرفع» وتدخل التراجع والإعادة كالمكتوب بلوحة المفاتيح (المراجعة R13)، بالطابور والرافع الواحد،
 * والحدود قبل الحفظ بقواعد cellWrite نفسها (الهلاكات لا تتجاوز الحيّ، والقناني حتى 1,000).
 */
function CellSheet({ day, field, shown, submit, onClose, onSaved }: { day: SheetDay; field: CellField; shown: Shown; submit: SheetSubmit; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const online = useStore(onlineStore);
  const current = field === 'dead' ? (shown.recorded ? shown.dead : null) : field === 'gas' ? shown.gas : field === 'kerosene' ? shown.kerosene : field === 'eggs' ? shown.eggs : null;
  const [value, setValue] = useState('');
  // الكاز باللتر أو بالبرميل (جواب المالك 2026-11-26): ما يُكتب بالبرميل يُحفظ لتراً (× 200).
  const [barrels, setBarrels] = useState(false);
  const typedCount = /^[0-9]{1,8}$/u.test(value) ? Number(value) : null; // number-ok: عدد من أرقام لوحة التطبيق وحدها
  const [note, setNote] = useState(shown.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNote = field === 'note';
  const typed = isNote ? note !== (shown.note ?? '') : value !== '';
  // الغاز والكاز المسجّلان يُمسحان («امسح الغاز» و«امسح الكاز»: null، والخادم يُبقي صفّه بنسخة أكبر).
  const clearable = (field === 'gas' && shown.gas !== null) || (field === 'kerosene' && shown.kerosene !== null);

  const save = async (clear = false) => {
    if (busy) return;
    let written: CellValue;
    if (clear) {
      if (!clearable) return;
      written = null;
    } else if (isNote) {
      written = note;
    } else {
      if (typedCount === null) return;
      written = field === 'kerosene' && barrels ? typedCount * BARREL_LITERS : typedCount;
    }
    setBusy(true);
    setError(null);
    const result = await submit(written);
    // ما لم يُكتب (الحدود) أو لم يصل الطابور يبقى في الورقة بسببه؛ وما ردّه الخادم قيل بتنبيه وسببه في خانته.
    if (result.kind === 'error' || (result.kind === 'failed' && !result.refused)) {
      setError(result.kind === 'error' ? result.error : result.message);
      setBusy(false);
      return;
    }
    if (result.kind === 'saved') toast({ tone: 'success', title: t('sheet.saved', 'حُفظ.') });
    else if (result.kind === 'device') resultToast(null, online);
    onSaved();
  };

  const unit =
    field === 'gas'
      ? t('sheet.unit.gas', 'قنينة')
      : field === 'kerosene'
        ? barrels
          ? t('sheet.unit.barrel', 'برميل')
          : t('sheet.unit.liter', 'لتر')
        : field === 'eggs'
          ? t('sheet.unit.eggs', 'بيضة')
          : t('sheet.unit.dead', 'طير');
  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={typed}
      title={t('sheet.cell.title', '{field} — يوم {day} (العمر {age})', { field: fieldLabel(field), day: fmtDay(day.on), age: fmtInt(day.age) })}
      footer={
        clearable ? (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" className="w-full" onClick={() => void save()} busy={busy} disabled={value === ''} data-action="cell-done">
              {t('sheet.done', 'تم')}
            </Button>
            <Button size="lg" variant="secondary" className="w-full" onClick={() => void save(true)} disabled={busy} data-action="cell-clear">
              {field === 'kerosene' ? t('sheet.kerosene.clear', 'امسح الكاز') : t('sheet.gas.clear', 'امسح الغاز')}
            </Button>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={() => void save()} busy={busy} disabled={!isNote && value === ''} data-action="cell-done">
            {t('sheet.done', 'تم')}
          </Button>
        )
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
              {current === null
                ? t('sheet.cell.empty', 'لم يُسجَّل شيء لهذا اليوم بعد.')
                : field === 'kerosene'
                  ? t('sheet.cell.current_amount', 'المسجّل الآن: {amount}', { amount: litersText(current) })
                  : t('sheet.cell.current', 'المسجّل الآن: {n}', { n: fmtInt(current) })}
              {field === 'dead' && shown.culled > 0 ? ` ${t('sheet.cell.culled', '(منها {n} مستبعد قديم يُحسب معها)', { n: fmtInt(shown.culled) })}` : ''}
            </p>
            {field === 'kerosene' ? (
              <>
                <Segmented<'liters' | 'barrels'>
                  label={t('sheet.kerosene.unit', 'وحدة الكاز')}
                  options={[
                    { value: 'liters', label: t('sheet.unit.liters', 'لتر') },
                    { value: 'barrels', label: t('sheet.unit.barrels', 'برميل') },
                  ]}
                  value={barrels ? 'barrels' : 'liters'}
                  onChange={(next) => setBarrels(next === 'barrels')}
                />
                {barrels ? (
                  <p className="text-sm text-ink-muted" data-action="cell-barrels">
                    {typedCount === null
                      ? t('sheet.kerosene.barrel_hint', 'البرميل {liters}.', { liters: litersText(BARREL_LITERS) })
                      : t('sheet.kerosene.barrels_are', '{barrels} = {liters}', { barrels: barrelsText(typedCount), liters: litersText(typedCount * BARREL_LITERS) })}
                  </p>
                ) : null}
              </>
            ) : null}
            <WeightPad value={value} onChange={setValue} unitLabel={unit} maxDecimals={0} onEnter={() => void save()} />
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
/** كمية العلف بوحدة أساسه بالفصحى وبفواصل الآلاف: «2,500 كغم» (الكيلو اختصار ثابت ولو تجاوز الطنّ، كعمود الورقة)، و«لتران»، و«5 لترات». */
export const feedAmount = (qty: Milli, unit: BaseUnit): string => (unit === 'kg' ? t('sheet.feed.kg', '{qty} كغم', { qty: kgOf(qty) }) : fmtQty(qty, unit).main);

/** طلب الإرسال المحفوظ خارج المكوّن (درس 2026-11-10): ما أُرسل حرفاً، وأسماؤه للعرض. */
interface FeedRequest extends FeedSend {
  itemName: string;
  baseUnit: BaseUnit;
}

const asFeedRequest = (value: unknown): FeedRequest | null => {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!(typeof row.clientRef === 'string' && typeof row.issueId === 'string' && typeof row.lineId === 'string' && typeof row.itemId === 'string' && typeof row.qty === 'bigint' && typeof row.forDay === 'string' && typeof row.itemName === 'string')) return null;
  return { ...(row as unknown as FeedRequest), baseUnit: row.baseUnit === 'L' || row.baseUnit === 'pc' ? row.baseUnit : 'kg' };
};

/** زرّ الورقة بسطرين: الفعل بخطّه، وتحته ما يُرسل بخطّ صغير يُقصّ ولا يلتفّ (عرض 360). */
function TwoLines({ main, sub }: { main: string; sub: string }) {
  return (
    <span className="flex min-w-0 max-w-full flex-col items-center">
      <span className="max-w-full truncate">{main}</span>
      <span className="max-w-full truncate text-xs font-normal">{sub}</span>
    </span>
  );
}

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
  // أكثر ممّا يأخذه إرسال واحد (أكبر مخزن علف واحد فيه المادّة): يُقال وهو يُكتب، و«أرسل» معطّل (كان يُقال بعد الضغط والزرّ مفتوح، صورة المالك 2026-11-23).
  const over = item !== null && qty !== null && qty > item.onHand;
  const canSend = online && !busy && item !== null && qty !== null && !over;

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
      toast({ tone: 'success', title: t('sheet.feed.sent', 'أُرسل {amount} من «{item}» ليوم {day} ({doc}).', { amount: feedAmount(sent.issue.qty, sent.issue.unit), item: sent.issue.itemName, day: fmtDay(sent.issue.forDay), doc: sent.issue.docNo }) });
      onChanged();
      onClose();
    } catch (failure) {
      if (surelyUnsaved(failure)) {
        // جواب أكيد بلا صرف: المكتوب باقٍ، والإرسال التالي بمرجع جديد.
        storePending(storeKey, null);
        setFrozen(null);
        setError(failureText(failure));
      } else {
        // لا نعرف إن صُرف: الطلب محفوظ بيومه، والإعادة وحدها ممكنة (لن يُصرف مرّتين)؛ تقوله جملته بيومه (feed-pending).
        setFrozen(request);
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const go = () => {
    if (!item || !choice || qty === null) return;
    if (qty > item.onHand) {
      // «عندك» أكبر ما يأخذه إرسال واحد (أكبر مخزن علف واحد فيه المادّة، عقد مراجعة 0035).
      setError(t('sheet.feed.short', 'أكثر ما يُرسل من «{item}» مرّة واحدة {have}.', { item: item.name, have: feedAmount(item.onHand, item.baseUnit) }));
      return;
    }
    void send({ clientRef: crypto.randomUUID(), issueId: crypto.randomUUID(), lineId: crypto.randomUUID(), flockId: sheet.flock.id, itemId: item.itemId, qty, forDay: day.on, itemName: item.name, baseUnit: item.baseUnit });
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
          <Button variant="ghost" disabled={!online} onClick={() => setVoiding({ line, ref: crypto.randomUUID(), busy: false })} data-action="feed-void">
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
          shownRequest ? (
            // الطلب المجمَّد يُعاد ولو فُتحت الورقة ليوم آخر أو لوجبة لا تُكتب الآن: جوابه وحده يحسمه، وهو مسمّى بيومه.
            <Button size="lg" className="w-full" busy={busy} disabled={!online} onClick={() => void send(shownRequest)} data-action="feed-retry">
              <TwoLines
                main={t('sheet.feed.retry', 'أعد المحاولة')}
                sub={t('sheet.feed.retry_what', 'علف يوم {day}: {amount} من «{item}»', { day: fmtDay(shownRequest.forDay), amount: feedAmount(shownRequest.qty, shownRequest.baseUnit), item: shownRequest.itemName })}
              />
            </Button>
          ) : writable ? (
            <Button size="lg" className="w-full" busy={busy} disabled={!online || qty === null || item === null || over} onClick={go} data-action="feed-send">
              {qty !== null && item ? <TwoLines main={t('sheet.feed.send_amount', 'أرسل {amount}', { amount: feedAmount(qty, item.baseUnit) })} sub={over ? t('sheet.feed.send_over', 'أكثر ممّا عندك: {have}', { have: feedAmount(item.onHand, item.baseUnit) }) : t('sheet.feed.send_item', 'من «{item}»', { item: item.name })} /> : t('sheet.feed.send', 'أرسل')}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4" data-action="feed-sheet">
          {shownRequest ? (
            <div data-action="feed-pending">
              <Notice
                tone="warning"
                title={t('sheet.feed.pending', 'علف يوم {day} لم يُعرف مصيره: أعد المحاولة.', { day: fmtDay(shownRequest.forDay) })}
              >
                {t('sheet.feed.pending_body', '{amount} من «{item}». لن يُصرف مرّتين، ولا يُرسل علف غيره حتى يُعرف مصيره.', { amount: feedAmount(shownRequest.qty, shownRequest.baseUnit), item: shownRequest.itemName })}
              </Notice>
            </div>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t('sheet.feed.sent_title', 'ما أُرسل لهذا اليوم')}</h3>
            <DataTable caption={t('sheet.feed.sent_title', 'ما أُرسل لهذا اليوم')} columns={columns} rows={day.feed} rowKey={(line) => line.issueId} empty={t('sheet.feed.none', 'لم يُرسل علف لهذا اليوم.')} />
            {day.feed.some((line) => line.issuedOn !== day.on) ? <p className="text-xs text-ink-muted">{t('sheet.feed.late_note', 'علف يوم فات يخرج من المخزن يوم تسجيله، ويُعرض في يومه هنا.')}</p> : null}
            {day.carryInKg !== null ? (
              <p className="text-sm" data-action="feed-carry">
                {t('sheet.feed.carry', 'منقول من الوجبة السابقة: {amount}، داخل علف هذا اليوم (ليس صرفاً من المخزن).', { amount: feedAmount(day.carryInKg, 'kg') })}
              </p>
            ) : null}
            {day.feedBackKg !== null ? (
              <p className="text-sm" data-action="feed-back">
                {t('sheet.feed.back', 'رُدّ من القاعة يوم الإغلاق: {amount}، إلى المخزن ومنقولاً إلى الوجبة التالية.', { amount: feedAmount(day.feedBackKg, 'kg') })}
              </p>
            ) : null}
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
                {choices.length > 1 ? (
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('sheet.feed.unit', 'الوحدة')}>
                    {choices.map((entry) => {
                      const selected = entry.value === choice?.value;
                      return (
                        <button
                          key={entry.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setUnitId(entry.value)}
                          className={`flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-center font-semibold ${selected ? 'border-line-strong bg-surface-3 shadow-card' : 'border-line bg-surface-1 hover:bg-surface-2'}`}
                          data-action="feed-unit"
                        >
                          {entry.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <WeightPad value={value} onChange={setValue} unitLabel={choice?.label ?? ''} maxDecimals={3} onEnter={() => {
                  if (canSend) go();
                }} />
                {over && item ? (
                  <p role="alert" className="text-sm text-danger-700 dark:text-danger-300" data-action="feed-over">
                    {t('sheet.feed.short', 'أكثر ما يُرسل من «{item}» مرّة واحدة {have}.', { item: item.name, have: feedAmount(item.onHand, item.baseUnit) })}
                  </p>
                ) : null}
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
  // قناني أُرسلت من الجولة (add_flock_gas، 0036): تُضاف إلى غاز اليوم، لا تحلّ محلّه.
  const gasAdd = num('gas_add');
  if (gasAdd !== null) parts.push(t('sheet.reject.gas_add', 'إضافة غاز {n}', { n: fmtInt(gasAdd) }));
  // كاز اليوم من الورقة (0037).
  const kerosene = num('kerosene');
  if (kerosene !== null) parts.push(t('sheet.reject.kerosene', 'الكاز {amount}', { amount: litersText(kerosene) }));
  const feed = typeof payload.feed_kg === 'string' ? parseDecimal(payload.feed_kg, 3) : null;
  if (feed) parts.push(t('sheet.reject.feed', 'العلف {kg} كغم', { kg: kgOf(toScale(feed, 3)) }));
  const eggs = num('eggs_total');
  if (eggs !== null) parts.push(t('sheet.reject.eggs', 'البيض {n}', { n: fmtInt(eggs) }));
  if (typeof payload.note === 'string' && payload.note !== '') parts.push(t('sheet.reject.note', 'ملاحظة'));
  return parts.length ? parts.join(t('list.separator', '، ')) : t('sheet.reject.nothing', 'تعديل');
}

/** رقم عشريّ من السلك بقيمته («120» و«120.000» سواء)، والغائب null، وغير المقروء بنصّه. */
const decimalKey = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? parseDecimal(value, 3) : null;
  return parsed === null ? `?${String(value)}` : toScale(parsed, 3).toString();
};
const sameDecimal = (a: unknown, b: unknown): boolean => decimalKey(a) === decimalKey(b);
const sameValue = (a: unknown, b: unknown): boolean => (a ?? null) === (b ?? null);

/**
 * المركون عند الخادم (flock_day_rejects) ونسخته في رفّ مراجعة هذا الجهاز شيءٌ واحد: بمرجعه إن أرسله الخادم، وإلّا بما حمله (اليوم والسبب، ومعرّف
 * الزيارة، أو قناني الغاز، أو خانات مجموع اليوم ونسخته كما خزّنها الخادم). كان يُعدّ مرّتين ويُقرَّر فيه مرّتين (مراجعة 0035).
 */
export function sameParked(reject: SheetReject, entry: ReviewEntry): boolean {
  if (entry.reason !== 'parked' || entry.op.day !== reject.on) return false;
  if (reject.clientRef !== null) return reject.clientRef === entry.op.id;
  if ((entry.hint ?? null) !== reject.reason) return false;
  const saved = reject.payload;
  const op = entry.op;
  if (op.fn === 'set_flock_gas') return 'gas' in saved && sameValue(saved.gas, op.payload.cylinders);
  if (op.fn === 'set_flock_kerosene') return 'kerosene' in saved && sameValue(saved.kerosene, op.payload.liters);
  if (op.fn === 'save_flock_visit') return saved.visit === op.payload.visitId;
  if ('gas' in saved || 'kerosene' in saved || 'visit' in saved) return false;
  const p = op.payload;
  return (
    sameValue(saved.dead, p.dead) &&
    sameValue(saved.culled, p.culled) &&
    sameValue(saved.eggs_total, p.eggs_total) &&
    sameValue(saved.eggs_cracked, p.eggs_cracked) &&
    sameValue(saved.eggs_broken, p.eggs_broken) &&
    sameValue(saved.note, p.note) &&
    sameValue(saved.base_version, op.baseVersion) &&
    sameDecimal(saved.feed_kg, p.feed_kg) &&
    sameDecimal(saved.water_l, p.water_l) &&
    sameDecimal(saved.temp_min, p.temp_min) &&
    sameDecimal(saved.temp_max, p.temp_max)
  );
}

/** المركون عند الخادم ومعه نسخ هذا الجهاز منه، وما بقي على الجهاز وحده: كلّ مركون يُعدّ مرّة. */
export function parkedOnce(rejects: readonly SheetReject[], review: readonly ReviewEntry[]): { rejects: { reject: SheetReject; copies: ReviewEntry[] }[]; deviceOnly: ReviewEntry[] } {
  const paired = rejects.map((reject) => ({ reject, copies: review.filter((entry) => sameParked(reject, entry)) }));
  const taken = new Set(paired.flatMap((pair) => pair.copies.map((entry) => entry.id)));
  return { rejects: paired, deviceOnly: review.filter((entry) => !taken.has(entry.id)) };
}

type ParkedPair = { reject: SheetReject; copies: ReviewEntry[] };

function RejectsBanner({ rejects: shownRejects, canWrite, onChanged }: { rejects: readonly ParkedPair[]; canWrite: boolean; onChanged: () => void }) {
  const stamp = useStamp();
  const [busy, setBusy] = useState<string | null>(null);
  // ما قاله الخادم عن مركون تغيّر بعد عرضه (stale_reject): يُعرض محتواه الجديد بنسخته حتى تصل الورقة قراءةٌ بنسخة مثلها أو أحدث.
  const [fresher, setFresher] = useState<Record<string, SheetReject>>({});
  if (shownRejects.length === 0) return null;
  const rejects = shownRejects.map((pair) => {
    const newer = fresher[pair.reject.id];
    return newer && (newer.version ?? 0) > (pair.reject.version ?? 0) ? { ...pair, reject: newer } : pair;
  });
  const decide = async ({ reject, copies }: ParkedPair, decision: RejectDecision) => {
    setBusy(reject.id);
    try {
      const outcome = await decideFlockReject(reject.id, decision, reject.version);
      if (outcome.kind === 'stale') {
        // تغيّر منذ عُرض (من جهاز آخر): لم يُقرَّر شيء، ومحتواه الجديد أمام صاحبه ليقرّر فيه.
        setFresher((current) => ({ ...current, [reject.id]: outcome.reject }));
        toast({ tone: 'warning', title: t('sheet.reject.stale', 'تغيّر هذا المركون منذ عُرض، فلم يُقرَّر فيه شيء: راجع محتواه الجديد ثمّ قرّر.') });
        onChanged();
        return;
      }
      // ونسخة هذا الجهاز منه في «جولات تحتاج مراجعة» قُرِّر فيها معه: لا يُطلب القرار مرّتين.
      if (stamp && copies.length) {
        const db = await openOutbox().catch(() => null); /* swallow-ok: الطابور ما انفتح؛ النسخة تبقى في الرفّ ويحذفها صاحبها من هناك */
        for (const copy of copies) if (db) await removeReview(db, stamp, copy.id).catch(() => false); /* swallow-ok: كذلك */
      }
      onChanged();
    } catch (failure) {
      if (failure instanceof RejectedError && failure.code === 'already_decided') {
        toast({ tone: 'info', title: t('sheet.reject.already', 'قُرِّر في هذا المركون من قبل (من جهاز آخر).') });
        onChanged();
      } else {
        toast({ tone: 'danger', title: t('sheet.reject.failed', 'لم يُحفظ القرار.'), detail: failureText(failure) });
      }
    } finally {
      setBusy(null);
    }
  };
  return (
    <Notice tone="warning" title={t('sheet.rejects.title', 'أُرسلت من الأجهزة ولم تُحفظ: {n}', { n: fmtInt(rejects.length) })}>
      <p data-action="sheet-rejects-hint">
        {canWrite ? t('sheet.rejects.hint', 'أدخلها في يومها من الجدول ثمّ اضغط «أُدخلت»، أو «تجاهل».') : t('sheet.rejects.closed', 'الوجبة مغلقة: أعِد فتحها لإدخاله، أو اضغط «تجاهل».')}
      </p>
      <ul className="mt-2 flex flex-col gap-2" data-action="sheet-rejects">
        {rejects.map((pair) => (
          <li key={pair.reject.id} className="flex flex-wrap items-center gap-2" data-action="sheet-reject">
            <span>{t('sheet.reject.line', 'يوم {day}: {what} — {why}.', { day: fmtDay(pair.reject.on), what: rejectWhat(pair.reject.payload), why: parkText(pair.reject.reason) })}</span>
            {canWrite ? (
              <Button variant="secondary" busy={busy === pair.reject.id} disabled={busy !== null} onClick={() => void decide(pair, 'handled')} data-action="reject-handled">
                {t('sheet.reject.handled', 'أُدخلت')}
              </Button>
            ) : null}
            <Button variant="ghost" busy={!canWrite && busy === pair.reject.id} disabled={busy !== null} onClick={() => void decide(pair, 'refused')} data-action="reject-refused">
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
const PENDING_CLASS = 'text-xs font-semibold text-warn-800 dark:text-warn-200';

/**
 * خانة الورقة: قيمتها، و«بانتظار الرفع» تحتها ما دامت على الجهاز. لا زرّ (عقد 0036 S2): الورقة مقفولة، وفي وضع التعديل يحدّدها الجدول ويكتب فيها أو يفتح
 * ورقتها (SheetGrid).
 */
function Cell({ children, pending, action }: { children: ReactNode; pending: boolean; action: string }) {
  return (
    <span className="flex flex-col items-start gap-0.5" data-action={action}>
      <span>{children}</span>
      {pending ? (
        <span className={PENDING_CLASS} data-action="cell-pending">
          {t('sheet.pending', 'بانتظار الرفع')}
        </span>
      ) : null}
    </span>
  );
}

/** عدد الخانة بقيمة حُفظت للتوّ (من الجدول) أو بقيمتها، والفارغ لا شيء. */
const countNode = (value: CellValue): ReactNode => (typeof value === 'number' ? <Num>{fmtInt(value)}</Num> : '');

/** أعمدة الورقة بترتيبها (مفاتيح أعمدة SheetTable نفسها): الجدول كإكسل يتنقّل بها. */
const sheetFields = (layer: boolean): GridField[] => (layer ? ['age', 'date', 'dead', 'gas', 'kerosene', 'feed', 'eggs', 'note'] : ['age', 'date', 'dead', 'gas', 'kerosene', 'feed', 'note']);

function SheetTable({ sheet, ops, saved, view }: { sheet: HallSheet; ops: readonly OutboxOp[]; saved: readonly SavedEdit[]; view: SheetGridView }) {
  const layer = sheet.flock.kind === 'layer';
  const todayRef = useRef<HTMLSpanElement>(null);
  const scrolled = useRef(false);
  // اليوم ظاهر عند الفتح: يُمرَّر جدول الورقة وحده (لا الصفحة) حتى يتوسّطه صفّ اليوم، مرّة لكلّ فتح.
  useEffect(() => {
    const mark = todayRef.current;
    if (scrolled.current || !mark) return;
    scrolled.current = true;
    let box: HTMLElement | null = mark.parentElement;
    while (box && !(box.getAttribute('class') ?? '').includes('overflow-auto')) box = box.parentElement;
    let row: HTMLElement | null = mark.parentElement;
    while (row && row.localName !== 'tr') row = row.parentElement;
    if (!box || !row || typeof row.getBoundingClientRect !== 'function' || typeof box.getBoundingClientRect !== 'function') return;
    const at = row.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    box.scrollTop += at.top - frame.top - (box.clientHeight - at.height) / 2;
  });
  const feedDecimals = columnDecimals([sheet.totals.feedKg, ...sheet.days.flatMap((day) => (day.feedKg === null ? [] : [day.feedKg]))], 3) as 0 | 1 | 2 | 3;
  const columns: Column<SheetDay>[] = [
    { key: 'age', header: t('sheet.col.age', 'العمر'), kind: 'number', cell: (day) => <Num>{fmtInt(day.age)}</Num> },
    {
      key: 'date',
      header: t('sheet.col.date', 'التاريخ'),
      cell: (day) =>
        day.on === sheet.today ? (
          <span ref={todayRef} className="flex flex-col gap-0.5" data-action="sheet-today">
            <Num>{rowDay(day.on)}</Num>
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-200">{t('sheet.today', 'اليوم')}</span>
          </span>
        ) : (
          <Num>{rowDay(day.on)}</Num>
        ),
    },
    {
      key: 'dead',
      header: t('sheet.col.dead', 'الهلاكات'),
      kind: 'number',
      cell: (day, row) => {
        const shown = shownOf(day, ops, saved);
        return view.content(day, row, 'dead', (fresh) => (
          <Cell pending={fresh ? fresh.pending : shown.pending.has('dead')} action="cell-dead">
            {fresh ? countNode(fresh.value) : shown.recorded ? <Num>{fmtInt(shown.dead)}</Num> : ''}
          </Cell>
        ));
      },
      total: <Num>{fmtInt(sheet.totals.dead)}</Num>,
    },
    {
      key: 'gas',
      header: t('sheet.col.gas', 'الغاز'),
      kind: 'number',
      cell: (day, row) => {
        const shown = shownOf(day, ops, saved);
        return view.content(day, row, 'gas', (fresh) => (
          <Cell pending={fresh ? fresh.pending : shown.pending.has('gas')} action="cell-gas">
            {fresh ? countNode(fresh.value) : shown.gas === null ? '' : <Num>{fmtInt(shown.gas)}</Num>}
          </Cell>
        ));
      },
      total: <Num>{fmtInt(sheet.totals.gas)}</Num>,
    },
    {
      key: 'kerosene',
      header: t('sheet.col.kerosene', 'الكاز (لتر)'),
      kind: 'number',
      cell: (day, row) => {
        const shown = shownOf(day, ops, saved);
        return view.content(day, row, 'kerosene', (fresh) => (
          <Cell pending={fresh ? fresh.pending : shown.pending.has('kerosene')} action="cell-kerosene">
            {fresh ? countNode(fresh.value) : shown.kerosene === null ? '' : <Num>{fmtInt(shown.kerosene)}</Num>}
          </Cell>
        ));
      },
      total: <Num>{fmtInt(sheet.totals.kerosene)}</Num>,
    },
    {
      key: 'feed',
      header: t('sheet.col.feed', 'العلف (كغم)'),
      kind: 'number',
      cell: (day, row) =>
        view.content(day, row, 'feed', () => (
          <Cell pending={false} action="cell-feed">
            {day.feedKg === null ? '' : <Num>{fmtQtyCell(day.feedKg, feedDecimals)}</Num>}
            {/* المنقول داخل علف يوم التسكين، والمرتجع يوم الإغلاق: كلمة تحت الرقم، وتفصيلهما في ورقة العلف. */}
            {day.carryInKg !== null ? (
              <span className="block text-xs text-ink-muted" data-action="cell-carry">
                {t('sheet.feed.carry_mark', 'منقول')}
              </span>
            ) : null}
            {day.feedBackKg !== null ? (
              <span className="block text-xs text-ink-muted" data-action="cell-back">
                {t('sheet.feed.back_mark', 'مرتجع')}
              </span>
            ) : null}
          </Cell>
        )),
      total: <Num>{fmtQtyCell(sheet.totals.feedKg, feedDecimals)}</Num>,
    },
    ...(layer
      ? [
          {
            key: 'eggs',
            header: t('sheet.col.eggs', 'البيض'),
            kind: 'number' as const,
            cell: (day: SheetDay, row: number) => {
              const shown = shownOf(day, ops, saved);
              return view.content(day, row, 'eggs', (fresh) => (
                <Cell pending={fresh ? fresh.pending : shown.pending.has('eggs')} action="cell-eggs">
                  {fresh ? countNode(fresh.value) : shown.eggs === null ? '' : <Num>{fmtInt(shown.eggs)}</Num>}
                </Cell>
              ));
            },
            total: sheet.totals.eggsTotal === null ? '' : <Num>{fmtInt(sheet.totals.eggsTotal)}</Num>,
          },
        ]
      : []),
    {
      key: 'note',
      header: t('sheet.col.note', 'الملاحظات'),
      wrap: true,
      cell: (day, row) => {
        const shown = shownOf(day, ops, saved);
        return view.content(day, row, 'note', (fresh) => (
          <span className="flex flex-col items-start gap-0.5" data-action="cell-note">
            <span>
              {fresh ? (typeof fresh.value === 'string' ? fresh.value : '') : (shown.note ?? '')}
              {day.soldBirds > 0 ? <span className="block text-xs text-ink-muted">{t('sheet.sold', 'بيع {n}', { n: fmtInt(day.soldBirds) })}</span> : null}
            </span>
            {(fresh ? fresh.pending : shown.pending.has('note')) ? (
              <span className={PENDING_CLASS} data-action="cell-pending">
                {t('sheet.pending', 'بانتظار الرفع')}
              </span>
            ) : null}
          </span>
        ));
      },
    },
  ];
  return (
    <DataTable
      variant="official"
      caption={sheetTitle(sheet.flock.hallName)}
      columns={columns}
      rows={sheet.days}
      rowKey={(day) => day.on}
      rowTone={(day) => (day.on === sheet.today ? 'mark' : null)}
      size="sm"
      empty={t('sheet.empty', 'لا أيام بعد.')}
      totalLabel={t('sheet.total', 'المجموع')}
      grid={view.table}
    />
  );
}

// ─── الجدول كإكسل: ما يراه في كلّ خانة، وفحص ما يُكتب، والكتابة بالطابور (عقد 0036 S2) ────────────────────────────────

/** ما رُدّ في رفع خانة بجملته (كتنبيه ورقة الخانة). */
function refusalText(result: SendResult): string {
  switch (result.kind) {
    case 'parked':
      return t('sheet.parked', 'لم يُحفظ: {why}.', { why: parkText(result.reason ?? null) });
    case 'stale_day':
    case 'stale_gas':
    case 'stale_kerosene':
    case 'stale_visit':
      return t('sheet.stale', 'تغيّر هذا اليوم من جهاز آخر قبل أن يصل تعديلك، فلم يُكتب فوقه.');
    case 'rejected':
      return `${t('sheet.rejected', 'لم يُحفظ.')} ${result.hint ?? describeError(new Error(result.code)).detail}`;
    default:
      return t('sheet.held', 'محفوظ على هذا الجهاز: ادخل من جديد ليُرسل.');
  }
}

/** العدد بلا فواصل لنصّ النسخ (يقرؤه إكسل بأيّ لغة)، والكيلو بمراتبه المعنوية. */
const plainCount = (value: number): string => String(value); // number-ok: نصّ الحافظة لإكسل، لا عرض
const plainKg = (qty: Milli): string => decimalText(qty, 3).replace(/\.?0+$/u, '');

/**
 * ما يحتاجه الجدول كإكسل من الورقة: الخانة كما تُرى (قراءة الخادم وما على هذا الجهاز: shownOf)، وفحص تغييرات قبل الكتابة بقواعد ورقة الخانة نفسها (cellWrite،
 * ومجموع هلاكات اللصق لا يتجاوز الحيّ)، والكتابة: عمليات الطابور (save_flock_day بنسخة صفّ اليوم، يجمع خانات اليوم الواحد؛ وset_flock_gas) ثمّ الرافع الواحد،
 * والنسخة من الطابور ومن آخر رفع لحظة الكتابة (لا من لقطة الشاشة)، فتعديلان متتاليان على يوم واحد لا يُردّ ثانيهما stale_day.
 */
function useSheetCells(sheet: HallSheet | null, flockId: string, ops: readonly OutboxOp[], saved: readonly SavedEdit[], online: boolean, onWritten: () => void) {
  const stamp = useStamp();
  const cell = useCallback(
    (day: SheetDay, field: GridField): GridCell => {
      const empty = t('sheet.grid.empty', 'فارغة');
      const writable = Boolean(sheet?.canWrite) && day.on <= (sheet?.today ?? day.on);
      const why = !sheet?.canWrite ? t('sheet.read_only', 'الوجبة مغلقة: الورقة للقراءة فقط. «أعِد فتحها» لتعديلها.') : t('sheet.grid.future', 'لا يُكتب ليوم لم يأتِ بعد.');
      const shown = shownOf(day, ops, saved);
      const count = (value: number | null, access: GridCell['access']): GridCell => ({
        value,
        copy: value === null ? '' : plainCount(value),
        milli: value === null ? null : BigInt(value) * 1000n,
        spoken: value === null ? empty : fmtInt(value),
        access,
        why: access === 'read' ? why : null,
      });
      switch (field) {
        case 'age':
          return { ...count(day.age, 'read'), why: t('sheet.grid.fixed', 'العمر والتاريخ لا يُكتبان.') };
        case 'date':
          return { value: null, copy: fmtDay(day.on), milli: null, spoken: fmtDay(day.on), access: 'read', why: t('sheet.grid.fixed', 'العمر والتاريخ لا يُكتبان.') };
        case 'dead':
          return count(shown.recorded ? shown.dead : null, writable ? 'write' : 'read');
        case 'gas':
          return count(shown.gas, writable ? 'write' : 'read');
        case 'kerosene':
          return count(shown.kerosene, writable ? 'write' : 'read');
        case 'eggs':
          return count(shown.eggs, writable ? 'write' : 'read');
        case 'feed': {
          const opens = day.feed.length > 0 || day.carryInKg !== null || day.feedBackKg !== null || writable;
          return {
            value: null,
            copy: day.feedKg === null ? '' : plainKg(day.feedKg),
            milli: day.feedKg,
            spoken: day.feedKg === null ? empty : feedAmount(day.feedKg, 'kg'),
            access: opens ? 'feed' : 'read',
            why: opens ? null : why,
          };
        }
        case 'note':
          return { value: shown.note, copy: shown.note ?? '', milli: null, spoken: shown.note ?? empty, access: writable ? 'write' : 'read', why: writable ? null : why };
      }
    },
    [sheet, ops, saved],
  );

  const check = useCallback(
    (changes: readonly CellChange[]): ChangeCheck[] => {
      if (!sheet) return changes.map(() => ({ kind: 'error', error: t('sheet.grid.no_day', 'هذا اليوم ليس في الورقة.') }));
      // مجموع هلاكات اللصق: كلّ يوم يُقبل وحده حتى الحيّ، ومعاً لا تتجاوز الحيّ الآن (الخادم يردّ live_negative). وهل التغيير تغييرٌ يقرّره الجدول بما
      // تعرضه الخانة (ورفعٌ في الطريق معها)، لا لقطة هذا الرسم (المراجعة R11): هنا الحدود وحدها، وcommit يكتب بما في الطابور لحظتها.
      let liveLeft = sheet.summary.live;
      return changes.map((change): ChangeCheck => {
        const day = sheet.days.find((entry) => entry.on === change.on);
        if (!day) return { kind: 'error', error: t('sheet.grid.no_day', 'هذا اليوم ليس في الورقة.') };
        const shown = shownOf(day, ops, saved);
        const outcome = cellWrite(sheet, day, change.field, shown, change.value);
        if (outcome.kind === 'error') return outcome;
        if (change.field === 'dead' && typeof change.value === 'number') {
          liveLeft -= change.value - day.dead;
          if (liveLeft < 0) return { kind: 'error', error: t('sheet.dead.max', 'الهلاكات أكثر من الطيور الحيّة ({live}).', { live: fmtInt(Math.max(sheet.summary.live, 0)) }) };
        }
        return { kind: 'ok', shown: afterText(change.value) };
      });
    },
    [sheet, ops, saved],
  );

  const commit = useCallback(
    async (changes: readonly CellChange[]): Promise<ChangeResult[]> => {
      if (!stamp || !sheet) return changes.map(() => ({ kind: 'failed', message: t('sheet.held', 'محفوظ على هذا الجهاز: ادخل من جديد ليُرسل.') }));
      const results: ChangeResult[] = changes.map(() => ({ kind: 'same' }));
      try {
        const db = await openOutbox();
        // النسخة من الطابور الآن ومن آخر رفع (لا من لقطة الشاشة): كتابة سبقتها في الجدول ربما رُفعت للتوّ.
        const fresh = (await pendingOps(db, stamp)).filter((op) => op.flockId === flockId);
        const latest = savedEdits(roundQueueStore.get().runs, stampKey(stamp), flockId);
        const dayInputs = new Map<string, { input: EnqueueInput; at: number[] }>();
        const gasInputs: { input: EnqueueInput; at: number[] }[] = [];
        changes.forEach((change, index) => {
          const day = sheet.days.find((entry) => entry.on === change.on);
          if (!day) {
            results[index] = { kind: 'error', error: t('sheet.grid.no_day', 'هذا اليوم ليس في الورقة.') };
            return;
          }
          const shown = shownOf(day, fresh, latest);
          if (sameShown(change, shown)) return;
          const outcome = cellWrite(sheet, day, change.field, shown, change.value);
          if (outcome.kind !== 'input') {
            results[index] = outcome;
            return;
          }
          const input = outcome.input;
          const open = dayInputs.get(change.on);
          if (input.fn === 'save_flock_day' && open && open.input.fn === 'save_flock_day') {
            // خانات اليوم الواحد (الهلاكات والبيض والملاحظة) عملية واحدة بنسخة صفّه.
            open.input = { ...open.input, payload: { ...open.input.payload, ...input.payload } };
            open.at.push(index);
          } else if (input.fn === 'save_flock_day') dayInputs.set(change.on, { input, at: [index] });
          else gasInputs.push({ input, at: [index] });
        });
        const queued: { op: OutboxOp | null; at: number[] }[] = [];
        for (const entry of [...dayInputs.values(), ...gasInputs]) queued.push({ op: await saveRound(db, stamp, entry.input), at: entry.at });
        if (queued.length === 0) return results;
        const uploaded = online ? await uploadRounds(stamp, loadTransport).catch(() => []) : []; /* swallow-ok: الرفع فشل (IndexedDB)؛ العمليات باقية بالجهاز وترتفع بالمحاولة الجاية */
        if (!online) {
          void refreshRoundQueue(stamp).catch(() => {
            /* swallow-ok: عدّ الطابور تعذّر؛ الرأس يتحدّث بالرفع الجاي */
          });
        }
        let told = false;
        for (const { op, at } of queued) {
          const result = op ? (uploaded.find((entry) => entry.opId === op.id)?.result ?? null) : null;
          const mapped: ChangeResult = result === null ? { kind: 'device' } : result.kind === 'saved' ? { kind: 'saved' } : { kind: 'failed', message: refusalText(result), refused: true };
          for (const index of at) results[index] = mapped;
          // ما رُدّ يُقال بتنبيه كورقة الخانة (أوّله وحده: لصق كثير لا يغرق الشاشة بالتنبيهات، والباقي في خاناته).
          if (result !== null && result.kind !== 'saved' && !told) {
            told = true;
            resultToast(result, online);
          }
        }
        return results;
      } catch (failure) {
        const text = `${describeError(failure).title} ${describeError(failure).detail}`;
        return changes.map((_, index) => (results[index]?.kind === 'error' ? results[index] : { kind: 'failed', message: text }));
      } finally {
        onWritten();
      }
    },
    [stamp, sheet, flockId, online, onWritten],
  );

  return { cell, check, commit, label: gridLabel };
}

/** تغيير يساوي ما تعرضه الخانة: لا يُكتب (الهلاكات والبيض الفارغة ليست صفراً: الصفر يُسجَّل). */
function sameShown(change: CellChange, shown: Shown): boolean {
  if (change.field === 'dead') return shown.recorded && change.value === shown.dead;
  if (change.field === 'gas') return change.value === shown.gas;
  if (change.field === 'kerosene') return change.value === shown.kerosene;
  if (change.field === 'eggs') return change.value === shown.eggs;
  return false;
}

/** نصّ ما سيصير في تأكيد اللصق: العدد بفواصله، والفارغ «فارغة». */
function afterText(value: CellValue): string {
  if (typeof value === 'number') return fmtInt(value);
  return value === null || value.trim() === '' ? t('sheet.grid.empty', 'فارغة') : value.trim();
}

/** اسم عمود الجدول. */
function gridLabel(field: GridField): string {
  if (field === 'age') return t('sheet.col.age', 'العمر');
  if (field === 'date') return t('sheet.col.date', 'التاريخ');
  if (field === 'feed') return t('sheet.col.feed', 'العلف (كغم)');
  return fieldLabel(field);
}

/** الورقة لفوج: القاعة من قراءة الحقول (للسابقة والتالية والبيع والتعديل) حين تُفتح من صفحة القاعة. */
function SheetScreen({ kind, flockId, nav, site, summary, onGone }: { kind: FlockKind; flockId: string; nav?: Nav; site?: SiteView; summary?: FlockSummary; onGone?: () => void }) {
  // الورقة جدولٌ رسميّ بعرض أكبر في الشاشات الكبيرة (عقد 0036 S1).
  useWidePage();
  // رفعُ نافذة أخرى على الجهاز يصل الورقة (مراجعة 0036 R8؛ الاستماع هنا في حزمة القاعات لا في الرافع المحفوظ).
  useEffect(listenOtherWindows, []);
  const navigate = useNavigate();
  const online = useStore(onlineStore);
  const load = useCallback(() => loadHallSheet(flockId), [flockId]);
  // كلّ رفعٍ من هذا الجهاز مسّ الفوج (من الورقة أو من الخلفية) يعيد قراءة الورقة؛ وما حُفظ يُعرض وتُبنى عليه النسخة حتى تصلها.
  const uploadMark = useUploadMark(flockId);
  const state = useLoad(load, String(uploadMark));
  const sheet = useKept(state.data);
  const [tick, setTick] = useState(0);
  const device = useDeviceOps(flockId, tick);
  const saved = useSavedEdits(flockId);
  const [editing, setEditing] = useState<{ on: Day; field: CellField; submit: SheetSubmit } | null>(null);
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
  // الجدول كإكسل: ما كتبه يُقرأ من الطابور بعده (والورقة تُقرأ من جديد مع نتيجة الرفع، useUploadMark).
  const written = useCallback(() => setTick((n) => n + 1), []);
  const cells = useSheetCells(sheet, flockId, device.ops, saved, online, written);
  const editDay = editing && sheet ? (sheet.days.find((day) => day.on === editing.on) ?? null) : null;
  const feedDay = feeding && sheet ? (sheet.days.find((day) => day.on === feeding) ?? null) : null;
  const todayRow = sheet ? (sheet.days.find((day) => day.on === sheet.today) ?? null) : null;
  const active = sheet?.flock.status === 'active';
  const ageToday = sheet && sheet.today >= sheet.flock.placedOn ? (todayRow?.age ?? null) : null;
  // كلّ مركون يُعدّ مرّة: نسخته على هذا الجهاز تُطابَق بمركون الخادم.
  const parked = sheet ? parkedOnce(sheet.rejects, device.review) : null;

  return (
    <div className="flex flex-col gap-4" data-action="hall-sheet">
      <HallTop kind={kind} nav={nav} />
      <header className="flex flex-col gap-1">
        {/* عنوان الصفحة اسم القاعة، و«هلاكات قاعة (7)» شريط عنوان الجدول الملوّن تحته (عقد 0036 S1): لا يتكرّر العنوان نفسه مرّتين. */}
        <h1 className="text-2xl font-semibold" data-action="sheet-title">
          {sheet ? hallLabel(sheet.flock.hallName) : farmTitle(kind)}
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
          <nav className="grid grid-cols-3 gap-2" aria-label={t('hall.actions', 'أفعال القاعة')} data-action="sheet-actions">
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
          {active ? null : (
            <p className="text-sm text-ink-muted" data-action="sheet-read-only">
              {t('sheet.read_only', 'الوجبة مغلقة: الورقة للقراءة فقط. «أعِد فتحها» لتعديلها.')}
            </p>
          )}
          <p className="text-sm text-ink-muted" data-action="sheet-line">
            {t('sheet.line', 'الداخل {placed} · الهلاكات {dead} · الباقي {live}', { placed: fmtInt(sheet.summary.placed), dead: fmtInt(sheet.summary.dead), live: fmtInt(sheet.summary.live) })}
          </p>
          {/* الجدول أوّل الشاشة بالهاتف: ما يحتاج قراراً جملةٌ قصيرة هنا وتفصيله تحت الجدول. */}
          {parked && parked.rejects.length + parked.deviceOnly.length > 0 ? (
            <p className="text-sm font-semibold text-warn-800 dark:text-warn-200" data-action="sheet-attention">
              {t('sheet.attention', 'لم يُحفظ من الأجهزة: {n}، وتفصيله تحت الجدول.', { n: fmtInt(parked.rejects.length + parked.deviceOnly.length) })}
            </p>
          ) : null}
          <SheetGrid
            title={sheetTitle(sheet.flock.hallName)}
            days={sheet.days}
            fields={sheetFields(sheet.flock.kind === 'layer')}
            today={sheet.today}
            canEdit={sheet.canWrite}
            online={online}
            cell={cells.cell}
            label={cells.label}
            check={cells.check}
            commit={cells.commit}
            openSheet={(day, field, submit) => setEditing({ on: day.on, field, submit })}
            openFeed={(day) => setFeeding(day.on)}
          >
            {(view) => <SheetTable sheet={sheet} ops={device.ops} saved={saved} view={view} />}
          </SheetGrid>
          <RejectsBanner rejects={parked?.rejects ?? []} canWrite={sheet.canWrite} onChanged={changed} />
          {parked && parked.deviceOnly.length > 0 ? (
            <Notice tone="warning" title={t('sheet.review', 'على هذا الجهاز تعديلات لهذه القاعة لم تُحفظ: {n}.', { n: fmtInt(parked.deviceOnly.length) })}>
              <Link to={`${base}/round`} className={LINK_CLASS} data-action="sheet-review">
                {t('sheet.review.go', 'راجعها في «جولات تحتاج مراجعة»')}
              </Link>
            </Notice>
          ) : null}
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
          day={editDay}
          field={editing.field}
          shown={shownOf(editDay, device.ops, saved)}
          submit={editing.submit}
          onClose={() => setEditing(null)}
          // الورقة تُقرأ من جديد مع نتيجة الرفع (useUploadMark)، وعمليات الجهاز الآن؛ وبلا اتصال لا شيء يُقرأ.
          onSaved={() => {
            setEditing(null);
            setTick((n) => n + 1);
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
  // عريضةٌ بكلّ حالها (مراجعة 0036 R6): القاعة الفارغة وأثناء القراءة كورقة الفوج، فلا يقفز عرض الصفحة بين قاعة وأخرى بالسابقة والتالية. والورقة
  // تحمل العرض بنفسها أيضاً (SheetScreen في /flock/:id خارج هذه الصفحة)، والعدّاد يتّسع للاثنين.
  useWidePage();
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
        <Notice tone="info" title={t('hall.not_found', 'هذه القاعة غير موجودة أو مؤرشفة.')} />
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
