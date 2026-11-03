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
import { can } from '../../domain/permissions';
import { parseQty } from '../../domain/units';
import { describeError } from '../../lib/errors';
import { columnDecimals, fmtInt, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import {
  activateVersion,
  addRecipeLine,
  createVersion,
  deleteRecipeLine,
  loadRecipe,
  setRecipeLine,
  setVersionBasis,
  type RecipeDetail,
  type RecipeLine,
  type RecipeUnit,
} from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { Chip, CompositionBar, pct } from './shared';

// بطاقة الخلطة (0015): نسخها، وموادّها بجدول كلاسيكي مع حصّة كلّ مادّة، وأقسامها (تصنيف المادّة) برقاقات فوق الجدول،
// وشريط التركيبة بلمحة. النسخة المسوّدة تُعدَّل وتُفعَّل؛ والمفعَّلة مجمَّدة، فالتعديل نسخة جديدة (التاريخ لا يُعاد كتابته).

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
  const liquid = picked?.baseUnit === 'L';

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

export default function RecipePage() {
  const { id = '' } = useParams();
  const session = useSession();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const canEdit = role !== null && can(role, 'recipe.activate');
  const [versionId, setVersionId] = useState<string | null>(null);
  const load = useCallback(() => loadRecipe(id, versionId), [id, versionId]);
  const { data, error, loading, retry } = useLoad<RecipeDetail>(load, `${id}#${versionId ?? ''}`);
  const [editing, setEditing] = useState<RecipeLine | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RecipeLine | null>(null);
  const [basis, setBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const basisId = useId();

  const lines = data?.lines ?? [];
  const massDecimals = useMemo(() => columnDecimals(lines.map((line) => line.massKg), 3) as 0 | 1 | 2 | 3, [lines]);
  const qtyDecimals = useMemo(() => columnDecimals(lines.map((line) => line.qty), 3) as 0 | 1 | 2 | 3, [lines]);
  const costShown = lines.some((line) => line.unitCost !== null);
  const isDraft = data?.status === 'draft';

  const sections = useMemo(() => {
    const groups = new Map<string, bigint>();
    for (const line of lines) {
      const key = line.categoryName ?? t('mill.section.none', 'بلا قسم');
      groups.set(key, (groups.get(key) ?? 0n) + line.massKg);
    }
    return [...groups.entries()].map(([name, mass]) => ({ name, mass }));
  }, [lines]);

  const columns = useMemo<Column<RecipeLine>[]>(() => {
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
        cell: (line) => <Num>{(data?.basisKg ?? 0n) > 0n ? pct(line.massKg, data?.basisKg ?? 1n) : t('mill.col.no_doc', '—')}</Num>,
      },
    ];
    if (costShown) {
      base.push({
        key: 'cost',
        header: t('mill.col.unit_cost', 'كلفة الوحدة'),
        kind: 'number',
        cell: (line) => <Num>{line.unitCost === null ? t('mill.col.no_doc', '—') : fmtMoney(line.unitCost)}</Num>,
      });
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
  }, [canEdit, costShown, data?.basisKg, data?.massKg, isDraft, massDecimals, qtyDecimals]);

  if (error) return <LoadFailed what={t('mill.recipe.what', 'بطاقة الخلطة')} error={error} onRetry={retry} />;
  if (loading || !data) return <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p>;

  const gap = data.basisKg - data.massKg;
  const balanced = gap === 0n && lines.length > 0;

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
        <CompositionBar pieces={lines.map((line) => ({ key: line.id, label: line.itemName, weight: line.massKg }))} total={data.basisKg > 0n ? data.basisKg : 1n} />
        <div className="flex flex-wrap gap-1.5">
          {sections.map((section) => (
            <Chip key={section.name}>
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
    </div>
  );
}
