import { useCallback, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { addDays, localDay } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { FlockKind } from '../../domain/flocks';
import { parseDayText } from '../../lib/dayText';
import { describeError, NotConnectedError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtQty, fmtQtyCell, fmtScaledCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadFlockDetail, recordFlockWeight, type DayLine, type FlockDetail } from '../../lib/repo/flocks';
import { useLoad } from '../../lib/useLoad';
import { farmPath, farmTitle, fmtPct, Metric } from './shared';

// شاشة الفوج (FOUNDATION ٧٨٢): الأرقام المهمّة ثابتة بالرأس (العمر، الحيّ، النفوق، العلف، ومعامل التحويل للّاحم، وبيض اليوم ونسبته
// للبيّاض)، وجدول الأيام بالحيّ الجاري ونسبة إنتاج كل يوم («—» ليوم ما انسجّل بيضه)، ووزن العيّنات للّاحم (بنت بس).

const qtyDecimals = (values: readonly (bigint | null)[]) => columnDecimals(values.filter((value): value is bigint => value !== null), 3) as 0 | 1 | 2 | 3;

function WeightForm({ detail, onSaved }: { detail: FlockDetail; onSaved: () => void }) {
  const id = useId();
  const today = localDay();
  const [day, setDay] = useState(fmtDay(today));
  const [samples, setSamples] = useState('');
  const [avg, setAvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(crypto.randomUUID());
  const onDate = parseDayText(day);
  const placedOn = detail.flock.placedOn;
  const dayError =
    onDate === null
      ? t('day.invalid', 'اكتب التاريخ يوم/شهر/سنة، مثل 30/09/2026.')
      : onDate > today
        ? t('day.future', 'التاريخ بعد اليوم.')
        : onDate < addDays(today, -7)
          ? t('day.too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ {day}.', { day: fmtDay(addDays(today, -7)) })
          : placedOn !== null && onDate < placedOn
            ? t('flock.weight.before', 'التاريخ قبل تسكين الفوج.')
            : null;
  const sampleCount = /^[0-9]+$/.test(samples.trim()) ? Number(samples.trim()) : null; // number-ok: عدد طيور العيّنة من نصّ أرقام بس
  const sampleError = samples.trim() !== '' && (sampleCount === null || sampleCount < 1 || sampleCount > 100_000) ? t('flock.weight.samples.bad', 'اكتب عدد طيور العيّنة من 1 إلى 100,000.') : null;
  const avgValue = parseDecimal(avg, 1);
  const avgTenths = avgValue === null ? null : toScale(avgValue, 1);
  // الحدّ الفيزيائي الأدنى 20 غراماً مثل الخادم (القاعدة 28): 1.8 بخانة الغرامات كيلوغرام انكتب غلطاً.
  const avgError = avg.trim() !== '' && (avgTenths === null || avgTenths < 200n || avgTenths > 200_000n) ? t('flock.weight.avg.bad', 'اكتب معدّل وزن الطير بالغرام من 20 إلى 20,000، بمرتبة عشرية واحدة على الأكثر (1.8 كغم = 1,800 غم).') : null;
  const ready = onDate !== null && !dayError && sampleCount !== null && !sampleError && avgTenths !== null && !avgError;

  const save = async () => {
    if (!ready || onDate === null || sampleCount === null || avgTenths === null) return;
    setBusy(true);
    setError(null);
    try {
      await recordFlockWeight(detail.flock.id, onDate, sampleCount, decimalText(avgTenths, 1), ref.current);
      ref.current = crypto.randomUUID();
      setSamples('');
      setAvg('');
      toast({ tone: 'success', title: t('flock.weight.saved', 'حُفظ وزن العيّنة ليوم {day}.', { day: fmtDay(onDate) }) });
      onSaved();
    } catch (failure) {
      const { title, detail: more } = describeError(failure);
      setError(`${title} ${more}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">{t('flock.weight.title', 'وزن العيّنة')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`${id}-day`} label={t('flock.weight.day', 'التاريخ')} error={dayError}>
          <input id={`${id}-day`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field id={`${id}-samples`} label={t('flock.weight.samples', 'عدد طيور العيّنة')} error={sampleError}>
          <input id={`${id}-samples`} className="input tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" value={samples} onChange={(event) => setSamples(event.target.value)} />
        </Field>
        <Field id={`${id}-avg`} label={t('flock.weight.avg', 'معدّل وزن الطير (غرام)')} error={avgError}>
          <input id={`${id}-avg`} className="input tabular-nums" dir="ltr" inputMode="decimal" autoComplete="off" value={avg} onChange={(event) => setAvg(event.target.value)} />
        </Field>
      </div>
      {error ? <Notice tone="danger" title={error} /> : null}
      <div className="flex justify-end">
        <Button onClick={() => void save()} busy={busy} disabled={!ready} data-action="weight-save">
          {t('flock.weight.save', 'احفظ الوزن')}
        </Button>
      </div>
    </div>
  );
}

function FlockView({ detail, kind, onChanged }: { detail: FlockDetail; kind: FlockKind; onChanged: () => void }) {
  const { flock, days, weights } = detail;
  const feedDecimals = qtyDecimals(days.map((day) => day.feedKg));
  const waterDecimals = qtyDecimals(days.map((day) => day.waterL));
  const fcrHint =
    flock.fcr !== null
      ? null
      : flock.lastWeight === null
        ? t('flock.fcr.no_weight', 'يُحسب بعد أوّل وزن عيّنة.')
        : t('flock.fcr.days', 'يُحسب حين يُسجَّل علف كل يوم من التسكين حتى أمس (ويُحسب اليوم معها إن سُجّل علفه): مسجّل {n} من {m}.', { n: fmtInt(flock.feedDays), m: fmtInt(flock.feedSpanDays) });
  const columns: Column<DayLine>[] = [
    { key: 'day', header: t('flock.col.day', 'التاريخ'), cell: (day) => <Num>{fmtDay(day.onDate)}</Num> },
    { key: 'start', header: t('flock.col.live_start', 'الحيّ بداية اليوم'), kind: 'number', cell: (day) => <Num>{fmtInt(day.liveStart)}</Num> },
    { key: 'dead', header: t('round.dead', 'النافق'), kind: 'number', cell: (day) => <Num>{fmtInt(day.dead ?? 0)}</Num>, total: <Num>{fmtInt(flock.deadTotal)}</Num> },
    { key: 'culled', header: t('round.culled', 'المستبعد'), kind: 'number', cell: (day) => <Num>{fmtInt(day.culled ?? 0)}</Num>, total: <Num>{fmtInt(flock.culledTotal)}</Num> },
    { key: 'feed', header: t('round.feed', 'العلف (كغم)'), kind: 'number', cell: (day) => (day.feedKg === null ? '—' : <Num>{fmtQtyCell(day.feedKg, feedDecimals)}</Num>), total: <Num>{fmtQtyCell(flock.feedKgTotal, qtyDecimals([flock.feedKgTotal, ...days.map((day) => day.feedKg)]))}</Num> },
    { key: 'water', header: t('round.water', 'الماء (لتر)'), kind: 'number', cell: (day) => (day.waterL === null ? '—' : <Num>{fmtQtyCell(day.waterL, waterDecimals)}</Num>) },
    ...(kind === 'layer'
      ? [
          { key: 'eggs', header: t('round.eggs_total', 'البيض (المجموع)'), kind: 'number' as const, cell: (day: DayLine) => (day.eggsTotal === null ? '—' : <Num>{fmtInt(day.eggsTotal)}</Num>) },
          { key: 'broken', header: t('round.eggs_broken', 'المكسور'), kind: 'number' as const, cell: (day: DayLine) => (day.eggsBroken === null ? '—' : <Num>{fmtInt(day.eggsBroken)}</Num>) },
          { key: 'hdep', header: t('flock.col.hdep', 'نسبة الإنتاج'), kind: 'number' as const, cell: (day: DayLine) => (day.hdep === null ? '—' : <Num>{fmtPct(day.hdep)}</Num>) },
        ]
      : []),
    { key: 'end', header: t('flock.col.live_end', 'الحيّ آخر اليوم'), kind: 'number', cell: (day) => <Num>{fmtInt(day.liveEnd)}</Num> },
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label={t('flock.age', 'العمر بالأيام')} value={flock.ageDays !== null ? fmtInt(flock.ageDays) : null} />
        <Metric label={t('flock.live', 'الطيور الحيّة')} value={fmtInt(flock.live)} hint={flock.placedCount !== null ? t('flock.placed', 'المسكّن {n}', { n: fmtInt(flock.placedCount) }) : undefined} />
        <Metric label={t('flock.losses', 'النافق والمستبعد')} value={fmtInt(flock.deadTotal + flock.culledTotal)} />
        <Metric label={t('flock.mortality', 'نسبة النفوق')} value={flock.mortalityPct !== null ? fmtPct(flock.mortalityPct) : null} />
        <Metric label={t('flock.feed', 'العلف المستهلك')} text value={fmtQty(flock.feedKgTotal, 'kg').main} />
        {kind === 'broiler' ? (
          <>
            <Metric
              label={t('flock.last_weight', 'آخر وزن (غرام)')}
              value={flock.lastWeight ? fmtScaledCell(flock.lastWeight.avgG, 1, 1) : null}
              hint={flock.lastWeight ? t('flock.last_weight.on', 'يوم {day}', { day: fmtDay(flock.lastWeight.onDate) }) : undefined}
            />
            <Metric label={t('flock.fcr', 'معامل التحويل الغذائي')} value={flock.fcr !== null ? fmtScaledCell(flock.fcr, 3, 3) : null} hint={fcrHint ?? undefined} />
          </>
        ) : (
          <>
            <Metric label={t('flock.eggs_today', 'بيض اليوم')} value={flock.eggsToday !== null ? fmtInt(flock.eggsToday) : null} />
            <Metric label={t('flock.hdep_today', 'نسبة الإنتاج اليوم')} value={flock.hdepToday !== null ? fmtPct(flock.hdepToday) : null} />
          </>
        )}
      </dl>
      {flock.rejectsPending > 0 ? (
        <Notice tone="warning" title={t('flock.rejects', 'جولات أُرسلت من الأجهزة ورُدّت إلى المدير: {n}.', { n: fmtInt(flock.rejectsPending) })} />
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('flock.days', 'أيام الفوج')}</h2>
        <DataTable caption={t('flock.days', 'أيام الفوج')} columns={columns} rows={days} rowKey={(day) => day.onDate} empty={t('flock.days.empty', 'لم تُسجَّل أيّ جولة بعد.')} totalLabel={t('flock.total', 'المجموع')} />
      </section>
      {kind === 'broiler' ? (
        <section className="flex flex-col gap-3">
          {detail.canSave && flock.status === 'active' ? <WeightForm detail={detail} onSaved={onChanged} /> : null}
          <DataTable
            caption={t('flock.weights', 'أوزان العيّنات')}
            columns={[
              { key: 'day', header: t('flock.col.day', 'التاريخ'), cell: (row) => <Num>{fmtDay(row.onDate)}</Num> },
              { key: 'samples', header: t('flock.weight.samples', 'عدد طيور العيّنة'), kind: 'number', cell: (row) => <Num>{fmtInt(row.sampleCount)}</Num> },
              { key: 'avg', header: t('flock.weight.avg', 'معدّل وزن الطير (غرام)'), kind: 'number', cell: (row) => <Num>{fmtScaledCell(row.avgG, 1, 1)}</Num> },
            ]}
            rows={weights}
            rowKey={(row) => row.onDate}
            empty={t('flock.weights.empty', 'لا أوزان بعد.')}
          />
        </section>
      ) : null}
    </>
  );
}

export default function FlockPage({ kind }: { kind: FlockKind }) {
  const { id = '' } = useParams();
  const load = useCallback(() => loadFlockDetail(id), [id]);
  const state = useLoad(load);
  const detail = state.data;
  const base = farmPath(kind);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={detail ? t('flock.title', 'فوج {hall} — {site}', { hall: detail.flock.hallName, site: detail.flock.siteName }) : farmTitle(kind)}
        subtitle={detail?.flock.placedOn ? t('flock.subtitle', 'سُكّن يوم {day}{breed}', { day: fmtDay(detail.flock.placedOn), breed: detail.flock.breed ? t('flock.breed', '، سلالة {breed}', { breed: detail.flock.breed }) : '' }) : undefined}
        actions={
          <div className="flex gap-3">
            {detail?.canSave ? (
              <Link to={`${base}/round`} className="text-sm font-semibold text-brand-700 dark:text-brand-200" data-action="flock-round">
                {t('farm.round', 'الجولة اليومية')}
              </Link>
            ) : null}
            <Link to={base} className="text-sm font-semibold text-brand-700 dark:text-brand-200">
              {t('round.back', 'إلى الحقول')}
            </Link>
          </div>
        }
      />
      {state.error instanceof NotConnectedError ? (
        <Notice tone="info" title={describeError(state.error).title} />
      ) : state.error ? (
        <LoadFailed what={t('flock.what', 'الفوج')} error={state.error} onRetry={state.retry} />
      ) : null}
      {detail ? <FlockView detail={detail} kind={kind} onChanged={state.retry} /> : null}
    </div>
  );
}
