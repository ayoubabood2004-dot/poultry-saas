import { Printer } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LedgerTable } from '../../components/ui/LedgerTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import type { LedgerEntry } from '../../domain/ledger';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError } from '../../lib/errors';
import { fmtDay, fmtMoney, fmtPhone } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as parties from '../../lib/repo/parties';
import type { BookRef, PartyStatement, StatementBook, StatementLine } from '../../lib/repo/parties';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { AdjustDialog, bookLabel, defaultPeriod, entryKindLabel, PaymentDialog, PeriodFilter, SideAmount, VoidDialog } from './shared';

// كشف الجهة (خطّة المرحلة 1 WP3، E50، FOUNDATION ٧٨٨): جدول كلاسيكي واحد لكل دفتر بستّة أعمدة بالضبط «التاريخ | المستند |
// البيان | عليه | له | الرصيد»، بعنوان دفتره، ورصيد جارٍ لكل دفتر من المدوَّر قبل المدّة (من الخادم، E26)، وآخر سطر = رصيد الدفتر.
// فلتر الدفتر (FOUNDATION ١١٤ و٧٨٨): «الكل» يكدّس الدفاتر، ودفتر واحد يعرض كشفه وحده ويطبعه لحاله (كشف المعمل للمورّد)، والدفتر
// بالرابط (?book=) حتى الرابط المنسوخ يفتح نفس الكشف. المدّة
// افتراضها السنة الجارية، والطباعة تطبع كل الصفوف. والإلغاء والتسوية والإعفاء للمدير بقائمة لحالها تحت كل دفتر (الكشف نفسه ستّة
// أعمدة بلا عمود إجراءات)، وتأكيد إلغاء القبض أو الدفع يسمّي الصندوق اللي تُعكس منه الحركة.

/** البيان: نوع القيد وسببه، والعكسي «إلغاء …». */
export function lineMemo(line: StatementLine): string {
  const kind = entryKindLabel(line.kind);
  const base = line.reverses ? t('statement.memo.reversal', 'إلغاء {kind}', { kind }) : kind;
  return line.reason ? t('statement.memo.reason', '{base}: {reason}', { base, reason: line.reason }) : base;
}

/** سطور الكشف للجدول الكلاسيكي (الرصيد الجاري يحسبه LedgerTable من المدوَّر، ويطابق رصيد الخادم). */
export function ledgerEntries(book: StatementBook): LedgerEntry[] {
  return book.lines.map((line) => ({ date: line.onDate, doc: line.docNo ?? '', memo: lineMemo(line), debit: line.debit, credit: line.credit }));
}

/** القيود اللي تنلغى من هنا: القبض والدفع، والافتتاح والتسوية والإعفاء، الأصلية اللي ما انلغت. */
export function voidable(line: StatementLine): 'payment' | 'entry' | null {
  if (line.reverses || line.reversed) return null;
  if (line.kind === 'payment' || line.kind === 'payout') return 'payment';
  if (line.kind === 'opening' || line.kind === 'adjustment' || line.kind === 'forgiveness') return 'entry';
  return null;
}

/** نتيجة إلغاء السطر بكلماتها: القيد العكسي بدفتره، ولقبض أو دفع حركة الصندوق العكسية بصندوقها واتّجاهها (FOUNDATION ٧٦٦). */
export function voidConsequence(line: StatementLine, book: string): string {
  const amount = fmtMoney(line.debit + line.credit, 0);
  const entry = t('void.consequence', 'يُكتب قيد عكسي بمبلغه {amount} بتاريخ اليوم في «{book}» ويُعاد توزيع ما انفكّ، ويبقى الأصل بيومه.', { amount, book });
  if (voidable(line) !== 'payment') return entry;
  const box = line.account ?? t('void.box.unknown', 'صندوقه');
  return line.kind === 'payment'
    ? t('void.consequence.payment', '{entry} ويخرج {amount} من «{box}» بتاريخ اليوم (قد يصير رصيده سالباً).', { entry, amount, box })
    : t('void.consequence.payout', '{entry} ويعود {amount} إلى «{box}» بتاريخ اليوم.', { entry, amount, box });
}

/** فلتر الدفتر: «الكل» أو دفتر واحد، بقائمة الدفاتر (برّا الطباعة). */
export function BookFilter({ books, value, onChange }: { books: readonly BookRef[]; value: string; onChange: (bookId: string) => void }) {
  const id = useId();
  return (
    <div data-print="hide">
      <Field id={id} label={t('statement.book.filter', 'الدفتر')}>
        <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} data-action="statement-book">
          <option value="">{t('accounts.filter.all', 'الكل')}</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {bookLabel(book)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function StatementBooks({ statement, onVoid }: { statement: PartyStatement; onVoid?: (book: StatementBook, line: StatementLine) => void }) {
  if (statement.books.length === 0) return <Notice tone="info" title={t('statement.empty', 'لا قيود لهذه الجهة بعد.')} />;
  return (
    <div className="flex flex-col gap-6">
      {statement.books.map((book) => {
        const voids = onVoid ? book.lines.filter((line) => voidable(line) !== null) : [];
        const columns: Column<StatementLine>[] = [
          {
            key: 'actions',
            header: t('org.col.actions', 'إجراءات'),
            cell: (line) => (
              <Button size="sm" variant="ghost" onClick={() => onVoid?.(book, line)} data-action="void-entry">
                {t('void.confirm', 'ألغِ')}
              </Button>
            ),
          },
          { key: 'date', header: t('ledger.date', 'التاريخ'), cell: (line) => <Num>{fmtDay(line.onDate)}</Num> },
          { key: 'doc', header: t('ledger.doc', 'المستند'), cell: (line) => (line.docNo ? <bdi dir="ltr">{line.docNo}</bdi> : '—') },
          { key: 'memo', header: t('ledger.memo', 'البيان'), wrap: true, cell: (line) => lineMemo(line) },
          { key: 'amount', header: t('statement.amount', 'المبلغ'), kind: 'number', cell: (line) => <SideAmount amount={line.debit - line.credit} /> },
        ];
        return (
          <section key={book.bookId} className="flex flex-col gap-2" data-book={book.bookId}>
            <h2 className="font-semibold">{t('statement.book', 'دفتر {book}', { book: bookLabel(book) })}</h2>
            <LedgerTable caption={t('statement.book', 'دفتر {book}', { book: bookLabel(book) })} entries={ledgerEntries(book)} opening={book.broughtForward} />
            <p className="text-sm text-ink-muted">
              {t('statement.closing', 'رصيد الدفتر بآخر المدّة:')} <SideAmount amount={book.closing} />
            </p>
            {voids.length ? (
              <div data-print="hide">
                <DataTable caption={t('statement.voids', 'قيود تُلغى من {book}', { book: bookLabel(book) })} columns={columns} rows={voids} rowKey={(line) => line.entryId} empty="" />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

type DialogState = null | { kind: 'payment' | 'payout' } | { kind: 'adjust' | 'forgive'; book: BookRef } | { kind: 'void'; book: StatementBook; line: StatementLine };

export default function PartyStatementPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : 'viewer';
  const allowed = { pay: can(role, 'payment.post'), adjust: can(role, 'party.adjust'), void: can(role, 'void') };
  const [period, setPeriod] = useState(defaultPeriod);
  // الدفتر بالرابط بـuseLocation وuseNavigate (بحزمة الإقلاع من قبل؛ useSearchParams كان يزيدها بلا داعٍ).
  const location = useLocation();
  const navigate = useNavigate();
  const bookId = new URLSearchParams(location.search).get('book') ?? '';
  const setBookId = (next: string) => navigate({ search: next ? `?book=${encodeURIComponent(next)}` : '' }, { replace: true });
  const [dialog, setDialog] = useState<DialogState>(null);
  const load = useCallback(() => parties.loadStatement(id, bookId || null, period.from, period.to), [id, bookId, period]);
  const statement = useLoad(load, `${id}|${bookId}|${period.from}|${period.to}`);
  const books = useLoad(parties.listBooks, 'books');
  const party = statement.data?.party ?? null;
  const done = (title: string) => {
    setDialog(null);
    statement.retry();
    toast({ tone: 'success', title });
  };
  const header = (
    <PageHeader
      title={party ? party.name : t('statement.title', 'كشف الجهة')}
      subtitle={party?.phone ? <bdi dir="ltr">{fmtPhone(party.phone)}</bdi> : t('statement.subtitle', 'كل دفاتر الجهة بأرصدتها الجارية.')}
      actions={
        <div className="flex flex-wrap gap-2" data-print="hide">
          {allowed.pay && party && !statement.error ? (
            <>
              <Button size="sm" onClick={() => setDialog({ kind: 'payment' })} data-action="statement-payment">
                {t('payment.title', 'قبضنا')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'payout' })} data-action="statement-payout">
                {t('payout.title', 'دفعنا')}
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="secondary" icon={<Printer aria-hidden="true" className="size-4" />} onClick={() => window.print()} data-action="print-statement">
            {t('statement.print', 'اطبع')}
          </Button>
        </div>
      }
    />
  );
  if (statement.error instanceof NotConnectedError) {
    const { title, detail } = describeError(statement.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-print-area>
      {header}
      <Link to="/accounts" className="text-sm text-brand-700 dark:text-brand-200" data-print="hide">
        {t('statement.back', 'عُد إلى الحسابات')}
      </Link>
      {party?.archived ? <Notice tone="warning" title={t('party.archived.notice', 'هذه الجهة مؤرشفة: تقبل القبض والدفع والإلغاء، ولا يُسجَّل عليها دين جديد.')} /> : null}
      <PeriodFilter from={period.from} to={period.to} onApply={setPeriod} />
      {books.data ? <BookFilter books={books.data} value={bookId} onChange={setBookId} /> : null}
      <p className="text-sm text-ink-muted">{t('statement.period', 'المدّة من {from} إلى {to}', { from: fmtDay(period.from), to: fmtDay(period.to) })}</p>
      {statement.error ? (
        <LoadFailed what={t('statement.title', 'كشف الجهة')} error={statement.error} onRetry={statement.retry} />
      ) : !statement.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <StatementBooks statement={statement.data} onVoid={allowed.void ? (book, line) => setDialog({ kind: 'void', book, line }) : undefined} />
      )}
      {allowed.adjust && party && books.data ? (
        <div className="flex flex-wrap gap-2" data-print="hide">
          {books.data.map((book) => (
            <span key={book.id} className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'adjust', book })} data-action="adjust-book">
                {t('adjust.for', 'تسوية {book}', { book: bookLabel(book) })}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'forgive', book })} data-action="forgive-book">
                {t('forgive.for', 'إعفاء {book}', { book: bookLabel(book) })}
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      {(dialog?.kind === 'payment' || dialog?.kind === 'payout') && party ? (
        <PaymentDialog
          kind={dialog.kind}
          party={{ id: party.id, version: party.version, archived: party.archived, name: party.name, phone: party.phone, isCustomer: party.isCustomer, isSupplier: party.isSupplier }}
          onClose={() => setDialog(null)}
          onPosted={() => {
            setDialog(null);
            statement.retry();
          }}
        />
      ) : null}
      {(dialog?.kind === 'adjust' || dialog?.kind === 'forgive') && party ? (
        <AdjustDialog
          mode={dialog.kind}
          party={party}
          book={dialog.book}
          onClose={() => setDialog(null)}
          onPosted={() => done(dialog.kind === 'adjust' ? t('adjust.done', 'سُجّلت التسوية') : t('forgive.done', 'سُجّل الإعفاء'))}
        />
      ) : null}
      {dialog?.kind === 'void' && party ? (
        <VoidDialog
          slot={dialog.line.entryId}
          title={t('void.title', 'إلغاء {kind} {doc}', { kind: entryKindLabel(dialog.line.kind), doc: dialog.line.docNo ?? fmtDay(dialog.line.onDate) })}
          consequence={voidConsequence(dialog.line, bookLabel(dialog.book))}
          run={(clientRef, reason) => (voidable(dialog.line) === 'payment' ? parties.voidPayment(clientRef, dialog.line.entryId, reason) : parties.voidEntry(clientRef, dialog.line.entryId, reason))}
          onClose={() => setDialog(null)}
          onDone={() => done(t('void.done', 'أُلغي القيد'))}
        />
      ) : null}
    </div>
  );
}
