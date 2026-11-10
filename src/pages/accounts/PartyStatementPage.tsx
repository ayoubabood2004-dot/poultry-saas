import { FileSpreadsheet, Printer, Share2 } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { toast } from '../../components/ui/Toast';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError } from '../../lib/errors';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as parties from '../../lib/repo/parties';
import type { BookRef } from '../../lib/repo/parties';
import * as statements from '../../lib/repo/statement';
import type { PartyStatement, StatementBook, StatementLine } from '../../lib/repo/statement';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { BackLink, backTarget, DocText, PageStyle, printAs } from './papers';
import { AdjustDialog, bookLabel, defaultPeriod, PaymentDialog, PeriodFilter, SideAmount, VoidDialog } from './shared';
import { StatementSheet } from './statement/StatementSheet';
import { docType, lineMemo, modeLabel, shareText, statementCsv, statementTitle, STATEMENT_MODES, type StatementMode } from './statement/text';

// كشف الحساب الاحترافي (عقد 0024 F4، الخطّة §8.1 «1-د»، يحلّ محلّ كشف WP3): ورقة واحدة بثلاث صيغ (مختصر، وتفصيلي بموادّ كلّ مستند، والمفتوح
// فقط) من party_statement_v2، تُطبع A4 بعنوان «كشف حساب — الاسم — الفترة» وترقيم «صفحة س من ص»، وتُصدَّر إكسل (CSV) وتُشارك نصّاً من
// الهاتف. ويبقى منه ما كان: الحساب بالرابط (?book=) و«الكل»، والمدّة (افتراضها السنة الجارية)، و«قبضنا» و«دفعنا»، والتسوية والإعفاء،
// وإلغاء القبض والدفع والافتتاح والتسوية والإعفاء بقائمة لكلّ حساب على الشاشة وحدها (الورقة سبعة أعمدة بلا عمود إجراءات). والرجوع إلى
// ?back= (مسار في الحسابات أو المبيعات) وإلّا قائمة الذمم؛ و?send=1 (من «أرسل الكشف» في قائمة الذمم) يفتح نافذة المشاركة.

/**
 * القيود التي تُلغى من الكشف: القبض والدفع (ودفع الاستلام وقبض البيع، E44)، والافتتاح والتسوية والإعفاء، الأصلية التي لم تُلغَ؛
 * وتسوية تتبع مستنداً (تصحيح سعر) تُلغى من مستندها.
 */
export function voidable(line: Pick<StatementLine, 'kind' | 'docKind' | 'reverses' | 'reversed'>): 'payment' | 'entry' | null {
  if (line.reverses || line.reversed) return null;
  if (line.kind === 'payment' || line.kind === 'payout') return 'payment';
  if (line.docKind !== null) return null;
  if (line.kind === 'opening' || line.kind === 'adjustment' || line.kind === 'forgiveness') return 'entry';
  return null;
}

/** نتيجة إلغاء السطر بكلماتها: القيد العكسي بدفتره، ولقبض أو دفع حركة الصندوق العكسية بصندوقها واتّجاهها (FOUNDATION ٧٦٦). */
export function voidConsequence(line: Pick<StatementLine, 'kind' | 'docKind' | 'reverses' | 'reversed' | 'debit' | 'credit' | 'account'>, book: string): string {
  const amount = fmtMoney(line.debit + line.credit, 0);
  const entry = t('void.consequence', 'تُكتب حركة تلغي السابقة بمبلغ {amount} بتاريخ اليوم في «{book}» ويُعاد تسديد ما انفكّ من الأقدم، ويبقى الأصل بيومه.', { amount, book });
  if (voidable(line) !== 'payment') return entry;
  const box = line.account?.name ?? t('void.box.unknown', 'صندوقه');
  return line.kind === 'payment'
    ? t('void.consequence.payment', '{entry} ويخرج {amount} من «{box}» بتاريخ اليوم (قد يصير رصيده سالباً).', { entry, amount, box })
    : t('void.consequence.payout', '{entry} ويعود {amount} إلى «{box}» بتاريخ اليوم.', { entry, amount, box });
}

/** فلتر الحساب: «الكل» أو حساب واحد، بقائمة الحسابات (خارج الطباعة). */
export function BookFilter({ books, value, onChange }: { books: readonly BookRef[]; value: string; onChange: (bookId: string) => void }) {
  const id = useId();
  return (
    <div data-print="hide">
      <Field id={id} label={t('statement.book.filter', 'الحساب')}>
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

/** قيود الحساب التي تُلغى من هنا، بقائمة على الشاشة وحدها تحت الحساب. */
function VoidList({ book, onVoid }: { book: StatementBook; onVoid: (book: StatementBook, line: StatementLine) => void }) {
  const lines = book.lines.filter((line) => voidable(line) !== null);
  if (!lines.length) return null;
  const columns: Column<StatementLine>[] = [
    {
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <Button size="sm" variant="ghost" onClick={() => onVoid(book, line)} data-action="void-entry">
          {t('void.confirm', 'ألغِ')}
        </Button>
      ),
    },
    { key: 'date', header: t('ledger.date', 'التاريخ'), cell: (line) => <Num>{fmtDay(line.onDate)}</Num> },
    { key: 'doc', header: t('ledger.doc', 'المستند'), cell: (line) => (line.docNo ? <bdi dir="ltr">{line.docNo}</bdi> : docType(line)) },
    { key: 'memo', header: t('ledger.memo', 'البيان'), wrap: true, cell: (line) => <DocText text={lineMemo(line)} /> },
    { key: 'amount', header: t('statement.amount', 'المبلغ'), kind: 'number', cell: (line) => <SideAmount amount={line.debit - line.credit} /> },
  ];
  return (
    <div data-print="hide">
      <DataTable caption={t('statement.voids', 'قيود تُلغى من {book}', { book: bookLabel(book) })} columns={columns} rows={lines} rowKey={(line) => line.entryId} empty="" />
    </div>
  );
}

/** ملف نصّي يُنزَّل باسمه (إكسل يفتح CSV بعلامة البداية بالعربية). */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** رابط الكشف لمن يملك حساباً في المنشأة (يرافق نصّ المشاركة). */
const statementUrl = (partyId: string, bookId: string): string => `${window.location.origin}/accounts/parties/${partyId}${bookId ? `?book=${encodeURIComponent(bookId)}` : ''}`;

/** المشاركة من الهاتف بنصّ الخلاصة ورابط الكشف، وإلّا نسخ النصّ؛ false إذا تعذّر الاثنان (فتُعرض النافذة للنسخ باليد). */
async function shareStatement(title: string, text: string, url: string): Promise<boolean> {
  const nav = navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, text, url });
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return true;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}${String.fromCharCode(10)}${url}`);
    toast({ tone: 'success', title: t('stmt.share.copied', 'نُسخ نصّ الكشف؛ ألصقه في الرسالة.') });
    return true;
  } catch {
    return false;
  }
}

function ShareDialog({ statement, bookId, onClose }: { statement: PartyStatement; bookId: string; onClose: () => void }) {
  const id = useId();
  const text = shareText(statement);
  const url = statementUrl(statement.party.id, bookId);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('stmt.send.title', 'أرسل كشف «{name}»', { name: statement.party.name })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('stmt.send.close', 'أغلق')}
          </Button>
          <Button icon={<Share2 aria-hidden="true" className="size-4" />} onClick={() => void shareStatement(statementTitle(statement), text, url).then((done) => (done ? onClose() : setFailed(true)))} data-action="share-now">
            {t('stmt.share', 'شارك')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field id={id} label={t('stmt.send.text', 'نصّ الرسالة')}>
          <textarea id={id} className="input" rows={6} readOnly value={`${text}${String.fromCharCode(10)}${url}`} data-action="share-text" />
        </Field>
        {failed ? <Notice tone="warning" title={t('stmt.share.failed', 'تعذّرت المشاركة والنسخ من هذا الجهاز؛ انسخ النصّ يدوياً.')} /> : null}
      </div>
    </Dialog>
  );
}

type DialogState =
  | null
  | { kind: 'payment' | 'payout' }
  | { kind: 'adjust' | 'forgive'; book: BookRef }
  | { kind: 'void'; book: StatementBook; line: StatementLine }
  | { kind: 'share' };

export default function PartyStatementPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : 'viewer';
  const allowed = { pay: can(role, 'payment.post'), adjust: can(role, 'party.adjust'), void: can(role, 'void') };
  const [period, setPeriod] = useState(defaultPeriod);
  // الحساب والصيغة بالرابط (الرابط المنسوخ يفتح الكشف نفسه)، بـuseLocation وuseNavigate كما كان.
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const bookId = params.get('book') ?? '';
  const wanted = params.get('mode');
  const mode: StatementMode = STATEMENT_MODES.find((value) => value === wanted) ?? 'summary';
  const back = backTarget(params.get('back'), '/accounts/debts');
  const here = `${location.pathname}${location.search}`;
  // كلّ تغيير بالرابط يشيل ?send (نافذة المشاركة تُفتح مرّة من «أرسل الكشف»، لا بكلّ تحديث للصفحة).
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(location.search);
    if (name) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    next.delete('send');
    const search = next.toString();
    navigate({ search: search ? `?${search}` : '' }, { replace: true });
  };
  const closeDialog = () => {
    setDialog(null);
    if (params.has('send')) setParam('', '');
  };
  const [dialog, setDialog] = useState<DialogState>(() => (params.get('send') === '1' ? { kind: 'share' } : null));
  const load = useCallback(() => statements.loadPartyStatement(id, bookId || null, period.from, period.to), [id, bookId, period]);
  const statement = useLoad(load, `${id}|${bookId}|${period.from}|${period.to}`);
  const books = useLoad(parties.listBooks, 'books');
  const data = statement.data;
  const party = data?.party ?? null;
  const done = (title: string) => {
    setDialog(null);
    statement.retry();
    toast({ tone: 'success', title });
  };
  const share = () => {
    if (!data) return;
    void shareStatement(statementTitle(data), shareText(data), statementUrl(data.party.id, bookId)).then((ok) => {
      if (!ok) setDialog({ kind: 'share' });
    });
  };
  const header = (
    <PageHeader
      title={party ? party.name : t('statement.title', 'كشف الجهة')}
      subtitle={t('stmt.subtitle', 'كشف حساب بثلاث صيغ، يُطبع ويُصدَّر ويُرسل.')}
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
          <Button size="sm" variant="secondary" icon={<Printer aria-hidden="true" className="size-4" />} disabled={!data} onClick={() => data && printAs(statementTitle(data))} data-action="print-statement">
            {t('stmt.print', 'اطبع أو احفظ PDF')}
          </Button>
          <Button size="sm" variant="secondary" icon={<FileSpreadsheet aria-hidden="true" className="size-4" />} disabled={!data} onClick={() => data && download(`${statementTitle(data)}.csv`, statementCsv(data, mode))} data-action="export-csv">
            {t('stmt.csv', 'إكسل')}
          </Button>
          <Button size="sm" variant="secondary" icon={<Share2 aria-hidden="true" className="size-4" />} disabled={!data} onClick={share} data-action="share-statement">
            {t('stmt.share', 'شارك')}
          </Button>
        </div>
      }
    />
  );
  if (statement.error instanceof NotConnectedError) {
    const { title, detail } = describeError(statement.error);
    return (
      <div className="flex flex-col gap-4">
        <BackLink to={back} label={t('paper.back', 'رجوع')} />
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-print-area>
      <PageStyle size="A4" />
      <BackLink to={back} label={t('paper.back', 'رجوع')} />
      <div data-print="hide">{header}</div>
      {party?.archived ? (
        <div data-print="hide">
          <Notice tone="warning" title={t('party.archived.notice', 'هذه الجهة مؤرشفة: تقبل القبض والدفع والإلغاء، ولا يُسجَّل عليها دين جديد.')} />
        </div>
      ) : null}
      <PeriodFilter from={period.from} to={period.to} onApply={setPeriod} />
      <div className="grid gap-3 sm:grid-cols-2" data-print="hide">
        {books.data ? <BookFilter books={books.data} value={bookId} onChange={(next) => setParam('book', next)} /> : null}
        <Segmented<StatementMode>
          label={t('stmt.mode', 'صيغة الكشف')}
          options={STATEMENT_MODES.map((value) => ({ value, label: modeLabel(value) }))}
          value={mode}
          onChange={(next) => setParam('mode', next === 'summary' ? '' : next)}
        />
      </div>
      {statement.error ? (
        <LoadFailed what={t('statement.title', 'كشف الجهة')} error={statement.error} onRetry={statement.retry} />
      ) : !data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <StatementSheet
          statement={data}
          bookId={bookId}
          mode={mode}
          back={here}
          extra={allowed.void ? (book) => <VoidList book={book} onVoid={(entryBook, line) => setDialog({ kind: 'void', book: entryBook, line })} /> : undefined}
        />
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
          title={t('void.title', 'إلغاء {kind} {doc}', { kind: docType(dialog.line), doc: dialog.line.docNo ?? fmtDay(dialog.line.onDate) })}
          consequence={voidConsequence(dialog.line, bookLabel(dialog.book))}
          run={(clientRef, reason) => (voidable(dialog.line) === 'payment' ? parties.voidPayment(clientRef, dialog.line.entryId, reason) : parties.voidEntry(clientRef, dialog.line.entryId, reason))}
          onClose={() => setDialog(null)}
          onDone={() => done(t('void.done', 'أُلغيت الحركة'))}
        />
      ) : null}
      {dialog?.kind === 'share' && data ? <ShareDialog statement={data} bookId={bookId} onClose={closeDialog} /> : null}
    </div>
  );
}
