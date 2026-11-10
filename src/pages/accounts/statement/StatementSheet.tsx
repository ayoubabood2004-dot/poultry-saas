import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, Num, type Column, type FooterRow } from '../../../components/ui/DataTable';
import type { Fils } from '../../../domain/money';
import { columnDecimals, fmtDay, fmtPhone, fmtQtyCell } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import { AGING_BUCKETS, bucketOf, type OpenItem, type PartyStatement, type StatementBook, type StatementLine } from '../../../lib/repo/statement';
import { AgeText, bucketLabel, DocText, money, moneyText, Signatures, unitText } from '../papers';
import { bookLabel } from '../shared';
import { booksLabel, closingWords, docKindLink, docLink, docType, lineMemo, modeLabel, openItemType, openSummary, settlementText, sideWord, type StatementMode } from './text';

// ورقة كشف الحساب الاحترافي (عقد 0024 F4، الخطّة §8.1 «1-د» و§9.1): الرأس (المنشأة و«كشف حساب» والجهة وهاتفها والحساب والفترة والعملة
// وتاريخ الطباعة)، ولكلّ حساب جدول بسبعة أعمدة «التاريخ | رقم المستند | نوع المستند | البيان | عليه (مدين) | له (دائن) | الرصيد» أوّله
// «رصيد سابق» وآخره «مجموع الفترة»، وتحت كلّ تسديد ما سدّده، وفي التفصيلي موادّ المستند تحت سطره بعرض الجدول؛ وذيل كلّ حساب: الرصيد
// الختامي رقماً وكتابةً بجهته، وأعمار المفتوح اليوم؛ ثمّ عبارة المطابقة وسطرا التوقيع. الصيغة «المفتوح فقط» تعرض المفتوح بدل السطور.

const abs = (amount: Fils): Fils => (amount < 0n ? -amount : amount);

/** الرصيد الجاري: الرقم على خانة الآحاد وجهته بجانبه («عليه» أو «له»)، والصفر بلا كلمة. */
function BalanceCell({ amount }: { amount: Fils }) {
  const word = sideWord(amount);
  return (
    <span className="flex items-center justify-between gap-3">
      <Num>{moneyText(abs(amount))}</Num>
      {word ? <span className="text-2xs font-normal text-ink-muted">{word}</span> : null}
    </span>
  );
}

/** رقم المستند رابطاً إلى المستند أو السند (§5)، ومعزولاً LTR. */
function DocNo({ docNo, href }: { docNo: string | null; href: string | null }) {
  if (!docNo) return null;
  return href ? (
    <Link to={href} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="doc-link">
      <Num>{docNo}</Num>
    </Link>
  ) : (
    <Num>{docNo}</Num>
  );
}

export function StatementHead({ statement, bookId, mode }: { statement: PartyStatement; bookId: string; mode: StatementMode }) {
  const { party } = statement;
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-4" data-action="statement-head" data-keep>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold" data-action="org-name">
            {statement.orgName}
          </p>
          <p className="text-sm text-ink-muted">{t('stmt.currency_line', 'العملة: دينار عراقي')}</p>
        </div>
        <div className="flex flex-col items-end">
          <h2 className="text-2xl font-semibold">{t('stmt.title', 'كشف حساب')}</h2>
          <p className="text-sm text-ink-muted">{modeLabel(mode)}</p>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-muted">{t('stmt.head.party', 'الجهة:')}</dt>
          <dd className="font-semibold" data-action="party-name">
            {party.name}
            {party.phone ? (
              <>
                {' — '}
                <bdi dir="ltr">{fmtPhone(party.phone)}</bdi>
              </>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-muted">{t('stmt.head.book', 'الحساب:')}</dt>
          <dd data-action="head-book">{booksLabel(statement, bookId)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-muted">{t('stmt.head.period', 'الفترة:')}</dt>
          <dd data-action="head-period">
            {t('stmt.head.period_value', 'من {from} إلى {to}', { from: fmtDay(statement.from), to: fmtDay(statement.to) })}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-muted">{t('stmt.head.printed', 'تاريخ الطباعة:')}</dt>
          <dd data-action="head-printed">
            <Num>{fmtDay(statement.today)}</Num>
          </dd>
        </div>
      </dl>
    </header>
  );
}

/** للسطر موادّ تُعرض تحته في التفصيلي: الشراء والبيع والمرتجع والتسعير، لا سطر الإلغاء. */
export function hasDocItems(line: Pick<StatementLine, 'detail' | 'reverses'>): boolean {
  const type = line.detail?.type;
  return !line.reverses && (type === 'purchase' || type === 'sale' || type === 'supplier_return' || type === 'revaluation');
}

/**
 * موادّ المستند تحت سطره (التفصيلي): المادّة | الكمية | الوحدة | السعر | المبلغ، ثمّ المجموع والخصم وأجور الشراء والصافي = مبلغ القيد. الأجور
 * سطور بلا مبلغ في عمود المبلغ (المبلغ في اسمها): قيدها مستقلّ أو نقداً، فالصافي = المجموع − الخصم بالضبط (ثابت العقد §4.4).
 */
export function DocItems({ line }: { line: StatementLine }) {
  const { detail } = line;
  if (!detail || line.reverses) return null;
  const none = t('stmt.items.unpriced', 'بلا سعر');
  type Item = { key: string; name: string; qty: bigint; unit: string; price: Fils | null; amount: Fils | null };
  let items: Item[];
  let footers: FooterRow[];
  let note: string | null = null;
  switch (detail.type) {
    case 'purchase':
      items = detail.lines.map((entry) => ({ key: `${entry.lineNo}`, name: entry.itemName, qty: entry.qty, unit: unitText(entry.unitLabel), price: entry.unitPrice, amount: entry.amount }));
      footers = [
        { key: 'sum', label: t('stmt.items.sum', 'مجموع الموادّ'), cells: { amount: money(detail.linesTotal) } },
        ...(detail.discount > 0n ? [{ key: 'discount', label: t('stmt.items.discount', 'الخصم'), cells: { amount: money(-detail.discount) } }] : []),
        ...detail.charges.map((charge, index) => ({ key: `charge-${index}`, label: chargeLabel(charge), cells: {} })),
        { key: 'net', label: t('stmt.items.net', 'الصافي (مبلغ القيد)'), cells: { amount: money(detail.net) } },
      ];
      note = paidNote(detail.paidNow, detail.account?.name ?? null);
      break;
    case 'sale':
      items = detail.lines.map((entry) => ({ key: `${entry.lineNo}`, name: entry.itemName, qty: entry.qty, unit: unitText(entry.baseUnit), price: entry.unitPrice, amount: entry.amount }));
      footers = [{ key: 'net', label: t('stmt.items.total', 'مجموع الفاتورة (مبلغ القيد)'), cells: { amount: money(detail.total) } }];
      break;
    case 'supplier_return':
      items = detail.lines.map((entry) => ({ key: `${entry.lineNo}`, name: entry.itemName, qty: entry.qty, unit: unitText(entry.baseUnit), price: null, amount: entry.amount }));
      footers = [{ key: 'net', label: t('stmt.items.return_total', 'مجموع المرتجع (مبلغ القيد)'), cells: { amount: money(detail.total) } }];
      break;
    case 'revaluation':
      items = [{ key: 'item', name: detail.itemName, qty: detail.qty, unit: unitText(detail.unitLabel), price: detail.unitPrice, amount: detail.newTotal }];
      footers = [
        { key: 'old', label: t('stmt.items.old_total', 'المبلغ قبله'), cells: { amount: money(detail.oldTotal) } },
        { key: 'net', label: t('stmt.items.diff', 'الفرق (مبلغ القيد)'), cells: { amount: money(detail.diff) } },
      ];
      break;
    default:
      return null;
  }
  const decimals = columnDecimals(items.map((item) => item.qty), 3) as 0 | 1 | 2 | 3;
  const priced = detail.type !== 'supplier_return';
  const columns: Column<Item>[] = [
    { key: 'item', header: t('stmt.items.item', 'المادّة'), wrap: true, cell: (item) => item.name },
    { key: 'qty', header: t('stmt.items.qty', 'الكمية'), kind: 'number', cell: (item) => <Num>{fmtQtyCell(item.qty, decimals)}</Num> },
    { key: 'unit', header: t('stmt.items.unit', 'الوحدة'), cell: (item) => item.unit },
    ...(priced ? [{ key: 'price', header: t('stmt.items.price', 'السعر'), kind: 'number' as const, cell: (item: Item) => (item.price === null ? none : money(item.price)) }] : []),
    { key: 'amount', header: t('stmt.items.amount', 'المبلغ'), kind: 'number', cell: (item) => (item.amount === null ? none : money(item.amount)) },
  ];
  return (
    <div className="flex flex-col gap-1.5 py-1" data-action="doc-items" data-entry={line.entryId}>
      <DataTable caption={t('stmt.items.caption', 'موادّ {doc}', { doc: line.docNo ?? docType(line) })} columns={columns} rows={items} rowKey={(item) => item.key} empty="" footers={footers} />
      {note ? (
        <p className="paper-note" data-action="doc-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** سطر أجرة الشراء: اسمها ومبلغها وأين قُيّدت (نقداً، أو على حساب جهة الأجرة)، خارج قيد الشراء. */
function chargeLabel(charge: { label: string; amount: Fils; paid: 'cash' | 'party' }): string {
  return charge.paid === 'cash'
    ? t('stmt.charge.cash', 'أجور {label} {amount}: نقداً، خارج هذا القيد', { label: charge.label, amount: moneyText(charge.amount) })
    : t('stmt.charge.party', 'أجور {label} {amount}: على حساب جهة الأجرة، خارج هذا القيد', { label: charge.label, amount: moneyText(charge.amount) });
}

/** ما دُفع عند الشراء ومن أيّ صندوق (قيد الدفع سطر مستقلّ في الكشف). */
function paidNote(paidNow: Fils, box: string | null): string | null {
  if (paidNow <= 0n) return null;
  return box ? t('stmt.paid_now.box', 'دُفع منه عند الشراء {amount} من «{box}».', { amount: moneyText(paidNow), box }) : t('stmt.paid_now', 'دُفع منه عند الشراء {amount}.', { amount: moneyText(paidNow) });
}

type LedgerRow = { kind: 'bf' } | { kind: 'line'; line: StatementLine };

/** جدول الحساب بالأعمدة السبعة: «رصيد سابق» أوّلاً، و«مجموع الفترة» من الخادم آخراً، وفي التفصيلي موادّ كلّ مستند تحت سطره. */
export function StatementTable({ statement, book, mode, back }: { statement: PartyStatement; book: StatementBook; mode: StatementMode; back: string }) {
  const rows: LedgerRow[] = [{ kind: 'bf' }, ...book.lines.map((line): LedgerRow => ({ kind: 'line', line }))];
  const columns: Column<LedgerRow>[] = [
    { key: 'date', header: t('ledger.date', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.kind === 'bf' ? statement.from : row.line.onDate)}</Num> },
    { key: 'doc', header: t('stmt.col.doc', 'رقم المستند'), cell: (row) => (row.kind === 'line' ? <DocNo docNo={row.line.docNo} href={docLink(row.line, back)} /> : null) },
    { key: 'type', header: t('stmt.col.type', 'نوع المستند'), cell: (row) => (row.kind === 'line' ? docType(row.line) : null) },
    {
      key: 'memo',
      header: t('ledger.memo', 'البيان'),
      wrap: true,
      cell: (row) => {
        if (row.kind === 'bf') return t('ledger.opening', 'رصيد سابق');
        const settled = settlementText(row.line);
        return (
          <span className="flex flex-col gap-0.5" data-action="memo" data-entry={row.line.entryId}>
            <span>
              <DocText text={lineMemo(row.line)} />
            </span>
            {settled ? (
              <span className="text-xs text-ink-muted" data-action="settled">
                <DocText text={settled} />
              </span>
            ) : null}
          </span>
        );
      },
    },
    { key: 'debit', header: t('stmt.col.debit', 'عليه (مدين)'), kind: 'number', cell: (row) => (row.kind === 'line' && row.line.debit !== 0n ? money(row.line.debit) : null), total: money(book.totalDebit) },
    { key: 'credit', header: t('stmt.col.credit', 'له (دائن)'), kind: 'number', cell: (row) => (row.kind === 'line' && row.line.credit !== 0n ? money(row.line.credit) : null), total: money(book.totalCredit) },
    { key: 'balance', header: t('ledger.balance', 'الرصيد'), kind: 'number', cell: (row) => <BalanceCell amount={row.kind === 'bf' ? book.broughtForward : row.line.balance} />, total: <BalanceCell amount={book.closing} /> },
  ];
  return (
    <DataTable
      caption={t('stmt.caption', 'كشف حساب {book}', { book: bookLabel(book) })}
      columns={columns}
      rows={rows}
      rowKey={(row) => (row.kind === 'bf' ? 'bf' : row.line.entryId)}
      empty=""
      totalLabel={t('stmt.total', 'مجموع الفترة')}
      subRow={mode === 'detailed' ? (row) => (row.kind === 'line' && hasDocItems(row.line) ? <DocItems line={row.line} /> : null) : undefined}
    />
  );
}

/** المفتوح اليوم (الصيغة «المفتوح فقط»): المبلغ والمسدَّد والمتبقّي والعمر بلون فئته. */
export function OpenItemsTable({ book, back }: { book: StatementBook; back: string }) {
  const sum = (pick: (item: OpenItem) => Fils) => book.openItems.reduce((total, item) => total + pick(item), 0n);
  const columns: Column<OpenItem>[] = [
    { key: 'date', header: t('ledger.date', 'التاريخ'), cell: (item) => <Num>{fmtDay(item.onDate)}</Num> },
    { key: 'doc', header: t('stmt.col.doc', 'رقم المستند'), cell: (item) => <DocNo docNo={item.docNo} href={docKindLink(item.docKind, item.docId, back)} /> },
    { key: 'type', header: t('stmt.col.type', 'نوع المستند'), cell: (item) => openItemType(item) },
    { key: 'amount', header: t('stmt.open.amount', 'المبلغ'), kind: 'number', cell: (item) => money(item.amount), total: money(sum((item) => item.amount)) },
    { key: 'settled', header: t('stmt.open.settled', 'المسدَّد'), kind: 'number', cell: (item) => money(item.settled), total: money(sum((item) => item.settled)) },
    { key: 'remaining', header: t('stmt.open.remaining', 'المتبقّي'), kind: 'number', cell: (item) => money(item.remaining), total: money(sum((item) => item.remaining)) },
    { key: 'age', header: t('stmt.open.age', 'العمر'), cell: (item) => <AgeText days={item.ageDays} bucket={bucketOf(item.ageDays)} /> },
  ];
  return (
    <DataTable
      caption={t('stmt.open.caption', 'المفتوح اليوم في {book}', { book: bookLabel(book) })}
      columns={columns}
      rows={book.openItems}
      rowKey={(item) => item.entryId}
      empty={t('stmt.open.none', 'لا شيء مفتوح في هذا الحساب اليوم.')}
      totalLabel={t('stmt.open.total', 'المجموع')}
    />
  );
}

/** أعمار المفتوح اليوم بجهته: 0–30 | 31–60 | 61–90 | أكثر من 90 | المجموع. */
function AgingTable({ book }: { book: StatementBook }) {
  const { aging } = book;
  const total = AGING_BUCKETS.reduce((sum, bucket) => sum + aging[bucket], 0n);
  type AgingRow = { key: 'row' };
  const columns: Column<AgingRow>[] = [
    {
      key: 'side',
      header: t('stmt.col.side', 'الجهة'),
      cell: () => (aging.side === 'debit' ? t('ledger.side.debit', 'عليه') : aging.side === 'credit' ? t('ledger.side.credit', 'له') : t('stmt.aging.none', 'لا مفتوح')),
    },
    ...AGING_BUCKETS.map((bucket): Column<AgingRow> => ({
      key: bucket,
      header: bucketLabel(bucket),
      kind: 'number',
      cell: () => (
        <span className={aging[bucket] > 0n ? 'aging-ink' : undefined} data-bucket={bucket}>
          {money(aging[bucket])}
        </span>
      ),
    })),
    { key: 'total', header: t('stmt.aging.total', 'المجموع'), kind: 'number', cell: () => money(total) },
  ];
  return <DataTable caption={t('stmt.aging.caption', 'أعمار الرصيد اليوم في {book}', { book: bookLabel(book) })} columns={columns} rows={[{ key: 'row' }]} rowKey={(row) => row.key} empty="" />;
}

/** ذيل الحساب: الرصيد الختامي رقماً وكتابةً بجهته، وأعمار المفتوح اليوم، والمفتوح (في المختصر والتفصيلي). */
export function BookFooter({ statement, book, mode }: { statement: PartyStatement; book: StatementBook; mode: StatementMode }) {
  const open = mode === 'open' ? null : openSummary(book);
  return (
    <div className="flex flex-col gap-3" data-action="book-footer">
      <div className="flex flex-col gap-1 rounded-2xl border border-line p-3" data-action="closing" data-keep>
        <p className="font-semibold">
          {book.closing === 0n
            ? t('stmt.closing.zero', 'الرصيد الختامي: لا شيء عليه ولا له')
            : t('stmt.closing', 'الرصيد الختامي: {amount} دينار {side}', { amount: moneyText(abs(book.closing)), side: sideWord(book.closing) })}
        </p>
        <p className="text-sm" data-action="closing-words">
          {closingWords(book.closing)}
        </p>
      </div>
      <div className="flex flex-col gap-1.5" data-action="aging" data-keep>
        <p className="text-sm font-semibold">{t('stmt.aging.title', 'أعمار الرصيد اليوم')}</p>
        <AgingTable book={book} />
        {statement.to < statement.today ? (
          <p className="text-xs text-ink-muted" data-action="aging-today">
            {t('stmt.aging.today', 'الأعمار والمفتوح محسوبة ليوم {today}، لا لآخر الفترة.', { today: fmtDay(statement.today) })}
          </p>
        ) : null}
      </div>
      {open ? (
        <p className="text-sm" data-action="open-summary">
          <DocText text={open} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * الورقة كلّها: الرأس، ولكلّ حساب جدوله وذيله (وما يُضاف تحته على الشاشة وحدها: إلغاء القيود)، ثمّ عبارة المطابقة والتوقيعان.
 * بطاقة على الشاشة، وبالطباعة A4 بلا إطار (papers.css).
 */
export function StatementSheet({ statement, bookId, mode, back, extra }: { statement: PartyStatement; bookId: string; mode: StatementMode; back: string; extra?: (book: StatementBook) => ReactNode }) {
  return (
    <article className="card flex flex-col gap-5 p-4 sm:p-6" data-paper data-action="statement-sheet">
      <StatementHead statement={statement} bookId={bookId} mode={mode} />
      {statement.books.length === 0 ? <p className="text-sm text-ink-muted">{t('statement.empty', 'لا قيود لهذه الجهة بعد.')}</p> : null}
      {statement.books.map((book) => (
        <section key={book.bookId} className="flex flex-col gap-3" data-book={book.bookId}>
          <h3 className="font-semibold">{t('stmt.book', 'الحساب: {book}', { book: bookLabel(book) })}</h3>
          {mode === 'open' ? <OpenItemsTable book={book} back={back} /> : <StatementTable statement={statement} book={book} mode={mode} back={back} />}
          <BookFooter statement={statement} book={book} mode={mode} />
          {extra?.(book)}
        </section>
      ))}
      <p className="text-sm" data-action="confirm-sentence">
        {t('stmt.confirm', 'نرجو مطابقة الرصيد، وإعلامنا بأيّ اختلاف خلال 15 يوماً من تاريخه.')}
      </p>
      <Signatures roles={[t('stmt.sign.accountant', 'المحاسب'), t('stmt.sign.manager', 'المدير')]} />
    </article>
  );
}
