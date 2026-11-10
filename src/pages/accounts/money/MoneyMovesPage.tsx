import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/ui/Button';
import { DataTable, Num, type Column } from '../../../components/ui/DataTable';
import { Field } from '../../../components/ui/Field';
import { LoadFailed } from '../../../components/ui/LoadFailed';
import { Notice } from '../../../components/ui/Notice';
import { toast } from '../../../components/ui/Toast';
import { localDay, type Day } from '../../../domain/dates';
import type { Fils } from '../../../domain/money';
import { describeError, NotConnectedError } from '../../../lib/errors';
import { fmtDay, fmtInt, fmtMoney } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import * as cash from '../../../lib/repo/cash';
import * as money from '../../../lib/repo/money';
import type { MoneyClass, MoneyMove, MoneyMoves, MoneyMovesDay, MovesCursor } from '../../../lib/repo/money';
import { useSession } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { defaultPeriod, PartyPicker, PeriodFilter } from '../shared';
import { classLabel, dayParam, DocCell, LINK, moneyDecimals, monthStart, moveMemo, PILL } from './shared';

// «حركة الأموال» (عقد 0024 §4.2 وF2، خطّة المحاسبة §8.1 1-ب): جدول واحد لكلّ حركة نقدية في كلّ الصناديق، بأعمدة التاريخ | رقم السند | الصندوق |
// النوع | الجهة | البيان | وارد | صادر | الرصيد. الفلاتر بالرابط (from وto وaccount وclass وparty، فرابط «حركات اليوم» و«الجهة» يفتحها جاهزة)،
// والمدّة افتراضاً من أوّل الشهر إلى يوم الخادم. الصفحات بمؤشّر الخادم المبهم («حمّل المزيد» يضيف ويُسقط المكرّر بمعرّف الحركة)، ومجموع كلّ يوم
// بعد آخر حركاته حين تكتمل حركاته المحمّلة (المجموع من الخادم بكامل اليوم، فلا يُعرض قبل أن يُرى اليوم كلّه)، والرصيد الجاري بلا فلتر نوع ولا جهة
// وحده. كلّ رقم يفتح سنده أو مستنده (§5)، والصندوق كشفه، والجهة كشفها؛ والعكس بعلامته «إلغاء».

const CLASS_SET: ReadonlySet<string> = new Set(money.MONEY_CLASSES);
const classParam = (value: string | null): MoneyClass | null => (value !== null && CLASS_SET.has(value) ? (value as MoneyClass) : null);

/** صفحات الجدول مدموجة: الحركات بلا تكرار (بمعرّفها)، ومجاميع الأيام (الأحدث يغلب)، ومؤشّر آخر صفحة. */
export function mergePages(pages: readonly MoneyMoves[]): { rows: MoneyMove[]; days: Map<Day, MoneyMovesDay>; next: MovesCursor | null } {
  const seen = new Set<string>();
  const rows: MoneyMove[] = [];
  const days = new Map<Day, MoneyMovesDay>();
  for (const page of pages) {
    for (const row of page.rows) {
      if (seen.has(row.moveId)) continue;
      seen.add(row.moveId);
      rows.push(row);
    }
    for (const day of page.days) days.set(day.onDate, day);
  }
  return { rows, days, next: pages.length ? (pages[pages.length - 1]?.next ?? null) : null };
}

export type MovesLine = { kind: 'move'; move: MoneyMove } | { kind: 'day'; day: MoneyMovesDay };

/** صفوف الجدول: الحركات بترتيبها، وبعد آخر حركة من كلّ يوم اكتملت حركاته المحمّلة (عددها = عدد اليوم من الخادم) صفّ مجموعه. */
export function movesLines(rows: readonly MoneyMove[], days: ReadonlyMap<Day, MoneyMovesDay>): MovesLine[] {
  const loaded = new Map<Day, number>();
  for (const row of rows) loaded.set(row.onDate, (loaded.get(row.onDate) ?? 0) + 1);
  const lines: MovesLine[] = [];
  rows.forEach((row, index) => {
    lines.push({ kind: 'move', move: row });
    if (rows[index + 1]?.onDate === row.onDate) return;
    const day = days.get(row.onDate);
    if (day && (loaded.get(row.onDate) ?? 0) >= day.count) lines.push({ kind: 'day', day });
  });
  return lines;
}

const strong = (node: ReactNode) => <span className="font-semibold">{node}</span>;

export function MovesTable({ running, lines, totals, closing }: { running: boolean; lines: readonly MovesLine[]; totals: MoneyMoves['totals']; closing: Fils | null }) {
  const values: Fils[] = [totals.inflow, totals.outflow];
  for (const line of lines) {
    if (line.kind === 'move') values.push(line.move.inflow, line.move.outflow, ...(line.move.balance === null ? [] : [line.move.balance]));
    else values.push(line.day.inflow, line.day.outflow);
  }
  const decimals = moneyDecimals(values);
  const amount = (value: Fils) => <Num>{fmtMoney(value, decimals)}</Num>;
  const side = (value: Fils) => (value === 0n ? null : amount(value));
  const columns: Column<MovesLine>[] = [
    { key: 'date', header: t('ledger.date', 'التاريخ'), cell: (line) => <Num>{fmtDay(line.kind === 'move' ? line.move.onDate : line.day.onDate)}</Num> },
    { key: 'doc', header: t('moves.col.doc', 'رقم السند'), cell: (line) => (line.kind === 'move' ? <DocCell row={line.move} /> : null) },
    {
      key: 'box',
      header: t('cash.col.name', 'الصندوق'),
      cell: (line) =>
        line.kind === 'move' ? (
          <Link to={`/accounts/cash/${line.move.accountId}`} className={LINK} data-action="move-box">
            {line.move.accountName}
          </Link>
        ) : null,
    },
    {
      key: 'class',
      header: t('moves.col.class', 'النوع'),
      cell: (line) =>
        line.kind === 'move' ? (
          <span className="inline-flex items-center gap-2">
            {classLabel(line.move.cls)}
            {line.move.reverses ? (
              <span className="text-xs font-semibold text-danger-700 dark:text-danger-300" data-action="move-reversal">
                {t('moves.reversal', 'إلغاء')}
              </span>
            ) : line.move.reversed ? (
              <span className="text-xs text-ink-muted" data-action="move-reversed">
                {t('moves.reversed', 'أُلغيت')}
              </span>
            ) : null}
          </span>
        ) : null,
    },
    {
      key: 'party',
      header: t('moves.col.party', 'الجهة'),
      cell: (line) =>
        line.kind === 'move' && line.move.partyId && line.move.partyName ? (
          <Link to={`/accounts/parties/${line.move.partyId}`} className={LINK} data-action="move-party">
            {line.move.partyName}
          </Link>
        ) : null,
    },
    { key: 'memo', header: t('ledger.memo', 'البيان'), wrap: true, cell: (line) => (line.kind === 'move' ? moveMemo(line.move) : strong(t('moves.day.total', 'مجموع اليوم'))) },
    {
      key: 'in',
      header: t('ledger.cash.in', 'وارد'),
      kind: 'number',
      cell: (line) => (line.kind === 'move' ? side(line.move.inflow) : strong(amount(line.day.inflow))),
      total: amount(totals.inflow),
    },
    {
      key: 'out',
      header: t('ledger.cash.out', 'صادر'),
      kind: 'number',
      cell: (line) => (line.kind === 'move' ? side(line.move.outflow) : strong(amount(line.day.outflow))),
      total: amount(totals.outflow),
    },
  ];
  if (running) {
    columns.push({
      key: 'balance',
      header: t('ledger.balance', 'الرصيد'),
      kind: 'number',
      cell: (line) => {
        const value = line.kind === 'move' ? line.move.balance : line.day.closing;
        if (value === null) return null;
        return line.kind === 'move' ? amount(value) : strong(amount(value));
      },
      total: closing === null ? null : amount(closing),
    });
  }
  return (
    <DataTable
      caption={t('moves.title', 'حركة الأموال')}
      columns={columns}
      rows={lines}
      rowKey={(line) => (line.kind === 'move' ? line.move.moveId : `day-${line.day.onDate}`)}
      empty={t('moves.empty', 'لا حركة نقدية بهذه المدّة والفلاتر.')}
      totalLabel={t('moves.total', 'مجموع المدّة')}
    />
  );
}

/** أرقام المدّة فوق الجدول: الرصيد في أوّلها وآخرها (بلا فلتر نوع ولا جهة وحده)، والوارد والصادر. */
function MovesStats({ data }: { data: MoneyMoves }) {
  const decimals = moneyDecimals([data.totals.inflow, data.totals.outflow, ...(data.opening === null ? [] : [data.opening]), ...(data.closing === null ? [] : [data.closing])]);
  const stats: { key: string; label: string; value: Fils }[] = [
    ...(data.opening !== null ? [{ key: 'opening', label: t('moves.opening', 'الرصيد في أوّل المدّة'), value: data.opening }] : []),
    { key: 'in', label: t('ledger.cash.in', 'وارد'), value: data.totals.inflow },
    { key: 'out', label: t('ledger.cash.out', 'صادر'), value: data.totals.outflow },
    ...(data.closing !== null ? [{ key: 'closing', label: t('moves.closing', 'الرصيد في آخر المدّة'), value: data.closing }] : []),
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-action="moves-stats">
      {stats.map((stat) => (
        <div key={stat.key} className="card p-3" data-action={`moves-${stat.key}`}>
          <dt className="text-xs text-ink-muted">{stat.label}</dt>
          <dd className="text-lg font-semibold">
            <Num>{fmtMoney(stat.value, decimals)}</Num>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function MoneyMovesPage() {
  const id = useId();
  const session = useSession();
  const orgId = session.status === 'ready' ? session.workspace.orgId : 'none';
  const [params, setParams] = useSearchParams();
  const today = localDay();
  const from = dayParam(params.get('from')) ?? monthStart(today);
  const to = dayParam(params.get('to'));
  const accountId = params.get('account') || null;
  const cls = classParam(params.get('class'));
  const partyId = params.get('party') || null;
  const key = `${orgId}|${from}|${to ?? ''}|${accountId ?? ''}|${cls ?? ''}|${partyId ?? ''}`;
  const load = useCallback(() => money.loadMoneyMoves({ from, to, accountId, cls, partyId }), [from, to, accountId, cls, partyId]);
  const first = useLoad(load, key);
  const boxesFrom = useMemo(() => defaultPeriod().from, []);
  const loadBoxes = useCallback(() => cash.loadCashBalances(boxesFrom, null), [boxesFrom]);
  const boxes = useLoad(loadBoxes, `${orgId}|boxes`);
  const [more, setMore] = useState<{ key: string; pages: readonly MoneyMoves[] } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [picking, setPicking] = useState(false);
  const extra = more?.key === key ? more.pages : [];
  const merged = first.data ? mergePages([first.data, ...extra]) : null;

  const setParam = (patch: Readonly<Record<string, string | null>>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [name, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(name);
          else next.set(name, value);
        }
        return next;
      },
      { replace: true },
    );
  const loadMore = () => {
    const after = merged?.next;
    if (!after) return;
    setLoadingMore(true);
    money
      .loadMoneyMoves({ from, to, accountId, cls, partyId, after })
      .then(
        (page) => setMore({ key, pages: [...extra, page] }),
        (error: unknown) => {
          const { title, detail } = describeError(error, 'read');
          toast({ tone: 'danger', title, detail });
        },
      )
      .finally(() => setLoadingMore(false));
  };

  const header = (
    <PageHeader
      title={t('moves.title', 'حركة الأموال')}
      subtitle={first.data ? t('moves.subtitle', 'كلّ حركة نقدية في الصناديق من {from} إلى {to}.', { from: fmtDay(first.data.from), to: fmtDay(first.data.to) }) : undefined}
    />
  );
  if (first.error instanceof NotConnectedError) {
    const { title, detail } = describeError(first.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  const accountName = first.data?.account?.name ?? null;
  const boxOptions = (boxes.data?.accounts ?? []).map((box) => ({ id: box.accountId, name: box.name }));
  if (accountId && !boxOptions.some((box) => box.id === accountId)) boxOptions.push({ id: accountId, name: accountName ?? t('moves.box.some', 'صندوق محدّد') });
  const partyName = merged?.rows.find((row) => row.partyId === partyId)?.partyName ?? null;
  const lines = merged ? movesLines(merged.rows, merged.days) : [];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {header}
      <Link to="/accounts" className={`${LINK} text-sm`}>
        {t('hub.back', 'عُد إلى خلاصة المال')}
      </Link>
      <PeriodFilter key={`${from}|${to ?? today}`} from={from} to={to ?? today} onApply={(period) => setParam({ from: period.from, to: period.to })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-box`} label={t('cash.col.name', 'الصندوق')}>
          <select id={`${id}-box`} className="input" value={accountId ?? ''} onChange={(event) => setParam({ account: event.target.value || null })} data-action="filter-box">
            <option value="">{t('moves.box.all', 'كلّ الصناديق')}</option>
            {boxOptions.map((box) => (
              <option key={box.id} value={box.id}>
                {box.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-class`} label={t('moves.col.class', 'النوع')}>
          <select id={`${id}-class`} className="input" value={cls ?? ''} onChange={(event) => setParam({ class: event.target.value || null })} data-action="filter-class">
            <option value="">{t('moves.class.all', 'كلّ الأنواع')}</option>
            {money.MONEY_CLASSES.map((option) => (
              <option key={option} value={option}>
                {classLabel(option)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {partyId ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-action="filter-party-chosen">
          <span>{t('moves.party.chosen', 'الجهة: {name}', { name: partyName ?? t('moves.party.some', 'جهة محدّدة') })}</span>
          <Button size="sm" variant="ghost" onClick={() => setParam({ party: null })} data-action="filter-party-clear">
            {t('moves.party.clear', 'كلّ الجهات')}
          </Button>
        </div>
      ) : picking ? (
        <div className="flex flex-col gap-2">
          <PartyPicker
            id={`${id}-party`}
            value={null}
            onChange={(party) => {
              setPicking(false);
              if (party) setParam({ party: party.id });
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => setPicking(false)} data-action="filter-party-cancel">
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
        </div>
      ) : (
        <div>
          <button type="button" className={PILL} onClick={() => setPicking(true)} data-action="filter-party">
            {t('moves.party.pick', 'حركات جهة واحدة')}
          </button>
        </div>
      )}
      {first.error ? (
        <LoadFailed what={t('moves.title', 'حركة الأموال')} error={first.error} onRetry={first.retry} />
      ) : !first.data || !merged ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <MovesStats data={first.data} />
          {first.data.running ? null : <p className="text-sm text-ink-muted">{t('moves.no_balance', 'لا رصيد جارياً مع فلتر النوع أو الجهة: الأرقام لما يطابق الفلتر وحده.')}</p>}
          <MovesTable running={first.data.running} lines={lines} totals={first.data.totals} closing={first.data.closing} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span data-action="moves-count">{t('items.count', '{shown} من المجموع {total}', { shown: fmtInt(merged.rows.length), total: fmtInt(first.data.totals.count) })}</span>
            {merged.next ? (
              <Button size="sm" variant="secondary" busy={loadingMore} onClick={loadMore} data-action="more-moves">
                {t('items.more', 'حمّل المزيد')}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
