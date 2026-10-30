import { Plus, Undo2 } from 'lucide-react';
import { useCallback, useId, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { addDays, localDay, type Day } from '../../domain/dates';
import type { DivisionKind } from '../../domain/divisions';
import type { Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { inScope } from '../../domain/scope';
import type { Workspace } from '../../domain/workspace';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as cash from '../../lib/repo/cash';
import type { ExpenseReport, ExpenseRow, ExpenseSource } from '../../lib/repo/cash';
import * as parties from '../../lib/repo/parties';
import type { BookRef, PartyRow } from '../../lib/repo/parties';
import { divisionLabel } from '../../lib/roles';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { bookLabel, CashAccountPicker, DayField, FrozenAttempt, PartyPicker, PeriodFilter, postingDay, recordedToast, useAttempt, VoidDialog, type Sent } from './shared';

// المصاريف (الخطّة WP5، FOUNDATION ٥٥٧، Q13، Q14): المحاسب والمدير يسجّلان مصروفاً على وحدة بتصنيفه وتاريخه (اليوم أو قبله لحد 7
// أيام) وشهره (شهر التاريخ أو قبله، Q14) ومبلغه بالدينار الصحيح، نقداً من صندوق أو بالدين على جهة بدفتر الوحدة؛ والمفقس بلا دفتر
// رئيسي فيسمّى دفتره صراحةً بلا اختيار مسبق. بلا فوج لحد المرحلة 3 (Q13). القائمة ومجاميعها من report_expenses (§2.8)، والإلغاء
// بتأكيد يسمّي المصروف ونتيجته. مصاريف الصرف والجرد تنعرض هنا وتُلغى من مستندها.

/** «10/2026» من أوّل يوم بالشهر (YYYY-MM-01). */
export function monthLabel(month: Day): string {
  return fmtDay(month).slice(3);
}

/** أشهر النسبة المعروضة (Q14): شهر التاريخ واثنا عشر قبله (فاتورة سنوية متأخّرة)؛ المقفل منها كلّه يرفضه الخادم (period_locked). */
export function monthChoices(day: Day): Day[] {
  const out: Day[] = [];
  let month = `${day.slice(0, 7)}-01`;
  for (let i = 0; i < 13; i += 1) {
    out.push(month);
    month = `${addDays(month, -1).slice(0, 7)}-01`;
  }
  return out;
}

export function sourceLabel(source: ExpenseSource): string {
  switch (source) {
    case 'cash':
      return t('expense.source.cash', 'نقداً');
    case 'credit':
      return t('expense.source.credit', 'بالدين');
    case 'stock':
      return t('expense.source.stock', 'من المخزون');
    case 'adjustment':
      return t('expense.source.adjustment', 'تسوية');
  }
}

/** الدفاتر بوحدات نطاق القارئ (مرآة in_scope_division، E40): الخادم يرفض غيرها out_of_scope، فما تنعرض للاختيار. */
export function booksInScope(books: readonly BookRef[], workspace: Pick<Workspace, 'role' | 'scopes'>): BookRef[] {
  return books.filter((book) => inScope(workspace.role, workspace.scopes, { divisionId: book.divisionId }));
}

/** «المجموع بشهر النسبة من 09/2026 إلى 11/2026»: التقرير يجمع بالشهر اللي ينتسب إليه المصروف، فالمدّة أشهر كاملة. */
export function expenseSpanLabel(from: Day, to: Day): string {
  return t('expense.total.months', 'المجموع بشهر النسبة من {from} إلى {to}', { from: monthLabel(`${from.slice(0, 7)}-01`), to: monthLabel(`${to.slice(0, 7)}-01`) });
}

/** الوحدات من دفاترها (المفقس بدفترين). */
export function divisionsOf(books: readonly BookRef[]): { id: string; kind: DivisionKind }[] {
  const seen = new Map<string, DivisionKind>();
  for (const book of books) seen.set(book.divisionId, book.divisionKind);
  return [...seen.entries()].map(([id, kind]) => ({ id, kind }));
}

interface ExpenseForm {
  divisionId: string;
  categoryId: string;
  amount: string;
  day: string;
  month: string;
  source: 'cash' | 'credit';
  accountId: string;
  party: PartyRow | null;
  bookId: string;
  note: string;
}

/** جملة التأكيد: التصنيف والمبلغ والوحدة والتاريخ والشهر والمصدر. */
export function expenseSentence(input: { category: string; division: string; amount: Fils; day: Day; month: Day; source: 'cash' | 'credit'; payee: string }): string {
  const vars = { category: input.category, division: input.division, amount: fmtMoney(input.amount, 0), day: fmtDay(input.day), month: monthLabel(input.month), payee: input.payee };
  return input.source === 'cash'
    ? t('expense.sentence.cash', 'مصروف «{category}» {amount} دينار على «{division}» بتاريخ {day} لشهر {month}، نقداً من «{payee}».', vars)
    : t('expense.sentence.credit', 'مصروف «{category}» {amount} دينار على «{division}» بتاريخ {day} لشهر {month}، بالدين على «{payee}».', vars);
}

/** المشاكل لكل حقل، أو المعطيات الجاهزة للإرسال. */
export function expenseProblems(form: ExpenseForm, hatcheryIds: ReadonlySet<string>, today: Day = localDay()): { input: cash.ExpenseInput | null; errors: Partial<Record<keyof ExpenseForm, string>> } {
  const errors: Partial<Record<keyof ExpenseForm, string>> = {};
  if (!form.divisionId) errors.divisionId = t('expense.division.required', 'اختر الوحدة.');
  if (!form.categoryId) errors.categoryId = t('expense.category.required', 'اختر التصنيف.');
  const amount = parseMoneyText(form.amount);
  if (amount === null || amount <= 0n) errors.amount = t('expense.amount.required', 'اكتب المبلغ بالدينار الصحيح، أكبر من صفر.');
  else if (amount % 100n !== 0n) errors.amount = t('expense.amount.whole', 'المبلغ بالدينار الصحيح، بلا فلوس.');
  const day = postingDay(form.day, today);
  if (day.error) errors.day = day.error;
  if (day.day && form.month && !monthChoices(day.day).includes(form.month)) errors.month = t('expense.month.invalid', 'الشهر شهر التاريخ أو قبله.');
  if (form.source === 'cash' && !form.accountId) errors.accountId = t('expense.account.required', 'اختر الصندوق.');
  if (form.source === 'credit' && !form.party) errors.party = t('expense.party.required', 'اختر الجهة.');
  if (form.source === 'credit' && hatcheryIds.has(form.divisionId) && !form.bookId) errors.bookId = t('expense.book.required', 'اختر «حساب الأفراخ» أو «حساب بيض التفقيس».');
  if (Object.keys(errors).length > 0 || amount === null || !day.day) return { input: null, errors };
  return {
    input: {
      categoryId: form.categoryId,
      divisionId: form.divisionId,
      amount,
      onDate: day.day,
      forMonth: form.month || null,
      source: form.source,
      accountId: form.source === 'cash' ? form.accountId : null,
      partyId: form.source === 'credit' ? (form.party?.id ?? null) : null,
      bookId: form.source === 'credit' && hatcheryIds.has(form.divisionId) ? form.bookId : null,
      siteId: null,
      note: form.note.trim() || null,
    },
    errors,
  };
}

function ExpenseDialog({ books, onClose, onSaved }: { books: readonly BookRef[]; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const categories = useLoad(cash.listExpenseCategories, 'expense-categories');
  const from = useMemo(() => `${localDay().slice(0, 4)}-01-01`, []);
  const loadBoxes = useCallback(() => cash.loadCashBalances(from, null), [from]);
  const boxes = useLoad(loadBoxes, 'boxes');
  const [form, setForm] = useState<ExpenseForm>({ divisionId: '', categoryId: '', amount: '', day: fmtDay(localDay()), month: '', source: 'cash', accountId: '', party: null, bookId: '', note: '' });
  const [errors, setErrors] = useState<ReturnType<typeof expenseProblems>['errors']>({});
  const { attempt, run } = useAttempt<cash.ExpenseInput>('expense');
  const [checked, setChecked] = useState<Sent<cash.ExpenseInput> | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const divisions = divisionsOf(books);
  const hatcheryIds = new Set(divisions.filter((d) => d.kind === 'hatchery').map((d) => d.id));
  const division = divisions.find((d) => d.id === form.divisionId);
  const hatcheryBooks = books.filter((book) => book.divisionId === form.divisionId && hatcheryIds.has(book.divisionId));
  const choosable = (categories.data ?? []).filter((c) => !c.archived && c.systemCode === null);
  const set = (patch: Partial<ExpenseForm>) => setForm((current) => ({ ...current, ...patch }));
  const parsedDay = postingDay(form.day).day;
  const review = (event: FormEvent) => {
    event.preventDefault();
    const { input, errors: found } = expenseProblems(form, hatcheryIds);
    setErrors(found);
    // «input === null» مو النفي بعلامة التعجّب: Tailwind يقرا ذاك صنفاً مهمّاً ويولّد له CSS بالحزمة المحفوظة (درس WP3).
    if (input === null) return;
    const category = choosable.find((c) => c.id === input.categoryId)?.name ?? '—';
    const payee = input.source === 'cash' ? ((boxes.data?.accounts ?? []).find((box) => box.accountId === input.accountId)?.name ?? '—') : (form.party?.name ?? '—');
    setChecked({
      input,
      summary: expenseSentence({ category, division: division ? divisionLabel(division.kind) : '—', amount: input.amount, day: input.onDate, month: input.forMonth ?? `${input.onDate.slice(0, 7)}-01`, source: input.source, payee }),
    });
  };
  const post = async (sent: Sent<cash.ExpenseInput>) => {
    setBusy(true);
    setFailure(null);
    const outcome = await run(sent, (ref, input) => cash.recordExpense(ref, input));
    setBusy(false);
    setChecked(null);
    if (outcome.kind === 'posted') onSaved();
    else if (outcome.kind === 'recorded') {
      recordedToast();
      onSaved();
    } else setFailure(outcome.error);
  };
  const title = t('expense.new', 'مصروف جديد');
  if (attempt.frozen) {
    const sent = attempt.frozen;
    const failed = failure ? describeError(failure) : null;
    return (
      <Dialog
        open
        onClose={onClose}
        title={title}
        locked={busy}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('attempt.later', 'لاحقاً')}
            </Button>
            <Button busy={busy} onClick={() => void post(sent)} data-action="retry-expense">
              {t('attempt.retry', 'أعد المحاولة')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <FrozenAttempt sent={sent} />
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        </div>
      </Dialog>
    );
  }
  const failed = failure ? describeError(failure) : null;
  const formId = `${id}-form`;
  return (
    <>
      <Dialog
        open={checked === null}
        onClose={onClose}
        title={title}
        dirty={form.amount !== '' || form.categoryId !== '' || form.note !== ''}
        locked={busy}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('confirm.cancel', 'لا، تراجع')}
            </Button>
            <Button type="submit" form={formId} busy={busy} disabled={!categories.data || !boxes.data} data-action="review-expense">
              {t('openings.save', 'سجّل')}
            </Button>
          </div>
        }
      >
        <form id={formId} className="flex flex-col gap-4" onSubmit={review} noValidate>
          {categories.error ? <LoadFailed what={t('expense.categories', 'تصنيفات المصاريف')} error={categories.error} onRetry={categories.retry} /> : null}
          {boxes.error ? <LoadFailed what={t('cash.list', 'قائمة الصناديق')} error={boxes.error} onRetry={boxes.retry} /> : null}
          <Field id={`${id}-division`} label={t('expense.division', 'الوحدة')} error={errors.divisionId}>
            <select id={`${id}-division`} className="input" value={form.divisionId} onChange={(event) => set({ divisionId: event.target.value, bookId: '' })} data-autofocus>
              <option value="">{t('expense.division.pick', 'اختر الوحدة')}</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {divisionLabel(d.kind)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${id}-category`} label={t('expense.category', 'التصنيف')} error={errors.categoryId} hint={categories.data && choosable.length === 0 ? t('expense.category.empty', 'لا تصنيف بعد؛ أضفه من إعدادات المنشأة.') : undefined}>
            <select id={`${id}-category`} className="input" value={form.categoryId} onChange={(event) => set({ categoryId: event.target.value })}>
              <option value="">{t('expense.category.pick', 'اختر التصنيف')}</option>
              {choosable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <MoneyInput id={`${id}-amount`} label={t('payment.amount', 'المبلغ (دينار)')} value={form.amount} onChange={(amount) => set({ amount })} error={errors.amount} />
          <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={form.day} onChange={(day) => set({ day, month: '' })} error={errors.day} />
          <Field id={`${id}-month`} label={t('expense.month', 'الشهر الذي ينتسب إليه')} error={errors.month} hint={t('expense.month.hint', 'فاتورة متأخّرة تُنسب لشهرها ما دام غير مقفل.')}>
            <select id={`${id}-month`} className="input" value={form.month} onChange={(event) => set({ month: event.target.value })} disabled={!parsedDay}>
              <option value="">{parsedDay ? t('expense.month.same', 'شهر التاريخ ({month})', { month: monthLabel(`${parsedDay.slice(0, 7)}-01`) }) : t('expense.month.need_day', 'اكتب التاريخ أوّلاً')}</option>
              {parsedDay
                ? monthChoices(parsedDay)
                    .slice(1)
                    .map((month) => (
                      <option key={month} value={month}>
                        {monthLabel(month)}
                      </option>
                    ))
                : null}
            </select>
          </Field>
          <Segmented
            label={t('expense.source', 'طريقة الدفع')}
            options={[
              { value: 'cash', label: t('expense.source.cash', 'نقداً') },
              { value: 'credit', label: t('expense.source.credit', 'بالدين') },
            ]}
            value={form.source}
            onChange={(source) => set({ source })}
          />
          {form.source === 'cash' ? (
            <CashAccountPicker id={`${id}-box`} label={t('expense.box', 'من صندوق')} accounts={boxes.data?.accounts ?? null} value={form.accountId} onChange={(accountId) => set({ accountId })} error={errors.accountId} />
          ) : (
            <>
              <PartyPicker id={`${id}-party`} value={form.party} onChange={(party) => set({ party })} />
              {errors.party ? <p className="text-sm text-danger-700 dark:text-danger-200">{errors.party}</p> : null}
              {hatcheryIds.has(form.divisionId) ? (
                <HatcheryBookSelect id={`${id}-book`} books={hatcheryBooks} value={form.bookId} onChange={(bookId) => set({ bookId })} error={errors.bookId} />
              ) : division ? (
                <p className="text-sm text-ink-muted">{t('expense.book.main', 'يُسجَّل بحساب «{division}».', { division: divisionLabel(division.kind) })}</p>
              ) : null}
            </>
          )}
          <Field id={`${id}-note`} label={t('expense.note', 'ملاحظة')}>
            <input id={`${id}-note`} className="input" maxLength={500} value={form.note} onChange={(event) => set({ note: event.target.value })} />
          </Field>
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        </form>
      </Dialog>
      {checked ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('expense.confirm.title', 'تسجيل المصروف')}
          consequence={checked.summary}
          confirmLabel={t('expense.confirm', 'سجّل المصروف')}
          cancelLabel={t('payment.back', 'ارجع إلى الورقة')}
          busy={busy}
          action="confirm-expense"
          onCancel={() => setChecked(null)}
          onConfirm={() => void post(checked)}
        />
      ) : null}
    </>
  );
}

/** دفتر مصروف المفقس بالدين: «دفتر الأفراخ» أو «دفتر بيض التفقيس» بلا اختيار مسبق (الخطّة WP5؛ الخادم book_required بلاه). */
export function HatcheryBookSelect({ id, books, value, onChange, error }: { id: string; books: readonly BookRef[]; value: string; onChange: (bookId: string) => void; error?: string }) {
  return (
    <Field id={id} label={t('book.pick', 'الحساب')} error={error} hint={t('expense.book.hatchery', 'للمفقس حسابان؛ اختر حساب هذا المصروف.')}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} data-action="pick-hatchery-book">
        <option value="">{t('book.pick.none', 'اختر الحساب')}</option>
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {bookLabel(book)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** جملة الإلغاء: المصروف والمبلغ ونتيجته على الصندوق أو الجهة. */
export function expenseVoidSentence(row: ExpenseRow): string {
  const vars = { category: row.categoryName, amount: fmtMoney(row.amount, 0), payee: row.accountName ?? row.partyName ?? '—' };
  return row.source === 'cash'
    ? t('expense.void.cash', 'يُلغى مصروف «{category}» {amount} دينار بصفّ عكسي بتاريخ اليوم، ويرجع المبلغ إلى «{payee}».', vars)
    : t('expense.void.credit', 'يُلغى مصروف «{category}» {amount} دينار بحركة تلغي السابقة بتاريخ اليوم، على «{payee}».', vars);
}

export default function ExpensesPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const today = localDay();
  const [period, setPeriod] = useState<{ from: Day; to: Day }>({ from: `${today.slice(0, 7)}-01`, to: today });
  const [divisionId, setDivisionId] = useState('');
  const [tick, setTick] = useState(0);
  const load = useCallback(() => cash.loadExpenses(period.from, period.to, divisionId || null), [period, divisionId]);
  const report = useLoad(load, `${period.from}|${period.to}|${divisionId}|${tick}`);
  const books = useLoad(parties.listBooks, 'books');
  const [pages, setPages] = useState<{ key: string; list: ExpenseReport[] }>({ key: '', list: [] });
  const [more, setMore] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  // زرّ «مصروف» بالرئيسية يفتح النافذة مباشرةً (?new=1)، والإغلاق يشيل العلامة.
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<'new' | ExpenseRow | null>(() => (params.get('new') === '1' && workspace && can(workspace.role, 'expense.post') ? 'new' : null));
  const closeDialog = () => {
    setDialog(null);
    if (params.has('new')) setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('new');
      return next;
    }, { replace: true });
  };
  const key = `${period.from}|${period.to}|${divisionId}|${tick}`;
  const all = report.data ? [report.data, ...(pages.key === key ? pages.list : [])] : [];
  const rows = all.flatMap((page) => page.rows);
  const next = all.at(-1)?.next ?? null;
  const loadMore = () => {
    if (!next) return;
    setMore({ busy: true, error: null });
    cash.loadExpenses(period.from, period.to, divisionId || null, next).then(
      (page) => {
        setPages((current) => ({ key, list: [...(current.key === key ? current.list : []), page] }));
        setMore({ busy: false, error: null });
      },
      (error: unknown) => setMore({ busy: false, error }),
    );
  };
  const scopedBooks = books.data && workspace ? booksInScope(books.data, workspace) : null;
  const divisions = scopedBooks ? divisionsOf(scopedBooks) : [];
  const divisionKind = new Map(divisions.map((d) => [d.id, d.kind]));
  const canPost = workspace ? can(workspace.role, 'expense.post') : false;
  const canVoid = workspace ? can(workspace.role, 'void') : false;
  const changed = () => {
    closeDialog();
    setTick((n) => n + 1);
  };
  const columns: Column<ExpenseRow>[] = [
    { key: 'day', header: t('ledger.date', 'التاريخ'), cell: (row) => fmtDay(row.onDate) },
    { key: 'month', header: t('expense.col.month', 'الشهر'), cell: (row) => monthLabel(row.forMonth) },
    { key: 'category', header: t('expense.category', 'التصنيف'), cell: (row) => row.categoryName },
    { key: 'division', header: t('expense.division', 'الوحدة'), cell: (row) => (divisionKind.has(row.divisionId) ? divisionLabel(divisionKind.get(row.divisionId) as DivisionKind) : '—') },
    {
      key: 'source',
      header: t('expense.source', 'طريقة الدفع'),
      cell: (row) =>
        row.source === 'cash'
          ? t('expense.col.cash', 'نقداً من «{box}»', { box: row.accountName ?? '—' })
          : row.source === 'credit'
            ? t('expense.col.credit', 'بالدين على «{party}»', { party: row.partyName ?? '—' })
            : row.docNo
              ? t('expense.col.doc', '{source} — {no}', { source: sourceLabel(row.source), no: row.docNo })
              : sourceLabel(row.source),
    },
    { key: 'note', header: t('expense.col.note', 'البيان'), cell: (row) => (row.reverses ? t('expense.col.reversal', 'إلغاء: {reason}', { reason: row.reason ?? '' }) : (row.note ?? '')) },
    { key: 'amount', header: t('expense.col.amount', 'المبلغ (دينار)'), kind: 'number', cell: (row) => <Num><MoneyText amount={row.amount} /></Num> },
  ];
  if (canVoid) {
    columns.unshift({
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (row) =>
        (row.source === 'cash' || row.source === 'credit') && !row.reverses && !row.reversed ? (
          <IconButton label={t('expense.void', 'ألغِ المصروف')} onClick={() => setDialog(row)} data-action="void-expense">
            <Undo2 aria-hidden="true" className="size-4" />
          </IconButton>
        ) : null,
    });
  }
  const totals = report.data?.totals ?? null;
  const categoryColumns: Column<cash.ExpenseTotals['byCategory'][number]>[] = [
    { key: 'name', header: t('expense.category', 'التصنيف'), cell: (row) => row.name },
    { key: 'amount', header: t('expense.col.amount', 'المبلغ (دينار)'), kind: 'number', cell: (row) => <Num><MoneyText amount={row.amount} /></Num> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('expense.title', 'المصاريف')}
        subtitle={t('expense.subtitle', 'كل مصروف على وحدة بتصنيفه والشهر الذي ينتسب إليه؛ والمجاميع من الخادم بأشهر المدّة كاملةً.')}
        actions={
          canPost ? (
            <Button icon={<Plus aria-hidden="true" className="size-4" />} disabled={!scopedBooks || scopedBooks.length === 0} onClick={() => setDialog('new')} data-action="new-expense">
              {t('expense.new', 'مصروف جديد')}
            </Button>
          ) : null
        }
      />
      <PeriodFilter from={period.from} to={period.to} onApply={setPeriod} />
      <Field id="expense-division-filter" label={t('expense.division', 'الوحدة')}>
        <select id="expense-division-filter" className="input" value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>
          <option value="">{t('expense.division.all', 'كل الوحدات')}</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {divisionLabel(d.kind)}
            </option>
          ))}
        </select>
      </Field>
      {report.error ? (
        <LoadFailed what={t('expense.list', 'المصاريف')} error={report.error} onRetry={report.retry} />
      ) : report.data && totals ? (
        <>
          <p className="text-sm">
            {expenseSpanLabel(report.data.from, report.data.to)}:{' '}
            <MoneyText amount={totals.total} className="font-semibold" />
          </p>
          {report.data.divisions.visible < report.data.divisions.total ? (
            <Notice
              tone="info"
              title={t('expense.scoped', 'المجاميع لوحدات نطاقك فقط: {visible} من {total}.', { visible: fmtInt(report.data.divisions.visible), total: fmtInt(report.data.divisions.total) })}
            />
          ) : null}
          <DataTable caption={t('expense.by_category', 'المصاريف حسب التصنيف')} columns={categoryColumns} rows={totals.byCategory} rowKey={(row) => row.categoryId} empty={t('expense.empty', 'لا مصاريف في هذه المدّة.')} />
          <DataTable caption={t('expense.list', 'المصاريف')} columns={columns} rows={rows} rowKey={(row) => row.id} empty={t('expense.empty', 'لا مصاريف في هذه المدّة.')} />
          {next ? (
            <Button variant="secondary" busy={more.busy} onClick={loadMore} data-action="more-expenses">
              {t('stock.board.more', 'المزيد')}
            </Button>
          ) : null}
          {more.error ? <LoadFailed what={t('expense.list', 'المصاريف')} error={more.error} onRetry={loadMore} /> : null}
        </>
      ) : null}
      {dialog === 'new' && scopedBooks && scopedBooks.length > 0 ? <ExpenseDialog books={scopedBooks} onClose={closeDialog} onSaved={changed} /> : null}
      {dialog && dialog !== 'new' ? (
        <VoidDialog
          slot={`expense:${dialog.id}`}
          title={t('expense.void.title', 'ألغِ مصروف «{category}»', { category: dialog.categoryName })}
          consequence={expenseVoidSentence(dialog)}
          run={(clientRef, reason) => cash.voidExpense(clientRef, dialog.id, reason)}
          onClose={() => setDialog(null)}
          onDone={changed}
        />
      ) : null}
      {!canPost && !report.error && rows.length === 0 && report.data ? <Notice tone="info" title={t('expense.readonly', 'التسجيل للمحاسب والمدير ومالك المنشأة.')} /> : null}
      {failedNote(report.error)}
    </div>
  );
}

/** رفض القراءة (forbidden): المصاريف لأدوار الكلفة. */
function failedNote(error: unknown) {
  return error instanceof RejectedError && error.code === 'forbidden' ? <Notice tone="info" title={t('expense.forbidden', 'المصاريف للمالك والمدير والمحاسب فقط.')} /> : null;
}
