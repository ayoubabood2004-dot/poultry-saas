import { CheckCircle2, Factory, PackageMinus, Plus } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { DayField } from '../../components/ui/DayField';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { can } from '../../domain/permissions';
import { parseQty, type BaseUnit } from '../../domain/units';
import { parseDayText } from '../../lib/dayText';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadFlockFeed, type CostKind, type FeedIssue } from '../../lib/repo/flocks';
import { loadIssueOptions, newIssueIds, recordFlockIssue, voidFlockIssue, type IssueIds, type IssueInput, type IssueItem, type IssueOptions } from '../../lib/repo/uses';
import { useSession } from '../../lib/session';
import { useLoad, type LoadState } from '../../lib/useLoad';
import { FeedLine } from '../farm/feed';

// الصرف لفوج القاعة (0019، كلمة المالك 2026-11-07: «هاي المادة لمن اروح للقاعات اريد اصرفلهم مادة معينة الكي المواد الي اني صنعتها بالمعمل…
// ويكلي شكد عندك واكدر اصرف منها للقاعة»): علف القاعة بسطر، وزرّ «اصرف علفاً أو دواءً» كبير يفتح نافذة عريضة ببطاقات ما يُصرف («عندك»،
// وعلف المعمل أوّلاً بشارته)، تُلمس المادّة فتُكتب كميتها بوحدتها ويومها، والزرّ يسمّي ما سيحدث؛ وسجلّ الصرف بجدول و«ألغِ» بسبب.
// الصرف يُرحَّل فوراً بنداء واحد (record_flock_issue)، فالصفحة في حزمة المخزون (تحتاج الخادم، خارج التثبيت المسبق بالاسم)، وشاشة الفوج
// وبطاقات الحقل تدلّ عليها. المعرّفات ومرجع العملية مرّة لكلّ نافذة: بعد نتيجة مجهولة تتجمّد النافذة وفعلها «أعد المحاولة» بالنداء نفسه حرفاً،
// وبعد رفض نهائيّ (لم يُكتب شيء) تُصحَّح ويُعاد إرسالها بالمعرّفات نفسها (store_required ← اختيار المخزن).
// ما يُكتب في النافذة يعيش في الصفحة (درس WP5): القراءة من جديد بعد كلّ صرف أو رفض لا تمسحه.

/** طريق الرجوع: صفحة الفوج أو الحقل وحدهما (لا رابط خارجي من المعامل). */
export function farmBack(value: string | null): string | null {
  return value !== null && /^\/(?:broiler|layers)(?:\/flock\/[\w-]+)?$/u.test(value) ? value : null;
}

/** آخر ما قُرئ يبقى معروضاً أثناء القراءة من جديد (النافذة المفتوحة لا تنطوي). */
function useKept<T>(state: LoadState<T>): T | null {
  const [kept, setKept] = useState<T | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  return state.data ?? kept;
}

const qtyText = (qty: bigint, unit: BaseUnit): string => {
  const shown = fmtQty(qty, unit);
  return shown.sub ?? shown.main;
};

const unitWord = (unit: BaseUnit): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

const COST_LABELS: Readonly<Record<CostKind, () => string>> = {
  feed: () => t('issue.kind.feed', 'علف'),
  medicine: () => t('issue.kind.medicine', 'دواء'),
  vaccine: () => t('issue.kind.vaccine', 'لقاح'),
  fuel: () => t('issue.kind.fuel', 'وقود'),
  other: () => t('issue.kind.other', 'أخرى'),
};

/** رموز رفض التاريخ: تُقال تحت حقل اليوم. */
const DATE_CODES = new Set(['date_required', 'date_in_future', 'date_too_old', 'before_placement', 'period_locked']);

interface IssueForm {
  itemId: string | null;
  qty: string;
  day: string;
  warehouseId: string | null;
  ids: IssueIds;
  /** النداء المرسَل بعد نتيجة مجهولة: النافذة مجمَّدة والإعادة به وحده. */
  pending: IssueInput | null;
  busy: boolean;
  failure: unknown;
}

const freshForm = (today: string): IssueForm => ({ itemId: null, qty: '', day: fmtDay(today), warehouseId: null, ids: newIssueIds(), pending: null, busy: false, failure: null });

interface Voiding {
  issue: FeedIssue;
  reason: string;
  ref: string;
  busy: boolean;
  failure: unknown;
  /** أُرسل ولم يُعرف جوابه: السبب مقفول والإعادة بالمرجع نفسه. */
  sent: boolean;
}

/** ما يمنع الصرف بالنافذة الآن، أو null. */
function formProblems(form: IssueForm, item: IssueItem | null, options: IssueOptions) {
  const qty = form.qty.trim() === '' ? null : parseQty(form.qty);
  const store = form.warehouseId ? (item?.stores.find((entry) => entry.warehouseId === form.warehouseId) ?? null) : null;
  const available = store ? store.qty : (item?.onHand ?? 0n);
  const qtyError =
    form.qty.trim() === ''
      ? null
      : qty === null || qty <= 0n
        ? t('issue.qty.bad', 'اكتب كمية أكبر من صفر، بثلاث مراتب عشرية على الأكثر.')
        : item?.baseUnit === 'pc' && qty % 1000n !== 0n
          ? t('issue.qty.pieces', '«{name}» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً.', { name: item.name })
          : item && qty > available
            ? t('issue.qty.over', 'عندك {qty} فقط.', { qty: qtyText(available, item.baseUnit) })
            : null;
  const day = parseDayText(form.day);
  const dayError =
    day === null
      ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
      : day > options.today
        ? t('day.future', 'التاريخ بعد اليوم.')
        : day < options.earliestOn
          ? t('issue.day.old', 'أقدم تاريخ يُقبل للصرف {day}.', { day: fmtDay(options.earliestOn) })
          : null;
  const needStore = item !== null && item.stores.length > 1 && form.warehouseId === null;
  const ready = item !== null && qty !== null && qty > 0n && qtyError === null && day !== null && dayError === null && !needStore;
  return { qty, day, qtyError, dayError, needStore, ready };
}

function IssueDialog({
  options,
  form,
  setForm,
  onClose,
  onSend,
}: {
  options: IssueOptions;
  form: IssueForm;
  setForm: (patch: Partial<IssueForm>) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const id = useId();
  const item = options.items.find((entry) => entry.itemId === form.itemId) ?? null;
  const { qty, qtyError, dayError, needStore, ready } = formProblems(form, item, options);
  const locked = form.busy || form.pending !== null;
  const failure = form.failure;
  const refused = failure instanceof RejectedError ? failure : null;
  const storeAsked = refused?.code === 'store_required';
  const serverDay = refused && DATE_CODES.has(refused.code) ? (refused.hint ?? describeError(refused).detail) : null;
  const shownFailure = failure && !storeAsked && !serverDay && form.pending === null ? (refused?.code === 'insufficient_stock' && refused.hint ? { title: refused.hint, detail: null } : describeError(failure)) : null;
  const effect =
    item && qty !== null && qty > 0n
      ? t('issue.save', 'اصرف {qty} «{item}» لـ«{hall}»', { qty: qtyText(qty, item.baseUnit), item: item.name, hall: options.hallName })
      : t('issue.save_pick', 'اختر المادّة واكتب كميتها');
  return (
    <Dialog
      open
      size="wide"
      onClose={onClose}
      locked={form.busy}
      dirty={(form.itemId !== null || form.qty.trim() !== '') && form.pending === null}
      title={t('issue.title', 'اصرف لـ«{hall}»', { hall: options.hallName })}
      footer={
        <Button size="lg" icon={<PackageMinus className="size-5" aria-hidden="true" />} busy={form.busy} disabled={form.pending === null && !ready} onClick={onSend} data-action="issue-save">
          {form.pending ? t('issue.retry', 'أعد المحاولة') : effect}
        </Button>
      }
    >
      {form.pending ? <Notice tone="warning" title={t('issue.unknown', 'لا نعرف إن سُجّل الصرف: أعد المحاولة؛ لن يُسجَّل مرّتين.')} /> : null}
      {!options.items.length ? (
        <Notice tone="info" title={t('issue.none', 'لا مادّة متاحة للصرف في مخازن نطاقك.')} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-action="issue-cards">
          {options.items.map((entry) => {
            const picked = entry.itemId === form.itemId;
            return (
              <li key={entry.itemId} className={`flex rounded-2xl border p-3 ${picked ? 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/15' : 'border-line'}`}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-1 text-start"
                  aria-pressed={picked}
                  disabled={locked}
                  onClick={() => setForm(picked ? { itemId: null, warehouseId: null, failure: null } : { itemId: entry.itemId, warehouseId: null, failure: null })}
                  data-action="issue-card"
                  data-item={entry.itemId}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="min-w-0 font-semibold">{entry.name}</span>
                    {picked ? <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-brand-700 dark:text-brand-200" /> : <Plus aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />}
                  </span>
                  {entry.madeInMill ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-200" data-action="made-in-mill">
                      <Factory aria-hidden="true" className="size-4" />
                      {t('issue.made_in_mill', 'من إنتاج المعمل')}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-muted">{COST_LABELS[entry.costKind]()}</span>
                  )}
                  <span className="text-xs text-ink-muted" data-action="issue-on-hand">
                    {t('mill.on_hand', 'عندك: {qty}', { qty: qtyText(entry.onHand, entry.baseUnit) })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {item ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-qty`} label={t('issue.qty', 'الكمية ({unit})', { unit: unitWord(item.baseUnit) })} error={qtyError}>
            <input
              id={`${id}-qty`}
              className="input tabular-nums"
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              value={form.qty}
              disabled={locked}
              onChange={(event) => setForm({ qty: event.target.value, failure: null })}
              data-action="issue-qty"
            />
          </Field>
          <DayField id={`${id}-day`} label={t('issue.day', 'يوم الصرف')} value={form.day} error={serverDay ?? dayError} onChange={(text) => setForm({ day: text, failure: null })} />
        </div>
      ) : null}
      {item && (item.stores.length > 1 || storeAsked) ? (
        <div className="flex flex-col gap-2" data-action="issue-stores">
          <p className="text-sm font-medium">{storeAsked && refused?.hint ? refused.hint : t('issue.store', 'من أيّ مخزن تصرف؟')}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('issue.store', 'من أيّ مخزن تصرف؟')}>
            {item.stores.map((store) => (
              <Button
                key={store.warehouseId}
                size="sm"
                variant={form.warehouseId === store.warehouseId ? 'primary' : 'secondary'}
                aria-pressed={form.warehouseId === store.warehouseId}
                disabled={locked}
                onClick={() => setForm({ warehouseId: store.warehouseId, failure: null })}
                data-action="issue-store"
                data-store={store.warehouseId}
              >
                {t('issue.store_option', '{name} ({qty})', { name: store.name, qty: qtyText(store.qty, item.baseUnit) })}
              </Button>
            ))}
          </div>
          {needStore ? <p className="text-xs text-ink-muted">{t('issue.store_need', 'المادّة في أكثر من مخزن: اختر المخزن قبل الصرف.')}</p> : null}
        </div>
      ) : null}
      {shownFailure ? (
        <Notice tone="danger" title={shownFailure.title}>
          {shownFailure.detail}
        </Notice>
      ) : null}
    </Dialog>
  );
}

export default function FlockIssuePage() {
  const { flockId = '' } = useParams();
  const [params] = useSearchParams();
  const back = farmBack(params.get('back'));
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const loadFeed = useCallback(() => loadFlockFeed(flockId), [flockId]);
  const loadOptions = useCallback(() => loadIssueOptions(flockId), [flockId]);
  const feedState = useLoad(loadFeed);
  const optionsState = useLoad(loadOptions);
  const feed = useKept(feedState);
  const options = useKept(optionsState);
  const [open, setOpen] = useState(params.get('open') === '1');
  const [form, setFormState] = useState<IssueForm | null>(null);
  const [voiding, setVoiding] = useState<Voiding | null>(null);
  const setForm = (patch: Partial<IssueForm>) => setFormState((current) => (current ? { ...current, ...patch } : current));
  const canIssue = options?.canIssue === true && role !== null && can(role, 'issue.post');
  // النافذة تُفتح من الرابط (‎?open=1) أو بالزرّ، ونموذجها يولد مرّة بمعرّفاته حين تصل «ما يُصرف».
  if (open && canIssue && options && form === null) setFormState(freshForm(options.today));

  const refresh = () => {
    feedState.retry();
    optionsState.retry();
  };

  const send = async () => {
    if (!form || !options || form.busy) return;
    const item = options.items.find((entry) => entry.itemId === form.itemId) ?? null;
    const { qty, day, ready } = formProblems(form, item, options);
    const retrying = form.pending !== null;
    const input: IssueInput | null =
      form.pending ??
      (ready && item && qty !== null && day !== null
        ? { flockId, itemId: item.itemId, qty, issuedOn: day, warehouseId: form.warehouseId }
        : null);
    if (!input) return;
    setForm({ busy: true, failure: null });
    try {
      const done = await recordFlockIssue(form.ids, input);
      toast({
        tone: 'success',
        title: t('issue.done', 'صُرف {qty} «{item}» لـ«{hall}» من «{store}» ({doc}).', {
          qty: qtyText(done.qty, done.baseUnit),
          item: done.itemName,
          hall: done.hallName,
          store: done.warehouseName,
          doc: done.docNo,
        }),
      });
      setFormState(null);
      setOpen(false);
      refresh();
    } catch (failure) {
      const unknown = failure instanceof UnknownOutcomeError || (retrying && !(failure instanceof RejectedError));
      setForm({ busy: false, failure, pending: unknown ? input : null });
      // رفض المخزن أو الرصيد: «ما يُصرف» تُقرأ من جديد (المخازن وكمياتها الآن)، والمعرّفات تبقى (الرفض لم يكتب شيئاً).
      if (failure instanceof RejectedError && (failure.code === 'store_required' || failure.code === 'insufficient_stock')) optionsState.retry();
    }
  };

  const closeIssue = () => {
    // بعد نتيجة مجهولة: الإغلاق يقرأ الصفحة من جديد، فإن كان الصرف قد سُجّل ظهر في الجدول.
    if (form?.pending) refresh();
    setFormState(null);
    setOpen(false);
  };

  const confirmVoid = async () => {
    if (!voiding || voiding.busy) return;
    const reason = voiding.reason.trim();
    if (!reason) {
      setVoiding({ ...voiding, failure: new RejectedError('reason_required', t('issue.void.reason_need', 'اكتب سبب الإلغاء.')) });
      return;
    }
    setVoiding({ ...voiding, busy: true, failure: null, sent: true });
    try {
      const done = await voidFlockIssue(voiding.issue.id, reason, voiding.ref);
      toast({ tone: 'success', title: t('issue.void.done', 'أُلغي الصرف {doc} ورجعت كميته إلى مخزنها.', { doc: done.docNo }) });
      setVoiding(null);
      refresh();
    } catch (failure) {
      // رفض نهائيّ لم يُلغِ شيئاً: السبب يُصحَّح ويُعاد بمرجع جديد؛ وغيره مجهول: الإعادة بالمرجع والسبب نفسيهما.
      const final = failure instanceof RejectedError;
      setVoiding((current) => (current ? { ...current, busy: false, failure, sent: !final, ref: final ? crypto.randomUUID() : current.ref } : current));
    }
  };

  const money = feed?.money !== null && feed?.money !== undefined;
  const issues = feed?.issues ?? [];
  const columns: Column<FeedIssue>[] = [
    { key: 'day', header: t('issue.col.day', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.issuedOn)}</Num> },
    { key: 'doc', header: t('issue.col.doc', 'المستند'), cell: (row) => <Num>{row.docNo}</Num> },
    { key: 'item', header: t('issue.col.item', 'المادّة'), wrap: true, cell: (row) => row.itemName },
    {
      key: 'qty',
      header: t('issue.col.qty', 'الكمية'),
      kind: 'number',
      cell: (row) => <Num>{fmtQtyCell(row.qty, columnDecimals(issues.map((entry) => entry.qty), 3) as 0 | 1 | 2 | 3)}</Num>,
    },
    { key: 'unit', header: t('issue.col.unit', 'الوحدة'), cell: (row) => unitWord(row.baseUnit) },
    { key: 'store', header: t('issue.col.store', 'المخزن'), wrap: true, cell: (row) => row.warehouseName },
    ...(money
      ? [
          {
            key: 'value',
            header: t('issue.col.value', 'القيمة'),
            kind: 'number' as const,
            cell: (row: FeedIssue) => <Num>{row.money?.value === null || row.money?.value === undefined ? '—' : fmtMoney(row.money.value)}</Num>,
            total: <Num>{feed?.money?.issuedValue === null || feed?.money?.issuedValue === undefined ? '—' : fmtMoney(feed.money.issuedValue)}</Num>,
          },
        ]
      : []),
    {
      key: 'status',
      header: t('issue.col.status', 'الحالة'),
      wrap: true,
      cell: (row) =>
        row.status === 'void' ? (
          <span className="text-sm text-ink-muted" data-action="issue-void-note">
            {t('issue.voided', 'ملغى: {reason}', { reason: row.voidReason ?? '—' })}
          </span>
        ) : feed?.canVoid ? (
          <Button size="sm" variant="ghost" onClick={() => setVoiding({ issue: row, reason: '', ref: crypto.randomUUID(), busy: false, failure: null, sent: false })} data-action="issue-void">
            {t('issue.void', 'ألغِ')}
          </Button>
        ) : (
          t('issue.posted', 'مُرحَّل')
        ),
    },
  ];

  const error = feedState.error ?? optionsState.error;
  const voidFailure = voiding?.failure ? (voiding.failure instanceof RejectedError && voiding.failure.hint ? voiding.failure.hint : `${describeError(voiding.failure).title} ${describeError(voiding.failure).detail}`) : null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={feed ? t('issue.page.title', 'الصرف لـ«{hall}»', { hall: feed.hallName }) : t('issue.page.loading', 'الصرف للقاعة')}
        subtitle={options ? t('issue.page.subtitle', '{site} — تُصرف المادّة من المخزن إلى فوج القاعة بكلفتها.', { site: options.siteName }) : undefined}
        actions={
          back ? (
            <Link to={back} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="issue-back">
              {t('issue.back', 'إلى القاعة')}
            </Link>
          ) : undefined
        }
      />
      {error && !feed ? <LoadFailed what={t('issue.what', 'علف القاعة')} error={error} onRetry={refresh} /> : null}
      {feed ? (
        <section className="card flex flex-col gap-3 p-4">
          <FeedLine feed={feed} />
          {canIssue ? (
            <div>
              <Button
                size="lg"
                icon={<PackageMinus className="size-5" aria-hidden="true" />}
                onClick={() => {
                  setOpen(true);
                  if (options) setFormState(freshForm(options.today));
                }}
                data-action="issue-open"
              >
                {t('issue.open', 'اصرف علفاً أو دواءً')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {feed ? (
        <DataTable
          caption={t('issue.table', 'ما صُرف لهذه القاعة')}
          columns={columns}
          rows={issues}
          rowKey={(row) => row.id}
          empty={t('issue.table.empty', 'لم يُصرف شيء لهذه القاعة بعد.')}
          totalLabel={money ? t('issue.table.total', 'المجموع') : undefined}
        />
      ) : null}
      {open && form && options ? <IssueDialog options={options} form={form} setForm={setForm} onClose={closeIssue} onSend={() => void send()} /> : null}
      {voiding ? (
        <ConfirmDialog
          open
          title={t('issue.void.title', 'إلغاء الصرف {doc}؟', { doc: voiding.issue.docNo })}
          consequence={
            <div className="flex flex-col gap-3">
              <p>
                {t('issue.void.body', 'ترجع {qty} من «{item}» إلى «{store}»، وتُلغى كلفته على الفوج.', {
                  qty: qtyText(voiding.issue.qty, voiding.issue.baseUnit),
                  item: voiding.issue.itemName,
                  store: voiding.issue.warehouseName,
                })}
              </p>
              <Field id="issue-void-reason" label={t('issue.void.reason', 'سبب الإلغاء')} error={voidFailure}>
                <input
                  id="issue-void-reason"
                  className="input"
                  maxLength={500}
                  value={voiding.reason}
                  disabled={voiding.busy || voiding.sent}
                  onChange={(event) => setVoiding({ ...voiding, reason: event.target.value, failure: null })}
                  data-action="issue-void-reason"
                />
              </Field>
            </div>
          }
          confirmLabel={voiding.sent ? t('issue.retry', 'أعد المحاولة') : t('issue.void.confirm', 'ألغِ الصرف')}
          busy={voiding.busy}
          action="issue-void-confirm"
          onConfirm={() => void confirmVoid()}
          onCancel={() => {
            if (voiding.sent) refresh();
            setVoiding(null);
          }}
        />
      ) : null}
    </div>
  );
}
