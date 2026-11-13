import type { ReactNode } from 'react';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { amountInWords } from '../../domain/amountWords';
import { FILS_PER_DINAR, type Fils, type Milli } from '../../domain/money';
import { columnDecimals, fmtCounted, fmtDay, fmtInt, fmtMilli, fmtMoney, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { BirdPaid, BirdSaleDetail } from '../../lib/repo/birdSales';

// قطع فاتورة الطيور (0028، العقد §10 الوكيل ب): الطيور بصيغة المعدود، والكيلو والمبلغ والنسبة نصّاً من منسّقات format.ts، وطرق الفاتورة ونموذجها
// والرجوع منهما، وجدول القاعات (القاعة | الطيور | الصافي | معدّل الطير، وفي النموذج الحيّ وحصّة كلّ قاعة)، وورقة الفاتورة A5 «فاتورة بيع دجاج لحم حيّ»
// بالمبلغ كتابةً والتواقيع وختم «ملغى». كلّها في حزمة المخزون الكسولة (المبيعات)؛ والتوقيع والختم بأنماط مضمّنة لا بقطع أوراق الحسابات (papers.css
// كسول مع قسم الحسابات وحده، ونمط ورقة التذكرة نفسه)، ولا أصناف Tailwind جديدة.

/** عدد الطيور بصيغة المعدود: «طير واحد»، «طيران»، «5 طيور»، «60 طيراً»، «4,000 طير». */
export function birdsText(n: number): string {
  return fmtCounted(BigInt(n) * 1000n, t('birds.unit', 'طير'), { one: t('birds.one', 'طير واحد'), two: t('birds.two', 'طيران'), few: t('birds.few', 'طيور'), many: t('birds.many', 'طيراً') });
}

/** كيلوغرامات بمراتبها المعنوية: «4,079.5 كغم». */
export const kgText = (kg: Milli): string => t('birds.kg', '{kg} كغم', { kg: fmtMilli(kg) });

/** مبلغ بالدينار الصحيح، أو بمرتبتين إذا فيه فلوس (سعر الكيلو قد يحمل فلساً). */
export const moneyText = (amount: Fils): string => fmtMoney(amount, amount % FILS_PER_DINAR === 0n ? 0 : 2);
export const dinarsText = (amount: Fils): string => t('birds.dinar', '{amount} دينار', { amount: moneyText(amount) });

/** نسبة التنزيل (بالمئات من الواحد بالمئة) بمرتبتين: «0.50٪». */
export const pctText = (deduction: bigint): string => t('birds.pct', '{value}٪', { value: fmtScaledCell(deduction, 2, 2) });

/**
 * الدفع بكلماته: بالدين كلّه، أو جزء مقبوض والباقي بالدين، أو مقبوض كلّه؛ والمقبوض الذي رُدّ للتاجر («ألغِ القبض»، مراجعة 0028 M3) بالدين بعد ردّه (الخادم
 * صحّح الدفع والمقبوض، وهذا يقول ما حدث).
 */
export function paidLabel(paid: BirdPaid, refunded = false): string {
  if (refunded) return t('birds.paid.refunded', 'بالدين بعد ردّ المقبوض');
  if (paid === 'cash') return t('birds.paid.cash', 'نقداً');
  if (paid === 'partial') return t('birds.paid.partial', 'جزء نقداً');
  return t('birds.paid.credit', 'بالدين');
}

/** «تخرج 800 طير من «قاعة 1» و1,000 طير من «قاعة 2»»: القاعات بطيورها بجملة واحدة. */
export function hallsBirdsText(halls: readonly { name: string; birds: number }[], from = true): string {
  const parts = halls.map((hall) =>
    from ? t('birds.hall.from', '{birds} من «{hall}»', { birds: birdsText(hall.birds), hall: hall.name }) : t('birds.hall.to', '{birds} إلى «{hall}»', { birds: birdsText(hall.birds), hall: hall.name }),
  );
  if (parts.length < 2) return parts.join('');
  return t('birds.hall.list', '{head} و{last}', { head: parts.slice(0, -1).join(t('list.separator', '، ')), last: parts.at(-1) ?? '' });
}

// ─── الطرق ─────────────────────────────────────────────────────────────────────────────────────────────────────

const withBack = (path: string, back?: string): string => (back ? `${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams({ back }).toString()}` : path);
/** نموذج فاتورة التذكرة (حزمة المخزون). */
export const newBirdSalePath = (ticketId: string, back?: string): string => withBack(`/sales/birds/new?${new URLSearchParams({ ticket: ticketId }).toString()}`, back);
/** الفاتورة للقراءة والطباعة. */
export const birdSalePath = (saleId: string, back?: string): string => withBack(`/sales/birds/${saleId}`, back);
/** التذكرة (حزمة القاعات). */
export const ticketPagePath = (ticketId: string, back?: string): string => withBack(`/halls/ticket/${ticketId}`, back);

/**
 * طريق الرجوع من الرابط (?back=): مسار داخليّ في المبيعات أو الحسابات أو تذاكر الوزن أو «التقارير» أو الرئيسية وحده (بترميز URLSearchParams:
 * المسافة «+»)، وإلّا البديل. لا رابط خارجيّ ولا «//».
 */
export function birdBack(value: string | null, fallback: string): string {
  return value !== null && /^\/(?:$|reports$|(?:sales|accounts|halls\/tickets?)(?:[/?][\w\-/=&%.?+*]*)?$)/u.test(value) ? value : fallback;
}

/** اسم زرّ الرجوع بوجهته. */
export function birdBackLabel(path: string): string {
  if (path === '/') return t('back.home', 'رجوع إلى الرئيسية');
  if (path === '/reports') return t('halls.kit.back_reports', 'رجوع إلى التقارير');
  if (path.startsWith('/halls/tickets')) return t('halls.ticket.back_list', 'رجوع إلى تذاكر الوزن');
  if (path.startsWith('/halls/ticket/')) return t('halls.ticket.back_ticket', 'رجوع إلى التذكرة');
  if (path.startsWith('/accounts')) return t('birds.back.accounts', 'رجوع إلى الحسابات');
  return t('halls.ticket.back_sales', 'رجوع إلى المبيعات');
}

// ─── جدول القاعات ────────────────────────────────────────────────────────────────────────────────────────────────

/** قاعة في جدول الفاتورة أو نموذجها: طيورها وصافيها ومعدّلها، وفي النموذج حيّها الآن وحصّتها من المبلغ. */
export interface HallRow {
  key: string;
  hallName: string;
  birds: number;
  netKg: Milli;
  avgKg: Milli | null;
  /** الحيّ الآن (النموذج وحده). */
  live?: number;
  /** حصّة القاعة من المبلغ بأكبر الباقي بصافيها، أو null قبل السعر. */
  share?: Fils | null;
}

const dash = () => t('birds.dash', '—');

/** مراتب عمود كيلو: أقلّ ما يبيّن كلّ قيمه. */
export const kgDecimals = (values: readonly Milli[]): 0 | 1 | 2 | 3 => columnDecimals(values, 3) as 0 | 1 | 2 | 3;

export function HallsTable({
  caption,
  rows,
  totals,
  live = false,
  shares = false,
}: {
  caption: string;
  rows: readonly HallRow[];
  totals: { birds: number; netKg: Milli; avgKg: Milli | null; share?: Fils | null };
  /** عمود «الحيّ الآن» (النموذج). */
  live?: boolean;
  /** عمود «الحصّة (دينار)» (النموذج بعد السعر). */
  shares?: boolean;
}) {
  const kg = kgDecimals([...rows.map((row) => row.netKg), totals.netKg]);
  const avg = (value: Milli | null) => (value === null ? dash() : <Num>{fmtQtyCell(value, 3)}</Num>);
  const columns: Column<HallRow>[] = [
    { key: 'hall', header: t('birds.col.hall', 'القاعة'), sticky: true, cell: (row) => row.hallName },
    { key: 'birds', header: t('birds.col.birds', 'الطيور'), kind: 'number', cell: (row) => <Num>{fmtInt(row.birds)}</Num>, total: <Num>{fmtInt(totals.birds)}</Num> },
    { key: 'net', header: t('birds.col.net', 'الصافي (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.netKg, kg)}</Num>, total: <Num>{fmtQtyCell(totals.netKg, kg)}</Num> },
    { key: 'avg', header: t('birds.col.avg', 'معدّل الطير (كغم)'), kind: 'number', cell: (row) => avg(row.avgKg), total: avg(totals.avgKg) },
  ];
  if (live) columns.push({ key: 'live', header: t('birds.col.live', 'الحيّ الآن'), kind: 'number', cell: (row) => (row.live === undefined ? dash() : <Num>{fmtInt(row.live)}</Num>) });
  if (shares) {
    columns.push({
      key: 'share',
      header: t('birds.col.share', 'الحصّة (دينار)'),
      kind: 'number',
      cell: (row) => (row.share === undefined || row.share === null ? dash() : <Num>{fmtMoney(row.share, 0)}</Num>),
      total: totals.share === undefined || totals.share === null ? dash() : <Num>{fmtMoney(totals.share, 0)}</Num>,
    });
  }
  return <DataTable caption={caption} columns={columns} rows={rows} rowKey={(row) => row.key} empty={dash()} totalLabel={t('birds.total', 'المجموع')} />;
}

// ─── ورقة الفاتورة (A5) ─────────────────────────────────────────────────────────────────────────────────────────

/** قياس الورقة ما دامت الصفحة مفتوحة، وبلا إطار البطاقة في الطباعة (القشرة تختفي بأصنافها print:hidden). */
export const PRINT_STYLE = ['@page { size: A5 portrait; margin: 9mm; }', '@media print {', '[data-action="bird-paper"] table { font-size: 11px; }', '[data-action="bird-paper"] { box-shadow: none; border: 0; }', '}'].join(' ');

const SIGN_STYLE = { minWidth: '9rem', paddingTop: '2.25rem', paddingBottom: '0.25rem', borderBottom: '1px dotted currentColor' } as const;
const STAMP_STYLE = { border: '3px double rgb(220 38 38)', color: 'rgb(185 28 28)', borderRadius: '0.75rem', padding: '0.75rem 1rem' } as const;

/** اطبع بعنوان الورقة (Chrome يسمّي ملفّ «احفظ PDF» به)، ثمّ يعود عنوان الصفحة بعد الطباعة. */
export function printAs(title: string): void {
  const before = document.title;
  const restore = () => {
    document.title = before;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  document.title = title;
  window.print();
}

/** سطر «العنوان: القيمة» في الورقة. */
function PaperLine({ label, action, children }: { label: string; action: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line py-2" data-action={action}>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{children}</span>
    </div>
  );
}

/** عنوان الورقة واسم ملفّ الطباعة. */
export const paperTitle = (docNo: string): string => t('birds.paper.title_no', 'فاتورة بيع دجاج لحم حيّ {no}', { no: docNo });

/**
 * ورقة فاتورة الطيور A5: رأس المنشأة واسم الفاتورة ورقمها ويومها (ويوم التذكرة حين يختلف: الفاتورة المتأخّرة بتاريخ يوم إصدارها وخروج الطيور بيوم
 * التذكرة، أجوبة المالك 2026-11-13)، والتاجر وهاتفه والحقل والتذكرة والسيارة والسائق، وجدول القاعات بمجموعه، والتنزيل والوزن المحسوب وسعر الكيلو والمبلغ
 * بالأرقام والكلمات، والمقبوض الآن وصندوقه ويومه حين يختلف (أو أنّه رُدّ للتاجر، مراجعة 0028 M3)، والباقي على الحساب، والتواقيع، وختم «ملغى» بيوم الإلغاء
 * من الخادم (voided_on، مراجعة 0028 S9: كان من ساعة الجهاز) وسببه.
 */
export function BirdSalePaper({ sale, orgName }: { sale: BirdSaleDetail; orgName: string }) {
  const money = sale.money;
  const rows: HallRow[] = sale.sources.map((source) => ({ key: source.stopId, hallName: source.hallName, birds: source.birds, netKg: source.netKg, avgKg: source.avgKg }));
  const separator = t('list.separator', '، ');
  return (
    <article className="card mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6" data-action="bird-paper">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <p className="text-lg font-semibold" data-action="org-name">
          {orgName}
        </p>
        <div className="flex flex-col items-end gap-0.5">
          <h2 className="text-2xl font-semibold" data-action="bird-paper-title">
            {t('birds.paper.title', 'فاتورة بيع دجاج لحم حيّ')}
          </h2>
          <p className="text-sm" data-action="bird-paper-no">
            {t('voucher.no', 'رقم:')} <Num>{sale.docNo}</Num>
          </p>
          <p className="text-sm" data-action="bird-paper-date">
            {t('voucher.date', 'التاريخ:')} <Num>{fmtDay(sale.soldOn)}</Num>
          </p>
          {sale.ticketOn !== sale.soldOn ? (
            <p className="text-sm" data-action="bird-paper-ticket-date">
              {t('birds.paper.ticket_day', 'يوم التذكرة وخروج الطيور:')} <Num>{fmtDay(sale.ticketOn)}</Num>
            </p>
          ) : null}
        </div>
      </header>
      {sale.status === 'void' ? (
        <div className="flex flex-col items-center gap-1 text-center" style={STAMP_STYLE} role="status" data-action="void-stamp">
          <strong className="text-2xl">{t('paper.void', 'ملغى')}</strong>
          <span className="text-sm">
            {sale.voidedOn
              ? t('paper.void.detail', 'أُلغي بتاريخ {day}. السبب: {reason}', { day: fmtDay(sale.voidedOn), reason: sale.voidReason ?? dash() })
              : t('birds.void.reason_only', 'السبب: {reason}', { reason: sale.voidReason ?? dash() })}
          </span>
        </div>
      ) : null}
      <PaperLine label={t('birds.paper.party', 'التاجر:')} action="bird-paper-party">
        {sale.partyName}
        {sale.partyPhone ? (
          <>
            {separator}
            <bdi dir="ltr">{sale.partyPhone}</bdi>
          </>
        ) : null}
      </PaperLine>
      <PaperLine label={t('birds.paper.site', 'الحقل:')} action="bird-paper-site">
        {sale.siteName}
      </PaperLine>
      <PaperLine label={t('birds.paper.ticket', 'تذكرة الوزن:')} action="bird-paper-ticket">
        <Num>{sale.ticket.ticketNo}</Num>
        {sale.ticket.vehicle !== null ? (
          <>
            {separator}
            {t('halls.ticket.paper.vehicle', 'السيارة:')} <bdi dir="ltr">{sale.ticket.vehicle}</bdi>
          </>
        ) : null}
        {sale.ticket.driver !== null ? (
          <>
            {separator}
            {t('halls.ticket.paper.driver', 'السائق:')} <bdi dir="ltr">{sale.ticket.driver}</bdi>
          </>
        ) : null}
      </PaperLine>
      <HallsTable caption={t('birds.paper.halls', 'القاعات')} rows={rows} totals={{ birds: sale.birds, netKg: sale.netKg, avgKg: sale.avgKg }} />
      <PaperLine label={t('birds.paper.deduction', 'التنزيل:')} action="bird-paper-deduction">
        {sale.deduction > 0n ? pctText(sale.deduction) : t('birds.paper.no_deduction', 'بلا تنزيل')}
      </PaperLine>
      <PaperLine label={t('birds.paper.billed', 'الوزن المحسوب:')} action="bird-paper-billed">
        {kgText(sale.billedKg)}
      </PaperLine>
      {money ? (
        <>
          <PaperLine label={t('birds.paper.price', 'سعر الكيلو:')} action="bird-paper-price">
            {dinarsText(money.unitPrice)}
          </PaperLine>
          <PaperLine label={t('birds.paper.total', 'المبلغ:')} action="bird-paper-total">
            {dinarsText(money.total)}
          </PaperLine>
          <p className="rounded-2xl border border-line px-3 py-2 font-semibold" data-action="bird-paper-words">
            {amountInWords(money.total)}
          </p>
          <PaperLine label={t('birds.paper.paid', 'المقبوض الآن:')} action="bird-paper-paid">
            {sale.paymentRefunded
              ? sale.accountName
                ? t('birds.paper.paid_refunded_box', 'قُبض في «{box}» ثمّ رُدّ للتاجر، فالمبلغ كلّه بالدين', { box: sale.accountName })
                : t('birds.paper.paid_refunded', 'قُبض ثمّ رُدّ للتاجر، فالمبلغ كلّه بالدين')
              : money.paidNow > 0n
                ? sale.accountName
                  ? t('birds.paper.paid_box', '{amount} في «{box}»', { amount: dinarsText(money.paidNow), box: sale.accountName })
                  : dinarsText(money.paidNow)
                : t('birds.paper.paid_none', 'لا شيء (المبلغ كلّه بالدين)')}
            {!sale.paymentRefunded && money.paidNow > 0n && sale.paidOn !== null && sale.paidOn !== sale.soldOn ? t('birds.paper.paid_day', ' بتاريخ {day}', { day: fmtDay(sale.paidOn) }) : ''}
          </PaperLine>
          <PaperLine label={t('birds.paper.credit', 'الباقي على الحساب:')} action="bird-paper-credit">
            {dinarsText(money.total - money.paidNow)}
          </PaperLine>
        </>
      ) : null}
      {sale.note !== null ? (
        <p className="text-sm" data-action="bird-paper-note">
          {t('birds.paper.note', 'ملاحظة: {note}', { note: sale.note })}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-6 pt-6" data-action="signatures">
        {[t('birds.sign.accountant', 'المحاسب'), t('birds.sign.receiver', 'المستلم')].map((role) => (
          <div key={role} className="text-sm" style={SIGN_STYLE}>
            {role}
          </div>
        ))}
      </div>
    </article>
  );
}
