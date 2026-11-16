import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { localDay } from '../../domain/dates';
import type { FlockKind } from '../../domain/flocks';
import { naturalCompare } from '../../domain/naturalOrder';
import { can } from '../../domain/permissions';
import { describeError, NotConnectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { archiveHall, type FlockSummary, type HallView, type SiteView } from '../../lib/repo/flocks';
import { useSession } from '../../lib/session';
import { BUTTON_LINK_CLASS, givePath, LINK_CLASS } from './feed';
import { FlockEditDialogLazy as FlockEditDialog } from './flockEditLazy';
import { HallDialog, OpenFlockDialog } from './hallDialogs';
import { farmPath, farmTitle, fmtPct, hallLabel, hallPath, TodayChip, useOverview, useStamp } from './shared';

// شاشة الحقل (FOUNDATION ٧٨٢ و٨١٦): زرّ الجولة اليومية أوّل شي، وتحته الحقول ← القاعات ← الفوج بأرقامه المهمّة. المدير يضيف قاعة
// ويفتح فوجاً (open_flock: فتح وتسكين بالعدد بخطوة وحدة، بلا كلفة أفراخ بالنسخة الأولى)، والكل يشوف ضمن نطاقه.
// وكلمة الزبون 2026-11-15 («قاعة 5: غلطت بتاريخ التسكين ولا أستطيع تعديله»): «عدّل القاعة» للاسم والسعة، و«عدّل الفوج» لفوجها القائم
// (التاريخ والعدد والعمر والسلالة، أو حذفه إن فُتح غلطاً)؛ والقاعات بترتيب أرقامها («قاعة 5» قبل «قاعة 44»).
// وكلمة المالك 2026-11-16 («طريقة الدخول الها واضحة… نسوي الجدول اكبر واوضح وبي تفاصيل مكتوبة بخط اكبر شوية»): الجدول بحجمه الكبير،
// واسم القاعة رابط ظاهر لصفحتها، والصفّ كلّه يفتحها (والقاعة الفارغة أيضاً)، و«جولة اليوم» مكتوبة لكلّ قاعة مع نافق اليوم.

type Editing =
  | { kind: 'add'; site: SiteView }
  | { kind: 'edit'; site: SiteView; hall: HallView }
  | { kind: 'open'; hall: HallView }
  | { kind: 'archive'; hall: HallView }
  | { kind: 'flock'; hall: HallView; flock: FlockSummary };

export default function FarmPage({ kind }: { kind: FlockKind }) {
  const session = useSession();
  const stamp = useStamp();
  // زرّ الجولة لمن يحفظ يوم الفوج بس (عامل القاعة والمدير والمالك)، مثل شاشة الفوج والرئيسية.
  const canRound = session.status === 'ready' && can(session.workspace.role, 'flock_day.save');
  // «اصرف» لكلّ قاعة فيها فوج قائم لمن يصرف من المخزن (0019): يفتح صفحة الإضافة لفوجها (0026، لها ولقاعات أخرى معها).
  const canIssue = session.status === 'ready' && can(session.workspace.role, 'issue.post');
  const state = useOverview(stamp);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [archiving, setArchiving] = useState(false);
  const base = farmPath(kind);
  // القاعدة ترتّب القاعات حرفاً حرفاً («قاعة 44» قبل «قاعة 5» في شاشة الزبون 2026-11-15)، فالترتيب هنا بأرقام الأسماء.
  const sites = (state.data?.overview.sites ?? []).filter((site) => site.kind === kind).map((site) => ({ ...site, halls: [...site.halls].sort((a, b) => naturalCompare(hallLabel(a.name), hallLabel(b.name))) }));
  const today = state.data?.overview.today ?? localDay();
  const done = () => {
    setEditing(null);
    state.retry();
  };
  const editFlockOf = (hall: HallView) => {
    if (hall.flock) setEditing({ kind: 'flock', hall, flock: hall.flock });
  };

  const archive = async (hall: HallView) => {
    setArchiving(true);
    try {
      await archiveHall(hall.id, hall.version);
      toast({ tone: 'success', title: t('farm.hall.archived', 'أُرشفت القاعة «{name}».', { name: hallLabel(hall.name) }) });
      done();
    } catch (failure) {
      const { title, detail } = describeError(failure);
      toast({ tone: 'danger', title, detail });
    } finally {
      setArchiving(false);
    }
  };

  const columns = (site: SiteView): Column<HallView>[] => {
    const feedDecimals = columnDecimals(site.halls.flatMap((hall) => (hall.flock ? [hall.flock.feedKgTotal] : [])), 3) as 0 | 1 | 2 | 3;
    return [
      {
        key: 'hall',
        header: t('farm.col.hall', 'القاعة'),
        sticky: true,
        cell: (hall) => (
          <Link to={hallPath(kind, hall.id)} className="text-lg font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200" data-action="hall-open">
            {hallLabel(hall.name)}
          </Link>
        ),
      },
      // حالة جولة اليوم مكتوبة (لا لون وحده): سُجّلت، أو لم تُسجَّل، أو القاعة فارغة.
      { key: 'today', header: t('farm.col.today', 'جولة اليوم'), cell: (hall) => <TodayChip flock={hall.flock} /> },
      { key: 'age', header: t('farm.col.age', 'العمر (يوم)'), kind: 'number', cell: (hall) => (hall.flock?.ageDays !== null && hall.flock?.ageDays !== undefined ? <Num>{fmtInt(hall.flock.ageDays)}</Num> : '—') },
      { key: 'live', header: t('farm.col.live', 'الحيّ'), kind: 'number', cell: (hall) => (hall.flock ? <Num>{fmtInt(hall.flock.live)}</Num> : '—') },
      { key: 'dead_today', header: t('farm.col.dead_today', 'نافق اليوم'), kind: 'number', cell: (hall) => (hall.flock?.today?.dead !== null && hall.flock?.today?.dead !== undefined ? <Num>{fmtInt(hall.flock.today.dead)}</Num> : '—') },
      { key: 'losses', header: t('farm.col.losses', 'النافق والمستبعد'), kind: 'number', cell: (hall) => (hall.flock ? <Num>{fmtInt(hall.flock.deadTotal + hall.flock.culledTotal)}</Num> : '—') },
      { key: 'mortality', header: t('farm.col.mortality', 'النفوق'), kind: 'number', cell: (hall) => (hall.flock?.mortalityPct !== null && hall.flock?.mortalityPct !== undefined ? <Num>{fmtPct(hall.flock.mortalityPct)}</Num> : '—') },
      ...(kind === 'broiler'
        ? [{ key: 'fcr', header: t('farm.col.fcr', 'معامل التحويل'), kind: 'number' as const, cell: (hall: HallView) => (hall.flock?.fcr !== null && hall.flock?.fcr !== undefined ? <Num>{fmtScaledCell(hall.flock.fcr, 3, 3)}</Num> : '—') }]
        : [
            { key: 'eggs', header: t('farm.col.eggs_today', 'بيض اليوم'), kind: 'number' as const, cell: (hall: HallView) => (hall.flock?.eggsToday !== null && hall.flock?.eggsToday !== undefined ? <Num>{fmtInt(hall.flock.eggsToday)}</Num> : '—') },
            { key: 'hdep', header: t('farm.col.hdep', 'نسبة الإنتاج'), kind: 'number' as const, cell: (hall: HallView) => (hall.flock?.hdepToday !== null && hall.flock?.hdepToday !== undefined ? <Num>{fmtPct(hall.flock.hdepToday)}</Num> : '—') },
          ]),
      // الكمية بعمود الجدول بمراتب العمود الثابتة والوحدة برأسه (قانون المالك للأرقام والجداول).
      { key: 'feed', header: t('round.feed', 'العلف (كغم)'), kind: 'number', cell: (hall) => (hall.flock ? <Num>{fmtQtyCell(hall.flock.feedKgTotal, feedDecimals)}</Num> : '—') },
      {
        key: 'actions',
        header: t('farm.col.actions', 'الإجراءات'),
        cell: (hall) => (
          <div className="flex gap-2">
            {hall.flock && canIssue && hall.flock.status === 'active' ? (
              <Link to={givePath(hall.flock.id, base)} className={LINK_CLASS} data-action="hall-issue">
                {t('farm.flock.issue', 'اصرف')}
              </Link>
            ) : null}
            {hall.flock ? null : site.canManage ? (
              <Button size="sm" onClick={() => setEditing({ kind: 'open', hall })} data-action="flock-open">
                {t('farm.flock.open', 'افتح فوجاً')}
              </Button>
            ) : null}
            {site.canManage && hall.flock?.status === 'active' ? (
              <Button size="sm" variant="secondary" onClick={() => editFlockOf(hall)} data-action="flock-edit">
                {t('farm.flock.edit', 'عدّل الفوج')}
              </Button>
            ) : null}
            {site.canManage ? (
              <>
                {/* «عدّل» وحده كان يُفهم تعديلاً للفوج وهو للقاعة (كلمة الزبون 2026-11-15). */}
                <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: 'edit', site, hall })} data-action="hall-edit">
                  {t('farm.hall.edit', 'عدّل القاعة')}
                </Button>
                {hall.flock ? null : (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'archive', hall })} data-action="hall-archive">
                    {t('farm.hall.archive', 'أرشف')}
                  </Button>
                )}
              </>
            ) : null}
          </div>
        ),
      },
    ];
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={farmTitle(kind)}
        subtitle={t('farm.subtitle', 'الحقول والقاعات والأفواج، وأرقام اليوم {day}', { day: fmtDay(today) })}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* تقرير القاعات اليومي (0027): كلّ قاعات النطاق ليوم واحد، برجوع إلى هذا الحقل. */}
            <Link to={`/halls/day?back=${base}`} className={LINK_CLASS} data-action="farm-day-report">
              {t('farm.day_report', 'تقرير اليوم')}
            </Link>
            {/* جدول اللقاحات الواحد لنوع الحقل (0026): يُقرأ لكلّ من يرى الحقل، ويعدّله المدير والمالك. */}
            <Link to={`/halls/vaccines?kind=${kind}`} className={LINK_CLASS} data-action="farm-vaccines">
              {t('farm.vaccines', 'جدول اللقاحات')}
            </Link>
            {canRound ? (
              <Link to={`${base}/round`} data-action="farm-round" className={BUTTON_LINK_CLASS}>
                <ClipboardList aria-hidden="true" className="size-5" />
                {t('farm.round', 'الجولة اليومية')}
              </Link>
            ) : null}
          </div>
        }
      />
      {state.error instanceof NotConnectedError ? (
        <Notice tone="info" title={describeError(state.error).title} />
      ) : state.error ? (
        <LoadFailed what={t('farm.what', 'الحقول')} error={state.error} onRetry={state.retry} />
      ) : null}
      {state.data?.savedAt ? <Notice tone="warning" title={t('farm.offline', 'بلا اتصال: هذه آخر نسخة محفوظة على الجهاز.')} /> : null}
      {state.data && sites.length === 0 ? (
        <Notice tone="info" title={t('farm.no_sites', 'لا حقول في نطاقك بعد.')}>
          {t('farm.no_sites.hint', 'يضيف المدير الحقل (موقعاً) من «المخزن» ثم «إعداد المخزن»، ثم القاعات من هنا.')}
        </Notice>
      ) : null}
      {sites.map((site) => (
        <section key={site.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{site.name}</h2>
            {site.canManage ? (
              <Button size="sm" variant="secondary" icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setEditing({ kind: 'add', site })} data-action="hall-add">
                {t('farm.hall.add', 'أضف قاعة')}
              </Button>
            ) : null}
          </div>
          <DataTable
            caption={site.name}
            size="lg"
            columns={columns(site)}
            rows={site.halls}
            rowKey={(hall) => hall.id}
            onRowClick={(hall) => navigate(hallPath(kind, hall.id))}
            rowTone={(hall) => (hall.flock?.status === 'active' && hall.flock.today === null ? 'warn' : null)}
            empty={t('farm.no_halls', 'لا قاعات في هذا الحقل بعد.')}
          />
        </section>
      ))}
      {editing?.kind === 'add' || editing?.kind === 'edit' ? <HallDialog site={editing.site} hall={editing.kind === 'edit' ? editing.hall : null} onClose={() => setEditing(null)} onSaved={done} /> : null}
      {editing?.kind === 'open' ? <OpenFlockDialog hall={editing.hall} onClose={() => setEditing(null)} onOpened={done} /> : null}
      {/* القراءة من جديد بعد stale_flock لا تطوي النافذة: هي من حالة الصفحة لا من الجدول، فيبقى التلميح حتى تُغلق وتُفتح بالقيم الحالية. */}
      {editing?.kind === 'flock' ? <FlockEditDialog hallName={hallLabel(editing.hall.name)} flock={editing.flock} onClose={() => setEditing(null)} onSaved={done} onDeleted={done} onStale={state.retry} /> : null}
      <ConfirmDialog
        open={editing?.kind === 'archive'}
        title={t('farm.hall.archive.title', 'أرشفة القاعة «{name}»', { name: editing?.kind === 'archive' ? hallLabel(editing.hall.name) : '' })}
        consequence={t('farm.hall.archive.consequence', 'تختفي القاعة من الحقل والجولة اليومية، وتبقى أفواجها السابقة وأيامها محفوظة. لا تُحذف أبداً.')}
        confirmLabel={t('farm.hall.archive.confirm', 'أرشف القاعة')}
        busy={archiving}
        action="hall-archive-confirm"
        onCancel={() => setEditing(null)}
        onConfirm={() => {
          if (editing?.kind === 'archive') void archive(editing.hall);
        }}
      />
    </div>
  );
}
