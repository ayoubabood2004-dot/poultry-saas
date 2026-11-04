import { ChefHat, Factory, Plus, Warehouse } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { can } from '../../domain/permissions';
import { parseQty } from '../../domain/units';
import { describeError } from '../../lib/errors';
import { columnDecimals, fmtDay, fmtInt, fmtMilli, fmtMoney, fmtQty, fmtQtyCell } from '../../lib/format';
import { t } from '../../lib/i18n';
import { createProduction, isDuplicate, loadMill, type MillHome, type MillStore, type RecipeCard } from '../../lib/repo/mill';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { Chip, CompositionBar, dash, forgetMillRef, millRef, pieceColor, recipeColor } from './shared';

// شاشة معمل العلف (0015، كلمة المالك 2026-11-03): الخلطات بطاقاتٍ ملوّنة، كلّ واحدة تُقرأ بلمحة (شريط التركيبة ورقاقات
// موادّها)، وزرّ «أنتج» كبير عليها؛ وتحتها دفعات قيد العمل وآخر الدفعات بجدول كلاسيكي. الكلفة تظهر لأدوار الكلفة فقط
// (الخادم يحذف money عن غيرهم)، فالبطاقة تعمل كاملةً لمشغّل المعمل بلا أرقام مال.
// النسخة الثانية (كلمة المالك 2026-11-04): لون كلّ خلطة من معرّفها بلا حدّ، وأرقام الإنتاج على البطاقة (آخر إنتاج وكميته
// وكلفة كيلوه الفعلية، أو المتوقّعة قبل أوّل إنتاج، وعدد الدفعات)، و«خلطة جديدة» تفتح البانية بشاشة واحدة، و«أنتج» بكميات
// سريعة («احدد الكميات الي اريد اسويها بكل مرة»).

/** خيارا كمية الإنتاج: بالكيلوغرام أو بالطن (الطن ألف كيلوغرام)، والتحويل يظهر حيّاً تحت الحقل. */
export const PRODUCE_UNITS = [
  { id: 'kg', label: t('unit.kg', 'كغم'), perUnit: 1_000n },
  { id: 'ton', label: t('unit.t', 'طن'), perUnit: 1_000_000n },
];

/** كميات سريعة بالكيلوغرام (بالآلاف): نصف طنّ وطنّ وطنّان وخمسة أطنان، والحقل الحرّ لغيرها. */
export const QUICK_AMOUNTS: readonly { key: string; kg: bigint; label: () => string }[] = [
  { key: 'half', kg: 500_000n, label: () => t('mill.quick.half', 'نصف طنّ') },
  { key: 'one', kg: 1_000_000n, label: () => t('mill.quick.one', 'طنّ') },
  { key: 'two', kg: 2_000_000n, label: () => t('mill.quick.two', 'طنّان') },
  { key: 'five', kg: 5_000_000n, label: () => t('mill.quick.five', '{count} أطنان', { count: 5 }) },
];

export function RecipeCardView({ recipe, canProduce, onProduce }: { recipe: RecipeCard; canProduce: boolean; onProduce: () => void }) {
  const color = recipeColor(recipe.id);
  const basis = recipe.activeBasisKg ?? 0n;
  const last = recipe.lastBatch;
  return (
    <article className="card animate-fade-in overflow-hidden rounded-3xl p-0">
      <div className="h-2" style={{ background: color.solid }} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4" style={{ background: color.soft }}>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: color.solid }} aria-hidden="true">
            <ChefHat className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold">
              <Link to={`/mill/recipe/${recipe.id}`} className="hover:underline" data-action="open-recipe">
                {recipe.name}
              </Link>
            </h3>
            <p className="truncate text-sm text-ink-muted">{t('mill.card.output', 'تنتج: {item}', { item: recipe.outputItem.name })}</p>
          </div>
        </div>
        {recipe.activeId ? (
          <>
            <CompositionBar pieces={recipe.pieces} total={basis} hue={color.hue} />
            <div className="flex flex-wrap gap-1.5">
              {recipe.pieces.slice(0, 4).map((piece, index) => (
                <Chip key={piece.key} dot={pieceColor(color.hue, index)}>
                  <span className="truncate">{piece.label}</span>
                  <Num>{fmtQty(piece.weight, 'kg').main}</Num>
                </Chip>
              ))}
              {recipe.moreLines > 0 ? <Chip>{t('mill.card.more', 'و{count} أخرى', { count: fmtInt(recipe.moreLines) })}</Chip> : null}
            </div>
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-action="recipe-numbers">
              <div className="flex items-center gap-1">
                <dt className="text-ink-muted">{t('mill.card.basis', 'الأساس')}</dt>
                <dd className="font-medium">
                  <Num>{fmtQty(basis, 'kg').main}</Num>
                </dd>
              </div>
              <div className="flex items-center gap-1">
                <dt className="text-ink-muted">{t('mill.card.batches', 'الدفعات المنتَجة')}</dt>
                <dd className="font-medium">
                  <Num>{fmtInt(recipe.batches)}</Num>
                </dd>
              </div>
              {last ? (
                <div className="flex items-center gap-1">
                  <dt className="text-ink-muted">{t('mill.card.last', 'آخر إنتاج')}</dt>
                  <dd className="font-medium">
                    <Link to={`/mill/batch/${last.id}`} className="hover:underline" data-action="open-last-batch">
                      {t('mill.card.last_value', '{day} · {qty}', { day: fmtDay(last.producedOn), qty: fmtQty(last.outputQtyKg, 'kg').main })}
                    </Link>
                  </dd>
                </div>
              ) : null}
              {last && last.costPerKg !== null ? (
                <div className="flex items-center gap-1">
                  <dt className="text-ink-muted">{t('mill.card.cost', 'كلفة الكيلو الفعلية')}</dt>
                  <dd className="font-medium">
                    <Num>{fmtMoney(last.costPerKg)}</Num>
                  </dd>
                </div>
              ) : null}
              {!last && recipe.expectedCostPerKg !== null ? (
                <div className="flex items-center gap-1">
                  <dt className="text-ink-muted">{t('mill.card.expected', 'كلفة الكيلو المتوقّعة')}</dt>
                  <dd className="font-medium">
                    <Num>{fmtMoney(recipe.expectedCostPerKg)}</Num>
                  </dd>
                </div>
              ) : null}
            </dl>
            {!last ? <p className="text-sm text-ink-muted">{t('mill.card.never', 'لم تُنتَج بعد.')}</p> : null}
            {canProduce ? (
              <Button size="lg" icon={<Factory className="size-5" aria-hidden="true" />} onClick={onProduce} data-action="produce">
                {t('mill.card.produce', 'أنتج')}
              </Button>
            ) : null}
          </>
        ) : (
          <Notice tone="info" title={t('mill.card.no_active', 'هذه الخلطة بلا نسخة مفعَّلة.')}>{t('mill.card.no_active_detail', 'افتحها وأكمل موادّها ثم فعّلها لتُنتج بها.')}</Notice>
        )}
      </div>
    </article>
  );
}

/** الكمية بالآلاف من المكتوب ووحدته: المكتوب × (الآلاف في وحدته ÷ ألف) — الطن ألف كيلوغرام، فلا قسمة ولا تقريب. */
export function produceKg(text: string, unitId: string): bigint | null {
  const typed = parseQty(text);
  const unit = PRODUCE_UNITS.find((option) => option.id === unitId) ?? PRODUCE_UNITS[0];
  if (typed === null || !unit) return null;
  return (typed * unit.perUnit) / 1_000n;
}

export function ProduceDialog({ recipe, stores, today, onClose }: { recipe: RecipeCard; stores: readonly MillStore[]; today: string; onClose: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const inputs = stores.filter((store) => store.kind === 'raw');
  const outputs = stores.filter((store) => store.kind === 'feed');
  const [text, setText] = useState('');
  const [unitId, setUnitId] = useState('kg');
  const [from, setFrom] = useState(inputs[0]?.id ?? '');
  const [to, setTo] = useState(outputs[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kg = produceKg(text, unitId);

  const start = async () => {
    if (!kg || kg <= 0n || !recipe.activeId || from === '' || to === '') return;
    setBusy(true);
    setError(null);
    // المعرّف يولد بالجهاز ويبقى لنفس (النسخة، الكمية): إعادةٌ بعد جواب ضائع تصطدم بالمفتاح (23505 = كُتبت) فتُفتح
    // الدفعة نفسها، لا دفعة ثانية بنفس المواد (درس WP4).
    const slot = `create:${recipe.activeId}:${kg}:${from}:${to}`;
    const batchId = millRef(slot);
    try {
      await createProduction(batchId, recipe.activeId, kg, from, to, today);
      forgetMillRef(slot);
      navigate(`/mill/batch/${batchId}`);
    } catch (failure) {
      if (isDuplicate(failure)) {
        forgetMillRef(slot);
        navigate(`/mill/batch/${batchId}`);
        return;
      }
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
      dirty={text !== ''}
      title={t('mill.produce.title', 'إنتاج «{name}»', { name: recipe.name })}
      footer={
        <Button size="lg" busy={busy} disabled={!kg || kg <= 0n || from === '' || to === ''} onClick={() => void start()} data-action="produce-start">
          {t('mill.produce.next', 'جهّز الدفعة')}
        </Button>
      }
    >
      <p className="text-sm text-ink-muted">{t('mill.produce.hint', 'اختر الكمية أو اكتبها، ثم تُعرض عليك المواد التي ستُسحب بالتناسب وكلفة الكيلو قبل أن تُثبّت.')}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('mill.produce.quick', 'كميات سريعة')}>
        {QUICK_AMOUNTS.map((quick) => {
          const picked = kg === quick.kg && unitId === 'kg';
          return (
            <Button
              key={quick.key}
              size="sm"
              variant={picked ? 'primary' : 'secondary'}
              aria-pressed={picked}
              onClick={() => {
                setUnitId('kg');
                setText(fmtMilli(quick.kg));
              }}
              data-action="quick-qty"
            >
              {quick.label()}
            </Button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-qty`} label={t('mill.produce.qty', 'كمية الإنتاج')} hint={kg === null ? undefined : t('mill.produce.same', 'أي {qty}', { qty: fmtQty(kg, 'kg').main })}>
          <input id={`${id}-qty`} className="input tabular-nums" inputMode="decimal" dir="ltr" value={text} onChange={(event) => setText(event.target.value)} data-action="produce-qty" />
        </Field>
        <Field id={`${id}-unit`} label={t('mill.produce.unit', 'الوحدة')}>
          <select id={`${id}-unit`} className="input" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
            {PRODUCE_UNITS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {inputs.length > 1 ? (
        <Field id={`${id}-from`} label={t('mill.produce.from', 'مخزن المواد')}>
          <select id={`${id}-from`} className="input" value={from} onChange={(event) => setFrom(event.target.value)}>
            {inputs.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {outputs.length > 1 ? (
        <Field id={`${id}-to`} label={t('mill.produce.to', 'مخزن العلف')}>
          <select id={`${id}-to`} className="input" value={to} onChange={(event) => setTo(event.target.value)}>
            {outputs.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {!inputs.length || !outputs.length ? (
        <Notice tone="warning" title={t('mill.produce.no_stores', 'ينقص مخزن للمعمل.')}>
          {t('mill.produce.no_stores_detail', 'الإنتاج يسحب من مخزن المواد الأوّلية ويضع الناتج في مخزن العلف، وأحدهما غير موجود في نطاقك.')}
        </Notice>
      ) : null}
      {error ? <Notice tone="danger" title={error} /> : null}
    </Dialog>
  );
}

export default function MillPage() {
  const session = useSession();
  const navigate = useNavigate();
  const role = session.status === 'ready' ? session.workspace.role : null;
  const canRecipe = role !== null && can(role, 'recipe.activate');
  const canDraft = role !== null && can(role, 'production.draft');
  const load = useCallback(() => loadMill(), []);
  const { data, error, loading, retry } = useLoad<MillHome>(load);
  const [producing, setProducing] = useState<RecipeCard | null>(null);

  const rows = useMemo(() => data?.productions.rows ?? [], [data]);
  const costShown = rows.some((row) => row.costPerKg !== null);
  const qtyDecimals = useMemo(() => columnDecimals(rows.map((row) => row.outputQtyKg), 3) as 0 | 1 | 2 | 3, [rows]);
  const columns = useMemo<Column<(typeof rows)[number]>[]>(() => {
    const base: Column<(typeof rows)[number]>[] = [
      { key: 'day', header: t('mill.col.day', 'التاريخ'), cell: (row) => fmtDay(row.producedOn) },
      {
        key: 'doc',
        header: t('mill.col.doc', 'المستند'),
        cell: (row) => (
          <Link to={`/mill/batch/${row.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200" data-action="open-batch">
            <Num>{row.docNo ?? dash()}</Num>
          </Link>
        ),
      },
      { key: 'recipe', header: t('mill.col.recipe', 'الخلطة'), wrap: true, cell: (row) => row.recipeName },
      { key: 'item', header: t('mill.col.item', 'الناتج'), wrap: true, cell: (row) => row.outputItemName },
      { key: 'qty', header: t('mill.col.qty', 'الكمية (كغم)'), kind: 'number', cell: (row) => <Num>{fmtQtyCell(row.outputQtyKg, qtyDecimals)}</Num> },
      { key: 'status', header: t('mill.col.status', 'الحالة'), cell: (row) => (row.status === 'void' ? t('mill.status.void', 'ملغاة') : t('mill.status.posted', 'مرحَّلة')) },
    ];
    if (!costShown) return base;
    return [
      ...base,
      { key: 'cost', header: t('mill.col.cost', 'كلفة الكيلو'), kind: 'number', cell: (row) => <Num>{row.costPerKg === null ? dash() : fmtMoney(row.costPerKg)}</Num> },
      { key: 'total', header: t('mill.col.total', 'كلفة الدفعة'), kind: 'number', cell: (row) => <Num>{row.totalValue === null ? dash() : fmtMoney(row.totalValue)}</Num> },
    ];
  }, [costShown, qtyDecimals]);

  if (error) return <LoadFailed what={t('nav.mill', 'معمل العلف')} error={error} onRetry={retry} />;

  const newRecipe = () => navigate('/mill/new');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('nav.mill', 'معمل العلف')}
        subtitle={t('mill.subtitle', 'خلطاتك الثابتة: اضغط «أنتج» فتُسحب موادّها بالكميات التي حدّدتها ويدخل العلف مخزنه.')}
        actions={
          canRecipe ? (
            <Button variant="secondary" icon={<Plus className="size-5" aria-hidden="true" />} onClick={newRecipe} data-action="add-recipe">
              {t('mill.add_recipe', 'خلطة جديدة')}
            </Button>
          ) : undefined
        }
      />

      <Link to="/inventory/mill" className="card flex items-center gap-2 p-4 font-medium text-brand-700 hover:bg-surface-2 dark:text-brand-200" data-action="open-division-stores">
        <Warehouse aria-hidden="true" className="size-5" />
        {t('mill.stores', 'مخازن المعمل: المواد الأوّلية والعلف')}
      </Link>

      {loading ? <p className="text-sm text-ink-muted">{t('common.loading', 'جارٍ التحميل…')}</p> : null}

      {data?.productions.drafts.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('mill.drafts.title', 'دفعات قيد العمل')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.productions.drafts.map((draft) => (
              <li key={draft.id}>
                <Link to={`/mill/batch/${draft.id}`} className="card flex items-center justify-between gap-3 p-4 hover:bg-surface-2" data-action="open-draft">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{draft.recipeName}</span>
                    <span className="block truncate text-sm text-ink-muted">{t('mill.drafts.planned', 'المخطّط: {qty}', { qty: fmtQty(draft.plannedKg, 'kg').main })}</span>
                  </span>
                  <span className="shrink-0 text-sm text-ink-muted">{fmtDay(draft.producedOn)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data && !data.recipes.length ? (
        <Notice
          tone="info"
          title={t('mill.empty.title', 'لا توجد خلطة بعد.')}
          action={
            canRecipe ? (
              <Button icon={<Plus className="size-5" aria-hidden="true" />} onClick={newRecipe} data-action="first-recipe">
                {t('mill.empty.action', 'أنشئ أوّل خلطة')}
              </Button>
            ) : undefined
          }
        >
          {t('mill.empty.detail', 'الخلطة تشكيلة ثابتة: مواد بكميات محدّدة لكلّ ألف كيلوغرام، تعطي مادّة علف واحدة. أنشئ خلطة وأضف موادّها ثم فعّلها.')}
        </Notice>
      ) : null}

      {data?.recipes.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('mill.recipes.title', 'الخلطات')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.recipes.map((recipe) => (
              <li key={recipe.id}>
                <RecipeCardView recipe={recipe} canProduce={canDraft && recipe.activeId !== null} onProduce={() => setProducing(recipe)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('mill.batches.title', 'آخر الدفعات')}</h2>
          <DataTable caption={t('mill.batches.caption', 'دفعات الإنتاج المرحَّلة والملغاة')} columns={columns} rows={rows} rowKey={(row) => row.id} empty={t('mill.batches.empty', 'لا دفعات بعد.')} />
        </section>
      ) : null}

      {producing ? <ProduceDialog recipe={producing} stores={data?.stores ?? []} today={data?.today ?? ''} onClose={() => setProducing(null)} /> : null}
    </div>
  );
}
