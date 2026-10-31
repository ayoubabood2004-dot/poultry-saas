import { ClipboardList, Plus } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { localDay } from '../../domain/dates';
import type { FlockKind } from '../../domain/flocks';
import { can } from '../../domain/permissions';
import { parseDayText } from '../../lib/dayText';
import { describeError, NotConnectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { archiveHall, createHall, openFlock, updateHall, type HallView, type SiteView } from '../../lib/repo/flocks';
import { useSession } from '../../lib/session';
import { farmPath, farmTitle, fmtPct, useOverview, useStamp } from './shared';

// شاشة الحقل (FOUNDATION ٧٨٢ و٨١٦): زرّ الجولة اليومية أوّل شي، وتحته الحقول ← القاعات ← الفوج بأرقامه المهمّة. المدير يضيف قاعة
// ويفتح فوجاً (open_flock: فتح وتسكين بالعدد بخطوة وحدة، بلا كلفة أفراخ بالنسخة الأولى)، والكل يشوف ضمن نطاقه.

const MAX_COUNT = 10_000_000;
/** عدد صحيح من نصّ أرقام بس، أو null. */
function wholeNumber(text: string, max = MAX_COUNT): number | null {
  const value = text.trim();
  if (!/^[0-9]+$/.test(value)) return null;
  const n = Number(value); // number-ok: عدد طيور أو أيام صحيح من نصّ أرقام بس، مو فلوس
  return n <= max ? n : null;
}

function HallDialog({ site, hall, onClose, onSaved }: { site: SiteView; hall: HallView | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [name, setName] = useState(hall?.name ?? '');
  const initialCapacity = hall?.capacity !== null && hall?.capacity !== undefined ? String(hall.capacity) : '';
  const [capacity, setCapacity] = useState(initialCapacity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capacityValue = capacity.trim() === '' ? null : wholeNumber(capacity);
  const capacityError = capacity.trim() !== '' && (capacityValue === null || capacityValue < 1) ? t('farm.hall.capacity.bad', 'اكتب السعة عدداً صحيحاً من الطيور، أو اتركها فارغة.') : null;

  const save = async () => {
    if (name.trim() === '' || capacityError) return;
    setBusy(true);
    setError(null);
    try {
      if (hall) await updateHall(hall.id, hall.version, name, capacityValue);
      else await createHall(site.id, name, capacityValue);
      toast({ tone: 'success', title: hall ? t('farm.hall.saved', 'حُفظت القاعة «{name}».', { name: name.trim() }) : t('farm.hall.added', 'أُضيفت القاعة «{name}».', { name: name.trim() }) });
      onSaved();
    } catch (failure) {
      const { title, detail } = describeError(failure);
      setError(`${title} ${detail}`);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      dirty={name !== (hall?.name ?? '') || capacity !== initialCapacity}
      title={hall ? t('farm.hall.edit.title', 'تعديل القاعة «{name}»', { name: hall.name }) : t('farm.hall.add.title', 'قاعة جديدة في «{site}»', { site: site.name })}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={name.trim() === '' || Boolean(capacityError)} data-action="hall-save">
          {t('farm.hall.save', 'احفظ القاعة')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id={`${id}-name`} label={t('farm.hall.name', 'اسم القاعة')} hint={t('farm.hall.name.hint', 'مثل: قاعة 1.')}>
          <input id={`${id}-name`} className="input" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field id={`${id}-capacity`} label={t('farm.hall.capacity', 'السعة بالطيور (اختياري)')} error={capacityError}>
          <input id={`${id}-capacity`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
        </Field>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
    </Dialog>
  );
}

function OpenFlockDialog({ hall, onClose, onOpened }: { hall: HallView; onClose: () => void; onOpened: () => void }) {
  const id = useId();
  const today = localDay();
  const initialDay = fmtDay(today);
  const [day, setDay] = useState(initialDay);
  const [count, setCount] = useState('');
  const [age, setAge] = useState('0');
  const [breed, setBreed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // مرجع واحد لكل نافذة: الإعادة بعد جواب ضاع نفس الفتح، مو فوج ثاني.
  const ref = useRef(crypto.randomUUID());

  const placedOn = parseDayText(day);
  const dayError = placedOn === null ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.') : placedOn > today ? t('day.future', 'التاريخ بعد اليوم.') : null;
  const countValue = wholeNumber(count);
  const countError = count.trim() !== '' && (countValue === null || countValue < 1) ? t('farm.open.count.bad', 'اكتب عدد الطيور عدداً صحيحاً أكبر من صفر.') : null;
  const ageValue = wholeNumber(age === '' ? '0' : age, 1000);
  const ageError = ageValue === null ? t('farm.open.age.bad', 'اكتب العمر بالأيام عدداً صحيحاً من 0 إلى 1,000.') : null;
  const ready = placedOn !== null && !dayError && countValue !== null && countValue > 0 && ageValue !== null;

  const save = async () => {
    if (!ready || placedOn === null || countValue === null || ageValue === null) return;
    setBusy(true);
    setError(null);
    try {
      await openFlock({ hallId: hall.id, placedOn, placedCount: countValue, ageDays: ageValue, breed }, ref.current);
      toast({ tone: 'success', title: t('farm.open.done', 'فُتح فوج في «{hall}»؛ عدد الطيور المسكّنة {count}.', { hall: hall.name, count: fmtInt(countValue) }) });
      onOpened();
    } catch (failure) {
      const { title, detail } = describeError(failure);
      setError(`${title} ${detail}`);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      locked={busy}
      // أيّ خانة تغيّرت عن أوّلها كتابة لم تُحفظ (التاريخ والعدد والعمر والسلالة)، مو العدد بس.
      dirty={day !== initialDay || count !== '' || age !== '0' || breed !== ''}
      title={t('farm.open.title', 'فوج جديد في «{hall}»', { hall: hall.name })}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={!ready} data-action="flock-open-save">
          {t('farm.open.save', 'افتح الفوج')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id={`${id}-day`} label={t('farm.open.day', 'تاريخ التسكين')} error={dayError} hint={t('farm.open.day.hint', 'يوم/شهر/سنة. فوج قائم يُكتب بتاريخ تسكينه الحقيقي.')}>
          <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" placeholder={t('org.go_live.placeholder', 'يوم/شهر/سنة')} value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field id={`${id}-count`} label={t('farm.open.count', 'عدد الطيور المسكّنة')} error={countError}>
          <input id={`${id}-count`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={count} onChange={(event) => setCount(event.target.value)} />
        </Field>
        <Field id={`${id}-age`} label={t('farm.open.age', 'العمر عند التسكين بالأيام')} error={ageError} hint={t('farm.open.age.hint', 'صفر لأفراخ عمر يوم.')}>
          <input id={`${id}-age`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={age} onChange={(event) => setAge(event.target.value)} />
        </Field>
        <Field id={`${id}-breed`} label={t('farm.open.breed', 'السلالة (اختياري)')}>
          <input id={`${id}-breed`} className="input" autoComplete="off" value={breed} onChange={(event) => setBreed(event.target.value)} />
        </Field>
        <p className="text-sm text-ink-muted">{t('farm.open.note', 'النسخة الأولى: الفوج يُفتح بالعدد فقط، بلا كلفة أفراخ ولا سحب من مخزن المفقس.')}</p>
        {error ? <Notice tone="danger" title={error} /> : null}
      </div>
    </Dialog>
  );
}

type Editing = { kind: 'add'; site: SiteView } | { kind: 'edit'; site: SiteView; hall: HallView } | { kind: 'open'; hall: HallView } | { kind: 'archive'; hall: HallView };

export default function FarmPage({ kind }: { kind: FlockKind }) {
  const session = useSession();
  const stamp = useStamp();
  // زرّ الجولة لمن يحفظ يوم الفوج بس (عامل القاعة والمدير والمالك)، مثل شاشة الفوج والرئيسية.
  const canRound = session.status === 'ready' && can(session.workspace.role, 'flock_day.save');
  const state = useOverview(stamp);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [archiving, setArchiving] = useState(false);
  const base = farmPath(kind);
  const sites = state.data?.overview.sites.filter((site) => site.kind === kind) ?? [];
  const today = state.data?.overview.today ?? localDay();
  const done = () => {
    setEditing(null);
    state.retry();
  };

  const archive = async (hall: HallView) => {
    setArchiving(true);
    try {
      await archiveHall(hall.id, hall.version);
      toast({ tone: 'success', title: t('farm.hall.archived', 'أُرشفت القاعة «{name}».', { name: hall.name }) });
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
        cell: (hall) =>
          hall.flock ? (
            <Link to={`${base}/flock/${hall.flock.id}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200">
              {hall.name}
            </Link>
          ) : (
            hall.name
          ),
      },
      { key: 'age', header: t('farm.col.age', 'العمر (يوم)'), kind: 'number', cell: (hall) => (hall.flock?.ageDays !== null && hall.flock?.ageDays !== undefined ? <Num>{fmtInt(hall.flock.ageDays)}</Num> : '—') },
      { key: 'live', header: t('farm.col.live', 'الحيّ'), kind: 'number', cell: (hall) => (hall.flock ? <Num>{fmtInt(hall.flock.live)}</Num> : '—') },
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
            {hall.flock ? (
              <Link to={`${base}/flock/${hall.flock.id}`} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="flock-view">
                {t('farm.flock.view', 'تفاصيل الفوج')}
              </Link>
            ) : site.canManage ? (
              <Button size="sm" onClick={() => setEditing({ kind: 'open', hall })} data-action="flock-open">
                {t('farm.flock.open', 'افتح فوجاً')}
              </Button>
            ) : (
              <span className="text-sm text-ink-muted">{t('farm.flock.none', 'بلا فوج')}</span>
            )}
            {site.canManage ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: 'edit', site, hall })} data-action="hall-edit">
                  {t('farm.hall.edit', 'عدّل')}
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
          canRound ? (
            <Link to={`${base}/round`} data-action="farm-round" className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 font-semibold text-white shadow-soft hover:bg-brand-700">
              <ClipboardList aria-hidden="true" className="size-5" />
              {t('farm.round', 'الجولة اليومية')}
            </Link>
          ) : undefined
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
          {t('farm.no_sites.hint', 'يضيف المدير الحقل (موقعاً) من إعدادات المنشأة، ثم القاعات من هنا.')}
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
          <DataTable caption={site.name} columns={columns(site)} rows={site.halls} rowKey={(hall) => hall.id} empty={t('farm.no_halls', 'لا قاعات في هذا الحقل بعد.')} />
        </section>
      ))}
      {editing?.kind === 'add' || editing?.kind === 'edit' ? <HallDialog site={editing.site} hall={editing.kind === 'edit' ? editing.hall : null} onClose={() => setEditing(null)} onSaved={done} /> : null}
      {editing?.kind === 'open' ? <OpenFlockDialog hall={editing.hall} onClose={() => setEditing(null)} onOpened={done} /> : null}
      <ConfirmDialog
        open={editing?.kind === 'archive'}
        title={t('farm.hall.archive.title', 'أرشفة القاعة «{name}»', { name: editing?.kind === 'archive' ? editing.hall.name : '' })}
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
