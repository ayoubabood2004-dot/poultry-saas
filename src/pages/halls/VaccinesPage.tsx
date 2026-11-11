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
import type { FlockKind } from '../../domain/flocks';
import { describeError, IdentityError, NetworkError, NotConnectedError, RejectedError, RetryableError } from '../../lib/errors';
import { countForm, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { deleteVaccine, loadVaccineBoard, saveVaccine, saveVaccineProgram, type ProgramDay, type Vaccine, type VaccineBoard, type VaccineProgram } from '../../lib/repo/halls';
import { useLoad } from '../../lib/useLoad';
import { BackLink, backTarget, bandStyle, daysText, farmPath, Swatch, VaccineName } from './parts';

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

/** تعديل جدول نوع لم يُحفظ: النسخة التي بُني عليها، ونصّ نهاية الدورة كما كُتب، والأيام. */
interface Draft {
  against: number;
  endText: string;
  days: ReadonlySet<DayKey>;
}

/** نداء save_vaccine_program كما أُرسل (يُعاد حرفاً بعد نتيجة مجهولة). */
interface ProgramRequest {
  kind: FlockKind;
  endAge: number;
  days: readonly ProgramDay[];
  version: number;
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
}

interface Deleting {
  vaccine: Vaccine;
  busy: boolean;
  failure: string | null;
  frozen: boolean;
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
const baseDraft = (kind: FlockKind, saved: VaccineProgram): Draft => ({ against: saved.version, endText: fmtInt(serverEnd(kind, saved)), days: serverDays(saved) });

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
  // آخر قراءة ناجحة تبقى مرسومة أثناء القراءة من جديد (والتعديل مقفول أثناءها)، وفشل القراءة يُقال ويقفل الحفظ.
  const [kept, setKept] = useState<VaccineBoard | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  const board = state.data ?? kept;

  const [drafts, setDrafts] = useState<Partial<Record<FlockKind, Draft>>>({});
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [pageOf, setPageOf] = useState<Partial<Record<FlockKind, number>>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<ProgramRequest | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const sending = useRef(false);

  const asked = search.get('kind');
  const shownKinds = board ? KINDS.filter((kind) => board.hasHalls[kind] || board.programs[kind].version > 0 || kind === asked) : [];
  const kinds = shownKinds.length ? shownKinds : (['broiler'] as const);
  const kind: FlockKind = asked === 'broiler' || asked === 'layer' ? asked : (kinds[0] ?? 'broiler');
  const back = backTarget(search.get('back'), farmPath(kind));

  const program = board ? board.programs[kind] : null;
  const vaccines = board?.vaccines ?? [];
  const known = new Set(vaccines.map((vaccine) => vaccine.id));
  const byId = new Map(vaccines.map((vaccine) => [vaccine.id, vaccine]));
  const dirtyOf = (of: FlockKind): boolean => {
    const draft = drafts[of];
    if (!draft || !board) return false;
    const saved = board.programs[of];
    return parseEnd(draft.endText) !== serverEnd(of, saved) || !sameSet(draft.days, serverDays(saved));
  };
  // تعديل صار كالمحفوظ (حُفظ، أو أُرجع باليد) يُترك: النسخة التي بُني عليها تتبع المحفوظ من الآن.
  const clean = board ? KINDS.filter((of) => drafts[of] !== undefined && !dirtyOf(of)) : [];
  if (clean.length && !saving && frozen === null) {
    setDrafts((current) => {
      const next = { ...current };
      for (const of of clean) delete next[of];
      return next;
    });
  }
  const anyDirty = KINDS.some(dirtyOf);
  useDirtyForm(anyDirty || saving || frozen !== null);

  const draft = drafts[kind] ?? null;
  const dirty = dirtyOf(kind);
  const conflict = dirty && program !== null && draft !== null && program.version > draft.against;
  const canEdit = board?.canEdit === true;
  const readFailed = state.error !== null;
  const locked = !canEdit || readFailed || state.loading || saving || frozen !== null;
  /** نهاية الدورة المحفوظة (أو الافتراض بلا جدول). */
  const savedEnd = program ? serverEnd(kind, program) : DEFAULT_END[kind];
  const endText = draft?.endText ?? fmtInt(savedEnd);
  const typedEnd = parseEnd(endText);
  const endAge = typedEnd ?? savedEnd;
  const days: ReadonlySet<DayKey> = draft?.days ?? (program ? serverDays(program) : new Set());
  const liveDays = [...days].filter((key) => known.has(splitKey(key).vaccineId));
  const dropped = sortedDays(
    liveDays.filter((key) => splitKey(key).ageDay > endAge),
    vaccines,
  );
  const picked = selected.filter((id) => known.has(id));
  const pages = Math.max(1, Math.ceil(endAge / PAGE_DAYS));
  const page = Math.min(pageOf[kind] ?? 0, pages - 1);
  const ages = Array.from({ length: Math.min(PAGE_DAYS, endAge - page * PAGE_DAYS) }, (_, index) => page * PAGE_DAYS + index + 1);
  const onDay = (age: number): Vaccine[] => vaccines.filter((vaccine) => days.has(dayKey(age, vaccine.id)));

  const changeDraft = (patch: (current: Draft) => Partial<Draft>) => {
    if (!program) return;
    setDrafts((current) => {
      const base = current[kind] ?? baseDraft(kind, program);
      return { ...current, [kind]: { ...base, ...patch(base) } };
    });
  };

  const toggleAge = (age: number) => {
    if (locked) return;
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
    setFailure(null);
    setSearch(params);
  };

  const discard = () => {
    setFailure(null);
    setDrafts((current) => {
      const next = { ...current };
      delete next[kind];
      return next;
    });
  };
  const reapply = () => {
    if (!program) return;
    setFailure(null);
    changeDraft(() => ({ against: program.version }));
  };

  const saved = (request: ProgramRequest, version: number) => {
    toast({
      tone: 'success',
      title: t('halls.vac.saved', 'حُفظ جدول لقاحات {kind}: {slots}، ونهاية الدورة {end}.', { kind: kindTitle(request.kind), slots: slotsText(request.days.length), end: daysText(request.endAge) }),
    });
    // ما حُفظ يبقى ظاهراً حتّى تصل القراءة الجديدة، ثمّ يُترك (صار كالمحفوظ).
    setDrafts((current) => ({ ...current, [request.kind]: { against: version, endText: fmtInt(request.endAge), days: new Set(request.days.map((day) => dayKey(day.ageDay, day.vaccineId))) } }));
    state.retry();
  };

  const submit = async (request: ProgramRequest, retrying: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    setFailure(null);
    try {
      const done = await saveVaccineProgram(request.kind, request.endAge, request.days, request.version);
      setFrozen(null);
      saved(request, done.version);
    } catch (problem) {
      if (problem instanceof RejectedError && problem.code === 'stale_program') {
        if (retrying) {
          // إعادة بعد نتيجة مجهولة رُفضت بشرط النسخة: ربّما حُفظت الأولى. يُقرأ الجدول ويُقارن بما أُرسل.
          let fresh: VaccineBoard;
          try {
            fresh = await loadVaccineBoard();
          } catch (readProblem) {
            // التحقّق فشل: يبقى الطلب مجمَّداً (الإعادة بعده)، ولا يُقال «حُفظ» ولا «تغيّر».
            setFailure(t('halls.vac.verify_failed', 'تعذّر التحقّق من حفظ الجدول ({detail}): أعد المحاولة.', { detail: describeError(readProblem, 'read').title }));
            return;
          }
          if (sameProgram(fresh.programs[request.kind], request)) {
            setFrozen(null);
            saved(request, fresh.programs[request.kind].version);
            return;
          }
        }
        // تغيّر الجدول من جهاز آخر: يُقرأ من جديد ويبقى التعديل ظاهراً بجدول الفروق حتّى «اعتمد تعديلي» أو «خذ المحفوظ».
        setFrozen(null);
        setFailure(failureText(problem));
        state.retry();
      } else if (!surelyUnsaved(problem) || (retrying && !(problem instanceof RejectedError))) {
        // لا نعرف إن حُفظ: الشاشة تتجمّد بطلبها، والإعادة وحدها ممكنة. وإعادة لم تصل لا تغيّر ذلك.
        setFrozen(request);
        if (retrying && surelyUnsaved(problem)) setFailure(RETRY_UNREACHED());
      } else {
        // رفض أكيد: لم يُحفظ شيء، والتعديل باقٍ كما هو.
        setFrozen(null);
        setFailure(failureText(problem));
      }
    } finally {
      sending.current = false;
      setSaving(false);
    }
  };

  const save = () => {
    if (!program || !draft || !dirty || conflict || typedEnd === null || locked) return;
    const sent = sortedDays(
      liveDays.filter((key) => splitKey(key).ageDay <= typedEnd),
      vaccines,
    );
    void submit({ kind, endAge: typedEnd, days: sent, version: draft.against }, false);
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
      setEditing((current) =>
        current
          ? unknown
            ? { ...current, busy: false, frozen: { name, itemId }, failure: retrying && surelyUnsaved(problem) ? RETRY_UNREACHED() : null }
            : { ...current, busy: false, frozen: null, failure: failureText(problem) }
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
          ? t('halls.vac.deleted', 'حُذف اللقاح «{name}» وأُزيلت أيّامه من الجدولين.', { name: vaccine.name })
          : t('halls.vac.archived', 'أُخفي اللقاح «{name}» وأُزيلت أيّامه من الجدولين: أُشِّر من قبل، فبقيت تأشيراته باسمه.', { name: vaccine.name }),
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
      setDeleting((current) =>
        current
          ? unknown
            ? { ...current, busy: false, frozen: true, failure: retrying && surelyUnsaved(problem) ? RETRY_UNREACHED() : null }
            : { ...current, busy: false, frozen: false, failure: failureText(problem) }
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
    setEditing({ id: crypto.randomUUID(), version: null, name: '', itemId: '', initialName: '', initialItem: '', busy: false, failure: null, frozen: null });
  const openEdit = (vaccine: Vaccine) =>
    setEditing({ id: vaccine.id, version: vaccine.version, name: vaccine.name, itemId: vaccine.item?.id ?? '', initialName: vaccine.name, initialItem: vaccine.item?.id ?? '', busy: false, failure: null, frozen: null });

  // ─── العرض ───────────────────────────────────────────────────────────────────────────────────────────────────
  const header = (
    <>
      <BackLink to={back} label={t('halls.vac.back', 'رجوع إلى الحقول')} />
      <PageHeader title={t('halls.vaccines.title', 'جدول اللقاحات')} subtitle={t('halls.vac.subtitle', 'جدول واحد لكلّ نوع يسري على كلّ قاعاته، بأيّام عمر الطيور.')} />
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
                      <Button size="sm" variant="ghost" onClick={() => setDeleting({ vaccine, busy: false, failure: null, frozen: false })} disabled={locked} data-action="vac-delete" data-id={vaccine.id}>
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
        {canEdit && vaccines.length ? (
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

      <section className="card flex flex-col gap-3 p-4" data-action="program-card" data-kind={kind}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold" data-action="program-title">
            {t('halls.vac.program', 'جدول لقاحات {kind}', { kind: kindTitle(kind) })}
          </h2>
          {canEdit ? (
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
        <p className="text-sm" data-action="cycle-end-text">
          {t('halls.vac.end_text', 'نهاية الدورة: {days}', { days: daysText(endAge) })}
          {program && program.version === 0 ? t('halls.vac.end_default', ' (لا جدول محفوظ بعد).') : ''}
        </p>
        {dropped.length ? (
          <Notice tone="warning" title={t('halls.vac.dropped', 'نهاية الدورة قبل أيّام في الجدول، فتُشال هذه عند الحفظ:')}>
            <span data-action="dropped">{listJoin(dropped.map((day) => t('halls.vac.dropped_item', '«{name}» يوم {age}', { name: byId.get(day.vaccineId)?.name ?? '', age: day.ageDay })))}</span>
          </Notice>
        ) : null}
        {conflict ? (
          <div className="flex flex-col gap-3" data-action="program-conflict">
            <Notice tone="warning" title={failure ?? t('halls.vac.conflict', 'تغيّر الجدول من جهاز آخر بعد أن بدأت التعديل.')}>
              {t('halls.vac.conflict_detail', 'تعديلك ظاهر في المربّعات ولم يُحفظ؛ قارنه بالمحفوظ الآن، ثمّ اعتمده أو خذ المحفوظ.')}
              {program && parseEnd(endText) !== savedEnd
                ? t('halls.vac.conflict_end', ' نهاية الدورة المحفوظة الآن: {saved}، وفي تعديلك: {mine}.', { saved: daysText(savedEnd), mine: daysText(endAge) })
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
        {pages > 1 ? (
          <div role="group" aria-label={t('halls.vac.pages', 'صفحات الأيام')} className="flex flex-wrap gap-2" data-action="age-pages">
            {Array.from({ length: pages }, (_, index) => (
              <Button
                key={index}
                size="sm"
                variant={index === page ? 'primary' : 'secondary'}
                aria-pressed={index === page}
                onClick={() => setPageOf((current) => ({ ...current, [kind]: index }))}
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
            {ages.map((age) => {
              const here = onDay(age);
              const content = (
                <>
                  <span className="text-center text-2xl font-semibold tabular-nums" aria-hidden="true">
                    {fmtInt(age)}
                  </span>
                  {here.map((vaccine) => (
                    <span key={vaccine.id} className="truncate rounded bg-surface-2 px-2 text-2xs" style={bandStyle(vaccine.color)} data-action="age-band" data-id={vaccine.id}>
                      {vaccine.name}
                    </span>
                  ))}
                </>
              );
              const label = t('halls.vac.age_aria', 'يوم العمر {age}: {names}', { age, names: here.length ? listJoin(here.map((vaccine) => vaccine.name)) : t('halls.vac.age_none', 'بلا لقاح') });
              const look = 'flex min-h-20 min-w-0 flex-col items-stretch gap-0.5 rounded-xl border border-line bg-surface-1 p-1';
              return canEdit ? (
                <button key={age} type="button" className={`${look} transition-shadow hover:shadow-soft disabled:cursor-not-allowed`} aria-label={label} disabled={locked} onClick={() => toggleAge(age)} data-action="age-day" data-age={age}>
                  {content}
                </button>
              ) : (
                <div key={age} className={look} aria-label={label} role="group" data-action="age-day" data-age={age}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
        {summary.length ? (
          <div data-action="program-summary">
            <DataTable caption={t('halls.vac.summary', 'مواعيد كلّ لقاح')} columns={summaryColumns} rows={summary} rowKey={(row) => row.vaccine.id} empty="—" />
          </div>
        ) : null}
        {frozen ? (
          <Notice
            tone="warning"
            title={t('halls.vac.program_frozen', 'لا نعرف إن حُفظ الجدول: أعد المحاولة؛ لن يُحفظ مرّتين.')}
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
        {canEdit && !frozen ? (
          <div className="flex flex-wrap items-center gap-2" data-action="program-bar">
            <Button onClick={save} busy={saving} disabled={!dirty || conflict || typedEnd === null || locked} data-action="save-program">
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
                  ? t('halls.vac.hide_detail', 'أُشِّر هذا اللقاح من قبل، فلا يُمحى: يُخفى من القائمة ومن جدولي اللاحم والبيّاض، وتبقى تأشيراته السابقة باسمه.')
                  : t('halls.vac.delete_detail', 'لم يُؤشَّر هذا اللقاح قطّ، فيُحذف نهائياً ويُشال من جدولي اللاحم والبيّاض.')}
              </p>
              {KINDS.map((of) => {
                const its = board.programs[of].days.filter((day) => day.vaccineId === deleting.vaccine.id).map((day) => fmtInt(day.ageDay));
                return its.length ? (
                  <p key={of} className="text-sm" data-action="delete-days">
                    {t('halls.vac.delete_days', 'أيّامه في جدول {kind}: {ages}.', { kind: kindTitle(of), ages: listJoin(its) })}
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
    </div>
  );
}

export default function VaccinesPage() {
  return <VaccinesView />;
}
