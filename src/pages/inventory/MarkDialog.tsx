import { Check } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { decimalText } from '../../domain/decimal';
import type { Milli } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { parseQty, type BaseUnit } from '../../domain/units';
import { describeError, RejectedError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { loadItemMark, MARK_COLORS, setItemColor, setItemLow, type ItemMark, type MarkColor, type StoreColors } from '../../lib/repo/storeMarks';
import { baseUnitLabel } from '../../lib/storeLabels';
import { colorName, MARK_LOOK } from './markColors';
import { baseQty } from './simple-shared';

// لون المادّة وحدّ قلّتها (0037، كلمة الزبون 2026-11-26: «أدوس عليها تتأشر أصفر، أي لون أريد»، وجواب المالك: اللون «يبقى حتى يشيله»، والقلّة
// «حدّ لكلّ مادّة»). لمسة على لون تحفظه وتغلق النافذة (لمستان من الجدول: الزرّ ثمّ اللون)، و«بلا لون» يشيله. والحدّ بوحدة أساس المادّة يُحفظ بزرّه.
// كلّ كتابة بشرط النسخة التي عرضتها النافذة (basis: صفّ المادّة كما رآه حين فتحها)، وmark_changed يقرأ لون المادّة الآن (item_mark) ويعرضه
// ويُبقي ما كتبه؛ والنتيجة المجهولة تُعاد بالطلب نفسه (اللون أو الحدّ نفسه الآن نجاح بلا كتابة بالخادم).

/** الكمية نصّاً للخانة: بلا فواصل ولا أصفار زائدة («5» لا «5.000»). */
export function qtyInputText(qty: Milli): string {
  const text = decimalText(qty, 3);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
}

/** الحدّ من الخانة: فارغ = بلا حدّ، وإلّا رقم أكبر من صفر (والمعدود عدد صحيح)، أو سبب رفضه. */
export function lowFromText(text: string, unit: BaseUnit): { ok: true; qty: Milli | null } | { ok: false; problem: string } {
  if (text.trim() === '') return { ok: true, qty: null };
  const qty = parseQty(text);
  if (qty === null) return { ok: false, problem: t('qty.invalid_format', 'اكتب رقماً بنقطة عشرية (0.5) حتى ثلاث مراتب، والفاصلة بين كل ثلاثة أرقام فقط (1,250)') };
  if (qty <= 0n) return { ok: false, problem: t('mark.low.positive', 'الحدّ أكبر من صفر. اتركه فارغاً لتزيله.') };
  if (unit === 'pc' && qty % 1000n !== 0n) return { ok: false, problem: t('qty.pieces_whole', 'يجب أن يكون عدد القطع صحيحاً') };
  return { ok: true, qty };
}

export type MarkRequest = { kind: 'color'; color: MarkColor | null } | { kind: 'low'; qty: Milli | null };
type Request = MarkRequest;

/** جملة ما حُفظ من جواب الخادم: اللون أو الحدّ، وُضع أو أُزيل. */
export function markSavedText(item: MarkTarget, mark: ItemMark | null, request: MarkRequest): string {
  if (request.kind === 'color') {
    return mark?.color
      ? t('dayb.mark.saved', 'لُوّنت «{item}»: {color}.', { item: item.name, color: colorName(mark.color) })
      : t('dayb.mark.cleared', 'أُزيل لون «{item}».', { item: item.name });
  }
  return mark?.lowQty != null
    ? t('dayb.low.saved', 'حُفظ حدّ قلّة «{item}»: {qty}.', { item: item.name, qty: baseQty(mark.lowQty, item.baseUnit) })
    : t('dayb.low.cleared', 'أُزيل حدّ قلّة «{item}».', { item: item.name });
}

export interface MarkTarget {
  id: string;
  name: string;
  baseUnit: BaseUnit;
}

export function MarkDialog({
  item,
  shown,
  colors,
  onClose,
  onSaved,
}: {
  item: MarkTarget;
  /** لون المادّة وحدّها كما عرضتها الشاشة حين فُتحت النافذة. */
  shown: ItemMark | null;
  colors: StoreColors;
  /** uncertain: نتيجة طلب مجهولة (لعلّه حُفظ)، فالشاشة تقرأ من جديد. */
  onClose: (uncertain: boolean) => void;
  onSaved: (mark: ItemMark | null, request: Request) => void;
}) {
  const id = useId();
  const [basis, setBasis] = useState<ItemMark | null>(shown);
  const [lowText, setLowText] = useState(shown?.lowQty != null ? qtyInputText(shown.lowQty) : '');
  const [busy, setBusy] = useState<Request | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<Request | null>(null);
  const [lowProblem, setLowProblem] = useState<string | null>(null);
  /** after-change: قُرئ اللون من جديد بعد mark_changed؛ reading: القراءة جارية؛ failed: فشلت فلا حفظ بنسخة لم تُقرأ. */
  const [reread, setReread] = useState<'reading' | 'failed' | 'done' | null>(null);
  const [gone, setGone] = useState(false);
  const locked = busy !== null || reread === 'reading' || reread === 'failed' || gone;
  const savedLow = basis?.lowQty != null ? qtyInputText(basis.lowQty) : '';

  const refresh = async () => {
    setReread('reading');
    try {
      const fresh = await loadItemMark(item.id);
      setBasis(fresh.mark);
      setReread('done');
    } catch {
      setReread('failed');
    }
  };

  const send = async (request: Request) => {
    if (busy !== null || gone) return;
    setBusy(request);
    setFailure(null);
    try {
      const version = basis?.version ?? 0;
      const result = request.kind === 'color' ? await setItemColor(item.id, request.color, version) : await setItemLow(item.id, request.qty, version);
      setUnknown(null);
      setBusy(null);
      onSaved(result.mark, request);
    } catch (problem) {
      setBusy(null);
      if (problem instanceof RejectedError) {
        setUnknown(null);
        setFailure(problem.hint ?? describeError(problem, 'write').title);
        if (problem.code === 'mark_changed') void refresh();
        if (problem.code === 'item_not_found') setGone(true);
      } else {
        setUnknown(request);
        setFailure(t('mark.unknown', 'لا نعرف إن حُفظ: أعد المحاولة، ولن يُكتب شيء مرّتين.'));
      }
    }
  };

  const saveLow = (event: FormEvent) => {
    event.preventDefault();
    const parsed = lowFromText(lowText, item.baseUnit);
    if (!parsed.ok) {
      setLowProblem(parsed.problem);
      return;
    }
    setLowProblem(null);
    void send({ kind: 'low', qty: parsed.qty });
  };

  const current = basis?.color ?? null;
  const unit = baseUnitLabel(item.baseUnit);
  const formId = `${id}-low`;
  const choices: readonly (MarkColor | null)[] = [...MARK_COLORS, null];
  return (
    <Dialog
      open
      onClose={() => onClose(unknown !== null)}
      dirty={lowText !== savedLow || unknown !== null}
      locked={busy !== null}
      title={t('mark.title', 'لون «{item}»', { item: item.name })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onClose(unknown !== null)} disabled={busy !== null} data-action="mark-close">
            {t('mark.close', 'أغلق')}
          </Button>
          {unknown ? (
            <Button onClick={() => void send(unknown)} busy={busy !== null} disabled={locked} data-action="mark-retry">
              {t('mark.retry', 'أعد المحاولة')}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-5" data-action="mark-dialog" data-id={item.id}>
        {failure ? <Notice tone={unknown ? 'warning' : 'danger'} title={failure} /> : null}
        {reread === 'done' ? (
          <p role="status" className="text-sm text-ink-muted" data-action="mark-reread">
            {current
              ? t('mark.now', 'لونها الآن «{color}». اختر من جديد.', { color: colorName(current) })
              : t('mark.now_none', 'لا لون لها الآن. اختر من جديد.')}
          </p>
        ) : null}
        {reread === 'failed' ? (
          <Notice
            tone="warning"
            title={t('mark.reread_failed', 'تعذّرت قراءة لونها الآن، فلا حفظ قبل أن تُقرأ.')}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refresh()} data-action="mark-reread-retry">
                {t('dayb.reread', 'أعد القراءة')}
              </Button>
            }
          />
        ) : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('mark.color', 'اللون')}</legend>
          <div role="radiogroup" aria-label={t('mark.color', 'اللون')} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {choices.map((color) => {
              const selected = color === current;
              const sending = busy?.kind === 'color' && busy.color === color;
              return (
                <button
                  key={color ?? 'none'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={locked}
                  onClick={() => {
                    if (!selected) void send({ kind: 'color', color });
                  }}
                  className={`flex h-14 items-center gap-2 rounded-2xl border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                    selected ? 'border-brand-500 bg-surface-2' : 'border-line hover:bg-surface-2'
                  }`}
                  data-action="mark-color"
                  data-color={color ?? 'none'}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line"
                    style={color ? { backgroundColor: MARK_LOOK[color].solid } : undefined}
                  >
                    {selected ? <Check className="size-4" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{sending ? t('mark.saving', 'جارٍ الحفظ…') : color ? colorName(color) : t('mark.none', 'بلا لون')}</span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-ink-muted">{t('mark.color.hint', 'اللون يبقى على المادّة في كلّ الأيام حتى تزيله بـ«بلا لون».')}</p>
        </fieldset>
        <form id={formId} className="flex flex-col gap-2" onSubmit={saveLow} noValidate>
          <Field
            id={`${id}-qty`}
            label={t('mark.low', 'حدّ القلّة ({unit})', { unit })}
            error={lowProblem}
            hint={
              colors.auto
                ? t('mark.low.hint_auto', 'حين يصل رصيدها إليه أو أقلّ تُعدّ قليلة وتتلوّن بلون القلّة. اتركه فارغاً لتزيله.')
                : t('mark.low.hint', 'حين يصل رصيدها إليه أو أقلّ تُعدّ قليلة. شغّل «لوّن تلقائيّاً» من «ألوان الرصيد» لتتلوّن وحدها. اتركه فارغاً لتزيله.')
            }
          >
            <div className="flex items-stretch gap-2">
              <input
                id={`${id}-qty`}
                inputMode="decimal"
                autoComplete="off"
                dir="ltr"
                className="input min-w-0 flex-1 text-end tabular-nums"
                value={lowText}
                disabled={locked}
                aria-invalid={lowProblem !== null || undefined}
                onChange={(event) => {
                  setLowProblem(null);
                  setLowText(toWesternDigits(event.target.value));
                }}
                data-action="mark-low"
              />
              <Button type="submit" variant="secondary" busy={busy?.kind === 'low'} disabled={locked || lowText === savedLow} data-action="mark-low-save">
                {t('mark.low.save', 'احفظ الحدّ')}
              </Button>
            </div>
          </Field>
          {basis?.lowQty != null ? (
            <p className="text-sm text-ink-muted" data-action="mark-low-now">
              {t('mark.low.now', 'الحدّ المحفوظ: {qty}', { qty: baseQty(basis.lowQty, item.baseUnit) })}
            </p>
          ) : null}
        </form>
      </div>
    </Dialog>
  );
}
