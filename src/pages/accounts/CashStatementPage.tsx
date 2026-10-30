import { Printer } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { cashSides, LedgerTable } from '../../components/ui/LedgerTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import type { LedgerEntry } from '../../domain/ledger';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError } from '../../lib/errors';
import { fmtDay, fmtMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as cash from '../../lib/repo/cash';
import type { CashLine, CashStatement } from '../../lib/repo/cash';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { cashKindLabel, cashMoveKindLabel, defaultPeriod, PeriodFilter, VoidDialog } from './shared';

// كشف الصندوق (خطّة المرحلة 1 WP3، Q12): نفس الجدول الكلاسيكي بستّة أعمدة، و«وارد | صادر» بدل «عليه | له»، ورصيد جارٍ من
// المدوَّر (من الخادم)، والسالب بإشارته؛ والطباعة بكل الصفوف؛ وإلغاء الرصيد الافتتاحي والنقل للمدير (القبض والدفع من كشف الجهة).

export function cashMemo(line: CashLine): string {
  const kind = cashMoveKindLabel(line.kind);
  const base = line.reverses ? t('statement.memo.reversal', 'إلغاء {kind}', { kind }) : kind;
  const who = line.party ?? line.note;
  return who ? t('statement.memo.reason', '{base}: {reason}', { base, reason: who }) : base;
}

/**
 * نتيجة إلغاء حركة الصندوق بكلماتها (مراجعة WP8): المبلغ واتّجاهه وملاحظته، فنقلان بنفس اليوم ما يتشابهان بالتأكيد (FOUNDATION ٧٦٦).
 * المبالغ بالدينار الصحيح (قيد cash_moves).
 */
export function cashVoidSentence(line: CashLine): string {
  const amount = fmtMoney(line.inflow + line.outflow, 0);
  const note = line.note ? t('cash.void.note', ' (الملاحظة: {note})', { note: line.note }) : '';
  if (line.kind !== 'transfer') return t('cash.void.opening', 'يُعكس الرصيد الافتتاحي {amount} بتاريخ اليوم، ثم يُسجَّل الصحيح من صفحة الصناديق.', { amount });
  return line.inflow > 0n
    ? t('cash.void.transfer_in', 'يُعكس نقل {amount} الوارد إلى هذا الصندوق{note} بوجهيه (الصندوقين) بتاريخ اليوم.', { amount, note })
    : t('cash.void.transfer_out', 'يُعكس نقل {amount} الصادر من هذا الصندوق{note} بوجهيه (الصندوقين) بتاريخ اليوم.', { amount, note });
}

export function cashEntries(statement: CashStatement): LedgerEntry[] {
  return statement.lines.map((line) => ({ date: line.onDate, doc: line.docNo ?? '', memo: cashMemo(line), debit: line.inflow, credit: line.outflow }));
}

export function CashLedger({ statement }: { statement: CashStatement }) {
  return <LedgerTable caption={t('cash.statement.of', 'كشف {name}', { name: statement.account.name })} entries={cashEntries(statement)} opening={statement.broughtForward} sides={cashSides()} />;
}

export default function CashStatementPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const allowed = session.status === 'ready' ? can(session.workspace.role, 'void') : false;
  const [period, setPeriod] = useState(defaultPeriod);
  const [voiding, setVoiding] = useState<CashLine | null>(null);
  const load = useCallback(() => cash.loadCashStatement(id, period.from, period.to), [id, period]);
  const statement = useLoad(load, `${id}|${period.from}|${period.to}`);
  const account = statement.data?.account ?? null;
  const header = (
    <PageHeader
      title={account ? account.name : t('cash.statement', 'كشف الصندوق')}
      subtitle={account ? cashKindLabel(account.kind) : undefined}
      actions={
        <Button size="sm" variant="secondary" icon={<Printer aria-hidden="true" className="size-4" />} onClick={() => window.print()} data-action="print-cash" data-print="hide">
          {t('statement.print', 'اطبع')}
        </Button>
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
  const voids = allowed && statement.data ? statement.data.lines.filter((line) => (line.kind === 'opening' || line.kind === 'transfer') && !line.reverses && !line.reversed) : [];
  const columns: Column<CashLine>[] = [
    {
      key: 'actions',
      header: t('org.col.actions', 'إجراءات'),
      cell: (line) => (
        <Button size="sm" variant="ghost" onClick={() => setVoiding(line)} data-action="void-cash-move">
          {t('void.confirm', 'ألغِ')}
        </Button>
      ),
    },
    { key: 'date', header: t('ledger.date', 'التاريخ'), cell: (line) => <Num>{fmtDay(line.onDate)}</Num> },
    { key: 'memo', header: t('ledger.memo', 'البيان'), wrap: true, cell: (line) => cashMemo(line) },
    { key: 'amount', header: t('statement.amount', 'المبلغ'), kind: 'number', cell: (line) => <Num>{fmtMoney(line.inflow - line.outflow, 0)}</Num> },
  ];
  return (
    <div className="flex flex-col gap-4" data-print-area>
      {header}
      <Link to="/accounts/cash" className="text-sm text-brand-700 dark:text-brand-200" data-print="hide">
        {t('cash.back', 'عُد إلى الصناديق')}
      </Link>
      <PeriodFilter from={period.from} to={period.to} onApply={setPeriod} />
      {statement.error ? (
        <LoadFailed what={t('cash.statement', 'كشف الصندوق')} error={statement.error} onRetry={statement.retry} />
      ) : !statement.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          {statement.data.closing < 0n ? <Notice tone="warning" title={t('cash.negative.title.now', 'رصيد الصندوق سالب')} /> : null}
          <CashLedger statement={statement.data} />
          {voids.length ? (
            <div data-print="hide">
              <DataTable caption={t('cash.voids', 'حركات تُلغى من الصندوق')} columns={columns} rows={voids} rowKey={(line) => line.moveId} empty="" />
            </div>
          ) : null}
        </>
      )}
      {voiding ? (
        <VoidDialog
          slot={voiding.moveId}
          title={t('cash.void.title', 'إلغاء {kind} بتاريخ {day}', { kind: cashMoveKindLabel(voiding.kind), day: fmtDay(voiding.onDate) })}
          consequence={cashVoidSentence(voiding)}
          run={(clientRef, reason) => cash.voidCashMove(clientRef, voiding.moveId, reason)}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            statement.retry();
            toast({ tone: 'success', title: t('void.done.cash', 'أُلغيت الحركة') });
          }}
        />
      ) : null}
    </div>
  );
}
