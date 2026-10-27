import { useCallback, useDeferredValue, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Num } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { SideToggle, type Side } from '../../components/ui/SideToggle';
import { toast } from '../../components/ui/Toast';
import { addDays, localDay, type Day } from '../../domain/dates';
import type { DivisionKind } from '../../domain/divisions';
import type { Fils } from '../../domain/money';
import { parseDayText } from '../../lib/dayText';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtDay, fmtInt, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as cash from '../../lib/repo/cash';
import type { CashBalance, CashKind, CashMoveKind } from '../../lib/repo/cash';
import * as parties from '../../lib/repo/parties';
import type { AllocationPreview, BookCode, BookRef, EntryKind, PartyFields, PartyRow, PartyTwin, PostRef } from '../../lib/repo/parties';
import { divisionLabel } from '../../lib/roles';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';

// قطع صفحات الحسابات (خطّة المرحلة 1 WP3، FOUNDATION ٧٨٨): أسماء الدفاتر والأنواع، والمبلغ بكلمته «عليه» أو «له» دائماً (اللون
// مساعد مو بديل)، وحقل اليوم والمدّة، ومنتقيات الدفتر والصندوق والجهة (القائمة الفاشلة ترمي: نافذتها بلا إرسال، FOUNDATION ٨٠٧)،
// ونوافذ «قبضنا» و«دفعنا» (الدفتر أوّلاً بلا اختيار مسبق، ثم المعاينة تسمّي القيود المسدودة والفائض، ثم تأكيد يسمّي الجهة والدفتر
// والمبلغ)، والتسوية والإعفاء بنفس المعاينة والتأكيد (FOUNDATION ٧٧٠)، والإلغاء بسببه، والجهة بتوائمها (تنبيه ثم سماح، Q2). وكل
// ترحيل بمحاولة مرجعها ثابت: «ما نعرف» تجمّد المعطيات المرسلة لحد ما تنعرف النتيجة (FOUNDATION ٥١٩).

// ─── الأسماء ───────────────────────────────────────────────────────────────────────────────────────────────────

/** اسم الدفتر بالعرض: دفتر الوحدة باسمها، ودفترا المفقس باسميهما. */
export function bookLabel(book: { divisionKind: DivisionKind; code: BookCode }): string {
  if (book.code === 'chicks') return t('book.chicks', 'المفقس: الأفراخ');
  if (book.code === 'hatching_eggs') return t('book.hatching_eggs', 'المفقس: بيض التفقيس');
  return divisionLabel(book.divisionKind);
}

/** فلتر الصفحة (FOUNDATION ٧٨٨): الكل، ثم الوحدات، والمفقس بدفتريه. */
export const DIVISION_FILTER: readonly ('all' | DivisionKind)[] = ['all', 'feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'];

export function divisionFilterLabel(kind: 'all' | DivisionKind): string {
  switch (kind) {
    case 'all':
      return t('accounts.filter.all', 'الكل');
    case 'feed_mill':
      return t('accounts.filter.mill', 'المعمل');
    case 'broiler':
      return t('accounts.filter.broiler', 'اللحم');
    case 'layer':
      return t('accounts.filter.layer', 'البيض');
    case 'hatchery':
      return t('accounts.filter.hatchery', 'المفقس (أفراخ / بيض تفقيس)');
    case 'medicine':
      return t('accounts.filter.medicine', 'الأدوية');
    case 'general':
      return t('accounts.filter.general', 'المخازن العامة');
  }
}

export function entryKindLabel(kind: EntryKind): string {
  switch (kind) {
    case 'invoice':
      return t('entry.kind.invoice', 'فاتورة بيع');
    case 'purchase':
      return t('entry.kind.purchase', 'استلام');
    case 'bill':
      return t('entry.kind.bill', 'مصروف بالدين');
    case 'payment':
      return t('entry.kind.payment', 'قبض');
    case 'payout':
      return t('entry.kind.payout', 'دفع');
    case 'return':
      return t('entry.kind.return', 'مرتجع بيع');
    case 'supplier_return':
      return t('entry.kind.supplier_return', 'مرتجع للمورّد');
    case 'forgiveness':
      return t('entry.kind.forgiveness', 'إعفاء');
    case 'opening':
      return t('entry.kind.opening', 'رصيد افتتاحي');
    case 'adjustment':
      return t('entry.kind.adjustment', 'تسوية');
    case 'offset':
      return t('entry.kind.offset', 'مقاصّة');
  }
}

export function cashMoveKindLabel(kind: CashMoveKind): string {
  switch (kind) {
    case 'party_payment':
      return t('cash.kind.party_payment', 'قبض من جهة');
    case 'party_payout':
      return t('cash.kind.party_payout', 'دفع لجهة');
    case 'receipt_paid':
      return t('cash.kind.receipt_paid', 'دفعة استلام');
    case 'receipt_charge':
      return t('cash.kind.receipt_charge', 'مصروف استلام');
    case 'expense':
      return t('cash.kind.expense', 'مصروف');
    case 'opening':
      return t('cash.kind.opening', 'رصيد افتتاحي');
    case 'transfer':
      return t('cash.kind.transfer', 'نقل بين الصناديق');
  }
}

export function cashKindLabel(kind: CashKind): string {
  switch (kind) {
    case 'cash':
      return t('cash.account.cash', 'نقد');
    case 'bank':
      return t('cash.account.bank', 'مصرف');
    case 'wallet':
      return t('cash.account.wallet', 'محفظة');
  }
}

/**
 * مبلغ الدفتر بجهته (FOUNDATION ٧٨٨): «عليه 1,460,000» أو «له 65,000» بالكلمة دائماً، والصفر «—». الرقم LTR معزول والكلمة
 * عربية بجنبه، والعمود بالدينار الصحيح.
 */
export function SideAmount({ amount }: { amount: Fils }) {
  if (amount === 0n) return <>—</>;
  const word = amount > 0n ? t('ledger.side.debit', 'عليه') : t('ledger.side.credit', 'له');
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-ink-muted">{word}</span>
      <Num>{fmtMoney(amount < 0n ? -amount : amount, 0)}</Num>
    </span>
  );
}

// ─── اليوم والمدّة ─────────────────────────────────────────────────────────────────────────────────────────────

/** المدّة الافتراضية للكشف (E26): السنة الجارية لحد اليوم. */
export function defaultPeriod(today: Day = localDay()): { from: Day; to: Day } {
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

/** تاريخ الترحيل: اليوم أو قبله لحد 7 أيام (القرار 9). يرجّع اليوم أو رسالة الخطأ. */
export function postingDay(text: string, today: Day = localDay()): { day: Day | null; error: string | null } {
  const day = parseDayText(text);
  if (!day) return { day: null, error: t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') };
  if (day > today) return { day: null, error: t('day.future', 'التاريخ بعد اليوم.') };
  if (day < addDays(today, -7)) return { day: null, error: t('day.too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ {day}.', { day: fmtDay(addDays(today, -7)) }) };
  return { day, error: null };
}

export function DayField({ id, label, value, onChange, error, hint }: { id: string; label: string; value: string; onChange: (text: string) => void; error?: string | null; hint?: string }) {
  return (
    <Field id={id} label={label} error={error} hint={hint ?? t('day.hint', 'يوم/شهر/سنة.')}>
      <input id={id} inputMode="numeric" dir="ltr" autoComplete="off" placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')} className="input tabular-nums" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

/** مدّة الكشف: من وإلى، وتنطبق بزرّ (الكتابة ما تطلب الخادم بكل حرف). */
export function PeriodFilter({ from, to, onApply }: { from: Day; to: Day; onApply: (period: { from: Day; to: Day }) => void }) {
  const id = useId();
  const [fromText, setFromText] = useState(fmtDay(from));
  const [toText, setToText] = useState(fmtDay(to));
  const [error, setError] = useState<string | null>(null);
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const start = parseDayText(fromText);
    const end = parseDayText(toText);
    if (!start || !end || start > end) {
      setError(t('period.invalid', 'اكتب المدّة: من تاريخ إلى تاريخ لا يسبقه، يوم/شهر/سنة.'));
      return;
    }
    setError(null);
    onApply({ from: start, to: end });
  };
  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={apply} noValidate data-print="hide">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <DayField id={`${id}-from`} label={t('period.from', 'من')} value={fromText} onChange={setFromText} error={error} />
        <DayField id={`${id}-to`} label={t('period.to', 'إلى')} value={toText} onChange={setToText} />
      </div>
      <Button type="submit" variant="secondary" data-action="apply-period">
        {t('period.apply', 'اعرض المدّة')}
      </Button>
    </form>
  );
}

// ─── المنتقيات (القائمة الفاشلة ترمي: النافذة تعرض الفشل وتمنع الإرسال) ─────────────────────────────────────────────

export function BookPicker({ id, books, value, onChange, error }: { id: string; books: readonly BookRef[]; value: string; onChange: (bookId: string) => void; error?: string | null }) {
  return (
    <Field id={id} label={t('book.pick', 'الدفتر')} hint={t('book.pick.hint', 'كل قيد بدفتر وحدة، ورصيد دفتر لا يسدّد دين دفتر آخر.')} error={error}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} data-autofocus>
        <option value="">{t('book.pick.none', 'اختر الدفتر')}</option>
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {bookLabel(book)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** accounts = null: القائمة لسّه تتحمّل، فما يكول «لا صندوق» قبل قراءة ناجحة (FOUNDATION ٧٦٧). */
export function CashAccountPicker({ id, label, accounts, value, onChange, error }: { id: string; label: string; accounts: readonly CashBalance[] | null; value: string; onChange: (accountId: string) => void; error?: string | null }) {
  const active = (accounts ?? []).filter((account) => !account.archived);
  return (
    <Field id={id} label={label} error={error} hint={accounts !== null && active.length === 0 ? t('cash.pick.empty', 'لا صندوق فعّالاً بعد؛ أضفه من صفحة الصناديق.') : undefined}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('cash.pick.none', 'اختر الصندوق')}</option>
        {active.map((account) => (
          <option key={account.accountId} value={account.accountId}>
            {t('cash.pick.option', '{name} (الرصيد {balance})', { name: account.name, balance: fmtMoney(account.closing, 0) })}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** منتقي الجهة: بحث بالاسم، وأوّل 20 نتيجة، وإذا بالمجموع أكثر «20 من المجموع N» ويّا «اكتب أكثر» (FOUNDATION ٧٧٥). */
export function PartyPicker({ id, value, onChange }: { id: string; value: PartyRow | null; onChange: (party: PartyRow | null) => void }) {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const load = useCallback(() => parties.searchParties(deferred), [deferred]);
  const found = useLoad(load, deferred);
  if (value) {
    return (
      <Field id={id} label={t('party.pick', 'الجهة')}>
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2">
          <span className="font-medium">{value.name}</span>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)} data-action="change-party">
            {t('party.pick.change', 'غيّر')}
          </Button>
        </div>
      </Field>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Field id={id} label={t('party.pick', 'الجهة')}>
        <input id={id} type="search" className="input" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('party.pick.search', 'ابحث بالاسم')} />
      </Field>
      {found.error ? (
        <LoadFailed what={t('party.list', 'قائمة الجهات')} error={found.error} onRetry={found.retry} />
      ) : (
        <ul className="flex max-h-48 flex-col overflow-y-auto rounded-2xl border border-line">
          {(found.data?.parties ?? []).map((party) => (
            <li key={party.id}>
              <button type="button" className="w-full px-4 py-2 text-start hover:bg-surface-2" onClick={() => onChange(party)} data-action="pick-party">
                {party.name}
              </button>
            </li>
          ))}
          {found.data && found.data.parties.length === 0 ? <li className="px-4 py-2 text-sm text-ink-muted">{t('party.pick.empty', 'لا جهة بهذا الاسم.')}</li> : null}
        </ul>
      )}
      {found.data && found.data.total > found.data.parties.length ? (
        <p role="status" className="text-sm text-ink-muted" data-capped>
          {t('party.pick.capped', '{shown} من المجموع {total}؛ اكتب أكثر من الاسم لتضييق البحث.', { shown: fmtInt(found.data.parties.length), total: fmtInt(found.data.total) })}
        </p>
      ) : null}
    </div>
  );
}

// ─── المحاولة بمرجع ثابت (FOUNDATION ٥١٩، §2.2) ─────────────────────────────────────────────────────────────────
// «ما نعرف شنو صار» (UnknownOutcomeError) والخادم ممكن ثبّت: مرجع جديد أو معطيات معدّلة بعدها يضاعف المبلغ (ref_reused كان يطلع
// مرجعاً جديداً). فالمعطيات المرسلة تتجمّد ويّا مرجعها، والإعادة بيها بالضبط (تسأل الخادم بالمرجع القديم)، حتى لو انسدّت النافذة
// وانفتحت (المحاولة المجمّدة باقية بالذاكرة لحد ما تنعرف نتيجتها). ref_reused = المرجع انحجز لعملية سُجّلت.

/** المعطيات المرسلة وجملتها للعرض. */
export interface Sent<I> {
  input: I;
  summary: string;
}

/** المرجع، والمعطيات المجمّدة إذا أُرسلت ونتيجتها مجهولة. */
export interface Attempt<I> {
  ref: PostRef;
  frozen: Sent<I> | null;
}

export const freshAttempt = <I,>(): Attempt<I> => ({ ref: parties.newRef(), frozen: null });

/**
 * المحاولة بعد فشل الإرسال: الرفض الأكيد (المعاملة رجعت ويّا المرجع) مرجع جديد والنموذج حرّ؛ «ما نعرف» تجمّد المعطيات ويّا
 * مرجعها؛ ref_reused = سُجّلت من قبل؛ وغيره (ما طلع، أو رجع لتزاحم، أو الهويّة) نفس المحاولة كما هي.
 */
export function afterFailure<I>(attempt: Attempt<I>, sent: Sent<I>, caught: unknown): Attempt<I> | 'recorded' {
  if (caught instanceof RejectedError) return caught.code === 'ref_reused' ? 'recorded' : freshAttempt<I>();
  if (caught instanceof UnknownOutcomeError) return { ref: attempt.ref, frozen: sent };
  return attempt;
}

export type AttemptOutcome<R> = { kind: 'posted'; result: R } | { kind: 'recorded' } | { kind: 'failed'; error: unknown };

/** يرسل بمرجع المحاولة، ويرجّع النتيجة والمحاولة الجاية (نجح أو سُجّل ← محاولة جديدة). */
export async function runAttempt<I, R>(attempt: Attempt<I>, sent: Sent<I>, post: (ref: PostRef, input: I) => Promise<R>): Promise<{ next: Attempt<I>; outcome: AttemptOutcome<R> }> {
  try {
    return { next: freshAttempt<I>(), outcome: { kind: 'posted', result: await post(attempt.ref, sent.input) } };
  } catch (caught) {
    const next = afterFailure(attempt, sent, caught);
    return next === 'recorded' ? { next: freshAttempt<I>(), outcome: { kind: 'recorded' } } : { next, outcome: { kind: 'failed', error: caught } };
  }
}

// المحاولات المجمّدة بالذاكرة (لكل مستخدم ونافذة): تبقى بعد إغلاق النافذة لحد ما تنعرف نتيجتها.
const frozenAttempts = new Map<string, Attempt<unknown>>();

export function rememberAttempt<I>(slot: string, attempt: Attempt<I>): void {
  if (attempt.frozen) frozenAttempts.set(slot, attempt as Attempt<unknown>);
  else frozenAttempts.delete(slot);
}

export function recalledAttempt<I>(slot: string): Attempt<I> {
  return (frozenAttempts.get(slot) as Attempt<I> | undefined) ?? freshAttempt<I>();
}

/** محاولة النافذة بخانتها (المستخدم واسم النافذة): المجمّدة ترجع لمّا النافذة تنفتح من جديد. */
export function useAttempt<I>(name: string) {
  const session = useSession();
  const slot = `${session.status === 'ready' ? session.workspace.userId : ''}|${name}`;
  const [attempt, setAttempt] = useState<Attempt<I>>(() => recalledAttempt<I>(slot));
  const run = async <R,>(sent: Sent<I>, post: (ref: PostRef, input: I) => Promise<R>): Promise<AttemptOutcome<R>> => {
    const { next, outcome } = await runAttempt(attempt, sent, post);
    rememberAttempt(slot, next);
    setAttempt(next);
    return outcome;
  };
  return { attempt, run };
}

/** نافذة بمحاولة مجمّدة: المعطيات ما تتعدّل، والإعادة بيها بس. */
export function FrozenAttempt({ sent }: { sent: Sent<unknown> }) {
  return (
    <Notice tone="warning" title={t('attempt.unknown.title', 'لم تُعرف نتيجة المحاولة السابقة')}>
      {t('attempt.unknown.detail', '{summary} أعد المحاولة بالبيانات نفسها: إن كانت سُجّلت فلن تتكرّر، وإلا تُسجَّل الآن. لا تسجّلها من جديد ببيانات أخرى قبل أن تُعرف نتيجتها.', { summary: sent.summary })}
    </Notice>
  );
}

/** «سُجّلت من محاولة سابقة»: المرجع انحجز لعملية ثبتت (ref_reused)، فالقوائم تتحدّث بدل عملية ثانية. */
export function recordedToast(): void {
  toast({ tone: 'warning', title: t('attempt.recorded', 'سُجّلت العملية من محاولة سابقة'), detail: t('attempt.recorded.detail', 'حُدّثت القوائم؛ راجع الكشف قبل أي تسجيل آخر.') });
}

// ─── «قبضنا» و«دفعنا» ─────────────────────────────────────────────────────────────────────────────────────────

export type PaymentKind = 'payment' | 'payout';

/** حالة نموذج القبض أو الدفع، ومشاكله قبل المعاينة (نفس قواعد الخادم: الدفتر والمبلغ والصندوق والتاريخ). */
export interface PaymentForm {
  party: PartyRow | null;
  bookId: string;
  amount: string;
  accountId: string;
  day: string;
}

export function paymentProblems(form: PaymentForm, today: Day = localDay()): { input: parties.PaymentInput | null; errors: Partial<Record<'party' | 'book' | 'amount' | 'account' | 'day', string>> } {
  const errors: Partial<Record<'party' | 'book' | 'amount' | 'account' | 'day', string>> = {};
  if (!form.party) errors.party = t('party.required', 'اختر الجهة.');
  if (!form.bookId) errors.book = t('book.required', 'اختر الدفتر أوّلاً.');
  const amount = parseMoneyText(form.amount);
  if (amount === null || amount <= 0n) errors.amount = t('money.required', 'اكتب مبلغاً أكبر من صفر بالدينار الصحيح.');
  if (!form.accountId) errors.account = t('cash.required', 'اختر الصندوق.');
  const day = postingDay(form.day, today);
  if (day.error) errors.day = day.error;
  if (Object.keys(errors).length || !form.party || amount === null || !day.day) return { input: null, errors };
  return { input: { partyId: form.party.id, bookId: form.bookId, amount, accountId: form.accountId, onDate: day.day }, errors };
}

/** «سيصير رصيد الصندوق سالباً» قبل الدفع (Q10: مسموح ويّا تنبيه). */
export function negativeAfter(kind: PaymentKind, account: CashBalance | undefined, amount: Fils): Fils | null {
  if (!account || kind !== 'payout') return null;
  const after = account.closing - amount;
  return after < 0n ? after : null;
}

export function PaymentDialog({ kind, party: initialParty, onClose, onPosted }: { kind: PaymentKind; party: PartyRow | null; onClose: () => void; onPosted: () => void }) {
  const id = useId();
  const books = useLoad(parties.listBooks, 'books');
  // أرصدة الصناديق لحد يوم الخادم (to = null): نافذة مفتوحة من أمس ما تبين رصيد أمس.
  const from = useMemo(() => defaultPeriod().from, []);
  const loadBoxes = useCallback(() => cash.loadCashBalances(from, null), [from]);
  const boxes = useLoad(loadBoxes, 'boxes');
  const [form, setForm] = useState<PaymentForm>({ party: initialParty, bookId: '', amount: '', accountId: '', day: fmtDay(localDay()) });
  const [errors, setErrors] = useState<ReturnType<typeof paymentProblems>['errors']>({});
  // المعرّف والمرجع مولودان مرّة، ويبقون لحد ما تنعرف النتيجة (FOUNDATION ٥١٩): «ما نعرف» تجمّد المعطيات المرسلة نفسها.
  const { attempt, run } = useAttempt<parties.PaymentInput>(`pay:${kind}`);
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const listsFailed = Boolean(books.error || boxes.error);
  const listsReady = Boolean(books.data && boxes.data);
  const { input } = paymentProblems(form);
  const set = (patch: Partial<PaymentForm>) => {
    setForm({ ...form, ...patch });
    setPreview(null);
  };
  const dirty = form.amount !== '' || form.bookId !== '' || form.accountId !== '';
  const book = books.data?.find((option) => option.id === form.bookId);
  const account = boxes.data?.accounts.find((option) => option.accountId === form.accountId);
  const sentence = input && form.party && book ? paymentSentence(kind, form.party.name, bookLabel(book), input.amount) : '';

  const review = async (event: FormEvent) => {
    event.preventDefault();
    const checked = paymentProblems(form);
    setErrors(checked.errors);
    setFailure(null);
    if (!checked.input || listsFailed) return;
    setBusy(true);
    try {
      setPreview(await parties.previewAllocation(checked.input.partyId, checked.input.bookId, kind, checked.input.amount));
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const post = async (sent: Sent<parties.PaymentInput>) => {
    setBusy(true);
    setFailure(null);
    const outcome = await run(sent, (ref, payment) => (kind === 'payment' ? parties.recordPayment(ref, payment) : parties.payParty(ref, payment)));
    setBusy(false);
    setPreview(null);
    if (outcome.kind === 'posted') {
      const doc = outcome.result.docNo ?? '';
      toast({ tone: 'success', title: kind === 'payment' ? t('payment.done', 'سُجّل القبض {doc}', { doc }) : t('payout.done', 'سُجّل الدفع {doc}', { doc }) });
      onPosted();
    } else if (outcome.kind === 'recorded') {
      recordedToast();
      onPosted();
    } else {
      setFailure(outcome.error);
    }
  };

  const title = kind === 'payment' ? t('payment.title', 'قبضنا') : t('payout.title', 'دفعنا');
  const failed = failure ? describeError(failure) : null;
  const formId = `${id}-form`;
  const negative = input ? negativeAfter(kind, account, input.amount) : null;
  if (attempt.frozen) {
    const sent = attempt.frozen;
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
            <Button busy={busy} onClick={() => void post(sent)} data-action={kind === 'payment' ? 'retry-payment' : 'retry-payout'}>
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
  return (
    <>
      <Dialog
        open={preview === null}
        onClose={onClose}
        title={title}
        dirty={dirty}
        locked={busy}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('confirm.cancel', 'لا، تراجع')}
            </Button>
            <Button type="submit" form={formId} busy={busy} disabled={!listsReady || listsFailed} data-action={kind === 'payment' ? 'review-payment' : 'review-payout'}>
              {t('payment.review', 'عاين التوزيع')}
            </Button>
          </div>
        }
      >
        <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void review(event)} noValidate>
          <PartyPicker id={`${id}-party`} value={form.party} onChange={(party) => set({ party })} />
          {errors.party ? <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">{errors.party}</p> : null}
          {books.error ? (
            <LoadFailed what={t('book.list', 'قائمة الدفاتر')} error={books.error} onRetry={books.retry} />
          ) : (
            <BookPicker id={`${id}-book`} books={books.data ?? []} value={form.bookId} onChange={(bookId) => set({ bookId })} error={errors.book} />
          )}
          <MoneyInput id={`${id}-amount`} label={t('payment.amount', 'المبلغ (دينار)')} value={form.amount} onChange={(amount) => set({ amount })} error={errors.amount} />
          {boxes.error ? (
            <LoadFailed what={t('cash.list', 'قائمة الصناديق')} error={boxes.error} onRetry={boxes.retry} />
          ) : (
            <CashAccountPicker id={`${id}-box`} label={t('payment.box', 'الصندوق')} accounts={boxes.data?.accounts ?? null} value={form.accountId} onChange={(accountId) => set({ accountId })} error={errors.account} />
          )}
          <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={form.day} onChange={(day) => set({ day })} error={errors.day} hint={t('payment.day.hint', 'اليوم أو قبله حتى 7 أيام.')} />
          {negative !== null ? (
            <Notice tone="warning" title={t('cash.negative.title', 'سيصير رصيد الصندوق سالباً')}>
              {t('cash.negative.detail', 'رصيده بعد الدفع {balance}. السالب مسموح، فتأكّد أن الصندوق هو الصحيح.', { balance: fmtMoney(negative, 0) })}
            </Notice>
          ) : null}
          {listsFailed ? <Notice tone="danger" title={t('payment.lists_failed', 'لا يُرسل شيء قبل تحميل الدفاتر والصناديق')} /> : null}
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        </form>
      </Dialog>
      {preview !== null && input && form.party && book ? (
        <ConfirmDialog
          open
          tone="primary"
          title={kind === 'payment' ? t('payment.confirm.title', 'تسجيل قبض من «{party}»', { party: form.party.name }) : t('payout.confirm.title', 'تسجيل دفع لـ«{party}»', { party: form.party.name })}
          consequence={<AllocationSummary sentence={sentence} preview={preview} />}
          confirmLabel={kind === 'payment' ? t('payment.confirm', 'سجّل القبض') : t('payout.confirm', 'سجّل الدفع')}
          cancelLabel={t('payment.back', 'عُد إلى النموذج')}
          busy={busy}
          action={kind === 'payment' ? 'confirm-payment' : 'confirm-payout'}
          onCancel={() => setPreview(null)}
          onConfirm={() => void post({ input, summary: sentence })}
        />
      ) : null}
    </>
  );
}

/** جملة القبض أو الدفع: المبلغ والجهة والدفتر (التأكيد والمحاولة المجمّدة). */
export function paymentSentence(kind: PaymentKind, party: string, book: string, amount: Fils): string {
  return kind === 'payment'
    ? t('payment.summary', 'قبض {amount} دينار من «{party}» بدفتر «{book}».', { amount: fmtMoney(amount, 0), party, book })
    : t('payout.summary', 'دفع {amount} دينار لـ«{party}» بدفتر «{book}».', { amount: fmtMoney(amount, 0), party, book });
}

/** المعاينة بكلماتها: الجملة (الجهة والدفتر والمبلغ)، وكل قيد يُسدّ بحصّته، والفائض بدفتره، ورصيد الجهة بعدها. */
export function AllocationSummary({ sentence, preview }: { sentence: string; preview: AllocationPreview }) {
  return (
    <div className="flex flex-col gap-3">
      <p>{sentence}</p>
      {preview.allocations.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {preview.allocations.map((line) => (
            <li key={line.entryId} className="flex items-center justify-between gap-3">
              <span>
                {entryKindLabel(line.kind)} {line.docNo ? <bdi dir="ltr">{line.docNo}</bdi> : null} <Num>{fmtDay(line.onDate)}</Num>
              </span>
              <Num>{fmtMoney(line.amount, 0)}</Num>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">{t('payment.summary.none', 'لا قيد مفتوحاً مقابلاً يُسدّ به.')}</p>
      )}
      {preview.surplus > 0n ? <p className="text-sm">{t('payment.summary.surplus', 'الفائض {amount} يبقى رصيداً للجهة بالدفتر نفسه.', { amount: fmtMoney(preview.surplus, 0) })}</p> : null}
      <p className="text-sm">
        {t('payment.summary.after', 'رصيد الجهة بالدفتر بعدها:')} <SideAmount amount={preview.balanceAfter} />
      </p>
    </div>
  );
}

// ─── التسوية والإعفاء (party.adjust) والإلغاء (void) ────────────────────────────────────────────────────────────

export type AdjustMode = 'adjust' | 'forgive';

export interface AdjustInput {
  partyId: string;
  bookId: string;
  direction: Side;
  amount: Fils;
  onDate: Day;
  reason: string;
}

/**
 * معاينة التسوية أو الإعفاء بنفس محرّك الترحيل (FOUNDATION ٧٧٠، القاعدة 27): التسوية بمبلغها موقّعاً (debit «عليه» موجب،
 * credit «له» سالب)، والإعفاء بمبلغه موجباً والخادم يعكس إشارة الرصيد.
 */
export function adjustPreviewArgs(mode: AdjustMode, input: Pick<AdjustInput, 'direction' | 'amount'>): { kind: 'adjustment' | 'forgiveness'; amount: Fils } {
  if (mode === 'forgive') return { kind: 'forgiveness', amount: input.amount };
  return { kind: 'adjustment', amount: input.direction === 'debit' ? input.amount : -input.amount };
}

/** جملة التسوية أو الإعفاء: الجهة والدفتر والمبلغ (والجهة «عليه» أو «له» للتسوية). */
export function adjustSentence(mode: AdjustMode, party: string, book: string, input: Pick<AdjustInput, 'direction' | 'amount'>): string {
  const amount = fmtMoney(input.amount, 0);
  if (mode === 'forgive') return t('forgive.summary', 'إعفاء «{party}» من {amount} دينار بدفتر «{book}».', { party, amount, book });
  return input.direction === 'debit'
    ? t('adjust.summary.debit', 'تسوية «عليه» {amount} دينار على «{party}» بدفتر «{book}».', { party, amount, book })
    : t('adjust.summary.credit', 'تسوية «له» {amount} دينار لـ«{party}» بدفتر «{book}».', { party, amount, book });
}

export function AdjustDialog({ mode, party, book, onClose, onPosted }: { mode: AdjustMode; party: { id: string; name: string }; book: BookRef; onClose: () => void; onPosted: () => void }) {
  const id = useId();
  const [side, setSide] = useState<Side>('debit');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(fmtDay(localDay()));
  const [reason, setReason] = useState('');
  const { attempt, run } = useAttempt<AdjustInput>(`${mode}:${party.id}:${book.id}`);
  const [checked, setChecked] = useState<{ input: AdjustInput; preview: AllocationPreview } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bookName = bookLabel(book);
  // الإدخال يتغيّر: المعاينة القديمة ما تنفع.
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setChecked(null);
  };

  const review = async (event: FormEvent) => {
    event.preventDefault();
    const value = parseMoneyText(amount);
    const date = postingDay(day);
    if (value === null || value <= 0n || date.error || !date.day || !reason.trim()) {
      setProblem(date.error ?? (reason.trim() ? t('money.required', 'اكتب مبلغاً أكبر من صفر بالدينار الصحيح.') : t('reason.required', 'اكتب السبب.')));
      return;
    }
    setProblem(null);
    setBusy(true);
    setFailure(null);
    const input: AdjustInput = { partyId: party.id, bookId: book.id, direction: side, amount: value, onDate: date.day, reason: reason.trim() };
    const args = adjustPreviewArgs(mode, input);
    try {
      setChecked({ input, preview: await parties.previewAllocation(party.id, book.id, args.kind, args.amount) });
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const post = async (sent: Sent<AdjustInput>) => {
    setBusy(true);
    setFailure(null);
    const outcome = await run(sent, (ref, input) =>
      mode === 'adjust'
        ? parties.adjust(ref, input)
        : parties.forgive(ref, { partyId: input.partyId, bookId: input.bookId, amount: input.amount, onDate: input.onDate, reason: input.reason }),
    );
    setBusy(false);
    setChecked(null);
    if (outcome.kind === 'posted') onPosted();
    else if (outcome.kind === 'recorded') {
      recordedToast();
      onPosted();
    } else setFailure(outcome.error);
  };

  const failed = failure ? describeError(failure) : null;
  const formId = `${id}-form`;
  const title = mode === 'adjust' ? t('adjust.title', 'تسوية لـ«{party}» بدفتر «{book}»', { party: party.name, book: bookName }) : t('forgive.title', 'إعفاء «{party}» بدفتر «{book}»', { party: party.name, book: bookName });
  if (attempt.frozen) {
    const sent = attempt.frozen;
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
            <Button busy={busy} onClick={() => void post(sent)} data-action={mode === 'adjust' ? 'retry-adjust' : 'retry-forgive'}>
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
  const sentence = checked ? adjustSentence(mode, party.name, bookName, checked.input) : '';
  return (
    <>
      <Dialog
        open={checked === null}
        onClose={onClose}
        title={title}
        dirty={amount !== '' || reason !== ''}
        locked={busy}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('confirm.cancel', 'لا، تراجع')}
            </Button>
            <Button type="submit" form={formId} busy={busy} data-action={mode === 'adjust' ? 'review-adjust' : 'review-forgive'}>
              {t('payment.review', 'عاين التوزيع')}
            </Button>
          </div>
        }
      >
        <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void review(event)} noValidate>
          {mode === 'adjust' ? <SideToggle label={t('adjust.side', 'الجهة')} value={side} onChange={edit(setSide)} /> : <p className="text-sm text-ink-muted">{t('forgive.detail', 'الإعفاء بعكس رصيد الدفتر، ولا يزيد عليه.')}</p>}
          <MoneyInput id={`${id}-amount`} label={t('payment.amount', 'المبلغ (دينار)')} value={amount} onChange={edit(setAmount)} autoFocus />
          <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={day} onChange={edit(setDay)} hint={t('payment.day.hint', 'اليوم أو قبله حتى 7 أيام.')} />
          <Field id={`${id}-reason`} label={t('reason', 'السبب')}>
            <input id={`${id}-reason`} className="input" maxLength={500} value={reason} onChange={(event) => edit(setReason)(event.target.value)} />
          </Field>
          {problem ? <Notice tone="danger" title={problem} /> : null}
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        </form>
      </Dialog>
      {checked ? (
        <ConfirmDialog
          open
          tone="primary"
          title={mode === 'adjust' ? t('adjust.confirm.title', 'تسجيل تسوية لـ«{party}»', { party: party.name }) : t('forgive.confirm.title', 'تسجيل إعفاء «{party}»', { party: party.name })}
          consequence={<AllocationSummary sentence={sentence} preview={checked.preview} />}
          confirmLabel={mode === 'adjust' ? t('adjust.confirm', 'سجّل التسوية') : t('forgive.confirm', 'سجّل الإعفاء')}
          cancelLabel={t('payment.back', 'عُد إلى النموذج')}
          busy={busy}
          action={mode === 'adjust' ? 'confirm-adjust' : 'confirm-forgive'}
          onCancel={() => setChecked(null)}
          onConfirm={() => void post({ input: checked.input, summary: sentence })}
        />
      ) : null}
    </>
  );
}

/**
 * إلغاء بسببه: تأكيد يسمّي الشي ونتيجته (CLAUDE.md: لا window.confirm). run ياخذ مرجعاً ثابتاً لحد ما تنعرف النتيجة، و«ما نعرف»
 * تجمّد السبب المرسل (الإعادة بيه بس، حتى بعد إغلاق النافذة). slot يسمّي الشي الملغى (نوعه ومعرّفه).
 */
export function VoidDialog({ slot, title, consequence, run: send, onClose, onDone }: { slot: string; title: string; consequence: ReactNode; run: (clientRef: string, reason: string) => Promise<unknown>; onClose: () => void; onDone: () => void }) {
  const id = useId();
  const [reason, setReason] = useState('');
  const { attempt, run } = useAttempt<string>(`void:${slot}`);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    const sent = attempt.frozen ?? { input: reason.trim(), summary: t('void.sent', '{title} بسبب «{reason}».', { title, reason: reason.trim() }) };
    if (!sent.input) {
      setFailure(new RejectedError('reason_required', t('reason.required', 'اكتب السبب.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    const outcome = await run(sent, (ref, why) => send(ref.clientRef, why));
    setBusy(false);
    if (outcome.kind === 'posted') onDone();
    else if (outcome.kind === 'recorded') {
      recordedToast();
      onDone();
    } else setFailure(outcome.error);
  };
  const failed = failure ? describeError(failure) : null;
  return (
    <ConfirmDialog
      open
      title={title}
      consequence={
        <div className="flex flex-col gap-3">
          <div>{consequence}</div>
          {attempt.frozen ? (
            <FrozenAttempt sent={attempt.frozen} />
          ) : (
            <Field id={`${id}-reason`} label={t('reason', 'السبب')}>
              <input id={`${id}-reason`} className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          )}
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        </div>
      }
      confirmLabel={attempt.frozen ? t('attempt.retry', 'أعد المحاولة') : t('void.confirm', 'ألغِ')}
      busy={busy}
      action={attempt.frozen ? 'retry-void' : 'confirm-void'}
      onCancel={onClose}
      onConfirm={() => void confirm()}
    />
  );
}

// ─── الجهة (إضافة وتعديل بتوائمها، Q2) ────────────────────────────────────────────────────────────────────────────

export interface PartyFormState {
  name: string;
  phone: string;
  isCustomer: boolean;
  isSupplier: boolean;
}

export function partyFields(form: PartyFormState): PartyFields {
  return { name: form.name.trim(), phone: form.phone.trim() || null, is_customer: form.isCustomer, is_supplier: form.isSupplier };
}

/** الحقول المتغيّرة بس عن النسخة اللي انفتحت (FOUNDATION ٨١٧). */
export function changedPartyFields(before: PartyFields, after: PartyFields): Partial<PartyFields> {
  const patch: Partial<PartyFields> = {};
  for (const key of Object.keys(after) as (keyof PartyFields)[]) {
    if (before[key] !== after[key]) Object.assign(patch, { [key]: after[key] });
  }
  return patch;
}

/** التوائم بعد استثناء الجهة نفسها: نفس الاسم أو نفس الهاتف تنبيه يمرّ بالتأكيد. */
export function partyTwinsOf(twins: readonly PartyTwin[], selfId: string | null): PartyTwin[] {
  return twins.filter((twin) => twin.id !== selfId);
}

export function PartyDialog({ party, onClose, onSaved }: { party: PartyRow | null; onClose: () => void; onSaved: (party: PartyRow) => void }) {
  const id = useId();
  const initial: PartyFormState = { name: party?.name ?? '', phone: party?.phone ?? '', isCustomer: party?.isCustomer ?? true, isSupplier: party?.isSupplier ?? false };
  const [form, setForm] = useState(initial);
  const [twins, setTwins] = useState<PartyTwin[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = partyFields(form);
  const patch = changedPartyFields(partyFields(initial), fields);
  const dirty = Object.keys(patch).length > 0;
  const confirmed = twins !== null && twins.length > 0;
  const set = (next: Partial<PartyFormState>) => {
    setForm({ ...form, ...next });
    setTwins(null);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!fields.name) {
      setProblem(t('constraint.parties_name_check', 'اسم الجهة مطلوب، ولا يزيد على 120 حرفاً.'));
      return;
    }
    setProblem(null);
    setBusy(true);
    setFailure(null);
    try {
      if (!confirmed && (patch.name !== undefined || patch.phone !== undefined || !party)) {
        const found = partyTwinsOf(await parties.findPartyTwins(fields.name, fields.phone), party?.id ?? null);
        if (found.length) {
          setTwins(found);
          return;
        }
      }
      onSaved(party ? await parties.updateParty(party.id, party.version, patch) : await parties.createParty(fields));
    } catch (caught) {
      setFailure(caught);
    } finally {
      setBusy(false);
    }
  };
  const failed = failure ? describeError(failure, 'once') : null;
  const formId = `${id}-form`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={party ? t('party.edit.title', 'تعديل «{name}»', { name: party.name }) : t('party.new', 'جهة جديدة')}
      dirty={dirty}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} disabled={party !== null && !dirty} data-action={confirmed ? 'save-party-twin' : 'save-party'}>
            {confirmed ? t('party.save.twin', 'احفظ رغم التشابه') : t('org.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        <Field id={`${id}-name`} label={t('party.name', 'اسم الجهة')} error={problem}>
          <input id={`${id}-name`} className="input" maxLength={120} value={form.name} onChange={(event) => set({ name: event.target.value })} data-autofocus />
        </Field>
        <Field id={`${id}-phone`} label={t('party.phone', 'الهاتف')} hint={<bdi dir="ltr">0770 123 4567</bdi>}>
          <input id={`${id}-phone`} className="input" dir="ltr" inputMode="tel" autoComplete="off" maxLength={40} value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-brand-600" checked={form.isCustomer} onChange={(event) => set({ isCustomer: event.target.checked })} />
          {t('party.customer', 'زبون')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-brand-600" checked={form.isSupplier} onChange={(event) => set({ isSupplier: event.target.checked })} />
          {t('party.supplier', 'مورّد')}
        </label>
        {twins?.length ? (
          <Notice tone="warning" title={t('party.twins', 'جهة مشابهة موجودة')}>
            {t('party.twins.detail', 'تشبهها: {names}. احفظ إن كانت جهة أخرى فعلاً.', {
              names: twins.map((twin) => (twin.archived ? t('party.archived.name', '{name} (مؤرشفة)', { name: twin.name }) : twin.name)).join(t('list.separator', '، ')),
            })}
          </Notice>
        ) : null}
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      </form>
    </Dialog>
  );
}
