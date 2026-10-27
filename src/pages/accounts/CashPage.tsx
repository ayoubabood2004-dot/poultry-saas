import { ArrowLeftRight, Plus } from 'lucide-react';
import { useCallback, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyInput, parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import type { Day } from '../../domain/dates';
import { localDay } from '../../domain/dates';
import type { Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError, RejectedError, ZeroRowsError } from '../../lib/errors';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { parseDayText } from '../../lib/dayText';
import * as cash from '../../lib/repo/cash';
import type { CashBalance, CashBalances, CashKind } from '../../lib/repo/cash';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { CashAccountPicker, cashKindLabel, DayField, defaultPeriod, FrozenAttempt, postingDay, recordedToast, useAttempt, type Sent } from './shared';

// الصناديق (خطّة المرحلة 1 WP3، Q10): كل صندوق برصيده (مجموع حركاته بالقاعدة)، والسالب مسموح ويّا تنبيه ظاهر؛ والرصيد الافتتاحي
// (المدير، بيوم تشغيل أقدم وحدة أو قبله)، والنقل بين الصناديق (المحاسب أو المدير)، وكل واحد بتأكيد يسمّي الصندوق والمبلغ ومحاولة
// بمرجع ثابت؛ والإضافة والتسمية والأرشفة (صندوق بلا رصيد بس، E35)، والمؤرشف وعليه رصيد بعلامته (E43). المجموع من الخادم مو من
// الصفوف، والأرصدة لحد يوم الخادم.

export function boxName(box: Pick<CashBalance, 'name' | 'archived' | 'closing'>): string {
  if (!box.archived) return box.name;
  return box.closing !== 0n ? t('cash.archived.owing', '{name} (مؤرشف وعليه رصيد)', { name: box.name }) : t('cash.archived', '{name} (مؤرشف)', { name: box.name });
}

export function CashTable({ balances, actions }: { balances: CashBalances; actions?: (box: CashBalance) => ReactNode }) {
  const columns: Column<CashBalance>[] = [
    { key: 'name', header: t('cash.col.name', 'الصندوق'), cell: (box) => <Link className="font-medium text-brand-700 dark:text-brand-200" to={`/accounts/cash/${box.accountId}`}>{boxName(box)}</Link> },
    { key: 'kind', header: t('cash.col.kind', 'النوع'), cell: (box) => cashKindLabel(box.kind) },
    { key: 'in', header: t('ledger.cash.in', 'وارد'), kind: 'number', cell: (box) => <Num>{fmtMoney(box.inflow, 0)}</Num>, total: <Num>{fmtMoney(balances.total.inflow, 0)}</Num> },
    { key: 'out', header: t('ledger.cash.out', 'صادر'), kind: 'number', cell: (box) => <Num>{fmtMoney(box.outflow, 0)}</Num>, total: <Num>{fmtMoney(balances.total.outflow, 0)}</Num> },
    {
      key: 'balance',
      header: t('ledger.balance', 'الرصيد'),
      kind: 'number',
      cell: (box) => (
        <span className="inline-flex items-center gap-2">
          {box.closing < 0n ? <span className="text-xs font-semibold text-danger-700 dark:text-danger-300">{t('cash.negative', 'سالب')}</span> : null}
          <Num>{fmtMoney(box.closing, 0)}</Num>
        </span>
      ),
      total: <Num>{fmtMoney(balances.total.closing, 0)}</Num>,
    },
  ];
  if (actions) columns.unshift({ key: 'actions', header: t('org.col.actions', 'إجراءات'), cell: actions });
  return <DataTable caption={t('cash.title', 'الصناديق')} columns={columns} rows={balances.accounts} rowKey={(box) => box.accountId} empty={t('cash.empty', 'لا صناديق بعد.')} totalLabel={t('ledger.total', 'المجموع')} />;
}

function AccountDialog({ box, onClose, onSaved }: { box: CashBalance | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [name, setName] = useState(box?.name ?? '');
  const [kind, setKind] = useState<CashKind>(box?.kind ?? 'cash');
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setFailure(new RejectedError('name_required', t('constraint.cash_accounts_name_check', 'اسم الصندوق مطلوب، ولا يزيد على 80 حرفاً.')));
      return;
    }
    setBusy(true);
    setFailure(null);
    (box ? cash.renameCashAccount(box.accountId, box.version, name) : cash.createCashAccount(name, kind))
      .then(onSaved, setFailure)
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  const formId = `${id}-form`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={box ? t('cash.rename.title', 'تسمية «{name}»', { name: box.name }) : t('cash.new', 'صندوق جديد')}
      dirty={name !== (box?.name ?? '')}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} data-action="save-cash-account">
            {t('org.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field id={`${id}-name`} label={t('cash.col.name', 'الصندوق')}>
          <input id={`${id}-name`} className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} data-autofocus />
        </Field>
        {box ? null : (
          <Field id={`${id}-kind`} label={t('cash.col.kind', 'النوع')}>
            <select id={`${id}-kind`} className="input" value={kind} onChange={(event) => setKind(event.target.value as CashKind)}>
              {cash.CASH_KINDS.map((option) => (
                <option key={option} value={option}>
                  {cashKindLabel(option)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      </form>
    </Dialog>
  );
}

/** جملة الافتتاح: الصندوق والمبلغ بإشارته واليوم (التأكيد والمحاولة المجمّدة). */
export function cashOpeningSentence(box: string, amount: Fils, day: Day): string {
  return amount < 0n
    ? t('cash.opening.summary.negative', 'رصيد افتتاحي سالب {amount} دينار لـ«{box}» بتاريخ {day}.', { box, amount: fmtMoney(-amount, 0), day: fmtDay(day) })
    : t('cash.opening.summary', 'رصيد افتتاحي {amount} دينار لـ«{box}» بتاريخ {day}.', { box, amount: fmtMoney(amount, 0), day: fmtDay(day) });
}

/** جملة النقل: من والى والمبلغ واليوم. */
export function transferSentence(from: string, to: string, amount: Fils, day: Day): string {
  return t('cash.transfer.summary', 'نقل {amount} دينار من «{from}» إلى «{to}» بتاريخ {day}.', { from, to, amount: fmtMoney(amount, 0), day: fmtDay(day) });
}

/** نافذة المحاولة المجمّدة (نتيجتها مجهولة): الإعادة بنفس المعطيات بس. */
function FrozenDialog({ title, sent, busy, failure, action, onRetry, onClose }: { title: string; sent: Sent<unknown>; busy: boolean; failure: unknown; action: string; onRetry: () => void; onClose: () => void }) {
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
          <Button busy={busy} onClick={onRetry} data-action={action}>
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

interface OpeningInput {
  accountId: string;
  amount: Fils;
  onDate: Day;
}

/** الرصيد الافتتاحي للصندوق: موقّع (المصرف يكدر يبدي بالسالب)، بيوم تشغيل أقدم وحدة أو قبله، ثم تأكيد يسمّي الصندوق والمبلغ. */
export function OpeningDialog({ box, onClose, onSaved }: { box: CashBalance; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [amount, setAmount] = useState('');
  const [negative, setNegative] = useState(false);
  const [day, setDay] = useState('');
  const { attempt, run } = useAttempt<OpeningInput>(`cash-opening:${box.accountId}`);
  const [checked, setChecked] = useState<Sent<OpeningInput> | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const title = t('cash.opening.title', 'الرصيد الافتتاحي لـ«{name}»', { name: box.name });
  const review = (event: FormEvent) => {
    event.preventDefault();
    const value = parseMoneyText(amount);
    const date = parseDayText(day);
    if (value === null || value <= 0n || !date) {
      setFailure(new RejectedError('fields', t('cash.opening.fields', 'اكتب المبلغ بالدينار الصحيح والتاريخ يوم/شهر/سنة (يوم التشغيل أو قبله).')));
      return;
    }
    setFailure(null);
    const signed = negative ? -value : value;
    setChecked({ input: { accountId: box.accountId, amount: signed, onDate: date }, summary: cashOpeningSentence(box.name, signed, date) });
  };
  const post = async (sent: Sent<OpeningInput>) => {
    setBusy(true);
    setFailure(null);
    const outcome = await run(sent, (ref, input) => cash.recordCashOpening(ref, input));
    setBusy(false);
    setChecked(null);
    if (outcome.kind === 'posted') onSaved();
    else if (outcome.kind === 'recorded') {
      recordedToast();
      onSaved();
    } else setFailure(outcome.error);
  };
  if (attempt.frozen) {
    const sent = attempt.frozen;
    return <FrozenDialog title={title} sent={sent} busy={busy} failure={failure} action="retry-cash-opening" onRetry={() => void post(sent)} onClose={onClose} />;
  }
  const failed = failure ? describeError(failure) : null;
  const formId = `${id}-form`;
  return (
    <>
      <Dialog
        open={checked === null}
        onClose={onClose}
        title={title}
        dirty={amount !== '' || day !== ''}
        locked={busy}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('confirm.cancel', 'لا، تراجع')}
            </Button>
            <Button type="submit" form={formId} busy={busy} data-action="review-cash-opening">
              {t('openings.save', 'سجّل')}
            </Button>
          </div>
        }
      >
        <form id={formId} className="flex flex-col gap-4" onSubmit={review} noValidate>
          <MoneyInput id={`${id}-amount`} label={t('payment.amount', 'المبلغ (دينار)')} value={amount} onChange={setAmount} autoFocus />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-brand-600" checked={negative} onChange={(event) => setNegative(event.target.checked)} />
            {t('cash.opening.negative', 'الرصيد سالب (سحب على المكشوف)')}
          </label>
          <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={day} onChange={setDay} hint={t('cash.opening.day', 'يوم تشغيل أقدم وحدة أو قبله.')} />
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        </form>
      </Dialog>
      {checked ? (
        <ConfirmDialog
          open
          tone="primary"
          title={t('cash.opening.confirm.title', 'تسجيل افتتاح «{name}»', { name: box.name })}
          consequence={checked.summary}
          confirmLabel={t('cash.opening.confirm', 'سجّل الافتتاح')}
          cancelLabel={t('payment.back', 'عُد إلى النموذج')}
          busy={busy}
          action="confirm-cash-opening"
          onCancel={() => setChecked(null)}
          onConfirm={() => void post(checked)}
        />
      ) : null}
    </>
  );
}

interface TransferInput {
  fromId: string;
  toId: string;
  amount: Fils;
  onDate: Day;
  note: string | null;
}

/** النقل بين صندوقين، ثم تأكيد يسمّي الصندوقين والمبلغ. */
export function TransferDialog({ accounts, onClose, onSaved }: { accounts: readonly CashBalance[]; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(fmtDay(localDay()));
  const [note, setNote] = useState('');
  const { attempt, run } = useAttempt<TransferInput>('transfer');
  const [checked, setChecked] = useState<Sent<TransferInput> | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const title = t('cash.transfer.title', 'نقل بين الصناديق');
  const from = accounts.find((box) => box.accountId === fromId);
  const to = accounts.find((box) => box.accountId === toId);
  const review = (event: FormEvent) => {
    event.preventDefault();
    const value = parseMoneyText(amount);
    const date = postingDay(day);
    if (!from || !to || fromId === toId || value === null || value <= 0n || !date.day) {
      setFailure(new RejectedError('fields', date.error ?? t('cash.transfer.fields', 'اختر صندوقين مختلفين واكتب مبلغاً أكبر من صفر بالدينار الصحيح.')));
      return;
    }
    setFailure(null);
    setChecked({ input: { fromId, toId, amount: value, onDate: date.day, note: note.trim() || null }, summary: transferSentence(from.name, to.name, value, date.day) });
  };
  const post = async (sent: Sent<TransferInput>) => {
    setBusy(true);
    setFailure(null);
    const outcome = await run(sent, (ref, input) => cash.transferCash(ref, input));
    setBusy(false);
    setChecked(null);
    if (outcome.kind === 'posted') onSaved();
    else if (outcome.kind === 'recorded') {
      recordedToast();
      onSaved();
    } else setFailure(outcome.error);
  };
  if (attempt.frozen) {
    const sent = attempt.frozen;
    return <FrozenDialog title={title} sent={sent} busy={busy} failure={failure} action="retry-transfer" onRetry={() => void post(sent)} onClose={onClose} />;
  }
  const failed = failure ? describeError(failure) : null;
  const formId = `${id}-form`;
  const value = parseMoneyText(amount);
  return (
    <>
      <Dialog
        open={checked === null}
        onClose={onClose}
        title={title}
        dirty={amount !== '' || fromId !== '' || toId !== ''}
        locked={busy}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('confirm.cancel', 'لا، تراجع')}
            </Button>
            <Button type="submit" form={formId} busy={busy} data-action="review-transfer">
              {t('cash.transfer.save', 'انقل')}
            </Button>
          </div>
        }
      >
        <form id={formId} className="flex flex-col gap-4" onSubmit={review} noValidate>
          <CashAccountPicker id={`${id}-from`} label={t('cash.transfer.from', 'من صندوق')} accounts={accounts} value={fromId} onChange={setFromId} />
          <CashAccountPicker id={`${id}-to`} label={t('cash.transfer.to', 'إلى صندوق')} accounts={accounts} value={toId} onChange={setToId} />
          <MoneyInput id={`${id}-amount`} label={t('payment.amount', 'المبلغ (دينار)')} value={amount} onChange={setAmount} />
          <DayField id={`${id}-day`} label={t('payment.day', 'التاريخ')} value={day} onChange={setDay} hint={t('payment.day.hint', 'اليوم أو قبله حتى 7 أيام.')} />
          <Field id={`${id}-note`} label={t('cash.transfer.note', 'ملاحظة')}>
            <input id={`${id}-note`} className="input" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {from && value !== null && from.closing - value < 0n ? (
            <Notice tone="warning" title={t('cash.negative.title', 'سيصير رصيد الصندوق سالباً')}>
              {t('cash.negative.detail', 'رصيده بعد الدفع {balance}. السالب مسموح، فتأكّد أن الصندوق هو الصحيح.', { balance: fmtMoney(from.closing - value, 0) })}
            </Notice>
          ) : null}
          {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
        </form>
      </Dialog>
      {checked ? (
        <ConfirmDialog
          open
          tone="primary"
          title={title}
          consequence={checked.summary}
          confirmLabel={t('cash.transfer.confirm', 'سجّل النقل')}
          cancelLabel={t('payment.back', 'عُد إلى النموذج')}
          busy={busy}
          action="confirm-transfer"
          onCancel={() => setChecked(null)}
          onConfirm={() => void post(checked)}
        />
      ) : null}
    </>
  );
}

type DialogState = null | { kind: 'new' } | { kind: 'rename' | 'opening' | 'archive'; box: CashBalance } | { kind: 'transfer' };

export default function CashPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? 'viewer';
  const allowed = { manage: can(role, 'cash_accounts.manage'), opening: can(role, 'opening.post'), transfer: can(role, 'payment.post') };
  // الأرصدة لحد يوم الخادم (to = null): صفحة مفتوحة من أمس تشوف حركات اليوم بعد التحديث.
  const from = useMemo(() => defaultPeriod().from, []);
  const load = useCallback(() => cash.loadCashBalances(from, null), [from]);
  const balances = useLoad(load, workspace?.orgId ?? 'none');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const saved = (title: string) => {
    setDialog(null);
    balances.retry();
    toast({ tone: 'success', title });
  };
  const header = (
    <PageHeader
      title={t('cash.title', 'الصناديق')}
      subtitle={t('cash.subtitle.today', 'رصيد كل صندوق مجموع حركاته، من {from} حتى اليوم.', { from: fmtDay(from) })}
      actions={
        <>
          {allowed.transfer && balances.data ? (
            <Button variant="secondary" icon={<ArrowLeftRight aria-hidden="true" className="size-4" />} onClick={() => setDialog({ kind: 'transfer' })} data-action="new-transfer">
              {t('cash.transfer.title', 'نقل بين الصناديق')}
            </Button>
          ) : null}
          {allowed.manage ? (
            <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setDialog({ kind: 'new' })} data-action="new-cash-account">
              {t('cash.new', 'صندوق جديد')}
            </Button>
          ) : null}
        </>
      }
    />
  );
  if (balances.error instanceof NotConnectedError) {
    const { title, detail } = describeError(balances.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  const actions = (box: CashBalance) => (
    <div className="flex gap-1.5">
      {allowed.opening && !box.hasOpening && !box.archived ? (
        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'opening', box })} data-action="cash-opening">
          {t('cash.opening', 'رصيد افتتاحي')}
        </Button>
      ) : null}
      {allowed.manage ? (
        <>
          {box.archived ? null : (
            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'rename', box })} data-action="rename-cash-account">
              {t('cash.rename', 'سمِّ')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'archive', box })} data-action={box.archived ? 'restore-cash-account' : 'archive-cash-account'}>
            {box.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
          </Button>
        </>
      ) : null}
    </div>
  );
  const negatives = balances.data?.accounts.filter((box) => box.closing < 0n) ?? [];
  return (
    <div className="flex flex-col gap-4">
      {header}
      <Link to="/accounts" className="text-sm text-brand-700 dark:text-brand-200">
        {t('statement.back', 'عُد إلى الحسابات')}
      </Link>
      {negatives.length ? (
        <Notice tone="warning" title={t('cash.negative.boxes', 'صناديق بالسالب: {names}', { names: negatives.map((box) => box.name).join(t('list.separator', '، ')) })}>
          {t('cash.negative.boxes.detail', 'السالب مسموح، لكن راجع الحركات: قد يكون قبضاً لم يُسجَّل.')}
        </Notice>
      ) : null}
      {balances.error ? (
        <LoadFailed what={t('cash.title', 'الصناديق')} error={balances.error} onRetry={balances.retry} />
      ) : !balances.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <CashTable balances={balances.data} actions={allowed.manage || allowed.opening ? actions : undefined} />
      )}
      {dialog?.kind === 'new' || dialog?.kind === 'rename' ? (
        <AccountDialog box={dialog.kind === 'rename' ? dialog.box : null} onClose={() => setDialog(null)} onSaved={() => saved(t('cash.saved', 'حُفظ الصندوق'))} />
      ) : null}
      {dialog?.kind === 'opening' ? <OpeningDialog box={dialog.box} onClose={() => setDialog(null)} onSaved={() => saved(t('cash.opening.saved', 'سُجّل الرصيد الافتتاحي'))} /> : null}
      {dialog?.kind === 'transfer' && balances.data ? <TransferDialog accounts={balances.data.accounts} onClose={() => setDialog(null)} onSaved={() => saved(t('cash.transfer.saved', 'سُجّل النقل'))} /> : null}
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        tone={dialog?.kind === 'archive' && dialog.box.archived ? 'primary' : 'danger'}
        title={dialog?.kind === 'archive' ? (dialog.box.archived ? t('org.restore.title', 'إعادة «{name}»', { name: dialog.box.name }) : t('org.archive.title', 'أرشفة «{name}»', { name: dialog.box.name })) : ''}
        consequence={
          dialog?.kind === 'archive'
            ? dialog.box.archived
              ? t('cash.restore.consequence', 'يعود «{name}» إلى القوائم ويقبل حركات جديدة.', { name: dialog.box.name })
              : t('cash.archive.consequence', 'يختفي «{name}» من القوائم ولا تُسجَّل عليه حركة جديدة، ويبقى كشفه. لا يُؤرشف وفيه رصيد.', { name: dialog.box.name })
            : null
        }
        confirmLabel={dialog?.kind === 'archive' && dialog.box.archived ? t('org.restore', 'أعِد') : t('org.archive', 'أرشف')}
        busy={busy}
        action="confirm-archive-cash-account"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== 'archive') return;
          setBusy(true);
          cash
            .setCashArchived(dialog.box.accountId, dialog.box.version, !dialog.box.archived)
            .then(
              () => {
                setDialog(null);
                balances.retry();
              },
              (caught: unknown) => {
                setDialog(null);
                if (caught instanceof ZeroRowsError) balances.retry();
                const { title, detail } = describeError(caught, 'once');
                toast({ tone: 'danger', title, detail });
              },
            )
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
