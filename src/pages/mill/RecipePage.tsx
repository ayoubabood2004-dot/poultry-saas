import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { decimalText } from '../../domain/decimal';
import { parseMoney, type Fils } from '../../domain/money';
import { can } from '../../domain/permissions';
import { parseQty } from '../../domain/units';
import { describeError } from '../../lib/errors';
import { columnDecimals, fmtInt, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { setItemCostPrice } from '../../lib/repo/inventory';
import {
  activateVersion,
  addRecipeLine,
  addRecipeRate,
  createVersion,
  deleteRecipeLine,
  deleteRecipeRate,
  loadRecipe,
  setRecipeLine,
  setRecipeRate,
  setVersionBasis,
  type RecipeDetail,
  type RecipeLine,
  type RecipeRate,
  type RecipeUnit,
} from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { CellEdit, unitWord, useDrafts } from './pickers';
import { Chip, CompositionBar, dash, forgetMillRef, millRef, pct, pieceColor, recipeColor } from './shared';

// بطاقة الخلطة (0015): نسخها، وموادّها بجدول كلاسيكي مع حصّة كلّ مادّة، وأقسامها (تصنيف المادّة) برقاقات فوق الجدول،
// وشريط التركيبة بلمحة. النسخة المسوّدة تُعدَّل وتُفعَّل؛ والمفعَّلة مجمَّدة، فالتعديل نسخة جديدة (التاريخ لا يُعاد كتابته).
// النسخة الثانية (0016): لكلّ مادّة سعر الشراء التلقائي (آخر استلام) وسعر الكلفة المكتوب (يُكتب هنا لمن يملك الصلاحية) بجانب
// متوسّط المتاح؛ و«تكاليف لكلّ طنّ» بفئة مصروف (تُكتب في المسوّدة)؛ وكلفة الطنّ المتوقّعة من الخادم للتخطيط.

function LineDialog({ recipe, line, onClose, onSaved }: { recipe: RecipeDetail; line: RecipeLine | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [item, setItem] = useState(line?.itemId ?? '');
  const [qty, setQty] = useState(line ? decimalText(line.qty, 3) : '');
  const [unit, setUnit] = useState<RecipeUnit>(line?.unit ?? 'kg');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = recipe.pickItems.find((candidate) => candidate.id === item) ?? null;
  const value = parseQty(qty);
  const bad = qty.trim() !== '' && (value === null || value <= 0n);
  const liquid = picked?.baseUnit === 'L' || line?.baseUnit === 'L';

  const save = async () => {
    if (!value || value <= 0n || (!line && item === '')) return;
    setBusy(true);
    setError(null);
    try {
      if (line) await setRecipeLine(line.id, value, unit);
      else if (recipe.versionId) await addRecipeLine(recipe.versionId, item, value, unit);
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
      dirty={qty !== (line ? decimalText(line.qty, 3) : '') || item !== (line?.itemId ?? '')}
      title={line ? t('mill.line.edit', 'تعديل «{name}»', { name: line.itemName }) : t('mill.line.add', 'مادّة في الخلطة')}
      footer={
        <Button onClick={() => void save()} busy={busy} disabled={!value || value <= 0n || (!line && item === '')} data-action="line-save">
          {t('common.save', 'حفظ')}
        </Button>
      }
    >
      <p className="text-sm text-ink-muted">
        {t('mill.line.hint', 'الكمية لكلّ {basis} من الخلطة: مجموع المواد يجب أن يساوي هذا الأساس بالضبط.', { basis: fmtQty(recipe.basisKg, 'kg').main })}
      </p>
      {line ? null : (
        <Field id={`${id}-item`} label={t('mill.line.item', 'المادّة')}>
          <select id={`${id}-item`} className="input" value={item} onChange={(event) => setItem(event.target.value)}>
            <option value="">{t('mill.line.pick', 'اختر المادّة')}</option>
            {recipe.pickItems.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.categoryName ? `${candidate.name} — ${candidate.categoryName}` : candidate.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id={`${id}-qty`} label={t('mill.line.qty', 'الكمية')} error={bad ? t('mill.line.qty_bad', 'اكتب كمية أكبر من صفر.') : undefined}>
        <input id={`${id}-qty`} className="input tabular-nums" inputMode="decimal" dir="ltr" value={qty} onChange={(event) => setQty(event.target.value)} />
      </Field>
      {liquid ? (
        <Field id={`${id}-unit`} label={t('mill.line.unit_pick', 'الوحدة')} hint={t('mill.line.unit_hint', 'اللتر يُحوَّل إلى كيلوغرام بكثافة المادّة المحفوظة لحظة التفعيل.')}>
          <select id={`${id}-unit`} className="input" value={unit} onChange={(event) => setUnit(event.target.value === 'L' ? 'L' : 'kg')}>
            <option value="kg">{t('unit.kg', 'كغم')}</option>
            <option value="L">{t('unit.L', 'لتر')}</option>
          </select>
        </Field>
      ) : null}
      {error ? <Notice tone="danger" title={error} /> : null}
    </Dialog>
  );
}

/** كلفة الطنّ المتوقّعة من الخادم (ج٧): للتخطيط، والفعلية من السحب الحقيقي عند الإنتاج. */
export function ExpectedPanel({ expected }: { expected: NonNullable<RecipeDetail['expected']> }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3" data-action="expected-cost">
      <p className="font-semibold">
        {expected.unpriced === 0
          ? t('mill.expected.title', 'كلفة الطنّ المتوقّعة: {ton}', { ton: fmtMoney(expected.costPerTon) })
          : t('mill.expected.partial', 'كلفة الطنّ المتوقّعة: {ton} على الأقلّ', { ton: fmtMoney(expected.costPerTon) })}
      </p>
      <p className="text-sm text-ink-muted">
        {t('mill.builder.planned_parts', 'المواد {materials} والتكاليف {rates} لكلّ طنّ.', { materials: fmtMoney(expected.materialsPerTon), rates: fmtMoney(expected.ratesPerTon) })}
        {expected.unpriced > 0 ? ` ${t('mill.expected.unpriced', '{count} من المواد بلا أيّ سعر فلم تُحسب: اكتب سعر كلفتها.', { count: fmtInt(expected.unpriced) })}` : ''}
      </p>
      <p className="text-xs text-ink-muted">{t('mill.expected.note', 'سعر كلّ مادّة: سعر الكلفة المكتوب، وإلّا آخر شراء، وإلّا متوسّط المتاح. الكلفة الفعلية للعلف من السحب الحقيقي عند الإنتاج.')}</p>
    </div>
  );
}

export default function RecipePage() {
  const { id = '' } = useParams();
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const role = workspace?.role ?? null;
  const canEdit = role !== null && can(role, 'recipe.activate');
  const costs = Boolean(workspace?.canSeeCost);
  const canPrice = costs && role !== null && can(role, 'stores.manage');
  const [versionId, setVersionId] = useState<string | null>(null);
  const load = useCallback(() => loadRecipe(id, versionId), [id, versionId]);
  const { data, error, loading, retry } = useLoad<RecipeDetail>(load, `${id}#${versionId ?? ''}`);
  const [editing, setEditing] = useState<RecipeLine | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RecipeLine | null>(null);
  const [removingRate, setRemovingRate] = useState<RecipeRate | null>(null);
  const [basis, setBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const prices = useDrafts<Fils | null>();
  const rateDrafts = useDrafts<Fils>();
  const [newRate, setNewRate] = useState({ categoryId: '', amount: '' });
  const basisId = useId();
  const fieldId = useId();

  const lines = useMemo(() => data?.lines ?? [], [data]);
  const massDecimals = useMemo(() => columnDecimals(lines.map((line) => line.massKg), 3) as 0 | 1 | 2 | 3, [lines]);
  const qtyDecimals = useMemo(() => columnDecimals(lines.map((line) => line.qty), 3) as 0 | 1 | 2 | 3, [lines]);
  // أعمدة الأسعار مال: لأدوار الكلفة وحدها (الخادم يحذف money عن غيرهم).
  const costShown = costs;
  const isDraft = data?.status === 'draft';
  const hue = recipeColor(id).hue;

  const sections = useMemo(() => {
    const groups = new Map<string, bigint>();
    for (const line of lines) {
      const key = line.categoryName ?? t('mill.section.none', 'بلا قسم');
      groups.set(key, (groups.get(key) ?? 0n) + line.massKg);
    }
    return [...groups.entries()].map(([name, mass]) => ({ name, mass }));
  }, [lines]);

  const act = async (run: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await run();
      if (done) toast({ tone: 'success', title: done });
      retry();
    } catch (problem) {
      const { title, detail } = describeError(problem);
      setFailure(`${title} ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const savePrice = (line: RecipeLine) => {
    const draft = prices.get(line.itemId);
    if (!draft) return;
    const value = draft.text.trim() === '' ? null : parseMoney(draft.text);
    if (draft.text.trim() !== '' && (value === null || value <= 0n)) return;
    void act(async () => {
      await setItemCostPrice(line.itemId, value, draft.before);
      prices.clear(line.itemId);
    }, t('mill.price.saved', 'حُفظ سعر كلفة «{name}».', { name: line.itemName }));
  };

  const saveRate = (rate: RecipeRate) => {
    const draft = rateDrafts.get(rate.id);
    const value = draft ? parseMoney(draft.text) : null;
    if (!draft || value === null || value <= 0n) return;
    void act(async () => {
      await setRecipeRate(rate.id, draft.before, value);
      rateDrafts.clear(rate.id);
    });
  };

  const columns = ((): Column<RecipeLine>[] => {
    const base: Column<RecipeLine>[] = [
      { key: 'item', header: t('mill.line.item', 'المادّة'), wrap: true, sticky: true, cell: (line) => line.itemName },
      { key: 'section', header: t('mill.col.section', 'القسم'), cell: (line) => line.categoryName ?? t('mill.section.none', 'بلا قسم') },
      { key: 'qty', header: t('mill.line.qty', 'الكمية'), kind: 'number', cell: (line) => <Num>{fmtQtyCell(line.qty, qtyDecimals)}</Num> },
      { key: 'unit', header: t('mill.line.unit_col', 'الوحدة'), cell: (line) => (line.unit === 'L' ? t('unit.L', 'لتر') : t('unit.kg', 'كغم')) },
      {
        key: 'mass',
        header: t('mill.col.mass', 'بالكيلوغرام'),
        kind: 'number',
        cell: (line) => <Num>{fmtQtyCell(line.massKg, massDecimals)}</Num>,
        total: <Num>{fmtQtyCell(data?.massKg ?? 0n, massDecimals)}</Num>,
      },
      {
        key: 'share',
        header: t('mill.col.share', 'الحصّة'),
        kind: 'number',
        cell: (line) => <Num>{(data?.basisKg ?? 0n) > 0n ? pct(line.massKg, data?.basisKg ?? 1n) : dash()}</Num>,
      },
    ];
    if (costShown) {
      base.push(
        {
          key: 'last',
          header: t('mill.col.last_price', 'سعر الشراء (آخر شراء)'),
          kind: 'number',
          cell: (line) => <Num>{line.lastPrice === null ? dash() : fmtMoney(line.lastPrice)}</Num>,
        },
        {
          key: 'cost_price',
          header: t('mill.col.cost_price', 'سعر الكلفة'),
          kind: 'number',
          cell: (line) => {
            if (!canPrice) return <Num>{line.costPrice === null ? dash() : fmtMoney(line.costPrice)}</Num>;
            const saved = line.costPrice === null ? '' : decimalText(line.costPrice, 2);
            const draft = prices.get(line.itemId);
            const text = draft?.text ?? saved;
            const parsed = text.trim() === '' ? null : parseMoney(text);
            return (
              <CellEdit
                id={`${fieldId}-cost-${line.itemId}`}
                label={t('mill.builder.cost_of', 'سعر كلفة «{name}» لكلّ {unit}', { name: line.itemName, unit: unitWord(line.baseUnit) })}
                value={text}
                dirty={draft !== undefined && text !== saved}
                invalid={text.trim() !== '' && (parsed === null || parsed <= 0n)}
                busy={busy}
                action="cost-price"
                onChange={(next) => prices.write(line.itemId, next, line.costPrice)}
                onSave={() => savePrice(line)}
              />
            );
          },
        },
        {
          key: 'cost',
          header: t('mill.col.avg_cost', 'متوسّط المتاح'),
          kind: 'number',
          cell: (line) => <Num>{line.unitCost === null ? dash() : fmtMoney(line.unitCost)}</Num>,
        },
      );
    }
    if (isDraft && canEdit) {
      base.push({
        key: 'actions',
        header: t('mill.col.actions', 'إجراءات'),
        cell: (line) => (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" aria-hidden="true" />} onClick={() => setEditing(line)} data-action="edit-line">
              {t('common.edit', 'عدّل')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setRemoving(line)} data-action="remove-line">
              {t('common.delete', 'احذف')}
            </Button>
          </span>
        ),
      });
    }
    return base;
  })();

  if (error) return <LoadFailed what={t('mill.recipe.what', 'بطاقة الخلطة')} error={error} onRetry={retry} />;
  if (loading || !data) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  const gap = data.basisKg - data.massKg;
  const balanced = gap === 0n && lines.length > 0;
  const rates = data.rates ?? [];
  const canRates = isDraft && canEdit && costs;
  const freeCategories = data.expenseCategories.filter((category) => !rates.some((rate) => rate.categoryId === category.id));
  const newRateValue = newRate.amount.trim() === '' ? null : parseMoney(newRate.amount);
  const newRateOk = newRate.categoryId !== '' && newRateValue !== null && newRateValue > 0n;

  const rateColumns: Column<RecipeRate>[] = [
    { key: 'category', header: t('mill.rates.category', 'فئة المصروف'), wrap: true, cell: (rate) => rate.categoryName },
    {
      key: 'amount',
      header: t('mill.rates.amount', 'المبلغ لكلّ طنّ (دينار)'),
      kind: 'number',
      cell: (rate) => {
        if (!canRates) return <Num>{fmtMoney(rate.amountPerTon)}</Num>;
        const saved = decimalText(rate.amountPerTon, 2);
        const draft = rateDrafts.get(rate.id);
        const text = draft?.text ?? saved;
        const parsed = parseMoney(text);
        return (
          <CellEdit
            id={`${fieldId}-rate-${rate.id}`}
            label={t('mill.rates.amount_named', 'مبلغ «{name}» لكلّ طنّ', { name: rate.categoryName })}
            value={text}
            dirty={draft !== undefined && text !== saved}
            invalid={parsed === null || parsed <= 0n}
            busy={busy}
            action="rate-amount"
            onChange={(next) => rateDrafts.write(rate.id, next, rate.amountPerTon)}
            onSave={() => saveRate(rate)}
          />
        );
      },
      total: data.expected ? <Num>{fmtMoney(data.expected.ratesPerTon)}</Num> : undefined,
    },
  ];
  if (canRates) {
    rateColumns.push({
      key: 'actions',
      header: t('mill.col.actions', 'إجراءات'),
      cell: (rate) => (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setRemovingRate(rate)} data-action="remove-rate">
          {t('common.delete', 'احذف')}
        </Button>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={data.name}
        subtitle={t('mill.card.output', 'تنتج: {item}', { item: data.outputItem.name })}
        actions={
          <Link to="/mill" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="back-to-mill">
            {t('mill.back', 'المعمل')}
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {data.versions.map((version) => (
          <Button
            key={version.id}
            size="sm"
            variant={version.id === data.versionId ? 'primary' : 'secondary'}
            onClick={() => setVersionId(version.id)}
            data-action="pick-version"
          >
            {version.status === 'active'
              ? t('mill.version.active', 'نسخة {no} (المفعَّلة)', { no: fmtInt(version.versionNo) })
              : version.status === 'draft'
                ? t('mill.version.draft', 'نسخة {no} (مسوّدة)', { no: fmtInt(version.versionNo) })
                : t('mill.version.retired', 'نسخة {no} (مقاعدة)', { no: fmtInt(version.versionNo) })}
          </Button>
        ))}
        {canEdit && !data.versions.some((version) => version.status === 'draft') ? (
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden="true" />} busy={busy} onClick={() => void act(() => createVersion(data.id, data.basisKg > 0n ? data.basisKg : 1000000n), t('mill.version.added', 'أُنشئت نسخة مسوّدة.'))} data-action="new-version">
            {t('mill.version.new', 'نسخة جديدة')}
          </Button>
        ) : null}
      </div>

      <section className="card flex flex-col gap-3 p-4">
        <p className="text-sm text-ink-muted">{t('mill.detail.basis', 'الأساس: {basis}', { basis: fmtQty(data.basisKg, 'kg').main })}</p>
        <CompositionBar pieces={lines.map((line) => ({ key: line.id, label: line.itemName, weight: line.massKg }))} total={data.basisKg > 0n ? data.basisKg : 1n} hue={hue} />
        <div className="flex flex-wrap gap-1.5">
          {sections.map((section, index) => (
            <Chip key={section.name} dot={pieceColor(hue, index)}>
              <span className="truncate">{section.name}</span>
              <Num>{fmtQty(section.mass, 'kg').main}</Num>
            </Chip>
          ))}
        </div>
      </section>

      {isDraft ? (
        gap === 0n ? (
          <Notice tone="info" title={t('mill.detail.balanced', 'المجموع مطابق للأساس: الخلطة جاهزة للتفعيل.')} />
        ) : (
          <Notice
            tone="warning"
            title={t('mill.detail.gap', 'المجموع {sum} من {basis}', { sum: fmtQty(data.massKg, 'kg').main, basis: fmtQty(data.basisKg, 'kg').main })}
          >
            {gap > 0n ? t('mill.detail.missing', 'ينقص {gap}', { gap: fmtQty(gap, 'kg').main }) : t('mill.detail.extra', 'يزيد {gap}', { gap: fmtQty(-gap, 'kg').main })}
          </Notice>
        )
      ) : null}
      {failure ? <Notice tone="danger" title={failure} /> : null}

      <DataTable
        caption={t('mill.detail.caption', 'مواد الخلطة وحصّة كلّ مادّة من الأساس')}
        columns={columns}
        rows={lines}
        rowKey={(line) => line.id}
        empty={t('mill.detail.empty', 'لا مواد في هذه النسخة بعد.')}
        totalLabel={t('mill.detail.total', 'المجموع')}
      />

      {isDraft && canEdit ? (
        <div className="flex flex-wrap items-end gap-3">
          <Button icon={<Plus className="size-5" aria-hidden="true" />} onClick={() => setAdding(true)} data-action="add-line">
            {t('mill.detail.add_line', 'أضف مادّة')}
          </Button>
          <Field id={basisId} label={t('mill.detail.set_basis', 'أساس الخلطة (كغم)')}>
            <input
              id={basisId}
              className="input tabular-nums"
              inputMode="decimal"
              dir="ltr"
              value={basis === '' ? decimalText(data.basisKg, 3) : basis}
              onChange={(event) => setBasis(event.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            busy={busy}
            disabled={basis.trim() === '' || !parseQty(basis) || (parseQty(basis) ?? 0n) <= 0n}
            onClick={() =>
              void act(async () => {
                const value = parseQty(basis);
                if (value && data.versionId) await setVersionBasis(data.versionId, value, data.versionVersion);
                setBasis('');
              }, t('mill.detail.basis_saved', 'حُفظ الأساس.'))
            }
            data-action="save-basis"
          >
            {t('mill.detail.save_basis', 'احفظ الأساس')}
          </Button>
          <Button
            size="lg"
            icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
            busy={busy}
            disabled={!balanced}
            onClick={() => void act(() => activateVersion(data.versionId ?? '', data.versionVersion), t('mill.detail.activated', 'فُعّلت النسخة: صارت هي خلطة الإنتاج.'))}
            data-action="activate-version"
          >
            {t('mill.detail.activate', 'فعّل النسخة')}
          </Button>
        </div>
      ) : null}

      {data.rates !== null ? (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('mill.rates.title', 'تكاليف لكلّ طنّ')}</h2>
          <p className="text-sm text-ink-muted">
            {t('mill.rates.hint', 'أيدي عاملة أو كهرباء أو نقل: مبلغ لكلّ طنّ يُحسب على كلّ دفعة بكميتها، ويُحمَّل عند الإنتاج من مصروف مسجّل بفئته.')}
          </p>
          <DataTable
            caption={t('mill.rates.caption', 'تكاليف الخلطة لكلّ طنّ بفئة المصروف')}
            columns={rateColumns}
            rows={rates}
            rowKey={(rate) => rate.id}
            empty={t('mill.rates.empty', 'لا تكاليف على هذه الخلطة. أضفها إن كان للعلف حصّة من مصروف.')}
            totalLabel={t('mill.detail.total', 'المجموع')}
          />
          {canRates && freeCategories.length ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field id={`${fieldId}-new-rate-category`} label={t('mill.rates.category', 'فئة المصروف')}>
                <select
                  id={`${fieldId}-new-rate-category`}
                  className="input"
                  value={newRate.categoryId}
                  onChange={(event) => setNewRate((current) => ({ ...current, categoryId: event.target.value }))}
                  data-action="new-rate-category"
                >
                  <option value="">{t('mill.rates.category_pick', 'اختر فئة المصروف')}</option>
                  {freeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`${fieldId}-new-rate-amount`} label={t('mill.rates.amount', 'المبلغ لكلّ طنّ (دينار)')}>
                <input
                  id={`${fieldId}-new-rate-amount`}
                  className="input text-end tabular-nums"
                  inputMode="decimal"
                  dir="ltr"
                  value={newRate.amount}
                  onChange={(event) => setNewRate((current) => ({ ...current, amount: event.target.value }))}
                  data-action="new-rate-amount"
                />
              </Field>
              <Button
                variant="secondary"
                icon={<Plus className="size-5" aria-hidden="true" />}
                busy={busy}
                disabled={!newRateOk || !data.versionId}
                onClick={() => {
                  if (!newRateOk || newRateValue === null || !data.versionId) return;
                  const slot = `rate:${data.versionId}:${newRate.categoryId}`;
                  const versionOf = data.versionId;
                  void act(async () => {
                    await addRecipeRate(versionOf, millRef(slot), newRate.categoryId, newRateValue);
                    forgetMillRef(slot);
                    setNewRate({ categoryId: '', amount: '' });
                  });
                }}
                data-action="add-rate"
              >
                {t('mill.rates.add', 'أضف تكلفة')}
              </Button>
            </div>
          ) : null}
          {canRates && !data.expenseCategories.length ? (
            <Notice
              tone="info"
              title={t('mill.rates.no_categories', 'لا فئة مصروف بعد.')}
              action={
                <Link to="/settings/org" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-expense-categories">
                  {t('mill.rates.categories_link', 'أضف فئات المصاريف')}
                </Link>
              }
            />
          ) : null}
          {data.expected ? <ExpectedPanel expected={data.expected} /> : null}
        </section>
      ) : null}

      {adding ? (
        <LineDialog
          recipe={data}
          line={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            retry();
          }}
        />
      ) : null}
      {editing ? (
        <LineDialog
          recipe={data}
          line={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            retry();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.line.remove.title', 'حذف «{name}» من الخلطة؟', { name: removing.itemName })}
          consequence={t('mill.line.remove.body', 'تُحذف من هذه النسخة المسوّدة وحدها؛ النسخ المفعَّلة والمقاعدة لا تتغيّر.')}
          confirmLabel={t('common.delete', 'احذف')}
          busy={busy}
          onConfirm={() =>
            void act(async () => {
              await deleteRecipeLine(removing.id, data.versionVersion);
              setRemoving(null);
            })
          }
          onCancel={() => setRemoving(null)}
        />
      ) : null}
      {removingRate ? (
        <ConfirmDialog
          open
          tone="danger"
          title={t('mill.rates.remove.title', 'حذف تكلفة «{name}» من الخلطة؟', { name: removingRate.categoryName })}
          consequence={t('mill.rates.remove.body', 'تُحذف من هذه النسخة المسوّدة وحدها: الدفعات الجديدة بعد تفعيلها لا تُحسب عليها هذه التكلفة.')}
          confirmLabel={t('common.delete', 'احذف')}
          busy={busy}
          action="confirm-remove-rate"
          onConfirm={() =>
            void act(async () => {
              await deleteRecipeRate(removingRate.id, data.versionVersion);
              setRemovingRate(null);
            })
          }
          onCancel={() => setRemovingRate(null)}
        />
      ) : null}
    </div>
  );
}
