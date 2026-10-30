import { useCallback, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { parseMoneyText } from '../../components/ui/MoneyInput';
import { Notice } from '../../components/ui/Notice';
import { Segmented } from '../../components/ui/Segmented';
import { SideToggle, type Side } from '../../components/ui/SideToggle';
import { toast } from '../../components/ui/Toast';
import type { DivisionKind } from '../../domain/divisions';
import type { Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError, RejectedError } from '../../lib/errors';
import { fmtDay, fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import * as parties from '../../lib/repo/parties';
import type { BalancesCursor, BookRef, PartyBalanceRow, PostRef } from '../../lib/repo/parties';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { bookLabel, defaultPeriod, divisionFilterLabel, SideAmount, VoidDialog } from './shared';

// أرصدة الافتتاح (خطّة المرحلة 1 WP3، المدير opening.post): الجهات صفوفاً والدفاتر أعمدةً، والجهة «عليه / له» بزرّ بدل الإشارة،
// وكل خانة برقمها ومرجعها لحالها (مرجع لكل خانة يبقى لحد ما تنعرف نتيجتها، FOUNDATION ٥١٩). التاريخ يوم تشغيل وحدة الدفتر
// (الافتتاح بيه أو قبله، FOUNDATION ٥٢١)، والخانة بافتتاح فعّال تعرضه ويّا «ألغِ».

const DIVISIONS: readonly DivisionKind[] = ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'];

interface Draft {
  text: string;
  side: Side;
  ref: PostRef;
}

const cellKey = (partyId: string, bookId: string) => `${partyId}|${bookId}`;

/** مبلغ الخانة موقّعاً بجهتها: «عليه» موجب و«له» سالب، أو null إذا مو مبلغاً صحيحاً أكبر من صفر. */
export function signedOpening(text: string, side: Side): Fils | null {
  const amount = parseMoneyText(text);
  if (amount === null || amount <= 0n) return null;
  return side === 'debit' ? amount : -amount;
}

export function OpeningCell({ row, book, draft, busy, onDraft, onSave, onVoid }: { row: PartyBalanceRow; book: BookRef; draft: Draft | undefined; busy: boolean; onDraft: (draft: Draft) => void; onSave: () => void; onVoid: () => void }) {
  const existing = row.cells.get(book.id)?.openingEntry ?? null;
  if (existing) {
    return (
      <span className="flex items-center justify-end gap-2">
        <SideAmount amount={existing.amount} />
        <Button size="sm" variant="ghost" onClick={onVoid} data-action="void-opening">
          {t('void.confirm', 'ألغِ')}
        </Button>
      </span>
    );
  }
  if (!book.goLiveOn) return <span className="text-xs text-ink-muted">{t('openings.no_go_live', 'حدّد يوم التشغيل أوّلاً')}</span>;
  const value = draft ?? { text: '', side: 'debit' as Side, ref: parties.newRef() };
  return (
    <span className="flex w-72 items-center gap-2">
      <input
        aria-label={t('openings.amount.for', 'الرصيد عند البداية لـ{party} في {book}', { party: row.name, book: bookLabel(book) })}
        inputMode="decimal"
        dir="ltr"
        autoComplete="off"
        className="input min-w-0 flex-1 text-end tabular-nums"
        value={value.text}
        onChange={(event) => onDraft({ ...value, text: event.target.value })}
      />
      <SideToggle label={t('openings.side', 'الجهة')} value={value.side} onChange={(side) => onDraft({ ...value, side })} />
      <Button size="sm" busy={busy} disabled={signedOpening(value.text, value.side) === null} onClick={onSave} data-action="save-opening">
        {t('openings.save', 'سجّل')}
      </Button>
    </span>
  );
}

export default function OpeningBalancesPage() {
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const allowed = workspace ? can(workspace.role, 'opening.post') : false;
  // الخانات لحد يوم الخادم (to = null): صفحة مفتوحة من أمس تشوف افتتاح اليوم وإلغاءه بعد التحديث.
  const from = useMemo(() => defaultPeriod().from, []);
  const [division, setDivision] = useState<DivisionKind>('feed_mill');
  const books = useLoad(parties.listBooks, workspace?.orgId ?? 'none');
  const shown = (books.data ?? []).filter((book) => book.divisionKind === division);
  const divisionId = shown[0]?.divisionId ?? null;
  const key = `${workspace?.orgId ?? 'none'}|${divisionId}`;
  const load = useCallback(() => parties.loadPartyBalances({ from, to: null, divisionId, nonzero: false, sort: 'name' }), [from, divisionId]);
  const first = useLoad(load, key);
  const [more, setMore] = useState<{ key: string; rows: readonly PartyBalanceRow[]; next: BalancesCursor | null } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ row: PartyBalanceRow; book: BookRef; entryId: string } | null>(null);
  const segmentId = useId();
  const extra = more?.key === key ? more : null;
  const rows = first.data ? [...first.data.rows, ...(extra?.rows ?? [])] : [];
  const next = extra ? extra.next : (first.data?.next ?? null);
  const refresh = () => {
    setMore(null);
    first.retry();
  };
  const save = (row: PartyBalanceRow, book: BookRef) => {
    const k = cellKey(row.partyId, book.id);
    const draft = drafts[k];
    const amount = draft ? signedOpening(draft.text, draft.side) : null;
    if (!draft || amount === null || !book.goLiveOn) return;
    setSaving(k);
    parties
      .recordOpeningBalance(draft.ref, { partyId: row.partyId, bookId: book.id, amount, onDate: book.goLiveOn })
      .then(
        () => {
          setDrafts((current) => {
            const { [k]: _done, ...rest } = current;
            void _done;
            return rest;
          });
          refresh();
          toast({ tone: 'success', title: t('openings.saved', 'حُفظ الرصيد عند البداية لـ«{party}» في {book}', { party: row.name, book: bookLabel(book) }) });
        },
        (caught: unknown) => {
          // الرفض أكيد ما انحفظ: مرجع جديد للخانة. «ما نعرف» يبقي مرجعها.
          if (caught instanceof RejectedError) setDrafts((current) => ({ ...current, [k]: { ...draft, ref: parties.newRef() } }));
          const { title, detail } = describeError(caught);
          toast({ tone: 'danger', title, detail });
        },
      )
      .finally(() => setSaving(null));
  };

  const header = <PageHeader title={t('openings.title', 'الأرصدة عند البداية')} subtitle={t('openings.subtitle', 'رصيد كل جهة بكل حساب يوم بدء العمل، «عليه» أو «له».')} />;
  if (!allowed) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={t('openings.forbidden', 'الأرصدة عند البداية للمدير ومالك المنشأة.')} />
      </div>
    );
  }
  const error = books.error ?? first.error;
  if (error instanceof NotConnectedError) {
    const { title, detail } = describeError(error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }
  const columns: Column<PartyBalanceRow>[] = [
    { key: 'name', header: t('party.name.col', 'الجهة'), sticky: true, cell: (row) => row.name },
    ...shown.map((book): Column<PartyBalanceRow> => ({
      key: book.id,
      header: book.goLiveOn ? t('openings.col', '{book} ({day})', { book: bookLabel(book), day: fmtDay(book.goLiveOn) }) : bookLabel(book),
      kind: 'number',
      cell: (row) => {
        const k = cellKey(row.partyId, book.id);
        const entryId = row.cells.get(book.id)?.openingEntry?.id ?? null;
        return (
          <OpeningCell
            row={row}
            book={book}
            draft={drafts[k]}
            busy={saving === k}
            onDraft={(draft) => setDrafts((current) => ({ ...current, [k]: draft }))}
            onSave={() => save(row, book)}
            onVoid={() => (entryId ? setVoiding({ row, book, entryId }) : undefined)}
          />
        );
      },
    })),
  ];
  return (
    <div className="flex flex-col gap-4">
      {header}
      <Link to="/accounts" className="text-sm text-brand-700 dark:text-brand-200">
        {t('statement.back', 'عُد إلى الحسابات')}
      </Link>
      <div id={segmentId}>
        <Segmented label={t('accounts.filter', 'الوحدة')} options={DIVISIONS.map((value) => ({ value, label: divisionFilterLabel(value) }))} value={division} onChange={setDivision} />
      </div>
      {error ? (
        <LoadFailed what={t('openings.title', 'الأرصدة عند البداية')} error={error} onRetry={() => (books.error ? books.retry() : refresh())} />
      ) : !first.data || !books.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <DataTable caption={t('openings.title', 'الأرصدة عند البداية')} columns={columns} rows={rows} rowKey={(row) => row.partyId} empty={t('openings.empty', 'لا جهات بعد؛ أضفها من صفحة الحسابات.')} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span>{t('items.count', '{shown} من المجموع {total}', { shown: fmtInt(rows.length), total: fmtInt(first.data.total ?? rows.length) })}</span>
            {next ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  parties.loadPartyBalances({ from, to: null, divisionId, nonzero: false, sort: 'name', after: next }).then(
                    (page) => setMore({ key, rows: [...(extra?.rows ?? []), ...page.rows], next: page.next }),
                    (caught: unknown) => {
                      const { title, detail } = describeError(caught, 'read');
                      toast({ tone: 'danger', title, detail });
                    },
                  )
                }
                data-action="more-openings"
              >
                {t('items.more', 'حمّل المزيد')}
              </Button>
            ) : null}
          </div>
        </>
      )}
      {voiding ? (
        <VoidDialog
          slot={voiding.entryId}
          title={t('openings.void.title', 'إلغاء الرصيد عند البداية لـ«{party}» في {book}', { party: voiding.row.name, book: bookLabel(voiding.book) })}
          consequence={t('openings.void.consequence', 'تُكتب حركة تلغي السابقة بتاريخ اليوم ويُعاد تسديد ما انفكّ من الأقدم، ثم يُسجَّل الرصيد الصحيح من الخانة نفسها.')}
          run={(clientRef, reason) => parties.voidEntry(clientRef, voiding.entryId, reason)}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
