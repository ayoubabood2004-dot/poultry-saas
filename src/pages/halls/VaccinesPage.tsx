import { CircleCheck, Plus } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { addDays, diffDays, type Day } from '../../domain/dates';
import type { FlockKind } from '../../domain/flocks';
import { naturalCompare } from '../../domain/naturalOrder';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { countForm, fmtDay, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import {
  deleteVaccine,
  dropHallVaccineProgram,
  loadVaccineBoard,
  saveHallVaccineProgram,
  saveVaccine,
  saveVaccineProgram,
  type ProgramDay,
  type Vaccine,
  type VaccineBoard,
  type VaccineHall,
  type VaccineProgram,
} from '../../lib/repo/halls';
import { useLoad } from '../../lib/useLoad';
import { dayNumber, monthDays, monthLabel, monthOf, monthsBetween, weekdayOf, WEEKDAYS, type Month } from './months';
import { BackLink, backLabel, backTarget, bandStyle, daysText, farmPath, Swatch, VaccineName } from './parts';

// جدول اللقاحات (0026، كلمة المالك 2026-11-11: «قائمة لقاحات فوق الجدول يحدّدها هو؛ يضغط لقاحاً مثل IB ثمّ يضغط الأيام 1 و10 و20 فتأخذ تلك
// الأيام لون اللقاح؛ ويختار أكثر من لقاح معاً؛ ويحفظ؛ ويعدّل أو يحذف بعد الحفظ؛ والأيام بعمر الطيور من 1 إلى نهاية يحدّدها؛ وجدول واحد لكلّ
// القاعات من النوع»): /halls/vaccines?kind=broiler|layer بقراءة vaccine_board واحدة. فوق الجدول قائمة اللقاحات (نقطة لونه واسمه)، يُختار منها لقاح
// أو أكثر، والضغط على مربّع يوم يضيف كلّ المختار إليه أو يشيله كلّه إن كان كلّه فيه. «نهاية الدورة» من 1 إلى 1,000 (الافتراض بلا جدول 42 للّاحم و500
// للبيّاض)، والمربّعات من 1 إليها بصفوف من سبعة وصفحات من 70 يوماً، وإنقاصها قبل أيام في الجدول يُنبّه ويسمّي ما يُشال عند الحفظ. و«احفظ الجدول»
// نداء save_vaccine_program واحد بشرط النسخة التي بُني عليها التعديل، وp_days مرتّبة بيوم العمر ثمّ بترتيب اللقاح في القائمة (بالاسم كما يرتّبها الخادم).
// ورفض stale_program («تغيّر الجدول من جهاز آخر») يقرأ الجدول من جديد ويُبقي تعديلك ظاهراً بجدول الفروق، ثمّ «اعتمد تعديلي» أو «خذ المحفوظ».
// والنتيجة المجهولة تجمّد الشاشة بـ«أعد المحاولة» بالنداء نفسه حرفاً؛ وإعادةٌ يرفضها شرط النسخة أو المعرّف قد تعني أنّ الأولى حُفظت، فيُقرأ الجدول
// ويُقارن بما أُرسل (درس الكتابة المشروطة: كلّ إعادة تعرف نتيجتها هي). ولا شيء من هذه يتضاعف بإعادة التحميل (الجدول يُستبدل كلّه بشرط نسخته،
// واللقاح بمعرّفه واسمه الفريد)، فالطلب المعلَّق في المكوّن، والنافذة «فيها ما لم يُحفظ» ما دام تعديل أو طلب. ومن لا يعدّل (can_edit) يرى الجدول وحده.
//
// وجدول القاعة الخاصّ (0028، كلمة الزبون 2026-11-15: «مو المفروض جدول لكلّ قاعة؟ … كلّ قاعة لازم يكون إلها جدول»): تحت تبويب النوع «لمن هذا
// الجدول؟» (?hall=، وبلاه الجدول العامّ): العامّ أوّلاً ثمّ قاعات النوع الحيّة بترتيب أسمائها بأرقامها (naturalCompare، وبحقلها حين تتوزّع على أكثر
// من حقل)، وما لها جدول خاصّ مُعلَّمة. القاعة بلا جدول خاصّ تُعرض بالجدول العامّ للعرض («تتبع الجدول العامّ»)، و«اعمل لها جدولاً خاصّاً» يبدأ تعديلاً
// منسوخاً منه يحفظه save_hall_vaccine_program بالنسخة 0؛ وما لها جدول يُعدَّل كالعامّ حرفاً (شرط النسخة، وجدول الفروق بعد stale_program، والإعادة
// المجمَّدة بالنداء نفسه)، و«احذف جدولها الخاصّ» يعيدها إلى العامّ بشرط نسخته (drop_hall_vaccine_program). التعديلات والصفحات لكلّ نطاق (النوع، أو
// «hall:» ومعرّف القاعة)، وتعديل قاعة بلا جدول خاصّ «لم يُحفظ» ولو طابق العامّ (الحفظ ينشئه). ونسخة جدول القاعة ترجع 0 بحذفه، فالتعارض نسخة
// تقدّمت على ما بُني عليه التعديل، أو نقصت عنه بقراءة جديدة (حُذف من جهاز آخر فصارت تتبع العامّ: الفروق مع العامّ، و«اعتمد تعديلي» ينشئه من جديد).
// وقائمة اللقاحات واحدة للمنشأة تشترك فيها الجداول كلّها، فحذف لقاح يسمّي أيّامه في كلّ جدول.
//
// و«الدورة المفتوحة» (0030، كلمة الزبون 2026-11-16: «خلي الوقت مفتوح… من يخلصون همة يكولون انتهت الدورة»، ثمّ «لا لاتشيل نهاية الدورة بس خليها
// اختيارية»): نهاية الدورة «محدّدة» بيوم أو «مفتوحة» (تُرسل null)، والمفتوح يُرسم إلى نهاية النوع المقترحة أو آخر يوم فيه وأسبوعين بعده. و«لمن هذا
// الجدول؟» بطاقات (كلمة الزبون: «خلي اختيار القاعات يصير اسهل واحلى»): العامّ ثمّ القاعات بأرقامها، وفي كلّ بطاقة جدولها وعمر فوجها. وجدول قاعة
// بفوج قائم مسكَّن يُرسم تقويماً بالأشهر الحقيقية من يوم تسكينه («جدول رزنامة اشهر حقيقية… وبداخل المربعات ترقيمات الايام… حسب العمر»): في كلّ يوم
// تاريخه وعمر الطيور فيه، والضغط عليه يضيف المختار إلى يوم العمر ذاك كما في شبكة الأعمار (الجدول بأيّام العمر يبقى، والتاريخ عرضٌ له).

const KINDS: readonly FlockKind[] = ['broiler', 'layer'];
const DEFAULT_END: Readonly<Record<FlockKind, number>> = { broiler: 42, layer: 500 };
const PAGE_DAYS = 70;
const MAX_END = 1000;
const NAME_MAX = 40;
const GRID = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', minWidth: '30rem' } as const;
/**
 * اللقاح المختار بلون فاتح وعلامة ✓ (أيقونة من حزمة الإقلاع): نقطة لون اللقاح مفحوصة على السطح الأبيض والداكن، وعلى أزرق الزرّ الأساسي كانت
 * تختفي (ND على #1266d8، Chromium بعرض 390)، والعلامة تقول «مختار» بلا لون.
 */
const PICKED = 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-100';
const UNPICKED = 'border-line-strong bg-surface-1 text-ink hover:bg-surface-2';

/** يوم في الجدول: «العمر|اللقاح». */
type DayKey = string;
const dayKey = (age: number, vaccineId: string): DayKey => `${age}|${vaccineId}`;
const splitKey = (key: DayKey): ProgramDay => {
  const at = key.indexOf('|');
  return { ageDay: Number(key.slice(0, at)), vaccineId: key.slice(at + 1) };
};

/** نطاق الجدول المعروض: العامّ لنوع (مفتاحه النوع)، أو جدول قاعة (مفتاحه «hall:» ومعرّفها). */
type ScopeKey = string;
const hallKey = (id: string): ScopeKey => `hall:${id}`;

/** تعديل جدول لم يُحفظ: النسخة التي بُني عليها (0 لقاعة بلا جدول خاصّ: الحفظ ينشئه)، ونصّ نهاية الدورة كما كُتب، والأيام. */
interface Draft {
  against: number;
  endText: string;
  /** نهاية مفتوحة (0030): بلا يوم محدّد، والدورة تنتهي حين تُغلق. */
  open: boolean;
  days: ReadonlySet<DayKey>;
}

/** نداء save_vaccine_program (hall null) أو save_hall_vaccine_program كما أُرسل (يُعاد حرفاً بعد نتيجة مجهولة). */
interface ProgramRequest {
  kind: FlockKind;
  /** القاعة واسمها كما عُرض. */
  hall: { id: string; name: string } | null;
  /** null: نهاية مفتوحة. */
  endAge: number | null;
  days: readonly ProgramDay[];
  version: number;
}
const requestKey = (request: ProgramRequest): ScopeKey => (request.hall ? hallKey(request.hall.id) : request.kind);

/** «احذف جدولها الخاصّ»: النسخة التي يُحذف بشرطها (0 إن لم يعد لها جدول)، والنتيجة المجهولة تجمّده كحذف اللقاح. */
interface Dropping {
  hall: { id: string; name: string };
  version: number;
  busy: boolean;
  failure: string | null;
  frozen: boolean;
  /** رُفض بـstale_program: اللوحة التي بُنيت منها النافذة، حتّى تصل قراءة جديدة فتأخذ النافذة نسخة الجدول منها. */
  stale: VaccineBoard | null;
}

interface Editing {
  id: string;
  /** null: لقاح جديد بمعرّف من الجهاز. */
  version: number | null;
  name: string;
  itemId: string;
  initialName: string;
  initialItem: string;
  busy: boolean;
  failure: string | null;
  /** الطلب المجمَّد بعد نتيجة مجهولة. */
  frozen: { name: string; itemId: string | null } | null;
  /** رُفض بـstale_vaccine: اللوحة التي بُنيت منها النافذة، حتّى تصل قراءة جديدة فتأخذ النافذة نسخة اللقاح منها. */
  stale: VaccineBoard | null;
}

interface Deleting {
  vaccine: Vaccine;
  busy: boolean;
  failure: string | null;
  frozen: boolean;
  /** كما في Editing. */
  stale: VaccineBoard | null;
}

/** نهاية الدورة من نصّ المستخدم (بفواصل الآلاف أو بدونها): 1..1000، وإلّا null. */
function parseEnd(text: string): number | null {
  const clean = text.trim().replace(/,/gu, '');
  if (!/^[0-9]{1,4}$/u.test(clean)) return null;
  const value = Number(clean);
  return value >= 1 && value <= MAX_END ? value : null;
}

const serverEnd = (kind: FlockKind, saved: VaccineProgram): number => saved.endAge ?? DEFAULT_END[kind];
const serverDays = (saved: VaccineProgram): ReadonlySet<DayKey> => new Set(saved.days.map((day) => dayKey(day.ageDay, day.vaccineId)));
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((key) => b.has(key));
/** جدول محفوظ (نسخة 1 فما فوق) بلا نهاية: مفتوح (0030). وبلا جدول بعد يُقترح بنهاية النوع. */
const serverOpen = (saved: VaccineProgram): boolean => saved.version > 0 && saved.endAge === null;
const baseDraft = (kind: FlockKind, saved: VaccineProgram, against: number): Draft => ({ against, endText: fmtInt(serverEnd(kind, saved)), open: serverOpen(saved), days: serverDays(saved) });
/** أيّام الجدول المفتوح المعروضة: نهاية النوع المقترحة أو آخر يوم فيه، وأسبوعان بعده ليُضاف ما بعده، بأسابيع كاملة وحتى 1,000. */
const openSpan = (kind: FlockKind, lastDay: number): number => Math.min(MAX_END, Math.ceil((Math.max(DEFAULT_END[kind], lastDay) + 14) / 7) * 7);
/** نهاية الدورة كلمةً: «مفتوحة» أو عدد الأيام. */
const endWord = (end: number | null): string => (end === null ? t('halls.vac.end_open_word', 'مفتوحة') : daysText(end));
/** إطار «اليوم» بلون العلامة كما في التقويم الشهريّ، وما خارج أيّام الجدول باهت. */
const NOW_RING = { boxShadow: 'inset 0 0 0 2px rgb(var(--ring))' } as const;
const DIM = { opacity: 0.45 } as const;

/** قاعات النوع بحقلها ثمّ اسمها، بأرقامهما («قاعة 5» قبل «قاعة 44»). */
const hallOrder = (a: VaccineHall, b: VaccineHall): number => naturalCompare(a.siteName, b.siteName) || naturalCompare(a.name, b.name);

/** اسم كلّ قاعة كما يُعرض: ومعه حقلها حين تتوزّع قاعات نوعها على أكثر من حقل. */
function hallNames(halls: readonly VaccineHall[]): ReadonlyMap<string, string> {
  const sites = new Map<FlockKind, Set<string>>();
  for (const hall of halls) sites.set(hall.kind, (sites.get(hall.kind) ?? new Set<string>()).add(hall.siteName));
  return new Map(
    halls.map((hall) => [hall.id, (sites.get(hall.kind)?.size ?? 0) > 1 ? t('halls.vac.hall_site', '{hall} — {site}', { hall: hall.name, site: hall.siteName }) : hall.name] as const),
  );
}

/** الجدول المحفوظ هو ما أُرسل بالضبط (النهاية والأيام). */
const sameProgram = (program: VaccineProgram, request: ProgramRequest): boolean =>
  program.endAge === request.endAge && sameSet(serverDays(program), new Set(request.days.map((day) => dayKey(day.ageDay, day.vaccineId))));

/** أيام p_days بترتيبها: يوم العمر، ثمّ ترتيب اللقاح في القائمة (بالاسم كما يرتّبها الخادم). */
function sortedDays(keys: Iterable<DayKey>, vaccines: readonly Vaccine[]): ProgramDay[] {
  const order = new Map(vaccines.map((vaccine, index) => [vaccine.id, index]));
  return [...keys]
    .map(splitKey)
    .sort((a, b) => a.ageDay - b.ageDay || (order.get(a.vaccineId) ?? vaccines.length) - (order.get(b.vaccineId) ?? vaccines.length) || (a.vaccineId < b.vaccineId ? -1 : 1));
}

/**
 * رفوض حفظ الجدول التي تعني أنّه أو قائمته تغيّرا بعد القراءة: يُقرأ من جديد ويبقى التعديل ظاهراً للمقارنة بلا أيّام لقاح لم يعد في القائمة. ولقاح
 * حُذف من جهاز آخر بلا أيّام في الجدول لا يغيّر نسخته، فيأتي vaccine_not_found أو vaccine_archived لا stale_program (مراجعة 0026 F: كان رفضاً أكيداً
 * بلا قراءة، فالشاشة تعيد إرسال أيّامه إلى الأبد).
 */
const PROGRAM_CHANGED: ReadonlySet<string> = new Set(['stale_program', 'vaccine_not_found', 'vaccine_archived']);
/** رفوض حفظ جدول قاعة تعني أنّها لم تعد في القائمة (أُرشفت أو خرجت من النطاق): رفض أكيد، ويُقرأ الجدول فتخرج من «لمن هذا الجدول؟». */
const HALL_GONE: ReadonlySet<string> = new Set(['hall_not_found', 'hall_archived', 'out_of_scope']);

const surelyUnsaved = (problem: unknown): boolean =>
  problem instanceof RejectedError || problem instanceof NetworkError || problem instanceof RetryableError || problem instanceof NotConnectedError || problem instanceof IdentityError;

const failureText = (problem: unknown): string => {
  if (problem instanceof RejectedError && problem.hint) return problem.hint;
  const { title, detail } = describeError(problem);
  return `${title} ${detail}`;
};

const RETRY_UNREACHED = () => t('halls.kit.retry_unreached', 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.');

/** عدد المواعيد بصيغة العدد: «بلا مواعيد»، «موعد واحد»، «موعدان»، «3 مواعيد»، «11 موعداً»، «100 موعد». */
function slotsText(n: number): string {
  if (n === 0) return t('halls.vac.slots.none', 'بلا مواعيد');
  if (n === 1) return t('halls.vac.slots.one', 'موعد واحد');
  if (n === 2) return t('halls.vac.slots.two', 'موعدان');
  const form = countForm(n);
  if (form === 'few') return t('halls.vac.slots.few', '{n} مواعيد', { n });
  if (form === 'many') return t('halls.vac.slots.many', '{n} موعداً', { n });
  return t('halls.vac.slots.hundreds', '{n} موعد', { n });
}
const kindTitle = (kind: FlockKind): string => (kind === 'broiler' ? t('halls.vac.kind.broiler', 'اللاحم') : t('halls.vac.kind.layer', 'البيّاض'));
const listJoin = (parts: readonly string[]): string => parts.join(t('list.separator', '، '));
const itemKindWord = (kind: string): string => (kind === 'vaccine' ? t('item.kind.vaccine', 'لقاح') : kind === 'medicine' ? t('item.kind.medicine', 'دواء') : '');

type DiffRow = { key: DayKey; ageDay: number; vaccine: Vaccine | null; saved: boolean; mine: boolean };
type SummaryRow = { vaccine: Vaccine; ages: number[] };

function VaccineDialog({ editing, board, onChange, onSave, onClose }: { editing: Editing; board: VaccineBoard; onChange: (patch: Partial<Editing>) => void; onSave: () => void; onClose: () => void }) {
  const id = useId();
  const isNew = editing.version === null;
  const dirty = editing.name !== editing.initialName || editing.itemId !== editing.initialItem || editing.frozen !== null;
  const locked = editing.busy || editing.frozen !== null;
  return (
    <Dialog
      open
      onClose={onClose}
      dirty={dirty}
      locked={editing.busy}
      title={isNew ? t('halls.vac.add_title', 'لقاح جديد') : t('halls.vac.edit_title', 'عدّل لقاح «{name}»', { name: editing.initialName })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={editing.busy} data-action="vac-dialog-cancel">
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button busy={editing.busy} onClick={onSave} data-action={editing.frozen ? 'vac-retry' : 'vac-save'}>
            {editing.frozen ? t('halls.kit.retry', 'أعد المحاولة') : isNew ? t('halls.vac.add_go', 'أضف اللقاح') : t('halls.vac.edit_go', 'احفظ اللقاح')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-action="vac-dialog">
        <Field id={`${id}-name`} label={t('halls.vac.name', 'اسم اللقاح')} hint={t('halls.vac.name_hint', 'مثل IB أو ND أو غمبورو، 40 حرفاً على الأكثر.')}>
          <input
            id={`${id}-name`}
            className="input"
            maxLength={NAME_MAX}
            value={editing.frozen ? editing.frozen.name : editing.name}
            readOnly={locked}
            onChange={(event) => onChange({ name: event.target.value, failure: null })}
            data-action="vac-name"
          />
        </Field>
        <Field id={`${id}-item`} label={t('halls.vac.item', 'مادّته في المخزن (اختياري)')} hint={t('halls.vac.item_hint', 'اللقاح المربوط بمادّة يُصرف من المخزن حين يُؤشَّر «تمّ»، وغير المربوط يُؤشَّر فقط.')}>
          <select
            id={`${id}-item`}
            className="input"
            value={editing.frozen ? (editing.frozen.itemId ?? '') : editing.itemId}
            disabled={locked}
            onChange={(event) => onChange({ itemId: event.target.value, failure: null })}
            data-action="vac-item"
          >
            <option value="">{t('halls.vac.item_none', 'بلا مادّة: يُؤشَّر فقط')}</option>
            {board.items.map((item) => (
              <option key={item.id} value={item.id}>
                {t('halls.vac.item_option', '{name} ({kind})', { name: item.name, kind: itemKindWord(item.kind) })}
              </option>
            ))}
          </select>
        </Field>
        {editing.frozen ? <Notice tone="warning" title={t('halls.vac.vaccine_frozen', 'لا نعرف إن حُفظ اللقاح: أعد المحاولة؛ لن يُحفظ مرّتين.')} /> : null}
        {editing.failure ? <Notice tone="danger" title={editing.failure} /> : null}
      </div>
    </Dialog>
  );
}

function VaccinesView() {
  const [search, setSearch] = useSearchParams();
  const load = useCallback(() => loadVaccineBoard(), []);
  const state = useLoad(load);
  // آخر قراءة ناجحة تبقى مرسومة أثناء القراءة من جديد (والتعديل مقفول أثناءها)، وفشل القراءة يُقال ويقفل الحفظ. وأسماء كلّ لقاح قُرئ في هذه
  // الصفحة: لقاح حُذف من جهاز آخر وفي تعديلك أيّامه يُسمّى بعد القراءة الجديدة.
  const [kept, setKept] = useState<VaccineBoard | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  if (state.data !== null && state.data !== kept) {
    setKept(state.data);
    setNames(new Map([...names, ...state.data.vaccines.map((vaccine) => [vaccine.id, vaccine.name] as const)]));
  }
  const board = state.data ?? kept;

  // التعديلات والصفحات لكلّ نطاق (ScopeKey).
  const [drafts, setDrafts] = useState<Partial<Record<ScopeKey, Draft>>>({});
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [pageOf, setPageOf] = useState<Partial<Record<ScopeKey, number>>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<ProgramRequest | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [dropping, setDropping] = useState<Dropping | null>(null);
  const sending = useRef(false);
  // بعد stale_vaccine تصل قراءة جديدة: النافذة المفتوحة تأخذ نسخة اللقاح منها وتقول ما المحفوظ الآن، فالحفظ أو الحذف التالي بالنسخة الجديدة عن
  // علم (مراجعة 0026 I: كانت ترسل النسخة القديمة فتُرفض كلّ مرّة). ضبط حالة من حالة أثناء الرسم بشرط يتوقّف (stale يصير null).
  if (state.data !== null && editing?.stale && editing.stale !== state.data) {
    const now = state.data.vaccines.find((vaccine) => vaccine.id === editing.id);
    setEditing({
      ...editing,
      stale: null,
      version: now ? now.version : editing.version,
      failure: !now
        ? t('halls.vac.stale_gone', 'لم يعد هذا اللقاح في القائمة: حُذف من جهاز آخر.')
        : now.item
          ? t('halls.vac.stale_item', 'غُيّر هذا اللقاح من جهاز آخر، والمحفوظ الآن «{name}» بمادّة «{item}». ما كتبته باقٍ: احفظ ليُكتب فوقه.', { name: now.name, item: now.item.name })
          : t('halls.vac.stale_plain', 'غُيّر هذا اللقاح من جهاز آخر، والمحفوظ الآن «{name}» بلا مادّة. ما كتبته باقٍ: احفظ ليُكتب فوقه.', { name: now.name }),
    });
  }
  if (state.data !== null && deleting?.stale && deleting.stale !== state.data) {
    const now = state.data.vaccines.find((vaccine) => vaccine.id === deleting.vaccine.id);
    setDeleting({
      ...deleting,
      stale: null,
      vaccine: now ?? deleting.vaccine,
      failure: now
        ? t('halls.vac.stale_delete', 'غُيّر هذا اللقاح من جهاز آخر فقُرئ من جديد: راجع ما يُحذف أعلاه ثمّ أكّد.')
        : t('halls.vac.stale_gone', 'لم يعد هذا اللقاح في القائمة: حُذف من جهاز آخر.'),
    });
  }
  // وكذلك نافذة حذف جدول القاعة بعد stale_program: تأخذ نسخته من القراءة الجديدة (0 إن لم يعد لها جدول خاصّ) وتقول ما جرى.
  if (state.data !== null && dropping?.stale && dropping.stale !== state.data) {
    const now = state.data.halls?.find((entry) => entry.id === dropping.hall.id)?.program ?? null;
    setDropping({
      ...dropping,
      stale: null,
      version: now ? now.version : 0,
      failure: now
        ? t('halls.vac.stale_drop', 'غُيّر جدول «{hall}» الخاصّ من جهاز آخر فقُرئ من جديد: راجع ما يُحذف أعلاه ثمّ أكّد.', { hall: dropping.hall.name })
        : t('halls.vac.stale_drop_gone', 'لم يعد لـ«{hall}» جدول خاصّ: حُذف من جهاز آخر، فهي تتبع الجدول العامّ.', { hall: dropping.hall.name }),
    });
  }

  // القاعة من ?hall= إن كانت بين القاعات المقروءة، ونوعها نوع الصفحة؛ وإلّا الجدول العامّ لـ?kind= (بجملة إن طُلبت قاعة غائبة).
  const halls = board?.halls ?? [];
  const labels = hallNames(halls);
  const labelOf = (entry: VaccineHall): string => labels.get(entry.id) ?? entry.name;
  const askedHall = search.get('hall');
  const hall = askedHall === null ? null : (halls.find((entry) => entry.id === askedHall) ?? null);
  const asked = search.get('kind');
  const shownKinds = board ? KINDS.filter((of) => board.hasHalls[of] || board.programs[of].version > 0 || of === asked || of === hall?.kind) : [];
  const kinds = shownKinds.length ? shownKinds : (['broiler'] as const);
  const kind: FlockKind = hall ? hall.kind : asked === 'broiler' || asked === 'layer' ? asked : (kinds[0] ?? 'broiler');
  const back = backTarget(search.get('back'), farmPath(kind));
  const scope: ScopeKey = hall ? hallKey(hall.id) : kind;
  const hallName = hall ? labelOf(hall) : '';
  const kindHalls = [...halls].sort(hallOrder).filter((entry) => entry.kind === kind);

  const vaccines = board?.vaccines ?? [];
  const known = new Set(vaccines.map((vaccine) => vaccine.id));
  const byId = new Map(vaccines.map((vaccine) => [vaccine.id, vaccine]));
  /**
   * ما يتبعه النطاق الآن: saved جدول القاعة الخاصّ أو العامّ لنوعها إن لم يكن لها (أو العامّ للنوع)، وversion نسخة ما يُحفظ فوقه (0 لقاعة بلا
   * جدول خاصّ). وقاعة لم تعد في القراءة لا نطاق لها (null).
   */
  const targetOf = (key: ScopeKey): { kind: FlockKind; hall: VaccineHall | null; saved: VaccineProgram; version: number } | null => {
    if (!board) return null;
    if (key === 'broiler' || key === 'layer') return { kind: key, hall: null, saved: board.programs[key], version: board.programs[key].version };
    const entry = halls.find((candidate) => hallKey(candidate.id) === key);
    return entry ? { kind: entry.kind, hall: entry, saved: entry.program ?? board.programs[entry.kind], version: entry.program?.version ?? 0 } : null;
  };
  const dirtyOf = (key: ScopeKey): boolean => {
    const draft = drafts[key];
    const target = targetOf(key);
    if (!draft || !target) return false;
    // قاعة بلا جدول خاصّ وفيها تعديل: الحفظ ينشئ جدولها (ولو طابق العامّ)، فهو لم يُحفظ بعد.
    if (target.hall && !target.hall.program) return true;
    const savedOpen = serverOpen(target.saved);
    return draft.open !== savedOpen || (!draft.open && parseEnd(draft.endText) !== serverEnd(target.kind, target.saved)) || !sameSet(draft.days, serverDays(target.saved));
  };
  // تعديل صار كالمحفوظ (حُفظ، أو أُرجع باليد) يُترك: النسخة التي بُني عليها تتبع المحفوظ من الآن. وتعديل قاعة لم تعد في القراءة يُترك كذلك.
  const clean = board ? Object.keys(drafts).filter((key) => !dirtyOf(key)) : [];
  if (clean.length && !saving && frozen === null) {
    setDrafts((current) => {
      const next = { ...current };
      for (const key of clean) delete next[key];
      return next;
    });
  }
  const anyDirty = Object.keys(drafts).some((key) => dirtyOf(key));
  useDirtyForm(anyDirty || saving || frozen !== null);

  const target = targetOf(scope);
  const program = target ? target.saved : null;
  const savedVersion = target ? target.version : 0;
  const draft = drafts[scope] ?? null;
  const dirty = dirtyOf(scope);
  // التعارض: نسخة المحفوظ تقدّمت على ما بُني عليه التعديل، أو نقصت عنه بقراءة جديدة (لا بالمحفوظة أثناء القراءة بعد الحفظ): حُذف جدول القاعة
  // الخاصّ من جهاز آخر فصارت تتبع العامّ.
  const conflict = dirty && draft !== null && (savedVersion > draft.against || (state.data !== null && savedVersion < draft.against));
  const canEdit = board?.canEdit === true;
  const readFailed = state.error !== null;
  const locked = !canEdit || readFailed || state.loading || saving || frozen !== null;
  /** قاعة بلا جدول خاصّ ولا تعديل: تُعرض بالعامّ للعرض، و«اعمل لها جدولاً خاصّاً» يبدأ نسخةً منه. */
  const follows = hall !== null && hall.program === null && draft === null;
  const editable = canEdit && !follows;
  /** نهاية الدورة المحفوظة (أو الافتراض بلا جدول)، ومفتوحة أم لا (0030). */
  const savedEnd = program ? serverEnd(kind, program) : DEFAULT_END[kind];
  const savedOpen = program ? serverOpen(program) : false;
  const open = draft?.open ?? savedOpen;
  const endText = draft?.endText ?? fmtInt(savedEnd);
  const typedEnd = parseEnd(endText);
  const days: ReadonlySet<DayKey> = draft?.days ?? (program ? serverDays(program) : new Set());
  const liveDays = [...days].filter((key) => known.has(splitKey(key).vaccineId));
  const lastDay = liveDays.reduce((most, key) => Math.max(most, splitKey(key).ageDay), 0);
  /** آخر يوم عمر يُرسم: النهاية المحدّدة، أو للمفتوحة نهاية النوع المقترحة أو آخر يوم فيها وأسبوعان بعده. */
  const endAge = open ? openSpan(kind, lastDay) : (typedEnd ?? savedEnd);
  // أيّام في تعديلك للقاح لم يعد في القائمة (حُذف أو أُخفي من جهاز آخر): لا تُرسم ولا تُحفظ، وجملة تسمّيها (مراجعة 0026 F).
  const goneDays = draft ? sortedDays([...draft.days].filter((key) => !known.has(splitKey(key).vaccineId)), vaccines) : [];
  const dropped = open
    ? []
    : sortedDays(
        liveDays.filter((key) => splitKey(key).ageDay > endAge),
        vaccines,
      );
  const picked = selected.filter((id) => known.has(id));
  const pages = Math.max(1, Math.ceil(endAge / PAGE_DAYS));
  const page = Math.min(pageOf[scope] ?? 0, pages - 1);
  const ages = Array.from({ length: Math.min(PAGE_DAYS, endAge - page * PAGE_DAYS) }, (_, index) => page * PAGE_DAYS + index + 1);
  const onDay = (age: number): Vaccine[] => vaccines.filter((vaccine) => days.has(dayKey(age, vaccine.id)));

  // التقويم بالأشهر الحقيقية لقاعة بفوج قائم مسكَّن (0030): من أوّل يوم عمر في الجدول (1، أو عمر التسكين إن كان أكبر) إلى آخر يوم يُرسم، بتواريخها؛
  // والشهر المعروض شهر اليوم إن كان فيها، وإلّا أوّلها.
  const flock = hall?.flock ?? null;
  const firstAge = flock ? Math.max(1, flock.age0) : 1;
  const calendarFrom: Day | null = flock && endAge >= firstAge ? addDays(flock.placedOn, firstAge - flock.age0) : null;
  const calendarTo: Day | null = flock && calendarFrom !== null ? addDays(flock.placedOn, endAge - flock.age0) : null;
  const months: Month[] = calendarFrom !== null && calendarTo !== null ? monthsBetween(calendarFrom, calendarTo) : [];
  const today = board?.today ?? null;
  const todayMonth = today !== null ? months.indexOf(monthOf(today)) : -1;
  const monthPage = months.length ? Math.min(pageOf[scope] ?? Math.max(0, todayMonth), months.length - 1) : 0;
  const shownMonth: Month | null = months[monthPage] ?? null;
  const ageOn = (day: Day): number => (flock ? flock.age0 + diffDays(day, flock.placedOn) : 0);

  const changeDraft = (patch: (current: Draft) => Partial<Draft>) => {
    if (!program || !editable) return;
    setDrafts((current) => {
      const base = current[scope] ?? baseDraft(kind, program, savedVersion);
      return { ...current, [scope]: { ...base, ...patch(base) } };
    });
  };

  const toggleAge = (age: number) => {
    if (locked || !editable) return;
    if (!picked.length) {
      setHint(t('halls.vac.pick_first', 'اختر لقاحاً أو أكثر من القائمة أوّلاً، ثمّ اضغط الأيام.'));
      return;
    }
    setHint(null);
    changeDraft((current) => {
      const next = new Set(current.days);
      const all = picked.every((id) => next.has(dayKey(age, id)));
      for (const id of picked) {
        if (all) next.delete(dayKey(age, id));
        else next.add(dayKey(age, id));
      }
      return { days: next };
    });
  };

  const togglePick = (id: string) => {
    setHint(null);
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  };

  const goKind = (next: FlockKind) => {
    const params = new URLSearchParams(search);
    params.set('kind', next);
    params.delete('hall');
    setFailure(null);
    setSearch(params);
  };
  /** «لمن هذا الجدول؟»: '' الجدول العامّ، وإلّا معرّف القاعة. */
  const goScope = (value: string) => {
    const params = new URLSearchParams(search);
    params.set('kind', kind);
    if (value === '') params.delete('hall');
    else params.set('hall', value);
    setFailure(null);
    setSearch(params);
  };

  const dropDraft = (key: ScopeKey) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  const discard = () => {
    setFailure(null);
    dropDraft(scope);
  };
  const reapply = () => {
    if (!program) return;
    setFailure(null);
    changeDraft(() => ({ against: savedVersion }));
  };
  /** «اعمل لها جدولاً خاصّاً»: تعديل منسوخ من الجدول العامّ بنهايته وأيّامه، يُحفظ بالنسخة 0 فيُنشأ. */
  const startHall = () => {
    if (!hall || hall.program !== null || !program || locked) return;
    setFailure(null);
    setDrafts((current) => ({ ...current, [scope]: baseDraft(kind, program, 0) }));
  };

  const saved = (request: ProgramRequest, version: number) => {
    const slots = slotsText(request.days.length);
    const end = endWord(request.endAge);
    toast({
      tone: 'success',
      title: request.hall
        ? t('halls.vac.saved_hall', 'حُفظ جدول لقاحات «{hall}»: {slots}، ونهاية الدورة {end}.', { hall: request.hall.name, slots, end })
        : t('halls.vac.saved', 'حُفظ جدول لقاحات {kind}: {slots}، ونهاية الدورة {end}.', { kind: kindTitle(request.kind), slots, end }),
    });
    // ما حُفظ يبقى ظاهراً حتّى تصل القراءة الجديدة، ثمّ يُترك (صار كالمحفوظ).
    setDrafts((current) => ({
      ...current,
      [requestKey(request)]: {
        against: version,
        endText: fmtInt(request.endAge ?? DEFAULT_END[request.kind]),
        open: request.endAge === null,
        days: new Set(request.days.map((day) => dayKey(day.ageDay, day.vaccineId))),
      },
    }));
    state.retry();
  };

  const submit = async (request: ProgramRequest, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    setFailure(null);
    const hallId = request.hall ? request.hall.id : null;
    try {
      const done =
        hallId === null
          ? await saveVaccineProgram(request.kind, request.endAge, request.days, request.version)
          : await saveHallVaccineProgram(hallId, request.endAge, request.days, request.version);
      setFrozen(null);
      saved(request, done.version);
    } catch (problem) {
      if (problem instanceof RejectedError && PROGRAM_CHANGED.has(problem.code)) {
        if (retrying) {
          // إعادة بعد نتيجة مجهولة رُفضت بشرط النسخة أو بلقاح حُذف: ربّما حُفظت الأولى. يُقرأ الجدول ويُقارن بما أُرسل.
          let fresh: VaccineBoard;
          try {
            fresh = await loadVaccineBoard();
          } catch (readProblem) {
            // التحقّق فشل: يبقى الطلب مجمَّداً (الإعادة بعده)، ولا يُقال «حُفظ» ولا «تغيّر».
            setFailure(t('halls.vac.verify_failed', 'تعذّر التحقّق من حفظ الجدول ({detail}): أعد المحاولة.', { detail: describeError(readProblem, 'read').title }));
            return;
          }
          // حُفظت الأولى: نسخة الجدول تقدّمت والمحفوظ ما أُرسل، بلا أيّام لقاح حذفه جهاز آخر بعدها (الحذف يزيل أيّامه من الجدول). وجدول القاعة
          // جدولها الخاصّ وحده (قاعة صارت بلا جدول خاصّ لم يُحفظ لها شيء).
          const after = hallId === null ? fresh.programs[request.kind] : (fresh.halls?.find((entry) => entry.id === hallId)?.program ?? null);
          const live = new Set(fresh.vaccines.map((vaccine) => vaccine.id));
          const sentLive = { ...request, days: request.days.filter((day) => live.has(day.vaccineId)) };
          if (after && after.version !== request.version && sameProgram(after, sentLive)) {
            setFrozen(null);
            saved(sentLive, after.version);
            return;
          }
        }
        // تغيّر الجدول أو قائمته من جهاز آخر: يُقرأ من جديد ويبقى التعديل ظاهراً (بلا أيّام لقاح لم يعد في القائمة، بجملة تسمّيها)، وبجدول الفروق
        // حين تغيّرت نسخة الجدول حتّى «اعتمد تعديلي» أو «خذ المحفوظ».
        setFrozen(null);
        setFailure(failureText(problem));
        state.retry();
      } else if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن حُفظ: الشاشة تتجمّد بطلبها، والإعادة وحدها ممكنة. وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(request);
        if (retrying && surelyUnsaved(problem)) setFailure(RETRY_UNREACHED());
      } else {
        // رفض أكيد: لم يُحفظ شيء، والتعديل باقٍ كما هو. والقاعة التي لم تعد في القائمة تخرج منها بقراءة جديدة.
        setFrozen(null);
        setFailure(failureText(problem));
        if (hallId !== null && problem instanceof RejectedError && HALL_GONE.has(problem.code)) state.retry();
      }
    } finally {
      sending.current = false;
      setSaving(false);
    }
  };

  const save = () => {
    const end = open ? null : typedEnd;
    if (!program || !draft || !dirty || conflict || (!open && end === null) || locked || !editable) return;
    const sent = sortedDays(
      liveDays.filter((key) => end === null || splitKey(key).ageDay <= end),
      vaccines,
    );
    void submit({ kind, hall: hall ? { id: hall.id, name: hallName } : null, endAge: end, days: sent, version: draft.against }, false);
  };

  // ─── جدول القاعة الخاصّ: «احذف جدولها الخاصّ» ──────────────────────────────────────────────────────────────────────
  const hallDropped = (request: Dropping) => {
    toast({ tone: 'success', title: t('halls.vac.hall_dropped', 'عادت «{hall}» إلى الجدول العامّ.', { hall: request.hall.name }) });
    dropDraft(hallKey(request.hall.id));
    setDropping(null);
    state.retry();
  };

  const dropOne = async () => {
    if (!dropping || dropping.busy) return;
    const retrying = dropping.frozen;
    const request = dropping;
    setDropping({ ...dropping, busy: true, failure: null });
    try {
      // dropped false: لم يكن لها جدول خاصّ (حذفه جهاز آخر، أو الأولى بعد نتيجة مجهولة): هي على الجدول العامّ كما طُلب.
      await dropHallVaccineProgram(request.hall.id, request.version);
      hallDropped(request);
    } catch (problem) {
      // إعادة رُفضت بشرط النسخة: ربّما حُذف بالأولى؛ يُقرأ ويُنظر هل بقي لها جدول خاصّ.
      if (retrying && problem instanceof RejectedError && problem.code === 'stale_program') {
        try {
          const fresh = await loadVaccineBoard();
          const now = fresh.halls?.find((entry) => entry.id === request.hall.id);
          if (now && now.program === null) {
            hallDropped(request);
            return;
          }
        } catch {
          // التحقّق فشل: يبقى الطلب مجمَّداً (الإعادة بعده)، ولا يُقال «عادت» ولا «رُفض».
          setDropping((current) => (current ? { ...current, busy: false, failure: RETRY_UNREACHED() } : current));
          return;
        }
      }
      const unknown = !surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError));
      // stale_program: تنتظر النافذة القراءة الجديدة فتأخذ منها نسخة الجدول وما فيه الآن.
      const stale = !unknown && problem instanceof RejectedError && problem.code === 'stale_program' ? board : null;
      setDropping((current) =>
        current
          ? unknown
            ? { ...current, busy: false, frozen: true, failure: retrying && surelyUnsaved(problem) ? RETRY_UNREACHED() : null }
            : { ...current, busy: false, frozen: false, failure: failureText(problem), stale }
          : current,
      );
      if (!unknown) state.retry();
    }
  };
  const openDrop = () => {
    if (!hall?.program || locked) return;
    setDropping({ hall: { id: hall.id, name: hallName }, version: hall.program.version, busy: false, failure: null, frozen: false, stale: null });
  };
  const closeDropping = () => {
    const uncertain = dropping?.frozen ?? false;
    setDropping(null);
    if (uncertain) state.retry();
  };

  // ─── اللقاح: إضافة وتعديل وحذف ───────────────────────────────────────────────────────────────────────────────────
  const vaccineSaved = (request: Editing, name: string) => {
    toast({ tone: 'success', title: request.version === null ? t('halls.vac.added', 'أُضيف اللقاح «{name}».', { name }) : t('halls.vac.updated', 'حُفظ اللقاح «{name}».', { name }) });
    if (request.version === null) setSelected((current) => (current.includes(request.id) ? current : [...current, request.id]));
    setEditing(null);
    state.retry();
  };

  const saveOne = async () => {
    if (!editing || editing.busy) return;
    const retrying = editing.frozen !== null;
    const name = editing.frozen ? editing.frozen.name : editing.name.trim();
    const itemId = editing.frozen ? editing.frozen.itemId : editing.itemId === '' ? null : editing.itemId;
    if (!retrying && (name === '' || [...name].length > NAME_MAX)) {
      setEditing({ ...editing, failure: t('halls.vac.name_need', 'اكتب اسم اللقاح، 40 حرفاً على الأكثر.') });
      return;
    }
    const request = editing;
    setEditing({ ...editing, busy: true, failure: null });
    try {
      await saveVaccine(request.id, name, itemId, request.version);
      vaccineSaved(request, name);
    } catch (problem) {
      // إعادة رُفضت بالمعرّف أو بالاسم أو بالنسخة: ربّما حُفظت الأولى؛ يُقرأ ويُقارن.
      if (retrying && problem instanceof RejectedError && ['id_conflict', 'name_taken', 'stale_vaccine'].includes(problem.code)) {
        try {
          const fresh = await loadVaccineBoard();
          const found = fresh.vaccines.find((vaccine) => vaccine.id === request.id);
          if (found && found.name === name && (found.item?.id ?? null) === itemId) {
            vaccineSaved(request, name);
            return;
          }
        } catch {
          // التحقّق فشل: يبقى الطلب مجمَّداً كما هو (الإعادة بعده)، ولا يُقال «حُفظ» ولا «رُفض».
          setEditing((current) => (current ? { ...current, busy: false, failure: RETRY_UNREACHED() } : current));
          return;
        }
      }
      const unknown = !surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError));
      // stale_vaccine: تنتظر النافذة القراءة الجديدة (stale) فتأخذ منها نسخة اللقاح وما المحفوظ الآن.
      const stale = !unknown && problem instanceof RejectedError && problem.code === 'stale_vaccine' ? board : null;
      setEditing((current) =>
        current
          ? unknown
            ? { ...current, busy: false, frozen: { name, itemId }, failure: retrying && surelyUnsaved(problem) ? RETRY_UNREACHED() : null }
            : { ...current, busy: false, frozen: null, failure: failureText(problem), stale }
          : current,
      );
      if (!unknown && problem instanceof RejectedError && (problem.code === 'stale_vaccine' || problem.code === 'vaccine_not_found')) state.retry();
    }
  };

  const vaccineDeleted = (vaccine: Vaccine, result: 'deleted' | 'archived') => {
    toast({
      tone: 'success',
      title:
        result === 'deleted'
          ? t('halls.vac.deleted', 'حُذف اللقاح «{name}» وأُزيلت أيّامه من كلّ الجداول.', { name: vaccine.name })
          : t('halls.vac.archived', 'أُخفي اللقاح «{name}» وأُزيلت أيّامه من كلّ الجداول: أُشِّر من قبل، فبقيت تأشيراته باسمه.', { name: vaccine.name }),
    });
    setSelected((current) => current.filter((id) => id !== vaccine.id));
    setDeleting(null);
    state.retry();
  };

  const deleteOne = async () => {
    if (!deleting || deleting.busy) return;
    if (!deleting.frozen && anyDirty) {
      setDeleting({ ...deleting, failure: t('halls.vac.delete_dirty', 'احفظ تعديل الجدول أو تراجع عنه قبل حذف لقاح: الحذف يغيّر الجدول.') });
      return;
    }
    const retrying = deleting.frozen;
    const { vaccine } = deleting;
    setDeleting({ ...deleting, busy: true, failure: null });
    try {
      const done = await deleteVaccine(vaccine.id, vaccine.version);
      vaccineDeleted(vaccine, done.result);
    } catch (problem) {
      if (retrying && problem instanceof RejectedError && (problem.code === 'vaccine_not_found' || problem.code === 'stale_vaccine')) {
        try {
          const fresh = await loadVaccineBoard();
          if (!fresh.vaccines.some((entry) => entry.id === vaccine.id)) {
            vaccineDeleted(vaccine, vaccine.inUse ? 'archived' : 'deleted');
            return;
          }
        } catch {
          // التحقّق فشل: يبقى الطلب مجمَّداً (الإعادة بعده)، ولا يُقال «حُذف» ولا «رُفض».
          setDeleting((current) => (current ? { ...current, busy: false, failure: RETRY_UNREACHED() } : current));
          return;
        }
      }
      const unknown = !surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError));
      const stale = !unknown && problem instanceof RejectedError && problem.code === 'stale_vaccine' ? board : null;
      setDeleting((current) =>
        current
          ? unknown
            ? { ...current, busy: false, frozen: true, failure: retrying && surelyUnsaved(problem) ? RETRY_UNREACHED() : null }
            : { ...current, busy: false, frozen: false, failure: failureText(problem), stale }
          : current,
      );
      if (!unknown) state.retry();
    }
  };

  const closeEditing = () => {
    const uncertain = editing?.frozen !== null && editing?.frozen !== undefined;
    setEditing(null);
    if (uncertain) state.retry();
  };
  const closeDeleting = () => {
    const uncertain = deleting?.frozen ?? false;
    setDeleting(null);
    if (uncertain) state.retry();
  };
  const openAdd = () =>
    setEditing({ id: crypto.randomUUID(), version: null, name: '', itemId: '', initialName: '', initialItem: '', busy: false, failure: null, frozen: null, stale: null });
  const openEdit = (vaccine: Vaccine) =>
    setEditing({ id: vaccine.id, version: vaccine.version, name: vaccine.name, itemId: vaccine.item?.id ?? '', initialName: vaccine.name, initialItem: vaccine.item?.id ?? '', busy: false, failure: null, frozen: null, stale: null });

  // ─── العرض ───────────────────────────────────────────────────────────────────────────────────────────────────
  const header = (
    <>
      <BackLink to={back} label={backLabel(back)} />
      <PageHeader title={t('halls.vaccines.title', 'جدول اللقاحات')} subtitle={t('halls.vac.subtitle', 'جدول عامّ لكلّ نوع يسري على قاعاته، ولأيّ قاعة جدول خاصّ يحلّ محلّه.')} />
    </>
  );
  if (!board) {
    return (
      <div className="flex flex-col gap-5" data-action="vaccines-page">
        {header}
        {state.error ? (
          state.error instanceof RejectedError && state.error.hint ? (
            <Notice tone="warning" title={state.error.hint} />
          ) : (
            <LoadFailed what={t('halls.vac.what', 'جدول اللقاحات')} error={state.error} onRetry={state.retry} />
          )
        ) : (
          <p role="status" className="text-sm text-ink-muted">
            {t('page.loading', 'جارٍ الفتح…')}
          </p>
        )}
      </div>
    );
  }

  /** مربّع يوم عمر: في شبكة الأعمار رقمه، وفي التقويم (on) رقم يوم الشهر وعمر الطيور فيه؛ والضغط يضيف المختار إلى يوم العمر أو يشيله. */
  const ageCell = (age: number, on: Day | null) => {
    const here = onDay(age);
    const content = (
      <>
        {on === null ? (
          <span className="text-center text-2xl font-semibold tabular-nums" aria-hidden="true">
            {fmtInt(age)}
          </span>
        ) : (
          <span className="flex items-baseline justify-between gap-1 px-1" aria-hidden="true">
            <span className="text-lg font-semibold tabular-nums">{fmtInt(dayNumber(on))}</span>
            <span className="text-2xs font-semibold text-brand-700 dark:text-brand-200" data-action="cell-age">
              {t('halls.vac.cell_age', 'عمر {age}', { age: fmtInt(age) })}
            </span>
          </span>
        )}
        {here.map((vaccine) => (
          <span key={vaccine.id} className="truncate rounded bg-surface-2 px-2 text-2xs" style={bandStyle(vaccine.color)} data-action="age-band" data-id={vaccine.id}>
            {vaccine.name}
          </span>
        ))}
      </>
    );
    const names = here.length ? listJoin(here.map((vaccine) => vaccine.name)) : t('halls.vac.age_none', 'بلا لقاح');
    const label = on === null ? t('halls.vac.age_aria', 'يوم العمر {age}: {names}', { age, names }) : t('halls.vac.day_aria', '{day}، يوم العمر {age}: {names}', { day: fmtDay(on), age, names });
    const look = 'flex min-h-20 min-w-0 flex-col items-stretch gap-0.5 rounded-xl border border-line bg-surface-1 p-1';
    const ring = on !== null && on === today ? NOW_RING : undefined;
    return editable ? (
      <button key={on ?? age} type="button" className={`${look} transition-shadow hover:shadow-soft disabled:cursor-not-allowed`} style={ring} aria-label={label} disabled={locked} onClick={() => toggleAge(age)} data-action="age-day" data-age={age} data-day={on ?? undefined}>
        {content}
      </button>
    ) : (
      <div key={on ?? age} className={look} style={ring} aria-label={label} role="group" data-action="age-day" data-age={age} data-day={on ?? undefined}>
        {content}
      </div>
    );
  };

  const diffRows: DiffRow[] = conflict && program
    ? sortedDays(new Set([...serverDays(program), ...liveDays].filter((key) => serverDays(program).has(key) !== days.has(key))), vaccines).map((day) => ({
        key: dayKey(day.ageDay, day.vaccineId),
        ageDay: day.ageDay,
        vaccine: byId.get(day.vaccineId) ?? null,
        saved: serverDays(program).has(dayKey(day.ageDay, day.vaccineId)),
        mine: days.has(dayKey(day.ageDay, day.vaccineId)),
      }))
    : [];
  const diffColumns: Column<DiffRow>[] = [
    { key: 'age', header: t('halls.vac.col.age', 'يوم العمر'), kind: 'number', cell: (row) => <Num>{fmtInt(row.ageDay)}</Num> },
    { key: 'vaccine', header: t('halls.vac.col.vaccine', 'اللقاح'), cell: (row) => (row.vaccine ? <VaccineName name={row.vaccine.name} color={row.vaccine.color} /> : '—') },
    { key: 'saved', header: t('halls.vac.col.saved', 'المحفوظ الآن'), cell: (row) => (row.saved ? t('halls.vac.in', 'فيه') : t('halls.vac.out', 'ليس فيه')) },
    { key: 'mine', header: t('halls.vac.col.mine', 'تعديلك'), cell: (row) => (row.mine ? t('halls.vac.in', 'فيه') : t('halls.vac.out', 'ليس فيه')) },
  ];
  const summary: SummaryRow[] = vaccines
    .map((vaccine) => ({ vaccine, ages: sortedDays(liveDays, vaccines).filter((day) => day.vaccineId === vaccine.id && day.ageDay <= endAge).map((day) => day.ageDay) }))
    .filter((row) => row.ages.length > 0);
  const summaryColumns: Column<SummaryRow>[] = [
    { key: 'vaccine', header: t('halls.vac.col.vaccine', 'اللقاح'), cell: (row) => <VaccineName name={row.vaccine.name} color={row.vaccine.color} /> },
    { key: 'ages', header: t('halls.vac.col.ages', 'أيّام العمر'), wrap: true, cell: (row) => listJoin(row.ages.map((age) => fmtInt(age))) },
    { key: 'count', header: t('halls.vac.col.count', 'المواعيد'), kind: 'number', cell: (row) => <Num>{fmtInt(row.ages.length)}</Num> },
  ];
  /** قاعات النوع التي لها جدول خاصّ، فلا تتبع العامّ. */
  const ownHalls = kindHalls.filter((entry) => entry.program !== null).map(labelOf);
  /** النتيجة المجهولة تسمّي جدولها حين يُعرض نطاق غيره (التنقّل لا يقفله، والإعادة به وحده). */
  const frozenTitle = !frozen
    ? ''
    : frozen.hall
      ? t('halls.vac.program_frozen_hall', 'لا نعرف إن حُفظ جدول «{hall}»: أعد المحاولة؛ لن يُحفظ مرّتين.', { hall: frozen.hall.name })
      : requestKey(frozen) === scope
        ? t('halls.vac.program_frozen', 'لا نعرف إن حُفظ الجدول: أعد المحاولة؛ لن يُحفظ مرّتين.')
        : t('halls.vac.program_frozen_kind', 'لا نعرف إن حُفظ جدول {kind} العامّ: أعد المحاولة؛ لن يُحفظ مرّتين.', { kind: kindTitle(frozen.kind) });
  /** جدول القاعة الذي يُحذف كما هو في آخر قراءة، وتعديلها الذي لم يُحفظ (يُترك بالحذف). */
  const droppingNow = dropping ? (halls.find((entry) => entry.id === dropping.hall.id)?.program ?? null) : null;
  const droppingDirty = dropping ? dirtyOf(hallKey(dropping.hall.id)) : false;

  return (
    <div className="flex flex-col gap-5" data-action="vaccines-page">
      {header}
      {readFailed ? (
        state.error instanceof RejectedError && state.error.hint ? (
          <Notice tone="warning" title={state.error.hint} />
        ) : (
          <LoadFailed what={t('halls.vac.what', 'جدول اللقاحات')} error={state.error} onRetry={state.retry} />
        )
      ) : null}
      {!canEdit ? <Notice tone="info" title={t('halls.vac.read_only', 'جدول اللقاحات يعدّله المالك أو المدير؛ هنا للعرض.')} /> : null}
      {kinds.length > 1 ? (
        <div className="max-w-md" data-action="kind-tabs">
          <Segmented label={t('halls.vac.kinds', 'نوع القاعات')} options={kinds.map((value) => ({ value, label: kindTitle(value) }))} value={kind} onChange={goKind} />
        </div>
      ) : null}
      {kindHalls.length ? (
        <section className="flex flex-col gap-2" role="group" aria-labelledby="halls-vac-scope" data-action="program-scope">
          <h2 id="halls-vac-scope" className="text-base font-semibold">
            {t('halls.vac.scope', 'لمن هذا الجدول؟')}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {[null, ...kindHalls].map((entry) => {
              const value = entry ? entry.id : '';
              const pressed = (hall ? hall.id : '') === value;
              const age = entry?.flock && board ? entry.flock.age0 + diffDays(board.today, entry.flock.placedOn) : null;
              const note = `halls-vac-scope-${value || 'general'}`;
              return (
                <button
                  key={value || 'general'}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={
                    entry
                      ? entry.program
                        ? t('halls.vac.scope_own', '{hall} (جدول خاصّ)', { hall: labelOf(entry) })
                        : labelOf(entry)
                      : t('halls.vac.scope_general', 'كلّ القاعات (الجدول العامّ)')
                  }
                  aria-describedby={note}
                  onClick={() => goScope(value)}
                  className={`flex min-h-20 min-w-0 flex-col items-start gap-1 rounded-2xl border p-3 text-start transition-colors ${pressed ? PICKED : UNPICKED}`}
                  data-action="scope-card"
                  data-id={value}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-lg font-semibold">{entry ? labelOf(entry) : t('halls.vac.card_general', 'كلّ القاعات')}</span>
                    {pressed ? <CircleCheck aria-hidden="true" className="size-4 shrink-0" /> : null}
                  </span>
                  <span id={note} className="flex flex-col gap-0.5 text-xs">
                    {entry ? (
                      <>
                        <span className={entry.program ? 'font-semibold text-brand-700 dark:text-brand-200' : 'text-ink-muted'} data-action="scope-card-program">
                          {entry.program ? t('halls.vac.card_own', 'جدول خاصّ') : t('halls.vac.card_follows', 'تتبع الجدول العامّ')}
                        </span>
                        <span className="text-ink-muted" data-action="scope-card-flock">
                          {age === null
                            ? t('halls.vac.card_empty', 'بلا فوج الآن')
                            : age <= 0
                              ? t('halls.vac.card_age0', 'فوج سُكّن بعمر يوم الفقس')
                              : t('halls.vac.card_age', 'فوج عمره {age}', { age: daysText(age) })}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-muted">{t('halls.vac.card_general_note', 'لكلّ قاعة ليس لها جدول خاصّ')}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {askedHall !== null && hall === null ? (
        <div data-action="hall-missing">
          <Notice tone="warning" title={t('halls.vac.hall_missing', 'القاعة المطلوبة ليست بين قاعاتك (أُرشفت أو خرجت من نطاقك)، فيُعرض الجدول العامّ.')} />
        </div>
      ) : null}

      <section className="card flex flex-col gap-3 p-4" data-action="vaccine-list">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('halls.vac.list', 'قائمة اللقاحات')}</h2>
          {canEdit ? (
            <Button size="sm" variant="secondary" icon={<Plus aria-hidden="true" className="size-4" />} onClick={openAdd} disabled={readFailed} data-action="vac-add">
              {t('halls.vac.add', 'أضف لقاحاً')}
            </Button>
          ) : null}
        </div>
        {vaccines.length ? (
          <div role="group" aria-label={t('halls.vac.list', 'قائمة اللقاحات')} className="flex flex-wrap gap-2">
            {vaccines.map((vaccine) => {
              const pressed = picked.includes(vaccine.id);
              return (
                <div key={vaccine.id} className="flex items-center gap-1 rounded-full border border-line p-1" data-action="vac-chip" data-id={vaccine.id}>
                  {canEdit ? (
                    <button
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => togglePick(vaccine.id)}
                      disabled={locked}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pressed ? PICKED : UNPICKED}`}
                      data-action="vac-pick"
                      data-id={vaccine.id}
                    >
                      {pressed ? <CircleCheck aria-hidden="true" className="size-4 shrink-0" /> : null}
                      <Swatch color={vaccine.color} />
                      {vaccine.name}
                    </button>
                  ) : (
                    <span className="px-3 text-sm font-semibold">
                      <VaccineName name={vaccine.name} color={vaccine.color} />
                    </span>
                  )}
                  {canEdit ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(vaccine)} disabled={locked} data-action="vac-edit" data-id={vaccine.id}>
                        {t('halls.vac.edit', 'عدّل')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting({ vaccine, busy: false, failure: null, frozen: false, stale: null })} disabled={locked} data-action="vac-delete" data-id={vaccine.id}>
                        {t('halls.vac.delete', 'احذف')}
                      </Button>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-muted" data-action="vac-empty">
            {canEdit ? t('halls.vac.empty_edit', 'لا لقاحات بعد: أضف لقاحاتك (IB، ND، …) ثمّ اختر أيّامها في الجدول.') : t('halls.vac.empty', 'لا لقاحات بعد.')}
          </p>
        )}
        {editable && vaccines.length ? (
          <p className="text-sm text-ink-muted" data-action="pick-help">
            {picked.length
              ? t('halls.vac.picked', 'المختار: {names}. اضغط يوماً في الجدول ليُضاف إليه المختار، أو يُشال منه إن كان فيه كلّه.', { names: listJoin(picked.map((id) => byId.get(id)?.name ?? '')) })
              : t('halls.vac.pick_help', 'اختر لقاحاً أو أكثر، ثمّ اضغط أيّام العمر في الجدول.')}
          </p>
        ) : null}
        {hint ? (
          <p role="status" className="text-sm text-warn-800 dark:text-warn-200" data-action="pick-hint">
            {hint}
          </p>
        ) : null}
      </section>

      <section className="card flex flex-col gap-3 p-4" data-action="program-card" data-kind={kind} data-hall={hall?.id}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold" data-action="program-title">
            {hall ? t('halls.vac.program_hall', 'جدول لقاحات «{hall}»', { hall: hallName }) : t('halls.vac.program', 'جدول لقاحات {kind}', { kind: kindTitle(kind) })}
          </h2>
          {editable ? (
            <div className="flex flex-wrap items-end gap-2" data-action="cycle-end-box">
              <div className="w-48" data-action="cycle-end-mode">
                <Segmented
                  label={t('halls.vac.end_mode', 'نهاية الدورة محدّدة أم مفتوحة')}
                  options={[
                    { value: 'fixed', label: t('halls.vac.end_fixed', 'محدّدة') },
                    { value: 'open', label: t('halls.vac.end_open', 'مفتوحة') },
                  ]}
                  value={open ? 'open' : 'fixed'}
                  onChange={(next) => {
                    if (!locked) changeDraft(() => ({ open: next === 'open' }));
                  }}
                />
              </div>
              {!open ? (
            <div className="w-32">
              <Field id="halls-end-age" label={t('halls.vac.end_label', 'نهاية الدورة')} error={typedEnd === null ? t('halls.vac.end_bad', 'من 1 إلى 1,000.') : null}>
                <input
                  id="halls-end-age"
                  className="input"
                  inputMode="numeric"
                  value={endText}
                  readOnly={locked}
                  onChange={(event) => {
                    const value = event.target.value;
                    changeDraft(() => ({ endText: value }));
                  }}
                  data-action="cycle-end"
                />
              </Field>
            </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {follows ? (
          <div data-action="hall-follows">
            <Notice
              tone="info"
              title={t('halls.vac.follows', '«{hall}» تتبع الجدول العامّ.', { hall: hallName })}
              action={
                canEdit ? (
                  <Button size="sm" variant="secondary" onClick={startHall} disabled={locked} data-action="hall-program-start">
                    {t('halls.vac.start_hall', 'اعمل لها جدولاً خاصّاً')}
                  </Button>
                ) : null
              }
            >
              {t('halls.vac.follows_detail', 'يُعرض هنا جدول {kind} العامّ كما تتبعه.', { kind: kindTitle(kind) })}
            </Notice>
          </div>
        ) : null}
        {hall && hall.program === null && draft !== null && draft.against === 0 ? (
          <p className="text-sm" data-action="hall-program-new">
            {t('halls.vac.hall_new', 'لـ«{hall}» جدول خاصّ لم يُحفظ بعد: احفظه لتتبعه بدل الجدول العامّ.', { hall: hallName })}
          </p>
        ) : null}
        {hall?.program ? (
          <p className="text-sm text-ink-muted" data-action="hall-program-own">
            {t('halls.vac.hall_own', 'لـ«{hall}» جدول خاصّ يحلّ محلّ الجدول العامّ.', { hall: hallName })}
          </p>
        ) : null}
        {!hall && ownHalls.length ? (
          <p className="text-sm text-ink-muted" data-action="own-halls">
            {t('halls.vac.own_halls', 'لا يسري هذا الجدول على القاعات ذات الجدول الخاصّ: {halls}.', { halls: listJoin(ownHalls) })}
          </p>
        ) : null}
        <p className="text-sm" data-action="cycle-end-text">
          {open ? t('halls.vac.end_open_text', 'نهاية الدورة: مفتوحة، بلا يوم محدّد؛ تنتهي الدورة حين تُغلق.') : t('halls.vac.end_text', 'نهاية الدورة: {days}', { days: daysText(endAge) })}
          {program && program.version === 0 ? t('halls.vac.end_default', ' (لا جدول محفوظ بعد).') : ''}
        </p>
        {dropped.length ? (
          <Notice tone="warning" title={t('halls.vac.dropped', 'نهاية الدورة قبل أيّام في الجدول، فتُشال هذه عند الحفظ:')}>
            <span data-action="dropped">{listJoin(dropped.map((day) => t('halls.vac.dropped_item', '«{name}» يوم {age}', { name: byId.get(day.vaccineId)?.name ?? '', age: day.ageDay })))}</span>
          </Notice>
        ) : null}
        {goneDays.length ? (
          <Notice tone="warning" title={t('halls.vac.gone', 'في تعديلك أيّام للقاح لم يعد في القائمة (حُذف أو أُخفي من جهاز آخر)، فأُزيلت منه ولن تُحفظ:')}>
            <span data-action="gone-days">{listJoin(goneDays.map((day) => t('halls.vac.dropped_item', '«{name}» يوم {age}', { name: names.get(day.vaccineId) ?? '', age: day.ageDay })))}</span>
          </Notice>
        ) : null}
        {conflict ? (
          <div className="flex flex-col gap-3" data-action="program-conflict">
            <Notice
              tone="warning"
              title={
                failure ??
                (hall && hall.program === null
                  ? t('halls.vac.conflict_dropped', 'حُذف جدول «{hall}» الخاصّ من جهاز آخر بعد أن بدأت التعديل، فهي تتبع الجدول العامّ الآن.', { hall: hallName })
                  : t('halls.vac.conflict', 'تغيّر الجدول من جهاز آخر بعد أن بدأت التعديل.'))
              }
            >
              {t('halls.vac.conflict_detail', 'تعديلك ظاهر في المربّعات ولم يُحفظ؛ قارنه بالمحفوظ الآن، ثمّ اعتمده أو خذ المحفوظ.')}
              {program && (open !== savedOpen || (!open && parseEnd(endText) !== savedEnd))
                ? t('halls.vac.conflict_end', ' نهاية الدورة المحفوظة الآن: {saved}، وفي تعديلك: {mine}.', { saved: endWord(savedOpen ? null : savedEnd), mine: endWord(open ? null : endAge) })
                : ''}
            </Notice>
            <DataTable caption={t('halls.vac.diff', 'الفرق بين تعديلك والجدول المحفوظ الآن')} columns={diffColumns} rows={diffRows} rowKey={(row) => row.key} empty={t('halls.vac.diff_none', 'الأيام نفسها، والفرق في نهاية الدورة وحدها.')} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={reapply} disabled={state.loading} data-action="reapply">
                {t('halls.vac.reapply', 'اعتمد تعديلي على الجدول الجديد')}
              </Button>
              <Button size="sm" variant="secondary" onClick={discard} disabled={state.loading} data-action="take-saved">
                {t('halls.vac.take_saved', 'خذ الجدول المحفوظ')}
              </Button>
            </div>
          </div>
        ) : null}
        {shownMonth !== null && flock !== null ? (
          <div className="flex flex-col gap-3" data-action="program-months">
            <p className="text-sm text-ink-muted" data-action="calendar-from">
              {t('halls.vac.months_from', 'بالتاريخ من تسكين الفوج في {day}، وفي كلّ يوم عمر الطيور فيه.', { day: fmtDay(flock.placedOn) })}
            </p>
            {months.length > 1 ? (
              <div role="group" aria-label={t('halls.vac.months', 'أشهر الدورة')} className="flex flex-wrap gap-2" data-action="month-pages">
                {months.map((month, index) => (
                  <Button
                    key={month}
                    size="sm"
                    variant={index === monthPage ? 'primary' : 'secondary'}
                    aria-pressed={index === monthPage}
                    onClick={() => setPageOf((current) => ({ ...current, [scope]: index }))}
                    data-action="month-page"
                    data-month={month}
                  >
                    {monthLabel(month)}
                  </Button>
                ))}
              </div>
            ) : null}
            <h3 className="text-base font-semibold" data-action="month-title">
              {monthLabel(shownMonth)}
            </h3>
            <div className="relative overflow-auto" data-action="age-scroll">
              <div className="grid gap-1" style={GRID} data-action="month-grid">
                {WEEKDAYS().map((name) => (
                  <div key={name} className="truncate text-center text-xs font-semibold text-ink-muted" aria-hidden="true">
                    {name}
                  </div>
                ))}
                {Array.from({ length: weekdayOf(`${shownMonth}-01`) }, (_, index) => (
                  <div key={`pad-${index}`} aria-hidden="true" />
                ))}
                {monthDays(shownMonth).map((day) =>
                  calendarFrom !== null && calendarTo !== null && day >= calendarFrom && day <= calendarTo ? (
                    ageCell(ageOn(day), day)
                  ) : (
                    <div key={day} className="flex min-h-20 min-w-0 flex-col rounded-xl border border-line p-1 text-ink-muted" style={DIM} aria-hidden="true" data-action="month-blank" data-day={day}>
                      <span className="px-1 text-lg font-semibold tabular-nums">{fmtInt(dayNumber(day))}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
          {pages > 1 ? (
            <div role="group" aria-label={t('halls.vac.pages', 'صفحات الأيام')} className="flex flex-wrap gap-2" data-action="age-pages">
              {Array.from({ length: pages }, (_, index) => (
                <Button
                  key={index}
                  size="sm"
                  variant={index === page ? 'primary' : 'secondary'}
                  aria-pressed={index === page}
                  onClick={() => setPageOf((current) => ({ ...current, [scope]: index }))}
                  data-action="age-page"
                  data-page={index}
                >
                  {t('halls.vac.page', 'من {from} إلى {to}', { from: index * PAGE_DAYS + 1, to: Math.min((index + 1) * PAGE_DAYS, endAge) })}
                </Button>
              ))}
            </div>
          ) : null}
            <div className="relative overflow-auto" data-action="age-scroll">
              <div className="grid gap-1" style={GRID} data-action="age-grid">
                {ages.map((age) => ageCell(age, null))}
              </div>
            </div>
          </>
        )}
        {summary.length ? (
          <div data-action="program-summary">
            <DataTable caption={t('halls.vac.summary', 'مواعيد كلّ لقاح')} columns={summaryColumns} rows={summary} rowKey={(row) => row.vaccine.id} empty="—" />
          </div>
        ) : null}
        {frozen ? (
          <Notice
            tone="warning"
            title={frozenTitle}
            action={
              <Button size="sm" busy={saving} onClick={() => void submit(frozen, true)} data-action="retry-program">
                {t('halls.kit.retry', 'أعد المحاولة')}
              </Button>
            }
          >
            {failure ? <span data-action="program-failure">{failure}</span> : null}
          </Notice>
        ) : failure && !conflict ? (
          <Notice tone="danger" title={failure}>
            <span data-action="program-failure" />
          </Notice>
        ) : null}
        {editable && !frozen ? (
          <div className="flex flex-wrap items-center gap-2" data-action="program-bar">
            <Button onClick={save} busy={saving} disabled={!dirty || conflict || (!open && typedEnd === null) || locked} data-action="save-program">
              {t('halls.vac.save', 'احفظ الجدول')}
            </Button>
            {dirty ? (
              <>
                <Button variant="ghost" onClick={discard} disabled={saving} data-action="discard-program">
                  {t('halls.vac.discard', 'تراجع عن التعديل')}
                </Button>
                <span className="text-sm text-ink-muted" data-action="program-dirty">
                  {t('halls.vac.unsaved', 'في الجدول تعديل لم يُحفظ.')}
                </span>
              </>
            ) : null}
            {hall?.program ? (
              <Button variant="ghost" onClick={openDrop} disabled={locked} data-action="hall-program-drop">
                {t('halls.vac.drop_hall', 'احذف جدولها الخاصّ')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      {editing ? (
        <VaccineDialog
          editing={editing}
          board={board}
          onChange={(patch) => setEditing((current) => (current ? { ...current, ...patch } : current))}
          onSave={() => void saveOne()}
          onClose={closeEditing}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          title={deleting.vaccine.inUse ? t('halls.vac.hide_title', 'أخفِ لقاح «{name}»', { name: deleting.vaccine.name }) : t('halls.vac.delete_title', 'احذف لقاح «{name}»', { name: deleting.vaccine.name })}
          consequence={
            <div className="flex flex-col gap-3" data-action="delete-dialog">
              <p data-action="delete-effect">
                {deleting.vaccine.inUse
                  ? t('halls.vac.hide_detail', 'أُشِّر هذا اللقاح من قبل، فلا يُمحى: يُخفى من القائمة ومن كلّ جداول اللقاحات، وتبقى تأشيراته السابقة باسمه.')
                  : t('halls.vac.delete_detail', 'لم يُؤشَّر هذا اللقاح قطّ، فيُحذف نهائياً ويُشال من كلّ جداول اللقاحات.')}
              </p>
              {KINDS.map((of) => {
                const its = board.programs[of].days.filter((day) => day.vaccineId === deleting.vaccine.id).map((day) => fmtInt(day.ageDay));
                return its.length ? (
                  <p key={of} className="text-sm" data-action="delete-days">
                    {t('halls.vac.delete_days', 'أيّامه في جدول {kind}: {ages}.', { kind: kindTitle(of), ages: listJoin(its) })}
                  </p>
                ) : null;
              })}
              {[...halls].sort(hallOrder).map((entry) => {
                const its = (entry.program?.days ?? []).filter((day) => day.vaccineId === deleting.vaccine.id).map((day) => fmtInt(day.ageDay));
                return its.length ? (
                  <p key={entry.id} className="text-sm" data-action="delete-days">
                    {t('halls.vac.delete_hall_days', 'أيّامه في جدول «{hall}»: {ages}.', { hall: labelOf(entry), ages: listJoin(its) })}
                  </p>
                ) : null;
              })}
              {deleting.frozen ? <Notice tone="warning" title={t('halls.vac.delete_frozen', 'لا نعرف إن حُذف اللقاح: أعد المحاولة؛ لن يُحذف مرّتين.')} /> : null}
              {deleting.failure ? <Notice tone="danger" title={deleting.failure} /> : null}
            </div>
          }
          confirmLabel={deleting.frozen ? t('halls.kit.retry', 'أعد المحاولة') : deleting.vaccine.inUse ? t('halls.vac.hide_go', 'أخفِ اللقاح') : t('halls.vac.delete_go', 'احذف اللقاح')}
          busy={deleting.busy}
          action={deleting.frozen ? 'delete-retry' : 'delete-go'}
          onConfirm={() => void deleteOne()}
          onCancel={closeDeleting}
        />
      ) : null}
      {dropping ? (
        <ConfirmDialog
          open
          title={t('halls.vac.drop_title', 'احذف جدول «{hall}» الخاصّ', { hall: dropping.hall.name })}
          consequence={
            <div className="flex flex-col gap-3" data-action="hall-drop-dialog">
              <p data-action="hall-drop-effect">{t('halls.vac.drop_detail', 'تعود «{hall}» إلى الجدول العامّ، ويُحذف جدولها الخاصّ وأيّامه.', { hall: dropping.hall.name })}</p>
              {droppingNow ? (
                <p className="text-sm" data-action="hall-drop-now">
                  {t('halls.vac.drop_now', 'جدولها الآن: {slots}، ونهاية الدورة {end}.', { slots: slotsText(droppingNow.days.length), end: endWord(droppingNow.endAge) })}
                </p>
              ) : null}
              {droppingDirty ? (
                <p className="text-sm" data-action="hall-drop-unsaved">
                  {t('halls.vac.drop_unsaved', 'في جدولها تعديل لم يُحفظ، ويُترك بالحذف.')}
                </p>
              ) : null}
              {dropping.frozen ? <Notice tone="warning" title={t('halls.vac.drop_frozen', 'لا نعرف إن حُذف جدولها الخاصّ: أعد المحاولة؛ لن يُحذف مرّتين.')} /> : null}
              {dropping.failure ? <Notice tone="danger" title={dropping.failure} /> : null}
            </div>
          }
          confirmLabel={dropping.frozen ? t('halls.kit.retry', 'أعد المحاولة') : t('halls.vac.drop_hall', 'احذف جدولها الخاصّ')}
          busy={dropping.busy}
          action={dropping.frozen ? 'hall-drop-retry' : 'hall-drop-go'}
          onConfirm={() => void dropOne()}
          onCancel={closeDropping}
        />
      ) : null}
    </div>
  );
}

export default function VaccinesPage() {
  return <VaccinesView />;
}
