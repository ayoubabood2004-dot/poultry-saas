import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { can } from '../../domain/permissions';
import { fmtDay, fmtInt, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { reopenFlock, returnHallCarry, type CloseLine, type CloseResult } from '../../lib/repo/flockClose';
import type { CarryIn, CycleSales } from '../../lib/repo/halls';
import { useSession } from '../../lib/session';
import { amountText, failureText, surelyUnsaved } from './GivePage';
import { kgDecimals, signedCount, statusLabel, ticketName, ticketPath } from './ticketParts';

// أقسام البيع والإغلاق في تقرير الدورة (0028، العقد §6 و§10): تذاكر الدورة وفواتيرها (المباع من الفواتير المرحّلة)، والإغلاق بفرق العدّ ومصير كلّ باقٍ
// ومستنداته (FR)، والعلف المنقول من الدورة السابقة؛ و«أعد فتح الدورة» للمدير (flock.manage والإلغاء) بسبب، وتأكيده يسمّي مستندات الإرجاع وما يحدث لها،
// و«أرجعه إلى مخزن» لكلّ علف منقول معلَّق (المخازن من سطره). كلّ فعل نداء واحد بمرجعه، والإعادة بعد نتيجة مجهولة بالمرجع نفسه: الخادم يرفض الثاني
// (already_reopened وcarry_not_pending) فلا يتكرّر شيء. بلا مال (المال في قسم الكلفة لأدوار الكلفة).

const dash = () => t('halls.close.dash', '—');
type Sale = CycleSales['tickets'][number];

/** التذاكر وفواتيرها: المباع من الفواتير المرحّلة، وطيور التذاكر بلا فاتورة جملةً تحتها. */
export function SalesSection({ sales, back }: { sales: CycleSales; back: string }) {
  const kg = kgDecimals([...sales.tickets.map((row) => row.netKg), sales.netKg]);
  const columns: Column<Sale>[] = [
    {
      key: 'ticket',
      header: t('halls.tickets.col.ticket', 'التذكرة'),
      cell: (row) => (
        <Link to={ticketPath(row.ticketId, back)} className="font-semibold text-brand-700 dark:text-brand-200" data-action="rep-ticket">
          <bdi dir="ltr">{ticketName(row.ticketNo)}</bdi>
        </Link>
      ),
    },
    { key: 'day', header: t('halls.tickets.col.day', 'اليوم'), cell: (row) => <Num>{fmtDay(row.onDate)}</Num> },
    { key: 'birds', header: t('halls.ticket.col.birds', 'الطيور'), kind: 'number', cell: (row) => (row.birds === null ? dash() : <Num>{fmtInt(row.birds)}</Num>), total: <Num>{fmtInt(sales.birds)}</Num> },
    { key: 'net', header: t('halls.ticket.net', 'الصافي (كغم)'), kind: 'number', cell: (row) => (row.netKg === null ? dash() : <Num>{fmtQtyCell(row.netKg, kg)}</Num>), total: <Num>{fmtQtyCell(sales.netKg, kg)}</Num> },
    {
      key: 'avg',
      header: t('halls.ticket.avg', 'معدّل الطير (كغم)'),
      kind: 'number',
      cell: (row) => (row.avgKg === null ? dash() : <Num>{fmtQtyCell(row.avgKg, 3)}</Num>),
      total: sales.avgKg === null ? dash() : <Num>{fmtQtyCell(sales.avgKg, 3)}</Num>,
    },
    { key: 'status', header: t('halls.tickets.col.status', 'الحالة'), cell: (row) => statusLabel(row.status, row.invoiced) },
    { key: 'doc', header: t('halls.tickets.col.sale', 'الفاتورة'), cell: (row) => (row.docNo === null ? dash() : <bdi dir="ltr">{row.docNo}</bdi>) },
  ];
  return (
    <section className="flex flex-col gap-2" data-action="rep-sales">
      <h2 className="text-lg font-semibold">{t('halls.rep.sec.sales', 'البيع')}</h2>
      <p className="text-sm text-ink-muted" data-action="rep-sales-note">
        {t('halls.rep.sales_note', 'المجموع من الفواتير المرحّلة وحدها؛ والطيور تخرج من القاعة عند الفاتورة.')}
        {sales.pendingBirds > 0 ? t('halls.rep.sales_pending', ' وعلى تذاكر بلا فاتورة {n} طيراً.', { n: sales.pendingBirds }) : ''}
      </p>
      <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible">
        <DataTable
          caption={t('halls.rep.sec.sales', 'البيع')}
          columns={columns}
          rows={sales.tickets}
          rowKey={(row) => row.ticketId}
          empty={t('halls.rep.sales_empty', 'لا تذاكر وزن لهذه الدورة بعد.')}
          totalLabel={t('halls.rep.sales_total', 'المباع بالفواتير')}
        />
      </div>
    </section>
  );
}

function actionText(line: CloseLine): string {
  if (line.action === 'consumed') return t('halls.close.line.consumed', 'حُسب مستهلَكاً');
  if (line.action === 'return') return t('halls.close.line.return', 'رجع إلى «{store}»', { store: line.warehouseName ?? '' });
  switch (line.carryStatus) {
    case 'applied':
      return line.appliedOn ? t('halls.close.line.applied', 'نُقل إلى الدورة التالية يوم {day}', { day: fmtDay(line.appliedOn) }) : t('halls.close.line.applied_plain', 'نُقل إلى الدورة التالية');
    case 'returned':
      return t('halls.close.line.returned', 'نُقل ثمّ أُرجع إلى «{store}»', { store: line.warehouseName ?? '' });
    case 'void':
      return t('halls.close.line.void', 'أُلغي بإعادة فتح الدورة');
    default:
      return t('halls.close.line.pending', 'معلَّق في القاعة للدورة التالية');
  }
}

/** «أرجعه إلى مخزن» لعلف منقول معلَّق: مخزن جاء منه (من سطره)، ونداء واحد بمعرّف إرجاع من الجهاز. */
function ReturnCarryDialog({ line, onClose, onDone }: { line: CloseLine; onClose: () => void; onDone: () => void }) {
  const id = useId();
  const usable = line.stores.filter((store) => store.usable);
  const [store, setStore] = useState<string>(usable.length === 1 ? (usable[0]?.warehouseId ?? '') : '');
  const [ids, setIds] = useState(() => ({ ref: crypto.randomUUID(), returnId: crypto.randomUUID() }));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unknown, setUnknown] = useState(false);
  const send = async () => {
    if (busy || store === '') return;
    setBusy(true);
    setFailure(null);
    try {
      const done = await returnHallCarry(ids.ref, ids.returnId, line.lineId, store);
      toast({ tone: 'success', title: t('halls.close.returned_done', 'أُرجع «{item}» إلى المخزن بالمستند {doc}.', { item: line.itemName, doc: done.docNo }) });
      onDone();
    } catch (problem) {
      if (!surelyUnsaved(problem)) setUnknown(true);
      else {
        setUnknown(false);
        setIds({ ref: crypto.randomUUID(), returnId: crypto.randomUUID() });
        setFailure(problem);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy || unknown}
      title={t('halls.close.return_title', 'أرجع «{item}» ({qty}) إلى مخزن', { item: line.itemName, qty: amountText(line.qty, line.baseUnit) })}
      footer={
        <Button busy={busy} disabled={store === ''} onClick={() => void send()} data-action="carry-return-go">
          {unknown ? t('issue.retry', 'أعد المحاولة') : t('halls.close.return_go', 'أرجعه إلى المخزن')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{t('halls.close.return_body', 'يرجع إلى مخزن جاء منه بقيمته المنقولة، ولا تتغيّر كلفة الدورة المغلقة. ولا يُنقل بعدها إلى الدورة التالية.')}</p>
        <Field id={`${id}-store`} label={t('halls.close.col.store', 'المخزن')}>
          <select id={`${id}-store`} className="input" value={store} disabled={busy || unknown} onChange={(event) => setStore(event.target.value)} data-action="carry-return-store">
            <option value="">{t('halls.close.store_pick', 'اختر المخزن')}</option>
            {line.stores.map((entry) => (
              <option key={entry.warehouseId} value={entry.warehouseId} disabled={!entry.usable}>
                {entry.usable ? entry.name : t('halls.close.store_unusable', '{store} ({why})', { store: entry.name, why: entry.why === 'archived' ? t('halls.close.store_archived', 'مؤرشف') : t('halls.close.store_scope', 'خارج نطاقك') })}
              </option>
            ))}
          </select>
        </Field>
        {unknown ? <Notice tone="warning" title={t('halls.close.return_unknown', 'لا نعرف إن أُرجع: أعد المحاولة؛ لن يُرجع مرّتين.')} /> : null}
        {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
      </div>
    </Dialog>
  );
}

/** «أعد فتح الدورة»: سببها، وتأكيد يسمّي مستندات الإرجاع وما يحدث للعلف وفرق العدّ والفوج. */
function ReopenDialog({ close, onClose, onDone }: { close: CloseResult; onClose: () => void; onDone: () => void }) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [unknown, setUnknown] = useState(false);
  const docs = close.lines.flatMap((line) => (line.returnDocNo ? [line.returnDocNo] : []));
  const separator = t('list.separator', '، ');
  const send = async () => {
    if (busy || reason.trim() === '' || reason.trim().length > 500) return;
    setBusy(true);
    setFailure(null);
    try {
      await reopenFlock(close.id, reason, ref);
      toast({ tone: 'success', title: t('halls.reopen.done', 'أُعيد فتح دورة «{hall}».', { hall: close.hallName }) });
      onDone();
    } catch (problem) {
      if (!surelyUnsaved(problem)) setUnknown(true);
      else {
        setUnknown(false);
        setRef(crypto.randomUUID());
        setFailure(problem);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy || unknown}
      dirty={reason.trim() !== ''}
      title={t('halls.reopen.title', 'أعد فتح دورة «{hall}» المغلقة يوم {day}؟', { hall: close.hallName, day: fmtDay(close.closedOn) })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={busy || unknown} onClick={onClose}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button variant="danger" busy={busy} disabled={reason.trim() === '' || reason.trim().length > 500} onClick={() => void send()} data-action="reopen-go">
            {unknown ? t('issue.retry', 'أعد المحاولة') : t('halls.reopen.go', 'أعد فتح الدورة')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p data-action="reopen-text">
          {docs.length
            ? t('halls.reopen.body_docs', 'تُلغى مستندات الإرجاع {docs} ويعود العلف من المخزن إلى حساب القاعة، ويُلغى فرق العدّ، ويعود الفوج قائماً.', { docs: docs.join(separator) })
            : t('halls.reopen.body', 'يُلغى فرق العدّ وما نُقل للدورة التالية، ويعود الفوج قائماً.')}
          {t('halls.reopen.invoices', ' والفواتير تبقى مرحّلة.')}
        </p>
        <Field id={`${id}-reason`} label={t('halls.reopen.reason', 'سبب إعادة الفتح')} error={reason.trim().length > 500 ? t('halls.close.reason_long', 'السبب حتى 500 حرف.') : null}>
          <input id={`${id}-reason`} className="input" autoComplete="off" value={reason} disabled={busy || unknown} onChange={(event) => setReason(event.target.value)} data-action="reopen-reason" />
        </Field>
        {unknown ? <Notice tone="warning" title={t('halls.reopen.unknown', 'لا نعرف إن أُعيد فتح الدورة: أعد المحاولة؛ لن يتكرّر شيء.')} /> : null}
        {failure ? <Notice tone="danger" title={failureText(failure)} /> : null}
      </div>
    </Dialog>
  );
}

/** الإغلاق في التقرير: يومه وفرق العدّ وسببه، ومصير كلّ باقٍ ومستنده؛ و«أعد فتح الدورة» و«أرجعه إلى مخزن» للمدير. */
export function CloseSection({ close, reopenFirst, onChanged }: { close: CloseResult; reopenFirst: boolean; onChanged: () => void }) {
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const manager = role !== null && can(role, 'flock.manage');
  const mayReopen = manager && role !== null && can(role, 'void') && close.status === 'closed';
  const [reopening, setReopening] = useState(reopenFirst && mayReopen);
  const [returning, setReturning] = useState<CloseLine | null>(null);
  const kg = kgDecimals(close.lines.map((line) => line.kg));
  const columns: Column<CloseLine>[] = [
    { key: 'item', header: t('halls.close.col.item', 'المادّة'), wrap: true, cell: (line) => line.itemName },
    { key: 'qty', header: t('halls.close.col.left', 'الباقي'), cell: (line) => amountText(line.qty, line.baseUnit) },
    { key: 'kg', header: t('halls.rep.col.kg', 'الكيلو (كغم)'), kind: 'number', cell: (line) => (line.kg === null ? dash() : <Num>{fmtQtyCell(line.kg, kg)}</Num>) },
    {
      key: 'fate',
      header: t('halls.close.col.action', 'المصير'),
      wrap: true,
      cell: (line) => (
        <span className="flex flex-col gap-1" data-action="close-line" data-status={line.carryStatus ?? line.action}>
          <span>{actionText(line)}</span>
          {line.action === 'carry' && line.carryStatus === 'pending' && manager && close.status === 'closed' ? (
            <span className="print:hidden">
              <Button size="sm" variant="secondary" onClick={() => setReturning(line)} data-action="carry-return">
                {t('halls.close.return', 'أرجعه إلى مخزن')}
              </Button>
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'doc', header: t('halls.rep.col.doc', 'المستند'), cell: (line) => (line.returnDocNo === null ? dash() : <bdi dir="ltr">{line.returnDocNo}</bdi>) },
  ];
  return (
    <section className="flex flex-col gap-2" data-action="rep-close">
      <h2 className="text-lg font-semibold">{t('halls.rep.sec.close', 'إغلاق الدورة')}</h2>
      <p data-action="rep-close-line">
        {close.status === 'closed' ? t('halls.rep.closed_on', 'أُغلقت يوم {day}.', { day: fmtDay(close.closedOn) }) : t('halls.rep.reopened', 'أُغلقت يوم {day} ثمّ أُعيد فتحها.', { day: fmtDay(close.closedOn) })}{' '}
        {t('halls.rep.close_sold', 'المباع من الفواتير {birds} طيراً صافيها {kg} كغم.', { birds: close.soldBirds, kg: fmtQtyCell(close.soldNetKg, kgDecimals([close.soldNetKg])) })}
      </p>
      {close.countDiff !== 0 ? (
        <p className="text-sm" data-action="rep-close-count">
          {t('halls.rep.close_count', 'فرق العدّ عند الإغلاق {n} (الحيّ قبله {live})، وسببه: {reason}', { n: signedCount(close.countDiff), live: close.liveBefore, reason: close.countReason ?? dash() })}
        </p>
      ) : null}
      {close.note ? <p className="text-sm text-ink-muted">{t('halls.rep.close_note', 'ملاحظة الإغلاق: {note}', { note: close.note })}</p> : null}
      {close.lines.length ? (
        <div className="print:[&>div]:max-h-none print:[&>div]:overflow-visible">
          <DataTable caption={t('halls.rep.close_lines', 'الباقي عند الإغلاق')} columns={columns} rows={close.lines} rowKey={(line) => line.lineId} empty={dash()} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t('halls.rep.close_no_lines', 'لا باقٍ مكتوب: كلّ ما نزل للقاعة حُسب مستهلَكاً.')}</p>
      )}
      {mayReopen ? (
        <div className="print:hidden">
          <Button variant="secondary" onClick={() => setReopening(true)} data-action="reopen-open">
            {t('halls.reopen.go', 'أعد فتح الدورة')}
          </Button>
        </div>
      ) : null}
      {reopening && mayReopen ? (
        <ReopenDialog
          close={close}
          onClose={() => setReopening(false)}
          onDone={() => {
            setReopening(false);
            onChanged();
          }}
        />
      ) : null}
      {returning ? (
        <ReturnCarryDialog
          line={returning}
          onClose={() => setReturning(null)}
          onDone={() => {
            setReturning(null);
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

/** علف منقول إلى هذه الدورة من الدورة السابقة في القاعة. */
export function CarryInNote({ lines }: { lines: readonly CarryIn[] }) {
  if (!lines.length) return null;
  const separator = t('list.separator', '، ');
  return (
    <p className="text-sm" data-action="rep-carry-in">
      {t('halls.rep.carry_in', 'من الدورة السابقة في القاعة: {list}.', { list: lines.map((line) => t('halls.rep.carry_in_line', '{qty} «{item}»', { qty: amountText(line.qty, line.baseUnit), item: line.name })).join(separator) })}
    </p>
  );
}
