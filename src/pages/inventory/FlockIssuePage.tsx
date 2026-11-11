import { PackageMinus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { toast } from '../../components/ui/Toast';
import { can } from '../../domain/permissions';
import type { BaseUnit } from '../../domain/units';
import { describeError, RejectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadFlockFeed, type FeedIssue } from '../../lib/repo/flocks';
import { loadIssueOptions, voidFlockIssue } from '../../lib/repo/flockIssues';
import { useSession } from '../../lib/session';
import { useLoad, type LoadState } from '../../lib/useLoad';
import { BUTTON_LINK_CLASS, FeedLine, givePath } from '../farm/feed';

// سجلّ الصرف لفوج القاعة (0019، كلمة المالك 2026-11-07: «هاي المادة لمن اروح للقاعات اريد اصرفلهم مادة معينة الكي المواد الي اني صنعتها بالمعمل…
// ويكلي شكد عندك واكدر اصرف منها للقاعة»): علف القاعة بسطر، وسجلّ الصرف بجدول و«ألغِ» بسبب. والصرف نفسه طريق واحد (0026، كلمة المالك
// 2026-11-11): زرّ «أضف للقاعة» إلى صفحة الإضافة لعدّة قاعات (/halls/give)، وروابط ‎?open=1 القديمة (نافذة الصرف لمادّة واحدة، انشالت) تنتقل
// إليها. الصفحة في حزمة المخزون (تحتاج الخادم، خارج التثبيت المسبق بالاسم)، وشاشة الفوج تدلّ عليها.
// مراجعة الشاشات: فشل القراءة من جديد يُقال ولو بقي المعروض القديم؛ وقيمة الصرف الملغى «—» (المجموع صافي المرحَّل).

/** طريق الرجوع: صفحة الفوج أو الحقل وحدهما (لا رابط خارجي من المعامل). */
export function farmBack(value: string | null): string | null {
  return value !== null && /^\/(?:broiler|layers)(?:\/flock\/[\w-]+)?$/u.test(value) ? value : null;
}

/** آخر ما قُرئ يبقى معروضاً أثناء القراءة من جديد (النافذة المفتوحة لا تنطوي). */
function useKept<T>(state: LoadState<T>): T | null {
  const [kept, setKept] = useState<T | null>(null);
  if (state.data !== null && state.data !== kept) setKept(state.data);
  return state.data ?? kept;
}

const qtyText = (qty: bigint, unit: BaseUnit): string => {
  const shown = fmtQty(qty, unit);
  return shown.sub ?? shown.main;
};

const unitWord = (unit: BaseUnit): string => (unit === 'L' ? t('unit.L', 'لتر') : unit === 'pc' ? t('unit.pc', 'قطعة') : t('unit.kg', 'كغم'));

interface Voiding {
  issue: FeedIssue;
  reason: string;
  ref: string;
  busy: boolean;
  failure: unknown;
  /** أُرسل ولم يُعرف جوابه: السبب مقفول والإعادة بالمرجع نفسه. */
  sent: boolean;
}

export default function FlockIssuePage() {
  const { flockId = '' } = useParams();
  const [params] = useSearchParams();
  const back = farmBack(params.get('back'));
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const loadFeed = useCallback(() => loadFlockFeed(flockId), [flockId]);
  const loadOptions = useCallback(() => loadIssueOptions(flockId), [flockId]);
  const feedState = useLoad(loadFeed);
  const optionsState = useLoad(loadOptions);
  const feed = useKept(feedState);
  const options = useKept(optionsState);
  const [voiding, setVoiding] = useState<Voiding | null>(null);
  // «أضف للقاعة» لمن يصرف من المخزن أو يسجّل دواءً بلا مخزن والفوج قائم، والرجوع منها إلى هذا السجلّ (ومعه رجوعه).
  const canGive = feed?.flockStatus === 'active' && role !== null && (can(role, 'issue.post') || can(role, 'flock_day.save'));
  const here = back ? `/inventory/issue/${flockId}?${new URLSearchParams({ back }).toString()}` : `/inventory/issue/${flockId}`;

  const refresh = () => {
    feedState.retry();
    optionsState.retry();
  };

  // رابط قديم إلى نافذة الصرف (‎?open=1، انشالت): صفحة الإضافة مكانها، والرجوع منها إلى هنا. بـuseNavigate لا بـ<Navigate>: مكوّنه يدخل حزمة
  // الإقلاع من react-router (مئات البايتات) ولا شاشة غيره تستعمله.
  const navigate = useNavigate();
  const legacyOpen = params.get('open') === '1';
  const giveHere = givePath(flockId, here);
  useEffect(() => {
    if (legacyOpen) navigate(giveHere, { replace: true });
  }, [legacyOpen, giveHere, navigate]);

  const confirmVoid = async () => {
    if (!voiding || voiding.busy) return;
    const reason = voiding.reason.trim();
    if (!reason) {
      setVoiding({ ...voiding, failure: new RejectedError('reason_required', t('issue.void.reason_need', 'اكتب سبب الإلغاء.')) });
      return;
    }
    setVoiding({ ...voiding, busy: true, failure: null, sent: true });
    try {
      const done = await voidFlockIssue(voiding.issue.id, reason, voiding.ref);
      toast({ tone: 'success', title: t('issue.void.done', 'أُلغي الصرف {doc} ورجعت كميته إلى مخزنها.', { doc: done.docNo }) });
      setVoiding(null);
      refresh();
    } catch (failure) {
      // رفض نهائيّ لم يُلغِ شيئاً: السبب يُصحَّح ويُعاد بمرجع جديد؛ وغيره مجهول: الإعادة بالمرجع والسبب نفسيهما.
      const final = failure instanceof RejectedError;
      setVoiding((current) => (current ? { ...current, busy: false, failure, sent: !final, ref: final ? crypto.randomUUID() : current.ref } : current));
    }
  };

  const money = feed?.money !== null && feed?.money !== undefined;
  const issues = feed?.issues ?? [];
  const columns: Column<FeedIssue>[] = [
    { key: 'day', header: t('issue.col.day', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.issuedOn)}</Num> },
    { key: 'doc', header: t('issue.col.doc', 'المستند'), cell: (row) => <Num>{row.docNo}</Num> },
    { key: 'item', header: t('issue.col.item', 'المادّة'), wrap: true, cell: (row) => row.itemName },
    {
      key: 'qty',
      header: t('issue.col.qty', 'الكمية'),
      kind: 'number',
      cell: (row) => <Num>{fmtQtyCell(row.qty, columnDecimals(issues.map((entry) => entry.qty), 3) as 0 | 1 | 2 | 3)}</Num>,
    },
    { key: 'unit', header: t('issue.col.unit', 'الوحدة'), cell: (row) => unitWord(row.baseUnit) },
    { key: 'store', header: t('issue.col.store', 'المخزن'), wrap: true, cell: (row) => row.warehouseName },
    ...(money
      ? [
          {
            key: 'value',
            header: t('issue.col.value', 'القيمة'),
            kind: 'number' as const,
            // الملغى بلا قيمة في عمود يجمع صافي المرحَّل (issued_value)، وحالته تقول إنّه ملغى.
            cell: (row: FeedIssue) => <Num>{row.status === 'void' || row.money?.value === null || row.money?.value === undefined ? '—' : fmtMoney(row.money.value)}</Num>,
            total: <Num>{feed?.money?.issuedValue === null || feed?.money?.issuedValue === undefined ? '—' : fmtMoney(feed.money.issuedValue)}</Num>,
          },
        ]
      : []),
    {
      key: 'status',
      header: feed?.canVoid ? t('issue.col.status_void', 'الحالة والإلغاء') : t('issue.col.status', 'الحالة'),
      wrap: true,
      cell: (row) =>
        row.status === 'void' ? (
          <span className="text-sm text-ink-muted" data-action="issue-void-note">
            {t('issue.voided', 'ملغى: {reason}', { reason: row.voidReason ?? '—' })}
          </span>
        ) : row.canVoid ? (
          // «ألغِ» من صلاحية السطر نفسه (مخزنه في نطاق من يلغي)، لا من رأس الجدول.
          <Button size="sm" variant="ghost" onClick={() => setVoiding({ issue: row, reason: '', ref: crypto.randomUUID(), busy: false, failure: null, sent: false })} data-action="issue-void">
            {t('issue.void', 'ألغِ')}
          </Button>
        ) : (
          t('issue.posted', 'مُرحَّل')
        ),
    },
  ];

  const voidFailure = voiding?.failure ? (voiding.failure instanceof RejectedError && voiding.failure.hint ? voiding.failure.hint : `${describeError(voiding.failure).title} ${describeError(voiding.failure).detail}`) : null;
  return (
    <div className="flex flex-col gap-4">
      {back ? <BackButton to={back} label={t('back.hall', 'رجوع إلى القاعة')} action="issue-back" /> : null}
      <PageHeader
        title={feed ? t('issue.page.title', 'الصرف لـ«{hall}»', { hall: feed.hallName }) : t('issue.page.loading', 'الصرف للقاعة')}
        subtitle={options ? t('issue.page.subtitle', '{site} — تُصرف المادّة من المخزن إلى فوج القاعة بكلفتها.', { site: options.siteName }) : undefined}
      />
      {/* فشل القراءة يُقال ولو بقي آخر ما قُرئ معروضاً (لا بيانات قديمة كأنّها الآن)، ولكلّ قراءة إعادتها. */}
      {feedState.error ? <LoadFailed what={t('issue.what', 'علف القاعة')} error={feedState.error} onRetry={feedState.retry} /> : null}
      {optionsState.error ? <LoadFailed what={t('issue.options_what', 'ما يُصرف للقاعة')} error={optionsState.error} onRetry={optionsState.retry} /> : null}
      {feed ? (
        <section className="card flex flex-col gap-3 p-4">
          <FeedLine feed={feed} />
          {canGive ? (
            <div>
              <Link to={giveHere} className={BUTTON_LINK_CLASS} data-action="issue-open">
                <PackageMinus className="size-5" aria-hidden="true" />
                {t('give.open', 'أضف للقاعة')}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
      {feed ? (
        <DataTable
          caption={t('issue.table', 'ما صُرف لهذه القاعة')}
          columns={columns}
          rows={issues}
          rowKey={(row) => row.id}
          empty={t('issue.table.empty', 'لم يُصرف شيء لهذه القاعة بعد.')}
          totalLabel={money ? t('issue.table.total', 'المجموع') : undefined}
        />
      ) : null}
      {voiding ? (
        <ConfirmDialog
          open
          title={t('issue.void.title', 'إلغاء الصرف {doc}؟', { doc: voiding.issue.docNo })}
          consequence={
            <div className="flex flex-col gap-3">
              <p>
                {t('issue.void.body', 'ترجع {qty} من «{item}» إلى «{store}»، وتُلغى كلفته على الفوج.', {
                  qty: qtyText(voiding.issue.qty, voiding.issue.baseUnit),
                  item: voiding.issue.itemName,
                  store: voiding.issue.warehouseName,
                })}
              </p>
              <Field id="issue-void-reason" label={t('issue.void.reason', 'سبب الإلغاء')} error={voidFailure}>
                <input
                  id="issue-void-reason"
                  className="input"
                  maxLength={500}
                  value={voiding.reason}
                  disabled={voiding.busy || voiding.sent}
                  onChange={(event) => setVoiding({ ...voiding, reason: event.target.value, failure: null })}
                  data-action="issue-void-reason"
                />
              </Field>
            </div>
          }
          confirmLabel={voiding.sent ? t('issue.retry', 'أعد المحاولة') : t('issue.void.confirm', 'ألغِ الصرف')}
          busy={voiding.busy}
          action="issue-void-confirm"
          onConfirm={() => void confirmVoid()}
          onCancel={() => {
            if (voiding.sent) refresh();
            setVoiding(null);
          }}
        />
      ) : null}
    </div>
  );
}
