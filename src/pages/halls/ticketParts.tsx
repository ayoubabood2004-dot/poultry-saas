import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import type { Milli } from '../../domain/money';
import type { WeighMethod } from '../../domain/weighTicket';
import { columnDecimals, countForm, fmtCounted, fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { TicketStatus, WeighTicket } from '../../lib/repo/weighTickets';
import { backLabel, backTarget } from './parts';

// قطع تذاكر الوزن (0028، العقد §10): أسماء الحالة والطريقة، والطرق إلى التذكرة وقائمتها وفاتورتها، وورقة التذكرة المطبوعة A5 (بلا سعر ولا تاجر،
// كلمة المالك: المال في الفاتورة وحدها). كلّها في حزمة القاعات الكسولة؛ والتوقيع وختم «ملغى» هنا بأنماط مضمّنة لا بأصناف جديدة ولا بقطع أوراق
// الحسابات (حزمتها وملفّ CSS الخاصّ بها مع قسم الحسابات وحده).

export const ticketPath = (id: string, back?: string): string => `/halls/ticket/${id}${back ? `?${new URLSearchParams({ back }).toString()}` : ''}`;
export const newTicketPath = (siteId: string | null, hallId: string | null, back?: string): string => {
  const params = new URLSearchParams();
  if (siteId) params.set('site', siteId);
  if (hallId) params.set('hall', hallId);
  if (back) params.set('back', back);
  const query = params.toString();
  return `/halls/ticket/new${query ? `?${query}` : ''}`;
};
/**
 * طريق الرجوع من صفحات التذاكر والإغلاق (?back=): «التقارير»، أو مسار في المبيعات (فاتورة الطيور وقائمتها)، أو ما يقبله backTarget (الرئيسية والحقول
 * والقاعات)، وإلّا البديل.
 */
export function ticketBack(value: string | null, fallback: string): string {
  if (value === '/reports' || (value !== null && /^\/sales(?:[/?][\w\-/=&%.?+]*)?$/u.test(value))) return value;
  return backTarget(value, fallback);
}

/** اسم زرّ الرجوع لوجهات التذاكر والإغلاق، وغيرها كما يسمّيها backLabel. */
export function ticketBackLabel(path: string): string {
  if (path.startsWith('/halls/tickets')) return t('halls.ticket.back_list', 'رجوع إلى تذاكر الوزن');
  if (path.startsWith('/halls/report/')) return t('halls.ticket.back_report', 'رجوع إلى تقرير الدورة');
  if (path.startsWith('/halls/ticket/')) return t('halls.ticket.back_ticket', 'رجوع إلى التذكرة');
  if (path.startsWith('/sales')) return t('halls.ticket.back_sales', 'رجوع إلى المبيعات');
  return backLabel(path);
}

/** فاتورة الطيور (شاشة المبيعات، حزمة المخزون). */
export const invoicePath = (ticketId: string): string => `/sales/birds/new?${new URLSearchParams({ ticket: ticketId }).toString()}`;
export const salePath = (saleId: string): string => `/sales/birds/${saleId}`;

export function statusLabel(status: TicketStatus, invoiced: boolean): string {
  if (status === 'draft') return t('halls.ticket.status.draft', 'مسوّدة');
  if (status === 'void') return t('halls.ticket.status.void', 'ملغاة');
  return invoiced ? t('halls.ticket.status.invoiced', 'صدرت فاتورتها') : t('halls.ticket.status.awaiting', 'بانتظار الفاتورة');
}

export const methodLabel = (method: WeighMethod): string => (method === 'scale' ? t('halls.ticket.method.scale', 'القبّان') : t('halls.ticket.method.crates', 'ميزان الأقفاص'));

const LRI = '\u{2066}';
const PDI = '\u{2069}';

/** عدد بإشارته معزولاً LTR («+12» و«-30»): بسطر عربي تنقلب الإشارة إلى يمين الرقم بلا عزل. */
export const signedCount = (n: number): string => (n === 0 ? fmtInt(0) : `${LRI}${n > 0 ? '+' : ''}${fmtInt(n)}${PDI}`);

/**
 * عدد الطيور بصيغة المعدود كفاتورة الطيور (sales/birdParts، بمفاتيحها ونصوصها): «طير واحد»، «طيران»، «5 طيور»، «60 طيراً»، «4,000 طير» (مراجعة
 * 0028 S6: كان «{n} طيراً» لكلّ عدد). لا تُستورد birdParts من هنا: حزمتها حزمة المخزون، واستيرادها يفصلها حزمةً مشتركة محفوظة.
 */
export function birdsText(n: number): string {
  return fmtCounted(BigInt(n) * 1000n, t('birds.unit', 'طير'), { one: t('birds.one', 'طير واحد'), two: t('birds.two', 'طيران'), few: t('birds.few', 'طيور'), many: t('birds.many', 'طيراً') });
}

/** عدد التذاكر بصيغة العدد: «تذكرة واحدة»، «تذكرتان»، «3 تذاكر»، «11 تذكرةً»، «100 تذكرة». */
export function ticketsCount(n: number): string {
  if (n === 1) return t('halls.tickets.count.one', 'تذكرة واحدة');
  if (n === 2) return t('halls.tickets.count.two', 'تذكرتان');
  const form = countForm(n);
  if (form === 'few') return t('halls.tickets.count.few', '{n} تذاكر', { n });
  if (form === 'many') return t('halls.tickets.count.many', '{n} تذكرةً', { n });
  return t('halls.tickets.count.hundreds', '{n} تذكرة', { n });
}

/** رقم التذكرة، أو «مسوّدة» قبل إكمالها. */
export const ticketName = (ticketNo: string | null): string => ticketNo ?? t('halls.ticket.status.draft', 'مسوّدة');

/** مراتب عمود كيلو: أقلّ ما يبيّن كلّ قيمه. */
export const kgDecimals = (values: readonly (Milli | null)[]): 0 | 1 | 2 | 3 =>
  columnDecimals(
    values.filter((value): value is Milli => value !== null),
    3,
  ) as 0 | 1 | 2 | 3;

const dash = () => t('halls.ticket.dash', '—');

type Stop = WeighTicket['stops'][number];

const SIGN_STYLE = { minWidth: '9rem', paddingTop: '2.25rem', paddingBottom: '0.25rem', borderBottom: '1px dotted currentColor' } as const;
const STAMP_STYLE = { border: '3px double rgb(220 38 38)', color: 'rgb(185 28 28)', borderRadius: '0.75rem', padding: '0.75rem 1rem' } as const;

/** ورقة التذكرة (A5): رقمها ويومها وحقلها وطريقتها والسيارة والسائق، وجدول القاعات بمجاميعه، ووزن الفارغ، والتواقيع، وختم «ملغى». بلا سعر ولا تاجر. */
export function TicketPaper({ ticket, orgName }: { ticket: WeighTicket; orgName: string }) {
  const kg = kgDecimals([...ticket.stops.flatMap((stop) => [stop.grossKg, stop.netKg]), ticket.netKg]);
  const kgCell = (value: Milli | null) => (value === null ? dash() : <Num>{fmtQtyCell(value, kg)}</Num>);
  const avgCell = (value: Milli | null) => (value === null ? dash() : <Num>{fmtQtyCell(value, 3)}</Num>);
  const columns: Column<Stop>[] = [
    { key: 'hall', header: t('halls.ticket.col.hall', 'القاعة'), cell: (stop) => stop.hallName },
    { key: 'birds', header: t('halls.ticket.col.birds', 'الطيور'), kind: 'number', cell: (stop) => (stop.birds === null ? dash() : <Num>{fmtInt(stop.birds)}</Num>), total: ticket.birds === null ? dash() : <Num>{fmtInt(ticket.birds)}</Num> },
    { key: 'crates', header: t('halls.ticket.col.crates', 'الأقفاص'), kind: 'number', cell: (stop) => (stop.crates === null ? dash() : <Num>{fmtInt(stop.crates)}</Num>), total: ticket.crates === null ? dash() : <Num>{fmtInt(ticket.crates)}</Num> },
    { key: 'gross', header: t('halls.ticket.col.gross', 'وزن الخابط (كغم)'), kind: 'number', cell: (stop) => kgCell(stop.grossKg) },
    { key: 'net', header: t('halls.ticket.col.net', 'الصافي (كغم)'), kind: 'number', cell: (stop) => kgCell(stop.netKg), total: kgCell(ticket.netKg) },
    { key: 'avg', header: t('halls.ticket.col.avg', 'معدّل الطير (كغم)'), kind: 'number', cell: (stop) => avgCell(stop.avgKg), total: avgCell(ticket.avgKg) },
  ];
  const weighings = ticket.method === 'crates' ? ticket.stops.flatMap((stop) => stop.weighings.map((weighing) => ({ ...weighing, hallName: stop.hallName }))) : [];
  const weighingKg = kgDecimals(weighings.map((weighing) => weighing.grossKg));
  const separator = t('list.separator', '، ');
  const facts = [
    t('halls.ticket.paper.day', 'اليوم: {day}', { day: fmtDay(ticket.onDate) }),
    t('halls.ticket.paper.site', 'الحقل: {site}', { site: ticket.siteName }),
    t('halls.ticket.paper.method', 'الوزن: {method}', { method: methodLabel(ticket.method) }),
  ].join(separator);
  return (
    <article className="card flex flex-col gap-3 p-4" data-action="ticket-paper">
      {orgName ? (
        <p className="text-sm text-ink-muted" data-action="ticket-org">
          {orgName}
        </p>
      ) : null}
      <h2 className="text-lg font-semibold" data-action="ticket-paper-title">
        {t('halls.ticket.paper.title', 'تذكرة وزن {no}', { no: ticketName(ticket.ticketNo) })}
      </h2>
      <p className="text-sm" data-action="ticket-facts">
        {facts}
      </p>
      {ticket.vehicle !== null || ticket.driver !== null ? (
        <p className="text-sm" data-action="ticket-vehicle">
          {ticket.vehicle !== null ? (
            <span>
              {t('halls.ticket.paper.vehicle', 'السيارة:')} <bdi dir="ltr">{ticket.vehicle}</bdi>
            </span>
          ) : null}
          {ticket.vehicle !== null && ticket.driver !== null ? separator : null}
          {ticket.driver !== null ? (
            <span>
              {t('halls.ticket.paper.driver', 'السائق:')} <bdi dir="ltr">{ticket.driver}</bdi>
            </span>
          ) : null}
        </p>
      ) : null}
      <DataTable caption={t('halls.ticket.paper.table', 'قاعات التذكرة')} columns={columns} rows={ticket.stops} rowKey={(stop) => stop.id} empty={dash()} totalLabel={t('halls.ticket.total', 'المجموع')} />
      {weighings.length ? (
        <DataTable
          caption={t('halls.ticket.paper.weighings', 'وزنات ميزان الأقفاص')}
          columns={[
            { key: 'hall', header: t('halls.ticket.col.hall', 'القاعة'), cell: (row) => row.hallName },
            { key: 'no', header: t('halls.ticket.col.weighing', 'الوزنة'), kind: 'number', cell: (row) => <Num>{fmtInt(row.weighingNo)}</Num> },
            { key: 'crates', header: t('halls.ticket.col.crates', 'الأقفاص'), kind: 'number', cell: (row) => <Num>{fmtInt(row.crates)}</Num> },
            { key: 'gross', header: t('halls.ticket.col.weight', 'الوزن (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.grossKg, weighingKg)}</Num> },
          ]}
          rows={weighings}
          rowKey={(row) => row.id}
          empty={dash()}
        />
      ) : null}
      <p className="text-sm" data-action="ticket-empty">
        {ticket.method === 'scale' && ticket.emptyKg !== null
          ? ticket.emptyWithCrates
            ? t('halls.ticket.paper.empty_with', 'وزن الفارغ مع الأقفاص: {kg} كغم.', { kg: fmtQtyCell(ticket.emptyKg, kgDecimals([ticket.emptyKg])) })
            : t('halls.ticket.paper.empty_without', 'وزن الفارغ بلا أقفاص: {kg} كغم، ووزن القفص الفارغ {crate} كغم.', {
                kg: fmtQtyCell(ticket.emptyKg, kgDecimals([ticket.emptyKg])),
                crate: ticket.crateKg === null ? dash() : fmtQtyCell(ticket.crateKg, kgDecimals([ticket.crateKg])),
              })
          : ticket.method === 'crates' && ticket.crateKg !== null
            ? t('halls.ticket.paper.crate', 'وزن القفص الفارغ: {crate} كغم.', { crate: fmtQtyCell(ticket.crateKg, kgDecimals([ticket.crateKg])) })
            : null}
      </p>
      {ticket.note !== null ? (
        <p className="text-sm" data-action="ticket-note">
          {t('halls.ticket.paper.note', 'ملاحظة: {note}', { note: ticket.note })}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-6 pt-6" data-action="signatures">
        {[t('halls.ticket.sign.worker', 'عامل القاعة'), t('halls.ticket.sign.driver', 'السائق'), t('halls.ticket.sign.receiver', 'المستلم')].map((role) => (
          <div key={role} className="text-sm" style={SIGN_STYLE}>
            {role}
          </div>
        ))}
      </div>
      {ticket.status === 'void' ? (
        <div className="flex flex-col items-center gap-1 text-center" style={STAMP_STYLE} role="status" data-action="void-stamp">
          <strong className="text-2xl">{t('paper.void', 'ملغى')}</strong>
          {ticket.voidReason !== null ? <span className="text-sm">{t('halls.ticket.void_reason', 'السبب: {reason}', { reason: ticket.voidReason })}</span> : null}
        </div>
      ) : null}
    </article>
  );
}
