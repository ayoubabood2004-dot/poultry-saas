import { Factory, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { decimalText } from '../../domain/decimal';
import { can } from '../../domain/permissions';
import { parseQty } from '../../domain/units';
import { describeError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import {
  confirmCosts,
  discardBatch,
  loadBatch,
  postProduction,
  previewProduction,
  setBatchFields,
  voidProduction,
  type ProductionBatch,
  type ProductionPreview,
} from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { forgetMillRef, millRef, pct, Stats } from './shared';

// بطاقة دفعة الإنتاج (0015): المسوّدة تُعرض بمعاينتها (ما سيُسحب من كلّ مادّة، والهدر، وكلفة الكيلو) قبل «أنتج الآن»؛
// والمرحَّلة بأرقامها وبزرّ الإلغاء. الرفض يُعرض كما هو من الخادم، ولا يُرحَّل شيء لم يره المستخدم (بصمة المعاينة).

interface BatchState {
  batch: ProductionBatch;
  preview: ProductionPreview | null;
}

const PROBLEM_TEXT: Readonly<Record<string, () => string>> = {
  insufficient_stock: () => t('mill.problem.short', 'الرصيد لا يكفي'),
  shrink_out_of_range: () => t('mill.problem.shrink', 'الهدر خارج المدى المقبول: اكتب سببه'),
  expiry_required: () => t('mill.problem.expiry', 'الناتج يُتابَع انتهاؤه: اكتب تاريخ الانتهاء'),
  costs_pending: () => t('mill.problem.costs', 'الكلف لم تُختَم بعد: يختمها المحاسب أو المدير'),
  item_archived: () => t('mill.problem.archived', 'المادّة مؤرشفة'),
};

export const problemText = (code: string): string => (PROBLEM_TEXT[code] ?? (() => t('mill.problem.other', 'مشكلة في الدفعة: {code}', { code })))();

export default function BatchPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const fieldId = useId();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const canPost = role !== null && can(role, 'production.post');
  const canDraft = role !== null && can(role, 'production.draft');
  const canVoid = role !== null && can(role, 'void');
  const canSeal = role !== null && can(role, 'costs.load');

  const load = useCallback(async (): Promise<BatchState> => {
    const batch = await loadBatch(id);
    return { batch, preview: batch.status === 'draft' ? await previewProduction(id) : null };
  }, [id]);
  const { data, error, loading, retry } = useLoad<BatchState>(load, id);
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);

  const batch = data?.batch ?? null;
  const preview = data?.preview ?? null;
  const lines = preview?.lines ?? batch?.lines ?? [];
  const plannedDecimals = useMemo(() => columnDecimals(lines.map((line) => line.plannedQty), 3) as 0 | 1 | 2 | 3, [lines]);
  const costShown = lines.some((line) => line.value !== null);

  const columns = useMemo<Column<(typeof lines)[number]>[]>(() => {
    const base: Column<(typeof lines)[number]>[] = [
      { key: 'item', header: t('mill.line.item', 'المادّة'), wrap: true, cell: (line) => line.itemName },
      { key: 'planned', header: t('mill.line.planned', 'المخطّط'), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.plannedQty, plannedDecimals)}</Num> },
      {
        key: 'draw',
        header: t('mill.line.draw', 'سيُسحب'),
        kind: 'number',
        cell: (line) => <Num>{fmtQtyCell('drawQty' in line ? line.drawQty : (line.usedQty ?? line.plannedQty), plannedDecimals)}</Num>,
      },
      { key: 'unit', header: t('mill.line.unit', 'الوحدة'), cell: (line) => (line.baseUnit === 'L' ? t('unit.L', 'لتر') : t('unit.kg', 'كغم')) },
    ];
    if (!costShown) return base;
    return [...base, { key: 'value', header: t('mill.line.value', 'القيمة'), kind: 'number', cell: (line) => <Num>{line.value === null ? t('mill.col.no_doc', '—') : fmtMoney(line.value)}</Num> }];
  }, [costShown, plannedDecimals]);

  if (error) return <LoadFailed what={t('mill.batch.what', 'دفعة الإنتاج')} error={error} onRetry={retry} />;
  if (loading || !batch) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  // الحقل يبدأ من الوزن المحفوظ (إن وُجد) ويتبع الكتابة بعدها، فلا تُداس كتابة المستخدم بكلّ قراءة (درس WP5).
  const shownWeight = touched ? weight : batch.outputQtyKg > 0n ? decimalText(batch.outputQtyKg, 3) : '';
  const typedWeight = shownWeight.trim() === '' ? null : parseQty(shownWeight);
  const weightBad = shownWeight.trim() !== '' && (typedWeight === null || typedWeight <= 0n);

  const saveWeight = async () => {
    if (weightBad) return;
    setBusy(true);
    setFailure(null);
    try {
      await setBatchFields(batch.id, { outputQtyKg: typedWeight, shrinkReason: reason.trim() === '' ? null : reason });
      setTouched(false);
      retry();
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!preview) return;
    setBusy(true);
    setFailure(null);
    try {
      await postProduction(batch.id, preview.version, preview.planToken, millRef(`post:${batch.id}`));
      forgetMillRef(`post:${batch.id}`);
      toast({ tone: 'success', title: t('mill.posted', 'تمّ الإنتاج: دخل العلف مخزنه.') });
      retry();
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const seal = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await confirmCosts(batch.id, batch.version);
      retry();
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await discardBatch(batch.id, batch.version);
      toast({ tone: 'success', title: t('mill.discarded', 'طُويت المسوّدة.') });
      navigate('/mill');
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
      setBusy(false);
    }
  };

  const kill = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await voidProduction(batch.id, t('mill.void.reason', 'إلغاء دفعة إنتاج'), millRef(`void:${batch.id}`));
      forgetMillRef(`void:${batch.id}`);
      toast({ tone: 'success', title: t('mill.voided', 'أُلغيت الدفعة ورجعت موادّها إلى مخزنها.') });
      setVoiding(false);
      retry();
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
      setVoiding(false);
    } finally {
      setBusy(false);
    }
  };

  const mass = preview?.inputMassKg ?? batch.inputMassKg;
  const output = preview?.outputQtyKg ?? batch.outputQtyKg;
  const shrink = preview?.shrinkKg ?? batch.shrinkKg;
  const totalValue = preview?.totalValue ?? batch.totalValue;
  const costPerKg = preview?.costPerKg ?? batch.costPerKg;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('mill.batch.title', 'دفعة «{name}»', { name: batch.recipeName })}
        subtitle={
          <>
            {fmtDay(batch.producedOn)}
            {batch.docNo ? ` · ${batch.docNo}` : ''}
          </>
        }
        actions={
          <Link to="/mill" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="back-to-mill">
            {t('mill.back', 'المعمل')}
          </Link>
        }
      />

      <Stats
        stats={[
          { key: 'planned', label: t('mill.stat.planned', 'المخطّط'), value: <Num>{fmtQty(batch.plannedKg, 'kg').main}</Num> },
          { key: 'mass', label: t('mill.stat.mass', 'كتلة المواد'), value: <Num>{fmtQty(mass, 'kg').main}</Num> },
          { key: 'output', label: t('mill.stat.output', 'الناتج'), value: <Num>{fmtQty(output, 'kg').main}</Num> },
          {
            key: 'shrink',
            label: t('mill.stat.shrink', 'الهدر'),
            value: <Num>{mass > 0n ? pct(shrink, mass) : fmtQty(shrink, 'kg').main}</Num>,
          },
        ]}
      />

      {costPerKg !== null || totalValue !== null ? (
        <Stats
          stats={[
            { key: 'cost', label: t('mill.stat.cost', 'كلفة الكيلو'), value: <Num>{costPerKg === null ? t('mill.col.no_doc', '—') : fmtMoney(costPerKg)}</Num> },
            { key: 'total', label: t('mill.stat.total', 'كلفة الدفعة'), value: <Num>{totalValue === null ? t('mill.col.no_doc', '—') : fmtMoney(totalValue)}</Num> },
          ]}
        />
      ) : null}

      <DataTable
        caption={t('mill.batch.caption', 'مواد الدفعة وما يُسحب من كلّ واحدة')}
        columns={columns}
        rows={lines}
        rowKey={(line) => ('inputId' in line ? line.inputId : line.id)}
        empty={t('mill.batch.empty', 'لا مواد في هذه الدفعة.')}
      />

      {preview?.problems.length ? (
        <Notice
          tone="warning"
          title={t('mill.problems.title', 'قبل الإنتاج:')}
        >
          {preview.problems.map((problem) => (problem.itemName ? `${problemText(problem.code)} — ${problem.itemName}` : problemText(problem.code))).join(' · ')}
        </Notice>
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}

      {batch.status === 'draft' && canDraft ? (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('mill.weigh.title', 'وزن الناتج')}</h2>
          <p className="text-sm text-ink-muted">{t('mill.weigh.hint', 'اتركه فارغاً إن لم تزنه: يُحسب الناتج بكتلة المواد نفسها (بلا هدر).')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${fieldId}-weight`} label={t('mill.weigh.kg', 'الوزن بالكيلوغرام')} error={weightBad ? t('mill.weigh.bad', 'اكتب وزناً أكبر من صفر.') : undefined}>
              <input
                id={`${fieldId}-weight`}
                className="input tabular-nums"
                inputMode="decimal"
                dir="ltr"
                value={shownWeight}
                onChange={(event) => {
                  setTouched(true);
                  setWeight(event.target.value);
                }}
              />
            </Field>
            <Field id={`${fieldId}-reason`} label={t('mill.weigh.reason', 'سبب الهدر (إن خرج عن المدى)')}>
              <input id={`${fieldId}-reason`} className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
          <Button variant="secondary" busy={busy} disabled={weightBad} onClick={() => void saveWeight()} data-action="save-weight">
            {t('mill.weigh.save', 'احفظ الوزن')}
          </Button>
        </section>
      ) : null}

      {batch.status === 'draft' ? (
        <div className="flex flex-wrap gap-2">
          {canPost ? (
            <Button
              size="lg"
              icon={<Factory className="size-5" aria-hidden="true" />}
              busy={busy}
              disabled={!preview?.canPost}
              onClick={() => void post()}
              data-action="post-production"
            >
              {t('mill.post', 'أنتج الآن')}
            </Button>
          ) : null}
          {!batch.costsConfirmed && canSeal ? (
            <Button variant="secondary" busy={busy} onClick={() => void seal()} data-action="seal-costs">
              {t('mill.seal', 'اختم الكلف')}
            </Button>
          ) : null}
          {canDraft ? (
            <Button variant="ghost" icon={<Trash2 className="size-5" aria-hidden="true" />} busy={busy} onClick={() => void discard()} data-action="discard-batch">
              {t('mill.discard', 'اطوِ المسوّدة')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {batch.status === 'posted' && canVoid ? (
        <Button variant="danger" onClick={() => setVoiding(true)} data-action="void-batch">
          {t('mill.void', 'ألغِ الدفعة')}
        </Button>
      ) : null}
      {batch.status === 'void' ? <Notice tone="info" title={t('mill.void.done', 'هذه الدفعة ملغاة.')}>{batch.voidReason}</Notice> : null}

      {voiding ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.void.confirm.title', 'إلغاء دفعة «{name}»؟', { name: batch.recipeName })}
          consequence={t('mill.void.confirm.body', 'ترجع المواد إلى دفعاتها في مخزن المواد، وتُلغى دفعة العلف الناتجة. إن كان قد صُرف من هذا العلف شيء فلن يُقبل الإلغاء.')}
          confirmLabel={t('mill.void', 'ألغِ الدفعة')}
          busy={busy}
          onConfirm={() => void kill()}
          onCancel={() => setVoiding(false)}
        />
      ) : null}
    </div>
  );
}
